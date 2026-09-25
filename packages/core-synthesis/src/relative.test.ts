/**
 * 相对说法 —— 行为锁。
 *
 * 守住的是：
 *   - 「平常」只保留与房子无关的部分；房子不好时高于平常，房子好时低于平常
 *   - 只是偶尔经过的地方，比平常高不了多少（受影响程度同样乘在差值上）
 *   - 孩子健康指数本来就高，但「最该留意」按比平常高出多少选，不按绝对值
 *   - 标题先说比平常高还是低，百分比退居括号当指数
 */

import { describe, expect, it } from 'vitest';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { buildPersonView, familyOverview } from './person.js';
import { analyse, predict } from './predict.js';
import { RELATIVE_STEP, isElevated, relativeDelta, relativeLevel } from './relative.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, sampleInput } from './fixtures.js';

describe('分档', () => {
  it('按 logit 差分五档', () => {
    expect(relativeLevel(0.5, 0.5)).toBe('与平常相当');
    expect(relativeLevel(0.6, 0.45)).toBe('偏高');
    expect(relativeLevel(0.85, 0.3)).toBe('明显偏高');
    expect(relativeLevel(0.2, 0.35)).toBe('偏低');
    expect(relativeLevel(0.05, 0.4)).toBe('明显偏低');
    expect(isElevated('偏高')).toBe(true);
    expect(isElevated('与平常相当')).toBe(false);
  });

  it('贴近上限时 logit 不被压扁：88%→92% 与 50%→60% 的百分点差不同，但都能分出来', () => {
    expect(relativeDelta(0.92, 0.88)).toBeGreaterThan(0);
    expect(relativeDelta(0.92, 0.88)).toBeCloseTo(Math.log(0.92 / 0.08) - Math.log(0.88 / 0.12));
  });
});

describe('平常 = 同一个人住在吉凶平和的位置', () => {
  const input = sampleInput(2026);
  const preds = predict(input, synthesise(input));

  it('每人每条都有平常概率与相对档位', () => {
    for (const p of preds) {
      expect(p.relative).toBeTruthy();
      for (const m of p.perMember) {
        expect(m.neutral).toBeGreaterThan(0);
        expect(m.neutral).toBeLessThan(1);
        expect(m.relative).toBe(relativeLevel(m.probability, m.neutral));
      }
    }
  });

  it('自己的卧房落在坏宫，比平常偏高；换到好宫，就不再偏高', () => {
    const kid = preds.find((p) => p.room === '小明房' && p.domain === '健康')!;
    const son = kid.perMember.find((m) => m.memberId === 'm-son')!;
    expect(isElevated(son.relative)).toBe(true);

    // 找一个对全家都最好的宫，把小明房搬过去
    const s = synthesise(input);
    const best = ([1, 2, 3, 4, 6, 7, 8, 9] as const).reduce((a, b) => (s.palaces[b].score > s.palaces[a].score ? b : a));
    const moved: PropertyProfile = {
      ...SAMPLE_PROFILE,
      rooms: SAMPLE_PROFILE.rooms.map((r) => (r.id === 'r-kid' ? { ...r, primaryPalace: best, palaces: [best] } : r)),
    };
    const i2 = { ...input, profile: moved };
    const p2 = predict(i2, synthesise(i2)).find((p) => p.room === '小明房' && p.domain === '健康');
    const son2 = p2?.perMember.find((m) => m.memberId === 'm-son');
    if (son2) expect(relativeDelta(son2.probability, son2.neutral)).toBeLessThan(relativeDelta(son.probability, son.neutral));
  });

  it('只是偶尔经过的地方，高出平常的幅度远小于自己的卧房', () => {
    const balcony = preds.find((p) => p.room === '阳台' && p.domain === '健康')!;
    const kid = preds.find((p) => p.room === '小明房' && p.domain === '健康')!;
    const pass = balcony.perMember.find((m) => m.memberId === 'm-son')!;
    const own = kid.perMember.find((m) => m.memberId === 'm-son')!;
    expect(relativeDelta(pass.probability, pass.neutral)).toBeLessThan(relativeDelta(own.probability, own.neutral));
    expect(relativeDelta(pass.probability, pass.neutral)).toBeLessThan(RELATIVE_STEP * 2);
  });

  it('标题先说比平常高还是低，百分比放在括号里当指数', () => {
    for (const p of preds) {
      expect(p.headline).toMatch(/比平常|与平常相当/);
      expect(p.headline).toContain('指数');
      expect(p.headline).not.toContain('机率约');
    }
  });
});

describe('「最该留意」按比平常高出多少选', () => {
  const input = sampleInput(2026);
  const s = analyse(input, synthesise(input));

  it('一句话里说的是比平常高还是低，而不是百分比', () => {
    const v = buildPersonView(s, SAMPLE_MEMBERS, 'm-son')!;
    expect(v.summary).toMatch(/比平常(明显)?偏高|没有让小明哪一方面比平常明显偏高/);
    expect(v.summary).not.toMatch(/约 \d+%/);
  });

  it('全家总览里每人的「最该留意」都是偏高以上的项', () => {
    for (const row of familyOverview(s, SAMPLE_MEMBERS)) {
      if (row.worst) expect(isElevated(row.worst.relative)).toBe(true);
      for (const c of row.cells) if (c.probability != null) expect(c.relative).toBeTruthy();
    }
  });
});
