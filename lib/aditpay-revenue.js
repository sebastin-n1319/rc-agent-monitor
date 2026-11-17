'use strict';
/**
 * Batch 374: Adit Pay revenue analytics for admins (Pay home > Revenue). From Stripe, as synced into Zoho Analytics
 * ("Balance Transactions (Stripe-Pozative)"; Pozative is the Stripe account behind Adit Pay):
 *   revenue     Adit's application fees on each payment (less fee refunds)
 *   costs       Stripe fees and card network costs the platform pays
 *   net         revenue less costs
 *   volume      payments processed, from the Adit Pay Daily Volume report (Batch 375)
 * Past six complete months and the current month to date are actuals. The next six months are a forecast:
 *   1. a straight-line trend fitted to the last six complete months (least squares), month by month;
 *   2. the current month = actual so far + the remaining days at the expected daily amount (weekday pattern below);
 *   3. a day-wise split: each forecast month is spread over its days by the weekday pattern of the last eight weeks
 *      (a Monday carries more than a Saturday), so the days add up to the month;
 *   4. a range of plus or minus 1.28 times the trend's typical miss (about 80 percent of months fall inside).
 * Aggregates only. Cached 30 minutes; a slow refresh returns the last result meanwhile.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const sql = (q, o) => (D.sql || require('./aditpay-stripe').sql)(q, o);
const B = '"Balance Transactions (Stripe-Pozative)"';
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const ctDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const ym = (d) => d.slice(0, 7);
const addMonths = (ymStr, k) => { const [y, m] = ymStr.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const daysIn = (ymStr) => { const [y, m] = ymStr.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dow = (dateStr) => new Date(dateStr + 'T12:00:00Z').getUTCDay();
const r2 = (v) => Math.round(v * 100) / 100;

const TYPES = { application_fee: 'fees', application_fee_refund: 'feeRefunds', stripe_fee: 'stripeFees', network_cost: 'networkCosts', charge: 'volume', payment: 'volume', refund: 'refunds' };
const QUERY = (from) => `SELECT YEAR("Created Time") AS "y", MONTH("Created Time") AS "m", DAYOFMONTH("Created Time") AS "d", "Type" AS "t", SUM("Amount") AS "a", COUNT(*) AS "n"
  FROM ${B} WHERE "Created Time" >= '${from} 00:00:00' AND "Type" IN ('application_fee','application_fee_refund','stripe_fee','network_cost','charge','payment','refund')
  GROUP BY YEAR("Created Time"), MONTH("Created Time"), DAYOFMONTH("Created Time"), "Type"`;

/** rows -> { 'YYYY-MM-DD': { fees, feeRefunds, stripeFees, networkCosts, volume, refunds, txns } } */
function byDay(rows) {
  const out = {};
  for (const r of rows || []) {
    const k = TYPES[String(r.t)]; if (!k) continue;
    const d = `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`;
    const o = out[d] || (out[d] = { fees: 0, feeRefunds: 0, stripeFees: 0, networkCosts: 0, volume: 0, refunds: 0, txns: 0 });
    o[k] += num(r.a); if (k === 'volume') o.txns += num(r.n);
  }
  return out;
}
/** A month's figures from its days: revenue = fees + fee refunds (negative); costs = Stripe fees + network costs (positive). */
function monthOf(days, m) {
  const t = { revenue: 0, costs: 0, volume: 0, refunds: 0, txns: 0, days: 0 };
  for (const [d, o] of Object.entries(days)) {
    if (ym(d) !== m) continue;
    t.revenue += o.fees + o.feeRefunds; t.costs += -(o.stripeFees + o.networkCosts); t.volume += o.volume; t.refunds += -o.refunds; t.txns += o.txns; t.days++;
  }
  t.net = t.revenue - t.costs; t.margin = t.volume ? t.revenue / t.volume : null;
  return t;
}
/** Least-squares line through ys (x = 0..n-1): { a, b, miss } where miss is the typical size of a month's miss. */
function fit(ys) {
  const n = ys.length; if (!n) return { a: 0, b: 0, miss: 0 };
  const mx = (n - 1) / 2, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0; ys.forEach((y, x) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; });
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const res = ys.map((y, x) => y - (a + b * x));
  const miss = n > 2 ? Math.sqrt(res.reduce((s, v) => s + v * v, 0) / (n - 2)) : 0;
  return { a, b, miss };
}
/** Weekday weights (Sun..Sat) from the given days' revenue: each weekday's average divided by the overall average. */
function weekdayWeights(days, key) {
  const sum = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const [d, v] of Object.entries(days)) { const w = dow(d); sum[w] += v[key]; cnt[w]++; }
  const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0)), all = avg.reduce((s, v) => s + v, 0) / 7;
  return avg.map((v) => (all ? v / all : 1));
}
function split(m, total, w) {
  const n = daysIn(m), ds = [];
  for (let i = 1; i <= n; i++) { const d = m + '-' + String(i).padStart(2, '0'); ds.push({ date: d, w: w[dow(d)] }); }
  const tw = ds.reduce((s, x) => s + x.w, 0) || 1;
  return ds.map((x) => ({ date: x.date, amount: r2(total * x.w / tw) }));
}

