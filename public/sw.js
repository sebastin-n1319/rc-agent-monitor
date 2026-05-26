/* Adit Agent Monitor — Service Worker v1
 * Strategy:
 * - Cache-first for static assets (fonts, images, CSS, JS libs)
 * - Network-first with stale fallback for API requests
 * - Offline shell: serve cached index.html when navigation fails
 */
const CACHE_VERSION = 'adit-v1.0.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE   = `${CACHE_VERSION}-api`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/adit-theme.css',
  '/adit-reset.js',
  '/adit-logo-dark.png',
  '/adit-logo-light.png',
  '/break-bot-avatar.svg'
];

const API_STALE_TTL_MS = 30 * 60 * 1000;  // 30 min stale tolerance for offline

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin? Let it through (fonts, Google APIs, etc.)
  if (url.origin !== self.location.origin) return;

  // Navigation requests → offline shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // API requests → network-first with stale fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(req));
    return;
  }

  // Static assets → cache-first
  event.respondWith(
    caches.match(req).then((hit) => hit || fetchAndCache(req))
  );
});

function fetchAndCache(req) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, clone)).catch(() => {});
    }
    return res;
  });
}

function networkFirstAPI(req) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(API_CACHE).then((c) => {
        // Stamp with timestamp via header
        const stamped = new Response(clone.body, {
          status: clone.status,
          statusText: clone.statusText,
          headers: Object.assign({}, ...[...clone.headers.entries()].map(([k, v]) => ({ [k]: v })), { 'x-cached-at': Date.now().toString() })
        });
        c.put(req, stamped);
      }).catch(() => {});
    }
    return res;
  }).catch(() => {
    return caches.match(req).then((cached) => {
      if (!cached) {
        return new Response(JSON.stringify({ success: false, offline: true, error: 'Offline — no cached data' }), {
          status: 503, headers: { 'Content-Type': 'application/json', 'x-served-from': 'sw-offline' }
        });
      }
      // Inject offline flag into JSON responses
      const stampedAt = cached.headers.get('x-cached-at');
      const ageMs = stampedAt ? Date.now() - parseInt(stampedAt) : null;
      if (ageMs && ageMs > API_STALE_TTL_MS) {
        // Too stale — return offline error
        return new Response(JSON.stringify({ success: false, offline: true, error: 'Cached data too stale', ageMs }), {
          status: 503, headers: { 'Content-Type': 'application/json', 'x-served-from': 'sw-stale' }
        });
      }
      // Return stale data with header marker
      return cached.clone().text().then((body) => {
        let parsed; try { parsed = JSON.parse(body); } catch { parsed = body; }
        if (typeof parsed === 'object' && parsed) parsed.cached = true;
        return new Response(JSON.stringify(parsed), {
          status: 200, headers: { 'Content-Type': 'application/json', 'x-served-from': 'sw-cache', 'x-cache-age-ms': String(ageMs || 0) }
        });
      });
    });
  });
}
