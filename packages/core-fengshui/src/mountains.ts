/**
 * 二十四山 —— 玄空飞星与八宅共用的坐向基准。
 *
 * 罗盘环与 core-qimen/vendor 的 shanxiang.js 完全同环（子山中心 = 正北 0°，
 * 每山 15°），故「坐山」这一个输入可同时驱动飞星、八宅、山向奇门三派，
 * 不会出现两套罗盘互相打架。
 *
 * 每山三属性：
 *   - 卦宫（八卦所属，决定八宅宅卦与飞星入中取数）
 *   - 元龙（地元 / 天元 / 人元，决定山盘向盘取哪一山定阴阳）
 *   - 阴阳（决定飞星顺飞或逆飞）
 */

import { GUA_PALACE, norm360, type GuaName, type PalaceIndex } from './constants.js';

/** 三元龙。 */
export type YuanLong = '地元' | '天元' | '人元';

export interface Mountain {
  /** 山名，如「子」「艮」「丙」。 */
  readonly name: string;
  /** 中心方位角（正北 0°，顺时针）。 */
  readonly center: number;
  /** 所属卦宫。 */
  readonly gua: GuaName;
  /** 所属宫位洛书数。 */
  readonly palace: PalaceIndex;
  /** 三元龙。 */
  readonly yuan: YuanLong;
  /** 阴阳（决定顺逆飞）。 */
  readonly yinYang: '阳' | '阴';
}

/**
 * 二十四山，按罗盘顺时针自壬山（337.5°–352.5°）起排。
 * 排列顺序即传统「壬子癸 丑艮寅 甲卯乙 辰巽巳 丙午丁 未坤申 庚酉辛 戌乾亥」。
 */
export const MOUNTAINS: readonly Mountain[] = [
  { name: '壬', center: 345, gua: '坎', palace: 1, yuan: '地元', yinYang: '阳' },
  { name: '子', center: 0, gua: '坎', palace: 1, yuan: '天元', yinYang: '阴' },
  { name: '癸', center: 15, gua: '坎', palace: 1, yuan: '人元', yinYang: '阴' },
  { name: '丑', center: 30, gua: '艮', palace: 8, yuan: '地元', yinYang: '阴' },
  { name: '艮', center: 45, gua: '艮', palace: 8, yuan: '天元', yinYang: '阳' },
  { name: '寅', center: 60, gua: '艮', palace: 8, yuan: '人元', yinYang: '阳' },
  { name: '甲', center: 75, gua: '震', palace: 3, yuan: '地元', yinYang: '阳' },
  { name: '卯', center: 90, gua: '震', palace: 3, yuan: '天元', yinYang: '阴' },
  { name: '乙', center: 105, gua: '震', palace: 3, yuan: '人元', yinYang: '阴' },
  { name: '辰', center: 120, gua: '巽', palace: 4, yuan: '地元', yinYang: '阴' },
  { name: '巽', center: 135, gua: '巽', palace: 4, yuan: '天元', yinYang: '阳' },
  { name: '巳', center: 150, gua: '巽', palace: 4, yuan: '人元', yinYang: '阳' },
  { name: '丙', center: 165, gua: '离', palace: 9, yuan: '地元', yinYang: '阳' },
  { name: '午', center: 180, gua: '离', palace: 9, yuan: '天元', yinYang: '阴' },
  { name: '丁', center: 195, gua: '离', palace: 9, yuan: '人元', yinYang: '阴' },
  { name: '未', center: 210, gua: '坤', palace: 2, yuan: '地元', yinYang: '阴' },
  { name: '坤', center: 225, gua: '坤', palace: 2, yuan: '天元', yinYang: '阳' },
  { name: '申', center: 240, gua: '坤', palace: 2, yuan: '人元', yinYang: '阳' },
  { name: '庚', center: 255, gua: '兑', palace: 7, yuan: '地元', yinYang: '阳' },
  { name: '酉', center: 270, gua: '兑', palace: 7, yuan: '天元', yinYang: '阴' },
  { name: '辛', center: 285, gua: '兑', palace: 7, yuan: '人元', yinYang: '阴' },
  { name: '戌', center: 300, gua: '乾', palace: 6, yuan: '地元', yinYang: '阴' },
  { name: '乾', center: 315, gua: '乾', palace: 6, yuan: '天元', yinYang: '阳' },
  { name: '亥', center: 330, gua: '乾', palace: 6, yuan: '人元', yinYang: '阳' },
] as const;

/** 山名 → Mountain。 */
const BY_NAME = new Map<string, Mountain>(MOUNTAINS.map((m) => [m.name, m]));

/** 卦宫 + 元龙 → 该宫此元之山。飞星定阴阳的核心查表。 */
const BY_GUA_YUAN = new Map<string, Mountain>(
  MOUNTAINS.map((m) => [`${m.gua}|${m.yuan}`, m]),
);

/**
 * 二十四山起星诀（替卦 / 兼向用）：
 *   子癸并甲申，贪狼一路行      → 1
 *   壬卯乙未坤，五位为巨门      → 2
 *   乾亥辰巽巳，连戌武曲名      → 6
 *   酉辛丑艮丙，天星说破军      → 7
 *   寅午庚丁上，右弼四星临      → 9
 * 共 24 山，无遗漏无重复。
 */
