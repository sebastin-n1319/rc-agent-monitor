import { describe, it, expect } from 'vitest';
const T = require('../../lib/expert-ticket');

describe('Desk ticket links (Batch 412)', () => {
  it('a Desk link with the long internal id becomes the ticket number', async () => {
    T.setDesk({ isConfigured: () => true, fetchRaw: async (p) => (p === '/tickets/197800000487502330' ? { ticketNumber: '432855' } : null) });
    const q = await T.linkTickets('https://help.adit.com/agent/aditadvertising/support/tickets/details/197800000487502330\n\nclient needs a refund');
    expect(q).toMatch(/^ticket #432855/);
    expect(T.detect(q)).toBe('432855');
  });
  it('leaves other links alone', async () => {
    const q = 'see https://www.adit.com/help/forms';
    expect(await T.linkTickets(q)).toBe(q);
  });
});
