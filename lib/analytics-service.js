/**
 * Zoho Analytics API client (Session 20+), used for the real per-ticket
 * CSAT sync.
 *
 * Deliberately separate from desk-service.js and its ZOHO_CLIENT_ID /
 * ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN -- this uses its OWN self
 * client (ZOHO_SUITE_CLIENT_ID/SECRET/REFRESH_TOKEN), generated with a
 * broader multi-product scope (CRM + Desk + Analytics + SalesIQ)
 * specifically so a bug or an expired/revoked token here can never
 * affect the already-working production Desk ticket sync, and vice
 * versa. Same isolation principle as desk-service.js itself (see its
 * own file header).
 *
 * Background: the public Zoho Desk REST API v1 does NOT expose
 * per-ticket Customer Happiness / CSAT data for this org -- every
 * plausible endpoint (/customerFeedback, /happinessRatings,
 * /tickets/{id}/customerHappiness, and a full raw ticket object dump)
 * was tried live and confirmed 404 / absent (Session 20). The real data
 * only reaches this org through Zoho Analytics's own dedicated Zoho Desk
 * connector, which syncs a base table called "Survey (Zoho Desk)" into
 * the "Adit Main Workspace" -- that table is what this module reads.
 *
 * IMPORTANT timezone note: Zoho Analytics returns "Survey Time" as a
 * naive "YYYY-MM-DD HH:MM:SS" string with no timezone marker, rendered
 * in the workspace's display timezone. Empirically confirmed to be
 * America/Chicago (US Central), DST-aware: a survey row's minute:second
 * matched a Zoho Desk ticket's own (UTC) modifiedTime exactly, offset
 * by 5 hours (CDT = UTC-5) for a September date. Every row is converted
 * to a real UTC ISO timestamp below (centralWallTimeToUtcIso) before
 * being handed back, so it can be compared against the app's other
 * from/to filters -- which are always UTC ISO -- correctly.
 */
const ZOHO_SUITE_CLIENT_ID     = process.env.ZOHO_SUITE_CLIENT_ID     || '';
const ZOHO_SUITE_CLIENT_SECRET = process.env.ZOHO_SUITE_CLIENT_SECRET || '';
const ZOHO_SUITE_REFRESH_TOKEN = process.env.ZOHO_SUITE_REFRESH_TOKEN || '';
const ZOHO_ANALYTICS_ORG_ID         = process.env.ZOHO_ANALYTICS_ORG_ID         || '';
const ZOHO_ANALYTICS_WORKSPACE_ID   = process.env.ZOHO_ANALYTICS_WORKSPACE_ID   || '';
const ZOHO_ANALYTICS_SURVEY_VIEW_ID = process.env.ZOHO_ANALYTICS_SURVEY_VIEW_ID || '';

const ZOHO_ACCOUNTS_URL   = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_ANALYTICS_BASE = 'https://analyticsapi.zoho.com/restapi/v2';

const ANALYTICS_DEFAULT_PAUSE_MS = 65000;

function isConfigured() {
  return !!(ZOHO_SUITE_CLIENT_ID && ZOHO_SUITE_CLIENT_SECRET && ZOHO_SUITE_REFRESH_TOKEN
    && ZOHO_ANALYTICS_ORG_ID && ZOHO_ANALYTICS_WORKSPACE_ID && ZOHO_ANALYTICS_SURVEY_VIEW_ID);
}

let _token = null;
let _tokenExpiry = 0;
let _rateLimitedUntil = 0;

