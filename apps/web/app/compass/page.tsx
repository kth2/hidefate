'use client';

/**
 * 罗盘起盘 —— 把手机当罗盘：对着屋向一转，二十四山与玄空宅盘即时跟着变。
 *
 * 量法：手机平放，顶端指向门外（或阳台、主窗）即「量向首」；背靠后墙、顶端指屋内即「量坐山」。
 * 读数稳定后点「记录读数」，可在不同位置连记几次，取平均锁定；记录之间相差太大或跨山会提醒。
 * 锁定后一键带去「十秒起盘」出全盘与行动卡。
 *
 * 盘是本 App 的玄空引擎排的（下卦／替卦依兼向阈值，五入中依门派设置），页面照实写出用了哪套。
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PALACE_DIRECTION,
  STAR_NAME,
  analyzeLine,
  buildFlyingStarChart,
  degreeToMountain,
  describeSchool,
  fengShuiYearOf,
  periodOfYear,
  type PalaceIndex,
} from '@hidefate/core-fengshui';
import { MountainRing } from '../../components/MountainRing';
import { AppBar, Expandable, SegRow } from '../../components/mobile/ui';
import { useSchool } from '../../lib/schoolStore';
import { circularStats, useCompass } from '../../lib/useCompass';

type Measure = '向首' | '坐山';
type GridTop = '上南' | '上北';

const PREF_KEY = 'hidefate.compass.v1';
interface Prefs {
  measure: Measure;
  gridTop: GridTop;
}
const DEFAULT_PREFS: Prefs = { measure: '向首', gridTop: '上南' };

/** 上南（罗盘、古籍习惯）与上北（地图习惯）两种九宫排布。 */
const LAYOUT: Record<GridTop, readonly PalaceIndex[]> = {
  上南: [4, 9, 2, 3, 5, 7, 8, 1, 6],
  上北: [6, 1, 8, 7, 5, 3, 2, 9, 4],
};

const MAX_READINGS = 5;

const norm = (d: number) => ((d % 360) + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* 隐私模式或存储被禁：用默认 */
  }
  return DEFAULT_PREFS;
}

