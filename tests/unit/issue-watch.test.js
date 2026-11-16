import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }
const iw = require('../../lib/issue-watch.js');

const mk = (n, kind, who, text) => ({ kind, id: kind[0].toLowerCase() + n, number: String(n), url: '', who, at: new Date(Date.UTC(2026, 10, 16, 14, n % 30)).toISOString(), text });

describe('repeated-issue watch (Batch 351)', () => {
  it('needs 10 reports from at least 5 clients', () => {
    const items = Array.from({ length: 10 }, (_, i) => mk(i, i % 3 ? 'Ticket' : 'Chat', 'Practice ' + (i % 6), 'phones not ringing'));
    expect(iw.assess({ label: 'Phones not ringing', items }).spike).toBe(true);
    expect(iw.assess({ label: 'x', items: items.slice(0, 9) }).spike).toBe(false);
    const oneOffice = Array.from({ length: 12 }, (_, i) => mk(i, 'Call', 'Same Practice', 'phones down'));
    expect(iw.assess({ label: 'x', items: oneOffice }).spike).toBe(false);
  });
  it('describes the alert with sources and a parent-ticket ask', () => {
    const items = Array.from({ length: 11 }, (_, i) => mk(i, ['Ticket', 'Chat', 'Call'][i % 3], 'P' + i, 'calls going to voicemail'));
    const g = { label: 'Calls going straight to voicemail', product: 'Phones', items };
    const d = iw.describe(g, iw.assess(g), items[0].at);
    expect(d.kind).toBe('issue');
    expect(d.headline).toMatch(/11 reports from 11 clients/);
    expect(d.headline).toMatch(/tickets?, .*chats?, .*calls?/);
    expect(d.asks.join(' ')).toMatch(/VoIP/);
    expect(d.asks.join(' ')).toMatch(/parent Outage ticket/);
  });
  it('groups through the AI and maps ids back to reports', async () => {
    const items = [mk(1, 'Ticket', 'A', 'no dial tone'), mk(2, 'Chat', 'B', 'phones dead'), mk(3, 'Call', 'C', 'how do I add a user')];
    iw.setDeps({ ai: { chatJSON: async () => ({ json: { groups: [{ label: 'Phones down', product: 'Phones', ids: ['t1', 'c2', 'zz'] }] } }) } });
    const g = await iw._cluster(items);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((x) => x.who)).toEqual(['A', 'B']);
  });
  it('reads ticket and support-call text, newest window only', () => {
    expect(iw._sqlTickets(30)).toMatch(/interval '30 minutes'/);
    expect(iw._sqlCalls(45)).toMatch(/T1 CS Team/);
    expect(iw._sqlCalls(45)).not.toMatch(/subject/);
  });
  it.skipIf(!sqlite3)('opens one alert when a group crosses the line, then keeps it', async () => {
    const db = new sqlite3.Database(':memory:'); iw.setDB(db); await iw.initSchema();
    const rows = Array.from({ length: 12 }, (_, i) => ({ ticket_number: 500 + i, web_url: 'https://desk/' + i, practice: 'Office ' + i, created_time: new Date(Date.now() - i * 60000).toISOString(), subject: 'Phones not working', body: 'no dial tone' }));
    iw.setDeps({ query: async (sql) => ({ rows: /desk_tickets/.test(sql) ? rows : [] }), liveChat: { recentAll: async () => [] },
      ai: { chatJSON: async () => ({ json: { groups: [{ label: 'Phones not working', product: 'Phones', ids: rows.map((r) => 't' + r.ticket_number) }] } }) } });
    const r = await iw.check({ force: true });
    expect(r.opened).toBeTruthy();
    const cur = await iw.current();
    expect(cur.headline).toMatch(/12 reports from 12 clients/);
    const r2 = await iw.check({ force: true });
    expect(r2.updated).toBeTruthy();
  });
});
