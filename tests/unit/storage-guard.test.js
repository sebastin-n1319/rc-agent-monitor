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
describe('Low-disk compaction (Batch 345)', () => {
  it('needs a checked backup on the container disk, then compacts with the journal in memory and the file shrinks', async () => {
    const os = require('os'), fs = require('fs'), path = require('path');
    const file = path.join(os.tmpdir(), 'sg-test-' + Date.now() + '.db');
    const db = new sqlite3.Database(file); sg.setDB(db);
    const run = (s, p = []) => new Promise((r, j) => db.run(s, p, (e) => e ? j(e) : r()));
    await run(`PRAGMA journal_mode=WAL`);
    await run(`CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)`);
    await run('BEGIN'); for (let i = 0; i < 15000; i++) await run(`INSERT INTO t (v) VALUES (?)`, ['x'.repeat(2000)]); await run('COMMIT');
    await run(`DELETE FROM t WHERE id > 300`); await run(`PRAGMA wal_checkpoint(TRUNCATE)`);
    const size = () => Math.round(fs.statSync(file).size / 1048576 * 10) / 10;
    const fl = () => new Promise((r) => db.get(`PRAGMA freelist_count`, (e, x) => r(Object.values(x)[0] * 4096 / 1048576)));
    const vu = async () => ({ dbMB: size(), reclaimMB: Math.round(await fl()), freeMB: 1, pct: 99 }); // a full volume
    const before = size();
    expect((await sg.compact({ volumeUsage: vu, force: true })).skipped).toBe('needs a backup');
    const b = await sg.backup({ volumeUsage: vu });
    expect(b.mb).toBeGreaterThanOrEqual(0);
    expect(sg.backupInfo()).not.toBe(null);
    const c = await sg.compact({ volumeUsage: vu, force: true });
    expect(c).toMatchObject({ compacted: true, lowDisk: true, check: 'ok' });
    expect(size()).toBeLessThan(before / 2);
    const n = await new Promise((r) => db.get(`SELECT COUNT(*) AS n FROM t`, (e, x) => r(x.n)));
    expect(n).toBe(300);
    const jm = await new Promise((r) => db.get(`PRAGMA journal_mode`, (e, x) => r(Object.values(x)[0])));
    expect(jm).toBe('wal');
    db.close(); try { fs.unlinkSync(file); fs.unlinkSync(sg.backupPath()); } catch (e) { /* */ }
  }, 30000);
});
