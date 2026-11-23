import { describe, it, expect } from 'vitest';
const ms = require('../../lib/meeting-status.js');
const tasks = require('../../lib/aditpay-tasks.js');
// Batch 382: calendar call status for the live floor, and Adit Pay Asana tasks.
describe('meeting-status', () => {
  it('names the kind of meeting from its title, then the purpose', () => {
    expect(ms._kindOf('Adit Pay Training - Smile Dental', '')).toBe('Training');
    expect(ms._kindOf('Adit Demo', '')).toBe('Demo');
    expect(ms._kindOf('Follow up on #430296', '')).toBe('Ticket call');
    expect(ms._kindOf('Check in with the practice', '', 'Follow-up')).toBe('Follow-up');
    expect(ms._kindOf('Smile Dental', '', 'Support')).toBe('Ticket call');
    expect(ms._kindOf('Smile Dental', '', 'Adit Pay Training / Walkthrough')).toBe('Walkthrough');
    expect(ms._kindOf('Smile Dental', '', 'Adit Pay Demo/Signups')).toBe('Demo');
    expect(ms._kindOf('Team huddle', '')).toBe('Internal');
    expect(ms._kindOf('Call with practice', 'Product walkthrough')).toBe('Walkthrough');
  });
  it('finds the meeting now and the next one, skips lunch, and reads scrin.io apps without image links', async () => {
    const now = Date.now(), iso = (m) => new Date(now + m * 60e3).toISOString();
    let sql = '';
    ms.setDeps({
      kbq: async (s) => { sql = s; return { rows: [
        { who: 0, subject: 'Lunch', start_at: iso(-20), end_at: iso(20) },
        { who: 0, subject: 'Adit Pay training', start_at: iso(-10), end_at: iso(20) },
        { who: 0, subject: 'Adit Demo', start_at: iso(60), end_at: iso(90) },
        { who: 1, subject: 'Team sync', start_at: iso(120), end_at: iso(150) }] }; },
      scrin: { configured: () => true, people: async () => ({ people: [{ id: 7, email: 'b@x.com', roster: { email: 'b@x.com' } }] }),
        _call: async () => [{ employmentId: 7, from: Math.floor(now / 1000) - 60, imageUrl: 'https://s/z.png', app: 'Zoom Meeting' }] },
    });
    const r = await ms.forEmails(['A@x.com', 'b@x.com']);
    expect(sql).toMatch(/END AS who, subject, purpose/); // the email itself is never returned
    expect(r.data['a@x.com'].now.kind).toBe('Training');
    expect(r.data['a@x.com'].next.kind).toBe('Demo');
    expect(r.data['a@x.com'].today).toBe(2);
    expect(r.data['b@x.com'].next.kind).toBe('Internal');
    expect(r.data['b@x.com'].video.app).toBe('Zoom');
    expect(ms._appStrings({ imageUrl: 'https://s/z.png', title: 'Meet - abc' })).toEqual(['Meet - abc']);
  });
});
describe('aditpay-tasks', () => {
  it('groups open tasks by assignee with overdue and due today', async () => {
    process.env.ASANA_ACCESS_TOKEN = 'test';
    tasks.setDeps({ fetch: async () => ({ ok: true, json: async () => ({ data: [
      { name: 'Call back practice', completed: false, due_on: '2026-11-16', assignee: { email: 'A@x.com' } },
      { name: 'Send statement', completed: false, due_on: '2026-11-17', assignee: { email: 'a@x.com' } },
      { name: 'Unowned', completed: false } ] }) }) });
    const r = await tasks.summary({ fresh: true, today: '2026-11-17' });
    expect(r.ok).toBe(true);
    expect(r.byEmail['a@x.com']).toMatchObject({ open: 2, overdue: 1, dueToday: 1 });
    expect(r.unassigned).toBe(1);
    delete process.env.ASANA_ACCESS_TOKEN;
  });
});
