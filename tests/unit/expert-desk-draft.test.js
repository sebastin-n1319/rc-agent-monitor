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
    expect(p.note).toMatch(/^T1 handles this, no transfer.\nAnswered: T1 can answer this/);
    const full = 'Client: A\nReason for contact: Wants a form built\nWhat was checked: Earlier form tickets\nNext team should: Forms team builds the form';
    expect(xd.pick({ answer: { note: full, brief } }).note).toBe(full);
    const t1 = 'Client: A\nReason for contact: Reminder steps\nWhat was checked: Help Center reminders article\nNext team should: nothing yet, T1 keeps it.';
    expect(xd.pick({ answer: { note: t1, brief } }).note).toBe('T1 handles this, no transfer.\nReason for contact: Reminder steps\nWhat was checked: Help Center reminders article');
    expect(xd.pick({ answer: { note: t1, owner: { who: 'CSM pod' }, brief } }).note).toBe(t1);
    const later = 'Client: A\nReason for contact: Texts fail\nWhat was checked: Help Center\nNext team should: once the practice is known, verify the contact, then run the text checks. Carrier issues go to VoIP.';
    expect(xd.pick({ answer: { note: later, brief } }).note).toMatch(/^T1 handles this, no transfer./);
    expect(xd.pick({ answer: { brief } }).reply).toMatch(/^Hi Dr. A/);
  });
  it('adds the Help Center link the email promises, or drops the promise', () => {
    const say = 'Hi Ronnie,\n\nSteps here. Once I have that, I will follow up. The Help Center guide is linked below.\n\nBest regards,';
    const a = xd.pick({ answer: { say, brief: {} }, share: { title: 'Appointment reminders', url: 'https://help.adit.com/a' } }).reply;
    expect(a).toMatch(/guide: https:\/\/help.adit.com\/a\n\nBest regards,$/);
    const b = xd.pick({ answer: { say, brief: {} } }).reply;
    expect(b).toBe('Hi Ronnie,\n\nSteps here. Once I have that, I will follow up.\n\nBest regards,');
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
    let n2 = 0; xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : (n2++ ? T : Object.assign({}, T, { teamId: '', assigneeId: '' })) });
    expect((await xd.decide(ev({}), { assignWaitMs: 5 })).skip).toBeUndefined();
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? reads.threads : reads.t });
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
    // a new email sends Ticket_Add and Ticket_Thread_Add together: one draft only
    const both = await xd.handleWebhook([{ eventType: 'Ticket_Add', payload: { id: '1978000777', channel: 'Email', email: 'dr@x.com' } }, ev({ ticketId: '1978000777' })]);
    expect(both.length).toBe(1);
    expect(xd.hooks().some((h) => /second event/.test(h.skip || ''))).toBe(true);
    expect((await xd.decide({ eventType: 'Ticket_Add', payload: { id: '1978000888', channel: 'Email', email: 'dr@x.com' } })).tid).toBe('1978000888');
  });
  it('drafts web and chat tickets, skips phone tickets', async () => {
    const W = Object.assign({}, T, { channel: 'Web', lastThread: null, email: 'pat@gmail.com' });
    let cur = W; xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : cur });
    const add = (ch) => ({ eventType: 'Ticket_Add', payload: { id: '1978000901', channel: ch, email: 'pat@gmail.com' } });
    expect((await xd.decide(add('Web'))).skip).toBeUndefined();
    cur = Object.assign({}, W, { channel: 'Chat' }); expect((await xd.decide(add('Chat'))).skip).toBeUndefined();
    cur = Object.assign({}, W, { channel: 'Phone' }); expect((await xd.decide(add('Phone'))).skip).toMatch(/phone/);
    expect((await xd.decide({ eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000901', direction: 'in', channel: 'CHAT' } })).skip).toMatch(/phone/);
    // claimed by a pilot agent with no team: still T1
    process.env.EXPERT_PILOT_OWNERS = '111';
    cur = Object.assign({}, W, { teamId: '' }); expect((await xd.decide(add('Web'), { assignWaitMs: 0 })).skip).toBeUndefined();
    cur = Object.assign({}, W, { teamId: '', assigneeId: '999' }); expect((await xd.decide(add('Web'), { assignWaitMs: 0 })).skip).toMatch(/team|pilot/);
    expect((await xd.decide(add('Web'), { assignWaitMs: 0, ownerIsT1: true })).skip).toMatch(/pilot/);
  });
});

