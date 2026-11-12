import { describe, it, expect, beforeAll, afterEach } from 'vitest';
const sqlite3 = require('sqlite3');
const xd = require('../../lib/expert-desk-draft');
const env = { ...process.env };
const brief = { bottom_line: 'T1 can answer this.', found: ['Client asked about texts'], reply_label: 'Reply to the client', reply: 'Hi Dr. A, here is how...', replies: [], unknown: [] };

describe('expert desk drafts', () => {
  let calls;
  beforeAll(async () => { const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema(); });
  afterEach(() => { process.env = { ...env }; });
  it('needs a long key and compares it safely', () => {
    process.env.EXPERT_DESK_KEY = 'short'; expect(xd.enabled()).toBe(false); expect(xd.keyOk('short')).toBe(false);
    process.env.EXPERT_DESK_KEY = 'k'.repeat(32); expect(xd.keyOk('k'.repeat(32))).toBe(true); expect(xd.keyOk('x')).toBe(false); expect(xd.keyOk(undefined)).toBe(false);
  });
  it('picks the client reply, not the handover, and builds the note', () => {
    const p = xd.pick({ answer: { brief: Object.assign({}, brief, { reply_label: 'Handover to Philip Rivera', reply: 'Hi Philip', replies: [{ label: '#1 client reply', text: 'Hi Dr. Doori' }, { label: '#1 internal note', text: 'Checked KB' }] }) } });
    expect(p.reply).toBe('Hi Dr. Doori');
    expect(p.note).toMatch(/Bottom line/); expect(p.note).toMatch(/Handover to Philip/); expect(p.note).toMatch(/Checked KB/);
    expect(xd.pick({ answer: { brief } }).reply).toMatch(/^Hi Dr. A/);
  });
  it('turns text into safe html with links', () => {
    expect(xd.html('a <b>\n\nsee https://help.adit.com/x')).toBe('<p>a &lt;b&gt;</p><p>see <a href="https://help.adit.com/x">https://help.adit.com/x</a></p>');
  });
  it('text mode returns the quick reply', async () => {
    xd.setDeps({ deskRead: async () => ({ ticketNumber: '428073', email: 'dr@x.com' }), expert: { ask: async (o) => { expect(o.depth).toBe('fast'); return { logId: 5, answer: { brief } }; } } });
    const r = await xd.start({ ticketId: '197800000482093238', mode: 'text' });
    expect(r.reply).toMatch(/^Hi Dr. A/); expect(r.ticketNumber).toBe('428073');
  });
  it('text mode says pending when Expert is slow, and the status call collects the reply', async () => {
    process.env.EXPERT_DRAFT_WAIT_MS = '1000';
    let release; xd.setDeps({ deskRead: async () => ({ ticketNumber: '428099' }), expert: { ask: () => new Promise((r) => { release = () => r({ logId: 6, answer: { brief } }); }) } });
    const r = await xd.start({ ticketId: '1978000009', mode: 'text' });
    expect(r.pending).toBe(true);
    setTimeout(() => release(), 50);
    const s = await xd.status(r.jobId, { waitMs: 2000 });
    expect(s.status).toBe('done'); expect(s.replyHtml).toMatch(/<p>Hi Dr. A/);
    const again = await xd.start({ ticketId: '1978000009', mode: 'text' });
    expect(again.duplicate).toBe(true); expect(again.reply).toMatch(/^Hi Dr. A/);
  });
  it('save mode refuses without a write token, then saves a draft and a private note', async () => {
    await expect(xd.start({ ticketId: '1978000001', mode: 'save' })).rejects.toThrow(/WRITE_REFRESH_TOKEN/);
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1' });
    calls = [];
    xd.setDeps({
      deskRead: async (p) => /threads/.test(p) ? { data: [{ direction: 'in', channel: 'EMAIL', fromEmailAddress: 'Dr A <dr@x.com>', to: 'Adit Support <support@adit.com>' }] } : { ticketNumber: '428078' },
      expert: { ask: async (o) => { expect(o.depth).toBe('thinking'); return { logId: 9, answer: { brief, confidence: 'high' } }; } },
      fetch: async (url, o) => { calls.push({ url, body: o.body }); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; return { ok: true, status: 200, text: async () => JSON.stringify({ id: /draft/.test(url) ? 'd1' : 'c1' }) }; },
    });
    const r = await xd.start({ ticketId: '1978000002', mode: 'save' });
    expect(r.status).toBe('queued');
    await new Promise((res) => setTimeout(res, 50));
    const st = await xd.status(r.jobId);
    expect(st.status).toBe('done'); expect(st.draft_id).toBe('d1');
    const draft = calls.find((c) => /draftReply/.test(c.url)); const b = JSON.parse(draft.body);
    expect(b).toMatchObject({ channel: 'EMAIL', fromEmailAddress: 'support@adit.com', to: 'dr@x.com', contentType: 'html' });
    expect(JSON.parse(calls.find((c) => /comments/.test(c.url)).body).isPublic).toBe(false);
    const again = await xd.start({ ticketId: '1978000002', mode: 'save' });
    expect(again.duplicate).toBe(true);
  });
});

describe('desk webhook', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const T = { ticketNumber: '428200', teamId: '197800000052125116', status: 'Open', channel: 'Email', email: 'dr@x.com', subject: 'Question about texts', assigneeId: '111', lastThread: { direction: 'in' } };
  it('skips what it should and starts a save job for a client email', async () => {
    const reads = { t: T, threads: { data: [] } };
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? reads.threads : reads.t });
    const ev = (pl) => ({ eventType: 'Ticket_Thread_Add', payload: Object.assign({ ticketId: '1978000100', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'Dr <dr@x.com>' }, pl) });
    expect((await xd.decide(ev({ direction: 'out' }))).skip).toMatch(/incoming/);
    expect((await xd.decide(ev({ fromEmailAddress: 'alerts@ringcentral.com' }))).skip).toMatch(/automated/);
    reads.t = Object.assign({}, T, { teamId: '9' }); expect((await xd.decide(ev({}))).skip).toMatch(/T1/);
    reads.t = Object.assign({}, T, { subject: 'Automatic reply: out' }); expect((await xd.decide(ev({}))).skip).toMatch(/automatic/);
    reads.t = T; reads.threads = { data: [{ status: 'DRAFT' }] }; expect((await xd.decide(ev({}))).skip).toMatch(/draft/);
    reads.threads = { data: [] };
    process.env.EXPERT_PILOT_OWNERS = '222'; expect((await xd.decide(ev({}))).skip).toMatch(/pilot/);
    process.env.EXPERT_PILOT_OWNERS = '111,222'; expect((await xd.decide(ev({}))).skip).toBeUndefined();
    let n = 0; xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : (n++ ? T : Object.assign({}, T, { assigneeId: '' })) });
    expect((await xd.decide(ev({}), { assignWaitMs: 5 })).skip).toBeUndefined(); expect(n).toBe(2);
    n = 0; xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : Object.assign({}, T, { assigneeId: '' }) });
    expect((await xd.decide(ev({}), { assignWaitMs: 5 })).skip).toMatch(/no owner/);
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? reads.threads : reads.t });
    const out = await xd.handleWebhook([ev({}), { eventType: 'Ticket_Update', payload: {} }]);
    expect(out[0]).toMatch(/no write token|started/);
    expect(xd.hooks()[0].skip || xd.hooks()[0].started).toBeTruthy();
    expect(await xd.handleWebhook({})).toEqual([]);
  });
});
