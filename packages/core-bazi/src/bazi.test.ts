import { describe, expect, it } from 'vitest';
import { computeMingGua, mingGuaGroup } from './mingGua.js';
import { computeBaziChart, precisionOf, trueSolarAdjust, liuNianGanZhi } from './chart.js';
import { computeElementStrength, seasonMultiplier } from './elementStrength.js';
import { CANG_GAN, DI_ZHI, TIAN_GAN, shiShen } from './tables.js';
import type { BirthInput } from './types.js';

describe('命卦', () => {
  it('公开锚点：1984 / 1990 / 2000', () => {
    expect(computeMingGua(1984, '男').gua).toBe('兑');
    expect(computeMingGua(1984, '女').gua).toBe('艮');
    expect(computeMingGua(1990, '男').gua).toBe('坎');
    expect(computeMingGua(1990, '女').gua).toBe('艮');
    expect(computeMingGua(2000, '男').gua).toBe('离');
    expect(computeMingGua(2000, '女').gua).toBe('乾');
  });

  it('五黄寄宫：男寄坤、女寄艮，结果永不为 5', () => {
    let sawMaleJi = false;
    let sawFemaleJi = false;
    for (let y = 1920; y <= 2040; y++) {
      for (const g of ['男', '女'] as const) {
        const r = computeMingGua(y, g);
        expect(r.number).not.toBe(5);
        if (r.jiGongNote) {
          if (g === '男') { expect(r.gua).toBe('坤'); sawMaleJi = true; }
          else { expect(r.gua).toBe('艮'); sawFemaleJi = true; }
        }
      }
    }
    expect(sawMaleJi).toBe(true);
    expect(sawFemaleJi).toBe(true);
  });

  it('东四西四分组与命卦数一致', () => {
    for (let y = 1950; y <= 2030; y++) {
      const r = computeMingGua(y, '男');
      expect(r.group).toBe(mingGuaGroup(r.number));
    }
  });

  it('立春前出生归上一年', () => {
    const before = computeMingGua(1990, '男', { month: 1, day: 20 });
    const after = computeMingGua(1990, '男', { month: 6, day: 20 });
    expect(before.adjustedByLiChun).toBe(true);
    expect(before.effectiveYear).toBe(1989);
    expect(after.adjustedByLiChun).toBe(false);
    expect(before.gua).not.toBe(after.gua);
  });

  it('只给年份时，推导文字提示需补月日', () => {
    expect(computeMingGua(1990, '男').derivation).toContain('立春前');
  });
});

describe('干支基础表', () => {
  it('十天干十二地支齐备', () => {
    expect(TIAN_GAN).toHaveLength(10);
    expect(DI_ZHI).toHaveLength(12);
    expect(Object.keys(CANG_GAN)).toHaveLength(12);
  });

  it('藏干本气与该支五行一致（子午卯酉等专气支）', () => {
    expect(CANG_GAN['子']).toEqual(['癸']);
    expect(CANG_GAN['卯']).toEqual(['乙']);
    expect(CANG_GAN['酉']).toEqual(['辛']);
    expect(CANG_GAN['午']).toEqual(['丁', '己']);
  });

  it('十神：甲日主对照全表', () => {
    expect(shiShen('甲', '甲')).toBe('比肩');
    expect(shiShen('甲', '乙')).toBe('劫财');
    expect(shiShen('甲', '丙')).toBe('食神');
    expect(shiShen('甲', '丁')).toBe('伤官');
    expect(shiShen('甲', '戊')).toBe('偏财');
    expect(shiShen('甲', '己')).toBe('正财');
    expect(shiShen('甲', '庚')).toBe('七杀');
    expect(shiShen('甲', '辛')).toBe('正官');
    expect(shiShen('甲', '壬')).toBe('偏印');
    expect(shiShen('甲', '癸')).toBe('正印');
  });

  it('任意日主的十神恰好覆盖十种', () => {
    for (const d of TIAN_GAN) {
      const set = new Set(TIAN_GAN.map((t) => shiShen(d, t)));
      expect(set.size).toBe(10);
    }
  });
});

