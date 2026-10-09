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
 * Nothing else is touched. Runs only when the volume is at or above TRIGGER_PCT.
 */
const TRIGGER_PCT = 95;
const TARGET_MB = 60;

function promisify(db) {
  return {
    run: (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this.changes || 0); })),
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
  } catch (e) { out.error = e.message; }
  try { out.freeMB = Math.round(await freeMB(q)); } catch (e) {}
  try { await q.get(`PRAGMA journal_mode=${/^(delete|wal|truncate|persist)$/i.test(mode || '') ? mode : 'DELETE'}`); } catch (e) {}
  return out;
}

module.exports = { freeSpace, TRIGGER_PCT, TARGET_MB };
