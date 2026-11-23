'use strict';
/**
 * Batch 382: calendar call status for the live floor (Adit Pay first).
 *   avoma   the person's Google Calendar meetings as Avoma has them (Desk and CRM data, refreshed every few minutes):
 *           the meeting they are in now and the next one today. Avoma syncs the calendar of everyone it records for,
 *           and Calendly bookings land on that calendar too. Recorded phone calls are left to RingCentral.
 *   scrin   scrin.io's apps for the last few minutes: a Google Meet, Zoom, Teams or similar window means a video call,
 *           even one that is not on the calendar. Only the app and window names are read, never the screenshots.
 * Email columns are never read back from Desk and CRM data: each organiser maps to a position in the list given.
 * Cached for a minute. Never throws: a source that fails leaves its part empty.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const kbq = (sql, n = 300) => (D.kbq || ((s, l) => require('./aditkb-service').query(s, l)))(sql, n).then((r) => (r && r.rows) || []);
const scrin = () => D.scrin || require('./scrin');
const sqlq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lc = (s) => String(s || '').trim().toLowerCase();

// Calendar blocks that are not calls (lunch, out of office, focus time) are left out.
const SKIP_RE = /\blunch\b|\bbreak\b|out of (the )?office|\booo\b|\bpto\b|\bleave\b|holiday|focus time|\bblock(ed)?\b|do not book|\bhold\b|personal|commute|birthday/i;
const INTERNAL_RE = /huddle|stand ?-?up|1:1|one on one|\bsync\b|team meeting|internal|interview|all hands|town ?hall|operations review|\bretro/i;
const WALK_RE = /walk ?-?through/i;
const TRAIN_RE = /training|onboard|kick ?-?off|configuration|go ?-?live|set ?-?up|retrain|webinar|call intelligence/i;
const DEMO_RE = /\bdemo|sign ?-?ups?\b|presentation|statement analysis|discovery|trial|negotiation/i;
const FOLLOW_RE = /follow ?-?up|call ?-?back|check ?-?in|\bsupport\b|feedback|not working|\bissue/i;
const CLIENT_RE = /account review|customer review|\bqbr\b|campaign planning|customer/i;
const TICKET_NUM = /#\s?(\d{5,})|ticket\s*#?\s*(\d{5,})/i;
/** The kind of call, told apart so the team can see what is coming: a Ticket call (the title names a ticket), a
 *  Walkthrough, Training, a Demo, a Follow-up, another Client call, or an Internal meeting. Avoma's own meeting type is
 *  read first, then the title. Anything not clear is just "Meeting". */
function kindOf(subject, purpose, meetingType) {
  const s = String(subject || '');
  if (TICKET_NUM.test(s)) return 'Ticket call';
  if (/^support\b/i.test(String(meetingType || ''))) return 'Ticket call'; // a scheduled support call
  for (const x of [meetingType, purpose, s]) {
    const t = String(x || ''); if (!t) continue;
    if (WALK_RE.test(t)) return 'Walkthrough';
    if (TRAIN_RE.test(t)) return 'Training';
    if (DEMO_RE.test(t)) return 'Demo';
    if (FOLLOW_RE.test(t)) return 'Follow-up';
    if (CLIENT_RE.test(t)) return 'Client call';
    if (INTERNAL_RE.test(t)) return 'Internal';
  }
  return 'Meeting';
}
const ticketOf = (s) => ((String(s || '').match(TICKET_NUM) || []).slice(1).find(Boolean)) || null;
// A video call app or window in scrin.io.
const CALL_APP_RE = /google meet|meet\.google\.com|\bmeet - |zoom(\.us| meeting|\b)|microsoft teams|teams\.microsoft|webex|gotomeeting|goto meeting|ringcentral video|\brcv\b|avoma|whereby|skype/i;
const CALL_APP_NAME = (s) => { const t = String(s); if (/meet/i.test(t) && /google|meet\.google|meet - /i.test(t)) return 'Google Meet'; if (/zoom/i.test(t)) return 'Zoom'; if (/teams/i.test(t)) return 'Microsoft Teams'; if (/webex/i.test(t)) return 'Webex';
  if (/goto/i.test(t)) return 'GoTo Meeting'; if (/ringcentral video|\brcv\b/i.test(t)) return 'RingCentral Video'; if (/avoma/i.test(t)) return 'Avoma'; return 'a video call app'; };

const cache = new Map(); // key -> { at, v }
const TTL = 60e3;

