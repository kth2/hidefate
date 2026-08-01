/**
 * 白话层 —— 把盘面结论讲成不懂命理的人也看得懂的话。
 *
 * ## 为什么这一层必须是确定性的，不能交给 AI
 *
 * 三条理由，任一条都足够：
 *
 * 1. **AI 要 API key 与网络。** 本项目离线优先，多数用户不会去配一个模型。
 *    如果不配 key 就看不懂这个 app，那这个 app 对大多数人是坏的。
 * 2. **项目铁律是「LLM 绝不发明」**（见 README 硬规则 1）。AI 只被允许把既有结论
 *    润色成通顺中文 —— 那么那些结论本身就得先是人话，否则没东西可润色。
 * 3. **可重放。** 账本要求同输入同输出，AI 做不到。
 *
 * 所以：这里先把话说明白，AI 综述架在它上面，是锦上添花而非地基。
 *
 * ## 一条纪律
 *
 * 本模块**只重述，不新增**。所有断语、概率、时间都来自传入的 `PredictedEvent`，
 * 这里做的只是换一种说法、补一句解释、把术语翻成白话。
 */

import type { PredictedEvent, XiangDomain } from './types.js';

/* ============ 术语白话表 ============ */

/**
 * 术语 → 一句白话。
 *
 * 收录标准：**这个词会出现在用户眼前**。只在代码里出现的不收。
 * 每条都要能让完全不懂的人看完知道「这跟我有什么关系」，
 * 而不是把一个术语换成另一串术语。
 */
export const GLOSSARY: Readonly<Record<string, string>> = {
  // ── 八字十神 ──
  比肩: '同辈、同事、竞争者。主自立，也主分薄。',
  劫财: '会分掉你钱的人或事 —— 合伙、借贷、担保多出在这类年份。',
  食神: '才华与享受，也是化解压力的那股缓冲力。',
  伤官: '想脱离约束、想表现自己的劲头。利创作与技艺，忌与上级顶撞。',
  偏财: '不固定的钱：奖金、副业、投机、意外之得。来得快去得也快。',
  正财: '固定的钱：薪水、稳定收益。进得慢但守得住。',
  七杀: '压力与竞争。逼你上阵的那股力量 —— 能成事，也能伤身。',
  正官: '名分与规矩：升职、转正、职衔。也意味着受管束。',
  偏印: '偏门的学习与思考，长于钻研，短于人情。',
  正印: '庇护与文书：长辈、贵人、证书、学历。也主依赖。',

  // ── 时间尺度 ──
  大运: '每十年换一次的人生大段落，决定这十年的底色。',
  流年: '这一年。它是触发器 —— 底色再好，也要这一年动了才应事。',
  流月: '这一个月。用来把「今年」收窄到「几月」。',
  元运: '二十年一换的大周期。当前是 2024–2043 的九运。',

  // ── 玄空九星 ──
  一白: '主智慧、文职、人缘；失运则漂泊、耳肾之疾。',
  二黑: '病符星。主慢性病、脾胃与妇科，也主家中女性长辈。',
  三碧: '是非星。主口舌、争执、官司，也主长子与手足。',
  四绿: '文昌星。主考试、文书、名声，也主长女。',
  五黄: '最凶的一颗。主重病、意外、破财。宜静不宜动。',
  六白: '主武贵、权威、金钱与老父；失运则孤高、头疾。',
  七赤: '主口才与偏财；失运则口舌、盗失、刀伤。',
  八白: '当元财星。主不动产、正财、少男，性质温和。',
  九紫: '当令旺星。主喜庆、名气、文明；过旺则火险、目疾。',

  // ── 风水术语 ──
  山星: '管人丁与健康的那一路星。',
  向星: '管财运与事业的那一路星。',
  动气: '这个位置有没有人在动。门、床、灶、常走的通道算动；储藏室、闲置角落算静。',
  当令: '正在得势的星，吉的更吉。',
  失令: '已经过气的星，凶的更凶。',
  应期: '什么时候会应验。古法讲「不动不应」——星再凶，那个位置没人动，也难发生。',

  // ── 紫微 ──
  大限: '紫微里每十年一段的运程，与八字大运并看。',
  四化: '化禄、化权、化科、化忌 —— 每年会点亮四颗星，指出这一年的着力点与麻烦点。',
  命宫: '本命盘的主位，看一个人的基本格局与性情。',
  疾厄: '看身体状况的那一宫。',
  田宅: '看不动产与居住环境的那一宫。',

  // ── 神煞 ──
  红鸾: '主婚喜。逢红鸾之年，感情容易有进展。',
  天喜: '主喜庆与添丁，与红鸾相对。',
  驿马: '主走动、出差、搬迁、换环境。',
  桃花: '主人缘与情感机会，也主应酬。',
};

