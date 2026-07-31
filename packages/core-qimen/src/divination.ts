/**
 * 时家奇门「占局」—— 运层的即时卜算。
 *
 * 与本包既有的山向奇门是**两件事**，不要混：
 *   - 山向奇门（shanXiang.ts）：以坐山定局，属**风水层**，段内常量，回答「这个地方如何」
 *   - 占局（本文件）：以求测时刻定局，属**运层**，回答「此刻这件事如何」
 *
 * 默认且当前唯一实现的流派是**飞盘鸣法（括囊）**。传入未实现的流派会**抛错而非
 * 静默出错盘** —— 沿用本包对待上游引擎的既有约定。转盘时家的盘面结构与飞盘不同
 * （转盘为 tianPan/jiuXing/baMen/baShen/anGan，飞盘分天人地三盘各带暗干支），
 * 需另写一套投影，不在本次实现范围。
 *
 * ## 三条写进类型里的纪律
 *
 * 这些不是建议，是**签名层面的强制**，因为它们一旦被绕过，对轨数据就会变成垃圾，
 * 而且是最难察觉的那种垃圾：
 *
 * 1. **占时不可选。** `castDivination()` 没有时刻参数，一律取调用瞬间。
 *    时刻可挑，就等于答案可挑。要复核旧占请用 `replayDivination()`，
 *    它只接受账本里已记录的时刻，且不产生新的占。
 * 2. **判据先于盘面。** `resolution`（何为应验、谁来判、多长窗口）是必填参数，
 *    不填就排不出盘。「今年财运有起伏」这种不可证伪的占，在类型层就写不出来。
 * 3. **复占留档，不许挑答案。** 同一件事可以反复占 —— 换个时辰本就是另一个局，
 *    多占几次也确实有助于校准取象。真正要防的不是「再问」，而是**只留下喜欢的那条**。
 *    故 `castDivination()` 不再拒绝复占，改为把每一次都编号入列（`sequence`），
 *    并要求调用方传入已有的占用于串联。删不掉、藏不住，才是记录该有的样子。
 *
 * 本文件不做任何断语生成。用神取用由上游 `feipanPredict` 的确定性规则完成，
 * 应期只呈现古法材料（用神宫地盘奇仪主近、地盘暗干支主远），**不换算成天数** ——
 * 窗口由使用者自己承诺，引擎不发明数字。
 */

import { loadQiMenEngine } from './loader.js';
import type {
  FeiPanChart,
  LocatedYongShen,
  QiMenGongAnalysis,
  SanYiSiGong,
  YongShenRule,
} from './types.js';

/** 占局流派。当前只实现飞盘鸣法。 */
export type DivinationSchool = '飞盘鸣法' | '转盘时家';

export const DEFAULT_SCHOOL: DivinationSchool = '飞盘鸣法';

/** 结算标准 —— 缺此项则拒绝起局。 */
export interface DivinationResolution {
  /** 何为「应验」。须具体到能被第三者判定，不接受「有起伏」这类表述。 */
  readonly criterion: string;
  readonly judge: '用户自评' | '客观记录';
  /**
   * 应期窗口（天）。由使用者参考 `yingQi` 的古法材料后自行承诺，
   * 引擎不代为换算 —— 换算即发明数字。
   */
  readonly windowDays: number;
}

export interface DivinationRequest {
  /** 占问原文。 */
  readonly question: string;
  /** 显式占类，覆盖关键词匹配。取值见 `listQuestionCategories()`。 */
  readonly category?: string;
  /** 关键词与显式占类都未命中时的回退占类。 */
  readonly fallbackCategory?: string;
  /** 求测人年命天干。为「甲」时上游不作遁甲寄宫，年命宫定不出，会有保留意见。 */
  readonly nianMingGan?: string;
  readonly school?: DivinationSchool;
  readonly resolution: DivinationResolution;
  /**
   * 占类未能识别时，是否允许按「综合断」（三乙四宫为纲）起局。
   * 默认 false —— 综合断没有具体用神，落到账本里就是一条无锚点的记录，
   * 要走这条路必须明写。
   */
  readonly allowGeneralReading?: boolean;
}

/** 账本中一条尚未结算的占，用于查重。 */
export interface OpenDivination {
  readonly key: string;
  /** ISO 时刻。 */
  readonly castAt: string;
  readonly windowDays: number;
  readonly status: '待结算' | '已结算' | '窗口过期';
}

export interface DivinationContext {
  /**
   * 账本里已有的占。用于把同一件事的多次占**串成一列**（而非拒绝）。
   * 首次占请显式传 `[]`。
   */
  readonly openDivinations: readonly OpenDivination[];
}

