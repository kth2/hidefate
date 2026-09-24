'use client';

/**
 * 连带删除。
 *
 * 此前删房屋只清了房屋、成员、化解三张表，删成员只清成员一张 ——
 * 居住史、模拟方案、预测账本、平安记录、象意后验全都成了孤儿：
 * 界面上看不见，导出备份时却原样带出去，而且没人能再删掉它们。
 *
 * 删除前先用 `*Impact()` 数一遍会连带清掉什么，让确认框说得出具体数字。
 *
 * 占局记录不在此列：它挂在「self」名下、不属于任何成员，也不属于任何房屋。
 */

import { db } from './db';

export interface DeletionImpact {
  readonly members: number;
  readonly cures: number;
  readonly scenarios: number;
  readonly residences: number;
  readonly predictions: number;
  readonly quiets: number;
}

const tables = () => {
  const d = db();
  return [d.properties, d.members, d.cures, d.scenarios, d.residences, d.predictions, d.quiets, d.posteriors];
};

/** 一组人名下的个人资料（居住史、账本、平安记录、后验）。 */
async function personRows(personIds: readonly string[]) {
  const d = db();
  if (personIds.length === 0) return { residences: [], predictions: [], quiets: [] };
  const ids = [...personIds];
  const [residences, predictions, quiets] = await Promise.all([
    d.residences.where('personId').anyOf(ids).primaryKeys(),
    d.predictions.where('personId').anyOf(ids).primaryKeys(),
    d.quiets.where('personId').anyOf(ids).primaryKeys(),
  ]);
  return { residences, predictions, quiets };
}

/** 删除一处房屋会连带清掉什么。 */
export async function propertyDeletionImpact(propertyId: string): Promise<DeletionImpact> {
  const d = db();
  const memberIds = await d.members.where('propertyId').equals(propertyId).primaryKeys();
  const [cures, scenarios, residencesHere, own] = await Promise.all([
    d.cures.where('propertyId').equals(propertyId).count(),
    d.scenarios.where('propertyId').equals(propertyId).count(),
    d.residences.where('propertyId').equals(propertyId).primaryKeys(),
    personRows(memberIds),
  ]);
  return {
    members: memberIds.length,
    cures,
    scenarios,
    // 本屋成员的居住史 ∪ 任何人「住过这处」的居住史
    residences: new Set([...residencesHere, ...own.residences]).size,
    predictions: own.predictions.length,
    quiets: own.quiets.length,
  };
}

/** 删除一处房屋，连同其成员与成员名下的全部个人资料。 */
export async function deleteProperty(propertyId: string): Promise<void> {
  const d = db();
  await d.transaction('rw', tables(), async () => {
    const memberIds = await d.members.where('propertyId').equals(propertyId).primaryKeys();
    await purgePeople(memberIds);
    await d.residences.where('propertyId').equals(propertyId).delete();
    await d.cures.where('propertyId').equals(propertyId).delete();
    await d.scenarios.where('propertyId').equals(propertyId).delete();
    await d.properties.delete(propertyId);
  });
}

/** 删除一位成员会连带清掉什么。 */
export async function memberDeletionImpact(memberId: string): Promise<DeletionImpact> {
  const own = await personRows([memberId]);
  return {
    members: 1,
    cures: 0,
    scenarios: 0,
    residences: own.residences.length,
    predictions: own.predictions.length,
    quiets: own.quiets.length,
  };
}

/** 删除一位成员，连同其居住史、账本、平安记录与后验，并把他从房间使用者里撤下。 */
export async function deleteMember(memberId: string): Promise<void> {
  const d = db();
  await d.transaction('rw', tables(), async () => {
    const m = await d.members.get(memberId);
    await purgePeople([memberId]);
    if (!m) return;
    const p = await d.properties.get(m.propertyId);
    if (p && p.rooms.some((r) => r.occupants?.includes(memberId))) {
      await d.properties.put({
        ...p,
        rooms: p.rooms.map((r) =>
          r.occupants?.includes(memberId) ? { ...r, occupants: r.occupants.filter((id) => id !== memberId) } : r,
        ),
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

/** 须在调用方的事务内执行。 */
async function purgePeople(personIds: readonly string[]): Promise<void> {
  if (personIds.length === 0) return;
  const d = db();
  const ids = [...personIds];
  await d.residences.where('personId').anyOf(ids).delete();
  await d.predictions.where('personId').anyOf(ids).delete();
  await d.quiets.where('personId').anyOf(ids).delete();
  await d.posteriors.where('personId').anyOf(ids).delete();
  await d.members.bulkDelete(ids);
}

/** 把连带项写成一句人话，给确认框用；没有连带项时返回空串。 */
export function describeImpact(i: DeletionImpact, opts: { includeMembers: boolean }): string {
  const parts: string[] = [];
  if (opts.includeMembers && i.members) parts.push(`${i.members} 位成员`);
  if (i.cures) parts.push(`${i.cures} 条化解记录`);
  if (i.scenarios) parts.push(`${i.scenarios} 个模拟方案`);
  if (i.residences) parts.push(`${i.residences} 段居住史`);
  if (i.predictions) parts.push(`${i.predictions} 条预测账本`);
  if (i.quiets) parts.push(`${i.quiets} 条平安记录`);
  return parts.join('、');
}
