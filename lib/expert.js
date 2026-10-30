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
  ['T1 cannot make outbound calls', 'T1 CS cannot make outbound calls. When a client needs a call back, sending the ticket to VoIP is the correct transfer.', 'Process'],
  ['How T1 hands a ticket to another team', 'T1 never moves a ticket to another team itself. Set the status to Pending Review - T1 and a reviewer moves it to the right team.', 'Process'],
  ['What T1 supports for AI and VoIP', 'T1 handles basic AI support (since 8 Sep 2026) and basic VoIP support (since 12 Oct 2026). The AI support runbook and the VoIP guide say what T1 can finish and when to hand over.', 'Process'],
  ['Anything in the Help Center is done by T1', 'Any support that a Help Center (KB) article covers is performed by T1 CS. T1 completes it with the client and does not transfer it.', 'Process'],
  ['Escalations, cancellations and port-outs go to the CSM', 'Escalations, cancellation requests and number port-out requests go to the CSM of that account or to the escalation manager. T1 does not handle them itself.', 'Process'],
];

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, module TEXT,
    kind TEXT NOT NULL DEFAULT 'note', status TEXT NOT NULL DEFAULT 'active', source TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS expert_log (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, question TEXT, module TEXT, intent TEXT, mode TEXT,
    confidence TEXT, found INTEGER, verified INTEGER, sources_json TEXT, answer_json TEXT, ms INTEGER, vote INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
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
async function syncCalls({ max = 6000 } = {}) {
  if (!D.kb) return { added: 0, note: 'AditKB not configured' };
  const since = await getState('calls_since', '2020-01-01T00:00:00Z');
  let added = 0, last = since;
  for (let off = 0; off < max; off += 300) {
    let rows = [];
    try { rows = await D.kb('unit_summaries', { select: 'unit_key,kind,summary,findings,evidence_to', filters: ['kind:eq:rc_call', 'findings:gt:0', `evidence_to:gt:${since}`], order_by: 'evidence_to', desc: false, limit: 300, offset: off }); }
    catch (e) { console.warn('expert syncCalls:', e.message); break; }
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
    try { const r = await ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature: 0.1, timeoutMs: 20000 }); return r.json; }
    catch (e) { if (!p.claude) throw e; const r = await ai.claudeJSON({ system, user, maxTokens, timeoutMs: 30000 }); return r.json; } // OpenAI down or out of credit
  }
  const r = await ai.bestJSON({ system, user, maxTokens, timeoutMs: 30000 }); return r.json;
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
{"answer": "1 to 3 sentences that directly answer",
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
 "found": true | false}
