/**
 * Token 词表：每个 token 可能来自哪几层。
 *
 * ## 为什么需要这张表
 *
 * 事件模板要求「至少 N 层共振」，而共振只由**命中的** token 贡献层。
 * 如果一条模板的全部候选 token 都只可能来自两层，却要求三层共振，
 * 那它永远不会触发 —— 是死规则，而且死得很安静：
 * 没有报错、没有告警，只是从此再也不出现。
 *
 * 本项目已经被同类 bug 咬过一次（紫微「府相朝垣」的宫位条件写反，
 * 1152 张盘命中 0 次）。所以这里把「哪个 token 能从哪层来」显式列出来，
 * 并用 `templates.test` 的可达性断言锁住。
 *
 * 另一个作用是**挡住拼错的 token**：写进模板却不在本表里的，
 * 说明它根本没有任何一层会发出来，同样是死规则。
 */

import type { XiangLayer } from './types.js';

/** 十神 —— 大运出的算命层，流年流月出的算运层。 */
const SHI_SHEN = [
  '比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印',
] as const;

/** 紫微主星 —— 本命盘出的算命层；同名星作流年四化时算运层。 */
const ZIWEI_STARS = [
  '紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府',
  '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军',
] as const;

/** 年支系神煞 —— 本命年支出的算命层，流年支出的算运层。 */
const SHEN_SHA = ['驿马', '桃花', '红鸾', '天喜'] as const;

/** 九星 —— 宅盘飞星算风水层，流年流月紫白算运层。 */
const FLYING_STARS = [
  '一白', '二黑', '三碧', '四绿', '五黄', '六白', '七赤', '八白', '九紫',
] as const;

/** 八宅游年 —— 只可能来自风水层。 */
const YOU_NIAN = ['生气', '天医', '延年', '伏位', '祸害', '六煞', '五鬼', '绝命'] as const;

/** 奇门八神与四化 —— 只可能来自运层。 */
const YUN_ONLY = ['白虎', '六合', '太阴神', '腾蛇', '玄武', '九天', '九地', '值符', '化忌', '化禄', '化权', '化科'] as const;

/**
 * 双星组合 token。
 *
 * 玄空的断事在**配对**上：二五交加 ≠ 二黑 + 五黄。
 * 早先事件层把山星与向星拆成两个独立 token，配对信息整个丢掉，
 * 等于守着 core-fengshui 那 53 条经典组合表不用。
 *
 * 两种前缀：
 *   `合:` 宅盘原局双星组合 —— 属风水层，段内常量
 *   `临:` 流年星飞入该宫与原山向所成之新组合 —— 属运层，是应期的触发
 */
const COMBO_NAMES = [
  '二五交加', '五二交加', '斗牛煞', '穿心煞', '交剑煞', '火烧天门',
  '文昌局', '武曲财局', '金水相涵', '紫辅同宫', '风廉相值', '廉贞得火',
  '先天火数', '双碧临门', '双黑临门', '双五叠临', '双白同宫', '双白财星',
  '双紫齐临', '双绿同宫', '风见病符', '金水桃花', '损小口',
  '碧绿风魔', '三五同宫', '水土相荡', '水木相生', '五黄污水', '双土比和', '五黄压土',
] as const;

/** 紫微辅星（会在命层出现，若日后开放辅星取象）。 */
const ZIWEI_MINOR = ['火星', '铃星', '擎羊', '陀罗', '文昌', '文曲', '左辅', '右弼'] as const;

function put(map: Map<string, Set<XiangLayer>>, tokens: readonly string[], layers: readonly XiangLayer[]) {
  for (const t of tokens) {
    const s = map.get(t) ?? new Set<XiangLayer>();
    for (const l of layers) s.add(l);
    map.set(t, s);
  }
}

function build(): ReadonlyMap<string, ReadonlySet<XiangLayer>> {
  const m = new Map<string, Set<XiangLayer>>();
  put(m, SHI_SHEN, ['命', '运']);
  put(m, ZIWEI_STARS, ['命', '运']);
  put(m, ZIWEI_MINOR, ['命']);
  put(m, SHEN_SHA, ['命', '运']);
  put(m, FLYING_STARS, ['风水', '运']);
  put(m, YOU_NIAN, ['风水']);
  put(m, YUN_ONLY, ['运']);
  // 原局组合属风水层；流年临宫所成之组合属运层
  put(m, COMBO_NAMES.map((n) => `合:${n}`), ['风水']);
  put(m, COMBO_NAMES.map((n) => `临:${n}`), ['运']);
  return m;
}

/** token → 它可能来自哪几层。不在表中者视为**不可能出现**。 */
export const TOKEN_LAYERS: ReadonlyMap<string, ReadonlySet<XiangLayer>> = build();

/** 该 token 是否有任何一层会发出来。false 表示模板里写了个死 token。 */
export function isKnownToken(token: string): boolean {
  return TOKEN_LAYERS.has(token);
}

/**
 * 一组 token 最多能凑出几层共振。
 *
 * 用于可达性检查：若一条模板的候选 token 最多只能凑出两层，
 * 却要求三层，那它是死规则。
 */
export function maxReachableLayers(tokens: readonly string[]): number {
  const layers = new Set<XiangLayer>();
  for (const t of tokens) {
    for (const l of TOKEN_LAYERS.get(t) ?? []) layers.add(l);
  }
  return layers.size;
}
