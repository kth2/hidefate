/**
 * 「答案 + 理 + 化解建议」标准作答器。
 *
 * 这是本 App 对外的统一回答格式。**结论与依据全部由确定性引擎产出**，
 * 本模块只负责组织文字骨架；LLM 若接入，只能润色 buildAnswerContext 给出的
 * 内容，不得新增任何星位、宫位、概率数字。
 */

import {
  PALACE_DIRECTION,
  PALACE_INDEXES,
  STAR_NAME,
  YOU_NIAN_META,
  azimuthToPalace,
  personalDirections,
  type PalaceIndex,
  type RiskDomain,
} from '@hidefate/core-fengshui';
import type { Cure, Finding, Member, Prediction, SynthesisResult } from './types.js';

/** 标准三段式作答。 */
export interface StandardAnswer {
  /** 选择题答案（如「B」）；非选择题时为结论短句。 */
  readonly answer: string;
  /** 理 —— 飞星 / 八宅 / 山向奇门 + 房间 + 命理 + 概率。 */
  readonly reasoning: string;
  /** 化解建议。 */
  readonly remedy: string;
  /** 支持此结论的门派。 */
  readonly schools: readonly string[];
  readonly confidence: string;
  /** 完整格式化文本，可直接展示或送入 PDF。 */
  readonly formatted: string;
}

export interface ChoiceOption {
  /** 选项标签，如 'A'。 */
  readonly key: string;
  readonly text: string;
  /** 该选项指向的宫位（若可解析）。 */
  readonly palace?: PalaceIndex;
  /** 该选项指向的方位角。 */
  readonly azimuth?: number;
  /** 该选项指向的房间 id。 */
  readonly roomId?: string;
}

const DIRECTION_ALIASES: Record<string, PalaceIndex> = {
  正北: 1, 北: 1, 北方: 1, 坎: 1,
  西南: 2, 坤: 2,
  正东: 3, 东: 3, 东方: 3, 震: 3,
  东南: 4, 巽: 4,
  中宫: 5, 中间: 5, 中央: 5,
  西北: 6, 乾: 6,
  正西: 7, 西: 7, 西方: 7, 兑: 7,
  东北: 8, 艮: 8,
  正南: 9, 南: 9, 南方: 9, 离: 9,
};

/** 从选项文字里解析出宫位（支持「正北」「西南方」「坎宫」「东北角」等写法）。 */
export function parsePalaceFromText(text: string): PalaceIndex | null {
  // 长别名优先，避免「东南」被「东」抢先匹配
  const keys = Object.keys(DIRECTION_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (text.includes(k)) return DIRECTION_ALIASES[k]!;
  }
  const deg = /(\d{1,3}(?:\.\d+)?)\s*(?:°|度)/.exec(text);
  if (deg) return azimuthToPalace(parseFloat(deg[1]!));
  return null;
}

function scoreOption(s: SynthesisResult, opt: ChoiceOption, domain?: RiskDomain): {
  score: number;
  palace: PalaceIndex | null;
  findings: readonly Finding[];
  cures: readonly Cure[];
  prediction: Prediction | null;
} {
  const palace =
    opt.palace ??
    (opt.azimuth != null ? azimuthToPalace(opt.azimuth) : null) ??
    (opt.roomId ? s.profile.rooms.find((r) => r.id === opt.roomId)?.primaryPalace ?? null : null) ??
    parsePalaceFromText(opt.text);

  if (palace == null) {
    return { score: 0, palace: null, findings: [], cures: [], prediction: null };
  }
  const a = s.palaces[palace];
  const relevant = domain
    ? s.predictions.filter((p) => p.palace === palace && p.domain === domain)
    : s.predictions.filter((p) => p.palace === palace);
  const pred = relevant.sort((x, y) => y.probability - x.probability)[0] ?? null;
  // 若指定了维度，用该维度的预测概率修正评分
  const domainPenalty = pred ? -(pred.probability - 0.3) * 0.8 : 0;
  return {
    score: a.score + domainPenalty,
    palace,
    findings: a.findings,
    cures: a.cures,
    prediction: pred,
  };
}

