/**
 * `POST {baseUrl}/chat/completions` 的本机转发（保持流式）。
 *
 * 直接把上游的 SSE 响应体透传给浏览器，不缓冲、不改写 —— 这样首字延迟
 * 与直连一致，用户能立刻看到模型开始吐字。
 * 同样不存储任何内容：Key 与对话都只是过路，不落盘、不记日志。
 */

import { NextResponse } from 'next/server';
import { assertSafeUpstream, forwardHeaders, upstreamErrorResponse } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { baseUrl?: string; apiKey?: string; payload?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { message: '请求体不是合法 JSON。' } }, { status: 400 });
  }

  const check = assertSafeUpstream(body.baseUrl);
  if (!check.ok) return NextResponse.json({ error: { message: check.reason } }, { status: 400 });
  if (!body.payload || typeof body.payload !== 'object') {
    return NextResponse.json({ error: { message: '缺少 chat/completions 请求体。' } }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${check.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: forwardHeaders(body.apiKey),
      body: JSON.stringify(body.payload),
      // 长文解读可能要一会儿，给足时间但仍设上限，避免请求悬挂
      signal: AbortSignal.timeout(180_000),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new NextResponse(text || JSON.stringify({ error: { message: '上游无响应体。' } }), {
        status: upstream.status || 502,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
      });
    }

    // 原样透传 SSE 流
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (e) {
    return upstreamErrorResponse(e, check.baseUrl);
  }
}
