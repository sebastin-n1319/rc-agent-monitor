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
const MIN_CALL_SEC = Number(process.env.ADITPAY_SESSION_MIN_SEC || 600);
const sqlq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const KIND = (purpose, isCall) => {
  const p = String(purpose || '');
  if (/training|walkthrough|walk-through|onboard/i.test(p)) return 'training';
  if (/demo|sign ?up/i.test(p)) return 'demo';
  if (!isCall) return 'meeting'; // a calendar meeting Avoma has not tagged yet
  return null; // a recorded support or follow-up call is a call, not a session
};

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
    const kind = KIND(r.purpose, onCall);
    if (!kind) continue;
    // a recorded call tagged training or demo counts as a session only when it ran 10 minutes or more (short calls
    // are often tagged that way too); calendar meetings count as booked
    if (onCall && Number(r.duration_seconds || 0) < MIN_CALL_SEC) continue;
    const o = out[email] || (out[email] = { training: 0, demo: 0, meeting: 0, total: 0, list: [] });
    o[kind]++; o.total++;
    o.list.push({ kind, title: String(r.subject || '').slice(0, 120), practice: String(r.account_name || '').slice(0, 80), at: r.start_at, minutes: r.duration_seconds ? Math.round(Number(r.duration_seconds) / 60) : null, onCall: r.is_call === true || r.is_call === 't', state: r.state || '' });
  }
  return out;
}

/** The Chat post they write by hand, from one person's numbers. */
function chatText(p) {
  const c = p.calls || {}, t = p.tickets || {}, s = p.sessions || {};
  return [`*${p.name}*`, `📲 Calls handled: ${c.total ?? 0}`, `• Incoming calls: ${c.inbound ?? 0}`, `• Outgoing calls: ${c.outbound ?? 0}`, '',
    '🎓 Demos / Training', `• Sessions conducted: ${s.total || 0}`, '',
    `🎫 Tickets: ${(t.new || 0) + (t.followup || 0)}`, `• New tickets handled: ${t.new || 0}`, `• Existing ticket follow-ups: ${t.followup || 0}`].join('\n');
}

module.exports = { setDeps, sessions, chatText, _kind: KIND, MIN_CALL_SEC };
