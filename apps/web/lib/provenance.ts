'use client';

/**
 * 逐条溯源 —— 把回答里的每一处「宫位 / 星组合 / 概率」变成可点的 chip。
 *
 * 这是 README 硬规则 #2（每条结论都要能回答「哪几派支持、有多确定、
 * 依据哪条古法」）在 AI 对话里的落点。模型写出来的是通顺中文，读起来顺，
 * 但也正因为顺，用户没法分辨哪一句有盘面撑腰、哪一句只是措辞。
 * 于是这里做后处理：凡是能对上盘面的词，就变成 chip，点一下跳到那条
 * Finding 原文，露出它的门派、置信度与古法依据。
 *
 * **对不上的一律不标**。宁可少标几个，也不能给一句没有依据的话套上
 * 「有依据」的外观 —— 那比不标更糟。
 */

import type { FindingRef } from './findings';

export type ClaimKind = '宫位' | '星组合' | '概率';

export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'claim'; readonly text: string; readonly refId: string; readonly claimKind: ClaimKind };

/** 方位的常见别写 —— 模型爱写「北方」「坎宫」，指的都是同一处。 */
const DIRECTION_ALIASES: Record<string, readonly string[]> = {
  正北: ['正北', '北方', '坎宫'],
  西南: ['西南', '坤宫'],
  正东: ['正东', '东方', '震宫'],
  东南: ['东南', '巽宫'],
  中宫: ['中宫', '中央'],
  西北: ['西北', '乾宫'],
  正西: ['正西', '西方', '兑宫'],
  东北: ['东北', '艮宫'],
  正南: ['正南', '南方', '离宫'],
};

interface Matcher {
  readonly token: string;
  readonly refId: string;
  readonly claimKind: ClaimKind;
}

/** 由断语集合生成可识别的词表。同一个词若指向多条断语，取概率最高的那条。 */
export function buildMatchers(refs: readonly FindingRef[]): Matcher[] {
  const byToken = new Map<string, Matcher>();
  const claim = (token: string, refId: string, claimKind: ClaimKind) => {
    if (!token || byToken.has(token)) return;
    byToken.set(token, { token, refId, claimKind });
  };

  // refs 已按概率降序，先到先得即「概率最高的那条优先认领这个词」
  for (const r of refs) {
    if (r.direction) {
      for (const alias of DIRECTION_ALIASES[r.direction] ?? [r.direction]) claim(alias, r.id, '宫位');
    }
    if (r.combinationName) claim(r.combinationName, r.id, '星组合');
    if (r.probability != null) claim(`${Math.round(r.probability * 100)}%`, r.id, '概率');
  }

  // 长词优先，避免「东南」被「东」之类的短词抢先切断
  return [...byToken.values()].sort((a, b) => b.token.length - a.token.length);
}

/**
 * 把一段回答切成「普通文字」与「可溯源的断言」。
 *
 * 逐字符扫描，命中即整词取走，不做跨行或跨句的语义判断 ——
 * 这里要的是可预期，不是聪明。
 */
export function annotateClaims(text: string, refs: readonly FindingRef[]): Segment[] {
  if (!text) return [];
  const matchers = buildMatchers(refs);
  if (matchers.length === 0) return [{ kind: 'text', text }];

  const out: Segment[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf });
    buf = '';
  };

  while (i < text.length) {
    const hit = matchers.find((m) => text.startsWith(m.token, i));
    if (hit) {
      flush();
      out.push({ kind: 'claim', text: hit.token, refId: hit.refId, claimKind: hit.claimKind });
      i += hit.token.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  flush();
  return out;
}

/** 这段回答实际引用到的断语 id（按出现顺序、去重）。 */
export function citedRefIds(text: string, refs: readonly FindingRef[]): string[] {
  const seen: string[] = [];
  for (const s of annotateClaims(text, refs)) {
    if (s.kind === 'claim' && !seen.includes(s.refId)) seen.push(s.refId);
  }
  return seen;
}
