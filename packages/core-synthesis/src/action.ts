/**
 * 行动卡 —— 一切结论的终点。
 *
 * 风水师拿到「某人某月健康偏高」这种结论，没法直接跟客户说；客户更没法照着做。
 * 客户要的是：**做什么、在哪、何时做、何时撤、为谁、要花多大功夫、为什么**。
 *
 * 本模块把已有的三类输出统一翻成 `Action`：
 *   1. 合参化解（SynthesisResult.prioritisedCures）
 *   2. 玄空格局体检（伏反吟、入囚、失运……）
 *   3. 流年煞方（太岁、岁破、三煞、五黄 —— 动土禁方）
 *
 * ## 排序（第零期审计 P0-8，采纳外部审阅）
 *
 *   类别（安全须知 > 本派建议 > 可选传统做法）
 *   → 依据（完整 > 初步）
 *   → 可逆性（可逆 > 部分可逆 > 不可逆）
 *   → 功夫（不花钱 > 小改 > 装修级）
 *   → 受影响人数
 *
 * 早先以「必做／宜做／可选」排序、并把「移形易位」放第一。两处都改了：
 *   - 「必做」把门派建议说成了义务。传统建议永远是「本派建议」，只有安全问题才是「须知」。
 *   - 移形易位是传统化煞的**层级**，不等于**实务上最先做**：搬床容易，移灶、改门是装修。
 *     层级仍保留为 `tier` 字段供风水师参考，排序改看可逆性与成本。
 * 装修级或不可逆的行动一律 `needsOwnerApproval`，须屋主明确同意。
 *
 * ## 纪律
 *
 * - 不新造任何断语：title 一律取自已有化解文字或格局体检的结论。
 * - 层级由文字推断（`inferTier`）。推断不了的落「留意观察」，不硬套。
 * - 流年化解必须带撤除时间：今年的五黄化解，明年立春后还摆着，就是在错误的位置放错误的东西。
 */

import {
  BEIJING_OFFSET_HOURS,
  PALACE_DIRECTION,
  annualSha,
  liChunOf,
  type AnnualSha,
  type GeJuReport,
  type PalaceIndex,
  type RiskDomain,
} from '@hidefate/core-fengshui';
import type { Cure, SynthesisResult } from './types.js';

export type ActionTier = '移形易位' | '改房间用途' | '调整动线门窗' | '物件化解' | '择时避让' | '留意观察';

export const TIER_ORDER: readonly ActionTier[] = [
  '移形易位',
  '改房间用途',
  '调整动线门窗',
  '物件化解',
  '择时避让',
  '留意观察',
] as const;

/**
 * 行动类别 —— 三者不可互换：
 *   安全须知     与风水无关的实际安全（电线、燃气、消防、通道）；任何门派都该做
 *   本派建议     依所选门派规则得出、且有明确时限或凶象依据的建议
 *   可选传统做法 催吉、长期布局、或门派间说法不一的做法
 */
export type ActionCategory = '安全须知' | '本派建议' | '可选传统做法';

export const CATEGORY_ORDER: readonly ActionCategory[] = ['安全须知', '本派建议', '可选传统做法'] as const;

/** 依据完整度：「初步」= 缺实地资料（房间、家人、罗盘读数）或规则本身有待核例外。 */
export type ActionEvidence = '完整' | '初步';

const EVIDENCE_ORDER: readonly ActionEvidence[] = ['完整', '初步'] as const;

export type ActionReversibility = '可逆' | '部分可逆' | '不可逆';

const REVERSIBILITY_ORDER: readonly ActionReversibility[] = ['可逆', '部分可逆', '不可逆'] as const;

export type ActionEffort = '不花钱' | '小改' | '装修级';

const EFFORT_ORDER: readonly ActionEffort[] = ['不花钱', '小改', '装修级'] as const;

export interface ActionReason {
  readonly summary: string;
  readonly principle: string;
  readonly source: '合参化解' | '玄空格局' | '流年煞方';
}

