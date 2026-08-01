'use client';

/**
 * 「一生」页的白话与 AI 综述。
 *
 * 分工写死在这里，别弄反：
 *   - `buildYearNarrative()` 确定性，**不需要任何配置就能看懂** —— 这是地基
 *   - `summaryPrompt()`      把已算好的事实喂给 AI，让它写成一段连贯的话 —— 这是锦上添花
 *
 * AI 的 system 提示写死「只能引用给定事实」，与 core-synthesis 的
 * `buildAnswerContext()` 是同一条铁律（README 硬规则 1）。
 * 差别在于那边给的是宅盘，这边给的是一生轨迹。
 */

import { narrateYear, type YearNarrative } from '@hidefate/core-events';
import { lookupCombination, type PalaceIndex } from '@hidefate/core-fengshui';
import type { PalaceSnapshot, YearOutlook } from './lifeStore';

export type { YearNarrative };

/** 由一年的推演结果产出白话。 */
export function buildYearNarrative(o: YearOutlook): YearNarrative {
  return narrateYear({
    year: o.year,
    age: o.age,
    ganZhi: o.ganZhi,
    shiShen: o.shiShen,
    events: o.events,
    breakpointKinds: o.breakpoints.filter((b) => b.personal).map((b) => b.kind),
  });
}

/** 宫位的化解建议 —— 组合表里本来就有，早先没渲染出来。 */
export function curesOf(p: PalaceSnapshot): readonly string[] {
  const combo = lookupCombination(p.shan as PalaceIndex, p.xiang as PalaceIndex);
  return combo?.cures ?? [];
}

/**
 * AI 综述的提示词。
 *
 * 三段约束缺一不可：
 *   1. 只能引用给定事实 —— 不得新增事件、时间、概率、星位
 *   2. 讲人话 —— 面向完全不懂命理的人，术语出现必须当场解释
 *   3. 不作医疗断言、不作确定性承诺
 *
 * 最后一条尤其要紧：这套东西的输出会被人当真，
 * 而「一定会」和「可能会」的差别，在健康与钱的问题上是天壤之别。
 */
export function summaryPrompt(
  narratives: readonly { year: number; n: YearNarrative }[],
  personName: string,
): { system: string; user: string } {
  const system = [
    '你是一位替不懂命理的人做解读的助手。',
    '',
    '## 铁律',
    '1. **只能引用下面「事实清单」里已有的内容**：事件、时间、概率、依据、建议。',
    '   绝对不可以新增任何事件、改动任何时间或数字，也不可以发明清单里没有的星位与断语。',
    '   清单里没写的，就说「这一项没有算出结论」，而不是补一句好听的。',
    '2. **讲人话**。读者完全不懂八字、紫微、奇门、风水。',
    '   凡出现术语（七杀、五黄、流年、动气……），必须当场用一句白话解释它跟这个人有什么关系。',
    '3. **不作医疗诊断**，健康类一律表述为「留意 / 建议检查」，不得替代就医。',
    '4. **不作确定性断言**。概率就是概率，不说「一定会」「必然」「注定」。',
    '5. 不写「运势不错」「小心为上」这类空话 —— 每句话都要落到具体的事、具体的时间、具体能做什么。',
    '',
    '## 输出格式',
    '先用两三句话说清「这几年整体是什么局面」，',
    '再按年份分段，每段说：这一年最该留意什么、有什么机会、先做哪一件事。',
    '全文控制在 400 字以内，不要罗列，要像一个人在跟你说话。',
  ].join('\n');

  const user = [
    `求测人：${personName}`,
    '',
    '## 事实清单（只能引用这些）',
    ...narratives.flatMap(({ year, n }) => [`### ${year} 年`, ...n.facts.map((f) => `- ${f}`)]),
  ].join('\n');

  return { system, user };
}
