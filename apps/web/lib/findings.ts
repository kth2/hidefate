'use client';

/**
 * 把合参结果里散落的 Finding 摊平成「可寻址的一条条断语」。
 *
 * 为什么需要这一层：`Finding` 本身只有 门派 / 置信度 / 断语 / 古法依据 /
 * 影响强度 / 维度 六个字段，**不带宫位**。而界面上要做的几件事 ——
 * 按类别筛、按概率排、点一下跳回原始依据 —— 都要求知道「这条是哪一宫的」。
 * 这里在不改动 core-* 的前提下，把 Finding 与它所在的宫、房间、已算好的
 * 概率重新绑在一起，并给一个稳定 id 作锚点。
 *
 * 这是**纯视图层的重组**：不新增任何推断，概率一律取自
 * `SynthesisResult.predictions` 里已经算好的数，取不到就是 null，绝不自己造。
 */

import type { PalaceIndex, RiskDomain } from '@hidefate/core-fengshui';
import type { Cure, Finding, Prediction, SynthesisResult } from '@hidefate/core-synthesis';

export interface FindingRef {
  /** 稳定 id —— 供 provenance chip 跳转与列表 key 使用。 */
  readonly id: string;
  readonly finding: Finding;
  readonly palace: PalaceIndex | null;
  readonly direction: string | null;
  /** 该宫已标注的房间名。 */
  readonly rooms: readonly string[];
  /** 该宫的山向组合名，如「二五交加」。 */
  readonly combinationName: string | null;
  /**
   * 已算好的概率（0–1）。取该宫、该 Finding 所涉维度中最高的一条预测；
   * 该宫本年没有触发预测时为 null —— 此时不代表 0%，只代表「未出预测」。
   */
  readonly probability: number | null;
  readonly prediction: Prediction | null;
  readonly cures: readonly Cure[];
}

/** 断语强度：概率优先，无概率时退到 Finding 自带的 impact 绝对值。 */
export function refWeight(r: FindingRef): number {
  return r.probability ?? Math.abs(r.finding.impact) * 0.5;
}

/** 按已有的概率模型排序（强的在前）。 */
export function sortByProbability(refs: readonly FindingRef[]): FindingRef[] {
  return [...refs].sort(
    (a, b) => refWeight(b) - refWeight(a) || Math.abs(b.finding.impact) - Math.abs(a.finding.impact),
  );
}

function bestProbability(
  s: SynthesisResult,
  palace: PalaceIndex,
  domains: readonly RiskDomain[],
): Prediction | null {
  const pool = s.predictions.filter(
    (p) => p.palace === palace && (domains.length === 0 || domains.includes(p.domain)),
  );
  return pool.sort((a, b) => b.probability - a.probability)[0] ?? null;
}

/**
 * 摊平全部九宫的 Finding。
 *
 * 同一条断语可能同时出现在宫评估与某条预测里，按「宫 + 断语」去重，
 * 否则界面上会看到两条一模一样的依据。
 */
export function findingRefs(s: SynthesisResult): FindingRef[] {
  const out: FindingRef[] = [];
  const seen = new Set<string>();

  const push = (f: Finding, palace: PalaceIndex) => {
    const key = `${palace}|${f.statement}`;
    if (seen.has(key)) return;
    seen.add(key);
    const a = s.palaces[palace];
    const pred = bestProbability(s, palace, f.domains);
    out.push({
      id: `f-${palace}-${seen.size}`,
      finding: f,
      palace,
      direction: a.direction,
      rooms: a.rooms.map((r) => r.label ?? r.kind),
      combinationName: a.combinationName,
      probability: pred?.probability ?? null,
      prediction: pred,
      cures: pred?.cures.length ? pred.cures : a.cures,
    });
  };

  for (const p of Object.keys(s.palaces).map(Number) as PalaceIndex[]) {
    for (const f of s.palaces[p].findings) push(f, p);
  }
  // 预测里可能带有宫评估中没有的断语（如命理层的个人化断语）
  for (const pr of s.predictions) {
    for (const f of pr.findings) push(f, pr.palace);
  }

  return sortByProbability(out);
}

/** 只保留涉及指定维度的断语。 */
export function refsForDomains(
  refs: readonly FindingRef[],
  domains: readonly RiskDomain[],
): FindingRef[] {
  return refs.filter((r) => r.finding.domains.some((d) => domains.includes(d)));
}

/** 断语摘要 —— 断语常常很长，做 chip 与问句时要截断。 */
export function briefStatement(f: Finding, max = 22): string {
  const s = f.statement.replace(/\s+/g, '');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
