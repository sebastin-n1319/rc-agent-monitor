import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const tr = require('../../lib/transfer-review.js');

const db = new sqlite3.Database(':memory:');
const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const LEAN = { '1': ['approve', 'right'], '2': ['rework', 'wrong'], '3': ['approve', 'unclear'] };

beforeAll(async () => {
  tr.setDB(db);
  await tr.initSchema();
  tr.setDeps({
    ai: { anyConfigured: () => true },
    ticketContext: async () => ({ items: [{ who: 'Client', text: 'My phones are down' }], ticket: {} }),
    aiCall: null,
  });
  for (const [t, to] of [['1', 'Vic VoIP'], ['2', 'Pat Pod'], ['3', 'Sam Sales'], ['4', null]]) {
    await q(`INSERT INTO tr_reviews (ticket_id, ticket_number, agent_email, source, state, left_at, to_agent, to_team) VALUES (?, ?, 'a@adit.com', 'bypass', 'moved', datetime('now'), ?, 'VoIP')`, [t, 'N' + t, to]);
  }
});

describe('AI auto-approval', () => {
  it('approves only a clear approve with a fitting destination', async () => {
    // Stand in for the AI read: lean per ticket.
    const real = tr.__setAnalysisForTest;
    expect(typeof real).toBe('function');
    tr.__setAnalysisForTest(async (id) => {
      const [r] = await q('SELECT ticket_id FROM tr_reviews WHERE id = ?', [id]);
      const l = LEAN[r.ticket_id];
      return { readable: true, analysis: { lean: l[0], fit: l[1], leanWhy: 'why ' + r.ticket_id, fitWhy: '' } };
    });
    const out = await tr.autoApprove({ max: 10 });
    expect(out.approved).toBe(1);
    const rows = await q('SELECT ticket_id, state, verdict, reviewer, ai_auto, ai_lean FROM tr_reviews ORDER BY ticket_id');
    expect(rows[0]).toMatchObject({ state: 'done', verdict: 'good', reviewer: 'ai', ai_auto: 1 });
    expect(rows[1]).toMatchObject({ state: 'moved', verdict: null, ai_lean: 'rework' });
    expect(rows[2]).toMatchObject({ state: 'moved', verdict: null, ai_lean: 'unclear' });
    expect(rows[3]).toMatchObject({ state: 'moved', verdict: null, ai_lean: null }); // no destination person: left for a SPOC
    const again = await tr.autoApprove({ max: 10 });
    expect(again.approved).toBe(0);
  });
  it('undo puts it back without re-approving', async () => {
    const [r] = await q(`SELECT id FROM tr_reviews WHERE ticket_id = '1'`);
    await tr.undoAi(r.id, { email: 'spoc@adit.com' });
    const [x] = await q('SELECT state, verdict, ai_auto FROM tr_reviews WHERE id = ?', [r.id]);
    expect(x).toMatchObject({ state: 'moved', verdict: null, ai_auto: 0 });
    expect((await tr.autoApprove({ max: 10 })).approved).toBe(0);
    await expect(tr.undoAi(r.id, { email: 'spoc@adit.com' })).rejects.toThrow();
  });
});
