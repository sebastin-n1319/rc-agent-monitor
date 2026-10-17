'use strict';
/**
 * Batch 166: the two downloads for the bonus page.
 *  - calcWorkbook: the admin / Finance workbook (performance data, attendance, slab calculation, CSAT incentive, bonus
 *    summary with rupee amounts).
 *  - cardsWorkbook: the agent report cards (how each metric scored and why eligible or not). No rupee amounts, ever.
 */
const X = require('./xlsx-lite');
const c = (v, s) => ({ v, s });
const SL = { s1: 'Slab 1', s2: 'Slab 2', miss: 'Missed', na: 'Not entered' };
const slabCell = (o) => o === 's1' ? c('Slab 1', 's1') : o === 's2' ? c('Slab 2', 's2') : c('', 'text');
const pctOrDash = (v) => v == null ? c('-', 'miss') : c(v / 100, 'pct');
function teamAgents(R, team) { return R.agents.filter((a) => a.team === team); }
function fmtDay(v, unit) { return v == null ? '-' : (Math.round(v * 100) / 100).toFixed(2) + ' ' + unit; }

function perfSheet(R, team) {
  const months = R.months, isChat = team === 'chat';
  const cols = isChat ? ['Present Days', 'Chats Handled', 'Tickets Closed', 'QA Score', 'FCR %', 'Chat CSAT %'] : ['Present Days', 'Inbound Calls', 'Tickets Closed', 'QA Score', 'FCR %', 'Ticket CSAT %'];
  const rows = [], merges = [];
  rows.push([c('T1 Customer Support - ' + (isChat ? 'Chat' : 'Calls') + ' Team Performance', 'title')]);
  rows.push([c(R.label + '  -  Monthly performance metrics  -  Data only', 'sub')]);
  rows.push([]);
  const h1 = [c('Emp Id', 'head'), c('Agent', 'head'), c('DOJ', 'head'), c('Eligible for Bonus', 'head')];
  const h2 = [c('', 'head'), c('', 'head'), c('', 'head'), c('', 'head')];
  months.forEach((m, i) => { const start = 4 + i * cols.length; h1.push(c(m.label + (m.partial ? ' (to date)' : ''), 'section')); for (let k = 1; k < cols.length; k++) h1.push(c('', 'section'));
    merges.push(X.colName(start) + '4:' + X.colName(start + cols.length - 1) + '4'); cols.forEach((t) => h2.push(c(t, 'head'))); });
  rows.push(h1, h2);
  for (let k = 0; k < 4; k++) merges.push(X.colName(k) + '4:' + X.colName(k) + '5');
  for (const a of teamAgents(R, team)) {
    const r = [c(a.empId || '', 'text'), c(a.name, 'bold'), c(a.doj || '', 'text'), c(a.eligible ? 'Yes' : 'No', a.eligible ? 'ok' : 'bad')];
    for (const m of months) {
      const x = a.months[m.key], d = x.data;
      const csat = isChat ? (d.happy + d.ok + d.bad ? d.happy / (d.happy + d.ok + d.bad) * 100 : null) : (d.csatTotal ? d.csatGood / d.csatTotal * 100 : null);
      r.push(x.present == null ? c('-', 'miss') : c(x.present, 'num1'), c(isChat ? d.chats : d.inbound, 'num'), c(d.closed, 'num'),
        x.qa == null ? c('-', 'miss') : c(x.qa / 100, 'pct'), d.closed ? c(d.fcrYes / d.closed, 'pct') : c('-', 'miss'), csat == null ? c('-', 'miss') : c(csat / 100, 'pct'));
    }
    rows.push(r);
  }
  rows.push([]);
  rows.push([c('Inbound calls: RingCentral calls the agent accepted (queue calls and transfers). Rings another agent picked up, missed rings and voicemails are not counted. Tickets closed: Zoho tickets the agent owns that closed in the month. FCR: closed tickets resolved within 24 business hours (Mon-Fri 7 AM-7 PM Central) with no reopen. Ticket CSAT: Good / all ticket surveys returned in the month. Chats and chat ratings: SalesIQ. QA and attendance: entered on the Bonus page.', 'note')]);
  return { name: isChat ? 'Chat Team' : 'Calls Team', rows, merges, cols: [9, 18, 12, 10].concat(months.flatMap(() => cols.map(() => 11))), freeze: { row: 5, col: 2 } };
}

