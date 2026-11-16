'use strict';
/**
 * Batch 358: Adit Pay figures from Stripe, as synced into Zoho Analytics ("Adit Main Workspace").
 * Pozative is the Stripe account behind Adit Pay, so every row in these tables is Adit Pay.
 *   report  the "Adit Pay Daily Volume" pivot (view 1439480000031074813), the team's official daily volume
 *   sql     read only SELECTs on the Stripe tables (Zoho Analytics bulk SQL export, an async job)
 * Read with the suite token, which already reads this workspace for the survey and ticket tables.
 * Aggregates only: no card, customer or email columns are ever selected.
 */
const analytics = require('./analytics-service');
const BASE = 'https://analyticsapi.zoho.com/restapi/v2';
const WS = () => process.env.ZOHO_ANALYTICS_WORKSPACE_ID || '1439480000000004002';
const ORG = () => process.env.ZOHO_ANALYTICS_ORG_ID || '';
const REPORT_VIEW = () => process.env.ADITPAY_VOLUME_VIEW_ID || '1439480000031074813';
const TABLES = ['Charges (Stripe-Pozative)', 'Balance Transactions (Stripe-Pozative)', 'Accounts (Stripe-Pozative)'];
// Batch 359: the Stripe accounts table also holds owners' personal details; only Id and the practice names are read
const PII = /"(Receipt Email|Customer|Card Customer|Fingerprint|Last4|Dynamic Last4|Card Name|Address [^"]*|Receipt Number|Card Id|Email|Support Email|Support Phone|Phone Number|first_name|last_name|gender|line1|line2|postal_code|city|state|country_1|Dob [^"]*|Personal [^"]*|ssn [^"]*|Tax Id[^"]*|Acceptance [^"]*|Is Business [^"]*)"/i;
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const fetchF = (...a) => (D.fetch || fetch)(...a);
const token = () => (D.token || analytics.getSuiteAccessToken)();
const H = async () => ({ Authorization: 'Zoho-oauthtoken ' + await token(), 'ZANALYTICS-ORGID': ORG() });

