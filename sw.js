// ComputeGH Service Worker
// Offline-first: cache everything on install, serve from cache first

const CACHE_NAME = 'computegh-v1';

// Resources to pre-cache on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // External CDN resources (cached on first use via runtime caching below)
];

// CDN hosts we will cache at runtime
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── INSTALL: pre-cache local files ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching local assets');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Offline-first strategy ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // For CDN resources: cache-first, fall back to network
  const isCDN = CDN_HOSTS.some(host => url.hostname === host);

  if (isCDN || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Return cached, then update in background (stale-while-revalidate for CDN)
          if (isCDN) {
            const networkFetch = fetch(event.request).then(response => {
              if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
              }
              return response;
            }).catch(() => {});
          }
          return cached;
        }
        // Not in cache — fetch and cache
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        }).catch(() => {
          // Offline fallback for HTML navigation
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});
