'use strict';
/**
 * Batch 182: Adit Expert. One assistant for any Adit product or process question, on any client scenario.
 *
 * What it knows, highest authority first:
 *   1. Team rules and corrections   expert_notes, written by reviewers (and from feedback they approve)
 *   2. Product and process updates  lib/product-updates (newest changes win over older material)
 *   3. Adit Help Center             content/kb/product-kb.json (every help.adit.com article, by module)
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
}
async function getState(k, d) { const r = await get(`SELECT v FROM expert_state WHERE k = ?`, [k]).catch(() => null); return r ? r.v : d; }
async function setState(k, v) { await run(`INSERT INTO expert_state (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, String(v)]); }

// ── Help Center knowledge base ──────────────────────────────────────────
const KB_FILE = path.join(__dirname, '..', 'content', 'kb', 'product-kb.json');
let _kb = null;
function kb() {
  if (_kb) return _kb;
  let raw = { modules: [], articles: [] };
  try { raw = JSON.parse(fs.readFileSync(KB_FILE, 'utf8')); } catch (e) { console.warn('expert: KB not loaded', e.message); }
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
  const rows = await all(`SELECT unit_key, at, product, text FROM expert_calls ORDER BY at DESC LIMIT 6000`).catch(() => []);
  return rows.map(r => ({ src: 'call', id: r.unit_key, title: 'Support call ' + String(r.at || '').slice(0, 10), section: '', module: String(r.product || '').replace(/_/g, ' '), at: r.at, text: r.text }));
}
function guideChunks() {
  try { const d = D.guides.load(); const out = []; for (const doc of Object.values(d)) for (const c of doc.chunks) out.push({ src: 'guide', doc: doc.id, id: c.id, title: c.title, section: c.path || '', module: doc.title, text: c.text }); return out; }
  catch (e) { return []; }
}
async function index() {
  if (_index && Date.now() - _index.at < 10 * 60000) return _index;
  const docs = kbChunks().concat(guideChunks(), await noteChunks(), await callChunks());
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
async function syncCalls({ max = 1500 } = {}) {
  if (!D.kb) return { added: 0, note: 'AditKB not configured' };
  const since = await getState('calls_since', new Date(Date.now() - 90 * 86400e3).toISOString());
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
  await run(`DELETE FROM expert_calls WHERE at < ?`, [new Date(Date.now() - 180 * 86400e3).toISOString()]).catch(() => {});
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
  if (p.openai) { const r = await ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature: 0.1, timeoutMs: 20000 }); return r.json; }
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
Answer the agent's question for the client scenario they describe, using ONLY the numbered sources. Authority, highest first: [RULE] and [NOTE] team rules, [UPDATE] product and process updates, [KB] Help Center articles and [GUIDE] support guides, then [CASE] solved tickets and chats and [CALL] support calls, which show how the team solved similar problems and are used only when they agree with the higher sources.
Write for an agent on a live call or chat: plain short sentences, exact menu paths and setting names as written in the sources, numbered steps (max 8). Never invent settings, prices, timelines, policies, names or links. Never promise a fix date, credit or refund unless a source says so. Do not repeat patient or client names from cases or calls.
If the sources only partly cover it, answer the part they cover, say what is missing and what to check or who to ask. If they do not cover it, set found to false and say who owns it if a source says so.
Return JSON:
{"answer": "1 to 3 sentences that directly answer",
 "steps": ["numbered actions for the agent or the client, if any"],
 "say": "what the agent can say or paste to the client, warm and short, no promises" or "",
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
Remove or correct anything the sources do not support; keep what they support. Make sure team rules ([RULE], [NOTE]) and [UPDATE]s are followed. Keep the same style: short, plain, no em dashes.
Return JSON {"verdict": "ok" or "fixed", "issues": ["what you changed and why, short"], "answer": "...", "steps": [...], "say": "...", "checks": [...], "owner": {"who": "", "when": ""} or null, "cautions": [...], "confidence": "high" | "medium" | "low"}.`;
function label(c) { return { rule: 'RULE', note: 'NOTE', update: 'UPDATE', kb: 'KB', guide: 'GUIDE', case: 'CASE', call: 'CALL' }[c.src] || 'SRC'; }
function ctxOf(list) {
  return list.map((c, i) => `[S${i + 1}] [${label(c)}] ${c.src === 'kb' ? c.module + ' > ' + c.title + (c.section ? ' > ' + c.section : '') + (c.url ? ' (' + c.url + ')' : '') : c.src === 'case' ? 'Ticket #' + (c.number || '?') + ' ' + c.title + (c.at ? ', ' + c.at : '') : c.title + (c.section ? ' > ' + c.section : '')}\n${c.text}`).join('\n\n');
}
function arr(x, n, m = 300) { return (Array.isArray(x) ? x : []).map(v => one(typeof v === 'string' ? v : JSON.stringify(v), m)).filter(Boolean).slice(0, n); }
function shape(j) {
  return { answer: one(j.answer, 900), steps: arr(j.steps, 10), say: one(j.say, 1200), checks: arr(j.checks, 5), owner: j.owner && (j.owner.who || j.owner.when) ? { who: one(j.owner.who, 80), when: one(j.owner.when, 300) } : null,
    cautions: arr(j.cautions, 4), follow_ups: arr(j.follow_ups, 3, 140), confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium' };
}
async function relevantUpdates(q) {
  try { const r = await D.productUpdates.recent(); const t = words(q); return (r.items || []).filter(u => t.some(w => w.length > 3 && lc(u.title + ' ' + u.summary + ' ' + (u.impact || '')).includes(w))).slice(0, 3).map(u => ({ src: 'update', id: String(u.id || u.title), title: one(u.title, 120), section: '', module: '', at: String(u.postedAt || '').slice(0, 10), text: one(u.summary, 500) + (u.impact ? '\nWhat to do: ' + one(u.impact, 300) : '') })); }
  catch (e) { return []; }
}

const _cache = new Map();
async function ask({ question, history = [], mode = 'answer', module = '', useHistory = true, email = '' }) {
  const t0 = Date.now();
  const q = clean(question, 1500).trim();
  if (q.length < 3) throw httpError(400, 'Type a question first');
  if (!D.ai || !D.ai.anyConfigured()) throw httpError(503, `${NAME} is not set up yet.`);
  const key = crypto.createHash('sha1').update([q, mode, module, useHistory ? 1 : 0].join('|')).digest('hex');
  if (!history.length && _cache.has(key) && Date.now() - _cache.get(key).at < 30 * 60000) return { ..._cache.get(key).v, cached: true };
  // Brain 1
  const p = await plan(q, history);
  const mod = module || p.module;
  const lastUser = history.filter(m => m.role === 'user').slice(-1).map(m => m.content).join(' ');
  const [local, cases, ups] = await Promise.all([
    searchLocal([p.search, q, ...p.alt, lastUser ? one(lastUser, 200) : ''], { module: mod, limit: 11 }),
    useHistory ? searchCases(p.search + ' ' + q, mod).catch(() => []) : Promise.resolve([]),
    relevantUpdates(q + ' ' + p.search),
  ]);
  const rules = (await noteChunks()).filter(c => c.src === 'rule');
  const seen = new Set(); const sources = [];
  for (const c of rules.concat(ups, local, cases)) { const k = c.src + ':' + c.id + ':' + (c.section || ''); if (seen.has(k)) continue; seen.add(k); sources.push(c); }
  if (sources.length <= rules.length) {
    const v = { answer: { answer: `I could not find this in the Help Center, the support guides or past tickets. Check with your lead or the owning team, and tell ${NAME} the answer with the thumbs down button so it learns.`, steps: [], say: '', checks: [], owner: null, cautions: [], follow_ups: [], confidence: 'low' }, found: false, verified: false, sources: [], plan: p };
    v.logId = await log(email, q, mod, p.intent, mode, v, Date.now() - t0);
    return v;
  }
  const hist = history.slice(-6).map(m => (m.role === 'user' ? 'Agent: ' : 'Expert: ') + one(m.content, 600)).join('\n');
  const modeLine = mode === 'reply' ? 'The agent wants a reply to send the client: make "say" a complete, ready to send message (greeting, short paragraphs, "Thanks,"), and keep steps for the agent.' : mode === 'troubleshoot' ? 'The agent is troubleshooting live: lead with checks in the order to try them, then steps, then when to hand over.' : 'Answer the question directly.';
  const user = `${hist ? 'Conversation so far:\n' + hist + '\n\n' : ''}${modeLine}\nModule (best guess): ${mod || 'unknown'}. Intent: ${p.intent}.\nQuestion: ${q}\n\nSources:\n${ctxOf(sources)}`;
  // Brain 2
  const r2 = await D.ai.bestJSON({ system: EXPERT_SYS, user, maxTokens: 1800, feature: 'analyze', timeoutMs: 90000 });
  const j = r2.json || {};
  let out = shape(j);
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
      if (pv.openai && r2.provider === 'anthropic') cj = (await withTimeout(D.ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: CHECK_SYS }, { role: 'user', content: cu }], maxTokens: 1600, temperature: 0.1, timeoutMs: 45000 }), 50000)).json;
      else cj = (await withTimeout(D.ai.bestJSON({ system: CHECK_SYS, user: cu, maxTokens: 1600, timeoutMs: 60000 }), 65000)).json;
      if (cj && (cj.verdict === 'fixed' || cj.verdict === 'ok')) {
        verified = true;
        review = { verdict: cj.verdict, issues: arr(cj.issues, 4, 200) };
        if (cj.verdict === 'fixed' && cj.answer) { const fixed = shape({ ...cj, follow_ups: out.follow_ups }); out = { ...fixed, follow_ups: out.follow_ups }; }
        else if (cj.confidence && ['high', 'medium', 'low'].includes(cj.confidence)) out.confidence = cj.confidence;
      }
    } catch (e) { console.warn('expert check:', e.message); }
  }
  const list = (used.length ? used.map(n => sources[n - 1]) : sources.filter(c => c.src !== 'rule').slice(0, 4)).filter(Boolean);
  const v = { answer: out, found, verified, review, share, plan: { module: mod, intent: p.intent }, sources: list.filter(c => c.src !== 'rule').map(c => srcOut(c)), rulesUsed: list.filter(c => c.src === 'rule').map(c => c.title), provider: r2.provider };
  v.logId = await log(email, q, mod, p.intent, mode, v, Date.now() - t0);
  v.ms = Date.now() - t0;
  if (!history.length) { _cache.set(key, { at: Date.now(), v }); if (_cache.size > 200) _cache.delete(_cache.keys().next().value); }
  return v;
}
function srcOut(c) {
  const base = { type: c.src, title: c.title, module: c.module || '' };
  if (c.src === 'kb') return { ...base, id: c.id, section: c.section, url: c.url, kind: c.kind };
  if (c.src === 'guide') return { ...base, doc: c.doc, id: c.id, section: c.section };
  if (c.src === 'case') return { ...base, number: c.number, at: c.at, channel: c.channel, snippet: one(c.text.split('What fixed it: ')[1] || '', 220) };
  if (c.src === 'call') return { ...base, at: String(c.at || '').slice(0, 10), snippet: one(c.text, 220) };
  if (c.src === 'update') return { ...base, at: c.at, snippet: one(c.text, 220) };
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
  return { last30: { asked: tot.n || 0, found: tot.found || 0, verified: tot.verified || 0, up: tot.up || 0, down: tot.down || 0, avgSec: tot.ms ? Math.round(tot.ms / 100) / 10 : null, people: tot.people || 0 }, modules: mods, gaps,
    knowledge: { articles: kb().raw.articles.filter(a => a.kind).length, modules: kb().modules.length, guides: guideChunks().length ? 2 : 0, notes: (await get(`SELECT COUNT(*) AS n FROM expert_notes WHERE status = 'active'`)).n, calls: calls.n || 0, callsLast: calls.last || null, cases: D.query || D.kb ? 'live' : 'off' } };
}
async function popular() {
  const since = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
  return (await all(`SELECT question, COUNT(*) AS n FROM expert_log WHERE created_at >= ? AND found = 1 AND (vote IS NULL OR vote = 1) AND length(question) < 160 GROUP BY lower(question) ORDER BY n DESC, MAX(id) DESC LIMIT 6`, [since])).map(r => r.question);
}
function meta() { return { name: NAME, modules: kb().modules, articles: kb().raw.articles.filter(a => a.kind).length }; }

module.exports = { NAME, setDB, setDeps, initSchema, ask, feedback, rules, notes, saveNote, deleteNote, feedbackQueue, handleFeedback, insights, popular, meta, catalog, article, syncCalls, searchLocal, searchCases, bust, _kbChunks: kbChunks, _expand: expand };
