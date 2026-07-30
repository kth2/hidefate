'use client';

/**
 * 房间 × 成员 风险矩阵。
 *
 * 手机上不做宽表格 —— 横向滚动的表在小屏上很难对齐读。
 * 改成「按成员分组的热力卡片」，每位成员一张卡，卡内是房间热力块，
 * 点任一块弹出依据与化解。
 */

import { useMemo, useState } from 'react';
import type { RiskDomain } from '@hidefate/core-fengshui';
import { MATRIX_DOMAINS, buildRoomMemberMatrix, type MatrixCell } from '@hidefate/core-synthesis';
import { AppBar, Empty, SegRow, Sheet, Skeleton } from '../../../components/mobile/ui';
import { useProperty } from '../../../lib/PropertyContext';
import { PropertyConfidenceGate } from '../../../components/PropertyConfidenceGate';

export default function MatrixPage() {
  const { result, members, loading } = useProperty();
  const [domain, setDomain] = useState<RiskDomain>('健康');
  const [cell, setCell] = useState<MatrixCell | null>(null);
  /** '' = 全部成员。 */
  const [memberId, setMemberId] = useState('');

  const matrix = useMemo(
    () => (result ? buildRoomMemberMatrix(result, members) : null),
    [result, members],
  );

  /**
   * 单看一位成员。
   *
   * 一家四五口时，纵向排下来的卡片要滑很久才能对上「小孩那间房到底怎样」。
   * 家长真正的问题往往是针对某一个人的，这个筛选就是为那种时刻准备的。
   */
  const shownMembers = useMemo(
    () => (matrix ? matrix.members.filter((m) => !memberId || m.id === memberId) : []),
    [matrix, memberId],
  );

  if (loading) return <><AppBar title="风险矩阵" back="/me" /><div className="px-4 py-4"><Skeleton lines={5} /></div></>;

  if (!result || !matrix || members.length === 0) {
    return (
      <>
        <AppBar title="风险矩阵" back="/me" />
        <div className="px-4 py-4">
          <Empty title="需要房屋与成员" desc="矩阵是「谁 × 哪间房」的交叉，两者缺一不可。" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar
        title="风险矩阵"
        subtitle={
          memberId
            ? `${matrix.members.find((m) => m.id === memberId)?.name ?? ''} × ${matrix.columns.length} 个房间`
            : `${members.length} 位成员 × ${matrix.columns.length} 个房间`
        }
        back="/me"
      />

      <div className="space-y-4 px-4 py-4">
        <PropertyConfidenceGate />

        <SegRow
          label="风险类型"
          value={domain}
          onChange={setDomain}
          options={MATRIX_DOMAINS.map((d) => ({ value: d, label: d }))}
        />

        <SegRow
          label="只看某一位"
          value={memberId}
          onChange={setMemberId}
          options={[
            { value: '', label: `全部（${matrix.members.length}）` },
            ...matrix.members.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />

        {shownMembers.map((m) => (
          <section key={m.id} className="card">
            <h2 className="card-title mb-2">{m.name}</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {matrix.columns.map((c) => {
                const cur = matrix.index[`${m.id}|${c.id}`];
                const v = cur?.intensity[domain] ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => cur && setCell(cur)}
                    className="flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl border border-rice-line px-1 transition active:scale-[0.97]"
                    style={{
                      background: `rgba(168,53,42,${(v * 0.82).toFixed(2)})`,
                      color: v > 0.5 ? 'white' : '#3d3733',
                    }}
                  >
                    <span className="truncate text-[0.75rem] leading-tight">{c.label}</span>
                    <span className="font-serif text-[1.0625rem] font-bold leading-none">{Math.round(v * 100)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
          数字为该维度风险强度（0–100），色越深风险越高。点任一格看古法依据与化解。
        </p>
      </div>

      <Sheet
        open={cell != null}
        onClose={() => setCell(null)}
        title={
          cell && (
            <div>
              <p className="font-serif text-[1.0625rem] font-semibold">
                {cell.memberName} · {cell.columnLabel}
              </p>
              <p className="text-[0.75rem] text-ink-mute">{cell.direction}</p>
            </div>
          )
        }
      >
        {cell && (
          <div className="space-y-4">
            <p className="text-[0.9375rem] leading-relaxed">{cell.brief}</p>

            <div className="flex flex-wrap gap-1.5">
              {MATRIX_DOMAINS.map((d) => (
                <span key={d} className="tag border-rice-line text-ink-soft">
                  {d} {Math.round(cell.intensity[d] * 100)}
                </span>
              ))}
            </div>

            <div>
              <h3 className="section-title px-0">古法依据</h3>
              <ul className="space-y-2">
                {cell.findings.slice(0, 5).map((f, i) => (
                  <li key={i} className="rounded-xl border border-rice-line bg-white p-3">
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {f.schools.map((s) => (
                        <span key={s} className="tag border-rice-line text-ink-mute">
                          {s}
                        </span>
                      ))}
                      <span className="tag border-rice-line text-ink-mute">置信度 {f.confidence}</span>
                    </div>
                    <p className="text-[0.9375rem] leading-relaxed">{f.statement}</p>
                    <p className="mt-1.5 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                      依据：{f.principle}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {cell.cures.length > 0 && (
              <div>
                <h3 className="section-title px-0">化解</h3>
                <ol className="list-decimal space-y-1.5 pl-4 text-[0.875rem] leading-relaxed text-ink-soft">
                  {cell.cures.slice(0, 5).map((c, i) => (
                    <li key={i}>
                      〔{c.urgency}〕{c.action}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
