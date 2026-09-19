/**
 * Chat (Zoho SalesIQ) Lifecycle Tracking (Session 21).
 *
 * Same pattern as lib/desk-lifecycle.js -- fully separate tables/module,
 * shares the app's single sqlite handle via setDB(). See
 * lib/salesiq-service.js for the underlying API client and why no new
 * Zoho credentials were needed.
 *
 * Two independent things are tracked here, because SalesIQ's REST API
 * exposes them very differently:
 *
 *   - Chat COUNT and average response time come from /conversations,
 *     which IS a full historical log (any date range, paginated). This
 *     module syncs it into chat_conversation_snapshot on a timer (like
 *     desk_ticket_snapshot), so arbitrary-range queries are fast local
 *     reads instead of live API calls.
 *
 *   - Chat AVAIL / BUSY time totals have no historical source at all --
 *     /operators only returns each operator's status *right now*. So
 *     this module polls /operators on a short interval and logs status
 *     *changes* into chat_presence_events, exactly like rc-service.js
 *     does for RingCentral call-queue presence. This means avail/busy
 *     time only starts accumulating from whenever this ships; there is
 *     no way to backfill it.
 *
 * Tables:
 *   chat_operators          -- operator_id -> email/name cache
 *   chat_presence_events    -- operator status changes over time
 *   chat_conversation_snapshot -- one row per synced SalesIQ conversation
 *   chat_sync_state         -- simple key/value watermark store
 */
let _db = null;
function setDB(db) { _db = db; }