function attendanceSheet(R) {
  const rows = [[c('T1 Customer Support - Attendance', 'title')], [c(R.label + '  -  Monthly leave & presence summary', 'sub')], []];
  rows.push(['Month', 'Emp Id', 'Agent', 'Team', 'Present', 'Planned Leave', 'Sick Leave', 'Half Day Planned', 'Half Day Sick', 'Unplanned Leave', 'Half Day Unplanned', 'NCNS', 'Floater', 'Leave Count', 'Source'].map((t) => c(t, 'head')));
  for (const m of R.months) for (const a of R.agents) {
    const x = a.months[m.key], L = x.leave;
    rows.push([c(m.label, 'text'), c(a.empId || '', 'text'), c(a.name, 'text'), c(a.team === 'chat' ? 'Chat' : 'Calls', 'text'),
      x.present == null ? c('-', 'miss') : c(x.present, 'num1'), c(L.pl, 'num1'), c(L.sl, 'num1'), c(L.hd_pl, 'num1'), c(L.hd_sl, 'num1'),
      c(L.upl, L.upl ? 'bad' : 'num1'), c(L.hd_upl, L.hd_upl ? 'bad' : 'num1'), c(L.ncns, L.ncns ? 'bad' : 'num1'), c(L.fl || 0, 'num1'), c(x.leaveCount, 'num'),
      c(x.attendanceSource === 'entered' ? 'Entered' : x.attendanceSource === 'roster' ? 'Roster' : 'Missing', x.attendanceSource === 'missing' ? 'bad' : 'text')]);
  }
  rows.push([]);
  rows.push([c('Leave count = planned + sick + half of each planned or sick half day, rounded down; floater leave is not counted (0 = 100%, 1-2 = 75%, 3 = 50%, more than 3 = 0% of the slab bonus). Any unplanned leave, half day or NCNS removes the slab bonus and the CSAT incentive for that month.', 'note')]);
  return { name: 'Attendance', rows, cols: [9, 9, 18, 8, 9, 10, 9, 10, 9, 10, 11, 7, 9, 9], freeze: { row: 4, col: 3 } };
}

function calcSheet(R) {
  const months = R.months, rows = [], merges = [];
  const sec = (t) => { rows.push([]); rows.push([c(t, 'section')]); };
  rows.push([c('T1 CS Bonus Calculation - ' + R.label, 'title')]);
  rows.push([c('Rules: T1 CS Bonus Structure 2026 with the Q3 2026 clarifications (FCR by 24 business hours and no reopen; overall slab by majority, tie to Slab 1; half-day planned leave counts 0.5; floater leave is not counted; any unplanned leave forfeits the month).', 'sub')]);
  for (const team of ['calls', 'chat']) {
    const list = teamAgents(R, team); if (!list.length) continue;
    const metrics = R.rules[team];
    sec('T1 CS ' + (team === 'chat' ? 'CHAT' : 'CALLS') + ' TEAM');
    const h1 = [c('Employees', 'head')], h2 = [c('', 'head')];
    metrics.forEach((mt) => { const st = h1.length; h1.push(c(mt.label.replace(' / day', '') + ' (' + mt.pts + ')', 'head')); for (let k = 1; k < months.length; k++) h1.push(c('', 'head'));
      if (months.length > 1) merges.push(X.colName(st) + (rows.length + 1) + ':' + X.colName(st + months.length - 1) + (rows.length + 1));
      months.forEach((m) => h2.push(c(m.long, 'head'))); });
    rows.push(h1, h2);
    for (const a of list) { const r = [c(a.name, 'bold')]; metrics.forEach((mt) => months.forEach((m) => { const x = a.months[m.key].metrics.find((y) => y.key === mt.key); r.push(slabCell(x && x.outcome)); })); rows.push(r); }
  }
  sec('OVERALL POINTS, ELIGIBILITY & SLAB (both teams)');
  const g1 = [c('Employees', 'head')], g2 = [c('', 'head')];
  const blocks = ['Overall Points /100', 'Eligibility (>=70 pts & >=18 days)', 'Overall Slab', 'Leave factor', 'Slab Bonus'];
  blocks.forEach((b) => { const st = g1.length; g1.push(c(b, 'head')); for (let k = 1; k < months.length; k++) g1.push(c('', 'head'));
    if (months.length > 1) merges.push(X.colName(st) + (rows.length + 1) + ':' + X.colName(st + months.length - 1) + (rows.length + 1)); months.forEach((m) => g2.push(c(m.long, 'head'))); });
  rows.push(g1, g2);
  for (const a of R.agents) {
    const r = [c(a.name, 'bold')];
    months.forEach((m) => r.push(c(a.months[m.key].points, 'num')));
    months.forEach((m) => { const x = a.months[m.key]; r.push(x.outside ? c('Not in T1 CS', 'miss') : x.eligible ? c('Eligible', 'ok') : c('Not Eligible', 'bad')); });
    months.forEach((m) => { const x = a.months[m.key]; r.push(x.eligible && x.slab ? slabCell(x.slab) : c('-', 'miss')); });
    months.forEach((m) => { const x = a.months[m.key]; r.push(x.unplanned ? c('Unplanned', 'bad') : c(Math.round(x.factor * 100) + '%', 'miss')); });
    months.forEach((m) => r.push(c(a.months[m.key].slabAmt, 'money')));
    rows.push(r);
  }
  sec('Good (Ticket) & Happy (Chat) CSAT Ratings');
  const ch = [c('Employee', 'head'), c('Type', 'head')]; months.forEach((m) => ch.push(c(m.long + ' count', 'head'), c(m.long + ' CSAT %', 'head'), c(m.long + ' Qualified', 'head'))); ch.push(c('Total', 'head'), c('Bonus Amount', 'head'));
  rows.push(ch);
  let csatTotal = 0;
  for (const a of R.agents) {
    const r = [c(a.name, 'bold'), c(a.team === 'chat' ? 'Chats (Happy)' : 'Tickets (Good)', 'text')]; let n = 0, amt = 0;
    months.forEach((m) => { const x = a.months[m.key].csat; n += x.good; amt += x.amount; r.push(c(x.good, 'num'), pctOrDash(x.pct), x.amount ? c('Yes', 'ok') : c('No', 'miss')); });
    r.push(c(n, 'num'), c(amt, 'money')); csatTotal += amt; rows.push(r);
  }
  const tr = [c('', 'bold'), c('Grand Total', 'bold')]; months.forEach(() => tr.push(c('', 'bold'), c('', 'bold'), c('', 'bold'))); tr.push(c('', 'bold'), c(csatTotal, 'boldMoney')); rows.push(tr);
  return { name: 'Calculation', rows, merges, cols: [18].concat(Array.from({ length: 40 }, () => 12)), freeze: { row: 0, col: 1 } };
}

