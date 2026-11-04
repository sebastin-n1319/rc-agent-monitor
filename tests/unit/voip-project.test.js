import { describe, it, expect } from 'vitest';
const V = require('../../lib/voip-project');
V.setDeps({ deskLifecycle: require('../../lib/desk-lifecycle'), dayWindow: (d) => ({ start: new Date(d + 'T05:00:00Z') }) });

const ctx = { nameSet: new Set(['sabrina quinn', 'zeff austin', 'anold fernandes', 'leo clayton']), nameById: new Map(), pTeam: new Map([['steven davis', 'T3 - VoIP'], ['kuldip parmar', 'T3 - VoIP']]), nameByEmail: new Map([['leo@adit.com', 'Leo Clayton']]) };
const log = (...l) => l.map(([n, d, r]) => `Owner changed to ${n} on 2026-10-${d} 10:00:00 | Role : ${r}`).join('\n');

describe('voip project: what happened to a ticket', () => {
  it('closed by T1 with no transfer', () => {
    const t = V.trace({ log: log(['Sabrina Quinn', 22, 'T1 Support']), assignee: 'Sabrina Quinn', team: 'T1 - Customer Support', status_type: 'Closed', closed_time: '2026-10-22T16:00:00Z' }, ctx);
    expect(t).toMatchObject({ agent: 'Sabrina Quinn', outcome: 'closed_t1', dest: null });
  });
  it('sent to VoIP Support and closed there', () => {
    const t = V.trace({ log: log(['Leo Clayton', 20, 'T1 Support'], ['Linet Young', 20, 'VoIP Support']), assignee: 'Linet Young', team: 'T1 - VoIP CSM', status_type: 'Closed', closed_time: 'x' }, ctx);
    expect(t).toMatchObject({ agent: 'Leo Clayton', outcome: 'closed_dept', dest: 'VoIP Support', owner: 'Linet Young' });
  });
  it('went to VoIP and came back to T1, who closed it', () => {
    const t = V.trace({ log: log(['Zeff Austin', 22, 'T1 Support'], ['Kenny Wallace', 22, 'VoIP Support'], ['Zeff Austin', 22, 'T1 Support'], ['Anold Fernandes', 22, 'T1 Support']), assignee: 'Anold Fernandes', team: 'T1 - Customer Support', status_type: 'Closed', closed_time: 'x' }, ctx);
    expect(t).toMatchObject({ agent: 'Zeff Austin', outcome: 'back_closed_t1', dest: 'VoIP Support' });
  });
  it('first department after T1 is the destination, the team now owns it', () => {
    const t = V.trace({ log: log(['Leo Clayton', 21, 'T1 Support'], ['Riley Sanders', 21, 'VoIP Support'], ['Kuldip Parmar', 22, 'Engineering']), assignee: 'Steven Davis', team: 'T3 - VoIP', status_type: 'Open' }, ctx);
    expect(t).toMatchObject({ outcome: 'open_dept', dest: 'VoIP Support', ownerDept: 'VoIP Engineering' });
  });
  it('a T1 note on a ticket raised straight into the VoIP queue counts as a transfer', () => {
    const t = V.trace({ log: '', assignee: 'Talia Adams', team: 'T1 - VoIP CSM', status_type: 'Open', hands: ['leo@adit.com'] }, ctx);
    expect(t).toMatchObject({ agent: 'Leo Clayton', outcome: 'open_dept', dest: 'VoIP Support' });
  });
  it('skips tickets T1 never touched', () => {
    expect(V.trace({ log: log(['Talia Adams', 22, 'VoIP Support']), assignee: 'Talia Adams', team: 'T1 - VoIP CSM' }, ctx)).toBeNull();
  });
});

describe('voip project: departments and ranges', () => {
  it('names departments from Zoho teams and roles', () => {
    expect(V.deptOf('T1 - VoIP CSM')).toBe('VoIP Support');
    expect(V.deptOf('T2 - VoIP BOPS')).toBe('VoIP BOPS');
    expect(V.deptOf('TechOB Pod 11 - Amanda')).toBe('Tech Onboarding');
    expect(V.deptOf('MktgCSM Pod F')).toBe('Marketing CSM');
    expect(V.deptOf('T2 - RCM Support')).toBe('RCM Support');
    expect(V.deptOf('CEO')).toBeNull();
  });
  it('compares with the same number of days just before', () => {
    const r = V.rangeFor({ preset: 'custom', from: '2026-10-12', to: '2026-10-25' });
    expect(r).toMatchObject({ days: 14, from: '2026-10-12', to: '2026-10-25' });
    expect(r.prevLabel).toBe('Sep 28, 2026 to Oct 11, 2026');
  });
});
