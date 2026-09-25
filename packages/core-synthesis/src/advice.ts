/**
 * 风水师建言 —— 人生八个方面，逐项给「现在如何、宜、忌、依据」。
 *
 * 使用者的原话：「多数关于事业，没有健康、儿女、意外、感情、学业的考虑。」
 * 风水师上门看一个人，本来就是逐项过：身体、出入平安、婚姻、子嗣、读书、事业、财、人际。
 *
 * **全部来自已有的古法表，不新造任何断语或数字**：
 *   - 八宅个人四吉方：天医主病去身安、延年主婚姻和合、生气主添丁进财与进取、伏位主安稳利读书
 *   - 当年紫白飞星：四绿文昌、九紫喜庆、八白财丁、六白武曲、一白贪狼；五黄二黑三碧七赤为宜静之方
 *   - 年支桃花（申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子）
 *   - 全宅吉位（findOpportunities）：文昌位、添丁位、正财位、贵人位、健康位……
 *   - 此人今年各方面比平常高还是低（buildPersonView 的结果）
 */

import {
  PALACE_DIRECTION,
  STAR_NAME,
  personalDirections,
  type PalaceIndex,
  type YouNianStar,
} from '@hidefate/core-fengshui';
import { taoHuaOf } from '@hidefate/core-bazi';
import { palaceOfStar } from './alerts.js';
import { aspectApplies, lifeStageOf, type Aspect, type LifeStage } from './family.js';
import { findOpportunities, type Opportunity, type OpportunityKind } from './opportunities.js';
import type { PersonDomainCell } from './person.js';
import type { RelativeLevel } from './relative.js';
import type { Member, SynthesisResult } from './types.js';

export interface AspectAdvice {
  readonly aspect: Aspect;
  /** 今年此方面比平常高还是低；无相关条目为 null。 */
  readonly status: RelativeLevel | null;
  /** 现状一句话。 */
  readonly statusNote: string;
  /** 风水师的重点提示。 */
  readonly focus: string;
  readonly yi: readonly string[];
  readonly ji: readonly string[];
  readonly basis: readonly string[];
}

const OPP_ASPECT: Readonly<Partial<Record<OpportunityKind, Aspect>>> = {
  健康位: '健康',
  桃花位: '感情',
  添丁位: '子女',
  文昌位: '学业',
  贵人位: '事业',
  当旺气口: '事业',
  正财位: '财运',
  偏财位: '财运',
};

const ZHI_DIRECTION: Readonly<Record<string, string>> = { 子: '正北', 午: '正南', 卯: '正东', 酉: '正西' };

/** 婚姻中：与另一位成年家人同住一间卧房，或称谓写明。 */
function isPartnered(m: Member, members: readonly Member[], s: SynthesisResult, year: number): boolean {
  if (m.relation && /夫|妻|太太|先生|老公|老婆|男主人|女主人|丈夫/.test(m.relation)) return true;
  return s.profile.rooms.some(
    (r) =>
      r.occupants?.includes(m.id) &&
      r.occupants.some((o) => o !== m.id && members.some((x) => x.id === o && year - x.chart.input.year >= 18)),
  );
}

