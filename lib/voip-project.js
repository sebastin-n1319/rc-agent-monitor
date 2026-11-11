'use strict';
/**
 * Batch 250: T1 CS VoIP. Replaces the old "AI & VoIP" tab, built again from scratch for VoIP first.
 *
 * Which tickets: every Zoho Desk ticket a T1 agent handled (owned it, created it or wrote on it) that is about the
 * Adit phone service. A ticket counts as VoIP when the agent set Classification to "VoIP Support", or when AI reads
 * the whole conversation and finds it is a VoIP query.
 *
 * What happened: from the owner history, each ticket is closed by T1, still with T1, or transferred (to which
 * department, and whether it came back). For every transferred ticket AI checks the conversation against the T1
 * VoIP support guide: was the basic support done first, which steps were missing, was the transfer right, and was
 * the hand-over note complete. Each ticket is read once and read again only when it changes in Zoho.
 *
 * The page compares the chosen range with the same number of days just before it, so the go-live range
 * (12 Oct 2026 to today) is set against the weeks before T1 took basic VoIP support.
 */
const crypto = require('crypto');
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n = 300) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

const GO_LIVE = '2026-10-12';
const TZ = 'America/Chicago';

// ── Issue categories ────────────────────────────────────────────────────────
// Batch 253: built from the query library in the T1 VoIP guide (Part 2: the queries clients raised with the Phones
// team and how each was fixed), so every ticket lands in a named issue and there is no catch-all "Other".
// expected: t1 = T1 resolves it; t1_first = T1 does the basic checks and hands over only when they fail;
// team = the VoIP team owns it, T1 collects the details and hands over.
const CATS = {
  hours_greetings: ['Business hours, holidays, greetings and call override', 't1'],
  menus_routing: ['Phone menus, forwarding and call routing', 't1'],
  voicemail: ['Voicemail boxes, access and notifications', 't1'],
  app_softphone: ['Adit app, softphone and call pop', 't1'],
  labels_users: ['Phone labels, users, lines and permissions', 't1'],
  recordings: ['Call tracking, recordings and call history', 't1'],
  training: ['How-to and training on the phone system', 't1'],
  not_ringing: ['Phones not ringing or calls going to voicemail', 't1_first'],
  desk_offline: ['Desk phone offline, No Account or frozen', 't1_first'],
  cordless: ['Cordless phones and base stations', 't1_first'],
  park_transfer: ['Call park, transfers and hold', 't1_first'],
  audio: ['Audio quality, one-way audio and dropped calls', 't1_first'],
  efax: ['eFax sending and receiving', 't1_first'],
  outbound_outage: ['Outbound calling, carrier problems and outages', 'team'],
  callerid_spam: ['Caller ID, spam flags and caller name', 'team'],
  time_keys: ['Phone time, speed dials and line keys', 'team'],
  orders_returns: ['New phones, headsets, returns and installs', 'team'],
  numbers_porting: ['Porting and new or tracking numbers', 'team'],
  callback: ['Client needs a call back (T1 cannot call out)', 'team'],
};
// Categories used before Batch 253, for reads that have not been sorted again yet.
const OLD_CAT = { callflow: 'hours_greetings', lines: 'labels_users', voicemail: 'voicemail', app: 'app_softphone', tracking: 'recordings', efax: 'efax', notringing: 'not_ringing',
  offline: 'desk_offline', park: 'park_transfer', audio: 'audio', callerid: 'callerid_spam', outbound: 'outbound_outage', hardware: 'orders_returns', porting: 'numbers_porting', callback: 'callback' };
const CAT_VERSION = 2;
const EXPECTED_LABEL = { t1: 'T1 resolves', t1_first: 'T1 checks first', team: 'VoIP team' };

const GUIDE = `T1 CS VOIP SUPPORT GUIDE (basic VoIP support moved to T1 on 12 Oct 2026).
T1 resolves when the fix is on the client's side or in the Adit app: power cycles, cables and Wi-Fi, base station restarts, DND, call override, call flow and schedule changes, voicemail greetings, app log-outs and notification settings, user and line clean-up, eFax file size or access, and how-to questions.
Basic steps by issue:
- hours_greetings, menus_routing: understand which hours or branch, screenshot the current flow into the ticket, change it, click Update, place a test call, confirm with the client.
- labels_users: Lines / Prefixes, edit the label or user, ask the client to reboot that phone. Roles: an owner raises a staff user's role.
- voicemail: check a voicemail box is assigned to the extension and the greeting is set; voicemails not loading in the app: log out and in. Extra box on V2 or V3, or a message light that stays on, goes to VoIP.
- app_softphone: log out and in, notification settings, softphone setup, the right extension.
- recordings: show where calls and recordings are in Call Tracking, check both recording toggles. Missing recording with both toggles on goes to VoIP.
- training: walk the client through the setting or share the Help Center article.
- not_ringing: call override off, phones online, not on DND, call flow and schedule right for the time, test call. Only then VoIP.
- desk_offline: identify model, extension, what the screen says; check power, cable or Wi-Fi, reboot. Still No Account or not registered, or several phones down: VoIP.
- cordless: reboot the base and handset, check the base lights, re-pair the handset. Base offline or still not subscribed: VoIP.
- park_transfer: check the right key is used, reboot the phone. Park or transfers failing on several phones or locations: VoIP.
- audio: collect two or three examples (time, number, extension), one phone or all, wired or Wi-Fi, time of day. Then VoIP with the examples.
- efax: read the failure reason on the fax in Call Tracking, resend, compress the PDF, check the "send incoming faxes to" email. Failures repeating across numbers over days go to VoIP with examples.
- outbound_outage, callerid_spam, time_keys, orders_returns, numbers_porting: owned by the VoIP team. T1 collects the details and hands over; no basic fix is expected.
- callback: T1 CS does not make outbound calls. When a client needs a call back, sending the ticket to VoIP is a correct transfer. Exception: a T1 agent may call back to fix something they missed on their own end or in their own investigation.
Hand-over note should include: extension numbers, phone model, what the screen says, when it started, one phone or all, what T1 already checked, a screenshot of the call flow before any change, and the best callback contact.`;

// The VoIP Support agents (Phones team), as named on Zoho Desk tickets.
const PHONES_TEAM = new Set(['kenny wallace', 'linet young', 'percy graham', 'talia adams', 'harvey t', 'paul mason', 'claire summers', 'chloe finn', 'simon s', 'riley sanders', 'omar l', 'bruce merrick', 'jay adesara', 'samantha shine', 'abhishek desai']);

/** A Zoho team or role name -> the department shown on the page. */
function deptOf(name) {
  const t = String(name || '').trim();
  if (!t) return null;
  if (/^t1 - voip csm$|^voip support$|voip csm/i.test(t)) return 'VoIP Support';
  if (/voip bops/i.test(t)) return 'VoIP BOPS';
  if (/voip assets/i.test(t)) return 'VoIP Assets';
  if (/voip ob|voip onboard/i.test(t)) return 'VoIP Onboarding';
  if (/t3 - voip/i.test(t)) return 'VoIP Engineering';
  if (/porting/i.test(t)) return 'Porting';
  if (/^t1\b|customer support|^t1 support$/i.test(t)) return 'T1';
  if (/tech\s*ob|onboarding/i.test(t)) return 'Tech Onboarding';
  if (/tech csm|dso tech/i.test(t)) return 'Tech CSM';
  if (/mktg|mark csm|marketing csm|dso mark/i.test(t)) return 'Marketing CSM';
  if (/dso csm|^pod dso/i.test(t)) return 'DSO CSM';
  if (/escalation/i.test(t)) return 'Escalation Manager';
  if (/^t3\b|engineering|^dev/i.test(t)) return 'Engineering';
  let m = t.match(/^t2\s*-\s*(.+)$/i); if (m) return m[1].trim();
  if (/rcm/i.test(t)) return 'RCM Support';
  if (/adit pay/i.test(t)) return 'Adit Pay';
  if (/billing/i.test(t)) return 'Billing';
  if (/server install/i.test(t)) return 'Server Installs';
  if (/t2 support/i.test(t)) return 'T2 Support';
  if (/pod|csm/i.test(t)) return 'CSM pods';
  if (/^(ceo|manager|others|unknown|team)$/i.test(t)) return null;
  return t;
}
const isVoipDept = (d) => /^voip|^porting$/i.test(String(d || ''));
function chan(c) { const s = lc(c); return s === 'phone' ? 'call' : s === 'chat' ? 'chat' : 'email'; }

