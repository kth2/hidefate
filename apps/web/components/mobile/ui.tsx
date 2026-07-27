'use client';

/**
 * 移动端基础组件：顶栏、底部弹层、可展开卡片、分段选择、空状态。
 *
 * 全部只依赖 React + CSS，不引任何 UI 库 —— 体积小、离线可靠，
 * 且日后移植 Expo 时这些交互模式（bottom sheet、accordion、segmented）
 * 在 RN 里都有直接对应物，不会白写。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** 顶栏。标题居中，左返回右操作，高度 52px。 */
export function AppBar({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header
      className="sticky top-0 z-30 border-b border-rice-line bg-rice/95 backdrop-blur"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="mx-auto flex h-[3.25rem] max-w-lg items-center gap-2 px-2">
        <div className="flex w-16 justify-start">
          {back &&
            (typeof back === 'string' ? (
              <Link href={back} className="flex h-11 w-11 items-center justify-center active:opacity-60" aria-label="返回">
                <BackIcon />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-11 w-11 items-center justify-center active:opacity-60"
                aria-label="返回"
              >
                <BackIcon />
              </button>
            ))}
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-serif text-[1.0625rem] font-semibold leading-tight">{title}</p>
          {subtitle && <p className="truncate text-[0.6875rem] leading-tight text-ink-mute">{subtitle}</p>}
        </div>
        <div className="flex w-16 justify-end">{right}</div>
      </div>
    </header>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3d3733" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

/**
 * 底部弹层。用于宫位详情等「看一眼就关」的内容 ——
 * 比跳转新页面更适合单手操作，也不会打断上下文。
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" onClick={onClose} className="absolute inset-0 animate-fade bg-black/35" />
      <div
        className="animate-sheet absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-3xl bg-rice shadow-2xl"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        {/* 抓手：下拉关闭 */}
        <div
          className="flex touch-none justify-center py-3"
          onTouchStart={(e) => {
            startY.current = e.touches[0]!.clientY;
          }}
          onTouchMove={(e) => {
            if (startY.current == null) return;
            setDragY(Math.max(0, e.touches[0]!.clientY - startY.current));
          }}
          onTouchEnd={() => {
            if (dragY > 90) onClose();
            else setDragY(0);
            startY.current = null;
          }}
        >
          <span className="h-1.5 w-11 rounded-full bg-rice-line" />
        </div>
        {title && <div className="border-b border-rice-line px-4 pb-3">{title}</div>}
        <div
          className="max-h-[74vh] overflow-y-auto px-4 py-4"
          style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** 可展开卡片 —— 手机上「先看结论，想深究再展开」。 */
export function Expandable({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="overflow-hidden rounded-2xl border border-rice-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-[3.25rem] w-full items-center gap-2 px-4 py-3 text-left active:bg-rice-deep/40"
      >
        <span className="min-w-0 flex-1 text-[0.9375rem] font-medium leading-snug">{title}</span>
        {badge}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8b817a"
          strokeWidth="2"
          strokeLinecap="round"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={id} className="border-t border-rice-line px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

/** 横向滚动的分段选择器。选项多时不会挤成一团。 */
export function SegRow<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div>
      {label && <p className="label">{label}</p>}
      <div className="seg-row" role="tablist" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={value === o.value}
            className={`seg ${value === o.value ? 'seg-on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 空状态。 */
export function Empty({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card text-center">
      <p className="font-serif text-[1.0625rem] font-semibold">{title}</p>
      {desc && <p className="mx-auto mt-2 max-w-xs text-[0.875rem] leading-relaxed text-ink-mute">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 骨架屏。 */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-rice-deep" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** 数据条（评分可视化）。 */
export function Meter({ value, color, label }: { value: number; color: string; label?: string }) {
  const pct = Math.max(2, Math.min(100, value * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-rice-deep">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {label && <span className="w-12 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-mute">{label}</span>}
    </div>
  );
}
