'use client';

/**
 * 一生轨迹：过去 · 现在 · 未来。
 *
 * 这是产品的正脸 —— 用户第一件想知道的事，不是「我的取象收敛了没有」，
 * 而是「我这辈子大概怎么走、今年什么情况、往后几年要留意什么」。
 *
 * 与 `retrospect.ts` 的分工：
 *   - retrospect  只管过去，出的是**待对轨**的回溯条目
 *   - lifeStore   管全程，出的是**可读的轨迹** ＋ 现在与未来的**具体预测**
 *
 * 未来预测同样进账本、同样可结算 —— 说出口的话都要能被追账，
 * 否则「预测」就只是好看的段落。
 */

import {
  computeBaziChart,
  liuNianGanZhi,
  liuNianShiShen,
  shenShaHits,
  shiShen,
  type BirthInput,
} from '@hidefate/core-bazi';
import { Solar } from 'lunar-typescript';
import { predictYear, type EventToken, type PredictedEvent } from '@hidefate/core-events';
import {
  STAR_NAME,
  annualStar,
  buildFlyingStarChart,
  deriveCombination,
  dongQiOf,
  monthlyStar,
  periodOfYear,
  type PalaceIndex,
  type PropertyProfile,
} from '@hidefate/core-fengshui';
import {
  attributeTransition,
  buildLifeTimeline,
  detectBreakpoints,
  naturalExperiments,
  type Breakpoint,
  type LifeTimeline,
  type ResidencePeriod,
  type TransitionAttribution,
} from '@hidefate/core-synthesis';
import {
  analyseResonanceTagged,
  buildBaseDictionary,
  type Resonance,
  type TaggedToken,
  type XiangYi,
} from '@hidefate/core-xiangyi';
import { freezePrediction, hashInput, type PredictionDraft, type PredictionRecord } from '@hidefate/core-ledger';
import { castZiWei, horoscopeAt, type ZiWeiChart } from '@hidefate/core-ziwei';
import { newId } from './db';

export const LIFE_ENGINE_VERSION = 'hidefate/life@1|bazi@0.1|fengshui@0.1|ziwei@0.1|xiangyi@0.1';

const DICTIONARY: readonly XiangYi[] = buildBaseDictionary();

export interface Person extends BirthInput {
  readonly id: string;
  readonly name: string;
}

export interface LifeInput {
  readonly person: Person;
  readonly residences: readonly ResidencePeriod[];
  readonly properties: ReadonlyMap<string, PropertyProfile>;
  /** 当前年（立春年）。 */
  readonly thisYear: number;
  /** 未来看几年，默认 10。 */
  readonly futureSpan?: number;
}

/** 一段大运（或十年段）的概览。 */
export interface EraSummary {
  readonly fromYear: number;
  readonly toYear: number;
  readonly label: string;
  readonly ageRange: string;
  /** 该段的主基调 —— 取共振最高、先验最大的一条。 */
  readonly headline: string | null;
  readonly domains: readonly string[];
  readonly breakpoints: readonly Breakpoint[];
  /** 该段是否已过去。 */
  readonly past: boolean;
  readonly current: boolean;
}

export interface YearOutlook {
  readonly year: number;
  readonly age: number;
  readonly ganZhi: string;
  readonly shiShen: string | null;
  readonly annualStarName: string;
  readonly periodLabel: string;
  /** 紫微流年宫（缺时辰时为 null）。 */
  readonly ziweiPalace: string | null;
  readonly ziweiMutagens: readonly string[];
  readonly residenceName: string | null;
  readonly breakpoints: readonly Breakpoint[];
  readonly resonance: readonly Resonance[];
  /** 具体事件 —— 这才是用户要看的东西，象意退居解释位。 */
  readonly events: readonly PredictedEvent[];
  /** 该年的九宫双星与动气 —— 「五黄飞到你大门所在的坎宫」这句话的来源。 */
  readonly palaces: readonly PalaceSnapshot[];
  readonly drafts: readonly PredictionDraft[];
  /** 该年是否值得重点留意（有断点或有三层共振）。 */
  readonly notable: boolean;
}

export interface ZiWeiOverview {
  readonly available: boolean;
  readonly reason: string;
  readonly soulBranch?: string;
  readonly soulStars?: readonly string[];
  readonly fiveElementsClass?: string;
  readonly soul?: string;
  readonly body?: string;
  readonly patterns?: readonly { name: string; text: string }[];
  readonly caveats?: readonly string[];
}

