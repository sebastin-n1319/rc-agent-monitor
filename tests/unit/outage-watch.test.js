import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }
const ow = require('../../lib/outage-watch.js');
const ta = require('../../lib/ticket-ask.js');

// Nov 9 2026, 12:10 to 12:40 PM CT: the V3 "No Account" outage.
const rows = [['426899', 'Serene Dental', 'V4', false], ['426911', 'Hancock Eye Associates', 'V3', false], ['426913', 'Marshall Eye Care', 'No version', false], ['426920', 'Elite Dental', 'V3', true],
  ['426931', 'Serenity Grove Dental', 'V3', false], ['426940', 'Moore Dental Care', 'V3', false], ['426947', 'Wall Street Ortho', 'V3', false], ['426957', 'Congo Dental Studio', 'V3', true], ['426963', 'Adkins Chiropractic', 'V3', true]]
  .map(([n, p, v, na], i) => ({ ticket_number: n, practice: p, voice_version: v, says_no_account: na, created_time: new Date(Date.UTC(2026, 10, 9, 18, 15 + i * 3)).toISOString(), web_url: 'https://desk/' + n }));

describe('outage watch (Batch 287)', () => {
  it('flags a spike on one voice version with the shared error', () => {
    const a = ow.assess(rows, 4);
    expect(a.spike).toBe(true);
    expect(a.version).toBe('V3');
    expect(a.noAccount).toBe(3);
    const d = ow.describe(a, rows);
    expect(d.headline).toMatch(/Possible phones outage on V3: 9 practices/);
    expect(d.asks[0]).toMatch(/parent Outage ticket/);
    expect(d.tickets).toHaveLength(9);
  });
  it('stays quiet on a normal morning', () => {
    expect(ow.assess(rows.slice(0, 3), 8).spike).toBe(false);
    expect(ow.assess(rows.slice(0, 6), 40).spike).toBe(false);
  });
  it('uses the prepared phone and voice views, never selecting the subject', () => {
    const sql = ow._sqlRecent(30);
    expect(sql).toMatch(/^WITH ticket_voice AS/);
    expect(sql).toMatch(/phone_kind = 'down'/);
    expect(sql.split(') SELECT').pop()).not.toMatch(/subject/);
  });
  it('Ask AI accepts the views and expands them', () => {
    const q = "SELECT coalesce(v.voice_version,'No version') AS version, count(*) AS n FROM desk_tickets d JOIN phone_tickets p ON p.ticket_id = d.id LEFT JOIN ticket_voice v ON v.ticket_id = d.id GROUP BY 1";
    expect(ta._checkSql(q)).toBeTruthy();
    expect(ta.expandVirtual(q)).toMatch(/^WITH ticket_voice AS \(.*\), phone_tickets AS \(/);
    expect(ta.expandVirtual('WITH x AS (SELECT 1) SELECT * FROM x JOIN phone_tickets p ON true')).toMatch(/^WITH phone_tickets AS \(.*\), x AS \(SELECT 1\)/);
  });
});

describe.skipIf(!sqlite3)('outage alerts are stored and closed', () => {
  beforeAll(async () => { ow.setDB(new sqlite3.Database(':memory:')); await ow.initSchema(); });
  it('opens, updates and shows the alert', async () => {
    let call = 0;
    ow.setDeps({ query: async (sql) => /count\(\*\) AS n/.test(sql) ? { rows: [{ n: 4 }] } : { rows: call++ === 0 ? rows : rows.slice(-2) } });
    const r1 = await ow.check({ force: true }); expect(r1.opened).toBeTruthy();
    const r2 = await ow.check({ force: true }); expect(r2.updated).toBe(true);
    const cur = await ow.current(); expect(cur.version).toBe('V3'); expect(cur.tickets.length).toBe(9);
    await ow.close(cur.id, 'a@adit.com'); expect(await ow.current()).toBe(null);
  });
});
