import { describe, expect, it } from 'vitest';
import { analyse, synthesise, type SynthesisResult } from '@hidefate/core-synthesis';
import { SAMPLE_MEMBERS, SAMPLE_PROFILE, sampleInput } from '../../../packages/core-synthesis/src/fixtures';
import { findingRefs, sortByProbability } from './findings';
import {
  SYMPTOM_CATEGORIES,
  categoryById,
  cureCost,
  findingsForCategory,
  lowestCostCure,
  missingInputs,
} from './symptoms';

const input = sampleInput(2026);
const result: SynthesisResult = analyse(input, synthesise(input));
const refs = findingRefs(result);

/**
 * 症状入口是**筛选与排序**，不是新的推断层。
 * 这些断言主要守两件事：筛出来的确实属于该维度，以及排序用的是引擎已有的概率。
 */
describe('症状类别到风险维度的对照', () => {
  it('五个类别齐备，且各自有对应维度', () => {
    expect(SYMPTOM_CATEGORIES.map((c) => c.id)).toEqual([
      'health',
      'family',
      'wealth',
      'career',
      'sleep',
    ]);
    for (const c of SYMPTOM_CATEGORIES) {
      expect(c.domains.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(1);
      expect(c.hint.length).toBeGreaterThan(1);
    }
  });

  it('四大类别分别覆盖 健康／感情／财运／事业', () => {
    expect(categoryById('health')!.domains).toContain('健康');
    expect(categoryById('family')!.domains).toContain('感情');
    expect(categoryById('wealth')!.domains).toContain('财运');
    expect(categoryById('career')!.domains).toContain('事业');
  });

  it('未知类别返回 null，由页面给出提示而不是崩', () => {
    expect(categoryById('nope')).toBeNull();
  });
});

describe('按类别筛选与排序', () => {
  it('筛出来的每一条都确实属于该类别的维度', () => {
    for (const cat of SYMPTOM_CATEGORIES) {
      for (const r of findingsForCategory(refs, cat)) {
        expect(r.finding.domains.some((d) => cat.domains.includes(d))).toBe(true);
      }
    }
  });

  it('排序与既有概率模型一致（不另立评分）', () => {
    const cat = categoryById('health')!;
    const got = findingsForCategory(refs, cat);
    expect(got.map((r) => r.id)).toEqual(sortByProbability(got).map((r) => r.id));
  });

  it('「睡不好」只看睡卧之处 —— 与「生病」同为健康维度，但范围更窄', () => {
    const sleep = findingsForCategory(refs, categoryById('sleep')!);
    const health = findingsForCategory(refs, categoryById('health')!);
    expect(sleep.length).toBeLessThanOrEqual(health.length);
    for (const r of sleep) {
      expect(r.roomKinds.some((k) => ['主卧', '次卧', '儿童房', '老人房', '客房'].includes(k))).toBe(true);
    }
  });

  it('不引入新数字：概率一律来自 predictions，取不到就是 null', () => {
    for (const r of refs) {
      if (r.probability == null) continue;
      expect(result.predictions.some((p) => p.probability === r.probability)).toBe(true);
    }
  });
});

describe('「今天就能做」挑的是成本最低的一条', () => {
  it('挪开／清理这类不动工的排在摆件与改建之前', () => {
    const move = { action: '把床头移开此方', urgency: '本年内', priority: 2, avoid: [] } as never;
    const place = { action: '于此方摆放六帝钱', urgency: '本年内', priority: 1, avoid: [] } as never;
    const build = { action: '改门向或封窗', urgency: '立即', priority: 1, avoid: [] } as never;
    expect(cureCost(move)).toBeLessThan(cureCost(place));
    expect(cureCost(place)).toBeLessThan(cureCost(build));
  });

  it('从候选断语的化解里选，且选中的那条确实成本最低', () => {
    const top3 = findingsForCategory(refs, categoryById('health')!).slice(0, 3);
    const picked = lowestCostCure(top3);
    if (!picked) return; // 该盘此维度无化解时跳过
    const all = top3.flatMap((r) => r.cures);
    expect(all).toContain(picked.cure);
    expect(picked.cost).toBe(Math.min(...all.map(cureCost)));
  });

  it('没有化解可选时返回 null，而不是硬凑一条', () => {
    expect(lowestCostCure([])).toBeNull();
  });
});

describe('没有断语时说清楚缺什么，绝不给空状态', () => {
  it('还没建房时，第一件缺的就是坐向，并指向建房那一步', () => {
    const m = missingInputs(null, [], categoryById('health')!);
    expect(m.length).toBeGreaterThan(0);
    expect(m[0]!.href).toBe('/new');
  });

  it('没有成员时提示补生年与性别，并说明为什么够用', () => {
    const m = missingInputs(result, [], categoryById('family')!);
    const item = m.find((x) => x.href === '/members');
    expect(item).toBeDefined();
    expect(item!.why).toContain('命卦');
  });

  it('没标卧房时，「睡不好」会专门指出这一点', () => {
    const noBed = analyse(
      { ...input, profile: { ...SAMPLE_PROFILE, rooms: [SAMPLE_PROFILE.rooms[0]!] } },
      synthesise({ ...input, profile: { ...SAMPLE_PROFILE, rooms: [SAMPLE_PROFILE.rooms[0]!] } }),
    );
    const m = missingInputs(noBed, SAMPLE_MEMBERS, categoryById('sleep')!);
    expect(m.some((x) => x.href === '/rooms' && x.what.includes('睡卧'))).toBe(true);
  });

  it('未填外部环境时提示补峦头 —— 「峦头为体，理气为用」', () => {
    const m = missingInputs(result, SAMPLE_MEMBERS, categoryById('wealth')!);
    expect(m.some((x) => x.what.includes('峦头'))).toBe(true);
  });

  it('每一条都同时给出「为什么」与「去哪补」，不留死路', () => {
    for (const cat of SYMPTOM_CATEGORIES) {
      for (const m of missingInputs(result, [], cat)) {
        expect(m.why.length).toBeGreaterThan(8);
        expect(m.href.startsWith('/')).toBe(true);
        expect(m.cta.length).toBeGreaterThan(1);
      }
    }
  });
});