function getRateLimitState() {
  const remaining = _rateLimitedUntil - Date.now();
  return { paused: remaining > 0, resumesInMs: Math.max(0, remaining) };
}

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry - 60000) return _token;
  if (!ZOHO_SUITE_CLIENT_ID || !ZOHO_SUITE_CLIENT_SECRET || !ZOHO_SUITE_REFRESH_TOKEN) {
    throw new Error('Zoho Analytics not configured (ZOHO_SUITE_CLIENT_ID/SECRET/REFRESH_TOKEN missing)');
  }
  const res = await fetch(ZOHO_ACCOUNTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_SUITE_CLIENT_ID,
      client_secret: ZOHO_SUITE_CLIENT_SECRET,
      refresh_token: ZOHO_SUITE_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho token refresh failed: ${data.error || res.status}`);
  }
  _token = data.access_token;
  _tokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000);
  return _token;
}

/** Offset (in minutes, negative) America/Chicago has from UTC at a given
 *  UTC instant -- DST-aware. -300 during CDT, -360 during CST. */
function chicagoOffsetMinutesAt(utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asIfUtc - utcMs) / 60000);
}

/** Convert a Zoho Analytics naive "YYYY-MM-DD HH:MM:SS" wall-clock
 *  string (America/Chicago, see file header) into a real UTC ISO
 *  timestamp. */
function centralWallTimeToUtcIso(naiveLocalStr) {
  if (!naiveLocalStr) return null;
  const m = String(naiveLocalStr).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const approxUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMin = chicagoOffsetMinutesAt(approxUtcMs);
  const realUtcMs = approxUtcMs - offsetMin * 60000;
  return new Date(realUtcMs).toISOString();
}

/** Inverse of the above: given a real UTC ISO timestamp, render the
 *  America/Chicago wall-clock "YYYY-MM-DD HH:MM:SS" string Analytics'
 *  own "Survey Time" column would show for that same instant -- used to
 *  build the incremental-sync criteria filter, since that column has no
 *  timezone marker to compare a UTC value against directly. */
function utcIsoToChicagoWallTime(utcIso) {
  const utcMs = new Date(utcIso).getTime();
  if (!Number.isFinite(utcMs)) return null;
  const offsetMin = chicagoOffsetMinutesAt(utcMs);
  const d = new Date(utcMs + offsetMin * 60000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Fetch survey rows with Survey Time strictly after `sinceUtcIso` (a
 *  UTC ISO string, or null/undefined for a full pull). Returns rows with
 *  the raw Analytics fields plus `survey_time_utc` (converted, see
 *  above). */
async function fetchSurveyRows(sinceUtcIso) {
  const token = await getAccessToken();
  const config = { responseFormat: 'json' };
  if (sinceUtcIso) {
    const localStr = utcIsoToChicagoWallTime(sinceUtcIso);
    if (localStr) config.criteria = `"Survey Time" > '${localStr}'`;
  }
  const url = `${ZOHO_ANALYTICS_BASE}/workspaces/${ZOHO_ANALYTICS_WORKSPACE_ID}/views/${ZOHO_ANALYTICS_SURVEY_VIEW_ID}/data?CONFIG=${encodeURIComponent(JSON.stringify(config))}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'ZANALYTICS-ORGID': ZOHO_ANALYTICS_ORG_ID,
    },
  });
  if (res.status === 429) {
    _rateLimitedUntil = Date.now() + ANALYTICS_DEFAULT_PAUSE_MS;
    throw new Error('Zoho Analytics rate limited');
  }
  const data = await res.json();
  if (!res.ok || data.status === 'failure') {
    throw new Error(`Zoho Analytics export failed: ${(data.data && data.data.errorMessage) || data.summary || res.status}`);
  }
  const rows = data.data || [];
  return rows.map(r => ({
    survey_id:       r['ID'] || null,
    ticket_id:       r['Ticket'] || null,
    rating:          r['Survey Rating'] || null,
    agent_id:        r['Agent'] || null,
    department_id:   r['Department'] || null,
    contact_id:      r['Contact'] || null,
    account_id:      r['Account'] || null,
    survey_time_utc: centralWallTimeToUtcIso(r['Survey Time']),
  }));
}

/** Session 20 department-discovery fallback: the app's original Desk
 *  OAuth token (ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN in desk-service.js)
 *  was only ever granted ticket-level scopes, not Desk.basic.READ, so it
 *  can search/read tickets fine but 403s (SCOPE_MISMATCH) on GET
 *  /departments -- confirmed live. This suite token (see file header)
 *  was deliberately requested with the broader scope and does have
 *  Desk.basic.READ, so server.js's getDeskDepartmentIds() falls back to
 *  this when the primary token's department lookup fails. It's a Desk
 *  API call, not an Analytics one, living here only because this module
 *  already owns the one token with the right scope for it -- not
 *  because it belongs to "Analytics" conceptually. */
async function fetchDeskDepartments() {
  const token = await getAccessToken();
  const res = await fetch('https://desk.zoho.com/api/v1/departments', {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Zoho Desk departments (via suite token) failed: ${(data && data.message) || res.status}`);
  }
  return data.data || [];
}

module.exports = {
  isConfigured,
  getRateLimitState,
  fetchSurveyRows,
  fetchDeskDepartments,
  centralWallTimeToUtcIso,
  utcIsoToChicagoWallTime,
  // Exposed so lib/desk-service.js can retry a Desk API call on the suite
  // token when the primary Desk token 403s with SCOPE_MISMATCH (the suite
  // token was granted the full Desk scope set, the primary wasn't).
  getSuiteAccessToken: getAccessToken,
};
