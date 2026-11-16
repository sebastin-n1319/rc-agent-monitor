import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ap = require('../../lib/aditpay-home.js');

describe('Adit Pay home (Batch 355)', () => {
  it('scopes every ticket query to the T2 Adit Pay team and leaves deleted tickets out', () => {
    for (const k of ['status', 'owners', 'oldest', 'flow', 'topics']) {
      const sql = ap._sql[k]();
      expect(sql).toMatch(/j_team_id = '197800000070274100'/);
      expect(sql).toMatch(/is_deleted/);
    }
    expect(ap._sql.oldest()).toMatch(/status <> 'Closed'/);
  });
  it('builds the summary and keeps going when one source is not readable', async () => {
    ap.setDeps({ stripe: { summary: async () => null }, coql: async (q) => {
      if (/from Stripe_Terminal/.test(q)) throw new Error('no CRM access');
      if (/Terminal_Count\) from Adit_Pay/.test(q)) return { data: [{ 'SUM(Transaction_Value_Last_30_Days)': 1000, 'SUM(Transaction_Value_CP_Last_30_Days)': 700, 'SUM(No_of_Transactions_Last_30_Days)': 10, 'SUM(No_of_CP_Transactions_Last_30_Days)': 6, 'SUM(Terminal_Count)': 4 }] };
      return { data: [] };
    }, query: async (sql) => {
      if (/GROUP BY 1 ORDER BY 2 DESC$/.test(sql.trim()) && /t\.status, count/.test(sql)) return { rows: [{ status: 'Open', n: 5 }, { status: 'Pending Customer', n: 2 }] };
      if (/AS who/.test(sql)) return { rows: [{ who: 'Sandy Clark (Adit Pay)', n: 4, stale: 2, oldest: '2026-10-01' }] };
      if (/aria_deal_rows/.test(sql)) return { rows: [{ deals: 10, mrr: '1234.5' }] };
      if (/aria_pay_category_history/.test(sql)) return { rows: [{ k: 3, label: '3. Has Terminal, Not Using Pay', n: 7 }, { k: 7, label: '7. Has Terminal, Using Pay', n: 20 }] };
      return { rows: [] };
    } });
    const s = await ap.summary({ fresh: true });
    expect(s.queue.open).toBe(7);
    expect(s.queue.owners[0].who).toBe('Sandy Clark');
    expect(s.revenue.mrr).toBe(1234.5);
    expect(s.terminals.withTerminal).toBe(27);
    expect(s.terminals.notUsing).toBe(7);
    expect(s.terminals.ok).toBe(false);
    expect(s.revenue.vol30).toBe(1000);
    expect(s.revenue.cnp30).toBe(300);
    expect(s.revenue.avgTicket).toBe(100);
    expect(s.terminals.cpShare).toBe(0.7);
    expect(s.missing).toContain('crm:termStatus');
    expect(s.errors['crm:termStatus']).toMatch(/no CRM access/);
    for (const k of ['vol90', 'top', 'termUsed']) expect(ap._coql[k]).not.toMatch(/> 0/);
  });
  it('takes volume, payments and the card present split from Stripe when it is there (Batch 358)', async () => {
    ap.setDeps({ stripe: { summary: async () => ({ at: 'x', volume: { last30: 26337205, last90: 89000000, months: [{ month: '2026-10', amount: 26794366 }], series: [] }, charges: { succeeded: 95300, succeededAmount: 26506423, failed: 4416, failedAmount: 2153964, declineRate: 0.044 }, channel: { cardPresent: { n: 81726, amount: 24586879 }, online: { n: 9709, amount: 1758065 }, other: { n: 3865, amount: 161478 } }, balance: { refunds: { n: 1018, amount: 246178 }, applicationFees: 663441, networkCost: 486275, stripeFees: 67000 }, failures: [], missing: [] }) },
      coql: async () => ({ data: [{ 'SUM(Transaction_Value_Last_30_Days)': 39309066 }] }), query: async () => ({ rows: [] }) });
    const s = await ap.summary({ fresh: true });
    expect(s.revenue.source).toBe('stripe');
    expect(s.revenue.vol30).toBe(26337205);
    expect(s.revenue.txns30).toBe(95300);
    expect(Math.round(s.revenue.cpShare * 100)).toBe(93);
    expect(s.terminals.vol30).toBe(24586879);
    expect(s.stripe.balance.refunds.n).toBe(1018);
  });
});
