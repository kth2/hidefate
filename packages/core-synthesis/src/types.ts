/**
 * 三派合参层的公共类型。
 *
 * 设计原则：**每一个结论都必须能回答三个问题** ——
 *   1. 哪几派支持它？（lineage）
 *   2. 有多确定？（confidence）
 *   3. 依据的古法原文/原理是什么？（principle）
 * 因此 Finding 是本层最基本的单元，任何断语都必须包装成 Finding 才能对外输出。
 */

import type { BaziChartResult, MingGuaResult } from '@hidefate/core-bazi';
import type {
  BuildingType,
  FlyingStarChart,
  HouseBaZhai,
  PalaceIndex,
  PropertyProfile,
  RiskDomain,
  RoomKind,
  RoomPlacement,
  YouNianStar,
} from '@hidefate/core-fengshui';
import type { ShanXiangResult } from '@hidefate/core-qimen';

/** 参与合参的门派。 */
export type School = '玄空飞星' | '八宅' | '山向奇门' | '八字命理' | '形峦缺角';

/** 结论置信度。 */
export type ConfidenceLevel = '高' | '中' | '低';

/** 单条可追溯的断语。 */
export interface Finding {
  /** 支持此结论的门派（≥2 派同证会提升置信度）。 */
  readonly schools: readonly School[];
  readonly confidence: ConfidenceLevel;
  /** 一句话结论。 */
  readonly statement: string;
  /** 所依据的古法原理或原文。 */
  readonly principle: string;
  /** 影响强度 -1（大凶）… +1（大吉）。 */
  readonly impact: number;
  readonly domains: readonly RiskDomain[];
}

/** 化解建议，带优先级与可执行细节。 */
export interface Cure {
  /** 1 = 最优先。 */
  readonly priority: number;
  /** 针对哪一宫。 */
  readonly palace: PalaceIndex;
  readonly direction: string;
  /** 针对哪一间房（若可定位）。 */
  readonly room: string | null;
  readonly action: string;
  /** 为何这样化解（五行原理）。 */
  readonly rationale: string;
  /** 明确的禁忌 —— 用错反而助凶。 */
  readonly avoid: readonly string[];
  readonly domains: readonly RiskDomain[];
  /** 紧急度：'立即' | '本年内' | '可从容安排'。 */
  readonly urgency: '立即' | '本年内' | '可从容安排';
}

/** 单宫的三派合参评估。 */
export interface PalaceAssessment {
  readonly palace: PalaceIndex;
  readonly direction: string;
  /** 该宫的房间（可能多间）。 */
  readonly rooms: readonly RoomPlacement[];
  /** 飞星四星。 */
  readonly stars: {
    readonly yun: PalaceIndex;
    readonly shan: PalaceIndex;
    readonly xiang: PalaceIndex;
    readonly annual: PalaceIndex;
    readonly monthly: PalaceIndex | null;
  };
  /** 山向组合断语名，如「二五交加」。 */
  readonly combinationName: string;
  /** 宅之八宅星。中宫为 null。 */
  readonly baZhaiStar: YouNianStar | null;
  /** 奇门叠加（未启用则 null）。 */
  readonly qiMen: {
    readonly xing: string;
    readonly men: string;
    readonly shen: string;
    readonly score: number;
    readonly verdict: string;
  } | null;
  /** 缺角。 */
  readonly missing: { severity: number; summary: string } | null;
  /** 综合吉凶 -1…+1。 */
  readonly score: number;
  /** 风险等级。 */
  readonly riskLevel: RiskLevel;
  readonly findings: readonly Finding[];
  readonly cures: readonly Cure[];
}

export type RiskLevel = '安全' | '留意' | '警戒' | '高危' | '紧急';

export const RISK_ORDER: readonly RiskLevel[] = ['安全', '留意', '警戒', '高危', '紧急'] as const;

/** 由综合分得风险等级。 */
export function riskLevelOf(score: number): RiskLevel {
  if (score >= 0.25) return '安全';
  if (score >= -0.1) return '留意';
  if (score >= -0.4) return '警戒';
  if (score >= -0.7) return '高危';
  return '紧急';
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  安全: '#2E7D32',
  留意: '#9E9D24',
  警戒: '#EF6C00',
  高危: '#D84315',
  紧急: '#B71C1C',
};

/** 成员。 */
export interface Member {
  readonly id: string;
  readonly name: string;
  readonly relation?: string;
  readonly chart: BaziChartResult;
  readonly mingGua: MingGuaResult;
  /** 常用房间 id（睡卧/办公），用于个人风险定位。 */
  readonly primaryRoomIds?: readonly string[];
}

/** 一条概率预测。 */
export interface Prediction {
  readonly id: string;
  readonly domain: RiskDomain;
  /** 概率 0–1（已做上下限收敛，绝不输出 0 或 1）。 */
  readonly probability: number;
  readonly riskLevel: RiskLevel;
  readonly year: number;
  readonly palace: PalaceIndex;
  readonly direction: string;
  readonly room: string | null;
  readonly roomKind: RoomKind | null;
  /** 涉及的成员 id；空数组表示全家。 */
  readonly memberIds: readonly string[];
  readonly headline: string;
  readonly findings: readonly Finding[];
  readonly cures: readonly Cure[];
  readonly confidence: ConfidenceLevel;
  /** 概率是怎么算出来的 —— 逐项加权明细，完全透明。 */
  readonly breakdown: readonly { factor: string; contribution: number; note: string }[];
}

/** 合参输入。 */
export interface AnalysisInput {
  readonly profile: PropertyProfile;
  readonly members: readonly Member[];
  /** 分析年（立春年）。 */
  readonly year: number;
  /** 分析月（节气月序 1–12），给出则加入流月层。 */
  readonly monthIndex?: number;
  /** 已应用的化解（会降低对应风险）。 */
  readonly appliedCures?: readonly AppliedCure[];
  /** 山向奇门盘；未启用或未载入则不传。 */
  readonly qiMen?: ShanXiangResult | null;
}

/** 已实施的化解记录。 */
export interface AppliedCure {
  readonly id: string;
  readonly palace: PalaceIndex;
  /** 化解物五行。 */
  readonly wuXing: '木' | '火' | '土' | '金' | '水';
  readonly item: string;
  /** 施用日期（ISO 字符串）。 */
  readonly appliedOn: string;
  /** 生效起始年；省略则取 appliedOn 的年份。时间轴据此决定化解从哪一年开始减险。 */
  readonly effectiveFromYear?: number;
  /** 针对的风险维度；空则通用。 */
  readonly domains?: readonly RiskDomain[];
  /** 用户回馈：是否有改善。 */
  readonly effectiveness?: '明显改善' | '略有改善' | '无变化' | '反而更差' | '未评价';
  readonly note?: string;
}

/** 合参完整结果。 */
export interface SynthesisResult {
  readonly year: number;
  readonly profile: PropertyProfile;
  readonly buildingType: BuildingType;
  readonly flyingStar: FlyingStarChart;
  readonly baZhai: HouseBaZhai;
  readonly qiMenEnabled: boolean;
  readonly palaces: Record<PalaceIndex, PalaceAssessment>;
  readonly predictions: readonly Prediction[];
  /** 全屋综合分 -1…+1。 */
  readonly overallScore: number;
  readonly overallRisk: RiskLevel;
  /** 按优先级排好的化解清单（已去重合并）。 */
  readonly prioritisedCures: readonly Cure[];
  /** 整体置信度与其成因。 */
  readonly confidence: { level: ConfidenceLevel; reasons: readonly string[] };
  readonly summary: string;
}
