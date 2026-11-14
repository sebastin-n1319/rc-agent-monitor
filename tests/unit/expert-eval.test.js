import { describe, it, expect } from 'vitest';
const sqlite3 = require('sqlite3');
const ev = require('../../lib/expert-eval.js');
const usage = require('../../lib/ai-usage.js');

describe('Expert before and after test (Batch 336)', () => {
  it('picks confirmed, non-ticket questions, runs old and new ways with metered cost, and maps the blind grade back', async () => {
    const db = new sqlite3.Database(':memory:'); ev.setDB(db); await ev.initSchema();
    await new Promise((r) => db.run(`CREATE TABLE expert_log (id INTEGER PRIMARY KEY, question TEXT, mode TEXT, answer_json TEXT, vote INTEGER, verified INTEGER, found INTEGER)`, r));
    const ans = JSON.stringify({ answer: 'Go to Engage > Auto-Reminders and click the pencil icon to edit the reminder text.', steps: ['Open Engage', 'Edit'] });
    const ins = (q, v) => new Promise((r) => db.run(`INSERT INTO expert_log (question, mode, answer_json, vote, verified, found) VALUES (?, 'answer', ?, ?, 1, 1)`, [q, ans, v], r));
    await ins('How do I edit the appointment reminder text?', 1);
    await ins('Why is ticket #429346 still open for this client?', 1);
    await ins('How do I edit the appointment reminder text?', null);
    const picked = await ev.pick(5);
    expect(picked.map((p) => p.question)).toEqual(['How do I edit the appointment reminder text?']);
    let graded = '';
    ev.setDeps({
      expert: { ask: async ({ noLibrary }) => { await usage.record({ feature: 'expert', model: 'claude-sonnet-5-5', usage: { input_tokens: noLibrary ? 100000 : 40000, output_tokens: 1000 } }); return { answer: { answer: noLibrary ? 'old way answer' : 'new way answer', steps: [] } }; } },
      ai: { bestJSON: async (o) => { graded = o.user; const newIsX = /ANSWER X:\nnew way/.test(o.user); return { json: { X: { accuracy: newIsX ? 5 : 3, completeness: 4, actionable: 4 }, Y: { accuracy: newIsX ? 3 : 5, completeness: 4, actionable: 4 }, better: newIsX ? 'X' : 'Y', why: 'more exact' } }; } },
    });
    const s = await ev.start({ n: 3 });
    expect(s.started).toBe(true);
    for (let i = 0; i < 50 && ev.status(); i++) await new Promise((r) => setTimeout(r, 20));
    const l = await ev.latest();
    expect(l.run.status).toBe('done');
    expect(l.run.summary.n).toBe(1);
    expect(l.run.summary.cost.old).toBeGreaterThan(l.run.summary.cost.new);
    expect(graded).toContain('REFERENCE (confirmed)');
    // X was the better one; the grade is mapped back to the right side whichever way it was shown
    const g = l.items[0].grade;
    expect(g.better).toBe('new'); expect(g.new.accuracy).toBe(5); expect(g.old.accuracy).toBe(3);
  });
});
