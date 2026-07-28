/**
 * 三元九运、流年紫白、流月紫白。
 *
 * 年界一律以「立春」为准（非公历元旦、非农历正月初一）。立春时刻由
 * lunar-typescript 精确求得，离线可算。
 */

import { Solar } from 'lunar-typescript';
import type { PalaceIndex } from './constants.js';

/** 三元九运起点：上元一运始于 1864 年（甲子）立春。 */
export const YUAN_YUN_EPOCH = 1864;

/** 每运年数。 */
export const YUN_LENGTH = 20;

export interface PeriodInfo {
  /** 元运数 1–9。 */
  readonly period: PalaceIndex;
  /** 该运起讫公历年（含起，含讫）。 */
  readonly startYear: number;
  readonly endYear: number;
  /** 上元 / 中元 / 下元。 */
  readonly yuan: '上元' | '中元' | '下元';
  readonly label: string;
}

/** 公历年（已按立春归年）→ 元运。 */
export function periodOfYear(year: number): PeriodInfo {
  const offset = year - YUAN_YUN_EPOCH;
  const cycles = Math.floor(offset / YUN_LENGTH);
  const period = (((cycles % 9) + 9) % 9) + 1;
  const startYear = YUAN_YUN_EPOCH + cycles * YUN_LENGTH;
  const yuan = period <= 3 ? '上元' : period <= 6 ? '中元' : '下元';
  return {
    period: period as PalaceIndex,
    startYear,
    endYear: startYear + YUN_LENGTH - 1,
    yuan,
    label: `${yuan}${CN_NUM[period]!}运（${startYear}–${startYear + YUN_LENGTH - 1}）`,
  };
}

const CN_NUM: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九',
};

export { CN_NUM };

/**
 * 立春时刻。返回该公历年立春的 Date（本地时区解读，精确到分）。
 * lunar-typescript 的节气表基于寿星万年历，离线且确定。
 */
export function liChunOf(year: number): Date {
  // 取该年 2 月 10 日回推：该日必在立春之后、雨水之前。
  const solar = Solar.fromYmdHms(year, 2, 10, 12, 0, 0);
  const table = solar.getLunar().getJieQiTable();
  const lc = table['立春'];
  if (!lc) throw new Error(`无法求得 ${year} 年立春`);
  return new Date(lc.getYear(), lc.getMonth() - 1, lc.getDay(), lc.getHour(), lc.getMinute(), lc.getSecond());
}

/** 把任意时刻归入「立春年」。立春前算上一年。 */
export function fengShuiYearOf(date: Date): number {
  const y = date.getFullYear();
  return date.getTime() < liChunOf(y).getTime() ? y - 1 : y;
}

/**
 * 流年紫白（年星入中）。
 *
 * 上元甲子（1864）年一白入中，此后逐年退一：
 *   star(Y) = ((1 - (Y - 1864)) mod 9)，结果 0 记作 9。
 * 校验：2023 → 四绿、2024 → 三碧、2025 → 二黑、2026 → 一白。
 */
export function annualStar(year: number): PalaceIndex {
  const n = (((1 - (year - YUAN_YUN_EPOCH)) % 9) + 9) % 9;
  return (n === 0 ? 9 : n) as PalaceIndex;
}

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

/** 立春年 → 年支。1864 为甲子年，地支子。 */
export function yearZhi(year: number): string {
  const idx = (((year - 1864) % 12) + 12) % 12;
  return ZHI[idx]!;
}

/**
 * 流月紫白（月星入中）。
 *
 * 起例：
 *   子午卯酉年 —— 正月八白入中
 *   辰戌丑未年 —— 正月五黄入中
 *   寅申巳亥年 —— 正月二黑入中
 * 此后逐月退一。
 *
 * @param year       立春年
 * @param monthIndex 节气月序 1–12（1 = 立春起的寅月）
 */
export function monthlyStar(year: number, monthIndex: number): PalaceIndex {
  const z = yearZhi(year);
  const start = ['子', '午', '卯', '酉'].includes(z)
    ? 8
    : ['辰', '戌', '丑', '未'].includes(z)
      ? 5
      : 2;
  const n = (((start - (monthIndex - 1)) % 9) + 9) % 9;
  return (n === 0 ? 9 : n) as PalaceIndex;
}

/**
 * 三元日家紫白（流日星）。
 *
 * 起例（《紫白诀》日家法）：
 *   阳遁顺飞 —— 冬至后第一个甲子日起一白；雨水后甲子起七赤；谷雨后甲子起四绿
 *   阴遁逆飞 —— 夏至后第一个甲子日起九紫；处暑后甲子起三碧；霜降后甲子起六白
 *
 * 六个节气把一年切成六段，每段约六十日，恰合一个甲子周期，故每段以其后
 * 第一个甲子日为锚，顺（阳）或逆（阴）推至所求之日。
 *
 * **力量分级**：年星为主，月星为应，日星只是触机。
 * 日星断吉凶之力远逊年月，仅宜用于择日与应期参考，不可与年星等量齐观 ——
 * 这一点在 UI 上必须讲清楚，否则用户会被日日变动的颜色牵着走。
 */
