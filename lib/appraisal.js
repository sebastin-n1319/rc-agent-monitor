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
  return { agent: { email: a.email, name: a.name, fullName: a.fullName || null, team: a.team, empId: a.empId || null, doj: a.doj || null },
    months: R.months.map((m) => ({ key: m.key, label: m.label, partial: m.partial })), auto, warnings: R.warnings || [] };
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
    agent: data.agent || null, months: data.months || [], auto: data.auto || {}, edits: data.edits || {}, warnings: data.warnings || [], show: data.show || [],
    feedback: JSON.parse(r.feedback || '{}'), notes: r.notes || '', createdBy: r.created_by, updatedBy: r.updated_by, updatedAt: r.updated_at };
}
function withScores(a) { const values = merged(a.auto, a.edits), hidden = hiddenKeys(a.agent && a.agent.team, a.show); return Object.assign(a, { values, hidden, scores: score(a.months.map((m) => m.key), values, hidden) }); }

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
    [lc(email), name, ttl, from, to, JSON.stringify({ agent: v.agent, months: v.months, auto: v.auto, edits: {}, warnings: v.warnings, show: [] }), '{}', '', by, by]);
  // The AI writes the feedback straight away; the manager reads, adds notes and rewrites if needed.
  try { const fb = await feedback({ id: r.lastID }); await run(`UPDATE appraisals SET feedback = ? WHERE id = ?`, [JSON.stringify(fb), r.lastID]); } catch (e) { /* the page offers Write with AI */ }
  return get(r.lastID);
}
/** Read the tool's numbers again (edited values stay as edited). */
async function refresh({ id, by, agentNames }) {
  const a = await get(id);
  const v = await autoValues({ email: a.email, from: a.from, to: a.to, agentNames });
  await run(`UPDATE appraisals SET data = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify({ agent: v.agent, months: v.months, auto: v.auto, edits: a.edits, warnings: v.warnings, show: a.show }), by, a.id]);
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
  const data = { agent: a.agent, months: a.months, auto: a.auto, edits: ed, warnings: a.warnings, show: sh };
  await run(`UPDATE appraisals SET name = ?, title = ?, data = ?, feedback = ?, notes = ?, status = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
    [String(name || a.name).slice(0, 160), String(title || a.title).slice(0, 160), JSON.stringify(data), JSON.stringify(cleanFeedback(feedback || a.feedback)),
      String(notes == null ? a.notes : notes).slice(0, 4000), status === 'final' ? 'final' : 'draft', by, a.id]);
  return get(a.id);
}
async function remove({ id }) { await run(`DELETE FROM appraisals WHERE id = ?`, [Number(id)]); return { id: Number(id), deleted: true }; }

// ── text helpers for the AI and the workbook ──
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtVal(k, v) { if (v == null) return '-'; const isPct = (KPIS.find((x) => x.key === k) || INFO.find((x) => x.key === k) || {}).pct; return isPct ? t2(v) + '%' : String(t2(v)); }
function factsText(a) {
  const keys = a.months.map((m) => m.key), L = [];
  L.push(`Agent: ${a.name} (${a.agent && a.agent.team === 'chat' ? 'Chat Wing' : 'Calls Wing'}). Review period: ${a.months[0].label} to ${a.months[a.months.length - 1].label}.`);
  for (const k of KPIS.concat(INFO)) {
    if ((a.hidden || []).includes(k.key)) continue;
    const row = keys.map((m, i) => `${a.months[i].label} ${fmtVal(k.key, a.values[m][k.key])}`).join(', ');
    const sk = a.scores.kpis.find((x) => x.key === k.key);
    L.push(`${k.label}: ${row}${sk ? ` | monthly ratings ${sk.monthly.map((r) => r == null ? '-' : r).join(', ')} | rating ${sk.rating == null ? 'not rated' : sk.rating.toFixed(2) + '/5'}` : ''}`);
  }
  L.push('KRA ratings: ' + a.scores.kras.map((k) => `${k.name} ${k.rating == null ? 'not rated' : k.rating.toFixed(2) + '/5'}`).join(', ') + `. Overall rating ${a.scores.overall == null ? 'not rated' : a.scores.overall.toFixed(2) + '/5'}.`);
  L.push('Rating rules: calls and tickets per working day >7 is 5, >5 is 4, >4 is 3, >3 is 2, else 1; chats per working day >4 is 5, >3.5 is 4, >3 is 3, >2.5 is 2; CSAT and QA >90% is 5, >85% 4, >80% 3, >75% 2; FCR >75% is 5, >70% 4, >65% 3, >60% 2. A KPI rating is the average of its rated months.');
  return L.join('\n');
}

const FB_SYS = `You write the feedback part of a T1 customer support agent's appraisal for Adit (a practice software company), for the HR appraisal discussion. Match this house style: third person, professional and specific, every claim tied to the numbers given (months and values), explain dips with the context the manager gives, no invented facts, no em dashes, British-neutral plain English. Ratings are always written with two decimals and "/5" (for example 4.20/5).
Return JSON only:
{"overall": "Overall Feedback: one paragraph (4 to 5 sentences) with the overall rating, the defining strengths and the main development focus",
 "productivity": "one sentence: <first name>'s overall productivity rating is X/5.",
 "calls": "Call Handling paragraph starting 'Call Handling: Call productivity is rated X/5.' or '' if there are no calls",
 "chats": "Chat Handling paragraph starting 'Chat Handling: Chat productivity is rated X/5.' or '' if there are no chats",
 "tickets": "Ticket Resolution paragraph starting 'Ticket Resolution: Ticket handling is rated X/5.'",
 "performance": "one sentence: <first name>'s overall performance rating is X/5.",
 "csat": "paragraph starting 'Customer Satisfaction (CSAT): CSAT is rated X/5.'",
 "fcr": "paragraph starting 'First Contact Resolution (FCR): FCR is rated X/5.' ending with the development focus if it is below 4",
 "people": "one sentence: <first name>'s People Excellence rating is X/5.",
 "qa": "paragraph starting 'Quality Assurance (QA): QA is rated X/5.' with a clear QA goal for the next period",
 "attendance": "paragraph starting 'Attendance & Reliability:' using working days and unplanned shrinkage",
 "strengths": ["3 to 5 short strengths, each tied to a number"],
 "development": ["2 to 4 areas for development, each with a measurable target"],
 "summary": "Overall Summary paragraph (3 to 5 sentences): the rating, what kind of contributor the agent is, and what the next cycle should focus on"}
Months with no value were not rated; say so plainly if it matters (for example a month on another channel). The manager's notes are facts and context from the manager: use them, but keep the tone fair and professional.`;

async function feedback({ id }) {
  const a = await get(id);
  if (!_deps.ai || !_deps.ai.anyConfigured()) throw err('AI is not set up on the server', 503);
  const user = factsText(a) + (a.notes ? '\n\nManager notes:\n' + a.notes : '') + `\n\nName to use in the summary: ${a.name}. First name: ${String(a.agent && a.agent.name || a.name).split(/\s+/)[0]}.`;
  const r = await _deps.ai.bestJSON({ system: FB_SYS, user, maxTokens: 3500, timeoutMs: 120000 });
  return cleanFeedback(r.json || {});
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
