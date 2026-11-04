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
    expect(b.gap).toBe('');
    expect(b.answer.say).toMatch(/^Hi there/);
    expect(calls.some(c => /route/.test(c))).toBe(false); // no new plan or search
  });
  it('does not reuse another person\'s answer', async () => {
    const a = await ex.ask({ question: 'How do reminders work for new patients?', email: 'a@adit.com', mode: 'chat' });
    const b = await ex.ask({ question: 'How do reminders work for new patients?', email: 'b@adit.com', mode: 'email', reuse: a.logId });
    expect(b.rewritten).toBe(false);
  });
});

describe.skipIf(!sqlite3)('expert learns the #422530 lessons (Batch 239)', () => {
  it('seeds the reply-to, act-first and onboarding rules', async () => {
    const titles = (await ex.rules()).map(r => r.title);
    expect(titles).toEqual(expect.arrayContaining(['Reply to the practice, not the person who forwarded it', 'Act first, then reply with what was arranged', 'Onboarding complaints and a change of onboarding specialist']));
  });
});

describe.skipIf(!sqlite3)('analyst-style ticket review (Batch 240)', () => {
  it('runs the pattern check for a ticket and returns findings, cluster and ranked actions', async () => {
    const goals = [];
    const inv2 = { isConfigured: () => true, needsLookup: () => false, investigate: async (o) => { goals.push(o.goal || ''); return { summary: 'CLUSTER:\n#423436 | Align Dental Care | Pending Adit | DST\nPATTERN: one platform issue', steps: [{ what: 'Looked up desk_tickets', ok: true }], ms: 1000 }; } };
    const tk = { meta: { number: '423761', subject: 'Time incorrect on Reminder Text', channel: 'Chat', account: 'Sage Dental' }, text: 'Client: messages go out for the wrong time', lastClient: 'wrong time', prior: [], timeline: [] };
    let seenUser = '';
    const ai2 = { anyConfigured: () => true, isAnthropicConfigured: () => true, chatJSON: async () => ({ json: { verdict: 'ok' } }),
      bestJSON: async (o) => { if (/route questions/.test(o.system)) return { json: { search: 'reminder time', alt: [], intent: 'troubleshoot' } };
        if (!/in-house/.test(o.system)) return { json: { verdict: 'ok' } };
        seenUser = o.user;
        return { provider: 'anthropic', json: { answer: 'Defect, part of a cluster with #423436, like #999999.', steps: [], say: 'Hi Kristyn,', found: true, confidence: 'high', ticket: { summary: 's', verdict: 'A product defect, part of a live cluster', confidence: 'high',
          findings: [{ title: 'Part of a cluster', evidence: '#423436 also', driver: 'DST', impact: 'wrong texts', recommendation: 'one engineering report', confidence: 'high' }],
          cluster: [{ number: '#423436', account: 'Align Dental Care', status: 'Pending Adit', note: 'DST' }], fix_check: 'Settings link is the wrong fix', classification: 'Technical Issues and Bugs',
          actions: [{ kind: 'immediate', text: 'Restore reminders' }, { kind: 'bogus', text: 'x' }], limits: ['root cause not confirmed'] } } }; } };
    ex.setDeps({ ai: ai2, investigate: inv2, ticket: { detect: (q) => (/\d{6}/.exec(q) || [null])[0], load: async () => tk } });
    const r = await ex.ask({ question: '#423761 - how to handle this ticket?', email: 'a@adit.com' });
    expect(goals).toContain('pattern');
    expect(seenUser).toMatch(/same problem across Adit/i);
    expect(r.pattern.summary).toMatch(/423436/);
    const T = r.answer.ticket;
    expect(T.verdict).toMatch(/defect/);
    expect(T.cluster[0].number).toBe('423436');
    expect(T.actions.map(a => a.kind)).toEqual(['immediate', '']);
    expect(T.findings[0].title).toBe('Part of a cluster');
    expect(T.limits).toEqual(['root cause not confirmed']);
    expect(r.unverified).toEqual(['999999']);
    expect(r.gap).toBe('');
  });
});
