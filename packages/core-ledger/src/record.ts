/**
 * 账本写入与结算。
 *
 * 所有守卫都在**写入期**执行，而不是读出时再检查 ——
 * 一条不可证伪的预测一旦进了账本，它污染的是此后所有的校准结论，
 * 而且没人会回头去查它当初该不该进来。
 */

import type {
  Outcome,
  PredictionDraft,
  PredictionRecord,
  PredictionStatus,
  PredictionWindow,
  ResolutionSpec,
  Verdict,
} from './types.js';

/** 概率上下限，与 core-synthesis 的 `PROB_FLOOR`/`PROB_CEIL` 一致。 */
export const PROB_FLOOR = 0.03;
export const PROB_CEIL = 0.92;

/** 判据最短长度。低于此长度基本不可能写出可判定的标准。 */
export const MIN_CRITERION_LENGTH = 6;

/**
 * 明令拒收的模糊措辞。
 *
 * 这不是穷举（也不可能穷举），是**挡住最常见的几种自欺**。
 * 真正的防线是 `MIN_CRITERION_LENGTH` 与人工复核，这里只做第一道筛。
 */
const VAGUE_PATTERNS: readonly RegExp[] = [
  /有[起波]伏/,
  /有好有坏/,
  /不太顺/,
  /还[可不]以/,
  /看情况/,
  /因人而异/,
];

export function assertResolution(r: ResolutionSpec | undefined): asserts r is ResolutionSpec {
  if (!r || typeof r.criterion !== 'string') {
    throw new Error('缺少结算标准：预测写入账本前必须写明「何为应验」。');
  }
  const c = r.criterion.trim();
  if (c.length < MIN_CRITERION_LENGTH) {
    throw new Error(
      `结算标准过短（${c.length} 字）：须具体到第三者能判定，如「八月底前收到书面录用通知」。`,
    );
  }
  for (const p of VAGUE_PATTERNS) {
    if (p.test(c)) {
      throw new Error(
        `结算标准「${c}」无法证伪 —— 这类表述永远为真，落进账本只会污染此后所有校准结论。`,
      );
    }
  }
  if (r.judge !== '用户自评' && r.judge !== '客观记录') {
    throw new Error('结算方式须为「用户自评」或「客观记录」之一。');
  }
}

function assertWindow(w: PredictionWindow): void {
  if (!Number.isInteger(w.fromYear) || !Number.isInteger(w.toYear)) {
    throw new Error('预测窗口的起止年须为整数。');
  }
  if (w.toYear < w.fromYear) {
    throw new Error(`预测窗口起止颠倒：${w.fromYear} → ${w.toYear}。`);
  }
  if (w.fromISO != null || w.toISO != null) {
    if (w.fromISO == null || w.toISO == null) {
      throw new Error('精确窗口须同时给出 fromISO 与 toISO。');
    }
    const a = Date.parse(w.fromISO);
    const b = Date.parse(w.toISO);
    if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('精确窗口的 ISO 时刻无法解析。');
    if (b < a) throw new Error('精确窗口起止颠倒。');
  }
}

/**
 * 冻结一条预测。
 *
 * 返回的对象经 `Object.freeze` 深冻 —— 「只增不改」不靠自觉，靠运行时挡住。
 *
 * @param draft 预测内容
 * @param id 账本 id，由调用方生成（本包不产生随机数，以保持纯函数与可重放）
 * @param createdAt ISO 时刻，同上
 */
