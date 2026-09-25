'use client';

/**
 * 占局 —— 飞盘鸣法（括囊）时家奇门。
 *
 * 三条纪律在 core-qimen 的签名里已经写死，界面只负责把它们讲清楚：
 *   1. **占时不可选** —— 起局用的是你按下按钮那一刻，不给挑
 *   2. **判据先于盘面** —— 不写「何为应验」就排不出盘
 *   3. **复占留档** —— 同一件事可以反复占（换个时辰本就是另一个局），
 *      但每一次都编号入列、都要各自结算，不许只留下合心意的那一局
 *
 * 这一层是「二运」：命层说这个大运有什么底子、风水层说环境如何，
 * 都不回答「哪天」。占局回答当下这件事。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  castDivination,
  listQuestionCategories,
  readDivination,
  type Tendency,
  type Divination,
  type OpenDivination,
  type YongShenRule,
} from '@hidefate/core-qimen';
import { computeBaziChart } from '@hidefate/core-bazi';
import { AppBar, Empty, Expandable, Sheet } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { db, newId } from '../../lib/db';
import {
  loadDivinations,
  restoreDivination,
  saveDivination,
  settleDivination,
  voidDivination,
  type StoredDivination,
} from '../../lib/divinationStore';

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 九宫按洛书方位排布：4 9 2 / 3 5 7 / 8 1 6。 */
const GRID: readonly string[] = ['4', '9', '2', '3', '5', '7', '8', '1', '6'];

/** 结论倾向的颜色。 */
const TENDENCY_TONE: Record<Tendency, string> = {
  有利: 'border-jade/50 bg-jade/15 text-jade',
  偏有利: 'border-jade/40 bg-jade/10 text-jade',
  难定: 'border-rice-line bg-rice-deep text-ink-soft',
  偏不利: 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn',
  不利: 'border-risk-high/50 bg-risk-high/15 text-risk-high',
};

/** 存档的盘面 JSON 还原成 Divination；损坏就当没有。 */
function parseChart(json: string): Divination | null {
  try {
    return JSON.parse(json) as Divination;
  } catch {
    return null;
  }
}

/** 作废的常见缘由 —— 给按钮而不是空白输入框，单手也能点完。 */
const VOID_REASONS = ['误占 / 手滑', '测试用', '重复记录', '判据写错'] as const;

