/**
 * 峦头 × 理气 综合加权 —— 「峦头为体，理气为用」的算法落点。
 *
 *   综合分 = w_L × 峦头分 + w_Q × 理气分
 *   理气分 = a × 飞星分 + b × 八宅分 + c × 山向奇门分
 *
 * 默认权重（依规格）：
 *   居家 w_L=0.45 / w_Q=0.55；商业 w_L=0.35 / w_Q=0.65
 *   a=0.50、b=0.30、c=0.20；关闭奇门时 c=0 并重新归一化
 *
 * **否决机制**：理气分 > 0.7 而峦头修正 < −0.4 时，综合分强制不超过 0.1。
 * 这一条是整个算法的灵魂 —— 加权平均会让「好理气」把「大凶峦头」平均掉，
 * 而古法恰恰相反：「峦头差，理气无用」。故须以硬门槛把这条规矩写死，
 * 不能任由加权稀释。
 *
 * 未填外部环境时，峦头权重降至 0.15 并下调置信度 ——
 * 宁可说「我不知道」，也不假装峦头无碍。
 */

import {
  OUTER_PALACES,
  YOU_NIAN_META,
  scenarioProfile,
  scoreXingShi,
  starScore,
  type PalaceIndex,
  type Scenario,
  type XingShiItem,
  type XingShiScore,
} from '@hidefate/core-fengshui';
import type { ConfidenceLevel, SynthesisResult } from './types.js';

/** 理气三派权重。 */
export const QI_WEIGHTS = { feiXing: 0.5, baZhai: 0.3, qiMen: 0.2 } as const;

/** 未填峦头时的峦头权重。 */
export const UNASSESSED_LANDFORM_WEIGHT = 0.15;

/** 否决门槛。 */
export const VETO_QI_THRESHOLD = 0.7;
export const VETO_LANDFORM_THRESHOLD = -0.4;
export const VETO_CAP = 0.1;

export interface QiBreakdown {
  /** 飞星分（山向组合 + 旺衰，[-1,1]）。 */
  readonly feiXing: number;
  /** 八宅分（四吉四凶均值，[-1,1]）。 */
  readonly baZhai: number;
  /** 山向奇门分；未启用为 null。 */
  readonly qiMen: number | null;
  /** 实际所用权重（已按是否启用奇门归一化）。 */
  readonly weights: { feiXing: number; baZhai: number; qiMen: number };
  /** 理气总分 [-1,1]。 */
  readonly score: number;
}

export interface CompositeScore {
  readonly scenario: Scenario;
  /** 峦头分与其拆解。 */
  readonly landform: XingShiScore;
  readonly qi: QiBreakdown;
  /** 实际所用之峦头 / 理气权重。 */
  readonly weights: { landform: number; qi: number };
  /** 综合分 [-1,1]。 */
  readonly score: number;
  /** 否决是否触发。 */
  readonly veto: { triggered: boolean; reason: string | null };
  readonly confidence: ConfidenceLevel;
  readonly confidenceReasons: readonly string[];
  /** 逐项算式，供界面显示「为什么这样判断」。 */
  readonly breakdown: readonly { label: string; value: number; weight: number; contribution: number; note: string }[];
  readonly summary: string;
}

/**
 * 全宅飞星分。
 *
 * **不可用「八方均值」了事** —— 任何一张盘都是有吉有凶，八方一平均必然趋近于 0，
 * 结果「旺山旺向」与「上山下水」算出来只差零点几，且永远够不着否决门槛 0.7，
 * 使否决机制形同虚设。这是先前的实际缺陷。
 *
 * 改按堪舆家实际判断「理气好坏」的次序计分：
 *   1. 格局（旺山旺向 / 上山下水…）—— 这是纲，占四成半
 *   2. 当旺之星是否落在要位（大门与主要房间）—— 旺星不到要位，纵得好局亦虚，占三成半
 *   3. 八方吉凶均值 —— 作底，占两成
 */
