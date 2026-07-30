import { describe, expect, it } from 'vitest';
import { GRID_LAYOUT, azimuthToPalace } from '@hidefate/core-fengshui';
import {
  CELL_INDEXES,
  DEFAULT_GRID,
  angleDelta,
  cellRowCol,
  clampTransform,
  palaceMap,
  palaceOfCell,
  pinchOf,
  rotationConfusing,
} from './floorplan';

/**
 * 叠层几何。
 *
 * 最要紧的一条：**格子的宫位是算出来的，不是数格子数出来的**。
 * 一旦允许旋转，「左上角＝西北」就不再成立；若还照着固定表贴标签，
 * 图上看到的与盘上算的就会对不上 —— 那是最难被发现、也最伤信任的错。
 */
describe('格子到宫位的换算', () => {
  it('不旋转时与全 App 的九宫排布（GRID_LAYOUT）完全一致', () => {
    expect(CELL_INDEXES.map((c) => palaceOfCell(c, 0))).toEqual([...GRID_LAYOUT]);
  });

  it('中心格恒为中宫，转到哪都一样', () => {
    for (const rot of [0, 17, 45, 90, 180, 271, 359]) {
      expect(palaceOfCell(4, rot)).toBe(5);
    }
  });

  it('转 45° 后左上角变成正北 —— 标签跟着转，不是死的', () => {
    expect(palaceOfCell(0, 0)).toBe(6); // 西北
    expect(palaceOfCell(0, 45)).toBe(1); // 正北
  });

  it('转 90° 相当于整盘顺时针挪两格', () => {
    // 上中格（正北）转 90° 后指向正东
    expect(palaceOfCell(1, 0)).toBe(1);
    expect(palaceOfCell(1, 90)).toBe(3);
    // 右中格（正东）转 90° 后指向正南
    expect(palaceOfCell(5, 0)).toBe(3);
    expect(palaceOfCell(5, 90)).toBe(9);
  });

  it('转 360° 回到原样', () => {
    expect(palaceMap(360)).toEqual(palaceMap(0));
  });

  it('任何旋转角下，八个外格都各占一宫、不重不漏', () => {
    for (const rot of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const outer = CELL_INDEXES.filter((c) => c !== 4).map((c) => palaceOfCell(c, rot));
      expect(new Set(outer).size).toBe(8);
      expect(outer).not.toContain(5);
    }
  });

  it('换算走的是引擎的 azimuthToPalace，不另立一套', () => {
    // 上中格在旋转 rot 后的方位角就是 rot 本身
    for (const rot of [0, 30, 100, 200, 330]) {
      expect(palaceOfCell(1, rot)).toBe(azimuthToPalace(rot));
    }
  });

  it('行列换算：0 在左上、8 在右下', () => {
    expect(cellRowCol(0)).toEqual({ row: 0, col: 0 });
    expect(cellRowCol(4)).toEqual({ row: 1, col: 1 });
    expect(cellRowCol(8)).toEqual({ row: 2, col: 2 });
  });
});

describe('手势换算与边界', () => {
  it('双指距离与夹角', () => {
    const p = pinchOf({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(p.distance).toBeCloseTo(5);
    expect(p.angle).toBeCloseTo(53.13, 1);
  });

  it('角度差收敛到 −180…180，转过 0° 时不跳一整圈', () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20);
    expect(angleDelta(10, 350)).toBeCloseTo(-20);
    expect(angleDelta(0, 180)).toBeCloseTo(180);
  });

  it('变换被夹在可用范围内，且旋转恒为 0–360', () => {
    const t = clampTransform({ x: 5, y: -3, size: 99, rotation: -30 });
    expect(t.x).toBeLessThanOrEqual(1.2);
    expect(t.y).toBeGreaterThanOrEqual(-0.2);
    expect(t.size).toBeLessThanOrEqual(2);
    expect(t.rotation).toBeCloseTo(330);
  });

  it('缩放不会归零 —— 捏到最小仍留得住格子', () => {
    expect(clampTransform({ ...DEFAULT_GRID, size: 0 }).size).toBeGreaterThan(0);
  });

  it('旋转超过半个卦时提示用户确认标签', () => {
    expect(rotationConfusing(0)).toBe(false);
    expect(rotationConfusing(20)).toBe(false);
    expect(rotationConfusing(30)).toBe(true);
    expect(rotationConfusing(350)).toBe(false); // −10°，仍在半卦内
  });
});
