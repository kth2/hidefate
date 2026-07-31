/**
 * 命层象意词条（手写）。
 *
 * 只收八字十神与紫微主星 —— 风水层由 `fromFengShui.ts` 从 core-fengshui 的既有知识库
 * **推导生成**（避免两处维护同一批断语而走样），运层由 `fromQiMen.ts` 从奇门占类规则转出。
 *
 * ## 写词条的三条规矩
 *
 * 1. **一个象拆成多条候选，不要合并成一句万金油。** 七杀写成「主刚烈、多变动、
 *    易有伤灾官非」这种句子，对轨时无法判定是哪一条应验，等于没写。
 * 2. **statement 必须具体到能被判定。**「事业有波动」不收，「离职或被调岗」才收。
 * 3. **凡涉身体、官非者 minResonance 至少为 2。** 命层一颗七杀就断人要开刀，
 *    是取象最常见的失控方式，靠门槛挡住而不是靠自觉。
 *
 * `prior` 是古法轻重的工程化取值，非统计拟合，**且永不参与学习**（见 ROADMAP §7）。
 */

import type { XiangYi } from './types.js';

/* ============ 八字十神 ============ */

const BAZI: readonly XiangYi[] = [
  // ---- 七杀 ----
  {
    id: 'bazi.qisha.career.compete',
    source: { layer: '命', system: '八字', kind: '十神', token: '七杀' },
    domain: '事业', valence: '中', facet: '事',
    statement: '竞争、创业、独当一面承压；主动出击的局面多于被安排的局面',
    minResonance: 1, prior: 0.6,
    classic: '《三命通会·论七杀》：七杀有制化为权',
    interventionability: '行为可调',
  },
  {
    id: 'bazi.qisha.legal.lawsuit',
    source: { layer: '命', system: '八字', kind: '十神', token: '七杀' },
    domain: '官非', valence: '凶', facet: '事',
    statement: '诉讼、纠纷、被追责或被处分',
    requires: [{ description: '须七杀无制（不见食神制杀、不见印化杀）', anyOf: ['七杀无制'] }],
    minResonance: 2, prior: 0.35,
    classic: '《渊海子平·七杀篇》：杀无制则为鬼',
    interventionability: '择时可避',
  },
  {
    id: 'bazi.qisha.health.surgery',
    source: { layer: '命', system: '八字', kind: '十神', token: '七杀' },
    domain: '健康', valence: '凶', facet: '体',
    statement: '开刀、外伤、金属器械所伤',
    minResonance: 2, prior: 0.3,
    classic: '《三命通会·论七杀》，七杀属金主刑伤',
    interventionability: '空间可调',
  },
  {
    id: 'bazi.qisha.person.martial',
    source: { layer: '命', system: '八字', kind: '十神', token: '七杀' },
    domain: '事业', valence: '吉', facet: '人',
    statement: '军警武职、外科、纪律性或高风险行业',
    minResonance: 1, prior: 0.4,
    classic: '《滴天髓·论官杀》',
    interventionability: '不可调',
  },
  {
    id: 'bazi.qisha.mind.decisive',
    source: { layer: '命', system: '八字', kind: '十神', token: '七杀' },
    domain: '心性', valence: '中', facet: '人',
    statement: '刚烈决断、不受约束、宁折不弯',
    minResonance: 1, prior: 0.65,
    classic: '《三命通会·论七杀》',
    interventionability: '不可调',
  },

  // ---- 正官 ----
  {
    id: 'bazi.zhengguan.career.promotion',
    source: { layer: '命', system: '八字', kind: '十神', token: '正官' },
    domain: '事业', valence: '吉', facet: '事',
    statement: '升迁、转正、取得名分或职衔',
    minResonance: 1, prior: 0.55,
    classic: '《渊海子平·正官篇》',
    interventionability: '行为可调',
  },
  {
    id: 'bazi.zhengguan.legal.constraint',
    source: { layer: '命', system: '八字', kind: '十神', token: '正官' },
    domain: '官非', valence: '中', facet: '事',
    statement: '受管束、被审查、须走正式程序方能了结之事',
    minResonance: 2, prior: 0.3,
    classic: '《渊海子平·正官篇》：官为管我者',
    interventionability: '行为可调',
  },
  {
    id: 'bazi.zhengguan.mind.rule',
    source: { layer: '命', system: '八字', kind: '十神', token: '正官' },
    domain: '心性', valence: '吉', facet: '人',
    statement: '守规矩、重体面、在体制内行事顺遂',
    minResonance: 1, prior: 0.6,
    classic: '《三命通会·论正官》',
    interventionability: '不可调',
  },

  // ---- 伤官 ----
  {
    id: 'bazi.shangguan.career.leave',
    source: { layer: '命', system: '八字', kind: '十神', token: '伤官' },
    domain: '事业', valence: '中', facet: '事',
    statement: '离职、跳槽、脱离原有体制自立',
    minResonance: 1, prior: 0.5,
    classic: '《三命通会·论伤官》：伤官见官为祸百端',
    interventionability: '行为可调',
  },
  {
    id: 'bazi.shangguan.career.talent',
    source: { layer: '命', system: '八字', kind: '十神', token: '伤官' },
    domain: '事业', valence: '吉', facet: '人',
    statement: '以才华、技艺、口才或创作立身',
    minResonance: 1, prior: 0.55,
    classic: '《滴天髓·论伤官》',
    interventionability: '不可调',
  },
  {
    id: 'bazi.shangguan.legal.offend',
    source: { layer: '命', system: '八字', kind: '十神', token: '伤官' },
    domain: '官非', valence: '凶', facet: '事',
    statement: '顶撞上级或权威而招是非、处分、合约纠纷',
    requires: [{ description: '须同时见正官（伤官见官）', anyOf: ['正官'] }],
    minResonance: 2, prior: 0.4,
    classic: '《三命通会·论伤官》',
    interventionability: '行为可调',
  },

  // ---- 偏财 ----
  {
    id: 'bazi.piancai.wealth.windfall',
    source: { layer: '命', system: '八字', kind: '十神', token: '偏财' },
    domain: '财运', valence: '吉', facet: '事',
    statement: '意外之财、投机或副业得利、非固定薪资的收入',
    minResonance: 1, prior: 0.5,
    classic: '《渊海子平·偏财篇》',
    interventionability: '行为可调',
  },
  {
    id: 'bazi.piancai.romance.affinity',
    source: { layer: '命', system: '八字', kind: '十神', token: '偏财' },
    domain: '感情', valence: '中', facet: '人',
    statement: '异性缘旺、交际场合中的情感机会增多',
    minResonance: 2, prior: 0.35,
    classic: '《三命通会·论财》，男以财为妻',
    interventionability: '行为可调',
  },

  // ---- 正印 ----
  {
    id: 'bazi.zhengyin.study.credential',
    source: { layer: '命', system: '八字', kind: '十神', token: '正印' },
    domain: '学业', valence: '吉', facet: '事',
    statement: '考取文凭、进修、通过资格考试',
    minResonance: 1, prior: 0.55,
    classic: '《渊海子平·印绶篇》',
    interventionability: '择时可避',
  },
  {
    id: 'bazi.zhengyin.person.mother',
    source: { layer: '命', system: '八字', kind: '十神', token: '正印' },
    domain: '家庭', valence: '中', facet: '人',
    statement: '母亲或长辈师长之事；受其庇护，或其身体有变',
    minResonance: 2, prior: 0.4,
    classic: '《三命通会·论印绶》，印为生我者',
    interventionability: '不可调',
  },

  // ---- 劫财 ----
  {
    id: 'bazi.jiecai.wealth.loss',
    source: { layer: '命', system: '八字', kind: '十神', token: '劫财' },
    domain: '财运', valence: '凶', facet: '事',
    statement: '破财、合伙拆伙、为他人担保或垫付而受损',
    minResonance: 2, prior: 0.45,
    classic: '《渊海子平·比劫篇》：劫财夺财',
    interventionability: '行为可调',
  },
  {
    id: 'bazi.jiecai.social.rivalry',
    source: { layer: '命', system: '八字', kind: '十神', token: '劫财' },
    domain: '人际', valence: '中', facet: '人',
    statement: '与同辈争夺资源；亦主得同辈之助，视有制无制而定',
    minResonance: 1, prior: 0.5,
    classic: '《三命通会·论比劫》',
    interventionability: '行为可调',
  },
];

