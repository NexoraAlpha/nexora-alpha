const CACHE = 'nexora-alpha-pwa-v7';
const STATIC_SHELL = [
  './manifest.webmanifest',
  './logo.png',
  './nexora-icon-192.png',
  './nexora-icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png',
  './nexora-notification.wav'
];

// Only these static assets are allowed into the persistent cache.
// HTML/JS/CSS are deliberately NOT kept in the persistent cache to avoid
// stale application code and unbounded cache growth.
const STATIC_EXTENSIONS = /\.(png|jpg|jpeg|webp|gif|svg|ico|wav|mp3|ogg|webmanifest)$/i;

async function clearOldNexoraCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(key => key !== CACHE && /^nexora-alpha-pwa-/i.test(key))
      .map(key => caches.delete(key))
  );
}

async function trimCurrentCache() {
  const cache = await caches.open(CACHE);
  const requests = await cache.keys();
  const allowed = new Set(STATIC_SHELL);
  await Promise.all(
    requests
      .filter(req => {
        const path = new URL(req.url).pathname;
        return !allowed.has(req.url.replace(self.location.origin, '.'))
          && !STATIC_EXTENSIONS.test(path);
      })
      .map(req => cache.delete(req))
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'NEXORA_SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'NEXORA_CLEAR_CACHE') {
    event.waitUntil((async () => {
      await clearOldNexoraCaches();
      const cache = await caches.open(CACHE);
      const requests = await cache.keys();

      // Keep only the declared shell and static media.
      await Promise.all(
        requests
          .filter(req => {
            const url = new URL(req.url);
            const normalized = url.origin === self.location.origin
              ? `.${url.pathname}${url.search}`
              : req.url;
            return !STATIC_SHELL.includes(normalized)
              && !STATIC_EXTENSIONS.test(url.pathname);
          })
          .map(req => cache.delete(req))
      );

      const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
      clients.forEach(client => {
        try { client.postMessage({type:'NEXORA_CACHE_CLEARED'}); } catch (_) {}
      });
    })());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await clearOldNexoraCaches();
    await trimCurrentCache();
    await self.clients.claim();
  })());
});

/* ===== NEXORA WEB PUSH NOTIFICATION ===== */
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

  // HTML is always network-first and is never persisted by this SW.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, {cache: 'no-store'})
        .catch(() => new Response('<!doctype html><title>Nexora offline</title><body style="font-family:sans-serif;padding:24px">Nexora sedang offline. Sambungkan internet lalu muat ulang.</body>', {headers:{'Content-Type':'text/html; charset=utf-8'}, status:503}))
    );
    return;
  }

  // JS/CSS are always network-first and are NEVER persisted.
  // This removes stale-code problems and prevents code-cache accumulation.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(req, {cache: 'no-store'})
        .catch(() => fetch(req))
    );
    return;
  }

  // Static media: cache-first, but only for same-origin static files.
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});