export interface RepeatVerdict {
  /** 是否为复占。 */
  readonly isRepeat: boolean;
  /** 这是同一件事的第几次占，从 1 起。 */
  readonly sequence: number;
  readonly reason: string;
  /** 同一件事此前那些占。 */
  readonly previous: readonly OpenDivination[];
}

/** 应期材料 —— 古法取象，不换算天数。 */
export interface YingQiClue {
  /** 对应哪个用神。 */
  readonly yongShen: string;
  readonly gong: string;
  /** 近应：用神宫地盘奇仪。 */
  readonly near: string;
  /** 远应：用神宫地盘暗干支。 */
  readonly far: string;
  /** 该宫是否空亡（空亡待填实，应期后延）。 */
  readonly kongWang: boolean;
  /** 该宫是否临马星（马星主动，应期提前）。 */
  readonly maStar: boolean;
}

export interface DivinationPalace {
  /** "1"–"9"，与洛书数一致。 */
  readonly gong: string;
  readonly gongName: string;
  readonly direction: string;
  readonly tianPanXing: string;
  readonly tianPanShen: string;
  readonly tianPanYi: string;
  readonly tianPanAnGan: string;
  /** 明值使门；中宫为「黄门」。 */
  readonly renPanMen: string;
  readonly renPanAnMen: string;
  readonly renPanAnGan: string;
  readonly diPanShen: string;
  readonly diPanYi: string;
  readonly diPanAnGan: string;
  readonly kongWang: boolean;
  readonly maStar: boolean;
  /** 上游九宫分析的吉凶自评，原样透传，不重算。 */
  readonly jiXiong: string | null;
  readonly score: number | null;
}

export interface Divination {
  /** 同一件事的归一化键。同一件事的多次占共用它，用于串成一列。 */
  readonly key: string;
  /** 这是同一件事的第几次占，从 1 起。 */
  readonly sequence: number;
  /** 复占提示；首次占为 null。 */
  readonly repeatNote: string | null;
  readonly school: DivinationSchool;
  /** 起局时刻（ISO）。写入即锁。 */
  readonly castAt: string;
  readonly question: string;
  readonly resolution: DivinationResolution;
  /** 应期窗口截止（ISO），= castAt + windowDays。 */
  readonly resolveBy: string;

  readonly category: string;
  /** 占类是否由关键词或显式指定命中；false 表示走的综合断。 */
  readonly categoryMatched: boolean;
  /** 该占类的断法纲要（《鸣法·用神章》）。 */
  readonly yongShenNote: string;
  readonly yongShen: readonly LocatedYongShen[];
  readonly sanYi: SanYiSiGong;
  readonly yingQi: readonly YingQiClue[];

  readonly siZhu: FeiPanChart['siZhu'];
  readonly juShu: FeiPanChart['juShu'];
  readonly xunShou: string;
  readonly zhiFuXing: string;
  readonly zhiFuGong: string;
  readonly zhiFuLuoGong: string;
  readonly zhiShiMen: string;
  readonly zhiShiGong: string;
  readonly anZhiShiMen: string;
  readonly anZhiShiGong: string;
  readonly kongWangZhi: readonly string[];
  readonly kongWangGong: readonly string[];
  readonly maStar: { zhi: string; gong: string } | null;
  readonly palaces: readonly DivinationPalace[];

  /**
   * 引擎签名 —— 流派 + 局 + 四柱。写进账本的 engineVersion，
   * 使日后重放能确认比对的是同一个模型（见 docs/ROADMAP.md §6.1）。
   */
  readonly engineSignature: string;
  readonly caveats: readonly string[];
}

/* ============ 查重键 ============ */

/** FNV-1a 32 位。只用于查重，不作安全用途。 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 归一化占问：去空白与常见标点、英文转小写。
 *
 * 这是**启发式**，挡得住「原样再问一次」和顺手改标点，挡不住有心改写措辞。
 * 因此 UI 还应提供「这与之前那一占是同一件事」的手动关联，别把查重全押在这里。
 */
export function normaliseQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[，。！？、；：""''（）()[\]{}.,!?;:'"]/g, '');
}

/**
 * 由占问意图导出查重键：归一化问题 + 求测人年命。
 *
 * **占类刻意不进钥匙。** 占类是对这件事的*解读*，不是这件事本身 ——
 * 把它算进去，用户只要换一个占类就能对同一件事再占一次，
 * 而那正是查重要防的动作。实跑界面时确认过这个漏洞：
 * 同一问题先自动判类、再显式指定占类，会得到两把不同的钥匙。
 *
 * 年命保留，因为它区分的是**谁在问** —— 同一个问题，我问和替家人问是两件事。
 * 代价是漏填年命会另开一把钥匙，故界面须把年命固定住，不要随手清空。
 */