function summarySheet(R) {
  const rows = [[c('T1 Customer Support - ' + R.label + ' Bonus Summary', 'title')],
    [c('Slab bonus + CSAT incentive by agent. Slab bonus depends on points, eligibility and planned leave; the CSAT incentive is separate and not reduced by planned leave. Any unplanned leave removes both for that month.', 'sub')], []];
  const h = [c('Emp Id', 'head'), c('Agent', 'head'), c('Team', 'head')];
  R.months.forEach((m) => h.push(c(m.label + ' Slab', 'head'), c(m.label + ' CSAT', 'head')));
  h.push(c('Slab Total', 'head'), c('CSAT Total', 'head'), c('Bonus Amount', 'head'));
  rows.push(h);
  for (const a of R.agents) {
    const r = [c(a.empId || '', 'text'), c(a.name, 'bold'), c(a.team === 'chat' ? 'Chat' : 'Calls', 'text')];
    R.months.forEach((m) => { const x = a.months[m.key]; r.push(c(x.slabAmt, 'money'), c(x.csat.amount, 'money')); });
    r.push(c(a.totals.slab, 'money'), c(a.totals.csat, 'money'), c(a.totals.total, 'boldMoney'));
    rows.push(r);
  }
  const t = [c('', 'bold'), c('Sum Total', 'bold'), c('', 'bold')];
  R.months.forEach((m) => { t.push(c(R.agents.reduce((s, a) => s + a.months[m.key].slabAmt, 0), 'boldMoney'), c(R.agents.reduce((s, a) => s + a.months[m.key].csat.amount, 0), 'boldMoney')); });
  t.push(c(R.totals.slab, 'boldMoney'), c(R.totals.csat, 'boldMoney'), c(R.totals.total, 'boldMoney'));
  rows.push(t);
  if (R.missing.length) { rows.push([]); rows.push([c('Still to enter before this is final:', 'section')]); for (const x of R.missing) rows.push([c(x.agent, 'text'), c(x.month, 'text'), c(x.what.join(', '), 'bad')]); }
  if (R.months.some((m) => m.partial)) { rows.push([]); rows.push([c('The current month is to date only; per-day numbers use the present days so far.', 'note')]); }
  const fin = R.months.filter((m) => m.locked);
  rows.push([]);
  rows.push([c(fin.length ? 'Finalised: ' + fin.map((m) => m.label + ' (' + (m.lockedBy || 'admin') + ', ' + String(m.lockedAt || '').slice(0, 10) + ')').join(', ') + '. ' : '', 'note')]);
  const open_ = R.months.filter((m) => !m.locked);
  if (open_.length) rows.push([c('Not finalised yet: ' + open_.map((m) => m.label).join(', ') + '. These can still change if Zoho, RingCentral or SalesIQ data changes.', 'note')]);
  return { name: 'Bonus Summary', rows, cols: [9, 18, 7].concat(R.months.flatMap(() => [12, 12])).concat([13, 13, 14]), freeze: { row: 4, col: 2 } };
}

