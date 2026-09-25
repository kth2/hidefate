'use client';

/**
 * 这屋对我 —— 一个人一页。
 *
 * 回答使用者真正在问的：这房子对「我」有什么影响？我睡的那间好不好？
 * 今年我在健康、财运、感情、事业（孩子是学业）上各要注意什么？我该做什么？
 *
 * 所有数字都取自预测引擎里此人的个人概率，本页只做重新组织。
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { RISK_COLOR, buildPersonView, type PersonDomainCell } from '@hidefate/core-synthesis';
import { AppBar, Empty, Expandable, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';

export default function PersonPage() {
  return (
    <Suspense fallback={<><AppBar title="这屋对我" back="/" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>}>
      <PersonInner />
    </Suspense>
  );
}

/** 概率 → 底色深浅；未达门槛的淡显，不适用的留白。 */
function tone(p: number | null): { bg: string; fg: string } {
  if (p == null) return { bg: 'transparent', fg: '#9b928a' };
  const a = Math.max(0.08, Math.min(0.85, (p - 0.1) * 1.1));
  return { bg: `rgba(168,53,42,${a.toFixed(2)})`, fg: a > 0.45 ? 'white' : '#3d3733' };
}

function DomainTile({ c }: { c: PersonDomainCell }) {
  const t = tone(c.probability);
  return (
    <div
      className={`flex min-h-[4rem] flex-col items-center justify-center rounded-xl border px-1 ${
        c.label ? 'border-rice-line' : 'border-dashed border-rice-line'
      }`}
      style={{ background: t.bg, color: t.fg }}
    >
      <span className="text-[0.75rem] leading-tight">{c.label ?? c.domain}</span>
      <span className="font-serif text-[1.125rem] font-bold leading-none">
        {!c.label ? '不适用' : c.probability == null ? '—' : `${Math.round(c.probability * 100)}%`}
      </span>
    </div>
  );
}