export default function DivinationPage() {
  const { memberRows } = useProperty();
  const [rules, setRules] = useState<YongShenRule[] | null>(null);
  const [rows, setRows] = useState<StoredDivination[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState<string>('');
  const [criterion, setCriterion] = useState('');
  const [windowDays, setWindowDays] = useState(30);
  const [nianMingGan, setNianMingGan] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 占类未识别时，提供一条明示的「按综合断」出路，而不是把 API 名字甩给用户。 */
  const [offerGeneral, setOfferGeneral] = useState(false);
  const [opened, setOpened] = useState<Divination | null>(null);
  const [voiding, setVoiding] = useState<StoredDivination | null>(null);
  const [voidReason, setVoidReason] = useState<string>(VOID_REASONS[0]);
  const [showVoided, setShowVoided] = useState(false);

  const reload = useCallback(async () => setRows(await loadDivinations()), []);

  /**
   * 年命从成员生辰自动带出（年柱天干）。
   *
   * 这不只是省事：年命进了查重钥匙，用户漏填一次就会换出一把新钥匙，
   * 于是同一件事能被复占。自动带出把这个口子堵上。
   */
  useEffect(() => {
    if (nianMingGan || memberRows.length === 0) return;
    const m = memberRows[0]!;
    try {
      const gan = computeBaziChart(m).pillars.find((x) => x.position === '年柱')?.gan;
      if (gan) setNianMingGan(gan);
    } catch {
      // 生辰不足以排年柱时就留空，界面已说明后果
    }
  }, [memberRows, nianMingGan]);

  useEffect(() => {
    void listQuestionCategories()
      .then((r) => setRules([...r]))
      .catch((e) => setEngineError(e instanceof Error ? e.message : String(e)));
    void reload();
  }, [reload]);

  const openList: OpenDivination[] = useMemo(
    () => rows.map((r) => ({ key: r.key, castAt: r.castAt, windowDays: r.resolution.windowDays, status: r.status })),
    [rows],
  );

  const activeRows = useMemo(() => rows.filter((r) => r.status !== '已作废'), [rows]);
  const voidedRows = useMemo(() => rows.filter((r) => r.status === '已作废'), [rows]);
  const shownRows = showVoided ? rows : activeRows;

  const selectedRule = rules?.find((r) => r.category === category) ?? null;

  async function cast(allowGeneral = false) {
    setBusy(true);
    setErr(null);
    setOfferGeneral(false);
    try {
      const d = await castDivination(
        {
          question,
          ...(category ? { category } : {}),
          ...(nianMingGan ? { nianMingGan } : {}),
          ...(allowGeneral ? { allowGeneralReading: true } : {}),
          resolution: { criterion, judge: '用户自评', windowDays },
        },
        { openDivinations: openList },
      );
      await saveDivination(d, newId('div'));
      await reload();
      setOpened(d);
      setQuestion('');
      setCriterion('');
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // core 层的报错是写给调用方看的，会带 API 名字。这里翻成人话。
      if (raw.includes('未能识别占类')) {
        setErr('认不出这是哪一类占问，所以取不到用神。请在上面选一个占类；或者按「三乙四宫」的通用法起局 —— 那样没有具体用神，记录的对轨价值也低。');
        setOfferGeneral(true);
      } else {
        setErr(raw);
      }
    } finally {
      setBusy(false);
    }
  }

  const canCast = question.trim().length > 0 && criterion.trim().length >= 6 && !busy;

  return (
    <>
      <AppBar title="占局" subtitle="飞盘鸣法 · 时家奇门" />

      <div className="space-y-4 px-4 py-4">
        {engineError && (
          <p className="rounded-xl border border-cinnabar/40 bg-cinnabar/5 p-3 text-[0.8125rem] leading-relaxed text-cinnabar">
            奇门引擎载入失败：{engineError}
          </p>
        )}

        <section className="rounded-2xl border border-jade/25 bg-jade/[0.04] p-4">
          <p className="text-[0.8125rem] font-medium">这一层管「哪天」</p>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-soft">
            八字大运说这段日子的底子，飞星说环境如何，两者都不回答「什么时候、这一件事会怎样」。
            占局用你按下按钮那一刻起局 —— <strong className="text-ink">时刻不给挑</strong>，
            挑得了时刻就等于挑答案。
          </p>
        </section>

        {/* 起局表单 */}
        <section>
          <h2 className="section-title">起一局</h2>
          <div className="card space-y-3">
            <label className="block">
              <span className="mb-1 block text-[0.75rem] text-ink-mute">占什么事</span>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="这次换工作能成吗"
                className="w-full rounded-lg border border-rice-line bg-white px-3 py-3 text-[1rem]"
              />
            </label>

            <div>
              <span className="mb-1 block text-[0.75rem] text-ink-mute">占类（决定取哪个用神）</span>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="min-h-11 w-full rounded-lg border border-rice-line bg-white px-3 text-left text-[0.9375rem] active:bg-rice-deep/40"
              >
                {category || '按问题自动判断（换工作、投资、复合等日常说法都认）'}
              </button>
              {selectedRule && (
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-mute">
                  用神：{selectedRule.yongshen.map((y) => y.name).join('、') || '—'}
                  <br />
                  {selectedRule.note}
                </p>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-[0.75rem] text-ink-mute">
                何为应验 —— 写不出可判定的标准就排不出盘
              </span>
              <textarea
                value={criterion}
                onChange={(e) => setCriterion(e.target.value)}
                rows={2}
                placeholder="八月底前收到正式录用通知（书面或邮件），以有无该通知为准"
                className="w-full rounded-lg border border-rice-line bg-white px-3 py-2.5 text-[1rem] leading-relaxed"
              />
              <span className="mt-1 block text-[0.6875rem] text-ink-mute">
                「顺不顺利」「有起伏」这类写法会被拒收 —— 它们永远为真，记下来也没用。
              </span>
              {question.trim() && !criterion.trim() && (
                <button
                  type="button"
                  className="mt-1.5 min-h-[2.5rem] text-[0.8125rem] text-cinnabar active:opacity-60"
                  onClick={() =>
                    setCriterion(`${windowDays} 天内，「${question.trim().replace(/[？?吗呢]+$/, '')}」是否如愿，以实际结果（通知、成交、结果单等）为准`)
                  }
                >
                  帮我写判据 ›
                </button>
              )}
            </label>

            <div className="flex gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[0.75rem] text-ink-mute">应期窗口（天）</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={windowDays}
                  onChange={(e) => setWindowDays(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-rice-line bg-white px-3 py-2.5 text-[1rem]"
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-[0.75rem] text-ink-mute">年命天干（可留空）</span>
                <select
                  value={nianMingGan}
                  onChange={(e) => setNianMingGan(e.target.value)}
                  className="w-full rounded-lg border border-rice-line bg-white px-3 py-2.5 text-[1rem]"
                >
                  <option value="">不填</option>
                  {GAN.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-ink-mute">
              {nianMingGan
                ? `年命已按成员生辰带出（年柱天干 ${nianMingGan}）。它也是查重的一部分 —— 别随手清空，否则同一件事会被当成新的一件。`
                : '不填年命的话，凡以年命为断的条目（得财／损财、寻物有果与否等）这一局都判不了。'}
            </p>

            {err && (
              <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/5 p-2.5 text-[0.8125rem] leading-relaxed text-cinnabar">
                {err}
              </p>
            )}

            <button type="button" onClick={() => void cast()} disabled={!canCast} className="btn btn-primary btn-block">
              {busy ? '起局中…' : '此刻起局'}
            </button>

            {offerGeneral && (
              <button
                type="button"
                onClick={() => void cast(true)}
                disabled={busy}
                className="btn btn-block"
              >
                仍按通用法起局（无具体用神）
              </button>
            )}
          </div>
        </section>

        {/* 历史 */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title">占过的局 · {activeRows.length}</h2>
            {voidedRows.length > 0 && (
              <button
                type="button"
                className="min-h-[2.5rem] px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                onClick={() => setShowVoided((v) => !v)}
              >
                {showVoided ? '隐藏已作废' : `显示已作废（${voidedRows.length}）`}
              </button>
            )}
          </div>
          {shownRows.length === 0 ? (
            <Empty
              title={rows.length === 0 ? '还没有占过' : '没有有效的局'}
              desc={
                rows.length === 0
                  ? '占局是这套系统里唯一能在几天内验证的一层 —— 也是取象收敛最快的来源。'
                  : '占过的局都已作废。点右上角可以查看或恢复。'
              }
            />
          ) : (
            <div className="space-y-2">
              {shownRows.map((r) => (
                <div key={r.id} className={`card ${r.status === '已作废' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 rounded-md border border-rice-line px-1.5 py-0.5 text-[0.6875rem] text-ink-mute">
                      {r.category}
                    </span>
                    <span className="ml-auto shrink-0 text-[0.6875rem] text-ink-mute">
                      {r.status}
                      {r.outcome && ` · ${r.outcome}`}
                    </span>
                  </div>
                  {(() => {
                    const d = parseChart(r.chartJson);
                    if (!d) return null;
                    const rd = readDivination(d);
                    return (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`tag shrink-0 ${TENDENCY_TONE[rd.tendency]}`}>{rd.tendency}</span>
                        <button
                          type="button"
                          className="min-h-[2.5rem] text-[0.8125rem] text-cinnabar active:opacity-60"
                          onClick={() => setOpened(d)}
                        >
                          看结论与盘面 ›
                        </button>
                      </div>
                    );
                  })()}
                  <p className="mt-1.5 text-[0.9375rem]">
                    {r.sequence > 1 && (
                      <span className="mr-1.5 rounded bg-rice-deep px-1.5 py-0.5 text-[0.6875rem] text-ink-mute">
                        第 {r.sequence} 次
                      </span>
                    )}
                    {r.question}
                  </p>
                  <p className="mt-1 text-[0.6875rem] text-ink-mute">
                    {r.castAt.slice(0, 16).replace('T', ' ')} · {r.juShu} · 应期至 {r.resolveBy.slice(0, 10)}
                  </p>
                  {r.status === '待结算' && (
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {(['中', '部分中', '未发生', '反向'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={async () => {
                            await settleDivination(r.id, v);
                            await reload();
                          }}
                          className="min-h-11 rounded-lg border border-rice-line text-[0.8125rem] active:opacity-60"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.status === '已作废' ? (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="min-w-0 flex-1 text-[0.75rem] text-ink-mute">
                        {r.voided?.recordedAt.slice(0, 10)} 作废{r.voided?.reason && ` · ${r.voided.reason}`}
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm shrink-0"
                        onClick={async () => {
                          await restoreDivination(r.id);
                          await reload();
                        }}
                      >
                        恢复
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        className="min-h-[2.5rem] px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                        onClick={() => {
                          setVoidReason(VOID_REASONS[0]);
                          setVoiding(r);
                        }}
                      >
                        作废
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-[0.75rem] leading-relaxed text-ink-mute">
          同一件事可以反复占 —— 换个时辰本就是另一个局，多占几次也确实有助于校准取象。
          但每一局都会编号留档，<strong className="text-ink">到期请各自结算</strong>：
          真正会毁掉记录的不是「再问」，是只认最合心意的那一局。
        </p>
      </div>

      {/* 占类选择 */}
      <Sheet open={picking} onClose={() => setPicking(false)} title="选占类">
        <div className="space-y-1.5 pb-2">
          <button
            type="button"
            onClick={() => { setCategory(''); setPicking(false); }}
            className="min-h-11 w-full rounded-lg border border-rice-line px-3 text-left text-[0.9375rem] active:bg-rice-deep/40"
          >
            按关键词自动判断
          </button>
          {(rules ?? []).map((r) => (
            <button
              key={r.category}
              type="button"
              onClick={() => { setCategory(r.category); setPicking(false); }}
              className={`w-full rounded-lg border px-3 py-2.5 text-left active:bg-rice-deep/40 ${
                category === r.category ? 'border-cinnabar bg-cinnabar/5' : 'border-rice-line'
              }`}
            >
              <span className="text-[0.9375rem]">{r.category}</span>
              <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-ink-mute">
                用神 {r.yongshen.map((y) => y.name).join('、') || '—'}
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* 新起之局的盘面 */}
      <Sheet open={opened != null} onClose={() => setOpened(null)} title={opened?.category ?? '盘'}>
        {opened && (
          <div className="space-y-4 pb-2">
            {(() => {
              const r = readDivination(opened);
              return (
                <section className="space-y-3 rounded-2xl border border-cinnabar/20 bg-gradient-to-br from-cinnabar/[0.05] to-transparent p-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`tag shrink-0 text-[0.875rem] font-bold ${TENDENCY_TONE[r.tendency]}`}>{r.tendency}</span>
                    <p className="min-w-0 flex-1 text-[0.9375rem] font-medium leading-snug">{r.headline}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {r.phases.map((ph) => (
                      <div key={ph.label} className="rounded-lg border border-rice-line bg-white px-1 py-1.5">
                        <p className="text-[0.6875rem] text-ink-mute">{ph.label}</p>
                        <p className="text-[0.75rem] leading-snug">{ph.text}</p>
                      </div>
                    ))}
                  </div>
                  {r.reasons.length > 0 && (
                    <div>
                      <p className="text-[0.75rem] font-medium text-ink-mute">凭什么这么说</p>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[0.8125rem] leading-relaxed">
                        {r.reasons.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-[0.75rem] font-medium text-jade">怎么做</p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[0.8125rem] leading-relaxed">
                      {r.advice.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[0.75rem] font-medium text-ink-mute">何时应</p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[0.8125rem] leading-relaxed">
                      {r.timing.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  {r.caveats.length > 0 && (
                    <p className="text-[0.75rem] leading-relaxed text-risk-warn">{r.caveats.join(' ')}</p>
                  )}
                  <p className="border-l-2 border-rice-line pl-2.5 text-[0.6875rem] leading-relaxed text-ink-mute">
                    断法纲要：{r.classicNote}　结论只由盘上已有的用神宫吉凶、用神与年命的生克、三乙、空亡马星推出；
                    它是解读，不是定数，到期请回来结算。
                  </p>
                </section>
              );
            })()}
            <p className="text-[0.75rem] font-medium text-ink-mute">以下是盘面，懂奇门的可以细看：</p>
            {opened.repeatNote && (
              <p className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-[0.75rem] leading-relaxed">
                {opened.repeatNote}
              </p>
            )}
            <div>
              <p className="text-[0.9375rem]">{opened.question}</p>
              <p className="mt-1 text-[0.75rem] text-ink-mute">
                {opened.castAt.slice(0, 16).replace('T', ' ')} · {opened.juShu.fullName} ·{' '}
                {opened.siZhu.year} {opened.siZhu.month} {opened.siZhu.day} {opened.siZhu.time}
              </p>
              <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                值符 {opened.zhiFuXing}（落 {opened.zhiFuLuoGong} 宫）· 值使 {opened.zhiShiMen}（落 {opened.zhiShiGong} 宫）
              </p>
            </div>

            {/* 九宫 */}
            <div className="grid grid-cols-3 gap-1.5">
              {GRID.map((g) => {
                const p = opened.palaces.find((x) => x.gong === g)!;
                const isYong = opened.yongShen.some((y) => y.gong === g);
                return (
                  <div
                    key={g}
                    className={`rounded-lg border p-2 ${
                      isYong ? 'border-cinnabar bg-cinnabar/[0.07]' : 'border-rice-line bg-white'
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[0.6875rem] text-ink-mute">{p.gongName || g}</span>
                      {p.kongWang && <span className="text-[0.625rem] text-ink-mute">空</span>}
                      {p.maStar && <span className="text-[0.625rem] text-cinnabar">马</span>}
                    </div>
                    <p className="mt-0.5 text-[0.8125rem] font-medium leading-tight">{p.tianPanXing}</p>
                    <p className="text-[0.75rem] leading-tight text-ink-soft">{p.tianPanShen}</p>
                    <p className="text-[0.75rem] leading-tight">
                      <span className="text-cinnabar">{p.tianPanYi}</span>
                      <span className="text-ink-mute"> / {p.diPanYi}</span>
                    </p>
                    <p className="text-[0.6875rem] leading-tight text-ink-mute">{p.renPanMen}</p>
                  </div>
                );
              })}
            </div>

            <div>
              <p className="text-[0.8125rem] font-medium">用神</p>
              {opened.yongShen.length === 0 ? (
                <p className="mt-1 text-[0.8125rem] text-ink-mute">本局按综合断，无具体用神。</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {opened.yongShen.map((y) => (
                    <li key={y.name} className="text-[0.8125rem] leading-relaxed">
                      {y.name} 落 {y.gong} 宫（{y.gongName}·{y.fangwei}）
                      <span className="block text-[0.6875rem] text-ink-mute">{y.place}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-mute">{opened.yongShenNote}</p>
            </div>

            <Expandable title="三乙四宫">
              <ul className="space-y-1 text-[0.8125rem]">
                {Object.entries(opened.sanYi.detail).map(([k, v]) => (
                  <li key={k}>{k}：{v || '—'}</li>
                ))}
              </ul>
            </Expandable>

            <div>
              <p className="text-[0.8125rem] font-medium">应期材料</p>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-mute">
                古法取象，<strong className="text-ink">不换算成天数</strong> ——
                窗口是你自己承诺的 {opened.resolution.windowDays} 天，引擎不替你发明数字。
              </p>
              <ul className="mt-1.5 space-y-1 text-[0.8125rem]">
                {opened.yingQi.map((c) => (
                  <li key={c.yongShen}>
                    {c.yongShen}：近应看地盘奇仪 <strong>{c.near}</strong>、远应看地盘暗干支 <strong>{c.far}</strong>
                    {c.kongWang && <span className="text-cinnabar">（值空亡，待填实方应，宜后延）</span>}
                    {c.maStar && <span className="text-cinnabar">（临马星，主动，宜提前）</span>}
                  </li>
                ))}
                {opened.yingQi.length === 0 && <li className="text-ink-mute">无已定位的用神，无应期材料。</li>}
              </ul>
            </div>

            {opened.caveats.length > 0 && (
              <div className="space-y-1.5">
                {opened.caveats.map((c) => (
                  <p key={c} className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-[0.75rem] leading-relaxed">
                    {c}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[0.6875rem] leading-relaxed text-ink-mute">
              引擎签名 {opened.engineSignature}
              <br />
              这串东西记进账本，日后重放时用来确认比对的是同一个模型。
            </p>

            <Link href="/calibrate" className="btn btn-block">应期到了去结算</Link>
          </div>
        )}
      </Sheet>

      <Sheet open={voiding != null} onClose={() => setVoiding(null)} title="作废这一局">
        {voiding && (
          <div className="space-y-4">
            <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.875rem] leading-relaxed">
              {voiding.question}
            </p>
            <div>
              <p className="label">缘由</p>
              <div className="grid grid-cols-2 gap-2">
                {VOID_REASONS.map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={`btn ${voidReason === x ? 'btn-primary' : ''}`}
                    onClick={() => setVoidReason(x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[0.8125rem] leading-relaxed text-ink-mute">
              作废后这一局从列表隐藏，也不再计入准确度统计；随时可以在「显示已作废」里恢复。
              它仍占着编号 —— 同一件事再占，序号照样往后排。
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={async () => {
                await voidDivination(voiding.id, voidReason);
                setVoiding(null);
                await reload();
              }}
            >
              确认作废
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
