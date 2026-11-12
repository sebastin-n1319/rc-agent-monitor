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
      values: { update: async (o) => { updates.push(o); }, append: async (o) => { appended.push(...o.requestBody.values); } } } } });
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
  });
});
