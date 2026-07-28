import type { MetadataRoute } from 'next';

/**
 * 用 Next 的 metadata 路由生成 manifest，而不是放一份静态 public/manifest.json。
 *
 * 原因：部署到 GitHub Pages 时站点在 `/<repo>/` 子路径下，
 * start_url / scope / 图标路径都必须带这个前缀，静态文件做不到随构建变化。
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '藏聚 HideFate · 玄空飞星 · 八宅 · 山向奇门',
    short_name: '藏聚',
    description: '三派合参的住宅与商铺风水系统，全部推算离线完成，资料留在本机。',
    lang: 'zh-CN',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#f7f3ec',
    theme_color: '#a8352a',
    orientation: 'portrait',
    // SVG 供支持矢量图标的浏览器；192／512 PNG 供 Android 安装横幅与
    // iOS 的 apple-touch-icon（iOS 不认 SVG，缺 PNG 会退化成页面截图）。
    icons: [
      { src: `${basePath}/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: `${basePath}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