describe('desk drafts settings', () => {
  it('page settings take over from the Railway pilot list, pause stops webhook drafts, extra senders are skipped', async () => {
    process.env.EXPERT_PILOT_OWNERS = '111';
    expect(xd.settings().pilotFromEnv).toBe(true);
    await xd.saveSettings({ pilot: ['222', 'x'], extraSkip: ['@vendor.com', 'ab'] }, 'a@adit.com');
    expect(xd.settings()).toMatchObject({ pilot: ['222'], pilotFromEnv: false, extraSkip: ['@vendor.com'] });
    const P = { ticketNumber: '428301', teamId: '197800000052125116', status: 'Pending Adit', statusType: 'Open', channel: 'Email', email: 'dr@y.com', subject: 'Hi', assigneeId: '222', lastThread: { direction: 'in' } };
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : P });
    expect((await xd.decide({ eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000399', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'dr@y.com' } })).skip).toBeUndefined();
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : Object.assign({}, P, { status: 'Pending Customer', statusType: 'On Hold' }) });
    expect((await xd.decide({ eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000399', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'dr@y.com' } })).skip).toMatch(/status is Pending Customer/);
    const T = { ticketNumber: '428300', teamId: '197800000052125116', status: 'Open', channel: 'Email', email: 'x@vendor.com', subject: 'Hi', assigneeId: '222', lastThread: { direction: 'in' } };
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: [] } : T });
    const ev = { eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000300', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'x@vendor.com' } };
    expect((await xd.decide(ev)).skip).toMatch(/automated or internal/);
    await xd.saveSettings({ pilot: [], extraSkip: [] });
    expect((await xd.decide(ev)).skip).toBeUndefined();
    await xd.saveSettings({ paused: true });
    expect(await xd.handleWebhook([Object.assign({}, ev, { payload: Object.assign({}, ev.payload, { ticketId: '1978000301' }) })])).toEqual(['paused']);
    await xd.saveSettings({ paused: false, pilot: null });
    expect(xd.settings().pilotFromEnv).toBe(true);
    delete process.env.EXPERT_PILOT_OWNERS;
    const h = await xd.hookLog({ limit: 5 }); expect(h.rows.length).toBeGreaterThan(0);
    expect((await xd.jobs({ status: 'done' })).every((j) => j.status === 'done')).toBe(true);
  });
});

describe('draft voice', () => {
  it('uses the rewrite when it keeps every link, else keeps Expert text', async () => {
    const reply = 'Hi Ronnie,\n\nWhat we can answer now:\n1. Topic\nSee https://help.adit.com/a\n\nBest regards,';
    xd.setDeps({ ai: { bestJSON: async (o) => { expect(o.system).toMatch(/real person on Adit/); expect(o.user).toMatch(/Client first name: Ronnie/); return { json: { reply: 'Hi Ronnie,\n\nThanks for writing in — here you go.\nhttps://help.adit.com/a\n\nBest regards,' } }; } } });
    const a = await xd.humanize({ reply, firstName: 'Ronnie' });
    expect(a).toMatch(/Thanks for writing in, here you go/); expect(a).toMatch(/help.adit.com\/a/);
    xd.setDeps({ ai: { bestJSON: async () => ({ json: { reply: 'Hi Ronnie, a friendly reply with no link at all, so it is not used.' } }) } });
    expect(await xd.humanize({ reply })).toBe(reply);
    xd.setDeps({ ai: { bestJSON: async () => { throw new Error('busy'); } } });
    expect(await xd.humanize({ reply })).toBe(reply);
    xd.setDeps({ ai: null });
  });
});

describe('agent replies while Expert writes', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('skips the draft when an agent replied, and the sweep removes drafts an agent replaced', async () => {
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    const calls = []; let threads = [];
    const brief = { bottom_line: 'x', reply: 'Hi Dr. A,\n\nSteps.\n\nBest regards,', replies: [] };
    xd.setDeps({ ai: null,
      deskRead: async (p) => /threads/.test(p) ? { data: threads } : { ticketNumber: '428900', email: 'dr@x.com' },
      expert: { ask: async () => { threads = [{ id: 'a1', direction: 'out', status: 'SUCCESS', createdTime: new Date().toISOString() }]; return { logId: 1, answer: { brief } }; } },
      fetch: async (url, o) => { calls.push({ url, method: o.method, body: o.body }); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; return { ok: true, status: 200, text: async () => JSON.stringify({ id: /draftReply/.test(url) ? 'd9' : 'c9' }) }; } });
    const r = await xd.start({ ticketId: '1978000900', mode: 'save' });
    await new Promise((res) => setTimeout(res, 60));
    const st = await xd.status(r.jobId);
    expect(st.status).toBe('skipped');
    expect(calls.some((c) => /draftReply/.test(c.url))).toBe(false);
    expect(calls.some((c) => c.method === 'PATCH' && /comments\/c9/.test(c.url) && /did not add a draft/.test(c.body))).toBe(true);
    expect(calls.some((c) => /dissociateTag/.test(c.url))).toBe(true);
    // a saved draft, then the agent sends their own reply: the sweep deletes the Expert draft
    threads = []; calls.length = 0;
    xd.setDeps({ expert: { ask: async () => ({ logId: 2, answer: { brief } }) } });
    const r2 = await xd.start({ ticketId: '1978000901', mode: 'save' });
    await new Promise((res) => setTimeout(res, 60));
    expect((await xd.status(r2.jobId)).status).toBe('done');
    threads = [{ id: 'd9', direction: 'out', status: 'DRAFT', createdTime: new Date().toISOString() }, { id: 'a2', direction: 'out', status: 'SUCCESS', createdTime: new Date(Date.now() + 5000).toISOString() }];
    const sw = await xd.sweep();
    expect(sw.removed).toBe(1);
    expect(calls.some((c) => c.method === 'DELETE' && /draftReply\/d9/.test(c.url))).toBe(true);
  });
});

describe('replacing an older Expert draft', () => {
  it('a new client message replaces our unsent draft, but an agent draft still skips', async () => {
    const T = { ticketNumber: '428002', teamId: '197800000052125116', status: 'Open', channel: 'Email', email: 'dr@x.com', subject: 'Hi', assigneeId: '', lastThread: { direction: 'in' } };
    let threads = [{ id: 'd1', status: 'DRAFT', direction: 'out' }];
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: threads } : T });
    await xd.saveSettings({ pilot: [] });
    const ev = { eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000002', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'dr@x.com' } };
    const d = await xd.decide(ev, { assignWaitMs: 0 });
    expect(d.skip).toBeUndefined(); expect(d.replace).toEqual(['d1']);
    threads = [{ id: 'zz', status: 'DRAFT', direction: 'out' }];
    expect((await xd.decide(ev, { assignWaitMs: 0 })).skip).toMatch(/agent has a draft/);
    await xd.saveSettings({ pilot: null });
  });
});

