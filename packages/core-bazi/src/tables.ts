/** 干支基础表。全部为不变常量，供五行力量与十神推算使用。 */

import type { WuXing } from './types.js';

export const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

export const GAN_WUXING: Record<string, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

/** 天干阴阳。 */
export const GAN_YINYANG: Record<string, '阳' | '阴'> = {
  甲: '阳', 乙: '阴', 丙: '阳', 丁: '阴', 戊: '阳',
  己: '阴', 庚: '阳', 辛: '阴', 壬: '阳', 癸: '阴',
};

export const ZHI_WUXING: Record<string, WuXing> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

/** 生肖。 */
export const ZHI_ZODIAC: Record<string, string> = {
  子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇',
  午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪',
};

/** 地支藏干，顺序为 本气 → 中气 → 余气。 */
export const CANG_GAN: Record<string, readonly string[]> = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
};

/** 五行相生：key 生 value。 */
export const GENERATES: Record<WuXing, WuXing> = {
  木: '火', 火: '土', 土: '金', 金: '水', 水: '木',
};

/** 五行相克：key 克 value。 */
export const CONTROLS: Record<WuXing, WuXing> = {
  木: '土', 土: '水', 水: '火', 火: '金', 金: '木',
};

/** 生我者。 */
export function generatedBy(wx: WuXing): WuXing {
  return (Object.keys(GENERATES) as WuXing[]).find((k) => GENERATES[k] === wx)!;
}

/** 克我者。 */
export function controlledBy(wx: WuXing): WuXing {
  return (Object.keys(CONTROLS) as WuXing[]).find((k) => CONTROLS[k] === wx)!;
}

export const ALL_WUXING: readonly WuXing[] = ['木', '火', '土', '金', '水'] as const;

/**
 * 十神：以日主天干为主体，判断目标天干的十神。
 *
 *   同我   同阴阳 → 比肩   异阴阳 → 劫财
 *   我生   同阴阳 → 食神   异阴阳 → 伤官
 *   我克   同阴阳 → 偏财   异阴阳 → 正财
 *   克我   同阴阳 → 七杀   异阴阳 → 正官
 *   生我   同阴阳 → 偏印   异阴阳 → 正印
 */
export function shiShen(dayGan: string, targetGan: string): string {
  const dw = GAN_WUXING[dayGan];
  const tw = GAN_WUXING[targetGan];
  if (!dw || !tw) throw new Error(`未知天干：${dayGan} / ${targetGan}`);
  const same = GAN_YINYANG[dayGan] === GAN_YINYANG[targetGan];
  if (dw === tw) return same ? '比肩' : '劫财';
  if (GENERATES[dw] === tw) return same ? '食神' : '伤官';
  if (CONTROLS[dw] === tw) return same ? '偏财' : '正财';
  if (CONTROLS[tw] === dw) return same ? '七杀' : '正官';
  return same ? '偏印' : '正印';
}

/** 十神 → 所属类别，用于喜忌与风险归类。 */
export const SHI_SHEN_GROUP: Record<string, '比劫' | '食伤' | '财星' | '官杀' | '印星'> = {
  比肩: '比劫', 劫财: '比劫',
  食神: '食伤', 伤官: '食伤',
  正财: '财星', 偏财: '财星',
  正官: '官杀', 七杀: '官杀',
  正印: '印星', 偏印: '印星',
};
