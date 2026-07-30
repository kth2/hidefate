'use client';

/** 家庭融合报告 —— 谁最受益、谁最受克、各自最宜与最忌的房间。 */

import { useMemo } from 'react';
import { buildFamilyFusionReport } from '@hidefate/core-synthesis';
import { AppBar, Empty, Expandable, Skeleton } from '../../../components/mobile/ui';
import { useProperty } from '../../../lib/PropertyContext';
import { PropertyConfidenceGate } from '../../../components/PropertyConfidenceGate';

export default function FusionPage() {
  const { property, members, year, loading } = useProperty();

  const report = useMemo(() => {
    if (!property || members.length === 0) return null;
    try {
      return buildFamilyFusionReport({ profile: property, members, qiMen: null }, year, 10);
    } catch {
      return null;
    }
  }, [property, members, year]);

  if (loading) return <><AppBar title="家庭融合报告" back="/me" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>;

  if (!property || members.length === 0) {
    return (
      <>
        <AppBar title="家庭融合报告" back="/me" />
        <div className="px-4 py-4">
          <Empty title="需要房屋与成员" desc="融合报告分析的是「这间房子对每个人分别怎么样」，所以两者缺一不可。" />
        </div>
      </>
    );
  }

  if (!report) {
    return (
      <>
        <AppBar title="家庭融合报告" back="/me" />
        <div className="px-4 py-4">
          <Empty title="报告生成失败" desc="请检查房屋坐向与入住年是否有效。" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title="家庭融合报告" subtitle={property.name} back="/me" />

      <div className="space-y-4 px-4 py-4">
        <PropertyConfidenceGate />

        <section className="card text-center">
          <p className="text-[0.8125rem] text-ink-mute">全家与本宅契合度</p>
          <p className="mt-1 font-serif text-4xl font-bold text-cinnabar">
            {report.familyFitScore}
            <span className="ml-1 text-base font-normal text-ink-mute">/100</span>
          </p>
          <span className="tag mt-2 inline-flex border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{report.familyVerdict}</span>
          <p className="mt-3 text-left text-[0.875rem] leading-relaxed text-ink-soft">{report.summary}</p>
        </section>

        <section className="space-y-2">
          <h2 className="section-title">每位成员</h2>
          {report.members.map((m) => (
            <Expandable
              key={m.memberId}
              title={
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="text-[0.75rem] font-normal text-ink-mute">
                    {m.mingGua}命 · {m.group}
                  </span>
                </span>
              }
              badge={
                <span className="tag shrink-0 border-rice-line tabular-nums text-ink-soft">{m.fitScore}/100</span>
              }
            >
              <p className="text-[0.875rem] leading-relaxed">{m.narrative}</p>
              <div className="mt-3 space-y-1.5 text-[0.8125rem] leading-relaxed">
                <p className="text-jade">
                  <b>最宜</b>：{m.bestRooms.map((r) => `${r.label}（${r.direction}）`).join('、')}
                </p>
                <p className="text-cinnabar">
                  <b>最忌</b>：{m.worstRooms.map((r) => `${r.label}（${r.direction}）`).join('、')}
                </p>
              </div>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">{m.dataNote}</p>
            </Expandable>
          ))}
        </section>

        {report.roomAssignmentAdvice.length > 0 && (
          <section className="card">
            <h2 className="card-title">房间分配建议</h2>
            <ul className="list-disc space-y-2 pl-4 text-[0.875rem] leading-relaxed text-ink-soft">
              {report.roomAssignmentAdvice.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {report.conflictYears.length > 0 && (
          <section className="card">
            <h2 className="card-title">未来十年高冲突年份</h2>
            <ul className="space-y-2 text-[0.875rem] leading-relaxed text-ink-soft">
              {report.conflictYears.map((c, i) => (
                <li key={i}>
                  <b className="tabular-nums">{c.year}</b> · {c.name}
                  <span className="text-cinnabar">（{Math.round(c.risk * 100)}%）</span>：{c.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
