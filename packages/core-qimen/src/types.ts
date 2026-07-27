/**
 * 上游奇门引擎（kth2/Qimen-pwa）返回结构的类型声明。
 *
 * 这些类型是「贴着上游实际输出写的」，不是我们自己设计的模型 ——
 * 目的是让 TypeScript 端得到类型安全，同时不改动上游一个字节。
 * 引擎九宫的键为 "1"–"9"，与洛书数完全一致，故可直接叠加到飞星九宫上。
 */

import type { PalaceIndex } from '@hidefate/core-fengshui';

/** 九宫数值映射，键为 "1"–"9"。 */
export type GongMap<T = string> = Record<string, T>;

export interface QiMenGongAnalysis {
  readonly gongNumber: string;
  readonly gongName: string;
  readonly direction: string;
  readonly element: string;
  /** 九星，如「天任」。 */
  readonly xing: string;
  readonly xingAlias: string;
  readonly xingFeature: string;
  /** 八门，如「开门」。中宫可能为空串。 */
  readonly men: string;
  readonly menFeature: string;
  /** 八神，如「六合」。 */
  readonly shen: string;
  readonly shenFeature: string;
  readonly xingGongRel: string;
  readonly menGongRel: string;
  readonly menPo: boolean;
  readonly keYing: { name: string; jiXiong: string; explain: string; tianGan: string; diGan: string } | null;
  readonly kongWang: boolean;
  readonly yiMa: boolean;
  /** 引擎自评分。 */
  readonly score: number;
  /** 'da_ji' | 'ji' | 'xiao_ji' | 'ping' | 'xiao_xiong' | 'xiong' | 'da_xiong' 等。 */
  readonly jiXiong: string;
  readonly jiXiongText: string;
  readonly explain: string;
  readonly tianGan: string;
  readonly diGan: string;
  readonly anGan: string;
}

export interface ShanXiangMeta {
  readonly sitting: { name: string; degree: number; gua: string };
  readonly facing: { name: string; degree: number; gua: string };
  readonly juBasis: { jieqi: string; yuan: string; type: 'yang' | 'yin'; number: string };
  readonly method: string;
  readonly activation: { date: Date; source: 'date' | 'year-立春' | 'now' };
  readonly label: string;
}

export interface QiMenChart {
  readonly basicInfo: Record<string, string>;
  readonly siZhu: { year: string; month: string; day: string; time: string };
  readonly juShu: { type: 'yang' | 'yin'; number: string; yuan: string; fullName: string; formatCode: string };
  readonly diPan: GongMap;
  readonly tianPan: GongMap;
  readonly jiuXing: GongMap;
  readonly baMen: GongMap;
  readonly baShen: GongMap;
  readonly anGan: GongMap;
  readonly zhiFuGong: string;
  readonly zhiFuXing: string;
  readonly zhiShiGong: string;
  readonly zhiShiMen: string;
  readonly kongWangGong: readonly string[] | string;
  readonly maStar: unknown;
  readonly jiuGongAnalysis: GongMap<QiMenGongAnalysis>;
  readonly geju: unknown;
  readonly analysis: unknown;
  readonly shanXiang?: ShanXiangMeta;
  readonly error?: boolean;
  readonly message?: string;
}

/** 上游 shanxiang.js 的导出面。 */
export interface ShanXiangModule {
  MOUNTAINS: readonly { name: string; center: number; gua: string; jieqi: string }[];
  JU_TABLE: Record<string, [['yang' | 'yin', number], ['yang' | 'yin', number], ['yang' | 'yin', number]]>;
  degreeToMountain(deg: number): { name: string; center: number; gua: string; jieqi: string };
  resolveMountain(input: string | number): { name: string; degree: number; gua: string; jieqi: string; yuanIndex: number; hasDegree: boolean };
  oppositeMountain(input: string | number): string;
  sittingToJu(input: string | number): {
    type: 'yang' | 'yin'; number: string; jieqi: string; yuan: string; yuanIndex: number;
    mountain: string; degree: number; gua: string; fullName: string; formatCode: string;
  };
  generateShanXiangChart(options: ShanXiangOptions, engine?: unknown): QiMenChart;
}

export interface ShanXiangOptions {
  /** 坐山：二十四山名或 0–360 度数（必填）。 */
  sitting: string | number;
  /** 向首：默认取坐山之冲。 */
  facing?: string | number;
  /** 激活时间：决定值符/值使/天盘/暗干。 */
  date?: Date;
  /** 入住/动土年：无 date 时以该年立春激活。 */
  year?: number;
  /** 定局法，默认 'standard'（坐山三元）。 */
  method?: string;
  purpose?: string;
}

/** 上游引擎的公开面（只声明本项目实际用到的部分）。 */
export interface QMEngine {
  qimen: {
    calculate(date: Date, opts: Record<string, unknown>): QiMenChart;
    calculateJuShu(date: Date, method: string): { type: 'yang' | 'yin'; number: string; yuan: string; jieQiName: string };
    diPanModule: { getDiPan(type: 'yang' | 'yin', n: number): GongMap };
  };
  JIU_GONG: GongMap<{ name: string; direction: string; element: string; color: string; yinyang: string }>;
  JIU_XING: Record<string, { alias: string; element: string; color: string; feature: string }>;
  BA_MEN: Record<string, { feature: string; type: 'ji' | 'xiong'; element: string; color: string }>;
  BA_SHEN: Record<string, { feature: string; type: 'ji' | 'xiong' }>;
}

/** 把引擎的 "1"–"9" 键安全转成 PalaceIndex。 */
export function toPalaceIndex(key: string | number): PalaceIndex {
  const n = typeof key === 'number' ? key : parseInt(key, 10);
  if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error(`非法宫位键：${key}`);
  return n as PalaceIndex;
}
