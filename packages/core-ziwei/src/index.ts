/**
 * @hidefate/core-ziwei —— 紫微斗数排盘与格局。
 *
 * 安星引擎用 npm 上的 [`iztro`](https://github.com/SylarLong/iztro)。
 * 说明一句由来：kth2/bazi-app 用的 `dart_iztro` 正是 iztro 的 Dart 移植，
 * 因此本包不是「把 Dart 翻成 TS」，而是**回到上游原生实现**。
 *
 * 本包只做四件事，一律不碰安星算法：
 *   1. 输入归一（农历 → 公历、真太阳时、时辰索引）
 *   2. 配置钉死并逐次显式传入，保证确定性重放
 *   3. 结果投影为只读、可序列化的纯数据（供 Dexie 存储与账本哈希）
 *   4. 分歧与残缺一律显式报出（caveats / 定盘候选），绝不假设
 *
 * 格局判定（patterns.ts）是本项目自己的一层，iztro 不提供。
 */

export * from './types.js';
export * from './cast.js';
export * from './patterns.js';
