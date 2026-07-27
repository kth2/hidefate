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
