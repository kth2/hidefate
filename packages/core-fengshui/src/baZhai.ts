/**
 * 八宅派（游年八星 / 大游年歌）。
 *
 * 八宅有两个独立层：
 *   1. 宅之八星 —— 以「坐山所属卦宫」为宅卦，八方各得一星，属于房子本身。
 *   2. 人之八星 —— 以「命卦」起，八方各得一星，属于居住者个人。
 * 二者叠加，才是「这个人住这间房的这个位置」的真实吉凶（本模块 crossPersonHouse）。
 *
 * 四吉：生气（贪狼）· 天医（巨门）· 延年（武曲）· 伏位（辅弼）
 * 四凶：绝命（破军）· 五鬼（廉贞）· 六煞（文曲）· 祸害（禄存）
 */

import { GUA_PALACE, OUTER_PALACES, PALACE_GUA, type GuaName, type PalaceIndex } from './constants.js';
import { resolveMountain, type MountainInput } from './mountains.js';

/** 游年八星。 */
export type YouNianStar =
  | '生气' | '天医' | '延年' | '伏位'
  | '绝命' | '五鬼' | '六煞' | '祸害';

export const AUSPICIOUS_STARS: readonly YouNianStar[] = ['生气', '天医', '延年', '伏位'] as const;
export const INAUSPICIOUS_STARS: readonly YouNianStar[] = ['绝命', '五鬼', '六煞', '祸害'] as const;

/** 八宅卦（不含中宫）。 */
export type EightGua = Exclude<GuaName, '中'>;

/** 游年八星元数据：吉凶等级、九星别名、五行、主事。 */
export interface YouNianMeta {
  readonly star: YouNianStar;
  readonly auspicious: boolean;
  /** 吉凶强度 +3 最吉 … -3 最凶。 */
  readonly power: number;
  readonly alias: string;
  readonly wuXing: '木' | '火' | '土' | '金' | '水';
  readonly governs: string;
  readonly summary: string;
}

export const YOU_NIAN_META: Record<YouNianStar, YouNianMeta> = {
  生气: { star: '生气', auspicious: true, power: 3, alias: '贪狼', wuXing: '木', governs: '事业·活力·人缘', summary: '第一吉方，主积极进取、升迁添丁，宜设主门、办公位、卧床。' },
  天医: { star: '天医', auspicious: true, power: 2, alias: '巨门', wuXing: '土', governs: '健康·贵人·财源', summary: '主病去身安、遇贵得助，宜设卧室、厨房（食禄），久病者尤重此方。' },
  延年: { star: '延年', auspicious: true, power: 2, alias: '武曲', wuXing: '金', governs: '感情·寿元·人际', summary: '主婚姻和合、寿元绵长，夫妻卧房与谈判座位首选。' },
  伏位: { star: '伏位', auspicious: true, power: 1, alias: '辅弼', wuXing: '木', governs: '稳定·守成·文昌', summary: '力量最缓的吉方，主安稳无波，宜书房、静养、储蓄。' },
  祸害: { star: '祸害', auspicious: false, power: -1, alias: '禄存', wuXing: '土', governs: '口舌·官非·小病', summary: '最轻之凶，主是非争执、小病缠身，宜作储物、厕所等「压凶」用途。' },
  六煞: { star: '六煞', auspicious: false, power: -2, alias: '文曲', wuXing: '水', governs: '桃花·酒色·破财', summary: '主感情纠纷、烂桃花与无谓损耗，最忌落在夫妻主卧。' },
  五鬼: { star: '五鬼', auspicious: false, power: -3, alias: '廉贞', wuXing: '火', governs: '小人·意外·失窃·火险', summary: '主横祸、盗失、小人暗算与情绪失控，忌开门、忌主卧、忌炉灶。' },
  绝命: { star: '绝命', auspicious: false, power: -3, alias: '破军', wuXing: '金', governs: '重病·大破财·绝嗣', summary: '最凶之方，主重症手术、投资大败，宜作厕所、储藏以镇之。' },
};

/**
 * 八卦爻象。以三位二进制表示，(初爻, 中爻, 上爻)，阳 = 1、阴 = 0。
 * 例：坎 ☵ 中满 → (0,1,0)；离 ☲ 中虚 → (1,0,1)。
 */