No em dashes or en dashes.`;
const CHECK_SYS = `You are the second reviewer for ${NAME}, an assistant for Adit's support agents. You get numbered sources and a draft answer. Check every statement, step, setting path, owner and the client wording against the sources.
Remove or correct anything the sources do not support; keep what they support. Make sure team rules ([RULE], [NOTE]) and [UPDATE]s are followed. The "say" text goes to the client: rewrite it to be generic if it mentions any internal team or tier (T1, T2, VoIP team, CSM), ticket status, reviewer, transfer, escalation process, internal tool or rule. Keep the same style: short, plain, no em dashes.
Return JSON {"verdict": "ok" or "fixed", "issues": ["what you changed and why, short"], "answer": "...", "steps": [...], "say": "...", "checks": [...], "owner": {"who": "", "when": ""} or null, "cautions": [...], "confidence": "high" | "medium" | "low"}.`;
function label(c) { return { ticket: 'TICKET', live: 'LIVE', rule: 'RULE', note: 'NOTE', update: 'UPDATE', qa: 'QA', review: 'REVIEW', kb: 'KB', guide: 'GUIDE', case: 'CASE', call: 'CALL', learned: 'LEARNED' }[c.src] || 'SRC'; }
function ctxOf(list) {
  return list.map((c, i) => `[S${i + 1}] [${label(c)}] ${c.src === 'kb' ? c.module + ' > ' + c.title + (c.section ? ' > ' + c.section : '') + (c.url ? ' (' + c.url + ')' : '') : c.src === 'case' ? 'Ticket #' + (c.number || '?') + ' ' + c.title + (c.at ? ', ' + c.at : '') : c.src === 'review' ? c.title + (c.at ? ', ' + c.at : '') : c.title + (c.section ? ' > ' + c.section : '')}\n${c.text}`).join('\n\n');
}
function arr(x, n, m = 300) { return (Array.isArray(x) ? x : []).map(v => one(typeof v === 'string' ? v : JSON.stringify(v), m)).filter(Boolean).slice(0, n); }
function shapeTicket(t) {
  if (!t || typeof t !== 'object') return null;
  return { summary: one(t.summary, 700), waiting: one(t.waiting, 300), sentiment: one(t.sentiment, 40), stage: one(t.stage, 200), went_well: arr(t.went_well, 4, 220), improve: arr(t.improve, 5, 260), next: arr(t.next, 6, 260), risk: one(t.risk, 300) };
}
function shape(j) {
  return { answer: one(j.answer, 900), steps: arr(j.steps, 10, 700), say: clean(j.say, 2400).trim(), note: clean(j.note || '', 3000).trim(), checks: arr(j.checks, 5), owner: j.owner && (j.owner.who || j.owner.when) ? { who: one(j.owner.who, 80), when: one(j.owner.when, 300) } : null,
    cautions: arr(j.cautions, 4), follow_ups: arr(j.follow_ups, 3, 140), confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium' };
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
async function crmContext(number) {
  if (!D.client || !D.client.search || !D.client.profile) return null;
  const sr = await D.client.search('#' + number);
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
  const text = L.join('\n').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
  return { text: text.slice(0, 6000), header: H, facts: { stage: H.stage || '', csm: H.csm || '', ob: H.ob || '', escalation: H.escalation || '', risk: A.risk || '', contractEnd: A.contractEnd ? String(A.contractEnd).slice(0, 10) : '', health: an.available ? (an.health || '') : '', mood: an.mood && an.mood.level || '', fcr: d.fcr && d.fcr.pct != null ? d.fcr.pct : null, csat: d.csat && d.csat.total ? d.csat.pct : null } };
}

async function ask({ question, history = [], mode = 'answer', module = '', useHistory = true, email = '', fresh = false, modeLocked = false }) {
  const t0 = Date.now();
  const q = clean(question, 1500).trim();
  if (q.length < 3) throw httpError(400, 'Type a question first');
  if (!D.ai || !D.ai.anyConfigured()) throw httpError(503, `${NAME} is not set up yet.`);
  const key = crypto.createHash('sha1').update([q, mode, module, useHistory ? 1 : 0].join('|')).digest('hex');
  // Batch 189: a ticket number in the question loads that ticket (never from the answer cache: tickets move on).
  // Batch 191: the ticket stays for the whole conversation. A follow-up without a number keeps the earlier ticket, and a
  // ticket the agent points to as related, previous or similar is read as extra context, not reviewed instead.
  const { tnum, relNums } = pickTickets(q, history, D.ticket);
  let tk = null, tkErr = null, related = [], crm = null;
  if (tnum) {
    const [a, rel, cr] = await Promise.all([
      withTimeout(D.ticket.load(tnum), 45000).then(v => ({ v }), e => ({ e: e.message })),
      Promise.all(relNums.map(n => withTimeout(D.ticket.load(n, { light: true }), 30000).catch(() => null))),
      withTimeout(crmContext(tnum), 25000).catch(() => null),
    ]);
    if (a.v) tk = a.v; else tkErr = a.e;
    related = rel.filter(Boolean); crm = cr;
  }
  if (!tk && !fresh && !history.length && _cache.has(key) && Date.now() - _cache.get(key).at < 10 * 60000) return { ..._cache.get(key).v, cached: true };
  // Batch 192: a ticket is answered on its own channel (email and web tickets get an email, chats a chat, phone a call
  // script) unless the agent picked another channel on purpose with the For call / email / chat buttons.
  let modeNote = '';
  if (tk && !modeLocked && ['call', 'email', 'chat'].includes(mode)) {
    const ch = lc(tk.meta.channel || ''), m2 = /phone|call/.test(ch) ? 'call' : /chat/.test(ch) ? 'chat' : 'email';
    if (m2 !== mode) { modeNote = `Answered as ${m2 === 'call' ? 'a call script' : m2 === 'chat' ? 'a chat message' : 'an email'} because ticket #${tk.meta.number} came in by ${tk.meta.channel || 'email'}.`; mode = m2; }
  }
  // Brain 1
  const p = await plan(tk ? `${q}\nTicket subject: ${tk.meta.subject}\nLatest client message: ${one(tk.lastClient, 500)}` : q, history);
  const mod = module || p.module;
  const lastUser = history.filter(m => m.role === 'user').slice(-1).map(m => m.content).join(' ');
  const [local, cases, ups] = await Promise.all([
    searchLocal([p.search, q, ...p.alt, lastUser ? one(lastUser, 200) : ''], { module: mod, limit: 11 }),
    useHistory ? searchCases(p.search + ' ' + q, mod).catch(() => []) : Promise.resolve([]),
    relevantUpdates(q + ' ' + p.search),
  ]);
  const live = tk ? null : await liveSignal(q).catch(() => null);
  const tkSrc = tk ? [{ src: 'ticket', id: 'tk' + tk.meta.number, title: `Ticket #${tk.meta.number}: ${tk.meta.subject}`, section: '', module: tk.meta.module || '', text: tk.text }] : [];
  for (const r of related) tkSrc.push({ src: 'ticket', id: 'tk' + r.meta.number, title: `Related ticket #${r.meta.number} (context the agent pointed to, not the ticket under review): ${r.meta.subject}`, section: '', module: r.meta.module || '', text: String(r.text).slice(0, 7000) });
  if (tk && crm && crm.text) tkSrc.push({ src: 'ticket', id: 'crm', title: `CRM and account history: ${crm.header.account || tk.meta.account || ''}`, section: '', module: '', text: crm.text });
  const liveSrc = live ? [{ src: 'live', id: 'live', title: `${live.count} similar tickets in the last 48 hours`, section: '', module: '',
    text: `${live.count} tickets from ${live.offices || 'several'} offices in the last 48 hours (${live.today} in the last 24 hours) report the same thing. Usually about ${live.usual} such tickets in 48 hours. This may be an ongoing incident.\n` + live.tickets.map(t => `- #${t.number} ${t.subject} (${t.at.slice(0, 16).replace('T', ' ')} UTC, ${t.status})`).join('\n') }] : [];
  const rules = (await noteChunks()).filter(c => c.src === 'rule');
  const seen = new Set(); const sources = [];
  for (const c of rules.concat(tkSrc, liveSrc, ups, local, cases)) { const k = c.src + ':' + c.id + ':' + (c.section || ''); if (seen.has(k)) continue; seen.add(k); sources.push(c); }
  if (sources.length <= rules.length) {
    const v = { answer: { answer: `I could not find this in the Help Center, the support guides or past tickets. Check with your lead or the owning team, and tell ${NAME} the answer with the thumbs down button so it learns.`, steps: [], say: '', checks: [], owner: null, cautions: [], follow_ups: [], confidence: 'low' }, found: false, verified: false, sources: [], plan: p };
    v.logId = await log(email, q, mod, p.intent, mode, v, Date.now() - t0);
    return v;
  }
  const hist = history.slice(-6).map(m => (m.role === 'user' ? 'Agent: ' : 'Expert: ') + one(m.content, 600)).join('\n');
  // Batch 188: the answer is shaped for where the client is: on a call, on an email ticket, or in a chat.
  const CH = {
    call: 'The client is on a live PHONE CALL with the agent. Make "say" a short spoken talk track the agent reads out: plain friendly sentences, one idea per line, including the questions to ask the caller in the order to ask them, as the agent would say them out loud. No email format, no links read out. T1 cannot call back: if it cannot be finished on this call, the agent says the right team will follow up by email or phone, with no time promised. Order "checks" as what to ask or check while the caller is on the line.',
    email: 'The client wrote a TICKET by EMAIL and the agent is replying. Make "say" a complete, ready to send email: start "Hi there," (or the first name if the question gives it), short paragraphs separated by a blank line, numbered steps the client can follow when useful (each on its own line starting "1.", "2."), mention that the Help Center guide is linked below if a [KB] source fits, and end with "Thanks,". Never mention internal teams, tiers, ticket statuses, reviewers or process.',
    chat: 'The client is in a LIVE CHAT. Make "say" 1 to 3 short chat messages separated by a blank line, friendly and direct, each one or two sentences, asking at most one question at a time, ready to paste one after another. Never mention internal teams, tiers or process.',
  };
  const modeLine = CH[mode] ? CH[mode] + ' Keep steps for the agent.' : mode === 'reply' ? 'The agent wants a reply to send the client: make "say" a complete, ready to send message (greeting, short paragraphs, "Thanks,") that never mentions internal teams, tiers, ticket statuses, reviewers or process, and keep steps for the agent.' : mode === 'troubleshoot' ? 'The agent is troubleshooting live: lead with checks in the order to try them, then steps, then when to hand over.' : 'Answer the question directly.';
  const tkLine = tk ? `The agent gave ticket #${tk.meta.number}; its full record (details, every message, internal comments, history and the client's earlier tickets) is the [TICKET] source. Review how the ticket has gone and how to handle it better, and add to the JSON:
"ticket": {"summary": "2 to 4 sentences: what the client needs, what has happened so far, where it stands now", "waiting": "what the client is waiting for right now, or 'nothing'", "sentiment": "calm, confused, frustrated or angry", "stage": "where it is (for example waiting on us, waiting on client, with another team, solved)", "went_well": ["what was handled well"], "improve": ["what could be done better or was missed: slow or missing replies, questions asked twice, a wrong or early transfer, no Help Center link, the same issue in earlier tickets left unsolved"], "next": ["the next best actions for the agent, in order, following the team rules"], "risk": "repeat problem, churn or escalation risk seen in the earlier tickets, or ''"}.
When the client's earlier tickets (or a related ticket the agent points to) found the cause of the same kind of problem, connect them: say plainly whether this looks like the same cause, name that ticket, and base the steps and the reply on that finding instead of generic checks (for example opt-out or phone number checks do not explain a message that arrived days late). The "say" never asks the client to do the agent's own checks in Adit (delivery status, logs, settings, sync); ask the client only for what only the office knows. A related ticket is context: keep reviewing the main ticket.
The "CRM and account history" source shows who this client is: deal stage, CSM and onboarding owner, escalation, account risk, contract end, the written account analysis (health, mood, recurring issues, open items, serious findings), first contact resolution and CSAT. Use it to judge tone and urgency and the churn or escalation risk (an escalated, at-risk or near-renewal account, or one with the same issue raised many times, needs a faster, more careful reply and a heads-up to the CSM in the next steps), and mention the relevant facts in the summary and risk. Escalations, cancellations and port-outs still go to the account CSM or the escalation manager.
Base "say" on the client's latest message and what was already said. Lines marked [Screenshot N ...] are what the client's screenshots show: treat them as examples the client already sent, use their details, and never ask for a screenshot or example the client already gave. Do not ask again for what the client already gave, acknowledge any wait, and if the same problem came back, say so and own it. Earlier tickets of this client on the same topic matter.
` : (tkErr ? `The agent mentioned ticket #${tnum} but it could not be loaded (${tkErr}). Answer from the question alone and say the ticket could not be read.
` : '');
  const user = `${hist ? 'Conversation so far:\n' + hist + '\n\n' : ''}${tkLine}${modeLine}\nModule (best guess): ${mod || 'unknown'}. Intent: ${p.intent}.\nQuestion: ${q}\n\nSources:\n${ctxOf(sources)}`;
  // Brain 2
  const r2 = await D.ai.bestJSON({ system: EXPERT_SYS, user, maxTokens: tk ? 5000 : 2400, feature: 'analyze', timeoutMs: 120000 });
  const j = r2.json || {};
  let out = shape(j);
  const noteKeep = out.note;
  const ticketReview = tk ? shapeTicket(j.ticket) : null;
  const used = Array.isArray(j.sources) ? j.sources.map(n => Number(String(n).replace(/\D/g, ''))).filter(n => n >= 1 && n <= sources.length) : [];
  const shareN = Number(j.share) || 0; const share = shareN >= 1 && shareN <= sources.length && sources[shareN - 1].src === 'kb' && sources[shareN - 1].url ? { title: sources[shareN - 1].title, url: sources[shareN - 1].url } : null;
  let found = j.found !== false, verified = false, review = null;
  // Brain 3: the other provider checks the draft when there is one
  if (found && out.answer) {
    const pv = providers();
    const draft = JSON.stringify({ answer: out.answer, steps: out.steps, say: out.say, checks: out.checks, owner: out.owner, cautions: out.cautions });
    const cu = `Question: ${q}\n\nSources:\n${ctxOf(sources)}\n\nDraft answer:\n${draft}`;
    try {
      let cj;
      if (pv.openai && r2.provider === 'anthropic') cj = (await withTimeout(D.ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: CHECK_SYS }, { role: 'user', content: cu }], maxTokens: 2600, temperature: 0.1, timeoutMs: 45000 }), 50000)).json;
      else cj = (await withTimeout(D.ai.bestJSON({ system: CHECK_SYS, user: cu, maxTokens: 2600, timeoutMs: 60000 }), 65000)).json;
      if (cj && (cj.verdict === 'fixed' || cj.verdict === 'ok')) {
        verified = true;
        review = { verdict: cj.verdict, issues: arr(cj.issues, 4, 200) };
        if (cj.verdict === 'fixed' && cj.answer) { const fixed = shape({ ...cj, follow_ups: out.follow_ups }); out = { ...fixed, follow_ups: out.follow_ups }; }
        else if (cj.confidence && ['high', 'medium', 'low'].includes(cj.confidence)) out.confidence = cj.confidence;
      }
    } catch (e) { console.warn('expert check:', e.message); }
  }
  // Last guard: what goes to the client never carries internal process (teams, tiers, statuses, reviewers).
  if (out.say && INTERNAL.test(out.say)) out.say = await genericSay(out.say, q).catch(() => out.say);
  const list = (used.length ? used.map(n => sources[n - 1]) : sources.filter(c => c.src !== 'rule').slice(0, 4)).filter(Boolean);
  if (ticketReview) out.ticket = ticketReview;
  if (!out.note && noteKeep) out.note = noteKeep;
  const v = { mode, modeNote, answer: out, found, verified, review, share, live, ticket: tk ? { meta: tk.meta, prior: tk.prior, timeline: tk.timeline, msgCount: tk.msgCount, commentCount: tk.commentCount, images: tk.images || 0, imageInfo: tk.imageInfo || null, crm: crm ? crm.facts : null, related: related.map(r => ({ number: r.meta.number, subject: r.meta.subject, status: r.meta.status })) } : (tkErr ? { error: tkErr, number: tnum } : null), plan: { module: mod, intent: p.intent }, sources: list.filter(c => c.src !== 'rule' && c.src !== 'live' && c.src !== 'ticket').map(c => srcOut(c)), rulesUsed: list.filter(c => c.src === 'rule').map(c => c.title), provider: r2.provider };
  v.logId = await log(email, q, mod, p.intent, mode, v, Date.now() - t0);
  v.ms = Date.now() - t0;
  if (!history.length && !live && !tk) { _cache.set(key, { at: Date.now(), v }); if (_cache.size > 200) _cache.delete(_cache.keys().next().value); }
  return v;
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
    const r = await run(`INSERT INTO expert_log (email, question, module, intent, mode, confidence, found, verified, sources_json, answer_json, ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [lc(email), q.slice(0, 1500), mod || '', intent || '', mode, v.answer.confidence, v.found ? 1 : 0, v.verified ? 1 : 0, JSON.stringify((v.sources || []).map(s => ({ type: s.type, title: s.title, number: s.number || '' }))), JSON.stringify(v.answer).slice(0, 8000), ms]);
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
  const gaps = await all(`SELECT id, question, module, confidence, found, created_at FROM expert_log WHERE created_at >= ? AND (found = 0 OR confidence = 'low' OR vote = -1) ORDER BY id DESC LIMIT 40`, [since]);
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
module.exports = { _pickTickets: pickTickets, crmContext, NAME, syncKb, kbStatus, _updateChunks: updateChunks, _reviewChunks: reviewChunks, _recentCalls: recentCalls, _callCount: callCount, setDB, setDeps, initSchema, ask, feedback, rules, notes, saveNote, deleteNote, feedbackQueue, handleFeedback, insights, popular, meta, catalog, article, syncCalls, searchLocal, searchCases, bust, _live: liveSignal, _kbChunks: kbChunks, _expand: expand };
