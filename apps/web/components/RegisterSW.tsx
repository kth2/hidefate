'use client';

import { useEffect } from 'react';

/** 注册 Service Worker，使全部核心推算与 vendor 引擎离线可用。 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败不影响使用：所有推算本来就在内存中完成，只是下次断网无法开启页面。
    });
  }, []);
  return null;
}
