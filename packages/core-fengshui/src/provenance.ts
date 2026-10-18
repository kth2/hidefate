/**
 * 计算出处戳记 —— 每张盘、每份合参结果都带上「哪个引擎版本、哪套规则」算出来的。
 *
 * 为什么需要：账本里的 `engineVersion` 原是手填字符串（'fengshui@0.1'），改了规则也不会变，
 * 「同一模型重放」的保证因此落空（第零期审计 D6）。这里改为：
 *   - `engine`：包名 + 版本（版本由测试锁定与 package.json 一致）
 *   - `rulesHash`：二十四山表、替星表、洛书飞布、元运纪年这几张**规则表**的指纹。
 *     任何一张表被改动，指纹必变 —— 不靠人记得去改版本号。
 *   - `ruleSet`：本次排盘实际用到的门派参数（五入中规则、兼向阈值、是否替卦、五入中逢替卦的取法）。
 *
 * 本模块只**附加**元数据，不改变任何计算结果。
 */

import { FLY_FORWARD } from './constants.js';
import { MOUNTAINS, TI_XING } from './mountains.js';
import { YUAN_YUN_EPOCH, YUN_LENGTH } from './period.js';

export const CORE_FENGSHUI_PACKAGE = '@hidefate/core-fengshui';
/** 须与 package.json 的 version 一致（provenance.test.ts 锁定）。 */
export const CORE_FENGSHUI_VERSION = '0.1.0';

/**
 * 规则修订号：规则**语义**改变（而表格内容没变）时手动加一，
 * 例如改了五入中逢替卦的取法。表格内容的改变由 rulesHash 自动反映。
 */
export const XUANKONG_RULES_REVISION = 1;

/** FNV-1a 32 位，纯同步、浏览器与 Node 结果一致；只作指纹，不作安全用途。 */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 规则表指纹（模块载入时算一次）。 */
export const RULES_HASH: string = fnv1a(
  JSON.stringify({
    rev: XUANKONG_RULES_REVISION,
    mountains: MOUNTAINS.map((m) => [m.name, m.center, m.palace, m.yuan, m.yinYang]),
    tiXing: Object.entries(TI_XING).sort(([a], [b]) => (a < b ? -1 : 1)),
    flyForward: Object.entries(FLY_FORWARD),
    yuanYun: [YUAN_YUN_EPOCH, YUN_LENGTH],
  }),
);

export const ENGINE_ID = `${CORE_FENGSHUI_PACKAGE}@${CORE_FENGSHUI_VERSION}+rules.${RULES_HASH}`;

export interface CalcProvenance {
  /** 引擎：包名@版本+规则表指纹。 */
  readonly engine: string;
  readonly rulesHash: string;
  /** 本次计算实际采用的门派参数，规范化成一行字符串，可直接比较。 */
  readonly ruleSet: string;
}

export interface ChartRuleParams {
  readonly centerFiveRule: string;
  readonly jianThreshold: number;
  readonly useTiXing: boolean;
  /** 五入中逢替卦的取法。引擎目前只实现一种：取元运宫同元龙之山的替星（见 reference/ 差异 X-1）。 */
  readonly fiveTiXing: 'period';
}

export function chartRuleSet(p: ChartRuleParams): string {
  return `xuankong@r${XUANKONG_RULES_REVISION};center5=${p.centerFiveRule};jian=${p.jianThreshold};ti=${p.useTiXing ? 'on' : 'off'};five-ti=${p.fiveTiXing}`;
}

export function chartProvenance(p: ChartRuleParams): CalcProvenance {
  return { engine: ENGINE_ID, rulesHash: RULES_HASH, ruleSet: chartRuleSet(p) };
}
