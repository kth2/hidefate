'use client';

/**
 * 坐向输入 —— 建档与修改共用。
 *
 * 两个要点：
 *   1. **坐山与向首是一线两端，不可分立。**《天玉经》「一线定坐向」。
 *      故这里只有一条线，用户想量哪一端就填哪一端 ——
 *      实务上多数人拿罗盘量的是大门朝向（向首），逼人换算成坐山是自找错误。
 *   2. 立向线的品级（下卦 / 兼向 / 空亡）必须当场反馈。
 *      落空亡线者，纵有旺星亦不聚气，用户须在建档时就知道，而不是事后被埋怨。
 */

import { useMemo, useState } from 'react';
import { CompassReader, EightDirectionPicker } from './CompassAssist';
import { directionCosts } from '../../lib/confidence';
import { nearestEightDirection } from '../../lib/compass';
import {
  MOUNTAINS,
  analyzeLine,
  buildHouseBaZhai,
  degreeToMountain,
  facingOf,
  norm360,
  periodOfYear,
  type LineGrade,
} from '@hidefate/core-fengshui';

const GRADE_TONE: Record<LineGrade, string> = {
  下卦: 'border-jade/40 bg-jade/[0.06] text-jade',
  兼向: 'border-gold/50 bg-gold/[0.07] text-gold',
  小空亡: 'border-risk-warn/50 bg-risk-warn/[0.07] text-risk-warn',
  大空亡: 'border-risk-crit/50 bg-risk-crit/[0.07] text-risk-crit',
};

export type MeasureEnd = '坐山' | '向首';

/**
 * 坐向的取得方式。
 *
 * 手打度数曾是唯一的路，这对「手上没有罗盘」的绝大多数人并不友好。
 * 现在三条并列，各自的置信度代价明码标在按钮上，由用户自己权衡。
 */
export type DirectionInput = '度数' | '二十四山' | '八方';