// ── Reading tickets from the Zoho Desk mirror ───────────────────────────────
const VOIP_TEXT = "voip|phone|fax|voicemail|caller id|call flow|call forward|call routing|call park|audio|dropped call|softphone|cordless|ringing|extension|call quality|call tracking|recording|spam call|yealink|grandstream|hold music|override";
const COLS = `id, ticket_number, subject, status, status_type, channel, j_team_name AS team, owner_team_name AS owner_team, coalesce(assignee_name, owner_user_name) AS assignee,
  j_assignee_id AS assignee_id, j_created_by AS created_by, j_classification AS cls, cf_adit_app_module AS module, cf_ai_category_by_llm AS llm, cf_owner_change_log AS log,
  cf_reopen_count AS reopen, created_time, closed_time, modified_time, web_url, cf_ticket_type AS ttype, cf_parent_ticket_id AS parent`;
const sqlq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
async function kbq(sql, limit) {
  let last = null;
  for (let a = 0; a < 3; a++) {
    try { return await D.aditkb.query(sql, limit); }
    catch (e) { last = e; if (!/too many connections|timeout|HTTP 5\d\d|HTTP 429|ECONNRESET|fetch failed/i.test(e.message)) break; await new Promise((r) => setTimeout(r, 1500 * (a + 1))); }
  }
  throw last;
}
// Batch 262: AditKB caps a result at 25 rows when it carries personal data (a phone number in a subject is enough),
// so wide reads take the ticket ids first (no free text) and then the full rows 20 at a time.
/** One read. AditKB caps a result it treats as personal data at 25 rows and asks callers not to page around it,
 *  so a capped read is logged and kept as it is; the queries below avoid filters that set the cap off. */
async function rowsFull(where, limit) {
  const r = await kbq(`SELECT ${COLS} FROM desk_tickets WHERE ${where}`, limit);
  if (r.withheld) { console.warn(`voip-project: AditKB capped a read (${r.withheld} rows held back)`); }
  return r.rows || [];
}
let _people = { at: 0, map: new Map() };
/** Person -> the Zoho team they most often own tickets under (last 120 days). */
async function personTeams() {
  if (Date.now() - _people.at < 6 * 3600e3 && _people.map.size) return _people.map;
  const map = new Map(), best = new Map();
  try {
    const r = await kbq(`SELECT coalesce(assignee_name, owner_user_name) AS n, j_team_name AS t, count(*) AS c FROM desk_tickets
      WHERE created_time >= now() - interval '120 days' AND j_team_name IS NOT NULL AND coalesce(assignee_name, owner_user_name) IS NOT NULL GROUP BY 1, 2`, 20000);
    for (const x of r.rows || []) { const k = lc(x.n), c = Number(x.c) || 0; if (!best.has(k) || best.get(k) < c) { best.set(k, c); map.set(k, x.t); } }
  } catch (e) { console.warn('voip-project: person teams:', e.message); }
  _people = { at: Date.now(), map };
  return map;
}

async function t1Context() {
  const roster = await D.roster();
  const names = [...new Set(Object.values(roster.agentNames || {}).map((n) => String(n || '').trim()).filter(Boolean))];
  const nameSet = new Set(names.map(lc));
  const emailByName = new Map(Object.entries(roster.agentNames || {}).map(([e, n]) => [lc(n), lc(e)]));
  const nameById = D.deskLifecycle ? await D.deskLifecycle.agentNameById().catch(() => new Map()) : new Map();
  const ids = [...nameById.entries()].filter(([, n]) => nameSet.has(lc(n))).map(([id]) => String(id).replace(/\D/g, '')).filter(Boolean);
  return { names, nameSet, emailByName, nameById, ids, emails: Object.keys(roster.agentNames || {}).map(lc) };
}

function ctxFor(T, pTeam) {
  const nameByEmail = new Map(); for (const n of T.names) { const e = T.emailByName.get(lc(n)); if (e) nameByEmail.set(e, n); }
  return { nameSet: T.nameSet, nameById: T.nameById, pTeam, nameByEmail };
}
const _rows = new Map();
/** T1-handled tickets that could be VoIP, created in [start, end). Cached 2 minutes (6 hours for past windows). */
function fetchRows(start, end, T) {
  const live = Date.now() - Date.parse(end) < 3600e3;
  const key = start + '|' + (live ? Math.floor(Date.parse(end) / 120e3) : end);
  const hit = _rows.get(key);
  if (hit && Date.now() - hit.at < (live ? 120e3 : 6 * 3600e3)) return hit.p;
  const p = fetchRowsLive(start, end, T).catch((e) => { _rows.delete(key); throw e; });
  _rows.set(key, { at: Date.now(), p });
  if (_rows.size > 30) _rows.delete(_rows.keys().next().value);
  return p;
}
async function fetchRowsLive(start, end, T) {
  const when = `created_time >= ${sqlq(start)} AND created_time < ${sqlq(end)} AND coalesce(is_deleted, false) = false AND coalesce(is_spam, false) = false`;
  const nameRe = T.names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const idList = T.ids.map(sqlq).join(',');
  const t1 = `(j_team_name ILIKE '%customer support%' OR owner_team_name ILIKE '%customer support%' OR cf_owner_change_log ILIKE '%Role : T1 Support%'`
    + (nameRe ? ` OR cf_owner_change_log ~* ${sqlq('Owner changed to (' + nameRe + ') on')}` : '')
    + (idList ? ` OR j_assignee_id IN (${idList}) OR j_created_by IN (${idList})` : '') + ')';
  const voip = `(cf_ticket_type = 'Outage' OR j_classification = 'VoIP Support' OR j_team_name ~* 'voip|porting' OR owner_team_name ~* 'voip' OR cf_owner_change_log ~* 'Role : (VoIP Support|Porting)'
    OR cf_adit_app_module ~* 'voice|e-?fax|call tracking' OR cf_ai_category_by_llm ~* ${sqlq(VOIP_TEXT)} OR subject ~* ${sqlq(VOIP_TEXT)})`;
  const rows = (await rowsFull(`${when} AND ${t1} AND ${voip}`, 20000)).map(norm);
  // Tickets a T1 agent wrote on (a note or a reply) but never owned: raised straight into another team's queue.
  try {
    if (T.emails.length) {
      const have = new Set(rows.map((x) => x.id));
      const acts = await all(`SELECT ticket_id, author_email FROM desk_ticket_activity WHERE source IN ('thread','comment') AND author_email IN (${T.emails.map(() => '?').join(',')}) AND created_time >= ? AND created_time < ?`,
        [...T.emails, start, new Date(Date.parse(end) + 30 * 864e5).toISOString()]);
      const hands = new Map();
      for (const a of acts) { const k = String(a.ticket_id); if (!hands.has(k)) hands.set(k, new Set()); hands.get(k).add(lc(a.author_email)); }
      for (const x of rows) if (hands.has(x.id)) x.hands = [...hands.get(x.id)];
      const extra = [...hands.keys()].filter((id) => !have.has(id) && /^\d+$/.test(id));
      for (let i = 0; i < extra.length; i += 300) {
        const e = await rowsFull(`id IN (${extra.slice(i, i + 300).map(sqlq).join(',')}) AND ${when} AND ${voip}`, 1000);
        for (const x of e) { const n = norm(x); n.hands = [...(hands.get(n.id) || [])]; rows.push(n); }
      }
    }
  } catch (e) { console.warn('voip-project: T1 notes on other teams\' tickets:', e.message); }
  return rows;
}
function norm(x) {
  return Object.assign({}, x, { id: String(x.id), ticket_number: String(x.ticket_number || ''), assignee_id: x.assignee_id != null ? String(x.assignee_id) : null,
    created_by: x.created_by != null ? String(x.created_by) : null, created_time: iso(x.created_time), closed_time: iso(x.closed_time), modified_time: iso(x.modified_time) });
}

