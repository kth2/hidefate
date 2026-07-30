import { describe, expect, it } from 'vitest';
import { EIGHT_DIRECTIONS } from './compass';
import { mingGuaFindings, provisionalOutcome } from './provisional';
import { SYMPTOM_CATEGORIES } from './symptoms';

/**
 * 分诊的底线：**只问出生年也要给得出真东西**。
 *
 * 「先看结果再建档」这条路径若在某些输入下退化成空屏，它就白做了 ——
 * 用户走完三步却什么也没看到，比一开始就让他走完整向导更糟。
 */
describe('只填出生年也产出非空 Finding，且置信度诚实地低', () => {
  const out = provisionalOutcome({ birthYear: 1985, gender: '女' });

  it('Finding 非空', () => {
    expect(out.findings.length).toBeGreaterThan(0);
  });

  it('整体置信度低于 50%', () => {
    expect(out.confidence.percent).toBeLessThan(0.5);
    expect(out.confidence.level).toBe('低');
  });

  it('没有朝向就不起九宫盘，并明说这一点', () => {
    expect(out.result).toBeNull();
    expect(out.profile).toBeNull();
    expect(out.caveats.join('')).toContain('没有起九宫盘');
  });

  it('每条断语都答得出「哪几派、多确定、依据哪条古法」', () => {
    for (const f of out.findings) {
      expect(f.schools.length).toBeGreaterThan(0);
      expect(f.confidence).toBeTruthy();
      expect(f.principle.length).toBeGreaterThan(8);
      expect(f.domains.length).toBeGreaterThan(0);
    }
  });

  it('命卦八方俱全：四吉四凶各不重复', () => {
    const fs = mingGuaFindings(out.mingGua);
    expect(fs).toHaveLength(8);
    expect(new Set(fs.map((f) => f.statement)).size).toBe(8);
  });

  it('八字层面只有年柱可用这件事写在暂定假设里，不藏着', () => {
    expect(out.caveats.join('')).toContain('年柱');
  });

  it('阶梯非空 —— 分诊之后永远知道下一步该补什么', () => {
    expect(out.ladder.length).toBeGreaterThan(0);
  });
});

describe('补上朝向后升级为九宫盘', () => {
  const out = provisionalOutcome({ birthYear: 1985, gender: '女', facingEightId: 's', symptomId: 'health' });

  it('起得出盘，且断语比只有命卦时更多', () => {
    expect(out.result).not.toBeNull();
    expect(out.findings.length).toBeGreaterThan(mingGuaFindings(out.mingGua).length);
  });

  it('置信度仍然偏低，但每一处暂定假设都列了出来', () => {
    expect(out.confidence.percent).toBeLessThan(0.5);
    const joined = out.caveats.join('');
    expect(joined).toContain('八方近似');
    expect(joined).toContain('元运');
    expect(joined).toContain('公寓');
  });

  it('八方任选其一都不会炸，且都起得出盘', () => {
    for (const d of EIGHT_DIRECTIONS) {
      const o = provisionalOutcome({ birthYear: 1990, gender: '男', facingEightId: d.id });
      expect(o.result).not.toBeNull();
      expect(o.findings.length).toBeGreaterThan(0);
    }
  });

  it('无法识别的朝向 id 退回命卦层，而不是抛错', () => {
    const o = provisionalOutcome({ birthYear: 1990, gender: '男', facingEightId: 'nope' });
    expect(o.result).toBeNull();
    expect(o.findings.length).toBeGreaterThan(0);
  });

  it('分诊症状类别与首页那五项同源', () => {
    expect(SYMPTOM_CATEGORIES.some((c) => c.id === 'health')).toBe(true);
  });
});
