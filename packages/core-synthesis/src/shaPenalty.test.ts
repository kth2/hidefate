import { describe, expect, it } from 'vitest';
import { PALACE_INDEXES, buildFlyingStarChart } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { sampleInput, SAMPLE_PROFILE } from './fixtures.js';

/**
 * 五黄 / 二黑 独立煞的回归测试。
 *
 * 这组测试锁住一条实务铁律：五黄配一白**不可**被算成吉方。
 * 早期实现把双星取平均，导致「五黄一白同宫」被判为全屋最可借力之方 ——
 * 与古法及实务完全相反。此处以行为断言防止回归。
 */
describe('五黄二黑不可被同宫吉星抵销', () => {
  /** 造一间坐山可控的房子，找出含五黄山星的宫位。 */
  function palacesWith(star: 5 | 2, sitting: string, period: 9 = 9) {
    const chart = buildFlyingStarChart({ sitting, period });
    return PALACE_INDEXES.filter((p) => chart.palaces[p].shan === star || chart.palaces[p].xiang === star);
  }

  it('含五黄之宫，综合分必定为负（无论同宫另一星多旺）', () => {
    for (const sitting of ['子', '午', '乾', '巽', '艮', '坤']) {
      const profile = { ...SAMPLE_PROFILE, sitting, missingCorners: [], rooms: [] };
      const s = synthesise({ ...sampleInput(2026), profile });
      for (const p of palacesWith(5, sitting)) {
        expect(
          s.palaces[p].score,
          `坐${sitting}：${s.palaces[p].direction}含五黄，却得非负综合分 ${s.palaces[p].score}`,
        ).toBeLessThan(0);
      }
    }
  });

  it('含五黄之宫绝不会被选为全屋最可借力之方', () => {
    for (const sitting of ['子', '午', '乾', '巽', '艮', '坤', '丙', '壬']) {
      const profile = { ...SAMPLE_PROFILE, sitting, missingCorners: [], rooms: [] };
      const s = synthesise({ ...sampleInput(2026), profile });
      const best = ([1, 2, 3, 4, 6, 7, 8, 9] as const).reduce((a, b) =>
        s.palaces[b].score > s.palaces[a].score ? b : a,
      );
      const stars = [s.palaces[best].stars.shan, s.palaces[best].stars.xiang];
      expect(stars, `坐${sitting}：最吉方 ${s.palaces[best].direction} 竟含五黄`).not.toContain(5);
    }
  });

  it('五黄之宫必带独立煞气依据，且明说不与吉星相抵', () => {
    const profile = { ...SAMPLE_PROFILE, sitting: '午', missingCorners: [], rooms: [] };
    const s = synthesise({ ...sampleInput(2026), profile });
    for (const p of palacesWith(5, '午')) {
      const f = s.palaces[p].findings.find((x) => x.statement.includes('五黄'));
      expect(f, `${s.palaces[p].direction} 缺五黄依据`).toBeDefined();
      expect(f!.principle).toContain('五黄正煞');
    }
  });

  it('二黑同样独立扣分', () => {
    const profile = { ...SAMPLE_PROFILE, sitting: '午', missingCorners: [], rooms: [] };
    const s = synthesise({ ...sampleInput(2026), profile });
    const hit = palacesWith(2, '午');
    expect(hit.length).toBeGreaterThan(0);
    for (const p of hit) {
      expect(s.palaces[p].findings.some((f) => f.statement.includes('二黑'))).toBe(true);
    }
  });

  it('流年火星加临五黄之宫，凶性须加重（五黄最忌火来生）', () => {
    const profile = { ...SAMPLE_PROFILE, sitting: '午', missingCorners: [], rooms: [] };
    // 2026 一白入中 → 九紫（火）飞到某宫；找出该宫同时含五黄者作对照。
    let checked = 0;
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      const s = synthesise({ ...sampleInput(year), profile });
      for (const p of PALACE_INDEXES) {
        const a = s.palaces[p];
        const hasSha = a.stars.shan === 5 || a.stars.xiang === 5;
        if (!hasSha || a.stars.annual !== 9) continue;
        const f = a.findings.find((x) => x.statement.includes('五黄最忌火来生'));
        expect(f, `${year} 年 ${a.direction}：九紫加临五黄却未标注火生土`).toBeDefined();
        checked++;
      }
    }
    expect(checked, '样本中未出现「九紫加临五黄」的宫位，测试未实际生效').toBeGreaterThan(0);
  });

  it('流年金星加临五黄之宫，凶性应收敛（金泄土）', () => {
    const profile = { ...SAMPLE_PROFILE, sitting: '午', missingCorners: [], rooms: [] };
    let checked = 0;
    for (const year of [2026, 2027, 2028, 2029, 2030, 2031]) {
      const s = synthesise({ ...sampleInput(year), profile });
      for (const p of PALACE_INDEXES) {
        const a = s.palaces[p];
        const hasSha = a.stars.shan === 5 || a.stars.xiang === 5;
        if (!hasSha || (a.stars.annual !== 6 && a.stars.annual !== 7)) continue;
        expect(a.findings.some((x) => x.statement.includes('泄去本宫'))).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('摘要不把负分之宫吹成「最可借力」', () => {
    for (const sitting of ['子', '午', '乾', '巽', '艮', '坤', '丙', '壬']) {
      for (const year of [2026, 2028, 2031]) {
        const profile = { ...SAMPLE_PROFILE, sitting, missingCorners: [], rooms: [] };
        const s = synthesise({ ...sampleInput(year), profile });
        const best = ([1, 2, 3, 4, 6, 7, 8, 9] as const).reduce((a, b) =>
          s.palaces[b].score > s.palaces[a].score ? b : a,
        );
        if (s.palaces[best].score < 0.25) {
          expect(s.summary, `坐${sitting} ${year}：最吉方仅 ${s.palaces[best].score.toFixed(2)} 却称「最可借力」`).not.toContain('最可借力');
        }
        if (s.palaces[best].score < 0) {
          expect(s.summary).toContain('无一可称吉方');
        }
      }
    }
  });

  it('不含五黄二黑之宫不受此项影响（不误伤）', () => {
    const profile = { ...SAMPLE_PROFILE, sitting: '午', missingCorners: [], rooms: [] };
    const s = synthesise({ ...sampleInput(2026), profile });
    for (const p of PALACE_INDEXES) {
      const a = s.palaces[p];
      if ([a.stars.shan, a.stars.xiang].some((x) => x === 5 || x === 2)) continue;
      expect(a.findings.some((f) => f.principle.includes('五黄正煞'))).toBe(false);
    }
  });
});