describe('waiting tickets', () => {
  it('finds open T1 email tickets where the client wrote last, oldest first, and skips recent ones', async () => {
    const now = Date.now();
    const tk = (id, n, dir, mins, team = '197800000052125116') => ({ id, ticketNumber: n, teamId: team, statusType: 'Open', subject: 'S' + n, lastThread: { direction: dir }, customerResponseTime: new Date(now - mins * 60000).toISOString(), assignee: { firstName: 'Sabrina', lastName: 'Quinn' } });
    xd.setDeps({ deskRead: async (p) => /search/.test(p) ? { data: [tk('a1', '427359', 'in', 600), tk('a2', '427400', 'out', 100), tk('a3', '427401', 'in', 30), tk('a4', '427402', 'in', 30, '9')] } : {} });
    const r = await xd.backlog({ ownerIds: ['197800000295035103'], dry: true });
    expect(r.tickets.map((t) => t.number)).toEqual(['427359', '427401']);
    expect(r.tickets[0].owner).toBe('Sabrina Quinn');
  });
  it('auto drafts a new web ticket where the client is waiting, once per client message', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    await xd.saveSettings({ pilot: [], paused: false });
    const at = new Date(Date.now() - 20 * 60000).toISOString();
    const W = { id: '1978000555', ticketNumber: '429500', teamId: '197800000052125116', statusType: 'Open', status: 'Open', channel: 'Web', subject: 'locked out', email: 'pat@gmail.com', assigneeId: '111', lastThread: null, customerResponseTime: at, assignee: { firstName: 'Sabrina', lastName: 'Quinn' } };
    xd.setDeps({ ai: null, expert: { ask: async () => { throw new Error('test') } }, deskRead: async (p) => /search/.test(p) ? { data: [W] } : /threads|comments/.test(p) ? { data: [] } : W,
      fetch: async (url) => /oauth/.test(url) ? { json: async () => ({ access_token: 't', expires_in: 3600 }) } : { ok: true, status: 200, text: async () => '{"id":"c1"}' } });
    const r = await xd.autoWaiting({ ownerIds: ['111'] });
    expect(r.started.map((x) => x.number)).toEqual(['429500']);
    const r2 = await xd.backlog({ ownerIds: ['111'], days: 3, dry: true });
    expect(r2.waiting).toBe(0);
    await xd.saveSettings({ pilot: null }); process.env = env;
  });
});

