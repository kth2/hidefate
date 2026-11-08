/**
 * 户型图叠盘 —— 把罗盘方位、太极点与分宫线落到一张平面图上。
 *
 * 只做几何，不做断事：给定图上的外墙多边形、太极点、以及「图上哪个方向是北」，
 * 算出任一点的方位角、所属宫位，以及按井字格看哪几宫有缺角。
 *
 * 坐标约定：图片像素坐标，x 向右、y 向下；「图上角度」自图的正上方起顺时针量，0–360。
 * 罗盘方位角同样自北起顺时针。两者只差一个常数 `northImageAngle`（北在图上的角度），
 * 前提是图片没有被镜像 —— 平面图照片不会镜像，所以这一条成立。
 *
 * 定向有两种等价的输入，都化成 northImageAngle：
 *   1. 已知坐向度数，再指出图上哪一边是「向」：north = 向在图上的角度 − 向首度数
 *   2. 图上有指北针或「南」字：直接给出北在图上的角度
 *
 * 分宫三法（门派设置 `palaceDivision`）：
 *   - 九宫井字：外接矩形三等分，格子与图片边平行；正对「向」那一边的中格即向首之宫，
 *     其余各格按洛书八方顺序依次推出（不逐格重算方位，免得斜向的宅子在扇区交界处错宫）。
 *   - 八卦放射 / 二十四山放射：自太极点放射，按该点的方位角查二十四山所属之宫。
 *     两法分到的宫位相同（三山合一卦），差别只在图上画八条线还是二十四条线。
 *     放射法的中宫取太极点周围一个小圆，半径为外接矩形短边的六分之一 —— 这是工程取值，不是古法。
 */

import type { PalaceIndex } from './constants.js';
import { norm360 } from './constants.js';
import { degreeToMountain } from './mountains.js';
import type { PalaceDivision } from './school.js';

export type PlanPoint = readonly [number, number];

/** 洛书八方，自北起顺时针。 */
export const RING_CLOCKWISE: readonly PalaceIndex[] = [1, 8, 3, 4, 9, 2, 7, 6];

/** 放射法中宫半径占外接矩形短边的比例（工程取值）。 */
export const RADIAL_CENTER_RATIO = 1 / 6;

/** 缺角门槛：一格缺去三分之一以上才算缺，缺去三分之二以上作「几乎全缺」。 */
export const MISSING_THRESHOLDS = { partial: 1 / 3, severe: 2 / 3 } as const;

