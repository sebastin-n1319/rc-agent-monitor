import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs'), os = require('os'), path = require('path');
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; } // the native build may not load on every machine
const cr = require('../../lib/custom-reports.js');

describe('scheduled reports: safety and timing', () => {
  it('allows only reading the listed tables and no personal columns', () => {
    expect(cr._checkSql('tool', "SELECT to_agent, count(*) n FROM tr_reviews WHERE reviewed_at >= '{{from}}' GROUP BY to_agent")).toContain('tr_reviews');
    expect(cr._checkSql('tool', 'WITH x AS (SELECT to_agent FROM tr_reviews) SELECT * FROM x')).toContain('WITH');
    expect(() => cr._checkSql('tool', 'DELETE FROM tr_reviews')).toThrow();
    expect(() => cr._checkSql('tool', 'SELECT * FROM sessions')).toThrow('not available');
    expect(() => cr._checkSql('tool', 'SELECT agent_email FROM tr_reviews')).toThrow('personal');
    expect(() => cr._checkSql('tool', 'SELECT 1; DROP TABLE x')).toThrow();
    expect(() => cr._checkSql('warehouse', 'SELECT j_phone FROM desk_tickets')).toThrow('personal');
    expect(cr._checkSql('warehouse', 'SELECT cf_csm_account_manager, count(*) FROM public.desk_tickets GROUP BY 1')).toBeTruthy();
  });
  it('works out last week in Central time', () => {
    const p = cr._resolvePeriod('last_week', 'America/Chicago', new Date('2026-11-02T15:00:00Z')); // Monday Nov 2
    expect([p.fromDate, p.toDate]).toEqual(['2026-10-26', '2026-11-01']);
    expect(p.from).toBe('2026-10-26T05:00:00.000Z'); // CDT midnight
    expect(p.to).toBe('2026-11-02T06:00:00.000Z'); // CST midnight after the clock change
  });
  it('is due once at the set time on the set day', () => {
    const s = { freq: 'weekly', weekday: 1, time_hm: '09:00' };
    expect(cr._isDue(s, { date: '2026-11-02', mins: 545, dow: 1 })).toBe(true);
    expect(cr._isDue(s, { date: '2026-11-03', mins: 545, dow: 2 })).toBe(false);
    expect(cr._isDue(Object.assign({ last_run_key: '2026-11-02' }, s), { date: '2026-11-02', mins: 545, dow: 1 })).toBe(false);
    expect(cr._isDue(s, { date: '2026-11-02', mins: 530, dow: 1 })).toBe(false);
  });
});

describe.skipIf(!sqlite3)('scheduled reports: build, save, send', () => {
  let seen = [], posted = [];
  beforeAll(async () => {
    const file = path.join(os.tmpdir(), 'crp-' + Date.now() + '.db');
    process.env.DB_PATH = file;
    const db = new sqlite3.Database(file);
    await new Promise((r) => db.exec(`CREATE TABLE tr_reviews (ticket_number TEXT, to_agent TEXT, to_team TEXT, verdict TEXT, voided INTEGER DEFAULT 0, reviewed_at TEXT);
      INSERT INTO tr_reviews VALUES ('1','Walter Green','CSM','valid',0,'2026-10-27T15:00:00Z'),('2','Walter Green','CSM','valid',0,'2026-10-28T15:00:00Z'),('3','Ana Ruiz','CSM','valid',0,'2026-10-29T15:00:00Z');`, r));
    cr.setDB(db); await cr.initSchema();
    cr.setDeps({ query: async () => ({ rows: [] }), ai: { isAnthropicConfigured: () => true, claudeJSON: async ({ system, user }) => {
      seen.push(user);
      if (/plan a recurring report/.test(system)) return { json: { queries: [{ source: 'tool', purpose: 'Tickets sent to each CSM', sql: "SELECT to_agent, count(*) AS n FROM tr_reviews WHERE to_team = 'CSM' AND voided = 0 AND reviewed_at >= '{{from}}' AND reviewed_at < '{{to}}' GROUP BY to_agent ORDER BY n DESC" }], title: 'Tickets T1 sent to each CSM', notes: 'Counted reviewed transfers to the CSM team.' } };
      return { json: { text: '*Tickets T1 sent to each CSM*\nWalter Green: 2\nAna Ruiz: 1\n*Total: 3}' } };
    } } });
    global.fetch = async (u, o) => { posted.push({ u, body: JSON.parse(o.body) }); return { ok: true, status: 200 }; };
  });
  it('previews, saves the queries, and sends to the space', async () => {
    const prev = await cr.preview({ name: 'CSM report', prompt: 'How many tickets T1 sent to each CSM', period: 'last_7_days' });
    expect(prev.planView.queries[0].rows).toBeGreaterThanOrEqual(0);
    expect(prev.text).toContain('Walter Green');
    await expect(cr.save(null, { name: 'CSM report', prompt: 'How many tickets T1 sent to each CSM', webhook: 'https://example.com/x' }, 'a@adit.com')).rejects.toThrow('Google Chat webhook');
    const r = await cr.save(null, { name: 'CSM report', prompt: 'How many tickets T1 sent to each CSM', webhook: 'https://chat.googleapis.com/v1/spaces/AAAA1234/messages?key=k&token=t', freq: 'weekly', weekday: 1, time: '09:00', period: 'last_7_days' }, 'a@adit.com', { prompt: 'How many tickets T1 sent to each CSM', plan: prev.plan });
    expect(r.plan.current).toBe(true);
    expect(r.target).toContain('AAAA12');
    expect(JSON.stringify(r)).not.toContain('token=t');
    const plans = seen.filter((u) => /Tool tables/.test(u)).length;
    const s = await cr.send(r.id, 'a@adit.com');
    expect(s.ok).toBe(true);
    expect(posted[0].u).toContain('chat.googleapis.com');
    expect(seen.filter((u) => /Tool tables/.test(u)).length).toBe(plans); // reused the saved queries
    const l = await cr.list();
    expect(l[0].history[0].ok).toBe(1);
  });
});

