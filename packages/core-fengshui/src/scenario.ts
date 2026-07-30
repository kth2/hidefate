/**
 * 场景分流：居家 vs 商业。
 *
 * 同一张飞星盘，居家与商业的读法本不相同 ——
 *   居家重「人」：健康、和睦、感情、子女、人丁，山星（丁星）分量重
 *   商业重「财」：财运、客流、效率、老板运、员工稳定，向星（财星）分量重
 *
 * 房间权重亦不同：居家以「大门 > 主卧 > 厨房 > 小孩房 > 客厅」为序；
 * 商业以「大门/入口 > 收银台 > 老板位 > 核心工作区」为序。
 * 此前 ROOM_ORDER 只有一套（居家序），用在店铺上会把「主卧」排在「收银台」前面 —— 显然不对。
 */

import { BUILDING_PROFILES, type BuildingType, type RoomKind } from './property.js';
import type { PalaceIndex } from './constants.js';

export type Scenario = '居家' | '商业';

/** 由建筑类别定场景。公共与工业类按商业论（重效率与财，不重家庭和睦）。 */
export function scenarioOf(t: BuildingType): Scenario {
  return BUILDING_PROFILES[t].category === '住宅' ? '居家' : '商业';
}

/** 各场景的房间优先序（严格）。 */
export const SCENARIO_ROOM_ORDER: Record<Scenario, readonly RoomKind[]> = {
  居家: ['大门', '主卧', '厨房', '儿童房', '客厅'],
  商业: ['大门', '收银台', '老板位', '办公位', '前台接待'],
};

/** 各场景的核心关注维度（用于预测排序与报告侧重）。 */
export const SCENARIO_FOCUS: Record<Scenario, readonly string[]> = {
  居家: ['健康', '感情', '人丁', '意外'],
  商业: ['财运', '事业', '官非', '意外'],
};

/** 峦头 / 理气 的场景权重（依规格）。 */
export const SCENARIO_WEIGHTS: Record<Scenario, { landform: number; qi: number }> = {
  居家: { landform: 0.45, qi: 0.55 },
  商业: { landform: 0.35, qi: 0.65 },
};

export interface ScenarioProfile {
  readonly scenario: Scenario;
  readonly roomOrder: readonly RoomKind[];
  readonly focus: readonly string[];
  readonly landformWeight: number;
  readonly qiWeight: number;
  /** 山星 / 向星 侧重（居家重丁、商业重财）。 */
  readonly shanEmphasis: number;
  readonly xiangEmphasis: number;
  readonly note: string;
}

export function scenarioProfile(t: BuildingType): ScenarioProfile {
  const scenario = scenarioOf(t);
  const w = SCENARIO_WEIGHTS[scenario];
  return {
    scenario,
    roomOrder: SCENARIO_ROOM_ORDER[scenario],
    focus: SCENARIO_FOCUS[scenario],
    landformWeight: w.landform,
    qiWeight: w.qi,
    shanEmphasis: scenario === '居家' ? 1.15 : 0.85,
    xiangEmphasis: scenario === '居家' ? 0.9 : 1.2,
    note:
      scenario === '居家'
        ? '居家以人为本：山星（人丁健康）分量重于向星，房间序为 大门 > 主卧 > 厨房 > 小孩房 > 客厅。'
        : '商业以财为先：向星（财禄）分量重于山星，房间序为 大门/入口 > 收银台 > 老板位 > 核心工作区。',
  };
}

// ───────────────────────── 隔间（Cubicle）─────────────────────────

/**
 * 隔间之法：**先大盘，后小单位。**
 *
 * 整层办公室以其坐山向首排出大盘，个人隔间只是「某一宫之内的一个小单位」，
 * 不可自立坐向另排一盘 —— 一栋楼只有一个坐向，这是体例。
 * 隔间层面要看的是「坐位本身」的四件事：
 *   1. 座向是否合个人命卦（坐凶向吉尚可挽回一半）
 *   2. 背后有无靠（背窗背通道最忌）
 *   3. 是否正对门口／通道（气冲）
 *   4. 青龙白虎是否平衡、头顶有无横梁或空调直吹
 */
export interface CubicleSetup {
  /** 隔间所在宫位（依整层大盘）。 */
  readonly palace: PalaceIndex;
  /** 座位面朝的方位角（0–360）；即人抬头看的方向。 */
  readonly facingDegree?: number;
  /** 背后是否有实墙或高柜。 */
  readonly hasBacking?: boolean;
  /** 是否正对门口或主通道。 */
  readonly facingDoorOrAisle?: boolean;
  /** 头顶是否有横梁。 */
  readonly beamOverhead?: boolean;
  /** 是否被空调／风口直吹。 */
  readonly airDraft?: boolean;
  /** 左（青龙）方是否受压，例如紧贴高柜或墙。 */
  readonly leftCramped?: boolean;
  /** 右（白虎）方是否高压。 */
  readonly rightOverbearing?: boolean;
}

export interface CubicleIssue {
  readonly item: string;
  readonly severity: '严重' | '中等' | '轻微' | '良好';
  readonly statement: string;
  readonly classical: string;
  readonly action: string;
}

