import { describe, expect, it } from 'vitest';
import { circularStats, headingFromEuler } from './useCompass';

describe('手机罗盘换算', () => {
  it('平放：α=0 指北、α=270 指东、α=90 指西（α 逆时针为正）', () => {
    expect(headingFromEuler(0, 0, 0)).toBeCloseTo(0, 6);
    expect(headingFromEuler(270, 0, 0)).toBeCloseTo(90, 6);
    expect(headingFromEuler(90, 0, 0)).toBeCloseTo(270, 6);
  });

  it('平放时左右侧倾（γ）不影响顶端方位', () => {
    expect(headingFromEuler(225, 10, 30)).toBeCloseTo(135, 6);
  });

  it('竖拿（β=90°）改用背面所指，与平放时同一朝向连续', () => {
    // 面向东南（135°）：平放 α=225；竖起来后背面仍朝东南
    const flat = headingFromEuler(225, 0, 0);
    const upright = headingFromEuler(225, 90, 0);
    expect(flat).toBeCloseTo(135, 6);
    expect(upright).toBeCloseTo(135, 3);
    // 倾角 59° 与 61° 两侧不跳变
    expect(Math.abs(headingFromEuler(225, 59, 0) - headingFromEuler(225, 61, 0))).toBeLessThan(1);
  });

  it('圆周平均跨 0° 不出错；读数越散，离散度越大', () => {
    expect(circularStats([358, 2]).mean).toBeCloseTo(0, 6);
    expect(circularStats([350, 10]).spread).toBeGreaterThan(circularStats([358, 2]).spread);
    expect(circularStats([90, 90, 90]).spread).toBeCloseTo(0, 6);
  });
});
