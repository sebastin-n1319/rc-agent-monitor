'use strict';
/**
 * Batch 225: Scheduled reports (Tickets > Reports).
 * An admin writes what the report should show in plain words ("every Monday, how many tickets T1 sent to each CSM"),
 * picks a period, a Google Chat space webhook and a schedule. The AI turns the request into read-only queries over the
 * tool's own data (transfer reviews, the staff directory, synced tickets, chats, breaks) and the Desk and CRM data, runs
 * them, and writes the message. The queries are saved with the report so every run measures the same thing; they are
 * rebuilt only when the request changes or an admin asks.
 * Safety: only SELECT/WITH, one statement, only listed tables, no personal columns (emails, phones, contact names,
 * free text); the tool's database is opened read-only for these queries.
 */
const path = require('path');
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
let _db = null, _ro = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
function ro() {
  if (_ro) return _ro;
  const sqlite3 = require('sqlite3');
  const file = process.env.DB_PATH || path.join(__dirname, '..', 'productivity.db');
  _ro = new sqlite3.Database(file, sqlite3.OPEN_READONLY);
  return _ro;
}
const roAll = (sql) => new Promise((res, rej) => ro().all(sql, [], (e, r) => e ? rej(e) : res(r || [])));
const clean = (s, n = 400) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS custom_report (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, prompt TEXT NOT NULL, period TEXT NOT NULL DEFAULT 'last_week',
    webhook TEXT, target_label TEXT, freq TEXT NOT NULL DEFAULT 'weekly', weekday INTEGER, monthday INTEGER,
    time_hm TEXT NOT NULL DEFAULT '09:00', tz TEXT NOT NULL DEFAULT 'America/Chicago', weekdays_only INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1, plan TEXT, plan_prompt TEXT, last_run_key TEXT, last_run_at TEXT, last_status TEXT,
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS custom_report_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER, ok INTEGER, error TEXT, text TEXT, period_label TEXT,
    sent_by TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  // Batch 231: changes the admins make to a team that comes from Keka (people missing from the copy, or to leave out).
  await run(`CREATE TABLE IF NOT EXISTS custom_report_team_edit (team TEXT NOT NULL, name TEXT NOT NULL, alt TEXT, mode TEXT NOT NULL DEFAULT 'add', updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (team, name))`);
  const n = await get(`SELECT COUNT(*) AS n FROM custom_report_team_edit`);
  if (!n || !n.n) for (const e of TEAM_SEED) await run(`INSERT OR IGNORE INTO custom_report_team_edit (team, name, alt, mode, updated_by) VALUES (?,?,?,?, 'seed')`, e);
  // Batch 231: a ticket sheet per sent report, opened from the Google Chat card by anyone signed in with an Adit Google account.
  await run(`CREATE TABLE IF NOT EXISTS custom_report_sheet (token TEXT PRIMARY KEY, report_id INTEGER, name TEXT, period_label TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  await run(`DELETE FROM custom_report_sheet WHERE created_at < datetime('now', '-120 days')`).catch(() => {});
  await run(`CREATE TABLE IF NOT EXISTS custom_report_viewer (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at TEXT NOT NULL)`);
  await run(`DELETE FROM custom_report_viewer WHERE expires_at < datetime('now')`).catch(() => {});
}

// ── What the AI may read ──────────────────────────────────────────────
const TOOL_TABLES = {
  t1_transfers: { about: 'USE THIS for anything about tickets T1 transferred or sent to another team or person (CSMs included). One row per ticket and person it went to (the latest transfer; times_sent says how often), voided reviews already removed. Count tickets with COUNT(DISTINCT ticket_number).',
    cols: { ticket_number: '', subject: '', web_url: 'link to the ticket in Zoho Desk', channel: '', t1_agent: 'the T1 agent who transferred it', to_agent: 'person it went to, as written in Desk', csm: 'the CSM name for to_agent (alternate names already mapped). Group and show CSMs by csm, never by to_agent', csm_pod: 'the CSM pod (from the Who Does What sheet), for reports by pod', to_team: 'team it went to',
      to_csm: '1 when to_agent is in the Tech CSM team from Keka (use this for CSM reports, never match names yourself)', back_to_t1: '1 when the ticket came back to T1 and T1 owns it now in Desk', csm_acted: '1 when a CSM added a note, comment or reply on a ticket that came back to T1', csm_handled: '1 when it went to a CSM and stayed with them, or came back but a CSM worked on it first. Use csm_handled = 1 as the count of tickets T1 sent to each CSM; to_csm = 1 AND back_to_t1 = 1 AND csm_acted = 0 are tickets that came back with no CSM action (not CSM work)',
      path: "'reviewed' (the agent set Pending Review - T1 and a reviewer checked it: process followed) | 'moved without review' (moved straight to the team, process not followed)",
      review_result: "'approved' (reviewer agreed: legit transfer) | 'returned to T1' (not a valid transfer) | 'skipped' | 'not reviewed' (moved without review) | 'awaiting review'",
      fatal: '1 when returned to T1 as a fatal (strike), 0 otherwise', reviewer: 'who reviewed',
      audit_result: "the transfer audit (AI screened, SPOC decided): 'legit' | 'needs fix' | 'audit pending' (in the audit queue, no decision yet) | 'not audited'",
      ai_checked: '1 when the AI has screened the ticket for the audit', ai_flagged: '1 when the AI screen flagged it as likely wrong', times_sent: 'how many times the ticket was sent to this person',
      sent_at: 'when the ticket actually went to the other team (UTC ISO text): the review time for reviewed transfers, the move time otherwise. Use this for the period.',
      entered_at: 'when the agent set Pending Review - T1 or moved it (UTC ISO text)' } },
  csm_to_t1: { about: 'USE THIS for tickets a CSM moved (or handed back) to T1. One row per move from a CSM to a T1 agent inside the report period, read from the Desk owner change log (already limited to the period). Count tickets with COUNT(DISTINCT ticket_number).',
    cols: { ticket_number: '', web_url: 'link to the ticket', channel: '', from_csm: 'the CSM who had it', t1_agent: 'the T1 agent it moved to', moved_at: 'when it moved (UTC ISO text)', t1_sent_first: '1 when T1 had sent it to the CSM first (a bounce back), 0 when it started with the CSM' } },
  team_members: { about: 'Every Adit team from the Keka employee directory, one row per person: use it for any team other than CSMs (e.g. VoIP Support, Tech OB, Marketing CSM, T1 Customer Support). Join on LOWER(name) = LOWER(to_agent) or LOWER(t1_agent). For CSMs use to_csm and csm in t1_transfers instead.',
    cols: { team: 'Keka department (e.g. Tech CSM, VoIP Support, Tech OB, Marketing CSM, T1 Customer Support) or a Who Does What sheet team (Marketing CSM, T2 CS, Adit Pay, AI OB, Tech OB)', name: 'the name the person uses in Desk', real_name: 'their real name', job_title: 'job title or role (e.g. CSM, ACSM, Escalations Manager)', pod: 'pod from the Who Does What sheet', source: 'keka | sheet | added' } },
  tr_reviews: { about: 'Transfer reviews: every ticket a T1 agent moved to Pending Review - T1, and where the reviewer sent it. One row per transfer.',
    cols: { ticket_number: 'Desk ticket number', subject: 'ticket subject', web_url: 'link to the ticket in Zoho Desk', channel: 'Email, Phone, Chat...', agent_name: 'the T1 agent who transferred it', entered_at: 'when it entered Pending Review - T1 (UTC ISO text)',
      state: 'waiting | moved | done', source: "'status' (went through review) | 'bypass' (moved without review)", verdict: 'good | invalid | ignored | NULL (the reviewer decision)', to_agent: 'the person it was sent to (e.g. the CSM name)', to_team: 'the team it was sent to (e.g. CSM, VoIP, Tech)',
      reviewer: 'who reviewed', reviewed_at: 'when it was reviewed (UTC ISO text)', severity: 'fatal | feedback for invalid transfers', voided: '1 when the review was voided (exclude these)' } },
  staff_directory: { about: 'Adit staff and their team.', cols: { full_name: 'name', team: 'team (e.g. CSM, Onboarding, T1, VoIP)', status: 'active or not' } },
  desk_ticket_snapshot: { about: 'T1 tickets synced from Zoho Desk (the T1 department).', cols: { ticket_number: '', subject: '', web_url: 'link to the ticket', status: '', status_type: 'Open | On Hold | Closed', channel: '', priority: '', assignee_name: 'current owner', created_time: 'UTC ISO text', closed_time: 'UTC ISO text' } },
  chat_conversation_snapshot: { about: 'SalesIQ chats.', cols: { attender_name: 'agent who handled the chat', department_name: '', status: '', chat_status_label: '', start_time: 'UTC ISO text', end_time: '', response_seconds: 'first response time in seconds', rating: 'Happy | Ok | Bad' } },
  break_events: { about: 'Agent break and aux events in this tool.', cols: { username: 'agent', action_label: 'what they did (Break, BRB, Logged In...)', current_status: 'status after the event', created_at: 'UTC timestamp text' } },
};
const WH_TABLES = {
  desk_tickets: { about: 'All Zoho Desk tickets (every department), one row per ticket.',
    cols: { ticket_number: '', subject: '', web_url: 'link to the ticket in Zoho Desk', status: '', status_type: '', channel: '', category: '', sub_category: '', priority: '', created_time: 'timestamptz', closed_time: 'timestamptz', modified_time: 'timestamptz',
      j_department_name: 'department', owner_team_name: 'owning team', owner_user_name: 'current owner', assignee_name: 'assignee', contact_account_name: 'client practice', cf_acct_number: 'Adit account number',
      cf_deal_stage: 'deal stage', cf_csm_account_manager: 'the account CSM', cf_csm_pod: 'CSM pod', cf_onboarding_owner: '', cf_tech_ob_owner: '', cf_previous_owner: 'previous owner', cf_previous_status: '',
      cf_reopen_count: '', cf_fcr_achieved: 'boolean', is_escalated: 'boolean', cf_escalations_status: '', cf_adit_app_module: 'product module', cf_ai_module: '', is_deleted: 'exclude true' } },
  crm_deals: { about: 'Zoho CRM deals.', cols: { deal_name: '', stage: '', account_name: '', account_id: '' } },
  crm_accounts: { about: 'Zoho CRM accounts (practices).', cols: { account_name: '', j_acct_number: 'Adit account number', j_account_manager: 'CSM', owner_name: '', billing_state: '' } },
};
const BLOCKED = /\b(email|j_contact_email|j_phone|phone|mobile|contact_first_name|contact_last_name|assignee_email|owner_user_email|agent_email|author_email|description_text|j_description|raw|contact|alt_contact|webhook|password|token|secret|session)\b/i;
function checkSql(source, sql) {
  const s = String(sql || '').trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(s)) throw new Error('Only SELECT queries are allowed');
  if (/;/.test(s)) throw new Error('One statement only');
  if (/\b(insert|update|delete|drop|create|alter|replace|attach|detach|pragma|vacuum|grant|truncate|copy|call|exec)\b/i.test(s)) throw new Error('Only reading is allowed');
  if (BLOCKED.test(s)) throw new Error('That query reads personal or private columns');
  const allowed = Object.keys(source === 'tool' ? TOOL_TABLES : WH_TABLES);
  const ctes = [...s.matchAll(/\b(\w+)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase());
  for (const m of s.matchAll(/\b(?:from|join)\s+([\w."]+)/gi)) {
    const t = m[1].replace(/"/g, '').replace(/^public\./i, '').toLowerCase();
    if (t === '(' || ctes.includes(t)) continue;
    if (!allowed.includes(t)) throw new Error(`Table ${t} is not available for reports`);
  }
  return s;
}

// ── Periods (America/Chicago) ─────────────────────────────────────────
const PERIODS = { yesterday: 'Yesterday', last_7_days: 'Last 7 days', last_week: 'Last week (Mon to Sun)', this_week: 'This week so far', last_month: 'Last month', this_month: 'This month so far', today: 'Today so far' };
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n, 12)).toISOString().slice(0, 10); };
const dow = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay(); };
function localParts(tz, at = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {}; for (const x of f.formatToParts(at)) o[x.type] = x.value;
  const date = `${o.year}-${o.month}-${o.day}`;
  return { date, mins: Number(o.hour) * 60 + Number(o.minute), dow: dow(date), dom: Number(o.day), dim: new Date(Date.UTC(+o.year, +o.month, 0)).getUTCDate() };
}
// UTC instant of local midnight on a date in a time zone.
function zoneMidnight(date, tz) {
  let t = Date.parse(date + 'T00:00:00Z');
  for (let i = 0; i < 3; i++) { const p = localParts(tz, new Date(t)); const diff = (Date.parse(p.date + 'T00:00:00Z') + p.mins * 60e3) - Date.parse(date + 'T00:00:00Z'); t -= diff; }
  return new Date(t);
}
function resolvePeriod(period, tz = 'America/Chicago', at = new Date()) {
  const today = localParts(tz, at).date;
  let from, to; // dates, to is exclusive
  const mon = (d) => addDays(d, -((dow(d) + 6) % 7));
  switch (period) {
    case 'today': from = today; to = addDays(today, 1); break;
    case 'yesterday': from = addDays(today, -1); to = today; break;
    case 'last_7_days': from = addDays(today, -7); to = today; break;
    case 'this_week': from = mon(today); to = addDays(today, 1); break;
    case 'last_month': { const first = today.slice(0, 8) + '01'; const prev = addDays(first, -1); from = prev.slice(0, 8) + '01'; to = first; break; }
    case 'this_month': from = today.slice(0, 8) + '01'; to = addDays(today, 1); break;
    default: { const m = mon(today); from = addDays(m, -7); to = m; }
  }
  const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return { from: zoneMidnight(from, tz).toISOString(), to: zoneMidnight(to, tz).toISOString(), fromDate: from, toDate: addDays(to, -1), label: from === addDays(to, -1) ? fmt(from) : `${fmt(from)} to ${fmt(addDays(to, -1))}` };
}
const fill = (sql, p) => String(sql).replace(/\{\{from\}\}/g, p.from).replace(/\{\{to\}\}/g, p.to).replace(/\{\{from_date\}\}/g, p.fromDate).replace(/\{\{to_date\}\}/g, p.toDate);

// ── Teams from Keka (Batch 231) ───────────────────────────────────────
// The Keka employee directory is copied into the data source (hr_employees): real name, job title, department, work email.
// Matching the work email to Desk gives each person's Desk name, so any Keka department can be used as a team in reports.
// The CSM team is the Keka "Tech CSM" department. Admins can add people the copy is missing or leave people out.
const CSM_TEAM = 'Tech CSM';
const TEAM_SEED = [ // live Keka on Oct 31, 2026 versus the copy taken Sep 18
  [CSM_TEAM, 'Morgan Taylor', 'Mohit Thapa', 'add'], [CSM_TEAM, 'Perry Chase', 'Pragya Awasthi', 'add'], [CSM_TEAM, 'Saurabh Singh', 'Saurabh Singh', 'add'], [CSM_TEAM, 'Julia Whitmore', 'Ranjitha Priya', 'exclude']];
const CSM_FALLBACK = [['Alexis Harris', 'Aayushi Agarwal'], ['Amelia Parks', 'Anjali Pal'], ['Aurora Bennett', 'Manali Arora'], ['Saul Morris', 'Satish M'], ['Gia Evans', 'Guneet Walia'], ['Gloria Michelson', 'Gargee Kulkarni'],
  ['Kate Wilson', 'Srishti Gupta'], ['Mike Norris', 'Ujjawal Sinha'], ['Molly Selene', 'Maulshree Srivastava'], ['Nia Sandlers', 'Nitanshi Singh'], ['Philip Rivera', 'Praharsh Rai'], ['Richard Marshall', 'Rohit Gupta'],
  ['Ronald Jacob', 'Ronald Jacob'], ['Sam Brooks', 'Vinoj Perumal'], ['Sofia S', 'Sofia Sinha'], ['Walter Green', 'Vikas Bhuchar'], ['Gareth Perry', 'Girish Priyani']];
const nm = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
const titleCase = (alias) => String(alias || '').split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
let _hr = { at: 0, rows: null, error: '' };
async function hrPeople() {
  if (_hr.rows && Date.now() - _hr.at < 6 * 3600e3) return _hr;
  try {
    const r = await D.query(`WITH desk AS (SELECT LOWER(owner_user_email) AS e, owner_user_name AS n, COUNT(*) AS c FROM desk_tickets WHERE created_time > now() - interval '120 days' AND owner_user_email IS NOT NULL GROUP BY 1, 2),
      best AS (SELECT DISTINCT ON (e) e, n FROM desk ORDER BY e, c DESC)
      SELECT h.department AS team, h.job_title AS title, h.display_name AS real_name, split_part(h.work_email, '@', 1) AS alias, b.n AS desk_name, h.updated_at
      FROM hr_employees h LEFT JOIN best b ON b.e = LOWER(h.work_email) WHERE h.is_active`, 2000);
    const rows = (r.rows || []).map((x) => ({ team: nm(x.team), title: nm(x.title), real: nm(x.real_name), name: nm(x.desk_name) || titleCase(x.alias), updated: x.updated_at }));
    if (rows.length) _hr = { at: Date.now(), rows, error: '', updated: rows.reduce((m, x) => (String(x.updated) > m ? String(x.updated) : m), '') };
  } catch (e) { _hr = Object.assign({}, _hr, { error: String(e.message || e).replace(/aditkb/ig, 'data source').slice(0, 160) }); }
  return _hr;
}
async function teamEdits(team) { try { return await all(`SELECT name, alt, mode FROM custom_report_team_edit WHERE team = ? ORDER BY mode, name`, [team]); } catch (e) { return []; } }
// The people in a team: Keka department plus admin edits. Each has a Desk name and their real (Keka) name.
const wdw = () => (D.directory ? D.directory() : require('./who-does-what').people()).catch((e) => ({ people: null, error: String(e.message || e) }));
async function teamRoster(team) {
  const hr = await hrPeople(), edits = await teamEdits(team), sheet = await wdw();
  let base = hr.rows ? hr.rows.filter((x) => x.team.toLowerCase() === team.toLowerCase()).map((x) => ({ name: x.name, alt: x.real, title: x.title, source: 'keka' }))
    : (team === CSM_TEAM ? CSM_FALLBACK.map((c) => ({ name: c[0], alt: c[1], title: '', source: 'saved' })) : []);
  const out = new Map(base.map((x) => [x.name.toLowerCase(), x]));
  // Cross reference: the Who Does What sheet. Pods and EHR coverage come from it; anyone on it but not in Keka is added.
  for (const p of (sheet.people || []).filter((x) => x.team.toLowerCase() === team.toLowerCase())) {
    const k = p.name.toLowerCase(), cur = out.get(k);
    if (cur) Object.assign(cur, { pod: p.pod || '', ehr: p.ehr || '', vertical: p.vertical || '', onSheet: true, alt: cur.alt || p.real });
    else out.set(k, { name: p.name, alt: p.real, title: p.role || '', pod: p.pod || '', ehr: p.ehr || '', vertical: p.vertical || '', source: 'sheet', onSheet: true });
  }
  for (const e of edits) {
    const k = nm(e.name).toLowerCase();
    if (e.mode === 'exclude') { if (out.has(k)) out.get(k).excluded = true; else out.set(k, { name: nm(e.name), alt: nm(e.alt), title: '', source: 'keka', excluded: true, missing: true }); }
    else if (!out.has(k)) out.set(k, { name: nm(e.name), alt: nm(e.alt), title: '', source: 'added' });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
async function csmRoster() { return (await teamRoster(CSM_TEAM)).filter((c) => !c.excluded); }
async function csmNames() { const r = await csmRoster(); return [...new Set(r.flatMap((c) => [c.name, c.alt]).filter(Boolean))]; }
async function csmCanon() { const m = new Map(); for (const c of await csmRoster()) { m.set(c.name.toLowerCase(), c.name); if (c.alt) m.set(c.alt.toLowerCase(), c.name); } return m; }
async function getCsms() {
  const hr = await hrPeople();
  const sheet = await wdw();
  return { team: CSM_TEAM, people: await teamRoster(CSM_TEAM), source: hr.rows ? 'keka' : 'saved', updated: hr.updated || null, error: hr.rows ? '' : (hr.error || 'The Keka copy could not be read'),
    sheet: { ok: !!sheet.people, error: sheet.people ? '' : (sheet.error || ''), at: sheet.at ? new Date(sheet.at).toISOString() : null } };
}
/** Admin edits for the CSM team: { add: [{name, alt}], exclude: [name] } */
async function saveCsms(b, by) {
  const add = (Array.isArray(b && b.add) ? b.add : []).map((c) => ({ name: nm(c && c.name).slice(0, 80), alt: nm(c && c.alt).slice(0, 80) })).filter((c) => c.name);
  const exclude = [...new Set((Array.isArray(b && b.exclude) ? b.exclude : []).map((x) => nm(x).slice(0, 80)).filter(Boolean))];
  const seen = new Set(); for (const c of add) { const k = c.name.toLowerCase(); if (seen.has(k)) throw httpError(400, `${c.name} is added twice`); seen.add(k); }
  await run('BEGIN');
  try {
    await run(`DELETE FROM custom_report_team_edit WHERE team = ?`, [CSM_TEAM]);
    for (const c of add) await run(`INSERT INTO custom_report_team_edit (team, name, alt, mode, updated_by) VALUES (?,?,?, 'add', ?)`, [CSM_TEAM, c.name, c.alt, by || null]);
    for (const x of exclude) await run(`INSERT OR REPLACE INTO custom_report_team_edit (team, name, alt, mode, updated_by) VALUES (?,?, '', 'exclude', ?)`, [CSM_TEAM, x, by || null]);
    await run('COMMIT');
  } catch (e) { await run('ROLLBACK').catch(() => {}); throw e; }
  return getCsms();
}
// Every Keka team as a table the planner can join on (team_members), with the CSM edits applied to Tech CSM.
async function teamMembersRows() {
  const hr = await hrPeople();
  const rows = (hr.rows || []).filter((x) => x.team.toLowerCase() !== CSM_TEAM.toLowerCase()).map((x) => ({ team: x.team, name: x.name, real_name: x.real, job_title: x.title, pod: '', source: 'keka' }));
  for (const c of await csmRoster()) rows.push({ team: CSM_TEAM, name: c.name, real_name: c.alt, job_title: c.title || '', pod: c.pod || '', source: c.source });
  // Who Does What sheet: pods and teams Keka does not split out (Marketing CSM pods and ACSMs, T2 CS, Adit Pay, AI OB, Tech OB pods).
  const seen = new Set(rows.map((r) => (r.team + '|' + r.name).toLowerCase()));
  for (const p of ((await wdw()).people || [])) {
    if (p.team === CSM_TEAM) continue;
    const k = (p.team + '|' + p.name).toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    rows.push({ team: p.team, name: p.name, real_name: p.real || '', job_title: p.role || '', pod: p.pod || '', source: 'sheet' });
  }
  return rows;
}
function membersView(rows) {
  const cols = 'team, name, real_name, job_title, pod, source';
  if (!rows.length) return `team_members(${cols}) AS (SELECT NULL, NULL, NULL, NULL, NULL, NULL WHERE 0)`;
  return `team_members(${cols}) AS (VALUES ${rows.map((r) => `(${[r.team, r.name, r.real_name, r.job_title, r.pod, r.source].map(q_).join(', ')})`).join(', ')})`;
}
const csmCaseSql = (canon, col) => canon.size ? `CASE LOWER(TRIM(COALESCE(${col},''))) ${[...canon].map(([k, v]) => `WHEN ${q_(k)} THEN ${q_(v)}`).join(' ')} ELSE TRIM(${col}) END` : `TRIM(${col})`;
const sqlList = (names) => names.length ? names.map((n) => `'${n.toLowerCase().replace(/'/g, "''")}'`).join(',') : `''`;

