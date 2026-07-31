/**
 * @hidefate/core-ledger —— 预测账本：冻结、结算、重放校验、校准。
 *
 * 账本是对轨回路的地基。没有它：
 *   - 「③ 比对偏差」比的是两个不同的模型
 *   - 「⑦ 修正信心」修的是被事后记忆污染过的印象
 *
 * 四条守卫全部在**写入期**执行（`freezePrediction`）：
 *   1. 只增不改 —— 记录深冻，结算产出新记录而非改旧的
 *   2. 无判据不受理 —— 不可证伪的措辞在写入期就被拒
 *   3. 必带 engineVersion 与 inputHash —— 否则日后无从重放
 *   4. 基准率缺失须显式 null —— 不许零信息的预测冒充有效预测
 *
 * 纯函数、无 I/O、无随机、无时钟：id 与时刻一律由调用方传入，
 * 以保证同输入同输出、可重放。持久化（Dexie）在 apps/web 一侧。
 */

export * from './types.js';
export * from './record.js';
export * from './integrity.js';
export * from './calibration.js';
