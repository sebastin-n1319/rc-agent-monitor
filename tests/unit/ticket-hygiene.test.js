import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const th = require('../../lib/ticket-hygiene.js');

const NOW = Date.parse('2026-11-10T16:00:00Z'); // Tue 10:00 AM CT
const iso = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const T = (id, o) => Object.assign({ id, ticket_number: String(1000 + id), status: 'Open', priority: 'Medium', owner: 'Sky Gibson', account: 'Acct ' + id, subject: 'Subject ' + id, created_time: iso(200) }, o || {});
const out = (tid, h, txt, o) => Object.assign({ ticket_id: tid, direction: 'out', channel: 'EMAIL', created_time: iso(h), is_auto: false, is_staff: true, staff_name: 'Sky Gibson', txt }, o || {});
const inn = (tid, h, txt) => ({ ticket_id: tid, direction: 'in', channel: 'EMAIL', created_time: iso(h), is_auto: null, is_staff: false, txt });
const ack = (tid, h) => out(tid, h, 'Hi Dana, Thank you for calling Adit Support. Your ticket is open.', { is_auto: true, staff_name: null });
const note = (tid, h, txt, o) => Object.assign({ ticket_id: tid, is_private: true, created_time: iso(h), is_auto: false, is_staff: true, staff_name: 'Sky Gibson', txt }, o || {});

const tickets = [
  T(1, { created_time: iso(50) }),                                   // ack 48h ago, nothing since -> unactioned
  T(2, { created_time: iso(5) }),                                    // ack 4h ago -> new
  T(3),                                                              // client wrote after us -> followup
  T(4, { status: 'Pending Customer' }),                              // fix sent 4 days ago, chase label -> closure
  T(5, { status: 'Pending Customer', asana: 'https://app.asana.com/x' }), // same but dependency -> notdue
  T(6, { status: 'Pending Customer' }),                              // one email 3 days ago -> check
  T(7, { status: 'Pending Customer', owner: null }),                 // no owner, no contact -> unactioned nocontact
  T(8),                                                              // only internal note 30h ago -> followup note
  T(9, { status: 'Pending Customer', priority: 'Escalated - Tier 1' }), // client confirmed -> closure confirmed (esc)
];
const threads = [
  ack(1, 48), ack(2, 4),
  ack(3, 100), out(3, 90, 'We updated the forwarding.'), inn(3, 20, 'Still not ringing at the front desk.'),
  ack(4, 150), out(4, 120, 'Changed the call flow, please test.'), out(4, 100, 'Checking in, does it work now?', { channel: 'TELEPHONY', txt: '{"threadSubject":"Sky made an outbound call"}' }),
  ack(5, 150), out(5, 120, 'Changed the call flow, please test.'), out(5, 100, 'Checking in?'),
  ack(6, 150), out(6, 120, 'Fixed the greeting, let us know.'),
  ack(8, 150),
  ack(9, 150), out(9, 120, 'Reset the phone.'), inn(9, 60, 'Thanks, all working now!'),
];
const comments = [
  note(7, 150, 'RingCentral automation: Assigned to Riley Stone.', { is_auto: true, staff_name: null }),
  note(7, 100, 'Looked at the account settings.'),
  note(8, 30, 'Checked logs, looks like a carrier issue.'),
  note(1, 47, 'RingCentral automation: Assigned to Sky Gibson.', { is_auto: true, staff_name: null }),
];

let db;
beforeAll(async () => {
  db = new sqlite3.Database(':memory:');
  th.setDB(db); await th.initSchema();
  th.setDeps({
    query: async (sql) => /FROM desk_tickets/.test(sql) ? { rows: tickets } : /desk_ticket_threads/.test(sql) ? { rows: threads } : { rows: comments },
    ai: { anyConfigured: () => true, bestJSON: async ({ user }) => {
      const j = JSON.parse(user);
      return { items: j.tickets.map((t) => ({ id: t.id, client: /working now/.test(t.client_last) ? 'confirmation' : t.client_last ? 'new_question' : null, agent: /Checking|outbound/.test(t.agent_last) ? 'chase' : t.agent_last ? 'fix_answer' : null, promise: false, category: /Subject 3/.test(t.subject) ? 'VoIP & Phones' : 'nonsense', why: 'test' })) };
    } },
  });
});

describe('business hours', () => {
  it('counts only Mon to Fri 07:00 to 19:00 CT', () => {
    // Fri 6 PM CT to Mon 8 AM CT = 1 h Fri + 1 h Mon
    expect(th._businessHours(Date.parse('2026-11-07T00:00:00Z'), Date.parse('2026-11-09T14:00:00Z'))).toBeCloseTo(2, 5);
    expect(th._businessHours(Date.parse('2026-11-09T13:00:00Z'), Date.parse('2026-11-10T13:00:00Z'))).toBeCloseTo(12, 5);
  });
});

describe('ticket hygiene buckets', () => {
  let rep;
  beforeAll(async () => { rep = await th._build({ now: NOW }); });
  const b = (id) => rep.tickets.find((r) => r.id === String(id));
  it('sorts each ticket', () => {
    expect(b(1)).toMatchObject({ bucket: 'unactioned', code: 'ack' });
    expect(b(2)).toMatchObject({ bucket: 'unactioned', isNew: true });
    expect(b(3)).toMatchObject({ bucket: 'followup', code: 'client' });
    expect(b(4)).toMatchObject({ bucket: 'closure', code: 'chase' });
    expect(b(5)).toMatchObject({ bucket: 'notdue', code: 'dependency' });
    expect(b(6)).toMatchObject({ bucket: 'check', code: 'oneemail' });
    expect(b(7)).toMatchObject({ bucket: 'unactioned', code: 'nocontact', assigned: 'Riley Stone' });
    expect(b(8)).toMatchObject({ bucket: 'followup', code: 'note' });
    expect(b(9)).toMatchObject({ bucket: 'closure', code: 'confirmed', esc: true });
  });
  it('builds the chat message without emails, phones or dashes', () => {
    expect(rep.chat).toMatch(/^\*T1 CS ticket check, Tue Nov 10 \(as of 10:00 AM CT\)\*/);
    expect(rep.chat).toMatch(/#1009 \(esc\)/);
    expect(rep.chat).not.toMatch(/@|[\u2014\u2013]/);
    expect(rep.unownedPC.map((r) => r.number)).toEqual(['1007']);
  });
  it('dashboards count by agent, status and bucket', () => {
    const sky = rep.dash.byAgent.find((a) => a.agent === 'Sky Gibson');
    expect(sky.total).toBe(8);
    expect(rep.dash.byBucket.closure).toBe(2);
    expect(rep.dash.byStatus['Pending Customer']).toBe(5);
    expect(b(3).category).toBe('VoIP & Phones'); expect(b(4).category).toBe('Other');
  });
  it('stores the run and reuses AI labels', async () => {
    const l = await th.latest(); expect(l.total).toBe(9);
    const again = await th._build({ now: NOW });
    expect(again.ai.cached).toBeGreaterThan(0); expect(again.ai.ran).toBe(0);
    expect((await th.trend(30)).length).toBeGreaterThanOrEqual(1);
  });
  it('cleans contact details and HTML', () => {
    expect(th._clean('<p>Call me at (555) 123-4567 or a@b.com</p>')).toBe('Call me at [phone] or [email]');
  });
});
