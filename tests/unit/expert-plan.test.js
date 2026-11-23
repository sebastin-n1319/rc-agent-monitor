import { describe, it, expect, beforeEach } from 'vitest';
const P = require('../../lib/expert-plan');

describe('Expert lookups the Aria way (Batch 400)', () => {
  beforeEach(() => P._reset());
  it('runs only one read-only SELECT that selects no contact column', () => {
    expect(P.safeSql('select a.account_name from crm_accounts a where a.phone ilike \'%904%\'').ok).toBe(true);
    expect(P.safeSql('select email from crm_contacts').ok).toBe(false);
    expect(P.safeSql('select c.mobile, c.full_name from crm_contacts c').ok).toBe(false);
    expect(P.safeSql('select * from desk_tickets').ok).toBe(false);
    expect(P.safeSql('select count(*) from desk_tickets').ok).toBe(true);
    expect(P.safeSql('delete from desk_tickets').ok).toBe(false);
    expect(P.safeSql('select 1; drop table x').ok).toBe(false);
    expect(P.safeSql('select id from desk_tickets').sql).toMatch(/limit 50$/);
  });
  it('plans once, runs the lookups together, repairs a failed query once, then writes the findings', async () => {
    const sql = [], aiCalls = [];
    P.setDeps({
      mcp: {
        call: async (name, args) => {
          if (name === 'data_dictionary') return { text: 'desk_tickets(ticket_number, subject, status)' };
          sql.push(args.sql);
          return /bad_col/.test(args.sql) ? { isError: true, text: 'column bad_col does not exist' } : { text: '[{"ticket_number":"430001","status":"Closed"}]' };
        },
        instructions: async () => '',
      },
      ai: { claudeJSON: async ({ feature, user }) => {
        aiCalls.push(feature);
        if (/:plan$/.test(feature) && /failed/.test(user)) return { json: { lookups: [{ why: 'Fixed', sql: 'select ticket_number from desk_tickets' }] } };
        if (/:plan$/.test(feature)) return { json: { lookups: [{ why: 'Similar tickets', sql: 'select ticket_number, status from desk_tickets' }, { why: 'Broken', sql: 'select bad_col from desk_tickets' }], more: false } };
        return { json: { text: 'ACCOUNT: n/a\nFINDINGS:\n- #430001 closed [Desk ticket #430001]' } };
      } },
    });
    const r = await P.run({ goal: 'precedent', question: 'How was this handled before?', ticketText: 'Ticket text' });
    expect(aiCalls).toEqual(['expert-plan:precedent:plan', 'expert-plan:precedent:plan', 'expert-plan:precedent:write']);
    expect(sql.length).toBe(3);
    expect(r.summary).toMatch(/#430001/);
    expect(r.steps.length).toBe(3);
  });
});
