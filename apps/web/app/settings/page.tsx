'use client';

/**
 * AI 设置 —— 填 Base URL 与 Key，然后**从 API 实时拉取模型列表**。
 *
 * 刻意不内置模型清单：供应商随时上下架模型，写死的列表必然过期，
 * 且会让用户以为某个已下线的模型还能用。列表一律来自 `GET {baseUrl}/models`。
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PROVIDERS,
  listModels,
  providerById,
  type ModelInfo,
  type ProviderId,
} from '../../lib/ai';
import { loadSettings, saveSettings, type AppSettings } from '../../lib/db';
import { AppBar } from '../../components/mobile/ui';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [provider, setProvider] = useState<ProviderId>('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [direct, setDirect] = useState(false);
  const [consent, setConsent] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await loadSettings();
      setSettings(s);
      setProvider(s.aiProvider ?? 'deepseek');
      setBaseUrl(s.aiBaseUrl ?? providerById(s.aiProvider ?? 'deepseek').baseUrl);
      setApiKey(s.aiApiKey ?? '');
      setModel(s.aiModel ?? '');
      setDirect(Boolean(s.aiDirect));
      setConsent(Boolean(s.aiConsent));
      if (s.aiModelCache?.length) {
        setModels(
          s.aiModelCache.map((m) => ({
            ...m,
            ownedBy: null,
            description: null,
          })),
        );
      }
    })();
  }, []);

  const preset = providerById(provider);

  function pickProvider(id: ProviderId) {
    setProvider(id);
    const p = providerById(id);
    if (p.baseUrl) setBaseUrl(p.baseUrl);
    setModels([]);
    setModel('');
    setError(null);
    setOk(null);
  }

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const list = await listModels({ baseUrl, apiKey, direct });
      setModels(list);
      setOk(`成功拉取 ${list.length} 个模型${list.some((m) => m.free) ? `，其中 ${list.filter((m) => m.free).length} 个标注为免费` : ''}。`);
      // 自动选一个合理的默认：优先免费，其次列表首项
      if (!model) setModel((list.find((m) => m.free) ?? list[0])!.id);
      await saveSettings({
        aiProvider: provider,
        aiBaseUrl: baseUrl,
        aiApiKey: apiKey,
        aiDirect: direct,
        aiModelCache: list.map((m) => ({
          id: m.id,
          name: m.name,
          free: m.free,
          contextLength: m.contextLength,
        })),
        aiModelCacheAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, apiKey, direct, model, provider]);

  async function save() {
    const s = await saveSettings({
      aiProvider: provider,
      aiBaseUrl: baseUrl,
      aiApiKey: apiKey,
      aiModel: model,
      aiDirect: direct,
      aiConsent: consent,
    });
    setSettings(s);
    setOk('已保存到本机。');
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return models.filter(
      (m) => (!freeOnly || m.free) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
    );
  }, [models, filter, freeOnly]);

  if (!settings) {
    return (
      <>
        <AppBar title="AI 设置" back="/me" />
        <p className="px-4 py-4 text-sm text-ink-mute">读取设置中…</p>
      </>
    );
  }

  return (
    <>
      <AppBar title="AI 设置" back="/me" />
      <div className="space-y-4 px-4 py-4">
      <p className="card-sub px-1">
        AI 只负责把已算好的结论写成通顺中文，
        <b className="text-ink-soft">不参与任何星位、宫位与概率的计算</b>。
        不配置 AI 也不影响本 App 的一切排盘、预测与化解建议。
      </p>

      {error && <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/5 p-3 text-sm leading-relaxed text-cinnabar">{error}</p>}
      {ok && <p className="rounded-lg border border-jade/30 bg-jade/5 p-3 text-sm text-jade">{ok}</p>}

      <section className="card">
        <h2 className="card-title">供应商</h2>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <button key={p.id} type="button" className={`seg text-xs ${provider === p.id ? 'seg-on' : ''}`} onClick={() => pickProvider(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          {preset.note}
          {preset.keyUrl && (
            <>
              {' '}
              <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-cinnabar hover:underline">
                获取 API Key →
              </a>
            </>
          )}
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="card-title">连接</h2>

        <div>
          <label className="label">API Base URL</label>
          <input
            className="field font-mono text-xs"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com/v1"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-ink-mute">
            多数供应商须以 <code>/v1</code> 结尾。模型列表会从 <code>{(baseUrl || '{BaseURL}').replace(/\/+$/, '')}/models</code> 拉取。
          </p>
        </div>

        <div>
          <label className="label">API Key {!preset.needsKey && <span className="text-ink-mute">（本机 Ollama 可留空）</span>}</label>
          <div className="flex gap-2">
            <input
              className="field font-mono text-xs"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={preset.needsKey ? 'sk-…' : '（不需要）'}
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" className="btn text-xs" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-mute">Key 只存在本机浏览器（IndexedDB），不会同步到任何服务器。</p>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-cinnabar" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
          <span className="leading-relaxed">
            浏览器直连供应商（不经本机中转）
            <span className="block text-xs text-ink-mute">
              默认关闭。关闭时请求会先到本机的 Next 服务再转发出去，可绕开多数供应商未开放的浏览器 CORS —— 兼容性最好。
              打开则由浏览器直接请求供应商，少一跳，但若该供应商未开放 CORS 就会失败。
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={fetchModels} disabled={loading || !baseUrl.trim()}>
            {loading ? '拉取中…' : '拉取可用模型列表'}
          </button>
          <button type="button" className="btn" onClick={save}>
            保存设置
          </button>
        </div>
      </section>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title mb-0">模型（{models.length}）</h2>
          {settings.aiModelCacheAt && (
            <span className="text-xs text-ink-mute">上次拉取：{new Date(settings.aiModelCacheAt).toLocaleString('zh-CN')}</span>
          )}
        </div>

        {models.length === 0 ? (
          <p className="text-sm text-ink-mute">
            尚未拉取。填好 Base URL 与 Key 后点「拉取可用模型列表」，这里会列出该 API 当前<b>实际可用</b>的全部模型。
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                className="field max-w-xs text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="搜索模型名…"
              />
              <button type="button" className={`seg text-xs ${freeOnly ? 'seg-on' : ''}`} onClick={() => setFreeOnly((v) => !v)}>
                只看免费
              </button>
              <span className="text-xs text-ink-mute">显示 {visible.length} / {models.length}</span>
            </div>

            <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={`w-full rounded-lg border p-2.5 text-left transition ${
                      model === m.id ? 'border-cinnabar bg-cinnabar/5' : 'border-rice-line hover:border-cinnabar/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs">{m.id}</span>
                      {m.free && <span className="tag border-jade/40 bg-jade/10 text-jade">免费</span>}
                      {m.contextLength != null && (
                        <span className="tag border-rice-line text-ink-mute">{(m.contextLength / 1000).toFixed(0)}K 上下文</span>
                      )}
                      {model === m.id && <span className="tag border-cinnabar/40 bg-cinnabar/10 text-cinnabar">已选</span>}
                    </div>
                    {m.name !== m.id && <p className="mt-0.5 text-xs text-ink-soft">{m.name}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {model && (
          <p className="mt-3 rounded-lg border border-rice-line bg-rice-deep/40 p-2 text-xs">
            当前选用：<b className="font-mono">{model}</b>
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">隐私确认</h2>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-cinnabar" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="leading-relaxed">
            我明白：向 AI 提问时，会把<b className="text-cinnabar">本宅的九宫盘、房间布局、以及成员的姓名与出生资料</b>
            作为上下文发送给上方所选的供应商。
            <span className="block text-xs text-ink-mute">
              这是本 App 唯一会把数据送出本机的功能。不勾选也能正常使用全部离线推算与内置作答；
              若介意，可改用 Ollama 在本机跑模型，资料一步都不出这台设备。
            </span>
          </span>
        </label>
        <div className="mt-3">
          <button type="button" className="btn btn-primary" onClick={save}>
            保存设置
          </button>
        </div>
      </section>

      <p className="px-1 text-[0.8125rem] leading-relaxed text-ink-mute">
        设置好后，到
        <Link href="/analysis/ask" className="mx-1 text-cinnabar">
          「问答」
        </Link>
        页即可与 AI 对话。
      </p>
      </div>
    </>
  );
}
