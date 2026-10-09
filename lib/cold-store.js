/**
 * Cold store (Batch 152): older ticket history without using the 500 MB volume.
 *
 * The volume keeps full ticket detail from HOT_FLOOR onward (desk_ticket_snapshot / desk_ticket_activity). When a report,
 * an agent's own stats or a ticket list asks for a range that starts before that, the request is served from a second copy
 * of lib/desk-lifecycle.js bound to a cache database on the container's own scratch disk (os.tmpdir(), not the volume).
 * The cache is filled from AditKB one calendar month at a time:
 *   - every ticket created in that month,
 *   - older tickets the monitored agents replied to or commented on in that month,
 *   - older tickets whose owner log names a monitored agent and that changed in or after that month (last 6 months only),
 *   - the monitored agents' replies and comments in that month,
 *   - CSAT survey rows for those tickets, copied from the volume (survey rows are small and kept for all time).
 * The same report code then runs on it, so numbers are worked out exactly as for recent periods, except two things that only
 * Zoho's live API provides and are not bulk-loaded for old months: field-change history (tickets updated, team transfers read
 * from history) and Zoho Analytics FCR flags (the older FCR rule is used instead).
 *
 * The cache is rebuilt from scratch on every restart and wiped if it grows past COLD_MAX_MB. Months ending more than 120 days
 * ago are re-read after a day, newer months after 30 minutes.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const COLD_PATH = process.env.COLD_DB_PATH || path.join(os.tmpdir(), 'desk-cold.db');
const COLD_MAX_MB = Number(process.env.COLD_MAX_MB || 1500);
// First day the volume holds complete ticket detail (the 90-day trim of 9 Oct 2026 removed everything created before it).
const DEFAULT_HOT_FLOOR = '2026-07-12T00:00:00.000Z';

let deps = null;      // { aditkb, upsertRow(row, target), roster(), hotAll(sql, params), hotFloor() }
let lifecycle = null; // second desk-lifecycle instance bound to the cold DB
let coldDb = null;
let initP = null;
const loading = new Map();

function configure(d) { deps = d; }

function freshLifecycle() {
  const id = require.resolve('./desk-lifecycle');
  const hot = require.cache[id];
  delete require.cache[id];
  const cold = require('./desk-lifecycle');
  if (hot) require.cache[id] = hot; else delete require.cache[id];
  return cold;
}

const run = (sql, p = []) => new Promise((res, rej) => coldDb.run(sql, p, function (e) { e ? rej(e) : res(this.changes || 0); }));
const get = (sql, p = []) => new Promise((res, rej) => coldDb.get(sql, p, (e, r) => e ? rej(e) : res(r)));

async function init() {
  if (initP) return initP;
  initP = (async () => {
    for (const f of [COLD_PATH, COLD_PATH + '-journal', COLD_PATH + '-wal', COLD_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    coldDb = await new Promise((res, rej) => { const d = new sqlite3.Database(COLD_PATH, e => e ? rej(e) : res(d)); });
    await run(`PRAGMA journal_mode=OFF`).catch(() => {});
    await run(`PRAGMA synchronous=OFF`).catch(() => {});
    lifecycle = freshLifecycle();
    lifecycle.setDB(coldDb);
    await lifecycle.initSchema();
    await lifecycle.setSyncState('activity_backfill_complete', '1');
    await run(`CREATE TABLE IF NOT EXISTS cold_months (month TEXT PRIMARY KEY, loaded_at INTEGER, tickets INTEGER, acts INTEGER)`);
    // Small lookup tables the report code reads (agent names by Zoho id, staff teams), copied from the volume.
    for (const t of ['desk_agents', 'staff_directory']) {
      const rows = await deps.hotAll(`SELECT * FROM ${t}`).catch(() => []);
      for (const r of rows) {
        const k = Object.keys(r);
        await run(`INSERT OR REPLACE INTO ${t} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, k.map(x => r[x])).catch(() => {});
      }
    }
  })().catch(e => { initP = null; throw e; });
  return initP;
}

async function reset() {
  try { if (coldDb) await new Promise(r => coldDb.close(() => r())); } catch (e) {}
  coldDb = null; lifecycle = null; initP = null; loading.clear();
  await init();
}

function monthsBetween(fromIso, toIso) {
  const out = [];
  const a = new Date(fromIso), b = new Date(toIso);
  if (isNaN(a) || isNaN(b)) return out;
  let y = a.getUTCFullYear(), m = a.getUTCMonth();
  for (let i = 0; i < 120; i++) {
    const start = new Date(Date.UTC(y, m, 1));
    if (start >= b) break;
    out.push(start.toISOString().slice(0, 7));
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";

async function loadMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const A = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const B = new Date(Date.UTC(y, m, 1)).toISOString();
  const { emails, agentNames } = await deps.roster();
  const em = (emails || []).map(e => String(e).toLowerCase()).filter(e => e.endsWith('@adit.com'));
  const emList = em.length ? em.map(q).join(',') : "''";
  const names = Object.values(agentNames || {}).filter(Boolean).map(n => q('%Owner changed to ' + String(n).replace(/[%_]/g, '') + '%'));
  const cols = deps.aditkb.SELECT_COLUMNS.map(c => 't.' + c).join(', ');
  const ownerClause = names.length
    ? ` OR (t.created_time < ${q(A)} AND t.created_time >= ${q(new Date(Date.parse(A) - 183 * 86400000).toISOString())} AND t.modified_time >= ${q(A)} AND t.cf_owner_change_log ILIKE ANY (ARRAY[${names.join(',')}]))`
    : '';
  const ticketSql = `WITH acts AS (
      SELECT ticket_id FROM desk_ticket_threads WHERE created_time >= ${q(A)} AND created_time < ${q(B)} AND direction = 'out' AND lower(author_email) IN (${emList})
      UNION SELECT ticket_id FROM desk_ticket_comments WHERE created_time >= ${q(A)} AND created_time < ${q(B)} AND lower(author_email) IN (${emList}))
    SELECT ${cols} FROM desk_tickets t
    WHERE (t.created_time >= ${q(A)} AND t.created_time < ${q(B)}) OR t.id IN (SELECT ticket_id FROM acts)${ownerClause}`;
  const tk = await deps.aditkb.query(ticketSql);
  const isoZ = v => { const t = Date.parse(v); return v == null || Number.isNaN(t) ? v : new Date(t).toISOString(); };
  for (const row of tk.rows) {
    for (const k of ['created_time', 'closed_time', 'modified_time', 'j_onhold_time', 'due_date']) if (row[k] != null) row[k] = isoZ(row[k]);
    await deps.upsertRow(row, lifecycle);
  }
  const allowed = new Set(em);
  let acts = 0;
  const th = await deps.aditkb.query(`SELECT ticket_id, thread_index, author_email, direction, created_time FROM desk_ticket_threads
    WHERE created_time >= ${q(A)} AND created_time < ${q(B)} AND direction = 'out' AND lower(author_email) IN (${emList})`);
  acts += await lifecycle.upsertTicketActivityRows('thread', th.rows, allowed);
  const cm = await deps.aditkb.query(`SELECT ticket_id, comment_index, author_email, created_time FROM desk_ticket_comments
    WHERE created_time >= ${q(A)} AND created_time < ${q(B)} AND lower(author_email) IN (${emList})`);
  acts += await lifecycle.upsertTicketActivityRows('comment', cm.rows, allowed);
  // CSAT rows live on the volume for all time; copy the ones for this month's tickets.
  const ids = tk.rows.map(r => String(r.id));
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const sv = await deps.hotAll(`SELECT * FROM desk_ticket_survey WHERE ticket_id IN (${part.map(() => '?').join(',')})`, part).catch(() => []);
    for (const r of sv) {
      const k = Object.keys(r);
      await run(`INSERT OR REPLACE INTO desk_ticket_survey (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, k.map(x => r[x]));
    }
  }
  await run(`INSERT OR REPLACE INTO cold_months (month, loaded_at, tickets, acts) VALUES (?,?,?,?)`, [month, Date.now(), tk.rows.length, acts]);
  if (tk.truncated || th.truncated || cm.truncated) console.warn('🧊 cold month ' + month + ' hit the 50,000 row cap');
  console.log(`🧊 Cold store: ${month} loaded (${tk.rows.length} tickets, ${acts} activity rows)`);
}

async function ensureMonth(month) {
  const row = await get(`SELECT loaded_at FROM cold_months WHERE month = ?`, [month]);
  const [y, m] = month.split('-').map(Number);
  const monthEnd = Date.UTC(y, m, 1);
  const ttl = Date.now() - monthEnd > 120 * 86400000 ? 24 * 3600000 : 30 * 60000;
  if (row && Date.now() - row.loaded_at < ttl) return;
  if (!loading.has(month)) loading.set(month, loadMonth(month).finally(() => loading.delete(month)));
  return loading.get(month);
}

async function sizeMB() { try { return fs.statSync(COLD_PATH).size / 1048576; } catch (e) { return 0; } }

/** Which desk-lifecycle instance should answer a request starting at `from`. */
async function forRange(from, to) {
  const floor = (deps && deps.hotFloor && await deps.hotFloor().catch(() => null)) || DEFAULT_HOT_FLOOR;
  const fromIso = new Date(from).toISOString();
  if (!deps || !deps.aditkb || !deps.aditkb.isConfigured() || isNaN(Date.parse(from)) || fromIso >= floor) return null;
  await init();
  if (await sizeMB() > COLD_MAX_MB) await reset();
  const toIso = to && !isNaN(Date.parse(to)) ? new Date(to).toISOString() : new Date().toISOString();
  // Load the month before the range too, so tickets created just before it carry their details.
  const f = new Date(fromIso);
  const months = monthsBetween(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1)).toISOString(), toIso);
  for (let i = 0; i < months.length; i += 3) await Promise.all(months.slice(i, i + 3).map(ensureMonth));
  return lifecycle;
}

