'use client';

/** 宅运时间轴 —— 手机上用色带条而非宽表格。 */

import { useMemo, useState } from 'react';
import { RISK_COLOR, buildTimeline, compareYears } from '@hidefate/core-synthesis';
import { AppBar, Empty, Expandable, SegRow, Skeleton } from '../../../components/mobile/ui';
import { useProperty } from '../../../lib/PropertyContext';
import { PropertyConfidenceGate } from '../../../components/PropertyConfidenceGate';

export default function TimelinePage() {
  const { property, members, cures, year, loading } = useProperty();
  const [span, setSpan] = useState(12);

  const timeline = useMemo(() => {
    if (!property) return null;
    return buildTimeline({ profile: property, members, qiMen: null, appliedCures: cures }, { startYear: year, span });
  }, [property, members, cures, year, span]);

  const comparison = useMemo(() => {
    if (!property) return null;
    return compareYears({ profile: property, members, qiMen: null }, year - 1, year, cures);
  }, [property, members, cures, year]);

  if (loading) return <><AppBar title="宅运时间轴" back="/me" /><div className="px-4 py-4"><Skeleton lines={6} /></div></>;
  if (!property || !timeline) {
    return (
      <>
        <AppBar title="宅运时间轴" back="/me" />
        <div className="px-4 py-4">
          <Empty title="请先建立房屋" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title="宅运时间轴" subtitle={`${timeline.startYear}–${timeline.endYear}`} back="/me" />

      <div className="space-y-4 px-4 py-4">
        <PropertyConfidenceGate />

        <SegRow
          label="跨度"
          value={span}
          onChange={setSpan}
          options={[10, 12, 15, 20].map((s) => ({ value: s, label: `${s} 年` }))}
        />

        <p className="card card-sub">{timeline.summary}</p>

        {/* 逐年色带 */}
        <section className="card">
          <div className="space-y-2">
            {timeline.years.map((y) => {
              const width = Math.max(6, Math.round(((1 - y.overallScore) / 2) * 100));
              return (
                <div key={y.year} className="flex items-center gap-2">
                  <span className="w-11 shrink-0 text-[0.8125rem] tabular-nums text-ink-soft">{y.year}</span>
                  <span className="w-12 shrink-0 text-[0.75rem] text-ink-mute">{y.annualStarName}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-md bg-rice-deep">
                    <div className="h-full transition-all" style={{ width: `${width}%`, background: RISK_COLOR[y.overallRisk] }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-[0.75rem]" style={{ color: RISK_COLOR[y.overallRisk] }}>
                    {y.overallRisk}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {timeline.periodChangeYears.map((y) => (
              <span key={y} className="tag border-gold/40 bg-gold/10 text-gold">
                {y} 换运
              </span>
            ))}
          </div>
        </section>

        {/* 逐年热点 */}
        <section className="space-y-2">
          <h2 className="section-title">逐年热点</h2>
          {timeline.years.map((y) => (
            <Expandable
              key={y.year}
              title={
                <span className="flex items-center gap-2">
                  <b className="tabular-nums">{y.year}</b>
                  <span className="text-[0.8125rem] text-ink-mute">{y.annualStarName}</span>
                  {y.isPeriodChange && <span className="tag border-gold/40 bg-gold/10 text-gold">换运</span>}
                </span>
              }
              badge={
                <span className="tag shrink-0 text-white" style={{ background: RISK_COLOR[y.overallRisk], borderColor: RISK_COLOR[y.overallRisk] }}>
                  {y.overallRisk}
                </span>
              }
            >
              <p className="text-[0.875rem] leading-relaxed">
                最需留意：{y.hotspots.map((h) => `${h.direction}（${h.risk}）`).join('、')}
              </p>
              <ul className="mt-2 space-y-1 text-[0.8125rem] leading-relaxed text-ink-mute">
                {y.hotspots.map((h) => (
                  <li key={h.palace}>
                    <b className="text-ink-soft">{h.direction}</b>：{h.reason}
                  </li>
                ))}
              </ul>
              {members.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const r = y.memberRisk[m.id] ?? 0;
                    return (
                      <span
                        key={m.id}
                        className="tag"
                        style={{
                          background: `rgba(168,53,42,${Math.min(0.8, r).toFixed(2)})`,
                          borderColor: 'transparent',
                          color: r > 0.45 ? 'white' : '#3d3733',
                        }}
                      >
                        {m.name} {Math.round(r * 100)}%
                      </span>
                    );
                  })}
                </div>
              )}
              {y.activeCureCount > 0 && (
                <p className="mt-2 text-[0.8125rem] text-jade">已生效化解 {y.activeCureCount} 项</p>
              )}
            </Expandable>
          ))}
        </section>

        {comparison && (
          <section className="card">
            <h2 className="card-title">
              {year - 1} → {year} 年 <span className="ml-1 text-cinnabar">{comparison.direction}</span>
            </h2>
            <p className="text-[0.875rem] leading-relaxed text-ink-soft">{comparison.narrative}</p>
            <div className="mt-3 space-y-2 text-[0.8125rem] leading-relaxed">
              <div>
                <p className="font-medium text-jade">改善</p>
                {comparison.improved.length ? (
                  <ul className="mt-1 space-y-1 text-ink-soft">
                    {comparison.improved.map((d) => (
                      <li key={d.palace}>
                        <b>{d.direction}</b>：{d.note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-mute">无明显改善之方。</p>
                )}
              </div>
              <div>
                <p className="font-medium text-cinnabar">转差</p>
                {comparison.worsened.length ? (
                  <ul className="mt-1 space-y-1 text-ink-soft">
                    {comparison.worsened.map((d) => (
                      <li key={d.palace}>
                        <b>{d.direction}</b>：{d.note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-mute">无明显转差之方。</p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
