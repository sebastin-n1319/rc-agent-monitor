'use strict';
/** Guided tours that must be finished once per person. Completion is stored per email and tour id. */
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const lc = (s) => String(s || '').trim().toLowerCase();
const idOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS tool_tours (email TEXT NOT NULL, tour_id TEXT NOT NULL, at TEXT DEFAULT (datetime('now')), PRIMARY KEY (email, tour_id))`);
}
async function status(email, id) {
  const r = await get(`SELECT at FROM tool_tours WHERE email = ? AND tour_id = ?`, [lc(email), idOf(id)]);
  return { done: !!r, at: r ? r.at : null };
}
async function done(email, id) {
  if (!idOf(id)) throw Object.assign(new Error('Unknown tour'), { status: 400 });
  await run(`INSERT OR IGNORE INTO tool_tours (email, tour_id) VALUES (?, ?)`, [lc(email), idOf(id)]);
  return { done: true };
}
module.exports = { setDB, initSchema, status, done };
