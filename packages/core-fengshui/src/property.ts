/**
 * 物业模型：建筑类别、楼层、九宫格与缺角、房间→宫位映射。
 *
 * 三条建档路径（上传户型图 / 纯九宫格 / 实地罗盘）最终都归结到同一个
 * PropertyProfile —— 后续所有推算只认这个结构，故「无户型图」与「不在现场」
 * 的体验与有图现场完全等价。
 */

import { OUTER_PALACES, PALACE_DIRECTION, type PalaceIndex, type WuXing } from './constants.js';

/** 建筑类别。分析规则随类别而变。 */
export type BuildingType =
  // 住宅
  | '独立屋' | '排屋' | '半独立式' | '洋房别墅'
  | '公寓' | '组屋单位' | '高层单位'
  // 商业及其他
  | '办公室' | '格子间工位' | '共享办公'
  | '店铺零售' | '餐饮' | '工厂车间' | '仓库'
  | '礼堂活动空间' | '学校课室' | '诊所医疗'
  | '其他';

export const RESIDENTIAL_TYPES: readonly BuildingType[] = [
  '独立屋', '排屋', '半独立式', '洋房别墅', '公寓', '组屋单位', '高层单位',
] as const;

export const COMMERCIAL_TYPES: readonly BuildingType[] = [
  '办公室', '格子间工位', '共享办公', '店铺零售', '餐饮',
  '工厂车间', '仓库', '礼堂活动空间', '学校课室', '诊所医疗', '其他',
] as const;

/** 需要填写楼层的类别。 */
export const FLOOR_REQUIRED_TYPES: readonly BuildingType[] = [
  '公寓', '组屋单位', '高层单位', '办公室', '格子间工位', '共享办公',
] as const;

export function requiresFloor(t: BuildingType): boolean {
  return FLOOR_REQUIRED_TYPES.includes(t);
}

/** 建筑类别的分析侧重：用于调节各风险维度的权重。 */
export interface BuildingProfile {
  readonly type: BuildingType;
  readonly category: '住宅' | '商业' | '公共' | '工业';
  /** 各维度权重（0–1.5），影响综合评分中的加权。 */
  readonly weights: {
    readonly 健康: number;
    readonly 财运: number;
    readonly 感情: number;
    readonly 事业: number;
    readonly 人丁: number;
  };
  /** 该类别下的关键区位（覆盖默认房间优先级时用）。 */
  readonly keySpaces: readonly string[];
  readonly note: string;
}

