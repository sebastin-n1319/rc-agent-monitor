/**
 * Ticket audits (Session 76).
 *
 * T1 agents sometimes move tickets to another team without a proper follow-up,
 * or with an incorrect or incomplete answer. SPOCs (existing agents or admins)
 * audit those tickets, document what was missed, and the ticket stays with the
 * agent until it is fixed. What SPOCs record turns into a rule list that
 * highlights similar tickets automatically, and into process and product
 * updates for the whole team.
 *
 * The app never changes tickets in Zoho: it tracks the audit, the SPOC acts
 * in Zoho through the ticket link.
 *
 * Tables: audit_spocs, audit_rules, audit_tickets, ticket_audit_log, audit_updates,
 * audit_settings. Ticket facts come from desk_ticket_snapshot and
 * desk_ticket_activity (lib/desk-lifecycle.js).
 */
let _db = null;
let _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign(_deps, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, n);
const noDash = (s) => String(s || '').replace(/[\u2014\u2013]/g, ',');
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

const STATUSES = ['pending', 'in_audit', 'returned', 'approved', 'closed'];
const OPEN = ['pending', 'in_audit', 'returned'];
const SEVERITY = { low: 1, medium: 2, high: 3 };
const DETECTORS = {
  manual: 'Checklist only (SPOC judges)',
  no_agent_reply: 'Agent never replied to the customer',
  no_acknowledgement: 'No acknowledgement email sent before the transfer',
  no_followups: 'Too few daily follow-up emails before the move (email and web tickets)',
  no_internal_note: 'No internal note on the ticket',
  quick_transfer: 'Transferred very soon after creation',
  repeat_transfer: 'Moved between teams several times',
  reopened: 'Ticket was reopened',
  category_team: 'Topic sent to the wrong team',
  subject_keyword: 'Subject matches a keyword',
};

const ACK_RULE = { title: 'Acknowledgement email not sent before the transfer', category: 'Follow-up', severity: 'high', detector: 'no_acknowledgement', description: 'Every ticket moved to another team needs an acknowledgement email to the customer first, so they know it was received and who is handling it next.' };
const FOLLOWUP_RULE = { title: 'Daily follow-up emails not sent before the transfer', category: 'Follow-up', severity: 'high', detector: 'no_followups', params: { count: 3 }, description: 'On email and web tickets where the customer has not replied, T1 sends one follow-up email a day for 3 days before the ticket goes to CSM for a follow-up call. T1 does not call out, set Pending Customer or park the ticket in the T1 queue.' };
const SEED_RULES = [
  ACK_RULE,
  FOLLOWUP_RULE,
  { title: 'Customer never replied to', category: 'Follow-up', severity: 'high', detector: 'no_agent_reply', description: 'The agent moved the ticket without sending the customer any reply. Customers should hear back from us before a transfer, saying what happens next.' },
  { title: 'No internal note explaining the transfer', category: 'Documentation', severity: 'medium', detector: 'no_internal_note', description: 'No private note was left for the receiving team. Every transfer needs a note: what the customer asked, what was checked, and why it is moving.' },
  { title: 'Transferred within minutes of creation', category: 'Triage', severity: 'medium', detector: 'quick_transfer', params: { minutes: 10 }, description: 'The ticket left T1 almost immediately, so the agent probably did not try to resolve or fully understand it first.' },
  { title: 'Moved between teams 3 or more times', category: 'Routing', severity: 'medium', detector: 'repeat_transfer', params: { count: 3 }, description: 'Repeated reassignments usually mean the first routing decision was wrong.' },
  { title: 'Ticket was reopened', category: 'Quality', severity: 'low', detector: 'reopened', description: 'The customer came back after the ticket was closed. Check whether the first answer was complete.' },
  { title: 'Incorrect answer given to the customer', category: 'Accuracy', severity: 'high', detector: 'manual', description: 'The agent told the customer something that is not correct for this product or process.' },
  { title: 'Incomplete answer', category: 'Accuracy', severity: 'medium', detector: 'manual', description: 'The answer left out a step, a detail or an option the customer needed.' },
  { title: 'Transferred to the wrong team', category: 'Routing', severity: 'high', detector: 'manual', description: 'Another team owns this kind of issue.' },
  { title: 'Promised follow-up not done', category: 'Follow-up', severity: 'high', detector: 'manual', description: 'The agent promised a callback or update and it did not happen before the transfer.' },
];

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS audit_spocs (
    email TEXT PRIMARY KEY, name TEXT, active INTEGER NOT NULL DEFAULT 1,
    added_by TEXT, added_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS audit_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT, description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium', detector TEXT NOT NULL DEFAULT 'manual', params TEXT,
    enabled INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'manual',
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS audit_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL UNIQUE, ticket_number TEXT, subject TEXT,
    agent_email TEXT, agent_name TEXT, transferred_at TEXT, dest_group TEXT,
    status TEXT NOT NULL DEFAULT 'pending', spoc_email TEXT, assigned_at TEXT, source TEXT NOT NULL DEFAULT 'auto',
    flags TEXT, verdict TEXT, summary TEXT, findings TEXT, completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_tickets_status ON audit_tickets(status, spoc_email)`);
  await run(`CREATE TABLE IF NOT EXISTS ticket_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, audit_id INTEGER NOT NULL, at TEXT DEFAULT (datetime('now')), actor TEXT, action TEXT, note TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS audit_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'process', title TEXT NOT NULL, body TEXT,
    rule_ids TEXT, status TEXT NOT NULL DEFAULT 'draft', audience TEXT DEFAULT 'agents', notice_id INTEGER,
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')), published_by TEXT, published_at TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS audit_settings (key TEXT PRIMARY KEY, value TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS audit_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL, evidence TEXT,
    status TEXT NOT NULL DEFAULT 'new', batch TEXT, created_at TEXT DEFAULT (datetime('now')), decided_by TEXT, decided_at TEXT)`);
  const cols = (await all(`PRAGMA table_info(audit_tickets)`)).map(c => c.name);
  for (const [c, d] of [['ai_signals', 'TEXT'], ['ai_priority', 'INTEGER NOT NULL DEFAULT 0'], ['ai_summary', 'TEXT'], ['ai_scanned_at', 'TEXT'], ['ai_source', 'TEXT']]) {
    if (!cols.includes(c)) await run(`ALTER TABLE audit_tickets ADD COLUMN ${c} ${d}`);
  }
  const n = await get(`SELECT COUNT(*) AS n FROM audit_rules`);
  if (!n || !n.n) {
    for (const r of SEED_RULES) {
      await run(`INSERT INTO audit_rules (title, category, description, severity, detector, params, source, created_by) VALUES (?,?,?,?,?,?, 'seed', 'system')`,
        [r.title, r.category, r.description, r.severity, r.detector, r.params ? JSON.stringify(r.params) : null]);
    }
  }
  const hasAck = await get(`SELECT id FROM audit_rules WHERE detector = 'no_acknowledgement'`);
  if (!hasAck) await run(`INSERT INTO audit_rules (title, category, description, severity, detector, params, source, created_by) VALUES (?,?,?,?,?,NULL,'seed','system')`, [ACK_RULE.title, ACK_RULE.category, ACK_RULE.description, ACK_RULE.severity, ACK_RULE.detector]);
  const hasFu = await get(`SELECT id FROM audit_rules WHERE detector = 'no_followups'`);
  if (!hasFu) await run(`INSERT INTO audit_rules (title, category, description, severity, detector, params, source, created_by) VALUES (?,?,?,?,?,?,'seed','system')`, [FOLLOWUP_RULE.title, FOLLOWUP_RULE.category, FOLLOWUP_RULE.description, FOLLOWUP_RULE.severity, FOLLOWUP_RULE.detector, JSON.stringify(FOLLOWUP_RULE.params)]);
  if (!(await getSetting('queue_since'))) await setSetting('queue_since', new Date(Date.now() - 14 * 864e5).toISOString());
  if ((await getSetting('auto_queue')) == null) await setSetting('auto_queue', '1');
  if ((await getSetting('auto_analyze')) == null) await setSetting('auto_analyze', '1');
}

async function getSetting(k) { const r = await get(`SELECT value FROM audit_settings WHERE key = ?`, [k]); return r ? r.value : null; }
async function setSetting(k, v) { await run(`INSERT OR REPLACE INTO audit_settings (key, value) VALUES (?, ?)`, [k, v == null ? null : String(v)]); }
async function logEvent(auditId, actor, action, note) { await run(`INSERT INTO ticket_audit_log (audit_id, actor, action, note) VALUES (?,?,?,?)`, [auditId, lc(actor), action, clean(note, 400)]).catch(() => {}); }

// ── access ──────────────────────────────────────────────────────────────
async function spocRow(email) { return get(`SELECT * FROM audit_spocs WHERE email = ? AND active = 1`, [lc(email)]); }
async function accessFor(email, isAdmin) {
  const sp = await spocRow(email);
  return { admin: !!isAdmin, spoc: !!sp, access: !!isAdmin || !!sp };
}

// ── rules ───────────────────────────────────────────────────────────────
function parseJSON(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function shapeRule(r) { return { ...r, params: parseJSON(r.params, {}), enabled: !!r.enabled, detectorLabel: DETECTORS[r.detector] || r.detector }; }
async function listRules({ withStats = true } = {}) {
  const rules = (await all(`SELECT * FROM audit_rules ORDER BY enabled DESC, CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, title COLLATE NOCASE`)).map(shapeRule);
  if (withStats) {
    const stats = {};
    const rows = await all(`SELECT flags, findings FROM audit_tickets`);
    for (const r of rows) {
      for (const f of parseJSON(r.flags, [])) { const s = stats[f.rule_id] = stats[f.rule_id] || { flagged: 0, confirmed: 0 }; s.flagged++; }
      for (const f of parseJSON(r.findings, [])) { if (f.rule_id == null) continue; const s = stats[f.rule_id] = stats[f.rule_id] || { flagged: 0, confirmed: 0 }; s.confirmed++; }
    }
    for (const r of rules) { const s = stats[r.id] || { flagged: 0, confirmed: 0 }; r.flagged = s.flagged; r.confirmed = s.confirmed; }
  }
  return rules;
}
function cleanRuleInput(b) {
  const title = clean(b.title, 140);
  if (!title) throw fail('Add a rule title');
  const detector = DETECTORS[b.detector] ? b.detector : 'manual';
  const severity = SEVERITY[b.severity] ? b.severity : 'medium';
  let params = {};
  const p = b.params || {};
  if (detector === 'quick_transfer') params = { minutes: Math.max(1, Math.min(240, Number(p.minutes) || 10)) };
  if (detector === 'no_followups') params = { count: Math.max(1, Math.min(7, Number(p.count) || 3)) };
  if (detector === 'repeat_transfer') params = { count: Math.max(2, Math.min(10, Number(p.count) || 3)) };
  if (detector === 'category_team' || detector === 'subject_keyword') {
    const pattern = clean(p.pattern, 200);
    if (!pattern) throw fail('Add the words to look for (separate several with |)');
    try { new RegExp(pattern, 'i'); } catch (e) { throw fail('Those words could not be read, avoid special characters'); }
    params = { pattern };
    if (detector === 'category_team') {
      const expected = clean(p.expected, 20).toUpperCase();
      if (!expected) throw fail('Choose which team should receive this topic');
      params.expected = expected;
    }
  }
  return { title, category: clean(b.category, 60) || 'General', description: clean(b.description, 600), severity, detector, params: Object.keys(params).length ? JSON.stringify(params) : null, enabled: b.enabled === false ? 0 : 1 };
}
async function createRule(by, b, source = 'manual') {
  const r = cleanRuleInput(b);
  const x = await run(`INSERT INTO audit_rules (title, category, description, severity, detector, params, enabled, source, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
    [r.title, r.category, r.description, r.severity, r.detector, r.params, r.enabled, source, lc(by)]);
  return x.lastID;
}
async function updateRule(id, b) {
  const ex = await get(`SELECT * FROM audit_rules WHERE id = ?`, [id]);
  if (!ex) throw fail('Rule not found', 404);
  const r = cleanRuleInput({ ...shapeRule(ex), ...b, params: b.params !== undefined ? b.params : parseJSON(ex.params, {}) });
  await run(`UPDATE audit_rules SET title=?, category=?, description=?, severity=?, detector=?, params=?, enabled=?, updated_at=datetime('now') WHERE id=?`,
    [r.title, r.category, r.description, r.severity, r.detector, r.params, b.enabled === undefined ? ex.enabled : r.enabled, id]);
}
async function deleteRule(id) { await run(`DELETE FROM audit_rules WHERE id = ?`, [id]); }

