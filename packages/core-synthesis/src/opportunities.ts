/**
 * 吉方与催旺引擎 —— 与 layoutRules（挑毛病）相对的另一半。
 *
 * 先前整个系统只会报凶：哪里危险、哪里要化解。但堪舆之用，一半在「避」，
 * 一半在「用」。《玄空秘旨》云「衰旺有凭，逢生旺则荣显」——
 * 旺位若空置不用，与凶位无异；凶位若镇之得法，亦不为害。
 *
 * 核心原则：**旺位宜动，衰位宜静。**
 *   动 = 常开窗、多走动、开门、放收银台、装水景、设办公位
 *   静 = 少停留、不动土、不装修、封起来堆物
 *
 * 本模块只做确定性查表与推导，每条机会都给出「在哪里、为什么、怎么用、忌什么」。
 */

import {
  OUTER_PALACES,
  PALACE_DIRECTION,
  STAR_META,
  STAR_NAME,
  STAR_WUXING,
  YOU_NIAN_META,
  invert,
  starPhase,
  type PalaceIndex,
  type RiskDomain,
} from '@hidefate/core-fengshui';
import type { Finding, Member, SynthesisResult } from './types.js';

/** 吉位类别。 */
export type OpportunityKind =
  | '正财位' | '偏财位' | '文昌位' | '桃花位' | '贵人位' | '添丁位' | '健康位' | '当旺气口';

export interface Opportunity {
  readonly kind: OpportunityKind;
  readonly palace: PalaceIndex;
  readonly direction: string;
  /** 强度 0–1。 */
  readonly strength: number;
  /** 一句话结论。 */
  readonly headline: string;
  readonly finding: Finding;
  /** 怎么用起来（催旺法），具体可执行。 */
  readonly howToUse: readonly string[];
  /** 忌什么 —— 用错反而泄气。 */
  readonly avoid: readonly string[];
  /** 此方对谁尤其有利（成员 id）。 */
  readonly bestFor: readonly string[];
  readonly domains: readonly RiskDomain[];
}

const NEUTRAL_FINDING = (statement: string, principle: string, domains: RiskDomain[]): Finding => ({
  schools: ['玄空飞星'],
  confidence: '高',
  statement,
  principle,
  impact: 0.5,
  domains,
});

/**
 * 找出全宅吉位与催旺法。
 *
 * @param members 成员；用于标出「此方对谁尤其有利」（八宅命卦交叉）
 */
