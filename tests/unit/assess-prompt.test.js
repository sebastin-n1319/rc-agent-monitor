import { describe, it, expect, beforeAll } from 'vitest';
const sqlite3 = require('sqlite3');
const ap = require('../../lib/assess-prompt');
const studio = require('../../lib/assess-studio');

describe('AI Studio from a prompt (Batch 432)', () => {
  let db;
  const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, (e) => e ? rej(e) : res()));
  beforeAll(async () => {
    db = new sqlite3.Database(':memory:');
    await run(`CREATE TABLE tr_reviews (subject TEXT, to_team TEXT, comment TEXT, reviewed_at TEXT, verdict TEXT, voided INTEGER, agent_name TEXT)`);
    await run(`CREATE TABLE audit_tickets (subject TEXT, summary TEXT, findings TEXT, completed_at TEXT, verdict TEXT, agent_name TEXT)`);
    await run(`CREATE TABLE cq_human (name TEXT, areas TEXT, summary TEXT, completed TEXT)`);
    await run(`CREATE TABLE expert_notes (title TEXT, body TEXT, module TEXT, updated_at TEXT, status TEXT)`);
    for (let i = 0; i < 12; i++) await run(`INSERT INTO tr_reviews VALUES (?,?,?,datetime('now','-3 days'),'invalid',0,'Agent Zed')`, ['Phones not working ' + i, 'TechOB Pod 4', 'Phones down go to VoIP, not the onboarding pod. The note promised a callback from a team that was off shift.']);
    await run(`INSERT INTO tr_reviews VALUES ('Old miss','T2','Too old to count',datetime('now','-80 days'),'invalid',0,'Agent Zed')`);
    await run(`INSERT INTO audit_tickets VALUES ('Reminder texts not sent','Agent skipped the acknowledgement email',?,datetime('now','-1 days'),'needs_fix','Agent Zed')`, [JSON.stringify([{ label: 'No acknowledgement email', note: 'The client heard nothing for two days' }])]);
    await run(`INSERT INTO expert_notes VALUES ('Phones down routing','Phones down go to VoIP for every client, onboarding included.','Voice',datetime('now'),'active')`);
    await run(`INSERT INTO expert_notes VALUES ('Refund approvals','Refunds over 100 dollars need the billing lead.','Pay',datetime('now'),'active')`);
    ap.setDB(db);
    ap.setDeps({ productUpdates: { archive: async () => ({ items: [
      { postedAt: new Date().toISOString(), title: 'Appointment reminder changes', summary: 'Reminders now send 48 hours before.', impact: 'Tell clients the new timing.' },
      { postedAt: new Date(Date.now() - 100 * 864e5).toISOString(), title: 'Ancient update', summary: 'Old.' },
    ] }) } });
  });
  it('gathers updates, misses and matching rules in the period, without agent names', async () => {
    const r = await ap.build({ prompt: 'Test agents on routing phones down tickets and the reminder changes', days: 30 });
    expect(r.counts.misses).toBeGreaterThanOrEqual(12);
    expect(r.counts.updates).toBe(1);
    expect(r.counts.rules).toBe(1); // only the rule that matches the prompt
    expect(r.text).toMatch(/Phones down go to VoIP/);
    expect(r.text).not.toMatch(/Agent Zed|Ancient update|Too old to count|Refund approvals/);
    expect(r.focus).toMatch(/Never name agents, clients or practices/);
  });
  it('splits into Studio sections that keep every record', async () => {
    const r = await ap.build({ prompt: 'phones down routing', days: 30, sources: ['misses'] });
    const secs = studio._splitSections(r.text);
    const text = secs.map((s) => s.text).join('\n');
    expect((text.match(/Transfer sent back/g) || []).length).toBe(12);
  });
  it('says so when nothing is found', async () => {
    await expect(ap.build({ prompt: 'something nobody wrote about', days: 7, sources: ['rules'] })).rejects.toThrow(/Nothing was found/);
    await expect(ap.build({ prompt: 'x', days: 7 })).rejects.toThrow(/Describe what the assessment/);
  });
});
