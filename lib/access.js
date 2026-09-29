/**
 * Session 63: access requests. Nobody gets into the tool until an admin
 * approves them.
 *
 * Membership is now only app_roles (the Access Control list). Anyone else
 * who signs in with an @adit.com Google account gets no session: a request
 * is recorded here and the admins approve or decline it in Team > Access
 * Control. People on the Assessments guest list (or everyone, when the
 * assessment link is opened to the whole domain) can still open /assess,
 * and only /assess.
 *
 * On first boot after this change, everyone who could sign in before
 * (monitored agents, active roster agents, known team leads, test
 * accounts) is copied into app_roles as an agent, so nobody is locked out
 * mid-shift. After that, new people must request.
 */
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n = 300) => String(s == null ? '' : s).replace(/[\u0000-\u001F]/g, ' ').slice(0, n);
const nowIso = () => new Date().toISOString();

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS access_requests (
    email TEXT PRIMARY KEY, name TEXT, picture TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT, last_attempt_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    decided_by TEXT, decided_at TEXT, decided_role TEXT, note TEXT)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`);
}

/** One-time: copy everyone who could sign in before into app_roles. */
async function migrateExisting({ extraEmails = [], getSetting, setSetting }) {
  const flag = await getSetting('access_approval_migrated').catch(() => null);
  if (flag) return { skipped: true };
  const emails = new Set();
  const add = (e) => { const v = lc(e); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) emails.add(v); };
  for (const r of await all(`SELECT email FROM monitored_agents WHERE email IS NOT NULL`).catch(() => [])) add(r.email);
  for (const r of await all(`SELECT email FROM roster_agents WHERE email IS NOT NULL AND COALESCE(status,'active') = 'active'`).catch(() => [])) add(r.email);
  extraEmails.forEach(add);
  let added = 0;
  for (const e of emails) {
    const r = await run(`INSERT OR IGNORE INTO app_roles (email, role, added_by, breakbot_enabled) VALUES (?, 'agent', 'Existing access (approval switch-on)', 1)`, [e]);
    if (r.changes) added++;
  }
  await setSetting('access_approval_migrated', nowIso(), 'system');
  return { added, total: emails.size };
}

/** Someone without access tried to sign in: record or refresh their request. */
async function recordAttempt(email, name, picture) {
  const e = lc(email);
  const row = await get(`SELECT * FROM access_requests WHERE email = ?`, [e]);
  const now = nowIso();
  if (!row) {
    await run(`INSERT INTO access_requests (email, name, picture, status, requested_at, last_attempt_at, attempts) VALUES (?,?,?,?,?,?,1)`,
      [e, clean(name, 120), clean(picture, 500), 'pending', now, now]);
    return { status: 'pending', requestedAt: now, isNew: true };
  }
  // A person who was approved and later removed asks again: new request.
  const status = row.status === 'denied' ? 'denied' : 'pending';
  const reopened = row.status !== 'pending' && status === 'pending';
  await run(`UPDATE access_requests SET name = COALESCE(NULLIF(?, ''), name), picture = COALESCE(NULLIF(?, ''), picture), status = ?,
             requested_at = CASE WHEN ? THEN ? ELSE requested_at END, last_attempt_at = ?, attempts = attempts + 1 WHERE email = ?`,
    [clean(name, 120), clean(picture, 500), status, reopened ? 1 : 0, now, now, e]);
  return { status, requestedAt: reopened ? now : row.requested_at, isNew: reopened, note: status === 'denied' ? row.note : null };
}

async function list() {
  return all(`SELECT email, name, picture, status, requested_at, last_attempt_at, attempts, decided_by, decided_at, decided_role, note
              FROM access_requests ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'denied' THEN 1 ELSE 2 END, COALESCE(last_attempt_at, requested_at) DESC LIMIT 300`);
}
async function pendingCount() {
  const r = await get(`SELECT COUNT(*) AS n, MAX(COALESCE(last_attempt_at, requested_at)) AS latest FROM access_requests WHERE status = 'pending'`);
  return { count: r ? r.n : 0, latest: r ? r.latest : null };
}
async function decide(email, status, by, { role, note } = {}) {
  const e = lc(email);
  const row = await get(`SELECT email FROM access_requests WHERE email = ?`, [e]);
  if (!row) await run(`INSERT INTO access_requests (email, status, requested_at, attempts) VALUES (?, ?, ?, 0)`, [e, status, nowIso()]);
  await run(`UPDATE access_requests SET status = ?, decided_by = ?, decided_at = ?, decided_role = ?, note = ? WHERE email = ?`,
    [status, lc(by), nowIso(), role || null, clean(note, 300) || null, e]);
}
async function statusOf(email) { return get(`SELECT * FROM access_requests WHERE email = ?`, [lc(email)]); }
async function markRemoved(email, by) {
  await run(`UPDATE access_requests SET status = 'removed', decided_by = ?, decided_at = ? WHERE email = ?`, [lc(by), nowIso(), lc(email)]);
}

module.exports = { setDB, initSchema, migrateExisting, recordAttempt, list, pendingCount, decide, statusOf, markRemoved };
