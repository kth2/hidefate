'use client';

/**
 * 快速分诊 —— 建房向导之前的三个问题。
 *
 * 建房向导有 6 步，第一次打开 App 的人要全部走完才看得到任何东西。
 * 这里把门槛压到最低：三个问题，**只有出生年是必填的**，答完立刻出结论。
 *
 * 出来的结论是真的（八宅命卦层完整成立），但置信度必然低 ——
 * 所以结果页上戳记与「暂定了哪些假设」跟结论并排显示，不放在小字里。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AppBar } from '../../components/mobile/ui';
import { CompassReader, EightDirectionPicker } from '../../components/mobile/CompassAssist';
import { ConfidenceLadder, ConfidenceStamp } from '../../components/ConfidenceLadder';
import { EIGHT_DIRECTIONS, nearestEightDirection } from '../../lib/compass';
import { provisionalOutcome } from '../../lib/provisional';
import { SYMPTOM_CATEGORIES, categoryById, findingsForCategory } from '../../lib/symptoms';
import { findingRefs, sortByProbability, type FindingRef } from '../../lib/findings';
import type { Finding } from '@hidefate/core-synthesis';

const STEPS = ['哪方面不顺', '大门朝向', '出生年', '先看结果'] as const;

export default function StartPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [symptomId, setSymptomId] = useState<string | null>(null);
  const [facingEightId, setFacingEightId] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState(1990);
  const [gender, setGender] = useState<'男' | '女'>('男');

  const outcome = useMemo(
    () => (step === 3 ? provisionalOutcome({ symptomId, facingEightId, birthYear, gender }) : null),
    [step, symptomId, facingEightId, birthYear, gender],
  );

  /**
   * 优先显示与所选症状对应的断语。
   * 有九宫盘时用带宫位的 FindingRef 走既有的类别筛选；只有命卦时直接按维度筛。
   */
  const shown: Finding[] = useMemo(() => {
    if (!outcome) return [];
    const cat = symptomId ? categoryById(symptomId) : null;
    if (outcome.result) {
      const refs: FindingRef[] = findingRefs(outcome.result);
      const picked = cat ? findingsForCategory(refs, cat) : sortByProbability(refs);
      if (picked.length) return picked.slice(0, 5).map((r) => r.finding);
    }
    const pool = cat
      ? outcome.findings.filter((f) => f.domains.some((d) => cat.domains.includes(d)))
      : outcome.findings;
    // 影响强度绝对值大的排前面 —— 大吉与大凶都值得先看
    return [...(pool.length ? pool : outcome.findings)]
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 5);
  }, [outcome, symptomId]);

  return (
    <>
      <AppBar
        title="先看个大概"
        subtitle={`第 ${step + 1} / ${STEPS.length} 步 · ${STEPS[step]}`}
        back={step === 0 ? '/' : undefined}
        propertySwitcher={false}
        right={
          step > 0 && step < 3 ? (
            <button type="button" className="btn btn-sm" onClick={() => setStep((s) => s - 1)}>
              上一步
            </button>
          ) : undefined
        }
      />

      <div className="h-1 bg-rice-deep">
        <div className="h-full bg-cinnabar transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* ── 1. 症状（可跳过）── */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="card-sub px-1">
              三个问题，答完立刻给结论。<b className="text-ink-soft">只有第三个是必填的</b>，
              前两个都可以跳过 —— 跳过只会让结论粗一些，不会让你看不到东西。
            </p>
            <p className="label">最近哪方面不顺？</p>
            <div className="grid gap-2">
              {SYMPTOM_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSymptomId(c.id);
                    setStep(1);
                  }}
                  className={`rounded-xl border p-3.5 text-left transition active:scale-[0.99] ${
                    symptomId === c.id ? 'border-cinnabar bg-cinnabar/[0.06]' : 'border-rice-line bg-white'
                  }`}
                >
                  <span className="block text-[0.9375rem] font-medium leading-snug">{c.label}</span>
                  <span className="mt-0.5 block text-[0.75rem] text-ink-mute">{c.hint}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-block"
              onClick={() => {
                setSymptomId(null);
                setStep(1);
              }}
            >
              说不上来，都看看 →
            </button>
          </div>
        )}

        {/* ── 2. 大门朝向（可跳过）── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="card-sub px-1">
              知道大门朝哪，就能起出这间房的九宫盘。不知道也可以跳过 ——
              那样结论只到「你个人的吉凶方位」这一层，与具体哪间房无关。
            </p>

            <EightDirectionPicker value={facingEightId} onPick={(d) => setFacingEightId(d.id)} />

            <CompassReader
              onUse={(deg) => {
                // 手机读数按八方归位 —— 分诊阶段不做度数级的承诺
                setFacingEightId(nearestEightDirection(deg).id);
              }}
            />

            {facingEightId && (
              <p className="rounded-xl border border-jade/35 bg-jade/[0.06] p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
                已选「{EIGHT_DIRECTIONS.find((d) => d.id === facingEightId)?.label}」。
                这是八方近似，够起盘，但判不了兼向与空亡 —— 之后量到度数可随时改，置信度会跟着补上来。
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className="btn flex-1"
                onClick={() => {
                  setFacingEightId(null);
                  setStep(2);
                }}
              >
                不知道，跳过
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(2)}>
                下一步
              </button>
            </div>
          </div>
        )}

        {/* ── 3. 出生年（唯一必填）── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="label">你的出生年（必填）</label>
              <input
                type="number"
                inputMode="numeric"
                className="field text-center font-serif text-3xl"
                value={birthYear}
                onChange={(e) => setBirthYear(Number(e.target.value))}
                autoFocus
              />
            </div>
            <div>
              <p className="label">性别</p>
              <div className="flex gap-2">
                {(['男', '女'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`btn flex-1 ${gender === g ? 'btn-primary' : ''}`}
                    onClick={() => setGender(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
              为什么只要这两项：<b>命卦只由出生年与性别决定</b>，与月日时无关。
              八宅的个人吉凶方位就建立在命卦上，因此这一层现在就完全成立 ——
              不会因为你答不出时辰而打折。
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > 2100}
              onClick={() => setStep(3)}
            >
              看结果
            </button>
          </div>
        )}

        {/* ── 4. 结果 ── */}
        {step === 3 && outcome && (
          <div className="space-y-4">
            <section className="rounded-2xl border-2 border-cinnabar/25 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-[1.0625rem] font-semibold">初步结论</h2>
                <ConfidenceStamp level={outcome.confidence.level} percent={outcome.confidence.percent} />
              </div>
              <p className="text-[0.8125rem] leading-relaxed text-ink-mute">
                你是
                <b className="text-cinnabar">
                  {outcome.mingGua.gua}
                  {outcome.mingGua.number}命
                </b>
                （{outcome.mingGua.group}）。
                {outcome.result
                  ? '下面既有你个人的方位吉凶，也有这间房按所选朝向起出的盘。'
                  : '下面是你个人的八宅吉凶方位 —— 还没有房子的盘。'}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="section-title">
                {symptomId ? `与「${categoryById(symptomId)?.label}」相关的` : '最值得先看的'}几条
              </h2>
              {shown.map((f, i) => (
                <article key={i} className="card">
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {f.schools.map((s) => (
                      <span key={s} className="tag border-rice-line text-ink-mute">
                        {s}
                      </span>
                    ))}
                    <span className="tag border-rice-line text-ink-mute">置信度 {f.confidence}</span>
                  </div>
                  <p className="text-[0.9375rem] leading-relaxed">{f.statement}</p>
                  <p className="mt-1.5 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                    古法依据：{f.principle}
                  </p>
                </article>
              ))}
            </section>

            {/* 暂定假设与结论并排，不塞进小字 */}
            <section className="rounded-2xl border border-gold/45 bg-gold/[0.05] p-4">
              <h2 className="mb-2 font-serif text-[0.9375rem] font-semibold text-gold">
                以上结论暂定了这些（共 {outcome.caveats.length} 条）
              </h2>
              <ul className="space-y-1.5">
                {outcome.caveats.map((c, i) => (
                  <li key={i} className="text-[0.8125rem] leading-relaxed text-ink-soft">
                    · {c}
                  </li>
                ))}
              </ul>
            </section>

            <ConfidenceLadder
              profile={outcome.profile}
              members={[outcome.member]}
              title="把这份判断变硬，接下来做什么"
            />

            <button type="button" className="btn btn-primary btn-block" onClick={() => router.push('/new')}>
              正式建档（把这处房子存下来）
            </button>
            <Link href="/" className="btn btn-block">
              先回首页
            </Link>
            <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
              分诊结果不会自动保存 —— 正式建档后才会存到本机，且随时可删。
              本工具为传统文化研究与生活参考之用，不构成医疗、法律或投资建议。健康疑虑请就医。
            </p>
          </div>
        )}
      </div>

      <div className="h-6" />
    </>
  );
}
