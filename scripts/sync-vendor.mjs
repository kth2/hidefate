/**
 * 把 core-qimen 的 vendor 资源同步到 web 应用的 public/vendor 下。
 *
 * 之所以用「静态资源 + <script> 标签」而不是打包器 import：
 *   1. 上游引擎是 esbuild IIFE，含动态 require 垫片，交给打包器改写有风险
 *   2. 416 KB 的奇门引擎属于可选层，走静态资源可按需懒加载，不拖累首屏
 *   3. Service Worker 能独立预缓存这一整块，保证离线也能排奇门盘
 *
 * 在 dev 与 build 前自动执行（见 apps/web/package.json 的 predev / prebuild）。
 */

import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages', 'core-qimen', 'vendor');
const dst = join(root, 'apps', 'web', 'public', 'vendor');

const FILES = ['qimen-engine.js', 'shanxiang.js'];

await mkdir(dst, { recursive: true });

const available = await readdir(src);
for (const f of FILES) {
  if (!available.includes(f)) {
    console.error(`[sync-vendor] 缺少 vendor 文件：${f}（应位于 ${src}）`);
    process.exitCode = 1;
    continue;
  }
  await copyFile(join(src, f), join(dst, f));
  const { size } = await stat(join(dst, f));
  console.log(`[sync-vendor] ${f} → public/vendor/ (${(size / 1024).toFixed(0)} KB)`);
}