export interface Action {
  readonly id: string;
  /** 动词开头的一句话。 */
  readonly title: string;
  readonly tier: ActionTier;
  readonly where: { readonly palace: PalaceIndex; readonly direction: string; readonly room?: string };
  readonly when: {
    /** 最迟何时完成（ISO 日期）；无期限则省略。 */
    readonly doBy?: string;
    /** 何时撤除（流年化解必有）。 */
    readonly undoAfter?: string;
    /** 给人看的一句时间说明。 */
    readonly label: string;
  };
  readonly forMembers: readonly string[];
  readonly category: ActionCategory;
  readonly evidence: ActionEvidence;
  readonly reversibility: ActionReversibility;
  readonly effort: ActionEffort;
  /** 装修级或不可逆 → 须屋主明确同意后才可执行。 */
  readonly needsOwnerApproval: boolean;
  /** 引擎生成的行动一律「待审」，风水师确认后方可交给客户。 */
  readonly approval: '待审' | '已确认' | '已拒绝';
  readonly intent: '化凶' | '催吉' | '避忌';
  readonly domains: readonly RiskDomain[];
  readonly because: readonly ActionReason[];
  /** 用错反而助凶的禁忌。 */
  readonly avoid: readonly string[];
  /** 来源：引擎生成，还是风水师新增／改写。 */
  readonly author: '引擎' | '师断';
}

// ---------------------------------------------------------------------------
// 层级推断
// ---------------------------------------------------------------------------

const TIER_RULES: readonly [ActionTier, RegExp][] = [
  ['移形易位', /对调|移走|移至|移开|改设于|改睡|搬离|避开|切勿在此方设|不宜以此方为|忌设卧床/],
  ['改房间用途', /化为静区|改作|改为|宜作|宜设|作储藏|当储物/],
  ['调整动线门窗', /改门|换门|开门|封窗|门向|玄关|动线|改道/],
  ['物件化解', /置|挂|悬挂|摆|放|泄|通关|铜|鱼缸|绿植|灯/],
  ['择时避让', /忌动土|不动土|勿动土|静止|不装修|勿大装修|避免|慎选|不敲打/],
];

/** 由化解文字推断层级。规则有先后：能移位的先算移位。 */
export function inferTier(text: string): ActionTier {
  for (const [tier, re] of TIER_RULES) if (re.test(text)) return tier;
  return '留意观察';
}

const REVERSIBILITY_OF: Readonly<Record<ActionTier, ActionReversibility>> = {
  移形易位: '可逆',
  改房间用途: '可逆',
  调整动线门窗: '不可逆',
  物件化解: '可逆',
  择时避让: '可逆',
  留意观察: '可逆',
};

/** 与风水无关的实际安全事项。 */
const SAFETY_RE = /消防|烟感|电线|燃气|线路|漏电|防滑|扶手|逃生|通风/;

const EFFORT_OF: Readonly<Record<ActionTier, ActionEffort>> = {
  移形易位: '小改',
  改房间用途: '小改',
  调整动线门窗: '装修级',
  物件化解: '小改',
  择时避让: '不花钱',
  留意观察: '不花钱',
};

