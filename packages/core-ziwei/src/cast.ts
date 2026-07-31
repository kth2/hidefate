/**
 * 紫微斗数排盘 —— iztro 的类型化封装。
 *
 * 与 core-qimen 对待上游引擎的态度一致：**不改动任何安星算法**，
 * 只做输入归一、配置钉死、结果投影与分歧标注。
 *
 * 三条本包自己承担的责任：
 *   1. 配置**每次调用都显式传入**，不依赖 iztro 的全局态（`withOptions` 会写全局，
 *      详见 PINNED_CONFIG 注释）
 *   2. 年界与 core-bazi 对齐到「立春」，并把无法对齐的那一小段窗口**明确报出来**
 *   3. 时辰未知不假设、不降级，改走定盘（十三张候选盘）
 */

import { astro } from 'iztro';
import { liChunOf, trueSolarAdjust, type BirthInput } from '@hidefate/core-bazi';
import { Lunar, Solar } from 'lunar-typescript';
import { detectPatterns } from './patterns.js';
import {
  CONFIDENCE_BY_PRECISION,
  type HoroscopeLayer,
  type Mutagen,
  type ZiWeiCandidateGroup,
  type ZiWeiCandidateSet,
  type ZiWeiChart,
  type ZiWeiHoroscope,
  type ZiWeiPalace,
  type ZiWeiPrecision,
  type ZiWeiStar,
} from './types.js';

/**
 * 钉死的 iztro 配置。
 *
 * - `yearDivide: 'exact'`   —— 立春分年，与 core-bazi 的 `liChunOf` 取向一致
 *                              （iztro 精度到「立春日」，core-bazi 精度到「立春时刻」，
 *                                差异窗口由 liChunCaveat() 报出）
 * - `horoscopeDivide: 'exact'` —— 运限同样立春分界，避免流年层与八字流年错开一整年
 * - `dayDivide: 'forward'`  —— 晚子时进为次日，与 core-bazi 的 `EightChar.setSect(2)` 一致
 * - `ageDivide: 'normal'`   —— 小限以自然年分界
 * - `algorithm: 'default'`  —— 通行版安星法；中州派另作流派选项，不在此改
 *
 * **必须每次调用都传。** iztro 的 `withOptions({config})` 会把配置写进全局单例
 * （实测：调用后 `astro.getConfig().yearDivide` 已被改写），
 * 若依赖全局态，同一进程内的调用顺序会影响结果，破坏确定性重放。
 */
export const PINNED_CONFIG = {
  yearDivide: 'exact',
  horoscopeDivide: 'exact',
  dayDivide: 'forward',
  ageDivide: 'normal',
  algorithm: 'default',
} as const;

/**
 * 闰月修正：以农历十五为界，十五（含）之前算当月，之后算下月。
 * 这是紫微安星对闰月的通行取舍，与八字无关（八字按节气走）。
 */
const FIX_LEAP = true;

/**
 * 时辰索引。0 为早子时（00:00–00:59），1 为丑时，…… 12 为晚子时（23:00–23:59）。
 * 早／晚子时是两张不同的盘：晚子时按 `dayDivide: 'forward'` 进为次日，日柱与紫微星位都会变。
 */
export function timeIndexOf(hour: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`时辰无效：hour=${hour}，须为 0–23 的整数`);
  }
  return Math.floor((hour + 1) / 2);
}

/** 十三个时辰索引，含早子与晚子。 */
export const ALL_TIME_INDEXES: readonly number[] = Array.from({ length: 13 }, (_, i) => i);

/**
 * 由时辰索引取一个代表小时（timeIndexOf 的逆）。
 * 索引 0 → 0 点（早子），索引 i → 2i−1 点，索引 12 → 23 点（晚子）。
 */
export function hourOfTimeIndex(idx: number): number {
  if (!Number.isInteger(idx) || idx < 0 || idx > 12) {
    throw new Error(`时辰索引无效：${idx}，须为 0–12 的整数`);
  }
  if (idx === 0) return 0;
  if (idx === 12) return 23;
  return 2 * idx - 1;
}

/** 判定输入精度。 */
export function ziWeiPrecisionOf(input: BirthInput): ZiWeiPrecision {
  if (input.month == null || input.day == null) return '无法起盘';
  return input.hour == null ? '时辰待定' : '四柱全';
}

