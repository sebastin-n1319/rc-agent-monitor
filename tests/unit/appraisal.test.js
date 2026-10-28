import { describe, it, expect } from 'vitest';
const A = require('../../lib/appraisal.js');

// Sabrina's Nov 2025 to Apr 2026 sheet
const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];
const V = {
  '2025-11': { calls: 247, chats: null, tickets: 74, csat: 90.91, fcr: 66, qa: 84, days: 17, shrink: 0 },
  '2025-12': { calls: 273, chats: null, tickets: 118, csat: 100, fcr: 64, qa: 85.52, days: 20, shrink: 0 },
  '2026-01': { calls: 34, chats: 341, tickets: 108, csat: 100, fcr: 77.8, qa: 81.42, days: 20, shrink: 0 },
  '2026-02': { calls: 216, chats: null, tickets: 129, csat: 100, fcr: 75.97, qa: 80.12, days: 18, shrink: 0 },
  '2026-03': { calls: 278, chats: null, tickets: 124, csat: 100, fcr: 69.35, qa: 79.4, days: 20, shrink: 0 },
  '2026-04': { calls: 229, chats: null, tickets: 133, csat: 100, fcr: 67.67, qa: 82.45, days: 21, shrink: 0 },
};

describe('appraisal ratings follow the appraisal sheet', () => {
  const s = A.score(months, V);
  const k = (key) => s.kpis.find((x) => x.key === key);
  it('rates each month by the sheet thresholds (every month, April included)', () => {
    expect(k('calls').monthly).toEqual([5, 5, 1, 5, 5, 5]);
    expect(k('chats').monthly).toEqual([null, null, 5, null, null, null]);
    expect(k('tickets').monthly).toEqual([3, 4, 4, 5, 4, 4]);
    expect(k('csat').monthly).toEqual([5, 5, 5, 5, 5, 5]);
    expect(k('fcr').monthly).toEqual([3, 2, 5, 5, 3, 3]);
    expect(k('qa').monthly).toEqual([3, 4, 3, 3, 2, 3]);
  });
  it('averages months into KPIs, KPIs into KRAs and KRAs into the overall rating', () => {
    expect(k('calls').rating).toBe(4.33);
    expect(k('chats').rating).toBe(5);
    expect(s.kras.map((x) => x.name)).toEqual(['Productivity', 'Performance', 'People Excellence']);
    expect(s.overall).not.toBeNull();
  });
  it('does not rate a blank or zero value', () => {
    expect(A.rateValue(A.KPIS[0], 0, 20)).toBeNull();
    expect(A.rateValue(A.KPIS[0], null, 20)).toBeNull();
    expect(A.rateValue(A.KPIS[0], 100, 0)).toBeNull();
  });
});
