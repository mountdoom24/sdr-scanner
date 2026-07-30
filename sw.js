/* SDR Scanner — offline service worker
   Cache-first for the app shell so the whole thing runs with no wifi/data. */

const CACHE = 'sdr-scanner-v2';

// Relative paths so this works from a GitHub Pages subdirectory
// (e.g. https://user.github.io/sdr-scanner/) as well as a root domain.
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if any single file 404s, so add
    // them individually and tolerate misses on optional icons.
    await Promise.all(ASSETS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* optional asset unavailable — keep going */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage('cached'));
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigations: serve the cached shell when the network is gone.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('index.html')) ||
               (await cache.match('./')) ||
               new Response('Offline and nothing cached yet.', { status: 503 });
      }
    })());
    return;
  }

  // Everything else: cache first, fall back to network, then store it.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && new URL(req.url).origin === self.location.origin) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
