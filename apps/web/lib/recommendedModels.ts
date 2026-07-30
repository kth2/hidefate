'use client';

/**
 * 每家供应商的一小撮「推荐模型」。
 *
 * 与「不写死模型清单」那条规矩并不冲突，因为这里**不是清单，是标注**：
 * 可选项永远只来自 `GET {baseUrl}/models` 的实时返回，本文件只负责在那份
 * 返回里认出几个已知适合本 App 的（中文长文解读、指令跟随稳、便宜或免费），
 * 给它们打个「推荐」标，并把其余的收进「显示全部」里。
 *
 * 所以：
 *   - 名单里有、但 API 没返回的 → 界面上根本不出现（不会推荐一个下架的模型）
 *   - 名单里没有、但 API 返回了 → 照常可选，只是要展开才看得到
 *
 * 匹配用「包含」而非全等：各家对同一个模型的 id 前后缀写法不一
 * （`models/gemini-2.5-flash`、`deepseek-ai/DeepSeek-V3`、`qwen2.5:7b`），
 * 全等匹配会因为一个前缀就全部落空。
 */

import type { ModelInfo, ProviderId } from './ai';

/** 按推荐优先级排列 —— 越靠前越优先被自动选中。 */
export const RECOMMENDED_MODELS: Record<ProviderId, readonly string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b', 'llama-3.1-8b-instant'],
  openrouter: [
    'deepseek/deepseek-chat',
    'qwen/qwen-2.5-72b-instruct',
    'meta-llama/llama-3.3-70b-instruct',
    'google/gemini-2.0-flash',
  ],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'],
  siliconflow: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-R1'],
  ollama: ['qwen3', 'qwen2.5', 'deepseek-r1', 'glm4', 'llama3.1'],
  // 自定义端点无从预知跑的是什么，不做推荐
  custom: [],
};

/** 推荐理由（展示在推荐区顶部，说明凭什么推荐）。 */
export const RECOMMEND_REASON =
  '推荐依据：中文长文解读稳、指令跟随好、且便宜或有免费额度。列表本身仍来自该 API 的实时返回，不是写死的清单。';

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_]/g, '');
}

/** 该模型是否在此供应商的推荐名单里。 */
export function isRecommended(provider: ProviderId, modelId: string): boolean {
  return recommendRank(provider, modelId) >= 0;
}

/** 推荐名次；不在名单里返回 -1。 */
export function recommendRank(provider: ProviderId, modelId: string): number {
  const id = norm(modelId);
  return RECOMMENDED_MODELS[provider].findIndex((r) => id.includes(norm(r)));
}

/**
 * 拆成「推荐」与「其余」两组。
 * 推荐组按名单顺序排；其余组保持传入顺序（listModels 已按免费优先排好）。
 */
export function splitByRecommendation(
  models: readonly ModelInfo[],
  provider: ProviderId,
): { recommended: ModelInfo[]; rest: ModelInfo[] } {
  const recommended: { m: ModelInfo; rank: number }[] = [];
  const rest: ModelInfo[] = [];
  for (const m of models) {
    const rank = recommendRank(provider, m.id);
    if (rank >= 0) recommended.push({ m, rank });
    else rest.push(m);
  }
  return {
    recommended: recommended.sort((a, b) => a.rank - b.rank).map((x) => x.m),
    rest,
  };
}

/**
 * 首次拉到列表时该默认选中谁。
 *
 * 顺序：推荐名单里排最前的 → 任一免费模型 → 列表首项。
 * 返回 null 表示列表为空，调用方不该动当前选择。
 */
export function pickDefaultModel(
  models: readonly ModelInfo[],
  provider: ProviderId,
): string | null {
  if (models.length === 0) return null;
  const { recommended } = splitByRecommendation(models, provider);
  return (recommended[0] ?? models.find((m) => m.free) ?? models[0])!.id;
}
