'use client';

/**
 * 置信度戳记与阶梯。
 *
 * 「置信度：中」这四个字对用户没有用 —— 他既不知道中是因为什么，
 * 也不知道该做什么才能变高。这里把它拆成一张可执行的清单：
 * 缺哪一项、补上值几分、大概要花多少功夫、点一下跳到收集它的那一步。
 *
 * 分数与增量全部取自 lib/confidence.ts，而那份文件是 assess.ts 既有降级
 * 逻辑的逐项拆解 —— 界面这一层不产生任何新数字。
 */

import Link from 'next/link';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import type { ConfidenceLevel, Member } from '@hidefate/core-synthesis';
import {
  CONFIDENCE_MAX,
  LADDER_THRESHOLD,
  assessConfidence,
  confidenceLadder,
  confidenceTone,
} from '../lib/confidence';

/** 置信度戳记 —— 一眼看到「这份结论有多硬」。 */
export function ConfidenceStamp({
  level,
  percent,
  compact = false,
}: {
  level: ConfidenceLevel;
  percent: number;
  compact?: boolean;
}) {
  return (
    <span
      data-testid="confidence-stamp"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[0.75rem] leading-[1.6] ${confidenceTone(level)}`}
    >
      <span className="font-medium">置信度 {level}</span>
      {!compact && <span className="tabular-nums opacity-80">{Math.round(percent * 100)}%</span>}
    </span>
  );
}

/**
 * 阶梯本体。
 *
 * @param collapsible 折叠成一行摘要，展开才看细项 —— 分析页顶部用这个，
 *                    免得把真正要看的内容挤下去。
 */
export function ConfidenceLadder({
  profile,
  members,
  collapsible = false,
  title = '把这份判断变得更硬',
}: {
  profile: PropertyProfile | null;
  members: readonly Member[];
  collapsible?: boolean;
  title?: string;
}) {
  const state = assessConfidence(profile, members);
  const rows = confidenceLadder(profile, members);
  if (rows.length === 0) return null;

  const body = (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-rice-line bg-white p-3">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium leading-snug">{r.title}</span>
              <span className="mt-0.5 block text-[0.75rem] text-ink-mute">{r.effort}</span>
            </span>
            <span
              className={`shrink-0 rounded-lg border px-2 py-0.5 text-[0.75rem] tabular-nums ${
                r.levelsUp ? 'border-jade/45 bg-jade/[0.09] text-jade' : 'border-rice-line text-ink-mute'
              }`}
            >
              +{Math.round(r.gainPercent * 100)}%
            </span>
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">{r.why}</p>
          <div className="mt-2 flex items-center gap-2">
            <Link href={r.href} className="btn btn-sm">
              {r.cta} →
            </Link>
            {r.levelsUp && (
              <span className="text-[0.75rem] text-jade">补上这一条，整体等级会升一级</span>
            )}
          </div>
        </div>
      ))}
      <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
        百分比来自引擎既有的分级降级记分（满分 {CONFIDENCE_MAX} 分），不是另算的一套。
        一项都不补也能照常使用 —— 只是结论会停在方位这一层。
      </p>
    </div>
  );

  if (!collapsible) {
    return (
      <section data-testid="confidence-ladder">
        <div className="mb-2 flex items-center gap-2 px-1">
          <h2 className="section-title mb-0">{title}</h2>
          <ConfidenceStamp level={state.level} percent={state.percent} />
        </div>
        {body}
      </section>
    );
  }

  return (
    <details data-testid="confidence-ladder" className="overflow-hidden rounded-2xl border border-gold/40 bg-gold/[0.05]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3">
        <ConfidenceStamp level={state.level} percent={state.percent} />
        <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink-soft">
          还有 {rows.length} 项可补，最多再涨{' '}
          {Math.round(rows.reduce((s, r) => s + r.gainPercent, 0) * 100)}%
        </span>
        <span className="shrink-0 text-[0.75rem] text-cinnabar">展开</span>
      </summary>
      <div className="border-t border-gold/30 p-3">{body}</div>
    </details>
  );
}

/**
 * 分析页顶部的自动提示 —— 置信度够高时什么都不显示。
 *
 * 阈值 80%：低于它说明还有整整一分以上的资料没补，值得打断一次；
 * 高于它再提示就是骚扰了。
 */
export function ConfidenceGate({
  profile,
  members,
}: {
  profile: PropertyProfile | null;
  members: readonly Member[];
}) {
  const state = assessConfidence(profile, members);
  if (state.percent >= LADDER_THRESHOLD) return null;
  return <ConfidenceLadder profile={profile} members={members} collapsible />;
}