function computeFeiXingScore(s: SynthesisResult): number {
  const period = s.flyingStar.period.period;

  // ── 1. 格局 ──
  const patternScore =
    s.flyingStar.pattern === '旺山旺向' ? 1.0
      : s.flyingStar.pattern === '双星会向' ? 0.6
        : s.flyingStar.pattern === '双星会坐' ? 0.4
          : s.flyingStar.pattern === '上山下水' ? -0.85
            : 0;

  // ── 2. 要位是否得旺 ──
  const keyKinds = new Set(['大门', '主卧', '收银台', '老板位', '灶位', '厨房', '办公位']);
  let keySum = 0;
  let keyN = 0;
  for (const p of OUTER_PALACES) {
    const a = s.palaces[p];
    if (!a.rooms.some((r) => keyKinds.has(r.kind))) continue;
    const gotProsperous =
      a.stars.xiang === period ? 1 : a.stars.shan === period ? 0.8 : 0;
    const shan = starScore(a.stars.shan, period);
    const xiang = starScore(a.stars.xiang, period);
    keySum += gotProsperous > 0 ? gotProsperous : (shan + xiang) / 2;
    keyN++;
  }
  // 未标注要位时，此项以格局分代之（不能因为没填房间就判成平庸）
  const keyScore = keyN > 0 ? keySum / keyN : patternScore;

  // ── 3. 八方均值作底 ──
  let sum = 0;
  let n = 0;
  for (const p of OUTER_PALACES) {
    const a = s.palaces[p];
    sum += (starScore(a.stars.shan, period) + starScore(a.stars.xiang, period)) / 2;
    n++;
  }
  const baseline = n ? sum / n : 0;

  return clamp(patternScore * 0.45 + keyScore * 0.35 + baseline * 0.2);
}

/**
 * 全宅八宅分。
 *
 * **不可取八方均值** —— 每一个宅卦都恰有四吉四凶（生气天医延年伏位 / 绝命五鬼六煞祸害），
 * 八方一平均，任何房子都得同一个常数 ≈ −0.04，此分毫无信息可言。这是先前的实际缺陷。
 *
 * 八宅之法，本就是看**要位落在四吉还是四凶**：
 * 大门、主卧、灶位若尽在吉方，即为上等八宅之宅；尽在凶方则为下等。
 * 同样的八颗星，位置不同，宅之高下天差地别。
 *
 * 未标注房间时返回 0（中性）—— 不知道就不猜，而非假装平庸。
 */
function computeBaZhaiScore(s: SynthesisResult): number {
  const keyWeight: Record<string, number> = {
    大门: 1.0,
    主卧: 0.85,
    灶位: 0.7,
    厨房: 0.6,
    收银台: 0.9,
    老板位: 0.85,
    办公位: 0.6,
    儿童房: 0.6,
    书房: 0.45,
    神位: 0.7,
  };

  let sum = 0;
  let wSum = 0;
  for (const p of OUTER_PALACES) {
    const a = s.palaces[p];
    const star = s.baZhai.plate[p as Exclude<PalaceIndex, 5>];
    const power = YOU_NIAN_META[star].power / 3; // [-1, 1]
    for (const r of a.rooms) {
      const w = keyWeight[r.kind];
      if (!w) continue;
      sum += power * w;
      wSum += w;
    }
  }
  if (wSum === 0) return 0; // 未标要位 → 中性，不臆测
  return clamp(sum / wSum);
}

