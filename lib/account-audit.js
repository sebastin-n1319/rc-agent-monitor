'use strict';
/**
 * Batch 413: the account audit Aria does, for Expert. When an agent asks to audit an account or its history (or "again",
 * "how many times", escalation, churn), Expert reads the account's WHOLE ticket history and its escalations from Aria's
 * records with plain queries (no AI cost), counts them in code (so the numbers are exact), and hands the writer:
 *   - every ticket on the account grouped by module, with first and last date
 *   - the tickets on the same issue as this one, newest first (the repeat pattern)
 *   - tickets per year
 *   - past escalations with their stage and outcome
 * It also builds the tables and the chart the page draws, straight from those rows. Read-only; no contact columns.
 */
const P = require('./expert-plan');
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const aria = (...a) => (D.aria || P.aria)(...a);
const ariaOn = () => (D.ariaOn || P.ariaOn)();
const AUDIT_RE = /\b(audit|account history|history of|full history|whole account|complete account|entire account|all (the |their |its )?tickets|how many times|again and again|keeps? (happening|coming)|recurr|repeat(ed|ing)? (issue|problem|ticket)|escalat|churn|at risk|track record|so far on (this|the) account)\b/i;
const wants = (q) => AUDIT_RE.test(String(q || ''));
const q = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '...' : s; };
async function sql(text, limit) {
  const r = await aria('query', { sql: text, limit }, { timeoutMs: 30000, maxChars: 60000 });
  if (r.isError) throw new Error(clip(r.text, 200));
  let j = null; try { j = JSON.parse(r.text); } catch (e) { return []; }
  const rows = Array.isArray(j) ? j : (j && (j.rows || j.data || j.results)) || [];
  const cols = j && Array.isArray(j.columns) ? j.columns.map((c) => (typeof c === 'string' ? c : c && c.name)) : null;
  return rows.map((r) => (Array.isArray(r) && cols ? Object.fromEntries(cols.map((c, i) => [c, r[i]])) : r));
}
const STOP = new Set(['the', 'and', 'for', 'not', 'with', 'from', 'are', 'was', 'issue', 'issues', 'adit', 'patient', 'patients', 'request', 'help', 'please', 'unable', 'working', 'does', 'ticket', 'new', 'update', 'client', 'need', 'needs', 'call', 'calls', 'account', 'practice', 'office', 'dental', 'this', 'that', 'have', 'has', 'audit', 'complete', 'handle', 'let', 'know', 'how', 'what', 'wanted', 'already', 'done', 'quoted']);
const words = (x) => new Set((String(x || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')).replace(/(ment|ed|ing)$/, '')).filter((w) => w.length >= 3 && !STOP.has(w)));
const day = (x) => String(x || '').slice(0, 10);

/** { text, visuals, steps, ms } or null. Never throws. */
async function forAccount({ number = '', name = '', ticket = '', subject = '', question = '' } = {}) {
  const t0 = Date.now(), steps = [];
  if (!ariaOn() || (!number && !name)) return null;
  const where = number ? `account_number = ${q(String(number).replace(/\D/g, ''))}` : `account_name = ${q(name)}`;
  let tickets = [], esc = [];
  try {
    [tickets, esc] = await Promise.all([
      sql(`select ticket_number, subject, status, created_time, closed_time, adit_app_module, cs_category, cs_subcategory, team, resolution from tickets where ${where} order by created_time desc limit 400`, 400),
      sql(`select id, escalation_status, department, tier1_stage, tier2_stage, client_concerns, tier1_date, expected_churn_date, de_escalated_by from escalations where account_name = ${q(name || '')} limit 20`, 20).catch(() => []),
    ]);
  } catch (e) { steps.push({ what: "Read the account's ticket history", ok: false }); return { text: '', visuals: [], steps, ms: Date.now() - t0 }; }
  steps.push({ what: `Read the account's whole ticket history (${tickets.length} tickets)`, ok: tickets.length > 0 });
  if (!tickets.length) return { text: '', visuals: [], steps, ms: Date.now() - t0 };
  const acct = (tickets[0] && tickets[0].account_name) || name;
  // by module
  const byMod = {};
  for (const t of tickets) { const m = clip(t.adit_app_module || t.cs_category || 'Other', 40); const b = byMod[m] || (byMod[m] = { n: 0, open: 0, first: day(t.created_time), last: day(t.created_time) }); b.n++; if (!t.closed_time) b.open++; const d = day(t.created_time); if (d < b.first) b.first = d; if (d > b.last) b.last = d; }
  const mods = Object.entries(byMod).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  // same issue as this ticket: shares 2+ words of its subject and the question (1 when the subject is short)
  const mine = new Set([...words(subject), ...words(question)]);
  const same = mine.size ? tickets.filter((t) => String(t.ticket_number) !== String(ticket)).map((t) => { const w = words(t.subject); let n = 0; w.forEach((x) => { if (mine.has(x)) n++; }); return Object.assign({}, t, { _n: n }); })
    .filter((t) => t._n >= (mine.size <= 3 ? 1 : 2)).slice(0, 12) : [];
  // per year
  const byYear = {}; for (const t of tickets) { const y = day(t.created_time).slice(0, 4); if (y) byYear[y] = (byYear[y] || 0) + 1; }
  const sameYear = {}; for (const t of same) { const y = day(t.created_time).slice(0, 4); if (y) sameYear[y] = (sameYear[y] || 0) + 1; }
  const open = tickets.filter((t) => !t.closed_time);
  const lines = [];
  lines.push(`ACCOUNT AUDIT for ${acct}${number ? ' (' + number + ')' : ''}: ${tickets.length} tickets from ${day(tickets[tickets.length - 1].created_time)} to ${day(tickets[0].created_time)}, ${open.length} open now. Counts below are exact (counted from the records).`);
  lines.push('BY MODULE: ' + mods.map(([m, b]) => `${m} ${b.n} (${b.first} to ${b.last}${b.open ? ', ' + b.open + ' open' : ''})`).join('; '));
  lines.push('PER YEAR: ' + Object.keys(byYear).sort().map((y) => `${y} ${byYear[y]}`).join(', '));
  if (same.length) lines.push(`SAME ISSUE AS THIS TICKET (${same.length} earlier tickets, newest first):\n` + same.map((t) => `- #${t.ticket_number} ${day(t.created_time)} ${clip(t.subject, 100)} [${t.closed_time ? 'closed ' + day(t.closed_time) : t.status || 'open'}]${t.resolution && String(t.resolution).length > 3 ? ' fix: ' + clip(t.resolution, 160) : ''} [Desk ticket #${t.ticket_number}]`).join('\n'));
  else lines.push('SAME ISSUE AS THIS TICKET: no earlier ticket on the account shares its subject words.');
  if (open.length) lines.push('OPEN NOW: ' + open.slice(0, 6).map((t) => `#${t.ticket_number} ${clip(t.subject, 80)} (${t.status || 'open'}, since ${day(t.created_time)})`).join('; '));
  if (esc.length) lines.push('ESCALATIONS ON THE ACCOUNT:\n' + esc.map((e) => `- ${e.id || ''} ${day(e.tier1_date)} ${e.escalation_status || ''} (${e.department || ''}; T1 ${e.tier1_stage || '-'}, T2 ${e.tier2_stage || '-'}${e.de_escalated_by ? ', de-escalated by ' + e.de_escalated_by : ''}): ${clip(e.client_concerns, 160)}`).join('\n'));
  steps.push({ what: `Read the account's escalations (${esc.length})`, ok: true });
  // the visuals, built from the same rows (exact)
  const visuals = [];
  if (same.length) visuals.push({ type: 'table', title: `Earlier tickets on the same issue (${same.length})`, columns: ['Ticket', 'Opened', 'Subject', 'Status'], rows: same.slice(0, 10).map((t) => ['#' + t.ticket_number, day(t.created_time), clip(t.subject, 70), t.closed_time ? 'Closed ' + day(t.closed_time) : String(t.status || 'Open')]) });
  const yrs = Object.keys(same.length >= 3 ? sameYear : byYear).sort();
  if (yrs.length >= 2) visuals.push({ type: 'bar', title: same.length >= 3 ? 'Same-issue tickets per year' : 'All tickets per year', labels: yrs, values: yrs.map((y) => (same.length >= 3 ? sameYear : byYear)[y]) });
  if (mods.length >= 2) visuals.push({ type: 'table', title: `All ${tickets.length} tickets by module`, columns: ['Module', 'Tickets', 'Open', 'First', 'Latest'], rows: mods.map(([m, b]) => [m, String(b.n), String(b.open), b.first, b.last]) });
  if (esc.length) visuals.push({ type: 'table', title: `Escalations (${esc.length})`, columns: ['Escalation', 'Date', 'Status', 'Concern'], rows: esc.slice(0, 8).map((e) => [String(e.id || ''), day(e.tier1_date), String(e.escalation_status || ''), clip(e.client_concerns, 60)]) });
  return { text: lines.join('\n\n'), visuals, steps, ms: Date.now() - t0, count: tickets.length, same: same.length };
}
module.exports = { setDeps, wants, forAccount, AUDIT_RE };
