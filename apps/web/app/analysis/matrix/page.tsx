'use client';

/**
 * 房间 × 成员 风险矩阵。
 *
 * 手机上不做宽表格 —— 横向滚动的表在小屏上很难对齐读。
 * 改成「按成员分组的热力卡片」，每位成员一张卡，卡内是房间热力块，
 * 点任一块弹出依据与化解。
 *
 * 格子里的数字按**实际使用**算：自己的房全量、共用处打六折、偶尔经过打两五折、
 * 别人的卧房不计（显示「—」）。「假如住这里」的值放在弹层里，供换房参考。
 */

import { useMemo, useState } from 'react';
import type { RiskDomain } from '@hidefate/core-fengshui';
import { MATRIX_DOMAINS, buildRoomMemberMatrix, type MatrixCell } from '@hidefate/core-synthesis';
import { AppBar, Empty, SegRow, Sheet, Skeleton } from '../../../components/mobile/ui';
import { useProperty } from '../../../lib/PropertyContext';

export default function MatrixPage() {
  const { result, members, loading } = useProperty();
  const [domain, setDomain] = useState<RiskDomain>('健康');
  const [cell, setCell] = useState<MatrixCell | null>(null);

  const matrix = useMemo(
    () => (result ? buildRoomMemberMatrix(result, members) : null),
    [result, members],
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
      <AppBar title="风险矩阵" subtitle={`${members.length} 位成员 × ${matrix.columns.length} 个房间`} back="/me" />

      <div className="space-y-4 px-4 py-4">
        <SegRow
          label="风险类型"
          value={domain}
          onChange={setDomain}
          options={MATRIX_DOMAINS.map((d) => ({ value: d, label: d }))}
        />

        {matrix.members.map((m) => (
          <section key={m.id} className="card">
            <h2 className="card-title mb-2">{m.name}</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {matrix.columns.map((c) => {
                const cur = matrix.index[`${m.id}|${c.id}`];
                const v = cur?.intensity[domain] ?? 0;
                const notMine = cur != null && cur.exposure === 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => cur && setCell(cur)}
                    className={`relative flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl border px-1 transition active:scale-[0.97] ${
                      cur?.occupied ? 'border-ink border-2' : 'border-rice-line'
                    } ${notMine ? 'border-dashed opacity-60' : ''}`}
                    style={{
                      background: notMine ? 'transparent' : `rgba(168,53,42,${(v * 0.82).toFixed(2)})`,
                      color: v > 0.5 ? 'white' : '#3d3733',
                    }}
                  >
                    {cur?.occupied && (
                      <span className="absolute right-1 top-0.5 text-[0.625rem] font-medium">住</span>
                    )}
                    <span className="truncate text-[0.75rem] leading-tight">{c.label}</span>
                    <span className="font-serif text-[1.0625rem] font-bold leading-none">
                      {notMine ? '—' : Math.round(v * 100)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <p className="px-1 text-[0.75rem] leading-relaxed text-ink-mute">
          数字为该维度对此人的实际风险强度（0–100），色越深风险越高：自己住的房（框「住」）全量计，
          全家共用处打六折，偶尔经过打两五折，别人的卧房对此人不计（「—」）。点任一格看依据、化解，
          以及「假如住这里」的参考值。
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

            <div>
              <p className="label">对此人的实际影响</p>
              <div className="flex flex-wrap gap-1.5">
                {MATRIX_DOMAINS.map((d) => (
                  <span key={d} className="tag border-rice-line text-ink-soft">
                    {d} {cell.exposure === 0 ? '—' : Math.round(cell.intensity[d] * 100)}
                  </span>
                ))}
              </div>
            </div>
            {cell.exposure < 1 && (
              <div>
                <p className="label">假如{cell.memberName}就住这里</p>
                <div className="flex flex-wrap gap-1.5">
                  {MATRIX_DOMAINS.map((d) => (
                    <span key={d} className="tag border-dashed border-rice-line text-ink-mute">
                      {d} {Math.round(cell.ifUsed[d] * 100)}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
