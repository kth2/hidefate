'use client';

/**
 * 即时飞星 —— 以此刻时辰起紫白时盘，用手机罗盘定方位，指出财星在哪一方。
 *
 * 不需要建档、不需要房子坐向：只看「现在几点」与「你面向哪里」。
 * 时辰依据（钟表／真太阳时）与子时换日规则都可在页内切换，页面照实写出用了哪一种。
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  GRID_LAYOUT,
  PALACE_DIRECTION,
  STAR_NAME,
  almanacDirections,
  annualSha,
  degreeToMountain,
  natalDirections,
  palaceOfStar,
  timeChart,
  wenQuMarks,
  type DayChangeRule,
  type DirectionMark,
  type FuShenSect,
  type HourBasis,
  type PalaceIndex,
  type TimeChart,
} from '@hidefate/core-fengshui';
import { CompassRose } from '../../components/CompassRose';
import { AppBar, Expandable, SegRow } from '../../components/mobile/ui';
import { useCompass } from '../../lib/useCompass';

const PREF_KEY = 'hidefate.now.v1';

interface Prefs {
  hourBasis: HourBasis;
  dayChange: DayChangeRule;
  longitude: number | null;
  /** 罗盘上选看哪一方。 */
  target: string;
  fuSect: FuShenSect;
  /** 出生年（立春为界），只存本机，用于桃花、驿马、本命文昌。 */
  birthYear: number | null;
}

const DEFAULT_PREFS: Prefs = {
  hourBasis: '钟表时间',
  dayChange: '23点换日',
  longitude: null,
  target: '财星当旺',
  fuSect: '福神一',
  birthYear: null,
};

/** 罗盘可选看的一方。 */
interface Target {
  key: string;
  label: string;
  group: string;
  palace: PalaceIndex;
  direction: string;
  bearing: number | null;
  at: string;
  meaning: string;
}

const SOURCE_GROUP: Record<DirectionMark['source'], string> = {
  通书: '通书吉神',
  玄空: '玄空文昌',
  命理神煞: '命理神煞（按你的出生年）',
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* 隐私模式下存不了，仅本次有效 */
  }
}

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** 「已面向」的容差：命理神煞取的是地支（一山 15°，±7.5°），其余取一宫（45°，±22.5°）。 */
function facingTolerance(key: string): number {
  return ['本命文昌', '桃花', '驿马'].includes(key) ? 7.5 : 22.5;
}

/** 相对转角：正为向右（顺时针）。 */
function relTurn(target: number, heading: number): number {
  return ((target - heading + 540) % 360) - 180;
}

/** 时盘财星三颗。 */
const ROLE_TEXT: Record<string, string> = {
  当旺: '当令财星：当运旺气所在。求财、谈判、开张，传统上宜面向或坐于此方。',
  生气: '生气星：下一运的旺星，主进展、新机会，宜布局长远之事。',
  退气: '退气星：上一运的旺星。上一运它是财星，如今已退；各家对它是否仍可取财看法不一。',
};

