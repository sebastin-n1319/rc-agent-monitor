/**
 * AditKB client for Zoho Desk ticket ACTIVITY (Session 42).
 *
 * Reads two AditKB warehouse tables -- desk_ticket_threads (replies) and
 * desk_ticket_comments (comments, incl. private call notes) -- so the app
 * can count "tickets handled" per agent per day: every ticket an agent
 * replied to, commented on, or took ownership of. This is what replaces
 * agents' manual ticket logging.
 *
 * Why AditKB and not live Zoho: AditKB re-syncs a ticket's threads and
 * comments within ~8 min (median) / ~17 min (p95) of the ticket changing
 * (measured against desk_tickets.modified_time vs bodies_synced_at over a
 * week), and serves any time range in a few requests, where Zoho's own API
 * would need 2 calls per ticket.
 *
 * Only metadata columns are requested -- never message bodies/content.
 *
 * Auth: a key scoped to desk_ticket_threads + desk_ticket_comments (AditKB
 * "restricted_text" group), created in the AditKB portal and stored as the
 * ADITKB_ACTIVITY_API_KEY env var. Kept separate from ADITKB_API_KEY
 * (desk_tickets) and ADITKB_CALLS_API_KEY -- one key per table family.
 */

const ADITKB_BASE = 'https://aditkb-production.up.railway.app';

const THREAD_COLUMNS = ['ticket_id', 'thread_index', 'author_email', 'direction', 'created_time'];
const COMMENT_COLUMNS = ['ticket_id', 'comment_index', 'author_email', 'created_time'];

function isConfigured() {
  return !!process.env.ADITKB_ACTIVITY_API_KEY;
}

/** Same AditKB REST quirk documented in lib/aditkb-service.js: a `gte`
 *  timestamp bound whose own UTC date is *today* silently returns zero
 *  rows. Never send one -- clamp to the start of yesterday instead. The
 *  caller's own window logic stays correct since upserts are idempotent. */
function clampLowerBound(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const now = new Date();
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (ms < startOfTodayUtc) return new Date(ms).toISOString();
  return new Date(startOfTodayUtc - 24 * 3600 * 1000).toISOString();
}

async function apiGet(path, { filters = [], ...params } = {}) {
  const url = new URL(ADITKB_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, String(v));
  }
  for (const f of filters) url.searchParams.append('filter', f);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.ADITKB_ACTIVITY_API_KEY}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`AditKB ${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * One page of rows from `table` ('desk_ticket_threads' | 'desk_ticket_comments')
 * with created_time in [fromIso, toIso) -- toIso optional (open-ended).
 * Ordered by created_time so offset paging is stable.
 */
async function fetchActivityPage({ table, fromIso, toIso = null, offset = 0, limit = 2000 }) {
  const isThreads = table === 'desk_ticket_threads';
  const filters = [`created_time:gte:${clampLowerBound(fromIso)}`];
  if (toIso) filters.push(`created_time:lt:${new Date(Date.parse(toIso)).toISOString()}`);
  if (isThreads) filters.push('direction:eq:out');
  const data = await apiGet(`/v1/tables/${table}/rows`, {
    select: (isThreads ? THREAD_COLUMNS : COMMENT_COLUMNS).join(','),
    order_by: 'created_time',
    desc: false,
    limit, offset,
    filters,
  });
  const rows = data.rows || [];
  return { rows, truncated: !!data.truncated, rowCount: data.row_count ?? rows.length };
}

module.exports = { isConfigured, fetchActivityPage, clampLowerBound };