/** 以北京时间（节气所用时区）取日期，与设备时区无关。 */
function isoDate(d: Date): string {
  const b = new Date(d.getTime() + BEIJING_OFFSET_HOURS * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}`;
}

/** 合参结果是否缺实地资料：没标房间、没有家人、坐向只给了山名。 */
function isPreliminary(s: SynthesisResult): boolean {
  const p = s.profile;
  return p.rooms.length === 0 || (typeof p.sitting === 'string' && !/^\d/.test(p.sitting));
}

function base(tier: ActionTier, effort: ActionEffort = EFFORT_OF[tier]) {
  const reversibility = REVERSIBILITY_OF[tier];
  return {
    tier,
    effort,
    reversibility,
    needsOwnerApproval: effort === '装修级' || reversibility === '不可逆',
    approval: '待审' as const,
  };
}

/** 「今年」系列化解：流年星所致，明年立春后应撤除或改换。 */
function isAnnual(text: string): boolean {
  return /^今年/.test(text);
}

// ---------------------------------------------------------------------------
// 来源一：合参化解
// ---------------------------------------------------------------------------

function occupantsOf(s: SynthesisResult, p: PalaceIndex): string[] {
  const ids = new Set<string>();
  for (const r of s.palaces[p].rooms) for (const o of r.occupants ?? []) ids.add(o);
  return [...ids];
}

export function actionFromCure(cure: Cure, s: SynthesisResult, idx: number): Action | null {
  if (cure.intent === '维持') return null;
  const nextLiChun = isoDate(liChunOf(s.year + 1));
  const annual = isAnnual(cure.action);
  const tier = inferTier(cure.action);
  const category: ActionCategory = SAFETY_RE.test(cure.action)
    ? '安全须知'
    : cure.intent === '催吉' || cure.urgency === '可从容安排'
      ? '可选传统做法'
      : '本派建议';
  const when =
    cure.urgency === '立即'
      ? { doBy: undefined, label: '尽快' }
      : cure.urgency === '本年内'
        ? { doBy: nextLiChun, label: `${s.year + 1} 年立春（${nextLiChun}）前` }
        : { doBy: undefined, label: '可从容安排' };
  return {
    id: `cure-${cure.palace}-${idx}`,
    title: cure.action,
    ...base(tier),
    where: { palace: cure.palace, direction: cure.direction, room: cure.room ?? undefined },
    when: annual
      ? { ...when, undoAfter: nextLiChun, label: `${when.label}；${s.year + 1} 年立春后撤除或按新年飞星重排` }
      : when,
    forMembers: cure.memberId ? [cure.memberId] : occupantsOf(s, cure.palace),
    category,
    evidence: isPreliminary(s) ? '初步' : '完整',
    intent: cure.intent === '催吉' ? '催吉' : '化凶',
    domains: cure.domains,
    because: [{ summary: cure.rationale, principle: cure.rationale, source: '合参化解' }],
    avoid: cure.avoid,
    author: '引擎',
  };
}

// ---------------------------------------------------------------------------
// 来源二：玄空格局
// ---------------------------------------------------------------------------

export function actionsFromGeJu(geju: GeJuReport, s: SynthesisResult): Action[] {
  const out: Action[] = [];
  const facP = s.flyingStar.facing.mountain.palace;
  for (const g of geju.items) {
    if (g.valence !== '凶' && g.kind !== '失运') continue;
    const reason: ActionReason = { summary: g.summary, principle: g.classic, source: '玄空格局' };
    if (g.kind === '向星入囚') {
      out.push({
        id: `geju-${g.kind}`,
        title: '先实地核查向首与中宫有无真水；若无，再议引入水景或换天心重立运盘',
        ...base('调整动线门窗', '装修级'),
        where: { palace: facP, direction: PALACE_DIRECTION[facP] },
        when: { label: g.window ? `入囚期 ${g.window.startYear}–${g.window.endYear}` : '入囚期内' },
        forMembers: [],
        category: g.valence === '凶' ? '本派建议' : '可选传统做法',
        // 「见真水不囚」须实地核，故永远是初步
        evidence: '初步',
        intent: '化凶',
        domains: ['财运'],
        because: [reason],
        avoid: ['未实地核实水的真假（假水、干池）前，不作已出囚论。'],
        author: '引擎',
      });
    } else if (g.kind === '失运') {
      out.push({
        id: `geju-${g.kind}`,
        title: '评估是否换天心：大装修（换门、揭顶、全屋翻新）后以当运重立运盘',
        ...base('调整动线门窗', '装修级'),
        where: { palace: 5, direction: PALACE_DIRECTION[5] },
        when: { label: '下次装修时一并考虑' },
        forMembers: [],
        category: '可选传统做法',
        evidence: isPreliminary(s) ? '初步' : '完整',
        intent: '化凶',
        domains: ['财运', '健康'],
        because: [reason],
        avoid: ['换天心须择日动工，避开当年太岁、岁破、三煞方。'],
        author: '引擎',
      });
    } else if (g.kind.includes('伏吟') || g.kind.includes('反吟')) {
      const p = g.palaces[0] ?? facP;
      out.push({
        id: `geju-${g.kind}`,
        title:
          g.scope === '全盘'
            ? `全盘${g.kind}：议以替卦微调门向、或换天心重立运盘；未改之前，${g.governs === '财' ? '大额投资与开业' : '安床、添丁、就医等大事'}宜择日`
            : `${PALACE_DIRECTION[p]}${g.kind}：此宫宜静，减少开门进出与动土`,
        ...(g.scope === '全盘' ? base('调整动线门窗', '装修级') : base('择时避让', '不花钱')),
        where: { palace: p, direction: PALACE_DIRECTION[p] },
        when: { label: '长期' },
        forMembers: [],
        category: g.scope === '全盘' ? '本派建议' : '可选传统做法',
        evidence: isPreliminary(s) ? '初步' : '完整',
        intent: '化凶',
        domains: g.governs === '财' ? ['财运'] : g.governs === '丁' ? ['健康', '人丁'] : ['财运', '健康'],
        because: [reason],
        avoid: [],
        author: '引擎',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 来源三：流年煞方（动土禁方）
// ---------------------------------------------------------------------------

export function actionsFromAnnualSha(sha: AnnualSha, evidence: ActionEvidence = '完整'): Action[] {
  const start = isoDate(liChunOf(sha.year));
  const end = isoDate(liChunOf(sha.year + 1));
  const reasonsByPalace = new Map<PalaceIndex, string[]>();
  const add = (p: PalaceIndex, why: string) => {
    if (p === 5) return;
    reasonsByPalace.set(p, [...(reasonsByPalace.get(p) ?? []), why]);
  };
  for (const p of sha.taiSui.palaces) add(p, `太岁在${sha.taiSui.mountains[0]!.name}`);
  for (const p of sha.suiPo.palaces) add(p, `岁破在${sha.suiPo.mountains[0]!.name}`);
  for (const m of sha.sanSha.mountains) add(m.palace, `三煞（${m.name}）`);
  add(sha.wuHuang, '五黄到宫');

  return [...reasonsByPalace.entries()].map(([p, why]) => ({
    id: `sha-${sha.year}-${p}`,
    title: `${PALACE_DIRECTION[p]}今年勿动土、勿大装修、勿打墙钻孔`,
    ...base('择时避让', '不花钱'),
    where: { palace: p, direction: PALACE_DIRECTION[p] },
    when: { doBy: start, undoAfter: end, label: `${start} 立春起至 ${end} 立春前` },
    forMembers: [],
    category: '本派建议' as const,
    // 煞方只看年份与方位；坐向未实测时方位本身就可能差一宫
    evidence,
    intent: '避忌' as const,
    domains: ['健康', '意外'] as RiskDomain[],
    because: [{ summary: [...new Set(why)].join('、'), principle: '流年太岁、岁破、三煞、五黄之方忌动土修造', source: '流年煞方' as const }],
    avoid: ['确须施工者，另行择日并避开坐煞向煞。'],
    author: '引擎' as const,
  }));
}

// ---------------------------------------------------------------------------
// 汇总与排序
// ---------------------------------------------------------------------------

function rank<T>(order: readonly T[], v: T): number {
  const i = order.indexOf(v);
  return i < 0 ? order.length : i;
}

export function sortActions(actions: readonly Action[]): Action[] {
  return [...actions].sort(
    (a, b) =>
      rank(CATEGORY_ORDER, a.category) - rank(CATEGORY_ORDER, b.category) ||
      rank(EVIDENCE_ORDER, a.evidence) - rank(EVIDENCE_ORDER, b.evidence) ||
      rank(REVERSIBILITY_ORDER, a.reversibility) - rank(REVERSIBILITY_ORDER, b.reversibility) ||
      rank(EFFORT_ORDER, a.effort) - rank(EFFORT_ORDER, b.effort) ||
      b.forMembers.length - a.forMembers.length,
  );
}

/** 同宫同文合并：成员取并集、理由取并集、类别取较前者。 */
function dedupe(actions: readonly Action[]): Action[] {
  const map = new Map<string, Action>();
  for (const a of actions) {
    const key = `${a.where.palace}|${a.title}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, a);
      continue;
    }
    map.set(key, {
      ...prev,
      category: rank(CATEGORY_ORDER, a.category) < rank(CATEGORY_ORDER, prev.category) ? a.category : prev.category,
      forMembers: [...new Set([...prev.forMembers, ...a.forMembers])],
      because: [...prev.because, ...a.because.filter((r) => !prev.because.some((x) => x.summary === r.summary))],
    });
  }
  return [...map.values()];
}

