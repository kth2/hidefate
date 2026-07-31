/**
 * 象意字典类型定义。
 *
 * ## 这一层要解决什么
 *
 * 七杀在疾厄，古法给的是一串候选象：开刀、竞争、官非、性格刚烈、军警武职。
 * **经典没错，但对具体这个人只有其中一两条会显化。** 用户填入真实经历，
 * 不是给系统打分，是告诉系统「我这颗七杀走的是哪一条道」。
 *
 * 所以字典分两半，泾渭分明：
 *
 * - `XiangYi` —— 古法给的候选与先验权重。**永不参与学习，永不被用户数据改写。**
 * - `XiangPosterior` —— 某个人在某条象意上的后验。**唯一随用户数据变化的东西。**
 *
 * 详见 docs/ROADMAP.md §4 与 §7。
 */

import type { RiskDomain } from '@hidefate/core-fengshui';

export type { RiskDomain };

/** 三层。与 docs/ROADMAP.md §1 的「一命二运三风水」一一对应。 */
export type XiangLayer = '命' | '运' | '风水';

/**
 * 象意领域。
 *
 * 是 core-fengshui 的 `RiskDomain`（七项）的**超集** —— 风水层的既有结论可以
 * 原样落进来不需转换，命层与运层再补上宅盘管不到的那几项。
 * 新增项一律要有实际来源（八字十神、紫微宫位或奇门占类），不凭空造类目。
 */
export type XiangDomain =
  | RiskDomain // 健康 财运 感情 事业 人丁 意外 官非
  | '学业'
  | '心性'
  | '迁移'
  | '人际'
  | '家庭';

export const ALL_XIANG_DOMAINS: readonly XiangDomain[] = [
  '健康', '财运', '感情', '事业', '人丁', '意外', '官非',
  '学业', '心性', '迁移', '人际', '家庭',
];

/** 显化面。同一个象在不同面上显化，判定标准完全不同，必须分开记。 */
export type XiangFacet =
  /** 人物象：应在什么人身上。 */
  | '人'
  /** 事件象：发生什么事。 */
  | '事'
  /** 物象：什么东西、多少数目。 */
  | '物'
  /** 身体象：哪个脏腑部位。 */
  | '体';

/**
 * 可干预性。见 docs/ROADMAP.md §8 ——
 * README 硬规则 4「无化解则不出预测」在人生轨迹层面改为「仍出预测但必须标注这一项」。
 */
export type Interventionability = '空间可调' | '择时可避' | '行为可调' | '不可调';

/** 象源：任何一个可以取象的盘面元素。 */
export type XiangSource =
  | { readonly layer: '命'; readonly system: '八字'; readonly kind: '十神' | '神煞' | '五行' | '刑冲合害'; readonly token: string }
  | { readonly layer: '命'; readonly system: '紫微'; readonly kind: '主星' | '四化' | '格局' | '宫位'; readonly token: string }
  | { readonly layer: '运'; readonly system: '奇门'; readonly kind: '八门' | '九星' | '八神' | '天干' | '占类'; readonly token: string }
  | { readonly layer: '运'; readonly system: '流年'; readonly kind: '干支' | '十神'; readonly token: string }
  | { readonly layer: '风水'; readonly system: '飞星'; readonly kind: '单星' | '组合'; readonly token: string }
  | { readonly layer: '风水'; readonly system: '八宅'; readonly kind: '游年'; readonly token: string };

/**
 * 触发条件：需哪些元素同时在场（或不在场）该象才成立。
 *
 * 刻意做成**声明式的元素在场判定**，而不是可执行的谓词 ——
 * 条件要能被序列化进账本、能被人读懂、能被复核。
 */
export interface XiangCondition {
  /** 给人看的说明，如「须同时见白虎或天芮」。 */
  readonly description: string;
  /** 需在场的元素 token，任一命中即算满足。 */
  readonly anyOf: readonly string[];
  /** 反转：这些元素在场时该象**不**成立。 */
  readonly mustBeAbsent?: boolean;
}

export interface XiangYi {
  /**
   * 稳定 id，账本与后验都引用它。
   * **一经发布不得改写** —— 改 id 等于把该条已积累的全部证据丢弃。
   */
  readonly id: string;
  readonly source: XiangSource;
  readonly domain: XiangDomain;
  readonly valence: '吉' | '凶' | '中';
  readonly facet: XiangFacet;
  /** 具体表述，如「开刀、外伤、金属器械所伤」。要具体到能被判定。 */
  readonly statement: string;
  readonly requires?: readonly XiangCondition[];
  /**
   * 需几层共振才够格进入预测。
   * 设 2 以上可挡掉大量单层臆断 —— 命层一颗七杀就断人要开刀，是取象最常见的失控方式。
   */
  readonly minResonance: 1 | 2 | 3;
  /** 古法先验权重 0–1。**此值不参与学习。** */
  readonly prior: number;
  /** 古法出处，对应 core-synthesis `Finding.classic` 的角色。 */
  readonly classic: string;
  readonly interventionability: Interventionability;
}

/** 一条对轨证据。指向账本记录，不重复存储结论本身。 */
export interface XiangEvidence {
  /** 账本中 PredictionRecord / QuietRecord 的 id。 */
  readonly recordId: string;
  readonly verdict: '中' | '部分中' | '未发生' | '反向';
  /** ISO。 */
  readonly recordedAt: string;
}

/** 后验成熟度 —— 用于诚实地告诉用户「这条到底学到了没有」。 */
export type PosteriorMaturity =
  /** 证据不足，权重基本等于古法先验，不要声称学到了什么。 */
  | '未起步'
  /** 有了方向，但样本仍少，结论可能翻转。 */
  | '初步'
  /** 可作参考。 */
  | '可参考';

/** 个人后验 —— 唯一随用户数据变化的东西。 */
export interface XiangPosterior {
  readonly personId: string;
  readonly xiangId: string;
  /** 明确显化。 */
  readonly hits: number;
  /** 部分应验，按半次计。 */
  readonly partial: number;
  /**
   * 明确「该期此域平安无事」。
   * **必须来自用户主动填写的负样本**（QuietRecord），
   * 「没记录」不等于「没发生」—— 只增不减的证据永远收敛不了，那是幸存者偏差。
   */
  readonly misses: number;
  /** Beta 后验均值，向 prior 收缩。 */
  readonly weight: number;
  readonly maturity: PosteriorMaturity;
  readonly evidence: readonly XiangEvidence[];
  readonly updatedAt: string;
}

/** 共振结果：某个领域上有几层在同时说话。 */
export interface Resonance {
  readonly domain: XiangDomain;
  /** 说话的层，去重。 */
  readonly layers: readonly XiangLayer[];
  readonly resonance: 1 | 2 | 3;
  /** 达到自身 minResonance 门槛、因而够格进入预测的条目。 */
  readonly admitted: readonly XiangYi[];
  /** 被门槛挡下的条目，保留以便解释「为什么没报」。 */
  readonly rejected: readonly XiangYi[];
}
