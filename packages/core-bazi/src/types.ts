/**
 * 八字 / 命卦 类型定义。
 *
 * 核心设计：**残缺八字是一等公民**。真实场景里，家人的出生时辰常常问不到，
 * 甚至只记得年份。本引擎按「已知到哪一柱」分级推算，并在每个结论上带出
 * 置信度，绝不用假设的时辰冒充真实数据。
 */

export type Gender = '男' | '女';

export type WuXing = '木' | '火' | '土' | '金' | '水';

/** 输入精度分级。 */
export type BaziPrecision =
  /** 仅知出生年 —— 可得年柱、生肖、命卦。 */
  | '仅年'
  /** 年 + 月 —— 可得年月两柱、月令。 */
  | '年月'
  /** 年 + 月 + 日 —— 可得三柱、日主、十神、五行力量。 */
  | '年月日'
  /** 四柱俱全。 */
  | '四柱全';

/** 置信度。 */
export type Confidence = '高' | '中等' | '偏低' | '低';

export interface ConfidenceInfo {
  readonly level: Confidence;
  readonly label: string;
  readonly reason: string;
  /** 用于概率加权的数值折扣 0–1。 */
  readonly factor: number;
}

export const CONFIDENCE_BY_PRECISION: Record<BaziPrecision, ConfidenceInfo> = {
  四柱全: { level: '高', label: '高', reason: '四柱俱全，日主与十神可完整推算。', factor: 1.0 },
  年月日: { level: '中等', label: '中等（缺时柱）', reason: '缺时柱，日主与十神成立，但子女宫、晚年运与部分神煞无法定论；采用三柱分析。', factor: 0.82 },
  年月: { level: '偏低', label: '偏低（仅年月两柱）', reason: '无日柱即无日主，十神与身强弱无从谈起；仅能以年月柱与命卦作宏观参照。', factor: 0.55 },
  仅年: { level: '低', label: '低（仅知出生年）', reason: '仅年柱可用。命卦（八宅）仍完全成立且不受影响，飞星交叉分析改以命卦为主。', factor: 0.4 },
};

export interface BirthInput {
  /** 成员 id（与 members 表对应）。 */
  readonly id?: string;
  readonly name?: string;
  readonly gender: Gender;
  /** 历法。 */
  readonly calendar?: '公历' | '农历';
  readonly year: number;
  /** 月份 1–12，缺省表示不知道。 */
  readonly month?: number;
  /** 日 1–31，缺省表示不知道。 */
  readonly day?: number;
  /** 时 0–23，缺省表示不知道时辰。 */
  readonly hour?: number;
  readonly minute?: number;
  /** 农历闰月标记。 */
  readonly isLeapMonth?: boolean;
  /** 出生地经度，用于真太阳时校正；缺省则不校正。 */
  readonly longitude?: number;
  /** 是否启用真太阳时校正（需 longitude）。 */
  readonly useTrueSolarTime?: boolean;
}

export interface CangGanInfo {
  readonly gan: string;
  readonly wuXing: WuXing;
  readonly shiShen: string | null;
}

export interface PillarData {
  /** 年 / 月 / 日 / 时。 */
  readonly position: '年柱' | '月柱' | '日柱' | '时柱';
  readonly gan: string;
  readonly zhi: string;
  readonly ganWuXing: WuXing;
  readonly zhiWuXing: WuXing;
  /** 天干十神；日柱为「日主」；无日主时为 null。 */
  readonly ganShiShen: string | null;
  readonly cangGan: readonly CangGanInfo[];
  readonly naYin: string;
  /** 十二长生。 */
  readonly diShi: string | null;
  readonly isKongWang: boolean;
}

export interface ElementStrengthResult {
  /** 五行 → 加权分。 */
  readonly raw: Readonly<Record<WuXing, number>>;
  /** 五行 → 百分比 0–100。 */
  readonly percent: Readonly<Record<WuXing, number>>;
  readonly dayMasterElement: WuXing | null;
  /** 日主在月令下的旺相休囚死。 */
  readonly dayMasterSeasonState: string | null;
  /** 同党（比劫 + 印）占比 0–100。 */
  readonly supportPercent: number | null;
  readonly verdict: '身强' | '身弱' | '中和' | '无法判定';
  /** 喜用五行（扶抑法初判）。 */
  readonly favourable: readonly WuXing[];
  /** 忌神五行。 */
  readonly unfavourable: readonly WuXing[];
  readonly note: string;
}

export interface DecadeData {
  readonly index: number;
  readonly ganZhi: string;
  readonly startAge: number;
  readonly endAge: number;
  readonly startYear: number;
  readonly endYear: number;
  readonly ganShiShen: string | null;
}

/** 命卦（八宅用）。仅需出生年 + 性别即可成立，与八字精度无关。 */
export interface MingGuaResult {
  /** 命卦洛书数 1–9（5 已按性别寄宫，故实际只会是 1,2,3,4,6,7,8,9）。 */
  readonly number: 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;
  readonly gua: '坎' | '坤' | '震' | '巽' | '乾' | '兑' | '艮' | '离';
  readonly group: '东四命' | '西四命';
  /** 立春归年后的实际用年。 */
  readonly effectiveYear: number;
  /** 若因立春调整过年份则为 true。 */
  readonly adjustedByLiChun: boolean;
  /** 五黄寄宫说明（男寄坤、女寄艮）。 */
  readonly jiGongNote: string | null;
  readonly derivation: string;
}

export interface BaziChartResult {
  readonly input: BirthInput;
  readonly precision: BaziPrecision;
  readonly confidence: ConfidenceInfo;
  /** 已成立的柱，按年月日时顺序，可能少于 4 根。 */
  readonly pillars: readonly PillarData[];
  /** 日主天干；无日柱时为 null。 */
  readonly dayMaster: string | null;
  readonly dayMasterWuXing: WuXing | null;
  readonly zodiac: string;
  readonly solarDate: string;
  readonly lunarDate: string;
  /** 真太阳时校正后的时刻（若启用）。 */
  readonly trueSolarTime: string | null;
  readonly kongWang: readonly string[];
  readonly elementStrength: ElementStrengthResult;
  readonly mingGua: MingGuaResult;
  /** 大运；缺日柱或时柱时可能为空数组。 */
  readonly decades: readonly DecadeData[];
  readonly qiYunNote: string | null;
  /** 未能推算的项目，供 UI 明示。 */
  readonly unavailable: readonly string[];
}
