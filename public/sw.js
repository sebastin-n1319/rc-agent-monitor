/**
 * Adit Agent Monitor — Service Worker v1.8.0 (P0 cache-bust)
 *
 * Strategies:
 *   • Shell (HTML/CSS/JS) → stale-while-revalidate from `shell-vN` cache
 *   • Assets (fonts/imgs) → cache-first from `assets-vN`
 *   • API GET            → network-first w/ stale fallback from `api-vN`
 *   • API non-GET        → never cached; offline → 503 (client queues via IDB)
 *   • Navigation         → network-FIRST with /index.html fallback (no SWR
 *     for navigations — v1.8 changed from stale-while-revalidate to prevent
 *     stuck old shells reported by agents on 2026-05-27)
 *
 * On activate, every cache NOT in CURRENT_CACHES is deleted, so version
 * bumps cleanly migrate users without leaving stale caches around.
 *
 * Background sync:
 *   • 'sync' event with tag 'adit-drain' triggers a drain message to ALL
 *     open clients. The client owns the IDB queue & drains it.
 *   • 'message' event with {type:'drain'} is the manual-trigger path.
 *
 * P0 (Session 14 hotfix — 2026-05-27):
 *   Agents reported "agent view collapsed, pop-up not working, can't use
 *   break bot or log tickets" after v1.7 rolled out. Repo bytes matched
 *   production bytes exactly → root cause was stale SW cache holding an
 *   old shell that no longer matched the deployed modules. v1.8 forces a
 *   clean re-fetch of every shell+asset on first navigation.
 */
const CACHE_VERSION = 'adit-v1.19.141'; // Futuristic login — particle canvas, glassmorphism card, Brain mascot
const SHELL_CACHE  = `shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `assets-${CACHE_VERSION}`;
const API_CACHE    = `api-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSETS_CACHE, API_CACHE]);

// Pre-cache on install so the shell works offline from first visit
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/adit-theme.css',
  '/adit-reset.js',
  '/agent-view-v2.css',
  '/agent-view-v2.js',
  '/alert-center.css',
  '/alert-center.js',
  '/schedule-admin.css',
  '/schedule-admin.js',
  '/anomaly-center.css',
  '/anomaly-center.js',
  '/offline-bridge.css',
  '/offline-bridge.js',
  '/bulk-actions.css',
  '/bulk-actions.js',
  '/predict-center.css',
  '/predict-center.js',
  '/roster-admin.css',
  '/roster-admin.js',
  '/brain.js',
  '/brain-logo.png',
  '/brain-avatar.png',
  '/brain-widget.png',
  '/brain-thinking.png',
  '/brain-search.png',
  '/brain-success.png',
  '/brain-error.png',
  '/brain-learning.png',
  '/a11y-focus-trap.js',
  '/adit-logo-dark.svg',
  '/adit-logo-light.svg',
  '/adit-logo-dark.png',
  '/adit-logo-light.png',
  '/adit-icon.svg',
  '/adit-icon-32.png',
  '/adit-icon-192.png',
  '/break-bot-avatar.svg',
  '/manifest.webmanifest'
];

const API_STALE_TTL_MS = 30 * 60 * 1000;  // 30 min stale tolerance for offline-served APIs

// ─── Install ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Best-effort: any single asset failure shouldn't abort install
    await Promise.all(PRECACHE_URLS.map(url =>
      cache.add(url).catch(err => console.warn('[SW] precache skip', url, err.message))
    ));
    await self.skipWaiting();
  })());
});

// ─── Activate (cache cleanup) ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !CURRENT_CACHES.has(k)).map(k => caches.delete(k))
    );
    await self.clients.claim();
    // Tell all open clients we're activated — they can refresh data if they like
    const clients = await self.clients.matchAll();
    for (const c of clients) c.postMessage({ type: 'sw-activated', version: CACHE_VERSION });
  })());
});

