import { describe, it, expect } from 'vitest';
const sc = require('../../lib/scrin.js');

describe('scrin.io (read only)', () => {
  it('refuses anything but the read calls', async () => {
    await expect(sc._call('DeleteEmployment', { id: 1 })).rejects.toThrow('Only read calls');
  });
  it('matches scrin.io people to the Roster by email, then real name', async () => {
    const real = global.fetch; process.env.SCRIN_API_KEY = 'x'; let hdr = null;
    global.fetch = async (u, o) => { hdr = o.headers['X-SSM-Token']; return { ok: true, status: 200, text: async () => JSON.stringify({ companies: [{ id: 1, name: 'Adit', isManager: true, employments: [
      { id: 10, name: 'Lincy Tabita', email: 'lincy@adit.com', activityStatus: 'online', lastActive: 1793370000 },
      { id: 11, name: 'Mohammed Zafir Alam Ansari', email: 'zafir@gmail.com', activityStatus: 'offline' },
      { id: 12, name: 'Someone Else', email: 'x@y.com' }] }] }) }; };
    sc.setDeps({ roster: { listAgents: async () => [
      { emp_id: 'AD1', pseudo: 'Lincy Tabita', full_name: 'Lincy T', email: 'lincy@adit.com' },
      { emp_id: 'AD2', pseudo: 'Zeff Austin', full_name: 'Mohammed Zafir Alam Ansari', email: 'zeff.austin@adit.com' },
      { emp_id: 'AD3', pseudo: 'Sky Gibson', full_name: 'Sky G', email: 'sky@adit.com' }] } });
    try {
      const r = await sc.people({ force: true });
      expect(hdr).toBe('x');
      expect(r.people.find((p) => p.id === 10).matchedBy).toBe('email');
      expect(r.people.find((p) => p.id === 11).roster.pseudo).toBe('Zeff Austin');
      expect(r.people.find((p) => p.id === 12).roster).toBeNull();
      expect(r.notInScrin.map((a) => a.pseudo)).toEqual(['Sky Gibson']);
    } finally { global.fetch = real; delete process.env.SCRIN_API_KEY; }
  });
});