interface ResolvedMoment {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly trueSolarTime: string | null;
  readonly caveats: readonly string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * 把输入归一为公历时刻。
 *
 * 农历输入先经 lunar-typescript 转公历（与 core-bazi 走同一条转换），
 * 之后一律以公历喂给 iztro —— 单一路径，也让立春比对有确切时刻可比。
 */
function resolveMoment(input: BirthInput, hourOverride?: number): ResolvedMoment {
  const caveats: string[] = [];
  const month = input.month ?? 1;
  const day = input.day ?? 1;
  const hour = hourOverride ?? input.hour ?? 12;
  const minute = input.minute ?? 0;

  let solar: Solar;
  if (input.calendar === '农历') {
    solar = Lunar.fromYmdHms(
      input.year,
      (input.isLeapMonth ? -1 : 1) * month,
      day,
      hour,
      minute,
      0,
    ).getSolar();
    if (input.isLeapMonth) {
      caveats.push(
        '生于闰月：本盘按「以农历十五为界」的通行取舍安星（十五含之前算当月，之后算下月），' +
          '部分流派另有取法，若与他处排盘不同请以此说明复核。',
      );
    }
  } else {
    solar = Solar.fromYmdHms(input.year, month, day, hour, minute, 0);
  }

  let y = solar.getYear();
  let m = solar.getMonth();
  let d = solar.getDay();
  let h = solar.getHour();
  let mi = solar.getMinute();
  let trueSolarTime: string | null = null;

  // 真太阳时：只在时辰已知时才有意义。
  if (input.useTrueSolarTime && input.longitude != null && input.hour != null) {
    const clock = new Date(y, m - 1, d, h, mi, 0);
    const { adjusted, deltaMinutes } = trueSolarAdjust(clock, input.longitude);
    const beforeIdx = timeIndexOf(clock.getHours());
    const afterIdx = timeIndexOf(adjusted.getHours());
    y = adjusted.getFullYear();
    m = adjusted.getMonth() + 1;
    d = adjusted.getDate();
    h = adjusted.getHours();
    mi = adjusted.getMinutes();
    trueSolarTime = `${fmt(adjusted)}（校正 ${deltaMinutes >= 0 ? '+' : ''}${deltaMinutes.toFixed(1)} 分钟）`;
    if (beforeIdx !== afterIdx) {
      caveats.push(
        '真太阳时校正后跨越了时辰边界，命宫因此改变，本盘取校正后的时辰；' +
          '建议以出生地实际经度复核，必要时按两个时辰各排一盘对轨。',
      );
    }
  }

  caveats.push(...liChunCaveat(y, m, d, h, mi));

  return { year: y, month: m, day: d, hour: h, minute: mi, trueSolarTime, caveats };
}

/**
 * 立春年界分歧检测。
 *
 * iztro 的 `yearDivide: 'exact'` 以**立春当日零时**换年；
 * core-bazi 的 `liChunOf()` 以**立春时刻**换年。
 * 因此生于「立春当日、立春时刻之前」者，两包的年干支会差一位，
 * 进而影响紫微的生年四化与八字的年柱。
 *
 * 窗口每年最长不超过一天（2013 年仅 13 分钟），但落在窗口内的人必须被告知，
 * 不能让两个模块静默给出互相矛盾的结论。
 */
export function liChunCaveat(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string[] {
  if (month !== 1 && month !== 2) return [];
  let lc: Date;
  try {
    lc = liChunOf(year);
  } catch {
    return [];
  }
  if (lc.getMonth() + 1 !== month || lc.getDate() !== day) return [];
  const birth = new Date(year, month - 1, day, hour, minute, 0);
  if (birth.getTime() >= lc.getTime()) return [];
  return [
    `生于立春当日、立春时刻（${fmt(lc)}）之前。紫微上游引擎以「立春日零时」换年，` +
      `八字以「立春时刻」换年，两者的年干支在此相差一位。本盘按上游取 ${year} 年，` +
      `八字与命卦按 ${year - 1} 年。此段结论请以两盘并看，勿单取其一。`,
  ];
}

const MUTAGENS: readonly string[] = ['禄', '权', '科', '忌'];

function projectStar(s: {
  name: string;
  type: string;
  scope: string;
  brightness?: string;
  mutagen?: string;
}): ZiWeiStar {
  return {
    name: s.name,
    type: s.type,
    scope: s.scope,
    brightness: s.brightness ? s.brightness : null,
    mutagen: s.mutagen && MUTAGENS.includes(s.mutagen) ? (s.mutagen as Mutagen) : null,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildAstrolabe(m: ResolvedMoment, gender: string): any {
  return (astro as any).withOptions({
    type: 'solar',
    dateStr: `${m.year}-${m.month}-${m.day}`,
    timeIndex: timeIndexOf(m.hour),
    gender,
    fixLeap: FIX_LEAP,
    language: 'zh-CN',
    config: { ...PINNED_CONFIG },
  });
}

function projectPalaces(a: any): ZiWeiPalace[] {
  return (a.palaces as any[]).map((p) => ({
    index: p.index,
    name: p.name,
    heavenlyStem: p.heavenlyStem,
    earthlyBranch: p.earthlyBranch,
    isBodyPalace: !!p.isBodyPalace,
    isOriginalPalace: !!p.isOriginalPalace,
    majorStars: (p.majorStars ?? []).map(projectStar),
    minorStars: (p.minorStars ?? []).map(projectStar),
    adjectiveStars: (p.adjectiveStars ?? []).map(projectStar),
    changsheng12: p.changsheng12,
    boshi12: p.boshi12,
    decadal: {
      range: [p.decadal.range[0], p.decadal.range[1]] as readonly [number, number],
      heavenlyStem: p.decadal.heavenlyStem,
      earthlyBranch: p.decadal.earthlyBranch,
    },
    ages: [...(p.ages ?? [])],
  }));
}

function assemble(
  input: BirthInput,
  m: ResolvedMoment,
  precision: ZiWeiPrecision,
  extraCaveats: readonly string[] = [],
): ZiWeiChart {
  const a = buildAstrolabe(m, input.gender);
  const palaces = projectPalaces(a);
  const base = {
    input,
    precision,
    confidence: CONFIDENCE_BY_PRECISION[precision],
    timeIndex: timeIndexOf(m.hour),
    timeLabel: a.time as string,
    timeRange: a.timeRange as string,
    solarDate: a.solarDate as string,
    lunarDate: a.lunarDate as string,
    chineseDate: a.chineseDate as string,
    zodiac: a.zodiac as string,
    sign: a.sign as string,
    soul: a.soul as string,
    body: a.body as string,
    fiveElementsClass: a.fiveElementsClass as string,
    soulBranch: a.earthlyBranchOfSoulPalace as string,
    bodyBranch: a.earthlyBranchOfBodyPalace as string,
    palaces,
    trueSolarTime: m.trueSolarTime,
    caveats: [...m.caveats, ...extraCaveats],
  };
  return { ...base, patterns: detectPatterns(base) };
}

/**
 * 排单张命盘。要求年月日时俱全。
 *
 * 时辰未知请改用 {@link castZiWeiCandidates} —— 本函数**不会**替你假设一个时辰。
 */
export function castZiWei(input: BirthInput): ZiWeiChart {
  const precision = ziWeiPrecisionOf(input);
  if (precision !== '四柱全') {
    throw new Error(
      precision === '时辰待定'
        ? '缺出生时辰，紫微无法定命宫。请改用 castZiWeiCandidates() 走定盘流程。'
        : '缺出生月或日，紫微以农历月日安星，无从起盘。八字与命卦不受影响。',
    );
  }
  return assemble(input, resolveMoment(input), precision);
}

/**
 * 定盘：时辰未知时排出十三张候选盘（含早子、晚子），并按命宫地支归组。
 *
 * 这一步本身就是对轨回路的入口 —— 古法「定盘」靠反问已发生之事来锁时辰，
 * 与本项目用真实经历收敛象意是同一件事，见 docs/ROADMAP.md §5。
 */
export function castZiWeiCandidates(input: BirthInput): ZiWeiCandidateSet {
  const precision = ziWeiPrecisionOf(input);
  if (precision === '无法起盘') {
    throw new Error('缺出生月或日，紫微以农历月日安星，无从起盘。');
  }
  if (precision === '四柱全') {
    throw new Error('时辰已知，请直接用 castZiWei() 排单张命盘，无须定盘。');
  }

  const candidates = ALL_TIME_INDEXES.map((idx) => {
    const m = resolveMoment(input, hourOfTimeIndex(idx));
    return assemble(input, m, '时辰待定', [
      `本盘对应${idx === 0 ? '早子时' : idx === 12 ? '晚子时' : ''}时辰索引 ${idx}，属十三张候选之一，未经定盘不可单取。`,
    ]);
  });

  const byBranch = new Map<string, ZiWeiChart[]>();
  for (const c of candidates) {
    const list = byBranch.get(c.soulBranch);
    if (list) list.push(c);
    else byBranch.set(c.soulBranch, [c]);
  }

  const groups: ZiWeiCandidateGroup[] = [...byBranch.entries()].map(([soulBranch, list]) => {
    const first = list[0]!;
    const soulPalace = first.palaces.find((p) => p.name === '命宫');
    return {
      soulBranch,
      fiveElementsClass: first.fiveElementsClass,
      timeIndexes: list.map((c) => c.timeIndex),
      timeLabels: list.map((c) => c.timeLabel),
      soulMajorStars: soulPalace ? soulPalace.majorStars.map((s) => s.name) : [],
    };
  });

  return {
    input,
    precision: '时辰待定',
    candidates,
    groups,
    note:
      `十三个时辰共产生 ${groups.length} 种命宫。` +
      '对轨时只需分辨这几种，不必逐个时辰试；已发生之事与哪一种最合，即以之定盘。',
  };
}

function projectLayer(
  name: string,
  layer: any,
  palaces: readonly ZiWeiPalace[],
): HoroscopeLayer {
  const idx = layer.index as number;
  const natal = palaces.find((p) => p.index === idx);
  return {
    name,
    palaceIndex: idx,
    natalPalaceName: natal ? natal.name : '—',
    heavenlyStem: layer.heavenlyStem,
    earthlyBranch: layer.earthlyBranch,
    ganZhi: `${layer.heavenlyStem}${layer.earthlyBranch}`,
    mutagenStars: [...(layer.mutagen ?? [])],
  };
}

/**
 * 取某一年的运限（大限 / 小限 / 流年）。
 *
 * 以该年 6 月 15 日为代表时点：远离立春与农历年首，
 * 使「这一年属哪个流年」不受年界取舍影响。流月、流日另开接口，
 * 不要拿这个函数的结果当月级依据。
 *
 * 候选盘（时辰待定）同样可取运限 —— 定盘阶段本就需要逐张比对各年的运限走势。
 */
export function horoscopeAt(chart: ZiWeiChart, year: number): ZiWeiHoroscope {
  const m = resolveMoment(chart.input, hourOfTimeIndex(chart.timeIndex));
  const a = buildAstrolabe(m, chart.input.gender);
  const h = a.horoscope(`${year}-06-15`);
  return {
    year,
    nominalAge: h.age.nominalAge,
    solarDate: h.solarDate,
    lunarDate: h.lunarDate,
    decadal: projectLayer('大限', h.decadal, chart.palaces),
    age: projectLayer('小限', h.age, chart.palaces),
    yearly: projectLayer('流年', h.yearly, chart.palaces),
  };
}

/** 取本命盘某宫。 */
export function palaceOf(chart: ZiWeiChart, name: string): ZiWeiPalace | undefined {
  return chart.palaces.find((p) => p.name === name);
}

/**
 * 三方四正：本宫 + 对宫 + 财帛位 + 官禄位。
 * 索引按十二宫环取：对宫 +6，财帛位 +4，官禄位 +8（皆模 12）。
 */
export function surroundingOf(
  chart: ZiWeiChart,
  name: string,
): readonly ZiWeiPalace[] {
  const target = palaceOf(chart, name);
  if (!target) return [];
  const at = (offset: number) =>
    chart.palaces.find((p) => p.index === (target.index + offset) % 12);
  return [target, at(6), at(4), at(8)].filter((p): p is ZiWeiPalace => p != null);
}