const run = (sql, params = []) =>
  new Promise((res, rej) => _db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
const get = (sql, params = []) =>
  new Promise((res, rej) => _db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const all = (sql, params = []) =>
  new Promise((res, rej) => _db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

const salesiq = require('./salesiq-service');

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS chat_operators (
    operator_id TEXT PRIMARY KEY,
    email       TEXT,
    name        TEXT,
    updated_at  TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS chat_presence_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id   TEXT NOT NULL,
    operator_email TEXT,
    status        TEXT NOT NULL,
    timestamp     TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chat_presence_operator_time ON chat_presence_events(operator_id, timestamp)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chat_presence_email ON chat_presence_events(operator_email)`);

  await run(`CREATE TABLE IF NOT EXISTS chat_conversation_snapshot (
    conversation_id   TEXT PRIMARY KEY,
    attender_id       TEXT,
    attender_email    TEXT,
    attender_name     TEXT,
    department_name   TEXT,
    status             TEXT,
    chat_status_label TEXT,
    start_time        TEXT,
    attended_time     TEXT,
    end_time          TEXT,
    response_seconds  INTEGER,
    synced_at         TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chat_snap_attender ON chat_conversation_snapshot(attender_email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_chat_snap_start    ON chat_conversation_snapshot(start_time)`);

  await run(`CREATE TABLE IF NOT EXISTS chat_sync_state (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

async function getSyncState(key) {
  const row = await get(`SELECT value FROM chat_sync_state WHERE key = ?`, [key]);
  return row ? row.value : null;
}
async function setSyncState(key, value) {
  await run(
    `INSERT INTO chat_sync_state (key, value, updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    [key, value == null ? null : String(value)]
  );
}

async function upsertOperatorCache(operatorId, email, name) {
  if (!operatorId) return;
  await run(
    `INSERT INTO chat_operators (operator_id, email, name, updated_at) VALUES (?,?,?,datetime('now'))
     ON CONFLICT(operator_id) DO UPDATE SET email=excluded.email, name=excluded.name, updated_at=excluded.updated_at`,
    [operatorId, email || null, name || null]
  );
}

// Derives one status label per operator from the raw /operators payload.
// "Offline" (not logged into the SalesIQ operator app at all) wins over
// whatever chat status they last set, since a stale "Available"/"Busy"
// from before they logged out isn't meaningful. Otherwise uses their own
// status_message (Available/Busy/Away/...) verbatim.
function deriveOperatorStatus(op) {
  const online = (op.availability && op.availability.status) || 'Offline';
  if (String(online).toLowerCase() === 'offline') return 'Offline';
  return op.status_message || 'Unknown';
}

// ── Presence polling (live snapshot -> change log) ─────────────────────
async function syncChatPresenceOnce() {
  if (!salesiq.isConfigured()) return { skipped: true };
  const operators = await salesiq.fetchOperators();
  let changed = 0;
  for (const op of operators) {
    const operatorId = op.id;
    if (!operatorId) continue;
    const email = (op.email_id || '').toLowerCase() || null;
    const name = op.nick_name || [op.first_name, op.last_name].filter(Boolean).join(' ') || null;
    await upsertOperatorCache(operatorId, email, name);
    const status = deriveOperatorStatus(op);
    const last = await get(
      `SELECT status FROM chat_presence_events WHERE operator_id = ? ORDER BY datetime(timestamp) DESC LIMIT 1`,
      [operatorId]
    );
    if (!last || last.status !== status) {
      await run(
        `INSERT INTO chat_presence_events (operator_id, operator_email, status) VALUES (?,?,?)`,
        [operatorId, email, status]
      );
      changed++;
    }
  }
  return { operators: operators.length, changed };
}

// Timeline-diff the same way database.js's getAgentSummary() does for RC
// presence: walk status-change events across [from,to), carrying in the
// last known status from before `from` as the starting segment, and sum
// seconds per status.
async function agentChatPresenceStats({ email, from, to }) {
  const emailLc = (email || '').toLowerCase();
  if (!emailLc) return { availSeconds: 0, busySeconds: 0, awaySeconds: 0, offlineSeconds: 0 };
  const events = await all(
    `SELECT status, timestamp FROM chat_presence_events WHERE operator_email = ? AND datetime(timestamp) >= datetime(?) AND datetime(timestamp) < datetime(?) ORDER BY datetime(timestamp) ASC`,
    [emailLc, from, to]
  );
  const previousEvent = await get(
    `SELECT status, timestamp FROM chat_presence_events WHERE operator_email = ? AND datetime(timestamp) < datetime(?) ORDER BY datetime(timestamp) DESC LIMIT 1`,
    [emailLc, from]
  );
  const segments = [];
  if (previousEvent) segments.push({ status: previousEvent.status, timestamp: from });
  segments.push(...events);
  if (!segments.length) return { availSeconds: 0, busySeconds: 0, awaySeconds: 0, offlineSeconds: 0 };

  const toDate = new Date(Math.min(Date.now(), new Date(to).getTime()));
  const totals = { Available: 0, Busy: 0, Away: 0, Offline: 0 };
  for (let i = 0; i < segments.length; i++) {
    const start = new Date(segments[i].timestamp);
    const end = i < segments.length - 1 ? new Date(segments[i + 1].timestamp) : toDate;
    if (!(end > start)) continue;
    const dur = (end - start) / 1000;
    const key = ['Available', 'Busy', 'Away', 'Offline'].includes(segments[i].status) ? segments[i].status : null;
    if (key) totals[key] += dur;
  }
  return {
    availSeconds: Math.round(totals.Available),
    busySeconds: Math.round(totals.Busy),
    awaySeconds: Math.round(totals.Away),
    offlineSeconds: Math.round(totals.Offline),
  };
}

// ── Conversation sync (fully historical, synced locally for speed) ─────
function upsertConversationSnapshot(c) {
  const startMs = c.start_time ? Number(c.start_time) : null;
  const attendedMs = c.attended_time ? Number(c.attended_time) : null;
  const endMs = c.end_time ? Number(c.end_time) : null;
  const responseSeconds = (startMs && attendedMs && attendedMs >= startMs) ? Math.round((attendedMs - startMs) / 1000) : null;
  return run(
    `INSERT INTO chat_conversation_snapshot
      (conversation_id, attender_id, attender_email, attender_name, department_name, status, chat_status_label, start_time, attended_time, end_time, response_seconds, synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(conversation_id) DO UPDATE SET
        attender_id=excluded.attender_id, attender_email=excluded.attender_email, attender_name=excluded.attender_name,
        department_name=excluded.department_name, status=excluded.status, chat_status_label=excluded.chat_status_label,
        start_time=excluded.start_time, attended_time=excluded.attended_time, end_time=excluded.end_time,
        response_seconds=excluded.response_seconds, synced_at=datetime('now')`,
    [
      c.id,
      c.attender ? c.attender.id : null,
      c.attender ? (c.attender.email || '').toLowerCase() : null,
      c.attender ? c.attender.name : null,
      c.department ? c.department.name : null,
      c.status || null,
      c.chat_status ? c.chat_status.label : null,
      startMs ? new Date(startMs).toISOString() : null,
      attendedMs ? new Date(attendedMs).toISOString() : null,
      endMs ? new Date(endMs).toISOString() : null,
      responseSeconds,
    ]
  );
}

// Conversations come back NEWEST-first from the API regardless of the
// from_time/to_time bounds passed, and this portal's real volume turns
// out to be large (4000+ conversations confirmed live in a 90-day
// window, org-wide across every department) -- far more than fits in
// one sync tick. That combination means a naive "page forward from a
// low watermark until caught up" approach would never finish: new chats
// keep landing at the front faster than a capped page budget can work
// through the backlog behind them, so the old backlog is never reached.
//
// Fixed with two independent, resumable phases instead:
//   - Top-up: small, incremental, walks FORWARD from the newest
//     fully-synced conversation up to now. Cheap every tick since it's
//     just "what's new since last time".
//   - Backfill: walks BACKWARD in time from wherever it last stopped
//     (shrinking the `to_time` upper bound each tick) toward the lookback
//     floor. Because the upper bound only ever shrinks, this makes real
//     progress every tick no matter how many new conversations arrive at
//     the front -- it's immune to the problem above. Marked complete via
//     'backfill_complete' once it reaches the floor or an empty page.
async function paginateAndUpsert({ fromTimeMs, toTimeMs, maxPages, pageSize, trackMax = false, trackMin = false }) {
  let index = 1, pages = 0, seen = 0, more = true;
  let maxSeen = null, minSeen = null;
  while (more && pages < maxPages) {
    const page = await salesiq.fetchConversationsPage({ fromTimeMs, toTimeMs, index, limit: pageSize });
    for (const c of page.conversations) {
      await upsertConversationSnapshot(c);
      seen++;
      const st = Number(c.start_time);
      if (st) {
        if (trackMax && (maxSeen == null || st > maxSeen)) maxSeen = st;
        if (trackMin && (minSeen == null || st < minSeen)) minSeen = st;
      }
    }
    more = page.moreDataAvailable && page.conversations.length > 0;
    pages++;
    index++;
  }
  return { pages, conversationsSeen: seen, caughtUp: !more, maxSeen, minSeen };
}

async function runChatConversationSync({ maxPagesPerPhase = 15, pageSize = 100, initialLookbackDays = 90 } = {}) {
  if (!salesiq.isConfigured()) return { skipped: true };
  const now = Date.now();
  const floorMs = now - initialLookbackDays * 24 * 3600 * 1000;

  // Phase 1: top-up (forward, small, cheap every tick).
  const storedSyncedThrough = await getSyncState('synced_through_ms');
  const syncedThrough = storedSyncedThrough ? Number(storedSyncedThrough) : floorMs;
  const topUp = await paginateAndUpsert({
    fromTimeMs: syncedThrough, toTimeMs: now,
    maxPages: maxPagesPerPhase, pageSize, trackMax: true,
  });
  if (topUp.caughtUp) {
    await setSyncState('synced_through_ms', String(now));
  } else if (topUp.maxSeen != null) {
    await setSyncState('synced_through_ms', String(topUp.maxSeen));
  }

  // Phase 2: backfill (backward, resumable, immune to new arrivals).
  const backfillDone = await getSyncState('backfill_complete');
  let backfill = { pages: 0, conversationsSeen: 0 };
  if (backfillDone !== '1') {
    const storedBackfilledTo = await getSyncState('backfilled_to_ms');
    const toBound = storedBackfilledTo ? Number(storedBackfilledTo) : now;
    backfill = await paginateAndUpsert({
      fromTimeMs: floorMs, toTimeMs: toBound,
      maxPages: maxPagesPerPhase, pageSize, trackMin: true,
    });
    if (backfill.minSeen == null || backfill.minSeen - 1 <= floorMs) {
      await setSyncState('backfill_complete', '1');
    } else {
      await setSyncState('backfilled_to_ms', String(backfill.minSeen - 1));
    }
  }

  return {
    topUp: { pages: topUp.pages, conversationsSeen: topUp.conversationsSeen },
    backfill: { pages: backfill.pages, conversationsSeen: backfill.conversationsSeen, complete: (await getSyncState('backfill_complete')) === '1' },
  };
}

async function agentChatStats({ email, from, to }) {
  const emailLc = (email || '').toLowerCase();
  if (!emailLc) return { chatCount: 0, avgResponseSeconds: null };
  const row = await get(
    `SELECT COUNT(*) AS n, AVG(response_seconds) AS avgResp
     FROM chat_conversation_snapshot
     WHERE attender_email = ? AND start_time >= ? AND start_time < ?`,
    [emailLc, from, to]
  );
  return {
    chatCount: row ? (row.n || 0) : 0,
    avgResponseSeconds: row && row.avgResp != null ? Math.round(row.avgResp) : null,
  };
}

async function status() {
  const lastError = await getSyncState('last_error');
  const conversationCount = await get(`SELECT COUNT(*) AS n FROM chat_conversation_snapshot`);
  const presenceEventCount = await get(`SELECT COUNT(*) AS n FROM chat_presence_events`);
  const syncedThrough = await getSyncState('synced_through_ms');
  const backfilledTo = await getSyncState('backfilled_to_ms');
  const backfillComplete = await getSyncState('backfill_complete');
  return {
    configured: salesiq.isConfigured(),
    lastError: lastError || null,
    conversationsTracked: conversationCount ? conversationCount.n : 0,
    presenceEventsTracked: presenceEventCount ? presenceEventCount.n : 0,
    conversationsSyncedThrough: syncedThrough ? new Date(Number(syncedThrough)).toISOString() : null,
    backfillComplete: backfillComplete === '1',
    backfilledBackTo: backfilledTo ? new Date(Number(backfilledTo)).toISOString() : null,
  };
}

module.exports = {
  setDB, initSchema,
  getSyncState, setSyncState,
  syncChatPresenceOnce, agentChatPresenceStats,
  runChatConversationSync, agentChatStats,
  status,
};