function PersonInner() {
  const params = useSearchParams();
  const { property, result, members, loading } = useProperty();
  const id = params.get('id') ?? members[0]?.id ?? null;

  const view = useMemo(
    () => (result && id ? buildPersonView(result, members, id) : null),
    [result, members, id],
  );

  if (loading) return <><AppBar title="这屋对我" back="/" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>;

  if (!property || !view) {
    return (
      <>
        <AppBar title="这屋对我" back="/" />
        <div className="px-4 py-4">
          <Empty
            title="找不到这位成员"
            desc="先建立房屋并添加成员，才能看这间房子对每个人的影响。"
            action={<Link href="/members" className="btn btn-primary btn-block">去成员页</Link>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title={`这屋对${view.name}`} subtitle={property.name} back="/" />

      <div className="space-y-4 px-4 py-4">
        {/* 切换成员 */}
        {members.length > 1 && (
          <div className="seg-row" role="tablist" aria-label="成员">
            {members.map((m) => (
              <Link
                key={m.id}
                href={`/person?id=${encodeURIComponent(m.id)}`}
                replace
                role="tab"
                aria-selected={m.id === view.memberId}
                className={`seg ${m.id === view.memberId ? 'seg-on' : ''}`}
              >
                {m.name}
              </Link>
            ))}
          </div>
        )}

        {/* 一句话 */}
        <section className="rounded-2xl border border-cinnabar/20 bg-gradient-to-br from-cinnabar/[0.06] to-transparent p-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{view.mingGua}</span>
            <span className="tag border-rice-line text-ink-mute">{view.group}</span>
            <span className="tag border-rice-line text-ink-mute">{view.stage}</span>
            {view.roleLabel && (
              <span className="tag border-rice-line text-ink-mute">
                六亲：{view.roleLabel}
                {view.role?.basis === '推定' && '（推定）'}
              </span>
            )}
          </div>
          <p className="mt-3 text-[1rem] leading-relaxed">{view.summary}</p>
        </section>

        {/* 今年各领域 */}
        <section>
          <h2 className="section-title">{result!.year} 年各方面</h2>
          <div className="grid grid-cols-5 gap-1.5">
            {view.domains.map((c) => (
              <DomainTile key={c.domain} c={c} />
            ))}
          </div>
          <p className="mt-2 px-1 text-[0.75rem] leading-relaxed text-ink-mute">
            数字是{view.name}个人的机率（不是全家的），取这间房子里对其影响最大的一处。
            {view.stage === '儿童' || view.stage === '少年' ? '孩子不看财运与感情；「事业」按学业看。' : ''}
          </p>
        </section>

        {/* 我的房间 */}
        <section>
          <h2 className="section-title">{view.name}的房间</h2>
          {view.unassigned ? (
            <Link
              href="/members"
              className="block rounded-xl border border-dashed border-risk-warn/50 bg-risk-warn/[0.05] p-3 text-[0.875rem] leading-relaxed text-ink-soft"
            >
              还没指定{view.name}住哪间 —— 指定后，才算得出自己卧房、书桌对{view.name}的影响。
              <span className="text-cinnabar"> 去指定 ›</span>
            </Link>
          ) : (
            <div className="space-y-2">
              {view.rooms.map((r) => (
                <div key={r.roomId} className="card flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[1rem] font-semibold">
                      {r.label}
                      <span className="ml-1.5 text-[0.75rem] font-normal text-ink-mute">{r.direction}</span>
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                      {r.personStar
                        ? `此方于${view.name}的命卦为「${r.personStar}」，${r.auspicious ? '对其有利' : '是其凶方'}；`
                        : '中宫不入八宅论断；'}
                      此宫今年{r.palaceRisk}。
                    </p>
                  </div>
                  <span className="tag shrink-0 text-white" style={{ background: RISK_COLOR[r.palaceRisk], borderColor: RISK_COLOR[r.palaceRisk] }}>
                    {r.palaceRisk}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 六亲之宫 */}
        {view.rolePalace && (
          <section className="card">
            <h2 className="card-title">六亲应象 · {view.rolePalace.direction}</h2>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-soft">{view.rolePalace.note}</p>
          </section>
        )}

        {/* 该做的事 */}
        {view.todo.length > 0 && (
          <section>
            <h2 className="section-title">{view.name}该做的事</h2>
            <ol className="space-y-2">
              {view.todo.map((c, i) => (
                <li key={i} className="card flex gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] leading-relaxed">{c.action}</p>
                    <p className="mt-1 text-[0.75rem] text-ink-mute">
                      {c.memberId ? '只针对' + view.name : `${c.direction}${c.room ? ` · ${c.room}` : ''}`} · {c.urgency}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* 吉方 */}
        <section className="card">
          <h2 className="card-title">{view.name}的方位</h2>
          <p className="mt-1 text-[0.875rem] leading-relaxed">
            <span className="text-jade">床头、书桌宜朝</span>：
            {view.bestDirections.map((d) => `${d.direction}（${d.star}）`).join('、')}
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed">
            <span className="text-cinnabar">宜避</span>：
            {view.worstDirections.map((d) => `${d.direction}（${d.star}）`).join('、')}
          </p>
        </section>

        {/* 全部条目 */}
        <section>
          <h2 className="section-title">今年涉及{view.name}的全部条目 · {view.items.length}</h2>
          {view.items.length === 0 ? (
            <Empty title="没有涉及此人的条目" desc="此人常用的地方与六亲之宫，今年都没有达到出报门槛。" />
          ) : (
            <div className="space-y-2">
              {view.items.map((it) => (
                <Expandable
                  key={it.prediction.id}
                  title={
                    <span className="flex items-center gap-2">
                      <b className="font-serif text-lg">{Math.round(it.probability * 100)}%</b>
                      <span className="min-w-0 flex-1 truncate text-[0.875rem]">
                        {it.prediction.direction}
                        {it.prediction.room && ` · ${it.prediction.room}`}
                      </span>
                    </span>
                  }
                  badge={<span className="tag shrink-0 border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{it.label}</span>}
                >
                  <p className="text-[0.9375rem] leading-relaxed">可能的事：{it.reading}。</p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-mute">为何涉及{view.name}：{it.via}。</p>
                </Expandable>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
