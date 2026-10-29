'use strict';
/**
 * Batch 193: agent appraisals (admin, next to the Bonus Calculator).
 * Laid out like Sebastin's appraisal sheet: Scores (KRA, KPI, one column per month, rating out of 5) and Feedback
 * (overall, productivity, performance quality, people excellence, strengths, areas for development, overall summary).
 *  - build(): fills each month from the bonus data (accepted calls, chats owned, tickets closed, CSAT, FCR, QA, present
 *    days, unplanned leave). Every value can be edited; an edited value wins over the tool's.
 *  - score(): the sheet's rating rules. Month rating per KPI, KPI rating = average of the rated months, KRA rating =
 *    average of its KPI ratings, overall = average of the KRA ratings. A blank or zero value is not rated.
 *  - feedback(): AI draft in the sheet's sections, from the numbers and the manager's own notes.
 *  - workbook(): the .xlsx for HR (Scores and Feedback sheets).
 */
const X = require('./xlsx-lite');
let _db = null, _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign({}, _deps, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const t2 = (n) => (n == null || !isFinite(n) ? null : Math.floor(n * 100 + 1e-9) / 100); // never rounded up
const err = (m, status = 400) => Object.assign(new Error(m), { status });

// The sheet's rules. perDay: value / working days. pct: value is a percentage (0-100).
const KPIS = [
  { key: 'calls', kra: 'Productivity', label: 'No. Of Calls', perDay: true, steps: [7, 5, 4, 3] },
  { key: 'chats', kra: 'Productivity', label: 'No. Of Chats', perDay: true, steps: [4, 3.5, 3, 2.5] },
  { key: 'tickets', kra: 'Productivity', label: 'No. Of tickets handled', perDay: true, steps: [7, 5, 4, 3] },
  { key: 'csat', kra: 'Performance', label: 'CSAT%', pct: true, steps: [90, 85, 80, 75] },
  { key: 'fcr', kra: 'Performance', label: 'FCR%', pct: true, steps: [75, 70, 65, 60] },
  { key: 'qa', kra: 'People Excellence', label: 'QA', pct: true, steps: [90, 85, 80, 75] },
];
const INFO = [
  { key: 'days', kra: 'People Excellence', label: 'No.of Working Days' },
  { key: 'shrink', kra: 'People Excellence', label: 'Unplanned Shrinkage', pct: true },
];
const KRAS = ['Productivity', 'Performance', 'People Excellence'];
const FIELDS = KPIS.map((k) => k.key).concat(INFO.map((k) => k.key));

function rateValue(k, v, days) {
  if (v == null || v === '' || !isFinite(v) || Number(v) <= 0) return null;
  let x = Number(v);
  if (k.perDay) { if (!days || days <= 0) return null; x = x / days; }
  const [a, b, c, d] = k.steps;
  return x > a ? 5 : x > b ? 4 : x > c ? 3 : x > d ? 2 : 1;
}
const avg = (xs) => { const v = xs.filter((x) => x != null && x > 0); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };

/** values: { 'YYYY-MM': { calls, chats, tickets, csat, fcr, qa, days, shrink } } (percentages 0-100). */
/** The other wing's channel is not shown or rated (a calls agent has no chats row) unless switched on for that appraisal. */
function hiddenKeys(team, show) {
  const sh = Array.isArray(show) ? show : [];
  if (team === 'chat') return sh.includes('calls') ? [] : ['calls'];
  return sh.includes('chats') ? [] : ['chats'];
}
function score(months, values, hidden) {
  const hid = hidden || [];
  const kpis = KPIS.filter((k) => !hid.includes(k.key)).map((k) => {
    const monthly = months.map((m) => { const v = (values[m] || {}); return rateValue(k, v[k.key], Number(v.days) || null); });
    return { key: k.key, kra: k.kra, label: k.label, monthly, raw: avg(monthly) };
  });
  const kras = KRAS.map((name) => ({ name, raw: avg(kpis.filter((k) => k.kra === name).map((k) => k.raw)) }));
  const overall = avg(kras.map((k) => k.raw));
  // averages chain on the unrounded values; shown to two decimals, never rounded up
  return { kpis: kpis.map(({ raw, ...k }) => Object.assign(k, { rating: t2(raw) })), kras: kras.map((k) => ({ name: k.name, rating: t2(k.raw) })), overall: t2(overall) };
}

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS appraisals (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, name TEXT, title TEXT,
    from_month TEXT, to_month TEXT, data TEXT, feedback TEXT, notes TEXT, status TEXT DEFAULT 'draft',
    created_by TEXT, updated_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
}

// What the tool has for one agent, month by month (from the bonus report: same numbers as the bonus and My Stats).
async function autoValues({ email, from, to, agentNames }) {
  const R = await _deps.bonus.report({ period: from + '..' + to, agentNames });
  const a = R.agents.find((x) => lc(x.email) === lc(email));
  if (!a) throw err('This agent is not on the Bonus Calculator. Switch them on under its Agents tab first.', 404);
  const auto = {}, src = {};
  for (const m of R.months) {
    const x = a.months[m.key] || {};
    if (x.outside) { auto[m.key] = {}; src[m.key] = 'Not in T1 CS this month'; continue; }
    const d = x.data || {}, L = x.leave || {};
    const unplanned = (L.upl || 0) + 0.5 * (L.hd_upl || 0) + (L.ncns || 0);
    const leaveAll = (L.pl || 0) + (L.sl || 0) + 0.5 * ((L.hd_pl || 0) + (L.hd_sl || 0)) + (L.fl || 0) + unplanned;
    const fcr = d.closed ? d.fcrYes / d.closed * 100 : null;
    auto[m.key] = {
      calls: a.team === 'calls' ? (d.inbound == null ? null : d.inbound) : (d.answered || null),
      chats: d.chats || null,
      tickets: d.closed == null ? null : d.closed,
      csat: x.csat && x.csat.pct != null ? x.csat.pct : null,
      fcr: fcr == null ? null : t2(fcr),
      qa: x.qa == null ? null : x.qa,
      days: x.present == null ? null : x.present,
      shrink: x.present == null ? null : t2((x.present + leaveAll) ? unplanned / (x.present + leaveAll) * 100 : 0),
    };
  }
  // Batch 194: months with no QA in the bonus data take it from Zoho CRM Call Audits (same as the CRM QA report).
  const warnings = (R.warnings || []).slice(), qaFrom = {};
  const needQa = R.months.filter((m) => auto[m.key] && auto[m.key].qa == null && src[m.key] !== 'Not in T1 CS this month');
  if (needQa.length && _deps.crmQa) {
    for (const m of needQa) {
      try { const q = (await _deps.crmQa.monthQA(m.key)).get(lc(a.email)); if (q) { auto[m.key].qa = q.qa; qaFrom[m.key] = q.audits; } }
      catch (e) { warnings.push('QA for ' + m.label + ' could not be read from Zoho CRM (' + e.message + '). Type it in from the QA report.'); break; }
    }
  }
  // Batch 196: context for the AI feedback: leave by type, survey and FCR counts, bonus points per month, and how the agent
  // compares with the rest of the wing over the same months (per working day for volumes).
  const extra = {};
  for (const m of R.months) {
    const x = a.months[m.key] || {}; if (x.outside) continue;
    const d = x.data || {}, L = x.leave || {};
    extra[m.key] = { leave: { pl: L.pl || 0, hd_pl: L.hd_pl || 0, sl: L.sl || 0, hd_sl: L.hd_sl || 0, upl: L.upl || 0, hd_upl: L.hd_upl || 0, ncns: L.ncns || 0, fl: L.fl || 0 },
      csatGood: x.csat ? x.csat.good : null, csatTotal: x.csat ? x.csat.total : null, fcrYes: d.fcrYes == null ? null : d.fcrYes, closed: d.closed == null ? null : d.closed,
      points: x.points == null ? null : x.points, slab: x.slab || null, eligible: !!x.eligible };
  }
  const per = (num, den) => (num != null && den ? num / den : null);
  const teamRows = R.agents.filter((g) => g.team === a.team).map((g) => {
    const t = { email: lc(g.email), calls: [], tickets: [], chats: [], fcrYes: 0, closed: 0, good: 0, total: 0, qa: [] };
    for (const m of R.months) {
      const x = g.months[m.key] || {}; if (x.outside || !x.present) continue;
      const d = x.data || {};
      const calls = g.team === 'calls' ? d.inbound : d.answered;
      if (per(calls, x.present) != null) t.calls.push(calls / x.present);
      if (per(d.closed, x.present) != null) t.tickets.push(d.closed / x.present);
      if (per(d.chats, x.present) != null && d.chats) t.chats.push(d.chats / x.present);
      t.fcrYes += d.fcrYes || 0; t.closed += d.closed || 0;
      if (x.csat) { t.good += x.csat.good || 0; t.total += x.csat.total || 0; }
      if (x.qa != null) t.qa.push(x.qa);
    }
    const mean = (xs) => (xs.length ? xs.reduce((s2, v) => s2 + v, 0) / xs.length : null);
    return { email: t.email, calls: mean(t.calls), tickets: mean(t.tickets), chats: mean(t.chats), fcr: t.closed ? t.fcrYes / t.closed * 100 : null, csat: t.total ? t.good / t.total * 100 : null, qa: mean(t.qa) };
  });
  const team = { size: teamRows.length, kpis: {} };
  for (const k of ['calls', 'tickets', 'chats', 'fcr', 'csat', 'qa']) {
    const vals = teamRows.filter((r) => r[k] != null);
    if (vals.length < 2) continue;
    const me = vals.find((r) => r.email === lc(a.email));
    const sorted = vals.slice().sort((x2, y2) => y2[k] - x2[k]);
    team.kpis[k] = { avg: t2(vals.reduce((s2, r) => s2 + r[k], 0) / vals.length), best: t2(sorted[0][k]), agent: me ? t2(me[k]) : null, rank: me ? sorted.indexOf(me) + 1 : null, of: vals.length };
  }
  return { agent: { email: a.email, name: a.name, fullName: a.fullName || null, team: a.team, empId: a.empId || null, doj: a.doj || null },
    months: R.months.map((m) => ({ key: m.key, label: m.label, partial: m.partial, qaAudits: qaFrom[m.key] || null })), auto, warnings, readAt: new Date().toISOString(), extra, team };
}

function merged(auto, edits) {
  const out = {};
  for (const m of Object.keys(auto)) {
    out[m] = {};
    for (const f of FIELDS) {
      const e = edits && edits[m] && Object.prototype.hasOwnProperty.call(edits[m], f) ? edits[m][f] : undefined;
      out[m][f] = e !== undefined ? (e === '' || e == null ? null : Number(e)) : (auto[m][f] == null ? null : auto[m][f]);
    }
  }
  return out;
}

function shapeRow(r) {
  const data = JSON.parse(r.data || '{}');
  return { id: r.id, email: r.email, name: r.name, title: r.title, from: r.from_month, to: r.to_month, status: r.status,
    agent: data.agent || null, months: data.months || [], auto: data.auto || {}, edits: data.edits || {}, warnings: data.warnings || [], show: data.show || [], readAt: data.readAt || null, extra: data.extra || {}, team: data.team || null,
    feedback: JSON.parse(r.feedback || '{}'), notes: r.notes || '', createdBy: r.created_by, updatedBy: r.updated_by, updatedAt: r.updated_at };
}
function withScores(a) {
  const values = merged(a.auto, a.edits), hidden = hiddenKeys(a.agent && a.agent.team, a.show);
  // notes about a channel this appraisal does not rate are not shown
  const warnings = (a.warnings || []).filter((w) => !(hidden.includes('chats') && /\bchat/i.test(w)) && !(hidden.includes('calls') && /inbound calls/i.test(w)));
  // Batch 195: a draft re-reads the sources when its numbers are over 15 minutes old (a final appraisal keeps its numbers)
  const stale = a.status !== 'final' && (!a.readAt || Date.now() - Date.parse(a.readAt) > 15 * 60e3);
  return Object.assign(a, { values, hidden, warnings, stale, scores: score(a.months.map((m) => m.key), values, hidden) });
}

async function list() {
  const rows = await all(`SELECT id, email, name, title, from_month, to_month, status, data, updated_by, updated_at FROM appraisals ORDER BY updated_at DESC LIMIT 200`);
  return rows.map((r) => { const a = withScores(shapeRow(Object.assign({ feedback: '{}' }, r))); return { id: a.id, email: a.email, name: a.name, title: a.title, from: a.from, to: a.to, status: a.status, overall: a.scores.overall, updatedBy: a.updatedBy, updatedAt: a.updatedAt }; });
}
async function get(id) {
  const r = (await all(`SELECT * FROM appraisals WHERE id = ?`, [Number(id)]))[0];
  if (!r) throw err('That appraisal was not found', 404);
  return withScores(shapeRow(r));
}

const MKEY = /^\d{4}-\d{2}$/;
async function create({ email, from, to, title, by, agentNames }) {
  if (!email || !MKEY.test(from || '') || !MKEY.test(to || '')) throw err('Pick an agent, a start month and an end month');
  if (from > to) throw err('The start month must be before the end month');
  const v = await autoValues({ email, from, to, agentNames });
  const name = v.agent.fullName && lc(v.agent.fullName) !== lc(v.agent.name) ? v.agent.fullName + ' (' + v.agent.name + ')' : v.agent.name;
  const ttl = String(title || '').trim().slice(0, 120) || (v.agent.name + ' Appraisal ' + to.slice(0, 4));
  const r = await run(`INSERT INTO appraisals (email, name, title, from_month, to_month, data, feedback, notes, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [lc(email), name, ttl, from, to, JSON.stringify({ agent: v.agent, months: v.months, auto: v.auto, edits: {}, warnings: v.warnings, show: [], readAt: v.readAt, extra: v.extra, team: v.team }), '{}', '', by, by]);
  // The AI writes the feedback straight away; the manager reads, adds notes and rewrites if needed.
  try { const fb = await feedback({ id: r.lastID }); await run(`UPDATE appraisals SET feedback = ? WHERE id = ?`, [JSON.stringify(fb), r.lastID]); } catch (e) { /* the page offers Write with AI */ }
  return get(r.lastID);
}
/** Read the tool's numbers again (edited values stay as edited). */
async function refresh({ id, by, agentNames }) {
  const a = await get(id);
  const v = await autoValues({ email: a.email, from: a.from, to: a.to, agentNames });
  await run(`UPDATE appraisals SET data = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify({ agent: v.agent, months: v.months, auto: v.auto, edits: a.edits, warnings: v.warnings, show: a.show, readAt: v.readAt, extra: v.extra, team: v.team }), by, a.id]);
  return get(a.id);
}
const FB_KEYS = ['overall', 'productivity', 'calls', 'chats', 'tickets', 'performance', 'csat', 'fcr', 'people', 'qa', 'attendance', 'strengths', 'development', 'summary'];
function cleanFeedback(f) {
  const out = {};
  for (const k of FB_KEYS) { const v = f && f[k]; out[k] = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).join('\n') : String(v == null ? '' : v).slice(0, 6000); }
  return out;
}
async function save({ id, name, title, edits, feedback, notes, status, show, by }) {
  const a = await get(id);
  const ed = {};
  for (const [m, o] of Object.entries(edits || {})) {
    if (!a.auto[m]) continue;
    for (const f of FIELDS) if (o && Object.prototype.hasOwnProperty.call(o, f)) { const v = o[f]; (ed[m] = ed[m] || {})[f] = v === '' || v == null || !isFinite(Number(v)) ? null : Number(v); }
  }
  const sh = Array.isArray(show) ? show.filter((x) => x === 'calls' || x === 'chats') : a.show;
  const data = { agent: a.agent, months: a.months, auto: a.auto, edits: ed, warnings: (JSON.parse((await all(`SELECT data FROM appraisals WHERE id = ?`, [a.id]))[0].data || '{}').warnings) || [], show: sh, readAt: a.readAt, extra: a.extra, team: a.team };
  await run(`UPDATE appraisals SET name = ?, title = ?, data = ?, feedback = ?, notes = ?, status = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
    [String(name || a.name).slice(0, 160), String(title || a.title).slice(0, 160), JSON.stringify(data), JSON.stringify(cleanFeedback(feedback || a.feedback)),
      String(notes == null ? a.notes : notes).slice(0, 4000), status === 'final' ? 'final' : 'draft', by, a.id]);
  return get(a.id);
}
async function remove({ id }) { await run(`DELETE FROM appraisals WHERE id = ?`, [Number(id)]); return { id: Number(id), deleted: true }; }

// ── text helpers for the AI and the workbook ──
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtVal(k, v) { if (v == null) return '-'; const isPct = (KPIS.find((x) => x.key === k) || INFO.find((x) => x.key === k) || {}).pct; return isPct ? t2(v) + '%' : String(t2(v)); }
// Batch 196: the facts the AI writes from. Every number the feedback may use is here, labelled, with the month it
// belongs to, per working day rates for volumes, the counts behind percentages, trends, the team comparison, leave by
// type and the bonus outcome. A reviewer pass then checks the draft against the same facts.
const f2 = (n) => (n == null ? '-' : t2(n).toFixed(2));
function factsText(a) {
  const keys = a.months.map((m) => m.key), L = [], hid = a.hidden || [];
  const first = String(a.agent && a.agent.name || a.name).split(/\s+/)[0];
  const lbl = (i) => a.months[i].label + (a.months[i].partial ? ' (to date)' : '');
  const sc = a.scores, kpi = (k) => sc.kpis.find((x) => x.key === k), kra = (n) => sc.kras.find((x) => x.name === n);
  L.push(`AGENT: ${a.name} (first name ${first}), ${a.agent && a.agent.team === 'chat' ? 'Chat Wing' : 'Calls Wing'} of T1 Customer Support. Review period: ${a.months[0].label} to ${a.months[a.months.length - 1].label} (${keys.length} months${a.months.some((m) => m.partial) ? '; the last month is only partly complete, say "to date" when using it' : ''}).`);
  L.push('');
  L.push(`RATINGS (out of 5, use these exact labels and values):`);
  L.push(`- Overall rating: ${f2(sc.overall)}/5 (the average of the three KRA ratings below). This is the only number to call "overall rating".`);
  for (const n of ['Productivity', 'Performance', 'People Excellence']) {
    const parts = sc.kpis.filter((k) => k.kra === n).map((k) => `${k.label} ${f2(k.rating)}/5`).join(', ');
    L.push(`- ${n} KRA rating: ${f2(kra(n) && kra(n).rating)}/5 (average of: ${parts || 'not rated'}).`);
  }
  L.push('');
  L.push('MONTH BY MONTH:');
  const team = a.team && a.team.kpis ? a.team.kpis : {};
  const cmp = (k, unit) => { const t = team[k]; return t ? ` Team (${t.of} agents, same months): average ${f2(t.avg)}${unit}, best ${f2(t.best)}${unit}; ${first} ${f2(t.agent)}${unit}, rank ${t.rank} of ${t.of}.` : ''; };
  const trend = (vals) => {
    const v = vals.map((x, i) => ({ x, i })).filter((o) => o.x != null && !a.months[o.i].partial); if (v.length < 4) return '';
    const h = Math.floor(v.length / 2), avgOf = (arr) => arr.reduce((s2, o) => s2 + o.x, 0) / arr.length;
    const p1 = avgOf(v.slice(0, h)), p2 = avgOf(v.slice(h)), best = v.reduce((b, o) => (o.x > b.x ? o : b)), worst = v.reduce((b, o) => (o.x < b.x ? o : b));
    return ` First half average ${f2(p1)}, second half ${f2(p2)} (${p2 > p1 * 1.03 ? 'improving' : p2 < p1 * 0.97 ? 'declining' : 'steady'}). Best ${lbl(best.i)} ${f2(best.x)}, weakest ${lbl(worst.i)} ${f2(worst.x)}.`;
  };
  for (const k of ['calls', 'chats', 'tickets']) {
    if (hid.includes(k)) continue;
    const K = KPIS.find((x) => x.key === k), sk = kpi(k); if (!sk) continue;
    const rates = keys.map((m) => { const v = a.values[m][k], d = a.values[m].days; return v != null && d ? v / d : null; });
    if (!keys.some((m) => a.values[m][k] != null)) continue;
    const row = keys.map((m, i) => { const v = a.values[m][k], d = a.values[m].days; return `${lbl(i)}: ${v == null ? 'none' : v}${v != null && d ? ` in ${d} days = ${f2(v / d)}/day` : ''}${sk.monthly[i] ? `, rated ${sk.monthly[i]}` : v != null ? ', not rated (no working days)' : ''}`; }).join('; ');
    L.push(`- ${K.label} (rated per working day: above ${K.steps[0]}/day is 5, ${K.steps[1]} is 4, ${K.steps[2]} is 3, ${K.steps[3]} is 2): ${row}. Rating ${f2(sk.rating)}/5.${trend(rates)}${cmp(k, '/day')}`);
  }
  if (kpi('csat')) {
    const row = keys.map((m, i) => { const v = a.values[m].csat, e = (a.extra || {})[m] || {}; return `${lbl(i)}: ${v == null ? 'none' : f2(v) + '%'}${e.csatTotal ? ` (${e.csatGood} good of ${e.csatTotal} ${a.agent && a.agent.team === 'chat' ? 'rated chats' : 'surveys'})` : ''}${kpi('csat').monthly[i] ? ', rated ' + kpi('csat').monthly[i] : ''}`; }).join('; ');
    L.push(`- CSAT% (above 90% is 5): ${row}. Rating ${f2(kpi('csat').rating)}/5.${cmp('csat', '%')} When survey counts are small, say the score rests on few surveys.`);
  }
  if (kpi('fcr')) {
    const vals = keys.map((m) => a.values[m].fcr);
    const row = keys.map((m, i) => { const v = a.values[m].fcr, e = (a.extra || {})[m] || {}; return `${lbl(i)}: ${v == null ? 'none' : f2(v) + '%'}${e.closed ? ` (${e.fcrYes} of ${e.closed} closed tickets resolved within 24 business hours without reopening)` : ''}${kpi('fcr').monthly[i] ? ', rated ' + kpi('fcr').monthly[i] : ''}`; }).join('; ');
    L.push(`- FCR% (above 75% is 5, 70% is 4, 65% is 3, 60% is 2): ${row}. Rating ${f2(kpi('fcr').rating)}/5.${trend(vals)}${cmp('fcr', '%')}`);
  }
  if (kpi('qa')) {
    const vals = keys.map((m) => a.values[m].qa);
    const row = keys.map((m, i) => { const v = a.values[m].qa; return `${lbl(i)}: ${v == null ? 'none' : f2(v) + '%'}${a.months[i].qaAudits ? ` (${a.months[i].qaAudits} audited calls)` : ''}${kpi('qa').monthly[i] ? ', rated ' + kpi('qa').monthly[i] : ''}`; }).join('; ');
    L.push(`- QA (above 90% is 5, 85% is 4, 80% is 3, 75% is 2): ${row}. Rating ${f2(kpi('qa').rating)}/5.${trend(vals)}${cmp('qa', '%')}`);
  }
  const att = keys.map((m, i) => {
    const e = ((a.extra || {})[m] || {}).leave || {}, d = a.values[m].days, sh = a.values[m].shrink;
    const lv = [['PL', e.pl], ['half-day PL', e.hd_pl], ['SL', e.sl], ['half-day SL', e.hd_sl], ['floater', e.fl], ['UPL', e.upl], ['half-day UPL', e.hd_upl], ['NCNS', e.ncns]].filter((x) => x[1]).map((x) => x[1] + ' ' + x[0]).join(', ');
    return `${lbl(i)}: ${d == null ? 'not recorded' : d + ' working days'}${lv ? ', leave: ' + lv : ', no leave'}${sh != null ? `, unplanned shrinkage ${f2(sh)}%` : ''}`;
  }).join('; ');
  L.push(`- Attendance (working days = days present; planned leave is PL, SL, floater; unplanned is UPL and NCNS): ${att}.`);
  const bonus = keys.map((m, i) => { const e = (a.extra || {})[m] || {}; return e.points == null ? null : `${lbl(i)} ${e.points} points${e.slab ? ', ' + (e.slab === 's1' ? 'Slab 1' : 'Slab 2') : ''}${e.eligible ? ', bonus eligible' : ', not eligible'}`; }).filter(Boolean);
  if (bonus.length) L.push(`- Monthly bonus scorecard (context only, never mention amounts): ${bonus.join('; ')}.`);
  return L.join('\n');
}

const FB_SYS = `You are an experienced customer support operations manager writing the feedback section of a T1 support agent's appraisal at Adit (software for dental, optometry and other practices). It goes to HR and is read in the appraisal discussion with the agent, so it must be accurate, fair, specific and useful.

HOW TO WRITE IT
- Lead with what matters. Each KPI paragraph follows: the rating, then the evidence (named months and real values, per-day rates for volumes, counts behind percentages), then what it means (trend, consistency, how it compares with the team), then the impact on clients or the team, then one concrete next step when the rating is below 5.
- The manager's notes are first-hand evidence about behaviour, role and attitude (for example being the SPOC for a product, reviewing transfers, weekend support, ownership). Use every relevant point in the right section, in your own words, with the same meaning and strength. Never drop a concern the manager raised.
- Reconcile notes with data. If a note seems to conflict with the numbers (for example "unplanned absences" while unplanned shrinkage is 0% in the period), do not contradict yourself: report what the data shows for this period and present the manager's point as the expectation going forward, using the leave actually recorded (planned leave days, half days).
- Be specific, never generic. Banned: "exceptional", "outstanding", "valuable asset", "consistently delivers good results" without numbers, "room for improvement" without saying what and how much. Prefer one precise sentence to two vague ones.
- Balanced and fair: a strong agent still gets one or two real, measurable development points; a weak area is described plainly with its cause when the data or the notes give one, never harshly.
- Comparisons: use the team figures given (average, rank) where they add meaning, at most once per paragraph, and describe the position honestly: above the team average only if the agent's figure is higher than the average; rank in the top quarter is "among the highest in the wing", the middle is "close to the wing average", the bottom quarter is "below the wing average". Never call a below-average figure strong or "approaching" without saying it is below. Never name other agents.
- Notes coverage: go through the manager notes line by line. Every line must appear somewhere (overall, a KPI paragraph, people excellence, attendance, strengths, development or summary). Behaviour and role points (ownership, attitude, teamwork, extra responsibilities, weekend support) belong in the overall paragraph, the People Excellence sentence and the strengths.
- Months marked "to date" are incomplete: say so if you use them, never treat them as a dip.
- Development targets must be measurable and achievable, tied to the rating rules (for example "above 5 tickets a working day, which moves the rating to 4").
- Numbers: only use numbers from the facts. Ratings always with two decimals and "/5". The only "overall rating" is the overall one; KRA ratings are "productivity rating", "performance rating", "people excellence rating". Percentages as given (two decimals at most).
- Style: third person, professional British-neutral English, plain words, short sentences, no em or en dashes (use commas or full stops), no exclamation marks, no bullet characters inside paragraphs. Never mention money or bonus amounts.

Return JSON only, with these keys:
{"overall": "4 to 6 sentences (no heading, the page adds it): the overall rating, the two or three things that define the period (with numbers), the role and behaviour points from the notes, and the single most important focus for the next cycle",
 "productivity": "one sentence starting '<first name>'s overall productivity rating is X/5', naming what drives it",
 "calls": "starts 'Call Handling: Call productivity is rated X/5.' then the evidence and meaning; '' if calls are not in the facts",
 "chats": "starts 'Chat Handling: Chat productivity is rated X/5.'; '' if chats are not in the facts",
 "tickets": "starts 'Ticket Resolution: Ticket handling is rated X/5.'",
 "performance": "one sentence starting '<first name>'s overall performance rating is X/5', naming what drives it",
 "csat": "starts 'Customer Satisfaction (CSAT): CSAT is rated X/5.'",
 "fcr": "starts 'First Contact Resolution (FCR): FCR is rated X/5.'",
 "people": "one sentence starting '<first name>'s People Excellence rating is X/5'",
 "qa": "starts 'Quality Assurance (QA): QA is rated X/5.' and ends with a QA goal for the next period",
 "attendance": "starts 'Attendance & Reliability:'; working days, leave by type and unplanned shrinkage, plus any attendance point from the notes, reconciled with the data",
 "strengths": ["4 to 6 strengths, each one line with its evidence (a number or a fact from the notes)"],
 "development": ["2 to 4 development areas, each with a measurable target and, where it helps, how to get there"],
 "summary": "3 to 5 sentences (no heading): who this agent is to the team, the overall rating, what to keep doing, and the priorities for the next cycle"}`;

const REVIEW_SYS = `You are a strict reviewer of an appraisal feedback draft. You get the facts and the draft. Fix every problem and return the corrected feedback in the same JSON shape (same keys; strengths and development as arrays).
Check and fix:
1. Every number, month and rating matches the facts exactly. "Overall rating" is only the overall rating; KRA ratings are named by their KRA. Remove any number not in the facts.
2. No contradictions inside the draft or with the facts (for example claiming zero unplanned absence and unplanned absences at once). Reconcile as the facts and notes allow.
3. Go through the manager notes line by line: each point is reflected in the right place with the same meaning and strength; add any that are missing, none exaggerated.
3b. Team comparisons are honest: "above the wing average" only when the agent's figure is higher than the average; rank and wording agree.
4. No generic filler or empty praise; every claim has evidence. Development points are measurable.
5. Required opening phrases are kept. Third person, no em or en dashes, no exclamation marks, no money.
Keep good writing as it is; change only what needs fixing. Return JSON only.`;

async function feedback({ id, instruction, current }) {
  const a = await get(id);
  if (!_deps.ai || !_deps.ai.anyConfigured()) throw err('AI is not set up on the server', 503);
  const facts = factsText(a);
  const notes = String(a.notes || '').trim();
  const ask = String(instruction || '').trim().slice(0, 800);
  const prev = current && Object.values(current).some((v) => String(v || '').trim()) ? cleanFeedback(current) : null;
  let user = 'FACTS\n' + facts + '\n\nMANAGER NOTES (first-hand, use all relevant points)\n' + (notes || 'None given.');
  if (ask) user += '\n\nTHE MANAGER WANTS THIS VERSION TO CHANGE AS FOLLOWS (follow it unless it would make the feedback inaccurate)\n' + ask + (prev ? '\n\nPREVIOUS DRAFT (keep what still works)\n' + JSON.stringify(prev) : '');
  // Claude writes it (plenty of room: the draft is long); OpenAI only if Claude is unavailable
  const write = (system, u) => (_deps.ai.isAnthropicConfigured && _deps.ai.isAnthropicConfigured()
    ? _deps.ai.claudeJSON({ system, user: u, maxTokens: 16000, timeoutMs: 170000 }).catch((e) => { console.warn('appraisal feedback: Claude failed (' + e.message + '), using OpenAI'); return _deps.ai.bestJSON({ system, user: u, maxTokens: 6000, timeoutMs: 120000 }); })
    : _deps.ai.bestJSON({ system, user: u, maxTokens: 6000, timeoutMs: 120000 }));
  const draft = (await write(FB_SYS, user)).json || {};
  let final = draft;
  try {
    const rv = await write(REVIEW_SYS, 'FACTS\n' + facts + '\n\nMANAGER NOTES\n' + (notes || 'None given.') + (ask ? '\n\nMANAGER INSTRUCTION FOR THIS VERSION\n' + ask : '') + '\n\nDRAFT\n' + JSON.stringify(draft));
    if (rv.json && rv.json.overall && rv.json.summary) final = rv.json;
  } catch (e) { /* the draft stands */ }
  return cleanFeedback(final);
}

// ── workbook for HR ──
const c = (v, s, note) => (note ? { v, s, note } : { v, s });
function rowH(text, width) { const lines = String(text || '').split('\n').reduce((t, l) => t + Math.max(1, Math.ceil(l.length / (width * 1.15))), 0); return Math.max(15, lines * 13 + 4); }
async function workbook(id) {
  const a = await get(id);
  const keys = a.months.map((m) => m.key), n = keys.length;
  // Scores
  const rows = [], merges = [], heights = {};
  rows.push([c('KRA', 'head'), c('KPI', 'head')].concat(a.months.map((m) => c(m.label, 'head'))).concat([c('Rating (Out of 5)', 'head'), c('', 'head')]));
  merges.push(X.colName(2 + n) + '1:' + X.colName(3 + n) + '1');
  const kraStart = {};
  const lines = KPIS.filter((k) => !(a.hidden || []).includes(k.key)).concat(INFO);
  const ends = {}; lines.forEach((k, i) => { ends[k.kra] = i + 2; });
  lines.forEach((k, i) => {
    const r = i + 2, sk = a.scores.kpis.find((x) => x.key === k.key), kra = a.scores.kras.find((x) => x.name === k.kra);
    const first = !(k.kra in kraStart); if (first) kraStart[k.kra] = r;
    const row = [first ? c(k.kra, 'bold') : c('', 'text'), c(k.label, 'text')];
    keys.forEach((m) => { const v = a.values[m][k.key]; row.push(v == null ? c('-', 'miss') : k.pct ? c(v / 100, 'pct') : c(v, 'num')); });
    row.push(sk ? (sk.rating == null ? c('-', 'miss') : c(sk.rating, 'num1')) : c('-', 'miss'));
    row.push(first && kra && kra.rating != null ? c(kra.rating, 'num1') : c('', 'text'));
    rows.push(row);
  });
  // merge the KRA cells and the KRA rating cells
  for (const name of KRAS) { const s0 = kraStart[name], e0 = ends[name]; if (e0 > s0) { merges.push('A' + s0 + ':A' + e0); merges.push(X.colName(3 + n) + s0 + ':' + X.colName(3 + n) + e0); } }
  rows.push([]);
  rows.push([c('Monthly rating (1 to 5)', 'section')].concat(Array(n + 1).fill(c('', 'section'))));
  merges.push('A' + rows.length + ':' + X.colName(1 + n) + rows.length);
  a.scores.kpis.forEach((k) => { rows.push([c('', 'text'), c(k.label, 'text')].concat(k.monthly.map((r) => r == null ? c('', 'miss') : c(r, 'miss')))); });
  rows.push([]);
  rows.push(Array(2 + n).fill('').concat([c('Overall Rating', 'bold'), a.scores.overall == null ? c('-', 'miss') : c(a.scores.overall, 'boldNum1')]));
  rows.push([]);
  rows.push([c('Ratings: calls and tickets per working day >7 = 5, >5 = 4, >4 = 3, >3 = 2, else 1. Chats per working day >4 = 5, >3.5 = 4, >3 = 3, >2.5 = 2. CSAT and QA >90% = 5, >85% = 4, >80% = 3, >75% = 2. FCR >75% = 5, >70% = 4, >65% = 3, >60% = 2. A KPI rating is the average of its rated months; a KRA rating the average of its KPIs; the overall the average of the KRAs.', 'note')]);
  const scores = { name: 'Scores', rows, merges, cols: [20, 24].concat(Array(n).fill(11)).concat([16, 10]), freeze: { row: 1, col: 2 } };
  // Feedback
  const F = a.feedback || {}, fr = [], W = 110;
  const add = (t, s) => { fr.push([c(t, s)]); if (s === 'wrap') heights[fr.length - 1] = rowH(t, W); };
  const para = (t) => { if (String(t || '').trim()) add(String(t).trim(), 'wrap'); };
  const list = (t) => String(t || '').split('\n').map((x) => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).forEach((x) => add(x, 'wrap'));
  add(a.title || (a.name + ' Appraisal'), 'title'); fr.push([]);
  add('Overall Feedback', 'bold'); para(F.overall); fr.push([]);
  add('Productivity', 'bold'); para(F.productivity); para(F.calls); para(F.chats); para(F.tickets); fr.push([]);
  add('Performance Quality', 'bold'); para(F.performance); para(F.csat); para(F.fcr); fr.push([]);
  add('People Excellence', 'bold'); para(F.people); para(F.qa); para(F.attendance); fr.push([]);
  add('Strengths', 'bold'); list(F.strengths); fr.push([]);
  add('Areas for Development', 'bold'); list(F.development); fr.push([]);
  add('Overall Summary', 'bold'); para(F.summary);
  const fbh = {}; Object.keys(heights).forEach((k) => { fbh[k] = heights[k]; });
  const fb = { name: 'Feedback', rows: fr, cols: [W], heights: fbh };
  return { buf: await X.build([scores, fb]), filename: String(a.title || a.name).replace(/[^A-Za-z0-9 ()'_-]/g, '').trim() + '.xlsx' };
}

module.exports = { setDB, setDeps, initSchema, KPIS, INFO, score, rateValue, list, get, create, refresh, save, remove, feedback, workbook, _factsText: factsText, _merged: merged };
