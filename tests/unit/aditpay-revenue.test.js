import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = require('../../lib/aditpay-revenue.js');

describe('Adit Pay revenue analytics (Batch 374)', () => {
  it('fits a straight line and carries it forward with a range', () => {
    const f = R.fit([100, 110, 120, 130, 140, 150]);
    expect(Math.round(f.b)).toBe(10); expect(Math.round(f.a)).toBe(100); expect(f.miss).toBeCloseTo(0, 5);
  });
  it('spreads a month over its days by weekday and the days add up to the month', () => {
    const w = [0.2, 1.3, 1.3, 1.3, 1.3, 1.2, 0.4];
    const d = R.split('2026-12', 31000, w);
    expect(d).toHaveLength(31);
    expect(Math.round(d.reduce((s, x) => s + x.amount, 0))).toBe(31000);
    expect(d.find((x) => x.date === '2026-12-07').amount).toBeGreaterThan(d.find((x) => x.date === '2026-12-06').amount); // Monday over Sunday
  });
  it('builds past six months, this month and six forecast months from Stripe day rows', () => {
    const rows = [];
    for (let i = 0; i < 200; i++) {
      const dt = new Date(Date.UTC(2026, 4, 1) + i * 864e5); if (dt.toISOString().slice(0, 10) >= '2026-11-17') break;
      const [y, m, d] = dt.toISOString().slice(0, 10).split('-').map(Number);
      const wk = [0, 6].includes(dt.getUTCDay()) ? 0.3 : 1;
      rows.push({ y, m, d, t: 'application_fee', a: 20000 * wk, n: 100 }, { y, m, d, t: 'charge', a: 800000 * wk, n: 3000 }, { y, m, d, t: 'network_cost', a: -14000 * wk, n: 1 }, { y, m, d, t: 'stripe_fee', a: -2000 * wk, n: 1 });
    }
    const out = R.compute(R.byDay(rows), '2026-11-17');
    expect(out.past.map((p) => p.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(out.forecast.map((p) => p.month)).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(out.past[5].net).toBeCloseTo(out.past[5].revenue - out.past[5].costs, 2);
    expect(out.forecast[0].days).toHaveLength(31);
    expect(out.current.projected.revenue).toBeGreaterThan(out.current.toDate.revenue);
    expect(out.method.text.length).toBe(5);
  });
});
