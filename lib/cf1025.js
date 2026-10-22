'use strict';
/**
 * Batch 187: 1025 Call Flow & Capacity.
 *
 * Every call that reaches the T1 Customer Service queue (ext 1025) is stored as one compact row: how it got there
 * (straight from the IVR, via a person, rolled over from a queue), who sent it and how (forward rule, decline,
 * ring-out, transfer), what happened at 1025 and who answered. From those rows the page builds the summary, day-wise
 * and week-on-week views, the per-person and per-team tables, the RingCentral fix list, the window comparison, the
 * "why" analysis (with T1 ticket topics from AditKB) and the Calls Wing roster against Erlang C demand.
 *
 * Sources: the RingCentral company call log (hourly, with legs) and the RingCentral admin "Call Log" CSV export
 * (detailed), for back-fill. Times are US Central; stored in UTC; Central and IST shown with the time zone database.
 */
const fs = require('fs');
const path = require('path');

const CT = 'America/Chicago', IST = 'Asia/Kolkata';
const Q = '1025';
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

// ── Time zones (never a fixed offset) ───────────────────────────────────
const _fmt = {};
function parts(ms, tz) {
  const f = _fmt[tz] || (_fmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}
function tzOffsetMs(ms, tz) { const p = parts(ms, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
/** Wall-clock time in a zone -> UTC ms (handles DST). */
function zonedToUtc(y, mo, d, h, mi, tz = CT) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}
const pad = (n) => String(n).padStart(2, '0');
function ctDate(ms) { const p = parts(ms, CT); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; }
function ctHour(ms) { return parts(ms, CT).h; }
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function dowOf(dateStr) { return new Date(dateStr + 'T12:00:00Z').getUTCDay(); }
function addDays(dateStr, n) { return new Date(Date.parse(dateStr + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
function isBiz(dateStr) { const w = dowOf(dateStr); return w >= 1 && w <= 5; }
function daysBetween(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
function weekStart(dateStr) { const w = dowOf(dateStr); return addDays(dateStr, -((w + 6) % 7)); } // Monday
/** "7:00 AM CT" style label for a Central hour on a date, and the same moment in IST. */
function hourLabel(h) { const hh = ((h + 11) % 12) + 1; return `${hh} ${h < 12 ? 'AM' : 'PM'}`; }
function istFor(dateStr, hCT, mi = 0) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const t = zonedToUtc(y, mo, d, hCT, mi, CT); const p = parts(t, IST);
  return { h: p.h, mi: p.mi, label: `${((p.h + 11) % 12) + 1}:${pad(p.mi)} ${p.h < 12 ? 'AM' : 'PM'}`, offsetMin: Math.round((tzOffsetMs(t, IST) - tzOffsetMs(t, CT)) / 60000) };
}

// ── CSV ─────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false; const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] || '').trim());
}
const COLS = { type: 'Type', dir: 'Direction', from: 'From', to: 'To', ext: 'Extension', fwd: 'Forwarded To', name: 'Name', date: 'Date', time: 'Time', action: 'Action', result: 'Action Result', desc: 'Result Description', dur: 'Duration' };
function durSec(s) { s = String(s || '').trim(); if (!s || /progress/i.test(s)) return null; const p = s.split(':').map(Number); if (p.some(isNaN)) return null; return p.reduce((a, b) => a * 60 + b, 0); }
function parseCT(date, time) {
  const m = String(date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return null;
  const t = String(time || '').trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i); if (!t) return null;
  let h = +t[1] % 12; if (t[4] && /p/i.test(t[4])) h += 12; if (!t[4]) h = +t[1];
  return zonedToUtc(+m[3], +m[1], +m[2], h, +t[2], CT) + (t[3] ? +t[3] * 1000 : 0);
}
/** Rows -> sessions. A session starts at a row with a Type; rows with a blank Type are its legs. Whole duplicate sessions are dropped. */
function sessionsFromCSV(text) {
  const rows = parseCSV(text); if (!rows.length) throw httpError(400, 'The file is empty');
  const head = rows[0].map(h => h.trim()); const ix = {};
  for (const [k, name] of Object.entries(COLS)) ix[k] = head.indexOf(name);
  if (ix.type < 0 || ix.ext < 0 || ix.date < 0) throw httpError(400, 'This does not look like the RingCentral Call Log export (detailed). Missing Type, Extension or Date columns.');
  const sessions = []; let cur = null;
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r]; const o = {}; for (const k of Object.keys(COLS)) o[k] = ix[k] >= 0 ? String(raw[ix[k]] == null ? '' : raw[ix[k]]).trim() : '';
    if (o.type) { cur = { raw: [raw.join('\u0001')], rows: [o] }; sessions.push(cur); }
    else if (cur) { cur.raw.push(raw.join('\u0001')); cur.rows.push(o); }
  }
  const seen = new Set(), out = []; let dupRows = 0, dupSessions = 0;
  for (const s of sessions) { const k = s.raw.join('\u0002'); if (seen.has(k)) { dupRows += s.rows.length; dupSessions++; continue; } seen.add(k); out.push(s.rows); }
  return { sessions: out, rows: rows.length - 1, dupRows, dupSessions };
}

// ── Classification ──────────────────────────────────────────────────────
const DEFAULT_SYSTEM = ['1001', '1009', '1501', '1502', '1004', '1025'];
function extNum(label) { const m = String(label || '').match(/^\s*(\d{3,5})\b/); return m ? m[1] : ''; }
function extName(label) { const s = String(label || ''); const i = s.indexOf(' - '); return i >= 0 ? s.slice(i + 3).trim() : s.trim(); }
const isPerson = (n) => /^[3456]\d{3}$/.test(String(n || ''));
const PATHS = { ivr: 'Straight from IVR', person: 'Via a person', voipq: 'Rolled over from VoIP queue', salesq: 'Rolled over from Sales queue', othersys: 'Other system extension', direct: 'Direct to 1025 (no IVR)' };
const MECH = { xfer: 'Answered, then transferred to CS', ring: 'Rang out, not answered', fwd: 'Auto-forwarded (forwarding rule / DND)', decl: 'Declined or phone offline' };
const digits = (s) => String(s || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');

function classify(rows, opts = {}) {
  const system = new Set(opts.system || DEFAULT_SYSTEM);
  if (!rows || !rows.length) return null;
  const parent = rows[0], rest = rows.slice(1);
  const inc1025 = (l) => /incom|inbound/i.test(l.dir) && extNum(l.ext) === Q;
  // When the parent row is itself the 1025 summary and the legs also reach 1025, the legs tell the real path.
  let legs, i;
  const k = rest.findIndex(inc1025);
  if (k >= 0) { legs = extNum(parent.ext) === Q ? rest : rows; i = legs.indexOf(rest[k]); }
  else if (inc1025(parent)) { legs = rows; i = 0; }
  else return null;
  const L = legs[i];
  // The parent row is a summary of the session: when real legs follow it, only the legs describe the path.
  const pre = legs.slice(0, i).filter(l => extNum(l.ext) && !(l === parent && rest.length && legs.indexOf(parent) === 0 && i > 0 && rest.some(x => extNum(x.ext) === extNum(parent.ext))));
  const preNums = pre.map(l => extNum(l.ext));
  let path;
  const personIdx = pre.findIndex(l => /incom|inbound/i.test(l.dir) && isPerson(extNum(l.ext)));
  if (personIdx >= 0) path = 'person';
  else if (preNums.some(n => n === '1501' || n === '1502')) path = 'voipq';
  else if (preNums.includes('1004')) path = 'salesq';
  else if (preNums.some(n => !isPerson(n) && !system.has(n))) path = 'othersys';
  else if (preNums.includes('1001') || preNums.includes('1009')) path = 'ivr';
  else path = 'direct';
  let mechanism = null, via_main_ivr = 0, origin_ext = null, origin_name = null;
  if (path === 'person') {
    const P = pre[personIdx]; origin_ext = extNum(P.ext); origin_name = extName(P.ext);
    const seg = pre.slice(personIdx + 1);
    const dev = seg.filter(l => /outgo|outbound/i.test(l.dir) && extNum(l.ext) === origin_ext);
    // device legs of that person also count when they carry no extension number of their own
    const devAll = legs.slice(legs.indexOf(P) + 1, i).filter(l => /outgo|outbound/i.test(l.dir) && (extNum(l.ext) === origin_ext || !extNum(l.ext)));
    const D = dev.length ? dev : devAll;
    if (D.some(l => /call connected/i.test(l.result)) || [P].concat(seg).some(l => /transfer/i.test(l.action))) mechanism = 'xfer';
    else if (/missed/i.test(P.result) || D.some(l => /no answer/i.test(l.result))) mechanism = 'ring';
    else if (/accepted/i.test(P.result) && (durSec(P.dur) || 0) === 0 && !D.length) mechanism = 'fwd';
    else mechanism = 'decl';
    via_main_ivr = seg.some(l => extNum(l.ext) === '1001') ? 1 : 0;
  }
  const inProg = /progress/i.test(L.dur) || /progress/i.test(L.result);
  const result = inProg ? 'In Progress' : /voicemail/i.test(L.result) ? 'Voicemail' : /missed|abandon|no answer|rejected/i.test(L.result) ? 'Missed' : /accept|connected/i.test(L.result) ? 'Accepted' : (L.result || 'Missed');
  const after = legs.slice(i + 1);
  const A = after.find(l => (/outgo|outbound/i.test(l.dir) && /call connected/i.test(l.result)) || (/incom|inbound/i.test(l.dir) && isPerson(extNum(l.ext)) && /accepted/i.test(l.result)));
  const answered_ext = A ? (extNum(A.ext) && isPerson(extNum(A.ext)) ? extNum(A.ext) : extNum(A.fwd) || null) : null;
  const answered_by = A ? (isPerson(extNum(A.ext)) ? extName(A.ext) : (A.fwd ? extName(A.fwd) : A.to || extName(A.ext))) : null;
  const t0 = parseCT(parent.date, parent.time) || parseCT(L.date || parent.date, L.time || parent.time);
  const label = (l) => { const n = extNum(l.ext); return n ? `${n} ${extName(l.ext)}`.trim() : (l.ext || l.to || '?'); };
  return {
    call_start_utc: t0 ? new Date(t0).toISOString() : null,
    caller_number: parent.from || '', caller_name: String(parent.name || '').replace(/\s*-\s*1025\s*$/, '').trim(), number_dialed: parent.to || '',
    path, mechanism, via_main_ivr, origin_ext, origin_name,
    result, duration_1025_sec: durSec(L.dur), answered_by, answered_ext, talk_sec: A ? durSec(A.dur) : null,
    full_path: pre.map(label).concat(['1025 Customer Service']).concat(A ? [answered_by] : []).join(' > ').slice(0, 600),
  };
}
function keyFor(c) { const t = c.call_start_utc ? c.call_start_utc.slice(0, 16) : 'x'; return `${t}|${digits(c.caller_number)}|${digits(c.number_dialed)}`; }

// ── Teams ───────────────────────────────────────────────────────────────
const DEFAULT_GROUPS = [
  ['Tech CS Team', 'Tech CSM'], ['Tech OB Team', 'Tech OB'], ['T2 CS Team', 'T2'], ['VOIP Team', 'VoIP'], ['Mark CS Team', 'Mark CSM'],
  ['Sales AE Team', 'Sales'], ['Upgrade AE Team', 'Sales'], ['Upgrades AE Team', 'Sales'], ['SDR Team', 'Sales'], ['ISR Team', 'Sales'], ['Bizdev Team', 'Sales'], ['PMS Calling team', 'Sales'],
];
const GROUP_ORDER = ['Tech CSM', 'Tech OB', 'T2', 'VoIP', 'Mark CSM', 'Sales', 'Others'];
function teamShort(t) { const s = String(t || '').trim(); if (!s) return 'Unknown'; if (/^DSO Team \/ RCM Team$/i.test(s)) return 'DSO/RCM'; return s.replace(/\s+team$/i, ''); }
function seedExtMap() {
  const out = {};
  try {
    for (const ln of fs.readFileSync(path.join(__dirname, '..', 'content', 'cf1025', 'ext-seed.txt'), 'utf8').split('\n')) {
      if (!ln || ln.startsWith('#')) continue; const [ext, team, dept, status] = ln.split('|'); if (ext) out[ext.trim()] = { team: team || '', rc_department: dept || '', status: (status || '').trim() };
    }
  } catch (e) { /* none */ }
  return out;
}

// ── Erlang C ────────────────────────────────────────────────────────────
function erlangC(n, A) {
  if (n <= A) return 1;
  let B = 1; for (let k = 1; k <= n; k++) B = (A * B) / (k + A * B);
  return (n * B) / (n - A * (1 - B));
}
function serviceLevel(n, A, ahtSec, tSec) { if (n <= A) return 0; return 1 - erlangC(n, A) * Math.exp(-(n - A) * tSec / ahtSec); }
function agentsNeeded(callsPerHour, ahtSec, { sl = 0.8, t = 60, maxOcc = 0.85 } = {}) {
  if (!(callsPerHour > 0) || !(ahtSec > 0)) return 0;
  const A = callsPerHour * ahtSec / 3600;
  for (let n = Math.max(1, Math.floor(A)); n < 200; n++) if (n > A && serviceLevel(n, A, ahtSec, t) >= sl && A / n <= maxOcc) return n;
  return 200;
}

// ── Ticket topics ───────────────────────────────────────────────────────
const TOPICS = [
  ['Wanted a specific person / CSM / OB', /call for |speak (to|with)|meeting|resched|scheduled call|next (ob )?steps|onboarding|demo coordination|\bob\b|customer success|asked for|looking for (their|her|his)|wants? to talk|follow[\s-]?up|call ?back|callback|status update|update on|no response|not responded|waiting (for|on)|chasing|escalat|csm|account manager|go[\s-]?live|transfer(red)? to/i],
  ['VoIP / phones', /voip|phone|call (record|flow|forward|rout|drop|quality|log)|calls? (not|are|drop|go|ring)|\bring|ivr|voicemail|extension|fax|transcri|hold music|caller id|porting|port out|softphone|desk ?phone|yealink|dial|e911|call handling|after hours|call override|call management|audio|disconnect|equipment|return label|returning|line name|office hours|call tracking|call intelligence/i],
  ['Texting / reminders (Engage)', /text|sms|mass|reminder|confirm|engage|message|recall|notification|10dlc|campaign|review request|email campaign|birthday/i],
  ['Patient forms', /form|intake|signature|consent|document|patient card/i],
  ['EHR / PMS sync', /sync|ehr|pms|dentrix|eaglesoft|open ?dental|eyefinity|opendental|curve|denticon|compulink|revolution|officemate|chiro|integration|appointment.*(not|missing)|schedul.*(not|missing)|bridge|server|install/i],
  ['Login / users / access', /login|log in|ownership|new location|neww? account|account quer|dns|email not|email issue|logo|password|reset|user|access|locked|2fa|otp|sign in|permission|add (a )?staff|new staff/i],
  ['Billing / invoices', /bill|invoice|charge|refund|payment due|statement|price|pricing|cancel|contract|plan|upgrade|downgrade/i],
  ['Adit Pay / payments', /adit ?pay|card reader|terminal|payment|merchant|payout|deposit|text to pay|surcharg/i],
  ['AI agent / AI front desk', /\bai\b|ai agent|front desk|chatbot|virtual|assistant/i],
  ['Insurance verification', /insurance|eligibility|verification/i],
  ['Online scheduling / website / reviews', /online schedul|booking|website|widget|review|pozative|google|listing/i],
  ['App performance / how-to', /slow|crash|loading|app |application|how to|training|navigate|setting|ipad|tablet|browser|desktop app|update the app/i],
];
const TOPIC_OTHER = 'Other / unclear';
function topicOf(t) {
  const head = [t.subject, t.cf_ai_category_by_llm, t.cf_ai_sub_category_by_llm, t.cf_cs_sub_category].filter(Boolean).join(' | ');
  for (const [name, re] of TOPICS) if (re.test(head)) return name;
  const withDesc = head + ' | ' + (t.description || '');
  for (const [name, re] of TOPICS) if (re.test(withDesc)) return name;
  return TOPIC_OTHER;
}
const SPOT = [['Text not sending / delivery / delay', /(text|sms|message)s?\b.{0,40}(not|n't|fail|deliver|delay|stuck)|not sending|undeliver|delivery|delayed/i], ['Log in / password', /log ?in|password|locked out|reset|sign in|2fa|otp/i], ['Not ringing / audio / drop', /not ringing|no ring|ringing|audio|drop|one[- ]way|can'?t hear|cannot hear|static|choppy/i]];

// ── Storage ─────────────────────────────────────────────────────────────
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS cf_calls (session_key TEXT PRIMARY KEY, call_start_utc TEXT NOT NULL, date_ct TEXT NOT NULL, hour_ct INTEGER, caller_number TEXT, caller_name TEXT,
    number_dialed TEXT, path TEXT, mechanism TEXT, via_main_ivr INTEGER DEFAULT 0, origin_ext TEXT, origin_name TEXT, result TEXT, duration_1025_sec INTEGER, answered_by TEXT, answered_ext TEXT,
    talk_sec INTEGER, full_path TEXT, source TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_cf_calls_date ON cf_calls(date_ct)`);
  await run(`CREATE TABLE IF NOT EXISTS cf_ext_map (ext TEXT PRIMARY KEY, team TEXT, rc_department TEXT, status TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS cf_ext_override (ext TEXT PRIMARY KEY, name TEXT, team TEXT, rc_department TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS cf_fix (ext TEXT PRIMARY KEY, done INTEGER DEFAULT 0, date_fixed TEXT, notes TEXT, updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS cf_roster (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ext TEXT, zoho_id TEXT, wing TEXT DEFAULT 'Calls', start_h REAL, len_h REAL DEFAULT 9, break_h REAL,
    prop_start_h REAL, prop_break_h REAL, active INTEGER DEFAULT 1, verify INTEGER DEFAULT 0, sort INTEGER DEFAULT 0)`);
  await run(`CREATE TABLE IF NOT EXISTS cf_tickets (ticket_number TEXT PRIMARY KEY, created_utc TEXT, date_ct TEXT, agent_id TEXT, channel TEXT, subject TEXT, topic TEXT, spots TEXT)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_cf_tickets_date ON cf_tickets(date_ct)`);
  await run(`CREATE TABLE IF NOT EXISTS cf_settings (k TEXT PRIMARY KEY, v TEXT)`);
  const n = (await get(`SELECT COUNT(*) AS n FROM cf_roster`)).n;
  if (!n) {
    const seed = [['Sky Gibson', '5357', '197800000182389915', 7, 10, 7, 10], ['Sabrina Quinn', '5512', '197800000295035103', 7, 11, 7, 11], ['Greg Dawson', '5466', '197800000260567190', 8, 13, 8, 13],
      ['Audrey Miles', '5611', '197800000394780948', 8, 12, 7, 12], ['Lincy Tabita', '5208', '197800000085433236', 10, 14, 10, 14], ['Henry P', '5348', '197800000176436097', 10, 15, 10, 15], ['Zeff Austin', '5470', '197800000431867905', 10, 14, 9, 14]];
    let i = 0; for (const s of seed) await run(`INSERT INTO cf_roster (name, ext, zoho_id, wing, start_h, len_h, break_h, prop_start_h, prop_break_h, active, verify, sort) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`, [s[0], s[1], s[2], 'Calls', s[3], 9, s[4], s[5], s[6], s[0] === 'Henry P' ? 1 : 0, i++]);
  }
  const m = (await get(`SELECT COUNT(*) AS n FROM cf_ext_map`)).n;
  if (!m) for (const [ext, v] of Object.entries(seedExtMap())) await run(`INSERT OR IGNORE INTO cf_ext_map (ext, team, rc_department, status) VALUES (?,?,?,?)`, [ext, v.team, v.rc_department, v.status]);
}
async function getSetting(k, d) { const r = await get(`SELECT v FROM cf_settings WHERE k = ?`, [k]).catch(() => null); if (!r) return d; try { return JSON.parse(r.v); } catch (e) { return d; } }
async function setSetting(k, v) { await run(`INSERT INTO cf_settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, JSON.stringify(v)]); }
const DEFAULT_PARAMS = { wrapMin: 2, sl: 0.8, answerSec: 60, maxOcc: 0.85, busyMult: 1.35, hourFrom: 7, hourTo: 18 };
async function config() {
  return {
    system: await getSetting('system', DEFAULT_SYSTEM), groups: await getSetting('groups', DEFAULT_GROUPS), params: Object.assign({}, DEFAULT_PARAMS, await getSetting('params', {})),
    digest: Object.assign({ on: true, email: 'sebastin.n@adit.com', hourCT: 19 }, await getSetting('digest', {})), alert: Object.assign({ on: true, pct: 25, minCalls: 8 }, await getSetting('alert', {})),
    overrides: await all(`SELECT * FROM cf_ext_override ORDER BY ext`), roster: await all(`SELECT * FROM cf_roster ORDER BY sort, id`),
    extMapCount: (await get(`SELECT COUNT(*) AS n FROM cf_ext_map`)).n, extMapAt: (await get(`SELECT MAX(updated_at) AS t FROM cf_ext_map`)).t,
  };
}

async function upsertCalls(list, source) {
  let n = 0; const used = new Set();
  await run('BEGIN');
  try {
    for (const c of list) {
      if (!c || !c.call_start_utc) continue;
      let key = keyFor(c);
      if (source === 'csv') { let k2 = key, j = 2; while (used.has(k2)) k2 = key + '#' + j++; key = k2; used.add(key); }
      const ms = Date.parse(c.call_start_utc);
      await run(`INSERT INTO cf_calls (session_key, call_start_utc, date_ct, hour_ct, caller_number, caller_name, number_dialed, path, mechanism, via_main_ivr, origin_ext, origin_name, result, duration_1025_sec, answered_by, answered_ext, talk_sec, full_path, source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_key) DO UPDATE SET path=excluded.path, mechanism=excluded.mechanism, via_main_ivr=excluded.via_main_ivr, origin_ext=excluded.origin_ext,
        origin_name=excluded.origin_name, result=excluded.result, duration_1025_sec=excluded.duration_1025_sec, answered_by=excluded.answered_by, answered_ext=excluded.answered_ext, talk_sec=excluded.talk_sec,
        full_path=excluded.full_path, caller_name=excluded.caller_name, updated_at=datetime('now')`,
        [key, c.call_start_utc, ctDate(ms), ctHour(ms), c.caller_number, c.caller_name, c.number_dialed, c.path, c.mechanism, c.via_main_ivr || 0, c.origin_ext, c.origin_name, c.result, c.duration_1025_sec, c.answered_by, c.answered_ext, c.talk_sec, c.full_path, source]);
      n++;
    }
    await run('COMMIT');
  } catch (e) { await run('ROLLBACK').catch(() => {}); throw e; }
  return n;
}
async function importCSV(text) {
  const cfg = await config();
  const parsed = sessionsFromCSV(text);
  const calls = parsed.sessions.map(s => classify(s, { system: cfg.system })).filter(Boolean);
  const stored = await upsertCalls(calls, 'csv');
  const dates = calls.map(c => c.call_start_utc).filter(Boolean).sort();
  return { rows: parsed.rows, sessions: parsed.sessions.length + parsed.dupSessions, dupRows: parsed.dupRows, dupSessions: parsed.dupSessions, uniqueSessions: parsed.sessions.length, reach1025: calls.length, stored,
    from: dates[0] ? ctDate(Date.parse(dates[0])) : null, to: dates.length ? ctDate(Date.parse(dates[dates.length - 1])) : null, ext1025Only: calls.length && calls.every(c => c.path === 'direct') };
}
async function prune(days = 180) { const cut = addDays(ctDate(Date.now()), -days); const r = await run(`DELETE FROM cf_calls WHERE date_ct < ?`, [cut]); const t = await run(`DELETE FROM cf_tickets WHERE date_ct < ?`, [cut]); return { calls: r.changes, tickets: t.changes }; }

// ── RingCentral API (company call log with legs) ────────────────────────
let _extDir = { at: 0, byId: {} };
async function extDirectory(rcGet) {
  if (Date.now() - _extDir.at < 12 * 3600e3 && Object.keys(_extDir.byId).length) return _extDir.byId;
  const byId = {};
  for (let page = 1; page <= 10; page++) {
    const d = await rcGet('/restapi/v1.0/account/~/extension', { perPage: 1000, page });
    for (const e of d.records || []) byId[String(e.id)] = { num: String(e.extensionNumber || ''), name: e.name || [e.contact && e.contact.firstName, e.contact && e.contact.lastName].filter(Boolean).join(' ') };
    if (!d.navigation || !d.navigation.nextPage) break;
  }
  _extDir = { at: Date.now(), byId };
  return byId;
}
function hms(sec) { sec = Math.max(0, Math.round(Number(sec) || 0)); return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; }
function recordToRows(rec, dir) {
  const legs = Array.isArray(rec.legs) && rec.legs.length ? rec.legs : [rec];
  const toRow = (l, isParent) => {
    const d = /out/i.test(l.direction) ? 'Outgoing' : 'Incoming';
    const e = l.extension && dir[String(l.extension.id)];
    const extLabel = e && e.num ? `${e.num} - ${e.name}` : (d === 'Incoming' ? (l.to && l.to.extensionNumber ? `${l.to.extensionNumber} - ${l.to.name || ''}` : '') : (l.from && l.from.extensionNumber ? `${l.from.extensionNumber} - ${l.from.name || ''}` : ''));
    const p = parts(Date.parse(l.startTime || rec.startTime), CT);
    return { type: isParent ? 'Voice' : '', dir: d, from: (l.from && (l.from.phoneNumber || l.from.extensionNumber)) || '', to: (l.to && (l.to.phoneNumber || l.to.extensionNumber)) || '', ext: extLabel,
      fwd: d === 'Outgoing' && l.to ? (l.to.name || l.to.phoneNumber || '') : '', name: (rec.from && rec.from.name) || '', date: `${p.wd} ${pad(p.mo)}/${pad(p.d)}/${p.y}`, time: `${((p.h + 11) % 12) + 1}:${pad(p.mi)}:${pad(p.s)} ${p.h < 12 ? 'AM' : 'PM'}`,
      action: l.action || '', result: l.result || '', desc: l.reason || '', dur: rec.result === 'In Progress' && l === legs[legs.length - 1] ? 'In progress' : hms(l.duration) };
  };
  const rows = legs.map((l, k) => toRow(l, k === 0));
  rows[0].from = (rec.from && rec.from.phoneNumber) || rows[0].from; rows[0].to = (rec.to && rec.to.phoneNumber) || rows[0].to; rows[0].name = (rec.from && rec.from.name) || rows[0].name;
  const p0 = parts(Date.parse(rec.startTime), CT); rows[0].date = `${p0.wd} ${pad(p0.mo)}/${pad(p0.d)}/${p0.y}`; rows[0].time = `${((p0.h + 11) % 12) + 1}:${pad(p0.mi)}:${pad(p0.s)} ${p0.h < 12 ? 'AM' : 'PM'}`;
  return rows;
}
async function syncFromRC(rcGet, { hours = 2 } = {}) {
  const cfg = await config(); const dir = await extDirectory(rcGet);
  const dateFrom = new Date(Date.now() - hours * 3600e3).toISOString();
  const calls = []; let records = 0;
  for (let page = 1; page <= 40; page++) {
    const d = await rcGet('/restapi/v1.0/account/~/call-log', { view: 'Detailed', type: 'Voice', dateFrom, perPage: 1000, page });
    for (const rec of d.records || []) {
      records++;
      if (!(rec.legs || []).some(l => { const e = l.extension && dir[String(l.extension.id)]; return (e && e.num === Q) || (l.to && l.to.extensionNumber === Q); })) continue;
      const c = classify(recordToRows(rec, dir), { system: cfg.system }); if (c) calls.push(c);
    }
    if (!d.navigation || !d.navigation.nextPage) break;
  }
  const stored = await upsertCalls(calls, 'api');
  await setSetting('lastSync', { at: new Date().toISOString(), hours, records, stored });
  return { records, reach1025: calls.length, stored };
}

// ── AditKB ──────────────────────────────────────────────────────────────
async function refreshExtMap(query) {
  const r = await query(`SELECT rc_extension, team, role, rc_department, status FROM adit_users WHERE rc_extension IS NOT NULL AND rc_extension <> ''`, 5000);
  const rows = r.rows || []; if (rows.length < 20) throw new Error('AditKB returned only ' + rows.length + ' users');
  await run('BEGIN');
  try { for (const u of rows) await run(`INSERT INTO cf_ext_map (ext, team, rc_department, status, updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(ext) DO UPDATE SET team=excluded.team, rc_department=excluded.rc_department, status=excluded.status, updated_at=excluded.updated_at`, [String(u.rc_extension).trim(), u.team || '', u.rc_department || '', u.status || '']); await run('COMMIT'); }
  catch (e) { await run('ROLLBACK').catch(() => {}); throw e; }
  return rows.length;
}
async function refreshTickets(query, days = 180) {
  const ids = (await all(`SELECT zoho_id FROM cf_roster WHERE wing = 'Calls' AND zoho_id IS NOT NULL AND zoho_id <> ''`)).map(r => String(r.zoho_id).replace(/\D/g, '')).filter(Boolean);
  if (!ids.length) return 0;
  const r = await query(`SELECT ticket_number, created_time, j_created_by, channel, subject, cf_ai_category_by_llm, cf_ai_sub_category_by_llm, cf_cs_sub_category, left(coalesce(description,''), 600) AS description
    FROM desk_tickets WHERE created_time >= now() - interval '${Math.max(7, Math.min(400, Number(days) || 180))} days' AND coalesce(is_deleted, false) = false AND j_created_by IN (${ids.map(x => `'${x}'`).join(',')})`, 50000);
  const rows = r.rows || [];
  await run('BEGIN');
  try {
    for (const t of rows) {
      const ms = Date.parse(t.created_time); if (!ms) continue;
      const text = String(t.subject || '') + ' ' + String(t.description || '');
      const spots = SPOT.filter(([, re]) => re.test(text)).map(([n]) => n);
      await run(`INSERT INTO cf_tickets (ticket_number, created_utc, date_ct, agent_id, channel, subject, topic, spots) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(ticket_number) DO UPDATE SET topic=excluded.topic, spots=excluded.spots, subject=excluded.subject, channel=excluded.channel`,
        [String(t.ticket_number), new Date(ms).toISOString(), ctDate(ms), String(t.j_created_by || ''), t.channel || '', String(t.subject || '').slice(0, 300), topicOf(t), JSON.stringify(spots)]);
    }
    await run('COMMIT');
  } catch (e) { await run('ROLLBACK').catch(() => {}); throw e; }
  await setSetting('ticketsAt', new Date().toISOString());
  return rows.length;
}

// ── Analysis ────────────────────────────────────────────────────────────
async function loadRange(from, to) { return all(`SELECT * FROM cf_calls WHERE date_ct >= ? AND date_ct <= ? ORDER BY call_start_utc`, [from, to]); }
async function teamResolver() {
  const map = {}; for (const r of await all(`SELECT * FROM cf_ext_map`)) map[r.ext] = r;
  const ov = {}; for (const r of await all(`SELECT * FROM cf_ext_override`)) ov[r.ext] = r;
  const groups = new Map((await getSetting('groups', DEFAULT_GROUPS)).map(([t, g]) => [String(t).toLowerCase(), g]));
  return (ext) => { const o = ov[ext] || {}, m = map[ext] || {}; const team = o.team || m.team || ''; return { team, teamShort: teamShort(team), rc_department: o.rc_department || m.rc_department || '', group: groups.get(team.toLowerCase()) || 'Others', name: o.name || null }; };
}
const isMissVm = (c) => c.result === 'Missed' || c.result === 'Voicemail';
function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
function lastBizDays(end, n) { const out = []; let d = end; while (out.length < n) { if (isBiz(d)) out.unshift(d); d = addDays(d, -1); } return out; }

async function analyse({ from, to, weekdays = false, aFrom, aTo, bFrom, bTo, manager = false }) {
  const cfg = await config(); const P = cfg.params; const team = await teamResolver();
  let rows = await loadRange(from, to);
  if (weekdays) rows = rows.filter(r => isBiz(r.date_ct));
  rows.forEach(r => { if (r.path === 'person' && r.origin_ext) { const t = team(r.origin_ext); r.team = t.team; r.teamShort = t.teamShort; r.rc_department = t.rc_department; r.group = t.group; if (t.name) r.origin_name = t.name; } });
  const days = daysBetween(from, to).filter(d => !weekdays || isBiz(d));
  const pathKeys = Object.keys(PATHS);
  // Summary
  const byPath = pathKeys.map(k => { const L = rows.filter(r => r.path === k); const m = L.filter(isMissVm).length; return { key: k, label: PATHS[k], calls: L.length, share: pct(L.length, rows.length), missedVm: m, missRate: pct(m, L.length) }; });
  const weeks = {}; for (const r of rows) { const w = weekStart(r.date_ct); (weeks[w] = weeks[w] || []).push(r); }
  const weekly = Object.keys(weeks).sort().map(w => { const L = weeks[w]; const bd = daysBetween(w, addDays(w, 6)).filter(d => isBiz(d) && d >= from && d <= to).length; const per = L.filter(r => r.path === 'person').length;
    const o = { week: w, bizDays: bd, total: L.length, viaPersonPerBizDay: bd ? Math.round(per / bd * 10) / 10 : 0, viaPersonShare: pct(per, L.length) }; pathKeys.forEach(k => { o[k] = L.filter(r => r.path === k).length; }); return o; });
  const persons = rows.filter(r => r.path === 'person');
  const mechanisms = Object.keys(MECH).map(k => ({ key: k, label: MECH[k], calls: persons.filter(r => r.mechanism === k).length, share: pct(persons.filter(r => r.mechanism === k).length, persons.length) }));
  const viaMainIvr = persons.filter(r => r.via_main_ivr).length;
  // Daywise
  const daywise = days.map(d => { const L = rows.filter(r => r.date_ct === d); const o = { date: d, weekend: !isBiz(d), ivr: L.filter(r => r.path === 'ivr').length };
    GROUP_ORDER.forEach(g => { o['via_' + g] = L.filter(r => r.path === 'person' && r.group === g).length; });
    o.viaPerson = L.filter(r => r.path === 'person').length; o.voipq = L.filter(r => r.path === 'voipq').length; o.salesq = L.filter(r => r.path === 'salesq').length; o.othersys = L.filter(r => r.path === 'othersys').length;
    o.direct = L.filter(r => r.path === 'direct').length; o.total = L.length; o.missedVm = L.filter(isMissVm).length; o.viaPersonShare = pct(o.viaPerson, o.total); return o; });
  // By person
  const weekKeys = Object.keys(weeks).sort();
  const pmap = {}; for (const r of persons) { const p = pmap[r.origin_ext] = pmap[r.origin_ext] || { ext: r.origin_ext, name: r.origin_name, team: r.teamShort, teamFull: r.team, rc_department: r.rc_department, group: r.group, total: 0, mech: { xfer: 0, ring: 0, fwd: 0, decl: 0 }, viaMainIvr: 0, weeks: {}, missedVm: 0, first: r.call_start_utc, last: r.call_start_utc };
    p.total++; p.mech[r.mechanism] = (p.mech[r.mechanism] || 0) + 1; if (r.via_main_ivr) p.viaMainIvr++; const w = weekStart(r.date_ct); p.weeks[w] = (p.weeks[w] || 0) + 1; if (isMissVm(r)) p.missedVm++; if (r.call_start_utc < p.first) p.first = r.call_start_utc; if (r.call_start_utc > p.last) p.last = r.call_start_utc; }
  const byPerson = Object.values(pmap).sort((a, b) => b.total - a.total);
  // By team
  const tmap = {}; for (const p of byPerson) { const t = tmap[p.team] = tmap[p.team] || { team: p.team, group: p.group, people: 0, total: 0, mech: { xfer: 0, ring: 0, fwd: 0, decl: 0 }, viaMainIvr: 0, missedVm: 0, weeks: {} };
    t.people++; t.total += p.total; Object.keys(p.mech).forEach(k => { t.mech[k] += p.mech[k]; }); t.viaMainIvr += p.viaMainIvr; t.missedVm += p.missedVm; Object.entries(p.weeks).forEach(([w, n]) => { t.weeks[w] = (t.weeks[w] || 0) + n; }); }
  const byTeam = Object.values(tmap).sort((a, b) => b.total - a.total);
  const queues = [['1501', 'Inbound VoIP Support', 'voipq'], ['1004', 'Sales', 'salesq']].map(([ext, name, k]) => { const L = rows.filter(r => r.path === k); return { ext, name, calls: L.length, missedVm: L.filter(isMissVm).length }; });
  // Fix list
  const last5 = lastBizDays(to, 5); const s5 = new Set(last5);
  const fixRows = {}; for (const r of await all(`SELECT * FROM cf_fix`)) fixRows[r.ext] = r;
  const fixList = [];
  for (const p of byPerson) {
    const L = persons.filter(r => r.origin_ext === p.ext); const in5 = L.filter(r => s5.has(r.date_ct)).length;
    const priority = in5 >= 5 || p.total >= 10 ? 'High' : in5 >= 1 ? 'Medium' : 'Low';
    const recs = [];
    if (p.mech.fwd) recs.push(`Call Handling & Forwarding: remove the forward / DND rule that sends calls to ext 1025${p.viaMainIvr ? ' (or the main number)' : ''}; set Do Not Disturb and after-hours to Send to Voicemail.`);
    if (p.mech.ring) recs.push('Unanswered calls: change forward to extension 1025 to Send to voicemail after the ring time.');
    if (p.mech.decl) recs.push('Declined or device offline: send to own voicemail, not 1025; check the desk phone / app stays signed in.');
    if (p.mech.xfer) recs.push('Coach: transfer to the owner or take a message instead of sending to CS.');
    const f = fixRows[p.ext] || {};
    let sinceFix = null;
    if (f.date_fixed) sinceFix = (await get(`SELECT COUNT(*) AS n FROM cf_calls WHERE path = 'person' AND origin_ext = ? AND date_ct >= ?`, [p.ext, f.date_fixed])).n;
    fixList.push({ ext: p.ext, name: p.name, team: p.team, rc_department: p.rc_department, total: p.total, last5: in5, mech: p.mech, viaMainIvr: p.viaMainIvr, priority, change: recs.join(' '), done: !!f.done, dateFixed: f.date_fixed || '', notes: f.notes || '', sinceFix });
  }
  const PR = { High: 0, Medium: 1, Low: 2 }; fixList.sort((a, b) => PR[a.priority] - PR[b.priority] || b.last5 - a.last5 || b.total - a.total);
  const fixQueues = [{ ext: '1501', name: 'Inbound VoIP Support', priority: 'High', calls: queues[0].calls, change: 'Queue overflow / max wait: send to VoIP voicemail or T2 VoIP, or add T1 seats at peak, instead of overflowing to 1025.' },
    { ext: '1004', name: 'Sales', priority: 'Low', calls: queues[1].calls, change: 'Queue overflow: send to Sales voicemail instead of 1025.' }];
  // Compare windows
  let A, B;
  if (aFrom && aTo && bFrom && bTo) { A = { from: aFrom, to: aTo }; B = { from: bFrom, to: bTo }; }
  else { const l5 = lastBizDays(to, 5), p5 = lastBizDays(addDays(l5[0], -1), 5); B = { from: l5[0], to: l5[4] }; A = { from: p5[0], to: p5[4] }; }
  const wRows = async (w) => { let L = await loadRange(w.from, w.to); if (weekdays) L = L.filter(r => isBiz(r.date_ct)); L.forEach(r => { if (r.path === 'person' && r.origin_ext) { const t = team(r.origin_ext); r.group = t.group; } }); return L; };
  const repeat = (L) => { const byNum = {}; let same = 0, afterMiss = 0; const sorted = L.slice().sort((x, y) => x.call_start_utc.localeCompare(y.call_start_utc));
    for (const r of sorted) { const n = digits(r.caller_number); if (!n) continue; const k = n + '|' + r.date_ct; const prev = byNum[k] || []; if (prev.length) { same++; if (prev.some(isMissVm)) afterMiss++; } prev.push(r); byNum[k] = prev; }
    return { unique: new Set(L.map(r => digits(r.caller_number)).filter(Boolean)).size, sameDay: same, afterMissVm: afterMiss }; };
  const metrics = (L) => { const o = { total: L.length }; pathKeys.forEach(k => { o[k] = L.filter(r => r.path === k).length; }); GROUP_ORDER.forEach(g => { o['via_' + g] = L.filter(r => r.path === 'person' && r.group === g).length; });
    o.answered = L.filter(r => r.result === 'Accepted').length; o.missed = L.filter(r => r.result === 'Missed').length; o.voicemail = L.filter(r => r.result === 'Voicemail').length; o.missRate = pct(o.missed + o.voicemail, L.length); Object.assign(o, repeat(L)); return o; };
  const [LA, LB] = [await wRows(A), await wRows(B)];
  const tk = async (f, t) => (await get(`SELECT COUNT(*) AS n FROM cf_tickets WHERE date_ct >= ? AND date_ct <= ?`, [f, t])).n;
  const cmpA = metrics(LA), cmpB = metrics(LB); cmpA.tickets = await tk(A.from, A.to); cmpB.tickets = await tk(B.from, B.to);
  const trendDays = daysBetween(A.from < B.from ? A.from : B.from, A.to > B.to ? A.to : B.to).filter(d => !weekdays || isBiz(d));
  const allW = LA.concat(LB.filter(r => !LA.includes(r)));
  const tkDay = {}; for (const r of await all(`SELECT date_ct, COUNT(*) AS n FROM cf_tickets WHERE date_ct >= ? AND date_ct <= ? GROUP BY date_ct`, [trendDays[0] || from, trendDays[trendDays.length - 1] || to])) tkDay[r.date_ct] = r.n;
  const trend = trendDays.map(d => { const L = allW.filter(r => r.date_ct === d); return { date: d, total: L.length, ivr: L.filter(r => r.path === 'ivr').length, viaPerson: L.filter(r => r.path === 'person').length, techCsm: L.filter(r => r.group === 'Tech CSM' && r.path === 'person').length, techOb: L.filter(r => r.group === 'Tech OB' && r.path === 'person').length, voipq: L.filter(r => r.path === 'voipq').length, missedVm: L.filter(isMissVm).length, tickets: tkDay[d] || 0 }; });
  // Why: ticket topics for earlier / prior / last windows
  const tks = await all(`SELECT date_ct, topic, spots FROM cf_tickets WHERE date_ct >= ? AND date_ct <= ?`, [from < A.from ? from : A.from, to > B.to ? to : B.to]);
  const inW = (d, w) => d >= w.from && d <= w.to;
  const topicNames = TOPICS.map(t => t[0]).concat([TOPIC_OTHER]);
  const topics = topicNames.map(n => { const L = tks.filter(t => t.topic === n); const earlier = L.filter(t => t.date_ct >= from && t.date_ct < A.from).length, a = L.filter(t => inW(t.date_ct, A)).length, b = L.filter(t => inW(t.date_ct, B)).length;
    return { topic: n, earlier, prior: a, last: b, change: b - a, changePct: a ? Math.round((b - a) / a * 1000) / 10 : null }; }).sort((x, y) => (y.prior + y.last) - (x.prior + x.last));
  const spotDays = trendDays.map(d => { const L = tks.filter(t => t.date_ct === d); const o = { date: d }; SPOT.forEach(([n]) => { o[n] = L.filter(t => (t.spots || '').includes(n)).length; }); return o; });
  const sign = (n) => (n > 0 ? '+' : '') + n;
  const chg = (a, b) => a ? ` (${sign(Math.round((b - a) / a * 100))}%)` : '';
  const rising = topics.filter(t => t.change > 0).sort((x, y) => y.change - x.change).slice(0, 3);
  const summary = [
    `Calls to 1025 went from ${cmpA.total} to ${cmpB.total}${chg(cmpA.total, cmpB.total)} (${A.from} to ${A.to} vs ${B.from} to ${B.to}).`,
    `Via a person ${sign(cmpB.person - cmpA.person)}, VoIP queue ${sign(cmpB.voipq - cmpA.voipq)}, straight from IVR ${sign(cmpB.ivr - cmpA.ivr)}.`,
    `Same-day repeat calls went from ${cmpA.sameDay} to ${cmpB.sameDay}; repeats after a missed or voicemail call went from ${cmpA.afterMissVm} to ${cmpB.afterMissVm}.`,
    `Missed plus voicemail rate went from ${cmpA.missRate}% to ${cmpB.missRate}%.`,
    rising.length ? `Top rising ticket topics: ${rising.map(t => `${t.topic} (${t.prior} to ${t.last})`).join(', ')}.` : '',
    fixList.filter(f => f.priority === 'High' && !f.done).length ? `People to fix first: ${fixList.filter(f => f.priority === 'High' && !f.done).slice(0, 5).map(f => `${f.name} (${f.last5} in the last 5 business days)`).join(', ')}.` : '',
  ].filter(Boolean);
  // Roster
  const roster = await rosterPlan(rows, from, to, P, cfg.roster);
  const lastSync = await getSetting('lastSync', null), ticketsAt = await getSetting('ticketsAt', null);
  const detail = rows.map(r => ({ ...r, caller_number: manager ? r.caller_number : (r.caller_number ? '***' + digits(r.caller_number).slice(-4) : ''), pathLabel: PATHS[r.path], mechLabel: r.mechanism ? MECH[r.mechanism] : '' }));
  return { range: { from, to, weekdays, days: days.length, bizDays: days.filter(isBiz).length }, total: rows.length, byPath, weekly, mechanisms, viaPerson: persons.length, viaMainIvr, daywise, groups: GROUP_ORDER,
    byPerson, weekKeys, byTeam, queues, fixList, fixQueues, compare: { A, B, a: cmpA, b: cmpB, trend }, why: { topics, spotDays, spotNames: SPOT.map(s => s[0]), summary, ticketsAt },
    roster, detail, lastSync, paths: PATHS, mechs: MECH, params: P, limits: DATA_LIMITS };
}
const DATA_LIMITS = ['RingCentral call legs in AditKB (shiv_rc_call_json) stopped syncing on 8 Sep 2026; this page reads RingCentral directly and from uploaded exports instead.',
  'Call transcripts in AditKB (shiv_rc_call_transcripts) have nothing after 25 Aug 2026, so T1 ticket topics stand in for call reasons.',
  'Caller phone numbers are never joined to AditKB (personal data is capped there); repeat callers are counted from the RingCentral numbers only.'];

async function rosterPlan(rows, from, to, P, roster) {
  const H = []; for (let h = P.hourFrom; h <= P.hourTo; h++) H.push(h);
  const wdays = new Set(rows.filter(r => isBiz(r.date_ct)).map(r => r.date_ct)).size || 1;
  const perHour = H.map(h => rows.filter(r => isBiz(r.date_ct) && r.hour_ct === h).length / wdays);
  const ans = rows.filter(r => r.result === 'Accepted' && r.talk_sec > 0);
  const talk = ans.length ? ans.reduce((a, r) => a + r.talk_sec, 0) / ans.length : 600;
  const aht = talk + P.wrapMin * 60;
  const need = perHour.map(c => agentsNeeded(c * P.busyMult, aht, { sl: P.sl, t: P.answerSec, maxOcc: P.maxOcc }));
  const calls = roster.filter(a => a.active && (a.wing || 'Calls') === 'Calls');
  const onFloor = (h, which) => calls.filter(a => { const s = which === 'p' && a.prop_start_h != null ? a.prop_start_h : a.start_h; const b = which === 'p' && a.prop_break_h != null ? a.prop_break_h : a.break_h; return s != null && h >= s && h < s + (a.len_h || 9) && Math.floor(h) !== Math.floor(b); }).length;
  const cur = H.map(h => onFloor(h, 'c')), prop = H.map(h => onFloor(h, 'p'));
  const short = (arr) => arr.reduce((s, v, i) => s + Math.max(0, need[i] - v), 0);
  const grid = (which) => calls.map(a => { const s = which === 'p' && a.prop_start_h != null ? a.prop_start_h : a.start_h; const b = which === 'p' && a.prop_break_h != null ? a.prop_break_h : a.break_h; return { name: a.name, cells: H.map(h => (s != null && h >= s && h < s + (a.len_h || 9)) ? (Math.floor(h) === Math.floor(b) ? 'B' : 'W') : '') }; });
  // Warnings
  const warnings = [];
  const last5 = new Set(lastBizDays(to, 5));
  for (const a of calls) {
    const mine = rows.filter(r => r.result === 'Accepted' && ((a.ext && r.answered_ext === a.ext) || (r.answered_by && r.answered_by.toLowerCase() === a.name.toLowerCase())));
    const recent = mine.filter(r => last5.has(r.date_ct)).length;
    const lastAns = mine.length ? mine[mine.length - 1].date_ct : null;
    if (!recent) warnings.push({ kind: 'idle', agent: a.name, text: `${a.name}: 0 answered 1025 calls in the last 5 business days${lastAns ? ' (last on ' + lastAns + ')' : ''}. Not taking calls: check leave / queue login.` });
  }
  for (const which of ['c', 'p']) {
    const br = {}; calls.forEach(a => { const b = which === 'p' && a.prop_break_h != null ? a.prop_break_h : a.break_h; if (b != null && b < 14) (br[Math.floor(b)] = br[Math.floor(b)] || []).push(a.name); });
    Object.entries(br).forEach(([h, n]) => { if (n.length > 1) warnings.push({ kind: 'break', which, text: `${which === 'p' ? 'Proposed' : 'Current'}: ${n.join(' and ')} both break at ${hourLabel(+h)} CT (before 2 PM, one break at a time).` }); });
  }
  H.forEach((h, i) => { if (cur[i] < need[i]) warnings.push({ kind: 'gap', which: 'c', text: `Current roster is ${need[i] - cur[i]} short at ${hourLabel(h)} CT.` }); });
  // Week with IST before/after the DST change in the selected week
  const ws = weekStart(to); const wk = daysBetween(ws, addDays(ws, 4));
  // The next US daylight saving change after the selected end date, found from the time zone database.
  const off = (d) => istFor(d, 7).offsetMin; let change = null;
  for (let k = 1; k <= 240; k++) if (off(addDays(to, k)) !== off(addDays(to, k - 1))) { change = addDays(to, k); break; }
  const span = (d, s, len) => { const e = s + len; return `${istFor(d, Math.floor(s), Math.round((s % 1) * 60)).label} to ${istFor(d, Math.floor(e) % 24, Math.round((e % 1) * 60)).label}`; };
  const week = calls.map(a => ({ name: a.name, ct: a.start_h != null ? `${hourLabel(a.start_h)} to ${hourLabel((a.start_h + (a.len_h || 9)) % 24)}` : '', breakCt: a.break_h != null ? hourLabel(a.break_h) : '',
    istUntil: a.start_h != null ? span(to, a.start_h, a.len_h || 9) : '', istAfter: a.start_h != null && change ? span(change, a.start_h, a.len_h || 9) : '',
    breakIstUntil: a.break_h != null ? istFor(to, Math.floor(a.break_h)).label : '', breakIstAfter: a.break_h != null && change ? istFor(change, Math.floor(a.break_h)).label : '' }));
  const now = off(to), after = change ? off(change) : null;
  const dstNote = { offsetNow: now, change, offsetAfter: after, text: `Central to IST is +${Math.floor(now / 60)}:${pad(now % 60)} on ${to}.` + (change ? ` From ${change} (US daylight saving change) it is +${Math.floor(after / 60)}:${pad(after % 60)}.` : '') };
  return { hours: H, hourLabels: H.map(hourLabel), istLabels: H.map(h => istFor(to, h).label), demand: perHour.map(x => Math.round(x * 10) / 10), busyDemand: perHour.map(x => Math.round(x * P.busyMult * 10) / 10),
    talkSec: Math.round(talk), ahtSec: Math.round(aht), need, current: cur, proposed: prop, gapCurrent: cur.map((v, i) => v - need[i]), gapProposed: prop.map((v, i) => v - need[i]), shortCurrent: short(cur), shortProposed: short(prop),
    gridCurrent: grid('c'), gridProposed: grid('p'), week: { dates: wk, rows: week }, dst: dstNote, warnings, weekdaysCounted: wdays,
    rules: ['One break at a time from 10 AM to 2 PM Central; set the RC queue status to "Do not accept queue calls" during breaks.', 'Phones only from 7 to 11 AM Central.',
      'After 3 PM Central, work voicemail and missed-call tickets (T1 cannot make outbound calls; call-backs go to VoIP per process).', 'At most 1 planned leave per day, preferably Thu or Fri.', 'No weekend shift (Saturday averages about 4 calls).'] };
}

// ── Digest and alert text ───────────────────────────────────────────────
async function digestText() {
  const y = addDays(ctDate(Date.now()), -1);
  const a = await analyse({ from: addDays(y, -29), to: y, manager: false });
  const L = a.daywise.find(d => d.date === y) || { total: 0, viaPerson: 0, missedVm: 0 };
  const top = (await all(`SELECT origin_ext, origin_name, COUNT(*) AS n FROM cf_calls WHERE path = 'person' AND date_ct = ? GROUP BY origin_ext ORDER BY n DESC LIMIT 5`, [y]));
  const fix = {}; a.fixList.forEach(f => { fix[f.ext] = f; });
  const ist = istFor(addDays(ctDate(Date.now()), 0), 19).label;
  return [`📞 1025 Call Flow, ${y}`, `Calls to 1025: ${L.total}. Via a person: ${pct(L.viaPerson, L.total)}% (${L.viaPerson}). Missed or voicemail: ${pct(L.missedVm, L.total)}% (${L.missedVm}).`,
    top.length ? 'Top people sending calls to CS:\n' + top.map(t => `• ${t.origin_name || t.origin_ext} (${t.origin_ext}): ${t.n}${fix[t.origin_ext] ? ', fix ' + (fix[t.origin_ext].done ? 'done ' + (fix[t.origin_ext].dateFixed || '') : 'not done, ' + fix[t.origin_ext].priority) : ''}`).join('\n') : 'No calls came via a person.',
    a.roster.warnings.length ? 'Roster warnings:\n' + a.roster.warnings.slice(0, 6).map(w => '• ' + w.text).join('\n') : 'No roster warnings.',
    `(Sent 7 PM Central, ${ist} IST.)`].join('\n');
}
async function checkSpike(nowMs = Date.now()) {
  const cfg = await config(); if (!cfg.alert.on) return null;
  const since = new Date(nowMs - 2 * 3600e3).toISOString();
  const L = await all(`SELECT path FROM cf_calls WHERE call_start_utc >= ?`, [since]);
  const per = L.filter(r => r.path === 'person').length; const share = pct(per, L.length);
  if (L.length < cfg.alert.minCalls || share <= cfg.alert.pct) return null;
  const last = await getSetting('lastSpikeAlert', 0); if (nowMs - last < 2 * 3600e3) return null;
  await setSetting('lastSpikeAlert', nowMs);
  return `⚠️ 1025: ${share}% of calls in the last 2 hours came via a person (${per} of ${L.length}), above the ${cfg.alert.pct}% line. Check the RC Fix List.`;
}

module.exports = { setDB, initSchema, config, getSetting, setSetting, importCSV, syncFromRC, refreshExtMap, refreshTickets, prune, analyse, digestText, checkSpike,
  // pure helpers for tests
  parseCSV, sessionsFromCSV, classify, keyFor, durSec, parseCT, zonedToUtc, istFor, ctDate, teamShort, erlangC, serviceLevel, agentsNeeded, topicOf, recordToRows, rosterPlan, PATHS, MECH, DEFAULT_GROUPS, TOPICS, SPOT };
