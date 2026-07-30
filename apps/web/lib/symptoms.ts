/**
 * 症状入口 —— 从「最近哪方面不顺」倒推该看盘上哪几处。
 *
 * 为什么要有这一层：本 App 原本的入口是「房子」——先建档、再排盘、再读九宫。
 * 可真正让人打开这种 App 的，从来不是「我想看看飞星」，而是
 * 「最近老生病」「钱总留不住」「晚上睡不着」。症状是用户带来的语言，
 * 宫位与星曜是引擎的语言，这一层负责把前者翻成后者。
 *
 * 严格是**筛选与排序**，不含任何新的推断：
 *   - 类别 → 维度，是一张固定的对照表；
 *   - 排序用的是 predictions 里已经算好的概率；
 *   - 门派 / 置信度 / 古法依据一律直接取自 Finding 的原有字段。
 * 任何需要新推理的东西都不属于这里，应回到 packages/core-*。
 */

import type { RiskDomain, RoomKind } from '@hidefate/core-fengshui';
import type { Cure, Member, SynthesisResult } from '@hidefate/core-synthesis';
import { sortByProbability, type FindingRef } from './findings';

export interface SymptomCategory {
  readonly id: string;
  /** 用户的说法，不是术语。 */
  readonly label: string;
  /** 一句补充，帮用户确认自己选对了。 */
  readonly hint: string;
  /** 对应引擎里的风险维度。 */
  readonly domains: readonly RiskDomain[];
  /**
   * 限定到这些房间种类。
   * 「睡不好／心慌」与「生病」用的是同一个健康维度，但前者只该看睡卧之处 ——
   * 这是筛选条件的差别，不是另算一套结论。
   */
  readonly roomKinds?: readonly RoomKind[];
}

const BEDROOMS: readonly RoomKind[] = ['主卧', '次卧', '儿童房', '老人房', '客房'];

export const SYMPTOM_CATEGORIES: readonly SymptomCategory[] = [
  {
    id: 'health',
    label: '身体 / 生病',
    hint: '小病不断、老毛病反复、家里有人住院',
    domains: ['健康'],
  },
  {
    id: 'family',
    label: '感情 / 家人',
    hint: '夫妻口角、亲子疏离、家里气氛紧',
    domains: ['感情', '人丁'],
  },
  {
    id: 'wealth',
    label: '钱财 / 生意',
    hint: '存不住钱、进项变少、生意冷清',
    domains: ['财运'],
  },
  {
    id: 'career',
    label: '事业 / 工作',
    hint: '升迁受阻、小人是非、官司口舌',
    domains: ['事业', '官非'],
  },
  {
    id: 'sleep',
    label: '睡不好 / 心慌',
    hint: '入睡难、多梦易醒、莫名心悸',
    domains: ['健康'],
    roomKinds: BEDROOMS,
  },
] as const;

export function categoryById(id: string): SymptomCategory | null {
  return SYMPTOM_CATEGORIES.find((c) => c.id === id) ?? null;
}

/** 该类别下的断语，按已有的概率模型从重到轻。 */
export function findingsForCategory(
  refs: readonly FindingRef[],
  cat: SymptomCategory,
): FindingRef[] {
  const byDomain = refs.filter((r) => r.finding.domains.some((d) => cat.domains.includes(d)));
  const scoped = cat.roomKinds
    ? byDomain.filter((r) => r.roomKinds.some((k) => cat.roomKinds!.includes(k)))
    : byDomain;
  return sortByProbability(scoped);
}

/**
 * 「今天就能做」——在候选化解里挑成本最低的一条。
 *
 * 成本没有被建模（Cure 只有 priority / urgency / action / rationale / avoid），
 * 所以这里按动作本身的性质排：挪开、清走、关上门这类不花钱不动工的最轻，
 * 摆件次之，动土改建最重。这是**排序用的展示启发式**，不影响任何结论 ——
 * 换个排法只会换一条被推到前面的建议，不会让任何断语改变。
 */