async function calcWorkbook(R) {
  const sheets = [summarySheet(R)];
  if (teamAgents(R, 'calls').length) sheets.push(perfSheet(R, 'calls'));
  if (teamAgents(R, 'chat').length) sheets.push(perfSheet(R, 'chat'));
  sheets.push(attendanceSheet(R), calcSheet(R));
  return X.build(sheets);
}

// ── Report cards (agent-facing: no rupee amounts) ──
function cardSheet(R, team) {
  const isChat = team === 'chat', rows = [], merges = [];
  rows.push([c('T1 Customer Support - ' + (isChat ? 'Chat' : 'Calls') + ' Performance Report Card', 'title')]);
  rows.push([c(R.label + '  -  Your monthly performance, how each metric scored, and why you are / aren\'t eligible', 'sub')]);
  rows.push([c('How it works:  Each metric is scored to Slab 1 (top), Slab 2 (base) or Missed. You need >= 70 total points AND >= 18 present days to be eligible. Your overall Slab = the tier most of your scoring metrics reached (a tie counts as Slab 1).', 'sub')]);
  rows.push([c('Leave rules:  Planned leave reduces the slab bonus (0 days = 100%, 1-2 = 75%, 3 = 50%, more than 3 = 0%; a half day counts as 0.5; floater leave is not counted).  ANY unplanned leave in a month, a half day included, forfeits BOTH the slab bonus and the CSAT incentive for that month.  This report shows eligibility and performance only - payout amounts are handled separately by the finance team.', 'sub')]);
  for (const a of teamAgents(R, team)) {
    rows.push([]);
    const el = R.months.filter((m) => a.months[m.key].eligible && a.months[m.key].slab);
    rows.push([c(a.name + '   (' + (isChat ? 'Chat' : 'Calls') + ' Team' + (a.empId ? '  -  Emp Id ' + a.empId : '') + ')', 'section')]);
    merges.push('A' + rows.length + ':F' + rows.length);
    rows.push([c(R.label + ' eligibility:  Slab bonus eligible in ' + el.length + ' of ' + R.months.length + ' month(s)    -    ' +
      R.months.map((m) => { const x = a.months[m.key]; return m.label + ': ' + (x.eligible && x.slab ? SL[x.slab] : 'Not eligible'); }).join('   |   ') +
      (a.eligible ? '' : '    (not eligible for bonus this period)'), 'bold')]);
    merges.push('A' + rows.length + ':F' + rows.length);
    for (const m of R.months) {
      const x = a.months[m.key];
      rows.push([]);
      rows.push([c(m.label + (m.partial ? ' (to date)' : ''), 'bold')]);
      rows.push(['Metric', 'Your Result', 'Slab 1 needs', 'Slab 2 needs', 'Outcome', 'Points'].map((t) => c(t, 'head')));
      for (const mt of x.metrics) {
        const res = mt.value == null ? (mt.key === 'qa' ? 'Not entered' : '-') : mt.pct ? mt.value.toFixed(2) + '%' : fmtDay(mt.value, mt.unit);
        const need = (v) => mt.pct ? '>= ' + v + '%' : '>= ' + v + ' ' + mt.unit;
        rows.push([c(mt.label, 'text'), c(res, 'miss'), c(need(mt.s1), 'miss'), c(need(mt.s2), 'miss'),
          mt.outcome === 's1' ? c('Slab 1 ok', 's1') : mt.outcome === 's2' ? c('Slab 2 ok', 's2') : c(mt.outcome === 'na' ? 'Not entered' : 'Missed', 'miss'),
          c(mt.points + ' / ' + mt.max, 'miss')]);
      }
      rows.push([c('TOTAL POINTS', 'bold'), c(x.points + ' / 100', 'bold'), c('Present days', 'bold'), c(x.present == null ? 'Not entered' : String(x.present) + ' days', 'bold'),
        x.eligible ? c('ELIGIBLE - ' + SL[x.slab], 'ok') : c('NOT ELIGIBLE', 'bad'), c('', 'bold')]);
      if (!x.eligible) { rows.push([c('Why not eligible: ' + x.why.join('  '), 'note')]); }
      else if (x.leaveNote) rows.push([c(x.leaveNote.replace(/^Not eligible for bonus this period.*/, 'Not eligible for bonus this period.'), 'note')]);
      rows.push([c(x.csat.why.replace(/^Not eligible for bonus this period\./, ''), 'note')]);
    }
  }
  return { name: isChat ? 'Chat Team Report' : 'Calls Team Report', rows, merges, cols: [24, 18, 18, 18, 22, 10] };
}
async function cardsWorkbook(R) {
  const sheets = [];
  if (teamAgents(R, 'calls').length) sheets.push(cardSheet(R, 'calls'));
  if (teamAgents(R, 'chat').length) sheets.push(cardSheet(R, 'chat'));
  if (!sheets.length) sheets.push({ name: 'Report', rows: [[c('No agents included', 'title')]] });
  return X.build(sheets);
}

