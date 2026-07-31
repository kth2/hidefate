import { describe, expect, it } from 'vitest';
import { hongLuanOf, shenShaHits, shenShaOf, taoHuaOf, tianXiOf, yiMaOf } from './shenSha.js';

describe('驿马 —— 三合局长生之冲', () => {
  it.each([
    ['寅', '申'], ['午', '申'], ['戌', '申'],
    ['申', '寅'], ['子', '寅'], ['辰', '寅'],
    ['巳', '亥'], ['酉', '亥'], ['丑', '亥'],
    ['亥', '巳'], ['卯', '巳'], ['未', '巳'],
  ])('%s 年马在 %s', (year, ma) => {
    expect(yiMaOf(year)).toBe(ma);
  });

  it('驿马恒与本组三合首字相冲', () => {
    // 寅午戌合火，首字寅，冲申
    expect(yiMaOf('午')).toBe('申');
    expect(yiMaOf('子')).toBe('寅');
  });
});

describe('桃花（咸池）—— 三合局沐浴位', () => {
  it.each([
    ['寅', '卯'], ['午', '卯'], ['戌', '卯'],
    ['申', '酉'], ['子', '酉'], ['辰', '酉'],
    ['巳', '午'], ['酉', '午'], ['丑', '午'],
    ['亥', '子'], ['卯', '子'], ['未', '子'],
  ])('%s 年桃花在 %s', (year, th) => {
    expect(taoHuaOf(year)).toBe(th);
  });

  it('桃花必为四正之一（子午卯酉）', () => {
    for (const z of ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']) {
      expect(['子', '午', '卯', '酉']).toContain(taoHuaOf(z));
    }
  });
});

describe('红鸾与天喜', () => {
  it('自卯起子年逆行', () => {
    expect(hongLuanOf('子')).toBe('卯');
    expect(hongLuanOf('丑')).toBe('寅');
    expect(hongLuanOf('寅')).toBe('丑');
    expect(hongLuanOf('卯')).toBe('子');
    expect(hongLuanOf('午')).toBe('酉');
    expect(hongLuanOf('亥')).toBe('辰');
  });

  it('天喜恒为红鸾之对宫', () => {
    const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    for (const z of ZHI) {
      const hl = hongLuanOf(z)!;
      const tx = tianXiOf(z)!;
      expect((ZHI.indexOf(hl) + 6) % 12).toBe(ZHI.indexOf(tx));
    }
  });

  it('红鸾天喜绝不重合', () => {
    for (const z of ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']) {
      expect(hongLuanOf(z)).not.toBe(tianXiOf(z));
    }
  });
});

describe('命中判定', () => {
  it('列出在场的神煞', () => {
    // 子年：马在寅、桃花在酉、红鸾在卯、天喜在酉
    expect(shenShaOf('子')).toEqual({ yiMa: '寅', taoHua: '酉', hongLuan: '卯', tianXi: '酉' });
    expect(shenShaHits('子', ['寅', '卯']).sort()).toEqual(['红鸾', '驿马'].sort());
    expect(shenShaHits('子', ['午'])).toEqual([]);
  });

  it('非法地支返回 null 而不是猜一个', () => {
    expect(yiMaOf('X')).toBeNull();
    expect(hongLuanOf('')).toBeNull();
  });
});