// ─── Fetch dispatch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    // Non-GET API calls — never cache. Client owns offline queue.
    return;
  }
  const url = new URL(req.url);
  // Skip cross-origin (Google APIs, fonts handled by browser, etc.)
  if (url.origin !== self.location.origin) return;

  // Navigation → network with index.html fallback
  if (req.mode === 'navigate') {
    event.respondWith(navigationStrategy(req));
    return;
  }

  // /api/* GET → network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(req));
    return;
  }

  // Static assets → cache-first
  event.respondWith(cacheFirst(req));
});

// ─── Strategies ─────────────────────────────────────────────────────────

async function navigationStrategy(req) {
  try {
    // Always bypass all caches for HTML navigation so new deployments
    // are picked up immediately without needing a hard refresh
    const res = await fetch(req, { cache: 'no-store' });
    return res;
  } catch (e) {
    const cached = await caches.match('/index.html');
    if (cached) return cached;
    return new Response('<!doctype html><meta charset=utf-8><title>Offline</title><h1>Offline</h1><p>Adit Monitor is offline. Reconnect to continue.</p>', {
      status: 503, headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // Background revalidate — don't await
    fetch(req).then(res => {
      if (res && res.ok) caches.open(SHELL_CACHE).then(c => c.put(req, res.clone())).catch(()=>{});
    }).catch(()=>{});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(SHELL_CACHE).then(c => c.put(req, clone)).catch(()=>{});
    }
    return res;
  } catch (e) {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstAPI(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      // Stamp a freshness header so stale-checks work on serve-back
      const cacheable = new Response(res.clone().body, {
        status: res.status, statusText: res.statusText,
        headers: stampHeaders(res.headers, { 'x-cached-at': Date.now().toString() })
      });
      caches.open(API_CACHE).then(c => c.put(req, cacheable)).catch(()=>{});
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (!cached) {
      return new Response(JSON.stringify({ success: false, offline: true, error: 'Offline — no cached data' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'x-served-from': 'sw-offline' }
      });
    }
    // Check staleness
    const stamp = cached.headers.get('x-cached-at');
    const ageMs = stamp ? Date.now() - parseInt(stamp) : null;
    if (ageMs != null && ageMs > API_STALE_TTL_MS) {
      return new Response(JSON.stringify({ success: false, offline: true, error: 'Cached data too stale', ageMs }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'x-served-from': 'sw-stale' }
      });
    }
    // Inject offline flag into body so clients can render a banner
    const body = await cached.clone().text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    if (typeof parsed === 'object' && parsed) {
      parsed.cached = true;
      parsed.cachedAgeMs = ageMs;
    }
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-served-from': 'sw-cache', 'x-cache-age-ms': String(ageMs || 0) }
    });
  }
}

function stampHeaders(orig, extra) {
  const h = new Headers();
  if (orig && typeof orig.forEach === 'function') {
    orig.forEach((v, k) => h.set(k, v));
  }
  for (const k of Object.keys(extra || {})) h.set(k, extra[k]);
  return h;
}

// ─── Background sync ───────────────────────────────────────────────────
// Modern browsers fire 'sync' when connectivity returns. We delegate the
// actual queue draining to the client (it owns IDB). If no clients are
// open, the next page load will drain on its own.
self.addEventListener('sync', (event) => {
  if (event.tag === 'adit-drain') {
    event.waitUntil(notifyClientsToDrain());
  }
});

async function notifyClientsToDrain() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) {
    try { c.postMessage({ type: 'drain' }); } catch (e) {}
  }
  return { notified: clients.length };
}

// ─── Manual message channel ────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;
  if (event.data.type === 'drain') {
    // Same as the sync event handler — broadcast to all clients
    event.waitUntil(notifyClientsToDrain());
  } else if (event.data.type === 'skip-waiting') {
    self.skipWaiting();
  } else if (event.data.type === 'version') {
    event.source && event.source.postMessage({ type: 'version', version: CACHE_VERSION });
  }
});
