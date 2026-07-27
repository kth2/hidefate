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
    // 只声明 SVG：Chrome / Android 自 v93 起接受 SVG 图标并据此判定可安装性。
    // iOS 的主屏图标另需 PNG 版 apple-touch-icon，暂缺，故 iOS 上会退化为页面截图
    // —— 纯外观问题，不影响安装与离线使用。补一张 180×180 PNG 即可解决。
    icons: [
      {
        src: `${basePath}/icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
