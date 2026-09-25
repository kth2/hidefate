/**
 * 反复出现的事 —— 把十年里年年都报的同一件事折成一条。
 *
 * 大运十神十年不变、流年十神十年轮一圈，于是「工作上遇裁员 41%」会在十年里报上七次。
 * 每年都完整列一遍，读的人看到的是同一张卡片刷屏，真正「只有这一年才有」的事反而被埋掉。
 *
 * 折叠只改呈现，不改任何概率：反复出现的事照样逐年保留时间与概率，
 * 只是集中在一处列出；每年的卡片里只完整展开这一年特有的事。
 */

import type { PredictedEvent } from './types.js';

/** 十年里出现几年以上算「反复出现」。 */
export const RECURRING_MIN_YEARS = 3;

export interface RecurringEvent {
  readonly templateId: string;
  readonly title: string;
  readonly domain: PredictedEvent['domain'];
  readonly valence: PredictedEvent['valence'];
  readonly advice: string;
  /** 逐年的时间与概率，按年份排。 */
  readonly occurrences: readonly { year: number; whenLabel: string; probability: number }[];
  readonly maxProbability: number;
}

export interface FoldedYears {
  readonly recurring: readonly RecurringEvent[];
  /** 该事件是否属于反复出现的那一类。 */
  readonly isRecurring: (templateId: string) => boolean;
  /** 每年特有的事（不含反复出现的），按概率从高到低。 */
  readonly specific: ReadonlyMap<number, readonly PredictedEvent[]>;
  /** 特有凶事的最高概率最高的几年 —— 「这十年里最值得留意的年份」。 */
  readonly standoutYears: readonly { year: number; event: PredictedEvent }[];
}

export function foldRecurring(
  years: readonly { readonly year: number; readonly events: readonly PredictedEvent[] }[],
  minYears = RECURRING_MIN_YEARS,
  standoutCount = 3,
): FoldedYears {
  const byTemplate = new Map<string, PredictedEvent[]>();
  for (const y of years) {
    for (const e of y.events) {
      const list = byTemplate.get(e.templateId) ?? [];
      list.push(e);
      byTemplate.set(e.templateId, list);
    }
  }

  const recurringIds = new Set<string>();
  const recurring: RecurringEvent[] = [];
  for (const [id, list] of byTemplate) {
    // 按「出现在几个不同年份」算 —— 月级事件一年可能有两个窗口，不该算两年
    const distinctYears = new Set(list.map((e) => e.year));
    if (distinctYears.size < minYears) continue;
    recurringIds.add(id);
    const first = list[0]!;
    const occurrences = list
      .map((e) => ({ year: e.year, whenLabel: e.whenLabel, probability: e.probability }))
      .sort((a, b) => a.year - b.year || b.probability - a.probability);
    recurring.push({
      templateId: id,
      title: first.title,
      domain: first.domain,
      valence: first.valence,
      advice: first.advice,
      occurrences,
      maxProbability: Math.max(...occurrences.map((o) => o.probability)),
    });
  }
  // 凶事在前，同类按最高概率
  recurring.sort(
    (a, b) => Number(b.valence === '凶') - Number(a.valence === '凶') || b.maxProbability - a.maxProbability,
  );

  const specific = new Map<number, PredictedEvent[]>();
  for (const y of years) {
    specific.set(
      y.year,
      y.events.filter((e) => !recurringIds.has(e.templateId)).sort((a, b) => b.probability - a.probability),
    );
  }

  const standoutYears = [...specific.entries()]
    .map(([year, evs]) => ({ year, event: evs.find((e) => e.valence === '凶') }))
    .filter((x): x is { year: number; event: PredictedEvent } => x.event != null)
    .sort((a, b) => b.event.probability - a.event.probability)
    .slice(0, standoutCount)
    .sort((a, b) => a.year - b.year);

  return { recurring, isRecurring: (id) => recurringIds.has(id), specific, standoutYears };
}
