/**
 * `GET {baseUrl}/models` 的本机转发。
 *
 * 为什么要转发而不让浏览器直连：
 *   1. 多数供应商未对浏览器开放 CORS，直连会被拦下，而且浏览器报的
 *      "Failed to fetch" 完全看不出真正原因，用户无从排查。
 *   2. 经本机转发，API Key 只在「浏览器 → 本机 Next」这一段传输，
 *      不会出现在跨域请求里，也不会被第三方页面脚本读到。
 *
 * 本路由**不存储任何东西**：Key 随请求进来，用完即弃，不落盘、不记日志。
 * 用户若坚持不经本机，可在设置里打开「直连」。
 */

import { NextResponse } from 'next/server';
import { assertSafeUpstream, forwardHeaders, upstreamErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { baseUrl?: string; apiKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { message: '请求体不是合法 JSON。' } }, { status: 400 });
  }

  const check = assertSafeUpstream(body.baseUrl);
  if (!check.ok) return NextResponse.json({ error: { message: check.reason } }, { status: 400 });

  try {
    const res = await fetch(`${check.baseUrl}/models`, {
      method: 'GET',
      headers: forwardHeaders(body.apiKey),
      // 模型列表不需要很久；卡住太久不如早点告诉用户地址有问题
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return upstreamErrorResponse(e, check.baseUrl);
  }
}
