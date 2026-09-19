/**
 * Ticket Lifecycle Tracking (Session 19)
 *
 * Automates what was previously a manually-exported Zoho Desk "lifecycle
 * report" CSV: per-agent ticket counts (assigned / closed / backlog),
 * average handle time, and a sentiment breakdown, kept current by a
 * background sync against the Zoho Desk API (see desk-service.js).
 *
 * Tables:
 *   desk_agents           — agentId -> email/name cache (Zoho agent lookups
 *                            are a separate API call; cache so we don't
 *                            re-resolve the same agent on every sync pass)
 *   desk_ticket_snapshot  — current known state of every synced ticket
 *   desk_ticket_events    — cached slice of each ticket's Zoho history
 *                            (status + assignee changes). Best-effort:
 *                            Zoho's event shape for assignee changes isn't
 *                            fully documented, so treat reassignment counts
 *                            as approximate, not authoritative.
 *   desk_sync_state       — simple key/value watermark store for the sync
 *                            job (e.g. last-modified cursor).
 */
let _db = null;

function setDB(db) { _db = db; }

const run = (sql, params = []) =>
  new Promise((res, rej) => _db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
const get = (sql, params = []) =>
  new Promise((res, rej) => _db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const all = (sql, params = []) =>
  new Promise((res, rej) => _db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS desk_agents (
    agent_id   TEXT PRIMARY KEY,
    email      TEXT,
    name       TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS desk_ticket_snapshot (
    ticket_id              TEXT PRIMARY KEY,
    ticket_number          TEXT,
    subject                TEXT,
    status                 TEXT,
    status_type            TEXT,
    priority                TEXT,
    channel                TEXT,
    department_id          TEXT,
    assignee_id            TEXT,
    assignee_email         TEXT,
    assignee_name          TEXT,
    sentiment              TEXT,
    comment_count          INTEGER,
    thread_count           INTEGER,
    created_time           TEXT,
    closed_time            TEXT,
    onhold_time            TEXT,
    due_date               TEXT,
    web_url                TEXT,
    history_synced_through TEXT,
    synced_at              TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_assignee ON desk_ticket_snapshot(assignee_email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_created  ON desk_ticket_snapshot(created_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_closed   ON desk_ticket_snapshot(closed_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_status   ON desk_ticket_snapshot(status)`);

  await run(`CREATE TABLE IF NOT EXISTS desk_ticket_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   TEXT NOT NULL,
    event_time  TEXT NOT NULL,
    event_name  TEXT,
    field_name  TEXT,
    from_value  TEXT,
    to_value    TEXT,
    actor_id    TEXT,
    actor_name  TEXT,
    actor_type  TEXT,
    synced_at   TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_events_ticket ON desk_ticket_events(ticket_id, event_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_events_field  ON desk_ticket_events(field_name, event_time)`);

  await run(`CREATE TABLE IF NOT EXISTS desk_sync_state (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

async function getSyncState(key) {
  const row = await get(`SELECT value FROM desk_sync_state WHERE key = ?`, [key]);
  return row ? row.value : null;
}
async function setSyncState(key, value) {
  await run(
    `INSERT INTO desk_sync_state (key, value, updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, value == null ? null : String(value)]
  );
}

async function cacheAgent(agentId, { email, name }) {
  if (!agentId) return;
  await run(
    `INSERT INTO desk_agents (agent_id, email, name, updated_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET email=excluded.email, name=excluded.name, updated_at=excluded.updated_at`,
    [agentId, email || null, name || null]
  );
}
async function getCachedAgent(agentId) {
  if (!agentId) return null;
  return get(`SELECT * FROM desk_agents WHERE agent_id = ?`, [agentId]);
}

async function upsertTicketSnapshot(t) {
  await run(
    `INSERT INTO desk_ticket_snapshot
       (ticket_id, ticket_number, subject, status, status_type, priority, channel,
        department_id, assignee_id, assignee_email, assignee_name, sentiment,
        comment_count, thread_count, created_time, closed_time, onhold_time,
        due_date, web_url, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(ticket_id) DO UPDATE SET
       ticket_number=excluded.ticket_number, subject=excluded.subject,
       status=excluded.status, status_type=excluded.status_type, priority=excluded.priority,
       channel=excluded.channel, department_id=excluded.department_id,
       assignee_id=excluded.assignee_id, assignee_email=excluded.assignee_email,
       assignee_name=excluded.assignee_name, sentiment=excluded.sentiment,
       comment_count=excluded.comment_count, thread_count=excluded.thread_count,
       created_time=excluded.created_time, closed_time=excluded.closed_time,
       onhold_time=excluded.onhold_time, due_date=excluded.due_date,
       web_url=excluded.web_url, synced_at=excluded.synced_at`,
    [
      t.ticket_id, t.ticket_number || null, t.subject || null, t.status || null,
      t.status_type || null, t.priority || null, t.channel || null,
      t.department_id || null, t.assignee_id || null, t.assignee_email || null,
      t.assignee_name || null, t.sentiment || null, t.comment_count ?? null,
      t.thread_count ?? null, t.created_time || null, t.closed_time || null,
      t.onhold_time || null, t.due_date || null, t.web_url || null,
    ]
  );
}

async function getWatermark(ticketId) {
  const row = await get(`SELECT history_synced_through FROM desk_ticket_snapshot WHERE ticket_id = ?`, [ticketId]);
  return row ? row.history_synced_through : null;
}
async function setWatermark(ticketId, iso) {
  await run(`UPDATE desk_ticket_snapshot SET history_synced_through = ? WHERE ticket_id = ?`, [iso, ticketId]);
}

async function insertEvents(ticketId, events) {
  for (const e of events) {
    await run(
      `INSERT INTO desk_ticket_events
         (ticket_id, event_time, event_name, field_name, from_value, to_value, actor_id, actor_name, actor_type)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        ticketId, e.event_time, e.event_name || null, e.field_name || null,
        e.from_value || null, e.to_value || null,
        e.actor_id || null, e.actor_name || null, e.actor_type || null,
      ]
    );
  }
}

/**
 * Per-agent summary for a date range. Scoped by the caller to a set of
 * emails (the T1 roster) — this table holds whatever the sync job has
 * pulled, which may span more than one team if the sync isn't filtered.
 *
 * `reassigned_in`/`reassigned_out` are best-effort: they only count what
 * Zoho's ticket-history stream actually reported as an assignee-field
 * change (see desk-service.js EVENT comment). Treat them as directional
 * signal, not an audited number.
 */
async function agentSummary({ from, to, emails }) {
  if (!Array.isArray(emails) || emails.length === 0) return [];
  const placeholders = emails.map(() => '?').join(',');

  const backlog = await all(
    `SELECT assignee_email AS email, COUNT(*) AS n
       FROM desk_ticket_snapshot
      WHERE assignee_email IN (${placeholders}) AND status_type != 'Closed'
      GROUP BY assignee_email`,
    emails
  );
  const closed = await all(
    `SELECT assignee_email AS email, COUNT(*) AS n,
            AVG( (julianday(closed_time) - julianday(created_time)) * 24 ) AS avg_hours
       FROM desk_ticket_snapshot
      WHERE assignee_email IN (${placeholders})
        AND status_type = 'Closed' AND closed_time BETWEEN ? AND ?
      GROUP BY assignee_email`,
    [...emails, from, to]
  );
  const sentiment = await all(
    `SELECT assignee_email AS email, sentiment, COUNT(*) AS n
       FROM desk_ticket_snapshot
      WHERE assignee_email IN (${placeholders}) AND created_time BETWEEN ? AND ?
      GROUP BY assignee_email, sentiment`,
    [...emails, from, to]
  );
  const reassignedOut = await all(
    `SELECT s.assignee_email AS email, COUNT(*) AS n
       FROM desk_ticket_events e
       JOIN desk_ticket_snapshot s ON s.ticket_id = e.ticket_id
      WHERE e.field_name IN ('Assignee','AssigneeId','Agent')
        AND e.event_time BETWEEN ? AND ?
        AND s.assignee_email IN (${placeholders})
      GROUP BY s.assignee_email`,
    [from, to, ...emails]
  );

  const byEmail = {};
  for (const email of emails) {
    byEmail[email] = {
      email, backlog_open: 0, closed_count: 0, avg_handle_hours: null,
      sentiment: {}, reassignment_events: 0,
    };
  }
  for (const r of backlog)      if (byEmail[r.email]) byEmail[r.email].backlog_open = r.n;
  for (const r of closed)       if (byEmail[r.email]) { byEmail[r.email].closed_count = r.n; byEmail[r.email].avg_handle_hours = r.avg_hours != null ? Math.round(r.avg_hours * 10) / 10 : null; }
  for (const r of sentiment)    if (byEmail[r.email]) byEmail[r.email].sentiment[r.sentiment || 'UNKNOWN'] = r.n;
  for (const r of reassignedOut) if (byEmail[r.email]) byEmail[r.email].reassignment_events = r.n;

  return Object.values(byEmail);
}

async function syncStatus() {
  const lastSyncAt   = await getSyncState('last_sync_at');
  const lastError    = await getSyncState('last_error');
  const ticketCount  = await get(`SELECT COUNT(*) AS n FROM desk_ticket_snapshot`);
  const eventCount   = await get(`SELECT COUNT(*) AS n FROM desk_ticket_events`);
  return {
    lastSyncAt: lastSyncAt || null,
    lastError: lastError || null,
    ticketsTracked: ticketCount ? ticketCount.n : 0,
    eventsTracked: eventCount ? eventCount.n : 0,
  };
}

module.exports = {
  setDB, initSchema,
  getSyncState, setSyncState,
  cacheAgent, getCachedAgent,
  upsertTicketSnapshot, getWatermark, setWatermark, insertEvents,
  agentSummary, syncStatus,
};
