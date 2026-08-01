/**
 * 事件匹配：盘面 token → 一件具体的、有时间的事。
 *
 * 纯函数、无 I/O。判定完全由 `EventTemplate` 的 allOf / anyOf / noneOf 决定，
 * 不含任何模型生成 —— 事件名与结算标准都是事先写死的人话，
 * AI 只被允许在此之上解释，不得新造事件。
 */

import { EVENT_TEMPLATES } from './templates.js';
import type {
  EventContext,
  EventTemplate,
  EventToken,
  PredictedEvent,
  XiangLayer,
} from './types.js';

/** 节气月序 → 公历月份区间（近似，用于给人看的时间说法）。 */
const MONTH_LABEL: readonly string[] = [
  '', '2–3 月', '3–4 月', '4–5 月', '5–6 月', '6–7 月', '7–8 月',
  '8–9 月', '9–10 月', '10–11 月', '11–12 月', '12–1 月', '1–2 月',
];

/** 概率上下限，与账本一致 —— 绝不输出 0 或 1。 */
export const PROB_FLOOR = 0.03;
export const PROB_CEIL = 0.92;

const clamp = (p: number) => Math.max(PROB_FLOOR, Math.min(PROB_CEIL, p));

export interface MatchResult {
  readonly ok: boolean;
  /** 命中的 token。 */
  readonly matched: readonly string[];
  /** 说话的层。 */
  readonly layers: readonly XiangLayer[];
  /** 其中带运层出处的命中 token —— 它们才是「触发」。 */
  readonly yunTokens: readonly string[];
  /** 若被否决，是被哪个 token 否决的。 */
  readonly vetoedBy?: string;
  readonly reason: string;
}

/**
 * 判定单个模板是否成立。
 *
 * 顺序刻意是 noneOf 优先 —— 古法的制化是**先看有没有救**，
 * 有制则整条不成立，而不是先算凶再打个折。
 */
export function matchTemplate(
  tpl: EventTemplate,
  tokens: readonly EventToken[],
): MatchResult {
  const byToken = new Map<string, Set<XiangLayer>>();
  for (const t of tokens) {
    const s = byToken.get(t.token) ?? new Set<XiangLayer>();
    s.add(t.layer);
    byToken.set(t.token, s);
  }
  const has = (x: string) => byToken.has(x);

  // 1. 制化否决
  const veto = (tpl.noneOf ?? []).find(has);
  if (veto) {
    return {
      ok: false,
      matched: [],
      layers: [],
      yunTokens: [],
      vetoedBy: veto,
      reason: `见「${veto}」有制，此事不成立 —— 古法先看有没有救，有制则不作凶论。`,
    };
  }

  // 2. 必要条件
  const missing = (tpl.allOf ?? []).filter((x) => !has(x));
  if (missing.length > 0) {
    return { ok: false, matched: [], layers: [], yunTokens: [], reason: `缺必要条件：${missing.join('、')}` };
  }

  // 3. 择一条件
  const anyHit = (tpl.anyOf ?? []).filter(has);
  if ((tpl.anyOf?.length ?? 0) > 0 && anyHit.length === 0) {
    return { ok: false, matched: [], layers: [], yunTokens: [], reason: `择一条件一个都没命中：${tpl.anyOf!.join('、')}` };
  }

  const matched = [...new Set([...(tpl.allOf ?? []), ...anyHit])];
  const layers = new Set<XiangLayer>();
  const yunTokens: string[] = [];
  for (const m of matched) {
    const ls = byToken.get(m) ?? new Set<XiangLayer>();
    for (const l of ls) layers.add(l);
    if (ls.has('运')) yunTokens.push(m);
  }

  return { ok: true, matched, layers: [...layers], yunTokens, reason: '条件成立' };
}

const clampResonance = (n: number): 1 | 2 | 3 => (n >= 3 ? 3 : n === 2 ? 2 : 1);

/**
 * 概率取值：先验 × 共振加成 × 命中数加成。
 *
 * 工程化取值、可复算、与 core-synthesis 及 lifeStore 同一口径。
 * 命中数加成刻意做得很轻（每多命中一个 +4%，上限 +12%）——
 * 命中得多只说明这一象在场的迹象多，不说明它一定会发生。
 */
export function eventProbability(tpl: EventTemplate, resonance: number, matchCount: number): number {
  const resBonus = resonance >= 3 ? 1.35 : resonance === 2 ? 1.15 : 0.85;
  const hitBonus = 1 + Math.min(3, Math.max(0, matchCount - 1)) * 0.04;
  return clamp(Number((tpl.prior * resBonus * hitBonus).toFixed(4)));
}

export interface PredictOptions {
  /** 只要这些领域。 */
  readonly domains?: readonly string[];
  /** 自定模板表（测试用）。 */
  readonly templates?: readonly EventTemplate[];
}

