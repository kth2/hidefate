import { describe, expect, it } from 'vitest';
import {
  bearingFromTaiji,
  gridCells,
  imageAngle,
  northFromFacing,
  palaceAtPoint,
  polygonCentroid,
  rectPolygon,
  ringStep,
  suggestMissingCorners,
  type PlanGeometry,
  type PlanPoint,
} from './floorPlan.js';
import { GRID_LAYOUT } from './constants.js';

const square = rectPolygon(300, 300);
/** 300×300 方块去掉右上角 100×100。 */
const ell: PlanPoint[] = [
  [0, 0],
  [200, 0],
  [200, 100],
  [300, 100],
  [300, 300],
  [0, 300],
];

function geo(over: Partial<PlanGeometry> = {}): PlanGeometry {
  return { polygon: square, taiji: [150, 150], northImageAngle: 0, sittingDegree: 0, ...over };
}

const grid = (g: PlanGeometry) => gridCells(g).map((c) => c.palace);

describe('户型图几何', () => {
  it('图上角度：上 0、右 90、下 180、左 270', () => {
    expect(imageAngle([0, 0], [0, -1])).toBe(0);
    expect(imageAngle([0, 0], [1, 0])).toBe(90);
    expect(imageAngle([0, 0], [0, 1])).toBe(180);
    expect(imageAngle([0, 0], [-1, 0])).toBe(270);
  });

  it('重心：方块在正中；L 形按面积加权', () => {
    expect(polygonCentroid(square)).toEqual([150, 150]);
    const [x, y] = polygonCentroid(ell);
    expect(x).toBeCloseTo(137.5, 6);
    expect(y).toBeCloseTo(162.5, 6);
    // 顶点次序反过来，结果相同
    const [x2, y2] = polygonCentroid([...ell].reverse());
    expect(x2).toBeCloseTo(137.5, 6);
    expect(y2).toBeCloseTo(162.5, 6);
  });

  it('向首在图下方、坐子向午：井字格与「上北下南」九宫一致', () => {
    // 图上方是北 ⇔ 向首 180° 落在图下方
    expect(northFromFacing(180, 180)).toBe(0);
    expect(grid(geo())).toEqual([...GRID_LAYOUT]);
  });

  it('图转了九十度（向首在图右边）：格子随之转', () => {
    const g = geo({ northImageAngle: northFromFacing(180, 90) }); // 北在图左
    // 右中格 = 向首之宫（南 9），上中格 = 东 3，左中格 = 北 1，下中格 = 西 7
    const cells = gridCells(g);
    const at = (row: number, col: number) => cells[row * 3 + col]!.palace;
    expect(at(1, 2)).toBe(9);
    expect(at(0, 1)).toBe(3);
    expect(at(1, 0)).toBe(1);
    expect(at(2, 1)).toBe(7);
    expect(at(1, 1)).toBe(5);
  });

  it('斜向的宅子：向首格固定为向首之宫，不因扇区交界而错宫', () => {
    // 坐戌向辰附近（向首 112°，属东宫），向在图下方
    const g = geo({ sittingDegree: 292, northImageAngle: northFromFacing(112, 180) });
    const cells = gridCells(g);
    expect(cells[7]!.palace).toBe(3); // 下中格 = 东
    expect(cells[1]!.palace).toBe(7); // 上中格 = 西（对宫）
    // 九格恰好各占一宫
    expect(new Set(cells.map((c) => c.palace)).size).toBe(9);
  });

  it('洛书八方步进', () => {
    expect(ringStep(9, 1)).toBe(2);
    expect(ringStep(9, -1)).toBe(4);
    expect(ringStep(1, -1)).toBe(6);
    expect(ringStep(5, 3)).toBe(5);
  });

  it('放射分宫：按太极点方位查二十四山之宫；近太极为中宫', () => {
    const g = geo();
    expect(bearingFromTaiji([150, 290], g.taiji, 0)).toBe(180);
    expect(palaceAtPoint([150, 290], g, '八卦放射')).toBe(9);
    expect(palaceAtPoint([290, 150], g, '二十四山放射')).toBe(3);
    expect(palaceAtPoint([155, 148], g, '八卦放射')).toBe(5);
    // 井字：同一点按格子
    expect(palaceAtPoint([10, 10], g, '九宫井字')).toBe(6);
  });

  it('缺角初判：方块无缺；L 形缺东北', () => {
    expect(suggestMissingCorners(geo())).toEqual([]);
    const s = suggestMissingCorners(geo({ polygon: ell }));
    expect(s).toHaveLength(1);
    expect(s[0]!.palace).toBe(8);
    expect(s[0]!.severity).toBe(1);
  });

  it('缺去约一半的格子作「缺一半」', () => {
    // 右上格只剩下半
    const half: PlanPoint[] = [
      [0, 0],
      [200, 0],
      [200, 50],
      [300, 50],
      [300, 300],
      [0, 300],
    ];
    const s = suggestMissingCorners(geo({ polygon: half }));
    expect(s.map((x) => [x.palace, x.severity])).toEqual([[8, 0.5]]);
  });
});