/** desk-lifecycle instance for a range: the cold copy for ranges older than the volume holds, otherwise `hot`. */
async function pick(hot, from, to) {
  try { return (await forRange(from, to)) || hot; }
  catch (e) { console.warn('🧊 cold store unavailable, using recent data only:', e.message); return hot; }
}

async function status() {
  if (!coldDb) return { ready: false, path: COLD_PATH };
  const months = await new Promise(r => coldDb.all(`SELECT month, loaded_at, tickets, acts FROM cold_months ORDER BY month`, [], (e, x) => r(x || [])));
  return { ready: true, path: COLD_PATH, sizeMB: Math.round(await sizeMB()), months };
}

/** Copies specific tickets (by Zoho id or ticket number) from AditKB onto the volume, with the monitored agents' replies and
 *  comments on them. Used for tickets someone reviews or audits, so those keep working whatever their age; only a handful. */
async function pinTickets({ ids = [], numbers = [] } = {}) {
  if (!deps || !deps.hot || !deps.aditkb || !deps.aditkb.isConfigured()) return 0;
  const idL = [...new Set(ids.map(x => String(x).replace(/[^0-9]/g, '')).filter(Boolean))];
  const numL = [...new Set(numbers.map(x => String(x).replace(/[^0-9]/g, '')).filter(Boolean))];
  if (!idL.length && !numL.length) return 0;
  const conds = [];
  if (idL.length) conds.push(`t.id IN (${idL.map(q).join(',')})`);
  if (numL.length) conds.push(`t.ticket_number IN (${numL.map(q).join(',')})`);
  const cols = deps.aditkb.SELECT_COLUMNS.map(c => 't.' + c).join(', ');
  const tk = await deps.aditkb.query(`SELECT ${cols} FROM desk_tickets t WHERE ${conds.join(' OR ')}`);
  for (const row of tk.rows) await deps.upsertRow(row, deps.hot);
  const tids = tk.rows.map(r => String(r.id));
  if (tids.length) {
    const { emails } = await deps.roster();
    const allowed = new Set((emails || []).map(e => String(e).toLowerCase()));
    const inList = tids.map(q).join(',');
    const th = await deps.aditkb.query(`SELECT ticket_id, thread_index, author_email, direction, created_time FROM desk_ticket_threads WHERE ticket_id IN (${inList}) AND direction = 'out'`);
    await deps.hot.upsertTicketActivityRows('thread', th.rows, allowed);
    const cm = await deps.aditkb.query(`SELECT ticket_id, comment_index, author_email, created_time FROM desk_ticket_comments WHERE ticket_id IN (${inList})`);
    await deps.hot.upsertTicketActivityRows('comment', cm.rows, allowed);
  }
  return tk.rows.length;
}

/** Puts back onto the volume every ticket that has a transfer review or an audit but lost its copy in the 9 Oct 2026 trim. */
async function restorePinned() {
  const missing = await deps.hotAll(`SELECT DISTINCT ticket_id FROM (SELECT ticket_id FROM audit_tickets UNION SELECT ticket_id FROM tr_reviews)
    WHERE ticket_id IS NOT NULL AND ticket_id NOT IN (SELECT ticket_id FROM desk_ticket_snapshot)`).catch(() => []);
  let n = 0;
  for (let i = 0; i < missing.length; i += 300) n += await pinTickets({ ids: missing.slice(i, i + 300).map(r => r.ticket_id) });
  return { missing: missing.length, restored: n };
}

module.exports = { configure, pick, forRange, status, pinTickets, restorePinned, monthsBetween, DEFAULT_HOT_FLOOR };