export function buildAspectAdvice(
  s: SynthesisResult,
  members: readonly Member[],
  memberId: string,
  cells: readonly PersonDomainCell[],
  opportunities: readonly Opportunity[] = findOpportunities(s, members),
): AspectAdvice[] {
  const m = members.find((x) => x.id === memberId);
  if (!m) return [];
  const year = s.year;
  const stage: LifeStage = lifeStageOf(m, year);
  const dirs = personalDirections(m.mingGua.gua as never);
  const my = (star: YouNianStar) => {
    const d = [...dirs.best, ...dirs.worst].find((x) => x.star === star)!;
    return PALACE_DIRECTION[d.palace];
  };
  const at = (star: PalaceIndex) => PALACE_DIRECTION[palaceOfStar(year, star)];
  /** 「二黑到西北」；句中第一处由调用处加「今年」，免得一句里「今年」重复。 */
  const ys = (star: PalaceIndex) => `${STAR_NAME[star]}到${at(star)}`;
  const oppFor = (aspect: Aspect) => opportunities.filter((o) => OPP_ASPECT[o.kind] === aspect).sort((a, b) => b.strength - a.strength)[0];
  const partnered = isPartnered(m, members, s, year);
  const yearZhi = m.chart.pillars.find((p) => p.position === '年柱')?.zhi ?? null;
  const taoHua = yearZhi ? taoHuaOf(yearZhi) : null;
  const taoHuaDir = taoHua ? ZHI_DIRECTION[taoHua] ?? null : null;

  const statusOf = (aspect: Aspect) => {
    const c = cells.find((x) => x.domain === aspect);
    if (!c || c.relative == null || !c.top) return { status: null, statusNote: '今年这处房子没有专门牵动这一方面的条目。' };
    const where = `${c.top.direction}${c.top.room ? `的${c.top.room}` : ''}`;
    return {
      status: c.relative,
      statusNote: c.relative === '与平常相当' ? `与平常相当（主要来自${where}）。` : `比平常${c.relative}，主要来自${where}。`,
    };
  };

  const withOpp = (aspect: Aspect, yi: string[]) => {
    const o = oppFor(aspect);
    if (o) yi.push(`本宅${o.kind}在${o.direction}：${o.howToUse[0] ?? o.headline}`);
    return yi;
  };

  const all: Record<Aspect, Omit<AspectAdvice, 'aspect' | 'status' | 'statusNote'>> = {
    健康: {
      focus:
        stage === '儿童'
          ? `小儿气弱，床位与床头最要紧：床头朝${my('天医')}（天医），远离五黄、二黑所到之方。`
          : stage === '长者'
            ? `长者体虚，尤忌二黑病符：今年${ys(2)}，此方宜静；床头朝${my('天医')}（天医）。`
            : `床头朝${my('天医')}（天医）是最省事的养身法；今年${ys(2)}、${ys(5)}，这两方宜静。`,
      yi: withOpp('健康', [
        `床头或常坐之位朝${my('天医')}（本人天医方）。`,
        `今年${ys(2)}、${ys(5)}：此两方放铜器（六帝钱、铜葫芦）泄土，保持安静整洁。`,
      ]),
      ji: [`床头朝${my('绝命')}（本人绝命方）`, `在${at(5)}、${at(2)}动土、装修或久坐`],
      basis: ['八宅：「天医主病去身安」「绝命主重病」。', '紫白：「二黑病符」「五黄正煞，不拘临方到向，人口常损」。'],
    },
    意外: {
      focus: `今年${ys(5)}、${ys(3)}、${ys(7)}：这三方少动土、少堆利器；看「逐月」里加重的月份，出行与器械多留心。`,
      yi: [`${at(5)}、${at(3)}、${at(7)}三方保持整洁，挂铜铃或放铜器化解。`, '逐月视图里「加重」的月份，出行、运动、用刀火多留一分心。'],
      ji: [`床或座位落在${my('五鬼')}（本人五鬼方，主意外横祸）`, `利器、工具堆放在${at(7)}（七赤破军主刀伤）`],
      basis: ['紫白：「五黄主横祸」「三碧蚩尤主斗殴」「七赤破军主刀伤、火险」。', '八宅：「五鬼主意外、失窃、火险」。'],
    },
    感情: partnered
      ? {
          focus: `已婚以守为主：夫妻床头朝${my('延年')}（延年主婚姻和合）；本人桃花方${taoHuaDir ? `在${taoHuaDir}` : '不明'}，忌在那里摆花放水。`,
          yi: withOpp('感情', [`夫妻床头朝${my('延年')}（本人延年方）。`, '主卧保持整洁，摆设成双，床头有靠墙。']),
          ji: [
            ...(taoHuaDir ? [`在${taoHuaDir}（本人桃花位）摆鲜花、水景 —— 已婚者防烂桃花`] : []),
            '镜子正对床',
            `床头朝${my('六煞')}（六煞主桃花破耗）`,
          ],
          basis: ['八宅：「延年主婚姻和合、寿元绵长」「六煞主桃花酒色」。', '桃花：申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子。'],
        }
      : {
          focus: `单身以催为主：${taoHuaDir ? `本人桃花位在${taoHuaDir}，可放一瓶鲜花或水培绿植；` : ''}今年${ys(9)}（九紫主喜庆婚嫁），多在此方走动。`,
          yi: withOpp('感情', [
            ...(taoHuaDir ? [`${taoHuaDir}（本人桃花位）放鲜花或水培绿植，保持明亮。`] : []),
            `今年${ys(9)}、${ys(1)}：九紫喜庆、一白人缘，宜多走动、布置得温暖。`,
            `床头朝${my('延年')}（延年主正缘）。`,
          ]),
          ji: [`床头朝${my('六煞')}（六煞主烂桃花）`, '桃花位堆放杂物、枯花'],
          basis: ['桃花：申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子。', '紫白：「九紫右弼主喜庆婚嫁」。'],
        },
    子女:
      stage === '长者'
        ? {
            focus: `为儿孙操心时，先安自己：床头朝${my('天医')}或${my('延年')}，心安则家和。`,
            yi: [`床头朝${my('延年')}（延年主家和）。`, `今年${ys(9)}：九紫喜庆，儿孙团聚宜在此方。`],
            ji: [`在${at(5)}、${at(2)}长时间停留`],
            basis: ['八宅：「延年主寿元、家和」。'],
          }
        : {
            focus: `求子或子女运看生气与喜庆星：夫妻床头朝${my('生气')}（生气主添丁）；今年${ys(9)}、${ys(8)}，可在此两方安床或多走动。`,
            yi: withOpp('子女', [
              `床头朝${my('生气')}（本人生气方，主添丁）。`,
              `今年${ys(9)}（喜庆）、${ys(8)}（田宅丁财）：卧床或活动区宜在此。`,
              '孩子的房间：看孩子自己的「这屋对我」页，床头朝孩子本人的吉方。',
            ]),
            ji: [`卧床压在${at(5)}、${at(2)}（五黄二黑）`, `床头朝${my('绝命')}（绝命主绝嗣）`],
            basis: ['八宅：「生气主添丁进财」「绝命主绝嗣」。', '紫白：「九紫主喜庆」「八白主田宅丁财」。'],
          },
    学业: {
      focus: `书桌放在${at(4)}（今年四绿文昌星到此），座位朝${my('伏位')}（伏位利静心读书）或${my('生气')}。`,
      yi: withOpp('学业', [
        `${at(4)}（今年四绿文昌）：书桌或读书角宜在此，可放四支富贵竹（清水养）。`,
        `座位朝${my('伏位')}（本人伏位）或${my('生气')}（本人生气）。`,
      ]),
      ji: ['书桌正对厕所门、背后是走道或窗', `在${at(3)}读书（三碧主是非、分心）`, `座位朝${my('六煞')}（六煞主分心）`],
      basis: ['紫白：「四绿文曲主科名文章」；一四同宫为文昌局。', '八宅：「伏位主安稳」。'],
    },
    事业: {
      focus: `办公桌、座位朝${my('生气')}（生气主进取升迁）；今年${ys(6)}（武曲贵人）、${ys(1)}（官星），常在此方办公或会客。`,
      yi: withOpp('事业', [
        `座位朝${my('生气')}（本人生气方），背后有实墙为靠。`,
        `今年${ys(6)}（六白武曲，主权柄贵人）、${ys(1)}（一白，主官运）：宜设办公位或会客处。`,
      ]),
      ji: [`座位背后是门或窗、坐在${my('五鬼')}（本人五鬼方）`, `在${at(3)}谈判签约（三碧主口舌）`],
      basis: ['八宅：「生气主积极进取、升迁」。', '紫白：「六白武曲主权威」「一白贪狼主官运」。'],
    },
    财运: {
      focus: `财看向星旺方：本宅财位宜「动」 —— 常开窗、多走动、可放流动水；今年${ys(7)}（七赤破军），此方忌放水、忌动土。`,
      yi: withOpp('财运', [`今年${ys(8)}：八白主田宅财帛，宜保持明亮整洁。`, '保险箱、收钱处宜放在财位，藏而不露。']),
      ji: ['财位放厕所、杂物或长期封闭', `在${at(7)}放水、动土（七赤破财）`],
      basis: ['玄空：「向星主财，旺星到方即为财位」「零神得水」。', '紫白：「七赤破军主破耗」。'],
    },
    人际: {
      focus: `今年${ys(3)}（三碧是非星）：此方放红色物件（火泄木）、少在此方议事；座位朝${my('延年')}（延年主人缘）。`,
      yi: [`${at(3)}放红色摆件或暖色灯，以火泄木。`, `座位朝${my('延年')}（本人延年方）。`],
      ji: [`在${at(3)}、${at(7)}开会、谈判、签约`, '门对门、床对门（口舌）'],
      basis: ['紫白：「三碧蚩尤主是非官非」「七赤破军主口舌」。', '八宅：「延年主人际和合」。'],
    },
  };

  return (Object.keys(all) as Aspect[])
    .filter((a) => aspectApplies(a, stage))
    .map((aspect) => ({ aspect, ...statusOf(aspect), ...all[aspect] }));
}
