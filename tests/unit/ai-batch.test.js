import { describe, it, expect } from 'vitest';
const AB = require('../../lib/ai-batch.js');
const usage = require('../../lib/ai-usage.js');

describe('Message Batches (Batch 343)', () => {
  it('sends queued requests as one batch, returns each answer, and records the half-price usage', async () => {
    process.env.ANTHROPIC_API_KEY = 'test'; process.env.AI_BATCH_POLL_MS = '1'; AB._reset(); usage._reset();
    const sent = [];
    AB._setFetch(async (url, o) => {
      if (/batches$/.test(url) && o && o.method === 'POST') { const b = JSON.parse(o.body); sent.push(b.requests.map((r) => r.custom_id)); return { ok: true, status: 200, json: async () => ({ id: 'b1' }) }; }
      if (/batches\/b1$/.test(url)) return { ok: true, json: async () => ({ processing_status: 'ended', results_url: 'https://x/results' }) };
      if (url === 'https://x/results') return { ok: true, text: async () => sent[0].map((id, i) => JSON.stringify({ custom_id: id, result: { type: 'succeeded', message: { content: [{ type: 'text', text: '{"n":' + i + '}' }], usage: { input_tokens: 1000000, output_tokens: 0 } } } })).join('\n') };
      throw new Error('unexpected ' + url);
    });
    const a = AB.submit({ model: 'claude-sonnet-5-5', max_tokens: 10, messages: [] }, { feature: 'ticket-triage' });
    const b = AB.submit({ model: 'claude-sonnet-5-5', max_tokens: 10, messages: [] }, { feature: 'ticket-triage' });
    await AB.flush();
    const [ra, rb] = await Promise.all([a, b]);
    expect(sent.length).toBe(1);
    expect(ra.content[0].text).toBe('{"n":0}'); expect(rb.content[0].text).toBe('{"n":1}');
    expect(usage.costOf('claude-sonnet-5-5:batch', { input: 1e6 })).toBe(1); // half of $2
    expect(AB.status()).toMatchObject({ done: 2, failed: 0, batches: 1 });
  });
  it('a failed batch rejects, so the caller falls back to a normal call', async () => {
    AB._reset();
    AB._setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const p = AB.submit({ model: 'm', max_tokens: 1, messages: [] });
    await AB.flush();
    await expect(p).rejects.toThrow('batch create failed');
    delete process.env.ANTHROPIC_API_KEY;
  });
});
