/**
 * 玄空飞星排盘。
 *
 * 排盘四步（全部确定性计算，无任何随机或模型参与）：
 *   1. 运盘 —— 元运数入中顺飞九宫。
 *   2. 山盘 —— 取「坐山所在宫的运星」入中；阴阳由「该运星本宫中与坐山同元龙之山」决定。
 *   3. 向盘 —— 同理，取「向首所在宫的运星」。
 *   4. 兼向起替卦时，入中之数换成该山的替星（二十四山起星诀），阴阳仍依原山不变。
 *
 * 已用公开盘式校验（见 flyingStar.test.ts）：
 *   八运子山午向 → 双星会向（离宫 8/8）
 *   八运乾山巽向 → 旺山旺向（乾宫山 8、巽宫向 8）
 */

import {
  FLY_BACKWARD,
  FLY_FORWARD,
  PALACE_GUA,
  PALACE_INDEXES,
  STAR_NAME,
  type PalaceIndex,
} from './constants.js';
import {
  TI_XING,
  analyzeJianXiang,
  degreeToMountain,
  facingOf,
  mountainOf,
  resolveMountain,
  type JianXiangInfo,
  type Mountain,
  type MountainInput,
} from './mountains.js';
import { annualStar, monthlyStar, periodOfYear, type PeriodInfo } from './period.js';

/** 九宫数值盘：宫位洛书数 → 星数。 */
export type StarPlate = Record<PalaceIndex, PalaceIndex>;

/** 五入中时如何借宫定阴阳。不同流派做法不同，故可配置并在结论中透明标注。 */
export type CenterFiveRule =
  /** 默认：五无正位，随「运盘中宫之数」（即元运数）所属卦宫取同元龙之山。 */
  | '随运星'
  /** 五寄坤宫（西南）。 */
  | '寄坤'
  /** 五寄艮宫（东北）。 */
  | '寄艮';

export interface FlyingStarOptions {
  /** 坐山：二十四山名或 0–360 度数。 */
  readonly sitting: MountainInput;
  /** 向首：默认取坐山之冲。 */
  readonly facing?: MountainInput;
  /** 元运 1–9；不给则由 moveInYear 推算。 */
  readonly period?: PalaceIndex;
  /** 入住 / 落成年（立春年），用于推算元运。 */
  readonly moveInYear?: number;
  /** 是否起替卦。不给则依兼向阈值自动判定。 */
  readonly useTiXing?: boolean;
  /** 兼向阈值（度），默认 3°。 */
  readonly jianThreshold?: number;
  /** 五入中借宫规则，默认「随运星」。 */
  readonly centerFiveRule?: CenterFiveRule;
}

/** 单宫飞星四星。 */
export interface PalaceStars {
  readonly palace: PalaceIndex;
  /** 运星（地盘）。 */
  readonly yun: PalaceIndex;
  /** 山星（丁星，主人丁健康）。 */
  readonly shan: PalaceIndex;
  /** 向星（财星，主财禄）。 */
  readonly xiang: PalaceIndex;
}

/** 盘局格局。 */
export type BoardPattern = '旺山旺向' | '上山下水' | '双星会向' | '双星会坐' | '一般格局';

export interface FlyingStarChart {
  readonly period: PeriodInfo;
  readonly sitting: { readonly mountain: Mountain; readonly degree: number };
  readonly facing: { readonly mountain: Mountain; readonly degree: number };
  readonly jianXiang: JianXiangInfo;
  /** 实际是否起了替卦。 */
  readonly usedTiXing: boolean;
  readonly centerFiveRule: CenterFiveRule;
  readonly yunPan: StarPlate;
  readonly shanPan: StarPlate;
  readonly xiangPan: StarPlate;
  readonly palaces: Record<PalaceIndex, PalaceStars>;
  readonly pattern: BoardPattern;
  /** 排盘过程的可追溯说明，供「为何如此判断」展示。 */
  readonly derivation: readonly string[];
}

/** 某数入中，按 direction 飞布九宫。 */
export function flyFrom(centerStar: PalaceIndex, direction: '顺' | '逆'): StarPlate {
  const plate = {} as StarPlate;
  const step = direction === '顺' ? FLY_FORWARD : FLY_BACKWARD;
  let palace: PalaceIndex = 5;
  let star: PalaceIndex = centerStar;
  for (let i = 0; i < 9; i++) {
    plate[palace] = star;
    palace = step[palace];
    star = (star === 9 ? 1 : ((star + 1) as PalaceIndex));
  }
  return plate;
}

