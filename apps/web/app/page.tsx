'use client';

/** 首页 —— 站在屋里打开 App 时，最想先知道的三件事：今年如何、这屋如何、先做什么。 */

import Link from 'next/link';
import { STAR_NAME, annualStar, periodOfYear, roomExposure } from '@hidefate/core-fengshui';
import { OVERVIEW_DOMAINS, RISK_COLOR, buildAlerts, familyOverview, yearGlance } from '@hidefate/core-synthesis';
import { useMemo } from 'react';
import { AppBar, Empty, Expandable, Meter, Skeleton } from '../components/mobile/ui';
import { useProperty } from '../lib/PropertyContext';

function FamilyRow({ row }: { row: ReturnType<typeof familyOverview>[number] }) {
  return (
    <>
      <Link
        href={`/person?id=${encodeURIComponent(row.memberId)}`}
        className="flex min-h-[2.75rem] flex-col items-start justify-center truncate text-left text-[0.875rem] text-ink active:text-cinnabar"
      >
        <span className="w-full truncate font-medium">{row.name}</span>
        {row.roleLabel && <span className="w-full truncate text-[0.625rem] text-ink-mute">{row.roleLabel}</span>}
      </Link>
      {row.cells.map((c) => {
        const p = c.probability;
        const a = p == null ? 0 : Math.max(0.08, Math.min(0.85, (p - 0.1) * 1.1));
        return (
          <span
            key={c.domain}
            className={`flex min-h-[2.75rem] items-center justify-center rounded-lg border font-serif text-[0.875rem] ${
              c.label ? 'border-rice-line' : 'border-dashed border-rice-line'
            }`}
            style={{ background: p == null ? 'transparent' : `rgba(168,53,42,${a.toFixed(2)})`, color: a > 0.45 ? 'white' : '#3d3733' }}
            title={c.label ?? '不适用'}
          >
            {!c.label ? '·' : p == null ? '—' : Math.round(p * 100)}
          </span>
        );
      })}
    </>
  );
}