export interface LifeView {
  readonly person: Person;
  readonly timeline: LifeTimeline;
  readonly ziwei: ZiWeiOverview;
  readonly eras: readonly EraSummary[];
  readonly present: YearOutlook;
  readonly future: readonly YearOutlook[];
  /** 最值得回忆的年份 —— 断点单一、分辨力最高。 */
  readonly worthRecalling: readonly TransitionAttribution[];
  readonly notes: readonly string[];
}

/* ============ token 采集 ============ */

/** 命层：大运十神 + 紫微本命主星。 */
function mingTokensOf(chart: ReturnType<typeof computeBaziChart>, zw: ZiWeiChart | null, year: number): TaggedToken[] {
  const out: TaggedToken[] = [];
  const decade = chart.decades.find((d) => year >= d.startYear && year <= d.endYear);
  if (decade?.ganShiShen) out.push({ token: decade.ganShiShen, layer: '命' });
  if (zw) {
    for (const name of ['命宫', '疾厄', '财帛', '夫妻', '官禄']) {
      const p = zw.palaces.find((x) => x.name === name);
      for (const s of p?.majorStars ?? []) out.push({ token: s.name, layer: '命' });
    }
  }
  return out;
}

/**
 * 运层：流年十神 + 紫微流年四化 + 流年紫白。
 *
 * 「流年七杀」与「大运七杀」是同一个象在不同时间尺度上说话，
 * 故用同一个 token，只是出处标为运层 —— 共振因此能真正达到三层。
 */
function yunTokensOf(chart: ReturnType<typeof computeBaziChart>, zw: ZiWeiChart | null, year: number): TaggedToken[] {
  const out: TaggedToken[] = [];
  const ss = liuNianShiShen(chart, year);
  if (ss) out.push({ token: ss, layer: '运' });
  out.push({ token: STAR_NAME[annualStar(year)], layer: '运' });

  // 流年神煞：本命红鸾在卯，则逢卯年为红鸾年。
  // 少了这一句，「论及婚嫁」这类以红鸾为必要条件的年级事件永远触发不了。
  const natal = natalYearZhi(chart);
  if (natal) {
    for (const sh of shenShaHits(natal, [ZHI_OF_YEAR(year)])) out.push({ token: sh, layer: '运' });
  }

  if (zw) {
    try {
      const h = horoscopeAt(zw, year);
      for (const s of h.yearly.mutagenStars) out.push({ token: s, layer: '运' });
    } catch {
      // 运限取不到时静默跳过 —— 命盘本身的 caveats 已经说明了原因
    }
  }
  return out;
}

/**
 * 本命年支 —— 神煞由它推出。
 *
 * 用法是古法的标准用法：本命红鸾在卯，则逢卯年为「红鸾年」。
 * 所以神煞命中算**运层**（是那一年触发的），不是命层。
 */
function natalYearZhi(chart: ReturnType<typeof computeBaziChart>): string | null {
  return chart.pillars.find((p) => p.position === '年柱')?.zhi ?? null;
}

/** 立春年 → 年支。 */
function ZHI_OF_YEAR(year: number): string {
  return liuNianGanZhi(year).charAt(1);
}

/** 某节气月的干支（取该月中气前后的一天，避开月界）。 */
function monthGanZhi(year: number, monthIndex: number): string {
  // 节气月序 1 = 寅月（约公历 2 月）。取该月 15 号前后一天足够避开交节。
  const gregorianMonth = ((monthIndex + 1 - 1) % 12) + 1;
  const y = monthIndex >= 12 ? year + 1 : year;
  return Solar.fromYmdHms(y, gregorianMonth, 15, 12, 0, 0).getLunar().getMonthInGanZhiExact();
}

/**
 * 流月层 token：流月十神 + 流月紫白 + 流月支触发的神煞。
 *
 * 这一层是「八月」这种说法的来源 —— 没有它，一切预测只能落到年。
 */
function monthTokensOf(
  chart: ReturnType<typeof computeBaziChart>,
  year: number,
  monthIndex: number,
): EventToken[] {
  const out: EventToken[] = [];
  const gz = monthGanZhi(year, monthIndex);
  if (chart.dayMaster) {
    const ss = shiShen(chart.dayMaster, gz.charAt(0));
    if (ss) out.push({ token: ss, layer: '运' });
  }
  out.push({ token: STAR_NAME[monthlyStar(year, monthIndex)], layer: '运' });

  const natal = natalYearZhi(chart);
  if (natal) {
    for (const s of shenShaHits(natal, [gz.charAt(1)])) out.push({ token: s, layer: '运' });
  }
  return out;
}

