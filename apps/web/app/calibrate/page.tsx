'use client';

/**
 * 对轨 —— 整个产品的主回路。
 *
 * 流程顺序**不可颠倒**（见 docs/ROADMAP.md §5）：
 *   1. 选人 → 2. 补居住史（可跳过）→ 3. 生成回溯并锁定 → 4. 逐条对轨 → 5. 看象意收敛
 *
 * 第 3 步必须先于第 4 步：先出、锁死、再让用户评。
 * 顺序反了就是冷读，产品价值归零，用户自己也会怀疑。
 * 所以生成按钮按下去之后条目即写入账本，不可再改内容。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BirthInput } from '@hidefate/core-bazi';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import type { ResidencePeriod } from '@hidefate/core-synthesis';
import { resolvePrediction, type PredictionRecord, type Verdict } from '@hidefate/core-ledger';
import { AppBar, Empty, Expandable, Sheet } from '../../components/mobile/ui';
import { ResidenceEditor } from '../../components/mobile/ResidenceEditor';
import { useProperty } from '../../lib/PropertyContext';
import { db, newId, type StoredMember } from '../../lib/db';
import { commitRetrospect, planRetrospect, type RetrospectPlan } from '../../lib/retrospect';
import { recomputePosteriors } from '../../lib/calibrateStore';

const VERDICTS: { v: Verdict; label: string; tone: string }[] = [
  { v: '中', label: '发生过', tone: 'border-cinnabar/50 bg-cinnabar/10 text-cinnabar' },
  { v: '部分中', label: '有点像', tone: 'border-gold/60 bg-gold/10 text-ink' },
  { v: '未发生', label: '没有', tone: 'border-jade/40 bg-jade/5 text-jade' },
  { v: '反向', label: '反了', tone: 'border-ink-mute/40 bg-rice-deep/40 text-ink-mute' },
];

export default function CalibratePage() {
  const { memberRows, properties, loading } = useProperty();
  const [personId, setPersonId] = useState<string | null>(null);
  const [residences, setResidences] = useState<ResidencePeriod[]>([]);
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [plan, setPlan] = useState<RetrospectPlan | null>(null);
  const [editingResidence, setEditingResidence] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const person = useMemo(
    () => memberRows.find((m) => m.id === personId) ?? memberRows[0] ?? null,
    [memberRows, personId],
  );

  const propertyMap = useMemo(
    () => new Map<string, PropertyProfile>(properties.map((p) => [p.id, p])),
    [properties],
  );

  const load = useCallback(async (pid: string) => {
    const [res, preds] = await Promise.all([
      db().residences.where('personId').equals(pid).toArray(),
      db().predictions.where('personId').equals(pid).toArray(),
    ]);
    setResidences(res.sort((a, b) => a.fromYear - b.fromYear));
    setRecords(preds.sort((a, b) => a.window.fromYear - b.window.fromYear));
  }, []);

  useEffect(() => {
    if (person) void load(person.id);
  }, [person, load]);

  const birth = (m: StoredMember): BirthInput & { id: string; name: string } => ({ ...m });

  function preview() {
    if (!person) return;
    try {
      setPlan(planRetrospect({ person: birth(person), residences, properties: propertyMap }));
      setMsg(null);
    } catch (e) {
      setMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function commit() {
    if (!plan || !person) return;
    setBusy(true);
    try {
      const frozen = commitRetrospect(plan, new Date());
      await db().predictions.bulkPut(frozen);
      setPlan(null);
      await load(person.id);
      setMsg(`已生成并锁定 ${frozen.length} 条回溯。接下来逐条告诉我实际发生了什么。`);
    } catch (e) {
      setMsg(`写入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function rate(rec: PredictionRecord, verdict: Verdict) {
    if (!person) return;
    const next = resolvePrediction(rec, { verdict, recordedAt: new Date().toISOString() });
    await db().predictions.put(next);
    await recomputePosteriors(person.id);
    await load(person.id);
  }

  async function markQuiet(rec: PredictionRecord) {
    if (!person) return;
    await db().quiets.put({
      id: newId('quiet'),
      personId: person.id,
      year: rec.window.toYear,
      domain: rec.domain,
      note: `${rec.window.fromYear}–${rec.window.toYear} 年「${rec.domain}」方面平安无事`,
      recordedAt: new Date().toISOString(),
    });
    await rate(rec, '未发生');
  }

  const pending = records.filter((r) => r.status === '待结算');
  const done = records.filter((r) => r.status === '已结算');

  if (loading) return <AppBar title="对轨" back="/me" />;

  if (memberRows.length === 0) {
    return (
      <>
        <AppBar title="对轨" back="/me" />
        <div className="px-4 py-6">
          <Empty
            title="还没有成员"
            desc="对轨是拿你真实发生过的事，去收敛这张盘的取象范围。先加一位成员（至少要出生年月日）。"
            action={
              <Link href="/members" className="btn btn-primary btn-block">
                去添加成员
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="对轨"
        subtitle={person ? `${person.name} · ${done.length}/${records.length} 已评` : undefined}
        back="/me"
        right={
          done.length > 0 ? (
            <Link
              href="/calibrate/learned"
              className="flex h-11 min-w-11 items-center justify-end pr-2 text-[0.8125rem] text-cinnabar active:opacity-60"
            >
              收敛
            </Link>
          ) : null
        }
      />

      <div className="space-y-4 px-4 py-4">
        {msg && (
          <p className="rounded-xl border border-jade/30 bg-jade/5 p-3 text-[0.8125rem] leading-relaxed text-jade">
            {msg}
          </p>
        )}

        {/* 选人 */}
        {memberRows.length > 1 && (
          <section>
            <h2 className="section-title">对谁</h2>
            <div className="flex flex-wrap gap-2">
              {memberRows.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPersonId(m.id)}
                  className={`rounded-full border px-3 py-2 text-[0.8125rem] active:opacity-60 ${
                    person?.id === m.id
                      ? 'border-cinnabar bg-cinnabar/10 text-cinnabar'
                      : 'border-rice-line text-ink-mute'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 居住史 */}
        <section>
          <h2 className="section-title">住过哪些地方</h2>
          <button
            type="button"
            onClick={() => setEditingResidence(true)}
            className="card flex w-full items-center gap-3 text-left active:bg-rice-deep/40"
          >
            <div className="min-w-0 flex-1">
              {residences.length === 0 ? (
                <>
                  <p className="text-[0.9375rem]">还没有居住史</p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-mute">
                    不填也能对轨，但那样只有命层在说话。补上住过的地方（哪怕只记得大致朝向），
                    风水层才能参与共振 —— 搬家那一年正是最有分辨力的年份。
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem]">{residences.length} 段居住记录</p>
                  <p className="mt-0.5 truncate text-[0.75rem] text-ink-mute">
                    {residences
                      .map((r) => `${r.fromYear}–${r.toYear ?? '今'}`)
                      .join('、')}
                  </p>
                </>
              )}
            </div>
            <span className="shrink-0 text-[0.8125rem] text-cinnabar">编辑</span>
          </button>
        </section>

        {/* 生成 */}
        {records.length === 0 && (
          <section>
            <h2 className="section-title">生成回溯</h2>
            {!plan ? (
              <>
                <p className="mb-3 text-[0.8125rem] leading-relaxed text-ink-mute">
                  系统会按大运分段，每段给出几条<strong className="text-ink">可判定</strong>的回溯描述，
                  写入后<strong className="text-ink">即锁定不可更改</strong>，然后才轮到你说实际发生了什么。
                  这个顺序是刻意的：先出、锁死、再评，否则就成了看你脸色说话。
                </p>
                <button type="button" onClick={preview} className="btn btn-primary btn-block">
                  先看看会问些什么
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-[0.8125rem] leading-relaxed">
                  共 {plan.segments.length} 段、{plan.totalDrafts} 条。确认后即锁定。
                </p>
                {plan.notes.map((n) => (
                  <p key={n} className="rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-[0.75rem] leading-relaxed">
                    {n}
                  </p>
                ))}
                {plan.segments.map((s) => (
                  <Expandable key={s.label} title={s.label} badge={<span className="shrink-0 text-[0.75rem] text-ink-mute">{s.drafts.length} 条</span>}>
                    <ul className="space-y-1.5">
                      {s.drafts.map((d, i) => (
                        <li key={i} className="text-[0.8125rem] leading-relaxed">
                          <span className="text-ink-mute">[{d.domain}]</span> {d.statement}
                        </li>
                      ))}
                      {s.drafts.length === 0 && (
                        <li className="text-[0.75rem] text-ink-mute">该段没有达到共振门槛的条目。</li>
                      )}
                    </ul>
                  </Expandable>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPlan(null)} className="btn flex-1">
                    再想想
                  </button>
                  <button
                    type="button"
                    onClick={commit}
                    disabled={busy || plan.totalDrafts === 0}
                    className="btn btn-primary flex-1"
                  >
                    {busy ? '写入中…' : '锁定并开始对轨'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 待评 */}
        {pending.length > 0 && (
          <section>
            <h2 className="section-title">待对轨 · {pending.length} 条</h2>
            <div className="space-y-3">
              {pending.map((r) => (
                <article key={r.id} className="card">
                  <p className="text-[0.6875rem] text-ink-mute">
                    {r.window.fromYear}–{r.window.toYear} · {r.domain} · 无基准率
                  </p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed">{r.statement}</p>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {VERDICTS.map((v) => (
                      <button
                        key={v.v}
                        type="button"
                        onClick={() => void rate(r, v.v)}
                        className={`min-h-11 rounded-lg border text-[0.8125rem] active:opacity-60 ${v.tone}`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  {/*
                    负样本入口。高度必须够拇指点 —— 它跟上面四个结论按钮同等重要，
                    做成一行小字等于劝退，而没人填负样本，取象就永远收敛不下去。
                  */}
                  <button
                    type="button"
                    onClick={() => void markQuiet(r)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-dashed border-rice-line px-3 text-[0.8125rem] text-ink-mute active:opacity-60"
                  >
                    这几年「{r.domain}」方面确实平安无事
                  </button>
                </article>
              ))}
            </div>
            <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-mute">
              最后那一行不是可有可无：只记发生过的事，证据只增不减，取象永远收敛不下去。
              明确说「没事」的年份，跟说「有事」一样重要。
            </p>
          </section>
        )}

        {/* 已评 */}
        {done.length > 0 && (
          <section>
            <h2 className="section-title">已对轨 · {done.length} 条</h2>
            <div className="space-y-2">
              {done.map((r) => (
                <div key={r.id} className="card flex items-start gap-3 py-3">
                  <span className="shrink-0 rounded-md border border-rice-line px-2 py-0.5 text-[0.6875rem] text-ink-mute">
                    {r.outcome?.verdict}
                  </span>
                  <p className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-ink-mute">
                    {r.window.fromYear}–{r.window.toYear} {r.statement}
                  </p>
                </div>
              ))}
            </div>
            <Link href="/calibrate/learned" className="btn btn-primary btn-block mt-3">
              看象意收敛到哪一步了
            </Link>
          </section>
        )}
      </div>

      <Sheet open={editingResidence} onClose={() => setEditingResidence(false)} title="居住史">
        {person && (
          <ResidenceEditor
            personId={person.id}
            properties={properties}
            value={residences}
            onChange={async (next) => {
              setResidences(next);
              await db().residences.where('personId').equals(person.id).delete();
              await db().residences.bulkPut(next);
            }}
          />
        )}
      </Sheet>
    </>
  );
}
