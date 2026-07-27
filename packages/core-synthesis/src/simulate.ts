/**
 * What-If 模拟引擎。
 *
 * 计算流程严格固定为七步（与产品定义一致，便于逐步显示进度）：
 *   1. 校验输入
 *   2. 重排基础盘（飞星 + 八宅 +（可选）山向奇门）
 *   3. 重新映射房间到宫位
 *   4. 应用缺角调整
 *   5. 与各成员命卦 / 八字交叉
 *   6. 生成新的概率评分
 *   7. 产出 Before / After 对比
 *
 * 性能：房间搬移与缺角变更**不触碰奇门层**（坐山未变，局不变），
 * 因此可以纯同步瞬时完成；只有坐向、兼向、元运、入住年变更才需要重排奇门盘。
 */

import {
  OUTER_PALACES,
  PALACE_DIRECTION,
  STAR_NAME,
  resolveMountain,
  type MissingCorner,
  type PalaceIndex,
  type PropertyProfile,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict } from './predict.js';
import type { AnalysisInput, Cure, Member, RiskLevel, SynthesisResult } from './types.js';

/** 可模拟的变量。全部可选，只改想改的那几项。 */
export interface ScenarioChanges {
  readonly sitting?: string | number;
  readonly facing?: string | number;
  /** 强制起/不起替卦（兼向）。 */
  readonly useTiXing?: boolean;
  readonly period?: PalaceIndex;
  readonly moveInYear?: number;
  readonly floor?: number;
  /** 整套房间重排。 */
  readonly rooms?: readonly RoomPlacement[];
  /** 单间房搬移：房间 id → 新宫位。 */
  readonly moveRooms?: Readonly<Record<string, PalaceIndex>>;
  readonly missingCorners?: readonly MissingCorner[];
  readonly enableQiMen?: boolean;
  /** 参与分析的成员 id 子集（模拟「谁在家」）。 */
  readonly presentMemberIds?: readonly string[];
  readonly year?: number;
}

export interface Scenario {
  readonly id: string;
  readonly name: string;
  readonly changes: ScenarioChanges;
  readonly note?: string;
}

/** 变更是否需要重排奇门盘（坐山变了才需要）。 */
export function requiresQiMenRebuild(changes: ScenarioChanges): boolean {
  return changes.sitting != null || changes.facing != null || changes.moveInYear != null;
}

/** 变更是否属于「瞬时级」（不改盘，只改映射）。 */
export function isInstantChange(changes: ScenarioChanges): boolean {
  return (
    changes.sitting == null &&
    changes.facing == null &&
    changes.period == null &&
    changes.moveInYear == null &&
    changes.useTiXing == null
  );
}

/** 第 1 步：校验。 */
export function validateChanges(changes: ScenarioChanges, base: PropertyProfile): string[] {
  const errors: string[] = [];
  if (changes.sitting != null) {
    try { resolveMountain(changes.sitting); }
    catch (e) { errors.push(`坐山无效：${(e as Error).message}`); }
  }
  if (changes.facing != null) {
    try { resolveMountain(changes.facing); }
    catch (e) { errors.push(`向首无效：${(e as Error).message}`); }
  }
  if (changes.period != null && (changes.period < 1 || changes.period > 9)) {
    errors.push('元运须为 1–9。');
  }
  if (changes.floor != null && changes.floor < -5) errors.push('楼层数值不合理。');
  if (changes.moveInYear != null && (changes.moveInYear < 1864 || changes.moveInYear > 2200)) {
    errors.push('入住年须在 1864–2200 之间（三元九运自 1864 甲子起算）。');
  }
  for (const mc of changes.missingCorners ?? []) {
    if (mc.severity < 0 || mc.severity > 1) errors.push(`缺角程度须在 0–1 之间（${PALACE_DIRECTION[mc.palace]}）。`);
  }
  const roomIds = new Set(base.rooms.map((r) => r.id));
  for (const id of Object.keys(changes.moveRooms ?? {})) {
    if (!roomIds.has(id)) errors.push(`要搬移的房间不存在：${id}`);
  }
  return errors;
}

/** 第 2–4 步：把变更应用到 profile 上。 */
export function applyChanges(base: PropertyProfile, changes: ScenarioChanges): PropertyProfile {
  let rooms = changes.rooms ? [...changes.rooms] : [...base.rooms];
  if (changes.moveRooms) {
    rooms = rooms.map((r) => {
      const target = changes.moveRooms![r.id];
      if (target == null) return r;
      return { ...r, primaryPalace: target, palaces: [target] };
    });
  }
  return {
    ...base,
    sitting: changes.sitting ?? base.sitting,
    facing: changes.facing ?? base.facing,
    period: changes.period ?? base.period,
    moveInYear: changes.moveInYear ?? base.moveInYear,
    floor: changes.floor ?? base.floor,
    rooms,
    missingCorners: changes.missingCorners ?? base.missingCorners,
    enableQiMen: changes.enableQiMen ?? base.enableQiMen,
  };
}

