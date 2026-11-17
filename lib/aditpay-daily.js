'use strict';
/**
 * Batch 362: the Adit Pay team's daily report, the same numbers they post in Google Chat each day:
 *   calls      incoming and outgoing (RingCentral, the tool's own call log)
 *   sessions   demos, trainings and walkthroughs: Avoma meetings the person organised that day. Avoma records their
 *              Google Calendar meetings (Calendly bookings land there too) and their recorded RingCentral calls, and
 *              tags each with a purpose (Adit Pay Training / Walkthrough, Adit Pay Demo/Signups, ...).
 *   tickets    new tickets handled and follow-ups on existing tickets (Ticket Lifecycle)
 * Email columns are never read back: the query maps each organiser to a position in the list it was given.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const kbq = (sql, n = 500) => (D.kbq || ((s, l) => require('./aditkb-service').query(s, l)))(sql, n).then((r) => (r && r.rows) || []);
const MIN_CALL_SEC = Number(process.env.ADITPAY_SESSION_MIN_SEC || 1800); // Batch 371: was 10 minutes
const sqlq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Batch 371: a session is a demo or a training. Calls and meetings agents book for themselves to follow up on a ticket
// (a ticket number, "follow up", "call back", server access, an issue) are work on that ticket, not sessions, and
// Avoma's auto purpose is not trusted on its own for those. The subject decides first, then Avoma's purpose.
const TRAIN_RE = /training|walk ?-?through|onboard|set ?-?up|go ?-?live|webinar|retrain/i;
const DEMO_RE = /\bdemo|sign ?-?ups?\b|presentation|statement analysis/i;
const FOLLOW_RE = /#\s?\d{5,}|\bticket\b|follow ?-?up|call ?-?back|\bre:|server access|\bissue|\berror|not working|support/i;
const KIND = (purpose, isCall, subject) => {
  const sub = String(subject || ''), p = String(purpose || '');
  if (DEMO_RE.test(sub)) return 'demo';
  if (TRAIN_RE.test(sub)) return 'training';
  if (FOLLOW_RE.test(sub)) return null; // a ticket follow-up the agent booked for themselves
  if (/demo|sign ?up/i.test(p)) return 'demo';
  if (/training|walkthrough|walk-through|onboard/i.test(p)) return 'training';
  return null; // an untagged meeting or a support call is not a session
};
const WHY_NOT = (r, onCall) => FOLLOW_RE.test(String(r.subject || '')) ? 'ticket follow-up' : onCall ? 'phone call, not a booked session' : 'not a demo or training';

/** Sessions per person for one Central-time day. emails: the people to count, in order. */
async function sessions(day, emails) {
  const list = (emails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean);
  if (!list.length || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return {};
  const pos = list.map((e, i) => `WHEN lower(organizer_email) = ${sqlq(e)} THEN ${i}`).join(' ');
  const sql = `SELECT CASE ${pos} END AS who, subject, purpose, is_call, state, start_at, duration_seconds, account_name
    FROM shiv_avoma_meetings
    WHERE start_at >= (${sqlq(day)}::date)::timestamp AT TIME ZONE 'America/Chicago'
      AND start_at < ((${sqlq(day)}::date + 1)::timestamp AT TIME ZONE 'America/Chicago')
      AND lower(organizer_email) IN (${list.map(sqlq).join(',')})
      AND coalesce(state, '') NOT IN ('cancelled', 'canceled', 'deleted')
    ORDER BY start_at`;
  const rows = await kbq(sql, 500);
  const out = {};
  for (const r of rows) {
    const email = list[Number(r.who)]; if (!email) continue;
    const onCall = r.is_call === true || r.is_call === 't';
    const o = out[email] || (out[email] = { training: 0, demo: 0, meeting: 0, total: 0, list: [], skipped: [] });
    let kind = KIND(r.purpose, onCall, r.subject);
    // a recorded phone call counts only when it is clearly a session: tagged demo or training AND 30 minutes or more.
    // Shorter calls Avoma tags "training" are follow-ups and are already counted under calls.
    if (kind && onCall && Number(r.duration_seconds || 0) < MIN_CALL_SEC && !DEMO_RE.test(String(r.subject || '')) && !TRAIN_RE.test(String(r.subject || ''))) kind = null;
    if (!kind) { o.skipped.push({ title: String(r.subject || '').slice(0, 120), at: r.start_at, minutes: r.duration_seconds ? Math.round(Number(r.duration_seconds) / 60) : null, onCall, why: WHY_NOT(r, onCall) }); continue; }
    o[kind]++; o.total++;
    o.list.push({ kind, title: String(r.subject || '').slice(0, 120), practice: String(r.account_name || '').slice(0, 80), at: r.start_at, minutes: r.duration_seconds ? Math.round(Number(r.duration_seconds) / 60) : null, onCall: r.is_call === true || r.is_call === 't', state: r.state || '' });
  }
  return out;
}

/**
 * Batch 363: incoming calls split by where they came in: a call queue (Adit Pay, ext 9018, or another queue the person
 * is in) or straight to the person (their own direct number or extension, including clients calling back). Counts
 * answered calls the same way the tool's Inbound figure does. Outgoing calls, callbacks included, are dials the person made.
 * rows: call_logs rows (direction, result, duration, is_voicemail, queue_name) for one person and day.
 */
const ANSWERED = (r) => !['missed', 'voicemail', 'abandoned', 'answered elsewhere'].includes(String(r.result || '').toLowerCase()) && !Number(r.is_voicemail || 0) && Number(r.duration || 0) > 0;
function splitCalls(rows, agentName) {
  const own = String(agentName || '').toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const out = { queue: 0, direct: 0, byQueue: {}, missedQueue: 0, missedDirect: 0, outbound: 0 };
  for (const r of rows || []) {
    const dir = String(r.direction || '').toLowerCase();
    if (dir === 'outbound') { out.outbound++; continue; }
    if (dir !== 'inbound') continue;
    const qn = String(r.queue_name || '').trim(), ql = qn.toLowerCase();
    const direct = !qn || own.some((t) => ql.includes(t));
    if (!ANSWERED(r)) { if (['missed', 'abandoned'].includes(String(r.result || '').toLowerCase())) direct ? out.missedDirect++ : out.missedQueue++; continue; }
    if (direct) out.direct++;
    else { out.queue++; out.byQueue[qn] = (out.byQueue[qn] || 0) + 1; }
  }
  return out;
}

/** The Chat post they write by hand, from one person's numbers. */
function chatText(p) {
  const c = p.calls || {}, t = p.tickets || {}, s = p.sessions || {};
  const sp = c.split;
  return [`*${p.name}*`, `📲 Calls handled: ${c.total ?? 0}`, `• Incoming calls: ${c.inbound ?? 0}${sp ? ` (from the queue: ${sp.queue}, direct to my number or ext: ${sp.direct})` : ''}`, `• Outgoing calls (callbacks included): ${c.outbound ?? 0}`, '',
    '🎓 Demos / Training', `• Sessions conducted: ${s.total || 0}`, '',
    `🎫 Tickets: ${(t.new || 0) + (t.followup || 0)}`, `• New tickets handled: ${t.new || 0}`, `• Existing ticket follow-ups: ${t.followup || 0}`].join('\n');
}

module.exports = { setDeps, sessions, chatText, splitCalls, _kind: KIND, MIN_CALL_SEC };
