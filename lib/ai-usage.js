'use strict';
/**
 * Batch 290: Claude usage meter. Every Claude call records its tokens by feature and model, per day (Central time),
 * so the team can see which feature spends what. Also keeps the light-model quality check: a small sample of calls
 * sent to the cheaper model is asked again on the main model in the background, and the answers are compared. A feature
 * whose answers drift is sent back to the main model automatically.
 * Costs are estimates from list prices per million tokens, overridable by env (AI_PRICE_<MODEL KIND>_<IN|OUT>).
 */
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, feature TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0,
    input INTEGER DEFAULT 0, output INTEGER DEFAULT 0, cache_read INTEGER DEFAULT 0, cache_write INTEGER DEFAULT 0, PRIMARY KEY (day, feature, model))`);
  await run(`CREATE TABLE IF NOT EXISTS ai_shadow (id INTEGER PRIMARY KEY AUTOINCREMENT, feature TEXT, agree REAL, at TEXT DEFAULT (datetime('now')))`);
  await loadShadow();
}
const num = (v) => Math.max(0, Number(v) || 0);
function kindOf(model) {
  const m = String(model || '').toLowerCase();
  if (/haiku/.test(m)) return 'haiku'; if (/opus/.test(m)) return 'opus'; if (/claude|sonnet/.test(m)) return 'sonnet';
  if (/4\.1-nano/.test(m)) return 'nano'; if (/4\.1-mini/.test(m)) return 'mini'; if (/4o-mini/.test(m)) return 'mini4o'; return m ? 'openai' : 'sonnet';
}
const LIST = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25], nano: [0.1, 0.4], mini: [0.4, 1.6], mini4o: [0.15, 0.6], openai: [2, 8] };
const provider = (model) => /claude|haiku|sonnet|opus/i.test(String(model || '')) ? 'claude' : 'openai';
function price(model) {
  const k = kindOf(model), d = LIST[k], e = (s) => Number(process.env['AI_PRICE_' + k.toUpperCase() + '_' + s]);
  return { in: e('IN') || d[0], out: e('OUT') || d[1] };
}
// Cache writes cost 1.25x input, cache reads 0.1x input.
function costOf(model, u) {
  const p = price(model);
  const rd = provider(model) === 'claude' ? 0.1 : 0.25;
  return (num(u.input) * p.in + num(u.cache_write) * p.in * 1.25 + num(u.cache_read) * p.in * rd + num(u.output) * p.out) / 1e6;
}
function dayCT(d = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d); }

// Which feature made the call: the first file in the call stack that is not the AI layer itself.
function callerFeature(stack) {
  const lines = String(stack || new Error().stack || '').split('\n').slice(1);
  for (const l of lines) {
    const m = l.match(/[\\/](lib|routes)[\\/]([\w.-]+)\.js/) || l.match(/[\\/](server)\.js/);
    if (!m) continue;
    const name = m[2] || m[1];
    if (['ai', 'ai-usage'].includes(name)) continue;
    return name;
  }
  return 'other';
}

const mem = new Map(); // key -> totals since start (also the fallback when there is no DB)
async function record({ feature, model, usage }) {
  if (!usage) return;
  const u = { input: num(usage.input_tokens), output: num(usage.output_tokens), cache_read: num(usage.cache_read_input_tokens), cache_write: num(usage.cache_creation_input_tokens) };
  const day = dayCT(), f = String(feature || 'other').slice(0, 60), m = String(model || '').slice(0, 60);
  const k = day + '|' + f + '|' + m, cur = mem.get(k) || { calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 };
  cur.calls++; for (const x of ['input', 'output', 'cache_read', 'cache_write']) cur[x] += u[x]; mem.set(k, cur);
  if (mem.size > 2000) mem.delete(mem.keys().next().value);
  if (!_db) return;
  try {
    await run(`INSERT INTO ai_usage (day, feature, model, calls, input, output, cache_read, cache_write) VALUES (?,?,?,1,?,?,?,?)
      ON CONFLICT(day, feature, model) DO UPDATE SET calls = calls + 1, input = input + excluded.input, output = output + excluded.output,
      cache_read = cache_read + excluded.cache_read, cache_write = cache_write + excluded.cache_write`, [day, f, m, u.input, u.output, u.cache_read, u.cache_write]);
  } catch (e) { /* the meter never blocks an answer */ }
}

async function report({ days = 14 } = {}) {
  const since = dayCT(new Date(Date.now() - (Math.min(90, Math.max(1, days)) - 1) * 86400000));
  let rows = [];
  if (_db) rows = await all(`SELECT * FROM ai_usage WHERE day >= ? ORDER BY day DESC`, [since]);
  else rows = [...mem.entries()].map(([k, v]) => { const [day, feature, model] = k.split('|'); return Object.assign({ day, feature, model }, v); }).filter((r) => r.day >= since);
  rows = rows.map((r) => Object.assign({}, r, { cost: Math.round(costOf(r.model, r) * 100) / 100 }));
  const byFeature = {};
  for (const r of rows) {
    const b = byFeature[r.feature] || (byFeature[r.feature] = { feature: r.feature, calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, cost: 0, models: {} });
    b.calls += r.calls; b.input += r.input; b.output += r.output; b.cache_read += r.cache_read; b.cache_write += r.cache_write; b.cost += r.cost; b.models[r.model] = (b.models[r.model] || 0) + r.calls;
  }
  const features = Object.values(byFeature).map((b) => Object.assign(b, { cost: Math.round(b.cost * 100) / 100, cacheShare: b.input + b.cache_read ? Math.round(100 * b.cache_read / (b.input + b.cache_read + b.cache_write)) : 0 })).sort((a, b) => b.cost - a.cost);
  const byDay = {}, byProvider = { claude: 0, openai: 0 };
  rows.forEach((r) => { byDay[r.day] = Math.round(((byDay[r.day] || 0) + r.cost) * 100) / 100; byProvider[provider(r.model)] += r.cost; });
  Object.keys(byProvider).forEach((k) => { byProvider[k] = Math.round(byProvider[k] * 100) / 100; });
  return { since, total: Math.round(features.reduce((s, f) => s + f.cost, 0) * 100) / 100, byProvider, features, days: byDay, shadow: shadowStatus(), estimate: true };
}

// ── light-model quality check ────────────────────────────────────────────
const WINDOW = 20, MIN_AGREE = 0.85, MIN_SAMPLES = 8;
const shadow = new Map(); // feature -> [agree, ...] most recent last
async function loadShadow() {
  if (!_db) return;
  try {
    const rows = await all(`SELECT feature, agree FROM ai_shadow WHERE id IN (SELECT id FROM ai_shadow ORDER BY id DESC LIMIT 2000) ORDER BY id`);
    for (const r of rows) { const a = shadow.get(r.feature) || []; a.push(Number(r.agree)); if (a.length > WINDOW) a.shift(); shadow.set(r.feature, a); }
  } catch (e) { /* first run */ }
}
// Share of the short, top-level fields (yes/no, labels, numbers) that the two answers agree on. Long text is ignored:
// two good answers can word things differently.
function agreement(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a === b ? 1 : 0;
  const keys = new Set();
  const flat = (o, pre, out) => { for (const [k, v] of Object.entries(o || {})) { const key = pre + k; if (v && typeof v === 'object' && !Array.isArray(v) && pre.split('.').length < 3) flat(v, key + '.', out); else out[key] = v; } return out; };
  const fa = flat(a, '', {}), fb = flat(b, '', {});
  Object.keys(fa).forEach((k) => keys.add(k)); Object.keys(fb).forEach((k) => keys.add(k));
  let n = 0, same = 0;
  const norm = (v) => typeof v === 'string' ? v.trim().toLowerCase() : v;
  for (const k of keys) {
    const x = fa[k], y = fb[k];
    const shortv = (v) => v == null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 40);
    if (!shortv(x) || !shortv(y) || Array.isArray(x) || Array.isArray(y)) continue;
    if (x == null && y == null) continue;
    n++; if (norm(x) === norm(y) || (x == null && y === '') || (y == null && x === '')) same++;
  }
  return n ? same / n : 1;
}
async function addShadow(feature, agree) {
  const a = shadow.get(feature) || []; a.push(agree); if (a.length > WINDOW) a.shift(); shadow.set(feature, a);
  if (_db) { try { await run(`INSERT INTO ai_shadow (feature, agree) VALUES (?, ?)`, [feature, agree]); } catch (e) { /* ignore */ } }
}
// A light feature stays light only while its sampled answers agree with the main model.
function lightOk(feature) {
  const a = shadow.get(feature) || [];
  if (a.length < MIN_SAMPLES) return true;
  return a.reduce((s, x) => s + x, 0) / a.length >= MIN_AGREE;
}
function shadowStatus() {
  const out = {};
  for (const [f, a] of shadow) out[f] = { samples: a.length, agree: a.length ? Math.round(100 * a.reduce((s, x) => s + x, 0) / a.length) : null, light: lightOk(f) };
  return out;
}
function _reset() { mem.clear(); shadow.clear(); _db = null; }
module.exports = { provider, setDB, initSchema, record, report, callerFeature, costOf, price, kindOf, dayCT, agreement, addShadow, lightOk, shadowStatus, _reset };
