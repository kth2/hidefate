'use client';

/**
 * 回答之后的追问建议。
 *
 * 不是通用的「还想问点什么」——那种东西点了也没用。这里读**这一条回答
 * 实际提到了哪几个宫、引用了哪几条断语**，再针对那几处生成追问。
 * 模型答完「西北角有二五交加」之后，用户十有八九想问的是「凭什么这么说」
 * 与「那我该怎么办」，把这两句直接做成可点的 chip，省掉一次打字。
 *
 * 匹配全部基于既有数据（方位名、组合名、断语原文），不含任何语义推断。
 */

import { briefStatement, refWeight, type FindingRef } from './findings';

export interface FollowUp {
  readonly question: string;
  /** 由哪一条断语引出；通用追问为 null。 */
  readonly refId: string | null;
}

/** 回答里提到了哪几条断语。按「被提及的强度」从高到低。 */
export function referencedRefs(reply: string, refs: readonly FindingRef[]): FindingRef[] {
  const text = reply.replace(/\s+/g, '');
  if (!text) return [];

  const hits: { ref: FindingRef; score: number }[] = [];
  for (const r of refs) {
    let score = 0;
    if (r.direction && text.includes(r.direction)) score += 2;
    if (r.combinationName && text.includes(r.combinationName)) score += 3;
    for (const room of r.rooms) if (room && text.includes(room)) score += 1;
    // 断语原文往往被模型改写，故取前 6 字做特征片段
    const frag = r.finding.statement.replace(/\s+/g, '').slice(0, 6);
    if (frag.length >= 4 && text.includes(frag)) score += 3;
    if (r.probability != null && text.includes(`${Math.round(r.probability * 100)}%`)) score += 2;
    if (score > 0) hits.push({ ref: r, score });
  }

  return hits
    .sort((a, b) => b.score - a.score || refWeight(b.ref) - refWeight(a.ref))
    .map((h) => h.ref);
}

/** 针对某条被引用的断语，按顺序可生成的三种追问。 */
function anglesFor(r: FindingRef): string[] {
  const where = r.direction ?? '这一处';
  const what = briefStatement(r.finding, 14);
  const out = [
    `${where}的「${what}」凭什么这么断？请列出支持它的门派与古法原文。`,
    `${where}这条具体怎么化解？说明放什么、放哪里、以及为什么这样化。`,
  ];
  if (r.probability != null) {
    out.push(`${where}这条${Math.round(r.probability * 100)}% 的概率是怎么算出来的？哪些因素权重最大？`);
  } else {
    out.push(`${where}这条若一直不处理，往后几年会怎么演变？`);
  }
  if (r.rooms.length) {
    out.push(`${where}现在是${r.rooms[0]}，换个用途或挪走里面的人有用吗？`);
  }
  return out;
}

/** 一条追问都提不出时的兜底 —— 仍指向「怎么做」，不空泛。 */
const GENERIC: readonly string[] = [
  '刚才这些结论里，哪一条最该先动手？请按轻重给个顺序。',
  '以上判断分别有多确定？哪几条依据比较薄弱、需要补资料？',
  '这些化解里，有没有不花钱、今天就能做的？',
];

/**
 * 生成 2–3 条追问。
 *
 * 回答提到了 ≥2 个宫时，每个宫各出一条（角度不同），让用户能顺着任一条
 * 往下追；只提到 1 个宫时，就对这个宫从「依据 / 化解 / 概率」三个角度追。
 */
export function deriveFollowUps(
  reply: string,
  refs: readonly FindingRef[],
  max = 3,
): FollowUp[] {
  const cap = Math.max(2, Math.min(3, max));
  const referenced = referencedRefs(reply, refs);
  const out: FollowUp[] = [];
  const seen = new Set<string>();

  const push = (question: string, refId: string | null) => {
    if (out.length >= cap || seen.has(question)) return;
    seen.add(question);
    out.push({ question, refId });
  };

  if (referenced.length >= 2) {
    // 多个宫：每宫一条，角度轮换，避免三条问法雷同
    referenced.slice(0, cap).forEach((r, i) => push(anglesFor(r)[i % 2]!, r.id));
  } else if (referenced.length === 1) {
    for (const q of anglesFor(referenced[0]!)) push(q, referenced[0]!.id);
  }

  for (const g of GENERIC) push(g, null);
  return out.slice(0, cap);
}
