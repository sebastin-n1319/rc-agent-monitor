'use strict';
/**
 * Batch 292: every Adit Expert question, kept in a Google Sheet for history and review.
 * Every 10 minutes, questions older than 20 minutes (so the agent's Yes / No rating is in) are appended to the
 * "Expert log" tab of EXPERT_LOG_SHEET_ID. The first run copies everything Expert has logged so far. The quick answer and
 * the full answer to the same question are one row (the full one). Contact details are replaced with [contact].
 * The sheet must be shared (Editor) with the tool's Google service account. No AI is used.
 */
let D = {}, _db = null;
function setDeps(d) { D = Object.assign({}, D, d || {}); }
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function initSchema() { await run(`CREATE TABLE IF NOT EXISTS expert_sheet_state (k TEXT PRIMARY KEY, v TEXT)`); }
const state = async (k) => { const r = await get(`SELECT v FROM expert_sheet_state WHERE k = ?`, [k]); return r ? r.v : null; };
const setState = (k, v) => run(`INSERT INTO expert_sheet_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, String(v)]);

const TAB = 'Expert log';
const HEAD = ['Log ID', 'Date (CT)', 'Time (CT)', 'Asked by', 'Question', 'Tickets', 'Client on', 'Product area', 'Confidence', 'Found in sources', 'Double-checked', 'Seconds', 'Answer (bottom line)', 'Rated', 'Agent comment', 'Gap'];
const sheetId = () => String(process.env.EXPERT_LOG_SHEET_ID || '1yqKE_8yXkbjSmTd5NyFooq7x3KHTjAH8uJPPCqRtyfw').trim(); // "Adit Expert Search Log" in Sebastin's Drive
function configured() { return !!(sheetId() && process.env.GOOGLE_SERVICE_ACCOUNT_KEY); }
function serviceEmail() { try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || null; } catch (e) { return null; } }
async function client() {
  if (D.sheets) return D.sheets;
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}
const scrub = (s) => String(s || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[contact]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[contact]');
const cell = (s, n = 4000) => { s = scrub(s).replace(/—|–/g, ', '); s = s.length > n ? s.slice(0, n) + '...' : s; return /^[=+\-@]/.test(s) ? "'" + s : s; };
function ct(utc) {
  const d = new Date(String(utc || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return ['', ''];
  return [d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }), d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })];
}
const MODE = { call: 'Call', email: 'Ticket (email)', chat: 'Chat', reply: 'Ticket (email)', answer: 'Not set', troubleshoot: 'Troubleshoot', report: 'Team report' };
function answerText(json) {
  try { const a = JSON.parse(json || '{}'); const B = a.brief || {}; return B.bottom_line || a.answer || a.say || ''; } catch (e) { return ''; }
}
function toRow(r, fb) {
  const [day, time] = ct(r.created_at);
  const tickets = [...new Set((String(r.question || '').match(/#\d{5,7}\b/g) || []))].join(', ');
  const asked = r.email === 'desk-automation' ? 'Desk automation' : (r.email || '');
  return [r.id, day, time, asked, cell(r.question, 1500), tickets, MODE[r.mode] || r.mode || '', r.module || '', r.confidence || '', r.found ? 'Yes' : 'No', r.verified ? 'Yes' : 'No',
    r.ms != null ? Math.round(r.ms / 100) / 10 : '', cell(answerText(r.answer_json), 1500), r.vote === 1 ? 'Helpful' : r.vote === -1 ? 'Not right' : '', cell(fb || '', 800), r.gap || ''];
}
// The page asks a quick and a full answer at once: keep the last row of the same person and question within 5 minutes.
function dedupe(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], n = rows.slice(i + 1).find((x) => x.email === r.email && x.question === r.question);
    if (n && Date.parse(String(n.created_at).replace(' ', 'T') + 'Z') - Date.parse(String(r.created_at).replace(' ', 'T') + 'Z') < 5 * 60000) continue;
    out.push(r);
  }
  return out;
}
async function ensureTab(sheets, id) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(title,sheetId)' });
  const has = (meta.data.sheets || []).find((s) => s.properties.title === TAB);
  if (!has) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${TAB}'!A1`, valueInputOption: 'RAW', requestBody: { values: [HEAD] } });
  }
}
function explain(e) {
  const m = String((e && ((e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message)) || e || '');
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(m)) return 'The Google Sheets API is not enabled for the service account.';
  if (/permission|PERMISSION_DENIED|403|does not have/i.test(m)) return 'The sheet is not shared with the tool. Share it as Editor with ' + (serviceEmail() || 'the service account') + '.';
  if (/not found|404/i.test(m)) return 'The sheet was not found. Check EXPERT_LOG_SHEET_ID.';
  return m.slice(0, 200);
}
let _running = null;
async function sync({ settleMin = 20, batch = 2000 } = {}) {
  if (!configured()) return { skipped: 'not set up' };
  if (_running) return _running;
  _running = (async () => {
    const id = sheetId();
    try {
      const sheets = await client();
      if ((await state('sheet')) !== id) { await ensureTab(sheets, id); await setState('sheet', id); await setState('last_id', 0); }
      const last = Number(await state('last_id')) || 0;
      const rows = await all(`SELECT id, email, question, module, mode, confidence, found, verified, answer_json, ms, vote, gap, created_at FROM expert_log
        WHERE id > ? AND created_at < datetime('now', ?) ORDER BY id LIMIT ?`, [last, `-${Number(settleMin)} minutes`, batch]);
      if (!rows.length) return { added: 0, last };
      const ids = rows.map((r) => r.id);
      const fbs = await all(`SELECT log_id, group_concat(coalesce(correction, comment), ' | ') AS t FROM expert_feedback WHERE log_id IN (${ids.map(() => '?').join(',')}) GROUP BY log_id`, ids).catch(() => []);
      const fb = new Map(fbs.map((f) => [f.log_id, f.t]));
      // A question at the end of this batch may still get its full answer: hold it back unless it is old enough.
      const keep = dedupe(rows);
      const values = keep.map((r) => toRow(r, fb.get(r.id)));
      if (values.length) await sheets.spreadsheets.values.append({ spreadsheetId: id, range: `'${TAB}'!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values } });
      const top = rows[rows.length - 1].id;
      await setState('last_id', top); await setState('synced_at', new Date().toISOString()); await setState('error', '');
      return { added: values.length, read: rows.length, last: top, more: rows.length === batch };
    } catch (e) { const m = explain(e); await setState('error', m).catch(() => {}); return { error: m }; }
    finally { _running = null; }
  })();
  return _running;
}
// Batch 305: a second tab, "Desk drafts", with every Expert draft made for Zoho Desk. Drafts change after they are made
// (sent, removed, not needed), so the tab is rewritten each time with the latest 5,000.
const DTAB = 'Desk drafts';
const DHEAD = ['Job ID', 'Date (CT)', 'Time (CT)', 'Ticket', 'Subject', 'Owner', 'Account', 'Deal', 'Started by', 'Mode', 'Status', 'What happened', 'Seconds', 'Problem', 'Draft reply', 'Private note'];
const DSRC = { webhook: 'Desk webhook', manual: 'By hand', automation: 'Desk function' };
const DSTATUS = { done: 'Done', failed: 'Failed', skipped: 'Not needed', working: 'Writing', queued: 'Waiting' };
const DSTATE = { 'in desk': 'Draft waiting in Desk', sent: 'Sent by the agent', removed: 'Removed: agent sent their own reply', 'agent replied': 'Agent sent their own reply', gone: 'Draft deleted in Desk', 'not saved': 'Agent replied first', replaced: 'Replaced by a newer draft' };
function draftRow(r) {
  const [day, time] = ct(r.created_at);
  return [r.id, day, time, '#' + r.number, cell(r.subject, 200), r.owner || '', cell(r.account, 120), cell(r.deal, 160), DSRC[r.source || 'automation'] || r.source || '', r.mode === 'save' ? 'Full review' : 'Quick',
    DSTATUS[r.status] || r.status || '', DSTATE[r.draft_state] || '', r.ms != null ? Math.round(r.ms / 1000) : '', cell(r.error, 300), cell(r.reply, 4000), cell(r.note, 3000)];
}
async function syncDrafts() {
  if (!configured()) return { skipped: 'not set up' };
  let rows; try { rows = await all(`SELECT * FROM expert_desk_drafts ORDER BY id DESC LIMIT 5000`); } catch (e) { return { skipped: 'no drafts yet' }; }
  const id = sheetId();
  try {
    const sheets = await client();
    if ((await state('dsheet')) !== id) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(title)' });
      if (!(meta.data.sheets || []).some((x) => x.properties.title === DTAB)) await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: DTAB, gridProperties: { frozenRowCount: 1 } } } }] } });
      await setState('dsheet', id);
    }
    const full = rows.map((r) => r.id + '|' + r.status + '|' + (r.draft_state || '') + '|' + (r.owner || '')).join(';');
    if ((await state('dsig')) === full) return { drafts: rows.length, unchanged: true };
    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `'${DTAB}'!A1:P` });
    await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `'${DTAB}'!A1`, valueInputOption: 'RAW', requestBody: { values: [DHEAD].concat(rows.map(draftRow)) } });
    await setState('dsig', full); await setState('dsynced_at', new Date().toISOString());
    return { drafts: rows.length };
  } catch (e) { const m = explain(e); await setState('error', m).catch(() => {}); return { error: m }; }
}
async function syncAll() { let r, n = 0; do { r = await sync(); if (r && r.added) n += r.added; } while (r && r.more); const d = await syncDrafts().catch((e) => ({ error: e.message })); return Object.assign({}, r, { addedTotal: n, drafts: d }); }
async function status() {
  const last = Number(await state('last_id')) || 0;
  const pend = await get(`SELECT count(*) AS n FROM expert_log WHERE id > ?`, [last]).catch(() => ({ n: null }));
  return { draftsTab: DTAB, draftsSyncedAt: await state('dsynced_at'), configured: configured(), sheetId: sheetId() || null, tab: TAB, serviceAccount: serviceEmail(), lastId: last, waiting: pend && pend.n, syncedAt: await state('synced_at'), error: (await state('error')) || null };
}
module.exports = { syncDrafts, draftRow, DHEAD, setDeps, setDB, initSchema, configured, sync, syncAll, status, toRow, dedupe, HEAD, _scrub: scrub };
