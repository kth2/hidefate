import { describe, expect, it } from 'vitest';
import {
  EVENT_TEMPLATES,
  isKnownToken,
  maxReachableLayers,
  matchTemplate,
  predictEvents,
  predictYear,
  type EventTemplate,
  type EventToken,
} from './index.js';

const t = (token: string, layer: EventToken['layer']): EventToken => ({ token, layer });

describe('模板表质量', () => {
  it('id 唯一', () => {
    const ids = EVENT_TEMPLATES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('事件名必须是具体的人话，不是取象范畴', () => {
    for (const e of EVENT_TEMPLATES) {
      expect(e.title.length).toBeGreaterThan(5);
      // 「有变动」「有起伏」这类空话不该出现在事件名里
      expect(e.title).not.toMatch(/有变动|有起伏|有波动|不太顺/);
    }
  });

  it('每条都有可判定的结算标准，且带窗口占位', () => {
    for (const e of EVENT_TEMPLATES) {
      expect(e.criterion).toContain('{窗口}');
      expect(e.criterion.length).toBeGreaterThan(20);
    }
  });

  it('凶事一律给提前量 —— 只报忧不给对策没有意义', () => {
    for (const e of EVENT_TEMPLATES.filter((x) => x.valence === '凶')) {
      expect(e.advice.length).toBeGreaterThan(10);
    }
  });

  it('涉身体、官非、意外者门槛不低于两层', () => {
    for (const e of EVENT_TEMPLATES) {
      if (e.domain === '健康' || e.domain === '官非' || e.domain === '意外') {
        expect(e.minResonance).toBeGreaterThanOrEqual(2);
      }
    }
  });

  /**
   * 可达性锁 —— 本项目被同类 bug 咬过一次（紫微「府相朝垣」的宫位条件写反，
   * 1152 张盘命中 0 次，死得毫无声息）。这里从两头堵：
   *   1. 模板里出现的每个 token，都得真有某一层会发出来
   *   2. 候选 token 能凑出的层数，不得少于该模板要求的共振门槛
   */
  it('模板里不得出现任何一层都发不出来的 token', () => {
    const dead: string[] = [];
    for (const e of EVENT_TEMPLATES) {
      for (const tk of [...(e.allOf ?? []), ...(e.anyOf ?? []), ...(e.noneOf ?? [])]) {
        if (!isKnownToken(tk)) dead.push(`${e.id} → ${tk}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it('每条模板的共振门槛都够得着 —— 不留死规则', () => {
    const unreachable: string[] = [];
    for (const e of EVENT_TEMPLATES) {
      const cands = [...(e.allOf ?? []), ...(e.anyOf ?? [])];
      const max = maxReachableLayers(cands);
      if (max < e.minResonance) {
        unreachable.push(`${e.id} 需 ${e.minResonance} 层，候选最多凑出 ${max} 层`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('先验一律落在 0–1', () => {
    for (const e of EVENT_TEMPLATES) {
      expect(e.prior).toBeGreaterThan(0);
      expect(e.prior).toBeLessThan(1);
    }
  });
});

describe('制化否决：先看有没有救', () => {
  const layoff = EVENT_TEMPLATES.find((e) => e.id === 'career.layoff')!;

  it('七杀 + 五黄 → 裁员之象成立', () => {
    const r = matchTemplate(layoff, [t('七杀', '命'), t('五黄', '风水')]);
    expect(r.ok).toBe(true);
    expect(r.matched).toContain('七杀');
    expect(r.matched).toContain('五黄');
  });

  it('见食神制杀 → 整条不成立，而不是打个折', () => {
    const r = matchTemplate(layoff, [t('七杀', '命'), t('五黄', '风水'), t('食神', '运')]);
    expect(r.ok).toBe(false);
    expect(r.vetoedBy).toBe('食神');
    expect(r.reason).toContain('有制');
  });

  it('见正印化杀同样否决', () => {
    expect(matchTemplate(layoff, [t('七杀', '命'), t('五黄', '风水'), t('正印', '运')]).ok).toBe(false);
  });

  it('缺必要条件时说清缺什么', () => {
    const r = matchTemplate(layoff, [t('五黄', '风水')]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('七杀');
  });

  it('择一条件一个都没命中也不成立', () => {
    const r = matchTemplate(layoff, [t('七杀', '命')]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('择一');
  });
});

describe('共振门槛', () => {
  it('单层不足以断裁员', () => {
    const e = predictEvents({ year: 2027, monthIndex: 3, tokens: [t('七杀', '命'), t('五黄', '命')] });
    expect(e.find((x) => x.templateId === 'career.layoff')).toBeUndefined();
  });

  it('月级事件须年月并临：两路运层信号同时到位才成立', () => {
    const e = predictEvents({
      year: 2027,
      monthIndex: 3,
      tokens: [t('七杀', '命'), t('七杀', '运'), t('五黄', '运')],
    });
    const layoff = e.find((x) => x.templateId === 'career.layoff')!;
    expect(layoff).toBeDefined();
    expect(layoff.whenLabel).toBe('2027 年 4–5 月');
  });

  /**
   * 基准率问题：流月十神每年必然轮遍一圈，「今年某月是偏财月」的概率是 1.0。
   * 以它单独作触发，同一条事件会连报十年 —— 实跑界面时正是如此。
   */
  it('只有一路运层信号时，月级事件不出报', () => {
    const e = predictEvents({
      year: 2027,
      monthIndex: 3,
      tokens: [t('七杀', '命'), t('五黄', '风水'), t('七杀', '运')],
    });
    expect(e.find((x) => x.templateId === 'career.layoff')).toBeUndefined();
  });

  /**
   * 没有触发就没有时点。
   *
   * 大运十神十年不变、宅飞星整段常量 —— 只靠这两层，同一条事件会年年成立，
   * 「今年可能发横财」连报十年，信号被自己稀释光。实跑界面时看到的。
   */
  it('只有命层与风水层、无运层参与时不出报 —— 没有触发就没有时点', () => {
    const e = predictEvents({ year: 2027, monthIndex: 3, tokens: [t('七杀', '命'), t('五黄', '风水')] });
    expect(e.find((x) => x.templateId === 'career.layoff')).toBeUndefined();
  });

  it('年级事件只需一路运层信号 —— 年级本来就不承诺月的精度', () => {
    const e = predictEvents({ year: 2027, tokens: [t('破军', '命'), t('七赤', '运')] });
    expect(e.find((x) => x.templateId === 'wealth.bigspend')).toBeDefined();
  });

  /**
   * 共振只由**命中的** token 贡献层 —— 在场但与本事件无关的 token 不算数。
   * 否则随便一个风水 token 就能把所有事件的共振抬上去。
   */
  it('健康类需三层，且只有命中的 token 算数', () => {
    const two = predictEvents({ year: 2027, tokens: [t('七杀', '命'), t('破军', '运')] });
    expect(two.find((x) => x.templateId === 'health.surgery')).toBeUndefined();
    const three = predictEvents({
      year: 2027,
      tokens: [t('七杀', '命'), t('破军', '运'), t('五黄', '风水')],
    });
    expect(three.find((x) => x.templateId === 'health.surgery')).toBeDefined();
  });
});

describe('时间精度', () => {
  it('月级模板在没给月份时不出报 —— 不把月级事件摊成一整年', () => {
    const e = predictEvents({ year: 2027, tokens: [t('七杀', '命'), t('五黄', '运'), t('破军', '风水')] });
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((x) => x.granularity === '年')).toBe(true);
  });

  it('给了月份才出月级事件，且时间说法是人话', () => {
    const e = predictEvents({
      year: 2027,
      monthIndex: 7,
      tokens: [t('偏财', '命'), t('偏财', '运'), t('八白', '运')],
    });
    const w = e.find((x) => x.templateId === 'wealth.windfall')!;
    expect(w.whenLabel).toBe('2027 年 8–9 月');
    expect(w.criterion).toContain('2027 年 8–9 月');
  });
});

describe('用户举的三个例子都能出得来', () => {
  it('工作上遇裁员', () => {
    const e = predictEvents({
      year: 2027,
      monthIndex: 3,
      tokens: [t('七杀', '命'), t('七杀', '运'), t('五黄', '运')],
    });
    expect(e.map((x) => x.title)).toContain('工作上遇裁员、被动调岗或降职');
  });

  it('今年遇到爱情对象', () => {
    const e = predictEvents({
      year: 2027,
      monthIndex: 5,
      tokens: [t('红鸾', '运'), t('桃花', '运'), t('贪狼', '命')],
    });
    expect(e.map((x) => x.title)).toContain('遇到新的感情对象或确定关系');
  });

  it('八月发横财', () => {
    const e = predictEvents({
      year: 2027,
      monthIndex: 7,
      tokens: [t('偏财', '命'), t('偏财', '运'), t('八白', '运')],
    });
    const w = e.find((x) => x.title.includes('计划外的进账'))!;
    expect(w.whenLabel).toContain('8–9 月');
  });
});

describe('全年汇总', () => {
  it('同一模板在多个月成立时只留概率最高的那个月', () => {
    const yearTokens = [t('偏财', '命')];
    const monthTokens = (m: number): EventToken[] =>
      m === 3 || m === 7 ? [t('偏财', '运'), t('八白', '运')] : [];
    const evts = predictYear(2027, yearTokens, monthTokens);
    const windfall = evts.filter((e) => e.templateId === 'wealth.windfall');
    expect(windfall).toHaveLength(1);
  });

  it('输出稳定可重放', () => {
    const a = predictYear(2027, [t('七杀', '命')], () => [t('七杀', '运'), t('五黄', '运')]);
    const b = predictYear(2027, [t('七杀', '命')], () => [t('七杀', '运'), t('五黄', '运')]);
    expect(a.map((x) => x.templateId)).toEqual(b.map((x) => x.templateId));
  });
});

describe('概率', () => {
  it('恒在 3%–92% 之间', () => {
    const fake: EventTemplate = { ...EVENT_TEMPLATES[0]!, prior: 0.99, minResonance: 1 };
    const e = predictEvents(
      { year: 2027, monthIndex: 1, tokens: [t('七杀', '命'), t('七杀', '运'), t('五黄', '运'), t('二黑', '风水')] },
      { templates: [fake] },
    );
    for (const x of e) {
      expect(x.probability).toBeGreaterThanOrEqual(0.03);
      expect(x.probability).toBeLessThanOrEqual(0.92);
    }
  });

  it('三层共振高于两层', () => {
    const two = predictEvents({
      year: 2027,
      monthIndex: 3,
      tokens: [t('七杀', '命'), t('七杀', '运'), t('五黄', '运')],
    }).find((x) => x.templateId === 'career.layoff')!;
    const three = predictEvents({
      year: 2027,
      monthIndex: 3,
      tokens: [t('七杀', '命'), t('七杀', '运'), t('五黄', '运'), t('二黑', '风水')],
    }).find((x) => x.templateId === 'career.layoff')!;
    expect(three.probability).toBeGreaterThan(two.probability);
  });
});
