'use client';

/**
 * 一生轨迹 —— 过去 · 现在 · 未来。
 *
 * 这是「一命二运三风水」这套东西的正脸：打开就该看见自己这辈子大概怎么走、
 * 今年什么情况、往后几年留意什么。取象收敛、账本、校准都是支撑它的，不是它本身。
 *
 * 每条未来预测都可一键存入账本 —— 说出口的话要能被追账，
 * 否则「预测」只是好看的段落。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PropertyProfile } from '@hidefate/core-fengshui';
import type { ResidencePeriod } from '@hidefate/core-synthesis';
import type { PredictionRecord } from '@hidefate/core-ledger';
import { AppBar, Empty, Expandable, Meter, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { db } from '../../lib/db';
import { buildLifeView, freezeOutlook, type LifeView, type YearOutlook } from '../../lib/lifeStore';

const DOMAIN_TONE: Record<string, string> = {
  健康: 'bg-cinnabar/10 text-cinnabar border-cinnabar/30',
  财运: 'bg-gold/10 text-ink border-gold/40',
  事业: 'bg-jade/10 text-jade border-jade/30',
  感情: 'bg-cinnabar/10 text-cinnabar border-cinnabar/30',
};
const tone = (d: string) => DOMAIN_TONE[d] ?? 'bg-rice-deep/50 text-ink-mute border-rice-line';

export default function LifePage() {
  const { memberRows, properties, loading, year } = useProperty();
  const [personId, setPersonId] = useState<string | null>(null);
  const [residences, setResidences] = useState<ResidencePeriod[]>([]);
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const person = useMemo(
    () => memberRows.find((m) => m.id === personId) ?? memberRows[0] ?? null,
    [memberRows, personId],
  );

  const load = useCallback(async (pid: string) => {
    const [res, preds] = await Promise.all([
      db().residences.where('personId').equals(pid).toArray(),
      db().predictions.where('personId').equals(pid).toArray(),
    ]);
    setResidences(res);
    setRecords(preds);
  }, []);

  useEffect(() => {
    if (person) void load(person.id);
  }, [person, load]);

  const view: LifeView | null = useMemo(() => {
    if (!person) return null;
    try {
      return buildLifeView({
        person: { ...person },
        residences,
        properties: new Map<string, PropertyProfile>(properties.map((p) => [p.id, p])),
        thisYear: year,
      });
    } catch {
      return null;
    }
  }, [person, residences, properties, year]);

  async function track(outlook: YearOutlook) {
    if (!person) return;
    const frozen = freezeOutlook(outlook, records, new Date());
    if (frozen.length === 0) {
      setMsg(`${outlook.year} 年的预测已经在账本里了，不重复记。`);
      return;
    }
    await db().predictions.bulkPut(frozen);
    await load(person.id);
    setMsg(`已把 ${outlook.year} 年的 ${frozen.length} 条预测存入账本，到时候去对轨页结算。`);
  }

  const trackedYears = useMemo(
    () => new Set(records.map((r) => r.window.fromYear)),
    [records],
  );

  if (loading) return (<><AppBar title="一生轨迹" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>);

  if (memberRows.length === 0) {
    return (
      <>
        <AppBar title="一生轨迹" />
        <div className="px-4 py-6">
          <Empty
            title="还没有成员"
            desc="一生轨迹以人为主：先加一位成员（出生年月日必填，有时辰的话紫微那一路才排得出来）。"
            action={<Link href="/members" className="btn btn-primary btn-block">去添加成员</Link>}
          />
        </div>
      </>
    );
  }

  if (!view) {
    return (
      <>
        <AppBar title="一生轨迹" />
        <div className="px-4 py-6">
          <Empty title="资料不足" desc="至少需要出生年月日才能排大运与轨迹。" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title="一生轨迹" subtitle={`${view.person.name} · ${view.present.age} 岁`} />

      <div className="space-y-4 px-4 py-4">
        {msg && (
          <p className="rounded-xl border border-jade/30 bg-jade/5 p-3 text-[0.8125rem] leading-relaxed text-jade">{msg}</p>
        )}

        {memberRows.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {memberRows.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPersonId(m.id)}
                className={`min-h-11 rounded-full border px-4 text-[0.8125rem] active:opacity-60 ${
                  person?.id === m.id ? 'border-cinnabar bg-cinnabar/10 text-cinnabar' : 'border-rice-line text-ink-mute'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* ── 现在 ── */}
        <section className="rounded-2xl border border-cinnabar/20 bg-gradient-to-br from-cinnabar/[0.06] to-transparent p-4">
          <p className="text-[0.75rem] text-ink-mute">现在 · {view.present.year} 年</p>
          <p className="mt-1 font-serif text-2xl font-bold text-cinnabar">
            {view.present.ganZhi}
            {view.present.shiShen && <span className="ml-2 text-base font-normal text-ink-soft">{view.present.shiShen}年</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem] text-ink-mute">
            <span>{view.present.periodLabel}</span>
            <span>流年 {view.present.annualStarName} 入中</span>
            {view.present.ziweiPalace && <span>紫微流年落{view.present.ziweiPalace}</span>}
            {view.present.residenceName && <span>居 {view.present.residenceName}</span>}
          </div>
          {view.present.ziweiMutagens.length > 0 && (
            <p className="mt-1 text-[0.75rem] text-ink-mute">
              流年四化：{view.present.ziweiMutagens.join(' · ')}
            </p>
          )}

          <div className="mt-3 space-y-2">
            {view.present.drafts.length === 0 ? (
              <p className="text-[0.8125rem] leading-relaxed text-ink-mute">
                今年没有达到共振门槛的条目 —— 这是好消息，不是没算出来。
              </p>
            ) : (
              view.present.drafts.map((d, i) => (
                <div key={i} className="rounded-xl border border-rice-line bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[0.6875rem] ${tone(d.domain)}`}>{d.domain}</span>
                    <span className="text-[0.6875rem] text-ink-mute">{d.layers.join('＋')}层</span>
                    <span className="ml-auto text-[0.8125rem] font-medium tabular-nums">{Math.round(d.probability * 100)}%</span>
                  </div>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed">{d.statement}</p>
                  <p className="mt-1 text-[0.6875rem] text-ink-mute">{d.interventionability}</p>
                </div>
              ))
            )}
          </div>

          {view.present.drafts.length > 0 && (
            <button
              type="button"
              onClick={() => void track(view.present)}
              disabled={trackedYears.has(view.present.year)}
              className="btn btn-primary btn-block mt-3"
            >
              {trackedYears.has(view.present.year) ? '今年已记入账本' : '把今年这几条记进账本'}
            </button>
          )}
        </section>

        {view.notes.map((n) => (
          <p key={n} className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-[0.75rem] leading-relaxed">{n}</p>
        ))}

        {/* ── 命盘概览 ── */}
        <section>
          <h2 className="section-title">这张盘</h2>
          <div className="card space-y-2">
            <p className="text-[0.8125rem]">
              八字大运 {view.eras.length} 段
              {view.eras.find((e) => e.current) && ` · 现行${view.eras.find((e) => e.current)!.label}`}
            </p>
            {view.ziwei.available ? (
              <>
                <p className="text-[0.8125rem]">
                  紫微 {view.ziwei.fiveElementsClass} · 命宫在{view.ziwei.soulBranch} ·{' '}
                  {view.ziwei.soulStars && view.ziwei.soulStars.length > 0 ? view.ziwei.soulStars.join('、') : '命宫无主星'}
                </p>
                <p className="text-[0.75rem] text-ink-mute">命主{view.ziwei.soul} · 身主{view.ziwei.body}</p>
                {view.ziwei.patterns && view.ziwei.patterns.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {view.ziwei.patterns.map((p) => (
                      <Expandable key={p.name} title={p.name}>
                        <p className="text-[0.8125rem] leading-relaxed">{p.text}</p>
                      </Expandable>
                    ))}
                  </div>
                )}
                {view.ziwei.caveats?.map((c) => (
                  <p key={c} className="rounded-lg border border-gold/40 bg-gold/5 p-2 text-[0.75rem] leading-relaxed">{c}</p>
                ))}
              </>
            ) : (
              <p className="text-[0.8125rem] leading-relaxed text-ink-mute">紫微未排：{view.ziwei.reason}</p>
            )}
          </div>
        </section>

        {/* ── 过去 ── */}
        <section>
          <h2 className="section-title">走过的路</h2>
          <div className="space-y-2">
            {view.eras.map((era) => (
              <Expandable
                key={era.label + era.fromYear}
                title={`${era.label}　${era.ageRange}`}
                defaultOpen={era.current}
                badge={
                  <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[0.6875rem] ${
                    era.current ? 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar' : 'border-rice-line text-ink-mute'
                  }`}>
                    {era.current ? '现行' : era.past ? '已过' : '未来'}
                  </span>
                }
              >
                <p className="text-[0.8125rem] leading-relaxed">
                  {era.headline ?? '该段没有达到共振门槛的条目。'}
                </p>
                {era.domains.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {era.domains.map((d) => (
                      <span key={d} className={`rounded-md border px-1.5 py-0.5 text-[0.6875rem] ${tone(d)}`}>{d}</span>
                    ))}
                  </div>
                )}
                {era.breakpoints.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {era.breakpoints.map((b, i) => (
                      <li key={i} className="text-[0.75rem] text-ink-mute">
                        {b.year} · {b.kind}
                        {!b.personal && '（全民同时，不可用于归因）'}
                      </li>
                    ))}
                  </ul>
                )}
              </Expandable>
            ))}
          </div>
        </section>

        {/* ── 最值得回忆的年份 ── */}
        {view.worthRecalling.length > 0 && (
          <section>
            <h2 className="section-title">这几年最值得回忆</h2>
            <div className="card space-y-2.5">
              <p className="text-[0.75rem] leading-relaxed text-ink-mute">
                这些年份的断点是<strong className="text-ink">单一</strong>的 —— 要么只搬了家、要么只换了大运。
                回忆它们最能分辨出到底是环境还是命在起作用，比平均摊在四十年里有用得多。
              </p>
              {view.worthRecalling.map((a) => (
                <div key={a.year} className="rounded-xl border border-rice-line bg-white p-3">
                  <p className="text-[0.875rem] font-medium">
                    {a.year} 年 · 指向{a.verdict}
                  </p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-mute">{a.reason}</p>
                </div>
              ))}
              <Link href="/calibrate" className="btn btn-block">去对轨</Link>
            </div>
          </section>
        )}

        {/* ── 未来 ── */}
        <section>
          <h2 className="section-title">往后十年</h2>
          <div className="space-y-2">
            {view.future.map((y) => (
              <Expandable
                key={y.year}
                title={`${y.year}　${y.ganZhi}　${y.age} 岁`}
                defaultOpen={y.notable}
                badge={
                  y.notable ? (
                    <span className="shrink-0 rounded-md border border-cinnabar/40 bg-cinnabar/10 px-1.5 py-0.5 text-[0.6875rem] text-cinnabar">
                      留意
                    </span>
                  ) : undefined
                }
              >
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem] text-ink-mute">
                  {y.shiShen && <span>{y.shiShen}年</span>}
                  <span>{y.annualStarName}入中</span>
                  {y.ziweiPalace && <span>紫微落{y.ziweiPalace}</span>}
                  {y.residenceName && <span>居 {y.residenceName}</span>}
                </div>
                {y.breakpoints.map((b, i) => (
                  <p key={i} className="mt-1.5 text-[0.75rem] text-cinnabar">
                    ⟡ {b.kind}：{b.detail}
                  </p>
                ))}
                <div className="mt-2 space-y-2">
                  {y.drafts.length === 0 ? (
                    <p className="text-[0.8125rem] text-ink-mute">该年没有达到共振门槛的条目。</p>
                  ) : (
                    y.drafts.map((d, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-md border px-1.5 py-0.5 text-[0.6875rem] ${tone(d.domain)}`}>{d.domain}</span>
                          <span className="text-[0.6875rem] text-ink-mute">{d.layers.join('＋')}层</span>
                          <span className="ml-auto text-[0.75rem] tabular-nums">{Math.round(d.probability * 100)}%</span>
                        </div>
                        <p className="mt-1 text-[0.8125rem] leading-relaxed">{d.statement}</p>
                        <Meter value={d.probability} color="#a8352a" />
                      </div>
                    ))
                  )}
                </div>
                {y.drafts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void track(y)}
                    disabled={trackedYears.has(y.year)}
                    className="btn btn-block mt-3"
                  >
                    {trackedYears.has(y.year) ? '已记入账本' : '记进账本，到时候验'}
                  </button>
                )}
              </Expandable>
            ))}
          </div>
        </section>

        <p className="text-[0.75rem] leading-relaxed text-ink-mute">
          概率一律收敛在 3%–92%，绝不说「必定」。每条都标了是哪几层在说话 ——
          单层的看看就好，三层共振的才值得当回事。所有条目都没有人群基准率，
          所以它们能做的是收敛取象，不是证明系统准。
        </p>
      </div>
    </>
  );
}
