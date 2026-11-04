import { describe, it, expect, beforeAll } from 'vitest';
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }
const ex = require('../../lib/expert.js');

describe.skipIf(!sqlite3)('expert ask: channel and rewrite (Batch 238)', () => {
  let calls = [];
  const ai = { anyConfigured: () => true, isAnthropicConfigured: () => true, isConfigured: () => false,
    bestJSON: async (o) => { calls.push(o.system.slice(0, 20)); if (/route questions/.test(o.system)) return { json: { search: 'text forwarding', alt: [], module: '', intent: 'howto' } };
      if (/check/i.test(o.system.slice(0, 200)) && !/in-house/.test(o.system)) return { json: { verdict: 'ok', issues: [] } };
      return { json: { answer: 'Forwarding texts is done by the team.', steps: ['a'], say: /PHONE CALL/.test(o.user) ? 'spoken' : /TICKET by EMAIL/.test(o.user) ? 'Hi there,\n\nemail' : '', found: true, confidence: 'high', sources: [] }, provider: 'anthropic' }; },
    chatJSON: async () => ({ json: { verdict: 'ok' } }) };
  const inv = { isConfigured: () => false, needsLookup: () => false };
  beforeAll(async () => {
    ex.setDB(new sqlite3.Database(':memory:')); await ex.initSchema();
    ex.setDeps({ ai, investigate: inv, ticket: { detect: () => null, load: async () => { throw new Error('none'); } } });
  });
  it('answers plainly when no channel is picked, then rewrites for email without searching again', async () => {
    const a = await ex.ask({ question: 'How can the office forward text messages to another number?', email: 'a@adit.com' });
    expect(a.mode).toBe('answer');
    expect(a.logId).toBeTruthy();
    calls = [];
    const b = await ex.ask({ question: 'How can the office forward text messages to another number?', email: 'a@adit.com', mode: 'email', modeLocked: true, reuse: a.logId });
    expect(b.mode).toBe('email');
    expect(b.rewritten).toBe(true);
    expect(b.answer.say).toMatch(/^Hi there/);
    expect(calls.some(c => /route/.test(c))).toBe(false); // no new plan or search
  });
  it('does not reuse another person\'s answer', async () => {
    const a = await ex.ask({ question: 'How do reminders work for new patients?', email: 'a@adit.com', mode: 'chat' });
    const b = await ex.ask({ question: 'How do reminders work for new patients?', email: 'b@adit.com', mode: 'email', reuse: a.logId });
    expect(b.rewritten).toBe(false);
  });
});
