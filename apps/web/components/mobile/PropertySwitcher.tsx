'use client';

/**
 * 全局「当前房屋」下拉 —— 挂在顶栏里，每个 tab 都在。
 *
 * 之前切换房屋要绕到「我的」里去点，而分析、模拟、成员这几屏又全都依赖
 * 「当前是哪一处」。有两处以上房产的人（这类工具的典型用户）几乎每次都要
 * 来回跳。把它提到顶栏，切换成本从「三次点击 + 一次跳转」降到「两次点击」，
 * 且切完还留在原来那一屏。
 *
 * 只有一处房屋时也显示 —— 它同时承担「你现在看的是哪一处」这个说明作用，
 * 否则用户在深层页面里很容易忘了自己在看哪间房。
 */

import Link from 'next/link';
import { useState } from 'react';
import { useProperty } from '../../lib/PropertyContext';
import { Sheet } from './ui';

export function PropertySwitcher() {
  const { properties, property, activeId, setActive } = useProperty();
  const [open, setOpen] = useState(false);

  // 一处都没有时不占位置 —— 该显示的是建房引导，那由各页自己给
  if (properties.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-1.5 border-t border-rice-line/70 px-4 text-left active:bg-rice-deep/40"
      >
        <HouseIcon />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
          {property?.name ?? '尚未选定房屋'}
        </span>
        {properties.length > 1 && (
          <span className="shrink-0 text-[0.6875rem] text-ink-mute">共 {properties.length} 处</span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8b817a"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={<span className="font-serif text-[1.0625rem] font-semibold">切换当前房屋</span>}
      >
        <div className="space-y-2">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActive(p.id);
                setOpen(false);
              }}
              className={`w-full rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                p.id === activeId ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-serif text-[1rem] font-semibold">{p.name}</span>
                {p.id === activeId && (
                  <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">当前</span>
                )}
              </div>
              <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                {p.buildingType}
                {p.floor != null && ` · ${p.floor} 楼`} · {p.entryMode}建档 · {p.rooms.length} 个房间
              </p>
            </button>
          ))}

          <Link href="/new" className="btn btn-block mt-2" onClick={() => setOpen(false)}>
            建立新房屋
          </Link>
          <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
            切换后当前这一屏会直接换成新选中那处的推算结果，不必重新导航。
          </p>
        </div>
      </Sheet>
    </>
  );
}

function HouseIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#a8352a"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}
