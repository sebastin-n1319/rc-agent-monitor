/**
 * Transfer review (Session 88).
 *
 * T1 agents no longer move tickets to other teams themselves. They set the
 * ticket status to "Pending Review - T1"; a SPOC reviews it within a buffer
 * (15 minutes by default) and moves it to the right person. The reviewer marks
 * every review "Good to go" or "Invalid, needs correction". Invalid reviews are
 * strikes under the 5 strike policy (rolling 90 days):
 *   strikes 1 to 4  notified with the reviewer's comments
 *   5th             verbal warning
 *   6th             written warning
 *   7th             PIP for 30 days
 *   8th and more    disciplinary action
 *
 * Teams in the "assign directly" list skip review. A T1 agent who moves a
 * ticket to any other team without the review status is listed for a SPOC to
 * decide ("Skipped review"); it is never a strike on its own.
 *
 * The app reads Zoho only: reviewers move tickets in Zoho through the link.
 * Tables: tr_reviews, tr_people, tr_settings.
 */
let _db = null;
let _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign(_deps, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').replace(/[\u2014\u2013]/g, ',').trim().slice(0, n);
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
const nameKey = (s) => lc(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const isoOf = (v) => { const t = Date.parse(v); return isNaN(t) ? null : new Date(t).toISOString(); };

const DEFAULTS = {
  status_name: 'Pending Review - T1',
  buffer_min: '15',
  excluded_teams: '[]',
  escalate_emails: JSON.stringify(['sebastin.n@adit.com', 'ronnie@adit.com']),
  enabled: '1',
};
const STRIKE_DAYS = 90;
const POLICY = [
  { from: 1, to: 4, label: 'Notice', text: 'You are notified with the reviewer\'s comments.' },
  { from: 5, to: 5, label: 'Verbal warning', text: 'Verbal warning.' },
  { from: 6, to: 6, label: 'Written warning', text: 'Written warning.' },
  { from: 7, to: 7, label: 'PIP (30 days)', text: 'Performance improvement plan for 30 days.' },
  { from: 8, to: 9999, label: 'Disciplinary action', text: 'Repeated invalid transfers lead to disciplinary action.' },
];
function levelFor(n) { if (!n) return null; return POLICY.find(p => n >= p.from && n <= p.to) || POLICY[POLICY.length - 1]; }

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS tr_settings (key TEXT PRIMARY KEY, value TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS tr_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, ticket_number TEXT, subject TEXT, channel TEXT, web_url TEXT,
    agent_email TEXT, agent_name TEXT, entered_at TEXT, source TEXT NOT NULL DEFAULT 'status',
    state TEXT NOT NULL DEFAULT 'waiting', left_at TEXT, verdict TEXT, to_agent TEXT, to_team TEXT, comment TEXT,
    reviewer TEXT, reviewed_at TEXT, breach_alerted_at TEXT, breach_count INTEGER NOT NULL DEFAULT 0,
    bypass_key TEXT, bypass_detail TEXT, voided INTEGER NOT NULL DEFAULT 0, voided_by TEXT, void_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')), last_seen_at TEXT)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tr_reviews_state ON tr_reviews(state, ticket_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tr_reviews_agent ON tr_reviews(agent_email, verdict, reviewed_at)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tr_reviews_bypass ON tr_reviews(bypass_key) WHERE bypass_key IS NOT NULL`);
  await run(`CREATE TABLE IF NOT EXISTS tr_people (
    name_key TEXT PRIMARY KEY, name TEXT, email TEXT, team TEXT, source TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if ((await getSetting(k)) == null) await setSetting(k, v);
  }
  // Moves before the policy went live are never listed as "Skipped review".
  if ((await getSetting('live_since')) == null) await setSetting('live_since', new Date().toISOString());
}
async function getSetting(k) { const r = await get(`SELECT value FROM tr_settings WHERE key = ?`, [k]); return r ? r.value : null; }
async function setSetting(k, v) { await run(`INSERT OR REPLACE INTO tr_settings (key, value) VALUES (?, ?)`, [k, v == null ? null : String(v)]); }
function parseJSON(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
async function settings() {
  return {
    statusName: (await getSetting('status_name')) || DEFAULTS.status_name,
    bufferMin: Math.max(1, Number(await getSetting('buffer_min')) || 15),
    excludedTeams: parseJSON(await getSetting('excluded_teams'), []),
    escalateEmails: parseJSON(await getSetting('escalate_emails'), []),
    enabled: (await getSetting('enabled')) !== '0',
  };
}
async function saveSettings(b) {
  if (Array.isArray(b.excludedTeams)) await setSetting('excluded_teams', JSON.stringify(b.excludedTeams.map(x => clean(x, 80)).filter(Boolean).slice(0, 80)));
  if (b.bufferMin != null) await setSetting('buffer_min', String(Math.max(1, Math.min(240, Number(b.bufferMin) || 15))));
  if (Array.isArray(b.escalateEmails)) await setSetting('escalate_emails', JSON.stringify(b.escalateEmails.map(lc).filter(e => /^[^@\s]+@[^@\s]+$/.test(e)).slice(0, 6)));
  if (typeof b.statusName === 'string' && clean(b.statusName, 60)) await setSetting('status_name', clean(b.statusName, 60));
  if (typeof b.enabled === 'boolean') await setSetting('enabled', b.enabled ? '1' : '0');
  return settings();
}
const isT1Team = (t) => /^\s*t1\b/i.test(String(t || ''));
function excludedMatch(team, list) {
  const t = lc(team); if (!t) return false;
  return (list || []).some(x => lc(x) === t);
}

// ── people directory: who sits in which team ─────────────────────────────
async function upsertPerson(name, email, team, source, overwrite) {
  const k = nameKey(name); if (!k || !team) return;
  const ex = await get(`SELECT source FROM tr_people WHERE name_key = ?`, [k]);
  if (ex && !overwrite) return;
  await run(`INSERT OR REPLACE INTO tr_people (name_key, name, email, team, source, updated_at) VALUES (?,?,?,?,?,datetime('now'))`,
    [k, clean(name, 80), email ? lc(email) : null, clean(team, 80), source]);
}
/** Builds the directory from Zoho Desk teams (members), AditKB's staff directory and the
 *  "Who does what at Adit" sheet. Zoho teams win, the sheet only fills gaps. */
async function refreshPeople() {
  const counts = { zoho: 0, staff: 0, sheet: 0, teams: 0, errors: [] };
  const ds = _deps.desk;
  if (ds && ds.isConfigured && ds.isConfigured()) {
    let teams = [];
    try {
      const deps = await ds.fetchDepartments().catch(() => []);
      for (const d of deps) {
        const r = await ds.fetchRaw(`/teams?departmentId=${d.id}`).catch(() => null)
          || await ds.fetchRaw(`/departments/${d.id}/teams`).catch(() => null);
        const list = (r && (r.teams || r.data)) || [];
        for (const t of list) if (t && t.id) teams.push({ id: t.id, name: t.name });
      }
    } catch (e) { counts.errors.push('teams: ' + e.message); }
    counts.teams = teams.length;
    for (const t of teams.slice(0, 120)) {
      try {
        const r = await ds.fetchRaw(`/teams/${t.id}/members`);
        const list = (r && (r.members || r.data)) || [];
        for (const m of list) {
          const nm = [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.name || '';
          if (!nm) continue;
          await upsertPerson(nm, m.emailId || m.email, t.name, 'zoho', true); counts.zoho++;
        }
      } catch (e) { if (counts.errors.length < 5) counts.errors.push(`${t.name}: ${e.message}`); }
    }
  }
  try {
    const rows = await all(`SELECT email, full_name, team, zoho_role FROM staff_directory`).catch(() => []);
    for (const r of rows) {
      const team = r.team || r.zoho_role; if (!r.full_name || !team) continue;
      await upsertPerson(r.full_name, r.email, team, 'staff', false); counts.staff++;
    }
  } catch (e) { counts.errors.push('staff: ' + e.message); }
  try {
    const seed = require('./people-seed.json');
    for (const p of seed) { await upsertPerson(p.name, null, p.team, 'sheet', false); if (p.alt) await upsertPerson(p.alt, null, p.team, 'sheet', false); counts.sheet++; }
  } catch (e) { counts.errors.push('sheet: ' + e.message); }
  await setSetting('people_refreshed_at', new Date().toISOString());
  return counts;
}
async function people(q, limit = 40) {
  const t = nameKey(q);
  if (!t) return all(`SELECT name, email, team, source FROM tr_people ORDER BY team, name LIMIT ?`, [limit]);
  return all(`SELECT name, email, team, source FROM tr_people WHERE name_key LIKE ? OR lower(team) LIKE ? ORDER BY CASE WHEN name_key LIKE ? THEN 0 ELSE 1 END, name LIMIT ?`,
    [`%${t}%`, `%${lc(q)}%`, `${t}%`, limit]);
}
async function teamOfName(name) {
  const k = nameKey(name); if (!k) return null;
  let r = await get(`SELECT team FROM tr_people WHERE name_key = ?`, [k]);
  if (!r) { const first = k.split(' ')[0]; if (first.length > 2) r = await get(`SELECT team FROM tr_people WHERE name_key = ? OR name_key LIKE ?`, [first, first + ' %']); }
  return r ? r.team : null;
}
async function teamOptions() {
  const rows = await all(`SELECT DISTINCT team FROM tr_people WHERE source IN ('zoho','staff') AND team IS NOT NULL ORDER BY team`);
  let snap = [];
  try { snap = await all(`SELECT DISTINCT team_name AS team FROM desk_ticket_snapshot WHERE team_name IS NOT NULL AND team_name != '' ORDER BY team_name`); } catch (e) { snap = []; }
  const set = new Set(); for (const r of rows.concat(snap)) if (r.team && !isT1Team(r.team)) set.add(r.team);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ── live queue from Zoho ─────────────────────────────────────────────────
async function fetchPendingFromZoho(statusName) {
  const ds = _deps.desk;
  if (!ds || !ds.isConfigured || !ds.isConfigured()) return { ok: false, reason: 'Zoho Desk is not connected' };
  const out = []; let via = 'status';
  try {
    for (let from = 0; from < 500; from += 100) {
      const r = await ds.fetchRaw(`/tickets/search?status=${encodeURIComponent(statusName)}&limit=100&from=${from}`);
      const list = (r && r.data) || [];
      out.push(...list);
      if (list.length < 100) break;
    }
  } catch (e) {
    // Fallback: recently modified tickets, filtered by status name.
    via = 'recent';
    try {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString(), now = new Date().toISOString();
      for (let from = 0; from < 600; from += 100) {
        const r = await ds.fetchRaw(`/tickets/search?modifiedTimeRange=${encodeURIComponent(since + ',' + now)}&sortBy=-modifiedTime&limit=100&from=${from}`);
        const list = (r && r.data) || [];
        out.push(...list.filter(t => lc(t.status) === lc(statusName)));
        if (list.length < 100) break;
      }
    } catch (e2) { return { ok: false, reason: e2.message }; }
  }
  return { ok: true, tickets: out.filter(t => lc(t.status) === lc(statusName) || via === 'status'), via };
}
async function enteredFromHistory(ticketId, statusName) {
  if (!_deps.history) return null;
  try {
    const items = await _deps.history(ticketId);
    let best = null;
    for (const it of items || []) {
      let info = it.eventInfo; if (info && !Array.isArray(info)) info = [info];
      for (const i of info || []) {
        if (!i || !/status/i.test(String(i.propertyName || ''))) continue;
        const nv = i.propertyValue && i.propertyValue.updatedValue;
        const v = typeof nv === 'object' && nv ? (nv.name || nv.value) : nv;
        if (lc(v) !== lc(statusName)) continue;
        const at = isoOf(it.eventTime);
        if (at && (!best || at > best.at)) {
          const a = it.actor || {};
          best = { at, email: lc(a.email || a.emailId), name: a.name || [a.firstName, a.lastName].filter(Boolean).join(' ') };
        }
      }
    }
    return best;
  } catch (e) { return null; }
}
let _polling = false;
async function poll() {
  if (_polling) return { busy: true };
  _polling = true;
  try {
    const st = await settings();
    if (!st.enabled) return { skipped: 'off' };
    const z = await fetchPendingFromZoho(st.statusName);
    if (!z.ok) { await setSetting('last_poll_error', z.reason); return { error: z.reason }; }
    await setSetting('last_poll_error', null); await setSetting('last_poll_at', new Date().toISOString());
    const seen = new Set(); let added = 0;
    const roster = _deps.roster ? await _deps.roster().catch(() => ({ emails: [], agentNames: {} })) : { emails: [], agentNames: {} };
    for (const t of z.tickets) {
      const tid = String(t.id); seen.add(tid);
      const open = await get(`SELECT * FROM tr_reviews WHERE ticket_id = ? AND state IN ('waiting','moved') AND source = 'status' ORDER BY id DESC LIMIT 1`, [tid]);
      if (open && open.state === 'waiting') { await run(`UPDATE tr_reviews SET last_seen_at = datetime('now') WHERE id = ?`, [open.id]); continue; }
      if (open && open.state === 'moved') { await run(`UPDATE tr_reviews SET state='waiting', left_at=NULL, last_seen_at=datetime('now') WHERE id = ?`, [open.id]); continue; }
      // Just reviewed: give the reviewer time to change the status in Zoho before it counts as a new request.
      const recent = await get(`SELECT id FROM tr_reviews WHERE ticket_id = ? AND state = 'done' AND reviewed_at >= datetime('now','-30 minutes') LIMIT 1`, [tid]);
      if (recent) continue;
      const h = await enteredFromHistory(tid, st.statusName);
      const asg = t.assignee || {};
      let agentEmail = (h && h.email) || lc(asg.emailId);
      let agentName = (h && h.name) || [asg.firstName, asg.lastName].filter(Boolean).join(' ');
      if (agentEmail && roster.agentNames && roster.agentNames[agentEmail]) agentName = roster.agentNames[agentEmail];
      await run(`INSERT INTO tr_reviews (ticket_id, ticket_number, subject, channel, web_url, agent_email, agent_name, entered_at, source, state, last_seen_at)
        VALUES (?,?,?,?,?,?,?,?,'status','waiting',datetime('now'))`,
        [tid, String(t.ticketNumber || ''), clean(t.subject, 300), t.channel || null, t.webUrl || null, agentEmail || null, clean(agentName, 80) || null, (h && h.at) || new Date().toISOString()]);
      added++;
    }
    const waiting = await all(`SELECT id, ticket_id FROM tr_reviews WHERE state = 'waiting' AND source = 'status'`);
    let left = 0;
    for (const w of waiting) if (!seen.has(String(w.ticket_id))) { await run(`UPDATE tr_reviews SET state='moved', left_at=datetime('now') WHERE id = ?`, [w.id]); left++; }
    const breach = await breachCheck(st);
    return { found: z.tickets.length, added, left, via: z.via, breach };
  } finally { _polling = false; }
}
async function breachCheck(st) {
  st = st || await settings();
  const rows = await all(`SELECT * FROM tr_reviews WHERE state = 'waiting' AND source = 'status'`);
  const now = Date.now(), due = [];
  for (const r of rows) {
    const mins = Math.floor((now - Date.parse(r.entered_at)) / 60000);
    if (mins < st.bufferMin) continue;
    const last = r.breach_alerted_at ? Date.parse(r.breach_alerted_at) : 0;
    if (last && now - last < st.bufferMin * 60000) continue;
    due.push({ ...r, mins });
  }
  if (!due.length || !_deps.chat || !_deps.chat.pendingIdle) return { alerted: 0 };
  const res = await _deps.chat.pendingIdle({ items: due.map(r => ({ number: r.ticket_number, subject: r.subject, agent: r.agent_name || r.agent_email, mins: r.mins, url: r.web_url })), mentions: st.escalateEmails, bufferMin: st.bufferMin }).catch(e => ({ ok: false, error: e.message }));
  if (res && res.ok) for (const r of due) await run(`UPDATE tr_reviews SET breach_alerted_at = datetime('now'), breach_count = breach_count + 1 WHERE id = ?`, [r.id]);
  return { alerted: res && res.ok ? due.length : 0, error: res && res.error };
}

// ── team moves that skipped the review status ────────────────────────────
/** Reads stored Zoho history (desk_ticket_activity, source 'history') for T1 agents and
 *  lists team or owner moves that did not go through the review status. */
async function detectBypass({ days = 3 } = {}) {
  const st = await settings();
  if (!st.enabled) return { found: 0 };
  const roster = _deps.roster ? await _deps.roster().catch(() => ({ emails: [] })) : { emails: [] };
  const emails = (roster.emails || []).map(lc);
  if (!emails.length) return { found: 0 };
  let since = new Date(Date.now() - days * 864e5).toISOString();
  const live = await getSetting('live_since');
  if (live && live > since) since = live;
  const ph = emails.map(() => '?').join(',');
  let rows = [];
  try {
    rows = await all(`SELECT a.ticket_id, a.author_email, a.created_time, a.kind, a.detail, a.detail_text, s.ticket_number, s.subject, s.channel, s.web_url
      FROM desk_ticket_activity a LEFT JOIN desk_ticket_snapshot s ON s.ticket_id = a.ticket_id
      WHERE a.source = 'history' AND a.author_email IN (${ph}) AND a.created_time >= ? ORDER BY a.created_time`, [...emails, since]);
  } catch (e) { return { found: 0, error: e.message }; }
  const statusRe = new RegExp(st.statusName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const reviewed = new Set();
  for (const r of rows) if (statusRe.test(String(r.detail_text || r.detail || ''))) reviewed.add(r.ticket_id);
  try {
    const like = `%${st.statusName}%`;
    for (const x of await all(`SELECT DISTINCT ticket_id FROM desk_ticket_activity WHERE source = 'history' AND (detail LIKE ? OR detail_text LIKE ?)`, [like, like])) reviewed.add(x.ticket_id);
    for (const x of await all(`SELECT DISTINCT ticket_id FROM tr_reviews WHERE source = 'status'`)) reviewed.add(x.ticket_id);
  } catch (e) { /* keep what we have */ }
  let found = 0;
  for (const r of rows) {
    if (reviewed.has(r.ticket_id)) continue;
    const text = String(r.detail_text || r.detail || '');
    let toTeam = null, toAgent = null;
    const tm = /team[^:;()]*:\s*([^;()]+?)\s+to\s+([^;()]+)/i.exec(text);
    const om = /(?:assignee|owner)[^:;()]*:\s*([^;()]+?)\s+to\s+([^;()]+)/i.exec(text);
    if (r.kind === 'team_out' && !tm) toTeam = r.detail || null;
    if (tm) toTeam = tm[2].trim();
    if (om) { toAgent = om[2].trim(); if (!toTeam) toTeam = await teamOfName(toAgent); }
    if (!toTeam && !toAgent) continue;
    if (toTeam && isT1Team(toTeam)) continue;
    if (!toTeam && toAgent) continue; // owner we cannot place: leave it alone
    if (excludedMatch(toTeam, st.excludedTeams)) continue;
    const key = `${r.ticket_id}|${r.created_time}`;
    const x = await run(`INSERT OR IGNORE INTO tr_reviews (ticket_id, ticket_number, subject, channel, web_url, agent_email, agent_name, entered_at, source, state, left_at, to_agent, to_team, bypass_key, bypass_detail)
      VALUES (?,?,?,?,?,?,?,?,'bypass','moved',?,?,?,?,?)`,
      [r.ticket_id, r.ticket_number || null, clean(r.subject, 300), r.channel || null, r.web_url || null, r.author_email, (roster.agentNames || {})[r.author_email] || null,
        r.created_time, r.created_time, toAgent ? clean(toAgent, 80) : null, clean(toTeam, 80), key, clean(text, 300)]);
    if (x.changes) found++;
  }
  if (found && _deps.notices && _deps.spocs) {
    const sp = await _deps.spocs().catch(() => []);
    for (const e of sp) await _deps.notices.notifyPerson(e, { title: found === 1 ? '1 ticket skipped review' : `${found} tickets skipped review`, body: 'A T1 agent moved a ticket without Pending Review - T1. Open Ticket audits to decide.', link: 'app:audits', category: 'process' }).catch(() => {});
  }
  return { found };
}

// ── reviewer page ────────────────────────────────────────────────────────
function shape(r, now) {
  const mins = r.entered_at ? Math.max(0, Math.floor(((r.state === 'waiting' ? now : Date.parse(r.left_at || r.reviewed_at || now)) - Date.parse(r.entered_at)) / 60000)) : null;
  return { ...r, minutes: mins };
}
async function list() {
  const st = await settings(), now = Date.now();
  const waiting = (await all(`SELECT * FROM tr_reviews WHERE state = 'waiting' ORDER BY entered_at ASC`)).map(r => shape(r, now));
  const moved = (await all(`SELECT * FROM tr_reviews WHERE state = 'moved' AND COALESCE(left_at, entered_at) >= datetime('now','-14 days') ORDER BY COALESCE(left_at, entered_at) DESC LIMIT 200`)).map(r => shape(r, now));
  const done = (await all(`SELECT * FROM tr_reviews WHERE state = 'done' AND reviewed_at >= datetime('now','-1 day') ORDER BY reviewed_at DESC LIMIT 100`)).map(r => shape(r, now));
  const today = await get(`SELECT SUM(CASE WHEN verdict='good' THEN 1 ELSE 0 END) AS good, SUM(CASE WHEN verdict='invalid' THEN 1 ELSE 0 END) AS invalid,
      AVG((julianday(reviewed_at) - julianday(entered_at)) * 1440) AS avgMin FROM tr_reviews WHERE state='done' AND reviewed_at >= datetime('now','start of day')`);
  return { settings: st, waiting, moved, done, today: { good: (today && today.good) || 0, invalid: (today && today.invalid) || 0, avgMin: today && today.avgMin != null ? Math.round(today.avgMin) : null },
    lastPollAt: await getSetting('last_poll_at'), lastPollError: await getSetting('last_poll_error') };
}
async function activeStrikes(email) {
  return all(`SELECT * FROM tr_reviews WHERE agent_email = ? AND verdict = 'invalid' AND voided = 0 AND reviewed_at >= datetime('now', ?) ORDER BY reviewed_at DESC`, [lc(email), `-${STRIKE_DAYS} days`]);
}
async function verdict(id, ctx, b) {
  const r = await get(`SELECT * FROM tr_reviews WHERE id = ?`, [id]);
  if (!r) throw fail('Review not found', 404);
  if (r.agent_email && r.agent_email === lc(ctx.email)) throw fail('You handled this ticket, so another reviewer has to decide', 403);
  const v = b.verdict === 'good' ? 'good' : b.verdict === 'invalid' ? 'invalid' : null;
  if (!v) throw fail('Choose Good to go or Invalid');
  const comment = clean(b.comment, 800);
  if (v === 'invalid' && comment.length < 5) throw fail('Write what the agent missed so they can correct it');
  const toAgent = clean(b.toAgent, 80) || r.to_agent || null;
  let toTeam = clean(b.toTeam, 80) || null;
  if (!toTeam && toAgent) toTeam = await teamOfName(toAgent);
  const wasInvalid = r.verdict === 'invalid' && !r.voided;
  await run(`UPDATE tr_reviews SET verdict=?, comment=?, to_agent=?, to_team=?, reviewer=?, reviewed_at=datetime('now'), state='done' WHERE id=?`,
    [v, comment || null, toAgent, toTeam || r.to_team || null, lc(ctx.email), id]);
  let strike = null;
  if (v === 'invalid' && !wasInvalid && r.agent_email) {
    const n = (await activeStrikes(r.agent_email)).length;
    const lv = levelFor(n);
    strike = { count: n, level: lv.label };
    if (_deps.notices) {
      await _deps.notices.notifyPerson(r.agent_email, { title: `Invalid transfer on #${r.ticket_number}: strike ${n}`, body: `${comment} Your active strikes: ${n} (${lv.label}). Open My Stats, Transfer policy, for details.`, category: 'process', urgent: true }).catch(() => {});
    }
    if (_deps.chat && _deps.chat.strike) {
      const st = await settings();
      strike.chat = await _deps.chat.strike({ agentEmail: r.agent_email, agentName: r.agent_name, ticketNumber: r.ticket_number, subject: r.subject, url: r.web_url, comment, count: n, level: lv.label, reviewerEmail: ctx.email, escalate: n >= 5 ? st.escalateEmails : [] }).catch(e => ({ ok: false, error: e.message }));
    }
  }
  return { verdict: v, strike };
}
async function voidStrike(id, by, reason) {
  const r = await get(`SELECT * FROM tr_reviews WHERE id = ?`, [id]);
  if (!r || r.verdict !== 'invalid') throw fail('Strike not found', 404);
  await run(`UPDATE tr_reviews SET voided = 1, voided_by = ?, void_reason = ? WHERE id = ?`, [lc(by), clean(reason, 300) || null, id]);
}
async function strikesBoard() {
  const rows = await all(`SELECT * FROM tr_reviews WHERE verdict = 'invalid' AND reviewed_at >= datetime('now', ?) ORDER BY reviewed_at DESC`, [`-${STRIKE_DAYS} days`]);
  const by = {};
  for (const r of rows) {
    const k = r.agent_email || 'unknown';
    const o = by[k] = by[k] || { email: k, name: r.agent_name || k.split('@')[0], active: 0, strikes: [] };
    if (!r.voided) o.active++;
    o.strikes.push({ id: r.id, ticket: r.ticket_number, url: r.web_url, at: r.reviewed_at, comment: r.comment, reviewer: r.reviewer, voided: !!r.voided, expires: new Date(Date.parse(String(r.reviewed_at).replace(' ', 'T') + 'Z') + STRIKE_DAYS * 864e5).toISOString() });
  }
  const totals = await get(`SELECT COUNT(*) AS n, SUM(CASE WHEN verdict='good' THEN 1 ELSE 0 END) AS good, SUM(CASE WHEN verdict='invalid' AND voided=0 THEN 1 ELSE 0 END) AS invalid FROM tr_reviews WHERE state='done' AND reviewed_at >= datetime('now','-30 days')`);
  return { agents: Object.values(by).map(a => ({ ...a, level: levelFor(a.active) ? levelFor(a.active).label : null })).sort((a, b) => b.active - a.active), policy: POLICY, days: STRIKE_DAYS, last30: totals || {} };
}
async function mine(email) {
  const st = await settings();
  const rows = await all(`SELECT * FROM tr_reviews WHERE agent_email = ? AND state = 'done' AND reviewed_at >= datetime('now', ?) ORDER BY reviewed_at DESC LIMIT 200`, [lc(email), `-${STRIKE_DAYS} days`]);
  const strikes = rows.filter(r => r.verdict === 'invalid' && !r.voided);
  const lv = levelFor(strikes.length);
  return {
    policy: POLICY, days: STRIKE_DAYS, statusName: st.statusName, bufferMin: st.bufferMin, excludedTeams: st.excludedTeams,
    active: strikes.length, level: lv ? lv.label : null, nextLevel: (levelFor(strikes.length + 1) || {}).label || null,
    good: rows.filter(r => r.verdict === 'good').length,
    strikes: strikes.map(r => ({ ticket: r.ticket_number, url: r.web_url, at: r.reviewed_at, comment: r.comment, expires: new Date(Date.parse(String(r.reviewed_at).replace(' ', 'T') + 'Z') + STRIKE_DAYS * 864e5).toISOString() })),
  };
}

async function waitingCount() { const r = await get(`SELECT COUNT(*) AS n FROM tr_reviews WHERE state IN ('waiting','moved')`); return r ? r.n : 0; }

async function reviewerStats() {
  const rows = await all(`SELECT reviewer, COUNT(*) AS n, SUM(CASE WHEN verdict='invalid' THEN 1 ELSE 0 END) AS invalid,
      AVG((julianday(reviewed_at) - julianday(entered_at)) * 1440) AS avgMin, SUM(CASE WHEN reviewed_at >= datetime('now','start of day') THEN 1 ELSE 0 END) AS today
    FROM tr_reviews WHERE state = 'done' AND reviewed_at >= datetime('now','-30 days') AND reviewer IS NOT NULL GROUP BY reviewer`);
  const out = {}; for (const r of rows) out[r.reviewer] = { reviewed: r.n, invalid: r.invalid || 0, today: r.today || 0, avgMin: r.avgMin != null ? Math.round(r.avgMin) : null };
  return out;
}

module.exports = {
  waitingCount, reviewerStats,
  setDB, setDeps, initSchema, settings, saveSettings, POLICY, levelFor,
  refreshPeople, people, teamOptions, teamOfName,
  poll, breachCheck, detectBypass, list, verdict, voidStrike, strikesBoard, mine, getSetting,
};