export function divinationKey(req: Pick<DivinationRequest, 'question' | 'nianMingGan'>): string {
  return fnv1a([normaliseQuestion(req.question), req.nianMingGan ?? ''].join(' '));
}

const DAY_MS = 86_400_000;

/**
 * 复占检查 —— **不拒绝，只编号**。
 *
 * 早先这里是硬拦：同一件事应期未到不得再占。那个担心是真的
 * （允许复占，人就会问到满意为止），但拦错了地方 ——
 * 要防的是**选择性保留**，不是「再问」这个动作本身。
 *
 * 换个时辰本来就是另一个局；多占几次、把每一次都留下来，
 * 反而是校准取象最快的路子。所以现在的做法是：照占，编号，全部留档。
 * 删不掉、藏不住，就没法只留下喜欢的那条。
 */
export function checkRepeat(
  open: readonly OpenDivination[],
  key: string,
  _now: Date = new Date(),
): RepeatVerdict {
  const previous = open.filter((d) => d.key === key);
  const sequence = previous.length + 1;
  if (previous.length === 0) {
    return { isRepeat: false, sequence: 1, previous: [], reason: '同一事项的首次起局。' };
  }
  const pending = previous.filter((d) => d.status === '待结算').length;
  return {
    isRepeat: true,
    sequence,
    previous,
    reason:
      `同一事项已占过 ${previous.length} 次（其中 ${pending} 次未结算），本局记为第 ${sequence} 次。` +
      '每一次都会留档 —— 到期请把每一局各自结算，不要只认最合心意的那一局，' +
      '否则这批记录对校准就没有价值了。',
  };
}

/* ============ 起局 ============ */

function assertResolution(r: DivinationResolution): void {
  if (!r || typeof r.criterion !== 'string' || r.criterion.trim().length < 4) {
    throw new Error(
      '缺少可判定的结算标准。占之前必须写明「何为应验」，且须具体到第三者能判定；' +
        '「有起伏」「会顺利」这类无法证伪的表述不予受理。',
    );
  }
  if (!Number.isFinite(r.windowDays) || r.windowDays < 1 || r.windowDays > 3650) {
    throw new Error(`应期窗口须为 1–3650 天，收到 ${r.windowDays}。`);
  }
  if (r.judge !== '用户自评' && r.judge !== '客观记录') {
    throw new Error('结算方式须为「用户自评」或「客观记录」之一。');
  }
}

function projectPalaces(pan: FeiPanChart): DivinationPalace[] {
  const kw = new Set(pan.kongWangGong ?? []);
  const ma = pan.maStar?.gong ?? '';
  const at = (m: Record<string, string> | undefined, g: string) => m?.[g] ?? '';
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((g) => {
    const an: QiMenGongAnalysis | undefined = pan.jiuGongAnalysis?.[g];
    return {
      gong: g,
      gongName: an?.gongName ?? '',
      direction: an?.direction ?? '',
      tianPanXing: at(pan.tianPanXing, g),
      tianPanShen: at(pan.tianPanShen, g),
      tianPanYi: at(pan.tianPanYi, g),
      tianPanAnGan: at(pan.tianPanAnGan, g),
      renPanMen: at(pan.renPanMen, g),
      renPanAnMen: at(pan.renPanAnMen, g),
      renPanAnGan: at(pan.renPanAnGan, g),
      diPanShen: at(pan.diPanShen, g),
      diPanYi: at(pan.diPan, g),
      diPanAnGan: at(pan.diPanAnGan, g),
      kongWang: kw.has(g),
      maStar: ma === g,
      jiXiong: an?.jiXiongText ?? an?.jiXiong ?? null,
      score: typeof an?.score === 'number' ? an.score : null,
    };
  });
}

function buildYingQi(
  located: readonly LocatedYongShen[],
  pan: FeiPanChart,
): YingQiClue[] {
  const kw = new Set(pan.kongWangGong ?? []);
  const ma = pan.maStar?.gong ?? '';
  return located
    .filter((y) => y.gong !== '')
    .map((y) => ({
      yongShen: y.name,
      gong: y.gong,
      near: y.diPanYi,
      far: y.diPanAnGan,
      kongWang: kw.has(y.gong),
      maStar: ma === y.gong,
    }));
}

