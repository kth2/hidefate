import { describe, expect, it } from 'vitest';
import { buildFlyingStarChart } from './flyingStar.js';
import { overlayFindings } from './overlay.js';
import { plateOf } from './timeStars.js';
import { findDiseaseTerms } from './healthLexicon.js';

// 九运亥山巳向下卦：巽宫（东南）山2向7，离宫（南）山6向3，坤宫（西南）山4向5，乾宫（西北）山9向9……
const chart = buildFlyingStarChart({ sitting: 327, moveInYear: 2026 });

describe('宅盘 × 客星叠加', () => {
  it('当运旺星作客星落在宅盘旺向星之宫 → 吉', () => {
    // 宅盘向星九紫在乾宫（西北）：找一颗入中星，使时盘九紫正好飞到乾宫
    const at = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find((c) => plateOf(c)[6] === 9)!;
    const f = overlayFindings(chart, { 时: plateOf(at) });
    const hit = f.find((x) => x.palace === 6 && x.level === '吉' && x.title.includes('旺星'));
    expect(chart.palaces[6].xiang).toBe(9);
    expect(hit?.direction).toBe('西北');
  });

  it('当运旺星落在宅盘向星五黄之宫 → 打折', () => {
    const p5 = ([1, 2, 3, 4, 6, 7, 8, 9] as const).find((p) => chart.palaces[p].xiang === 5)!;
    const c = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find((x) => plateOf(x)[p5] === 9)!;
    const f = overlayFindings(chart, { 年: plateOf(c) });
    expect(f.some((x) => x.palace === p5 && x.level === '打折')).toBe(true);
  });

  it('客星五黄临宅盘五黄或二黑之宫 → 宜静，并排在最前', () => {
    const p = ([1, 2, 3, 4, 6, 7, 8, 9] as const).find((q) => [chart.palaces[q].shan, chart.palaces[q].xiang].some((s) => s === 2 || s === 5))!;
    const c = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find((x) => plateOf(x)[p] === 5)!;
    const f = overlayFindings(chart, { 月: plateOf(c) });
    expect(f[0]!.level).toBe('宜静');
    expect(f.some((x) => x.palace === p && x.level === '宜静')).toBe(true);
  });

  it('客星四绿临宅盘一白之宫 → 一四同宫', () => {
    const p = ([1, 2, 3, 4, 6, 7, 8, 9] as const).find((q) => chart.palaces[q].shan === 1 || chart.palaces[q].xiang === 1)!;
    const c = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find((x) => plateOf(x)[p] === 4)!;
    const f = overlayFindings(chart, { 时: plateOf(c) });
    expect(f.some((x) => x.palace === p && x.title.includes('四绿'))).toBe(true);
  });

  it('客星四绿临宅盘四绿（四四）不算一四同宫', () => {
    const p = ([1, 2, 3, 4, 6, 7, 8, 9] as const).find(
      (q) => (chart.palaces[q].shan === 4 || chart.palaces[q].xiang === 4) && chart.palaces[q].shan !== 1 && chart.palaces[q].xiang !== 1,
    )!;
    const c = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).find((x) => plateOf(x)[p] === 4)!;
    expect(overlayFindings(chart, { 时: plateOf(c) }).some((x) => x.palace === p && x.title.includes('同宫'))).toBe(false);
  });

  it('不叠任何客星时没有结论；结论不含病名', () => {
    expect(overlayFindings(chart, {})).toEqual([]);
    const all = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).flatMap((c) => overlayFindings(chart, { 年: plateOf(c), 月: plateOf(c), 时: plateOf(c) }));
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) expect(findDiseaseTerms(f.title + f.basis)).toEqual([]);
  });
});
