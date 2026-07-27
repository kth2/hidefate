'use client';

/**
 * 大九宫格 —— 手机上的主视觉与主交互。
 *
 * 尺寸取舍：整格宽度 = 屏宽 − 32px 边距，三列后每宫约 110–120px，
 * 远超 48px 的最小触控标准，站在屋里单手也能准确点中。
 * 信息密度按「一眼能读」控制：默认只显示山星、向星、方位与房间，
 * 其余（运星、流年、八宅、奇门）随图层开关出现，不一次性堆满。
 */

import {
  GRID_LAYOUT,
  STAR_NAME,
  YOU_NIAN_META,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import { RISK_COLOR, type PalaceAssessment, type SynthesisResult } from '@hidefate/core-synthesis';

export interface LayerToggles {
  feixing: boolean;
  bazhai: boolean;
  qimen: boolean;
}

/** 星数配色：凶星醒目、吉星沉稳。 */
function starTone(star: PalaceIndex): string {
  if (star === 5) return 'text-risk-crit';
  if (star === 2) return 'text-risk-high';
  if (star === 3 || star === 7) return 'text-risk-warn';
  if (star === 8 || star === 9 || star === 1) return 'text-jade';
  return 'text-ink-soft';
}

export function BigNineGrid({
  result,
  layers,
  onSelect,
}: {
  result: SynthesisResult;
  layers: LayerToggles;
  onSelect: (p: PalaceIndex) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-0.5 text-[0.6875rem] text-ink-mute">
        <span>↑ 上为正北（与罗盘一致）</span>
        <span>点任一宫看详情</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {GRID_LAYOUT.map((p) => (
          <GongCell
            key={p}
            a={result.palaces[p]}
            layers={layers}
            isSitting={result.flyingStar.sitting.mountain.palace === p}
            isFacing={result.flyingStar.facing.mountain.palace === p}
            onSelect={() => onSelect(p)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[0.6875rem] text-ink-mute">
        <span>
          <b className="text-ink-soft">左</b>山星·人丁
        </span>
        <span>
          <b className="text-ink-soft">右</b>向星·财禄
        </span>
        <span className="flex items-center gap-1.5">
          {(['安全', '留意', '警戒', '高危', '紧急'] as const).map((r) => (
            <span key={r} className="flex items-center gap-0.5">
              <i className="inline-block h-2 w-2 rounded-sm" style={{ background: RISK_COLOR[r] }} />
              {r}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function GongCell({
  a,
  layers,
  isSitting,
  isFacing,
  onSelect,
}: {
  a: PalaceAssessment;
  layers: LayerToggles;
  isSitting: boolean;
  isFacing: boolean;
  onSelect: () => void;
}) {
  const isCentre = a.palace === 5;
  const color = RISK_COLOR[a.riskLevel];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${a.direction}，${a.combinationName}，风险${a.riskLevel}${a.rooms.length ? `，${a.rooms.map((r) => r.label ?? r.kind).join('、')}` : ''}`}
      className="gong relative flex flex-col rounded-xl border border-rice-line bg-white p-2 text-left transition active:scale-[0.97] active:border-cinnabar"
      style={{ boxShadow: `inset 0 -4px 0 0 ${color}` }}
    >
      {/* 方位 + 坐向 / 缺角标记 */}
      <div className="flex items-start justify-between">
        <span className="text-[0.75rem] font-medium leading-none text-ink-soft">{a.direction}</span>
        <span className="flex gap-1 text-[0.625rem] leading-none">
          {isSitting && <em className="not-italic font-medium text-cinnabar">坐</em>}
          {isFacing && <em className="not-italic font-medium text-jade">向</em>}
          {a.missing && <em className="not-italic font-medium text-risk-high">缺</em>}
        </span>
      </div>

      {/* 飞星：山星 / 向星 大字，运星小字 */}
      {layers.feixing && (
        <div className="mt-1 flex items-baseline justify-center gap-1">
          <span className={`font-serif text-[1.75rem] font-bold leading-none ${starTone(a.stars.shan)}`}>
            {a.stars.shan}
          </span>
          <span className="text-[0.6875rem] leading-none text-ink-mute">{a.stars.yun}</span>
          <span className={`font-serif text-[1.75rem] font-bold leading-none ${starTone(a.stars.xiang)}`}>
            {a.stars.xiang}
          </span>
        </div>
      )}

      {/* 流年 */}
      {layers.feixing && (
        <div className="mt-1 text-center text-[0.625rem] leading-none text-ink-mute">
          年<span className={`ml-0.5 font-medium ${starTone(a.stars.annual)}`}>{STAR_NAME[a.stars.annual]}</span>
        </div>
      )}

      {/* 八宅 */}
      {layers.bazhai && !isCentre && a.baZhaiStar && (
        <div className="mt-1 text-center">
          <span
            className={`tag ${
              YOU_NIAN_META[a.baZhaiStar].auspicious
                ? 'border-jade/40 bg-jade/10 text-jade'
                : 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar'
            }`}
          >
            {a.baZhaiStar}
          </span>
        </div>
      )}

      {/* 奇门 */}
      {layers.qimen && a.qiMen && (
        <div className="mt-1 text-center text-[0.625rem] leading-tight text-ink-mute">
          {a.qiMen.men || '—'}
          <br />
          {a.qiMen.xing}
        </div>
      )}

      {/* 房间 */}
      <div className="mt-auto w-full truncate pt-1 text-center text-[0.6875rem] leading-none">
        {a.rooms.length ? (
          <span className="font-medium text-ink">{a.rooms.map((r) => r.label ?? r.kind).join('·')}</span>
        ) : (
          <span className="text-ink-mute/50">未标注</span>
        )}
      </div>
    </button>
  );
}
