'use client';

/** 化解追踪与回访。 */

import { useState } from 'react';
import { MATERIAL_BY_WUXING, OUTER_PALACES, PALACE_DIRECTION, type PalaceIndex } from '@hidefate/core-fengshui';
import { AppBar, Empty, Sheet, Skeleton } from '../../../components/mobile/ui';
import { useProperty } from '../../../lib/PropertyContext';
import { db, newId, type StoredCure } from '../../../lib/db';

type WuXing = '木' | '火' | '土' | '金' | '水';
const WUXING: WuXing[] = ['金', '木', '水', '火', '土'];
const EFFECTIVENESS = ['明显改善', '略有改善', '无变化', '反而更差'] as const;

const EFF_TONE: Record<string, string> = {
  明显改善: 'border-jade/40 bg-jade/10 text-jade',
  略有改善: 'border-gold/40 bg-gold/10 text-gold',
  无变化: 'border-rice-line text-ink-mute',
  反而更差: 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar',
};

export default function CuresPage() {
  const { property, cureRows, result, loading, reload } = useProperty();
  const [adding, setAdding] = useState(false);
  const [palace, setPalace] = useState<PalaceIndex>(OUTER_PALACES[0]!);
  const [wuXing, setWuXing] = useState<WuXing>('金');
  const [item, setItem] = useState('');
  const [appliedOn, setAppliedOn] = useState(() => new Date().toISOString().slice(0, 10));

  if (loading) return <><AppBar title="化解追踪" back="/me" /><div className="px-4 py-4"><Skeleton lines={4} /></div></>;

  if (!property || !result) {
    return (
      <>
        <AppBar title="化解追踪" back="/me" />
        <div className="px-4 py-4">
          <Empty title="请先建立房屋" />
        </div>
      </>
    );
  }

  const pending = cureRows.filter((c) => !c.effectiveness || c.effectiveness === '未评价');

  async function add() {
    if (!item.trim() || !property) return;
    const rec: StoredCure = {
      id: newId('c'),
      propertyId: property.id,
      palace,
      wuXing,
      item: item.trim(),
      appliedOn,
      effectiveFromYear: Number(appliedOn.slice(0, 4)),
      effectiveness: '未评价',
    };
    await db().cures.put(rec);
    setItem('');
    setAdding(false);
    reload();
  }

  async function rate(id: string, effectiveness: StoredCure['effectiveness']) {
    await db().cures.update(id, { effectiveness });
    reload();
  }

  return (
    <>
      <AppBar
        title="化解追踪"
        subtitle={`${cureRows.length} 项记录`}
        back="/me"
        right={
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
            登记
          </button>
        }
      />

      <div className="space-y-4 px-4 py-4">
        {pending.length > 0 && (
          <section className="card border-gold/40 bg-gold/[0.05]">
            <h2 className="card-title text-gold">待回访（{pending.length}）</h2>
            <p className="card-sub mb-3">
              据实评价，系统会据此上调或下调该宫往后的风险 —— 回馈「反而更差」也会被如实采纳，不会被粉饰。
            </p>
            <div className="space-y-3">
              {pending.map((c) => (
                <div key={c.id} className="rounded-xl border border-rice-line bg-white p-3">
                  <p className="text-[0.9375rem]">
                    <b>{PALACE_DIRECTION[c.palace]}</b> · {c.item}（{c.wuXing}）
                  </p>
                  <p className="text-[0.75rem] text-ink-mute">{c.appliedOn}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {EFFECTIVENESS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={`min-h-[2.75rem] rounded-lg border text-[0.8125rem] ${EFF_TONE[e]}`}
                        onClick={() => rate(c.id, e)}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {cureRows.length === 0 ? (
          <Empty
            title="还没有登记化解"
            desc="先照「房屋 → 化解」的清单执行，再回来登记 —— 登记后系统才能追踪效果并校准往后的推算。"
            action={
              <button type="button" className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
                登记一项化解
              </button>
            }
          />
        ) : (
          <section>
            <h2 className="section-title">全部记录</h2>
            <div className="space-y-2">
              {[...cureRows]
                .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn))
                .map((c) => (
                  <div key={c.id} className="card flex flex-wrap items-center gap-2">
                    <span className="tag border-rice-line text-ink-mute">{PALACE_DIRECTION[c.palace]}</span>
                    <span className="text-[0.9375rem]">{c.item}</span>
                    <span className="tag border-rice-line text-ink-mute">{c.wuXing}</span>
                    <span className="text-[0.75rem] text-ink-mute">{c.appliedOn}</span>
                    {c.effectiveness && c.effectiveness !== '未评价' && (
                      <span className={`tag ${EFF_TONE[c.effectiveness]}`}>{c.effectiveness}</span>
                    )}
                    <button
                      type="button"
                      className="ml-auto min-h-[2.5rem] px-2 text-[0.8125rem] text-ink-mute active:text-cinnabar"
                      onClick={async () => {
                        await db().cures.delete(c.id);
                        reload();
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title={<span className="font-serif text-[1.0625rem] font-semibold">登记化解</span>}>
        <div className="space-y-4">
          <div>
            <p className="label">施用方位</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[...OUTER_PALACES, 5 as PalaceIndex].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`min-h-[2.75rem] rounded-lg border text-[0.8125rem] ${
                    palace === p ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
                  }`}
                  onClick={() => setPalace(p)}
                >
                  {PALACE_DIRECTION[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label">化解物五行</p>
            <div className="grid grid-cols-5 gap-1.5">
              {WUXING.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`min-h-[2.75rem] rounded-lg border font-serif text-[1.0625rem] ${
                    wuXing === w ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
                  }`}
                  onClick={() => setWuXing(w)}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MATERIAL_BY_WUXING[wuXing].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="tag border-rice-line text-ink-mute active:border-cinnabar active:text-cinnabar"
                  onClick={() => setItem(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">具体物件</label>
            <input className="field" value={item} onChange={(e) => setItem(e.target.value)} placeholder="例：六帝古钱" />
          </div>

          <div>
            <label className="label">施用日期</label>
            <input type="date" className="field" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
          </div>

          <p className="rounded-xl border border-rice-line bg-rice-deep/40 p-3 text-[0.8125rem] leading-relaxed text-ink-soft">
            登记后，此化解会自动计入 <b>{appliedOn.slice(0, 4)}</b> 年及其后的推算。
          </p>

          <button type="button" className="btn btn-primary btn-block" onClick={add} disabled={!item.trim()}>
            登记
          </button>
        </div>
      </Sheet>
    </>
  );
}
