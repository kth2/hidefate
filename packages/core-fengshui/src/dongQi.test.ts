import { describe, expect, it } from 'vitest';
import { ROOM_META, type RoomPlacement } from './property.js';
import { dongQiMap, dongQiOf, timingBand, timingStrength } from './dongQi.js';

const room = (
  id: string,
  kind: RoomPlacement['kind'],
  palaces: RoomPlacement['palaces'],
): RoomPlacement => ({ id, kind, palaces, primaryPalace: palaces[0]! });

describe('动气强度', () => {
  it('大门是最强动气', () => {
    const d = dongQiOf(1, [room('r1', '大门', [1])]);
    expect(d.level).toBe('强');
    expect(d.strength).toBe(ROOM_META.大门.priority);
  });

  it('无房间落入则无动气 —— 星象再凶也难有应期', () => {
    const d = dongQiOf(4, [room('r1', '大门', [1])]);
    expect(d.level).toBe('无');
    expect(d.strength).toBe(0);
    expect(d.note).toContain('难有应期');
  });

  it('跨宫房间两宫都算动 —— 一间横跨两宫的主卧，两边都在用', () => {
    const rooms = [room('r1', '主卧', [2, 3])];
    expect(dongQiOf(2, rooms).level).not.toBe('无');
    expect(dongQiOf(3, rooms).level).not.toBe('无');
  });

  it('同宫多间房取最强者', () => {
    const d = dongQiOf(1, [room('a', '储藏', [1]), room('b', '大门', [1])]);
    expect(d.strength).toBe(ROOM_META.大门.priority);
    expect(d.sources[0]!.kind).toBe('大门');
  });

  /** 古法最重此项 —— 「不动不应，一动即应」。 */
  it('动土装修直接把静宫顶成强动气', () => {
    const before = dongQiOf(4, []);
    expect(before.level).toBe('无');
    const after = dongQiOf(4, [], { renovatedPalaces: [4] });
    expect(after.level).toBe('强');
    expect(after.strength).toBe(1);
    expect(after.note).toContain('一动即应');
  });

  it('九宫一次算齐', () => {
    const m = dongQiMap([room('r1', '大门', [1]), room('r2', '主卧', [9])]);
    expect(Object.keys(m)).toHaveLength(9);
    expect(m[1].level).toBe('强');
    expect(m[9].level).toBe('强');
    expect(m[5].level).toBe('无');
  });
});

describe('应期强度：相乘而非取平均', () => {
  /**
   * 这条是本模块存在的理由。取平均会让「强凶星 + 零动气」得出中等数值，
   * 而实务上那种情形是不应；相乘才能让任一因子为零时整体归零。
   */
  it('动气为零则整体归零 —— 不是打个折，是不应', () => {
    expect(timingStrength(1, 1, 0)).toBe(0);
    expect(timingBand(timingStrength(1, 1, 0))).toBe('不应');
  });

  it('无流年触发同样归零', () => {
    expect(timingStrength(1, 0, 1)).toBe(0);
  });

  it('若取平均，强凶星配零动气会得出 0.67 —— 那正是要避免的', () => {
    const avg = (1 + 1 + 0) / 3;
    expect(avg).toBeCloseTo(0.667, 2);
    expect(timingStrength(1, 1, 0)).toBe(0);
    expect(timingStrength(1, 1, 0)).toBeLessThan(avg);
  });

  it('三者俱强则应期强度高', () => {
    expect(timingBand(timingStrength(1, 0.9, 1))).toBe('高');
  });

  it('分档覆盖高中低不应', () => {
    expect(timingBand(0)).toBe('不应');
    expect(timingBand(0.1)).toBe('低');
    expect(timingBand(0.3)).toBe('中');
    expect(timingBand(0.6)).toBe('高');
  });

  it('输入越界一律夹到 0–1，不产生大于 1 的强度', () => {
    expect(timingStrength(5, 5, 5)).toBe(1);
    expect(timingStrength(-1, 1, 1)).toBe(0);
  });
});
