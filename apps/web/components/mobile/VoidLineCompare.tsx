'use client';

/**
 * 空亡线上的两张盘并排对照（第零期 B · X-5 / F1）。
 *
 * 立线落空亡时，下卦与替卦何者可用，诸家说法不一，App 不替人选：
 *   - 两盘并排，标出星数不同的宫位
 *   - 「用这张分析」由用户或风水师择定；未择定时照实说「暂用哪一张」
 *   - 两盘相同（替星恰等于运星）时只显示一张，说明无须择盘
 */

import {
  GRID_LAYOUT,
  PALACE_DIRECTION,
  type FlyingStarChart,
  type PalaceIndex,
  type VoidLineChoice,
  type VoidLineComparison,
} from '@hidefate/core-fengshui';

function starTone(star: PalaceIndex): string {
  if (star === 5) return 'text-risk-crit';
  if (star === 2) return 'text-risk-high';
  if (star === 3 || star === 7) return 'text-risk-warn';
  if (star === 8 || star === 9 || star === 1) return 'text-jade';
  return 'text-ink-soft';
}

function MiniChart({
  chart,
  title,
  differing,
  inUse,
  onChoose,
  busy,
}: {
  chart: FlyingStarChart;
  title: VoidLineChoice;
  differing: ReadonlySet<PalaceIndex>;
  inUse: boolean;
  onChoose?: () => void;
  busy?: boolean;
}) {
  const sit = chart.sitting.mountain.palace;
  const fac = chart.facing.mountain.palace;
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-2 ${inUse ? 'border-cinnabar bg-cinnabar/[0.04]' : 'border-rice-line bg-white'}`}>
      <div className="flex items-baseline justify-between gap-1 px-0.5">
        <p className="font-serif text-[0.9375rem] font-semibold">{title}盘</p>
        <p className="truncate text-[0.6875rem] text-ink-mute">{chart.pattern}</p>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-0.5" role="img" aria-label={`${title}盘九宫`}>
        {GRID_LAYOUT.map((p) => {
          const s = chart.palaces[p];
          const diff = differing.has(p);
          return (
            <div
              key={p}
              className={`relative rounded-md px-0.5 py-1 text-center ${diff ? 'bg-risk-warn/10 ring-1 ring-inset ring-risk-warn/40' : 'bg-rice-deep/30'}`}
            >
              <p className="text-[0.5625rem] leading-none text-ink-mute">
                {PALACE_DIRECTION[p].replace('正', '')}
                {p === sit ? '·坐' : p === fac ? '·向' : ''}
              </p>
              <p className="mt-0.5 font-serif text-[1rem] font-semibold leading-tight tabular-nums">
                <span className={starTone(s.shan)}>{s.shan}</span>
                <span className="mx-0.5 text-[0.625rem] font-normal text-ink-mute">{s.yun}</span>
                <span className={starTone(s.xiang)}>{s.xiang}</span>
              </p>
            </div>
          );
        })}
      </div>
      {onChoose ? (
        <button
          type="button"
          className={`btn btn-sm mt-2 w-full ${inUse ? 'btn-primary' : ''}`}
          onClick={onChoose}
          disabled={busy}
          aria-pressed={inUse}
        >
          {inUse ? '● 正用此盘' : '用这张分析'}
        </button>
      ) : (
        <p className={`mt-1.5 text-center text-[0.6875rem] ${inUse ? 'font-semibold text-cinnabar' : 'text-ink-mute'}`}>
          {inUse ? '本报告所用' : '对照'}
        </p>
      )}
    </div>
  );
}

export function VoidLineCompare({
  cmp,
  onChoose,
  onClear,
  busy,
}: {
  cmp: VoidLineComparison;
  /** 不给即只读（报告页）。 */
  onChoose?: (c: VoidLineChoice) => void;
  /** 改回未择定。 */
  onClear?: () => void;
  busy?: boolean;
}) {
  const allDiffer = cmp.differingPalaces.length === 9;
  // 九宫全不同时不逐格加框（满版都是框反而看不出重点），改为一句话说明
  const differing = new Set(allDiffer ? [] : cmp.differingPalaces);
  return (
    <section className="space-y-2.5 rounded-2xl border border-cinnabar/40 bg-cinnabar/[0.03] p-3">
      <div>
        <p className="text-[0.9375rem] font-semibold">
          {cmp.grade} · {cmp.identical ? '两盘相同' : '下卦、替卦并排'}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{cmp.label}</p>
      </div>

      {cmp.identical ? (
        <p className="text-[0.8125rem] leading-relaxed text-ink-soft">
          此线的替星恰与运星相同，下卦盘与替卦盘星数一样，无须择盘。空亡本身仍须留意，见下方立线说明。
        </p>
      ) : (
        <>
          <p className="text-[0.8125rem] leading-relaxed text-ink-soft">
            空亡线上该用下卦还是替卦，诸家说法不一，本 App 不替你选。请先以罗盘复核读数，或由风水师择一。
            {allDiffer ? (
              '两盘九宫星数全部不同。'
            ) : (
              <>
                两盘星数不同的宫位以<span className="mx-0.5 rounded bg-risk-warn/10 px-1 ring-1 ring-inset ring-risk-warn/40">框</span>
                标出（共 {cmp.differingPalaces.length} 宫）。
              </>
            )}
          </p>
          <p
            className={`rounded-lg px-2.5 py-1.5 text-[0.8125rem] ${
              cmp.decided ? 'bg-jade/10 text-jade' : 'bg-risk-warn/10 text-ink'
            }`}
            role="status"
          >
            {cmp.decided
              ? `已择定：全部分析用${cmp.current}盘。`
              : `未择定：目前暂以${cmp.current}盘推算（按兼向阈值判定），结论只作初步参考。`}
            {cmp.decided && onClear && (
              <button type="button" className="ml-2 text-[0.75rem] text-ink-mute underline underline-offset-2" onClick={onClear} disabled={busy}>
                改回未择定
              </button>
            )}
          </p>
          <div className="flex gap-2">
            {(['下卦', '替卦'] as const).map((c) => (
              <MiniChart
                key={c}
                chart={c === '下卦' ? cmp.xiaGua : cmp.tiGua}
                title={c}
                differing={differing}
                inUse={cmp.current === c}
                onChoose={onChoose ? () => onChoose(c) : undefined}
                busy={busy}
              />
            ))}
          </div>
          <p className="text-[0.6875rem] leading-relaxed text-ink-mute">
            每宫三数：左山星、中运星、右向星。上为正北。择定只影响这一处房屋，改了度数离开空亡线后自动失效。
          </p>
        </>
      )}
    </section>
  );
}
