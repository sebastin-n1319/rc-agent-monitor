/**
 * Zoho Desk API client for ticket lifecycle sync (Session 19).
 *
 * Deliberately separate from the ad-hoc getZohoAccessToken()/zohoDesk()
 * helpers already in server.js (used by the existing single-ticket
 * "Ticket Intelligence" lookup feature) — this keeps the new background
 * sync fully isolated from that live feature, so a bug here can't affect
 * it and vice versa.
 *
 * Rate-limit handling mirrors rc-service.js's rcGet()/rcCall() pattern
 * from the RingCentral integration (module-level pause window, adaptive
 * backoff from response headers where Zoho provides them, else a fixed
 * default). Zoho Desk documents per-org and per-endpoint rate limits with
 * a 429 + Retry-After on exceedance — same shape as RC, same fix applies.
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

/** One page of tickets. `departmentId` scopes to a single Zoho Desk
 *  department (T1 CS) so the sync never pulls other teams' tickets. */
async function fetchTicketsPage({ departmentId, from = 0, limit = 50, sortBy = 'modifiedTime' } = {}) {
  const query = qs({ departmentId, from, limit, sortBy, include: 'assignee' });
  const data = await deskGet(`/tickets${query}`);
  return data.data || [];
}

/** One page of a single ticket's event history, newest first. `from` is
 *  an index offset (Zoho's paging model), not a timestamp. */
async function fetchTicketHistory(ticketId, { from = 0, limit = 50 } = {}) {
  const query = qs({ from, limit });
  const data = await deskGet(`/tickets/${ticketId}/History${query}`);
  return (data.data && data.data.data) || [];
}

async function fetchAgent(agentId) {
  return deskGet(`/agents/${agentId}`);
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
  fetchTicketHistory,
  fetchAgent,
  fetchDepartments,
};
