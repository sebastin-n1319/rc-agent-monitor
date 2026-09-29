/**
 * Session 68: break regularise requests.
 * An agent who forgot a tap (login, logout, break, BRB, training, QA,
 * internal call) asks for the missing event to be added at the right time.
 * Any admin approves or declines. Approval inserts the event into that
 * agent's day (marked "Regularised") and does not post to Google Chat.
 */
let _db = null, _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = d || {}; } // { insertBreakEvent, validActions, notices }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, n);
const bad = (m, status = 400) => { const e = new Error(m); e.status = status; return e; };

const LABELS = {
  LOGGED_IN: 'Logged In', LOGGED_OUT: 'Logged Out', BREAK_OUT: 'Break Out', BREAK_IN: 'Break In', BRB_OUT: 'BRB Out', BRB_IN: 'BRB In',
  TRAINING_OUT: 'Training / Coaching Out', TRAINING_IN: 'Training / Coaching In', QA_SESSION_OUT: 'QA Session AUX Out', QA_SESSION_IN: 'QA Session AUX In',
  INTERNAL_CALL_OUT: 'Internal Calls Out', INTERNAL_CALL_IN: 'Internal Calls In',
};

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS break_regularise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL, name TEXT, action TEXT NOT NULL,
    at_utc TEXT NOT NULL, tz TEXT, local_text TEXT, reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT, decided_at TEXT, decision_note TEXT, event_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_break_reg_status ON break_regularise(status, id DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_break_reg_email ON break_regularise(email, id DESC)`);
}

/** Wall clock date+time in a named timezone to a UTC Date (DST safe). */
function wallToUtc(date, time, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''), t = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!m || !t) return null;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return null; }
  const asLocal = (ms) => { const p = {}; fmt.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; }); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); };
  let guess = want;
  for (let i = 0; i < 3; i++) guess += want - asLocal(guess);
  return asLocal(guess) === want ? new Date(guess) : null;
}
const sqlUtc = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const ALLOWED_TZ = new Set(['America/Chicago', 'Asia/Kolkata']);

async function create(email, name, b) {
  const action = String(b.action || '').toUpperCase();
  if (!LABELS[action] || !(_deps.validActions ? _deps.validActions.has(action) : true)) throw bad('Pick what you missed');
  const reason = clean(b.reason, 300);
  if (reason.length < 5) throw bad('Add a short reason (at least 5 characters)');
  const tz = ALLOWED_TZ.has(b.tz) ? b.tz : 'America/Chicago';
  const when = wallToUtc(String(b.date || ''), String(b.time || ''), tz);
  if (!when) throw bad('Pick a valid date and time');
  const now = Date.now();
  if (when.getTime() > now) throw bad('That time is in the future');
  if (when.getTime() < now - 7 * 86400000) throw bad('You can only regularise the last 7 days. Ask an admin for older days.');
  const me = lc(email);
  const pend = await get(`SELECT COUNT(*) n FROM break_regularise WHERE email = ? AND status = 'pending'`, [me]);
  if (pend.n >= 10) throw bad('You already have 10 pending requests. Wait for a decision first.');
  const dup = await get(`SELECT id FROM break_regularise WHERE email = ? AND action = ? AND at_utc = ? AND status IN ('pending','approved')`, [me, action, sqlUtc(when)]);
  if (dup) throw bad('You already sent this request');
  const r = await run(`INSERT INTO break_regularise (email, name, action, at_utc, tz, local_text, reason) VALUES (?,?,?,?,?,?,?)`,
    [me, clean(name, 120) || me, action, sqlUtc(when), tz, clean(b.date, 10) + ' ' + clean(b.time, 5), reason]);
  if (_deps.notices) _deps.notices.notifyAudience('admins', { title: 'Regularise request: ' + (clean(name, 60) || me), body: LABELS[action] + ' on ' + clean(b.date, 10) + ' at ' + clean(b.time, 5) + ' (' + (tz === 'Asia/Kolkata' ? 'IST' : 'CST') + '). ' + reason, link: '/#breaks', category: 'schedule', days: 7 }).catch(() => {});
  return r.lastID;
}

const shape = (r) => ({ id: r.id, email: r.email, name: r.name, action: r.action, actionLabel: LABELS[r.action] || r.action, atUtc: r.at_utc, tz: r.tz,
  localText: r.local_text, reason: r.reason, status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at, note: r.decision_note || '', createdAt: r.created_at });
async function listMine(email) { return (await all(`SELECT * FROM break_regularise WHERE email = ? ORDER BY id DESC LIMIT 20`, [lc(email)])).map(shape); }
async function listAll(status) {
  const w = status === 'pending' || status === 'approved' || status === 'declined' ? `WHERE status = '${status}'` : '';
  return (await all(`SELECT * FROM break_regularise ${w} ORDER BY (status = 'pending') DESC, id DESC LIMIT 100`)).map(shape);
}
async function pendingCount() { return (await get(`SELECT COUNT(*) n FROM break_regularise WHERE status = 'pending'`)).n; }

async function decide(id, adminEmail, approve, note) {
  const row = await get(`SELECT * FROM break_regularise WHERE id = ?`, [Number(id)]);
  if (!row) throw bad('Request not found', 404);
  if (row.status !== 'pending') throw bad('Already ' + row.status, 409);
  const cleanNote = clean(note, 300);
  let eventId = null;
  if (approve) {
    try {
      const ev = await _deps.insertBreakEvent({ username: row.name || row.email, email: row.email, role: 'agent', action: row.action,
        note: 'Regularised: ' + row.reason + ' (approved by ' + lc(adminEmail) + ')', timestamp: new Date(row.at_utc.replace(' ', 'T') + 'Z').toISOString() });
      eventId = ev && ev.id;
    } catch (e) { throw bad('Could not add the event: ' + e.message + ' Decline it or fix the day by hand.', 409); }
  }
  await run(`UPDATE break_regularise SET status = ?, decided_by = ?, decided_at = datetime('now'), decision_note = ?, event_id = ? WHERE id = ? AND status = 'pending'`,
    [approve ? 'approved' : 'declined', lc(adminEmail), cleanNote, eventId, row.id]);
  if (_deps.notices) _deps.notices.notifyPerson(row.email, { title: approve ? 'Regularise approved' : 'Regularise declined',
    body: (LABELS[row.action] || row.action) + ' on ' + row.local_text + (approve ? ' was added to your day.' : ' was not approved.') + (cleanNote ? ' Note: ' + cleanNote : ''), link: '/#breaks', category: 'schedule' }).catch(() => {});
  return { eventId };
}
module.exports = { setDB, setDeps, initSchema, create, listMine, listAll, pendingCount, decide, wallToUtc, LABELS };
