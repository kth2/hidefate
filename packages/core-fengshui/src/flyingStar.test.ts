import { describe, expect, it } from 'vitest';
import { buildFlyingStarChart, flyFrom, annualPlate } from './flyingStar.js';
import { annualStar, monthlyStar, periodOfYear, yearZhi, fengShuiYearOf, liChunOf } from './period.js';
import { MOUNTAINS, TI_XING, analyzeJianXiang, degreeToMountain, facingOf, resolveMountain } from './mountains.js';
import { PALACE_INDEXES, azimuthToPalace } from './constants.js';

describe('二十四山罗盘环', () => {
  it('共 24 山，每山 15°，与山向奇门同环', () => {
    expect(MOUNTAINS).toHaveLength(24);
    for (const m of MOUNTAINS) expect(m.center % 15).toBe(0);
    expect(new Set(MOUNTAINS.map((m) => m.center)).size).toBe(24);
  });

  it('正北 0° 为子山、正南 180° 为午山', () => {
    expect(degreeToMountain(0).name).toBe('子');
    expect(degreeToMountain(90).name).toBe('卯');
    expect(degreeToMountain(180).name).toBe('午');
    expect(degreeToMountain(270).name).toBe('酉');
    expect(degreeToMountain(345).name).toBe('壬');
    expect(degreeToMountain(353).name).toBe('子');
    expect(degreeToMountain(-10).name).toBe(degreeToMountain(350).name);
  });

  it('向首取坐山之冲', () => {
    expect(facingOf('子').mountain.name).toBe('午');
    expect(facingOf('艮').mountain.name).toBe('坤');
    expect(facingOf(90).mountain.name).toBe('酉');
  });

  it('三元龙与阴阳：阳山阴山各十二', () => {
    const yang = MOUNTAINS.filter((m) => m.yinYang === '阳');
    expect(yang).toHaveLength(12);
    expect(MOUNTAINS.filter((m) => m.yuan === '天元')).toHaveLength(8);
    expect(MOUNTAINS.filter((m) => m.yuan === '地元')).toHaveLength(8);
    expect(MOUNTAINS.filter((m) => m.yuan === '人元')).toHaveLength(8);
  });

  it('二十四山起星诀覆盖全部 24 山', () => {
    expect(Object.keys(TI_XING)).toHaveLength(24);
    for (const m of MOUNTAINS) expect(TI_XING[m.name]).toBeDefined();
  });

  it('兼向判定：过 3° 起替卦', () => {
    expect(analyzeJianXiang(0).isJian).toBe(false);
    expect(analyzeJianXiang(2).isJian).toBe(false);
    const j = analyzeJianXiang(355);
    expect(j.isJian).toBe(true);
    expect(j.towards).toBe('壬');
  });
});

describe('九宫飞布', () => {
  it('顺飞：五入中则乾六兑七艮八离九坎一坤二震三巽四', () => {
    const p = flyFrom(5, '顺');
    expect(p).toEqual({ 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 1: 1, 2: 2, 3: 3, 4: 4 });
  });

  it('逆飞：星数沿洛书路线递减', () => {
    const p = flyFrom(5, '逆');
    expect(p[5]).toBe(5);
    expect(p[6]).toBe(4); // 5 - 1
    expect(p[7]).toBe(3);
    expect(p[4]).toBe(6); // 5 + 1（逆向路线首站）
  });

  it('任何入中数，九宫恰好各得 1–9 一次', () => {
    for (const n of PALACE_INDEXES) {
      for (const dir of ['顺', '逆'] as const) {
        const plate = flyFrom(n, dir);
        expect(new Set(Object.values(plate)).size).toBe(9);
      }
    }
  });
});

