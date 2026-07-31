/**
 * 运层象意 —— 由奇门占类规则转出。
 *
 * `core-qimen` 的 `feipanPredict.YONG_SHEN_RULES` 那 23 条，每条都带
 * `category`（占类）、`yongshen`（用神）与 `note`（《鸣法·用神章》的断法纲要）。
 * 那些 `note` 本来就是运层象意，转成词条即可，不必手写第二遍。
 *
 * ## 为什么不 import core-qimen
 *
 * 本包应当保持纯查表、零副作用。core-qimen 带着 416 KB 的 vendor 引擎且载入是异步的，
 * 直接依赖会把这份负担传染给所有用到象意字典的地方。
 * 故此处只声明一个**结构对齐**的输入类型，由调用方把已载入的规则传进来。
 */

import { domainSlug } from './fromFengShui.js';
import type { Interventionability, XiangDomain, XiangFacet, XiangYi } from './types.js';

/** 结构对齐 core-qimen 的 `YongShenRule`，刻意不 import 以免本包依赖 vendor 引擎。 */
export interface YongShenRuleLike {
  readonly category: string;
  readonly keywords: readonly string[];
  readonly yongshen: readonly { readonly kind: string; readonly name: string }[];
  readonly note: string;
}

interface CategoryMeta {
  readonly domain: XiangDomain;
  readonly facet: XiangFacet;
}

/**
 * 占类 → 领域与显化面。
 *
 * 两类占刻意**不转**：
 *   - `天气` —— 与人生轨迹无关，属外部客观事件
 *   - `射覆` —— 测的是术者功力，不是求测人的际遇
 * 它们会出现在 `skipped` 里而非被静默丢弃。
 */
const CATEGORY_MAP: Readonly<Record<string, CategoryMeta>> = {
  求财: { domain: '财运', facet: '事' },
  功名: { domain: '事业', facet: '事' },
  词讼: { domain: '官非', facet: '事' },
  官司: { domain: '官非', facet: '事' },
  追捕: { domain: '官非', facet: '事' },
  讨债: { domain: '财运', facet: '事' },
  寻物: { domain: '财运', facet: '物' },
  婚姻: { domain: '感情', facet: '事' },
  逃亡: { domain: '迁移', facet: '人' },
  出行: { domain: '迁移', facet: '事' },
  避难: { domain: '意外', facet: '事' },
  盗贼: { domain: '意外', facet: '事' },
  文书音讯: { domain: '人际', facet: '事' },
  口舌斗殴: { domain: '人际', facet: '事' },
  行人: { domain: '人际', facet: '人' },
  寻人: { domain: '人际', facet: '人' },
  疾病: { domain: '健康', facet: '体' },
  怀孕: { domain: '人丁', facet: '体' },
  家宅: { domain: '家庭', facet: '物' },
  风水: { domain: '家庭', facet: '物' },
  竞赛: { domain: '事业', facet: '事' },
};

/** 运层单独一层不足以断身体、官非、意外，故这三项一律要两层共振。 */
function minResonanceFor(domain: XiangDomain): 1 | 2 | 3 {
  return domain === '健康' || domain === '官非' || domain === '意外' ? 2 : 1;
}

/**
 * 占局属时间层，能改的是「什么时候动手」而非「屋子怎么摆」，
 * 故默认「择时可避」；落到身体与家宅者才交给空间层。
 */
function interventionFor(domain: XiangDomain): Interventionability {
  if (domain === '健康' || domain === '人丁') return '空间可调';
  if (domain === '家庭') return '空间可调';
  return '择时可避';
}

export interface QiMenDictionaryResult {
  readonly entries: readonly XiangYi[];
  /** 未转为象意的占类及原因 —— 明列出来，不静默丢弃。 */
  readonly skipped: readonly { readonly category: string; readonly reason: string }[];
}

/**
 * 把奇门占类规则转成运层象意词条。
 *
 * @param rules 由 `core-qimen` 的 `listQuestionCategories()` 取得
 */
export function buildQiMenDictionary(rules: readonly YongShenRuleLike[]): QiMenDictionaryResult {
  const entries: XiangYi[] = [];
  const skipped: { category: string; reason: string }[] = [];

  for (const rule of rules) {
    const meta = CATEGORY_MAP[rule.category];
    if (!meta) {
      skipped.push({
        category: rule.category,
        reason:
          rule.category === '天气'
            ? '属外部客观事件，与求测人的人生轨迹无关，不纳入象意。'
            : rule.category === '射覆'
              ? '测的是术者功力而非求测人际遇，不纳入象意。'
              : '未在占类映射表中登记，需先决定它属哪个领域再纳入。',
      });
      continue;
    }

    const yongShenNames = rule.yongshen.map((y) => y.name);
    entries.push({
      id: `qimen.${rule.category}.${domainSlug(meta.domain)}`,
      source: { layer: '运', system: '奇门', kind: '占类', token: rule.category },
      domain: meta.domain,
      // 占类本身不预设吉凶 —— 吉凶由用神与年命的生克在起局时定，不在字典里定。
      valence: '中',
      facet: meta.facet,
      statement: rule.note,
      requires:
        yongShenNames.length > 0
          ? [{ description: `须能在盘中定位用神：${yongShenNames.join('、')}`, anyOf: yongShenNames }]
          : undefined,
      minResonance: minResonanceFor(meta.domain),
      // 用神规则给的是断法而非固定结论，故先验取中位，完全靠证据往两边推。
      prior: 0.5,
      classic: `《鸣法·用神章》${rule.category}`,
      interventionability: interventionFor(meta.domain),
    });
  }

  return { entries, skipped };
}