export default function CompassChartPage() {
  const compass = useCompass();
  const [school] = useSchool();
  const nowYear = fengShuiYearOf(new Date());

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => setPrefs(loadPrefs()), []);
  const updatePrefs = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* 忽略 */
      }
      return next;
    });

  const [yearMode, setYearMode] = useState<'今年' | '自定'>('今年');
  const [yearText, setYearText] = useState(String(nowYear));
  const customYear = Number(yearText);
  const yearOk = Number.isInteger(customYear) && customYear >= 1864 && customYear <= 2200;
  const chartYear = yearMode === '今年' ? nowYear : yearOk ? customYear : nowYear;

  const [manual, setManual] = useState(0);
  const sensorLive = compass.status === 'active' && compass.heading != null;
  const [useManual, setUseManual] = useState(false);
  const liveHeading = sensorLive && !useManual ? compass.heading! : manual;

  /** 记录下的是「坐山度数」，与量法无关，切换量法不会让旧记录失效。 */
  const [readings, setReadings] = useState<number[]>([]);
  const toSitting = (h: number) => (prefs.measure === '向首' ? norm(h + 180) : norm(h));
  const locked = readings.length > 0;
  const lockedStats = locked ? circularStats(readings) : null;
  const sittingDeg = Math.round((locked ? lockedStats!.mean : toSitting(liveHeading)) * 10) / 10;
  // 盘面显示：锁定后仍随手机转，方便对照实景；红针下方即手机所指
  const ringHeading = sensorLive && !useManual ? compass.heading : manual;

  const line = useMemo(() => analyzeLine(sittingDeg, school.jianThreshold), [sittingDeg, school.jianThreshold]);
  const chart = useMemo(
    () =>
      buildFlyingStarChart({
        sitting: sittingDeg,
        moveInYear: chartYear,
        centerFiveRule: school.centerFiveRule,
        jianThreshold: school.jianThreshold,
      }),
    [sittingDeg, chartYear, school.centerFiveRule, school.jianThreshold],
  );
  const period = chart.period.period;
  const sitM = chart.sitting.mountain;
  const facM = chart.facing.mountain;

  // 换山时轻震一下（Android 支持；iOS 浏览器无此接口，静默略过）
  const lastMountain = useRef<string | null>(null);
  useEffect(() => {
    if (locked) return;
    if (lastMountain.current && lastMountain.current !== sitM.name) {
      try {
        navigator.vibrate?.(12);
      } catch {
        /* 忽略 */
      }
    }
    lastMountain.current = sitM.name;
  }, [sitM.name, locked]);

  // 量度时保持屏幕常亮
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  const record = () => setReadings((r) => (r.length >= MAX_READINGS ? r : [...r, Math.round(toSitting(liveHeading) * 10) / 10]));
  const readingMountains = new Set(readings.map((r) => degreeToMountain(r).name));
  const readingRange = readings.length > 1 ? Math.max(...readings.map((r) => angDiff(r, lockedStats!.mean))) * 2 : 0;

  const unstable = sensorLive && !useManual && compass.spread != null && compass.spread > 4;
  const gradeTone =
    line.grade === '下卦'
      ? 'border-jade/40 bg-jade/5 text-jade'
      : line.grade === '兼向'
        ? 'border-gold/50 bg-gold/10 text-ink'
        : 'border-cinnabar/40 bg-cinnabar/5 text-cinnabar';

  return (
    <>
      <AppBar title="罗盘起盘" subtitle="手机当罗盘，宅盘随转随出" back="/" />

      <div className="space-y-4 px-4 py-4 pb-tab">
        {/* 罗盘 */}
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="font-serif text-[1.25rem] font-bold">{chart.period.label.replace(/（.*$/, '')}</p>
            <p className="text-[0.75rem] text-ink-mute">
              {chart.period.startYear}–{chart.period.endYear} · 按 {chartYear} 年立盘
            </p>
          </div>

          <MountainRing
            heading={ringHeading}
            sittingName={sitM.name}
            facingName={facM.name}
            centerTop={`${(prefs.measure === '向首' ? norm(sittingDeg + 180) : sittingDeg).toFixed(0)}°`}
            centerBottom={locked ? `已锁定 · ${prefs.measure === '向首' ? '向' : '坐'}（${readings.length} 次平均）` : prefs.measure === '向首' ? '手机所指 = 向' : '手机所指 = 坐'}
            locked={locked}
          />

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            <div className="rounded-xl border border-rice-line bg-white py-2">
              <p className="text-[0.6875rem] text-ink-mute">坐山</p>
              <p className="font-serif text-[1.5rem] font-bold">{sitM.name}</p>
              <p className="text-[0.6875rem] text-ink-mute">{chart.sitting.degree.toFixed(1)}°</p>
            </div>
            <p className="font-serif text-cinnabar">山 — 向</p>
            <div className="rounded-xl border border-cinnabar/40 bg-cinnabar/5 py-2">
              <p className="text-[0.6875rem] text-ink-mute">朝向</p>
              <p className="font-serif text-[1.5rem] font-bold text-cinnabar">{facM.name}</p>
              <p className="text-[0.6875rem] text-ink-mute">{chart.facing.degree.toFixed(1)}°</p>
            </div>
          </div>

          <div className={`rounded-xl border px-3 py-2 text-[0.8125rem] leading-relaxed ${gradeTone}`}>
            <p className="font-semibold">
              {line.label}
              {chart.usedTiXing ? ' · 本盘已起替卦' : ' · 本盘用下卦'}
            </p>
            <p className="mt-0.5 text-ink-soft">{line.advice}</p>
          </div>

          {/* 传感器状态 */}
          {compass.status === 'needs-permission' && (
            <button className="btn btn-primary btn-block" onClick={() => void compass.start()}>
              启用手机罗盘
            </button>
          )}
          {compass.status === 'denied' && <p className="text-[0.8125rem] text-cinnabar">罗盘权限被拒，可在浏览器设置里重新允许「动作与方向」，或用下方拨盘手动输入。</p>}
          {compass.status === 'insecure' && <p className="text-[0.8125rem] text-cinnabar">须以 https 打开才能读罗盘。现在可用下方拨盘手动输入。</p>}
          {compass.status === 'unsupported' && <p className="text-[0.8125rem] text-ink-mute">此设备读不到罗盘，用下方拨盘输入度数。</p>}
          {sensorLive && (
            <p className="text-center text-[0.75rem] text-ink-mute">
              读数摆动 ±{Math.round(compass.spread ?? 0)}°
              {compass.accuracy != null && ` · 系统精度 ±${Math.round(compass.accuracy)}°`}
              {unstable && <span className="text-cinnabar"> · 摆动偏大：远离钢筋、电器、磁吸手机壳，手机画 8 字校准后再量</span>}
            </p>
          )}

          {(useManual || !sensorLive) && (
            <div>
              <label className="label" htmlFor="manual">
                手动方位：{manual.toFixed(1)}°（{prefs.measure === '向首' ? '向' : '坐'}）
              </label>
              <input
                id="manual"
                type="range"
                min={0}
                max={359.5}
                step={0.5}
                value={manual}
                onChange={(e) => setManual(Number(e.target.value))}
                className="w-full accent-cinnabar"
              />
            </div>
          )}
          {sensorLive && (
            <button className="btn btn-sm w-full" onClick={() => setUseManual((v) => !v)}>
              {useManual ? '改回手机罗盘' : '改用手动拨盘'}
            </button>
          )}

          <SegRow
            label="手机顶端指的是"
            options={[
              { value: '向首' as const, label: '向首（门外、阳台）' },
              { value: '坐山' as const, label: '坐山（屋后）' },
            ]}
            value={prefs.measure}
            onChange={(v) => updatePrefs({ measure: v })}
          />

          {/* 记录与锁定 */}
          <div className="rounded-xl border border-rice-line bg-rice-deep/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[0.875rem] font-semibold">向首记录</p>
              <p className="text-[0.75rem] text-ink-mute">
                {readings.length}/{MAX_READINGS}
              </p>
            </div>
            <p className="mt-0.5 text-[0.75rem] text-ink-mute">
              在门口、阳台、窗边各量一次更稳。有记录即锁定，盘按各次平均排。
            </p>
            {readings.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5 text-[0.75rem]">
                {readings.map((r, i) => (
                  <li key={i} className="rounded-full border border-rice-line bg-white px-2 py-0.5">
                    坐 {r.toFixed(1)}° {degreeToMountain(r).name}
                  </li>
                ))}
              </ul>
            )}
            {readings.length > 1 && (readingRange > 3 || readingMountains.size > 1) && (
              <p className="mt-2 text-[0.75rem] text-cinnabar">
                {readingMountains.size > 1
                  ? `几次读数落在不同的山（${[...readingMountains].join('、')}），坐向未定，请用罗盘复核。`
                  : `几次读数相差约 ${readingRange.toFixed(1)}°，超过兼向阈值，宜复核。`}
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="btn btn-primary btn-sm" onClick={record} disabled={readings.length >= MAX_READINGS}>
                记录此次读数
              </button>
              <button className="btn btn-sm" onClick={() => setReadings([])} disabled={readings.length === 0}>
                清除，回到实时
              </button>
            </div>
          </div>
        </section>

        {/* 即时宅盘 */}
        <section className="card space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="font-serif text-[1rem] font-semibold">
              {sitM.name}山{facM.name}向 · {chart.usedTiXing ? '替卦' : '下卦'}
            </p>
            <p className="text-[0.75rem] text-ink-mute">{chart.pattern}</p>
          </div>
          <p className="text-[0.6875rem] text-ink-mute">左上山星 · 右上向星 · 中间运星 · 金框为当运旺星</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LAYOUT[prefs.gridTop].map((p) => {
              const s = chart.palaces[p];
              const isFacing = p === facM.palace;
              const isSitting = p === sitM.palace;
              return (
                <div
                  key={p}
                  className={`relative rounded-xl border px-2 pb-1.5 pt-1 ${p === 5 ? 'bg-rice-deep/50' : 'bg-white'} ${
                    isFacing ? 'border-cinnabar' : isSitting ? 'border-ink' : 'border-rice-line'
                  }`}
                >
                  <div className="flex justify-between font-serif text-[1.25rem] font-bold leading-none">
                    <span className={s.shan === period ? 'rounded px-0.5 ring-2 ring-gold' : ''}>{s.shan}</span>
                    <span className={`text-cinnabar ${s.xiang === period ? 'rounded px-0.5 ring-2 ring-gold' : ''}`}>{s.xiang}</span>
                  </div>
                  <p className="text-center font-serif text-[1.75rem] font-bold leading-tight">{STAR_NAME[s.yun][0]}</p>
                  <p className="text-center text-[0.625rem] text-ink-mute">
                    {PALACE_DIRECTION[p]}
                    {isFacing ? ' · 向' : isSitting ? ' · 坐' : ''}
                  </p>
                </div>
              );
            })}
          </div>
          <SegRow
            label="盘面排法"
            options={[
              { value: '上南' as const, label: '上南（罗盘习惯）' },
              { value: '上北' as const, label: '上北（地图习惯）' },
            ]}
            value={prefs.gridTop}
            onChange={(v) => updatePrefs({ gridTop: v })}
          />
        </section>

        {/* 立盘年份 */}
        <section className="card space-y-2">
          <SegRow
            label="宅运按哪年立盘"
            options={[
              { value: '今年' as const, label: `今年试算（${nowYear}）` },
              { value: '自定' as const, label: '入住／建成／换天心年' },
            ]}
            value={yearMode}
            onChange={setYearMode}
          />
          {yearMode === '自定' && (
            <input className="field" inputMode="numeric" value={yearText} onChange={(e) => setYearText(e.target.value)} aria-label="立盘年份" />
          )}
          <p className="text-[0.75rem] text-ink-mute">
            {yearMode === '今年'
              ? `按 ${nowYear} 年立盘只是试算，不代表此宅自动换运。旧宅宜填入住、建成或大装修年。`
              : yearOk
                ? `立盘于${periodOfYear(customYear).label}（立春为界）。`
                : '请输入 1864–2200 之间的年份。'}
          </p>
        </section>

        {locked ? (
          <Link
            href={`/quick?deg=${sittingDeg.toFixed(1)}&year=${chartYear}`}
            className="btn btn-primary btn-block text-center"
          >
            用此坐向（坐 {sittingDeg.toFixed(1)}°）完整起盘 →
          </Link>
        ) : (
          <p className="px-1 text-center text-[0.75rem] text-ink-mute">记录至少一次读数后，可带去「十秒起盘」看格局、煞方与行动卡。</p>
        )}

        <Expandable title="量法与限制">
          <ul className="list-disc space-y-1.5 pl-5 text-[0.8125rem] leading-relaxed text-ink-soft">
            <li>手机平放、离身体一臂，顶端对准门外或阳台正中；屋向以纳气口为准，大楼与单元不一时按门派设置取。</li>
            <li>手机读的是磁北，与传统罗盘相同；但钢筋、电梯、电器、磁吸壳都会令读数偏几度到几十度。每山只有 15°，兼向只差 3°，要紧的事务必以罗盘复核。</li>
            <li>读数摆动大时先拿手机在空中画几次「8」字让系统校准，再到离墙一两米处重量。</li>
            <li>本盘：{chart.usedTiXing ? '偏离中线超过兼向阈值，起替卦' : '下卦正向'}；兼向阈值 {school.jianThreshold}°；五入中「{school.centerFiveRule}」。门派可在「十秒起盘」页改，两页共用同一套设置。</li>
            <li>本次门派：{describeSchool(school).join('；')}。</li>
          </ul>
        </Expandable>
      </div>
    </>
  );
}
