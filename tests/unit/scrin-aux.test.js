import { describe, it, expect, beforeEach } from 'vitest';
const sa = require('../../lib/scrin-aux.js');

const T0 = Date.parse('2026-10-30T15:00:00Z');
let status = 'away', current = 'Logged In', events = [];
const deps = {
  scrin: { people: async () => ({ people: [{ email: 'lincy@adit.com', status, lastActive: new Date(T0 - 5 * 60e3).toISOString(), roster: { email: 'lincy@adit.com', pseudo: 'Lincy Tabita' } },
    { email: 'x@y.com', status: 'offline', roster: null }] }) },
  getBreakTracker: async () => ({ tracker: [{ email: 'lincy@adit.com', username: 'Lincy Tabita', currentStatus: current, lastActionAt: '2026-10-30 14:00:00' }] }),
  insertBreakEvent: async (e) => { events.push(e); current = e.action === 'SSM_AWAY_OUT' ? 'Away (scrin.io)' : 'Logged In'; return { id: events.length, ...e }; },
  notify: async () => {}, notices: { notifyPerson: async () => {} },
};

describe('scrin.io auto aux', () => {
  beforeEach(() => { process.env.SCRIN_API_KEY = 'x'; delete process.env.SCRIN_AUTO_AUX; sa._notAway.clear(); events = []; status = 'away'; current = 'Logged In'; sa.setDeps(deps); });
  it('waits 2 minutes, then moves to Away (scrin.io) from when scrin.io last saw them active', async () => {
    await sa.tick(T0);
    expect(events.length).toBe(0);
    await sa.tick(T0 + 60e3);
    expect(events.length).toBe(0);
    await sa.tick(T0 + 2 * 60e3);
    expect(events.length).toBe(1);
    expect(events[0].action).toBe('SSM_AWAY_OUT');
    expect(events[0].timestamp.getTime()).toBe(T0 - 5 * 60e3);
  });
  it('moves back to Logged In once scrin.io shows online', async () => {
    current = 'Away (scrin.io)'; status = 'online';
    await sa.tick(T0);
    expect(events.map((e) => e.action)).toEqual(['SSM_AWAY_IN']);
  });
  it('leaves agents alone who are on a break or logged out', async () => {
    current = 'Break';
    await sa.tick(T0); await sa.tick(T0 + 3 * 60e3);
    expect(events.length).toBe(0);
  });
  it('a short blip under 2 minutes does nothing', async () => {
    await sa.tick(T0); status = 'online'; await sa.tick(T0 + 60e3); status = 'away'; await sa.tick(T0 + 2 * 60e3);
    expect(events.length).toBe(0);
  });
  it('can be switched off', async () => {
    process.env.SCRIN_AUTO_AUX = 'off';
    expect((await sa.tick(T0)).skipped).toBe(true);
  });
});
