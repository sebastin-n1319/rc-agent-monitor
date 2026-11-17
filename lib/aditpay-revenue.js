'use strict';
/**
 * Batch 374/376: Adit Pay revenue analytics for admins (Pay home > Revenue), built on the whole history since day one.
 *   volume   payments processed, every day from the Adit Pay Daily Volume report (Zoho Analytics, Nov 2021 onward)
 *   revenue  Adit's application fees less fee refunds  } from Stripe's balance transactions ("Balance Transactions
 *   costs    Stripe fees and card network costs         }  (Stripe-Pozative)"; Pozative is the Stripe account behind
 *   net      revenue less costs                         }  Adit Pay)
 * Forecast (the next six months, and the rest of this month):
 *   1. Seasonality: for every complete month, volume divided by its centred 12-month average; averaged per calendar
 *      month over all the years, so a month that is always strong or weak (December, March) carries that pattern.
 *   2. Business days: each month is weighted by its weekdays using the weekday pattern of the last eight weeks
 *      (a month with five Mondays and four Saturdays processes more).
 *   3. Trend: volume with the season and business days taken out, fitted as steady growth (a straight line on the
 *      log) over the last 24 complete months, so the early hyper-growth years do not inflate it.
 *   4. Revenue = forecast volume x the take rate of the last six months; costs = revenue x the cost share of the last
 *      six months; net = revenue less costs.
 *   5. Accuracy: the same method is run as if it were six months ago and its forecast compared with what happened;
 *      the average miss (MAPE) is shown, and the range is plus or minus 1.28 times that test's typical miss.
 *   6. Day-wise: each month is spread over its days by the weekday pattern.
 * Aggregates only. Cached one hour; a slow refresh returns the last result meanwhile.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const sql = (q, o) => (D.sql || require('./aditpay-stripe').sql)(q, o);
const pivotDays = () => (D.pivotDays || require('./aditpay-stripe').pivotDays)();
const B = '"Balance Transactions (Stripe-Pozative)"';
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const ctDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const ym = (d) => d.slice(0, 7);
const addMonths = (m, k) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 7); };
const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m); return out; };
const daysIn = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const dayKey = (m, i) => m + '-' + String(i).padStart(2, '0');
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);
const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map((v) => (v - m) ** 2)) / (a.length - 1)); };

const TYPES = { application_fee: 'fees', application_fee_refund: 'feeRefunds', stripe_fee: 'stripeFees', network_cost: 'networkCosts' };
const FEES_SQL = (from) => `SELECT YEAR("Created Time") AS "y", MONTH("Created Time") AS "m", DAYOFMONTH("Created Time") AS "d", "Type" AS "t", SUM("Amount") AS "a"
  FROM ${B} WHERE "Created Time" >= '${from} 00:00:00' AND "Type" IN ('application_fee','application_fee_refund','stripe_fee','network_cost')
  GROUP BY YEAR("Created Time"), MONTH("Created Time"), DAYOFMONTH("Created Time"), "Type"`;
/** fee rows -> { 'YYYY-MM-DD': { revenue, costs } } */
function feeDays(rows) {
  const out = {};
  for (const r of rows || []) {
    const k = TYPES[String(r.t)]; if (!k) continue;
    const d = `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`;
    const o = out[d] || (out[d] = { revenue: 0, costs: 0 });
    if (k === 'fees' || k === 'feeRefunds') o.revenue += num(r.a); else o.costs += -num(r.a);
  }
  return out;
}