// ── the pivot report, exported as CSV ─────────────────────────────────────
function csvRows(text) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim()));
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const money = (v) => { const s = String(v == null ? '' : v).replace(/[$,\s]/g, ''); return s === '' || isNaN(Number(s)) ? null : Number(s); };
/** CSV of the pivot (Day rows, one column per month) -> { days: { 'YYYY-MM-DD': amount }, months: { 'YYYY-MM': total } } */
function parsePivot(text) {
  const rows = csvRows(String(text || ''));
  const hi = rows.findIndex((r) => r.filter((c) => /^[A-Za-z]{3}\s+\d{4}$/.test(String(c).trim())).length >= 1);
  if (hi < 0) return { days: {}, months: {} };
  const head = rows[hi].map((c) => String(c).trim());
  const cols = head.map((c) => { const m = c.match(/^([A-Za-z]{3})\s+(\d{4})$/); return m && MON[m[1].toLowerCase()] ? m[2] + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') : null; });
  const dayCol = head.findIndex((c) => /^day$/i.test(c));
  const days = {}, months = {};
  for (const r of rows.slice(hi + 1)) {
    const first = String(r[dayCol >= 0 ? dayCol : 0] || '').trim();
    const isTotal = r.some((c) => /grand total/i.test(String(c)));
    const d = Number(first);
    cols.forEach((ym, i) => {
      if (!ym) return;
      const v = money(r[i]); if (v == null) return;
      if (isTotal) months[ym] = v;
      else if (Number.isInteger(d) && d >= 1 && d <= 31) days[ym + '-' + String(d).padStart(2, '0')] = v;
    });
  }
  for (const ym of cols.filter(Boolean)) if (months[ym] == null) months[ym] = Object.entries(days).filter(([k]) => k.startsWith(ym)).reduce((s, [, v]) => s + v, 0);
  return { days, months };
}
async function reportCsv() {
  const url = `${BASE}/workspaces/${WS()}/views/${REPORT_VIEW()}/data?CONFIG=${encodeURIComponent(JSON.stringify({ responseFormat: 'csv' }))}`;
  const res = await fetchF(url, { headers: await H(), signal: AbortSignal.timeout(45000) });
  const text = await res.text();
  if (!res.ok) throw new Error('Zoho Analytics report ' + res.status + ': ' + text.slice(0, 160));
  return text;
}
const ctDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
/** Volume from the report: last 30 days (today in CT included), month totals and the daily series. */
async function report() {
  const p = parsePivot(await reportCsv());
  const now = Date.now(), from = ctDate(now - 29 * 864e5), to = ctDate(now);
  const last30 = Object.entries(p.days).filter(([k]) => k >= from && k <= to).reduce((s, [, v]) => s + v, 0);
  const series = Object.entries(p.days).sort(([a], [b]) => a.localeCompare(b)).slice(-60).map(([date, amount]) => ({ date, amount }));
  const from90 = ctDate(now - 89 * 864e5);
  const last90 = Object.entries(p.days).filter(([k]) => k >= from90 && k <= to).reduce((s, [, v]) => s + v, 0);
  return { from, to, last30, last90, months: p.months, series, dayCount: Object.keys(p.days).length };
}

// ── read only SQL on the Stripe tables ────────────────────────────────────
function checkSql(q) {
  const s = String(q || '').trim();
  if (!/^select\s/i.test(s) || /;\s*\S/.test(s) || /\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i.test(s)) throw new Error('Only one SELECT is allowed');
  const named = Array.from(s.matchAll(/\bfrom\s+"([^"]+)"|\bjoin\s+"([^"]+)"/gi), (m) => m[1] || m[2]);
  if (!named.length || named.some((t) => !TABLES.includes(t))) throw new Error('Only the Stripe tables can be read: ' + TABLES.join(', '));
  if (PII.test(s) || /select\s+\*|\.\*/i.test(s)) throw new Error('Card, customer, owner and address columns are not read');
  return s;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, D.sleep === 0 ? 0 : ms));
async function sql(query, { timeoutMs = 60000 } = {}) {
  const q = checkSql(query);
  const start = await fetchF(`${BASE}/bulk/workspaces/${WS()}/data?CONFIG=${encodeURIComponent(JSON.stringify({ responseFormat: 'json', sqlQuery: q }))}`, { headers: await H(), signal: AbortSignal.timeout(30000) });
  const sj = await start.json().catch(() => ({}));
  const jobId = sj && sj.data && sj.data.jobId;
  if (!start.ok || !jobId) throw new Error('Zoho Analytics SQL ' + start.status + ': ' + JSON.stringify(sj).slice(0, 200));
  const until = Date.now() + timeoutMs;
  for (let i = 0; Date.now() < until; i++) {
    await sleep(i < 3 ? 1500 : 3000);
    const st = await fetchF(`${BASE}/bulk/workspaces/${WS()}/exportjobs/${jobId}`, { headers: await H(), signal: AbortSignal.timeout(20000) });
    const js = await st.json().catch(() => ({}));
    const status = String((js.data && (js.data.jobStatus || js.data.jobCode)) || '');
    if (/fail|error/i.test(status)) throw new Error('Zoho Analytics SQL job failed: ' + JSON.stringify(js.data).slice(0, 200));
    if (/complete|1004/i.test(status)) {
      const dl = await fetchF(`${BASE}/bulk/workspaces/${WS()}/exportjobs/${jobId}/data`, { headers: await H(), signal: AbortSignal.timeout(45000) });
      const txt = await dl.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) { throw new Error('Zoho Analytics SQL result is not JSON: ' + txt.slice(0, 120)); }
      return (j && (j.data || j.rows)) || [];
    }
  }
  throw new Error('Zoho Analytics SQL timed out');
}

