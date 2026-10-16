import { describe, expect, it } from 'vitest';
import { annualSha, liChunOf } from '@hidefate/core-fengshui';
import { sampleInput } from './fixtures.js';
import { synthesise } from './assess.js';
import { TIER_ORDER, actionsFromAnnualSha, buildActionPlan, findConflicts, inferTier, sortActions, type Action } from './action.js';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('层级推断', () => {
  it('能移位的先算移位，即使文中也有摆件', () => {
    expect(inferTier('西南为宅之「绝命」方，却安排了主卧：优先考虑与吉方房间对调')).toBe('移形易位');
    expect(inferTier('将床移至东墙，并置铜葫芦')).toBe('移形易位');
  });
  it('改用途、摆件、避让、观察各归其类', () => {
    expect(inferTier('该宫化为静区（储藏、走道），移走卧床与灶位。')).toBe('移形易位');
    expect(inferTier('宜作书房、办公位；置金属与清水组合')).toBe('改房间用途');
    expect(inferTier('悬挂六帝古钱或纯铜风铃（金泄土）')).toBe('物件化解');
    expect(inferTier('此方绝对静止：不动土、不装修、不长时间停留')).toBe('择时避让');
    expect(inferTier('定期留心')).toBe('留意观察');
  });
});

describe('流年煞方行动', () => {
  it('2027：北（五黄）、东北（岁破）为必做，起讫为两个立春', () => {
    const acts = actionsFromAnnualSha(annualSha(2027));
    const north = acts.find((a) => a.where.palace === 1)!;
    const ne = acts.find((a) => a.where.palace === 8)!;
    expect(north.priority).toBe('必做');
    expect(ne.priority).toBe('必做');
    expect(north.when.doBy).toBe(iso(liChunOf(2027)));
    expect(north.when.undoAfter).toBe(iso(liChunOf(2028)));
    expect(acts.every((a) => a.where.palace !== 5)).toBe(true);
    // 西方三煞
    expect(acts.some((a) => a.where.palace === 7 && a.because[0]!.summary.includes('三煞'))).toBe(true);
  });
});

describe('行动清单', () => {
  const s = synthesise(sampleInput(2026));
  const plan = buildActionPlan(s);

  it('不为空，且每张卡都有落点、时间说明与理由', () => {
    expect(plan.actions.length).toBeGreaterThan(0);
    for (const a of plan.actions) {
      expect(a.where.direction.length).toBeGreaterThan(0);
      expect(a.when.label.length).toBeGreaterThan(0);
      expect(a.because.length).toBeGreaterThan(0);
      expect(a.author).toBe('引擎');
    }
  });

  it('排序：优先级先、层级次', () => {
    const P = ['必做', '宜做', '可选'];
    for (let i = 1; i < plan.actions.length; i++) {
      const a = plan.actions[i - 1]!;
      const b = plan.actions[i]!;
      const pa = P.indexOf(a.priority);
      const pb = P.indexOf(b.priority);
      expect(pa).toBeLessThanOrEqual(pb);
      if (pa === pb) expect(TIER_ORDER.indexOf(a.tier)).toBeLessThanOrEqual(TIER_ORDER.indexOf(b.tier));
    }
  });

  it('催吉另列，化凶清单里没有催吉', () => {
    expect(plan.mustAddress.every((a) => a.intent !== '催吉')).toBe(true);
    expect(plan.enhancements.every((a) => a.intent === '催吉')).toBe(true);
  });

  it('「今年」类化解必带撤除日期（明年立春）', () => {
    for (const a of plan.actions.filter((x) => x.title.startsWith('今年'))) {
      expect(a.when.undoAfter).toBe(iso(liChunOf(2027)));
    }
  });

  it('同宫同文合并，不重复出卡', () => {
    const keys = plan.actions.map((a) => `${a.where.palace}|${a.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('同优先级同层级时，受影响人数多者在前', () => {
    const mk = (n: number, id: string): Action => ({
      ...plan.actions[0]!, id, priority: '宜做', tier: '物件化解', effort: '小改',
      forMembers: Array.from({ length: n }, (_, i) => `m${i}`),
    });
    expect(sortActions([mk(1, 'a'), mk(3, 'b')]).map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('合参结果带门派与格局', () => {
  it('不传门派设置：school 为默认、运盘仍取入住年', () => {
    const s = synthesise(sampleInput(2026));
    expect(s.school!.periodBasis).toBe('入住年');
    expect(s.chartYear!.year).toBe(sampleInput(2026).profile.moveInYear);
    expect(s.geju).toBeDefined();
  });

  it('改选建成年：运盘随之改运', () => {
    const base = sampleInput(2026);
    const s = synthesise({ ...base, profile: { ...base.profile, moveInYear: 2025, builtYear: 2018 }, school: { periodBasis: '建成年' } });
    expect(s.flyingStar.period.period).toBe(8);
    expect(s.geju!.items.some((g) => g.kind === '失运')).toBe(true);
  });
});

describe('旺衰以宅运／时运论', () => {
  it('默认宅运：八运宅在 2026 年仍以八运论旺衰（旧行为不变）', () => {
    const base = sampleInput(2026);
    const s = synthesise({ ...base, profile: { ...base.profile, moveInYear: 2010 } });
    expect(s.phasePeriod).toBe(8);
  });

  it('选时运：八运宅在 2026 年以九运论旺衰，评分随之改变', () => {
    const base = sampleInput(2026);
    const input = { ...base, profile: { ...base.profile, moveInYear: 2010 } };
    const a = synthesise(input);
    const b = synthesise({ ...input, school: { phaseBasis: '时运' as const } });
    expect(b.phasePeriod).toBe(9);
    expect(b.flyingStar.period.period).toBe(8); // 盘不变，只是旺衰的尺子换了
    const diff = Object.values(a.palaces).some((p) => Math.abs(p.score - b.palaces[p.palace].score) > 1e-9);
    expect(diff).toBe(true);
  });

  it('当运之宅两说一致', () => {
    const base = sampleInput(2026);
    const input = { ...base, profile: { ...base.profile, moveInYear: 2025 } };
    const a = synthesise(input);
    const b = synthesise({ ...input, school: { phaseBasis: '时运' as const } });
    expect(b.overallScore).toBeCloseTo(a.overallScore, 12);
  });
});

describe('同宫化解矛盾', () => {
  it('A 所摆正是 B 所忌 → 标出，不替风水师选边', () => {
    const s = synthesise(sampleInput(2026));
    const base = buildActionPlan(s).actions[0]!;
    const a: Action = { ...base, id: 'a', title: '置深色鱼缸泄金', avoid: [] };
    const b: Action = { ...base, id: 'b', title: '悬挂铜葫芦泄土', avoid: ['深色鱼缸', '红色'] };
    const c = findConflicts([a, b]);
    expect(c).toHaveLength(1);
    expect(c[0]!.term).toBe('深色鱼缸');
  });

  it('不同宫不算矛盾', () => {
    const s = synthesise(sampleInput(2026));
    const base = buildActionPlan(s).actions[0]!;
    const a: Action = { ...base, id: 'a', title: '置深色鱼缸', avoid: [], where: { palace: 1, direction: '正北' } };
    const b: Action = { ...base, id: 'b', title: '挂铜器', avoid: ['深色鱼缸'], where: { palace: 9, direction: '正南' } };
    expect(findConflicts([a, b])).toHaveLength(0);
  });
});
