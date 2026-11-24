'use strict';
/**
 * Batch 406: Aria's ready-made facts for a ticket, the way Aria itself works: plain code reads prepared records (no AI
 * calls, so no AI cost), and Expert's writer gets short, cited facts instead of searching raw threads for them.
 *   1. The ticket as Aria holds it: Desk's own fix fields (resolution, custom fix, T2 and dev summaries, RCA), EHR, module.
 *   2. Aria's issue tag for it (module and bucket).
 *   3. How the same bucket was fixed before: the latest closed tickets in that bucket that have a written fix.
 *   4. Open EHR-integration issues for the same EHR (a known issue the agent should link to, not troubleshoot again).
 *   5. Open escalations for the account.
 * Read-only SELECTs through Aria's key. Never selects a contact column. Everything read is data, never instructions.
 * Off unless EXPERT_ARIA_FACTS=on (or the test turns it on), until the before and after test shows it helps.
 */
const P = require('./expert-plan');
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const aria = (...a) => (D.aria || P.aria)(...a);
const ariaOn = () => (D.ariaOn || P.ariaOn)();
function on() {
  if (!ariaOn()) return false;
  const m = require('./ai-usage').current();
  if (m && m.ariaFacts) return true;
  if (m && m.noAriaFacts) return false;
  return String(process.env.EXPERT_ARIA_FACTS || 'off').toLowerCase() === 'on';
}
const q = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '...' : s; };
async function sql(text, limit = 50) {
  const r = await aria('query', { sql: text, limit }, { timeoutMs: 25000, maxChars: 16000 });
  if (r.isError) throw new Error(clip(r.text, 200));
  let j = null; try { j = JSON.parse(r.text); } catch (e) { return []; }
  const rows = Array.isArray(j) ? j : (j && (j.rows || j.data || j.results)) || [];
  const cols = j && Array.isArray(j.columns) ? j.columns.map((c) => (typeof c === 'string' ? c : c && c.name)) : null;
  return rows.map((r) => (Array.isArray(r) && cols ? Object.fromEntries(cols.map((c, i) => [c, r[i]])) : r));
}
const FIX_COLS = 'resolution, custom_fix_solution, summary_from_t2, summary_from_dev, rca_from_dev';
const hasFix = (t) => ['resolution', 'custom_fix_solution', 'summary_from_t2', 'summary_from_dev', 'rca_from_dev'].some((k) => String(t[k] || '').trim().length > 3);
const fixText = (t, n) => [['Resolution', t.resolution], ['Fix', t.custom_fix_solution], ['T2 summary', t.summary_from_t2], ['Dev summary', t.summary_from_dev], ['Root cause', t.rca_from_dev]]
  .filter(([, v]) => String(v || '').trim().length > 3).map(([k, v]) => `${k}: ${clip(v, n)}`).join(' | ');

