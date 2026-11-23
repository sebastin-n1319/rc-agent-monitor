import { describe, it, expect, afterEach } from 'vitest';
const scrin = require('../../lib/scrin');
const aux = require('../../lib/scrin-aux');

describe('scrin.io people who are not in the T1 CS Roster (Batch 396)', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; delete process.env.SCRIN_API_KEY; });
  const common = { companies: [{ id: 1, name: 'Co', isManager: true, employments: [
    { id: 11, name: 'Roster Person', email: 'rp@example.com', activityStatus: 'online' },
    { id: 12, name: 'Shubham Chunara (Sandy Clark)', email: 'sc@example.com', activityStatus: 'online' },
    { id: 13, name: 'Michelle Pinto', email: 'mp@example.com', activityStatus: 'offline' },
    { id: 14, name: 'Someone Else', email: 'se@example.com', activityStatus: 'online' }] }] };

  it('matches them to the live floor agents by email, then by the name in brackets, and marks them so', async () => {
    process.env.SCRIN_API_KEY = 'x';
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify(common) });
    scrin.setDeps({
      roster: { listAgents: async () => [{ emp_id: 'AD1', pseudo: 'Roster Person', full_name: 'Roster Person', email: 'rp@example.com' }] },
      agents: async () => [{ name: 'Sandy Clark', email: 'sandy@example.com' }, { name: 'Michelle Pinto', email: 'mp@example.com' }],
    });
    const r = await scrin.people({ force: true });
    const by = (id) => r.people.find((p) => p.id === id);
    expect(by(11).matchedBy).toBe('email');
    expect(by(12).matchedBy).toBe('agents');
    expect(by(12).roster.email).toBe('sandy@example.com');
    expect(by(13).matchedBy).toBe('agents');
    expect(by(14).roster).toBe(null);
    const st = await scrin.statusByEmail();
    expect(st.data['sandy@example.com'].status).toBe('online');
    expect(st.data['mp@example.com'].status).toBe('offline');
  });
  it('the auto Away move leaves them alone', async () => {
    process.env.SCRIN_API_KEY = 'x';
    const moved = [];
    aux.setDeps({
      scrin: { people: async () => ({ people: [{ id: 12, name: 'Sandy', email: 'sc@example.com', status: 'offline', lastActive: null, matchedBy: 'agents', roster: { email: 'sandy@example.com' } }] }) },
      getBreakTracker: async () => [{ email: 'sandy@example.com', username: 'Sandy Clark', currentStatus: 'Logged In' }],
      insertBreakEvent: async (e) => { moved.push(e); return e; },
    });
    await aux.tick(Date.now()); await aux.tick(Date.now() + 5 * 60e3);
    expect(moved).toHaveLength(0);
  });
});