export const BUILDING_PROFILES: Record<BuildingType, BuildingProfile> = {
  独立屋:      { type: '独立屋', category: '住宅', weights: { 健康: 1.2, 财运: 1.0, 感情: 1.1, 事业: 0.9, 人丁: 1.2 }, keySpaces: ['大门', '主卧', '厨房'], note: '独立屋四面纳气，八方形峦与缺角影响最直接，山星（人丁健康）权重高。' },
  排屋:        { type: '排屋', category: '住宅', weights: { 健康: 1.1, 财运: 1.0, 感情: 1.1, 事业: 0.9, 人丁: 1.1 }, keySpaces: ['大门', '主卧', '厨房'], note: '排屋左右贴邻，气口集中在前后，前门后门一线通气须留意穿堂。' },
  半独立式:    { type: '半独立式', category: '住宅', weights: { 健康: 1.15, 财运: 1.0, 感情: 1.1, 事业: 0.9, 人丁: 1.15 }, keySpaces: ['大门', '主卧', '厨房'], note: '一侧贴邻，贴邻方之星力受抑，另三面正常论。' },
  洋房别墅:    { type: '洋房别墅', category: '住宅', weights: { 健康: 1.2, 财运: 1.05, 感情: 1.1, 事业: 0.95, 人丁: 1.2 }, keySpaces: ['大门', '主卧', '厨房', '书房'], note: '面积大、宫位分明，缺角与庭院水法影响显著。' },
  公寓:        { type: '公寓', category: '住宅', weights: { 健康: 1.1, 财运: 1.1, 感情: 1.1, 事业: 0.9, 人丁: 1.0 }, keySpaces: ['入户门', '主卧', '厨房'], note: '以自家单位门为「向」的实际气口，楼层五行须并参。' },
  组屋单位:    { type: '组屋单位', category: '住宅', weights: { 健康: 1.1, 财运: 1.1, 感情: 1.1, 事业: 0.9, 人丁: 1.0 }, keySpaces: ['入户门', '主卧', '厨房'], note: '同公寓，走廊来气方向常比建筑大门更关键。' },
  高层单位:    { type: '高层单位', category: '住宅', weights: { 健康: 1.05, 财运: 1.15, 感情: 1.05, 事业: 0.95, 人丁: 0.95 }, keySpaces: ['入户门', '主卧', '厨房'], note: '高层离地气渐远，向星（财）显、山星（丁）隐，故财运权重上调。' },
  办公室:      { type: '办公室', category: '商业', weights: { 健康: 0.8, 财运: 1.3, 感情: 0.6, 事业: 1.4, 人丁: 0.6 }, keySpaces: ['公司大门', '老板位', '财务位', '会议室'] , note: '以老板座位与收银/财务位为核心，向星与事业维度权重最高。' },
  格子间工位:  { type: '格子间工位', category: '商业', weights: { 健康: 0.9, 财运: 1.1, 感情: 0.6, 事业: 1.4, 人丁: 0.5 }, keySpaces: ['工位', '座向', '通道口'], note: '个人工位以「坐位朝向 + 所处宫位」论，可只取局部九宫。' },
  共享办公:    { type: '共享办公', category: '商业', weights: { 健康: 0.9, 财运: 1.1, 感情: 0.6, 事业: 1.3, 人丁: 0.5 }, keySpaces: ['工位', '座向'], note: '流动工位建议按「常坐位」建档，可建多份方案对比。' },
  店铺零售:    { type: '店铺零售', category: '商业', weights: { 健康: 0.7, 财运: 1.5, 感情: 0.5, 事业: 1.2, 人丁: 0.5 }, keySpaces: ['店门', '收银台', '主货架'], note: '零售以向星当旺为第一要务，收银台位置权重极高。' },
  餐饮:        { type: '餐饮', category: '商业', weights: { 健康: 1.2, 财运: 1.4, 感情: 0.5, 事业: 1.1, 人丁: 0.5 }, keySpaces: ['店门', '收银台', '厨房炉位'], note: '餐饮兼重财与卫生，二黑五黄落厨房须优先化解（食安/稽查风险）。' },
  工厂车间:    { type: '工厂车间', category: '工业', weights: { 健康: 1.3, 财运: 1.1, 感情: 0.4, 事业: 1.1, 人丁: 0.8 }, keySpaces: ['厂门', '机台区', '办公区'], note: '重机械区遇五鬼/五黄/七赤，工伤与设备事故概率明显上升。' },
  仓库:        { type: '仓库', category: '工业', weights: { 健康: 0.8, 财运: 1.2, 感情: 0.3, 事业: 1.0, 人丁: 0.4 }, keySpaces: ['出入口', '货区'], note: '仓储重「藏」，衰死之方反宜堆货以压；忌财位空荡。' },
  礼堂活动空间: { type: '礼堂活动空间', category: '公共', weights: { 健康: 0.9, 财运: 0.8, 感情: 0.9, 事业: 1.0, 人丁: 0.6 }, keySpaces: ['正门', '主席台', '疏散口'], note: '人流聚散为要，主席台宜坐旺山、面向当旺向星。' },
  学校课室:    { type: '学校课室', category: '公共', weights: { 健康: 1.1, 财运: 0.5, 感情: 0.7, 事业: 1.3, 人丁: 1.0 }, keySpaces: ['课室门', '讲台', '学生座区'], note: '以四绿文昌与一白为重，讲台位与文昌位是核心。' },
  诊所医疗:    { type: '诊所医疗', category: '公共', weights: { 健康: 1.5, 财运: 1.0, 感情: 0.5, 事业: 1.0, 人丁: 0.7 }, keySpaces: ['诊所门', '诊疗室', '药房'], note: '二黑本为病符，医疗场所反可借其象，但诊疗室仍忌五黄叠临。' },
  其他:        { type: '其他', category: '商业', weights: { 健康: 1.0, 财运: 1.0, 感情: 1.0, 事业: 1.0, 人丁: 1.0 }, keySpaces: ['主入口'], note: '未分类空间，采用中性权重。' },
};

