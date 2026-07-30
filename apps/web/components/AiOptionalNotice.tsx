'use client';

/**
 * AI 可选性声明卡 —— 在 AI 设置与 AI 对话两处常驻显示。
 *
 * 「常驻」是刻意的：这不是一次性的引导提示，而是每次看到 AI 相关界面时
 * 都该被重申的边界。用户随时可以不用 AI，App 的能力不会因此少一分。
 */

import { AI_OPTIONAL_NOTICE, AI_OPTIONAL_NOTICE_ONE_LINE } from '../lib/aiNotice';

export function AiOptionalNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p
        data-testid="ai-optional-notice"
        className="rounded-xl border border-jade/30 bg-jade/[0.06] px-3 py-2 text-[0.75rem] leading-relaxed text-ink-soft"
      >
        {AI_OPTIONAL_NOTICE_ONE_LINE}
      </p>
    );
  }

  return (
    <section
      data-testid="ai-optional-notice"
      className="rounded-2xl border border-jade/30 bg-jade/[0.06] p-4"
    >
      <h2 className="mb-2 font-serif text-[0.9375rem] font-semibold text-jade">
        {AI_OPTIONAL_NOTICE.title}
      </h2>
      <p className="text-[0.8125rem] leading-relaxed text-ink-soft">{AI_OPTIONAL_NOTICE.body}</p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
        <b className="text-ink">{AI_OPTIONAL_NOTICE.tail}</b>
      </p>
      <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-mute">
        {AI_OPTIONAL_NOTICE.precedence}
      </p>
    </section>
  );
}