/** 该年生效之宅的双星与动气详情，供事件层与界面共用。 */
export interface PalaceSnapshot {
  readonly palace: PalaceIndex;
  readonly direction: string;
  readonly shan: number;
  readonly xiang: number;
  /** 双星组合名，如「二五交加」。 */
  readonly comboName: string;
  readonly comboKey: string;
  readonly comboNature: '吉' | '凶' | '中';
  readonly comboMeaning: string;
  /** 动气强度 0–1 与分档。 */
  readonly dongQi: number;
  readonly dongQiLevel: string;
  readonly dongQiNote: string;
  /** 该年流年星飞入本宫。 */
  readonly annual: number;
  /** 流年星与原山星／向星形成的新组合名。 */
  readonly annualCombo: string;
}

const PALACE_DIRECTION_CN: Record<number, string> = {
  1: '正北', 2: '西南', 3: '正东', 4: '东南', 5: '中宫',
  6: '西北', 7: '正西', 8: '东北', 9: '正南',
};

/** 流年星飞入某宫 —— 洛书轨迹，与 annualStar 入中同源。 */
function annualStarAt(year: number, palace: PalaceIndex): number {
  const center = annualStar(year);
  // 入中之星按洛书顺飞：宫位 p 上的星 = ((center - 1) + (p - 5) + 9) % 9 + 1
  return (((center - 1 + (palace - 5)) % 9) + 9) % 9 + 1;
}

/**
 * 该年的九宫快照：双星组合 + 动气 + 流年触发。
 *
 * 这是「双星断事 + 应期」的落点 —— 早先事件层把山星与向星拆成两个独立 token，
 * 配对信息整个丢掉，等于守着 53 条经典组合表不用。
 */
export function palaceSnapshots(
  timeline: LifeTimeline,
  year: number,
): PalaceSnapshot[] {
  const y = timeline.years.find((x) => x.year === year);
  if (!y || !y.fengShui.evidenceUsable) return [];

  for (const r of y.fengShui.residences) {
    if (!r.profile || !r.capability.flyingStar) continue;
    try {
      const chart = buildFlyingStarChart({
        sitting: r.profile.sitting,
        ...(r.profile.facing != null ? { facing: r.profile.facing } : {}),
        moveInYear: r.profile.moveInYear,
      });
      const period = chart.period.period;
      return ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((p) => {
        const cell = chart.palaces[p];
        const combo = deriveCombination(cell.shan, cell.xiang, period);
        const dq = dongQiOf(p, r.profile!.rooms);
        const annual = annualStarAt(year, p);
        // 流年星与原盘山向各成一组，取凶性较著者示人
        const withShan = deriveCombination(cell.shan, annual as PalaceIndex, period);
        const withXiang = deriveCombination(annual as PalaceIndex, cell.xiang, period);
        const pick = withShan.nature === '凶' ? withShan : withXiang;
        return {
          palace: p,
          direction: PALACE_DIRECTION_CN[p] ?? '',
          shan: cell.shan,
          xiang: cell.xiang,
          comboName: combo.name,
          comboKey: combo.key,
          comboNature: combo.nature,
          comboMeaning: combo.meaning,
          dongQi: dq.strength,
          dongQiLevel: dq.level,
          dongQiNote: dq.note,
          annual,
          annualCombo: pick.name,
        };
      });
    } catch {
      // 坐向无法解析 —— coverage 已报出资料不足
    }
  }
  return [];
}

/**
 * 风水层 token。
 *
 * 两处与早先不同，都是「双星断事 + 应期」带来的：
 *
 * 1. **发组合，不发拆开的单星。** 早先 push 的是「二黑」「五黄」两个独立 token，
 *    配对信息整个丢掉 —— 而玄空的断事恰恰在配对上（二五交加 ≠ 二黑 + 五黄）。
 *    现在既发单星（保持既有模板可用），也发 `合:二五交加` 这样的组合 token。
 * 2. **只发有动气的宫。** 五黄飞到天天进出的大门，和飞到一年不开一次的储藏室，
 *    是两回事。无动气之宫的星象照算不误（宅盘分析里仍会报），
 *    但它不该成为「今年会出事」的触发依据 —— 古法「不动不应」。
 */
function fengShuiTokensOf(timeline: LifeTimeline, year: number): TaggedToken[] {
  const out: TaggedToken[] = [];
  for (const s of palaceSnapshots(timeline, year)) {
    if (s.dongQi <= 0) continue; // 不动不应
    out.push({ token: STAR_NAME[s.shan as PalaceIndex], layer: '风水' });
    out.push({ token: STAR_NAME[s.xiang as PalaceIndex], layer: '风水' });
    out.push({ token: `合:${s.comboName}`, layer: '风水' });
    // 流年星临宫所成之新组合 —— 这是应期的触发，属运层
    out.push({ token: `临:${s.annualCombo}`, layer: '运' });
  }
  return out;
}

