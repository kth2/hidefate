import { describe, expect, it } from 'vitest';
import { computeBaziChart } from '@hidefate/core-bazi';
import { periodOfYear, type PropertyProfile } from '@hidefate/core-fengshui';
import {
  FIDELITY_CAPABILITY,
  attributeTransition,
  buildLifeTimeline,
  detectBreakpoints,
  lifeYearAt,
  moveYears,
  naturalExperiments,
  residenceAt,
  resolveResidence,
  validateResidenceHistory,
  type Breakpoint,
  type ResidencePeriod,
} from './index.js';
import { SAMPLE_PROFILE } from './fixtures.js';

const CHART = computeBaziChart({ gender: '男', year: 1984, month: 3, day: 12, hour: 13 });

const res = (
  id: string,
  fromYear: number,
  toYear: number | null,
  fidelity: ResidencePeriod['fidelity'] = '罗盘实测',
  role: ResidencePeriod['role'] = '居家',
  propertyId = 'house-a',
): ResidencePeriod => ({ id, personId: 'p1', propertyId, fromYear, toYear, role, fidelity });

describe('居住史校验', () => {
  it('重叠是错误 —— 同一角色同一年不可能住两处', () => {
    const issues = validateResidenceHistory([res('a', 2010, 2015), res('b', 2014, 2020)]);
    const errs = issues.filter((i) => i.level === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain('重叠');
  });

  it('空档只是警告 —— 人确实可能有几年没记录，不该拦着他继续用', () => {
    const issues = validateResidenceHistory([res('a', 2010, 2013), res('b', 2018, 2020)]);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
    const warn = issues.find((i) => i.level === 'warning')!;
    expect(warn.message).toContain('2014');
    expect(warn.message).toContain('风水层将置零');
  });

  it('起止颠倒是错误', () => {
    const issues = validateResidenceHistory([res('a', 2020, 2010)]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('颠倒'))).toBe(true);
  });

  it('至今段最多一条', () => {
    const issues = validateResidenceHistory([res('a', 2010, null), res('b', 2020, null)]);
    expect(issues.some((i) => i.message.includes('最多只能有一段'))).toBe(true);
  });

  it('居家与办公各走一条轨，同年并存不算重叠', () => {
    const issues = validateResidenceHistory([
      res('home', 2010, 2020, '罗盘实测', '居家', 'house-a'),
      res('office', 2012, 2018, '罗盘实测', '办公', 'office-b'),
    ]);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('「兼」同时占两条轨，与任一角色相撞都算重叠', () => {
    const issues = validateResidenceHistory([
      res('both', 2010, 2020, '罗盘实测', '兼'),
      res('office', 2015, 2018, '罗盘实测', '办公', 'office-b'),
    ]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('重叠'))).toBe(true);
  });
});

describe('保真度分级：低保真段不得参与学习', () => {
  it('四档能力逐级递减', () => {
    expect(FIDELITY_CAPABILITY.罗盘实测.roomLevel).toBe(true);
    expect(FIDELITY_CAPABILITY.大致朝向.roomLevel).toBe(false);
    expect(FIDELITY_CAPABILITY.大致朝向.flyingStar).toBe(true);
    expect(FIDELITY_CAPABILITY.仅入住年.flyingStar).toBe(false);
    expect(FIDELITY_CAPABILITY.无资料.periodLayer).toBe(false);
  });

  it('仅入住年与无资料一律不可学，降权系数为 0', () => {
    for (const f of ['仅入住年', '无资料'] as const) {
      expect(FIDELITY_CAPABILITY[f].learnable).toBe(false);
      expect(FIDELITY_CAPABILITY[f].weight).toBe(0);
    }
  });

  it('保真度不足时不返回房产档案，避免拿全套盘冒充', () => {
    const props = new Map<string, PropertyProfile>([['house-a', SAMPLE_PROFILE]]);
    expect(resolveResidence(res('a', 2010, 2015, '罗盘实测'), props).profile).not.toBeNull();
    expect(resolveResidence(res('a', 2010, 2015, '仅入住年'), props).profile).toBeNull();
  });
});

describe('取某年生效的居住段', () => {
  const history = [
    res('a', 2005, 2012, '罗盘实测', '居家', 'house-a'),
    res('b', 2013, null, '罗盘实测', '居家', 'house-b'),
    res('o', 2010, 2020, '罗盘实测', '办公', 'office-c'),
  ];

  it('按年份命中对应段', () => {
    expect(residenceAt(history, 'p1', 2008).map((p) => p.id)).toEqual(['a']);
    expect(residenceAt(history, 'p1', 2015).map((p) => p.id).sort()).toEqual(['b', 'o']);
  });

  it('至今段一直有效', () => {
    expect(residenceAt(history, 'p1', 2050).map((p) => p.id)).toEqual(['b']);
  });

  it('按角色筛选', () => {
    expect(residenceAt(history, 'p1', 2015, '办公').map((p) => p.id)).toEqual(['o']);
  });

  it('别人的居住史不会串进来', () => {
    expect(residenceAt(history, 'p2', 2015)).toHaveLength(0);
  });

  it('最早一段的起始年不算搬家', () => {
    expect(moveYears(history, 'p1')).toEqual([2010, 2013]);
  });
});

describe('断点检测', () => {
  const history = [res('a', 1990, 2011), res('b', 2012, null, '罗盘实测', '居家', 'house-b')];

  it('大运交界、搬家、化解都是个人断点', () => {
    const bps = detectBreakpoints({
      personId: 'p1', fromYear: 2000, toYear: 2030,
      decades: CHART.decades, residences: history, cureYears: [2026],
    });
    const kinds = new Set(bps.filter((b) => b.personal).map((b) => b.kind));
    expect(kinds).toContain('大运交界');
    expect(kinds).toContain('搬家');
    expect(kinds).toContain('施做化解');
  });

  it('元运换运标为非个人断点，并写明没有对照组', () => {
    const bps = detectBreakpoints({ personId: 'p1', fromYear: 2000, toYear: 2030 });
    const yun = bps.filter((b) => b.kind === '元运换运');
    expect(yun.length).toBeGreaterThan(0);
    for (const b of yun) {
      expect(b.personal).toBe(false);
      expect(b.detail).toContain('无对照组');
    }
    // 2004 与 2024 都是换运年
    expect(yun.map((b) => b.year)).toEqual([periodOfYear(2004).startYear, periodOfYear(2024).startYear]);
  });

  it('区间外的断点不收', () => {
    const bps = detectBreakpoints({
      personId: 'p1', fromYear: 2015, toYear: 2020, residences: history,
    });
    expect(bps.some((b) => b.kind === '搬家')).toBe(false);
  });

  it('输出按年份排序', () => {
    const bps = detectBreakpoints({
      personId: 'p1', fromYear: 1990, toYear: 2030,
      decades: CHART.decades, residences: history, cureYears: [2026],
    });
    for (let i = 1; i < bps.length; i++) {
      expect(bps[i]!.year).toBeGreaterThanOrEqual(bps[i - 1]!.year);
    }
  });
});

describe('自然实验归因', () => {
  const bp = (year: number, kind: Breakpoint['kind'], personal = true): Breakpoint => ({
    year, kind, personal, detail: '',
  });

  it('只有搬家、大运未换 → 风水层，且是干净的自然实验', () => {
    const a = attributeTransition(2015, [bp(2015, '搬家')]);
    expect(a.verdict).toBe('风水层');
    expect(a.usable).toBe(true);
    expect(a.reason).toContain('自然实验');
  });

  it('只有大运交界、居所未动 → 命层', () => {
    const a = attributeTransition(2015, [bp(2015, '大运交界')]);
    expect(a.verdict).toBe('命层');
    expect(a.usable).toBe(true);
  });

  it('两层断点撞在一起 → 无法分辨，不作证据', () => {
    const a = attributeTransition(2015, [bp(2015, '搬家'), bp(2015, '大运交界')]);
    expect(a.verdict).toBe('无法分辨');
    expect(a.usable).toBe(false);
    expect(a.reason).toContain('混杂');
  });

  it('只有元运换运 → 拒绝归因，明说没有对照组', () => {
    const a = attributeTransition(2024, [bp(2024, '元运换运', false)]);
    expect(a.verdict).toBe('无法分辨');
    expect(a.usable).toBe(false);
    expect(a.reason).toContain('没有对照组');
  });

  it('元运换运不会把本来干净的搬家实验污染掉', () => {
    const a = attributeTransition(2024, [bp(2024, '搬家'), bp(2024, '元运换运', false)]);
    expect(a.verdict).toBe('风水层');
    expect(a.usable).toBe(true);
  });

  it('无任何断点 → 归运层', () => {
    const a = attributeTransition(2015, []);
    expect(a.verdict).toBe('运层');
    expect(a.usable).toBe(true);
    expect(a.reason).toContain('大运未换');
  });

  it('容差窗口内的断点也算数（转折未必与断点同年落地）', () => {
    expect(attributeTransition(2016, [bp(2015, '搬家')]).verdict).toBe('风水层');
    expect(attributeTransition(2018, [bp(2015, '搬家')]).verdict).toBe('运层');
    expect(attributeTransition(2018, [bp(2015, '搬家')], { toleranceYears: 3 }).verdict).toBe('风水层');
  });

  it('自然实验清单只留可分辨且非运层的年份', () => {
    const bps = [bp(2010, '搬家'), bp(2015, '搬家'), bp(2015, '大运交界'), bp(2024, '元运换运', false)];
    const list = naturalExperiments(bps);
    expect(list.map((a) => a.year)).toEqual([2010]);
  });
});

describe('人视角一生时间轴', () => {
  const props = new Map<string, PropertyProfile>([['house-a', SAMPLE_PROFILE]]);
  const history = [
    res('a', 2005, 2011, '罗盘实测'),
    res('b', 2012, 2017, '仅入住年', '居家', 'house-b'),
    res('c', 2018, null, '大致朝向', '居家', 'house-c'),
  ];
  const tl = buildLifeTimeline({
    personId: 'p1', chart: CHART, fromYear: 2000, toYear: 2030,
    residences: history, properties: props, cureYears: [2026],
  });

  it('逐年装配，虚岁正确', () => {
    expect(tl.years).toHaveLength(31);
    expect(lifeYearAt(tl, 2000)!.age).toBe(2000 - 1984 + 1);
  });

  it('命层带出该年大运与流年十神', () => {
    const y = lifeYearAt(tl, 2020)!;
    expect(y.ming.liuNianGanZhi).toBe('庚子');
    expect(y.ming.decadeGanZhi).not.toBeNull();
    expect(y.ming.liuNianShiShen).not.toBeNull();
  });

  it('风水层按居住段拼接 —— 不同年份取不同的房子', () => {
    expect(lifeYearAt(tl, 2008)!.fengShui.residences[0]!.period.id).toBe('a');
    expect(lifeYearAt(tl, 2015)!.fengShui.residences[0]!.period.id).toBe('b');
    expect(lifeYearAt(tl, 2025)!.fengShui.residences[0]!.period.id).toBe('c');
  });

  it('无居住记录的年份明说置零，不用最近一段去顶替', () => {
    const y = lifeYearAt(tl, 2002)!;
    expect(y.fengShui.residences).toHaveLength(0);
    expect(y.fengShui.evidenceUsable).toBe(false);
    expect(y.fengShui.weight).toBe(0);
    expect(y.fengShui.note).toContain('风水层置零');
  });

  it('低保真段有记录但不作证据', () => {
    const y = lifeYearAt(tl, 2015)!;
    expect(y.fengShui.residences).toHaveLength(1);
    expect(y.fengShui.evidenceUsable).toBe(false);
    expect(y.fengShui.note).toContain('保真度不足');
  });

  it('大致朝向可作证据但降权', () => {
    const y = lifeYearAt(tl, 2025)!;
    expect(y.fengShui.evidenceUsable).toBe(true);
    expect(y.fengShui.weight).toBe(FIDELITY_CAPABILITY.大致朝向.weight);
  });

  it('元运与流年紫白逐年算出', () => {
    const y = lifeYearAt(tl, 2026)!;
    expect(y.fengShui.period).toBe(periodOfYear(2026).period);
    expect(y.fengShui.annualStarName.length).toBeGreaterThan(0);
  });

  it('断点挂到对应年份上', () => {
    expect(lifeYearAt(tl, 2012)!.breakpoints.some((b) => b.kind === '搬家')).toBe(true);
    expect(lifeYearAt(tl, 2026)!.breakpoints.some((b) => b.kind === '施做化解')).toBe(true);
    expect(lifeYearAt(tl, 2024)!.breakpoints.some((b) => b.kind === '元运换运')).toBe(true);
  });

  it('覆盖率照实说，并指出补什么资料能换来什么', () => {
    const c = tl.coverage;
    expect(c.totalYears).toBe(31);
    expect(c.usableYears + c.uncoveredYears + c.lowFidelityYears).toBe(31);
    expect(c.uncoveredYears).toBeGreaterThan(0);
    expect(c.lowFidelityYears).toBeGreaterThan(0);
    expect(c.summary).toContain('补上老宅');
  });

  it('全程资料齐全时不啰嗦', () => {
    const clean = buildLifeTimeline({
      personId: 'p1', chart: CHART, fromYear: 2005, toYear: 2010,
      residences: [res('a', 2000, null, '罗盘实测')], properties: props,
    });
    expect(clean.coverage.summary).toContain('全部有可用的风水资料');
  });

  it('无居住史也能建时间轴，只是风水层全零', () => {
    const bare = buildLifeTimeline({ personId: 'p1', chart: CHART, fromYear: 2020, toYear: 2022 });
    expect(bare.years).toHaveLength(3);
    expect(bare.coverage.usableYears).toBe(0);
    expect(bare.years[0]!.ming.liuNianGanZhi).toBe('庚子');
  });

  it('起止颠倒或跨度过长抛错', () => {
    expect(() =>
      buildLifeTimeline({ personId: 'p1', chart: CHART, fromYear: 2030, toYear: 2000 }),
    ).toThrow(/颠倒/);
    expect(() =>
      buildLifeTimeline({ personId: 'p1', chart: CHART, fromYear: 1900, toYear: 2100 }),
    ).toThrow(/过长/);
  });

  it('区间外的年份取不到', () => {
    expect(lifeYearAt(tl, 1999)).toBeNull();
  });
});