const COST_RULES: readonly { readonly cost: number; readonly words: readonly string[] }[] = [
  { cost: 0, words: ['移开', '挪开', '搬开', '收起', '清理', '清走', '保持', '关上', '关好', '拉上', '打开', '通风', '整洁', '避免', '勿', '暂停', '少'] },
  { cost: 1, words: ['更换', '换成', '加一盏', '铺', '挂', '摆', '放置', '放一', '置', '加装'] },
  { cost: 2, words: ['封', '改门', '改建', '拆', '装修', '动土', '重做', '迁'] },
];

export function cureCost(c: Cure): number {
  for (const rule of COST_RULES) {
    if (rule.words.some((w) => c.action.includes(w))) return rule.cost;
  }
  return 1.5; // 说不清的，排在「摆件」与「动工」之间
}

export interface PromotedCure {
  readonly cure: Cure;
  readonly ref: FindingRef;
  readonly cost: number;
}

/** 在这些断语的化解里挑一条最低成本的推到前面。 */
export function lowestCostCure(refs: readonly FindingRef[]): PromotedCure | null {
  const all: PromotedCure[] = [];
  for (const ref of refs) {
    for (const cure of ref.cures) all.push({ cure, ref, cost: cureCost(cure) });
  }
  if (all.length === 0) return null;
  // 成本同为最低时，紧急的先做
  const urgency = (c: Cure) => (c.urgency === '立即' ? 0 : c.urgency === '本年内' ? 1 : 2);
  return all.sort(
    (a, b) => a.cost - b.cost || urgency(a.cure) - urgency(b.cure) || a.cure.priority - b.cure.priority,
  )[0]!;
}

/** 缺什么资料，以及去哪一步补。 */
export interface MissingInput {
  readonly what: string;
  readonly why: string;
  readonly href: string;
  readonly cta: string;
}

/**
 * 某类别一条断语都没有时，说明缺的是什么输入。
 *
 * 这一段是这个页面存在的另一半理由：**永远不给空状态**。
 * 「暂无数据」对用户毫无用处 —— 他不知道是这间房真没问题，还是自己少填了东西。
 * 所以这里逐项列出「差什么、为什么差它就出不来、去哪补」。
 */
export function missingInputs(
  s: SynthesisResult | null,
  members: readonly Member[],
  cat: SymptomCategory,
): MissingInput[] {
  const out: MissingInput[] = [];

  if (!s) {
    return [
      {
        what: '这处房屋的坐向',
        why: '没有坐向就排不出九宫盘，一切结论都无从谈起。只要知道大门朝哪，就够了。',
        href: '/new',
        cta: '建立房屋',
      },
    ];
  }

  if (members.length === 0) {
    out.push({
      what: '家里成员的出生年与性别',
      why: '个人吉凶要靠命卦定位，而命卦只需生年与性别就能算 —— 不必知道时辰。缺了它，只能看到全屋层面的结论。',
      href: '/members',
      cta: '添加成员',
    });
  }

  const rooms = s.profile.rooms ?? [];
  if (rooms.length === 0) {
    out.push({
      what: '房间用途的标注',
      why: '同一个方位，做主卧和做储藏间，轻重完全不同。房间没标，引擎只能按方位泛泛而论。',
      href: '/rooms',
      cta: '标注房间',
    });
  } else if (cat.roomKinds && !rooms.some((r) => cat.roomKinds!.includes(r.kind))) {
    out.push({
      what: `睡卧之处（${cat.roomKinds.slice(0, 3).join('、')}等）的位置`,
      why: '「睡不好」只看人躺下的那一方。这处房屋还没有标出任何卧房，所以筛不出对应的断语。',
      href: '/rooms',
      cta: '标注卧房',
    });
  }

  if (!s.profile.xingShi?.length) {
    out.push({
      what: '房子外面的形势（峦头）',
      why: '「峦头为体，理气为用」。路冲、天斩、高压这类外部形煞未填时，判断只有理气这一半。',
      href: '/edit',
      cta: '补填外部环境',
    });
  }

  if (!s.qiMenEnabled) {
    out.push({
      what: '山向奇门层（可选）',
      why: '开启后多一派参证，两派以上同证的结论置信度会提高。不开也不影响现有结论。',
      href: '/me',
      cta: '到「我的」开启',
    });
  }

  return out;
}
