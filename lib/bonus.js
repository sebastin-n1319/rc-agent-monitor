'use strict';
/**
 * Batch 166: T1 CS bonus calculator (admin).
 * Rules: "T1 CS BONUS STRUCTURE - ROLE-BASED (WEF JANUARY 1, 2026)" plus the clarifications confirmed for Q3 2026:
 *  - FCR = resolved within 24 business hours AND never reopened (Zoho's Is First Call Resolution flag is not used).
 *  - Overall slab = majority of the scoring metrics (more Slab 1 than Slab 2 = Slab 1; a tie goes to Slab 1).
 *  - Half-day planned leave counts 0.5 toward the leave count, floored before the bracket table.
 *  - Any unplanned leave (a half day too, or NCNS) forfeits the slab bonus and the CSAT incentive for that month.
 * Numbers come from the tool: RingCentral inbound calls, Zoho tickets closed / FCR / ticket CSAT, SalesIQ chats and
 * chat ratings. QA score and attendance are entered on the page (attendance is pre-filled from the Roster when marked).
 * The bonus is worked out month by month; a quarter, a year or month-to-date is the set of months it covers.
 */
let _db = null, _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign({}, _deps, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();

const RULES = {
  amounts: { s1: 7500, s2: 3000 },
  minPoints: 70, minDays: 18,
  calls: [
    { key: 'calls', label: 'Inbound Calls / day', pts: 35, s1: 7, s2: 5, unit: 'calls/day' },
    { key: 'tickets', label: 'Tickets Closed / day', pts: 20, s1: 5, s2: 4, unit: 'tickets/day' },
    { key: 'qa', label: 'QA Score', pts: 20, s1: 90, s2: 85, pct: true },
    { key: 'fcr', label: 'FCR %', pts: 25, s1: 75, s2: 70, pct: true },
  ],
  chat: [
    { key: 'chats', label: 'Chats Handled / day', pts: 15, s1: 11, s2: 9, unit: 'chats/day' },
    { key: 'chatCsat', label: 'Chat CSAT %', pts: 30, s1: 90, s2: 85, pct: true },
    { key: 'tickets', label: 'Tickets Closed / day', pts: 20, s1: 5, s2: 4, unit: 'tickets/day' },
    { key: 'qa', label: 'QA Score', pts: 20, s1: 90, s2: 85, pct: true },
    { key: 'fcr', label: 'FCR %', pts: 15, s1: 75, s2: 70, pct: true },
  ],
  csat: { calls: { per: 150, above: 92, minCount: 0, word: 'Good' }, chat: { per: 50, above: 85, minCount: 5, word: 'Happy' } },
};
function leaveFactor(count) { return count <= 0 ? 1 : count <= 2 ? 0.75 : count === 3 ? 0.5 : 0; }

// Default teams (Sep 2026 wings). Changed on the page; Debra Horton and Caroline Lock stay off unless switched on.
const DEFAULT_TEAM = {
  'audrey miles': 'calls', 'greg dawson': 'calls', 'henry p': 'calls', 'lincy tabita': 'calls', 'sabrina quinn': 'calls',
  'sky gibson': 'calls', 'zeff austin': 'calls',
  'anold fernandes': 'chat', 'evan cruz': 'chat', 'leo clayton': 'chat', 'tabbie shine': 'chat',
};
const DEFAULT_NOT_ELIGIBLE = new Set(['leo clayton']); // on probation for Q3 2026

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS bonus_agents (email TEXT PRIMARY KEY, team TEXT, eligible INTEGER, include INTEGER,
    updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS bonus_inputs (month TEXT NOT NULL, email TEXT NOT NULL, qa REAL, present REAL,
    pl REAL, hd_pl REAL, sl REAL, hd_sl REAL, upl REAL, hd_upl REAL, ncns REAL, chat_happy INTEGER, chat_ok INTEGER, chat_bad INTEGER,
    updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (month, email))`);
  try { await run(`ALTER TABLE bonus_inputs ADD COLUMN chats INTEGER`); } catch (e) { /* there */ }
  try { await run(`ALTER TABLE bonus_inputs ADD COLUMN fl REAL`); } catch (e) { /* there */ } // Batch 170: floater leave days
  // Batch 170: what the Hall of Fame shows agents, and whether its numbers are confirmed yet.
  // Batch 171: agents who left T1 mid-quarter (or are no longer on the call monitor) and whether they show on the Hall of Fame.
  for (const col of ['hof INTEGER', 'from_month TEXT', 'to_month TEXT', 'name TEXT', 'rc_id TEXT', 'extension TEXT']) { try { await run(`ALTER TABLE bonus_agents ADD COLUMN ${col}`); } catch (e) { /* there */ } }
  await run(`CREATE TABLE IF NOT EXISTS bonus_hof (id INTEGER PRIMARY KEY, period TEXT, status TEXT, visible INTEGER, updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  // Inbound calls per agent per Chicago month, kept once a month is complete (the tool's raw call copy only holds 45 days).
  // A finalised month keeps the numbers it was paid on, so later changes in Zoho, RingCentral or SalesIQ cannot move it.
  await run(`CREATE TABLE IF NOT EXISTS bonus_locks (month TEXT PRIMARY KEY, data TEXT, locked_by TEXT, locked_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS bonus_chats (month TEXT NOT NULL, email TEXT NOT NULL, chats INTEGER, source TEXT,
    at TEXT DEFAULT (datetime('now')), PRIMARY KEY (month, email))`);
  for (const col of ['happy INTEGER', 'ok INTEGER', 'bad INTEGER']) { try { await run(`ALTER TABLE bonus_chats ADD COLUMN ${col}`); } catch (e) { /* there */ } }
  await run(`CREATE TABLE IF NOT EXISTS bonus_calls (month TEXT NOT NULL, email TEXT NOT NULL, inbound INTEGER, answered INTEGER,
    outbound INTEGER, source TEXT, at TEXT DEFAULT (datetime('now')), PRIMARY KEY (month, email))`);
  // Batch 172: answered calls no longer include 'Answered Elsewhere' rings, so stored months are read again once.
  await run(`CREATE TABLE IF NOT EXISTS bonus_meta (k TEXT PRIMARY KEY, v TEXT)`);
  const mk = (await all(`SELECT v FROM bonus_meta WHERE k = 'calls_accepted_v1'`))[0];
  if (!mk) { await run(`DELETE FROM bonus_calls`); await run(`INSERT OR REPLACE INTO bonus_meta (k, v) VALUES ('calls_accepted_v1', datetime('now'))`); }
}

// ── Tickets closed, FCR and ticket CSAT (Zoho Analytics, the same Tickets table the Q2 sheet came from) ──
// Closed = tickets whose Ticket Closed Time falls in the Chicago month, by Ticket Owner Name. FCR = Resolution Time in
// Business Hours <= 24 h AND Number of Reopen = 0. Ticket CSAT = survey ratings on those tickets (owner of the ticket,
// month of its closed time), as in the Q2 "CSAT - Ticket Survey Return" sheet. Complete months are kept 12 hours.
const _tixCache = new Map();
async function ticketsFromAnalytics(agents, mi) {
  const key = mi.key;
  const hit = _tixCache.get(key);
  if (hit && !mi.partial && Date.now() - hit.at < 12 * 3600e3) return hit.v;
  const an = _deps.analytics;
  const f = an.utcIsoToChicagoWallTime(mi.from), t = an.utcIsoToChicagoWallTime(mi.to);
  const rows = await an.fetchTicketsView({ selectedColumns: ['ID', 'Request Id', 'Ticket Closed Time', 'Ticket Owner Name', 'Resolution Time in Business Hours', 'Number of Reopen'],
    criteria: `"Ticket Closed Time" >= '${f}' AND "Ticket Closed Time" < '${t}'` });
  const byName = new Map(); for (const a of agents) { byName.set(lc(a.name), a.email); if (a.fullName) byName.set(lc(a.fullName), a.email); }
  const out = {}, idsBy = {};
  const tInfo = new Map(); // Batch 168: survey detail rows for the Finance data workbook
  for (const a of agents) { out[a.email] = { closed: 0, fcrYes: 0, csatGood: 0, csatTotal: 0, surveys: [] }; idsBy[a.email] = []; }
  for (const r of rows) {
    const e = byName.get(lc(r['Ticket Owner Name'])); if (!e) continue;
    out[e].closed++;
    const ms = Number(String(r['Resolution Time in Business Hours'] == null ? '' : r['Resolution Time in Business Hours']).replace(/,/g, ''));
    const reopen = Number(String(r['Number of Reopen'] == null ? '0' : r['Number of Reopen']).replace(/,/g, '')) || 0;
    if (isFinite(ms) && String(r['Resolution Time in Business Hours'] ?? '') !== '' && ms / 3600000 <= 24 && reopen === 0) out[e].fcrYes++;
    if (r['ID'] != null) { idsBy[e].push(String(r['ID'])); tInfo.set(String(r['ID']), { req: r['Request Id'] == null ? '' : String(r['Request Id']), closed: String(r['Ticket Closed Time'] || ''), owner: r['Ticket Owner Name'] }); }
  }
  for (const e of Object.keys(idsBy)) {
    const ids = idsBy[e];
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400);
      const sv = await all(`SELECT rating, ticket_id, survey_time FROM desk_ticket_survey WHERE ticket_id IN (${part.map(() => '?').join(',')}) AND rating IS NOT NULL`, part);
      for (const x of sv) {
        out[e].csatTotal++; if (x.rating === 'Good') out[e].csatGood++;
        const ti = tInfo.get(String(x.ticket_id)) || {};
        out[e].surveys.push({ rating: x.rating, surveyTime: x.survey_time || '', owner: ti.owner || '', requestId: ti.req || '', closed: ti.closed || '' });
      }
    }
  }
  _tixCache.set(key, { at: Date.now(), v: out });
  return out;
}

