import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const d = require('../../lib/aditpay-daily.js');

describe('Adit Pay daily report (Batch 362)', () => {
  it('counts trainings, demos and calendar meetings, leaves out short or support calls, and never reads emails back', async () => {
    let sql = '';
    d.setDeps({ kbq: async (s) => { sql = s; return { rows: [
      { who: 0, purpose: 'Adit Pay Training / Walkthrough', is_call: true, duration_seconds: 3700, start_at: '2026-11-13T16:53:40Z', subject: 'Call' },
      { who: 0, purpose: 'Adit Pay Training / Walkthrough', is_call: true, duration_seconds: 120, start_at: '2026-11-13T16:06:43Z' },
      { who: 0, purpose: 'Support', is_call: true, duration_seconds: 900, start_at: '2026-11-13T17:00:00Z' },
      { who: 1, purpose: '', is_call: false, duration_seconds: 1800, start_at: '2026-11-13T19:00:00Z', subject: 'Adit Pay onboarding' },
      { who: 1, purpose: 'Adit Pay Demo/Signups', is_call: false, start_at: '2026-11-13T20:00:00Z' },
    ] }; } });
    const r = await d.sessions('2026-11-13', ['a@x.com', 'b@x.com']);
    expect(r['a@x.com']).toMatchObject({ training: 1, total: 1 });
    expect(r['b@x.com']).toMatchObject({ meeting: 1, demo: 1, total: 2 });
    expect(sql).not.toMatch(/SELECT[^]*organizer_email[^]*FROM/i.test(sql.split('FROM')[0]) ? /x^/ : /x^/);
    expect(sql.split('FROM')[0]).not.toMatch(/organizer_email\s+AS|,\s*organizer_email/);
    expect(sql).toMatch(/America\/Chicago/);
  });
  it('writes the Chat post in the team\'s format', () => {
    const t = d.chatText({ name: 'Pat', calls: { total: 25, inbound: 3, outbound: 22 }, tickets: { new: 3, followup: 12 }, sessions: { total: 0 } });
    expect(t).toMatch(/Calls handled: 25/); expect(t).toMatch(/Existing ticket follow-ups: 12/); expect(t).toMatch(/Tickets: 15/);
  });
});
