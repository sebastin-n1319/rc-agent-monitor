'use strict';
/**
 * Batch 419: the T1 roster Google Sheet is the one place T1 agents are managed (the T1 Desk automations read it too).
 * Expert reads it, read only, to decide whose tickets get Desk drafts.
 *
 * Tab "Roster", rows 2 to 80: A agent name, B Desk agent ID, N Status (Active / Inactive), O Role,
 * R Expert drafts (Yes / No), S Adit email.
 *  - group(): who gets Expert drafts = Status Active and Expert drafts Yes, matched on the Desk agent ID.
 *  - Cached 10 minutes. If the sheet cannot be read, or no row is Active, callers fall back to the old pilot list
 *    (Settings > Desk drafts, else EXPERT_PILOT_OWNERS), and the fallback is logged.
 *  - Never writes to the sheet (read-only scope).
 */
const SHEET_ID = () => process.env.T1_ROSTER_SHEET_ID || '1kuXMa3xs8HShjKlodxeqjyeCS8hI27zT6F-D31EeUA0';
const RANGE = () => process.env.T1_ROSTER_RANGE || "'Roster'!A2:S80";
const TTL = 10 * 60 * 1000;
let _cache = null, _loading = null, _deps = {}, _lastLog = '';
function setDeps(d) { _deps = Object.assign({}, _deps, d || {}); _cache = null; }
function serviceEmail() { try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email || null; } catch (e) { return null; } }

async function readValues() {
  if (_deps.readValues) return _deps.readValues();
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const r = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({ spreadsheetId: SHEET_ID(), range: RANGE(), valueRenderOption: 'FORMATTED_VALUE' });
  return (r && r.data && r.data.values) || [];
}

const cell = (row, i) => String((row && row[i]) == null ? '' : row[i]).trim();
/** rows of cells (A..S) -> [{ name, deskId, active, role, expert, email }] (rows without a Desk agent ID are left out) */
function parse(values) {
  const out = [];
  for (const row of values || []) {
    const deskId = cell(row, 1).replace(/\D/g, '');
    if (!deskId) continue;
    out.push({ name: cell(row, 0), deskId, active: /^active$/i.test(cell(row, 13)), role: cell(row, 14),
      expert: /^y(es)?$/i.test(cell(row, 17)), email: cell(row, 18).toLowerCase() });
  }
  return out;
}

function logOnce(msg) { if (msg !== _lastLog) { _lastLog = msg; console.log('👥 T1 roster:', msg); } }

/** The roster, cached 10 minutes: { ok, at, rows, error } */
async function load({ force = false } = {}) {
  if (!force && _cache && Date.now() - _cache.t < TTL) return _cache.v;
  if (_loading) return _loading;
  _loading = (async () => {
    let v;
    try { const rows = parse(await readValues()); v = { ok: true, at: new Date().toISOString(), rows, error: null }; }
    catch (e) { v = { ok: false, at: new Date().toISOString(), rows: [], error: String(e.message || e).slice(0, 200) }; }
    _cache = { t: Date.now(), v };
    return v;
  })().finally(() => { _loading = null; });
  return _loading;
}

/**
 * Who gets Expert drafts.
 * { source: 'sheet', ids: Set (Active + Yes), onSheet: Set (every Desk ID on the sheet), active: Set, names: Map id -> name }
 * or, when the sheet cannot be used, { source: 'fallback', reason, ids: Set(fallback list), onSheet: null, names }.
 */
async function group({ fallback = [] } = {}) {
  const r = await load();
  const names = new Map(r.rows.map((x) => [x.deskId, x.name]));
  const active = r.rows.filter((x) => x.active);
  if (!r.ok || !active.length) {
    const reason = !r.ok ? 'sheet could not be read (' + r.error + ')' : 'no Active row on the sheet';
    logOnce('using EXPERT_PILOT_OWNERS / Settings pilot list, because the ' + reason);
    return { source: 'fallback', reason, ids: new Set((fallback || []).map(String)), onSheet: null, active: null, names, at: r.at };
  }
  logOnce('using the sheet: ' + active.filter((x) => x.expert).length + ' with Expert drafts, ' + active.length + ' Active');
  return { source: 'sheet', ids: new Set(active.filter((x) => x.expert).map((x) => x.deskId)), onSheet: new Set(r.rows.map((x) => x.deskId)),
    active: new Set(active.map((x) => x.deskId)), names, at: r.at };
}

/** Active T1 agents from the sheet as [{id, name}], or null when the sheet is not usable. */
async function activeAgents() {
  const r = await load();
  const a = r.rows.filter((x) => x.active);
  return r.ok && a.length ? a.map((x) => ({ id: x.deskId, name: x.name })) : null;
}
async function nameOf(deskId) { const r = await load(); const x = r.rows.find((y) => y.deskId === String(deskId)); return x ? x.name : null; }

// ── TechOB tickets are not T1 ─────────────────────────────────────────────
const TECHOB_TEAM = /tech\s*ob\s*pod/i;
/** Why a ticket is TechOB work and must not be drafted, or '' when it is fine. techob-to-support sends it back to T1. */
function techobReason({ tags = [], teamName = '' } = {}) {
  const t = (tags || []).map((x) => String((x && x.name) || x || '').trim().toLowerCase()).filter(Boolean);
  if (t.includes('techob-to-support')) return '';
  const hit = t.find((x) => x.startsWith('techob-'));
  if (hit) return 'TechOB ticket (tag ' + hit + ')';
  if (TECHOB_TEAM.test(String(teamName || ''))) return 'TechOB ticket (team ' + teamName + ')';
  return '';
}

async function status() {
  const r = await load();
  return { sheetId: SHEET_ID(), range: RANGE(), serviceAccount: serviceEmail(), ok: r.ok, at: r.at, error: r.error,
    rows: r.rows.length, active: r.rows.filter((x) => x.active).length,
    expert: r.rows.filter((x) => x.active && x.expert).map((x) => ({ id: x.deskId, name: x.name })) };
}

module.exports = { load, group, activeAgents, nameOf, techobReason, status, setDeps, _parse: parse, serviceEmail };
