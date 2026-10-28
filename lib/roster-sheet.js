'use strict';
/**
 * Batch 195: the Roster page follows the "T1 CS Team Roster" Google Sheet (one tab per month, one row per agent, a
 * code per day). Read with the tool's Google service account (GOOGLE_SERVICE_ACCOUNT_KEY): the sheet must be shared
 * with that account (Viewer) and the Google Sheets API enabled in its Google Cloud project.
 *  - sync({ months }): reads the month tabs and writes any day that differs into roster_days (the sheet wins),
 *    adds agents that are on the sheet but not on the Roster. Blank cells (days not marked yet) are left alone.
 *  - Runs every hour for the current and previous month, and every night for the last 12 months.
 */
const ROSTER_SHEET_ID = process.env.ROSTER_SHEET_ID || '16K_jmO9AvU-PUVGJiYeFDbxVTwfmO8zIZMMzIgWCx-Y';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
let _roster = null, _last = null, _running = null;
function setDeps(d) { _roster = d.roster; }
function serviceEmail() { try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || null; } catch (e) { return null; } }

/** Tab title -> 'YYYY-MM' ("Oct'26", "Sept'26", "Oct 2025", " Feb 2024", "March 2024"), else null. */
function tabMonth(title) {
  const m = /^\s*([A-Za-z]+)\s*[' ]\s*(\d{2}|\d{4})\s*$/.exec(String(title || ''));
  if (!m) return null;
  const mo = MON[m[1].toLowerCase()]; if (!mo) return null;
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return y + '-' + String(mo).padStart(2, '0');
}
/** A day cell -> roster status, '' for blank (not marked yet), null for something unknown. */
function code(cell) {
  const c = String(cell == null ? '' : cell).replace(/\s+/g, ' ').trim().toUpperCase();
  if (!c) return '';
  const map = { P: 'present', PRESENT: 'present', OFF: 'off', WO: 'off', 'WEEK OFF': 'off', HOLIDAY: 'holiday', H: 'holiday',
    PL: 'pl', SL: 'sl', UPL: 'upl', NCNS: 'ncns', 'HD PL': 'hd_pl', 'HD SL': 'hd_sl', 'HD UPL': 'hd_upl', WFH: 'wfh',
    RELIEVED: 'relieved', 'FLOATER LEAVE': 'fl', FL: 'fl', FLOATER: 'fl', 'MATERNITY LEAVE': 'ml', ML: 'ml', MATERNITY: 'ml', ABSENT: 'absent', 'ON DUTY': 'on_duty' };
  if (map[c]) return map[c];
  if (/WORKED ON\s*HOLIDAY/.test(c)) return 'on_duty'; // holiday worked: counts as a present day
  return null;
}

/** values (rows of cells) of one month tab -> { agents: [{emp_id, pseudo, full_name, email, designation, doj, shift, days: {date: status}}], unknown: [] } */
function parseTab(key, values) {
  const [y, mo] = key.split('-').map(Number), nd = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  // the row with the day labels ("1 Oct" ... ) and the header row (Emp Id ...)
  let dayRow = -1, headRow = -1;
  for (let r = 0; r < Math.min(values.length, 8); r++) {
    const row = values[r] || [];
    if (dayRow < 0 && row.filter((c) => /^\s*\d{1,2}\s+[A-Za-z]{3}/.test(String(c))).length >= 20) dayRow = r;
    if (headRow < 0 && row.some((c) => /^\s*emp\s*id\s*$/i.test(String(c)))) headRow = r;
  }
  if (dayRow < 0 || headRow < 0) return { agents: [], unknown: [], error: 'Could not find the day and header rows' };
  const dayCol = {};
  (values[dayRow] || []).forEach((c, i) => { const m = /^\s*(\d{1,2})\s+[A-Za-z]{3}/.exec(String(c)); if (m && +m[1] >= 1 && +m[1] <= nd && dayCol[+m[1]] == null) dayCol[+m[1]] = i; });
  const H = (values[headRow] || []).map((c) => String(c).trim().toLowerCase());
  const col = (re) => H.findIndex((h) => re.test(h));
  const C = { emp: col(/^emp\s*id$/), pseudo: col(/^pseudo/), full: col(/^full\s*name/), email: col(/^email/), desig: col(/^designation/), doj: col(/^doj/), shift: col(/shi(f)?t\s*timing/) };
  const agents = [], unknown = [];
  for (let r = headRow + 1; r < values.length; r++) {
    const row = values[r] || [], emp = String(row[C.emp] || '').trim().toUpperCase();
    if (!/^AD\d{3,}$/.test(emp)) continue;
    const days = {};
    for (let d = 1; d <= nd; d++) {
      if (dayCol[d] == null) continue;
      const st = code(row[dayCol[d]]);
      if (st === null) { unknown.push(emp + ' ' + d + ': ' + String(row[dayCol[d]]).trim()); continue; }
      if (st) days[key + '-' + String(d).padStart(2, '0')] = st;
    }
    const v = (k) => (C[k] >= 0 ? String(row[C[k]] || '').replace(/\s+/g, ' ').trim() : '') || null;
    agents.push({ emp_id: emp, pseudo: v('pseudo'), full_name: v('full'), email: (v('email') || '').toLowerCase() || null, designation: v('desig'), doj: v('doj'), shift: v('shift'), days });
  }
  return { agents, unknown };
}

async function client() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) throw Object.assign(new Error('The Google service account is not set up (GOOGLE_SERVICE_ACCOUNT_KEY)'), { status: 503 });
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: SCOPES });
  return google.sheets({ version: 'v4', auth });
}
function explain(e) {
  const m = String((e && (e.message || (e.response && e.response.data && e.response.data.error && e.response.data.error.message))) || e || '');
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m)) return 'The Google Sheets API is not enabled in the service account\'s Google Cloud project. Enable it, then sync again.';
  if (/permission|PERMISSION_DENIED|403|does not have/i.test(m)) return 'The roster sheet is not shared with the tool. Share it (Viewer) with ' + (serviceEmail() || 'the service account') + '.';
  if (/not found|404/i.test(m)) return 'The roster sheet was not found (' + ROSTER_SHEET_ID + ').';
  return m.slice(0, 200);
}

