import { describe, it, expect, beforeEach } from 'vitest';
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }
const gf = require('../../lib/expert-gapfix');
const sq = require('../../lib/expert-schedule');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe.skipIf(!sqlite3)('self-fixing gaps (Batch 242)', () => {
  let dms, notes, asked;
  beforeEach(async () => {
    dms = []; notes = []; asked = [];
    gf.setDB(new sqlite3.Database(':memory:')); await gf.initSchema();
    gf.setDeps({
      investigate: { isConfigured: () => true, needsLookup: () => false, investigate: async () => ({ summary: 'PRECEDENT: #422252 texts cannot be forwarded', steps: [{ what: 'x', ok: true }] }) },
      ai: { bestJSON: async () => ({ json: { fix: true, why_failed: 'No Help Center article', title: 'Texts cannot be forwarded', body: 'Adit cannot forward texts to another number. Calls can be forwarded with the call flow.', module: 'Adit Voice', evidence: ['#422252'], confidence: 'medium' } }) },
      saveNote: async (id, b) => { notes.push(b); return 77; }, ask: async (o) => { asked.push(o); return { mode: 'answer', answer: { answer: 'No, texts cannot be forwarded.' } }; },
      share: async () => 'abc', dm: async (o) => { dms.push(o); }, admins: async () => ['lead@adit.com'], publicUrl: 'https://x' });
  });
  it('queues a gap once, joins repeats, proposes a note and tells the admins', async () => {
    const id = await gf.enqueue({ email: 'a@adit.com', question: 'Can the office forward texts to a temp number?', gap: 'not found' });
    expect(await gf.enqueue({ email: 'b@adit.com', question: 'can the office forward texts to a temp number', gap: 'not found' })).toBe(id);
    await gf.work();
    const [f] = await gf.list();
    expect(f.status).toBe('proposed'); expect(f.others).toBe(1);
    expect(f.proposal.title).toBe('Texts cannot be forwarded');
    expect(dms.map(d => d.toEmail)).toEqual(['lead@adit.com']);
  });
  it('approving saves the edited note, asks again and messages everyone who asked', async () => {
    const id = await gf.enqueue({ email: 'a@adit.com', question: 'Can texts be forwarded?', gap: 'not found' });
    await gf.enqueue({ email: 'b@adit.com', question: 'Can texts be forwarded?', gap: 'not found' });
    await gf.work(); dms = [];
    await gf.approve(id, { title: 'Texts cannot be forwarded', body: 'Edited: Adit cannot forward texts.' }, 'lead@adit.com');
    await wait(20);
    expect(notes[0].body).toBe('Edited: Adit cannot forward texts.');
    expect(asked[0].email).toBe('a@adit.com');
    expect(dms.map(d => d.toEmail).sort()).toEqual(['a@adit.com', 'b@adit.com']);
    expect(dms[0].text).toMatch(/https:\/\/x\/guides#ask\/share\/abc/);
    await expect(gf.approve(id, {}, 'x')).rejects.toThrow(/not waiting/);
  });
});

describe.skipIf(!sqlite3)('scheduled questions (Batch 242)', () => {
  it('knows when a schedule is due in Central time', () => {
    const at = (iso) => new Date(iso);
    const s = { enabled: 1, freq: 'weekdays', time_hm: '08:00', last_run_day: null };
    expect(sq._isDue(s, at('2026-11-04T14:30:00Z'))).toBe(true); // Wed 8:30 CT
    expect(sq._isDue(s, at('2026-11-04T13:30:00Z'))).toBe(false); // 7:30 CT
    expect(sq._isDue(s, at('2026-11-07T15:00:00Z'))).toBe(false); // Saturday
    expect(sq._isDue({ ...s, last_run_day: '2026-11-04' }, at('2026-11-04T20:00:00Z'))).toBe(false);
    expect(sq._isDue({ ...s, freq: 'weekly', weekday: 3 }, at('2026-11-04T14:30:00Z'))).toBe(true);
    expect(sq._isDue({ ...s, freq: 'weekly', weekday: 1 }, at('2026-11-04T14:30:00Z'))).toBe(false);
  });
  it('runs a due question once a day and sends the owner the answer', async () => {
    const dms = [];
    sq.setDB(new sqlite3.Database(':memory:')); await sq.initSchema();
    sq.setDeps({ ask: async () => ({ mode: 'answer', answer: { answer: 'Three tickets look like one problem.' } }), share: async () => 'sh1', dm: async (o) => { dms.push(o); }, publicUrl: 'https://x' });
    const id = await sq.save('Me@adit.com', { question: 'Which open tickets are part of a cluster?', freq: 'daily', time: '00:00' });
    expect((await sq.list('me@adit.com'))[0].id).toBe(id);
    await expect(sq.save('other@adit.com', { question: 'x' })).rejects.toThrow(/Write the question/);
    // created after 00:00 today, so the first run is tomorrow
    expect(await sq.runDue()).toBe(0);
    const tomorrow = new Date(Date.now() + 86400e3);
    expect(await sq.runDue(tomorrow)).toBe(1);
    expect(await sq.runDue(tomorrow)).toBe(0);
    expect(dms[0].toEmail).toBe('me@adit.com');
    expect(dms[0].text).toMatch(/Three tickets[\s\S]*https:\/\/x\/guides#ask\/share\/sh1/);
    await expect(sq.remove('other@adit.com', id)).rejects.toThrow(/Not found/);
  });
});
