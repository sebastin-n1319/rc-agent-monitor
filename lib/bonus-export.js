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
function fmtDay(v, unit) { return v == null ? '-' : (Math.round(v * 10) / 10).toFixed(1) + ' ' + unit; }

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
  rows.push([c('Inbound calls: RingCentral inbound calls on the agent\'s extension. Tickets closed: Zoho tickets the agent owns that closed in the month. FCR: closed tickets resolved within 24 business hours (Mon-Fri 7 AM-7 PM Central) with no reopen. Ticket CSAT: Good / all ticket surveys returned in the month. Chats and chat ratings: SalesIQ. QA and attendance: entered on the Bonus page.', 'note')]);
  return { name: isChat ? 'Chat Team' : 'Calls Team', rows, merges, cols: [9, 18, 12, 10].concat(months.flatMap(() => cols.map(() => 11))), freeze: { row: 5, col: 2 } };
}

function attendanceSheet(R) {
  const rows = [[c('T1 Customer Support - Attendance', 'title')], [c(R.label + '  -  Monthly leave & presence summary', 'sub')], []];
  rows.push(['Month', 'Emp Id', 'Agent', 'Team', 'Present', 'Planned Leave', 'Sick Leave', 'Half Day Planned', 'Half Day Sick', 'Unplanned Leave', 'Half Day Unplanned', 'NCNS', 'Leave Count', 'Source'].map((t) => c(t, 'head')));
  for (const m of R.months) for (const a of R.agents) {
    const x = a.months[m.key], L = x.leave;
    rows.push([c(m.label, 'text'), c(a.empId || '', 'text'), c(a.name, 'text'), c(a.team === 'chat' ? 'Chat' : 'Calls', 'text'),
      x.present == null ? c('-', 'miss') : c(x.present, 'num1'), c(L.pl, 'num1'), c(L.sl, 'num1'), c(L.hd_pl, 'num1'), c(L.hd_sl, 'num1'),
      c(L.upl, L.upl ? 'bad' : 'num1'), c(L.hd_upl, L.hd_upl ? 'bad' : 'num1'), c(L.ncns, L.ncns ? 'bad' : 'num1'), c(x.leaveCount, 'num'),
      c(x.attendanceSource === 'entered' ? 'Entered' : x.attendanceSource === 'roster' ? 'Roster' : 'Missing', x.attendanceSource === 'missing' ? 'bad' : 'text')]);
  }
  rows.push([]);
  rows.push([c('Leave count = planned + sick + half of each planned or sick half day, rounded down (0 = 100%, 1-2 = 75%, 3 = 50%, more than 3 = 0% of the slab bonus). Any unplanned leave, half day or NCNS removes the slab bonus and the CSAT incentive for that month.', 'note')]);
  return { name: 'Attendance', rows, cols: [9, 9, 18, 8, 9, 10, 9, 10, 9, 10, 11, 7, 9, 9], freeze: { row: 4, col: 3 } };
}

function calcSheet(R) {
  const months = R.months, rows = [], merges = [];
  const sec = (t) => { rows.push([]); rows.push([c(t, 'section')]); };
  rows.push([c('T1 CS Bonus Calculation - ' + R.label, 'title')]);
  rows.push([c('Rules: T1 CS Bonus Structure 2026 with the Q3 2026 clarifications (FCR by 24 business hours and no reopen; overall slab by majority, tie to Slab 1; half-day planned leave counts 0.5; any unplanned leave forfeits the month).', 'sub')]);
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
    months.forEach((m) => { const x = a.months[m.key]; r.push(x.eligible ? c('Eligible', 'ok') : c('Not Eligible', 'bad')); });
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
  rows.push([c('Leave rules:  Planned leave reduces the slab bonus (0 days = 100%, 1-2 = 75%, 3 = 50%, more than 3 = 0%; a half day counts as 0.5).  ANY unplanned leave in a month, a half day included, forfeits BOTH the slab bonus and the CSAT incentive for that month.  This report shows eligibility and performance only - payout amounts are handled separately by the finance team.', 'sub')]);
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
        const res = mt.value == null ? (mt.key === 'qa' ? 'Not entered' : '-') : mt.pct ? mt.value.toFixed(1) + '%' : fmtDay(mt.value, mt.unit);
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
module.exports = { calcWorkbook, cardsWorkbook };