/**
 * 概率取值：先验 × 共振加成。工程化取值、可复算，收敛到账本的 3%–92%。
 * 与 retrospect.ts 用同一条公式，两处口径必须一致，否则同一条象在
 * 回溯与未来里会给出两个数，用户一眼就会发现不对。
 */
export function outlookProbability(entry: XiangYi, resonance: number): number {
  const bonus = resonance >= 3 ? 1.35 : resonance === 2 ? 1.15 : 0.85;
  return Math.max(0.03, Math.min(0.92, Number((entry.prior * bonus).toFixed(4))));
}

const MAX_PER_YEAR = 3;

function outlookFor(
  input: LifeInput,
  chart: ReturnType<typeof computeBaziChart>,
  zw: ZiWeiChart | null,
  timeline: LifeTimeline,
  breakpoints: readonly Breakpoint[],
  inputHash: string,
  year: number,
): YearOutlook {
  const tagged = [
    ...mingTokensOf(chart, zw, year),
    ...yunTokensOf(chart, zw, year),
    ...fengShuiTokensOf(timeline, year),
  ];
  const resonance = analyseResonanceTagged(DICTIONARY, tagged);

  /**
   * 具体事件 —— 这才是用户要看的东西。
   *
   * 象意（上面那个 resonance）退居解释位：用户追问「凭什么这么说」时才展开。
   * 早先把象意直接当预测端出去，读起来是「竞争、创业、独当一面承压」，
   * 那是古法的取象范畴，不是人话，更不是预判。
   */
  const events = predictYear(
    year,
    tagged,
    (m) => monthTokensOf(chart, year, m),
  ).slice(0, MAX_PER_YEAR);

  /** 事件进账本 —— 断语就是事件名，判据就是事件模板写死的那一条。 */
  const drafts: PredictionDraft[] = events.map((e) => ({
    personId: input.person.id,
    engineVersion: LIFE_ENGINE_VERSION,
    inputHash,
    window: { fromYear: year, toYear: year },
    domain: e.domain,
    statement: e.title,
    candidateXiangIds: [`event.${e.templateId}`],
    layers: e.layers,
    probability: e.probability,
    baseRate: null,
    resolution: { criterion: e.criterion, judge: '用户自评' },
    interventionability: e.interventionability,
  }));

  const yearRow = timeline.years.find((x) => x.year === year);
  const bps = breakpoints.filter((b) => b.year === year);
  const zwYear = (() => {
    if (!zw) return { palace: null as string | null, mutagens: [] as string[] };
    try {
      const h = horoscopeAt(zw, year);
      return { palace: h.yearly.natalPalaceName, mutagens: [...h.yearly.mutagenStars] };
    } catch {
      return { palace: null as string | null, mutagens: [] as string[] };
    }
  })();

  return {
    year,
    age: year - input.person.year + 1,
    ganZhi: liuNianGanZhi(year),
    shiShen: liuNianShiShen(chart, year),
    annualStarName: STAR_NAME[annualStar(year)],
    periodLabel: periodOfYear(year).label,
    ziweiPalace: zwYear.palace,
    ziweiMutagens: zwYear.mutagens,
    residenceName:
      yearRow?.fengShui.residences[0]?.profile?.name ??
      (yearRow && yearRow.fengShui.residences.length > 0 ? '（未建档）' : null),
    breakpoints: bps,
    resonance,
    events,
    palaces: palaceSnapshots(timeline, year),
    drafts,
    /**
     * 「留意」只标**这一年独有**的事：个人断点（换大运、搬家、施做化解）。
     * 早先还把「三层共振」算进来，结果每年都三层共振，标记因此毫无分辨力 ——
     * 满屏都是重点等于没有重点。
     */
    /**
     * 「留意」= 这一年有个人断点（换大运、搬家、化解），或有凶事件出报。
     * 不把三层共振算进来 —— 那个每年都有，标了等于没标。
     */
    notable: bps.some((b) => b.personal) || events.some((e) => e.valence === '凶'),
  };
}

