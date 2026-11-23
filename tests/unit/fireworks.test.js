import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const ai = require('../../lib/ai');
const U = require('../../lib/ai-usage');

describe('Fireworks provider (Batch 399)', () => {
  const realFetch = global.fetch;
  const env = { ...process.env };
  let calls;
  beforeEach(() => {
    calls = [];
    process.env.ANTHROPIC_API_KEY = 'a';
    process.env.FIREWORKS_API_KEY = 'f';
    process.env.FIREWORKS_MODEL = 'accounts/x/models/deepseek';
    global.fetch = async (url, o) => {
      calls.push(String(url));
      if (/fireworks/.test(url)) return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"fw"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }) };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"answer":"claude"}' }], usage: { input_tokens: 100, output_tokens: 10 } }) };
    };
  });
  afterEach(() => { global.fetch = realFetch; process.env = { ...env }; });

  it('is off unless a feature is listed', async () => {
    delete process.env.FIREWORKS_FEATURES;
    const r = await ai.claudeJSON({ system: 's', user: 'u', feature: 'call-qa' });
    expect(r.json.answer).toBe('claude');
    expect(calls.some((u) => /fireworks/.test(u))).toBe(false);
  });
  it('a listed feature goes to Fireworks', async () => {
    process.env.FIREWORKS_FEATURES = 'call-qa,live-chat';
    const r = await ai.claudeJSON({ system: 's', user: 'u', feature: 'call-qa' });
    expect(r.provider).toBe('fireworks');
    expect(r.json.answer).toBe('fw');
  });
  it('a Fireworks error falls back to Claude', async () => {
    process.env.FIREWORKS_FEATURES = '*';
    const f = global.fetch;
    global.fetch = async (url, o) => (/fireworks/.test(url) ? { ok: false, status: 500, json: async () => ({ error: { message: 'down' } }) } : f(url, o));
    const r = await ai.claudeJSON({ system: 's', user: 'u', feature: 'expert' });
    expect(r.json.answer).toBe('claude');
  });
  it('the before and after test can force it on or off', async () => {
    delete process.env.FIREWORKS_FEATURES;
    const on = await U.meter(() => ai.claudeJSON({ system: 's', user: 'u', feature: 'expert' }), { forceFireworks: true });
    expect(on.value.provider).toBe('fireworks');
    process.env.FIREWORKS_FEATURES = '*';
    const off = await U.meter(() => ai.claudeJSON({ system: 's', user: 'u', feature: 'expert' }), { noFireworks: true });
    expect(off.value.json.answer).toBe('claude');
  });
  it('prices Fireworks usage at its own rate', () => {
    expect(U.kindOf('fireworks:accounts/x/models/deepseek')).toBe('fireworks');
    expect(U.costOf('fireworks:m', { input: 1e6, output: 1e6 })).toBeCloseTo(1.5, 5);
  });
});
