/**
 * 四柱神煞（年支系）。
 *
 * 只收**由年支单一推出、各家取法一致**的四个：驿马、桃花（咸池）、红鸾、天喜。
 * 它们是「什么时候」这一问的关键抓手 —— 光有十神与飞星，
 * 说得出「感情有机会」，说不出「今年」。
 *
 * 刻意不收取法分歧大的（如天乙贵人的两派排法、羊刃的阴阳干差异）——
 * 分歧项若要收，须先决定跟哪一家，并在结论里写明，不能含糊带过。
 *
 * 用法上区分两层：
 *   - 由**本命年支**推出 → 命层，一生带着
 *   - 由**流年支**推出   → 运层，只在那一年出现
 * 两者用同一张表，差别只在传入哪个年支。
 */

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

export type Zhi = (typeof ZHI)[number];

const indexOf = (zhi: string): number => ZHI.indexOf(zhi as Zhi);

/** 三合局：寅午戌 / 申子辰 / 巳酉丑 / 亥卯未。 */
function sanHeGroup(zhi: string): '寅午戌' | '申子辰' | '巳酉丑' | '亥卯未' | null {
  if ('寅午戌'.includes(zhi)) return '寅午戌';
  if ('申子辰'.includes(zhi)) return '申子辰';
  if ('巳酉丑'.includes(zhi)) return '巳酉丑';
  if ('亥卯未'.includes(zhi)) return '亥卯未';
  return null;
}

/**
 * 驿马 —— 主动、远行、变动、调职。
 * 取法：三合局长生之冲。寅午戌马在申、申子辰马在寅、巳酉丑马在亥、亥卯未马在巳。
 */
export function yiMaOf(yearZhi: string): Zhi | null {
  const g = sanHeGroup(yearZhi);
  if (!g) return null;
  return { 寅午戌: '申', 申子辰: '寅', 巳酉丑: '亥', 亥卯未: '巳' }[g] as Zhi;
}

/**
 * 桃花（咸池）—— 人缘、情欲、应酬。
 * 取法：三合局沐浴位。寅午戌在卯、申子辰在酉、巳酉丑在午、亥卯未在子。
 */
export function taoHuaOf(yearZhi: string): Zhi | null {
  const g = sanHeGroup(yearZhi);
  if (!g) return null;
  return { 寅午戌: '卯', 申子辰: '酉', 巳酉丑: '午', 亥卯未: '子' }[g] as Zhi;
}

/**
 * 红鸾 —— 主婚喜、缔结关系。
 * 取法：自卯起子年**逆行**十二支。子年在卯、丑年在寅、寅年在丑……
 */
export function hongLuanOf(yearZhi: string): Zhi | null {
  const i = indexOf(yearZhi);
  if (i < 0) return null;
  // 卯 的索引为 3；逆行故相减
  return ZHI[(3 - i + 12) % 12] as Zhi;
}

/** 天喜 —— 红鸾之对宫，主喜庆、添丁。 */
export function tianXiOf(yearZhi: string): Zhi | null {
  const hl = hongLuanOf(yearZhi);
  if (!hl) return null;
  return ZHI[(indexOf(hl) + 6) % 12] as Zhi;
}

export interface ShenShaSet {
  readonly yiMa: Zhi | null;
  readonly taoHua: Zhi | null;
  readonly hongLuan: Zhi | null;
  readonly tianXi: Zhi | null;
}

/** 由某个年支推出四神煞所落之支。 */
export function shenShaOf(yearZhi: string): ShenShaSet {
  return {
    yiMa: yiMaOf(yearZhi),
    taoHua: taoHuaOf(yearZhi),
    hongLuan: hongLuanOf(yearZhi),
    tianXi: tianXiOf(yearZhi),
  };
}

/**
 * 判断某组地支（如四柱地支、或流年支）中命中了哪些神煞。
 *
 * @param baseZhi  推神煞所用的年支（本命年支或流年支）
 * @param present  待检地支集合
 * @returns 命中的神煞名，如 ['红鸾', '驿马']
 */
export function shenShaHits(baseZhi: string, present: Iterable<string>): string[] {
  const set = new Set(present);
  const s = shenShaOf(baseZhi);
  const out: string[] = [];
  if (s.yiMa && set.has(s.yiMa)) out.push('驿马');
  if (s.taoHua && set.has(s.taoHua)) out.push('桃花');
  if (s.hongLuan && set.has(s.hongLuan)) out.push('红鸾');
  if (s.tianXi && set.has(s.tianXi)) out.push('天喜');
  return out;
}
