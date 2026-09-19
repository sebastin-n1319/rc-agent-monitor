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
       contact_name, contact_email, account_name, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
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
       account_name=excluded.account_name, synced_at=excluded.synced_at`,
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
    ]
  );
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
async function agentSummary({ from, to, emails, q }) {
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
      closed_count: 0, avg_handle_hours: null,
      currently_handling: 0,
      fcr_yes: 0, fcr_total: 0, fcr_pct: null,
      csat_good: 0, csat_total: 0, csat_pct: null,
      channel: {}, module: {}, category: {}, classification: {},
    };
  }

  const cwS = custWhere('s');
  const uniqueRows = await all(
    `SELECT dta.agent_email AS email, COUNT(*) AS n
       FROM desk_ticket_agents dta JOIN desk_ticket_snapshot s ON s.ticket_id = dta.ticket_id
      WHERE dta.agent_email IN (${placeholders}) AND s.created_time BETWEEN ? AND ?${cwS.clause}
      GROUP BY dta.agent_email`,
    [...emails, from, to, ...cwS.params]
  );
  for (const r of uniqueRows) if (byEmail[r.email]) byEmail[r.email].unique_tickets = r.n;

  const soleRows = await all(
    `SELECT dta.agent_email AS email, COUNT(*) AS n
       FROM desk_ticket_agents dta JOIN desk_ticket_snapshot s ON s.ticket_id = dta.ticket_id
      WHERE dta.agent_email IN (${placeholders}) AND s.created_time BETWEEN ? AND ?
        AND (SELECT COUNT(*) FROM desk_ticket_agents d2 WHERE d2.ticket_id = dta.ticket_id) = 1${cwS.clause}
      GROUP BY dta.agent_email`,
    [...emails, from, to, ...cwS.params]
  );
  for (const r of soleRows) if (byEmail[r.email]) byEmail[r.email].solely_handled = r.n;

  const reassignedRows = await all(
    `SELECT dta.agent_email AS email, COUNT(*) AS n
       FROM desk_ticket_agents dta JOIN desk_ticket_snapshot s ON s.ticket_id = dta.ticket_id
      WHERE dta.agent_email IN (${placeholders}) AND s.created_time BETWEEN ? AND ?
        AND s.reassign_count > 0${cwS.clause}
      GROUP BY dta.agent_email`,
    [...emails, from, to, ...cwS.params]
  );
  for (const r of reassignedRows) if (byEmail[r.email]) byEmail[r.email].reassigned = r.n;

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

  const fcrRows = await all(
    `SELECT assignee_email AS email,
            SUM(CASE WHEN resolution_business_hours IS NOT NULL
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

  async function breakdown(column, bucket) {
    const rows = await all(
      `SELECT dta.agent_email AS email, ${column} AS k, COUNT(*) AS n
         FROM desk_ticket_agents dta JOIN desk_ticket_snapshot s ON s.ticket_id = dta.ticket_id
        WHERE dta.agent_email IN (${placeholders}) AND s.created_time BETWEEN ? AND ?${cwS.clause}
        GROUP BY dta.agent_email, ${column}`,
      [...emails, from, to, ...cwS.params]
    );
    for (const r of rows) {
      if (!byEmail[r.email]) continue;
      const key = r.k || 'Unknown';
      byEmail[r.email][bucket][key] = (byEmail[r.email][bucket][key] || 0) + r.n;
    }
  }
  await breakdown('s.channel', 'channel');
  await breakdown('s.module', 'module');
  await breakdown(`COALESCE(NULLIF(s.manual_category,''), NULLIF(s.ai_category,''))`, 'category');
  await breakdown('s.classification', 'classification');

  return Object.values(byEmail);
}

/** Recent tickets an agent has touched, for the self-service Agent View
 *  drill-down table. */
async function agentTicketList({ email, from, to, limit = 200 }) {
  return all(
    `SELECT s.ticket_id, s.ticket_number, s.subject, s.status, s.status_type, s.channel,
            s.classification, COALESCE(NULLIF(s.manual_category,''), NULLIF(s.ai_category,'')) AS category,
            s.module,
            CASE WHEN s.resolution_business_hours IS NOT NULL
                   AND s.resolution_business_hours <= 24
                   AND COALESCE(s.reopen_count, 0) = 0
                  THEN 'true' ELSE 'false' END AS fcr_achieved,
            s.resolution_business_hours, s.reopen_count,
            s.reassign_count, s.created_time, s.closed_time,
            s.department_name, s.assignee_email, s.web_url
       FROM desk_ticket_agents dta JOIN desk_ticket_snapshot s ON s.ticket_id = dta.ticket_id
      WHERE dta.agent_email = ? AND s.created_time BETWEEN ? AND ?
      ORDER BY s.created_time DESC
      LIMIT ?`,
    [email, from, to, limit]
  );
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
  };
}

module.exports = {
  upsertSurveyRow,
  setDB, initSchema,
  getSyncState, setSyncState,
  cacheAgent, getCachedAgent,
  upsertTicketSnapshot,
  getStoredMetricsWatermark, updateTicketMetrics, replaceTicketAgents,
  agentSummary, agentTicketList, syncStatus,
};
