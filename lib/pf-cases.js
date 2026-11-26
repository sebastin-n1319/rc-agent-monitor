'use strict';
/**
 * Batch 421: Patient Forms (PF) requests, Batch 1 of 3: WATCH ONLY.
 *
 * Finds T1 tickets where a client asks the PF team to build or change forms (new form, edit an existing form,
 * Spanish version, copy forms to another location, form-to-PMS mapping). Form SUPPORT issues (not sending, sync,
 * upload, kiosk, signatures, how-to) are out of scope: the PF project does not take them.
 *
 * Two checks must agree before a case counts as "would suggest":
 *   1. the keyword rules from the old Desk "PF Request Detector" (subject form word + action word or a body request
 *      phrase, and no issue word in the subject), and
 *   2. an AI yes/no with the request type and a confidence (>= 0.8).
 * Every decision is saved with what Batch 3 would have done. Nothing is written to Desk or Asana in this batch.
 * A team lead labels cases (PF request / Not PF) on the Review > Patient forms tab; precision is measured on those
 * labels, and Batch 3 (acting on tickets) is only allowed at 95% or better on at least 50 labelled cases.
 *
 * Sources: the Desk webhook the monitor already receives (new tickets and new client emails, tickets under 24 hours
 * old), and a replay of the last 90 days from AditKB (subject and description only; no email or phone columns).
 */
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; };

const T1_TEAM = () => String(process.env.EXPERT_T1_TEAM_ID || '197800000052125116');
const PF_PROJECT = () => String(process.env.PF_ASANA_PROJECT_ID || '1202095993396108');
const AI_MIN = () => Number(process.env.PF_AI_MIN_CONF || 0.8);

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS pf_cases (
    ticket_id TEXT PRIMARY KEY, number TEXT, subject TEXT, snippet TEXT, created_time TEXT, owner TEXT, source TEXT,
    form_word INTEGER DEFAULT 0, kw_hit INTEGER DEFAULT 0, kw_type TEXT, kw_why TEXT,
    ai_pf INTEGER, ai_type TEXT, ai_conf REAL, ai_reason TEXT, ai_error TEXT,
    would TEXT, would_do TEXT, skip TEXT, asana_hint INTEGER,
    label TEXT, label_type TEXT, label_note TEXT, labelled_by TEXT, labelled_at TEXT,
    first_seen TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS pf_cases_would ON pf_cases (would, label)`);
  await run(`CREATE TABLE IF NOT EXISTS pf_settings (key TEXT PRIMARY KEY, value TEXT)`);
}
async function setting(k, d) { const r = await get(`SELECT value FROM pf_settings WHERE key = ?`, [k]).catch(() => null); return r ? r.value : d; }
async function setSetting(k, v) { await run(`INSERT INTO pf_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [k, String(v)]); }
/** 'off' or 'watch' in this batch. Default watch. */
async function mode() { const m = await setting('mode', process.env.PF_MODE || 'watch'); return m === 'off' ? 'off' : 'watch'; }