describe('五行力量（对齐 bazi-app 模型）', () => {
  it('旺相休囚死系数', () => {
    expect(seasonMultiplier('木', '木')).toBe(1.4); // 旺
    expect(seasonMultiplier('火', '木')).toBe(1.2); // 相
    expect(seasonMultiplier('水', '木')).toBe(1.0); // 休
    expect(seasonMultiplier('金', '木')).toBe(0.8); // 囚
    expect(seasonMultiplier('土', '木')).toBe(0.6); // 死
    expect(seasonMultiplier('木', null)).toBe(1.0); // 无月令
  });

  it('四柱俱全时得出身强弱与喜忌', () => {
    const r = computeElementStrength([
      { position: '年柱', gan: '甲', zhi: '子' },
      { position: '月柱', gan: '丙', zhi: '寅' },
      { position: '日柱', gan: '甲', zhi: '午' },
      { position: '时柱', gan: '庚', zhi: '午' },
    ]);
    expect(r.dayMasterElement).toBe('木');
    expect(['身强', '身弱', '中和']).toContain(r.verdict);
    expect(r.favourable.length).toBeGreaterThan(0);
    const sum = Object.values(r.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('缺日柱则明确「无法判定」而非猜测', () => {
    const r = computeElementStrength([
      { position: '年柱', gan: '甲', zhi: '子' },
      { position: '月柱', gan: '丙', zhi: '寅' },
    ]);
    expect(r.verdict).toBe('无法判定');
    expect(r.dayMasterElement).toBeNull();
    expect(r.favourable).toHaveLength(0);
  });

  it('缺时柱时正常出结论并在 note 中标注', () => {
    const r = computeElementStrength([
      { position: '年柱', gan: '甲', zhi: '子' },
      { position: '月柱', gan: '丙', zhi: '寅' },
      { position: '日柱', gan: '甲', zhi: '午' },
    ]);
    expect(r.verdict).not.toBe('无法判定');
    expect(r.note).toContain('缺时柱');
  });
});

describe('八字排盘与残缺分级', () => {
  const full: BirthInput = { gender: '男', year: 1990, month: 6, day: 15, hour: 10, minute: 30 };

  it('精度判定', () => {
    expect(precisionOf({ gender: '男', year: 1990 })).toBe('仅年');
    expect(precisionOf({ gender: '男', year: 1990, month: 6 })).toBe('年月');
    expect(precisionOf({ gender: '男', year: 1990, month: 6, day: 15 })).toBe('年月日');
    expect(precisionOf(full)).toBe('四柱全');
  });

  it('四柱全：四根柱、置信度高', () => {
    const c = computeBaziChart(full);
    expect(c.pillars).toHaveLength(4);
    expect(c.confidence.level).toBe('高');
    expect(c.dayMaster).not.toBeNull();
    expect(c.pillars[2]!.ganShiShen).toBe('日主');
    expect(c.zodiac).toBe('马'); // 1990 庚午年
  });

  it('缺时柱：三柱分析，置信度标注为「中等（缺时柱）」', () => {
    const c = computeBaziChart({ gender: '男', year: 1990, month: 6, day: 15 });
    expect(c.pillars).toHaveLength(3);
    expect(c.confidence.label).toBe('中等（缺时柱）');
    expect(c.dayMaster).not.toBeNull();
    expect(c.elementStrength.verdict).not.toBe('无法判定');
    expect(c.unavailable.join('')).toContain('时柱');
  });

  it('仅年月：两柱，日主与十神明确标为不可得', () => {
    const c = computeBaziChart({ gender: '男', year: 1990, month: 6 });
    expect(c.pillars).toHaveLength(2);
    expect(c.dayMaster).toBeNull();
    expect(c.elementStrength.verdict).toBe('无法判定');
    expect(c.decades).toHaveLength(0);
  });

  it('仅年：一柱，但命卦依然完整成立', () => {
    const c = computeBaziChart({ gender: '男', year: 1990 });
    expect(c.pillars).toHaveLength(1);
    expect(c.confidence.level).toBe('低');
    expect(c.mingGua.gua).toBe('坎');
    expect(c.mingGua.group).toBe('东四命');
  });

  it('缺失部分绝不生成十神（不以缺省值冒充数据）', () => {
    const c = computeBaziChart({ gender: '女', year: 1988, month: 3 });
    for (const p of c.pillars) {
      expect(p.ganShiShen).toBeNull();
      for (const cg of p.cangGan) expect(cg.shiShen).toBeNull();
    }
  });

  it('四柱全时有大运且起运说明齐备', () => {
    const c = computeBaziChart(full);
    expect(c.decades.length).toBeGreaterThan(0);
    expect(c.qiYunNote).toContain('起运');
    expect(c.decades[0]!.ganShiShen).not.toBeNull();
  });

  it('农历输入可换算', () => {
    const c = computeBaziChart({ gender: '男', year: 1990, month: 5, day: 23, hour: 10, calendar: '农历' });
    expect(c.pillars).toHaveLength(4);
    expect(c.lunarDate).toContain('年');
  });
});

describe('真太阳时', () => {
  it('东经 120° 上（东八区中央经线）仅剩均时差', () => {
    const { deltaMinutes } = trueSolarAdjust(new Date(2000, 5, 15, 12, 0), 120, 8);
    expect(Math.abs(deltaMinutes)).toBeLessThan(20);
  });

  it('经度东偏则真太阳时提前', () => {
    const east = trueSolarAdjust(new Date(2000, 5, 15, 12, 0), 130, 8).deltaMinutes;
    const west = trueSolarAdjust(new Date(2000, 5, 15, 12, 0), 110, 8).deltaMinutes;
    expect(east).toBeGreaterThan(west);
    expect(east - west).toBeCloseTo(80, 1); // 20 经度 × 4 分钟
  });

  it('启用后 chart 会记录校正量', () => {
    const c = computeBaziChart({
      gender: '男', year: 1990, month: 6, day: 15, hour: 10,
      longitude: 101.7, useTrueSolarTime: true,
    });
    expect(c.trueSolarTime).toContain('校正');
  });
});

describe('流年', () => {
  it('流年干支', () => {
    expect(liuNianGanZhi(1984)).toBe('甲子');
    expect(liuNianGanZhi(2024)).toBe('甲辰');
    expect(liuNianGanZhi(2026)).toBe('丙午');
  });
});
