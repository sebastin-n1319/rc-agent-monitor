'use strict';
/**
 * Batch 232: the "Who Does What at Adit" Google Sheet as a cross reference for teams.
 * Read with the tool's Google service account (GOOGLE_SERVICE_ACCOUNT_KEY); the sheet must be shared with it (Viewer).
 * Only names, pods, roles, working hours and EHR coverage are kept. Phone numbers and extensions are never read into
 * the tool. Cached for an hour.
 *  people(): [{ team, name, real, pod, role, hours, ehr, vertical, source: 'sheet' }]
 */
const SHEET_ID = process.env.WHO_DOES_WHAT_SHEET_ID || '1fJhqLH1wVpeifC1hYLrG53G4uiXGT1V7dSfdF9oD4k0';
const RANGES = ["'Tech CSMs'!A1:F80", "'Marketing Pods/CSMs/ACSMs'!A1:F40", "'T2 CS'!A1:F40", "'Adit Pay & Financing'!A1:G30",
  "'AI OB Team '!A1:F30", "'TechOB Pods/Leads '!A1:E60", "'CSM Vs EHR Matrix'!A1:C40"];
let _c = { at: 0, people: null, error: '', loading: null };
const nm = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
// "Vera & Loki Williams (Lokender) MT 8-5" -> ['Vera', 'Loki Williams']; "Faith Chiaravallo - CST 7-4" -> ['Faith Chiaravallo']
function names(cell) {
  return nm(String(cell || '').replace(/\([^)]*\)/g, ' ').replace(/\s-\s.*$/, '').replace(/\b(MT|CST|PST|EST|IST)\b.*$/i, ''))
    .split(/\s*(?:&|,|\/|\band\b)\s*/i).map(nm).filter((n) => /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(n));
}
function serviceEmail() { try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || null; } catch (e) { return null; } }

/** valueRanges in RANGES order -> people */
function parse(vr) {
  const out = [], tab = (i) => (vr[i] && vr[i].values) || [];
  // Tech CSMs: the first block (pods), then the leadership rows; the second "Pod Name" block is an older list and is skipped.
  let headers = 0, gap = false;
  for (const row of tab(0)) {
    const a = nm(row[0]), b = nm(row[1]), c = nm(row[2]);
    if (/^pod name$/i.test(a)) { headers++; gap = false; continue; }
    if (!a && !b) { gap = true; continue; }
    if (headers !== 1 || !b) continue;
    if (!gap) out.push({ team: 'Tech CSM', name: b, real: c, pod: a, role: 'Tech CSM', hours: nm(row[5]) });
    else out.push({ team: 'Tech CSM leadership', name: b, real: c, pod: '', role: a, hours: nm(row[5]) });
  }
  // Marketing pods: CSM and two ACSM columns per pod.
  for (const row of tab(1)) {
    const pod = nm(row[0]); if (!/^pod\b/i.test(pod)) continue;
    for (const n of names(row[1])) out.push({ team: 'Marketing CSM', name: n, real: '', pod, role: 'CSM' });
    for (const n of names(row[2]).concat(names(row[3]))) out.push({ team: 'Marketing CSM', name: n, real: '', pod, role: 'ACSM' });
  }
  for (const row of tab(1)) { const a = nm(row[0]); if (/manager|lead/i.test(a) && nm(row[1])) out.push({ team: 'Marketing CSM leadership', name: nm(row[1]), real: '', pod: '', role: a }); }
  // T2 CS: Emp ID, alias, real name, phone (skipped), ext (skipped), hours.
  for (const row of tab(2)) { if (/^AD\d+/i.test(nm(row[0])) && nm(row[1])) out.push({ team: 'T2 CS', name: nm(row[1]), real: nm(row[2]), pod: '', role: 'T2 support', hours: nm(row[5]) }); }
  // Adit Pay & Financing: associate, team, real name, queue, ext (skipped), hours.
  for (const row of tab(3)) {
    const a = nm(row[0]), b = nm(row[1]);
    if (a && /adit pay/i.test(b)) out.push({ team: 'Adit Pay', name: a, real: nm(row[2]), pod: b, role: 'Associate', hours: nm(row[5]) });
    else if (a && /director|manager|escalation/i.test(a) && b) out.push({ team: 'Adit Pay', name: b, real: nm(row[2]), pod: '', role: a });
  }
  // AI OB: name, real name, phone and ext skipped, hours, manager.
  for (const row of tab(4)) { const a = nm(row[0]); if (a && !/name$/i.test(a) && nm(row[4])) out.push({ team: 'AI OB', name: a, real: nm(row[1]), pod: '', role: 'AI OB', hours: nm(row[4]), manager: nm(row[5]) }); }
  // Tech OB pods: pod, lead, hours, reporting manager.
  for (const row of tab(5)) { const a = nm(row[0]), b = nm(row[1]); if (/^pod\b/i.test(a) && b) out.push({ team: 'Tech OB', name: b, real: '', pod: a, role: 'Tech OB', hours: nm(row[2]), manager: nm(row[3]) }); }
  // EHR coverage per CSM.
  const ehr = new Map();
  for (const row of tab(6)) { const v = nm(row[0]), c = nm(row[1]); if (v && c && !/^vertical$/i.test(v)) ehr.set(c.toLowerCase(), { vertical: v, ehr: nm(row[2]) }); }
  for (const p of out) { const e = ehr.get(p.name.toLowerCase()); if (e) Object.assign(p, e); }
  return out.map((p) => Object.assign({ source: 'sheet' }, p));
}

async function load() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) throw new Error('The Google service account is not set up');
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const r = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: RANGES });
  return parse(r.data.valueRanges || []);
}
function explain(e) {
  const m = String((e && (e.message || '')) || e);
  if (/permission|PERMISSION_DENIED|403|does not have|not found|404/i.test(m)) return 'The Who Does What sheet is not shared with the tool. Share it (Viewer) with ' + (serviceEmail() || 'the service account') + '.';
  return m.slice(0, 200);
}
/** { people, error, at } (cached for an hour; a failed read keeps the last good copy) */
async function people() {
  if (_c.people && Date.now() - _c.at < 3600e3) return _c;
  if (!_c.people && _c.error && Date.now() - (_c.errAt || 0) < 10 * 60e3) return _c; // a failed read is retried after 10 minutes
  if (!_c.loading) _c.loading = load().then((p) => { _c = { at: Date.now(), people: p, error: '', loading: null }; })
    .catch((e) => { _c = Object.assign({}, _c, { error: explain(e), errAt: Date.now(), loading: null, at: _c.people ? _c.at : 0 }); });
  await _c.loading;
  return _c;
}
module.exports = { people, parse, names, serviceEmail, SHEET_ID, _reset: () => { _c = { at: 0, people: null, error: '', loading: null }; } };