export function DirectionPicker({
  end,
  onEndChange,
  degree,
  onDegreeChange,
  useDegree,
  onUseDegreeChange,
  mountainName,
  onMountainChange,
  moveInYear,
}: {
  /** 用户量的是哪一端。 */
  end: MeasureEnd;
  onEndChange: (e: MeasureEnd) => void;
  degree: number;
  onDegreeChange: (d: number) => void;
  useDegree: boolean;
  onUseDegreeChange: (v: boolean) => void;
  mountainName: string;
  onMountainChange: (n: string) => void;
  moveInYear: number;
}) {
  const costs = useMemo(() => directionCosts(), []);
  const [inputMode, setInputMode] = useState<DirectionInput>(useDegree ? '度数' : '二十四山');
  // 八方近似选中的那一方；由当前山名反推，好让「改回来」时选中态不丢
  const [eightId, setEightId] = useState<string | null>(null);

  /** 无论用户量哪一端，一律换算成坐山，因为整套理气以坐山起。 */
  const sittingInput: string | number = useMemo(() => {
    if (useDegree) return end === '坐山' ? degree : norm360(degree + 180);
    return end === '坐山' ? mountainName : facingOf(mountainName).mountain.name;
  }, [end, degree, useDegree, mountainName]);

  const preview = useMemo(() => {
    try {
      const line = analyzeLine(sittingInput);
      const fac = facingOf(sittingInput);
      return { line, facing: fac.mountain, bz: buildHouseBaZhai(sittingInput) };
    } catch {
      return null;
    }
  }, [sittingInput]);

  return (
    <div className="space-y-4">
      {/* 量的是哪一端 */}
      <div>
        <p className="label">你用罗盘量的是哪一端？</p>
        <div className="flex gap-2">
          {(['向首', '坐山'] as MeasureEnd[]).map((e) => (
            <button key={e} type="button" className={`btn flex-1 ${end === e ? 'btn-primary' : ''}`} onClick={() => onEndChange(e)}>
              {e === '向首' ? '向首（大门朝向）' : '坐山（屋背朝向）'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">
          坐山与向首是同一条线的两端，相差 180°。填其一，另一端自动取冲 ——
          多数人量的是大门朝外的方向，选「向首」即可。
        </p>
      </div>

      {/* 三条路并列，各自的置信度代价直接标在按钮上 */}
      <div>
        <p className="label">怎么确定这条线？</p>
        <div className="grid gap-1.5">
          {(
            [
              ['度数', '有度数（罗盘 / 手机 / 已知资料）', 'compass'],
              ['二十四山', '只知是哪一山（子、午、艮…）', 'eight-way'],
              ['八方', '只知大概朝哪边（东南、正北…）', 'eight-way'],
            ] as const
          ).map(([mode, desc, costKey]) => {
            const cost = costs.find((c) => c.method === costKey)!;
            const free = mode === '度数';
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setInputMode(mode);
                  // 从度数切到八方时，预选离当前度数最近的那一方，免得选择被清空
                  if (mode === '八方' && eightId == null) setEightId(nearestEightDirection(degree).id);
                }}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                  inputMode === mode ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium leading-snug">{desc}</span>
                  <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-ink-mute">
                    {free ? '置信度无损失 —— 有度数才判得出兼向与空亡。' : cost.note}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-lg border px-2 py-0.5 text-[0.75rem] tabular-nums ${
                    free ? 'border-jade/45 bg-jade/[0.08] text-jade' : 'border-risk-warn/45 bg-risk-warn/[0.07] text-risk-warn'
                  }`}
                >
                  {free ? '±0' : `−${Math.round(cost.lostPercent * 100)}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {inputMode === '八方' && (
        <EightDirectionPicker
          value={eightId}
          label={`${end}朝哪个方向？`}
          onPick={(d) => {
            setEightId(d.id);
            onUseDegreeChange(false);
            onMountainChange(d.mountain);
          }}
        />
      )}

      {inputMode === '度数' && <CompassReader onUse={(deg) => { onUseDegreeChange(true); onDegreeChange(Number(deg.toFixed(1))); }} />}

      {inputMode === '度数' && (
        <div className="card">
          <label className="label">{end}方位角（正北 0°，顺时针）</label>
          <p className="my-2 text-center font-serif text-4xl font-bold tabular-nums text-cinnabar">
            {degree.toFixed(1)}°
          </p>
          <p className="mb-2 text-center text-[0.8125rem] text-ink-mute">
            {degreeToMountain(degree).name} 山
          </p>
          <input
            type="range"
            min={0}
            max={359.5}
            step={0.5}
            value={degree}
            onChange={(e) => onDegreeChange(Number(e.target.value))}
            className="h-8 w-full accent-cinnabar"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => onDegreeChange(norm360(degree - 0.5))}>
              −0.5°
            </button>
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              className="field flex-1 text-center"
              value={degree}
              onChange={(e) => onDegreeChange(Number(e.target.value))}
            />
            <button type="button" className="btn btn-sm" onClick={() => onDegreeChange(norm360(degree + 0.5))}>
              +0.5°
            </button>
          </div>
        </div>
      )}

      {inputMode === '二十四山' && (
        <div className="grid grid-cols-6 gap-1.5">
          {MOUNTAINS.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => onMountainChange(m.name)}
              className={`min-h-[3rem] rounded-xl border font-serif text-[1.0625rem] transition active:scale-[0.97] ${
                mountainName === m.name ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {inputMode === '八方' && preview && (
        <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
          八方近似取该卦正中一山（{preview.line.mountain.name}）代表整卦。
          往后若量到确切度数，可在「房屋设置」里随时改回 —— 置信度会跟着补上来。
        </p>
      )}

      {/* 立向线品级反馈 */}
      {preview && (
        <>
          <div className={`rounded-2xl border p-3.5 ${GRADE_TONE[preview.line.grade]}`}>
            <p className="font-serif text-[1.0625rem] font-semibold">
              {preview.line.grade}
              {preview.line.grade === '大空亡' && ' · 出卦'}
            </p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-ink">{preview.line.label}</p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{preview.line.advice}</p>
          </div>

          <div className="card">
            <p className="font-serif text-[1.0625rem]">
              坐 <b className="text-cinnabar">{preview.line.mountain.name}</b> 向{' '}
              <b className="text-jade">{preview.facing.name}</b>
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">
              八宅：{preview.bz.label} · {periodOfYear(moveInYear).label}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** 把「量的那一端 + 度数/山名」换算成坐山，供保存时使用。 */
export function toSitting(
  end: MeasureEnd,
  useDegree: boolean,
  degree: number,
  mountainName: string,
): string | number {
  if (useDegree) return end === '坐山' ? degree : norm360(degree + 180);
  return end === '坐山' ? mountainName : facingOf(mountainName).mountain.name;
}
