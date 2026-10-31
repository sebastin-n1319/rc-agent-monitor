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
}

// ── What the AI may read ──────────────────────────────────────────────
const TOOL_TABLES = {
  tr_reviews: { about: 'Transfer reviews: every ticket a T1 agent moved to Pending Review - T1, and where the reviewer sent it. One row per transfer.',
    cols: { ticket_number: 'Desk ticket number', subject: 'ticket subject', channel: 'Email, Phone, Chat...', agent_name: 'the T1 agent who transferred it', entered_at: 'when it entered Pending Review - T1 (UTC ISO text)',
      state: 'waiting | reviewed | left', verdict: 'valid | invalid | ... (the reviewer decision)', to_agent: 'the person it was sent to (e.g. the CSM name)', to_team: 'the team it was sent to (e.g. CSM, VoIP, Tech)',
      reviewer: 'who reviewed', reviewed_at: 'when it was reviewed (UTC ISO text)', severity: 'fatal | feedback for invalid transfers', voided: '1 when the review was voided (exclude these)' } },
  staff_directory: { about: 'Adit staff and their team.', cols: { full_name: 'name', team: 'team (e.g. CSM, Onboarding, T1, VoIP)', status: 'active or not' } },
  desk_ticket_snapshot: { about: 'T1 tickets synced from Zoho Desk (the T1 department).', cols: { ticket_number: '', subject: '', status: '', status_type: 'Open | On Hold | Closed', channel: '', priority: '', assignee_name: 'current owner', created_time: 'UTC ISO text', closed_time: 'UTC ISO text' } },
  chat_conversation_snapshot: { about: 'SalesIQ chats.', cols: { attender_name: 'agent who handled the chat', department_name: '', status: '', chat_status_label: '', start_time: 'UTC ISO text', end_time: '', response_seconds: 'first response time in seconds', rating: 'Happy | Ok | Bad' } },
  break_events: { about: 'Agent break and aux events in this tool.', cols: { username: 'agent', action_label: 'what they did (Break, BRB, Logged In...)', current_status: 'status after the event', created_at: 'UTC timestamp text' } },
};
const WH_TABLES = {
  desk_tickets: { about: 'All Zoho Desk tickets (every department), one row per ticket.',
    cols: { ticket_number: '', subject: '', status: '', status_type: '', channel: '', category: '', sub_category: '', priority: '', created_time: 'timestamptz', closed_time: 'timestamptz', modified_time: 'timestamptz',
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

// ── The current CSMs (Batch 227) ──────────────────────────────────────
// The staff directory does not list CSMs, so the CSM roster is read from Desk: everyone set as a ticket's CSM in the
// last 90 days (10 tickets or more). Used as {{csm_names}} so "sent to a CSM" never counts T2 queues or T1 agents.
let _csm = { at: 0, names: [] };
async function csmNames() {
  if (Date.now() - _csm.at < 12 * 3600e3 && _csm.names.length) return _csm.names;
  try {
    const r = await D.query(`SELECT cf_csm_account_manager AS n, count(*) AS c FROM desk_tickets WHERE created_time > now() - interval '90 days' AND cf_csm_account_manager IS NOT NULL GROUP BY 1 HAVING count(*) >= 10 ORDER BY 2 DESC`, 200);
    const names = [...new Set((r.rows || []).map((x) => String(x.n || '').split(' - ')[0].trim()).filter((n) => /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(n) && !/support|team|pod|queue|none/i.test(n)))];
    if (names.length) _csm = { at: Date.now(), names };
  } catch (e) { /* keep the last list */ }
  return _csm.names;
}
const sqlList = (names) => names.length ? names.map((n) => `'${n.toLowerCase().replace(/'/g, "''")}'`).join(',') : `''`;

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
const PLAN = `You plan a recurring report for the T1 support team at Adit. Turn the admin's request into 1 to 4 read-only SQL queries over the data below. Return the exact numbers the report needs (group and count in SQL; do not return raw rows when a count answers it; at most 200 rows per query).
Two sources:
- "tool": the T1 tool's own SQLite database. Timestamps are text in UTC ISO format; compare with the placeholders as text, e.g. reviewed_at >= '{{from}}' AND reviewed_at < '{{to}}'.
- "warehouse": a PostgreSQL copy of Zoho Desk and Zoho CRM. Compare timestamps with '{{from}}'::timestamptz and '{{to}}'::timestamptz.
Placeholders (always use them for the period, never fixed dates): {{from}}, {{to}} (UTC instants, to is exclusive), {{from_date}}, {{to_date}} (YYYY-MM-DD). {{csm_names}} is the current list of CSM names, lowercased and quoted for SQL (use as LOWER(TRIM(x)) IN ({{csm_names}})); always use it when the request is about CSMs, never type the names yourself.
Rules: only the tables and columns listed; SELECT or WITH only; no personal data (emails, phone numbers, client contact names, ticket text). Prefer the tool data for anything about T1 transfers and reviews ("tickets T1 sent to a CSM" are tr_reviews rows the reviewer sent on: to_agent is the person or queue, to_team the team; leave out voided rows). When the request is about CSMs, keep only CSMs with LOWER(TRIM(to_agent)) IN ({{csm_names}}). For other teams (onboarding, VoIP, T2) filter to_team or to_agent by the values seen below; never list queues or people from other teams. Group case-insensitively so one name is not split by spelling, and show the name as stored.
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
async function runQueries(p, period) {
  const out = [];
  const csm = p.queries.some((q) => /\{\{csm_names\}\}/.test(q.sql)) ? sqlList(await csmNames()) : null;
  for (const q of p.queries) {
    let sql = fill(checkSql(q.source, q.sql), period);
    if (csm) sql = sql.replace(/\{\{csm_names\}\}/g, csm);
    try {
      let rows;
      if (q.source === 'tool') rows = await roAll(sql + (/\blimit\s+\d+\s*$/i.test(sql) ? '' : ' LIMIT 500'));
      else rows = (await D.query(sql, 500)).rows || [];
      out.push({ purpose: q.purpose, source: q.source, rows: rows.slice(0, 200), count: rows.length });
    } catch (e) { out.push({ purpose: q.purpose, source: q.source, rows: [], count: 0, error: String(e.message || e).replace(/aditkb/ig, 'data source').slice(0, 200) }); }
  }
  return out;
}
const WRITE = `You write a recurring report for a Google Chat space at Adit. Use ONLY the numbers in the query results; never invent or estimate. If a query failed or returned nothing, say plainly that there was no data for it.
Format for Google Chat: plain text, *bold* for the title and key numbers, one item per line, short lines, a total where it helps, sorted from highest to lowest. At most one or two emoji. Professional and concise. No em or en dashes. No tables with pipes.
Start with the title and the period. End with nothing extra (no sign-off).
Reply with JSON: {"text":"the message"}`;
async function compose(r, p, period, results) {
  const user = [`Report: ${r.name}`, `What it should show: ${r.prompt}`, `Period: ${period.label}`, p.title ? `Suggested title: ${p.title}` : '',
    'Query results:\n' + results.map((x, i) => `[${i + 1}] ${x.purpose}${x.error ? ' (failed: ' + x.error + ')' : ''}\n${JSON.stringify(x.rows).slice(0, 12000)}`).join('\n\n')].filter(Boolean).join('\n\n');
  const o = { system: WRITE, user, maxTokens: 1800, timeoutMs: 60000, temperature: 0 };
  let res; try { res = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(o) : await D.ai.bestJSON(o); } catch (e) { res = await D.ai.bestJSON(o); }
  return String(((res && res.json) || {}).text || '').replace(/[\u2014\u2013]/g, ',').trim().slice(0, 3800);
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
  return { text, period: period.label, prompt: r.prompt, plan: p, planView: { queries: p.queries.map((q, i) => ({ purpose: q.purpose, source: q.source === 'tool' ? 'Tool data' : 'Desk and CRM data', sql: q.sql, rows: results[i] ? results[i].count : 0, error: results[i] && results[i].error })), notes: p.notes } };
}
async function post(url, text) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google Chat returned HTTP ${res.status}`);
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
    await post(r.webhook, text); ok = 1;
  } catch (e) { error = String(e.message || e).slice(0, 300); }
  await run(`INSERT INTO custom_report_log (report_id, ok, error, text, period_label, sent_by) VALUES (?,?,?,?,?,?)`, [id, ok, error, text.slice(0, 4000), label, by]);
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

module.exports = { setDeps, setDB, initSchema, list, save, remove, toggle, preview, send, runDue, PERIODS, _checkSql: checkSql, _resolvePeriod: resolvePeriod, _isDue: isDue, _nextRun: nextRun };
