/**
 * Zoho Desk API client for ticket lifecycle sync (Session 19, rebuilt Session 20).
 *
 * Deliberately separate from the ad-hoc getZohoAccessToken()/zohoDesk()
 * helpers already in server.js (used by the existing single-ticket
 * "Ticket Intelligence" lookup feature) -- this keeps the background sync
 * fully isolated from that live feature, so a bug here can't affect it and
 * vice versa.
 *
 * Rate-limit handling mirrors rc-service.js's rcGet()/rcCall() pattern
 * from the RingCentral integration (module-level pause window, adaptive
 * backoff from response headers where Zoho provides them, else a fixed
 * default). Zoho Desk documents per-org and per-endpoint rate limits with
 * a 429 + Retry-After on exceedance -- same shape as RC, same fix applies.
 *
 * Session 20 rebuild: switched ticket discovery from GET /tickets (which
 * only sorts by dueDate/createdTime/recentThread, and doesn't return
 * classification/category/custom fields at all without a second per-ticket
 * detail call) to POST-less GET /tickets/search with modifiedTimeRange +
 * sortBy=-modifiedTime. Search returns full ticket detail -- including all
 * custom fields (`cf`) and a nested assignee object with email -- in the
 * SAME call used for pagination, so there's no more N+1 detail-fetch or
 * agent-lookup call per ticket. The old GET /tickets sync also had no
 * forward-progress across cron ticks (page 0 of the default ascending
 * sort, restarting at `from=0` every 20 minutes), which is why it was
 * stuck re-reading the same ~400 tickets from 2018 forever -- this
 * rebuild fixes that by always querying the most-recently-modified
 * tickets within a rolling window, which self-corrects every tick.
 */
const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID     || '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || '';
const ZOHO_DESK_ORG_ID   = process.env.ZOHO_DESK_ORG_ID   || '';
const ZOHO_API_BASE      = 'https://desk.zoho.com/api/v1';
const ZOHO_ACCOUNTS_URL  = 'https://accounts.zoho.com/oauth/v2/token';

const DESK_DEFAULT_PAUSE_MS = 65000;

function isConfigured() {
  return !!(ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET && ZOHO_REFRESH_TOKEN);
}

let _token = null;
let _tokenExpiry = 0;
let _rateLimitedUntil = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitMsFromHeaders(headers) {
  if (!headers || typeof headers.get !== 'function') return null;
  const raw = headers.get('Retry-After') || headers.get('X-RateLimit-Reset');
  const secs = parseInt(raw, 10);
  if (!Number.isFinite(secs) || secs <= 0) return null;
  return (secs * 1000) + 2000;
}

function markRateLimited(headers) {
  const adaptiveMs = waitMsFromHeaders(headers);
  const waitMs = adaptiveMs || DESK_DEFAULT_PAUSE_MS;
  const until = Date.now() + waitMs;
  if (until > _rateLimitedUntil) {
    _rateLimitedUntil = until;
    console.warn(`🚫 Zoho Desk rate limit — pause until ${new Date(_rateLimitedUntil).toISOString()} (${Math.round(waitMs / 1000)}s${adaptiveMs ? ', per response header' : ', default'})`);
  }
}

function getRateLimitState() {
  const remaining = _rateLimitedUntil - Date.now();
  return { paused: remaining > 0, resumesInMs: Math.max(0, remaining) };
}

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry - 60000) return _token;
  if (!isConfigured()) throw new Error('Zoho Desk not configured (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN missing)');
  const res = await fetch(ZOHO_ACCOUNTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Zoho token refresh failed: ' + JSON.stringify(data));
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _token;
}

/** Rate-limit-aware GET against the Zoho Desk API. Waits out any active
 *  pause before calling, and starts/extends a pause on 429. */
