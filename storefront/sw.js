/* District Cure service worker — installable PWA + safe offline shell.
   Strategy: network-first for navigations/assets (so live menu, blog & prices
   stay fresh), with a cached fallback when offline. NEVER caches /api or /admin
   or cross-origin (Dutchie, fonts, image AI) so nothing dynamic goes stale. */
const CACHE = 'dc-cache-v2';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch POST/PATCH/DELETE
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // skip cross-origin (Dutchie, fonts, AI)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return; // always live

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/')))
  );
});