export interface PalaceDelta {
  readonly palace: PalaceIndex;
  readonly direction: string;
  readonly before: { score: number; risk: RiskLevel; combination: string; stars: string };
  readonly after: { score: number; risk: RiskLevel; combination: string; stars: string };
  readonly delta: number;
  readonly changed: boolean;
  readonly note: string;
}

export interface MemberDelta {
  readonly memberId: string;
  readonly name: string;
  readonly beforeRisk: number;
  readonly afterRisk: number;
  readonly delta: number;
  readonly verdict: '明显受益' | '略有改善' | '基本不变' | '略转不利' | '明显受损';
  readonly note: string;
}

export interface SimulationResult {
  readonly scenario: Scenario;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly before: SynthesisResult;
  readonly after: SynthesisResult;
  /** 整体风险变化方向。 */
  readonly overall: { before: number; after: number; delta: number; direction: '↑' | '↓' | '→'; text: string };
  readonly palaceDeltas: readonly PalaceDelta[];
  /** 改善最多的三处。 */
  readonly topImproved: readonly PalaceDelta[];
  /** 恶化最多的三处。 */
  readonly topWorsened: readonly PalaceDelta[];
  readonly memberDeltas: readonly MemberDelta[];
  /** 变更后新增/变化的化解建议。 */
  readonly newCures: readonly Cure[];
  readonly narrative: string;
  /** 本次模拟是否触发了奇门重排（供 UI 决定 loading 提示）。 */
  readonly rebuiltQiMen: boolean;
}

/**
 * 执行一次 What-If 模拟。
 *
 * 注意：奇门层是异步载入的，所以本函数**不**自行重排奇门盘 ——
 * 若变更了坐山且启用奇门，调用方须先自行 computeShanXiang 后，
 * 通过 afterQiMen 传入；否则模拟结果的奇门层将沿用 before 的盘（并在 narrative 中标注）。
 */
