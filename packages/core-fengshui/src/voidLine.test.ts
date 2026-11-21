import { describe, expect, it } from 'vitest';
import { PALACE_INDEXES, type PalaceIndex } from './constants.js';
import { buildFlyingStarChart, voidLineCharts } from './flyingStar.js';
import { analyzeJianXiang, analyzeLine } from './mountains.js';
import { chartOptionsFor, DEFAULT_SCHOOL } from './school.js';

const stars = (c: ReturnType<typeof buildFlyingStarChart>) =>
  PALACE_INDEXES.map((p) => `${c.palaces[p].yun}${c.palaces[p].shan}${c.palaces[p].xiang}`).join(' ');

describe('空亡线择盘（X-5）', () => {
  it('未择定：星数与旧判定（兼向阈值）完全相同 —— 全部度数 × 九运', () => {
    for (let period = 1; period <= 9; period++) {
      for (let d = 0; d < 360; d += 0.5) {
        const now = buildFlyingStarChart({ period: period as PalaceIndex, sitting: d });
        const old = buildFlyingStarChart({ period: period as PalaceIndex, sitting: d, useTiXing: analyzeJianXiang(d, 3).isJian });
        expect(stars(now)).toBe(stars(old));
        expect(now.pattern).toBe(old.pattern);
        expect(now.provenance.ruleSet).toBe(old.provenance.ruleSet);
      }
    }
  });

  it('立线与排盘共用判定：空亡线上必带 voidLine，非空亡线上没有', () => {
    for (let d = 0; d < 360; d += 0.1) {
      const deg = Math.round(d * 10) / 10;
      const g = analyzeLine(deg, 3).grade;
      const c = buildFlyingStarChart({ period: 9, sitting: deg });
      expect(c.voidLine != null).toBe(g === '大空亡' || g === '小空亡');
      if (c.voidLine) {
        expect(c.voidLine.grade).toBe(g);
        expect(c.voidLine.decided).toBe(false);
        expect(c.voidLine.choice).toBe(c.usedTiXing ? '替卦' : '下卦');
      }
    }
  });

  it('351.5°（小空亡，骑壬子）九运：未择定暂用替卦；择定下卦则照排并记入戳记', () => {
    const auto = buildFlyingStarChart({ period: 9, sitting: 351.5 });
    expect(auto.voidLine).toMatchObject({ grade: '小空亡', choice: '替卦', decided: false });
    expect(auto.derivation.some((l) => l.includes('尚未择定'))).toBe(true);
    expect(auto.provenance.ruleSet).not.toContain('void=');

    const xia = buildFlyingStarChart({ period: 9, sitting: 351.5, voidLineChoice: '下卦' });
    expect(xia.usedTiXing).toBe(false);
    expect(xia.voidLine).toMatchObject({ choice: '下卦', decided: true });
    expect(xia.provenance.ruleSet).toMatch(/;void=xia$/);
    expect(xia.derivation.some((l) => l.includes('经择定取下卦盘'))).toBe(true);
    expect(stars(xia)).toBe(stars(buildFlyingStarChart({ period: 9, sitting: 351.5, useTiXing: false })));

    const ti = buildFlyingStarChart({ period: 9, sitting: 351.5, voidLineChoice: '替卦' });
    expect(ti.provenance.ruleSet).toMatch(/;void=ti$/);
    expect(stars(ti)).toBe(stars(auto));
  });

  it('不在空亡线上：择盘设定被忽略，结果与未设定逐字段相同', () => {
    for (const d of [345, 348.9, 0, 92]) {
      expect(buildFlyingStarChart({ period: 8, sitting: d, voidLineChoice: '下卦' })).toEqual(
        buildFlyingStarChart({ period: 8, sitting: d }),
      );
    }
  });

  it('显式 useTiXing（模拟页）优先于择盘设定', () => {
    const c = buildFlyingStarChart({ period: 9, sitting: 351.5, voidLineChoice: '下卦', useTiXing: true });
    expect(c.usedTiXing).toBe(true);
    expect(c.voidLine?.decided).toBe(false);
  });

  it('voidLineCharts：空亡线上给出两盘，非空亡线上为 null', () => {
    expect(voidLineCharts({ period: 9, sitting: 345 })).toBeNull();
    const cmp = voidLineCharts({ period: 9, sitting: 351.5 })!;
    expect(cmp.grade).toBe('小空亡');
    expect(cmp.xiaGua.usedTiXing).toBe(false);
    expect(cmp.tiGua.usedTiXing).toBe(true);
    expect(cmp.current).toBe('替卦');
    expect(cmp.decided).toBe(false);
    expect(cmp.identical).toBe(cmp.differingPalaces.length === 0);
    for (const p of cmp.differingPalaces) {
      const a = cmp.xiaGua.palaces[p];
      const b = cmp.tiGua.palaces[p];
      expect(a.shan !== b.shan || a.xiang !== b.xiang).toBe(true);
    }
    expect(voidLineCharts({ period: 9, sitting: 351.5, voidLineChoice: '下卦' })!.current).toBe('下卦');
  });

  it('两盘相同的情形会被标出（替星恰等于运星）', () => {
    let found = 0;
    for (let period = 1; period <= 9; period++) {
      for (let d = 0; d < 360; d += 0.5) {
        const cmp = voidLineCharts({ period: period as PalaceIndex, sitting: d });
        if (cmp?.identical) {
          found++;
          expect(stars(cmp.xiaGua)).toBe(stars(cmp.tiGua));
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('chartOptionsFor 把房屋的择盘带进排盘参数', () => {
    const base = { sitting: 351.5, moveInYear: 2025 };
    expect(chartOptionsFor(base, DEFAULT_SCHOOL)).not.toHaveProperty('voidLineChoice');
    const { chartYear: _c, ...opts } = chartOptionsFor({ ...base, voidLineChart: '下卦' }, DEFAULT_SCHOOL);
    expect(opts.voidLineChoice).toBe('下卦');
    expect(buildFlyingStarChart(opts).usedTiXing).toBe(false);
  });
});
