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
  await run(`CREATE TABLE IF NOT EXISTS expert_owned (kind TEXT, ticket_id TEXT, obj_id TEXT, at TEXT DEFAULT (datetime('now')), PRIMARY KEY (kind, obj_id))`);
  await run(`CREATE TABLE IF NOT EXISTS expert_desk_hooks (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), event TEXT, ticket TEXT,
    started INTEGER, duplicate INTEGER, skip TEXT)`);
  // Batch 303: who owns the ticket, the account and deal, kept with each draft for the Drafted tickets page.
  for (const c of ['subject TEXT', 'owner TEXT', 'owner_id TEXT', 'account TEXT', 'deal TEXT', 'source TEXT', 'draft_state TEXT', 'fwd_to TEXT', 'fwd_by TEXT']) { try { await run(`ALTER TABLE expert_desk_drafts ADD COLUMN ${c}`); } catch (e) { /* already there */ } }
  // Batch 310: what agents change in Expert's drafts, kept to learn from, and what happened to Expert's note.
  await run(`CREATE TABLE IF NOT EXISTS expert_draft_lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER UNIQUE, ticket_id TEXT, number TEXT, agent TEXT,
    kind TEXT, similarity REAL, expert_text TEXT, agent_text TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  try { await run(`ALTER TABLE expert_desk_drafts ADD COLUMN note_state TEXT`); } catch (e) { /* already there */ }
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
// Batch 329: the tool only ever deletes or edits what it created itself. Every draft and note it adds is recorded; a
// DELETE, or an edit of a note or draft, is refused unless that ID is on record as the tool's own. Any other DELETE is
// refused outright.
const OWN_RE = /^\/tickets\/(\d+)\/(comments|draftReply)\/([\w-]+)$/;
async function owned(kind, tid, oid) {
  if (!_db) return false;
  const q = (sql, p) => get(sql, p).catch(() => null);
  if (await q(`SELECT 1 AS x FROM expert_owned WHERE kind = ? AND ticket_id = ? AND obj_id = ?`, [kind, tid, oid])) return true;
  if (kind === 'draftReply' && await q(`SELECT 1 AS x FROM expert_desk_drafts WHERE ticket_id = ? AND draft_id = ?`, [tid, oid])) return true;
  if (kind === 'comments' && await q(`SELECT 1 AS x FROM expert_desk_drafts WHERE ticket_id = ? AND comment_id = ?`, [tid, oid])) return true;
  if (kind === 'comments' && await q(`SELECT 1 AS x FROM ticket_doc_notes WHERE ticket_id = ? AND (init_id = ? OR upd_id = ?)`, [tid, oid, oid])) return true;
  return false;
}
async function own(kind, tid, oid) { if (_db && oid) await run(`INSERT OR IGNORE INTO expert_owned (kind, ticket_id, obj_id) VALUES (?,?,?)`, [kind, String(tid), String(oid)]).catch(() => {}); }
async function desk(method, path, body) {
  const f = D.fetch || fetch;
  const pth = path.split('?')[0], m0 = pth.match(OWN_RE);
  if (method === 'DELETE' && !m0) throw err(403, 'NOT_OURS: the tool only deletes its own drafts and notes');
  if ((method === 'DELETE' || method === 'PATCH') && m0 && !(await owned(m0[2], m0[1], m0[3]))) throw err(403, `NOT_OURS: ${m0[2]} ${m0[3]} on ticket ${m0[1]} was not created by the tool`);
  const r = await f(API + path, { method, headers: { Authorization: 'Zoho-oauthtoken ' + await token(), orgId: process.env.ZOHO_DESK_ORG_ID || '', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { /* text */ }
  if (!r.ok) throw err(r.status, `Desk ${method} ${path.split('?')[0]}: ${r.status} ${cut((j && (j.errorCode || j.message)) || t, 200)}`);
  const mp = method === 'POST' && pth.match(/^\/tickets\/(\d+)\/(comments|draftReply)$/);
  if (mp && j && j.id) { await own(mp[2], mp[1], j.id); if (mp[2] === 'comments' && j.commenterId) await rememberWriter(String(j.commenterId)); }
  return j;
}
// Batch 330: the Desk users the tool has written as (the write key can change hands, for example to Adit Operations).
// Kept as a list, so notes written under an earlier key are still recognised as the tool's own.
let _writers = null;
async function writers() {
  if (_writers) return _writers;
  const r = await get(`SELECT k, v FROM expert_desk_settings WHERE k IN ('writer_id', 'writer_ids')`).catch(() => null);
  const rows = _db ? await all(`SELECT v FROM expert_desk_settings WHERE k IN ('writer_id', 'writer_ids')`).catch(() => []) : [];
  _writers = new Set([].concat(...rows.map((x) => String(x.v || '').split(',').filter(Boolean)))); void r;
  return _writers;
}
async function rememberWriter(id) {
  const w = await writers(); if (w.has(id)) return;
  w.add(id); await run(`INSERT OR REPLACE INTO expert_desk_settings (k, v) VALUES ('writer_ids', ?)`, [[...w].join(',')]).catch(() => {});
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
  // Batch 307: "once the practice is known, ..." or "if ..., send to T2" are next steps for later, not a handover now.
  const t1Keeps = !next || /nothing|t1 keeps|none|n\/a|not needed|no transfer|no handover|t1 (handles|owns|completes|keeps|answers|chases)/i.test(next)
    || /^\s*(once|if|when|after|until|in case|only if|should)\b/i.test(next) || /\b(not handed over|nothing handed over|t1 keeps it)\b/i.test(String(n));
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

Tone (always): polite, warm and professional, like a trusted account specialist. Speak well of Adit at every point. Never say or hint that Adit made a mistake, was slow, has a bug or glitch, failed, forgot or cannot do something; never blame another team, a vendor or the client either. When something went wrong, was delayed or is not available, handle it diplomatically: thank the client for their patience, acknowledge what they experienced in neutral words ("I can see the reminders did not go out as expected"), and move straight to what is being done or what they can do now. Use "thank you for your patience" instead of "sorry for the delay". For something Adit does not offer, describe what is possible instead of saying "we can't". Never give a deadline, time frame or date for work by Adit's team (no "within 24 hours", "by Friday", "in 2 to 3 business days", "ETA", "today", "shortly"): say the team is on it and the client will hear back here. Do not use "unfortunately".

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
// Batch 321: a last check on every client draft. A sentence that gives a deadline for the team's work, or that puts Adit
// down (fault, delay, bug, "unfortunately", "we can't"), is rewritten diplomatically once; anything still there is
// flagged in the private note for the agent.
const BLAME_RE = /\b(our (mistake|fault|error|bad|oversight)|my (mistake|fault|bad)|we (messed up|dropped the ball|failed|forgot|missed|overlooked)|(bug|glitch|outage|issue|error|problem|defect) (on|in|with) our (end|side|system)|our (system|software|platform|team) (failed|broke|made|was down|missed)|(apologi[sz]e|sorry) for (our|the|this|any) (delay|delayed|late|mistake|error|oversight|inconvenience caused by us)|sorry (it|this) took (so long|a while)|unfortunately|we (can't|cannot|don't|do not) (offer|support|do)|not (possible|supported) (with|in|on) adit|adit (doesn't|does not|can't|cannot))\b/i;
const TIME_RE = /\b((within|in|over) (the next )?(\d+|one|two|three|four|five|a few|a couple of)( to \d+)?( business| working)? (minutes?|hours?|days?|weeks?)|by (the )?(end of (the )?(day|week)|eod|cob|tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|next week)|eta|turnaround|shortly|as soon as possible|asap)\b/i;
const OUR_WORK_RE = /\b(we|we'll|we will|our|team|i'll|i will|you'll hear|hear back|follow up|get back|update you|resolve|fix|complete|finish|done|ready)\b/i;
function toneIssues(text, fwd) {
  const out = [];
  const fwdRe = fwd && fwd.by ? new RegExp('\\b(' + String(fwd.by).split(/\s+/)[0].replace(/[^\w]/g, '') + '|passing (this|it|along)|forwarded)\\b', 'i') : null;
  for (const sen of String(text || '').split(/(?<=[.!?])\s+|\n+/)) {
    if (/\[[^\]\n]{3,60}\]/.test(sen)) out.push({ kind: 'has a placeholder to fill in', text: sen.trim() });
    else if (fwdRe && fwdRe.test(sen)) out.push({ kind: 'mentions the internal forward', text: sen.trim() });
    else if (BLAME_RE.test(sen)) out.push({ kind: 'puts Adit down', text: sen.trim() });
    else if (TIME_RE.test(sen) && OUR_WORK_RE.test(sen)) out.push({ kind: 'gives a time frame', text: sen.trim() });
  }
  return out.slice(0, 6);
}
async function fixTone(reply, fwd) {
  const issues = toneIssues(reply, fwd);
  if (!issues.length || !D.ai) return { reply, issues };
  try {
    const r = await D.ai.bestJSON({ feature: 'expert-desk-draft', maxTokens: 2500, temperature: 0.2, timeoutMs: 45000,
      system: `You polish a support email from Adit (software for dental and other practices) before it goes to a client. Rewrite ONLY the sentences listed (a placeholder in square brackets is replaced with general wording that needs no filling in, for example "our team will reach out"; a greeting to an Adit colleague becomes a greeting to the client by name; a sentence about a colleague forwarding or passing along the message is removed or reworded to speak to the client directly), so they stay polite, professional and positive about Adit: no admission of fault, delay, bug or failure on Adit's side, no "unfortunately", no "we can't" (say what is possible instead), and no deadline or time frame for the team's work (say the team is on it and the client will hear back here). Handle any delay diplomatically, for example "Thank you for your patience while we looked into this." Keep every other sentence, every fact, step and link exactly as it is, and the greeting and "Best regards,". No em or en dashes. Return JSON {"reply": "the full email"}.`,
      user: `Sentences to rewrite:\n${issues.map((i) => '- (' + i.kind + ') ' + i.text).join('\n')}\n\nThe email:\n${reply}` });
    const out = r && r.json && String(r.json.reply || '').trim();
    const links = reply.match(/https?:\/\/[^\s)]+/g) || [];
    if (!out || out.length < 40 || links.some((u) => !out.includes(u))) return { reply, issues };
    const fixed = out.replace(/\s*[—–]\s*/g, ', ');
    return { reply: fixed, issues: toneIssues(fixed, fwd) };
  } catch (e) { console.warn('expert draft tone:', e.message); return { reply, issues }; }
}
async function humanize({ reply, firstName = '', lastClient = '', subject = '', forwardedBy = '' }) {
  if (!reply || !D.ai) return reply;
  try {
    const ls = await lessons(2);
    const learned = ls.length ? 'How agents recently rewrote Expert drafts before sending (learn the direction of the change, never copy facts):\n' + ls.map((x, i) => `Change ${i + 1}. Expert wrote:\n${cut(x.expert_text, 700)}\nThe agent sent:\n${cut(x.agent_text, 700)}`).join('\n\n') : '';
    const r = await D.ai.bestJSON({ system: STYLE_SYS + (learned ? '\n\n' + learned : ''), feature: 'expert-desk-draft', maxTokens: 2500, temperature: 0.4, timeoutMs: 60000,
      user: [`Client first name: ${firstName || 'not known'}`, forwardedBy ? `This email goes to the client directly. ${forwardedBy} (an Adit colleague) only forwarded the client's message to support: never greet, thank or mention ${forwardedBy}, the forward or "passing along"; write to the client as if they had emailed support themselves.` : '', subject ? `Ticket subject: ${cut(subject, 200)}` : '', lastClient ? `The client's latest message:\n${cut(lastClient, 2500)}` : '', `The draft to rewrite (facts and links to keep):\n${reply}`].filter(Boolean).join('\n\n') });
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
// Batch 314: every channel but phone is drafted. A web form or chat ticket has its request in the description or the
// chat transcript, so Expert is told where to look and writes the email follow-up.
const NO_DRAFT_CHANNEL = /phone|call|voice/i;
const channelHint = (ch) => { const c = String(ch || '').toLowerCase();
  if (!c || c === 'email') return '';
  if (/chat/.test(c)) return ' This ticket came from a chat: read the chat transcript (description and messages) and write the email follow-up, confirming what was resolved in the chat and answering anything still open.';
  return ` This ticket came in through ${ch} (no email thread): the client's request is in the description and any messages; write the email reply to it.`; };
const bounceHint = (b) => b ? ` The client's email ${b.bounced.join(', ')} bounced${b.serverWide ? ' (their mail server refused the connection, so other addresses at the same domain may fail too)' : ''}. ${b.allSame ? 'Every other address of the practice is on the same mail server, so email may not reach them at all: the draft stays on that address with ' + b.alt.map((a) => a.email).join(', ') + ' copied; in the note suggest reaching them through the usual callback process.' : 'Do not rely on that address: this draft goes to ' + (b.alt.length ? b.alt.map((a) => a.email + ' (' + a.why + ')').join(', ') : 'the same address, because no other email of the practice was found') + '.'} Write it so it reads well for whoever at the practice opens it, and in the private note say which address bounced, where the draft goes and why, and suggest asking the practice for a working email.` : '';
const sibHint = (sibs) => sibs && sibs.length ? ` The same caller has other open tickets: ${sibs.map((x) => '#' + x.number + ' "' + x.subject + '"' + (x.owner ? ' (owner ' + x.owner + ')' : '')).join('; ')}. They are the same request (for example the missed call and its voicemail). Read them, say in the private note to merge them into this ticket and reply once, and reflect anything already done on them (a callback attempt, a reply).` : '';
const fwdHint = (f) => f ? ` This email was forwarded internally by ${f.by || 'an Adit colleague'} (Adit staff, for example sales or a CSM) on behalf of the client ${f.name || ''} (${f.email}). The client's own message is inside the forwarded part. Write the reply TO THE CLIENT (greet ${f.name ? f.name.split(' ')[0] : 'them'} by name), not to ${f.by || 'the colleague'}, and never mention the internal forward in the client email. In the private note say who forwarded it and that the agent should keep them posted internally.` : '';
const QUESTION = (num, ch, f, b, sibs) => `#${num} Write the email reply to send the client now, answering everything in their latest message. Keep it polite, professional and positive about Adit: never admit fault, blame, delay or a bug on Adit's side, and never give a deadline or time frame for the team's work; handle any delay or gap diplomatically (thank them for their patience, say what is being done). Use what T1 can answer from the Help Center and the ticket, and say who follows up on the rest. Before writing, also check this client's recent calls and Avoma meetings, earlier tickets and any escalation for anything that changes the reply.${channelHint(ch)}${fwdHint(f)}${bounceHint(b)}${sibHint(sibs)} Never leave placeholders like [name] or [day and time] in the email.`;

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
// Batch 322 (#429113): an Adit colleague (sales, a CSM) forwards a client's email to support. The ticket's contact is the
// colleague, but the reply belongs to the client. The original sender is read from the forwarded message, the draft goes
// to the client, and the note says who forwarded it so the agent keeps them posted internally.
const INTERNAL_RE = /@adit\.com\b/i;
function parseForward(text, subject) {
  const t = String(text || '').replace(/<\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\s*>/g, ' $1 ').replace(/<br\s*\/?>|<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#64;/g, '@');
  if (!/forwarded message|begin forwarded message|original message|^\s*from:/im.test(t) && !/^\s*(fwd?|fw)\s*:/i.test(subject || '')) return null;
  const re = /From:\s*(?:"?([^"<\n\r@]{1,80}?)"?\s*)?<?\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\s*>?/gi; let m;
  while ((m = re.exec(t))) {
    const email = m[2].toLowerCase();
    if (INTERNAL_RE.test(email) || SKIP_SENDERS.some((x) => email.includes(x))) continue;
    return { email, name: String(m[1] || '').replace(/\s+/g, ' ').trim() };
  }
  return null;
}
// Batch 323: the same caller's other open tickets (RingCentral makes one ticket for the missed call and another for the
// voicemail of the same call). Same contact, opened within 3 days, and the same phone number when both show one.
const phoneIn = (s0) => { const m = String(s0 || '').match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/); return m ? m[0].replace(/\D/g, '').slice(-10) : ''; };
const norm = (s0) => String(s0 || '').toLowerCase().replace(/^((re|fwd?|fw)\s*:\s*)+/, '').replace(/\s+/g, ' ').trim();
async function siblingsOf(id, t) {
  const cid = t && (t.contactId || (t.contact && t.contact.id)); if (!cid) return [];
  const r = await (D.deskRead || require('./desk-service').fetchRaw)(`/contacts/${cid}/tickets?limit=30&sortBy=-createdTime`).catch(() => null);
  const me = Date.parse(t.createdTime || '') || Date.now(), myPh = phoneIn(t.subject) || String(t.phone || '').replace(/\D/g, '').slice(-10);
  return ((r && r.data) || []).filter((x) => String(x.id) !== String(id) && String(x.statusType || '') !== 'Closed' && !/closed/i.test(String(x.status || ''))
    && Math.abs((Date.parse(x.createdTime || '') || 0) - me) < 3 * 864e5 && ((myPh && phoneIn(x.subject) === myPh) || (norm(x.subject) && norm(x.subject) === norm(t.subject))))
    .map((x) => ({ id: String(x.id), number: String(x.ticketNumber), subject: cut(x.subject, 120), created: x.createdTime, owner: x.assignee ? [x.assignee.firstName, x.assignee.lastName].filter(Boolean).join(' ') : '' }))
    .sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
}
// Batch 323: when the client's email bounced (mail server refused, mailbox full, address gone), the draft goes to another
// address of the same practice: the contact's second email, other contacts on the account, or senders of the account's
// recent tickets. When the whole mail server refused, addresses at another domain come first.
const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery|microsoftexchange|no-?reply@.*(google|outlook)/i;
const BOUNCE_TXT = /delivery (status notification|has failed|failure|incomplete)|undeliverable|could not be delivered|permanent error|returned mail|message not delivered|mailbox (is )?(full|unavailable)|address (couldn't|could not) be found|recipient address rejected|550[ -]|554[ -]|421[ -]|4\.\d\.\d|5\.\d\.\d/i;
// Batch 331: mail-server notices (delay warnings, bounces, auto-replies) are not the client writing. The client is
// waiting only when their own message is the latest real one, or when the agent's latest reply hard-bounced and was
// never delivered. A "warning only, do not resend" delay notice never counts (Nov 13: a Microsoft outage sent many).
const NOTICE_TXT = /warning message only|do not need to resend|delivery (status notification|delayed|has been delayed)|delayed delivery|still trying|will (retry|keep trying)|automatic(ally)? (reply|generated)|auto-?reply|out of (the )?office/i;
const SOFT_TXT = /warning message only|do not need to resend|will (retry|keep trying)|still trying|delayed/i;
const HARD_TXT = /permanent|fatal|could not be delivered|undeliverable|delivery (has failed|failure)|address (couldn't|could not) be found|recipient address rejected|mailbox (is )?(full|unavailable)|does not exist|user unknown|no such user|\b55[0-4]\b|5\.\d\.\d/i;
function isNotice(x) { return x.direction === 'in' && (BOUNCE_FROM.test(String(x.fromEmailAddress || '')) || /^(mailer-daemon|postmaster)/i.test(String((x.author && x.author.name) || '')) || NOTICE_TXT.test(String(x.summary || ''))); }
function delivered(x) { return ((x && x.readReceipts) || []).some((r) => (r.statusVsTime || []).some((s) => /^(delivered|opened|read)/i.test(String(s.Status || '')))); }
async function waitingState(list, ignore = [], id = null) {
  const at = (x) => Date.parse(x.createdTime || x.sendDateTime || '') || 0;
  const real = (list || []).filter((x) => !/draft/i.test(String(x.status || '')) && !ignore.includes(String(x.id)));
  const msgs = real.filter((x) => !isNotice(x) && !(x.direction === 'out' && /telephony|phone/i.test(String(x.channel || '')))).sort((a, b) => at(b) - at(a));
  const last = msgs[0];
  if (!last || last.direction === 'in') return { waiting: true };
  const after = real.filter((x) => isNotice(x) && at(x) > at(last)).sort((a, b) => at(b) - at(a));
  for (const n of after) {
    let txt = String(n.summary || '');
    if (id && !HARD_TXT.test(txt)) { const full = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${id}/threads/${n.id}`).catch(() => null); txt = String((full && (full.plainText || full.content)) || txt).replace(/<[^>]+>/g, ' '); }
    if (HARD_TXT.test(txt) && !SOFT_TXT.test(txt) && !delivered(last)) return { waiting: true, bounce: true };
  }
  return { waiting: false, by: (last.author && last.author.name) || 'an agent', at: last.createdTime };
}
async function bounceOf(id, t) {
  const read = D.deskRead || require('./desk-service').fetchRaw;
  const th = await readThreads(id).catch(() => null);
  const b = ((th && th.data) || []).filter((x) => x.direction === 'in' && (BOUNCE_FROM.test(String(x.fromEmailAddress || '')) || BOUNCE_TXT.test(String(x.summary || ''))))
    .sort((a, c) => Date.parse(c.createdTime || '') - Date.parse(a.createdTime || ''))[0];
  if (!b) return null;
  const full = await read(`/tickets/${id}/threads/${b.id}`).catch(() => null);
  const txt = String((full && (full.plainText || full.content)) || b.summary || '').replace(/<[^>]+>/g, ' ');
  const known = [t.email, t.contact && t.contact.email].filter(Boolean).map((e) => String(e).toLowerCase());
  const inBody = (txt.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map((e) => e.toLowerCase()).filter((e) => !INTERNAL_RE.test(e) && !BOUNCE_FROM.test(e));
  const bounced = Array.from(new Set(inBody.filter((e) => known.includes(e)).concat(inBody.length ? [] : known))).slice(0, 3);
  if (!bounced.length) bounced.push(...known.slice(0, 1));
  const serverWide = /connection|too many|rate limit|limited|temporar|deferred|timed? ?out|greylist|server|4\.\d\.\d|421/i.test(txt);
  const reason = (txt.match(/(Remote server returned[^.]{0,120}|Diagnostic-Code:[^\n]{0,140}|\b5\d\d[ -][^\n]{0,120}|\b4\d\d[ -][^\n]{0,120})/i) || [])[0] || '';
  // other addresses for the same practice
  const cid = t.contactId || (t.contact && t.contact.id), aid = t.accountId || (t.contact && t.contact.account && t.contact.account.id);
  const [ct, ac, tk] = await Promise.all([cid ? read(`/contacts/${cid}`).catch(() => null) : null, aid ? read(`/accounts/${aid}/contacts?limit=20`).catch(() => null) : null, aid ? read(`/accounts/${aid}/tickets?limit=30&sortBy=-createdTime`).catch(() => null) : null]);
  // Batch 324: only the practice's own addresses. Accounts in Desk can hold mislinked or test contacts, so an address
  // counts only when it is the ticket contact's own second email, or it is at the practice's domain (the bounced
  // address's domain or the account website). Free mail (gmail and the like) from other contacts is never used.
  const dom = (e) => String(e || '').split('@')[1] || '';
  const site = String((t.contact && t.contact.account && t.contact.account.website) || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const practice = new Set(bounced.map(dom).concat(site ? [site] : []).filter((d) => d && !/^(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn|comcast|att|sbcglobal)\./.test(d)));
  const alt = [];
  const add = (e, why, own) => { e = String(e || '').toLowerCase().trim(); if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(e) || bounced.includes(e) || INTERNAL_RE.test(e) || /aditqa|test|example\./.test(e) || SKIP_SENDERS.some((x) => e.includes(x)) || alt.some((a) => a.email === e)) return; if (!own && !practice.has(dom(e))) return; alt.push({ email: e, why, sameDomain: practice.has(dom(e)) && bounced.some((b0) => dom(b0) === dom(e)) }); };
  if (ct) { add(ct.secondaryEmail, "the contact's second email", true); add(ct.email, "the contact's email", true); }
  for (const c of (ac && ac.data) || []) { add(c.email, 'another contact at the practice'); add(c.secondaryEmail, 'another contact at the practice'); }
  for (const x of (tk && tk.data) || []) add(x.email, 'an address the practice wrote from before');
  if (serverWide) alt.sort((a, c) => (a.sameDomain ? 1 : 0) - (c.sameDomain ? 1 : 0));
  // When the whole mail server refused and every other address is on that server too, the draft stays on the original
  // address with the others copied, and the note says to reach them another way.
  const allSame = serverWide && alt.length && alt.every((a) => a.sameDomain);
  return { bounced, serverWide, allSame, reason: cut(reason.replace(/\s+/g, ' '), 160), alt: alt.slice(0, 3), at: b.createdTime };
}
async function forwardOf(id, t) {
  if (!t || !INTERNAL_RE.test(String(t.email || '') + ' ' + String((t.contact && t.contact.email) || ''))) return null;
  const th = await readThreads(id).catch(() => null);
  const inc = ((th && th.data) || []).filter((x) => x.direction === 'in').sort((a, b) => Date.parse(b.createdTime || '') - Date.parse(a.createdTime || ''))[0];
  if (!inc || !INTERNAL_RE.test(String(inc.fromEmailAddress || ''))) return null;
  const full = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${id}/threads/${inc.id}`).catch(() => null);
  const f = parseForward((full && (full.content || full.plainText)) || inc.summary || '', t.subject);
  if (!f) return null;
  const by = String(inc.fromEmailAddress || '').replace(/<.*$/, '').replace(/"/g, '').trim() || String(inc.fromEmailAddress || '');
  return Object.assign(f, { by, byEmail: addrOf(inc.fromEmailAddress) });
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
  // Batch 326: a draft started by hand or by the waiting-ticket check gets the same safety checks as the webhook: no draft
  // once the ticket left T1, or when an agent already replied after the client's last message.
  if (mode === 'save' && source !== 'webhook') {
    if (t && t.teamId && String(t.teamId) !== T1_TEAM()) throw err(409, `Not drafted: #${num} is now with ${(t.team && t.team.name) || 'another team'}, not T1.`);
    if (t && t.assigneeId && D.t1Agents) { const t1 = (await D.t1Agents().catch(() => [])).map((a) => String(a.id)); if (t1.length && !t1.includes(String(t.assigneeId))) throw err(409, `Not drafted: #${num} is owned by ${t.assignee ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(' ') : 'someone'} outside T1.`); }
    const th0 = await readThreads(id).catch(() => null);
    const ws = await waitingState((th0 && th0.data) || [], [], id);
    if (!ws.waiting) throw err(409, `Not drafted: an agent already replied on #${num} (${ws.by}) and the client has not written since.`);
  }
  const fwd = await forwardOf(id, t).catch(() => null);
  // Batch 322: a re-run by hand replaces Expert's own unsent draft instead of adding a second one.
  if (!replace.length && mode === 'save') replace = (await all(`SELECT draft_id FROM expert_desk_drafts WHERE ticket_id = ? AND draft_id IS NOT NULL AND coalesce(draft_state, 'in desk') = 'in desk'`, [id]).catch(() => [])).map((r) => String(r.draft_id));
  const r = await run(`INSERT INTO expert_desk_drafts (ticket_id, number, mode, status, source, fwd_to, fwd_by) VALUES (?,?,?,?,?,?,?)`, [id, num, mode, mode === 'text' ? 'working' : 'queued', source, fwd ? fwd.email : null, fwd ? JSON.stringify({ name: fwd.name, by: fwd.by, byEmail: fwd.byEmail }) : null]);
  const jobId = r.lastID;
  await remember(jobId, t);
  if (mode === 'text') {
    // Batch 293: Expert keeps writing in the background. The call waits up to 30 seconds (Zoho waits about 40); if the
    // draft is not ready yet the answer says pending, and GET /api/expert/desk-draft/<jobId>?wait=30 collects it.
    const t0 = Date.now();
    const p = D.expert.ask({ question: QUESTION(num, t && t.channel, fwd), mode: 'email', modeLocked: true, depth: 'fast', draft: true, email: 'desk-automation' })
      .then(async (out) => { const pk = pick(out); pk.reply = await humanize(Object.assign({ reply: pk.reply }, clientBits(out, t))); pk.reply = (await fixTone(pk.reply)).reply; await run(`UPDATE expert_desk_drafts SET status = 'done', reply = ?, note = ?, ms = ?, log_id = ?, done_at = datetime('now') WHERE id = ?`, [pk.reply, pk.note, Date.now() - t0, out.logId || null, jobId]); })
      .catch(async (e) => { await run(`UPDATE expert_desk_drafts SET status = 'failed', error = ?, ms = ?, done_at = datetime('now') WHERE id = ?`, [cut(e.message, 300), Date.now() - t0, jobId]).catch(() => {}); });
    _live.set(jobId, p); p.finally(() => setTimeout(() => _live.delete(jobId), 60000));
    return result(jobId, WAIT_MS());
  }
  // Batch 325: a re-run reuses Expert's earlier note on the ticket (updated in place), so a ticket never has two.
  const prevNote = await get(`SELECT comment_id FROM expert_desk_drafts WHERE ticket_id = ? AND comment_id IS NOT NULL AND id != ? AND coalesce(note_state, '') = '' ORDER BY id DESC LIMIT 1`, [id, jobId]).catch(() => null);
  _queue.push({ jobId, id, num, t, replace, fwd, cm0: prevNote ? { id: prevNote.comment_id } : null }); pump();
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
const STOPPED = 'Adit Expert stopped before it finished a draft for this ticket. Please reply as usual. You can draft it again from Settings > Desk drafts.';
// Batch 317: "writing" notes left on tickets with no job still running (from before the note ID was kept) are closed.
async function stuckNotes(out) {
  const read = D.deskRead || require('./desk-service').fetchRaw;
  const s0 = await read(`/tickets/search?tag=expert-drafting&limit=50`).catch(() => null);
  for (const t of (s0 && s0.data) || []) {
    await adoptLegacy(t.id).catch(() => 0);
    const live = await get(`SELECT id FROM expert_desk_drafts WHERE ticket_id = ? AND status IN ('queued','working') AND created_at > datetime('now', '-30 minutes')`, [String(t.id)]);
    if (live) continue;
    const cm = await read(`/tickets/${t.id}/comments?limit=50`).catch(() => null);
    for (const c of (cm && cm.data) || []) {
      if (!/Adit Expert is writing a draft reply/.test(String(c.content || ''))) continue;
      if (Date.now() - (Date.parse(c.commentedTime || '') || 0) < 20 * 60000) continue;
      // a newer draft finished on this ticket: the old note goes; otherwise it says Expert stopped
      const newer = await get(`SELECT id FROM expert_desk_drafts WHERE ticket_id = ? AND status = 'done' AND done_at > ?`, [String(t.id), String(c.commentedTime || '').slice(0, 19).replace('T', ' ')]);
      if (newer && !require('./ticket-doc-note').enabled()) await desk('DELETE', `/tickets/${t.id}/comments/${c.id}`).catch(() => setNote(t.id, { id: c.id }, STOPPED));
      else { const DOC = require('./ticket-doc-note'); await setNote(t.id, { id: c.id }, DOC.enabled() ? (await DOC.withLead(t.id, STOPPED)).html : html(STOPPED), true); }
      out.stuckNotes = (out.stuckNotes || 0) + 1;
    }
    await tags(t.id, null, 'expert-drafting');
  }
}
async function tags(id, add, remove) {
  if (add) await desk('POST', `/tickets/${id}/associateTag`, { tags: [add] }).catch((e) => console.warn('expert desk draft tag:', e.message));
  if (remove) await desk('POST', `/tickets/${id}/dissociateTag`, { tags: [remove] }).catch(() => {});
}
async function setNote(id, cm, text, asHtml) {
  const content = asHtml ? text : html(text);
  if (cm && cm.id) { try { return await desk('PATCH', `/tickets/${id}/comments/${cm.id}`, { contentType: 'html', content }); } catch (e) { console.warn('expert desk draft note update:', e.message); if (/NOT_OURS/.test(e.message)) return null; } }
  try { return await desk('POST', `/tickets/${id}/comments`, { isPublic: false, contentType: 'html', content }); } catch (e) { console.warn('expert desk draft comment:', e.message); return null; }
}
// Batch 313: the private note as short, scannable pointers. The "Label: value" lines Expert writes become a few header
// lines (who, account, ticket) and short sections with bullets; "see ticket" and "not given" lines are left out.
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEAD_KEYS = ['Client', 'Practice', 'Account number', 'Deal stage', 'Ticket'];
const SECTIONS = [['Reason for contact', 'Why they wrote'], ['What was checked', 'What Expert checked'], ['Findings', 'What Expert found'], ['T1 answered', 'T1 answered'], ['Handed over', 'Handed over'], ['Client prefers', 'Client prefers'], ['Next team should', 'Next step']];
function bullets(v) {
  const t = String(v || '').trim(); if (!t) return [];
  // split on "; " and on ". " before a capital, but never inside brackets
  const parts = []; let cur = '', depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '(' || c === '[') depth++; else if ((c === ')' || c === ']') && depth > 0) depth--;
    const nx = t.slice(i + 1, i + 3);
    if (depth === 0 && (c === ';' && nx[0] === ' ' || c === '.' && /^ [A-Z#(]/.test(nx) && !/\b(e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|St|No)$/i.test(cur.trim()))) { parts.push(cur); cur = ''; i++; continue; }
    cur += c;
  }
  parts.push(cur);
  let out = parts.map((x) => x.replace(/^[-\u2022]\s*/, '').replace(/\.$/, '').trim()).filter(Boolean);
  // one long list of things ("tickets, CRM, Help Center") reads better as bullets too
  if (out.length === 1 && out[0].length > 110) {
    const items = []; let c2 = '', d2 = 0;
    for (const ch of out[0]) { if (ch === '(') d2++; else if (ch === ')' && d2 > 0) d2--; if (ch === ',' && d2 === 0) { items.push(c2); c2 = ''; continue; } c2 += ch; }
    items.push(c2);
    if (items.length >= 3) out = items.map((x) => x.replace(/^\s*(and|or)\s+/i, '').trim()).filter(Boolean);
  }
  return out.map((x) => x[0].toUpperCase() + x.slice(1)).slice(0, 8);
}
function noteHtml(head, note) {
  const lines = String(note || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const fields = {}, order = []; let last = null;
  for (const l of lines) {
    const m = l.match(/^([A-Za-z][A-Za-z /]{1,30}):\s*(.*)$/);
    if (m && !/^https?$/i.test(m[1])) { last = m[1].trim(); fields[last] = (fields[last] ? fields[last] + '; ' : '') + m[2].trim(); if (!order.includes(last)) order.push(last); }
    else if (last) fields[last] += (fields[last] ? '; ' : '') + l.replace(/^[-•]\s*/, '');
    else { fields._lead = (fields._lead ? fields._lead + ' ' : '') + l; }
  }
  const skip = (v) => !v || /^(see ticket|not given|none|n\/a|-)\.?$/i.test(String(v).trim());
  const out = [`<p><b>${esc(head)}</b></p>`];
  if (fields._lead) out.push(`<p>${esc(fields._lead)}</p>`);
  const hd = HEAD_KEYS.filter((k) => !skip(fields[k])).map((k) => `<b>${esc(k === 'Account number' ? 'Account' : k === 'Deal stage' ? 'Stage' : k)}:</b> ${esc(fields[k])}`);
  if (hd.length) out.push(`<p>${hd.join('<br>')}</p>`);
  const used = new Set(HEAD_KEYS.concat(['Callback number', 'Email', '_lead']));
  for (const [k, title] of SECTIONS) {
    used.add(k); if (skip(fields[k])) continue;
    const b = bullets(fields[k]);
    out.push(b.length > 1 ? `<p><b>${esc(title)}</b></p><ul>${b.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p><b>${esc(title)}:</b> ${esc(b[0] || fields[k])}</p>`);
  }
  for (const k of order) if (!used.has(k) && !skip(fields[k])) out.push(`<p><b>${esc(k)}:</b> ${esc(fields[k])}</p>`);
  return out.join('');
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
async function work({ jobId, id, num, t, replace = [], cm0 = null, fwd = null }) {
  const t0 = Date.now();
  await run(`UPDATE expert_desk_drafts SET status = 'working' WHERE id = ?`, [jobId]);
  // Batch 331: check again first (the job may have waited in the queue): an agent reply since the client's last real
  // message means nothing is needed, and no note is written. Mail-server notices are ignored; a bounce is handled only
  // when it was a real failure on a reply that was never delivered.
  const ws0 = await waitingState(((await readThreads(id).catch(() => null)) || {}).data || [], replace, id).catch(() => ({ waiting: true }));
  if (!ws0.waiting) {
    await run(`UPDATE expert_desk_drafts SET status = 'skipped', error = ?, ms = ?, draft_state = 'not saved', done_at = datetime('now') WHERE id = ?`, ['an agent already replied (' + ws0.by + ') and the client has not written since', Date.now() - t0, jobId]);
    return;
  }
  let cm = null;
  // Batch 317: the "writing" note's ID is kept at once, so a restart can still close or reuse it.
  // Batch 328: the ticket's documentation notes. The first note is written before the draft if there is none; the draft
  // then writes into the case update note (one note, edited in place).
  const DOC = require('./ticket-doc-note');
  if (canWrite() && DOC.enabled()) { await DOC.touch(id).catch(() => null); const dn = await DOC.noteId(id); if (dn) cm0 = dn; }
  const docLead = async (lead, extraNext) => DOC.enabled() ? (await DOC.withLead(id, lead, extraNext)).html : html(lead);
  if (canWrite()) { cm = await setNote(id, cm0, await docLead(WRITING), true) || cm0; tags(id, 'expert-drafting').catch(() => {}); if (cm && cm.id) { await run(`UPDATE expert_desk_drafts SET comment_id = ? WHERE id = ?`, [String(cm.id), jobId]).catch(() => {}); if (DOC.enabled()) await DOC.keep(id, cm.id, (await DOC.withLead(id, '')).sections); } }
  try {
    // Batch 323: a newer ticket from the same caller as an older open one is not drafted: the note says to merge it into
    // the older ticket, which gets the draft (or is handled by its owner).
    const tt = t || await readTicket(id).catch(() => null);
    const sibs = tt ? await siblingsOf(id, tt).catch(() => []) : [];
    const older = sibs.filter((x) => Date.parse(x.created) < (Date.parse((tt && tt.createdTime) || '') || 0));
    if (older.length) {
      const o = older[0];
      await setNote(id, cm, await docLead(`Same caller as #${o.number}${o.owner ? ' (owner ' + o.owner + ')' : ''}: this ticket and #${o.number} "${o.subject}" are the same request, opened ${new Date(o.created).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT. No separate draft here.`, `Merge this ticket into #${o.number} and reply to the client once from there${o.owner ? ', together with ' + o.owner + ' who has it' : ''}.`), true);
      await tags(id, null, 'expert-drafting');
      await run(`UPDATE expert_desk_drafts SET status = 'skipped', error = ?, comment_id = ?, ms = ?, draft_state = 'not saved', done_at = datetime('now') WHERE id = ?`, ['Same caller as #' + o.number + ': merge into it', (cm && cm.id) || null, Date.now() - t0, jobId]);
      return;
    }
    const bounce = tt && ws0.bounce ? await bounceOf(id, tt).catch(() => null) : null;
    const out = await D.expert.ask({ question: QUESTION(num, t && t.channel, fwd, bounce, sibs), mode: 'email', modeLocked: true, depth: 'thinking', email: 'desk-automation' });
    const p = pick(out);
    if (!p.reply) throw new Error('Expert wrote no client reply');
    p.reply = await humanize(Object.assign({ reply: p.reply }, clientBits(out, t), fwd ? { firstName: (fwd.name || '').split(' ')[0], forwardedBy: fwd.by || 'a colleague' } : {}));
    const tone = await fixTone(p.reply, fwd); p.reply = tone.reply;
    if (tone.issues.length) p.note = (p.note ? p.note + '\n' : '') + 'Findings: please check the tone of the draft before sending (' + tone.issues.map((i) => i.kind + ': "' + cut(i.text, 90) + '"').join('; ') + ')';
    readTicket(id).then((t2) => t2 && remember(jobId, t2)).catch(() => {});
    const jq = await get(`SELECT created_at FROM expert_desk_drafts WHERE id = ?`, [jobId]).catch(() => null);
    const queuedAt = Math.min(t0, (jq && Date.parse(String(jq.created_at).replace(' ', 'T') + 'Z')) || t0);
    const acted = await agentActed(id, queuedAt, replace); // Batch 331: since the job was queued, not since it started
    if (acted) {
      await setNote(id, cm, await docLead(`Adit Expert did not add a draft: ${acted} while it was writing.`), true);
      await tags(id, null, 'expert-drafting');
      await run(`UPDATE expert_desk_drafts SET status = 'skipped', error = ?, reply = ?, note = ?, comment_id = ?, ms = ?, log_id = ?, draft_state = 'not saved', done_at = datetime('now') WHERE id = ?`,
        [acted, p.reply, p.note, (cm && cm.id) || null, Date.now() - t0, out.logId || null, jobId]);
      return;
    }
    const ad = await addresses(id, t);
    if (fwd && fwd.email) ad.to = fwd.email; // Batch 322: the reply goes to the client, not the colleague who forwarded it
    if (bounce && bounce.alt.length) { // Batch 323/324
      if (bounce.allSame) ad.cc = bounce.alt.slice(0, 2).map((a) => a.email).join(',');
      else { ad.to = bounce.alt[0].email; ad.cc = bounce.alt.slice(1, 3).map((a) => a.email).join(','); }
    }
    if (!ad.from || !ad.to) throw new Error('No From or To address for the draft (set DESK_DRAFT_FROM)');
    // The older, unsent Expert draft goes; the new one answers the client's latest message.
    for (const old of replace) {
      try { await desk('DELETE', `/tickets/${id}/draftReply/${old}`); await run(`UPDATE expert_desk_drafts SET draft_state = 'replaced' WHERE ticket_id = ? AND draft_id = ?`, [id, old]); }
      catch (e) { console.warn('expert draft replace:', e.message); await run(`UPDATE expert_desk_drafts SET error = ? WHERE ticket_id = ? AND draft_id = ?`, ['Could not remove this older draft: ' + cut(e.message, 200), id, old]).catch(() => {}); }
    }
    const body = Object.assign({ channel: 'EMAIL', fromEmailAddress: ad.from, to: ad.to, cc: ad.cc || '', contentType: 'html', content: html(p.reply) });
    // Batch 324: when an older Expert draft could not be deleted, it is updated in place instead of adding another one.
    let dr = null;
    const left = [];
    for (const old of replace) { const still = await get(`SELECT id FROM expert_desk_drafts WHERE ticket_id = ? AND draft_id = ? AND coalesce(draft_state, 'in desk') = 'in desk'`, [id, old]).catch(() => null); if (still) left.push(old); }
    if (left.length) { try { dr = await desk('PATCH', `/tickets/${id}/draftReply/${left[left.length - 1]}`, body); if (dr && !dr.id) dr.id = left[left.length - 1]; await run(`UPDATE expert_desk_drafts SET draft_state = 'replaced', error = NULL WHERE ticket_id = ? AND draft_id = ?`, [id, left[left.length - 1]]); } catch (e) { console.warn('expert draft update:', e.message); dr = null; } }
    if (!dr) dr = await desk('POST', `/tickets/${id}/draftReply`, body);
    // Batch 325: link the ticket to the client's account in Desk when the match is certain: the ticket had none, Expert
    // matched the CRM account by an exact email or the account number, and exactly one Desk account has that name.
    let linked = '';
    const cm2 = out && out.ticket && out.ticket.crmMatch;
    if (cm2 && cm2.account && /email|account number/i.test(cm2.by) && !/name in the ticket subject|domain/i.test(cm2.by) && !(tt && (tt.accountId || (tt.contact && tt.contact.account && tt.contact.account.id)))) {
      try {
        const sr = await (D.deskRead || require('./desk-service').fetchRaw)(`/accounts/search?accountName=${encodeURIComponent(cm2.account)}&limit=5`).catch(() => null);
        const exact = ((sr && sr.data) || []).filter((a) => String(a.accountName || '').trim().toLowerCase() === cm2.account.trim().toLowerCase());
        if (exact.length === 1) { await desk('PATCH', `/tickets/${id}`, { accountId: String(exact[0].id) }); linked = ` Linked this ticket to the account ${cm2.account} (matched by ${cm2.by}).`; }
      } catch (e) { console.warn('expert link account:', e.message); }
    }
    const bHead = bounce ? ` ${bounce.bounced.join(', ')} bounced${bounce.serverWide ? ' (their mail server refused it)' : ''}, so ${bounce.alt.length ? (bounce.allSame ? 'every other address is on the same mail server; the draft stays on ' + ad.to + ' with ' + ad.cc.split(',').join(', ') + ' copied, and a call through the usual callback process is the surer way to reach them' : 'this draft goes to ' + ad.to + (ad.cc ? ' with ' + ad.cc.split(',').join(', ') + ' copied' : '') + ' instead') : 'no other email was found: ask the practice for a working email or arrange a callback through the usual process'}.` : '';
    const head = (fwd ? `Expert draft ready in the reply box, addressed to the client ${fwd.name ? fwd.name + ' ' : ''}(${fwd.email}). ${fwd.by || 'An Adit colleague'} forwarded this internally: reply to the client and keep ${fwd.by ? fwd.by.split(' ')[0] : 'them'} posted here.` : 'Expert draft ready in the reply box. Review before sending.') + bHead + linked;
    if (DOC.enabled()) {
      const fd = await DOC.fromDraft(id, { note: p.note, lead: head.replace(/^Expert draft ready in the reply box\. Review before sending\.\s*/, '').trim(), firstStep: 'Review Expert\'s draft in the reply box, edit it if needed and send it.', splitter: bullets });
      cm = await setNote(id, cm, fd.html, true) || cm;
      if (cm && cm.id) await DOC.keep(id, cm.id, fd.sections);
    } else cm = await setNote(id, cm, noteHtml(head, p.note), true) || cm;
    await tags(id, 'expert-draft', 'expert-drafting');
    await run(`UPDATE expert_desk_drafts SET status = 'done', reply = ?, note = ?, draft_id = ?, comment_id = ?, ms = ?, log_id = ?, draft_state = 'in desk', done_at = datetime('now') WHERE id = ?`,
      [p.reply, p.note, (dr && dr.id) || null, (cm && cm.id) || null, Date.now() - t0, out.logId || null, jobId]);
  } catch (e) {
    if (cm) { await setNote(id, cm, await docLead('Adit Expert could not write a draft for this ticket. Please reply as usual.').catch(() => html('Adit Expert could not write a draft for this ticket. Please reply as usual.')), true); await tags(id, null, 'expert-drafting'); }
    await run(`UPDATE expert_desk_drafts SET status = 'failed', error = ?, ms = ?, done_at = datetime('now') WHERE id = ?`, [cut(e.message, 300), Date.now() - t0, jobId]);
  }
}
// Every few minutes: an Expert draft left in Desk after an agent sent their own reply is removed, so it never sits as
// a duplicate; a sent draft is marked sent. Drafts from the last 3 days are checked.
// How alike two texts are (0 to 1), by shared word pairs. Used to tell an untouched draft from an edited one.
const plain = (h) => String(h || '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const ownPart = (t) => plain(t).split(/\n?(?:-{4} ?on .{5,80} wrote -{4}|On .{5,80} wrote:|From: .+\n?Sent: )/i)[0].trim();
function similarity(a, b) {
  const pairs = (t) => { const w = String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean); const p = new Set(); for (let i = 0; i < w.length - 1; i++) p.add(w[i] + ' ' + w[i + 1]); return p; };
  const x = pairs(a), y = pairs(b); if (!x.size && !y.size) return 1;
  let same = 0; for (const k of x) if (y.has(k)) same++;
  return same / Math.max(x.size, y.size);
}
const scrubText = (t) => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[contact]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[contact]');
// Keep what the agent actually sent next to what Expert drafted, when it differs. The agent's signature block is cut.
async function learn(r, thread, kind) {
  const full = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${r.ticket_id}/threads/${thread.id}`).catch(() => null);
  let sent = ownPart((full && (full.content || full.plainText)) || thread.summary || '');
  sent = sent.split(/\n(?:Best regards|Kind regards|Regards|Thanks|Thank you),?\s*\n/i)[0].trim();
  const mine = String(r.reply || '').split(/\n(?:Best regards|Kind regards|Regards),?\s*$/i)[0].trim();
  if (!sent || !mine) return null;
  const sim = similarity(mine, sent);
  if (kind === 'edited' && sim >= 0.9) return { sim, kept: false };
  await run(`INSERT OR IGNORE INTO expert_draft_lessons (job_id, ticket_id, number, agent, kind, similarity, expert_text, agent_text) VALUES (?,?,?,?,?,?,?,?)`,
    [r.id, r.ticket_id, r.number, cut((thread.author && thread.author.name) || '', 80), kind, Math.round(sim * 100) / 100, cut(scrubText(mine), 4000), cut(scrubText(sent), 4000)]).catch(() => {});
  return { sim, kept: true, agent: (thread.author && thread.author.name) || 'the agent' };
}
async function lessons(limit = 2) {
  try { return await all(`SELECT expert_text, agent_text FROM expert_draft_lessons WHERE similarity < 0.75 ORDER BY id DESC LIMIT ?`, [limit]); } catch (e) { return []; }
}
// Expert's private note after the agent acted: short, saying what happened. When an agent added their own private note
// after Expert's, Expert's note is deleted (the agent's note is the record).
async function noteAfter(r, text) { /* Batch 328: the case update note is kept for documentation */ if (!r.comment_id || require('./ticket-doc-note').enabled()) return; await desk('PATCH', `/tickets/${r.ticket_id}/comments/${r.comment_id}`, { contentType: 'html', content: html(text) }).catch((e) => console.warn('expert note update:', e.message)); }
async function notesSweep(out) {
  const rows = await all(`SELECT id, ticket_id, comment_id, done_at FROM expert_desk_drafts WHERE comment_id IS NOT NULL AND coalesce(note_state, '') = '' AND done_at > datetime('now', '-3 days') ORDER BY id DESC LIMIT 60`);
  for (const r of rows) {
    const cm = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${r.ticket_id}/comments?limit=50`).catch(() => null);
    const list = (cm && cm.data) || [], mine = list.find((c) => String(c.id) === String(r.comment_id));
    if (!mine) { await run(`UPDATE expert_desk_drafts SET note_state = 'gone' WHERE id = ?`, [r.id]); continue; }
    const after = list.find((c) => String(c.id) !== String(r.comment_id) && String(c.commenterId) !== String(mine.commenterId) && Date.parse(c.commentedTime || '') > Date.parse(mine.commentedTime || ''));
    if (!after) continue;
    try { await desk('DELETE', `/tickets/${r.ticket_id}/comments/${r.comment_id}`); out.notesRemoved++; await run(`UPDATE expert_desk_drafts SET note_state = 'removed' WHERE id = ?`, [r.id]); }
    catch (e) { out.failed++; await run(`UPDATE expert_desk_drafts SET note_state = 'kept' WHERE id = ?`, [r.id]); console.warn('expert note remove:', e.message); }
  }
}
// Batch 322: an older Expert draft still in Desk after a newer Expert draft on the same ticket is removed (a re-run that
// could not delete it at the time); the error is kept on the row so the page shows why.
async function oldDrafts(out) {
  const rows = await all(`SELECT a.id, a.ticket_id, a.draft_id FROM expert_desk_drafts a WHERE a.draft_id IS NOT NULL AND coalesce(a.draft_state, 'in desk') = 'in desk' AND a.done_at > datetime('now', '-3 days')
    AND EXISTS (SELECT 1 FROM expert_desk_drafts b WHERE b.ticket_id = a.ticket_id AND b.id > a.id AND b.status = 'done' AND b.draft_id IS NOT NULL) LIMIT 20`);
  for (const r of rows) {
    try { await desk('DELETE', `/tickets/${r.ticket_id}/draftReply/${r.draft_id}`); await run(`UPDATE expert_desk_drafts SET draft_state = 'replaced', error = NULL WHERE id = ?`, [r.id]); out.replaced = (out.replaced || 0) + 1; }
    catch (e) {
      if (/404|not ?found|URL_NOT_FOUND/i.test(e.message)) { await run(`UPDATE expert_desk_drafts SET draft_state = 'replaced' WHERE id = ?`, [r.id]); continue; }
      await run(`UPDATE expert_desk_drafts SET error = ? WHERE id = ?`, ['Could not remove this older draft: ' + cut(e.message, 200), r.id]); out.failed++;
    }
  }
}
// Batch 327: someone outside T1 took the ticket over (another team, or an owner who is not a T1 agent) while Expert's
// draft was unsent. The draft stays for the new owner to use or discard; Expert's note is rewritten for them, naming
// the T1 agent who had it, and the ticket is tagged. Expert does not draft on that ticket again.
// Batch 329: notes the tool wrote before it kept their IDs are recognised only when BOTH hold: the note was written by
// the tool's own Desk user (the writer of notes it does have on record) and it starts with one of the tool's fixed
// openings. Those are recorded as the tool's own; nothing else is ever touched.
const LEGACY_RE = /^\s*(Expert draft ready in the reply box|Adit Expert is writing a draft reply|Adit Expert did not add a draft|Adit Expert could not write a draft|Adit Expert stopped before|Taken over by .{3,60}\. Expert's draft|Same caller as #\d+|[A-Z][\w.' -]{1,40} (edited Expert's draft before sending|sent their own reply instead of Expert's draft)|Case update, [A-Z][a-z]{2} \d)/;
async function adoptLegacy(ticketId) {
  const W = await writers();
  if (!W.size) return 0;
  const cm = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${ticketId}/comments?limit=100`).catch(() => null);
  let n = 0;
  for (const c of (cm && cm.data) || []) {
    const text = String(c.content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'");
    if (W.has(String(c.commenterId)) && LEGACY_RE.test(text)) { await own('comments', ticketId, c.id); n++; }
  }
  return n;
}
// Remove the tool's own drafts (still unsent) and its own notes on a ticket, keeping the first documentation note.
async function cleanTicket(ticketId) {
  const out = { drafts: 0, notes: 0, failed: 0 };
  await adoptLegacy(ticketId).catch(() => 0);
  const th = await readThreads(ticketId).catch(() => null);
  const liveDrafts = new Set(((th && th.data) || []).filter((x) => /draft/i.test(String(x.status || ''))).map((x) => String(x.id)));
  const drafts = (await all(`SELECT DISTINCT draft_id FROM expert_desk_drafts WHERE ticket_id = ? AND draft_id IS NOT NULL`, [ticketId])).map((r) => String(r.draft_id)).filter((d) => liveDrafts.has(d));
  for (const d of drafts) { try { await desk('DELETE', `/tickets/${ticketId}/draftReply/${d}`); out.drafts++; } catch (e) { out.failed++; out.error = e.message; } }
  const keepInit = await get(`SELECT init_id FROM ticket_doc_notes WHERE ticket_id = ?`, [ticketId]).catch(() => null);
  const notes = new Set((await all(`SELECT obj_id FROM expert_owned WHERE kind = 'comments' AND ticket_id = ?`, [ticketId])).map((r) => String(r.obj_id))
    .concat((await all(`SELECT comment_id FROM expert_desk_drafts WHERE ticket_id = ? AND comment_id IS NOT NULL`, [ticketId])).map((r) => String(r.comment_id))));
  const upd = await get(`SELECT upd_id FROM ticket_doc_notes WHERE ticket_id = ?`, [ticketId]).catch(() => null); if (upd && upd.upd_id) notes.add(String(upd.upd_id));
  if (keepInit && keepInit.init_id) notes.delete(String(keepInit.init_id));
  const cm = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${ticketId}/comments?limit=100`).catch(() => null);
  const present = new Set(((cm && cm.data) || []).map((c) => String(c.id)));
  for (const n of notes) { if (!present.has(n)) continue; try { await desk('DELETE', `/tickets/${ticketId}/comments/${n}`); out.notes++; } catch (e) { out.failed++; out.error = e.message; } }
  if (out.notes) await run(`UPDATE ticket_doc_notes SET upd_id = NULL WHERE ticket_id = ?`, [ticketId]).catch(() => {});
  return out;
}
async function handovers(out) {
  const rows = await all(`SELECT id, ticket_id, number, owner, comment_id, draft_state FROM expert_desk_drafts WHERE status = 'done' AND draft_id IS NOT NULL AND (coalesce(draft_state, 'in desk') = 'in desk' OR (draft_state = 'handed over' AND coalesce(note_state, '') != 'cleaned')) AND done_at > datetime('now', '-3 days') ORDER BY id DESC LIMIT 40`);
  if (!rows.length) return;
  const t1 = D.t1Agents ? new Set((await D.t1Agents().catch(() => [])).map((a) => String(a.id))) : null;
  for (const r of rows) {
    const t = await readTicket(r.ticket_id).catch(() => null); if (!t) continue;
    const offTeam = t.teamId && String(t.teamId) !== T1_TEAM();
    const offOwner = t.assigneeId && t1 && t1.size && !t1.has(String(t.assigneeId));
    if (!offTeam && !offOwner) continue;
    const who = t.assignee ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(' ') : 'another owner';
    const team = (t.team && t.team.name) || (offTeam ? 'another team' : '');
    // Batch 329: remove the tool's own draft and notes (the first documentation note stays). When Desk refuses (the write
    // key has no delete permission), the note is rewritten for the new owner instead.
    const cl = await cleanTicket(r.ticket_id).catch((e) => ({ failed: 1, error: e.message }));
    if (!cl.failed) {
      await tags(r.ticket_id, 'expert-handed-over', 'expert-draft').catch(() => {});
      await run(`UPDATE expert_desk_drafts SET draft_state = 'handed over', note_state = 'cleaned' WHERE ticket_id = ?`, [r.ticket_id]); out.handedOver = (out.handedOver || 0) + 1; out.cleaned = (out.cleaned || 0) + 1;
      continue;
    }
    if (String(r.draft_state || '') === 'handed over') continue; // already told the new owner; waiting for the delete permission
    const text = `Taken over by ${who}${team ? ' (' + team + ')' : ''}. Expert's draft is still in the reply box if it helps: edit it or discard it. Nothing more is needed from ${r.owner || 'the T1 agent'} on this ticket, and Expert will not draft here again.`;
    if (r.comment_id) { const DOC = require('./ticket-doc-note'); await setNote(r.ticket_id, { id: r.comment_id }, DOC.enabled() ? (await DOC.withLead(r.ticket_id, text)).html : html(text), true).catch(() => null); }
    await tags(r.ticket_id, 'expert-handed-over').catch(() => {});
    await run(`UPDATE expert_desk_drafts SET draft_state = 'handed over' WHERE id = ?`, [r.id]); out.handedOver = (out.handedOver || 0) + 1;
  }
}
// Batch 335: a draft the agent sent as written is a confirmed answer for its Expert library page.
function fileBack(r, via) { if (!r || !r.subject || !r.reply) return; require('./expert-library').fileBack({ question: r.subject, answer: r.reply, via }).catch(() => {}); }
let _sweeping = false;
async function sweep() {
  if (_sweeping || !canWrite() || !_db) return { skipped: true };
  _sweeping = true; const out = { checked: 0, sent: 0, edited: 0, removed: 0, notesRemoved: 0, failed: 0 };
  try {
    const rows = await all(`SELECT id, ticket_id, number, subject, draft_id, comment_id, reply, done_at, draft_state FROM expert_desk_drafts WHERE status = 'done' AND draft_id IS NOT NULL AND coalesce(draft_state, 'in desk') IN ('in desk', 'gone', 'handed over') AND done_at > datetime('now', '-3 days') ORDER BY id DESC LIMIT 80`);
    for (const r of rows) {
      out.checked++;
      const th = await readThreads(r.ticket_id).catch(() => null); if (!th) continue;
      const list = th.data || [], mine = list.find((x) => String(x.id) === String(r.draft_id));
      const doneAt = Date.parse(String(r.done_at).replace(' ', 'T') + 'Z') || 0;
      if (!mine) {
        // Batch 317: when an agent opens Expert's draft with Edit and sends it, Desk sends a new reply and the draft ID
        // disappears. That reply is still the agent's answer to learn from: as sent, edited, or their own reply.
        const sentR = list.find((x) => x.direction === 'out' && !/draft/i.test(String(x.status || '')) && (Date.parse(x.createdTime || '') || 0) > doneAt);
        if (sentR) {
          const l = await learn(r, sentR, 'edited').catch(() => null);
          const sim = l ? l.sim : 1, state = !l || !l.kept || sim >= 0.9 ? 'sent' : sim >= 0.35 ? 'edited' : 'agent replied';
          if (l && l.kept && state === 'agent replied') await run(`UPDATE expert_draft_lessons SET kind = 'own reply' WHERE job_id = ?`, [r.id]).catch(() => {});
          if (state === 'edited') { out.edited++; await noteAfter(r, `${l.agent} edited Expert's draft before sending it (about ${Math.round(100 - 100 * sim)}% changed). Expert keeps the changes to write better drafts.`); }
          if (state === 'sent') { out.sent++; fileBack(r, 'draft sent'); }
          await run(`UPDATE expert_desk_drafts SET draft_state = ? WHERE id = ?`, [state, r.id]); continue;
        }
        if (r.draft_state !== 'gone') await run(`UPDATE expert_desk_drafts SET draft_state = 'gone' WHERE id = ?`, [r.id]);
        continue;
      }
      if (!/draft/i.test(String(mine.status || ''))) {
        // Sent. If the agent changed it, keep the difference to learn from and say so in Expert's note.
        const l = await learn(r, mine, 'edited').catch(() => null);
        const edited = l && l.kept;
        if (edited) { out.edited++; await noteAfter(r, `${l.agent} edited Expert's draft before sending it (about ${Math.round(100 - 100 * l.sim)}% changed). Expert keeps the changes to write better drafts.`); }
        out.sent++; if (!edited) fileBack(r, 'draft sent'); await run(`UPDATE expert_desk_drafts SET draft_state = ? WHERE id = ?`, [edited ? 'edited' : 'sent', r.id]); continue;
      }
      const other = list.find((x) => x.direction === 'out' && String(x.id) !== String(r.draft_id) && !/draft/i.test(String(x.status || '')) && (Date.parse(x.createdTime || '') || 0) > doneAt);
      if (!other) {
        // Batch 331: the agent closed the ticket without sending Expert's draft (often after a call or chat, with their own
        // private note). The draft is removed, and the agent's note is kept as a lesson next to the draft.
        const tk = await readTicket(r.ticket_id).catch(() => null);
        if (tk && /closed/i.test(String(tk.statusType || tk.status || ''))) {
          const cmts = await (D.deskRead || require('./desk-service').fetchRaw)(`/tickets/${r.ticket_id}/comments?limit=50`).catch(() => null);
          const mineIds = new Set((await all(`SELECT obj_id FROM expert_owned WHERE kind = 'comments' AND ticket_id = ?`, [r.ticket_id]).catch(() => [])).map((x) => String(x.obj_id)).concat(r.comment_id ? [String(r.comment_id)] : []));
          const W = await writers().catch(() => new Set());
          const agentNote = ((cmts && cmts.data) || []).filter((c) => !mineIds.has(String(c.id)) && !W.has(String(c.commenterId)) && (Date.parse(c.commentedTime || '') || 0) > doneAt - 3600000)
            .sort((a, b) => Date.parse(b.commentedTime || '') - Date.parse(a.commentedTime || ''))[0];
          const who = agentNote ? ((agentNote.commenter && agentNote.commenter.name) || 'the agent') : (tk.assignee ? [tk.assignee.firstName, tk.assignee.lastName].filter(Boolean).join(' ') : 'the agent');
          if (agentNote) {
            const sent = plain(agentNote.content).trim(), mine = String(r.reply || '').split(/\n(?:Best regards|Kind regards|Regards),?\s*$/i)[0].trim();
            if (sent && mine) await run(`INSERT OR IGNORE INTO expert_draft_lessons (job_id, ticket_id, number, agent, kind, similarity, expert_text, agent_text) VALUES (?,?,?,?,?,?,?,?)`,
              [r.id, r.ticket_id, r.number, cut(who, 80), 'closed with note', Math.round(similarity(mine, sent) * 100) / 100, cut(scrubText(mine), 4000), cut(scrubText(sent), 4000)]).catch(() => {});
          }
          try {
            await desk('DELETE', `/tickets/${r.ticket_id}/draftReply/${r.draft_id}`); out.removed++;
            await run(`UPDATE expert_desk_drafts SET draft_state = 'closed' WHERE id = ?`, [r.id]);
            await tags(r.ticket_id, null, 'expert-draft').catch(() => {});
            if (r.comment_id) { const DOC = require('./ticket-doc-note'); const lead = `${who} closed the ticket${agentNote ? ' with their own note' : ''}, so Expert's draft was removed.${agentNote ? ' Expert keeps the note to learn from.' : ''}`; await setNote(r.ticket_id, { id: r.comment_id }, DOC.enabled() ? (await DOC.withLead(r.ticket_id, lead, null, /Expert's draft in the reply box/i)).html : html(lead), true).catch(() => null); }
          } catch (e) { out.failed++; console.warn('expert closed draft:', e.message); }
          continue;
        }
        // Batch 331: a draft written when the client was not waiting (an agent had already replied; the trigger was a
        // mail-server notice) is not needed: it is removed and the note says why.
        const ws = await waitingState(list, [String(r.draft_id)], r.ticket_id).catch(() => ({ waiting: true }));
        if (ws.waiting) continue;
        try {
          await desk('DELETE', `/tickets/${r.ticket_id}/draftReply/${r.draft_id}`); out.removed++;
          await run(`UPDATE expert_desk_drafts SET draft_state = 'not needed' WHERE id = ?`, [r.id]);
          await tags(r.ticket_id, null, 'expert-draft').catch(() => {});
          if (r.comment_id) { const DOC = require('./ticket-doc-note'); const lead = `Expert's draft was removed: ${ws.by} had already replied and the client has not written since.`; await setNote(r.ticket_id, { id: r.comment_id }, DOC.enabled() ? (await DOC.withLead(r.ticket_id, lead, null, /Expert's draft in the reply box/i)).html : html(lead), true).catch(() => null); }
        } catch (e) { out.failed++; console.warn('expert stale draft:', e.message); }
        continue;
      }
      const l = await learn(r, other, 'own reply').catch(() => null);
      if (l && l.kept) await noteAfter(r, `${l.agent} sent their own reply instead of Expert's draft, so the draft was removed. Expert keeps the reply to write better drafts.`);
      try { await desk('DELETE', `/tickets/${r.ticket_id}/draftReply/${r.draft_id}`); out.removed++; await run(`UPDATE expert_desk_drafts SET draft_state = 'removed' WHERE id = ?`, [r.id]); }
      catch (e) { out.failed++; await run(`UPDATE expert_desk_drafts SET draft_state = 'agent replied' WHERE id = ?`, [r.id]); console.warn('expert draft remove:', e.message); }
    }
    if (!require('./ticket-doc-note').enabled()) await notesSweep(out).catch((e) => console.warn('expert notes sweep:', e.message)); // Batch 328: notes are documentation now, not removed
    await oldDrafts(out).catch((e) => console.warn('expert old drafts:', e.message));
    await handovers(out).catch((e) => console.warn('expert handovers:', e.message));
    await stuckNotes(out).catch((e) => console.warn('expert stuck notes:', e.message));
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
async function decide(evt, { assignWaitMs = Number(process.env.EXPERT_ASSIGN_WAIT_MS) || 120000, ownerIsT1 = false } = {}) {
  const pl = (evt && evt.payload) || {};
  // Batch 297: Ticket_Add (a new ticket) carries the ticket itself, Ticket_Thread_Add carries the thread.
  const isAdd = evt && evt.eventType === 'Ticket_Add';
  const tid = String(pl.ticketId || pl.ticket_id || (pl.ticket && pl.ticket.id) || (isAdd ? pl.id : '') || '').replace(/\D/g, '');
  if (!tid) return { skip: 'no ticket in the event' };
  if (pl.direction && pl.direction !== 'in') return { tid, skip: 'not an incoming message' };
  if (pl.channel && NO_DRAFT_CHANNEL.test(String(pl.channel))) return { tid, skip: 'phone ticket' };
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
  // Batch 315: a ticket a T1 agent claimed without a team (tag t1-claimed-no-team) is still T1 when its owner is a pilot
  // agent, or when the waiting-tickets search found it under a T1 agent.
  // Batch 316: also when the owner is any T1 agent (chat tickets often never get a team).
  let t1Owner = false;
  if (!t.teamId && t.assigneeId && !ownerIsT1 && D.t1Agents) t1Owner = (await D.t1Agents().catch(() => [])).some((a) => String(a.id) === String(t.assigneeId));
  const noTeamT1 = !t.teamId && t.assigneeId && (ownerIsT1 || t1Owner || (PILOT().length && PILOT().includes(String(t.assigneeId))));
  if (String(t.teamId || '') !== T1_TEAM() && !noTeamT1) return { tid, num, skip: t.teamId ? 'not a T1 ticket' : 'no team after the wait' };
  // Batch 311: "Pending Adit" and other open statuses still wait on us; only On Hold (Pending Customer, Working...) and Closed are skipped.
  if (String(t.statusType || (t.status === 'Open' ? 'Open' : '')) !== 'Open') return { tid, num, skip: 'status is ' + t.status };
  if (NO_DRAFT_CHANNEL.test(String(t.channel || ''))) return { tid, num, skip: 'phone ticket (channel ' + t.channel + ')' };
  const sender = from || addrOf(t.email);
  if (!sender || !sender.includes('@')) return { tid, num, skip: 'no client email' };
  if (SKIP_SENDERS.concat(S.extraSkip || []).some((x) => sender.includes(x))) {
    // Batch 322: an Adit colleague forwarding a client's email is drafted for the client.
    const f = INTERNAL_RE.test(sender) ? await forwardOf(tid, t).catch(() => null) : null;
    if (!f) return { tid, num, skip: 'automated or internal sender' };
  }
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
  const ws = await waitingState((th && th.data) || [], replace, tid); // Batch 331
  if (!ws.waiting) return { tid, num, skip: 'an agent already replied (' + ws.by + ') and the client has not written since' };
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
// Batch 308: tickets that were already waiting before the webhook (or that it missed): open T1 email tickets of the
// pilot agents (or all T1 agents) where the client wrote last. Each goes through the same checks as a webhook call.
const _autoSkip = new Map(); // ticket id + client message time -> checked at (Batch 319)
async function backlog({ ownerIds = [], days = 14, max = 15, dry = true, source = 'backlog', quiet = false } = {}) {
  if (!dry && !canWrite()) throw err(503, 'Saving drafts needs ZOHO_DESK_WRITE_REFRESH_TOKEN');
  const read = D.deskRead || require('./desk-service').fetchRaw;
  const since = Date.now() - Math.min(60, Number(days) || 14) * 864e5, found = new Map();
  for (const oid of ownerIds.slice(0, 40)) {
    const r = await read(`/tickets/search?assigneeId=${encodeURIComponent(oid)}&limit=100&sortBy=-customerResponseTime`).catch(() => null);
    for (const t of (r && r.data) || []) {
      if ((t.teamId && String(t.teamId) !== T1_TEAM()) || String(t.statusType || '') !== 'Open' || NO_DRAFT_CHANNEL.test(String(t.channel || '')) || (t.lastThread ? t.lastThread.direction !== 'in' : String(t.channel || '').toLowerCase() === 'email')) continue;
      if ((Date.parse(t.customerResponseTime || t.createdTime || '') || 0) < since) continue;
      found.set(String(t.id), { id: String(t.id), number: String(t.ticketNumber), subject: cut(t.subject, 120), owner: [t.assignee && t.assignee.firstName, t.assignee && t.assignee.lastName].filter(Boolean).join(' '), at: t.customerResponseTime });
    }
  }
  const list = [...found.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // Batch 319: a ticket counts as handled when Expert already ran on it after the client's latest message (any result).
  const ids = list.map((x) => x.id);
  const last = new Map(ids.length ? (await all(`SELECT ticket_id, max(created_at) AS at FROM expert_desk_drafts WHERE ticket_id IN (${ids.map(() => '?').join(',')}) GROUP BY ticket_id`, ids)).map((r) => [String(r.ticket_id), Date.parse(String(r.at).replace(' ', 'T') + 'Z') || 0]) : []);
  const todo = list.filter((x) => !(last.get(x.id) >= (Date.parse(x.at || '') || 0) - 60000) && !(quiet && Date.now() - (_autoSkip.get(x.id + '|' + x.at) || 0) < 2 * 3600000));
  if (dry) return { waiting: todo.length, tickets: todo.slice(0, 50) };
  const out = { started: [], skipped: [] };
  // Batch 334 (#429346): only tickets actually drafted count toward the limit, so tickets skipped by design (automated
  // senders and the like) never use up the slots and hold back a waiting client.
  const cap = Math.min(30, Number(max) || 15);
  for (const x of todo.slice(0, cap * 5)) {
    if (out.started.length >= cap) break;
    const d = await decide({ eventType: 'Ticket_Add', payload: { id: x.id } }, { assignWaitMs: 0, ownerIsT1: true }).catch((e) => ({ skip: e.message }));
    if (d.skip) { out.skipped.push({ number: x.number, why: d.skip }); if (quiet) _autoSkip.set(x.id + '|' + x.at, Date.now()); else note({ ticket: x.number, skip: d.skip + ' (waiting tickets)' }); continue; }
    const r = await start({ ticketId: x.id, mode: 'save', source, replace: d.replace || [] }).catch((e) => ({ error: e.message }));
    if (r.error) out.skipped.push({ number: x.number, why: r.error }); else { out.started.push({ number: x.number, jobId: r.jobId }); note({ ticket: x.number, started: r.jobId }); }
  }
  return out;
}
// Batch 319: every 10 minutes in work hours, open T1 tickets (all channels but phone) of the drafting agents where the
// client is waiting and Expert has not run since their last message are drafted, a few at a time. This covers new
// tickets assigned or reassigned to an agent, web and chat tickets, and anything the webhook missed.
async function autoWaiting({ ownerIds = [], max = 4 } = {}) {
  if (S.paused || !canWrite() || !ownerIds.length) return { skipped: true };
  if (_active + _queue.length >= LIMIT) return { busy: true };
  if (_autoSkip.size > 2000) _autoSkip.clear();
  return backlog({ ownerIds, days: 3, max, dry: false, source: 'auto', quiet: true });
}
async function hookLog({ limit = 100, result = '' } = {}) {
  const where = result === 'started' ? 'WHERE started IS NOT NULL' : result === 'skipped' ? 'WHERE started IS NULL' : '';
  const rows = await all(`SELECT * FROM expert_desk_hooks ${where} ORDER BY id DESC LIMIT ?`, [Math.min(500, Number(limit) || 100)]);
  const sum = await all(`SELECT CASE WHEN started IS NOT NULL THEN 'Draft started' ELSE coalesce(skip, event, 'other') END AS reason, count(*) AS n
    FROM expert_desk_hooks WHERE at > datetime('now', '-1 day') GROUP BY 1 ORDER BY n DESC`);
  // Batch 320: calls per hour (Central time) over the last 24 hours: drafts started, T1 skips, other teams.
  const hr = await all(`SELECT strftime('%Y-%m-%d %H', at) AS h, started, skip FROM expert_desk_hooks WHERE at > datetime('now', '-1 day')`);
  const hours = new Map();
  for (let i = 23; i >= 0; i--) { const d = new Date(Date.now() - i * 3600000); hours.set(d.toISOString().slice(0, 13).replace('T', ' '), { at: d.toISOString(), started: 0, t1: 0, other: 0 }); }
  for (const r of hr) { const b = hours.get(r.h); if (!b) continue; if (r.started) b.started++; else { const k = reasonOf(r.skip).kind; if (k === 'other') b.other++; else if (k !== 'dup') b.t1++; } }
  return { rows, summary: sum, hours: [...hours.values()] };
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
  const rows = await all(`SELECT id, ticket_id, number, subject, owner, account, deal, source, mode, status, error, reply, note, draft_id, draft_state, note_state, ms, created_at, done_at FROM expert_desk_drafts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, p.concat([lim, off]));
  const tot = await get(`SELECT count(*) AS n FROM expert_desk_drafts ${where}`, p);
  const owners = (await all(`SELECT owner, count(*) AS n FROM expert_desk_drafts WHERE owner IS NOT NULL AND owner != '' GROUP BY owner ORDER BY owner`)).map((r) => ({ name: r.owner, n: r.n }));
  // Batch 320: totals for the filtered drafts, for the chart strip above the list.
  const sum = await all(`SELECT status, coalesce(draft_state, '') AS ds, coalesce(source, 'automation') AS src, count(*) AS n FROM expert_desk_drafts ${where} GROUP BY 1, 2, 3`, p);
  const summary = { status: {}, outcome: {}, source: {} };
  for (const r of sum) {
    summary.status[r.status] = (summary.status[r.status] || 0) + r.n; summary.source[r.src] = (summary.source[r.src] || 0) + r.n;
    const o = r.status === 'done' ? (OUTCOME[r.ds] || 'Waiting in Desk') : r.status === 'skipped' ? 'Agent replied while Expert wrote' : r.status === 'failed' ? 'Failed' : 'Writing now';
    summary.outcome[o] = (summary.outcome[o] || 0) + r.n;
  }
  return { rows, total: (tot && tot.n) || 0, owners, summary };
}
// Batch 316: jobs left queued or writing by a server restart (the queue lives in memory). Recent ones run again, older
// ones are closed as failed so the pages never show them as stuck.
async function recover({ maxAgeMin = 180 } = {}) {
  if (!_db) return { requeued: 0, closed: 0 };
  const rows = await all(`SELECT id, ticket_id, number, created_at, comment_id, fwd_to, fwd_by FROM expert_desk_drafts WHERE mode = 'save' AND status IN ('queued','working') ORDER BY id`);
  const out = { requeued: 0, closed: 0 }, cutoff = Date.now() - maxAgeMin * 60000;
  for (const r of rows) {
    if (_queue.some((q) => q.jobId === r.id)) continue;
    const at = Date.parse(String(r.created_at).replace(' ', 'T') + 'Z') || 0;
    if (at < cutoff || !canWrite()) {
      await run(`UPDATE expert_desk_drafts SET status = 'failed', error = 'Stopped by a server restart. Draft it again if it is still needed.', done_at = datetime('now') WHERE id = ?`, [r.id]); out.closed++;
      if (canWrite() && r.comment_id) { await setNote(r.ticket_id, { id: r.comment_id }, STOPPED); await tags(r.ticket_id, null, 'expert-drafting'); }
      continue;
    }
    const t = await readTicket(r.ticket_id).catch(() => null);
    await run(`UPDATE expert_desk_drafts SET status = 'queued' WHERE id = ?`, [r.id]);
    let fwd = null; if (r.fwd_to) { try { fwd = Object.assign({ email: r.fwd_to }, JSON.parse(r.fwd_by || '{}')); } catch (e) { fwd = { email: r.fwd_to }; } }
    _queue.push({ jobId: r.id, id: String(r.ticket_id), num: String(r.number), t, replace: [], cm0: r.comment_id ? { id: r.comment_id } : null, fwd }); out.requeued++;
  }
  pump(); return out;
}
// Batch 316: one clear report for the Desk drafts page. What came in from Desk, what was drafted, why the rest was not,
// and what agents did with each draft, for today (Central time) or the last 7 days.
const REASONS = [
  [/not a T1 ticket|no team after/i, 'other', 'Not a T1 ticket'],
  [/duplicate|already being checked|second event/i, 'dup', 'Same message twice'],
  [/pilot|no owner/i, 't1', 'Owner not in the pilot'],
  [/phone/i, 't1', 'Phone ticket'],
  [/not an email|channel is/i, 't1', 'Chat or web (before Nov 13, when they were added)'],
  [/automated|internal|automatic/i, 't1', 'Internal or automated email'],
  [/agent already replied|agent has a draft|draft already exists/i, 't1', 'Agent replied or drafted first'],
  [/status is/i, 't1', 'Not open (on hold or closed)'],
  [/paused/i, 't1', 'Drafts were paused'],
  [/no client email/i, 't1', 'No client email address'],
];
const reasonOf = (s) => { for (const [re, kind, label] of REASONS) if (re.test(s || '')) return { kind, label }; return { kind: 't1', label: 'Other: ' + cut(s || 'unknown', 60) }; };
function sinceCT(days) {
  const now = new Date(), ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now);
  const off = (Date.parse(now.toLocaleString('en-US', { timeZone: 'UTC' })) - Date.parse(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))) / 60000;
  const mid = new Date(Date.parse(ymd + 'T00:00:00Z') + off * 60000 - (Math.max(1, days) - 1) * 864e5);
  return mid.toISOString().slice(0, 19).replace('T', ' ');
}
const OUTCOME = { 'handed over': 'Taken over by another team', 'in desk': 'Waiting in Desk', sent: 'Sent as written', edited: 'Edited and sent', removed: 'Agent wrote their own reply', 'agent replied': 'Agent wrote their own reply', 'not saved': 'Agent wrote their own reply', gone: 'Deleted in Desk', replaced: 'Replaced by a newer draft', 'not needed': 'Not needed: agent had replied', closed: 'Ticket closed by the agent' };
// Reasons the team chose not to draft (phone, the pilot, internal mail, closed, paused). The rest could have had a draft.
const BY_DESIGN = /^(Phone ticket|Owner not in the pilot|Internal or automated email|Not open|Drafts were paused)/;
const USED = new Set(['Sent as written', 'Edited and sent']);
async function aggregate(since, until) {
  const hooks = await all(`SELECT ticket, started, skip FROM expert_desk_hooks WHERE at >= ? AND at < ? AND ticket IS NOT NULL AND ticket != '' ORDER BY id`, [since, until]);
  const jobsR = await all(`SELECT id, number, status, draft_state, owner, error, source, ms FROM expert_desk_drafts WHERE created_at >= ? AND created_at < ? ORDER BY id`, [since, until]);
  const per = new Map();
  for (const h of hooks) { const p = per.get(h.ticket) || { started: false, reason: null }; if (h.started) p.started = true; else { const r = reasonOf(h.skip); if (r.kind !== 'dup') p.reason = r; } per.set(h.ticket, p); }
  const latest = new Map(); for (const j of jobsR) latest.set(String(j.number), j); // the newest job per ticket
  const skipped = {}; let other = 0, t1 = 0;
  for (const [num, p] of per) {
    if (p.started || latest.has(String(num))) continue;
    if (!p.reason) continue;
    if (p.reason.kind === 'other') { other++; continue; }
    t1++; skipped[p.reason.label] = (skipped[p.reason.label] || 0) + 1;
  }
  t1 += latest.size; // tickets drafted without a webhook call (auto, by hand) count too
  const status = { done: 0, working: 0, failed: 0, skipped: 0 }, outcome = {}, byAgent = {}; let ms = 0, msN = 0;
  for (const j of latest.values()) {
    const st = j.status === 'queued' ? 'working' : j.status; status[st] = (status[st] || 0) + 1;
    if (j.status === 'done' && j.ms) { ms += Number(j.ms); msN++; }
    const o = j.status === 'done' ? (OUTCOME[j.draft_state] || 'Waiting in Desk') : j.status === 'skipped' ? 'Agent replied while Expert wrote' : j.status === 'failed' ? 'Failed' : 'Writing now';
    outcome[o] = (outcome[o] || 0) + 1;
    const a = byAgent[j.owner || 'Unassigned'] || (byAgent[j.owner || 'Unassigned'] = { agent: j.owner || 'Unassigned', drafts: 0, sent: 0, edited: 0, own: 0, waiting: 0, failed: 0 });
    a.drafts++; if (o === 'Sent as written') a.sent++; else if (o === 'Edited and sent') a.edited++; else if (/own reply|while Expert|Deleted/.test(o)) a.own++; else if (o === 'Waiting in Desk' || o === 'Writing now') a.waiting++; else if (o === 'Failed') a.failed++;
  }
  const byDesign = Object.entries(skipped).filter(([k]) => BY_DESIGN.test(k)).reduce((x, [, n]) => x + n, 0);
  const used = Object.entries(outcome).filter(([k]) => USED.has(k)).reduce((x, [, n]) => x + n, 0);
  const decided = Object.entries(outcome).filter(([k]) => !/Waiting|Writing|Failed/.test(k)).reduce((x, [, n]) => x + n, 0);
  return { t1, other, drafted: latest.size, draftable: Math.max(latest.size, t1 - byDesign), byDesign, used, decided, status, skipped, outcome, byAgent, avgSec: msN ? Math.round(ms / msN / 1000) : null, latest };
}
const ymdCT = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
async function report({ days = 1 } = {}) {
  days = Number(days) || 1;
  const since = sinceCT(days), until = '9999-12-31 00:00:00';
  const A = await aggregate(since, until);
  // Batch 320: a day by day series (14 days) for the trend chart, whatever the period picked.
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const from = sinceCT(i + 1), to = i ? sinceCT(i) : until;
    const d = await aggregate(from, to);
    series.push({ day: ymdCT(new Date(Date.parse(from.replace(' ', 'T') + 'Z') + 12 * 3600000)), t1: d.t1, drafted: d.drafted, byDesign: d.byDesign, missed: Math.max(0, d.t1 - d.drafted - d.byDesign), used: d.used, decided: d.decided });
  }
  const lessonsDaily = await all(`SELECT date(created_at, '-6 hours') AS day, count(*) AS n, avg(similarity) AS sim FROM expert_draft_lessons WHERE created_at > datetime('now', '-14 days') GROUP BY 1 ORDER BY 1`).catch(() => []);
  const failed = [...A.latest.values()].filter((j) => j.status === 'failed').map((j) => ({ number: j.number, error: cut(j.error || '', 160) }));
  return { learning: Object.assign(await learning(), { daily: lessonsDaily.map((r) => ({ day: r.day, n: r.n, changed: Math.round(100 - 100 * (Number(r.sim) || 0)) })) }),
    since, days, t1Tickets: A.t1, otherTeams: A.other, drafted: A.drafted, draftable: A.draftable, byDesign: A.byDesign, used: A.used, decided: A.decided, avgSec: A.avgSec, status: A.status,
    skipped: Object.entries(A.skipped).map(([reason, n]) => ({ reason, n, byDesign: BY_DESIGN.test(reason), fixed: /^Chat or web \(before/.test(reason) })).sort((a, b) => b.n - a.n),
    outcome: Object.entries(A.outcome).map(([what, n]) => ({ what, n })).sort((a, b) => b.n - a.n), agents: Object.values(A.byAgent).sort((a, b) => b.drafts - a.drafts), failed, series };
}
// Batch 317: what Expert has kept from agents, for the Desk drafts page.
async function learning() {
  const n = await get(`SELECT count(*) AS n, sum(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week,
    sum(CASE WHEN kind = 'own reply' THEN 1 ELSE 0 END) AS own FROM expert_draft_lessons`).catch(() => null);
  const last = await all(`SELECT number, agent, kind, similarity, created_at FROM expert_draft_lessons ORDER BY id DESC LIMIT 8`).catch(() => []);
  let learn = null; try { learn = D.expert && D.expert.learnStatus ? await D.expert.learnStatus() : null; } catch (e) { /* none yet */ }
  return { lessons: (n && n.n) || 0, week: (n && n.week) || 0, own: (n && n.own) || 0, last, learn };
}
async function lessonsSince(iso) { const r = await get(`SELECT count(*) AS n FROM expert_draft_lessons WHERE created_at > ?`, [String(iso || '1970-01-01').slice(0, 19).replace('T', ' ')]).catch(() => null); return (r && r.n) || 0; }
async function stats() {
  const r = await all(`SELECT status, count(*) AS n, avg(ms) AS ms FROM expert_desk_drafts WHERE created_at > datetime('now', '-7 days') GROUP BY status`);
  const t = await get(`SELECT count(*) AS n FROM expert_desk_drafts WHERE created_at > datetime('now', '-1 day')`);
  const o = { week: {}, today: (t && t.n) || 0 }; r.forEach((x) => { o.week[x.status] = { n: x.n, avgSec: x.ms ? Math.round(x.ms / 1000) : null }; }); return o;
}
const _writer = { note: (id, cm, html) => setNote(id, cm, html, true) };
module.exports = { writers, waitingState, isNotice, _desk: (m, p, b) => desk(m, p, b), cleanTicket, adoptLegacy, owned, _writer, siblingsOf, bounceOf, parseForward, forwardOf, toneIssues, fixTone, autoWaiting, learning, lessonsSince, stuckNotes, recover, report, reasonOf, noteHtml, similarity, ownPart, learn, backlog, sweep, agentActed, list, about, backfill, humanize, STYLE_SYS, saveSettings, settings, hookLog, jobs, stats, SKIP_SENDERS, SKIP_SUBJECTS, T1_TEAM, handleWebhook, hooks, decide, result, setDeps, setDB, initSchema, enabled, keyOk, canWrite, start, status, recent, pick, html, _work: work, _queue };
