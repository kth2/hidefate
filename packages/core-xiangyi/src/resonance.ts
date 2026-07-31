/**
 * 三层共振 —— 决定哪些候选象意够格进入预测。
 *
 * 命层说这个大运有健康风险、风水层说二黑飞临主卧、运层的占局给出时点：
 * 三层同指一个领域，才是 docs/ROADMAP.md §4.4 那个例子里的强证据。
 * 反过来，命层一颗七杀就断人要开刀，是取象最常见的失控方式。
 *
 * 门槛写在每条象意自己的 `minResonance` 上，由本模块统一执行 ——
 * 不靠调用方自觉，也不在各处各写一遍判断。
 */

import type { Resonance, XiangCondition, XiangDomain, XiangLayer, XiangYi } from './types.js';

/**
 * 判断触发条件是否满足。
 *
 * `anyOf` 任一命中即算满足；`mustBeAbsent` 反转语义。
 * 无条件者恒为真。
 */
export function conditionsMet(
  conditions: readonly XiangCondition[] | undefined,
  presentTokens: ReadonlySet<string>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    const hit = c.anyOf.some((t) => presentTokens.has(t));
    return c.mustBeAbsent ? !hit : hit;
  });
}

/**
 * 从字典里挑出被当前盘面激活的条目。
 *
 * 激活 = 象源 token 在场 **且** 触发条件满足。
 * 这一步只看在不在场，不看吉凶轻重 —— 加权是下游 core-synthesis 的事。
 */
export function activate(
  dictionary: readonly XiangYi[],
  presentTokens: ReadonlySet<string>,
): XiangYi[] {
  return dictionary.filter(
    (x) => presentTokens.has(x.source.token) && conditionsMet(x.requires, presentTokens),
  );
}

const clampResonance = (n: number): 1 | 2 | 3 => (n >= 3 ? 3 : n === 2 ? 2 : 1);

/**
 * 按领域归组，算出每个领域有几层在说话，并据此放行或拦下各条目。
 *
 * 被拦下的条目放在 `rejected` 里而不是丢弃 —— 用户问「为什么没提醒我」时，
 * 得答得出「命层确有此象，但风水与运层都不支持，未达两层共振门槛」。
 */
export function resonanceOf(activated: readonly XiangYi[]): Resonance[] {
  const byDomain = new Map<XiangDomain, XiangYi[]>();
  for (const x of activated) {
    const list = byDomain.get(x.domain);
    if (list) list.push(x);
    else byDomain.set(x.domain, [x]);
  }

  const out: Resonance[] = [];
  for (const [domain, entries] of byDomain) {
    const layers = [...new Set(entries.map((e) => e.source.layer))] as XiangLayer[];
    const resonance = clampResonance(layers.length);
    out.push({
      domain,
      layers,
      resonance,
      admitted: entries.filter((e) => e.minResonance <= resonance),
      rejected: entries.filter((e) => e.minResonance > resonance),
    });
  }

  // 共振层数高者在前，同层数按领域名稳定排序，保证输出可重放。
  return out.sort((a, b) => b.resonance - a.resonance || a.domain.localeCompare(b.domain));
}

/** 一步到位：盘面 token → 各领域的共振结论。 */
export function analyseResonance(
  dictionary: readonly XiangYi[],
  presentTokens: Iterable<string>,
): Resonance[] {
  return resonanceOf(activate(dictionary, new Set(presentTokens)));
}

/**
 * 解释某条象意为何未被放行 —— 供 UI 回答「为什么没提醒我」。
 * 未被拦下时返回 null。
 */
export function explainRejection(result: readonly Resonance[], xiangId: string): string | null {
  for (const r of result) {
    const hit = r.rejected.find((e) => e.id === xiangId);
    if (hit) {
      return (
        `「${hit.statement}」需 ${hit.minResonance} 层共振方可成立，` +
        `本次「${r.domain}」只有 ${r.layers.join('、')} ${r.resonance} 层在说话，故未出报。`
      );
    }
  }
  return null;
}
