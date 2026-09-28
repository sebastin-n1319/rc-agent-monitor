/**
 * Ticket Lifecycle Tracking (Session 19, rebuilt Session 20)
 *
 * Automates what was previously a manually-exported Zoho Desk "lifecycle
 * report" CSV, and the per-ticket Google Sheet agents fill in by hand
 * (channel / ticket type / transferred / picked-from-queue via
 * POST /api/tickets) -- kept current by a background sync against the
 * Zoho Desk API (see desk-service.js).
 *
 * Session 20 rebuild: the original schema only stored a thin ticket
 * snapshot (status/channel/sentiment) and tried to infer reassignment
 * from raw history events, which Zoho doesn't document a stable shape
 * for. This version stores everything Zoho Desk itself already tracks
 * per ticket -- classification, category (both a manual dept-specific
 * field and an always-populated AI category, since agents don't fill
 * every field), the "Adit App Module" custom field, FCR Achieved -- plus
 * `desk_ticket_agents`, one row per agent who ever handled a ticket, with
 * their individual handling time, sourced from Zoho's own
 * /tickets/{id}/metrics endpoint (reassignCount, reopenCount,
 * agentsHandled[]). That endpoint is authoritative for "how many agents
 * touched this ticket and for how long", which is what "solely handled"
 * vs "transferred" is computed from below -- far more reliable than
 * reconstructing it from history events.
 *
 * Tables:
 *   desk_agents           -- agentId -> email/name cache (Zoho agent
 *                            lookups are a separate API call; cache so
 *                            repeat agentIds across tickets are free)
 *   desk_ticket_snapshot   -- current known state of every synced ticket
 *   desk_ticket_agents     -- one row per (ticket, agent) who handled it,
 *                            with that agent's individual handling time
 *   desk_ticket_events     -- legacy event cache from the original build;
 *                            no longer written to, kept read-only so any
 *                            already-synced data isn't lost
 *   desk_sync_state        -- simple key/value watermark store
 */
let _db = null;

function setDB(db) { _db = db; }

