import { describe, expect, it } from 'vitest';
import { PROVIDERS, normaliseModels, providerById } from './ai';

/**
 * 模型列表解析的回归测试。
 *
 * 各家 `/models` 的返回结构差别不小，而这是用户配置流程的第一步 ——
 * 一旦解析失败，用户连模型都选不了。故对每家的真实返回形状分别断言。
 */
describe('normaliseModels：兼容各家 /models 返回', () => {
  it('标准 OpenAI 形状（只有 id / object / owned_by）', () => {
    const r = normaliseModels({
      object: 'list',
      data: [
        { id: 'deepseek-chat', object: 'model', owned_by: 'deepseek' },
        { id: 'deepseek-reasoner', object: 'model', owned_by: 'deepseek' },
      ],
    });
    expect(r).toHaveLength(2);
    expect(r.map((m) => m.id).sort()).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(r[0]!.name).toBe(r[0]!.id); // 无 name 时回退到 id
    expect(r[0]!.contextLength).toBeNull();
    expect(r.every((m) => !m.free)).toBe(true);
  });

  it('OpenRouter 形状（带 name / pricing / context_length）', () => {
    const r = normaliseModels({
      data: [
        {
          id: 'meta-llama/llama-3.3-70b-instruct:free',
          name: 'Llama 3.3 70B Instruct (free)',
          context_length: 131072,
          pricing: { prompt: '0', completion: '0' },
        },
        {
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          context_length: 200000,
          pricing: { prompt: '0.000003', completion: '0.000015' },
        },
      ],
    });
    expect(r).toHaveLength(2);
    const free = r.find((m) => m.id.endsWith(':free'))!;
    expect(free.free).toBe(true);
    expect(free.name).toBe('Llama 3.3 70B Instruct (free)');
    expect(free.contextLength).toBe(131072);
    expect(r.find((m) => m.id === 'anthropic/claude-sonnet-4')!.free).toBe(false);
  });

  it('pricing 为数字 0 时也算免费（不是所有家都用字符串）', () => {
    const r = normaliseModels({ data: [{ id: 'x', pricing: { prompt: 0, completion: 0 } }] });
    expect(r[0]!.free).toBe(true);
  });

  it('裸数组（部分自建网关直接返回数组）', () => {
    const r = normaliseModels([{ id: 'qwen2.5:7b' }, { id: 'llama3.2:3b' }]);
    expect(r).toHaveLength(2);
  });

  it('models 字段（少数网关用这个键）', () => {
    const r = normaliseModels({ models: [{ id: 'gemma2' }] });
    expect(r).toHaveLength(1);
  });

  it('免费模型排在前面，便于在长列表里先看到不花钱的', () => {
    const r = normaliseModels({
      data: [
        { id: 'zzz-paid' },
        { id: 'aaa-free:free' },
        { id: 'mmm-paid' },
      ],
    });
    expect(r[0]!.id).toBe('aaa-free:free');
  });

  it('缺 id 的条目被跳过，不会产生空项', () => {
    const r = normaliseModels({ data: [{ object: 'model' }, { id: 'ok' }, null, 'junk'] });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe('ok');
  });

  it('name 可作 id 的回退（个别网关只给 name）', () => {
    const r = normaliseModels({ data: [{ name: 'local-model' }] });
    expect(r[0]!.id).toBe('local-model');
  });

  it('完全不认识的结构返回空数组而非抛错', () => {
    expect(normaliseModels(null)).toEqual([]);
    expect(normaliseModels(undefined)).toEqual([]);
    expect(normaliseModels({ error: 'nope' })).toEqual([]);
    expect(normaliseModels('plain text')).toEqual([]);
    expect(normaliseModels(42)).toEqual([]);
  });

  it('异常 pricing 不会误判为免费', () => {
    expect(normaliseModels({ data: [{ id: 'a', pricing: { prompt: 'abc', completion: 'def' } }] })[0]!.free).toBe(false);
    expect(normaliseModels({ data: [{ id: 'b', pricing: null }] })[0]!.free).toBe(false);
    expect(normaliseModels({ data: [{ id: 'c' }] })[0]!.free).toBe(false);
  });
});

describe('供应商预设', () => {
  it('每个预设都有可用的 Base URL（自定义除外）与说明', () => {
    for (const p of PROVIDERS) {
      expect(p.label).toBeTruthy();
      expect(p.note.length).toBeGreaterThan(4);
      if (p.id !== 'custom') {
        expect(p.baseUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  it('本机 Ollama 不需要 Key，其余均需要', () => {
    expect(providerById('ollama').needsKey).toBe(false);
    expect(providerById('deepseek').needsKey).toBe(true);
    expect(providerById('openrouter').needsKey).toBe(true);
  });

  it('未知 id 回退到自定义而非抛错', () => {
    expect(providerById('nope' as never).id).toBe('custom');
  });
});