/** 查术语白话；未收录则返回 null（不要编一个）。 */
export function glossaryOf(term: string): string | null {
  return GLOSSARY[term] ?? null;
}

/** 一段文字里出现的、可解释的术语。 */
export function termsIn(text: string): string[] {
  return Object.keys(GLOSSARY).filter((k) => text.includes(k));
}

/* ============ 年度白话 ============ */

const DOMAIN_WORD: Readonly<Record<XiangDomain, string>> = {
  健康: '身体', 财运: '钱', 感情: '感情', 事业: '工作', 人丁: '家里添人口',
  意外: '安全', 官非: '纠纷', 学业: '考试进修', 心性: '心境', 迁移: '走动搬迁',
  人际: '人际', 家庭: '家人',
};

export interface YearNarrativeInput {
  readonly year: number;
  readonly age: number;
  /** 该年干支，如「丙午」。 */
  readonly ganZhi: string;
  /** 该年对本人的十神，如「伤官」。 */
  readonly shiShen: string | null;
  readonly events: readonly PredictedEvent[];
  /** 该年是否换大运、搬家等个人断点。 */
  readonly breakpointKinds?: readonly string[];
}

export interface YearNarrative {
  /** 一句话总结。不懂命理的人读完就知道今年要留意什么。 */
  readonly headline: string;
  /** 分条白话，与事件一一对应。 */
  readonly lines: readonly string[];
  /** 这一年出现过、值得解释的术语。 */
  readonly terms: readonly { term: string; plain: string }[];
  /** 给 AI 综述用的结构化事实（AI 只能引用这些，不得新造）。 */
  readonly facts: readonly string[];
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * 时间说法。月级加「前后」（月份本就是估算），年级不加 ——
 * 「2026 年前后」听起来像跨了三年，而它其实就是这一年。
 */
const whenWord = (e: PredictedEvent) => (e.granularity === '月' ? `${e.whenLabel}前后` : `${e.whenLabel}内`);

/**
 * 一句话总结。
 *
 * 规则很朴素，但**朴素才可重放**：
 *   - 有凶事 → 先说要留意什么，再说好的
 *   - 只有吉事 → 直接说机会在哪
 *   - 什么都没有 → 明说「今年没有够格出报的事」，而不是编一句正能量
 *
 * 刻意不写「运势不错」「小心为上」这类空话 —— 那是我们一开始就要摆脱的东西。
 */
export function summariseYear(input: YearNarrativeInput): string {
  const { year, events } = input;
  const bad = events.filter((e) => e.valence === '凶').sort((a, b) => b.probability - a.probability);
  const good = events.filter((e) => e.valence === '吉').sort((a, b) => b.probability - a.probability);
  const neutral = events.filter((e) => e.valence === '中');

  if (events.length === 0) {
    return `${year} 年没有达到出报门槛的事 —— 这是好消息，不是没算出来。门槛设在两层共振，就是为了不把单层的臆断报给你。`;
  }

  const parts: string[] = [];
  if (bad.length > 0) {
    const b = bad[0]!;
    parts.push(`${year} 年最该留意的是${DOMAIN_WORD[b.domain]}：${whenWord(b)}，${b.title}（${pct(b.probability)}）`);
    if (bad.length > 1) parts.push(`另外${DOMAIN_WORD[bad[1]!.domain]}方面也有一条要防`);
  }
  if (good.length > 0) {
    const g = good[0]!;
    parts.push(
      bad.length > 0
        ? `好的一面是${whenWord(g)}，${g.title}（${pct(g.probability)}）`
        : `${year} 年的机会在${DOMAIN_WORD[g.domain]}：${whenWord(g)}，${g.title}（${pct(g.probability)}）`,
    );
  }
  if (parts.length === 0 && neutral.length > 0) {
    const n = neutral[0]!;
    parts.push(`${year} 年主要是变动：${whenWord(n)}，${n.title}（${pct(n.probability)}）`);
  }

  const bp = input.breakpointKinds ?? [];
  if (bp.includes('大运交界')) parts.push('这一年还赶上换大运，是人生段落的分界，前后风格会明显不同');
  else if (bp.includes('搬家')) parts.push('这一年有搬迁，居住环境整段更换，是少数能主动改变外部条件的时机');

  return parts.join('；') + '。';
}

/** 每条事件的白话说法 —— 什么事、什么时候、多大把握、先做什么。 */
export function lineFor(e: PredictedEvent): string {
  const when = whenWord(e);
  const mark = e.valence === '凶' ? '要留意' : e.valence === '吉' ? '有机会' : '会有变动';
  return `${when}，${mark}：${e.title}。把握约 ${pct(e.probability)}。${e.advice}`;
}

/**
 * 结构化事实清单 —— 专供 AI 综述使用。
 *
 * AI 的 system 提示会写死「只能引用以下事实，不得新增任何事件、时间或数字」，
 * 这个清单就是那个「以下事实」。它由确定性引擎产出，AI 拿不到别的东西。
 */
export function factsFor(input: YearNarrativeInput): string[] {
  const out: string[] = [
    `年份：${input.year} 年（虚岁 ${input.age}）`,
    `该年干支：${input.ganZhi}${input.shiShen ? `，对本人为${input.shiShen}年` : ''}`,
  ];
  for (const e of input.events) {
    out.push(
      `事件：${e.title}｜领域 ${e.domain}｜时间 ${e.whenLabel}｜概率 ${pct(e.probability)}｜` +
        `吉凶 ${e.valence}｜由 ${e.layers.join('、')} 层共振｜命中 ${e.matched.join('、')}｜` +
        `古法依据 ${e.classic}｜提前量 ${e.advice}`,
    );
  }
  for (const k of input.breakpointKinds ?? []) out.push(`该年断点：${k}`);
  if (input.events.length === 0) out.push('该年没有达到共振门槛的事件。');
  return out;
}

/** 一次产出年度白话全套。 */
export function narrateYear(input: YearNarrativeInput): YearNarrative {
  const lines = input.events.map(lineFor);
  const blob = [...lines, input.ganZhi, input.shiShen ?? ''].join(' ');
  const terms = termsIn(blob).map((t) => ({ term: t, plain: GLOSSARY[t]! }));
  return {
    headline: summariseYear(input),
    lines,
    terms,
    facts: factsFor(input),
  };
}

/* ============ 宫位白话 ============ */

export interface PalaceNarrativeInput {
  readonly direction: string;
  readonly comboName: string;
  readonly comboMeaning: string;
  readonly comboNature: '吉' | '凶' | '中';
  readonly dongQiLevel: string;
  readonly dongQiNote: string;
  /** 该宫的房间，如「大门」。 */
  readonly roomWords: readonly string[];
  /** 化解建议（来自 core-fengshui 的组合表）。 */
  readonly cures: readonly string[];
}

/**
 * 宫位白话。
 *
 * 早先界面只列「正东 · 碧绿风魔（4-3）· 动气强」—— 用户看完不知道这是什么、
 * 也不知道要做什么。组合的含义与化解本来就在 `COMBINATIONS` 里躺着，只是没渲染。
 */
export function narratePalace(p: PalaceNarrativeInput): {
  readonly headline: string;
  readonly meaning: string;
  readonly action: string | null;
} {
  const where = p.roomWords.length > 0 ? `你家${p.roomWords.join('、')}所在的${p.direction}` : `${p.direction}方位`;
  const tone =
    p.comboNature === '凶'
      ? p.dongQiLevel === '强'
        ? '这里最需要处理'
        : p.dongQiLevel === '无'
          ? '性质偏凶，但平时没人动，暂时不急'
          : '性质偏凶，日常有人走动，值得留意'
      : p.comboNature === '吉'
        ? p.dongQiLevel === '强'
          ? '这里是好位置，而且你天天在用'
          : '这里是好位置，可惜用得少'
        : '性质中平';

  return {
    headline: `${where}：${tone}`,
    meaning: p.comboMeaning,
    action: p.cures.length > 0 && p.comboNature === '凶' ? p.cures[0]! : null,
  };
}
