'use strict';
/**
 * Batch 337: meaning search next to the word search (hybrid retrieval). Every chunk Expert searches (Help Center,
 * guides, rules, notes, updates, reviews, learned answers, call notes) gets an embedding (OpenAI text-embedding-3-small,
 * about 2 cents per million words, computed once and only again when the chunk changes). A question then finds chunks
 * that mean the same thing even when the words differ ("undelivered" and "failed to send"), and the two result lists
 * are merged by reciprocal rank fusion. Off with EXPERT_HYBRID=off, or when no OpenAI key is set.
 */
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const MODEL = process.env.EXPERT_EMBED_MODEL || 'text-embedding-3-small';
const DIMS = Number(process.env.EXPERT_EMBED_DIMS || 512); // smaller vectors: a fraction of the memory, nearly the same recall
const enabled = () => String(process.env.EXPERT_HYBRID || 'on').toLowerCase() !== 'off' && !!process.env.OPENAI_API_KEY;
const keyOf = (c) => c.src + ':' + c.id + ':' + (c.section || '');
const textOf = (c) => [c.module, c.title, c.section].filter(Boolean).join(' > ') + '\n' + String(c.text || '').slice(0, 2400);
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }

async function initSchema() { if (_db) await run(`CREATE TABLE IF NOT EXISTS expert_vec (k TEXT PRIMARY KEY, h TEXT, v BLOB)`); }

let _fetch = (...a) => fetch(...a);
function _setFetch(f) { _fetch = f; }
async function embed(texts) {
  const r = await _fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMS }), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !Array.isArray(j.data)) throw new Error('embeddings failed: HTTP ' + r.status);
  if (j.usage) require('./ai-usage').record({ feature: 'expert-embed', model: MODEL, usage: { input_tokens: j.usage.prompt_tokens || j.usage.total_tokens || 0, output_tokens: 0 } }).catch(() => {});
  return j.data.sort((a, b) => a.index - b.index).map((d) => norm(Float32Array.from(d.embedding)));
}
function norm(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s; return v; }
const toBlob = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const mem = new Map(); // key -> { h, v }
let _loaded = false, _syncing = null;
async function load() {
  if (_loaded || !_db) return; _loaded = true;
  for (const r of await all(`SELECT k, h, v FROM expert_vec`).catch(() => [])) if (r.v) mem.set(r.k, { h: r.h, v: fromBlob(r.v) });
}
/** Brings the embeddings up to date with the current chunks (in the background; search works without them meanwhile). */
function sync(docs) {
  if (!enabled() || _syncing) return _syncing;
  _syncing = (async () => {
    await load();
    const todo = [];
    for (const c of docs) { if (c.src === 'page') continue; const k = keyOf(c), t = textOf(c), h = hash(t), m = mem.get(k); if (!m || m.h !== h) todo.push({ k, t, h }); }
    for (let i = 0; i < todo.length; i += 96) {
      const part = todo.slice(i, i + 96);
      let vs; try { vs = await embed(part.map((x) => x.t)); } catch (e) { console.warn('expert vectors:', e.message); break; }
      for (let j = 0; j < part.length; j++) { mem.set(part[j].k, { h: part[j].h, v: vs[j] }); if (_db) await run(`INSERT INTO expert_vec (k, h, v) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET h = excluded.h, v = excluded.v`, [part[j].k, part[j].h, toBlob(vs[j])]).catch(() => {}); }
    }
    if (todo.length) console.log(`🧭 Expert meaning search: ${todo.length} chunks embedded, ${mem.size} in all`);
    return todo.length;
  })().finally(() => { _syncing = null; });
  return _syncing;
}
const _q = new Map();
/** The chunks closest in meaning to the question: [{ key, sim }] best first. */
async function nearest(text, k = 30, minSim = 0.3) {
  if (!enabled() || !mem.size) return [];
  const key = String(text).slice(0, 1500);
  let qv = _q.get(key);
  if (!qv) { qv = (await embed([key]))[0]; _q.set(key, qv); if (_q.size > 300) _q.delete(_q.keys().next().value); }
  const out = [];
  for (const [kk, m] of mem) { const v = m.v; if (v.length !== qv.length) continue; let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * qv[i]; if (s >= minSim) out.push({ key: kk, sim: s }); }
  out.sort((a, b) => b.sim - a.sim);
  return out.slice(0, k);
}
function status() { return { enabled: enabled(), chunks: mem.size, syncing: !!_syncing, model: MODEL }; }
function _reset() { mem.clear(); _q.clear(); _loaded = false; _syncing = null; }
module.exports = { setDB, initSchema, sync, nearest, status, enabled, keyOf, _setFetch, _reset };
