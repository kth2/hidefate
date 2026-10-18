'use client';

/**
 * 手机罗盘 hook。
 *
 * 平台差异（照实处理，不假装一致）：
 *   - iOS Safari：须用户点按后调用 `DeviceOrientationEvent.requestPermission()`；
 *     读 `webkitCompassHeading`（已做倾斜补偿，0 = 磁北，顺时针），另有 `webkitCompassAccuracy`（±度）。
 *   - Android Chrome：监听 `deviceorientationabsolute`，由 alpha/beta/gamma 按 W3C 规范示例换算航向
 *     （手机平放或竖拿都可用）。
 *   - 桌面或无传感器：`unsupported`，页面改用手动拨盘。
 *   - 非 https：浏览器不给传感器，`insecure`。
 *
 * 读数为**磁北**（与传统罗盘一致）。手机磁力计易受钢筋、电器、磁吸手机壳干扰，
 * 故同时给出近 2 秒读数的离散度（`spread`，度），离散大就提醒复核。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CompassStatus = 'idle' | 'needs-permission' | 'active' | 'unsupported' | 'denied' | 'insecure';

export interface CompassState {
  readonly status: CompassStatus;
  /** 手机所指方位角（平放看顶端、竖拿看背面；0 = 北，顺时针）；未取得为 null。 */
  readonly heading: number | null;
  /** iOS 提供的精度（±度）；其它平台为 null。 */
  readonly accuracy: number | null;
  /** 近期读数的圆周标准差（度）。 */
  readonly spread: number | null;
  readonly source: 'ios' | 'absolute' | null;
}

type OrientationEventIOS = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };

/**
 * 由欧拉角（W3C：Z-X'-Y'' 次序，地面坐标 x=东、y=北、z=上）求手机所指方位角。
 *
 * 手机顶端（设备 y 轴）在地面的投影方位 = atan2(−sinα·cosβ, cosα·cosβ) = 360° − α（cosβ > 0 时）。
 * 手机越竖越不准（顶端指天时投影退化），所以倾角超过 60° 改用「背面镜头所指」——
 * 即 W3C 规范示例的公式。两者在倾角 60° 附近连续衔接，使用者感觉是「手机朝哪就指哪」。
 */
export function headingFromEuler(alpha: number, beta: number, gamma: number): number {
  const d = Math.PI / 180;
  const cb = Math.cos(beta * d);
  if (Math.abs(cb) > 0.5) {
    return (360 - alpha + (cb < 0 ? 180 : 0) + 720) % 360;
  }
  const x = beta * d;
  const y = gamma * d;
  const z = alpha * d;
  const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z);
  const sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI;
  else if (vx < 0) h += 2 * Math.PI;
  return ((h * 180) / Math.PI + 360) % 360;
}

/** 圆周平均与离散度。 */
export function circularStats(samples: readonly number[]): { mean: number; spread: number } {
  let sx = 0;
  let sy = 0;
  for (const s of samples) {
    sx += Math.cos((s * Math.PI) / 180);
    sy += Math.sin((s * Math.PI) / 180);
  }
  const n = samples.length || 1;
  const r = Math.min(1, Math.hypot(sx / n, sy / n));
  const mean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const spread = r <= 0 ? 180 : (Math.sqrt(-2 * Math.log(r)) * 180) / Math.PI;
  return { mean, spread };
}

const WINDOW_MS = 2000;

export function useCompass(): CompassState & { start: () => Promise<void> } {
  const [state, setState] = useState<CompassState>({ status: 'idle', heading: null, accuracy: null, spread: null, source: null });
  const samples = useRef<{ t: number; h: number }[]>([]);
  const detach = useRef<(() => void) | null>(null);

  const push = useCallback((h: number, accuracy: number | null, source: 'ios' | 'absolute') => {
    const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle || 0 : 0;
    const heading = (h + angle + 360) % 360;
    const now = Date.now();
    samples.current = [...samples.current.filter((s) => now - s.t < WINDOW_MS), { t: now, h: heading }];
    const { mean, spread } = circularStats(samples.current.map((s) => s.h));
    setState({ status: 'active', heading: mean, accuracy, spread, source });
  }, []);

  const attach = useCallback(() => {
    detach.current?.();
    const onIOS = (e: Event) => {
      const ev = e as OrientationEventIOS;
      if (typeof ev.webkitCompassHeading === 'number') {
        push(ev.webkitCompassHeading, typeof ev.webkitCompassAccuracy === 'number' ? ev.webkitCompassAccuracy : null, 'ios');
      }
    };
    const onAbs = (e: Event) => {
      const ev = e as DeviceOrientationEvent;
      if (ev.alpha == null || ev.beta == null || ev.gamma == null) return;
      push(headingFromEuler(ev.alpha, ev.beta, ev.gamma), null, 'absolute');
    };
    const onRel = (e: Event) => {
      const ev = e as DeviceOrientationEvent & OrientationEventIOS;
      if (typeof ev.webkitCompassHeading === 'number') return onIOS(e);
      if (ev.absolute && ev.alpha != null && ev.beta != null && ev.gamma != null) {
        push(headingFromEuler(ev.alpha, ev.beta, ev.gamma), null, 'absolute');
      }
    };
    window.addEventListener('deviceorientationabsolute', onAbs);
    window.addEventListener('deviceorientation', onRel);
    detach.current = () => {
      window.removeEventListener('deviceorientationabsolute', onAbs);
      window.removeEventListener('deviceorientation', onRel);
    };
    // 1.5 秒内没有任何可用读数 → 视为不支持（桌面浏览器常见）
    window.setTimeout(() => {
      setState((s) => (s.status === 'active' ? s : { ...s, status: 'unsupported' }));
    }, 1500);
  }, [push]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) {
      setState((s) => ({ ...s, status: 'insecure' }));
      return;
    }
    if (typeof DeviceOrientationEvent === 'undefined') {
      setState((s) => ({ ...s, status: 'unsupported' }));
      return;
    }
    const needsPermission =
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function';
    if (needsPermission) setState((s) => ({ ...s, status: 'needs-permission' }));
    else attach();
    return () => detach.current?.();
  }, [attach]);

  const start = useCallback(async () => {
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof req === 'function') {
      try {
        const r = await req();
        if (r !== 'granted') {
          setState((s) => ({ ...s, status: 'denied' }));
          return;
        }
      } catch {
        setState((s) => ({ ...s, status: 'denied' }));
        return;
      }
    }
    attach();
  }, [attach]);

  return { ...state, start };
}
