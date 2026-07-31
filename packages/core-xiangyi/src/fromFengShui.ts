/**
 * 风水层象意 —— 由 core-fengshui 的既有知识库**推导生成**，不手写。
 *
 * 理由与 core-fengshui 里「大游年表由翻卦掌推导而非手抄」是同一条：
 * 同一批断语若在两处各写一份，迟早走样，而走样的那一处不会有人发现。
 * `STAR_META`（九星星性、脏腑、人物、风险维度）与 `YOU_NIAN_META`（游年八星）
 * 已经是这个项目的单一事实来源，象意条目从它们推出来即可。
 *
 * 于是新增一颗星的病候或改一条断语，只需改 core-fengshui 一处，
 * 象意字典自动跟上，两边永不打架。
 */

import {
  AUSPICIOUS_STARS,
  INAUSPICIOUS_STARS,
  STAR_META,
  YOU_NIAN_META,
  type PalaceIndex,
  type RiskDomain,
  type YouNianStar,
} from '@hidefate/core-fengshui';
import type { Interventionability, XiangDomain, XiangYi } from './types.js';

const PALACES: readonly PalaceIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * 门槛规则：凡涉身体、意外、官非者一律至少两层共振。
 * 单看一颗二黑就断人有妇科病，是飞星取象最常见的失控方式。
 */
function minResonanceFor(domain: XiangDomain, nature: '吉' | '凶' | '中'): 1 | 2 | 3 {
  if (domain === '健康' || domain === '意外' || domain === '官非') return 2;
  return nature === '凶' ? 2 : 1;
}

/**
 * 先验取值方案（工程化取值，非统计拟合，且不参与学习）：
 *   凶星 0.50、吉星 0.45、中性 0.40；身体面一律再降到 0.35
 *   —— 身体之象在古籍中最常被引用，也最常被误用，故起点压低，靠证据抬。
 */
function priorFor(nature: '吉' | '凶' | '中', facet: '事' | '人' | '体'): number {
  if (facet === '体') return 0.35;
  return nature === '凶' ? 0.5 : nature === '吉' ? 0.45 : 0.4;
}

/** 飞星属空间，故一律「空间可调」—— 这正是风水层存在的意义。 */
const FENGSHUI_INTERVENTION: Interventionability = '空间可调';

/** 由 STAR_META 推出九星象意。 */
export function buildFlyingStarXiangYi(): XiangYi[] {
  const out: XiangYi[] = [];

  for (const p of PALACES) {
    const meta = STAR_META[p];

    // ---- 身体面：脏腑与病候 ----
    out.push({
      id: `fengshui.star${p}.health.organ`,
      source: { layer: '风水', system: '飞星', kind: '单星', token: meta.name },
      domain: '健康',
      valence: meta.nature === '吉' ? '中' : '凶',
      facet: '体',
      statement: `${meta.organs.join('、')}方面的病候；常见${meta.ailments.slice(0, 3).join('、')}`,
      minResonance: 2,
      prior: priorFor(meta.nature, '体'),
      classic: `《紫白诀》《飞星赋》${meta.name}（${meta.alias}）之应`,
      interventionability: FENGSHUI_INTERVENTION,
    });

    // ---- 事件面：失运／当旺时主事，**每颗星只出一条** ----
    //
    // 早先的写法是按 `riskDomains` 逐个维度各出一条、共用同一句断语，
    // 结果二黑的「感情」条目写着「久病缠身、寡妇当家、腹疾」—— 域名与文字对不上，
    // 用户根本无从判定，评出来的证据还会污染那条象意的后验。
    //
    // 根因是 `whenDeclining` 本身是一句复合断语，我们手上并没有分维度的文字。
    // 既然没有，就不假装有：只出一条，域取该星的首要风险维度，
    // 并在措辞上明说这是复合应事。真正的解法是把 STAR_META 的断语按维度拆开，
    // 那是 core-fengshui 的事，不该在这里靠拼接假造。
    const primary = (meta.riskDomains[0] ?? '健康') as RiskDomain;
    out.push({
      id: `fengshui.star${p}.decline`,
      source: { layer: '风水', system: '飞星', kind: '单星', token: meta.name },
      domain: primary,
      valence: meta.nature === '吉' ? '吉' : '凶',
      facet: '事',
      statement:
        meta.nature === '吉'
          ? `该方位当旺时的应事（以下任一发生即算）：${meta.whenProsperous}`
          : `该方位失运时的应事（以下任一发生即算）：${meta.whenDeclining}`,
      minResonance: minResonanceFor(primary, meta.nature),
      prior: priorFor(meta.nature, '事'),
      classic: `《紫白诀》${meta.name}（${meta.alias}）主事`,
      interventionability: FENGSHUI_INTERVENTION,
    });

    // ---- 人物面：后天卦人物，应在家中何人 ----
    out.push({
      id: `fengshui.star${p}.family.person`,
      source: { layer: '风水', system: '飞星', kind: '单星', token: meta.name },
      domain: '家庭',
      valence: meta.nature === '吉' ? '吉' : '凶',
      facet: '人',
      statement: `应在${meta.person}身上`,
      minResonance: 2,
      prior: priorFor(meta.nature, '人'),
      classic: `后天八卦人物类象，${meta.name}属${meta.wuXing}`,
      interventionability: FENGSHUI_INTERVENTION,
    });
  }

  return out;
}

/**
 * 游年八星 → 领域。
 *
 * 显式列表而非解析 `governs` 字符串 —— 解析字符串的写法在上游改一个顿号就会静默失效。
 */
const YOU_NIAN_DOMAIN: Record<YouNianStar, XiangDomain> = {
  生气: '事业',
  天医: '健康',
  延年: '感情',
  伏位: '学业',
  祸害: '官非',
  六煞: '感情',
  五鬼: '意外',
  绝命: '健康',
};

/** 由 YOU_NIAN_META 推出八宅游年象意。先验由吉凶强度换算：0.3 + 0.1×|power|。 */
export function buildBaZhaiXiangYi(): XiangYi[] {
  const all: readonly YouNianStar[] = [...AUSPICIOUS_STARS, ...INAUSPICIOUS_STARS];
  return all.map((star): XiangYi => {
    const meta = YOU_NIAN_META[star];
    const domain = YOU_NIAN_DOMAIN[star];
    return {
      id: `fengshui.younian.${star}.${domainSlug(domain)}`,
      source: { layer: '风水', system: '八宅', kind: '游年', token: star },
      domain,
      valence: meta.auspicious ? '吉' : '凶',
      facet: '事',
      statement: `${meta.governs} —— ${meta.summary}`,
      minResonance: minResonanceFor(domain, meta.auspicious ? '吉' : '凶'),
      prior: 0.3 + 0.1 * Math.abs(meta.power),
      classic: `《八宅明镜》游年${star}（${meta.alias}）`,
      interventionability: FENGSHUI_INTERVENTION,
    };
  });
}

/** 领域 → id 片段。id 一经发布不得改写，故这张表也不得改。 */
function domainSlug(d: XiangDomain): string {
  const map: Record<XiangDomain, string> = {
    健康: 'health', 财运: 'wealth', 感情: 'romance', 事业: 'career',
    人丁: 'offspring', 意外: 'accident', 官非: 'legal',
    学业: 'study', 心性: 'mind', 迁移: 'move', 人际: 'social', 家庭: 'family',
  };
  return map[d];
}

export { domainSlug };

/** 风水层词条全集。 */
export function buildFengShuiDictionary(): XiangYi[] {
  return [...buildFlyingStarXiangYi(), ...buildBaZhaiXiangYi()];
}
