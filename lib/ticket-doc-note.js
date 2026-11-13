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
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const cut = (s, n) => String(s || '').slice(0, n);
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T1_TEAM = () => String(process.env.EXPERT_T1_TEAM_ID || '197800000052125116');
const enabled = () => process.env.TICKET_DOC_NOTES !== 'off';

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS ticket_doc_notes (ticket_id TEXT PRIMARY KEY, number TEXT, init_id TEXT, upd_id TEXT, sig TEXT,
    query TEXT, trouble TEXT, next TEXT, updates INTEGER DEFAULT 0, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT)`);
  // Batch 332: account numbers agents documented for a client's email (learned from their private notes)
  await run(`CREATE TABLE IF NOT EXISTS account_hints (email TEXT PRIMARY KEY, account_number TEXT, by TEXT, ticket TEXT, at TEXT DEFAULT (datetime('now')))`);
}
async function hintFor(email) { if (!_db || !email) return null; return get(`SELECT account_number, by, ticket FROM account_hints WHERE email = ?`, [String(email).toLowerCase()]).catch(() => null); }
async function saveHint(email, n, by, ticket) { if (!_db || !email || !/^\d{5}$/.test(String(n))) return; await run(`INSERT INTO account_hints (email, account_number, by, ticket, at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(email) DO UPDATE SET account_number = excluded.account_number, by = excluded.by, ticket = excluded.ticket, at = excluded.at`, [String(email).toLowerCase(), String(n), cut(by, 80), String(ticket || '')]).catch(() => {}); }
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
  // Batch 331: "Never escalated" is not open, and object text ("[object Object]") is never shown.
  const raw = [F.escalation, H.escalation].map((v) => typeof v === 'string' ? v : (v && (v.tier || v.status || v.name)) || '').find(Boolean) || '';
  const escClean = String(raw).replace(/\s*\|?\s*\[object[^\]]*\]?/gi, '').replace(/\s*\|\s*$/, '').trim();
  const tier = (escClean.match(/tier\s*(\d)/i) || [])[1], escId = (escClean.match(/ESC-\d+/i) || [])[0];
  const esc0 = tier ? `Tier ${tier}${escId ? ' (' + escId + ')' : ''}` : escClean;
  const escOpen = escClean && !/^(none|no|-|de-?escalated|closed|resolved)/i.test(escClean) && !/never|earlier|closed|resolved|de-?escalated/i.test(escClean);
  // Batch 332: the escalation alert the T1 automation already posted on the ticket counts, whatever the CRM text says.
  const al = crm && crm.escAlert;
  // Batch 333: the owner's Desk team (pod) and full name when known, as agents write it; else the CRM stage and first name
  const P = (crm && crm.pods) || {};
  const pod = owner && (owner === (F.ob || H.ob) && !(owner === (F.csm || H.csm)) ? P.ob : P.csm || P.ob);
  // "Tech OB POD 21 - Kane" is written "Pod 21", the way agents write it; other team names are kept as they are
  const podName = pod ? ((String(pod).match(/\bpod\s*([\w]+)/i) || [])[1] ? 'Pod ' + String(pod).match(/\bpod\s*([\w]+)/i)[1].toUpperCase().replace(/^(\d+)$/, '$1') : String(pod).trim()) : '';
  const dealLine = podName && owner ? `${podName} | ${String(owner).trim()}` : stage ? stage + (owner ? ' | ' + first(owner) : '') : 'Not found';
  const escLine = al ? 'Yes - Tier ' + al.tier + (al.id ? ' (' + al.id + ')' : '') : escOpen ? 'Yes - ' + esc0 + (H.escalationOwner ? ' | ' + first(H.escalationOwner) : '') : 'No';
  if (crm && crm.ambiguous) {
    // Batch 332: more than one possible account: nothing is guessed, the agent decides.
    return {
      'Client Name': name || 'Not given',
      'Practice Name': 'Agent to confirm: ' + crm.ambiguous.map((x) => (x.name || 'account') + ' (' + x.number + ')').join(' or '),
      'Account Number': 'Agent to confirm', 'Deal Stage': 'Agent to confirm',
      'Callback Number': phoneFmt(t.phone || c.phone || c.mobile) || 'Not given',
      'Email': (fwd && fwd.email) || t.email || c.email || 'Not given',
      'Ticket Number': '#' + t.ticketNumber,
      'Any Escalation Ticket Open': al ? escLine : 'Agent to confirm',
    };
  }
  const h = {
    'Client Name': name || 'Not given',
    // Batch 332: the account Expert resolved (conversation, agents' notes) comes before the Desk link
    'Practice Name': A.name || H.account || (c.account && c.account.accountName) || 'Not linked',
    'Account Number': A.number || 'Not found',
    'Deal Stage': dealLine,
    'Callback Number': phoneFmt(t.phone || c.phone || c.mobile) || 'Not given',
    'Email': (fwd && fwd.email) || t.email || c.email || 'Not given',
    'Ticket Number': '#' + t.ticketNumber,
    'Any Escalation Ticket Open': escLine,
  };
  if (crm && crm.mismatch) { const m = crm.mismatch; h['Account Check'] = `This ticket is linked to ${m.linkedName} (${m.linkedNumber}), but ${crm.matchedBy || 'the client'} is ${m.number} (${m.name}). Please confirm with the client and correct the ticket's account.`; }
  return h;
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
    + `<div>Next Steps:</div>${list(s.next && s.next.length ? s.next : ['Nothing pending right now.'])}`;
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
  // Batch 332: conversation and agents' notes first, then the Desk link (see expert.resolveAccount)
  if (D.expert && D.expert.resolveAccount) { try { crm = await D.expert.resolveAccount(String(t.ticketNumber), tk); } catch (e) { crm = null; } if (crm && crm.unmatched) crm = null; }
  else {
    try { crm = D.expert && D.expert.crmContext ? await D.expert.crmContext(String(t.ticketNumber)) : null; } catch (e) { /* none */ }
    if (!crm && tk && tk.meta && tk.meta.idents && D.expert && D.expert._matchAccount) { const m = await D.expert._matchAccount(tk.meta.idents).catch(() => null); if (m && !m.none && /email|account number/i.test(m.matchedBy || '')) crm = m; }
  }
  // Batch 333: agents write the deal line as the owner's Desk team (their pod) and full name, e.g. "Pod 21 | Kane Thompson"
  if (crm) {
    const TR = D.transfer || require('./transfer-review'), F = crm.facts || {}, H = crm.header || {};
    const team = async (n) => n ? await TR.teamOfName(n).catch(() => null) : null;
    crm.pods = { csm: await team(F.csm || H.csm), ob: await team(F.ob || H.ob) };
  }
  const idn = (tk && tk.meta && tk.meta.idents) || {};
  if (idn.escAlert) crm = Object.assign(crm || { header: {}, facts: null }, { escAlert: idn.escAlert });
  // Batch 332: learn from agents. An account number an agent documented on this ticket is remembered for this client's
  // email, so their next ticket starts from the right account even when Desk links another one.
  try {
    let W = new Set(); try { W = await require('./expert-desk-draft').writers(); } catch (e) { /* none */ }
    const human = (idn.noteAccts || []).filter((x) => x.by && !W.has(String(x.by)));
    if (human.length && idn.emails && idn.emails[0]) { const last = human[human.length - 1]; await saveHint(idn.emails[0], last.n, last.name, String(t.ticketNumber)); }
  } catch (e) { /* best effort */ }
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
    const fixedBy = await refreshHeader(id, row.init_id, header(t, crm, fwd)).catch(() => '');
    const html = updateHtml(s, fixedBy);
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

// Batch 332: when the account, deal or escalation in the first note no longer matches what the ticket shows (an agent
// documented the right account, or the client gave their number later), the first note's header is corrected in place.
// Returns a line for the case update, or '' when nothing changed.
const HKEYS = ['Practice Name', 'Account Number', 'Deal Stage', 'Any Escalation Ticket Open'];
async function refreshHeader(id, initId, h) {
  if (!initId || !h) return '';
  const cm = await read(`/tickets/${id}/comments?limit=100`).catch(() => null);
  const c = ((cm && cm.data) || []).find((x) => String(x.id) === String(initId));
  if (!c) return '';
  const html0 = String(c.content || '').replace(/zsu\[zsu\[#(\d+):\d+:\d+\]zsu:\d+:\d+\]zsu/g, '#$1').replace(/zsu\[#(\d+):\d+:\d+\]zsu/g, '#$1');
  const m = html0.match(/^<div>([\s\S]*?)<\/div>/);
  if (!m) return '';
  const val = (k) => { const r = m[1].match(new RegExp(k.replace(/ /g, '\\s') + ':\\s*([^<]*)')); return r ? r[1].replace(/&amp;/g, '&').trim() : ''; };
  const changed = HKEYS.filter((k) => h[k] && val(k) && val(k) !== String(h[k]).trim()) .concat(h['Account Check'] && !/Account Check:/.test(m[1]) ? ['Account Check'] : []);
  if (!changed.length) return '';
  const newHead = `<div>${Object.entries(h).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>`;
  await patch(id, initId, html0.replace(/^<div>[\s\S]*?<\/div>/, newHead));
  const was = val('Account Number'), now = h['Account Number'];
  return was !== now && /^\d+$/.test(String(now)) ? `First note corrected: account ${now} (${h['Practice Name']}) instead of ${was || 'none'}.` : 'First note corrected: ' + changed.join(', ') + ' updated.';
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
  // Batch 331: a bare "No", "Yes" or "None" is a field value, never a bullet of its own
  const pick = (keys) => [].concat(...keys.filter((k) => !skip(fields[k])).map((k) => splitter(fields[k]))).filter((x) => String(x).trim().length > 3 && !/^(no|yes|none|nothing|n\/a)\.?$/i.test(String(x).trim()));
  return { query: fields['Reason for contact'] || '', trouble: pick(SPLIT_KEYS.trouble).slice(0, 7), next: pick(SPLIT_KEYS.next).slice(0, 6) };
}
async function withLead(ticketId, lead, extraNext, dropNext) {
  const r = await get(`SELECT trouble, next FROM ticket_doc_notes WHERE ticket_id = ?`, [String(ticketId)]).catch(() => null);
  const s = { trouble: r ? JSON.parse(r.trouble || '[]') : [], next: (r ? JSON.parse(r.next || '[]') : []) };
  if (dropNext) s.next = s.next.filter((x) => !dropNext.test(String(x))); // Batch 331
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

// Batch 331: first notes written before the escalation fix said "Yes - Never escalated" or showed "[object". The
// tool's own first notes from the last 4 days are corrected in place, once after a restart.
let _fixed = false;
async function fixHeaders() {
  const rows = await all(`SELECT ticket_id, init_id FROM ticket_doc_notes WHERE init_id IS NOT NULL AND created_at > datetime('now', '-4 days')`).catch(() => []);
  let n = 0;
  for (const r of rows) {
    const cm = await read(`/tickets/${r.ticket_id}/comments?limit=100`).catch(() => null);
    const c = ((cm && cm.data) || []).find((x) => String(x.id) === String(r.init_id));
    if (!c) continue;
    // Desk returns ticket links as zsu[#number:id:id]zsu; sent back as-is they get wrapped twice, so they go back as #number.
    const raw0 = String(c.content || ''), corrupted = /zsu\[zsu\[/.test(raw0);
    const html0 = raw0.replace(/zsu\[zsu\[#(\d+):\d+:\d+\]zsu:\d+:\d+\]zsu/g, '#$1').replace(/zsu\[#(\d+):\d+:\d+\]zsu/g, '#$1');
    let fixed = html0.replace(/(Any Escalation Ticket Open:\s*)Yes - [^<]*?(Never escalated|never escalated)[^<]*/, '$1No')
      .replace(/(Any Escalation Ticket Open:\s*Yes - [^<]*?)\s*\|?\s*\[object[^<]*/, '$1')
      .replace(/(Any Escalation Ticket Open:\s*Yes - )Escalated \(Tier (\d)\):\s*Tier \d/, '$1Tier $2');
    if (fixed !== html0 || corrupted) await W().note(r.ticket_id, { id: r.init_id }, fixed).then(() => n++).catch((e) => console.warn('doc note header fix:', e.message));
    // Batch 332: an agent documented a different account (or the T1 automation flagged an escalation) on this ticket:
    // the first note is rebuilt from what the ticket shows, and the agent's account is remembered for the client.
    let Wr = new Set(); try { Wr = await require('./expert-desk-draft').writers(); } catch (e) { /* none */ }
    const ours = (fixed.match(/Account Number:\s*(\d{5})/) || [])[1] || '';
    const human = ((cm && cm.data) || []).filter((x) => !Wr.has(String(x.commenterId))).map((x) => (String(x.content || '').replace(/<[^>]+>/g, ' ').match(/\b(?:acct|account)\s*(?:no\.?|number|#)?\s*[:#-]?\s*(\d{5})\b/i) || [])[1]).filter(Boolean);
    const alert = ((cm && cm.data) || []).some((x) => /open Tier \d escalation/i.test(String(x.content || ''))) && /Escalation Ticket Open:\s*(No|Agent)/.test(fixed);
    const humanPod = ((cm && cm.data) || []).some((x) => !Wr.has(String(x.commenterId)) && /Deal Stage[^<]{0,40}\bPod\b/i.test(String(x.content || '').replace(/<[^>]+>/g, ' '))) && !/Deal Stage:\s*Pod \w+ \|/.test(fixed);
    if ((human.length && human[human.length - 1] !== ours) || alert || humanPod) {
      const t = await read(`/tickets/${r.ticket_id}?include=contacts,assignee`).catch(() => null);
      if (!t) continue;
      const { crm, fwd } = await context(t).catch(() => ({}));
      const line = await refreshHeader(r.ticket_id, r.init_id, header(t, crm, fwd)).catch((e) => { console.warn('doc note account fix:', e.message); return ''; });
      if (line) n++;
    }
  }
  return n;
}
// Every few minutes: the T1 agents' tickets that changed recently get their first note, or an updated case note.
let _last = 0;
async function sweep({ ownerIds = [], max = 12 } = {}) {
  if (!_db || !enabled()) return { skipped: true };
  if (!_fixed) { _fixed = true; await fixHeaders().catch((e) => console.warn('doc note header fix:', e.message)); }
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
module.exports = { hintFor, saveHint, refreshHeader, withLead, setDB, setDeps, initSchema, touch, sweep, status, header, initialHtml, updateHtml, fromExpertNote, fromDraft, noteId, keep, sections, signature, phoneFmt, OURS, enabled, _reset };