export default function HomePage() {
  const { property, result, members, cures, year, monthIndex, loading, properties } = useProperty();

  const glance = useMemo(() => yearGlance(year), [year]);

  /**
   * 首页只放「化凶」且每个方位一条 —— 早先前三条常是同一个阳台的三种说法，
   * 还夹着催吉的句子，看不出真正该先做哪件。
   */
  const topFixes = useMemo(() => {
    if (!result) return [];
    const seen = new Set<number>();
    return result.prioritisedCures.filter((c) => {
      if (c.intent !== '化凶' || seen.has(c.palace)) return false;
      seen.add(c.palace);
      return true;
    }).slice(0, 3);
  }, [result]);

  /** 全家今年：成员 × 领域，每格是此人个人的最高机率。 */
  const overview = useMemo(() => (result && members.length ? familyOverview(result, members) : []), [result, members]);

  /** 还没指定谁住的卧房、书房 —— 不指定，预测就落不到人身上。 */
  const unassigned = useMemo(
    () => (property?.rooms ?? []).filter((r) => roomExposure(r.kind) === '专属' && !(r.occupants?.length)),
    [property],
  );

  const alerts = useMemo(() => {
    if (!property) return [];
    try {
      return buildAlerts({ profile: property, members, qiMen: null, appliedCures: cures }, year, monthIndex, 6).slice(0, 3);
    } catch {
      return [];
    }
  }, [property, members, cures, year, monthIndex]);

  return (
    <>
      <AppBar title="藏聚" subtitle={`${year} 年 · ${periodOfYear(year).label}`} />

      <div className="space-y-4 px-4 py-4">
        {/* 今年速览 */}
        <section className="rounded-2xl border border-cinnabar/20 bg-gradient-to-br from-cinnabar/[0.06] to-transparent p-4">
          <p className="text-[0.8125rem] text-ink-mute">{year} 年流年星</p>
          <p className="mt-0.5 font-serif text-2xl font-bold text-cinnabar">
            {STAR_NAME[annualStar(year)]}入中
          </p>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">{glance.note}</p>
        </section>

        {loading && <Skeleton lines={4} />}

        {!loading && properties.length === 0 && (
          <Empty
            title="还没有建立房屋"
            desc="没有户型图、人不在现场也可以 —— 只要知道大门朝向，就能得到完整分析。"
            action={
              <Link href="/new" className="btn btn-primary btn-block">
                建立第一处房屋
              </Link>
            }
          />
        )}

        {/* 当前房屋概况 */}
        {!loading && property && result && (
          <>
            <section className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-serif text-[1.0625rem] font-semibold">{property.name}</p>
                  <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                    {property.buildingType}
                    {property.floor != null && ` · ${property.floor} 楼`} · 坐
                    {result.flyingStar.sitting.mountain.name}向{result.flyingStar.facing.mountain.name}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-xl px-3 py-1.5 text-[0.8125rem] font-medium text-white"
                  style={{ background: RISK_COLOR[result.overallRisk] }}
                >
                  {result.overallRisk}
                </span>
              </div>

              <div className="mt-3">
                <Meter
                  value={(result.overallScore + 1) / 2}
                  color={RISK_COLOR[result.overallRisk]}
                  label={result.overallScore.toFixed(2)}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="tag border-rice-line text-ink-mute">{result.flyingStar.pattern}</span>
                <span className="tag border-rice-line text-ink-mute">{result.baZhai.label}</span>
                <span className="tag border-rice-line text-ink-mute">置信度 {result.confidence.level}</span>
                {result.qiMenEnabled && <span className="tag border-gold/40 bg-gold/10 text-gold">三派合参</span>}
              </div>

              <Link href="/house" className="btn btn-primary btn-block mt-4">
                查看九宫盘
              </Link>
            </section>

            {/* 全家今年 —— 这房子对每个人分别有什么影响 */}
            {overview.length > 0 && (
              <section className="card">
                <h2 className="card-title">全家 {year} 年</h2>
                <p className="mt-0.5 text-[0.75rem] text-ink-mute">每格是此人个人的机率；点名字看这屋对其的影响。</p>
                <div className="mt-3 grid grid-cols-[4.5rem_repeat(5,1fr)] items-center gap-1 text-center text-[0.6875rem] text-ink-mute">
                  <span />
                  {OVERVIEW_DOMAINS.map((d) => (
                    <span key={d}>{d === '事业' ? '事业/学业' : d}</span>
                  ))}
                  {overview.map((row) => (
                    <FamilyRow key={row.memberId} row={row} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1 text-[0.8125rem] leading-relaxed text-ink-soft">
                  {overview.map((row) => (
                    <li key={row.memberId}>
                      <b>{row.name}</b>：
                      {row.worst
                        ? `最该留意${row.worst.label}（${Math.round(row.worst.probability * 100)}%）`
                        : '今年没有达到留意门槛的风险'}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 谁住哪间 —— 预测落到人身上的前提 */}
            {members.length > 0 && unassigned.length > 0 && (
              <Link
                href="/members"
                className="block rounded-2xl border border-risk-warn/40 bg-risk-warn/[0.06] p-4 active:opacity-80"
              >
                <p className="text-[0.9375rem] font-medium">还没指定谁住哪间</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">
                  {unassigned.map((r) => r.label ?? r.kind).join('、')} 还没有住户。指定之后，
                  每个人会看到自己房间的吉凶、自己的概率和床头该朝哪。
                  <span className="text-cinnabar"> 去指定 ›</span>
                </p>
              </Link>
            )}

            {/* 最该先做的事 */}
            {topFixes.length > 0 && (
              <section>
                <h2 className="section-title">先做这几件</h2>
                <div className="space-y-2">
                  {topFixes.map((c, i) => (
                    <Expandable
                      key={`${c.palace}-${c.priority}`}
                      title={
                        <span className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] text-white">
                            {i + 1}
                          </span>
                          {/* 同一宫常有多条化解，只显示方位会三条长得一模一样 —— 带上动作首句才分得清 */}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.8125rem] text-ink-mute">
                              {c.direction}
                              {c.room && ` · ${c.room}`}
                            </span>
                            <span className="block line-clamp-2 text-[0.875rem] leading-snug">{c.action}</span>
                          </span>
                        </span>
                      }
                      badge={
                        <span
                          className={`tag shrink-0 ${
                            c.urgency === '立即'
                              ? 'border-risk-crit/40 bg-risk-crit/10 text-risk-crit'
                              : c.urgency === '本年内'
                                ? 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn'
                                : 'border-rice-line text-ink-mute'
                          }`}
                        >
                          {c.urgency}
                        </span>
                      }
                    >
                      <p className="text-[0.9375rem] leading-relaxed">{c.action}</p>
                      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">理据：{c.rationale}</p>
                      {c.avoid.length > 0 && (
                        <p className="mt-1 text-[0.8125rem] leading-relaxed text-cinnabar">切忌：{c.avoid.join('、')}</p>
                      )}
                    </Expandable>
                  ))}
                </div>
              </section>
            )}

            {/* 预警 */}
            {alerts.length > 0 && (
              <section>
                <h2 className="section-title">近期提醒</h2>
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className="card border-risk-warn/30 bg-risk-warn/[0.04]">
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] text-white"
                          style={{ background: RISK_COLOR[a.severity] }}
                        >
                          {a.severity}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.9375rem] font-medium leading-snug">{a.title}</p>
                          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-mute">{a.action}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!loading && properties.length > 0 && !property && (
          <Empty title="尚未选定房屋" desc="到「我的」里选一处房屋作为当前分析对象。" />
        )}
      </div>
    </>
  );
}
