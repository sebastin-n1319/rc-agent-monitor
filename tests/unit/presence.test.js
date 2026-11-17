import { describe, it, expect, beforeEach } from 'vitest';
const P = require('../../lib/presence');

describe('who is online in the tool (Batch 391)', () => {
  beforeEach(() => P._reset());
  const s = { email: 'A.Agent@example.com', name: 'Alex Agent', picture: 'https://lh3.example/pic.jpg' };

  it('a beat puts the person online as active, with their name and picture', () => {
    P.beat(s, { active: true, page: 'Dashboard' }, 1000);
    const l = P.list(2000);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ email: 'a.agent@example.com', name: 'Alex Agent', picture: 'https://lh3.example/pic.jpg', status: 'active', page: 'Dashboard', since: 1000 });
  });
  it('no input for 5 minutes shows idle, and no beat for 150 seconds drops them', () => {
    P.beat(s, { active: true }, 0);
    for (let m = 1; m <= 4; m++) P.beat(s, { active: false }, m * 60000);
    expect(P.list(4 * 60000)[0].status).toBe('active');
    P.beat(s, { active: false }, 5 * 60000);
    P.beat(s, { active: false }, 6 * 60000);
    expect(P.list(6 * 60000)[0]).toMatchObject({ status: 'idle', idleMin: 6, since: 0 });
    expect(P.list(6 * 60000 + 150000)).toHaveLength(0);
  });
  it('leaving removes them at once, and a picture that is not https is not used', () => {
    P.beat({ email: 'b@example.com', name: 'Bea', picture: 'javascript:x' }, { active: true }, 0);
    expect(P.list(1)[0].picture).toBe('');
    P.bye('B@example.com');
    expect(P.list(2)).toHaveLength(0);
  });
  it('active people come first', () => {
    P.beat({ email: 'z@example.com', name: 'Zed' }, { active: true }, 0);
    P.beat({ email: 'a@example.com', name: 'Ann' }, { active: false }, 0);
    expect(P.list(1).map((x) => x.name)).toEqual(['Zed', 'Ann']);
  });
});

describe('an escalation tag counts as an open escalation (Batch 392)', () => {
  const dn = require('../../lib/ticket-doc-note');
  it('reads escalated-tier-1 and escalated-tier-2 from the ticket tags, in any tag shape', async () => {
    dn.setDeps({ deskRead: async () => ({ data: [{ name: 'Elicia' }, { name: 'escalated-tier-1' }] }) });
    expect(await dn._tierTag({ id: '1' })).toEqual({ tier: '1', id: '' });
    dn.setDeps({ deskRead: async () => ({ data: ['escalated-tier-1', 'escalated-tier-2'] }) });
    expect((await dn._tierTag({ id: '1' })).tier).toBe('2');
    dn.setDeps({ deskRead: async () => ({ data: [{ name: 'Elicia' }] }) });
    expect(await dn._tierTag({ id: '1' })).toBe(null);
    dn.setDeps({ deskRead: async () => { throw new Error('x'); } });
    expect(await dn._tierTag({ id: '1' })).toBe(null);
  });
  it('the note then says Yes with the tier, with no alert comment', () => {
    const h = dn.header({ ticketNumber: '1', contact: {} }, { header: {}, facts: { escalation: 'Never escalated' }, account: { name: 'X', number: '1' }, escAlert: { tier: '2', id: '' } }, null);
    expect(h['Any Escalation Ticket Open']).toBe('Yes - Tier 2');
  });
});
