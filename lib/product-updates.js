'use strict';
/**
 * Process and product updates, read from the Adit Updates site.
 * The API key stays on the server (env ADIT_UPDATES_KEY). Agents see the last 7 days,
 * must acknowledge unread updates when they sign in, and admins can see who has read what.
 */
const BASE = (process.env.ADIT_UPDATES_URL || 'https://adit-updates.up.railway.app').replace(/\/+$/, '');
const DAYS = 7;
const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
let _db = null, _notices = null;
function setDB(db) { _db = db; }
function setNotices(n) { _notices = n; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, n);
const httpError = (status, message) => { const e = new Error(message); e.status = status; return e; };

function configured() { return !!process.env.ADIT_UPDATES_KEY; }
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS product_update_acks (update_id INTEGER NOT NULL, email TEXT NOT NULL, at TEXT DEFAULT (datetime('now')), PRIMARY KEY (update_id, email))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_pu_acks_email ON product_update_acks(email)`);
  await run(`CREATE TABLE IF NOT EXISTS tool_update_seeds (seed_key TEXT PRIMARY KEY, update_id INTEGER, at TEXT DEFAULT (datetime('now')))`);
  // Updates written by admins inside this tool (never sent to the updates site).
  await run(`CREATE TABLE IF NOT EXISTS tool_updates (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, summary TEXT, impact TEXT, details TEXT, category TEXT, modules TEXT,
    created_by TEXT, created_by_name TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT, deleted INTEGER NOT NULL DEFAULT 0)`);
}

// Only links that open on the updates site are passed on to the browser.
function safeUrl(u, fallback) {
  try { const x = new URL(String(u)); if (x.origin === new URL(BASE).origin) return x.toString(); } catch (e) {}
  return fallback;
}
function shape(it) {
  const id = Number(it && it.id);
  if (!Number.isFinite(id)) return null;
  return {
    id, title: clean(it.title, 200) || 'Update', summary: clean(it.summary, 1200), impact: clean(it.impact, 800), category: clean(it.category, 60),
    modules: (Array.isArray(it.modules) ? it.modules : []).map(m => clean(m, 40)).filter(Boolean).slice(0, 6),
    postedAt: clean(it.posted_at, 40), screenshots: Number(it.screenshots) || 0,
    url: safeUrl(it.url, BASE + '/updates?open=' + id),
  };
}

// Every new update is announced once in the bell, filed under Process or Product updates.
function noticeCategory(u) { return /process|policy|procedure|sop|workflow|guideline|training/i.test(u.category || '') ? 'process' : 'product'; }
async function announce(items) {
  if (!_notices) return;
  for (const u of items) {
    try {
      await _notices.announceOnce('pu:' + u.id, { title: (noticeCategory(u) === 'process' ? 'Process update: ' : 'Product update: ') + u.title, body: u.summary.slice(0, 220), link: 'app:updates', category: noticeCategory(u), audience: 'all', at: u.postedAt });
    } catch (e) { /* announcing is best effort */ }
  }
}
// In-tool updates use ids above LOCAL_BASE so they never clash with ids from the updates site.
const LOCAL_BASE = 1000000000;
const tidy = (s, n) => clean(String(s == null ? '' : s).replace(/\s*[\u2014\u2013]\s*/g, ', '), n);
function localShape(r) {
  let mods = []; try { mods = JSON.parse(r.modules || '[]'); } catch (e) { mods = []; }
  return { id: LOCAL_BASE + r.id, localId: r.id, local: true, title: r.title, summary: r.summary || '', impact: r.impact || '', details: r.details || '', category: r.category || '',
    modules: (Array.isArray(mods) ? mods : []).slice(0, 6), postedAt: String(r.created_at || '').replace(' ', 'T') + 'Z', screenshots: 0, url: null,
    author: r.created_by_name || String(r.created_by || '').split('@')[0], edited: !!r.updated_at };
}
async function localItems() {
  if (!_db) return [];
  const rows = await all(`SELECT * FROM tool_updates WHERE deleted = 0 AND created_at >= datetime('now', ?) ORDER BY created_at DESC`, [`-${DAYS} days`]).catch(() => []);
  return rows.map(localShape);
}
function readInput(b) {
  const title = tidy(b.title, 140), summary = tidy(b.summary, 1200), impact = tidy(b.impact, 800);
  const details = String(b.details == null ? '' : b.details).replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, 4000);
  const modules = (Array.isArray(b.modules) ? b.modules : String(b.modules || '').split(',')).map(m => tidy(m, 40)).filter(Boolean).slice(0, 6);
  if (title.length < 4) throw httpError(400, 'Add a title');
  if (summary.length < 10) throw httpError(400, 'Add a short summary of what changed');
  return { title, summary, impact, details, category: tidy(b.category, 60) || 'Process update', modules: JSON.stringify(modules) };
}
async function createLocal(by, byName, b) {
  const x = readInput(b || {});
  const r = await run(`INSERT INTO tool_updates (title, summary, impact, details, category, modules, created_by, created_by_name) VALUES (?,?,?,?,?,?,?,?)`,
    [x.title, x.summary, x.impact, x.details, x.category, x.modules, lc(by), clean(byName, 80) || null]);
  const row = await get(`SELECT * FROM tool_updates WHERE id = ?`, [r.lastID]);
  announce([localShape(row)]);
  return localShape(row);
}
/** Publish an in-tool update from code, once. An admin who deletes it later does not get it back. */
async function seedOnce(key, by, byName, b) {
  const done = await get(`SELECT seed_key FROM tool_update_seeds WHERE seed_key = ?`, [key]);
  if (done) return null;
  await run(`INSERT OR IGNORE INTO tool_update_seeds (seed_key) VALUES (?)`, [key]);
  const row = await createLocal(by, byName, b);
  await run(`UPDATE tool_update_seeds SET update_id = ? WHERE seed_key = ?`, [row.localId, key]);
  return row;
}
async function updateLocal(id, b) {
  const row = await get(`SELECT * FROM tool_updates WHERE id = ? AND deleted = 0`, [Number(id)]);
  if (!row) throw httpError(404, 'Update not found');
  const x = readInput(b || {});
  await run(`UPDATE tool_updates SET title=?, summary=?, impact=?, details=?, category=?, modules=?, updated_at=datetime('now') WHERE id=?`, [x.title, x.summary, x.impact, x.details, x.category, x.modules, row.id]);
  return localShape(await get(`SELECT * FROM tool_updates WHERE id = ?`, [row.id]));
}
async function deleteLocal(id) {
  const r = await run(`UPDATE tool_updates SET deleted = 1, updated_at = datetime('now') WHERE id = ? AND deleted = 0`, [Number(id)]);
  if (_notices && _notices.removeByRef) await _notices.removeByRef('pu:' + (LOCAL_BASE + Number(id))).catch(() => {});
  return r.changes > 0;
}
let cache = { at: 0, items: [], moreUrl: BASE + '/updates', error: null };
async function fetchRemote() {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(BASE + '/api/v1/updates?limit=50&since=' + since, { headers: { Authorization: 'Bearer ' + process.env.ADIT_UPDATES_KEY, Accept: 'application/json' }, signal: ctl.signal });
    if (r.status === 401 || r.status === 403) throw httpError(502, 'The updates key was rejected. Create a new key on the updates site and set ADIT_UPDATES_KEY.');
    if (!r.ok) throw httpError(502, 'The updates site answered with ' + r.status);
    const j = await r.json();
    const cutoff = Date.now() - DAYS * 86400000;
    const items = (Array.isArray(j.items) ? j.items : []).map(shape).filter(Boolean)
      .filter(x => { const d = Date.parse(x.postedAt); return !Number.isFinite(d) || d >= cutoff; })
      .sort((a, b) => Date.parse(b.postedAt || 0) - Date.parse(a.postedAt || 0));
    return { items, moreUrl: safeUrl(j.moreUrl, BASE + '/updates') };
  } finally { clearTimeout(t); }
}
async function remoteRecent() {
  if (!configured()) return { configured: false, items: [], moreUrl: BASE + '/updates', error: null, stale: false };
  const age = Date.now() - cache.at;
  if (cache.at && age < FRESH_MS) return { configured: true, items: cache.items, moreUrl: cache.moreUrl, error: null, stale: false };
  try {
    const r = await fetchRemote();
    cache = { at: Date.now(), items: r.items, moreUrl: r.moreUrl, error: null };
    announce(r.items);
    return { configured: true, ...r, error: null, stale: false };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'The updates site took too long to answer' : (e && e.message) || 'Could not reach the updates site';
    if (cache.at && age < STALE_MS) return { configured: true, items: cache.items, moreUrl: cache.moreUrl, error: msg, stale: true };
    return { configured: true, items: [], moreUrl: BASE + '/updates', error: msg, stale: false };
  }
}

async function recent() {
  const [r, local] = await Promise.all([remoteRecent(), localItems()]);
  const items = local.concat(r.items).sort((a, b) => Date.parse(b.postedAt || 0) - Date.parse(a.postedAt || 0));
  return { ...r, configured: r.configured || local.length > 0, remoteConfigured: r.configured, items };
}
async function ackedIds(email) {
  const rows = await all(`SELECT update_id FROM product_update_acks WHERE email = ?`, [lc(email)]);
  return new Set(rows.map(r => r.update_id));
}
async function feedFor(email) {
  const r = await recent();
  const seen = await ackedIds(email);
  const items = r.items.map(x => ({ ...x, acked: seen.has(x.id) }));
  return { configured: r.configured, remoteConfigured: r.remoteConfigured, error: r.error, stale: r.stale, moreUrl: r.moreUrl, days: DAYS, items, unread: items.filter(x => !x.acked).length };
}
async function ack(email, ids) {
  const r = await recent();
  const valid = new Set(r.items.map(x => x.id));
  const want = ids === 'all' ? [...valid] : (Array.isArray(ids) ? ids : []).map(Number).filter(n => valid.has(n));
  for (const id of want) await run(`INSERT OR IGNORE INTO product_update_acks (update_id, email) VALUES (?, ?)`, [id, lc(email)]);
  if (_notices) for (const id of want) await _notices.markReadByRef(email, 'pu:' + id).catch(() => {});
  return want.length;
}

/** Admin view: for each update in the window, who has acknowledged and who has not. `people` = [{email,name}] */
async function report(people) {
  const r = await recent();
  const ids = r.items.map(x => x.id);
  const rows = ids.length ? await all(`SELECT update_id, email, at FROM product_update_acks WHERE update_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const roster = new Map(); (people || []).forEach(p => { const e = lc(p.email); if (e) roster.set(e, clean(p.name, 80) || e); });
  const byId = new Map(); rows.forEach(x => { if (!byId.has(x.update_id)) byId.set(x.update_id, []); byId.get(x.update_id).push(x); });
  return {
    configured: r.configured, error: r.error, total: roster.size,
    updates: r.items.map(u => {
      const got = byId.get(u.id) || []; const gotSet = new Set(got.map(x => lc(x.email)));
      return { id: u.id, title: u.title, postedAt: u.postedAt, url: u.url,
        acked: got.map(x => ({ email: lc(x.email), name: roster.get(lc(x.email)) || lc(x.email), at: x.at })).sort((a, b) => String(a.at).localeCompare(String(b.at))),
        pending: [...roster.entries()].filter(([e]) => !gotSet.has(e)).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name)) };
    }),
  };
}

module.exports = { seedOnce, createLocal, updateLocal, deleteLocal, LOCAL_BASE, setDB, setNotices, initSchema, configured, recent, feedFor, ack, report, DAYS };