/**
 * 隔间评估。
 *
 * @param setup     隔间条件
 * @param mingGua   使用者命卦（如「乾」）；不给则跳过命卦相配之判断
 * @param auspiciousPalaces 该人的四吉方宫位（由八宅算出）
 */
export function assessCubicle(
  setup: CubicleSetup,
  mingGua?: string,
  auspiciousPalaces: readonly PalaceIndex[] = [],
): CubicleIssue[] {
  const out: CubicleIssue[] = [];

  // 1. 座位所在宫是否为其吉方
  if (mingGua && auspiciousPalaces.length > 0) {
    const good = auspiciousPalaces.includes(setup.palace);
    out.push({
      item: '座位所在宫与命卦',
      severity: good ? '良好' : '中等',
      statement: good
        ? `此隔间落在${mingGua}命的四吉方之内，先天条件不错。`
        : `此隔间不在${mingGua}命的四吉方之内。工位通常无法自选，不必强求 —— 下一条更要紧。`,
      classical: '《八宅明镜》以命卦定人之四吉四凶。然位不可移时，古法退一步取「坐凶向吉」。',
      action: good
        ? '座位既在吉方，保持桌面整洁、背后有靠即可发挥。'
        : '位置不能改，就把「朝向」调到自己的吉方 —— 坐凶向吉，仍可挽回大半。',
    });
  }

  // 2. 背后有靠 —— 隔间第一要务
  out.push({
    item: '背后有靠',
    severity: setup.hasBacking ? '良好' : '严重',
    statement: setup.hasBacking
      ? '背后有实墙或高柜为靠，根基稳固，利专注与得助。'
      : '背后无靠（背对通道、走廊或空旷处），坐立不安、易受人非议、决策缺乏支撑。这是隔间最常见也最要紧的一项。',
    classical: '《葬书》：「玄武垂头。」坐必有靠，此为形势第一义。背后空虚则气不聚，人心亦不定。',
    action: setup.hasBacking
      ? '维持现状，勿在背后开通道或移走柜体。'
      : '在椅背后方加一座高背椅、置文件柜或屏风造「人造靠山」 —— 这是成本最低、见效最快的一项调整。',
  });

  // 3. 是否对门／对通道
  if (setup.facingDoorOrAisle) {
    out.push({
      item: '正对门口或主通道',
      severity: '中等',
      statement: '座位正对门口或主通道，人来人往之气直冲，主分心、易受打扰、情绪浮动。',
      classical: '气以直冲为杀。门为气口，正对则受其冲，古谓「门冲座」。',
      action: '桌面靠通道一侧置一排高身文件夹或小盆栽作矮屏；若可调，把桌子转 90°，避开直线。',
    });
  }

  // 4. 横梁压顶
  if (setup.beamOverhead) {
    out.push({
      item: '横梁压顶',
      severity: '中等',
      statement: '头顶正压横梁，主压抑、头痛、思绪受阻，久坐尤忌。',
      classical: '《阳宅十书》忌「梁压」。梁为承重之实，压于人顶则气受阻。',
      action: '首选把座位挪出梁下（哪怕只移半米）。不能移则于梁上做假天花遮盖，或悬两串开口葫芦化其压势。',
    });
  }

  // 5. 空调直吹
  if (setup.airDraft) {
    out.push({
      item: '风口直吹',
      severity: '轻微',
      statement: '被空调或风口长期直吹，主头肩酸痛、易感风寒、精神不济。',
      classical: '《葬书》：「气乘风则散。」风急则气散，人处急风之中，神不能聚。',
      action: '加装导风板改变风向，或将座位略移出风口正下方。此项属实体因素，改了立刻有感。',
    });
  }

  // 6. 龙虎平衡
  if (setup.leftCramped || setup.rightOverbearing) {
    out.push({
      item: '青龙白虎失衡',
      severity: '轻微',
      statement: setup.rightOverbearing
        ? '右（白虎）方高压过左，主口舌是非、受制于人。'
        : '左（青龙）方受压逼窄，主事业助力不足、施展受限。',
      classical: '《葬书》：「青龙蜿蜒，白虎驯頫。」龙宜略高而长，虎宜低伏。虎强龙弱则主口舌。',
      action: setup.rightOverbearing
        ? '在左手方置一盆高身绿植或立式文件架以「扶龙」，令左略高于右。'
        : '清空左手方的堆压之物，留出伸展余地；右方之物宜低。',
    });
  }

  // 7. 座向合命卦
  if (setup.facingDegree != null && mingGua) {
    out.push({
      item: '座位朝向',
      severity: '中等',
      statement: `座位面朝 ${setup.facingDegree.toFixed(0)}°。位置不可改时，朝向是唯一可自主调整的变量。`,
      classical: '八宅之法，位与向皆论。位凶而向吉，谓之「坐凶向吉」，仍得一半之利。',
      action: `尽可能把座椅转向自己的四吉方（生气、天医、延年、伏位任一），哪怕只能转 45° 也有差别。`,
    });
  }

  const rank: Record<CubicleIssue['severity'], number> = { 严重: 0, 中等: 1, 轻微: 2, 良好: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** 属于隔间／工位型的建筑类别。 */
export const CUBICLE_TYPES: readonly BuildingType[] = ['格子间工位', '共享办公'] as const;

export function isCubicleType(t: BuildingType): boolean {
  return CUBICLE_TYPES.includes(t);
}
