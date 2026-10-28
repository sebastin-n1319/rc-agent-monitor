import { describe, it, expect, vi } from 'vitest';
const analytics = require('../../lib/analytics-service.js');

describe('monthly QA from Zoho CRM Call Audits', () => {
  it('averages each agent\'s audits completed in the month, leaving out Not Relevant and Disconnected', async () => {
    vi.spyOn(analytics, 'getSuiteAccessToken').mockResolvedValue('t');
    const seen = [];
    global.fetch = vi.fn(async (url, o) => { seen.push(JSON.parse(o.body).select_query); return { ok: true, status: 200, text: async () => JSON.stringify({ data: [
      { 'Callee_Details_Name.email': 'Lincy@adit.com', Total_Score_Formula: 90 }, { 'Callee_Details_Name.email': 'lincy@adit.com', Total_Score_Formula: 95 },
      { 'Callee_Details_Name.email': 'sky.gibson@adit.com', Total_Score_Formula: 88 }], info: { more_records: false } }) }; });
    const { monthQA } = require('../../lib/crm-qa.js');
    const m = await monthQA('2026-09');
    expect(m.get('lincy@adit.com')).toEqual({ qa: 92.5, audits: 2 });
    expect(m.get('sky.gibson@adit.com')).toEqual({ qa: 88, audits: 1 });
    expect(seen[0]).toContain("Audit_Complete_Date between '2026-09-01' and '2026-09-30'");
    expect(seen[0]).toContain("Stage not in ('Not Relevant','Disconnected')");
  });
});