function collectCaveats(
  req: DivinationRequest,
  pan: FeiPanChart,
  sel: { matched: boolean; located: readonly LocatedYongShen[] },
  sanYi: SanYiSiGong,
): string[] {
  const out: string[] = [];

  if (!sel.matched) {
    out.push(
      '占类未能识别，本局按综合断（三乙四宫、值符值使为纲）起局，无具体用神。' +
        '此类记录对轨价值低，建议改选明确占类重占。',
    );
  }

  if (req.nianMingGan === '甲') {
    out.push(
      '年命天干为甲：甲遁六仪不上天盘，上游未作遁甲寄宫处理，年命宫定不出。' +
        '请改以年支或旬首宫参看，勿把空的年命宫当作「无碍」。',
    );
  } else if (req.nianMingGan && sanYi.nianMingGong === '') {
    out.push(`年命干「${req.nianMingGan}」未能在天盘奇仪中定位，年命宫为空，涉及年命的断法此局不成立。`);
  } else if (!req.nianMingGan) {
    out.push('未提供求测人年命天干，凡以年命为断的条目（得财/损财、寻物有果与否等）此局无从判定。');
  }

  const kw = new Set(pan.kongWangGong ?? []);
  for (const y of sel.located) {
    if (y.gong === '') {
      out.push(`用神「${y.name}」未能在盘中定位，涉及它的断法不成立。`);
    } else if (kw.has(y.gong)) {
      out.push(`用神「${y.name}」落 ${y.gong} 宫值空亡：古法待填实方应，应期宜后延，勿按常法取近应。`);
    } else if (y.gong === '5') {
      out.push(`用神「${y.name}」落中五宫：中宫无门无卦，各家取法不一，本局对它只作参考。`);
    }
  }

  return out;
}

/**
 * 起一局。
 *
 * **时刻不可指定** —— 一律取调用瞬间。这不是接口简陋，是刻意的：
 * 起局时刻若可挑，占卜就退化成挑答案。
 *
 * @param req 占问与结算标准（结算标准必填）
 * @param ctx 账本上下文；`openDivinations` 必须显式传，首次占传 `[]`
 * @throws 结算标准不合格、复占未结算、占类未识别且未明允综合断、流派未实现
 */
export async function castDivination(
  req: DivinationRequest,
  ctx: DivinationContext,
): Promise<Divination> {
  const school = req.school ?? DEFAULT_SCHOOL;
  if (school !== '飞盘鸣法') {
    throw new Error(
      `占局流派「${school}」尚未实现。当前仅支持「飞盘鸣法」——` +
        '转盘时家的盘面结构与飞盘不同，需另写投影层，未实现前抛错而非静默出错盘。',
    );
  }
  if (typeof req.question !== 'string' || req.question.trim() === '') {
    throw new Error('占问不得为空。');
  }
  assertResolution(req.resolution);

  const key = divinationKey(req);
  const now = new Date();
  const repeat = checkRepeat(ctx.openDivinations, key, now);

  const { engine } = await loadQiMenEngine();
  if (!engine.feipanQimen?.calculate || !engine.feipanPredict?.selectYongShen) {
    throw new Error('上游引擎未挂载飞盘模块（feipanQimen / feipanPredict），请检查 vendor 资源是否为完整 bundle。');
  }

  const pan = engine.feipanQimen.calculate(now);
  const opts = {
    ...(req.category != null ? { category: req.category } : {}),
    ...(req.fallbackCategory != null ? { fallbackCategory: req.fallbackCategory } : {}),
    ...(req.nianMingGan != null ? { nianMingGan: req.nianMingGan } : {}),
  };
  const sel = engine.feipanPredict.selectYongShen(pan, req.question, opts);

  if (!sel.matched && req.allowGeneralReading !== true) {
    throw new Error(
      `占问「${req.question}」未能识别占类，无具体用神可取。` +
        '请从 listQuestionCategories() 中显式指定占类；' +
        '确要按综合断起局，请显式传 allowGeneralReading: true。',
    );
  }

  const sanYi = engine.feipanPredict.computeSanYiSiGong(pan, opts);
  const castAt = now.toISOString();

  return {
    key,
    sequence: repeat.sequence,
    repeatNote: repeat.isRepeat ? repeat.reason : null,
    school,
    castAt,
    question: req.question,
    resolution: req.resolution,
    resolveBy: new Date(now.getTime() + req.resolution.windowDays * DAY_MS).toISOString(),
    category: sel.category,
    categoryMatched: sel.matched,
    yongShenNote: sel.note,
    yongShen: sel.located,
    sanYi,
    yingQi: buildYingQi(sel.located, pan),
    siZhu: pan.siZhu,
    juShu: pan.juShu,
    xunShou: pan.xunShou,
    zhiFuXing: pan.zhiFuXing,
    zhiFuGong: pan.zhiFuGong,
    zhiFuLuoGong: pan.zhiFuLuoGong,
    zhiShiMen: pan.zhiShiMen,
    zhiShiGong: pan.zhiShiGong,
    anZhiShiMen: pan.anZhiShiMen,
    anZhiShiGong: pan.anZhiShiGong,
    kongWangZhi: [...(pan.kongWangZhi ?? [])],
    kongWangGong: [...(pan.kongWangGong ?? [])],
    maStar: pan.maStar ?? null,
    palaces: projectPalaces(pan),
    engineSignature: `${school}|${pan.juShu.formatCode}|${pan.siZhu.year}${pan.siZhu.month}${pan.siZhu.day}${pan.siZhu.time}`,
    caveats: collectCaveats(req, pan, sel, sanYi),
  };
}

