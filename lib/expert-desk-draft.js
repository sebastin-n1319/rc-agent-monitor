'use strict';
/**
 * Batch 291: Adit Expert drafts for Zoho Desk automations.
 * A Desk automation (custom function or webhook) sends a ticket ID with the shared key (EXPERT_DESK_KEY). Two ways:
 * - save (default): the tool answers at once, Expert reads the whole ticket (full review), then the tool saves a draft
 *   reply in the ticket and a private note for the agent. Nothing is ever sent: the agent reviews the draft and sends it.
 *   Needs a Desk token that may write tickets (ZOHO_DESK_WRITE_REFRESH_TOKEN, scopes Desk.tickets.UPDATE and
 *   Desk.tickets.CREATE; same Zoho client as the read token).
 * - text: Expert's quick answer comes back in the response (fits Zoho's ~40 second limit) for the automation to save.
 * Every draft is a job row, so the same ticket within 10 minutes is not drafted twice and spend stays visible.
 */
const crypto = require('crypto');
let D = {}, _db = null;
function setDeps(d) { D = Object.assign({}, D, d || {}); }
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_desk_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, number TEXT, mode TEXT,
    status TEXT DEFAULT 'queued', error TEXT, reply TEXT, note TEXT, draft_id TEXT, comment_id TEXT, ms INTEGER, log_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')), done_at TEXT)`);
}
const err = (status, message) => Object.assign(new Error(message), { status });
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) : s; };