/**
 * 回答选择题。
 *
 * @param question 题干
 * @param options  选项
 * @param mode     '最吉' = 选最好的；'最凶' = 选最需回避/最危险的
 * @param domain   限定维度（如只问健康）
 */
export function answerMultipleChoice(
  s: SynthesisResult,
  question: string,
  options: readonly ChoiceOption[],
  mode: '最吉' | '最凶' = '最吉',
  domain?: RiskDomain,
): StandardAnswer {
  if (options.length === 0) throw new Error('选择题至少需要一个选项。');

  const scored = options.map((o) => ({ opt: o, ...scoreOption(s, o, domain) }));
  const resolvable = scored.filter((x) => x.palace != null);

  if (resolvable.length === 0) {
    return format({
      answer: '无法判定',
      reasoning: `题干「${question}」的各选项无法解析出明确方位或房间，本引擎不作猜测。请在选项中标明方位（如「正北」「东南」）、度数，或指定房间。`,
      remedy: '请补充选项的方位信息后重新提问；若为通用问题，可改用自由问答。',
      schools: [],
      confidence: '低',
    });
  }

  const sorted = [...resolvable].sort((a, b) => (mode === '最吉' ? b.score - a.score : a.score - b.score));
  const win = sorted[0]!;
  const runnerUp = sorted[1] ?? null;
  const a = s.palaces[win.palace!];

  // ---- 理 ----
  const room = a.rooms.length ? a.rooms.map((r) => r.label ?? r.kind).join('、') : null;
  const parts: string[] = [];

  parts.push(
    `【玄空飞星】${a.direction}山星${STAR_NAME[a.stars.shan]}、向星${STAR_NAME[a.stars.xiang]}、运星${STAR_NAME[a.stars.yun]}，成「${a.combinationName}」；` +
    `${s.year} 年流年${STAR_NAME[a.stars.annual]}飞临。全盘为${s.flyingStar.period.label}、${s.flyingStar.pattern}。`,
  );
  if (a.baZhaiStar) {
    const meta = YOU_NIAN_META[a.baZhaiStar];
    parts.push(`【八宅】本宅为${s.baZhai.label}，${a.direction}为「${a.baZhaiStar}」方（${meta.alias}·主${meta.governs}）。`);
  }
  if (a.qiMen) {
    parts.push(`【山向奇门】${a.direction}临${a.qiMen.xing}星、${a.qiMen.men || '（中宫无门）'}、${a.qiMen.shen || '（中宫无神）'}，判为${a.qiMen.verdict}。`);
  }
  if (a.missing) parts.push(`【形峦】${a.missing.summary}`);
  parts.push(`【房间】${room ? `此方现为${room}` : '此方未标注房间用途'}，${room ? '房间权重已计入评分' : '建议补标以提高准确度'}。`);

  const memberLines = win.prediction?.findings
    .filter((f) => f.schools.includes('八字命理'))
    .map((f) => f.statement) ?? [];
  if (memberLines.length) parts.push(`【命理】${memberLines.slice(0, 3).join('')}`);

  if (win.prediction) {
    parts.push(`【概率】${win.prediction.headline}（置信度${win.prediction.confidence}）。`);
  } else {
    parts.push(`【概率】此方本年未触发显著风险预测，综合评级为「${a.riskLevel}」（综合分 ${a.score.toFixed(2)}）。`);
  }
  if (runnerUp) {
    const ra = s.palaces[runnerUp.palace!];
    parts.push(
      `【对比】次选为 ${runnerUp.opt.key}「${runnerUp.opt.text}」（${ra.direction}，${ra.combinationName}，${ra.riskLevel}）；` +
      `其与本答案的差距在于 ${mode === '最吉' ? `综合分 ${ra.score.toFixed(2)} 低于 ${a.score.toFixed(2)}` : `综合分 ${ra.score.toFixed(2)} 高于 ${a.score.toFixed(2)}，凶险程度不及`}。`,
    );
  }

  // ---- 化解建议 ----
  const cures = (win.prediction?.cures ?? a.cures).slice(0, 4);
  const remedy = cures.length
    ? cures.map((c, i) => `${i + 1}. 〔${c.urgency}〕${c.action}\n   理据：${c.rationale}${c.avoid.length ? `\n   切忌：${c.avoid.join('、')}` : ''}`).join('\n')
    : mode === '最吉'
      ? `此方本已为佳，无需化解。宜主动借力：${a.rooms.length ? '维持现有布置，' : ''}保持整洁明亮、常有人气走动，即可发挥其吉应。`
      : '暂无针对性化解项，建议保持此方静置、整洁，避免动土与长时间停留。';

  const schools = Array.from(new Set(a.findings.flatMap((f) => f.schools)));

  return format({
    answer: `${win.opt.key}（${win.opt.text}）`,
    reasoning: parts.join('\n'),
    remedy,
    schools,
    confidence: `${win.prediction?.confidence ?? s.confidence.level}（${s.confidence.reasons[0] ?? ''}）`,
  });
}

