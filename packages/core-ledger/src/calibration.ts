/**
 * 校准指标 —— 后台用，不进主界面。
 *
 * 它们防的是**我们自己被自己骗**，不是给用户看的成绩单。
 * 用户该看到的是象意收敛过程（core-xiangyi），不是 Brier 分数。
 *
 * 一条关键取向：主指标用 **Brier Skill Score**（相对人群基准率的增益），
 * 不用「准确率」。若某事本来六成人都会遇上，报 60% 而它发生了，
 * 准确率看着漂亮，实则零信息。
 */

import { isCalibratable } from './integrity.js';
import type { PredictionRecord, Verdict } from './types.js';

/** 结论 → 实际发生与否。「部分中」按半次计，与象意后验的口径一致。 */
export function outcomeValue(verdict: Verdict): number {
  if (verdict === '中') return 1;
  if (verdict === '部分中') return 0.5;
  return 0; // 未发生 / 反向
}

export interface CalibrationSummary {
  /** 参与计算的样本数。 */
  readonly n: number;
  /** Brier 分数，越低越好；0 为完美，0.25 为「一律报 50%」的水平。 */
  readonly brier: number | null;
  /** 以人群基准率作参照的 Brier。 */
  readonly baselineBrier: number | null;
  /**
   * Brier Skill Score = 1 − brier / baselineBrier。
   * 大于 0 才说明比「照人群基准率报」更有信息量；小于 0 是负贡献。
   */
  readonly skill: number | null;
  /** 被排除的样本数与原因分布。 */
  readonly excluded: Readonly<Record<string, number>>;
  /** 样本太少时的诚实提示。 */
  readonly caveat: string | null;
}

/** 低于此样本量，任何校准结论都不该被当真。 */
export const MIN_SAMPLES_FOR_MEANING = 20;

export function summariseCalibration(
  records: readonly PredictionRecord[],
): CalibrationSummary {
  const usable: PredictionRecord[] = [];
  const excluded: Record<string, number> = {};

  for (const r of records) {
    if (isCalibratable(r) && r.outcome) {
      usable.push(r);
      continue;
    }
    const key =
      r.status !== '已结算' ? '未结算' : r.intervened ? '窗口内已化解' : '无基准率';
    excluded[key] = (excluded[key] ?? 0) + 1;
  }

  if (usable.length === 0) {
    return {
      n: 0,
      brier: null,
      baselineBrier: null,
      skill: null,
      excluded,
      caveat: '尚无可用于校准的样本。',
    };
  }

  let sum = 0;
  let baseSum = 0;
  for (const r of usable) {
    const actual = outcomeValue(r.outcome!.verdict);
    sum += (r.probability - actual) ** 2;
    baseSum += (r.baseRate! - actual) ** 2;
  }
  const brier = sum / usable.length;
  const baselineBrier = baseSum / usable.length;
  const skill = baselineBrier === 0 ? null : 1 - brier / baselineBrier;

  return {
    n: usable.length,
    brier,
    baselineBrier,
    skill,
    excluded,
    caveat:
      usable.length < MIN_SAMPLES_FOR_MEANING
        ? `仅 ${usable.length} 个样本（建议至少 ${MIN_SAMPLES_FOR_MEANING} 个），此处数值仅供观察，不足以下任何结论。`
        : null,
  };
}

export interface ReliabilityBin {
  /** 区间下界（含）与上界（不含），最后一档上界为 1。 */
  readonly from: number;
  readonly to: number;
  readonly n: number;
  /** 该档内的平均报告概率。 */
  readonly meanPredicted: number | null;
  /** 该档内的实际发生比例。 */
  readonly meanActual: number | null;
}

/**
 * 可靠性曲线分档：「我说 70% 的那些，实际发生了几成」。
 *
 * 这是唯一一个值得考虑给用户看的校准产物 —— 它诚实、直观，
 * 且能解释为什么系统对某些领域更有把握。
 */
export function reliabilityBins(
  records: readonly PredictionRecord[],
  binCount = 5,
): ReliabilityBin[] {
  if (!Number.isInteger(binCount) || binCount < 2) {
    throw new Error(`分档数须为不小于 2 的整数，收到 ${binCount}。`);
  }
  const usable = records.filter((r) => isCalibratable(r) && r.outcome);
  const bins: ReliabilityBin[] = [];

  for (let i = 0; i < binCount; i++) {
    const from = i / binCount;
    const to = (i + 1) / binCount;
    const inBin = usable.filter((r) =>
      i === binCount - 1 ? r.probability >= from : r.probability >= from && r.probability < to,
    );
    bins.push({
      from,
      to,
      n: inBin.length,
      meanPredicted:
        inBin.length === 0 ? null : inBin.reduce((s, r) => s + r.probability, 0) / inBin.length,
      meanActual:
        inBin.length === 0
          ? null
          : inBin.reduce((s, r) => s + outcomeValue(r.outcome!.verdict), 0) / inBin.length,
    });
  }
  return bins;
}
