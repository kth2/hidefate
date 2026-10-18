/**
 * README 规则 8 的守卫：任何面向使用者的输出都不得出现病名。
 *
 * 做法是把整条输出链（合参、预测、个人视图、吉位、预警、行动卡、事件模板、象意字典、
 * 术语表、九星与组合元数据）序列化后过一遍病名词表。
 * 古籍引文须逐字保留，故剔除：`classic` / `classical` 两个字段整段，
 * 以及 `principle` / `basis`（依据栏）里「」内的原文。断语正文（statement、headline、
 * 化解、白话）里即使加了引号也照查 —— 对客户说「罹死亡」，加了引号也是在吓人。
 */
import { describe, expect, it } from 'vitest';
import {
  COMBINATIONS,
  MOUNTAINS,
  STAR_META,
  YOU_NIAN_META,
  findDiseaseTerms,
} from '@hidefate/core-fengshui';
import {
  analyse,
  buildActionPlan,
  buildAlerts,
  buildPersonView,
  findOpportunities,
  synthesise,
} from '@hidefate/core-synthesis';
import { sampleInput } from '../../../packages/core-synthesis/src/fixtures';
import { EVENT_TEMPLATES, GLOSSARY } from '@hidefate/core-events';
import { MING_LAYER_DICTIONARY, buildBaseDictionary } from '@hidefate/core-xiangyi';

const QUOTE_KEYS = new Set(['classic', 'classical']);

const BASIS_KEYS = new Set(['principle', 'basis']);
const stripQuotes = (t: string) => t.replace(/「[^」]*」/g, '「」');

function userFacingText(value: unknown): string {
  return JSON.stringify(value, (k, v) => {
    if (QUOTE_KEYS.has(k)) return undefined;
    if (BASIS_KEYS.has(k)) return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? stripQuotes(x) : x)) : typeof v === 'string' ? stripQuotes(v) : v;
    return v;
  });
}

function expectClean(label: string, value: unknown) {
  const hits = findDiseaseTerms(userFacingText(value));
  expect(hits, `${label} 含病名：${hits.join('、')}`).toEqual([]);
}

describe('病名不得进入使用者可见的输出', () => {
  it('静态知识库：九星、组合、八宅游年、事件模板、术语表、象意字典', () => {
    expectClean('STAR_META', STAR_META);
    expectClean('COMBINATIONS', COMBINATIONS);
    expectClean('YOU_NIAN_META', YOU_NIAN_META);
    expectClean('EVENT_TEMPLATES', EVENT_TEMPLATES);
    expectClean('GLOSSARY', GLOSSARY);
    expectClean('MING_LAYER_DICTIONARY', MING_LAYER_DICTIONARY);
    expectClean('buildBaseDictionary', buildBaseDictionary());
  });

  it('合参全链：二十四山 × 八运／九运宅 × 两个看盘年', () => {
    for (const m of MOUNTAINS) {
      for (const moveInYear of [2010, 2025]) {
        for (const year of [2026, 2027]) {
          const base = sampleInput(year);
          const input = { ...base, profile: { ...base.profile, sitting: m.center, moveInYear } };
          const s = analyse(input, synthesise(input));
          const label = `${m.name}山 ${moveInYear} 入住 ${year} 年`;
          expectClean(`${label} 合参`, s);
          expectClean(`${label} 行动卡`, buildActionPlan(s));
          expectClean(`${label} 吉位`, findOpportunities(s, input.members));
          for (const mem of input.members) expectClean(`${label} ${mem.name}`, buildPersonView(s, input.members, mem.id));
        }
      }
      const base = sampleInput(2026);
      expectClean(`${m.name}山 预警`, buildAlerts({ ...base, profile: { ...base.profile, sitting: m.center } }, 2026, 1, 12));
    }
  });
});
