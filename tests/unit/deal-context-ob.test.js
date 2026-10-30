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
  it('puts the live CRM stage, CSM and OB over the Desk copies', async () => {
    const real = crm.coql;
    crm.coql = async (q) => /from Deals/.test(q)
      ? { data: [{ Stage: 'CSM', 'Account_Manager.first_name': 'Richard', 'Account_Manager.last_name': 'Marshall', Escalation_Status: 'Escalated - Tier 2' }] }
      : { data: [{ 'Owner.first_name': 'Shikha', 'Owner.last_name': 'Rani', Stage: null }, { 'Owner.first_name': 'Hannah', 'Owner.last_name': 'S', Stage: 'Complete' }] };
    try {
      const row = await dc.freshen({ aria_deal_id: '1607362000099999999', cf_deal_stage: 'Onboarding', cf_csm_account_manager: 'Old CSM', cf_onboarding_owner: 'Shikha Rani' });
      expect([row.cf_deal_stage, row.cf_csm_account_manager, row.cf_onboarding_owner]).toEqual(['CSM', 'Richard Marshall', 'Hannah S']);
    } finally { crm.coql = real; }
  });
  it('ignores ids that are not CRM ids', async () => { expect(await dc.techObOwner('abc')).toBeNull(); });
});
