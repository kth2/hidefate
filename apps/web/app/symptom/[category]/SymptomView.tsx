'use client';

/**
 * 单个症状的详情页。
 *
 * 一屏回答三件事：谁在拖后腿（前三条断语，带门派 / 置信度 / 古法依据）、
 * 今天能先做什么（成本最低的一条化解）、想看全貌去哪（房屋体检）。
 *
 * 没有断语时不给空状态 —— 改列「缺什么资料、为什么、去哪补」。
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { RISK_COLOR } from '@hidefate/core-synthesis';
import { AppBar, Empty, Expandable, Skeleton } from '../../../components/mobile/ui';
import { findingRefs } from '../../../lib/findings';
import { useProperty } from '../../../lib/PropertyContext';
import {
  categoryById,
  findingsForCategory,
  lowestCostCure,
  missingInputs,
} from '../../../lib/symptoms';

export function SymptomView({ categoryId }: { categoryId: string }) {
  const { property, result, members, loading } = useProperty();
  const cat = categoryById(categoryId);

  const refs = useMemo(() => (result ? findingRefs(result) : []), [result]);
  const matched = useMemo(() => (cat ? findingsForCategory(refs, cat) : []), [refs, cat]);
  const top3 = matched.slice(0, 3);
  const promoted = useMemo(() => lowestCostCure(top3), [top3]);
  const missing = useMemo(
    () => (cat ? missingInputs(result, members, cat) : []),
    [result, members, cat],
  );

  if (!cat) {
    return (
      <>
        <AppBar title="不顺之处" back="/" />
        <div className="px-4 py-4">
          <Empty title="没有这一类" desc="回首页重新选一项。" />
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppBar title={cat.label} back="/" />
        <div className="px-4 py-4">
          <Skeleton lines={5} />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title={cat.label} subtitle={property?.name} back="/" />

      <div className="space-y-4 px-4 py-4">
        <p className="card card-sub">
          以下是本盘中与「{cat.label}」相关的断语，按引擎已算好的概率从重到轻排。
          结论与数字都来自本机推算，此页只做筛选与排序。
        </p>

        {top3.length > 0 ? (
          <>
            {/* ── 今天就能做 ── */}
            {promoted && (
              <section className="rounded-2xl border-2 border-jade/50 bg-jade/[0.06] p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="tag border-jade/50 bg-jade/15 text-jade">今天就能做</span>
                  <span className="text-[0.75rem] text-ink-mute">
                    {promoted.ref.direction}
                    {promoted.cure.room && ` · ${promoted.cure.room}`}
                  </span>
                </div>
                <p className="text-[0.9375rem] font-medium leading-relaxed">{promoted.cure.action}</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                  理据：{promoted.cure.rationale}
                </p>
                {promoted.cure.avoid.length > 0 && (
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-cinnabar">
                    切忌：{promoted.cure.avoid.join('、')}
                  </p>
                )}
                <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-mute">
                  这是下面三条里最不花钱、不动工的一条 —— 先做它，其余的可以从容安排。
                </p>
              </section>
            )}

            {/* ── 主要来自哪三处 ── */}
            <section>
              <h2 className="section-title">主要来自这三处</h2>
              <div className="space-y-2">
                {top3.map((r, i) => (
                  <Expandable
                    key={r.id}
                    defaultOpen={i === 0}
                    title={
                      <span className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] text-white">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] text-ink-mute">
                            {r.direction}
                            {r.rooms.length > 0 && ` · ${r.rooms.join('、')}`}
                          </span>
                          <span className="block line-clamp-2 text-[0.875rem] leading-snug">
                            {r.finding.statement}
                          </span>
                        </span>
                      </span>
                    }
                    badge={
                      r.probability != null ? (
                        <span
                          className="tag shrink-0 text-white"
                          style={{ background: RISK_COLOR[r.prediction?.riskLevel ?? '留意'] }}
                        >
                          {Math.round(r.probability * 100)}%
                        </span>
                      ) : undefined
                    }
                  >
                    <div className="mb-2 flex flex-wrap gap-1">
                      {r.finding.schools.map((s) => (
                        <span key={s} className="tag border-rice-line text-ink-mute">
                          {s}
                        </span>
                      ))}
                      <span className="tag border-rice-line text-ink-mute">
                        置信度 {r.finding.confidence}
                      </span>
                    </div>
                    <p className="text-[0.9375rem] leading-relaxed">{r.finding.statement}</p>
                    <p className="mt-2 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                      古法依据：{r.finding.principle}
                    </p>
                    {r.cures.length > 0 && (
                      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.8125rem] leading-relaxed text-ink-soft">
                        {r.cures.slice(0, 3).map((c, k) => (
                          <li key={k}>
                            〔{c.urgency}〕{c.action}
                          </li>
                        ))}
                      </ol>
                    )}
                  </Expandable>
                ))}
              </div>
              {matched.length > 3 && (
                <p className="mt-2 px-1 text-[0.75rem] text-ink-mute">
                  另有 {matched.length - 3} 条较轻的同类断语，可在房屋体检里看全。
                </p>
              )}
            </section>
          </>
        ) : (
          /* ── 没有断语时：说清楚缺什么，而不是「暂无数据」 ── */
          <section>
            <h2 className="section-title">这一类目前推不出结论</h2>
            <p className="card card-sub mb-2">
              这不代表「没问题」，而是资料还不够。缺下面这些，所以对应的断语出不来：
            </p>
            <div className="space-y-2">
              {missing.map((m) => (
                <div key={m.what} className="card">
                  <p className="text-[0.9375rem] font-medium leading-snug">缺：{m.what}</p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">{m.why}</p>
                  <Link href={m.href} className="btn btn-sm mt-2">
                    {m.cta} →
                  </Link>
                </div>
              ))}
              {missing.length === 0 && (
                <div className="card">
                  <p className="text-[0.9375rem] leading-relaxed">
                    资料是齐的，本盘在「{cat.label}」这一维度确实没有触发到需要提请注意的断语。
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                    可以到房屋体检看看全屋各方位的完整评分。
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        <Link href="/house" className="btn btn-primary btn-block">
          查看完整房屋体检
        </Link>
        <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
          本工具为传统文化研究与生活参考之用，不构成医疗、法律或投资建议。健康疑虑请就医。
        </p>
      </div>
    </>
  );
}
