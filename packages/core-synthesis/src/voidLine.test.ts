import { describe, expect, it } from 'vitest';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';

const base: PropertyProfile = {
  id: 'v',
  name: '空亡宅',
  buildingType: '独立屋',
  sitting: 351.5, // 小空亡，骑壬子
  moveInYear: 2025,
  missingCorners: [],
  rooms: [{ id: 'd', kind: '大门', palaces: [9], primaryPalace: 9 }],
  entryMode: '罗盘实测',
};

describe('合参：空亡线择盘（X-5）', () => {
  it('未择定：用替卦盘，依据照实写「尚未择定」', () => {
    const r = synthesise({ profile: base, members: [], year: 2026 });
    expect(r.flyingStar.usedTiXing).toBe(true);
    expect(r.flyingStar.voidLine).toMatchObject({ choice: '替卦', decided: false });
    const reasons = r.confidence.reasons.join('\n');
    expect(reasons).toContain('尚未择定');
    expect(reasons).not.toContain('已起替卦');
  });

  it('择定下卦：整条合参改用下卦盘', () => {
    const auto = synthesise({ profile: base, members: [], year: 2026 });
    const xia = synthesise({ profile: { ...base, voidLineChart: '下卦' }, members: [], year: 2026 });
    expect(xia.flyingStar.usedTiXing).toBe(false);
    expect(xia.confidence.reasons.join('\n')).toContain('经择定取下卦盘');
    expect(xia.flyingStar.provenance.ruleSet).toMatch(/void=xia/);
    const stars = (x: typeof auto) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => `${x.flyingStar.palaces[p as 1].shan}${x.flyingStar.palaces[p as 1].xiang}`).join();
    expect(stars(xia)).not.toBe(stars(auto));
  });

  it('不在空亡线上：择盘设定不影响任何结果', () => {
    const off = { ...base, sitting: 345 };
    const a = synthesise({ profile: off, members: [], year: 2026 });
    const b = synthesise({ profile: { ...off, voidLineChart: '下卦' as const }, members: [], year: 2026 });
    // 结果里会原样带回 profile（含择盘字段本身），其余应逐字节相同
    const strip = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'voidLineChart' ? undefined : v));
    expect(strip(b)).toBe(strip(a));
  });
});