/** Weekday weights (Sun..Sat): each weekday's average over the overall daily average. */
function weekdayWeights(values) {
  const s = [0, 0, 0, 0, 0, 0, 0], c = [0, 0, 0, 0, 0, 0, 0];
  for (const [d, v] of values) { const w = dow(d); s[w] += v; c[w]++; }
  const avg = s.map((x, i) => (c[i] ? x / c[i] : 0)), all = mean(avg);
  return avg.map((v) => (all ? v / all : 1));
}
// Batch 377: US holidays when practices are closed count like a Sunday (New Year's Day, Memorial Day, July 4, Labor Day,
// Thanksgiving and the day after, Christmas Eve, Christmas Day, New Year's Eve).
const _hol = {};
function holidays(y) {
  if (_hol[y]) return _hol[y];
  const nth = (mo, wd, n) => { const d = new Date(Date.UTC(y, mo - 1, 1)); const off = (wd - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, mo - 1, 1 + off + (n - 1) * 7)).toISOString().slice(0, 10); };
  const last = (mo, wd) => { const d = new Date(Date.UTC(y, mo, 0)); const off = (d.getUTCDay() - wd + 7) % 7; return new Date(Date.UTC(y, mo - 1, d.getUTCDate() - off)).toISOString().slice(0, 10); };
  const tg = nth(11, 4, 4), day = (mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return (_hol[y] = new Set([day(1, 1), last(5, 1), day(7, 4), nth(9, 1, 1), tg, new Date(Date.parse(tg + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10), day(12, 24), day(12, 25), day(12, 31)]));
}
const dayW = (d, w) => (holidays(Number(d.slice(0, 4))).has(d) ? w[0] : w[dow(d)]);
const bizFactor = (m, w) => { let t = 0; for (let i = 1; i <= daysIn(m); i++) t += dayW(dayKey(m, i), w); return t / 30.4375; };
function split(m, total, w) {
  const n = daysIn(m), ws = []; for (let i = 1; i <= n; i++) ws.push(dayW(dayKey(m, i), w));
  const tw = sum(ws) || 1; return ws.map((x, i) => ({ date: dayKey(m, i + 1), amount: total * x / tw }));
}
/** Seasonal index per calendar month (1..12) from complete months: value over the centred 12-month average. */
function seasonality(months, vals) {
  const ratios = {};
  for (let i = 6; i + 6 < months.length; i++) {
    const w = vals.slice(i - 6, i + 7); if (w.some((v) => !(v > 0))) continue;
    const cma = (sum(w.slice(0, 12)) + sum(w.slice(1, 13))) / 24; if (!cma) continue;
    const mo = Number(months[i].slice(5)); (ratios[mo] = ratios[mo] || []).push(vals[i] / cma);
  }
  const idx = {}; for (let mo = 1; mo <= 12; mo++) idx[mo] = ratios[mo] && ratios[mo].length ? mean(ratios[mo]) : 1;
  const norm = mean(Object.values(idx)) || 1; for (const k in idx) idx[k] /= norm;
  return { idx, years: Math.max(0, ...Object.values(ratios).map((r) => r.length)) };
}
/** Steady growth through x (0..n-1): ln y = a + b x. */
function logFit(ys) {
  const pts = ys.map((y, x) => [x, y]).filter(([, y]) => y > 0); const n = pts.length; if (n < 2) return { a: Math.log(ys[ys.length - 1] || 1), b: 0 };
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => Math.log(p[1])));
  let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (Math.log(y) - my); sxx += (x - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0; return { a: my - b * mx, b };
}
/** The model fitted on complete months up to `last` (Batch 377: window, damping and seasonality are options):
 *  returns at(month) -> forecast volume. Damping lets growth fade the further ahead it looks. */
function model(months, vol, w, last, o = {}) {
  const win = o.win || 18, damp = o.damp == null ? 0.9 : o.damp, useS = o.useS !== false;
  const upto = months.filter((m) => m <= last), vals = upto.map((m) => vol[m] || 0);
  const S = useS ? seasonality(upto, vals) : { idx: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 1])), years: 0 };
  const adj = upto.map((m, i) => vals[i] / (S.idx[Number(m.slice(5))] * bizFactor(m, w)));
  const tail = adj.slice(-win), t0 = upto.length - tail.length, f = logFit(tail), n = tail.length;
  const at = (m) => {
    const i = upto.indexOf(m), sf = S.idx[Number(m.slice(5))] * bizFactor(m, w);
    if (i >= 0) return Math.exp(f.a + f.b * (i - t0)) * sf;
    const k = monthsBetween(last, m).length - 1; let steps = 0; for (let j = 1; j <= k; j++) steps += Math.pow(damp, j);
    return Math.exp(f.a + f.b * (n - 1) + f.b * steps) * sf;
  };
  return { at, season: S, growth: Math.exp(f.b) - 1, opts: { win, damp, useS } };
}
/** Batch 377: tries each set of options as if forecasting from each of the last 12 months, up to six months ahead, and
 *  keeps the one that would have missed least. Returns the options, their average miss and every test miss. */
