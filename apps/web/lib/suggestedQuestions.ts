'use client';

/**
 * 对话空白页的建议问题 —— 由当前盘面的 Finding 现算，不是一张写死的清单。
 *
 * 为什么不用固定文案：空白对话框对普通用户是最难的一屏。写死的「问问你的
 * 财位在哪」既可能与这间房的实际问题无关，也白白浪费了引擎已经算出来的
 * 那几十条断语。这里改成「拿最该问的那几条断语，替用户把问题问出来」——
 * 每个已出现的类别（健康 / 感情 / 财运 / 事业）至少给一条，用户一眼就知道
 * 这间房当下的症结在哪。
 *
 * 只做措辞包装，不做任何推断：方位、断语、概率全部来自 FindingRef。
 */

import type { RiskDomain } from '@hidefate/core-fengshui';
import { briefStatement, refsForDomains, sortByProbability, type FindingRef } from './findings';

/** 建议问题覆盖的四大类别，顺序即展示顺序。 */
export const SUGGESTION_CATEGORIES: readonly { domain: RiskDomain; label: string }[] = [
  { domain: '健康', label: '健康' },
  { domain: '感情', label: '感情' },
  { domain: '财运', label: '财运' },
  { domain: '事业', label: '事业' },
] as const;

export interface Suggestion {
  readonly question: string;
  /** 由哪一类别生成；补位问题为 null。 */
  readonly domain: RiskDomain | null;
  /** 由哪一条断语生成 —— 点击后可高亮回原文。 */
  readonly refId: string | null;
}

function ask(domain: RiskDomain, r: FindingRef): string {
  const where = r.direction ?? '本宅';
  const room = r.rooms[0] ? `（${r.rooms[0]}）` : '';
  const what = briefStatement(r.finding);
  const pct = r.probability != null ? `本年概率 ${Math.round(r.probability * 100)}%，` : '';

  switch (domain) {
    case '健康':
      return `${where}${room}的「${what}」，${pct}会怎样影响家人身体？该先做什么？`;
    case '感情':
      return `${where}${room}的「${what}」，对夫妻与家人相处有什么影响？怎么调？`;
    case '财运':
      return `${where}${room}的「${what}」，${pct}对钱财进出有多大妨碍？如何补救？`;
    case '事业':
      return `${where}${room}的「${what}」，会不会拖累工作与升迁？该怎么布置？`;
    default:
      return `${where}${room}的「${what}」要紧吗？请说明轻重与化解办法。`;
  }
}

/** 类别都没覆盖满时的补位问题 —— 仍然扣着盘面，不是空泛的客套话。 */
function fillers(refs: readonly FindingRef[]): Suggestion[] {
  const top = refs[0];
  const out: Suggestion[] = [];
  if (top) {
    out.push({
      question: `把以上这些一起看，最该先处理的是哪一条？请按轻重排序说明理由。`,
      domain: null,
      refId: top.id,
    });
    out.push({
      question: `预算与精力都有限，只做一件事的话，${top.direction ?? '这间房'}该怎么动？`,
      domain: null,
      refId: top.id,
    });
    out.push({
      question: '这些结论各由哪几派支持、有多确定？哪几条依据比较薄弱？',
      domain: null,
      refId: top.id,
    });
  }
  return out;
}

/**
 * 生成 4–6 条建议问题。
 *
 * 保证：只要传入的断语非空，返回就非空 —— 空白对话框永远有东西可点。
 */
export function suggestQuestions(refs: readonly FindingRef[], max = 6): Suggestion[] {
  if (refs.length === 0) return [];

  const sorted = sortByProbability(refs);
  const out: Suggestion[] = [];
  const usedRefs = new Set<string>();

  // 第一轮：每个已出现的类别各取最强的一条，保证四类全覆盖
  for (const c of SUGGESTION_CATEGORIES) {
    const pool = refsForDomains(sorted, [c.domain]).filter((r) => !usedRefs.has(r.id));
    const pick = pool[0];
    if (!pick) continue;
    usedRefs.add(pick.id);
    out.push({ question: ask(c.domain, pick), domain: c.domain, refId: pick.id });
  }

  // 第二轮：不足 4 条时，用其余最强的断语补足（含人丁 / 意外 / 官非）
  for (const r of sorted) {
    if (out.length >= 4) break;
    if (usedRefs.has(r.id)) continue;
    usedRefs.add(r.id);
    const d = r.finding.domains[0] ?? null;
    out.push({ question: ask((d ?? '健康') as RiskDomain, r), domain: d ?? null, refId: r.id });
  }

  // 第三轮：仍不足 4 条（断语很少时）用扣着盘面的通用问题补位
  for (const f of fillers(sorted)) {
    if (out.length >= 4) break;
    out.push(f);
  }

  return out.slice(0, Math.max(4, Math.min(max, out.length)));
}
