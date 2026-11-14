import { describe, it, expect } from 'vitest';
const sqlite3 = require('sqlite3');
const sg = require('../../lib/storage-guard.js');
const usage = require('../../lib/ai-usage.js');

describe('Storage guard and AI budget (Batch 342)', () => {
  it('trims the ticket-read cache by age and size, keeps recent AI reads, and empties unused vectors', async () => {
    const db = new sqlite3.Database(':memory:'); sg.setDB(db);
    const run = (s, p = []) => new Promise((r, j) => db.run(s, p, (e) => e ? j(e) : r()));
    await run(`CREATE TABLE expert_cache (k TEXT PRIMARY KEY, v TEXT, at INTEGER)`);
    await run(`CREATE TABLE expert_vec (k TEXT PRIMARY KEY, h TEXT, v BLOB)`);
    const now = Date.now(), d = 864e5, big = 'x'.repeat(300000);
    await run(`INSERT INTO expert_cache VALUES ('th:old', ?, ?), ('th:new', ?, ?), ('img:old', 'desc', ?), ('img:mid', 'desc', ?)`, [big, now - 20 * d, big, now, now - 70 * d, now - 30 * d]);
    await run(`INSERT INTO expert_vec VALUES ('a', 'h', x'00')`);
    const r = await sg.trimCache(30);
    expect(r.raw).toBe(1); expect(r.ai).toBe(1);
    const left = await new Promise((res) => db.all(`SELECT k FROM expert_cache ORDER BY k`, (e, x) => res(x.map((y) => y.k))));
    expect(left).toEqual(['img:mid', 'th:new']);
    await sg.trimCache(0.1); // over the cap: raw copies go first
    const left2 = await new Promise((res) => db.all(`SELECT k FROM expert_cache ORDER BY k`, (e, x) => res(x.map((y) => y.k))));
    expect(left2).toEqual(['img:mid']);
    delete process.env.EXPERT_HYBRID;
    expect(await sg.clearVectors()).toBe(1);
  });
  it('only warns about the daily background budget; pauses nothing unless pause mode is set on purpose', async () => {
    usage._reset();
    process.env.AI_BACKGROUND_BUDGET_USD = '1';
    process.env.AI_BUDGET_MODE = 'pause';
    expect(await usage.overBudget('ticket-triage')).toBe(false);
    await usage.record({ feature: 'ticket-triage', model: 'claude-sonnet-5-5', usage: { input_tokens: 600000, output_tokens: 0 } });
    usage._reset(); await usage.record({ feature: 'ticket-triage', model: 'claude-sonnet-5-5', usage: { input_tokens: 600000, output_tokens: 0 } });
    expect(await usage.overBudget('ticket-triage')).toBe(true); // $1.20 spent of $1, pause mode on purpose
    delete process.env.AI_BUDGET_MODE;
    expect(await usage.overBudget('ticket-triage')).toBe(false); // default: warning only, the job keeps running
    expect((await usage.budgetStatus()).mode).toBe('alert');
    expect((await usage.budgetStatus()).spentUSD).toBe(1.2);
    delete process.env.AI_BACKGROUND_BUDGET_USD;
    expect(await usage.overBudget('expert')).toBe(false); // a person is waiting on Expert: never paused
  });
});