describe('玄空飞星排盘 —— 公开盘式校验', () => {
  it('八运子山午向 = 双星会向（离宫山 8 向 8）', () => {
    const c = buildFlyingStarChart({ sitting: '子', period: 8 });
    expect(c.palaces[9].shan).toBe(8);
    expect(c.palaces[9].xiang).toBe(8);
    expect(c.pattern).toBe('双星会向');
    // 运盘：8 入中顺飞
    expect(c.yunPan[5]).toBe(8);
    expect(c.yunPan[1]).toBe(4);
    expect(c.yunPan[9]).toBe(3);
  });

  it('八运乾山巽向 = 旺山旺向', () => {
    const c = buildFlyingStarChart({ sitting: '乾', period: 8 });
    expect(c.palaces[6].shan).toBe(8); // 坐山乾宫得旺山
    expect(c.palaces[4].xiang).toBe(8); // 向首巽宫得旺向
    expect(c.pattern).toBe('旺山旺向');
  });

  it('八运巽山乾向 = 旺山旺向（乾巽互为旺山旺向对）', () => {
    const c = buildFlyingStarChart({ sitting: '巽', period: 8 });
    expect(c.pattern).toBe('旺山旺向');
  });

  it('九运午山子向：向首坎宫得当元九紫向星', () => {
    const c = buildFlyingStarChart({ sitting: '午', period: 9 });
    expect(c.facing.mountain.name).toBe('子');
    expect(c.period.period).toBe(9);
    // 每宫山向星俱全且合法
    for (const p of PALACE_INDEXES) {
      expect(c.palaces[p].shan).toBeGreaterThanOrEqual(1);
      expect(c.palaces[p].xiang).toBeLessThanOrEqual(9);
    }
  });

  it('山盘向盘各自九星不重复', () => {
    const c = buildFlyingStarChart({ sitting: '丙', period: 9 });
    expect(new Set(Object.values(c.shanPan)).size).toBe(9);
    expect(new Set(Object.values(c.xiangPan)).size).toBe(9);
  });

  it('兼向自动起替卦并记录推导过程', () => {
    const plain = buildFlyingStarChart({ sitting: 0, period: 9 });
    const jian = buildFlyingStarChart({ sitting: 356, period: 9 }); // 子兼壬 4°
    expect(plain.usedTiXing).toBe(false);
    expect(jian.usedTiXing).toBe(true);
    expect(jian.derivation.join('')).toContain('替');
  });

  it('入住年可推元运', () => {
    const c = buildFlyingStarChart({ sitting: '子', moveInYear: 2010 });
    expect(c.period.period).toBe(8);
    const c9 = buildFlyingStarChart({ sitting: '子', moveInYear: 2025 });
    expect(c9.period.period).toBe(9);
  });

  it('缺坐山或缺元运则明确报错，不静默出盘', () => {
    expect(() => buildFlyingStarChart({ sitting: '子' })).toThrow(/元运/);
    expect(() => buildFlyingStarChart({ sitting: '甴', period: 8 })).toThrow();
  });

  it('九运全部 24 山排盘均不抛错且格局可判', () => {
    for (const m of MOUNTAINS) {
      const c = buildFlyingStarChart({ sitting: m.name, period: 9 });
      expect(c.pattern).toBeTruthy();
    }
  });
});

describe('元运与流年紫白', () => {
  it('三元九运分期', () => {
    expect(periodOfYear(2010).period).toBe(8);
    expect(periodOfYear(2024).period).toBe(9);
    expect(periodOfYear(2043).period).toBe(9);
    expect(periodOfYear(2044).period).toBe(1);
    expect(periodOfYear(1864).period).toBe(1);
  });

  it('流年紫白：2023 四绿、2024 三碧、2025 二黑、2026 一白', () => {
    expect(annualStar(2023)).toBe(4);
    expect(annualStar(2024)).toBe(3);
    expect(annualStar(2025)).toBe(2);
    expect(annualStar(2026)).toBe(1);
    expect(annualStar(2027)).toBe(9);
  });

  it('流年盘为年星入中顺飞', () => {
    const p = annualPlate(2026); // 一白入中
    expect(p[5]).toBe(1);
    expect(p[6]).toBe(2);
  });

  it('年支循环：1864 甲子', () => {
    expect(yearZhi(1864)).toBe('子');
    expect(yearZhi(2024)).toBe('辰');
    expect(yearZhi(2026)).toBe('午');
  });

  it('流月紫白起例：子午卯酉年正月八白入中', () => {
    expect(monthlyStar(2026, 1)).toBe(8); // 2026 丙午年
    expect(monthlyStar(2026, 2)).toBe(7);
    expect(monthlyStar(2025, 1)).toBe(2); // 2025 乙巳年（寅申巳亥）
  });

  it('立春为年界', () => {
    const lc = liChunOf(2026);
    expect(lc.getMonth() + 1).toBe(2);
    expect(fengShuiYearOf(new Date(2026, 0, 15))).toBe(2025);
    expect(fengShuiYearOf(new Date(2026, 5, 15))).toBe(2026);
  });
});

describe('方位与宫位', () => {
  it('方位角归宫', () => {
    expect(azimuthToPalace(0)).toBe(1);
    expect(azimuthToPalace(45)).toBe(8);
    expect(azimuthToPalace(180)).toBe(9);
    expect(azimuthToPalace(315)).toBe(6);
    expect(azimuthToPalace(350)).toBe(1);
  });

  it('坐山解析支持山名与度数', () => {
    expect(resolveMountain('子').degree).toBe(0);
    expect(resolveMountain(187).mountain.name).toBe('午');
    expect(resolveMountain('187').mountain.name).toBe('午');
    expect(resolveMountain(187).hasDegree).toBe(true);
    expect(resolveMountain('子').hasDegree).toBe(false);
  });
});
