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
  if (modifiedSinceIso) params.filter = `modified_time:gte:${modifiedSinceIso}`;
  const data = await apiGet(`/v1/tables/${TABLE}/rows`, params);
  const rows = data.rows || [];
  return { rows, truncated: !!data.truncated, rowCount: data.row_count ?? rows.length };
}

async function countTickets() {
  const data = await apiGet(`/v1/tables/${TABLE}/count`);
  return data.count ?? null;
}

module.exports = { isConfigured, fetchTicketsPage, countTickets, SELECT_COLUMNS };