// ── key ────────────────────────────────────────────────────────────────
function enabled() { return String(process.env.EXPERT_DESK_KEY || '').length >= 24; }
function keyOk(given) {
  const want = String(process.env.EXPERT_DESK_KEY || '');
  if (want.length < 24) return false;
  const a = crypto.createHash('sha256').update(String(given || '')).digest(), b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Desk writes (own token, so the read token keeps its narrow scopes) ──
const ACCOUNTS = 'https://accounts.zoho.com/oauth/v2/token', API = 'https://desk.zoho.com/api/v1';
let _tok = null, _exp = 0;
function canWrite() { return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_DESK_WRITE_REFRESH_TOKEN); }
async function token() {
  if (_tok && Date.now() < _exp - 60000) return _tok;
  const f = D.fetch || fetch;
  const r = await f(ACCOUNTS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, refresh_token: process.env.ZOHO_DESK_WRITE_REFRESH_TOKEN }) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw err(502, 'Desk write token could not be refreshed');
  _tok = j.access_token; _exp = Date.now() + (j.expires_in || 3600) * 1000; return _tok;
}
async function desk(method, path, body) {
  const f = D.fetch || fetch;
  const r = await f(API + path, { method, headers: { Authorization: 'Zoho-oauthtoken ' + await token(), orgId: process.env.ZOHO_DESK_ORG_ID || '', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { /* text */ }
  if (!r.ok) throw err(r.status, `Desk ${method} ${path.split('?')[0]}: ${r.status} ${cut((j && (j.errorCode || j.message)) || t, 200)}`);
  return j;
}
const readTicket = (id) => D.deskRead ? D.deskRead(`/tickets/${id}`) : require('./desk-service').fetchRaw(`/tickets/${id}`);
const readThreads = (id) => D.deskRead ? D.deskRead(`/tickets/${id}/threads?limit=20`) : require('./desk-service').fetchRaw(`/tickets/${id}/threads?limit=20`);
const html = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
// The draft goes to whoever wrote the client's latest email, from the support address it came in on.
async function addresses(id, t) {
  let from = process.env.DESK_DRAFT_FROM || '', to = (t && t.email) || '';
  try {
    const th = await readThreads(id);
    const inc = ((th && th.data) || []).find((x) => x.direction === 'in' && x.channel === 'EMAIL');
    if (inc) { to = to || inc.fromEmailAddress || ''; if (!from) from = String(inc.to || '').split(',')[0].replace(/.*</, '').replace(/>.*/, '').trim(); }
  } catch (e) { /* use what we have */ }
  to = String(to).replace(/.*</, '').replace(/>.*/, '').trim();
  return { from, to };
}

// ── pick the reply and the note out of Expert's answer ───────────────────
function pick(out) {
  const a = (out && out.answer) || {}, B = a.brief || {};
  const reps = Array.isArray(B.replies) ? B.replies : [];
  const client = reps.find((r) => /client|practice|reply/i.test(r.label || '') && !/note|internal|handover/i.test(r.label || ''));
  const noteR = reps.find((r) => /note|internal/i.test(r.label || ''));
  const toOwner = /^(handover|reply to )(?!.*client)/i.test(B.reply_label || '') && !/client|practice|dr\.?\s/i.test(B.reply_label || '');
  const reply = (client && client.text) || a.say || (!toOwner ? B.reply : '') || '';
  const lines = [];
  if (B.bottom_line) lines.push('Bottom line: ' + B.bottom_line);
  if (Array.isArray(B.found) && B.found.length) lines.push('What I found:\n' + B.found.map((f) => '- ' + f).join('\n'));
  if (Array.isArray(B.unknown) && B.unknown.length) lines.push('Could not check: ' + B.unknown.join(' '));
  if (toOwner && B.reply) lines.push((B.reply_label || 'Handover') + ':\n' + B.reply);
  const n = (noteR && noteR.text) || a.note || '';
  if (n) lines.push('Private note:\n' + n);
  return { reply: String(reply).trim(), note: lines.join('\n\n').trim(), confidence: a.confidence || '' };
}
const WAIT_MS = () => Math.min(35000, Math.max(1000, Number(process.env.EXPERT_DRAFT_WAIT_MS) || 30000));
const _live = new Map(); // jobId -> promise of a text job still being written
// A text job's answer: the reply when it is done, else pending (waits up to waitMs for it first).
async function result(jobId, waitMs = 0) {
  const p = _live.get(Number(jobId));
  if (p && waitMs > 0) await Promise.race([p, new Promise((r) => setTimeout(r, waitMs))]);
  const r = await get(`SELECT * FROM expert_desk_drafts WHERE id = ?`, [Number(jobId)]);
  if (!r) throw err(404, 'No such job');
  if (r.status === 'failed') throw err(502, 'Expert could not write a draft: ' + cut(r.error, 200));
  if (r.status !== 'done') return { jobId: r.id, status: r.status, ticketNumber: r.number, pending: true };
  return { jobId: r.id, status: 'done', ticketNumber: r.number, reply: r.reply || '', replyHtml: html(r.reply || ''), note: r.note || '', ms: r.ms };
}
const QUESTION = (num) => `#${num} Write the email reply to send the client now, answering everything in their latest message. Use what T1 can answer from the Help Center and the ticket, and say who follows up on the rest.`;

// ── jobs ─────────────────────────────────────────────────────────────────
const MAX_PER_DAY = () => Math.max(1, Number(process.env.EXPERT_DRAFT_MAX_PER_DAY) || 200);
let _active = 0; const _queue = [];
const LIMIT = 2;
async function resolve({ ticketId, ticketNumber }) {
  const id = String(ticketId || '').replace(/\D/g, ''), num0 = String(ticketNumber || '').replace(/\D/g, '');
  if (!id && !num0) throw err(400, 'Send ticketId (the Desk ticket ID) or ticketNumber');
  if (id) { const t = await readTicket(id).catch(() => null); if (!t || !t.ticketNumber) throw err(404, 'Ticket not found in Desk'); return { id, num: String(t.ticketNumber), t }; }
  const s = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/search?ticketNumber=${num0}&limit=1`).catch(() => null);
  const t = s && s.data && s.data[0];
  if (!t) throw err(404, 'Ticket not found in Desk');
  return { id: String(t.id), num: num0, t };
}
async function start({ ticketId, ticketNumber, mode = 'save' } = {}) {
  mode = mode === 'text' ? 'text' : 'save';
  if (mode === 'save' && !canWrite()) throw err(503, 'Saving drafts needs ZOHO_DESK_WRITE_REFRESH_TOKEN on the server. Use mode "text" until then.');
  const used = await get(`SELECT count(*) AS n FROM expert_desk_drafts WHERE created_at > datetime('now', '-1 day')`);
  if (used && used.n >= MAX_PER_DAY()) throw err(429, 'Daily draft limit reached');
  const { id, num, t } = await resolve({ ticketId, ticketNumber });
  const dup = await get(`SELECT * FROM expert_desk_drafts WHERE ticket_id = ? AND mode = ? AND status IN ('queued','working','done') AND created_at > datetime('now', '-10 minutes') ORDER BY id DESC LIMIT 1`, [id, mode]);
  if (dup && mode === 'save') return { jobId: dup.id, status: dup.status, ticketNumber: num, duplicate: true };
  if (dup && mode === 'text') return Object.assign(await result(dup.id, WAIT_MS()), { duplicate: true });
  const r = await run(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status) VALUES (?,?,?,?)`, [id, num, mode, mode === 'text' ? 'working' : 'queued']);
  const jobId = r.lastID;
  if (mode === 'text') {
    // Batch 293: Expert keeps writing in the background. The call waits up to 30 seconds (Zoho waits about 40); if the
    // draft is not ready yet the answer says pending, and GET /api/expert/desk-draft/<jobId>?wait=30 collects it.
    const t0 = Date.now();
    const p = D.expert.ask({ question: QUESTION(num), mode: 'email', modeLocked: true, depth: 'fast', draft: true, email: 'desk-automation' })
      .then(async (out) => { const pk = pick(out); await run(`UPDATE expert_desk_drafts SET status = 'done', reply = ?, note = ?, ms = ?, log_id = ?, done_at = datetime('now') WHERE id = ?`, [pk.reply, pk.note, Date.now() - t0, out.logId || null, jobId]); })
      .catch(async (e) => { await run(`UPDATE expert_desk_drafts SET status = 'failed', error = ?, ms = ?, done_at = datetime('now') WHERE id = ?`, [cut(e.message, 300), Date.now() - t0, jobId]).catch(() => {}); });
    _live.set(jobId, p); p.finally(() => setTimeout(() => _live.delete(jobId), 60000));
    return result(jobId, WAIT_MS());
  }
  _queue.push({ jobId, id, num, t }); pump();
  return { jobId, status: 'queued', ticketNumber: num };
}
function withTimeout(p, ms) { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(tm)); }
function pump() {
  while (_active < LIMIT && _queue.length) {
    const j = _queue.shift(); _active++;
    work(j).catch((e) => console.warn('expert desk draft:', e.message)).finally(() => { _active--; pump(); });
  }
}
async function work({ jobId, id, num, t }) {
  const t0 = Date.now();
  await run(`UPDATE expert_desk_drafts SET status = 'working' WHERE id = ?`, [jobId]);
  try {
    const out = await D.expert.ask({ question: QUESTION(num), mode: 'email', modeLocked: true, depth: 'thinking', email: 'desk-automation' });
    const p = pick(out);
    if (!p.reply) throw new Error('Expert wrote no client reply');
    const ad = await addresses(id, t);
    if (!ad.from || !ad.to) throw new Error('No From or To address for the draft (set DESK_DRAFT_FROM)');
    const dr = await desk('POST', `/tickets/${id}/draftReply`, { channel: 'EMAIL', fromEmailAddress: ad.from, to: ad.to, contentType: 'html', content: html(p.reply) });
    let cm = null;
    const head = 'Adit Expert drafted a reply on this ticket. It is a draft only: check the facts and the To field, edit, then send.' + (p.confidence ? ' Confidence: ' + p.confidence + '.' : '');
    // Batch 295: the tag lets agents and views find tickets with an Expert draft.
    desk('POST', `/tickets/${id}/associateTag`, { tags: ['expert-draft'] }).catch((e) => console.warn('expert desk draft tag:', e.message));
    try { cm = await desk('POST', `/tickets/${id}/comments`, { isPublic: false, contentType: 'html', content: html(head + (p.note ? '\n\n' + p.note : '')) }); }
    catch (e) { console.warn('expert desk draft comment:', e.message); }
    await run(`UPDATE expert_desk_drafts SET status = 'done', reply = ?, note = ?, draft_id = ?, comment_id = ?, ms = ?, log_id = ?, done_at = datetime('now') WHERE id = ?`,
      [p.reply, p.note, (dr && dr.id) || null, (cm && cm.id) || null, Date.now() - t0, out.logId || null, jobId]);
  } catch (e) {
    await run(`UPDATE expert_desk_drafts SET status = 'failed', error = ?, ms = ?, done_at = datetime('now') WHERE id = ?`, [cut(e.message, 300), Date.now() - t0, jobId]);
  }
}
async function status(jobId, { waitMs = 0 } = {}) {
  const m = await get(`SELECT mode FROM expert_desk_drafts WHERE id = ?`, [Number(jobId)]);
  if (m && m.mode === 'text') return result(jobId, Math.min(35000, Math.max(0, Number(waitMs) || 0)));
  const r = await get(`SELECT id, ticket_id, number, mode, status, error, draft_id, ms, created_at, done_at FROM expert_desk_drafts WHERE id = ?`, [Number(jobId)]);
  if (!r) throw err(404, 'No such job');
  return r;
}
async function recent(limit = 50) { return all(`SELECT id, number, mode, status, error, ms, created_at, done_at FROM expert_desk_drafts ORDER BY id DESC LIMIT ?`, [Math.min(200, Number(limit) || 50)]); }
// ── Batch 295: Zoho Desk webhook ─────────────────────────────────────────
// Desk calls /api/expert/desk-webhook on Ticket_Thread_Add (workflows are full, so no custom function). Each incoming
// client email on an open T1 email ticket starts a "save" job; everything else is skipped, with the reason kept in
// a short list for the admin page.
const T1_TEAM = () => String(process.env.EXPERT_T1_TEAM_ID || '197800000052125116');
const PILOT = () => String(process.env.EXPERT_PILOT_OWNERS || '').split(',').map((x) => x.trim()).filter(Boolean);
const SKIP_SENDERS = ['ringcentral.com', '@adit.com', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster', 'zohobooks.com', 'enfolytics.com', 'zohodesk.com'];
const SKIP_SUBJECTS = ['automatic reply', 'auto reply', 'autoreply', 'out of office', 'undeliverable', 'delivery status notification', 'read receipt', 'delivery failure', 'mail delivery'];
const _hooks = []; // most recent first
function note(ev) { _hooks.unshift(Object.assign({ at: new Date().toISOString() }, ev)); if (_hooks.length > 50) _hooks.pop(); }
const addrOf = (s) => String(s || '').replace(/.*</, '').replace(/>.*/, '').trim().toLowerCase();
async function decide(evt, { assignWaitMs = Number(process.env.EXPERT_ASSIGN_WAIT_MS) || 120000 } = {}) {
  const pl = (evt && evt.payload) || {};
  const tid = String(pl.ticketId || pl.ticket_id || (pl.ticket && pl.ticket.id) || '').replace(/\D/g, '');
  if (!tid) return { skip: 'no ticket in the event' };
  if (pl.direction && pl.direction !== 'in') return { tid, skip: 'not an incoming message' };
  if (pl.channel && String(pl.channel).toUpperCase() !== 'EMAIL') return { tid, skip: 'not an email' };
  if (pl.isDraft === true || /draft/i.test(String(pl.status || ''))) return { tid, skip: 'a draft, not a client email' };
  const from = addrOf(pl.fromEmailAddress || (pl.author && pl.author.email));
  const t = await readTicket(tid).catch(() => null);
  if (!t) return { tid, skip: 'ticket not found' };
  const num = String(t.ticketNumber || '');
  if (String(t.teamId || '') !== T1_TEAM()) return { tid, num, skip: 'not a T1 ticket' };
  if (String(t.status || '') !== 'Open') return { tid, num, skip: 'status is ' + t.status };
  if (String(t.channel || '').toLowerCase() !== 'email') return { tid, num, skip: 'channel is ' + t.channel };
  const sender = from || addrOf(t.email);
  if (!sender || !sender.includes('@')) return { tid, num, skip: 'no client email' };
  if (SKIP_SENDERS.some((x) => sender.includes(x))) return { tid, num, skip: 'automated or internal sender' };
  const subj = String(t.subject || '').toLowerCase();
  if (SKIP_SUBJECTS.some((x) => subj.includes(x))) return { tid, num, skip: 'automatic message' };
  const pilot = PILOT();
  // Batch 296: a brand-new ticket reaches us before the T1 Assignment Helper sets its owner. During the pilot, wait
  // (2 minutes by default) and read the ticket again before checking the owner, instead of skipping it.
  if (pilot.length && !t.assigneeId && assignWaitMs > 0) {
    await new Promise((r) => setTimeout(r, assignWaitMs));
    const t2 = await readTicket(tid).catch(() => null);
    if (t2) { Object.assign(t, t2); if (String(t.teamId || '') !== T1_TEAM() || String(t.status || '') !== 'Open') return { tid, num, skip: 'left T1 or closed before it was assigned' }; }
  }
  if (pilot.length && !pilot.includes(String(t.assigneeId || ''))) return { tid, num, skip: t.assigneeId ? 'owner not in the pilot' : 'no owner after 2 minutes' };
  if (t.lastThread && t.lastThread.direction === 'out') return { tid, num, skip: 'an agent already replied' };
  const th = await readThreads(tid).catch(() => null);
  if (th && (th.data || []).some((x) => /draft/i.test(String(x.status || '')))) return { tid, num, skip: 'a draft already exists' };
  return { tid, num, t };
}
async function handleWebhook(body) {
  const events = Array.isArray(body) ? body : body && Array.isArray(body.events) ? body.events : body && body.eventType ? [body] : [];
  const out = [];
  await Promise.all(events.slice(0, 20).map(async (ev, i) => {
    if (ev && ev.eventType && ev.eventType !== 'Ticket_Thread_Add') { note({ event: ev.eventType, skip: 'event not used' }); return; }
    try {
      const d = await decide(ev);
      if (d.skip) { note({ ticket: d.num || d.tid || '', skip: d.skip }); out[i] = d.skip; return; }
      if (!canWrite()) { note({ ticket: d.num, skip: 'no Desk write token on the server' }); out[i] = 'no write token'; return; }
      const r = await start({ ticketId: d.tid, mode: 'save' });
      note({ ticket: d.num, started: r.jobId, duplicate: !!r.duplicate }); out[i] = 'started ' + r.jobId;
    } catch (e) { note({ skip: 'error: ' + cut(e.message, 160) }); out[i] = 'error'; }
  }));
  if (!events.length) note({ skip: 'empty or test call' });
  return out.filter((x) => x != null);
}
function hooks() { return _hooks.slice(); }
module.exports = { handleWebhook, hooks, decide, result, setDeps, setDB, initSchema, enabled, keyOk, canWrite, start, status, recent, pick, html, _work: work, _queue };
