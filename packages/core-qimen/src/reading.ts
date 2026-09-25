/**
 * 断局 —— 把一张占局盘读成人话：这件事大致有利还是不利、开始过程结局如何、凭什么、怎么做、何时应。
 *
 * 早先的界面只摆出盘面（天人地三盘、值符值使、用神落宫），注释写着「断局不代劳，交给使用者与 AI」。
 * 结果是不懂奇门的人起完局只看到一堆术语 —— 使用者的原话：「起局好像没什么功能。」
 *
 * 这里只用盘上已有的东西，逐条可追溯：
 *   1. 用神宫与年命宫的五行生克 —— 鸣法用神章的核心判据（各占类的断法纲要也照录给使用者）
 *   2. 用神宫本身的吉凶 —— 上游九宫分析的自评分，原样取用
 *   3. 三乙四宫 —— 天乙主开始、太乙主过程、地乙主结局
 *   4. 空亡（事虚、应期后延）、马星（事动、应期提前）
 *   5. 用神宫的门、星、神各主何事 —— 给「怎么做」
 *
 * **不写进账本**：账本那条的概率仍取中位 0.5。断局是解读，不是新的统计判断；
 * 若把它当概率写进去，校准时比的就是这套解读规则而不是奇门本身。
 */

import type { Divination, DivinationPalace } from './divination.js';

export type Tendency = '有利' | '偏有利' | '难定' | '偏不利' | '不利';

export interface DivinationReading {
  readonly tendency: Tendency;
  /** 一句话结论。 */
  readonly headline: string;
  /** 开始、过程、结局（三乙）。 */
  readonly phases: readonly { readonly label: '开始' | '过程' | '结局'; readonly text: string }[];
  /** 凭什么这么说，逐条。 */
  readonly reasons: readonly string[];
  /** 怎么做。 */
  readonly advice: readonly string[];
  /** 何时应（古法材料 + 人话）。 */
  readonly timing: readonly string[];
  /** 此占的断法纲要（原文）。 */
  readonly classicNote: string;
  /** 没有用神、没有年命等造成的保留。 */
  readonly caveats: readonly string[];
}

type WuXing = '木' | '火' | '土' | '金' | '水';

/** 洛书九宫五行。 */
const GONG_WUXING: Readonly<Record<string, WuXing>> = {
  '1': '水', '2': '土', '3': '木', '4': '木', '5': '土', '6': '金', '7': '金', '8': '土', '9': '火',
};
const GONG_NAME: Readonly<Record<string, string>> = {
  '1': '坎', '2': '坤', '3': '震', '4': '巽', '5': '中', '6': '乾', '7': '兑', '8': '艮', '9': '离',
};
const GENERATES: Readonly<Record<WuXing, WuXing>> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Readonly<Record<WuXing, WuXing>> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/** 八门各主何事 —— 给「怎么做」。 */
const MEN_ADVICE: Readonly<Record<string, string>> = {
  开门: '开门主开创、公开：宜主动出面、正式提出，事在明处推进。',
  休门: '休门主休养、和缓：宜托人说项、以柔克刚，不宜硬碰。',
  生门: '生门主生发、得利：宜谋利、谈条件，是求财求成最好的门。',
  伤门: '伤门主冲突、损伤：防争执与受伤，宜先礼后兵、留好退路。',
  杜门: '杜门主闭塞、隐藏：宜暗中准备、保密进行，时机未到先别声张。',
  景门: '景门主文书、宣传：宜递材料、做展示，文书往来是关键。',
  死门: '死门主停滞、终结：宜守不宜进，此事先放一放或另寻出路。',
  惊门: '惊门主惊扰、口舌：防虚惊与流言，说话留余地、白纸黑字为凭。',
  黄门: '黄门随飞，主中和：事在两可之间，看人为多于看盘。',
};

/** 八神各主何事。 */
const SHEN_NOTE: Readonly<Record<string, string>> = {
  值符: '值符为贵人，有人愿意帮忙',
  六合: '六合主合作、撮合，托人牵线有利',
  太阴: '太阴主暗中相助，宜低调',
  九天: '九天主高远进取，宜积极争取',
  九地: '九地主守、主慢，宜稳扎稳打',
  太常: '太常主平稳、常态',
  玄武: '玄武主欺瞒、失窃，防被骗、看紧财物',
  白虎: '白虎主凶险、伤灾，防意外与强硬对手',
  腾蛇: '腾蛇主虚惊、反复，事情容易变卦',
  朱雀: '朱雀主口舌文书',
  勾陈: '勾陈主牵连拖延',
};

function phaseText(p: DivinationPalace | undefined): string {
  if (!p) return '看不出';
  const s = p.score ?? 0;
  const tone = s >= 1 ? '顺' : s <= -1 ? '有阻' : '平';
  return `${tone}（${GONG_NAME[p.gong] ?? p.gong}宫${p.jiXiong ? `·${p.jiXiong}` : ''}${p.renPanMen ? `·${p.renPanMen}` : ''}）`;
}

/**
 * 用神宫与年命宫的生克。
 *
 * 通则：用神生我、比和为事来就我（有利）；我克用神为我能掌控但须出力；
 * 我生用神为耗己之力；用神克我为事压我（不利）。
 * 求财一类例外：鸣法用神章「生门宫生扶／比扶／克年命→得财」—— 财来克我是得财。
 */
