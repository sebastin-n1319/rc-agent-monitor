'use strict';
/**
 * Batch 242 (from Aria's "Scheduled questions"): a question Expert answers on a schedule and sends to the person who
 * set it up, as a Google Chat message from the Adit Agent Monitor app with a link to the full answer. Each person sees
 * and manages only their own. "Run now" shows the answer without sending anything.
 */
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const lc = (s) => String(s || '').trim().toLowerCase();
const one = (s, n = 400) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const TZ = 'America/Chicago';
const FREQS = ['weekdays', 'daily', 'weekly'];
const MODES = ['answer', 'call', 'email', 'chat'];
const MAX_PER_PERSON = 10;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, name TEXT, question TEXT NOT NULL,
    mode TEXT DEFAULT 'answer', freq TEXT DEFAULT 'weekdays', weekday INTEGER DEFAULT 1, time_hm TEXT DEFAULT '08:00', enabled INTEGER DEFAULT 1,
    last_run_at TEXT, last_run_day TEXT, last_share TEXT, last_error TEXT, created_at TEXT DEFAULT (datetime('now')))`);
}
// Local date and minutes in Central time.
function nowCT(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { day: `${p.year}-${p.month}-${p.day}`, mins: (Number(p.hour) % 24) * 60 + Number(p.minute), wd };
}
function isDue(s, now = new Date()) {
  if (!s.enabled) return false;
  const t = nowCT(now), [h, m] = String(s.time_hm || '08:00').split(':').map(Number);
  if (t.mins < h * 60 + m || s.last_run_day === t.day) return false;
  if (s.freq === 'weekdays' && (t.wd === 0 || t.wd === 6)) return false;
  if (s.freq === 'weekly' && t.wd !== Number(s.weekday)) return false;
  return true;
}
function shape(r) { return { id: r.id, name: r.name || '', question: r.question, mode: r.mode, freq: r.freq, weekday: r.weekday, time: r.time_hm, enabled: !!r.enabled, lastRunAt: r.last_run_at, lastShare: r.last_share, lastError: r.last_error }; }
async function list(email) { return (await all(`SELECT * FROM expert_schedule WHERE email = ? ORDER BY id`, [lc(email)])).map(shape); }
function valid(x) {
  const question = String(x.question || '').trim().slice(0, 1500);
  if (question.length < 8) throw httpError(400, 'Write the question Expert should answer');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x.time || '')) ? String(x.time) : '08:00';
  return { name: one(x.name, 80), question, mode: MODES.includes(x.mode) ? x.mode : 'answer', freq: FREQS.includes(x.freq) ? x.freq : 'weekdays', weekday: Math.min(6, Math.max(0, Number(x.weekday ?? 1) || 0)), time, enabled: x.enabled !== false };
}
async function save(email, x, id) {
  const v = valid(x || {});
  if (id) {
    const r = await run(`UPDATE expert_schedule SET name=?, question=?, mode=?, freq=?, weekday=?, time_hm=?, enabled=? WHERE id=? AND email=?`, [v.name, v.question, v.mode, v.freq, v.weekday, v.time, v.enabled ? 1 : 0, Number(id), lc(email)]);
    if (!r.changes) throw httpError(404, 'Not found');
    return Number(id);
  }
  const n = await get(`SELECT COUNT(*) AS n FROM expert_schedule WHERE email = ?`, [lc(email)]);
  if (n && n.n >= MAX_PER_PERSON) throw httpError(400, `You can keep up to ${MAX_PER_PERSON} scheduled questions`);
  // A new schedule does not fire for a time already passed today.
  const t = nowCT(), [h, m] = v.time.split(':').map(Number);
  const r = await run(`INSERT INTO expert_schedule (email, name, question, mode, freq, weekday, time_hm, enabled, last_run_day) VALUES (?,?,?,?,?,?,?,?,?)`,
    [lc(email), v.name, v.question, v.mode, v.freq, v.weekday, v.time, v.enabled ? 1 : 0, t.mins >= h * 60 + m ? t.day : null]);
  return r.lastID;
}
async function remove(email, id) { const r = await run(`DELETE FROM expert_schedule WHERE id = ? AND email = ?`, [Number(id), lc(email)]); if (!r.changes) throw httpError(404, 'Not found'); return { ok: true }; }

async function answer(s) {
  const v = await D.ask({ question: s.question, email: s.email, mode: s.mode === 'answer' ? 'answer' : s.mode, modeLocked: true, fresh: true, depth: 'thinking' });
  const shareId = D.share ? await D.share(s.email, [{ q: s.question, mode: v.mode, j: v }]) : null;
  return { v, shareId, link: shareId ? (D.publicUrl || '') + '/guides#ask/share/' + shareId : '' };
}
/** Run now: answers and returns it; nothing is sent. */
async function runNow(email, id) {
  const s = await get(`SELECT * FROM expert_schedule WHERE id = ? AND email = ?`, [Number(id), lc(email)]);
  if (!s) throw httpError(404, 'Not found');
  const r = await answer(s);
  await run(`UPDATE expert_schedule SET last_share = ?, last_error = NULL WHERE id = ?`, [r.shareId, s.id]);
  return { shareId: r.shareId, link: r.link, answer: r.v.answer, ticket: r.v.ticket || null };
}
let _busy = false;
async function runDue(now = new Date()) {
  if (_busy || !_db || !D.ask) return 0;
  _busy = true; let n = 0;
  try {
    const due = (await all(`SELECT * FROM expert_schedule WHERE enabled = 1`)).filter((s) => isDue(s, now)).slice(0, 3);
    for (const s of due) {
      const day = nowCT(now).day;
      await run(`UPDATE expert_schedule SET last_run_day = ?, last_run_at = datetime('now') WHERE id = ?`, [day, s.id]); // never twice a day, even on failure
      try {
        const r = await answer(s);
        const a = r.v.answer || {};
        const text = `Your scheduled question${s.name ? ' "' + s.name + '"' : ''}: ${one(s.question, 200)}\n\n${one(a.answer, 900)}${r.link ? '\n\nFull answer: ' + r.link : ''}`;
        if (D.dm) await D.dm({ toEmail: s.email, text });
        await run(`UPDATE expert_schedule SET last_share = ?, last_error = NULL WHERE id = ?`, [r.shareId, s.id]);
        n++;
      } catch (e) { await run(`UPDATE expert_schedule SET last_error = ? WHERE id = ?`, [one(e.message, 300), s.id]).catch(() => {}); }
    }
  } finally { _busy = false; }
  return n;
}

module.exports = { setDB, setDeps, initSchema, list, save, remove, runNow, runDue, _isDue: isDue, _nowCT: nowCT };
