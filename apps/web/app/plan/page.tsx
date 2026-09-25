'use client';

/**
 * 怎么分房最好 —— 把全家的卧房分配方式都试一遍，给出房子对全家影响最小的一种，一键套用。
 *
 * 前面的页面回答「问题在哪」；这一页回答「最省事的解法」：很多时候不必摆什么，
 * 换个房间睡就行 —— 同一间房，对这个人是凶方，对那个人可能是吉方。
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { planRooms, type PersonBurden } from '@hidefate/core-synthesis';
import { AppBar, Empty, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';
import { applyBedroomPlan } from '../../lib/occupancy';

function worstText(b: PersonBurden): string {
  return b.worst ? `${b.worst.label}比平常${b.worst.relative}（${b.worst.where}）` : '没有哪一方面比平常偏高';
}

export default function PlanPage() {
  const { property, members, cures, year, loading, reload } = useProperty();
  const [applied, setApplied] = useState(false);

  const plan = useMemo(() => {
    if (!property || members.length === 0) return null;
    try {
      return planRooms({ profile: property, members, year, appliedCures: cures, qiMen: null });
    } catch {
      return null;
    }
  }, [property, members, cures, year]);

  if (loading) return <><AppBar title="怎么分房最好" back="/me" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>;

  if (!property || members.length === 0 || !plan) {
    return (
      <>
        <AppBar title="怎么分房最好" back="/me" />
        <div className="px-4 py-4">
          <Empty title="需要房屋与成员" desc="分房比较的是「谁睡哪间」，所以要先有房间与家人。" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title="怎么分房最好" subtitle={property.name} back="/me" />

      <div className="space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-cinnabar/20 bg-gradient-to-br from-cinnabar/[0.06] to-transparent p-4">
          <p className="text-[1rem] font-medium leading-relaxed">{plan.reason}</p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
            把卧房的所有分法都试了一遍，看每个人<b>最严重的那一项</b>比平常高出多少，挑全家加起来最轻的一种。
            只调卧房；现在同住一间的人（夫妻）不拆开；同样好时，能不搬就不搬。
          </p>
        </section>

        {!plan.feasible && (
          <Link
            href="/members"
            className="block rounded-xl border border-dashed border-risk-warn/50 bg-risk-warn/[0.05] p-3 text-[0.875rem] leading-relaxed text-ink-soft"
          >
            {plan.reason} <span className="text-cinnabar">去成员页 ›</span>
          </Link>
        )}

        {plan.moves.length > 0 && (
          <section>
            <h2 className="section-title">建议这样调</h2>
            <ul className="space-y-2">
              {plan.moves.map((m, i) => (
                <li key={i} className="card flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-[0.9375rem]">
                    <b>{m.names.join('、')}</b>：{m.from} <span className="text-cinnabar">→</span> {m.to}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan.feasible && (
          <section>
            <h2 className="section-title">{plan.moves.length > 0 ? '调整前后，对每个人' : '现在，对每个人'}</h2>
            <div className="space-y-2">
              {plan.current.map((before) => {
                const after = plan.best.find((b) => b.memberId === before.memberId)!;
                const change =
                  after.burden < before.burden - 0.05 ? '减轻' : after.burden > before.burden + 0.05 ? '加重' : '不变';
                return (
                  <div key={before.memberId} className="card">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 font-serif text-[1rem] font-semibold">{before.name}</p>
                      {plan.moves.length > 0 && (
                        <span
                          className={`tag shrink-0 ${
                            change === '减轻'
                              ? 'border-jade/40 bg-jade/10 text-jade'
                              : change === '加重'
                                ? 'border-risk-high/40 bg-risk-high/10 text-risk-high'
                                : 'border-rice-line text-ink-mute'
                          }`}
                        >
                          {change}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">
                      <span className="text-ink-mute">现在：</span>
                      {before.bedroom ?? '未指定卧房'} · {worstText(before)}
                    </p>
                    {plan.moves.length > 0 && (
                      <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                        <span className="text-ink-mute">调整后：</span>
                        {after.bedroom ?? '未指定卧房'} · {worstText(after)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {plan.skipped.length > 0 && (
          <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
            {plan.skipped.join('、')} 还没被指定卧房，这次没有参与比较（不替人决定睡哪里）。
          </p>
        )}

        {plan.moves.length > 0 && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={applied}
            onClick={async () => {
              const text = plan.moves.map((m) => `${m.names.join('、')}：${m.from} → ${m.to}`).join('\n');
              if (!confirm(`按这个方案分房？\n\n${text}\n\n之后随时可以在成员页改回来。`)) return;
              await applyBedroomPlan(property.id, plan.assignment);
              setApplied(true);
              reload();
            }}
          >
            {applied ? '已按此方案分房' : '按这个方案分房'}
          </button>
        )}

        <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
          「平常」指同一个人住在吉凶平和的位置时的水平。换房之外，床头朝向也能挽回大半 ——
          每个人的「这屋对我」页里有具体朝哪。
        </p>
      </div>
    </>
  );
}
