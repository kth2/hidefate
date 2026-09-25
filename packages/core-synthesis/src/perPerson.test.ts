/**
 * 按人拆分的风水影响 —— 行为锁。
 *
 * 这些测试守住的是用户实际看到的几个荒谬结果：
 *   - 「西南的主卧对陈先生、陈太太、小明的健康构成压力」—— 小明根本不睡主卧
 *   - 家里人越多，每条预测的概率越高（命卦分数全家相加）
 *   - 卫浴、阳台对全家人人 100，比自己的卧房还危险
 *   - 报凶却教人「加强其吉应」
 *   - 契合度三人都是 51，却还分出「最受助益」与「最受压制」
 */

import { describe, expect, it } from 'vitest';
import { COMBINATIONS, cureIntentOf, exposureOf, roomExposure, type PropertyProfile } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { buildAlerts } from './alerts.js';
import { buildRoomMemberMatrix } from './matrix.js';
import { predict, predictionsForMember, probabilityFor } from './predict.js';
import { buildFamilyFusionReport } from './report.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, makeMember, sampleInput } from './fixtures.js';

const unassigned: PropertyProfile = {
  ...SAMPLE_PROFILE,
  rooms: SAMPLE_PROFILE.rooms.map((r) => ({ ...r, occupants: [] })),
};

function run(profile: PropertyProfile = SAMPLE_PROFILE, members = SAMPLE_MEMBERS) {
  const input = { ...sampleInput(2026), profile, members };
  return predict(input, synthesise(input));
}

describe('房间对人的影响方式', () => {
  it('卧房是专属，大门客厅厨房共用，卫浴储藏少停留', () => {
    expect(roomExposure('主卧')).toBe('专属');
    expect(roomExposure('儿童房')).toBe('专属');
    expect(roomExposure('书房')).toBe('专属');
    expect(roomExposure('大门')).toBe('共用');
    expect(roomExposure('厨房')).toBe('共用');
    expect(roomExposure('卫浴')).toBe('少停留');
    expect(roomExposure('储藏')).toBe('少停留');
  });

  it('别人的卧房对我不计，未指定使用者的卧房对谁都不计', () => {
    const master = SAMPLE_PROFILE.rooms.find((r) => r.id === 'r-master')!;
    expect(exposureOf(master, 'm-dad')).toBe(1);
    expect(exposureOf(master, 'm-son')).toBe(0);
    expect(exposureOf({ ...master, occupants: [] }, 'm-dad')).toBe(0);
    const door = SAMPLE_PROFILE.rooms.find((r) => r.kind === '大门')!;
    expect(exposureOf(door, 'm-son')).toBeGreaterThan(0);
  });
});

describe('预测按人算', () => {
  it('卧房的预测只落在睡在里面的人身上', () => {
    const preds = run();
    const master = preds.filter((p) => p.room === '主卧');
    expect(master.length).toBeGreaterThan(0);
    for (const p of master) {
      expect(p.memberIds).not.toContain('m-son');
      expect(p.headline).not.toContain('小明');
      for (const m of p.perMember) expect(['m-dad', 'm-mom']).toContain(m.memberId);
    }
    const kid = preds.filter((p) => p.room === '小明房');
    for (const p of kid) expect(p.memberIds).toEqual(['m-son']);
  });

  it('同一间房对不同的人概率不同', () => {
    const p = run().find((x) => x.room === '主卧' && x.perMember.length === 2)!;
    expect(p).toBeDefined();
    expect(p.perMember[0]!.probability).not.toBe(p.perMember[1]!.probability);
    expect(p.probability).toBe(p.perMember[0]!.probability);
  });

  it('多加一位不住这间的家人，不改变原住户的概率', () => {
    const aunt = makeMember('m-aunt', '姑妈', '女', 1960, { month: 2, day: 2, hour: 8 });
    const before = run();
    const after = run(SAMPLE_PROFILE, [...SAMPLE_MEMBERS, aunt]);
    const pick = (ps: typeof before) => ps.find((x) => x.id.startsWith('health-') && x.room === '小明房')!;
    expect(probabilityFor(pick(after), 'm-son')).toBe(probabilityFor(pick(before), 'm-son'));
  });

  it('未指定住户的卧房按宅论：不点名，并提示去指定', () => {
    // 小明房在正西（兑，少女之位）；这家没有女儿，六亲也点不到人
    const preds = run(unassigned);
    const kid = preds.filter((p) => p.room === '小明房');
    expect(kid.length).toBeGreaterThan(0);
    for (const p of kid) {
      expect(p.memberIds).toEqual([]);
      expect(p.perMember).toEqual([]);
      expect(p.breakdown.map((b) => b.note).join('')).toContain('指定');
    }
  });

  it('偶尔经过的地方，对人的概率低于把它当卧房', () => {
    const balcony = run().find((p) => p.room === '阳台' && p.domain === '健康');
    expect(balcony).toBeDefined();
    const asBedroom = run({
      ...SAMPLE_PROFILE,
      rooms: SAMPLE_PROFILE.rooms.map((r) =>
        r.kind === '阳台' ? { ...r, kind: '次卧' as const, label: '阳台房', occupants: ['m-dad'] } : r,
      ),
    }).find((p) => p.room === '阳台房' && p.domain === '健康')!;
    expect(probabilityFor(asBedroom, 'm-dad')!).toBeGreaterThan(probabilityFor(balcony!, 'm-dad')!);
  });

  it('每人的预测清单按其个人概率排序', () => {
    const mine = predictionsForMember(run(), 'm-dad');
    expect(mine.length).toBeGreaterThan(0);
    const ps = mine.map((p) => probabilityFor(p, 'm-dad')!);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!).toBeLessThanOrEqual(ps[i - 1]!);
  });

  it('个人化解：卧房落在本人凶方时，教本人把床头转向自己的吉方', () => {
    const preds = run();
    const personal = preds.flatMap((p) => p.cures).filter((c) => c.memberId);
    expect(personal.length).toBeGreaterThan(0);
    for (const c of personal) {
      expect(c.action).toMatch(/床头|座位/);
      expect(c.intent).toBe('化凶');
    }
  });

  it('八字残缺的成员不会被臆测（明确标注不参与加权）', () => {
    const son = run().find((p) => p.memberIds.includes('m-son'))!;
    const notes = son.perMember.find((m) => m.memberId === 'm-son')!.breakdown.map((b) => b.note).join('');
    expect(notes).toContain('无日主可依');
  });
});

