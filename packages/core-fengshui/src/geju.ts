/**
 * 玄空格局体检 —— 风水师拿到一张飞星盘，第一眼就会查的几件事。
 *
 * `judgePattern()` 只分了旺山旺向／上山下水／双星会向／双星会坐四类。
 * 实务上，以下几项同样是「先看」的，缺了它们，风水师会直接不信这张盘：
 *
 *   - 伏吟／反吟：山盘或向盘与元旦盘（洛书本位）或运盘相同／合十相冲
 *   - 合十：山星或向星与运星逐宫合十（通气之局）
 *   - 连珠三般卦：逐宫运、山、向三星相连
 *   - 父母三般卦：逐宫三星同属一四七／二五八／三六九
 *   - 入囚：中宫向星（或山星）之数，在该运到来时被「囚」于中宫
 *   - 失运：宅以旧运立盘，如今已换运
 *
 * ## 纪律
 *
 * 1. **只做判定，不做加权。** 本模块不改任何分数；合参层要不要用、用多重，另议。
 * 2. **古籍出处不确定就照实写「待核」。** 伏吟反吟、入囚等是诸家通论，
 *    但具体出自哪一部、原文如何，本模块不凭记忆硬引。
 * 3. **例外条件写进 caveats，不静默套用。** 例如入囚「向首／中宫见真水不囚」
 *    是多家共识但须实地核，故只提示、不自动豁免。
 */

import { PALACE_DIRECTION, PALACE_INDEXES, STAR_NAME, type PalaceIndex } from './constants.js';
import type { FlyingStarChart, StarPlate } from './flyingStar.js';
import { CN_NUM, periodOfYear, YUN_LENGTH } from './period.js';

export type GeJuKind =
  | '山星伏吟'
  | '向星伏吟'
  | '山星反吟'
  | '向星反吟'
  | '山星伏吟运盘'
  | '向星伏吟运盘'
  | '向首伏吟'
  | '向首反吟'
  | '坐山伏吟'
  | '坐山反吟'
  | '山星合十'
  | '向星合十'
  | '山向合十'
  | '连珠三般卦'
  | '父母三般卦'
  | '向星入囚'
  | '山星入囚'
  | '失运';

export interface GeJu {
  readonly kind: GeJuKind;
  /** 全盘 / 局部（只在坐山或向首一宫）。 */
  readonly scope: '全盘' | '局部';
  readonly valence: '吉' | '凶' | '中';
  /** 主应：丁（人丁健康）、财（财禄）、或两者。 */
  readonly governs: '丁' | '财' | '丁财';
  /** 一句话结论，可直接给风水师看。 */
  readonly summary: string;
  /** 依据；出处不确定时明写「待核」。 */
  readonly classic: string;
  /** 例外与门派分歧，供风水师现场裁量。 */
  readonly caveats: readonly string[];
  /** 涉及的宫位（全盘则为空）。 */
  readonly palaces: readonly PalaceIndex[];
  /** 入囚／失运等有时间性的格局：起讫公历年。 */
  readonly window?: { readonly startYear: number; readonly endYear: number };
}

export interface GeJuReport {
  readonly items: readonly GeJu[];
  /** 判定过程，与 FlyingStarChart.derivation 同风格。 */
  readonly derivation: readonly string[];
}

const TRIPLETS: readonly (readonly PalaceIndex[])[] = [
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
];

function everyPalace(pred: (p: PalaceIndex) => boolean): boolean {
  return PALACE_INDEXES.every(pred);
}

function isFuYinYuanDan(plate: StarPlate): boolean {
  return everyPalace((p) => plate[p] === p);
}

function isFanYinYuanDan(plate: StarPlate): boolean {
  // 中宫 5 + 5 = 10，与外八宫同一判据。
  return everyPalace((p) => plate[p] + p === 10);
}

function isSamePlate(a: StarPlate, b: StarPlate): boolean {
  return everyPalace((p) => a[p] === b[p]);
}

function isHeShi(a: StarPlate, b: StarPlate): boolean {
  return everyPalace((p) => a[p] + b[p] === 10);
}

/** 三数在 1–9 环上相连（9 与 1 相接）。 */
export function isConsecutiveTriple(a: number, b: number, c: number): boolean {
  const s = [a, b, c].sort((x, y) => x - y);
  if (new Set(s).size !== 3) return false;
  const [x, y, z] = s as [number, number, number];
  if (y === x + 1 && z === y + 1) return true;
  // 环接：8-9-1、9-1-2
  return (x === 1 && y === 8 && z === 9) || (x === 1 && y === 2 && z === 9);
}