export function findOpportunities(
  s: SynthesisResult,
  members: readonly Member[] = [],
): Opportunity[] {
  const out: Opportunity[] = [];
  const period = s.flyingStar.period.period;

  /** 以命卦起盘，看该宫是否落在此人的四吉方。 */
  const membersFavouring = (p: PalaceIndex): string[] => {
    if (p === 5) return [];
    return members
      .filter((m) => {
        try {
          const gua = m.mingGua.gua as never;
          return (['生气', '天医', '延年', '伏位'] as const).some(
            (st) => GUA_TO_PALACE[invert(gua, st)] === p,
          );
        } catch {
          return false;
        }
      })
      .map((m) => m.id);
  };

  for (const p of OUTER_PALACES) {
    const a = s.palaces[p];
    const dir = PALACE_DIRECTION[p];
    const { shan, xiang, annual } = a.stars;
    const bz = a.baZhaiStar;
    const favouring = membersFavouring(p);

    // ── 正财位：向星当旺 ──
    if (xiang === period) {
      out.push({
        kind: '正财位',
        palace: p,
        direction: dir,
        strength: 0.95,
        headline: `${dir}是全宅正财位 —— 当元${STAR_NAME[xiang]}向星到此，主正财、事业收入`,
        finding: NEUTRAL_FINDING(
          `${dir}向星为当元${STAR_NAME[xiang]}，正当旺令。向星管财禄，旺星到方即为财位，此乃全宅进财之机所在。`,
          '《玄空秘旨》：「衰旺有凭，逢生旺则荣显。」向星当令之方谓之旺方，宜动宜开，动则财气流通。',
          ['财运', '事业'],
        ),
        howToUse: [
          `${dir}宜「动」：常开窗通风、多走动、设为主要活动区，气动则财动。`,
          '此方最宜设：大门或主气口、收银台、保险箱、办公桌、财务室。',
          '可置流动水景（鱼缸、流水摆件）催旺 —— 向星旺方见水为「零神得水」，是玄空正法催财。',
          '保持明亮整洁，忌堆放杂物阻断气路。',
        ],
        avoid: ['此方设厕所、储藏或长期封闭不用', '摆放厚重家具堵死通道', '长期昏暗积尘'],
        bestFor: favouring,
        domains: ['财运', '事业'],
      });
    }

    // ── 添丁位：山星当旺 ──
    if (shan === period) {
      out.push({
        kind: '添丁位',
        palace: p,
        direction: dir,
        strength: 0.9,
        headline: `${dir}是旺丁位 —— 当元${STAR_NAME[shan]}山星到此，主人丁、健康、贵气`,
        finding: NEUTRAL_FINDING(
          `${dir}山星为当元${STAR_NAME[shan]}，正当旺令。山星管人丁与健康，旺星到方宜静宜实，主家人身体康泰、添丁旺后。`,
          '《玄空秘旨》：「山上龙神不下水」——山星宜居高实之处，得实山或高柜厚墙则丁气得助。',
          ['人丁', '健康'],
        ),
        howToUse: [
          `${dir}宜「静」而「实」：设主卧、卧床，或置高柜、厚重书架、山水画（有山者）。`,
          '求子添丁者，夫妻主卧设于此方最宜。',
          '可置泰山石、玉器等厚重之物助山星。',
          '老人房设此方亦佳，主身体安泰。',
        ],
        avoid: ['此方开大窗、设水景鱼缸（山星见水为「下水」，反损人丁）', '设为通道或长期空置'],
        bestFor: favouring,
        domains: ['人丁', '健康'],
      });
    }

    // ── 文昌位：四绿，或一四同宫 ──
    const hasSi = shan === 4 || xiang === 4 || annual === 4;
    const yiSi = [shan, xiang, annual];
    const isWenChang = hasSi && (yiSi.includes(1) || annual === 4 || xiang === 4);
    if (isWenChang) {
      const combo = yiSi.includes(1) && yiSi.includes(4);
      out.push({
        kind: '文昌位',
        palace: p,
        direction: dir,
        strength: combo ? 0.9 : 0.7,
        headline: combo
          ? `${dir}是文昌位（一四同宫）—— 主科名文章、考试升学，读书人第一吉方`
          : `${dir}见四绿文昌 —— 利读书、考试、创作与文职升迁`,
        finding: NEUTRAL_FINDING(
          combo
            ? `${dir}一白与四绿同宫，水木相生。《玄机赋》云「一四同宫，准发科名之显」，为催文昌最正之局。`
            : `${dir}见四绿文曲星。四绿属木，主文章科名，虽未成一四同宫之全局，仍利读书与创作。`,
          '《玄机赋》：「一四同宫，准发科名之显。」四绿为文曲，一白为魁星，二者相会主功名。',
          ['事业'],
        ),
        howToUse: [
          `${dir}设书桌、书房、孩子的学习角，坐此方读书事半功倍。`,
          '置四支富贵竹于清水中（取「四绿」之数，水木相生催文昌）。',
          '可放文昌塔、毛笔架；保持桌面整洁明亮。',
          '备考、写论文、做创意工作期间，尽量把主要工作时段安排在此方。',
        ],
        avoid: ['此方堆杂物、设厕所（污秽压文昌，主学业受阻）', '摆放大量金属（金克木，伤文昌）'],
        bestFor: favouring,
        domains: ['事业'],
      });
    }

    // ── 桃花位：一白 ──
    if (shan === 1 || xiang === 1 || annual === 1) {
      out.push({
        kind: '桃花位',
        palace: p,
        direction: dir,
        strength: 0.65,
        headline: `${dir}见一白 —— 主人缘、桃花与贵人，未婚者可催正缘`,
        finding: NEUTRAL_FINDING(
          `${dir}见一白贪狼星。一白属水，主智慧、人缘与桃花。当令则聪明得贵，失令则易涉酒色。`,
          '《玄机赋》：「金水多情。」一白为桃花星，主人际与感情之机。',
          ['感情', '事业'],
        ),
        howToUse: [
          `未婚求正缘者：${dir}置鲜花（真花，勤换）、清水或圆形玻璃器皿。`,
          '做销售、公关、需广结人脉者，此方设会客区或工作位有助人缘。',
          '保持此方整洁、光线柔和。',
        ],
        avoid: [
          '已婚者不宜在此方大肆催动桃花（尤忌主卧设于此方又摆水景），恐招外缘',
          '摆放仿真花、枯萎花（主虚情假意）',
        ],
        bestFor: favouring,
        domains: ['感情'],
      });
    }

    // ── 贵人位：六白，或八宅天医／延年 ──
    const hasLiu = shan === 6 || xiang === 6 || annual === 6;
    if (hasLiu || bz === '延年') {
      out.push({
        kind: '贵人位',
        palace: p,
        direction: dir,
        strength: hasLiu && bz === '延年' ? 0.85 : 0.65,
        headline: `${dir}主贵人扶助${bz === '延年' ? '与感情和合' : ''} —— 宜设主位、谈判座`,
        finding: NEUTRAL_FINDING(
          hasLiu
            ? `${dir}见六白武曲星，属金，主权威、贵人与驿马之财。${bz === '延年' ? `又为八宅「延年」方，主婚姻和合、人际圆融。` : ''}`
            : `${dir}为八宅「延年」方（武曲金），主感情和睦、寿元绵长、人际圆融。`,
          '六白武曲主权贵决断；八宅延年主和合。二者皆利人事关系与主事者之位。',
          ['事业', '感情'],
        ),
        howToUse: [
          `${dir}宜设：老板位、家主座位、谈判与会客区。`,
          '夫妻卧房设于延年方，主感情和睦。',
          '可置铜制或金属摆件（铜钟、金属摆钟）助六白金气。',
          '需要贵人相助、谈合作、求职面试前，可在此方静坐片刻整理思路。',
        ],
        avoid: ['此方杂乱无章', '摆放大量红色或明火（火克金，伤贵人气）'],
        bestFor: favouring,
        domains: ['事业', '感情'],
      });
    }

    // ── 健康位：八宅天医 ──
    if (bz === '天医') {
      out.push({
        kind: '健康位',
        palace: p,
        direction: dir,
        strength: 0.7,
        headline: `${dir}是天医方 —— 主健康、病去身安，久病者宜居此`,
        finding: NEUTRAL_FINDING(
          `${dir}为本宅八宅「天医」方（巨门土），主健康、食禄与贵人相助。`,
          '八宅四吉之一，天医主病去身安。《八宅明镜》以天医方为养病、进食之吉方。',
          ['健康'],
        ),
        howToUse: [
          `${dir}宜设：老人房、病人静养之处、餐厅（主食禄）。`,
          '长期体弱或久病未愈者，卧床移至此方。',
          '厨房设于天医方亦佳，主一家饮食康健。',
        ],
        avoid: ['此方设厕所或垃圾区', '长期阴暗潮湿'],
        bestFor: favouring,
        domains: ['健康'],
      });
    }

    // ── 偏财位：七赤当令或九紫会七（仅在得令时论）──
    const qiPhase = starPhase(7, period);
    if ((xiang === 7 || shan === 7) && (qiPhase === '当旺' || qiPhase === '生气')) {
      out.push({
        kind: '偏财位',
        palace: p,
        direction: dir,
        strength: 0.5,
        headline: `${dir}见七赤得令 —— 传统以此论偏财与口才之利`,
        finding: NEUTRAL_FINDING(
          `${dir}见七赤破军星，且当元得令。古法以七赤当令主偏财、口才辩才与娱乐服务之利；一旦失令则转为盗劫口舌。`,
          '《紫白诀》：七赤当运则为财星，失运则为劫盗。星之吉凶随元运而转，不可一概而论。',
          ['财运'],
        ),
        howToUse: [
          `${dir}宜作：谈判、销售、直播展示、以口才营生之处。`,
          '经营娱乐、餐饮、服务业者，可将迎客区设于此方。',
        ],
        avoid: [
          '此方摆放刀剑利器',
          '把「偏财位」理解为必中彩票 —— 详见下方说明',
        ],
        bestFor: favouring,
        domains: ['财运'],
      });
    }

    // ── 当旺气口：大门落在旺方 ──
    const hasDoor = a.rooms.some((r) => r.kind === '大门');
    if (hasDoor && (xiang === period || (bz != null && YOU_NIAN_META[bz].auspicious))) {
      out.push({
        kind: '当旺气口',
        palace: p,
        direction: dir,
        strength: 0.9,
        headline: `${dir}大门开在吉方 —— 这是本宅最大的一项先天优势`,
        finding: NEUTRAL_FINDING(
          `大门位于${dir}，${xiang === period ? `向星当元${STAR_NAME[xiang]}到此` : `又为八宅「${bz}」吉方`}。` +
            `门为全宅第一气口，纳气之吉凶影响最大。此门开得正，是很难得的先天条件。`,
          '《阳宅三要》以门、主、灶为三要，而门居其首。门纳吉气，则全宅受益。',
          ['财运', '事业'],
        ),
        howToUse: [
          '保持门口明亮整洁、门轴顺滑无声，进出顺畅即气顺。',
          '门内可置一盏常明小灯或绿植（勿挡道），引气入宅。',
          '既有此优势，日常尽量走此门进出，少走侧门后门。',
        ],
        avoid: ['门口堆鞋堆杂物', '门前正对垃圾桶或电箱', '门内立即见厕所或镜子'],
        bestFor: favouring,
        domains: ['财运', '事业'],
      });
    }
  }

  return out.sort((a, b) => b.strength - a.strength);
}

