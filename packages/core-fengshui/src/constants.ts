/**
 * 玄空飞星 / 八宅 共用常量。
 *
 * 全部以「洛书数」1–9 作为宫位主键（PalaceIndex）：
 *   4 巽 · 9 离 · 2 坤
 *   3 震 · 5 中 · 7 兑
 *   8 艮 · 1 坎 · 6 乾
 *
 * 方位一律用「实地方位」（正北 = 0°，顺时针递增），不使用「上南下北」的古图向。
 * 前端渲染九宫格时再做一次「上北下南」的排布映射（见 GRID_LAYOUT）。
 */

/** 洛书宫位序号 1–9，5 为中宫。 */
export type PalaceIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const PALACE_INDEXES: readonly PalaceIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** 八卦名（中宫无卦，记为「中」）。 */
export type GuaName = '坎' | '坤' | '震' | '巽' | '中' | '乾' | '兑' | '艮' | '离';

/** 五行。 */
export type WuXing = '木' | '火' | '土' | '金' | '水';

/** 洛书数 → 卦名。 */
export const PALACE_GUA: Record<PalaceIndex, GuaName> = {
  1: '坎',
  2: '坤',
  3: '震',
  4: '巽',
  5: '中',
  6: '乾',
  7: '兑',
  8: '艮',
  9: '离',
};

/** 卦名 → 洛书数（中宫 = 5）。 */
export const GUA_PALACE: Record<GuaName, PalaceIndex> = {
  坎: 1,
  坤: 2,
  震: 3,
  巽: 4,
  中: 5,
  乾: 6,
  兑: 7,
  艮: 8,
  离: 9,
};

/** 洛书数 → 八方名称（中宫为「中宫」）。 */
export const PALACE_DIRECTION: Record<PalaceIndex, string> = {
  1: '正北',
  2: '西南',
  3: '正东',
  4: '东南',
  5: '中宫',
  6: '西北',
  7: '正西',
  8: '东北',
  9: '正南',
};

/** 洛书数 → 该宫中心方位角（正北 0°，顺时针）。中宫无方位角，记 null。 */
export const PALACE_AZIMUTH: Record<PalaceIndex, number | null> = {
  1: 0,
  2: 225,
  3: 90,
  4: 135,
  5: null,
  6: 315,
  7: 270,
  8: 45,
  9: 180,
};

/** 洛书数 → 本宫五行。 */
export const PALACE_WUXING: Record<PalaceIndex, WuXing> = {
  1: '水',
  2: '土',
  3: '木',
  4: '木',
  5: '土',
  6: '金',
  7: '金',
  8: '土',
  9: '火',
};

/** 九星（紫白）数 → 五行。与宫位五行同表，但语义不同，单列以免误用。 */
export const STAR_WUXING: Record<PalaceIndex, WuXing> = {
  1: '水',
  2: '土',
  3: '木',
  4: '木',
  5: '土',
  6: '金',
  7: '金',
  8: '土',
  9: '火',
};

/** 九星紫白名。 */
export const STAR_NAME: Record<PalaceIndex, string> = {
  1: '一白',
  2: '二黑',
  3: '三碧',
  4: '四绿',
  5: '五黄',
  6: '六白',
  7: '七赤',
  8: '八白',
  9: '九紫',
};

/** 九星别名（贪狼九星系统）。 */
export const STAR_ALIAS: Record<PalaceIndex, string> = {
  1: '贪狼',
  2: '巨门',
  3: '禄存',
  4: '文曲',
  5: '廉贞',
  6: '武曲',
  7: '破军',
  8: '左辅',
  9: '右弼',
};

/**
 * 洛书顺飞路线：中 5 → 乾 6 → 兑 7 → 艮 8 → 离 9 → 坎 1 → 坤 2 → 震 3 → 巽 4 → 回中。
 * FLY_FORWARD[p] = 顺飞时 p 的下一宫。逆飞取其反向。
 */
export const FLY_FORWARD: Record<PalaceIndex, PalaceIndex> = {
  5: 6,
  6: 7,
  7: 8,
  8: 9,
  9: 1,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
};

export const FLY_BACKWARD: Record<PalaceIndex, PalaceIndex> = {
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  1: 9,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
};

/** 五行相生：key 生 value。 */
export const GENERATES: Record<WuXing, WuXing> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木',
};

/** 五行相克：key 克 value。 */
export const CONTROLS: Record<WuXing, WuXing> = {
  木: '土',
  土: '水',
  水: '火',
  火: '金',
  金: '木',
};

/** 五行泄化：key 被 value 泄（即 value 生 key 的反向 —— 用于化解选材）。 */
export const DRAINED_BY: Record<WuXing, WuXing> = {
  木: '火',
  火: '土',
  土: '金',
  金: '水',
  水: '木',
};

export type WuXingRelation = '同' | '生我' | '我生' | '我克' | '克我';

/** 以 subject 为主体，判断 subject 与 object 的五行关系。 */
export function wuXingRelation(subject: WuXing, object: WuXing): WuXingRelation {
  if (subject === object) return '同';
  if (GENERATES[object] === subject) return '生我';
  if (GENERATES[subject] === object) return '我生';
  if (CONTROLS[subject] === object) return '我克';
  return '克我';
}

/**
 * 九宫格渲染排布（上北下南、左西右东，与实际罗盘一致）。
 * 行优先，3×3。
 */
export const GRID_LAYOUT: readonly PalaceIndex[] = [
  6, 1, 8, // 西北 · 正北 · 东北
  7, 5, 3, // 正西 · 中宫 · 正东
  2, 9, 4, // 西南 · 正南 · 东南
] as const;

/** 八方宫位（不含中宫），按洛书数升序。 */
export const OUTER_PALACES: readonly PalaceIndex[] = [1, 2, 3, 4, 6, 7, 8, 9] as const;

/** 判断是否为中宫。 */
export function isCenter(p: PalaceIndex): boolean {
  return p === 5;
}

/** 把任意角度归一化到 [0, 360)。 */
export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 方位角 → 所属宫位（中宫不可达）。每宫 45°，坎宫 337.5°–22.5°。 */
export function azimuthToPalace(deg: number): PalaceIndex {
  const d = norm360(deg);
  const idx = Math.floor(norm360(d + 22.5) / 45) % 8;
  // idx 0 起于坎（正北），顺时针：坎 艮 震 巽 离 坤 兑 乾
  const ring: PalaceIndex[] = [1, 8, 3, 4, 9, 2, 7, 6];
  return ring[idx]!;
}
