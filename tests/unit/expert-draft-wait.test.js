import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const sqlite3 = require('sqlite3');
const xd = require('../../lib/expert-desk-draft');

describe('Expert drafts wait before drafting (Batch 423)', () => {
  const env = { ...process.env };
  beforeAll(async () => { const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema(); });
  afterAll(() => { process.env = { ...env }; });
  const T = { ticketNumber: '440001', teamId: '197800000052125116', status: 'Open', statusType: 'Open', channel: 'Email', email: 'dr@x.com', subject: 'Texts not sending', assigneeId: '111', lastThread: { direction: 'in' } };
  const ev = (id) => ({ eventType: 'Ticket_Thread_Add', payload: { ticketId: id, direction: 'in', channel: 'EMAIL', fromEmailAddress: 'Dr <dr@x.com>' } });
  it('defaults to 15 minutes and can be switched off', () => {
    delete process.env.EXPERT_DRAFT_WAIT_MIN; expect(xd.DRAFT_WAIT()).toBe(15 * 60000);
    process.env.EXPERT_DRAFT_WAIT_MIN = '0'; expect(xd.DRAFT_WAIT()).toBe(0);
  });
  it('waits, then skips the draft when an agent replied in the meantime', async () => {
    process.env.EXPERT_DRAFT_WAIT_MIN = String(0.05 / 60); // 50 ms
    process.env.EXPERT_DESK_KEY = 'k'.repeat(32); process.env.ZOHO_DESK_WRITE_REFRESH_TOKEN = 'x'; process.env.ZOHO_DESK_WRITE_CLIENT_ID = 'c'; process.env.ZOHO_DESK_WRITE_CLIENT_SECRET = 's';
    let threads = { data: [] };
    xd.setDeps({ roster: { group: async () => ({ source: 'fallback', ids: new Set(), names: new Map() }), techobReason: () => '' }, deskRead: async (p) => /threads/.test(p) ? threads : /tags/.test(p) ? { data: [] } : T });
    const out = await xd.handleWebhook(ev('1978000400'));
    expect(out[0]).toBe('waiting');
    expect(xd.hooks()[0].skip).toMatch(/minutes for an agent reply first/);
    expect(xd._delayed.has('1978000400')).toBe(true);
    // a second event for the same ticket while it waits does not schedule another draft
    await new Promise((r) => setTimeout(r, 70000 / 1000 * 0));
    T.lastThread = { direction: 'out' }; // the agent replied within the wait
    await new Promise((r) => setTimeout(r, 150));
    expect(xd._delayed.has('1978000400')).toBe(false);
    expect(xd.hooks()[0].skip).toMatch(/agent already replied.*after the wait/);
    expect(xd.reasonOf('waiting 15 minutes for an agent reply first').kind).toBe('dup');
  });
});
