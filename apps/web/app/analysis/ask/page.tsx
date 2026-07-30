'use client';

/**
 * 问答 —— 常见问题按居家／商业分流，并把全盘（含峦头）交给作答方。
 */

import { useMemo, useState } from 'react';
import {
  answerBestPalaceFor,
  buildAnswerContext,
  checkLayout,
  computeComposite,
  findOpportunities,
  type FaqItem,
} from '@hidefate/core-synthesis';
import { scenarioOf } from '@hidefate/core-fengshui';
import { AppBar, Empty, Expandable, Skeleton } from '../../../components/mobile/ui';
import { FaqPicker } from '../../../components/FaqPicker';
import { AiChat } from '../../../components/AiChat';
import { useProperty } from '../../../lib/PropertyContext';

type Mode = '常见问题' | 'AI 对话' | '离线作答';

export default function AskPage() {
  const { property, result, members, loading } = useProperty();
  const [mode, setMode] = useState<Mode>('常见问题');
  const [pendingFaq, setPendingFaq] = useState<{ question: string; lookAt: readonly string[] } | null>(null);
  const [offlineAnswer, setOfflineAnswer] = useState<string | null>(null);

  const composite = useMemo(
    () => (result ? computeComposite(result, property?.xingShi ?? []) : null),
    [result, property?.xingShi],
  );
  const layoutIssues = useMemo(() => (result ? checkLayout(result) : []), [result]);
  const opportunities = useMemo(
    () => (result ? findOpportunities(result, members) : []),
    [result, members],
  );

  const extraContext = useMemo(
    () => ({
      composite,
      layoutIssues: layoutIssues.map((i) => ({
        title: i.title,
        severity: i.severity,
        statement: i.finding.statement,
      })),
      opportunities: opportunities.map((o) => ({
        kind: o.kind,
        direction: o.direction,
        headline: o.headline,
      })),
    }),
    [composite, layoutIssues, opportunities],
  );

  const fullContext = useMemo(
    () => (result ? buildAnswerContext(result, { members, ...extraContext }) : null),
    [result, members, extraContext],
  );

  if (loading) {
    return (
      <>
        <AppBar title="问答" back="/me" />
        <div className="px-4 py-4">
          <Skeleton lines={4} />
        </div>
      </>
    );
  }

  if (!property || !result) {
    return (
      <>
        <AppBar title="问答" back="/me" />
        <div className="px-4 py-4">
          <Empty title="请先建立房屋" desc="问答要基于某一处房屋的实际盘面。" />
        </div>
      </>
    );
  }

  const scenario = scenarioOf(property.buildingType);

  function pickFaq(f: FaqItem) {
    setPendingFaq({ question: f.question, lookAt: f.lookAt });
    setMode('AI 对话');
  }

  return (
    <>
      <AppBar title="问答" subtitle={`${property.name} · ${scenario}`} back="/me" />

      <div className="space-y-4 px-4 py-4">
        <div className="seg-row">
          {(['常见问题', 'AI 对话', '离线作答'] as Mode[]).map((m) => (
            <button key={m} type="button" className={`seg ${mode === m ? 'seg-on' : ''}`} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>

        {composite?.veto.triggered && (
          <div className="rounded-xl border-2 border-risk-crit bg-risk-crit/[0.07] p-3.5 text-[0.875rem] leading-relaxed">
            <b className="text-risk-crit">⚠ 形煞当前</b>
            ：本宅已触发否决 —— 理气虽好，峦头有缺。问答时会先谈化解形煞，再论布局催财。
          </div>
        )}

        {mode === '常见问题' && (
          <>
            <p className="card card-sub">
              以下为{scenario === '居家' ? '住家' : '商铺／办公'}最常问到的问题，已按场景过滤。
              点任一条即转入 AI 对话，并自动带上该问题「该看盘上何处」的指引。
            </p>
            <FaqPicker buildingType={property.buildingType} onPick={pickFaq} />
          </>
        )}

        {mode === 'AI 对话' && (
          <AiChat
            result={result}
            members={members}
            extraContext={extraContext}
            pendingFaq={pendingFaq}
            onFaqConsumed={() => setPendingFaq(null)}
          />
        )}

        {mode === '离线作答' && (
          <div className="space-y-3">
            <p className="card card-sub">
              完全离线，输出固定「答案 / 理 / 化解建议」三段，数字直接来自引擎。
              文字较格式化，但断不会错。
            </p>
            <div className="grid gap-2">
              {(scenario === '居家'
                ? [
                    { q: '书房或办公桌设在哪一方最有利考试升学？', mode: '最吉' as const, d: '事业' as const },
                    { q: '主卧设在哪一方对夫妻感情最有利？', mode: '最吉' as const, d: '感情' as const },
                    { q: '今年哪一方最不利健康，须优先化解？', mode: '最凶' as const, d: '健康' as const },
                  ]
                : [
                    { q: '收银台或保险柜放哪一方最旺财？', mode: '最吉' as const, d: '财运' as const },
                    { q: '老板位设在哪一方最有靠？', mode: '最吉' as const, d: '事业' as const },
                    { q: '今年哪一方最忌动土装修？', mode: '最凶' as const, d: undefined },
                  ]
              ).map((p) => (
                <button
                  key={p.q}
                  type="button"
                  className="btn btn-block"
                  onClick={() => setOfflineAnswer(answerBestPalaceFor(result, p.q, p.mode, p.d).formatted)}
                >
                  {p.q}
                </button>
              ))}
            </div>

            {offlineAnswer && (
              <section className="card">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="card-title mb-0">回答</h3>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void navigator.clipboard?.writeText(offlineAnswer)}
                  >
                    复制
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-[0.875rem] leading-relaxed">{offlineAnswer}</pre>
              </section>
            )}
          </div>
        )}

        {fullContext && (
          <Expandable title="送给 AI 的完整上下文（可复制到任何模型）">
            <p className="mb-2 text-[0.8125rem] leading-relaxed text-ink-mute">
              已含峦头、综合分拆解、布局体检、吉方、成员命理。system 提示明令模型
              <b className="text-ink-soft">不得修改任何星位与概率</b>，且须「先化形煞，再论布局」。
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg border border-rice-line bg-rice-deep/40 p-3 text-[0.6875rem] leading-relaxed">
              {fullContext.system}
              {'\n\n===== 事实 =====\n'}
              {fullContext.facts}
            </pre>
            <button
              type="button"
              className="btn btn-sm mt-2"
              onClick={() =>
                void navigator.clipboard?.writeText(
                  `${fullContext.system}\n\n===== 事实 =====\n${fullContext.facts}`,
                )
              }
            >
              复制完整上下文
            </button>
          </Expandable>
        )}
      </div>
    </>
  );
}