export function freezePrediction(
  draft: PredictionDraft,
  id: string,
  createdAt: string,
): PredictionRecord {
  if (!id || !draft.personId) throw new Error('预测记录须有 id 与 personId。');
  if (!draft.engineVersion) {
    throw new Error('缺少 engineVersion：日后重放将无法确认比对的是同一个模型。');
  }
  if (!draft.inputHash) {
    throw new Error('缺少 inputHash：无法做确定性重放校验。');
  }
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`createdAt 无法解析：${createdAt}`);
  }
  if (!draft.statement || draft.statement.trim().length < MIN_CRITERION_LENGTH) {
    throw new Error('断语过短，无法与结算标准对应。');
  }
  if (!(draft.probability >= PROB_FLOOR && draft.probability <= PROB_CEIL)) {
    throw new Error(
      `概率须落在 ${PROB_FLOOR}–${PROB_CEIL}：收到 ${draft.probability}。` +
        '风水与命理不是决定论，账本不接受 0 或 1。',
    );
  }
  if (draft.baseRate !== null && !(draft.baseRate >= 0 && draft.baseRate <= 1)) {
    throw new Error(`基准率须为 0–1 或显式 null：收到 ${draft.baseRate}。`);
  }
  if (draft.layers.length === 0) {
    throw new Error('预测必须记录是哪几层在说话，否则日后无从归因。');
  }
  if (draft.candidateXiangIds.length === 0) {
    throw new Error('预测必须挂上支持它的象意 id，否则无从收敛象意。');
  }
  assertWindow(draft.window);
  assertResolution(draft.resolution);

  const record: PredictionRecord = {
    id,
    personId: draft.personId,
    createdAt,
    engineVersion: draft.engineVersion,
    inputHash: draft.inputHash,
    window: Object.freeze({ ...draft.window }),
    domain: draft.domain,
    statement: draft.statement,
    candidateXiangIds: Object.freeze([...draft.candidateXiangIds]),
    layers: Object.freeze([...draft.layers]),
    probability: draft.probability,
    baseRate: draft.baseRate,
    resolution: Object.freeze({ ...draft.resolution }),
    interventionability: draft.interventionability,
    intervened: draft.intervened ?? false,
    status: '待结算',
  };
  return Object.freeze(record);
}

/**
 * 结算一条预测。**不修改原记录**，返回一条新的。
 *
 * @param record 待结算的预测
 * @param outcome 结果
 * @param intervenedDuringWindow 窗口内是否施做过化解；true 者不参与校准
 */
export function resolvePrediction(
  record: PredictionRecord,
  outcome: Outcome,
  intervenedDuringWindow = false,
): PredictionRecord {
  if (record.status === '已结算') {
    throw new Error(
      `预测 ${record.id} 已结算（${record.outcome?.verdict}）。账本只增不改，` +
        '要更正请另立一条更正记录并注明缘由，不得覆盖原结论。',
    );
  }
  if (Number.isNaN(Date.parse(outcome.recordedAt))) {
    throw new Error(`结算时刻无法解析：${outcome.recordedAt}`);
  }
  const next: PredictionRecord = {
    ...record,
    status: '已结算',
    intervened: record.intervened || intervenedDuringWindow,
    outcome: Object.freeze({ ...outcome }),
  };
  return Object.freeze(next);
}

/** 窗口是否已过（用于把待结算记录标为「窗口过期」）。 */
export function isWindowExpired(record: PredictionRecord, now: Date): boolean {
  if (record.window.toISO) return now.getTime() > Date.parse(record.window.toISO);
  // 年级窗口以立春年计，粗略取次年 2 月 4 日为界。
  return now.getTime() > new Date(record.window.toYear + 1, 1, 4).getTime();
}

/** 到期扫描：把过期的待结算记录标为「窗口过期」，其余原样返回。 */
export function expireStale(
  records: readonly PredictionRecord[],
  now: Date,
): PredictionRecord[] {
  return records.map((r) => {
    if (r.status !== '待结算' || !isWindowExpired(r, now)) return r;
    const next: PredictionRecord = { ...r, status: '窗口过期' as PredictionStatus };
    return Object.freeze(next);
  });
}

/** 结论 → 象意证据的判定（与 core-xiangyi 的 `XiangEvidence.verdict` 同构）。 */
export function verdictOf(record: PredictionRecord): Verdict | null {
  return record.outcome?.verdict ?? null;
}
