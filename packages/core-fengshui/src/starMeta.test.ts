import { describe, expect, it } from 'vitest';
import { COMBINATIONS } from './starMeta.js';


/**
 * 断语必须自足 —— 界面是随机取一条渲染的，不是顺序阅读。
 *
 * 早先对称组合（5-2 之于 2-5、7-6 之于 6-7）的 meaning 写成「同上」「同交剑煞」，
 * 假设读者刚看过正向那条。实跑界面时用户看到的是孤零零一句
 * 「同碧绿风魔。」，等于什么都没说 —— 而这正是「一头雾水」的来源。
 */
describe('断语自足性', () => {
  it('没有任何组合的断语以「同」开头或含「同上」', () => {
    const bad = COMBINATIONS.filter(
      (c) => /^同/.test(c.meaning) || c.meaning.includes('同上'),
    ).map((c) => `${c.key} ${c.name}：${c.meaning.slice(0, 20)}`);
    expect(bad).toEqual([]);
  });

  it('每条断语都够长到能独立说明问题', () => {
    for (const c of COMBINATIONS) {
      expect(c.meaning.length, `${c.key} ${c.name} 的断语过短`).toBeGreaterThan(14);
    }
  });

  it('对称组合两向都收录，且断语各不相同', () => {
    for (const c of COMBINATIONS) {
      const [a, b] = c.key.split('-');
      if (a === b) continue;
      const mirror = COMBINATIONS.find((x) => x.key === `${b}-${a}`);
      expect(mirror, `${c.key} 缺对称条目 ${b}-${a}`).toBeDefined();
      expect(mirror!.meaning, `${c.key} 与其对称条目断语雷同`).not.toBe(c.meaning);
    }
  });
});
