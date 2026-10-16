import { describe, expect, it } from 'vitest';
import { buildFlyingStarChart } from './flyingStar.js';
import { assessGeJu, isConsecutiveTriple } from './geju.js';
import { annualSha, inSector } from './annualSha.js';
import { DEFAULT_SCHOOL, describeSchool, resolveChartYear, resolveSchool, schoolDeviations } from './school.js';
import { MOUNTAINS } from './mountains.js';
import { fengShuiYearOf, liChunOf, periodTransitionNote } from './period.js';
import { PALACE_INDEXES, type PalaceIndex } from './constants.js';

const kinds = (sit: number, year: number, now = 2026, useTiXing = false) =>
  assessGeJu(buildFlyingStarChart({ sitting: sit, moveInYear: year, useTiXing }), now).items.map((i) => i.kind);

describe('玄空格局：伏吟反吟', () => {
  it('八运艮山坤向：向星五入中顺飞 → 全盘向星伏吟（上山下水之局）', () => {
    const c = buildFlyingStarChart({ sitting: 45, moveInYear: 2010 });
    expect(c.pattern).toBe('上山下水');
    expect(c.xiangPan[5]).toBe(5);
    expect(kinds(45, 2010)).toContain('向星伏吟');
  });

  it('九运子山午向：山星五入中逆飞 → 全盘山星反吟', () => {
    const c = buildFlyingStarChart({ sitting: 0, moveInYear: 2025 });
    expect(c.shanPan[5]).toBe(5);
    expect(kinds(0, 2025)).toContain('山星反吟');
  });

  it('九运午山子向：向星五入中逆飞 → 全盘向星反吟', () => {
    expect(kinds(180, 2025)).toContain('向星反吟');
  });

  it('全盘伏反吟判定与定义逐宫一致（二十四山 × 九运全量）', () => {
    for (const m of MOUNTAINS) {
      for (let p = 1; p <= 9; p++) {
        const c = buildFlyingStarChart({ sitting: m.center, period: p as PalaceIndex, useTiXing: false });
        const items = assessGeJu(c, 2026).items;
        for (const g of items) {
          const plate = g.kind.startsWith('山星') ? c.shanPan : c.xiangPan;
          if (g.kind === '山星伏吟' || g.kind === '向星伏吟') {
            for (const q of PALACE_INDEXES) expect(plate[q]).toBe(q);
          }
          if (g.kind === '山星反吟' || g.kind === '向星反吟') {
            for (const q of PALACE_INDEXES) expect(plate[q] + q).toBe(10);
          }
          if (g.kind === '山星合十') for (const q of PALACE_INDEXES) expect(c.shanPan[q] + c.yunPan[q]).toBe(10);
          if (g.kind === '向星合十') for (const q of PALACE_INDEXES) expect(c.xiangPan[q] + c.yunPan[q]).toBe(10);
          if (g.kind === '连珠三般卦') {
            for (const q of PALACE_INDEXES) expect(isConsecutiveTriple(c.yunPan[q], c.shanPan[q], c.xiangPan[q])).toBe(true);
          }
        }
        // 反过来：五入中的盘必定被报出伏吟或反吟
        if (c.shanPan[5] === 5) expect(items.some((g) => g.kind === '山星伏吟' || g.kind === '山星反吟')).toBe(true);
        if (c.xiangPan[5] === 5) expect(items.some((g) => g.kind === '向星伏吟' || g.kind === '向星反吟')).toBe(true);
      }
    }
  });

  it('全盘已报伏反吟者，不再重复报坐山／向首局部伏反吟', () => {
    const items = assessGeJu(buildFlyingStarChart({ sitting: 45, moveInYear: 2010 }), 2026).items;
    expect(items.some((g) => g.kind === '向首伏吟' || g.kind === '向首反吟')).toBe(false);
  });
});