/** Avoma meetings today (Central) for these people: { email: { now, next, today } }. */
async function avoma(emails, now = Date.now()) {
  const list = emails.map(lc).filter((e) => /^[^@\s']+@[^@\s']+$/.test(e));
  if (!list.length) return {};
  const pos = list.map((e, i) => `WHEN lower(organizer_email) = ${sqlq(e)} THEN ${i}`).join(' ');
  const sql = `SELECT CASE ${pos} END AS who, subject, purpose, meeting_type, state, start_at, end_at, duration_seconds
    FROM shiv_avoma_meetings
    WHERE lower(organizer_email) IN (${list.map(sqlq).join(',')})
      AND is_call = false
      AND coalesce(state, '') NOT IN ('cancelled', 'canceled', 'deleted')
      AND start_at >= now() - interval '6 hours'
      AND start_at < ((now() AT TIME ZONE 'America/Chicago')::date + 1)::timestamp AT TIME ZONE 'America/Chicago'
    ORDER BY start_at LIMIT 400`;
  const rows = await kbq(sql, 400);
  const out = {};
  for (const r of rows) {
    const who = list[Number(r.who)]; if (!who) continue;
    if (SKIP_RE.test(String(r.subject || ''))) continue;
    const start = Date.parse(r.start_at); if (isNaN(start)) continue;
    let end = r.end_at ? Date.parse(r.end_at) : NaN;
    if (isNaN(end) || end <= start) end = start + (Number(r.duration_seconds) > 0 ? Number(r.duration_seconds) * 1000 : 30 * 60e3);
    const kind = kindOf(r.subject, r.purpose, r.meeting_type);
    const m = { kind, ticket: kind === 'Ticket call' ? ticketOf(r.subject) : null, title: String(r.subject || '').slice(0, 120), start: new Date(start).toISOString(), end: new Date(end).toISOString(), source: 'avoma' };
    const o = out[who] || (out[who] = { now: null, next: null, today: 0, list: [] });
    o.today++;
    // What is still to come today (and the one in progress), in order, so the card can show each kind apart.
    if (end > now && o.list.length < 14) o.list.push(m);
    if (start <= now && now < end) { if (!o.now || start > Date.parse(o.now.start)) o.now = m; }
    else if (start > now && !o.next) o.next = m;
  }
  return out;
}

let _scrinSample = null;
/** Strings in a scrin.io screenshot record that name the app or window (never image links). */
function appStrings(x, depth = 0, acc = []) {
  if (x == null || depth > 3 || acc.length > 40) return acc;
  if (typeof x === 'string') { if (!/^https?:\/\/\S+\.(jpe?g|png|webp)(\?|$)/i.test(x)) acc.push(x.slice(0, 200)); return acc; }
  if (Array.isArray(x)) { x.slice(0, 20).forEach((v) => appStrings(v, depth + 1, acc)); return acc; }
  if (typeof x === 'object') for (const k of Object.keys(x)) { if (/image|thumb|screenshot(url)?$|^url$|^id$/i.test(k)) continue; appStrings(x[k], depth + 1, acc); }
  return acc;
}
/** scrin.io: who has a video call app open in the last few minutes. { email: { app, at } } */
async function scrinCalls(emails, now = Date.now()) {
  const s = scrin(); if (!s.configured || !s.configured()) return {};
  const want = new Set(emails.map(lc));
  const r = await s.people();
  const ps = (r.people || []).filter((p) => p.roster && p.id && (want.has(lc(p.email)) || want.has(lc(p.roster.email))));
  if (!ps.length) return {};
  const to = Math.floor(now / 1000), from = to - 8 * 60;
  const raw = await s._call('GetScreenshots', ps.map((p) => ({ employmentId: p.id, from, to })));
  const list = Array.isArray(raw) ? raw : (raw && (raw.screenshots || raw.data || raw.items)) || [];
  if (list[0]) _scrinSample = Object.keys(list[0]).join(',');
  const byId = new Map(ps.map((p) => [String(p.id), p]));
  const out = {};
  for (const shot of list) {
    const p = byId.get(String(shot.employmentId || shot.employment_id || shot.employmentID || '')); if (!p) continue;
    const hit = appStrings(shot).find((t) => CALL_APP_RE.test(t)); if (!hit) continue;
    const ts = Number(shot.from || shot.taken || shot.time || shot.timestamp || shot.date || 0); const at = ts ? new Date(ts > 1e12 ? ts : ts * 1000).toISOString() : null;
    const v = { app: CALL_APP_NAME(hit), at };
    for (const em of [lc(p.email), lc(p.roster.email)]) if (em && (!out[em] || (at && at > (out[em].at || '')))) out[em] = v;
  }
  return out;
}

/** Calendar call status for these people. { data: { email: { now, next, today, video } }, avomaError, scrinError } */
async function forEmails(emails, { scrinOn = true } = {}) {
  const list = [...new Set((emails || []).map(lc).filter(Boolean))].sort();
  const key = list.join(',') + '|' + (scrinOn ? 1 : 0);
  const hit = cache.get(key); if (hit && Date.now() - hit.at < TTL) return hit.v;
  const [av, sc] = await Promise.all([
    avoma(list).then((v) => ({ v })).catch((e) => ({ v: {}, err: String(e.message || e).slice(0, 160) })),
    scrinOn ? scrinCalls(list).then((v) => ({ v })).catch((e) => ({ v: {}, err: String(e.message || e).slice(0, 160) })) : Promise.resolve({ v: {} })]);
  const data = {};
  for (const em of list) {
    const a = av.v[em] || null, s = sc.v[em] || null;
    if (a || s) data[em] = { now: a ? a.now : null, next: a ? a.next : null, today: a ? a.today : 0, list: a ? a.list : [], video: s };
  }
  const v = { data, avomaError: av.err || null, scrinError: sc.err || null, at: new Date().toISOString() };
  cache.set(key, { at: Date.now(), v }); if (cache.size > 20) cache.delete(cache.keys().next().value);
  return v;
}
/** email -> true when the person is in a calendar meeting right now (Avoma only, for the scrin.io auto aux). */
async function inMeetingNow(emails) {
  const r = await forEmails(emails, { scrinOn: false }).catch(() => ({ data: {} }));
  const out = {}; for (const [em, x] of Object.entries(r.data || {})) if (x.now) out[em] = x.now.kind; return out;
}
module.exports = { SKIP_RE, setDeps, forEmails, inMeetingNow, scrinSample: () => _scrinSample, _kindOf: kindOf, _appStrings: appStrings, CALL_APP_RE };
