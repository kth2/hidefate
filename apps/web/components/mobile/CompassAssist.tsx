'use client';

/**
 * 手机罗盘与八方近似 —— 手打度数之外的两条路。
 *
 * 权限这一层是重点：iOS 13 起 DeviceOrientation 必须由用户手势触发
 * `requestPermission()`，而且拒绝之后**不会再问第二次**。所以被拒不能只是
 * 报个错了事，必须当场给出还能走的路（八方近似 / 手输度数），
 * 否则用户就卡死在这一步了。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EIGHT_DIRECTIONS, headingFrom, nearMountainBoundary, type EightDirection } from '../../lib/compass';
import { degreeToMountain } from '@hidefate/core-fengshui';

type CompassStatus = 'idle' | 'unsupported' | 'asking' | 'denied' | 'reading' | 'no-signal';

interface CompassHandle {
  readonly status: CompassStatus;
  readonly heading: number | null;
  readonly trustworthy: boolean;
  readonly note: string;
  readonly start: () => void;
  readonly stop: () => void;
}

function useCompass(): CompassHandle {
  const [status, setStatus] = useState<CompassStatus>('idle');
  const [heading, setHeading] = useState<number | null>(null);
  const [trustworthy, setTrustworthy] = useState(false);
  const [note, setNote] = useState('');
  const handlerRef = useRef<((e: Event) => void) | null>(null);

  const stop = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('deviceorientationabsolute', handlerRef.current);
      window.removeEventListener('deviceorientation', handlerRef.current);
      handlerRef.current = null;
    }
    setStatus('idle');
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      setStatus('unsupported');
      setNote('这台设备或浏览器没有提供方向传感器。');
      return;
    }

    const attach = () => {
      let got = false;
      const handler = (raw: Event) => {
        const r = headingFrom(raw as unknown as Parameters<typeof headingFrom>[0]);
        if (!r) return;
        got = true;
        setHeading(r.heading);
        setTrustworthy(r.trustworthy);
        setNote(r.note);
        setStatus('reading');
      };
      handlerRef.current = handler;
      // absolute 事件才对准真北；两个都挂，谁先给数用谁
      window.addEventListener('deviceorientationabsolute', handler);
      window.addEventListener('deviceorientation', handler);
      setStatus('reading');
      // 传感器存在但一直不发数（桌面浏览器常见），2 秒后如实说明
      window.setTimeout(() => {
        if (!got) {
          setStatus('no-signal');
          setNote('传感器没有回传数据 —— 台式机与多数笔电没有磁力计。');
        }
      }, 2000);
    };

    const anyEvent = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof anyEvent.requestPermission === 'function') {
      setStatus('asking');
      anyEvent
        .requestPermission()
        .then((res) => {
          if (res === 'granted') attach();
          else {
            setStatus('denied');
            setNote('你拒绝了方向传感器权限。iOS 通常不会再次询问，需到「设置 → Safari → 动作与方向」里重新允许。');
          }
        })
        .catch(() => {
          setStatus('denied');
          setNote('无法取得方向传感器权限。');
        });
    } else {
      attach();
    }
  }, []);

  return { status, heading, trustworthy, note, start, stop };
}

/** 八方图示按钮 —— 圆内一支指向该方位的箭头，不必识字也认得出。 */
function DirectionGlyph({ arrow, active }: { arrow: number; active: boolean }) {
  const stroke = active ? '#ffffff' : '#a8352a';
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="none" stroke={active ? 'rgba(255,255,255,0.5)' : '#e5ded6'} strokeWidth="1.5" />
      {/* 北标记：小三角，永远在正上方，提示「上为正北」 */}
      <path d="M20 1.5 l2.4 4 h-4.8 z" fill={active ? 'rgba(255,255,255,0.7)' : '#b3aaa2'} />
      <g transform={`rotate(${arrow} 20 20)`}>
        <path d="M20 30 L20 11" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M14.5 15.5 L20 9 L25.5 15.5" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/**
 * 八方选择器。
 *
 * @param onPick 传回选中那一方；调用方自行决定它代表坐山还是向首。
 */
export function EightDirectionPicker({
  value,
  onPick,
  label = '大门朝哪个方向？',
}: {
  value: string | null;
  onPick: (d: EightDirection) => void;
  label?: string;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {EIGHT_DIRECTIONS.map((d) => {
          const active = value === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={active}
              className={`flex min-h-[5rem] flex-col items-center justify-center gap-1 rounded-xl border transition active:scale-[0.97] ${
                active ? 'border-cinnabar bg-cinnabar text-white' : 'border-rice-line bg-white'
              }`}
            >
              <DirectionGlyph arrow={d.arrow} active={active} />
              <span className="text-[0.8125rem] font-medium leading-none">{d.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-mute">
        图中小三角恒指正北。站在屋内面朝大门，选你面对的那一方即可。
      </p>
    </div>
  );
}

/**
 * 手机罗盘读数面板。
 *
 * @param onUse 用户认可当前读数时回调（传方位角）。
 */
export function CompassReader({ onUse }: { onUse: (deg: number) => void }) {
  const c = useCompass();
  const boundary = c.heading != null && nearMountainBoundary(c.heading);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif text-[1rem] font-semibold">用手机当罗盘</p>
        {c.status === 'reading' ? (
          <button type="button" className="btn btn-sm" onClick={c.stop}>
            停止
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={c.start}>
            {c.status === 'asking' ? '请求权限中…' : '开始读数'}
          </button>
        )}
      </div>

      {c.status === 'reading' && c.heading != null && (
        <>
          <p className="my-2 text-center font-serif text-4xl font-bold tabular-nums text-cinnabar">
            {c.heading.toFixed(1)}°
          </p>
          <p className="text-center text-[0.8125rem] text-ink-mute">
            {degreeToMountain(c.heading).name} 山
          </p>
          <div className="my-3 flex justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120" aria-label={`当前朝向 ${c.heading.toFixed(0)} 度`}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="#e5ded6" strokeWidth="2" />
              <text x="60" y="18" textAnchor="middle" fontSize="11" fill="#8b817a">
                北
              </text>
              <g transform={`rotate(${c.heading} 60 60)`}>
                <path d="M60 96 L60 30" stroke="#a8352a" strokeWidth="3" strokeLinecap="round" />
                <path d="M52 40 L60 26 L68 40" fill="none" stroke="#a8352a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </svg>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={() => onUse(c.heading!)} disabled={!c.trustworthy}>
            用这个读数
          </button>
        </>
      )}

      {c.note && (
        <p
          className={`mt-2 rounded-xl border p-2.5 text-[0.8125rem] leading-relaxed ${
            c.trustworthy && c.status === 'reading'
              ? 'border-rice-line bg-rice-deep/40 text-ink-soft'
              : 'border-risk-warn/40 bg-risk-warn/[0.06] text-ink-soft'
          }`}
        >
          {c.note}
        </p>
      )}

      {boundary && c.status === 'reading' && (
        <p className="mt-2 rounded-xl border border-gold/45 bg-gold/[0.07] p-2.5 text-[0.8125rem] leading-relaxed text-ink-soft">
          当前读数贴近山界（每山 15°，界在 7.5° 处）。手机读的是磁北，与地理方位在本地区约差数度 ——
          此时足以改判一山，建议用实体罗盘复核，或转身重读几次取中位数。
        </p>
      )}

      {/* 被拒 / 不支持 / 没信号：一律给出还能走的路，不把人卡死在这一步 */}
      {(c.status === 'denied' || c.status === 'unsupported' || c.status === 'no-signal') && (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">
          用不了也不要紧，还有两条路：<b className="text-ink-soft">直接选八方之一</b>
          （粗一些，但足以起盘），或用实体罗盘 / 纸质指南针量到度数后
          <b className="text-ink-soft">手动填入</b>。两者的置信度代价就写在下面。
        </p>
      )}
    </div>
  );
}