describe('learning from agents', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('keeps an edited draft as a lesson, updates the note, and removes Expert note when an agent adds one', async () => {
    Object.assign(process.env, { TICKET_DOC_NOTES: 'off', ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    expect(xd.similarity('the quick brown fox jumps', 'the quick brown fox jumps')).toBe(1);
    expect(xd.similarity('hello there my friend', 'totally different words here')).toBe(0);
    const calls = []; const brief = { bottom_line: 'x', reply: 'Hi Dr. A,\n\nOpen Engage and click Auto-Reminders, then edit the reminder text and save it.\n\nBest regards,', replies: [] };
    let threads = [], comments = [];
    xd.setDeps({ ai: null, expert: { ask: async () => ({ logId: 3, answer: { brief } }) },
      deskRead: async (p) => /comments/.test(p) ? { data: comments } : /threads\/d9/.test(p) ? { content: '<div>Hi Dr. A,<br><br>Please call us and we will set the reminders for you today.<br><br>Regards,<br>Lincy</div>' } : /threads/.test(p) ? { data: threads } : { ticketNumber: '428950', email: 'dr@x.com' },
      fetch: async (url, o) => { calls.push({ url, method: o.method, body: o.body }); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; return { ok: true, status: 200, text: async () => JSON.stringify({ id: /draftReply/.test(url) ? 'd9' : 'c9' }) }; } });
    const r = await xd.start({ ticketId: '1978000950', mode: 'save' });
    await new Promise((res) => setTimeout(res, 60));
    threads = [{ id: 'd9', direction: 'out', status: 'SUCCESS', author: { name: 'Lincy Tabita' }, createdTime: new Date().toISOString() }];
    const t0 = new Date(Date.now() - 60000).toISOString();
    comments = [{ id: 'c9', commenterId: 'expert', commentedTime: t0 }];
    calls.length = 0;
    const sw = await xd.sweep();
    expect(sw.edited).toBe(1);
    expect(calls.some((c) => c.method === 'PATCH' && /comments\/c9/.test(c.url) && /Lincy Tabita edited/.test(c.body))).toBe(true);
    const j = (await xd.list({ q: '428950' })).rows[0]; expect(j.draft_state).toBe('edited');
    // the agent adds their own private note: Expert's note goes
    comments = [{ id: 'c9', commenterId: 'expert', commentedTime: t0 }, { id: 'c10', commenterId: 'lincy', commentedTime: new Date().toISOString() }];
    calls.length = 0;
    const sw2 = await xd.sweep();
    expect(sw2.notesRemoved).toBeGreaterThanOrEqual(1);
    expect(calls.some((c) => c.method === 'DELETE' && /comments\/c9/.test(c.url))).toBe(true);
  });
  it('learns from a draft the agent opened with Edit and sent (the draft ID disappears), and closes stuck writing notes', async () => {
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    const calls = []; const brief = { bottom_line: 'x', reply: 'Hi Dr. B,\n\nOpen Engage and click Auto-Reminders, then edit the reminder text and save it.\n\nBest regards,', replies: [] };
    let threads = [];
    xd.setDeps({ ai: null, expert: { ask: async () => ({ logId: 4, answer: { brief } }) },
      deskRead: async (p) => /search\?tag/.test(p) ? { data: [{ id: '1978000977' }] } : /1978000977\/comments/.test(p) ? { data: [{ id: 'w1', commenterId: 'u1', content: 'Adit Expert is writing a draft reply for this ticket.', commentedTime: new Date(Date.now() - 3600000).toISOString() }] }
        : /comments/.test(p) ? { data: [] } : /threads\/n1/.test(p) ? { content: '<div>Hi Dr. B,<br><br>Please call us and we will set the reminders for you today.<br><br>Regards,<br>Greg</div>' } : /threads/.test(p) ? { data: threads } : { ticketNumber: '428960', email: 'dr@x.com' },
      fetch: async (url, o) => { calls.push({ url, method: o.method, body: o.body }); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; return { ok: true, status: 200, text: async () => JSON.stringify(/draftReply/.test(url) ? { id: 'd7' } : { id: 'c7', commenterId: 'u1' }) }; } });
    await xd.start({ ticketId: '1978000960', mode: 'save' });
    await new Promise((res) => setTimeout(res, 60));
    threads = [{ id: 'n1', direction: 'out', status: 'SUCCESS', author: { name: 'Greg Dawson' }, createdTime: new Date(Date.now() + 5000).toISOString() }];
    calls.length = 0;
    const sw = await xd.sweep();
    const j = (await xd.list({ q: '428960' })).rows[0]; expect(['edited', 'agent replied']).toContain(j.draft_state);
    expect((await xd.learning()).lessons).toBeGreaterThanOrEqual(2);
    expect(sw.stuckNotes).toBe(1);
    expect(calls.some((c) => c.method === 'PATCH' && /comments\/w1/.test(c.url) && /stopped before/.test(c.body))).toBe(true);
  });
});

describe('desk drafts report and restart recovery', () => {
  it('names skip reasons plainly', () => {
    expect(xd.reasonOf('not a T1 ticket').kind).toBe('other');
    expect(xd.reasonOf('owner not in the pilot').label).toMatch(/pilot/);
    expect(xd.reasonOf('phone ticket (channel Phone)').label).toBe('Phone ticket');
    expect(xd.reasonOf('already being checked (second event for the same email)').kind).toBe('dup');
  });
  it('reports tickets, drafts, reasons and agents, and closes jobs left by a restart', async () => {
    const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema();
    const q = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => e ? rej(e) : res()));
    await q(`INSERT INTO expert_desk_hooks (ticket, skip) VALUES ('1', 'not a T1 ticket'), ('2', 'owner not in the pilot'), ('3', NULL), ('2', 'already being checked (second event)')`);
    await q(`UPDATE expert_desk_hooks SET started = 9 WHERE ticket = '3'`);
    await q(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, draft_state, owner) VALUES ('x3', '3', 'save', 'done', 'edited', 'Evan Cruz')`);
    await q(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, owner, created_at) VALUES ('x4', '4', 'save', 'working', 'Lincy', datetime('now', '-5 hours'))`);
    const r = await xd.report({ days: 1 });
    expect(r.otherTeams).toBe(1);
    expect(r.skipped).toEqual([{ reason: 'Owner not in the pilot', n: 1, byDesign: true, fixed: false }]); expect(r.series.length).toBe(14); expect(r.draftable).toBeGreaterThanOrEqual(r.drafted);
    expect(r.agents.find((a) => a.agent === 'Evan Cruz').edited).toBe(1);
    const rc = await xd.recover();
    expect(rc.closed).toBe(1);
  });
});

