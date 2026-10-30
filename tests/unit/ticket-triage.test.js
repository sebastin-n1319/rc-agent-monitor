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
    if (p.startsWith('/agents')) return { data: [{ id: '7', firstName: 'Lincy', lastName: 'Tabita' }] };
    if (p.startsWith('/tickets?')) return { data: deskRows };
    return { data: [] };
  },
};
const ticket = { load: async (n) => ({ meta: { number: n, subject: 'Texts not sending', status: 'Pending Customer', statusType: 'On Hold', owner: 'Lincy Tabita', created: ago(20), fields: {} }, text: 'Ticket record', lastClient: 'hi', msgCount: 3, commentCount: 1, images: 0,
  timeline: [{ at: ago(20), kind: 'client' }, { at: ago(19), kind: 'agent' }, { at: ago(12), kind: 'agent' }, { at: ago(9), kind: 'agent' }] }) };
let seenUser = '';
const ai = { anyConfigured: () => true, isAnthropicConfigured: () => true,
  claudeJSON: async ({ user }) => { seenUser = user; return { json: { verdict: 'CLOSE', confidence: 'high', headline: 'No reply after 3 follow-ups \u2014 close', next: ['Send the closing note'], evidence: ['3 follow-ups'] } }; } };
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
describe.skipIf(!sqlite3)('open T1 ticket review', () => {
  it('finds the Asana task id in the usual link shapes', () => {
    expect(tt._asanaGid('https://app.asana.com/0/1201/1209876543210')).toBe('1209876543210');
    expect(tt._asanaGid('https://app.asana.com/0/1201/1209876543210/f')).toBe('1209876543210');
    expect(tt._asanaGid('https://app.asana.com/1/111/project/222/task/1209876543299')).toBe('1209876543299');
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