// ── Chats handled (SalesIQ, by chat owner) ──
// The tool's chat copy has gaps for older months, so a complete month is read once from SalesIQ and kept.
let _chatsJob = null;
const _chatDiag = {};
function chatDiag() { return _chatDiag; }
async function chatsCached(mi) { return new Map((await all(`SELECT * FROM bonus_chats WHERE month = ?`, [mi.key])).map((r) => [r.email, r])); }
function startChatsJob(months) {
  if (_chatsJob || !months.length || !_deps.salesiq) return !!_chatsJob;
  _chatsJob = (async () => {
    // SalesIQ returns a handful of records per page and its order is not stable across pages, so a whole month read
    // page by page skips and repeats chats. Read in 2-hour windows (chats) and 1-day windows (ratings), de-duplicated by id.
    const siq = _deps.salesiq, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function call(fn) {
      for (let a = 0; a < 6; a++) {
        try { return await fn(); }
        catch (e) { if (!/too many|429|slow down|rate/i.test(e.message) || a === 5) throw e; await sleep(15000 * (a + 1)); }
      }
    }
    for (const mi of months) {
      try {
        const fromMs = Date.parse(mi.from), toMs = Math.min(Date.parse(mi.to), Date.now());
        // SalesIQ returns 5 records per read and its "more data" flag is not reliable, so keep reading (record offset)
        // until a read comes back short. Checked against the Q2 2026 operator report.
        const chats = new Map();
        let index = 1, guard = 0;
        while (guard++ < 3000) {
          const page = await call(() => siq.fetchConversationsPage({ fromTimeMs: fromMs, toTimeMs: toMs, index, limit: 100 }));
          const list = page.conversations || [];
          for (const c of list) chats.set(String(c.id), c);
          if (list.length < 5 && !page.moreDataAvailable) break;
          index += list.length || 1;
          await sleep(250);
        }
        const counts = {}, diag = { ownerChi: {}, attenderChi: {}, statuses: {}, total: 0 };
        const inc = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
        for (const c of chats.values()) {
          const st = Number(c.start_time); if (st && (st < fromMs || st >= toMs)) continue;
          const eo = lc(c.owner && c.owner.email), ea = lc(c.attender && c.attender.email);
          diag.total++; inc(diag.ownerChi, eo); inc(diag.attenderChi, ea); inc(diag.statuses, c.status);
          const e = eo || ea; if (e) counts[e] = (counts[e] || 0) + 1;
        }
        // Ratings: SalesIQ's feedback list (smiley happy / neutral / sad) by the operator who attended the chat.
        const fbs = new Map();
        let fpage = 1, fguard = 0;
        while (fguard++ < 1000) {
          const fb = await call(() => siq.rawGet(`feedbacks?start_time=${fromMs}&end_time=${toMs}&index=${fpage}`));
          const list = (fb && fb.data) || [];
          for (const f of list) fbs.set(String((f.conversation && f.conversation.id) || f.reference_id || (fpage + ':' + Math.random())), f);
          if (list.length < 5 && !(fb && fb.more_data_available)) break;
          fpage++; // page number
          await sleep(250);
        }
        const rates = {};
        for (const f of fbs.values()) {
          const st = Number(f.start_time); if (st && (st < fromMs || st >= toMs)) continue;
          const e = lc(f.attender && f.attender.email); if (!e) continue;
          const v = lc(f.rating && f.rating.value);
          const r = rates[e] || (rates[e] = { happy: 0, ok: 0, bad: 0 });
          if (v === 'happy') r.happy++; else if (v === 'neutral' || v === 'ok' || v === 'okay') r.ok++; else if (v === 'sad' || v === 'unhappy' || v === 'bad') r.bad++;
        }
        diag.ratings = rates;
        _chatDiag[mi.key] = diag;
        await run(`DELETE FROM bonus_chats WHERE month = ?`, [mi.key]);
        const emails = new Set(Object.keys(counts).concat(Object.keys(rates)));
        for (const e of emails) { const r = rates[e] || { happy: 0, ok: 0, bad: 0 };
          await run(`INSERT OR REPLACE INTO bonus_chats (month, email, chats, happy, ok, bad, source, at) VALUES (?,?,?,?,?,?,?,datetime('now'))`, [mi.key, e, counts[e] || 0, r.happy, r.ok, r.bad, 'SalesIQ']); }
        await run(`INSERT OR REPLACE INTO bonus_chats (month, email, chats, source, at) VALUES (?,?,?,?,datetime('now'))`, [mi.key, '__done__', chats.size, 'SalesIQ v5']);
        console.log('💬 Bonus chats read for ' + mi.key + ': ' + chats.size + ' chats, ' + fbs.size + ' ratings');
      } catch (e) { console.warn('bonus chats from SalesIQ failed for ' + mi.key + ':', e.message); }
    }
  })().finally(() => { _chatsJob = null; });
  return true;
}