/** Batch 259: every VoIP outage ticket at Adit in [start, end): Desk type Outage and VoIP by classification, team or
 *  owner. Outages of other products (for example app slowness) are left out. Cached 5 minutes. */
// Batch 260: an outage is one PARENT ticket with its CHILD tickets (the Adit house rule). Zoho's mirror keeps the
// Parent/Child mark but not the parent id on each child, so the children of a VoIP parent are the Child or Outage
// tickets created that day (Central time) that are VoIP. Desk type Outage tickets outside a parent's day count too.
// For 22 Oct 2026 this finds 90 tickets against the 92 in the VoIP team's outage report.
const VOIP_OWNED = `(j_classification = 'VoIP Support' OR j_team_name ~* 'voip' OR owner_team_name ~* 'voip' OR cf_owner_change_log ~* 'Role : VoIP Support')`;
const _outRows = new Map();
async function outageRows(start, end) {
  const k = start + '|' + Math.floor(Date.parse(end) / 300e3), hit = _outRows.get(k);
  if (hit && Date.now() - hit.at < 300e3) return hit.v;
  const base = `coalesce(is_deleted, false) = false AND coalesce(is_spam, false) = false`;
  let v = { rows: [], incidents: [] };
  try {
    const par = await kbq(`SELECT id, ticket_number, subject, created_time, web_url, j_child_ticket_count AS kids, status FROM desk_tickets WHERE created_time >= ${sqlq(start)} AND created_time < ${sqlq(end)} AND ${base}
      AND j_relationship_type = 'Parent' AND ${VOIP_OWNED}`, 200);
    const byId = new Map();
    const addRows = (rs) => { for (const x of rs || []) { const n = norm(x); if (!byId.has(n.id)) byId.set(n.id, n); } };
    const incidents = [];
    const days = new Map();
    for (const p of par.rows || []) { const d = new Date(p.created_time).toLocaleDateString('en-CA', { timeZone: TZ }); const cur = days.get(d); if (!cur || (Number(p.kids) || 0) > (Number(cur.kids) || 0)) days.set(d, p); }
    for (const p of days.values()) {
      const d = new Date(p.created_time).toLocaleDateString('en-CA', { timeZone: TZ });
      const w = D.dayWindow ? D.dayWindow(d, TZ) : { start: new Date(d + 'T05:00:00Z'), end: new Date(Date.parse(d + 'T05:00:00Z') + 864e5) };
      const m = { rows: await rowsFull(`created_time >= ${sqlq(new Date(w.start).toISOString())} AND created_time < ${sqlq(new Date(w.end).toISOString())} AND ${base}
        AND (cf_ticket_type = 'Outage' OR j_relationship_type IN ('Child', 'Parent')) AND ${VOIP_OWNED}`, 2000) };
      const ms = (m.rows || []).map(norm).filter((x) => x.id !== String(p.id)).concat([norm(Object.assign({}, p, { ticket_number: p.ticket_number }))]);
      const parentRow = (await kbq(`SELECT ${COLS} FROM desk_tickets WHERE id = ${sqlq(p.id)}`, 1)).rows || [];
      addRows(parentRow); addRows(m.rows);
      const times = (m.rows || []).map((x) => Date.parse(x.created_time)).filter(isFinite).sort((a, b) => a - b);
      incidents.push({ day: d, parent: String(p.ticket_number), parentUrl: p.web_url, subject: clean(p.subject, 160), linkedChildren: Number(p.kids) || 0, tickets: ms.length,
        first: times.length ? new Date(times[0]).toISOString() : null, last: times.length ? new Date(times[times.length - 1]).toISOString() : null, ids: ms.map((x) => x.id) });
    }
    const loose = { rows: await rowsFull(`created_time >= ${sqlq(start)} AND created_time < ${sqlq(end)} AND ${base} AND cf_ticket_type = 'Outage' AND ${VOIP_OWNED}`, 5000) };
    addRows(loose.rows);
    v = { rows: [...byId.values()], incidents: incidents.map((x) => Object.assign({}, x, { ids: undefined })) };
  } catch (e) { console.warn('voip-project: outage tickets:', e.message); }
  _outRows.set(k, { at: Date.now(), v });
  if (_outRows.size > 20) _outRows.delete(_outRows.keys().next().value);
  return v;
}
/** All VoIP tickets at Adit in [start, end) (any team), for the share T1 closed. */
const _company = new Map();
async function companyVoip(start, end) {
  const k = start + '|' + Math.floor(Date.parse(end) / 300e3), hit = _company.get(k);
  if (hit && Date.now() - hit.at < 300e3) return hit.v;
  let v = null;
  try {
    const r = await kbq(`SELECT count(*) AS total, count(*) FILTER (WHERE closed_time IS NOT NULL OR lower(status_type) = 'closed') AS closed FROM desk_tickets
      WHERE created_time >= ${sqlq(start)} AND created_time < ${sqlq(end)} AND coalesce(is_deleted, false) = false AND coalesce(is_spam, false) = false
      AND (j_classification = 'VoIP Support' OR j_team_name ~* 'voip' OR owner_team_name ~* 'voip')`, 5);
    const x = (r.rows || [])[0] || {}; v = { total: Number(x.total) || 0, closed: Number(x.closed) || 0 };
  } catch (e) { console.warn('voip-project: company VoIP count:', e.message); }
  _company.set(k, { at: Date.now(), v });
  if (_company.size > 20) _company.delete(_company.keys().next().value);
  return v;
}

