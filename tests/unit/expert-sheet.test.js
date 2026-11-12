import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const sqlite3 = require('sqlite3');
const xs = require('../../lib/expert-sheet');
const env = { ...process.env };
describe('expert log sheet', () => {
  let db, appended = [], updates = [];
  const run = (sql, p = []) => new Promise((r, j) => db.run(sql, p, (e) => e ? j(e) : r()));
  beforeAll(async () => {
    db = new sqlite3.Database(':memory:'); xs.setDB(db); await xs.initSchema();
    await run(`CREATE TABLE expert_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, question TEXT, module TEXT, intent TEXT, mode TEXT, confidence TEXT, found INTEGER, verified INTEGER, sources_json TEXT, answer_json TEXT, ms INTEGER, vote INTEGER, gap TEXT, created_at TEXT)`);
    await run(`CREATE TABLE expert_feedback (id INTEGER PRIMARY KEY, log_id INTEGER, email TEXT, vote INTEGER, comment TEXT, correction TEXT)`);
    const ins = (e, q, at, extra = {}) => run(`INSERT INTO expert_log (email, question, mode, confidence, found, verified, answer_json, ms, vote, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [e, q, 'email', 'high', 1, 1, JSON.stringify({ brief: { bottom_line: extra.bl || 'Do X' } }), 23000, extra.vote || null, at]);
    await ins('a@adit.com', '#428073, #428078 how to handle both, client dr@x.com 555-123-4567', '2026-11-12 18:00:00', { bl: 'quick' });
    await ins('a@adit.com', '#428073, #428078 how to handle both, client dr@x.com 555-123-4567', '2026-11-12 18:00:30', { bl: 'full', vote: 1 });
    await ins('desk-automation', '#428100 Write the email reply', '2026-11-12 18:05:00');
    await ins('b@adit.com', '=SUM(A1)', '2026-11-12 18:06:00', { vote: -1 });
    await run(`INSERT INTO expert_feedback (log_id, vote, correction) VALUES (4, -1, 'Use the Mass Text article')`);
    process.env.EXPERT_LOG_SHEET_ID = 'S1'; process.env.GOOGLE_SERVICE_ACCOUNT_KEY = '{"client_email":"svc@x.iam"}';
    xs.setDeps({ sheets: { spreadsheets: {
      get: async () => ({ data: { sheets: [] } }), batchUpdate: async () => ({}),
      values: { clear: async () => ({}), update: async (o) => { updates.push(o); }, append: async (o) => { appended.push(...o.requestBody.values); } } } } });
  });
  afterAll(() => { process.env = { ...env }; });
  it('creates the tab, copies history once, merges quick and full answers, scrubs contacts', async () => {
    const r = await xs.syncAll();
    expect(updates[0].requestBody.values[0]).toEqual(xs.HEAD);
    expect(appended.length).toBe(3);
    const [first, desk, formula] = appended;
    expect(first[12]).toBe('full'); expect(first[13]).toBe('Helpful'); expect(first[5]).toBe('#428073, #428078');
    expect(first[4]).toMatch(/\[contact\].*\[contact\]/); expect(first[4]).not.toMatch(/555|dr@x/);
    expect(first[1]).toBe('2026-11-12'); expect(first[2]).toBe('12:00 PM');
    expect(desk[3]).toBe('Desk automation');
    expect(formula[4]).toBe("'=SUM(A1)"); expect(formula[13]).toBe('Not right'); expect(formula[14]).toBe('Use the Mass Text article');
    expect(r.addedTotal).toBe(3);
    expect((await xs.syncAll()).addedTotal).toBe(0);
    expect((await xs.status()).lastId).toBe(4);
    // Desk drafts tab: rewritten with every draft
    await run(`CREATE TABLE expert_desk_drafts (id INTEGER PRIMARY KEY, ticket_id TEXT, number TEXT, subject TEXT, owner TEXT, account TEXT, deal TEXT, source TEXT, mode TEXT, status TEXT, draft_state TEXT, ms INTEGER, error TEXT, reply TEXT, note TEXT, created_at TEXT)`);
    await run(`INSERT INTO expert_desk_drafts VALUES (1,'1978','428848','Reminders','Lincy Tabita','','','webhook','save','skipped','not saved',90000,'an agent already replied','Hi Ronnie, call 555-123-4567','T1 handles this','2026-11-12 22:51:24')`);
    updates.length = 0;
    const r2 = await xs.syncAll();
    expect(r2.drafts.drafts).toBe(1);
    const v = updates.find((u) => /Desk drafts/.test(u.range)).requestBody.values;
    expect(v[0]).toEqual(xs.DHEAD);
    expect(v[1].slice(3, 13)).toEqual(['#428848', 'Reminders', 'Lincy Tabita', '', '', 'Desk webhook', 'Full review', 'Not needed', 'Agent replied first', 90]);
    expect(v[1][14]).toMatch(/\[contact\]/);
    updates.length = 0; expect((await xs.syncAll()).drafts.unchanged).toBe(true);
  });
});