// ── Inbound calls ──
// A complete month is read once (from the tool's call copy while it still holds the month, otherwise straight from
// RingCentral) and kept in bonus_calls. The monthly call summary is not used: it has no inbound calls for months that
// were rebuilt from the warehouse copy (Apr-Jul 2026), and slicing a range out of it adds later months in.
let _callsJob = null;
async function callLogsFloor() { const r = (await all(`SELECT MIN(start_time) AS f FROM call_logs`))[0]; return r && r.f ? Date.parse(r.f) : null; }
async function callsFromLogs(a, mi) {
  const r = (await all(`SELECT SUM(CASE WHEN direction='Inbound' THEN 1 ELSE 0 END) AS inb,
      SUM(CASE WHEN direction='Inbound' AND lower(COALESCE(result,'')) NOT IN ('missed','abandoned','voicemail','answered elsewhere') AND COALESCE(is_voicemail,0)=0 THEN 1 ELSE 0 END) AS ans,
      SUM(CASE WHEN direction='Outbound' THEN 1 ELSE 0 END) AS outb
    FROM call_logs WHERE agent_id = ? AND start_time >= ? AND start_time < ?`, [String(a.rcId), mi.from, mi.to]))[0] || {};
  return { inbound: r.inb || 0, answered: r.ans || 0, outbound: r.outb || 0 };
}
async function callsFor(agents, mi, warnings, needRC) {
  const out = {};
  const cached = new Map((await all(`SELECT * FROM bonus_calls WHERE month = ?`, [mi.key])).map((r) => [r.email, r]));
  const floor = await callLogsFloor();
  const covered = floor != null && floor <= Date.parse(mi.from) + 6 * 3600e3;
  for (const a of agents) {
    const c = cached.get(a.email);
    if (c && !mi.partial) { out[a.email] = { inbound: c.inbound, answered: c.answered, outbound: c.outbound, source: c.source }; continue; }
    if (!a.rcId) { out[a.email] = { inbound: 0, answered: 0, source: 'no RingCentral extension' }; continue; }
    if (covered) {
      const x = await callsFromLogs(a, mi);
      out[a.email] = { inbound: x.inbound, answered: x.answered, outbound: x.outbound, source: 'tool call log' };
      if (!mi.partial) await run(`INSERT OR REPLACE INTO bonus_calls (month, email, inbound, answered, outbound, source, at) VALUES (?,?,?,?,?,?,datetime('now'))`,
        [mi.key, a.email, x.inbound, x.answered, x.outbound, 'tool call log']);
      continue;
    }
    out[a.email] = { inbound: null, answered: null, source: 'missing' };
    needRC.push({ a, mi });
  }
  return out;
}
function startCallsJob(items) {
  if (_callsJob || !items.length || !_deps.rc || !_deps.rc.agentCallCountsFromRC) return !!_callsJob;
  _callsJob = (async () => {
    for (const { a, mi } of items) {
      try {
        const x = await _deps.rc.agentCallCountsFromRC({ rc_id: a.rcId, name: a.name, extension: a.extension }, mi.from, mi.to);
        await run(`INSERT OR REPLACE INTO bonus_calls (month, email, inbound, answered, outbound, source, at) VALUES (?,?,?,?,?,?,datetime('now'))`,
          [mi.key, a.email, x.inbound, x.answered, x.outbound, 'RingCentral']);
        await new Promise((r) => setTimeout(r, 4000));
      } catch (e) { console.warn('bonus calls from RingCentral failed for ' + a.name + ' ' + mi.key + ':', e.message); }
    }
  })().finally(() => { _callsJob = null; });
  return true;
}

// ── Periods (all months in Chicago time) ──
function chiMidnight(y, m) { // m: 1-12; returns ISO of the 1st at 00:00 America/Chicago
  for (const off of [5, 6]) {
    const d = new Date(Date.UTC(y, m - 1, 1, off));
    const hh = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(d);
    if (Number(hh) === 0) return d.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, 1, 5)).toISOString();
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function nowChi() { const p = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
function monthInfo(y, m) {
  const key = y + '-' + String(m).padStart(2, '0');
  const n = nowChi(), cur = n.y === y && n.m === m;
  const from = chiMidnight(y, m), nextY = m === 12 ? y + 1 : y, nextM = m === 12 ? 1 : m + 1;
  const to = cur ? new Date().toISOString() : chiMidnight(nextY, nextM);
  return { key, y, m, label: MON[m - 1] + "'" + String(y).slice(2), long: MON[m - 1] + ' ' + y, from, to, partial: cur };
}
/** "2026-07" | "Q3-2026" | "2026" | "MTD" -> { key, label, months[] } (future months dropped) */
function parsePeriod(p) {
  const n = nowChi(), s = String(p || '').trim().toUpperCase();
  let months = [], label = '';
  let mm;
  if (!s || s === 'MTD') { months = [[n.y, n.m]]; label = 'Month to date (' + MON[n.m - 1] + ' ' + n.y + ')'; }
  else if ((mm = /^Q([1-4])[- ]?(\d{4})$/.exec(s))) { const q = +mm[1], y = +mm[2]; months = [1, 2, 3].map((i) => [y, (q - 1) * 3 + i]); label = 'Q' + q + ' ' + y + ' (' + MON[(q - 1) * 3] + '-' + MON[(q - 1) * 3 + 2] + ')'; }
  else if ((mm = /^(\d{4})-(\d{2})$/.exec(s))) { months = [[+mm[1], +mm[2]]]; label = MON[+mm[2] - 1] + ' ' + mm[1]; }
  else if ((mm = /^(\d{4})$/.exec(s))) { const y = +mm[1]; months = Array.from({ length: 12 }, (_, i) => [y, i + 1]); label = 'Year ' + y; }
  else throw Object.assign(new Error('Pick a month (2026-07), a quarter (Q3-2026), a year (2026) or MTD'), { status: 400 });
  months = months.filter(([y, m]) => y < n.y || (y === n.y && m <= n.m)).map(([y, m]) => monthInfo(y, m));
  if (!months.length) throw Object.assign(new Error('That period has not started yet'), { status: 400 });
  return { key: s || 'MTD', label, months };
}

// ── Agents ──
async function agentList() {
  const monitored = await _deps.getMonitoredAgents();
  const saved = new Map((await all(`SELECT * FROM bonus_agents`)).map((r) => [lc(r.email), r]));
  const rosterRows = _deps.roster ? await _deps.roster.listAgents({ includeRelieved: true }).catch(() => []) : [];
  const rosterByEmail = new Map(rosterRows.filter((r) => r.email).map((r) => [lc(r.email), r]));
  const out = [], seen = new Set();
  const extra = (s) => ({ hof: !(s && s.hof === 0), fromMonth: (s && s.from_month) || null, toMonth: (s && s.to_month) || null });
  for (const a of monitored) {
    if (!a.email) continue;
    const email = lc(a.email), name = a.name || email, r = rosterByEmail.get(email) || {}, s = saved.get(email);
    const defTeam = DEFAULT_TEAM[lc(name)] || DEFAULT_TEAM[lc(r.pseudo)] || null;
    seen.add(email);
    out.push(Object.assign({
      email, name, empId: r.emp_id || null, doj: r.doj || null, fullName: r.full_name || null,
      rcId: a.rc_id || a.extension || null, extension: a.extension || null,
      team: (s && s.team) || defTeam || 'calls',
      include: s && s.include != null ? !!s.include : !!defTeam,
      eligible: s && s.eligible != null ? !!s.eligible : !DEFAULT_NOT_ELIGIBLE.has(lc(name)),
      monitored: true,
    }, extra(s)));
  }
  // Batch 171: someone added on the bonus page who is no longer on the call monitor (moved to another team mid-quarter).
  for (const [email, s] of saved) {
    if (seen.has(email) || !s.name) continue;
    const r = rosterByEmail.get(email) || {};
    out.push(Object.assign({ email, name: s.name, empId: r.emp_id || null, doj: r.doj || null, fullName: r.full_name || null,
      rcId: s.rc_id || null, extension: s.extension || null, team: s.team || 'calls', include: !!s.include, eligible: s.eligible == null ? true : !!s.eligible, monitored: false }, extra(s)));
  }
  return out.sort((x, y) => (x.team === y.team ? x.name.localeCompare(y.name) : x.team === 'calls' ? -1 : 1));
}
async function saveAgent({ email, team, include, eligible, hof, fromMonth, toMonth, name, rcId, extension, by }) {
  const e = lc(email); if (!e || !e.includes('@')) throw Object.assign(new Error('Pick an agent'), { status: 400 });
  const cur = (await all(`SELECT * FROM bonus_agents WHERE email = ?`, [e]))[0] || {};
  const list = await agentList(); const def = list.find((x) => x.email === e) || {};
  if (!def.email && !name && !cur.name) throw Object.assign(new Error('Give the agent\'s name to add someone who is not on the call monitor'), { status: 400 });
  const t = team === 'chat' || team === 'calls' ? team : (cur.team || def.team || 'calls');
  const inc = include != null ? (include ? 1 : 0) : (cur.include != null ? cur.include : (def.include ? 1 : 0));
  const el = eligible != null ? (eligible ? 1 : 0) : (cur.eligible != null ? cur.eligible : (def.eligible === false ? 0 : 1));
  const hf = hof != null ? (hof ? 1 : 0) : (cur.hof != null ? cur.hof : 1);
  const mo = (v, c) => { if (v === undefined) return c || null; const x = String(v || '').trim(); if (!x) return null; if (!/^\d{4}-\d{2}$/.test(x)) throw Object.assign(new Error('Months are YYYY-MM'), { status: 400 }); return x; };
  const fm = mo(fromMonth, cur.from_month), tm = mo(toMonth, cur.to_month);
  if (fm && tm && fm > tm) throw Object.assign(new Error('The first month is after the last month'), { status: 400 });
  await run(`INSERT OR REPLACE INTO bonus_agents (email, team, include, eligible, hof, from_month, to_month, name, rc_id, extension, updated_by, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`, [e, t, inc, el, hf, fm, tm, name != null ? String(name).trim() || null : (cur.name || null),
    rcId != null ? String(rcId).trim() || null : (cur.rc_id || null), extension != null ? String(extension).trim() || null : (cur.extension || null), by || null]);
  _hofCache = null;
  return { email: e, team: t, include: !!inc, eligible: !!el, hof: !!hf, fromMonth: fm, toMonth: tm };
}

// ── Inputs ──
const INPUT_COLS = ['qa', 'present', 'pl', 'hd_pl', 'sl', 'hd_sl', 'upl', 'hd_upl', 'ncns', 'chat_happy', 'chat_ok', 'chat_bad', 'chats', 'fl'];
function numOrNull(v) {
  if (v == null) return null; const t = String(v).trim().replace(/%$/, ''); if (t === '' || t === '-') return null;
  const n = Number(t); return isFinite(n) ? n : null;
}
async function saveInputs({ month, rows, by }) {
  _hofCache = null;
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw Object.assign(new Error('Pick a month'), { status: 400 });
  if ((await all(`SELECT month FROM bonus_locks WHERE month = ?`, [month])).length) throw Object.assign(new Error('This month is finalised. Reopen it first to change its inputs.'), { status: 409 });
  let saved = 0;
  for (const r of rows || []) {
    const e = lc(r.email); if (!e) continue;
    const vals = INPUT_COLS.map((c) => {
      let v = numOrNull(r[c]);
      if (c === 'qa' && v != null && v > 0 && v <= 1) v = Math.round(v * 1000) / 10; // 0.897 -> 89.7
      return v;
    });
    await run(`INSERT OR REPLACE INTO bonus_inputs (month, email, ${INPUT_COLS.join(', ')}, updated_by, updated_at)
      VALUES (?, ?, ${INPUT_COLS.map(() => '?').join(', ')}, ?, datetime('now'))`, [month, e, ...vals, by || null]);
    saved++;
  }
  return { month, saved };
}
async function inputsFor(monthKeys) {
  if (!monthKeys.length) return new Map();
  const rows = await all(`SELECT * FROM bonus_inputs WHERE month IN (${monthKeys.map(() => '?').join(',')})`, monthKeys);
  return new Map(rows.map((r) => [r.month + '|' + lc(r.email), r]));
}
// Attendance marked on the Roster page for a month (present days and each leave type).
async function rosterAttendance(empIds, mi) {
  const out = new Map(); if (!empIds.length) return out;
  const start = mi.key + '-01', end = mi.key + '-31';
  let rows = [];
  try {
    rows = await all(`SELECT emp_id, status, COUNT(*) AS n FROM roster_days WHERE emp_id IN (${empIds.map(() => '?').join(',')})
      AND date >= ? AND date <= ? GROUP BY emp_id, status`, [...empIds, start, end]);
  } catch (e) { return out; }
  const days = new Date(Date.UTC(mi.y, mi.m, 0)).getUTCDate();
  for (const r of rows) {
    const a = out.get(r.emp_id) || { present: 0, pl: 0, hd_pl: 0, sl: 0, hd_sl: 0, upl: 0, hd_upl: 0, ncns: 0, fl: 0, marked: 0 };
    const n = r.n || 0; a.marked += n;
    switch (r.status) {
      case 'present': case 'wfh': case 'on_duty': a.present += n; break;
      case 'pl': a.pl += n; break; case 'hd_pl': a.hd_pl += n; a.present += 0.5 * n; break;
      case 'sl': a.sl += n; break; case 'hd_sl': a.hd_sl += n; a.present += 0.5 * n; break;
      case 'upl': case 'absent': a.upl += n; break; case 'hd_upl': a.hd_upl += n; a.present += 0.5 * n; break;
      case 'ncns': a.ncns += n; break;
      case 'fl': case 'floater': case 'floater_leave': a.fl += n; break;
      default: break;
    }
    out.set(r.emp_id, a);
  }
  // A month only partly marked on the Roster is not used (it would show too few present days).
  for (const [k, a] of out) if (a.marked < days - 2 && !mi.partial) out.delete(k);
  return out;
}

// ── Scoring ──
function outcomeFor(m, v) { if (v == null || !isFinite(v)) return 'na'; return v >= m.s1 ? 's1' : v >= m.s2 ? 's2' : 'miss'; }
function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }

function scoreMonth(agent, mi, auto, inp, att) {
  const rules = RULES[agent.team] || RULES.calls;
  const pick = (k) => (inp && inp[k] != null ? inp[k] : (att && att.marked ? att[k] : null));
  const present = inp && inp.present != null ? inp.present : (att && att.marked ? att.present : null);
  const L = {};
  for (const k of ['pl', 'hd_pl', 'sl', 'hd_sl', 'upl', 'hd_upl', 'ncns', 'fl']) L[k] = pick(k) || 0;
  // Floater leave is not part of the leave count (bonus structure: "Leave Count = Excluding Floater Leaves"); it is still not a present day.
  const leaveCount = Math.floor(L.pl + L.sl + 0.5 * (L.hd_pl + L.hd_sl));
  const unplanned = (L.upl + L.hd_upl + L.ncns) > 0;
  const factor = leaveFactor(leaveCount);
  const attendanceSource = inp && inp.present != null ? 'entered' : (att && att.marked ? 'roster' : 'missing');
  const qa = inp && inp.qa != null ? inp.qa : null;
  // Chat ratings: entered numbers win over what SalesIQ returned.
  const hasChatInput = inp && (inp.chat_happy != null || inp.chat_ok != null || inp.chat_bad != null);
  const happy = hasChatInput ? (inp.chat_happy || 0) : auto.happy, ok = hasChatInput ? (inp.chat_ok || 0) : auto.ok, bad = hasChatInput ? (inp.chat_bad || 0) : auto.bad;
  const chatRated = happy + ok + bad;
  const values = {
    calls: present && auto.inbound != null ? auto.inbound / present : null,
    tickets: present ? auto.closed / present : null,
    chats: present ? ((inp && inp.chats != null ? inp.chats : auto.chats) / present) : null,
    qa,
    fcr: auto.closed ? auto.fcrYes / auto.closed * 100 : null,
    chatCsat: chatRated ? happy / chatRated * 100 : null,
  };
  const chatsUsed = inp && inp.chats != null ? inp.chats : auto.chats;
  const raw = { calls: auto.inbound, tickets: auto.closed, chats: chatsUsed };
  const metrics = rules.map((m) => {
    const v = values[m.key], out = outcomeFor(m, v);
    return { key: m.key, label: m.label, value: v == null ? null : Math.round(v * 100) / 100, raw: raw[m.key] != null ? raw[m.key] : null, pct: !!m.pct, unit: m.unit || '',
      s1: m.s1, s2: m.s2, outcome: out, points: out === 's1' || out === 's2' ? m.pts : 0, max: m.pts };
  });
  const points = metrics.reduce((t, x) => t + x.points, 0);
  const missing = [];
  // Batch 168: nothing is asked for an agent switched off for the bonus, and no QA for a month with no present days (leave all month).
  const nothingDue = !agent.eligible || present === 0;
  if (qa == null && !nothingDue) missing.push('QA score');
  if (agent.team === 'calls' && auto.inbound == null && !nothingDue) missing.push('inbound calls (reading from RingCentral)');
  // SalesIQ's API under-counts chats against its own operator report, so Chats Owned is entered from that report.
  if (present == null && agent.eligible) missing.push('attendance');
  const s1 = metrics.filter((x) => x.outcome === 's1').length, s2 = metrics.filter((x) => x.outcome === 's2').length;
  const slab = s1 + s2 === 0 ? null : (s1 >= s2 ? 's1' : 's2');
  const daysOk = present != null && present >= RULES.minDays;
  const pointsOk = points >= RULES.minPoints;
  const eligible = pointsOk && daysOk;
  const why = [];
  if (!pointsOk) why.push('Points below ' + RULES.minPoints + ' (scored ' + points + '). Need ' + (RULES.minPoints - points) + ' more.');
  if (!daysOk) why.push(present == null ? 'Present days not entered yet.' : 'Present days below ' + RULES.minDays + ' (was ' + round1(present) + ').');
  let slabAmt = 0, leaveNote = '';
  if (eligible && slab) {
    if (!agent.eligible) leaveNote = 'Not eligible for bonus this period (set on the Agents tab).';
    else if (unplanned) leaveNote = 'Slab bonus forfeited this month: unplanned leave (' + (L.upl + L.hd_upl * 0.5 + L.ncns) + ' day(s)) removes the whole slab bonus.';
    else {
      slabAmt = Math.round(RULES.amounts[slab] * factor);
      leaveNote = factor === 1 ? 'Full slab bonus retained (no leave deduction).'
        : factor === 0 ? 'Slab bonus not paid: more than 3 planned-leave days.'
          : 'Slab bonus reduced to ' + Math.round(factor * 100) + '% due to ' + leaveCount + ' planned-leave day(s).';
    }
  }
  // CSAT incentive (separate from the slab, not reduced by planned leave).
  const c = RULES.csat[agent.team] || RULES.csat.calls;
  const cGood = agent.team === 'chat' ? happy : auto.csatGood, cTotal = agent.team === 'chat' ? chatRated : auto.csatTotal;
  const cPct = cTotal ? cGood / cTotal * 100 : null;
  const cQual = cPct != null && cPct > c.above && cGood >= c.minCount && cGood > 0;
  let csatAmt = 0, csatWhy;
  const label = agent.team === 'chat' ? 'Chat CSAT' : 'Ticket CSAT';
  if (cPct == null) csatWhy = label + ': no ' + (agent.team === 'chat' ? 'ratings' : 'surveys returned') + ' this month - CSAT incentive needs ' + label + ' above ' + c.above + '%.';
  else {
    const parts = [label + ' ' + Math.round(cPct) + '% (' + cGood + ' ' + c.word + ')'];
    if (cPct > c.above) parts.push('above ' + c.above + '% ok'); else parts.push(c.above + '% or below, need above ' + c.above + '%');
    if (c.minCount) parts.push(cGood >= c.minCount ? 'at least ' + c.minCount + ' ' + c.word + ' ok' : 'fewer than ' + c.minCount + ' ' + c.word);
    if (!cQual) csatWhy = parts.join(', ') + '. CSAT incentive: Not qualified this month.';
    else if (!agent.eligible) csatWhy = parts.join(', ') + '. Not eligible for bonus this period.';
    else if (unplanned) csatWhy = parts.join(', ') + '. CSAT incentive qualified, but unplanned leave this month forfeits it.';
    else { csatAmt = cGood * c.per; csatWhy = parts.join(', ') + '. CSAT incentive: Qualified.'; }
  }
  return {
    month: mi.key, label: mi.label, partial: mi.partial, present, attendanceSource, leave: L, leaveCount, unplanned, factor,
    qa, metrics, points, slab, eligible, why, slabAmt, leaveNote,
    data: { inbound: auto.inbound, outbound: auto.outbound == null ? null : auto.outbound, answered: auto.answered == null ? null : auto.answered, rang: auto.rang == null ? null : auto.rang, surveys: auto.surveys || [], closed: auto.closed, fcrYes: auto.fcrYes, csatGood: auto.csatGood, csatTotal: auto.csatTotal,
      chats: chatsUsed, chatsApi: auto.chats, chatsSource: inp && inp.chats != null ? 'entered' : 'salesiq api', happy, ok, bad, chatSource: hasChatInput ? 'entered' : 'salesiq', chatRatedAuto: auto.happy + auto.ok + auto.bad },
    csat: { good: cGood, total: cTotal, pct: round1(cPct), qualifies: cQual, amount: csatAmt, why: csatWhy },
    total: slabAmt + csatAmt, missing,
    input: inp ? Object.fromEntries(INPUT_COLS.map((k) => [k, inp[k] == null ? null : inp[k]])) : null,
    roster: att && att.marked ? att : null,
  };
}

