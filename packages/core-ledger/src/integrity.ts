/**
 * 输入哈希与重放校验。
 *
 * 「③ AI 比对偏差」的前提是：比的必须是同一个模型对同一份输入的输出。
 * 没有这一层，改了权重再回头看旧预测，比出来的差异全是自己制造的。
 */

import type { PredictionRecord } from './types.js';
import type { XiangEvidence } from '@hidefate/core-xiangyi';

/**
 * 规范化 JSON：对象键递归排序，`undefined` 去除。
 *
 * 目的是让「同一份输入」不因键序或序列化顺序不同而算出不同哈希。
 * 数组顺序**有意义**，不排序 —— 居住史与化解史的先后本来就是数据的一部分。
 */
export function canonicalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) {
    if (src[k] === undefined) continue;
    out[k] = canonicalise(src[k]);
  }
  return out;
}

/** FNV-1a 32 位，单轮。 */
function fnv1a32(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 64 位哈希（两轮 FNV-1a 不同初值拼接）。
 *
 * 非加密用途：它防的是「无意间比对了不同输入」，不防蓄意伪造。
 * 账本存在本机、由用户自己掌握，威胁模型里没有需要防篡改的对手。
 */
export function hashInput(value: unknown): string {
  const json = JSON.stringify(canonicalise(value));
  const a = fnv1a32(json, 0x811c9dc5);
  const b = fnv1a32(json, 0x01000193);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export interface ReplayVerdict {
  readonly ok: boolean;
  readonly reason: string;
}

/**
 * 重放校验：确认重算所用的输入与引擎，与账本里那条记录的完全一致。
 *
 * 不一致时**不要**去比对结论 —— 结论必然不同，而那个不同毫无意义。
 */
export function verifyReplay(
  record: PredictionRecord,
  replayed: { readonly engineVersion: string; readonly inputHash: string },
): ReplayVerdict {
  if (record.engineVersion !== replayed.engineVersion) {
    return {
      ok: false,
      reason:
        `引擎版本不同：账本记的是 ${record.engineVersion}，重算用的是 ${replayed.engineVersion}。` +
        '此时比对结论没有意义 —— 差异来自引擎改动，不是来自预测本身。',
    };
  }
  if (record.inputHash !== replayed.inputHash) {
    return {
      ok: false,
      reason:
        `输入哈希不同：账本记的是 ${record.inputHash}，重算得到 ${replayed.inputHash}。` +
        '多半是生辰、居住史或化解史被改过 —— 请先查明改了什么，再决定这条记录还算不算数。',
    };
  }
  return { ok: true, reason: '引擎与输入均一致，可以比对结论。' };
}

/**
 * 该记录能否参与校准。
 *
 * 三种情况一律排除：
 *   - 未结算：还不知道结果
 *   - 窗口内施做过化解：无法区分「化解生效」与「预测本来就错」，属混杂
 *   - 无基准率：不知道人群基线，算不出这条预测究竟提供了多少信息
 */
export function isCalibratable(record: PredictionRecord): boolean {
  return record.status === '已结算' && !record.intervened && record.baseRate !== null;
}

/** 排除原因说明，供 UI 解释「为什么这条不算数」。 */
export function calibrationExclusionReason(record: PredictionRecord): string | null {
  if (record.status !== '已结算') return '尚未结算。';
  if (record.intervened) {
    return '窗口内施做过化解 —— 无法区分是化解生效还是预测本来就错，故不参与校准。';
  }
  if (record.baseRate === null) return '无人群基准率，无从判断这条预测提供了多少信息。';
  return null;
}

/**
 * 把已结算记录转成象意证据流。
 *
 * 一条预测可支持多条象意，故对每个 `candidateXiangIds` 各出一条证据。
 * **不可校准的记录一律不转** —— 混杂样本流进后验，学到的就是化解的效果而非象意的准确度。
 */
export function toXiangEvidence(
  records: readonly PredictionRecord[],
): Map<string, XiangEvidence[]> {
  const out = new Map<string, XiangEvidence[]>();
  for (const r of records) {
    if (!isCalibratable(r) || !r.outcome) continue;
    for (const xiangId of r.candidateXiangIds) {
      const list = out.get(xiangId) ?? [];
      list.push({
        recordId: r.id,
        verdict: r.outcome.verdict,
        recordedAt: r.outcome.recordedAt,
      });
      out.set(xiangId, list);
    }
  }
  return out;
}
