import { describe, expect, it } from 'vitest';
import { annualSha, liChunOf, resolveSchool, schoolHashPart } from '@hidefate/core-fengshui';
import { buildTimeline } from './timeline.js';
import { monthlyOutlook } from './monthly.js';
import { buildFamilyFusionReport } from './report.js';
import { sampleInput } from './fixtures.js';
import { synthesise } from './assess.js';
import { CATEGORY_ORDER, actionsFromAnnualSha, buildActionPlan, findConflicts, inferTier, sortActions, type Action } from './action.js';

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
  it('2027：北（五黄）、东北（岁破）为本派建议，起讫为两个立春', () => {
    const acts = actionsFromAnnualSha(annualSha(2027));
    const north = acts.find((a) => a.where.palace === 1)!;
    const ne = acts.find((a) => a.where.palace === 8)!;
    expect(north.category).toBe('本派建议');
    expect(ne.category).toBe('本派建议');
    expect(north.reversibility).toBe('可逆');
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

  it('排序：安全须知 → 本派建议 → 可选；同类先依据完整、再可逆、再省事', () => {
    const E = ['完整', '初步'];
    const R = ['可逆', '部分可逆', '不可逆'];
    for (let i = 1; i < plan.actions.length; i++) {
      const a = plan.actions[i - 1]!;
      const b = plan.actions[i]!;
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      expect(ca).toBeLessThanOrEqual(cb);
      if (ca === cb) {
        expect(E.indexOf(a.evidence)).toBeLessThanOrEqual(E.indexOf(b.evidence));
        if (a.evidence === b.evidence) expect(R.indexOf(a.reversibility)).toBeLessThanOrEqual(R.indexOf(b.reversibility));
      }
    }
  });

  it('不再有「必做」：传统建议最多是「本派建议」，只有实际安全事项才是「安全须知」', () => {
    expect(JSON.stringify(plan)).not.toMatch(/必做/);
    for (const a of plan.actions.filter((x) => x.category === '安全须知')) {
      expect(a.title).toMatch(/消防|烟感|电线|燃气|线路|漏电|防滑|扶手|逃生|通风/);
    }
  });

  it('装修级或不可逆的行动须屋主同意；引擎行动一律待审', () => {
    for (const a of plan.actions) {
      if (a.effort === '装修级' || a.reversibility === '不可逆') expect(a.needsOwnerApproval).toBe(true);
      expect(a.approval).toBe('待审');
    }
  });

  it('矛盾的两条都不进 mustAddress，改进 needsReview', () => {
    const base = sampleInput(2026);
    const s2 = synthesise({ ...base, profile: { ...base.profile, sitting: 135, moveInYear: 2010 } });
    const p2 = buildActionPlan(s2);
    if (p2.conflicts.length > 0) {
      const ids = new Set(p2.needsReview.map((a) => a.id));
      for (const c of p2.conflicts) {
        expect(ids.has(c.recommendsId) && ids.has(c.forbidsId)).toBe(true);
        expect(p2.mustAddress.some((a) => a.id === c.recommendsId || a.id === c.forbidsId)).toBe(false);
      }
    }
  });

  it('没标房间的盘（十秒起盘）一律「初步」', () => {
    const base = sampleInput(2026);
    const s3 = synthesise({ ...base, members: [], profile: { ...base.profile, rooms: [] } });
    expect(buildActionPlan(s3).actions.every((a) => a.evidence === '初步')).toBe(true);
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

  it('其余全同时，受影响人数多者在前', () => {
    const mk = (n: number, id: string): Action => ({
      ...plan.actions[0]!, id, category: '本派建议', evidence: '完整', reversibility: '可逆', tier: '物件化解', effort: '小改',
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

describe('门派设置贯穿所有派生输出（第零期审计 D3）', () => {
  const base = sampleInput(2026);
  const input = { ...base, profile: { ...base.profile, moveInYear: 2010 } };
  const time = { profile: input.profile, members: input.members, qiMen: null, appliedCures: [] };

  it('不传门派与传默认门派，结果逐字节相同', () => {
    const a = JSON.stringify(buildTimeline(time, { startYear: 2026, span: 3 }));
    const b = JSON.stringify(buildTimeline({ ...time, school: {} }, { startYear: 2026, span: 3 }));
    expect(b).toBe(a);
  });

  it('改旺衰取运，时间轴、逐月、融合报告、预警同时改变', () => {
    const sch = { phaseBasis: '时运' as const };
    const tl0 = buildTimeline(time, { startYear: 2026, span: 3 });
    const tl1 = buildTimeline({ ...time, school: sch }, { startYear: 2026, span: 3 });
    expect(JSON.stringify(tl1.years.map((y) => y.overallScore))).not.toBe(JSON.stringify(tl0.years.map((y) => y.overallScore)));

    const m0 = monthlyOutlook(time, 2026, 1, 3);
    const m1 = monthlyOutlook({ ...time, school: sch }, 2026, 1, 3);
    expect(JSON.stringify(m1.rows)).not.toBe(JSON.stringify(m0.rows));

    const f0 = buildFamilyFusionReport(time, 2026, 3);
    const f1 = buildFamilyFusionReport({ ...time, school: sch }, 2026, 3);
    expect(JSON.stringify(f1)).not.toBe(JSON.stringify(f0));
  });

  it('门派进账本哈希：全默认不进（旧哈希不变），改过才进', () => {
    expect(schoolHashPart(resolveSchool())).toBeUndefined();
    expect(schoolHashPart(resolveSchool({ phaseBasis: '时运' }))).toEqual({ phaseBasis: '时运' });
  });
});