/** 装配一生轨迹。纯计算，不写库。 */
export function buildLifeView(input: LifeInput): LifeView {
  const notes: string[] = [];
  const { person, thisYear } = input;
  const span = input.futureSpan ?? 10;
  const chart = computeBaziChart(person);

  let zw: ZiWeiChart | null = null;
  let ziwei: ZiWeiOverview = { available: false, reason: '' };
  if (person.hour != null) {
    try {
      zw = castZiWei(person);
      const soul = zw.palaces.find((p) => p.name === '命宫');
      ziwei = {
        available: true,
        reason: '',
        soulBranch: zw.soulBranch,
        soulStars: (soul?.majorStars ?? []).map(
          (s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? `化${s.mutagen}` : ''}`,
        ),
        fiveElementsClass: zw.fiveElementsClass,
        soul: zw.soul,
        body: zw.body,
        patterns: zw.patterns.map((p) => ({ name: p.name, text: p.text })),
        caveats: zw.caveats,
      };
    } catch (e) {
      ziwei = { available: false, reason: e instanceof Error ? e.message : String(e) };
    }
  } else {
    ziwei = {
      available: false,
      reason: '缺出生时辰，紫微连命宫都定不了。补上时辰，或用十三张候选盘对轨定盘后即可。',
    };
    notes.push('未提供出生时辰：紫微整层缺席，命层只有八字在说话。');
  }

  const timeline = buildLifeTimeline({
    personId: person.id,
    chart,
    fromYear: person.year,
    toYear: thisYear + span,
    residences: input.residences,
    properties: input.properties,
  });

  const breakpoints = detectBreakpoints({
    personId: person.id,
    fromYear: person.year,
    toYear: thisYear + span,
    decades: chart.decades,
    residences: input.residences,
  });

  const inputHash = hashInput({
    person: { year: person.year, month: person.month, day: person.day, hour: person.hour, gender: person.gender },
    residences: input.residences.map((r) => ({
      propertyId: r.propertyId, fromYear: r.fromYear, toYear: r.toYear, role: r.role, fidelity: r.fidelity,
    })),
  });

  // ---- 分段 ----
  const rawEras =
    chart.decades.length > 0
      ? chart.decades.map((d) => ({
          fromYear: d.startYear,
          toYear: d.endYear,
          label: `${d.ganZhi}运`,
          ageRange: `${d.startAge}–${d.endAge}岁`,
        }))
      : [];
  if (rawEras.length === 0) notes.push('无大运（缺日柱），分段与命层取象因此较粗。');

  const eras: EraSummary[] = rawEras.map((era) => {
    const mid = Math.min(Math.max(era.fromYear, person.year), era.toYear);
    const tagged = [
      ...mingTokensOf(chart, zw, mid),
      ...fengShuiTokensOf(timeline, mid),
    ];
    const res = analyseResonanceTagged(DICTIONARY, tagged);
    const top = res
      .flatMap((r) => r.admitted.map((e) => ({ e, r: r.resonance })))
      .sort((a, b) => b.r - a.r || b.e.prior - a.e.prior)[0];
    return {
      ...era,
      headline: top ? top.e.statement : null,
      domains: [...new Set(res.flatMap((r) => r.admitted.map((e) => e.domain)))],
      breakpoints: breakpoints.filter((b) => b.year >= era.fromYear && b.year <= era.toYear),
      past: era.toYear < thisYear,
      current: era.fromYear <= thisYear && thisYear <= era.toYear,
    };
  });

  const present = outlookFor(input, chart, zw, timeline, breakpoints, inputHash, thisYear);
  const future: YearOutlook[] = [];
  for (let y = thisYear + 1; y <= thisYear + span; y++) {
    future.push(outlookFor(input, chart, zw, timeline, breakpoints, inputHash, y));
  }

  const worthRecalling = naturalExperiments(breakpoints).filter((a) => a.year < thisYear);

  if (timeline.coverage.usableYears === 0) {
    notes.push(
      '没有可用的居住史，风水层全程缺席 —— 现在只有命与运两层。' +
        '补上住过的地方（哪怕只记得大致朝向），预测会明显具体起来。',
    );
  }

  return { person, timeline, ziwei, eras, present, future, worthRecalling, notes };
}

/** 把某一年的预测冻结进账本，返回新记录。已存在同年同象意者跳过。 */
export function freezeOutlook(
  outlook: YearOutlook,
  existing: readonly PredictionRecord[],
  now: Date,
): PredictionRecord[] {
  const seen = new Set(
    existing
      .filter((r) => r.window.fromYear === outlook.year)
      .flatMap((r) => r.candidateXiangIds),
  );
  const createdAt = now.toISOString();
  return outlook.drafts
    .filter((d) => !d.candidateXiangIds.some((id) => seen.has(id)))
    .map((d) => freezePrediction(d, newId('pred'), createdAt));
}

export { attributeTransition };
