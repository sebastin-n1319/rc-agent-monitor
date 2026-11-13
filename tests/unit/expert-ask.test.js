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
  it('Fast skips the second check; Auto picks Thinking for a why question', async () => {
    calls = [];
    const f = await ex.ask({ question: 'Where do I change the reminder time for appointments?', email: 'a@adit.com', depth: 'fast', fresh: true });
    expect(f.depth).toBe('fast');
    expect(calls.some(c => /second reviewer/.test(c) || /You are the s/.test(c))).toBe(false);
    const t = await ex.ask({ question: 'Why do reminder texts go out at the wrong time for some offices?', email: 'a@adit.com', fresh: true });
    expect(t.depth).toBe('thinking');
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
    const tk = { meta: { number: '423761', subject: 'Time incorrect on Reminder Text', channel: 'Chat', account: 'Sage Dental', asanaLinks: ['https://app.asana.com/0/123/1209876543210'] }, text: 'Client: messages go out for the wrong time', lastClient: 'wrong time', prior: [], timeline: [] };
    let seenUser = '';
    const ai2 = { anyConfigured: () => true, isAnthropicConfigured: () => true, chatJSON: async () => ({ json: { verdict: 'ok' } }),
      bestJSON: async (o) => { if (/route questions/.test(o.system)) return { json: { search: 'reminder time', alt: [], intent: 'troubleshoot' } };
        if (!/in-house/.test(o.system)) return { json: { verdict: 'ok' } };
        seenUser = o.user;
        return { provider: 'anthropic', json: { answer: 'Defect, part of a cluster with #423436, like #999999.', steps: [], say: 'Hi Kristyn,', found: true, confidence: 'high', ticket: { summary: 's', verdict: 'A product defect, part of a live cluster', confidence: 'high',
          findings: [{ title: 'Part of a cluster', evidence: '#423436 also', driver: 'DST', impact: 'wrong texts', recommendation: 'one engineering report', confidence: 'high' }],
          cluster: [{ number: '#423436', account: 'Align Dental Care', status: 'Pending Adit', note: 'DST' }], fix_check: 'Settings link is the wrong fix', classification: 'Technical Issues and Bugs',
          actions: [{ kind: 'immediate', text: 'Restore reminders' }, { kind: 'bogus', text: 'x' }], limits: ['root cause not confirmed'] } } }; } };
    const TT = require('../../lib/ticket-triage');
    const triage = { _asanaGid: TT._asanaGid, _asanaText: TT._asanaText, _asanaTask: async (l) => ({ gid: TT._asanaGid(l), read: true, name: 'Fix reminder time', completed: false, doneColumn: false, due: '2026-11-20', assignee: 'Dev Team', modified: '', sections: ['Bugs > In progress'], fields: [], notes: '', updates: ['2026-11-12 Dev commented: fix in QA'] }) };
    ex.setDeps({ ai: ai2, investigate: inv2, triage, ticket: { detect: (q) => (/\d{6}/.exec(q) || [null])[0], load: async () => tk } });
    const r = await ex.ask({ question: '#423761 - how to handle this ticket?', email: 'a@adit.com' });
    expect(seenUser).toMatch(/Asana task 1209876543210: Fix reminder time[\s\S]*due 2026-11-20[\s\S]*fix in QA/);
    ex.setDeps({ triage: null });
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
    expect(r.trace.map(t => t.step).join(' | ')).toMatch(/Read ticket #423761[\s\S]*Checked other practices[\s\S]*Wrote the answer/);
    expect(r.gap).toBe('');
  });
});

