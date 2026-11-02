/**
 * 通书方位与命理神煞方位 —— 即时飞星页的「其它吉方」。
 *
 * 这里收的都是**有出处**的方位，各自来源不同，必须分开标示，不能混成一套：
 *
 *   1. 通书吉神方位（按日干、时干）：喜神、福神、财神、阳贵人、阴贵人。
 *      表格依通书、黄历一系，与 lunar-typescript 历法库 `LunarUtil.POSITION_*` 逐项相同
 *      （单元测试逐日与该库对拍）。福神有两种流传排法，两者都给，由使用者选。
 *   2. 玄空：流年、流月四绿文曲星所到之宫，俗称「流年文昌位」。
 *   3. 命理神煞（按出生年干支，须使用者自己给出生年）：
 *      咸池（俗称桃花位）、驿马、文昌（本命文昌）。这些原是八字神煞，
 *      近代才被借来论方位；亦有以日支论者，此处只取年支、年干一法并照实说明。
 *
 * 时干由日干按「五鼠遁」推出：甲己还加甲，乙庚丙作初，丙辛从戊起，丁壬庚子居，戊癸何方发，壬子是真途。
 */

import { PALACE_DIRECTION, type PalaceIndex } from './constants.js';
import { mountainByName } from './mountains.js';
import { dayGanZhiOf, shiChenOf, type TimeChartOptions } from './timeStars.js';

export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

type Gua = '坎' | '坤' | '震' | '巽' | '乾' | '兑' | '艮' | '离';

/** 卦 → 洛书宫位、宫中心方位角。 */
const GUA_PALACE: Record<Gua, PalaceIndex> = { 坎: 1, 坤: 2, 震: 3, 巽: 4, 乾: 6, 兑: 7, 艮: 8, 离: 9 };
const PALACE_BEARING: Record<PalaceIndex, number> = { 1: 0, 8: 45, 3: 90, 4: 135, 9: 180, 2: 225, 7: 270, 6: 315, 5: 0 };

/** 通书表（下标为天干序，甲 = 0）。 */
const XI: readonly Gua[] = ['艮', '乾', '坤', '离', '巽', '艮', '乾', '坤', '离', '巽'];
const FU_1: readonly Gua[] = ['巽', '巽', '震', '震', '坎', '离', '坤', '坤', '乾', '兑'];
const FU_2: readonly Gua[] = ['坎', '坤', '乾', '巽', '艮', '坎', '坤', '乾', '巽', '艮'];
const CAI: readonly Gua[] = ['艮', '艮', '坤', '坤', '坎', '坎', '震', '震', '离', '离'];
const YANG_GUI: readonly Gua[] = ['坤', '坤', '兑', '乾', '艮', '坎', '离', '艮', '震', '巽'];
const YIN_GUI: readonly Gua[] = ['艮', '坎', '乾', '兑', '坤', '坤', '艮', '离', '巽', '震'];

export type FuShenSect = '福神一' | '福神二';

export type DirectionSource = '通书' | '玄空' | '命理神煞';

export interface DirectionMark {
  /** 稳定键，供界面选择与记忆。 */
  readonly key: string;
  readonly label: string;
  readonly source: DirectionSource;
  readonly palace: PalaceIndex;
  readonly direction: string;
  /** 指向的方位角：卦取宫中线，地支取该山中线。中宫为 null。 */
  readonly bearing: number | null;
  /** 卦名或山名，如「艮」「酉」。 */
  readonly at: string;
  readonly meaning: string;
}

function guaMark(key: string, label: string, gua: Gua, meaning: string): DirectionMark {
  const palace = GUA_PALACE[gua];
  return { key, label, source: '通书', palace, direction: PALACE_DIRECTION[palace], bearing: PALACE_BEARING[palace], at: gua, meaning };
}

function zhiMark(key: string, label: string, zhi: string, meaning: string): DirectionMark {
  const m = mountainByName(zhi);
  return { key, label, source: '命理神煞', palace: m.palace, direction: PALACE_DIRECTION[m.palace], bearing: m.center, at: zhi, meaning };
}

const MEANING = {
  喜神: '主喜庆、和气。出门、会客、谈婚，传统上宜朝喜神方。',
  福神: '主福禄、平顺。祈福、安神位，传统上取福神方。',
  财神: '通书所载财神方。开市、求财、收账，传统上朝此方出行或坐向。',
  阳贵人: '天乙贵人（阳贵，昼用）。求人办事、见上司客户，宜向此方。',
  阴贵人: '天乙贵人（阴贵，夜用）。同上，傍晚与夜间多取阴贵。',
} as const;

