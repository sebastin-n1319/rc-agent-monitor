/**
 * Emergency space (Batch 148).
 * When the volume is almost full SQLite cannot write even the small journal a DELETE needs, so every write fails
 * (SQLITE_FULL), sessions cannot be saved and nobody can sign in. At start-up, before anything else writes, this keeps the
 * journal in memory (it then needs no free disk), deletes data that is rebuilt on demand or already past its keep time, in
 * small batches, and puts the journal back. The file itself does not shrink: the deleted pages become free pages inside it
 * and later writes reuse them, which is what lets the app work again.
 *
 * What it removes, in this order, only until about TARGET_MB of pages are free:
 *   1. assess_audio (cached read-aloud audio, regenerated on the next play)
 *   2. desk_ticket_events (legacy event cache, read by nothing)
 *   3. assess_snapshots camera photos older than 7 days, oldest first
 *   4. ticket copies (desk_ticket_snapshot + desk_ticket_agents + desk_ticket_activity + desk_history_state) created more than
 *      TICKET_KEEP_DAYS ago, oldest first. They are a mirror of AditKB, which keeps the originals.
 * Nothing else is touched. Runs only when the volume is at or above TRIGGER_PCT.
 */
const TRIGGER_PCT = 95;
const TARGET_MB = 60;
const TICKET_KEEP_DAYS = 90;

function promisify(db) {
  return {
    run: (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.changes || 0); })),
    all: (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r))),
    get: (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))),
  };
}

async function freeMB(q) {
  const fl = await q.get(`PRAGMA freelist_count`), ps = await q.get(`PRAGMA page_size`);
  return (Object.values(fl || { n: 0 })[0] * Object.values(ps || { n: 4096 })[0]) / 1048576;
}

async function batchDelete(q, sql, params, stopWhen) {
  let total = 0;
  for (let i = 0; i < 20000; i++) {
    let n;
    try { n = await q.run(sql, params); } catch (e) { if (/no such table/i.test(e.message)) return total; throw e; }
    total += n;
    if (!n) break;
    if (i % 10 === 9 && stopWhen && await stopWhen()) break;
  }
  return total;
}

/** Delete ticket mirror rows older than keepDays (by created_time), oldest first, 300 tickets per round. */
async function pruneTickets(q, keepDays, stopWhen) {
  const cut = new Date(Date.now() - keepDays * 86400000).toISOString();
  const ids = `SELECT ticket_id FROM desk_ticket_snapshot WHERE created_time < ? ORDER BY created_time LIMIT 300`;
  let tickets = 0;
  for (let i = 0; i < 20000; i++) {
    let rows;
    try {
      const picked = await new Promise((res, rej) => q.all(ids, [cut]).then(res, rej));
      rows = picked.map(r => r.ticket_id);
    } catch (e) { if (/no such table/i.test(e.message)) return tickets; throw e; }
    if (!rows.length) break;
    const ph = rows.map(() => '?').join(',');
    for (const t of ['desk_ticket_agents', 'desk_ticket_activity', 'desk_history_state', 'desk_ticket_survey']) {
      try { await q.run(`DELETE FROM ${t} WHERE ticket_id IN (${ph})`, rows); } catch (e) { if (!/no such (table|column)/i.test(e.message)) throw e; }
    }
    await q.run(`DELETE FROM desk_ticket_snapshot WHERE ticket_id IN (${ph})`, rows);
    tickets += rows.length;
    if (stopWhen && await stopWhen()) break;
  }
  return tickets;
}

async function freeSpace(db, volumeUsage) {
  const out = { ran: false };
  const q = promisify(db);
  let v;
  try { v = await volumeUsage(); } catch (e) { return { ran: false, error: 'usage: ' + e.message }; }
  out.pctBefore = v.pct;
  if (v.pct < TRIGGER_PCT) return out;
  out.ran = true;
  let mode = null;
  try { const m = await q.get(`PRAGMA journal_mode`); mode = m && Object.values(m)[0]; } catch (e) {}
  out.modeBefore = mode;
  const enough = async () => (await freeMB(q)) >= TARGET_MB;
  out.freeBefore = Math.round(await freeMB(q).catch(() => 0));
  if (out.freeBefore >= TARGET_MB) { out.ran = false; out.note = 'already has free pages inside the file'; return out; }
  try { await q.get(`PRAGMA journal_mode=MEMORY`); } catch (e) { out.modeError = e.message; }
  const cut7 = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  try {
    out.audio = await batchDelete(q, `DELETE FROM assess_audio WHERE rowid IN (SELECT rowid FROM assess_audio LIMIT 20)`, [], enough);
    if (!(await enough())) out.events = await batchDelete(q, `DELETE FROM desk_ticket_events WHERE id IN (SELECT id FROM desk_ticket_events LIMIT 500)`, [], enough);
    if (!(await enough())) out.photos = await batchDelete(q, `DELETE FROM assess_snapshots WHERE id IN (SELECT id FROM assess_snapshots WHERE at < ? ORDER BY at LIMIT 20)`, [cut7], enough);
    if (!(await enough())) out.tickets = await pruneTickets(q, TICKET_KEEP_DAYS, enough);
  } catch (e) { out.error = e.message; }
  try { out.freeMB = Math.round(await freeMB(q)); } catch (e) {}
  try { await q.get(`PRAGMA journal_mode=${/^(delete|wal|truncate|persist)$/i.test(mode || '') ? mode : 'DELETE'}`); } catch (e) {}
  return out;
}

module.exports = { freeSpace, pruneTickets, TICKET_KEEP_DAYS, TRIGGER_PCT, TARGET_MB };
