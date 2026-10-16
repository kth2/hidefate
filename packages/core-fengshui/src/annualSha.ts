/**
 * 流年煞方 —— 太岁、岁破、三煞，以及紫白五黄、二黑、三碧所到之宫。
 *
 * 这是风水师每年立春前一定要给客户的东西：「今年哪几个方位不能动土、不宜大装修」。
 * 也是择日「动土方位」的硬性排除条件。
 *
 * 规则（诸家无异说）：
 *   - 太岁：当年地支所在之山（2027 丁未 → 未山）
 *   - 岁破：太岁之冲（未 ↔ 丑）
 *   - 三煞：以年支三合局论，煞在三合五行所克之方：
 *       申子辰（水局）→ 南方 巳午未
 *       寅午戌（火局）→ 北方 亥子丑
 *       巳酉丑（金局）→ 东方 寅卯辰
 *       亥卯未（木局）→ 西方 申酉戌
 *     三山依次为 劫煞、灾煞、岁煞。
 *   - 紫白：年星入中顺飞，取五黄、二黑、三碧落宫。
 *
 * 年界以立春为准（调用方传入立春年）。
 */

import { FLY_FORWARD, PALACE_DIRECTION, STAR_NAME, type PalaceIndex } from './constants.js';
import { mountainByName, type Mountain } from './mountains.js';
import { annualStar, yearZhi } from './period.js';

export interface ShaSector {
  readonly label: string;
  readonly mountains: readonly Mountain[];
  /** 方位角范围 [起, 止)，可跨 0°（起 > 止 表示跨北）。 */
  readonly range: readonly [number, number];
  readonly palaces: readonly PalaceIndex[];
  /** 宜忌一句话。 */
  readonly rule: string;
}

export interface AnnualSha {
  readonly year: number;
  readonly zhi: string;
  readonly taiSui: ShaSector;
  readonly suiPo: ShaSector;
  readonly sanSha: ShaSector & { readonly names: readonly ['劫煞', '灾煞', '岁煞'] };
  readonly wuHuang: PalaceIndex;
  readonly erHei: PalaceIndex;
  readonly sanBi: PalaceIndex;
  /** 动土／大装修应避开的宫位（去重，不含中宫）。 */
  readonly avoidGroundworkPalaces: readonly PalaceIndex[];
  /** 汇总成一段可直接读给客户听的话。 */
  readonly summary: string;
}

const ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const SAN_SHA_OF: Readonly<Record<string, readonly [string, string, string]>> = {
  申: ['巳', '午', '未'], 子: ['巳', '午', '未'], 辰: ['巳', '午', '未'],
  寅: ['亥', '子', '丑'], 午: ['亥', '子', '丑'], 戌: ['亥', '子', '丑'],
  巳: ['寅', '卯', '辰'], 酉: ['寅', '卯', '辰'], 丑: ['寅', '卯', '辰'],
  亥: ['申', '酉', '戌'], 卯: ['申', '酉', '戌'], 未: ['申', '酉', '戌'],
};

/** 三煞以灾煞（中间一山）定大方位：午 → 南、子 → 北、卯 → 东、酉 → 西。 */
const SAN_SHA_SIDE: Readonly<Record<string, string>> = { 午: '南', 子: '北', 卯: '东', 酉: '西' };

function norm(d: number): number {
  return ((d % 360) + 360) % 360;
}

function sectorOf(label: string, names: readonly string[], rule: string): ShaSector {
  const ms = names.map((n) => mountainByName(n));
  const first = ms[0]!;
  const last = ms[ms.length - 1]!;
  const palaces = [...new Set(ms.map((m) => m.palace))];
  return {
    label,
    mountains: ms,
    range: [norm(first.center - 7.5), norm(last.center + 7.5)],
    palaces,
    rule,
  };
}

/** 年星入中顺飞后，某星落在哪一宫。 */
function palaceOfAnnual(year: number, star: PalaceIndex): PalaceIndex {
  let palace: PalaceIndex = 5;
  let s = annualStar(year);
  for (let i = 0; i < 9; i++) {
    if (s === star) return palace;
    palace = FLY_FORWARD[palace];
    s = (s === 9 ? 1 : s + 1) as PalaceIndex;
  }
  throw new Error('unreachable');
}

export function annualSha(year: number): AnnualSha {
  const zhi = yearZhi(year);
  const idx = ZHI_ORDER.indexOf(zhi as (typeof ZHI_ORDER)[number]);
  const poZhi = ZHI_ORDER[(idx + 6) % 12]!;
  const sha = SAN_SHA_OF[zhi]!;

  const taiSui = sectorOf('太岁', [zhi], '忌动土、忌大装修；宜静，可坐不可向（不宜正对太岁方开工）。');
  const suiPo = sectorOf('岁破', [poZhi], '岁破为一年最凶之方，忌动土、忌修造，任何吉星不能压制。');
  const sanSha = {
    ...sectorOf('三煞', sha, '忌动土、忌修造；坐三煞方开工尤忌，可向不可坐。'),
    names: ['劫煞', '灾煞', '岁煞'] as const,
  };

  const wuHuang = palaceOfAnnual(year, 5);
  const erHei = palaceOfAnnual(year, 2);
  const sanBi = palaceOfAnnual(year, 3);

  const avoid = [...new Set([...taiSui.palaces, ...suiPo.palaces, ...sanSha.palaces, wuHuang])].filter(
    (p) => p !== 5,
  ) as PalaceIndex[];

  const dir = (p: PalaceIndex) => PALACE_DIRECTION[p];
  const summary =
    `${year} 年（立春起）：${STAR_NAME[5]}到${dir(wuHuang)}、${STAR_NAME[2]}到${dir(erHei)}、${STAR_NAME[3]}到${dir(sanBi)}；` +
    `太岁在${zhi}（${dir(taiSui.palaces[0]!)}）、岁破在${poZhi}（${dir(suiPo.palaces[0]!)}）、` +
    `三煞在${SAN_SHA_SIDE[sha[1]!]}方（${sha.join('')}，${sanSha.range[0]}°–${sanSha.range[1]}°）。` +
    `以上方位今年勿动土、勿大装修。`;

  return { year, zhi, taiSui, suiPo, sanSha, wuHuang, erHei, sanBi, avoidGroundworkPalaces: avoid, summary };
}

/** 某方位角是否落在扇区内（含跨北）。 */
export function inSector(deg: number, s: Pick<ShaSector, 'range'>): boolean {
  const d = norm(deg);
  const [a, b] = s.range;
  return a <= b ? d >= a && d < b : d >= a || d < b;
}