// ── the checks run before any of this is shown on Pay home ───────────────
const C = '"Charges (Stripe-Pozative)"', B = '"Balance Transactions (Stripe-Pozative)"';
const PROBES = {
  status: (f) => `SELECT "Status", COUNT(*) AS "n", SUM("Amount") AS "amount", SUM("Amount Refunded") AS "refunded" FROM ${C} WHERE "Created" >= '${f}' GROUP BY "Status"`,
  octStatus: () => `SELECT "Status", COUNT(*) AS "n", SUM("Amount") AS "amount" FROM ${C} WHERE "Created" >= '2026-10-01 00:00:00' AND "Created" < '2026-11-01 00:00:00' GROUP BY "Status"`,
  channel: (f) => `SELECT "Online Vs Offline", COUNT(*) AS "n", SUM("Amount") AS "amount" FROM ${C} WHERE "Created" >= '${f}' AND "Status" = 'succeeded' GROUP BY "Online Vs Offline"`,
  brand: (f) => `SELECT "Brand", "Funding", COUNT(*) AS "n", SUM("Amount") AS "amount" FROM ${C} WHERE "Created" >= '${f}' AND "Status" = 'succeeded' GROUP BY "Brand", "Funding"`,
  failures: (f) => `SELECT "Failure Code", COUNT(*) AS "n", SUM("Amount") AS "amount" FROM ${C} WHERE "Created" >= '${f}' AND "Status" = 'failed' GROUP BY "Failure Code"`,
  disputes: (f) => `SELECT COUNT(*) AS "n", SUM("Amount") AS "amount" FROM ${C} WHERE "Created" >= '${f}' AND "Dispute" IS NOT NULL AND "Dispute" <> ''`,
  // Batch 359: top practices by Stripe volume (the CRM per-practice roll-ups ran high), named from the Stripe account
  top: (f) => `SELECT c."Destination" AS "acct", a."Business Name" AS "business", a."Display Name" AS "display", COUNT(*) AS "n", SUM(c."Amount") AS "amount", SUM(CASE WHEN c."Online Vs Offline" = 'Offline Transaction' THEN c."Amount" ELSE 0 END) AS "cp" FROM ${C} c LEFT JOIN "Accounts (Stripe-Pozative)" a ON c."Destination" = a."Id" WHERE c."Created" >= '${f}' AND c."Status" = 'succeeded' GROUP BY c."Destination", a."Business Name", a."Display Name" ORDER BY "amount" DESC LIMIT 10`,
  balance: (f) => `SELECT "Type", COUNT(*) AS "n", SUM("Amount") AS "amount", SUM("Fee") AS "fee", SUM("Net Amount") AS "net" FROM ${B} WHERE "Created Time" >= '${f}' GROUP BY "Type"`,
};
async function probe({ query } = {}) {
  if (query) return { query: checkSql(query), rows: await sql(query) };
  const out = { at: new Date().toISOString() };
  try { out.report = await report(); } catch (e) { out.report = { error: String(e.message || e).slice(0, 300) }; }
  const f = ctDate(Date.now() - 29 * 864e5) + ' 00:00:00';
  for (const [k, fn] of Object.entries(PROBES)) {
    try { out[k] = await sql(fn(f)); } catch (e) { out[k] = { error: String(e.message || e).slice(0, 300) }; }
  }
  return out;
}

