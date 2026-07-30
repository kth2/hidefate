'use client';

/**
 * 外部环境（峦头）勾选 —— 建档与修改共用。
 *
 * 「峦头为体，理气为用」。此步可跳过，但跳过的代价必须让用户看见：
 * 峦头权重会降到 15%，判断实际只剩理气一半。这不是催人填表，是如实标注。
 *
 * 手机取舍：吉凶分两组、先勾项目再选方位，避免一屏塞几十个开关。
 */

import { useState } from 'react';
import {
  AUSPICIOUS_FEATURES,
  GRID_LAYOUT,
  PALACE_DIRECTION,
  SHA_FEATURES,
  XING_SHI_META,
  scoreXingShi,
  type PalaceIndex,
  type XingShiFeature,
  type XingShiItem,
} from '@hidefate/core-fengshui';
import { Sheet } from './ui';

export function XingShiPicker({
  items,
  onChange,
}: {
  items: readonly XingShiItem[];
  onChange: (items: XingShiItem[]) => void;
}) {
  const [picking, setPicking] = useState<XingShiFeature | null>(null);
  const score = scoreXingShi(items);

  const has = (f: XingShiFeature) => items.some((i) => i.feature === f);
  const itemOf = (f: XingShiFeature) => items.find((i) => i.feature === f);

  function toggle(f: XingShiFeature) {
    const meta = XING_SHI_META[f];
    if (has(f)) {
      onChange(items.filter((i) => i.feature !== f));
      return;
    }
    if (meta.scope === '全局') {
      onChange([...items, { feature: f }]);
    } else {
      setPicking(f); // 方位项须先选方位
    }
  }

  function place(p: PalaceIndex) {
    if (!picking) return;
    onChange([...items.filter((i) => i.feature !== picking), { feature: picking, palace: p }]);
    setPicking(null);
  }

  return (
    <div className="space-y-4">
      {/* 当前得分 */}
      <div
        className={`rounded-2xl border p-3.5 ${
          !score.assessed
            ? 'border-rice-line bg-rice-deep/40'
            : score.score >= 0
              ? 'border-jade/40 bg-jade/[0.06]'
              : 'border-cinnabar/40 bg-cinnabar/[0.06]'
        }`}
      >
        <p className="font-serif text-[1.0625rem] font-semibold">
          峦头分 {score.assessed ? `${score.score >= 0 ? '+' : ''}${score.score.toFixed(2)}` : '未评估'}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{score.summary}</p>
      </div>

      {/* 吉象 */}
      <div>
        <p className="label text-jade">吉象（有则勾选）</p>
        <div className="space-y-1.5">
          {AUSPICIOUS_FEATURES.map((f) => (
            <FeatureRow key={f} feature={f} on={has(f)} item={itemOf(f)} onToggle={() => toggle(f)} />
          ))}
        </div>
      </div>

      {/* 形煞 */}
      <div>
        <p className="label text-cinnabar">形煞（有则勾选，愈准愈好）</p>
        <div className="space-y-1.5">
          {SHA_FEATURES.map((f) => (
            <FeatureRow key={f} feature={f} on={has(f)} item={itemOf(f)} onToggle={() => toggle(f)} />
          ))}
        </div>
      </div>

      <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
        <b>可以跳过</b>，但跳过的话峦头权重只算 15%，判断实际上只剩理气一半 ——
        「峦头为体，理气为用；峦头差，理气无用」。
        哪怕只勾三五项最明显的（有没有靠山、门前有没有路冲、前面开不开阔），准确度也会明显不同。
      </p>

      {/* 方位选择 */}
      <Sheet
        open={picking != null}
        onClose={() => setPicking(null)}
        title={
          picking && (
            <div>
              <p className="font-serif text-[1.0625rem] font-semibold">{picking}在哪一方？</p>
              <p className="mt-0.5 text-[0.75rem] text-ink-mute">{XING_SHI_META[picking].note}</p>
            </div>
          )
        }
      >
        {picking && (
          <div className="space-y-3">
            <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
              {XING_SHI_META[picking].classical}
            </p>
            <p className="label">方位（上为正北）</p>
            <div className="grid grid-cols-3 gap-1.5">
              {GRID_LAYOUT.filter((p) => p !== 5).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => place(p)}
                  className="gong flex items-center justify-center rounded-xl border border-rice-line bg-white text-[0.875rem] font-medium active:scale-[0.97] active:border-cinnabar"
                >
                  {PALACE_DIRECTION[p]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onChange([...items.filter((i) => i.feature !== picking), { feature: picking, palace: null }]);
                  setPicking(null);
                }}
                className="gong col-start-2 flex items-center justify-center rounded-xl border border-dashed border-rice-line text-[0.8125rem] text-ink-mute"
              >
                说不准
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function FeatureRow({
  feature,
  on,
  item,
  onToggle,
}: {
  feature: XingShiFeature;
  on: boolean;
  item: XingShiItem | undefined;
  onToggle: () => void;
}) {
  const meta = XING_SHI_META[feature];
  const good = meta.kind === '吉';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
        on
          ? good
            ? 'border-jade bg-jade/[0.07]'
            : 'border-cinnabar bg-cinnabar/[0.07]'
          : 'border-rice-line bg-white'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[0.6875rem] ${
          on ? (good ? 'border-jade bg-jade text-white' : 'border-cinnabar bg-cinnabar text-white') : 'border-rice-line'
        }`}
      >
        {on ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <b className="text-[0.9375rem]">{feature}</b>
          <span className="tag border-rice-line text-ink-mute">
            {meta.weight >= 0 ? '+' : ''}
            {meta.weight.toFixed(2)}
          </span>
          {on && item?.palace != null && (
            <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">
              {PALACE_DIRECTION[item.palace]}
            </span>
          )}
          {on && item && item.palace === null && meta.scope === '方位' && (
            <span className="tag border-rice-line text-ink-mute">未定方位</span>
          )}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-mute">{meta.note}</span>
      </span>
    </button>
  );
}
