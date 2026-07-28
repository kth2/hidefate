/**
 * 户型布局规则 —— 与「飞星落在哪一宫」无关，只看**房间彼此的相对关系**。
 *
 * 这一层是先前完全缺失的：引擎只会说「西南主卧不好」，却看不出
 * 「大门与后门一线对穿」「厕所压住财位」「楼梯落中宫」这类一眼可见的硬伤。
 * 而实务上，这些恰恰是上门看风水最先指出的东西。
 *
 * 全部为确定性判断，每条都带古法依据与可执行化解。
 */

import {
  PALACE_DIRECTION,
  ROOM_META,
  YOU_NIAN_META,
  roomNature,
  type PalaceIndex,
  type PropertyProfile,
  type RiskDomain,
  type RoomKind,
  type RoomPlacement,
} from '@hidefate/core-fengshui';
import type { Cure, Finding, SynthesisResult } from './types.js';

export interface LayoutIssue {
  readonly id: string;
  /** 涉及的宫位（用于在九宫上高亮）。 */
  readonly palaces: readonly PalaceIndex[];
  readonly rooms: readonly string[];
  readonly severity: '严重' | '中等' | '轻微';
  readonly title: string;
  readonly finding: Finding;
  readonly cures: readonly Cure[];
}

/**
 * 判断某个房间放在某宫是否得当。
 *
 * 抽成单一入口，是因为先前九宫详情与布局体检各自用了不同的判据，
 * 结果对同一间厕所给出「正好压住凶星」与「占了吉方」两个相反结论。
 * 判吉凶只能有一套标准 —— 以「八宅吉方 或 飞星当元旺位」为吉，其余按综合分。
 */
export type PlacementVerdict = '得当' | '浪费吉方' | '不利' | '平常';

export interface PlacementJudgement {
  readonly verdict: PlacementVerdict;
  /** 该宫是否为吉方（八宅四吉 或 飞星当元旺位）。 */
  readonly palaceIsAuspicious: boolean;
  readonly text: string;
}

export function judgeRoomPlacement(
  s: SynthesisResult,
  palace: PalaceIndex,
  kind: RoomKind,
): PlacementJudgement {
  const a = s.palaces[palace];
  const period = s.flyingStar.period.period;
  const bz = a.baZhaiStar;
  const auspiciousBaZhai = bz != null && YOU_NIAN_META[bz].auspicious;
  const prosperousStar = a.stars.shan === period || a.stars.xiang === period;
  const palaceIsAuspicious = auspiciousBaZhai || prosperousStar;
  const nature = roomNature(kind);

  if (nature === '宜凶') {
    if (palaceIsAuspicious) {
      return {
        verdict: '浪费吉方',
        palaceIsAuspicious,
        text: `却占了本宫吉气（${auspiciousBaZhai ? `八宅「${bz}」吉方` : '飞星当元旺位'}），属浪费，宜与凶方的房间对调。`,
      };
    }
    return {
      verdict: '得当',
      palaceIsAuspicious,
      text: '正好压住本宫凶星，合古法「凶方宜压」。',
    };
  }

  if (nature === '宜吉') {
    if (palaceIsAuspicious) {
      return { verdict: '得当', palaceIsAuspicious, text: '落在吉方，位置得当。' };
    }
    return { verdict: '不利', palaceIsAuspicious, text: '却落在不利之方，宜优先调整或化解。' };
  }

  return { verdict: '平常', palaceIsAuspicious, text: '' };
}

/** 对宫表：用于判断「一线对穿」。 */
const OPPOSITE: Record<PalaceIndex, PalaceIndex> = {
  1: 9, 9: 1, 3: 7, 7: 3, 2: 8, 8: 2, 4: 6, 6: 4, 5: 5,
};

const SEV_URGENCY: Record<LayoutIssue['severity'], Cure['urgency']> = {
  严重: '立即',
  中等: '本年内',
  轻微: '可从容安排',
};