// ── ticket facts and flags ──────────────────────────────────────────────
async function ticketFacts(ticketId, agentEmail) {
  const snap = await get(`SELECT ticket_id, ticket_number, subject, status, created_time, closed_time, web_url, reassign_count, reopen_count,
      team_name, department_name, category, ai_category, manual_category, module, channel, account_name, assignee_name
      FROM desk_ticket_snapshot WHERE ticket_id = ?`, [String(ticketId)]);
  const act = await all(`SELECT source, created_time, kind, detail, author_email FROM desk_ticket_activity WHERE ticket_id = ? ORDER BY created_time`, [String(ticketId)]);
  const mine = act.filter(a => a.author_email === lc(agentEmail));
  return { snap, activity: act, mine };
}
function groupOfTeam(name) { try { return require('./desk-lifecycle').groupFromZohoTeam(name); } catch (e) { return null; } }
function evaluateRules(rules, facts, transferredAt, destGroup) {
  const flags = [];
  const { snap, mine } = facts;
  if (!snap) return flags;
  const replies = mine.filter(a => a.source === 'thread');
  const notes = mine.filter(a => a.source === 'comment');
  const text = [snap.subject, snap.category, snap.ai_category, snap.manual_category, snap.module].filter(Boolean).join(' ');
  for (const r of rules) {
    if (!r.enabled) continue;
    const p = r.params || {};
    let hit = null;
    if (r.detector === 'no_agent_reply' && !replies.length) hit = 'No reply from the agent is recorded on this ticket.';
    else if (r.detector === 'no_acknowledgement') {
      const t = Date.parse(transferredAt);
      const before = replies.filter(a => !t || Date.parse(a.created_time) <= t + 10 * 60000);
      if (!before.length) hit = replies.length ? 'The first reply came after the ticket had already moved.' : 'No acknowledgement email from the agent is recorded before the transfer.';
    }
    else if (r.detector === 'no_followups') {
      const need = p.count || 3;
      const ch = String(snap.channel || '');
      if (/e-?mail|web|form/i.test(ch)) {
        const t = Date.parse(transferredAt);
        const outAll = facts.activity.filter(a => a.source === 'thread').length;
        const customerMsgs = (snap.thread_count || 0) - outAll;
        const sorted = replies.filter(a => !t || Date.parse(a.created_time) <= t + 10 * 60000).sort((a, b) => String(a.created_time).localeCompare(String(b.created_time)));
        if (customerMsgs <= 1 && sorted.length) {
          const firstDay = String(sorted[0].created_time).slice(0, 10);
          const days = new Set(sorted.slice(1).map(a => String(a.created_time).slice(0, 10)).filter(d => d !== firstDay));
          if (days.size < need) hit = `${ch} ticket with no customer reply: ${days.size} follow-up day${days.size === 1 ? '' : 's'} recorded after the first reply, ${need} expected before moving it.`;
        } else if (customerMsgs <= 1 && !sorted.length) hit = `${ch} ticket with no customer reply and no follow-up emails recorded before the move.`;
      }
    }
    else if (r.detector === 'no_internal_note' && !notes.length) hit = 'No internal note from the agent is recorded on this ticket.';
    else if (r.detector === 'quick_transfer') {
      const created = Date.parse(snap.created_time), t = Date.parse(transferredAt);
      const mins = (p.minutes || 10);
      if (created && t && t - created <= mins * 60000) hit = `Moved ${Math.max(0, Math.round((t - created) / 60000))} min after the ticket was created.`;
    } else if (r.detector === 'repeat_transfer' && (snap.reassign_count || 0) >= (p.count || 3)) hit = `Reassigned ${snap.reassign_count} times.`;
    else if (r.detector === 'reopened' && (snap.reopen_count || 0) >= 1) hit = `Reopened ${snap.reopen_count} time${snap.reopen_count > 1 ? 's' : ''}.`;
    else if (r.detector === 'category_team' && p.pattern && destGroup && destGroup !== p.expected) {
      try { if (new RegExp(p.pattern, 'i').test(text)) hit = `Looks like a ${p.expected} topic but it went to ${destGroup}.`; } catch (e) { /* ignore bad pattern */ }
    } else if (r.detector === 'subject_keyword' && p.pattern) {
      try { if (new RegExp(p.pattern, 'i').test(text)) hit = 'Subject or category matches this rule.'; } catch (e) { /* ignore */ }
    }
    if (hit) flags.push({ rule_id: r.id, title: r.title, severity: r.severity, why: hit });
  }
  flags.sort((a, b) => (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0));
  return flags;
}
async function refreshFlags(auditId) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [auditId]);
  if (!a) return [];
  const rules = (await all(`SELECT * FROM audit_rules WHERE enabled = 1`)).map(shapeRule);
  const facts = await ticketFacts(a.ticket_id, a.agent_email);
  const flags = evaluateRules(rules, facts, a.transferred_at, a.dest_group);
  await run(`UPDATE audit_tickets SET flags = ?, updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(flags), auditId]);
  return flags;
}

// ── assignment ──────────────────────────────────────────────────────────
async function pickSpoc(excludeEmail) {
  const spocs = await all(`SELECT email FROM audit_spocs WHERE active = 1`);
  const pool = spocs.filter(s => s.email !== lc(excludeEmail));
  if (!pool.length) return null;
  const load = await all(`SELECT spoc_email, COUNT(*) AS n, MAX(assigned_at) AS last FROM audit_tickets WHERE status IN ('pending','in_audit','returned') AND spoc_email IS NOT NULL GROUP BY spoc_email`);
  const byEmail = {}; for (const l of load) byEmail[l.spoc_email] = l;
  pool.sort((a, b) => ((byEmail[a.email] || {}).n || 0) - ((byEmail[b.email] || {}).n || 0) || String((byEmail[a.email] || {}).last || '').localeCompare(String((byEmail[b.email] || {}).last || '')));
  return pool[0].email;
}
async function assignUnassigned() {
  await run(`UPDATE audit_tickets SET spoc_email = NULL, updated_at = datetime('now') WHERE spoc_email IS NOT NULL AND spoc_email = agent_email AND status IN ('pending','in_audit')`);
  const rows = await all(`SELECT id, agent_email FROM audit_tickets WHERE spoc_email IS NULL AND status IN ('pending','in_audit') ORDER BY transferred_at`);
  let n = 0; const per = {};
  for (const r of rows) {
    const s = await pickSpoc(r.agent_email); if (!s) continue;
    await run(`UPDATE audit_tickets SET spoc_email = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [s, r.id]);
    await logEvent(r.id, 'system', 'assigned', s); per[s] = (per[s] || 0) + 1; n++;
  }
  return { assigned: n, per };
}