describe.skipIf(!sqlite3)('scheduled reports: the T1 transfers view', () => {
  it('counts each ticket once and splits reviewed, moved without review, returned and audit results', async () => {
    const db = new sqlite3.Database(':memory:');
    await new Promise((r) => db.exec(`CREATE TABLE tr_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ticket_number TEXT, subject TEXT, web_url TEXT, channel TEXT, agent_name TEXT, to_agent TEXT, to_team TEXT, source TEXT, state TEXT, verdict TEXT, severity TEXT, reviewer TEXT, reviewed_at TEXT, entered_at TEXT, left_at TEXT, voided INTEGER);
      CREATE TABLE audit_tickets (id INTEGER, ticket_id TEXT, verdict TEXT, ai_scanned_at TEXT, ai_priority INTEGER);
      INSERT INTO tr_reviews (ticket_id, ticket_number, subject, web_url, channel, agent_name, to_agent, to_team, source, state, verdict, severity, reviewer, reviewed_at, entered_at, left_at, voided) VALUES ('b','2','S2','u2','Chat','Sky','Ana Ruiz','CSM','bypass','moved',NULL,NULL,NULL,NULL,'2026-10-20T09:00:00Z',NULL,0),('a','1','S1','u1','Chat','Sky','Ana Ruiz','CSM','status','done','good',NULL,'Lead','2026-10-27T10:00:00Z','2026-10-27T09:00:00Z',NULL,0),
        ('b','2','S2','u2','Chat','Sky','Ana Ruiz','CSM','bypass','moved',NULL,NULL,NULL,NULL,'2026-10-28T09:00:00Z',NULL,0),
        ('c','3','S3','u3','Chat','Sky','Ana Ruiz','CSM','status','done','invalid','fatal','Lead','2026-10-29T10:00:00Z','2026-10-29T09:00:00Z',NULL,0),
        ('d','4','S4','u4','Chat','Sky','Ana Ruiz','CSM','status','waiting',NULL,NULL,NULL,NULL,'2026-10-29T09:00:00Z',NULL,0),
        ('e','5','S5','u5','Chat','Sky','Billing Queue','Billing','status','done','good',NULL,'Lead','2026-10-29T10:00:00Z','2026-10-29T09:00:00Z',NULL,0);
      INSERT INTO audit_tickets VALUES (1,'a','correct','2026-10-28',0),(2,'b','needs_fix','2026-10-29',3),(3,'c',NULL,NULL,0);`, r));
    const sql = cr._withView("SELECT path, review_result, audit_result, fatal, ai_flagged, times_sent, COUNT(*) n FROM t1_transfers WHERE to_csm = 1 GROUP BY 1,2,3,4,5,6 ORDER BY 1,2", "'ana ruiz'", "'c'");
    const rows = await new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));
    expect(rows).toEqual([
      { path: 'moved without review', review_result: 'not reviewed', audit_result: 'needs fix', fatal: 0, ai_flagged: 1, times_sent: 2, n: 1 },
      { path: 'reviewed', review_result: 'approved', audit_result: 'legit', fatal: 0, ai_flagged: 0, times_sent: 1, n: 1 },
      { path: 'reviewed', review_result: 'returned to T1', audit_result: 'audit pending', fatal: 1, ai_flagged: 0, times_sent: 1, n: 1 }]); // ticket 3 came back to T1 but still went to the CSM
    const back = await new Promise((res, rej) => db.all(cr._withView("SELECT ticket_number, to_csm, back_to_t1 FROM t1_transfers WHERE ticket_number = '3'", "'ana ruiz'", "'c'"), (e, r) => e ? rej(e) : res(r)));
    expect(back).toEqual([{ ticket_number: '3', to_csm: 1, back_to_t1: 1 }]);
    const handled = await new Promise((res, rej) => db.all(cr._withView("SELECT ticket_number, csm_acted, csm_handled FROM t1_transfers WHERE to_csm = 1 ORDER BY 1", "'ana ruiz'", "'c','b'", "'b'"), (e, r) => e ? rej(e) : res(r)));
    expect(handled).toEqual([{ ticket_number: '1', csm_acted: 0, csm_handled: 1 }, { ticket_number: '2', csm_acted: 1, csm_handled: 1 }, { ticket_number: '3', csm_acted: 0, csm_handled: 0 }]);
    const mv = await new Promise((res, rej) => db.all(cr._withView("SELECT from_csm, COUNT(DISTINCT ticket_number) n FROM csm_to_t1 GROUP BY 1", "''", "''", "''", [{ ticket_id: '9', ticket_number: '9', web_url: 'u', channel: 'Email', from_csm: "O'Neil", t1_agent: 'Sky', moved_at: 'x', t1_sent_first: 0 }]), (e, r) => e ? rej(e) : res(r)));
    expect(mv).toEqual([{ from_csm: "O'Neil", n: 1 }]);
    expect(cr._chatLinks('https://d/x#1 | #420401 Change')).toBe('<https://d/x#1|#420401> Change');
    expect(cr._withView('WITH x AS (SELECT 1) SELECT * FROM t1_transfers, x', "'a'")).toMatch(/^WITH t1_transfers AS \(.*\), x AS/s);
    expect(cr._withView('SELECT 1 FROM tr_reviews', "'a'")).toBe('SELECT 1 FROM tr_reviews');
  });
});

