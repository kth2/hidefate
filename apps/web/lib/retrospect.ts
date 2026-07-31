'use client';

/**
 * 回溯生成 —— 把三层引擎接到预测账本上。
 *
 * ## 顺序不可颠倒
 *
 * 回溯必须**先生成、先锁定，再让用户对轨**。顺序反了就是冷读：
 * 用户先说了发生过什么，系统再"算"出对应的象，那不叫预测，叫编。
 * 所以本模块只负责生成并冻结，**完全不读取任何已有的对轨结果**。
 *
 * ## 只出可判定的条目
 *
 * 每条回溯都带 `resolution.criterion`，由象意的 `statement` 加上大运区间拼成，
 * 交给 core-ledger 的写入守卫过一遍 —— 写不出可判定标准的象意，宁可不出条。
 *
 * ## 基准率一律为 null
 *
 * 我们没有任何人群基准率数据。按账本的约定，此时**必须显式置 null**
 * 并由 UI 标注「无基准」，绝不用一个编出来的数字冒充。
 * 这也意味着这批回溯暂时进不了 Brier 校准 —— 那是对的，
 * 它们的用处是收敛象意，不是证明系统准。
 */

import { computeBaziChart, type BirthInput } from '@hidefate/core-bazi';
import { STAR_NAME, buildFlyingStarChart, type PropertyProfile } from '@hidefate/core-fengshui';
import {
  buildLifeTimeline,
  type LifeTimeline,
  type ResidencePeriod,
} from '@hidefate/core-synthesis';
import {
  analyseResonance,
  buildBaseDictionary,
  type Resonance,
  type XiangYi,
} from '@hidefate/core-xiangyi';
import { freezePrediction, hashInput, type PredictionDraft, type PredictionRecord } from '@hidefate/core-ledger';
import { castZiWei } from '@hidefate/core-ziwei';
import { newId } from './db';

/** 引擎签名。改动任一核心包的算法时**必须**手动 bump，否则日后重放会比错东西。 */
export const ENGINE_VERSION = 'hidefate/retrospect@1|bazi@0.1|fengshui@0.1|ziwei@0.1|xiangyi@0.1';

const DICTIONARY: readonly XiangYi[] = buildBaseDictionary();

export interface RetrospectInput {
  readonly person: BirthInput & { id: string; name: string };
  readonly residences: readonly ResidencePeriod[];
  readonly properties: ReadonlyMap<string, PropertyProfile>;
  /** 回溯到哪一年为止，默认去年（今年尚未过完，不可判定）。 */
  readonly untilYear?: number;
}

export interface RetrospectSegment {
  readonly fromYear: number;
  readonly toYear: number;
  readonly label: string;
  /** 该段激活的盘面元素，用于解释「为什么出这几条」。 */
  readonly tokens: readonly string[];
  readonly resonance: readonly Resonance[];
  readonly drafts: readonly PredictionDraft[];
  /** 该段风水层是否可作证据。 */
  readonly fengShuiUsable: boolean;
}

export interface RetrospectPlan {
  readonly personId: string;
  readonly timeline: LifeTimeline;
  readonly segments: readonly RetrospectSegment[];
  readonly totalDrafts: number;
  /** 生成过程中被跳过的东西，明列不隐瞒。 */
  readonly notes: readonly string[];
}

/** 每段最多出几条 —— 一屏能对完，多了没人填。 */
const MAX_PER_SEGMENT = 5;

/**
 * 概率取值。
 *
 * **工程化取值，非统计拟合**，与 core-synthesis 的既有做法一致，
 * 且全部可复算：`先验 × 共振加成 × 层数折扣`，再收敛到账本的 3%–92%。
 * 之所以不用更复杂的模型：回溯的用处是收敛象意，不是比准；
 * 一个说不清来路的概率只会让后面的校准更难解释。
 */
