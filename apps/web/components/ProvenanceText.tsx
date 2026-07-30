'use client';

/**
 * 带溯源 chip 的回答正文，与其下方的「依据」清单。
 *
 * 两者配套：chip 只负责「指过去」，真正的门派 / 置信度 / 古法依据都在
 * 清单里完整展开。这样正文仍是通顺可读的中文，想追根究底的人点一下就到。
 */

import { useCallback } from 'react';
import type { FindingRef } from '../lib/findings';
import { annotateClaims, type ClaimKind } from '../lib/provenance';

const CLAIM_TONE: Record<ClaimKind, string> = {
  宫位: 'border-cinnabar/35 bg-cinnabar/[0.07] text-cinnabar',
  星组合: 'border-gold/50 bg-gold/[0.10] text-gold',
  概率: 'border-jade/40 bg-jade/[0.08] text-jade',
};

/** 依据条目的 DOM id —— chip 与清单靠它对上。 */
export function sourceDomId(refId: string): string {
  return `prov-${refId}`;
}

export function ProvenanceText({
  text,
  refs,
  onCite,
}: {
  text: string;
  refs: readonly FindingRef[];
  onCite: (refId: string) => void;
}) {
  const segments = annotateClaims(text, refs);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onCite(s.refId)}
            title={`查看这条${s.claimKind}的门派、置信度与古法依据`}
            className={`mx-[1px] inline rounded border px-1 py-[1px] align-baseline text-[0.8125rem] leading-tight ${CLAIM_TONE[s.claimKind]}`}
          >
            {s.text}
          </button>
        ),
      )}
    </p>
  );
}

/** 依据清单。被点中的那条高亮，其余保持安静。 */
export function FindingSources({
  refs,
  activeId,
}: {
  refs: readonly FindingRef[];
  activeId: string | null;
}) {
  if (refs.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="section-title px-1">回答所引用的依据（{refs.length}）</h3>
      {refs.map((r) => (
        <article
          key={r.id}
          id={sourceDomId(r.id)}
          className={`scroll-mt-20 rounded-2xl border p-3 transition ${
            activeId === r.id ? 'border-cinnabar bg-cinnabar/[0.05]' : 'border-rice-line bg-white'
          }`}
        >
          <div className="mb-1.5 flex flex-wrap gap-1">
            {r.direction && <span className="tag border-rice-line text-ink-soft">{r.direction}</span>}
            {r.finding.schools.map((s) => (
              <span key={s} className="tag border-rice-line text-ink-mute">
                {s}
              </span>
            ))}
            <span className="tag border-rice-line text-ink-mute">置信度 {r.finding.confidence}</span>
            {r.probability != null && (
              <span className="tag border-jade/40 bg-jade/10 text-jade">
                本年概率 {Math.round(r.probability * 100)}%
              </span>
            )}
          </div>
          <p className="text-[0.9375rem] leading-relaxed">{r.finding.statement}</p>
          <p className="mt-1.5 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
            古法依据：{r.finding.principle}
          </p>
        </article>
      ))}
    </section>
  );
}

/** 点 chip 后滚到对应依据。 */
export function useScrollToSource(setActive: (id: string) => void) {
  return useCallback(
    (refId: string) => {
      setActive(refId);
      // 依据条目就在同一页下方，滚过去比弹层更不打断阅读
      document.getElementById(sourceDomId(refId))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [setActive],
  );
}
