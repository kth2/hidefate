'use client';

/** 房间管理 —— 建档之后随时增删改，不必重建房屋。 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { floorLevelsOf, type RoomPlacement } from '@hidefate/core-fengshui';
import { AppBar, Empty, Skeleton } from '../../components/mobile/ui';
import { RoomEditor } from '../../components/mobile/RoomEditor';
import { FloorplanGrid } from '../../components/mobile/FloorplanGrid';
import { useProperty } from '../../lib/PropertyContext';
import { db, newId } from '../../lib/db';
import { EMPTY_LAYOUT, type FloorplanLayout } from '../../lib/floorplan';

type Mode = '列表' | '户型图';

export default function RoomsPage() {
  const { property, loading, reload } = useProperty();
  const [rooms, setRooms] = useState<RoomPlacement[] | null>(null);
  const [image, setImage] = useState<string | undefined>(undefined);
  const [layout, setLayout] = useState<FloorplanLayout>(EMPTY_LAYOUT);
  const [mode, setMode] = useState<Mode>('列表');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!property) return;
    setRooms([...property.rooms]);
    setImage(property.floorplanDataUrl);
    setLayout(property.floorplanLayout ?? EMPTY_LAYOUT);
    setMode(property.floorplanDataUrl ? '户型图' : '列表');
  }, [property?.id]);

  async function save() {
    if (!property || !rooms) return;
    setSaving(true);
    await db().properties.update(property.id, {
      rooms,
      floorplanDataUrl: image,
      floorplanLayout: layout,
      updatedAt: new Date().toISOString(),
    });
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

  const dirty =
    JSON.stringify(rooms) !== JSON.stringify(property.rooms) ||
    image !== property.floorplanDataUrl ||
    JSON.stringify(layout) !== JSON.stringify(property.floorplanLayout ?? EMPTY_LAYOUT);
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

        <div className="seg-row">
          {(['列表', '户型图'] as Mode[]).map((m) => (
            <button key={m} type="button" className={`seg ${mode === m ? 'seg-on' : ''}`} onClick={() => setMode(m)}>
              {m === '户型图' ? '在户型图上标' : '按列表标'}
            </button>
          ))}
        </div>

        {mode === '列表' && (
          <RoomEditor profile={property} rooms={rooms} onChange={setRooms} newId={newId} />
        )}

        {mode === '户型图' && (
          <div className="space-y-3">
            {image ? (
              <>
                <FloorplanGrid
                  image={image}
                  layout={layout}
                  rooms={rooms}
                  onLayoutChange={setLayout}
                  onRoomsChange={setRooms}
                  newId={newId}
                />
                <button type="button" className="btn btn-sm" onClick={() => setImage(undefined)}>
                  换一张户型图
                </button>
              </>
            ) : (
              <div className="card">
                <p className="card-sub mb-3">
                  拍下或选一张户型图，再把九宫格拖到房子上对齐，逐格指派房间。
                  没有识别、没有猜测 —— 格子在哪由你说了算，因此对错你一眼就能看出来。
                  图片只存在本机，不会上传。
                </p>
                <label className="btn btn-primary btn-block cursor-pointer">
                  打开相机拍摄
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => setImage(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
                <label className="btn btn-block mt-2 cursor-pointer">
                  从相册选择
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => setImage(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        )}

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
