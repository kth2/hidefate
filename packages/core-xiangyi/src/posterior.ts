/**
 * 个人后验 —— 象意字典里唯一随用户数据变化的部分。
 *
 * ## 学的是什么、不学什么
 *
 * **学**：这条象意在这个人身上到底成不成立（Beta 后验，向古法先验收缩）。
 * **不学**：古法先验本身、飞星权重、十神取象、八宅游年、奇门定局 —— 一律不动。
 *
 * 理由见 docs/ROADMAP.md §7：n=1、样本数十的情况下做梯度拟合，
 * 只会把噪声学成规律，而且学错了没人看得出来。
 *
 * ## 为什么用伪计数而不是直接算频率
 *
 * 第一条证据就把权重从 0.5 推到 1.0，是这类系统最常见的自欺。
 * 这里用 Beta-Binomial 的伪计数 `PRIOR_STRENGTH` 做收缩：
 * 样本少时权重几乎等于古法先验，样本多了才逐渐让位给证据。
 * 这不是保守，是诚实 —— 三条证据本来就不该推翻千年积累的取象。
 */

import type {
  PosteriorMaturity,
  XiangEvidence,
  XiangPosterior,
  XiangYi,
} from './types.js';

/**
 * 先验伪计数。取 8 的含义：**要八条证据才能把权重推到先验与实测的中点**。
 *
 * 调大 = 更保守（更信古法），调小 = 更激进（更信这个人的数据）。
 * 此值是工程取值，改动它会同时改变所有人的所有后验，属破坏性变更。
 */
export const PRIOR_STRENGTH = 8;

/** 部分应验按半次计。 */
export const PARTIAL_WEIGHT = 0.5;

/** 判定成熟度的证据门槛。 */
export const MATURITY_THRESHOLDS = { 初步: 3, 可参考: 10 } as const;

export interface EvidenceCounts {
  readonly hits: number;
  readonly partial: number;
  readonly misses: number;
}

/**
 * Beta 后验均值，向古法先验收缩。
 *
 * ```
 * weight = (prior × K + hits + 0.5 × partial) / (K + hits + partial + misses)
 * ```
 *
 * `misses` 只计入分母 —— 明确的「该期此域平安无事」会稀释权重，
 * 但**没有记录不算 miss**。只增不减的证据永远收敛不了，那是幸存者偏差。
 */
export function posteriorWeight(prior: number, counts: EvidenceCounts): number {
  const { hits, partial, misses } = counts;
  if (hits < 0 || partial < 0 || misses < 0) {
    throw new Error('证据计数不得为负。');
  }
  const numerator = prior * PRIOR_STRENGTH + hits + PARTIAL_WEIGHT * partial;
  const denominator = PRIOR_STRENGTH + hits + partial + misses;
  return numerator / denominator;
}

/** 成熟度 —— 用于诚实地告诉用户「这条到底学到了没有」。 */
export function maturityOf(counts: EvidenceCounts): PosteriorMaturity {
  const total = counts.hits + counts.partial + counts.misses;
  if (total >= MATURITY_THRESHOLDS.可参考) return '可参考';
  if (total >= MATURITY_THRESHOLDS.初步) return '初步';
  return '未起步';
}

/** 由证据流累计计数。「反向」与「未发生」同样计入 misses。 */
export function countEvidence(evidence: readonly XiangEvidence[]): EvidenceCounts {
  let hits = 0;
  let partial = 0;
  let misses = 0;
  for (const e of evidence) {
    if (e.verdict === '中') hits += 1;
    else if (e.verdict === '部分中') partial += 1;
    else misses += 1; // 未发生 / 反向
  }
  return { hits, partial, misses };
}

/**
 * 由证据流重算某人某条象意的后验。
 *
 * 刻意做成**纯重算而非增量更新**：证据全在账本里，任何时候都能从头算一遍，
 * 于是「后验错了」永远可以靠重算修复，不会因为某次增量写坏而永久带伤。
 */
export function computePosterior(
  entry: XiangYi,
  personId: string,
  evidence: readonly XiangEvidence[],
  updatedAt: string,
): XiangPosterior {
  const counts = countEvidence(evidence);
  return {
    personId,
    xiangId: entry.id,
    hits: counts.hits,
    partial: counts.partial,
    misses: counts.misses,
    weight: posteriorWeight(entry.prior, counts),
    maturity: maturityOf(counts),
    evidence: [...evidence],
    updatedAt,
  };
}

/**
 * 后验相对先验的位移，用于 UI 呈现「系统学到了什么」。
 *
 * 成熟度为「未起步」时返回 0 —— **不许声称学到了东西**。
 * 一两条证据造成的微小位移在统计上没有意义，展示它只会制造虚假的确信。
 */
export function learnedShift(entry: XiangYi, posterior: XiangPosterior): number {
  if (posterior.maturity === '未起步') return 0;
  return posterior.weight - entry.prior;
}

/**
 * 判断某条象意在某人身上是否已被证据**排除**。
 *
 * 门槛刻意设得高：须成熟度达「可参考」且权重跌破先验的一半。
 * 收敛的目标是缩小候选范围，但缩错了比不缩更糟 —— 被误排除的象意
 * 以后不会再被提出来，也就永远没有翻案的机会。
 */
export function isRuledOut(entry: XiangYi, posterior: XiangPosterior): boolean {
  return posterior.maturity === '可参考' && posterior.weight < entry.prior * 0.5;
}
