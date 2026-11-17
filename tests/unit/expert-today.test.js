import { describe, it, expect } from 'vitest';
const T = require('../../lib/expert-today.js');
// Batch 381: today's top issues per team as sample Expert questions.
describe('expert-today', () => {
  it('returns the fixed questions for the team before the first build, then the live themes with answers', async () => {
    let asked = [], sqls = [];
    T.setDeps({
      query: async (sql) => { sqls.push(sql); return { rows: Array.from({ length: 10 }, (_, i) => ({ subject: 'Payout missing ' + i, summary: 'payout', description: '' })) }; },
      ai: { bestJSON: async () => ({ json: { t: [
        { topic: 'Payouts', n: 6, module: 'Adit Pay', q: 'A payout has not reached the practice bank account. How do I check where it is?' },
        { topic: 'Bad', n: 2, module: 'Adit Pay', q: 'Dr. Smith says the card charge failed, why?' },
        { topic: 'Terminals', n: 2, module: 'Adit Pay', q: 'The card terminal shows offline. What do I check first?' }] } }) },
      expert: { ask: async (o) => { asked.push(o); return { found: true, answer: { answer: 'Check the payout in the Stripe dashboard.', steps: ['1. Open Payouts', '2. Find the date', '3. Check the status', '4. More'] }, sources: [1, 2] }; } },
    });
    const first = T.get('aditpay');
    expect(first.team).toBe('aditpay');
    expect(first.live).toBe(false);
    expect(first.items.map(x => x.q)).toEqual(T.FALLBACK.aditpay.map(x => x.q));
    await T._state.aditpay.busy;
    const r = T.get('aditpay');
    expect(r.live).toBe(true);
    expect(r.items.map(x => x.topic)).toEqual(['Payouts', 'Terminals']); // the one naming a doctor and an amount is dropped
    expect(r.items[0].answer.steps).toEqual(['Open Payouts', 'Find the date', 'Check the status']);
    expect(r.items[0].answer.sources).toBe(2);
    expect(asked.every(o => o.team === 'aditpay' && o.evalRun === true && o.mode === 'answer')).toBe(true);
    expect(sqls[0]).toContain("j_team_id = '197800000070274100'");
    expect(sqls[0]).not.toMatch(/email|phone/i);
  });
  it('falls back to the fixed questions when there are too few tickets', async () => {
    T.setDeps({ query: async () => ({ rows: [] }), ai: { bestJSON: async () => null }, expert: { ask: async () => ({ found: true, answer: { answer: 'x', steps: [] }, sources: [] }) } });
    T.get('t1'); await T._state.t1.busy;
    const r = T.get('t1');
    expect(r.live).toBe(false);
    expect(r.items.length).toBe(3);
  });
});
