import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const st = require('../../lib/aditpay-stripe.js');

describe('Adit Pay Stripe data (Batch 358)', () => {
  it('reads the daily volume pivot', () => {
    const csv = 'Day,Nov 2026,Oct 2026,Total Amount\nGrand Total:,"13,695,859","26,794,366","40,490,225"\n1,"149,585","1,375,960","1,525,545"\n2,"1,225,841","633,508","1,859,349"\n31,,"104,953","104,953"\n';
    const p = st.parsePivot(csv);
    expect(p.months['2026-11']).toBe(13695859);
    expect(p.months['2026-10']).toBe(26794366);
    expect(p.days['2026-10-31']).toBe(104953);
    expect(p.days['2026-11-02']).toBe(1225841);
    expect(p.days['2026-11-31']).toBeUndefined();
  });
  it('only allows one SELECT on the Stripe tables, never card or customer columns', () => {
    expect(() => st.checkSql('SELECT COUNT(*) FROM "Charges (Stripe-Pozative)"')).not.toThrow();
    expect(() => st.checkSql('DELETE FROM "Charges (Stripe-Pozative)"')).toThrow();
    expect(() => st.checkSql('SELECT * FROM "Tickets (Zoho Desk)"')).toThrow();
    expect(() => st.checkSql('SELECT "Receipt Email" FROM "Charges (Stripe-Pozative)"')).toThrow();
    expect(() => st.checkSql('SELECT 1 FROM "Charges (Stripe-Pozative)"; DROP TABLE x')).toThrow();
  });
  it('runs a SQL export job and returns its rows', async () => {
    const calls = [];
    st.setDeps({ token: async () => 't', sleep: 0, fetch: async (url) => {
      calls.push(url);
      if (/\/bulk\/workspaces\/\d+\/data/.test(url)) return { ok: true, status: 200, json: async () => ({ data: { jobId: 'j1' } }) };
      if (/exportjobs\/j1\/data/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ n: '3' }] }) };
      return { ok: true, status: 200, json: async () => ({ data: { jobStatus: 'JOB COMPLETED' } }) };
    } });
    const rows = await st.sql('SELECT COUNT(*) AS "n" FROM "Charges (Stripe-Pozative)"');
    expect(rows).toEqual([{ n: '3' }]);
    expect(calls.length).toBe(3);
  });
  it('reads only the practice names from the Stripe accounts table (Batch 359)', () => {
    expect(() => st.checkSql(st.PROBES.top('2026-10-18 00:00:00'))).not.toThrow();
    expect(() => st.checkSql('SELECT "Dob Year" FROM "Accounts (Stripe-Pozative)"')).toThrow();
    expect(() => st.checkSql('SELECT "Personal Address line1" FROM "Accounts (Stripe-Pozative)"')).toThrow();
    expect(() => st.checkSql('SELECT * FROM "Accounts (Stripe-Pozative)"')).toThrow();
  });
});
