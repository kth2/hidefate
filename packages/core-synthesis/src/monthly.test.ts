/**
 * 逐月 —— 行为锁。
 *
 * 守住的是：
 *   - 节气月的起讫是真的（八月是白露起，不是公历八月），腊月跨年
 *   - 年为底、月为触发：月星只做加减，而且乘上受影响程度
 *   - 月星不会给孩子凭空冒出财运
 *   - 十二个月之间真有分辨力，不是十二列一样的数
 */

import { describe, expect, it } from 'vitest';
import { monthlyPlate, solarMonthRange, starScore } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { levelOf, monthProbability, monthSlots, monthlyOutlook } from './monthly.js';
import { PROB_CEIL, PROB_FLOOR, predict, probabilityFor } from './predict.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE } from './fixtures.js';

const base = { profile: SAMPLE_PROFILE, members: SAMPLE_MEMBERS, qiMen: null, appliedCures: [] };

describe('节气月起讫', () => {
  it('正月自立春起，八月自白露起，腊月自小寒起且落在次年一月', () => {
    const jan = solarMonthRange(2026, 1);
    expect(jan.start.getMonth()).toBe(1); // 2 月
    expect(jan.start.getDate()).toBeGreaterThanOrEqual(3);
    expect(jan.start.getDate()).toBeLessThanOrEqual(5);
    const aug = solarMonthRange(2026, 8);
    expect(aug.start.getMonth()).toBe(8); // 9 月
    const dec = solarMonthRange(2026, 12);
    expect(dec.start.getFullYear()).toBe(2027);
    expect(dec.start.getMonth()).toBe(0);
  });

  it('相邻两月首尾相接，不重叠不留缝', () => {
    for (let m = 1; m < 12; m++) {
      const a = solarMonthRange(2026, m);
      const b = solarMonthRange(2026, m + 1);
      expect(b.start.getTime() - a.end.getTime()).toBe(86_400_000);
    }
    const last = solarMonthRange(2026, 12);
    const next = solarMonthRange(2027, 1);
    expect(next.start.getTime() - last.end.getTime()).toBe(86_400_000);
  });

  it('连续十二个月跨入下一个立春年', () => {
    const slots = monthSlots(2026, 8, 12);
    expect(slots).toHaveLength(12);
    expect(slots[0]).toMatchObject({ year: 2026, monthIndex: 8, label: '八月' });
    expect(slots[4]).toMatchObject({ year: 2026, monthIndex: 12 });
    expect(slots[5]).toMatchObject({ year: 2027, monthIndex: 1, label: '正月' });
  });
});

describe('年为底、月为触发', () => {
  const out = monthlyOutlook(base, 2026, 1, 12);
  const input = { ...base, year: 2026 };
  const s = synthesise(input);
  const preds = predict(input, s);

  it('每人十二个月，概率恒在上下限内', () => {
    expect(out.rows).toHaveLength(SAMPLE_MEMBERS.length);
    for (const r of out.rows) {
      expect(r.months).toHaveLength(12);
      for (const c of r.months) {
        for (const d of c.domains) {
          expect(d.probability).toBeGreaterThanOrEqual(PROB_FLOOR);
          expect(d.probability).toBeLessThanOrEqual(PROB_CEIL);
          expect(d.reason).toContain(c.slot.label);
        }
      }
    }
  });

  it('月星为凶的月份高于月星为吉的月份（同一人同一处）', () => {
    const p = preds.find((x) => x.room === '小明房' && x.domain === '健康')!;
    const baseProb = probabilityFor(p, 'm-son')!;
    const period = s.flyingStar.period.period;
    const son = out.rows.find((r) => r.memberId === 'm-son')!;
    const byMonth = son.months.map((c) => {
      const star = monthlyPlate(c.slot.year, c.slot.monthIndex)[p.palace];
      return { score: starScore(star, period), prob: c.domains.find((d) => d.domain === '健康')!.probability };
    });
    const worst = byMonth.reduce((a, b) => (b.score < a.score ? b : a));
    const bestM = byMonth.reduce((a, b) => (b.score > a.score ? b : a));
    expect(worst.prob).toBeGreaterThan(bestM.prob);
    expect(worst.prob).toBeGreaterThan(baseProb);
    expect(bestM.prob).toBeLessThan(baseProb);
  });

  it('受影响程度越低，月星的加减越小', () => {
    // 阳台对小明只是经过（×0.25），小明房是他自己的卧房（×1）
    const slots = monthSlots(2026, 1, 12);
    const period = s.flyingStar.period.period;
    const lg = (p: number) => Math.log(p / (1 - p));
    const swing = (room: string) => {
      const p = preds.find((x) => x.room === room && x.domain === '健康')!;
      const xs = slots.map((slot) => lg(monthProbability(p, 'm-son', slot, period)!.probability));
      return Math.max(...xs) - Math.min(...xs);
    };
    const balcony = preds.find((x) => x.room === '阳台' && x.domain === '健康')!;
    expect(balcony.perMember.find((m) => m.memberId === 'm-son')!.exposure).toBeLessThan(1);
    expect(swing('阳台')).toBeGreaterThan(0);
    expect(swing('阳台')).toBeLessThan(swing('小明房'));
  });

  it('月星不会给孩子凭空冒出财运、感情', () => {
    const son = out.rows.find((r) => r.memberId === 'm-son')!;
    for (const c of son.months) {
      expect(c.domains.some((d) => d.domain === '财运' || d.domain === '感情')).toBe(false);
    }
  });

  it('十二个月之间有分辨力，不是十二列一样', () => {
    for (const r of out.rows) {
      const tops = new Set(r.months.map((c) => Math.round((c.top?.probability ?? 0) * 100)));
      expect(tops.size).toBeGreaterThan(3);
    }
  });

  it('全年都不好的人，也分得出哪几个月加重、哪几个月缓和', () => {
    const son = out.rows.find((r) => r.memberId === 'm-son')!;
    const trends = new Set(son.months.map((c) => c.trend));
    expect(trends.has('加重')).toBe(true);
    expect(trends.has('缓和') || trends.has('如常')).toBe(true);
    for (const c of son.months) {
      if (!c.top) continue;
      if (c.trend === '加重') expect(c.top.probability).toBeGreaterThan(c.top.baseline);
      if (c.trend === '缓和') expect(c.top.probability).toBeLessThan(c.top.baseline);
    }
  });

  it('等级只由概率决定', () => {
    expect(levelOf(null)).toBe('平');
    expect(levelOf(0.3)).toBe('平');
    expect(levelOf(0.5)).toBe('留意');
    expect(levelOf(0.7)).toBe('警戒');
  });

  it('确定性：同输入同输出', () => {
    expect(JSON.stringify(monthlyOutlook(base, 2026, 1, 12))).toBe(JSON.stringify(out));
  });
});
