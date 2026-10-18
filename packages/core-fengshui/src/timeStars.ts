/**
 * 即时紫白 —— 此刻的年、月、日、时四层飞星，以及财星落在哪一方。
 *
 * 用途：择时、临时取方（「此刻往哪个方向去谈生意、摆收银、开工」）。
 * 与宅盘（玄空山向）无关：不需要房子的坐向，只需要「现在几点」与「我面向哪里」。
 *
 * ## 时星起例（本模块新写，依下列原文）
 *
 *   搜狐《李炎宸教风水第三章》所录时家紫白诀：「天一九，地四六，人七三。一四七为阳顺。三六九为阴逆。」
 *   即：冬至后（阳遁），子午卯酉日（天）子时起一白、辰戌丑未日（地）起四绿、寅申巳亥日（人）起七赤，逐时顺行；
 *       夏至后（阴遁），子午卯酉日子时起九紫、辰戌丑未日起六白、寅申巳亥日起三碧，逐时逆行。
 *
 * ## 各家不一、因而做成参数的地方（不设默认正统，结果里照实写出用了哪一种）
 *
 *   1. 子时换日：23 点（子初）换日，还是 0 点换日 —— 决定 23 点那一小时算哪一天的日支。
 *   2. 时辰依据：钟表时间，还是真太阳时（需经度）。吉隆坡钟表比真太阳时快约 70 分钟，
 *      足以差一个时辰，故两者不同时一并报出。
 *   3. 阴阳遁交接：本模块以冬至、夏至的**交节时刻**为界；lunar-typescript 以交节**当日**为界。
 *      只在冬至、夏至当天有差别。
 *
 * 年星、月星、日星沿用 period.ts 既有实现，不在此重写。
 */

import { Solar } from 'lunar-typescript';
import { FLY_FORWARD, PALACE_DIRECTION, STAR_NAME, type PalaceIndex } from './constants.js';
import {
  BEIJING_OFFSET_HOURS,
  annualStar,
  dailyStar,
  fengShuiYearOf,
  monthlyStar,
  periodOfYear,
  solarMonthIndexOf,
} from './period.js';

export const SHI_CHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
export type ShiChen = (typeof SHI_CHEN)[number];

export type DayChangeRule = '23点换日' | '0点换日';
export type HourBasis = '钟表时间' | '真太阳时';

export interface TimeChartOptions {
  /** 当地时区（小时，东为正）；缺省取设备时区。 */
  readonly utcOffsetHours?: number;
  readonly hourBasis?: HourBasis;
  /** 真太阳时所需经度（东经为正）。缺此值时即便选了真太阳时也退回钟表时间，并照实说明。 */
  readonly longitude?: number;
  readonly dayChange?: DayChangeRule;
}

export interface ShiChenInfo {
  readonly zhi: ShiChen;
  readonly index: number;
  /** 本时辰起讫（绝对时刻）。 */
  readonly start: Date;
  readonly end: Date;
  /** 用以判时辰的「当地墙钟」时刻（已含真太阳时校正时）。 */
  readonly wall: { y: number; m: number; d: number; h: number; mi: number };
  readonly basisUsed: HourBasis;
  /** 真太阳时相对钟表的校正（分钟）；未校正为 0。 */
  readonly solarDeltaMinutes: number;
}

export interface LayerStars {
  readonly star: PalaceIndex;
  readonly plate: Record<PalaceIndex, PalaceIndex>;
}

export type WealthRole = '当旺' | '生气' | '退气';

export interface WealthSpot {
  readonly star: PalaceIndex;
  readonly role: WealthRole;
  readonly palace: PalaceIndex;
  readonly direction: string;
  /** 宫位中心方位角；中宫为 null。 */
  readonly bearing: number | null;
}

export interface TimeChart {
  readonly at: Date;
  readonly shiChen: ShiChenInfo;
  readonly dayZhi: string;
  readonly yang: boolean;
  readonly year: LayerStars & { readonly fengShuiYear: number };
  readonly month: LayerStars & { readonly monthIndex: number };
  readonly day: LayerStars;
  readonly hour: LayerStars;
  /** 当前元运。 */
  readonly period: PalaceIndex;
  /** 时盘上的财星：当旺（元运星）、生气（下一运星）、退气（上一运星）。 */
  readonly wealth: readonly WealthSpot[];
  /** 本次用了哪些取法、哪里各家不一 —— 必须显示给使用者。 */
  readonly notes: readonly string[];
}