// ── keyword rules (from the Desk "PF Request Detector") ─────────────────
const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const FORM_W = /(form|forms|paperwork|packet|consent|intake|questionnaire|medical history|health history|registration|hipaa|financial policy|nppw)/;
const ACTION_W = / (new|create|add|upload|digitize|update|edit|change|revise|replace|translate|spanish|duplicate|copy|convert|design|modify)/;
const BODY_P = /(create a new form|add this form|add the attached|upload these forms|digitize|update our medical history|spanish version|translate|attached forms|edit our form|revised form)/;
const ISSUE_W = /(not sending|not received|not working|unable|not syncing|sync|import|error|kiosk|ipad|tablet|not populating|auto assign|signature|login|password|duplicate patient|not showing|missing|reminder|text message|sms|payment|invoice|issue|problem|not uploading|how to|capitalize)/;
const TYPES = [
  ['Spanish Version', /(spanish|espanol|translat)/],
  ['Copy to Location', /(another location|other locations|all locations|same forms|copy the forms|duplicate the)/],
  ['Mapping/Import', /( map |mapping|pms field|ehr field|write back)/],
  ['Edit Existing Form', /(update|edit|change|revise|modify|replace|correct|existing)/],
];
function keywords({ subject, body }) {
  const sj = norm(subject), bd = norm(cut(body, 4000));
  const fw = FORM_W.test(sj), aw = ACTION_W.test(sj), bp = BODY_P.test(bd), iw = ISSUE_W.test(sj);
  const hit = fw && (aw || bp) && !iw;
  const all_ = sj + ' ' + bd;
  const type = (TYPES.find(([, re]) => re.test(all_)) || ['New Form'])[0];
  const why = [fw ? 'form word in subject' : 'no form word in subject', aw ? 'action word in subject' : null, bp ? 'request phrase in body' : null, iw ? 'issue word in subject' : null].filter(Boolean).join(', ');
  return { formWord: fw || /(patient form|new form|forms?\b)/.test(bd), hit, type: hit ? type : null, why };
}

