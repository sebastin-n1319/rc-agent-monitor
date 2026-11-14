import { describe, it, expect } from 'vitest';
const V = require('../../lib/expert-vectors.js');

describe('Expert meaning search (Batch 337)', () => {
  it('embeds chunks once, finds the chunk closest in meaning, and re-embeds only what changed', async () => {
    process.env.OPENAI_API_KEY = 'test'; process.env.EXPERT_HYBRID = 'on'; V._reset(); V.setDB(null);
    let sent = 0;
    // a tiny fake embedding: [texting failures, phones, forms]
    const vec = (t) => [/(undeliver|fail|not deliver|bounce)/i.test(t) ? 1 : 0, /(phone|handset|ring)/i.test(t) ? 1 : 0, /form/i.test(t) ? 1 : 0.01];
    V._setFetch(async (u, o) => { const inp = JSON.parse(o.body).input; sent += inp.length; return { ok: true, status: 200, json: async () => ({ data: inp.map((t, i) => ({ index: i, embedding: vec(t) })), usage: { prompt_tokens: 10 } }) }; });
    const docs = [
      { src: 'kb', id: '1', section: '', title: 'Text messages failed to send', module: 'Engage', text: 'Why a text shows failed.' },
      { src: 'kb', id: '2', section: '', title: 'Desk phone not ringing', module: 'Voice', text: 'Check the handset.' },
      { src: 'kb', id: '3', section: '', title: 'Patient forms', module: 'Forms', text: 'Send a form.' },
    ];
    await V.sync(docs);
    expect(sent).toBe(3);
    const n = await V.nearest('messages in engage show undelivered');
    expect(n[0].key).toBe('kb:1:');
    await V.sync(docs);
    expect(sent).toBe(4); // only the question was embedded since; unchanged chunks are not sent again
    docs[2].text = 'Send a patient form by text.';
    await V.sync(docs);
    expect(sent).toBe(5);
    delete process.env.EXPERT_HYBRID;
    expect(V.enabled()).toBe(false); // off unless turned on
    delete process.env.OPENAI_API_KEY;
  });
});
