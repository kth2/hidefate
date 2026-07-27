'use client';

/** 模拟 —— 改一个变量，滑动对比前后。 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  GRID_LAYOUT,
  MOUNTAINS,
  OUTER_PALACES,
  PALACE_DIRECTION,
  ROOM_PRIORITY,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import {
  RISK_COLOR,
  isInstantChange,
  simulate,
  type AnalysisInput,
  type ScenarioChanges,
  type SynthesisResult,
} from '@hidefate/core-synthesis';
import { SwipeCompare } from '../../components/mobile/SwipeCompare';
import { AppBar, Empty, Expandable, Sheet, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';

type Knob = '搬房间' | '改坐向' | '补缺角' | '换楼层' | '谁在家';

export default function SimulatePage() {
  const { property, members, cures, result, year, monthIndex, loading } = useProperty();
  const [changes, setChanges] = useState<ScenarioChanges>({});
  const [knob, setKnob] = useState<Knob | null>(null);

  const input: AnalysisInput | null = useMemo(() => {
    if (!property) return null;
    return { profile: property, members, year, monthIndex, appliedCures: cures, qiMen: null };
  }, [property, members, cures, year, monthIndex]);

  const dirty = Object.keys(changes).length > 0;
  const sim = useMemo(() => {
    if (!input || !dirty) return null;
    return simulate(input, { id: 'scenario', name: '我的方案', changes });
  }, [input, changes, dirty]);

  if (loading) {
    return (
      <>
        <AppBar title="模拟" />
        <div className="px-4 py-4">
          <Skeleton lines={4} />
        </div>
      </>
    );
  }

  if (!property || !result) {
    return (
      <>
        <AppBar title="模拟" />
        <div className="px-4 py-4">
          <Empty
            title="请先建立房屋"
            desc="有了房屋才能试算「如果换个位置会怎样」。"
            action={
              <Link href="/new" className="btn btn-primary btn-block">
                建立房屋
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const keyRooms = property.rooms.filter((r) => ROOM_PRIORITY[r.kind] >= 0.5);

  return (
    <>
      <AppBar
        title="模拟"
        subtitle={dirty ? (isInstantChange(changes) ? '瞬时重算' : '已重排全盘') : '改一个变量试试'}
        right={
          dirty ? (
            <button type="button" className="btn btn-sm" onClick={() => setChanges({})}>
              重置
            </button>
          ) : undefined
        }
      />

      <div className="space-y-4 px-4 py-4">
        {/* 变量入口：大按钮，一次改一样 */}
        <div className="grid grid-cols-2 gap-2">
          {(['搬房间', '改坐向', '补缺角', '换楼层', '谁在家'] as Knob[]).map((k) => {
            const touched =
              (k === '搬房间' && changes.moveRooms) ||
              (k === '改坐向' && changes.sitting != null) ||
              (k === '补缺角' && changes.missingCorners) ||
              (k === '换楼层' && changes.floor != null) ||
              (k === '谁在家' && changes.presentMemberIds);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKnob(k)}
                className={`min-h-[3.5rem] rounded-2xl border px-3 text-[0.9375rem] font-medium transition active:scale-[0.98] ${
                  touched ? 'border-cinnabar bg-cinnabar/[0.07] text-cinnabar' : 'border-rice-line bg-white text-ink-soft'
                }`}
              >
                {k}
                {touched && <span className="ml-1 text-[0.6875rem]">已改</span>}
              </button>
            );
          })}
        </div>

        {!dirty && (
          <Empty title="还没有改动" desc="点上面任一项做个假设，这里就会出现前后对比。房间搬移是瞬时的，改坐向要重排全盘。" />
        )}

        {sim && !sim.valid && (
          <div className="card border-cinnabar/40 bg-cinnabar/5 text-[0.875rem] text-cinnabar">{sim.narrative}</div>
        )}

        {sim && sim.valid && (
          <>
            {/* 总分变化 */}
            <section className="card">
              <div className="flex items-center justify-around">
                <ScoreBlock label="现况" score={sim.overall.before} risk={sim.before.overallRisk} />
                <span className="font-serif text-3xl text-ink-mute">{sim.overall.direction}</span>
                <ScoreBlock label="方案" score={sim.overall.after} risk={sim.after.overallRisk} />
              </div>
            </section>

            {/* 滑动对比 */}
            <section>
              <h2 className="section-title">滑动对比九宫</h2>
              <SwipeCompare
                before={<MiniGrid result={sim.before} />}
                after={<MiniGrid result={sim.after} />}
              />
            </section>

            {/* 变化明细 */}
            {sim.topImproved.length > 0 && (
              <Expandable title={<span className="text-jade">改善最多（{sim.topImproved.length}）</span>} defaultOpen>
                <ul className="space-y-2 text-[0.875rem] leading-relaxed">
                  {sim.topImproved.map((d) => (
                    <li key={d.palace}>
                      <b>{d.direction}</b>
                      <span className="text-jade">
                        （+{d.delta.toFixed(2)}）
                      </span>
                      ：{d.note}
                    </li>
                  ))}
                </ul>
              </Expandable>
            )}

            {sim.topWorsened.length > 0 && (
              <Expandable title={<span className="text-cinnabar">恶化最多（{sim.topWorsened.length}）</span>} defaultOpen>
                <ul className="space-y-2 text-[0.875rem] leading-relaxed">
                  {sim.topWorsened.map((d) => (
                    <li key={d.palace}>
                      <b>{d.direction}</b>
                      <span className="text-cinnabar">（{d.delta.toFixed(2)}）</span>：{d.note}
                    </li>
                  ))}
                </ul>
              </Expandable>
            )}

            {sim.memberDeltas.length > 0 && (
              <Expandable title="对每位成员的影响">
                <ul className="space-y-2 text-[0.875rem] leading-relaxed">
                  {sim.memberDeltas.map((m) => (
                    <li key={m.memberId} className="flex gap-2">
                      <span
                        className={`tag shrink-0 ${
                          m.delta > 0.04
                            ? 'border-jade/40 bg-jade/10 text-jade'
                            : m.delta < -0.04
                              ? 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar'
                              : 'border-rice-line text-ink-mute'
                        }`}
                      >
                        {m.verdict}
                      </span>
                      <span className="min-w-0">{m.note}</span>
                    </li>
                  ))}
                </ul>
              </Expandable>
            )}

            {sim.newCures.length > 0 && (
              <Expandable title={`此方案下新增的化解（${sim.newCures.length}）`}>
                <ol className="list-decimal space-y-2 pl-4 text-[0.875rem] leading-relaxed">
                  {sim.newCures.slice(0, 8).map((c, i) => (
                    <li key={i}>
                      〔{c.urgency}〕{c.direction}：{c.action}
                    </li>
                  ))}
                </ol>
              </Expandable>
            )}
          </>
        )}
      </div>

      {/* 各变量的调整弹层 */}
      <Sheet open={knob != null} onClose={() => setKnob(null)} title={<span className="font-serif text-[1.0625rem] font-semibold">{knob}</span>}>
        {knob === '搬房间' && (
          <div className="space-y-4">
            {keyRooms.length === 0 && <p className="text-[0.875rem] text-ink-mute">尚未标注主要房间。</p>}
            {keyRooms.map((r) => {
              const target = changes.moveRooms?.[r.id] ?? r.primaryPalace;
              return (
                <div key={r.id}>
                  <p className="label">{r.label ?? r.kind}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {OUTER_PALACES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`min-h-[2.75rem] rounded-lg border text-[0.8125rem] ${
                          target === p ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
                        }`}
                        onClick={() => setChanges((c) => ({ ...c, moveRooms: { ...(c.moveRooms ?? {}), [r.id]: p } }))}
                      >
                        {PALACE_DIRECTION[p]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {knob === '改坐向' && (
          <div>
            <p className="label">目前坐 {result.flyingStar.sitting.mountain.name}</p>
            <div className="grid grid-cols-6 gap-1.5">
              <button
                type="button"
                className={`col-span-6 min-h-[2.75rem] rounded-lg border text-[0.875rem] ${
                  changes.sitting == null ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
                }`}
                onClick={() => setChanges((c) => ({ ...c, sitting: undefined }))}
              >
                不变
              </button>
              {MOUNTAINS.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  className={`min-h-[2.75rem] rounded-lg border text-[0.9375rem] ${
                    changes.sitting === m.name ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
                  }`}
                  onClick={() => setChanges((c) => ({ ...c, sitting: m.name }))}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {knob === '补缺角' && (
          <div className="space-y-3">
            <button
              type="button"
              className={`btn btn-block ${changes.missingCorners?.length === 0 ? 'btn-primary' : ''}`}
              onClick={() => setChanges((c) => ({ ...c, missingCorners: [] }))}
            >
              假设全部补齐
            </button>
            <div className="grid grid-cols-4 gap-1.5">
              {OUTER_PALACES.map((p) => {
                const cur = changes.missingCorners ?? property.missingCorners;
                const on = cur.some((m) => m.palace === p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`min-h-[2.75rem] rounded-lg border text-[0.8125rem] ${
                      on ? 'border-risk-high bg-risk-high/10 text-risk-high' : 'border-rice-line bg-white'
                    }`}
                    onClick={() =>
                      setChanges((c) => {
                        const list = c.missingCorners ?? property.missingCorners;
                        return {
                          ...c,
                          missingCorners: list.some((m) => m.palace === p)
                            ? list.filter((m) => m.palace !== p)
                            : [...list, { palace: p as PalaceIndex, severity: 0.5 }],
                        };
                      })
                    }
                  >
                    {PALACE_DIRECTION[p]}
                    {on && <span className="block text-[0.625rem]">缺</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {knob === '换楼层' && (
          <div>
            <label className="label">楼层（目前 {property.floor ?? '未填'}）</label>
            <input
              type="number"
              inputMode="numeric"
              className="field text-center font-serif text-2xl"
              value={changes.floor ?? ''}
              placeholder={String(property.floor ?? '')}
              onChange={(e) => setChanges((c) => ({ ...c, floor: e.target.value === '' ? undefined : Number(e.target.value) }))}
            />
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">
              楼层愈高，地气愈薄：山星（人丁健康）力度递减，向星（财禄）递增。
            </p>
          </div>
        )}

        {knob === '谁在家' && (
          <div className="space-y-2">
            {members.length === 0 && <p className="text-[0.875rem] text-ink-mute">尚未添加成员。</p>}
            {members.map((m) => {
              const on = changes.presentMemberIds?.includes(m.id) ?? true;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`btn btn-block ${on ? 'btn-primary' : ''}`}
                  onClick={() =>
                    setChanges((c) => {
                      const cur = c.presentMemberIds ?? members.map((x) => x.id);
                      return {
                        ...c,
                        presentMemberIds: cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id],
                      };
                    })
                  }
                >
                  {m.name} · {m.mingGua.gua}
                  {m.mingGua.number}命
                </button>
              );
            })}
          </div>
        )}

        <button type="button" className="btn btn-primary btn-block mt-5" onClick={() => setKnob(null)}>
          看对比
        </button>
      </Sheet>
    </>
  );
}

function ScoreBlock({ label, score, risk }: { label: string; score: number; risk: keyof typeof RISK_COLOR }) {
  return (
    <div className="text-center">
      <p className="text-[0.75rem] text-ink-mute">{label}</p>
      <p className="font-serif text-2xl font-bold tabular-nums">{score.toFixed(2)}</p>
      <p className="text-[0.75rem] font-medium" style={{ color: RISK_COLOR[risk] }}>
        {risk}
      </p>
    </div>
  );
}

/** 对比用的小九宫：只保留最能看出差别的信息（山向星 + 风险色）。 */
function MiniGrid({ result }: { result: SynthesisResult }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {GRID_LAYOUT.map((p) => {
        const a = result.palaces[p];
        return (
          <div
            key={p}
            className="gong flex flex-col items-center justify-center rounded-lg border border-rice-line bg-white"
            style={{ boxShadow: `inset 0 -3px 0 0 ${RISK_COLOR[a.riskLevel]}` }}
          >
            <span className="text-[0.625rem] leading-none text-ink-mute">{a.direction}</span>
            {/* 山·运·向 三数需分隔，连写成「718」会被读成一个数 */}
            <span className="mt-1 flex items-baseline gap-0.5 font-serif text-[1.125rem] font-bold leading-none">
              {a.stars.shan}
              <span className="text-[0.625rem] font-normal text-ink-mute">·{a.stars.yun}·</span>
              {a.stars.xiang}
            </span>
            <span className="mt-1 text-[0.5625rem] leading-none text-ink-mute">{a.riskLevel}</span>
          </div>
        );
      })}
    </div>
  );
}