describe('scheduled reports: tickets CSMs moved to T1', () => {
  it('reads the owner change log in Central time and finds CSM to T1 moves in the period', () => {
    const log = 'Owner changed to Audrey Miles on 2026-10-20 07:06:16 | Role : Tech CSM\nOwner changed to Mimansha Svrankar on 2026-10-23 08:13:35 | Role : Mark CSM\nOwner changed to Patricia Nelson on 2026-10-23 08:16:25 | Role : DSO CSM\nOwner changed to Audrey Miles on 2026-10-23 15:20:59 | Role : T1 Support';
    const p = cr._parseOwnerLog(log);
    expect(p[3]).toEqual({ name: 'Audrey Miles', at: '2026-10-23T20:20:59.000Z', role: 'T1 Support' });
    const period = { from: '2026-10-19T05:00:00.000Z', to: '2026-10-26T05:00:00.000Z' };
    const rows = [{ id: '11', ticket_number: '418391', web_url: 'u', channel: 'Email', cf_owner_change_log: log },
      { id: '12', ticket_number: '419279', web_url: 'u2', channel: 'Phone', cf_owner_change_log: 'Owner changed to Henry P on 2026-10-21 18:44:15 | Role : T1 Support\nOwner changed to Amelia Parks on 2026-10-22 17:04:45 | Role : CEO\nOwner changed to Greg Dawson on 2026-10-23 14:21:28 | Role : T1 Support' }];
    const m = cr._csmMoves(rows, new Set(['amelia parks']), period, new Set(['12']));
    expect(m.map((x) => [x.ticket_number, x.from_csm, x.t1_agent, x.t1_sent_first])).toEqual([['418391', 'Patricia Nelson', 'Audrey Miles', 0], ['419279', 'Amelia Parks', 'Greg Dawson', 1]]);
    expect(cr._csmMoves(rows, new Set(), { from: '2026-10-24T05:00:00.000Z', to: '2026-10-31T05:00:00.000Z' }, new Set())).toEqual([]);
  });
});