// ── What happened to each ticket ────────────────────────────────────────────
/** -> { agent, outcome, dest, closedBy, closedDept, path } from the owner history. Pure, so it is tested directly. */
function trace(r, ctx) {
  const { nameSet, nameById, pTeam } = ctx;
  const chainAll = D.deskLifecycle ? D.deskLifecycle.effectiveOwnerChain({ owner_change_log: r.log, assignee_name: r.assignee, created_by_id: r.created_by }, { nameById, rosterNameSet: nameSet }).full : [];
  const personDept = (e) => {
    if (String(e.role || '').toLowerCase() === 'team') return deptOf(e.name) || 'Other';
    const n = lc(e.name);
    if (nameSet.has(n)) return 'T1';
    if (PHONES_TEAM.has(n)) return 'VoIP Support';
    return deptOf(pTeam.get(n)) || deptOf(e.role) || 'Other';
  };
  // Repeated hops to the same person collapse into one.
  const hops = [];
  for (const e of chainAll) { const d = personDept(e); const last = hops[hops.length - 1]; if (last && lc(last.name) === lc(e.name)) continue; hops.push({ name: e.name, dept: d, at: e.at || null }); }
  const finalTeam = deptOf(r.team) || deptOf(r.owner_team) || (hops.length ? hops[hops.length - 1].dept : null);
  const closed = lc(r.status_type) === 'closed' || !!r.closed_time;
  let firstT1 = hops.findIndex((h) => h.dept === 'T1');
  let agent = null, handOnly = false;
  if (firstT1 < 0) {
    // No T1 owner: a T1 agent wrote on it, or (Batch 259) a T1 agent created it straight into another team's queue with
    // no owner at all (common in outages: Zoho's owner log is then empty).
    const em = (r.hands || [])[0];
    const creator = r.created_by && nameById ? nameById.get(String(r.created_by)) : null;
    const nm = (em && ctx.nameByEmail ? ctx.nameByEmail.get(em) : null) || (creator && nameSet.has(lc(creator)) ? creator : null);
    if (!nm) return null;
    agent = nm; handOnly = true;
  }
  let leftIdx = -1;
  if (!handOnly) for (let i = firstT1 + 1; i < hops.length; i++) if (hops[i].dept !== 'T1' && hops[i].dept !== 'Other') { leftIdx = i; break; }
  if (!handOnly) { let lastT1Before = firstT1; const lim = leftIdx < 0 ? hops.length : leftIdx; for (let i = firstT1; i < lim; i++) if (hops[i].dept === 'T1') lastT1Before = i; agent = hops[lastT1Before].name; }
  const finalT1 = finalTeam === 'T1';
  let outcome, dest = null;
  const left = handOnly ? !finalT1 : (leftIdx >= 0 || (finalTeam && !finalT1 && finalTeam !== 'Other'));
  if (!left) outcome = closed ? 'closed_t1' : 'open_t1';
  else {
    dest = handOnly ? finalTeam : (leftIdx >= 0 ? hops[leftIdx].dept : finalTeam);
    if (finalT1) outcome = closed ? 'back_closed_t1' : 'back_open_t1';
    else outcome = closed ? 'closed_dept' : 'open_dept';
  }
  const owner = r.assignee || (hops.length ? hops[hops.length - 1].name : null);
  const ownerDept = owner ? (nameSet.has(lc(owner)) ? 'T1' : (finalTeam || personDept({ name: owner }))) : finalTeam;
  return { agent, outcome, dest, owner, ownerDept, closed, path: hops.map((h) => h.name + ' (' + h.dept + ')').slice(0, 8) };
}
const TRANSFERRED = new Set(['back_closed_t1', 'back_open_t1', 'closed_dept', 'open_dept']);

