'use client';

/**
 * AI 客户端 —— 统一走 OpenAI 兼容协议。
 *
 * 为什么统一到 OpenAI 协议：DeepSeek、Groq、OpenRouter、SiliconFlow、Ollama、
 * 以及 Gemini 的兼容端点，全都实现了 `GET /models` 与 `POST /chat/completions`。
 * 只认这一套协议，就能用同一份代码支持全部供应商，用户只需填 URL 与 Key。
 *
 * 模型列表**从 API 实时拉取**（`GET {baseUrl}/models`），不写死在代码里 ——
 * 供应商随时上下架模型，硬编码的清单必然过期。
 *
 * 网络请求一律经由本机 Next 路由 `/api/ai/*` 转发，原因见 route handler 的注释
 * （规避浏览器 CORS，并让 Key 不出现在跨域请求里）。
 */

export type ProviderId = 'deepseek' | 'groq' | 'openrouter' | 'gemini' | 'siliconflow' | 'ollama' | 'custom';

export interface ProviderPreset {
  readonly id: ProviderId;
  readonly label: string;
  readonly baseUrl: string;
  /** 是否需要 API Key（本地 Ollama 不需要）。 */
  readonly needsKey: boolean;
  readonly note: string;
  readonly keyUrl?: string;
}

/** 供应商预设。全部有免费额度或可本地运行。 */
export const PROVIDERS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    needsKey: true,
    note: '中文能力强，价格低，适合本 App 的中文长文解读。',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    note: '有免费额度，推理速度极快，适合快问快答。',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    note: '一个 Key 通吃数百个模型，其中不少标注为免费（id 以 :free 结尾）。',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini（OpenAI 兼容端点）',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    note: '用 Google 官方提供的 OpenAI 兼容层，有免费额度。',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    needsKey: true,
    note: '国内可直连，部分模型免费。',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    id: 'ollama',
    label: 'Ollama（本机运行）',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    note: '完全本地推理，资料一步都不出这台机器 —— 与本 App 的隐私取向最契合。',
  },
  {
    id: 'custom',
    label: '自定义（任何 OpenAI 兼容端点）',
    baseUrl: '',
    needsKey: true,
    note: '填入以 /v1 结尾的 Base URL 即可。',
  },
];

export function providerById(id: ProviderId): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1]!;
}

/** 归一化后的模型条目。 */
export interface ModelInfo {
  readonly id: string;
  /** 展示名，缺省时同 id。 */
  readonly name: string;
  /** 上下文长度（供应商提供时）。 */
  readonly contextLength: number | null;
  /** 是否免费（依 pricing 或 id 后缀判定）。 */
  readonly free: boolean;
  /** 供应商 / 归属。 */
  readonly ownedBy: string | null;
  readonly description: string | null;
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  owned_by?: unknown;
  description?: unknown;
  context_length?: unknown;
  max_context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
  [k: string]: unknown;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * 把各家 `/models` 的返回归一化。
 *
 * 各家结构不同：标准 OpenAI 只有 id/object/owned_by；OpenRouter 另带 name、
 * context_length 与 pricing；Ollama 只有 id。故此处一律防御性解析，
 * 缺字段就留 null，绝不因为某家多给或少给字段而整个列表拉不出来。
 */
export function normaliseModels(payload: unknown): ModelInfo[] {
  const arr: RawModel[] = Array.isArray(payload)
    ? (payload as RawModel[])
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: RawModel[] }).data)
      : Array.isArray((payload as { models?: unknown })?.models)
        ? ((payload as { models: RawModel[] }).models)
        : [];

  const out: ModelInfo[] = [];
  for (const m of arr) {
    const id = typeof m?.id === 'string' ? m.id : typeof m?.name === 'string' ? m.name : null;
    if (!id) continue;
    const promptPrice = num(m?.pricing?.prompt);
    const completionPrice = num(m?.pricing?.completion);
    const pricedFree =
      promptPrice != null && completionPrice != null && promptPrice === 0 && completionPrice === 0;
    out.push({
      id,
      name: typeof m?.name === 'string' && m.name ? m.name : id,
      contextLength: num(m?.context_length) ?? num(m?.max_context_length),
      free: pricedFree || id.endsWith(':free'),
      ownedBy: typeof m?.owned_by === 'string' ? m.owned_by : null,
      description: typeof m?.description === 'string' ? m.description : null,
    });
  }
  // 免费优先，其次按 id 字典序，方便在长列表里先看到不花钱的。
  return out.sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
}

export interface AiConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model?: string;
  /** 直连供应商而不经本机转发。默认 false（经转发，兼容性最好）。 */
  readonly direct?: boolean;
}

function trimBase(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

/** 拉取模型列表。 */
export async function listModels(cfg: AiConfig, signal?: AbortSignal): Promise<ModelInfo[]> {
  const baseUrl = trimBase(cfg.baseUrl);
  if (!baseUrl) throw new Error('请先填写 API Base URL。');

  const res = cfg.direct
    ? await fetch(`${baseUrl}/models`, {
        headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
        signal,
      })
    : await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey: cfg.apiKey }),
        signal,
      });

  const text = await res.text();
  if (!res.ok) throw new Error(explainHttpError(res.status, text));

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`该端点返回的不是 JSON，可能 Base URL 填错了（通常应以 /v1 结尾）。收到：${text.slice(0, 120)}`);
  }
  const models = normaliseModels(payload);
  if (models.length === 0) {
    throw new Error('该端点返回了 0 个模型。请确认 Base URL 是否正确，以及此 Key 是否有列出模型的权限。');
  }
  return models;
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * 流式对话。逐段回调 delta，返回完整文本。
 * 不支持流式的端点会走非流式回退，用户无感。
 */
export async function chatStream(
  cfg: AiConfig,
  messages: readonly ChatMessage[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = trimBase(cfg.baseUrl);
  if (!baseUrl) throw new Error('请先在设置中填写 API Base URL。');
  if (!cfg.model) throw new Error('请先选择一个模型。');

  const body = {
    model: cfg.model,
    messages,
    stream: true,
    temperature: 0.4, // 解读须稳，不要发散
  };

  const res = cfg.direct
    ? await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      })
    : await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey: cfg.apiKey, payload: body }),
        signal,
      });

  if (!res.ok) throw new Error(explainHttpError(res.status, await res.text()));
  if (!res.body) throw new Error('该端点未返回响应体。');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // 末行可能不完整，留到下一轮
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
          error?: { message?: string };
        };
        if (json.error?.message) throw new Error(json.error.message);
        const piece = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      } catch (e) {
        // 单块解析失败不该中断整段流；但供应商明确回报的 error 要抛出。
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      }
    }
  }

  if (!full.trim()) {
    throw new Error('模型返回了空内容。可能是该模型不支持流式输出，或本次请求被供应商拒绝。');
  }
  return full;
}

/** 把 HTTP 错误翻成用户能据以行动的中文。 */
function explainHttpError(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const m = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message;
    if (m) detail = m;
  } catch {
    /* 保留原始文本 */
  }
  const hint =
    status === 401 || status === 403
      ? 'API Key 无效或无权限，请重新检查 Key。'
      : status === 404
        ? 'Base URL 路径不对 —— 多数供应商的 Base URL 应以 /v1 结尾（例如 https://api.deepseek.com/v1）。'
        : status === 429
          ? '触发限流或额度用尽，请稍后再试或换一个模型。'
          : status >= 500
            ? '供应商服务端错误，与本 App 无关，请稍后重试。'
            : '请求被拒绝。';
  return `${hint}（HTTP ${status}）${detail ? ` 详情：${detail}` : ''}`;
}