const BEARING: Record<PalaceIndex, number | null> = { 1: 0, 8: 45, 3: 90, 4: 135, 9: 180, 2: 225, 7: 270, 6: 315, 5: null };

/** 某星入中顺飞（紫白年、月、日、时盘一律顺飞）。 */
export function plateOf(center: PalaceIndex): Record<PalaceIndex, PalaceIndex> {
  const out = {} as Record<PalaceIndex, PalaceIndex>;
  let p: PalaceIndex = 5;
  let s: PalaceIndex = center;
  for (let i = 0; i < 9; i++) {
    out[p] = s;
    p = FLY_FORWARD[p];
    s = (s === 9 ? 1 : s + 1) as PalaceIndex;
  }
  return out;
}

export function palaceOfStar(plate: Record<PalaceIndex, PalaceIndex>, star: PalaceIndex): PalaceIndex {
  return (Object.keys(plate).map(Number) as PalaceIndex[]).find((p) => plate[p] === star)!;
}

/** 均时差（分钟），与 core-bazi 的 trueSolarAdjust 同一近似式。 */
function equationOfTime(wallY: number, wallM: number, wallD: number): number {
  const dayOfYear = Math.round((Date.UTC(wallY, wallM - 1, wallD) - Date.UTC(wallY, 0, 1)) / 86_400_000) + 1;
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

function wallOf(instantMs: number, offsetHours: number) {
  const d = new Date(instantMs + offsetHours * 3600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

/** 此刻的时辰。 */
export function shiChenOf(at: Date, opts: TimeChartOptions = {}): ShiChenInfo {
  const offset = opts.utcOffsetHours ?? -at.getTimezoneOffset() / 60;
  const wantSolar = opts.hourBasis === '真太阳时' && opts.longitude != null;
  let delta = 0;
  if (wantSolar) {
    const w0 = wallOf(at.getTime(), offset);
    delta = (opts.longitude! - offset * 15) * 4 + equationOfTime(w0.y, w0.m, w0.d);
  }
  const shifted = at.getTime() + delta * 60_000;
  const wall = wallOf(shifted, offset);
  const index = Math.floor(((wall.h + 1) % 24) / 2);
  // 时辰起点（墙钟）：子时 23:00 起，其余 奇数点起
  const startHourWall = (index * 2 + 23) % 24;
  const dayBack = index === 0 && wall.h === 23 ? 0 : index === 0 ? 1 : 0;
  const startWallMs = Date.UTC(wall.y, wall.m - 1, wall.d - dayBack, startHourWall, 0, 0);
  // 墙钟 → 绝对时刻：减去时区，再减去真太阳时校正
  const startMs = startWallMs - offset * 3600_000 - delta * 60_000;
  return {
    zhi: SHI_CHEN[index]!,
    index,
    start: new Date(startMs),
    end: new Date(startMs + 2 * 3600_000),
    wall,
    basisUsed: wantSolar ? '真太阳时' : '钟表时间',
    solarDeltaMinutes: delta,
  };
}

/** 冬至或夏至的绝对时刻（lunar-typescript 给的是北京时间墙钟）。 */
function solsticeInstant(year: number, name: '冬至' | '夏至'): number {
  for (const probe of [year, year - 1, year + 1]) {
    const v = Solar.fromYmdHms(probe, 6, 15, 12, 0, 0).getLunar().getJieQiTable()[name];
    if (v && v.getYear() === year) {
      return Date.UTC(v.getYear(), v.getMonth() - 1, v.getDay(), v.getHour() - BEIJING_OFFSET_HOURS, v.getMinute(), v.getSecond());
    }
  }
  throw new Error(`无法求得 ${year} 年${name}`);
}

/** 阳遁（冬至至夏至）还是阴遁（夏至至冬至）。以交节时刻为界。 */
export function isYangDun(at: Date): boolean {
  const t = at.getTime();
  const y = new Date(t + BEIJING_OFFSET_HOURS * 3600_000).getUTCFullYear();
  const xiaZhi = solsticeInstant(y, '夏至');
  const dongZhi = solsticeInstant(y, '冬至');
  const prevDongZhi = solsticeInstant(y - 1, '冬至');
  if (t >= dongZhi) return true;
  if (t >= xiaZhi) return false;
  return t >= prevDongZhi;
}

/** 日支：按子时换日规则，取墙钟所在之日（或 23 点后的次日）。 */
function dayZhiOf(wall: ShiChenInfo['wall'], rule: DayChangeRule): string {
  const next = rule === '23点换日' && wall.h === 23;
  const base = new Date(Date.UTC(wall.y, wall.m - 1, wall.d + (next ? 1 : 0)));
  const s = Solar.fromYmdHms(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 12, 0, 0);
  return s.getLunar().getDayZhi();
}

const TIAN = '子午卯酉';
const DI = '辰戌丑未';

/** 时星（时家紫白）。 */
export function hourlyStar(at: Date, opts: TimeChartOptions = {}): { star: PalaceIndex; yang: boolean; dayZhi: string; shiChen: ShiChenInfo } {
  const sc = shiChenOf(at, opts);
  const dayZhi = dayZhiOf(sc.wall, opts.dayChange ?? '23点换日');
  const yang = isYangDun(at);
  const group = TIAN.includes(dayZhi) ? 0 : DI.includes(dayZhi) ? 1 : 2;
  const start = yang ? [1, 4, 7][group]! : [9, 6, 3][group]!;
  const raw = yang ? start - 1 + sc.index : start - 1 - sc.index;
  const star = ((((raw % 9) + 9) % 9) + 1) as PalaceIndex;
  return { star, yang, dayZhi, shiChen: sc };
}

/** 此刻的年月日时四层紫白与时盘财星。 */
export function timeChart(at: Date, opts: TimeChartOptions = {}): TimeChart {
  const h = hourlyStar(at, opts);
  const fy = fengShuiYearOf(at);
  const mi = solarMonthIndexOf(at);
  const ys = annualStar(fy);
  const ms = monthlyStar(fy, mi);
  const ds = dailyStar(at).star;
  const period = periodOfYear(fy).period;
  const hourPlate = plateOf(h.star);

  const next = (n: number) => ((n % 9) + 1) as PalaceIndex;
  const prev = (n: number) => (n === 1 ? 9 : n - 1) as PalaceIndex;
  const wealth: WealthSpot[] = (
    [
      [period, '当旺'],
      [next(period), '生气'],
      [prev(period), '退气'],
    ] as const
  ).map(([star, role]) => {
    const palace = palaceOfStar(hourPlate, star);
    return { star, role, palace, direction: PALACE_DIRECTION[palace], bearing: BEARING[palace] };
  });

  const notes: string[] = [
    `时辰依${h.shiChen.basisUsed}` +
      (h.shiChen.basisUsed === '真太阳时' ? `（校正 ${h.shiChen.solarDeltaMinutes >= 0 ? '+' : ''}${h.shiChen.solarDeltaMinutes.toFixed(0)} 分钟）` : '') +
      (opts.hourBasis === '真太阳时' && opts.longitude == null ? '；选了真太阳时但未取得经度，已退回钟表时间' : ''),
    `子时换日：${opts.dayChange ?? '23点换日'}`,
    `${h.yang ? '阳遁（冬至后）' : '阴遁（夏至后）'}，以冬至、夏至交节时刻为界`,
    `财星依当前元运（${STAR_NAME[period]}当旺）取：当旺${STAR_NAME[period]}、生气${STAR_NAME[next(period)]}、退气${STAR_NAME[prev(period)]}；各家对退气星是否仍作财星看法不一`,
    `日星依「冬至雨水及谷雨，阳顺一七四；夏至处暑霜降后，九三六星逆」，各段以交节后首个甲子日起`,
  ];

  return {
    at,
    shiChen: h.shiChen,
    dayZhi: h.dayZhi,
    yang: h.yang,
    year: { star: ys, plate: plateOf(ys), fengShuiYear: fy },
    month: { star: ms, plate: plateOf(ms), monthIndex: mi },
    day: { star: ds, plate: plateOf(ds) },
    hour: { star: h.star, plate: hourPlate },
    period,
    wealth,
    notes,
  };
}
