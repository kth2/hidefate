'use client';

/** 房屋 —— 大九宫格 + 底部弹层看单宫详情 + 预测与化解。 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  PALACE_DIRECTION,
  ROOM_META,
  STAR_META,
  STAR_NAME,
  YOU_NIAN_META,
  floorLevelsOf,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import {
  RISK_COLOR,
  WINDFALL_NOTE,
  checkLayout,
  findOpportunities,
  judgeRoomPlacement,
  layoutSummary,
  opportunitySummary,
} from '@hidefate/core-synthesis';
import { dailyStar, monthlyStar, solarMonthIndexOf, STAR_NAME as SN } from '@hidefate/core-fengshui';
import { BigNineGrid, type LayerToggles } from '../../components/mobile/BigNineGrid';
import { AppBar, Empty, Expandable, Sheet, Skeleton } from '../../components/mobile/ui';
import { useProperty } from '../../lib/PropertyContext';

type View = '九宫' | '吉方' | '布局' | '预测' | '化解';

const OPP_TONE: Record<string, string> = {
  正财位: 'border-jade/40 bg-jade/10 text-jade',
  偏财位: 'border-gold/40 bg-gold/10 text-gold',
  文昌位: 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar',
  桃花位: 'border-cinnabar/30 bg-cinnabar/[0.07] text-cinnabar',
  贵人位: 'border-gold/40 bg-gold/10 text-gold',
  添丁位: 'border-jade/40 bg-jade/10 text-jade',
  健康位: 'border-jade/40 bg-jade/10 text-jade',
  当旺气口: 'border-jade/50 bg-jade/[0.12] text-jade',
};

const SEV_TONE: Record<string, string> = {
  严重: 'border-risk-crit/40 bg-risk-crit/10 text-risk-crit',
  中等: 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn',
  轻微: 'border-rice-line text-ink-mute',
};

const CONF_TONE: Record<string, string> = {
  高: 'border-jade/40 bg-jade/10 text-jade',
  中: 'border-gold/40 bg-gold/10 text-gold',
  低: 'border-ink-mute/30 bg-ink-mute/10 text-ink-mute',
};

const SCHOOL_TONE: Record<string, string> = {
  玄空飞星: 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar',
  八宅: 'border-jade/40 bg-jade/10 text-jade',
  山向奇门: 'border-gold/40 bg-gold/10 text-gold',
  八字命理: 'border-ink-soft/30 bg-ink-soft/10 text-ink-soft',
  形峦缺角: 'border-risk-high/40 bg-risk-high/10 text-risk-high',
};

export default function HousePage() {
  const { property, result, members, loading, enableQiMen, setEnableQiMen, qiMenLoading, qiMenError, retryQiMen, year } =
    useProperty();
  const [view, setView] = useState<View>('九宫');
  const [selected, setSelected] = useState<PalaceIndex | null>(null);
  const [layers, setLayers] = useState<LayerToggles>({ feixing: true, bazhai: true, qimen: false });
  const [activeFloor, setActiveFloor] = useState(1);

  const floors = property ? floorLevelsOf(property) : [];
  const layoutIssues = useMemo(() => (result ? checkLayout(result) : []), [result]);
  const opportunities = useMemo(
    () => (result ? findOpportunities(result, members) : []),
    [result, members],
  );

  /**
   * 年 / 月 / 日 三层紫白。
   *
   * 力量分级是关键：年为主，月为应，日时为触机。
   * 日星逐日变动，若与年星等量呈现，用户会被颜色牵着走，反而抓不住重点。
   */
  const timeLayers = useMemo(() => {
    const now = new Date();
    try {
      const mIdx = solarMonthIndexOf(now);
      const d = dailyStar(now);
      return {
        month: { star: monthlyStar(year, mIdx), index: mIdx },
        day: { star: d.star, label: d.label },
      };
    } catch {
      return null;
    }
  }, [year]);

  /**
   * 多层住宅时，九宫上只显示当前楼层的房间。
   * 飞星盘与八宅盘全楼共用（由坐向决定），变的只是房间归属。
   */
  const viewResult = useMemo(() => {
    if (!result || floors.length <= 1) return result;
    const palaces = { ...result.palaces };
    for (const key of Object.keys(palaces).map(Number) as PalaceIndex[]) {
      palaces[key] = {
        ...palaces[key],
        rooms: palaces[key].rooms.filter((r) => (r.floorLevel ?? 1) === activeFloor),
      };
    }
    return { ...result, palaces };
  }, [result, floors.length, activeFloor]);

  if (loading) {
    return (
      <>
        <AppBar title="房屋" />
        <div className="px-4 py-4">
          <Skeleton lines={5} />
        </div>
      </>
    );
  }

  if (!property || !result) {
    return (
      <>
        <AppBar title="房屋" />
        <div className="px-4 py-4">
          <Empty
            title="还没有房屋"
            desc="先建立一处房屋，才有九宫盘可看。"
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

  const a = selected != null ? result.palaces[selected] : null;

  return (
    <>
      <AppBar
        title={property.name}
        subtitle={`${year} 年 · ${result.flyingStar.pattern} · ${result.overallRisk}`}
        right={
          <Link href="/report" className="btn btn-sm">
            报告
          </Link>
        }
      />

      <div className="space-y-4 px-4 py-4">
        <div className="seg-row">
          {(['九宫', '吉方', '布局', '预测', '化解'] as View[]).map((v) => (
            <button key={v} type="button" className={`seg ${view === v ? 'seg-on' : ''}`} onClick={() => setView(v)}>
              {v}
              {v === '吉方' && opportunities.length > 0 && (
                <span className="ml-1 text-[0.6875rem] opacity-75">{opportunities.length}</span>
              )}
              {v === '布局' && layoutIssues.length > 0 && (
                <span className="ml-1 text-[0.6875rem] opacity-75">{layoutIssues.length}</span>
              )}
              {v === '预测' && result.predictions.length > 0 && (
                <span className="ml-1 text-[0.6875rem] opacity-75">{result.predictions.length}</span>
              )}
              {v === '化解' && result.prioritisedCures.length > 0 && (
                <span className="ml-1 text-[0.6875rem] opacity-75">{result.prioritisedCures.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* 楼层切换：多层住宅时，九宫上显示的房间按层过滤 */}
        {floors.length > 1 && view === '九宫' && (
          <div className="seg-row">
            {floors.map((f) => (
              <button
                key={f.level}
                type="button"
                className={`seg ${activeFloor === f.level ? 'seg-on' : ''}`}
                onClick={() => setActiveFloor(f.level)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {view === '九宫' && (
          <>
            {/* 图层开关 */}
            <div className="seg-row">
              {(
                [
                  ['feixing', '飞星'],
                  ['bazhai', '八宅'],
                  ['qimen', '奇门'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`seg ${layers[key] ? 'seg-on' : ''}`}
                  onClick={() => {
                    if (key === 'qimen' && !enableQiMen) {
                      setEnableQiMen(true);
                      setLayers((l) => ({ ...l, qimen: true }));
                      return;
                    }
                    setLayers((l) => ({ ...l, [key]: !l[key] }));
                  }}
                >
                  {label}
                  {key === 'qimen' && !enableQiMen && <span className="ml-1 text-[0.6875rem] opacity-70">未开</span>}
                </button>
              ))}
            </div>

            {enableQiMen && qiMenLoading && (
              <p className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-[0.8125rem] text-gold">
                正在载入山向奇门引擎（约 416 KB，仅首次需要，之后离线可用）…
              </p>
            )}
            {enableQiMen && qiMenError && (
              <div className="rounded-xl border border-cinnabar/40 bg-cinnabar/5 p-3 text-[0.8125rem] text-cinnabar">
                <p>山向奇门层载入失败：{qiMenError}</p>
                <button type="button" className="btn btn-sm mt-2" onClick={retryQiMen}>
                  重试
                </button>
              </div>
            )}

            <BigNineGrid result={viewResult ?? result} layers={layers} onSelect={setSelected} />

            {/* 年 / 月 / 日 三层紫白 —— 力量分级必须写清楚 */}
            {timeLayers && (
              <Expandable title="流年 · 流月 · 流日 紫白">
                <div className="space-y-2 text-[0.875rem] leading-relaxed">
                  <p>
                    <b className="text-cinnabar">流年</b>：{SN[result.palaces[5].stars.annual]}入中 ——
                    <span className="text-ink-mute">主一年之气，断吉凶以此为主。</span>
                  </p>
                  <p>
                    <b className="text-gold">流月</b>：{SN[timeLayers.month.star]}入中（第 {timeLayers.month.index} 个节气月）——
                    <span className="text-ink-mute">主一月之应期，用以定「何时发」。</span>
                  </p>
                  <p>
                    <b className="text-ink-soft">流日</b>：{SN[timeLayers.day.star]}入中 ——
                    <span className="text-ink-mute">仅为触机，宜用于择日，不宜据以论断吉凶。</span>
                  </p>
                  <p className="mt-1 text-[0.75rem] text-ink-mute">{timeLayers.day.label}</p>
                </div>
                <p className="mt-3 rounded-lg border border-rice-line bg-rice-deep/40 p-2.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                  <b>年为主，月为应，日时为触机。</b>
                  日星逐日轮转，力量最微 —— 若把它与年星等量齐观，只会被日日变换的颜色牵着走，
                  反而抓不住真正要紧的事。故本 App 的风险评分只计年与月，日星单列，供择日与应期参考。
                </p>
              </Expandable>
            )}

            <Expandable title="本屋总述">
              <p className="text-[0.9375rem] leading-relaxed">{result.summary}</p>
              <p className="mt-3 text-[0.8125rem] font-medium text-ink-soft">置信度：{result.confidence.level}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.8125rem] leading-relaxed text-ink-mute">
                {result.confidence.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Expandable>

            <Expandable title="排盘是怎么来的">
              <ol className="list-decimal space-y-1.5 pl-4 text-[0.8125rem] leading-relaxed text-ink-soft">
                {result.flyingStar.derivation.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
                {result.baZhai.derivation.map((d, i) => (
                  <li key={`b${i}`}>{d}</li>
                ))}
              </ol>
            </Expandable>
          </>
        )}

        {view === '吉方' && (
          <div className="space-y-3">
            <p className="card card-sub">{opportunitySummary(opportunities)}</p>

            {opportunities.length === 0 ? (
              <Empty
                title="本宅当元未见明显旺位"
                desc="元运流转，待流年吉星到方时另有可用之机。眼下以守成与化解为主。"
              />
            ) : (
              opportunities.map((o, i) => (
                <Expandable
                  key={`${o.kind}-${o.palace}-${i}`}
                  title={<span className="text-[0.9375rem] leading-snug">{o.headline}</span>}
                  badge={<span className={`tag shrink-0 ${OPP_TONE[o.kind] ?? 'border-rice-line'}`}>{o.kind}</span>}
                  defaultOpen={i < 2}
                >
                  <p className="text-[0.9375rem] leading-relaxed">{o.finding.statement}</p>
                  <p className="mt-2 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                    依据：{o.finding.principle}
                  </p>

                  <h4 className="mt-3 text-[0.875rem] font-semibold text-jade">怎么用起来</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.875rem] leading-relaxed">
                    {o.howToUse.map((h, k) => (
                      <li key={k}>{h}</li>
                    ))}
                  </ul>

                  <h4 className="mt-3 text-[0.875rem] font-semibold text-cinnabar">忌</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.875rem] leading-relaxed text-ink-soft">
                    {o.avoid.map((h, k) => (
                      <li key={k}>{h}</li>
                    ))}
                  </ul>

                  {o.bestFor.length > 0 && (
                    <p className="mt-3 rounded-lg border border-jade/30 bg-jade/[0.05] p-2.5 text-[0.8125rem] leading-relaxed text-jade">
                      此方对 {o.bestFor.map((id) => members.find((m) => m.id === id)?.name ?? id).join('、')} 尤其有利
                      （其命卦四吉方之一）。
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn btn-sm mt-3"
                    onClick={() => {
                      setSelected(o.palace);
                      setView('九宫');
                    }}
                  >
                    看 {o.direction} 的完整盘面
                  </button>
                </Expandable>
              ))
            )}

            <Expandable title="关于「偏财位」与中彩票">
              <pre className="whitespace-pre-wrap font-sans text-[0.875rem] leading-relaxed text-ink-soft">
                {WINDFALL_NOTE}
              </pre>
            </Expandable>
          </div>
        )}

        {view === '布局' && (
          <div className="space-y-3">
            <p className="card card-sub">{layoutSummary(layoutIssues)}</p>

            {layoutIssues.length === 0 ? (
              <Empty
                title="未见明显布局硬伤"
                desc="没有穿堂煞、污秽压吉、中宫受污或灶压煞方。若房间尚未标全，建议先到「我的 → 房间管理」补齐再看。"
                action={
                  <Link href="/rooms" className="btn btn-block">
                    去补标房间
                  </Link>
                }
              />
            ) : (
              layoutIssues.map((issue) => (
                <Expandable
                  key={issue.id}
                  title={<span className="text-[0.9375rem] leading-snug">{issue.title}</span>}
                  badge={<span className={`tag shrink-0 ${SEV_TONE[issue.severity]}`}>{issue.severity}</span>}
                  defaultOpen={issue.severity === '严重'}
                >
                  <p className="text-[0.9375rem] leading-relaxed">{issue.finding.statement}</p>
                  <p className="mt-2 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                    依据：{issue.finding.principle}
                  </p>
                  <div className="mt-3 space-y-2">
                    {issue.cures.map((c, i) => (
                      <div key={i} className="rounded-xl border border-rice-line bg-rice-deep/30 p-3">
                        <p className="text-[0.9375rem] leading-relaxed">{c.action}</p>
                        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-mute">理据：{c.rationale}</p>
                        {c.avoid.length > 0 && (
                          <p className="mt-1 text-[0.8125rem] leading-relaxed text-cinnabar">切忌：{c.avoid.join('、')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {issue.palaces.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar"
                        onClick={() => {
                          setSelected(p);
                          setView('九宫');
                        }}
                      >
                        看 {PALACE_DIRECTION[p]}
                      </button>
                    ))}
                  </div>
                </Expandable>
              ))
            )}
          </div>
        )}

        {view === '预测' && (
          <div className="space-y-2">
            {result.predictions.length === 0 ? (
              <Empty title="本年未触发显著风险" desc="若尚未标注房间与成员，建议先补齐 —— 房间权重与个人命理是概率的主要来源。" />
            ) : (
              result.predictions.map((p) => (
                <Expandable
                  key={p.id}
                  title={
                    <span className="flex items-center gap-2">
                      <b className="font-serif text-lg">{Math.round(p.probability * 100)}%</b>
                      <span className="min-w-0 flex-1 truncate text-[0.875rem]">
                        {p.direction}
                        {p.room && ` · ${p.room}`}
                      </span>
                    </span>
                  }
                  badge={<span className="tag shrink-0 border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{p.domain}</span>}
                >
                  <p className="text-[0.9375rem] leading-relaxed">{p.headline}。</p>
                  <p className="mt-2 text-[0.8125rem] text-ink-mute">置信度 {p.confidence}</p>

                  <details className="mt-3">
                    <summary className="min-h-[2.5rem] cursor-pointer text-[0.8125rem] text-cinnabar">
                      这个百分比怎么算的？
                    </summary>
                    <ul className="mt-2 space-y-1.5 border-l-2 border-rice-line pl-3 text-[0.75rem] leading-relaxed text-ink-mute">
                      {p.breakdown.map((b, i) => (
                        <li key={i}>
                          <b className="text-ink-soft">{b.factor}</b>
                          <span className={b.contribution >= 0 ? 'text-risk-high' : 'text-jade'}>
                            （{b.contribution >= 0 ? '+' : ''}
                            {b.contribution.toFixed(2)}）
                          </span>
                          ：{b.note}
                        </li>
                      ))}
                    </ul>
                  </details>

                  <button type="button" className="btn btn-sm mt-3" onClick={() => setSelected(p.palace)}>
                    看 {PALACE_DIRECTION[p.palace]} 的完整依据
                  </button>
                </Expandable>
              ))
            )}
          </div>
        )}

        {view === '化解' && (
          <div className="space-y-2">
            {result.prioritisedCures.map((c) => (
              <Expandable
                key={`${c.palace}-${c.priority}`}
                title={
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] text-white">
                      {c.priority}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {c.direction}
                      {c.room && ` · ${c.room}`}
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
        )}
      </div>

      {/* 单宫详情弹层 */}
      <Sheet
        open={a != null}
        onClose={() => setSelected(null)}
        title={
          a && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-[1.125rem] font-semibold">{a.direction}</span>
              <span
                className="tag text-white"
                style={{ background: RISK_COLOR[a.riskLevel], borderColor: RISK_COLOR[a.riskLevel] }}
              >
                {a.riskLevel}
              </span>
              {a.rooms.map((r) => (
                <span key={r.id} className="tag border-rice-line bg-rice-deep text-ink-soft">
                  {r.label ?? r.kind}
                </span>
              ))}
            </div>
          )
        }
      >
        {a && (
          <div className="space-y-4">
            {/* 三派速览 */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-rice-line bg-white p-2.5">
                <p className="text-[0.6875rem] text-ink-mute">飞星</p>
                {/* 三个数字必须分得开：山/运/向 连写成「363」会被读成一个数 */}
                <p className="mt-1 flex items-baseline justify-center gap-1 font-serif text-[1.25rem] font-bold leading-none">
                  <span title="山星">{a.stars.shan}</span>
                  <span className="text-[0.75rem] font-normal text-ink-mute" title="运星">
                    ·{a.stars.yun}·
                  </span>
                  <span title="向星">{a.stars.xiang}</span>
                </p>
                <p className="mt-0.5 text-[0.625rem] text-ink-mute">山·运·向</p>
                <p className="mt-1 text-[0.6875rem] text-cinnabar">{a.combinationName}</p>
              </div>
              <div className="rounded-xl border border-rice-line bg-white p-2.5">
                <p className="text-[0.6875rem] text-ink-mute">八宅</p>
                <p className="mt-1 font-serif text-[1.0625rem] font-semibold leading-tight">{a.baZhaiStar ?? '—'}</p>
                <p className="mt-1 text-[0.6875rem] text-ink-mute">
                  {a.baZhaiStar ? YOU_NIAN_META[a.baZhaiStar].governs : '中宫不论'}
                </p>
              </div>
              <div className="rounded-xl border border-rice-line bg-white p-2.5">
                <p className="text-[0.6875rem] text-ink-mute">奇门</p>
                <p className="mt-1 font-serif text-[1.0625rem] font-semibold leading-tight">
                  {a.qiMen ? a.qiMen.men || '—' : '未开'}
                </p>
                <p className="mt-1 text-[0.6875rem] text-ink-mute">{a.qiMen ? a.qiMen.xing : '可在上方开启'}</p>
              </div>
            </div>

            {a.missing && (
              <div className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-[0.875rem] leading-relaxed">
                <b className="text-risk-high">缺角</b>：{a.missing.summary}
              </div>
            )}

            {/* 房间宜忌 —— 判据与「布局体检」共用 judgeRoomPlacement，两处结论必然一致 */}
            {a.rooms.map((r) => {
              const meta = ROOM_META[r.kind];
              const j = judgeRoomPlacement(result, a.palace, r.kind);
              const good = j.verdict === '得当' || j.verdict === '平常';
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 text-[0.875rem] leading-relaxed ${
                    good ? 'border-jade/30 bg-jade/[0.05]' : 'border-gold/40 bg-gold/[0.05]'
                  }`}
                >
                  <b>{r.label ?? r.kind}</b>（{meta.nature}）
                  {j.text && <span className={good ? 'text-jade' : 'text-gold'}> — {j.text}</span>}
                  <span className="mt-1 block text-[0.8125rem] text-ink-mute">{meta.note}</span>
                </div>
              );
            })}

            {/* 本宫预测 */}
            {result.predictions
              .filter((p) => p.palace === a.palace)
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-rice-line bg-rice-deep/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">{p.domain}</span>
                    <b className="font-serif text-lg">{Math.round(p.probability * 100)}%</b>
                    <span className={`tag ${CONF_TONE[p.confidence]}`}>置信度 {p.confidence}</span>
                  </div>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft">{p.headline}。</p>
                </div>
              ))}

            {/* 依据 */}
            <div>
              <h3 className="section-title px-0">为何这样判断</h3>
              <ul className="space-y-2">
                {a.findings.map((f, i) => (
                  <li key={i} className="rounded-xl border border-rice-line bg-white p-3">
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {f.schools.map((s) => (
                        <span key={s} className={`tag ${SCHOOL_TONE[s] ?? 'border-rice-line text-ink-mute'}`}>
                          {s}
                        </span>
                      ))}
                      <span className={`tag ${CONF_TONE[f.confidence]}`}>置信度 {f.confidence}</span>
                    </div>
                    <p className="text-[0.9375rem] leading-relaxed">{f.statement}</p>
                    <p className="mt-1.5 border-l-2 border-rice-line pl-2.5 text-[0.8125rem] leading-relaxed text-ink-mute">
                      依据：{f.principle}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* 化解 */}
            {a.cures.length > 0 && (
              <div>
                <h3 className="section-title px-0">化解</h3>
                <ol className="space-y-2">
                  {a.cures.map((c, i) => (
                    <li key={i} className="rounded-xl border border-rice-line bg-white p-3">
                      <span
                        className={`tag ${
                          c.urgency === '立即'
                            ? 'border-risk-crit/40 bg-risk-crit/10 text-risk-crit'
                            : c.urgency === '本年内'
                              ? 'border-risk-warn/40 bg-risk-warn/10 text-risk-warn'
                              : 'border-rice-line text-ink-mute'
                        }`}
                      >
                        {c.urgency}
                      </span>
                      <p className="mt-1.5 text-[0.9375rem] leading-relaxed">{c.action}</p>
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-mute">理据：{c.rationale}</p>
                      {c.avoid.length > 0 && (
                        <p className="mt-1 text-[0.8125rem] leading-relaxed text-cinnabar">切忌：{c.avoid.join('、')}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* 脏腑应象 */}
            <Expandable title="此宫各星的脏腑与人物应象">
              <div className="space-y-2 text-[0.8125rem] leading-relaxed text-ink-soft">
                {[a.stars.shan, a.stars.xiang, a.stars.annual].map((s, i) => (
                  <p key={i}>
                    <b className="text-ink">{STAR_NAME[s]}</b>（{STAR_META[s].alias}·{STAR_META[s].wuXing}·
                    {STAR_META[s].person}）：应 {STAR_META[s].organs.join('、')}；须留意 {STAR_META[s].ailments.join('、')}。
                  </p>
                ))}
              </div>
            </Expandable>
          </div>
        )}
      </Sheet>
    </>
  );
}
