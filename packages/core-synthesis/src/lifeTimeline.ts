/**
 * 人视角的一生时间轴。
 *
 * 与 `timeline.ts` 的宅视角 `Timeline` 是两个东西，都要保留：
 *   - `Timeline`      宅视角，答「这房子这些年怎么样」
 *   - `LifeTimeline`  人视角，答「这个人这一生怎么走」
 *
 * 人视角的关键差别：风水层不是一间固定的房子，而是**按居住段拼接**起来的一串环境。
 * 某一年这个人住哪，那一年的风水层就取哪一段；没记录的年份明说风水层置零，
 * 不用最近一段去顶替。
 *
 * 本模块只做**装配与标注**，不产生断语、不算概率 ——
 * 概率是 predict.ts 的事，取象是 core-xiangyi 的事。
 */

import { liuNianGanZhi, liuNianShiShen, type BaziChartResult } from '@hidefate/core-bazi';
import {
  STAR_NAME,
  annualStar,
  periodOfYear,
  type PalaceIndex,
  type PropertyProfile,
} from '@hidefate/core-fengshui';
import { detectBreakpoints, type Breakpoint } from './breakpoints.js';
import {
  residenceAt,
  resolveResidence,
  type ResidencePeriod,
  type ResolvedResidence,
} from './residence.js';

export interface LifeTimelineInput {
  readonly personId: string;
  /** 本人八字；缺日柱时大运为空数组，时间轴照样成立，只是命层信息少。 */
  readonly chart: BaziChartResult;
  readonly fromYear: number;
  readonly toYear: number;
  readonly residences?: readonly ResidencePeriod[];
  /** propertyId → 房产档案。 */
  readonly properties?: ReadonlyMap<string, PropertyProfile>;
  /** 紫微大限交界年，可选；由调用方从 core-ziwei 取得。 */
  readonly daXianBoundaryYears?: readonly number[];
  /** 化解生效年。 */
  readonly cureYears?: readonly number[];
}

export interface LifeYearMing {
  /** 该年所属大运的干支；无日柱或该年在起运前则为 null。 */
  readonly decadeGanZhi: string | null;
  readonly decadeShiShen: string | null;
  readonly decadeRange: readonly [number, number] | null;
  readonly liuNianGanZhi: string;
  /** 该年流年天干对日主的十神；无日主时为 null。 */
  readonly liuNianShiShen: string | null;
}

export interface LifeYearFengShui {
  /** 该年生效的居住段（可能同时有居家与办公两处）。 */
  readonly residences: readonly ResolvedResidence[];
  readonly period: PalaceIndex;
  readonly periodLabel: string;
  readonly annualStar: PalaceIndex;
  readonly annualStarName: string;
  /**
   * 该年的风水层能否作为学习证据。
   * 无居住记录、或全部居住段皆为低保真时为 false。
   */
  readonly evidenceUsable: boolean;
  /** 学习降权系数，取该年各段的最大值；不可用时为 0。 */
  readonly weight: number;
  readonly note: string;
}

export interface LifeYear {
  readonly year: number;
  /** 虚岁。 */
  readonly age: number;
  readonly ming: LifeYearMing;
  readonly fengShui: LifeYearFengShui;
  readonly breakpoints: readonly Breakpoint[];
}

export interface LifeTimelineCoverage {
  readonly totalYears: number;
  /** 风水层可作证据的年数。 */
  readonly usableYears: number;
  /** 完全无居住记录的年数。 */
  readonly uncoveredYears: number;
  /** 有记录但保真度不足的年数。 */
  readonly lowFidelityYears: number;
  /**
   * 给用户看的一句实话。覆盖率低时不粉饰 ——
   * 让人知道「补上老宅资料能换来什么」，比默默降级有用得多。
   */
  readonly summary: string;
}

export interface LifeTimeline {
  readonly personId: string;
  readonly fromYear: number;
  readonly toYear: number;
  readonly years: readonly LifeYear[];
  readonly breakpoints: readonly Breakpoint[];
  readonly coverage: LifeTimelineCoverage;
}

const PERIOD_LABEL = ['', '一运', '二运', '三运', '四运', '五运', '六运', '七运', '八运', '九运'];

