/**
 * 山向奇门（宅盘奇门）—— 可选高级叠加层。
 *
 * 本模块**不重新实现任何奇门算法**，只做三件事：
 *   1. 调用上游 `shanxiang.js` 以「坐山三元」定局并出盘（vendor 原样收录）
 *   2. 把引擎的 "1"–"9" 九宫转成本项目的 PalaceIndex 九宫叠加层
 *   3. 把八门/九星/八神的吉凶归一化成可与飞星、八宅合参的分数
 *
 * 定局法固定为坐山三元（`method: 'standard'`）—— 这是上游当前唯一实现，
 * 传入其它流派会抛错而非静默出错盘，本项目原样保留这一行为。
 */

import { OUTER_PALACES, PALACE_DIRECTION, type PalaceIndex } from '@hidefate/core-fengshui';
import { loadQiMenEngine } from './loader.js';
import { toPalaceIndex, type QiMenChart, type QiMenGongAnalysis, type ShanXiangOptions } from './types.js';

/** 引擎吉凶枚举 → 归一化分数 -1（大凶）… +1（大吉）。 */
const JIXIONG_SCORE: Record<string, number> = {
  da_ji: 1.0,
  ji: 0.65,
  xiao_ji: 0.3,
  ping: 0,
  xiao_xiong: -0.3,
  xiong: -0.65,
  da_xiong: -1.0,
};

/** 八门吉凶（供无 jiuGongAnalysis 时兜底，以及单独展示）。 */
export const JI_MEN = new Set(['开门', '休门', '生门', '景门']);
export const XIONG_MEN = new Set(['伤门', '杜门', '死门', '惊门']);

/** 与风水场景直接相关的门神组合警示。 */
const MEN_ROOM_ADVICE: Record<string, string> = {
  开门: '此方宜作大门、主入口、店铺门面，气口开于此最能通达。',
  生门: '此方为财门，宜作大门、收银台、财位、老板座，主生发。',
  休门: '此方宜作卧房、静养区、洽谈室，主安宁休养。',
  景门: '此方宜作展示区、直播间、会客厅，主显扬。',
  伤门: '此方忌作大门与儿童活动区，主外伤跌打；宜作储藏。',
  杜门: '此方主闭塞，宜作储藏室、保险柜位（藏而不露），忌作大门。',
  死门: '此方主衰止，忌作大门、卧房、灶位；宜作厕所、储物以压之。',
  惊门: '此方主惊扰口舌，忌作卧房与谈判区；宜作走道。',
};

/** 八神对家宅的应象。 */
const SHEN_HOUSE_ADVICE: Record<string, string> = {
  值符: '贵神临此，宜作主位（老板位、家主卧房），得贵人扶助。',
  太阴: '主暗中庇护，宜作书房、财务室，利谋划与私密事。',
  六合: '主和合姻缘，宜作夫妻卧房、婚房、中介洽谈处。',
  九天: '主高扬远达，宜作办公位、宣传展示区，利拓展。',
  九地: '主厚藏稳固，宜作库房、保险柜、卧房，利守成。',
  腾蛇: '主虚惊怪异，忌作卧房（易梦魇失眠），宜置静物镇之。',
  白虎: '主刀伤争斗，忌作儿童房与卧房，注意此方器械与尖角。',
  玄武: '主盗窃欺瞒，忌在此方放贵重物与保险箱，加强门窗防盗。',
};

export interface QiMenPalaceOverlay {
  readonly palace: PalaceIndex;
  readonly direction: string;
  /** 九星。 */
  readonly xing: string;
  readonly xingAlias: string;
  /** 八门；中宫可能为空。 */
  readonly men: string;
  /** 八神。 */
  readonly shen: string;
  /** 天盘干。 */
  readonly tianGan: string;
  /** 地盘干。 */
  readonly diGan: string;
  /** 暗干。 */
  readonly anGan: string;
  /** 格局（如「游魂入墓」）。 */
  readonly geJu: string | null;
  readonly kongWang: boolean;
  readonly yiMa: boolean;
  /** 归一化吉凶 -1…+1。 */
  readonly score: number;
  readonly verdictText: string;
  /** 引擎原始断语。 */
  readonly explain: string;
  /** 面向家宅布局的可执行建议。 */
  readonly advice: readonly string[];
}

export interface ShanXiangResult {
  /** 完整原始盘（保留全部上游字段，供高级用户查看）。 */
  readonly raw: QiMenChart;
  /** 定局依据，供「传承与依据」展示。 */
  readonly ju: {
    readonly sitting: string;
    readonly facing: string;
    readonly jieQi: string;
    readonly yuan: string;
    readonly type: 'yang' | 'yin';
    readonly number: string;
    readonly label: string;
    readonly method: string;
    readonly activationSource: string;
    readonly derivation: readonly string[];
  };
  readonly zhiFuGong: PalaceIndex | null;
  readonly zhiFuXing: string;
  readonly zhiShiGong: PalaceIndex | null;
  readonly zhiShiMen: string;
  readonly palaces: Record<PalaceIndex, QiMenPalaceOverlay>;
}

