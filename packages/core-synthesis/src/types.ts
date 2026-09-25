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
  CureIntent,
} from '@hidefate/core-fengshui';
import type { ShanXiangResult } from '@hidefate/core-qimen';
import type { RelativeLevel } from './relative.js';

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
  /**
   * 用意：化凶（压/泄凶气）、催吉（加强吉应）、维持（无需布局）。
   * 风险预测与预警只能挂「化凶」—— 报凶却教人催吉，是最让人摸不着头脑的矛盾。
   */
  readonly intent: CureIntent;
  /** 针对哪位成员（个人化解，如床头朝向）；缺省为针对此宫。 */
  readonly memberId?: string;
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
  /**
   * 受影响的成员 id（按受影响程度从高到低）；空数组表示此处未指定使用者、按宅论，不落到具体的人。
   */
  readonly memberIds: readonly string[];
  /** 每位受影响成员各自的概率与个人因素 —— 同一处房间对不同的人轻重不同。 */
  readonly perMember: readonly MemberExposure[];
  /** 显示用的维度名：受影响者都是孩子时，「事业」显示为「学业」。 */
  readonly domainLabel: string;
  /** 受影响最深者（无人时按宅论）比平常高还是低。 */
  readonly relative: RelativeLevel;
  /** 与 relative 对应的「平常」概率。 */
  readonly neutral: number;
  readonly headline: string;
  readonly findings: readonly Finding[];
  readonly cures: readonly Cure[];
  readonly confidence: ConfidenceLevel;
  /** 概率是怎么算出来的 —— 逐项加权明细，完全透明。 */
  readonly breakdown: readonly { factor: string; contribution: number; note: string }[];
}

/** 某位成员在某条预测上的个人结果。 */
export interface MemberExposure {
  readonly memberId: string;
  readonly name: string;
  readonly probability: number;
  /** 受此处影响的程度 0–1：自己的房 1、共用 0.6、少停留 0.25。 */
  readonly exposure: number;
  /** 为何受影响：「睡在这里」「全家共用」等。 */
  readonly via: string;
  /** 个人因素（命卦、八字）的加权明细。 */
  readonly breakdown: readonly { factor: string; contribution: number; note: string }[];
  /** 人生阶段：儿童／少年／成人／长者。 */
  readonly stage: '儿童' | '少年' | '成人' | '长者';
  /** 此维度对此人的叫法（孩子的「事业」是「学业」）。 */
  readonly domainLabel: string;
  /** 对此人具体会是什么样的事。 */
  readonly reading: string;
  /** 此宫恰为此人的六亲之宫时，其六亲称谓（如「长子」）。 */
  readonly liuQin: string | null;
  /** 「平常」：同一个人住在吉凶平和的位置时的概率。见 relative.ts。 */
  readonly neutral: number;
  /** 比平常高还是低。 */
  readonly relative: RelativeLevel;
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
