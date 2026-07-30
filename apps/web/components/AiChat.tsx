'use client';

/**
 * AI 对话 —— 带完整宅盘上下文。
 *
 * 边界很清楚：确定性引擎已经把星位、宫位、概率、化解全部算好，
 * 这里只是把它们连同用户的问题交给模型，让模型写成通顺中文。
 * system 提示里明令禁止改数（见 core-synthesis 的 buildAnswerContext），
 * 所以模型能做的只有「解释」，不能「重算」。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerContextOptions, Member, SynthesisResult } from '@hidefate/core-synthesis';
import { buildAnswerContext, faqHighlights } from '@hidefate/core-synthesis';
import { scenarioOf } from '@hidefate/core-fengshui';
import { findingRefs } from '../lib/findings';
import { suggestQuestions } from '../lib/suggestedQuestions';
import { chatStream, type AiConfig, type ChatMessage } from '../lib/ai';
import { loadSettings, type AppSettings } from '../lib/db';
import { AiOptionalNotice } from './AiOptionalNotice';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** 流式进行中 */
  streaming?: boolean;
  error?: string;
}

/** 兜底建议（无场景信息时用）。实际会按居家／商业从 FAQ 库取。 */
const FALLBACK_SUGGESTIONS = [
  '整体来看，我这里最大的问题是什么？请按轻重排序。',
  '预算有限，只做一件事的话，先做哪一件？',
  '本宅的财位在哪一方？现在有没有用起来？',
];