function compute(days, today) {
  const cur = ym(today);
  const complete = []; for (let k = 6; k >= 1; k--) complete.push(addMonths(cur, -k));
  const past = complete.map((m) => Object.assign({ month: m, actual: true }, monthOf(days, m)));
  const curM = Object.assign({ month: cur, actual: true, partial: true }, monthOf(days, cur));
  // the weekday pattern and the daily level come from the last eight full weeks before today
  const since = new Date(Date.parse(today + 'T12:00:00Z') - 56 * 864e5).toISOString().slice(0, 10);
  const recent = Object.fromEntries(Object.entries(days).filter(([d]) => d >= since && d < today).map(([d, o]) => [d, { revenue: o.fees + o.feeRefunds, volume: o.volume }]));
  const wRev = weekdayWeights(recent, 'revenue'), wVol = weekdayWeights(recent, 'volume');
  const metrics = ['revenue', 'costs', 'net', 'volume'];
  const lines = {}; for (const k of metrics) lines[k] = fit(past.map((p) => p[k]));
  const at = (k, x) => Math.max(0, lines[k].a + lines[k].b * x);
  // the current month: actual so far plus the remaining days at the expected daily amount
  const [cy, cmn, cd] = today.split('-').map(Number), dim = daysIn(cur);
  const elapsed = Object.keys(days).filter((d) => ym(d) === cur && d < today).length || Math.max(0, cd - 1);
  const trendCur = { revenue: at('revenue', 6), costs: at('costs', 6), net: at('net', 6), volume: at('volume', 6) };
  const curDaysRev = split(cur, trendCur.revenue, wRev), curDaysVol = split(cur, trendCur.volume, wVol);
  const remRev = curDaysRev.filter((x) => x.date >= today).reduce((s, x) => s + x.amount, 0);
  const remVol = curDaysVol.filter((x) => x.date >= today).reduce((s, x) => s + x.amount, 0);
  const toDateRev = Object.entries(days).filter(([d]) => ym(d) === cur && d < today).reduce((s, [, o]) => s + o.fees + o.feeRefunds, 0);
  const toDateVol = Object.entries(days).filter(([d]) => ym(d) === cur && d < today).reduce((s, [, o]) => s + o.volume, 0);
  const costShare = trendCur.revenue ? trendCur.costs / trendCur.revenue : 0;
  curM.projected = { revenue: r2(toDateRev + remRev), volume: r2(toDateVol + remVol) };
  curM.projected.costs = r2(curM.projected.revenue * costShare); curM.projected.net = r2(curM.projected.revenue - curM.projected.costs);
  curM.toDate = { revenue: r2(toDateRev), volume: r2(toDateVol), throughDay: elapsed, daysInMonth: dim };
  const forecast = [];
  for (let k = 1; k <= 6; k++) {
    const m = addMonths(cur, k), x = 6 + k, f = { month: m, forecast: true };
    for (const key of metrics) { f[key] = r2(at(key, x)); f[key + 'Low'] = r2(Math.max(0, f[key] - 1.28 * lines[key].miss)); f[key + 'High'] = r2(f[key] + 1.28 * lines[key].miss); }
    f.days = split(m, f.revenue, wRev).map((d, i) => Object.assign(d, { volume: split(m, f.volume, wVol)[i].amount }));
    forecast.push(f);
  }
  const daily = Object.entries(days).filter(([d]) => d >= complete[0] + '-01').sort(([a], [b]) => a.localeCompare(b)).map(([date, o]) => ({ date, revenue: r2(o.fees + o.feeRefunds), volume: r2(o.volume), txns: o.txns }));
  const sum = (arr, k) => r2(arr.reduce((s, x) => s + (x[k] || 0), 0));
  return {
    today, past, current: curM, forecast, daily,
    curDays: curDaysRev.map((d, i) => Object.assign(d, { volume: curDaysVol[i].amount, actual: days[d.date] ? r2(days[d.date].fees + days[d.date].feeRefunds) : null, actualVolume: days[d.date] ? r2(days[d.date].volume) : null })),
    totals: { past6: { revenue: sum(past, 'revenue'), costs: sum(past, 'costs'), net: sum(past, 'net'), volume: sum(past, 'volume') }, next6: { revenue: sum(forecast, 'revenue'), costs: sum(forecast, 'costs'), net: sum(forecast, 'net'), volume: sum(forecast, 'volume') } },
    method: {
      trend: Object.fromEntries(metrics.map((k) => [k, { perMonth: r2(lines[k].b), base: r2(lines[k].a), miss: r2(lines[k].miss) }])),
      weekday: { revenue: wRev.map(r2), volume: wVol.map(r2), from: since, to: today },
      text: [
        'Revenue is Adit\'s application fee on each Adit Pay payment, less fee refunds. Costs are the Stripe fees and card network costs the platform pays. Net is revenue less costs. Volume is the payments processed, from the Adit Pay Daily Volume report.',
        'Trend: a straight line fitted (least squares) to the last six complete months. Each next month is that line carried forward; revenue changes by about $' + Math.round(lines.revenue.b).toLocaleString('en-US') + ' a month on this trend.',
        'This month: the actual amount so far plus the remaining days at the expected daily amount.',
        'Day-wise split: each month is spread over its days by the weekday pattern of the last eight weeks (' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => d + ' ' + wRev[i].toFixed(2) + 'x').join(', ') + ' of an average day). Holidays are not taken out.',
        'Range: plus or minus 1.28 times the trend\'s typical miss over the six months, so about 8 in 10 months should land inside it.',
      ],
    },
  };
}