async function addAudit({ ticketId, ticketNumber, subject, agentEmail, agentName, transferredAt, destGroup, source, by }) {
  const ex = await get(`SELECT id FROM audit_tickets WHERE ticket_id = ?`, [String(ticketId)]);
  if (ex) return { id: ex.id, existed: true };
  const spoc = await pickSpoc(agentEmail);
  const x = await run(`INSERT INTO audit_tickets (ticket_id, ticket_number, subject, agent_email, agent_name, transferred_at, dest_group, status, spoc_email, assigned_at, source)
    VALUES (?,?,?,?,?,?,?,'pending',?,${spoc ? "datetime('now')" : 'NULL'},?)`,
    [String(ticketId), ticketNumber, clean(subject, 300), lc(agentEmail), agentName || null, transferredAt || null, destGroup || null, spoc, source || 'auto']);
  await refreshFlags(x.lastID);
  await logEvent(x.lastID, by || 'system', source === 'manual' ? 'added' : 'queued', spoc ? 'assigned to ' + spoc : 'no SPOC available');
  kickScan();
  return { id: x.lastID, existed: false, spoc };
}

/** Auto-queue: every ticket a monitored agent moved out of T1 since the cut-off date. */
async function enqueueTransfers({ agentNames = {} } = {}) {
  if ((await getSetting('auto_queue')) === '0') return { queued: 0, skipped: 'auto queue is off' };
  const since = (await getSetting('queue_since')) || new Date(Date.now() - 14 * 864e5).toISOString();
  const rows = await all(
    `SELECT a.ticket_id, a.author_email, a.created_time, a.detail AS dest, s.ticket_number, s.subject
       FROM desk_ticket_activity a JOIN desk_ticket_snapshot s ON s.ticket_id = a.ticket_id
      WHERE a.source = 'history' AND a.kind = 'team_out' AND a.created_time >= ?
        AND a.ticket_id NOT IN (SELECT ticket_id FROM audit_tickets)
      ORDER BY a.created_time`, [since]);
  const seen = new Set(); let queued = 0; const per = {};
  for (const r of rows) {
    if (seen.has(r.ticket_id)) continue; seen.add(r.ticket_id);
    const res = await addAudit({ ticketId: r.ticket_id, ticketNumber: r.ticket_number, subject: r.subject, agentEmail: r.author_email, agentName: agentNames[r.author_email] || null, transferredAt: r.created_time, destGroup: r.dest, source: 'auto' });
    if (!res.existed) { queued++; if (res.spoc) per[res.spoc] = (per[res.spoc] || 0) + 1; }
  }
  const un = await assignUnassigned();
  for (const [e, n] of Object.entries(un.per)) per[e] = (per[e] || 0) + n;
  if (_deps.notices) {
    for (const [e, n] of Object.entries(per)) {
      await _deps.notices.notifyPerson(e, { title: n === 1 ? '1 new ticket to audit' : `${n} new tickets to audit`, body: 'Open Ticket audits to review them.', link: 'app:audits', category: 'process' }).catch(() => {});
    }
  }
  return { queued, assigned: per };
}

// ── queue and detail ────────────────────────────────────────────────────
function shapeAudit(a) {
  const flags = parseJSON(a.flags, []);
  const aiSignals = parseJSON(a.ai_signals, []);
  return { ...a, flags, findings: parseJSON(a.findings, []), aiSignals,
    flagScore: flags.reduce((s, f) => s + (SEVERITY[f.severity] || 1), 0) + (a.ai_priority || 0) * 10 };
}
async function listQueue({ email, admin, status, spoc, agent, q, dest, signal, urgent, limit = 300 }) {
  const where = [], params = [];
  if (!admin) { where.push(`a.spoc_email = ? AND COALESCE(a.agent_email,'') != ?`); params.push(lc(email), lc(email)); }
  else if (spoc === 'none') where.push(`a.spoc_email IS NULL`);
  else if (spoc) { where.push(`a.spoc_email = ?`); params.push(lc(spoc)); }
  if (status === 'open') where.push(`a.status IN ('pending','in_audit','returned')`);
  else if (STATUSES.includes(status)) { where.push(`a.status = ?`); params.push(status); }
  if (agent) { where.push(`a.agent_email = ?`); params.push(lc(agent)); }
  if (dest) { where.push(`a.dest_group = ?`); params.push(String(dest).slice(0, 80)); }
  if (signal && SIGNALS[signal]) { where.push(`a.ai_signals LIKE ?`); params.push('%"key":"' + signal + '"%'); }
  if (urgent) where.push(`a.ai_priority >= 2`);
  if (q) { where.push(`(a.ticket_number LIKE ? OR a.subject LIKE ? OR a.agent_name LIKE ?)`); const t = `%${String(q).trim().slice(0, 60)}%`; params.push(t, t, t); }
  const rows = await all(`SELECT a.*, s.web_url AS web_url, sp.name AS spoc_name FROM audit_tickets a LEFT JOIN desk_ticket_snapshot s ON s.ticket_id = a.ticket_id LEFT JOIN audit_spocs sp ON sp.email = a.spoc_email
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.transferred_at DESC LIMIT ?`, [...params, limit]);
  return rows.map(shapeAudit);
}
async function counts({ email, admin }) {
  const rows = admin ? await all(`SELECT status, COUNT(*) AS n FROM audit_tickets GROUP BY status`)
    : await all(`SELECT status, COUNT(*) AS n FROM audit_tickets WHERE spoc_email = ? GROUP BY status`, [lc(email)]);
  const out = { pending: 0, in_audit: 0, returned: 0, approved: 0, closed: 0 };
  for (const r of rows) out[r.status] = r.n;
  out.open = out.pending + out.in_audit + out.returned;
  out.all = out.open + out.approved + out.closed;
  if (admin) { const u = await get(`SELECT COUNT(*) AS n FROM audit_tickets WHERE spoc_email IS NULL AND status IN ('pending','in_audit')`); out.unassigned = u ? u.n : 0; }
  return out;
}
const OWN_MSG = 'You handled this ticket, so another SPOC has to audit it';
async function canTouch(a, email, admin) {
  if (!a) return false;
  if (a.agent_email && a.agent_email === lc(email)) return false;
  return !!admin || a.spoc_email === lc(email);
}
async function getAudit(id, { email, admin }) {
  const a = await get(`SELECT a.*, s.web_url AS web_url, s.status AS zoho_status, s.created_time AS created_time, s.team_name AS team_name, s.channel AS channel, s.account_name AS account_name, s.assignee_name AS owner_name
      FROM audit_tickets a LEFT JOIN desk_ticket_snapshot s ON s.ticket_id = a.ticket_id WHERE a.id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(admin || (a.spoc_email === lc(email) && a.agent_email !== lc(email)))) throw fail('This audit is assigned to someone else', 403);
  const base = shapeAudit(a);
  base.own = !!a.agent_email && a.agent_email === lc(email);
  const facts = await ticketFacts(a.ticket_id, a.agent_email);
  const label = { thread: 'Replied to the customer', comment: 'Added an internal note', history: 'Updated the ticket' };
  base.timeline = facts.activity.filter(x => x.author_email === lc(a.agent_email)).map(x => ({
    at: x.created_time, type: x.source, kind: x.kind || null,
    text: x.source === 'history' ? (x.kind === 'team_out' ? 'Moved the ticket out of T1 to ' + (x.detail || 'another team') : (x.detail || label.history)) : label[x.source] || x.source }));
  base.log = await all(`SELECT at, actor, action, note FROM ticket_audit_log WHERE audit_id = ? ORDER BY id DESC LIMIT 40`, [id]);
  base.rules = await listRules({ withStats: false });
  return base;
}

async function startAudit(id, ctx) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail(a.agent_email && a.agent_email === lc(ctx.email) ? OWN_MSG : 'This audit is assigned to someone else', 403);
  if (a.status === 'pending') {
    await run(`UPDATE audit_tickets SET status='in_audit', updated_at=datetime('now') WHERE id=?`, [id]);
    await logEvent(id, ctx.email, 'started', '');
  }
  await refreshFlags(id);
}
async function submitAudit(id, ctx, b) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail(a.agent_email && a.agent_email === lc(ctx.email) ? OWN_MSG : 'This audit is assigned to someone else', 403);
  const verdict = b.verdict === 'correct' ? 'correct' : b.verdict === 'needs_fix' ? 'needs_fix' : null;
  if (!verdict) throw fail('Choose whether the transfer was correct or needs correction');
  const rules = await all(`SELECT id, title FROM audit_rules`);
  const titleById = {}; for (const r of rules) titleById[r.id] = r.title;
  const findings = [];
  for (const f of Array.isArray(b.findings) ? b.findings.slice(0, 30) : []) {
    let ruleId = f.rule_id == null || f.rule_id === '' ? null : Number(f.rule_id);
    if (ruleId != null && !titleById[ruleId]) ruleId = null;
    const note = clean(f.note, 600);
    let label = ruleId != null ? titleById[ruleId] : clean(f.label, 140);
    if (!label) continue;
    findings.push({ rule_id: ruleId, label, note });
  }
  if (verdict === 'needs_fix' && !findings.length) throw fail('Record at least one mistake so the agent knows what to fix');
  const summary = clean(b.summary, 800);
  const status = verdict === 'correct' ? 'approved' : 'returned';
  await run(`UPDATE audit_tickets SET verdict=?, summary=?, findings=?, status=?, completed_at=datetime('now'), updated_at=datetime('now'),
      spoc_email = COALESCE(spoc_email, ?) WHERE id=?`, [verdict, summary, JSON.stringify(findings), status, lc(ctx.email), id]);
  await logEvent(id, ctx.email, verdict === 'correct' ? 'approved' : 'returned_to_agent', findings.map(f => f.label).join('; '));
  if (_deps.notices && a.agent_email) {
    const body = verdict === 'correct'
      ? `Ticket #${a.ticket_number} was audited and the transfer looks good. Thank you for the clear handling.`
      : `Ticket #${a.ticket_number} needs correction before it moves on: ${findings.map(f => f.label).join(', ')}.${summary ? ' ' + summary : ''} Keep it with you until it is fixed.`;
    await _deps.notices.notifyPerson(a.agent_email, { title: verdict === 'correct' ? `Ticket #${a.ticket_number} audit: all good` : `Ticket #${a.ticket_number} audit feedback`, body, category: 'process', urgent: verdict === 'needs_fix' }).catch(() => {});
  }
  setTimeout(() => { maybeAutoAnalyze(); }, 50);
  let chat = null;
  if (verdict === 'needs_fix' && a.status !== 'returned' && _deps.chat) {
    try {
      const snap = await get(`SELECT web_url FROM desk_ticket_snapshot WHERE ticket_id = ?`, [a.ticket_id]);
      const sp = await get(`SELECT name FROM audit_spocs WHERE email = ?`, [lc(ctx.email)]);
      const nm = (sp && sp.name) || lc(ctx.email).split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      chat = await _deps.chat({ agentEmail: a.agent_email, agentName: a.agent_name, ticketNumber: a.ticket_number, subject: a.subject, url: snap && snap.web_url, dest: a.dest_group, auditorName: nm, findings, summary });
      await logEvent(id, 'system', chat.ok ? 'chat_alert_sent' : 'chat_alert_failed', chat.ok ? 'Live Ops alerts group' : (chat.error || 'failed'));
    } catch (e) { chat = { ok: false, error: 'Could not send the group message' }; }
  }
  return { status, chat };
}
async function closeAudit(id, ctx) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail(a.agent_email && a.agent_email === lc(ctx.email) ? OWN_MSG : 'This audit is assigned to someone else', 403);
  await run(`UPDATE audit_tickets SET status='closed', updated_at=datetime('now') WHERE id=?`, [id]);
  await logEvent(id, ctx.email, 'closed', 'ticket fixed and transferred correctly');
}
async function reopenAudit(id, ctx) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail(a.agent_email && a.agent_email === lc(ctx.email) ? OWN_MSG : 'This audit is assigned to someone else', 403);
  await run(`UPDATE audit_tickets SET status='in_audit', updated_at=datetime('now') WHERE id=?`, [id]);
  await logEvent(id, ctx.email, 'reopened', '');
}
async function reassign(id, by, spocEmail) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  const e = lc(spocEmail);
  if (e) { if (!(await spocRow(e))) throw fail('That person is not an active SPOC'); if (e === lc(a.agent_email)) throw fail('A SPOC cannot audit a ticket they handled themselves'); }
  await run(`UPDATE audit_tickets SET spoc_email=?, assigned_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [e || null, id]);
  await logEvent(id, by, 'reassigned', e || 'unassigned');
  if (e && _deps.notices) await _deps.notices.notifyPerson(e, { title: `Ticket #${a.ticket_number} assigned to you for audit`, body: 'Open Ticket audits to review it.', link: 'app:audits', category: 'process' }).catch(() => {});
}