/**
 * 逆飞时星数递减。flyFrom 统一按「宫位沿飞行路线走、星数递增」实现，
 * 逆飞的正确语义是「宫位沿逆向路线走、星数仍递增」—— 两者等价，
 * 因为逆飞路线本身就是顺飞路线的反向。
 */

interface YinYangResolution {
  readonly yinYang: '阳' | '阴';
  readonly refMountain: Mountain | null;
  readonly note: string;
}

/**
 * 定阴阳：给定「入中的运星数」与「原坐山（或向首）的元龙」，
 * 取该运星本宫中同元龙之山，其阴阳即顺逆。
 */
function resolveYinYang(
  star: PalaceIndex,
  origin: Mountain,
  period: PalaceIndex,
  rule: CenterFiveRule,
): YinYangResolution {
  if (star !== 5) {
    const gua = PALACE_GUA[star];
    const m = mountainOf(gua, origin.yuan);
    return {
      yinYang: m.yinYang,
      refMountain: m,
      note: `${STAR_NAME[star]}属${gua}宫，取${gua}宫${origin.yuan}之「${m.name}」山，${m.yinYang}故${m.yinYang === '阳' ? '顺' : '逆'}飞`,
    };
  }
  // 五入中：中宫无卦无山，须借宫。
  if (rule === '寄坤') {
    const m = mountainOf('坤', origin.yuan);
    return { yinYang: m.yinYang, refMountain: m, note: `五入中无山，依「寄坤」借坤宫${origin.yuan}之「${m.name}」山（${m.yinYang}）` };
  }
  if (rule === '寄艮') {
    const m = mountainOf('艮', origin.yuan);
    return { yinYang: m.yinYang, refMountain: m, note: `五入中无山，依「寄艮」借艮宫${origin.yuan}之「${m.name}」山（${m.yinYang}）` };
  }
  // 默认：随运盘中宫之数（元运数）所属卦宫。
  if (period === 5) {
    // 五运本身中宫亦为五 —— 退而用坤宫（后天坤代中土）。
    const m = mountainOf('坤', origin.yuan);
    return { yinYang: m.yinYang, refMountain: m, note: `五运五入中，双五无依，退取坤宫${origin.yuan}之「${m.name}」山（${m.yinYang}）` };
  }
  const gua = PALACE_GUA[period];
  const m = mountainOf(gua, origin.yuan);
  return {
    yinYang: m.yinYang,
    refMountain: m,
    note: `五入中无山，依「随运星」借中宫运星${STAR_NAME[period]}之${gua}宫，取${origin.yuan}之「${m.name}」山（${m.yinYang}）`,
  };
}

/** 起替卦时的入中之数：查该参照山的替星。 */
function tiXingOf(m: Mountain): PalaceIndex {
  const t = TI_XING[m.name];
  if (!t) throw new Error(`「${m.name}」山无替星（起星诀表缺失）`);
  return t;
}

