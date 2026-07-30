import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AI_OPTIONAL_NOTICE, AI_OPTIONAL_NOTICE_ONE_LINE } from './aiNotice';
import { classifyProbe } from './aiTest';
import { PROVIDERS, type ModelInfo } from './ai';
import {
  RECOMMENDED_MODELS,
  isRecommended,
  pickDefaultModel,
  splitByRecommendation,
} from './recommendedModels';
import { analyse, synthesise } from '@hidefate/core-synthesis';
import { sampleInput } from '../../../packages/core-synthesis/src/fixtures';
import { findingRefs, refsForDomains } from './findings';
import { deriveFollowUps, referencedRefs } from './followUps';
import { SUGGESTION_CATEGORIES, suggestQuestions } from './suggestedQuestions';

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

/**
 * 空白对话框的建议问题。
 *
 * 核心断言只有一条，但它是这一功能存在的全部理由：
 * **只要盘上还有断语，用户就不该面对一个空白输入框**。
 */
describe('建议问题由 Finding 现算', () => {
  const result = analyse(sampleInput(2026), synthesise(sampleInput(2026)));
  const refs = findingRefs(result);

  it('示范盘本身就能摊出断语（否则下面的断言都是空转）', () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it('Finding 非空时建议问题必非空', () => {
    expect(suggestQuestions(refs).length).toBeGreaterThan(0);
  });

  it('数量落在 4–6 条之间', () => {
    const qs = suggestQuestions(refs);
    expect(qs.length).toBeGreaterThanOrEqual(4);
    expect(qs.length).toBeLessThanOrEqual(6);
  });

  it('盘上出现的每个类别（健康／感情／财运／事业）至少各有一问', () => {
    const present = SUGGESTION_CATEGORIES.filter(
      (c) => refsForDomains(refs, [c.domain]).length > 0,
    ).map((c) => c.domain);
    expect(present.length).toBeGreaterThan(0);

    const covered = new Set(suggestQuestions(refs, 6).map((s) => s.domain));
    for (const d of present.slice(0, 6)) expect(covered.has(d)).toBe(true);
  });

  it('每一问都扣着实际盘面（带方位或断语原文），不是空泛套话', () => {
    for (const s of suggestQuestions(refs)) {
      expect(s.question.length).toBeGreaterThan(8);
      expect(s.refId).toBeTruthy();
    }
  });

  it('断语为空时返回空数组，由调用方决定退回什么', () => {
    expect(suggestQuestions([])).toEqual([]);
  });

  it('只有一条断语时也补足到 4 条，且补位问题仍指向该断语', () => {
    const qs = suggestQuestions([refs[0]!]);
    expect(qs.length).toBeGreaterThanOrEqual(4);
    expect(qs.every((q) => q.refId === refs[0]!.id)).toBe(true);
  });
});

/** 回答之后的追问 chip。 */
describe('追问由回答实际引用到的宫位与断语生成', () => {
  const result = analyse(sampleInput(2026), synthesise(sampleInput(2026)));
  const refs = findingRefs(result);
  const withDir = refs.find((r) => r.direction)!;

  it('能认出回答里提到的方位', () => {
    const hit = referencedRefs(`${withDir.direction}这一方今年要留意。`, refs);
    expect(hit.some((r) => r.direction === withDir.direction)).toBe(true);
  });

  it('回答完全没提到盘面时不硬凑，退到通用追问', () => {
    const ups = deriveFollowUps('你好，今天天气不错。', refs);
    expect(ups.length).toBeGreaterThanOrEqual(2);
    expect(ups.every((u) => u.refId === null)).toBe(true);
  });

  it('始终给 2–3 条，且互不重复', () => {
    for (const reply of ['', `${withDir.direction}有二五交加，须留意。`, '正北与西南都要看。']) {
      const ups = deriveFollowUps(reply, refs);
      expect(ups.length).toBeGreaterThanOrEqual(2);
      expect(ups.length).toBeLessThanOrEqual(3);
      expect(new Set(ups.map((u) => u.question)).size).toBe(ups.length);
    }
  });

  it('提到某方位时，追问会扣着该方位并指回原断语', () => {
    const ups = deriveFollowUps(`${withDir.direction}这一方今年要留意，建议尽早处理。`, refs);
    const anchored = ups.filter((u) => u.refId !== null);
    expect(anchored.length).toBeGreaterThan(0);
    expect(anchored[0]!.question).toContain(withDir.direction!);
  });
});

/**
 * 模型推荐。
 *
 * 关键在于「推荐是标注，不是清单」：名单只能在 API 实时返回的结果里
 * 挑出几个打标，绝不能凭空多出一个 API 没给的模型。
 */
describe('模型推荐名单只做标注，不做清单', () => {
  const live: ModelInfo[] = [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', contextLength: 64000, free: false, ownedBy: null, description: null },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextLength: 64000, free: false, ownedBy: null, description: null },
    { id: 'some-experimental-model', name: 'x', contextLength: null, free: true, ownedBy: null, description: null },
  ];

  it('只有 API 实际返回的模型才会出现在两组之中', () => {
    const { recommended, rest } = splitByRecommendation(live, 'deepseek');
    const ids = [...recommended, ...rest].map((m) => m.id).sort();
    expect(ids).toEqual(live.map((m) => m.id).sort());
  });

  it('名单里有、但 API 没返回的模型不会被凭空造出来', () => {
    const { recommended } = splitByRecommendation([live[2]!], 'deepseek');
    expect(recommended).toEqual([]);
  });

  it('推荐组按名单顺序排，其余归入 rest', () => {
    const { recommended, rest } = splitByRecommendation([...live].reverse(), 'deepseek');
    expect(recommended.map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(rest.map((m) => m.id)).toEqual(['some-experimental-model']);
  });

  it('id 带前后缀时仍能认出（各家写法不一）', () => {
    expect(isRecommended('gemini', 'models/gemini-2.5-flash')).toBe(true);
    expect(isRecommended('ollama', 'qwen2.5:7b')).toBe(true);
    expect(isRecommended('siliconflow', 'deepseek-ai/DeepSeek-V3')).toBe(true);
  });

  it('自定义端点不做推荐（无从预知跑的是什么）', () => {
    expect(splitByRecommendation(live, 'custom').recommended).toEqual([]);
  });

  it('自动默认：推荐优先 → 免费 → 首项', () => {
    expect(pickDefaultModel(live, 'deepseek')).toBe('deepseek-chat');
    expect(pickDefaultModel(live, 'custom')).toBe('some-experimental-model'); // 唯一免费的
    expect(pickDefaultModel([], 'deepseek')).toBeNull();
  });

  it('每家（自定义除外）都至少备了一个推荐，否则自动选中会退化', () => {
    for (const p of PROVIDERS) {
      if (p.id === 'custom') continue;
      expect(RECOMMENDED_MODELS[p.id].length).toBeGreaterThan(0);
    }
  });
});
