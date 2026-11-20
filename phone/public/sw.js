/* Alton phone app service worker.
   - Keeps the app itself available offline (network first, cache fallback; this site's own files only).
   - Receives things shared from other apps (Android share sheet) and hands them to the page. */
const CACHE = 'alton-v3';
const SHARED = 'alton-shared';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png'])),
  );
});
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Share sheet: keep the text and pictures for the page, then open it.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(
      (async () => {
        const form = await e.request.formData();
        const text = [form.get('title'), form.get('text'), form.get('url')]
          .filter(Boolean)
          .join('\n');
        const cache = await caches.open(SHARED);
        await cache.put('./shared/text', new Response(text));
        let i = 0;
        for (const f of form.getAll('files')) {
          if (f && typeof f === 'object' && i < 4)
            await cache.put(
              `./shared/file-${i++}`,
              new Response(f, { headers: { 'content-type': f.type } }),
            );
        }
        await cache.put('./shared/count', new Response(String(i)));
        return Response.redirect('./?shared=1', 303);
      })(),
    );
    return;
  }
  if (e.request.method !== 'GET') return;
  // Never cache the update check; always ask the server again for the page itself.
  if (url.pathname.endsWith('/version.json')) return;
  const fresh = e.request.mode === 'navigate' || url.pathname.endsWith('.html');
  e.respondWith(
    (fresh ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
