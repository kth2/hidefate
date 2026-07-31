import { describe, expect, it } from 'vitest';
import type { BirthInput } from '@hidefate/core-bazi';
import { castZiWei } from './cast.js';
import { detectPatterns } from './patterns.js';

const male = (year: number, month: number, day: number, hour: number): BirthInput => ({
  gender: '男',
  year,
  month,
  day,
  hour,
});

const namesOf = (b: BirthInput) => castZiWei(b).patterns.map((p) => p.name);

describe('格局锚点', () => {
  it.each([
    ['紫府同宫', male(1982, 4, 27, 5)],
    ['日月同宫', male(1980, 4, 18, 5)],
    ['命宫双吉化', male(1980, 4, 18, 5)],
    ['紫微天相', male(1980, 1, 18, 17)],
    ['机月同梁', male(1980, 1, 5, 1)],
    ['杀破狼', male(1980, 1, 5, 9)],
    ['火贪/铃贪', male(1981, 1, 5, 1)],
    ['日月并明', male(1980, 1, 5, 9)],
    ['日月反背', male(1980, 1, 5, 21)],
    ['石中隐玉', male(1981, 1, 27, 1)],
    ['府相朝垣', male(1980, 1, 5, 13)],
  ])('%s 能被检出', (name, birth) => {
    expect(namesOf(birth)).toContain(name);
  });
});

describe('互斥与自洽', () => {
  it('日月并明与日月反背不可能同时出现', () => {
    for (let y = 1980; y <= 1990; y++) {
      const names = namesOf(male(y, 6, 15, 9));
      expect(names.includes('日月并明') && names.includes('日月反背')).toBe(false);
    }
  });

  it('石中隐玉必以巨门坐子午为前提', () => {
    const chart = castZiWei(male(1981, 1, 27, 1));
    const soul = chart.palaces.find((p) => p.name === '命宫')!;
    expect(['子', '午']).toContain(soul.earthlyBranch);
    expect(soul.majorStars.map((s) => s.name)).toContain('巨门');
  });

  it('命宫双吉化确实在命宫见到两个以上生年吉化', () => {
    const chart = castZiWei(male(1980, 4, 18, 5));
    const soul = chart.palaces.find((p) => p.name === '命宫')!;
    const lucky = soul.majorStars.filter(
      (s) => s.mutagen === '禄' || s.mutagen === '权' || s.mutagen === '科',
    );
    expect(lucky.length).toBeGreaterThanOrEqual(2);
  });

  it('每条格局都带断语与至少一个分析领域', () => {
    const chart = castZiWei(male(1980, 1, 5, 9));
    expect(chart.patterns.length).toBeGreaterThan(0);
    for (const p of chart.patterns) {
      expect(p.text.length).toBeGreaterThan(10);
      expect(p.sections.length).toBeGreaterThan(0);
    }
  });
});

/**
 * 上游 Dart 版把「府相朝垣」的宫位条件写反，规则永不触发。
 * 这条测试锁住修正结果，防止有人「照着上游改回去」。
 */
describe('府相朝垣的可达性（上游 bug 的回归锁）', () => {
  const sweep = () => {
    let dartRule = 0;
    let corrected = 0;
    // 128 张盘足以分辨「结构上不可能」与「约一成命中」，再多只是拖慢测试。
    for (let y = 1980; y <= 1987; y++) {
      for (const m of [1, 4, 7, 10]) {
        for (const d of [5, 18]) {
          for (const h of [1, 13]) {
            const c = castZiWei(male(y, m, d, h));
            const has = (pal: string, star: string) =>
              (c.palaces.find((p) => p.name === pal)?.majorStars ?? []).some(
                (s) => s.name === star,
              );
            if (has('财帛', '天府') && has('官禄', '天相')) dartRule++;
            if (has('官禄', '天府') && has('财帛', '天相')) corrected++;
          }
        }
      }
    }
    return { dartRule, corrected };
  };

  it('上游写法在大样本下命中 0 次，修正后命中非 0', () => {
    const { dartRule, corrected } = sweep();
    expect(dartRule).toBe(0);
    expect(corrected).toBeGreaterThan(0);
  });
});

describe('输入防御', () => {
  it('没有命宫时返回空数组而非抛错', () => {
    expect(detectPatterns({ palaces: [] })).toEqual([]);
  });
});
