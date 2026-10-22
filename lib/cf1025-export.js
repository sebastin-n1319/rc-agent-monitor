'use strict';
/** Batch 187: the 1025 Call Flow page as an Excel workbook, one sheet per tab. */
const X = require('./xlsx-lite');
const H = (arr) => arr.map(v => ({ v, s: 'head' }));
const T = (v) => ({ v, s: 'title' });
const S = (v) => ({ v, s: 'section' });
const N = (v) => (v == null || v === '' ? '' : { v: Number(v), s: 'num' });
const P = (v) => (v == null || v === '' ? '' : { v: Number(v) / 100, s: 'pct' });
const MK = ['fwd', 'decl', 'ring', 'xfer'];

async function workbook(a) {
  const range = `${a.range.from} to ${a.range.to}${a.range.weekdays ? ' (Mon to Fri only)' : ''}`;
  const sheets = [];
  // Summary
  const sum = [[T('1025 Call Flow: Summary')], [range], [], H(['Path', 'Calls', 'Share', 'Missed or voicemail', 'Miss rate'])];
  a.byPath.forEach(p => sum.push([p.label, N(p.calls), P(p.share), N(p.missedVm), P(p.missRate)]));
  sum.push(['Total', N(a.total)], [], [S('Weekly trend')], H(['Week of', 'Business days', 'Total'].concat(Object.values(a.paths)).concat(['Via person per business day', 'Via person share'])));
  a.weekly.forEach(w => sum.push([w.week, N(w.bizDays), N(w.total)].concat(Object.keys(a.paths).map(k => N(w[k]))).concat([N(w.viaPersonPerBizDay), P(w.viaPersonShare)])));
  sum.push([], [S('How calls came via a person')], H(['Mechanism', 'Calls', 'Share']));
  a.mechanisms.forEach(m => sum.push([m.label, N(m.calls), P(m.share)]));
  sum.push(['Sent via the main IVR again', N(a.viaMainIvr)]);
  sheets.push({ name: 'Summary', rows: sum, cols: [40, 14, 12, 18, 12, 14, 14, 14, 16, 14] });
  // Daywise
  const dw = [[T('Daywise')], [range], [], H(['Date', 'Straight from IVR'].concat(a.groups.map(g => 'Via ' + g)).concat(['Via a person total', 'VoIP queue (1501)', 'Sales queue (1004)', 'Other system', 'Direct', 'Total', 'Missed or VM', 'Via person share']))];
  a.daywise.forEach(d => dw.push([d.date + (d.weekend ? ' (weekend)' : ''), N(d.ivr)].concat(a.groups.map(g => N(d['via_' + g]))).concat([N(d.viaPerson), N(d.voipq), N(d.salesq), N(d.othersys), N(d.direct), N(d.total), N(d.missedVm), P(d.viaPersonShare)])));
  sheets.push({ name: 'Daywise', rows: dw, cols: [20].concat(Array(18).fill(12)), freeze: { row: 4, col: 1 } });
  // By person
  const bp = [[T('By person')], [range], [], H(['Ext', 'Name', 'Team', 'RC department', 'Total', 'Auto-forwarded', 'Declined or offline', 'Rang out', 'Answered then transferred', 'Via main IVR'].concat(a.weekKeys.map(w => 'Week ' + w)).concat(['Missed or VM at 1025', 'First seen', 'Last seen']))];
  a.byPerson.forEach(p => bp.push([p.ext, p.name, p.team, p.rc_department, N(p.total)].concat(MK.map(k => N(p.mech[k]))).concat([N(p.viaMainIvr)]).concat(a.weekKeys.map(w => N(p.weeks[w] || 0))).concat([N(p.missedVm), String(p.first).slice(0, 10), String(p.last).slice(0, 10)])));
  sheets.push({ name: 'By Person', rows: bp, cols: [8, 24, 16, 22, 8, 12, 12, 10, 12, 10].concat(a.weekKeys.map(() => 12)).concat([12, 12, 12]), freeze: { row: 4, col: 2 } });
  // By team
  const bt = [[T('By team')], [range], [], H(['Team', 'Group', 'People', 'Total', 'Auto-forwarded', 'Declined or offline', 'Rang out', 'Answered then transferred', 'Via main IVR', 'Missed or VM at 1025'].concat(a.weekKeys.map(w => 'Week ' + w)))];
  a.byTeam.forEach(t => bt.push([t.team, t.group, N(t.people), N(t.total)].concat(MK.map(k => N(t.mech[k]))).concat([N(t.viaMainIvr), N(t.missedVm)]).concat(a.weekKeys.map(w => N(t.weeks[w] || 0)))));
  bt.push([], [S('Queue rollovers')], H(['Ext', 'Queue', 'Calls', 'Missed or VM at 1025']));
  a.queues.forEach(q => bt.push([q.ext, q.name, N(q.calls), N(q.missedVm)]));
  sheets.push({ name: 'By Team', rows: bt, cols: [22, 12, 8, 8, 12, 12, 10, 12, 10, 12, 12, 12, 12, 12, 12] });
  // Call detail
  const cd = [[T('Call detail')], [range], [], H(['Start (Central)', 'Caller number', 'Caller', 'Number dialed', 'Path', 'Mechanism', 'Via main IVR', 'From ext', 'From', 'Team', 'Result at 1025', 'Seconds at 1025', 'Answered by', 'Talk seconds', 'Full path'])];
  (a.detail || []).forEach(c => cd.push([new Date(c.call_start_utc).toLocaleString('en-US', { timeZone: 'America/Chicago' }), c.caller_number, c.caller_name, c.number_dialed, c.pathLabel, c.mechLabel, c.via_main_ivr ? 'Yes' : '', c.origin_ext || '', c.origin_name || '', c.teamShort || '', c.result, N(c.duration_1025_sec), c.answered_by || '', N(c.talk_sec), c.full_path]));
  sheets.push({ name: 'Call Detail', rows: cd, cols: [20, 16, 24, 16, 22, 30, 8, 8, 20, 14, 12, 10, 18, 10, 60], freeze: { row: 4, col: 1 } });
  // Fix list
  const fx = [[T('RC Fix List')], [range + '. Priority: High if 5 or more in the last 5 business days or 10 or more in the range; Medium if at least 1 in the last 5 days.'], [], H(['Priority', 'Ext', 'Name', 'Team', 'Last 5 business days', 'In range', 'Auto-forwarded', 'Declined or offline', 'Rang out', 'Answered then transferred', 'Via main IVR', 'What to change in RingCentral', 'Done', 'Date fixed', 'Calls since fix', 'Notes'])];
  a.fixList.forEach(f => fx.push([f.priority, f.ext, f.name, f.team, N(f.last5), N(f.total)].concat(MK.map(k => N(f.mech[k]))).concat([N(f.viaMainIvr), { v: f.change, s: 'wrap' }, f.done ? 'Y' : 'N', f.dateFixed, f.sinceFix == null ? '' : N(f.sinceFix), f.notes])));
  fx.push([], [S('Queues')], H(['Priority', 'Ext', 'Queue', 'Calls', 'What to change']));
  a.fixQueues.forEach(q => fx.push([q.priority, q.ext, q.name, N(q.calls), { v: q.change, s: 'wrap' }]));
  sheets.push({ name: 'RC Fix List', rows: fx, cols: [9, 7, 22, 14, 10, 9, 10, 10, 9, 10, 9, 70, 6, 12, 10, 30], freeze: { row: 4, col: 3 } });
  // Compare
  const c = a.compare; const row = (label, k, pctFmt) => { const x = c.a[k], y = c.b[k]; return [label, pctFmt ? P(x) : N(x), pctFmt ? P(y) : N(y), pctFmt ? N(Math.round((y - x) * 10) / 10) : N(y - x), x && !pctFmt ? P(Math.round((y - x) / x * 1000) / 10) : '']; };
  const cp = [[T('Last 5 days: compare')], [`Window A ${c.A.from} to ${c.A.to}, window B ${c.B.from} to ${c.B.to}`], [], H(['Metric', 'Window A', 'Window B', 'Change', 'Change %'])];
  [['Total', 'total'], ['Straight from IVR', 'ivr'], ['Via a person', 'person'], ['VoIP queue', 'voipq'], ['Sales queue', 'salesq'], ['Direct', 'direct']].forEach(([l, k]) => cp.push(row(l, k)));
  a.groups.forEach(g => cp.push(row('Via ' + g, 'via_' + g)));
  [['Answered', 'answered'], ['Missed', 'missed'], ['Voicemail', 'voicemail']].forEach(([l, k]) => cp.push(row(l, k)));
  cp.push(row('Missed plus voicemail rate', 'missRate', true));
  [['Unique callers', 'unique'], ['Same-day repeat calls', 'sameDay'], ['Repeats after a missed or VM call', 'afterMissVm'], ['T1 tickets created', 'tickets']].forEach(([l, k]) => cp.push(row(l, k)));
  cp.push([], [S('Daily trend')], H(['Date', 'Total', 'IVR', 'Via person', 'Tech CSM', 'Tech OB', 'VoIP queue', 'Missed or VM', 'T1 tickets']));
  c.trend.forEach(d => cp.push([d.date, N(d.total), N(d.ivr), N(d.viaPerson), N(d.techCsm), N(d.techOb), N(d.voipq), N(d.missedVm), N(d.tickets)]));
  sheets.push({ name: 'Last 5 Days', rows: cp, cols: [34, 12, 12, 10, 10, 10, 10, 12, 10] });
  // Why
  const wy = [[T('Why analysis')], [], [S('Summary')]].concat(a.why.summary.map(s => [{ v: s, s: 'wrap' }]));
  wy.push([], [S('T1 ticket topics')], H(['Topic', 'Earlier', 'Prior window', 'Last window', 'Change', 'Change %']));
  a.why.topics.forEach(t => wy.push([t.topic, N(t.earlier), N(t.prior), N(t.last), N(t.change), t.changePct == null ? '' : P(t.changePct)]));
  wy.push([], [S('Spotlight issues per day')], H(['Date'].concat(a.why.spotNames)));
  a.why.spotDays.forEach(d => wy.push([d.date].concat(a.why.spotNames.map(n => N(d[n])))));
  wy.push([], [S('Data limits')]); a.limits.forEach(l => wy.push([{ v: l, s: 'wrap' }]));
  sheets.push({ name: 'Why Analysis', rows: wy, cols: [90, 12, 14, 14, 10, 10] });
  // Roster
  const r = a.roster; const ro = [[T('Calls roster')], [`Average talk ${r.talkSec}s, AHT ${r.ahtSec}s (wrap-up ${a.params.wrapMin} min), busy-day x${a.params.busyMult}, service level ${Math.round(a.params.sl * 100)}% in ${a.params.answerSec}s, max occupancy ${Math.round(a.params.maxOcc * 100)}%. ${r.dst.text}`], [],
    H(['Hour (Central)'].concat(r.hourLabels)), ['IST'].concat(r.istLabels), ['Avg weekday calls'].concat(r.demand.map(N)), ['Busy-day calls'].concat(r.busyDemand.map(N)), ['Agents needed (Erlang C)'].concat(r.need.map(N)),
    ['On floor, current'].concat(r.current.map(N)), ['Gap, current'].concat(r.gapCurrent.map(N)), ['On floor, proposed'].concat(r.proposed.map(N)), ['Gap, proposed'].concat(r.gapProposed.map(N)),
    [`Agent-hours short: current ${r.shortCurrent}, proposed ${r.shortProposed}`], [], [S('Day plan, current (W work, B break)')], H(['Agent'].concat(r.hourLabels))];
  r.gridCurrent.forEach(g => ro.push([g.name].concat(g.cells)));
  ro.push([], [S('Day plan, proposed')], H(['Agent'].concat(r.hourLabels))); r.gridProposed.forEach(g => ro.push([g.name].concat(g.cells)));
  ro.push([], [S('Weekly roster, Mon to Fri')], H(['Agent', 'Shift (Central)', 'Break (Central)', 'IST until DST change', 'Break IST until', 'IST after DST change', 'Break IST after']));
  r.week.rows.forEach(w => ro.push([w.name, w.ct, w.breakCt, w.istUntil, w.breakIstUntil, w.istAfter, w.breakIstAfter]));
  ro.push([], [S('Warnings')]); (r.warnings.length ? r.warnings : [{ text: 'None' }]).forEach(w => ro.push([{ v: w.text, s: 'wrap' }]));
  ro.push([], [S('Running rules')]); r.rules.forEach(x => ro.push([{ v: x, s: 'wrap' }]));
  sheets.push({ name: 'Calls Roster', rows: ro, cols: [26].concat(r.hours.map(() => 10)) });
  return X.build(sheets);
}
module.exports = { workbook };
