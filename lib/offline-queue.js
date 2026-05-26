/**
 * lib/offline-queue.js — IndexedDB-backed action queue for PWA offline mode.
 *
 * Works in 3 environments:
 *   1. Browser with IndexedDB     → real IDB storage
 *   2. Service worker context     → same module, IDB still works
 *   3. Node (vitest)               → in-memory fallback (no IDB)
 *
 * Public API (all async unless noted):
 *   init()                       — open the DB (or no-op in memory mode)
 *   enqueue({endpoint, body, idempotencyKey?, method?})
 *                                → { id, idempotencyKey }
 *   peek(n?)                     → first N pending entries (default 10)
 *   size()                       → pending count
 *   drain({ fetch })             → { sent, failed, dead }; tries every pending
 *   clearAll()                   — wipe everything (testing/admin)
 *   listDead(n?)                 → debug list of dead-lettered entries
 *
 * Records that get 4xx errors move to a 'dead' store and are never retried.
 * Records with 5xx / network errors stay in the queue with attempts++.
 *
 * The module is intentionally side-effect-free at import time.
 */
'use strict';

const DB_NAME    = 'adit-offline';
const DB_VERSION = 1;
const STORE_OUT  = 'outbox';
const STORE_DEAD = 'dead';

// ─── Environment detection ──────────────────────────────────────────────
function getIDB() {
  if (typeof indexedDB !== 'undefined') return indexedDB;
  if (typeof self !== 'undefined' && self.indexedDB) return self.indexedDB;
  if (typeof globalThis !== 'undefined' && globalThis.indexedDB) return globalThis.indexedDB;
  return null;
}

// ─── In-memory fallback (Node tests) ────────────────────────────────────
// Same shape as the public methods but backed by a Map.
function makeMemoryStore() {
  let nextId = 1;
  const outbox = new Map();
  const dead = new Map();
  return {
    async init() { /* no-op */ },
    async enqueue(entry) {
      const id = nextId++;
      const record = { ...entry, id };
      outbox.set(id, record);
      return { id, idempotencyKey: entry.idempotencyKey };
    },
    async size() { return outbox.size; },
    async peek(n) {
      return Array.from(outbox.values()).slice(0, n || 10);
    },
    async update(id, patch) {
      const r = outbox.get(id);
      if (r) outbox.set(id, { ...r, ...patch });
    },
    async deleteFromOutbox(id) { outbox.delete(id); },
    async moveToDead(id) {
      const r = outbox.get(id);
      if (r) { dead.set(id, { ...r, deadAt: Date.now() }); outbox.delete(id); }
    },
    async clearAll() { outbox.clear(); dead.clear(); nextId = 1; },
    async listDead(n) { return Array.from(dead.values()).slice(0, n || 10); }
  };
}

