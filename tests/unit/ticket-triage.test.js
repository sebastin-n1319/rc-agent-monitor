import { describe, it, expect, beforeAll } from 'vitest';
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; } // the native build may not load on every machine
const tt = require('../../lib/ticket-triage.js');

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const deskRows = [
  { id: '1', ticketNumber: '423000', subject: 'Texts not sending', status: 'Pending Customer', statusType: 'On Hold', channel: 'Email', createdTime: ago(20), modifiedTime: ago(9), assigneeId: '7', webUrl: 'https://desk/1', cf: { cf_asana_task_link: null } },
  { id: '2', ticketNumber: '423057', subject: 'Port my number', status: 'Open', statusType: 'Open', channel: 'Phone', createdTime: ago(3), modifiedTime: ago(1), assigneeId: null, webUrl: 'https://desk/2', cf: { cf_asana_task_link: 'https://app.asana.com/0/1201/1209876543210' } },
];
let calls = [];
const desk = {
  isConfigured: () => true,
  getRateLimitState: () => ({ paused: false }),
  fetchRaw: async (p) => {
    calls.push(p);
    if (p.startsWith('/organizationFields')) return { data: [{ apiName: 'status', allowedValues: [{ value: 'Open' }, { value: 'Closed' }, { value: 'Pending Customer' }] }] };
    if (p.startsWith('/agents')) return { data: [{ id: '7', firstName: 'Lincy', lastName: 'Tabita', emailId: 'lincy@adit.com' }, { id: '8', firstName: 'Sky', lastName: 'Gibson', emailId: 'sky@adit.com' }] };
    if (p.startsWith('/tickets?')) return { data: deskRows };
    return { data: [] };
  },
};
const ticket = { load: async (n) => ({ meta: { number: n, subject: 'Texts not sending', status: 'Pending Customer', statusType: 'On Hold', owner: 'Lincy Tabita', created: ago(20), fields: {} }, text: 'Ticket record', lastClient: 'hi', msgCount: 3, commentCount: 1, images: 0,
  timeline: [{ at: ago(20), kind: 'client' }, { at: ago(19), kind: 'agent' }, { at: ago(12), kind: 'agent' }, { at: ago(9), kind: 'agent' }] }) };
let seenUser = '', seenFb = '';
const ai = { anyConfigured: () => true, isAnthropicConfigured: () => true,
  claudeJSON: async ({ system, user }) => { if (/gave feedback/.test(system)) { seenFb = user; return { json: { reviewer_right: /client confirmed/.test(user) ? 'yes' : 'no', reply: 'Checked.', lesson: 'Tickets like this can close.', final_verdict: 'close' } }; } seenUser = user; return { json: { verdict: 'CLOSE', confidence: 'high', headline: 'No reply after 3 follow-ups \u2014 close', failure: { level: 'high', who: 'Sky', what: 'Note only, no reply' }, client_message: 'Hi there,', next: ['Send the closing note'], evidence: ['3 follow-ups'] } }; } };
const expert = { crmContext: async () => ({ text: 'Account: Smile Dental', facts: { csm: 'Ana' } }), searchLocal: async () => [], rules: async () => [{ title: 'T1 cannot make outbound calls', body: 'Callbacks go to VoIP.' }] };

beforeAll(async () => {
  if (!sqlite3) return;
  tt.setDB(new sqlite3.Database(':memory:'));
  tt.setDeps({ desk, ticket, ai, expert });
  await tt.initSchema();
});