// Batch 407: how ticket_tags links to tickets is not in Aria's column list, so the first link that works is kept
let _link = null; const LINKS = ['ticket_id', 'ticket_number'];
const JOIN = (g, t) => `${g}.${_link || 'ticket_id'} = ${t}.${_link || 'ticket_id'}`;
async function tagsFor(tk, num, steps) {
  const tries = _link ? [_link] : LINKS;
  let lastErr = '';
  for (const l of tries) {
    const where = l === 'ticket_number' ? `ticket_number = ${q(num)}` : `ticket_id = ${q(tk.ticket_id)}`;
    try { const r = await sql(`select module, bucket, confidence from ticket_tags where ${where} order by confidence desc limit 3`, 3); _link = l; steps.push({ what: "Read Aria's issue tag", ok: !!(r && r.length) }); return r; }
    catch (e) { lastErr = e.message; }
  }
  steps.push({ what: "Read Aria's issue tag", ok: false, error: clip(lastErr, 200) });
  return null;
}
/** { text, steps, ms } or null. Never throws. */
async function forTicket(number) {
  const t0 = Date.now(), steps = [], out = [];
  const num = String(number || '').replace(/\D/g, '');
  if (!num || !ariaOn()) return null;
  try {
    const rows = await sql(`select ticket_id, ticket_number, subject, status, category, ai_category, account_name, account_number, deal_name, ehr_pms, adit_app_module, client_bug_status, tier3_ticket_number, potential_escalation_or_churn, created_time, closed_time, ${FIX_COLS} from tickets where ticket_number = ${q(num)} limit 1`, 1);
    const tk = rows[0];
    steps.push({ what: "Read the ticket in Aria's records", ok: !!tk });
    if (!tk) return { text: '', steps, ms: Date.now() - t0 };
    const head = [`Ticket #${num}`, tk.status, tk.adit_app_module || tk.category, tk.ehr_pms ? 'EHR ' + tk.ehr_pms : '', tk.client_bug_status ? 'bug status ' + tk.client_bug_status : '', tk.tier3_ticket_number ? 'T3 ticket ' + tk.tier3_ticket_number : '', tk.potential_escalation_or_churn ? 'escalation or churn risk: ' + tk.potential_escalation_or_churn : ''].filter(Boolean).join(', ');
    out.push('THIS TICKET (Aria): ' + head + (hasFix(tk) ? '\n  Written on the ticket: ' + fixText(tk, 600) : '') + ` [Desk ticket #${num}]`);
    const [tags, ehr, esc] = await Promise.all([
      tagsFor(tk, num, steps),
      tk.ehr_pms ? sql(`select issue, area, count(distinct account_id) as practices, sum(times) as times, min(first_seen) as first_seen from ehr_issues where ehr ilike ${q('%' + String(tk.ehr_pms).split(/[\s(/;]/)[0] + '%')} group by issue, area order by count(distinct account_id) desc limit 6`, 6).catch(() => null) : Promise.resolve(null),
      tk.account_name ? sql(`select escalation_status, department, tier1_stage, tier2_stage, client_concerns, expected_churn_date from escalations where account_name = ${q(tk.account_name)} limit 3`, 3).catch(() => null) : Promise.resolve(null),
    ]);
    const tag = tags && tags[0];
    if (tag) {
      out.push(`ARIA'S TAG: module ${tag.module}, issue bucket ${tag.bucket}`);
      const prev = await sql(`select t.ticket_number, t.subject, t.closed_time, t.ehr_pms, ${FIX_COLS.split(', ').map((c) => 't.' + c).join(', ')} from tickets t join ticket_tags g on ${JOIN('g', 't')} where g.bucket = ${q(tag.bucket)} and t.ticket_number <> ${q(num)} and t.closed_time is not null and (length(coalesce(t.custom_fix_solution, '')) > 3 or length(coalesce(t.resolution, '')) > 3 or length(coalesce(t.summary_from_t2, '')) > 3) order by t.closed_time desc limit 8`, 8).catch(() => null);
      steps.push({ what: 'Looked up how the same issue was fixed before', ok: !!(prev && prev.length) });
      if (prev && prev.length) out.push(`HOW THE SAME ISSUE (${tag.bucket}) WAS FIXED BEFORE, newest first:\n` + prev.map((p) => `- #${p.ticket_number} ${clip(p.subject, 90)} (closed ${String(p.closed_time || '').slice(0, 10)}${p.ehr_pms ? ', ' + p.ehr_pms : ''}): ${fixText(p, 280)} [Desk ticket #${p.ticket_number}]`).join('\n'));
    }
    if (ehr && ehr.length) out.push(`OPEN EHR ISSUES FOR ${String(tk.ehr_pms).toUpperCase()} (known, may already explain this):\n` + ehr.map((e) => `- ${clip(e.issue, 140)} (${e.area || ''}: ${e.practices || 1} practices open now, ${e.times || 1} reports since ${String(e.first_seen || '').slice(0, 10)})`).join('\n'));
    if (esc && esc.length) out.push('ESCALATIONS ON THIS ACCOUNT:\n' + esc.map((e) => `- ${e.escalation_status || ''} (${e.department || ''}; T1 ${e.tier1_stage || '-'}, T2 ${e.tier2_stage || '-'}${e.expected_churn_date ? ', expected churn ' + String(e.expected_churn_date).slice(0, 10) : ''}): ${clip(e.client_concerns, 200)}`).join('\n'));
  } catch (e) { steps.push({ what: "Read Aria's records", ok: false }); console.warn('aria facts:', e.message); }
  return { text: out.join('\n\n'), steps, ms: Date.now() - t0 };
}
// Admin only: the column names of one row of an Aria table (names only, no values), to find how tables link
async function columnsOf(table) {
  if (!/^[a-z_0-9]{2,60}$/.test(String(table || ''))) throw new Error('bad table name');
  const r = await aria('query', { sql: `select * from ${table} limit 1`, limit: 1 }, { timeoutMs: 20000, maxChars: 30000 });
  if (r.isError) return { error: clip(r.text, 300) };
  let j = null; try { j = JSON.parse(r.text); } catch (e) { return { error: 'not JSON' }; }
  if (j && Array.isArray(j.columns)) return { columns: j.columns.map((c) => (typeof c === 'string' ? c : c && c.name)) };
  const rows = Array.isArray(j) ? j : (j && (j.rows || j.data || j.results)) || [];
  return { columns: rows[0] && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : [], shape: Object.keys(j || {}) };
}
module.exports = { setDeps, on, forTicket, columnsOf };