// ── Batch 168: the two workbooks Finance gets, laid out like the Q2 2026 sheets ──
//  - financeCalcWorkbook: "Calculation Only" (slab per metric per month, overall points / eligibility / slab, bonus summary, CSAT ratings).
//  - financeDataWorkbook: "Bonus Data" (team totals, calls, chats + CSAT, FCR, ticket survey returns, attendance, QA).
const FIN_ORDER = { calls: ['tickets', 'calls', 'qa', 'fcr'], chat: ['chats', 'chatCsat', 'tickets', 'qa', 'fcr'] };
const FIN_LABEL = { tickets: 'Tickets Points', calls: 'Inbound Calls Points', qa: 'QA Score', fcr: 'FCR', chats: 'Average Unique Chats Handled', chatCsat: 'Chat CSAT%' };
const FIN_LABEL_CHAT = { tickets: 'Tickets Closed' };
function finAgents(R) { return teamAgents(R, 'calls').concat(teamAgents(R, 'chat')); }
function financeCalcSheet(R) {
  const months = R.months, rows = [], merges = [];
  const head2 = (blocks) => {
    const h1 = [c('Employees', 'head')], h2 = [c('', 'head')];
    blocks.forEach((b) => { const st = h1.length; h1.push(c(b, 'head')); for (let k = 1; k < months.length; k++) h1.push(c('', 'head'));
      if (months.length > 1) merges.push(X.colName(st) + (rows.length + 1) + ':' + X.colName(st + months.length - 1) + (rows.length + 1));
      months.forEach((m) => h2.push(c(m.long + (m.partial ? ' (to date)' : ''), 'head'))); });
    merges.push('A' + (rows.length + 1) + ':A' + (rows.length + 2));
    rows.push(h1, h2);
  };
  const section = (t) => { if (rows.length) rows.push([]); rows.push([c(t, 'section')]); };
  rows.push([c(String(R.label).replace(/\s*\(.*\)$/, '') + ' Calculation Only - T1 CS', 'title')]);
  for (const team of ['calls', 'chat']) {
    const list = teamAgents(R, team); if (!list.length) continue;
    section(team === 'chat' ? 'T1 CS CHAT TEAM' : 'T1 CS CALLS TEAM');
    const keys = FIN_ORDER[team];
    head2(keys.map((k) => (team === 'chat' && FIN_LABEL_CHAT[k]) || FIN_LABEL[k]));
    for (const a of list) {
      const r = [c(a.name, 'bold')];
      keys.forEach((k) => months.forEach((m) => { const x = (a.months[m.key].metrics || []).find((y) => y.key === k); r.push(slabCell(x && x.outcome)); }));
      rows.push(r);
    }
  }
  section('OVERALL POINTS, ELIGIBILITY & SLAB (both teams)');
  head2(['Overall Points /100', 'Eligibility (>=70 pts & >=18 days)', 'Overall Slab']);
  for (const a of finAgents(R)) {
    const r = [c(a.name, 'bold')];
    months.forEach((m) => r.push(c(a.months[m.key].points, 'num')));
    months.forEach((m) => { const x = a.months[m.key]; r.push(x.outside ? c('Not in T1 CS', 'miss') : x.eligible ? c('Eligible', 'ok') : c('Not Eligible', 'bad')); });
    months.forEach((m) => { const x = a.months[m.key]; r.push(x.eligible && x.slab ? slabCell(x.slab) : c('-', 'miss')); });
    rows.push(r);
  }
  section('Bonus Summary ' + R.period);
  rows.push(['Employee', 'Team', 'Bonus Amount'].map((t) => c(t, 'head')));
  for (const a of finAgents(R)) rows.push([c(a.name, 'bold'), c(a.team === 'chat' ? 'Chat' : 'Calls', 'text'), c(a.totals.total, 'money')]);
  rows.push([c('', 'bold'), c('Sum Total', 'bold'), c(R.totals.total, 'boldMoney')]);
  section('Good(Ticket) & Happy(Chat) CSAT Ratings');
  rows.push([c('Employee', 'head'), c('Type', 'head')].concat(months.map((m) => c(m.long, 'head'))).concat([c('Total', 'head'), c('Bonus Amount', 'head')]));
  let csatSum = 0;
  for (const a of finAgents(R)) {
    let n = 0, amt = 0; const r = [c(a.name, 'bold'), c(a.team === 'chat' ? 'Chats' : 'Tickets', 'text')];
    months.forEach((m) => { const x = a.months[m.key].csat; n += x.good; amt += x.amount; r.push(c(x.good, 'num')); });
    r.push(c(n, 'num'), c(amt, 'money')); csatSum += amt; rows.push(r);
  }
  const g = [c('', 'bold'), c('Grand Total', 'bold')]; months.forEach(() => g.push(c('', 'bold'))); g.push(c('', 'bold'), c(csatSum, 'boldMoney')); rows.push(g);
  rows.push([]);
  rows.push([c('Rules: T1 CS Bonus Structure 2026. Eligible = 70 points or more and 18 present days or more. Overall slab = the slab most scoring metrics reached (a tie counts as Slab 1). Slab 1 Rs. 7,500, Slab 2 Rs. 3,000, reduced for planned leave (0 days 100%, 1-2 days 75%, 3 days 50%, more than 3 days 0%; a half day counts 0.5; floater leave is not counted). Any unplanned leave forfeits the month. CSAT incentive: calls Rs. 150 per Good ticket survey when ticket CSAT is above 92%; chat Rs. 50 per Happy rating when chat CSAT is above 85% with at least 5 Happy. Bonus Amount includes the CSAT incentive.', 'note')]);
  const fin = months.filter((m) => m.locked), open_ = months.filter((m) => !m.locked);
  rows.push([c((fin.length ? 'Finalised: ' + fin.map((m) => m.label).join(', ') + '. ' : '') + (open_.length ? 'Not finalised: ' + open_.map((m) => m.label).join(', ') + '.' : ''), 'note')]);
  return { name: 'Correct Calculation', rows, merges, cols: [20].concat(Array.from({ length: 20 }, () => 12)), freeze: { row: 0, col: 1 } };
}
async function financeCalcWorkbook(R) { return X.build([financeCalcSheet(R)]); }

