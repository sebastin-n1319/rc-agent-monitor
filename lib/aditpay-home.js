'use strict';
/**
 * Batch 355: Adit Pay workspace home. One summary for the T2 Adit Pay team, read from AditKB (Desk and CRM data):
 *   queue      open T2 Adit Pay tickets by status and owner, the oldest ones, created and closed this week
 *   topics     what the last 30 days of tickets were about
 *   revenue    Adit Pay MRR across deals (AditKB), processing volume last 30 and 90 days (Zoho CRM Adit Pay module)
 *   adoption   the eleven Adit Pay categories (house rule "Adit Pay category"), current bucket per deal
 *   terminals  terminal fleet by status and reader type, terminals used in 30 days (Zoho CRM Stripe Terminal module)
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
};

async function safe(name) {
  try { return { ok: true, rows: await q(SQL[name]()) }; } catch (e) { return { ok: false, rows: [], error: String(e.message || e).slice(0, 160) }; }
}


// Zoho CRM (suite token): the Adit Pay module holds 30 and 90 day roll-ups per practice; Stripe Terminal holds each reader.
// COQL allows at most 5 aggregates per query.
const COQL = {
  vol30: `select SUM(Transaction_Value_Last_30_Days), SUM(Transaction_Value_CP_Last_30_Days), SUM(No_of_Transactions_Last_30_Days), SUM(No_of_CP_Transactions_Last_30_Days), SUM(Terminal_Count) from Adit_Pay where id is not null`,
  vol90: `select COUNT(id), SUM(Transaction_Value_Last_90_Days), SUM(No_of_Transaction_Last_90_Days) from Adit_Pay where Transaction_Value_Last_30_Days > 0`,
  top: `select Account.Account_Name, Terminal_Count, Transaction_Value_Last_30_Days, Transaction_Value_CP_Last_30_Days, No_of_Transactions_Last_30_Days, Last_Transaction_Date from Adit_Pay where Transaction_Value_Last_30_Days > 0 order by Transaction_Value_Last_30_Days desc limit 8`,
  termStatus: `select Status, COUNT(id), SUM(Terminal_Transaction_Value_Last_30_days), SUM(No_of_Terminal_Transactions_Last_30_Days) from Stripe_Terminal where id is not null group by Status`,
  termUsed: `select COUNT(id) from Stripe_Terminal where Status = 'Delivered' and No_of_Terminal_Transactions_Last_30_Days > 0`,
  readers: `select Reader_Type2, COUNT(id) from Stripe_Terminal where Status = 'Delivered' group by Reader_Type2`,
};
const coql = (qs) => (D.coql || require('./crm-qa').coql)(qs);
async function safeC(name) {
  try { const j = await coql(COQL[name]); return { ok: true, rows: (j && j.data) || [] }; } catch (e) { return { ok: false, rows: [], error: String(e.message || e).slice(0, 160) }; }
}
const g = (r, k) => (r ? num(r[k]) : null);

let _cache = null, _at = 0;
async function summary({ fresh = false } = {}) {
  if (!fresh && _cache && Date.now() - _at < 10 * 60 * 1000) return _cache;
  const names = Object.keys(SQL), cn = Object.keys(COQL);
  const [res, cres] = await Promise.all([Promise.all(names.map(safe)), Promise.all(cn.map(safeC))]);
  const R = {}; names.forEach((n, i) => { R[n] = res[i]; });
  const C = {}; cn.forEach((n, i) => { C[n] = cres[i]; });
  const f = R.flow.rows[0] || {}, m = R.mrr.rows[0] || {};
  const v30 = C.vol30.rows[0], v90 = C.vol90.rows[0];
  const vol30 = g(v30, 'SUM(Transaction_Value_Last_30_Days)'), cp30 = g(v30, 'SUM(Transaction_Value_CP_Last_30_Days)');
  const tx30 = g(v30, 'SUM(No_of_Transactions_Last_30_Days)'), cptx30 = g(v30, 'SUM(No_of_CP_Transactions_Last_30_Days)');
  const ts = C.termStatus.rows.map((r) => ({ status: r.Status || 'No status', n: num(r['COUNT(id)']) || 0, vol30: num(r['SUM(Terminal_Transaction_Value_Last_30_days)']), txns30: num(r['SUM(No_of_Terminal_Transactions_Last_30_Days)']) })).sort((a, b) => b.n - a.n);
  const tsN = (re) => ts.filter((x) => re.test(x.status)).reduce((s2, x) => s2 + x.n, 0);
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
    revenue: {
      ok: R.mrr.ok, mrr: num(m.mrr), deals: num(m.deals), crmOk: C.vol30.ok,
      vol30, cp30, cnp30: vol30 == null || cp30 == null ? null : vol30 - cp30, txns30: tx30, cpTxns30: cptx30,
      avgTicket: vol30 && tx30 ? vol30 / tx30 : null, dailyAvg: vol30 == null ? null : vol30 / 24, // house rule: 24 business days a month
      active30d: g(v90, 'COUNT(id)'), vol90: g(v90, 'SUM(Transaction_Value_Last_90_Days)'), txns90: g(v90, 'SUM(No_of_Transaction_Last_90_Days)'),
    },
    topPractices: C.top.rows.map((r) => ({ practice: r['Account.Account_Name'] || '', terminals: num(r.Terminal_Count), vol30: num(r.Transaction_Value_Last_30_Days), cp30: num(r.Transaction_Value_CP_Last_30_Days), txns30: num(r.No_of_Transactions_Last_30_Days), last: r.Last_Transaction_Date || null })),
    adoption: { ok: R.adoption.ok, buckets: adoption, total: adoption.reduce((s, a) => s + a.n, 0) },
    terminals: {
      ok: C.termStatus.ok, withTerminal: hasTerm, notUsing: (adoption.find((a2) => a2.k === 3) || {}).n || 0,
      fleet: g(v30, 'SUM(Terminal_Count)'), byStatus: ts, delivered: tsN(/^Delivered$/), inTransit: tsN(/Ready to Ship|Shipped|pending/i), returned: tsN(/Returned|Undeliverable|Lost/i),
      used30: g(C.termUsed.rows[0], 'COUNT(id)'), vol30: cp30, txns30: cptx30, cpShare: vol30 && cp30 != null ? cp30 / vol30 : null,
      readers: C.readers.rows.map((r) => ({ type: r.Reader_Type2 || 'Not recorded', n: num(r['COUNT(id)']) || 0 })).sort((a2, b) => b.n - a2.n),
    },
    missing: names.filter((n) => !R[n].ok).concat(cn.filter((n) => !C[n].ok).map((n) => 'crm:' + n)),
  };
  _cache = out; _at = Date.now();
  return out;
}

module.exports = { setDeps, summary, _sql: SQL, _coql: COQL };
