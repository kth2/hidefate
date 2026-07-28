'use client';

/**
 * 房间编辑器 —— 建档向导与「房间管理」共用。
 *
 * 手机端取舍：房间种类有 40+，若像桌面版那样「每种一行 × 九宫按钮」，
 * 会变成几百个按钮的长表，单手根本用不了。
 * 改成「已标注列表 + 添加流程（分类 → 种类 → 楼层 → 方位）」，
 * 每一步都是一屏之内的大按钮，站在屋里也点得准。
 */

import { useState } from 'react';
import {
  GRID_LAYOUT,
  PALACE_DIRECTION,
  ROOM_CATEGORIES,
  ROOM_META,
  floorLevelsOf,
  roomKindsByCategory,
  type PalaceIndex,
  type PropertyProfile,
  type RoomCategory,
  type RoomKind,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import { Sheet } from './ui';

const NATURE_TONE: Record<string, string> = {
  宜吉: 'border-jade/40 bg-jade/10 text-jade',
  宜凶: 'border-gold/40 bg-gold/10 text-gold',
  中性: 'border-rice-line text-ink-mute',
};

export function RoomEditor({
  profile,
  rooms,
  onChange,
  newId,
}: {
  /** 用于取楼层清单；房间本身由 rooms 传入以便受控。 */
  profile: Pick<PropertyProfile, 'buildingType' | 'storeys' | 'hasBasement'>;
  rooms: readonly RoomPlacement[];
  onChange: (rooms: RoomPlacement[]) => void;
  newId: (prefix: string) => string;
}) {
  const floors = floorLevelsOf(profile as PropertyProfile);
  const multi = floors.length > 1;

  const [activeFloor, setActiveFloor] = useState<number>(floors[0]?.level ?? 1);
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<'分类' | '种类' | '方位'>('分类');
  const [category, setCategory] = useState<RoomCategory>('气口');
  const [kind, setKind] = useState<RoomKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onThisFloor = rooms.filter((r) => (r.floorLevel ?? 1) === activeFloor);

  function openAdd() {
    setEditingId(null);
    setKind(null);
    setStep('分类');
    setAdding(true);
  }

  function place(palace: PalaceIndex) {
    if (!kind) return;
    if (editingId) {
      onChange(
        rooms.map((r) =>
          r.id === editingId ? { ...r, kind, primaryPalace: palace, palaces: [palace], floorLevel: activeFloor } : r,
        ),
      );
    } else {
      onChange([
        ...rooms,
        {
          id: newId('r'),
          kind,
          primaryPalace: palace,
          palaces: [palace],
          occupants: [],
          floorLevel: activeFloor,
        },
      ]);
    }
    setAdding(false);
  }

  function remove(id: string) {
    onChange(rooms.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      {/* 楼层切换 */}
      {multi && (
        <div className="seg-row">
          {floors.map((f) => {
            const count = rooms.filter((r) => (r.floorLevel ?? 1) === f.level).length;
            return (
              <button
                key={f.level}
                type="button"
                className={`seg ${activeFloor === f.level ? 'seg-on' : ''}`}
                onClick={() => setActiveFloor(f.level)}
              >
                {f.label}
                {count > 0 && <span className="ml-1 text-[0.6875rem] opacity-75">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 已标注 */}
      {onThisFloor.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rice-line p-4 text-center text-[0.875rem] text-ink-mute">
          {multi ? `${floors.find((f) => f.level === activeFloor)?.label}还没有标注房间。` : '还没有标注房间。'}
          <br />
          至少标出<b className="text-ink-soft">大门</b>，分析才有着力点。
        </p>
      ) : (
        <ul className="space-y-2">
          {onThisFloor.map((r) => {
            const meta = ROOM_META[r.kind];
            return (
              <li key={r.id} className="flex items-center gap-2 rounded-xl border border-rice-line bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[0.9375rem]">
                    <b>{r.label ?? r.kind}</b>
                    <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">
                      {PALACE_DIRECTION[r.primaryPalace]}
                    </span>
                    <span className={`tag ${NATURE_TONE[meta.nature]}`}>{meta.nature}</span>
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-mute">{meta.note}</p>
                </div>
                <button
                  type="button"
                  className="min-h-[2.5rem] shrink-0 px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                  onClick={() => {
                    setEditingId(r.id);
                    setKind(r.kind);
                    setCategory(meta.category);
                    setStep('方位');
                    setAdding(true);
                  }}
                >
                  改
                </button>
                <button
                  type="button"
                  className="min-h-[2.5rem] shrink-0 px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                  onClick={() => remove(r.id)}
                >
                  删
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="btn btn-primary btn-block" onClick={openAdd}>
        + 添加房间
      </button>

      {/* 添加流程 */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={
          <div className="flex items-center gap-2">
            <span className="font-serif text-[1.0625rem] font-semibold">
              {editingId ? '修改房间' : '添加房间'}
            </span>
            {multi && (
              <span className="tag border-rice-line text-ink-mute">
                {floors.find((f) => f.level === activeFloor)?.label}
              </span>
            )}
            {kind && <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{kind}</span>}
          </div>
        }
      >
        {step === '分类' && (
          <div className="space-y-2">
            <p className="label">这是哪一类空间？</p>
            {ROOM_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="w-full rounded-xl border border-rice-line bg-white p-3.5 text-left active:scale-[0.99]"
                onClick={() => {
                  setCategory(c);
                  setStep('种类');
                }}
              >
                <p className="font-serif text-[1rem] font-semibold">{c}</p>
                <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                  {roomKindsByCategory(c).slice(0, 6).join('、')}
                  {roomKindsByCategory(c).length > 6 ? '…' : ''}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === '种类' && (
          <div className="space-y-3">
            <button type="button" className="btn btn-sm" onClick={() => setStep('分类')}>
              ← 换个分类
            </button>
            <div className="grid grid-cols-2 gap-2">
              {roomKindsByCategory(category).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`min-h-[3.25rem] rounded-xl border px-2 text-left transition active:scale-[0.98] ${
                    kind === k ? 'border-cinnabar bg-cinnabar/[0.07]' : 'border-rice-line bg-white'
                  }`}
                  onClick={() => {
                    setKind(k);
                    setStep('方位');
                  }}
                >
                  <span className="block text-[0.9375rem] font-medium">{k}</span>
                  <span className={`tag mt-0.5 ${NATURE_TONE[ROOM_META[k].nature]}`}>{ROOM_META[k].nature}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === '方位' && kind && (
          <div className="space-y-3">
            <button type="button" className="btn btn-sm" onClick={() => setStep('种类')}>
              ← 换个种类
            </button>
            <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
              <b>{kind}</b>：{ROOM_META[kind].note}
            </p>
            <p className="label">在哪一方？（上为正北）</p>
            <div className="grid grid-cols-3 gap-1.5">
              {GRID_LAYOUT.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => place(p)}
                  className="gong flex items-center justify-center rounded-xl border border-rice-line bg-white text-[0.875rem] font-medium transition active:scale-[0.97] active:border-cinnabar"
                >
                  {PALACE_DIRECTION[p]}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