// ── AI read of each ticket ──────────────────────────────────────────────────
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS voip_ai (ticket_id TEXT PRIMARY KEY, modified TEXT, voip INTEGER, real INTEGER, category TEXT, basic TEXT, valid INTEGER,
    handoff TEXT, done TEXT, missing TEXT, summary TEXT, why TEXT, at TEXT DEFAULT (datetime('now')))`);
  try { await run(`ALTER TABLE voip_ai ADD COLUMN cat_ver INTEGER`); } catch (e) { /* already there */ }
  try { await run(`ALTER TABLE voip_ai ADD COLUMN outage INTEGER`); } catch (e) { /* already there */ }
  await run(`CREATE TABLE IF NOT EXISTS voip_fix (ticket_id TEXT PRIMARY KEY, status TEXT, note TEXT, by TEXT, at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS voip_shares (token TEXT PRIMARY KEY, label TEXT, preset TEXT, from_d TEXT, to_d TEXT, created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), revoked INTEGER DEFAULT 0, views INTEGER DEFAULT 0, last_view TEXT)`);
}
async function aiFor(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400); if (!part.length) continue;
    for (const r of await all(`SELECT * FROM voip_ai WHERE ticket_id IN (${part.map(() => '?').join(',')})`, part)) out.set(String(r.ticket_id), r);
  }
  return out;
}
const AI_SYS = `You read Adit support tickets in full (client messages, agent replies, internal notes, chat transcripts) for the T1 CS VoIP report.
For each ticket decide:
- voip: true when the client's problem is the Adit phone service itself (desk or cordless phones, softphone or phone app, call flow, ringing, voicemail, caller ID, eFax, call quality, numbers, call tracking, porting). A phone call to support, or a problem with Pozative, patient forms, Engage texting, reminders, payments, EHR sync, scheduling, logins or the AI agent, is NOT voip. Emails titled "New Call from ... - 1025" are voicemail notices from Adit's own line: judge by what the caller asked.
- real: false only when the record shows it is a test ticket, blank or wrong-number call, spam or a duplicate.
- category: one key from the list.
- When the ticket says T1 transferred it: basic ("done" when the guide's basic steps for this issue were done and written in the ticket before the hand-over, "partial", "not_done", or "not_needed" when the guide says the VoIP team owns it and no basic fix applies); valid (true when the transfer was right by the guide, including a call back T1 cannot make); handoff ("good" when the note has what the guide asks for, "partial", "missing"); done and missing (short step names, at most 4 each).
- When it was not transferred, set basic, valid and handoff to null.
- outage: true when the ticket is about a platform, carrier or Adit-wide phone outage (phones down for many practices, an incident notice), false otherwise. Outage tickets always go to the VoIP team.
- summary: one plain line on what the client needed and what happened. why: one short line for your call.
Use only what the ticket shows. Never write patient names, client emails or phone numbers. No em or en dashes.

${GUIDE}

CATEGORIES (key: meaning):
${Object.entries(CATS).map(([k, v]) => k + ': ' + v[0]).join('\n')}

Always pick the closest category; there is no "other".
Return JSON {"items":[{"id":"letter","voip":true,"real":true,"category":"key","basic":"done|partial|not_done|not_needed|null","valid":true,"handoff":"good|partial|missing|null","done":["..."],"missing":["..."],"outage":false,"summary":"...","why":"..."}]}.`;
const _reading = new Set();
let _workBusy = false, _lastWork = null;
/** Reads up to `max` tickets that have no AI read yet (or changed since). */
async function readTickets(list, max = 20) {
  if (!D.ai || !D.ticketContext || !list.length) return 0;
  const todo = list.filter((x) => !_reading.has(x.r.id)).slice(0, max);
  todo.forEach((x) => _reading.add(x.r.id));
  let n = 0;
  try {
    const digests = [];
    for (let i = 0; i < todo.length; i += 5) {
      await Promise.all(todo.slice(i, i + 5).map(async (x) => {
        try {
          const c = await Promise.race([D.ticketContext(x.r.id), new Promise((_, rej) => setTimeout(() => rej(new Error('ticket read timed out')), 30000))]);
          const convo = ((c && c.items) || []).map((it) => `${it.inbound ? 'CLIENT' : (it.who || 'AGENT')}: ${String(it.text || '').replace(/\s+/g, ' ').trim()}`).join('\n');
          digests.push({ x, convo });
        } catch (e) { /* read next time */ }
      }));
    }
    const batches = []; for (let i = 0; i < digests.length; i += 5) batches.push(digests.slice(i, i + 5));
    const one = async (batch) => {
      const user = batch.map(({ x, convo }, k) => {
        const t = x.t, moved = t && TRANSFERRED.has(t.outcome);
        const what = !t ? 'unknown' : moved ? `T1 (${t.agent}) transferred it to ${t.dest}` + (t.outcome.startsWith('back') ? ', and it came back to T1' : '') : (t.outcome === 'closed_t1' ? `closed by T1 (${t.agent}) without a transfer` : `still with T1 (${t.agent})`);
        return `=== TICKET ${'ABCDE'[k]} | channel ${x.r.channel || ''} | classification ${x.r.cls || 'none'} | module ${x.r.module || 'none'} | subject: ${clean(x.r.subject, 160)} | what happened: ${what}\n`
          + ((convo.length > 3600 ? convo.slice(0, 1800) + '\n...\n' + convo.slice(-1800) : convo) || '(no replies or notes)');
      }).join('\n\n');
      try {
        const res = await D.ai.bestJSON({ system: AI_SYS, user, maxTokens: 2200, feature: 'analyze', timeoutMs: 90000, temperature: 0 });
        const j = (res && res.json) || res || {};
        for (const it of j.items || []) {
          const d = batch['ABCDE'.indexOf(String(it.id || '').trim().toUpperCase().slice(-1))]; if (!d) continue;
          const cat = CATS[it.category] ? it.category : (OLD_CAT[it.category] || 'training');
          const pick = (v, ok) => (ok.includes(v) ? v : null);
          const arr = (a) => JSON.stringify((Array.isArray(a) ? a : []).map((s) => clean(s, 80)).filter(Boolean).slice(0, 4));
          await run(`INSERT OR REPLACE INTO voip_ai (ticket_id, modified, voip, real, category, basic, valid, handoff, done, missing, summary, why, outage, cat_ver, at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,${CAT_VERSION},datetime('now'))`,
            [d.x.r.id, d.x.r.modified_time || null, it.voip === false ? 0 : 1, it.real === false ? 0 : 1, cat, pick(it.basic, ['done', 'partial', 'not_done', 'not_needed']),
              it.valid === true ? 1 : it.valid === false ? 0 : null, pick(it.handoff, ['good', 'partial', 'missing']), arr(it.done), arr(it.missing), clean(it.summary, 240), clean(it.why, 200), it.outage === true ? 1 : 0]);
          n++;
        }
      } catch (e) { console.warn('voip-project: AI read failed:', e.message); }
    };
    for (let i = 0; i < batches.length; i += 2) await Promise.all(batches.slice(i, i + 2).map(one));
  } finally { todo.forEach((x) => _reading.delete(x.r.id)); }
  return n;
}
// Batch 253: reads made before the new categories are sorted again from their stored summary (no new ticket read).
async function resort(max = 80) {
  if (!D.ai) return 0;
  const rows = await all(`SELECT ticket_id, category, summary, why FROM voip_ai WHERE coalesce(cat_ver, 1) < ? AND voip = 1 AND real = 1 LIMIT ?`, [CAT_VERSION, max]);
  if (!rows.length) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const part = rows.slice(i, i + 40);
    const sys = 'Sort Adit VoIP support tickets into one category each, from the summary of what the client needed. Always pick the closest category; there is no "other". Return JSON {"items":[{"n":number,"category":"key"}]}.\n\nCATEGORIES (key: meaning):\n' + Object.entries(CATS).map(([k, v]) => k + ': ' + v[0]).join('\n');
    const user = part.map((r, k) => (k + 1) + '. ' + clean(r.summary || r.why || '', 260) + ' (earlier category: ' + (r.category || 'none') + ')').join('\n');
    try {
      const res = await D.ai.bestJSON({ system: sys, user, maxTokens: 1500, feature: 'analyze', timeoutMs: 90000, temperature: 0 });
      const got = new Map(((res && res.json) || {}).items ? res.json.items.map((x) => [Number(x.n), x.category]) : []);
      for (let k = 0; k < part.length; k++) {
        const c = got.get(k + 1); const cat = CATS[c] ? c : (OLD_CAT[part[k].category] || 'training');
        await run(`UPDATE voip_ai SET category = ?, cat_ver = ? WHERE ticket_id = ?`, [cat, CAT_VERSION, part[k].ticket_id]); n++;
      }
    } catch (e) { console.warn('voip-project: re-sort failed:', e.message); break; }
  }
  if (n) _built.clear();
  return n;
}
/** Background: keep the AI reads up to date for the go-live range and the same span before it. */
// Batch 258: the worker reads the same two windows the report counts (so its "nothing left" always matches the
// report), records its last error, and a pass that hangs is released after 6 minutes.
let _workAt = 0, _workErr = null;
async function work({ max = 20 } = {}) {
  if (!_db) return null;
  if (_workBusy && Date.now() - _workAt < 6 * 60e3) return null;
  _workBusy = true; _workAt = Date.now();
  try {
    const now = new Date().toISOString();
    const r = rangeFor({ preset: 'golive' });
    const T = await t1Context(), pTeam = await personTeams();
    const ctx = ctxFor(T, pTeam);
    const [curRows, prevRows] = await Promise.all([fetchRows(r.fromIso, r.toIso, T), fetchRows(r.prevFrom, r.prevTo, T)]);
    const seen = new Set(), rows = [];
    for (const x of curRows.concat(prevRows)) if (!seen.has(x.id)) { seen.add(x.id); rows.push(x); }
    const ai = await aiFor(rows.map((x) => x.id));
    const need = [];
    for (const x of rows) {
      const a = ai.get(x.id);
      const stale = a && x.modified_time && a.modified && a.modified !== x.modified_time && Date.now() - Date.parse(String(a.at).replace(' ', 'T') + 'Z') > 6 * 3600e3;
      if (!a || stale) need.push({ r: x, t: trace(x, ctx) });
    }
    // Newest first, so this week's tickets are read before the older ones.
    need.sort((p, q) => String(q.r.created_time).localeCompare(String(p.r.created_time)));
    const n = need.length ? await readTickets(need, max) : 0;
    const re = await resort(80);
    _lastWork = { at: now, read: n, resorted: re, waiting: Math.max(0, need.length - n), rows: rows.length };
    _workErr = null;
    return _lastWork;
  } catch (e) { _workErr = { at: new Date().toISOString(), message: clean(e.message, 300) }; throw e; }
  finally { _workBusy = false; }
}

// ── Ranges ─────────────────────────────────────────────────────────────────
function todayCst() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayStart = (d) => { const w = D.dayWindow ? D.dayWindow(d, TZ) : null; return w ? new Date(w.start).toISOString() : new Date(d + 'T05:00:00Z').toISOString(); };
const fmtDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
/** preset golive | last7 | last30 | month | custom (from, to as YYYY-MM-DD, inclusive). Previous = same number of days before. */
function rangeFor({ preset = 'golive', from, to } = {}) {
  const t = todayCst();
  let f, e, label;
  if (preset === 'last7') { f = addDays(t, -6); e = t; label = 'Last 7 days'; }
  else if (preset === 'last30') { f = addDays(t, -29); e = t; label = 'Last 30 days'; }
  else if (preset === 'month') { f = t.slice(0, 8) + '01'; e = t; label = 'This month'; }
  else if (preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(from || '') && /^\d{4}-\d{2}-\d{2}$/.test(to || '') && from <= to) { f = from; e = to > t ? t : to; label = fmtDay(f) + ' to ' + fmtDay(e); }
  else { preset = 'golive'; f = GO_LIVE; e = t; label = 'Since go-live (' + fmtDay(GO_LIVE) + ')'; }
  const days = Math.round((Date.parse(e + 'T12:00:00Z') - Date.parse(f + 'T12:00:00Z')) / 864e5) + 1;
  const pf = addDays(f, -days), pe = addDays(f, -1);
  const endIso = e >= t ? new Date().toISOString() : dayStart(addDays(e, 1));
  return { preset, from: f, to: e, days, label, fromIso: dayStart(f), toIso: endIso, prevFrom: dayStart(pf), prevTo: dayStart(f), prevLabel: fmtDay(pf) + ' to ' + fmtDay(pe) };
}

// ── Leaks: where T1 handling fell short of the guide ───────────────────────
const LEAK = {
  should_resolve: 'T1-owned issue sent to another team',
  no_basic: 'Transferred without the basic checks',
  partial_basic: 'Basic checks only partly done',
  wrong_transfer: 'Transfer not right by the guide',
  no_handoff: 'Hand-over note missing',
  reopened: 'Reopened after T1 closed it',
  stale: 'Open with T1 for over 5 days',
};
function weekOf(iso) {
  const d = new Date(new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function leaksOf(x) {
  const out = [], a = x.ai || {}, exp = (CATS[x.category] || [])[1];
  if (x.transferred) {
    const sr = exp === 't1' && a.valid !== 1;
    if (sr) out.push('should_resolve');
    if (a.basic === 'not_done') out.push('no_basic'); else if (a.basic === 'partial') out.push('partial_basic');
    if (a.valid === 0 && !sr) out.push('wrong_transfer');
    if (a.handoff === 'missing') out.push('no_handoff');
  } else if (x.outcome === 'closed_t1' && x.reopen > 0) out.push('reopened');
  else if (x.outcome === 'open_t1' && Date.now() - Date.parse(x.created) > 5 * 864e5) out.push('stale');
  return out;
}
async function setFix({ ticketId, status, note }, by) {
  const id = String(ticketId || '').replace(/\D/g, ''); if (!id) throw httpError(400, 'Pick a ticket');
  if (!['coached', 'dismissed', 'open'].includes(status)) throw httpError(400, 'Unknown status');
  if (status === 'open') await run(`DELETE FROM voip_fix WHERE ticket_id = ?`, [id]);
  else await run(`INSERT OR REPLACE INTO voip_fix (ticket_id, status, note, by, at) VALUES (?,?,?,?,datetime('now'))`, [id, status, clean(note, 300), lc(by)]);
  _built.clear();
  return { ticketId: id, status };
}
async function recheck(ticketId) {
  const id = String(ticketId || '').replace(/\D/g, ''); if (!id) throw httpError(400, 'Pick a ticket');
  await run(`DELETE FROM voip_ai WHERE ticket_id = ?`, [id]); _built.clear();
  return { ticketId: id, queued: true };
}

// ── Numbers ────────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
function blankAgg() { return { leaks: 0, handled: 0, closedT1: 0, openT1: 0, transferred: 0, backT1: 0, fcr: 0, toVoip: 0, toOther: 0, closedAll: 0, basicDone: 0, basicPartial: 0, basicNot: 0, basicNotNeeded: 0, basicKnown: 0, valid: 0, invalid: 0, handGood: 0, handKnown: 0 }; }
function add(a, x) {
  a.handled++;
  if (x.leaks.length && !(x.fix && x.fix.status === 'dismissed')) a.leaks++;
  if (x.outcome === 'closed_t1') a.closedT1++;
  if (x.outcome === 'open_t1') a.openT1++;
  if (x.transferred) { a.transferred++; if (isVoipDept(x.dest)) a.toVoip++; else a.toOther++; if (x.outcome.startsWith('back')) a.backT1++; }
  if (x.fcr) a.fcr++;
  if (x.closed) a.closedAll++;
  if (x.transferred && x.ai) {
    if (x.ai.basic) { a.basicKnown++; if (x.ai.basic === 'done') a.basicDone++; else if (x.ai.basic === 'partial') a.basicPartial++; else if (x.ai.basic === 'not_done') a.basicNot++; else a.basicNotNeeded++; }
    if (x.ai.valid === 1) a.valid++; else if (x.ai.valid === 0) a.invalid++;
    if (x.ai.handoff) { a.handKnown++; if (x.ai.handoff === 'good') a.handGood++; }
  }
}
function rates(a) {
  // Basic support done %: of the transfers where basic support applied (not "VoIP team owns it").
  const applies = a.basicDone + a.basicPartial + a.basicNot;
  return Object.assign(a, { closedT1Pct: pct(a.closedT1, a.handled), transferPct: pct(a.transferred, a.handled), fcrPct: pct(a.fcr, a.handled), toVoipPct: pct(a.toVoip, a.handled),
    leakPct: pct(a.leaks, a.handled), basicDonePct: pct(a.basicDone, applies), basicNotPct: pct(a.basicNot, applies), validPct: pct(a.valid, a.valid + a.invalid), handoffPct: pct(a.handGood, a.handKnown), closedAllPct: pct(a.closedAll, a.handled) });
}

async function build(range, { list = true } = {}) {
  const T = await t1Context(), pTeam = await personTeams();
  const ctx = ctxFor(T, pTeam);
  const [cur, prev, compCur, compPrev, outCur, outPrev] = await Promise.all([fetchRows(range.fromIso, range.toIso, T), fetchRows(range.prevFrom, range.prevTo, T), companyVoip(range.fromIso, range.toIso), companyVoip(range.prevFrom, range.prevTo),
    outageRows(range.fromIso, range.toIso), outageRows(range.prevFrom, range.prevTo)]);
  const ai = await aiFor(cur.concat(prev).map((x) => x.id));
  const fixes = new Map((await all(`SELECT * FROM voip_fix`)).map((f) => [String(f.ticket_id), { status: f.status, note: f.note, by: f.by, at: f.at }]));
  let pending = 0, notVoip = 0;
  const decide = (rows) => {
    const out = [];
    for (const r of rows) {
      const a = ai.get(r.id);
      // Batch 261: the agent's own marks count first: Classification VoIP Support, or Adit App Module set to Voice, eFax or
      // Call Tracking. AI decides only for tickets the agent did not mark, so a marked VoIP ticket is never dropped.
      const classified = r.cls === 'VoIP Support' || /\bvoice\b|e-?fax|call tracking/i.test(String(r.module || ''));
      if (a && !a.real) continue;
      // Batch 257: Desk ticket type Outage (or AI found an outage). Outage tickets go to the VoIP team by design, so they
      // are shown on their own and left out of T1's rates and leaks.
      const isOutage = r.ttype === 'Outage' || !!(a && a.outage === 1);
      const voipTeam = /voip/i.test((r.team || '') + ' ' + (r.owner_team || '')) || /Role : VoIP Support/.test(r.log || '');
      if (!classified && !a && !(isOutage && voipTeam)) { pending++; continue; }
      if (!classified && a && !a.voip) { notVoip++; continue; }
      // Zoho's Test Ticket field is true on most real tickets, so it is not used; AI marks real test tickets instead.
      const t = trace(r, ctx); if (!t) continue;
      const transferred = TRANSFERRED.has(t.outcome);
      const cat = !a ? 'unsorted' : (CATS[a.category] ? a.category : (OLD_CAT[a.category] || 'unsorted'));
      const parse = (s) => { try { return JSON.parse(s || '[]'); } catch (e) { return []; } };
      out.push({ id: r.id, number: r.ticket_number, subject: clean(r.subject, 200), url: r.web_url, channel: chan(r.channel), created: r.created_time, closedAt: r.closed_time, status: r.status,
        agent: t.agent, outcome: t.outcome, dest: t.dest, owner: t.owner, ownerDept: t.ownerDept, closed: t.closed, transferred, path: t.path,
        fcr: t.outcome === 'closed_t1' && !(Number(r.reopen) > 0), reopen: Number(r.reopen) || 0,
        category: cat, by: classified ? (a ? 'Agent marked VoIP, AI read' : 'Agent marked VoIP') : 'AI read',
        ai: a ? { basic: a.basic, valid: a.valid, handoff: a.handoff, done: parse(a.done), missing: parse(a.missing), summary: a.summary, why: a.why } : null,
        hours: t.closed && r.closed_time ? Math.round((Date.parse(r.closed_time) - Date.parse(r.created_time)) / 36e5 * 10) / 10 : null, fix: fixes.get(r.id) || null,
        outage: isOutage, outageBy: r.ttype === 'Outage' ? 'Desk ticket type' : (isOutage ? 'AI read' : null), parent: r.parent || null });
    }
    for (const x of out) x.leaks = x.outage ? [] : leaksOf(x);
    return out;
  };
  const curT = decide(cur), prevPending = pending; pending = 0;
  const prevT = decide(prev);
  // Every VoIP outage ticket in the window: the ones T1 handled (from the report) plus the ones that went straight to
  // the VoIP team, each counted once.
  const outageSum = (ts, rows) => {
    const mine = new Map(ts.filter((x) => x.outage).map((x) => [x.id, x]));
    const all1 = [...mine.values()];
    for (const r of rows || []) {
      if (mine.has(r.id)) continue;
      const t = trace(r, ctx);
      all1.push({ id: r.id, number: r.ticket_number, subject: clean(r.subject, 200), url: r.web_url, channel: chan(r.channel), created: r.created_time, closed: lc(r.status_type) === 'closed' || !!r.closed_time,
        agent: t ? t.agent : null, outcome: t ? t.outcome : 'straight', dest: t ? t.dest : (deptOf(r.team) || deptOf(r.owner_team) || 'VoIP Support'), owner: r.assignee || null, transferred: t ? TRANSFERRED.has(t.outcome) : false, outage: true, t1: !!t, parent: r.parent || null });
    }
    for (const x of all1) if (x.t1 == null) x.t1 = true;
    const byDay = {}, byChan = { call: 0, chat: 0, email: 0 };
    for (const x of all1) {
      const d = new Date(x.created).toLocaleDateString('en-CA', { timeZone: TZ }); const e = byDay[d] || (byDay[d] = { day: d, n: 0, t1Sent: 0, t1Closed: 0, straight: 0, open: 0 });
      e.n++; if (!x.t1) e.straight++; else if (x.transferred) e.t1Sent++; else if (x.outcome === 'closed_t1') e.t1Closed++; else e.open++;
      byChan[x.channel] = (byChan[x.channel] || 0) + 1;
    }
    const t1 = all1.filter((x) => x.t1), toVoip = all1.filter((x) => (x.t1 ? x.transferred && isVoipDept(x.dest) : true)).length;
    return { count: all1.length, t1Count: t1.length, straight: all1.length - t1.length, days: Object.keys(byDay).length, toVoip, toVoipPct: pct(toVoip, all1.length),
      t1Sent: t1.filter((x) => x.transferred).length, closedT1: t1.filter((x) => x.outcome === 'closed_t1').length, open: all1.filter((x) => !x.closed).length, closed: all1.filter((x) => x.closed).length,
      parents: new Set(all1.map((x) => x.parent).filter(Boolean)).size, byChannel: byChan,
      byDay: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
      byAgent: Object.entries(t1.reduce((m, x) => { if (x.agent) m[x.agent] = (m[x.agent] || 0) + 1; return m; }, {})).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      tickets: all1.sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 300).map((x) => ({ number: x.number, url: x.url, subject: x.subject, created: x.created, channel: x.channel, agent: x.agent, outcome: x.outcome, dest: x.dest, t1: x.t1, closed: x.closed })) };
  };
  const summarize = (all0) => {
    const ts = all0.filter((x) => !x.outage);
    const leakReasons = {}, wins = [], t1H = [], deptH = [], weeks = {};
    const tot = blankAgg(), byDept = {}, byCat = {}, byAgent = {}, byChan = { call: blankAgg(), chat: blankAgg(), email: blankAgg() }, voipAgents = {}, missing = {}, daily = {};
    for (const x of ts) {
      add(tot, x); add(byChan[x.channel], x);
      if (!(x.fix && x.fix.status === 'dismissed')) for (const l of x.leaks) leakReasons[l] = (leakReasons[l] || 0) + 1;
      if (x.fcr && x.ai && x.ai.summary) wins.push(x);
      const cm = CATS[x.category] || ['Not read by AI yet', null];
      const c = byCat[x.category] || (byCat[x.category] = Object.assign(blankAgg(), { key: x.category, label: cm[0], expected: cm[1], t1Hours: [], deptHours: [] })); add(c, x);
      if (x.hours != null) { if (x.outcome === 'closed_t1') c.t1Hours.push(x.hours); else if (x.outcome === 'closed_dept') c.deptHours.push(x.hours); }
      if (x.hours != null) { if (x.outcome === 'closed_t1') t1H.push(x.hours); else if (x.outcome === 'closed_dept') deptH.push(x.hours); }
      const wk = weekOf(x.created); const w = weeks[wk] || (weeks[wk] = Object.assign(blankAgg(), { week: wk })); add(w, x);
      const g = byAgent[x.agent] || (byAgent[x.agent] = Object.assign(blankAgg(), { name: x.agent, call: 0, chat: 0, email: 0 })); add(g, x); g[x.channel]++;
      if (x.transferred) {
        const d = byDept[x.dest || 'Unknown'] || (byDept[x.dest || 'Unknown'] = { dept: x.dest || 'Unknown', voip: isVoipDept(x.dest), received: 0, closed: 0, open: 0, back: 0, hours: [] });
        d.received++;
        if (x.outcome === 'closed_dept') { d.closed++; if (x.hours != null) d.hours.push(x.hours); } else if (x.outcome === 'open_dept') d.open++; else d.back++;
        if (!x.outcome.startsWith('back') && x.owner) {
          const k = x.owner, v = voipAgents[k] || (voipAgents[k] = { name: k, dept: x.ownerDept, received: 0, closed: 0, open: 0, hours: [] });
          v.received++; if (x.closed) { v.closed++; if (x.hours != null) v.hours.push(x.hours); } else v.open++;
        }
        for (const m of (x.ai && x.ai.missing) || []) { const k = lc(m).replace(/[.]+$/, ''); missing[k] = missing[k] || { step: m, n: 0 }; missing[k].n++; }
      }
      const day = new Date(x.created).toLocaleDateString('en-CA', { timeZone: TZ });
      const dd = daily[day] || (daily[day] = { day, closedT1: 0, openT1: 0, transferred: 0 });
      if (x.transferred) dd.transferred++; else if (x.outcome === 'closed_t1') dd.closedT1++; else dd.openT1++;
    }
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
    const nT = tot.transferred;
    return {
      totals: rates(tot),
      byChannel: Object.fromEntries(Object.entries(byChan).map(([k, v]) => [k, rates(v)])),
      byCategory: Object.values(byCat).map((c) => { const t = rates(c); t.t1Hours = med(c.t1Hours); t.deptHours = med(c.deptHours); return t; }).sort((a, b) => (a.key === 'unsorted') - (b.key === 'unsorted') || b.handled - a.handled),
      speed: { t1Median: med(t1H), deptMedian: med(deptH), t1N: t1H.length, deptN: deptH.length },
      weekly: Object.values(weeks).map(rates).sort((a, b) => a.week.localeCompare(b.week)),
      byAgent: Object.values(byAgent).map(rates).sort((a, b) => b.handled - a.handled),
      byDept: Object.values(byDept).map((d) => ({ dept: d.dept, voip: d.voip, received: d.received, share: pct(d.received, nT), ofAll: pct(d.received, tot.handled), closed: d.closed, open: d.open, back: d.back, closurePct: pct(d.closed, d.received), medianHours: med(d.hours) })).sort((a, b) => b.received - a.received),
      receivers: Object.values(voipAgents).map((v) => ({ name: v.name, dept: v.dept, voip: isVoipDept(v.dept), received: v.received, closed: v.closed, open: v.open, closurePct: pct(v.closed, v.received), medianHours: med(v.hours) })).sort((a, b) => b.received - a.received),
      leakReasons: Object.entries(LEAK).map(([k, label]) => ({ key: k, label, n: leakReasons[k] || 0 })).filter((r) => r.n),
      wins: wins.sort((p, q) => String(q.created).localeCompare(String(p.created))).slice(0, 6).map((x) => ({ number: x.number, url: x.url, agent: x.agent, channel: x.channel, category: x.category, summary: x.ai.summary })),
      topMissing: Object.values(missing).sort((a, b) => b.n - a.n).slice(0, 8),
      daily: Object.values(daily).sort((a, b) => a.day.localeCompare(b.day)),
    };
  };
  // Tickets T1 handled that belong to an outage are counted with the outage, not in T1's rates or leaks.
  const markOut = (ts, rows) => { const ids = new Set((rows || []).map((r) => r.id)); for (const x of ts) if (ids.has(x.id)) { x.outage = true; x.leaks = []; } };
  markOut(curT, outCur.rows); markOut(prevT, outPrev.rows);
  const curS = Object.assign(summarize(curT), { outages: Object.assign(outageSum(curT, outCur.rows), { incidents: outCur.incidents }) }), prevS = Object.assign(summarize(prevT), { outages: Object.assign(outageSum(prevT, outPrev.rows), { incidents: outPrev.incidents }) });
  const share = (comp, s) => (comp ? { total: comp.total, closed: comp.closed, closedByT1: s.totals.closedT1, t1Pct: pct(s.totals.closedT1, comp.total), t1Touched: s.totals.handled, touchedPct: pct(s.totals.handled, comp.total) } : null);
  return {
    goLive: GO_LIVE, range: { preset: range.preset, from: range.from, to: range.to, days: range.days, label: range.label, prevLabel: range.prevLabel },
    generatedAt: new Date().toISOString(),
    // AI progress over every candidate ticket in both periods (each is read once, and again only if it changes).
    reading: { notVoip, error: _workErr, total: cur.length + prev.length, done: cur.concat(prev).filter((x) => ai.has(x.id)).length, waiting: prevPending + pending, current: prevPending, last: _lastWork },
    current: Object.assign(curS, { company: share(compCur, curS) }),
    previous: Object.assign(prevS, { company: share(compPrev, prevS) }),
    flow: D.flow ? (() => { try { return D.flow(); } catch (e) { return null; } })() : null,
    leakLabels: LEAK,
    categories: Object.assign(Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, { label: v[0], expected: v[1], expectedLabel: EXPECTED_LABEL[v[1]] }])), { unsorted: { label: 'Not read by AI yet', expected: null, expectedLabel: '' } }),
    tickets: list ? curT.sort((a, b) => String(b.created).localeCompare(String(a.created))) : undefined,
    definitions: [
      'VoIP ticket: a ticket a T1 agent handled (owned, created, or wrote on) where the agent set Classification to VoIP Support or the Adit App Module to Voice, eFax or Call Tracking, or AI read the conversation and found a VoIP query. Test, spam and blank tickets are left out.',
      'Closed by T1: closed while with T1 and never sent to another team. Transferred: sent to another department at any point, including ones that came back to T1.',
      'FCR (first contact resolution): closed by T1 without a transfer and not reopened.',
      'Basic support done: for transferred tickets, AI checked the conversation against the T1 VoIP support guide. The percentage counts only issues where basic support applies (not ones the VoIP team owns outright, like porting or caller ID).',
      'Share of all VoIP tickets: tickets closed by T1 out of every VoIP ticket at Adit in the range (classified VoIP Support or owned by a VoIP team).',
      'Outage tickets: an outage is a VoIP parent ticket with its child tickets (the Child or Outage tickets created that day that are VoIP), plus Desk type Outage VoIP tickets on other days. Outages of other products, such as app slowness, are not counted. Any ticket T1 handled that AI found the ticket is about a platform, carrier or Adit-wide phone outage. They go to the VoIP team by design, so they are shown in their own section and left out of T1\'s rates (closed by T1, transfer rate, FCR, basic support) and the fix list.',
      'Leak: a ticket where T1 handling fell short of the guide: a T1-owned issue sent on, transferred without the basic checks or with them partly done, a transfer the guide does not support, a missing hand-over note, a ticket reopened after T1 closed it, or one open with T1 for over 5 days. Leaks marked "Not a leak" are left out of the counts; ones marked "Coached" still count.',
      'Previous period: the same number of days just before the range. Days are Central time.',
    ],
  };
}
// The last finished report per range is served at once; when it is older than 90 seconds a fresh one is built in
// the background and served on the next load (a cold build can take about a minute).
const _built = new Map();
async function summary(opts = {}) {
  const range = rangeFor(opts);
  const k = range.from + '|' + range.to;
  let e = _built.get(k);
  if (!e) { e = { at: 0, data: null, p: null }; _built.set(k, e); if (_built.size > 12) _built.delete(_built.keys().next().value); }
  const fresh = e.data && Date.now() - e.at < (opts.fresh ? 15e3 : 90e3);
  if (opts.fresh && !fresh) { if (!e.p) e.p = build(range).then((d) => { e.data = d; e.at = Date.now(); return d; }).finally(() => { e.p = null; }); return e.p; }
  if (!fresh && !e.p) e.p = build(range).then((d) => { e.data = d; e.at = Date.now(); return d; }).finally(() => { e.p = null; });
  if (e.data) return fresh ? e.data : Object.assign({}, e.data, { refreshing: true });
  return e.p;
}

// ── Share links (read by anyone with an Adit Google account) ────────────────
async function createShare({ label, preset, from, to }, by) {
  const r = rangeFor({ preset, from, to });
  const token = crypto.randomBytes(18).toString('base64url');
  await run(`INSERT INTO voip_shares (token, label, preset, from_d, to_d, created_by) VALUES (?,?,?,?,?,?)`, [token, clean(label || 'T1 CS VoIP report', 120), r.preset, r.preset === 'custom' ? r.from : null, r.preset === 'custom' ? r.to : null, lc(by)]);
  return { token };
}
async function listShares() { return all(`SELECT token, label, preset, from_d, to_d, created_by, created_at, revoked, views, last_view FROM voip_shares ORDER BY created_at DESC LIMIT 50`); }
async function revokeShare(token) { const r = await run(`UPDATE voip_shares SET revoked = 1 WHERE token = ?`, [String(token)]); if (!r.changes) throw httpError(404, 'Link not found'); return { ok: true }; }
async function openShare(token, viewer) {
  const s = await get(`SELECT * FROM voip_shares WHERE token = ?`, [String(token || '')]);
  if (!s || s.revoked) throw httpError(404, 'This link was turned off or does not exist.');
  await run(`UPDATE voip_shares SET views = views + 1, last_view = datetime('now') WHERE token = ?`, [s.token]).catch(() => {});
  const data = await summary({ preset: s.preset, from: s.from_d, to: s.to_d });
  return Object.assign({ shareLabel: s.label, viewer }, data);
}

module.exports = { setFix, recheck, LEAK, leaksOf, setDB, setDeps, initSchema, summary, work, rangeFor, trace, deptOf, createShare, listShares, revokeShare, openShare, CATS, GO_LIVE, _build: build };
