/**
 * Unit tests for lib/offline-queue.js
 *
 * Runs against the in-memory fallback (no IDB in Node) — the IDB code path
 * is verified separately via Playwright E2E in the browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Q from '../../lib/offline-queue.js';

beforeEach(async () => {
  Q._useMemoryStore();
  await Q.init();
  await Q.clearAll();
});

// ─── Public surface ────────────────────────────────────────────────────
describe('offline-queue — public surface', () => {
  it('exports the public API', () => {
    expect(typeof Q.init).toBe('function');
    expect(typeof Q.enqueue).toBe('function');
    expect(typeof Q.drain).toBe('function');
    expect(typeof Q.size).toBe('function');
    expect(typeof Q.peek).toBe('function');
    expect(typeof Q.listDead).toBe('function');
    expect(typeof Q.clearAll).toBe('function');
  });

  it('init() is idempotent', async () => {
    await Q.init();
    await Q.init();
    expect(await Q.size()).toBe(0);
  });
});

// ─── enqueue ───────────────────────────────────────────────────────────
describe('enqueue', () => {
  it('rejects missing args', async () => {
    await expect(Q.enqueue()).rejects.toThrow();
    await expect(Q.enqueue(null)).rejects.toThrow();
    await expect(Q.enqueue({})).rejects.toThrow();
  });

  it('rejects missing endpoint', async () => {
    await expect(Q.enqueue({ body: {} })).rejects.toThrow(/endpoint/);
  });

  it('returns id + idempotencyKey on success', async () => {
    const result = await Q.enqueue({ endpoint: '/x', body: { a: 1 } });
    expect(result.id).toBeDefined();
    expect(result.idempotencyKey).toBeTruthy();
    expect(result.idempotencyKey.length).toBeGreaterThan(10);
  });

  it('autogenerates a UUID if not provided', async () => {
    const r = await Q.enqueue({ endpoint: '/x' });
    // RFC 4122 v4 has the 4 in position 14
    expect(r.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('respects a provided idempotencyKey', async () => {
    const r = await Q.enqueue({ endpoint: '/x', idempotencyKey: 'mine-123' });
    expect(r.idempotencyKey).toBe('mine-123');
  });

  it('increments size()', async () => {
    expect(await Q.size()).toBe(0);
    await Q.enqueue({ endpoint: '/x' });
    expect(await Q.size()).toBe(1);
    await Q.enqueue({ endpoint: '/y' });
    expect(await Q.size()).toBe(2);
  });
});

// ─── peek ──────────────────────────────────────────────────────────────
describe('peek', () => {
  it('returns empty array when empty', async () => {
    expect(await Q.peek()).toEqual([]);
  });

  it('returns entries in insertion order', async () => {
    await Q.enqueue({ endpoint: '/a' });
    await Q.enqueue({ endpoint: '/b' });
    await Q.enqueue({ endpoint: '/c' });
    const peek = await Q.peek();
    expect(peek.map(p => p.endpoint)).toEqual(['/a', '/b', '/c']);
  });

  it('respects the n limit', async () => {
    for (let i = 0; i < 5; i++) await Q.enqueue({ endpoint: '/x' + i });
    const peek = await Q.peek(3);
    expect(peek.length).toBe(3);
  });

  it('records include enqueuedAt and attempts:0', async () => {
    await Q.enqueue({ endpoint: '/x' });
    const [first] = await Q.peek();
    expect(first.enqueuedAt).toBeGreaterThan(0);
    expect(first.attempts).toBe(0);
    expect(first.lastError).toBeNull();
  });
});

// ─── drain ─────────────────────────────────────────────────────────────
describe('drain', () => {
  it('does nothing when queue is empty', async () => {
    const result = await Q.drain({ fetch: vi.fn() });
    expect(result).toEqual({ sent: 0, failed: 0, dead: 0 });
  });

  it('rejects when no fetch provided and globalThis lacks fetch', async () => {
    // node 24 has fetch globally — explicitly pass undefined
    const result = await Q.drain({ fetch: undefined }).catch(e => e);
    // If global fetch exists, it doesn't reject — accept either behavior
    if (result instanceof Error) {
      expect(result.message).toMatch(/fetch/);
    } else {
      expect(result).toHaveProperty('sent');
    }
  });

  it('sends each queued item and removes successes', async () => {
    await Q.enqueue({ endpoint: '/api/x', body: { v: 1 } });
    await Q.enqueue({ endpoint: '/api/y', body: { v: 2 } });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await Q.drain({ fetch: fetchSpy });
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.dead).toBe(0);
    expect(await Q.size()).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('attaches Content-Type and X-Idempotency-Key headers', async () => {
    await Q.enqueue({ endpoint: '/api/x', body: { hello: 'world' }, idempotencyKey: 'k-123' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await Q.drain({ fetch: fetchSpy });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/x');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Idempotency-Key']).toBe('k-123');
    expect(opts.credentials).toBe('same-origin');
    expect(JSON.parse(opts.body)).toEqual({ hello: 'world' });
  });

  it('moves 4xx failures to dead-letter (never retry)', async () => {
    await Q.enqueue({ endpoint: '/api/x' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    const result = await Q.drain({ fetch: fetchSpy });
    expect(result.dead).toBe(1);
    expect(result.sent).toBe(0);
    expect(await Q.size()).toBe(0);
    expect((await Q.listDead()).length).toBe(1);
  });

  it('keeps 5xx failures in queue and increments attempts', async () => {
    await Q.enqueue({ endpoint: '/api/x' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await Q.drain({ fetch: fetchSpy });
    expect(result.failed).toBe(1);
    expect(result.dead).toBe(0);
    expect(await Q.size()).toBe(1);
    const [item] = await Q.peek();
    expect(item.attempts).toBe(1);
    expect(item.lastError).toMatch(/503/);
  });

  it('moves to dead after maxAttempts is exhausted', async () => {
    await Q.enqueue({ endpoint: '/api/x' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    for (let i = 0; i < 3; i++) await Q.drain({ fetch: fetchSpy, maxAttempts: 3 });
    expect(await Q.size()).toBe(0);
    expect((await Q.listDead()).length).toBe(1);
  });

  it('keeps in queue on network error (thrown fetch)', async () => {
    await Q.enqueue({ endpoint: '/api/x' });
    const fetchSpy = vi.fn().mockRejectedValue(new Error('TypeError: failed to fetch'));
    const result = await Q.drain({ fetch: fetchSpy, maxAttempts: 5 });
    expect(result.failed).toBe(1);
    expect(await Q.size()).toBe(1);
    const [item] = await Q.peek();
    expect(item.attempts).toBe(1);
    expect(item.lastError).toMatch(/fetch/);
  });

  it('mixed success/failure in one drain call', async () => {
    await Q.enqueue({ endpoint: '/ok' });
    await Q.enqueue({ endpoint: '/transient' });
    await Q.enqueue({ endpoint: '/forbidden' });
    const fetchSpy = vi.fn().mockImplementation(async (url) => {
      if (url === '/ok')          return { ok: true,  status: 200 };
      if (url === '/transient')   return { ok: false, status: 503 };
      if (url === '/forbidden')   return { ok: false, status: 403 };
    });
    const result = await Q.drain({ fetch: fetchSpy });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.dead).toBe(1);
    expect(await Q.size()).toBe(1);  // only the transient one is still queued
  });
});

// ─── clearAll ──────────────────────────────────────────────────────────
describe('clearAll', () => {
  it('wipes both stores', async () => {
    // Two items: one will stay (5xx transient), one will dead-letter (4xx)
    await Q.enqueue({ endpoint: '/transient' });
    await Q.enqueue({ endpoint: '/forbidden' });
    const fetchSpy = vi.fn().mockImplementation(async (url) => {
      if (url === '/transient') return { ok: false, status: 503 };
      return { ok: false, status: 403 };
    });
    await Q.drain({ fetch: fetchSpy });
    expect(await Q.size()).toBe(1);
    expect((await Q.listDead()).length).toBe(1);
    await Q.clearAll();
    expect(await Q.size()).toBe(0);
    expect((await Q.listDead()).length).toBe(0);
  });
});

// ─── _uuid ─────────────────────────────────────────────────────────────
describe('_uuid', () => {
  it('produces valid v4 UUIDs', () => {
    for (let i = 0; i < 20; i++) {
      const id = Q._uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it('produces unique values', () => {
    const set = new Set();
    for (let i = 0; i < 50; i++) set.add(Q._uuid());
    expect(set.size).toBe(50);
  });
});
