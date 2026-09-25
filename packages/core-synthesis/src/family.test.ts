/**
 * 六亲与人生阶段 —— 行为锁。
 *
 * 守住的是：
 *   - 「西北缺角应在男主人」这类古法断语真的落到那个人身上，而不是只写在说明里
 *   - 十二岁的孩子不会被报「官非 77%」「财运 79%」
 *   - 每个人都能拿到一页「这屋对我」，全家能看到「成员 × 领域」总览
 */

import { describe, expect, it } from 'vitest';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { ROLE_PALACE, assignFamilyRoles, domainReading, lifeStageOf } from './family.js';
import { buildPersonView, familyOverview } from './person.js';
import { analyse, predict, probabilityFor } from './predict.js';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, makeMember, sampleInput } from './fixtures.js';

describe('六亲推定', () => {
  it('先认称谓', () => {
    const roles = assignFamilyRoles(SAMPLE_MEMBERS, 2026);
    expect(roles.get('m-dad')?.role).toBe('父');
    expect(roles.get('m-mom')?.role).toBe('母');
    expect(roles.get('m-son')?.role).toBe('长男');
    expect(roles.get('m-son')?.basis).toBe('称谓');
  });

  it('没写称谓时按性别与年龄推定，并标明是推定', () => {
    const fam = [
      makeMember('a', '甲', '男', 1980),
      makeMember('b', '乙', '女', 1982),
      makeMember('c', '丙', '男', 2010),
      makeMember('d', '丁', '男', 2013),
      makeMember('e', '戊', '女', 2012),
    ];
    const roles = assignFamilyRoles(fam, 2026);
    expect(roles.get('a')?.role).toBe('父');
    expect(roles.get('b')?.role).toBe('母');
    expect(roles.get('c')?.role).toBe('长男');
    expect(roles.get('d')?.role).toBe('中男');
    expect(roles.get('e')?.role).toBe('长女');
    for (const r of roles.values()) expect(r.basis).toBe('推定');
  });

  it('三代同堂：男主人不被爷爷挤掉，爷爷也不被排成长男', () => {
    const roles = assignFamilyRoles(
      [
        makeMember('gp', '爷爷', '男', 1950, { relation: '爷爷' }),
        makeMember('dad', '爸爸', '男', 1980, { relation: '男主人' }),
        makeMember('kid', '孙子', '男', 2012),
      ],
      2026,
    );
    expect(roles.get('dad')?.role).toBe('父');
    expect(roles.get('gp')).toBeUndefined();
    expect(roles.get('kid')?.role).toBe('长男');
  });

  it('独居者即宅主', () => {
    const roles = assignFamilyRoles([makeMember('x', '某女士', '女', 1990)], 2026);
    expect(roles.get('x')?.role).toBe('母');
  });

  it('同一位子两人争，年长者得之', () => {
    const roles = assignFamilyRoles(
      [makeMember('a', '哥', '男', 2005, { relation: '长子' }), makeMember('b', '弟', '男', 2008, { relation: '长子' })],
      2026,
    );
    expect(roles.get('a')?.role).toBe('长男');
    expect(roles.get('b')?.role).not.toBe('长男');
  });
});

describe('六亲应象落到人', () => {
  it('一宫所主之人，即便不用那里的房间，也会被点名', () => {
    // 西北（乾，父位）只有阳台；男主人并不常待阳台，但西北有缺角、二黑
    const input = sampleInput(2026);
    const preds = predict(input, synthesise(input));
    const nw = preds.filter((p) => p.palace === ROLE_PALACE.父);
    expect(nw.length).toBeGreaterThan(0);
    const dad = nw[0]!.perMember.find((m) => m.memberId === 'm-dad')!;
    expect(dad.liuQin).toBe('父亲／男主人');
    expect(dad.via).toContain('应在陈先生');
    // 六亲之人的受影响程度高于只是偶尔经过的家人
    const mom = nw[0]!.perMember.find((m) => m.memberId === 'm-mom')!;
    expect(dad.exposure).toBeGreaterThan(mom.exposure);
  });

  it('没有房间的宫也能落到六亲之人身上', () => {
    const noRoomNW: PropertyProfile = { ...SAMPLE_PROFILE, rooms: SAMPLE_PROFILE.rooms.filter((r) => r.primaryPalace !== 6) };
    const input = { ...sampleInput(2026), profile: noRoomNW };
    const preds = predict(input, synthesise(input));
    const nw = preds.filter((p) => p.palace === 6);
    expect(nw.length).toBeGreaterThan(0);
    for (const p of nw) expect(p.perMember.map((m) => m.memberId)).toEqual(['m-dad']);
  });
});

