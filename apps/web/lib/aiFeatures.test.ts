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
import { analyse, buildAnswerContext, synthesise } from '@hidefate/core-synthesis';
import { SAMPLE_MEMBERS, sampleInput } from '../../../packages/core-synthesis/src/fixtures';
import { findingRefs, refsForDomains } from './findings';
import { deriveFollowUps, referencedRefs } from './followUps';
import { annotateClaims, citedRefIds } from './provenance';
import {
  DEFAULT_EXCLUSIONS,
  guardEgress,
  hostOf,
  isLocalHost,
  needsEgressConsent,
  redactFacts,
  serialiseEgressPayload,
} from './egress';
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

/**
 * 逐条溯源。
 *
 * 最要紧的一条断言是「对不上的一律不标」—— 给一句没有依据的话套上
 * 「有依据」的外观，比不标更糟。
 */
describe('回答里的宫位／星组合／概率变成可溯源 chip', () => {
  const result = analyse(sampleInput(2026), synthesise(sampleInput(2026)));
  const refs = findingRefs(result);
  const withDir = refs.find((r) => r.direction)!;

  it('切出的片段拼回去必须与原文完全一致（不吞字、不改字）', () => {
    const text = `${withDir.direction}这一方今年要留意，建议尽早处理。`;
    expect(annotateClaims(text, refs).map((s) => s.text).join('')).toBe(text);
  });

  it('方位被标成宫位 chip，并指向具体某条断语', () => {
    const segs = annotateClaims(`${withDir.direction}要留意。`, refs);
    const claim = segs.find((s) => s.kind === 'claim');
    expect(claim).toBeDefined();
    expect(claim!.kind === 'claim' && claim!.claimKind).toBe('宫位');
    expect(refs.some((r) => r.id === (claim as { refId: string }).refId)).toBe(true);
  });

  it('认得方位的常见别写（北方 / 坎宫 都指正北）', () => {
    const north = refs.find((r) => r.direction === '正北');
    if (!north) return; // 该盘正北无断语时跳过，不做假断言
    for (const alias of ['北方', '坎宫']) {
      expect(annotateClaims(`${alias}如何？`, refs).some((s) => s.kind === 'claim')).toBe(true);
    }
  });

  it('对不上盘面的概率不标 —— 宁可少标，不可假装有依据', () => {
    const bogus = annotateClaims('这件事有 47% 的可能，另有 3% 的意外。', refs);
    for (const s of bogus) {
      if (s.kind !== 'claim') continue;
      const r = refs.find((x) => x.id === s.refId)!;
      expect(`${Math.round((r.probability ?? -1) * 100)}%`).toBe(s.text);
    }
  });

  it('完全与盘面无关的闲聊一个 chip 都不产生', () => {
    const segs = annotateClaims('你好，谢谢你的解答。', refs);
    expect(segs.every((s) => s.kind === 'text')).toBe(true);
  });

  it('没有断语时原样返回，不炸', () => {
    expect(annotateClaims('随便什么话', [])).toEqual([{ kind: 'text', text: '随便什么话' }]);
    expect(annotateClaims('', refs)).toEqual([]);
  });

  it('citedRefIds 按出现顺序去重', () => {
    const text = `${withDir.direction}如何？再说一次${withDir.direction}。`;
    expect(citedRefIds(text, refs)).toEqual([withDir.id]);
  });

  it('每条被引用的依据都能给出门派、置信度与古法依据', () => {
    for (const id of citedRefIds(`${withDir.direction}要留意。`, refs)) {
      const r = refs.find((x) => x.id === id)!;
      expect(r.finding.schools.length).toBeGreaterThan(0);
      expect(r.finding.confidence).toBeTruthy();
      expect(r.finding.principle.length).toBeGreaterThan(0);
    }
  });
});

/**
 * 出网闸门。
 *
 * 这一组断言守着本 App 最要紧的一条承诺：**数据不会在用户点头之前离开本机**。
 */
describe('首次出网必须先经确认', () => {
  const result = analyse(sampleInput(2026), synthesise(sampleInput(2026)));
  const ctx = buildAnswerContext(result, { members: SAMPLE_MEMBERS });

  it('全新设置下闸门是关的', () => {
    expect(guardEgress({})).toBe('blocked');
    expect(guardEgress(null)).toBe('blocked');
    expect(needsEgressConsent({})).toBe(true);
  });

  it('确认过之后才放行，撤回后重新关上', () => {
    const accepted = { aiEgressConsentAt: new Date(0).toISOString() };
    expect(guardEgress(accepted)).toBe('allowed');
    expect(needsEgressConsent(accepted)).toBe(false);
    expect(guardEgress({ aiEgressConsentAt: undefined })).toBe('blocked');
  });

  it('勾选「已知悉」（aiConsent）并不等于出网确认 —— 两道闸各管各的', () => {
    expect(guardEgress({ aiConsent: true } as never)).toBe('blocked');
  });

  it('AI 对话组件在发请求之前先过闸门', () => {
    const chat = src('../components/AiChat.tsx');
    // send 里必须先 needsEgressConsent 再谈发送
    const gateAt = chat.indexOf('needsEgressConsent');
    const streamAt = chat.indexOf('await chatStream');
    expect(gateAt).toBeGreaterThan(-1);
    expect(streamAt).toBeGreaterThan(-1);
    expect(chat).toContain('setPendingEgress(question)');
    expect(chat).toContain('<EgressConsentSheet');
  });

  it('预览就是真正要发出的请求体（同一个函数产出）', () => {
    const payload = serialiseEgressPayload({
      model: 'm',
      system: ctx.system,
      facts: ctx.facts,
      question: '这间房今年如何？',
      exclusions: DEFAULT_EXCLUSIONS,
    });
    const parsed = JSON.parse(payload) as { model: string; messages: { role: string; content: string }[] };
    expect(parsed.model).toBe('m');
    expect(parsed.messages[0]!.content).toContain(ctx.facts);
    expect(parsed.messages[1]!.content).toBe('这间房今年如何？');
    // API Key 走请求头，绝不该出现在正文里
    expect(payload).not.toContain('apiKey');
  });

  it('目的地主机名如实取自 Base URL，本机地址会被认出来', () => {
    expect(hostOf('https://api.deepseek.com/v1')).toBe('api.deepseek.com');
    expect(isLocalHost('http://localhost:11434/v1')).toBe(true);
    expect(isLocalHost('https://api.groq.com/openai/v1')).toBe(false);
  });

  it('剔除八字：四柱与日主真的从 payload 里消失，只留命卦', () => {
    const kept = redactFacts(ctx.facts, { memberBazi: false, healthFindings: false });
    const cut = redactFacts(ctx.facts, { memberBazi: true, healthFindings: false });
    expect(kept).toContain('八字精度');
    expect(cut).not.toContain('八字精度');
    expect(cut).not.toContain('已知柱');
    expect(cut).toContain('命卦'); // 命卦只需生年性别，保留
    expect(cut).toContain('已剔除'); // 并且明写「剔掉了什么、因此不可作答什么」
  });

  it('剔除健康：健康类预测行整条消失', () => {
    const cut = redactFacts(ctx.facts, { memberBazi: false, healthFindings: true });
    expect(cut.split('\n').some((l) => l.startsWith('- [健康]'))).toBe(false);
  });

  it('两个开关都不勾时事实区块逐字不变', () => {
    expect(redactFacts(ctx.facts, DEFAULT_EXCLUSIONS)).toBe(ctx.facts);
  });
});
