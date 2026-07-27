/**
 * 三派合参核心：把飞星、八宅、山向奇门、缺角、流年五个层面，
 * 归并成每一宫的一个可解释评分与一组可执行化解。
 *
 * 铁律：本模块只做**确定性加权**。所有星位数字来自 core-fengshui / core-qimen，
 * 所有断语来自查表，权重全部写死在下方常量里并对外暴露（breakdown），
 * 任何人都能复算出同一个数。LLM 只负责把这些结论写成通顺中文。
 */

import {
  BUILDING_PROFILES,
  GENERATES,
  MATERIAL_BY_WUXING,
  OUTER_PALACES,
  PALACE_DIRECTION,
  PALACE_FAMILY,
  PALACE_INDEXES,
  ROOM_PRIORITY,
  STAR_META,
  STAR_NAME,
  STAR_WUXING,
  YOU_NIAN_META,
  annualPlate,
  annualStar,
  assessMissingCorner,
  buildFlyingStarChart,
  buildHouseBaZhai,
  deriveCombination,
  floorAdjustment,
  missingAt,
  monthlyPlate,
  periodOfYear,
  profileCompleteness,
  reverseGenerate,
  roomsInPalace,
  starPhase,
  starScore,
  type PalaceIndex,
  type RiskDomain,
  type WuXing,
} from '@hidefate/core-fengshui';
import {
  RISK_ORDER,
  riskLevelOf,
  type AnalysisInput,
  type AppliedCure,
  type ConfidenceLevel,
  type Cure,
  type Finding,
  type PalaceAssessment,
  type School,
  type SynthesisResult,
} from './types.js';

/**
 * 各派权重。当某派未启用（如未开奇门层），其权重按比例分摊给其余各派，
 * 保证总权重恒为 1 —— 关掉奇门不会让整体评分整体偏移。
 */
export const SCHOOL_WEIGHTS = {
  玄空飞星: 0.42,
  八宅: 0.22,
  流年: 0.22,
  山向奇门: 0.14,
} as const;

/** 缺角是独立负项，不参与加权平均（缺角不会因为飞星吉就被抵销）。 */
export const MISSING_CORNER_WEIGHT = 1.0;

/** 年星入宫的固有吉凶（紫白流年通则）。 */
function annualStarImpact(star: PalaceIndex, period: PalaceIndex): number {
  return starScore(star, period);
}

/**
 * 流年星与本宫山向星的叠临关系。
 * 「年星 + 本宫同星」为叠临，凶星叠临加倍为患，吉星叠临加倍得力。
 */
