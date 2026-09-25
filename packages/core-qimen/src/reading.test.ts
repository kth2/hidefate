/**
 * 断局 —— 行为锁。
 *
 * 守住的是：起局后要有结论（倾向、开始过程结局、理由、怎么做、应期），
 * 而且结论只由盘上已有的东西推出：用神宫吉凶、用神与年命的生克、三乙、空亡马星。
 */

import { describe, expect, it } from 'vitest';
import { castDivination, suggestCategory, type Divination } from './divination.js';
import { readDivination } from './reading.js';

const RES = { criterion: '三十天内是否实现，以书面结果为准', judge: '用户自评' as const, windowDays: 30 };

async function cast(question: string, extra: Record<string, unknown> = {}): Promise<Divination> {
  return castDivination({ question, resolution: RES, ...extra }, { openDivinations: [] });
}

/** 把用神宫与年命宫、三乙改成指定的情形，其余照原盘。 */
function variant(d: Divination, opts: { yongScore: number; yongGong: string; mingGong: string; kong?: boolean; ma?: boolean; phaseScore?: number }): Divination {
  const yong = d.yongShen[0]!;
  return {
    ...d,
    yongShen: [{ ...yong, gong: opts.yongGong }, ...d.yongShen.slice(1)],
    sanYi: { ...d.sanYi, nianMingGong: opts.mingGong, tianYi: '2', taiYi: '3', diYi: '4' },
    palaces: d.palaces.map((p) => {
      if (p.gong === opts.yongGong) return { ...p, score: opts.yongScore, kongWang: opts.kong ?? false, maStar: opts.ma ?? false };
      if (['2', '3', '4'].includes(p.gong)) return { ...p, score: opts.phaseScore ?? 0 };
      return p;
    }),
  };
}

describe('日常说法也能起局', () => {
  it('补充关键词：换工作、面试归功名，投资归求财，复合归婚姻', () => {
    expect(suggestCategory('这次换工作能成吗')?.category).toBe('功名');
    expect(suggestCategory('明天的面试顺利吗')?.category).toBe('功名');
    expect(suggestCategory('这笔投资值得吗')?.category).toBe('求财');
    expect(suggestCategory('我们还能复合吗')?.category).toBe('婚姻');
    expect(suggestCategory('今天天气')).toBeNull();
  });

  it('界面自带的示例问题「这次换工作能成吗」现在起得了局，并注明按哪个词归的类', async () => {
    const d = await cast('这次换工作能成吗');
    expect(d.category).toBe('功名');
    expect(d.categoryMatched).toBe(true);
    expect(d.caveats.join('')).toContain('「工作」');
  });

  it('手动选了占类就不猜', async () => {
    const d = await cast('这次换工作能成吗', { category: '求财' });
    expect(d.category).toBe('求财');
    expect(d.caveats.join('')).not.toContain('按「功名」');
  });
});

describe('断局', () => {
  it('每一局都有结论、三段、理由、怎么做与应期', async () => {
    const d = await cast('这笔投资能赚钱吗', { nianMingGan: '壬' });
    const r = readDivination(d);
    expect(['有利', '偏有利', '难定', '偏不利', '不利']).toContain(r.tendency);
    expect(r.headline.length).toBeGreaterThan(4);
    expect(r.phases.map((p) => p.label)).toEqual(['开始', '过程', '结局']);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.advice.length).toBeGreaterThan(0);
    expect(r.timing.join('')).toContain('30 天');
    expect(r.classicNote).toBe(d.yongShenNote);
  });

  it('用神宫吉、用神生年命 → 有利；用神宫凶、用神克年命 → 不利', async () => {
    const d = await cast('明天的面试顺利吗', { nianMingGan: '壬' });
    // 坎一（水）生巽四（木）
    const good = readDivination(variant(d, { yongScore: 3, yongGong: '1', mingGong: '4', phaseScore: 2 }));
    expect(good.tendency).toBe('有利');
    expect(good.reasons.join('')).toContain('生');
    // 乾六（金）克巽四（木）
    const bad = readDivination(variant(d, { yongScore: -4, yongGong: '6', mingGong: '4', phaseScore: -2 }));
    expect(bad.tendency).toBe('不利');
    expect(bad.reasons.join('')).toContain('克');
  });

  it('求财例外：用神克年命为「财来克我」，按得财论', async () => {
    const d = await cast('这笔投资能赚钱吗', { category: '求财', nianMingGan: '壬' });
    const r = readDivination(variant(d, { yongScore: 0, yongGong: '6', mingGong: '4' }));
    expect(r.reasons.join('')).toContain('得财');
    const d2 = await cast('明天的面试顺利吗', { category: '功名', nianMingGan: '壬' });
    const r2 = readDivination(variant(d2, { yongScore: 0, yongGong: '6', mingGong: '4' }));
    expect(r2.reasons.join('')).toContain('阻力');
  });

  it('空亡把结论拉向难定并说应期后延；马星说应期提前', async () => {
    const d = await cast('明天的面试顺利吗', { nianMingGan: '壬' });
    const plain = readDivination(variant(d, { yongScore: 3, yongGong: '1', mingGong: '4' }));
    const kong = readDivination(variant(d, { yongScore: 3, yongGong: '1', mingGong: '4', kong: true }));
    const order = ['不利', '偏不利', '难定', '偏有利', '有利'];
    expect(order.indexOf(kong.tendency)).toBeLessThanOrEqual(order.indexOf(plain.tendency));
    expect(kong.timing.join('')).toContain('空亡');
    const ma = readDivination(variant(d, { yongScore: 1, yongGong: '1', mingGong: '4', ma: true }));
    expect(ma.timing.join('')).toContain('提前');
  });

  it('没有年命时明说少了最关键的一条', async () => {
    const d = await cast('明天的面试顺利吗');
    const r = readDivination({ ...d, sanYi: { ...d.sanYi, nianMingGong: '' } });
    expect(r.caveats.join('')).toContain('年命');
  });

  it('按综合断起局（无用神）时明说参考价值低', async () => {
    const d = await cast('随便问问', { allowGeneralReading: true });
    const r = readDivination({ ...d, yongShen: [] });
    expect(r.caveats.join('')).toContain('没有定位到具体用神');
  });
});