// The t1_transfers view (Batch 228): one place that defines a T1 transfer, so every report counts them the same way.
function transfersView(csm, back, acted, csmCase, podCase) {
  back = back || `''`; acted = acted || `''`; csmCase = csmCase || 'TRIM(r.to_agent)'; podCase = podCase || `''`;
  // One row per ticket and person it went to: the latest transfer wins, so a ticket that bounced back and was sent again counts once.
  return `t1_transfers AS (SELECT ticket_number, subject, web_url, channel, t1_agent, to_agent, csm, csm_pod, to_team, to_csm, back_to_t1, csm_acted, CASE WHEN to_csm = 1 AND (back_to_t1 = 0 OR csm_acted = 1) THEN 1 ELSE 0 END AS csm_handled, path, review_result, fatal, reviewer, audit_result, ai_checked, ai_flagged, sent_at, entered_at, times_sent FROM (
    SELECT r.ticket_number, r.subject, r.web_url, r.channel, r.agent_name AS t1_agent, r.to_agent, ${csmCase} AS csm, ${podCase} AS csm_pod, r.to_team,
    CASE WHEN LOWER(TRIM(COALESCE(r.to_agent,''))) IN (${csm}) THEN 1 ELSE 0 END AS to_csm,
    CASE WHEN r.ticket_id IN (${back}) THEN 1 ELSE 0 END AS back_to_t1,
    CASE WHEN r.ticket_id IN (${acted}) THEN 1 ELSE 0 END AS csm_acted,
    CASE WHEN r.source = 'bypass' THEN 'moved without review' ELSE 'reviewed' END AS path,
    CASE WHEN r.verdict = 'good' THEN 'approved' WHEN r.verdict = 'invalid' THEN 'returned to T1' WHEN r.verdict = 'ignored' THEN 'skipped' WHEN r.source = 'bypass' THEN 'not reviewed' ELSE 'awaiting review' END AS review_result,
    CASE WHEN r.verdict = 'invalid' AND COALESCE(r.severity,'fatal') = 'fatal' THEN 1 ELSE 0 END AS fatal, r.reviewer,
    CASE WHEN a.verdict = 'correct' THEN 'legit' WHEN a.verdict = 'needs_fix' THEN 'needs fix' WHEN a.id IS NOT NULL THEN 'audit pending' ELSE 'not audited' END AS audit_result,
    CASE WHEN a.ai_scanned_at IS NOT NULL THEN 1 ELSE 0 END AS ai_checked,
    CASE WHEN COALESCE(a.ai_priority,0) >= 2 THEN 1 ELSE 0 END AS ai_flagged,
    COALESCE(CASE WHEN r.source = 'bypass' THEN r.entered_at END, r.reviewed_at, r.left_at, r.entered_at) AS sent_at, r.entered_at,
    COUNT(*) OVER (PARTITION BY r.ticket_number, LOWER(${csmCase})) AS times_sent,
    ROW_NUMBER() OVER (PARTITION BY r.ticket_number, LOWER(${csmCase}) ORDER BY COALESCE(CASE WHEN r.source = 'bypass' THEN r.entered_at END, r.reviewed_at, r.left_at, r.entered_at) DESC, r.id DESC) AS rn
    FROM tr_reviews r LEFT JOIN audit_tickets a ON a.ticket_id = r.ticket_id
    WHERE COALESCE(r.voided,0) = 0 AND NOT (r.source = 'status' AND r.verdict IS NULL AND r.state = 'waiting')) WHERE rn = 1)`;
}
function withView(sql, csm, back, acted, moves, csmCase, members, podCase) {
  const parts = [];
  if (/\bteam_members\b/i.test(sql)) parts.push(membersView(members || []));
  if (/\bt1_transfers\b/i.test(sql)) parts.push(transfersView(csm, back, acted, csmCase, podCase));
  if (/\bcsm_to_t1\b/i.test(sql)) parts.push(movesView(moves || []));
  if (!parts.length) return sql;
  const v = parts.join(',\n');
  return /^\s*with\b/i.test(sql) ? sql.replace(/^\s*with\b/i, 'WITH ' + v + ',') : 'WITH ' + v + ' ' + sql;
}