export function polygonArea(pts: readonly PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** 几何重心（按面积加权）。点太少或面积为零时退回各点平均。 */
export function polygonCentroid(pts: readonly PlanPoint[]): PlanPoint {
  if (pts.length === 0) throw new Error('外墙至少要有一个点。');
  const a = polygonArea(pts);
  if (pts.length < 3 || Math.abs(a) < 1e-9) {
    const sx = pts.reduce((s, p) => s + p[0], 0);
    const sy = pts.reduce((s, p) => s + p[1], 0);
    return [sx / pts.length, sy / pts.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** 射线法判断点是否在多边形内（落在边上的点不保证归属）。 */
export function pointInPolygon(p: PlanPoint, pts: readonly PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface PlanBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function boundingBox(pts: readonly PlanPoint[]): PlanBox {
  if (pts.length === 0) throw new Error('外墙至少要有一个点。');
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

/** 整张图当外墙（尚未描外墙时的默认）。 */
export function rectPolygon(width: number, height: number): PlanPoint[] {
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
}

/** 自 from 看 to 的图上角度：正上方 0°，顺时针。 */
export function imageAngle(from: PlanPoint, to: PlanPoint): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return norm360((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** 已知向首度数与「向」在图上的角度，求北在图上的角度。 */
export function northFromFacing(facingDegree: number, facingImageAngle: number): number {
  return norm360(facingImageAngle - facingDegree);
}

/** 罗盘方位角 → 图上角度。 */
export function bearingToImageAngle(bearing: number, northImageAngle: number): number {
  return norm360(bearing + northImageAngle);
}

/** 图上角度 → 罗盘方位角。 */
export function imageAngleToBearing(angle: number, northImageAngle: number): number {
  return norm360(angle - northImageAngle);
}

/** 自太极点看某点的罗盘方位角。 */
export function bearingFromTaiji(p: PlanPoint, taiji: PlanPoint, northImageAngle: number): number {
  return imageAngleToBearing(imageAngle(taiji, p), northImageAngle);
}

/** 方位角所属之宫（依二十四山表，边界约定与 degreeToMountain 相同）。 */
export function palaceOfBearing(bearing: number): PalaceIndex {
  return degreeToMountain(bearing).palace;
}

/** 自某宫沿洛书八方走 steps 步（正数为顺时针）。中宫不动。 */
export function ringStep(from: PalaceIndex, steps: number): PalaceIndex {
  if (from === 5) return 5;
  const i = RING_CLOCKWISE.indexOf(from);
  return RING_CLOCKWISE[(((i + steps) % 8) + 8) % 8]!;
}

/** 图上角度贴到最近的边：0 上、90 右、180 下、270 左。 */
export function nearestEdgeAngle(angle: number): 0 | 90 | 180 | 270 {
  return ((Math.round(norm360(angle) / 90) % 4) * 90) as 0 | 90 | 180 | 270;
}

export interface PlanGeometry {
  /** 外墙多边形（图片像素）。 */
  readonly polygon: readonly PlanPoint[];
  /** 太极点。 */
  readonly taiji: PlanPoint;
  /** 北在图上的角度。 */
  readonly northImageAngle: number;
  /** 坐山度数（向首 = 坐山 + 180）。 */
  readonly sittingDegree: number;
}

export interface GridCell {
  readonly row: 0 | 1 | 2;
  readonly col: 0 | 1 | 2;
  readonly palace: PalaceIndex;
  readonly box: PlanBox;
  readonly center: PlanPoint;
}

/** 井字格某格（相对中格的偏移 dx, dy ∈ {-1,0,1}）在图上的理想角度，中格为 null。 */
function cellIdealAngle(dx: number, dy: number): number | null {
  if (dx === 0 && dy === 0) return null;
  return norm360((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * 九宫井字：外接矩形三等分。
 * 「向」那一边的中格 = 向首所在之宫；其余格子按与该格相差几个 45° 沿洛书八方推出。
 */
export function gridCells(g: PlanGeometry): GridCell[] {
  const box = boundingBox(g.polygon);
  const facingDeg = norm360(g.sittingDegree + 180);
  const frontAngle = nearestEdgeAngle(bearingToImageAngle(facingDeg, g.northImageAngle));
  const frontPalace = palaceOfBearing(facingDeg);
  const w = (box.maxX - box.minX) / 3;
  const h = (box.maxY - box.minY) / 3;
  const cells: GridCell[] = [];
  for (let row = 0 as 0 | 1 | 2; row < 3; row = (row + 1) as 0 | 1 | 2) {
    for (let col = 0 as 0 | 1 | 2; col < 3; col = (col + 1) as 0 | 1 | 2) {
      const ideal = cellIdealAngle(col - 1, row - 1);
      const palace: PalaceIndex =
        ideal == null ? 5 : ringStep(frontPalace, Math.round(norm360(ideal - frontAngle + 180) / 45) - 4);
      const cb: PlanBox = {
        minX: box.minX + col * w,
        minY: box.minY + row * h,
        maxX: box.minX + (col + 1) * w,
        maxY: box.minY + (row + 1) * h,
      };
      cells.push({ row, col, palace, box: cb, center: [(cb.minX + cb.maxX) / 2, (cb.minY + cb.maxY) / 2] });
    }
  }
  return cells;
}

/** 某点按门派分宫法落在哪一宫。 */
export function palaceAtPoint(p: PlanPoint, g: PlanGeometry, division: PalaceDivision): PalaceIndex {
  if (division === '九宫井字') {
    const box = boundingBox(g.polygon);
    const cells = gridCells(g);
    const w = (box.maxX - box.minX) / 3 || 1;
    const h = (box.maxY - box.minY) / 3 || 1;
    const col = Math.min(2, Math.max(0, Math.floor((p[0] - box.minX) / w)));
    const row = Math.min(2, Math.max(0, Math.floor((p[1] - box.minY) / h)));
    return cells[row * 3 + col]!.palace;
  }
  const box = boundingBox(g.polygon);
  const r = Math.min(box.maxX - box.minX, box.maxY - box.minY) * RADIAL_CENTER_RATIO;
  if (Math.hypot(p[0] - g.taiji[0], p[1] - g.taiji[1]) <= r) return 5;
  return palaceOfBearing(bearingFromTaiji(p, g.taiji, g.northImageAngle));
}

export interface MissingSuggestion {
  readonly palace: PalaceIndex;
  /** 该格缺去的面积比例。 */
  readonly missingFraction: number;
  /** 0.5 = 缺一半，1 = 几乎全缺（与建档页的缺角档位一致）。 */
  readonly severity: 0.5 | 1;
}

/**
 * 缺角初判：井字格逐格取样，看多少落在外墙之外。
 * 只是按面积的初判，不等于各派的缺角定义（有的看边长三分之一，有的看凹入深度），故只作建议。
 */
export function suggestMissingCorners(g: PlanGeometry, samples = 24): MissingSuggestion[] {
  const out: MissingSuggestion[] = [];
  for (const c of gridCells(g)) {
    if (c.palace === 5) continue;
    let outside = 0;
    for (let i = 0; i < samples; i++) {
      for (let j = 0; j < samples; j++) {
        const x = c.box.minX + ((i + 0.5) / samples) * (c.box.maxX - c.box.minX);
        const y = c.box.minY + ((j + 0.5) / samples) * (c.box.maxY - c.box.minY);
        if (!pointInPolygon([x, y], g.polygon)) outside++;
      }
    }
    const m = outside / (samples * samples);
    if (m >= MISSING_THRESHOLDS.severe) out.push({ palace: c.palace, missingFraction: m, severity: 1 });
    else if (m >= MISSING_THRESHOLDS.partial) out.push({ palace: c.palace, missingFraction: m, severity: 0.5 });
  }
  return out.sort((a, b) => b.missingFraction - a.missingFraction);
}