/** 楼层五行（河图数：1/6 水，2/7 火，3/8 木，4/9 金，5/0 土）。 */
export function floorWuXing(floor: number): WuXing {
  const d = Math.abs(Math.trunc(floor)) % 10;
  if (d === 1 || d === 6) return '水';
  if (d === 2 || d === 7) return '火';
  if (d === 3 || d === 8) return '木';
  if (d === 4 || d === 9) return '金';
  return '土';
}

export interface FloorAdjustment {
  readonly floor: number;
  readonly wuXing: WuXing;
  /** 高层削弱山星（地气）力度：1.0 = 不削弱。 */
  readonly shanStarFactor: number;
  /** 高层增强向星（天气）力度。 */
  readonly xiangStarFactor: number;
  readonly note: string;
}

/**
 * 楼层调整。
 *
 * 原理：山星主人丁健康、根于地气；向星主财禄、根于空中来气。楼层愈高，
 * 地气愈薄而空气流动愈强，故山星力度递减、向星力度递增。此为量化近似，
 * 用于概率加权，不改变任何星位数字本身。
 */
export function floorAdjustment(floor: number, type: BuildingType): FloorAdjustment {
  const wx = floorWuXing(floor);
  if (!requiresFloor(type) || floor <= 3) {
    return { floor, wuXing: wx, shanStarFactor: 1, xiangStarFactor: 1, note: `${floor} 楼贴近地气，山向二星力度按常规论。` };
  }
  // 4–40 层线性过渡，最多削弱山星 25%、增强向星 20%。
  const t = Math.min(1, (floor - 3) / 30);
  return {
    floor,
    wuXing: wx,
    shanStarFactor: 1 - 0.25 * t,
    xiangStarFactor: 1 + 0.2 * t,
    note: `${floor} 楼属${wx}，离地气渐远：山星（人丁健康）力度 ×${(1 - 0.25 * t).toFixed(2)}，向星（财禄）力度 ×${(1 + 0.2 * t).toFixed(2)}。`,
  };
}

/** 缺角：某宫位实体缺失或凹入。 */
export interface MissingCorner {
  readonly palace: PalaceIndex;
  /**
   * 缺失程度 0–1：0 = 完整；0.3 = 轻微凹角；1 = 该宫几乎完全不存在。
   * 传统以「缺三分之一以上论缺角」，故 severity ≥ 0.33 才启用应期论断。
   */
  readonly severity: number;
  readonly note?: string;
}

/** 缺角的六亲/身体应象（后天八卦人物与脏腑）。 */
export const PALACE_FAMILY: Record<PalaceIndex, { member: string; body: string; organ: string }> = {
  1: { member: '中男（次子）', body: '耳、血液、泌尿', organ: '肾·膀胱' },
  2: { member: '母亲（女主人）', body: '腹部、脾胃、皮肤', organ: '脾·胃' },
  3: { member: '长男（长子）', body: '足、肝胆、四肢', organ: '肝·胆' },
  4: { member: '长女', body: '股、胆、神经、呼吸', organ: '胆·气管' },
  5: { member: '全家（中宫）', body: '整体元气', organ: '中焦' },
  6: { member: '父亲（男主人）', body: '头、肺、骨、大肠', organ: '肺·大肠' },
  7: { member: '少女（幼女）', body: '口、舌、肺、齿', organ: '肺·口腔' },
  8: { member: '少男（幼子）', body: '手、背、脾胃、关节', organ: '脾·关节' },
  9: { member: '中女（次女）', body: '目、心、血压', organ: '心·小肠' },
};