/** Add a ticket by number (admin or SPOC). The agent is the monitored agent who moved it out of T1, else the one given. */
async function addManual({ ticketNumber, agentEmail, by, monitoredEmails = [], agentNames = {} }) {
  const num = String(ticketNumber || '').replace(/[^0-9]/g, '').slice(0, 12);
  if (!num) throw fail('Enter a ticket number');
  let snap = await get(`SELECT ticket_id, ticket_number, subject FROM desk_ticket_snapshot WHERE ticket_number = ?`, [num]);
  if (!snap && _deps.pin) {
    // Older than the volume keeps: copy it from AditKB first (Batch 152).
    try { await _deps.pin({ numbers: [num] }); } catch (e) {}
    snap = await get(`SELECT ticket_id, ticket_number, subject FROM desk_ticket_snapshot WHERE ticket_number = ?`, [num]);
  }
  if (!snap) throw fail(`Ticket #${num} is not in the synced data yet (new tickets arrive within about 20 minutes).`, 404);
  const ex = await get(`SELECT id FROM audit_tickets WHERE ticket_id = ?`, [snap.ticket_id]);
  if (ex) return { id: ex.id, existed: true };
  const mv = await get(`SELECT author_email, created_time, detail FROM desk_ticket_activity WHERE ticket_id = ? AND source='history' AND kind='team_out' ORDER BY created_time DESC LIMIT 1`, [snap.ticket_id]);
  let agent = mv ? mv.author_email : lc(agentEmail);
  if (!agent || (monitoredEmails.length && !monitoredEmails.includes(agent))) throw fail('Choose which agent this ticket belongs to');
  return addAudit({ ticketId: snap.ticket_id, ticketNumber: snap.ticket_number, subject: snap.subject, agentEmail: agent, agentName: agentNames[agent] || null,
    transferredAt: mv ? mv.created_time : new Date().toISOString(), destGroup: mv ? mv.detail : null, source: 'manual', by });
}

