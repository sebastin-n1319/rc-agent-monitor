import { describe, it, expect } from 'vitest';
const usage = require('../../lib/ai-usage.js');

describe('Hour-long prompt cache (Batch 346)', () => {
  it('asks for the 1-hour cache, and falls back to 5 minutes if the API refuses it', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const ai = require('../../lib/ai.js');
    const bodies = []; const real = global.fetch;
    global.fetch = async (url, o) => {
      const b = JSON.parse(o.body); bodies.push(b);
      if (bodies.length === 1) return { ok: false, status: 400, json: async () => ({ error: { type: 'invalid_request_error', message: 'cache_control.ttl: not supported' } }) };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 10, output_tokens: 5 } }) };
    };
    try {
      const r = await ai.claudeJSON({ system: 'S', user: 'U', feature: 'expert', cacheTtl: '1h' });
      expect(r.json.ok).toBe(true);
      expect(bodies[0].system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
      expect(bodies[1].system[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(ai.cacheCtl('1h')).toEqual({ type: 'ephemeral' }); // stays off after a refusal
    } finally { global.fetch = real; delete process.env.ANTHROPIC_API_KEY; }
  });
  it('prices hour-long cache writes at 2x input', async () => {
    usage._reset();
    await usage.record({ feature: 'expert', model: 'claude-sonnet-5-5', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1e6, cache_creation: { ephemeral_1h_input_tokens: 1e6 } } });
    const r = await usage.report({ days: 1 });
    expect(r.features[0].cost).toBeCloseTo(4, 1); // 1M tokens x $2 x 2
  });
});
