import { describe, expect, it } from 'vitest';
import { Solar } from 'lunar-typescript';
import { hourlyStar, isYangDun, palaceOfStar, plateOf, shiChenOf, timeChart } from './timeStars.js';

const KL = { utcOffsetHours: 8 } as const;
/** 吉隆坡墙钟 → 绝对时刻。 */
const kl = (y: number, m: number, d: number, h: number, mi = 30) => new Date(Date.UTC(y, m - 1, d, h - 8, mi));
const dayZhi = (y: number, m: number, d: number) => Solar.fromYmdHms(y, m, d, 12, 0, 0).getLunar().getDayZhi();

describe('时辰', () => {
  it('23 点起子时、1 点起丑时、11 点起午时', () => {
    expect(shiChenOf(kl(2026, 10, 18, 23, 10), KL).zhi).toBe('子');
    expect(shiChenOf(kl(2026, 10, 18, 0, 10), KL).zhi).toBe('子');
    expect(shiChenOf(kl(2026, 10, 18, 1, 0), KL).zhi).toBe('丑');
    expect(shiChenOf(kl(2026, 10, 18, 12, 59), KL).zhi).toBe('午');
    const s = shiChenOf(kl(2026, 10, 18, 12, 0), KL);
    expect(s.start.toISOString()).toBe('2026-10-18T03:00:00.000Z'); // 11:00 吉隆坡
    expect(s.end.getTime() - s.start.getTime()).toBe(2 * 3600_000);
  });

  it('真太阳时：吉隆坡（东经 101.69°）钟表比真太阳时快一个多钟头，可差一个时辰', () => {
    const at = kl(2026, 10, 18, 13, 30); // 钟表未时
    const clock = shiChenOf(at, KL);
    const solar = shiChenOf(at, { ...KL, hourBasis: '真太阳时', longitude: 101.69 });
    expect(clock.zhi).toBe('未');
    expect(solar.basisUsed).toBe('真太阳时');
    expect(solar.solarDeltaMinutes).toBeLessThan(-55);
    expect(solar.solarDeltaMinutes).toBeGreaterThan(-75);
    expect(solar.zhi).toBe('午');
  });

  it('选了真太阳时但没有经度：退回钟表时间并照实说明', () => {
    const c = timeChart(kl(2026, 10, 18, 13), { ...KL, hourBasis: '真太阳时' });
    expect(c.shiChen.basisUsed).toBe('钟表时间');
    expect(c.notes.join('')).toMatch(/未取得经度/);
  });
});

describe('时星起例（天一九、地四六、人七三）', () => {
  it('阳遁：子午卯酉日子时一白、辰戌丑未日四绿、寅申巳亥日七赤，逐时顺行', () => {
    // 2026 年 1 月中旬属冬至后阳遁
    for (let d = 10; d <= 21; d++) {
      const z = dayZhi(2026, 1, d);
      const start = '子午卯酉'.includes(z) ? 1 : '辰戌丑未'.includes(z) ? 4 : 7;
      expect(hourlyStar(kl(2026, 1, d, 0, 30), KL).star).toBe(start);
      expect(hourlyStar(kl(2026, 1, d, 2, 30), KL).star).toBe((start % 9) + 1); // 丑时顺一位
    }
  });

  it('阴遁：子午卯酉日子时九紫、辰戌丑未日六白、寅申巳亥日三碧，逐时逆行', () => {
    for (let d = 10; d <= 21; d++) {
      const z = dayZhi(2026, 8, d);
      const start = '子午卯酉'.includes(z) ? 9 : '辰戌丑未'.includes(z) ? 6 : 3;
      expect(hourlyStar(kl(2026, 8, d, 0, 30), KL).star).toBe(start);
      expect(hourlyStar(kl(2026, 8, d, 2, 30), KL).star).toBe(start - 1); // 丑时逆一位（起星 9/6/3，减一不越界）
    }
  });

  it('子时换日：23 点那一小时，按「23点换日」取次日日支，按「0点换日」取当日', () => {
    const at = kl(2026, 1, 12, 23, 30);
    const a = hourlyStar(at, { ...KL, dayChange: '23点换日' });
    const b = hourlyStar(at, { ...KL, dayChange: '0点换日' });
    expect(a.dayZhi).toBe(dayZhi(2026, 1, 13));
    expect(b.dayZhi).toBe(dayZhi(2026, 1, 12));
  });

  it('阴阳遁以冬至、夏至交节时刻为界', () => {
    expect(isYangDun(kl(2026, 3, 1, 12))).toBe(true);
    expect(isYangDun(kl(2026, 9, 1, 12))).toBe(false);
    expect(isYangDun(kl(2026, 12, 31, 12))).toBe(true);
  });

  it('与 lunar-typescript 的时家九星逐时对拍（2026–2027）：只在冬至、夏至当日有差', () => {
    const CN = '一二三四五六七八九';
    const diffDays = new Set<string>();
    for (let day = 0; day < 730; day++) {
      for (let h = 0; h < 24; h++) {
        const at = new Date(Date.UTC(2026, 0, 1 + day, h - 8, 30));
        const w = new Date(at.getTime() + 8 * 3600_000);
        const ref = CN.indexOf(
          Solar.fromYmdHms(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), w.getUTCHours(), 30, 0).getLunar().getTimeNineStar().getNumber(),
        ) + 1;
        if (ref !== hourlyStar(at, { ...KL, dayChange: '0点换日' }).star) diffDays.add(w.toISOString().slice(0, 10));
      }
    }
    expect([...diffDays].sort()).toEqual(['2026-06-21', '2026-12-22', '2027-06-21', '2027-12-22']);
  });
});

describe('时盘与财星', () => {
  it('九运：当旺九紫、生气一白、退气八白，所在宫与时盘一致', () => {
    const c = timeChart(kl(2026, 10, 18, 15), KL);
    expect(c.period).toBe(9);
    expect(c.wealth.map((w) => [w.star, w.role])).toEqual([[9, '当旺'], [1, '生气'], [8, '退气']]);
    for (const w of c.wealth) expect(c.hour.plate[w.palace]).toBe(w.star);
  });

  it('入中顺飞：五入中即元旦盘', () => {
    expect(plateOf(5)).toEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9 });
    expect(palaceOfStar(plateOf(9), 9)).toBe(5);
  });

  it('同一时刻，设备时区不同、指定时区相同 → 结果相同', () => {
    const at = kl(2026, 10, 18, 15);
    const prev = process.env.TZ;
    const out: string[] = [];
    for (const tz of ['Asia/Kuala_Lumpur', 'America/New_York', 'UTC']) {
      process.env.TZ = tz;
      const c = timeChart(at, KL);
      out.push(`${c.shiChen.zhi}${c.hour.star}${c.wealth.map((w) => w.palace).join('')}`);
    }
    process.env.TZ = prev;
    expect(new Set(out).size).toBe(1);
  });
});