/** 同一宫内两条行动互相打架：A 要摆的东西，正是 B 所忌。 */
export interface ActionConflict {
  readonly palace: PalaceIndex;
  readonly direction: string;
  readonly recommendsId: string;
  readonly forbidsId: string;
  /** 建议摆放的那条。 */
  readonly recommends: string;
  /** 把它列为禁忌的那条。 */
  readonly forbids: string;
  readonly term: string;
}

/**
 * 找出同宫互相矛盾的化解。
 *
 * 例：五黄七赤同宫，五黄条「忌深色鱼缸」，七赤条却「宜深色鱼缸泄金」。
 * 引擎按单星各出一条化解，两条放在一起就自相矛盾 —— 这正是风水师要现场裁量之处，
 * 故只标出、不替风水师选边。
 */
export function findConflicts(actions: readonly Action[]): ActionConflict[] {
  const out: ActionConflict[] = [];
  for (const a of actions) {
    for (const b of actions) {
      if (a === b || a.where.palace !== b.where.palace) continue;
      for (const term of b.avoid) {
        const t = term.trim();
        if (t.length >= 2 && t.length <= 8 && a.title.includes(t)) {
          out.push({
            palace: a.where.palace,
            direction: a.where.direction,
            recommendsId: a.id,
            forbidsId: b.id,
            recommends: a.title,
            forbids: b.title,
            term: t,
          });
        }
      }
    }
  }
  // 同一对只报一次
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.palace}|${c.recommends}|${c.forbids}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface ActionPlan {
  readonly year: number;
  readonly actions: readonly Action[];
  /** 同宫互相矛盾的化解 —— 须风水师裁量。 */
  readonly conflicts: readonly ActionConflict[];
  /**
   * 卷入矛盾的行动。**不进 mustAddress**：互相打架的两条，引擎不替风水师选边，
   * 也不按分数高低裁决，只交给风水师审（外部审阅：冲突即暂停自动建议）。
   */
  readonly needsReview: readonly Action[];
  /** 化凶与避忌、且无矛盾者（客户报告第一页的候选，仍须风水师确认）。 */
  readonly mustAddress: readonly Action[];
  /** 催吉（另列，不与化凶混排 —— 承接 README 规则 7）。 */
  readonly enhancements: readonly Action[];
}

/** 一份合参结果 → 一份按优先级排好的行动清单。 */
export function buildActionPlan(s: SynthesisResult): ActionPlan {
  const prelim = isPreliminary(s);
  const fromCures = s.prioritisedCures
    .map((c, i) => actionFromCure(c, s, i))
    .filter((a): a is Action => a != null);
  const fromGeJu = s.geju ? actionsFromGeJu(s.geju, s) : [];
  const fromSha = actionsFromAnnualSha(annualSha(s.year), prelim ? '初步' : '完整');
  const all = sortActions(dedupe([...fromCures, ...fromGeJu, ...fromSha]));
  const conflicts = findConflicts(all);
  const conflicted = new Set(conflicts.flatMap((c) => [c.recommendsId, c.forbidsId]));
  return {
    year: s.year,
    actions: all,
    conflicts,
    needsReview: all.filter((a) => conflicted.has(a.id)),
    mustAddress: all.filter((a) => a.intent !== '催吉' && !conflicted.has(a.id)),
    enhancements: all.filter((a) => a.intent === '催吉' && !conflicted.has(a.id)),
  };
}
