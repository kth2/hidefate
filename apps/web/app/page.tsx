'use client';

/** 首页 —— 站在屋里打开 App 时，最想先知道的三件事：今年如何、这屋如何、先做什么。 */

import Link from 'next/link';
import { STAR_NAME, annualStar, periodOfYear } from '@hidefate/core-fengshui';
import { RISK_COLOR, buildAlerts, yearGlance } from '@hidefate/core-synthesis';
import { useMemo } from 'react';
import { AppBar, Empty, Expandable, Meter, Skeleton } from '../components/mobile/ui';
import { useProperty } from '../lib/PropertyContext';

export default function HomePage() {
  const { property, result, members, cures, year, monthIndex, loading, properties } = useProperty();

  const glance = useMemo(() => yearGlance(year), [year]);

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

            {/* 最该先做的事 */}
            {result.prioritisedCures.length > 0 && (
              <section>
                <h2 className="section-title">先做这几件</h2>
                <div className="space-y-2">
                  {result.prioritisedCures.slice(0, 3).map((c) => (
                    <Expandable
                      key={`${c.palace}-${c.priority}`}
                      title={
                        <span className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] text-white">
                            {c.priority}
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
