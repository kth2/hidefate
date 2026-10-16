'use client';

/**
 * 十秒起盘 —— 风水师最常做的动作：只给坐向度数与年份，立刻出全盘。
 *
 * 不建档、不填房间、不填家人。出：飞星盘、兼向／空亡、玄空格局体检、
 * 今明两年煞方、按优先级排好的行动卡。要深入再「存为房屋」补资料。
 *
 * 门派设置在本页就能改（运盘取哪年、五入中、兼向阈值），改了即重算，
 * 页脚照实印出本次用了哪套设置。
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  PALACE_DIRECTION,
  analyzeLine,
  annualSha,
  degreeToMountain,
  describeSchool,
  facingOf,
  fengShuiYearOf,
  periodOfYear,
  type BuildingType,
  type CenterFiveRule,
  type GeJu,
  type PalaceIndex,
  type PeriodBasis,
  type PropertyProfile,
} from '@hidefate/core-fengshui';
import { buildActionPlan, synthesise, type Action } from '@hidefate/core-synthesis';
import { BigNineGrid } from '../../components/mobile/BigNineGrid';
import { AppBar, Expandable, SegRow, Sheet } from '../../components/mobile/ui';
import { useSchool } from '../../lib/schoolStore';

const VALENCE_TONE: Record<GeJu['valence'], string> = {
  吉: 'border-jade/40 bg-jade/5 text-jade',
  凶: 'border-cinnabar/40 bg-cinnabar/5 text-cinnabar',
  中: 'border-rice-line bg-rice-deep/40 text-ink-soft',
};

const PRIORITY_TONE: Record<Action['priority'], string> = {
  必做: 'bg-cinnabar text-white',
  宜做: 'bg-cinnabar/15 text-cinnabar',
  可选: 'bg-rice-deep text-ink-soft',
};

const BUILDING_QUICK: readonly BuildingType[] = ['公寓', '高层单位', '排屋', '半独立式', '独立屋', '店铺零售', '办公室'];

function basisYearLabel(b: PeriodBasis): string {
  return b === '建成年' ? '建成年' : b === '换天心年' ? '大装修（换天心）年' : '入住年';
}

export default function QuickChartPage() {
  const nowYear = fengShuiYearOf(new Date());
  const [school, setSchool] = useSchool();
  const [degText, setDegText] = useState('');
  const [yearText, setYearText] = useState(String(nowYear));
  const [lookYear, setLookYear] = useState(nowYear);
  const [buildingType, setBuildingType] = useState<BuildingType>('公寓');
  const [sel, setSel] = useState<PalaceIndex | null>(null);

  const deg = degText.trim() === '' ? null : Number(degText);
  const chartYear = Number(yearText);
  const valid = deg != null && Number.isFinite(deg) && deg >= 0 && deg < 360 && Number.isInteger(chartYear) && chartYear >= 1864 && chartYear <= 2200;

  const data = useMemo(() => {
    if (!valid) return null;
    // 门派选的是哪一年，用户就在这里填哪一年；三个字段都给同一年，resolveChartYear 不会回退。
    const profile: PropertyProfile = {
      id: 'quick',
      name: '十秒起盘',
      buildingType,
      sitting: deg!,
      moveInYear: chartYear,
      builtYear: chartYear,
      renovatedYear: chartYear,
      missingCorners: [],
      rooms: [],
      entryMode: '罗盘实测',
    };
    try {
      const result = synthesise({ profile, members: [], year: lookYear, school });
      const plan = buildActionPlan(result);
      const line = analyzeLine(deg!, school.jianThreshold);
      return { result, plan, line, shaNow: annualSha(lookYear), shaNext: annualSha(lookYear + 1) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as const;
    }
  }, [valid, deg, chartYear, lookYear, buildingType, school]);

  const sitting = valid ? degreeToMountain(deg!) : null;
  const facing = valid ? facingOf(deg!).mountain : null;

  return (
    <>
      <AppBar title="十秒起盘" subtitle="坐向度数 + 年份，即出全盘" back="/" />

      <div className="space-y-4 px-4 py-4 pb-tab">
        {/* 输入 */}
        <section className="card space-y-3">
          <div>
            <label className="label" htmlFor="deg">坐山度数（罗盘读数，0–359.9°）</label>
            <input
              id="deg"
              className="field"
              inputMode="decimal"
              placeholder="例如 352.5"
              value={degText}
              onChange={(e) => setDegText(e.target.value)}
            />
            {sitting && facing && (
              <p className="mt-1.5 text-[0.8125rem] text-ink-soft">
                坐<b>{sitting.name}</b>向<b>{facing.name}</b>（{sitting.gua}宫{sitting.yuan}）
              </p>
            )}
          </div>

          <SegRow
            label="运盘取"
            options={(['入住年', '建成年', '换天心年'] as const).map((v) => ({ value: v, label: v }))}
            value={school.periodBasis}
            onChange={(v) => setSchool({ periodBasis: v })}
          />
          <div>
            <label className="label" htmlFor="yr">{basisYearLabel(school.periodBasis)}（立春为界）</label>
            <input id="yr" className="field" inputMode="numeric" value={yearText} onChange={(e) => setYearText(e.target.value)} />
            {Number.isInteger(chartYear) && chartYear >= 1864 && (
              <p className="mt-1.5 text-[0.75rem] text-ink-mute">
                立盘于{periodOfYear(chartYear).label}。二手房若曾大装修，可改选「换天心年」对照。
              </p>
            )}
          </div>

          <SegRow
            label="看盘年"
            options={[nowYear, nowYear + 1, nowYear + 2].map((y) => ({ value: y, label: `${y}` }))}
            value={lookYear}
            onChange={setLookYear}
          />

          <SegRow
            label="类别（影响各方面轻重，不改星盘）"
            options={BUILDING_QUICK.map((b) => ({ value: b, label: b }))}
            value={buildingType}
            onChange={setBuildingType}
          />
        </section>

        {!valid && (
          <p className="px-1 text-[0.8125rem] leading-relaxed text-ink-mute">
            填入度数即出盘。度数越准越好：每山只有 15°，兼向替卦只在 3° 之差。手机指南针易受钢筋、电器干扰，宜以罗盘复核。
          </p>
        )}

        {data && 'error' in data && <p className="card text-[0.875rem] text-cinnabar">{data.error}</p>}

        {data && !('error' in data) && (
          <>
            {/* 立线 */}
            <section
              className={`rounded-2xl border p-3.5 text-[0.875rem] leading-relaxed ${
                data.line.grade === '下卦' ? 'border-rice-line bg-white' : 'border-cinnabar/40 bg-cinnabar/5'
              }`}
            >
              <p className="font-medium">
                {data.result.flyingStar.period.label} · {data.result.flyingStar.pattern} · {data.line.grade}
              </p>
              <p className="mt-0.5 text-ink-soft">{data.line.label}</p>
              {data.line.grade !== '下卦' && <p className="mt-1 text-[0.8125rem] text-ink-soft">{data.line.advice}</p>}
            </section>

            {/* 盘 */}
            <section>
              <BigNineGrid result={data.result} layers={{ feixing: true, bazhai: true, qimen: false }} onSelect={setSel} />
            </section>

            {/* 格局 */}
            <section>
              <h2 className="section-title">玄空格局</h2>
              {data.result.geju && data.result.geju.items.length > 0 ? (
                <div className="space-y-2">
                  {data.result.geju.items.map((g) => (
                    <div key={g.kind} className={`rounded-2xl border p-3 ${VALENCE_TONE[g.valence]}`}>
                      <p className="text-[0.875rem] font-semibold">
                        {g.kind}
                        <span className="ml-1.5 text-[0.75rem] font-normal opacity-80">
                          {g.valence} · 主{g.governs}
                          {g.window ? ` · ${g.window.startYear}–${g.window.endYear}` : ''}
                        </span>
                      </p>
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{g.summary}</p>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[0.75rem] leading-relaxed text-ink-mute">
                        {g.caveats.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="card-sub px-1">未见伏吟、反吟、合十、三般卦、入囚、失运诸格。</p>
              )}
            </section>

            {/* 煞方 */}
            <section>
              <h2 className="section-title">流年煞方（动土禁方）</h2>
              <div className="space-y-2">
                {[data.shaNow, data.shaNext].map((s) => (
                  <div key={s.year} className="card text-[0.8125rem] leading-relaxed text-ink-soft">
                    {s.summary}
                  </div>
                ))}
              </div>
            </section>

            {/* 行动 */}
            <section>
              <h2 className="section-title">先做什么</h2>
              {data.plan.conflicts.length > 0 && (
                <div className="mb-2 rounded-2xl border border-risk-warn/50 bg-risk-warn/5 p-3 text-[0.8125rem] leading-relaxed">
                  <p className="font-medium">同宫化解互相矛盾，须现场裁量：</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.75rem] text-ink-soft">
                    {[...new Map(data.plan.conflicts.map((c) => [`${c.direction}|${c.term}`, c])).values()].slice(0, 6).map((c) => (
                      <li key={`${c.direction}|${c.term}`}>
                        {c.direction}：一条要用「{c.term}」，另一条忌「{c.term}」。
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mb-2 px-1 text-[0.75rem] text-ink-mute">
                未标房间与家人，以下按宅论。存为房屋并标出主卧、大门、厨房后，行动会落到具体的房间与人。
              </p>
              <div className="space-y-2">
                {data.plan.mustAddress.slice(0, 12).map((a) => (
                  <ActionCard key={a.id} a={a} />
                ))}
              </div>
              {data.plan.enhancements.length > 0 && (
                <div className="mt-3">
                  <Expandable title={`催吉（另列，${data.plan.enhancements.length} 项）`}>
                    <div className="space-y-2">
                      {data.plan.enhancements.map((a) => (
                        <ActionCard key={a.id} a={a} />
                      ))}
                    </div>
                  </Expandable>
                </div>
              )}
            </section>

            {/* 推导与门派 */}
            <Expandable title="排盘推导">
              <ol className="list-decimal space-y-1 pl-4 text-[0.8125rem] leading-relaxed text-ink-soft">
                {[...data.result.flyingStar.derivation, ...(data.result.geju?.derivation ?? [])].map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            </Expandable>

            <Expandable title="门派设置">
              <div className="space-y-3">
                <SegRow
                  label="五入中借宫"
                  options={(['随运星', '寄坤', '寄艮'] as CenterFiveRule[]).map((v) => ({ value: v, label: v }))}
                  value={school.centerFiveRule}
                  onChange={(v) => setSchool({ centerFiveRule: v })}
                />
                <SegRow
                  label="星曜旺衰以何运论"
                  options={[
                    { value: '宅运' as const, label: '宅运（宅之元运）' },
                    { value: '时运' as const, label: '时运（当年元运）' },
                  ]}
                  value={school.phaseBasis}
                  onChange={(v) => setSchool({ phaseBasis: v })}
                />
                <SegRow
                  label="兼向起替阈值"
                  options={[2, 2.5, 3, 3.5, 4, 4.5].map((v) => ({ value: v, label: `${v}°` }))}
                  value={school.jianThreshold}
                  onChange={(v) => setSchool({ jianThreshold: v })}
                />
                <p className="text-[0.75rem] leading-relaxed text-ink-mute">
                  门派设置存在本机，所有房屋与报告共用。分宫法、单位立向、楼层五行将随勘察功能开放。
                </p>
              </div>
            </Expandable>

            <p className="px-1 text-[0.6875rem] leading-relaxed text-ink-mute">
              本盘门派：{describeSchool(school).join(' · ')}。
              {data.result.chartYear?.note}
            </p>

            <Link href="/new" className="btn btn-block">存为房屋，补房间与家人 →</Link>
          </>
        )}
      </div>

      <Sheet
        open={sel != null && data != null && !('error' in data)}
        onClose={() => setSel(null)}
        title={sel != null ? <p className="font-serif text-[1.0625rem] font-semibold">{PALACE_DIRECTION[sel]}</p> : null}
      >
        {sel != null && data && !('error' in data) && (
          <PalaceDetail p={sel} actions={data.plan.actions.filter((a) => a.where.palace === sel)} result={data.result} />
        )}
      </Sheet>
    </>
  );
}

function ActionCard({ a }: { a: Action }) {
  return (
    <div className="rounded-2xl border border-rice-line bg-white p-3">
      <div className="flex items-center gap-1.5 text-[0.6875rem]">
        <span className={`rounded-md px-1.5 py-0.5 font-medium ${PRIORITY_TONE[a.priority]}`}>{a.priority}</span>
        <span className="rounded-md border border-rice-line px-1.5 py-0.5 text-ink-soft">{a.tier}</span>
        <span className="text-ink-mute">{a.where.direction}{a.where.room ? ` · ${a.where.room}` : ''}</span>
        <span className="ml-auto text-ink-mute">{a.effort}</span>
      </div>
      <p className="mt-1.5 text-[0.875rem] leading-relaxed">{a.title}</p>
      <p className="mt-1 text-[0.75rem] text-ink-mute">⏱ {a.when.label}</p>
      {a.avoid.length > 0 && <p className="mt-0.5 text-[0.75rem] text-ink-mute">忌：{a.avoid.join('；')}</p>}
      <p className="mt-0.5 text-[0.75rem] text-ink-mute">因：{a.because.map((b) => b.summary).join('；')}</p>
    </div>
  );
}

function PalaceDetail({
  p,
  actions,
  result,
}: {
  p: PalaceIndex;
  actions: readonly Action[];
  result: ReturnType<typeof synthesise>;
}) {
  const a = result.palaces[p];
  return (
    <div className="space-y-3">
      <p className="text-[0.875rem] text-ink-soft">
        运{a.stars.yun} · 山{a.stars.shan} · 向{a.stars.xiang} · 年{a.stars.annual} — {a.combinationName}
        {a.baZhaiStar ? ` · 八宅${a.baZhaiStar}` : ''}
      </p>
      {a.findings.slice(0, 4).map((f, i) => (
        <div key={i} className="rounded-xl bg-rice-deep/40 p-2.5 text-[0.8125rem] leading-relaxed">
          <p>{f.statement}</p>
          <p className="mt-0.5 text-[0.75rem] text-ink-mute">
            {f.schools.join('、')} · 置信{f.confidence} · {f.principle}
          </p>
        </div>
      ))}
      {actions.length > 0 && (
        <div className="space-y-2">
          {actions.map((x) => (
            <ActionCard key={x.id} a={x} />
          ))}
        </div>
      )}
    </div>
  );
}
