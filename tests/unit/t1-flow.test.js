import { describe, it, expect } from 'vitest';
const { FLOW, walk } = require('../../lib/t1-flow');

describe('T1 ticket flow page data (Batch 427)', () => {
  it('every example lands where it should', () => {
    const end = (name) => walk(FLOW.scenarios.find((s) => s.name === name).answers).outcome.title;
    expect(end('How do I add a new user?')).toBe('Resolve in T1');
    expect(end('Phones down for an onboarding client')).toBe('VoIP team');
    expect(end('The client wants to cancel')).toBe('Account CSM or escalation manager');
    expect(end('Many clients report the same problem')).toBe('Link it to the outage');
    expect(end('New client needs their server installed')).toBe('Onboarding team');
    expect(end('Payments are not posting to the PMS')).toBe('Owning team');
  });
  it('an unconfirmed practice is confirmed first, then the checks go on', () => {
    expect(walk(['no']).next).toBe('c2');
    expect(walk(['no', 'yes']).outcome.title).toBe('Link it to the outage');
  });
  it('stays generic for other departments: no internal names or policies', () => {
    const text = JSON.stringify(FLOW);
    expect(text).not.toMatch(/SPOC|strike|Pending Review|Kushal|Ronnie|Expert|RingCentral|SalesIQ|#4\d{5}|—|–/);
  });
});