// ── AI check ────────────────────────────────────────────────────────────
const AI_TYPES = ['New Form', 'Edit Existing Form', 'Spanish Version', 'Copy to Location', 'Mapping/Import'];
const SYS = `You classify one support ticket for Adit (dental and medical practice software).
Answer whether the client is asking Adit's Patient Forms team to BUILD or CHANGE forms. In scope:
- New Form: create, add, upload or digitize a new form, packet, consent, intake, questionnaire, medical history, registration, HIPAA or financial policy form (often with an attached PDF or Word file).
- Edit Existing Form: change wording, fields, questions, logo, order, or replace a form that already exists.
- Spanish Version: translate a form or make a Spanish copy.
- Copy to Location: the same forms copied to another or all locations.
- Mapping/Import: map form fields to the PMS/EHR (write back).
NOT in scope (answer false): problems using forms (not sending, not received, not syncing, not uploading to the chart, kiosk, iPad or tablet, signatures, auto assign, reminders, texts), how-to questions, access or permission changes, billing or payment, forms the practice will set up itself, a patient's completed form, or anything not about form building.
Be strict: if unsure, answer false. Reply with JSON only: {"pf": true|false, "type": one of ${JSON.stringify(AI_TYPES)} or null, "confidence": 0 to 1, "reason": "one short sentence"}`;
const scrub = (t) => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
// Past cases as examples (added to the brief): tickets a lead labelled, and past T1 tickets that got a Patient Forms
// Asana task. The most similar ones go into the prompt, so detection learns from how cases were really handled.
const STOP = new Set('the a an and or of to for in on our we you your is are be with this that it please can from at as by my me i have has need would like thanks thank hi hello dr re fw fwd'.split(' '));
const toks = (s) => new Set(norm(s).trim().split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
let _pool = null;
async function examplePool() {
  if (_pool && Date.now() - _pool.t < 5 * 60000) return _pool.rows;
  const rows = await all(`SELECT ticket_id, subject, snippet, label, label_type, kw_type, asana_hint FROM pf_cases WHERE label IS NOT NULL OR asana_hint = 1 ORDER BY labelled_at DESC LIMIT 3000`).catch(() => []);
  for (const r of rows) { r._t = toks(r.subject + ' ' + r.subject + ' ' + cut(r.snippet, 400)); r._pos = r.label ? r.label === 'pf' : true; r._strong = !!r.label; }
  _pool = { t: Date.now(), rows }; return rows;
}
function bustPool() { _pool = null; }
async function examples({ id, subject, body }) {
  const pool = await examplePool(); if (!pool.length) return { pos: [], neg: [] };
  const me = toks(subject + ' ' + subject + ' ' + cut(body, 400));
  const sim = (r) => { let k = 0; for (const w of me) if (r._t.has(w)) k++; return k / Math.max(1, Math.min(me.size, r._t.size)) + (r._strong ? 0.05 : 0); };
  const scored = pool.filter((r) => r.ticket_id !== String(id)).map((r) => ({ r, s: sim(r) })).filter((x) => x.s > 0.15).sort((a, b) => b.s - a.s);
  return { pos: scored.filter((x) => x.r._pos).slice(0, 3).map((x) => x.r), neg: scored.filter((x) => !x.r._pos).slice(0, 3).map((x) => x.r) };
}
async function aiCheck({ id, subject, body }) {
  const ai = D.ai || require('./ai');
  const ex = await examples({ id, subject, body }).catch(() => ({ pos: [], neg: [] }));
  const line = (r, yes) => `- ${yes ? 'NEEDED the PF team' + (r.label_type || r.kw_type ? ' (' + (r.label_type || r.kw_type) + ')' : '') : 'NOT a PF request'}: "${cut(r.subject, 140)}" ${cut(String(r.snippet || '').replace(/\s+/g, ' '), 220)}`;
  const past = ex.pos.length || ex.neg.length ? `Similar past T1 tickets and how they were handled (use them as examples, they are not this ticket):\n${ex.pos.map((r) => line(r, true)).concat(ex.neg.map((r) => line(r, false))).join('\n')}\n\n` : '';
  const user = `${past}THIS TICKET\nSubject: ${cut(scrub(subject), 300)}\n\nMessage:\n${cut(scrub(String(body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), 2500)}`;
  const r = await ai.claudeJSON({ system: SYS, user, maxTokens: 300, timeoutMs: 45000, temperature: 0, feature: 'pf-detect' });
  const j = (r && r.json) || {};
  const type = AI_TYPES.includes(j.type) ? j.type : null;
  return { pf: j.pf === true, type, conf: Math.max(0, Math.min(1, Number(j.confidence) || 0)), reason: cut(j.reason || '', 240) };
}

function wouldDo(c) {
  if (c.would !== 'suggest') return null;
  const type = c.ai_type || c.kw_type || 'New Form';
  return `Tag pf-suggested and add a private note: "Looks like a patient forms request (${type}). If it is, add the tag pf-request and the Asana task will be created."`;
}

/** Classify and save one ticket. t: { id, number, subject, body, created, owner, source, skip, asanaHint } */
async function classify(t, { useAi = true } = {}) {
  const kw = keywords({ subject: t.subject, body: t.body });
  const row = { ticket_id: String(t.id), number: String(t.number || ''), subject: cut(t.subject, 300), snippet: cut(scrub(String(t.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), 700),
    created_time: t.created || null, owner: t.owner || null, source: t.source || 'live', form_word: kw.formWord ? 1 : 0, kw_hit: kw.hit ? 1 : 0, kw_type: kw.type, kw_why: kw.why,
    ai_pf: null, ai_type: null, ai_conf: null, ai_reason: null, ai_error: null, skip: t.skip || null, asana_hint: t.asanaHint == null ? null : (t.asanaHint ? 1 : 0), would: 'none' };
  if (!kw.formWord && !kw.hit) return null; // nothing form-like: not stored
  // The AI runs on keyword hits (needed for the decision) and on form-word tickets the keywords missed (to measure recall).
  if (useAi && !row.skip) {
    try { const a = await aiCheck({ id: t.id, subject: t.subject, body: t.body }); row.ai_pf = a.pf ? 1 : 0; row.ai_type = a.type; row.ai_conf = a.conf; row.ai_reason = a.reason; }
    catch (e) { row.ai_error = cut(e.message, 200); }
  }
  if (!row.skip && row.kw_hit && row.ai_pf === 1 && row.ai_conf >= AI_MIN()) row.would = 'suggest';
  row.would_do = wouldDo(row);
  const cols = Object.keys(row);
  await run(`INSERT INTO pf_cases (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
    ON CONFLICT(ticket_id) DO UPDATE SET ${cols.filter((c) => c !== 'ticket_id').map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = datetime('now')`, cols.map((c) => row[c]));
  return row;
}

// ── live: Desk webhook ───────────────────────────────────────────────────
const deskRead = (p) => D.deskRead ? D.deskRead(p) : require('./desk-service').fetchRaw(p);
const SKIP_FROM = ['ringcentral.com', '@adit.com'];
const PF_TAGS = ['pf-request', 'pf-linked', 'pf-suggested'];
const _seen = new Map();
async function onDeskEvent(body) {
  if (!_db || (await mode()) === 'off') return [];
  const events = Array.isArray(body) ? body : body && Array.isArray(body.events) ? body.events : body && body.eventType ? [body] : [];
  const out = [];
  for (const ev of events.slice(0, 20)) {
    if (!ev || !['Ticket_Add', 'Ticket_Thread_Add'].includes(ev.eventType)) continue;
    const pl = ev.payload || {};
    if (pl.direction && pl.direction !== 'in') continue;
    const tid = String(pl.ticketId || (ev.eventType === 'Ticket_Add' ? pl.id : '') || '').replace(/\D/g, '');
    if (!tid) continue;
    const last = _seen.get(tid); if (last && Date.now() - last < 10 * 60000) continue; // one look per ticket per 10 minutes
    _seen.set(tid, Date.now()); if (_seen.size > 3000) _seen.clear();
    out.push(await liveOne(tid, pl).catch((e) => ({ tid, error: e.message })));
  }
  return out;
}
async function liveOne(tid, pl) {
  // Give the T1 Assignment Helper a moment to set the team and owner, like the Expert drafts do.
  if (D.waitMs !== 0) await new Promise((r) => setTimeout(r, D.waitMs || 120000));
  const t = await deskRead(`/tickets/${tid}?include=assignee,team`);
  if (!t) return { tid, skip: 'ticket not found' };
  const subject = t.subject || '', body = t.description || '';
  const kw = keywords({ subject, body });
  if (!kw.formWord && !kw.hit) return { tid, skip: 'nothing form-like' };
  let skip = null;
  const from = String(pl.fromEmailAddress || t.email || '').toLowerCase();
  const ageH = (Date.now() - Date.parse(t.createdTime || 0)) / 3600000;
  if (String(t.teamId || '') !== T1_TEAM()) skip = 'not a T1 ticket';
  else if (/closed/i.test(String(t.statusType || t.status || ''))) skip = 'closed';
  else if (SKIP_FROM.some((x) => from.includes(x))) skip = 'internal or RingCentral sender';
  else if (ageH > 24) skip = 'older than 24 hours';
  let asanaHint = null;
  if (!skip) {
    const tags = await deskRead(`/tickets/${tid}/tags`).catch(() => null);
    const names = ((tags && (tags.data || tags.tags)) || []).map((x) => String((x && x.name) || x).toLowerCase());
    if (names.some((n) => PF_TAGS.includes(n))) skip = 'already tagged ' + names.find((n) => PF_TAGS.includes(n));
  }
  if (!skip) {
    const cm = await deskRead(`/tickets/${tid}/comments?limit=50`).catch(() => null);
    const txt = ((cm && cm.data) || []).map((c) => c.content || '').join(' ') + ' ' + body + ' ' + (t.cf && t.cf.cf_asana_task_link || '');
    if (/app\.asana\.com/i.test(txt)) { skip = 'already has an Asana link'; asanaHint = txt.includes(PF_PROJECT()); }
  }
  const owner = t.assignee ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(' ') : null;
  const row = await classify({ id: tid, number: t.ticketNumber, subject, body, created: t.createdTime, owner, source: 'live', skip, asanaHint });
  return { tid, would: row && row.would, skip };
}

// ── replay: last N days from AditKB ─────────────────────────────────────
let _replay = null;
function replayStatus() { return _replay ? Object.assign({}, _replay, { running: !_replay.done }) : null; }
async function replay({ days = 90, by = '' } = {}) {
  if (_replay && !_replay.done) return replayStatus();
  _replay = { started: new Date().toISOString(), by, days, total: 0, done: false, checked: 0, saved: 0, would: 0, error: null };
  (async () => {
    try {
      const kbq = D.kbq || ((s, l) => require('./aditkb-service').query(s, l));
      const since = new Date(Date.now() - Math.min(120, Math.max(1, days)) * 864e5).toISOString().slice(0, 10);
      // subject, description, owner name, team: no email or phone columns
      const sql = `select id, ticket_number, subject, left(description_text, 4000) as body, created_time, assignee_name, j_team_name, status_type
        from desk_tickets where created_time >= '${since}' and (j_team_name = 'T1 - Customer Support' or cf_owner_change_log ilike '%Role : T1 Support%')
        and (subject ~* '(form|paperwork|packet|consent|intake|questionnaire|medical history|health history|registration|hipaa|financial policy|nppw)'
          or description_text ~* '(patient form|new form|add (this|the attached) form|digitize|spanish version|translate)')`;
      const r = await kbq(sql, 5000);
      const rows = (r && r.rows) || [];
      _replay.total = rows.length;
      // PF Asana links in ticket notes, as a hint for the labeller (not used in the decision)
      let pfLinked = new Set();
      try { const lk = await kbq(`select distinct c.ticket_id from desk_ticket_comments c join desk_tickets t on t.id = c.ticket_id where t.created_time >= '${since}' and c.content ilike '%${PF_PROJECT()}%'`, 5000); pfLinked = new Set(((lk && lk.rows) || []).map((x) => String(x.ticket_id))); } catch (e) { /* comments not readable with this key */ }
      // First pass, no AI: save every candidate with its PF Asana hint, so the past PF cases are examples for the second pass.
      for (const x of rows) { const prev = await get(`SELECT ai_pf FROM pf_cases WHERE ticket_id = ?`, [String(x.id)]).catch(() => null); if (!prev) await classify({ id: x.id, number: x.ticket_number, subject: x.subject, body: x.body, created: x.created_time, owner: x.assignee_name, source: 'replay', asanaHint: pfLinked.size ? pfLinked.has(String(x.id)) : null }, { useAi: false }).catch(() => null); else if (pfLinked.size) await run(`UPDATE pf_cases SET asana_hint = ? WHERE ticket_id = ?`, [pfLinked.has(String(x.id)) ? 1 : 0, String(x.id)]).catch(() => {}); }
      bustPool();
      const queue = rows.slice(); const workers = [];
      for (let w = 0; w < 3; w++) workers.push((async () => {
        while (queue.length) {
          const x = queue.shift();
          const prev = await get(`SELECT label, ai_pf FROM pf_cases WHERE ticket_id = ?`, [String(x.id)]).catch(() => null);
          if (prev && prev.ai_pf != null) { _replay.checked++; continue; } // already classified: keep its label, no second AI call
          const row = await classify({ id: x.id, number: x.ticket_number, subject: x.subject, body: x.body, created: x.created_time, owner: x.assignee_name, source: 'replay', asanaHint: pfLinked.size ? pfLinked.has(String(x.id)) : null }).catch((e) => { _replay.error = cut(e.message, 200); return null; });
          _replay.checked++; if (row) { _replay.saved++; if (row.would === 'suggest') _replay.would++; }
        }
      })());
      await Promise.all(workers);
    } catch (e) { _replay.error = cut(e.message, 300); }
    _replay.done = true; _replay.finished = new Date().toISOString();
  })();
  return replayStatus();
}

// ── labels and the numbers ──────────────────────────────────────────────
async function label(ticketId, { label: l, type, note, by }) {
  if (!['pf', 'not_pf', ''].includes(l)) throw Object.assign(new Error('Label must be pf or not_pf'), { status: 400 });
  const r = await run(`UPDATE pf_cases SET label = ?, label_type = ?, label_note = ?, labelled_by = ?, labelled_at = ${l ? "datetime('now')" : 'NULL'} WHERE ticket_id = ?`,
    [l || null, l === 'pf' && AI_TYPES.includes(type) ? type : null, cut(note || '', 300) || null, l ? String(by || '').toLowerCase() : null, String(ticketId)]);
  if (!r.changes) throw Object.assign(new Error('Case not found'), { status: 404 });
  bustPool(); // a new label is an example for the next ticket
  return get(`SELECT * FROM pf_cases WHERE ticket_id = ?`, [String(ticketId)]);
}
const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
async function stats() {
  const one = async (where) => { const r = await get(`SELECT count(*) n, sum(label IS NOT NULL) labelled, sum(label = 'pf') pf, sum(label = 'not_pf') notpf FROM pf_cases WHERE ${where}`); return { n: r.n || 0, labelled: r.labelled || 0, pf: r.pf || 0, notPf: r.notpf || 0, precision: pct(r.pf || 0, r.labelled || 0) }; };
  const suggest = await one(`would = 'suggest'`), kwOnly = await one(`kw_hit = 1`), aiOnly = await one(`ai_pf = 1`);
  const missed = await get(`SELECT count(*) n FROM pf_cases WHERE label = 'pf' AND would != 'suggest'`);
  const truePf = await get(`SELECT count(*) n FROM pf_cases WHERE label = 'pf'`);
  const typeOk = await get(`SELECT sum(label_type = coalesce(ai_type, kw_type)) ok, count(*) n FROM pf_cases WHERE would = 'suggest' AND label = 'pf' AND label_type IS NOT NULL`);
  const gate = suggest.labelled >= 50 && suggest.precision != null && suggest.precision >= 95;
  return { mode: await mode(), suggest, keywordsOnly: kwOnly, aiOnly, recall: pct((truePf.n || 0) - (missed.n || 0), truePf.n || 0), missed: missed.n || 0,
    typeAccuracy: pct(typeOk && typeOk.ok || 0, typeOk && typeOk.n || 0), gate, gateNote: gate ? 'Ready: 95% or better on 50+ labelled cases' : `Needs 95% on at least 50 labelled "would suggest" cases (now ${suggest.precision == null ? 'no labels' : suggest.precision + '% on ' + suggest.labelled})`,
    total: (await get(`SELECT count(*) n FROM pf_cases`)).n, replay: replayStatus() };
}
async function list({ view = 'tolabel', q = '', limit = 50, offset = 0 } = {}) {
  const w = [], p = [];
  if (view === 'tolabel') w.push(`label IS NULL AND (would = 'suggest' OR ai_pf = 1 OR kw_hit = 1)`);
  else if (view === 'suggest') w.push(`would = 'suggest'`);
  else if (view === 'labelled') w.push(`label IS NOT NULL`);
  else if (view === 'disagree') w.push(`label IS NOT NULL AND ((label = 'pf') != (would = 'suggest'))`);
  else if (view === 'skipped') w.push(`skip IS NOT NULL`);
  if (q) { w.push(`(number LIKE ? OR subject LIKE ?)`); p.push('%' + q + '%', '%' + q + '%'); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const rows = await all(`SELECT * FROM pf_cases ${where} ORDER BY (would = 'suggest') DESC, coalesce(created_time, first_seen) DESC LIMIT ? OFFSET ?`, p.concat([Math.min(200, Number(limit) || 50), Math.max(0, Number(offset) || 0)]));
  const n = await get(`SELECT count(*) n FROM pf_cases ${where}`, p);
  return { rows, total: n.n };
}

module.exports = { examples, setDB, setDeps, initSchema, mode, setSetting, keywords, aiCheck, classify, onDeskEvent, replay, replayStatus, label, stats, list, _norm: norm, AI_TYPES };
