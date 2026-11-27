import { describe, it, expect } from 'vitest';
const { FLOW, walk } = require('../../lib/t1-flow');

describe('T1 ticket flow page data (Batch 427)', () => {
  it('every example lands where it should', () => {
    const end = (name) => walk(FLOW.scenarios.find((s) => s.name === name).answers).outcome.title;
    expect(end('How do I add a new user?')).toBe('Solved in T1');
    expect(end('Phones down for an onboarding client')).toBe('VoIP team');
    expect(end('The client wants to cancel')).toBe('Account CSM or escalation manager');
    expect(end('Many offices report the same problem')).toBe('Link it to the outage');
    expect(end('New client needs their server installed')).toBe('Onboarding team');
    expect(end('Payments are not posting to the PMS')).toBe('Team that owns the topic');
  });
  it('an unconfirmed practice is confirmed first, then the checks go on', () => {
    expect(walk(['no']).next).toBe('c2');
    expect(walk(['no', 'yes']).outcome.title).toBe('Link it to the outage');
  });
  it('describes every automation with what it does and why it is smart', () => {
    const items = FLOW.automation.moments.flatMap((m) => m.items);
    expect(items.length).toBeGreaterThanOrEqual(12);
    const loops = new Set(FLOW.automation.loop.map((l) => l.k));
    for (const it of items) { expect(loops.has(it.loop)).toBe(true); expect(it.text.length).toBeGreaterThan(30); expect(it.smart.length).toBeGreaterThan(20); }
  });
  it('stays generic for other departments: no internal names or policies', () => {
    const text = JSON.stringify(FLOW);
    expect(FLOW.channels.every((c) => !/%/.test(c.share + c.detail))).toBe(true); // no incoming volume by channel
    expect(text).not.toMatch(/SPOC|strike|Pending Review|Kushal|Ronnie|Expert|RingCentral|SalesIQ|#4\d{5}|—|–/);
  });
});