// ── SPOCs ───────────────────────────────────────────────────────────────
async function listSpocs() {
  const rows = await all(`SELECT * FROM audit_spocs ORDER BY active DESC, name COLLATE NOCASE`);
  const st = await all(`SELECT spoc_email, status, COUNT(*) AS n, AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at) - julianday(assigned_at)) * 24 END) AS hrs
      FROM audit_tickets WHERE spoc_email IS NOT NULL GROUP BY spoc_email, status`);
  const by = {};
  for (const s of st) { const o = by[s.spoc_email] = by[s.spoc_email] || { open: 0, done: 0, hrs: [] }; if (OPEN.includes(s.status)) o.open += s.n; else o.done += s.n; if (s.hrs != null) o.hrs.push(s.hrs); }
  return rows.map(r => { const o = by[r.email] || { open: 0, done: 0, hrs: [] };
    return { ...r, active: !!r.active, open: o.open, done: o.done, avgHours: o.hrs.length ? Math.round(o.hrs.reduce((a, b) => a + b, 0) / o.hrs.length * 10) / 10 : null }; });
}
async function addSpoc(by, email, name) {
  const e = lc(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw fail('Enter a valid email');
  await run(`INSERT INTO audit_spocs (email, name, active, added_by) VALUES (?,?,1,?) ON CONFLICT(email) DO UPDATE SET active=1, name=COALESCE(excluded.name, name)`, [e, clean(name, 80) || null, lc(by)]);
  const un = await assignUnassigned();
  if (_deps.notices) await _deps.notices.notifyPerson(e, { title: 'You are now a ticket audit SPOC', body: 'Open Ticket audits to see the tickets assigned to you.', link: 'app:audits', category: 'process' }).catch(() => {});
  return un;
}
async function setSpocActive(email, active) {
  await run(`UPDATE audit_spocs SET active=? WHERE email=?`, [active ? 1 : 0, lc(email)]);
  if (!active) { await run(`UPDATE audit_tickets SET spoc_email=NULL, updated_at=datetime('now') WHERE spoc_email=? AND status IN ('pending','in_audit')`, [lc(email)]); await assignUnassigned(); }
}
async function removeSpoc(email) {
  await setSpocActive(email, false);
  await run(`DELETE FROM audit_spocs WHERE email=?`, [lc(email)]);
}

// ── insights ────────────────────────────────────────────────────────────
// ── AI priority scan (frustration, missed follow-up, escalation, cancellation) ──
const SIGNALS = {
  frustrated: 'Frustrated customer',
  missed_followup: 'Missed follow-up',
  escalation: 'Escalation',
  cancellation: 'Cancellation risk',
};
const KEYWORDS = {
  cancellation: /\b(cancel(l?ing|l?ed|lation)?|terminat(e|ing|ion)|close my account|switch(ing)? (to|providers?)|not renew|stop (the )?service|refund)\b/i,
  escalation: /\b(escalat\w*|supervisor|manager|complain\w*|legal|lawyer|attorney|chargeback|dispute|speak to someone (else|higher))\b/i,
  frustrated: /\b(frustrat\w*|unacceptable|ridiculous|terrible|worst|angry|upset|disappointed|fed up|third time|again and again|still (not|waiting|broken)|nobody (has )?(called|replied|responded))\b/i,
  missed_followup: /\b(any update|still waiting|no one (has )?(called|replied|responded|got back)|haven'?t (heard|received)|following up|follow up again|waiting for (a )?(call|reply|response)|never (got|received) (a )?(call|reply))\b/i,
};
function keywordSignals(text) {
  const out = [];
  for (const k of Object.keys(KEYWORDS)) {
    const m = KEYWORDS[k].exec(text);
    if (m) out.push({ key: k, evidence: 'Mentions "' + clean(m[0], 40) + '"' });
  }
  return out;
}
function priorityFrom(signals, aiLevel) {
  const keys = new Set(signals.map(x => x.key));
  let p = Math.max(0, Math.min(3, Number(aiLevel) || 0));
  if (keys.size) p = Math.max(p, 1);
  if (keys.has('cancellation') || keys.has('escalation')) p = Math.max(p, 2);
  if (keys.size >= 3) p = 3;
  return p;
}
async function readConversation(ticketId) {
  let ds = null; try { ds = require('./desk-service'); } catch (e) { return null; }
  if (!ds.isConfigured || !ds.isConfigured()) return null;
  const [t, th, cm] = await Promise.all([
    ds.fetchRaw(`/tickets/${ticketId}`).catch(() => null),
    ds.fetchRaw(`/tickets/${ticketId}/threads?limit=100`).catch(() => null),
    ds.fetchRaw(`/tickets/${ticketId}/comments?limit=100`).catch(() => null),
  ]);
  if (!t && !th) return null;
  const strip = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = [];
  const desc = strip(t && (t.description || t.subject));
  if (desc) lines.push('TICKET DESCRIPTION: ' + desc.slice(0, 900));
  const events = [];
  for (const x of ((th && th.data) || [])) events.push({ at: x.createdTime, who: x.direction === 'in' ? 'CUSTOMER' : 'AGENT', text: strip(x.summary || x.content) });
  for (const x of ((cm && cm.data) || [])) events.push({ at: x.commentedTime || x.createdTime, who: 'INTERNAL NOTE', text: strip(x.content) });
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const e of events.slice(-24)) if (e.text) lines.push(`[${e.who} ${String(e.at || '').slice(0, 10)}] ${e.text.slice(0, 380)}`);
  return { text: lines.join('\n'), count: events.length, sentiment: t && t.sentiment };
}
async function scanAudit(auditId) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [auditId]);
  if (!a) return { ok: false };
  let conv = null;
  try { conv = await readConversation(a.ticket_id); } catch (e) { conv = null; }
  const text = (conv && conv.text) || ('SUBJECT: ' + (a.subject || ''));
  let signals = [], aiLevel = 0, summary = '', source = 'keywords';
  if (aiReady() && conv && conv.text) {
    try {
      const system = `You triage support tickets that a T1 agent moved to another team. Read the customer description and conversation and flag only what is clearly there.
Signals (use these exact keys): frustrated (customer shows anger, impatience or repeated chasing), missed_followup (customer waited or chased, or the agent promised an update or callback that is not shown), escalation (asks for a manager, threatens complaint, legal or chargeback), cancellation (wants to cancel, leave, switch provider or not renew).
Return JSON only: {"signals":[{"key":"frustrated|missed_followup|escalation|cancellation","evidence":"under 14 words, plain"}],"priority":0-3,"summary":"one calm sentence, under 22 words, what the SPOC should look at first"}.
priority: 0 nothing notable, 1 mild, 2 needs attention soon, 3 urgent (cancellation or escalation with anger). Do not use em dashes. Do not invent facts.`;
      const r = await _deps.ai.bestJSON({ system, user: text.slice(0, 7000), maxTokens: 450, feature: 'analyze', timeoutMs: 40000 });
      const j = r && r.json;
      if (j && Array.isArray(j.signals)) {
        const seen = new Set();
        for (const x of j.signals.slice(0, 4)) { const k = String(x.key || ''); if (SIGNALS[k] && !seen.has(k)) { seen.add(k); signals.push({ key: k, evidence: clean(noDash(x.evidence), 120) }); } }
        aiLevel = Number(j.priority) || 0; summary = clean(noDash(j.summary), 220); source = 'ai';
      }
    } catch (e) { /* fall back to keywords */ }
  }
  if (source !== 'ai') { signals = keywordSignals(text); }
  const priority = priorityFrom(signals, aiLevel);
  await run(`UPDATE audit_tickets SET ai_signals=?, ai_priority=?, ai_summary=?, ai_scanned_at=datetime('now'), ai_source=?, updated_at=datetime('now') WHERE id=?`,
    [JSON.stringify(signals), priority, summary || null, source, auditId]);
  if (priority >= 2 && !a.ai_scanned_at) await logEvent(auditId, 'system', 'priority_flag', signals.map(x => SIGNALS[x.key]).join(', '));
  return { ok: true, priority, signals };
}
let _scanRunning = false, _scanTimer = null;
async function scanPending({ limit = 40, force = false } = {}) {
  if (_scanRunning) return { scanned: 0, busy: true };
  _scanRunning = true; let n = 0;
  try {
    const rows = await all(`SELECT id FROM audit_tickets WHERE status IN ('pending','in_audit','returned') ${force ? '' : 'AND ai_scanned_at IS NULL'} ORDER BY transferred_at DESC LIMIT ?`, [limit]);
    for (const r of rows) { await scanAudit(r.id).catch(() => {}); n++; await new Promise(res => setTimeout(res, 300)); }
  } finally { _scanRunning = false; }
  return { scanned: n };
}
function kickScan() {
  if (_scanTimer) return;
  _scanTimer = setTimeout(async () => {
    _scanTimer = null;
    try { const r = await scanPending({ limit: 40 }); if (r.scanned >= 40) kickScan(); } catch (e) { /* ignore */ }
  }, 3000);
  if (_scanTimer.unref) _scanTimer.unref();
}
async function unscannedCount() { const r = await get(`SELECT COUNT(*) AS n FROM audit_tickets WHERE status IN ('pending','in_audit','returned') AND ai_scanned_at IS NULL`); return r ? r.n : 0; }

// ── even redistribution ──────────────────────────────────────────────────
/** Reshuffle every pending ticket round-robin so each active SPOC carries the same load.
 *  Tickets already in audit or returned stay put but count toward each SPOC's load. */