export const GUA_YAO: Record<EightGua, readonly [0 | 1, 0 | 1, 0 | 1]> = {
  乾: [1, 1, 1],
  兑: [1, 1, 0],
  离: [1, 0, 1],
  震: [1, 0, 0],
  巽: [0, 1, 1],
  坎: [0, 1, 0],
  艮: [0, 0, 1],
  坤: [0, 0, 0],
};

const YAO_TO_GUA = new Map<string, EightGua>(
  (Object.keys(GUA_YAO) as EightGua[]).map((g) => [GUA_YAO[g].join(''), g]),
);

/**
 * 翻卦掌变爻序 —— 大游年表的生成规则（而非死记硬背的表）。
 *
 * 自本卦起，依次翻爻，每翻一次得一星：
 *   变上爻 → 生气   变中爻 → 五鬼   变初爻 → 延年   变中爻 → 六煞
 *   变上爻 → 祸害   变中爻 → 天医   变初爻 → 绝命   变中爻 → 伏位（复归本卦）
 *
 * 以生成代替手抄，可根除抄表错漏；表的对称性、伏位归本卦、四吉必同组
 * 三条自检均在 baZhai.test.ts 中强制校验。
 */
const FAN_GUA_SEQUENCE: readonly { yao: 0 | 1 | 2; star: YouNianStar }[] = [
  { yao: 2, star: '生气' },
  { yao: 1, star: '五鬼' },
  { yao: 0, star: '延年' },
  { yao: 1, star: '六煞' },
  { yao: 2, star: '祸害' },
  { yao: 1, star: '天医' },
  { yao: 0, star: '绝命' },
  { yao: 1, star: '伏位' },
];

function buildYouNianRow(gua: EightGua): Record<EightGua, YouNianStar> {
  const yao: (0 | 1)[] = [...GUA_YAO[gua]];
  const row = {} as Record<EightGua, YouNianStar>;
  for (const step of FAN_GUA_SEQUENCE) {
    yao[step.yao] = (yao[step.yao] === 1 ? 0 : 1) as 0 | 1;
    const target = YAO_TO_GUA.get(yao.join(''));
    if (!target) throw new Error(`翻卦得到非法爻象：${yao.join('')}`);
    row[target] = step.star;
  }
  return row;
}

/**
 * 大游年表：宅卦（或命卦）→ 八方所得之星。
 * 键为「星所落之卦宫」。由 buildYouNianRow 依翻卦掌推出，非手抄。
 */
export const YOU_NIAN_TABLE: Record<EightGua, Record<EightGua, YouNianStar>> = Object.fromEntries(
  (Object.keys(GUA_YAO) as EightGua[]).map((g) => [g, buildYouNianRow(g)]),
) as Record<EightGua, Record<EightGua, YouNianStar>>;

/** 东四（坎震巽离）/ 西四（乾坤艮兑）。 */
export type GuaGroup = '东四' | '西四';

export function guaGroup(gua: EightGua): GuaGroup {
  return gua === '坎' || gua === '震' || gua === '巽' || gua === '离' ? '东四' : '西四';
}

/** 八宅盘：八方 → 游年星。中宫（5）不参与八宅论断。 */
export type BaZhaiPlate = Record<Exclude<PalaceIndex, 5>, YouNianStar>;

/** 由卦（宅卦或命卦）排出八方游年星。 */
export function buildBaZhaiPlate(gua: EightGua): BaZhaiPlate {
  const row = YOU_NIAN_TABLE[gua];
  const plate = {} as BaZhaiPlate;
  for (const p of OUTER_PALACES) {
    plate[p as Exclude<PalaceIndex, 5>] = row[PALACE_GUA[p] as EightGua];
  }
  return plate;
}

export interface HouseBaZhai {
  /** 宅卦（由坐山所属卦宫定）。 */
  readonly houseGua: EightGua;
  /** 宅之东西四命属性。 */
  readonly group: GuaGroup;
  /** 向首之卦（即「宅向」，常用于「坐X向Y宅」的命名）。 */
  readonly facingGua: EightGua;
  readonly plate: BaZhaiPlate;
  readonly label: string;
  readonly derivation: readonly string[];
}