/** The whole report for a period. */
async function locksFor(keys) {
  if (!keys.length) return new Map();
  const rows = await all(`SELECT * FROM bonus_locks WHERE month IN (${keys.map(() => '?').join(',')})`, keys);
  const m = new Map();
  for (const r of rows) { try { m.set(r.month, { by: r.locked_by, at: r.locked_at, data: JSON.parse(r.data || '{}') }); } catch (e) { /* unreadable lock ignored */ } }
  return m;
}
async function report({ period, agentNames, ignoreLocks = false }) {
  const P = parsePeriod(period);
  const locks = ignoreLocks ? new Map() : await locksFor(P.months.map((m) => m.key));
  let agents = (await agentList()).filter((a) => a.include);
  // Agents paid in a finalised month stay in the report even if they have since been switched off.
  for (const L of locks.values()) for (const x of (L.data.agents || [])) if (!agents.some((a) => a.email === x.agent.email)) agents.push(Object.assign({}, x.agent, { include: true }));
  const emails = agents.map((a) => a.email);
  const inputs = await inputsFor(P.months.map((m) => m.key));
  const warnings = [];
  const rawRatings = [];
  const perMonth = {};
  const needRC = [], needChats = [];
  for (const mi of P.months) {
    if (locks.has(mi.key)) { perMonth[mi.key] = null; continue; }
    let t;
    try { t = await ticketsFromAnalytics(agents, mi); }
    catch (e) {
      warnings.push('Zoho Analytics could not be read for ' + mi.label + ' (' + e.message + '); tickets, FCR and ticket CSAT use the tool\'s own copy, which can be a little lower.');
      const lifecycle = _deps.coldStore ? await _deps.coldStore.pick(_deps.deskLifecycle, mi.from, mi.to) : _deps.deskLifecycle;
      t = await lifecycle.bonusTicketStats({ emails, from: mi.from, to: mi.to, agentNames });
    }
    // Chats: the SalesIQ month read once (complete months); the current month and anything not read yet use the tool's copy.
    const chatAgents = agents.filter((a) => a.team === 'chat');
    let chatMap = null;
    if (chatAgents.length) {
      const cm = await chatsCached(mi), done = cm.get('__done__');
      // v2 = chats and ratings. The current month is read again when the last read is over 30 minutes old.
      const fresh = done && done.source === 'SalesIQ v5' && (!mi.partial || Date.now() - Date.parse(String(done.at).replace(' ', 'T') + 'Z') < 30 * 60e3);
      if (done && done.source === 'SalesIQ v5') chatMap = cm;
      if (!fresh) needChats.push(mi);
    }
    let ch = { byEmail: {}, raw: [] };
    try { ch = await _deps.salesiqLifecycle.chatRatingsForEmails({ emails, from: mi.from, to: mi.to }); } catch (e) { warnings.push('Chats could not be read for ' + mi.label + ': ' + e.message); }
    for (const x of ch.raw || []) rawRatings.push(Object.assign({ month: mi.label }, x));
    const att = await rosterAttendance(agents.map((a) => a.empId).filter(Boolean), mi);
    const callsInfo = await callsFor(agents.filter((a) => a.team === 'calls'), mi, warnings, needRC);
    // Batch 172: the bonus counts calls the agent accepted (queue calls and transfers that landed on them). Rings another agent
    // picked up (Answered Elsewhere), missed rings and voicemails are kept as `rang` only.
    const calls = {}; for (const k of Object.keys(callsInfo)) calls[k] = callsInfo[k].answered;
    perMonth[mi.key] = { t, ch: ch.byEmail || {}, chatMap, att, calls, callsInfo };
  }
  const outAgents = agents.map((a) => {
    const months = {};
    for (const mi of P.months) {
      if (locks.has(mi.key)) {
        const hit = (locks.get(mi.key).data.agents || []).find((x) => x.agent.email === a.email);
        if (hit) { months[mi.key] = Object.assign({}, hit.month, { locked: true }); continue; }
        const z = scoreMonth(a, mi, { inbound: 0, closed: 0, fcrYes: 0, csatGood: 0, csatTotal: 0, chats: 0, happy: 0, ok: 0, bad: 0 }, null, null);
        months[mi.key] = Object.assign(z, { locked: true, notInLock: true, eligible: false, slab: null, slabAmt: 0, total: 0, missing: [],
          why: ['Not part of this month when it was finalised.'], csat: Object.assign({}, z.csat, { amount: 0, why: 'Not part of this month when it was finalised.' }) });
        continue;
      }
      if ((a.fromMonth && mi.key < a.fromMonth) || (a.toMonth && mi.key > a.toMonth)) {
        // Batch 171: not in T1 CS this month (joined later or moved to another team), so nothing is worked out or paid.
        const z = scoreMonth(a, mi, { inbound: 0, closed: 0, fcrYes: 0, csatGood: 0, csatTotal: 0, chats: 0, happy: 0, ok: 0, bad: 0 }, null, null);
        months[mi.key] = Object.assign(z, { outside: true, eligible: false, slab: null, slabAmt: 0, total: 0, missing: [], points: 0,
          why: ['Not in T1 CS this month.'], csat: Object.assign({}, z.csat, { amount: 0, why: 'Not in T1 CS this month.' }) });
        continue;
      }
      const pm = perMonth[mi.key], tt = pm.t[a.email] || {}, cc = pm.ch[a.email] || {};
      const ci = pm.callsInfo[a.email] || {};
      const auto = { outbound: ci.outbound == null ? null : ci.outbound, answered: ci.answered == null ? null : ci.answered, rang: ci.inbound == null ? null : ci.inbound, surveys: tt.surveys || [],
        inbound: pm.calls[a.email] == null ? null : pm.calls[a.email], closed: tt.closed || 0, fcrYes: tt.fcrYes || 0, csatGood: tt.csatGood || 0,
        csatTotal: tt.csatTotal || 0, chats: pm.chatMap ? ((pm.chatMap.get(a.email) || {}).chats || 0) : (cc.chats || 0),
        happy: pm.chatMap ? ((pm.chatMap.get(a.email) || {}).happy || 0) : (cc.happy || 0), ok: pm.chatMap ? ((pm.chatMap.get(a.email) || {}).ok || 0) : (cc.ok || 0),
        bad: pm.chatMap ? ((pm.chatMap.get(a.email) || {}).bad || 0) : (cc.bad || 0) };
      months[mi.key] = scoreMonth(a, mi, auto, inputs.get(mi.key + '|' + a.email), a.empId ? pm.att.get(a.empId) : null);
    }
    const vals = Object.values(months);
    return Object.assign({}, a, { months,
      totals: { slab: vals.reduce((t, x) => t + x.slabAmt, 0), csat: vals.reduce((t, x) => t + x.csat.amount, 0), total: vals.reduce((t, x) => t + x.total, 0),
        eligibleMonths: vals.filter((x) => x.eligible).length } });
  });
  if (needChats.length) {
    startChatsJob(needChats);
    warnings.unshift('Chats handled for ' + needChats.map((m) => m.label).join(', ') + ' are being read from SalesIQ now; until then the chat counts are the tool\'s own copy, which has gaps. Refresh in a few minutes.');
  }
  if (needRC.length) {
    const started = startCallsJob(needRC);
    const ms = [...new Set(needRC.map((x) => x.mi.label))];
    warnings.unshift('Inbound calls for ' + ms.join(', ') + ' are being read from RingCentral now (the tool no longer keeps raw calls that old). Refresh in a few minutes; until then the Inbound Calls metric shows as not available.' + (started ? '' : ''));
  }
  const missing = [];
  for (const a of outAgents) for (const mi of P.months) { const x = a.months[mi.key]; if (!x.locked && x.missing.length) missing.push({ agent: a.name, month: mi.label, what: x.missing }); }
  const chatAgents = outAgents.filter((a) => a.team === 'chat');
  const chatRatingsSeen = chatAgents.some((a) => Object.values(a.months).some((m) => m.data.chatRatedAuto > 0));
  if (chatAgents.length && !chatRatingsSeen) warnings.push('No chat ratings from SalesIQ yet for this period. They are read again in the background after this update; until then enter Happy, Ok and Bad on the Inputs tab.');
  return {
    period: P.key, label: P.label,
    months: P.months.map((m) => { const L = locks.get(m.key); return { key: m.key, label: m.label, long: m.long, partial: m.partial, locked: !!L, lockedBy: L ? L.by : null, lockedAt: L ? L.at : null }; }),
    rules: RULES, agents: outAgents, missing, warnings, rawRatings: rawRatings.slice(0, 20),
    totals: { slab: outAgents.reduce((t, a) => t + a.totals.slab, 0), csat: outAgents.reduce((t, a) => t + a.totals.csat, 0), total: outAgents.reduce((t, a) => t + a.totals.total, 0) },
    generatedAt: new Date().toISOString(),
  };
}

