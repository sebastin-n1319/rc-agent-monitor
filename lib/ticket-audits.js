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
  no_internal_note: 'No internal note on the ticket',
  quick_transfer: 'Transferred very soon after creation',
  repeat_transfer: 'Moved between teams several times',
  reopened: 'Ticket was reopened',
  category_team: 'Topic sent to the wrong team',
  subject_keyword: 'Subject matches a keyword',
};

const SEED_RULES = [
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
  const n = await get(`SELECT COUNT(*) AS n FROM audit_rules`);
  if (!n || !n.n) {
    for (const r of SEED_RULES) {
      await run(`INSERT INTO audit_rules (title, category, description, severity, detector, params, source, created_by) VALUES (?,?,?,?,?,?, 'seed', 'system')`,
        [r.title, r.category, r.description, r.severity, r.detector, r.params ? JSON.stringify(r.params) : null]);
    }
  }
  if (!(await getSetting('queue_since'))) await setSetting('queue_since', new Date(Date.now() - 14 * 864e5).toISOString());
  if ((await getSetting('auto_queue')) == null) await setSetting('auto_queue', '1');
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
  return { ...a, flags, findings: parseJSON(a.findings, []),
    flagScore: flags.reduce((s, f) => s + (SEVERITY[f.severity] || 1), 0) };
}
async function listQueue({ email, admin, status, spoc, agent, q, limit = 300 }) {
  const where = [], params = [];
  if (!admin) { where.push(`a.spoc_email = ?`); params.push(lc(email)); }
  else if (spoc === 'none') where.push(`a.spoc_email IS NULL`);
  else if (spoc) { where.push(`a.spoc_email = ?`); params.push(lc(spoc)); }
  if (status === 'open') where.push(`a.status IN ('pending','in_audit','returned')`);
  else if (STATUSES.includes(status)) { where.push(`a.status = ?`); params.push(status); }
  if (agent) { where.push(`a.agent_email = ?`); params.push(lc(agent)); }
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
async function canTouch(a, email, admin) { return admin || (a && a.spoc_email === lc(email)); }
async function getAudit(id, { email, admin }) {
  const a = await get(`SELECT a.*, s.web_url AS web_url, s.status AS zoho_status, s.created_time AS created_time, s.team_name AS team_name, s.channel AS channel, s.account_name AS account_name, s.assignee_name AS owner_name
      FROM audit_tickets a LEFT JOIN desk_ticket_snapshot s ON s.ticket_id = a.ticket_id WHERE a.id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, email, admin))) throw fail('This audit is assigned to someone else', 403);
  const base = shapeAudit(a);
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
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail('This audit is assigned to someone else', 403);
  if (a.status === 'pending') {
    await run(`UPDATE audit_tickets SET status='in_audit', updated_at=datetime('now') WHERE id=?`, [id]);
    await logEvent(id, ctx.email, 'started', '');
  }
  await refreshFlags(id);
}
async function submitAudit(id, ctx, b) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail('This audit is assigned to someone else', 403);
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
  return status;
}
async function closeAudit(id, ctx) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail('This audit is assigned to someone else', 403);
  await run(`UPDATE audit_tickets SET status='closed', updated_at=datetime('now') WHERE id=?`, [id]);
  await logEvent(id, ctx.email, 'closed', 'ticket fixed and transferred correctly');
}
async function reopenAudit(id, ctx) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  if (!(await canTouch(a, ctx.email, ctx.admin))) throw fail('This audit is assigned to someone else', 403);
  await run(`UPDATE audit_tickets SET status='in_audit', updated_at=datetime('now') WHERE id=?`, [id]);
  await logEvent(id, ctx.email, 'reopened', '');
}
async function reassign(id, by, spocEmail) {
  const a = await get(`SELECT * FROM audit_tickets WHERE id = ?`, [id]);
  if (!a) throw fail('Audit not found', 404);
  const e = lc(spocEmail);
  if (e) { if (!(await spocRow(e))) throw fail('That person is not an active SPOC'); }
  await run(`UPDATE audit_tickets SET spoc_email=?, assigned_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [e || null, id]);
  await logEvent(id, by, 'reassigned', e || 'unassigned');
  if (e && _deps.notices) await _deps.notices.notifyPerson(e, { title: `Ticket #${a.ticket_number} assigned to you for audit`, body: 'Open Ticket audits to review it.', link: 'app:audits', category: 'process' }).catch(() => {});
}

/** Add a ticket by number (admin or SPOC). The agent is the monitored agent who moved it out of T1, else the one given. */
async function addManual({ ticketNumber, agentEmail, by, monitoredEmails = [], agentNames = {} }) {
  const num = String(ticketNumber || '').replace(/[^0-9]/g, '').slice(0, 12);
  if (!num) throw fail('Enter a ticket number');
  const snap = await get(`SELECT ticket_id, ticket_number, subject FROM desk_ticket_snapshot WHERE ticket_number = ?`, [num]);
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
async function draftUpdate({ ruleIds = [], kind = 'process', gist = '' }) {
  const ai = _deps.ai;
  if (!ai || !ai.anyConfigured()) throw fail('AI is not configured on the server (add ANTHROPIC_API_KEY or OPENAI_API_KEY). You can still write the update by hand.', 503);
  const ids = (Array.isArray(ruleIds) ? ruleIds : []).map(Number).filter(Boolean).slice(0, 6);
  const rules = ids.length ? await all(`SELECT title, description, category FROM audit_rules WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  if (!rules.length && String(gist || '').trim().length < 6) throw fail('Pick at least one rule, or write a few words about the mistake.');
  const notes = await recentMistakeNotes(ids);
  const system = 'You write short internal team updates for T1 customer support agents at Adit (dental, optometry and other practice software). A ticket audit team found a recurring mistake when tickets are transferred to other teams, and you turn it into a short, practical update so nobody else repeats it. '
    + 'Rules: blameless and constructive, never name or hint at any person; say what the mistake is, why it matters to the customer or the next team, and exactly what to do instead (the right steps); plain, short sentences; do not invent product facts, policies, numbers or links that are not in the input, and if the correct process is not given, describe the principle and tell agents to ask their SPOC; no emojis; never use em dashes or en dashes. '
    + 'Title at most 80 characters. Body at most 540 characters, 3 to 6 short sentences, no markdown. '
    + 'Return JSON only: {"title": string, "body": string}.';
  const user = `Update type: ${kind === 'product' ? 'Product update' : 'Process update'}\nRules behind this update:\n${rules.map(r => `- ${r.title} (${r.category}): ${r.description || ''}`).join('\n') || '(none)'}\n`
    + (notes.length ? `Auditor notes from real tickets (anonymised, for context only):\n${notes.map(n => '- ' + n).join('\n')}\n` : '')
    + (gist ? `Extra context from the admin:\n${String(gist).slice(0, 800)}` : '');
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
    const ex = await get(`SELECT status FROM audit_updates WHERE id = ?`, [id]);
    if (!ex) throw fail('Update not found', 404);
    if (ex.status === 'published') throw fail('This update is already published');
    await run(`UPDATE audit_updates SET kind=?, title=?, body=?, rule_ids=?, audience=? WHERE id=?`, [kind, title, clean(b.body, 600), ruleIds, audience, id]);
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
  listUpdates, draftUpdate, saveUpdate, publishUpdate, deleteUpdate,
};
