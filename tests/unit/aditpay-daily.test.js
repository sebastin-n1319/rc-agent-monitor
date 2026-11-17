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
      { who: 0, purpose: 'Adit Pay Training / Walkthrough', is_call: true, duration_seconds: 900, start_at: '2026-11-13T18:00:00Z', subject: 'Call with Aurora Dental Office Contact (+1720)' },
      { who: 1, purpose: '', is_call: false, duration_seconds: 1800, start_at: '2026-11-13T19:00:00Z', subject: 'Adit Pay onboarding' },
      { who: 1, purpose: 'Adit Pay Demo/Signups', is_call: false, start_at: '2026-11-13T20:00:00Z' },
      { who: 1, purpose: '', is_call: false, start_at: '2026-11-13T21:00:00Z', subject: 'Adit Pay Live Server Access: #425803' },
      { who: 1, purpose: 'Adit Pay Training / Walkthrough', is_call: false, start_at: '2026-11-13T22:00:00Z', subject: 'Follow up on payout ticket' },
      { who: 1, purpose: '', is_call: false, start_at: '2026-11-13T23:00:00Z', subject: 'Weekly sync' },
    ] }; } });
    const r = await d.sessions('2026-11-13', ['a@x.com', 'b@x.com']);
    // Batch 371: short recorded calls tagged training, ticket follow-ups and untagged meetings are not sessions
    expect(r['a@x.com']).toMatchObject({ training: 1, total: 1 });
    expect(r['a@x.com'].skipped.map((x) => x.why)).toEqual(['phone call, not a booked session', 'phone call, not a booked session']); // the plain support call is not listed
    expect(r['b@x.com']).toMatchObject({ training: 1, demo: 1, total: 2 });
    expect(r['b@x.com'].skipped.map((x) => x.why)).toEqual(['ticket follow-up', 'ticket follow-up', 'not a demo or training']);
    expect(sql).not.toMatch(/SELECT[^]*organizer_email[^]*FROM/i.test(sql.split('FROM')[0]) ? /x^/ : /x^/);
    expect(sql.split('FROM')[0]).not.toMatch(/organizer_email\s+AS|,\s*organizer_email/);
    expect(sql).toMatch(/America\/Chicago/);
  });
  it('writes the Chat post in the team\'s format', () => {
    const t = d.chatText({ name: 'Pat', calls: { total: 25, inbound: 3, outbound: 22 }, tickets: { new: 3, followup: 12 }, sessions: { total: 0 } });
    expect(t).toMatch(/Calls handled: 25/); expect(t).toMatch(/Existing ticket follow-ups: 12/); expect(t).toMatch(/Tickets: 15/);
  });
});

describe('Adit Pay call split (Batch 363)', () => {
  it('splits answered incoming calls into queue and direct, and counts dials as outgoing', () => {
    const s = d.splitCalls([
      { direction: 'Inbound', result: 'Accepted', duration: 300, queue_name: 'Adit Pay' },
      { direction: 'Inbound', result: 'Accepted', duration: 200, queue_name: 'Adam Wilson' },
      { direction: 'Inbound', result: 'Call connected', duration: 90, queue_name: '' },
      { direction: 'Inbound', result: 'Missed', duration: 0, queue_name: 'Adit Pay' },
      { direction: 'Inbound', result: 'Voicemail', duration: 30, is_voicemail: 1, queue_name: 'Adam Wilson' },
      { direction: 'Outbound', result: 'Call connected', duration: 120, queue_name: 'Client' },
    ], 'Adam Wilson');
    expect(s).toMatchObject({ queue: 1, direct: 2, byQueue: { 'Adit Pay': 1 }, missedQueue: 1, missedDirect: 0, outbound: 1 });
    const t = d.chatText({ name: 'A', calls: { total: 4, inbound: 3, outbound: 1, split: s }, tickets: {}, sessions: {} });
    expect(t).toContain('from the queue: 1, direct to my number or ext: 2');
    expect(t).toContain('Outgoing calls (callbacks included): 1');
  });
});