const DAY_SEGMENTS: readonly { jieQi: string; start: PalaceIndex; yang: boolean }[] = [
  { jieQi: '冬至', start: 1, yang: true },
  { jieQi: '雨水', start: 7, yang: true },
  { jieQi: '谷雨', start: 4, yang: true },
  { jieQi: '夏至', start: 9, yang: false },
  { jieQi: '处暑', start: 3, yang: false },
  { jieQi: '霜降', start: 6, yang: false },
];

const DAY_MS = 86_400_000;

/** 取某日 0 点的时间戳，避免时分秒干扰日数差。 */
function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 该日的六十甲子序号 0–59（甲子 = 0）。 */
function dayGanZhiIndex(d: Date): number {
  const lunar = Solar.fromYmdHms(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12, 0, 0).getLunar();
  const gz = lunar.getDayInGanZhiExact();
  const gan = '甲乙丙丁戊己庚辛壬癸'.indexOf(gz.charAt(0));
  const zhi = '子丑寅卯辰巳午未申酉戌亥'.indexOf(gz.charAt(1));
  if (gan < 0 || zhi < 0) throw new Error(`无法解析日干支：${gz}`);
  // 由干支反求六十甲子序：解 n ≡ gan (mod 10), n ≡ zhi (mod 12)
  for (let n = 0; n < 60; n++) {
    if (n % 10 === gan && n % 12 === zhi) return n;
  }
  throw new Error(`日干支不成立：${gz}`);
}

/** 取指定年份某节气的日期。 */
function jieQiDate(year: number, name: string): Date | null {
  // 取跨年附近的表以覆盖冬至（可能落在上一年末）
  for (const probe of [year, year - 1, year + 1]) {
    const table = Solar.fromYmdHms(probe, 6, 15, 12, 0, 0).getLunar().getJieQiTable();
    const v = table[name];
    if (v && v.getYear() === year) {
      return new Date(v.getYear(), v.getMonth() - 1, v.getDay());
    }
  }
  return null;
}

/** 某节气之后（含当日）的第一个甲子日。 */
function firstJiaZiOnOrAfter(from: Date): Date {
  const idx = dayGanZhiIndex(from);
  const add = (60 - idx) % 60;
  return new Date(midnight(from) + add * DAY_MS);
}

export interface DailyStarInfo {
  readonly star: PalaceIndex;
  /** 所属段落的起始节气。 */
  readonly segment: string;
  readonly yang: boolean;
  /** 该段的甲子锚日。 */
  readonly anchor: Date;
  readonly label: string;
}

/** 流日紫白。 */
export function dailyStar(date: Date): DailyStarInfo {
  const y = date.getFullYear();

  // 收集本年与前一年的六个段落起点，取「不晚于 date」中最近的一个
  const candidates: { seg: (typeof DAY_SEGMENTS)[number]; anchor: Date }[] = [];
  for (const yr of [y - 1, y]) {
    for (const seg of DAY_SEGMENTS) {
      const jq = jieQiDate(yr, seg.jieQi);
      if (!jq) continue;
      const anchor = firstJiaZiOnOrAfter(jq);
      if (midnight(anchor) <= midnight(date)) candidates.push({ seg, anchor });
    }
  }
  if (candidates.length === 0) {
    throw new Error(`无法定出 ${date.toISOString()} 的日家紫白段落`);
  }
  candidates.sort((a, b) => midnight(b.anchor) - midnight(a.anchor));
  const { seg, anchor } = candidates[0]!;

  const days = Math.round((midnight(date) - midnight(anchor)) / DAY_MS);
  const raw = seg.yang ? seg.start - 1 + days : seg.start - 1 - days;
  const n = (((raw % 9) + 9) % 9) + 1;

  return {
    star: n as PalaceIndex,
    segment: seg.jieQi,
    yang: seg.yang,
    anchor,
    label: `${seg.jieQi}后${seg.yang ? '阳遁顺行' : '阴遁逆行'}，甲子日起${CN_NUM[seg.start]}，本日为${CN_NUM[n]}`,
  };
}

/** 流日飞星盘：日星入中顺飞。 */
export function dailyPlate(date: Date): Record<PalaceIndex, PalaceIndex> {
  const centre = dailyStar(date).star;
  const route: PalaceIndex[] = [5, 6, 7, 8, 9, 1, 2, 3, 4];
  const out = {} as Record<PalaceIndex, PalaceIndex>;
  let star: PalaceIndex = centre;
  for (const p of route) {
    out[p] = star;
    star = (star === 9 ? 1 : ((star + 1) as PalaceIndex));
  }
  return out;
}

/**
 * 某时刻所属的节气月序 1–12（1 = 寅月，自立春起）。
 * 用于流月紫白与月度预警。
 */
export function solarMonthIndexOf(date: Date): number {
  const solar = Solar.fromYmdHms(
    date.getFullYear(), date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(),
  );
  // 月支：lunar-typescript 的 getMonthInGanZhiExact 以节气换月，正合玄空月建。
  const gz = solar.getLunar().getMonthInGanZhiExact();
  const zhi = gz.charAt(1);
  const idx = ZHI.indexOf(zhi as (typeof ZHI)[number]);
  if (idx < 0) throw new Error(`无法解析月支：${gz}`);
  // 寅 = 索引 2 → 月序 1
  return ((idx - 2 + 12) % 12) + 1;
}
