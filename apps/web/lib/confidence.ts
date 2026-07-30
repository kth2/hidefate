/**
 * 置信度阶梯 —— 把「还差什么、补了能涨多少」摊开给用户看。
 *
 * ## 数字从哪来
 *
 * **全部来自 `packages/core-synthesis/src/assess.ts` 里既有的分级降级逻辑**，
 * 这里一个新数都没有发明。那段代码的记分方式是：
 *
 * ```
 * confScore  = qiMenEnabled ? 2 : 1                                  // 合参门派数
 *            + entryMode === '罗盘实测' ? 2 : entryMode === '户型图' ? 1 : 0
 *            + profileCompleteness(profile).missing.length === 0 ? 1 : 0
 *            + (成员平均八字可用度 >= 0.9 ? 1 : 0)
 * level      = confScore >= 4 ? '高' : confScore >= 2 ? '中' : '低'
 * ```
 *
 * 本文件把同一套记分**逐项拆开**，于是每一项都能回答「补上它能涨几分」。
 * 拆解是镜像，不是另一套模型 —— `confidence.test.ts` 里有一条测试，
 * 拿一堆真实档案跑核心的 `analyse()`，逐个断言本文件算出的等级与核心一致。
 * 核心那边的权重若改了而这边没跟上，那条测试就会红。
 *
 * ## 为什么要有阶梯
 *
 * 「置信度：中」这四个字对用户没有用 —— 他不知道中是因为什么，也不知道
 * 该做什么才能变高。阶梯把它变成一张可执行的清单：缺哪一项、值几分、
 * 大概要花多少功夫、点一下跳到收集它的那一步。
 */

import {
  profileCompleteness,
  type PropertyProfile,
} from '@hidefate/core-fengshui';
import type { ConfidenceLevel, Member } from '@hidefate/core-synthesis';

/** 记分上限：门派 2 + 坐向 2 + 房间 1 + 成员 1。见 assess.ts。 */
export const CONFIDENCE_MAX = 6;

/** 低于此比例即在分析页顶部提示补资料。6 分制下相当于 5 分。 */
export const LADDER_THRESHOLD = 0.8;

export type ContributorId = 'schools' | 'direction' | 'rooms' | 'members';

export interface Contributor {
  readonly id: ContributorId;
  readonly label: string;
  /** 当前拿到几分。 */
  readonly earned: number;
  /** 这一项最多几分。 */
  readonly max: number;
  /** 当前状态的一句说明。 */
  readonly note: string;
}

export interface ConfidenceState {
  readonly score: number;
  /** 0–1。 */
  readonly percent: number;
  readonly level: ConfidenceLevel;
  readonly contributors: readonly Contributor[];
}

/** 成员八字「完整」的判定线，与 assess.ts 一致（平均可用度 ≥ 0.9）。 */
const MEMBER_FULL_THRESHOLD = 0.9;

/** 由分数得等级 —— 阈值抄自 assess.ts，不另立标准。 */
export function levelOfScore(score: number): ConfidenceLevel {
  return score >= 4 ? '高' : score >= 2 ? '中' : '低';
}

/**
 * 拆解当前置信度。
 *
 * profile 为 null 表示连房子都还没建 —— 此时坐向与房间两项当然都是 0 分，
 * 但成员那一项仍可独立成立（命卦只需生年与性别）。
 */
export function assessConfidence(
  profile: PropertyProfile | null,
  members: readonly Member[],
): ConfidenceState {
  const contributors: Contributor[] = [];

  // ── 1. 合参门派数 ──
  const qiMen = Boolean(profile?.enableQiMen);
  contributors.push({
    id: 'schools',
    label: '合参门派',
    earned: qiMen ? 2 : 1,
    max: 2,
    note: qiMen ? '飞星、八宅、山向奇门三派同盘合参。' : '飞星与八宅两派合参（山向奇门层未启用）。',
  });

  // ── 2. 坐向来源 ──
  const mode = profile?.entryMode;
  contributors.push({
    id: 'direction',
    label: '坐向来源',
    earned: mode === '罗盘实测' ? 2 : mode === '户型图' ? 1 : 0,
    max: 2,
    note:
      mode === '罗盘实测'
        ? '坐向来自现场罗盘实测，方位可信度最高。'
        : mode === '户型图'
          ? '依户型图建档，宫位划分较可靠；坐向准确度取决于测量。'
          : '纯九宫格建档：宫位为均分近似，结论在方位层面成立，房间边界可能与实况有出入。',
  });

  // ── 3. 关键房间标注 ──
  const completeness = profile ? profileCompleteness(profile) : null;
  const roomsDone = completeness != null && completeness.missing.length === 0;
  contributors.push({
    id: 'rooms',
    label: '关键房间',
    earned: roomsDone ? 1 : 0,
    max: 1,
    note: roomsDone
      ? '关键房间（大门/主卧/厨房）均已标注。'
      : completeness
        ? `建档尚缺：${completeness.missing.join('；')}。`
        : '尚未建立房屋，无从判断房间标注。',
  });

  // ── 4. 成员八字 ──
  const factors = members.map((m) => m.chart.confidence.factor);
  const avg = factors.length ? factors.reduce((a, b) => a + b, 0) / factors.length : 0;
  const membersFull = factors.length > 0 && avg >= MEMBER_FULL_THRESHOLD;
  contributors.push({
    id: 'members',
    label: '成员八字',
    earned: membersFull ? 1 : 0,
    max: 1,
    note:
      factors.length === 0
        ? '尚未录入成员，个人化结论（房间分配、流年应期）一概无法作答。'
        : membersFull
          ? '成员八字资料完整。'
          : `部分成员八字残缺（平均可用度 ${(avg * 100).toFixed(0)}%），个人化结论已相应降级，命卦部分不受影响。`,
  });

  const score = contributors.reduce((s, c) => s + c.earned, 0);
  return { score, percent: score / CONFIDENCE_MAX, level: levelOfScore(score), contributors };
}

