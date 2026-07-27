'use client';

/**
 * 问答 —— 统一「答案 + 理 + 化解建议」三段格式。
 *
 * 结论与概率全部由确定性引擎算出；接了 AI 也只是润色文字，
 * 不允许改动任何星位与数字（约束写在 buildAnswerContext 的 system 里）。
 */

import { useMemo, useState } from 'react';
import { OUTER_PALACES, PALACE_DIRECTION, type RiskDomain } from '@hidefate/core-fengshui';
import {
  answerBestPalaceFor,
  answerMultipleChoice,
  buildAnswerContext,
  type Member,
  type SynthesisResult,
} from '@hidefate/core-synthesis';
import { AiChat } from './AiChat';

const DOMAINS: RiskDomain[] = ['健康', '财运', '感情', '事业', '人丁', '意外', '官非'];

const PRESETS: { q: string; mode: '最吉' | '最凶'; domain?: RiskDomain }[] = [
  { q: '书房或办公桌设在哪一方最有利事业与考试？', mode: '最吉', domain: '事业' },
  { q: '主卧设在哪一方对夫妻感情最有利？', mode: '最吉', domain: '感情' },
  { q: '今年哪一方最不利健康，须优先化解？', mode: '最凶', domain: '健康' },
  { q: '收银台或保险柜放哪一方最旺财？', mode: '最吉', domain: '财运' },
  { q: '今年哪一方最忌动土装修？', mode: '最凶' },
];

type Mode = '内置作答' | 'AI 对话';

export function AskTab({ result, members }: { result: SynthesisResult; members: readonly Member[] }) {
  const [tab, setTab] = useState<Mode>('内置作答');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<'最吉' | '最凶'>('最吉');
  const [domain, setDomain] = useState<RiskDomain | ''>('');
  const [options, setOptions] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);

  const context = useMemo(() => buildAnswerContext(result, { members }), [result, members]);

  function ask(q: string, m: '最吉' | '最凶', d?: RiskDomain) {
    const usable = options.map((s) => s.trim()).filter(Boolean);
    const a =
      usable.length >= 2
        ? answerMultipleChoice(
            result,
            q,
            usable.map((text, i) => ({ key: String.fromCharCode(65 + i), text })),
            m,
            d,
          )
        : answerBestPalaceFor(result, q, m, d);
    setAnswer(a.formatted);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(['内置作答', 'AI 对话'] as Mode[]).map((m) => (
          <button key={m} type="button" className={`seg text-sm ${tab === m ? 'seg-on' : ''}`} onClick={() => setTab(m)}>
            {m}
          </button>
        ))}
        <span className="self-center text-xs text-ink-mute">
          {tab === '内置作答'
            ? '完全离线，输出固定三段格式，数字直接来自引擎。'
            : 'AI 只负责组织语言，星位与概率仍由引擎决定。'}
        </span>
      </div>

      {tab === 'AI 对话' && <AiChat result={result} members={members} />}

      {tab === '内置作答' && (
        <>
      <section className="card">
        <h3 className="card-title">常见问题（一键作答）</h3>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.q}
              type="button"
              className="btn text-xs"
              onClick={() => {
                setQuestion(p.q);
                setMode(p.mode);
                setDomain(p.domain ?? '');
                setOptions([]);
                ask(p.q, p.mode, p.domain);
              }}
            >
              {p.q}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="card-title">自己提问</h3>
        <div>
          <label className="label">题干</label>
          <input
            className="field"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例：小孩书桌应该放在哪一方？"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">要问的是</label>
            <div className="flex gap-2">
              <button type="button" className={`seg flex-1 ${mode === '最吉' ? 'seg-on' : ''}`} onClick={() => setMode('最吉')}>
                最有利的一方
              </button>
              <button type="button" className={`seg flex-1 ${mode === '最凶' ? 'seg-on' : ''}`} onClick={() => setMode('最凶')}>
                最须回避的一方
              </button>
            </div>
          </div>
          <div>
            <label className="label">限定维度（选填）</label>
            <select className="field" value={domain} onChange={(e) => setDomain(e.target.value as RiskDomain | '')}>
              <option value="">不限定</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">选项（选填。留空则在八方中自动挑选）</label>
          <div className="flex flex-wrap gap-1.5">
            {OUTER_PALACES.map((p) => {
              const label = PALACE_DIRECTION[p];
              const on = options.includes(label);
              return (
                <button
                  key={p}
                  type="button"
                  className={`seg text-xs ${on ? 'seg-on' : ''}`}
                  onClick={() =>
                    setOptions((prev) => (on ? prev.filter((x) => x !== label) : [...prev, label]))
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          {options.length === 1 && (
            <p className="mt-1 text-xs text-cinnabar">选择题至少需要两个选项，否则将改为在八方中自动挑选。</p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!question.trim()}
          onClick={() => ask(question, mode, domain || undefined)}
        >
          作答
        </button>
      </section>

      {answer && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="card-title mb-0">回答</h3>
            <button
              type="button"
              className="btn text-xs"
              onClick={() => void navigator.clipboard?.writeText(answer)}
            >
              复制
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{answer}</pre>
        </section>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm text-ink-mute hover:text-cinnabar">
          接入 AI 时送出的上下文（可复制到任何模型）
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          下方内容已包含全部已算好的事实。system 提示里明令模型
          <b className="text-ink-soft">不得修改任何星位、宫位与概率</b>，只能引用与解释 ——
          这是「模型绝不发明数字」这条铁律的技术落点。
        </p>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-rice-line bg-rice-deep/40 p-3 text-[11px] leading-relaxed">
          {context.system}
          {'\n\n===== 事实 =====\n'}
          {context.facts}
        </pre>
        <button
          type="button"
          className="btn mt-2 text-xs"
          onClick={() => void navigator.clipboard?.writeText(`${context.system}\n\n===== 事实 =====\n${context.facts}`)}
        >
          复制完整上下文
        </button>
      </details>
        </>
      )}
    </div>
  );
}
