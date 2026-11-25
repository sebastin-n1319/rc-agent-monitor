import { describe, it, expect, beforeEach } from 'vitest';
const A = require('../../lib/assessments');
const sqlite3 = require('sqlite3');

const q = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

describe('Quick assign (Batch 418)', () => {
  let db, closedId, openId;
  beforeEach(async () => {
    db = new sqlite3.Database(':memory:'); A.setDB(db); await A.initSchema();
    const past = new Date(Date.now() - 3 * 864e5).toISOString();
    closedId = (await q(db, `INSERT INTO assess_tests (title, question_ids_json, settings_json, assign_json, status) VALUES (?,?,?,?,?)`,
      ['Starter part 1', '[1]', JSON.stringify({ closesAt: past, attempts: 1 }), JSON.stringify({ everyone: false, emails: ['agent.old@adit.com'] }), 'published'])).lastID;
    openId = (await q(db, `INSERT INTO assess_tests (title, question_ids_json, settings_json, assign_json, status) VALUES (?,?,?,?,?)`,
      ['Starter part 2', '[1]', JSON.stringify({ attempts: 3 }), JSON.stringify({ everyone: false, emails: [] }), 'published'])).lastID;
  });

  it('adds people, keeps existing ones, and opens a closed test only for the people picked', async () => {
    const r = await A.quickAssign({ testIds: [closedId, openId], emails: ['Agent.New@adit.com', 'agent.old@adit.com'], extendDays: 7, by: 'lead@example.com' });
    const c = r.results.find(x => x.id === closedId), o = r.results.find(x => x.id === openId);
    expect(c.added).toBe(1); expect(c.already).toBe(1); expect(c.extended).toBe(2);
    expect(o.added).toBe(2); expect(o.extended).toBe(0);
    const mine = await A.myTests('agent.new@adit.com');
    expect(mine.find(t => t.id === closedId).windowState).toBe('open');
    expect(mine.find(t => t.id === closedId).canStart).toBe(true);
    // someone else assigned earlier but not picked stays closed
    await q(db, `UPDATE assess_tests SET assign_json = ? WHERE id = ?`, [JSON.stringify({ everyone: false, emails: ['agent.old@adit.com', 'agent.new@adit.com', 'agent.other@adit.com'] }), closedId]);
    const other = await A.myTests('agent.other@adit.com');
    expect(other.find(t => t.id === closedId).windowState).toBe('closed');
  });

  it('does not extend when asked not to, and rejects empty picks', async () => {
    const r = await A.quickAssign({ testIds: [closedId], emails: ['agent.new@adit.com'], extendDays: 0 });
    expect(r.results[0].extended).toBe(0);
    expect((await A.myTests('agent.new@adit.com'))[0].windowState).toBe('closed');
    await expect(A.quickAssign({ testIds: [], emails: ['agent.x@adit.com'] })).rejects.toThrow(/assessment/);
    await expect(A.quickAssign({ testIds: [openId], emails: [] })).rejects.toThrow(/person/);
  });
});
