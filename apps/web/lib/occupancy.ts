'use client';

/**
 * 谁住哪间 —— 把风水的吉凶落到具体的人身上。
 *
 * 单一事实来源是房间上的 `occupants`：预测、矩阵、融合报告都从这里读。
 * 不另存一份「成员的常用房间」，两处各写一份迟早对不上，而对不上的那一处不会有人发现。
 */

import { db, newId, type StoredMember, type StoredProperty } from './db';

/** 此人现在被指定使用的房间 id。 */
export function roomsOf(property: Pick<StoredProperty, 'rooms'>, memberId: string): string[] {
  return property.rooms.filter((r) => r.occupants?.includes(memberId)).map((r) => r.id);
}

/** 把此人的房间设为 `roomIds`（其余房间撤下此人），其他住户不动。 */
export async function saveOccupancy(propertyId: string, memberId: string, roomIds: readonly string[]): Promise<void> {
  const d = db();
  await d.transaction('rw', d.properties, async () => {
    const p = await d.properties.get(propertyId);
    if (!p) return;
    const want = new Set(roomIds);
    const rooms = p.rooms.map((r) => {
      const has = r.occupants?.includes(memberId) ?? false;
      if (want.has(r.id) === has) return r;
      const rest = (r.occupants ?? []).filter((id) => id !== memberId);
      return { ...r, occupants: want.has(r.id) ? [...rest, memberId] : rest };
    });
    await d.properties.put({ ...p, rooms, updatedAt: new Date().toISOString() });
  });
}

/**
 * 此人还没有任何居住史时，按房屋的入住年自动补一段「至今住在这里」。
 *
 * 成员本来就是建在这处房屋下的 —— 让用户再去「一生」页手动关联一遍，
 * 结果就是一生轨迹里风水层全程缺席，而用户根本不知道为什么。
 * 已有居住史的不动：那是用户自己填的，比我们猜的准。
 */
export async function ensureResidence(member: Pick<StoredMember, 'id' | 'year'>, property: StoredProperty): Promise<boolean> {
  const d = db();
  const existing = await d.residences.where('personId').equals(member.id).count();
  if (existing > 0) return false;
  await d.residences.put({
    id: newId('res'),
    personId: member.id,
    propertyId: property.id,
    fromYear: Math.max(property.moveInYear, member.year),
    toYear: null,
    role: '居家',
    fidelity: property.entryMode === '罗盘实测' ? '罗盘实测' : '大致朝向',
  });
  return true;
}
