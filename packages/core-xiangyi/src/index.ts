/**
 * @hidefate/core-xiangyi —— 象意字典与个人后验。
 *
 * 这一层要解决的问题：古法给的是一串候选象（七杀 → 开刀／竞争／官非／武职／刚烈），
 * 经典没错，但对具体这个人只有其中一两条会显化。
 * 用户填入真实经历不是给系统打分，是告诉系统「我这颗七杀走的是哪一条道」。
 *
 * 字典分两半，泾渭分明：
 *   - `XiangYi`        古法候选与先验 —— **永不参与学习**
 *   - `XiangPosterior` 某人在某条象意上的后验 —— **唯一随用户数据变化的东西**
 *
 * 三层来源各有其道：
 *   - 命层  手写词条（`dictionary.ts`），八字十神 + 紫微主星
 *   - 风水层 由 core-fengshui 的 STAR_META / YOU_NIAN_META **推导生成**，不手写第二遍
 *   - 运层  由 core-qimen 的 23 条占类规则**转出**（调用方传入，本包不依赖 vendor 引擎）
 *
 * 纯函数、无 I/O、无网络。设计依据见 docs/ROADMAP.md §4 与 §7。
 */

export * from './types.js';
export * from './dictionary.js';
export * from './fromFengShui.js';
export * from './fromQiMen.js';
export * from './posterior.js';
export * from './resonance.js';

import { MING_LAYER_DICTIONARY } from './dictionary.js';
import { buildFengShuiDictionary } from './fromFengShui.js';
import type { XiangYi } from './types.js';

/**
 * 不依赖外部输入即可得到的词条全集（命层 + 风水层）。
 *
 * 运层需要 core-qimen 载入引擎后把规则传进 `buildQiMenDictionary()`，
 * 故不在此处 —— 本包保持同步、纯查表、零副作用。
 */
export function buildBaseDictionary(): XiangYi[] {
  return [...MING_LAYER_DICTIONARY, ...buildFengShuiDictionary()];
}
