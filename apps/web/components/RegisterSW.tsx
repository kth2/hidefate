'use client';

import { useEffect } from 'react';
import { setVendorBase } from '@hidefate/core-qimen';
import { withBasePath } from '../lib/basePath';

/**
 * 注册 Service Worker，并把奇门 vendor 资源的基路径告诉计算核心。
 *
 * 两件事都必须带上 basePath —— 部署到 GitHub Pages 时站点在 `/<repo>/` 下，
 * 写死 `/sw.js`、`/vendor/…` 都会 404（SW 注册失败即失去离线能力）。
 */
export function RegisterSW() {
  useEffect(() => {
    // 奇门引擎按需懒加载，这里只是先告知它去哪里取，尚不会触发下载。
    setVendorBase(withBasePath('/vendor'));

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const swUrl = withBasePath('/sw.js');
    navigator.serviceWorker.register(swUrl, { scope: withBasePath('/') + '' }).catch(() => {
      // 注册失败不影响本次使用：所有推算本来就在内存中完成，
      // 只是下次断网无法打开页面。
    });
  }, []);

  return null;
}
