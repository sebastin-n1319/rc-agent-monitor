import { describe, it, expect, beforeAll } from 'vitest';
const sqlite3 = require('sqlite3');
const xd = require('../../lib/expert-desk-draft');
process.env.EXPERT_DRAFT_WAIT_MIN = '0';

const T1 = [{ id: '1', name: 'Lincy Tabita' }, { id: '2', name: 'Henry P' }, { id: '3', name: 'Sky Gibson' }];

describe('Expert draft quality fixes (Batch 424)', () => {
  let db;
  const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
  beforeAll(async () => { db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema(); xd.setDeps({ t1Agents: async () => T1 }); });

  it('flags drafts that say work was done that the agent has not done', () => {
    const k = (t) => xd._toneIssues(t).map((i) => i.kind);
    expect(k("I'm setting up your phones now so calls go to your answering service.")).toContain('says work was done that the agent has not done');
    expect(k("I've passed this to our specialist team to review.")).toContain('says work was done that the agent has not done');
    expect(k("I've linked this message to your earlier ticket.")).toContain('says work was done that the agent has not done');
    expect(k('Our team will set this up and update you here.')).toEqual([]);
    expect(k('You can find it under Patient Forms > Forms Manager.')).toEqual([]);
  });

  it('tells call logs, pasted drafts and other teams apart from an own reply', async () => {
    expect(xd.isSystemThread({ channel: 'PHONE' })).toBe(true);
    expect(xd.isSystemThread({ channel: 'EMAIL', summary: '{"caller":"x","recordingurl":"https://phonebridge.zoho.com/r"}' })).toBe(true);
    expect(xd.isSystemThread({ channel: 'EMAIL', summary: 'Hi Mark, thanks for the update.' })).toBe(false);
    const draft = 'Hi Jessie, Thank you for sending this over. Your screenshots show the Wisdom Teeth Post-Op rule clearly. Your rule is in Patient Forms > Preferences > Auto-Assign. Click the pencil icon beside it to edit.';
    const agent = 'Hi Jessie, Thank you for sending this over. Your rule is in Patient Forms > Preferences > Auto-Assign. I will check the codes with the team and get back to you.';
    expect(xd.usedShare(draft, agent)).toBeGreaterThanOrEqual(0.3);
    const deskRead = async (p) => ({ content: /9001/.test(p) ? agent : /9002/.test(p) ? 'Hello, this is Riley from Adit Voice. I will work on this issue to get it resolved for your office.' : '{"caller":"x","recordingurl":"phonebridge"}' });
    xd.setDeps({ deskRead });
    const r = { id: 501, ticket_id: '77', number: '433382', reply: draft };
    const a = await xd._learn(r, { id: '9001', author: { name: 'Henry P' } }, 'own reply');
    expect(a.kind).toBe('edited');
    const b = await xd._learn(Object.assign({}, r, { id: 502 }), { id: '9002', author: { name: 'Riley Sanders' } }, 'own reply');
    expect(b.kind).toBe('other team');
    const c = await xd._learn(Object.assign({}, r, { id: 503 }), { id: '9003', author: { name: 'Henry P' } }, 'own reply');
    expect(c.kept).toBe(false); expect(c.system).toBe(true);
    const rows = await q(`SELECT job_id, kind FROM expert_draft_lessons ORDER BY job_id`);
    expect(rows).toEqual([{ job_id: 501, kind: 'edited' }, { job_id: 502, kind: 'other team' }]);
  });

  it('does not draft a ticket that is leaving T1', async () => {
    const T = { ticketNumber: '450001', teamId: '197800000052125116', status: 'Pending Review - T1', statusType: 'Open', channel: 'Email', email: 'dr@x.com', subject: 'Question', assigneeId: '1', lastThread: { direction: 'in' } };
    xd.setDeps({ roster: { group: async () => ({ source: 'fallback', ids: new Set(), names: new Map() }), techobReason: () => '' }, deskRead: async (p) => /threads|tags/.test(p) ? { data: [] } : T });
    const d = await xd.decide({ eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000500', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'dr@x.com' } }, { assignWaitMs: 0 });
    expect(d.skip).toMatch(/leaving T1/);
  });

  it('learns draft rules from clean lessons only, and finds similar agent replies', async () => {
    for (let i = 0; i < 12; i++) await new Promise((res) => db.run(`INSERT INTO expert_draft_lessons (job_id, ticket_id, number, agent, kind, similarity, expert_text, agent_text) VALUES (?,?,?,?,?,?,?,?)`,
      [600 + i, 't' + i, String(440000 + i), 'Lincy Tabita', 'own reply', 0.05, 'Long draft with steps about appointment sync settings ' + i, 'Hello, thank you for reaching out. Please allow us some time to review the appointment sync details and our team will reach out. ' + i], () => res()));
    await new Promise((res) => db.run(`INSERT INTO expert_draft_lessons (job_id, ticket_id, number, agent, kind, similarity, expert_text, agent_text) VALUES (700,'x','1','Henry P','own reply',0,'a','{"caller":"x"}')`, () => res()));
    let seen = '';
    xd.setDeps({ ai: { bestJSON: async ({ user }) => { seen = user; return { json: { rules: [{ rule: 'When the request needs another team, send a short acknowledgement without steps.', count: 9, examples: ['440001', '440002'] }, { rule: 'One-off', count: 1, examples: ['440003'] }] } }; } } });
    const r = await xd.learnDraftRules();
    expect(r.pairs).toBe(13); // 12 here plus the edited reply from the test above; the call log is left out
    expect(seen).not.toMatch(/caller/);
    expect(r.rules.map((x) => x.rule)).toEqual(['When the request needs another team, send a short acknowledgement without steps.']);
    expect((await xd.draftRules()).rules.length).toBe(1);
    const sim = await xd.similarReplies('Appointment sync details not matching the schedule');
    expect(sim.length).toBeGreaterThan(0);
  });
});
