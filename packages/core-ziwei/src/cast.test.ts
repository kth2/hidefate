import { describe, expect, it } from 'vitest';
import { astro } from 'iztro';
import { liuNianGanZhi, type BirthInput } from '@hidefate/core-bazi';
import {
  ALL_TIME_INDEXES,
  castZiWei,
  castZiWeiCandidates,
  hourOfTimeIndex,
  horoscopeAt,
  liChunCaveat,
  palaceOf,
  surroundingOf,
  timeIndexOf,
  ziWeiPrecisionOf,
} from './cast.js';

/** 公开盘式锚点：2000-08-16 寅时 女。八月生，不受立春年界影响，适合作固定锚。 */
const ANCHOR: BirthInput = {
  gender: '女',
  year: 2000,
  month: 8,
  day: 16,
  hour: 3,
  minute: 0,
};

describe('时辰索引', () => {
  it('0–23 点全量映射到 0–12，且早子晚子分列两端', () => {
    const got = Array.from({ length: 24 }, (_, h) => timeIndexOf(h));
    expect(got).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  });

  it('hourOfTimeIndex 是 timeIndexOf 的逆', () => {
    for (const idx of ALL_TIME_INDEXES) {
      expect(timeIndexOf(hourOfTimeIndex(idx))).toBe(idx);
    }
  });

  it('越界输入抛错而非静默取模', () => {
    expect(() => timeIndexOf(24)).toThrow();
    expect(() => timeIndexOf(-1)).toThrow();
    expect(() => hourOfTimeIndex(13)).toThrow();
  });
});

describe('排盘锚点', () => {
  const chart = castZiWei(ANCHOR);

  it('命宫、五行局、命主身主与上游一致', () => {
    expect(chart.soulBranch).toBe('午');
    expect(chart.fiveElementsClass).toBe('木三局');
    expect(chart.soul).toBe('破军');
    expect(chart.body).toBe('文昌');
    expect(chart.timeLabel).toBe('寅时');
  });

  it('十二宫齐全且命宫坐紫微', () => {
    expect(chart.palaces).toHaveLength(12);
    const soul = palaceOf(chart, '命宫');
    expect(soul?.majorStars.map((s) => s.name)).toContain('紫微');
    expect(soul?.earthlyBranch).toBe('午');
  });

  it('三方四正为本宫、对宫、财帛位、官禄位共四宫', () => {
    const sur = surroundingOf(chart, '命宫');
    expect(sur).toHaveLength(4);
    expect(sur.map((p) => p.name)).toContain('命宫');
    // 对宫为迁移
    expect(sur.map((p) => p.name)).toContain('迁移');
  });

  it('精度为四柱全、无保留意见', () => {
    expect(chart.precision).toBe('四柱全');
    expect(chart.confidence.level).toBe('高');
    expect(chart.caveats).toEqual([]);
  });
});

describe('配置钉死', () => {
  it('上游全局配置被改写后，本包结果不变', () => {
    const before = castZiWei(ANCHOR);
    // 模拟同进程内其它代码（或上游自身）污染全局配置
    (astro as unknown as { config: (c: Record<string, string>) => void }).config({
      yearDivide: 'normal',
      horoscopeDivide: 'normal',
      dayDivide: 'current',
      ageDivide: 'birthday',
      algorithm: 'default',
    });
    const after = castZiWei(ANCHOR);
    expect(after.chineseDate).toBe(before.chineseDate);
    expect(after.fiveElementsClass).toBe(before.fiveElementsClass);
    expect(after.soulBranch).toBe(before.soulBranch);
  });
});

describe('立春年界分歧', () => {
  // 2000 年立春：2000-02-04 20:40:24
  it('生于立春当日、立春时刻之前者必须被告知', () => {
    const c = castZiWei({ gender: '男', year: 2000, month: 2, day: 4, hour: 11 });
    expect(c.caveats.join('')).toContain('立春');
    expect(c.caveats.join('')).toContain('1999');
    expect(c.caveats.join('')).toContain('2000');
  });

  it('同日立春时刻之后无分歧', () => {
    const c = castZiWei({ gender: '男', year: 2000, month: 2, day: 4, hour: 21 });
    expect(c.caveats).toEqual([]);
  });

  it('立春前一日与后一日均无分歧', () => {
    expect(castZiWei({ gender: '男', year: 2000, month: 2, day: 3, hour: 11 }).caveats).toEqual([]);
    expect(castZiWei({ gender: '男', year: 2000, month: 2, day: 5, hour: 11 }).caveats).toEqual([]);
  });

  it('分歧窗口逐年成立（1990 / 2024）', () => {
    expect(liChunCaveat(1990, 2, 4, 0, 30)).toHaveLength(1);
    expect(liChunCaveat(1990, 2, 4, 23, 0)).toHaveLength(0);
    expect(liChunCaveat(2024, 2, 4, 0, 30)).toHaveLength(1);
    expect(liChunCaveat(2024, 2, 4, 23, 0)).toHaveLength(0);
  });

  it('非一二月一律无此分歧', () => {
    expect(liChunCaveat(2000, 8, 16, 3, 0)).toHaveLength(0);
  });
});