function mkCure(
  palace: PalaceIndex,
  room: string | null,
  action: string,
  rationale: string,
  avoid: readonly string[],
  domains: readonly RiskDomain[],
  severity: LayoutIssue['severity'],
): Cure {
  return {
    priority: severity === '严重' ? 1 : severity === '中等' ? 3 : 6,
    palace,
    direction: PALACE_DIRECTION[palace],
    room,
    action,
    rationale,
    avoid,
    domains,
    urgency: SEV_URGENCY[severity],
  };
}

const label = (r: RoomPlacement) => r.label ?? r.kind;

/** 找出某类房间（可跨层）。 */
function find(profile: PropertyProfile, kinds: readonly RoomKind[]): RoomPlacement[] {
  return profile.rooms.filter((r) => kinds.includes(r.kind));
}

/**
 * 检查全部布局规则。
 *
 * @param s 已完成的三派合参结果（需要用到八宅吉凶方与飞星旺衰）
 */
export function checkLayout(s: SynthesisResult): LayoutIssue[] {
  const profile = s.profile;
  const issues: LayoutIssue[] = [];

  // ── 1. 穿堂煞：大门与后门／大阳台一线对穿 ──
  const doors = find(profile, ['大门']);
  const backs = find(profile, ['后门', '阳台']);
  for (const d of doors) {
    for (const b of backs) {
      const sameFloor = (d.floorLevel ?? 1) === (b.floorLevel ?? 1);
      if (!sameFloor) continue;
      if (OPPOSITE[d.primaryPalace] !== b.primaryPalace) continue;
      issues.push({
        id: `chuantang-${d.id}-${b.id}`,
        palaces: [d.primaryPalace, b.primaryPalace],
        rooms: [label(d), label(b)],
        severity: '严重',
        title: `穿堂煞：${PALACE_DIRECTION[d.primaryPalace]}大门与${PALACE_DIRECTION[b.primaryPalace]}${b.kind}一线对穿`,
        finding: {
          schools: ['形峦缺角'],
          confidence: '高',
          statement:
            `大门在${PALACE_DIRECTION[d.primaryPalace]}，${b.kind}在正对面的${PALACE_DIRECTION[b.primaryPalace]}，` +
            `前后一线贯通，气进即出、穿堂而过，聚不住财，主漏财与家人聚少离多。`,
          principle: '《阳宅十书》：「前后相通，谓之穿心，主财物不聚。」气忌直冲直泄，宜曲则有情。',
          impact: -0.55,
          domains: ['财运', '感情'],
        },
        cures: [
          mkCure(
            d.primaryPalace,
            label(d),
            '在两口之间设玄关屏风、置高身柜或挂门帘作阻隔，让气路转折 —— 不必封死，能挡住「一眼望穿」即可。',
            '气宜曲不宜直。加一道阻隔把直线气路折成回旋，气才留得住。',
            ['两口之间完全通透', '摆放通透玻璃隔断（挡不住气）'],
            ['财运', '感情'],
            '严重',
          ),
        ],
      });
    }
  }

  // ── 2. 污秽压吉方：厕所／卫浴占了八宅四吉方或飞星旺位 ──
  const wets = profile.rooms.filter((r) => roomNature(r.kind) === '宜凶');
  for (const r of wets) {
    const p = r.primaryPalace;
    const a = s.palaces[p];
    // 与九宫详情共用同一判据，避免两处结论打架
    if (judgeRoomPlacement(s, p, r.kind).verdict !== '浪费吉方') continue;

    const bz = a.baZhaiStar;
    const isAuspiciousBaZhai = bz != null && YOU_NIAN_META[bz].auspicious;
    const period = s.flyingStar.period.period;
    const isProsperousStar = a.stars.xiang === period || a.stars.shan === period;

    const why: string[] = [];
    if (isAuspiciousBaZhai) why.push(`八宅之「${bz}」吉方`);
    if (isProsperousStar) why.push(`飞星当元旺位（${a.stars.shan}／${a.stars.xiang}）`);

    issues.push({
      id: `wet-on-good-${r.id}`,
      palaces: [p],
      rooms: [label(r)],
      severity: r.kind === '厕所' || r.kind === '卫浴' ? '中等' : '轻微',
      title: `${label(r)}占了${PALACE_DIRECTION[p]}的吉方`,
      finding: {
        schools: ['八宅', '玄空飞星'],
        confidence: '高',
        statement:
          `${PALACE_DIRECTION[p]}为${why.join('、')}，却安排了${label(r)}。` +
          `此类空间宜「压凶」而非「占吉」—— 吉气被污秽或杂物压住，等于把家中最好的一方废掉了。`,
        principle: '古法「吉方宜开、凶方宜压」：厕所、储藏、楼梯宜镇凶星；若反占吉方，主该方所司之事（财、学业、贵人）受阻。',
        impact: -0.4,
        domains: isProsperousStar ? ['财运'] : ['事业', '健康'],
      },
      cures: [
        mkCure(
          p,
          label(r),
          `若能改动：与落在凶方的储藏、杂物间对调最理想。无法改动时 —— 保持此处**长期干燥、通风、门常闭**，` +
            `置粗盐或炭包吸秽，并在真正的吉方（另设）补上常用功能区，把吉气用起来。`,
          '压吉之害在于「吉气被镇住发不出」。做不到搬移，就退而求其次：减少秽气、把吉方的功能转移到别处启用。',
          ['此处长期潮湿积水', '门常开对着客厅或餐厅', '在此方堆放杂物'],
          ['财运', '事业'],
          '中等',
        ),
      ],
    });
  }

  // ── 3. 中宫忌置：厕所、楼梯、厨房落中宫 ──
  const centreBad: RoomKind[] = ['厕所', '卫浴', '楼梯', '厨房', '灶位'];
  for (const r of profile.rooms) {
    if (r.primaryPalace !== 5 || !centreBad.includes(r.kind)) continue;
    const isStair = r.kind === '楼梯';
    issues.push({
      id: `centre-${r.id}`,
      palaces: [5],
      rooms: [label(r)],
      severity: '严重',
      title: `${label(r)}落于中宫`,
      finding: {
        schools: ['形峦缺角'],
        confidence: '高',
        statement: isStair
          ? '楼梯落在中宫，谓之「穿心煞」。中宫为全宅之心，楼梯动而泄气，等于日夜从家的中心抽气，主家运不聚、家人易生嫌隙。'
          : `${r.kind}落在中宫。中宫属土、为全宅元气所聚，${r.kind === '厨房' || r.kind === '灶位' ? '火煞焚心，主家人脾气躁、心血管与眼疾' : '污秽压心，主慢性病缠身、家运滞塞'}。`,
        principle: '《阳宅三要》：「中宫乃一宅之极，宜静宜洁，忌污忌动。」中宫受污受动，全宅之气俱受牵累。',
        impact: -0.6,
        domains: isStair ? ['财运', '感情'] : ['健康'],
      },
      cures: [
        mkCure(
          5,
          label(r),
          isStair
            ? '楼梯难以移位，退而求其次：梯下不可堆杂物或设厕，保持干净明亮；梯口加地毯缓冲，并在中宫置厚重黄玉或陶瓷镇之。'
            : `${r.kind}若能外移最佳。不能移则强化排风与除湿，保持长期洁净干燥，并在中宫置厚重土性物（黄玉、陶瓮）稳定元气。`,
          '中宫属土，宜厚重安定。搬不走就以土性重物压住，并断绝其污秽与动荡之源。',
          ['梯下设厕或堆杂物', '中宫做镂空、天井直通', '在中宫摆放大量水景'],
          ['健康', '财运'],
          '严重',
        ),
      ],
    });
  }

  // ── 4. 神位安置 ──
  for (const r of find(profile, ['神位', '祖先牌位'])) {
    const p = r.primaryPalace;
    const a = s.palaces[p];
    const bz = a.baZhaiStar;
    const bad = bz != null && !YOU_NIAN_META[bz].auspicious;
    const nearWet = profile.rooms.some(
      (x) =>
        (x.kind === '厕所' || x.kind === '卫浴') &&
        (x.floorLevel ?? 1) === (r.floorLevel ?? 1) &&
        (x.primaryPalace === p || OPPOSITE[x.primaryPalace] === p),
    );
    if (!bad && !nearWet && p !== 5) continue;

    const reasons: string[] = [];
    if (bad) reasons.push(`此方为八宅之「${bz}」凶方`);
    if (nearWet) reasons.push('与厕所同宫或正对');
    if (p === 5) reasons.push('位于中宫');

    issues.push({
      id: `altar-${r.id}`,
      palaces: [p],
      rooms: [label(r)],
      severity: nearWet ? '严重' : '中等',
      title: `${label(r)}安置有碍：${reasons.join('、')}`,
      finding: {
        schools: ['八宅'],
        confidence: '高',
        statement:
          `${label(r)}设于${PALACE_DIRECTION[p]}，${reasons.join('，')}。` +
          `神位讲究「坐吉向吉、背后有靠、前方明堂开阔」，且须远离污秽与动荡之处。`,
        principle: '安神三忌：一忌背后无实墙（无靠），二忌对厕对灶（秽气冲犯），三忌置于梁下或楼梯下（受压）。',
        impact: -0.45,
        domains: ['健康', '事业'],
      },
      cures: [
        mkCure(
          p,
          label(r),
          `择本宅四吉方（尤宜生气、延年）重新安位：背靠实墙、不在梁下、前方留出明堂，并避开与厕所、厨房同宫或正对。` +
            `迁移神位宜择日、先请后安，程序上请依家中素来的礼俗办理。`,
          '神位主一家心之所安，位不正则人心不宁。宁可空着不设，也不宜草率安于凶方或秽处。',
          ['神位背后为厕所或楼梯', '神位正对厕门、房门或灶口', '安于梁下受压'],
          ['健康', '事业'],
          '中等',
        ),
      ],
    });
  }

  // ── 5. 灶位：火忌与五黄二黑同宫 ──
  for (const r of find(profile, ['灶位', '厨房'])) {
    const p = r.primaryPalace;
    const a = s.palaces[p];
    const sha = [a.stars.shan, a.stars.xiang, a.stars.annual].filter((x) => x === 5 || x === 2);
    if (sha.length === 0) continue;
    issues.push({
      id: `stove-${r.id}`,
      palaces: [p],
      rooms: [label(r)],
      severity: sha.includes(5) ? '严重' : '中等',
      title: `${label(r)}与${sha.includes(5) ? '五黄' : '二黑'}同宫`,
      finding: {
        schools: ['玄空飞星'],
        confidence: '高',
        statement:
          `${PALACE_DIRECTION[p]}的${label(r)}见${sha.includes(5) ? '五黄正煞' : '二黑病符'}。` +
          `灶属火，火生土，正好替这两颗土煞添薪，凶性大增 —— 主家人肠胃病、妇疾，${sha.includes(5) ? '重则见急症与意外。' : '慢性病缠绵难愈。'}`,
        principle: '「五黄最忌火来生」。灶火日日燃于煞方，等于天天替凶星补气，此为厨灶第一忌。',
        impact: -0.6,
        domains: ['健康'],
      },
      cures: [
        mkCure(
          p,
          label(r),
          '灶座若能移出此方最佳。不能移则：把**灶口转朝本宅四吉方**（灶口即炉具面向操作者的一侧／燃气进气方向），' +
            '并在此方置铜器（六帝钱、铜葫芦）泄土气。',
          '古法「灶座压凶、灶口朝吉」：灶座压住凶方是好事，但灶口必须朝吉方引吉气入食。金能泄土，故用铜器。',
          ['此方加红色装饰或明火摆件', '灶口朝向凶方', '在此方摆放盆栽（木克土反激）'],
          ['健康'],
          '严重',
        ),
      ],
    });
  }

  // ── 6. 电箱与火煞 ──
  for (const r of find(profile, ['电箱'])) {
    const a = s.palaces[r.primaryPalace];
    if (![a.stars.shan, a.stars.xiang, a.stars.annual].some((x) => x === 5 || x === 9 || x === 7)) continue;
    issues.push({
      id: `elec-${r.id}`,
      palaces: [r.primaryPalace],
      rooms: [label(r)],
      severity: '中等',
      title: `电箱在${PALACE_DIRECTION[r.primaryPalace]}，与火／金煞同宫`,
      finding: {
        schools: ['玄空飞星'],
        confidence: '中',
        statement: `${PALACE_DIRECTION[r.primaryPalace]}见九紫火或七赤金、五黄土，电箱属火，同宫则火险与线路故障的机率上升。`,
        principle: '九紫属火主火烛，七赤属金主刀兵，五黄主横祸。三者与电器聚于一方，古法视为火厄之兆。',
        impact: -0.3,
        domains: ['意外'],
      },
      cures: [
        mkCure(
          r.primaryPalace,
          label(r),
          '请电工检查线路与负载，装设漏电断路器与烟感器；此方勿堆放纸箱布料等易燃物。',
          '风水提示的是「概率抬升」，对应的现实动作就是把可控的隐患先排除掉。',
          ['电箱周围堆放杂物', '此方加装大功率电器'],
          ['意外'],
          '中等',
        ),
      ],
    });
  }

  // ── 7. 门冲：大门直对卧房门／厕所门（同宫或对宫且皆为气口）──
  for (const d of doors) {
    const facing = OPPOSITE[d.primaryPalace];
    const conflict = profile.rooms.filter(
      (r) =>
        (r.floorLevel ?? 1) === (d.floorLevel ?? 1) &&
        r.primaryPalace === facing &&
        (r.kind === '厕所' || r.kind === '卫浴'),
    );
    for (const c of conflict) {
      issues.push({
        id: `door-toilet-${d.id}-${c.id}`,
        palaces: [d.primaryPalace, facing],
        rooms: [label(d), label(c)],
        severity: '中等',
        title: `大门正对${label(c)}`,
        finding: {
          schools: ['形峦缺角'],
          confidence: '中',
          statement: `进门即见${label(c)}，秽气迎门，主纳气不洁、影响家人健康与观感。`,
          principle: '「开门见厕，家宅不宁」。门为纳气之口，所纳者宜洁不宜秽。',
          impact: -0.35,
          domains: ['健康'],
        },
        cures: [
          mkCure(
            facing,
            label(c),
            '厕门加装门帘或改为常闭；门内置一盆常绿植物或屏风遮挡视线；保持排风常开。',
            '挡住直视与阻断气味，即可大幅削弱「开门见厕」之应。',
            ['厕门常开', '厕所无排风'],
            ['健康'],
            '中等',
          ),
        ],
      });
    }
  }

  // 严重者排前
  const rank: Record<LayoutIssue['severity'], number> = { 严重: 0, 中等: 1, 轻微: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** 布局体检摘要。 */
export function layoutSummary(issues: readonly LayoutIssue[]): string {
  if (issues.length === 0) {
    return '房间彼此的相对关系未见明显硬伤（无穿堂、无污秽压吉、中宫与神位安置正常）。';
  }
  const bad = issues.filter((i) => i.severity === '严重').length;
  return (
    `共发现 ${issues.length} 处布局问题` +
    (bad > 0 ? `，其中 ${bad} 处属严重（穿堂、中宫受污或灶压煞方之类，宜优先处理）。` : '，均非急件，可从容调整。')
  );
}

export { ROOM_META };
