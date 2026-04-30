/**
 * archive-service.js
 * Automatically archives old DB data to Google Sheets when volume hits 90%,
 * then deletes those rows from SQLite to reclaim space.
 *
 * Env vars required:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — full JSON string of the service account key
 *   ARCHIVE_SHEET_ID            — Google Spreadsheet ID to archive into
 *   VOLUME_SIZE_MB              — total volume size in MB (default 500)
 */

const { google } = require('googleapis');
const path = require('path');
const fs   = require('fs');
const sqlite3 = require('sqlite3').verbose();

const SHEET_ID      = process.env.ARCHIVE_SHEET_ID || '';
const VOLUME_SIZE   = parseInt(process.env.VOLUME_SIZE_MB || '500', 10);
const THRESHOLD_PCT = 0.90; // archive when usage > 90%
const DB_PATH       = process.env.DB_PATH || path.join(__dirname, 'productivity.db');

// ── Sheets auth ─────────────────────────────────────────────────────────────
function getSheetsClient() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set');
  let key;
  try { key = JSON.parse(keyRaw); } catch(e) { throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON'); }
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── DB helpers ───────────────────────────────────────────────────────────────
function openDb() {
  return new Promise((res, rej) => {
    const db = new sqlite3.Database(DB_PATH, err => err ? rej(err) : res(db));
  });
}
function dbAll(db, sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
}
function dbRun(db, sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res(this); }));
}

// ── Disk usage check ─────────────────────────────────────────────────────────
async function getDbSizeMB() {
  try {
    const db = await openDb();
    const pageSize  = await new Promise(r => db.get('PRAGMA page_size',  [], (e,v) => r(v)));
    const pageCount = await new Promise(r => db.get('PRAGMA page_count', [], (e,v) => r(v)));
    db.close();
    return (pageSize.page_size * pageCount.page_count) / (1024 * 1024);
  } catch(e) {
    // Fallback: check file size
    try { return fs.statSync(DB_PATH).size / (1024 * 1024); } catch { return 0; }
  }
}

async function isAboveThreshold() {
  const usedMB = await getDbSizeMB();
  const pct    = usedMB / VOLUME_SIZE;
  console.log(`📊 DB usage: ${usedMB.toFixed(1)}MB / ${VOLUME_SIZE}MB (${(pct*100).toFixed(1)}%)`);
  return pct >= THRESHOLD_PCT;
}

// ── Ensure sheet tabs exist ──────────────────────────────────────────────────
const TABS = [
  { name: 'Presence Events',  headers: ['Agent ID','Status','Timestamp','Queue Status'] },
  { name: 'Break Events',     headers: ['ID','Username','Email','Role','Action','Action Label','Note','Created At','Notified','Notify Status'] },
  { name: 'Call Logs',        headers: ['Agent ID','Agent Name','Call ID','Direction','Result','Duration (s)','Ring Duration (s)','Hold Duration (s)','From Number','To Number','Queue Name','Start Time'] },
  { name: 'Login Logs',       headers: ['ID','Username','Email','Role','IP','Location','System Info','Logged In At'] },
];

async function ensureTabs(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = new Set(meta.data.sheets.map(s => s.properties.title));
  const toAdd = TABS.filter(t => !existing.has(t.name));
  if (!toAdd.length) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: toAdd.map(t => ({ addSheet: { properties: { title: t.name } } }))
    }
  });

  // Write headers for new tabs
  for (const tab of toAdd) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tab.name}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [tab.headers] },
    });
  }
}

// ── Append rows to a sheet tab ───────────────────────────────────────────────
async function appendRows(sheets, tabName, rows) {
  if (!rows.length) return 0;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
  return rows.length;
}

// ── Archive each table ───────────────────────────────────────────────────────
async function archivePresenceEvents(db, sheets, cutoffDays = 14) {
  const rows = await dbAll(db,
    `SELECT agent_id, status, timestamp, queue_status FROM presence_events
     WHERE datetime(timestamp) < datetime('now',?) ORDER BY timestamp ASC`,
    [`-${cutoffDays} days`]
  );
  if (!rows.length) return 0;
  const data = rows.map(r => [r.agent_id, r.status, r.timestamp, r.queue_status || '']);
  const count = await appendRows(sheets, 'Presence Events', data);
  await dbRun(db, `DELETE FROM presence_events WHERE datetime(timestamp) < datetime('now',?)`, [`-${cutoffDays} days`]);
  return count;
}