// ── what Pay home shows (checked against the report on Nov 16, 2026) ────
// Volume, the monthly totals and the daily series come from the report itself, so they match it to the dollar. Counts,
// the card present split, declines, refunds and fees come from the Stripe tables for the same 30 days (the charges
// table dates in UTC, so its total runs within about 1% of the report's).
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
let _sum = null, _sumAt = 0, _inflight = null;
async function build() {
  const f = ctDate(Date.now() - 29 * 864e5) + ' 00:00:00';
  const safe = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e.message || e).slice(0, 200) }));
  const [rep, status, channel, failures, balance, top, brand] = await Promise.all([safe(report()), safe(sql(PROBES.status(f))), safe(sql(PROBES.channel(f))), safe(sql(PROBES.failures(f))), safe(sql(PROBES.balance(f))), safe(sql(PROBES.top(f), { timeoutMs: 150000 })), safe(sql(PROBES.brand(f), { timeoutMs: 150000 }))]);
  const out = { at: new Date().toISOString(), missing: [] };
  if (rep.ok) {
    const r = rep.v, months = Object.entries(r.months).sort(([a2], [b2]) => b2.localeCompare(a2));
    out.volume = { from: r.from, to: r.to, last30: r.last30, last90: r.last90, months: months.slice(0, 7).map(([month, amount]) => ({ month, amount })), series: r.series.slice(-30) };
  } else out.missing.push('report: ' + rep.e);
  if (status.ok) {
    const by = (k) => status.v.find((x) => String(x.Status) === k) || {};
    const ok = by('succeeded'), bad = by('failed');
    out.charges = { succeeded: num(ok.n), succeededAmount: num(ok.amount), failed: num(bad.n), failedAmount: num(bad.amount), pending: num(by('pending').n) };
    out.charges.declineRate = out.charges.succeeded + out.charges.failed ? out.charges.failed / (out.charges.succeeded + out.charges.failed) : null;
  } else out.missing.push('charges: ' + status.e);
  if (channel.ok) {
    const g = (re) => channel.v.filter((x) => re.test(String(x['Online Vs Offline'] || ''))).reduce((s2, x) => ({ n: s2.n + num(x.n), amount: s2.amount + num(x.amount) }), { n: 0, amount: 0 });
    out.channel = { cardPresent: g(/offline/i), online: g(/^online/i), other: g(/^$/) };
  } else out.missing.push('channel: ' + channel.e);
  if (failures.ok) out.failures = failures.v.map((x) => ({ code: String(x['Failure Code'] || 'not given').replace(/_/g, ' '), n: num(x.n), amount: num(x.amount) })).sort((a2, b2) => b2.n - a2.n).slice(0, 6);
  else out.missing.push('failures: ' + failures.e);
  if (balance.ok) {
    const t = (k) => balance.v.find((x) => String(x.Type) === k) || {};
    out.balance = { refunds: { n: num(t('refund').n), amount: Math.abs(num(t('refund').amount)) }, applicationFees: num(t('application_fee').amount), networkCost: Math.abs(num(t('network_cost').amount)), stripeFees: Math.abs(num(t('stripe_fee').amount)) };
  } else out.missing.push('balance: ' + balance.e);
  if (top.ok) out.topPractices = top.v.map((x) => ({ practice: String(x.business || x.display || '').trim() || 'Name not on file', n: num(x.n), amount: num(x.amount), cp: num(x.cp) }));
  else out.missing.push('top: ' + top.e);
  if (brand.ok) {
    const tot = brand.v.reduce((s2, x) => s2 + num(x.amount), 0), byB = {}, byF = {};
    for (const x of brand.v) { const b0 = String(x.Brand || '').trim() || 'Other'; const f0 = String(x.Funding || '').trim() || 'unknown'; byB[b0] = (byB[b0] || 0) + num(x.amount); byF[f0] = (byF[f0] || 0) + num(x.amount); }
    const list = (o) => Object.entries(o).map(([k, v]) => ({ name: k, amount: v, share: tot ? v / tot : null })).sort((a2, b2) => b2.amount - a2.amount);
    out.cards = { brands: list(byB).slice(0, 6), funding: list(byF) };
  } else out.missing.push('brand: ' + brand.e);
  return out;
}
/** Cached 30 minutes; a slow refresh never holds Pay home for more than waitMs (the last result is used meanwhile). */
async function summary({ fresh = false, waitMs = 25000 } = {}) {
  if (!fresh && _sum && Date.now() - _sumAt < 30 * 60e3) return _sum;
  if (!_inflight) _inflight = build().then((v) => { _sum = v; _sumAt = Date.now(); return v; }).finally(() => { _inflight = null; });
  const timer = new Promise((r) => setTimeout(() => r(null), waitMs));
  const v = await Promise.race([_inflight.catch(() => null), timer]);
  return v || _sum || { loading: true, missing: [] };
}

module.exports = { setDeps, parsePivot, csvRows, report, sql, checkSql, probe, summary, PROBES, TABLES };