describe('draft tone (Batch 321)', () => {
  it('flags deadlines for our work and anything that puts Adit down, not product facts', () => {
    expect(xd.toneIssues('Sorry for the delay, our team will fix this within 24 hours.').length).toBe(1);
    expect(xd.toneIssues('We will update you by Friday.')[0].kind).toMatch(/time frame/);
    expect(xd.toneIssues('This was a glitch on our end.')[0].kind).toMatch(/Adit down/);
    expect(xd.toneIssues('The reset email should arrive within 5 minutes.')).toEqual([]);
    expect(xd.toneIssues('Thank you for your patience. Our team is on it and you will hear back here.')).toEqual([]);
    expect(xd.toneIssues('Hi Jeffrey,\n\nThank you for passing along the note.', { by: 'Jeffrey Kamienski' }).length).toBe(2);
    expect(xd.toneIssues('Hi Karina,\n\nThank you for your patience.', { by: 'Jeffrey Kamienski' })).toEqual([]);
  });
});

describe('internal forwards (Batch 322)', () => {
  it('drafts a colleague-forwarded client email to the client, with the forward in the note', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    await xd.saveSettings({ pilot: [], paused: false });
    const T = { id: '1978000777', ticketNumber: '429113', teamId: '197800000052125116', status: 'Open', statusType: 'Open', channel: 'Email', subject: 'Fwd: Follow up ASAP', email: 'jeffrey@adit.com', assigneeId: '111', lastThread: { direction: 'in' } };
    const TH = { id: 'th1', direction: 'in', fromEmailAddress: '"Jeffrey Kamienski"<jeffrey@adit.com>', createdTime: new Date().toISOString(), summary: '' };
    const calls = []; let asked = '';
    xd.setDeps({ ai: null, expert: { ask: async (o) => { asked = o.question; return { logId: 9, answer: { brief: { reply: 'Hi Karina,\n\nThank you for reaching out.\n\nBest regards,', replies: [] } } }; } },
      deskRead: async (p) => /threads\/th1/.test(p) ? { content: '<div>---------- Forwarded message ---------<br>From: Karina Del Moral &lt;kdm@portofinodental.org&gt;<br>Please call me</div>' } : /threads/.test(p) ? { data: [TH] } : /comments/.test(p) ? { data: [] } : T,
      fetch: async (url, o) => { calls.push({ url, method: o.method, body: o.body }); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; return { ok: true, status: 200, text: async () => JSON.stringify({ id: /draftReply/.test(url) ? 'd5' : 'c5' }) }; } });
    const d = await xd.decide({ eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000777', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'jeffrey@adit.com' } }, { assignWaitMs: 0 });
    expect(d.skip).toBeUndefined();
    await xd.start({ ticketId: '1978000777', mode: 'save' });
    await new Promise((res) => setTimeout(res, 80));
    expect(asked).toMatch(/forwarded internally by Jeffrey Kamienski/);
    const dr = calls.find((c) => /draftReply/.test(c.url) && c.method === 'POST');
    expect(JSON.parse(dr.body).to).toBe('kdm@portofinodental.org');
    expect(calls.some((c) => /comments/.test(c.url) && /keep Jeffrey posted/.test(c.body || ''))).toBe(true);
    // an internal email that is not a forward is still skipped
    xd.setDeps({ deskRead: async (p) => /threads\/th1/.test(p) ? { content: 'Hi team, can someone check this account?' } : /threads/.test(p) ? { data: [TH] } : Object.assign({}, T, { subject: 'Question' }) });
    expect((await xd.decide({ eventType: 'Ticket_Thread_Add', payload: { ticketId: '1978000777', direction: 'in', channel: 'EMAIL', fromEmailAddress: 'jeffrey@adit.com' } }, { assignWaitMs: 0 })).skip).toMatch(/internal/);
    await xd.saveSettings({ pilot: null }); process.env = env;
  });
});

describe('same caller and bounced email (Batch 323)', () => {
  it('finds the missed call and voicemail tickets of one call, not other requests', async () => {
    const T = { id: '2', contactId: 'c1', subject: 'New Voice Message from WEISSICH JACOB - 1025 (559) 431-9104 on 11/11/2026 4:47 PM', createdTime: '2026-11-11T22:47:27Z' };
    xd.setDeps({ deskRead: async () => ({ data: [
      { id: '1', ticketNumber: '428238', subject: 'New Call from WEISSICH JACOB - 1025 (559) 431-9104', statusType: 'Open', createdTime: '2026-11-11T22:47:24Z', assignee: { firstName: 'Sky', lastName: 'Gibson' } },
      { id: '3', ticketNumber: '428300', subject: 'Forms question', statusType: 'Open', createdTime: '2026-11-12T10:00:00Z' },
      { id: '2', ticketNumber: '428239', subject: T.subject, statusType: 'Open', createdTime: T.createdTime }] }) });
    const s = await xd.siblingsOf('2', T);
    expect(s.map((x) => x.number)).toEqual(['428238']);
    expect(s[0].owner).toBe('Sky Gibson');
  });
  it('uses only the practice own addresses after a bounce, never strangers on the account', async () => {
    const T = { id: '9', email: 'dralbright@albrightdental.com', contactId: 'c1', accountId: 'a1', contact: { email: 'dralbright@albrightdental.com' } };
    xd.setDeps({ deskRead: async (p) => /threads\/b1/.test(p) ? { plainText: 'Delivery incomplete. dralbright@albrightdental.com 421 4.7.0 too many connections, will retry' }
      : /threads/.test(p) ? { data: [{ id: 'b1', direction: 'in', fromEmailAddress: 'mailer-daemon@googlemail.com', summary: 'Delivery Status Notification', createdTime: '2026-11-13T10:00:00Z' }] }
      : /contacts\/c1$/.test(p) ? { email: 'dralbright@albrightdental.com', secondaryEmail: 'contactus@albrightdental.com' }
      : /accounts\/a1\/contacts/.test(p) ? { data: [{ email: 'amy.ho2002@gmail.com' }, { email: 'office@albrightdental.com' }] }
      : /accounts\/a1\/tickets/.test(p) ? { data: [{ email: 'testingqa@aditqa.com' }, { email: 'kymeshatinsley@gmail.com' }] } : { data: [] } });
    const b = await xd.bounceOf('9', T);
    expect(b.bounced).toEqual(['dralbright@albrightdental.com']);
    expect(b.serverWide).toBe(true);
    const got = b.alt.map((a) => a.email);
    expect(got).toEqual(['contactus@albrightdental.com', 'office@albrightdental.com']);
    expect(b.allSame).toBe(true);
    expect(xd.toneIssues('[name and role] will call you.')[0].kind).toMatch(/placeholder/);
  });
});

describe('one draft and one note per ticket (Batch 325)', () => {
  it('a re-run updates the earlier note and draft instead of adding new ones', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema();
    await new Promise((r) => db.run(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, draft_id, comment_id, draft_state, created_at, done_at) VALUES ('1978009900','429900','save','done','d1','c1','in desk', datetime('now','-30 minutes'), datetime('now','-28 minutes'))`, r));
    const calls = [];
    xd.setDeps({ ai: null, expert: { ask: async () => ({ logId: 1, answer: { brief: { reply: 'Hi A,\n\nOk.\n\nBest regards,', replies: [] } } }) },
      deskRead: async (p) => /threads|comments|tickets\?|contacts\//.test(p) ? { data: [] } : { ticketNumber: '429900', email: 'a@b.com', createdTime: new Date().toISOString() },
      fetch: async (url, o) => { calls.push(o.method + ' ' + url.replace(/^.*\/api\/v1/, '')); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) };
        if (o.method === 'DELETE') return { ok: false, status: 403, text: async () => '{"errorCode":"SCOPE_MISMATCH"}' };
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: /draftReply/.test(url) ? 'd1' : 'c1' }) }; } });
    await xd.start({ ticketId: '1978009900', mode: 'save' });
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.some((c) => c === 'POST /tickets/1978009900/comments')).toBe(false);
    expect(calls.some((c) => c === 'PATCH /tickets/1978009900/comments/c1')).toBe(true);
    expect(calls.some((c) => c === 'POST /tickets/1978009900/draftReply')).toBe(false);
    expect(calls.some((c) => c === 'PATCH /tickets/1978009900/draftReply/d1')).toBe(true);
    process.env = env;
  });
});

describe('manual and auto drafts are checked too (Batch 326)', () => {
  it('refuses when an agent already replied or the ticket left T1', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    let T = { ticketNumber: '429113', teamId: '197800000052125116', email: 'a@b.com' };
    let TH = [{ id: '1', direction: 'in', status: 'SUCCESS', createdTime: '2026-11-13T17:00:00Z' }, { id: '2', direction: 'out', status: 'SUCCESS', channel: 'EMAIL', author: { name: 'Logan Pardini' }, createdTime: '2026-11-13T18:38:00Z' }];
    xd.setDeps({ deskRead: async (p) => /threads/.test(p) ? { data: TH } : T });
    await expect(xd.start({ ticketId: '1978001113', mode: 'save', source: 'manual' })).rejects.toThrow(/already replied.*Logan/);
    T = Object.assign({}, T, { teamId: '999', team: { name: 'Tech OB POD 27' } });
    await expect(xd.start({ ticketId: '1978001114', mode: 'save', source: 'manual' })).rejects.toThrow(/Tech OB POD 27/);
    process.env = env;
  });
});

describe('takeovers (Batch 327)', () => {
  it('rewrites the note for the new owner, keeps the draft and marks it handed over', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema();
    await new Promise((r) => db.run(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, draft_id, comment_id, owner, draft_state, done_at) VALUES ('1978007700','429113','save','done','d1','c1','Sabrina Quinn','in desk', datetime('now','-10 minutes'))`, r));
    const calls = [];
    xd.setDeps({ t1Agents: async () => [{ id: '111' }],
      deskRead: async (p) => /threads/.test(p) ? { data: [{ id: 'd1', status: 'DRAFT', direction: 'out' }] } : /comments|search/.test(p) ? { data: [] } : { ticketNumber: '429113', teamId: '197800000377955045', team: { name: 'Tech OB POD 27 - Steve' }, assigneeId: '999', assignee: { firstName: 'Logan', lastName: 'Pardini' } },
      fetch: async (url, o) => { calls.push(o.method + ' ' + url.replace(/^.*\/api\/v1/, '') + ' ' + (o.body || '')); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; if (o.method === 'DELETE') return { ok: false, status: 403, text: async () => '{"errorCode":"SCOPE_MISMATCH"}' }; return { ok: true, status: 200, text: async () => '{}' }; } });
    const sw = await xd.sweep();
    expect(sw.handedOver).toBe(1);
    expect(calls.some((c) => /PATCH \/tickets\/1978007700\/comments\/c1/.test(c) && /Taken over by Logan Pardini/.test(c) && /Sabrina Quinn/.test(c))).toBe(true);
    expect((await xd.list({ q: '429113' })).rows[0].draft_state).toBe('handed over');
    process.env = env;
  });
});