/** Finalise a complete month: keep every agent's numbers and amounts as they are now. */
async function lockMonth({ month, by, agentNames, force }) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw Object.assign(new Error('Pick a month'), { status: 400 });
  const R = await report({ period: month, agentNames, ignoreLocks: true });
  const mi = R.months[0];
  if (mi.partial) throw Object.assign(new Error('A month can be finalised once it has ended'), { status: 400 });
  if (R.warnings.some((w) => /being read/.test(w))) throw Object.assign(new Error('Calls or chats for this month are still being read. Refresh in a few minutes and try again.'), { status: 409 });
  if (R.missing.length && !force) throw Object.assign(new Error('Still to enter: ' + R.missing.map((x) => x.agent + ' (' + x.what.join(', ') + ')').join('; ')), { status: 409 });
  const data = { agents: R.agents.map((a) => ({ agent: { email: a.email, name: a.name, empId: a.empId, doj: a.doj, fullName: a.fullName, team: a.team, eligible: a.eligible, rcId: a.rcId },
    month: a.months[month] })), totals: R.totals, generatedAt: R.generatedAt };
  await run(`INSERT OR REPLACE INTO bonus_locks (month, data, locked_by, locked_at) VALUES (?,?,?,datetime('now'))`, [month, JSON.stringify(data), by || null]);
  return { month, agents: data.agents.length, total: R.totals.total };
}
async function unlockMonth({ month }) { await run(`DELETE FROM bonus_locks WHERE month = ?`, [String(month || '')]); return { month, unlocked: true }; }