export default function NowPage() {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [now, setNow] = useState<Date | null>(null);
  const [manual, setManual] = useState<number | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const compass = useCompass();

  useEffect(() => {
    setPrefsState(loadPrefs());
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  const setPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    savePrefs(next);
  };

  const opts = useMemo(
    () => ({ hourBasis: prefs.hourBasis, dayChange: prefs.dayChange, longitude: prefs.longitude ?? undefined }),
    [prefs],
  );
  // 分钟粒度重算即可
  const minuteKey = now ? Math.floor(now.getTime() / 60_000) : 0;
  const chart: TimeChart | null = useMemo(() => (now ? timeChart(now, opts) : null), [minuteKey, opts]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextChart: TimeChart | null = useMemo(
    () => (chart ? timeChart(new Date(chart.shiChen.end.getTime() + 60_000), opts) : null),
    [chart, opts],
  );
  // 钟表与真太阳时不在同一时辰时，提醒使用者
  const altChart: TimeChart | null = useMemo(() => {
    if (!now || prefs.longitude == null) return null;
    const other = prefs.hourBasis === '真太阳时' ? '钟表时间' : '真太阳时';
    return timeChart(now, { ...opts, hourBasis: other });
  }, [minuteKey, opts, prefs.longitude, prefs.hourBasis]); // eslint-disable-line react-hooks/exhaustive-deps

  const heading = compass.status === 'active' ? compass.heading : manual;

  const almanac = useMemo(
    () => (now ? almanacDirections(now, { ...opts, fuSect: prefs.fuSect }) : null),
    [minuteKey, opts, prefs.fuSect], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const natal = useMemo(() => (prefs.birthYear != null ? natalDirections(prefs.birthYear) : null), [prefs.birthYear]);
  const wenQu = useMemo(() => (chart ? wenQuMarks(chart.year.plate, chart.month.plate) : []), [chart]);
  const sha = useMemo(() => (chart ? annualSha(chart.year.fengShuiYear) : null), [chart]);

  const targets: Target[] = useMemo(() => {
    if (!chart || !almanac) return [];
    const fromMark = (m: DirectionMark): Target => ({ ...m, group: SOURCE_GROUP[m.source] });
    return [
      ...chart.wealth.map((w) => ({
        key: `财星${w.role}`,
        label: `时盘财星·${w.role}`,
        group: '时盘财星（紫白时星 × 玄空旺衰）',
        palace: w.palace,
        direction: w.direction,
        bearing: w.bearing,
        at: STAR_NAME[w.star],
        meaning: ROLE_TEXT[w.role]!,
      })),
      ...almanac.day.map(fromMark),
      ...almanac.hour.map(fromMark),
      ...wenQu.map(fromMark),
      ...(natal ? natal.marks.map(fromMark) : []),
    ];
  }, [chart, almanac, wenQu, natal]);
  const target = targets.find((t) => t.key === prefs.target) ?? targets[0] ?? null;
  const showWealth = target?.key.startsWith('财星') ?? true;
  const groups = [...new Set(targets.map((t) => t.group))];

  function locate() {
    if (!('geolocation' in navigator)) {
      setLocMsg('此浏览器不提供定位，请手动填经度。');
      return;
    }
    setLocMsg('正在取得位置……');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPrefs({ longitude: Math.round(pos.coords.longitude * 100) / 100, hourBasis: '真太阳时' });
        setLocMsg(`已取得经度 ${pos.coords.longitude.toFixed(2)}°（只存在本机，用于真太阳时）。`);
      },
      () => setLocMsg('未能取得位置；可手动填经度，例如吉隆坡 101.69。'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 },
    );
  }

  if (!chart || !now) {
    return (
      <>
        <AppBar title="即时飞星" back="/" />
        <div className="px-4 py-6 text-[0.875rem] text-ink-mute">正在起盘……</div>
      </>
    );
  }

  const sc = chart.shiChen;
  const minsLeft = Math.max(0, Math.round((sc.end.getTime() - now.getTime()) / 60_000));

  return (
    <>
      <AppBar title="即时飞星" subtitle="此刻时辰起盘 · 手机罗盘定方位" back="/" />

      <div className="space-y-4 px-4 py-4 pb-tab">
        {/* 此刻 */}
        <section className="card">
          <div className="flex items-baseline justify-between">
            <p className="font-serif text-[1.375rem] font-bold">
              {sc.zhi}时
              <span className="ml-2 text-[0.875rem] font-normal text-ink-mute">
                {hm(sc.start)}–{hm(sc.end)} · 还有 {minsLeft} 分钟
              </span>
            </p>
            <span className="text-[0.75rem] text-ink-mute">{hm(now)}</span>
          </div>
          <p className="mt-1 text-[0.8125rem] text-ink-soft">
            {chart.yang ? '阳遁' : '阴遁'} · {chart.dayZhi}日 · 时星{STAR_NAME[chart.hour.star]}入中 · 依{sc.basisUsed}
          </p>
          {altChart && altChart.shiChen.zhi !== sc.zhi && (
            <p className="mt-1.5 rounded-lg bg-risk-warn/10 px-2 py-1 text-[0.75rem] text-ink-soft">
              注意：按{altChart.shiChen.basisUsed}此刻是{altChart.shiChen.zhi}时，财星在
              {altChart.wealth.find((w) => w.role === '当旺')!.direction}。两种算法各有所宗，请依你的门派取用。
            </p>
          )}
        </section>

        {/* 罗盘 */}
        <section className="card">
          <CompassRose
            heading={heading}
            plate={chart.hour.plate}
            wealth={chart.wealth}
            centerStar={chart.hour.star}
            showWealth={showWealth}
            target={target ? { palace: target.palace, bearing: target.bearing, label: target.label } : null}
          />

          {target && (
            <div className="mt-2 text-center">
              {target.bearing == null ? (
                <p className="font-serif text-[1.0625rem] font-semibold">{target.label}入中宫：宜守本位，不必往外求方。</p>
              ) : heading == null ? (
                <p className="font-serif text-[1.0625rem] font-semibold">
                  {target.label}在<span className="text-cinnabar">{target.direction}</span>（{target.at}，{target.bearing}°）
                </p>
              ) : Math.abs(relTurn(target.bearing, heading)) <= facingTolerance(target.key) ? (
                <p className="font-serif text-[1.125rem] font-bold text-cinnabar">
                  你正面向{target.label}：{target.direction}
                </p>
              ) : (
                <p className="font-serif text-[1.0625rem] font-semibold">
                  {target.label}在<span className="text-cinnabar">{target.direction}</span>：请
                  {relTurn(target.bearing, heading) > 0 ? '向右' : '向左'}转约 {Math.round(Math.abs(relTurn(target.bearing, heading)))}°
                </p>
              )}
              {heading != null && (
                <p className="mt-0.5 text-[0.75rem] text-ink-mute">
                  手机所指 {Math.round(heading)}°（{degreeToMountain(heading).name}山）
                  {compass.status === 'active' && compass.spread != null && ` · 读数摆动 ±${Math.max(1, Math.round(compass.spread))}°`}
                  {compass.status === 'active' && compass.accuracy != null && ` · 精度 ±${Math.round(compass.accuracy)}°`}
                </p>
              )}
            </div>
          )}

          {/* 选看哪一方 */}
          <div className="mt-3 space-y-2">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-[0.6875rem] text-ink-mute">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {targets
                    .filter((t) => t.group === g)
                    .map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setPrefs({ target: t.key })}
                        className={`rounded-full border px-2.5 py-1 text-[0.75rem] ${
                          target?.key === t.key ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white text-ink-soft'
                        }`}
                      >
                        {t.label.replace(/^时盘财星·/, '')} · {t.direction}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {!natal && (
              <p className="text-[0.6875rem] text-ink-mute">在下方「个人方位」填出生年，可加看桃花、驿马、本命文昌。</p>
            )}
            {target && <p className="text-[0.75rem] leading-relaxed text-ink-soft">{target.meaning}</p>}
          </div>

          {/* 罗盘状态 */}
          <div className="mt-3 text-[0.8125rem] leading-relaxed">
            {compass.status === 'needs-permission' && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => void compass.start()}>
                启用手机罗盘
              </button>
            )}
            {compass.status === 'denied' && <p className="text-cinnabar">罗盘权限被拒绝。可到系统设置允许「动作与方向」，或用下方拨盘手动对准。</p>}
            {compass.status === 'insecure' && <p className="text-cinnabar">罗盘只能在 https 网址下使用。</p>}
            {(compass.status === 'unsupported' || compass.status === 'denied' || compass.status === 'insecure') && (
              <div className="mt-2">
                <p className="text-ink-mute">此设备读不到罗盘。拖动拨盘，手动输入你面向的度数：</p>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={manual ?? 0}
                  onChange={(e) => setManual(Number(e.target.value))}
                  className="mt-1 w-full accent-[#a8352a]"
                  aria-label="手动方位角"
                />
              </div>
            )}
            {compass.status === 'active' && compass.spread != null && compass.spread > 8 && (
              <p className="mt-1 text-risk-warn">读数不稳：请远离金属与电器，把手机拿平，或在空中画「8」字校准。</p>
            )}
          </div>
        </section>

        {/* 财星三方 */}
        <section>
          <h2 className="section-title">此时辰的财星</h2>
          <div className="space-y-2">
            {chart.wealth.map((w) => (
              <div key={w.role} className="card !p-3">
                <p className="text-[0.9375rem] font-semibold">
                  {STAR_NAME[w.star]} · {w.role}
                  <span className="ml-2 font-normal text-ink-soft">
                    {w.direction}
                    {w.bearing != null ? `（${w.bearing}°）` : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-mute">{ROLE_TEXT[w.role]}</p>
              </div>
            ))}
          </div>
          {nextChart && (
            <p className="mt-2 px-1 text-[0.75rem] text-ink-mute">
              {hm(sc.end)} 起转入{nextChart.shiChen.zhi}时，当令财星移到
              {nextChart.wealth.find((w) => w.role === '当旺')!.direction}。
            </p>
          )}
        </section>

        {/* 通书吉神 */}
        {almanac && (
          <section>
            <h2 className="section-title">今日 · 此时 通书吉神方位</h2>
            <div className="card !p-0 overflow-hidden">
              <table className="w-full text-[0.8125rem]">
                <thead className="bg-rice-deep/40 text-[0.6875rem] text-ink-mute">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-normal"></th>
                    <th className="px-3 py-1.5 text-left font-normal">今日（{almanac.dayGan}{almanac.dayZhi}日）</th>
                    <th className="px-3 py-1.5 text-left font-normal">此时（{almanac.hourGan}{almanac.hourZhi}时）</th>
                  </tr>
                </thead>
                <tbody>
                  {(['喜神', '财神', '福神', '阳贵', '阴贵'] as const).map((k) => {
                    const d = almanac.day.find((m) => m.key === `日${k}`)!;
                    const h = almanac.hour.find((m) => m.key === `时${k}`)!;
                    return (
                      <tr key={k} className="border-t border-rice-line">
                        <td className="px-3 py-1.5 text-ink-mute">{k === '阳贵' ? '阳贵人' : k === '阴贵' ? '阴贵人' : k}</td>
                        <td className="px-3 py-1.5">{d.direction}（{d.at}）</td>
                        <td className="px-3 py-1.5">{h.direction}（{h.at}）</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 px-1 text-[0.6875rem] leading-relaxed text-ink-mute">
              按日干、时干查通书。福神现用「{prefs.fuSect}」排法（两种流传排法，可在下方切换）。阳贵人多用于白天，阴贵人多用于夜间。
            </p>
          </section>
        )}

        {/* 宜静之方 */}
        {sha && (
          <section>
            <h2 className="section-title">宜静之方</h2>
            <div className="card !p-3 space-y-1 text-[0.8125rem] leading-relaxed">
              <p>
                <b>此时辰</b>：时星五黄到{PALACE_DIRECTION[palaceOfStar(chart.hour.plate, 5)]}，二黑到
                {PALACE_DIRECTION[palaceOfStar(chart.hour.plate, 2)]}，此刻这两处不宜动工、敲打。
              </p>
              <p>
                <b>{sha.year} 年</b>：五黄到{PALACE_DIRECTION[sha.wuHuang]}，二黑到{PALACE_DIRECTION[sha.erHei]}；
                太岁在{sha.zhi}（{PALACE_DIRECTION[sha.taiSui.palaces[0]!]}），岁破在{PALACE_DIRECTION[sha.suiPo.palaces[0]!]}，
                三煞在{sha.sanSha.mountains.map((m) => m.name).join('')}（{sha.sanSha.range[0]}°–{sha.sanSha.range[1]}°）。今年这些方位勿动土、勿大装修。
              </p>
            </div>
          </section>
        )}

        {/* 四层九宫 */}
        <section>
          <h2 className="section-title">年 · 月 · 日 · 时 四层紫白</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {GRID_LAYOUT.map((p) => {
              const role = chart.wealth.find((w) => w.palace === p)?.role;
              return (
                <div
                  key={p}
                  className={`rounded-xl border p-2 text-center ${role === '当旺' ? 'border-gold bg-gold/10' : 'border-rice-line bg-white'}`}
                >
                  <p className="text-[0.6875rem] text-ink-mute">{PALACE_DIRECTION[p]}</p>
                  <p className="font-serif text-[1.5rem] font-bold leading-tight">{chart.hour.plate[p]}</p>
                  <p className="text-[0.625rem] text-ink-mute">
                    日{chart.day.plate[p]} 月{chart.month.plate[p]} 年{chart.year.plate[p]}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[0.6875rem] text-ink-mute">上为正北。大字为时星，小字为日、月、年星。</p>
        </section>

        {/* 设置 */}
        <Expandable title="时辰依据与子时换日">
          <div className="space-y-3">
            <SegRow
              label="时辰依据"
              options={[
                { value: '钟表时间' as const, label: '钟表时间' },
                { value: '真太阳时' as const, label: '真太阳时' },
              ]}
              value={prefs.hourBasis}
              onChange={(v) => setPrefs({ hourBasis: v })}
            />
            {prefs.hourBasis === '真太阳时' && (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    className="field"
                    inputMode="decimal"
                    placeholder="经度，如 101.69"
                    value={prefs.longitude ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setPrefs({ longitude: v === '' || Number.isNaN(Number(v)) ? null : Number(v) });
                    }}
                  />
                  <button type="button" className="btn btn-sm shrink-0" onClick={locate}>
                    取得位置
                  </button>
                </div>
                {locMsg && <p className="text-[0.75rem] text-ink-mute">{locMsg}</p>}
                <p className="text-[0.75rem] text-ink-mute">
                  马来西亚用 UTC+8，但吉隆坡在东经约 101.7°，钟表比真太阳时快约一小时十分钟，常差一个时辰。
                </p>
              </div>
            )}
            <SegRow
              label="子时换日"
              options={[
                { value: '23点换日' as const, label: '23 点（子初）' },
                { value: '0点换日' as const, label: '0 点' },
              ]}
              value={prefs.dayChange}
              onChange={(v) => setPrefs({ dayChange: v })}
            />
          </div>
        </Expandable>

        <Expandable title="个人方位与福神排法">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="by">出生年（立春为界；立春前出生请填前一年）</label>
              <input
                id="by"
                className="field"
                inputMode="numeric"
                placeholder="例如 1988"
                value={prefs.birthYear ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = Number(v);
                  setPrefs({ birthYear: v === '' || !Number.isInteger(n) || n < 1900 || n > 2100 ? null : n });
                }}
              />
              <p className="mt-1 text-[0.75rem] text-ink-mute">
                {natal
                  ? `${natal.gan}${natal.zhi}年：本命文昌在${natal.marks[0]!.at}、桃花在${natal.marks[1]!.at}、驿马在${natal.marks[2]!.at}。只存在本机。`
                  : '只存在本机，不会上传。用于桃花（咸池）、驿马、本命文昌三方。'}
              </p>
            </div>
            <SegRow
              label="福神排法"
              options={[
                { value: '福神一' as const, label: '排法一' },
                { value: '福神二' as const, label: '排法二' },
              ]}
              value={prefs.fuSect}
              onChange={(v) => setPrefs({ fuSect: v })}
            />
            <p className="text-[0.75rem] text-ink-mute">
              福神方位通书有两种流传排法：排法一甲乙在巽、丙丁在震；排法二甲在坎、乙在坤。两说并存，依你所宗取用。
            </p>
          </div>
        </Expandable>

        <Expandable title="本盘取法与限制">
          <ul className="list-disc space-y-1 pl-4 text-[0.75rem] leading-relaxed text-ink-soft">
            {chart.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>时星起例依「天一九，地四六，人七三；一四七为阳顺，三六九为阴逆」。与 lunar-typescript 历法库逐时对拍两年，只在冬至、夏至当天有差（交节时刻与交节当日之别）。</li>
            <li>日星另有「冬至、夏至最近甲子起」一法，与本 App 所用「节气后首个甲子起」约七成日子不同；日星只作参考层。</li>
            <li>手机罗盘读的是磁北，易受钢筋、电器、磁吸手机壳干扰；要紧的事以传统罗盘复核。</li>
            <li>出处各不相同，分开标示：「时盘财星」是把择日一系的时家紫白，借玄空按元运论旺、生、退，属现代流行的混合用法，古籍没有现成原文；古法时家紫白多用于择日，以一白、六白、八白、九紫为吉。</li>
            <li>喜神、财神、福神、贵人方位依通书按日干、时干查表（时干由五鼠遁推出），与 lunar-typescript 历法库逐日、逐时对拍一致。</li>
            <li>流年、流月文昌取年星、月星四绿文曲所到之宫，属玄空用法。</li>
            <li>桃花（咸池）、驿马、本命文昌原是八字神煞，近代才借来论方位；此处只按出生年干支取，另有以日支论者。</li>
            <li>这是传统择时取象，不是投资或理财建议。</li>
          </ul>
        </Expandable>

        <Link href="/quick" className="btn btn-block">
          要看房子本身的飞星盘？去十秒起盘 →
        </Link>
      </div>
    </>
  );
}
