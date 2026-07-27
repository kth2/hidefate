/** AI 转发路由的共用校验与错误翻译。 */

import { NextResponse } from 'next/server';

export interface UpstreamCheck {
  ok: true;
  baseUrl: string;
}
export interface UpstreamReject {
  ok: false;
  reason: string;
}

/**
 * 校验上游地址。
 *
 * 这是一个由用户自行填写上游地址的转发器（这正是「支持任意 OpenAI 兼容端点」
 * 所必需的），因此至少要挡住协议层面的明显误用：只允许 http/https，
 * 并拒绝带凭证的 URL。
 */
export function assertSafeUpstream(raw: unknown): UpstreamCheck | UpstreamReject {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: '缺少 Base URL。' };
  }
  const baseUrl = raw.trim().replace(/\/+$/, '');
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    return { ok: false, reason: `Base URL 格式不正确：${baseUrl}` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `只支持 http/https，收到 ${u.protocol}` };
  }
  if (u.username || u.password) {
    return { ok: false, reason: 'Base URL 不应包含用户名或密码，请改用 API Key 字段。' };
  }
  return { ok: true, baseUrl };
}

export function forwardHeaders(apiKey?: string): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey.trim()) h.Authorization = `Bearer ${apiKey.trim()}`;
  // OpenRouter 会用这两个头做来源统计；带上可避免部分模型被拒。
  h['HTTP-Referer'] = 'https://hidefate.local';
  h['X-Title'] = 'HideFate';
  return h;
}

/** 把 fetch 层面的失败翻成可排查的中文。 */
export function upstreamErrorResponse(e: unknown, baseUrl: string): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  const isTimeout = /timeout|aborted|TimeoutError/i.test(msg);
  const isDns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg);
  const isRefused = /ECONNREFUSED/i.test(msg);

  const reason = isTimeout
    ? `连接 ${baseUrl} 超时。请确认网络可达，或该地址是否需要代理。`
    : isDns
      ? `无法解析 ${baseUrl} 的域名。请检查 Base URL 拼写与网络连接。`
      : isRefused
        ? `${baseUrl} 拒绝连接。若用的是本机 Ollama，请确认它已启动（ollama serve）。`
        : `连接 ${baseUrl} 失败：${msg}`;

  return NextResponse.json({ error: { message: reason } }, { status: 502 });
}
