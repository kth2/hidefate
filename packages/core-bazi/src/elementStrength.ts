/**
 * 五行力量加权计分。
 *
 * 本模块是 kth2/bazi-app（Dart）`lib/core/engine/element_strength.dart` 的
 * 逐项等价移植 —— 权重、藏干配比、旺相休囚死系数、身强弱阈值全部保持一致，
 * 以确保同一个人在 bazi-app 与本 App 得到相同的五行结论。
 *
 * 计分模型：
 *   - 天干各计权重 1.0
 *   - 地支透过藏干计分，按 本气/中气/余气 配比拆分；月支（月令）权重加重
 *   - 每一项贡献再乘以「相对月令的旺相休囚死」系数
 *
 * 对残缺八字的扩展（原 Dart 版不需处理）：
 *   - 只取实际成立的柱参与计分
 *   - 无月柱时无月令，旺相休囚死系数一律取 1.0，并在 note 中说明
 */

import {
  ALL_WUXING,
  CANG_GAN,
  CONTROLS,
  GAN_WUXING,
  GENERATES,
  ZHI_WUXING,
  generatedBy,
} from './tables.js';
import type { ElementStrengthResult, WuXing } from './types.js';

/** 旺相休囚死系数（与参考实现一致）。 */
export function seasonMultiplier(element: WuXing, monthElement: WuXing | null): number {
  if (monthElement == null) return 1.0;
  if (element === monthElement) return 1.4; // 旺（当令）
  if (GENERATES[monthElement] === element) return 1.2; // 相（令所生）
  if (GENERATES[element] === monthElement) return 1.0; // 休（生令）
  if (CONTROLS[element] === monthElement) return 0.8; // 囚（克令）
  return 0.6; // 死（令所克）
}

export function seasonStateName(element: WuXing, monthElement: WuXing | null): string | null {
  if (monthElement == null) return null;
  if (element === monthElement) return '旺';
  if (GENERATES[monthElement] === element) return '相';
  if (GENERATES[element] === monthElement) return '休';
  if (CONTROLS[element] === monthElement) return '囚';
  return '死';
}

/** 藏干配比：本气 / 中气 / 余气。 */
function cangGanProportions(count: number): readonly number[] {
  if (count === 1) return [1.0];
  if (count === 2) return [0.7, 0.3];
  return [0.6, 0.3, 0.1];
}

/** 参与计分的一根柱。 */
export interface ScoringPillar {
  readonly position: '年柱' | '月柱' | '日柱' | '时柱';
  readonly gan: string;
  readonly zhi: string;
}

/** 地支位置权重：月令独重。 */
const BRANCH_WEIGHT: Record<ScoringPillar['position'], number> = {
  年柱: 1.0,
  月柱: 1.8,
  日柱: 1.0,
  时柱: 1.0,
};

export function computeElementStrength(pillars: readonly ScoringPillar[]): ElementStrengthResult {
  const monthPillar = pillars.find((p) => p.position === '月柱');
  const dayPillar = pillars.find((p) => p.position === '日柱');
  const monthElement = monthPillar ? (ZHI_WUXING[monthPillar.zhi] ?? null) : null;

  const scores: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };

  const addStem = (gan: string, weight: number) => {
    const w = GAN_WUXING[gan];
    if (!w) return;
    scores[w] += weight * seasonMultiplier(w, monthElement);
  };

  const addBranch = (zhi: string, positionWeight: number) => {
    const hidden = CANG_GAN[zhi];
    if (!hidden) return;
    const props = cangGanProportions(hidden.length);
    hidden.forEach((g, i) => {
      const w = GAN_WUXING[g];
      if (!w) return;
      scores[w] += positionWeight * (props[i] ?? 0) * seasonMultiplier(w, monthElement);
    });
  };

  for (const p of pillars) {
    addStem(p.gan, 1.0);
    addBranch(p.zhi, BRANCH_WEIGHT[p.position]);
  }

  const total = ALL_WUXING.reduce((a, w) => a + scores[w], 0);
  const percent: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const w of ALL_WUXING) percent[w] = total === 0 ? 0 : (scores[w] / total) * 100;

  if (!dayPillar) {
    return {
      raw: scores,
      percent,
      dayMasterElement: null,
      dayMasterSeasonState: null,
      supportPercent: null,
      verdict: '无法判定',
      favourable: [],
      unfavourable: [],
      note: '缺日柱，无日主可依，身强弱与喜忌无从判定；下表仅为已知各柱的五行分布参考。',
    };
  }

  const dayElement = GAN_WUXING[dayPillar.gan]!;
  const resourceElement = generatedBy(dayElement); // 印
  const supportPercent = total === 0
    ? 0
    : ((scores[dayElement] + scores[resourceElement]) / total) * 100;

  const verdict: ElementStrengthResult['verdict'] =
    supportPercent >= 55 ? '身强' : supportPercent <= 42 ? '身弱' : '中和';

  // 扶抑法初判喜忌：身强宜泄克耗，身弱宜生扶。
  const drain = GENERATES[dayElement]; // 食伤
  const wealth = CONTROLS[dayElement]; // 财
  const officer = (Object.keys(CONTROLS) as WuXing[]).find((k) => CONTROLS[k] === dayElement)!; // 官杀
  const favourable: WuXing[] =
    verdict === '身强' ? [drain, wealth, officer]
      : verdict === '身弱' ? [resourceElement, dayElement]
        : [drain, resourceElement];
  const unfavourable: WuXing[] =
    verdict === '身强' ? [resourceElement, dayElement]
      : verdict === '身弱' ? [wealth, officer]
        : [];

  const seasonState = seasonStateName(dayElement, monthElement);
  const notes: string[] = [];
  if (!monthPillar) notes.push('缺月柱，无月令可依，旺相休囚死系数一律按 1.0 计，五行占比仅供粗略参考。');
  if (!pillars.some((p) => p.position === '时柱')) notes.push('缺时柱，时干支未参与计分，身强弱结论按三柱得出，置信度中等。');
  if (notes.length === 0) notes.push('四柱俱全，五行力量按完整加权模型计算。');

  return {
    raw: scores,
    percent,
    dayMasterElement: dayElement,
    dayMasterSeasonState: seasonState,
    supportPercent,
    verdict,
    favourable,
    unfavourable,
    note: notes.join(''),
  };
}