/** 自由问答：针对某一方位/房间给出三段式回答。 */
export function answerAboutPalace(
  s: SynthesisResult,
  palace: PalaceIndex,
  question = '此方吉凶如何？',
  domain?: RiskDomain,
): StandardAnswer {
  return answerMultipleChoice(
    s,
    question,
    [{ key: '结论', text: PALACE_DIRECTION[palace], palace }],
    '最吉',
    domain,
  );
}

/** 「哪一方最适合做 X」——在全部九宫中挑最优/最劣。 */
export function answerBestPalaceFor(
  s: SynthesisResult,
  question: string,
  mode: '最吉' | '最凶' = '最吉',
  domain?: RiskDomain,
  candidates: readonly PalaceIndex[] = PALACE_INDEXES.filter((p) => p !== 5),
): StandardAnswer {
  const opts: ChoiceOption[] = candidates.map((p, i) => ({
    key: String.fromCharCode(65 + i),
    text: PALACE_DIRECTION[p],
    palace: p,
  }));
  return answerMultipleChoice(s, question, opts, mode, domain);
}

function format(a: Omit<StandardAnswer, 'formatted'>): StandardAnswer {
  const formatted =
    `答案：${a.answer}\n\n` +
    `理：\n${a.reasoning}\n\n` +
    `化解建议：\n${a.remedy}\n\n` +
    `——\n依据门派：${a.schools.length ? a.schools.join(' · ') : '（无）'}　|　置信度：${a.confidence}`;
  return { ...a, formatted };
}

/**
 * 为 LLM 组装上下文。
 *
 * 只给「已经算好的事实」，并在 system 里明令禁止改数 ——
 * 这是「LLM 绝不发明星位与数字」这条铁律的技术落点。
 */
export interface AnswerContextOptions {
  /** 成员及其命卦 / 八字摘要 —— 个人化提问必需。 */
  readonly members?: readonly Member[];
  /** 当前 What-If 模拟状态；有则一并交代，让模型知道「现在看的是哪一版」。 */
  readonly simulation?: {
    readonly scenarioName: string;
    readonly narrative: string;
    readonly overallBefore: number;
    readonly overallAfter: number;
    readonly topImproved: readonly { direction: string; note: string }[];
    readonly topWorsened: readonly { direction: string; note: string }[];
  } | null;
  /** 多年时间轴摘要。 */
  readonly timeline?: {
    readonly startYear: number;
    readonly endYear: number;
    readonly summary: string;
    readonly years: readonly { year: number; annualStarName: string; overallRisk: string }[];
  } | null;
}