// ── Planning: request -> queries ──────────────────────────────────────
async function samples() {
  const out = [];
  const q = async (label, sql) => { try { const r = await roAll(sql); out.push(`${label}: ${r.map((x) => `${Object.values(x)[0]} (${Object.values(x)[1]})`).join(', ')}`); } catch (e) { /* table may not exist yet */ } };
  await q('tr_reviews.verdict values', `SELECT verdict, count(*) n FROM tr_reviews GROUP BY verdict ORDER BY n DESC LIMIT 12`);
  await q('tr_reviews.to_team values', `SELECT to_team, count(*) n FROM tr_reviews GROUP BY to_team ORDER BY n DESC LIMIT 20`);
  await q('tr_reviews.to_agent examples', `SELECT to_agent, count(*) n FROM tr_reviews WHERE to_agent IS NOT NULL GROUP BY to_agent ORDER BY n DESC LIMIT 15`);
  await q('staff_directory.team values', `SELECT team, count(*) n FROM staff_directory GROUP BY team ORDER BY n DESC LIMIT 25`);
  return out.join('\n');
}
function catalog(tables, dialect) {
  return Object.entries(tables).map(([t, x]) => `${t} (${dialect}): ${x.about}\n  ` + Object.entries(x.cols).map(([c, d]) => d ? `${c} (${d})` : c).join(', ')).join('\n');
}
const PLAN = `You plan a recurring report for the T1 support team at Adit. Turn the admin's request into 1 to 4 read-only SQL queries over the data below. Return the exact numbers the report needs (group and count in SQL; do not return raw rows when a count answers it). When the request asks for ticket details (which tickets, a list, ticket numbers), add a query that returns one row per ticket with ticket_number, subject, web_url and the columns needed to group them, ordered sensibly, at most 300 rows.
Two sources:
- "tool": the T1 tool's own SQLite database. Timestamps are text in UTC ISO format; compare with the placeholders as text, e.g. reviewed_at >= '{{from}}' AND reviewed_at < '{{to}}'.
- "warehouse": a PostgreSQL copy of Zoho Desk and Zoho CRM. Compare timestamps with '{{from}}'::timestamptz and '{{to}}'::timestamptz.
Placeholders (always use them for the period, never fixed dates): {{from}}, {{to}} (UTC instants, to is exclusive), {{from_date}}, {{to_date}} (YYYY-MM-DD). {{csm_names}} is the current list of CSM names, lowercased and quoted for SQL (use as LOWER(TRIM(x)) IN ({{csm_names}})); always use it when the request is about CSMs, never type the names yourself.
Rules: only the tables and columns listed; SELECT or WITH only; no personal data (emails, phone numbers, client contact names, ticket text). For anything about tickets T1 transferred or sent to another team or person, use the t1_transfers view (not tr_reviews): for CSMs count csm_handled = 1 (tickets that went to a CSM and stayed, or that a CSM worked on), and show the ones that came back to T1 with no CSM action (to_csm = 1 AND back_to_t1 = 1 AND csm_acted = 0) as their own figure, with their ticket numbers when tickets are listed; filter the period on sent_at, and count tickets with COUNT(DISTINCT ticket_number). When a report is about transfers, also break the numbers down by path (reviewed vs moved without review), review_result (approved vs returned to T1) and audit_result (legit, needs fix, audit pending, not audited) plus AI screened (ai_checked) and AI flagged (ai_flagged) where the request asks for detail or quality. Ticket lists come from t1_transfers too (one row per ticket and person): select csm, ticket_number, web_url and channel, plus anything else the request asks for. For tickets CSMs moved or handed back to T1, use csm_to_t1 (one row per move, already in the period), grouped by from_csm. Group case-insensitively so one name is not split by spelling, and show the name as stored.
Reply with JSON: {"queries":[{"source":"tool|warehouse","purpose":"what this query answers, in plain words","sql":"..."}],"title":"a short report title","notes":"one line: how the request was read, and anything that could not be measured"}`;
async function plan(prompt) {
  const csm = await csmNames();
  const user = [`Request: ${prompt}`, 'Tool tables:\n' + catalog(TOOL_TABLES, 'SQLite'), 'Warehouse tables:\n' + catalog(WH_TABLES, 'PostgreSQL'), 'Values seen in the tool data:\n' + (await samples()), csm.length ? `Current CSMs ({{csm_names}} holds these): ${csm.join(', ')}` : ''].filter(Boolean).join('\n\n');
  const o = { system: PLAN, user, maxTokens: 2500, timeoutMs: 90000, temperature: 0 };
  let r; try { r = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(o) : await D.ai.bestJSON(o); } catch (e) { r = await D.ai.bestJSON(o); }
  const j = (r && r.json) || {};
  const queries = (Array.isArray(j.queries) ? j.queries : []).slice(0, 4).map((q) => ({ source: q.source === 'warehouse' ? 'warehouse' : 'tool', purpose: clean(q.purpose, 200), sql: String(q.sql || '').trim() }));
  for (const q of queries) q.sql = checkSql(q.source, q.sql);
  if (!queries.length) throw httpError(422, 'Expert could not work out what to measure. Say what to count and over what.');
  return { queries, title: clean(j.title, 120), notes: clean(j.notes, 300), at: new Date().toISOString() };
}
// Tickets that came back to T1 (T1 owns them now in Desk) and whether a CSM acted on them (a note, a comment or a reply).
// Ownership and notes live in Desk, so look them up there for the transfers in and around the period.
const q_ = (v) => `'${String(v == null ? '' : v).replace(/'/g, "''")}'`;
const inList = (a) => a.length ? a.map(q_).join(',') : `''`;
async function transferFacts(period, csm) {
  const none = { back: `''`, acted: `''` };
  try {
    const since = new Date(Date.parse(period.from) - 30 * 864e5).toISOString();
    const ids = [...new Set((await roAll(`SELECT DISTINCT ticket_id FROM tr_reviews WHERE COALESCE(voided,0) = 0 AND COALESCE(reviewed_at, entered_at) >= '${since}' AND entered_at < '${period.to}' LIMIT 5000`)).map((r) => String(r.ticket_id || '')).filter((x) => /^\d{5,25}$/.test(x)))];
    const back = [], acted = new Set();
    for (let i = 0; i < ids.length; i += 400) {
      const r = await D.query(`SELECT id FROM desk_tickets WHERE id IN (${inList(ids.slice(i, i + 400))}) AND owner_team_name ILIKE 'T1%' AND owner_team_name NOT ILIKE '%voip%'`, 500);
      for (const x of (r.rows || [])) if (/^\d+$/.test(String(x.id))) back.push(String(x.id));
    }
    if (back.length && csm && csm !== `''`) {
      for (let i = 0; i < back.length; i += 400) {
        const list = inList(back.slice(i, i + 400));
        const r = await D.query(`SELECT DISTINCT ticket_id FROM desk_ticket_comments WHERE ticket_id IN (${list}) AND LOWER(TRIM(author_name)) IN (${csm})
          UNION SELECT DISTINCT ticket_id FROM desk_ticket_threads WHERE ticket_id IN (${list}) AND direction = 'out' AND LOWER(TRIM(author_name)) IN (${csm})`, 1000);
        for (const x of (r.rows || [])) acted.add(String(x.ticket_id));
      }
    }
    return { back: inList(back), acted: inList([...acted]) };
  } catch (e) { return none; }
}
// Desk keeps an owner change log on each ticket: "Owner changed to <name> on <YYYY-MM-DD HH:MM:SS> | Role : <role>", in Central time.
function parseOwnerLog(text, tz = 'America/Chicago') {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    const m = /Owner changed to (.+?) on (\d{4}-\d\d-\d\d) (\d\d):(\d\d):(\d\d)\s*\|\s*Role\s*:\s*(.*)$/i.exec(line.trim());
    if (!m) continue;
    const at = new Date(zoneMidnight(m[2], tz).getTime() + ((+m[3]) * 3600 + (+m[4]) * 60 + (+m[5])) * 1000).toISOString();
    out.push({ name: m[1].trim(), at, role: m[6].trim() });
  }
  return out;
}
const isT1Role = (r) => /\bT1\b/i.test(r) && !/voip/i.test(r);
// Every move of a ticket from a CSM to T1 in the period, read from the owner change log.
function csmMoves(rows, csmSet, period, t1Sent, t1Names = new Set(), canon = new Map()) {
  const out = [];
  for (const t of rows) {
    const log = parseOwnerLog(t.cf_owner_change_log);
    for (let i = 1; i < log.length; i++) {
      const prev = log[i - 1], cur = log[i];
      const who = prev.name.toLowerCase();
      const prevCsm = !t1Names.has(who) && csmSet.has(who);
      if (!prevCsm || !isT1Role(cur.role) || cur.at < period.from || cur.at >= period.to) continue;
      out.push({ ticket_id: String(t.id), ticket_number: String(t.ticket_number || ''), web_url: t.web_url || '', channel: t.channel || '', from_csm: canon.get(who) || prev.name, t1_agent: cur.name, moved_at: cur.at, t1_sent_first: t1Sent.has(String(t.id)) ? 1 : 0 });
    }
  }
  return out;
}
async function csmToT1(period, csmLower) {
  try {
    const since = new Date(Date.parse(period.from) - 120 * 864e5).toISOString();
    const r = await D.query(`SELECT id, ticket_number, web_url, channel, cf_owner_change_log FROM desk_tickets WHERE created_time >= '${since}' AND modified_time >= '${period.from}' AND cf_owner_change_log ILIKE '%T1%'`, 5000);
    const sent = new Set((await roAll(`SELECT DISTINCT ticket_id FROM tr_reviews WHERE COALESCE(voided,0) = 0`)).map((x) => String(x.ticket_id)));
    // T1 agents are the people in the tool's agent list (Desk sometimes labels one with a CSM role).
    const t1 = new Set(((D.t1Names ? await D.t1Names().catch(() => []) : []) || []).map((x) => nm(x).toLowerCase()));
    return csmMoves(r.rows || [], new Set(csmLower), period, sent, t1, await csmCanon());
  } catch (e) { return []; }
}
function movesView(moves) {
  const cols = 'ticket_id, ticket_number, web_url, channel, from_csm, t1_agent, moved_at, t1_sent_first';
  if (!moves.length) return `csm_to_t1(${cols}) AS (SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL WHERE 0)`;
  return `csm_to_t1(${cols}) AS (VALUES ${moves.map((m) => `(${[m.ticket_id, m.ticket_number, m.web_url, m.channel, m.from_csm, m.t1_agent, m.moved_at].map(q_).join(', ')}, ${m.t1_sent_first ? 1 : 0})`).join(', ')})`;
}
async function runQueries(p, period) {
  const out = [];
  const csm = p.queries.some((q) => /\{\{csm_names\}\}|\bt1_transfers\b|\bcsm_to_t1\b/i.test(q.sql)) ? sqlList(await csmNames()) : null;
  const tool = p.queries.filter((q) => q.source === 'tool');
  const facts = tool.some((q) => /\bt1_transfers\b/i.test(q.sql)) ? await transferFacts(period, csm) : { back: `''`, acted: `''` };
  const moves = tool.some((q) => /\bcsm_to_t1\b/i.test(q.sql)) ? await csmToT1(period, (await csmNames()).map((n) => n.toLowerCase())) : [];
  const csmCase = csm ? csmCaseSql(await csmCanon(), 'r.to_agent') : null;
  let podCase = null;
  if (csm) { const pods = new Map(); const canon = await csmCanon(); for (const c of await csmRoster()) if (c.pod) pods.set(c.name, c.pod);
    if (pods.size) podCase = `CASE ${csmCaseSql(canon, 'r.to_agent')} ${[...pods].map(([k, v]) => `WHEN ${q_(k)} THEN ${q_(v)}`).join(' ')} ELSE '' END`; }
  const members = tool.some((q) => /\bteam_members\b/i.test(q.sql)) ? await teamMembersRows() : [];
  for (const q of p.queries) {
    let sql = fill(checkSql(q.source, q.sql), period);
    if (q.source === 'tool') sql = withView(sql, csm || `''`, facts.back, facts.acted, moves, csmCase, members, podCase);
    if (csm) sql = sql.replace(/\{\{csm_names\}\}/g, csm);
    try {
      let rows;
      if (q.source === 'tool') rows = await roAll(sql + (/\blimit\s+\d+\s*$/i.test(sql) ? '' : ' LIMIT 500'));
      else rows = (await D.query(sql, 500)).rows || [];
      out.push({ purpose: q.purpose, source: q.source, rows: rows.slice(0, 300), count: rows.length });
    } catch (e) { out.push({ purpose: q.purpose, source: q.source, rows: [], count: 0, error: String(e.message || e).replace(/aditkb/ig, 'data source').slice(0, 200) }); }
  }
  Object.defineProperty(out, 'ctx', { value: { csm, facts, moves, csmCase, podCase, results: out }, enumerable: false });
  return out;
}
// ── Ticket sheet (Batch 231) ──────────────────────────────────────────
// The Chat message stays short; the full ticket list goes on a sheet in the tool, linked from a card button.
const crypto = require('crypto');
const SHEET_COLS = { csm: 'CSM', csm_pod: 'Pod', to_team: 'Team', ticket_number: 'Ticket', subject: 'Subject', channel: 'Channel', t1_agent: 'T1 agent', path: 'Process', review_result: 'Review', audit_result: 'Audit', outcome: 'Outcome', sent_at: 'Sent', from_csm: 'CSM', moved_at: 'Moved to T1', bounce: 'T1 sent it first' };
async function sheetSections(p, period, ctx) {
  const tool = p.queries.filter((q) => q.source === 'tool');
  const out = [];
  if (tool.some((q) => /\bt1_transfers\b/i.test(q.sql))) {
    const csmOnly = tool.some((q) => /\bt1_transfers\b/i.test(q.sql) && /\b(to_csm|csm_handled)\b/i.test(q.sql));
    const sql = withView(`SELECT ${csmOnly ? 'csm, csm_pod' : 'csm, to_team'}, ticket_number, web_url, subject, channel, t1_agent, path, review_result, audit_result,
      CASE WHEN back_to_t1 = 1 AND csm_acted = 0 THEN 'Came back to T1, no CSM action' WHEN back_to_t1 = 1 THEN 'Came back to T1 after CSM action' ELSE 'With the CSM' END AS outcome, sent_at
      FROM t1_transfers WHERE ${csmOnly ? 'to_csm = 1 AND ' : ''}sent_at >= '${period.from}' AND sent_at < '${period.to}' ORDER BY ${csmOnly ? 'csm' : 'to_team, csm'}, sent_at LIMIT 2000`, ctx.csm || `''`, ctx.facts.back, ctx.facts.acted, ctx.moves, ctx.csmCase, [], ctx.podCase);
    try { out.push({ title: csmOnly ? 'Tickets T1 sent to CSMs' : 'Tickets T1 transferred', rows: await roAll(sql) }); } catch (e) {}
  }
  if (ctx.moves && ctx.moves.length) out.push({ title: 'Tickets CSMs moved to T1', rows: ctx.moves.map((m) => ({ from_csm: m.from_csm, ticket_number: m.ticket_number, web_url: m.web_url, channel: m.channel, t1_agent: m.t1_agent, moved_at: m.moved_at, bounce: m.t1_sent_first ? 'Yes' : 'No' })) });
  if (!out.length) for (const x of ctx.results) if (x.rows.length && 'ticket_number' in x.rows[0]) out.push({ title: x.purpose, rows: x.rows });
  return out.map((sec) => {
    const keys = Object.keys(sec.rows[0] || {}).filter((k) => k !== 'web_url' && !BLOCKED.test(k));
    return { title: clean(sec.title, 160), columns: keys.map((k) => ({ key: k, label: SHEET_COLS[k] || k.replace(/_/g, ' ') })), rows: sec.rows.slice(0, 2000).map((r) => { const o = {}; for (const k of keys) o[k] = r[k] == null ? '' : String(r[k]).slice(0, 300); if (r.web_url && /^https:\/\//.test(r.web_url)) o._url = String(r.web_url); return o; }) };
  }).filter((sec) => sec.rows.length);
}
const baseUrl = () => String(D.publicUrl || process.env.PUBLIC_BASE_URL || 'https://rc-t1cs-monitor.up.railway.app').replace(/\/+$/, '');
async function makeSheet(r, period, sections) {
  if (!sections || !sections.length) return null;
  const token = crypto.randomBytes(18).toString('base64url');
  await run(`INSERT INTO custom_report_sheet (token, report_id, name, period_label, data) VALUES (?,?,?,?,?)`, [token, r.id || null, r.name, period.label, JSON.stringify({ sections })]);
  return { token, url: `${baseUrl()}/sheet/${token}`, tickets: sections.reduce((n, x) => n + x.rows.length, 0) };
}
async function getSheet(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ''))) throw httpError(404, 'Sheet not found');
  const r = await get(`SELECT name, period_label, data, created_at FROM custom_report_sheet WHERE token = ?`, [token]);
  if (!r) throw httpError(404, 'This sheet has expired or does not exist');
  let data = {}; try { data = JSON.parse(r.data); } catch (e) {}
  return { name: r.name, period: r.period_label, created_at: r.created_at, sections: data.sections || [] };
}
// People without a tool account sign in with Google just to read sheets: a 12 hour viewer pass, sheets only.
async function createViewer(email) {
  const token = crypto.randomBytes(32).toString('hex');
  await run(`INSERT INTO custom_report_viewer (token, email, expires_at) VALUES (?,?, datetime('now', '+12 hours'))`, [token, String(email).toLowerCase()]);
  return token;
}
async function viewerEmail(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const r = await get(`SELECT email FROM custom_report_viewer WHERE token = ? AND expires_at > datetime('now')`, [token]);
  return r ? r.email : null;
}
function sheetCard(r, period, sheet) {
  return { cardsV2: [{ cardId: 'ticket-sheet', card: {
    header: { title: 'Ticket details', subtitle: `${clean(r.name, 80)} . ${period.label}` },
    sections: [{ widgets: [
      { decoratedText: { text: `${sheet.tickets} ticket${sheet.tickets === 1 ? '' : 's'} with CSM, channel, process and audit. Opens in the T1 tool; sign in with your Adit Google account.`, wrapText: true } },
      { buttonList: { buttons: [{ text: 'Open ticket sheet', onClick: { openLink: { url: sheet.url } } }] } }] }] } }] };
}
const WRITE = `You write a recurring report for a Google Chat space at Adit. Use ONLY the numbers and tickets in the query results; never invent or estimate. If a query failed or returned nothing, say plainly that there was no data for it.
Format for Google Chat: plain text, *bold* for the title and key numbers, one item per line, short lines, a total where it helps, sorted from highest to lowest. At most one or two emoji. Professional and concise. No em or en dashes. No tables with pipes.
Ticket details: when the request asks for tickets, keep it compact. Show ticket numbers only (no subjects, no per-ticket status) unless the request asks for more, as Google Chat links "<web_url|#ticket_number>" ("#ticket_number" when there is no link), comma separated. Put each group's name and count on one line, then its tickets on the next line split by channel when the results carry channel, for example:
*Ana Ruiz* (5)
Email: <url|#1>, <url|#2>, <url|#3> . Phone: <url|#4>, <url|#5>
List every ticket returned; do not shorten the list. Leave one blank line between groups.
Transfer figures: when the results carry path, review_result or audit_result, give them once in a short summary line near the top (for example "Reviewed and approved 17, moved without review 40"). Never repeat them on each group or ticket unless the request says "per CSM" or "for each CSM" about those figures. Leave out any figure that is zero or "not audited" for every ticket. "Reviewed and approved" means the process was followed.
Came back to T1: when the results include tickets that came back to T1 with no CSM action, or tickets CSMs moved to T1, give each its own short section after the CSM list, with a count per CSM and the ticket numbers as links on one line, for example "*Came back to T1, no CSM action (3)*" then "Ana Ruiz: <url|#1>, <url|#2>".
Start with the title and the period. End with nothing extra (no sign-off).
Reply with JSON: {"text":"the message"}`;
// Google Chat links are <url|label>. The writer sometimes drops the brackets ("url | #123"); put them back.
function chatLinks(t) {
  return t.replace(/(^|[^<])(https?:\/\/[^\s|<>]+)\s*\|\s*(#?\d+)/gm, (m, pre, u, n) => pre + '<' + u + '|' + (n[0] === '#' ? n : '#' + n) + '>');
}
async function compose(r, p, period, results) {
  const detail = results.some((x) => x.rows.length && Object.keys(x.rows[0]).some((k) => /ticket_number/i.test(k)));
  const user = [`Report: ${r.name}`, `What it should show: ${r.prompt}`, `Period: ${period.label}`, p.title ? `Suggested title: ${p.title}` : '',
    'Query results:\n' + results.map((x, i) => `[${i + 1}] ${x.purpose}${x.error ? ' (failed: ' + x.error + ')' : ''}\n${JSON.stringify(x.rows).slice(0, detail ? 60000 : 12000)}`).join('\n\n')].filter(Boolean).join('\n\n');
  const o = { system: WRITE, user, maxTokens: detail ? 8000 : 1800, timeoutMs: detail ? 150000 : 60000, temperature: 0 };
  let res; try { res = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(o) : await D.ai.bestJSON(o); } catch (e) { res = await D.ai.bestJSON(o); }
  return chatLinks(String(((res && res.json) || {}).text || '').replace(/[\u2014\u2013]/g, ',')).trim().slice(0, 30000);
}
// Google Chat takes about 4,000 characters a message, so a long report (ticket lists) goes out in parts, split
// between lines, each part after the first marked "(continued)".
function parts(text, max = 3800) {
  const out = []; let cur = '';
  for (const line of String(text).split('\n')) {
    const l = line.length > max ? line.slice(0, max) : line;
    if (cur && cur.length + l.length + 1 > max) { out.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + l;
  }
  if (cur) out.push(cur);
  return out.slice(0, 10).map((x, i, arr) => arr.length > 1 && i ? `(continued ${i + 1}/${arr.length})\n` + x : x);
}

// ── Reports ───────────────────────────────────────────────────────────
const HOOK = /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9_-]+\/messages\?[^\s]+$/;
const maskHook = (u) => { const m = /spaces\/([A-Za-z0-9_-]+)/.exec(u || ''); return m ? `Google Chat space ${m[1].slice(0, 6)}...` : ''; };
function shape(r) {
  let p = null; try { p = r.plan ? JSON.parse(r.plan) : null; } catch (e) {}
  return { id: r.id, name: r.name, prompt: r.prompt, period: r.period, periodLabel: PERIODS[r.period] || r.period, target: r.target_label || maskHook(r.webhook), hasWebhook: !!r.webhook, hookHint: maskHook(r.webhook),
    freq: r.freq, weekday: r.weekday, monthday: r.monthday, time: r.time_hm, tz: r.tz, weekdaysOnly: !!r.weekdays_only, enabled: !!r.enabled,
    plan: p ? { queries: p.queries.map((q) => ({ purpose: q.purpose, source: q.source === 'tool' ? 'Tool data' : 'Desk and CRM data', sql: q.sql })), notes: p.notes, at: p.at, current: r.plan_prompt === r.prompt } : null,
    lastRunAt: r.last_run_at, lastStatus: r.last_status, next: nextRun(r), createdBy: r.created_by };
}
async function list() {
  const rows = await all(`SELECT * FROM custom_report ORDER BY id DESC`);
  const logs = await all(`SELECT id, report_id, ok, error, period_label, sent_by, created_at FROM custom_report_log ORDER BY id DESC LIMIT 200`);
  return rows.map((r) => Object.assign(shape(r), { history: logs.filter((l) => l.report_id === r.id).slice(0, 8) }));
}
function cleanInput(b) {
  const x = b || {};
  const name = clean(x.name, 120), prompt = String(x.prompt || '').trim().slice(0, 2000);
  if (name.length < 3) throw httpError(400, 'Give the report a name');
  if (prompt.length < 10) throw httpError(400, 'Say what the report should show');
  const webhook = x.webhook == null ? undefined : String(x.webhook).trim();
  if (webhook && !HOOK.test(webhook)) throw httpError(400, 'Paste a Google Chat webhook (it starts with https://chat.googleapis.com/v1/spaces/)');
  const freq = ['daily', 'weekly', 'monthly'].includes(x.freq) ? x.freq : 'weekly';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time || '') ? x.time : '09:00';
  const tz = ['America/Chicago', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles'].includes(x.tz) ? x.tz : 'America/Chicago';
  return { name, prompt, webhook, target: clean(x.target, 80), period: PERIODS[x.period] ? x.period : 'last_week', freq, weekday: Math.min(6, Math.max(0, Number(x.weekday ?? 1))), monthday: Math.min(28, Math.max(1, Number(x.monthday || 1))), time, tz, weekdaysOnly: x.weekdaysOnly !== false, enabled: x.enabled !== false };
}
async function save(id, b, by, planJson) {
  const v = cleanInput(b);
  if (id) {
    const cur = await get(`SELECT * FROM custom_report WHERE id = ?`, [id]); if (!cur) throw httpError(404, 'Report not found');
    await run(`UPDATE custom_report SET name=?, prompt=?, period=?, webhook=COALESCE(?, webhook), target_label=?, freq=?, weekday=?, monthday=?, time_hm=?, tz=?, weekdays_only=?, enabled=?, updated_at=datetime('now') WHERE id=?`,
      [v.name, v.prompt, v.period, v.webhook || null, v.target, v.freq, v.weekday, v.monthday, v.time, v.tz, v.weekdaysOnly ? 1 : 0, v.enabled ? 1 : 0, id]);
  } else {
    if (!v.webhook) throw httpError(400, 'Paste the Google Chat webhook of the space to send to');
    const r = await run(`INSERT INTO custom_report (name, prompt, period, webhook, target_label, freq, weekday, monthday, time_hm, tz, weekdays_only, enabled, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [v.name, v.prompt, v.period, v.webhook, v.target, v.freq, v.weekday, v.monthday, v.time, v.tz, v.weekdaysOnly ? 1 : 0, v.enabled ? 1 : 0, by]);
    id = r.lastID;
  }
  if (planJson && planJson.prompt === v.prompt && planJson.plan) {
    const p = planJson.plan; p.queries.forEach((q) => { q.sql = checkSql(q.source, q.sql); });
    await run(`UPDATE custom_report SET plan=?, plan_prompt=? WHERE id=?`, [JSON.stringify(p), v.prompt, id]);
  }
  return shape(await get(`SELECT * FROM custom_report WHERE id = ?`, [id]));
}
async function remove(id) { await run(`DELETE FROM custom_report WHERE id = ?`, [id]); return { ok: true }; }
async function toggle(id, on) { await run(`UPDATE custom_report SET enabled=? WHERE id=?`, [on ? 1 : 0, id]); return { ok: true }; }

const _plans = new Map(); // preview plans, by prompt
async function planFor(r, { rebuild = false } = {}) {
  if (!rebuild && r.plan && r.plan_prompt === r.prompt) { try { return JSON.parse(r.plan); } catch (e) {} }
  const hit = _plans.get(r.prompt); if (!rebuild && hit && Date.now() - hit.at < 30 * 60e3) return hit.p;
  const p = await plan(r.prompt);
  _plans.set(r.prompt, { at: Date.now(), p }); if (_plans.size > 50) _plans.delete(_plans.keys().next().value);
  return p;
}
/** Build the message without sending. Body may be an unsaved draft. */
async function preview(b, { rebuild = false } = {}) {
  let r;
  if (b && b.id) { r = await get(`SELECT * FROM custom_report WHERE id = ?`, [b.id]); if (!r) throw httpError(404, 'Report not found'); if (b.prompt) Object.assign(r, { prompt: String(b.prompt).trim(), period: PERIODS[b.period] ? b.period : r.period, name: clean(b.name || r.name, 120), tz: b.tz || r.tz }); }
  else { const v = cleanInput(Object.assign({}, b, { webhook: undefined })); r = { name: v.name, prompt: v.prompt, period: v.period, tz: v.tz }; }
  const p = await planFor(r, { rebuild });
  const period = resolvePeriod(r.period, r.tz || 'America/Chicago');
  const results = await runQueries(p, period);
  const text = await compose(r, p, period, results);
  const sheet = await makeSheet(r, period, await sheetSections(p, period, results.ctx)).catch(() => null);
  return { text, sheetUrl: sheet && sheet.url, sheetTickets: sheet ? sheet.tickets : 0, parts: parts(text).length, period: period.label, prompt: r.prompt, plan: p, planView: { queries: p.queries.map((q, i) => ({ purpose: q.purpose, source: q.source === 'tool' ? 'Tool data' : 'Desk and CRM data', sql: q.sql, rows: results[i] ? results[i].count : 0, error: results[i] && results[i].error })), notes: p.notes } };
}
async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google Chat returned HTTP ${res.status}`);
  await new Promise((r) => setTimeout(r, 400));
}
async function post(url, text, card, sheetUrl) {
  for (const t of parts(text)) await postJSON(url, { text: t });
  if (!card) return;
  try { await postJSON(url, card); } catch (e) { await postJSON(url, { text: `Ticket details: <${sheetUrl}|Open ticket sheet> (sign in with your Adit Google account)` }); }
}
async function send(id, by) {
  const r = await get(`SELECT * FROM custom_report WHERE id = ?`, [id]); if (!r) throw httpError(404, 'Report not found');
  if (!r.webhook) throw httpError(400, 'This report has no Google Chat webhook');
  let ok = 0, error = null, text = '', label = '';
  try {
    const p = await planFor(r);
    if (r.plan_prompt !== r.prompt) await run(`UPDATE custom_report SET plan=?, plan_prompt=? WHERE id=?`, [JSON.stringify(p), r.prompt, id]);
    const period = resolvePeriod(r.period, r.tz || 'America/Chicago'); label = period.label;
    const results = await runQueries(p, period);
    text = await compose(r, p, period, results);
    if (!text) throw new Error('The report came out empty');
    const sheet = await makeSheet(r, period, await sheetSections(p, period, results.ctx)).catch(() => null);
    await post(r.webhook, text, sheet ? sheetCard(r, period, sheet) : null, sheet && sheet.url); ok = 1;
    if (sheet) text += `\n\n[Ticket sheet: ${sheet.url}]`;
  } catch (e) { error = String(e.message || e).slice(0, 300); }
  await run(`INSERT INTO custom_report_log (report_id, ok, error, text, period_label, sent_by) VALUES (?,?,?,?,?,?)`, [id, ok, error, text.slice(0, 30000), label, by]);
  await run(`UPDATE custom_report SET last_run_at=datetime('now'), last_status=? WHERE id=?`, [ok ? 'sent' : ('failed: ' + error).slice(0, 160), id]);
  return { ok: !!ok, error, text, period: label };
}

// ── Scheduler (every minute) ──────────────────────────────────────────
function isDue(s, now) {
  const [h, m] = String(s.time_hm || '09:00').split(':').map(Number);
  const target = h * 60 + m;
  if (now.mins < target || now.mins > target + 10) return false; // 10 minutes of grace covers a restart
  if (s.last_run_key === now.date) return false;
  if (s.freq === 'weekly') return now.dow === Number(s.weekday ?? 1);
  if (s.freq === 'monthly') return now.dom === Math.min(Number(s.monthday || 1), now.dim);
  if (s.weekdays_only) return now.dow >= 1 && now.dow <= 5;
  return true;
}
function nextRun(s) {
  try {
    const now = localParts(s.tz || 'America/Chicago');
    const [h, m] = String(s.time_hm).split(':').map(Number);
    for (let i = 0; i < 40; i++) {
      const d = addDays(now.date, i);
      if (i === 0 && (now.mins > h * 60 + m + 10 || s.last_run_key === d)) continue;
      const wd = dow(d), dom = Number(d.slice(8)), dim = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
      const ok = s.freq === 'weekly' ? wd === Number(s.weekday ?? 1) : s.freq === 'monthly' ? dom === Math.min(Number(s.monthday || 1), dim) : (!s.weekdays_only || (wd >= 1 && wd <= 5));
      if (ok) return `${d} ${s.time_hm}`;
    }
  } catch (e) {}
  return null;
}
let _busy = false;
async function runDue() {
  if (_busy || !_db) return; _busy = true;
  try {
    for (const s of await all(`SELECT * FROM custom_report WHERE enabled = 1`)) {
      let now; try { now = localParts(s.tz || 'America/Chicago'); } catch (e) { continue; }
      if (!isDue(s, now)) continue;
      await run(`UPDATE custom_report SET last_run_key=? WHERE id=?`, [now.date, s.id]);
      await send(s.id, `schedule:${s.name}`).catch((e) => console.error('custom report', s.id, e.message));
    }
  } catch (e) { console.error('custom reports scheduler:', e.message); }
  finally { _busy = false; }
}

module.exports = { _deps: () => D, _teamMembersRows: teamMembersRows, _resetHr: () => { _hr = { at: 0, rows: null, error: '' }; }, getCsms, saveCsms, getSheet, createViewer, viewerEmail, _sheetCard: sheetCard, _parts: parts, setDeps, setDB, initSchema, list, save, remove, toggle, preview, send, runDue, PERIODS, _checkSql: checkSql, _resolvePeriod: resolvePeriod, _isDue: isDue, _nextRun: nextRun, _withView: withView, _chatLinks: chatLinks, _parseOwnerLog: parseOwnerLog, _csmMoves: csmMoves };
