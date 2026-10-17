'use strict';
/**
 * Batch 170: one source of truth for the numbers agents compare with their bonus.
 *
 * Tickets closed and FCR on Ticket Lifecycle and My Stats used the tool's own ticket copy (which misses some tickets and
 * credits by its own owner field) and Zoho's "Is First Call Resolution" flag, while the bonus uses Zoho Analytics
 * (Ticket Owner Name, Ticket Closed Time) and the agreed FCR rule (Resolution Time in Business Hours <= 24 h and no
 * reopen). This keeps a copy of the Analytics closed-ticket rows (refreshed by the FCR Analytics sync) and gives both
 * views the same counts. Tickets closed after the latest synced Analytics row fall back to the tool's copy with the same
 * rule, so today's numbers still move.
 *
 * Calls: a range made of whole months uses the per-month RingCentral counts the bonus is worked out from (bonus_calls),
 * so a month on My Stats shows the same inbound calls as the bonus.
 */
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const FCR_MS = 24 * 3600 * 1000;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS analytics_closed_tickets (ticket_id TEXT PRIMARY KEY, request_id TEXT, owner_name TEXT,
    closed_time TEXT, resolution_ms REAL, reopen INTEGER, synced_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_acl_closed ON analytics_closed_tickets(closed_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_acl_owner ON analytics_closed_tickets(owner_name, closed_time)`);
  await run(`CREATE TABLE IF NOT EXISTS stats_align_state (key TEXT PRIMARY KEY, value TEXT)`);
}
async function getState(k) { const r = (await all(`SELECT value FROM stats_align_state WHERE key = ?`, [k]))[0]; return r ? r.value : null; }
async function setState(k, v) { await run(`INSERT OR REPLACE INTO stats_align_state (key, value) VALUES (?, ?)`, [k, v == null ? null : String(v)]); }

/** Store one Analytics window (closed time from..to, UTC ISO). Rows in the window that Analytics no longer returns
 *  (reopened, or moved out of the window) are removed, so the copy follows Analytics. */
async function storeWindow(fromIso, toIso, rows) {
  const keep = new Set();
  for (const r of rows || []) {
    if (!r.ticket_id || !r.closed_time_utc) continue;
    keep.add(String(r.ticket_id));
    await run(`INSERT OR REPLACE INTO analytics_closed_tickets (ticket_id, request_id, owner_name, closed_time, resolution_ms, reopen, synced_at)
      VALUES (?,?,?,?,?,?,datetime('now'))`, [String(r.ticket_id), r.request_id || null, r.owner_name || null, r.closed_time_utc,
      r.resolution_ms == null ? null : r.resolution_ms, r.reopen == null ? 0 : r.reopen]);
  }
  const old = await all(`SELECT ticket_id FROM analytics_closed_tickets WHERE closed_time >= ? AND closed_time < ?`, [fromIso, toIso]);
  for (const o of old) if (!keep.has(String(o.ticket_id))) await run(`DELETE FROM analytics_closed_tickets WHERE ticket_id = ?`, [o.ticket_id]);
}
// Newest closed time in the copy: anything closed after it (Zoho Analytics refreshes from Desk every few hours) is
// counted from the tool's own ticket copy with the same rule, so today's numbers still move.
async function watermark(fallback) { const r = (await all(`SELECT MAX(closed_time) AS w FROM analytics_closed_tickets`))[0]; if (!r || !r.w) return fallback; const t = Date.parse(r.w); return isFinite(t) ? new Date(t + 1).toISOString() : r.w; }

/** name (lower case) -> email, from the monitored-agent names and the Roster full names (the same names the bonus uses). */
function nameMap(agentNames, byEmail) {
  const m = new Map();
  for (const [e, n] of Object.entries(agentNames || {})) if (n) m.set(lc(n), lc(e));
  for (const [e, x] of Object.entries(byEmail || {})) if (x && x.full_name && !m.has(lc(x.full_name))) m.set(lc(x.full_name), lc(e));
  return m;
}
async function covered(from) {
  const floor = await getState('floor');
  return !!(floor && String(from) >= floor);
}

/** { email: { closed, fcrYes } } or null when the range is older than the Analytics copy. */
async function closedStats({ emails, from, to, names }) {
  if (!emails || !emails.length || !(await covered(from))) return null;
  const want = new Set(emails.map(lc));
  const out = {}; for (const e of want) out[e] = { closed: 0, fcrYes: 0 };
  const wm = await watermark(from);
  const upTo = wm < to ? wm : to;
  if (upTo > from) {
    const rows = await all(`SELECT owner_name, COUNT(*) AS n, SUM(CASE WHEN resolution_ms IS NOT NULL AND resolution_ms <= ? AND COALESCE(reopen,0) = 0 THEN 1 ELSE 0 END) AS f
      FROM analytics_closed_tickets WHERE closed_time >= ? AND closed_time < ? GROUP BY owner_name`, [FCR_MS, from, upTo]);
    for (const r of rows) { const e = names.get(lc(r.owner_name)); if (e && want.has(e)) { out[e].closed += r.n || 0; out[e].fcrYes += r.f || 0; } }
  }
  if (to > wm) {
    const ph = [...want].map(() => '?').join(',');
    const rows = await all(`SELECT assignee_email AS email, COUNT(*) AS n,
        SUM(CASE WHEN COALESCE(zoho_resolution_business_hours, resolution_business_hours) IS NOT NULL
                  AND COALESCE(zoho_resolution_business_hours, resolution_business_hours) <= 24 AND COALESCE(reopen_count,0) = 0 THEN 1 ELSE 0 END) AS f
        FROM desk_ticket_snapshot WHERE assignee_email IN (${ph}) AND status_type = 'Closed' AND closed_time >= ? AND closed_time < ?
          AND ticket_id NOT IN (SELECT ticket_id FROM analytics_closed_tickets) GROUP BY assignee_email`, [...want, wm > from ? wm : from, to]).catch(() => []);
    for (const r of rows) { const e = lc(r.email); if (out[e]) { out[e].closed += r.n || 0; out[e].fcrYes += r.f || 0; } }
  }
  return out;
}
/** Puts the aligned closed / FCR counts onto agentSummary() rows (skipped when a customer filter is on). */
async function applyToSummary(rows, { from, to, agentNames, byEmail, q }) {
  if (!Array.isArray(rows) || !rows.length || q) return rows;
  try {
    const st = await closedStats({ emails: rows.map((r) => r.email), from, to, names: nameMap(agentNames, byEmail) });
    if (!st) return rows;
    for (const r of rows) {
      const s = st[lc(r.email)]; if (!s) continue;
      r.closed_count = s.closed; r.fcr_yes = s.fcrYes; r.fcr_total = s.closed;
      r.fcr_pct = s.closed ? Math.round(s.fcrYes / s.closed * 1000) / 10 : null;
      r.closed_source = 'zoho analytics';
    }
  } catch (e) { console.warn('stats align (closed) skipped:', e.message); }
  return rows;
}
/** The closed tickets behind the count, for the Closed / FCR lists. null = use the old list. */
async function closedTicketList({ email, from, to, agentNames, byEmail, q, limit = 500 }) {
  if (q || !(await covered(from))) return null;
  const names = nameMap(agentNames, byEmail), mine = [...names.entries()].filter(([, e]) => e === lc(email)).map(([n]) => n);
  if (!mine.length) return null;
  const wm = await watermark(from), upTo = wm < to ? wm : to;
  const rows = upTo > from ? await all(`SELECT a.ticket_id, a.request_id, a.closed_time AS a_closed, a.resolution_ms, a.reopen,
        s.ticket_number, s.subject, s.status, s.status_type, s.channel, s.classification, COALESCE(NULLIF(s.manual_category,''), NULLIF(s.ai_category,'')) AS category,
        s.module, s.created_time, s.department_name, s.assignee_name, s.assignee_email, s.web_url
      FROM analytics_closed_tickets a LEFT JOIN desk_ticket_snapshot s ON s.ticket_id = a.ticket_id
      WHERE lower(trim(a.owner_name)) IN (${mine.map(() => '?').join(',')}) AND a.closed_time >= ? AND a.closed_time < ?
      ORDER BY a.closed_time DESC LIMIT ?`, [...mine, from, upTo, limit]) : [];
  const out = rows.map((r) => ({
    ticket_id: r.ticket_id, ticket_number: r.ticket_number || r.request_id, subject: r.subject || '(not in the tool\'s ticket copy yet)',
    status: r.status || 'Closed', status_type: 'Closed', channel: r.channel || null, classification: r.classification || null, category: r.category || null,
    module: r.module || null, resolution_business_hours: r.resolution_ms == null ? null : Math.round(r.resolution_ms / 360000) / 10, reopen_count: r.reopen || 0,
    created_time: r.created_time || null, closed_time: r.a_closed, department_name: r.department_name || null, assignee_name: r.assignee_name || null,
    assignee_email: r.assignee_email || email, web_url: r.web_url || null,
    fcr_achieved: r.resolution_ms != null && r.resolution_ms <= FCR_MS && !(r.reopen > 0),
  }));
  if (to > wm) {
    const s = await all(`SELECT ticket_id, ticket_number, subject, status, status_type, channel, classification, COALESCE(NULLIF(manual_category,''), NULLIF(ai_category,'')) AS category,
        module, COALESCE(zoho_resolution_business_hours, resolution_business_hours) AS rbh, reopen_count, created_time, closed_time, department_name, assignee_name, assignee_email, web_url
      FROM desk_ticket_snapshot WHERE assignee_email = ? AND status_type = 'Closed' AND closed_time >= ? AND closed_time < ?
        AND ticket_id NOT IN (SELECT ticket_id FROM analytics_closed_tickets) ORDER BY closed_time DESC`, [lc(email), wm > from ? wm : from, to]).catch(() => []);
    for (const r of s) out.unshift(Object.assign({}, r, { resolution_business_hours: r.rbh, fcr_achieved: r.rbh != null && r.rbh <= 24 && !((r.reopen_count || 0) > 0) }));
  }
  return out.slice(0, limit);
}

// ── Calls: whole months from bonus_calls ──
function chiMonthStart(y, m) { // ISO of the 1st at 00:00 America/Chicago
  for (const off of [5, 6]) { const d = new Date(Date.UTC(y, m - 1, 1, off)); const h = Number(d.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false })); if (h === 0 || h === 24) return d.toISOString(); }
  return new Date(Date.UTC(y, m - 1, 1, 6)).toISOString();
}
/** ['2026-07', ...] when [from, to) is exactly whole Chicago months, else null. */
function wholeMonths(from, to) {
  const f = new Date(from), t = new Date(to); if (!(t > f)) return null;
  const p = f.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).split('-').map(Number);
  let y = p[0], m = p[1];
  if (Math.abs(Date.parse(chiMonthStart(y, m)) - f.getTime()) > 60e3) return null;
  const out = [];
  for (let i = 0; i < 24; i++) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; y++; }
    const next = Date.parse(chiMonthStart(y, m));
    if (Math.abs(next - t.getTime()) <= 60e3) return out;
    if (next > t.getTime()) return null;
  }
  return null;
}
async function applyMonthCalls(email, from, to, callStats) {
  if (!callStats) return callStats;
  try {
    const months = wholeMonths(from, to); if (!months) return callStats;
    const rows = await all(`SELECT month, inbound, answered, outbound FROM bonus_calls WHERE email = ? AND month IN (${months.map(() => '?').join(',')})`, [lc(email), ...months]);
    if (rows.length !== months.length || rows.some((r) => r.inbound == null)) return callStats;
    const inb = rows.reduce((t, r) => t + (r.inbound || 0), 0), ans = rows.reduce((t, r) => t + (r.answered || 0), 0), outb = rows.reduce((t, r) => t + (r.outbound || 0), 0);
    return Object.assign({}, callStats, { inboundOffered: inb, inboundCalls: ans, outboundCalls: outb, totalCalls: ans + outb, missedCalls: Math.max(0, inb - ans - (callStats.voicemails || 0)),
      monthSource: 'RingCentral month totals (same as the bonus)' });
  } catch (e) { return callStats; }
}

module.exports = { setDB, initSchema, getState, setState, storeWindow, closedStats, applyToSummary, closedTicketList, applyMonthCalls, wholeMonths, nameMap };