function annualOverlay(
  annual: PalaceIndex,
  shan: PalaceIndex,
  xiang: PalaceIndex,
  period: PalaceIndex,
): { delta: number; notes: string[] } {
  const notes: string[] = [];
  let delta = 0;
  for (const [label, s] of [['山星', shan], ['向星', xiang]] as const) {
    if (s !== annual) continue;
    const base = starScore(annual, period);
    delta += base * 0.6;
    notes.push(
      base < 0
        ? `流年${STAR_NAME[annual]}与本宫${label}${STAR_NAME[s]}叠临，凶性加倍，为今年此方最需处理之处。`
        : `流年${STAR_NAME[annual]}与本宫${label}${STAR_NAME[s]}叠临，吉气加倍，宜趁今年在此方布局。`,
    );
  }
  // 流年星与本宫五黄/二黑的五行生克。
  // 「五黄最忌火来生」—— 九紫属火，火生土，正是替五黄添薪；二黑同理。
  // 反之流年六白七赤属金，金泄土，为天然的解药，应据实减轻而非一味加重。
  const annualWx = STAR_WUXING[annual];
  for (const [label, s] of [['山星', shan], ['向星', xiang]] as const) {
    if (s !== 5 && s !== 2) continue;
    const shaWx = STAR_WUXING[s]; // 五黄二黑俱属土
    if (GENERATES[annualWx] === shaWx) {
      delta -= s === 5 ? 0.3 : 0.22;
      notes.push(
        `流年${STAR_NAME[annual]}属${annualWx}，${annualWx}生${shaWx}，正助本宫${label}${STAR_NAME[s]}之凶 ——` +
        `${s === 5 ? '「五黄最忌火来生」，今年此方尤须静置，切忌红色、明火与强光。' : '病符得生，今年慢性病与妇疾之应加重。'}`,
      );
    } else if (GENERATES[shaWx] === annualWx) {
      delta += 0.12;
      notes.push(
        `流年${STAR_NAME[annual]}属${annualWx}，${shaWx}生${annualWx}，恰好泄去本宫${label}${STAR_NAME[s]}之土气，` +
        `今年凶性有所收敛，宜趁此年加强金属类化解物。`,
      );
    }
  }

  // 二五同现（无论谁是年星）为古法明列之大忌
  const trio = [annual, shan, xiang];
  if (trio.includes(2) && trio.includes(5)) {
    delta -= 0.35;
    notes.push('本宫今年二黑与五黄并见，《飞星赋》「二五交加，罹死亡并生疾病」，属全屋最须回避之方。');
  }
  if (trio.filter((s) => s === 5).length >= 2) {
    delta -= 0.3;
    notes.push('五黄重叠，正关煞加倍，今年此方切忌动土、装修、久坐。');
  }
  return { delta, notes };
}

/**
 * 五黄 / 二黑 的独立煞气扣分。
 *
 * 与「双星平均」分开计算，理由见调用处注释：这两颗是古法明列的独立煞，
 * 同宫另有吉星只能「泄化」不能「抵销」。当运时凶性收敛，故按旺衰缩放。
 */
function calcShaPenalty(stars: readonly PalaceIndex[], period: PalaceIndex): { value: number; notes: string[] } {
  const notes: string[] = [];
  let value = 0;
  for (const s of stars) {
    if (s !== 5 && s !== 2) continue;
    const phase = starPhase(s, period);
    // 当旺时收敛（0.12），失令时全开（五黄 0.42、二黑 0.30）
    const prosperous = phase === '当旺' || phase === '生气';
    const base = s === 5 ? (prosperous ? 0.16 : 0.42) : prosperous ? 0.12 : 0.3;
    value += base;
    notes.push(
      s === 5
        ? `见五黄（${phase}），正关煞独立为患${prosperous ? '（当令故稍敛）' : ''}`
        : `见二黑（${phase}），病符独立为患${prosperous ? '（当令故稍敛）' : ''}`,
    );
  }
  return { value: Math.min(0.7, value), notes };
}