describe('the tool only removes what it created (Batch 329)', () => {
  it('removes its own draft and note on a takeover once deletes are allowed, never anything else', async () => {
    const env = { ...process.env };
    Object.assign(process.env, { ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_DESK_WRITE_REFRESH_TOKEN: 'r', ZOHO_DESK_ORG_ID: '1', DESK_DRAFT_FROM: 'support@adit.com' });
    const db = new sqlite3.Database(':memory:'); xd.setDB(db); await xd.initSchema();
    await new Promise((r) => db.run(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, draft_id, comment_id, owner, draft_state, done_at) VALUES ('1978007701','429114','save','done','d1','c1','Sabrina Quinn','in desk', datetime('now','-10 minutes'))`, r));
    const calls = [];
    xd.setDeps({ t1Agents: async () => [{ id: '111' }],
      deskRead: async (p) => /threads/.test(p) ? { data: [{ id: 'd1', status: 'DRAFT', direction: 'out' }, { id: 'dX', status: 'DRAFT', direction: 'out' }] } : /comments/.test(p) ? { data: [{ id: 'c1', commenterId: 'u1', content: 'Expert draft ready in the reply box.' }, { id: 'cAgent', commenterId: 'u9', content: 'Expert draft ready in the reply box. (agent copy)' }, { id: 'cOld', commenterId: 'u2', content: 'Called the client.' }] } : /search/.test(p) ? { data: [] } : { ticketNumber: '429114', teamId: '197800000377955045', team: { name: 'Tech OB POD 27' }, assigneeId: '999', assignee: { firstName: 'Logan', lastName: 'Pardini' } },
      fetch: async (url, o) => { calls.push(o.method + ' ' + url.replace(/^.*\/api\/v1/, '')); if (/oauth/.test(url)) return { json: async () => ({ access_token: 't', expires_in: 3600 }) }; return { ok: true, status: 200, text: async () => '{}' }; } });
    const sw = await xd.sweep();
    expect(sw.cleaned).toBe(1);
    const dels = calls.filter((c) => c.startsWith('DELETE'));
    expect(dels).toEqual(['DELETE /tickets/1978007701/draftReply/d1', 'DELETE /tickets/1978007701/comments/c1']);
    // a draft or note the tool did not create can never be removed or edited
    await expect(xd._desk('DELETE', '/tickets/1978007701/draftReply/dX')).rejects.toThrow(/NOT_OURS/);
    await expect(xd._desk('DELETE', '/tickets/1978007701/comments/cOld')).rejects.toThrow(/NOT_OURS/);
    await expect(xd._desk('PATCH', '/tickets/1978007701/comments/cOld', {})).rejects.toThrow(/NOT_OURS/);
    await expect(xd._desk('DELETE', '/tickets/1978007701')).rejects.toThrow(/NOT_OURS/);
    process.env = env;
  });
});
