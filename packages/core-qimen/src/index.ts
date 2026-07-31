/**
 * @hidefate/core-qimen —— 奇门遁甲两层：山向奇门（空间）与占局（时间）。
 *
 * 引擎来自 kth2/Qimen-pwa，逐字节原样收录于 ./vendor（见该目录 README）。
 * 本包只做类型化、载入、九宫叠加与纪律约束，不改动任何奇门算法。
 *
 * 两层各归其位，不要混用：
 *   - `shanXiang.ts`   以**坐山**定局，属风水层（三），段内常量，答「这个地方如何」
 *   - `divination.ts`  以**求测时刻**定局，属运层（二），答「此刻这件事如何」
 *
 * 占局默认飞盘鸣法（括囊）。起局时刻不可指定、结算标准必填、一事一占，
 * 三条都写在签名里，理由见 divination.ts 头部。
 */

export * from './types.js';
export * from './loader.js';
export * from './shanXiang.js';
export * from './divination.js';
