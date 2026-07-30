/**
 * 八方近似与手机罗盘。
 *
 * 手打度数不该是唯一的路。实际情况是：
 *   - 多数人手上没有罗盘，但手上一定有手机；
 *   - 就算什么都没有，「大门朝南」这种粗略方位他总说得出来。
 * 所以这里给出两条替代路径 —— 手机磁力计读数、八方近似 ——
 * 并把各自的置信度代价明码标出来，让用户自己权衡。
 *
 * 本文件只放纯函数（可在 node 下直接测），React 部分在 CompassAssist.tsx。
 */

import { azimuthToPalace, norm360, type PalaceIndex } from '@hidefate/core-fengshui';

export interface EightDirection {
  readonly id: string;
  /** 用户的说法。 */
  readonly label: string;
  /** 该方位的中心方位角。 */
  readonly azimuth: number;
  /** 对应的「正」山名 —— 八方近似即以该山之中气代表整卦。 */
  readonly mountain: string;
  readonly palace: PalaceIndex;
  /** 图示用的箭头角度（与 azimuth 同，单列以免图示与语义耦合）。 */
  readonly arrow: number;
}

/**
 * 八方。每一方跨 45°，取正中那一山为代表。
 *
 * 为什么用中心而不是边界：落在卦的正中最不容易越界。若用户真在骑线处，
 * 那本来就该实测度数 —— 八方近似给不出兼向与替卦，这一点界面上有明说。
 */
export const EIGHT_DIRECTIONS: readonly EightDirection[] = [
  { id: 'n', label: '正北', azimuth: 0, mountain: '子', palace: 1, arrow: 0 },
  { id: 'ne', label: '东北', azimuth: 45, mountain: '艮', palace: 8, arrow: 45 },
  { id: 'e', label: '正东', azimuth: 90, mountain: '卯', palace: 3, arrow: 90 },
  { id: 'se', label: '东南', azimuth: 135, mountain: '巽', palace: 4, arrow: 135 },
  { id: 's', label: '正南', azimuth: 180, mountain: '午', palace: 9, arrow: 180 },
  { id: 'sw', label: '西南', azimuth: 225, mountain: '坤', palace: 2, arrow: 225 },
  { id: 'w', label: '正西', azimuth: 270, mountain: '酉', palace: 7, arrow: 270 },
  { id: 'nw', label: '西北', azimuth: 315, mountain: '乾', palace: 6, arrow: 315 },
] as const;

/** 离给定方位角最近的那一方。 */
export function nearestEightDirection(deg: number): EightDirection {
  const d = norm360(deg);
  let best = EIGHT_DIRECTIONS[0]!;
  let bestGap = 360;
  for (const e of EIGHT_DIRECTIONS) {
    const gap = Math.min(Math.abs(d - e.azimuth), 360 - Math.abs(d - e.azimuth));
    if (gap < bestGap) {
      bestGap = gap;
      best = e;
    }
  }
  return best;
}

export function eightDirectionById(id: string): EightDirection | null {
  return EIGHT_DIRECTIONS.find((e) => e.id === id) ?? null;
}

/** 八方近似落在哪一宫 —— 与引擎的 azimuthToPalace 同源，不另算。 */
export function palaceOfEight(e: EightDirection): PalaceIndex {
  return azimuthToPalace(e.azimuth);
}

/** DeviceOrientation 事件里可能带的罗盘字段（各浏览器实现不一）。 */
export interface OrientationLike {
  readonly alpha?: number | null;
  /** iOS Safari 专有：已经是「相对正北的顺时针角度」，可直接用。 */
  readonly webkitCompassHeading?: number | null;
  /** iOS 提供的精度（度）。−1 表示读数不可信。 */
  readonly webkitCompassAccuracy?: number | null;
  readonly absolute?: boolean;
}

export interface CompassReading {
  readonly heading: number;
  /** 读数是否可信 —— 不可信时界面必须说出来，不能默默显示一个数。 */
  readonly trustworthy: boolean;
  readonly note: string;
}

/**
 * 把 DeviceOrientation 事件换算成「设备正面朝向的方位角」。
 *
 * 两套实现：
 *   - iOS Safari 给 `webkitCompassHeading`，已是正北起算的顺时针角度，直接用；
 *   - 其余浏览器给 `alpha`（绕 Z 轴逆时针），需 `360 − alpha` 才是顺时针方位角，
 *     且只有 `absolute === true`（或 deviceorientationabsolute 事件）时才对准真北，
 *     否则那只是相对开机时的朝向，毫无意义 —— 这种情况一律标为不可信。
 */
export function headingFrom(e: OrientationLike): CompassReading | null {
  const webkit = e.webkitCompassHeading;
  if (typeof webkit === 'number' && Number.isFinite(webkit)) {
    const acc = e.webkitCompassAccuracy;
    const bad = typeof acc === 'number' && (acc < 0 || acc > 25);
    return {
      heading: norm360(webkit),
      trustworthy: !bad,
      note: bad
        ? '手机磁力计当前精度不足（附近可能有金属或磁铁）。请走远一些、做几个 8 字晃动后重读。'
        : '读数来自手机磁力计，指向磁北。',
    };
  }

  if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
    const absolute = e.absolute === true;
    return {
      heading: norm360(360 - e.alpha),
      trustworthy: absolute,
      note: absolute
        ? '读数来自手机磁力计，指向磁北。'
        : '此浏览器只给出相对角度，未对准真北 —— 该数只能当作相对参考，不可当作实测。',
    };
  }

  return null;
}

/**
 * 磁偏角提醒。
 *
 * 手机罗盘读的是磁北，风水量的是地理方位；两者在中港台星马一带相差
 * 约 −3°…+6°，通常不足以跨山（每山 15°），但落在山界附近时足以改判。
 * 故此处不替用户自动校正（我们不知道他在哪），只在读数贴近山界时提醒。
 */
export function nearMountainBoundary(deg: number, toleranceDeg = 3): boolean {
  // 二十四山每山 15°，边界在 7.5° + 15°n
  const offset = norm360(deg - 7.5) % 15;
  return offset <= toleranceDeg || offset >= 15 - toleranceDeg;
}
