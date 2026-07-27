import { describe, expect, it } from 'vitest';
import {
  AUSPICIOUS_STARS,
  INAUSPICIOUS_STARS,
  YOU_NIAN_TABLE,
  buildBaZhaiPlate,
  buildHouseBaZhai,
  crossPersonHouse,
  guaGroup,
  invert,
  personalDirections,
  type EightGua,
} from './baZhai.js';
import { OUTER_PALACES } from './constants.js';

const ALL_GUA: EightGua[] = ['坎', '坤', '震', '巽', '乾', '兑', '艮', '离'];

describe('大游年表自洽性', () => {
  it('每卦八方恰好各得一星，无重复无遗漏', () => {
    for (const g of ALL_GUA) {
      const row = YOU_NIAN_TABLE[g];
      expect(Object.keys(row)).toHaveLength(8);
      expect(new Set(Object.values(row)).size).toBe(8);
    }
  });

  it('伏位必落本卦（自检锚点）', () => {
    for (const g of ALL_GUA) {
      expect(YOU_NIAN_TABLE[g][g]).toBe('伏位');
      expect(invert(g, '伏位')).toBe(g);
    }
  });

  it('四吉方必与本卦同组，四凶方必与本卦异组', () => {
    for (const g of ALL_GUA) {
      for (const s of AUSPICIOUS_STARS) {
        expect(guaGroup(invert(g, s))).toBe(guaGroup(g));
      }
      for (const s of INAUSPICIOUS_STARS) {
        expect(guaGroup(invert(g, s))).not.toBe(guaGroup(g));
      }
    }
  });

  it('游年关系对称：A 卦的 X 星落 B，则 B 卦的 X 星必落 A', () => {
    for (const a of ALL_GUA) {
      for (const b of ALL_GUA) {
        const star = YOU_NIAN_TABLE[a][b];
        expect(YOU_NIAN_TABLE[b][a]).toBe(star);
      }
    }
  });

  it('推导结果与公开大游年表逐卦一致（外部锚点）', () => {
    // 取自通行八宅典籍的四卦全列，用以锚定翻卦掌推导，防止规则本身写错。
    const published: Partial<Record<EightGua, Record<EightGua, string>>> = {
      坎: { 巽: '生气', 艮: '五鬼', 离: '延年', 乾: '六煞', 兑: '祸害', 震: '天医', 坤: '绝命', 坎: '伏位' },
      乾: { 兑: '生气', 震: '五鬼', 坤: '延年', 坎: '六煞', 巽: '祸害', 艮: '天医', 离: '绝命', 乾: '伏位' },
      离: { 震: '生气', 兑: '五鬼', 坎: '延年', 坤: '六煞', 艮: '祸害', 巽: '天医', 乾: '绝命', 离: '伏位' },
      坤: { 艮: '生气', 巽: '五鬼', 乾: '延年', 离: '六煞', 震: '祸害', 兑: '天医', 坎: '绝命', 坤: '伏位' },
    };
    for (const [gua, row] of Object.entries(published)) {
      for (const [target, star] of Object.entries(row!)) {
        expect(YOU_NIAN_TABLE[gua as EightGua][target as EightGua]).toBe(star);
      }
    }
  });

  it('东四西四分组正确', () => {
    expect(guaGroup('坎')).toBe('东四');
    expect(guaGroup('震')).toBe('东四');
    expect(guaGroup('巽')).toBe('东四');
    expect(guaGroup('离')).toBe('东四');
    expect(guaGroup('乾')).toBe('西四');
    expect(guaGroup('坤')).toBe('西四');
    expect(guaGroup('艮')).toBe('西四');
    expect(guaGroup('兑')).toBe('西四');
  });
});

describe('宅之八宅盘', () => {
  it('坐子（坎宫）为坎宅，属东四宅', () => {
    const h = buildHouseBaZhai('子');
    expect(h.houseGua).toBe('坎');
    expect(h.facingGua).toBe('离');
    expect(h.group).toBe('东四');
    expect(h.plate[4]).toBe('生气'); // 巽方生气
    expect(h.plate[3]).toBe('天医'); // 震方天医
    expect(h.plate[9]).toBe('延年'); // 离方延年
    expect(h.plate[1]).toBe('伏位');
    expect(h.plate[2]).toBe('绝命'); // 坤方绝命
  });

  it('坐乾（乾宫）为乾宅，属西四宅', () => {
    const h = buildHouseBaZhai('乾');
    expect(h.houseGua).toBe('乾');
    expect(h.group).toBe('西四');
    expect(h.plate[7]).toBe('生气'); // 兑
    expect(h.plate[8]).toBe('天医'); // 艮
    expect(h.plate[2]).toBe('延年'); // 坤
    expect(h.plate[9]).toBe('绝命'); // 离
  });

  it('八方齐备（中宫不入八宅论）', () => {
    const plate = buildBaZhaiPlate('离');
    expect(Object.keys(plate).map(Number).sort()).toEqual([...OUTER_PALACES].sort());
  });
});

describe('宅 × 人 交叉', () => {
  it('东四命住东四宅为宅命相配', () => {
    const cells = crossPersonHouse('坎', '巽');
    expect(Object.values(cells).every((c) => c.harmonised)).toBe(true);
  });

  it('东四命住西四宅为宅命不配', () => {
    const cells = crossPersonHouse('乾', '坎');
    expect(Object.values(cells).every((c) => c.harmonised)).toBe(false);
  });

  it('宅人双吉之方评分最高，宅人双凶之方评分最低', () => {
    const cells = crossPersonHouse('坎', '坎');
    // 同卦：巽方宅人俱得生气
    expect(cells[4].houseStar).toBe('生气');
    expect(cells[4].personStar).toBe('生气');
    expect(cells[4].verdict).toBe('大吉');
    // 坤方宅人俱得绝命
    expect(cells[2].verdict).toBe('大凶');
  });

  it('同一宫位对不同命卦可以吉凶相反', () => {
    const kan = crossPersonHouse('坎', '坎');
    const qian = crossPersonHouse('坎', '乾');
    expect(kan[4].personStar).toBe('生气');
    expect(qian[4].personStar).toBe('祸害');
  });
});

describe('个人吉凶方位', () => {
  it('每个命卦得四吉四凶方，共八方不重复', () => {
    for (const g of ALL_GUA) {
      const d = personalDirections(g);
      expect(d.best).toHaveLength(4);
      expect(d.worst).toHaveLength(4);
      const all = [...d.best, ...d.worst].map((x) => x.palace);
      expect(new Set(all).size).toBe(8);
    }
  });
});
