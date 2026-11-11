'use strict';
/**
 * Batch 182: Adit Expert. One assistant for any Adit product or process question, on any client scenario.
 *
 * What it knows, highest authority first:
 *   1. Team rules and corrections   expert_notes, written by reviewers (and from feedback they approve)
 *   2. Product and process updates  lib/product-updates (newest changes win over older material)
 *   3. Adit Help Center             read live from help.adit.com every 30 minutes (lib/kb-live); the export in
 *                                   content/kb/product-kb.json is only the fallback and the source of module names
 *   4. Support guides               VoIP guide and AI runbook (lib/guides)
 *   5. Solved tickets and chats     AditKB case_index (full text search over condensed cases and their resolutions)
 *   6. Support calls                findings condensed from T1's RingCentral calls (AditKB unit_summaries, synced here)
 *
 * How it answers ("double brain"):
 *   Brain 1  plans: rewrites the client's words into search terms, picks the module and the intent.
 *   Search   local BM25 over the KB, guides, notes and calls, plus AditKB full text search for solved cases.
 *   Brain 2  writes the answer from the numbered sources only: short answer, steps, what to tell the client,
 *            what to check, who owns it, the Help Center link to share.
 *   Brain 3  checks the draft against the same sources with the other AI provider when there is one, removes
 *            anything the sources do not support and sets the confidence.
 * Every question is logged (for the gaps report), and thumbs up or down with a correction feeds the notes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s*[\u2014\u2013]\s*/g, ', ').slice(0, n);