export interface MissingCornerImpact {
  readonly palace: PalaceIndex;
  readonly severity: number;
  readonly direction: string;
  /** 是否达到「论缺角」的门槛。 */
  readonly significant: boolean;
  readonly affectedMember: string;
  readonly affectedBody: string;
  readonly summary: string;
  /** 对该宫吉凶评分的乘数：缺角削弱吉星、亦削弱凶星，但另加独立负面项。 */
  readonly starFactor: number;
  /** 缺角本身带来的固定风险增量 0–1。 */
  readonly riskAdd: number;
  readonly cures: readonly string[];
}

/**
 * 缺角影响评估。
 *
 * 缺角有两重后果：
 *   (1) 该宫飞星力量削弱 —— 吉星到此发不出，凶星到此亦减力（starFactor）。
 *   (2) 该宫所主之六亲与脏腑「无靠」—— 这是独立的负面项（riskAdd），
 *       不因该宫飞星吉凶而抵销。传统所谓「缺西北伤老父、缺西南伤主母」即此。
 */
export function assessMissingCorner(mc: MissingCorner): MissingCornerImpact {
  const s = Math.max(0, Math.min(1, mc.severity));
  const fam = PALACE_FAMILY[mc.palace];
  const significant = s >= 0.33;
  const dir = PALACE_DIRECTION[mc.palace];
  return {
    palace: mc.palace,
    severity: s,
    direction: dir,
    significant,
    affectedMember: fam.member,
    affectedBody: fam.body,
    summary: significant
      ? `${dir}缺角（缺${Math.round(s * 100)}%）：${dir}属${fam.member}位，主应${fam.body}（${fam.organ}）与该成员运势失援。`
      : `${dir}微凹（${Math.round(s * 100)}%），未达三分之一，暂不作正式缺角论，仅作留意。`,
    starFactor: 1 - 0.6 * s,
    riskAdd: significant ? 0.12 + 0.28 * s : 0.04 * s,
    cures: significant ? cornerCures(mc.palace) : [],
  };
}

/** 缺角补救：以该宫本气之物「补形」，配合五行相生。 */
function cornerCures(p: PalaceIndex): string[] {
  const base: Record<PalaceIndex, string[]> = {
    1: ['正北缺角：置深色圆形水景或黑色鱼缸补坎气；悬挂北方山水画补形。', '中男房间移至一白或本命吉方。'],
    2: ['西南缺角：置陶土大瓮、方形黄玉或泰山石补坤土。', '女主人卧床改设于西南以外之天医/延年方。'],
    3: ['正东缺角：置高身绿植（阔叶）或青龙木雕补震木。', '长子书桌宜移至四绿文昌位。'],
    4: ['东南缺角：置四支富贵竹或木质屏风补巽木。', '长女房间改设，并加强文昌位布置。'],
    5: ['中宫缺（天井/中空）：忌在中宫设厕、设梯；宜以厚重石材或黄玉镇中。'],
    6: ['西北缺角：置铜制或金属圆器（如铜葫芦、金属摆钟）补乾金。', '男主人办公位改设于延年/生气方，忌久坐西北。'],
    7: ['正西缺角：置白色金属摆件或白水晶补兑金。', '幼女房间避开正西，注意口腔呼吸系统检查。'],
    8: ['东北缺角：置泰山石敢当或陶瓷方器补艮土。', '幼子房间改设，注意关节与脾胃调理。'],
    9: ['正南缺角：置红色系装饰或长明灯补离火。', '次女房间改设，注意心血管与视力检查。'],
  };
  return base[p];
}