/** months: ['YYYY-MM'] or a number of recent months (default 2: current and previous, Central time). */
async function sync({ months = 2, by = 'roster-sheet' } = {}) {
  if (_running) return _running;
  _running = (async () => {
    const started = new Date().toISOString();
    try {
      const sheets = await client();
      const meta = await sheets.spreadsheets.get({ spreadsheetId: ROSTER_SHEET_ID, fields: 'sheets.properties.title' });
      const tabs = {};
      for (const s of (meta.data.sheets || [])) { const t = s.properties.title, k = tabMonth(t); if (!k) continue; if (!tabs[k] || /'/.test(t)) tabs[k] = t; } // "Oct'25" style wins over "Oct 2025"
      let keys;
      if (Array.isArray(months)) keys = months;
      else { const p = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).split('-').map(Number); keys = [];
        for (let i = 0; i < months; i++) { let y = p[0], m = p[1] - i; while (m < 1) { m += 12; y--; } keys.push(y + '-' + String(m).padStart(2, '0')); } }
      const report = { started, months: {}, written: 0, agentsAdded: [], unknown: [] };
      const existingAgents = new Map((await _roster.listAgents({ includeRelieved: true })).map((a) => [a.emp_id, a]));
      for (const k of keys) {
        const title = tabs[k]; if (!title) { report.months[k] = 'no tab'; continue; }
        const v = await sheets.spreadsheets.values.get({ spreadsheetId: ROSTER_SHEET_ID, range: `'${title.replace(/'/g, "''")}'!A1:BB80`, valueRenderOption: 'FORMATTED_VALUE' });
        const parsed = parseTab(k, v.data.values || []);
        if (parsed.error) { report.months[k] = parsed.error; continue; }
        const cur = (await _roster.getMonth(k)).grid || {};
        let changed = 0;
        for (const a of parsed.agents) {
          if (!existingAgents.has(a.emp_id)) {
            const add = await _roster.upsertAgent(a.emp_id, { pseudo: a.pseudo, full_name: a.full_name, email: a.email, designation: a.designation, doj: a.doj, shift: a.shift, status: 'active' }, { email: by, name: 'Roster sheet' });
            existingAgents.set(a.emp_id, add); report.agentsAdded.push(a.emp_id + ' ' + (a.pseudo || ''));
          } else if (a.email && !existingAgents.get(a.emp_id).email) {
            await _roster.upsertAgent(a.emp_id, { email: a.email }, { email: by, name: 'Roster sheet' });
          }
          for (const [date, st] of Object.entries(a.days)) {
            const was = cur[a.emp_id] && cur[a.emp_id][date] && cur[a.emp_id][date].status;
            if (was === st) continue;
            await _roster.setDay({ date, emp_id: a.emp_id, status: st, note: 'From the roster sheet' }, { email: by, name: 'Roster sheet' });
            changed++;
          }
        }
        report.months[k] = { tab: title, agents: parsed.agents.length, changed };
        report.written += changed;
        report.unknown.push(...parsed.unknown.map((u) => k + ' ' + u));
      }
      report.unknown = report.unknown.slice(0, 30);
      _last = Object.assign({ ok: true, finished: new Date().toISOString() }, report);
    } catch (e) {
      _last = { ok: false, started, finished: new Date().toISOString(), error: explain(e) };
    }
    return _last;
  })();
  try { return await _running; } finally { _running = null; }
}
function status() { return { sheetId: ROSTER_SHEET_ID, serviceAccount: serviceEmail(), last: _last }; }

module.exports = { setDeps, sync, status, tabMonth, code, parseTab };
