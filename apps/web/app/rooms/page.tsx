'use client';

/** 房间管理 —— 建档之后随时增删改，不必重建房屋。 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { floorLevelsOf, type RoomPlacement } from '@hidefate/core-fengshui';
import { AppBar, Empty, Skeleton } from '../../components/mobile/ui';
import { RoomEditor } from '../../components/mobile/RoomEditor';
import { useProperty } from '../../lib/PropertyContext';
import { db, newId } from '../../lib/db';

export default function RoomsPage() {
  const { property, loading, reload } = useProperty();
  const [rooms, setRooms] = useState<RoomPlacement[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (property) setRooms([...property.rooms]);
  }, [property?.id]);

  async function save() {
    if (!property || !rooms) return;
    setSaving(true);
    await db().properties.update(property.id, { rooms, updatedAt: new Date().toISOString() });
    reload();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  if (loading || !rooms) {
    return (
      <>
        <AppBar title="房间管理" back="/me" />
        <div className="px-4 py-4">
          <Skeleton lines={4} />
        </div>
      </>
    );
  }

  if (!property) {
    return (
      <>
        <AppBar title="房间管理" back="/me" />
        <div className="px-4 py-4">
          <Empty
            title="请先建立房屋"
            action={
              <Link href="/new" className="btn btn-primary btn-block">
                建立房屋
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const dirty = JSON.stringify(rooms) !== JSON.stringify(property.rooms);
  const floors = floorLevelsOf(property);

  return (
    <>
      <AppBar
        title="房间管理"
        subtitle={`${property.name} · ${rooms.length} 个房间${floors.length > 1 ? ` · ${floors.length} 层` : ''}`}
        back="/me"
      />

      <div className="space-y-4 px-4 py-4">
        {saved && (
          <p className="rounded-xl border border-jade/30 bg-jade/5 p-3 text-[0.875rem] text-jade">
            已保存，九宫盘与预测已随之更新。
          </p>
        )}

        <RoomEditor profile={property} rooms={rooms} onChange={setRooms} newId={newId} />

        <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
          「宜吉」的房间（大门、主卧、神位…）落在吉方才好；
          「宜凶」的房间（厕所、储藏、楼梯…）<b className="text-ink-soft">反而应该落在凶方</b> ——
          这是古法的「以凶制凶」，把最差的一方压住。房间标好后，
          「房屋 → 布局」会逐条指出穿堂、压吉、中宫受污这类硬伤。
        </p>
      </div>

      {/* 固定保存条 */}
      {dirty && (
        <div
          className="fixed inset-x-0 z-30 border-t border-rice-line bg-rice/95 px-4 py-3 backdrop-blur"
          style={{ bottom: 'calc(3.75rem + var(--safe-bottom))' }}
        >
          <div className="mx-auto max-w-lg">
            <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存修改'}
            </button>
          </div>
        </div>
      )}
      {dirty && <div className="h-20" />}
    </>
  );
}
