/**
 * offline-bridge.js — PWA offline integration for the browser (Session 8).
 *
 * Owns:
 *   • In-page IndexedDB queue for break-bot actions when offline
 *   • Wrapping `sendBreakAction()` so offline taps don't disappear
 *   • Offline pill in the status bar (count + sync-now)
 *   • Listening for SW 'drain' messages and online events
 *   • Registering background sync where supported
 *
 * Feature flag: `offlineQueueV2` (default OFF). When off, this module is
 * inert — break-bot keeps its original online-only behavior.
 *
 * Public API:
 *   OfflineBridge.enqueueAction({endpoint, body})
 *   OfflineBridge.size()         → pending count
 *   OfflineBridge.drainNow()     → manual sync attempt
 *   OfflineBridge.isOnline()
 *   OfflineBridge.refreshPill()  — update the status bar pill
 */
(function () {
  'use strict';

  const DB_NAME = 'adit-offline';
  const DB_VERSION = 1;
  const STORE_OUT = 'outbox';
  const STORE_DEAD = 'dead';

  // ─── Helpers ───────────────────────────────────────────────────────────
  function flagOn(name) {
    if (typeof window.flag === 'function') return window.flag(name);
    return false;  // default off — feature is opt-in
  }

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  // ─── IndexedDB layer ───────────────────────────────────────────────────
  let dbHandle = null;

  function openDb() {
    if (dbHandle) return Promise.resolve(dbHandle);
    if (!window.indexedDB) return Promise.reject(new Error('IDB not available'));
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_OUT)) db.createObjectStore(STORE_OUT, { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_DEAD)) db.createObjectStore(STORE_DEAD, { keyPath: 'id' });
      };
      req.onsuccess = () => { dbHandle = req.result; resolve(dbHandle); };
      req.onerror = () => reject(req.error || new Error('IDB open failed'));
    });
  }

  function tx(store, mode = 'readonly') {
    return openDb().then(db => db.transaction(store, mode).objectStore(store));
  }

  function awaitReq(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error || new Error('IDB request failed'));
    });
  }

  async function enqueueIDB(entry) {
    const store = await tx(STORE_OUT, 'readwrite');
    const id = await awaitReq(store.add(entry));
    return { id, idempotencyKey: entry.idempotencyKey };
  }

  async function sizeIDB() {
    try { const store = await tx(STORE_OUT); return awaitReq(store.count()); }
    catch (e) { return 0; }
  }

  async function peekIDB(n) {
    try {
      const store = await tx(STORE_OUT);
      const all = await awaitReq(store.getAll());
      all.sort((a, b) => (a.id || 0) - (b.id || 0));
      return all.slice(0, n || 50);
    } catch (e) { return []; }
  }

  async function deleteFromOutbox(id) {
    const store = await tx(STORE_OUT, 'readwrite');
    await awaitReq(store.delete(id));
  }

  async function updateRecord(id, patch) {
    const store = await tx(STORE_OUT, 'readwrite');
    const existing = await awaitReq(store.get(id));
    if (!existing) return;
    await awaitReq(store.put({ ...existing, ...patch }));
  }

  async function moveToDead(id) {
    const outStore = await tx(STORE_OUT, 'readwrite');
    const record = await awaitReq(outStore.get(id));
    if (!record) return;
    const deadStore = await tx(STORE_DEAD, 'readwrite');
    await awaitReq(deadStore.put({ ...record, deadAt: Date.now() }));
    await awaitReq((await tx(STORE_OUT, 'readwrite')).delete(id));
  }

  // ─── Public enqueue + drain ────────────────────────────────────────────
  async function enqueueAction(args) {
    if (!args || !args.endpoint) throw new Error('endpoint required');
    const record = {
      endpoint: args.endpoint,
      method: args.method || 'POST',
      body: args.body || {},
      idempotencyKey: args.idempotencyKey || uuid(),
      enqueuedAt: Date.now(),
      attempts: 0,
      lastError: null,
      lastAttemptAt: 0
    };
    const out = await enqueueIDB(record);
    requestBackgroundSync();  // best-effort
    fireQueueChanged();
    return out;
  }

  let _draining = false;
  async function drainNow() {
    if (_draining) return { sent: 0, failed: 0, dead: 0, skipped: 'in-progress' };
    if (!navigator.onLine) return { sent: 0, failed: 0, dead: 0, skipped: 'offline' };
    _draining = true;
    let sent = 0, failed = 0, dead = 0;
    try {
      const pending = await peekIDB();
      for (const record of pending) {
        try {
          const res = await fetch(record.endpoint, {
            method: record.method || 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': record.idempotencyKey
            },
            body: JSON.stringify(record.body || {})
          });
          if (res && res.ok) {
            await deleteFromOutbox(record.id);
            sent++;
            continue;
          }
          if (res && res.status >= 400 && res.status < 500) {
            await moveToDead(record.id);
            dead++;
            continue;
          }
          const newAttempts = (record.attempts || 0) + 1;
          if (newAttempts >= 8) { await moveToDead(record.id); dead++; continue; }
          await updateRecord(record.id, { attempts: newAttempts, lastError: 'server ' + (res ? res.status : 'no-response'), lastAttemptAt: Date.now() });
          failed++;
        } catch (err) {
          const newAttempts = (record.attempts || 0) + 1;
          if (newAttempts >= 8) { await moveToDead(record.id); dead++; continue; }
          await updateRecord(record.id, { attempts: newAttempts, lastError: String(err && err.message || err), lastAttemptAt: Date.now() });
          failed++;
        }
      }
    } finally {
      _draining = false;
      fireQueueChanged();
    }
    return { sent, failed, dead };
  }

  function isOnline() { return navigator.onLine !== false; }

  // ─── Background sync registration ──────────────────────────────────────
  async function requestBackgroundSync() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.sync && typeof reg.sync.register === 'function') {
          await reg.sync.register('adit-drain');
        }
      }
    } catch (e) { /* sync not supported — that's fine */ }
  }

  // ─── SW message listener ───────────────────────────────────────────────
  function listenForSwMessages() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data || !event.data.type) return;
      if (event.data.type === 'drain') {
        drainNow().then(result => {
          if (result.sent > 0 && typeof window.showToast === 'function') {
            window.showToast('☁ Synced ' + result.sent + ' queued action' + (result.sent === 1 ? '' : 's'), 'success', 2500);
          }
        });
      } else if (event.data.type === 'sw-activated') {
        // New SW activated — refresh UI
        refreshPill();
      }
    });
  }

  // ─── Online / offline event handling ───────────────────────────────────
  function setupNetworkListeners() {
    window.addEventListener('online', async () => {
      refreshPill();
      const result = await drainNow();
      if (result.sent > 0 && typeof window.showToast === 'function') {
        window.showToast('☁ Back online — synced ' + result.sent + ' queued action' + (result.sent === 1 ? '' : 's'), 'success', 3000);
      }
    });
    window.addEventListener('offline', () => {
      if (typeof window.showToast === 'function') {
        window.showToast('📡 Offline — actions will queue until reconnected', 'warning', 4000);
      }
      refreshPill();
    });
  }

  // ─── Status bar offline pill ───────────────────────────────────────────
  function ensurePill() {
    let pill = document.getElementById('offline-pill');
    if (pill) return pill;
    const sbLeft = document.querySelector('#status-bar .sb-left');
    if (!sbLeft) return null;
    pill = document.createElement('span');
    pill.id = 'offline-pill';
    pill.className = 'offline-pill';
    pill.style.display = 'none';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-label', 'Network status: offline. Queued actions will sync when reconnected.');
    pill.innerHTML = '<span class="op-ico" aria-hidden="true">📡</span>' +
                     '<span class="op-state">offline</span>' +
                     '<span class="op-count" id="op-count" aria-label="Queued actions count">0</span>' +
                     '<button class="op-sync" id="op-sync" type="button" title="Try syncing queued actions now" aria-label="Sync queued actions now">Sync now</button>';
    sbLeft.appendChild(pill);
    pill.querySelector('#op-sync').addEventListener('click', async () => {
      const btn = pill.querySelector('#op-sync');
      btn.disabled = true; btn.textContent = 'Syncing…';
      const result = await drainNow();
      btn.disabled = false; btn.textContent = 'Sync now';
      if (typeof window.showToast === 'function') {
        if (result.skipped === 'offline') window.showToast('📡 Still offline', 'warning', 2500);
        else window.showToast('Drain: ' + result.sent + ' sent, ' + result.failed + ' retry, ' + result.dead + ' dead', result.sent > 0 ? 'success' : 'info', 3000);
      }
    });
    return pill;
  }

  async function refreshPill() {
    if (!flagOn('offlineQueueV2')) return;
    const pill = ensurePill();
    if (!pill) return;
    const count = await sizeIDB();
    const offline = !isOnline();
    if (!offline && count === 0) {
      pill.style.display = 'none';
      return;
    }
    pill.style.display = 'inline-flex';
    pill.dataset.state = offline ? 'offline' : 'queued';
    pill.querySelector('.op-state').textContent = offline ? 'offline' : 'queued';
    pill.querySelector('.op-count').textContent = String(count);
    pill.querySelector('.op-count').style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function fireQueueChanged() {
    refreshPill();
    try { window.dispatchEvent(new CustomEvent('adit-queue-changed')); } catch (e) {}
  }

  // ─── Wrap sendBreakAction ──────────────────────────────────────────────
  // We monkey-patch only when the flag is ON; otherwise the original code
  // path runs unchanged. The wrapper:
  //   - If online → call original handler
  //   - If offline AND flag on → enqueue + toast
  let _wrapped = false;
  function wrapSendBreakAction() {
    if (_wrapped) return;
    const original = window.sendBreakAction;
    if (typeof original !== 'function') {
      // sendBreakAction not loaded yet — try again shortly
      setTimeout(wrapSendBreakAction, 1000);
      return;
    }
    _wrapped = true;

    window.sendBreakAction = async function (action, btn) {
      if (!flagOn('offlineQueueV2')) {
        return original.call(this, action, btn);
      }
      if (isOnline()) {
        return original.call(this, action, btn);
      }
      // Offline path — enqueue for later
      try {
        // Pull session info the same way the original handler does
        let session = {};
        try { session = JSON.parse(localStorage.getItem('rcSession') || '{}'); } catch (e) {}
        const payload = {
          username: session.name || 'Agent',
          email: session.email || '',
          role: session.role || 'agent',
          action,
          note: null
        };
        await enqueueAction({ endpoint: '/api/break-events', body: payload });
        if (typeof window.showToast === 'function') {
          window.showToast('📡 Offline — "' + action + '" queued, will sync when back online', 'warning', 4500);
        }
      } catch (e) {
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to queue: ' + e.message, 'error', 4000);
        }
      }
    };
  }

  // ─── Init ──────────────────────────────────────────────────────────────
  async function init() {
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    if (!flagOn('offlineQueueV2')) return;
    try { await openDb(); } catch (e) { /* IDB might fail in private browsing */ }
    listenForSwMessages();
    setupNetworkListeners();
    wrapSendBreakAction();
    refreshPill();
    // Drain on startup if anything was queued before
    if (isOnline()) drainNow();
    // Periodic refresh of pill in case other tabs change state
    setInterval(refreshPill, 5000);
  }

  document.addEventListener('DOMContentLoaded', init);
  if (window.MutationObserver) {
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('app-authenticated')) init();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  window.OfflineBridge = {
    enqueueAction,
    size: sizeIDB,
    drainNow,
    isOnline,
    refreshPill
  };
})();