/** 房间用途。优先级严格按：大门 > 主卧 > 厨房 > 儿童房 > 客厅。 */
export type RoomKind =
  | '大门' | '主卧' | '厨房' | '儿童房' | '客厅'
  | '次卧' | '书房' | '卫浴' | '阳台' | '餐厅' | '玄关'
  | '储藏' | '楼梯' | '办公位' | '收银台' | '会议室' | '其他';

/** 房间权重：概率预测中「同一颗凶星，落在何处后果差多少」。 */
export const ROOM_PRIORITY: Record<RoomKind, number> = {
  大门: 1.0,
  主卧: 0.9,
  厨房: 0.8,
  儿童房: 0.7,
  客厅: 0.6,
  办公位: 0.75,
  收银台: 0.8,
  次卧: 0.5,
  书房: 0.45,
  餐厅: 0.4,
  会议室: 0.4,
  玄关: 0.5,
  卫浴: 0.25,
  阳台: 0.2,
  储藏: 0.15,
  楼梯: 0.3,
  其他: 0.3,
};

/** 严格房间优先序（用于「最优先处理哪一处」的排序）。 */
export const ROOM_ORDER: readonly RoomKind[] = [
  '大门', '主卧', '厨房', '儿童房', '客厅',
] as const;

export interface RoomPlacement {
  readonly id: string;
  readonly kind: RoomKind;
  /** 自定义名称，如「小明房」。 */
  readonly label?: string;
  /** 所占宫位（一间房可跨宫，按面积占比给权重）。 */
  readonly palaces: readonly PalaceIndex[];
  /** 主要归属宫（跨宫时的代表宫）。 */
  readonly primaryPalace: PalaceIndex;
  /** 指派给哪些成员使用（成员 id）。 */
  readonly occupants?: readonly string[];
}

export interface PropertyProfile {
  readonly id: string;
  readonly name: string;
  readonly buildingType: BuildingType;
  /** 楼层；非高层类别可省。 */
  readonly floor?: number;
  /** 坐山（山名或度数）。 */
  readonly sitting: string | number;
  /** 向首；默认取坐山之冲。 */
  readonly facing?: string | number;
  /** 入住 / 落成年（立春年）。 */
  readonly moveInYear: number;
  /** 元运；省略则由 moveInYear 推。 */
  readonly period?: PalaceIndex;
  readonly missingCorners: readonly MissingCorner[];
  readonly rooms: readonly RoomPlacement[];
  /** 建档路径，用于置信度标注。 */
  readonly entryMode: '户型图' | '九宫格' | '罗盘实测';
  /** 是否启用山向奇门层。 */
  readonly enableQiMen?: boolean;
  readonly note?: string;
}

/** 取某宫内的所有房间。 */
export function roomsInPalace(profile: PropertyProfile, p: PalaceIndex): RoomPlacement[] {
  return profile.rooms.filter((r) => r.palaces.includes(p));
}

/** 取某宫的缺角信息（无则 null）。 */
export function missingAt(profile: PropertyProfile, p: PalaceIndex): MissingCorner | null {
  return profile.missingCorners.find((m) => m.palace === p) ?? null;
}

/** 建档完整度自检，用于置信度显示。 */
export function profileCompleteness(profile: PropertyProfile): {
  score: number;
  missing: string[];
} {
  const missing: string[] = [];
  if (typeof profile.sitting === 'string' && !/^\d/.test(profile.sitting)) {
    missing.push('坐山仅给山名未给精确度数（无法判断兼向/替卦）');
  }
  if (requiresFloor(profile.buildingType) && profile.floor == null) missing.push('未填楼层');
  const kinds = new Set(profile.rooms.map((r) => r.kind));
  for (const k of ROOM_ORDER) {
    if (!kinds.has(k) && !(k === '儿童房')) missing.push(`未标注${k}位置`);
  }
  const total = 4 + (requiresFloor(profile.buildingType) ? 1 : 0) + 1;
  const score = Math.max(0, 1 - missing.length / total);
  return { score, missing };
}

export { OUTER_PALACES };