export function simulate(
  baseInput: AnalysisInput,
  scenario: Scenario,
  afterQiMen?: AnalysisInput['qiMen'],
): SimulationResult {
  // 1. 校验
  const errors = validateChanges(scenario.changes, baseInput.profile);

  const before = synthesise(baseInput);
  const beforePreds = predict(baseInput, before);

  if (errors.length > 0) {
    return {
      scenario, valid: false, errors,
      before: { ...before, predictions: beforePreds },
      after: { ...before, predictions: beforePreds },
      overall: { before: before.overallScore, after: before.overallScore, delta: 0, direction: '→', text: '输入有误，未执行模拟。' },
      palaceDeltas: [], topImproved: [], topWorsened: [], memberDeltas: [], newCures: [],
      narrative: `模拟未执行：${errors.join('；')}`,
      rebuiltQiMen: false,
    };
  }

  // 2–4. 应用变更
  const afterProfile = applyChanges(baseInput.profile, scenario.changes);

  // 5. 成员筛选（模拟「谁在家」）
  const members: readonly Member[] = scenario.changes.presentMemberIds
    ? baseInput.members.filter((m) => scenario.changes.presentMemberIds!.includes(m.id))
    : baseInput.members;

  const needRebuild = requiresQiMenRebuild(scenario.changes);
  const afterInput: AnalysisInput = {
    ...baseInput,
    profile: afterProfile,
    members,
    year: scenario.changes.year ?? baseInput.year,
    qiMen: afterQiMen !== undefined ? afterQiMen : needRebuild ? null : baseInput.qiMen,
  };

  // 6. 重算
  const after = synthesise(afterInput);
  const afterPreds = predict(afterInput, after);

  // 7. 对比
  const palaceDeltas: PalaceDelta[] = OUTER_PALACES.map((p) => {
    const b = before.palaces[p];
    const a = after.palaces[p];
    const starsOf = (x: typeof b) => `${STAR_NAME[x.stars.shan]}／${STAR_NAME[x.stars.xiang]}`;
    const delta = a.score - b.score;
    return {
      palace: p,
      direction: PALACE_DIRECTION[p],
      before: { score: b.score, risk: b.riskLevel, combination: b.combinationName, stars: starsOf(b) },
      after: { score: a.score, risk: a.riskLevel, combination: a.combinationName, stars: starsOf(a) },
      delta,
      changed: Math.abs(delta) > 0.02 || b.combinationName !== a.combinationName,
      note:
        b.combinationName !== a.combinationName
          ? `星组由「${b.combinationName}」变为「${a.combinationName}」，评级 ${b.riskLevel} → ${a.riskLevel}。`
          : `星组不变（${a.combinationName}），评级 ${b.riskLevel} → ${a.riskLevel}。`,
    };
  });

  const sortedByDelta = [...palaceDeltas].sort((x, y) => y.delta - x.delta);
  const topImproved = sortedByDelta.filter((d) => d.delta > 0.02).slice(0, 3);
  const topWorsened = sortedByDelta.filter((d) => d.delta < -0.02).slice(-3).reverse();

  const memberDeltas: MemberDelta[] = members.map((m) => {
    const bMax = maxProb(beforePreds.filter((p) => p.memberIds.includes(m.id)));
    const aMax = maxProb(afterPreds.filter((p) => p.memberIds.includes(m.id)));
    const d = bMax - aMax; // 风险下降为正收益
    const verdict: MemberDelta['verdict'] =
      d > 0.12 ? '明显受益' : d > 0.04 ? '略有改善' : d < -0.12 ? '明显受损' : d < -0.04 ? '略转不利' : '基本不变';
    return {
      memberId: m.id,
      name: m.name,
      beforeRisk: bMax,
      afterRisk: aMax,
      delta: d,
      verdict,
      note: `${m.name}（${m.mingGua.gua}${m.mingGua.number}命·${m.mingGua.group}）最高风险 ${(bMax * 100).toFixed(0)}% → ${(aMax * 100).toFixed(0)}%，判「${verdict}」。`,
    };
  });

  const beforeCureKeys = new Set(before.prioritisedCures.map((c) => `${c.palace}|${c.action}`));
  const newCures = after.prioritisedCures.filter((c) => !beforeCureKeys.has(`${c.palace}|${c.action}`));

  const delta = after.overallScore - before.overallScore;
  const direction: '↑' | '↓' | '→' = delta > 0.03 ? '↑' : delta < -0.03 ? '↓' : '→';

  const qiMenNote =
    needRebuild && afterQiMen === undefined && baseInput.profile.enableQiMen
      ? '（注意：本次变更了坐向，山向奇门层需重新定局，此结果暂未含奇门层，请重新载入奇门盘后复核。）'
      : '';

  return {
    scenario,
    valid: true,
    errors: [],
    before: { ...before, predictions: beforePreds },
    after: { ...after, predictions: afterPreds },
    overall: {
      before: before.overallScore,
      after: after.overallScore,
      delta,
      direction,
      text: `${before.overallScore.toFixed(2)}（${before.overallRisk}） → ${after.overallScore.toFixed(2)}（${after.overallRisk}） ${direction}`,
    },
    palaceDeltas,
    topImproved,
    topWorsened,
    memberDeltas,
    newCures,
    narrative:
      `方案「${scenario.name}」：全屋综合分 ${before.overallScore.toFixed(2)} → ${after.overallScore.toFixed(2)}（${direction === '↑' ? '改善' : direction === '↓' ? '转差' : '基本持平'}）。` +
      (topImproved.length ? `改善最明显：${topImproved.map((d) => `${d.direction}（${d.before.risk}→${d.after.risk}）`).join('、')}。` : '') +
      (topWorsened.length ? `恶化最明显：${topWorsened.map((d) => `${d.direction}（${d.before.risk}→${d.after.risk}）`).join('、')}。` : '') +
      (memberDeltas.length ? `成员影响：${memberDeltas.map((m) => `${m.name} ${m.verdict}`).join('、')}。` : '') +
      qiMenNote,
    rebuiltQiMen: needRebuild && afterQiMen !== undefined,
  };
}

function maxProb(preds: readonly { probability: number }[]): number {
  return preds.length ? Math.max(...preds.map((p) => p.probability)) : 0.05;
}

/** 多方案并排比较（最多 3 个）。 */
export interface ScenarioComparison {
  readonly baseline: { score: number; risk: RiskLevel };
  readonly scenarios: readonly {
    readonly scenario: Scenario;
    readonly score: number;
    readonly risk: RiskLevel;
    readonly delta: number;
    readonly rank: number;
    readonly memberDeltas: readonly MemberDelta[];
  }[];
  readonly recommendation: string;
}

export function compareScenarios(
  baseInput: AnalysisInput,
  results: readonly SimulationResult[],
): ScenarioComparison {
  if (results.length > 3) {
    throw new Error('最多并排比较 3 个方案（超过 3 栏难以阅读，且失去决策意义）。');
  }
  const base = synthesise(baseInput);
  const rows = results
    .map((r) => ({
      scenario: r.scenario,
      score: r.after.overallScore,
      risk: r.after.overallRisk,
      delta: r.after.overallScore - base.overallScore,
      rank: 0,
      memberDeltas: r.memberDeltas,
    }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const best = rows[0];
  return {
    baseline: { score: base.overallScore, risk: base.overallRisk },
    scenarios: rows,
    recommendation: best
      ? best.delta > 0.03
        ? `建议采用「${best.scenario.name}」：较现况提升 ${(best.delta * 100).toFixed(0)} 分点，且${best.memberDeltas.filter((m) => m.delta > 0).length} 位成员受益。`
        : `各方案均未明显优于现况（最佳者「${best.scenario.name}」仅 ${(best.delta * 100).toFixed(0)} 分点），建议维持现状并优先执行化解清单。`
      : '未提供任何方案。',
  };
}
