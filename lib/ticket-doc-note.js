'use strict';
/**
 * Batch 328: ticket documentation notes for every T1 ticket (agents' feedback).
 *
 * 1. Initial note, once, when a ticket is with a T1 agent: the client and account details in the team's format,
 *    the client's query, troubleshooting done till now and next steps.
 * 2. Case update note: when the client responds or an agent adds an update, a separate short note with only
 *    "Troubleshooting Done Till Now" and "Next Steps". There is only ever one; later updates edit it in place.
 *
 * Expert's Desk drafts write into the same update note, so a ticket carries at most these two Expert notes.
 */
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const cut = (s, n) => String(s || '').slice(0, n);
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T1_TEAM = () => String(process.env.EXPERT_T1_TEAM_ID || '197800000052125116');
const enabled = () => process.env.TICKET_DOC_NOTES !== 'off';

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS ticket_doc_notes (ticket_id TEXT PRIMARY KEY, number TEXT, init_id TEXT, upd_id TEXT, sig TEXT,
    query TEXT, trouble TEXT, next TEXT, updates INTEGER DEFAULT 0, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`);
}
const read = (p) => (D.deskRead || require('./desk-service').fetchRaw)(p);

// ── the note text ─────────────────────────────────────────────────────────
const phoneFmt = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || '').trim(); };
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
function header(t, crm, fwd) {
  const c = t.contact || {}, H = (crm && crm.header) || {}, A = (crm && crm.account) || {}, F = (crm && crm.facts) || {};
  const name = fwd && fwd.name ? fwd.name : [c.firstName, c.lastName].filter(Boolean).join(' ').replace(/^Dr Dr\b/, 'Dr').trim();
  // the CRM text carries "Deal: <name>, stage <stage>, CSM <name>, onboarding <name>" when the header fields are empty
  const txt = String((crm && crm.text) || ''), cf = t.customFields || {};
  const fromTxt = (re) => { const m = txt.match(re); return m ? m[1].trim() : ''; };
  const stage = F.stage || H.stage || fromTxt(/\bstage ([^,.\n]+)/i) || cf['Deal Stage'] || '';
  const owner = /onboard|\bob\b/i.test(stage) ? (F.ob || H.ob || fromTxt(/onboarding ([A-Z][^,.\n]+)/) || F.csm) : (F.csm || H.csm || fromTxt(/\bCSM ([A-Z][^,.\n]+)/) || cf['CSM/Account Manager'] || F.ob);
  const esc0 = String(F.escalation || H.escalation || '');
  const escOpen = esc0 && !/^(none|no|-|de-?escalated|closed|resolved)/i.test(esc0) && !/earlier|closed|resolved/i.test(esc0);
  return {
    'Client Name': name || 'Not given',
    'Practice Name': (c.account && c.account.accountName) || A.name || H.account || 'Not linked',
    'Account Number': A.number || 'Not found',
    'Deal Stage': stage ? stage + (owner ? ' | ' + first(owner) : '') : 'Not found',
    'Callback Number': phoneFmt(t.phone || c.phone || c.mobile) || 'Not given',
    'Email': (fwd && fwd.email) || t.email || c.email || 'Not given',
    'Ticket Number': '#' + t.ticketNumber,
    'Any Escalation Ticket Open': escOpen ? 'Yes - ' + esc0 + (H.escalationOwner ? ' | ' + first(H.escalationOwner) : '') : 'No',
  };
}
const list = (a) => `<ul>${(a || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
function initialHtml(h, s) {
  return `<div>${Object.entries(h).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>`
    + `<div><br>Client's Query:<br>${esc(s.query || 'See the ticket.')}</div>`
    + `<div><br>Troubleshooting Done Till Now:</div>${list(s.trouble && s.trouble.length ? s.trouble : ['Ticket received; nothing done yet.'])}`
    + `<div>Next Steps:</div>${list(s.next)}`;
}
const ctNow = () => new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
function updateHtml(s, lead) {
  return `<div>Case update, ${esc(ctNow())}${lead ? '<br>' + esc(lead) : ''}</div>`
    + `<div><br>Troubleshooting Done Till Now:</div>${list(s.trouble && s.trouble.length ? s.trouble : ['Nothing new since the first note.'])}`
    + `<div>Next Steps:</div>${list(s.next)}`;
}

// ── the AI part ───────────────────────────────────────────────────────────
const SYS = `You document a support ticket for Adit's T1 support team (Adit is software for dental, orthodontic, optometry and chiropractic practices). Write internal notes the way the team writes them:

Client's Query: one to three plain sentences on what the client reported and what they want, in the third person ("Client reported that ... The client wanted ...").
Troubleshooting Done Till Now: past-tense bullets of what agents and teams actually did, checked and found on this ticket (reviewed, clarified, advised, explained, checked, confirmed, transferred). Only what the ticket shows was done. Include findings that matter. Never invent work.
Next Steps: bullets for the assigned agent: what to investigate, verify, communicate or follow up on to move the ticket to resolution, and which team to consult when T1 cannot do it.

Each bullet is one short sentence, starting with a verb, no ending clutter. 2 to 6 bullets per list. Use names of people and teams from the ticket. Ignore notes written by "Adit Expert" (they are earlier versions of this note). No em or en dashes. Return JSON {"query": "", "trouble": [""], "next": [""]}.`;
async function sections(tk, mode, prev) {
  if (!D.ai || !D.ai.bestJSON) return null;
  const user = [mode === 'update' ? 'Write the CASE UPDATE: only Troubleshooting Done Till Now (everything done and found so far, including anything new since the last note) and Next Steps as they stand now. Query can be "".' : 'Write the FIRST note for this ticket.',
    prev ? `The last note said:\nTroubleshooting: ${(prev.trouble || []).join(' | ')}\nNext steps: ${(prev.next || []).join(' | ')}` : '',
    'The ticket:\n' + cut(tk.text, 14000)].filter(Boolean).join('\n\n');
  const r = await D.ai.bestJSON({ system: SYS, user, maxTokens: 1500, feature: 'ticket-doc-note', timeoutMs: 60000, temperature: 0.2 });
  const j = (r && r.json) || {};
  const arr = (a) => (Array.isArray(a) ? a : []).map((x) => cut(String(x).replace(/\s*[—–]\s*/g, ', ').replace(/^[-*•]\s*/, '').trim(), 300)).filter(Boolean).slice(0, 7);
  return { query: cut(String(j.query || '').replace(/\s*[—–]\s*/g, ', ').trim(), 800), trouble: arr(j.trouble), next: arr(j.next) };
}

// ── Desk writes (through the draft module's write token) ─────────────────
const W = () => D.write || require('./expert-desk-draft')._writer;
async function post(id, html) { return W().note(id, null, html); }
async function patch(id, cid, html) { return W().note(id, { id: cid }, html); }

// Our own notes, told apart from people's notes by how they start.
const OURS = /^\s*(Client Name:|Case update,|Adit Expert is writing|Expert draft ready|Adit Expert (did not|could not|stopped)|Taken over by|Same caller as)/i;
async function signature(id) {
  const [th, cm] = await Promise.all([read(`/tickets/${id}/threads?limit=50`).catch(() => null), read(`/tickets/${id}/comments?limit=50`).catch(() => null)]);
  const threads = ((th && th.data) || []).filter((x) => !/draft/i.test(String(x.status || ''))).length;
  const notes = ((cm && cm.data) || []).filter((c) => !OURS.test(String(c.content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '))).length;
  return threads + ':' + notes;
}

async function context(t) {
  const tk = await (D.ticket || require('./expert-ticket')).load(String(t.ticketNumber), { light: true });
  let crm = null;
  try { crm = D.expert && D.expert.crmContext ? await D.expert.crmContext(String(t.ticketNumber)) : null; } catch (e) { /* none */ }
  if (!crm && tk && tk.meta && tk.meta.idents && D.expert && D.expert._matchAccount) { const m = await D.expert._matchAccount(tk.meta.idents).catch(() => null); if (m && !m.none && /email|account number/i.test(m.matchedBy || '')) crm = m; }
  let fwd = null; try { fwd = await require('./expert-desk-draft').forwardOf(String(t.id), t); } catch (e) { /* not a forward */ }
  return { tk, crm, fwd };
}

// Write the first note if there is none; otherwise, when the ticket changed (a new reply, or a note by a person),
// rewrite the case update note. Returns what it did.
const _busy = new Set();
async function touch(ticketId, { force = false } = {}) {
  if (!_db || !enabled()) return { skipped: 'off' };
  const id = String(ticketId);
  if (_busy.has(id)) return { skipped: 'busy' };
  _busy.add(id);
  try {
    const t = await read(`/tickets/${id}?include=contacts,assignee`).catch(() => null);
    if (!t || !t.ticketNumber) return { skipped: 'not found' };
    if (String(t.teamId || '') !== T1_TEAM() || /closed/i.test(String(t.statusType || ''))) return { skipped: 'not an open T1 ticket' };
    const row = await get(`SELECT * FROM ticket_doc_notes WHERE ticket_id = ?`, [id]);
    const sig = await signature(id);
    if (row && row.init_id && row.sig === sig && !force) return { skipped: 'no change' };
    const { tk, crm, fwd } = await context(t);
    if (!row || !row.init_id) {
      const s = await sections(tk, 'initial');
      if (!s) return { skipped: 'no AI' };
      const c = await post(id, initialHtml(header(t, crm, fwd), s));
      if (!c || !c.id) throw new Error('Desk did not save the note');
      await run(`INSERT INTO ticket_doc_notes (ticket_id, number, init_id, sig, query, trouble, next, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(ticket_id) DO UPDATE SET init_id = excluded.init_id, sig = excluded.sig, query = excluded.query, trouble = excluded.trouble, next = excluded.next, updated_at = excluded.updated_at`,
        [id, String(t.ticketNumber), String(c.id), await signature(id), s.query, JSON.stringify(s.trouble), JSON.stringify(s.next)]);
      return { created: 'initial', number: t.ticketNumber };
    }
    const prev = { trouble: JSON.parse(row.trouble || '[]'), next: JSON.parse(row.next || '[]') };
    const s = await sections(tk, 'update', prev);
    if (!s) return { skipped: 'no AI' };
    const html = updateHtml(s);
    let cid = row.upd_id;
    if (cid) { const ok = await patch(id, cid, html).catch(() => null); if (!ok) cid = null; }
    if (!cid) { const c = await post(id, html); cid = c && c.id ? String(c.id) : null; }
    await run(`UPDATE ticket_doc_notes SET upd_id = ?, sig = ?, trouble = ?, next = ?, updates = updates + 1, error = NULL, updated_at = datetime('now') WHERE ticket_id = ?`,
      [cid, await signature(id), JSON.stringify(s.trouble), JSON.stringify(s.next), id]);
    return { updated: true, number: t.ticketNumber };
  } catch (e) {
    await run(`INSERT INTO ticket_doc_notes (ticket_id, error) VALUES (?, ?) ON CONFLICT(ticket_id) DO UPDATE SET error = excluded.error`, [id, cut(e.message, 300)]).catch(() => {});
    return { error: e.message };
  } finally { _busy.delete(id); }
}

// Expert's Desk draft writes into the case update note. Its "Label: value" note becomes the two sections, with the
// draft as the first next step. Returns the note's comment so the draft job can keep its ID.
const SPLIT_KEYS = { trouble: ['What was checked', 'Findings', 'T1 answered', 'Handed over', 'Client prefers'], next: ['Next team should'] };
function fromExpertNote(note, splitter) {
  const fields = {}; let last = null;
  for (const l of String(note || '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    const m = l.match(/^([A-Za-z][A-Za-z /]{1,30}):\s*(.*)$/);
    if (m && !/^https?$/i.test(m[1])) { last = m[1].trim(); fields[last] = (fields[last] ? fields[last] + '; ' : '') + m[2].trim(); }
    else if (last) fields[last] += '; ' + l.replace(/^[-•]\s*/, '');
  }
  const skip = (v) => !v || /^(see ticket|not given|none|n\/a|-)\.?$/i.test(String(v).trim());
  const pick = (keys) => [].concat(...keys.filter((k) => !skip(fields[k])).map((k) => splitter(fields[k])));
  return { query: fields['Reason for contact'] || '', trouble: pick(SPLIT_KEYS.trouble).slice(0, 7), next: pick(SPLIT_KEYS.next).slice(0, 6) };
}
async function withLead(ticketId, lead, extraNext) {
  const r = await get(`SELECT trouble, next FROM ticket_doc_notes WHERE ticket_id = ?`, [String(ticketId)]).catch(() => null);
  const s = { trouble: r ? JSON.parse(r.trouble || '[]') : [], next: (r ? JSON.parse(r.next || '[]') : []) };
  if (extraNext) s.next = [extraNext].concat(s.next.filter((x) => x !== extraNext));
  return { html: updateHtml(s, lead), sections: s };
}
async function noteId(ticketId) { const r = await get(`SELECT upd_id FROM ticket_doc_notes WHERE ticket_id = ?`, [String(ticketId)]).catch(() => null); return r && r.upd_id ? { id: r.upd_id } : null; }
async function fromDraft(ticketId, { note, lead, firstStep, splitter }) {
  const s = fromExpertNote(note, splitter);
  if (firstStep) s.next.unshift(firstStep);
  return { html: updateHtml(s, lead), sections: s };
}
async function keep(ticketId, cid, s) {
  if (!_db || !cid) return;
  await run(`INSERT INTO ticket_doc_notes (ticket_id, upd_id, trouble, next, updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(ticket_id) DO UPDATE SET upd_id = excluded.upd_id, trouble = excluded.trouble, next = excluded.next, updated_at = excluded.updated_at`,
    [String(ticketId), String(cid), JSON.stringify((s && s.trouble) || []), JSON.stringify((s && s.next) || [])]).catch(() => {});
  try { await run(`UPDATE ticket_doc_notes SET sig = ? WHERE ticket_id = ?`, [await signature(String(ticketId)), String(ticketId)]); } catch (e) { /* next sweep */ }
}

// Every few minutes: the T1 agents' tickets that changed recently get their first note, or an updated case note.
let _last = 0;
async function sweep({ ownerIds = [], max = 12 } = {}) {
  if (!_db || !enabled()) return { skipped: true };
  const since = _last || Date.now() - 30 * 60000; const startedAt = Date.now();
  const seen = new Map();
  for (const oid of ownerIds.slice(0, 40)) {
    const r = await read(`/tickets/search?assigneeId=${encodeURIComponent(oid)}&limit=25&sortBy=-modifiedTime`).catch(() => null);
    for (const t of (r && r.data) || []) {
      if (String(t.teamId || '') !== T1_TEAM() || /closed/i.test(String(t.statusType || ''))) continue;
      if ((Date.parse(t.modifiedTime || '') || 0) < since - 60000) continue;
      seen.set(String(t.id), t);
    }
  }
  const out = { checked: seen.size, created: 0, updated: 0, errors: 0 };
  let n = 0;
  for (const id of seen.keys()) {
    if (n >= max) break;
    const r = await touch(id).catch((e) => ({ error: e.message }));
    if (r.created) { out.created++; n++; } else if (r.updated) { out.updated++; n++; } else if (r.error) out.errors++;
  }
  if (n < max) _last = startedAt; // everything seen was handled; otherwise look at the same window again next time
  return out;
}
async function status() {
  const r = await get(`SELECT count(*) AS n, sum(CASE WHEN upd_id IS NOT NULL THEN 1 ELSE 0 END) AS upd, sum(updates) AS updates, sum(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
    sum(CASE WHEN created_at > datetime('now','-1 day') THEN 1 ELSE 0 END) AS today FROM ticket_doc_notes`).catch(() => null);
  return r || {};
}
function _reset() { _last = 0; _busy.clear(); }
module.exports = { withLead, setDB, setDeps, initSchema, touch, sweep, status, header, initialHtml, updateHtml, fromExpertNote, fromDraft, noteId, keep, sections, signature, phoneFmt, OURS, enabled, _reset };
