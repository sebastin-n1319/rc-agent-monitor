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
  // Batch 301: settings changed on the Desk drafts page, and the webhook calls (kept across restarts).
  await run(`CREATE TABLE IF NOT EXISTS expert_desk_settings (k TEXT PRIMARY KEY, v TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS expert_desk_hooks (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), event TEXT, ticket TEXT,
    started INTEGER, duplicate INTEGER, skip TEXT)`);
  // Batch 303: who owns the ticket, the account and deal, kept with each draft for the Drafted tickets page.
  for (const c of ['subject TEXT', 'owner TEXT', 'owner_id TEXT', 'account TEXT', 'deal TEXT', 'source TEXT', 'draft_state TEXT']) { try { await run(`ALTER TABLE expert_desk_drafts ADD COLUMN ${c}`); } catch (e) { /* already there */ } }
  await loadSettings();
  setTimeout(() => backfill().catch(() => {}), 30000);
}
// Ticket details kept with a draft (from the Desk ticket read with its owner and contact).
function about(t) {
  t = t || {}; const cf = t.cf || {}, cfs = t.customFields || {}, a = t.assignee || {}, c = t.contact || {};
  const owner = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  const account = (c.account && (c.account.accountName || c.account.name)) || t.accountName || '';
  const deal = cf.cf_deal_name || cfs['Deal Name'] || (cf.cf_deal && (cf.cf_deal.name || cf.cf_deal.Deal_Name)) || '';
  return { subject: cut(t.subject, 200), owner: cut(owner, 80), owner_id: String(t.assigneeId || ''), account: cut(account, 120), deal: cut(deal, 160) };
}
async function remember(jobId, t) { const a = about(t); await run(`UPDATE expert_desk_drafts SET subject = ?, owner = ?, owner_id = ?, account = ?, deal = ? WHERE id = ?`, [a.subject, a.owner, a.owner_id, a.account, a.deal, jobId]).catch(() => {}); }
// Drafts made before the details were kept get them filled in once.
async function backfill() {
  for (const r of await all(`SELECT id, ticket_id FROM expert_desk_drafts WHERE owner IS NULL ORDER BY id DESC LIMIT 100`)) {
    const t = await readTicket(r.ticket_id).catch(() => null); if (t) await remember(r.id, t);
  }
}
// ── Batch 301: settings (page first, Railway variables as the fallback) ──
let S = { paused: false, pilot: null, extraSkip: [] };
async function loadSettings() {
  try { for (const r of await all(`SELECT k, v FROM expert_desk_settings`)) { try { S[r.k] = JSON.parse(r.v); } catch (e) { /* skip */ } } } catch (e) { /* first run */ }
}
async function saveSettings(patch, by) {
  const ok = {};
  if (patch.paused != null) ok.paused = !!patch.paused;
  if (patch.pilot !== undefined) ok.pilot = patch.pilot === null ? null : [...new Set((Array.isArray(patch.pilot) ? patch.pilot : []).map((x) => String(x).replace(/\D/g, '')).filter(Boolean))].slice(0, 100);
  if (patch.extraSkip !== undefined) ok.extraSkip = [...new Set((Array.isArray(patch.extraSkip) ? patch.extraSkip : []).map((x) => String(x).trim().toLowerCase()).filter((x) => x.length >= 3))].slice(0, 100);
  for (const [k, v] of Object.entries(ok)) { S[k] = v; await run(`INSERT INTO expert_desk_settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, JSON.stringify(v)]); }
  if (Object.keys(ok).length) await run(`INSERT INTO expert_desk_settings (k, v) VALUES ('changed', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [JSON.stringify({ by: by || '', at: new Date().toISOString() })]);
  return settings();
}
function settings() { return { paused: !!S.paused, pilot: Array.isArray(S.pilot) ? S.pilot.slice() : null, pilotFromEnv: !Array.isArray(S.pilot), extraSkip: (S.extraSkip || []).slice(), changed: S.changed || null }; }
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
// Batch 299: drafts and notes show the name of the Zoho user whose token writes them (e.g. Adit Ops). A Self Client
// belongs to one user, so that user's client can be set apart from the read client.
const wClient = () => process.env.ZOHO_DESK_WRITE_CLIENT_ID || process.env.ZOHO_CLIENT_ID;
const wSecret = () => process.env.ZOHO_DESK_WRITE_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET;
function canWrite() { return !!(wClient() && wSecret() && process.env.ZOHO_DESK_WRITE_REFRESH_TOKEN); }
async function token() {
  if (_tok && Date.now() < _exp - 60000) return _tok;
  const f = D.fetch || fetch;
  const r = await f(ACCOUNTS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: wClient(), client_secret: wSecret(), refresh_token: process.env.ZOHO_DESK_WRITE_REFRESH_TOKEN }) });
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
const readTicket = (id) => D.deskRead ? D.deskRead(`/tickets/${id}?include=assignee,contacts`) : require('./desk-service').fetchRaw(`/tickets/${id}?include=assignee,contacts`);
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
  let reply = (client && client.text) || a.say || (!toOwner ? B.reply : '') || '';
  // Batch 300: Expert's email says "the Help Center guide is linked below" and the page adds the link. Do the same
  // here; when no article fitted, take that sentence out so the client is not promised a missing link.
  const share = out && out.share && out.share.url ? out.share : null;
  if (share && !reply.includes(share.url)) {
    const line = 'You can also follow the steps in this Help Center guide: ' + share.url;
    const m = /\n*\s*((?:Best regards|Kind regards|Regards|Thanks|Thank you),?)\s*$/i.exec(reply);
    reply = m ? reply.slice(0, m.index) + '\n\n' + line + '\n\n' + m[1] : reply + '\n\n' + line;
  } else if (!share) {
    reply = reply.replace(/[^.!?\n]*\b(linked|link is|link) below\b[^.!?\n]*[.!?]?[ \t]*/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Batch 299: the private note on the ticket is only Expert's private note section (the agent asked for less).
  const n = (noteR && noteR.text) || a.note || '';
  // Batch 300: the full private note only when the ticket goes to another team. When T1 answers it directly, a short
  // note: what the client asked and what was checked.
  const next = (String(n).match(/Next team should:\s*([^\n]*)/i) || [])[1] || '';
  const who = String((a.owner && a.owner.who) || '').trim();
  const t1Keeps = !next || /nothing|t1 keeps|none|n\/a|not needed|no transfer|no handover|t1 (handles|owns|completes|keeps|answers)/i.test(next);
  const transfer = (who && !/^t1\b/i.test(who)) || !t1Keeps;
  const line = (k) => { const m = String(n).match(new RegExp('^' + k + ':\\s*(.+)$', 'im')); return m ? k + ': ' + cut(m[1].trim(), 260) : ''; };
  const short = ['T1 handles this, no transfer.', line('Reason for contact'), line('What was checked') || (B.bottom_line ? 'Answered: ' + cut(B.bottom_line, 260) : '')].filter(Boolean).join('\n');
  const lines = [transfer ? n : short].filter(Boolean);
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
// Batch 302: Expert's email reads like a report ("What we can answer now:", labelled sections). Before it is saved as
// a Desk draft it is rewritten in the voice of Adit's T1 agents, from their own sent replies. Facts and links stay as
// Expert wrote them; nothing is added. If the rewrite fails, Expert's text is used.
const STYLE_SYS = `You rewrite a support email so it sounds like it was written by a real person on Adit's T1 support team (Adit is software for dental, orthodontic, optometry and chiropractic offices). The facts come from the draft you are given; you change only how it reads.

How Adit's agents write:
- "Hi <first name>," on its own line (use "Hi there," when no first name is known).
- One warm, natural opening line that shows you read their message, in your own words. Thank them or apologise for the wait only when it fits.
- Short paragraphs of one to three sentences. Plain, friendly words, "I" and "we", contractions are fine. Sound like a helpful colleague, not a manual.
- Steps as a short numbered list only when there are three or more; otherwise a sentence.
- When the client asked several things, answer them in their order with a short plain lead-in for each (for example "About the appointment reminders:"), never "1. Topic title" headings or "What we can answer now:".
- When you need details from them, ask for at most three things in one short list, and say why in a few words.
- Keep every Help Center link from the draft, each on its own line right after the sentence it belongs to.
- End with one natural closing line (for example "Just reply here and I'll take it from there.") and then "Best regards," on its own line. No name or signature: Desk adds it.
- Length follows the question, like the team's own replies below: a simple question or a request for details is about 60 to 120 words; steps, options or several questions can run to about 150 to 300 words. Every sentence must help the client act; cut background they already know, repeated thanks and anything only the agent needs (that belongs in the private note).

Never: add facts, steps, prices, dates, promises or links that are not in the draft; say "I have answered all your questions below", "Please let us know if you have any other questions in the meantime", "I hope this email finds you well", "rest assured", "seamless" or "delve"; use em dashes or en dashes; use bold, headings or emojis; mention AI, Expert, sources or the Help Center search.

Examples of how the team writes (other clients, for tone and length only, never copy their facts):

Example 1, asking for details (short):
Hi Jen,

Thanks for flagging this, I understand why the Google sync worries you. To look into it, could you tell me where you're seeing Adit and Google syncing contacts? A screenshot of that screen would be perfect.

If you'd rather, we can also remove the Google connection from your Business Pages altogether. Just let me know.

Best regards,

Example 2, work is done (short):
Hi Dr. Arash,

Good news: our Forms team has set up your Invisalign clear aligner form, and it's ready to use. You'll find it under Patient Forms > Forms Manager, or open it directly here:
https://k.adit.com/example

I'll close this ticket for now, but just reply here if anything needs a tweak and we'll pick it right back up.

Best regards,

Example 3, options and questions (longer, because the client asked for a plan):
Hi Lisa,

Great idea to reach patients with benefits left before the year ends. There are two ways we can set this up:

Option 1: send us a CSV of the patients you want to reach, and we'll upload it to your Adit account.
Option 2: we build the list in Practice Analytics from your criteria, and you pick it when you send the email campaign.

For option 2, could you let me know:
1. Should patients with unscheduled treatment be included, and from what diagnosis date?
2. What remaining benefit amount should qualify a patient?

Once I hear back, I'll get the list ready for you.

Best regards,

Reply with one JSON object only: {"reply": "the rewritten email"}.`;
async function humanize({ reply, firstName = '', lastClient = '', subject = '' }) {
  if (!reply || !D.ai) return reply;
  try {
    const r = await D.ai.bestJSON({ system: STYLE_SYS, feature: 'expert-desk-draft', maxTokens: 2500, temperature: 0.4, timeoutMs: 60000,
      user: [`Client first name: ${firstName || 'not known'}`, subject ? `Ticket subject: ${cut(subject, 200)}` : '', lastClient ? `The client's latest message:\n${cut(lastClient, 2500)}` : '', `The draft to rewrite (facts and links to keep):\n${reply}`].filter(Boolean).join('\n\n') });
    const out = r && r.json && String(r.json.reply || '').trim();
    if (!out || r.json._truncated || out.length < 40) return reply;
    const links = (reply.match(/https?:\/\/[^\s)]+/g) || []);
    if (links.some((u) => !out.includes(u))) return reply; // a link went missing: keep Expert's text
    return out.replace(/\s*[—–]\s*/g, ', ');
  } catch (e) { console.warn('expert draft style:', e.message); return reply; }
}
function clientBits(out, t) {
  const tk = (out && out.ticket) || {}, meta = tk.meta || {};
  const last = (tk.timeline || []).filter((x) => x.kind === 'client').slice(-1)[0];
  let first = String(meta.contactFirst || (t && t.contact && t.contact.firstName) || '').trim();
  if (!first) { const ln = String((t && t.contact && t.contact.lastName) || '').trim(); if (/^[A-Z][a-z]+ [A-Z]/.test(ln)) first = ln.split(' ')[0]; }
  return { firstName: first, lastClient: (last && last.text) || '', subject: meta.subject || (t && t.subject) || '' };
}
const QUESTION = (num) => `#${num} Write the email reply to send the client now, answering everything in their latest message. Use what T1 can answer from the Help Center and the ticket, and say who follows up on the rest. Before writing, also check this client's recent calls and Avoma meetings, earlier tickets and any escalation for anything that changes the reply.`;

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
async function start({ ticketId, ticketNumber, mode = 'save', source = 'automation', replace = [] } = {}) {
  mode = mode === 'text' ? 'text' : 'save';
  if (mode === 'save' && !canWrite()) throw err(503, 'Saving drafts needs ZOHO_DESK_WRITE_REFRESH_TOKEN on the server. Use mode "text" until then.');
  const used = await get(`SELECT count(*) AS n FROM expert_desk_drafts WHERE created_at > datetime('now', '-1 day')`);
  if (used && used.n >= MAX_PER_DAY()) throw err(429, 'Daily draft limit reached');
  const { id, num, t } = await resolve({ ticketId, ticketNumber });
  const dup = await get(`SELECT * FROM expert_desk_drafts WHERE ticket_id = ? AND mode = ? AND status IN ('queued','working','done') AND created_at > datetime('now', '-10 minutes') ORDER BY id DESC LIMIT 1`, [id, mode]);
  if (dup && mode === 'save') return { jobId: dup.id, status: dup.status, ticketNumber: num, duplicate: true };
  if (dup && mode === 'text') return Object.assign(await result(dup.id, WAIT_MS()), { duplicate: true });
  const r = await run(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, source) VALUES (?,?,?,?,?)`, [id, num, mode, mode === 'text' ? 'working' : 'queued', source]);
  const jobId = r.lastID;
  await remember(jobId, t);
  if (mode === 'text') {
    // Batch 293: Expert keeps writing in the background. The call waits up to 30 seconds (Zoho waits about 40); if the
    // draft is not ready yet the answer says pending, and GET /api/expert/desk-draft/<jobId>?wait=30 collects it.
    const t0 = Date.now();
    const p = D.expert.ask({ question: QUESTION(num), mode: 'email', modeLocked: true, depth: 'fast', draft: true, email: 'desk-automation' })
      .then(async (out) => { const pk = pick(out); pk.reply = await humanize(Object.assign({ reply: pk.reply }, clientBits(out, t))); await run(`UPDATE expert_desk_drafts SET status = 'done', reply = ?, note = ?, ms = ?, log_id = ?, done_at = datetime('now') WHERE id = ?`, [pk.reply, pk.note, Date.now() - t0, out.logId || null, jobId]); })
      .catch(async (e) => { await run(`UPDATE expert_desk_drafts SET status = 'failed', error = ?, ms = ?, done_at = datetime('now') WHERE id = ?`, [cut(e.message, 300), Date.now() - t0, jobId]).catch(() => {}); });
    _live.set(jobId, p); p.finally(() => setTimeout(() => _live.delete(jobId), 60000));
    return result(jobId, WAIT_MS());
  }
  _queue.push({ jobId, id, num, t, replace }); pump();
  return { jobId, status: 'queued', ticketNumber: num };
}
function withTimeout(p, ms) { let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(tm)); }
function pump() {
  while (_active < LIMIT && _queue.length) {
    const j = _queue.shift(); _active++;
    work(j).catch((e) => console.warn('expert desk draft:', e.message)).finally(() => { _active--; pump(); });
  }
}
// Batch 304: agents saw nothing on the ticket while Expert wrote, replied themselves, and the draft then sat unused.
// Now: a "writing" private note and tag appear at once; just before saving, the ticket is checked again and the
// draft is skipped when an agent already replied or started a draft; the same note then becomes the final note.
const WRITING = 'Adit Expert is writing a draft reply for this ticket. It will be in the reply box in about 1 to 2 minutes, and this note will update. If you reply first, Expert will not add a draft.';
async function tags(id, add, remove) {
  if (add) await desk('POST', `/tickets/${id}/associateTag`, { tags: [add] }).catch((e) => console.warn('expert desk draft tag:', e.message));
  if (remove) await desk('POST', `/tickets/${id}/dissociateTag`, { tags: [remove] }).catch(() => {});
}
async function setNote(id, cm, text) {
  if (cm && cm.id) { try { return await desk('PATCH', `/tickets/${id}/comments/${cm.id}`, { contentType: 'html', content: html(text) }); } catch (e) { console.warn('expert desk draft note update:', e.message); } }
  try { return await desk('POST', `/tickets/${id}/comments`, { isPublic: false, contentType: 'html', content: html(text) }); } catch (e) { console.warn('expert desk draft comment:', e.message); return null; }
}
// Did an agent reply, or start a draft of their own, after this job began?
async function agentActed(id, sinceMs, ignore = []) {
  const th = await readThreads(id).catch(() => null);
  for (const x of (th && th.data) || []) {
    if (x.direction !== 'out') continue;
    const at = Date.parse(x.createdTime || x.sendDateTime || '') || 0;
    if (ignore.includes(String(x.id))) continue;
    if (/draft/i.test(String(x.status || ''))) { if (!/adit expert/i.test(String(x.summary || '')) && at >= sinceMs - 60000) return 'an agent started their own draft'; continue; }
    if (at >= sinceMs - 60000) return 'an agent already replied';
  }
  return '';
}
async function work({ jobId, id, num, t, replace = [] }) {
  const t0 = Date.now();
  await run(`UPDATE expert_desk_drafts SET status = 'working' WHERE id = ?`, [jobId]);
  let cm = null;
  if (canWrite()) { cm = await setNote(id, null, WRITING); tags(id, 'expert-drafting').catch(() => {}); }
  try {
    const out = await D.expert.ask({ question: QUESTION(num), mode: 'email', modeLocked: true, depth: 'thinking', email: 'desk-automation' });
    const p = pick(out);
    if (!p.reply) throw new Error('Expert wrote no client reply');
    p.reply = await humanize(Object.assign({ reply: p.reply }, clientBits(out, t)));
    readTicket(id).then((t2) => t2 && remember(jobId, t2)).catch(() => {});
    const acted = await agentActed(id, t0, replace);
    if (acted) {
      await setNote(id, cm, `Adit Expert did not add a draft: ${acted} while it was writing. Nothing to do.`);
      await tags(id, null, 'expert-drafting');
      await run(`UPDATE expert_desk_drafts SET status = 'skipped', error = ?, reply = ?, note = ?, comment_id = ?, ms = ?, log_id = ?, draft_state = 'not saved', done_at = datetime('now') WHERE id = ?`,
        [acted, p.reply, p.note, (cm && cm.id) || null, Date.now() - t0, out.logId || null, jobId]);
      return;
    }
    const ad = await addresses(id, t);
    if (!ad.from || !ad.to) throw new Error('No From or To address for the draft (set DESK_DRAFT_FROM)');
    // The older, unsent Expert draft goes; the new one answers the client's latest message.
    for (const old of replace) {
      try { await desk('DELETE', `/tickets/${id}/draftReply/${old}`); await run(`UPDATE expert_desk_drafts SET draft_state = 'replaced' WHERE ticket_id = ? AND draft_id = ?`, [id, old]); }
      catch (e) { console.warn('expert draft replace:', e.message); }
    }
    const dr = await desk('POST', `/tickets/${id}/draftReply`, { channel: 'EMAIL', fromEmailAddress: ad.from, to: ad.to, contentType: 'html', content: html(p.reply) });
    const head = 'Expert draft ready in the reply box. Review before sending.';
    cm = await setNote(id, cm, head + (p.note ? '\n\n' + p.note : '')) || cm;
    await tags(id, 'expert-draft', 'expert-drafting');
    await run(`UPDATE expert_desk_drafts SET status = 'done', reply = ?, note = ?, draft_id = ?, comment_id = ?, ms = ?, log_id = ?, draft_state = 'in desk', done_at = datetime('now') WHERE id = ?`,
      [p.reply, p.note, (dr && dr.id) || null, (cm && cm.id) || null, Date.now() - t0, out.logId || null, jobId]);
  } catch (e) {
    if (cm) { await setNote(id, cm, 'Adit Expert could not write a draft for this ticket. Please reply as usual.'); await tags(id, null, 'expert-drafting'); }
    await run(`UPDATE expert_desk_drafts SET status = 'failed', error = ?, ms = ?, done_at = datetime('now') WHERE id = ?`, [cut(e.message, 300), Date.now() - t0, jobId]);
  }
}
// Every few minutes: an Expert draft left in Desk after an agent sent their own reply is removed, so it never sits as
// a duplicate; a sent draft is marked sent. Drafts from the last 3 days are checked.
let _sweeping = false;
async function sweep() {
  if (_sweeping || !canWrite() || !_db) return { skipped: true };
  _sweeping = true; const out = { checked: 0, sent: 0, removed: 0, failed: 0 };
  try {
    const rows = await all(`SELECT id, ticket_id, draft_id, done_at FROM expert_desk_drafts WHERE status = 'done' AND draft_id IS NOT NULL AND coalesce(draft_state, 'in desk') = 'in desk' AND done_at > datetime('now', '-3 days') ORDER BY id DESC LIMIT 60`);
    for (const r of rows) {
      out.checked++;
      const th = await readThreads(r.ticket_id).catch(() => null); if (!th) continue;
      const list = th.data || [], mine = list.find((x) => String(x.id) === String(r.draft_id));
      const doneAt = Date.parse(String(r.done_at).replace(' ', 'T') + 'Z') || 0;
      if (!mine) { await run(`UPDATE expert_desk_drafts SET draft_state = 'gone' WHERE id = ?`, [r.id]); continue; }
      if (!/draft/i.test(String(mine.status || ''))) { out.sent++; await run(`UPDATE expert_desk_drafts SET draft_state = 'sent' WHERE id = ?`, [r.id]); continue; }
      const other = list.find((x) => x.direction === 'out' && String(x.id) !== String(r.draft_id) && !/draft/i.test(String(x.status || '')) && (Date.parse(x.createdTime || '') || 0) > doneAt);
      if (!other) continue;
      try { await desk('DELETE', `/tickets/${r.ticket_id}/draftReply/${r.draft_id}`); out.removed++; await run(`UPDATE expert_desk_drafts SET draft_state = 'removed' WHERE id = ?`, [r.id]); }
      catch (e) { out.failed++; await run(`UPDATE expert_desk_drafts SET draft_state = 'agent replied' WHERE id = ?`, [r.id]); console.warn('expert draft remove:', e.message); }
    }
  } finally { _sweeping = false; }
  return out;
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
const PILOT = () => Array.isArray(S.pilot) ? S.pilot : String(process.env.EXPERT_PILOT_OWNERS || '').split(',').map((x) => x.trim()).filter(Boolean);
const SKIP_SENDERS = ['ringcentral.com', '@adit.com', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster', 'zohobooks.com', 'enfolytics.com', 'zohodesk.com'];
const SKIP_SUBJECTS = ['automatic reply', 'auto reply', 'autoreply', 'out of office', 'undeliverable', 'delivery status notification', 'read receipt', 'delivery failure', 'mail delivery'];
const _hooks = []; // most recent first
const _inflight = new Set(); // ticket IDs being checked or started right now
function note(ev) {
  _hooks.unshift(Object.assign({ at: new Date().toISOString() }, ev)); if (_hooks.length > 50) _hooks.pop();
  if (_db) run(`INSERT INTO expert_desk_hooks (event, ticket, started, duplicate, skip) VALUES (?,?,?,?,?)`, [ev.event || null, ev.ticket || null, ev.started || null, ev.duplicate ? 1 : 0, ev.skip ? cut(ev.skip, 200) : null])
    .then(() => run(`DELETE FROM expert_desk_hooks WHERE id < (SELECT max(id) - 5000 FROM expert_desk_hooks)`)).catch(() => {});
}
const addrOf = (s) => String(s || '').replace(/.*</, '').replace(/>.*/, '').trim().toLowerCase();
async function decide(evt, { assignWaitMs = Number(process.env.EXPERT_ASSIGN_WAIT_MS) || 120000 } = {}) {
  const pl = (evt && evt.payload) || {};
  // Batch 297: Ticket_Add (a new ticket) carries the ticket itself, Ticket_Thread_Add carries the thread.
  const isAdd = evt && evt.eventType === 'Ticket_Add';
  const tid = String(pl.ticketId || pl.ticket_id || (pl.ticket && pl.ticket.id) || (isAdd ? pl.id : '') || '').replace(/\D/g, '');
  if (!tid) return { skip: 'no ticket in the event' };
  if (pl.direction && pl.direction !== 'in') return { tid, skip: 'not an incoming message' };
  if (pl.channel && String(pl.channel).toUpperCase() !== 'EMAIL') return { tid, skip: 'not an email' };
  if (pl.isDraft === true || /draft/i.test(String(pl.status || ''))) return { tid, skip: 'a draft, not a client email' };
  const from = addrOf(pl.fromEmailAddress || (pl.author && pl.author.email) || (isAdd ? pl.email || (pl.contact && pl.contact.email) : ''));
  const t = await readTicket(tid).catch(() => null);
  if (!t) return { tid, skip: 'ticket not found' };
  const num = String(t.ticketNumber || '');
  // Batch 298: a brand-new ticket has no team (and no owner) until the T1 Assignment Helper runs. Wait for it
  // (2 minutes by default) and read the ticket again, instead of skipping it as "not a T1 ticket".
  const waitFirst = !t.teamId || (PILOT().length && !t.assigneeId);
  if (waitFirst && assignWaitMs > 0) {
    await new Promise((r) => setTimeout(r, assignWaitMs));
    const t2 = await readTicket(tid).catch(() => null);
    if (t2) Object.assign(t, t2);
  }
  if (String(t.teamId || '') !== T1_TEAM()) return { tid, num, skip: t.teamId ? 'not a T1 ticket' : 'no team after the wait' };
  if (String(t.status || '') !== 'Open') return { tid, num, skip: 'status is ' + t.status };
  if (String(t.channel || '').toLowerCase() !== 'email') return { tid, num, skip: 'channel is ' + t.channel };
  const sender = from || addrOf(t.email);
  if (!sender || !sender.includes('@')) return { tid, num, skip: 'no client email' };
  if (SKIP_SENDERS.concat(S.extraSkip || []).some((x) => sender.includes(x))) return { tid, num, skip: 'automated or internal sender' };
  const subj = String(t.subject || '').toLowerCase();
  if (SKIP_SUBJECTS.some((x) => subj.includes(x))) return { tid, num, skip: 'automatic message' };
  const pilot = PILOT();
  if (pilot.length && !pilot.includes(String(t.assigneeId || ''))) return { tid, num, skip: t.assigneeId ? 'owner not in the pilot' : 'no owner after 2 minutes' };
  if (t.lastThread && t.lastThread.direction === 'out') return { tid, num, skip: 'an agent already replied' };
  const th = await readThreads(tid).catch(() => null);
  // Batch 306: an older Expert draft that nobody sent is replaced by a new one for the client's new message; a draft an
  // agent started still means the agent is on it, so the ticket is skipped.
  const drafts = ((th && th.data) || []).filter((x) => /draft/i.test(String(x.status || '')));
  let replace = [];
  if (drafts.length) {
    const ours = new Set((await all(`SELECT draft_id FROM expert_desk_drafts WHERE ticket_id = ? AND draft_id IS NOT NULL`, [tid]).catch(() => [])).map((r) => String(r.draft_id)));
    if (drafts.some((x) => !ours.has(String(x.id)))) return { tid, num, skip: 'an agent has a draft on this ticket' };
    replace = drafts.map((x) => String(x.id));
  }
  return { tid, num, t, replace };
}
async function handleWebhook(body) {
  const events = Array.isArray(body) ? body : body && Array.isArray(body.events) ? body.events : body && body.eventType ? [body] : [];
  const out = [];
  await Promise.all(events.slice(0, 20).map(async (ev, i) => {
    if (ev && ev.eventType && !['Ticket_Thread_Add', 'Ticket_Add'].includes(ev.eventType)) { note({ event: ev.eventType, skip: 'event not used' }); return; }
    // A new client email sends both Ticket_Add and Ticket_Thread_Add: only one of them may draft the ticket.
    const key = String(((ev && ev.payload) || {}).ticketId || (ev && ev.eventType === 'Ticket_Add' && ev.payload && ev.payload.id) || '');
    if (key && _inflight.has(key)) { note({ ticket: key, skip: 'already being checked (second event for the same email)' }); return; }
    if (key) _inflight.add(key);
    try {
      if (S.paused) { note({ ticket: key, skip: 'drafts are paused on the Desk drafts page' }); out[i] = 'paused'; return; }
      const d = await decide(ev);
      if (d.skip) { note({ ticket: d.num || d.tid || '', skip: d.skip }); out[i] = d.skip; return; }
      if (!canWrite()) { note({ ticket: d.num, skip: 'no Desk write token on the server' }); out[i] = 'no write token'; return; }
      const r = await start({ ticketId: d.tid, mode: 'save', source: 'webhook', replace: d.replace || [] });
      note({ ticket: d.num, started: r.jobId, duplicate: !!r.duplicate }); out[i] = 'started ' + r.jobId;
    } catch (e) { note({ skip: 'error: ' + cut(e.message, 160) }); out[i] = 'error'; }
    finally { if (key) setTimeout(() => _inflight.delete(key), 60000); }
  }));
  if (!events.length) note({ skip: 'empty or test call' });
  return out.filter((x) => x != null);
}
function hooks() { return _hooks.slice(); }
async function hookLog({ limit = 100, result = '' } = {}) {
  const where = result === 'started' ? 'WHERE started IS NOT NULL' : result === 'skipped' ? 'WHERE started IS NULL' : '';
  const rows = await all(`SELECT * FROM expert_desk_hooks ${where} ORDER BY id DESC LIMIT ?`, [Math.min(500, Number(limit) || 100)]);
  const sum = await all(`SELECT CASE WHEN started IS NOT NULL THEN 'Draft started' ELSE coalesce(skip, event, 'other') END AS reason, count(*) AS n
    FROM expert_desk_hooks WHERE at > datetime('now', '-1 day') GROUP BY 1 ORDER BY n DESC`);
  return { rows, summary: sum };
}
async function jobs({ limit = 100, status = '' } = {}) {
  const ok = ['done', 'failed', 'working', 'queued'].includes(status);
  return all(`SELECT id, ticket_id, number, mode, status, error, reply, note, draft_id, ms, created_at, done_at FROM expert_desk_drafts ${ok ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT ?`,
    ok ? [status, Math.min(300, Number(limit) || 100)] : [Math.min(300, Number(limit) || 100)]);
}
async function list({ status = '', owner = '', q = '', account = '', deal = '', source = '', days = 0, offset = 0, limit = 50 } = {}) {
  const w = [], p = [];
  if (['done', 'failed', 'working', 'queued', 'skipped'].includes(status)) { w.push('status = ?'); p.push(status); }
  if (owner) { w.push('owner = ?'); p.push(String(owner)); }
  if (source) { w.push('coalesce(source, ?) = ?'); p.push('automation', String(source)); }
  if (q) { const n = String(q).replace(/\D/g, ''); if (n && n.length >= 3 && /^\s*#?\d+\s*$/.test(q)) { w.push('(number LIKE ? OR ticket_id = ?)'); p.push(n + '%', n); } else { w.push('(subject LIKE ? OR reply LIKE ? OR number LIKE ?)'); p.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); } }
  if (account) { w.push('account LIKE ?'); p.push('%' + account + '%'); }
  if (deal) { w.push('deal LIKE ?'); p.push('%' + deal + '%'); }
  if (Number(days) > 0) { w.push(`created_at > datetime('now', ?)`); p.push(`-${Math.min(365, Number(days))} days`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const lim = Math.min(200, Math.max(1, Number(limit) || 50)), off = Math.max(0, Number(offset) || 0);
  const rows = await all(`SELECT id, ticket_id, number, subject, owner, account, deal, source, mode, status, error, reply, note, draft_id, draft_state, ms, created_at, done_at FROM expert_desk_drafts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, p.concat([lim, off]));
  const tot = await get(`SELECT count(*) AS n FROM expert_desk_drafts ${where}`, p);
  const owners = (await all(`SELECT owner, count(*) AS n FROM expert_desk_drafts WHERE owner IS NOT NULL AND owner != '' GROUP BY owner ORDER BY owner`)).map((r) => ({ name: r.owner, n: r.n }));
  return { rows, total: (tot && tot.n) || 0, owners };
}
async function stats() {
  const r = await all(`SELECT status, count(*) AS n, avg(ms) AS ms FROM expert_desk_drafts WHERE created_at > datetime('now', '-7 days') GROUP BY status`);
  const t = await get(`SELECT count(*) AS n FROM expert_desk_drafts WHERE created_at > datetime('now', '-1 day')`);
  const o = { week: {}, today: (t && t.n) || 0 }; r.forEach((x) => { o.week[x.status] = { n: x.n, avgSec: x.ms ? Math.round(x.ms / 1000) : null }; }); return o;
}
module.exports = { sweep, agentActed, list, about, backfill, humanize, STYLE_SYS, saveSettings, settings, hookLog, jobs, stats, SKIP_SENDERS, SKIP_SUBJECTS, T1_TEAM, handleWebhook, hooks, decide, result, setDeps, setDB, initSchema, enabled, keyOk, canWrite, start, status, recent, pick, html, _work: work, _queue };
