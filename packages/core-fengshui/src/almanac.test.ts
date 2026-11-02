import { describe, expect, it } from 'vitest';
import { Solar } from 'lunar-typescript';
import { almanacDirections, hourGanIndex, natalDirections, wenQuMarks, GAN } from './almanac.js';
import { plateOf } from './timeStars.js';

const KL = { utcOffsetHours: 8 } as const;
/** 吉隆坡墙钟 → 绝对时刻。 */
const kl = (y: number, m: number, d: number, h: number, mi = 0) => new Date(Date.UTC(y, m - 1, d, h - 8, mi));
const at = (list: readonly { key: string; at: string }[], key: string) => list.find((x) => x.key === key)!.at;

describe('通书吉神方位', () => {
  it('逐日与 lunar-typescript 对拍 2026 全年（喜神、财神、福神两派、阳贵、阴贵）', () => {
    const bad: string[] = [];
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
      const lunar = Solar.fromYmdHms(y, m, dd, 12, 0, 0).getLunar();
      for (const sect of ['福神一', '福神二'] as const) {
        const a = almanacDirections(kl(y, m, dd, 12), { ...KL, fuSect: sect });
        const want: Record<string, string> = {
          日喜神: lunar.getDayPositionXi(),
          日财神: lunar.getDayPositionCai(),
          日福神: lunar.getDayPositionFu(sect === '福神一' ? 1 : 2),
          日阳贵: lunar.getDayPositionYangGui(),
          日阴贵: lunar.getDayPositionYinGui(),
        };
        for (const [k, v] of Object.entries(want)) if (at(a.day, k) !== v) bad.push(`${y}-${m}-${dd} ${sect} ${k}: ${at(a.day, k)} ≠ ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('逐时与 lunar-typescript 对拍（避开 23 点，两库子时换日取法不必相同）', () => {
    const bad: string[] = [];
    for (let day = 1; day <= 40; day++) {
      for (let h = 1; h < 23; h += 2) {
        const base = new Date(Date.UTC(2026, 9, day));
        const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
        const lunar = Solar.fromYmdHms(y, m, d, h, 30, 0).getLunar();
        const a = almanacDirections(kl(y, m, d, h, 30), KL);
        if (a.hourGan + a.hourZhi !== lunar.getTimeInGanZhi()) bad.push(`${y}-${m}-${d} ${h}h 时柱 ${a.hourGan}${a.hourZhi} ≠ ${lunar.getTimeInGanZhi()}`);
        if (at(a.hour, '时喜神') !== lunar.getTimePositionXi()) bad.push(`${y}-${m}-${d} ${h}h 时喜神`);
        if (at(a.hour, '时财神') !== lunar.getTimePositionCai()) bad.push(`${y}-${m}-${d} ${h}h 时财神`);
        if (at(a.hour, '时阳贵') !== lunar.getTimePositionYangGui()) bad.push(`${y}-${m}-${d} ${h}h 时阳贵`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('五鼠遁：甲己日子时甲子、乙庚日子时丙子、戊癸日子时壬子', () => {
    expect(GAN[hourGanIndex(0, 0)]).toBe('甲');
    expect(GAN[hourGanIndex(5, 0)]).toBe('甲');
    expect(GAN[hourGanIndex(1, 0)]).toBe('丙');
    expect(GAN[hourGanIndex(4, 0)]).toBe('壬');
    expect(GAN[hourGanIndex(9, 11)]).toBe('癸'); // 癸日亥时癸亥
  });

  it('方位角：卦取宫中线', () => {
    const a = almanacDirections(kl(2026, 11, 3, 12), KL);
    for (const m of [...a.day, ...a.hour]) expect([0, 45, 90, 135, 180, 225, 270, 315]).toContain(m.bearing);
  });
});

describe('命理神煞方位（按出生年）', () => {
  it('1988 戊辰：文昌申、桃花酉、驿马寅', () => {
    const n = natalDirections(1988);
    expect(n.gan + n.zhi).toBe('戊辰');
    expect(n.marks.map((m) => m.at)).toEqual(['申', '酉', '寅']);
    expect(n.marks[0]!.bearing).toBe(240);
  });
  it('1990 庚午：文昌亥、桃花卯、驿马申；1995 乙亥：文昌午、桃花子、驿马巳', () => {
    expect(natalDirections(1990).marks.map((m) => m.at)).toEqual(['亥', '卯', '申']);
    expect(natalDirections(1995).marks.map((m) => m.at)).toEqual(['午', '子', '巳']);
  });
});

describe('玄空流年文昌', () => {
  it('2026 一白入中，四绿到东北', () => {
    const [y] = wenQuMarks(plateOf(1), plateOf(9));
    expect(y!.direction).toBe('东北');
    expect(y!.bearing).toBe(45);
  });
});