async function archiveBreakEvents(db, sheets, cutoffDays = 60) {
  const rows = await dbAll(db,
    `SELECT id, username, email, role, action, action_label, note, created_at, notified, notify_status
     FROM break_events WHERE datetime(created_at) < datetime('now',?) ORDER BY created_at ASC`,
    [`-${cutoffDays} days`]
  );
  if (!rows.length) return 0;
  const data = rows.map(r => [r.id, r.username, r.email, r.role, r.action, r.action_label||'', r.note||'', r.created_at, r.notified||0, r.notify_status||'']);
  const count = await appendRows(sheets, 'Break Events', data);
  await dbRun(db, `DELETE FROM break_events WHERE datetime(created_at) < datetime('now',?)`, [`-${cutoffDays} days`]);
  return count;
}

async function archiveCallLogs(db, sheets, cutoffDays = 7) {
  const rows = await dbAll(db,
    `SELECT agent_id, agent_name, call_id, direction, result, duration, ring_duration, hold_duration,
            from_number, to_number, queue_name, start_time
     FROM call_logs WHERE date(start_time) < date('now',?) ORDER BY start_time ASC`,
    [`-${cutoffDays} days`]
  );
  if (!rows.length) return 0;
  const data = rows.map(r => [r.agent_id, r.agent_name||'', r.call_id||'', r.direction||'', r.result||'', r.duration||0, r.ring_duration||0, r.hold_duration||0, r.from_number||'', r.to_number||'', r.queue_name||'', r.start_time||'']);
  const count = await appendRows(sheets, 'Call Logs', data);
  await dbRun(db, `DELETE FROM call_logs WHERE date(start_time) < date('now',?)`, [`-${cutoffDays} days`]);
  return count;
}

async function archiveLoginLogs(db, sheets, cutoffDays = 30) {
  const rows = await dbAll(db,
    `SELECT id, username, email, role, ip, location, system_info, logged_in_at
     FROM login_logs WHERE datetime(logged_in_at) < datetime('now',?) ORDER BY logged_in_at ASC`,
    [`-${cutoffDays} days`]
  );
  if (!rows.length) return 0;
  const data = rows.map(r => [r.id, r.username||'', r.email||'', r.role||'', r.ip||'', r.location||'', (r.system_info||'').substring(0,200), r.logged_in_at||'']);
  const count = await appendRows(sheets, 'Login Logs', data);
  await dbRun(db, `DELETE FROM login_logs WHERE datetime(logged_in_at) < datetime('now',?)`, [`-${cutoffDays} days`]);
  return count;
}

// ── Main archive function ────────────────────────────────────────────────────
async function runArchive(force = false) {
  if (!SHEET_ID) {
    console.log('⚠️  ARCHIVE_SHEET_ID not set — skipping archive');
    return null;
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.log('⚠️  GOOGLE_SERVICE_ACCOUNT_KEY not set — skipping archive');
    return null;
  }

  const above = force || await isAboveThreshold();
  if (!above) {
    console.log('✅ Volume below 90% — no archive needed');
    return null;
  }

  console.log('📤 Volume above 90% — starting archive to Google Sheets...');

  const sheets = getSheetsClient();
  await ensureTabs(sheets);

  const db = await openDb();
  const results = {};
  try {
    results.presence_events = await archivePresenceEvents(db, sheets, 14);
    results.break_events    = await archiveBreakEvents(db, sheets, 60);
    results.call_logs       = await archiveCallLogs(db, sheets, 7);
    results.login_logs      = await archiveLoginLogs(db, sheets, 30);

    // VACUUM after mass delete
    await dbRun(db, 'VACUUM');
    results.vacuumed = true;

    const total = Object.values(results).filter(v => typeof v === 'number').reduce((s,v) => s+v, 0);
    console.log(`✅ Archive complete — ${total} rows archived to Google Sheets:`, results);
  } catch(e) {
    console.error('❌ Archive error:', e.message);
    results.error = e.message;
  } finally {
    db.close();
  }
  return results;
}

module.exports = { runArchive, isAboveThreshold, getDbSizeMB };
