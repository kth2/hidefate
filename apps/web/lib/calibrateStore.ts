'use client';

/**
 * 后验的读写。
 *
 * **后验是缓存，账本才是事实来源。** 每次结算后整体重算而非增量更新 ——
 * 证据全在账本里，任何时候都能从头算一遍，于是「后验算错了」永远可以靠重算修复，
 * 不会因为某次增量写坏而永久带伤。
 */

import {
  buildBaseDictionary,
  computePosterior,
  learnedShift,
  type XiangEvidence,
  type XiangPosterior,
  type XiangYi,
} from '@hidefate/core-xiangyi';
import { toXiangEvidence, type PredictionRecord } from '@hidefate/core-ledger';
import { db, type StoredPosterior } from './db';

const DICTIONARY: readonly XiangYi[] = buildBaseDictionary();
const BY_ID = new Map(DICTIONARY.map((x) => [x.id, x]));

/**
 * 回溯记录的 `baseRate` 一律为 null（我们没有人群基准率），
 * 因此 `isCalibratable()` 会把它们全部排除在校准之外 —— 那是对的。
 * 但**象意收敛**用的是另一套判准：只要已结算且未被化解干预即可。
 * 两者的目的不同：校准问「报得准不准」，收敛问「这个人走哪条道」。
 */
function evidenceFor(records: readonly PredictionRecord[]): Map<string, XiangEvidence[]> {
  const usable = records.filter((r) => r.status === '已结算' && !r.intervened && r.outcome);
  // 借用账本的转换器，但先把 baseRate 补成 0 以通过其校准资格判定 ——
  // 这不影响任何概率计算，只是让「无基准」的回溯也能参与取象收敛。
  return toXiangEvidence(usable.map((r) => ({ ...r, baseRate: r.baseRate ?? 0 })));
}

/** 重算某人的全部后验并写回。 */
export async function recomputePosteriors(personId: string): Promise<StoredPosterior[]> {
  const records = await db().predictions.where('personId').equals(personId).toArray();
  const evidence = evidenceFor(records);
  const now = new Date().toISOString();

  const rows: StoredPosterior[] = [];
  for (const [xiangId, ev] of evidence) {
    const entry = BY_ID.get(xiangId);
    if (!entry) continue; // 字典里已无此条（改过 id）—— 跳过而不是猜
    const p = computePosterior(entry, personId, ev, now);
    rows.push({ ...p, key: `${personId}|${xiangId}` });
  }

  await db().posteriors.where('personId').equals(personId).delete();
  if (rows.length > 0) await db().posteriors.bulkPut(rows);
  return rows;
}

export interface LearnedRow {
  readonly entry: XiangYi;
  readonly posterior: XiangPosterior;
  /** 后验相对先验的位移；成熟度未起步时恒为 0。 */
  readonly shift: number;
}

/** 读出某人的收敛结果，按位移绝对值排序（动得最多的排前面）。 */
export async function loadLearned(personId: string): Promise<LearnedRow[]> {
  const rows = await db().posteriors.where('personId').equals(personId).toArray();
  const out: LearnedRow[] = [];
  for (const r of rows) {
    const entry = BY_ID.get(r.xiangId);
    if (!entry) continue;
    out.push({ entry, posterior: r, shift: learnedShift(entry, r) });
  }
  return out.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift) || b.posterior.weight - a.posterior.weight);
}

export function findXiangYi(id: string): XiangYi | undefined {
  return BY_ID.get(id);
}