// ── Batch 167: SalesIQ operator report upload (Reports > Operator Reports, exported as .xlsx, one calendar month) ──
// Fills Chats Owned and Good/Ok/Bad ratings for the chat team; QA and attendance already entered are kept.
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseRangeMonth(range) {
  const m = String(range || '').match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4}).*?-\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return { error: 'Could not read the report\'s time range.' };
  const m1 = MON3.indexOf(m[1].toLowerCase()) + 1, m2 = MON3.indexOf(m[4].toLowerCase()) + 1, d1 = +m[2], d2 = +m[5], y1 = +m[3], y2 = +m[6];
  const last = new Date(Date.UTC(y1, m1, 0)).getUTCDate();
  if (!m1 || m1 !== m2 || y1 !== y2 || d1 !== 1 || d2 !== last) return { error: `The report covers ${range}. Export one whole calendar month (1st to last day) so it matches a bonus month.` };
  return { month: `${y1}-${String(m1).padStart(2, '0')}` };
}
async function operatorReport({ buf, dry, by }) {
  const { readSheets } = require('./xlsx-lite');
  let sheets; try { sheets = await readSheets(buf); } catch (e) { throw Object.assign(new Error('Could not open the file. Upload the .xlsx exported from SalesIQ Operator Reports.'), { status: 400 }); }
  const name = Object.keys(sheets).find((n) => /operator performance/i.test(n));
  if (!name) throw Object.assign(new Error('This file has no "Operator Performance" sheet. Export Reports > Operator Reports from SalesIQ as Excel.'), { status: 400 });
  const rows = sheets[name], head = (rows[0] || []).map((x) => lc(x));
  const col = (label) => head.indexOf(label);
  const ci = { email: col('operator email'), name: col('operator name'), owned: col('chats owned'), good: col('good rating'), ok: col('ok rating'), bad: col('bad rating') };
  if (Object.values(ci).some((i) => i < 0)) throw Object.assign(new Error('The Operator Performance sheet is missing Chats Owned or the rating columns.'), { status: 400 });
  const pIdx = rows.findIndex((r) => lc(r[0]) === 'portal');
  const cond = pIdx >= 0 && rows[pIdx + 1] ? Object.fromEntries(rows[pIdx].map((k, i) => [lc(k), rows[pIdx + 1][i] || ''])) : {};
  const rng = parseRangeMonth(cond['time range']);
  if (rng.error) throw Object.assign(new Error(rng.error), { status: 400 });
  const month = rng.month;
  const num = (v) => { const n = Number(String(v || '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const byEmail = new Map();
  const endIdx = rows.findIndex((x) => lc(x[0]) === 'conditions');
  for (const r of rows.slice(1, endIdx > 0 ? endIdx : rows.length)) {
    const e = lc(r[ci.email]); if (!e || !e.includes('@')) continue;
    byEmail.set(e, { name: r[ci.name], chats: num(r[ci.owned]), happy: num(r[ci.good]), ok: num(r[ci.ok]), bad: num(r[ci.bad]) });
  }
  const agents = (await agentList()).filter((a) => a.include);
  const locked = (await all(`SELECT month FROM bonus_locks WHERE month = ?`, [month])).length > 0;
  const cur = new Map((await all(`SELECT * FROM bonus_inputs WHERE month = ?`, [month])).map((r) => [lc(r.email), r]));
  const out = [];
  for (const a of agents) {
    const x = byEmail.get(a.email), was = cur.get(a.email) || {};
    out.push({ email: a.email, name: a.name, team: a.team, found: !!x, use: a.team === 'chat' && !!x,
      chats: x ? x.chats : null, happy: x ? x.happy : null, ok: x ? x.ok : null, bad: x ? x.bad : null,
      before: { chats: was.chats ?? null, happy: was.chat_happy ?? null, ok: was.chat_ok ?? null, bad: was.chat_bad ?? null } });
  }
  const res = { month, range: cond['time range'] || '', timeZone: cond['time zone'] || '', operators: cond.operators || '', departments: cond.departments || '', generatedOn: cond['generated on'] || '', locked, rows: out, saved: 0 };
  if (dry) return res;
  if (locked) throw Object.assign(new Error('This month is finalised. Reopen it first to change its inputs.'), { status: 409 });
  const save = [];
  for (const r of out) {
    if (!r.use) continue;
    const was = cur.get(r.email) || {}; const row = { email: r.email };
    for (const c of INPUT_COLS) row[c] = was[c] ?? null;
    Object.assign(row, { chats: r.chats, chat_happy: r.happy, chat_ok: r.ok, chat_bad: r.bad });
    save.push(row);
  }
  if (!save.length) throw Object.assign(new Error('No chat team agent was found in this report.'), { status: 400 });
  const s = await saveInputs({ month, rows: save, by });
  return Object.assign(res, { saved: s.saved });
}

// ── Batch 170: Hall of Fame (agent-facing, no rupee amounts) ──
let _hofCache = null;
const HOF_STATES = { in_progress: 'In progress', confirmed: 'Validated and confirmed' };
async function getHof() {
  const r = (await all(`SELECT * FROM bonus_hof WHERE id = 1`))[0];
  return r ? { period: r.period, status: HOF_STATES[r.status] ? r.status : 'in_progress', visible: !!r.visible, by: r.updated_by, at: r.updated_at }
    : { period: null, status: 'in_progress', visible: false, by: null, at: null };
}
async function setHof({ period, status, visible, by }) {
  const cur = await getHof();
  const p = period != null ? String(period) : cur.period;
  if (p) parsePeriod(p);
  const st = status && HOF_STATES[status] ? status : cur.status;
  const v = visible != null ? !!visible : cur.visible;
  await run(`INSERT OR REPLACE INTO bonus_hof (id, period, status, visible, updated_by, updated_at) VALUES (1,?,?,?,?,datetime('now'))`, [p, st, v ? 1 : 0, by || null]);
  return getHof();
}
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
function hofMonth(a, m, x) {
  const d = x.data || {}, L = x.leave || {};
  const metrics = (x.metrics || []).map((mt) => ({ key: mt.key, label: mt.label, value: mt.value, raw: mt.raw == null ? null : mt.raw, pct: mt.pct, unit: mt.unit, s1: mt.s1, s2: mt.s2, outcome: mt.outcome, points: mt.points, max: mt.max }));
  const counts = a.team === 'chat'
    ? { chats: d.chats, happy: d.happy, ok: d.ok, bad: d.bad, closed: d.closed, fcrYes: d.fcrYes }
    : { inbound: d.inbound, answered: d.answered, closed: d.closed, fcrYes: d.fcrYes, surveysGood: d.csatGood, surveys: d.csatTotal };
  return { key: m.key, label: m.label, long: m.long, partial: m.partial, points: x.points, eligible: !!x.eligible, slab: x.eligible ? x.slab : null,
    present: x.present, leave: { planned: L.pl || 0, sick: L.sl || 0, halfDays: (L.hd_pl || 0) + (L.hd_sl || 0) + (L.hd_upl || 0), unplanned: (L.upl || 0) + (L.hd_upl || 0) + (L.ncns || 0), floater: L.fl || 0, count: x.leaveCount },
    onLeave: x.present === 0 || !!x.outside, // Batch 173: a month with no working days is not judged
    why: x.eligible ? [] : (x.present === 0 ? ['On leave this month.'] : x.outside ? ['Not in T1 CS this month.'] : (x.why || [])), leaveNote: x.eligible ? String(x.leaveNote || '').replace(/Rs\.?\s?[\d,]+/g, '').trim() : '',
    csat: { pct: x.csat ? x.csat.pct : null, good: x.csat ? x.csat.good : 0, total: x.csat ? x.csat.total : 0, qualifies: !!(x.csat && x.csat.qualifies) },
    qa: x.qa, metrics, counts };
}
function hofInsight(a, months) {
  // Batch 173: specific to the agent: only months they worked, what was strong, and for each metric short of Slab 1
  // the month, the value and how much more was needed (in tickets / calls / chats where the metric is a count).
  const due = months.filter((m) => !m.onLeave && m.present > 0);
  if (!due.length) return 'No working days in this quarter, so there is nothing to review.';
  const keys = (due[0].metrics || []).map((mt) => mt.key);
  const nouns = { calls: 'calls', tickets: 'tickets', chats: 'chats' };
  const fmt = (mt, v) => { const x = Math.round(v * 100) / 100; return mt.pct ? x + '%' : String(x); };
  const strong = [], focus = [];
  for (const k of keys) {
    const rows = due.map((m) => ({ m, mt: (m.metrics || []).find((t) => t.key === k) })).filter((r) => r.mt && r.mt.outcome !== 'na' && r.mt.value != null);
    if (!rows.length) continue;
    const lbl = rows[0].mt.label.replace(' / day', '/day');
    if (rows.every((r) => r.mt.outcome === 's1')) { strong.push(lbl); continue; }
    const short = rows.filter((r) => r.mt.outcome !== 's1').map(({ m, mt }) => {
      const tgt = mt.outcome === 'miss' ? mt.s2 : mt.s1, slab = mt.outcome === 'miss' ? 'Slab 2' : 'Slab 1';
      let more = '';
      if (nouns[k] && mt.raw != null && m.present) { const n = Math.max(0, Math.ceil(tgt * m.present - 1e-9) - mt.raw); if (n) more = ', ' + n + ' more ' + (n === 1 ? nouns[k].replace(/s$/, '') : nouns[k]) + ' that month'; }
      else if (k === 'fcr' && m.counts && m.counts.closed) { const n = Math.max(0, Math.ceil(tgt / 100 * m.counts.closed - 1e-9) - (m.counts.fcrYes || 0)); if (n) more = ', ' + n + ' more first-contact resolution' + (n === 1 ? '' : 's'); }
      else if (mt.pct) { const g = Math.round((tgt - mt.value) * 100) / 100; more = ', ' + g + (g === 1 ? ' point' : ' points') + ' short'; }
      return m.label + ' ' + fmt(mt, mt.value) + ' (' + slab + ' needs ' + (mt.pct ? tgt + '%' : tgt) + more + ')';
    });
    focus.push(lbl + ': ' + short.join('; '));
  }
  const parts = [];
  if (strong.length) parts.push('Strong: ' + strong.join(', ') + ' at Slab 1 in every month you worked.');
  if (focus.length) parts.push('To grow: ' + focus.join('. ') + '.');
  const days = due.filter((m) => m.present < RULES.minDays);
  if (days.length) parts.push('Present days were below ' + RULES.minDays + ' in ' + days.map((m) => m.label + ' (' + m.present + ')').join(', ') + ', so ' + (days.length > 1 ? 'those months were' : 'that month was') + ' not eligible.');
  if (!parts.length) parts.push('Keep the same pace next quarter.');
  return parts.join(' ');
}
function initials(n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''); }
async function hofView({ viewerEmail, isAdmin, agentNames }) {
  const cfg = await getHof();
  if (!cfg.period) return { ready: false, status: cfg.status, visible: cfg.visible, isAdmin };
  if (!cfg.visible && !isAdmin) return { ready: false, hidden: true, status: cfg.status, isAdmin };
  // Many agents open the page at once: the report is shared for 2 minutes.
  const ck = cfg.period + '|' + cfg.at;
  let R = _hofCache && _hofCache.k === ck && Date.now() - _hofCache.t < 120e3 ? _hofCache.R : null;
  if (!R) { R = await report({ period: cfg.period, agentNames }); _hofCache = { k: ck, t: Date.now(), R }; }
  const me = lc(viewerEmail);
  const shortLabel = String(R.label).replace(/\s*\(.*\)$/, '');
  const people = R.agents.filter((a) => a.hof !== false).map((a) => {
    const months = R.months.map((m) => hofMonth(a, m, a.months[m.key]));
    return { email: a.email, name: a.name, initials: initials(a.name), team: a.team, inBonus: !!a.eligible, months,
      total: months.reduce((t, m) => t + (m.points || 0), 0), eligibleMonths: months.filter((m) => m.eligible).length, insight: hofInsight(a, months) };
  });
  const board = people.filter((p) => p.inBonus).map((p) => ({ name: p.name, initials: p.initials, team: p.team, total: p.total, eligibleMonths: p.eligibleMonths,
    months: p.months.map((m) => ({ label: m.label, points: m.points, eligible: m.eligible, slab: m.slab })) }))
    .sort((x, y) => y.total - x.total || y.eligibleMonths - x.eligibleMonths || x.name.localeCompare(y.name));
  // Awards, from the agents in the bonus only.
  const inB = people.filter((p) => p.inBonus), awards = [];
  const avg = (p, k) => { const v = p.months.map((m) => (m.metrics.find((mt) => mt.key === k) || {}).value).filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };
  if (inB.length) {
    const star = inB.slice().sort((x, y) => y.total - x.total || y.eligibleMonths - x.eligibleMonths)[0];
    awards.push({ key: 'star', title: 'Star of ' + shortLabel.split(' ')[0], winners: [star.name], desc: star.total + ' pts across ' + R.months.length + ' month(s), eligible ' + star.eligibleMonths + '/' + R.months.length });
    if (R.months.length > 1) {
      // Batch 173: ties share the award.
      const gains = inB.map((p) => ({ p, d: p.months[p.months.length - 1].points - p.months[0].points })).filter((x) => x.d > 0);
      const best = gains.length ? Math.max(...gains.map((x) => x.d)) : 0, imps = gains.filter((x) => x.d === best);
      if (imps.length) awards.push({ key: 'improved', title: 'Most Improved', winners: imps.map((x) => x.p.name), desc: imps.map((x) => x.p.name.split(' ')[0] + ' ' + x.p.months.map((m) => m.points).join(' → ')).join(' · ') + ' pts' });
      const iron = inB.filter((p) => p.eligibleMonths === R.months.length && !p.months.some((m) => m.partial));
      if (iron.length) awards.push({ key: 'iron', title: 'Iron Consistency', winners: iron.map((p) => p.name), desc: 'Eligible every month of ' + shortLabel });
    }
    const perfect = inB.filter((p) => p.months.some((m) => m.points === 100));
    if (perfect.length) awards.push({ key: 'perfect', title: 'Perfect Score Club', winners: perfect.map((p) => p.name), desc: perfect.map((p) => p.name.split(' ')[0] + ' (' + p.months.filter((m) => m.points === 100).map((m) => m.label).join(', ') + ')').join(' · ') });
    const fcr = inB.map((p) => ({ p, v: avg(p, 'fcr') })).filter((x) => x.v != null).sort((x, y) => y.v - x.v)[0];
    if (fcr) awards.push({ key: 'fcr', title: 'FCR Excellence', winners: [fcr.p.name], desc: 'Average FCR ' + r1(fcr.v) + '%' });
    const qa = inB.map((p) => ({ p, v: avg(p, 'qa') })).filter((x) => x.v != null).sort((x, y) => y.v - x.v)[0];
    if (qa) awards.push({ key: 'qa', title: 'Quality Champion', winners: [qa.p.name], desc: 'Average QA ' + r1(qa.v) + '%' });
  }
  const mine = people.filter((p) => isAdmin || p.email === me);
  return {
    ready: true, isAdmin, period: R.period, label: shortLabel, longLabel: R.label, status: cfg.status, statusLabel: HOF_STATES[cfg.status], statusAt: cfg.at, visible: cfg.visible,
    months: R.months.map((m) => ({ key: m.key, label: m.label, long: m.long, partial: m.partial, locked: m.locked })),
    rules: { minPoints: RULES.minPoints, minDays: RULES.minDays }, board, awards,
    blueprints: mine.map((p) => ({ name: p.name, initials: p.initials, team: p.team, inBonus: p.inBonus, total: p.total, eligibleMonths: p.eligibleMonths, insight: p.insight, months: p.months, self: p.email === me })),
    generatedAt: R.generatedAt,
  };
}

module.exports = { getHof, setHof, hofView, operatorReport, lockMonth, unlockMonth, chatDiag, setDB, setDeps, initSchema, RULES, parsePeriod, agentList, saveAgent, saveInputs, report, scoreMonth, leaveFactor, INPUT_COLS };
