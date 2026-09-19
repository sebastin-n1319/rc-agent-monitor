/**
 * AditKB warehouse client for historical RingCentral call data (Session 23).
 *
 * Companion to lib/aditkb-service.js (which mirrors desk_tickets) -- this
 * one reads `shiv_rc_call_json`, AditKB's raw per-extension RingCentral
 * call-log mirror (confirmed via table_detail: 1.3M+ rows, PK rc_call_id,
 * a `call_log_json` jsonb column holding the exact same record shape RC's
 * own /call-log API returns -- verified by sampling a live row and
 * comparing its fields (id/to/from/legs/direction/result/startTime/...)
 * against what rc-service.js's fetchCallLogs() already parses).
 *
 * Only `shiv_rc_call_json` was put in scope for this key -- deliberately
 * not `shiv_rc_calls` (a CRM/deal-linked sales-intelligence table, not a
 * complete call mirror) or `shiv_rc_call_parties` (not needed; every
 * field the app's aggregation logic reads is already inside
 * call_log_json's own `legs`/`from`/`to`).
 *
 * The REST API's advertised "cheap" filter_on list only names
 * rc_call_id, but filtering on j_extension_id + j_start_time was
 * empirically verified (via mcp__AditKB__run_sql and direct curl) to
 * work correctly and return promptly -- see server.js runAditkbCallsSync()
 * which relies on exactly that combination to pull one agent's one month
 * of calls per request.
 *
 * Auth: a key scoped to exactly `public.shiv_rc_call_json`, created via
 * the AditKB self-service portal, stored as the ADITKB_CALLS_API_KEY env
 * var (separate from ADITKB_API_KEY, which is scoped to desk_tickets only
 * -- least-privilege, one key per table family).
 */

const ADITKB_BASE = 'https://aditkb-production.up.railway.app';
const TABLE = 'shiv_rc_call_json';

// call_log_json carries everything parseCallDetails()/inferAgentScopedDirection()
// in rc-service.js need (legs, from, to, direction, result, startTime, duration) --
// the flat j_* columns are only pulled alongside it for cheap sanity-checking /
// filtering, not because the aggregation logic reads them directly.
const SELECT_COLUMNS = ['rc_call_id', 'j_extension_id', 'j_start_time', 'call_log_json'];

function isConfigured() {
  return !!process.env.ADITKB_CALLS_API_KEY;
}

async function apiGet(path, { filters = [], ...params } = {}) {
  const url = new URL(ADITKB_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, String(v));
  }
  for (const f of filters) url.searchParams.append('filter', f);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.ADITKB_CALLS_API_KEY}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`AditKB ${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * One page of a single extension's OUTBOUND calls within [fromIso, toIso).
 *
 * IMPORTANT -- this only ever returns Outbound-direction rows, and that's
 * deliberate, not a missing feature: AditKB's flattened `j_extension_id`
 * column is NULL on every Inbound-direction row in this table (verified
 * via mcp__AditKB__run_sql -- a queue-routed inbound call's own top-level
 * record carries no extension, only its nested `legs[]` do, one leg per
 * hop: customer -> IVR -> queue -> the agent(s) who were rung). Filtering
 * this table by j_extension_id can therefore only ever find the calls an
 * extension INITIATED. Use fetchInboundCallsPage() below for the inbound
 * side, which finds the answering agent by scanning legs instead.
 *
 * Ordered by j_start_time so pagination is stable and deterministic even
 * if new rows land mid-sweep (they'd sort after whatever offset we're
 * currently at, never shifting already-seen rows backward).
 */
async function fetchExtensionCallsPage({ extensionId, fromIso, toIso, offset = 0, limit = 2000 }) {
  const data = await apiGet(`/v1/tables/${TABLE}/rows`, {
    select: SELECT_COLUMNS.join(','),
    order_by: 'j_start_time',
    desc: false,
    limit, offset,
    filters: [
      `j_extension_id:eq:${extensionId}`,
      `j_direction:eq:Outbound`,
      `j_start_time:gte:${fromIso}`,
      `j_start_time:lt:${toIso}`,
    ],
  });
  const rows = data.rows || [];
  return { rows, truncated: !!data.truncated, rowCount: data.row_count ?? rows.length };
}

/**
 * One page of ALL Inbound-direction calls org-wide within [fromIso, toIso)
 * -- not scoped to any one extension, since (see above) inbound rows carry
 * no extension_id to filter on. The caller is expected to scan each row's
 * call_log_json.legs[] to figure out which monitored agent, if any,
 * actually answered it. Inbound volume is a small fraction of this
 * table's total (~8% in a spot check -- the bulk is an outbound sales
 * dialer), so pulling it in full per month is a few pages, not the whole
 * table.
 */
async function fetchInboundCallsPage({ fromIso, toIso, offset = 0, limit = 2000 }) {
  const data = await apiGet(`/v1/tables/${TABLE}/rows`, {
    select: SELECT_COLUMNS.join(','),
    order_by: 'j_start_time',
    desc: false,
    limit, offset,
    filters: [
      `j_direction:eq:Inbound`,
      `j_start_time:gte:${fromIso}`,
      `j_start_time:lt:${toIso}`,
    ],
  });
  const rows = data.rows || [];
  return { rows, truncated: !!data.truncated, rowCount: data.row_count ?? rows.length };
}

module.exports = { isConfigured, fetchExtensionCallsPage, fetchInboundCallsPage, SELECT_COLUMNS };
