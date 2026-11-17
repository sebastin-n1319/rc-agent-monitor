import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = require('../../lib/aditpay-revenue.js');

// three and a half years of days: 2% monthly growth, December 20% low, weekends 25% of a weekday
function history(today) {
  const v = {}, f = {};
  for (let t = Date.UTC(2023, 0, 1); ; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10); if (d >= today) break;
    const mi = (Number(d.slice(0, 4)) - 2023) * 12 + Number(d.slice(5, 7)) - 1;
    const wk = [0, 6].includes(new Date(t).getUTCDay()) ? 0.25 : 1;
    const amt = 100000 * Math.pow(1.02, mi) * (d.slice(5, 7) === '12' ? 0.8 : 1) * wk;
    v[d] = amt; f[d] = { revenue: amt * 0.025, costs: amt * 0.021 };
  }
  return { v, f };
}
describe('Adit Pay revenue forecast from the whole history (Batch 376)', () => {
  it('finds the growth, the December dip and the weekday pattern, and tests itself', () => {
    const { v, f } = history('2026-11-17');
    const o = R.compute(v, f, '2026-11-17');
    expect(o.firstMonth).toBe('2023-01');
    expect(o.model.growthPerMonth).toBeGreaterThan(1.5); expect(o.model.growthPerMonth).toBeLessThan(2.5);
    expect(o.model.seasonality.find((s) => s.month === 'Dec').index).toBeLessThan(0.9);
    expect(o.model.weekday.find((w) => w.day === 'Mon').volume).toBeGreaterThan(o.model.weekday.find((w) => w.day === 'Sun').volume * 3);
    expect(o.model.mape).toBeLessThan(5);
    expect(o.model.takeRate).toBeCloseTo(0.025, 4);
    expect(o.forecast.map((x) => x.month)).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(o.forecast[0].volume).toBeLessThan(o.forecast[1].volume); // December dip
    expect(o.grid).toHaveLength(19);
    const dec = o.grid.find((g) => g.month === '2026-12');
    expect(dec.days).toHaveLength(31); expect(Math.round(dec.days.reduce((s, x) => s + x.volume, 0))).toBe(Math.round(o.forecast[0].volume));
    const nov = o.grid.find((g) => g.month === '2026-11');
    expect(nov.days[0].expected).toBe(false); expect(nov.days[20].expected).toBe(true);
    expect(o.method).toHaveLength(7);
  });
});