function relation(yong: string, ming: string, category: string): { score: number; text: string } {
  const y = GONG_WUXING[yong];
  const m = GONG_WUXING[ming];
  if (!y || !m) return { score: 0, text: '' };
  const yn = `${GONG_NAME[yong]}宫（${y}）`;
  const mn = `你的年命${GONG_NAME[ming]}宫（${m}）`;
  if (yong === ming) return { score: 1.2, text: `用神与${mn}同宫：事与你切身相关，主动权在你。` };
  if (GENERATES[y] === m) return { score: 1.5, text: `用神${yn}生${mn}：事来就你，得助之象。` };
  if (y === m) return { score: 1, text: `用神${yn}与${mn}比和：同气相求，易成。` };
  if (CONTROLS[m] === y) return { score: 0.4, text: `${mn}克用神${yn}：你能掌控，但要多出力。` };
  if (GENERATES[m] === y) return { score: -0.8, text: `${mn}生用神${yn}：耗你之力，付出多、回报慢。` };
  if (CONTROLS[y] === m) {
    return category === '求财'
      ? { score: 1.2, text: `用神${yn}克${mn}：求财以「财来克我」为得财（鸣法用神章）。` }
      : { score: -1.3, text: `用神${yn}克${mn}：事压着你，阻力大。` };
  }
  return { score: 0, text: '' };
}

function tendencyOf(score: number): Tendency {
  if (score >= 1.5) return '有利';
  if (score >= 0.5) return '偏有利';
  if (score > -0.5) return '难定';
  if (score > -1.5) return '偏不利';
  return '不利';
}

const HEADLINE: Readonly<Record<Tendency, string>> = {
  有利: '整体有利，可以积极推进。',
  偏有利: '偏向有利，但要顺势而为、别掉以轻心。',
  难定: '吉凶参半，结果多看你怎么做。',
  偏不利: '偏向不利，宜先守、另找时机或路径。',
  不利: '阻力明显，此事宜缓，不宜硬推。',
};

export function readDivination(d: Divination): DivinationReading {
  const at = (g: string) => d.palaces.find((p) => p.gong === g);
  const caveats: string[] = [];
  const reasons: string[] = [];
  const advice: string[] = [];
  const timing: string[] = [];
  let score = 0;

  const yong = d.yongShen.find((y) => y.gong !== '');
  const yp = yong ? at(yong.gong) : undefined;

  if (!yong || !yp) {
    caveats.push('这一局没有定位到具体用神（按综合断起局），以下只凭三乙与时干宫粗看，参考价值较低。');
  } else {
    const s = yp.score ?? 0;
    score += s / 2;
    reasons.push(
      `用神「${yong.name}」落${GONG_NAME[yong.gong]}宫（${yong.fangwei}），此宫${yp.jiXiong ?? '吉凶未评'}` +
        `${yp.renPanMen ? `，临${yp.renPanMen}` : ''}${yp.tianPanShen ? `、${yp.tianPanShen}` : ''}。`,
    );
    if (d.sanYi.nianMingGong) {
      const r = relation(yong.gong, d.sanYi.nianMingGong, d.category);
      if (r.text) {
        score += r.score;
        reasons.push(r.text);
      }
    } else {
      caveats.push('没有年命（成员生辰不足以排年柱），少了「事与你的生克」这一条最关键的判据。');
    }
    if (yp.kongWang) {
      score *= 0.5;
      reasons.push('用神宫空亡：事多虚而不实，或一时落不了地。');
      timing.push('空亡待填实：应期往后拖，常在出空（旬空过去）之后才见分晓。');
    }
    if (yp.maStar) {
      reasons.push('用神宫临马星：事情动得快。');
      timing.push('马星主动：应期提前，可能比你预想的快。');
    }
    const menAdvice = MEN_ADVICE[yp.renPanMen];
    if (menAdvice) advice.push(menAdvice);
    const shen = SHEN_NOTE[yp.tianPanShen];
    if (shen) advice.push(`${shen}。`);
    if (yong.fangwei && yong.fangwei !== '中宫') advice.push(`可往${yong.fangwei}方向去办、去找人（用神所在方位）。`);
  }

  // 三乙：开始、过程、结局；结局权重最大
  const tian = at(d.sanYi.tianYi);
  const tai = at(d.sanYi.taiYi);
  const di = at(d.sanYi.diYi);
  const phases = [
    { label: '开始' as const, text: phaseText(tian) },
    { label: '过程' as const, text: phaseText(tai) },
    { label: '结局' as const, text: phaseText(di) },
  ];
  score += ((tian?.score ?? 0) * 0.15 + (tai?.score ?? 0) * 0.15 + (di?.score ?? 0) * 0.35) / 1.5;

  for (const y of d.yingQi) {
    timing.push(`近应看逢「${y.near}」的日子，远应看「${y.far}」（${y.yongShen}所在宫的地盘干支）。`);
  }
  timing.push(`你给这件事的窗口是 ${d.resolution.windowDays} 天，到期回来结算，记录才有用。`);

  const tendency = tendencyOf(score);
  if (tendency === '有利' || tendency === '偏有利') advice.unshift('盘面偏吉：该做的准备现在就做，别等。');
  if (tendency === '偏不利' || tendency === '不利') advice.unshift('盘面偏凶：先稳住、做两手准备；这不是定数，换时机、换路径都可能不同。');

  return {
    tendency,
    headline: HEADLINE[tendency],
    phases,
    reasons,
    advice,
    timing,
    classicNote: d.yongShenNote,
    caveats,
  };
}