/** 已施化解对某宫的减险效果。 */
function cureRelief(palace: PalaceIndex, applied: readonly AppliedCure[], hostileWuXing: WuXing[]): {
  relief: number;
  notes: string[];
} {
  const here = applied.filter((c) => c.palace === palace);
  if (here.length === 0) return { relief: 0, notes: [] };
  let relief = 0;
  const notes: string[] = [];
  for (const c of here) {
    // 化解物必须「泄」掉为患之五行才算数：泄者，凶星所生之五行。
    const effective = hostileWuXing.some((w) => c.wuXing === (({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' } as const)[w]));
    // 用户回馈会覆盖理论判断 —— 真实反馈优先于纸上推演。
    const feedbackFactor =
      c.effectiveness === '明显改善' ? 1.0
        : c.effectiveness === '略有改善' ? 0.6
          : c.effectiveness === '无变化' ? 0.15
            : c.effectiveness === '反而更差' ? -0.3
              : effective ? 0.7 : 0.2;
    const gain = 0.25 * feedbackFactor;
    relief += gain;
    notes.push(
      `已於${PALACE_DIRECTION[palace]}施「${c.item}」（${c.wuXing}，${c.appliedOn}）` +
      (c.effectiveness && c.effectiveness !== '未评价'
        ? `，用户回馈「${c.effectiveness}」，据此${gain >= 0 ? '下调' : '上调'}风险 ${Math.abs(gain * 100).toFixed(0)}%。`
        : effective
          ? `，五行泄化对路，暂按理论减险 ${(gain * 100).toFixed(0)}%（待回馈校准）。`
          : `，但该五行未能泄化本宫为患之气，减险有限（${(gain * 100).toFixed(0)}%），建议改用${hostileWuXing.map((w) => MATERIAL_BY_WUXING[({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' } as const)[w]][0]).join('或')}。`),
    );
  }
  return { relief: Math.max(-0.3, Math.min(0.6, relief)), notes };
}

function levelUp(a: ConfidenceLevel, schools: number, dataScore: number): ConfidenceLevel {
  // 多派同证 + 建档完整 → 提升；单派孤证或资料残缺 → 下调。
  const base = schools >= 3 ? 2 : schools === 2 ? 1 : 0;
  const adj = dataScore >= 0.8 ? 1 : dataScore >= 0.5 ? 0 : -1;
  const total = base + adj + (a === '高' ? 1 : a === '中' ? 0 : -1);
  return total >= 2 ? '高' : total >= 0 ? '中' : '低';
}

/** 主入口：三派合参。 */
export function synthesise(input: AnalysisInput): SynthesisResult {
  const { profile, year, monthIndex, qiMen } = input;
  const applied = input.appliedCures ?? [];

  // ---- 1. 三派排盘 ----
  const flyingStar = buildFlyingStarChart({
    sitting: profile.sitting,
    facing: profile.facing,
    period: profile.period,
    moveInYear: profile.moveInYear,
  });
  const baZhai = buildHouseBaZhai(profile.sitting);
  const period = flyingStar.period.period;
  const yearPlate = annualPlate(year);
  const monthPlate = monthIndex != null ? monthlyPlate(year, monthIndex) : null;
  const qiMenEnabled = Boolean(profile.enableQiMen && qiMen);

  const buildingProfile = BUILDING_PROFILES[profile.buildingType];
  const floorAdj = floorAdjustment(profile.floor ?? 1, profile.buildingType);
  const completeness = profileCompleteness(profile);

  // 权重归一（未启用奇门则其权重分摊给其余三派）
  const activeWeights: Record<'玄空飞星' | '八宅' | '流年' | '山向奇门', number> = {
    玄空飞星: SCHOOL_WEIGHTS.玄空飞星,
    八宅: SCHOOL_WEIGHTS.八宅,
    流年: SCHOOL_WEIGHTS.流年,
    山向奇门: qiMenEnabled ? SCHOOL_WEIGHTS.山向奇门 : 0,
  };
  const wSum = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  (Object.keys(activeWeights) as (keyof typeof activeWeights)[]).forEach((k) => {
    activeWeights[k] = activeWeights[k] / wSum;
  });

  // ---- 2. 逐宫评估 ----
  const palaces = {} as Record<PalaceIndex, PalaceAssessment>;
  for (const p of PALACE_INDEXES) {
    palaces[p] = assessPalace(p);
  }

  function assessPalace(p: PalaceIndex): PalaceAssessment {
    const stars = flyingStar.palaces[p];
    const annual = yearPlate[p];
    const monthly = monthPlate ? monthPlate[p] : null;
    const rooms = roomsInPalace(profile, p);
    const mc = missingAt(profile, p);
    const mcImpact = mc ? assessMissingCorner(mc) : null;

    const findings: Finding[] = [];
    const breakdownSchools: School[] = [];

    // --- 玄空飞星 ---
    const combo = deriveCombination(stars.shan, stars.xiang, period);
    const comboImpact = (combo.nature === '吉' ? 1 : combo.nature === '凶' ? -1 : 0) * combo.magnitude;
    // 山星主丁、向星主财，分别乘楼层系数
    const shanS = starScore(stars.shan, period) * floorAdj.shanStarFactor;
    const xiangS = starScore(stars.xiang, period) * floorAdj.xiangStarFactor;
    // 五黄、二黑为古法明列之独立煞：「五黄正煞，不拘临方到向，人口常损」。
    // 它们**不可**被同宫的吉星平均掉 —— 若只取双星均值，五黄配一白会算出「吉方」，
    // 与实务完全相反。故此处比照缺角，另立一项独立扣分，不参与平均。
    const shaPenalty = calcShaPenalty([stars.shan, stars.xiang], period);
    const fsScore = clamp(comboImpact * 0.6 + ((shanS + xiangS) / 2) * 0.4 - shaPenalty.value);
    breakdownSchools.push('玄空飞星');
    if (shaPenalty.value > 0) {
      findings.push({
        schools: ['玄空飞星'],
        confidence: '高',
        statement: `${PALACE_DIRECTION[p]}${shaPenalty.notes.join('；')}。此项为独立煞气扣分，不与同宫吉星相抵。`,
        principle: '《紫白诀》：「五黄正煞，不拘临方到向，人口常损。」二黑病符同理 —— 二者为独立之煞，不因同宫另一星得令而消解，只可泄化，不可相抵。',
        impact: -shaPenalty.value,
        domains: ['健康', '意外'],
      });
    }
    findings.push({
      schools: ['玄空飞星'],
      confidence: '高',
      statement:
        `${PALACE_DIRECTION[p]}山星${STAR_NAME[stars.shan]}、向星${STAR_NAME[stars.xiang]}、运星${STAR_NAME[stars.yun]}，成「${combo.name}」。${combo.meaning}`,
      principle: combo.classical,
      impact: fsScore,
      domains: combo.domains,
    });
    if (floorAdj.floor > 3 && buildingProfile.category === '住宅') {
      findings.push({
        schools: ['玄空飞星'],
        confidence: '中',
        statement: floorAdj.note,
        principle: '山星根于地气、向星根于空中来气；楼层愈高则地气愈薄，故山星力减而向星力增。',
        impact: 0,
        domains: ['健康', '财运'],
      });
    }

    // --- 八宅 ---
    const bzStar = p === 5 ? null : baZhai.plate[p as Exclude<PalaceIndex, 5>];
    let bzScore = 0;
    if (bzStar) {
      const meta = YOU_NIAN_META[bzStar];
      bzScore = meta.power / 3;
      breakdownSchools.push('八宅');
      findings.push({
        schools: ['八宅'],
        confidence: '高',
        statement: `${baZhai.houseGua}宅之${PALACE_DIRECTION[p]}为「${bzStar}」方（${meta.alias}·${meta.wuXing}），主${meta.governs}。${meta.summary}`,
        principle: `大游年歌：以坐山所属卦宫为宅卦，依翻卦掌次第布八星；${bzStar}为四${meta.auspicious ? '吉' : '凶'}之一。`,
        impact: bzScore,
        domains: meta.auspicious ? ['事业', '财运'] : ['健康', '感情'],
      });
    }

    // --- 流年（含流月）---
    const annualBase = annualStarImpact(annual, period);
    const overlay = annualOverlay(annual, stars.shan, stars.xiang, period);
    const yearScore = clamp(annualBase * 0.6 + overlay.delta);
    breakdownSchools.push('玄空飞星');
    findings.push({
      schools: ['玄空飞星'],
      confidence: '高',
      statement:
        `${year} 年流年${STAR_NAME[annual]}飞临${PALACE_DIRECTION[p]}（${starPhase(annual, period)}）。` +
        (overlay.notes.length ? overlay.notes.join('') : STAR_META[annual].whenDeclining && annualBase < 0 ? `${STAR_META[annual].whenDeclining}。` : `${STAR_META[annual].whenProsperous}。`),
      principle: '紫白流年：上元甲子（1864）一白入中，逐年退一，年星入中顺飞九宫。',
      impact: yearScore,
      domains: STAR_META[annual].riskDomains,
    });
    if (monthly != null) {
      const mScore = starScore(monthly, period);
      findings.push({
        schools: ['玄空飞星'],
        confidence: '中',
        statement: `本月流月${STAR_NAME[monthly]}加临${PALACE_DIRECTION[p]}，${mScore < -0.3 ? '短期风险抬升，宜在本月内完成化解' : mScore > 0.3 ? '短期吉气可用，宜把握本月推进' : '影响平缓'}。`,
        principle: '流月紫白：子午卯酉年正月八白入中，辰戌丑未年正月五黄入中，寅申巳亥年正月二黑入中，逐月退一。',
        impact: mScore * 0.4,
        domains: STAR_META[monthly].riskDomains,
      });
    }

    // --- 山向奇门 ---
    let qmScore = 0;
    let qmCell: PalaceAssessment['qiMen'] = null;
    if (qiMenEnabled && qiMen) {
      const o = qiMen.palaces[p];
      if (o) {
        qmScore = o.score;
        qmCell = { xing: o.xing, men: o.men, shen: o.shen, score: o.score, verdict: o.verdictText };
        breakdownSchools.push('山向奇门');
        findings.push({
          schools: ['山向奇门'],
          confidence: '中',
          statement:
            p === 5
              ? `中宫寄出，奇门以八方论，此宫不布星门神。`
              : `${PALACE_DIRECTION[p]}临${o.xing}星、${o.men}、${o.shen}，判为${o.verdictText}。` +
                (o.advice.length ? o.advice.join('') : ''),
          principle: `山向奇门以坐山定局（${qiMen.ju.label}）；八门主人事进退、九星主气机、八神主吉凶助力。`,
          impact: qmScore,
          domains: o.score < 0 ? ['意外', '事业'] : ['事业', '财运'],
        });
      }
    }

    // --- 缺角 ---
    let mcPenalty = 0;
    if (mcImpact) {
      mcPenalty = mcImpact.riskAdd * MISSING_CORNER_WEIGHT;
      breakdownSchools.push('形峦缺角');
      findings.push({
        schools: ['形峦缺角'],
        confidence: mcImpact.significant ? '高' : '低',
        statement: mcImpact.summary,
        principle: `后天八卦定人物：${PALACE_DIRECTION[p]}属${PALACE_FAMILY[p].member}位，主${PALACE_FAMILY[p].organ}；宫位残缺则该房人事无靠。缺三分之一以上方论正式缺角。`,
        impact: -mcPenalty,
        domains: ['健康', '人丁'],
      });
    }

    // --- 加权合成 ---
    const weighted =
      fsScore * activeWeights.玄空飞星 +
      bzScore * activeWeights.八宅 +
      yearScore * activeWeights.流年 +
      qmScore * activeWeights.山向奇门;

    // 化解减险：先算出「为患之五行」
    const hostile: WuXing[] = [];
    for (const s of [stars.shan, stars.xiang, annual]) {
      if (starScore(s, period) < -0.2) hostile.push(STAR_WUXING[s]);
    }
    const { relief, notes: reliefNotes } = cureRelief(p, applied, hostile);
    for (const n of reliefNotes) {
      findings.push({
        schools: ['玄空飞星'],
        confidence: '中',
        statement: n,
        principle: '化解以「泄」为上、「克」为次：凶星所属五行，取其所生之五行泄之，则凶气有出路而不反激。',
        impact: relief,
        domains: ['健康', '财运'],
      });
    }

    const rawScore = weighted - mcPenalty + (weighted < 0 ? relief * Math.abs(weighted) : 0);
    const score = clamp(rawScore);

    const cures = buildCures(p, {
      combo,
      stars: { ...stars, annual },
      period,
      bzStar,
      mcImpact,
      qmAdvice: qiMenEnabled && qiMen ? (qiMen.palaces[p]?.advice ?? []) : [],
      rooms,
      score,
      hostile,
    });

    const dedupSchools = Array.from(new Set(breakdownSchools));
    return {
      palace: p,
      direction: PALACE_DIRECTION[p],
      rooms,
      stars: { yun: stars.yun, shan: stars.shan, xiang: stars.xiang, annual, monthly },
      combinationName: combo.name,
      baZhaiStar: bzStar,
      qiMen: qmCell,
      missing: mcImpact ? { severity: mcImpact.severity, summary: mcImpact.summary } : null,
      score,
      riskLevel: riskLevelOf(score),
      findings: findings.map((f) => ({
        ...f,
        confidence: levelUp(f.confidence, dedupSchools.length, completeness.score),
      })),
      cures,
    };
  }

  // ---- 3. 整体 ----
  // 全屋综合分：八方按房间权重加权（有主要房间的宫位更能代表实际居住体验），中宫单列。
  let numer = 0;
  let denom = 0;
  for (const p of OUTER_PALACES) {
    const a = palaces[p];
    const roomW = a.rooms.length
      ? Math.max(...a.rooms.map((r) => ROOM_PRIORITY[r.kind]))
      : 0.35; // 未标注房间的宫位仍计入，但权重低
    numer += a.score * roomW;
    denom += roomW;
  }
  const centre = palaces[5];
  numer += centre.score * 0.4;
  denom += 0.4;
  const overallScore = clamp(denom === 0 ? 0 : numer / denom);

  const prioritisedCures = mergeCures(
    PALACE_INDEXES.flatMap((p) => palaces[p].cures),
  );

  const confReasons: string[] = [];
  let confScore = 0;
  confScore += qiMenEnabled ? 2 : 1;
  confReasons.push(qiMenEnabled ? '飞星、八宅、山向奇门三派同盘合参。' : '飞星与八宅两派合参（山向奇门层未启用）。');
  if (profile.entryMode === '罗盘实测') { confScore += 2; confReasons.push('坐向来自现场罗盘实测，方位可信度最高。'); }
  else if (profile.entryMode === '户型图') { confScore += 1; confReasons.push('依户型图建档，宫位划分较可靠；坐向准确度取决于测量。'); }
  else { confReasons.push('纯九宫格建档：宫位为均分近似，结论在方位层面成立，房间边界可能与实况有出入。'); }
  if (completeness.missing.length === 0) { confScore += 1; confReasons.push('关键房间（大门/主卧/厨房）均已标注。'); }
  else confReasons.push(`建档尚缺：${completeness.missing.join('；')}。`);
  if (flyingStar.jianXiang.isJian) confReasons.push(`坐向为兼向（${flyingStar.jianXiang.label}），已起替卦；替卦一派说法不一，此盘按替星入中、阴阳依原山处理。`);
  const memberPrecision = input.members.map((m) => m.chart.confidence.factor);
  if (memberPrecision.length > 0) {
    const avg = memberPrecision.reduce((a, b) => a + b, 0) / memberPrecision.length;
    if (avg >= 0.9) { confScore += 1; confReasons.push('成员八字资料完整。'); }
    else confReasons.push(`部分成员八字残缺（平均可用度 ${(avg * 100).toFixed(0)}%），个人化结论已相应降级，命卦部分不受影响。`);
  }
  const confidence: { level: ConfidenceLevel; reasons: string[] } = {
    level: confScore >= 4 ? '高' : confScore >= 2 ? '中' : '低',
    reasons: confReasons,
  };

  const worst = [...OUTER_PALACES].sort((a, b) => palaces[a].score - palaces[b].score)[0]!;
  const best = [...OUTER_PALACES].sort((a, b) => palaces[b].score - palaces[a].score)[0]!;

  // 「最可借力」只在该宫确实为吉时才这么说。若全屋八方俱不佳，
  // 就如实说「相对最轻」—— 把最不坏的一方吹成吉方，是最容易误导人的一句话。
  const bestScore = palaces[best].score;
  const bestClause =
    bestScore >= 0.25
      ? `最可借力：${PALACE_DIRECTION[best]}（${palaces[best].combinationName}）。`
      : bestScore >= 0
        ? `八方之中相对较可用者为${PALACE_DIRECTION[best]}（${palaces[best].combinationName}），但吉气有限，不足以倚重。`
        : `须留意：今年八方综合评分俱为负，无一可称吉方；其中相对最轻者为${PALACE_DIRECTION[best]}（${palaces[best].combinationName}，${palaces[best].riskLevel}），亦仅堪权宜之用。`;

  const summary =
    `${profile.name}（${profile.buildingType}${profile.floor != null ? ` · ${profile.floor} 楼` : ''}）` +
    `坐${flyingStar.sitting.mountain.name}向${flyingStar.facing.mountain.name}，${flyingStar.period.label}，${flyingStar.pattern}；` +
    `八宅为${baZhai.label}。${year} 年流年${STAR_NAME[annualStar(year)]}入中。` +
    `全屋综合评级「${riskLevelOf(overallScore)}」。` +
    `最须优先处理：${PALACE_DIRECTION[worst]}（${palaces[worst].combinationName}，${palaces[worst].riskLevel}）。` +
    bestClause;

  return {
    year,
    profile,
    buildingType: profile.buildingType,
    flyingStar,
    baZhai,
    qiMenEnabled,
    palaces,
    predictions: [], // 由 predict.ts 填充
    overallScore,
    overallRisk: riskLevelOf(overallScore),
    prioritisedCures,
    confidence,
    summary,
  };
}

function clamp(n: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

interface CureContext {
  combo: ReturnType<typeof deriveCombination>;
  stars: { yun: PalaceIndex; shan: PalaceIndex; xiang: PalaceIndex; annual: PalaceIndex };
  period: PalaceIndex;
  bzStar: ReturnType<typeof buildHouseBaZhai>['plate'][1] | null;
  mcImpact: ReturnType<typeof assessMissingCorner> | null;
  qmAdvice: readonly string[];
  rooms: ReturnType<typeof roomsInPalace>;
  score: number;
  hostile: WuXing[];
}

/** 为单宫生成化解清单。 */
function buildCures(palace: PalaceIndex, ctx: CureContext): Cure[] {
  const dir = PALACE_DIRECTION[palace];
  const roomLabel = ctx.rooms.length
    ? ctx.rooms.map((r) => r.label ?? r.kind).join('、')
    : null;
  const urgency: Cure['urgency'] =
    ctx.score <= -0.7 ? '立即' : ctx.score <= -0.3 ? '本年内' : '可从容安排';
  const out: Cure[] = [];

  // 房间优先级决定基础优先序：大门 1、主卧 2、厨房 3…
  const roomWeight = ctx.rooms.length ? Math.max(...ctx.rooms.map((r) => ROOM_PRIORITY[r.kind])) : 0.3;
  const basePriority = Math.round((1 - ctx.score) * 5 - roomWeight * 3);

  if (ctx.score < 0.1) {
    ctx.combo.cures.forEach((action, i) => {
      out.push({
        priority: basePriority + i,
        palace,
        direction: dir,
        room: roomLabel,
        action,
        rationale: `${ctx.combo.name}：${ctx.combo.meaning}`,
        avoid: forbiddenFor(ctx.hostile),
        domains: ctx.combo.domains,
        urgency,
      });
    });
  }
  if (ctx.mcImpact?.significant) {
    ctx.mcImpact.cures.forEach((action, i) => {
      out.push({
        priority: basePriority + 1 + i,
        palace,
        direction: dir,
        room: roomLabel,
        action,
        rationale: ctx.mcImpact!.summary,
        avoid: [],
        domains: ['健康', '人丁'],
        urgency: '本年内',
      });
    });
  }
  if (starScore(ctx.stars.annual, ctx.period) < -0.3) {
    const wx = STAR_WUXING[ctx.stars.annual];
    const drain = ({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' } as const)[wx];
    out.push({
      priority: basePriority,
      palace,
      direction: dir,
      room: roomLabel,
      action: `今年${STAR_NAME[ctx.stars.annual]}到${dir}：置${MATERIAL_BY_WUXING[drain].slice(0, 2).join('或')}泄其气，此方全年忌动土、忌久坐、忌重装修。`,
      rationale: `${STAR_NAME[ctx.stars.annual]}属${wx}，${wx}生${drain}，以${drain}泄之则凶气有出路。`,
      avoid: MATERIAL_BY_WUXING[reverseGenerate(wx)].slice(0, 3),
      domains: STAR_META[ctx.stars.annual].riskDomains,
      urgency,
    });
  }
  if (ctx.bzStar && !YOU_NIAN_META[ctx.bzStar].auspicious && roomWeight >= 0.7) {
    out.push({
      priority: basePriority + 2,
      palace,
      direction: dir,
      room: roomLabel,
      action: `${dir}为宅之「${ctx.bzStar}」方，却安排了${roomLabel}：优先考虑与吉方房间对调；若无法对调，至少把床头/灶口/座向转朝本宅四吉方。`,
      rationale: `八宅论方不论星：${ctx.bzStar}主${YOU_NIAN_META[ctx.bzStar].governs}。房间挪不动时，「坐凶向吉」仍可挽回大半。`,
      avoid: [],
      domains: ['健康', '感情'],
      urgency,
    });
  }
  for (const a of ctx.qmAdvice) {
    out.push({
      priority: basePriority + 4,
      palace,
      direction: dir,
      room: roomLabel,
      action: a,
      rationale: '山向奇门以坐山定局，八门主人事进退，为飞星八宅之外的第三重印证。',
      avoid: [],
      domains: ['事业', '财运'],
      urgency: '可从容安排',
    });
  }
  return out;
}

function forbiddenFor(hostile: WuXing[]): string[] {
  const out = new Set<string>();
  for (const w of hostile) {
    for (const m of MATERIAL_BY_WUXING[reverseGenerate(w)].slice(0, 2)) out.add(m);
  }
  return [...out];
}

/** 合并同宫同类化解、重排优先级。 */
export function mergeCures(cures: readonly Cure[]): Cure[] {
  const seen = new Map<string, Cure>();
  for (const c of cures) {
    const key = `${c.palace}|${c.action}`;
    const prev = seen.get(key);
    if (!prev || c.priority < prev.priority) seen.set(key, c);
  }
  const urgencyRank: Record<Cure['urgency'], number> = { 立即: 0, 本年内: 1, 可从容安排: 2 };
  return [...seen.values()]
    .sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || a.priority - b.priority)
    .map((c, i) => ({ ...c, priority: i + 1 }));
}

/** 取风险最高的 N 宫。 */
export function worstPalaces(r: SynthesisResult, n = 3): PalaceAssessment[] {
  return [...OUTER_PALACES]
    .map((p) => r.palaces[p])
    .sort((a, b) => RISK_ORDER.indexOf(b.riskLevel) - RISK_ORDER.indexOf(a.riskLevel) || a.score - b.score)
    .slice(0, n);
}

/** 取最吉的 N 宫。 */
export function bestPalaces(r: SynthesisResult, n = 3): PalaceAssessment[] {
  return [...OUTER_PALACES].map((p) => r.palaces[p]).sort((a, b) => b.score - a.score).slice(0, n);
}

export { periodOfYear };