function buildOverlay(a: QiMenGongAnalysis, palace: PalaceIndex): QiMenPalaceOverlay {
  const advice: string[] = [];
  if (a.men && MEN_ROOM_ADVICE[a.men]) advice.push(MEN_ROOM_ADVICE[a.men]!);
  if (a.shen && SHEN_HOUSE_ADVICE[a.shen]) advice.push(SHEN_HOUSE_ADVICE[a.shen]!);
  if (a.kongWang) advice.push('此宫落空亡，吉凶皆减力、应事迟缓；重要布局不宜倚重此方。');
  if (a.yiMa) advice.push('驿马临宫，主变动奔波；宜作出入口，忌作长期静养之所。');
  if (a.menPo) advice.push('门迫（门克宫），主事与愿违、进展受阻，此方不宜作主气口。');

  const score = JIXIONG_SCORE[a.jiXiong] ?? 0;
  return {
    palace,
    direction: PALACE_DIRECTION[palace],
    xing: a.xing,
    xingAlias: a.xingAlias,
    men: a.men,
    shen: a.shen,
    tianGan: a.tianGan,
    diGan: a.diGan,
    anGan: a.anGan,
    geJu: a.keYing?.name ?? null,
    kongWang: a.kongWang,
    yiMa: a.yiMa,
    score,
    verdictText: a.jiXiongText,
    explain: a.explain,
    advice,
  };
}

/**
 * 排山向奇门盘并转成九宫叠加层。
 *
 * @param opts.sitting 坐山（必填），山名或度数 —— 与飞星共用同一个坐山输入
 * @param opts.year    入住/动土年：以该年立春作时间激活层
 * @param opts.date    精确激活时刻；给了 date 则忽略 year
 */
export async function computeShanXiang(opts: ShanXiangOptions): Promise<ShanXiangResult> {
  const { engine, shanXiang } = await loadQiMenEngine();

  if (opts.method && opts.method !== 'standard') {
    // 与上游一致：未实现的流派直接抛错，绝不静默降级出一张看似正常的错盘。
    throw new Error(`山向奇门暂仅实现「坐山三元」(method="standard")；不支持 method="${opts.method}"。`);
  }

  const raw = shanXiang.generateShanXiangChart(
    { ...opts, method: 'standard', purpose: opts.purpose ?? '风水' },
    engine,
  );
  if (raw.error) throw new Error(`奇门排盘失败：${raw.message ?? '未知错误'}`);

  const meta = raw.shanXiang;
  if (!meta) throw new Error('上游未返回 shanXiang 元数据，排盘结果异常。');

  const palaces = {} as Record<PalaceIndex, QiMenPalaceOverlay>;
  for (const [key, analysis] of Object.entries(raw.jiuGongAnalysis)) {
    const p = toPalaceIndex(key);
    palaces[p] = buildOverlay(analysis, p);
  }

  const parseGong = (v: string | undefined): PalaceIndex | null => {
    if (!v) return null;
    try { return toPalaceIndex(v); } catch { return null; }
  };

  const yuanIdxText = meta.juBasis.yuan;
  return {
    raw,
    ju: {
      sitting: meta.sitting.name,
      facing: meta.facing.name,
      jieQi: meta.juBasis.jieqi,
      yuan: yuanIdxText,
      type: meta.juBasis.type,
      number: meta.juBasis.number,
      label: meta.label,
      method: '坐山三元（standard）',
      activationSource:
        meta.activation.source === 'year-立春' ? '以入住年立春为时间激活点'
          : meta.activation.source === 'date' ? '以指定时刻为时间激活点'
            : '以当下时刻为时间激活点',
      derivation: [
        `定局法：坐山三元 —— 山向奇门与时家奇门只在「如何定局」上不同，排盘机器（地盘/天盘/九星/八门/八神/暗干）完全相同。`,
        `坐${meta.sitting.name}山（${meta.sitting.degree.toFixed(1)}°，${meta.sitting.gua}宫）→ 对应节气「${meta.juBasis.jieqi}」。`,
        `坐山度数落在本山 15° 内的 ${yuanIdxText}段 → 取${yuanIdxText}。`,
        `「${meta.juBasis.jieqi}·${yuanIdxText}」查二十四节气定局 → ${meta.juBasis.type === 'yang' ? '阳遁' : '阴遁'}${meta.juBasis.number}局。`,
        `局数与时家奇门同源（局表由引擎 calculateJuShu 全量采集），可对拍验证，非杜撰。`,
        `时间激活层：${meta.activation.source === 'year-立春' ? '入住年立春' : meta.activation.source === 'date' ? '指定时刻' : '当下'} → 决定值符、值使、天盘与暗干。`,
      ],
    },
    zhiFuGong: parseGong(raw.zhiFuGong),
    zhiFuXing: raw.zhiFuXing,
    zhiShiGong: parseGong(raw.zhiShiGong),
    zhiShiMen: raw.zhiShiMen,
    palaces,
  };
}

/** 只求定局（不排盘），用于 UI 快速预览「坐这个山会得什么局」。 */
export async function computeJu(sitting: string | number): Promise<{
  type: 'yang' | 'yin'; number: string; jieqi: string; yuan: string; fullName: string;
}> {
  const { shanXiang } = await loadQiMenEngine();
  const ju = shanXiang.sittingToJu(sitting);
  return { type: ju.type, number: ju.number, jieqi: ju.jieqi, yuan: ju.yuan, fullName: ju.fullName };
}

/** 八方奇门吉凶均分（不含中宫），用于整体风险合参。 */
export function outerAverageScore(r: ShanXiangResult): number {
  const vals = OUTER_PALACES.map((p) => r.palaces[p]?.score ?? 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