/** 卦名 → 宫位（供命卦交叉用）。 */
const GUA_TO_PALACE: Record<string, PalaceIndex> = {
  坎: 1, 坤: 2, 震: 3, 巽: 4, 乾: 6, 兑: 7, 艮: 8, 离: 9,
};

/** 吉方摘要。 */
export function opportunitySummary(list: readonly Opportunity[]): string {
  if (list.length === 0) {
    return '本宅当元未见明显旺位可催。此非绝境 —— 元运流转，待流年吉星到方时另有可用之机；眼下以守成、化解为主。';
  }
  const top = list.slice(0, 3);
  return (
    `本宅可用之吉方共 ${list.length} 处，其中最值得先用起来的是：` +
    top.map((o) => `${o.direction}（${o.kind}）`).join('、') +
    '。切记「旺位宜动、衰位宜静」—— 吉方若空置封闭，与凶方无异。'
  );
}

/**
 * 关于「偏财 / 中彩票」的说明。
 *
 * 用户常问「哪个方位能中彩票」。传统确有偏财位之说，但须讲清楚分寸 ——
 * 这既是学理上的诚实，也是不把人往赌桌上推的分寸。
 */
export const WINDFALL_NOTE = [
  '传统确有「偏财位」之说（多以七赤当令、或九紫会七赤论），主意外之财与口才之利。',
  '但须说清楚两点：',
  '一、风水所能影响者，是「机会与概率」，非「结果」。旺位得法，可助人思路清明、人缘通达、把握住本来就存在的机会；',
  '　　它改变不了彩票的开奖概率 —— 那是纯粹的数学，不受方位左右。',
  '二、古法论财，正财（向星当旺、勤业所得）远重于偏财。《紫白诀》论七赤，当令方为财星，失令即转劫盗，',
  '　　可见偏财之性本就浮动不定，不是可以倚仗的东西。',
  '若以博彩为生财之道，风水帮不上忙，反易因「守着旺位等横财」而误了正业。这一点，堪舆不当讳言。',
].join('\n');