export interface LadderRow {
  readonly id: ContributorId;
  readonly title: string;
  /** 补上这一项能涨几分（6 分制）。 */
  readonly gain: number;
  /** 同一件事换算成百分点。 */
  readonly gainPercent: number;
  /** 大概要花多少功夫 —— 让用户能自己权衡值不值得。 */
  readonly effort: string;
  /** 为什么值这么多分。 */
  readonly why: string;
  readonly href: string;
  readonly cta: string;
  /** 补上之后等级会不会跟着跳一级 —— 跳级的那一条最值得先做。 */
  readonly levelsUp: boolean;
}

const ROW_META: Record<
  ContributorId,
  { title: string; effort: string; why: string; href: string; cta: string }
> = {
  direction: {
    title: '量一次准确的坐向',
    effort: '约 2 分钟，需站在屋内或门口',
    why: '整套理气都从坐山起。度数差一格，飞星盘可能整盘不同 —— 这是单项分量最重的一步。',
    href: '/edit',
    cta: '去量坐向',
  },
  schools: {
    title: '开启山向奇门层',
    effort: '一次点击，首次需下载约 416 KB',
    why: '多一派参证。两派以上同证的断语会自动升一级置信度。',
    href: '/me',
    cta: '去开启',
  },
  rooms: {
    title: '标注关键房间',
    effort: '每间约 15 秒，先标大门、主卧、厨房',
    why: '同一个方位做主卧还是做储藏间，轻重完全不同。房间没标，只能按方位泛泛而论。',
    href: '/rooms',
    cta: '去标注',
  },
  members: {
    title: '补齐成员的出生月日时',
    effort: '每人约 30 秒（需问到出生时辰）',
    why: '日主与十神都要日柱才成立。缺了它，个人化结论只能到命卦与方位那一层。',
    href: '/members',
    cta: '去补充',
  },
};

/** 阶梯的展示顺序：先看单项能涨最多的。 */
const ROW_ORDER: readonly ContributorId[] = ['direction', 'schools', 'rooms', 'members'];

/**
 * 生成阶梯。
 *
 * 只列**还没拿满分**的项 —— 已经拿满的不必再占位置。
 * 因此只要还有任何一项可选输入没补齐，阶梯就非空；全部补齐时才为空数组。
 */
export function confidenceLadder(
  profile: PropertyProfile | null,
  members: readonly Member[],
): LadderRow[] {
  const state = assessConfidence(profile, members);
  const byId = new Map(state.contributors.map((c) => [c.id, c]));

  const rows: LadderRow[] = [];
  for (const id of ROW_ORDER) {
    const c = byId.get(id);
    if (!c || c.earned >= c.max) continue;
    const gain = c.max - c.earned;
    const meta = ROW_META[id];
    rows.push({
      id,
      title: meta.title,
      gain,
      gainPercent: gain / CONFIDENCE_MAX,
      effort: meta.effort,
      why: meta.why,
      href: meta.href,
      cta: meta.cta,
      levelsUp: levelOfScore(state.score + gain) !== state.level,
    });
  }
  return rows.sort((a, b) => Number(b.levelsUp) - Number(a.levelsUp) || b.gain - a.gain);
}

/** 置信度戳记的配色档位。 */
export function confidenceTone(level: ConfidenceLevel): string {
  return level === '高'
    ? 'border-jade/45 bg-jade/[0.08] text-jade'
    : level === '中'
      ? 'border-gold/50 bg-gold/[0.09] text-gold'
      : 'border-risk-warn/50 bg-risk-warn/[0.08] text-risk-warn';
}