const one = (s, n = 400) => clean(s, n * 2).replace(/\s+/g, ' ').trim().slice(0, n);
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const NAME = 'Adit Expert';
// Built from the user's stated process facts; reviewers can edit or switch them off in Teach.
const SEED_RULES = [
  ['T1 cannot make outbound calls', 'T1 CS does not make outbound calls. When a client needs a call back on a VoIP (phone) matter, the ticket goes to VoIP; every other call back goes to the account CSM. Exception: when a T1 agent missed something on their own end or in their own investigation (for example a wrong answer, a missed check, an earlier ticket they did not read), T1 may call the client back to put that right. Never promise a T1 call back for anything else.', 'Process'],
  ['How T1 hands a ticket to another team', 'T1 never moves a ticket to another team itself. Set the status to Pending Review - T1 and a reviewer moves it to the right team.', 'Process'],
  ['What T1 supports for AI and VoIP', 'T1 handles basic AI support (since 8 Sep 2026) and basic VoIP support (since 12 Oct 2026). The AI support runbook and the VoIP guide say what T1 can finish and when to hand over.', 'Process'],
  ['Anything in the Help Center is done by T1', 'Any support that a Help Center (KB) article covers is performed by T1 CS. T1 completes it with the client and does not transfer it.', 'Process'],
  ['Escalations, cancellations and port-outs go to the CSM', 'Escalations, cancellation requests and number port-out requests go to the CSM of that account or to the escalation manager. T1 does not handle them itself.', 'Process'],
  // Batch 239: lessons from Sebastin's review of ticket #422530 (Perry Family Dentistry)
  ['Reply to the practice, not the person who forwarded it', 'Our client is the practice on the account (the doctor or the office contact). When an Adit colleague (an @adit.com sender, for example Josh Gosnell) forwards a ticket, or a referral partner (for example Fortune Management) escalates on a practice\'s behalf, the reply goes to the practice and speaks to their own experience (for example "Hi Dr. Perry,"). Keep the forwarder posted internally with a private note or a message. Before sending, always check who the reply is actually going to (the To field). Never ask the practice to repeat what the forwarded message already says.', 'Process'],
  ['Act first, then reply with what was arranged', 'Do not send a reply that only acknowledges the issue or says we will bring it to the relevant team; it shows the client nothing has happened. First contact the team or person who can fix it and get the outcome, then reply with what was actually arranged: who now handles it (name and role), what they will do, and what happens next. Example: "Hi Dr. Perry, We came to know about the inconvenience you have had during your onboarding, and I am sorry about that. I have checked with our onboarding team, and Tyler Roden, our Lead Onboarding Specialist, will handle your account from here. He will reach out to you shortly to pick up where we left off. If anything else comes up, just reply here and I will take care of it."', 'Process'],
  ['Onboarding complaints and a change of onboarding specialist', 'While a deal is in onboarding, a complaint about the onboarding or the onboarding specialist goes to the Tech OB team, not the CSM or the escalation manager. Check with Tanya Garrison (Tech OB Manager) to move the account to a suitable onboarding specialist (for example a native English-speaking specialist when that is the concern). Once it is arranged, reply to the doctor naming the new specialist and that they will reach out shortly, and keep the referrer or the Adit colleague who forwarded the complaint posted internally. Example: ticket #422530, Perry Family Dentistry, moved from Manny to Tyler Roden.', 'Process'],
  // Batch 276: lessons from #427211 (yearly medical update wording on New Patient Forms)
  ['Read the account history before asking the client for more', 'Before replying on a ticket, read the account\'s earlier tickets on the same topic; a change made months ago (a template, default text, a setting) is often the cause. Do not ask the client for an example or a screenshot when they have already explained the problem or said they cannot send one. A handover note states the actual problem in the client\'s words, not just the topic. When auto-assign moves a ticket, the new owner replies the same day.', 'Process'],
  ['Form request text is shared default text', 'The Form Request Template (Patient Forms > Preferences > Forms > Default Text Settings) is the default text sent with form requests. Changing it for one purpose (for example a yearly medical history reminder) changes the message for other form requests too, such as New Patient Forms. Check whether a reminder can have its own text before changing the shared template, and tell the client about the trade-off.', 'Patient Forms'],
  // Batch 274: from Sebastin's answer on the Crested Butte Adit Pay question
  ['What Adit Pay posts to the EHR', 'Adit Pay posts every payment to the patient ledger in the EHR (for example Open Dental) automatically, usually within a few minutes, so staff do not enter payments by hand. It posts as a general payment and does not yet assign it to specific procedures; staff allocate it to procedures in the EHR as today. Procedure-level allocation (Procedure-Based Allocation Sync) is an active, high-demand roadmap request and not live yet. Never give a date; add the practice to the request.', 'Adit Pay'],
  ['Automatic charging in Adit Pay', 'Payment plans and subscriptions charge automatically once a card or bank account is saved. A card is not saved automatically when a patient pays through Text to Pay. When a client asks to pay automatically on each procedure, first ask whether they mean charging without staff action, or the payment being allocated to procedures in the EHR, unless an earlier call already settles it.', 'Adit Pay'],
  // Batch 272: lessons from the Serene Dental - Fremont call flow case (#428123)
  ['Phone setup changes on accounts still in onboarding', 'While the deal is in onboarding, T1 does not change the phone setup itself (call flow, greetings, routing, hours). Write the exact change asked for and who asked in the ticket, set Pending Review - T1 noting it is for the T1 - VoIP OB team, and loop in the deal\'s tech onboarding owner by name. Tell the client clearly who will follow up. Restoring something that was broken in Adit\'s own setup (for example a day missing from the call flow during an outage) is a fix, not a client change.', 'Adit Voice'],
  ['Who can approve a change to the account', 'A change asked for by someone who is not the owner, a manager or an authorized contact on file (for example a relative or a new staff member) needs the go-ahead of the owner or decision maker on file: on a call with the team making the change, or by email from their registered address. That another rep made a change before never replaces this approval. Check the account contacts and roles before saying yes.', 'Process'],
];

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, module TEXT,
    kind TEXT NOT NULL DEFAULT 'note', status TEXT NOT NULL DEFAULT 'active', source TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS expert_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, question TEXT, module TEXT, intent TEXT, mode TEXT,
    confidence TEXT, found INTEGER, verified INTEGER, sources_json TEXT, answer_json TEXT, ms INTEGER, vote INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
  try { await run(`ALTER TABLE expert_log ADD COLUMN gap TEXT`); } catch (e) { /* already there */ }
  await run(`CREATE TABLE IF NOT EXISTS expert_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, log_id INTEGER, email TEXT, vote INTEGER, comment TEXT, correction TEXT,
    status TEXT NOT NULL DEFAULT 'open', handled_by TEXT, handled_at TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS expert_calls (unit_key TEXT PRIMARY KEY, at TEXT, product TEXT, text TEXT NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS expert_state (k TEXT PRIMARY KEY, v TEXT)`);
  // Each built-in rule is added once; a rule an admin deleted is not brought back.
  let seeded = []; try { seeded = JSON.parse(await getState('seeded_rules', '[]')); } catch (e) { seeded = []; }
  const have = new Set((await all(`SELECT title FROM expert_notes`)).map(r => r.title));
  for (const [t, b, m] of SEED_RULES) {
    if (seeded.includes(t)) continue;
    if (!have.has(t)) await run(`INSERT INTO expert_notes (title, body, module, kind, source, created_by) VALUES (?,?,?,?,?,?)`, [t, b, m, 'rule', 'seed', 'system']);
    seeded.push(t);
  }
  await setState('seeded_rules', JSON.stringify(seeded));
  // Batch 272 and 277: the call back rule was corrected (VoIP call backs go to VoIP, the rest to the CSM; T1 may call back to fix
  // what T1 itself missed). Updated only while it still holds an earlier built-in wording, so an admin's edit is kept.
  await run(`UPDATE expert_notes SET body = ?, updated_at = datetime('now') WHERE title = 'T1 cannot make outbound calls' AND source = 'seed' AND body IN (?, ?)`, ['T1 CS does not make outbound calls. When a client needs a call back on a VoIP (phone) matter, the ticket goes to VoIP; every other call back goes to the account CSM. Exception: when a T1 agent missed something on their own end or in their own investigation (for example a wrong answer, a missed check, an earlier ticket they did not read), T1 may call the client back to put that right. Never promise a T1 call back for anything else.', 'T1 CS cannot make outbound calls. When a client needs a call back, sending the ticket to VoIP is the correct transfer.', 'T1 CS cannot make outbound calls. When a client needs a call back on a VoIP (phone) matter, the ticket goes to VoIP; every other call back goes to the account CSM. Never promise the client that T1 will call back.']).catch(() => {});
  await kbLive.initSchema(_db);
  try { const rows = await kbLive.load(); if (rows.length) { _liveArticles = rows; _kb = null; } } catch (e) { console.warn('expert: live KB not loaded', e.message); }
}
// Batch 185: refresh the Help Center from help.adit.com. Edited and new articles are read again; the next question uses them.
async function syncKb({ force = false } = {}) {
  const st = await kbLive.sync(fileKb(), { force });
  if (st.ok && (st.fetched || st.removed || !_liveArticles)) {
    const rows = await kbLive.load();
    if (rows.length) { _liveArticles = rows; _kb = null; bust(); _cache.clear(); }
  }
  return st;
}
async function getState(k, d) { const r = await get(`SELECT v FROM expert_state WHERE k = ?`, [k]).catch(() => null); return r ? r.v : d; }
async function setState(k, v) { await run(`INSERT INTO expert_state (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, String(v)]); }

// ── Help Center knowledge base ──────────────────────────────────────────
const KB_FILE = path.join(__dirname, '..', 'content', 'kb', 'product-kb.json');
const kbLive = require('./kb-live');
let _kb = null, _file = null, _liveArticles = null;
function fileKb() {
  if (_file) return _file;
  try { _file = JSON.parse(fs.readFileSync(KB_FILE, 'utf8')); } catch (e) { console.warn('expert: KB export not loaded', e.message); _file = { modules: [], articles: [] }; }
  return _file;
}
function kb() {
  if (_kb) return _kb;
  const raw = _liveArticles && _liveArticles.length ? { modules: [], articles: _liveArticles, live: true } : fileKb();
  const byId = new Map(raw.articles.map(a => [a.id, a]));
  const modules = Array.from(new Set(raw.articles.map(a => a.module).filter(m => m && m !== 'About')));
  _kb = { raw, byId, modules };
  return _kb;
}
function blockText(b) { if (b.t === 'table') return b.rows.map(r => r.join(' | ')).join('\n'); if (b.t === 'li') return '- ' + b.x; return b.x; }
function kbChunks() {
  const out = [];
  for (const a of kb().raw.articles) {
    if (a.module === 'About') continue;
    let sec = '', buf = [];
    const flush = () => {
      const text = buf.join('\n').trim(); buf = [];
      if (text.length < 40) return;
      for (let i = 0; i < text.length; i += 1800) out.push({ src: 'kb', id: a.id, title: a.title, section: sec, module: a.module, url: a.url || '', kind: a.kind || 'Overview', text: text.slice(Math.max(0, i - 150), i + 1800) });
    };
    for (const b of a.blocks) { if (/^h[3-5]$/.test(b.t)) { flush(); sec = b.x; } else buf.push(blockText(b)); }
    flush();
  }
  return out;
}
function article(id) {
  const a = kb().byId.get(String(id)); if (!a) return null;
  return { id: a.id, title: a.title, module: a.module, kind: a.kind || 'Overview', updated: a.updated || '', url: a.url || '', blocks: a.blocks };
}
function catalog() {
  const by = {};
  for (const a of kb().raw.articles) { if (a.module === 'About' || !a.module) continue; (by[a.module] = by[a.module] || []).push({ id: a.id, title: a.title, kind: a.kind || 'Overview', updated: a.updated || '' }); }
  return Object.keys(by).map(m => ({ module: m, articles: by[m] }));
}

// ── Search ──────────────────────────────────────────────────────────────
const STOP = new Set('a an the and or but if of to in on at for with by from is are was were be been it its this that these those how what why when where who which do does did can could should would will i we you they he she my our your their me us them there here not no yes get got also just so as than then into out up about over any some all more most other such only own same too very s t can will just don should now client clients patient patients office adit please help need needs want wants trying tried'.split(' '));
const SYN = [
  ['sms', 'text', 'texts', 'texting', 'message', 'messages'], ['reminder', 'reminders', 'autoreminder'], ['ehr', 'pms', 'emr', 'practice management', 'integration', 'sync'],
  ['phone', 'phones', 'voip', 'voice', 'handset', 'extension', 'desk phone'], ['fax', 'efax'], ['voicemail', 'vm'], ['terminal', 'card reader', 'bbpos', 'reader'],
  ['payment', 'pay', 'charge', 'adit pay', 'transaction'], ['refund', 'refunds', 'void'], ['review', 'reviews', 'pozative', 'reputation'], ['form', 'forms', 'intake'],
  ['schedule', 'scheduler', 'booking', 'appointment', 'online scheduling'], ['ai', 'front desk', 'agent', 'receptionist'], ['call intelligence', 'call tracking', 'ci'],
  ['campaign', 'campaigns', 'mass text', 'blast', 'email'], ['login', 'password', 'sign in', 'locked', 'reset'], ['chrome', 'extension', 'browser extension'],
  ['treatment plan', 'treatment plans'], ['carecredit', 'financing'], ['insurance', 'verification', 'rcm', 'eligibility'], ['task', 'tasks', 'automation', 'automations'],
  ['chat', 'webchat', 'internal chat'], ['user', 'users', 'permission', 'permissions', 'role'], ['billing', 'invoice', 'overage', 'charges'], ['disconnected', 'offline', 'server app'],
];
const SYNMAP = new Map(); SYN.forEach(g => g.forEach(w => SYNMAP.set(w, g)));
const words = (s) => lc(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
const stem = (w) => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w;
let _index = null;
async function noteChunks() {
  const rows = await all(`SELECT id, title, body, module, kind FROM expert_notes WHERE status = 'active' ORDER BY id`).catch(() => []);
  return rows.map(r => ({ src: r.kind === 'rule' ? 'rule' : 'note', id: String(r.id), title: r.title, section: '', module: r.module || '', text: r.title + '\n' + r.body }));
}
async function callChunks() {
  const rows = await all(`SELECT unit_key, at, product, text FROM expert_calls ORDER BY at DESC LIMIT 20000`).catch(() => []);
  return rows.map(r => ({ src: 'call', id: r.unit_key, title: 'Support call ' + String(r.at || '').slice(0, 10), section: '', module: String(r.product || '').replace(/_/g, ' '), at: r.at, text: r.text }));
}
// Batch 183: what reviewers decided on real tickets. Read from the app's own tables every time the index is rebuilt
// (every 10 minutes), so every new review is learned without anyone doing anything. Each source fails soft.
const snip = (s, n) => one(String(s || '').replace(/<[^>]+>/g, ' '), n);
async function reviewChunks() {
  const out = [];
  const tk = async (ids) => {
    if (!ids.length) return new Map();
    const rows = await all(`SELECT ticket_id, ticket_number, subject, channel FROM desk_ticket_snapshot WHERE ticket_id IN (${ids.map(() => '?').join(',')})`, ids).catch(() => []);
    return new Map(rows.map(r => [String(r.ticket_id), r]));
  };
  // 1. Transfer reviews: was T1 right to send this ticket on?
  try {
    const rows = await all(`SELECT id, ticket_number, subject, channel, to_team, verdict, severity, comment, reviewed_at FROM tr_reviews
      WHERE reviewed_at IS NOT NULL AND verdict IN ('good','invalid') AND COALESCE(voided,0) = 0 ORDER BY reviewed_at DESC LIMIT 4000`);
    for (const r of rows) {
      const ok = r.verdict === 'good';
      out.push({ src: 'review', id: 'tr' + r.id, number: String(r.ticket_number || ''), title: (ok ? 'Right transfer: ' : 'Wrong transfer: ') + snip(r.subject, 120), section: '', module: 'Transfer review', at: String(r.reviewed_at || '').slice(0, 10),
        text: `Ticket #${r.ticket_number || '?'} "${snip(r.subject, 160)}" (${r.channel || 'ticket'}) was sent from T1 to ${r.to_team || 'another team'}. Reviewer decision: ${ok ? 'correct transfer, this team owns it' : 'invalid transfer, T1 should have handled it' + (r.severity ? ' (' + r.severity + ')' : '')}.${r.comment ? ' Reviewer note: ' + snip(r.comment, 500) : ''}` });
    }
  } catch (e) { /* table not there */ }
  // 2. AI and VoIP ticket audits: could T1 have handled it?
  try {
    const rows = await all(`SELECT ticket_id, topic, verdict, reason, guide_ref, audited_by, at FROM topic_audits WHERE verdict IN ('could_handle','right_transfer') ORDER BY at DESC LIMIT 3000`);
    const m = await tk(rows.map(r => String(r.ticket_id)));
    for (const r of rows) {
      const t = m.get(String(r.ticket_id)) || {};
      out.push({ src: 'review', id: 'ta' + r.ticket_id, number: String(t.ticket_number || ''), title: (r.verdict === 'could_handle' ? 'T1 could have handled: ' : 'Right to hand over: ') + snip(t.subject || r.topic, 120), section: '', module: r.topic === 'ai' ? 'AI support' : r.topic === 'voip' ? 'VoIP' : '', at: String(r.at || '').slice(0, 10),
        text: `${r.topic === 'ai' ? 'AI' : 'VoIP'} support ticket #${t.ticket_number || '?'} "${snip(t.subject, 160)}". Audit: ${r.verdict === 'could_handle' ? 'T1 could have resolved this itself' : 'handing it over was right'}. ${snip(r.reason, 500)}${r.guide_ref ? ' Guide: ' + snip(r.guide_ref, 160) : ''}` });
    }
  } catch (e) {}
  // 3. Reviews of AI and VoIP tickets T1 handled (how well, what to do differently)
  try {
    const rows = await all(`SELECT ticket_id, topic, overall, summary, detail, reviewed_at FROM topic_reviews WHERE summary IS NOT NULL ORDER BY reviewed_at DESC LIMIT 2000`);
    const m = await tk(rows.map(r => String(r.ticket_id)));
    for (const r of rows) {
      const t = m.get(String(r.ticket_id)) || {};
      let det = r.detail; try { const j = JSON.parse(det); det = [(j.strengths || []).length ? 'Done well: ' + j.strengths.join('; ') + '.' : '', (j.improve || []).length ? 'Should improve: ' + j.improve.join('; ') + '.' : '', (j.handoffMissing || []).length ? 'Missing from the handover: ' + j.handoffMissing.join('; ') + '.' : ''].filter(Boolean).join(' '); } catch (e) {}
      out.push({ src: 'review', id: 'tv' + r.ticket_id, number: String(t.ticket_number || ''), title: 'Handling review: ' + snip(t.subject || r.topic, 120), section: '', module: r.topic === 'ai' ? 'AI support' : r.topic === 'voip' ? 'VoIP' : '', at: String(r.reviewed_at || '').slice(0, 10),
        text: `Review of how T1 handled ticket #${t.ticket_number || '?'} "${snip(t.subject, 160)}"${r.overall != null ? ' (score ' + r.overall + ')' : ''}: ${snip(r.summary, 400)} ${snip(det, 500)}` });
    }
  } catch (e) {}
  // 4. QA audits by the SPOCs
  try {
    const rows = await all(`SELECT id, ticket_number, subject, dest_group, verdict, summary, findings, completed_at FROM audit_tickets WHERE completed_at IS NOT NULL AND verdict IN ('correct','needs_fix') ORDER BY completed_at DESC LIMIT 3000`);
    for (const r of rows) {
      if (!r.summary && !r.findings) continue;
      let f = r.findings; try { const j = JSON.parse(f); f = (Array.isArray(j) ? j : [j]).map(x => typeof x === 'string' ? x : [x.label, x.note].filter(Boolean).join(': ')).join('; '); } catch (e) {}
      out.push({ src: 'review', id: 'qa' + r.id, number: String(r.ticket_number || ''), title: (r.verdict === 'needs_fix' ? 'QA: needed a fix: ' : 'QA: handled right: ') + snip(r.subject, 120), section: '', module: 'QA audit', at: String(r.completed_at || '').slice(0, 10),
        text: `QA audit of ticket #${r.ticket_number || '?'} "${snip(r.subject, 160)}"${r.dest_group ? ' (sent to ' + r.dest_group + ')' : ''}: ${r.verdict === 'needs_fix' ? 'needed a fix' : 'handled correctly'}. ${snip(r.summary, 400)} ${snip(f, 500)}` });
    }
  } catch (e) {}
  // 5. QA rules and published process updates from the audit team
  try {
    for (const r of await all(`SELECT id, title, category, description FROM audit_rules WHERE enabled = 1 AND description IS NOT NULL`))
      out.push({ src: 'qa', id: 'ar' + r.id, title: snip(r.title, 140), section: '', module: snip(r.category, 40) || 'QA', text: snip(r.title, 160) + '\n' + snip(r.description, 900) });
  } catch (e) {}
  try {
    for (const r of await all(`SELECT id, kind, title, body, published_at FROM audit_updates WHERE status = 'published' ORDER BY published_at DESC LIMIT 200`))
      out.push({ src: 'update', id: 'au' + r.id, title: snip(r.title, 140), section: '', module: r.kind === 'process' ? 'Process' : snip(r.kind, 30), at: String(r.published_at || '').slice(0, 10), text: snip(r.title, 160) + '\n' + snip(r.body, 900) });
  } catch (e) {}
  return out;
}
// Questions agents asked here and marked helpful: reused as known good answers for the same scenario.
async function learnedChunks() {
  const rows = await all(`SELECT id, question, module, answer_json, created_at FROM expert_log WHERE vote = 1 AND found = 1 ORDER BY id DESC LIMIT 3000`).catch(() => []);
  return rows.map(r => { let a = {}; try { a = JSON.parse(r.answer_json); } catch (e) {} const body = [a.answer].concat((a.steps || []).map((x, i) => (i + 1) + '. ' + x), a.owner ? ['Owner: ' + a.owner.who + (a.owner.when ? ', ' + a.owner.when : '')] : []).filter(Boolean).join('\n');
    return body ? { src: 'learned', id: 'l' + r.id, title: 'Answered before: ' + snip(r.question, 140), section: '', module: r.module || '', at: String(r.created_at || '').slice(0, 10), text: 'Agent question: ' + snip(r.question, 400) + '\nAnswer the team marked helpful: ' + body } : null; }).filter(Boolean);
}
function guideChunks() {
  try { const d = D.guides.load(); const out = []; for (const doc of Object.values(d)) for (const c of doc.chunks) out.push({ src: 'guide', doc: doc.id, id: c.id, title: c.title, section: c.path || '', module: doc.title, text: c.text }); return out; }
  catch (e) { return []; }
}
// Batch 186: every product and process update from the Adit Updates site (and the ones written in this tool).
async function updateChunks() {
  try {
    const a = await D.productUpdates.archive();
    return (a.items || []).map(u => ({ src: 'update', id: 'u' + u.id, title: one(u.title, 140), section: '', module: (u.modules || []).join(', ') || one(u.category, 40), at: String(u.postedAt || '').slice(0, 10), url: u.url || '',
      text: [one(u.title, 200), one(u.summary, 1200), u.impact ? 'What to do: ' + one(u.impact, 800) : '', u.details ? one(u.details, 2500) : ''].filter(Boolean).join('\n') }));
  } catch (e) { return []; }
}
async function index() {
  if (_index && Date.now() - _index.at < 10 * 60000) return _index;
  const docs = kbChunks().concat(guideChunks(), await noteChunks(), await callChunks(), await reviewChunks(), await learnedChunks(), await updateChunks());
  const df = {}, toks = docs.map(c => { const t = words(c.title + ' ' + c.section + ' ' + c.module + ' ' + c.text).map(stem); for (const w of new Set(t)) df[w] = (df[w] || 0) + 1; return t; });
  const tfs = toks.map(t => { const tf = {}; for (const w of t) tf[w] = (tf[w] || 0) + 1; return tf; });
  const titles = docs.map(c => new Set(words(c.title + ' ' + c.section).map(stem)));
  const avg = toks.reduce((s, t) => s + t.length, 0) / Math.max(1, toks.length);
  _index = { at: Date.now(), docs, df, tfs, lens: toks.map(t => t.length), titles, avg, N: docs.length };
  return _index;
}
function bust() { _index = null; }
function expand(q) {
  const base = words(q), out = new Map();
  base.forEach(w => out.set(stem(w), 1));
  const text = ' ' + lc(q) + ' ';
  SYNMAP.forEach((g, k) => { if (text.includes(' ' + k + ' ') || base.includes(k)) g.forEach(x => words(x).forEach(w => { const s = stem(w); if (!out.has(s)) out.set(s, 0.45); })); });
  return out;
}
async function searchLocal(queries, { module = '', limit = 12, maxChars = 18000, srcs = null } = {}) {
  const ix = await index();
  const qw = new Map();
  queries.filter(Boolean).forEach((q, i) => expand(q).forEach((wt, w) => qw.set(w, Math.max(qw.get(w) || 0, wt * (i === 0 ? 1 : 0.8)))));
  if (!qw.size) return [];
  const scored = [];
  for (let i = 0; i < ix.N; i++) {
    const c = ix.docs[i]; if (srcs && !srcs.includes(c.src)) continue;
    const tf = ix.tfs[i]; let s = 0, hit = 0, need = 0;
    for (const [w, wt] of qw) {
      if (wt >= 1) need++;
      if (!tf[w]) continue; if (wt >= 1) hit++;
      const idf = Math.log(1 + ix.N / (ix.df[w] || 1));
      s += wt * (idf * (tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + 0.75 * ix.lens[i] / ix.avg)) + (ix.titles[i].has(w) ? idf * 1.4 : 0));
    }
    if (s <= 0) continue;
    s *= 0.45 + hit / Math.max(1, need);
    if (module && c.module && lc(c.module) === lc(module)) s *= 1.35;
    if (c.src === 'rule' || c.src === 'note') s *= 1.5;
    if (c.src === 'call') s *= 0.7;
    if (c.src === 'review' || c.src === 'qa') s *= 1.25;
    if (c.src === 'learned') s *= 0.85;
    scored.push({ c, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const picked = [], perDoc = {}; let used = 0;
  for (const x of scored) {
    if (picked.length >= limit) break;
    const key = x.c.src + ':' + x.c.id; if ((perDoc[key] = (perDoc[key] || 0) + 1) > 2) continue;
    if (used + x.c.text.length > maxChars && picked.length >= 4) continue;
    picked.push(x.c); used += x.c.text.length;
  }
  return picked;
}

// ── Solved tickets and chats (AditKB case index) ────────────────────────
const tsTerms = (s) => words(s).filter(w => w.length > 2).slice(0, 10);
async function searchCases(q, module) {
  const terms = tsTerms(q); if (!terms.length) return [];
  const rows = [];
  if (D.query) {
    // websearch syntax: OR between the terms, ranked; recent and resolved cases first.
    const qs = terms.map(t => t.replace(/[^a-z0-9]/g, '')).filter(Boolean).join(' or ');
    const sql = `SELECT ref, kind, module, title, left(body, 900) AS body, left(resolution, 700) AS resolution, opened, closed, facets->>'channel' AS channel,
      ts_rank(tsv, q) * (CASE WHEN opened > now() - interval '18 months' THEN 1.3 ELSE 1 END) AS rk
      FROM case_index, websearch_to_tsquery('english', '${qs}') q WHERE tsv @@ q AND resolution IS NOT NULL AND length(resolution) > 40 ORDER BY rk DESC LIMIT 8`;
    try { const r = await withTimeout(D.query(sql, 8), 9000); rows.push(...(r.rows || [])); }
    catch (e) { console.warn('expert cases sql:', e.message); }
  }
  if (!rows.length && D.kb) {
    const top = terms.slice().sort((a, b) => b.length - a.length).slice(0, 2);
    try { rows.push(...await withTimeout(D.kb('case_index', { select: 'ref,kind,module,title,body,resolution,opened,closed', filters: ['resolution:like:_%'].concat(top.map(t => `title:ilike:%${t}%`)), order_by: 'opened', desc: true, limit: 6 }), 9000)); }
    catch (e) { console.warn('expert cases rows:', e.message); }
  }
  const junk = /^(closing|closed|resolved|issue resolved|done|no response|client disconnected)/i;
  return rows.filter(r => !junk.test(one(r.resolution, 60)) || one(r.resolution, 400).length > 80).slice(0, 6).map(r => {
    const m = String(r.title || '').match(/#(\d+)/);
    return { src: 'case', id: String(r.ref), number: m ? m[1] : '', title: one(String(r.title || '').replace(/^#\d+\s*[\u2014-]\s*/, ''), 140), module: one(String(r.module || '').replace(/_/g, ' '), 40),
      channel: one(r.channel, 20), at: String(r.closed || r.opened || '').slice(0, 10), text: 'Case: ' + one(r.body, 700) + '\nWhat fixed it: ' + one(r.resolution, 600) };
  });
}

// ── Calls: condensed findings from T1's RingCentral calls ───────────────
const KEEP_CAT = /implementation|workflow|support|how|resolution|product_bug|product_gap|feature|training|education|config|setup/i;
async function syncCalls({ max = 45000 } = {}) { // Batch 208: up to 45,000 rows a run so a gap of weeks catches up in one go
  if (!D.kb) return { added: 0, note: 'AditKB not configured' };
  const since = await getState('calls_since', '2020-01-01T00:00:00Z');
  let added = 0, last = since;
  for (let off = 0; off < max; off += 300) {
    let rows = [];
    try { rows = await D.kb('unit_summaries', { select: 'unit_key,kind,summary,findings,evidence_to', filters: ['kind:eq:rc_call', 'findings:gt:0', `evidence_to:gt:${since}`], order_by: 'evidence_to', desc: false, limit: 300, offset: off }); }
    catch (e) { console.warn('expert syncCalls:', e.message); await setState('calls_err', String(e.message).slice(0, 300)).catch(() => {}); return { added, error: String(e.message).slice(0, 300) }; }
    for (const r of rows) {
      let s = r.summary; if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } }
      const f = (s && Array.isArray(s.findings) ? s.findings : []).filter(x => x && x.claim && KEEP_CAT.test(String(x.category || '')));
      if (!f.length) continue;
      const text = f.slice(0, 6).map(x => '- ' + one(String(x.claim).replace(/\s*\[[^\]]*\]/g, ''), 360)).join('\n');
      const product = (f.find(x => x.product && !/unspecified/.test(x.product)) || {}).product || '';
      await run(`INSERT OR REPLACE INTO expert_calls (unit_key, at, product, text) VALUES (?,?,?,?)`, [r.unit_key, r.evidence_to, product, text]); added++;
      if (String(r.evidence_to) > last) last = String(r.evidence_to);
    }
    if (rows.length < 300) break;
  }
  await setState('calls_since', last);
  if (added) bust();
  return { added, since: last };
}

// ── Brains ──────────────────────────────────────────────────────────────
function providers() {
  const ai = D.ai; const claude = ai.isAnthropicConfigured && ai.isAnthropicConfigured(), openai = ai.isConfigured && ai.isConfigured();
  return { claude, openai };
}
async function quickJSON(system, user, maxTokens) {
  const ai = D.ai, p = providers();
  if (p.openai) {
    try { const r = await ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature: 0, timeoutMs: 20000 }); return r.json; }
    catch (e) { if (!p.claude) throw e; const r = await ai.claudeJSON({ system, user, maxTokens, timeoutMs: 30000, temperature: 0 }); return r.json; } // OpenAI down or out of credit
  }
  const r = await ai.bestJSON({ system, user, maxTokens, timeoutMs: 30000, temperature: 0 }); return r.json;
}
async function plan(q, history) {
  const mods = kb().modules;
  const system = `You route questions from Adit support agents. Adit is a practice platform for dental, orthodontic, optometry and chiropractic offices. Product modules: ${mods.join('; ')}; plus VoIP phones and AI Front Desk.
Return JSON {"search": "8 to 14 keywords that would appear in a help article or a solved ticket for this, using Adit product words", "alt": ["another phrasing", "a likely cause or setting to look up"], "module": one module name from the list or "", "intent": "howto|troubleshoot|process|billing|account|reply|other", "client_words": true if the agent pasted the client's own message}`;
  const user = (history.length ? 'Earlier in the conversation:\n' + history.slice(-4).map(m => (m.role === 'user' ? 'Agent: ' : 'Expert: ') + one(m.content, 300)).join('\n') + '\n\n' : '') + 'Question: ' + q;
  try {
    const j = await withTimeout(quickJSON(system, user, 300), 15000);
    return { search: one(j.search, 200), alt: (Array.isArray(j.alt) ? j.alt : []).map(x => one(x, 160)).slice(0, 2), module: mods.find(m => lc(m) === lc(j.module)) || one(j.module, 60), intent: one(j.intent, 20) || 'other', clientWords: !!j.client_words };
  } catch (e) { return { search: q, alt: [], module: '', intent: 'other', clientWords: false, planFailed: true }; }
}
const EXPERT_SYS = `You are ${NAME}, the in-house product and process expert for Adit's T1 customer support team. Adit is a practice platform for dental, orthodontic, optometry and chiropractic offices (Engage texting and reminders, Adit Voice phones and eFax, AI Front Desk, Call Intelligence, Scheduler and Online Scheduling, Patient Forms, Adit Pay, Pozative reviews, Practice Analytics, Treatment Plans, CareCredit, Insurance Verification and RCM, CRM, Email Campaigns, Tasks and Automations, EHR/PMS integrations).
Answer the agent's question for the client scenario they describe, using ONLY the numbered sources. Authority, highest first: [RULE] and [NOTE] team rules, [UPDATE] product and process updates, [QA] QA rules, [REVIEW] reviewer decisions on real tickets (they settle who should handle a kind of request and what the agent should have done), [KB] Help Center articles and [GUIDE] support guides (they settle product steps), then [CASE] solved tickets and chats, [CALL] support calls and [LEARNED] answers the team marked helpful, which show how similar scenarios were solved and are used only when they agree with the higher sources. When reviewers repeatedly ruled the same kind of ticket an invalid transfer, tell the agent to handle it in T1.
A [LIVE] source means several offices reported the same thing in the last 48 hours, so it may be an ongoing incident; use it only if its tickets clearly describe the same problem as the question, otherwise ignore it. Then the first check is to confirm with the lead or the incident channel whether there is a known outage, the steps tell the agent to link this ticket to the reference tickets listed (by number) instead of troubleshooting one office, and the client message says we are aware of similar reports and are looking into it, with no time promised.
Write for an agent on a live call or chat: plain short sentences, exact menu paths and setting names as written in the sources, numbered steps (max 8). Never invent settings, prices, timelines, policies, names or links. Never promise a fix date, credit or refund unless a source says so. Do not repeat patient or client names from cases or calls.
If the sources only partly cover it, answer the part they cover, say what is missing and what to check or who to ask. If they do not cover it, set found to false and say who owns it if a source says so.
Return JSON:
{"brief": {"bottom_line": "...", "found": ["..."], "reply_label": "...", "reply": "...", "replies": [], "unknown": ["..."]},
 "answer": "1 to 3 sentences that directly answer",
 "steps": ["numbered actions for the agent or the client, if any"],
 "say": "what the agent can say or paste to the client, warm and short, no promises. Client-facing and generic: never mention internal teams or tiers (T1, T2, VoIP team, CSM pods), ticket statuses (Pending Review), reviewers, transfers, escalation process, internal tools or rules. Say it in plain customer terms, for example \"I am checking this with our specialist team and will update you\"" or "",
 "note": "a PRIVATE NOTE for Zoho Desk, ready to paste, when the ticket will be handed over (Pending Review - T1), when it asks the agent to document something, or when the agent asks for internal notes; otherwise \"\". Internal, so team names and statuses are fine. Plain text, one item per line: Client:, Practice:, Account number:, Deal stage:, Callback number:, Email:, Ticket:, Reason for contact:, What was checked:, Findings:, Client prefers:, Next team should:. Fill each from the ticket and the CRM source; never invent a value, write 'see ticket' for contact details and 'not given' when unknown.",
 "checks": ["up to 4 things to check or ask first"],
 "owner": {"who": "T1" or the owning team as named in the sources, "when": "when to hand it over and how"} or null,
 "cautions": ["up to 3 gotchas from the sources"],
 "share": the number of the [KB] source whose Help Center link is worth sending to the client, or 0,
 "follow_ups": ["3 short next questions the agent may ask"],
 "sources": [numbers of the sources you used],
 "confidence": "high" | "medium" | "low",
 "basis": {"from_record": ["up to 4 key claims read straight from a source, each with where (ticket #, CRM, thesis, Help Center title)"], "inferred": ["up to 3 claims that are your own inference, said as inference"], "checked_empty": ["up to 3 things you looked for in the sources and did not find"]},
 "found": true | false}
No em dashes or en dashes.
THE BRIEF COMES FIRST AND IS WHAT THE AGENT READS. Write it the way a sharp senior lead answers in chat: short, specific to this account, no generic advice.
- "bottom_line": 1 to 3 sentences. Start with the one fact that decides it (for example the deal stage, who is an authorized contact, what an earlier ticket shows), then the decision: can we do it, who does it, what happens next. Never restate the question.
- "found": up to 5 facts from the sources that the decision rests on, most decisive first, each one line and concrete: names, roles, dates, ticket numbers, what actually happened on the earlier ticket. When the client claims something happened before (another rep did it, a promise), say what the record actually shows (who, which ticket, when, and how it differs). Include how the team handled the same request before when a source shows it. No fact without a source; leave out anything that does not change the decision.
- "reply_label": who the reply is for, short, for example "Reply to Derek", "Email to Dr. Perry", "What to say on the call".
- "reply": ONE ready to paste message. If the person asking is a lead or colleague helping another agent ("an agent asks", "how do I help him", a colleague's message pasted in), write it to that agent: internal, team names, ticket numbers and statuses are fine, start "Hi <name>," when the name is known, the actions as short numbered lines in order, and the exact words to tell the client in quotes when useful. Otherwise write the message to the client in the channel style above (same rules as "say"). Keep it under 170 words, and for a message to an agent at most 4 numbered steps.
- "unknown": up to 2 short lines on what you could not check that would change the answer, else [].
- "replies": when the fix needs more than one person to act (for example the developers, the agent, the client, a manager), up to 4 more ready messages [{"label": "To Dev", "text": "..."}], one per person, each complete on its own and in the order they should go out; the main "reply" is for whoever acts first. Otherwise [].
- CHECKING A DRAFT: when the agent pastes their own draft and asks whether it is right, the bottom line says plainly whether it answers what the client actually asked and what in it is wrong or risky (for example it contradicts what the client was already told on a call, or promises a feature that does not exist). The "reply" is the corrected version. Never approve a draft only because it is true in general.
- AN ASK THAT CAN MEAN SEVERAL THINGS: when the client's words fit more than one request, list each reading in "found" with what is true today for it (a feature that exists, a known gap or roadmap item, a live problem with ticket numbers), and make the "reply" the short question to the client that settles which one, unless the record (an earlier call or ticket) already settles it; then say which and answer that.
- EXPLAINING TO A MANAGER OR LEADER: plain words and short pointers, no IDs or jargon: what happened, what it means for the client and for Adit, what is being done and by whom, and the decision needed, if any.
- FORMAT: in "reply" and "replies" never break a line inside a paragraph (Google Chat and Desk wrap it); a blank line between paragraphs; numbered lines only for actions in order.
- Never answer "ask your lead" or "check with your team" when the sources settle it. When no rule settles it, give your best call, say it is your judgement and why, and put the missing rule in "unknown".
- A REVIEW OF HOW A TICKET WAS HANDLED (the user message says LEAD REVIEW): "bottom_line" names the likely cause and the fix. "found" gives the cause first (the earlier ticket, date, who changed what, the exact path or wording, and why it explains the problem), then where the handling went wrong, each with who and when (a vague handover note, a template reply with no action, asking the client for what they already explained or could not give, no owner after a reassignment, no reply since a given date). "reply" is the message to the agent who owns the ticket now: what the real issue is, the cause with the ticket number, and the steps to fix it with the client (call when the client is upset or a call was asked for). "replies": the message to the client ready to send if the call does not happen, and "Coaching (keep private)" with short coaching points for the team. Never send it to another team when the cause and the fix are known.
  In a lead review also: (a) when an earlier ticket or a source shows a step that can lose or duplicate data (removing or deleting items from a queue, bulk deletes, retrying a sync when the office may have entered the record by hand), the reply to the agent starts with a "Don't" line naming that step and the ticket that shows why, and "found" says what happened there; (b) put ticket hygiene in "found": a wrong ticket type, category or module (say what it should be), internal notes that contradict each other (say which says what), a status that is wrong or lets auto-assign keep moving the ticket; (c) keep the reply to the agent to at most 4 numbered steps, the most important first, and end with one line to tell the client.
- PARTIAL HANDOVER: when a client asks several things, the client reply answers every part that a Help Center article, the usage policy or a team rule covers, in full and with the article links ([KB] sources carry them), and hands over only the parts that need the account, a quote or another team, saying who will follow up. The private note lists what T1 answered, why each other part goes on (one line each) and what the next team should check. Never tell the agent to look for a Help Center article: you have the sources, so use them or say none covers it. When the Help Center sources disagree on a figure, do not quote it; flag it in the note.
- When the user message says NO ACCOUNT WAS CHECKED, this is a general answer: say in the bottom line that it is the usual rule, not checked against this client, and name in "unknown" what the account could change (for example the deal stage, who the authorized contacts are, an earlier ticket). Never invent account facts.
Keep the rest of the JSON as specified; it is shown only when the agent opens the full review.`;
const CHECK_SYS = `You are the second reviewer for ${NAME}, an assistant for Adit's support agents. You get numbered sources and a draft answer. Check every statement, step, setting path, owner and the client wording against the sources.
Remove or correct anything the sources do not support; keep what they support. Make sure team rules ([RULE], [NOTE]) and [UPDATE]s are followed. The "say" text goes to the client: rewrite it to be generic if it mentions any internal team or tier (T1, T2, VoIP team, CSM), ticket status, reviewer, transfer, escalation process, internal tool or rule. Naming the person who now handles it with their client-facing role (for example "Tyler Roden, our Lead Onboarding Specialist") and saying "I have checked with our onboarding team" are fine and expected. Keep the "say" addressed to the person the draft addresses (the practice, not an Adit colleague or partner who forwarded the message), and never turn a reply that states what was arranged into one that only acknowledges or promises to pass it on. Keep the same style: short, plain, no em dashes.
The "brief" is what the agent reads first: check its bottom line, every "found" fact and the "reply" against the sources the same way; the brief's reply may be addressed to an Adit colleague and may name teams and tickets when it is. Keep it short.
Return JSON {"verdict": "ok" or "fixed", "issues": ["what you changed and why, short"], "brief": {"bottom_line": "", "found": [], "reply_label": "", "reply": "", "replies": [], "unknown": []}, "answer": "...", "steps": [...], "say": "...", "checks": [...], "owner": {"who": "", "when": ""} or null, "cautions": [...], "confidence": "high" | "medium" | "low"}.`;
function label(c) { return { ticket: 'TICKET', live: 'LIVE', rule: 'RULE', note: 'NOTE', update: 'UPDATE', qa: 'QA', review: 'REVIEW', kb: 'KB', guide: 'GUIDE', case: 'CASE', call: 'CALL', learned: 'LEARNED' }[c.src] || 'SRC'; }
function ctxOf(list) {
  return list.map((c, i) => `[S${i + 1}] [${label(c)}] ${c.src === 'kb' ? c.module + ' > ' + c.title + (c.section ? ' > ' + c.section : '') + (c.url ? ' (' + c.url + ')' : '') : c.src === 'case' ? 'Ticket #' + (c.number || '?') + ' ' + c.title + (c.at ? ', ' + c.at : '') : c.src === 'review' ? c.title + (c.at ? ', ' + c.at : '') : c.title + (c.section ? ' > ' + c.section : '')}\n${c.text}`).join('\n\n');
}
function arr(x, n, m = 300) { return (Array.isArray(x) ? x : []).map(v => one(typeof v === 'string' ? v : JSON.stringify(v), m)).filter(Boolean).slice(0, n); }
function shapeTicket(t) {
  if (!t || typeof t !== 'object') return null;
  return { summary: one(t.summary, 700), waiting: one(t.waiting, 300), sentiment: one(t.sentiment, 40), stage: one(t.stage, 200), went_well: arr(t.went_well, 4, 220), improve: arr(t.improve, 5, 260), next: arr(t.next, 6, 260), risk: one(t.risk, 300), reply_to: one(t.reply_to, 300),
    verdict: one(t.verdict, 400), fix_check: one(t.fix_check, 400), classification: one(t.classification, 240), confidence: ['high', 'medium', 'low'].includes(lc(t.confidence)) ? lc(t.confidence) : '',
    findings: (Array.isArray(t.findings) ? t.findings : []).filter(f => f && typeof f === 'object' && f.title).slice(0, 4).map(f => ({ title: one(f.title, 200), evidence: one(f.evidence, 700), driver: one(f.driver, 400), impact: one(f.impact, 400), recommendation: one(f.recommendation, 500), confidence: one(f.confidence, 200) })),
    cluster: (Array.isArray(t.cluster) ? t.cluster : []).filter(c => c && typeof c === 'object' && String(c.number || '').replace(/\D/g, '')).slice(0, 12).map(c => ({ number: String(c.number).replace(/\D/g, '').slice(0, 8), account: one(c.account, 80), status: one(c.status, 40), note: one(c.note, 200) })),
    actions: (Array.isArray(t.actions) ? t.actions : []).filter(a => a && (a.text || typeof a === 'string')).slice(0, 8).map(a => typeof a === 'string' ? { kind: '', text: one(a, 300) } : { kind: ['immediate', 'investigate', 'process', 'coaching'].includes(lc(a.kind)) ? lc(a.kind) : '', text: one(a.text, 300), who: one(a.who, 80) }),
    limits: arr(t.limits, 4, 260),
    repeat: t.repeat && typeof t.repeat === 'object' ? { same_issue: one(t.repeat.same_issue, 20), same_area: one(t.repeat.same_area, 20), note: one(t.repeat.note, 260) } : null };
}
function shapeBrief(b) {
  if (!b || typeof b !== 'object') return null;
  const o = { bottom_line: one(b.bottom_line, 600), found: arr(b.found, 5, 320), reply_label: one(b.reply_label, 60), reply: clean(b.reply || '', 2400).trim(), unknown: arr(b.unknown, 2, 220),
    replies: (Array.isArray(b.replies) ? b.replies : []).filter(x => x && x.text).slice(0, 6).map(x => ({ label: one(x.label || 'Message', 60), text: clean(x.text, 4000).trim() })) };
  return o.bottom_line || o.reply ? o : null;
}
function shape(j) {
  return { brief: shapeBrief(j.brief), answer: one(j.answer, 900), steps: arr(j.steps, 10, 700), say: clean(j.say, 2400).trim(), note: clean(j.note || '', 3000).trim(), checks: arr(j.checks, 5), owner: j.owner && (j.owner.who || j.owner.when) ? { who: one(j.owner.who, 80), when: one(j.owner.when, 300) } : null,
    cautions: arr(j.cautions, 4), follow_ups: arr(j.follow_ups, 3, 140), basis: j.basis && typeof j.basis === 'object' ? { from_record: arr(j.basis.from_record, 4, 260), inferred: arr(j.basis.inferred, 3, 260), checked_empty: arr(j.basis.checked_empty, 3, 220) } : null, confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium' };
}
// Batch 211: the Adit Updates that bear on a ticket or text, for every analysis in the tool (ticket review, transfer
// review, escalation watch, AI and VoIP support reviews). Newest first among the best matches, with the date, so an
// answer follows how things work today. Returns '' when nothing fits.
async function updatesFor(text, { limit = 4, chars = 3500 } = {}) {
  try {
    const q = one(text, 600); if (!q) return '';
    const hits = await searchLocal([q], { limit: limit + 2, maxChars: chars + 2000, srcs: ['update'] }).catch(() => []);
    const recent = await relevantUpdates(q).catch(() => []);
    const seen = new Set(), list = [];
    for (const u of hits.concat(recent)) { const k = lc(u.title); if (seen.has(k)) continue; seen.add(k); list.push(u); }
    list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const out = list.slice(0, limit).map(u => `- ${u.at ? u.at + ': ' : ''}${u.title}${u.module ? ' (' + u.module + ')' : ''}\n  ${one(u.text, 700)}`).join('\n');
    return out ? out.slice(0, chars) : '';
  } catch (e) { return ''; }
}
async function relevantUpdates(q) {
  try { const r = await D.productUpdates.recent(); const t = words(q); return (r.items || []).filter(u => t.some(w => w.length > 3 && lc(u.title + ' ' + u.summary + ' ' + (u.impact || '')).includes(w))).slice(0, 3).map(u => ({ src: 'update', id: String(u.id || u.title), title: one(u.title, 120), section: '', module: '', at: String(u.postedAt || '').slice(0, 10), text: one(u.summary, 500) + (u.impact ? '\nWhat to do: ' + one(u.impact, 300) : '') })); }
  catch (e) { return []; }
}

const INTERNAL = /pending review|\bT[123]\b|tier ?[123]|reviewer|escalat|\bCSM\b|voip team|\bpod\b|transfer(red|ring)? (it|the ticket|your ticket)|status to|zoho desk|internal/i;
async function genericSay(say, q) {
  const j = await withTimeout(quickJSON('You rewrite a support agent\'s message to an Adit client. Keep the meaning, the warmth and any steps for the client, but remove every internal detail: team or tier names (T1, T2, VoIP team, CSM, pods), ticket statuses such as Pending Review, reviewers, transfers, escalation process, internal tools and rules. Where the agent hands it on, say something generic like "I am checking this with our specialist team and will update you". Never promise a fix date. Plain, short, no em dashes. Return JSON {"say": "..."}', 'Client question: ' + one(q, 400) + '\n\nMessage: ' + say, 400), 15000);
  const t = one(j && j.say, 1200);
  return t && !INTERNAL.test(t) ? t : say.replace(/[^.]*\b(pending review|T[123]|reviewer|escalat\w*)\b[^.]*\.?/gi, ' I am checking this with our specialist team and will update you shortly.').replace(/\s+/g, ' ').trim();
}
// ── Live signal: many clients reporting the same thing right now ───────
// Reads the app's own copy of Zoho Desk tickets (synced from AditKB every few minutes). When several tickets from
// different offices in the last 48 hours match the question, it is likely an ongoing incident: the agent should
// confirm the outage first and link the reference tickets, not troubleshoot one office.
const st2 = (w) => w.length > 3 ? w.replace(/(ing|ed|es|e|s)$/, '') : w;
// Words that say nothing about what is broken (support filler), so they never tie two tickets together.
const GENERIC = new Set(('adit issue problem help request ticket client patient office question regarding call text message send sent not working work new fwd re ' +
  'see attach attached picture screenshot image reference discussion please thank thanks today yesterday week going go different change changed time ' +
  'getting get got still again also need needs want wants able unable error update updated hi hello team dr doctor practice dental eye care support').split(' ').map(st2));
const NOISE_SUBJECT = /^(fwd?:\s*)?(invitation|updated invitation|accepted|declined|tentative|automatic reply|out of office|new voice message from)/i;
const keyWords = (txt) => new Set(words(txt).map(st2).filter(w => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w)));
// A real incident is a burst: many offices, in the last 48 hours, about the same specific thing, far more often than usual.
async function liveSignal(q) {
  const now = Date.now(), since48 = new Date(now - 48 * 3600e3).toISOString().slice(0, 10);
  const rows = (await all(`SELECT ticket_id, ticket_number, subject, created_time, status, channel, account_name FROM desk_ticket_snapshot WHERE created_time >= ? ORDER BY created_time DESC LIMIT 5000`, [since48]).catch(() => []))
    .filter(r => !/^test\b/i.test(String(r.account_name || '')) && !NOISE_SUBJECT.test(String(r.subject || '')) && Date.parse(r.created_time) >= now - 48 * 3600e3);
  if (rows.length < 3) return null;
  const own = new Set((String(q).match(/#?\b\d{6}\b/g) || []).map(x => x.replace('#', '')));
  const Q = keyWords(q); if (!Q.size) return null;
  const hits = [];
  for (const r of rows) {
    if (own.has(String(r.ticket_number))) continue;
    const D = keyWords(r.subject); if (!D.size) continue;
    const M = [...D].filter(w => Q.has(w));
    if (!M.length || (M.length < 2 && M.length / D.size < 0.5)) continue;
    hits.push({ r, at: Date.parse(r.created_time), M });
  }
  if (hits.length < 3) return null;
  // the specific word most of the matching tickets share
  const cnt = {}; hits.forEach(x => x.M.forEach(w => { cnt[w] = (cnt[w] || 0) + 1; }));
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const cluster = hits.filter(x => x.M.includes(top));
  const offices = new Set(cluster.map(x => lc(x.r.account_name)).filter(Boolean));
  if (cluster.length < 3 || offices.size < 2) return null;
  // compare with the usual rate for that word over the 14 days before
  const from = new Date(now - 16 * 86400e3).toISOString().slice(0, 10), to = new Date(now - 48 * 3600e3).toISOString();
  const base = await get(`SELECT COUNT(*) AS n FROM desk_ticket_snapshot WHERE created_time >= ? AND created_time < ? AND lower(subject) LIKE ?`, [from, to, '%' + top + '%']).catch(() => ({ n: 0 }));
  const usual48 = (base && base.n ? base.n : 0) / 7;
  if (cluster.length < Math.max(3, usual48 * 3)) return null;
  cluster.sort((a, b) => b.at - a.at);
  const today = cluster.filter(x => x.at >= now - 24 * 3600e3).length;
  const tickets = cluster.slice(0, 10).map(x => ({ number: String(x.r.ticket_number || ''), subject: one(x.r.subject, 120), at: new Date(x.at).toISOString(), status: x.r.status || '', channel: x.r.channel || '' }));
  return { count: cluster.length, today, offices: offices.size, word: top, usual: Math.round(usual48 * 10) / 10, first: new Date(cluster[cluster.length - 1].at).toISOString(), tickets };
}
const _cache = new Map();
/** Which ticket is under review (stays for the conversation) and which are related context. */
function pickTickets(q, history, T) {
  if (!T) return { tnum: null, relNums: [] };
  const allNums = T.detectAll ? T.detectAll(q) : [T.detect(q)].filter(Boolean);
  let histNum = null;
  for (const m of (history || []).filter(m => m.role === 'user').reverse()) { const n = T.detect(m.content); if (n) { histNum = n; break; } }
  const relatedWords = /\b(relat|relevant|previous|earlier|similar|older|past|prior|same (client|issue|problem|office)|this client|also|check(ed)?|another)\w*/i;
  let tnum = null, relNums = [];
  if (histNum && (!allNums.length || allNums.includes(histNum) || relatedWords.test(q))) { tnum = histNum; relNums = allNums.filter(n => n !== histNum); }
  else { tnum = allNums[0] || null; relNums = allNums.slice(1); }
  return { tnum, relNums: relNums.slice(0, 3) };
}

// Batch 191: who the client is in the CRM (through Client lookup, which reads AditKB): account, deals, CSM, OB,
// escalation, risk, contract, the written account analysis, FCR and CSAT. Fails soft.
// Batch 244 (from Aria's thesis): the parts of Aria's account thesis a support reply needs: who decides and how to
// approach them, the next steps in order, open promises, the client's mood and the risks. Read as a few JSON fields
// (not the whole thesis, which can be close to 1 MB) and kept 6 hours per account.
const _brief = new Map();
const unref = (t) => String(t || '').replace(/\s*\[(?:[CTEN][^\]]{0,80})\](?:\[[^\]]{0,80}\])*/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
async function thesisBrief(accountId) {
  const id = String(accountId || '').replace(/\D/g, '');
  if (!id || !D.query) return null;
  const hit = _brief.get(id); if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.v;
  let v = null;
  try {
    const r = await withTimeout(D.query(`select saved_at, thesis->'thesis'->>'headline' as hl, thesis->'thesis'->'approach' as ap, thesis->'thesis'->'next_steps' as ns, thesis->'thesis'->'promises' as pr, thesis->'thesis'->'customer_mood' as cm, thesis->'thesis'->'future_risks' as fr from theses where j_account_id = '${id}' order by saved_at desc limit 1`, 1), 12000);
    const row = r && r.rows && r.rows[0];
    if (row) {
      const J = (x) => { if (!x) return null; if (typeof x === 'string') { try { return JSON.parse(x); } catch (e) { return null; } } return x; };
      const ap = J(row.ap) || {}, ns = J(row.ns) || [], pr = J(row.pr) || [], cm = J(row.cm) || {}, fr = J(row.fr) || [];
      const L = [`Aria's account thesis (written ${String(row.saved_at || '').slice(0, 10)}; Aria is Adit's account analysis tool):`];
      if (ap.decision_maker) L.push('Who decides: ' + one(unref(ap.decision_maker), 500));
      if (ap.how_to_approach) L.push('How to approach them: ' + one(unref(ap.how_to_approach), 1100));
      if (ap.outstanding_need) L.push('What they still need: ' + one(unref(ap.outstanding_need), 400));
      if (ap.posture) L.push('Posture: ' + one(ap.posture, 40));
      if (cm && (cm.level || cm.why)) L.push(`Client mood: ${one(cm.level || '', 30)}${cm.why ? ', ' + one(unref(cm.why), 400) : ''}`);
      const steps = (Array.isArray(ns) ? ns : []).filter(x => x && x.action).slice(0, 6);
      if (steps.length) L.push('Next steps, most important first:\n' + steps.map(x => `- [${one(x.urgency || '', 12)}${x.owner ? ', ' + one(x.owner, 30) : ''}] ${one(unref(x.action), 260)}${x.why ? ' Why: ' + one(unref(x.why), 260) : ''}`).join('\n'));
      const prom = (Array.isArray(pr) ? pr : []).filter(x => x && x.what && /open|unclear|broken|pending/i.test(x.status || '')).slice(0, 6);
      if (prom.length) L.push('Promises Adit made that are not yet kept:\n' + prom.map(x => `- [${one(x.status, 12)}] ${one(unref(x.what), 200)}${x.promised_by ? ' (' + one(x.promised_by, 60) + (x.promised_on ? ', ' + one(x.promised_on, 12) : '') + ')' : ''}${x.outcome ? ': ' + one(unref(x.outcome), 220) : ''}`).join('\n'));
      const risks = (Array.isArray(fr) ? fr : []).filter(x => x && x.what).slice(0, 3);
      if (risks.length) L.push('Risks:\n' + risks.map(x => '- ' + one(unref(x.what), 260)).join('\n'));
      if (L.length > 1) v = L.join('\n').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]').replace(/([^\s(])\[(phone|email)\]/g, '$1 [$2]').slice(0, 5500);
    }
  } catch (e) { /* no thesis or no access: the rest of the record still works */ }
  _brief.set(id, { at: Date.now(), v }); if (_brief.size > 300) _brief.delete(_brief.keys().next().value);
  return v;
}
async function crmContext(number, { acct = false, query = '' } = {}) {
  if (!D.client || !D.client.search || !D.client.profile) return null;
  const sr = await D.client.search(query || (acct ? 'acct:' + number : '#' + number));
  const hit = (sr.results || []).find(r => r.accountId || r.dealId);
  if (!hit) return null;
  const pr = await D.client.profile(hit.accountId, hit.dealId, D.localAll || (async () => []));
  if (!pr || !pr.available) return null;
  const H = pr.header || {}, A = pr.account || {}, d = pr.detail || {}, an = d.analysis || {};
  const L = [];
  L.push(`Account: ${H.account || A.name || '?'}${A.city ? ' (' + A.city + ')' : ''}${A.ehr ? ', EHR ' + A.ehr : ''}${A.locations ? ', ' + A.locations + ' location(s)' : ''}${A.risk ? ', account risk ' + A.risk : ''}${A.contractEnd ? ', contract ends ' + String(A.contractEnd).slice(0, 10) : ''}${A.owner ? ', account owner ' + A.owner : ''}.`);
  L.push(`Deal: ${H.deal || '?'}${H.stage ? ', stage ' + H.stage : ''}${H.csm ? ', CSM ' + H.csm : ''}${H.ob ? ', onboarding ' + H.ob : ''}. Escalation: ${H.escalation || 'none'}${H.escalationOwner ? ' (owner ' + H.escalationOwner + ')' : ''}.`);
  if ((pr.deals || []).length > 1) L.push('Deals on the account: ' + pr.deals.slice(0, 8).map(x => `${x.name}${x.stage ? ' (' + x.stage + ')' : ''}`).join('; ') + '.');
  if (d.available) {
    const bits = [];
    if (d.ticketsShown) bits.push(`${d.ticketsShown} support tickets on the deal`);
    if (d.fcr && d.fcr.pct != null) bits.push(`first contact resolution ${d.fcr.pct}% of ${d.fcr.closed} closed`);
    if (d.csat && d.csat.total) bits.push(`CSAT ${d.csat.good} good / ${d.csat.bad} bad`);
    if (bits.length) L.push('Support record: ' + bits.join(', ') + '.');
  }
  if (an.available) {
    L.push(`Account analysis${an.savedAt ? ' (' + String(an.savedAt).slice(0, 10) + ')' : ''}: ${one(an.headline || '', 900)}${an.health ? ' Health: ' + an.health + (an.healthWhy ? ' (' + an.healthWhy + ')' : '') + '.' : ''}`);
    if (an.mood && an.mood.level) L.push(`Client mood: ${an.mood.level}${an.mood.why ? ', ' + one(an.mood.why, 300) : ''}.`);
    if ((an.issues || []).length) L.push('Recurring issues:\n' + an.issues.slice(0, 8).map(i => `- ${one(i.problem, 260)}${i.status ? ' [' + i.status + ']' : ''}${i.times ? ' raised ' + i.times + 'x' : ''}${i.since ? ' since ' + i.since : ''}`).join('\n'));
    if ((an.open || []).length) L.push('Open items:\n' + an.open.slice(0, 6).map(o => `- ${one(o.item, 260)}${o.note ? ' (' + o.note + ')' : ''}`).join('\n'));
    if ((an.findings || []).length) L.push('Serious findings:\n' + an.findings.map(f => `- ${one(f.claim, 260)}`).join('\n'));
  }
  const tb = await thesisBrief(hit.accountId || pr.accountId).catch(() => null);
  if (tb) L.push(tb);
  const text = L.join('\n').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
  const scrubT = (t) => one(t, 260).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
  const account = { number: A.number || '', name: H.account || A.name || '', city: A.city || '', ehr: A.ehr || '', locations: A.locations || '', owner: A.owner || '', tickets: d.available ? (d.ticketsShown || 0) : null };
  const analysis = an.available ? { at: an.savedAt ? String(an.savedAt).slice(0, 10) : '', headline: scrubT(an.headline || ''), health: an.health || '', healthWhy: scrubT(an.healthWhy || ''), mood: an.mood && an.mood.level || '', moodWhy: an.mood ? scrubT(an.mood.why || '') : '',
    issues: (an.issues || []).slice(0, 4).map(i => ({ text: scrubT(i.problem), status: one(i.status || '', 30), times: i.times || null })), open: (an.open || []).slice(0, 3).map(o => ({ text: scrubT(o.item), note: scrubT(o.note || '') })) } : null;
  return { accountId: hit.accountId || pr.accountId || null, text: text.slice(0, 11000), thesis: !!tb, header: H, account, analysis, facts: { stage: H.stage || '', csm: H.csm || '', ob: H.ob || '', escalation: H.escalation || '', risk: A.risk || '', contractEnd: A.contractEnd ? String(A.contractEnd).slice(0, 10) : '', health: an.available ? (an.health || '') : '', mood: an.mood && an.mood.level || '', fcr: d.fcr && d.fcr.pct != null ? d.fcr.pct : null, csat: d.csat && d.csat.total ? d.csat.pct : null } };
}

const _inv = new Map(); // ticket -> { at, v } (Batch 237)
const _pat = new Map(); // ticket -> { at, v } (Batch 240)
// Batch 238: when the Help Center and guides do not cover a request, Expert looks for how the team handled the same
// request before (resolved Desk tickets and chats) instead of answering "not found".
async function precedentSearch(INV, q, tk, history) {
  if (!INV || !INV.isConfigured()) return null;
  const v = await withTimeout(INV.investigate({ goal: 'precedent', question: q, ticketText: tk ? String(tk.text || '').slice(0, 8000) : '', history: (history || []).slice(-4).map(m => (m.role === 'user' ? 'Agent: ' : 'Expert: ') + one(m.content, 400)).join('\n'), budgetMs: 45000, maxCalls: 9 }), 55000).catch(e => { console.warn('expert precedent:', e.message); return null; });
  return v && v.summary && !/^FINDINGS:\s*(none|-\s*none)\s*$/im.test(v.summary) ? v : null;
}
const CLAIM_RE = /\b(another|other|previous|last|different) (rep|representative|agent|person|tech|technician)\b|\b(did|done|made|changed) (it|this|that|so) (before|last time|previously)\b|\b(last time|previously|before) (you|someone|they|we)\b|\b(was|were) (promised|told)\b|\bon (their|his|her|the client'?s) behalf\b/i;
// Batch 272: a named deal, account or practice is always looked up, so the answer is about that client, not a general one.
// Batch 276 (#427211): the cause of a ticket is often a change made months earlier on the same account, beyond the
// recent tickets the ticket record carries. The lookup searches the account's whole ticket history by topic.
const HISTORY_ASK = 'Also search this account\'s WHOLE ticket history (any date, not only the recent tickets listed) for the same topic as this ticket, using two or three keyword variants of the product area and the client\'s own words (for example the setting, template, form or feature named). Read the conversation and notes of the closest earlier tickets. A change made earlier by an agent or the client (a template, default text, a setting, a call flow) is often the cause of the current problem: report it with the ticket number, the date, who made the change and the exact path or wording, and say whether it explains the current problem. Also report who handled each step of the current ticket and when (replies, notes, reassignments).';
const MULTI_RE = /\b(both|each|all (of )?(these|them|the tickets)|these (two |three )?tickets|two tickets|three tickets)\b|#?\d{5,7}\s*(,|and|&)\s*#?\d{5,7}/i;
const REVIEW_RE = /\b(handle[ds]? (this|it) better|how (to|should (i|we)) (handle|respond|reply)|what went wrong|went wrong|review (this|the) ticket|how (was|is) (this|it) handled|to respond here|help (him|her|them) (here|with this)|coach|suggest(ion)?s? (i|we) (can )?(give|make)|what (suggestion|advice)|advi[sc]e (him|her|them|[A-Z][a-z]+)|guide (him|her|them|[A-Z][a-z]+)|(tell|help) [A-Z][a-z]+ (to )?(handle|with|on)|for [A-Z][a-z]+ to handle)/i;
const NAMED_RE = /\b(?:[Dd]eal|[Aa]ccount|[Pp]ractice|[Cc]linic)(?: name)?\s*(?:is|:|-|=)?\s*["']?[A-Z][\w&'.-]+/;
const PROCESS_RE = /\b(can|could|should|may) (we|t1)\b|\bshould i\b|\ballowed\b|\bon (their|his|her) behalf\b|\bauthori[sz]|\bpermission|\baccess\b|\bpolicy\b|\bwho (handles|owns|should)\b|\bhow (do|should) (i|we) (help|handle)\b|\binsist/i;
const precSource = (v) => ({ src: 'ticket', id: 'prec', title: "How Adit's support team handled the same request before (Expert searched resolved Desk tickets and chats)", section: '', module: '', text: v.summary });
async function gather({ q, history, mode, module, useHistory, email, fresh, t0, depth = 'thinking', escalate = false }) {
  const key = crypto.createHash('sha1').update([q, mode, module, useHistory ? 1 : 0, depth].join('|')).digest('hex');
  // Batch 189: a ticket number in the question loads that ticket (never from the answer cache: tickets move on).
  // Batch 191: the ticket stays for the whole conversation. A follow-up without a number keeps the earlier ticket, and a
  // ticket the agent points to as related, previous or similar is read as extra context, not reviewed instead.
  const { tnum, relNums } = pickTickets(q, history, D.ticket);
  // Batch 279 (#428073, #428078): "how to handle both" puts every ticket named under review, each read in full.
  const multi = relNums.length > 0 && MULTI_RE.test(q);
  let tk = null, tkErr = null, related = [], crm = null;
  const tg0 = Date.now(); let msTicket = 0, msSearch = 0;
  if (tnum) {
    const [a, rel, cr] = await Promise.all([
      withTimeout(D.ticket.load(tnum, { deep: true }), 100000).then(v => ({ v }), e => ({ e: e.message })),
      Promise.all(relNums.map(n => withTimeout(D.ticket.load(n, multi ? { deep: true } : { light: true }), multi ? 100000 : 30000).catch(() => null))),
      withTimeout(crmContext(tnum), 25000).catch(() => null),
    ]);
    if (a.v) tk = a.v; else tkErr = a.e;
    related = rel.filter(Boolean); crm = cr;
    msTicket = Date.now() - tg0;
  }
  if (!tk && !fresh && !history.length && _cache.has(key) && Date.now() - _cache.get(key).at < 10 * 60000) return { done: { ..._cache.get(key).v, cached: true } };
  // Batch 236: Expert looks things up itself (the account, deal, owners, other tickets, calls) when the question or the
  // ticket needs facts the ticket does not carry, in parallel with the search below.
  const INV = D.investigate || require('./expert-investigate');
  // Batch 237: findings are kept per ticket for 30 minutes, so a follow-up on the same ticket answers at once; a follow-up
  // that asks for something new looks again, starting from what was already found.
  const invKey = tk ? 'tk' + tk.meta.number : '';
  const prevInv = invKey && _inv.get(invKey) && Date.now() - _inv.get(invKey).at < 30 * 60000 ? _inv.get(invKey).v : null;
  const newAsk = history.length && INV.needsLookup(q, null, null);
  let invP;
  if (prevInv && !newAsk) invP = Promise.resolve(Object.assign({}, prevInv, { reused: true }));
  else if (depth !== 'fast' && INV.isConfigured() && (prevInv || !!tk || INV.needsLookup(q, tk, crm) || CLAIM_RE.test(q) || NAMED_RE.test(q))) { // Batch 276: every ticket gets the history search // Batch 273: Fast never waits on lookups
    invP = withTimeout(INV.investigate({ question: tk ? q + '\n\n' + HISTORY_ASK : q, ticketText: tk ? tk.text : '', crmText: [crm && crm.text ? crm.text : '', prevInv ? 'Already found earlier in this conversation (do not look these up again):\n' + prevInv.summary : ''].filter(Boolean).join('\n\n'), history: history.slice(-4).map(m => (m.role === 'user' ? 'Agent: ' : 'Expert: ') + one(m.content, 500)).join('\n'), budgetMs: tk ? 65000 : 50000, maxCalls: tk ? 16 : 12 }), tk ? 75000 : 60000)
      .then(v => { if (v && v.summary && invKey) { _inv.set(invKey, { at: Date.now(), v }); if (_inv.size > 100) _inv.delete(_inv.keys().next().value); } return v || prevInv; })
      .catch(e => { console.warn('expert investigate:', e.message); return prevInv; });
  } else invP = Promise.resolve(null);
  // Batch 240 (from Aria): a ticket is also checked across Adit: the same problem at other practices right now, how this
  // kind of ticket closed before, and whether the fix sent so far matches. Kept per ticket for 30 minutes.
  const prevPat = invKey && _pat.get(invKey) && Date.now() - _pat.get(invKey).at < 30 * 60000 ? _pat.get(invKey).v : null;
  const procOnly = (PROCESS_RE.test(q) || CLAIM_RE.test(q)) && !/not working|error|fail|broken|down\b|outage|issue with|stopped/i.test(q); // Batch 272
  const patP = !tk || depth === 'fast' || procOnly ? Promise.resolve(null) : prevPat ? Promise.resolve(prevPat) : !INV.isConfigured() ? Promise.resolve(null)
    : withTimeout(INV.investigate({ goal: 'pattern', question: q, ticketText: String(tk.text || '').slice(0, 9000), budgetMs: 45000, maxCalls: 10 }), 55000)
      .then(v => { if (v && v.summary) { _pat.set(invKey, { at: Date.now(), v }); if (_pat.size > 100) _pat.delete(_pat.keys().next().value); return v; } return null; })
      .catch(e => { console.warn('expert pattern:', e.message); return null; });
  // Batch 271: a process or permission question ("can we", "on their behalf", "another rep did it") is decided by how the
  // team handled the same request before, so that search runs every time (in parallel), not only when nothing else was found.
  const precP = depth !== 'fast' && INV.isConfigured() && (PROCESS_RE.test(q) || CLAIM_RE.test(q)) ? precedentSearch(INV, q, tk, history) : Promise.resolve(null);
  // Brain 1
  const p = await plan(tk ? `${q}\nTicket subject: ${tk.meta.subject}\nLatest client message: ${one(tk.lastClient, 500)}` : q, history);
  const mod = module || p.module;
  const lastUser = history.filter(m => m.role === 'user').slice(-1).map(m => m.content).join(' ');
  const ts0 = Date.now();
  const [local, cases, ups] = await Promise.all([
    searchLocal([p.search, q, ...p.alt, lastUser ? one(lastUser, 200) : ''].concat(tk ? [tk.meta.subject, one(tk.lastClient, 300)] : [], multi ? related.flatMap(r => [r.meta.subject, one(r.lastClient, 300)]) : []).filter(Boolean), { module: multi ? '' : mod, limit: multi ? 18 : 11, maxChars: multi ? 26000 : 18000 }), // Batch 280: each ticket's own subject and words are searched too
    useHistory ? (depth === 'fast' ? withTimeout(searchCases(p.search + ' ' + q, mod), 6000) : searchCases(p.search + ' ' + q, mod)).catch(() => []) : Promise.resolve([]),
    depth === 'fast' ? withTimeout(relevantUpdates(q + ' ' + p.search), 6000).catch(() => []) : relevantUpdates(q + ' ' + p.search),
  ]);
  const live = tk ? null : await liveSignal(q).catch(() => null);
  msSearch = Date.now() - ts0;
  const tkSrc = tk ? [{ src: 'ticket', id: 'tk' + tk.meta.number, title: `Ticket #${tk.meta.number}: ${tk.meta.subject}`, section: '', module: tk.meta.module || '', text: tk.text }] : [];
  for (const r of related) tkSrc.push({ src: 'ticket', id: 'tk' + r.meta.number, title: multi ? `Ticket #${r.meta.number} (also under review, handle it too): ${r.meta.subject}` : `Related ticket #${r.meta.number} (context the agent pointed to, not the ticket under review): ${r.meta.subject}`, section: '', module: r.meta.module || '', text: String(r.text).slice(0, multi ? 30000 : 7000) });
  if (tk && crm && crm.text) tkSrc.push({ src: 'ticket', id: 'crm', title: `CRM and account history: ${crm.header.account || tk.meta.account || ''}`, section: '', module: '', text: crm.text });
  const liveSrc = live ? [{ src: 'live', id: 'live', title: `${live.count} similar tickets in the last 48 hours`, section: '', module: '',
    text: `${live.count} tickets from ${live.offices || 'several'} offices in the last 48 hours (${live.today} in the last 24 hours) report the same thing. Usually about ${live.usual} such tickets in 48 hours. This may be an ongoing incident.\n` + live.tickets.map(t => `- #${t.number} ${t.subject} (${t.at.slice(0, 16).replace('T', ' ')} UTC, ${t.status})`).join('\n') }] : [];
  const inv = await invP;
  const pattern = await patP;
  if (pattern && pattern.summary) tkSrc.push({ src: 'ticket', id: 'pattern', title: 'The same problem across Adit: other practices now, how this kind of ticket closed before, and whether the fix sent matches (Expert searched Desk)', section: '', module: '', text: pattern.summary });
  if (inv && inv.summary) tkSrc.unshift({ src: 'ticket', id: 'inv', title: 'What Expert looked up itself in Desk, CRM, call and HR records for this question', section: '', module: '', text: inv.summary });
  const rules = (await noteChunks()).filter(c => c.src === 'rule');
  const seen = new Set(); const sources = [];
  for (const c of rules.concat(tkSrc, liveSrc, ups, local, cases)) { const k = c.src + ':' + c.id + ':' + (c.section || ''); if (seen.has(k)) continue; seen.add(k); sources.push(c); }
  let precedent = await precP;
  if (precedent) sources.splice(rules.length, 0, precSource(precedent));
  if (!precedent && sources.length <= rules.length && INV.isConfigured() && (depth !== 'fast' || escalate)) {
    precedent = await precedentSearch(INV, q, tk, history);
    if (precedent) sources.push(precSource(precedent));
  }
  if (sources.length <= rules.length) {
    const v = { answer: { answer: `I could not find this in the Help Center, the support guides or past tickets. Check with your lead or the owning team, and tell ${NAME} the answer with the thumbs down button so it learns.`, steps: [], say: '', checks: [], owner: null, cautions: [], follow_ups: [], confidence: 'low' }, found: false, verified: false, sources: [], plan: p };
    v.logId = await log(email, q, mod, p.intent, mode || 'answer', v, Date.now() - t0);
    return { done: v };
  }
  const counts = { kb: local.filter(c => c.src === 'kb').length, guides: local.filter(c => c.src !== 'kb').length, cases: cases.length, updates: ups.length };
  return { key, tk, tkErr, tnum, related, multi, crm, p, mod, live, rules, inv, pattern, sources, precedent, INV, msTicket, msSearch, counts };
}
const DEFLECT = /\b(search|look (it |them )?up|check) (the |in )?(crm|desk|zoho)\b|check with your (lead|manager|team lead)|ask (your|the) (lead|team lead|manager)\b|could not (find|confirm) (this|it|that)/i;
/** Ticket numbers named in the answer that appear nowhere in what Expert read. */
function auditTickets(out, sources, tk, related) {
  const text = JSON.stringify(out || {});
  const named = [...new Set((text.match(/(?:^|[^\d.#\/=-])#?(\d{6})(?!\d|\.\d)/g) || []).map(x => x.replace(/\D/g, '')))];
  if (!named.length) return [];
  const seen = new Set();
  const add = (t) => (String(t || '').match(/\d{6}/g) || []).forEach(n => seen.add(n));
  for (const c of sources || []) { add(c.text); add(c.title); add(c.number); }
  if (tk) { add(tk.meta && tk.meta.number); add(JSON.stringify(tk.prior || [])); add(JSON.stringify(tk.timeline || [])); }
  for (const r of related || []) add(r.meta && r.meta.number);
  return named.filter(n => !seen.has(n)).slice(0, 10);
}
const PREC_LINE = `The "How Adit's support team handled the same request before" source is what the team actually did for this kind of request. When the Help Center does not cover it, base the answer on it: say plainly what Adit can and cannot do, what the team did, and name the ticket numbers. Never present a guess as a feature.\n`;
const _ctxs = new Map(); // logId -> { at, email, g } (Batch 238)
// Batch 242 (from Aria): Fast answers in seconds (no second check, no wider searches); Thinking runs everything; Auto
// picks Thinking for a ticket or a why / what-to-do question and Fast for a plain how-to.
const THINK_RE = /\b(why|whether|should (we|i|they)|what (to|should) do|how (should|do) (i|we) handle|handle (this|it)|review|properly|root cause|pattern|recurring|again and again|escalat|churn|cancel|complain)\b/i;
function pickDepth(depth, q, hasTicket) {
  if (depth === 'fast' || depth === 'thinking') return depth;
  return hasTicket || THINK_RE.test(q) || PROCESS_RE.test(q) || CLAIM_RE.test(q) ? 'thinking' : 'fast'; // Batch 271: process and permission questions get the full look
}
async function ask({ question, history = [], mode = '', module = '', useHistory = true, email = '', fresh = false, modeLocked = false, reuse = 0, depth = 'auto', lazyReview = false }) {
  const t0 = Date.now();
  const q = clean(question, 1500).trim();
  if (q.length < 3) throw httpError(400, 'Type a question first');
  if (!D.ai || !D.ai.anyConfigured()) throw httpError(503, `${NAME} is not set up yet.`);
  let G = null, reused = false;
  // Batch 238: switching channel (For call / email / chat) reuses what was already found for this question, so only the
  // writing runs again.
  if (reuse) { const c = _ctxs.get(Number(reuse)); if (c && c.email === lc(email) && Date.now() - c.at < 30 * 60000) { G = c.g; reused = true; } }
  const hasTk = !!(D.ticket && pickTickets(q, history, D.ticket).tnum);
  // Auto that chose Fast still looks further when the quick answer comes back empty or weak.
  const escalate = depth !== 'fast' && depth !== 'thinking';
  depth = pickDepth(depth, q, hasTk);
  if (!G) { G = await gather({ q, history, mode, module, useHistory, email, fresh, t0, depth, escalate }); if (G.done) return Object.assign(G.done, { depth }); }
  const { key, tk, tkErr, tnum, related, multi, crm, p, mod, live, rules, INV, pattern } = G;
  let { inv, sources, precedent } = G;
  // Batch 238: the agent no longer has to pick a channel first. A ticket is answered on its own channel (email and web
  // tickets get an email, chats a chat, phone a call script) unless the agent picked another one on purpose with the
  // For call / email / chat buttons; a question with no channel gets a plain answer.
  let modeNote = '';
  const reviewAsk = !!tk && REVIEW_RE.test(q);
  if (reviewAsk && !modeLocked) mode = 'answer';
  if (tk && !reviewAsk && !modeLocked && (!mode || ['call', 'email', 'chat'].includes(mode))) {
    const ch = lc(tk.meta.channel || ''), m2 = /phone|call/.test(ch) ? 'call' : /chat/.test(ch) ? 'chat' : 'email';
    if (mode && m2 !== mode) modeNote = `Answered as ${m2 === 'call' ? 'a call script' : m2 === 'chat' ? 'a chat message' : 'an email'} because ticket #${tk.meta.number} came in by ${tk.meta.channel || 'email'}.`;
    mode = m2;
  }
  if (!mode) mode = 'answer';
  const hist = history.slice(-6).map(m => (m.role === 'user' ? 'Agent: ' : 'Expert: ') + one(m.content, 600)).join('\n');
  // Batch 188: the answer is shaped for where the client is: on a call, on an email ticket, or in a chat.
  const CH = {
    call: 'The client is on a live PHONE CALL with the agent. Make "say" a short spoken talk track the agent reads out: plain friendly sentences, one idea per line, including the questions to ask the caller in the order to ask them, as the agent would say them out loud. No email format, no links read out. T1 does not call back, except to put right something T1 itself missed: if it cannot be finished on this call, the agent says the right team will follow up by email or phone, with no time promised. Order "checks" as what to ask or check while the caller is on the line.',
    email: 'The client wrote a TICKET by EMAIL and the agent is replying. Make "say" a complete, ready to send email. Write it the way a warm, professional support specialist writes in Zoho Desk: greet the client by first name when known ("Hi Kattie,"), else "Hi there,"; one friendly opening sentence that answers or acknowledges (own any delay plainly, no over-apologising); then short paragraphs of one to three sentences, separated by a blank line; when there are several items or steps, a list with each item on its own line starting "- " (or "1." for steps in order); a clear closing sentence on what happens next or an offer to help; then "Best regards," on its own line (Desk adds the agent signature below). Plain words, no jargon, no internal teams, tiers, statuses, Asana or ticket process, no emoji, no em or en dashes. You are writing as Adit Support: never tell the client to contact Adit Support, call the support line or email support, and never say "we can help you request it through Adit Support". When a Help Center article says to contact Adit Support for a change, that request is this ticket: say what we will do or need from them. Mention that the Help Center guide is linked below if a [KB] source fits.',
    chat: 'The client is in a LIVE CHAT. Make "say" 1 to 3 short chat messages separated by a blank line, friendly and direct, each one or two sentences, asking at most one question at a time, ready to paste one after another. Never mention internal teams, tiers or process.',
  };
  const modeLine = CH[mode] ? CH[mode] + ' Keep steps for the agent.' : mode === 'reply' ? 'The agent wants a reply to send the client: make "say" a complete, ready to send message. Write it the way a warm, professional support specialist writes in Zoho Desk: greet the client by first name when known ("Hi Kattie,"), else "Hi there,"; one friendly opening sentence that answers or acknowledges (own any delay plainly, no over-apologising); then short paragraphs of one to three sentences, separated by a blank line; when there are several items or steps, a list with each item on its own line starting "- " (or "1." for steps in order); a clear closing sentence on what happens next or an offer to help; then "Best regards," on its own line (Desk adds the agent signature below). Plain words, no jargon, no internal teams, tiers, statuses, Asana or ticket process, no emoji, no em or en dashes. You are writing as Adit Support: never tell the client to contact Adit Support, call the support line or email support, and never say "we can help you request it through Adit Support". When a Help Center article says to contact Adit Support for a change, that request is this ticket: say what we will do or need from them. Keep steps for the agent.' : mode === 'troubleshoot' ? 'The agent is troubleshooting live: lead with checks in the order to try them, then steps, then when to hand over.' : 'Answer the question directly.';
  const tkLine = tk && depth === 'fast' ? `The agent gave ticket #${tk.meta.number}; its record is the [TICKET] source. This is a QUICK answer for a live call: use the ticket to answer, but do not write the "ticket" review object.
` : tk ? `The agent gave ticket #${tk.meta.number}; its full record (details, every message, internal comments, history and the client's earlier tickets) is the [TICKET] source. Review how the ticket has gone and how to handle it better, and add to the JSON:
"ticket": {"summary": "2 to 4 sentences: what the client needs, what has happened so far, where it stands now", "waiting": "what the client is waiting for right now, or 'nothing'", "sentiment": "calm, confused, frustrated or angry", "stage": "where it is (for example waiting on us, waiting on client, with another team, solved)", "went_well": ["what was handled well"], "improve": ["what could be done better or was missed: slow or missing replies, questions asked twice, a wrong or early transfer, no Help Center link, the same issue in earlier tickets left unsolved"], "next": ["the next best actions for the agent, in order, following the team rules"], "risk": "repeat problem, churn or escalation risk seen in the earlier tickets, or ''", "reply_to": "who the reply goes to (name and role) and in one short clause why, then who to keep posted internally, if anyone", "verdict": "one line a manager reads first: what this ticket really is (a how-to, a defect, a billing or account matter, a complaint), whether it is part of a wider problem, and whether it is being handled right", "findings": [{"title": "one-line headline of the finding", "evidence": "what the record shows: ticket numbers, dates and a short quote of the client's own words", "driver": "the likely cause", "impact": "what it costs the client or Adit if left", "recommendation": "what to do about it", "confidence": "high, medium or low, and on what"}], "cluster": [{"number": "ticket number", "account": "practice", "status": "status", "note": "what is known on it"}], "fix_check": "whether what was sent or done so far matches how this kind of problem was resolved before, one line, or ''", "classification": "if the Desk ticket type, category or module is wrong for what this really is, what it should be, else ''", "actions": [{"kind": "immediate, investigate, process or coaching", "text": "the action", "who": "who takes it (the agent, a named person or team)"}], "repeat": {"same_issue": "how many of this client's tickets in the last 12 months had the same issue (a number, from the earlier tickets)", "same_area": "how many were in the same product area", "note": "one line: is this a repeat, and did the earlier ones get fixed"}, "limits": ["what the data could not show and what would settle it"], "confidence": "high, medium or low overall"}.
ORDER AND LENGTH: write "answer", "steps", "say" and "note" first and the "ticket" object last, and keep the ticket review tight: at most 3 findings, each field one or two sentences, at most 8 cluster rows and 6 actions, so the whole reply fits.
REVIEW LIKE AN ANALYST. Lead with the verdict and the summary, then 1 to 3 findings, most important first; each finding is backed by evidence from the record (ticket numbers, dates, the client's own words quoted briefly) and states its confidence honestly. Use the "same problem across Adit" source: when other practices have the same problem now, say so plainly, treat this ticket as part of that issue, list them in "cluster" and recommend handling them together (one engineering report, not one per ticket); when older cases of this kind closed only after an engineering fix, a reply that sends the client a settings change or self-serve steps is the wrong fix: say so in "fix_check" and the findings. Rank "actions" by impact, confidence and how quickly they can be done: immediate first, then investigate, process (classification, linking, fields) and coaching (what the agent should do differently next time). Put in "limits" anything you could not see. Never repeat patient names, dates of birth, phone numbers or appointment details in any field.
WHO THE REPLY GOES TO. Our client is the practice on the account (the doctor or the office contact), not whoever happens to be the ticket contact. Work out who sent each message: an Adit employee (an @adit.com address, for example a VP or sales person) who forwarded a complaint, or a referral partner or consultant (for example Fortune Management) who wrote on the practice's behalf, is not the client. When a partner or an Adit colleague escalates for a practice, the reply goes to the practice (address the doctor by name, "Hi Dr. Perry,") and speaks to their own experience; the forwarder is kept posted internally (a private note or a message), never as the person the email answers. Never ask the practice to explain again what the forwarded message already says. Put this in "reply_to" and write "say" to that person, and tell the agent in the steps to check the To field before sending.
ACT FIRST, THEN REPLY. A reply that only acknowledges ("we will bring this to the relevant team", "we are looking into it", "we will come back to you") shows the client nothing happened. When the fix needs another team or person, the steps come first: contact that team or the named person (from the team rules, the CRM owners or the ticket history) and get the outcome. Then "say" is the reply sent AFTER that, stating what was actually arranged: who now handles it (by name and role), what they will do, and what happens next. When the outcome is not confirmed yet, write the reply as it will read once confirmed, mark the parts to confirm in [square brackets], and say in the steps to send it only after confirming. Example of the right shape: "Hi Dr. Perry, We came to know about the inconvenience you have had during your onboarding, and I am sorry about that. I have checked with our onboarding team, and Tyler Roden, our Lead Onboarding Specialist, will handle your account from here. He will reach out to you shortly to pick up where we left off. If anything else comes up, just reply here and I will take care of it."
ONBOARDING. While the deal is in onboarding (deal stage Onboarding or a tech OB stage), problems with the onboarding or the onboarding specialist belong to the Tech OB team, not the CSM or the escalation manager: the agent checks with the Tech OB team (Tech OB Manager Tanya Garrison for a change of onboarding specialist) and the reply names the specialist who now handles it.
When the client's earlier tickets (or a related ticket the agent points to) found the cause of the same kind of problem, connect them: say plainly whether this looks like the same cause, name that ticket, and base the steps and the reply on that finding instead of generic checks (for example opt-out or phone number checks do not explain a message that arrived days late). The "say" never asks the client to do the agent's own checks in Adit (delivery status, logs, settings, sync); ask the client only for what only the office knows. A related ticket is context: keep reviewing the main ticket.
The "CRM and account history" source shows who this client is (live from the CRM: when it differs from the Desk copy of the stage, CSM or onboarding owner on the ticket, the CRM is right): deal stage, CSM and onboarding owner, escalation, account risk, contract end, the written account analysis (health, mood, recurring issues, open items, serious findings), first contact resolution and CSAT. Use it to judge tone and urgency and the churn or escalation risk (an escalated, at-risk or near-renewal account, or one with the same issue raised many times, needs a faster, more careful reply and a heads-up to the CSM in the next steps), and mention the relevant facts in the summary and risk. Escalations, cancellations and port-outs still go to the account CSM or the escalation manager.
When the record carries Aria's account thesis, use it: who decides and how to approach them sets "reply_to" and the tone (for example talk to the doctor directly, respect stated availability), its next steps and the promises Adit has not yet kept belong in the steps when they bear on this ticket, and never contradict them without saying why.
Base "say" on the client's latest message and what was already said. Lines marked [Attached file ...] hold the content of files the client or an agent attached (PDFs, letters, forms, spreadsheets); read them and use their details. Screenshots and files in private notes are what agents found. Lines marked [Screenshot N ...] are what the client's screenshots show: treat them as examples the client already sent, use their details, and never ask for a screenshot or example the client already gave. Do not ask again for what the client already gave, acknowledge any wait, and if the same problem came back, say so and own it. Earlier tickets of this client on the same topic matter.
` : (tkErr ? `The agent mentioned ticket #${tnum} but it could not be loaded (${tkErr}). Answer from the question alone and say the ticket could not be read.
` : '');
  // Batch 274: the long ticket review is written only when the agent opens it (lazyReview, from the Expert page).
  const lazy = !!(lazyReview && tk && depth !== 'fast');
  const tkLineAns = lazy ? tkLine.split('\n').filter(l => !/^"ticket": \{|^ORDER AND LENGTH|^REVIEW LIKE AN ANALYST/.test(l)).join('\n').replace('Review how the ticket has gone and how to handle it better, and add to the JSON:', 'Use it to answer. Do not write the "ticket" review object; it is written separately when the agent opens it.') : tkLine;
  const invLine = inv && inv.summary ? `The "What Expert looked up itself" source holds facts ${NAME} already found in Desk, CRM, call and HR records for this question (the account, its deal, owners, other tickets and calls). Use them directly in the answer, steps and note, naming the account and the facts, and point out its MISMATCHES when they matter. Never tell the agent to search the CRM or Desk for something listed there; only ask the agent to check what it lists under NOT FOUND.\n` : '';
  const pasteLine = hist ? 'When the agent\'s latest message reads like the client\'s own words pasted in (first person, from the office, no question to you), it is the client\'s latest reply in this conversation: give the next step and the next reply from everything said so far, never start over or repeat earlier steps.\n' : '';
  const privLine = 'Never write a client\'s or patient\'s email address or phone number, or a patient\'s name, date of birth or appointment details, in any field, even when the sources show them; say "see the ticket" instead.\n';
  // Batch 271: answers say plainly when no ticket, deal or account was checked, and ask for one.
  const acctChecked = !!tk || !!(inv && inv.summary && !/ACCOUNT:\s*(not found|n\/a|none|unknown)/i.test(inv.summary));
  const multiLine = multi && tk ? `SEVERAL TICKETS: the agent asks about tickets #${tk.meta.number} and ${related.map(r => '#' + r.meta.number).join(', ')}. Handle EACH one. "reply" is the message to the agent covering all of them. In "replies" give, for each ticket in turn, the client reply (label "#<number> client reply") and the private note (label "#<number> internal note"). Say how they link (the same client, one call for both).\n` : '';
  const reviewLine = (multi ? multiLine : '') + (reviewAsk ? 'LEAD REVIEW: a lead is asking how this ticket was handled and how to handle it better. Follow the brief rules for a review of how a ticket was handled.\n' : '');
  const scopeLine = reviewLine + (acctChecked ? '' : 'NO ACCOUNT WAS CHECKED: the agent gave no ticket number, deal or account that Expert could read, so this is a general answer.\n');
  // Batch 273: a quick answer for a live call writes only what the agent reads first.
  const fastLine = depth === 'fast' ? 'QUICK ANSWER FOR A LIVE CALL: write the brief, "answer", up to 4 "steps" and "say"; leave "note", "checks", "cautions", "follow_ups" and "basis" empty and keep everything short.\n' : '';
  const mkUser = (full) => `${fastLine}${scopeLine}${hist ? 'Conversation so far:\n' + hist + '\n\n' : ''}${full ? tkLine : tkLineAns}${invLine}${precedent ? PREC_LINE : ''}${pasteLine}${privLine}${modeLine}\nModule (best guess): ${mod || 'unknown'}. Intent: ${p.intent}.\nQuestion: ${q}\n\nSources:\n${ctxOf(sources)}`;
  let user = mkUser();
  // Brain 2
  const tw0 = Date.now(); let msRetry = 0, msCheck = 0;
  let r2 = await D.ai.bestJSON({ system: EXPERT_SYS, user, maxTokens: tk && depth !== 'fast' && (!lazy || multi) ? 12000 : depth === 'fast' ? 3500 : tk ? 8000 : 5000, feature: 'analyze', timeoutMs: tk ? 170000 : 120000, temperature: 0 });
  let j = r2.json || {};
  const msWrite = Date.now() - tw0;
  // Batch 238: a weak answer (not in the sources, or low confidence) gets one more try with how the team solved it before.
  if (!reused && !precedent && (depth !== 'fast' || escalate) && (j.found === false || lc(j.confidence) === 'low') && INV && INV.isConfigured()) {
    const tr0 = Date.now();
    const pv = await precedentSearch(INV, q, tk, history);
    if (pv) {
      precedent = pv; sources.splice(rules.length, 0, precSource(pv)); user = mkUser();
      try { const r3 = await D.ai.bestJSON({ system: EXPERT_SYS, user, maxTokens: tk && depth !== 'fast' && (!lazy || multi) ? 12000 : depth === 'fast' ? 3500 : tk ? 8000 : 5000, feature: 'analyze', timeoutMs: tk ? 170000 : 120000, temperature: 0 }); if (r3 && r3.json) { r2 = r3; j = r3.json; } } catch (e) { console.warn('expert retry:', e.message); }
    }
    msRetry = Date.now() - tr0;
  }
  let out = shape(j);
  const noteKeep = out.note;
  const ticketReview = tk ? shapeTicket(j.ticket) : null;
  const used = Array.isArray(j.sources) ? j.sources.map(n => Number(String(n).replace(/\D/g, ''))).filter(n => n >= 1 && n <= sources.length) : [];
  const shareN = Number(j.share) || 0; const share = shareN >= 1 && shareN <= sources.length && sources[shareN - 1].src === 'kb' && sources[shareN - 1].url ? { title: sources[shareN - 1].title, url: sources[shareN - 1].url } : null;
  let found = j.found !== false, verified = false, review = null;
  // Brain 3: the other provider checks the draft when there is one (not in Fast)
  const tc0 = Date.now();
  if (found && out.answer && depth !== 'fast') {
    const pv = providers();
    const draft = JSON.stringify({ brief: out.brief, answer: out.answer, steps: out.steps, say: out.say, checks: out.checks, owner: out.owner, cautions: out.cautions });
    const cu = `Question: ${q}\n\nSources:\n${ctxOf(sources)}\n\nDraft answer:\n${draft}`;
    try {
      let cj;
      if (pv.openai && r2.provider === 'anthropic') cj = (await withTimeout(D.ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: CHECK_SYS }, { role: 'user', content: cu }], maxTokens: 5000, temperature: 0.1, timeoutMs: 45000 }), 50000)).json;
      else cj = (await withTimeout(D.ai.bestJSON({ system: CHECK_SYS, user: cu, maxTokens: 5000, timeoutMs: 60000, temperature: 0 }), 65000)).json;
      if (cj && (cj.verdict === 'fixed' || cj.verdict === 'ok')) {
        verified = true;
        review = { verdict: cj.verdict, issues: arr(cj.issues, 4, 200) };
        if (cj.verdict === 'fixed' && cj.answer) { const fixed = shape({ ...cj, follow_ups: out.follow_ups }); out = { ...fixed, brief: fixed.brief || out.brief, follow_ups: out.follow_ups, basis: out.basis }; }
        else if (cj.confidence && ['high', 'medium', 'low'].includes(cj.confidence)) out.confidence = cj.confidence;
      }
    } catch (e) { console.warn('expert check:', e.message); }
  }
  msCheck = Date.now() - tc0;
  // Batch 244 (from Aria's reasoning panel): each step Expert took, how long it took and what it found.
  const buildTrace = () => reused ? [{ step: 'Used what was already found for this question', ms: 0 }, { step: 'Wrote it for the new channel', ms: msWrite }] : [
    { step: 'Picked ' + depth + (depth === 'fast' ? ' (no wider searches, no second check)' : ' (full review)'), ms: 0 },
    tk ? { step: `Read ticket #${tk.meta.number}: ${tk.msgCount || 0} messages, ${tk.commentCount || 0} internal notes, ${(tk.prior || []).length} earlier tickets`, ms: G.msTicket || 0 } : null,
    tk ? { step: crm ? 'Read the CRM record' + (crm.thesis ? " and Aria's account thesis" : '') : 'No CRM record found for the ticket account', ms: 0 } : null,
    inv && !inv.reused ? { step: `Looked up the account in Desk and CRM (${(inv.steps || []).length} lookups)`, ms: inv.ms || 0 } : inv ? { step: 'Reused the account lookup from earlier in this conversation', ms: 0 } : null,
    pattern ? { step: `Checked other practices and past cases (${(pattern.steps || []).length} lookups)`, ms: pattern.ms || 0 } : null,
    { step: G.counts ? `Searched the Help Center, guides and solved cases: ${G.counts.kb} articles, ${G.counts.guides} guide or rule sections, ${G.counts.cases} solved cases, ${G.counts.updates} updates` : 'Searched the Help Center, guides and solved cases', ms: G.msSearch || 0 },
    precedent ? { step: `Searched how the team solved it before (${(precedent.steps || []).length} lookups)`, ms: precedent.ms || msRetry } : null,
    { step: 'Wrote the answer', ms: msWrite },
    depth !== 'fast' && found ? { step: verified ? 'A second AI checked it against the sources' + (review && review.verdict === 'fixed' ? ' and corrected it' : '') : 'The second check did not finish', ms: msCheck } : null,
  ].filter(Boolean);
  // Last guard: what goes to the client never carries internal process (teams, tiers, statuses, reviewers).
  if (out.say && INTERNAL.test(out.say)) out.say = await genericSay(out.say, q).catch(() => out.say);
  // Batch 241 (from Aria): every ticket number the answer names must be one Expert actually read; the rest are flagged.
  const unverified = auditTickets(out, sources, tk, related);
  // An answer that hands the work back ("search the CRM", "check with your lead") is a gap to fix, like a not found.
  const gap = !found ? 'not found' : DEFLECT.test([out.answer].concat(out.steps || []).join(' ')) ? 'handed the lookup back to the agent' : (lc(out.confidence) === 'low' ? 'low confidence' : '');
  const list = (used.length ? used.map(n => sources[n - 1]) : sources.filter(c => c.src !== 'rule').slice(0, 4)).filter(Boolean);
  if (ticketReview) out.ticket = ticketReview;
  if (!out.note && noteKeep) out.note = noteKeep;
  const v = { reviewLater: lazy, scope: acctChecked ? 'account' : 'general', mode, modeNote, answer: out, found, verified, review, share, live, ticket: tk ? { meta: tk.meta, prior: tk.prior, timeline: tk.timeline, msgCount: tk.msgCount, commentCount: tk.commentCount, images: tk.images || 0, imageInfo: tk.imageInfo || null, crm: crm ? crm.facts : null, related: related.map(r => ({ number: r.meta.number, subject: r.meta.subject, status: r.meta.status })) } : (tkErr ? { error: tkErr, number: tnum } : null), plan: { module: mod, intent: p.intent }, sources: list.filter(c => c.src !== 'rule' && c.src !== 'live' && c.src !== 'ticket').map(c => srcOut(c)), rulesUsed: list.filter(c => c.src === 'rule').map(c => c.title), provider: r2.provider,
    investigation: inv ? { summary: inv.summary, steps: inv.steps || [], ms: inv.ms, reused: !!inv.reused } : null,
    precedent: precedent ? { summary: precedent.summary, steps: precedent.steps || [], ms: precedent.ms } : null,
    pattern: pattern ? { summary: pattern.summary, steps: pattern.steps || [], ms: pattern.ms } : null, rewritten: reused, unverified, gap, depth, trace: buildTrace() };
  v.logId = await log(email, q, mod, p.intent, mode, v, Date.now() - t0);
  v.ms = Date.now() - t0;
  if (v.gap && v.gap !== 'low confidence' && !reused && depth !== 'fast' && D.onGap) { try { D.onGap({ logId: v.logId, email, question: q, gap: v.gap, answer: out.answer, ticket: tk ? tk.meta.number : '' }); } catch (e) { /* never blocks the answer */ } }
  if (v.logId) { _ctxs.set(v.logId, { at: Date.now(), email: lc(email), g: Object.assign({}, G, { inv, sources, precedent }), reviewUser: lazy ? mkUser(true) : null }); if (_ctxs.size > 150) _ctxs.delete(_ctxs.keys().next().value); }
  if (!history.length && !live && !tk && !reused) { _cache.set(key, { at: Date.now(), v }); if (_cache.size > 200) _cache.delete(_cache.keys().next().value); }
  return v;
}
// Batch 274: Expert learns team rules from how tickets were actually handled: reviewer decisions on T1 transfers, AI and
// VoIP ticket audits, triage lessons and agents' corrections to Expert's answers. Only patterns that several consistent
// decisions back become rules; each new rule names its evidence and can be switched off on the Rules page.
const LEARN_SYS = `You write team rules for ${NAME}, the assistant for Adit's T1 customer support agents (Adit is a practice platform for dental, orthodontic, optometry and chiropractic offices). You get the existing rules and a list of real decisions: reviewers ruling whether a T1 transfer to another team was right, audits of whether T1 could have handled an AI or VoIP ticket, triage lessons, and agents' corrections to the assistant's answers.
Find what the decisions teach that the existing rules do not already say. A new rule needs at least 3 decisions that agree and none that clearly disagree. Write it as a rule an agent can act on: the kind of request, who handles it (T1 or the named team), what to do or say, and the exception if the decisions show one. Use the team names exactly as the decisions write them. T1 never moves a ticket itself: write every handover as "set Pending Review - T1 for <team>", never "escalate to". Never invent a team, person, policy, price or timeline. Never repeat or reword an existing rule; if the decisions contradict an existing rule, report it under "conflicts" instead.
Return JSON {"rules": [{"title": "short title, under 70 characters", "body": "2 to 4 plain sentences", "module": "the product area or Process", "evidence": ["ticket numbers"], "count": number of decisions behind it}], "conflicts": [{"rule": "existing rule title", "why": "what the decisions show", "evidence": ["ticket numbers"]}]}. At most 12 rules, strongest first. No em dashes.`;
async function learnRules({ days = 120, by = 'system', dry = false } = {}) {
  const since = `datetime('now', '-${Math.max(7, Math.min(365, Number(days) || 120))} days')`;
  const ev = [];
  const q = async (sql, map) => { try { (await all(sql)).forEach(r => { const l = map(r); if (l) ev.push(l); }); } catch (e) { /* table not there */ } };
  await q(`SELECT ticket_number, subject, to_team, verdict, severity, comment FROM tr_reviews WHERE reviewed_at >= ${since} AND verdict IN ('good','invalid') AND COALESCE(voided,0) = 0 ORDER BY reviewed_at DESC LIMIT 600`,
    r => `TRANSFER #${r.ticket_number || '?'} | ${snip(r.subject, 110)} | to ${r.to_team || '?'} | ${r.verdict === 'good' ? 'right transfer' : 'invalid, T1 should handle'}${r.comment ? ' | reviewer: ' + snip(r.comment, 220) : ''}`);
  await q(`SELECT ticket_id, topic, verdict, reason FROM topic_audits WHERE at >= ${since} ORDER BY at DESC LIMIT 300`,
    r => r.reason ? `AUDIT ${r.topic || ''} ticket ${r.ticket_id} | ${r.verdict === 'could_handle' ? 'T1 could have handled it' : r.verdict === 'right_transfer' ? 'right to transfer' : r.verdict} | ${snip(r.reason, 220)}` : null);
  await q(`SELECT number, reviewer_verdict, comment, lesson FROM expert_triage_lessons WHERE status = 'active' AND created_at >= ${since} ORDER BY id DESC LIMIT 200`,
    r => (r.lesson || r.comment) ? `TRIAGE #${r.number || '?'} | reviewer: ${r.reviewer_verdict || ''} | ${snip(r.lesson || r.comment, 260)}` : null);
  await q(`SELECT f.comment, f.correction, l.question FROM expert_feedback f LEFT JOIN expert_log l ON l.id = f.log_id WHERE f.vote < 0 AND f.created_at >= ${since} AND (COALESCE(f.correction,'') != '' OR COALESCE(f.comment,'') != '') ORDER BY f.id DESC LIMIT 200`,
    r => `CORRECTION | question: ${snip(r.question, 160)} | agent said: ${snip(r.correction || r.comment, 260)}`);
  if (ev.length < 3) return { added: [], conflicts: [], evidence: ev.length, note: 'Not enough decisions to learn from yet' };
  const existing = await all(`SELECT title, body FROM expert_notes WHERE kind = 'rule' AND status = 'active'`);
  const have = new Set(existing.map(x => lc(x.title)));
  // Read in batches so each request stays small; rules found in one batch are passed on so the next does not repeat them.
  const found = [], conf = [], errs = [];
  for (let i = 0; i < ev.length && i < 720; i += 180) {
    const part = ev.slice(i, i + 180);
    const user = `Existing rules:\n${existing.map((r, k) => `${k + 1}. ${r.title}: ${snip(r.body, 260)}`).concat(found.map((r, k) => `${existing.length + k + 1}. ${r.title}: ${snip(r.body, 200)}`)).join('\n')}\n\nDecisions (${part.length}, newest first):\n${part.join('\n').slice(0, 30000)}`;
    try {
      const r = await D.ai.bestJSON({ system: LEARN_SYS, user, maxTokens: 4000, feature: 'analyze', timeoutMs: 120000, temperature: 0 });
      const j = (r && r.json) || {};
      (Array.isArray(j.rules) ? j.rules : []).forEach(x => { if (x && x.title && x.body && Number(x.count || 0) >= 3 && Array.isArray(x.evidence) && x.evidence.length && !have.has(lc(x.title)) && !found.some(f => lc(f.title) === lc(x.title))) found.push(x); });
      (Array.isArray(j.conflicts) ? j.conflicts : []).forEach(c => conf.push(c));
    } catch (e) { errs.push(e.message); console.warn('expert learn batch:', e.message); }
  }
  if (!found.length && errs.length) throw httpError(502, 'Could not read the decisions: ' + errs[0]);
  // Batch 275: one last pass drops candidates that repeat an existing rule (or each other) and merges the rest.
  let rules = found;
  if (found.length) {
    try {
      const cu = `Existing rules:\n${existing.map((r, k) => `${k + 1}. ${r.title}: ${snip(r.body, 300)}`).join('\n')}\n\nCandidate rules:\n${JSON.stringify(found.map(x => ({ title: x.title, body: x.body, module: x.module, evidence: x.evidence, count: x.count })))}`;
      const r2 = await D.ai.bestJSON({ system: `You tidy candidate team rules for ${NAME}. Drop every candidate that says the same as an existing rule, even in other words. Merge candidates that say the same thing into one (add their counts, keep their evidence). Keep the rest as they are, but write every handover as "set Pending Review - T1 for <team>". Never add facts. Return JSON {"rules": [{"title": "", "body": "", "module": "", "evidence": [], "count": 0}]}. No em dashes.`, user: cu, maxTokens: 4000, feature: 'analyze', timeoutMs: 90000, temperature: 0 });
      if (r2 && r2.json && Array.isArray(r2.json.rules)) rules = r2.json.rules.filter(x => x && x.title && x.body && Number(x.count || 0) >= 3 && Array.isArray(x.evidence) && x.evidence.length && !have.has(lc(x.title)));
    } catch (e) { console.warn('expert learn tidy:', e.message); }
  }
  const j = { conflicts: conf };
  rules = rules.slice(0, 12);
  const added = [];
  for (const x of rules) {
    const evid = x.evidence.slice(0, 5).map(n => String(n).replace(/[^\d]/g, '')).filter(Boolean);
    const body = `${clean(x.body, 900).trim()} (Learned from ${Number(x.count)} reviewer decisions${evid.length ? ', for example #' + evid.join(', #') : ''}.)`;
    if (!dry) await saveNote(null, { title: x.title, body, module: x.module || 'Process', kind: 'rule', source: 'learned' }, by);
    added.push({ title: one(x.title, 160), body, module: one(x.module || 'Process', 80) });
  }
  const conflicts = (Array.isArray(j.conflicts) ? j.conflicts : []).slice(0, 6).map(c => ({ rule: one(c.rule, 160), why: one(c.why, 400), evidence: arr(c.evidence, 5, 20) }));
  if (!dry) await setState('learn_last', JSON.stringify({ at: new Date().toISOString(), added: added.map(a => a.title), conflicts, evidence: ev.length }));
  return { added, conflicts, evidence: ev.length };
}
async function learnStatus() { try { return JSON.parse(await getState('learn_last', 'null')); } catch (e) { return null; } }
// Batch 274: write the ticket review for an answer that was given without it.
async function reviewLater({ logId, email }) {
  const c = _ctxs.get(Number(logId));
  if (!c || c.email !== lc(email) || !c.reviewUser) throw httpError(404, 'This answer is too old to review. Ask again.');
  if (c.review) return c.review;
  const r = await D.ai.bestJSON({ system: EXPERT_SYS, user: c.reviewUser + '\n\nThe answer was already given. Now return ONLY {"ticket": {...}} with the ticket review described above.', maxTokens: 8000, feature: 'analyze', timeoutMs: 150000, temperature: 0 });
  c.review = shapeTicket(r && r.json && r.json.ticket);
  if (!c.review) throw httpError(502, 'Could not write the review. Try again.');
  return c.review;
}
function srcOut(c) {
  const base = { type: c.src, title: c.title, module: c.module || '' };
  if (c.src === 'kb') return { ...base, id: c.id, section: c.section, url: c.url, kind: c.kind };
  if (c.src === 'guide') return { ...base, doc: c.doc, id: c.id, section: c.section };
  if (c.src === 'case') return { ...base, number: c.number, at: c.at, channel: c.channel, snippet: one(c.text.split('What fixed it: ')[1] || '', 220) };
  if (c.src === 'call') return { ...base, at: String(c.at || '').slice(0, 10), snippet: one(c.text, 220) };
  if (c.src === 'update') return { ...base, at: c.at, snippet: one(c.text, 220) };
  if (c.src === 'review') return { ...base, number: c.number || '', at: c.at, snippet: one(c.text, 240) };
  if (c.src === 'learned') return { ...base, at: c.at, snippet: one(c.text.split('helpful: ')[1] || c.text, 220) };
  return { ...base, id: c.id, snippet: one(c.text, 220) };
}
async function log(email, q, mod, intent, mode, v, ms) {
  try {
    const r = await run(`INSERT INTO expert_log (email, question, module, intent, mode, confidence, found, verified, sources_json, answer_json, ms, gap) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [lc(email), q.slice(0, 1500), mod || '', intent || '', mode, v.answer.confidence, v.found ? 1 : 0, v.verified ? 1 : 0, JSON.stringify((v.sources || []).map(s => ({ type: s.type, title: s.title, number: s.number || '' }))), JSON.stringify(v.answer).slice(0, 8000), ms, v.gap || (v.found ? null : 'not found')]);
    return r.lastID;
  } catch (e) { return null; }
}

// ── Feedback and teaching ───────────────────────────────────────────────
async function feedback({ logId, vote, comment, correction, email }) {
  const id = Number(logId); if (!id) throw httpError(400, 'Missing answer id');
  const row = await get(`SELECT id, email FROM expert_log WHERE id = ?`, [id]); if (!row) throw httpError(404, 'Answer not found');
  const v = Number(vote) > 0 ? 1 : -1;
  await run(`UPDATE expert_log SET vote = ? WHERE id = ?`, [v, id]);
  if (v < 0 || clean(correction, 10).trim() || clean(comment, 10).trim())
    await run(`INSERT INTO expert_feedback (log_id, email, vote, comment, correction) VALUES (?,?,?,?,?)`, [id, lc(email), v, clean(comment, 800).trim() || null, clean(correction, 3000).trim() || null]);
  return { ok: true };
}
async function rules(includeOff) { return all(`SELECT id, title, body, module, status, source, updated_at FROM expert_notes WHERE kind = 'rule' ${includeOff ? '' : "AND status = 'active'"} ORDER BY status, id`); }
async function notes() { return all(`SELECT id, title, body, module, kind, status, source, created_by, created_at, updated_at FROM expert_notes ORDER BY status, kind DESC, id DESC`); }
async function saveNote(id, b, by) {
  const title = one(b.title, 160), body = clean(b.body, 4000).trim();
  if (title.length < 3 || body.length < 10) throw httpError(400, 'Give the note a title and a few sentences');
  const kind = b.kind === 'rule' ? 'rule' : 'note', status = b.status === 'off' ? 'off' : 'active', module = one(b.module, 80) || null;
  if (id) await run(`UPDATE expert_notes SET title = ?, body = ?, module = ?, kind = ?, status = ?, updated_at = datetime('now') WHERE id = ?`, [title, body, module, kind, status, Number(id)]);
  else { const r = await run(`INSERT INTO expert_notes (title, body, module, kind, status, source, created_by) VALUES (?,?,?,?,?,?,?)`, [title, body, module, kind, status, b.source || 'manual', lc(by)]); id = r.lastID; }
  bust(); _cache.clear();
  return id;
}
async function deleteNote(id) { await run(`DELETE FROM expert_notes WHERE id = ?`, [Number(id)]); bust(); _cache.clear(); }
async function feedbackQueue() {
  return all(`SELECT f.id, f.log_id, f.email, f.vote, f.comment, f.correction, f.status, f.created_at, l.question, l.answer_json, l.module FROM expert_feedback f LEFT JOIN expert_log l ON l.id = f.log_id WHERE f.status = 'open' ORDER BY f.id DESC LIMIT 100`)
    .then(rows => rows.map(r => { let a = null; try { a = JSON.parse(r.answer_json); } catch (e) {} return { id: r.id, logId: r.log_id, email: r.email, vote: r.vote, comment: r.comment, correction: r.correction, at: r.created_at, question: r.question, module: r.module, answer: a ? a.answer : '' }; }));
}
async function handleFeedback(id, { action, title, body, module }, by) {
  const f = await get(`SELECT * FROM expert_feedback WHERE id = ?`, [Number(id)]); if (!f) throw httpError(404, 'Not found');
  let noteId = null;
  if (action === 'apply') noteId = await saveNote(null, { title: title || 'Correction', body: body || f.correction || f.comment, module, kind: 'note', source: 'feedback' }, by);
  await run(`UPDATE expert_feedback SET status = ?, handled_by = ?, handled_at = datetime('now') WHERE id = ?`, [action === 'apply' ? 'applied' : 'dismissed', lc(by), f.id]);
  return { noteId };
}
async function insights() {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
  const tot = await get(`SELECT COUNT(*) AS n, SUM(found) AS found, SUM(verified) AS verified, SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS down, AVG(ms) AS ms, COUNT(DISTINCT email) AS people FROM expert_log WHERE created_at >= ?`, [since]);
  const mods = await all(`SELECT module, COUNT(*) AS n FROM expert_log WHERE created_at >= ? AND module != '' GROUP BY module ORDER BY n DESC LIMIT 8`, [since]);
  const gaps = await all(`SELECT id, question, module, confidence, found, gap, created_at FROM expert_log WHERE created_at >= ? AND (found = 0 OR confidence = 'low' OR vote = -1 OR gap IS NOT NULL) ORDER BY id DESC LIMIT 40`, [since]);
  const calls = await get(`SELECT COUNT(*) AS n, MAX(at) AS last FROM expert_calls`).catch(() => ({ n: 0 }));
  const rv = await reviewChunks(); const learned = (await get(`SELECT COUNT(*) AS n FROM expert_log WHERE vote = 1 AND found = 1`).catch(() => ({ n: 0 }))).n || 0;
  return { last30: { asked: tot.n || 0, found: tot.found || 0, verified: tot.verified || 0, up: tot.up || 0, down: tot.down || 0, avgSec: tot.ms ? Math.round(tot.ms / 100) / 10 : null, people: tot.people || 0 }, modules: mods, gaps,
    knowledge: { updates: (await updateChunks()).length, articles: kb().raw.articles.filter(a => a.kind).length, modules: kb().modules.length, guides: guideChunks().length ? 2 : 0, notes: (await get(`SELECT COUNT(*) AS n FROM expert_notes WHERE status = 'active'`)).n, calls: calls.n || 0, callsLast: calls.last || null, reviews: rv.filter(x => x.src === 'review').length, qa: rv.filter(x => x.src === 'qa').length, learned, cases: D.query || D.kb ? 'live' : 'off' } };
}
async function popular() {
  const since = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
  return (await all(`SELECT question, COUNT(*) AS n FROM expert_log WHERE created_at >= ? AND found = 1 AND (vote IS NULL OR vote = 1) AND length(question) < 160 GROUP BY lower(question) ORDER BY n DESC, MAX(id) DESC LIMIT 6`, [since])).map(r => r.question);
}
function meta() { const st = kbLive.state(); return { name: NAME, modules: kb().modules, articles: kb().raw.articles.filter(a => a.kind).length, kbLive: !!kb().raw.live, kbSyncedAt: st.ok ? st.at : null }; }
function kbStatus() { return Object.assign({ live: !!kb().raw.live, articles: kb().raw.articles.filter(a => a.kind).length }, kbLive.state()); }

async function recentCalls(since, limit = 400) { return all(`SELECT unit_key, at, product, text FROM expert_calls WHERE at >= ? ORDER BY at DESC LIMIT ?`, [since, limit]); }
async function callCount() { const r = await get(`SELECT COUNT(*) AS n FROM expert_calls`); return r ? r.n : 0; }
module.exports = { reviewLater, learnRules, learnStatus, _thesisBrief: thesisBrief, updatesFor, _pickTickets: pickTickets, crmContext, NAME, syncKb, kbStatus, _updateChunks: updateChunks, _reviewChunks: reviewChunks, _recentCalls: recentCalls, _callCount: callCount, setDB, setDeps, initSchema, ask, feedback, rules, notes, saveNote, deleteNote, feedbackQueue, handleFeedback, insights, popular, meta, catalog, article, syncCalls, searchLocal, searchCases, bust, _live: liveSignal, _kbChunks: kbChunks, _expand: expand };
