/**
 * 纵向宅运时间轴 —— 把房子当成一个会随年份变化的活系统。
 *
 * 默认自入住年起 10–15 年，可延长。每一年重算流年层，
 * 并把「已施化解」的减险效果带进未来年份的推算。
 */

import {
  PALACE_DIRECTION,
  STAR_NAME,
  annualStar,
  periodOfYear,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import { synthesise } from './assess.js';
import { predict } from './predict.js';
import type {
  AnalysisInput,
  AppliedCure,
  Prediction,
  RiskLevel,
  SynthesisResult,
} from './types.js';

export interface TimelineYear {
  readonly year: number;
  readonly age: number;
  /** 该年元运（跨运年份会变）。 */
  readonly period: PalaceIndex;
  readonly periodLabel: string;
  /** 是否为换运年 —— 换运会大幅改盘，需重点提示。 */
  readonly isPeriodChange: boolean;
  readonly annualStar: PalaceIndex;
  readonly annualStarName: string;
  readonly overallScore: number;
  readonly overallRisk: RiskLevel;
  /** 该年最凶三宫。 */
  readonly hotspots: readonly { palace: PalaceIndex; direction: string; risk: RiskLevel; reason: string }[];
  /** 每位成员的该年风险强度 0–1。 */
  readonly memberRisk: Readonly<Record<string, number>>;
  readonly topPredictions: readonly Prediction[];
  /** 该年已生效的化解数量。 */
  readonly activeCureCount: number;
}

export interface Timeline {
  readonly startYear: number;
  readonly endYear: number;
  readonly moveInYear: number;
  readonly years: readonly TimelineYear[];
  /** 全期最凶年份。 */
  readonly worstYears: readonly number[];
  /** 全期最吉年份。 */
  readonly bestYears: readonly number[];
  /** 换运年份。 */
  readonly periodChangeYears: readonly number[];
  readonly summary: string;
}

export interface TimelineOptions {
  readonly startYear?: number;
  /** 年数，默认 12。 */
  readonly span?: number;
  /** 化解记录（含施用年份，只在其之后的年份生效）。 */
  readonly appliedCures?: readonly AppliedCure[];
}

/**
 * 化解的生效年份：优先取显式的 effectiveFromYear，否则从 appliedOn 解析年份；
 * 两者都不可用时按 fallback（当年）处理，宁可提前生效也不静默丢弃记录。
 */
function effectiveYearOf(cure: AppliedCure, fallback: number): number {
  if (cure.effectiveFromYear != null) return cure.effectiveFromYear;
  const parsed = Number.parseInt(String(cure.appliedOn).slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 生成多年时间轴。 */
export function buildTimeline(
  input: Omit<AnalysisInput, 'year'>,
  opts: TimelineOptions = {},
): Timeline {
  const moveIn = input.profile.moveInYear;
  const start = opts.startYear ?? Math.max(moveIn, new Date().getFullYear());
  const span = opts.span ?? 12;
  const cures = opts.appliedCures ?? input.appliedCures ?? [];

  const years: TimelineYear[] = [];
  let prevPeriod: PalaceIndex | null = null;

  for (let i = 0; i < span; i++) {
    const year = start + i;
    // 只有在该年之前（含）施用的化解才对该年生效
    const active = cures.filter((c) => effectiveYearOf(c, year) <= year);
    const yearInput: AnalysisInput = { ...input, year, appliedCures: active };
    const s = synthesise(yearInput);
    const preds = predict(yearInput, s);

    const period = s.flyingStar.period.period;
    const yearPeriod = periodOfYear(year);
    const isChange = prevPeriod != null && yearPeriod.period !== periodOfYear(year - 1).period;
    prevPeriod = period;

    const hotspots = ([1, 2, 3, 4, 6, 7, 8, 9] as PalaceIndex[])
      .map((p) => s.palaces[p])
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((a) => ({
        palace: a.palace,
        direction: a.direction,
        risk: a.riskLevel,
        reason: `${a.combinationName}，流年${STAR_NAME[a.stars.annual]}临${a.baZhaiStar ? `，宅之${a.baZhaiStar}方` : ''}`,
      }));

    const memberRisk: Record<string, number> = {};
    for (const m of input.members) {
      const mine = preds.filter((p) => p.memberIds.includes(m.id));
      memberRisk[m.id] = mine.length ? Math.max(...mine.map((p) => p.probability)) : 0.05;
    }

    years.push({
      year,
      age: year - moveIn,
      period,
      periodLabel: yearPeriod.label,
      isPeriodChange: isChange,
      annualStar: annualStar(year),
      annualStarName: STAR_NAME[annualStar(year)],
      overallScore: s.overallScore,
      overallRisk: s.overallRisk,
      hotspots,
      memberRisk,
      topPredictions: preds.slice(0, 5),
      activeCureCount: active.length,
    });
  }

  const sorted = [...years].sort((a, b) => a.overallScore - b.overallScore);
  const worstYears = sorted.slice(0, 3).map((y) => y.year).sort((a, b) => a - b);
  const bestYears = sorted.slice(-3).map((y) => y.year).sort((a, b) => a - b);
  const periodChangeYears = years.filter((y) => y.isPeriodChange).map((y) => y.year);

  return {
    startYear: start,
    endYear: start + span - 1,
    moveInYear: moveIn,
    years,
    worstYears,
    bestYears,
    periodChangeYears,
    summary:
      `${start}–${start + span - 1} 年共 ${span} 年：` +
      `最须留意 ${worstYears.join('、')} 年；最可借力 ${bestYears.join('、')} 年。` +
      (periodChangeYears.length
        ? `其中 ${periodChangeYears.join('、')} 年逢换运，全盘旺衰重排，届时须重新评估并调整布局。`
        : '此期间不逢换运，盘局基调稳定，逐年差异主要来自流年星。'),
  };
}

/** 两年对比 —— 生成「年度宅运报告」的核心数据。 */
export interface YearComparison {
  readonly previous: TimelineYear;
  readonly current: TimelineYear;
  readonly scoreDelta: number;
  readonly direction: '↑ 改善' | '↓ 转差' | '→ 持平';
  /** 变好的宫位。 */
  readonly improved: readonly { palace: PalaceIndex; direction: string; note: string }[];
  /** 变差的宫位。 */
  readonly worsened: readonly { palace: PalaceIndex; direction: string; note: string }[];
  readonly narrative: string;
}

export function compareYears(
  input: Omit<AnalysisInput, 'year'>,
  previousYear: number,
  currentYear: number,
  appliedCures?: readonly AppliedCure[],
): YearComparison {
  const mk = (y: number) => {
    const i: AnalysisInput = { ...input, year: y, appliedCures };
    const s = synthesise(i);
    return { s, preds: predict(i, s) };
  };
  const a = mk(previousYear);
  const b = mk(currentYear);

  const improved: { palace: PalaceIndex; direction: string; note: string }[] = [];
  const worsened: { palace: PalaceIndex; direction: string; note: string }[] = [];
  for (const p of [1, 2, 3, 4, 6, 7, 8, 9] as PalaceIndex[]) {
    const d = b.s.palaces[p].score - a.s.palaces[p].score;
    const note =
      `流年星由${STAR_NAME[a.s.palaces[p].stars.annual]}换为${STAR_NAME[b.s.palaces[p].stars.annual]}，` +
      `评级 ${a.s.palaces[p].riskLevel} → ${b.s.palaces[p].riskLevel}`;
    if (d > 0.08) improved.push({ palace: p, direction: PALACE_DIRECTION[p], note });
    else if (d < -0.08) worsened.push({ palace: p, direction: PALACE_DIRECTION[p], note });
  }
  improved.sort((x, y) => (b.s.palaces[y.palace].score - a.s.palaces[y.palace].score) - (b.s.palaces[x.palace].score - a.s.palaces[x.palace].score));
  worsened.sort((x, y) => (b.s.palaces[x.palace].score - a.s.palaces[x.palace].score) - (b.s.palaces[y.palace].score - a.s.palaces[y.palace].score));

  const delta = b.s.overallScore - a.s.overallScore;
  const dir: YearComparison['direction'] = delta > 0.06 ? '↑ 改善' : delta < -0.06 ? '↓ 转差' : '→ 持平';

  const toYear = (t: { s: SynthesisResult; preds: Prediction[] }, y: number): TimelineYear => ({
    year: y,
    age: y - input.profile.moveInYear,
    period: t.s.flyingStar.period.period,
    periodLabel: t.s.flyingStar.period.label,
    isPeriodChange: false,
    annualStar: annualStar(y),
    annualStarName: STAR_NAME[annualStar(y)],
    overallScore: t.s.overallScore,
    overallRisk: t.s.overallRisk,
    hotspots: [],
    memberRisk: {},
    topPredictions: t.preds.slice(0, 5),
    activeCureCount: appliedCures?.length ?? 0,
  });

  return {
    previous: toYear(a, previousYear),
    current: toYear(b, currentYear),
    scoreDelta: delta,
    direction: dir,
    improved: improved.slice(0, 3),
    worsened: worsened.slice(0, 3),
    narrative:
      `${previousYear} 年流年${STAR_NAME[annualStar(previousYear)]}入中，${currentYear} 年转为${STAR_NAME[annualStar(currentYear)]}入中，` +
      `全屋评分 ${a.s.overallScore.toFixed(2)} → ${b.s.overallScore.toFixed(2)}（${dir}）。` +
      (worsened.length ? `今年转差最明显：${worsened.slice(0, 3).map((w) => w.direction).join('、')}。` : '今年无明显转差之方。') +
      (improved.length ? `明显改善：${improved.slice(0, 3).map((w) => w.direction).join('、')}。` : ''),
  };
}