function pctNum(n, d) { return d ? c(n / d, 'pct') : c('-', 'miss'); }
async function financeDataWorkbook(R) {
  const months = R.months, calls = teamAgents(R, 'calls'), chat = teamAgents(R, 'chat'), all_ = finAgents(R), sheets = [];
  const sum = (list, f) => list.reduce((t, a) => t + months.reduce((u, m) => u + (Number(f(a.months[m.key])) || 0), 0), 0);
  // Team Data
  const inb = sum(calls, (x) => x.data.inbound), outb = sum(calls, (x) => x.data.outbound), rang = sum(calls, (x) => x.data.rang);
  const chats = sum(chat, (x) => x.data.chats), sG = sum(all_, (x) => x.data.csatGood), sT = sum(all_, (x) => x.data.csatTotal);
  const cl = sum(all_, (x) => x.data.closed), fy = sum(all_, (x) => x.data.fcrYes);
  const qas = []; for (const a of all_) for (const m of months) if (a.months[m.key].qa != null) qas.push(a.months[m.key].qa);
  const cg = sum(chat, (x) => x.data.happy), cr = sum(chat, (x) => (x.data.happy || 0) + (x.data.ok || 0) + (x.data.bad || 0));
  sheets.push({ name: 'Team Data', cols: [26, 14], rows: [
    [c('T1 CS Team Data - ' + R.label, 'title')], [],
    [c('Total Inbound Calls', 'bold'), c(inb, 'num')], [c('Total Outbound Calls', 'bold'), c(outb, 'num')],
    [c('Answered % (rings taken)', 'bold'), pctNum(inb, rang)], [c('Total Chats', 'bold'), c(chats, 'num')],
    [c('Chat CSAT %', 'bold'), pctNum(cg, cr)], [c('C-Sat Survey (tickets)', 'bold'), c(sG + '/' + sT, 'text')], [c('C-Sat % (tickets)', 'bold'), pctNum(sG, sT)],
    [c('Tickets Closed', 'bold'), c(cl, 'num')], [c('Ticket FCR %', 'bold'), pctNum(fy, cl)],
    [c('QA Score (average)', 'bold'), qas.length ? c(qas.reduce((t, v) => t + v, 0) / qas.length / 100, 'pct') : c('-', 'miss')],
    [], [c('Calls from RingCentral (calls team), chats from the SalesIQ operator report (chat team), tickets, FCR and ticket surveys from Zoho, QA and attendance as entered on the Bonus page.', 'note')]] });
  // Calls
  const cr_ = [[c('T1 CS Calls - ' + R.label, 'title')], [], ['Month', 'Name', 'Ext', 'Total Calls', 'Inbound (accepted)', 'Direction- Outbound', 'Rang (incl. picked up by others)'].map((t) => c(t, 'head'))];
  for (const m of months) for (const a of calls) { const d = a.months[m.key].data; const i = d.inbound, o = d.outbound;
    cr_.push([c(m.label, 'text'), c(a.name, 'bold'), c(a.extension || '', 'text'), i == null && o == null ? c('-', 'miss') : c((i || 0) + (o || 0), 'num'), i == null ? c('-', 'miss') : c(i, 'num'), o == null ? c('-', 'miss') : c(o, 'num'), d.rang == null ? c('-', 'miss') : c(d.rang, 'num')]); }
  sheets.push({ name: 'Calls', rows: cr_, cols: [9, 18, 8, 11, 14, 15, 14], freeze: { row: 3, col: 2 } });
  // Chats + CSAT
  const ch_ = [[c('T1 CS Chats + CSAT - ' + R.label, 'title')], [], ['Month', 'Operator Name', 'Operator Email', 'Chats Owned', 'Good Rating', 'Ok Rating', 'Bad Rating', 'CSAT %'].map((t) => c(t, 'head'))];
  for (const m of months) for (const a of chat) { const d = a.months[m.key].data, rt = (d.happy || 0) + (d.ok || 0) + (d.bad || 0);
    ch_.push([c(m.label, 'text'), c(a.name, 'bold'), c(a.email, 'text'), c(d.chats || 0, 'num'), c(d.happy || 0, 'num'), c(d.ok || 0, 'num'), c(d.bad || 0, 'num'), pctNum(d.happy || 0, rt)]); }
  ch_.push([], [c('Chats Owned and ratings: SalesIQ Reports > Operator Reports (Operator Performance) for each month. CSAT % = Good / (Good + Ok + Bad).', 'note')]);
  sheets.push({ name: 'Chats + CSAT', rows: ch_, cols: [9, 18, 28, 12, 11, 10, 10, 10], freeze: { row: 3, col: 2 } });
  // FCR
  const merges = [], fr = [[c('T1 Team - ' + R.label + ' Monthwise First Call Resolution (FCR)', 'title')], []];
  const h1 = [c('Emp / Agent', 'head')], h2 = [c('', 'head')];
  months.concat([{ label: 'Total' }]).forEach((m) => { const st = h1.length; h1.push(c(m.label, 'section'), c('', 'section'), c('', 'section')); merges.push(X.colName(st) + '3:' + X.colName(st + 2) + '3');
    h2.push(c('Closed', 'head'), c('FCR Yes', 'head'), c(m.label === 'Total' ? 'Overall FCR %' : 'FCR %', 'head')); });
  merges.push('A3:A4'); fr.push(h1, h2);
  const tot = months.map(() => [0, 0]); let tc = 0, tf = 0;
  for (const a of all_.slice().sort((x, y) => x.name.localeCompare(y.name))) {
    const r = [c(a.name, 'bold')]; let ac = 0, af = 0;
    months.forEach((m, i) => { const d = a.months[m.key].data; r.push(c(d.closed, 'num'), c(d.fcrYes, 'num'), pctNum(d.fcrYes, d.closed)); ac += d.closed; af += d.fcrYes; tot[i][0] += d.closed; tot[i][1] += d.fcrYes; });
    r.push(c(ac, 'boldNum'), c(af, 'boldNum'), pctNum(af, ac)); tc += ac; tf += af; fr.push(r);
  }
  const tr = [c('Team Total', 'bold')]; tot.forEach(([x, y]) => tr.push(c(x, 'boldNum'), c(y, 'boldNum'), pctNum(y, x))); tr.push(c(tc, 'boldNum'), c(tf, 'boldNum'), pctNum(tf, tc)); fr.push(tr);
  fr.push([], [c('Note: FCR % = (tickets with Resolution Time in Business Hours <= 24 hrs AND 0 reopens) / total Closed tickets, grouped by Ticket Closed Time month. Business hours: Mon-Fri 7 AM-7 PM CST. Source: Zoho Analytics Tickets, by Ticket Owner Name.', 'note')]);
  sheets.push({ name: 'FCR', rows: fr, merges, cols: [20].concat(Array.from({ length: (months.length + 1) * 3 }, () => 10)), freeze: { row: 4, col: 1 } });
  // CSAT - Ticket Survey Return
  const sv = [['Survey Rating', 'Survey Time', 'Ticket Owner Name', 'Request Id', 'Ticket Closed Time', 'Month'].map((t) => c(t, 'head'))];
  const piv = [];
  for (const m of months) for (const a of all_) {
    const list = (a.months[m.key].data.surveys || []).slice().sort((x, y) => String(x.rating).localeCompare(String(y.rating)) || String(x.surveyTime).localeCompare(String(y.surveyTime)));
    for (const x of list) sv.push([c(x.rating, 'text'), c(String(x.surveyTime || '').replace('T', ' ').slice(0, 19), 'text'), c(x.owner || a.name, 'text'), c(x.requestId, 'text'), c(x.closed, 'text'), c(m.label, 'text')]);
    const d = a.months[m.key].data; if (d.csatTotal) piv.push([a.name, m.label, d.csatTotal - d.csatGood, d.csatGood, d.csatTotal]);
  }
  sv.push([], [c('Summary', 'section')], ['Ticket Owner Name', 'Month', 'Not Good', 'Good', 'Grand Total', 'CSAT %'].map((t) => c(t, 'head')));
  for (const p of piv) sv.push([c(p[0], 'bold'), c(p[1], 'text'), c(p[2], 'num'), c(p[3], 'num'), c(p[4], 'num'), pctNum(p[3], p[4])]);
  sv.push([], [c('Surveys returned on tickets the agent owns, counted in the month the ticket closed. Ticket CSAT % = Good / all surveys returned.', 'note')]);
  sheets.push({ name: 'CSAT - Ticket Survey Return', rows: sv, cols: [13, 20, 20, 11, 20, 9], freeze: { row: 1, col: 0 } });
  // Attendance
  const at = [['Month', 'Emp Id', 'Name', 'Present', 'UPL', 'PL', 'SL', 'NCNS', 'HD SL', 'HD UPL', 'HD PL', 'Floater'].map((t) => c(t, 'head'))];
  for (const m of months) for (const a of all_) { const x = a.months[m.key], L = x.leave || {};
    at.push([c(m.label, 'text'), c(a.empId || '', 'text'), c(a.name, 'bold'), x.present == null ? c('-', 'miss') : c(x.present, 'num1'), c(L.upl || 0, 'num1'), c(L.pl || 0, 'num1'), c(L.sl || 0, 'num1'), c(L.ncns || 0, 'num1'), c(L.hd_sl || 0, 'num1'), c(L.hd_upl || 0, 'num1'), c(L.hd_pl || 0, 'num1'), c(L.fl || 0, 'num1')]); }
  at.push([], [c('From the T1 CS Team Roster. Present counts a half day as 0.5. Sixth-day (weekend) shifts are paid separately and are not counted here.', 'note')]);
  sheets.push({ name: 'Attendance', rows: at, cols: [9, 9, 18, 9, 7, 7, 7, 7, 7, 8, 7], freeze: { row: 1, col: 3 } });
  // QA
  for (const [team, nm, src] of [['calls', 'QA - Calls', 'Zoho CRM Call Audits: average Total Score by Audit Complete Date month, leaving out Disconnected and Not Relevant audits.'], ['chat', 'QA - Chats', 'Chat Audit Form: average Score of non-fatal audits by Month, x 10.']]) {
    const list = teamAgents(R, team); if (!list.length) continue;
    const q = [[c('Agent', 'head')].concat(months.map((m) => c(m.label, 'head'))).concat([c('Average', 'head')])];
    for (const a of list) { const v = months.map((m) => a.months[m.key].qa).filter((x) => x != null);
      q.push([c(a.name, 'bold')].concat(months.map((m) => { const x = a.months[m.key].qa; return x == null ? c('-', 'miss') : c(x / 100, 'pct'); })).concat([v.length ? c(v.reduce((t, x) => t + x, 0) / v.length / 100, 'boldPct') : c('-', 'miss')])); }
    q.push([], [c('QA score as entered on the Bonus page. Source: ' + src, 'note')]);
    sheets.push({ name: nm, rows: q, cols: [20].concat(months.map(() => 11)).concat([11]) });
  }
  return X.build(sheets);
}
module.exports = { calcWorkbook, cardsWorkbook, financeCalcWorkbook, financeDataWorkbook };