const run = (sql, params = []) =>
  new Promise((res, rej) => _db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
const get = (sql, params = []) =>
  new Promise((res, rej) => _db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const all = (sql, params = []) =>
  new Promise((res, rej) => _db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

/** Best-effort ALTER TABLE ADD COLUMN -- sqlite has no "IF NOT EXISTS"
 *  for columns, so this just swallows the "duplicate column" error,
 *  making the migration safe to re-run on every boot. */
async function addColumnIfMissing(table, columnDef) {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (e) {
    if (!/duplicate column name/i.test(e.message)) throw e;
  }
}

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

  // Session 20 additions -- see file header. All idempotent.
  await addColumnIfMissing('desk_ticket_snapshot', `department_name TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `team_id TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `team_name TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `modified_time TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `classification TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `category TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `module TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `ai_category TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `manual_category TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `manual_category_source TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `dept_classification TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `fcr_achieved TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `reassign_count INTEGER`);
  await addColumnIfMissing('desk_ticket_snapshot', `reopen_count INTEGER`);
  await addColumnIfMissing('desk_ticket_snapshot', `resolution_hours REAL`);
  await addColumnIfMissing('desk_ticket_snapshot', `resolution_business_hours REAL`);
  await addColumnIfMissing('desk_ticket_snapshot', `metrics_modified_time TEXT`);
  // Session 21: contact/account fields off the raw ticket (t.contact.*),
  // so the admin dashboard can offer a combined customer search (name,
  // email, or account) without a second API call per ticket.
  await addColumnIfMissing('desk_ticket_snapshot', `contact_name TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `contact_email TEXT`);
  await addColumnIfMissing('desk_ticket_snapshot', `account_name TEXT`);
  // Session 24: Zoho's own ticket-owner audit trail ("Owner changed to
  // <name> on <time> | Role : <role>", one line per handoff), bulk-synced
  // from AditKB's desk_tickets.cf_owner_change_log -- see upsertAditkbRow()
  // in server.js. Lets agentSummary() compute unique/solely-handled/
  // reassigned/transferred instantly for the whole backlog instead of
  // waiting on the slow live-Zoho metrics phase (desk_ticket_agents).
  await addColumnIfMissing('desk_ticket_snapshot', `owner_change_log TEXT`);
  // Session 40: Zoho Analytics' own authoritative "Resolution Time in
  // Business Hours" and "Is First Call Resolution" per ticket -- see
  // analytics-service.js's fetchTicketFcrRows() for the full story on why
  // this app's own computeBusinessHours() (server.js) diverges from
  // Zoho's number, and why the FCR% below now counts zoho_is_fcr rather
  // than reconstructing it from resolution_business_hours + reopen_count.
  // NULL until server.js's runFcrAnalyticsSync() backfill reaches that
  // ticket -- the FCR query below falls back to the old rule until then.
  await addColumnIfMissing('desk_ticket_snapshot', `zoho_resolution_business_hours REAL`);
  await addColumnIfMissing('desk_ticket_snapshot', `zoho_is_fcr INTEGER`);
  await addColumnIfMissing('desk_ticket_snapshot', `zoho_fcr_synced_at TEXT`);
  // Session 54: Zoho agent id of whoever created the ticket (AditKB
  // desk_tickets.j_created_by). A T1 agent who logs a phone ticket and
  // assigns it straight to another team never appears in the owner log,
  // so this is the only way that transfer can be credited to them.
  await addColumnIfMissing('desk_ticket_snapshot', `created_by_id TEXT`);

  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_assignee ON desk_ticket_snapshot(assignee_email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_created  ON desk_ticket_snapshot(created_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_closed   ON desk_ticket_snapshot(closed_time)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_status   ON desk_ticket_snapshot(status_type)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_account  ON desk_ticket_snapshot(account_name)`);

  // Session 20 CSAT: one row per Zoho Desk "Customer Happiness Rating"
  // survey response, sourced from Zoho Analytics' own "Survey (Zoho
  // Desk)" table (see lib/analytics-service.js -- the public Desk REST
  // API doesn't expose this data for this org, Analytics' dedicated Desk
  // connector does). survey_time is always stored as real UTC ISO
  // (converted from Analytics' naive America/Chicago wall-clock string),
  // so it compares correctly against the app's other from/to filters.
  // A ticket can have more than one survey row (customer can be asked/
  // respond more than once), so survey_id (not ticket_id) is the key.
  await run(`CREATE TABLE IF NOT EXISTS desk_ticket_survey (
    survey_id      TEXT PRIMARY KEY,
    ticket_id      TEXT,
    rating         TEXT,
    agent_id       TEXT,
    department_id  TEXT,
    contact_id     TEXT,
    account_id     TEXT,
    survey_time    TEXT,
    synced_at      TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_survey_ticket ON desk_ticket_survey(ticket_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_survey_time   ON desk_ticket_survey(survey_time)`);

  // One row per agent who ever touched a ticket, with their individual
  // handling time -- the whole table is replaced per-ticket on each
  // metrics refresh (see replaceTicketAgents).
  await run(`CREATE TABLE IF NOT EXISTS desk_ticket_agents (
    ticket_id        TEXT NOT NULL,
    agent_id         TEXT,
    agent_name       TEXT,
    agent_email      TEXT,
    handling_seconds INTEGER,
    PRIMARY KEY (ticket_id, agent_id)
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_ta_email ON desk_ticket_agents(agent_email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_ta_ticket ON desk_ticket_agents(ticket_id)`);

  // Legacy event cache from the original (Session 19) build. No longer
  // written to -- reassignment/reopen counts now come straight from
  // Zoho's /tickets/{id}/metrics (see desk-service.js) -- but the table
  // and its accessors are kept so nothing already synced is lost.
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

  await run(`CREATE TABLE IF NOT EXISTS desk_sync_state (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Session 42: per-agent ticket ACTIVITY (who replied / commented on which
  // ticket, and when), mirrored from AditKB's desk_ticket_threads (outgoing
  // replies only) and desk_ticket_comments. This is what "tickets handled"
  // is counted from -- see agentHandledTickets() below. Only metadata is
  // stored (never message bodies), and only @adit.com authors.
  await run(`CREATE TABLE IF NOT EXISTS desk_ticket_activity (
    ticket_id    TEXT NOT NULL,
    source       TEXT NOT NULL,   -- 'thread' | 'comment'
    idx          INTEGER NOT NULL, -- thread_index / comment_index from AditKB
    author_email TEXT,
    created_time TEXT,            -- normalized UTC ISO (…Z)
    PRIMARY KEY (ticket_id, source, idx)
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_activity_author_time ON desk_ticket_activity(author_email, created_time)`);

  // Session 43: AditKB staff directory (adit_users) -- email -> team -- used
  // to group ticket-transfer destinations. See staffGroupClassifier().
  await run(`CREATE TABLE IF NOT EXISTS staff_directory (
    email      TEXT PRIMARY KEY,
    full_name  TEXT,
    team       TEXT,
    aliases    TEXT,  -- JSON array
    status     TEXT,
    zoho_role  TEXT,  -- Zoho Desk role/profile, e.g. "Engineering" (fallback when team is blank)
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_desk_snap_modified ON desk_ticket_snapshot(modified_time)`);
}

/** Session 42: upserts a batch of AditKB thread/comment rows into
 *  desk_ticket_activity. `source` is 'thread' or 'comment'; `allowedEmails`
 *  (Set, lowercase) limits storage to the monitored roster. Rows without
 *  an @adit.com author (customer emails, system notifications) and
 *  incoming threads are skipped -- they're never agent activity, and
 *  skipping them keeps customer personal data out of this app. */
async function upsertTicketActivityRows(source, rows, allowedEmails = null) {
  let written = 0;
  if (!rows || !rows.length) return 0;
  // No explicit BEGIN/COMMIT: the app shares one sqlite handle, and other
  // writers (e.g. replaceCallLogsRange's BEGIN IMMEDIATE) could collide
  // with a nested transaction. Each upsert is idempotent on its own.
  {
    for (const r of rows) {
      const email = (r.author_email || '').toLowerCase();
      if (!email.endsWith('@adit.com')) continue;
      // Only monitored agents are stored (keeps this table ~10MB instead of
      // ~70MB on a 500MB volume). Adding an agent later: POST
      // /api/admin/desk-lifecycle/activity-reset re-walks the history.
      if (allowedEmails && !allowedEmails.has(email)) continue;
      if (source === 'thread' && String(r.direction || '').toLowerCase() !== 'out') continue;
      const idx = source === 'thread' ? r.thread_index : r.comment_index;
      if (r.ticket_id == null || idx == null || !r.created_time) continue;
      const t = Date.parse(r.created_time);
      if (Number.isNaN(t)) continue;
      await run(
        `INSERT INTO desk_ticket_activity (ticket_id, source, idx, author_email, created_time)
         VALUES (?,?,?,?,?)
         ON CONFLICT(ticket_id, source, idx) DO UPDATE SET
           author_email=excluded.author_email, created_time=excluded.created_time`,
        [String(r.ticket_id), source, Number(idx), email, new Date(t).toISOString()]
      );
      written++;
    }
  }
  return written;
}

/** Converts a naive "YYYY-MM-DD HH:MM:SS" wall-clock time in
 *  America/Chicago (the format Zoho writes into cf_owner_change_log --
 *  verified against real tickets: every "Owner changed to" stamp lines up
 *  with the ticket's own UTC created_time only when read as Chicago time)
 *  into a real UTC ISO string. Handles CST/CDT via Intl. */
function chicagoWallClockToIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  // Offset of Chicago at that instant (minutes), computed via Intl.
  const offsetAt = (ms) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms)).reduce((a, p) => (a[p.type] = p.value, a), {});
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return (asUtc - ms) / 60000;
  };
  let ms = guess - offsetAt(guess) * 60000;
  ms = guess - offsetAt(ms) * 60000; // second pass settles DST edges
  return new Date(ms).toISOString();
}

function toIsoZ(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Session 42: "tickets handled" per agent over [from, to) -- the metric
 *  that replaces agents' manual ticket logging. Per Sebastin's rule, a
 *  ticket counts once for an agent if, inside the window, the agent:
 *    - sent a reply on it (outgoing thread), or
 *    - added a comment on it (incl. private call notes), or
 *    - became its owner (per Zoho's own owner-change audit trail).
 *  Validated against a week of agents' own manual logs before shipping:
 *  replied-or-commented alone covered 96% of manually logged tickets,
 *  vs 42% for "is the current owner".
 *
 *  Returns { [email]: { handled:Set, replied:Set, commented:Set, owned:Set } }. */
async function agentHandledTickets({ emails, agentNames, from, to }) {
  const out = {};
  for (const e of emails || []) out[e] = { handled: new Set(), replied: new Set(), commented: new Set(), owned: new Set() };
  if (!emails || !emails.length) return out;
  const fromIso = toIsoZ(from), toIso = toIsoZ(to);
  if (!fromIso || !toIso) return out;
  const placeholders = emails.map(() => '?').join(',');

  const acts = await all(
    `SELECT ticket_id, source, author_email FROM desk_ticket_activity
      WHERE author_email IN (${placeholders}) AND created_time >= ? AND created_time < ?`,
    [...emails, fromIso, toIso]
  );
  for (const a of acts) {
    const bucket = out[a.author_email];
    if (!bucket) continue;
    bucket.handled.add(a.ticket_id);
    (a.source === 'thread' ? bucket.replied : bucket.commented).add(a.ticket_id);
  }

  // Ownership: an owner change at time T implies the ticket's
  // modified_time >= T, so modified_time >= from is a safe prefilter.
  const nameToEmail = new Map();
  for (const [email, name] of Object.entries(agentNames || {})) {
    if (name && out[email]) nameToEmail.set(String(name).trim().toLowerCase(), email);
  }
  if (nameToEmail.size) {
    const rows = await all(
      `SELECT ticket_id, owner_change_log FROM desk_ticket_snapshot
        WHERE modified_time >= ? AND owner_change_log LIKE '%Owner changed to%'`,
      [from]
    );
    for (const r of rows) {
      for (const e of individualOwnerEntries(r.owner_change_log)) {
        const email = nameToEmail.get(e.name.trim().toLowerCase());
        if (!email) continue;
        const at = chicagoWallClockToIso(e.at);
        if (!at || at < fromIso || at >= toIso) continue;
        out[email].handled.add(r.ticket_id);
        out[email].owned.add(r.ticket_id);
      }
    }
  }
  return out;
}

/** True once desk_ticket_activity is known to be complete back to `from`:
 *  either the whole backfill is done, or its cursor has already walked
 *  past `from`. Until then the UI keeps showing the older owner-based
 *  number instead of a misleadingly low "tickets handled". */
async function activityCovers(from) {
  if ((await getSyncState('activity_backfill_complete')) === '1') return true;
  const cursor = Number(await getSyncState('activity_backfill_cursor_ms'));
  const fromMs = Date.parse(from);
  return !!cursor && !Number.isNaN(fromMs) && cursor <= fromMs;
}

async function ticketActivityStatus() {
  const n = await get(`SELECT COUNT(*) AS n, MAX(created_time) AS latest FROM desk_ticket_activity`);
  return {
    ready: (await getSyncState('activity_backfill_complete')) === '1',
    rows: n ? n.n : 0,
    latestActivity: n ? n.latest : null,
    lastSyncAt: await getSyncState('activity_last_sync_at'),
    lastError: await getSyncState('activity_last_error'),
    backfilledTo: await getSyncState('activity_backfill_cursor_ms'),
  };
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

async function getStoredMetricsWatermark(ticketId) {
  const row = await get(`SELECT metrics_modified_time FROM desk_ticket_snapshot WHERE ticket_id = ?`, [ticketId]);
  return row ? row.metrics_modified_time : undefined; // undefined = not yet synced at all
}

/** Session 22: candidate tickets for a live-Zoho /metrics refresh --
 *  already-synced snapshot rows (from AditKB) whose modified_time has
 *  moved past the last metrics pull, oldest-refreshed-first via
 *  modified_time desc so the most recently changed tickets get priority
 *  within the tick's budget. */
async function getMetricsRefreshCandidates(limit) {
  return all(
    `SELECT ticket_id, ticket_number, modified_time FROM desk_ticket_snapshot
      WHERE modified_time IS NOT NULL
        AND (metrics_modified_time IS NULL OR metrics_modified_time != modified_time)
      ORDER BY modified_time DESC LIMIT ?`,
    [limit]
  );
}

/** Session 40: writes Zoho Analytics' authoritative FCR fields onto an
 *  already-synced ticket snapshot row. Deliberately a plain UPDATE, not
 *  part of upsertTicketSnapshot()'s INSERT -- this only ever runs against
 *  tickets desk_ticket_snapshot already knows about (from the Desk/AditKB
 *  sync), and a ticket closed_time outside this app's own synced range
 *  (e.g. from before AditKB's own backfill floor) should just no-op
 *  rather than create a bare, half-populated snapshot row. */
async function upsertZohoFcrFields({ ticket_id, resolution_business_hours, is_fcr }) {
  if (!ticket_id) return 0;
  const result = await run(
    `UPDATE desk_ticket_snapshot
        SET zoho_resolution_business_hours = ?, zoho_is_fcr = ?, zoho_fcr_synced_at = datetime('now')
      WHERE ticket_id = ?`,
    [resolution_business_hours == null ? null : resolution_business_hours, is_fcr == null ? null : is_fcr, ticket_id]
  );
  return result.changes || 0;
}

async function upsertTicketSnapshot(t) {
  await run(
    `INSERT INTO desk_ticket_snapshot
       (ticket_id, ticket_number, subject, status, status_type, priority, channel,
        department_id, department_name, team_id, team_name,
        assignee_id, assignee_email, assignee_name, sentiment,
        comment_count, thread_count, created_time, closed_time, onhold_time,
        due_date, web_url, modified_time, classification, category, module,
        ai_category, manual_category, manual_category_source, dept_classification,
        fcr_achieved, resolution_business_hours,
       contact_name, contact_email, account_name, owner_change_log, reopen_count, created_by_id, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(ticket_id) DO UPDATE SET
       ticket_number=excluded.ticket_number, subject=excluded.subject,
       status=excluded.status, status_type=excluded.status_type, priority=excluded.priority,
       channel=excluded.channel, department_id=excluded.department_id,
       department_name=excluded.department_name, team_id=excluded.team_id, team_name=excluded.team_name,
       assignee_id=excluded.assignee_id, assignee_email=excluded.assignee_email,
       assignee_name=excluded.assignee_name, sentiment=excluded.sentiment,
       comment_count=excluded.comment_count, thread_count=excluded.thread_count,
       created_time=excluded.created_time, closed_time=excluded.closed_time,
       onhold_time=excluded.onhold_time, due_date=excluded.due_date,
       web_url=excluded.web_url, modified_time=excluded.modified_time,
       classification=excluded.classification, category=excluded.category, module=excluded.module,
       ai_category=excluded.ai_category, manual_category=excluded.manual_category,
       manual_category_source=excluded.manual_category_source, dept_classification=excluded.dept_classification,
       fcr_achieved=excluded.fcr_achieved, resolution_business_hours=excluded.resolution_business_hours,
       contact_name=excluded.contact_name, contact_email=excluded.contact_email,
       account_name=excluded.account_name, owner_change_log=excluded.owner_change_log,
       reopen_count=excluded.reopen_count,
       created_by_id=COALESCE(excluded.created_by_id, desk_ticket_snapshot.created_by_id),
       synced_at=excluded.synced_at`,
    [
      t.ticket_id, t.ticket_number || null, t.subject || null, t.status || null,
      t.status_type || null, t.priority || null, t.channel || null,
      t.department_id || null, t.department_name || null, t.team_id || null, t.team_name || null,
      t.assignee_id || null, t.assignee_email || null, t.assignee_name || null,
      t.sentiment || null, t.comment_count ?? null, t.thread_count ?? null,
      t.created_time || null, t.closed_time || null, t.onhold_time || null,
      t.due_date || null, t.web_url || null, t.modified_time || null,
      t.classification || null, t.category || null, t.module || null,
      t.ai_category || null, t.manual_category || null, t.manual_category_source || null,
      t.dept_classification || null, t.fcr_achieved || null,
      t.resolution_business_hours ?? null,
      t.contact_name || null, t.contact_email || null, t.account_name || null,
      t.owner_change_log || null, t.reopen_count ?? null, t.created_by_id ? String(t.created_by_id) : null,
    ]
  );
}

/** Parses Zoho Desk's own ticket-owner audit trail (the
 *  cf_owner_change_log custom field, bulk-synced via AditKB) into an
 *  ordered list of { name, role, at } handoffs. One line per owner
 *  change, e.g. "Owner changed to Henry P on 2026-09-18 16:53:50 | Role :
 *  T1 Support" -- multiple lines (newline-separated) mean the ticket
 *  changed hands more than once. `role` is Zoho's role/team tag for
 *  whoever the ticket was handed to at that step, used as a proxy for
 *  "department" in the transferred-to breakdown -- missing/"null" roles
 *  normalize to 'Unknown'. Malformed or unrecognized lines are skipped
 *  rather than throwing, since this is free text Zoho generates, not a
 *  strict schema. */
function parseOwnerChangeLog(logText) {
  if (!logText) return [];
  const lines = String(logText).split('\n').map((l) => l.trim()).filter(Boolean);
  // Session 26: the role suffix shows up in three real formats in Zoho's
  // audit trail -- "| Role : X" (current, from ~Jan 2026), "Role :X" with
  // no pipe (common ~Oct-Dec 2025), and no role suffix at all (oldest
  // rows, predate the Role sub-field). The pipe used to be mandatory in
  // this regex, which silently dropped every no-pipe/no-role line -- and
  // with it that whole hop -- corrupting the prev/next-owner comparisons
  // agentSummary()/agentTicketList() rely on for reassigned/transferred.
  // All three formats now parse; role falls back to 'Unknown' when a
  // line has none.
  const re = /^Owner changed to (.+?) on ([\d-]+[ T][\d:]+)(?:\s*\|?\s*Role\s*:\s*(.*))?$/i;
  const entries = [];
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    const roleRaw = (m[3] || '').trim();
    const role = (!roleRaw || roleRaw.toLowerCase() === 'null') ? 'Unknown' : roleRaw;
    entries.push({ name: m[1].trim(), at: m[2].trim(), role });
  }
  return entries;
}

/** parseOwnerChangeLog(), with the non-owner hops filtered out: a
 *  "Role : Team" entry is the ticket sitting in a team/pod queue (its
 *  `name` is a queue name like "T1 Customer Support" or "VoIP - CSM", not
 *  a person -- confirmed against real AditKB data), and "Unassigned"/
 *  "N/A" is Desk's own placeholder for no owner. Neither is a real
 *  handling event, so Session 26 excludes both before classifying
 *  unique/solely-handled/reassigned/transferred -- the concrete form of
 *  Sebastin's instruction to "ignore the ticket created by client and
 *  assigned within t1 agents [via] the queue". */
function individualOwnerEntries(logText) {
  return parseOwnerChangeLog(logText).filter((e) => {
    if ((e.role || '').trim().toLowerCase() === 'team') return false;
    const n = (e.name || '').trim().toLowerCase();
    return n && n !== 'unassigned' && n !== 'n/a';
  });
}

/** Session 43: replaces staff_directory with a fresh pull from AditKB. */
async function replaceStaffDirectory(rows) {
  if (!rows || !rows.length) return 0;
  let n = 0;
  await run(`DELETE FROM staff_directory`);
  for (const r of rows) {
    const email = String(r.email || '').toLowerCase().trim();
    if (!email) continue;
    await run(
      `INSERT OR REPLACE INTO staff_directory (email, full_name, team, aliases, status, zoho_role, updated_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      [email, r.full_name || null, r.team || null, JSON.stringify(Array.isArray(r.aliases) ? r.aliases : []), r.status || null, r.zoho_role || r.zoho_profile || null]
    );
    n++;
  }
  _classifierCache = null;
  return n;
}

// Session 43: generic transfer-destination groups, per Sebastin: don't
// split by individual pod/team, roll up to T1 / T2 / VoIP / CSM / Pod.
//   T1     T1 CS
//   T2     T2 Core/Billing + Adit Pay, AI Support, RCM, Porting,
//          Server Installs, Practice Analytics, Financing
//   VoIP   every VoIP team (CSM, OB, BOPS, Assets)
//   CSM    Tech CSM + Marketing CSM pods (MktgCSM Pod A-K, DSO pods,
//          "Kate's Pod" style Tech CSM pods)
//   Pod    Tech OB pods (TechOB Pod 1-28)
//   T3/Dev T3 teams + engineering/product
//   Other  anyone/anything else
const ADIT_TEAM_GROUP = {
  't1 cs team': 'T1',
  't2 cs team': 'T2', 'server install team': 'T2', 'porting team': 'T2', 'practice analytics team': 'T2',
  'adit pay team': 'T2', 'ai team': 'T2', 'rcm team': 'T2',
  'voip team': 'VoIP', 'assets team': 'VoIP',
  'tech cs team': 'CSM', 'mark cs team': 'CSM', 'dso team': 'CSM', 'dso team / rcm team': 'CSM',
  'tech ob team': 'Pod',
  'dev team': 'T3/Dev', 'product team': 'T3/Dev', 'patient forms': 'T3/Dev',
};
function groupFromAditTeam(team) {
  return ADIT_TEAM_GROUP[String(team || '').trim().toLowerCase()] || null;
}
function groupFromZohoTeam(name) {
  const t = String(name || '').trim();
  if (!t) return null;
  if (/voip/i.test(t)) return 'VoIP';
  if (/^t3\b|engineering|integrations/i.test(t)) return 'T3/Dev';
  if (/^t2\b|rcm|adit\s*pay|ai support|porting|server install|practice analytics|financing|billing/i.test(t)) return 'T2';
  if (/tech\s*ob/i.test(t)) return 'Pod';
  if (/^t1\b|customer support/i.test(t)) return 'T1';
  if (/pod|csm|dso/i.test(t)) return 'CSM';
  return null;
}

let _classifierCache = null;
/** Builds (and caches for 10 min) a classifier that puts an owner-change
 *  log hop into a generic group. People are matched by their Zoho display
 *  name -> email (from ticket assignees and the staff directory's names/
 *  aliases), then email -> AditKB team; if their AditKB team is blank, the
 *  Zoho Desk team they most often own tickets under is used. "Role : Team"
 *  hops (a ticket sitting in a team queue) are grouped by the team name. */
async function staffGroupClassifier() {
  if (_classifierCache && Date.now() - _classifierCache.at < 10 * 60 * 1000) return _classifierCache.fn;
  const nameToEmail = new Map();
  const staff = await all(`SELECT email, full_name, team, aliases, zoho_role FROM staff_directory`);
  const teamByEmail = new Map();
  const roleByEmail = new Map();
  for (const r of staff) {
    teamByEmail.set(r.email, r.team);
    roleByEmail.set(r.email, r.zoho_role);
    if (r.full_name) nameToEmail.set(r.full_name.trim().toLowerCase(), r.email);
    try { for (const a of JSON.parse(r.aliases || '[]')) if (a) nameToEmail.set(String(a).trim().toLowerCase(), r.email); } catch (_) {}
  }
  // Zoho display names as they appear in owner logs ("Omar L", "Henry P")
  // are exactly the assignee_name values on tickets they own -- these win.
  const assignees = await all(
    `SELECT lower(assignee_name) AS name, lower(assignee_email) AS email, COUNT(*) AS n
       FROM desk_ticket_snapshot WHERE assignee_name IS NOT NULL AND assignee_email IS NOT NULL
      GROUP BY 1, 2 ORDER BY n ASC`
  );
  for (const a of assignees) nameToEmail.set(a.name.trim(), a.email); // ascending, so the most frequent wins
  const zohoTeams = await all(
    `SELECT lower(assignee_email) AS email, team_name AS team, COUNT(*) AS n
       FROM desk_ticket_snapshot WHERE assignee_email IS NOT NULL AND team_name IS NOT NULL AND team_name != ''
      GROUP BY 1, 2 ORDER BY n ASC`
  );
  const dominantZohoTeam = new Map();
  for (const z of zohoTeams) dominantZohoTeam.set(z.email, z.team);

  const fn = (entry) => {
    if (!entry) return 'Other';
    if (String(entry.role || '').trim().toLowerCase() === 'team') return groupFromZohoTeam(entry.name) || 'Other';
    const email = nameToEmail.get(String(entry.name || '').trim().toLowerCase());
    if (email) {
      const role = roleByEmail.get(email);
      const g = groupFromAditTeam(teamByEmail.get(email))
        || groupFromZohoTeam(dominantZohoTeam.get(email))
        || (/engineer|develop|\bqa\b|product/i.test(role || '') ? 'T3/Dev' : groupFromZohoTeam(role));
      if (g) return g;
    }
    return 'Other';
  };
  _classifierCache = { at: Date.now(), fn };
  return fn;
}

/** Session 43: the hop a ticket went to right after `agentNameLower` last
 *  had it -- a person OR a team queue ("Role : Team"), skipping
 *  "Unassigned". Null if the agent was the last owner. */
function nextHopAfterAgent(logText, agentNameLower) {
  const all_ = (Array.isArray(logText) ? logText : parseOwnerChangeLog(logText)).filter((e) => {
    const n = (e.name || '').trim().toLowerCase();
    return n && n !== 'unassigned' && n !== 'n/a';
  });
  let last = -1;
  all_.forEach((e, i) => { if (String(e.role || '').toLowerCase() !== 'team' && e.name.trim().toLowerCase() === agentNameLower) last = i; });
  if (last < 0) return null;
  for (let i = last + 1; i < all_.length; i++) {
    if (all_[i].name.trim().toLowerCase() !== agentNameLower) return all_[i];
  }
  return null;
}

/** Session 54: Zoho agent id -> display name, from the ids and names seen
 *  on synced tickets' assignees plus the desk_agents cache. Used to name a
 *  ticket's creator (created_by_id). Cached 10 min. */
let _creatorNameCache = null;
async function agentNameById() {
  if (_creatorNameCache && Date.now() - _creatorNameCache.at < 10 * 60 * 1000) return _creatorNameCache.map;
  const map = new Map();
  try {
    const cached = await all(`SELECT * FROM desk_agents`);
    for (const a of cached) {
      const id = a.agent_id || a.id;
      const nm = a.name || a.display_name || [a.first_name, a.last_name].filter(Boolean).join(' ');
      if (id && nm) map.set(String(id), String(nm));
    }
  } catch (_) {}
  const rows = await all(
    `SELECT assignee_id AS id, assignee_name AS name, COUNT(*) AS n FROM desk_ticket_snapshot
      WHERE assignee_id IS NOT NULL AND assignee_name IS NOT NULL GROUP BY 1, 2 ORDER BY n ASC`
  );
  for (const r of rows) map.set(String(r.id), r.name); // ascending, most frequent wins
  _creatorNameCache = { at: Date.now(), map };
  return map;
}

/** Session 54: the ticket's owner chain as the lifecycle counts should see
 *  it. Zoho's owner log misses two real hand-offs:
 *   1. The ticket's current assignee is not always logged (the last move
 *      can be missing), so the current assignee is appended as a final
 *      hop when the log does not already end on them.
 *   2. A T1 agent who creates a ticket and assigns it straight to another
 *      team never appears in the log. When the creator is one of our T1
 *      agents, is absent from the log, and the first owner is outside T1,
 *      the creator is put in front as the first owner.
 *  Returns { full, individual }: `full` keeps team-queue hops (for the
 *  next-hop check), `individual` drops them like individualOwnerEntries(). */
function effectiveOwnerChain(row, ctx = {}) {
  const logText = row.log != null ? row.log : row.owner_change_log;
  const full = parseOwnerChangeLog(logText).filter((e) => {
    const n = (e.name || '').trim().toLowerCase();
    return n && n !== 'unassigned' && n !== 'n/a';
  });
  const isTeam = (e) => String(e.role || '').trim().toLowerCase() === 'team';
  const cur = String(row.assignee_name || '').trim();
  if (cur) {
    const last = full[full.length - 1];
    if (!last || isTeam(last) || last.name.trim().toLowerCase() !== cur.toLowerCase()) {
      full.push({ name: cur, role: null, at: null, virtual: 'current' });
    }
  }
  const creatorId = row.created_by_id != null ? String(row.created_by_id) : '';
  const creator = creatorId && ctx.nameById ? ctx.nameById.get(creatorId) : null;
  if (creator && full.length) {
    const cLc = creator.trim().toLowerCase();
    const isT1Creator = (ctx.rosterNameSet && ctx.rosterNameSet.has(cLc))
      || (ctx.classify && ctx.classify({ name: creator, role: null }) === 'T1');
    const inLog = full.some((e) => !isTeam(e) && e.name.trim().toLowerCase() === cLc);
    if (isT1Creator && !inLog) {
      const first = full[0];
      const firstGrp = (!isTeam(first) && ctx.rosterNameSet && ctx.rosterNameSet.has(first.name.trim().toLowerCase()))
        ? 'T1' : (ctx.classify ? ctx.classify(first) : 'Other');
      if (firstGrp !== 'T1') full.unshift({ name: creator, role: null, at: null, virtual: 'creator' });
    }
  }
  return { full, individual: full.filter((e) => !isTeam(e)) };
}

/** Insert/update one CSAT survey response row (see schema comment
 *  above). Keyed on survey_id since a ticket can have multiple rows. */
async function upsertSurveyRow(r) {
  if (!r || !r.survey_id) return;
  await run(
    `INSERT INTO desk_ticket_survey
       (survey_id, ticket_id, rating, agent_id, department_id, contact_id, account_id, survey_time, synced_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(survey_id) DO UPDATE SET
       ticket_id=excluded.ticket_id, rating=excluded.rating, agent_id=excluded.agent_id,
       department_id=excluded.department_id, contact_id=excluded.contact_id,
       account_id=excluded.account_id, survey_time=excluded.survey_time, synced_at=excluded.synced_at`,
    [r.survey_id, r.ticket_id || null, r.rating || null, r.agent_id || null,
     r.department_id || null, r.contact_id || null, r.account_id || null, r.survey_time_utc || null]
  );
}

/** Refresh a ticket's handling metrics: reassign/reopen counts,
 *  resolution time, and every agent who touched it with their individual
 *  handling time. `metricsModifiedTime` is the ticket's modifiedTime as
 *  of this metrics pull -- stored as a watermark so the sync only re-pulls
 *  metrics for tickets that have actually changed since (see
 *  getStoredMetricsWatermark / server.js). */
async function updateTicketMetrics(ticketId, { reassignCount, reopenCount, resolutionHours, metricsModifiedTime }) {
  await run(
    `UPDATE desk_ticket_snapshot
        SET reassign_count = ?, reopen_count = ?, resolution_hours = ?, metrics_modified_time = ?
      WHERE ticket_id = ?`,
    [reassignCount ?? null, reopenCount ?? null, resolutionHours ?? null, metricsModifiedTime || null, ticketId]
  );
}

async function replaceTicketAgents(ticketId, agents) {
  await run(`DELETE FROM desk_ticket_agents WHERE ticket_id = ?`, [ticketId]);
  for (const a of (agents || [])) {
    if (!a.agentId) continue; // "Unassigned" rows from Zoho have agentId: null -- skip, nothing to attribute
    await run(
      `INSERT OR REPLACE INTO desk_ticket_agents (ticket_id, agent_id, agent_name, agent_email, handling_seconds)
       VALUES (?,?,?,?,?)`,
      [ticketId, a.agentId, a.agentName || null, a.agentEmail || null, a.handlingSeconds ?? null]
    );
  }
}

/**
 * Per-agent summary for a date range, scoped to a set of emails (the
 * roster passed by the caller). Volume metrics (unique/solely-handled/
 * reassigned tickets, and the channel/module/category/classification
 * breakdowns) are windowed by the ticket's *created* time; "closed" and
 * FCR% are windowed by *closed* time; "currently handling" is a live
 * snapshot of open tickets currently assigned to the agent, not windowed
 * by date at all (it means right now, not "in this period").
 *
 * "Closed" and "currently handling" are attributed to whoever Zoho Desk
 * shows as the CURRENT assignee -- that's Desk's own convention for who
 * gets credit for a ticket, including one that was reassigned partway
 * through. "Unique tickets" / "solely handled" / "reassigned" instead
 * count every agent who appears in that ticket's handling history
 * (desk_ticket_agents), so an agent who worked a ticket but doesn't
 * currently own it still shows up there.
 *
 * FCR% (Session 20 correction): Zoho's own `cf_fcr_achieved` custom
 * field was found to be unreliable -- essentially always false across
 * the whole ticket base, regardless of how the ticket actually resolved
 * -- so it is no longer used to compute the percentage (still stored,
 * read-only, for reference). FCR is instead computed directly per
 * Sebastin's definition: resolution time in business hours (Mon-Fri
 * 7am-7pm CST, see computeBusinessHours in server.js) <= 24 hours, AND
 * zero reopens. Denominator is every Closed ticket in the window, not
 * just ones where a value happened to be present.
 */
async function agentSummary({ from, to, emails, q, agentNames, rosterNames }) {
  if (!Array.isArray(emails) || emails.length === 0) return [];
  const placeholders = emails.map(() => '?').join(',');

  // Session 21: optional combined customer search (account name, contact
  // name, or contact email), applied to every query below alongside the
  // date window. `prefix` is the table alias in scope at each call site
  // ('s' where desk_ticket_snapshot is joined as s, '' where it's the
  // only table in the query).
  const custTerm = q && String(q).trim() ? `%${String(q).trim()}%` : null;
  function custWhere(prefix) {
    if (!custTerm) return { clause: '', params: [] };
    const p = prefix ? `${prefix}.` : '';
    return {
      clause: ` AND (${p}contact_name LIKE ? OR ${p}contact_email LIKE ? OR ${p}account_name LIKE ?)`,
      params: [custTerm, custTerm, custTerm],
    };
  }

  const byEmail = {};
  for (const email of emails) {
    byEmail[email] = {
      email,
      unique_tickets: 0, solely_handled: 0, reassigned: 0,
      transferred: 0, departments_transferred: {},
      handed_off_internal: 0,
      closed_count: 0, avg_handle_hours: null,
      currently_handling: 0,
      fcr_yes: 0, fcr_total: 0, fcr_pct: null,
      csat_good: 0, csat_total: 0, csat_pct: null,
      channel: {}, module: {}, category: {}, classification: {},
    };
  }

  const cwS = custWhere('s');

  // Session 24: unique/solely-handled/reassigned/transferred (plus the
  // channel/module/category/classification breakdowns further below --
  // see the removed breakdown() helper) are computed here by parsing
  // each ticket's owner_change_log rather than joining desk_ticket_agents,
  // which only the slow live-Zoho /tickets/{id}/metrics phase populates
  // (see the module doc comment at the top of this file). `agentNames`
  // maps each requested email to the display name Zoho's own audit log
  // uses for that person -- without it, log lines can't be attributed
  // back to an email, so these fields (and the breakdowns) stay at their
  // zero/empty defaults, same graceful behavior as before this change.
  const nameToEmail = new Map();
  for (const [email, name] of Object.entries(agentNames || {})) {
    if (name && byEmail[email]) nameToEmail.set(String(name).trim().toLowerCase(), email);
  }
  // Session 26: the full monitored-T1-agent name set, for deciding
  // whether a hop leaving this agent crosses to a different team
  // ("transferred") or stays inside T1 ("reassigned", for the receiver
  // only). Deliberately NOT the same thing as nameToEmail above, which is
  // scoped to just the agents THIS call requested -- e.g. the one agent
  // on the self-service My Stats page -- so it would otherwise treat
  // every T1 colleague not in that scope as "a different team". Callers
  // pass the full roster in explicitly; falls back to nameToEmail's own
  // names so behavior degrades gracefully if one doesn't.
  const rosterNameSet = new Set(
    (rosterNames && rosterNames.length ? rosterNames : Array.from(nameToEmail.keys()))
      .map((n) => String(n).trim().toLowerCase())
  );
  const classify = await staffGroupClassifier(); // Session 43
  if (nameToEmail.size) {
    const nameById = await agentNameById(); // Session 54
    const ownerRows = await all(
      `SELECT s.ticket_id AS ticket_id, s.owner_change_log AS log, s.assignee_name AS assignee_name,
              s.created_by_id AS created_by_id,
              s.status_type AS status_type,
              s.channel AS channel, s.module AS module,
              COALESCE(NULLIF(s.manual_category,''), NULLIF(s.ai_category,'')) AS category,
              s.classification AS classification
         FROM desk_ticket_snapshot s
        WHERE s.created_time BETWEEN ? AND ?${cwS.clause}`,
      [from, to, ...cwS.params]
    );
    for (const row of ownerRows) {
      // Session 54: effectiveOwnerChain() also covers a ticket with no
      // audit log at all (the current assignee becomes the only owner, as
      // the old fallback did), a missing last hop, and a T1 creator who
      // assigned the ticket straight to another team.
      const chain = effectiveOwnerChain(row, { nameById, rosterNameSet, classify });
      const entries = chain.individual;
      if (!entries.length) continue;
      const isClosed = row.status_type === 'Closed';
      const hitIdxByEmail = new Map();
      entries.forEach((e, idx) => {
        const email = nameToEmail.get(e.name.trim().toLowerCase());
        if (!email) return;
        if (!hitIdxByEmail.has(email)) hitIdxByEmail.set(email, []);
        hitIdxByEmail.get(email).push(idx);
      });
      for (const [email, idxs] of hitIdxByEmail) {
        const agent = byEmail[email];
        agent.unique_tickets++;

        for (const [bucket, val] of [
          ['channel', row.channel], ['module', row.module],
          ['category', row.category], ['classification', row.classification],
        ]) {
          const key = val || 'Unknown';
          agent[bucket][key] = (agent[bucket][key] || 0) + 1;
        }

        // Session 26 redefinition, per Sebastin: these four no longer
        // move together off one "entries.length" check -- each is its own
        // read of where this agent sits in the ticket's real (queue-hops
        // and Unassigned already excluded by individualOwnerEntries())
        // owner sequence.

        // Solely handled: this agent is the ONLY individual owner this
        // ticket ever had, and it's Closed -- "once ticket assigned to
        // that agent, agent closed by the same agent". Unique no longer
        // implies this: a reassigned ticket is unique but not solely
        // handled.
        if (entries.length === 1 && isClosed) agent.solely_handled++;

        // Reassigned: a DIFFERENT individual owned it immediately before
        // this agent's first appearance -- it came to them from someone
        // else, not from the client-created-ticket/queue routing (already
        // filtered out). Checked once per agent, off their first
        // occurrence only, so a ticket bounced back to the same agent
        // later doesn't re-count it.
        const firstIdx = idxs[0];
        const prev = entries[firstIdx - 1];
        if (prev && prev.name.trim().toLowerCase() !== entries[firstIdx].name.trim().toLowerCase()) {
          agent.reassigned++;
        }

        // Transferred: this agent handed it to a DIFFERENT individual who
        // is NOT one of our own monitored T1 agents -- "to a different
        // agent of other team". Checked off their LAST occurrence, so
        // only the hop that actually leaves this agent's hands counts.
        //
        // Handed off internally (Session 26.1, Sebastin's follow-up):
        // when that different individual IS one of our own T1 agents --
        // stayed inside the team, not a real team transfer -- it's its
        // own separate count rather than either "transferred" (wrong,
        // it never left T1) or invisible (loses real activity). The
        // receiver still gets "reassigned" for their own first-appearance
        // check above, independent of this.
        // Session 43: the next hop may be a person OR a team queue, and
        // is grouped generically (T1/T2/VoIP/CSM/Pod/T3-Dev/Other) via
        // AditKB's staff directory + Zoho teams -- see
        // staffGroupClassifier(). Any T1 destination (a monitored agent or
        // any other T1 CS team member, e.g. a lead) is an internal
        // hand-off, never a transfer.
        const agentNameLower = entries[idxs[idxs.length - 1]].name.trim().toLowerCase();
        const next = nextHopAfterAgent(chain.full, agentNameLower);
        if (next) {
          const grp = rosterNameSet.has(next.name.trim().toLowerCase()) ? 'T1' : classify(next);
          if (grp !== 'T1') {
            agent.transferred++;
            agent.departments_transferred[grp] = (agent.departments_transferred[grp] || 0) + 1;
          } else {
            agent.handed_off_internal++;
          }
        }
      }
    }
  }

  const cwPlain = custWhere('');
  const closedRows = await all(
    `SELECT assignee_email AS email, COUNT(*) AS n,
            AVG( (julianday(closed_time) - julianday(created_time)) * 24 ) AS avg_hours
       FROM desk_ticket_snapshot
      WHERE assignee_email IN (${placeholders})
        AND status_type = 'Closed' AND closed_time BETWEEN ? AND ?${cwPlain.clause}
      GROUP BY assignee_email`,
    [...emails, from, to, ...cwPlain.params]
  );
  for (const r of closedRows) if (byEmail[r.email]) {
    byEmail[r.email].closed_count = r.n;
    byEmail[r.email].avg_handle_hours = r.avg_hours != null ? Math.round(r.avg_hours * 10) / 10 : null;
  }

  const currentRows = await all(
    `SELECT assignee_email AS email, COUNT(*) AS n
       FROM desk_ticket_snapshot
      WHERE assignee_email IN (${placeholders}) AND status_type != 'Closed'${cwPlain.clause}
      GROUP BY assignee_email`,
    [...emails, ...cwPlain.params]
  );
  for (const r of currentRows) if (byEmail[r.email]) byEmail[r.email].currently_handling = r.n;

  // Session 40: prefers Zoho Analytics' own "Is First Call Resolution"
  // flag (zoho_is_fcr, synced by server.js's runFcrAnalyticsSync() --
  // see analytics-service.js's fetchTicketFcrRows() for why that's now
  // the ground truth) over the reconstructed resolution_business_hours
  // <= 24h AND reopen_count = 0 rule, which stays only as a fallback for
  // a ticket the sync hasn't reached yet (zoho_is_fcr IS NULL) so FCR%
  // doesn't just go blank for not-yet-synced tickets during rollout.
  const fcrRows = await all(
    `SELECT assignee_email AS email,
            SUM(CASE
                  WHEN zoho_is_fcr IS NOT NULL THEN zoho_is_fcr
                  WHEN resolution_business_hours IS NOT NULL
                       AND resolution_business_hours <= 24
                       AND COALESCE(reopen_count, 0) = 0
                      THEN 1 ELSE 0 END) AS fcr_yes,
            COUNT(*) AS fcr_total
       FROM desk_ticket_snapshot
      WHERE assignee_email IN (${placeholders})
        AND status_type = 'Closed' AND closed_time BETWEEN ? AND ?${cwPlain.clause}
      GROUP BY assignee_email`,
    [...emails, from, to, ...cwPlain.params]
  );
  for (const r of fcrRows) if (byEmail[r.email]) {
    byEmail[r.email].fcr_yes = r.fcr_yes || 0;
    byEmail[r.email].fcr_total = r.fcr_total || 0;
    byEmail[r.email].fcr_pct = r.fcr_total ? Math.round((r.fcr_yes / r.fcr_total) * 1000) / 10 : null;
  }

  // Session 20 CSAT: filtered by Survey Time (when the customer actually
  // rated it), not ticket Closed Time -- confirmed with Sebastin this
  // should match whichever date range is selected the same way FCR
  // matches on Closed Time, just against the survey's own timestamp
  // instead, since a survey can be submitted well after (or, if the
  // ticket was reopened, even before) the ticket's own closed_time.
  // Scoped via the ticket's owning agent (assignee_email), not the
  // survey row's own Department field, per Sebastin ("T1 agent owner
  // ticket related surveys").
  const csatRows = await all(
    `SELECT s.assignee_email AS email,
            SUM(CASE WHEN sv.rating = 'Good' THEN 1 ELSE 0 END) AS csat_good,
            COUNT(sv.rating) AS csat_total
       FROM desk_ticket_survey sv
       JOIN desk_ticket_snapshot s ON s.ticket_id = sv.ticket_id
      WHERE s.assignee_email IN (${placeholders}) AND sv.survey_time BETWEEN ? AND ?${cwS.clause}
      GROUP BY s.assignee_email`,
    [...emails, from, to, ...cwS.params]
  );
  for (const r of csatRows) if (byEmail[r.email]) {
    byEmail[r.email].csat_good = r.csat_good || 0;
    byEmail[r.email].csat_total = r.csat_total || 0;
    byEmail[r.email].csat_pct = r.csat_total ? Math.round((r.csat_good / r.csat_total) * 1000) / 10 : null;
  }

  // Session 42: "tickets handled" (replied / commented / took ownership
  // inside the window) -- the headline ticket number that replaces agents'
  // manual logging. See agentHandledTickets(). Split into new (ticket
  // created inside the window) vs follow-up (older ticket worked again).
  const handled = await agentHandledTickets({ emails, agentNames, from, to });
  const allIds = new Set();
  for (const h of Object.values(handled)) for (const id of h.handled) allIds.add(id);
  const meta = await ticketMetaByIds([...allIds], custTerm);
  const fromIso = toIsoZ(from), toIso = toIsoZ(to);
  const activityReady = await activityCovers(from);
  for (const [email, h] of Object.entries(handled)) {
    const a = byEmail[email];
    if (!a) continue;
    let total = 0, isNew = 0, replied = 0, commented = 0, owned = 0, assist = 0;
    for (const id of h.handled) {
      if (custTerm && !meta.has(id)) continue; // customer search active and this ticket doesn't match
      total++;
      const m = meta.get(id);
      if (isAssist(h, id, m, email)) assist++;
      const created = m && m.created_time ? toIsoZ(m.created_time) : null;
      if (created && created >= fromIso && created < toIso) isNew++;
      if (h.replied.has(id)) replied++;
      if (h.commented.has(id)) commented++;
      if (h.owned.has(id)) owned++;
    }
    a.tickets_handled = total;
    a.tickets_handled_new = isNew;
    a.tickets_handled_followup = total - isNew;
    a.tickets_replied = replied;
    a.tickets_commented = commented;
    a.tickets_owned = owned;
    a.tickets_assist = assist; // Session 51: call notes on someone else's ticket
    a.tickets_handled_ready = activityReady;
  }

  return Object.values(byEmail);
}

/** Session 42: ticket_id -> { ticket_number, subject, created_time, status,
 *  channel, account_name, web_url } for a set of ids, chunked to stay under
 *  SQLite's parameter limit. With `custTerm`, only tickets matching that
 *  customer search are returned. */
/** Session 51: an "assist" is a ticket the agent only left a comment on
 *  (typically a call note, e.g. Greg on #400350) without replying, without
 *  owning it in the window, and without being its current owner. It still
 *  counts in "tickets handled"; this just makes that work visible on its own. */
function isAssist(h, id, m, email) {
  if (!h.commented.has(id) || h.replied.has(id) || h.owned.has(id)) return false;
  const owner = String((m && m.assignee_email) || '').toLowerCase();
  return !owner || owner !== String(email || '').toLowerCase();
}

async function ticketMetaByIds(ids, custTerm) {
  const out = new Map();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map(() => '?').join(',');
    const custClause = custTerm ? ` AND (contact_name LIKE ? OR contact_email LIKE ? OR account_name LIKE ?)` : '';
    const rows = await all(
      `SELECT ticket_id, ticket_number, subject, created_time, closed_time, status, status_type, channel,
              account_name, contact_name, web_url, assignee_name, assignee_email
         FROM desk_ticket_snapshot WHERE ticket_id IN (${ph})${custClause}`,
      [...chunk, ...(custTerm ? [custTerm, custTerm, custTerm] : [])]
    );
    for (const r of rows) out.set(r.ticket_id, r);
  }
  return out;
}

/** Recent tickets an agent has touched, for the self-service Agent View
 *  drill-down table. */
/**
 * Session 24 rebuild: was a JOIN against desk_ticket_agents, which (like
 * the old unique/solely-handled/reassigned fields in agentSummary()) is
 * only populated by the slow, rate-limited live Zoho /tickets/{id}/metrics
 * phase -- so "Recent tickets" on My Stats was only ever showing the
 * sliver of tickets that phase had reached. Rewritten to parse
 * owner_change_log the same way agentSummary() does, so this list covers
 * every ticket this agent's name appears on, matching the numbers above
 * it. `agentName` is this agent's Zoho display name (see
 * deskLifecycleAgentRoster() / the my-summary route in server.js) --
 * without it nothing can be attributed and this returns []. `q` is the
 * same optional company/contact/email search the admin summary supports.
 */
async function agentTicketList({ email, from, to, limit = 200, q, agentName }) {
  if (!agentName) return [];
  const nameLower = String(agentName).trim().toLowerCase();
  const custTerm = q && String(q).trim() ? `%${String(q).trim()}%` : null;
  const custClause = custTerm ? ` AND (contact_name LIKE ? OR contact_email LIKE ? OR account_name LIKE ?)` : '';
  const params = [from, to];
  if (custTerm) params.push(custTerm, custTerm, custTerm);
  const rows = await all(
    `SELECT ticket_id, ticket_number, subject, status, status_type, channel,
            classification, COALESCE(NULLIF(manual_category,''), NULLIF(ai_category,'')) AS category,
            module, resolution_business_hours, reopen_count, zoho_is_fcr,
            owner_change_log, assignee_name, created_by_id, created_time, closed_time,
            department_name, assignee_email, web_url
       FROM desk_ticket_snapshot
      WHERE created_time BETWEEN ? AND ?${custClause}
      ORDER BY created_time DESC`,
    params
  );
  const out = [];
  const listCtx = { nameById: await agentNameById(), classify: await staffGroupClassifier() }; // Session 54
  for (const row of rows) {
    // Session 26: filtered the same way agentSummary() now is (queue/pod
    // "Role : Team" hops and "Unassigned" excluded), so this list and its
    // reassign_count agree with the summary numbers above it.
    const entries = effectiveOwnerChain(row, listCtx).individual;
    if (!entries.length) continue;
    if (!entries.some((e) => e.name.trim().toLowerCase() === nameLower)) continue;
    // Session 40: same zoho_is_fcr-preferred rule as agentSummary()'s FCR%
    // query -- see its comment -- so a ticket's fcr_achieved shown here
    // never disagrees with whether that ticket counted toward the card.
    const fcrAchieved = row.zoho_is_fcr != null
      ? !!row.zoho_is_fcr
      : (row.resolution_business_hours != null && row.resolution_business_hours <= 24 && (row.reopen_count || 0) === 0);
    out.push({
      ticket_id: row.ticket_id, ticket_number: row.ticket_number, subject: row.subject,
      status: row.status, status_type: row.status_type, channel: row.channel,
      classification: row.classification, category: row.category, module: row.module,
      fcr_achieved: fcrAchieved ? 'true' : 'false',
      resolution_business_hours: row.resolution_business_hours, reopen_count: row.reopen_count,
      // Total real handoff count from the filtered log (entries.length - 1
      // owner-change events, queue/pod and Unassigned hops already
      // excluded) -- ticket-level, not agent-specific.
      reassign_count: entries.length > 1 ? entries.length - 1 : 0,
      created_time: row.created_time, closed_time: row.closed_time,
      department_name: row.department_name, assignee_email: row.assignee_email, web_url: row.web_url,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Session 34: per-ticket drill-down for the "Verify tickets" view --
 * returns the exact tickets counted toward ONE metric for ONE agent over
 * ONE period, reusing the identical query/classification logic
 * agentSummary() uses for its aggregate counts, so the row count here
 * always equals that card's number (the whole point: someone with a
 * conflicting manual count, like Sabrina's 13 vs the card's 7, can see
 * precisely which tickets the system counted and open each one in real
 * Zoho Desk via its web_url to check by hand).
 *
 * Different metrics are scoped by different date fields, matching how
 * agentSummary() already computes them -- this is NOT a simplification,
 * it's what makes the row count agree with the card:
 *   - unique / solely_handled / reassigned / transferred /
 *     handed_off_internal -> ticket CREATED time (owner_change_log walk)
 *   - closed / fcr                                -> ticket CLOSED time
 *   - csat                                         -> SURVEY time
 *   - currently_handling                           -> no date field at
 *     all, a live snapshot, same as the card
 */
async function agentTicketsForMetric({ metric, from, to, email, agentName, rosterNames, q, limit = 500 }) {
  const custTerm = q && String(q).trim() ? `%${String(q).trim()}%` : null;
  const rosterNameSet = new Set((rosterNames || []).map((n) => String(n).trim().toLowerCase()));
  const nameLower = agentName ? String(agentName).trim().toLowerCase() : null;

  // Session 42: drill-down for the "Tickets handled" card and its
  // new/follow-up/replied/commented/owned sub-counts -- built from the
  // exact same agentHandledTickets() + ticketMetaByIds() calls
  // agentSummary() uses, so the list length always equals the card.
  const handledFamily = new Set(['handled', 'handled_new', 'handled_followup', 'replied', 'commented', 'owned', 'assist']);
  if (handledFamily.has(metric)) {
    if (!email) return [];
    const emailLc = String(email).toLowerCase();
    const agentNames = agentName ? { [emailLc]: agentName } : {};
    const h = (await agentHandledTickets({ emails: [emailLc], agentNames, from, to }))[emailLc];
    const meta = await ticketMetaByIds([...h.handled], custTerm);
    const fromIso = toIsoZ(from), toIso = toIsoZ(to);
    const rows = [];
    for (const id of h.handled) {
      if (custTerm && !meta.has(id)) continue;
      const m = meta.get(id) || { ticket_id: id };
      const created = m.created_time ? toIsoZ(m.created_time) : null;
      const isNew = !!(created && created >= fromIso && created < toIso);
      if (metric === 'handled_new' && !isNew) continue;
      if (metric === 'handled_followup' && isNew) continue;
      if (metric === 'replied' && !h.replied.has(id)) continue;
      if (metric === 'commented' && !h.commented.has(id)) continue;
      if (metric === 'owned' && !h.owned.has(id)) continue;
      if (metric === 'assist' && !isAssist(h, id, m, emailLc)) continue;
      rows.push({
        ...m, ticket_id: id, is_new: isNew,
        replied: h.replied.has(id), commented: h.commented.has(id), owned: h.owned.has(id), assist: isAssist(h, id, m, emailLc),
      });
    }
    rows.sort((a, b) => String(b.created_time || '').localeCompare(String(a.created_time || '')));
    return rows; // never truncated: the list must always equal the card's count
  }

  const ownerFamily = new Set(['unique', 'solely_handled', 'reassigned', 'transferred', 'handed_off_internal']);
  if (ownerFamily.has(metric)) {
    if (!nameLower) return [];
    const classify = await staffGroupClassifier(); // Session 43
    const custClause = custTerm ? ` AND (contact_name LIKE ? OR contact_email LIKE ? OR account_name LIKE ?)` : '';
    const params = [from, to];
    if (custTerm) params.push(custTerm, custTerm, custTerm);
    const rows = await all(
      `SELECT ticket_id, ticket_number, subject, status, status_type, channel,
              classification, COALESCE(NULLIF(manual_category,''), NULLIF(ai_category,'')) AS category,
              module, resolution_business_hours, reopen_count,
              owner_change_log, assignee_name, created_by_id, created_time, closed_time,
              department_name, assignee_email, web_url
         FROM desk_ticket_snapshot
        WHERE created_time BETWEEN ? AND ?${custClause}
        ORDER BY created_time DESC`,
      params
    );
    const out = [];
    const nameById = await agentNameById(); // Session 54
    for (const row of rows) {
      const chain = effectiveOwnerChain(row, { nameById, rosterNameSet, classify });
      const entries = chain.individual;
      if (!entries.length) continue;
      const idxs = [];
      entries.forEach((e, idx) => { if (e.name.trim().toLowerCase() === nameLower) idxs.push(idx); });
      if (!idxs.length) continue;

      // Same per-agent classification agentSummary() computes off this
      // agent's first/last appearance in the ticket's filtered owner
      // sequence -- see the comments on that loop for the reasoning.
      const isClosed = row.status_type === 'Closed';
      const solelyHandled = entries.length === 1 && isClosed;
      const firstIdx = idxs[0];
      const prev = entries[firstIdx - 1];
      const reassigned = !!(prev && prev.name.trim().toLowerCase() !== entries[firstIdx].name.trim().toLowerCase());
      // Session 43: identical rule to agentSummary() -- see its comment.
      const next = nextHopAfterAgent(chain.full, nameLower);
      let transferred = false;
      let handedOffInternal = false;
      let transferredTo = null;
      if (next) {
        const grp = rosterNameSet.has(next.name.trim().toLowerCase()) ? 'T1' : classify(next);
        if (grp !== 'T1') { transferred = true; transferredTo = grp; }
        else handedOffInternal = true;
      }
      const flags = {
        unique: true, solely_handled: solelyHandled, reassigned,
        transferred, handed_off_internal: handedOffInternal,
      };
      if (!flags[metric]) continue;

      out.push({
        ticket_id: row.ticket_id, ticket_number: row.ticket_number, subject: row.subject,
        status: row.status, status_type: row.status_type, channel: row.channel,
        classification: row.classification, category: row.category, module: row.module,
        created_time: row.created_time, closed_time: row.closed_time,
        department_name: row.department_name, assignee_name: row.assignee_name,
        assignee_email: row.assignee_email, web_url: row.web_url,
        flags, transferred_to: transferredTo,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  if (metric === 'closed' || metric === 'fcr') {
    if (!email) return [];
    const custClause = custTerm ? ` AND (contact_name LIKE ? OR contact_email LIKE ? OR account_name LIKE ?)` : '';
    const params = [email, from, to];
    if (custTerm) params.push(custTerm, custTerm, custTerm);
    const rows = await all(
      `SELECT ticket_id, ticket_number, subject, status, status_type, channel,
              classification, COALESCE(NULLIF(manual_category,''), NULLIF(ai_category,'')) AS category,
              module, resolution_business_hours, reopen_count, zoho_is_fcr,
              created_time, closed_time, department_name, assignee_name, assignee_email, web_url
         FROM desk_ticket_snapshot
        WHERE assignee_email = ? AND status_type = 'Closed' AND closed_time BETWEEN ? AND ?${custClause}
        ORDER BY closed_time DESC
        LIMIT ?`,
      [...params, limit]
    );
    // Session 40: same zoho_is_fcr-preferred rule as agentSummary()'s FCR%
    // query -- see its comment.
    return rows.map(({ zoho_is_fcr, ...row }) => ({
      ...row,
      fcr_achieved: zoho_is_fcr != null
        ? !!zoho_is_fcr
        : (row.resolution_business_hours != null && row.resolution_business_hours <= 24 && (row.reopen_count || 0) === 0),
    }));
  }

  if (metric === 'csat') {
    if (!email) return [];
    const rows = await all(
      `SELECT s.ticket_id AS ticket_id, s.ticket_number AS ticket_number, s.subject AS subject,
              s.status AS status, s.status_type AS status_type, s.channel AS channel,
              s.created_time AS created_time, s.closed_time AS closed_time,
              s.department_name AS department_name, s.assignee_name AS assignee_name,
              s.assignee_email AS assignee_email, s.web_url AS web_url,
              sv.rating AS rating, sv.survey_time AS survey_time
         FROM desk_ticket_survey sv
         JOIN desk_ticket_snapshot s ON s.ticket_id = sv.ticket_id
        WHERE s.assignee_email = ? AND sv.survey_time BETWEEN ? AND ?
        ORDER BY sv.survey_time DESC
        LIMIT ?`,
      [email, from, to, limit]
    );
    return rows;
  }

  if (metric === 'currently_handling') {
    if (!email) return [];
    const rows = await all(
      `SELECT ticket_id, ticket_number, subject, status, status_type, channel,
              created_time, closed_time, department_name, assignee_name, assignee_email, web_url
         FROM desk_ticket_snapshot
        WHERE assignee_email = ? AND status_type != 'Closed'
        ORDER BY created_time DESC
        LIMIT ?`,
      [email, limit]
    );
    return rows;
  }

  return [];
}

async function syncStatus() {
  const lastSyncAt   = await getSyncState('last_sync_at');
  const lastError    = await getSyncState('last_error');
  const ticketCount  = await get(`SELECT COUNT(*) AS n FROM desk_ticket_snapshot`);
  const agentRowCount = await get(`SELECT COUNT(*) AS n FROM desk_ticket_agents`);
  const csatLastSyncAt = await getSyncState('csat_last_sync_at');
  const csatLastError  = await getSyncState('csat_last_error');
  const surveyCount = await get(`SELECT COUNT(*) AS n FROM desk_ticket_survey`);
  // Session 21: per-ticket metrics failures (the /tickets/{id}/metrics
  // call, which is what populates desk_ticket_agents) were previously
  // only console.warn'd -- invisible outside Railway's own logs, so a
  // metrics call failing on every single ticket (leaving eventsTracked
  // stuck at 0) could go unnoticed indefinitely. Surfaced here instead.
  const lastMetricsError = await getSyncState('last_metrics_error');
  const lastMetricsErrorCount = await getSyncState('last_metrics_error_count');
  // Session 40: FCR Analytics sync visibility -- see server.js's
  // runFcrAnalyticsSync().
  const fcrLastSyncAt = await getSyncState('fcr_last_sync_at');
  const fcrLastError = await getSyncState('fcr_last_error');
  const fcrBackfillComplete = (await getSyncState('fcr_backfill_complete')) === '1';
  const fcrSyncedCount = await get(`SELECT COUNT(*) AS n FROM desk_ticket_snapshot WHERE zoho_is_fcr IS NOT NULL`);
  return {
    lastSyncAt: lastSyncAt || null,
    lastError: lastError || null,
    ticketsTracked: ticketCount ? ticketCount.n : 0,
    eventsTracked: agentRowCount ? agentRowCount.n : 0, // kept as "eventsTracked" for the existing admin UI field name
    lastMetricsError: lastMetricsError || null,
    lastMetricsErrorCount: lastMetricsErrorCount ? Number(lastMetricsErrorCount) : 0,
    csatLastSyncAt: csatLastSyncAt || null,
    csatLastError: csatLastError || null,
    surveysTracked: surveyCount ? surveyCount.n : 0,
    fcrLastSyncAt: fcrLastSyncAt || null,
    fcrLastError: fcrLastError || null,
    fcrBackfillComplete,
    fcrTicketsSynced: fcrSyncedCount ? fcrSyncedCount.n : 0,
    activity: await ticketActivityStatus(), // Session 42: "tickets handled" source
    staffDirectory: { // Session 43: transfer grouping source
      people: ((await get(`SELECT COUNT(*) AS n FROM staff_directory`)) || {}).n || 0,
      syncedAt: (await getSyncState('staff_directory_synced_ms')) ? new Date(Number(await getSyncState('staff_directory_synced_ms'))).toISOString() : null,
      lastError: await getSyncState('staff_directory_error'),
    },
  };
}

/** Session 52: "why is / isn't this ticket in my list?" for one agent,
 *  one ticket and one period. Works from the same stored data the counts
 *  use (desk_ticket_snapshot + desk_ticket_activity), and optionally a live
 *  Zoho read (`live`: { ticket, threads, comments }) passed in by the caller,
 *  so it can say "Zoho has your comment, the sync hasn't caught up yet".
 *  Returns { ticket, checks:[{key,label,included,reason}], events:[], sync }. */
async function explainTicketForAgent({ ticketNumber, email, agentName, from, to, live = null }) {
  const emailLc = String(email || '').toLowerCase();
  const nameLc = String(agentName || '').trim().toLowerCase();
  const fromIso = toIsoZ(from), toIso = toIsoZ(to);
  const inWin = (iso) => !!(iso && iso >= fromIso && iso < toIso);
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CST' : '';

  const snap = await get(`SELECT * FROM desk_ticket_snapshot WHERE ticket_number = ? LIMIT 1`, [String(ticketNumber)]);
  const lt = live && live.ticket;
  const ticketId = (snap && snap.ticket_id) || (lt && lt.id) || null;
  if (!snap && !lt) {
    return { found: false, reason: `Ticket #${ticketNumber} was not found in the synced data or in Zoho Desk. Check the number, or it may be in a department this tool does not read.` };
  }
  const ticket = {
    id: ticketId,
    number: String(ticketNumber),
    subject: (snap && snap.subject) || (lt && lt.subject) || '',
    status: (lt && lt.status) || (snap && snap.status) || '',
    createdTime: toIsoZ((snap && snap.created_time) || (lt && lt.createdTime)),
    closedTime: toIsoZ((lt && lt.closedTime) || (snap && snap.closed_time)),
    ownerEmail: String((lt && lt.assignee && (lt.assignee.emailId || lt.assignee.email)) || (snap && snap.assignee_email) || '').toLowerCase(),
    ownerName: (lt && lt.assignee && [lt.assignee.firstName, lt.assignee.lastName].filter(Boolean).join(' ')) || (snap && snap.assignee_name) || '',
    url: (snap && snap.web_url) || (lt && lt.webUrl) || null,
    department: (lt && lt.department && lt.department.name) || null,
  };

  // Stored activity (what the counts are built from)
  const stored = ticketId ? await all(`SELECT source, created_time FROM desk_ticket_activity WHERE ticket_id = ? AND author_email = ? ORDER BY created_time`, [String(ticketId), emailLc]) : [];
  const storedReplies = stored.filter(a => a.source === 'thread').map(a => a.created_time);
  const storedComments = stored.filter(a => a.source === 'comment').map(a => a.created_time);

  // Ownership from the owner-change log (stored copy, else live custom field)
  const ownerLog = (snap && snap.owner_change_log) || (lt && lt.customFields && lt.customFields['Owner Change Log']) || '';
  const ownerHops = individualOwnerEntries(ownerLog).map(e => ({ name: e.name, at: chicagoWallClockToIso(e.at), role: e.role }));
  const myOwnerHops = nameLc ? ownerHops.filter(h => h.name.trim().toLowerCase() === nameLc) : [];
  // Session 54: the same effective chain the lifecycle counts use (adds a
  // missing last hop and a T1 creator who assigned it straight out).
  const classifyX = await staffGroupClassifier();
  const chainX = effectiveOwnerChain({
    owner_change_log: ownerLog,
    assignee_name: ticket.ownerName || (snap && snap.assignee_name) || '',
    created_by_id: (snap && snap.created_by_id) || (lt && lt.createdBy) || null,
  }, { nameById: await agentNameById(), classify: classifyX, rosterNameSet: new Set(nameLc ? [nameLc] : []) });
  const myVirtual = nameLc ? chainX.individual.filter(e => e.virtual && e.name.trim().toLowerCase() === nameLc) : [];

  // Live activity (Zoho right now)
  const liveReplies = [], liveComments = [];
  if (live) {
    for (const t of live.threads || []) {
      const a = String((t.author && (t.author.email || t.author.emailId)) || '').toLowerCase();
      if (a === emailLc && String(t.direction || '').toLowerCase() === 'out') liveReplies.push(toIsoZ(t.createdTime));
    }
    for (const c of live.comments || []) {
      const a = String((c.commenter && c.commenter.email) || '').toLowerCase();
      if (a === emailLc) liveComments.push(toIsoZ(c.commentedTime));
    }
  }

  const events = [];
  for (const t of storedReplies) events.push({ type: 'reply', at: t, counted: true });
  for (const t of storedComments) events.push({ type: 'comment', at: t, counted: true });
  for (const t of liveReplies) if (!storedReplies.some(x => Math.abs(Date.parse(x) - Date.parse(t)) < 120000)) events.push({ type: 'reply', at: t, counted: false, pending: true });
  for (const t of liveComments) if (!storedComments.some(x => Math.abs(Date.parse(x) - Date.parse(t)) < 120000)) events.push({ type: 'comment', at: t, counted: false, pending: true });
  for (const h of myOwnerHops) events.push({ type: 'owner', at: h.at, counted: true, role: h.role });
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const winEvents = events.filter(e => inWin(e.at));
  const countedInWin = winEvents.filter(e => e.counted);
  const pendingInWin = winEvents.filter(e => e.pending);
  const label = { reply: 'a reply', comment: 'a comment', owner: 'ownership' };
  const checks = [];

  // Tickets handled
  let hReason;
  if (countedInWin.length) hReason = `Counted: you have ${countedInWin.map(e => label[e.type] + ' on ' + fmt(e.at)).join(', ')} inside this period.`;
  else if (pendingInWin.length) hReason = `Not counted yet: Zoho shows ${pendingInWin.map(e => label[e.type] + ' on ' + fmt(e.at)).join(', ')}, but the activity sync has not picked it up. It usually lands within 15 to 20 minutes and will count automatically.`;
  else if (events.length) {
    const first = events[0], last = events[events.length - 1];
    hReason = `Not counted: your activity on this ticket (${events.map(e => label[e.type] + ' on ' + fmt(e.at)).slice(0, 4).join(', ')}) is outside the selected period. Change the period to ${last.at < fromIso ? 'an earlier range' : 'a later range'} to see it.`;
    if (first && !first.at) hReason = 'Not counted: the activity time could not be read.';
  } else if (!snap) hReason = 'Not counted: this ticket has not been synced into the tool yet (new tickets arrive within about 20 minutes), and Zoho shows no reply, comment or ownership by you.';
  else if (ticket.ownerEmail === emailLc) hReason = `Not counted yet: you are the current owner, but there is no reply or comment from you${live ? ' (checked in Zoho live too)' : ''}, and Zoho's owner log has no entry handing it to you (this happens when a ticket is created and assigned in one step). It counts as soon as you reply or add a comment.`;
  else hReason = `Not counted: no reply, comment or ownership by you was found on this ticket${live ? ' (checked in Zoho live too)' : ''}. Only your own replies, comments (including private call notes) and times you became the owner count.`;
  const handled = countedInWin.length > 0;
  checks.push({ key: 'handled', label: 'Tickets handled', included: handled, reason: hReason });

  // New vs follow-up
  if (handled) {
    const isNew = inWin(ticket.createdTime);
    checks.push({ key: isNew ? 'handled_new' : 'handled_followup', label: isNew ? 'New tickets' : 'Follow-ups', included: true,
      reason: isNew ? `The ticket was also created in this period (${fmt(ticket.createdTime)}).` : `The ticket was created earlier (${fmt(ticket.createdTime)}), so it counts as a follow-up.` });
  }
  const repliedIn = countedInWin.some(e => e.type === 'reply');
  const commentedIn = countedInWin.some(e => e.type === 'comment');
  const ownedIn = countedInWin.some(e => e.type === 'owner');
  checks.push({ key: 'replied', label: 'Replied to', included: repliedIn, reason: repliedIn ? 'You sent a reply in this period.' : 'No outgoing reply from you in this period (incoming customer emails do not count).' });
  checks.push({ key: 'commented', label: 'Commented on', included: commentedIn, reason: commentedIn ? 'You added a comment in this period.' : 'No comment from you in this period.' });
  checks.push({ key: 'owned', label: 'Took ownership', included: ownedIn, reason: ownedIn ? 'The owner log shows it was assigned to you in this period.' : (myOwnerHops.length ? `You were owner on ${fmt(myOwnerHops[myOwnerHops.length - 1].at)}, outside this period.` : (ticket.ownerEmail === emailLc ? 'You are the current owner, but the owner log has no entry assigning it to you, so ownership alone does not count it.' : 'The owner log never shows you as owner.')) });
  const assist = commentedIn && !repliedIn && !ownedIn && ticket.ownerEmail !== emailLc;
  checks.push({ key: 'assist', label: 'Call notes on others\' tickets', included: assist,
    reason: assist ? `Only a comment from you, and the owner is ${ticket.ownerName || 'someone else'}.` : (commentedIn ? 'You also replied, owned it, or you are the owner, so it is not an assist.' : 'No comment from you in this period.') });

  // Unique (owner history, by created date)
  const inHistory = myOwnerHops.length > 0;
  const uniq = inHistory && inWin(ticket.createdTime);
  checks.push({ key: 'unique', label: 'Unique tickets', included: uniq,
    reason: uniq ? 'You appear in the owner history and the ticket was created in this period.' : (!inHistory ? 'You never appear in the owner history (a comment alone does not add you).' : `You are in the owner history, but the ticket was created ${fmt(ticket.createdTime)}, outside this period. Unique counts by created date.`) });

  // Transferred (Session 54)
  {
    const inChain = nameLc && chainX.individual.some(e => e.name.trim().toLowerCase() === nameLc);
    const next = inChain ? nextHopAfterAgent(chainX.full, nameLc) : null;
    const grp = next ? classifyX(next) : null;
    const transferred = !!(next && grp !== 'T1' && inWin(ticket.createdTime));
    const viaCreator = myVirtual.some(e => e.virtual === 'creator');
    let reason;
    if (!inChain) reason = 'You never owned or created this ticket, so it cannot be your transfer.';
    else if (!next) reason = 'You are the last owner, so it has not been handed on.';
    else if (grp === 'T1') reason = `It went to ${next.name}, who is in T1, so it counts as an internal hand-off, not a transfer.`;
    else if (!inWin(ticket.createdTime)) reason = `It went to ${next.name} (${grp}), but the ticket was created ${fmt(ticket.createdTime)}, outside this period. Transfers count by created date.`;
    else reason = `Counted: it went from you to ${next.name} (${grp})${viaCreator ? '. You created it and assigned it out directly, which Zoho\'s owner log does not record, so the creator is used' : ''}.`;
    checks.push({ key: 'transferred', label: 'Transferred', included: transferred, reason });
  }

  // Closed / FCR (current owner, by closed date)
  const isOwner = ticket.ownerEmail === emailLc;
  const closedIn = isOwner && /closed/i.test(ticket.status) && inWin(ticket.closedTime);
  checks.push({ key: 'closed', label: 'Closed', included: closedIn,
    reason: closedIn ? `You are the owner and it closed on ${fmt(ticket.closedTime)}.` : (!isOwner ? `Closed and FCR count for the current owner only (now ${ticket.ownerName || ticket.ownerEmail || 'unassigned'}).` : (!/closed/i.test(ticket.status) ? `It is still ${ticket.status || 'open'}.` : `It closed on ${fmt(ticket.closedTime)}, outside this period.`)) });

  const status = await ticketActivityStatus().catch(() => ({}));
  return { found: true, ticket, checks, events: events.map(e => ({ ...e, inPeriod: inWin(e.at), when: fmt(e.at) })), inSnapshot: !!snap, liveChecked: !!live,
    sync: { lastActivitySync: status.lastSyncAt || null, snapshotSyncedAt: snap ? snap.synced_at : null } };
}

module.exports = {
  upsertSurveyRow,
  setDB, initSchema,
  getSyncState, setSyncState,
  cacheAgent, getCachedAgent,
  upsertTicketSnapshot,
  upsertZohoFcrFields,
  getStoredMetricsWatermark, getMetricsRefreshCandidates, updateTicketMetrics, replaceTicketAgents,
  agentSummary, agentTicketList, agentTicketsForMetric, syncStatus, explainTicketForAgent, effectiveOwnerChain, agentNameById,
  upsertTicketActivityRows, agentHandledTickets, ticketActivityStatus, chicagoWallClockToIso, activityCovers,
  replaceStaffDirectory, staffGroupClassifier, groupFromZohoTeam, groupFromAditTeam, nextHopAfterAgent,
};
