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
  // Inbound calls per agent per Chicago month, kept once a month is complete (the tool's raw call copy only holds 45 days).
  await run(`CREATE TABLE IF NOT EXISTS bonus_chats (month TEXT NOT NULL, email TEXT NOT NULL, chats INTEGER, source TEXT,
    at TEXT DEFAULT (datetime('now')), PRIMARY KEY (month, email))`);
  for (const col of ['happy INTEGER', 'ok INTEGER', 'bad INTEGER']) { try { await run(`ALTER TABLE bonus_chats ADD COLUMN ${col}`); } catch (e) { /* there */ } }
  await run(`CREATE TABLE IF NOT EXISTS bonus_calls (month TEXT NOT NULL, email TEXT NOT NULL, inbound INTEGER, answered INTEGER,
    outbound INTEGER, source TEXT, at TEXT DEFAULT (datetime('now')), PRIMARY KEY (month, email))`);
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
  const rows = await an.fetchTicketsView({ selectedColumns: ['ID', 'Ticket Owner Name', 'Resolution Time in Business Hours', 'Number of Reopen'],
    criteria: `"Ticket Closed Time" >= '${f}' AND "Ticket Closed Time" < '${t}'` });
  const byName = new Map(); for (const a of agents) { byName.set(lc(a.name), a.email); if (a.fullName) byName.set(lc(a.fullName), a.email); }
  const out = {}, idsBy = {};
  for (const a of agents) { out[a.email] = { closed: 0, fcrYes: 0, csatGood: 0, csatTotal: 0 }; idsBy[a.email] = []; }
  for (const r of rows) {
    const e = byName.get(lc(r['Ticket Owner Name'])); if (!e) continue;
    out[e].closed++;
    const ms = Number(String(r['Resolution Time in Business Hours'] == null ? '' : r['Resolution Time in Business Hours']).replace(/,/g, ''));
    const reopen = Number(String(r['Number of Reopen'] == null ? '0' : r['Number of Reopen']).replace(/,/g, '')) || 0;
    if (isFinite(ms) && String(r['Resolution Time in Business Hours'] ?? '') !== '' && ms / 3600000 <= 24 && reopen === 0) out[e].fcrYes++;
    if (r['ID'] != null) idsBy[e].push(String(r['ID']));
  }
  for (const e of Object.keys(idsBy)) {
    const ids = idsBy[e];
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400);
      const sv = await all(`SELECT rating FROM desk_ticket_survey WHERE ticket_id IN (${part.map(() => '?').join(',')}) AND rating IS NOT NULL`, part);
      for (const x of sv) { out[e].csatTotal++; if (x.rating === 'Good') out[e].csatGood++; }
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
      SUM(CASE WHEN direction='Inbound' AND lower(COALESCE(result,'')) NOT IN ('missed','abandoned','voicemail') AND COALESCE(is_voicemail,0)=0 THEN 1 ELSE 0 END) AS ans,
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
    if (c && !mi.partial) { out[a.email] = { inbound: c.inbound, answered: c.answered, source: c.source }; continue; }
    if (!a.rcId) { out[a.email] = { inbound: 0, answered: 0, source: 'no RingCentral extension' }; continue; }
    if (covered) {
      const x = await callsFromLogs(a, mi);
      out[a.email] = { inbound: x.inbound, answered: x.answered, source: 'tool call log' };
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
  const out = [];
  for (const a of monitored) {
    if (!a.email) continue;
    const email = lc(a.email), name = a.name || email, r = rosterByEmail.get(email) || {}, s = saved.get(email);
    const defTeam = DEFAULT_TEAM[lc(name)] || DEFAULT_TEAM[lc(r.pseudo)] || null;
    out.push({
      email, name, empId: r.emp_id || null, doj: r.doj || null, fullName: r.full_name || null,
      rcId: a.rc_id || a.extension || null, extension: a.extension || null,
      team: (s && s.team) || defTeam || 'calls',
      include: s && s.include != null ? !!s.include : !!defTeam,
      eligible: s && s.eligible != null ? !!s.eligible : !DEFAULT_NOT_ELIGIBLE.has(lc(name)),
    });
  }
  return out.sort((x, y) => (x.team === y.team ? x.name.localeCompare(y.name) : x.team === 'calls' ? -1 : 1));
}
async function saveAgent({ email, team, include, eligible, by }) {
  const e = lc(email); if (!e) throw Object.assign(new Error('Pick an agent'), { status: 400 });
  const cur = (await all(`SELECT * FROM bonus_agents WHERE email = ?`, [e]))[0] || {};
  const list = await agentList(); const def = list.find((x) => x.email === e) || {};
  const t = team === 'chat' || team === 'calls' ? team : (cur.team || def.team || 'calls');
  const inc = include != null ? (include ? 1 : 0) : (cur.include != null ? cur.include : (def.include ? 1 : 0));
  const el = eligible != null ? (eligible ? 1 : 0) : (cur.eligible != null ? cur.eligible : (def.eligible ? 1 : 0));
  await run(`INSERT OR REPLACE INTO bonus_agents (email, team, include, eligible, updated_by, updated_at) VALUES (?,?,?,?,?,datetime('now'))`, [e, t, inc, el, by || null]);
  return { email: e, team: t, include: !!inc, eligible: !!el };
}

