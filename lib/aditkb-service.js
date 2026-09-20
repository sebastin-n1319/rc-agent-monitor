/**
 * AditKB warehouse client (Session 22).
 *
 * Adit's internal Supabase-backed read-only data warehouse mirrors Zoho
 * Desk's `desk_tickets` table in real time (verified via random sample:
 * 100% match against live Zoho). Our own two-phase Zoho-polling sync
 * (the old runDeskLifecycleSync in server.js) could only ever crawl a
 * few hundred tickets forward per tick, so a true full backfill of
 * 300k+ tickets would have taken days. AditKB exposes the same data
 * over a scoped REST API, so this module replaces live Zoho
 * ticket-search polling as the snapshot data source entirely, per
 * Sebastin's explicit instruction ("switch to supabase for all possible
 * things"). Zoho's own /tickets/{id}/metrics call is kept as the sole
 * remaining live-Zoho source, since per-agent handling-time breakdown
 * isn't in AditKB's warehouse -- see runAditkbSnapshotSync() and the
 * metrics phase of runDeskLifecycleSync() in server.js.
 *
 * Auth: a key scoped to exactly `public.desk_tickets`, created via the
 * AditKB self-service portal (https://aditkb-production.up.railway.app/portal),
 * stored as the ADITKB_API_KEY env var.
 */

const ADITKB_BASE = 'https://aditkb-production.up.railway.app';
const TABLE = 'desk_tickets';

// Only the columns our snapshot / manual-category / FCR logic actually
// reads -- ~40 out of the table's 273, so every page moves a fraction
// of what pulling every column (or the full /export) would.
const SELECT_COLUMNS = [
  'id', 'ticket_number', 'subject', 'status', 'status_type', 'priority', 'channel',
  'department_id', 'j_department_id', 'j_department_name', 'j_team_id', 'j_team_name',
  'j_assignee_id', 'assignee_email', 'assignee_name',
  'comment_count', 'thread_count', 'created_time', 'closed_time', 'j_onhold_time',
  'due_date', 'web_url', 'modified_time', 'j_classification', 'category',
  'cf_adit_app_module', 'cf_ai_category_by_llm', 'cf_department_classification', 'cf_fcr_achieved',
  'contact_first_name', 'contact_last_name', 'email', 'contact_account_name',
  'cf_cs_category', 'cf_ts_category', 'cf_vo_ip_category', 'cf_product_categories',
  'cf_offboarding_category', 'cf_implementation_category', 'cf_billing_categories',
  'cf_patient_forms_category', 'cf_porting_category', 'cf_phone_order_return_category', 'cf_csm_category',
  // Session 24: Zoho's own ticket-owner audit trail and reopen counter --
  // already bulk-synced here, so Ticket Lifecycle's unique/solely-handled/
  // reassigned/transferred fields (and FCR's reopen check) no longer have
  // to wait on the slow, rate-limited live /tickets/{id}/metrics phase.
  // See upsertAditkbRow() in server.js and agentSummary() in
  // lib/desk-lifecycle.js.
  'cf_owner_change_log', 'cf_reopen_count', 'cf_ticket_reassigned_time',
];

function isConfigured() {
  return !!process.env.ADITKB_API_KEY;
}

/**
 * Session 32: AditKB's `/v1/tables/{table}/rows` filter endpoint has a
 * confirmed bug on this table -- a `modified_time:gte:X` filter silently
 * returns ZERO rows whenever X's calendar date (UTC) is "today", even
 * though those exact rows come back correctly via a `gte` bound dated
 * yesterday-or-earlier (which still includes today's rows in the RESULT
 * set -- only the *bound's own date* matters, not the rows it should
 * match) and via a raw SQL query against the same table. Confirmed by
 * hand: gte:2026-09-20T00:00:00Z -> 0 rows; gte:2026-09-19T23:00:00Z ->
 * correct rows including several from 2026-09-20.
 *
 * This silently broke incremental sync the moment its watermark first
 * advanced into "today" (i.e. after the first successful sync each day)
 * -- not a 20-minute lag as the UI's sync banner implies, a full stop
 * until AditKB fixes it or the watermark's date rolls to "yesterday" on
 * its own tomorrow. It's what was actually behind an agent's same-day
 * tickets staying invisible on the Ticket Lifecycle pages regardless of
 * how many sync ticks (or manual "Sync Now" clicks, which hit this same
 * path) had run.
 *
 * Workaround: never send AditKB a bound whose date is today -- clamp it
 * to the start of yesterday (UTC) instead. The real watermark
 * (aditkb_synced_through_ms in server.js) still advances correctly off
 * whatever modified_time the returned rows actually have; this only
 * widens the query window actually sent. Confirmed cheap on this table
 * (~150 rows for a 24h window), trivial next to the 2000-row page /
 * 15-page tick budget -- remove this once AditKB's side is fixed.
 */
function clampFilterBoundToNotToday(iso) {
  const boundMs = Date.parse(iso);
  if (Number.isNaN(boundMs)) return iso;
  const now = new Date();
  const startOfTodayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (boundMs < startOfTodayUtcMs) return iso; // already not-today, nothing to work around
  return new Date(startOfTodayUtcMs - 24 * 3600 * 1000).toISOString();
}

async function apiGet(path, params = {}) {
  const url = new URL(ADITKB_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) { for (const item of v) url.searchParams.append(k, item); }
    else url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.ADITKB_API_KEY}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`AditKB ${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * One page of desk_tickets rows.
 * - Backfill mode (no modifiedSinceIso): orders by `id` (indexed) and
 *   pages via offset -- a stable, deterministic full sweep regardless
 *   of how many rows change mid-backfill.
 * - Incremental mode (modifiedSinceIso set): filters
 *   modified_time >= watermark and orders by modified_time ascending,
 *   so each tick only asks for what's actually changed since last time
 *   and offset can stay at 0 (the window itself shrinks as rows are
 *   consumed within a tick, see server.js).
 */
async function fetchTicketsPage({ modifiedSinceIso = null, offset = 0, limit = 2000 } = {}) {
  const params = {
    select: SELECT_COLUMNS.join(','),
    limit, offset,
    order_by: modifiedSinceIso ? 'modified_time' : 'id',
    desc: false,
  };
  if (modifiedSinceIso) params.filter = `modified_time:gte:${clampFilterBoundToNotToday(modifiedSinceIso)}`;
  const data = await apiGet(`/v1/tables/${TABLE}/rows`, params);
  const rows = data.rows || [];
  return { rows, truncated: !!data.truncated, rowCount: data.row_count ?? rows.length };
}

async function countTickets() {
  const data = await apiGet(`/v1/tables/${TABLE}/count`);
  return data.count ?? null;
}

module.exports = { isConfigured, fetchTicketsPage, countTickets, SELECT_COLUMNS };
