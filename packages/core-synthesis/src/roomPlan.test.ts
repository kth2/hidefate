/**
 * 怎么分房最好 —— 行为锁。
 */

import { describe, expect, it } from 'vitest';
import type { PalaceIndex, PropertyProfile } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { planRooms } from './roomPlan.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, sampleInput } from './fixtures.js';

/** 给示范户加一间空的次卧，放在对小明最有利、且宫位不差的方位。 */
function withSpareRoom(palace: PalaceIndex): PropertyProfile {
  return {
    ...SAMPLE_PROFILE,
    rooms: [...SAMPLE_PROFILE.rooms, { id: 'r-spare', kind: '次卧', label: '客卧', primaryPalace: palace, palaces: [palace], occupants: [] }],
  };
}

describe('分房', () => {
  it('只有一间卧房、或没人被指定卧房时，明说排不了', () => {
    const one: PropertyProfile = { ...SAMPLE_PROFILE, rooms: SAMPLE_PROFILE.rooms.filter((r) => r.id !== 'r-kid') };
    expect(planRooms({ ...sampleInput(2026), profile: one }).feasible).toBe(false);
    const none: PropertyProfile = { ...SAMPLE_PROFILE, rooms: SAMPLE_PROFILE.rooms.map((r) => ({ ...r, occupants: [] })) };
    const r = planRooms({ ...sampleInput(2026), profile: none });
    expect(r.feasible).toBe(false);
    expect(r.reason).toContain('指定');
  });

  it('夫妻不拆开：两人一组只能去容得下两人的房', () => {
    // 示范户只有主卧（两人）与小明房（一人）两间卧房 —— 夫妻只能留在主卧
    const r = planRooms(sampleInput(2026));
    expect(r.feasible).toBe(true);
    const master = r.assignment['r-master'] ?? [];
    expect([...master].sort()).toEqual(['m-dad', 'm-mom']);
    expect(r.assignment['r-kid']).toEqual(['m-son']);
    expect(r.moves).toHaveLength(0);
    expect(r.reason).toContain('已经是');
  });

  it('多一间对小明更好的空卧房时，建议小明搬过去，且全家负担下降', () => {
    const s = synthesise(sampleInput(2026));
    // 小明巽命：生气在正北(1)、天医在正南(9)；挑两者中宫位分较高的
    const palace: PalaceIndex = s.palaces[1].score >= s.palaces[9].score ? 1 : 9;
    const r = planRooms({ ...sampleInput(2026), profile: withSpareRoom(palace) });
    expect(r.feasible).toBe(true);
    expect(r.moves.map((m) => m.names)).toContainEqual(['小明']);
    expect(r.totalAfter).toBeLessThan(r.totalBefore);
    const sonBefore = r.current.find((p) => p.memberId === 'm-son')!;
    const sonAfter = r.best.find((p) => p.memberId === 'm-son')!;
    expect(sonAfter.burden).toBeLessThan(sonBefore.burden);
    expect(sonAfter.bedroom).toBe('客卧');
    expect(r.assignment['r-spare']).toEqual(['m-son']);
  });

  it('同分时不搬：没有更好的去处就维持原状', () => {
    // 空卧房放在全宅最差的西北（紧急、缺角、二黑）—— 不该建议任何人搬去
    const r = planRooms({ ...sampleInput(2026), profile: withSpareRoom(6) });
    expect(r.moves).toHaveLength(0);
    expect(r.moves.some((m) => m.names.includes('小明') && m.to === '客卧')).toBe(false);
    expect(r.totalAfter).toBeLessThanOrEqual(r.totalBefore);
  });

  it('没被指定卧房的人不硬塞进去，并列出来', () => {
    const profile: PropertyProfile = {
      ...withSpareRoom(1),
      rooms: withSpareRoom(1).rooms.map((r) => (r.id === 'r-kid' ? { ...r, occupants: [] } : r)),
    };
    const r = planRooms({ ...sampleInput(2026), profile });
    expect(r.skipped).toEqual(['小明']);
    for (const ids of Object.values(r.assignment)) expect(ids).not.toContain('m-son');
  });

  it('确定性', () => {
    const a = planRooms({ ...sampleInput(2026), profile: withSpareRoom(1) });
    const b = planRooms({ ...sampleInput(2026), profile: withSpareRoom(1) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('只动卧房，书房等非卧房的使用者原样保留', () => {
    const r = planRooms({ ...sampleInput(2026), profile: withSpareRoom(1) });
    expect(Object.keys(r.assignment)).not.toContain('r-study');
    expect(SAMPLE_MEMBERS.length).toBe(3);
  });
});
