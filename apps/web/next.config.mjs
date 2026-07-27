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
