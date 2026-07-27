/**
 * 上游引擎载入器 —— 一份 vendor 代码，同时跑在 Node 与浏览器。
 *
 * 设计要点：
 *   1. 上游 `qimen-engine.js` 是 esbuild IIFE，末尾执行 `window.QM = {...}`，
 *      全文件不碰 document / navigator / fetch / localStorage（已核实），
 *      故只要提供一个 `window` 壳即可在 Node 中运行。
 *   2. 引擎有 416 KB，属于「可选高级层」，因此**按需懒加载**：
 *      用户不开启山向奇门层就完全不会下载它，不拖累首屏。
 *   3. 浏览器端走 <script> 标签而非打包器 import —— 既避开打包器对
 *      动态 require 垫片的改写风险，也让 Service Worker 能独立缓存这一大块，
 *      离线可用。
 */

import type { QMEngine, ShanXiangModule } from './types.js';

let enginePromise: Promise<{ engine: QMEngine; shanXiang: ShanXiangModule }> | null = null;

/** 浏览器端 vendor 资源基路径，可由宿主应用覆盖。 */
let browserVendorBase = '/vendor';

export function setVendorBase(base: string): void {
  browserVendorBase = base.replace(/\/$/, '');
  enginePromise = null; // 路径变了就重新载入
}

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-hidefate-vendor="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`载入失败：${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.hidefateVendor = src;
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', () => reject(new Error(`载入失败：${src}（离线时请确认 Service Worker 已预缓存 vendor 资源）`)));
    document.head.appendChild(s);
  });
}

async function loadInBrowser(): Promise<{ engine: QMEngine; shanXiang: ShanXiangModule }> {
  const w = window as unknown as Record<string, unknown>;
  if (!w.QM) await injectScript(`${browserVendorBase}/qimen-engine.js`);
  if (!w.ShanXiang) await injectScript(`${browserVendorBase}/shanxiang.js`);
  const engine = w.QM as QMEngine | undefined;
  const shanXiang = w.ShanXiang as ShanXiangModule | undefined;
  if (!engine?.qimen?.calculate) throw new Error('奇门引擎载入后未挂载 window.QM，请检查 vendor 资源是否完整。');
  if (!shanXiang?.generateShanXiangChart) throw new Error('山向奇门核心载入后未挂载 window.ShanXiang。');
  return { engine, shanXiang };
}

/**
 * 以变量作模块说明符 + webpackIgnore，令打包器无法静态分析这几个 Node 内建模块。
 *
 * 必要性：loadInNode 只在 Node/SSR 分支执行，浏览器端永不触及；但 webpack 仍会
 * 静态解析 `import('node:module')` 并因 "Unhandled scheme" 直接构建失败。
 * 走间接说明符即可让它原样保留到运行时，由真正的 Node 去解析。
 */
const nodeImport = (specifier: string): Promise<unknown> =>
  import(/* webpackIgnore: true */ /* @vite-ignore */ specifier);

async function loadInNode(): Promise<{ engine: QMEngine; shanXiang: ShanXiangModule }> {
  const [mod, urlMod, path] = (await Promise.all([
    nodeImport('node:module'),
    nodeImport('node:url'),
    nodeImport('node:path'),
  ])) as [
    { createRequire: (u: string | URL) => (id: string) => unknown },
    { fileURLToPath: (u: string | URL) => string },
    { dirname: (p: string) => string; resolve: (...p: string[]) => string; join: (...p: string[]) => string },
  ];
  const { createRequire } = mod;
  const { fileURLToPath } = urlMod;
  const require = createRequire(import.meta.url);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const vendorDir = path.resolve(here, '..', 'vendor');

  // 上游引擎以 `window.QM = ...` 收尾，Node 下需先备好 window 壳。
  const g = globalThis as unknown as Record<string, unknown>;
  if (!('window' in g)) g.window = {};

  require(path.join(vendorDir, 'qimen-engine.js'));
  const shanXiang = require(path.join(vendorDir, 'shanxiang.js')) as ShanXiangModule;
  const engine = (g.window as Record<string, unknown>).QM as QMEngine | undefined;

  if (!engine?.qimen?.calculate) throw new Error('奇门引擎在 Node 环境载入失败。');
  return { engine, shanXiang };
}

/**
 * 载入奇门引擎与山向核心（幂等、带缓存）。
 * 首次调用会实际读取 vendor 资源；之后返回同一个 Promise。
 */
export function loadQiMenEngine(): Promise<{ engine: QMEngine; shanXiang: ShanXiangModule }> {
  if (!enginePromise) {
    enginePromise = (isBrowser() ? loadInBrowser() : loadInNode()).catch((e) => {
      enginePromise = null; // 失败不缓存，允许重试
      throw e;
    });
  }
  return enginePromise;
}

/** 引擎是否已就绪（同步查询，用于 UI 决定是否显示「载入中」）。 */
export function isEngineLoaded(): boolean {
  if (isBrowser()) {
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.QM && w.ShanXiang);
  }
  return enginePromise !== null;
}