/**
 * 评估一个时点上会成立哪些事件。
 *
 * 传了 `monthIndex` 才会产出月级事件 —— 定不到月就不假装定得到。
 */
export function predictEvents(
  ctx: EventContext,
  opts: PredictOptions = {},
): PredictedEvent[] {
  const templates = opts.templates ?? EVENT_TEMPLATES;
  const out: PredictedEvent[] = [];

  for (const tpl of templates) {
    if (opts.domains && !opts.domains.includes(tpl.domain)) continue;
    // 月级模板须给到月，否则跳过 —— 宁可不报，也不把月级事件摊成一整年
    if (tpl.granularity === '月' && ctx.monthIndex == null) continue;

    const m = matchTemplate(tpl, ctx.tokens);
    if (!m.ok) continue;

    /**
     * **必须有运层参与，否则不出报。**
     *
     * 架构上：命层给先验、风水层给调节、**运层给触发**（见 docs/ROADMAP.md §1）。
     * 大运十神十年不变、宅飞星更是整段常量 —— 只靠这两层，同一条事件会年年成立，
     * 于是「今年可能发横财」连报十年，「可能被裁」也连报十年，信号被自己稀释光。
     *
     * 更要紧的是它不讲理：没有任何当年独有的东西在动，凭什么说是**这一年**？
     * 没有触发就没有时点，没有时点就不该给出带年份的预测。
     */
    if (!m.layers.includes('运')) continue;

    /**
     * 月级事件还要**年月并临**：至少两个带运层出处的 token 同时命中。
     *
     * 理由是基准率。流月十神每年必然轮遍十神一圈 —— 「今年某个月是偏财月」
     * 的发生概率是 1.0。以它单独作触发，「今年可能有一笔计划外进账」
     * 会连报十年（实测正是如此），而这条预测相对人群基准毫无信息量，
     * 恰恰是本项目的 Brier Skill Score 要判零分的那种。
     *
     * 要月级的精度，就得付月级的代价：得有两路运层信号同时到位
     * （如流月十神与流年紫白并临），否则只能退回年级或干脆不报。
     */
    if (tpl.granularity === '月' && m.yunTokens.length < 2) continue;

    const resonance = clampResonance(m.layers.length);
    if (resonance < tpl.minResonance) continue;

    const monthIndex = tpl.granularity === '月' ? (ctx.monthIndex ?? null) : null;
    // 年级不写「年内」—— criterion 模板本身是「{窗口}内是否…」，
    // 写成「2026 年内」会拼出「2026 年内内是否…」。实跑界面时看到的。
    const whenLabel =
      monthIndex != null
        ? `${ctx.year} 年 ${MONTH_LABEL[monthIndex] ?? `第 ${monthIndex} 月`}`
        : `${ctx.year} 年`;

    out.push({
      templateId: tpl.id,
      title: tpl.title,
      domain: tpl.domain,
      valence: tpl.valence,
      year: ctx.year,
      monthIndex,
      whenLabel,
      granularity: tpl.granularity,
      layers: m.layers,
      resonance,
      probability: eventProbability(tpl, resonance, m.matched.length),
      matched: m.matched,
      criterion: tpl.criterion.replace('{窗口}', whenLabel),
      advice: tpl.advice,
      classic: tpl.classic,
      interventionability: tpl.interventionability,
    });
  }

  // 共振高者、概率大者在前；同分按 id 稳定排序，保证可重放。
  return out.sort(
    (a, b) => b.resonance - a.resonance || b.probability - a.probability || a.templateId.localeCompare(b.templateId),
  );
}

/**
 * 汇总一年：先按年级评一遍，再逐月评一遍，合并去重。
 *
 * 同一个模板若在多个月成立，只留概率最高的那个月 ——
 * 「三月和七月都可能被裁」对用户没有帮助，说不清就别说十二遍。
 */
export function predictYear(
  year: number,
  yearTokens: readonly EventToken[],
  monthTokens: (monthIndex: number) => readonly EventToken[],
  opts: PredictOptions = {},
): PredictedEvent[] {
  const yearly = predictEvents({ year, tokens: yearTokens }, opts);

  const best = new Map<string, PredictedEvent>();
  for (let m = 1; m <= 12; m++) {
    const evts = predictEvents({ year, monthIndex: m, tokens: [...yearTokens, ...monthTokens(m)] }, opts);
    for (const e of evts) {
      if (e.granularity !== '月') continue;
      const prev = best.get(e.templateId);
      if (!prev || e.probability > prev.probability) best.set(e.templateId, e);
    }
  }

  return [...yearly, ...best.values()].sort(
    (a, b) => b.resonance - a.resonance || b.probability - a.probability || a.templateId.localeCompare(b.templateId),
  );
}
