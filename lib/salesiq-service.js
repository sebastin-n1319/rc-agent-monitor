/**
 * Zoho SalesIQ API client (Session 21).
 *
 * Reuses the existing ZOHO_SUITE_* self client (see lib/analytics-service.js)
 * -- that client was originally generated with a broader multi-product
 * scope (CRM + Desk + Analytics + SalesIQ) and, confirmed live, already
 * carries every SalesIQ scope this module needs (SalesIQ.operators.READ,
 * SalesIQ.conversations.READ, SalesIQ.departments.READ, ...). No new Zoho
 * app registration or grant token was needed for this.
 *
 * Two things are pulled:
 *   - Operators (GET /operators): each operator's current chat status
 *     (status_message: Available/Busy/Away/...) and online/offline
 *     state (availability.status). This is a live snapshot only -- Zoho
 *     doesn't expose a historical status log via REST, which is why
 *     lib/salesiq-lifecycle.js polls this on an interval and logs
 *     status *changes* itself (same pattern rc-service.js uses for RC
 *     presence).
 *   - Conversations (GET /conversations): full chat history, paginated
 *     via index/limit, filterable by from_time/to_time (epoch ms).
 *     attended_time - start_time gives first-response time per chat.
 *     This one IS fully historical, so no local polling is needed for
 *     it -- lib/salesiq-lifecycle.js just syncs it into a local table
 *     for fast arbitrary-range queries (same reason ticket data is
 *     synced locally rather than queried live -- see desk-lifecycle.js).
 */
const analyticsService = require('./analytics-service');

const ZOHO_SUITE_CLIENT_ID     = process.env.ZOHO_SUITE_CLIENT_ID     || '';
const ZOHO_SUITE_CLIENT_SECRET = process.env.ZOHO_SUITE_CLIENT_SECRET || '';
const ZOHO_SUITE_REFRESH_TOKEN = process.env.ZOHO_SUITE_REFRESH_TOKEN || '';
const ZOHO_SALESIQ_SCREENNAME  = process.env.ZOHO_SALESIQ_SCREENNAME  || '';
const SALESIQ_API_BASE = 'https://salesiq.zoho.com';

// Deliberately NOT analyticsService.isConfigured() -- that also requires
// ZOHO_ANALYTICS_ORG_ID/WORKSPACE_ID/SURVEY_VIEW_ID, which are specific
// to the CSAT sync and irrelevant here. getSuiteAccessToken() itself only
// needs the three suite client vars, so that's what this checks.
function isConfigured() {
  return !!(ZOHO_SUITE_CLIENT_ID && ZOHO_SUITE_CLIENT_SECRET && ZOHO_SUITE_REFRESH_TOKEN && ZOHO_SALESIQ_SCREENNAME);
}

async function siqFetch(pathAndQuery) {
  if (!isConfigured()) throw new Error('SalesIQ not configured -- set ZOHO_SALESIQ_SCREENNAME (suite client is shared with Analytics)');
  const token = await analyticsService.getSuiteAccessToken();
  const res = await fetch(`${SALESIQ_API_BASE}${pathAndQuery}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SalesIQ API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// GET /operators -- current live status for every operator (agent) on
// the portal. Returns the raw operator objects; callers pick the fields
// they need (see salesiq-lifecycle.js's presence poller).
async function fetchOperators() {
  const data = await siqFetch(`/api/v2/${ZOHO_SALESIQ_SCREENNAME}/operators`);
  return data.data || [];
}

// GET /conversations, one page. from_time/to_time are epoch ms
// (inclusive-ish; confirmed live against the real API). index is
// 1-based per Zoho's convention; limit tops out below 200 (confirmed
// live -- 100 is used as a safe page size).
async function fetchConversationsPage({ fromTimeMs, toTimeMs, index = 1, limit = 100 } = {}) {
  const qs = new URLSearchParams({
    from_time: String(fromTimeMs),
    to_time: String(toTimeMs),
    index: String(index),
    limit: String(limit),
  });
  const data = await siqFetch(`/api/v2/${ZOHO_SALESIQ_SCREENNAME}/conversations?${qs.toString()}`);
  return {
    conversations: data.data || [],
    moreDataAvailable: !!data.more_data_available,
  };
}

module.exports = {
  isConfigured,
  fetchOperators,
  fetchConversationsPage,
};
