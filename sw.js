const CACHE = 'nexora-alpha-pwa-v8-currentprofile';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.png',
  './nexora-icon-192.png',
  './nexora-icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png',
  './nexora-notification.wav'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ===== NEXORA WEB PUSH NOTIFICATION FEATURE ONLY ===== */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { try { payload = {body: event.data ? event.data.text() : ''}; } catch (_) {} }
  const title = payload.title || 'Nexora Alpha';
  const body = payload.body || 'Ada informasi baru di Nexora Alpha.';
  const data = payload.data || {};
  const target = data.url || './#home';
  const url = new URL(target, self.location.origin).href;
  const tag = data.tag || ('nexora-' + Date.now());

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clients) {
      try { client.postMessage({type:'NEXORA_PUSH', title, body, data}); } catch (_) {}
    }
    await self.registration.showNotification(title, {
      body,
      icon: data.icon || './nexora-icon-192.png',
      badge: './nexora-icon-192.png',
      tag,
      renotify: true,
      requireInteraction: false,
      vibrate: [120, 60, 120],
      data: {url, notificationId: data.notificationId || null}
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || new URL('./#home', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of windows) {
      if ('focus' in client) {
        try { await client.navigate(target); } catch (_) {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, {cache: 'no-store'})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && (
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.wav') ||
          url.pathname.endsWith('.webmanifest') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.js')
        )) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