export function AiChat({
  result,
  members,
  simulation,
  /** 峦头与综合分拆解、布局体检、吉方 —— 一并送入上下文。 */
  extraContext,
  /** 用户从常见问题选单点进来的那一条。 */
  pendingFaq,
  onFaqConsumed,
}: {
  result: SynthesisResult;
  members: readonly Member[];
  simulation?: AnswerContextOptions['simulation'];
  extraContext?: Pick<AnswerContextOptions, 'composite' | 'layoutIssues' | 'opportunities'>;
  pendingFaq?: { question: string; lookAt: readonly string[] } | null;
  onFaqConsumed?: () => void;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  // 从常见问题选单点进来的问题，自动发出（上下文已带上「该看何处」）
  useEffect(() => {
    if (!pendingFaq || busy || !settings) return;
    void send(pendingFaq.question);
    onFaqConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFaq, settings]);

  const context = useMemo(
    () =>
      buildAnswerContext(result, {
        members,
        simulation: simulation ?? null,
        composite: extraContext?.composite ?? null,
        layoutIssues: extraContext?.layoutIssues,
        opportunities: extraContext?.opportunities,
        faq: pendingFaq ?? null,
      }),
    [result, members, simulation, extraContext, pendingFaq],
  );

  const refs = useMemo(() => findingRefs(result), [result]);

  /**
   * 建议问题优先由本盘的断语现算 —— 一间房真正的症结在哪，引擎已经知道了，
   * 没道理还让用户面对一个空白输入框自己猜该问什么。
   * 只有在完全没有断语（极干净的盘）时才退回 FAQ 库与兜底文案。
   */
  const suggestions = useMemo(() => {
    const fromFindings = suggestQuestions(refs);
    if (fromFindings.length) return fromFindings.map((s) => s.question);
    const s = faqHighlights(scenarioOf(result.buildingType));
    return s.length ? s.map((f) => f.question) : FALLBACK_SUGGESTIONS;
  }, [refs, result.buildingType]);

  const configured = Boolean(settings?.aiBaseUrl && settings?.aiModel);
  const consented = Boolean(settings?.aiConsent);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy || !settings) return;
      const question = text.trim();
      setInput('');

      const history: ChatMessage[] = [
        { role: 'system', content: `${context.system}\n\n===== 事实（由确定性引擎算出，不可修改） =====\n${context.facts}` },
        // 只带最近 8 轮，避免上下文无限膨胀；事实区块每轮都会重新附上，故不会丢失盘面。
        ...turns.slice(-8).map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
        { role: 'user', content: question },
      ];

      setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '', streaming: true }]);
      setBusy(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const cfg: AiConfig = {
        baseUrl: settings.aiBaseUrl ?? '',
        apiKey: settings.aiApiKey ?? '',
        model: settings.aiModel,
        direct: settings.aiDirect,
      };

      try {
        await chatStream(
          cfg,
          history,
          (delta) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + delta };
              return next;
            });
          },
          ctrl.signal,
        );
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, streaming: false };
          return next;
        });
      } catch (e) {
        const msg = ctrl.signal.aborted ? '已中断。' : e instanceof Error ? e.message : String(e);
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, streaming: false, error: msg, content: last.content };
          }
          return next;
        });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, settings, context, turns],
  );

  if (!settings) return <p className="text-sm text-ink-mute">读取设置中…</p>;

  if (!configured) {
    return (
      <div className="space-y-3">
        <AiOptionalNotice />
        <div className="card">
          <h3 className="card-title">AI 对话尚未配置</h3>
          <p className="text-sm leading-relaxed text-ink-soft">
            填入任一 OpenAI 兼容端点的 Base URL 与 API Key，即可从该 API 拉取<b>实际可用的模型列表</b>并选用。
          </p>
          <Link href="/settings" className="btn btn-primary mt-3">
            前往 AI 设置
          </Link>
        </div>
      </div>
    );
  }

  if (!consented) {
    return (
      <div className="space-y-3">
        <AiOptionalNotice />
        <div className="card border-gold/40 bg-gold/5">
        <h3 className="card-title text-gold">需要你的确认</h3>
        <p className="text-sm leading-relaxed text-ink-soft">
          向 AI 提问会把本宅的九宫盘、房间布局，以及成员的姓名与出生资料，
          作为上下文发送给你所选的供应商（{settings.aiBaseUrl}）。
          这是本 App 唯一会把数据送出本机的功能。
        </p>
        <Link href="/settings" className="btn btn-primary mt-3">
          到设置中确认
        </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AiOptionalNotice compact />

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
        <span className="tag border-rice-line">
          模型 <b className="font-mono">{settings.aiModel}</b>
        </span>
        <span className="tag border-rice-line">{settings.aiDirect ? '浏览器直连' : '经本机转发'}</span>
        <span className="tag border-jade/40 bg-jade/10 text-jade">
          已附带完整盘面（九宫 · {members.length} 位成员 · {result.qiMenEnabled ? '三派' : '两派'}
          {simulation ? ' · 模拟中' : ''}）
        </span>
        <Link href="/settings" className="ml-auto text-cinnabar hover:underline">
          更改设置
        </Link>
      </div>

      <div ref={scrollRef} className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-rice-line bg-white/60 p-3">
        {turns.length === 0 && (
          <div className="py-2">
            <p className="mb-2 px-1 text-sm text-ink-mute">
              以下问题由这间房<b className="text-ink-soft">当前的断语现算</b>，点一条即问。
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="w-full rounded-xl border border-rice-line bg-white px-3 py-2.5 text-left text-[0.8125rem] leading-relaxed transition active:bg-rice-deep/40"
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                t.role === 'user' ? 'bg-cinnabar text-white' : 'border border-rice-line bg-white'
              }`}
            >
              {t.content ? (
                <pre className="whitespace-pre-wrap font-sans">{t.content}</pre>
              ) : t.streaming ? (
                <span className="text-ink-mute">思考中…</span>
              ) : null}
              {t.streaming && t.content && <span className="ml-0.5 animate-pulse">▍</span>}
              {t.error && <p className="mt-1.5 border-t border-rice-line pt-1.5 text-xs text-cinnabar">{t.error}</p>}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <input
          className="field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例：预算只够做一件事，先处理哪里？"
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
            中断
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
            发送
          </button>
        )}
        {turns.length > 0 && !busy && (
          <button type="button" className="btn" onClick={() => setTurns([])}>
            清空
          </button>
        )}
      </form>

    </div>
  );
}