/* ============ 紫微主星 ============ */

const ZIWEI: readonly XiangYi[] = [
  // ---- 破军 ----
  {
    id: 'ziwei.pojun.career.renew',
    source: { layer: '命', system: '紫微', kind: '主星', token: '破军' },
    domain: '事业', valence: '中', facet: '事',
    statement: '破旧立新：转行、重组、放弃既有基业另起炉灶',
    minResonance: 1, prior: 0.6,
    classic: '《紫微斗数全书·诸星问答论》，破军主耗',
    interventionability: '行为可调',
  },
  {
    id: 'ziwei.pojun.wealth.drain',
    source: { layer: '命', system: '紫微', kind: '主星', token: '破军' },
    domain: '财运', valence: '凶', facet: '事',
    statement: '大额消耗：装修、置换、赔付或投入期长的支出',
    minResonance: 2, prior: 0.45,
    classic: '《紫微斗数全书》，破军为耗星',
    interventionability: '行为可调',
  },
  {
    id: 'ziwei.pojun.health.surgery',
    source: { layer: '命', system: '紫微', kind: '主星', token: '破军' },
    domain: '健康', valence: '凶', facet: '体',
    statement: '手术、创伤、需切除或置换的病症',
    requires: [{ description: '须落疾厄宫，或与煞星同度', anyOf: ['疾厄', '擎羊', '陀罗', '火星', '铃星'] }],
    minResonance: 2, prior: 0.3,
    classic: '《紫微斗数全书·诸星问答论》',
    interventionability: '空间可调',
  },
  {
    id: 'ziwei.pojun.move.leave',
    source: { layer: '命', system: '紫微', kind: '主星', token: '破军' },
    domain: '迁移', valence: '中', facet: '事',
    statement: '离乡、搬迁、长期外派',
    minResonance: 2, prior: 0.4,
    classic: '《紫微斗数全书》，破军居迁移主动',
    interventionability: '择时可避',
  },

  // ---- 贪狼 ----
  {
    id: 'ziwei.tanlang.romance.peach',
    source: { layer: '命', system: '紫微', kind: '主星', token: '贪狼' },
    domain: '感情', valence: '中', facet: '事',
    statement: '桃花、应酬场合中的情感机会；亦主交际手腕',
    minResonance: 1, prior: 0.6,
    classic: '《紫微斗数全书》，贪狼为桃花之首',
    interventionability: '行为可调',
  },
  {
    id: 'ziwei.tanlang.wealth.burst',
    source: { layer: '命', system: '紫微', kind: '主星', token: '贪狼' },
    domain: '财运', valence: '吉', facet: '事',
    statement: '骤发之财或事业突起，来去皆快，宜见好就收',
    requires: [{ description: '须与火星或铃星同宫（火贪／铃贪）', anyOf: ['火星', '铃星'] }],
    minResonance: 1, prior: 0.5,
    classic: '《紫微斗数全书》，火贪铃贪为暴发之格',
    interventionability: '择时可避',
  },
  {
    id: 'ziwei.tanlang.mind.desire',
    source: { layer: '命', system: '紫微', kind: '主星', token: '贪狼' },
    domain: '心性', valence: '中', facet: '人',
    statement: '多欲多才、兴趣广泛而难专一',
    minResonance: 1, prior: 0.6,
    classic: '《紫微斗数全书·诸星问答论》',
    interventionability: '不可调',
  },

  // ---- 廉贞 ----
  {
    id: 'ziwei.lianzhen.legal.entangle',
    source: { layer: '命', system: '紫微', kind: '主星', token: '廉贞' },
    domain: '官非', valence: '凶', facet: '事',
    statement: '涉讼、被调查、合约或行政纠纷缠身',
    requires: [{ description: '须化忌或与煞同度', anyOf: ['化忌', '擎羊', '陀罗'] }],
    minResonance: 2, prior: 0.35,
    classic: '《紫微斗数全书》，廉贞为囚星',
    interventionability: '择时可避',
  },
  {
    id: 'ziwei.lianzhen.health.blood',
    source: { layer: '命', system: '紫微', kind: '主星', token: '廉贞' },
    domain: '健康', valence: '凶', facet: '体',
    statement: '血光、心血管或炎症类病候',
    minResonance: 3, prior: 0.25,
    classic: '《紫微斗数全书》，廉贞属火主血',
    interventionability: '空间可调',
  },

  // ---- 天机 ----
  {
    id: 'ziwei.tianji.move.shift',
    source: { layer: '命', system: '紫微', kind: '主星', token: '天机' },
    domain: '迁移', valence: '中', facet: '事',
    statement: '奔波变动：换居所、换岗位、频繁差旅',
    minResonance: 1, prior: 0.55,
    classic: '《紫微斗数全书》，天机为动星',
    interventionability: '择时可避',
  },
  {
    id: 'ziwei.tianji.mind.scheme',
    source: { layer: '命', system: '紫微', kind: '主星', token: '天机' },
    domain: '心性', valence: '吉', facet: '人',
    statement: '善谋多思、长于策划与分析，亦易思虑过度',
    minResonance: 1, prior: 0.65,
    classic: '《紫微斗数全书·诸星问答论》',
    interventionability: '不可调',
  },

  // ---- 太阴 ----
  {
    id: 'ziwei.taiyin.wealth.estate',
    source: { layer: '命', system: '紫微', kind: '主星', token: '太阴' },
    domain: '财运', valence: '吉', facet: '物',
    statement: '田宅、不动产与积蓄类的财；进财缓而稳',
    minResonance: 1, prior: 0.5,
    classic: '《紫微斗数全书》，太阴主田宅',
    interventionability: '行为可调',
  },
  {
    id: 'ziwei.taiyin.family.female',
    source: { layer: '命', system: '紫微', kind: '主星', token: '太阴' },
    domain: '家庭', valence: '中', facet: '人',
    statement: '母亲、妻女等女性亲属之事',
    minResonance: 2, prior: 0.45,
    classic: '《紫微斗数全书》，太阴为母为妻',
    interventionability: '不可调',
  },
];

/** 命层词条全集（八字 + 紫微）。 */
export const MING_LAYER_DICTIONARY: readonly XiangYi[] = [...BAZI, ...ZIWEI];
