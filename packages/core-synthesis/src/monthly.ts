/**
 * 逐月：接下来十二个节气月，每个人每个月要注意什么。
 *
 * **年为底、月为触发。** 流月紫白只在一个月内起作用，单独拿它断事，
 * 每个月九宫都有凶星，月月有事 —— 那样的逐月视图毫无分辨力。所以：
 *
 *   月概率 = 此人今年在此处的个人概率（底）
 *            ± 本月飞入此处之星的吉凶 × 此人受此处影响的程度（触发）
 *
 * 底取自 `predict()` 的个人概率；月星只做加减，而且乘上受影响程度 ——
 * 二黑飞进你偶尔经过的阳台，与飞进你每晚睡的卧房，不是一回事。
 * 每一格都带着理由（「八月二黑入西北（阳台）」），可复算。
 */

import {
  PALACE_DIRECTION,
  SOLAR_MONTH_LABEL,
  STAR_META,
  STAR_NAME,
  monthlyPlate,
  solarMonthRange,
  starScore,
  type PalaceIndex,
  type RiskDomain,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { PROB_CEIL, PROB_FLOOR, predict, probabilityFor } from './predict.js';
import type { AnalysisInput, Member, Prediction } from './types.js';

/** 月星对月概率的力度（logit 单位，乘在 -starScore 上）。 */
export const MONTH_STAR_WEIGHT = 0.9;
/** 月星所主之事正是此维度时的加项（只在月星为凶时加）。 */
export const MONTH_DOMAIN_MATCH = 0.25;

export type MonthLevel = '平' | '留意' | '警戒';

/**
 * 与此人今年的常态相比，这个月是加重、如常还是缓和。
 *
 * 只看绝对等级不够：卧房全年都不好的人，十二个月都是「警戒」，
 * 看不出哪个月该特别小心。逐月视图要回答的恰恰是「哪几个月比平时更要紧」。
 */
export type MonthTrend = '加重' | '如常' | '缓和';

/** 月概率与全年底相差多少（logit）才算加重／缓和。 */
export const TREND_THRESHOLD = 0.35;

export interface MonthSlot {
  readonly year: number;
  readonly monthIndex: number;
  /** 如「八月」。 */
  readonly label: string;
  /** 公历起讫，如「9/8–10/7」。 */
  readonly range: string;
  readonly start: string;
  readonly end: string;
}

export interface MonthDomain {
  readonly domain: RiskDomain;
  readonly label: string;
  readonly probability: number;
  /** 此人今年在此处此维度的个人概率（月份加减之前的底）。 */
  readonly baseline: number;
  readonly trend: MonthTrend;
  readonly reason: string;
}

export interface MonthCell {
  readonly slot: MonthSlot;
  /** 此人此月各维度（只含今年本就涉及此人的维度）。 */
  readonly domains: readonly MonthDomain[];
  readonly top: MonthDomain | null;
  readonly level: MonthLevel;
  /** 以 top 与其全年底相比。 */
  readonly trend: MonthTrend;
}

export interface MemberMonthly {
  readonly memberId: string;
  readonly name: string;
  readonly months: readonly MonthCell[];
}

export interface MonthlyOutlook {
  readonly slots: readonly MonthSlot[];
  readonly rows: readonly MemberMonthly[];
}

const logit = (p: number) => Math.log(p / (1 - p));
const squash = (x: number) => Math.max(PROB_FLOOR, Math.min(PROB_CEIL, 1 / (1 + Math.exp(-x))));
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function levelOf(p: number | null): MonthLevel {
  if (p == null) return '平';
  if (p >= 0.6) return '警戒';
  if (p >= 0.45) return '留意';
  return '平';
}

/** 自 (fromYear, fromMonth) 起连续 count 个节气月。腊月之后跨入下一个立春年。 */
export function monthSlots(fromYear: number, fromMonth: number, count = 12): MonthSlot[] {
  const out: MonthSlot[] = [];
  for (let i = 0; i < count; i++) {
    const raw = fromMonth - 1 + i;
    const year = fromYear + Math.floor(raw / 12);
    const monthIndex = (raw % 12) + 1;
    const { start, end } = solarMonthRange(year, monthIndex);
    out.push({
      year,
      monthIndex,
      label: SOLAR_MONTH_LABEL[monthIndex - 1]!,
      range: `${md(start)}–${md(end)}`,
      start: iso(start),
      end: iso(end),
    });
  }
  return out;
}

/**
 * 某人某月某条预测的月概率。
 *
 * 只在此人本就出现在该条预测里时才算 —— 孩子不会因为月星而冒出财运。
 */
export function monthProbability(
  pred: Prediction,
  memberId: string,
  slot: MonthSlot,
  period: PalaceIndex,
): MonthDomain | null {
  const base = probabilityFor(pred, memberId);
  const pm = pred.perMember.find((m) => m.memberId === memberId);
  if (base == null || !pm) return null;
  const star = monthlyPlate(slot.year, slot.monthIndex)[pred.palace];
  const s = starScore(star, period);
  const match = s < 0 && STAR_META[star].riskDomains.includes(pred.domain) ? MONTH_DOMAIN_MATCH : 0;
  const shift = (-s * MONTH_STAR_WEIGHT + match) * pm.exposure;
  const trend: MonthTrend = shift >= TREND_THRESHOLD ? '加重' : shift <= -TREND_THRESHOLD ? '缓和' : '如常';
  const where = `${PALACE_DIRECTION[pred.palace]}${pred.room ? `（${pred.room}）` : ''}`;
  const tone = s <= -0.3 ? '，凶星加临' : s >= 0.3 ? '，吉星加临、压力减轻' : '';
  return {
    domain: pred.domain,
    label: pm.domainLabel,
    probability: squash(logit(base) + shift),
    baseline: base,
    trend,
    reason: `${slot.label}${STAR_NAME[star]}入${where}${tone}`,
  };
}

/**
 * 全家逐月。
 *
 * @param input 合参输入（不含年月；年由 fromYear 起逐年补算）
 * @param fromYear 起始立春年
 * @param fromMonth 起始节气月（1–12）
 */
export function monthlyOutlook(
  input: Omit<AnalysisInput, 'year' | 'monthIndex'>,
  fromYear: number,
  fromMonth: number,
  count = 12,
): MonthlyOutlook {
  const slots = monthSlots(fromYear, fromMonth, count);

  // 每个用到的年份算一次全年预测（不带流月，免得月星被算两次）
  const yearly = new Map<number, { preds: Prediction[]; period: PalaceIndex }>();
  for (const y of new Set(slots.map((s) => s.year))) {
    const yi: AnalysisInput = { ...input, year: y };
    const s = synthesise(yi);
    yearly.set(y, { preds: predict(yi, s), period: s.flyingStar.period.period });
  }

  const rows: MemberMonthly[] = input.members.map((m: Member) => ({
    memberId: m.id,
    name: m.name,
    months: slots.map((slot) => {
      const { preds, period } = yearly.get(slot.year)!;
      const best = new Map<string, MonthDomain>();
      for (const p of preds) {
        const d = monthProbability(p, m.id, slot, period);
        if (!d) continue;
        // 按人生方面归并（孩子的「事业」与「学业」都读作学业，只留一条）
        const cur = best.get(d.label);
        if (!cur || d.probability > cur.probability) best.set(d.label, d);
      }
      const domains = [...best.values()].sort((a, b) => b.probability - a.probability);
      const top = domains[0] ?? null;
      return { slot, domains, top, level: levelOf(top?.probability ?? null), trend: top?.trend ?? '如常' };
    }),
  }));

  return { slots, rows };
}
