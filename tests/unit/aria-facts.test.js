import { describe, it, expect } from 'vitest';
const AF = require('../../lib/aria-facts');

describe("Aria's prepared ticket facts (Batch 406)", () => {
  it('reads the ticket, how the same issue was fixed before, EHR issues and escalations, with no contact columns', async () => {
    const seen = [];
    AF.setDeps({ ariaOn: () => true, aria: async (name, args) => {
      seen.push(args.sql);
      if (/from tickets where ticket_number/.test(args.sql)) return { text: JSON.stringify({ rows: [{ ticket_id: 't1', ticket_number: '430001', status: 'Open', adit_app_module: 'Patient Forms', ehr_pms: 'Dentrix', account_name: 'Smile Co', cs_subcategory: 'Forms Sync' }] }) };
      if (/where cs_subcategory = 'Forms Sync'/.test(args.sql)) return { text: JSON.stringify({ columns: ['ticket_number', 'subject', 'closed_time', 'custom_fix_solution'], rows: [['429000', 'Forms not syncing', '2026-11-01', 'Re-mapped the form fields']] }) };
      if (/from ehr_issues/.test(args.sql)) return { text: JSON.stringify([{ issue: 'Dentrix forms writeback delay', area: 'forms', times: 4, first_seen: '2026-10-20' }]) };
      if (/from escalations/.test(args.sql)) return { text: '[]' };
      return { text: '[]' };
    } });
    const r = await AF.forTicket('#430001');
    expect(r.text).toMatch(/SAME KIND OF TICKET \(Forms Sync\)/);
    expect(r.text).toMatch(/#429000.*Re-mapped the form fields/);
    expect(r.text).toMatch(/Dentrix forms writeback delay/);
    for (const q of seen) expect(q.split(/\bfrom\b/i)[0]).not.toMatch(/email|phone|mobile|contact_name/i);
  });
  it('gives nothing and never throws when Aria fails', async () => {
    AF.setDeps({ ariaOn: () => true, aria: async () => { throw new Error('down'); } });
    const r = await AF.forTicket('430001');
    expect(r.text).toBe('');
  });
});
