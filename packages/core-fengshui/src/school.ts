/**
 * 门派设置 —— 让风水师自己决定那些「各家做法不一」的地方。
 *
 * 引擎原来把这些选择写死在函数默认值里（入住年立运盘、五入中随运星、兼向 3°……），
 * 风水师看不到、也改不了，于是看到一个跟自己做法不同的结论，第一反应是「这 App 不准」。
 *
 * 纪律：
 *   1. 每一项都有默认值，且默认值与引擎原行为一致 —— 不传设置时结果不变。
 *   2. 任何一项偏离默认，`describeSchool()` 都会写出来，报告页脚必须印出。
 *   3. 资料缺失时的回退（如选了「建成年」却没填建成年）必须明说回退到了什么。
 */

import type { CenterFiveRule } from './flyingStar.js';

/** 运盘取哪一年。 */
export type PeriodBasis = '入住年' | '建成年' | '换天心年';

/** 分宫法。 */
export type PalaceDivision = '九宫井字' | '八卦放射' | '二十四山放射';

/** 公寓、组屋、高层单位以何为「向」。 */
export type UnitFacingRule = '阳台主窗' | '单元大门' | '大楼大门';

export interface SchoolSettings {
  readonly periodBasis: PeriodBasis;
  readonly centerFiveRule: CenterFiveRule;
  /** 兼向起替卦的阈值（度）。 */
  readonly jianThreshold: number;
  readonly palaceDivision: PalaceDivision;
  readonly unitFacing: UnitFacingRule;
  /** 楼层五行（河图数）是否参与论断。默认关闭：诸家争议大，列为待考。 */
  readonly floorWuXing: boolean;
  /** 罗盘基准。传统罗盘读磁北。 */
  readonly north: '磁北' | '真北';
  /**
   * 星曜旺衰以何运论。
   *   宅运：以宅之元运论（引擎原行为）
   *   时运：以看盘当年之元运论（如八运宅在九运年，八白作退气、九紫作当旺）
   * 诸家两说并存，默认保留原行为，由风水师自选。
   */
  readonly phaseBasis: '宅运' | '时运';
}

export const DEFAULT_SCHOOL: SchoolSettings = {
  periodBasis: '入住年',
  centerFiveRule: '随运星',
  jianThreshold: 3,
  palaceDivision: '九宫井字',
  unitFacing: '阳台主窗',
  floorWuXing: false,
  north: '磁北',
  phaseBasis: '宅运',
};

/** 合并部分设置，并把阈值夹在合理区间（2°–4.5°，再宽就不是兼向而是出卦了）。 */
export function resolveSchool(partial?: Partial<SchoolSettings>): SchoolSettings {
  const s = { ...DEFAULT_SCHOOL, ...(partial ?? {}) };
  return { ...s, jianThreshold: Math.min(4.5, Math.max(2, s.jianThreshold)) };
}

export interface ChartYearInput {
  readonly moveInYear: number;
  readonly builtYear?: number;
  /** 大装修（换天心）完工年。 */
  readonly renovatedYear?: number;
}

export interface ChartYearResolution {
  readonly year: number;
  /** 实际用了哪一年（可能因资料缺失回退）。 */
  readonly used: PeriodBasis;
  readonly fellBack: boolean;
  readonly note: string;
}

/**
 * 依门派设置决定运盘取哪一年。
 *
 * 回退顺序：换天心年 → 入住年；建成年 → 入住年。入住年必填，是最后的底。
 */
export function resolveChartYear(input: ChartYearInput, basis: PeriodBasis): ChartYearResolution {
  if (basis === '换天心年') {
    if (input.renovatedYear != null) {
      return { year: input.renovatedYear, used: '换天心年', fellBack: false, note: `运盘以换天心年 ${input.renovatedYear} 立。` };
    }
    return {
      year: input.moveInYear,
      used: '入住年',
      fellBack: true,
      note: `门派设为「换天心年」，但未填大装修年，回退以入住年 ${input.moveInYear} 立运盘。`,
    };
  }
  if (basis === '建成年') {
    if (input.builtYear != null) {
      return { year: input.builtYear, used: '建成年', fellBack: false, note: `运盘以建成年 ${input.builtYear} 立。` };
    }
    return {
      year: input.moveInYear,
      used: '入住年',
      fellBack: true,
      note: `门派设为「建成年」，但未填建成年，回退以入住年 ${input.moveInYear} 立运盘。`,
    };
  }
  // 入住年；若另有更晚的换天心年，提示但不自动采用 —— 是否算换天心由风水师定。
  const hint =
    input.renovatedYear != null && input.renovatedYear > input.moveInYear
      ? `（另填有大装修年 ${input.renovatedYear}；若该次装修够换天心，可在门派设置改用「换天心年」。）`
      : '';
  return { year: input.moveInYear, used: '入住年', fellBack: false, note: `运盘以入住年 ${input.moveInYear} 立。${hint}` };
}

/** 偏离默认的设置逐条写出；全为默认则只写一句。供报告页脚与盘面注脚。 */
export function describeSchool(s: SchoolSettings): string[] {
  const lines: string[] = [
    `运盘取${s.periodBasis}`,
    `五入中：${s.centerFiveRule}`,
    `兼向 ${s.jianThreshold}° 起替卦`,
    `分宫：${s.palaceDivision}`,
    `单位立向：${s.unitFacing}`,
    `楼层五行：${s.floorWuXing ? '参与' : '不参与（待考）'}`,
    `罗盘基准：${s.north}`,
    `旺衰以${s.phaseBasis}论`,
  ];
  return lines;
}

/** 与默认不同的项。 */
export function schoolDeviations(s: SchoolSettings): (keyof SchoolSettings)[] {
  return (Object.keys(DEFAULT_SCHOOL) as (keyof SchoolSettings)[]).filter((k) => s[k] !== DEFAULT_SCHOOL[k]);
}