describe('化解的用意', () => {
  it('吉组合的化解一律是催吉；通则里「生之」的句子也是催吉', () => {
    for (const c of COMBINATIONS.filter((x) => x.nature === '吉')) {
      for (const a of c.cures) expect(cureIntentOf(c, a)).toBe('催吉');
    }
    expect(cureIntentOf({ nature: '中' }, '八白（土）当令有力，宜以「火」生之：红色中国结，可加强其吉应。')).toBe('催吉');
    expect(cureIntentOf({ nature: '凶' }, '二黑（土）失令为患，宜以「金」泄之。')).toBe('化凶');
  });

  it('风险预测与预警只挂化凶，不会报凶却教人催吉', () => {
    for (const p of run()) for (const c of p.cures) expect(c.intent).toBe('化凶');
    const base = { profile: SAMPLE_PROFILE, members: SAMPLE_MEMBERS, qiMen: null, appliedCures: [] };
    for (const a of buildAlerts(base, 2026, 1, 6)) expect(a.action).not.toContain('加强其吉应');
  });

  it('催吉不会排在化凶急件前面', () => {
    const s = synthesise(sampleInput(2026));
    const first催吉 = s.prioritisedCures.findIndex((c) => c.intent === '催吉');
    const last急 = s.prioritisedCures.map((c) => c.urgency).lastIndexOf('立即');
    if (first催吉 >= 0 && last急 >= 0) expect(first催吉).toBeGreaterThan(last急);
    for (const c of s.prioritisedCures.filter((x) => x.intent !== '化凶')) expect(c.urgency).toBe('可从容安排');
  });
});

describe('矩阵按实际使用', () => {
  const s = synthesise(sampleInput(2026));
  const m = buildRoomMemberMatrix(s, SAMPLE_MEMBERS);

  it('别人的卧房对我实际强度为 0，但仍给出「假如住这里」的参考值', () => {
    const cell = m.index['m-son|r-master']!;
    expect(cell.exposure).toBe(0);
    expect(cell.overall).toBe(0);
    expect(Math.max(...Object.values(cell.ifUsed))).toBeGreaterThan(0);
    expect(cell.brief).toContain('不是小明的房间');
  });

  it('自己的卧房标为已使用、按全量计', () => {
    const cell = m.index['m-son|r-kid']!;
    expect(cell.occupied).toBe(true);
    expect(cell.exposure).toBe(1);
  });

  it('卫浴压在凶方时，强度低于同宫若是卧房', () => {
    const bath = SAMPLE_PROFILE.rooms.find((r) => r.kind === '卫浴')!;
    const asBed = {
      ...SAMPLE_PROFILE,
      rooms: SAMPLE_PROFILE.rooms.map((r) => (r.id === bath.id ? { ...r, kind: '次卧' as const, occupants: ['m-dad'] } : r)),
    };
    const s2 = synthesise({ ...sampleInput(2026), profile: asBed });
    const m2 = buildRoomMemberMatrix(s2, SAMPLE_MEMBERS);
    if (s.palaces[bath.primaryPalace].score < 0) {
      expect(m.index[`m-dad|${bath.id}`]!.ifUsed.健康).toBeLessThan(m2.index[`m-dad|${bath.id}`]!.ifUsed.健康);
    }
  });
});

describe('融合报告按人实际用到的地方', () => {
  it('房间分配建议只谈卧房书房，不谈大门厨房', () => {
    const r = buildFamilyFusionReport({ profile: SAMPLE_PROFILE, members: SAMPLE_MEMBERS, qiMen: null }, 2026, 3);
    for (const a of r.roomAssignmentAdvice) expect(a).not.toMatch(/「(大门|厨房|客厅)」/);
  });

  it('未指定住户时，建议里明说还没指定', () => {
    const r = buildFamilyFusionReport({ profile: unassigned, members: SAMPLE_MEMBERS, qiMen: null }, 2026, 3);
    expect(r.roomAssignmentAdvice.some((a) => a.includes('还没指定谁住'))).toBe(true);
  });
});
