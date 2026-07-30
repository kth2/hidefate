'use client';

/**
 * 「测试连接」——发一次最小的真实补全，把结果说成一句人话。
 *
 * 设计上的一条硬要求：**用户永远看不到 HTTP 状态码，也看不到供应商回传的
 * 原始英文错误串**。理由很直接 —— 会填 Base URL 的人未必懂 401 与 429 的
 * 区别，而「Key 不对」和「今天额度用完了」需要采取的行动完全不同。
 * 原始信息不是不要，而是只留给控制台（见 AI 设置页的调试折叠区）。
 *
 * 分类逻辑与网络请求分离：classifyProbe 是纯函数，可直接测试；
 * testConnection 只负责发请求并把异常喂给它。
 */

import { AI_DIRECT_ONLY, probeCompletion, type AiConfig } from './ai';

export type ConnectionOutcome =
  | 'ok'
  | 'bad-key'
  | 'cors'
  | 'rate-limited'
  | 'model-not-found'
  | 'network'
  | 'bad-url'
  | 'server'
  | 'unknown';

export interface ConnectionVerdict {
  readonly outcome: ConnectionOutcome;
  readonly ok: boolean;
  /** 给用户看的一句话结论。 */
  readonly message: string;
  /** 下一步该做什么。 */
  readonly nextStep: string;
}

const VERDICTS: Record<ConnectionOutcome, { message: string; nextStep: string }> = {
  ok: {
    message: '连接成功，这个模型现在就能用。',
    nextStep: '可以回到「问答」页开始对话了。',
  },
  'bad-key': {
    message: 'API Key 不被这家供应商接受。',
    nextStep: '到供应商后台重新复制一次 Key（注意别多带空格或换行），或确认这个 Key 有没有被停用。',
  },
  cors: {
    message: '这家供应商不允许网页直接调用它，请求在浏览器这一步就被挡下了。',
    nextStep: '换一家对网页开放的供应商（OpenRouter、Groq、Gemini 已确认可用），或改用本机运行的 Ollama。',
  },
  'rate-limited': {
    message: '请求太频繁，或这个账号的额度已经用完了。',
    nextStep: '过几分钟再试；若是额度用完，换一个标注「免费」的模型或到供应商后台充值。',
  },
  'model-not-found': {
    message: '这个模型在该账号下不可用 —— 可能已下架，或需要额外开通。',
    nextStep: '回到上方「拉取可用模型列表」重拉一次，从新列表里挑一个。',
  },
  network: {
    message: '连不上网络，请求没能发出去。',
    nextStep: '确认设备已联网后重试。本 App 的排盘与预测不需要联网，可以照常使用。',
  },
  'bad-url': {
    message: '这个地址上没有找到接口，多半是 Base URL 填错了。',
    nextStep: '多数供应商的 Base URL 要以 /v1 结尾，例如 https://api.deepseek.com/v1 。',
  },
  server: {
    message: '供应商那边出了故障，与本 App 无关。',
    nextStep: '稍后再试；若持续如此，换一家供应商。',
  },
  unknown: {
    message: '这次请求没有成功，原因无法归类。',
    nextStep: '确认 Base URL、Key 与模型都填对后重试；也可以换一家供应商比对一下。',
  },
};

function verdict(outcome: ConnectionOutcome): ConnectionVerdict {
  return { outcome, ok: outcome === 'ok', ...VERDICTS[outcome] };
}

export interface ProbeInput {
  /** HTTP 状态码；fetch 根本没发出去时为 null。 */
  readonly status: number | null;
  /** 响应体原文；只用于分类，绝不展示。 */
  readonly body?: string | null;
  /** fetch 抛出的异常（断网 / CORS 会走这里）。 */
  readonly threw?: boolean;
  /** 本次是否为浏览器直连供应商。 */
  readonly direct: boolean;
  /** 设备是否联网。区分「断网」与「被 CORS 挡下」只能靠这个。 */
  readonly online: boolean;
}

/**
 * 把一次探测结果归类。
 *
 * 浏览器对 CORS 失败与断网给出的是同一个 "Failed to fetch"，无从区分。
 * 唯一可靠的分界是 navigator.onLine：离线就是断网，在线而直连失败，
 * 在实践中几乎必然是 CORS。故此处按此判定，并在文案里说明该怎么办。
 */
export function classifyProbe(p: ProbeInput): ConnectionVerdict {
  if (p.threw || p.status == null) {
    if (!p.online) return verdict('network');
    // 静态部署（GitHub Pages）没有转发路由，一切请求都是直连，CORS 是头号嫌疑
    if (p.direct || AI_DIRECT_ONLY) return verdict('cors');
    return verdict('network');
  }

  const body = (p.body ?? '').toLowerCase();
  const mentionsModel = /model/.test(body) || /模型/.test(p.body ?? '');

  if (p.status >= 200 && p.status < 300) {
    // 少数网关会用 200 包一个 error 体回来，别把它当成功
    if (/"error"/.test(body)) {
      if (mentionsModel) return verdict('model-not-found');
      return verdict('unknown');
    }
    return verdict('ok');
  }

  if (p.status === 401 || p.status === 403) return verdict('bad-key');
  if (p.status === 429) return verdict('rate-limited');
  if (p.status === 404) return mentionsModel ? verdict('model-not-found') : verdict('bad-url');
  // 400 常被用来报「模型名不对」，也常被用来报别的；只有明确提到 model 才归此类
  if (p.status === 400 && mentionsModel) return verdict('model-not-found');
  if (p.status === 502 || p.status === 504) {
    // 本机转发路由把上游连接失败统一报成 502
    return p.direct ? verdict('server') : verdict('network');
  }
  if (p.status >= 500) return verdict('server');
  return verdict('unknown');
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** 发一次最小补全并归类。原始错误只写控制台，不进 UI。 */
export async function testConnection(cfg: AiConfig, signal?: AbortSignal): Promise<ConnectionVerdict> {
  if (!cfg.baseUrl.trim()) {
    return { ...verdict('bad-url'), message: '还没有填 API Base URL。' };
  }
  if (!cfg.model) {
    return { ...verdict('model-not-found'), message: '还没有选模型，无法测试。' };
  }
  try {
    const r = await probeCompletion(cfg, signal);
    if (r.status >= 400) console.debug('[测试连接] 原始响应', r.status, r.body.slice(0, 500));
    return classifyProbe({
      status: r.status,
      body: r.body,
      direct: Boolean(cfg.direct) || AI_DIRECT_ONLY,
      online: isOnline(),
    });
  } catch (e) {
    console.debug('[测试连接] 请求未发出', e);
    return classifyProbe({
      status: null,
      threw: true,
      direct: Boolean(cfg.direct) || AI_DIRECT_ONLY,
      online: isOnline(),
    });
  }
}