function buildMing(chart: BaziChartResult, year: number): LifeYearMing {
  const decade = chart.decades.find((d) => year >= d.startYear && year <= d.endYear) ?? null;
  return {
    decadeGanZhi: decade?.ganZhi ?? null,
    decadeShiShen: decade?.ganShiShen ?? null,
    decadeRange: decade ? ([decade.startYear, decade.endYear] as const) : null,
    liuNianGanZhi: liuNianGanZhi(year),
    liuNianShiShen: liuNianShiShen(chart, year),
  };
}

function buildFengShui(
  input: LifeTimelineInput,
  year: number,
): LifeYearFengShui {
  const properties = input.properties ?? new Map<string, PropertyProfile>();
  const segments = residenceAt(input.residences ?? [], input.personId, year).map((p) =>
    resolveResidence(p, properties),
  );
  const period = periodOfYear(year);
  const star = annualStar(year);

  const learnable = segments.filter((s) => s.capability.learnable);
  const weight = learnable.length === 0 ? 0 : Math.max(...learnable.map((s) => s.capability.weight));

  let note: string;
  if (segments.length === 0) {
    note = `${year} 年无居住记录，风水层置零 —— 该年不参与任何风水相关的推算与学习。`;
  } else if (learnable.length === 0) {
    note =
      `${year} 年有居住记录但保真度不足（${segments
        .map((s) => s.period.fidelity)
        .join('、')}），只能算元运与流年紫白，不作断点证据。`;
  } else {
    note = `${year} 年风水层由 ${learnable.length} 段居住记录支撑，降权系数 ${weight}。`;
  }

  return {
    residences: segments,
    period: period.period,
    periodLabel: PERIOD_LABEL[period.period] ?? `${period.period}运`,
    annualStar: star,
    annualStarName: STAR_NAME[star],
    evidenceUsable: learnable.length > 0,
    weight,
    note,
  };
}

/**
 * 装配一个人的一生时间轴。
 *
 * @throws 起止年颠倒、跨度超过 150 年
 */
export function buildLifeTimeline(input: LifeTimelineInput): LifeTimeline {
  const { fromYear, toYear } = input;
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    throw new Error('时间轴起止年须为整数。');
  }
  if (toYear < fromYear) throw new Error(`时间轴起止颠倒：${fromYear} → ${toYear}。`);
  if (toYear - fromYear > 150) {
    throw new Error(`时间轴跨度 ${toYear - fromYear} 年过长，请分段查看。`);
  }

  const breakpoints = detectBreakpoints({
    personId: input.personId,
    fromYear,
    toYear,
    decades: input.chart.decades,
    ...(input.daXianBoundaryYears ? { daXianBoundaryYears: input.daXianBoundaryYears } : {}),
    ...(input.residences ? { residences: input.residences } : {}),
    ...(input.cureYears ? { cureYears: input.cureYears } : {}),
  });

  const birthYear = input.chart.input.year;
  const years: LifeYear[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    years.push({
      year: y,
      age: y - birthYear + 1, // 虚岁
      ming: buildMing(input.chart, y),
      fengShui: buildFengShui(input, y),
      breakpoints: breakpoints.filter((b) => b.year === y),
    });
  }

  const usableYears = years.filter((y) => y.fengShui.evidenceUsable).length;
  const uncoveredYears = years.filter((y) => y.fengShui.residences.length === 0).length;
  const lowFidelityYears = years.length - usableYears - uncoveredYears;

  const pct = years.length === 0 ? 0 : Math.round((usableYears / years.length) * 100);
  const summary =
    uncoveredYears === 0 && lowFidelityYears === 0
      ? `${years.length} 年全部有可用的风水资料。`
      : `${years.length} 年中 ${usableYears} 年（${pct}%）的风水层可作证据；` +
        `${uncoveredYears} 年无居住记录、${lowFidelityYears} 年资料不足。` +
        '补上老宅的大致朝向与入住年，这些年份就能一并参与对轨。';

  return {
    personId: input.personId,
    fromYear,
    toYear,
    years,
    breakpoints,
    coverage: { totalYears: years.length, usableYears, uncoveredYears, lowFidelityYears, summary },
  };
}

/** 取某一年。不在区间内返回 null。 */
export function lifeYearAt(timeline: LifeTimeline, year: number): LifeYear | null {
  return timeline.years.find((y) => y.year === year) ?? null;
}
