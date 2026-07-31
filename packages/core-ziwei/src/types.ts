/**
 * 紫微斗数类型定义。
 *
 * 核心设计与 core-bazi 一致：**资料残缺是一等公民**，但紫微的残缺规则与八字不同——
 * 八字缺时辰仍可得三柱，紫微缺时辰则连命宫都定不了。因此这里不做「降级排盘」，
 * 而是走 **定盘**：把十三个时辰的盘全部排出来作候选，交给对轨回路用真实经历筛。
 * 绝不假设一个时辰冒充真实数据。
 */

import type { BirthInput, Confidence } from '@hidefate/core-bazi';

export type { BirthInput };

/** 输入精度分级。 */
export type ZiWeiPrecision =
  /** 年月日时俱全 —— 单一命盘。 */
  | '四柱全'
  /** 年月日已知、时辰未知 —— 出十三张候选盘待定盘。 */
  | '时辰待定'
  /** 缺月或缺日 —— 紫微以农历日安星，无从起盘。 */
  | '无法起盘';

export interface ZiWeiConfidence {
  readonly level: Confidence;
  readonly label: string;
  readonly reason: string;
  /** 用于概率加权的数值折扣 0–1。 */
  readonly factor: number;
}

export const CONFIDENCE_BY_PRECISION: Record<ZiWeiPrecision, ZiWeiConfidence> = {
  四柱全: {
    level: '高',
    label: '高',
    reason: '年月日时俱全，命宫、身宫、五行局与四化均可确定。',
    factor: 1.0,
  },
  时辰待定: {
    level: '低',
    label: '低（时辰未定）',
    reason:
      '缺出生时辰，命宫与身宫无从确定。已排出十三张候选盘（含早／晚子时），' +
      '须用真实经历对轨定盘后方可作准。',
    factor: 0.3,
  },
  无法起盘: {
    level: '低',
    label: '无法起盘',
    reason: '紫微以农历月日安星，缺月或缺日则命盘不成立。八字与命卦不受影响。',
    factor: 0,
  },
};

/** 四化。 */
export type Mutagen = '禄' | '权' | '科' | '忌';

export interface ZiWeiStar {
  readonly name: string;
  /** 主星 / 吉星 / 煞星 / 杂耀 / 桃花星 / 解神 / 禄存 / 天马（原样透传 iztro）。 */
  readonly type: string;
  /** 作用范围：本命盘 / 大限盘 / 流年盘。 */
  readonly scope: string;
  /** 庙旺利陷等亮度；无亮度数据则为 null。 */
  readonly brightness: string | null;
  /** 生年四化；未化则为 null。 */
  readonly mutagen: Mutagen | null;
}

export interface ZiWeiDecadal {
  /** 大限起止虚岁 [起, 止]。 */
  readonly range: readonly [number, number];
  readonly heavenlyStem: string;
  readonly earthlyBranch: string;
}

export interface ZiWeiPalace {
  /** 宫位索引 0–11（以寅宫为 0，与 iztro 一致）。 */
  readonly index: number;
  /** 命宫、兄弟、夫妻…… */
  readonly name: string;
  readonly heavenlyStem: string;
  readonly earthlyBranch: string;
  readonly isBodyPalace: boolean;
  /** 来因宫。 */
  readonly isOriginalPalace: boolean;
  readonly majorStars: readonly ZiWeiStar[];
  readonly minorStars: readonly ZiWeiStar[];
  readonly adjectiveStars: readonly ZiWeiStar[];
  readonly changsheng12: string;
  readonly boshi12: string;
  readonly decadal: ZiWeiDecadal;
  /** 小限虚岁。 */
  readonly ages: readonly number[];
}

/** 格局。 */
export interface ZiWeiPattern {
  readonly name: string;
  readonly text: string;
  /** 该格局所影响的分析领域，id 与 EventCategory 对齐（见 docs/ROADMAP.md §3）。 */
  readonly sections: readonly string[];
}

export interface ZiWeiChart {
  readonly input: BirthInput;
  readonly precision: ZiWeiPrecision;
  readonly confidence: ZiWeiConfidence;
  /** 时辰索引 0–12；0 为早子时，12 为晚子时。 */
  readonly timeIndex: number;
  /** 时辰名，如「寅时」。 */
  readonly timeLabel: string;
  /** 时辰对应时段，如「03:00~05:00」。 */
  readonly timeRange: string;
  readonly solarDate: string;
  readonly lunarDate: string;
  /** 干支纪年日期（年 月 日 时 四柱）。 */
  readonly chineseDate: string;
  readonly zodiac: string;
  readonly sign: string;
  /** 命主。 */
  readonly soul: string;
  /** 身主。 */
  readonly body: string;
  readonly fiveElementsClass: string;
  readonly soulBranch: string;
  readonly bodyBranch: string;
  readonly palaces: readonly ZiWeiPalace[];
  readonly patterns: readonly ZiWeiPattern[];
  /** 真太阳时校正说明；未启用则为 null。 */
  readonly trueSolarTime: string | null;
  /**
   * 须由 UI 明示的保留意见 —— 跨包年界分歧、时辰边界、闰月取舍等。
   * 空数组表示无保留。**绝不静默吞掉分歧。**
   */
  readonly caveats: readonly string[];
}

/** 定盘候选集：时辰未知时的十三张盘。 */
export interface ZiWeiCandidateSet {
  readonly input: BirthInput;
  readonly precision: '时辰待定';
  readonly candidates: readonly ZiWeiChart[];
  /**
   * 按命宫地支归组 —— 十三个时辰未必产生十三个不同命宫，
   * 归组后往往只剩数种，对轨时只需分辨这几种即可定盘。
   */
  readonly groups: readonly ZiWeiCandidateGroup[];
  readonly note: string;
}

export interface ZiWeiCandidateGroup {
  /** 该组的命宫地支。 */
  readonly soulBranch: string;
  readonly fiveElementsClass: string;
  /** 落入该组的时辰索引。 */
  readonly timeIndexes: readonly number[];
  readonly timeLabels: readonly string[];
  /** 该组命宫主星，供对轨时快速分辨。 */
  readonly soulMajorStars: readonly string[];
}

/** 运限的单层（大限 / 流年 / 流月 / 流日）。 */
export interface HoroscopeLayer {
  readonly name: string;
  /** 该层所落宫位索引。 */
  readonly palaceIndex: number;
  /** 该层所落宫位在本命盘上的宫名。 */
  readonly natalPalaceName: string;
  readonly heavenlyStem: string;
  readonly earthlyBranch: string;
  readonly ganZhi: string;
  /** 该层四化星，顺序为 禄、权、科、忌。 */
  readonly mutagenStars: readonly string[];
}

export interface ZiWeiHoroscope {
  readonly year: number;
  /** 虚岁。 */
  readonly nominalAge: number;
  readonly solarDate: string;
  readonly lunarDate: string;
  readonly decadal: HoroscopeLayer;
  /** 小限。 */
  readonly age: HoroscopeLayer;
  readonly yearly: HoroscopeLayer;
}
