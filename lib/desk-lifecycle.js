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
       contact_name, contact_email, account_name, owner_change_log, reopen_count, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
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
       reopen_count=excluded.reopen_count, synced_at=excluded.synced_at`,
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
      t.owner_change_log || null, t.reopen_count ?? null,
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
  if (nameToEmail.size) {
    const ownerRows = await all(
      `SELECT s.ticket_id AS ticket_id, s.owner_change_log AS log, s.assignee_name AS assignee_name,
              s.status_type AS status_type,
              s.channel AS channel, s.module AS module,
              COALESCE(NULLIF(s.manual_category,''), NULLIF(s.ai_category,'')) AS category,
              s.classification AS classification
         FROM desk_ticket_snapshot s
        WHERE s.created_time BETWEEN ? AND ?${cwS.clause}`,
      [from, to, ...cwS.params]
    );
    for (const row of ownerRows) {
      let entries = individualOwnerEntries(row.log);
      if (!entries.length && row.assignee_name) {
        // No audit log on this ticket (predates the custom field, or it
        // was never populated) -- fall back to the current assignee as
        // the only known owner, so it still counts as unique/solely
        // handled instead of silently vanishing.
        entries = [{ name: row.assignee_name, role: null }];
      }
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
        const lastIdx = idxs[idxs.length - 1];
        const next = entries[lastIdx + 1];
        if (next && next.name.trim().toLowerCase() !== entries[lastIdx].name.trim().toLowerCase()) {
          if (!rosterNameSet.has(next.name.trim().toLowerCase())) {
            agent.transferred++;
            const dept = next.role || 'Unknown';
            agent.departments_transferred[dept] = (agent.departments_transferred[dept] || 0) + 1;
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

  return Object.values(byEmail);
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
            module, resolution_business_hours, reopen_count,
            owner_change_log, assignee_name, created_time, closed_time,
            department_name, assignee_email, web_url
       FROM desk_ticket_snapshot
      WHERE created_time BETWEEN ? AND ?${custClause}
      ORDER BY created_time DESC`,
    params
  );
  const out = [];
  for (const row of rows) {
    // Session 26: filtered the same way agentSummary() now is (queue/pod
    // "Role : Team" hops and "Unassigned" excluded), so this list and its
    // reassign_count agree with the summary numbers above it.
    let entries = individualOwnerEntries(row.owner_change_log);
    if (!entries.length && row.assignee_name) entries = [{ name: row.assignee_name, role: null }];
    if (!entries.length) continue;
    if (!entries.some((e) => e.name.trim().toLowerCase() === nameLower)) continue;
    out.push({
      ticket_id: row.ticket_id, ticket_number: row.ticket_number, subject: row.subject,
      status: row.status, status_type: row.status_type, channel: row.channel,
      classification: row.classification, category: row.category, module: row.module,
      fcr_achieved: (row.resolution_business_hours != null && row.resolution_business_hours <= 24
                     && (row.reopen_count || 0) === 0) ? 'true' : 'false',
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
  getStoredMetricsWatermark, getMetricsRefreshCandidates, updateTicketMetrics, replaceTicketAgents,
  agentSummary, agentTicketList, syncStatus,
};