function spirits(prefix: '日' | '时', ganIndex: number, sect: FuShenSect): DirectionMark[] {
  const fu = sect === '福神一' ? FU_1 : FU_2;
  return [
    guaMark(`${prefix}喜神`, `${prefix === '日' ? '今日' : '此时'}喜神`, XI[ganIndex]!, MEANING.喜神),
    guaMark(`${prefix}财神`, `${prefix === '日' ? '今日' : '此时'}财神`, CAI[ganIndex]!, MEANING.财神),
    guaMark(`${prefix}福神`, `${prefix === '日' ? '今日' : '此时'}福神`, fu[ganIndex]!, MEANING.福神),
    guaMark(`${prefix}阳贵`, `${prefix === '日' ? '今日' : '此时'}阳贵人`, YANG_GUI[ganIndex]!, MEANING.阳贵人),
    guaMark(`${prefix}阴贵`, `${prefix === '日' ? '今日' : '此时'}阴贵人`, YIN_GUI[ganIndex]!, MEANING.阴贵人),
  ];
}

export interface AlmanacDirections {
  readonly dayGan: string;
  readonly dayZhi: string;
  readonly hourGan: string;
  readonly hourZhi: string;
  readonly day: readonly DirectionMark[];
  readonly hour: readonly DirectionMark[];
}

/** 时干：五鼠遁。 */
export function hourGanIndex(dayGanIndex: number, hourZhiIndex: number): number {
  return (((dayGanIndex % 5) * 2 + hourZhiIndex) % 10 + 10) % 10;
}

/** 今日、此时辰的通书吉神方位。时辰依据与子时换日规则与时盘相同。 */
export function almanacDirections(
  at: Date,
  opts: TimeChartOptions & { readonly fuSect?: FuShenSect } = {},
): AlmanacDirections {
  const sect = opts.fuSect ?? '福神一';
  const { gan, zhi } = dayGanZhiOf(at, opts);
  const dg = GAN.indexOf(gan as (typeof GAN)[number]);
  const sc = shiChenOf(at, opts);
  const hg = hourGanIndex(dg, sc.index);
  return {
    dayGan: gan,
    dayZhi: zhi,
    hourGan: GAN[hg]!,
    hourZhi: sc.zhi,
    day: spirits('日', dg, sect),
    hour: spirits('时', hg, sect),
  };
}

/** 本命文昌（按年干）。 */
const WEN_CHANG_OF_GAN: readonly string[] = ['巳', '午', '申', '酉', '申', '酉', '亥', '子', '寅', '卯'];

/** 三合局 → 咸池（桃花）、驿马。 */
function sanHeGroup(zhi: string): 0 | 1 | 2 | 3 {
  if ('申子辰'.includes(zhi)) return 0;
  if ('寅午戌'.includes(zhi)) return 1;
  if ('巳酉丑'.includes(zhi)) return 2;
  return 3; // 亥卯未
}
const XIAN_CHI = ['酉', '卯', '午', '子'] as const;
const YI_MA = ['寅', '申', '亥', '巳'] as const;

export interface NatalDirections {
  readonly year: number;
  readonly gan: string;
  readonly zhi: string;
  readonly marks: readonly DirectionMark[];
}

/**
 * 按出生年（立春为界）取咸池桃花、驿马、本命文昌三方。
 * 立春前出生者应填前一年 —— 界面须提醒。
 */
export function natalDirections(birthYear: number): NatalDirections {
  const gi = (((birthYear - 4) % 10) + 10) % 10;
  const zi = (((birthYear - 4) % 12) + 12) % 12;
  const gan = GAN[gi]!;
  const zhi = ZHI[zi]!;
  const g = sanHeGroup(zhi);
  return {
    year: birthYear,
    gan,
    zhi,
    marks: [
      zhiMark('本命文昌', '本命文昌', WEN_CHANG_OF_GAN[gi]!, `按年干${gan}取。读书、考试、写作，书桌传统上宜放在此方或面向此方。`),
      zhiMark('桃花', '桃花（咸池）', XIAN_CHI[g], `按年支${zhi}三合局取咸池。人缘、社交、姻缘之方；已婚者传统上不宜在此方乱摆花水。`),
      zhiMark('驿马', '驿马', YI_MA[g], `按年支${zhi}三合局取驿马。出行、转工、外派、搬迁，传统上朝此方动身。`),
    ],
  };
}

/** 玄空：年、月四绿文曲所到之宫（流年／流月文昌）。 */
export function wenQuMarks(yearPlate: Record<PalaceIndex, PalaceIndex>, monthPlate: Record<PalaceIndex, PalaceIndex>): DirectionMark[] {
  const at = (plate: Record<PalaceIndex, PalaceIndex>) =>
    (Object.keys(plate).map(Number) as PalaceIndex[]).find((p) => plate[p] === 4)!;
  const mk = (key: string, label: string, palace: PalaceIndex, meaning: string): DirectionMark => ({
    key,
    label,
    source: '玄空',
    palace,
    direction: PALACE_DIRECTION[palace],
    bearing: palace === 5 ? null : PALACE_BEARING[palace],
    at: PALACE_DIRECTION[palace],
    meaning,
  });
  return [
    mk('年文昌', '流年文昌（年星四绿）', at(yearPlate), '四绿文曲星今年所到之宫。读书、考试、文书，传统上宜在此方用功；与宅盘一白或四绿同宫更佳。'),
    mk('月文昌', '流月文昌（月星四绿）', at(monthPlate), '四绿文曲星本月所到之宫，作短期参考。'),
  ];
}
