/**
 * 户型图上的九宫格叠层 —— 纯几何部分。
 *
 * ## 为什么不做图像识别
 *
 * 识别户型图听起来很美，实际上：墙线、家具、文字、比例尺各家画法不同，
 * 识别错了用户还看不出来错在哪。而「把一个九宫格拖到房子上对齐」是所有人
 * 一看就懂、错了一眼就能看出来的操作。**宁可让用户动手，也不要让他相信
 * 一个他无法验证的结果。**
 *
 * ## 宫位是算出来的，不是数格子数出来的
 *
 * 关键一点：九宫格可以旋转（户型图很少正南正北地画）。一旦旋转，
 * 「左上角那一格」就不再是西北。所以每一格的宫位由**它相对格心的方向**
 * 经旋转换算成方位角，再交给引擎既有的 `azimuthToPalace` 判定 ——
 * 与九宫盘用的是同一个函数，不会出现两套说法。
 *
 * 屏幕上「上」恒为正北（与全 App 的九宫格约定一致），
 * 因此用户要做的是把格子转到与房子轮廓对齐，宫位标签会自己跟着变。
 */

import { azimuthToPalace, norm360, type PalaceIndex } from '@hidefate/core-fengshui';

/** 九宫格在图上的位置与姿态。x/y 为格心（相对图片的比例 0–1）。 */
export interface GridTransform {
  readonly x: number;
  readonly y: number;
  /** 格子边长，相对图片宽度的比例。 */
  readonly size: number;
  /** 顺时针旋转角度。 */
  readonly rotation: number;
}

export const DEFAULT_GRID: GridTransform = { x: 0.5, y: 0.5, size: 0.7, rotation: 0 };

export const CELL_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type CellIndex = (typeof CELL_INDEXES)[number];

/** 格子序号 → 行列（0 在左上，8 在右下）。 */
export function cellRowCol(cell: CellIndex): { row: number; col: number } {
  return { row: Math.floor(cell / 3), col: cell % 3 };
}

/**
 * 某一格落在哪一宫。
 *
 * 中心格恒为中宫；其余八格按「格心 → 格子中心」的方向旋转后取方位角。
 */
export function palaceOfCell(cell: CellIndex, rotationDeg: number): PalaceIndex {
  const { row, col } = cellRowCol(cell);
  const dx = col - 1;
  const dy = row - 1;
  if (dx === 0 && dy === 0) return 5;

  const t = (rotationDeg * Math.PI) / 180;
  const sx = dx * Math.cos(t) - dy * Math.sin(t);
  const sy = dx * Math.sin(t) + dy * Math.cos(t);
  // 屏幕上「上」为正北，故北向对应 −y；方位角自北起顺时针
  const azimuth = norm360((Math.atan2(sx, -sy) * 180) / Math.PI);
  return azimuthToPalace(azimuth);
}

/** 整张格子的宫位对照 —— 旋转后重算房间归属时用。 */
export function palaceMap(rotationDeg: number): Record<CellIndex, PalaceIndex> {
  const out = {} as Record<CellIndex, PalaceIndex>;
  for (const c of CELL_INDEXES) out[c] = palaceOfCell(c, rotationDeg);
  return out;
}

/**
 * 旋转到多少度时，格子的宫位标签才跟「上为正北」的直觉一致。
 *
 * 旋转超过 22.5°（半个卦）时，左上角就不再是西北了 —— 这不是 bug，
 * 但必须提醒用户确认，否则他会以为标签错了。
 */
export function rotationConfusing(rotationDeg: number): boolean {
  const r = norm360(rotationDeg);
  const off = Math.min(r, 360 - r);
  return off > 22.5;
}

export interface CellAssignment {
  readonly cell: CellIndex;
  readonly roomId: string;
}

/** 持久化的叠层状态。 */
export interface FloorplanLayout {
  readonly transform: GridTransform;
  readonly assignments: readonly CellAssignment[];
}

export const EMPTY_LAYOUT: FloorplanLayout = { transform: DEFAULT_GRID, assignments: [] };

/** 两指之间的距离与夹角 —— 缩放与旋转都由它推。 */
export function pinchOf(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distance: number; angle: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    distance: Math.hypot(dx, dy),
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** 把角度差收敛到 −180…180，免得转过 0° 时数值跳一整圈。 */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function clampTransform(t: GridTransform): GridTransform {
  return {
    x: Math.min(1.2, Math.max(-0.2, t.x)),
    y: Math.min(1.2, Math.max(-0.2, t.y)),
    size: Math.min(2, Math.max(0.15, t.size)),
    rotation: norm360(t.rotation),
  };
}