async function rebalance(by) {
  const spocs = (await all(`SELECT email, name FROM audit_spocs WHERE active = 1 ORDER BY email`));
  if (!spocs.length) throw fail('Add at least one active SPOC first');
  const fixed = await all(`SELECT spoc_email, COUNT(*) AS n FROM audit_tickets WHERE status IN ('in_audit','returned') AND spoc_email IS NOT NULL GROUP BY spoc_email`);
  const load = {}; for (const sp of spocs) load[sp.email] = 0;
  for (const f of fixed) if (f.spoc_email in load) load[f.spoc_email] += f.n;
  const rows = await all(`SELECT id, agent_email, spoc_email FROM audit_tickets WHERE status = 'pending' ORDER BY ai_priority DESC, transferred_at ASC`);
  const gained = {}; let moved = 0; const per = {};
  for (const r of rows) {
    const pool = spocs.filter(sp => sp.email !== lc(r.agent_email));
    pool.sort((a, b) => (load[a.email] - load[b.email]) || ((gained[a.email] || 0) - (gained[b.email] || 0)) || a.email.localeCompare(b.email));
    const pick = pool.length ? pool[0].email : null;
    if (pick) { load[pick]++; gained[pick] = (gained[pick] || 0) + 1; per[pick] = (per[pick] || 0) + 1; }
    if (pick !== r.spoc_email) {
      await run(`UPDATE audit_tickets SET spoc_email = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [pick, r.id]);
      await logEvent(r.id, by || 'system', 'rebalanced', pick || 'no SPOC available'); moved++;
    }
  }
  if (moved && _deps.notices) {
    for (const [e, n] of Object.entries(per)) await _deps.notices.notifyPerson(e, { title: 'Audit queue rebalanced', body: `You now have ${n} pending ticket${n === 1 ? '' : 's'} to audit.`, link: 'app:audits', category: 'process' }).catch(() => {});
  }
  return { moved, total: rows.length, per };
}

// ── ticket story: current status, conversation pointers and important changes ──
const _storyCache = new Map();
const stripHtml = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const isoOf = (v) => { const t = Date.parse(v); return isNaN(t) ? null : new Date(t).toISOString(); };
const fullName = (o) => o ? (clean(o.name || [o.firstName, o.lastName].filter(Boolean).join(' '), 60) || '') : '';
function historyToEvents(items, names) {
  const val = (x) => { if (x == null) return ''; if (typeof x === 'object') return String(x.name || x.value || x.label || x.id || ''); return names[String(x)] || String(x); };
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    const at = isoOf(it.eventTime); if (!at) continue;
    const who = fullName(it.actor) || 'Someone';
    const ev = String(it.eventName || '');
    let info = it.eventInfo; if (info && !Array.isArray(info)) info = [info];
    let any = false;
    for (const i of info || []) {
      if (!i || typeof i !== 'object') continue;
      const pn = String(i.propertyName || i.name || '');
      const pv = i.propertyValue && typeof i.propertyValue === 'object' ? i.propertyValue : null;
      const prev = pv ? val(pv.previousValue) : '', next = pv ? val(pv.updatedValue) : '';
      let kind = null, label = '';
      if (/status/i.test(pn)) { kind = 'status'; label = 'the status'; }
      else if (/team/i.test(pn)) { kind = 'team'; label = 'the team'; }
      else if (/assignee|owner/i.test(pn)) { kind = 'owner'; label = 'the owner'; }
      else if (/priority/i.test(pn)) { kind = 'priority'; label = 'the priority'; }
      else if (/department/i.test(pn)) { kind = 'team'; label = 'the department'; }
      else if (/escalat/i.test(pn)) { kind = 'status'; label = 'escalation'; }
      if (kind && (prev || next)) { any = true; out.push({ at, kind, who, text: `${who} changed ${label}${prev ? ' from ' + clean(prev, 50) : ''}${next ? ' to ' + clean(next, 50) : ''}` }); }
    }
    if (!any && /reopen|escalat|merge|split|spam|forward/i.test(ev)) out.push({ at, kind: 'status', who, text: `${who}: ${ev.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}` });
  }
  return out;
}
async function ticketStory(id, { refresh = false } = {}) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  const hit = _storyCache.get(id);
  if (hit && !refresh && Date.now() - hit.at < 600000) return hit.data;
  let ds = null; try { ds = require('./desk-service'); } catch (e) { ds = null; }
  if (!ds || !ds.isConfigured || !ds.isConfigured()) return { available: false, reason: 'Zoho Desk is not connected, so the live ticket cannot be read.' };
  const tid = a.ticket_id;
  const [t, th, cm] = await Promise.all([
    ds.fetchRaw(`/tickets/${tid}`).catch(() => null),
    ds.fetchRaw(`/tickets/${tid}/threads?limit=100`).catch(() => null),
    ds.fetchRaw(`/tickets/${tid}/comments?limit=100`).catch(() => null),
  ]);
  if (!t && !th) return { available: false, reason: 'Could not read this ticket from Zoho Desk right now.' };
  let names = {}; try { names = (await require('./desk-lifecycle').teamNameMap()) || {}; } catch (e) { names = {}; }
  let hist = []; try { hist = _deps.history ? await _deps.history(tid) : []; } catch (e) { hist = []; }
  const events = [];
  const createdAt = isoOf(t && t.createdTime) || isoOf(a.transferred_at);
  if (createdAt) events.push({ at: createdAt, kind: 'created', who: '', text: `Ticket created${t && t.channel ? ' by ' + clean(t.channel, 20) : ''}${t && t.contact ? ' from ' + (fullName(t.contact) || 'the customer') : ''}` });
  let custN = 0, agentN = 0, noteN = 0, lastCust = null, lastAgent = null;
  for (const x of ((th && th.data) || [])) {
    const at = isoOf(x.createdTime); if (!at) continue;
    const inbound = String(x.direction || '').toLowerCase() === 'in';
    const who = fullName(x.author) || (inbound ? 'Customer' : 'Agent');
    const txt = stripHtml(x.summary || x.content).slice(0, 140);
    if (inbound) { custN++; if (!lastCust || at > lastCust) lastCust = at; events.push({ at, kind: 'customer', who, text: `${who} wrote${txt ? ': ' + txt : ''}` }); }
    else { agentN++; if (!lastAgent || at > lastAgent) lastAgent = at; events.push({ at, kind: 'agent', who, text: `${who} replied${txt ? ': ' + txt : ''}` }); }
  }
  for (const x of ((cm && cm.data) || [])) {
    const at = isoOf(x.commentedTime || x.createdTime); if (!at) continue;
    noteN++;
    const who = fullName(x.commenter) || 'Someone';
    const txt = stripHtml(x.content).slice(0, 120);
    events.push({ at, kind: 'note', who, text: `${who} added an internal note${txt ? ': ' + txt : ''}` });
  }
  events.push(...historyToEvents(hist, names));
  events.sort((p, q) => p.at.localeCompare(q.at));
  const timeline = events.length > 45 ? [events[0]].concat(events.slice(-44)) : events;
  const teamName = (t && (names[String(t.teamId)] || (t.team && t.team.name))) || '';
  const ownerName = t && (fullName(t.assignee) || '') ;
  const waiting = lastCust && (!lastAgent || lastCust > lastAgent) ? 'The customer is waiting for a reply'
    : lastAgent ? 'Waiting on the customer' : (custN ? 'The customer is waiting for a reply' : 'No messages yet');
  const current = {
    status: (t && t.status) || a.status, owner: ownerName || null, team: teamName || a.dest_group || null, channel: (t && t.channel) || null,
    priority: (t && t.priority) || null, created: createdAt, escalated: !!(t && t.isEscalated), overdue: !!(t && t.isOverDue),
    customerMessages: custN, agentReplies: agentN, notes: noteN, lastCustomerAt: lastCust, lastAgentAt: lastAgent, waiting };
  // conversation pointers
  let points = [], source = 'rules', statusLine = '';
  if (aiReady()) {
    try {
      const desc = stripHtml(t && (t.description || t.subject)).slice(0, 900);
      const body = 'TICKET: ' + clean(a.subject, 160) + '\nDESCRIPTION: ' + desc + '\nNOW: ' + current.status + ', team ' + (current.team || 'unknown') + ', owner ' + (current.owner || 'unknown') + '\nEVENTS:\n' +
        timeline.map(e => `${e.at.slice(0, 16).replace('T', ' ')} ${e.text}`).join('\n').slice(0, 6000);
      const system = `You brief a support auditor on one ticket that a T1 agent moved to another team. Return JSON only: {"points":[3 to 6 short strings],"status":"one sentence on where the ticket stands right now"}.
Points in order: what the customer wants or reports, what the agent did, what is still unanswered or open, and any risk (anger, cancellation, escalation, long wait). Plain words, each under 22 words, no em dashes, do not invent facts.`;
      const r = await _deps.ai.bestJSON({ system, user: body, maxTokens: 600, feature: 'analyze', timeoutMs: 40000 });
      const j = r && r.json;
      if (j && Array.isArray(j.points) && j.points.length) { points = j.points.slice(0, 6).map(p => clean(noDash(p), 200)).filter(Boolean); statusLine = clean(noDash(j.status), 220); source = 'ai'; }
    } catch (e) { /* fall back to rules */ }
  }
  if (!points.length) {
    points.push(`${current.channel || 'Ticket'} opened${createdAt ? ' on ' + createdAt.slice(0, 10) : ''}: ${clean(a.subject, 120)}`);
    points.push(`${custN} customer message${custN === 1 ? '' : 's'} and ${agentN} agent repl${agentN === 1 ? 'y' : 'ies'}${noteN ? ', ' + noteN + ' internal note' + (noteN === 1 ? '' : 's') : ''}.`);
    points.push(waiting + '.');
    if (current.team) points.push(`Now with ${current.team}${current.owner ? ', owner ' + current.owner : ''}.`);
  }
  const data = { available: true, current, timeline, points, statusLine, source, at: new Date().toISOString() };
  _storyCache.set(id, { at: Date.now(), data });
  if (_storyCache.size > 200) _storyCache.delete(_storyCache.keys().next().value);
  return data;
}

// ── filters and summary tiles ────────────────────────────────────────────
async function facets({ email, admin }) {
  const scope = admin ? '' : ' AND spoc_email = ?'; const sp = admin ? [] : [lc(email)];
  const dests = await all(`SELECT COALESCE(dest_group,'Unknown') AS name, COUNT(*) AS n FROM audit_tickets WHERE 1=1${scope} GROUP BY 1 ORDER BY n DESC`, sp);
  const agents = await all(`SELECT agent_email AS email, MAX(agent_name) AS name, COUNT(*) AS n FROM audit_tickets WHERE agent_email IS NOT NULL${scope} GROUP BY agent_email ORDER BY n DESC`, sp);
  const spocs = admin ? await all(`SELECT a.spoc_email AS email, MAX(s.name) AS name, COUNT(*) AS n FROM audit_tickets a LEFT JOIN audit_spocs s ON s.email = a.spoc_email WHERE a.spoc_email IS NOT NULL GROUP BY a.spoc_email ORDER BY n DESC`) : [];
  const open = await all(`SELECT ai_signals, ai_priority FROM audit_tickets WHERE status IN ('pending','in_audit','returned')${scope}`, sp);
  const signals = { urgent: 0 }; for (const k of Object.keys(SIGNALS)) signals[k] = 0;
  for (const r of open) { if (r.ai_priority >= 2) signals.urgent++; for (const x of parseJSON(r.ai_signals, [])) if (x.key in signals) signals[x.key]++; }
  return { dests, agents: agents.map(a => ({ ...a, name: a.name || String(a.email).split('@')[0] })), spocs: spocs.map(a => ({ ...a, name: a.name || String(a.email).split('@')[0] })), signals, signalLabels: SIGNALS };
}
async function summary({ email, admin }) {
  const scope = admin ? '' : ' AND spoc_email = ?'; const sp = admin ? [] : [lc(email)];
  const o = await get(`SELECT
      SUM(CASE WHEN status IN ('pending','in_audit','returned') THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status IN ('pending','in_audit','returned') AND ai_priority >= 2 THEN 1 ELSE 0 END) AS urgent,
      SUM(CASE WHEN status IN ('pending','in_audit') AND spoc_email IS NULL THEN 1 ELSE 0 END) AS unassigned,
      MIN(CASE WHEN status = 'pending' THEN transferred_at END) AS oldest,
      SUM(CASE WHEN completed_at >= datetime('now','start of day') THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN completed_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS week,
      SUM(CASE WHEN verdict IS NOT NULL THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN verdict = 'needs_fix' THEN 1 ELSE 0 END) AS needs
    FROM audit_tickets WHERE 1=1${scope}`, sp) || {};
  const oldestH = o.oldest && !isNaN(Date.parse(o.oldest)) ? Math.max(0, Math.round((Date.now() - Date.parse(o.oldest)) / 36e5)) : null;
  const out = { queue: { open: o.open || 0, pending: o.pending || 0, urgent: o.urgent || 0, unassigned: admin ? (o.unassigned || 0) : null, oldestHours: oldestH, today: o.today || 0, week: o.week || 0, done: o.done || 0, needsFix: o.needs || 0, needsFixPct: o.done ? Math.round((o.needs || 0) / o.done * 100) : null },
    unscanned: await unscannedCount(), aiReady: aiReady() };
  const vr = await all(`SELECT spoc_email, SUM(CASE WHEN verdict='correct' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN verdict='needs_fix' THEN 1 ELSE 0 END) AS returned FROM audit_tickets WHERE spoc_email IS NOT NULL GROUP BY spoc_email`);
  const vby = {}; for (const v of vr) vby[v.spoc_email] = v;
  let spocs = await listSpocs();
  spocs = spocs.map(s => ({ email: s.email, name: s.name || s.email.split('@')[0], active: s.active, open: s.open, done: s.done, avgHours: s.avgHours, approved: (vby[s.email] || {}).approved || 0, returned: (vby[s.email] || {}).returned || 0 }));
  out.spocs = admin ? spocs : spocs.filter(s => s.email === lc(email));
  if (admin) {
    const ins = await insights();
    out.topMistakes = ins.topMistakes.slice(0, 5); out.agents = ins.agents.slice(0, 5); out.destinations = ins.destinations.slice(0, 5);
  }
  return out;
}

async function insights() {
  const rows = (await all(`SELECT * FROM audit_tickets`)).map(shapeAudit);
  const done = rows.filter(r => r.verdict);
  const needs = done.filter(r => r.verdict === 'needs_fix');
  const byRule = {}, byAgent = {}, byDest = {}, byWeek = {};
  for (const r of done) {
    const w = String(r.completed_at || r.updated_at || '').slice(0, 10);
    const d = new Date(w); let key = '';
    if (!isNaN(d)) { const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); key = mon.toISOString().slice(0, 10); }
    if (key) { const o = byWeek[key] = byWeek[key] || { audited: 0, needs: 0 }; o.audited++; if (r.verdict === 'needs_fix') o.needs++; }
    const ag = byAgent[r.agent_email] = byAgent[r.agent_email] || { email: r.agent_email, name: r.agent_name || r.agent_email, audited: 0, needs: 0, mistakes: 0 };
    ag.audited++; if (r.verdict === 'needs_fix') ag.needs++;
    const dg = byDest[r.dest_group || 'Unknown'] = byDest[r.dest_group || 'Unknown'] || { name: r.dest_group || 'Unknown', audited: 0, needs: 0 };
    dg.audited++; if (r.verdict === 'needs_fix') dg.needs++;
    for (const f of r.findings) { const k = f.label; const o = byRule[k] = byRule[k] || { label: k, rule_id: f.rule_id, count: 0 }; o.count++; ag.mistakes++; }
  }
  const flaggedOnly = rows.filter(r => r.flags.length).length;
  return {
    total: rows.length, audited: done.length, needsFix: needs.length,
    needsFixPct: done.length ? Math.round(needs.length / done.length * 1000) / 10 : null,
    flagged: flaggedOnly,
    topMistakes: Object.values(byRule).sort((a, b) => b.count - a.count).slice(0, 10),
    agents: Object.values(byAgent).sort((a, b) => b.mistakes - a.mistakes || b.needs - a.needs).slice(0, 15),
    destinations: Object.values(byDest).sort((a, b) => b.audited - a.audited),
    weeks: Object.entries(byWeek).sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([week, v]) => ({ week, ...v })),
  };
}


// ── AI analysis of auditors' findings ────────────────────────────────────
const KINDS = ['process', 'product'];
function aiReady() { return _deps.ai && _deps.ai.anyConfigured(); }
function needAI() { if (!aiReady()) throw fail('AI is not configured on the server (add ANTHROPIC_API_KEY or OPENAI_API_KEY).', 503); }
const detectorHelp = 'detector must be one of: manual (checklist only, SPOC judges), no_agent_reply (agent never replied to the customer), no_internal_note (no private note), quick_transfer (params {"minutes": n}), repeat_transfer (params {"count": n}), reopened, category_team (params {"pattern": "word1|word2", "expected": "T2" | "T3/DEV" | "VOIP" | "CSM" | "POD"}: topic words that belong to another team), subject_keyword (params {"pattern": "word1|word2"}). Use a detector only when the mistake can be detected from ticket facts; otherwise use manual.';
function safeRule(r) {
  const base = { title: r.title, category: r.category, description: r.description, severity: r.severity, detector: r.detector, params: r.params };
  try { cleanRuleInput(base); return base; } catch (e) { return { ...base, detector: 'manual', params: {} }; }
}
async function analysisInput(limit = 150) {
  const rows = (await all(`SELECT * FROM audit_tickets WHERE verdict IS NOT NULL ORDER BY completed_at DESC LIMIT ?`, [limit])).map(shapeAudit);
  return rows.map(r => ({
    dest: r.dest_group || 'unknown', verdict: r.verdict, subject: clean(r.subject, 100),
    auto_flags: r.flags.map(f => f.title), mistakes: r.findings.map(f => ({ rule: f.label, note: f.note || '' })), auditor_summary: r.summary || '' }));
}
async function analyze({ by = 'system', force = false } = {}) {
  needAI();
  const data = await analysisInput();
  const withFindings = data.filter(d => d.mistakes.length);
  if (withFindings.length < 3 && !force) throw fail('AI needs at least 3 audited tickets with recorded mistakes before it can find patterns.');
  if (!data.length) throw fail('No audited tickets yet.');
  const rules = await all(`SELECT title, category, detector FROM audit_rules WHERE enabled = 1`);
  const pending = await all(`SELECT type, payload FROM audit_suggestions WHERE status = 'new'`);
  const system = 'You analyse ticket audits for the T1 customer support team at Adit (dental, optometry and other practice software). SPOCs audit tickets that T1 agents moved to other teams (T2, T3/Dev, VoIP, CSM, Pod) and record what was missed: no follow-up, incorrect answer, incomplete answer, wrong team and similar. '
    + 'Find recurring patterns in the auditors\' findings and propose (1) new audit RULES that would let the tool highlight similar tickets for future auditors, and (2) short team UPDATES that teach everyone the right way. '
    + 'Only propose what the data supports: a pattern must appear in at least 2 audits, unless one finding is clearly severe. Do not repeat existing rules or pending suggestions. Never name or hint at any person. Never invent product facts, policies, numbers or links: when the correct process is not stated in the notes, describe the principle and tell agents to ask their SPOC. '
    + 'Plain, short, blameless sentences. No emojis. Never use em dashes or en dashes. '
    + 'Rule: title (max 90 chars), category (one or two words, for example Follow-up, Accuracy, Routing, Documentation, Triage, Quality), severity (low, medium or high), description (max 300 chars, what good looks like and what the mistake is), detector and params, evidence (one sentence on the pattern, for example "5 of 12 audits: ..."). ' + detectorHelp + ' '
    + 'Update: kind (process or product), title (max 80 chars), body (max 540 chars, 3 to 6 short sentences: the mistake, why it matters, exactly what to do instead), rule_titles (titles of related rules, existing or proposed), evidence. '
    + 'Return at most 4 rules and 3 updates, strongest first, as JSON only: {"rules":[{"title","category","severity","description","detector","params","evidence"}],"updates":[{"kind","title","body","rule_titles":[],"evidence"}]}. If nothing is supported return empty arrays.';
  const user = 'Existing rules:\n' + rules.map(r => `- ${r.title} (${r.category}, ${r.detector})`).join('\n')
    + '\n\nPending suggestions (do not repeat):\n' + (pending.map(p => '- ' + (parseJSON(p.payload, {}).title || '')).join('\n') || '(none)')
    + '\n\nAudited tickets (anonymous), newest first:\n' + JSON.stringify(data).slice(0, 45000);
  const r = await _deps.ai.bestJSON({ system, user, maxTokens: 2500, feature: 'analyze', timeoutMs: 90000 });
  const j = r.json || {};
  const batch = new Date().toISOString();
  const existingTitles = new Set(rules.map(x => lc(x.title)));
  for (const p of pending) existingTitles.add(lc(parseJSON(p.payload, {}).title));
  let nr = 0, nu = 0;
  for (const x of (Array.isArray(j.rules) ? j.rules : []).slice(0, 4)) {
    const title = clean(noDash(x.title), 140); if (!title || existingTitles.has(lc(title))) continue;
    const rule = safeRule({ title, category: clean(noDash(x.category), 60) || 'General', description: clean(noDash(x.description), 600), severity: SEVERITY[x.severity] ? x.severity : 'medium', detector: DETECTORS[x.detector] ? x.detector : 'manual', params: x.params || {} });
    existingTitles.add(lc(title));
    await run(`INSERT INTO audit_suggestions (type, payload, evidence, batch) VALUES ('rule', ?, ?, ?)`, [JSON.stringify(rule), clean(noDash(x.evidence), 300), batch]); nr++;
  }
  for (const x of (Array.isArray(j.updates) ? j.updates : []).slice(0, 3)) {
    const title = clean(noDash(x.title), 140), body = clean(noDash(x.body), 600); if (!title || !body || existingTitles.has(lc(title))) continue;
    existingTitles.add(lc(title));
    await run(`INSERT INTO audit_suggestions (type, payload, evidence, batch) VALUES ('update', ?, ?, ?)`,
      [JSON.stringify({ kind: KINDS.includes(x.kind) ? x.kind : 'process', title, body, rule_titles: (Array.isArray(x.rule_titles) ? x.rule_titles : []).map(t => clean(noDash(t), 140)).slice(0, 6) }), clean(noDash(x.evidence), 300), batch]); nu++;
  }
  const done = await get(`SELECT COUNT(*) AS n FROM audit_tickets WHERE verdict IS NOT NULL`);
  await setSetting('analyzed_count', done ? done.n : 0);
  await setSetting('analyzed_at', batch);
  if ((nr || nu) && _deps.notices && by === 'system') await _deps.notices.notifyAudience('admins', { title: 'New AI suggestions from ticket audits', body: `${nr} rule${nr === 1 ? '' : 's'} and ${nu} update${nu === 1 ? '' : 's'} suggested from auditor findings. Review them in Ticket audits.`, link: 'app:audits', category: 'process' }).catch(() => {});
  return { rules: nr, updates: nu, audits: data.length };
}
let _analyzing = false;
/** After an audit is submitted: re-analyse once 5 more audits have been completed since the last run. */
async function maybeAutoAnalyze() {
  try {
    if (_analyzing || !aiReady() || (await getSetting('auto_analyze')) === '0') return;
    const done = await get(`SELECT COUNT(*) AS n FROM audit_tickets WHERE verdict IS NOT NULL`);
    const last = Number(await getSetting('analyzed_count')) || 0;
    if (!done || done.n - last < 5) return;
    _analyzing = true;
    await analyze({ by: 'system' });
  } catch (e) { if (!e.status) console.warn('audit auto-analysis failed:', e.message); }
  finally { _analyzing = false; }
}
async function listSuggestions() {
  const rows = await all(`SELECT * FROM audit_suggestions WHERE status = 'new' ORDER BY id DESC LIMIT 50`);
  return rows.map(r => ({ id: r.id, type: r.type, evidence: r.evidence, created_at: r.created_at, ...parseJSON(r.payload, {}), payload: undefined }));
}
async function suggestionCount() { const r = await get(`SELECT COUNT(*) AS n FROM audit_suggestions WHERE status = 'new'`); return r ? r.n : 0; }
async function acceptSuggestion(id, by) {
  const r = await get(`SELECT * FROM audit_suggestions WHERE id = ? AND status = 'new'`, [id]);
  if (!r) throw fail('Suggestion not found', 404);
  const p = parseJSON(r.payload, {});
  let out = {};
  if (r.type === 'rule') out.ruleId = await createRule(by, p, 'ai');
  else {
    const titles = (p.rule_titles || []).map(lc);
    const rules = titles.length ? await all(`SELECT id, title FROM audit_rules`) : [];
    const ids = rules.filter(x => titles.includes(lc(x.title))).map(x => x.id);
    out.updateId = await saveUpdate(by, { kind: p.kind, title: p.title, body: p.body, rule_ids: ids, audience: 'agents' });
  }
  await run(`UPDATE audit_suggestions SET status='accepted', decided_by=?, decided_at=datetime('now') WHERE id=?`, [lc(by), id]);
  return out;
}
async function dismissSuggestion(id, by) { await run(`UPDATE audit_suggestions SET status='dismissed', decided_by=?, decided_at=datetime('now') WHERE id=?`, [lc(by), id]); }

/** Plain words in, a complete rule out (for adding rules by hand with AI help). */
async function draftRule(words) {
  needAI();
  const text = clean(words, 800);
  if (text.length < 8) throw fail('Describe the mistake in a sentence or two.');
  const examples = await recentMistakeNotes([], 6);
  const system = 'You turn a short description from a support team lead into one audit rule for a ticket audit tool used by T1 customer support at Adit. Fill the fields sensibly and do not invent facts. Plain language, no emojis, never use em dashes or en dashes. '
    + 'title max 90 chars; category one or two words (Follow-up, Accuracy, Routing, Documentation, Triage, Quality or similar); severity low, medium or high; description max 300 chars (what good looks like, and what the mistake is). ' + detectorHelp
    + ' Return JSON only: {"title","category","severity","description","detector","params"}.';
  const r = await _deps.ai.bestJSON({ system, user: 'Description:\n' + text + (examples.length ? '\n\nRecent auditor notes for style only:\n' + examples.map(e => '- ' + e).join('\n') : ''), maxTokens: 700, feature: 'analyze', timeoutMs: 45000 });
  const j = r.json || {};
  const title = clean(noDash(j.title), 140);
  if (!title) throw fail('The AI did not return a usable rule. Try adding a little more detail.', 502);
  return safeRule({ title, category: clean(noDash(j.category), 60) || 'General', description: clean(noDash(j.description), 600), severity: SEVERITY[j.severity] ? j.severity : 'medium', detector: DETECTORS[j.detector] ? j.detector : 'manual', params: j.params || {} });
}

// ── updates ─────────────────────────────────────────────────────────────
async function listUpdates() {
  return (await all(`SELECT * FROM audit_updates ORDER BY id DESC LIMIT 100`)).map(u => ({ ...u, rule_ids: parseJSON(u.rule_ids, []) }));
}
async function recentMistakeNotes(ruleIds, limit = 8) {
  const rows = await all(`SELECT findings FROM audit_tickets WHERE findings IS NOT NULL ORDER BY completed_at DESC LIMIT 200`);
  const out = [];
  for (const r of rows) for (const f of parseJSON(r.findings, [])) {
    if (f.note && (ruleIds.length === 0 || ruleIds.includes(f.rule_id))) out.push(f.label + ': ' + f.note);
    if (out.length >= limit) return out;
  }
  return out;
}
async function draftUpdate({ ruleIds = [], kind = 'process', gist = '', current = null, instruction = '' }) {
  const ai = _deps.ai;
  if (!ai || !ai.anyConfigured()) throw fail('AI is not configured on the server (add ANTHROPIC_API_KEY or OPENAI_API_KEY). You can still write the update by hand.', 503);
  const ids = (Array.isArray(ruleIds) ? ruleIds : []).map(Number).filter(Boolean).slice(0, 6);
  const rules = ids.length ? await all(`SELECT title, description, category FROM audit_rules WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const hasCurrent = current && String(current.body || '').trim().length > 10;
  if (!rules.length && !hasCurrent && String(gist || '').trim().length < 6) throw fail('Pick at least one rule, or write a few words about the mistake.');
  const notes = await recentMistakeNotes(ids);
  const system = 'You write short internal team updates for T1 customer support agents at Adit (dental, optometry and other practice software). A ticket audit team found a recurring mistake when tickets are transferred to other teams, and you turn it into a short, practical update so nobody else repeats it. '
    + 'Rules: blameless and constructive, never name or hint at any person; say what the mistake is, why it matters to the customer or the next team, and exactly what to do instead (the right steps); plain, short sentences; do not invent product facts, policies, numbers or links that are not in the input, and if the correct process is not given, describe the principle and tell agents to ask their SPOC; no emojis; never use em dashes or en dashes. '
    + 'Title at most 80 characters. Body at most 540 characters, 3 to 6 short sentences, no markdown. '
    + 'Return JSON only: {"title": string, "body": string}.';
  const user = `Update type: ${kind === 'product' ? 'Product update' : 'Process update'}\nRules behind this update:\n${rules.map(r => `- ${r.title} (${r.category}): ${r.description || ''}`).join('\n') || '(none)'}\n`
    + (notes.length ? `Auditor notes from real tickets (anonymised, for context only):\n${notes.map(n => '- ' + n).join('\n')}\n` : '')
    + (gist ? `Extra context from the admin:\n${String(gist).slice(0, 800)}\n` : '')
    + (hasCurrent ? `The admin already wrote this draft. Improve it (clearer, shorter sentences, correct tone) and keep their meaning and facts${instruction ? '; follow this instruction: ' + String(instruction).slice(0, 300) : ''}:\nTitle: ${String(current.title || '').slice(0, 140)}\nBody: ${String(current.body).slice(0, 700)}` : '');
  const r = await ai.bestJSON({ system, user, maxTokens: 800, feature: 'analyze', timeoutMs: 45000 });
  const j = r.json || {};
  const title = clean(noDash(j.title), 140), body = clean(noDash(j.body), 600);
  if (!title || !body) throw fail('The AI did not return a usable draft. Try adding a little more detail.', 502);
  return { title, body };
}
async function saveUpdate(by, b, id = null) {
  const title = clean(b.title, 140);
  if (!title) throw fail('Add a title');
  const kind = b.kind === 'product' ? 'product' : 'process';
  const audience = ['agents', 'all'].includes(b.audience) ? b.audience : 'agents';
  const ruleIds = JSON.stringify((Array.isArray(b.rule_ids) ? b.rule_ids : []).map(Number).filter(Boolean).slice(0, 12));
  if (id) {
    const ex = await get(`SELECT status, notice_id FROM audit_updates WHERE id = ?`, [id]);
    if (!ex) throw fail('Update not found', 404);
    await run(`UPDATE audit_updates SET kind=?, title=?, body=?, rule_ids=?, audience=? WHERE id=?`, [kind, title, clean(b.body, 600), ruleIds, audience, id]);
    // An edit to a published update also corrects the bell entry people already see.
    if (ex.status === 'published' && ex.notice_id) await run(`UPDATE tool_notices SET title=?, body=?, category=?, audience=? WHERE id=?`, [title, clean(b.body, 600), kind, audience, ex.notice_id]);
    return id;
  }
  const x = await run(`INSERT INTO audit_updates (kind, title, body, rule_ids, audience, created_by) VALUES (?,?,?,?,?,?)`, [kind, title, clean(b.body, 600), ruleIds, audience, lc(by)]);
  return x.lastID;
}
async function publishUpdate(by, id) {
  const u = await get(`SELECT * FROM audit_updates WHERE id = ?`, [id]);
  if (!u) throw fail('Update not found', 404);
  if (u.status === 'published') throw fail('Already published');
  if (!_deps.notices) throw fail('Notifications are not available', 503);
  const noticeId = await _deps.notices.createNotice(by, { title: u.title, body: u.body, category: u.kind, audience: u.audience === 'all' ? 'all' : 'agents', expiresInDays: 30 });
  await run(`UPDATE audit_updates SET status='published', notice_id=?, published_by=?, published_at=datetime('now') WHERE id=?`, [noticeId, lc(by), id]);
  return noticeId;
}
async function deleteUpdate(id) {
  const u = await get(`SELECT status FROM audit_updates WHERE id = ?`, [id]);
  if (u && u.status === 'published') throw fail('Published updates stay as a record');
  await run(`DELETE FROM audit_updates WHERE id = ?`, [id]);
}

module.exports = {
  setDB, setDeps, initSchema, getSetting, setSetting, accessFor, DETECTORS, STATUSES,
  listRules, createRule, updateRule, deleteRule,
  enqueueTransfers, assignUnassigned, addManual, listQueue, counts, getAudit, startAudit, submitAudit, closeAudit, reopenAudit, reassign, refreshFlags,
  listSpocs, addSpoc, setSpocActive, removeSpoc, insights,
  ticketStory, scanAudit, scanPending, kickScan, rebalance, facets, summary, SIGNALS,
  analyze, listSuggestions, suggestionCount, acceptSuggestion, dismissSuggestion, draftRule,
  listUpdates, draftUpdate, saveUpdate, publishUpdate, deleteUpdate,
};
