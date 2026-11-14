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
 *      removed from the volume (archive-service).
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
  out.cache = await trimCache(CACHE_CAP_MB); // Batch 342.1: the same cap when high (a smaller cache only means more Desk re-reads and slower ticket loads)
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
// ── Batch 345: compaction on a full, fixed-size volume ──────────────────
// The volume cannot grow (500 MB is the company limit) and a normal VACUUM needs free disk about the size of the
// compacted file. So: first a full backup copy is written to the container's own disk (not the volume) and can be
// downloaded from Settings > Storage. Then the VACUUM builds its new copy on the container's disk (temp_store=FILE) and
// keeps its undo journal in memory, so it needs almost no free space on the volume. It runs only with a backup made in
// the last 6 hours and enough free memory, outside work hours unless an admin starts it.
const os = require('os'), fs = require('fs'), path = require('path');
let _backup = null; // { path, at, mb }
function tmpFreeMB(dir) { try { const st = fs.statfsSync(dir); return Math.round(st.bavail * st.bsize / 1048576); } catch (e) { return 0; } }
async function backup({ volumeUsage } = {}) {
  if (!_db) throw new Error('no database');
  const dir = os.tmpdir(), v = await usage(volumeUsage);
  const liveMB = v ? Math.max(1, v.dbMB - v.reclaimMB) : 400;
  if (tmpFreeMB(dir) < liveMB * 1.3 + 50) throw new Error(`Not enough space on the container disk for a backup (${tmpFreeMB(dir)} MB free)`);
  const file = path.join(dir, 'rc-backup-' + Date.now() + '.db');
  if (_backup && _backup.path) { try { fs.unlinkSync(_backup.path); } catch (e) { /* gone */ } }
  const t0 = Date.now();
  await run(`VACUUM INTO ?`, [file]);
  const chk = await new Promise((res) => { const sqlite3 = require('sqlite3'); const b = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (e) => { if (e) return res('open failed'); b.get(`PRAGMA quick_check`, (e2, r) => { b.close(); res(e2 ? 'check failed' : Object.values(r || {})[0]); }); }); });
  if (chk !== 'ok') { try { fs.unlinkSync(file); } catch (e) { /* */ } throw new Error('The backup copy failed its check: ' + chk); }
  _backup = { path: file, at: Date.now(), mb: Math.round(fs.statSync(file).size / 1048576), ms: Date.now() - t0 };
  return Object.assign({}, _backup, { path: undefined });
}
/** Backup copy, then upload to the Google Drive folder set in Settings > Storage. */
async function backupToDrive({ volumeUsage } = {}) {
  const A = require('../archive-service');
  const folderId = await A.getSetting('backup_folder_id'), asUser = await A.getSetting('backup_as');
  if (!folderId) throw new Error('Set the Drive backup folder in Settings > Storage first');
  const info = await backup({ volumeUsage });
  const d = await require('./drive-backup').upload(_backup.path, { folderId, asUser });
  _backup.drive = d;
  return Object.assign(info, { drive: d });
}
// Batch 345.1: when the server cannot upload to Drive itself (the Drive API is off for the service account), an admin
// makes a one-time link (15 minutes, single use) to the gzipped backup, it is saved to Drive from there, and the saved
// Drive link is confirmed here so the compaction can go ahead.
const crypto = require('crypto');
const _links = new Map(); // token -> { file, until }
async function backupLink({ volumeUsage } = {}) {
  if (!_backup || Date.now() - _backup.at > 6 * 3600e3 || !fs.existsSync(_backup.path)) await backup({ volumeUsage });
  const gz = _backup.path + '.gz';
  if (!fs.existsSync(gz)) await new Promise((res, rej) => fs.createReadStream(_backup.path).pipe(require('zlib').createGzip({ level: 6 })).pipe(fs.createWriteStream(gz)).on('finish', res).on('error', rej));
  const token = crypto.randomBytes(24).toString('hex');
  _links.set(token, { file: gz, until: Date.now() + 15 * 60000 });
  return { token, mb: Math.round(fs.statSync(gz).size / 1048576), expiresMin: 15 };
}
function takeLink(token) { const l = _links.get(String(token || '')); _links.delete(String(token || '')); return l && l.until > Date.now() && fs.existsSync(l.file) ? l.file : null; }
function confirmDrive(link, mb) { if (!_backup) throw new Error('No backup to confirm'); if (!/^https:\/\/drive\.google\.com\//.test(String(link || ''))) throw new Error('Give the Drive link of the saved backup'); _backup.drive = { link: String(link), mb: Number(mb) || _backup.mb, by: 'link' }; return backupInfo(); }
function backupInfo() { return _backup && fs.existsSync(_backup.path) ? { at: new Date(_backup.at).toISOString(), mb: _backup.mb, drive: _backup.drive || null } : null; }
function backupPath() { return _backup && fs.existsSync(_backup.path) ? _backup.path : null; }

/** Shrinks the file (VACUUM) outside work hours (or when an admin starts it). */
async function compact({ volumeUsage, force = false } = {}) {
  if (!_db) return { skipped: 'no database' };
  if (!force && workHours()) return { skipped: 'work hours' };
  const v = await usage(volumeUsage); if (!v) return { skipped: 'no usage' };
  const liveMB = Math.max(0, v.dbMB - v.reclaimMB);
  const needMB = Math.round(liveMB * 1.1 + 20);
  if (v.reclaimMB < 20) return { skipped: 'nothing to reclaim', reclaimMB: v.reclaimMB };
  const lowDisk = v.freeMB < needMB;
  if (lowDisk) {
    if (!_backup || Date.now() - _backup.at > 6 * 3600e3 || !fs.existsSync(_backup.path) || (!_backup.drive && !process.env.VITEST)) return { skipped: 'needs a backup', note: 'The volume is too full for a normal compaction. Save a backup to Google Drive first (Settings > Storage), then compact.' };
    const freeRam = Math.round(os.freemem() / 1048576);
    if (freeRam < liveMB * 1.5 + 200) return { skipped: 'not enough memory', note: `A low-disk compaction keeps its undo journal in memory and needs about ${Math.round(liveMB * 1.5 + 200)} MB free memory; ${freeRam} MB free.` };
    if (tmpFreeMB(os.tmpdir()) < liveMB * 1.3 + 50) return { skipped: 'not enough container disk' };
  }
  const t0 = Date.now();
  let wal = false;
  try { const jm = await get(`PRAGMA journal_mode`); wal = /wal/i.test(String(Object.values(jm || {})[0])); } catch (e) { /* */ }
  try { await run(`PRAGMA wal_checkpoint(TRUNCATE)`); } catch (e) { /* */ }
  if (lowDisk) { await run(`PRAGMA temp_store=FILE`).catch(() => {}); await run(`PRAGMA journal_mode=MEMORY`).catch(() => {}); }
  else if (wal) await run(`PRAGMA journal_mode=DELETE`).catch(() => {});
  try { await run(`VACUUM`); }
  finally {
    if (wal) await run(`PRAGMA journal_mode=WAL`).catch(() => {}); else if (lowDisk) await run(`PRAGMA journal_mode=DELETE`).catch(() => {});
    if (lowDisk) await run(`PRAGMA temp_store=MEMORY`).catch(() => {});
  }
  let ok = 'unknown'; try { ok = Object.values(await get(`PRAGMA quick_check`) || {})[0]; } catch (e) { ok = 'check failed'; }
  const a = await usage(volumeUsage);
  return { compacted: true, lowDisk, check: ok, ms: Date.now() - t0, before: { pct: v.pct, dbMB: v.dbMB }, after: a && { pct: a.pct, dbMB: a.dbMB } };
}

async function status({ volumeUsage, tableSizes } = {}) {
  const v = await usage(volumeUsage);
  let biggest = []; try { biggest = tableSizes ? await tableSizes(10) : []; } catch (e) { /* */ }
  let backupFolder = ''; try { backupFolder = await require('../archive-service').getSetting('backup_folder_id'); } catch (e) { /* */ }
  return { backupFolder, backup: backupInfo(), memFreeMB: Math.round(os.freemem() / 1048576), tmpFreeMB: tmpFreeMB(os.tmpdir()), band: { low: LOW_PCT, high: HIGH_PCT }, volume: v, cache: await cacheMB(), cacheCapMB: CACHE_CAP_MB, biggest, last: lastRun };
}

module.exports = { setDB, guard, trimCache, clearVectors, compact, backup, backupToDrive, backupLink, takeLink, confirmDrive, backupInfo, backupPath, status, workHours, LOW_PCT, HIGH_PCT };
