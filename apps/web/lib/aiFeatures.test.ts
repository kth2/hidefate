import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AI_OPTIONAL_NOTICE, AI_OPTIONAL_NOTICE_ONE_LINE } from './aiNotice';
import { classifyProbe } from './aiTest';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * README 硬规则 #1 的守卫。
 *
 * 「AI 只是润色，不参与计算，不装也能用」这句话必须在 AI 设置与 AI 对话
 * 两个界面上常驻可见 —— 它是本 App 与「AI 算命 App」的分界线，
 * 不能因为界面改版而悄悄消失。
 */
describe('AI 可选性声明常驻存在', () => {
  it('文案覆盖三件事：AI 只组织语言、不改数字、不装也能用', () => {
    const all = `${AI_OPTIONAL_NOTICE.title}${AI_OPTIONAL_NOTICE.body}${AI_OPTIONAL_NOTICE.tail}${AI_OPTIONAL_NOTICE.precedence}`;
    expect(all).toContain('确定性');
    expect(all).toContain('离线');
    expect(all).toMatch(/不参与.*计算/);
    expect(all).toMatch(/不配置.*不影响/);
    expect(all).toContain('以九宫盘为准');
    expect(AI_OPTIONAL_NOTICE_ONE_LINE.length).toBeGreaterThan(10);
  });

  it('声明组件把每一段都渲染出来（不是只留个标题）', () => {
    const c = src('../components/AiOptionalNotice.tsx');
    for (const field of ['title', 'body', 'tail', 'precedence']) {
      expect(c).toContain(`AI_OPTIONAL_NOTICE.${field}`);
    }
    expect(c).toContain('AI_OPTIONAL_NOTICE_ONE_LINE');
  });

  it('AI 设置页渲染该声明', () => {
    const page = src('../app/settings/page.tsx');
    expect(page).toContain("from '../../components/AiOptionalNotice'");
    expect(page).toMatch(/<AiOptionalNotice\b/);
  });

  it('AI 对话页在每一种状态下都渲染该声明（未配置 / 未同意 / 正常）', () => {
    const chat = src('../components/AiChat.tsx');
    expect(chat).toContain("from './AiOptionalNotice'");
    // 三个 return 分支各一处，缺一处就意味着某个状态下声明消失了
    expect(chat.match(/<AiOptionalNotice\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * 「测试连接」的分类。
 *
 * 这些断言里最要紧的一条是最后一个 it：**用户看到的任何一句话都不许出现
 * 状态码或英文原始错误**。分类可以错，话不能说得像日志。
 */
describe('测试连接：把结果说成人话', () => {
  const base = { direct: false, online: true } as const;

  it('200 且无 error 体 = 成功', () => {
    const v = classifyProbe({ ...base, status: 200, body: '{"choices":[{"message":{"content":"pong"}}]}' });
    expect(v.outcome).toBe('ok');
    expect(v.ok).toBe(true);
  });

  it('200 却包着 error 体的网关不算成功', () => {
    expect(classifyProbe({ ...base, status: 200, body: '{"error":{"message":"boom"}}' }).ok).toBe(false);
  });

  it('401 / 403 = Key 有问题', () => {
    expect(classifyProbe({ ...base, status: 401, body: 'Invalid API key' }).outcome).toBe('bad-key');
    expect(classifyProbe({ ...base, status: 403, body: 'forbidden' }).outcome).toBe('bad-key');
  });

  it('429 = 限流或额度用尽', () => {
    expect(classifyProbe({ ...base, status: 429, body: 'rate limit' }).outcome).toBe('rate-limited');
  });

  it('提到 model 的 404 / 400 = 模型不可用；没提的 404 = 地址不对', () => {
    expect(classifyProbe({ ...base, status: 404, body: '{"error":"model not found"}' }).outcome).toBe('model-not-found');
    expect(classifyProbe({ ...base, status: 400, body: 'The model `x` does not exist' }).outcome).toBe('model-not-found');
    expect(classifyProbe({ ...base, status: 404, body: '<html>Not Found</html>' }).outcome).toBe('bad-url');
  });

  it('5xx = 供应商故障', () => {
    expect(classifyProbe({ ...base, status: 500, body: '' }).outcome).toBe('server');
  });

  it('请求根本没发出去：离线是断网，在线且直连则判为被 CORS 挡下', () => {
    expect(classifyProbe({ status: null, threw: true, direct: true, online: false }).outcome).toBe('network');
    expect(classifyProbe({ status: null, threw: true, direct: true, online: true }).outcome).toBe('cors');
    // 经本机转发时浏览器不受 CORS 限制，失败就是网络问题
    expect(classifyProbe({ status: null, threw: true, direct: false, online: true }).outcome).toBe('network');
  });

  it('CORS 的说明要给出可执行的出路，而不是只报「失败」', () => {
    const v = classifyProbe({ status: null, threw: true, direct: true, online: true });
    expect(v.nextStep).toContain('Ollama');
  });

  it('任何一条用户可见文案都不含状态码、英文原始错误或技术黑话', () => {
    const cases = [
      classifyProbe({ ...base, status: 200, body: 'ok' }),
      classifyProbe({ ...base, status: 401, body: 'Invalid API key: sk-abc' }),
      classifyProbe({ ...base, status: 429, body: 'RateLimitError' }),
      classifyProbe({ ...base, status: 404, body: 'model not found' }),
      classifyProbe({ ...base, status: 404, body: 'nope' }),
      classifyProbe({ ...base, status: 500, body: 'Internal Server Error' }),
      classifyProbe({ ...base, status: 418, body: 'teapot' }),
      classifyProbe({ status: null, threw: true, direct: true, online: true }),
      classifyProbe({ status: null, threw: true, direct: true, online: false }),
    ];
    for (const v of cases) {
      const text = `${v.message} ${v.nextStep}`;
      expect(text).not.toMatch(/HTTP|\b[45]\d{2}\b/);
      expect(text).not.toMatch(/Invalid API key|RateLimitError|Internal Server Error|teapot|nope/i);
      // 中文说明必须实际存在，不能是空壳
      expect(v.message.length).toBeGreaterThan(6);
      expect(v.nextStep.length).toBeGreaterThan(6);
    }
  });
});