export const TI_XING: Record<string, PalaceIndex> = {
  子: 1, 癸: 1, 甲: 1, 申: 1,
  壬: 2, 卯: 2, 乙: 2, 未: 2, 坤: 2,
  乾: 6, 亥: 6, 辰: 6, 巽: 6, 巳: 6, 戌: 6,
  酉: 7, 辛: 7, 丑: 7, 艮: 7, 丙: 7,
  寅: 9, 午: 9, 庚: 9, 丁: 9,
};

/** 方位角 → 所属山（就近归山；每山中心为 15 的倍数）。 */
export function degreeToMountain(deg: number): Mountain {
  const idx = Math.round(norm360(deg) / 15) % 24;
  // MOUNTAINS 自壬(345°)起，索引 0 对应 345°，故需换算：round(deg/15) 得到的是
  // 以子(0°)为 0 的序号，壬为 23。
  const zi0 = idx; // 0=子, 1=癸, ... 23=壬
  const fromRen = (zi0 + 1) % 24; // 壬 = 0
  return MOUNTAINS[fromRen]!;
}

/** 山名 → Mountain，未知山名抛错。 */
export function mountainByName(name: string): Mountain {
  const m = BY_NAME.get(name.trim().charAt(0));
  if (!m) throw new Error(`未知的二十四山名：「${name}」`);
  return m;
}

/** 卦宫 + 元龙 → 山。用于飞星「取同元龙之山定阴阳」。 */
export function mountainOf(gua: GuaName, yuan: YuanLong): Mountain {
  const m = BY_GUA_YUAN.get(`${gua}|${yuan}`);
  if (!m) throw new Error(`${gua}宫无${yuan}之山（中宫无山，应先做寄宫处理）`);
  return m;
}

/** 坐山/向首输入：山名字符串（可带度数）或 0–360 度数。 */
export type MountainInput = string | number;

export interface ResolvedMountain {
  readonly mountain: Mountain;
  /** 实测度数；仅给山名时取该山中心度。 */
  readonly degree: number;
  /** 是否由用户提供了精确度数。 */
  readonly hasDegree: boolean;
  /** 相对本山中心的偏移，∈ [-7.5, 7.5]，正值为顺时针偏。 */
  readonly offset: number;
}

/** 解析坐山输入。数字按度数处理，字符串按山名处理（纯数字字符串仍按度数）。 */
export function resolveMountain(input: MountainInput): ResolvedMountain {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const m = degreeToMountain(input);
    const degree = norm360(input);
    return { mountain: m, degree, hasDegree: true, offset: signedOffset(degree, m.center) };
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return resolveMountain(parseFloat(s));
    const m = mountainByName(s);
    return { mountain: m, degree: m.center, hasDegree: false, offset: 0 };
  }
  throw new Error(`无法识别的坐山/向首输入：${String(input)}（请用二十四山名如「子」或 0–360 度数）`);
}

/** 就近有符号偏移 ∈ [-180, 180)。 */
function signedOffset(degree: number, center: number): number {
  return ((norm360(degree) - center + 540) % 360) - 180;
}

/** 向首 = 坐山之冲（+180°）。 */
export function facingOf(sitting: MountainInput): ResolvedMountain {
  const r = resolveMountain(sitting);
  return resolveMountain(norm360(r.degree + 180));
}

/** 坐山所在宫 = 八宅之宅卦宫。 */
export function sittingPalace(sitting: MountainInput): PalaceIndex {
  return resolveMountain(sitting).mountain.palace;
}

/** 坐山对宫 = 向首所在宫。 */
export function facingPalace(sitting: MountainInput): PalaceIndex {
  return facingOf(sitting).mountain.palace;
}

/** 卦名 → 洛书数（薄封装，便于外部只 import 本模块）。 */
export function guaToPalace(gua: GuaName): PalaceIndex {
  return GUA_PALACE[gua];
}

export interface JianXiangInfo {
  /** 是否兼向（偏离本山中心超过阈值）。 */
  readonly isJian: boolean;
  /** 偏移度数（有符号）。 */
  readonly offset: number;
  /** 兼向所偏向的邻山山名；非兼向时为 null。 */
  readonly towards: string | null;
  /** 人读描述，如「坐子兼壬 3.5°」。 */
  readonly label: string;
}

/**
 * 兼向判定。
 *
 * 每山 15°，取中间「正线」区间；偏出阈值即为兼向，兼向须起替卦（替星）。
 * 传统说法不一：常见为「兼过三度用替卦」，亦有取每山中九度为下卦者（即 ±4.5°）。
 * 本实现默认阈值 3°，可由 threshold 覆盖，并在结论中透明标注所用阈值。
 */
export function analyzeJianXiang(input: MountainInput, threshold = 3): JianXiangInfo {
  const r = resolveMountain(input);
  const off = r.offset;
  if (!r.hasDegree || Math.abs(off) <= threshold) {
    return {
      isJian: false,
      offset: off,
      towards: null,
      label: `坐${r.mountain.name}山（下卦正向，偏${off.toFixed(1)}°，未过${threshold}°）`,
    };
  }
  const neighbour = degreeToMountain(r.mountain.center + (off > 0 ? 15 : -15));
  return {
    isJian: true,
    offset: off,
    towards: neighbour.name,
    label: `坐${r.mountain.name}兼${neighbour.name} ${Math.abs(off).toFixed(1)}°（过${threshold}°，起替卦）`,
  };
}