/** 山向奇门分：八方吉凶均值。 */
function computeQiMenScore(s: SynthesisResult): number | null {
  if (!s.qiMenEnabled) return null;
  const vals = OUTER_PALACES.map((p) => s.palaces[p].qiMen?.score).filter(
    (v): v is number => typeof v === 'number',
  );
  if (vals.length === 0) return null;
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function clamp(n: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 计算综合分。
 *
 * @param s        三派合参结果
 * @param xingShi  用户填写的外部环境；空数组视为「未填」
 */
export function computeComposite(
  s: SynthesisResult,
  xingShi: readonly XingShiItem[] = [],
): CompositeScore {
  const sp = scenarioProfile(s.buildingType);
  const landform = scoreXingShi(xingShi);

  // ── 理气三派 ──
  const feiXing = computeFeiXingScore(s);
  const baZhai = computeBaZhaiScore(s);
  const qiMen = computeQiMenScore(s);

  // 关闭奇门时把 c 归零并把其权重按比例分给飞星与八宅
  let wF: number = QI_WEIGHTS.feiXing;
  let wB: number = QI_WEIGHTS.baZhai;
  let wQ: number = QI_WEIGHTS.qiMen;
  if (qiMen == null) {
    const rest = wF + wB;
    wF = wF / rest;
    wB = wB / rest;
    wQ = 0;
  }
  const qiScore = clamp(feiXing * wF + baZhai * wB + (qiMen ?? 0) * wQ);

  // ── 峦头 / 理气 权重 ──
  const landformWeight = landform.assessed ? sp.landformWeight : UNASSESSED_LANDFORM_WEIGHT;
  const qiWeight = 1 - landformWeight;

  let score = clamp(landform.score * landformWeight + qiScore * qiWeight);

  // ── 否决机制 ──
  let veto: CompositeScore['veto'] = { triggered: false, reason: null };
  if (qiScore > VETO_QI_THRESHOLD && landform.negativeCorrection < VETO_LANDFORM_THRESHOLD) {
    veto = {
      triggered: true,
      reason:
        '理气虽好，峦头有缺，需优先化解形煞。' +
        `（理气 ${qiScore.toFixed(2)} 已过 ${VETO_QI_THRESHOLD}，然峦头负向修正 ${landform.negativeCorrection.toFixed(2)} 低于 ${VETO_LANDFORM_THRESHOLD}）` +
        '——《葬书》以峦头为体，形煞当前，纵有旺星亦无从发越。故综合评价强制压至 ' +
        `${VETO_CAP}，待形煞化解后再论理气之利。`,
    };
    score = Math.min(score, VETO_CAP);
  }

  // ── 置信度 ──
  const reasons: string[] = [];
  let confScore = 0;
  if (landform.assessed) {
    confScore += 2;
    reasons.push(`已填外部环境 ${landform.contributions.length} 项，峦头以 ${(landformWeight * 100).toFixed(0)}% 权重参与。`);
  } else {
    reasons.push(
      `未填外部环境。峦头权重已降至 ${(UNASSESSED_LANDFORM_WEIGHT * 100).toFixed(0)}%，` +
        '判断实际上只剩理气一半 —— 这不是保守，是如实标注。补填后结论会明显更可信。',
    );
  }
  if (qiMen != null) {
    confScore += 1;
    reasons.push('三派同盘合参（飞星 · 八宅 · 山向奇门）。');
  } else {
    reasons.push('两派合参（飞星 · 八宅），山向奇门层未启用。');
  }
  if (s.confidence.level === '高') confScore += 1;
  reasons.push(...s.confidence.reasons.slice(0, 2));

  const confidence: ConfidenceLevel = confScore >= 3 ? '高' : confScore >= 2 ? '中' : '低';

  const breakdown = [
    {
      label: '峦头（形势）',
      value: landform.score,
      weight: landformWeight,
      contribution: landform.score * landformWeight,
      note: landform.assessed ? landform.summary : '未填外部环境，权重已降至 15%。',
    },
    {
      label: '理气 · 玄空飞星',
      value: feiXing,
      weight: qiWeight * wF,
      contribution: feiXing * qiWeight * wF,
      note:
        `${s.flyingStar.period.label}，${s.flyingStar.pattern}；` +
        `格局占 45%、要位（大门/主卧/收银台等）得旺占 35%、八方均值占 20%。`,
    },
    {
      label: '理气 · 八宅',
      value: baZhai,
      weight: qiWeight * wB,
      contribution: baZhai * qiWeight * wB,
      note:
        `${s.baZhai.label}；按要位落在四吉还是四凶加权 ——` +
        (baZhai === 0 ? '尚未标注要位，故取中性 0。' : '同样八颗星，位置不同则宅之高下不同。'),
    },
    ...(qiMen != null
      ? [
          {
            label: '理气 · 山向奇门',
            value: qiMen,
            weight: qiWeight * wQ,
            contribution: qiMen * qiWeight * wQ,
            note: '坐山三元定局，八方八门九星八神吉凶均值。',
          },
        ]
      : []),
  ];

  const summary =
    `${sp.scenario}场景：峦头 ${landform.score >= 0 ? '+' : ''}${landform.score.toFixed(2)}（权重 ${(landformWeight * 100).toFixed(0)}%）` +
    `　理气 ${qiScore >= 0 ? '+' : ''}${qiScore.toFixed(2)}（权重 ${(qiWeight * 100).toFixed(0)}%）` +
    `　→ 综合 ${score >= 0 ? '+' : ''}${score.toFixed(2)}。` +
    (veto.triggered ? '　⚠ 已触发否决：' + veto.reason : '') +
    `　${sp.note}`;

  return {
    scenario: sp.scenario,
    landform,
    qi: { feiXing, baZhai, qiMen, weights: { feiXing: wF, baZhai: wB, qiMen: wQ }, score: qiScore },
    weights: { landform: landformWeight, qi: qiWeight },
    score,
    veto,
    confidence,
    confidenceReasons: reasons,
    breakdown,
    summary,
  };
}