export function buildAnswerContext(
  s: SynthesisResult,
  opts: AnswerContextOptions = {},
): {
  system: string;
  facts: string;
} {
  const lines: string[] = [];
  lines.push(`# 物业`);
  lines.push(`名称：${s.profile.name}；类别：${s.buildingType}${s.profile.floor != null ? `；楼层：${s.profile.floor}` : ''}`);
  lines.push(`坐向：坐${s.flyingStar.sitting.mountain.name}（${s.flyingStar.sitting.degree.toFixed(1)}°）向${s.flyingStar.facing.mountain.name}；${s.flyingStar.jianXiang.label}`);
  lines.push(`元运：${s.flyingStar.period.label}；格局：${s.flyingStar.pattern}；八宅：${s.baZhai.label}`);
  lines.push(`分析年：${s.year}；山向奇门层：${s.qiMenEnabled ? '已启用' : '未启用'}`);
  lines.push(`全屋综合分：${s.overallScore.toFixed(3)}（${s.overallRisk}）；整体置信度：${s.confidence.level}`);

  lines.push(`\n# 九宫明细`);
  for (const p of PALACE_INDEXES) {
    const a = s.palaces[p];
    lines.push(
      `${a.direction}（${p}宫）：运${STAR_NAME[a.stars.yun]} 山${STAR_NAME[a.stars.shan]} 向${STAR_NAME[a.stars.xiang]} 流年${STAR_NAME[a.stars.annual]}` +
      `｜组合「${a.combinationName}」｜八宅「${a.baZhaiStar ?? '—'}」` +
      (a.qiMen ? `｜奇门 ${a.qiMen.xing}·${a.qiMen.men || '无门'}·${a.qiMen.shen || '无神'}（${a.qiMen.verdict}）` : '') +
      (a.missing ? `｜缺角 ${(a.missing.severity * 100).toFixed(0)}%` : '') +
      `｜房间 ${a.rooms.length ? a.rooms.map((r) => r.label ?? r.kind).join('/') : '未标注'}` +
      `｜综合分 ${a.score.toFixed(3)}（${a.riskLevel}）`,
    );
  }

  if (s.predictions.length) {
    lines.push(`\n# 本年预测（概率已由确定性模型算出）`);
    for (const pr of s.predictions.slice(0, 12)) {
      lines.push(`- [${pr.domain}] ${pr.direction}${pr.room ? `·${pr.room}` : ''}：${(pr.probability * 100).toFixed(0)}%（${pr.riskLevel}，置信度${pr.confidence}）— ${pr.headline}`);
    }
  }

  if (s.prioritisedCures.length) {
    lines.push(`\n# 化解清单（已排序）`);
    for (const c of s.prioritisedCures.slice(0, 12)) {
      lines.push(`${c.priority}. 〔${c.urgency}〕${c.direction}${c.room ? `·${c.room}` : ''}：${c.action}`);
    }
  }

  // ---- 成员：命卦永远给全，八字按实际精度给，缺什么明写缺什么 ----
  const members = opts.members ?? [];
  if (members.length) {
    lines.push(`\n# 成员与命理（命卦只需生年性别，故任何精度下都完整可用）`);
    for (const m of members) {
      const es = m.chart.elementStrength;
      const dirs = personalDirections(m.mingGua.gua as never);
      const bits: string[] = [
        `${m.name}${m.relation ? `（${m.relation}）` : ''}：${m.chart.input.gender}，${m.chart.input.year} 年生`,
        `命卦 ${m.mingGua.gua}${m.mingGua.number}（${m.mingGua.group}）`,
        `四吉方 ${dirs.best.map((d) => `${PALACE_DIRECTION[d.palace]}(${d.star})`).join('/')}`,
        `四凶方 ${dirs.worst.map((d) => `${PALACE_DIRECTION[d.palace]}(${d.star})`).join('/')}`,
        `八字精度 ${m.chart.precision}（置信度${m.chart.confidence.label}）`,
      ];
      if (m.chart.pillars.length) {
        bits.push(`已知柱 ${m.chart.pillars.map((p) => `${p.position}${p.gan}${p.zhi}`).join(' ')}`);
      }
      if (es.dayMasterElement) {
        bits.push(
          `日主 ${m.chart.dayMaster}（${es.dayMasterElement}${es.dayMasterSeasonState ? `·${es.dayMasterSeasonState}` : ''}）` +
          `，${es.verdict}，喜${es.favourable.join('')}忌${es.unfavourable.join('')}`,
        );
      } else {
        bits.push(`无日柱故无日主：身强弱与十神一概不可推断（${es.note}）`);
      }
      if (m.chart.unavailable.length) {
        bits.push(`未能推算：${m.chart.unavailable.join(' ')}`);
      }
      lines.push(`- ${bits.join('｜')}`);
    }
  } else {
    lines.push(`\n# 成员与命理\n（尚未录入任何成员。凡涉及个人吉凶、房间分配、流年应期的问题都无法作答，须先补录成员的出生年与性别。）`);
  }

  // ---- 当前模拟状态：模型必须知道用户看的是原盘还是某个假设方案 ----
  if (opts.simulation) {
    const sim = opts.simulation;
    lines.push(`\n# 当前 What-If 模拟状态（重要：用户正在看的是这个假设方案，不是现况原盘）`);
    lines.push(`方案名称：${sim.scenarioName}`);
    lines.push(`全屋综合分：现况 ${sim.overallBefore.toFixed(3)} → 方案 ${sim.overallAfter.toFixed(3)}`);
    if (sim.topImproved.length) lines.push(`改善最多：${sim.topImproved.map((d) => `${d.direction}（${d.note}）`).join('；')}`);
    if (sim.topWorsened.length) lines.push(`恶化最多：${sim.topWorsened.map((d) => `${d.direction}（${d.note}）`).join('；')}`);
    lines.push(`结论：${sim.narrative}`);
  } else {
    lines.push(`\n# 当前 What-If 模拟状态\n（无。上方九宫与预测均为现况原盘。）`);
  }

  // ---- 时间轴 ----
  if (opts.timeline) {
    const t = opts.timeline;
    lines.push(`\n# 宅运时间轴 ${t.startYear}–${t.endYear}`);
    lines.push(t.summary);
    lines.push(t.years.map((y) => `${y.year}(${y.annualStarName}/${y.overallRisk})`).join('　'));
  }

  const system = [
    '你是「藏聚 HideFate」的风水解读助手，精通玄空飞星、八宅派与山向奇门。',
    '',
    '【绝对规则】',
    '1. 下方「事实」区块中的所有星位、宫位、组合名、概率、评分、置信度，都是由确定性引擎算出的。',
    '   你只能引用与解释，**绝对不可以修改、重算、四舍五入成别的数，也不可以发明事实中没有的星位或数字**。',
    '2. 若用户问的东西事实区块里没有，直接说「此项本盘未计算」，并说明需要补什么资料，不要猜。',
    '3. 一切回答使用简体中文。所有术语（飞星、八宅、山向奇门、命卦、十神等）保持中文原样，不翻译成英文。',
    '4. 回答问题时必须严格使用以下三段格式，不得增删段落：',
    '',
    '答案：X',
    '理：……（须点明 飞星 / 八宅 / 山向奇门 之依据 + 涉及房间 + 相关成员命理 + 概率）',
    '化解建议：……（须具体可执行：放什么、放哪里、忌什么）',
    '',
    '5. 每条化解都要说明「为什么这样化」（五行生克原理），并列出禁忌物。',
    '6. 不得作出医疗诊断或替代就医的承诺；健康类结论一律表述为「留意 / 建议检查」。',
    '7. 不得给出确定性断言（「一定会」「必然」）。概率就是概率。',
    '8. 涉及某位成员时，须用其真实命卦与八字精度作答；若该成员八字残缺（如缺时柱、仅知生年），',
    '   只可用「命卦 / 八宅」这一层下结论，并主动说明「因缺 X 柱，此结论仅到方位层面」。',
    '   绝不可为了把话说圆而假设一个时辰。',
    '9. 若「当前 What-If 模拟状态」区块不为空，说明用户正在看一个假设方案；',
    '   作答须基于该方案，并在开头一句点明「此为方案〈名称〉下的结论」。',
    '10. 闲聊、问候、或与本宅无关的问题，可以自然作答，不必套用三段格式；',
    '    但只要问题涉及吉凶、方位、房间、成员运势，就必须回到三段格式。',
  ].join('\n');

  return { system, facts: lines.join('\n') };
}
