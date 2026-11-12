import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
const usage = require('../../lib/ai-usage');
const ai = require('../../lib/ai');

describe('ai usage meter', () => {
  beforeEach(() => usage._reset());
  it('prices Claude with cache reads at a tenth and OpenAI mini cheaply', () => {
    expect(usage.costOf('claude-sonnet-5-5', { input: 1e6 })).toBe(3);
    expect(usage.costOf('claude-sonnet-5-5', { cache_read: 1e6 })).toBeCloseTo(0.3);
    expect(usage.costOf('claude-haiku-4-5', { output: 1e6 })).toBe(5);
    expect(usage.costOf('gpt-4.1-mini', { input: 1e6, output: 1e6 })).toBeCloseTo(2);
  });
  it('names the calling feature from the stack', () => {
    const st = 'Error\n    at x (/app/lib/ai.js:10:1)\n    at y (/app/lib/ai-usage.js:3:1)\n    at work (/app/lib/voip-project.js:380:20)';
    expect(usage.callerFeature(st)).toBe('voip-project');
    expect(usage.callerFeature('Error\n    at z (/app/server.js:1:1)')).toBe('server');
  });
  it('adds up by feature and provider', async () => {
    await usage.record({ feature: 'call-qa', model: 'claude-sonnet-5-5', usage: { input_tokens: 1e6, output_tokens: 0 } });
    await usage.record({ feature: 'voip-project', model: 'gpt-4.1-mini', usage: { input_tokens: 1e6, output_tokens: 0 } });
    const r = await usage.report({ days: 1 });
    expect(r.features[0].feature).toBe('call-qa');
    expect(r.byProvider).toEqual({ claude: 3, openai: 0.4 });
  });
  it('compares short fields only, and turns a drifting light feature back to the main model', async () => {
    expect(usage.agreement({ voip: true, category: 'Phones', summary: 'a long text '.repeat(10) }, { voip: true, category: 'phones', summary: 'other' })).toBe(1);
    expect(usage.agreement({ voip: true, real: false }, { voip: true, real: true })).toBe(0.5);
    for (let i = 0; i < 8; i++) await usage.addShadow('voip-project', 1);
    expect(usage.lightOk('voip-project')).toBe(true);
    for (let i = 0; i < 12; i++) await usage.addShadow('voip-project', 0.5);
    expect(usage.lightOk('voip-project')).toBe(false);
  });
});

describe('claudeJSON routing', () => {
  const env = { ...process.env };
  let calls;
  beforeEach(() => {
    usage._reset(); calls = [];
    process.env.ANTHROPIC_API_KEY = 'k'; delete process.env.OPENAI_API_KEY; process.env.AI_LIGHT_PROVIDER = 'anthropic'; process.env.AI_SHADOW_RATE = '0';
    global.fetch = vi.fn(async (url, o) => {
      const b = JSON.parse(o.body); calls.push(b);
      if (b.model === 'claude-haiku-4-5' && globalThis.__haikuFails) return { ok: false, status: 404, json: async () => ({ error: { type: 'not_found_error' } }) };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 10, output_tokens: 2 } }) };
    });
  });
  afterEach(() => { process.env = { ...env }; globalThis.__haikuFails = false; });
  it('caches the system prompt and keeps heavy features on the main model', async () => {
    await ai.claudeJSON({ system: 'S', user: 'U', feature: 'expert' });
    expect(calls[0].model).toBe(ai.ANTHROPIC_MODEL);
    expect(calls[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
  it('sends light features to the light model, and falls back to the main model when it fails', async () => {
    await ai.claudeJSON({ system: 'S', user: 'U', feature: 'voip-project' });
    expect(calls[0].model).toBe('claude-haiku-4-5');
    globalThis.__haikuFails = true; calls = [];
    const r = await ai.claudeJSON({ system: 'S', user: 'U', feature: 'voip-project' });
    expect(calls.map((c) => c.model)).toEqual(['claude-haiku-4-5', ai.ANTHROPIC_MODEL]);
    expect(r.json.ok).toBe(true);
  });
});
