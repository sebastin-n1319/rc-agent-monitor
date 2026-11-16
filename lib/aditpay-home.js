'use strict';
/**
 * Batch 355: Adit Pay workspace home. One summary for the T2 Adit Pay team, read from AditKB (Desk and CRM data):
 *   queue      open T2 Adit Pay tickets by status and owner, the oldest ones, created and closed this week
 *   topics     what the last 30 days of tickets were about
 *   revenue    Adit Pay MRR across deals, and processing volume (all time) when the volume view is readable
 *   adoption   the eleven Adit Pay categories (house rule "Adit Pay category"), current bucket per deal
 *   terminals  practices with a terminal, terminal volume, and the busiest terminal practices
 * Cached for 10 minutes. Every block is optional: a query that fails leaves that block empty, never the page.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const q = (sql, n = 200) => (D.query || require('./aditkb-service').query)(sql, n).then((r) => (r && r.rows) || []);
const TEAM_ID = () => process.env.ADITPAY_TEAM_ID || '197800000070274100';
const num = (v) => (v == null || v === '' ? null : Number(v));
const base = () => `${team()} AND t.status <> 'Closed'`;
const team = () => `t.j_team_id = '${TEAM_ID().replace(/[^0-9]/g, '')}' AND coalesce(t.is_deleted, false) = false AND coalesce(t.is_spam, false) = false`;

const SQL = {
  status: () => `SELECT t.status, count(*) AS n FROM desk_tickets t WHERE ${base()} GROUP BY 1 ORDER BY 2 DESC`,
  owners: () => `SELECT coalesce(t.assignee_name, 'Unassigned') AS who, count(*) AS n, min(t.created_time) AS oldest,
      count(*) FILTER (WHERE t.created_time < now() - interval '5 days') AS stale
    FROM desk_tickets t WHERE ${base()} GROUP BY 1 ORDER BY 2 DESC`,
  oldest: () => `SELECT t.ticket_number, t.web_url, t.subject, t.contact_account_name AS practice, t.status, t.assignee_name AS owner,
      t.created_time, coalesce(t.sub_category, t.category) AS topic
    FROM desk_tickets t WHERE ${base()} ORDER BY t.created_time ASC LIMIT 12`,
  flow: () => `SELECT count(*) FILTER (WHERE t.created_time > now() - interval '7 days') AS created_7d,
      count(*) FILTER (WHERE t.closed_time > now() - interval '7 days') AS closed_7d,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY t.aria_resolution_hours_business) FILTER (WHERE t.closed_time > now() - interval '30 days') AS median_bh_30d
    FROM desk_tickets t WHERE ${team()} AND (t.created_time > now() - interval '30 days' OR t.closed_time > now() - interval '30 days')`,
  // Desk categories are mostly empty for this team, so topics come from the subject (same buckets as the Nov 2026 audit).
  topics: () => `SELECT CASE
      WHEN t.subject ~* '(post|ledger|sync)' THEN 'Posting to EHR'
      WHEN t.subject ~* '(terminal|reader|wisepos|s700|s710|card machine)' THEN 'Terminals'
      WHEN t.subject ~* 'refund' THEN 'Refunds'
      WHEN t.subject ~* '(payout|deposit|bank|transfer)' THEN 'Payouts and bank'
      WHEN t.subject ~* '(declin|failed|fail)' THEN 'Declines and failures'
      WHEN t.subject ~* '(fee|surcharge|convenience|pricing|rate)' THEN 'Fees'
      WHEN t.subject ~* '(plan|subscription|recurring)' THEN 'Plans and subscriptions'
      WHEN t.subject ~* '(link|request|text to pay|invoice)' THEN 'Payment links and requests'
      WHEN t.subject ~* '(setup|set up|sign up|onboard|activat|enable)' THEN 'Setup'
      WHEN t.subject ~* '(dispute|chargeback)' THEN 'Disputes'
      ELSE 'Other' END AS topic, count(*) AS n
    FROM desk_tickets t WHERE ${team()} AND t.created_time > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 11`,
  mrr: () => `SELECT count(*) FILTER (WHERE adit_pay_mrr > 0) AS deals, sum(adit_pay_mrr) FILTER (WHERE adit_pay_mrr > 0) AS mrr FROM aria_deal_rows`,
  adoption: () => `SELECT pay_category_number AS k, pay_category AS label, count(*) AS n FROM aria_pay_category_history WHERE to_date IS NULL GROUP BY 1, 2 ORDER BY 1`,
  volume: () => `SELECT sum(total_volume) AS volume, sum(terminal_volume) AS terminal_volume, sum(txns) AS txns, sum(terminal_txns) AS terminal_txns,
      sum(terminals_seen) AS terminals, count(*) FILTER (WHERE terminal_txns > 0) AS terminal_practices,
      count(*) FILTER (WHERE last_terminal_txn > now() - interval '30 days') AS terminal_active_30d,
      count(*) FILTER (WHERE last_txn > now() - interval '30 days') AS active_30d
    FROM deal_terminal_usage`,
  topTerminals: () => `SELECT account_name AS practice, terminals_seen AS terminals, terminal_txns, terminal_volume, last_terminal_txn
    FROM deal_terminal_usage WHERE terminal_txns > 0 ORDER BY terminal_volume DESC NULLS LAST LIMIT 8`,
};

async function safe(name) {
  try { return { ok: true, rows: await q(SQL[name]()) }; } catch (e) { return { ok: false, rows: [], error: String(e.message || e).slice(0, 160) }; }
}

let _cache = null, _at = 0;
async function summary({ fresh = false } = {}) {
  if (!fresh && _cache && Date.now() - _at < 10 * 60 * 1000) return _cache;
  const names = Object.keys(SQL);
  const res = await Promise.all(names.map(safe));
  const R = {}; names.forEach((n, i) => { R[n] = res[i]; });
  const f = R.flow.rows[0] || {}, m = R.mrr.rows[0] || {}, v = R.volume.rows[0] || {};
  const owners = R.owners.rows.map((r) => ({ who: String(r.who || '').replace(/\s*\(Adit Pay\)\s*$/i, ''), open: num(r.n), stale: num(r.stale), oldest: r.oldest }));
  const adoption = R.adoption.rows.map((r) => ({ k: num(r.k), label: String(r.label || '').replace(/^\d+\.\s*/, ''), n: num(r.n) }));
  const hasTerm = adoption.filter((a) => [3, 5, 6, 7, 9].includes(a.k)).reduce((s, a) => s + a.n, 0);
  const out = {
    at: new Date().toISOString(),
    queue: {
      ok: R.status.ok,
      open: R.status.rows.reduce((s, r) => s + num(r.n), 0),
      byStatus: R.status.rows.map((r) => ({ status: r.status, n: num(r.n) })),
      owners,
      stale: owners.reduce((s, o) => s + (o.stale || 0), 0),
      oldest: R.oldest.rows.map((r) => ({ number: r.ticket_number, url: r.web_url, subject: String(r.subject || '').slice(0, 140), practice: r.practice || '', status: r.status, owner: String(r.owner || 'Unassigned').replace(/\s*\(Adit Pay\)\s*$/i, ''), created: r.created_time, topic: r.topic || '' })),
      created7d: num(f.created_7d), closed7d: num(f.closed_7d), medianBusinessHours30d: f.median_bh_30d == null ? null : Math.round(Number(f.median_bh_30d) * 10) / 10,
    },
    topics: R.topics.rows.map((r) => ({ topic: r.topic, n: num(r.n) })),
    revenue: { ok: R.mrr.ok, mrr: num(m.mrr), deals: num(m.deals), volumeOk: R.volume.ok, volume: num(v.volume), txns: num(v.txns), active30d: num(v.active_30d) },
    adoption: { ok: R.adoption.ok, buckets: adoption, total: adoption.reduce((s, a) => s + a.n, 0) },
    terminals: {
      ok: R.volume.ok, withTerminal: hasTerm, notUsing: (adoption.find((a) => a.k === 3) || {}).n || 0,
      volume: num(v.terminal_volume), txns: num(v.terminal_txns), terminals: num(v.terminals), practices: num(v.terminal_practices), active30d: num(v.terminal_active_30d),
      top: R.topTerminals.rows.map((r) => ({ practice: r.practice || '', terminals: num(r.terminals), txns: num(r.terminal_txns), volume: num(r.terminal_volume), last: r.last_terminal_txn })),
    },
    missing: names.filter((n) => !R[n].ok),
  };
  _cache = out; _at = Date.now();
  return out;
}

module.exports = { setDeps, summary, _sql: SQL };
