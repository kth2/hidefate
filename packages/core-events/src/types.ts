/**
 * 事件层类型。
 *
 * ## 为什么要有这一层
 *
 * 象意字典给的是**取象范畴**：「竞争、创业、独当一面承压」。
 * 那是古法的语言，不是人话，更不是预测 —— 用户想知道的是
 * 「八月工作上可能被裁」「今年可能遇到感情对象」「三月有一笔计划外进账」。
 *
 * 中间缺的就是这一层：把「哪些象同时在场」翻成**一件具体的、
 * 有时间、能想象出画面、能事后判定发生与否的事**。
 *
 * ## 与象意层的分工
 *
 * - 象意（core-xiangyi）：某个盘面元素能取哪些象，以及这些象在此人身上成不成立
 * - 事件（本包）：哪几个象凑齐时，会显化成哪一件具体的事
 *
 * 一个事件通常要多个象同时在场才成立 —— 单看七杀说不出是裁员还是创业，
 * 要看它有没有被制、有没有驿马冲动、流年是不是在克身。
 */

import type { Interventionability, XiangDomain, XiangLayer } from '@hidefate/core-xiangyi';

export type { Interventionability, XiangDomain, XiangLayer };

/** 时间精度。能定到月的才定到月 —— 定不到就老实说只能到年。 */
export type EventGranularity = '年' | '月';

export interface EventTemplate {
  readonly id: string;
  /**
   * 事件名。**必须具体到能想象出画面**，且是人话。
   * 「事业有变动」不合格，「被裁员、被动调岗或降职」才合格。
   */
  readonly title: string;
  readonly domain: XiangDomain;
  readonly valence: '吉' | '凶' | '中';
  /** 这些 token 必须全部在场。 */
  readonly allOf?: readonly string[];
  /** 至少命中一个。 */
  readonly anyOf?: readonly string[];
  /**
   * 任一在场即否决 —— 对应古法的「制化」。
   * 七杀有食神制则不作凶论，这类规则全靠这一项表达。
   */
  readonly noneOf?: readonly string[];
  /** 需几层共振才够格出报。涉身体、官非、破财者一律 ≥2。 */
  readonly minResonance: 1 | 2 | 3;
  readonly granularity: EventGranularity;
  /** 古法轻重的工程化取值，**不参与学习**。 */
  readonly prior: number;
  readonly classic: string;
  readonly interventionability: Interventionability;
  /** 结算标准。`{窗口}` 会被实际时间区间替换。 */
  readonly criterion: string;
  /** 一句可操作的提前量。凶事必填，吉事可给把握建议。 */
  readonly advice: string;
}

/** 带出处的 token —— 与 core-xiangyi 的 TaggedToken 同构。 */
export interface EventToken {
  readonly token: string;
  readonly layer: XiangLayer;
}

/** 一次事件评估的输入。 */
export interface EventContext {
  readonly year: number;
  /** 节气月序 1–12（1 = 寅月）。给出则可产出月级事件。 */
  readonly monthIndex?: number;
  readonly tokens: readonly EventToken[];
}

/** 预测出的一件具体事。 */
export interface PredictedEvent {
  readonly templateId: string;
  readonly title: string;
  readonly domain: XiangDomain;
  readonly valence: '吉' | '凶' | '中';
  readonly year: number;
  /** 月级事件才有；年级为 null。 */
  readonly monthIndex: number | null;
  /** 人话的时间说法，如「2027 年 3–4 月」。 */
  readonly whenLabel: string;
  readonly granularity: EventGranularity;
  /** 哪几层在说话。 */
  readonly layers: readonly XiangLayer[];
  readonly resonance: 1 | 2 | 3;
  readonly probability: number;
  /** 命中了哪些盘面元素 —— 用户追问「凭什么」时的答案。 */
  readonly matched: readonly string[];
  readonly criterion: string;
  readonly advice: string;
  readonly classic: string;
  readonly interventionability: Interventionability;
}
