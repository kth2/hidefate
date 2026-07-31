/**
 * 预测账本类型定义。
 *
 * 账本是整个对轨回路的地基。没有它，「③ AI 比对偏差」比的是两个不同的模型，
 * 「⑦ 修正模型信心」修的是被事后记忆污染过的印象。
 *
 * ## 四条写死在类型与写入守卫里的规矩
 *
 * 1. **只增不改（append-only）。** `resolve()` 返回**新记录**而不是就地改旧的。
 *    预测一经冻结，其 statement、probability、window 永不可变 ——
 *    可改的预测等于没有预测。
 * 2. **无判据不受理。** `resolution` 必填且须具体到第三者能判定。
 *    「今年财运有起伏」这类永远为真的条目在写入期就被拒。
 * 3. **必带引擎版本与输入哈希。** 缺任一项，日后重放就无法确认比对的是同一个模型。
 * 4. **基准率缺失必须显式为 null 并被标注。** 若某事本来六成人都会遇上，
 *    报 60% 等于零信息 —— 不能让它冒充有效预测。
 *
 * 见 docs/ROADMAP.md §6.1。
 */

import type { Interventionability, XiangDomain, XiangLayer } from '@hidefate/core-xiangyi';

export type { Interventionability, XiangDomain, XiangLayer };

/** 结算判定方式。 */
export type Judge = '用户自评' | '客观记录';

/** 结算标准 —— 缺此项拒绝写入。 */
export interface ResolutionSpec {
  /** 何为「应验」。须具体到第三者能判定。 */
  readonly criterion: string;
  readonly judge: Judge;
}

/** 预测窗口。年级预测用 `fromYear/toYear`；占局等短窗用 `fromISO/toISO`。 */
export interface PredictionWindow {
  readonly fromYear: number;
  readonly toYear: number;
  /** 精确窗口；给出则以它为准，年份仅作索引。 */
  readonly fromISO?: string;
  readonly toISO?: string;
}

export type PredictionStatus = '待结算' | '已结算' | '窗口过期' | '资料不足';

export type Verdict = '中' | '部分中' | '未发生' | '反向';

export interface Outcome {
  readonly verdict: Verdict;
  readonly note?: string;
  /** ISO。 */
  readonly recordedAt: string;
  /**
   * 用户认定的真正原因层。**必须允许「现实层」** ——
   * 一个不能说「这次跟命理风水没关系」的系统，必然退化成确认偏误机器。
   */
  readonly attribution?: AttributionLayer;
}

/** 归因层。见 docs/ROADMAP.md §8。 */
export type AttributionLayer = '命层' | '运层' | '风水层' | '现实层';

/**
 * 一条冻结的预测。
 *
 * 除 `status` 与 `outcome` 外，全部字段在冻结后不可变；
 * 结算不修改本记录，而是由 `resolvePrediction()` 产出一条新记录。
 */
export interface PredictionRecord {
  readonly id: string;
  readonly personId: string;
  /** 生成时刻，写入即锁。 */
  readonly createdAt: string;
  /** 各 core 包版本 + 规则集签名。缺此项则日后比对的是两个不同模型。 */
  readonly engineVersion: string;
  /** 生辰 + 居住史 + 化解史的规范化哈希，用于确定性重放。 */
  readonly inputHash: string;
  readonly window: PredictionWindow;
  readonly domain: XiangDomain;
  /** 断语。须具体到能被 `resolution.criterion` 判定。 */
  readonly statement: string;
  /** 支持本条预测的象意 id。 */
  readonly candidateXiangIds: readonly string[];
  /** 哪几层在说话。 */
  readonly layers: readonly XiangLayer[];
  /** 概率 0–1；沿用 core-synthesis 的上下限约定，绝不为 0 或 1。 */
  readonly probability: number;
  /**
   * 人群基准率。**无可靠基准时必须显式置 null**，UI 须标注「无基准」，
   * 不得让「六成人都会遇上的事报 60%」冒充有效预测。
   */
  readonly baseRate: number | null;
  readonly resolution: ResolutionSpec;
  /** 见 docs/ROADMAP.md §8：无化解也要出预测，但必须标明可干预性。 */
  readonly interventionability: Interventionability;
  /**
   * 窗口内是否施做过化解。
   * true 者**不参与校准** —— 无法区分「化解生效」与「预测本来就错」。
   */
  readonly intervened: boolean;
  readonly status: PredictionStatus;
  readonly outcome?: Outcome;
}

/**
 * 负样本 —— 与预测同等重要。
 *
 * 「这年这方面平安无事」必须由用户主动填写才成立。
 * 只记发生过的事，证据只增不减，象意永远收敛不下去 —— 那是幸存者偏差。
 */
export interface QuietRecord {
  readonly id: string;
  readonly personId: string;
  readonly year: number;
  readonly domain: XiangDomain;
  readonly note?: string;
  readonly recordedAt: string;
}

/** 冻结一条预测所需的输入（`id`／`createdAt`／`status` 由账本生成）。 */
export interface PredictionDraft {
  readonly personId: string;
  readonly engineVersion: string;
  readonly inputHash: string;
  readonly window: PredictionWindow;
  readonly domain: XiangDomain;
  readonly statement: string;
  readonly candidateXiangIds: readonly string[];
  readonly layers: readonly XiangLayer[];
  readonly probability: number;
  readonly baseRate: number | null;
  readonly resolution: ResolutionSpec;
  readonly interventionability: Interventionability;
  readonly intervened?: boolean;
}
