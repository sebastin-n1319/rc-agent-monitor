'use strict';
/**
 * Batch 287: outage watch. Every 5 minutes in business hours it counts "phones down" tickets (no dial tone, No Account,
 * cannot make or receive calls) from the last 30 minutes and compares them with a normal day at the same time. When
 * they spike, it opens an alert with the voice version mix, the tickets and what the team should do. The alert is shown
 * as a banner inside the tool only; nothing is posted anywhere else. Reads the Desk and CRM mirror, read-only.
 */
let D = {}, _db = null;
function setDeps(d) { D = Object.assign({}, D, d || {}); }
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS outage_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'active', started_at TEXT, last_at TEXT,
    closed_at TEXT, json TEXT, created_at TEXT DEFAULT (datetime('now')))`);
}
const WINDOW_MIN = 30, QUIET_MIN = 45;
const MIN_PRACTICES = 5;
function ta() { return D.ticketAsk || require('./ticket-ask'); }
function sqlRecent(mins) {
  return ta().expandVirtual(`SELECT d.ticket_number, d.web_url, d.contact_account_name AS practice, d.status, d.owner_team_name AS team, d.created_time, coalesce(v.voice_version, 'No version') AS voice_version, p.says_no_account
    FROM desk_tickets d JOIN phone_tickets p ON p.ticket_id = d.id LEFT JOIN ticket_voice v ON v.ticket_id = d.id
    WHERE p.phone_kind = 'down' AND d.created_time > now() - interval '${Number(mins)} minutes' ORDER BY d.created_time LIMIT 200`);
}
// A normal day: down tickets in the same 30 minutes of the day, on the same weekday, over the last 4 weeks.
function sqlBaseline() {
  return ta().expandVirtual(`SELECT count(*) AS n FROM desk_tickets d JOIN phone_tickets p ON p.ticket_id = d.id
    WHERE p.phone_kind = 'down' AND d.created_time > now() - interval '29 days' AND d.created_time < now() - interval '1 day'
    AND extract(dow FROM d.created_time AT TIME ZONE 'America/Chicago') = extract(dow FROM now() AT TIME ZONE 'America/Chicago')
    AND (d.created_time AT TIME ZONE 'America/Chicago')::time BETWEEN ((now() - interval '${WINDOW_MIN} minutes') AT TIME ZONE 'America/Chicago')::time AND (now() AT TIME ZONE 'America/Chicago')::time`);
}
function businessHours(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  return !['Sat', 'Sun'].includes(p.weekday) && h >= 7 && h < 19;
}
const ct = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });

// Pure: decide from the rows whether this is an outage, and describe it.
function assess(rows, baseline) {
  const practices = new Set(rows.map((r) => String(r.practice || r.ticket_number).toLowerCase()));
  const n = practices.size, usual = Math.max(0, Number(baseline) || 0) / 4;
  const spike = n >= MIN_PRACTICES && n >= 3 * usual + 2;
  const mix = {}; rows.forEach((r) => { mix[r.voice_version] = (mix[r.voice_version] || 0) + 1; });
  const known = Object.entries(mix).filter(([v]) => v !== 'No version').sort((a, b) => b[1] - a[1]);
  const top = known[0] || null, knownN = known.reduce((s, x) => s + x[1], 0);
  const version = top && knownN && top[1] / knownN >= 0.7 ? top[0] : null;
  const noAccount = rows.filter((r) => r.says_no_account === true || r.says_no_account === 't').length;
  return { spike, practices: n, usual: Math.round(usual * 10) / 10, mix, version, noAccount, tickets: rows.length, first: rows[0] ? rows[0].created_time : null, last: rows.length ? rows[rows.length - 1].created_time : null };
}
function describe(a, rows) {
  const head = `Possible phones outage${a.version ? ' on ' + a.version : ''}: ${a.practices} practices reported phones down since ${ct(a.first)} CT (usually about ${a.usual} at this time).`;
  const mix = Object.entries(a.mix).sort((x, y) => y[1] - x[1]).map(([v, k]) => `${v}: ${k}`).join(' | ');
  return { headline: head, mix, sharedError: a.noAccount >= 2 ? `${a.noAccount} tickets mention a "No Account" or "not registered" error.` : '',
    asks: ['Create one parent Outage ticket and attach every phones-down ticket to it as a child.', 'Do not troubleshoot one office at a time: acknowledge, confirm the voice version, attach to the parent.', 'Switch missed-call replies to outage mode, so they apologise without promising a call back.', 'VoIP team: confirm the scope and an ETA so the team can update clients.'],
    tickets: rows.slice(-40).map((r) => ({ number: String(r.ticket_number), url: r.web_url || '', practice: String(r.practice || '').slice(0, 80), version: r.voice_version, at: r.created_time, status: r.status, team: r.team })) };
}
let _running = false;
async function check({ force = false } = {}) {
  if (_running) return { skipped: 'running' };
  if (!force && !businessHours()) return { skipped: 'outside business hours' };
  if (!D.query) return { skipped: 'no data' };
  _running = true;
  try {
    const [recent, base] = await Promise.all([D.query(sqlRecent(WINDOW_MIN), 200), D.query(sqlBaseline(), 5).catch(() => ({ rows: [{ n: 0 }] }))]);
    const rows = recent.rows || [];
    const a = assess(rows, (base.rows && base.rows[0] && base.rows[0].n) || 0);
    const active = await get(`SELECT * FROM outage_alerts WHERE status = 'active' ORDER BY id DESC LIMIT 1`);
    const nowIso = new Date().toISOString();
    if (active) {
      const prev = JSON.parse(active.json || '{}');
      if (rows.length) {
        // Keep every ticket seen during the alert, not only the last 30 minutes.
        const seen = new Map((prev.tickets || []).map((t) => [t.number, t]));
        describe(a, rows).tickets.forEach((t) => seen.set(t.number, t));
        const merged = [...seen.values()].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
        const allMix = {}; merged.forEach((t) => { allMix[t.version] = (allMix[t.version] || 0) + 1; });
        const d = describe(Object.assign({}, a, { mix: allMix, first: prev.first || a.first }), merged.map((t) => ({ ticket_number: t.number, web_url: t.url, practice: t.practice, voice_version: t.version, created_time: t.at, status: t.status, team: t.team })));
        const j = Object.assign({}, prev, d, { first: prev.first || a.first, practices: Math.max(prev.practices || 0, new Set(merged.map((t) => t.practice.toLowerCase())).size), version: prev.version || a.version, updatedAt: nowIso });
        await run(`UPDATE outage_alerts SET last_at = ?, json = ? WHERE id = ?`, [a.last || active.last_at, JSON.stringify(j), active.id]);
        return { active: true, updated: true, id: active.id };
      }
      if (Date.now() - Date.parse(active.last_at) > QUIET_MIN * 60000) {
        await run(`UPDATE outage_alerts SET status = 'over', closed_at = ? WHERE id = ?`, [nowIso, active.id]);
        return { active: false, closed: active.id };
      }
      return { active: true, id: active.id };
    }
    if (!a.spike) return { active: false, practices: a.practices, usual: a.usual };
    const j = Object.assign({}, describe(a, rows), { first: a.first, practices: a.practices, usual: a.usual, version: a.version, updatedAt: nowIso });
    const r = await run(`INSERT INTO outage_alerts (status, started_at, last_at, json) VALUES ('active', ?, ?, ?)`, [a.first, a.last, JSON.stringify(j)]);
    return { active: true, opened: r.lastID };
  } finally { _running = false; }
}
async function current() {
  const r = await get(`SELECT * FROM outage_alerts WHERE status = 'active' ORDER BY id DESC LIMIT 1`);
  return r ? Object.assign({ id: r.id, startedAt: r.started_at, lastAt: r.last_at }, JSON.parse(r.json || '{}')) : null;
}
async function recentAlerts(limit = 20) {
  const rows = await all(`SELECT id, status, started_at, last_at, closed_at, json FROM outage_alerts ORDER BY id DESC LIMIT ?`, [Math.min(100, limit)]);
  return rows.map((r) => { const j = JSON.parse(r.json || '{}'); return { id: r.id, status: r.status, startedAt: r.started_at, lastAt: r.last_at, closedAt: r.closed_at, headline: j.headline, version: j.version, practices: j.practices, tickets: (j.tickets || []).length }; });
}
async function close(id, by) { await run(`UPDATE outage_alerts SET status = 'over', closed_at = datetime('now') WHERE id = ? AND status = 'active'`, [Number(id)]); return { closed: Number(id), by }; }
module.exports = { setDeps, setDB, initSchema, check, current, recentAlerts, close, assess, describe, businessHours, _sqlRecent: sqlRecent, _sqlBaseline: sqlBaseline };
