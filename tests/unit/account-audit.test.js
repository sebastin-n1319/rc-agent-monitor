import { describe, it, expect } from 'vitest';
const AA = require('../../lib/account-audit');

describe('Account audit for Expert (Batch 413)', () => {
  it('only runs when the question asks about the account history', () => {
    expect(AA.wants('audit the complete account and let me know how to handle this')).toBe(true);
    expect(AA.wants('how many times has this happened')).toBe(true);
    expect(AA.wants('how do I resend a form')).toBe(false);
  });
  it('counts the whole history in code and builds the tables and chart from the same rows', async () => {
    const rows = [
      { ticket_number: '432855', subject: 'Adit Pay - Insufficient Balance to Process Refunds', created_time: '2026-11-24', adit_app_module: 'Adit Pay' },
      { ticket_number: '264652', subject: 'Unable to refund or void Adit Pay payment', created_time: '2025-07-07', closed_time: '2025-07-20', adit_app_module: 'Adit Pay' },
      { ticket_number: '171961', subject: 'Refunds blocked insufficient balance', created_time: '2024-04-16', closed_time: '2024-05-16', adit_app_module: 'Adit Pay' },
      { ticket_number: '169130', subject: 'Refund card payment', created_time: '2024-04-02', closed_time: '2024-04-03', adit_app_module: 'Adit Pay' },
      { ticket_number: '427301', subject: 'Green Tree EHR Disconnected', created_time: '2026-11-08', adit_app_module: 'Integrations' },
    ].concat(Array.from({ length: 12 }, (_, i) => ({ ticket_number: String(400000 + i), subject: 'Phone line ' + (i % 2 ? 'not ringing' : 'call drops'), created_time: '2026-0' + (1 + (i % 9)) + '-01', closed_time: '2026-10-01', adit_app_module: 'Voice' })));
    AA.setDeps({ ariaOn: () => true, aria: async (n, a) => ({ text: JSON.stringify(/from escalations/.test(a.sql) ? [{ id: 'ESC-3952', escalation_status: 'De-Escalated', tier1_date: '2025-07-08', client_concerns: 'Adit Pay refunds' }] : rows) }) });
    const r = await AA.forAccount({ number: '12345', name: 'Polish Crown Dental', ticket: '432855', subject: 'Adit Pay - Insufficient Balance to Process Refunds', question: 'client needs a transaction refunded' });
    expect(r.text).toMatch(/17 tickets/);
    expect(r.text).toMatch(/#264652/);
    expect(r.visuals[0].rows.map((x) => x[0])).not.toContain('#427301');
    expect(r.visuals.find((v) => v.type === 'table').rows.length).toBeGreaterThanOrEqual(3);
    expect(r.visuals.some((v) => v.type === 'bar')).toBe(true);
    expect(r.text).toMatch(/ESCALATIONS ON THE ACCOUNT:\n- 2025-07-08 De-Escalated/);
  });
});
