/**
 * 命卦（本命卦 / 八宅命卦）。
 *
 * 只需「出生年 + 性别」，故即使完全不知道月日时，八宅派的个人化分析依然
 * 100% 成立 —— 这是本 App 能优雅处理残缺八字的关键支点。
 *
 * 算法（三元命卦通用式，年界取立春）：
 *   男：(11 - (Y mod 9)) mod 9，得 0 作 9；得 5 者男寄坤 2
 *   女：((Y mod 9) + 4) mod 9，得 0 作 9；得 5 者女寄艮 8
 *
 * 校验锚点：
 *   1984 男 → 兑 7、女 → 艮 8
 *   1990 男 → 坎 1、女 → 艮 8
 *   2000 男 → 离 9、女 → 乾 6
 */

import { Solar } from 'lunar-typescript';
import type { Gender, MingGuaResult } from './types.js';

const GUA_BY_NUMBER: Record<number, MingGuaResult['gua']> = {
  1: '坎', 2: '坤', 3: '震', 4: '巽', 6: '乾', 7: '兑', 8: '艮', 9: '离',
};

const EAST_GROUP = new Set([1, 3, 4, 9]);

/** 数字根：Y mod 9，0 视作 9 处理前的原始值。 */
function digitalRoot9(y: number): number {
  return ((y % 9) + 9) % 9;
}

/** 该公历年的立春时刻。 */
export function liChunOf(year: number): Date {
  const solar = Solar.fromYmdHms(year, 2, 10, 12, 0, 0);
  const lc = solar.getLunar().getJieQiTable()['立春'];
  if (!lc) throw new Error(`无法求得 ${year} 年立春`);
  return new Date(lc.getYear(), lc.getMonth() - 1, lc.getDay(), lc.getHour(), lc.getMinute(), lc.getSecond());
}

/**
 * 计算命卦。
 *
 * @param year   出生公历年
 * @param gender 性别
 * @param birth  完整出生时刻（可选）。给出则按立春精确归年；
 *               只给年份时，若出生在 1–2 月会明确提示需要月日以确定年界。
 */
export function computeMingGua(
  year: number,
  gender: Gender,
  birth?: { month?: number; day?: number; hour?: number; minute?: number },
): MingGuaResult {
  let effectiveYear = year;
  let adjusted = false;

  if (birth?.month != null) {
    // 只有 1 月与 2 月才可能跨立春。
    if (birth.month <= 2) {
      const lc = liChunOf(year);
      const d = new Date(
        year,
        birth.month - 1,
        birth.day ?? 1,
        birth.hour ?? 12,
        birth.minute ?? 0,
      );
      if (d.getTime() < lc.getTime()) {
        effectiveYear = year - 1;
        adjusted = true;
      }
    }
  }

  const r = digitalRoot9(effectiveYear);
  let n = gender === '男' ? (((11 - r) % 9) + 9) % 9 : ((r + 4) % 9);
  if (n === 0) n = 9;

  let jiGongNote: string | null = null;
  if (n === 5) {
    n = gender === '男' ? 2 : 8;
    jiGongNote = gender === '男'
      ? '本得中五，五黄无正卦，男命寄坤宫（西南），故作坤二命论。'
      : '本得中五，五黄无正卦，女命寄艮宫（东北），故作艮八命论。';
  }

  const num = n as MingGuaResult['number'];
  const gua = GUA_BY_NUMBER[num]!;
  const group = EAST_GROUP.has(num) ? '东四命' : '西四命';

  const formula = gender === '男'
    ? `男命：(11 − ${effectiveYear} mod 9) mod 9 = (11 − ${r}) mod 9`
    : `女命：(${effectiveYear} mod 9 + 4) mod 9 = (${r} + 4) mod 9`;

  return {
    number: num,
    gua,
    group,
    effectiveYear,
    adjustedByLiChun: adjusted,
    jiGongNote,
    derivation:
      `${formula} → ${gua}${num}命，属${group}。` +
      (adjusted ? `（生于立春前，年界回归 ${effectiveYear} 年）` : '') +
      (jiGongNote ? `${jiGongNote}` : '') +
      (birth?.month == null && !adjusted
        ? '（仅提供出生年：若实际生于立春前，命卦须按上一年重算，建议补填出生月日。）'
        : ''),
  };
}

/** 命卦 → 东四 / 西四。 */
export function mingGuaGroup(n: number): '东四命' | '西四命' {
  return EAST_GROUP.has(n) ? '东四命' : '西四命';
}
