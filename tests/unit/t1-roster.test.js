import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
const sqlite3 = require('sqlite3');
const R = require('../../lib/t1-roster');
const xd = require('../../lib/expert-desk-draft');

// columns A..S: name, desk id, ... N status (13), O role (14), R expert (17), S email (18)
const row = (name, id, status, expert) => { const r = Array(19).fill(''); r[0] = name; r[1] = id; r[13] = status; r[14] = 'Agent'; r[17] = expert; r[18] = name.split(' ')[0].toLowerCase() + '@adit.com'; return r; };
const SHEET = [row('Sabrina Quinn', '111', 'Active', 'Yes'), row('Lincy Tabita', '222', 'Active', 'Yes'), row('Greg Dawson', '333', 'Active', 'No'), row('Old Agent', '444', 'Inactive', 'Yes'), ['', '']];

describe('T1 roster sheet (Batch 419)', () => {
  it('builds the Expert group from Active + Yes, keyed on the Desk ID, and caches reads', async () => {
    let reads = 0; R.setDeps({ readValues: async () => { reads++; return SHEET; } });
    const g = await R.group({ fallback: ['999'] });
    expect(g.source).toBe('sheet');
    expect([...g.ids].sort()).toEqual(['111', '222']);
    expect(g.onSheet.has('444')).toBe(true); expect(g.active.has('444')).toBe(false);
    expect(g.names.get('111')).toBe('Sabrina Quinn');
    await R.group(); await R.activeAgents();
    expect(reads).toBe(1);
  });
  it('falls back when the sheet cannot be read or has no Active row', async () => {
    R.setDeps({ readValues: async () => { throw new Error('The caller does not have permission'); } });
    let g = await R.group({ fallback: ['999'] });
    expect(g.source).toBe('fallback'); expect([...g.ids]).toEqual(['999']); expect(g.reason).toMatch(/permission/);
    R.setDeps({ readValues: async () => [row('Old Agent', '444', 'Inactive', 'Yes')] });
    g = await R.group({ fallback: ['999'] });
    expect(g.source).toBe('fallback'); expect(g.reason).toMatch(/no Active row/);
  });
  it('spots TechOB tickets by tag or team, except techob-to-support', () => {
    expect(R.techobReason({ tags: [{ name: 'techob-assigned' }] })).toMatch(/techob-assigned/);
    expect(R.techobReason({ tags: ['TechOB-missed-call'] })).toMatch(/TechOB/);
    expect(R.techobReason({ teamName: 'TechOB POD 12' })).toMatch(/team/);
    expect(R.techobReason({ teamName: 'Tech OB Pod 3' })).toMatch(/team/);
    expect(R.techobReason({ tags: ['techob-to-support', 'techob-missed-call'] })).toBe('');
    expect(R.techobReason({ tags: ['t1-claimed-no-team'], teamName: 'T1 - Customer Support' })).toBe('');
  });
});

describe('Expert drafts follow the roster (Batch 419)', () => {
  const T = { ticketNumber: '430001', teamId: '197800000052125116', team: { name: 'T1 - Customer Support' }, status: 'Open', statusType: 'Open', channel: 'Email', email: 'dr@x.com', subject: 'Texts not sending', assigneeId: '111', lastThread: { direction: 'in' } };
  const ev = { eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000300', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'Dr <dr@x.com>' } };
  let t, tags;
  beforeAll(async () => { const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema(); });
  beforeEach(() => {
    R.setDeps({ readValues: async () => SHEET });
    t = Object.assign({}, T); tags = { data: [] };
    xd.setDeps({ roster: R, deskRead: async (p) => /threads/.test(p) ? { data: [] } : /tags/.test(p) ? tags : t });
  });
  it('drafts for an Active + Yes owner and skips everyone else', async () => {
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toBeUndefined();
    t.assigneeId = '333'; expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/Expert drafts is No/);
    t.assigneeId = '444'; expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/Inactive/);
    t.assigneeId = '777'; expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/not on the T1 roster/);
  });
  it('skips TechOB tickets even when a pilot agent owns them, unless sent back to support', async () => {
    tags = { data: [{ name: 'techob-missed-call' }] };
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/TechOB ticket/);
    tags = { data: [{ name: 'techob-to-support' }, { name: 'techob-assigned' }] };
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toBeUndefined();
    tags = { data: [] }; t.teamId = ''; t.team = { name: 'TechOB POD 7' };
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/TechOB ticket/);
  });
  it('uses the old pilot list when the sheet is unreadable', async () => {
    R.setDeps({ readValues: async () => { throw new Error('not shared'); } });
    process.env.EXPERT_PILOT_OWNERS = '333';
    t.assigneeId = '333';
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toBeUndefined();
    t.assigneeId = '111';
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/pilot/);
    delete process.env.EXPERT_PILOT_OWNERS;
  });
});