async function deskGet(pathAndQuery) {
  const pause = _rateLimitedUntil - Date.now();
  if (pause > 0) {
    console.log(`⏳ deskGet(${pathAndQuery.split('?')[0]}) waiting ${Math.ceil(pause / 1000)}s for Zoho rate-limit pause…`);
    await sleep(pause);
  }
  const token = await getAccessToken();
  const res = await fetch(`${ZOHO_API_BASE}${pathAndQuery}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      orgId: ZOHO_DESK_ORG_ID,
    },
  });
  if (res.status === 429) {
    markRateLimited(res.headers);
    const err = new Error('Zoho Desk API 429 — rate limited');
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho Desk API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function qs(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function isoRange(days) {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);
  return `${from.toISOString()},${to.toISOString()}`;
}

/** One page of tickets for a department, most-recently-modified first,
 *  with full ticket detail (classification, category, custom fields,
 *  assignee email) included -- no second per-ticket call needed.
 *  `lookbackDays` bounds the search to tickets touched in that window,
 *  which is what keeps this fast: the org has 300k+ tickets going back
 *  to 2018, and paging through all of them is neither useful (the report
 *  only ever shows a 7/30/90-day window) nor fast. */
async function fetchTicketsPage({ departmentId, from = 0, limit = 50, lookbackDays = 100 } = {}) {
  const query = qs({
    departmentId,
    from,
    limit,
    sortBy: '-modifiedTime',
    modifiedTimeRange: isoRange(lookbackDays),
  });
  const data = await deskGet(`/tickets/search${query}`);
  return (data.data && data.data.data) || [];
}

/** Per-ticket handling metrics: reassignCount, reopenCount, resolution/
 *  response times, and -- the key one -- agentsHandled, an array of every
 *  agent who touched the ticket with their individual handling time. This
 *  is what "solely handled" vs "transferred" is computed from; it's far
 *  more reliable than trying to reconstruct it from raw history events. */
async function fetchTicketMetrics(ticketId) {
  const data = await deskGet(`/tickets/${ticketId}/metrics`);
  return data.data || null;
}

/** One page of a single ticket's event history, newest first. `from` is
 *  an index offset (Zoho's paging model), not a timestamp. Kept for the
 *  optional deeper audit trail; the summary report no longer depends on
 *  this for reassignment counts (see fetchTicketMetrics). */
async function fetchTicketHistory(ticketId, { from = 0, limit = 50 } = {}) {
  const query = qs({ from, limit });
  const data = await deskGet(`/tickets/${ticketId}/History${query}`);
  return (data.data && data.data.data) || [];
}

async function fetchAgent(agentId) {
  return deskGet(`/agents/${agentId}`);
}

/** Session 20 diagnostic (temporary): raw per-ticket Customer Feedback /
 *  Happiness Rating lookup. Used once, through the admin-only debug route
 *  in server.js, to confirm the real response shape (rating field name
 *  and values, which ticket/agent it's tied to) before building the real
 *  CSAT sync against it -- CSAT is not otherwise computed anywhere in the
 *  app yet. Remove this (and the debug route) once that sync ships. */
async function fetchCustomerFeedback(ticketId) {
  return deskGet(`/customerFeedback?ticketId=${encodeURIComponent(ticketId)}`);
}

/** Session 20 diagnostic (temporary): raw passthrough GET against the
 *  Zoho Desk API for a caller-supplied path -- used to try several
 *  candidate endpoints/paths for Customer Happiness data (the exact
 *  resource name/shape isn't confirmed yet) without a redeploy per
 *  guess. `pathAndQuery` must start with '/' and is appended straight
 *  after the API base -- e.g. '/tickets/123/customerHappiness'. Remove
 *  alongside fetchCustomerFeedback once the real CSAT sync ships. */
async function fetchRaw(pathAndQuery) {
  if (!pathAndQuery || !pathAndQuery.startsWith('/')) {
    throw new Error("path must start with '/', e.g. /tickets/123/customerHappiness");
  }
  return deskGet(pathAndQuery);
}

/** All enabled departments in the org. Used when no explicit department
 *  scope is configured, so the sync covers the full ticket journey across
 *  every desk (Support, Onboarding, Insider Support, etc.) rather than a
 *  single hardcoded one. */
async function fetchDepartments() {
  const data = await deskGet('/departments?limit=200');
  const rows = data.data || [];
  return rows.filter(d => d.isEnabled !== false);
}

module.exports = {
  isConfigured,
  getRateLimitState,
  fetchTicketsPage,
  fetchTicketMetrics,
  fetchTicketHistory,
  fetchAgent,
  fetchDepartments,
  fetchCustomerFeedback,
  fetchRaw,
};