// ─── IndexedDB store implementation ─────────────────────────────────────
function makeIDBStore(idb) {
  let dbHandle = null;

  function openDb() {
    if (dbHandle) return Promise.resolve(dbHandle);
    return new Promise((resolve, reject) => {
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_OUT)) {
          db.createObjectStore(STORE_OUT, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_DEAD)) {
          db.createObjectStore(STORE_DEAD, { keyPath: 'id' });
        }
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

  return {
    async init() { await openDb(); },

    async enqueue(entry) {
      const store = await tx(STORE_OUT, 'readwrite');
      const id = await awaitReq(store.add(entry));
      // IDB autoIncrement returns the key; update the record in-place
      const record = await awaitReq((await tx(STORE_OUT)).get(id));
      // Also stamp the id back onto the record (some IDB impls don't auto-include)
      if (record && record.id == null) {
        const writeStore = await tx(STORE_OUT, 'readwrite');
        await awaitReq(writeStore.put({ ...record, id }));
      }
      return { id, idempotencyKey: entry.idempotencyKey };
    },

    async size() {
      const store = await tx(STORE_OUT);
      return awaitReq(store.count());
    },

    async peek(n) {
      const store = await tx(STORE_OUT);
      const all = await awaitReq(store.getAll());
      // Sort by id ascending (oldest first)
      all.sort((a, b) => (a.id || 0) - (b.id || 0));
      return all.slice(0, n || 10);
    },

    async update(id, patch) {
      const store = await tx(STORE_OUT, 'readwrite');
      const existing = await awaitReq(store.get(id));
      if (!existing) return;
      await awaitReq(store.put({ ...existing, ...patch }));
    },

    async deleteFromOutbox(id) {
      const store = await tx(STORE_OUT, 'readwrite');
      await awaitReq(store.delete(id));
    },

    async moveToDead(id) {
      const outStore = await tx(STORE_OUT, 'readwrite');
      const record = await awaitReq(outStore.get(id));
      if (!record) return;
      const deadStore = await tx(STORE_DEAD, 'readwrite');
      await awaitReq(deadStore.put({ ...record, deadAt: Date.now() }));
      await awaitReq((await tx(STORE_OUT, 'readwrite')).delete(id));
    },

    async clearAll() {
      const out = await tx(STORE_OUT, 'readwrite');
      await awaitReq(out.clear());
      const dead = await tx(STORE_DEAD, 'readwrite');
      await awaitReq(dead.clear());
    },

    async listDead(n) {
      const store = await tx(STORE_DEAD);
      const all = await awaitReq(store.getAll());
      all.sort((a, b) => (b.deadAt || 0) - (a.deadAt || 0));
      return all.slice(0, n || 10);
    }
  };
}

// ─── Singleton store picker ─────────────────────────────────────────────
let _store = null;
function getStore() {
  if (_store) return _store;
  const idb = getIDB();
  _store = idb ? makeIDBStore(idb) : makeMemoryStore();
  return _store;
}

// Allow tests to force in-memory mode regardless of IDB availability.
function _useMemoryStore() {
  _store = makeMemoryStore();
}

// ─── UUID v4 (RFC 4122) — for idempotency keys ─────────────────────────
function uuid() {
  // Prefer crypto.randomUUID where available (browser + Node 19+)
  const c = (typeof crypto !== 'undefined' ? crypto : (typeof self !== 'undefined' ? self.crypto : null));
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback — Math.random() based, not cryptographically strong but adequate
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = Math.random() * 16 | 0;
    return (ch === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

// ─── Public API ─────────────────────────────────────────────────────────

async function init() {
  return getStore().init();
}

/**
 * Enqueue an action for later delivery.
 *
 * @param {Object} args
 * @param {string} args.endpoint - server path, e.g. '/api/break-events'
 * @param {string} [args.method='POST']
 * @param {Object} [args.body={}]
 * @param {string} [args.idempotencyKey] - autogenerated UUID v4 if missing
 * @returns {Promise<{id, idempotencyKey}>}
 */
async function enqueue(args) {
  if (!args || typeof args !== 'object') throw new Error('enqueue: args required');
  if (!args.endpoint || typeof args.endpoint !== 'string') throw new Error('enqueue: endpoint required');
  const key = args.idempotencyKey || uuid();
  const record = {
    endpoint: args.endpoint,
    method: args.method || 'POST',
    body: args.body || {},
    idempotencyKey: key,
    enqueuedAt: Date.now(),
    attempts: 0,
    lastError: null,
    lastAttemptAt: 0
  };
  const out = await getStore().enqueue(record);
  return { id: out.id, idempotencyKey: key };
}

async function size() {
  return getStore().size();
}

async function peek(n) {
  return getStore().peek(n);
}

async function listDead(n) {
  return getStore().listDead(n);
}

async function clearAll() {
  return getStore().clearAll();
}

/**
 * Attempt to send every queued action.
 *
 * @param {Object} opts
 * @param {Function} opts.fetch - usually globalThis.fetch
 * @param {number} [opts.maxAttempts=8] - move to dead after this many tries
 * @returns {Promise<{sent: number, failed: number, dead: number}>}
 */
async function drain(opts) {
  const fetchFn = (opts && opts.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) throw new Error('drain: fetch function required');
  const maxAttempts = (opts && opts.maxAttempts) || 8;

  const store = getStore();
  const pending = await store.peek(100);  // grab up to 100 oldest
  let sent = 0, failed = 0, dead = 0;

  for (const record of pending) {
    try {
      const res = await fetchFn(record.endpoint, {
        method: record.method || 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': record.idempotencyKey
        },
        body: JSON.stringify(record.body || {})
      });

      if (res && res.ok) {
        await store.deleteFromOutbox(record.id);
        sent++;
        continue;
      }

      // Final failure (4xx — won't ever succeed even on retry)
      if (res && res.status >= 400 && res.status < 500) {
        await store.moveToDead(record.id);
        dead++;
        continue;
      }

      // Transient failure (5xx) — keep, increment attempts
      const newAttempts = (record.attempts || 0) + 1;
      if (newAttempts >= maxAttempts) {
        await store.moveToDead(record.id);
        dead++;
        continue;
      }
      await store.update(record.id, {
        attempts: newAttempts,
        lastError: 'server ' + (res ? res.status : 'no-response'),
        lastAttemptAt: Date.now()
      });
      failed++;
    } catch (err) {
      // Network error — keep in queue, count attempt
      const newAttempts = (record.attempts || 0) + 1;
      if (newAttempts >= maxAttempts) {
        await store.moveToDead(record.id);
        dead++;
        continue;
      }
      await store.update(record.id, {
        attempts: newAttempts,
        lastError: String(err && err.message || err),
        lastAttemptAt: Date.now()
      });
      failed++;
    }
  }
  return { sent, failed, dead };
}

module.exports = {
  init,
  enqueue,
  drain,
  size,
  peek,
  listDead,
  clearAll,
  // exposed for tests
  _useMemoryStore,
  _uuid: uuid
};
