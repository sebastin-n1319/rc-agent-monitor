import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const ta = require('../../lib/ticket-ask.js');
const th = require('../../lib/ticket-hygiene.js');

describe('ticket ask SQL guard', () => {
  it('allows reads over Desk tables, EXTRACT FROM and quoted values', () => {
    expect(() => ta._checkSql("SELECT owner_team_name, avg(extract(epoch from (closed_time - created_time))/3600) h FROM desk_tickets WHERE cf_ai_category_by_llm ILIKE '%missed call%' GROUP BY 1")).not.toThrow();
    expect(() => ta._checkSql("WITH t AS (SELECT id FROM desk_tickets) SELECT count(*) FROM t JOIN desk_ticket_threads th ON th.ticket_id = t.id")).not.toThrow();
  });
  it('blocks writes, other tables, contact details and message text', () => {
    expect(() => ta._checkSql('DELETE FROM desk_tickets')).toThrow();
    expect(() => ta._checkSql('SELECT 1; SELECT 2')).toThrow();
    expect(() => ta._checkSql('SELECT * FROM crm_deals')).toThrow(/not available/);
    expect(() => ta._checkSql('SELECT email FROM desk_tickets')).toThrow(/contact/);
    expect(() => ta._checkSql('SELECT subject FROM desk_tickets')).toThrow(/contact/);
    expect(() => ta._checkSql('SELECT content FROM desk_ticket_threads')).toThrow(/contact/);
  });
});

describe('ticket ask flow', () => {
  beforeAll(async () => {
    const db = new sqlite3.Database(':memory:'); ta.setDB(db); await ta.initSchema(); ta._resetValues();
    let call = 0;
    ta.setDeps({
      query: async (sql) => /GROUP BY 1 ORDER BY 2 DESC LIMIT/.test(sql) && /interval '120 days'/.test(sql) ? { rows: [{ v: 'T1 - Customer Support', n: 10 }] } : { rows: [{ owner_team_name: 'VoIP Support', n: 12 }, { owner_team_name: 'Tech CSM', n: 5 }] },
      ai: { isAnthropicConfigured: () => false, bestJSON: async () => (++call === 1
        ? { json: { title: 'Open by team', queries: [{ purpose: 'Open tickets per team', sql: 'SELECT owner_team_name, count(*) n FROM desk_tickets GROUP BY 1', chart: 'bar', label: 'owner_team_name', value: 'n' }, { purpose: 'bad', sql: 'DROP TABLE x' }], assumptions: 'Open now' } }
        : { json: { answer: 'VoIP Support has the most open tickets (*12*).' } }) },
    });
  });
  it('plans, runs, answers and keeps history per person', async () => {
    const r = await ta.ask({ question: 'Which team has the most open tickets?', by: 'A@adit.com' });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ chart: 'bar', count: 2 });
    expect(r.answer).toMatch(/VoIP Support/);
    expect((await ta.history('a@adit.com')).length).toBe(1);
    expect((await ta.getAsk(r.id, 'a@adit.com')).title).toBe('Open by team');
    await expect(ta.getAsk(r.id, 'b@adit.com')).rejects.toThrow();
  });
});

describe('owner path', () => {
  it('counts moves and teams outside T1', () => {
    const teams = new Map([['sky gibson', 'T1 - Customer Support'], ['ayush nainwal', 'Engineering']]);
    const p = th._ownerPath('Owner changed to Sky Gibson on 2026-10-28 09:21:29 | Role : CEO\nOwner changed to Sky Gibson on 2026-10-28 10:00:00 | Role : T1\nOwner changed to Ayush Nainwal on 2026-10-30 11:21:10 | Role : Engineering\nOwner changed to Sky Gibson on 2026-10-30 14:34:48 | Role : T1 Support', teams);
    expect(p.hops).toBe(2); expect(p.owners).toBe(2); expect(p.teams).toEqual(['Engineering']);
  });
  it('never returns Other as a category', () => {
    expect(th._newCategory('Other')).toBe(null); expect(th._normCategory('Others')).toBe(null);
    expect(th._newCategory('online booking')).toBe('Online Booking');
  });
});