describe('open T1 ticket review: Asana links', () => {
  it('finds the task id', () => { expect(tt._asanaGid('https://app.asana.com/0/1201/1209876543210')).toBe('1209876543210'); });
});
describe('open T1 ticket review: No follow-up tag', () => {
  it('flags unanswered clients and agents gone quiet', () => {
    const n = Date.now(), d = 864e5, iso = (x) => new Date(n - x * d).toISOString();
    expect(tt._followup({ analysed_at: 'x', last_agent_at: iso(5), last_client_at: iso(6) }).kind).toBe('stale');
    expect(tt._followup({ analysed_at: 'x', last_agent_at: iso(5), last_client_at: iso(2) }).text).toBe('Client waiting 2 d');
    expect(tt._followup({ analysed_at: 'x', last_agent_at: iso(1), last_client_at: iso(2) })).toBeNull();
    expect(tt._followup({ analysed_at: 'x', created: iso(2) }).kind).toBe('none');
    expect(tt._followup({})).toBeNull();
  });
});
describe('open T1 ticket review: reading Asana', () => {
  it('reads the column, the comments and the updates', async () => {
    const real = global.fetch; process.env.ASANA_ACCESS_TOKEN = 'x';
    global.fetch = async (u) => ({ ok: true, json: async () => /stories/.test(u)
      ? { data: [{ type: 'comment', resource_subtype: 'comment_added', text: 'Questions have been added. Please inform the client', created_at: '2026-09-11T17:52:17Z', created_by: { name: 'Siddharth' } }, { type: 'system', resource_subtype: 'section_changed', text: 'moved this task from "To do" to "Completed"', created_at: '2026-09-14T18:09:00Z', created_by: { name: 'Siddharth' } }] }
      : { data: { name: 'Patient Forms #402758', completed: false, memberships: [{ project: { name: 'Patient Forms' }, section: { name: 'Completed' } }], assignee: { name: 'Sky Gibson' } } } });
    try {
      const a = await tt._asanaTask('https://app.asana.com/1/7/project/1/task/1218340844303981?focus=true');
      expect(a.doneColumn).toBe(true);
      const t = tt._asanaText(a);
      expect(t).toContain('DONE');
      expect(t).toContain('Please inform the client');
      expect(t).toContain('to "Completed"');
    } finally { global.fetch = real; delete process.env.ASANA_ACCESS_TOKEN; }
  });
});
describe.skipIf(!sqlite3)('open T1 ticket review', () => {
  it('finds the Asana task id in the usual link shapes', () => {
    expect(tt._asanaGid('https://app.asana.com/0/1201/1209876543210')).toBe('1209876543210');
    expect(tt._asanaGid('https://app.asana.com/0/1201/1209876543210/f')).toBe('1209876543210');
    expect(tt._asanaGid('https://app.asana.com/1/111/project/222/task/1209876543299')).toBe('1209876543299');
    expect(tt._asanaGid('https://app.asana.com/1/7153196700226/project/1202095993396108/task/1218340844303981?focus=true')).toBe('1218340844303981');
    expect(tt._asanaGid('')).toBeNull();
  });
  it('reads the T1 view with every status except Closed', async () => {
    const r = await tt.refreshList();
    expect(r.count).toBe(2);
    const listCall = calls.find((c) => c.startsWith('/tickets?'));
    expect(listCall).toContain('teamIds=197800000052125116');
    expect(listCall).toContain('status=Open,Pending%20Customer');
    expect(listCall).not.toContain('Closed');
    const l = await tt.list();
    expect(l.rows.map((x) => x.number).sort()).toEqual(['423000', '423057']);
    expect(l.rows.find((x) => x.number === '423000').owner).toBe('Lincy Tabita');
    expect(l.rows.find((x) => x.number === '423057').asana).toContain('asana');
  });
  it('reviews a ticket with the facts, rules and CRM, and stores a clean verdict', async () => {
    const out = await tt.analyse('1');
    expect(out.verdict).toBe('close');
    expect(out.headline).not.toMatch(/[\u2014\u2013]/);
    expect(seenUser).toContain('Agent messages since the client\'s last message: 3');
    expect(seenUser).toContain('T1 cannot make outbound calls');
    expect(seenUser).toContain('Smile Dental');
    const row = (await tt.list()).rows.find((x) => x.id === '1');
    expect(row.verdict).toBe('close');
    expect(row.stale).toBe(false);
  });
  it('puts failure tickets on the responsible agents\' own list only', async () => {
    const sky = await tt.myFixes('sky@adit.com');
    expect(sky.map((t) => t.number)).toEqual(['423000']);
    expect(sky[0].client_message).toBe('Hi there,');
    expect((await tt.myFixes('lincy@adit.com')).length).toBe(1); // owner
    expect((await tt.myFixes('someone@adit.com')).length).toBe(0);
    await expect(tt.fixDone('1', 'someone@adit.com')).rejects.toThrow('Not your ticket');
    await tt.fixDone('1', 'sky@adit.com', 'Replied to the client');
    expect((await tt.myFixes('sky@adit.com'))[0].waitingRecheck).toBe(true);
    await tt.analyse('1');
    expect((await tt.myFixes('sky@adit.com'))[0].stillOpen).toBe(true);
  });
  it('takes the reviewer\'s call, checks it, and learns or disputes', async () => {
    const a = await tt.feedback('1', { agree: false, verdict: 'wait', comment: 'client confirmed by phone she wants it open', by: 'lead@adit.com' });
    expect(a.status).toBe('active');
    expect(seenFb).toContain('says the right call is "wait"');
    const row = (await tt.list()).rows.find((x) => x.id === '1');
    expect(row.reviewer.verdict).toBe('wait');
    expect((await tt.list()).lessons.map((l) => l.lesson)).toContain('Tickets like this can close.');
    await tt.analyse('1');
    expect(seenUser).toContain('What reviewers taught you');
    const b = await tt.feedback('1', { agree: false, verdict: 'handover', comment: 'should go to billing', by: 'lead@adit.com' });
    expect(b.status).toBe('disputed');
    await tt.settle(b.id, 'accept_ai');
    expect((await tt.list()).rows.find((x) => x.id === '1').reviewer).toBeNull();
    const c = await tt.feedback('1', { agree: true });
    expect(c.status).toBe('agree');
  });
  it('keeps a lasting cache and finds what is due', async () => {
    await tt.cache.set('th:1', { id: '1', content: 'x' });
    expect(await tt.cache.get('th:1', 0)).toEqual({ id: '1', content: 'x' });
    expect(await tt.cache.get('th:1', 1)).toEqual({ id: '1', content: 'x' });
    await new Promise((r) => setTimeout(r, 5));
    expect(await tt.cache.get('th:1', 1)).toBeNull();
    const q = await tt.runAll({ auto: true });
    expect(q.total).toBe(1); // ticket 2 was never reviewed; ticket 1 is fresh
  });
  it('marks tickets that left the view', async () => {
    deskRows.splice(1, 1);
    await new Promise((r) => setTimeout(r, 5));
    await tt.refreshList();
    expect((await tt.list()).rows.map((x) => x.number)).toEqual(['423000']);
  });
  it('treats an unknown verdict as act', () => {
    expect(tt._shape({ verdict: 'maybe' }).verdict).toBe('act');
  });
});
