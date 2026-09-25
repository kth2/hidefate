import { describe, expect, it } from 'vitest';
import { RECURRING_MIN_YEARS, foldRecurring } from './recurring.js';
import type { PredictedEvent } from './types.js';

const evt = (year: number, templateId: string, probability: number, over: Partial<PredictedEvent> = {}): PredictedEvent => ({
  templateId,
  title: `事件 ${templateId}`,
  domain: '事业',
  valence: '凶',
  year,
  monthIndex: null,
  whenLabel: `${year} 年`,
  granularity: '年',
  layers: ['命', '运'],
  resonance: 2,
  probability,
  matched: ['七杀'],
  criterion: '某年是否发生某事，以书面记录为准',
  advice: '留意',
  classic: '古法',
  interventionability: '行为可调',
  ...over,
} as PredictedEvent);

describe('反复出现的事折成一条', () => {
  const years = [2027, 2028, 2029, 2030, 2031].map((y) => ({
    year: y,
    events: [
      ...(y % 2 === 1 ? [evt(y, 'layoff', 0.4 + (y - 2027) * 0.01)] : []), // 2027/2029/2031 三年
      ...(y === 2028 ? [evt(y, 'surgery', 0.33)] : []),
      ...(y === 2030 ? [evt(y, 'promotion', 0.5, { valence: '吉' })] : []),
      ...(y === 2031 ? [evt(y, 'lawsuit', 0.45)] : []),
    ],
  }));
  const f = foldRecurring(years);

  it(`出现 ${RECURRING_MIN_YEARS} 年以上的归入反复出现，逐年时间与概率照样保留`, () => {
    expect(f.recurring.map((r) => r.templateId)).toEqual(['layoff']);
    const r = f.recurring[0]!;
    expect(r.occurrences.map((o) => o.year)).toEqual([2027, 2029, 2031]);
    expect(r.maxProbability).toBeCloseTo(0.44);
    expect(f.isRecurring('layoff')).toBe(true);
    expect(f.isRecurring('surgery')).toBe(false);
  });

  it('每年只完整展开特有的事，不改概率', () => {
    expect(f.specific.get(2027)).toEqual([]);
    expect(f.specific.get(2028)!.map((e) => e.templateId)).toEqual(['surgery']);
    expect(f.specific.get(2031)!.map((e) => [e.templateId, e.probability])).toEqual([['lawsuit', 0.45]]);
  });

  it('最值得留意的年份只看特有的凶事，按年份排', () => {
    expect(f.standoutYears.map((s) => s.year)).toEqual([2028, 2031]);
  });

  it('同一年两个窗口不算两年', () => {
    const g = foldRecurring([
      { year: 2027, events: [evt(2027, 'x', 0.4, { monthIndex: 2 }), evt(2027, 'x', 0.4, { monthIndex: 8 })] },
      { year: 2028, events: [evt(2028, 'x', 0.4)] },
    ]);
    expect(g.recurring).toHaveLength(0);
  });
});
