/**
 * Service Worker —— 离线优先。
 *
 * 重点：把 416 KB 的奇门引擎与山向核心一并预缓存，
 * 这样即便完全断网，山向奇门层依然能排盘（飞星、八宅、八字本就纯内存计算）。
 */

const CACHE = 'hidefate-v1';

/**
 * 安装时即预取的关键资源。
 *
 * 五个底部 tab 全部预缓存 —— 站在屋里往往没信号，此时切 tab 必须照常能用。
 * 所有推算本来就在本机完成，缺的只是页面外壳。
 */
const PRECACHE = [
  '/',
  '/house',
  '/members',
  '/simulate',
  '/me',
  '/new',
  '/manifest.json',
  '/icon.svg',
  '/vendor/qimen-engine.js',
  '/vendor/shanxiang.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // 逐个添加：任一资源失败不应让整个 SW 安装失败。
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // vendor 引擎：缓存优先（体积大且永不变动）
  if (url.pathname.startsWith('/vendor/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => cacheAndReturn(req, res))),
    );
    return;
  }

  // 其余：网络优先，失败回退缓存，再回退首页（SPA 导航）
  event.respondWith(
    fetch(req)
      .then((res) => cacheAndReturn(req, res))
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const home = await caches.match('/');
          if (home) return home;
        }
        return new Response('离线且无缓存', { status: 503, statusText: 'Offline' });
      }),
  );
});

function cacheAndReturn(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
  }
  return res;
}
