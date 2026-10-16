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
      rcId: a.rc_id || a.extension || null,
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
const INPUT_COLS = ['qa', 'present', 'pl', 'hd_pl', 'sl', 'hd_sl', 'upl', 'hd_upl', 'ncns', 'chat_happy', 'chat_ok', 'chat_bad'];
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
    calls: present ? auto.inbound / present : null,
    tickets: present ? auto.closed / present : null,
    chats: present ? auto.chats / present : null,
    qa,
    fcr: auto.closed ? auto.fcrYes / auto.closed * 100 : null,
    chatCsat: chatRated ? happy / chatRated * 100 : null,
  };
  const raw = { calls: auto.inbound, tickets: auto.closed, chats: auto.chats };
  const metrics = rules.map((m) => {
    const v = values[m.key], out = outcomeFor(m, v);
    return { key: m.key, label: m.label, value: round1(v), raw: raw[m.key] != null ? raw[m.key] : null, pct: !!m.pct, unit: m.unit || '',
      s1: m.s1, s2: m.s2, outcome: out, points: out === 's1' || out === 's2' ? m.pts : 0, max: m.pts };
  });
  const points = metrics.reduce((t, x) => t + x.points, 0);
  const missing = [];
  if (qa == null) missing.push('QA score');
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
      chats: auto.chats, happy, ok, bad, chatSource: hasChatInput ? 'entered' : 'salesiq', chatRatedAuto: auto.happy + auto.ok + auto.bad },
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
  for (const mi of P.months) {
    const lifecycle = _deps.coldStore ? await _deps.coldStore.pick(_deps.deskLifecycle, mi.from, mi.to) : _deps.deskLifecycle;
    const t = await lifecycle.bonusTicketStats({ emails, from: mi.from, to: mi.to, agentNames });
    let ch = { byEmail: {}, raw: [] };
    try { ch = await _deps.salesiqLifecycle.chatRatingsForEmails({ emails, from: mi.from, to: mi.to }); } catch (e) { warnings.push('Chats could not be read for ' + mi.label + ': ' + e.message); }
    for (const x of ch.raw || []) rawRatings.push(Object.assign({ month: mi.label }, x));
    const att = await rosterAttendance(agents.map((a) => a.empId).filter(Boolean), mi);
    const calls = {};
    for (const a of agents) {
      if (!a.rcId) { calls[a.email] = 0; continue; }
      try { const cs = await _deps.getAgentCallStatsRange({ agentId: a.rcId, from: mi.from, to: mi.to }); calls[a.email] = cs ? (cs.inboundOffered || 0) : 0; }
      catch (e) { calls[a.email] = 0; warnings.push('Calls could not be read for ' + a.name + ' (' + mi.label + ').'); }
    }
    perMonth[mi.key] = { t, ch: ch.byEmail || {}, att, calls };
  }
  const outAgents = agents.map((a) => {
    const months = {};
    for (const mi of P.months) {
      const pm = perMonth[mi.key], tt = pm.t[a.email] || {}, cc = pm.ch[a.email] || {};
      const auto = { inbound: pm.calls[a.email] || 0, closed: tt.closed || 0, fcrYes: tt.fcrYes || 0, csatGood: tt.csatGood || 0,
        csatTotal: tt.csatTotal || 0, chats: cc.chats || 0, happy: cc.happy || 0, ok: cc.ok || 0, bad: cc.bad || 0 };
      months[mi.key] = scoreMonth(a, mi, auto, inputs.get(mi.key + '|' + a.email), a.empId ? pm.att.get(a.empId) : null);
    }
    const vals = Object.values(months);
    return Object.assign({}, a, { months,
      totals: { slab: vals.reduce((t, x) => t + x.slabAmt, 0), csat: vals.reduce((t, x) => t + x.csat.amount, 0), total: vals.reduce((t, x) => t + x.total, 0),
        eligibleMonths: vals.filter((x) => x.eligible).length } });
  });
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

module.exports = { setDB, setDeps, initSchema, RULES, parsePeriod, agentList, saveAgent, saveInputs, report, scoreMonth, leaveFactor, INPUT_COLS };