/**
 * 重放账本里的一条占，用于确定性校验（同输入同引擎 → 同输出）。
 *
 * **这不产生新的占**：不查重、不写账本、`castAt` 原样取自记录。
 * 它存在的唯一目的是让「③ AI 比对偏差」比的是同一个模型，
 * 而不是拿今天的引擎去评判去年的预测。
 */
export async function replayDivination(
  record: Pick<Divination, 'castAt' | 'question' | 'school' | 'key' | 'resolution'> & {
    readonly category?: string;
    readonly nianMingGan?: string;
    readonly allowGeneralReading?: boolean;
  },
): Promise<Divination> {
  const school = record.school ?? DEFAULT_SCHOOL;
  if (school !== '飞盘鸣法') throw new Error(`占局流派「${school}」尚未实现，无法重放。`);

  const at = new Date(record.castAt);
  if (Number.isNaN(at.getTime())) throw new Error(`账本时刻无法解析：${record.castAt}`);

  const { engine } = await loadQiMenEngine();
  const pan = engine.feipanQimen.calculate(at);
  const opts = {
    ...(record.category != null ? { category: record.category } : {}),
    ...(record.nianMingGan != null ? { nianMingGan: record.nianMingGan } : {}),
  };
  const sel = engine.feipanPredict.selectYongShen(pan, record.question, opts);
  const sanYi = engine.feipanPredict.computeSanYiSiGong(pan, opts);

  const req: DivinationRequest = {
    question: record.question,
    resolution: record.resolution,
    ...(record.category != null ? { category: record.category } : {}),
    ...(record.nianMingGan != null ? { nianMingGan: record.nianMingGan } : {}),
  };

  return {
    key: record.key,
    sequence: 1,
    repeatNote: null,
    school,
    castAt: record.castAt,
    question: record.question,
    resolution: record.resolution,
    resolveBy: new Date(at.getTime() + record.resolution.windowDays * DAY_MS).toISOString(),
    category: sel.category,
    categoryMatched: sel.matched,
    yongShenNote: sel.note,
    yongShen: sel.located,
    sanYi,
    yingQi: buildYingQi(sel.located, pan),
    siZhu: pan.siZhu,
    juShu: pan.juShu,
    xunShou: pan.xunShou,
    zhiFuXing: pan.zhiFuXing,
    zhiFuGong: pan.zhiFuGong,
    zhiFuLuoGong: pan.zhiFuLuoGong,
    zhiShiMen: pan.zhiShiMen,
    zhiShiGong: pan.zhiShiGong,
    anZhiShiMen: pan.anZhiShiMen,
    anZhiShiGong: pan.anZhiShiGong,
    kongWangZhi: [...(pan.kongWangZhi ?? [])],
    kongWangGong: [...(pan.kongWangGong ?? [])],
    maStar: pan.maStar ?? null,
    palaces: projectPalaces(pan),
    engineSignature: `${school}|${pan.juShu.formatCode}|${pan.siZhu.year}${pan.siZhu.month}${pan.siZhu.day}${pan.siZhu.time}`,
    caveats: collectCaveats(req, pan, sel, sanYi),
  };
}

/**
 * 列出全部占类及其用神与断法纲要。
 *
 * 这 23 条不只是给 UI 做选择器 —— 每条的 `note` 就是运层象意的原型，
 * P2 的象意字典可直接由此转出（见 docs/ROADMAP.md §4）。
 */
export async function listQuestionCategories(): Promise<readonly YongShenRule[]> {
  const { engine } = await loadQiMenEngine();
  const rules = engine.feipanPredict?.YONG_SHEN_RULES;
  if (!rules) throw new Error('上游引擎未挂载 feipanPredict.YONG_SHEN_RULES。');
  return rules;
}
