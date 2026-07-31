/**
 * 断点检测与自然实验归因。
 *
 * ## 为什么需要这一层
 *
 * 命、运、风水三层在同一年都会说话，事后谁都能认领一次转折。
 * 只有当各层的**断点错开**时，才分得清是谁在起作用：
 *
 *   - 转折卡在**搬家年**而大运没换 → 风水层对这个人这个领域权重高
 *   - 转折卡在**大运／大限交界**而一直住同一处 → 命层权重高
 *   - 两者都没动、只有流年在走 → 运层权重高
 *
 * 搬家因此成了一次准自然实验：环境整段跳变，而命层平滑不变。
 *
 * ## 一条必须守住的排除规则
 *
 * **元运换运（2004、2024…）不得用于归因。** 它对全世界同时发生，没有对照组，
 * 与当年任何世界性事件完全纠缠。把它当证据，等于把 2020 年所有人的变故
 * 都算到风水头上。故这类断点标 `personal: false`，且 `attributeTransition()`
 * 拒绝据此下结论。
 */

import type { DecadeData } from '@hidefate/core-bazi';
import { periodOfYear } from '@hidefate/core-fengshui';
import { moveYears, type ResidencePeriod } from './residence.js';

export type BreakpointKind = '大运交界' | '大限交界' | '搬家' | '施做化解' | '元运换运';

export interface Breakpoint {
  readonly year: number;
  readonly kind: BreakpointKind;
  /**
   * 是否为**这个人独有**的断点。
   * false 者（元运换运）全民同时发生，没有对照组，不可用于归因。
   */
  readonly personal: boolean;
  readonly detail: string;
}

/** 断点归属的层。 */
export type BreakpointLayer = '命层' | '风水层';

export const BREAKPOINT_LAYER: Readonly<Record<BreakpointKind, BreakpointLayer | null>> = {
  大运交界: '命层',
  大限交界: '命层',
  搬家: '风水层',
  施做化解: '风水层',
  元运换运: null, // 全民同时，不归任何层
};

export interface BreakpointInput {
  readonly personId: string;
  readonly fromYear: number;
  readonly toYear: number;
  /** 大运（core-bazi）。 */
  readonly decades?: readonly DecadeData[];
  /**
   * 大限交界年。由调用方从 core-ziwei 取得后传入 ——
   * 本包刻意不依赖紫微，紫微缺时辰时本就可能只有候选盘而无定论。
   */
  readonly daXianBoundaryYears?: readonly number[];
  readonly residences?: readonly ResidencePeriod[];
  /** 化解生效年。 */
  readonly cureYears?: readonly number[];
}

/** 扫出区间内的全部断点，按年份排序。 */
export function detectBreakpoints(input: BreakpointInput): Breakpoint[] {
  const { fromYear, toYear } = input;
  const inRange = (y: number) => y >= fromYear && y <= toYear;
  const out: Breakpoint[] = [];

  for (const d of input.decades ?? []) {
    if (inRange(d.startYear)) {
      out.push({
        year: d.startYear,
        kind: '大运交界',
        personal: true,
        detail: `交${d.ganZhi}运（${d.startAge}–${d.endAge}岁）`,
      });
    }
  }

  for (const y of input.daXianBoundaryYears ?? []) {
    if (inRange(y)) {
      out.push({ year: y, kind: '大限交界', personal: true, detail: '紫微大限交界' });
    }
  }

  for (const y of moveYears(input.residences ?? [], input.personId)) {
    if (inRange(y)) {
      out.push({ year: y, kind: '搬家', personal: true, detail: '居住或办公地点变更' });
    }
  }

  for (const y of input.cureYears ?? []) {
    if (inRange(y)) {
      out.push({ year: y, kind: '施做化解', personal: true, detail: '化解于该年生效' });
    }
  }

  for (let y = fromYear; y <= toYear; y++) {
    const p = periodOfYear(y);
    if (p.startYear === y) {
      out.push({
        year: y,
        kind: '元运换运',
        personal: false,
        detail: `进${p.period}运 —— 全民同时发生，无对照组，不可用于归因`,
      });
    }
  }

  return out.sort((a, b) => a.year - b.year || a.kind.localeCompare(b.kind));
}