function pickModel(months, vol, w, lastFull) {
  const full = months.filter((m) => m <= lastFull), origins = full.slice(-13, -1);
  let best = null;
  for (const win of [12, 18, 24]) for (const damp of [1, 0.9, 0.8]) for (const useS of [true, false]) {
    const errs = [];
    for (const o of origins) {
      const M = model(months, vol, w, o, { win, damp, useS });
      for (const m of full.filter((x) => x > o).slice(0, 6)) if (vol[m]) errs.push((M.at(m) - vol[m]) / vol[m]);
    }
    if (!errs.length) continue;
    const mape = mean(errs.map(Math.abs));
    if (!best || mape < best.mape) best = { opts: { win, damp, useS }, mape, errs };
  }
  return best || { opts: { win: 18, damp: 0.9, useS: false }, mape: 0, errs: [] };
}

function compute(vDays, fDays, today) {
  const cur = ym(today), lastFull = addMonths(cur, -1);
  const first = Object.keys(vDays).filter((d) => vDays[d] > 0).sort()[0] || today;
  const months = monthsBetween(ym(first), cur);
  const vol = {}, rev = {}, cost = {}, hasFees = {};
  for (const [d, v] of Object.entries(vDays)) vol[ym(d)] = (vol[ym(d)] || 0) + num(v);
  for (const [d, o] of Object.entries(fDays)) { const m = ym(d); rev[m] = (rev[m] || 0) + o.revenue; cost[m] = (cost[m] || 0) + o.costs; hasFees[m] = true; }
  // weekday pattern of the last eight weeks before today
  const since = new Date(Date.parse(today + 'T12:00:00Z') - 56 * 864e5).toISOString().slice(0, 10);
  const wV = weekdayWeights(Object.entries(vDays).filter(([d]) => d >= since && d < today));
  const wR = weekdayWeights(Object.entries(fDays).filter(([d]) => d >= since && d < today).map(([d, o]) => [d, o.revenue]));
  const full = months.filter((m) => m <= lastFull);
  // Batch 377: the options (trend window, damping, seasonality) that would have forecast the last 12 months best
  const P = pickModel(months, vol, wV, lastFull), M = model(months, vol, wV, lastFull, P.opts);
  // the six-month test shown on the page: the chosen method as if it were six months ago
  const cut = addMonths(lastFull, -6), Mt = model(months, vol, wV, cut, P.opts);
  const test = monthsBetween(addMonths(cut, 1), lastFull).map((m) => ({ month: m, actual: r2(vol[m] || 0), predicted: r2(Mt.at(m)) }));
  const mape = P.mape, band = Math.max(0.03, 1.28 * Math.max(sd(P.errs), mape));
  // take rate and cost share from the last six complete months with fees
  const last6 = full.slice(-6).filter((m) => hasFees[m]);
  const take = sum(last6.map((m) => vol[m])) ? sum(last6.map((m) => rev[m])) / sum(last6.map((m) => vol[m])) : 0;
  const costShare = sum(last6.map((m) => rev[m])) ? sum(last6.map((m) => cost[m])) / sum(last6.map((m) => rev[m])) : 0;
  const row = (m, v, r, c, kind, extra) => Object.assign({ month: m, kind, volume: r2(v), revenue: r == null ? null : r2(r), costs: c == null ? null : r2(c), net: r == null || c == null ? null : r2(r - c), takeRate: r != null && v ? r / v : null }, extra || {});
  const history = full.map((m) => row(m, vol[m] || 0, hasFees[m] ? rev[m] : null, hasFees[m] ? cost[m] : null, 'actual'));
  // this month: actual so far plus the remaining days at the expected daily amount
  const curV = M.at(cur), curDays = split(cur, curV, wV), curR = split(cur, curV * take, wR);
  const toDateV = sum(Object.entries(vDays).filter(([d]) => ym(d) === cur && d < today).map(([, v]) => num(v)));
  const toDateR = sum(Object.entries(fDays).filter(([d]) => ym(d) === cur && d < today).map(([, o]) => o.revenue));
  const remV = sum(curDays.filter((x) => x.date >= today).map((x) => x.amount)), remR = sum(curR.filter((x) => x.date >= today).map((x) => x.amount));
  const projV = toDateV + remV, projR = toDateR + remR;
  const current = row(cur, projV, projR, projR * costShare, 'current', { toDate: { volume: r2(toDateV), revenue: r2(toDateR), throughDay: Math.max(0, Number(today.slice(8)) - 1), daysInMonth: daysIn(cur) },
    low: r2(toDateV + remV * (1 - band)), high: r2(toDateV + remV * (1 + band)) });
  const forecast = []; for (let k = 1; k <= 6; k++) { const m = addMonths(cur, k), v = M.at(m), r = v * take; forecast.push(row(m, v, r, r * costShare, 'forecast', { low: r2(v * (1 - band)), high: r2(v * (1 + band)), revenueLow: r2(r * (1 - band)), revenueHigh: r2(r * (1 + band)) })); }
  // day by month grid (like the Daily Volume report): last 12 complete months, this month and six forecast months
  const gridMonths = full.slice(-12).concat([cur], forecast.map((f) => f.month));
  const grid = gridMonths.map((m) => {
    const isF = m > cur, isC = m === cur, fc = isF ? forecast.find((f) => f.month === m) : null;
    const sv = isF ? split(m, fc.volume, wV) : isC ? curDays : null, sr = isF ? split(m, fc.revenue, wR) : isC ? curR : null;
    const days = []; for (let i = 1; i <= daysIn(m); i++) {
      const d = dayKey(m, i), actual = !isF && (!isC || d < today);
      days.push({ day: i, volume: r2(actual ? num(vDays[d]) : sv[i - 1].amount), revenue: r2(actual ? (fDays[d] ? fDays[d].revenue : (hasFees[m] ? 0 : null)) : sr[i - 1].amount), expected: !actual });
    }
    return { month: m, kind: isF ? 'forecast' : isC ? 'current' : 'actual', days };
  });
  // year over year and the patterns, for the charts
  const years = {}; for (const m of full.concat([cur])) { const y = m.slice(0, 4); (years[y] = years[y] || {})[Number(m.slice(5))] = r2(m === cur ? projV : vol[m]); }
  const daily = Object.keys(vDays).filter((d) => d >= addMonths(cur, -6) + '-01').sort().map((d) => ({ date: d, volume: r2(num(vDays[d])), revenue: fDays[d] ? r2(fDays[d].revenue) : null }));
  const t12 = history.slice(-12), p12 = history.slice(-24, -12);
  const totals = {
    last12: { volume: r2(sum(t12.map((h) => h.volume))), revenue: r2(sum(t12.map((h) => h.revenue))), costs: r2(sum(t12.map((h) => h.costs))), net: r2(sum(t12.map((h) => h.net))) },
    prior12: { volume: r2(sum(p12.map((h) => h.volume))), revenue: r2(sum(p12.map((h) => h.revenue))) },
    next6: { volume: r2(sum(forecast.map((f) => f.volume))), revenue: r2(sum(forecast.map((f) => f.revenue))), costs: r2(sum(forecast.map((f) => f.costs))), net: r2(sum(forecast.map((f) => f.net))) },
    allTime: { volume: r2(sum(history.map((h) => h.volume)) + toDateV), revenue: r2(sum(history.map((h) => h.revenue || 0)) + toDateR), since: months[0] },
  };
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    today, firstMonth: months[0], firstFeeMonth: Object.keys(hasFees).sort()[0] || null, history, current, forecast, grid, years, daily, totals,
    model: { growthPerMonth: r2(M.growth * 100), growthPerYear: r2((Math.pow(1 + M.growth, 12) - 1) * 100), takeRate: take, costShare, mape: r2(mape * 100), band: r2(band * 100), test,
      seasonality: (() => { const S = seasonality(full, full.map((m) => vol[m] || 0)); return MN.map((n, i) => ({ month: n, index: r2(S.idx[i + 1]) })); })(), seasonYears: seasonality(full, full.map((m) => vol[m] || 0)).years, chosen: P.opts, tests: P.errs.length, weekday: DN.map((n, i) => ({ day: n, volume: r2(wV[i]), revenue: r2(wR[i]) })), weekdayFrom: since },
    method: [
      'Volume is every day of the Adit Pay Daily Volume report since ' + months[0] + '. Revenue is Adit\'s application fees less fee refunds, costs are Stripe fees and card network costs, net is revenue less costs (Stripe balance transactions).',
      'Business days: each month is weighted by its weekdays, using the weekday pattern of the last eight weeks (a month with more Mondays processes more), and US holidays when practices close (Thanksgiving, Christmas, New Year and the others) count like a Sunday.',
      'Trend: steady growth fitted over the last ' + P.opts.win + ' months' + (P.opts.damp < 1 ? ', fading by ' + Math.round((1 - P.opts.damp) * 100) + '% a month the further ahead it looks (growth has been slowing)' : '') + '. Growth now: about ' + (M.growth * 100).toFixed(1) + '% a month.',
      'Seasonality: each calendar month against its centred 12-month average over ' + seasonality(full, full.map((m) => vol[m] || 0)).years + ' years is ' + (P.opts.useS ? 'used' : 'shown in the chart but left out of the forecast, because it made the tests worse') + '.',
      'How the method was chosen: every mix of trend window (12, 18 or 24 months), fading (none, 10%, 20%) and seasonality (on, off) was run as if it were each of the last 12 months, forecasting up to six months ahead; the mix that missed least (' + (mape * 100).toFixed(1) + '% on average, ' + P.errs.length + ' tests) is used.',
      'Revenue = forecast volume x the take rate of the last six months (' + (take * 100).toFixed(2) + '%). Costs = revenue x the cost share of the last six months (' + (costShare * 100).toFixed(1) + '%). Net = revenue less costs.',
      'Range: plus or minus ' + (band * 100).toFixed(1) + '% (1.28 times the typical test miss, so about 8 in 10 months should land inside it).',
      'Day-wise: each month is spread over its days by the weekday pattern, holidays included; this month shows actual days so far and expected days after.',
    ],
  };
}

let _c = null, _at = 0, _p = null;
async function build() {
  const today = ctDate(Date.now());
  const [vDays, fRows] = await Promise.all([pivotDays(), sql(FEES_SQL('2020-01-01'), { timeoutMs: 170000 })]);
  return Object.assign({ at: new Date().toISOString() }, compute(vDays, feeDays(fRows), today));
}
async function summary({ fresh = false, waitMs = 25000 } = {}) {
  if (!fresh && _c && Date.now() - _at < 60 * 60e3) return _c;
  if (!_p) _p = build().then((v) => { _c = v; _at = Date.now(); return v; }).finally(() => { _p = null; });
  const v = await Promise.race([_p.catch((e) => ({ error: String(e.message || e).slice(0, 200) })), new Promise((r) => setTimeout(() => r(null), waitMs))]);
  return v && !v.error ? v : _c || (v && v.error ? { error: v.error } : { loading: true });
}
module.exports = { holidays, setDeps, summary, compute, feeDays, weekdayWeights, seasonality, logFit, model, pickModel, split, bizFactor, FEES_SQL };
