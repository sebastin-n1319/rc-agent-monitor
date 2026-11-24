import { describe, it, expect } from 'vitest';
const N = require('../../lib/ticket-doc-note');

describe('Shared emails and the escalation line (Batch 411, #432551)', () => {
  const t = { ticketNumber: '432551', email: 'info@example.com', contact: { firstName: 'Susan' } };
  it('a shared email is not filled from the email, and the escalation waits for the practice', () => {
    const crm = { header: {}, facts: null, ambiguous: [{ name: 'Pleasant Dental', number: '' }, { name: 'Maple Way Dental Care', number: '' }], sharedEmail: ['Pleasant Dental', 'Maple Way Dental Care'],
      escAlert: { tier: '1', id: 'ESC-6097' }, practiceCheck: { shared: true, practices: ['Pleasant Dental', 'Maple Way Dental Care'] } };
    const h = N.header(t, crm, null, null);
    expect(h['Practice Name']).toBe('Shared email: Pleasant Dental or Maple Way Dental Care, please confirm');
    expect(h['Any Escalation Ticket Open']).toBe('Check after the practice is confirmed');
  });
  it('after the account check finds another practice, the first practice\'s alert no longer counts', () => {
    const crm = { header: { account: 'Pleasant Dental' }, account: { name: 'Pleasant Dental', number: '40671' }, facts: {}, confirmed: true, matchedBy: 'the account number an agent documented',
      mismatch: { linkedName: 'Maple Way Dental Care', linkedNumber: '68031', number: '40671', name: 'Pleasant Dental' }, escAlert: { tier: '1', id: 'ESC-6097' } };
    const h = N.header(t, crm, null, null);
    expect(h['Any Escalation Ticket Open']).toBe('No');
    expect(h['Account Check']).toMatch(/Maple Way/);
  });
  it('without any doubt about the practice, the alert still counts', () => {
    const crm = { header: {}, account: { name: 'Maple Way Dental Care', number: '68031' }, facts: {}, escAlert: { tier: '1', id: 'ESC-6097' } };
    expect(N.header(t, crm, null, null)['Any Escalation Ticket Open']).toBe('Yes - Tier 1 (ESC-6097)');
  });
});