export type AttributionVerdict = '命层' | '运层' | '风水层' | '无法分辨';

export interface TransitionAttribution {
  readonly year: number;
  /** 落在容差窗口内的断点。 */
  readonly nearby: readonly Breakpoint[];
  readonly verdict: AttributionVerdict;
  readonly reason: string;
  /**
   * 本次归因能否作为学习对象 B（系统 × 领域可信度）的证据。
   * 混杂与无对照组的情形一律 false。
   */
  readonly usable: boolean;
}

export interface AttributionOptions {
  /** 容差年数：转折未必与断点同年落地，默认 ±1 年。 */
  readonly toleranceYears?: number;
}

/**
 * 给某一年发生的人生转折做层级归因。
 *
 * 这是学习对象 B 的主要证据来源 —— 但只在断点**单一**时才算数。
 * 命层与风水层的断点撞在同一年，就是混杂，不该硬判；
 * 硬判出来的可信度矩阵，比没有还糟。
 */
export function attributeTransition(
  year: number,
  breakpoints: readonly Breakpoint[],
  opts: AttributionOptions = {},
): TransitionAttribution {
  const tol = opts.toleranceYears ?? 1;
  const nearby = breakpoints.filter((b) => Math.abs(b.year - year) <= tol);
  const personal = nearby.filter((b) => b.personal);

  const layers = new Set<BreakpointLayer>();
  for (const b of personal) {
    const layer = BREAKPOINT_LAYER[b.kind];
    if (layer) layers.add(layer);
  }

  if (layers.size > 1) {
    return {
      year, nearby, verdict: '无法分辨', usable: false,
      reason:
        `${year} 年前后同时出现命层与风水层的断点（${personal.map((b) => b.kind).join('、')}），` +
        '两者混杂，无从判断是谁在起作用。此次转折不作为可信度证据。',
    };
  }

  if (layers.size === 1) {
    const [layer] = [...layers];
    const kinds = personal.map((b) => b.kind).join('、');
    return {
      year, nearby, verdict: layer!, usable: true,
      reason:
        layer === '风水层'
          ? `${year} 年前后只有${kinds}，命层平滑未换 —— 环境整段跳变而命层不变，` +
            '是一次干净的准自然实验，可作风水层权重的证据。'
          : `${year} 年前后只有${kinds}，居所未动 —— 可作命层权重的证据。`,
    };
  }

  const hasCommon = nearby.some((b) => !b.personal);
  if (hasCommon) {
    return {
      year, nearby, verdict: '无法分辨', usable: false,
      reason:
        `${year} 年前后只有元运换运这一个断点。换运对全世界同时发生，没有对照组，` +
        '当年的世界性事件与它完全纠缠，不能据此判定任何层的权重。',
    };
  }

  return {
    year, nearby, verdict: '运层', usable: true,
    reason:
      `${year} 年前后命层与风水层都无断点，居所未动、大运未换 —— ` +
      '变化只能来自流年与当下的时机，归运层。',
  };
}

/**
 * 列出区间内可作自然实验的年份（断点单一且属个人）。
 *
 * 供 UI 提示「这几年最值得你回忆一下发生过什么」—— 用户的回忆精力有限，
 * 该花在最有分辨力的年份上，而不是平均摊在四十年里。
 */
export function naturalExperiments(breakpoints: readonly Breakpoint[]): TransitionAttribution[] {
  const years = [...new Set(breakpoints.filter((b) => b.personal).map((b) => b.year))].sort(
    (a, b) => a - b,
  );
  return years
    .map((y) => attributeTransition(y, breakpoints))
    .filter((a) => a.usable && a.verdict !== '运层');
}