// ── Inputs ──
const INPUT_COLS = ['qa', 'present', 'pl', 'hd_pl', 'sl', 'hd_sl', 'upl', 'hd_upl', 'ncns', 'chat_happy', 'chat_ok', 'chat_bad', 'chats'];
function numOrNull(v) {
  if (v == null) return null; const t = String(v).trim().replace(/%$/, ''); if (t === '' || t === '-') return null;
  const n = Number(t); return isFinite(n) ? n : null;
}
async function saveInputs({ month, rows, by }) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw Object.assign(new Error('Pick a month'), { status: 400 });
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
    const a = out.get(r.emp_id) || { present: 0, pl: 0, hd_pl: 0, sl: 0, hd_sl: 0, upl: 0, hd_upl: 0, ncns: 0, marked: 0 };
    const n = r.n || 0; a.marked += n;
    switch (r.status) {
      case 'present': case 'wfh': case 'on_duty': a.present += n; break;
      case 'pl': a.pl += n; break; case 'hd_pl': a.hd_pl += n; a.present += 0.5 * n; break;
      case 'sl': a.sl += n; break; case 'hd_sl': a.hd_sl += n; a.present += 0.5 * n; break;
      case 'upl': case 'absent': a.upl += n; break; case 'hd_upl': a.hd_upl += n; a.present += 0.5 * n; break;
      case 'ncns': a.ncns += n; break;
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
  for (const k of ['pl', 'hd_pl', 'sl', 'hd_sl', 'upl', 'hd_upl', 'ncns']) L[k] = pick(k) || 0;
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
    return { key: m.key, label: m.label, value: round1(v), raw: raw[m.key] != null ? raw[m.key] : null, pct: !!m.pct, unit: m.unit || '',
      s1: m.s1, s2: m.s2, outcome: out, points: out === 's1' || out === 's2' ? m.pts : 0, max: m.pts };
  });
  const points = metrics.reduce((t, x) => t + x.points, 0);
  const missing = [];
  if (qa == null) missing.push('QA score');
  if (agent.team === 'calls' && auto.inbound == null) missing.push('inbound calls (reading from RingCentral)');
  // SalesIQ's API under-counts chats against its own operator report, so Chats Owned is entered from that report.
  if (present == null) missing.push('attendance');
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
    data: { inbound: auto.inbound, closed: auto.closed, fcrYes: auto.fcrYes, csatGood: auto.csatGood, csatTotal: auto.csatTotal,
      chats: chatsUsed, chatsApi: auto.chats, chatsSource: inp && inp.chats != null ? 'entered' : 'salesiq api', happy, ok, bad, chatSource: hasChatInput ? 'entered' : 'salesiq', chatRatedAuto: auto.happy + auto.ok + auto.bad },
    csat: { good: cGood, total: cTotal, pct: round1(cPct), qualifies: cQual, amount: csatAmt, why: csatWhy },
    total: slabAmt + csatAmt, missing,
    input: inp ? Object.fromEntries(INPUT_COLS.map((k) => [k, inp[k] == null ? null : inp[k]])) : null,
    roster: att && att.marked ? att : null,
  };
}

/** The whole report for a period. */
async function report({ period, agentNames }) {
  const P = parsePeriod(period);
  const agents = (await agentList()).filter((a) => a.include);
  const emails = agents.map((a) => a.email);
  const inputs = await inputsFor(P.months.map((m) => m.key));
  const warnings = [];
  const rawRatings = [];
  const perMonth = {};
  const needRC = [], needChats = [];
  for (const mi of P.months) {
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
    const calls = {}; for (const k of Object.keys(callsInfo)) calls[k] = callsInfo[k].inbound;
    perMonth[mi.key] = { t, ch: ch.byEmail || {}, chatMap, att, calls, callsInfo };
  }
  const outAgents = agents.map((a) => {
    const months = {};
    for (const mi of P.months) {
      const pm = perMonth[mi.key], tt = pm.t[a.email] || {}, cc = pm.ch[a.email] || {};
      const auto = { inbound: pm.calls[a.email] == null ? null : pm.calls[a.email], closed: tt.closed || 0, fcrYes: tt.fcrYes || 0, csatGood: tt.csatGood || 0,
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
  for (const a of outAgents) for (const mi of P.months) { const x = a.months[mi.key]; if (x.missing.length) missing.push({ agent: a.name, month: mi.label, what: x.missing }); }
  const chatAgents = outAgents.filter((a) => a.team === 'chat');
  const chatRatingsSeen = chatAgents.some((a) => Object.values(a.months).some((m) => m.data.chatRatedAuto > 0));
  if (chatAgents.length && !chatRatingsSeen) warnings.push('No chat ratings from SalesIQ yet for this period. They are read again in the background after this update; until then enter Happy, Ok and Bad on the Inputs tab.');
  return {
    period: P.key, label: P.label, months: P.months.map((m) => ({ key: m.key, label: m.label, long: m.long, partial: m.partial })),
    rules: RULES, agents: outAgents, missing, warnings, rawRatings: rawRatings.slice(0, 20),
    totals: { slab: outAgents.reduce((t, a) => t + a.totals.slab, 0), csat: outAgents.reduce((t, a) => t + a.totals.csat, 0), total: outAgents.reduce((t, a) => t + a.totals.total, 0) },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { chatDiag, setDB, setDeps, initSchema, RULES, parsePeriod, agentList, saveAgent, saveInputs, report, scoreMonth, leaveFactor, INPUT_COLS };
