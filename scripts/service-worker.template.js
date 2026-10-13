const CACHE = 'duel-arena-app-__VERSION__';
const FILES = __FILES__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    // Do not activate an incomplete set of assets (including the original BGM).
    for (const file of FILES) {
      const response = await fetch(new Request(file, { cache: 'reload' }));
      if (!response.ok) throw new Error('Missing APP asset: ' + file);
      await cache.put(file, response);
    }
  }));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('duel-arena-app-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = event.request.mode === 'navigate' ? './index.html' : url.pathname;
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached && event.request.headers.has('range')) {
      const bytes = await cached.arrayBuffer();
      const match = /^bytes=(\d*)-(\d*)$/.exec(event.request.headers.get('range'));
      if (!match || (!match[1] && !match[2])) return fetch(event.request);
      const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
      if (start > end || start >= bytes.byteLength) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } });
      const headers = new Headers(cached.headers);
      headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
      headers.set('Content-Length', String(end - start + 1));
      headers.set('Accept-Ranges', 'bytes');
      return new Response(bytes.slice(start, end + 1), { status: 206, headers });
    }
    return cached || fetch(event.request);
  })());
});