describe('Aria thesis brief for support (Batch 244)', () => {
  it('reads who decides, how to approach, next steps and open promises, without refs or contact details', async () => {
    ex.setDeps({ query: async (sql) => { expect(sql).toMatch(/j_account_id = '1607362002063490840'/); return { rows: [{ saved_at: '2026-11-04T21:51:00Z', ap: { decision_maker: 'Dr. Sean Perry, who signed [C4e04824a@14:03][E:Agreements/X].', how_to_approach: 'Talk to Dr. Sean Perry directly; call 704-873-6451 [C5ba36079@00:00].', posture: 'receptive' },
      ns: [{ action: 'Work ticket 423716 to completion', urgency: 'now', owner: 'Onboarding', why: 'Pending Customer [E:Porting/PORT-1]' }],
      pr: [{ what: 'A call in the lunch window', status: 'unclear', promised_by: 'Manny Parker', promised_on: '2026-10-23' }, { what: 'Hardware credit', status: 'kept' }], cm: { level: 'happy', why: 'Engaged [T424775]' }, fr: [] }] }; } });
    const b = await ex._thesisBrief('1607362002063490840');
    expect(b).toMatch(/Who decides: Dr\. Sean Perry, who signed\./);
    expect(b).toMatch(/Talk to Dr\. Sean Perry directly; call \[phone\]\./);
    expect(b).toMatch(/\[now, Onboarding\] Work ticket 423716/);
    expect(b).toMatch(/\[unclear\] A call in the lunch window \(Manny Parker, 2026-10-23\)/);
    expect(b).not.toMatch(/Hardware credit/);
    expect(b).not.toMatch(/\[C|\[E:|\[T4/);
  });
});

describe('cut-off AI answers are kept (Batch 245)', () => {
  it('closes an answer cut off at the length limit instead of losing it', () => {
    const ai = require('../../lib/ai');
    const j = ai._parseJSONLoose('{"answer":"a","say":"Hi Dr. Perry,","ticket":{"findings":[{"title":"t","evidence":"cut here');
    expect(j.say).toBe('Hi Dr. Perry,');
    expect(j.ticket.findings[0].evidence).toBe('cut here');
    expect(j._truncated).toBe(true);
  });
});

describe.skipIf(!sqlite3)('short answer first, general answers flagged (Batch 271)', () => {
  it('returns the brief, flags a general answer and searches how the team handled it before', async () => {
    const goals = []; let seenUser = '';
    const inv = { isConfigured: () => true, needsLookup: () => false, investigate: async (o) => { goals.push(o.goal || 'account'); return { summary: o.goal === 'precedent' ? 'FINDINGS:\n- #400837: VoIP confirmed with the decision maker before changing [Desk ticket #400837]' : 'ACCOUNT: not found\nFINDINGS: none', steps: [{ what: 'x', ok: true }], ms: 10 }; } };
    const ai = { anyConfigured: () => true, isAnthropicConfigured: () => true, isConfigured: () => false, chatJSON: async () => ({ json: { verdict: 'ok' } }),
      bestJSON: async (o) => { if (/route questions/.test(o.system)) return { json: { search: 'call flow change on behalf', alt: [], intent: 'process' } };
        if (/second reviewer/.test(o.system)) return { json: { verdict: 'ok', issues: [] } };
        seenUser = o.user;
        return { json: { brief: { bottom_line: 'Usually VoIP makes it after the owner approves.', found: ['#400837: VoIP confirmed first'], reply_label: 'Reply to Derek', reply: 'Hi Derek, 1. Raise it to VoIP.', unknown: ['Who the authorized contacts are'] }, answer: 'VoIP handles it.', steps: ['a'], found: true, confidence: 'medium', sources: [] }, provider: 'anthropic' }; } };
    ex.setDeps({ ai, investigate: inv, ticket: { detect: () => null, load: async () => { throw new Error('none'); } } });
    const a = await ex.ask({ question: 'Client insists another rep did it before, can we change the call flow on their behalf?', email: 'a@adit.com', fresh: true });
    expect(goals).toContain('precedent');
    expect(a.scope).toBe('general');
    expect(seenUser).toMatch(/NO ACCOUNT WAS CHECKED/);
    expect(a.answer.brief).toMatchObject({ reply_label: 'Reply to Derek', found: ['#400837: VoIP confirmed first'] });
    expect(a.precedent.summary).toMatch(/400837/);
  });
});

describe.skipIf(!sqlite3)('Serene Dental lessons (Batch 272)', () => {
  it('seeds the onboarding phone change and approval rules, and keeps extra messages', async () => {
    const r = await ex.rules();
    const t = r.map(x => x.title);
    expect(t).toEqual(expect.arrayContaining(['Phone setup changes on accounts still in onboarding', 'Who can approve a change to the account']));
    expect(r.find(x => x.title === 'T1 cannot make outbound calls').body).toMatch(/account CSM/);
  });
});

describe.skipIf(!sqlite3)('learning rules from past handling (Batch 274)', () => {
  it('turns consistent reviewer decisions into rules with evidence, and skips weak ones', async () => {
    const db = new sqlite3.Database(':memory:'); ex.setDB(db); await ex.initSchema();
    const run = (sql, p = []) => new Promise((rs, rj) => db.run(sql, p, e => e ? rj(e) : rs()));
    await run(`CREATE TABLE tr_reviews (id INTEGER PRIMARY KEY, ticket_number TEXT, subject TEXT, channel TEXT, to_team TEXT, verdict TEXT, severity TEXT, comment TEXT, reviewed_at TEXT, voided INTEGER DEFAULT 0)`);
    for (const n of ['1', '2', '3', '4']) await run(`INSERT INTO tr_reviews (ticket_number, subject, to_team, verdict, comment, reviewed_at) VALUES (?,?,?,?,?, datetime('now'))`, ['42000' + n, 'Change voicemail greeting', 'VoIP', 'invalid', 'Help Center covers greetings, T1 handles']);
    let sent = '';
    ex.setDeps({ ai: { anyConfigured: () => true, bestJSON: async (o) => { if (/You write team rules/.test(o.system)) sent = o.user; return { json: { rules: [
      { title: 'Voicemail greeting changes stay in T1', body: 'Greeting changes are in the Help Center, so T1 completes them.', module: 'Adit Voice', evidence: ['420001', '420002', '420003'], count: 4 },
      { title: 'Weak rule', body: 'Only one ticket says so.', evidence: ['1'], count: 1 }], conflicts: [] } }; } } });
    const r = await ex.learnRules({ by: 'test' });
    expect(sent).toMatch(/TRANSFER #420001/);
    expect(r.added.map(x => x.title)).toEqual(['Voicemail greeting changes stay in T1']);
    expect(r.added[0].body).toMatch(/Learned from 4 reviewer decisions, for example #420001/);
    expect((await ex.rules()).some(x => x.title === 'Voicemail greeting changes stay in T1')).toBe(true);
    expect((await ex.rules()).some(x => x.title === 'What Adit Pay posts to the EHR')).toBe(true);
    expect((await ex.learnStatus()).added).toEqual(['Voicemail greeting changes stay in T1']);
  });
});

describe.skipIf(!sqlite3)('lead review of a ticket (Batch 276)', () => {
  it('searches the whole history and answers the lead, not as a call script', async () => {
    const asks = []; let user = '';
    const inv = { isConfigured: () => true, needsLookup: () => false, investigate: async (o) => { asks.push(o.question); return { summary: 'ACCOUNT: Glendale Dental\nFINDINGS:\n- #345923 Apr 2026: Greg changed the Form Request Template [Desk ticket #345923]', steps: [{ what: 'x', ok: true }], ms: 5 }; } };
    const tk = { meta: { number: '427211', subject: 'Medical history form', channel: 'Phone', account: 'Glendale Dental' }, text: 'Client: New Patient Forms say yearly medical update', lastClient: 'fix asap', prior: [], timeline: [] };
    ex.setDeps({ ai: { anyConfigured: () => true, isAnthropicConfigured: () => true, isConfigured: () => false, chatJSON: async () => ({ json: { verdict: 'ok' } }),
      bestJSON: async (o) => { if (/route questions/.test(o.system)) return { json: { search: 'form request template', alt: [], intent: 'process' } }; if (/second reviewer/.test(o.system)) return { json: { verdict: 'ok' } }; user = o.user; return { json: { brief: { bottom_line: 'Cause is #345923.', found: ['#345923'], reply_label: 'Reply to Lincy', reply: 'Hi Lincy', replies: [{ label: 'Coaching (keep private)', text: 'Read history first.' }] }, answer: 'x', found: true, confidence: 'high', sources: [] }, provider: 'anthropic' }; } },
      investigate: inv, ticket: { detect: (q) => (/\d{6}/.exec(q) || [null])[0], load: async () => tk } });
    const a = await ex.ask({ question: '#427211 - how to handle this better?', email: 'a@adit.com', depth: 'thinking', fresh: true });
    expect(asks[0]).toMatch(/WHOLE ticket history/);
    expect(user).toMatch(/LEAD REVIEW/);
    expect(a.mode).toBe('answer');
    expect(a.answer.brief.replies[0].label).toMatch(/Coaching/);
  });
});

describe('lead questions (Batch 278)', () => {
  it('treats asking for a suggestion for an agent as a lead review', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../lib/expert.js'), 'utf8');
    const re = eval(src.match(/const REVIEW_RE = (\/.*\/i);/)[1]);
    expect(re.test('#427294 - what suggestion I can give sabrina to handle this ticket')).toBe(true);
    expect(re.test('#427294 forward texts to another number')).toBe(false);
    expect(src).toMatch(/starts with a "Don't" line/);
  });
});

describe.skipIf(!sqlite3)('several tickets in one question (Batch 279)', () => {
  it('reads both in full and asks for a reply and a note for each', async () => {
    const loads = []; let user = '';
    const mk = (n, s) => ({ meta: { number: n, subject: s, channel: 'Email', account: 'Perla Dental Studio' }, text: 'Client asks ' + s, lastClient: s, prior: [], timeline: [] });
    ex.setDeps({ ai: { anyConfigured: () => true, isAnthropicConfigured: () => true, isConfigured: () => false, chatJSON: async () => ({ json: { verdict: 'ok' } }),
      bestJSON: async (o) => { if (/route questions/.test(o.system)) return { json: { search: 'mass text pricing', alt: [], intent: 'process' } }; if (/second reviewer/.test(o.system)) return { json: { verdict: 'ok' } }; user = o.user; return { json: { brief: { bottom_line: 'x', found: [], reply: 'Hi Sabrina', replies: [{ label: '#428073 client reply', text: 'a' }, { label: '#428073 internal note', text: 'b' }, { label: '#428078 client reply', text: 'c' }, { label: '#428078 internal note', text: 'd' }] }, answer: 'x', found: true, confidence: 'high', sources: [] }, provider: 'anthropic' }; } },
      investigate: { isConfigured: () => false, needsLookup: () => false },
      ticket: { detect: (q) => (/\d{6}/.exec(q) || [null])[0], detectAll: (q) => q.match(/\d{6}/g) || [], load: async (n, o) => { loads.push([n, !!(o && o.deep)]); return mk(n, n === '428073' ? 'ChatGPT integration' : 'Bulk text pricing'); } } });
    const a = await ex.ask({ question: '#428073, #428078 How to handle both of it', email: 'a@adit.com', depth: 'thinking', fresh: true });
    expect(loads).toEqual(expect.arrayContaining([['428073', true], ['428078', true]]));
    expect(user).toMatch(/SEVERAL TICKETS/);
    expect(user).toMatch(/Ticket #428078 \(also under review/);
    expect(a.answer.brief.replies).toHaveLength(4);
  });
});

describe('second check keeps the messages (Batch 282)', () => {
  it('merges a corrected brief without losing replies', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../lib/expert.js'), 'utf8');
    const fn = new Function(src.match(/function mergeBrief\(a, b\) \{[\s\S]*?\n\}/)[0] + '; return mergeBrief;')();
    const m = fn({ bottom_line: 'a', reply: 'r', found: ['f'], replies: [{ label: '#1 client reply', text: 'x' }] }, { bottom_line: 'b', found: [], replies: [] });
    expect(m.bottom_line).toBe('b'); expect(m.replies).toHaveLength(1); expect(m.found).toEqual(['f']); expect(m.reply).toBe('r');
  });
});

describe('client questions mapped to sources (Batch 283)', () => {
  it('asks the writer for a What we can answer now part', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../lib/expert.js'), 'utf8');
    expect(src).toMatch(/CLIENT QUESTIONS \(each searched in the Help Center on its own/);
    expect(src).toMatch(/starts "What we can answer now"/);
  });
});

describe('matching a ticket with no account (Batch 318)', () => {
  it('uses the first clue that points to exactly one account, and says how', async () => {
    const ex = require('../../lib/expert');
    const searches = [];
    ex.setDeps({ client: {
      search: async (q) => { searches.push(q); if (q === 'pat@gmail.com') return { results: [{ accountId: 'a1' }, { accountId: 'a2' }] }; if (q === 'goakey1971@hotmail.com') return { results: [{ accountId: 'a9' }] }; return { results: [] }; },
      profile: async (id) => ({ available: true, accountId: id, header: { account: 'Oakey Dental' }, account: { name: 'Oakey Dental' }, detail: {} }) } });
    const m = await ex._matchAccount({ emails: ['pat@gmail.com', 'goakey1971@hotmail.com'], phones: [], names: ['Gigi Oakey'], accts: [] });
    expect(m.accountId).toBe('a9');
    expect(m.text).toMatch(/not linked to a CRM account/);
    expect(m.text).toMatch(/an email address written in the ticket/);
    const none = await ex._matchAccount({ emails: [], phones: [], names: ['Nobody Here'], accts: [] });
    expect(none.none).toBe(true);
  });
});

describe('which account a ticket is about (Batch 332)', () => {
  const ex = require('../../lib/expert');
  const accts = { '14319': { id: 'a1', name: 'Southern Dental' }, '75658': { id: 'a2', name: 'Country Dental' }, '20001': { id: 'a3', name: 'Third Dental' } };
  const setup = () => ex.setDeps({ client: {
    search: async (q) => { const n = String(q).replace(/^acct:/, ''); if (accts[n]) return { results: [{ accountId: accts[n].id }] }; if (q === '#429258') return { results: [{ accountId: 'a2' }] }; return { results: [] }; },
    profile: async (id) => { const e = Object.entries(accts).find(([, v]) => v.id === id); return { available: true, accountId: id, header: { account: e[1].name }, account: { name: e[1].name, number: e[0] }, detail: {} }; } } });
  it('the account number the client gave beats a different Desk link, and the agent is asked to fix the ticket', async () => {
    setup();
    const r = await ex.resolveAccount('429258', { meta: { idents: { accts: ['14319'], noteAccts: [], emails: [], phones: [], names: [] } } });
    expect(r.account.number).toBe('14319');
    expect(r.mismatch).toMatchObject({ linkedNumber: '75658', number: '14319' });
  });
  it('an account an agent documented counts when the client gave none', async () => {
    setup();
    const r = await ex.resolveAccount('429258', { meta: { idents: { accts: [], noteAccts: [{ n: '14319', by: 'agent1', name: 'Evan Cruz' }], emails: [], phones: [], names: [] } } });
    expect(r.account.number).toBe('14319');
    expect(r.matchedBy).toMatch(/Evan Cruz/);
  });
  it('several numbers that do not settle it: nothing is guessed', async () => {
    setup();
    const r = await ex.resolveAccount('429258', { meta: { idents: { accts: ['14319', '20001'], noteAccts: [], emails: [], phones: [], names: [] } } });
    expect(r.ambiguous.map((x) => x.number)).toEqual(['14319', '20001']);
    const h = require('../../lib/ticket-doc-note').header({ ticketNumber: '429258', contact: {} }, r, null);
    expect(h['Practice Name']).toMatch(/^Agent to confirm: Southern Dental \(14319\) or Third Dental \(20001\)/);
    expect(h['Account Number']).toBe('Agent to confirm');
  });
  it('the escalation alert on the ticket wins over the CRM text', () => {
    const h = require('../../lib/ticket-doc-note').header({ ticketNumber: '1', contact: {} }, { header: {}, facts: { escalation: 'Never escalated' }, account: { name: 'X', number: '1' }, escAlert: { tier: '1', id: 'ESC-6295' } }, null);
    expect(h['Any Escalation Ticket Open']).toBe('Yes - Tier 1 (ESC-6295)');
  });
});