let _c = null, _at = 0, _p = null;
async function build() {
  const now = Date.now(), today = ctDate(now);
  const from = addMonths(ym(today), -6) + '-01';
  const [rows, pivot] = await Promise.all([sql(QUERY(from), { timeoutMs: 150000 }), (D.pivotDays || require('./aditpay-stripe').pivotDays)().catch(() => null)]);
  const days = byDay(rows);
  // Batch 375: volume is taken from the Adit Pay Daily Volume report itself, so it matches that report to the dollar
  // (the balance transactions ran about 0.5% higher); revenue and costs stay from the balance transactions.
  if (pivot) for (const [d, v] of Object.entries(pivot)) { if (d < from) continue; const o = days[d] || (days[d] = { fees: 0, feeRefunds: 0, stripeFees: 0, networkCosts: 0, volume: 0, refunds: 0, txns: 0 }); o.volume = Number(v) || 0; }
  return Object.assign({ at: new Date().toISOString(), volumeSource: pivot ? 'Adit Pay Daily Volume report' : 'Stripe balance transactions' }, compute(days, today));
}
async function summary({ fresh = false, waitMs = 25000 } = {}) {
  if (!fresh && _c && Date.now() - _at < 30 * 60e3) return _c;
  if (!_p) _p = build().then((v) => { _c = v; _at = Date.now(); return v; }).finally(() => { _p = null; });
  const v = await Promise.race([_p.catch((e) => ({ error: String(e.message || e).slice(0, 200) })), new Promise((r) => setTimeout(() => r(null), waitMs))]);
  return v && !v.error ? v : _c || (v && v.error ? { error: v.error } : { loading: true });
}
module.exports = { setDeps, summary, compute, byDay, fit, weekdayWeights, split, monthOf, QUERY };