/** 排一张完整飞星盘。 */
export function buildFlyingStarChart(opts: FlyingStarOptions): FlyingStarChart {
  const sit = resolveMountain(opts.sitting);
  const fac = opts.facing != null && opts.facing !== ''
    ? resolveMountain(opts.facing)
    : facingOf(opts.sitting);

  if (opts.period == null && opts.moveInYear == null) {
    throw new Error('须提供元运（period）或入住年（moveInYear）之一');
  }
  const periodInfo: PeriodInfo = opts.period != null
    ? { ...periodOfYear(YUN_START_OF(opts.period)), period: opts.period }
    : periodOfYear(opts.moveInYear!);

  const rule = opts.centerFiveRule ?? '随运星';
  const jian = analyzeJianXiang(opts.sitting, opts.jianThreshold ?? 3);
  const useTi = opts.useTiXing ?? jian.isJian;

  const yunPan = flyFrom(periodInfo.period, '顺');

  const derivation: string[] = [
    `元运：${periodInfo.label}，${STAR_NAME[periodInfo.period]}入中顺飞得运盘。`,
    `坐山：${sit.mountain.name}（${sit.degree.toFixed(1)}°，${sit.mountain.gua}宫${sit.mountain.yuan}${sit.mountain.yinYang}）；向首：${fac.mountain.name}（${fac.degree.toFixed(1)}°）。`,
    jian.label,
  ];

  // 山盘
  const sitYunStar = yunPan[sit.mountain.palace];
  const sitYY = resolveYinYang(sitYunStar, sit.mountain, periodInfo.period, rule);
  const shanCenter = useTi && sitYY.refMountain ? tiXingOf(sitYY.refMountain) : sitYunStar;
  const shanPan = flyFrom(shanCenter, sitYY.yinYang === '阳' ? '顺' : '逆');
  derivation.push(
    `山盘：坐山居${PALACE_GUA[sit.mountain.palace]}宫，运盘该宫为${STAR_NAME[sitYunStar]}；${sitYY.note}；` +
      (useTi && sitYY.refMountain
        ? `兼向起替，以「${sitYY.refMountain.name}」之替星${STAR_NAME[shanCenter]}入中${sitYY.yinYang === '阳' ? '顺' : '逆'}飞。`
        : `以${STAR_NAME[shanCenter]}入中${sitYY.yinYang === '阳' ? '顺' : '逆'}飞。`),
  );

  // 向盘
  const facYunStar = yunPan[fac.mountain.palace];
  const facYY = resolveYinYang(facYunStar, fac.mountain, periodInfo.period, rule);
  const xiangCenter = useTi && facYY.refMountain ? tiXingOf(facYY.refMountain) : facYunStar;
  const xiangPan = flyFrom(xiangCenter, facYY.yinYang === '阳' ? '顺' : '逆');
  derivation.push(
    `向盘：向首居${PALACE_GUA[fac.mountain.palace]}宫，运盘该宫为${STAR_NAME[facYunStar]}；${facYY.note}；` +
      (useTi && facYY.refMountain
        ? `兼向起替，以「${facYY.refMountain.name}」之替星${STAR_NAME[xiangCenter]}入中${facYY.yinYang === '阳' ? '顺' : '逆'}飞。`
        : `以${STAR_NAME[xiangCenter]}入中${facYY.yinYang === '阳' ? '顺' : '逆'}飞。`),
  );

  const palaces = {} as Record<PalaceIndex, PalaceStars>;
  for (const p of PALACE_INDEXES) {
    palaces[p] = { palace: p, yun: yunPan[p], shan: shanPan[p], xiang: xiangPan[p] };
  }

  const pattern = judgePattern(
    palaces,
    sit.mountain.palace,
    fac.mountain.palace,
    periodInfo.period,
  );
  derivation.push(`格局：${pattern}。`);

  return {
    period: periodInfo,
    sitting: { mountain: sit.mountain, degree: sit.degree },
    facing: { mountain: fac.mountain, degree: fac.degree },
    jianXiang: jian,
    usedTiXing: useTi,
    centerFiveRule: rule,
    yunPan,
    shanPan,
    xiangPan,
    palaces,
    pattern,
    derivation,
  };
}

/** 由元运数反推该运起始年（仅用于补全 PeriodInfo 的展示字段）。 */
function YUN_START_OF(period: PalaceIndex): number {
  // 取距今最近的一轮：九运 = 2024–2043。
  const base = 2024 - (9 - 1) * 20; // 一运 = 1864
  return base + (period - 1) * 20;
}

/** 判断盘局格局。 */
export function judgePattern(
  palaces: Record<PalaceIndex, PalaceStars>,
  sitPalace: PalaceIndex,
  facPalace: PalaceIndex,
  period: PalaceIndex,
): BoardPattern {
  const s = palaces[sitPalace];
  const f = palaces[facPalace];
  if (s.shan === period && f.xiang === period) return '旺山旺向';
  if (s.xiang === period && f.shan === period) return '上山下水';
  if (f.shan === period && f.xiang === period) return '双星会向';
  if (s.shan === period && s.xiang === period) return '双星会坐';
  return '一般格局';
}

/** 流年飞星盘：年星入中顺飞。 */
export function annualPlate(year: number): StarPlate {
  return flyFrom(annualStar(year), '顺');
}

/** 流月飞星盘：月星入中顺飞。 */
export function monthlyPlate(year: number, monthIndex: number): StarPlate {
  return flyFrom(monthlyStar(year, monthIndex), '顺');
}

/** 便捷：由度数直接得坐山山名。 */
export function sittingNameOfDegree(deg: number): string {
  return degreeToMountain(deg).name;
}