describe('人生阶段', () => {
  it('阶段划分', () => {
    const son = SAMPLE_MEMBERS.find((m) => m.id === 'm-son')!;
    expect(lifeStageOf(son, 2026)).toBe('儿童');
    expect(lifeStageOf(son, 2029)).toBe('少年');
    expect(lifeStageOf(makeMember('g', '爷爷', '男', 1950), 2026)).toBe('长者');
  });

  it('孩子不报财运、感情、人丁；事业读作学业，官非读作人际', () => {
    expect(domainReading('财运', '儿童')).toBeNull();
    expect(domainReading('感情', '少年')).toBeNull();
    expect(domainReading('人丁', '儿童')).toBeNull();
    expect(domainReading('事业', '儿童')?.label).toBe('学业');
    expect(domainReading('官非', '儿童')?.label).toBe('人际');
  });

  it('只有孩子住的房间，不出财运预测；事业条目显示为学业', () => {
    const input = sampleInput(2026);
    const preds = predict(input, synthesise(input));
    const kid = preds.filter((p) => p.room === '小明房');
    expect(kid.length).toBeGreaterThan(0);
    expect(kid.some((p) => p.domain === '财运')).toBe(false);
    for (const p of kid.filter((x) => x.domain === '事业')) {
      expect(p.domainLabel).toBe('学业');
      expect(p.headline).toContain('学业');
    }
    // 孩子在任何预测里都不会以财运、感情出现
    for (const p of preds.filter((x) => x.domain === '财运' || x.domain === '感情')) {
      expect(p.perMember.map((m) => m.memberId)).not.toContain('m-son');
    }
  });

  it('长者的健康比同一处成年人看得更重', () => {
    const grandpa = makeMember('m-gp', '爷爷', '男', 1950, { rooms: ['r-kid'] });
    const adult = makeMember('m-ad', '表哥', '男', 1990, { rooms: ['r-kid'] });
    const profile = {
      ...SAMPLE_PROFILE,
      rooms: SAMPLE_PROFILE.rooms.map((r) => (r.id === 'r-kid' ? { ...r, occupants: ['m-gp'] } : r)),
    };
    const input = { ...sampleInput(2026), profile, members: [grandpa] };
    const gp = predict(input, synthesise(input)).find((p) => p.domain === '健康' && p.room === '小明房')!;
    const gpRow = gp.perMember.find((m) => m.memberId === 'm-gp')!;
    expect(gpRow.stage).toBe('长者');
    expect(gpRow.breakdown.some((b) => b.factor === '人生阶段')).toBe(true);
    // 同样条件换成成年人，概率更低
    const profile2 = {
      ...SAMPLE_PROFILE,
      rooms: SAMPLE_PROFILE.rooms.map((r) => (r.id === 'r-kid' ? { ...r, occupants: ['m-ad'] } : r)),
    };
    const input2 = { ...sampleInput(2026), profile: profile2, members: [{ ...adult, mingGua: grandpa.mingGua, chart: { ...adult.chart, elementStrength: grandpa.chart.elementStrength } }] };
    const ad = predict(input2, synthesise(input2)).find((p) => p.domain === '健康' && p.room === '小明房')!;
    expect(probabilityFor(gp, 'm-gp')!).toBeGreaterThan(probabilityFor(ad, 'm-ad')!);
  });
});

describe('这屋对我', () => {
  const input = sampleInput(2026);
  const s = analyse(input, synthesise(input));

  it('每人一页：房间、六亲之宫、吉方、今年各领域、该做的事', () => {
    const v = buildPersonView(s, SAMPLE_MEMBERS, 'm-son')!;
    expect(v.stage).toBe('儿童');
    expect(v.roleLabel).toBe('长子');
    expect(v.rolePalace?.direction).toBe('正东');
    expect(v.rooms.map((r) => r.label)).toEqual(['小明房']);
    expect(v.bestDirections).toHaveLength(4);
    expect(v.domains.find((d) => d.domain === '财运')?.label).toBeNull();
    expect(v.domains.find((d) => d.domain === '事业')?.label).toBe('学业');
    expect(v.summary).toContain('小明');
    for (const it of v.items) expect(it.probability).toBe(probabilityFor(it.prediction, 'm-son'));
    for (let i = 1; i < v.items.length; i++) expect(v.items[i]!.probability).toBeLessThanOrEqual(v.items[i - 1]!.probability);
  });

  it('该做的事：个人化解排在前面，且不重复', () => {
    const v = buildPersonView(s, SAMPLE_MEMBERS, 'm-dad')!;
    expect(v.todo.length).toBeGreaterThan(0);
    expect(new Set(v.todo.map((c) => c.action)).size).toBe(v.todo.length);
    const firstGeneral = v.todo.findIndex((c) => !c.memberId);
    const lastPersonal = v.todo.map((c) => Boolean(c.memberId)).lastIndexOf(true);
    if (firstGeneral >= 0 && lastPersonal >= 0) expect(lastPersonal).toBeLessThan(firstGeneral);
  });

  it('没指定房间时明说', () => {
    const profile = { ...SAMPLE_PROFILE, rooms: SAMPLE_PROFILE.rooms.map((r) => ({ ...r, occupants: [] })) };
    const i2 = { ...input, profile };
    const s2 = analyse(i2, synthesise(i2));
    const v = buildPersonView(s2, SAMPLE_MEMBERS, 'm-dad')!;
    expect(v.unassigned).toBe(true);
    expect(v.summary).toContain('还没指定');
  });

  it('全家总览：每人一行，孩子的财运感情为不适用', () => {
    const rows = familyOverview(s, SAMPLE_MEMBERS);
    expect(rows).toHaveLength(3);
    const son = rows.find((r) => r.memberId === 'm-son')!;
    expect(son.cells.find((c) => c.domain === '财运')?.label).toBeNull();
    expect(son.cells.find((c) => c.domain === '感情')?.label).toBeNull();
    for (const r of rows) {
      for (const c of r.cells) if (c.probability != null) expect(c.probability).toBeGreaterThan(0);
    }
  });
});