describe('玄空格局：三般卦与合十', () => {
  it('相连三数判定含 9-1 环接', () => {
    expect(isConsecutiveTriple(1, 2, 3)).toBe(true);
    expect(isConsecutiveTriple(8, 9, 1)).toBe(true);
    expect(isConsecutiveTriple(9, 1, 2)).toBe(true);
    expect(isConsecutiveTriple(1, 3, 5)).toBe(false);
    expect(isConsecutiveTriple(2, 2, 3)).toBe(false);
  });

  it('八运艮山坤向逐宫同属 147/258/369 → 父母三般卦', () => {
    expect(kinds(45, 2010)).toContain('父母三般卦');
  });
});

describe('玄空格局：入囚与失运', () => {
  it('八运巽山乾向：中宫向星九紫，入九运即向星入囚（当前）', () => {
    const r = assessGeJu(buildFlyingStarChart({ sitting: 135, moveInYear: 2010 }), 2026);
    const q = r.items.find((g) => g.kind === '向星入囚')!;
    expect(q).toBeDefined();
    expect(q.valence).toBe('凶');
    expect(q.window).toEqual({ startYear: 2024, endYear: 2043 });
    // 例外必须提示而非静默豁免
    expect(q.caveats.join('')).toMatch(/见真水/);
  });

  it('旧运之宅在新运必报失运，并提示换天心', () => {
    const r = assessGeJu(buildFlyingStarChart({ sitting: 135, moveInYear: 2010 }), 2026);
    const s = r.items.find((g) => g.kind === '失运')!;
    expect(s.caveats.join('')).toMatch(/换天心/);
  });

  it('当运之宅不报失运', () => {
    expect(kinds(0, 2025)).not.toContain('失运');
  });

  it('未来入囚只报四十年内的', () => {
    for (const m of MOUNTAINS) {
      const r = assessGeJu(buildFlyingStarChart({ sitting: m.center, moveInYear: 2025 }), 2026);
      for (const g of r.items.filter((x) => x.kind === '向星入囚' && x.valence === '中')) {
        expect(g.window!.startYear - 2026).toBeLessThanOrEqual(40);
        expect(g.window!.startYear).toBeGreaterThan(2026);
      }
    }
  });

  it('每条格局都有出处字段与至少一条例外说明', () => {
    for (const m of MOUNTAINS) {
      for (const g of assessGeJu(buildFlyingStarChart({ sitting: m.center, moveInYear: 2010 }), 2026).items) {
        expect(g.classic.length).toBeGreaterThan(0);
        expect(g.caveats.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('流年煞方', () => {
  it('2026 丙午：五黄到南、太岁午、岁破子、三煞在北', () => {
    const a = annualSha(2026);
    expect(a.zhi).toBe('午');
    expect(a.wuHuang).toBe(9);
    expect(a.taiSui.mountains[0]!.name).toBe('午');
    expect(a.suiPo.mountains[0]!.name).toBe('子');
    expect(a.sanSha.mountains.map((m) => m.name)).toEqual(['亥', '子', '丑']);
    expect(a.summary).toMatch(/三煞在北方/);
  });

  it('2027 丁未：五黄到北、二黑到西、太岁未、岁破丑、三煞在西', () => {
    const a = annualSha(2027);
    expect(a.zhi).toBe('未');
    expect(a.wuHuang).toBe(1);
    expect(a.erHei).toBe(7);
    expect(a.suiPo.mountains[0]!.name).toBe('丑');
    expect(a.sanSha.mountains.map((m) => m.name)).toEqual(['申', '酉', '戌']);
    expect(a.sanSha.range).toEqual([232.5, 307.5]);
    expect(a.summary).toMatch(/三煞在西方/);
  });

  it('三煞永远在三合局所克之方，且十二年一轮', () => {
    for (let y = 2020; y < 2032; y++) {
      const a = annualSha(y);
      const b = annualSha(y + 12);
      expect(b.sanSha.mountains.map((m) => m.name)).toEqual(a.sanSha.mountains.map((m) => m.name));
      expect(b.taiSui.mountains[0]!.name).toBe(a.taiSui.mountains[0]!.name);
    }
  });

  it('扇区跨北判定', () => {
    const north = annualSha(2026).sanSha; // 亥子丑 322.5–37.5
    expect(inSector(0, north)).toBe(true);
    expect(inSector(350, north)).toBe(true);
    expect(inSector(30, north)).toBe(true);
    expect(inSector(90, north)).toBe(false);
  });

  it('动土避忌宫位不含中宫', () => {
    for (let y = 2020; y < 2040; y++) expect(annualSha(y).avoidGroundworkPalaces).not.toContain(5);
  });
});

describe('门派设置', () => {
  it('默认与引擎原行为一致：入住年、随运星、3°', () => {
    expect(DEFAULT_SCHOOL.periodBasis).toBe('入住年');
    expect(DEFAULT_SCHOOL.centerFiveRule).toBe('随运星');
    expect(DEFAULT_SCHOOL.jianThreshold).toBe(3);
    expect(schoolDeviations(DEFAULT_SCHOOL)).toEqual([]);
  });

  it('兼向阈值夹在 2°–4.5°', () => {
    expect(resolveSchool({ jianThreshold: 9 }).jianThreshold).toBe(4.5);
    expect(resolveSchool({ jianThreshold: 0 }).jianThreshold).toBe(2);
  });

  it('资料缺失时明说回退', () => {
    const r = resolveChartYear({ moveInYear: 2025 }, '建成年');
    expect(r).toMatchObject({ year: 2025, used: '入住年', fellBack: true });
    expect(r.note).toMatch(/回退/);
    expect(resolveChartYear({ moveInYear: 2025, builtYear: 2019 }, '建成年')).toMatchObject({ year: 2019, used: '建成年' });
    expect(resolveChartYear({ moveInYear: 2015, renovatedYear: 2025 }, '换天心年').year).toBe(2025);
  });

  it('选入住年但另有大装修年时，提示而不自动采用', () => {
    const r = resolveChartYear({ moveInYear: 2015, renovatedYear: 2025 }, '入住年');
    expect(r.year).toBe(2015);
    expect(r.note).toMatch(/换天心/);
  });

  it('建成年在八运、入住在九运：同一屋两种盘，门派决定用哪张', () => {
    const built = buildFlyingStarChart({ sitting: 135, moveInYear: resolveChartYear({ moveInYear: 2025, builtYear: 2019 }, '建成年').year });
    const moved = buildFlyingStarChart({ sitting: 135, moveInYear: resolveChartYear({ moveInYear: 2025, builtYear: 2019 }, '入住年').year });
    expect(built.period.period).toBe(8);
    expect(moved.period.period).toBe(9);
  });

  it('报告页脚八项齐全', () => {
    expect(describeSchool(DEFAULT_SCHOOL)).toHaveLength(8);
  });
});

describe('立春时刻与设备时区无关（第零期审计 D4）', () => {
  // 期望值为北京时间立春时刻换算成 UTC：2024-02-04 16:27:07 CST、2027-02-04 09:46:18 CST。
  const EXPECT = { 2024: '2024-02-04T08:27:07.000Z', 2027: '2027-02-04T01:46:18.000Z' } as const;

  it.each(['Asia/Kuala_Lumpur', 'America/New_York', 'Europe/London', 'Australia/Sydney', 'UTC'])('%s 下立春时刻相同', (tz) => {
    const prev = process.env.TZ;
    process.env.TZ = tz;
    try {
      expect(liChunOf(2024).toISOString()).toBe(EXPECT[2024]);
      expect(liChunOf(2027).toISOString()).toBe(EXPECT[2027]);
    } finally {
      process.env.TZ = prev;
    }
  });

  it('立春前一刻仍属上一年', () => {
    const t = liChunOf(2027).getTime();
    expect(fengShuiYearOf(new Date(t - 60_000))).toBe(2026);
    expect(fengShuiYearOf(new Date(t + 60_000))).toBe(2027);
  });
});

describe('换运年提示（第零期审计 D7）', () => {
  it('2024、2044 为换运年，提示改填前一年；其余年份不提示', () => {
    expect(periodTransitionNote(2024)).toMatch(/2 月 4 日立春之前.*八运.*2023/);
    expect(periodTransitionNote(2044)).toMatch(/2043/);
    expect(periodTransitionNote(2025)).toBeNull();
    expect(periodTransitionNote(2023)).toBeNull();
  });
});
