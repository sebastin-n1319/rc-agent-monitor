import { describe, it, expect, beforeAll } from 'vitest';
const sqlite3 = require('sqlite3');
const ta = require('../../lib/ticket-audits');

describe('Phones not working routed away from VoIP (Batch 426)', () => {
  let db;
  const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
  const x = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => e ? rej(e) : res()));
  beforeAll(async () => {
    db = new sqlite3.Database(':memory:');
    await x(`CREATE TABLE desk_ticket_snapshot (ticket_id TEXT PRIMARY KEY, ticket_number TEXT, subject TEXT, status TEXT, created_time TEXT, closed_time TEXT, web_url TEXT, reassign_count INTEGER, reopen_count INTEGER, team_name TEXT, department_name TEXT, category TEXT, ai_category TEXT, manual_category TEXT, module TEXT, channel TEXT, account_name TEXT, assignee_name TEXT, thread_count INTEGER)`);
    await x(`CREATE TABLE desk_ticket_activity (ticket_id TEXT, source TEXT, idx INTEGER, author_email TEXT, created_time TEXT, kind TEXT, detail TEXT, detail_text TEXT)`);
    ta.setDB(db); await ta.initSchema(); await ta.initSchema(); // seeding runs once
  });
  it('seeds the rule once, and a deleted rule stays deleted', async () => {
    const r = await q(`SELECT id, detector, params FROM audit_rules WHERE title = 'Phones not working sent away from VoIP'`);
    expect(r.length).toBe(1);
    expect(JSON.parse(r[0].params).expected).toBe('VoIP');
    await ta.deleteRule(r[0].id); await ta.initSchema();
    expect((await q(`SELECT id FROM audit_rules WHERE title = 'Phones not working sent away from VoIP'`)).length).toBe(0);
  });
  it('flags a phones-down ticket sent to an OB pod, using the agent note when the subject hides it', async () => {
    const id = await ta.createRule('t@adit.com', { title: 'Phones', detector: 'category_team', severity: 'high', params: { pattern: '\\b(phone|line|call|ext|dial|ring|handset)\\w*\\W+(\\w+\\W+){0,6}(not working|stopped|down|dead|unregister|no account|dropp|one.?way|no audio)|no dial tone|not ringing|can.?t (make|receive) calls', expected: 'VoIP' } });
    await x(`INSERT INTO desk_ticket_snapshot (ticket_id, ticket_number, subject, created_time, module, channel) VALUES ('t1','433081','Issue with phone setup','2026-11-24T22:13:00Z','Voice','Phone')`);
    await x(`INSERT INTO audit_tickets (ticket_id, ticket_number, subject, agent_email, agent_name, transferred_at, dest_group) VALUES ('t1','433081','Issue with phone setup','d@adit.com','Derek W','2026-11-24T22:20:00Z','Pod')`);
    const aid = (await q(`SELECT id FROM audit_tickets WHERE ticket_id='t1'`))[0].id;
    ta.setDeps({ history: async () => [] });
    let f = await ta.refreshFlags(aid);
    expect(f.some((z) => z.rule_id === id)).toBe(false); // subject alone does not say the phones are down
    ta.setDeps({ history: async () => [{ eventName: 'CommentAdded', actor: { name: 'Derek W' }, eventInfo: [{ propertyName: 'Content', propertyValue: '<p>The other phone lines, which were previously working, had stopped functioning.</p>' }] }] });
    f = await ta.refreshFlags(aid);
    const hit = f.find((z) => z.rule_id === id);
    expect(hit).toBeTruthy(); expect(hit.why).toMatch(/VoIP topic but it went to Pod/);
  });
  it('does not flag it when it went to VoIP, even if the rule says VOIP', async () => {
    await x(`UPDATE audit_rules SET params = ? WHERE title = 'Phones'`, [JSON.stringify({ pattern: 'not working', expected: 'VOIP' })]);
    await x(`INSERT INTO desk_ticket_snapshot (ticket_id, ticket_number, subject, created_time) VALUES ('t2','423722','Cordless phones not working','2026-11-02T14:42:00Z')`);
    await x(`INSERT INTO audit_tickets (ticket_id, ticket_number, agent_email, agent_name, transferred_at, dest_group) VALUES ('t2','423722','s@adit.com','Sam Q','2026-11-02T14:50:00Z','VoIP')`);
    const aid = (await q(`SELECT id FROM audit_tickets WHERE ticket_id='t2'`))[0].id;
    expect((await ta.refreshFlags(aid)).filter((z) => z.title === 'Phones').length).toBe(0);
  });
  it('the pattern catches real subjects and leaves look-alikes alone', () => {
    const re = new RegExp('\\b(phone|line|call|ext|dial|ring|handset)\\w*\\W+(\\w+\\W+){0,6}(not working|stopped|down|dead|unregister|no account|dropp|one.?way|no audio)|no dial tone|not ringing|can.?t (make|receive) calls', 'i');
    for (const s of ['Ext 104 - not working', 'Cordless phones not working', 'Incoming & Outgoing Calls Not Working', 'Phones Displaying "No Account" Error', 'Sing phones still not working!']) expect(re.test(s)).toBe(true);
    for (const s of ['Recall reminders stopped', 'Text messages not working', 'Forms not working', 'After-hours calls routing setup']) expect(re.test(s)).toBe(false);
  });
});
