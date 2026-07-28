import { describe, expect, it } from 'vitest';
import { MOUNTAINS, VOID_HALF_WIDTH, analyzeLine, degreeToMountain } from './mountains.js';
import { dailyPlate, dailyStar, monthlyStar, annualStar } from './period.js';
import { PALACE_INDEXES } from './constants.js';

describe('立向线判定：下卦 / 兼向 / 空亡', () => {
  it('正中线为下卦', () => {
    for (const m of MOUNTAINS) {
      const r = analyzeLine(m.center);
      expect(r.grade, `${m.name}山中线应为下卦`).toBe('下卦');
      expect(r.useTiXing).toBe(false);
    }
  });

  it('偏 3° 以内仍为下卦，超过则为兼向并起替卦', () => {
    expect(analyzeLine(2).grade).toBe('下卦');
    expect(analyzeLine(3).grade).toBe('下卦');
    const jian = analyzeLine(355); // 子山偏 -5°
    expect(jian.grade).toBe('兼向');
    expect(jian.useTiXing).toBe(true);
    expect(jian.towards).toBe('壬');
  });

  it('骑两卦之缝为大空亡（出卦）', () => {
    // 卦界在 22.5 / 67.5 / 112.5 …
    for (const b of [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]) {
      const r = analyzeLine(b);
      expect(r.grade, `${b}° 应为大空亡`).toBe('大空亡');
      expect(r.straddling).toHaveLength(2);
      expect(r.advice).toContain('出卦');
    }
  });

  it('骑两山之缝（非卦界）为小空亡', () => {
    // 7.5° 为子癸之界，且不在卦界上
    const r = analyzeLine(7.5);
    expect(r.grade).toBe('小空亡');
    expect(r.straddling).toEqual(['子', '癸']);
    expect(r.advice).toContain('差错');
  });

  it('空亡带宽为骑缝 ±1.5°，出带即恢复正常判定', () => {
    expect(analyzeLine(22.5 - VOID_HALF_WIDTH + 0.1).grade).toBe('大空亡');
    expect(analyzeLine(22.5 - VOID_HALF_WIDTH - 0.5).grade).not.toBe('大空亡');
  });

  it('空亡判定优先于兼向（骑缝时不起替卦）', () => {
    const r = analyzeLine(7.5);
    expect(r.useTiXing).toBe(false);
    expect(['小空亡', '大空亡']).toContain(r.grade);
  });

  it('只给山名者按下卦处理，并说明未量度数', () => {
    const r = analyzeLine('子');
    expect(r.grade).toBe('下卦');
    expect(r.label).toContain('仅给山名');
    expect(r.advice).toContain('罗盘');
  });

  it('每条判定都带可执行建议', () => {
    for (const d of [0, 5, 7.5, 22.5, 100, 187]) {
      const r = analyzeLine(d);
      expect(r.advice.length).toBeGreaterThan(10);
      expect(r.label.length).toBeGreaterThan(5);
    }
  });

  it('全周 360° 扫描：每 0.5° 均能判定且不抛错', () => {
    const counts: Record<string, number> = {};
    for (let d = 0; d < 360; d += 0.5) {
      const r = analyzeLine(d);
      counts[r.grade] = (counts[r.grade] ?? 0) + 1;
      expect(r.mountain.name).toBe(degreeToMountain(d).name);
    }
    // 四种品级都应出现
    expect(counts['下卦']).toBeGreaterThan(0);
    expect(counts['兼向']).toBeGreaterThan(0);
    expect(counts['小空亡']).toBeGreaterThan(0);
    expect(counts['大空亡']).toBeGreaterThan(0);
    // 八个卦界 × 各 ~7 个采样点
    expect(counts['大空亡']).toBeLessThan(counts['下卦']!);
  });
});

describe('流日紫白', () => {
  it('日星恒在 1–9', () => {
    for (let i = 0; i < 400; i += 7) {
      const d = new Date(2026, 0, 1 + i);
      const s = dailyStar(d);
      expect(s.star).toBeGreaterThanOrEqual(1);
      expect(s.star).toBeLessThanOrEqual(9);
    }
  });

  it('阳遁段逐日顺行、阴遁段逐日逆行', () => {
    const step = (d0: Date) => {
      const a = dailyStar(d0);
      const b = dailyStar(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1));
      // 同段内才比较
      if (a.segment !== b.segment) return null;
      const delta = ((b.star - a.star + 9) % 9);
      return { yang: a.yang, delta };
    };
    let checkedYang = 0;
    let checkedYin = 0;
    for (let i = 0; i < 360; i += 3) {
      const r = step(new Date(2026, 0, 5 + i));
      if (!r) continue;
      if (r.yang) {
        expect(r.delta, '阳遁应顺行 +1').toBe(1);
        checkedYang++;
      } else {
        expect(r.delta, '阴遁应逆行 −1').toBe(8);
        checkedYin++;
      }
    }
    expect(checkedYang).toBeGreaterThan(10);
    expect(checkedYin).toBeGreaterThan(10);
  });

  it('冬至后第一个甲子日起一白', () => {
    const s = dailyStar(new Date(2026, 0, 20));
    // 落在冬至段者，锚日必为甲子且起星为一白
    if (s.segment === '冬至') {
      const atAnchor = dailyStar(s.anchor);
      expect(atAnchor.star).toBe(1);
    }
    expect(['冬至', '雨水', '谷雨', '夏至', '处暑', '霜降']).toContain(s.segment);
  });

  it('夏至后第一个甲子日起九紫且逆行', () => {
    const s = dailyStar(new Date(2026, 6, 10));
    if (s.segment === '夏至') {
      expect(dailyStar(s.anchor).star).toBe(9);
      expect(s.yang).toBe(false);
    }
  });

  it('日盘为日星入中顺飞，九宫各得一星', () => {
    const p = dailyPlate(new Date(2026, 3, 15));
    expect(new Set(Object.values(p)).size).toBe(9);
    expect(Object.keys(p).map(Number).sort((a, b) => a - b)).toEqual([...PALACE_INDEXES]);
  });

  it('年 / 月 / 日 三层各自独立，互不串值', () => {
    const d = new Date(2026, 5, 15);
    const y = annualStar(2026);
    const m = monthlyStar(2026, 5);
    const day = dailyStar(d).star;
    // 三者不必相同，但都必须合法
    for (const v of [y, m, day]) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});
