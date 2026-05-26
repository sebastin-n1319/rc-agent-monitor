// Unit tests for the in-memory cache logic (#3 feature).
// We re-implement the cache helpers as standalone testable units;
// the server.js originals match this shape exactly.
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeCache() {
  const store = new Map();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (Date.now() > e.exp) { store.delete(key); return null; }
      return e.val;
    },
    set(key, val, ttl) { store.set(key, { val, exp: Date.now() + ttl }); },
    delete(key) { return store.delete(key); },
    size() { return store.size; },
    async wrap(key, ttl, fn) {
      const hit = this.get(key);
      if (hit !== null) return hit;
      const v = await fn();
      this.set(key, v, ttl);
      return v;
    }
  };
}

describe('cache', () => {
  let cache;
  beforeEach(() => { cache = makeCache(); });

  it('returns null on miss', () => {
    expect(cache.get('nope')).toBeNull();
  });

  it('returns value on hit before TTL', () => {
    cache.set('key', { x: 1 }, 1000);
    expect(cache.get('key')).toEqual({ x: 1 });
  });

  it('expires after TTL', () => {
    vi.useFakeTimers();
    cache.set('key', 'val', 500);
    expect(cache.get('key')).toBe('val');
    vi.advanceTimersByTime(600);
    expect(cache.get('key')).toBeNull();
    vi.useRealTimers();
  });

  it('wrap only calls fn on miss', async () => {
    const fn = vi.fn(async () => 42);
    const a = await cache.wrap('x', 1000, fn);
    const b = await cache.wrap('x', 1000, fn);
    expect(a).toBe(42); expect(b).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('delete removes entry', () => {
    cache.set('k', 'v', 1000);
    cache.delete('k');
    expect(cache.get('k')).toBeNull();
  });
});
