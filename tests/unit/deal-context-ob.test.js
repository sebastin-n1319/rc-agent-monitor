import { describe, it, expect } from 'vitest';
const crm = require('../../lib/crm-qa.js');
const dc = require('../../lib/deal-context.js');

describe('onboarding owner from Tech-OB records', () => {
  it('takes the newest record that has a stage, not a newer empty one', async () => {
    const real = crm.coql;
    crm.coql = async () => ({ data: [
      { Name: 'TO - 3924', 'Owner.first_name': 'Shikha', 'Owner.last_name': 'Rani', Stage: null },
      { Name: 'TO - 3336', 'Owner.first_name': 'Hannah', 'Owner.last_name': 'S', Stage: '10. Tech Onboarding Complete' },
    ] });
    try { expect((await dc.techObOwner('1607362000032808011')).name).toBe('Hannah S'); } finally { crm.coql = real; }
  });
  it('ignores ids that are not CRM ids', async () => { expect(await dc.techObOwner('abc')).toBeNull(); });
});
