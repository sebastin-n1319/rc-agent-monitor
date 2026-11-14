'use strict';
/**
 * Batch 342: storage guard. Keeps the Railway volume in a 50 to 60 percent band instead of drifting to the 90s.
 * Every 2 hours (with the existing prune):
 *   1. Meaning-search vectors (expert_vec) are emptied while meaning search is off (EXPERT_HYBRID is not on). They are
 *      rebuilt on demand if it is turned back on.
 *   2. The ticket-read cache (expert_cache) keeps raw Desk thread and note copies 14 days (they are fetched again when
 *      needed) and the AI-read screenshots and files 60 days (they cost AI to make), and is held under CACHE_CAP_MB,
 *      oldest raw copies first.
 *   3. Above the band (live use over HIGH_PCT) the older logs are copied to the archive Google Sheet first and then
 *      removed from the volume (archive-service), and the cache cap is halved.
 * Deleted rows become free pages that SQLite reuses, so the file stops growing at once. The file itself only shrinks
 * with a compaction (VACUUM), which needs free disk about the size of the compacted database; compact() runs it only
 * when that space exists and outside work hours, and otherwise says how much space it needs.
 * Nothing here deletes data that is not rebuilt on demand or already copied to the archive sheet.
 */
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this.changes || 0); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const LOW_PCT = Number(process.env.STORAGE_LOW_PCT || 50), HIGH_PCT = Number(process.env.STORAGE_HIGH_PCT || 60);
const CACHE_CAP_MB = Number(process.env.CACHE_CAP_MB || 30);
const day = 864e5;
const lastRun = { at: null, result: null };

async function cacheMB() { const r = await get(`SELECT COALESCE(SUM(LENGTH(v)),0) AS b, COUNT(*) AS n FROM expert_cache`).catch(() => null); return r ? { mb: r.b / 1048576, rows: r.n } : { mb: 0, rows: 0 }; }

async function trimCache(capMB = CACHE_CAP_MB) {
  const out = { raw: 0, ai: 0, cap: 0 };
  const now = Date.now();
  // raw Desk copies (threads, notes, earlier tickets) are fetched again when needed
  out.raw = await run(`DELETE FROM expert_cache WHERE at < ? AND (k LIKE 'th:%' OR k LIKE 'cm:%' OR k LIKE 'prior:%')`, [now - 14 * day]).catch(() => 0);
  // what the AI read from screenshots and files cost AI to make: kept longer
  out.ai = await run(`DELETE FROM expert_cache WHERE at < ?`, [now - 60 * day]).catch(() => 0);
  // and the whole cache stays under the cap, oldest raw copies first, then the oldest of anything
  for (let i = 0; i < 40; i++) {
    const c = await cacheMB(); if (c.mb <= capMB) break;
    let n = await run(`DELETE FROM expert_cache WHERE k IN (SELECT k FROM expert_cache WHERE k LIKE 'th:%' OR k LIKE 'cm:%' OR k LIKE 'prior:%' ORDER BY at LIMIT 400)`).catch(() => 0);
    if (!n) n = await run(`DELETE FROM expert_cache WHERE k IN (SELECT k FROM expert_cache ORDER BY at LIMIT 400)`).catch(() => 0);
    if (!n) break; out.cap += n;
  }
  return out;
}

async function clearVectors() {
  const on = String(process.env.EXPERT_HYBRID || 'off').toLowerCase() === 'on';
  if (on) return 0;
  return run(`DELETE FROM expert_vec`).catch(() => 0);
}

async function usage(vu) { try { return await vu(); } catch (e) { return null; } }

/** One pass of the guard. vu = database.volumeUsage, archive = archive-service.runArchive. */
async function guard({ volumeUsage, archive, forceArchive = false } = {}) {
  if (!_db) return { skipped: true };
  const before = await usage(volumeUsage);
  const out = { before: before && { pct: before.pct, livePct: before.livePct, usedMB: before.usedMB, totalMB: before.totalMB } };
  out.vectors = await clearVectors();
  const high = before && before.livePct > HIGH_PCT;
  out.cache = await trimCache(high ? Math.round(CACHE_CAP_MB / 2) : CACHE_CAP_MB);
  if (archive && (high || forceArchive)) { try { out.archive = await archive(true); } catch (e) { out.archive = { error: e.message }; } }
  const after = await usage(volumeUsage);
  out.after = after && { pct: after.pct, livePct: after.livePct, reclaimMB: after.reclaimMB };
  lastRun.at = new Date().toISOString(); lastRun.result = out;
  return out;
}

function workHours(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(d));
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(d);
  return !['Sat', 'Sun'].includes(wd) && h >= 7 && h < 19;
}
/** Shrinks the file (VACUUM) when there is room for it and it is outside work hours (or forced by an admin). */
async function compact({ volumeUsage, force = false } = {}) {
  if (!_db) return { skipped: 'no database' };
  if (!force && workHours()) return { skipped: 'work hours' };
  const v = await usage(volumeUsage); if (!v) return { skipped: 'no usage' };
  const liveMB = Math.max(0, v.dbMB - v.reclaimMB);
  const needMB = Math.round(liveMB * 1.1 + 20);
  if (v.reclaimMB < 20) return { skipped: 'nothing to reclaim', reclaimMB: v.reclaimMB };
  if (v.freeMB < needMB) return { skipped: 'not enough free disk', freeMB: v.freeMB, needMB, note: `A compaction needs about ${needMB} MB free; the volume has ${v.freeMB} MB. Grow the volume once, or wait.` };
  const t0 = Date.now();
  let wal = false;
  try { const jm = await get(`PRAGMA journal_mode`); wal = /wal/i.test(String(Object.values(jm || {})[0])); } catch (e) { /* */ }
  try { await run(`PRAGMA wal_checkpoint(TRUNCATE)`); } catch (e) { /* */ }
  if (wal) await run(`PRAGMA journal_mode=DELETE`).catch(() => {});
  try { await run(`VACUUM`); } finally { if (wal) await run(`PRAGMA journal_mode=WAL`).catch(() => {}); }
  const a = await usage(volumeUsage);
  return { compacted: true, ms: Date.now() - t0, before: { pct: v.pct, dbMB: v.dbMB }, after: a && { pct: a.pct, dbMB: a.dbMB } };
}

async function status({ volumeUsage, tableSizes } = {}) {
  const v = await usage(volumeUsage);
  let biggest = []; try { biggest = tableSizes ? await tableSizes(10) : []; } catch (e) { /* */ }
  return { band: { low: LOW_PCT, high: HIGH_PCT }, volume: v, cache: await cacheMB(), cacheCapMB: CACHE_CAP_MB, biggest, last: lastRun };
}

module.exports = { setDB, guard, trimCache, clearVectors, compact, status, workHours, LOW_PCT, HIGH_PCT };
