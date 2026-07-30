'use client';

/**
 * 户型图 × 九宫格叠层。
 *
 * 交互三件事：拖动、双指缩放、双指旋转。对齐之后点任一格指派房间。
 * 全程直接操作，没有图像识别 —— 用户看得见自己做了什么，也就验得了对错。
 *
 * 宫位标签随旋转实时重算（见 lib/floorplan.ts），指派过的房间在旋转结束时
 * 一并重挂到新的宫位上，绝不让「图上看到的」与「盘上算的」对不上。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PALACE_DIRECTION,
  ROOM_CATEGORIES,
  ROOM_META,
  roomKindsByCategory,
  type RoomKind,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import {
  CELL_INDEXES,
  DEFAULT_GRID,
  angleDelta,
  clampTransform,
  palaceMap,
  palaceOfCell,
  pinchOf,
  rotationConfusing,
  type CellAssignment,
  type CellIndex,
  type FloorplanLayout,
  type GridTransform,
} from '../../lib/floorplan';
import { Sheet } from './ui';

interface Pointer {
  id: number;
  x: number;
  y: number;
}

export function FloorplanGrid({
  image,
  layout,
  rooms,
  onLayoutChange,
  onRoomsChange,
  newId,
}: {
  /** 已存下的户型图（dataURL）。 */
  image: string;
  layout: FloorplanLayout;
  rooms: readonly RoomPlacement[];
  onLayoutChange: (l: FloorplanLayout) => void;
  onRoomsChange: (rooms: RoomPlacement[]) => void;
  newId: (prefix: string) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, Pointer>>(new Map());
  const gestureStart = useRef<{ transform: GridTransform; distance: number; angle: number } | null>(null);
  const dragStart = useRef<{ transform: GridTransform; x: number; y: number; moved: boolean } | null>(null);

  const [picking, setPicking] = useState<CellIndex | null>(null);
  const [category, setCategory] = useState(ROOM_CATEGORIES[0]!);

  const t = layout.transform;
  const palaces = useMemo(() => palaceMap(t.rotation), [t.rotation]);
  const assignedBy = useMemo(() => {
    const m = new Map<CellIndex, RoomPlacement>();
    for (const a of layout.assignments) {
      const r = rooms.find((x) => x.id === a.roomId);
      if (r) m.set(a.cell, r);
    }
    return m;
  }, [layout.assignments, rooms]);

  /** 把 pointer 坐标换成「相对图片宽度」的比例，缩放后仍然对得上。 */
  const toRatio = useCallback((clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.width };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    const list = [...pointers.current.values()];
    if (list.length === 1) {
      const r = toRatio(e.clientX, e.clientY);
      dragStart.current = { transform: t, x: r.x, y: r.y, moved: false };
      gestureStart.current = null;
    } else if (list.length === 2) {
      const p = pinchOf(list[0]!, list[1]!);
      gestureStart.current = { transform: t, distance: p.distance, angle: p.angle };
      dragStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    const list = [...pointers.current.values()];

    if (list.length >= 2 && gestureStart.current) {
      // 双指：距离变化 → 缩放，夹角变化 → 旋转
      const p = pinchOf(list[0]!, list[1]!);
      const g = gestureStart.current;
      if (g.distance > 0) {
        onLayoutChange({
          ...layout,
          transform: clampTransform({
            ...g.transform,
            size: g.transform.size * (p.distance / g.distance),
            rotation: g.transform.rotation + angleDelta(g.angle, p.angle),
          }),
        });
      }
      return;
    }

    if (list.length === 1 && dragStart.current) {
      const r = toRatio(e.clientX, e.clientY);
      const dx = r.x - dragStart.current.x;
      const dy = r.y - dragStart.current.y;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) dragStart.current.moved = true;
      onLayoutChange({
        ...layout,
        transform: clampTransform({
          ...dragStart.current.transform,
          x: dragStart.current.transform.x + dx,
          y: dragStart.current.transform.y + dy,
        }),
      });
    }
  };

  /**
   * 手势结束时把已指派房间重挂到当前旋转对应的宫位。
   *
   * 不这么做的话，用户转完格子，图上标签是新的、盘上算的还是旧的 ——
   * 这种「看到的和算的不一致」是最难被发现、也最伤信任的一种错。
   */
  const remapRooms = useCallback(() => {
    if (layout.assignments.length === 0) return;
    const map = palaceMap(layout.transform.rotation);
    const next = rooms.map((r) => {
      const a = layout.assignments.find((x) => x.roomId === r.id);
      if (!a) return r;
      const p = map[a.cell];
      return p === r.primaryPalace ? r : { ...r, primaryPalace: p, palaces: [p] };
    });
    if (next.some((r, i) => r !== rooms[i])) onRoomsChange(next);
  }, [layout, rooms, onRoomsChange]);

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gestureStart.current = null;
      dragStart.current = null;
      remapRooms();
    }
  };

  function assign(cell: CellIndex, kind: RoomKind) {
    const palace = palaceOfCell(cell, t.rotation);
    const existing = assignedBy.get(cell);
    let nextRooms: RoomPlacement[];
    let nextAssignments: CellAssignment[] = [...layout.assignments];

    if (existing) {
      nextRooms = rooms.map((r) =>
        r.id === existing.id ? { ...r, kind, primaryPalace: palace, palaces: [palace] } : r,
      );
    } else {
      const room: RoomPlacement = {
        id: newId('r'),
        kind,
        primaryPalace: palace,
        palaces: [palace],
        occupants: [],
      };
      nextRooms = [...rooms, room];
      nextAssignments = [...nextAssignments.filter((a) => a.cell !== cell), { cell, roomId: room.id }];
    }
    onRoomsChange(nextRooms);
    onLayoutChange({ ...layout, assignments: nextAssignments });
    setPicking(null);
  }

  function clearCell(cell: CellIndex) {
    const existing = assignedBy.get(cell);
    if (existing) onRoomsChange(rooms.filter((r) => r.id !== existing.id));
    onLayoutChange({ ...layout, assignments: layout.assignments.filter((a) => a.cell !== cell) });
    setPicking(null);
  }

  const gridPx = `${t.size * 100}%`;

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        className="relative touch-none select-none overflow-hidden rounded-xl border border-rice-line bg-rice-deep/30"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="户型图" className="pointer-events-none block w-full" draggable={false} />

        {/* 九宫格叠层 */}
        <div
          className="absolute"
          style={{
            left: `${t.x * 100}%`,
            top: `${t.y * 100}%`,
            width: gridPx,
            aspectRatio: '1 / 1',
            transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
          }}
        >
          <div className="grid h-full w-full grid-cols-3 grid-rows-3">
            {CELL_INDEXES.map((c) => {
              const room = assignedBy.get(c);
              const palace = palaces[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    // 拖动过就不算点击，否则每次拖完都会弹出选择器
                    if (dragStart.current?.moved) return;
                    setPicking(c);
                  }}
                  className={`flex flex-col items-center justify-center border text-center transition ${
                    room
                      ? 'border-cinnabar/70 bg-cinnabar/25'
                      : 'border-cinnabar/45 bg-white/25 hover:bg-white/40'
                  }`}
                  style={{ transform: `rotate(${-t.rotation}deg)` }} // 文字保持正立
                >
                  <span className="text-[0.625rem] font-medium leading-none text-ink">
                    {PALACE_DIRECTION[palace]}
                  </span>
                  {room && (
                    <span className="mt-0.5 line-clamp-1 px-0.5 text-[0.625rem] leading-tight text-cinnabar">
                      {room.label ?? room.kind}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 姿态微调：手指转不准时用滑杆，桌面上也能用 */}
      <div className="card space-y-2">
        <div>
          <label className="label">
            旋转 <span className="tabular-nums">{t.rotation.toFixed(0)}°</span>
          </label>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={t.rotation}
            onChange={(e) =>
              onLayoutChange({
                ...layout,
                transform: clampTransform({ ...t, rotation: Number(e.target.value) }),
              })
            }
            onPointerUp={remapRooms}
            className="h-8 w-full accent-cinnabar"
          />
        </div>
        <div>
          <label className="label">
            大小 <span className="tabular-nums">{Math.round(t.size * 100)}%</span>
          </label>
          <input
            type="range"
            min={15}
            max={200}
            step={1}
            value={Math.round(t.size * 100)}
            onChange={(e) =>
              onLayoutChange({
                ...layout,
                transform: clampTransform({ ...t, size: Number(e.target.value) / 100 }),
              })
            }
            className="h-8 w-full accent-cinnabar"
          />
        </div>
        <button
          type="button"
          className="btn btn-sm btn-block"
          onClick={() => onLayoutChange({ ...layout, transform: DEFAULT_GRID })}
        >
          复位
        </button>
      </div>

      <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
        单指拖动、双指缩放与旋转，把格子对准房子轮廓；点任一格指派房间。
        <b className="text-ink-soft">屏幕上「上」恒为正北</b>，格上的方位标签由当前旋转角实时算出 ——
        与九宫盘用的是同一个换算函数。
      </p>

      {rotationConfusing(t.rotation) && (
        <p className="rounded-xl border border-gold/45 bg-gold/[0.06] p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
          当前旋转已超过半个卦（22.5°），左上角那一格<b>不再是西北</b>了 ——
          这不是显示错误，格上标签就是实际归属。若你本意是「让格子跟着房子转、方位不变」，
          请把旋转调回 0° 附近，改为旋转户型图本身。
        </p>
      )}

      {/* 指派房间 */}
      <Sheet
        open={picking != null}
        onClose={() => setPicking(null)}
        title={
          picking != null && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-[1.0625rem] font-semibold">
                指派房间 · {PALACE_DIRECTION[palaces[picking]]}
              </span>
              {assignedBy.get(picking) && (
                <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">
                  当前：{assignedBy.get(picking)!.kind}
                </span>
              )}
            </div>
          )
        }
      >
        {picking != null && (
          <div className="space-y-3">
            <div className="seg-row">
              {ROOM_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`seg ${category === c ? 'seg-on' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {roomKindsByCategory(category).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="min-h-[3.25rem] rounded-xl border border-rice-line bg-white px-2 text-left transition active:scale-[0.98]"
                  onClick={() => assign(picking, k)}
                >
                  <span className="block text-[0.9375rem] font-medium">{k}</span>
                  <span className="block text-[0.6875rem] text-ink-mute">{ROOM_META[k].nature}</span>
                </button>
              ))}
            </div>

            {assignedBy.get(picking) && (
              <button type="button" className="btn btn-block text-cinnabar" onClick={() => clearCell(picking)}>
                清除这一格
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
