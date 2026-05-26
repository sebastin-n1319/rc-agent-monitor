// Unit test for the structured logger.
// Validates JSON shape, severity gating, and error serialization.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let log;
beforeEach(async () => {
  vi.resetModules();
  // Force info level for tests
  process.env.LOG_LEVEL = 'info';
  const mod = await import('../../lib/logger.js');
  log = mod.log;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('emits a JSON line at info level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('test_event', { foo: 'bar' });
    expect(spy).toHaveBeenCalledOnce();
    const json = JSON.parse(spy.mock.calls[0][0]);
    expect(json.severity).toBe('info');
    expect(json.event).toBe('test_event');
    expect(json.foo).toBe('bar');
    expect(json.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('routes errors to stderr', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.error('boom', new Error('test'));
    expect(errSpy).toHaveBeenCalledOnce();
    expect(outSpy).not.toHaveBeenCalled();
  });

  it('serializes error with stack snippet', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('db down');
    err.code = 'ECONNREFUSED';
    log.error('db_fail', err, { query: 'SELECT 1' });
    const json = JSON.parse(spy.mock.calls[0][0]);
    expect(json.error.message).toBe('db down');
    expect(json.error.code).toBe('ECONNREFUSED');
    expect(json.error.stack).toBeTruthy();
    expect(json.query).toBe('SELECT 1');
  });

  it('skips debug at info level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.debug('quiet', { hidden: true });
    expect(spy).not.toHaveBeenCalled();
  });
});
