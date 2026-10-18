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
  degreeToMountain,
  timeChart,
  type DayChangeRule,
  type HourBasis,
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
}

const DEFAULT_PREFS: Prefs = { hourBasis: '钟表时间', dayChange: '23点换日', longitude: null };

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

/** 相对转角：正为向右（顺时针）。 */
function relTurn(target: number, heading: number): number {
  return ((target - heading + 540) % 360) - 180;
}

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
  const main = chart?.wealth.find((w) => w.role === '当旺') ?? null;

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
          <CompassRose heading={heading} plate={chart.hour.plate} wealth={chart.wealth} centerStar={chart.hour.star} />

          {main && (
            <div className="mt-2 text-center">
              {main.bearing == null ? (
                <p className="font-serif text-[1.0625rem] font-semibold">此时财星入中宫：宜守本位，不必往外求方。</p>
              ) : heading == null ? (
                <p className="font-serif text-[1.0625rem] font-semibold">
                  此时财星在<span className="text-gold">{main.direction}</span>（{main.bearing}°）
                </p>
              ) : Math.abs(relTurn(main.bearing, heading)) <= 22.5 ? (
                <p className="font-serif text-[1.125rem] font-bold text-gold">你正面向财星方位：{main.direction}</p>
              ) : (
                <p className="font-serif text-[1.0625rem] font-semibold">
                  财星在<span className="text-gold">{main.direction}</span>：请
                  {relTurn(main.bearing, heading) > 0 ? '向右' : '向左'}转约 {Math.round(Math.abs(relTurn(main.bearing, heading)))}°
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

        <Expandable title="本盘取法与限制">
          <ul className="list-disc space-y-1 pl-4 text-[0.75rem] leading-relaxed text-ink-soft">
            {chart.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>时星起例依「天一九，地四六，人七三；一四七为阳顺，三六九为阴逆」。与 lunar-typescript 历法库逐时对拍两年，只在冬至、夏至当天有差（交节时刻与交节当日之别）。</li>
            <li>日星另有「冬至、夏至最近甲子起」一法，与本 App 所用「节气后首个甲子起」约七成日子不同；日星只作参考层。</li>
            <li>手机罗盘读的是磁北，易受钢筋、电器、磁吸手机壳干扰；要紧的事以传统罗盘复核。</li>
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
