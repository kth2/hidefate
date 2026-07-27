/**
 * 两种构建模式：
 *
 *   1. 默认（本机 / 有服务器）—— 带 /api/ai/* 转发路由，AI 请求经本机中转，
 *      不受供应商 CORS 限制。
 *   2. 静态导出（GitHub Pages）—— 设 STATIC_EXPORT=1。整站导出为纯静态文件，
 *      可直接托管在 GitHub Pages 上（免费 HTTPS，装到手机主屏、离线可用）。
 *      代价：没有服务器就没有转发，AI 只能由浏览器直连供应商。
 *
 * GitHub Pages 的站点在 https://<user>.github.io/<repo>/ 下，因此需要 basePath；
 * 本机构建则为空。所有前端代码一律通过 NEXT_PUBLIC_BASE_PATH 取值，
 * 不要在任何地方硬编码 '/hidefate'。
 */

const isStatic = process.env.STATIC_EXPORT === '1';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 计算核心以 TypeScript 源码形式跨 workspace 引用，需交给 Next 一并编译。
  transpilePackages: [
    '@hidefate/core-bazi',
    '@hidefate/core-fengshui',
    '@hidefate/core-qimen',
    '@hidefate/core-synthesis',
  ],
  eslint: { ignoreDuringBuilds: true },

  ...(isStatic
    ? {
        output: 'export',
        // Pages 是纯静态，没有图片优化服务
        images: { unoptimized: true },
        // 让 /house 这类路径导出成 /house/index.html，Pages 才能直接命中
        trailingSlash: true,
        basePath: basePath || undefined,
        assetPrefix: basePath || undefined,
      }
    : {}),

  webpack: (config) => {
    // 各计算核心的源码用 ESM 规范的 `./foo.js` 写法引用同目录 TS 文件
    // （这是 NodeNext 下的正确写法，也让 core 能被 Node 直接 import）。
    // webpack 不会自动把 .js 解析成 .ts，故在此显式建立映射。
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