/** 由坐山排宅之八宅盘。 */
export function buildHouseBaZhai(sitting: MountainInput): HouseBaZhai {
  const sit = resolveMountain(sitting);
  const houseGua = sit.mountain.gua as EightGua;
  const facingPalace = ((): PalaceIndex => {
    const opposite = (sit.degree + 180) % 360;
    // 复用 mountains 的解析保证与飞星同环
    return resolveMountain(opposite).mountain.palace;
  })();
  const facingGua = PALACE_GUA[facingPalace] as EightGua;
  const group = guaGroup(houseGua);
  return {
    houseGua,
    group,
    facingGua,
    plate: buildBaZhaiPlate(houseGua),
    label: `坐${houseGua}向${facingGua}（${group}宅）`,
    derivation: [
      `八宅以坐定卦：坐山「${sit.mountain.name}」属${houseGua}宫，故为${houseGua}宅，属${group}宅。`,
      `依大游年歌起八星：生气→${invert(houseGua, '生气')}、天医→${invert(houseGua, '天医')}、延年→${invert(houseGua, '延年')}、伏位→${invert(houseGua, '伏位')}；` +
        `绝命→${invert(houseGua, '绝命')}、五鬼→${invert(houseGua, '五鬼')}、六煞→${invert(houseGua, '六煞')}、祸害→${invert(houseGua, '祸害')}。`,
    ],
  };
}

/** 反查：某卦之某星落在哪一卦宫。 */
export function invert(gua: EightGua, star: YouNianStar): EightGua {
  const row = YOU_NIAN_TABLE[gua];
  for (const k of Object.keys(row) as EightGua[]) {
    if (row[k] === star) return k;
  }
  throw new Error(`${gua}宅无${star}方（游年表异常）`);
}

export interface PersonHouseCell {
  readonly palace: PalaceIndex;
  /** 宅之游年星。 */
  readonly houseStar: YouNianStar;
  /** 人之游年星（以命卦起）。 */
  readonly personStar: YouNianStar;
  /** 宅人叠加评分：-6 … +6。 */
  readonly score: number;
  /** 宅人是否同组（东四命住东四宅等）。 */
  readonly harmonised: boolean;
  readonly verdict: '大吉' | '吉' | '平' | '凶' | '大凶';
  readonly reason: string;
}

/**
 * 宅 × 人 交叉：某命卦者在此宅八方各得什么。
 * 这是八宅派最有实操价值的一层 —— 同一间房，对不同家庭成员吉凶可以相反。
 */
export function crossPersonHouse(
  houseGua: EightGua,
  mingGua: EightGua,
): Record<Exclude<PalaceIndex, 5>, PersonHouseCell> {
  const housePlate = buildBaZhaiPlate(houseGua);
  const personPlate = buildBaZhaiPlate(mingGua);
  const harmonised = guaGroup(houseGua) === guaGroup(mingGua);
  const out = {} as Record<Exclude<PalaceIndex, 5>, PersonHouseCell>;
  for (const p of OUTER_PALACES) {
    const key = p as Exclude<PalaceIndex, 5>;
    const hs = housePlate[key];
    const ps = personPlate[key];
    const score = YOU_NIAN_META[hs].power + YOU_NIAN_META[ps].power;
    out[key] = {
      palace: p,
      houseStar: hs,
      personStar: ps,
      score,
      harmonised,
      verdict: score >= 4 ? '大吉' : score >= 1 ? '吉' : score === 0 ? '平' : score >= -3 ? '凶' : '大凶',
      reason:
        `宅得「${hs}」（${YOU_NIAN_META[hs].governs}），命得「${ps}」（${YOU_NIAN_META[ps].governs}）；` +
        `${harmonised ? '宅命同属' + guaGroup(houseGua) : '宅命异组（' + guaGroup(houseGua) + '宅配' + guaGroup(mingGua) + '命）'}。`,
    };
  }
  return out;
}

/** 命卦 → 该人最宜与最忌的方位（用于卧床、书桌、灶口朝向建议）。 */
export function personalDirections(mingGua: EightGua): {
  readonly best: readonly { star: YouNianStar; gua: EightGua; palace: PalaceIndex }[];
  readonly worst: readonly { star: YouNianStar; gua: EightGua; palace: PalaceIndex }[];
} {
  const pick = (stars: readonly YouNianStar[]) =>
    stars.map((s) => {
      const gua = invert(mingGua, s);
      return { star: s, gua, palace: GUA_PALACE[gua] };
    });
  return { best: pick(AUSPICIOUS_STARS), worst: pick(INAUSPICIOUS_STARS) };
}
