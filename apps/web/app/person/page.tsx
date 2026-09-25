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
import {
  RELATIVE_NOTE,
  RISK_COLOR,
  buildPersonView,
  monthlyOutlook,
  type PersonDomainCell,
} from '@hidefate/core-synthesis';
import { currentFengShuiTime } from '../../lib/useAnalysis';
import { AppBar, Empty, Expandable, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';

export default function PersonPage() {
  return (
    <Suspense fallback={<><AppBar title="这屋对我" back="/" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>}>
      <PersonInner />
    </Suspense>
  );
}

/** 逐月的徽章按「比平时」着色 —— 全年都不好的人，要看的是哪几个月更要紧。 */
const TREND_TONE: Record<string, string> = {
  加重: 'border-risk-high/40 bg-risk-high/10 text-risk-high',
  如常: 'border-rice-line text-ink-mute',
  缓和: 'border-jade/40 bg-jade/10 text-jade',
};

/** 概率 → 底色深浅；未达门槛的淡显，不适用的留白。 */
/** 相对档位 → 底色：看的是比平常高出多少，而不是绝对百分比。 */
const REL_BG: Record<string, { bg: string; fg: string }> = {
  明显偏高: { bg: 'rgba(168,53,42,0.82)', fg: 'white' },
  偏高: { bg: 'rgba(168,53,42,0.38)', fg: '#3d3733' },
  与平常相当: { bg: 'rgba(0,0,0,0.03)', fg: '#3d3733' },
  偏低: { bg: 'rgba(46,125,50,0.16)', fg: '#2e5d32' },
  明显偏低: { bg: 'rgba(46,125,50,0.32)', fg: '#1f4a22' },
};

/** 一格：先说比平常高还是低，百分比退居小字当指数。 */
function DomainTile({ c }: { c: PersonDomainCell }) {
  const t = c.relative ? REL_BG[c.relative]! : { bg: 'transparent', fg: '#9b928a' };
  return (
    <div
      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center ${
        c.label ? 'border-rice-line' : 'border-dashed border-rice-line'
      }`}
      style={{ background: t.bg, color: t.fg }}
    >
      <span className="text-[0.75rem] leading-tight">{c.label ?? c.domain}</span>
      <span className="text-[0.8125rem] font-bold leading-tight">
        {!c.label ? '不适用' : c.relative == null ? '—' : c.relative === '与平常相当' ? '如常' : c.relative}
      </span>
      {c.probability != null && (
        <span className="text-[0.625rem] leading-none opacity-80">指数 {Math.round(c.probability * 100)}</span>
      )}
    </div>
  );
}

function PersonInner() {
  const params = useSearchParams();
  const { property, result, members, cures, qiMen, year, loading } = useProperty();
  const id = params.get('id') ?? members[0]?.id ?? null;

  const view = useMemo(
    () => (result && id ? buildPersonView(result, members, id) : null),
    [result, members, id],
  );

  /** 逐月：分析年是今年就从本月起，否则从该年正月起。 */
  const months = useMemo(() => {
    if (!property || !id || members.length === 0) return null;
    const now = currentFengShuiTime();
    try {
      const out = monthlyOutlook(
        { profile: property, members, qiMen: result?.qiMenEnabled ? qiMen : null, appliedCures: cures },
        year,
        year === now.year ? now.monthIndex : 1,
        12,
      );
      return out.rows.find((r) => r.memberId === id) ?? null;
    } catch {
      return null;
    }
  }, [property, members, cures, qiMen, result, year, id]);

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
          <div className="grid grid-cols-4 gap-1.5">
            {view.domains
              .filter((c) => c.label != null)
              .map((c) => (
                <DomainTile key={c.domain} c={c} />
              ))}
          </div>
          <p className="mt-2 px-1 text-[0.75rem] leading-relaxed text-ink-mute">
            和「平常」比：{RELATIVE_NOTE}小字「指数」是模型给的原始分数（{view.name}个人的，不是全家的）。
            {view.stage === '儿童' || view.stage === '少年'
              ? '孩子不看感情、子女、事业、财运，只看健康、意外、学业、人际。'
              : view.stage === '长者'
                ? '长者不看学业。'
                : ''}
          </p>
        </section>

        {/* 风水师建言 —— 人生八个方面，逐项现状、宜、忌、依据 */}
        {view.advice.length > 0 && (
          <section>
            <h2 className="section-title">风水师建言 · {view.advice.length} 个方面</h2>
            <div className="space-y-1.5">
              {view.advice.map((a) => {
                const t = a.status ? REL_BG[a.status]! : null;
                const hot = a.status === '偏高' || a.status === '明显偏高';
                return (
                  <Expandable
                    key={a.aspect}
                    defaultOpen={hot}
                    title={
                      <span className="flex items-center gap-2">
                        <b className="w-9 shrink-0 font-serif text-[1rem]">{a.aspect}</b>
                        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-soft">{a.focus}</span>
                      </span>
                    }
                    badge={
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-bold"
                        style={t ? { background: t.bg, color: t.fg } : { color: '#9b928a' }}
                      >
                        {a.status == null ? '平稳' : a.status === '与平常相当' ? '如常' : a.status}
                      </span>
                    }
                  >
                    <p className="text-[0.8125rem] text-ink-mute">现在：{a.statusNote}</p>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed">{a.focus}</p>
                    <p className="mt-2 text-[0.75rem] font-medium text-jade">宜</p>
                    <ul className="list-disc space-y-1 pl-4 text-[0.875rem] leading-relaxed">
                      {a.yi.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[0.75rem] font-medium text-cinnabar">忌</p>
                    <ul className="list-disc space-y-1 pl-4 text-[0.875rem] leading-relaxed">
                      {a.ji.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                    <p className="mt-2 border-l-2 border-rice-line pl-2.5 text-[0.75rem] leading-relaxed text-ink-mute">
                      依据：{a.basis.join(' ')}
                    </p>
                  </Expandable>
                );
              })}
            </div>
          </section>
        )}

        {/* 逐月 */}
        {months && (
          <section>
            <h2 className="section-title">逐月 · 接下来十二个节气月</h2>
            <div className="space-y-1.5">
              {months.months.map((c, i) => (
                <Expandable
                  key={`${c.slot.year}-${c.slot.monthIndex}`}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="w-[4.5rem] shrink-0 leading-tight">
                        <span className="block text-[0.9375rem] font-medium">
                          {c.slot.label}
                          {i === 0 && <span className="ml-1 text-[0.6875rem] text-cinnabar">本月</span>}
                        </span>
                        <span className="block text-[0.6875rem] text-ink-mute">{c.slot.range}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-soft">
                        {c.top
                          ? `${c.top.label} ${Math.round(c.top.probability * 100)}%（平时 ${Math.round(c.top.baseline * 100)}%）`
                          : '无相关条目'}
                      </span>
                    </span>
                  }
                  badge={<span className={`tag shrink-0 ${TREND_TONE[c.trend]}`}>{c.top ? c.trend : '—'}</span>}
                >
                  {c.domains.length === 0 ? (
                    <p className="text-[0.875rem] text-ink-mute">这个月没有涉及{view.name}的条目。</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {c.domains.map((d) => (
                        <li key={d.domain} className="flex items-baseline gap-2 text-[0.8125rem]">
                          <b className="w-10 shrink-0 font-serif text-[0.9375rem]">{Math.round(d.probability * 100)}%</b>
                          <span className="min-w-0 flex-1 leading-relaxed">
                            <b>{d.label}</b>
                            <span className="text-ink-mute">
                              {' '}· 平时 {Math.round(d.baseline * 100)}% · {d.reason}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Expandable>
              ))}
            </div>
            <p className="mt-2 px-1 text-[0.75rem] leading-relaxed text-ink-mute">
              以今年的个人机率为底（「平时」），再看每月飞入各处的流月星：凶星加临就调高、吉星加临就调低，
              而且只按{view.name}受那一处影响的程度加减。「加重」即这个月比平时更要紧。月份按节气换，不是公历月。
            </p>
          </section>
        )}

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

        {view.rooms.some((r) => r.auspicious === false) && (
          <Link
            href="/plan"
            className="block rounded-xl border border-cinnabar/30 bg-cinnabar/[0.05] p-3 text-[0.875rem] leading-relaxed text-ink-soft"
          >
            {view.name}的房间落在其凶方。看看全家换个分法会不会更好
            <span className="text-cinnabar"> 怎么分房最好 ›</span>
          </Link>
        )}

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

        {/* 命与运 —— 房子之外的那两层 */}
        <Link
          href={`/life?id=${encodeURIComponent(view.memberId)}`}
          className="card flex items-center gap-3 active:bg-rice-deep/40"
        >
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[1rem] font-semibold">{view.name}的一生轨迹</p>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-mute">
              本页只看这处房子；八字、紫微、流年这些「命与运」层面的事，在一生轨迹里。
            </p>
          </div>
          <span className="shrink-0 text-cinnabar" aria-hidden>›</span>
        </Link>

        {/* 打印这一页 —— 交给本人看 */}
        <Link
          href={`/report?person=${encodeURIComponent(view.memberId)}`}
          className="btn btn-block"
        >
          打印 / 存成 PDF（只印{view.name}这一页）
        </Link>

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
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.75rem] font-bold"
                        style={{ background: REL_BG[it.relative]!.bg, color: REL_BG[it.relative]!.fg }}
                      >
                        {it.relative === '与平常相当' ? '如常' : it.relative}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.875rem]">
                        {it.prediction.direction}
                        {it.prediction.room && ` · ${it.prediction.room}`}
                      </span>
                    </span>
                  }
                  badge={<span className="tag shrink-0 border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{it.label}</span>}
                >
                  <p className="text-[0.9375rem] leading-relaxed">可能的事：{it.reading}。</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-mute">
                    比平常{it.relative === '与平常相当' ? '差不多' : it.relative.replace('偏', '')}：指数 {Math.round(it.probability * 100)}，
                    住在吉凶平和的位置时约 {Math.round(it.neutral * 100)}。
                  </p>
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