function tripletOf(n: PalaceIndex): readonly PalaceIndex[] {
  return TRIPLETS.find((t) => t.includes(n))!;
}

/** 自某运往后数，第一个等于 target 的运的起讫年（不含起点之运本身）。 */
function nextPeriodWindow(fromStart: number, fromPeriod: PalaceIndex, target: PalaceIndex) {
  let steps = (((target - fromPeriod) % 9) + 9) % 9;
  if (steps === 0) steps = 9;
  const startYear = fromStart + steps * YUN_LENGTH;
  return { startYear, endYear: startYear + YUN_LENGTH - 1 };
}

/**
 * 玄空格局体检。
 *
 * @param chart       已排好的飞星盘
 * @param currentYear 看盘当年（立春年），用于判定「当前是否入囚／失运」
 */
export function assessGeJu(chart: FlyingStarChart, currentYear: number): GeJuReport {
  const items: GeJu[] = [];
  const derivation: string[] = [];
  const { shanPan, xiangPan, yunPan } = chart;
  const sitP = chart.sitting.mountain.palace;
  const facP = chart.facing.mountain.palace;
  const housePeriod = chart.period.period;
  const nowPeriod = periodOfYear(currentYear);

  const FU_FAN_CLASSIC = '伏吟反吟为玄空诸家通论（沈氏玄空学一系均列为凶格）；具体古籍原文待核';
  const FU_FAN_CAVEATS = [
    '多由五入中所致：顺飞成伏吟、逆飞成反吟。',
    '有门派以替卦、或换天心（大装修重立运盘）来回避。',
    '伏反吟之星若恰为当令旺星，诸家轻重说法不一（待考），须结合峦头实地裁量。',
  ];

  // ---- 1. 全盘伏吟／反吟（对元旦盘）----
  for (const [plate, label, gov] of [
    [shanPan, '山星', '丁'],
    [xiangPan, '向星', '财'],
  ] as const) {
    if (isFuYinYuanDan(plate)) {
      items.push({
        kind: `${label}伏吟` as GeJuKind,
        scope: '全盘',
        valence: '凶',
        governs: gov,
        summary: `${label}盘五入中顺飞，九宫${label}与洛书本位逐宫相同 —— 全盘${label}伏吟，主${gov === '丁' ? '人丁健康' : '财禄'}受损、事多反复。`,
        classic: FU_FAN_CLASSIC,
        caveats: FU_FAN_CAVEATS,
        palaces: [],
      });
      derivation.push(`${label}盘中宫为五且顺飞 → 逐宫等于洛书本位 → 全盘伏吟。`);
    } else if (isFanYinYuanDan(plate)) {
      items.push({
        kind: `${label}反吟` as GeJuKind,
        scope: '全盘',
        valence: '凶',
        governs: gov,
        summary: `${label}盘五入中逆飞，九宫${label}与洛书本位逐宫合十相冲 —— 全盘${label}反吟，主${gov === '丁' ? '人丁健康' : '财禄'}受冲、变故突然。`,
        classic: FU_FAN_CLASSIC,
        caveats: FU_FAN_CAVEATS,
        palaces: [],
      });
      derivation.push(`${label}盘中宫为五且逆飞 → 逐宫与洛书本位合十 → 全盘反吟。`);
    }
  }

  // ---- 2. 伏吟运盘（山盘或向盘与运盘完全相同）----
  for (const [plate, label, gov] of [
    [shanPan, '山星', '丁'],
    [xiangPan, '向星', '财'],
  ] as const) {
    if (isSamePlate(plate, yunPan) && !isFuYinYuanDan(plate)) {
      items.push({
        kind: `${label}伏吟运盘` as GeJuKind,
        scope: '全盘',
        valence: '凶',
        governs: gov,
        summary: `${label}盘与运盘逐宫相同 —— ${label}伏吟运盘，气不流通。`,
        classic: FU_FAN_CLASSIC,
        caveats: FU_FAN_CAVEATS,
        palaces: [],
      });
      derivation.push(`${label}盘与运盘九宫逐一相同 → 伏吟运盘。`);
    }
  }

  // ---- 3. 坐山／向首局部伏反吟（全盘已报者不重复）----
  const wholeShan = items.some((g) => g.scope === '全盘' && g.kind.startsWith('山星'));
  const wholeXiang = items.some((g) => g.scope === '全盘' && g.kind.startsWith('向星'));
  if (!wholeXiang) {
    const x = xiangPan[facP];
    if (x === facP) {
      items.push(localFuFan('向首伏吟', facP, x, '向星', '财', FU_FAN_CLASSIC));
    } else if (x + facP === 10) {
      items.push(localFuFan('向首反吟', facP, x, '向星', '财', FU_FAN_CLASSIC));
    }
  }
  if (!wholeShan) {
    const s = shanPan[sitP];
    if (s === sitP) {
      items.push(localFuFan('坐山伏吟', sitP, s, '山星', '丁', FU_FAN_CLASSIC));
    } else if (s + sitP === 10) {
      items.push(localFuFan('坐山反吟', sitP, s, '山星', '丁', FU_FAN_CLASSIC));
    }
  }

  // ---- 4. 合十 ----
  const HE_SHI_CLASSIC = '合十为玄空通气之局，诸家多列为吉格；具体古籍原文待核';
  if (isHeShi(shanPan, yunPan)) {
    items.push({
      kind: '山星合十',
      scope: '全盘',
      valence: '吉',
      governs: '丁',
      summary: '九宫山星与运星逐宫合十 —— 山星合十，通气之局，利人丁健康。',
      classic: HE_SHI_CLASSIC,
      caveats: ['合十之吉仍须坐山有实山（或高物）承接，峦头不配则减力。'],
      palaces: [],
    });
    derivation.push('山盘与运盘逐宫相加皆为十 → 山星合十。');
  }
  if (isHeShi(xiangPan, yunPan)) {
    items.push({
      kind: '向星合十',
      scope: '全盘',
      valence: '吉',
      governs: '财',
      summary: '九宫向星与运星逐宫合十 —— 向星合十，通气之局，利财禄。',
      classic: HE_SHI_CLASSIC,
      caveats: ['合十之吉仍须向首见水或开阔明堂承接，峦头不配则减力。'],
      palaces: [],
    });
    derivation.push('向盘与运盘逐宫相加皆为十 → 向星合十。');
  }
  if (isHeShi(shanPan, xiangPan)) {
    items.push({
      kind: '山向合十',
      scope: '全盘',
      valence: '中',
      governs: '丁财',
      summary: '九宫山星与向星逐宫合十 —— 山向合十，二气相通；吉凶仍以旺衰与峦头定。',
      classic: HE_SHI_CLASSIC,
      caveats: ['诸家对「山向合十」轻重说法不一（待考），本 App 不据此加减分。'],
      palaces: [],
    });
    derivation.push('山盘与向盘逐宫相加皆为十 → 山向合十。');
  }

  // ---- 5. 三般卦 ----
  const SAN_BAN_CLASSIC = '三般卦为玄空城门／打劫诸法之基，诸家列为吉格；具体古籍原文待核';
  if (everyPalace((p) => isConsecutiveTriple(yunPan[p], shanPan[p], xiangPan[p]))) {
    items.push({
      kind: '连珠三般卦',
      scope: '全盘',
      valence: '吉',
      governs: '丁财',
      summary: '九宫运、山、向三星逐宫相连 —— 连珠三般卦，三元气通，吉格。',
      classic: SAN_BAN_CLASSIC,
      caveats: ['三般卦之吉以「通气」论，坐向失令或峦头不配时不宜过誉。'],
      palaces: [],
    });
    derivation.push('逐宫运山向三数相连 → 连珠三般卦。');
  }
  if (
    everyPalace((p) => {
      const t = tripletOf(yunPan[p]);
      const set = new Set([yunPan[p], shanPan[p], xiangPan[p]]);
      return set.size === 3 && t.includes(shanPan[p]) && t.includes(xiangPan[p]);
    })
  ) {
    items.push({
      kind: '父母三般卦',
      scope: '全盘',
      valence: '吉',
      governs: '丁财',
      summary: '九宫运、山、向三星逐宫同属一四七／二五八／三六九 —— 父母三般卦，吉格。',
      classic: SAN_BAN_CLASSIC,
      caveats: ['三般卦之吉以「通气」论，坐向失令或峦头不配时不宜过誉。'],
      palaces: [],
    });
    derivation.push('逐宫运山向三数同组（147/258/369）→ 父母三般卦。');
  }

  // ---- 6. 入囚 ----
  const centerX = xiangPan[5];
  const centerS = shanPan[5];
  const QIU_CLASSIC = '「入囚」为沈氏玄空学通论：中宫之星当运即囚，囚则其气不出；具体原文待核';
  for (const [star, kind, gov, label] of [
    [centerX, '向星入囚', '财', '向星'],
    [centerS, '山星入囚', '丁', '山星'],
  ] as const) {
    // 当前运即该星 → 正在入囚；否则自当前运往后数，只报未来 40 年内（两运）会到的。
    const isNow = nowPeriod.period === star;
    const w = isNow
      ? { startYear: nowPeriod.startYear, endYear: nowPeriod.endYear }
      : nextPeriodWindow(nowPeriod.startYear, nowPeriod.period, star);
    const soon = !isNow && w.startYear - currentYear <= 2 * YUN_LENGTH;
    const caveats =
      kind === '向星入囚'
        ? [
            '向首或中宫见真水（河湖、水池、天井水景）者，多家论「不囚」——须实地核，本 App 不自动豁免。',
            '可议换天心（大装修重立运盘）以出囚。',
          ]
        : ['山星入囚之说，部分门派不取（待考）；坐山有实山高楼者，诸家多论减轻。'];
    if (isNow) {
      items.push({
        kind,
        scope: '全盘',
        valence: '凶',
        governs: gov,
        summary: `中宫${label}为${STAR_NAME[star]}，今入${CN_NUM[star]}运（${w.startYear}–${w.endYear}）当运被囚 —— ${kind}，主${gov === '财' ? '财气不出、生意停滞' : '人丁不旺、健康乏力'}。`,
        classic: QIU_CLASSIC,
        caveats,
        palaces: [5],
        window: w,
      });
      derivation.push(`中宫${label}${STAR_NAME[star]}；当前${nowPeriod.label}，正值其运 → ${kind}（当前）。`);
    } else if (kind === '向星入囚' && soon) {
      // 未来入囚只报向星（看房／长住规划最关心财气何时被囚）；山星入囚只在当前时报。
      items.push({
        kind,
        scope: '全盘',
        valence: '中',
        governs: gov,
        summary: `中宫向星为${STAR_NAME[star]}：此宅将于${CN_NUM[star]}运（${w.startYear}–${w.endYear}）向星入囚，届时财气受困。`,
        classic: QIU_CLASSIC,
        caveats,
        palaces: [5],
        window: w,
      });
      derivation.push(`中宫向星${STAR_NAME[star]}，自今${CN_NUM[nowPeriod.period]}运往后数，至${CN_NUM[star]}运（${w.startYear}）入囚。`);
    }
  }

  // ---- 7. 失运（宅以旧运立盘，如今已换运）----
  if (nowPeriod.startYear > chart.period.startYear) {
    const passed = Math.round((nowPeriod.startYear - chart.period.startYear) / YUN_LENGTH);
    items.push({
      kind: '失运',
      scope: '全盘',
      valence: '中',
      governs: '丁财',
      summary: `此宅以${chart.period.label}立盘，今已入${nowPeriod.label}（相隔 ${passed} 运）：原当令之${STAR_NAME[housePeriod]}已退气，盘中旺衰须按今运重看。`,
      classic: '三元九运旺衰随运更替，为玄空立论之本',
      caveats: [
        '可议「换天心」：大装修（揭顶换门、全屋翻新、长期空置后重入）后以新运重立运盘。',
        '何种程度算换天心，诸家标准不一 —— 本 App 由风水师在门派设置中自定（运盘取 建成年／入住年／换天心年）。',
      ],
      palaces: [],
    });
    derivation.push(`宅运${CN_NUM[housePeriod]}运（起 ${chart.period.startYear}）早于当前${CN_NUM[nowPeriod.period]}运（起 ${nowPeriod.startYear}）→ 失运提示。`);
  }

  if (items.length === 0) derivation.push('未见伏吟、反吟、合十、三般卦、入囚、失运诸格。');
  return { items, derivation };
}

function localFuFan(
  kind: '向首伏吟' | '向首反吟' | '坐山伏吟' | '坐山反吟',
  p: PalaceIndex,
  star: PalaceIndex,
  label: '山星' | '向星',
  gov: '丁' | '财',
  classic: string,
): GeJu {
  const fu = kind.endsWith('伏吟');
  return {
    kind,
    scope: '局部',
    valence: '凶',
    governs: gov,
    summary: `${PALACE_DIRECTION[p]}${kind.startsWith('向首') ? '向首' : '坐山'}之${label}为${STAR_NAME[star]}，${fu ? '与本宫洛书数相同 —— 伏吟' : '与本宫洛书数合十 —— 反吟'}，主${gov === '丁' ? '人丁健康' : '财禄'}${fu ? '迟滞反复' : '受冲多变'}。`,
    classic,
    caveats: ['局部伏反吟力量远轻于全盘；若该星当令，诸家多论可用（待考）。'],
    palaces: [p],
  };
}