export function retrospectProbability(entry: XiangYi, resonance: number): number {
  const bonus = resonance >= 3 ? 1.35 : resonance === 2 ? 1.15 : 0.85;
  const raw = entry.prior * bonus;
  return Math.max(0.03, Math.min(0.92, Number(raw.toFixed(4))));
}

/** 命层 token：大运十神 + 紫微主星（时辰已知时）。 */
function mingTokens(
  person: BirthInput,
  fromYear: number,
  toYear: number,
  notes: string[],
): string[] {
  const chart = computeBaziChart(person);
  const tokens: string[] = [];

  for (const d of chart.decades) {
    if (d.endYear < fromYear || d.startYear > toYear) continue;
    if (d.ganShiShen) tokens.push(d.ganShiShen);
  }

  if (person.hour != null) {
    try {
      const zw = castZiWei(person);
      for (const name of ['命宫', '疾厄', '财帛', '夫妻', '官禄']) {
        const p = zw.palaces.find((x) => x.name === name);
        for (const s of p?.majorStars ?? []) tokens.push(s.name);
      }
    } catch (e) {
      notes.push(`紫微层未纳入：${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (!notes.some((n) => n.startsWith('紫微层未纳入：缺时辰'))) {
    notes.push('紫微层未纳入：缺时辰，命盘不成立。补上出生时辰或先定盘后，命层会多一路取象。');
  }

  return tokens;
}

/**
 * 风水层 token：该段所住宅的山盘／向盘星名。
 *
 * 低保真段不出 token —— 与 core-synthesis 的 `learnable` 一致，
 * 宁可让该段只剩命层，也不拿推测的坐向去凑共振。
 */
function fengShuiTokens(timeline: LifeTimeline, fromYear: number, toYear: number): string[] {
  const tokens = new Set<string>();
  for (const y of timeline.years) {
    if (y.year < fromYear || y.year > toYear) continue;
    if (!y.fengShui.evidenceUsable) continue;
    for (const r of y.fengShui.residences) {
      if (!r.profile || !r.capability.flyingStar) continue;
      try {
        const chart = buildFlyingStarChart({
          sitting: r.profile.sitting,
          ...(r.profile.facing != null ? { facing: r.profile.facing } : {}),
          moveInYear: r.profile.moveInYear,
        });
        for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
          const cell = chart.palaces[p];
          // 山星主人丁健康、向星主财禄 —— 两者都是取象来源。
          tokens.add(STAR_NAME[cell.shan]);
          tokens.add(STAR_NAME[cell.xiang]);
        }
      } catch {
        // 坐向无法解析时静默跳过该宅 —— 上层的 coverage 已经会报出资料不足。
      }
    }
    tokens.add(STAR_NAME[y.fengShui.annualStar]);
  }
  return [...tokens];
}

/**
 * 生成回溯计划。**只生成，不写库** —— 写库是 `commitRetrospect()` 的事，
 * 让 UI 有机会先把要问的问题给用户看一眼再落锁。
 */
export function planRetrospect(input: RetrospectInput): RetrospectPlan {
  const notes: string[] = [];
  const person = input.person;
  const untilYear = input.untilYear ?? new Date().getFullYear() - 1;
  const chart = computeBaziChart(person);

  const timeline = buildLifeTimeline({
    personId: person.id,
    chart,
    fromYear: person.year,
    toYear: untilYear,
    residences: input.residences,
    properties: input.properties,
  });

  if (chart.decades.length === 0) {
    notes.push('无大运（缺日柱），改按每十年一段回溯。命层取象因此较粗。');
  }

  // 分段：有大运则按大运，否则每十年一段。
  const rawSegments =
    chart.decades.length > 0
      ? chart.decades
          .filter((d) => d.startYear <= untilYear)
          .map((d) => ({
            fromYear: Math.max(d.startYear, person.year),
            toYear: Math.min(d.endYear, untilYear),
            label: `${d.ganZhi}运（${d.startAge}–${d.endAge}岁）`,
          }))
      : Array.from(
          { length: Math.ceil((untilYear - person.year + 1) / 10) },
          (_, i) => {
            const from = person.year + i * 10;
            return {
              fromYear: from,
              toYear: Math.min(from + 9, untilYear),
              label: `${from}–${Math.min(from + 9, untilYear)} 年`,
            };
          },
        );

  const inputHash = hashInput({
    person: { year: person.year, month: person.month, day: person.day, hour: person.hour, gender: person.gender },
    residences: [...input.residences].map((r) => ({
      propertyId: r.propertyId, fromYear: r.fromYear, toYear: r.toYear, role: r.role, fidelity: r.fidelity,
    })),
  });

  /**
   * 全局去重：同一条象意在整份回溯里**只问一次**。
   *
   * 不去重会有两个问题，后一个是硬伤：
   *   1. 紫微本命主星贯穿一生，每段都在场，用户会看到同一句话问四遍
   *   2. 四条一模一样的记录结算后，会给同一个 xiangId 记上四条证据 ——
   *      而它们其实只是**一个信号**。后验因此被放大四倍，收敛出来的是假的。
   *
   * 归属到最早出现的那一段：那是它第一次可被观察的窗口。
   */
  const asked = new Set<string>();

  const segments: RetrospectSegment[] = [];
  for (const seg of rawSegments) {
    if (seg.toYear < seg.fromYear) continue;

    const tokens = [
      ...mingTokens(person, seg.fromYear, seg.toYear, notes),
      ...fengShuiTokens(timeline, seg.fromYear, seg.toYear),
    ];
    const resonance = analyseResonance(DICTIONARY, tokens);
    const fengShuiUsable = timeline.years.some(
      (y) => y.year >= seg.fromYear && y.year <= seg.toYear && y.fengShui.evidenceUsable,
    );

    // 共振层数高者优先，同层数取先验高者 —— 先问最有分辨力的。
    const admitted = resonance
      .flatMap((r) => r.admitted.map((e) => ({ entry: e, resonance: r.resonance })))
      .filter(({ entry }) => !asked.has(entry.id))
      .sort((a, b) => b.resonance - a.resonance || b.entry.prior - a.entry.prior)
      .slice(0, MAX_PER_SEGMENT);
    for (const { entry } of admitted) asked.add(entry.id);

    const drafts: PredictionDraft[] = admitted.map(({ entry, resonance: r }) => ({
      personId: person.id,
      engineVersion: ENGINE_VERSION,
      inputHash,
      window: { fromYear: seg.fromYear, toYear: seg.toYear },
      domain: entry.domain,
      statement: entry.statement,
      candidateXiangIds: [entry.id],
      layers: [entry.source.layer],
      probability: retrospectProbability(entry, r),
      baseRate: null,
      resolution: {
        criterion: `${seg.fromYear}–${seg.toYear} 年间，是否确实发生过：${entry.statement}`,
        judge: '用户自评',
      },
      interventionability: entry.interventionability,
    }));

    segments.push({ ...seg, tokens, resonance, drafts, fengShuiUsable });
  }

  if (timeline.coverage.usableYears === 0) {
    notes.push(
      '全程没有可用的居住史，本次回溯只有命层在说话 —— ' +
        '补上住过的地方（哪怕只记得大致朝向与入住年），风水层才能参与共振。',
    );
  }

  return {
    personId: person.id,
    timeline,
    segments,
    totalDrafts: segments.reduce((n, s) => n + s.drafts.length, 0),
    notes,
  };
}

/**
 * 把计划冻结成账本记录。
 *
 * 这一步之后**内容不可再改** —— 用户接下来看到的、评的，就是这些。
 */
export function commitRetrospect(plan: RetrospectPlan, now: Date): PredictionRecord[] {
  const createdAt = now.toISOString();
  const out: PredictionRecord[] = [];
  for (const seg of plan.segments) {
    for (const draft of seg.drafts) {
      out.push(freezePrediction(draft, newId('pred'), createdAt));
    }
  }
  return out;
}
