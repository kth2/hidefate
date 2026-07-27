'use client';

/**
 * Before / After 滑动对比。
 *
 * 手机屏放不下两张九宫格并排，硬并排会小到看不清。
 * 这里用一条可拖动的分隔线把「现况」与「方案」叠在同一位置上 ——
 * 手指左右滑动即可在同一块视野里对照同一个宫位的变化，
 * 比上下滚动来回比对省事得多。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';


export function SwipeCompare({
  before,
  after,
  beforeLabel = '现况',
  afterLabel = '方案',
}: {
  before: ReactNode;
  after: ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [pct, setPct] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  /**
   * 容器实际像素宽度。
   *
   * 必须用 state 而不是直接读 ref：上层遮罩宽度是百分比，若内层跟着用 100%，
   * 那 100% 是「相对被裁切后的宽度」，Before 会被压扁而不是被裁切 —— 两边宫位
   * 对不上，滑动对比就完全失去意义。所以要拿到固定的 px 宽度喂给内层。
   */
  const [wrapWidth, setWrapWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWrapWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setFromClientX = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = ((clientX - r.left) / r.width) * 100;
    setPct(Math.max(4, Math.min(96, next)));
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      setFromClientX(e.clientX);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [setFromClientX]);

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative touch-none select-none overflow-hidden rounded-2xl border border-rice-line bg-white"
        onPointerDown={(e) => {
          dragging.current = true;
          setFromClientX(e.clientX);
        }}
      >
        {/* 底层：方案（After） */}
        <div className="p-3">{after}</div>

        {/* 上层：现况（Before），按百分比裁切 */}
        <div
          className="absolute inset-0 overflow-hidden border-r-2 border-cinnabar bg-white"
          style={{ width: `${pct}%` }}
          aria-hidden
        >
          {/* 内层锁定为容器全宽（px），确保是「裁切」而非「压缩」 */}
          <div className="p-3" style={{ width: wrapWidth || undefined }}>
            {before}
          </div>
        </div>

        {/* 标签 */}
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-ink/75 px-2 py-0.5 text-[0.6875rem] text-white">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-cinnabar/85 px-2 py-0.5 text-[0.6875rem] text-white">
          {afterLabel}
        </span>

        {/* 拖动手柄 */}
        <div
          className="pointer-events-none absolute inset-y-0 flex items-center"
          style={{ left: `calc(${pct}% - 1.25rem)` }}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-cinnabar bg-white shadow-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a8352a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l-4 6 4 6M15 6l4 6-4 6" />
            </svg>
          </span>
        </div>
      </div>

      {/* 无障碍 / 无触控时的后备控制 */}
      <label className="mt-2 block">
        <span className="sr-only">对比位置</span>
        <input
          type="range"
          min={4}
          max={96}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-full accent-cinnabar"
          aria-label={`对比滑块，当前显示 ${Math.round(pct)}% 的${beforeLabel}`}
        />
      </label>
      <p className="text-center text-[0.6875rem] text-ink-mute">左右拖动分隔线，对照同一宫位的前后变化</p>
    </div>
  );
}