describe('残缺输入', () => {
  it('缺时辰不排单盘，改走定盘', () => {
    const input: BirthInput = { gender: '女', year: 2000, month: 8, day: 16 };
    expect(ziWeiPrecisionOf(input)).toBe('时辰待定');
    expect(() => castZiWei(input)).toThrow(/定盘/);
  });

  it('缺日则命盘不成立，两条路径都拒绝', () => {
    const input: BirthInput = { gender: '女', year: 2000, month: 8 };
    expect(ziWeiPrecisionOf(input)).toBe('无法起盘');
    expect(() => castZiWei(input)).toThrow(/无从起盘/);
    expect(() => castZiWeiCandidates(input)).toThrow(/无从起盘/);
  });

  it('时辰已知时不得走定盘', () => {
    expect(() => castZiWeiCandidates(ANCHOR)).toThrow(/无须定盘/);
  });
});

describe('定盘候选', () => {
  const set = castZiWeiCandidates({ gender: '女', year: 2000, month: 8, day: 16 });

  it('十三张候选盘，含早子与晚子', () => {
    expect(set.candidates).toHaveLength(13);
    expect(set.candidates.map((c) => c.timeIndex)).toEqual([...ALL_TIME_INDEXES]);
    expect(set.candidates[0]!.timeLabel).toBe('早子时');
    expect(set.candidates[12]!.timeLabel).toBe('晚子时');
  });

  it('早子与晚子是两张不同的盘（晚子进日）', () => {
    const early = set.candidates[0]!;
    const late = set.candidates[12]!;
    expect(late.chineseDate).not.toBe(early.chineseDate);
  });

  it('按命宫地支归组，组数少于十三且多于一', () => {
    expect(set.groups.length).toBeGreaterThan(1);
    expect(set.groups.length).toBeLessThan(13);
    const total = set.groups.reduce((n, g) => n + g.timeIndexes.length, 0);
    expect(total).toBe(13);
  });

  it('每张候选盘都自带「未定盘不可单取」的保留意见与低置信度', () => {
    for (const c of set.candidates) {
      expect(c.precision).toBe('时辰待定');
      expect(c.confidence.factor).toBeLessThan(0.5);
      expect(c.caveats.join('')).toContain('候选');
    }
  });
});

describe('运限', () => {
  const chart = castZiWei(ANCHOR);

  it('流年干支与 core-bazi 的流年干支一致（跨包不变量）', () => {
    for (const year of [2020, 2024, 2026, 2033]) {
      expect(horoscopeAt(chart, year).yearly.ganZhi).toBe(liuNianGanZhi(year));
    }
  });

  it('大限区间覆盖该年虚岁', () => {
    const h = horoscopeAt(chart, 2026);
    expect(h.nominalAge).toBe(2026 - 2000 + 1);
    const soul = palaceOf(chart, '命宫')!;
    // 该年所在大限必为十二宫之一的 decadal 区间
    const hit = chart.palaces.some(
      (p) => h.nominalAge >= p.decadal.range[0] && h.nominalAge <= p.decadal.range[1],
    );
    expect(hit).toBe(true);
    expect(soul.decadal.range[0]).toBeGreaterThan(0);
  });

  it('四化各层皆为四颗星，且指向本命盘的某一宫', () => {
    const h = horoscopeAt(chart, 2026);
    for (const layer of [h.decadal, h.yearly]) {
      expect(layer.mutagenStars).toHaveLength(4);
      expect(layer.palaceIndex).toBeGreaterThanOrEqual(0);
      expect(layer.palaceIndex).toBeLessThan(12);
      expect(layer.natalPalaceName).not.toBe('—');
    }
  });

  it('候选盘同样可取运限（定盘时需逐张比对）', () => {
    const set = castZiWeiCandidates({ gender: '女', year: 2000, month: 8, day: 16 });
    const h = horoscopeAt(set.candidates[5]!, 2026);
    expect(h.yearly.ganZhi).toBe(liuNianGanZhi(2026));
  });
});

describe('农历输入', () => {
  it('农历与其对应公历排出同一张盘', () => {
    const solar = castZiWei({ gender: '女', year: 2000, month: 8, day: 16, hour: 3 });
    const lunar = castZiWei({
      gender: '女',
      calendar: '农历',
      year: 2000,
      month: 7,
      day: 17,
      hour: 3,
    });
    expect(lunar.solarDate).toBe(solar.solarDate);
    expect(lunar.soulBranch).toBe(solar.soulBranch);
  });
});
