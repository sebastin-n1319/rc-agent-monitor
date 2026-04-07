const RC = require('@ringcentral/sdk').SDK;
const { EventEmitter } = require('events');
const { insertPresenceEvent, replaceCallLogsRange, getMonitoredAgents, updateAgentRcId } = require('./database');
require('dotenv').config();

const rcsdk = new RC({
  server: process.env.RC_SERVER_URL,
  clientId: process.env.RC_CLIENT_ID,
  clientSecret: process.env.RC_CLIENT_SECRET
});
const platform = rcsdk.platform();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE_STATUS_TTL_MS = Number(process.env.LIVE_STATUS_TTL_MS || 60000);
const QUEUE_STATUS_TTL_MS = Number(process.env.QUEUE_STATUS_TTL_MS || 5000);
const FALLBACK_SYNC_MS = Number(process.env.FALLBACK_SYNC_MS || 60000);
const SUBSCRIPTION_RENEW_BEFORE_MS = 5 * 60 * 1000;
const WEBHOOK_RETRY_MS = Number(process.env.WEBHOOK_RETRY_MS || 30000);
const DASHBOARD_SUMMARY_TTL_MS = Number(process.env.DASHBOARD_SUMMARY_TTL_MS || 300000);
const CALL_LOG_SYNC_MIN_INTERVAL_MS = Number(process.env.CALL_LOG_SYNC_MIN_INTERVAL_MS || 600000);

let customerServiceQueueId = null;
let customerServiceQueueName = 'Customer Service';
let lastQueueStatuses = {};
let lastQueueStatusAt = 0;
let lastLiveStatusSnapshot = {};
let lastLiveStatusAt = 0;
let presenceSyncPromise = null;
let subscriptionInfo = null;
let subscriptionRenewTimer = null;
let subscriptionRetryTimer = null;
let lastQueueDashboardSummary = null;
let lastQueueDashboardAt = 0;
let callLogSyncPromise = null;
let lastCallLogSyncAt = 0;
let lastSuccessfulCallLogSyncAt = 0;

const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(50);

const ACTIVE_TELEPHONY_STATES = new Set([
  'callconnected',
  'oncall',
  'talking',
  'ringing',
  'hold',
  'onhold',
  'callhold'
]);

function isActiveTelephonyState(telephonyStatus) {
  return ACTIVE_TELEPHONY_STATES.has(String(telephonyStatus || '').toLowerCase());
}

function normalizeLiveDirection(direction, fallback = null) {
  const d = String(direction || '').trim().toLowerCase();
  if (d.startsWith('in')) return 'Inbound';
  if (d.startsWith('out')) return 'Outbound';
  return fallback;
}

function normalizeLiveIdentityValue(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  return text || null;
}

function collectLivePartyCandidates(party = null) {
  if (!party) return [];
  const values = [
    party.extensionId,
    party.id,
    party.extensionNumber,
    party.phoneNumber,
    party.name,
    party.email,
    party.extension && party.extension.id,
    party.extension && party.extension.extensionNumber,
    party.extension && party.extension.name
  ];
  return values.map(normalizeLiveIdentityValue).filter(Boolean);
}

function collectAgentLiveCandidates(agent = null) {
  if (!agent) return new Set();
  return new Set([
    agent.rc_id,
    agent.extension,
    agent.name,
    agent.email
  ].map(normalizeLiveIdentityValue).filter(Boolean));
}

function callPartyMatchesAgent(party, agentCandidates) {
  if (!agentCandidates || !agentCandidates.size) return false;
  return collectLivePartyCandidates(party).some(value => agentCandidates.has(value));
}

function inferDirectionFromActiveCall(agent, call, prevEntry = null) {
  const agentCandidates = collectAgentLiveCandidates(agent);
  const fromMatches = callPartyMatchesAgent(call && call.from, agentCandidates);
  const toMatches = callPartyMatchesAgent(call && call.to, agentCandidates);

  // Party matching is the most reliable signal for agent-relative direction,
  // especially on internal extension-to-extension calls where top-level direction
  // can be account-relative rather than agent-relative.
  if (fromMatches && !toMatches) return 'Outbound';
  if (toMatches && !fromMatches) return 'Inbound';

  const explicit = normalizeLiveDirection(
    call && call.direction,
    normalizeLiveDirection(call && call.partyDirection, null)
  );
  if (explicit) return explicit;

  const currentKey = getCallSessionKey(call);
  if (currentKey && prevEntry && prevEntry.isOnCall) {
    const previousCalls = Array.isArray(prevEntry.activeCalls) ? prevEntry.activeCalls : [];
    const matchedPrevCall = previousCalls.find(prevCall => getCallSessionKey(prevCall) === currentKey);
    if (matchedPrevCall) {
      const previousDirection = normalizeLiveDirection(
        matchedPrevCall.direction,
        normalizeLiveDirection(prevEntry.direction, null)
      );
      if (previousDirection) return previousDirection;
    }
  }

  return null;
}

function resolveLiveDirection(agent, data, prevEntry = null) {
  const activeCalls = Array.isArray(data?.activeCalls) ? data.activeCalls : [];

  const sortedCalls = activeCalls.slice().sort((a, b) => parseStartTimeMs(a && a.startTime) - parseStartTimeMs(b && b.startTime));
  for (const call of sortedCalls) {
    const inferred = inferDirectionFromActiveCall(agent, call, prevEntry);
    if (inferred) return inferred;
  }

  const topLevelDirection = normalizeLiveDirection(data && data.direction, null);
  if (topLevelDirection) return topLevelDirection;

  if (prevEntry && prevEntry.isOnCall) {
    const currentKeys = new Set(activeCalls.map(getCallSessionKey).filter(Boolean));
    const previousCalls = Array.isArray(prevEntry.activeCalls) ? prevEntry.activeCalls : [];
    const previousKeys = new Set(previousCalls.map(getCallSessionKey).filter(Boolean));
    if (!currentKeys.size || [...currentKeys].some(key => previousKeys.has(key))) {
      return normalizeLiveDirection(prevEntry.direction, null);
    }
  }
  return null;
}

function normalizeStatus(presenceStatus, telephonyStatus, userStatus, dndStatus) {
  const t = (telephonyStatus || '').toLowerCase();

  // 1. Active call state takes highest priority
  if (t === 'ringing') return 'Ringing';
  if (isActiveTelephonyState(t)) return 'On Call';

  return normalizePresenceOnly(presenceStatus, userStatus, dndStatus);
}

function normalizePresenceOnly(presenceStatus, userStatus, dndStatus) {
  const p = (presenceStatus || '').toLowerCase();
  const u = (userStatus || '').toLowerCase();
  const d = (dndStatus || '').toLowerCase();

  // 2. DND always = Unavailable
  if (d === 'donotdisturb') return 'Unavailable';

  // 3. In RC, agents manually set status to Busy when they go Unavailable
  // presenceStatus reflects what the agent manually set in the RC app
  // 'Busy' = agent clicked Unavailable in RC app
  // 'Available' = agent is available for calls
  if (p === 'available') return 'Available';
  if (p === 'busy' || p === 'unavailable' || p === 'dnd' || p === 'away') return 'Unavailable';
  if (p === 'offline') return 'Offline';

  // 4. Fallback to userStatus
  if (u === 'available') return 'Available';
  if (u === 'busy' || u === 'unavailable' || u === 'away') return 'Unavailable';

  return presenceStatus || 'Unknown';
}

// Extract ring time, hold time, transfer, voicemail from call legs
function parseCallDetails(call) {
  let ringDuration = 0, holdDuration = 0, transferred = false, isVoicemail = false;
  const legs = call.legs || [];
  for (const leg of legs) {
    ringDuration += leg.ringDuration || 0;
    holdDuration += leg.holdDuration || 0;
    if (leg.action === 'VoicemailScreening' || leg.action === 'VoiceMailDepositing' ||
        (call.result && call.result.toLowerCase().includes('voicemail'))) {
      isVoicemail = true;
    }
    if (leg.action === 'Transfer' || leg.action === 'BlindTransfer' || leg.action === 'WarmTransfer') {
      transferred = true;
    }
  }
  // Also check result for voicemail
  if (call.result && call.result.toLowerCase().includes('voicemail')) isVoicemail = true;
  return { ringDuration, holdDuration, transferred, isVoicemail };
}

function normalizeCallResult(result) {
  return String(result || '').trim().toLowerCase();
}

function isVoicemailResult(result) {
  const normalized = normalizeCallResult(result);
  return normalized.includes('voicemail');
}

function isAbandonedStyleResult(result) {
  const normalized = normalizeCallResult(result);
  return normalized === 'missed' || normalized === 'abandoned';
}

function isCustomerServiceLabel(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes(String(customerServiceQueueName || '').toLowerCase()) ||
    normalized.includes('customer service') ||
    normalized.includes('t1 cs') ||
    normalized.includes('cs stars');
}

function getTimeZoneOffsetMinutes(date,timeZone){
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone,
    timeZoneName:'shortOffset',
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit',
    hour12:false
  }).formatToParts(date);
  const raw = parts.find(p=>p.type==='timeZoneName')?.value || 'GMT+0';
  const match = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if(!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function zonedMidnightUtc(dateStr,timeZone){
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const firstPass = new Date(guess.getTime() - getTimeZoneOffsetMinutes(guess,timeZone) * 60000);
  return new Date(guess.getTime() - getTimeZoneOffsetMinutes(firstPass,timeZone) * 60000);
}

function getDateWindow(dateStr, timeZone = 'America/Chicago') {
  const [y,m,d] = String(dateStr).split('-').map(Number);
  const nextDate = new Date(Date.UTC(y,m-1,d+1,12,0,0)).toISOString().slice(0,10);
  return {
    start: zonedMidnightUtc(dateStr, timeZone),
    end: zonedMidnightUtc(nextDate, timeZone)
  };
}

function callTouchesCustomerServiceQueue(call) {
  const queueId = customerServiceQueueId ? String(customerServiceQueueId) : null;
  const idCandidates = [
    call.extension && call.extension.id,
    call.extensionId,
    call.to && call.to.extensionId,
    call.from && call.from.extensionId
  ].filter(Boolean).map(v => String(v));

  for (const leg of (call.legs || [])) {
    if (leg.extension && leg.extension.id) idCandidates.push(String(leg.extension.id));
  }

  if (queueId && idCandidates.includes(queueId)) return true;

  const labelCandidates = [
    call.extension && call.extension.name,
    call.extensionName,
    call.to && call.to.name,
    call.from && call.from.name
  ].filter(Boolean).map(v => String(v));

  for (const leg of (call.legs || [])) {
    if (leg.extension && leg.extension.name) labelCandidates.push(String(leg.extension.name));
  }

  if (labelCandidates.some(isCustomerServiceLabel)) return true;

  // Fallback: RingCentral queue metadata can appear on different fields depending on leg shape.
  const raw = JSON.stringify(call || {}).toLowerCase();
  if (queueId && raw.includes(queueId.toLowerCase())) return true;
  return isCustomerServiceLabel(raw);
}

function getCallSessionKey(call) {
  return String(
    call?.sessionId ||
    call?.session_id ||
    call?.telephonySessionId ||
    call?.telephonySession_id ||
    call?.telephonySession?.id ||
    call?.id
  );
}

function parseStartTimeMs(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Infinity;
}

function buildSessionSummary(sessionCalls, lookups) {
  const ordered = sessionCalls.slice().sort((a, b) => parseStartTimeMs(a.startTime) - parseStartTimeMs(b.startTime));
  const first = ordered[0] || {};
  const primaryDirection = normalizeCallResult(first.direction);

  let owner = null;
  let queueTouched = false;
  let transferred = false;
  let voicemailResult = false;
  let abandonedResult = false;
  let connected = false;
  let inboundSeen = false;
  let outboundSeen = false;
  let ringDuration = 0;
  let holdDuration = 0;
  let duration = 0;
  let startTime = first.startTime || null;
  let result = first.result || '';
  let callId = first.id || null;

  for (const call of ordered) {
    owner = owner || resolveCallOwner(call, lookups);
    queueTouched = queueTouched || callTouchesCustomerServiceQueue(call);

    const direction = normalizeCallResult(call.direction);
    if (direction === 'inbound') inboundSeen = true;
    if (direction === 'outbound') outboundSeen = true;

    const parsed = parseCallDetails(call);
    ringDuration = Math.max(ringDuration, parsed.ringDuration || call.ringDuration || call.duration || 0);
    holdDuration = Math.max(holdDuration, parsed.holdDuration || call.holdDuration || 0);
    duration = Math.max(duration, call.duration || 0);
    transferred = transferred || parsed.transferred;
    voicemailResult = voicemailResult || parsed.isVoicemail || isVoicemailResult(call.result);
    abandonedResult = abandonedResult || isAbandonedStyleResult(call.result);
    connected = connected || normalizeCallResult(call.result) === 'call connected';

    if (!startTime || parseStartTimeMs(call.startTime) < parseStartTimeMs(startTime)) startTime = call.startTime;
    if (!callId && call.id) callId = call.id;
    if (!result && call.result) result = call.result;
  }

  const relevantInbound = queueTouched && (primaryDirection === 'inbound' || (inboundSeen && !outboundSeen));
  const relevantOutbound = !!owner && !queueTouched && (primaryDirection === 'outbound' || (outboundSeen && !inboundSeen));

  return {
    owner,
    queueTouched,
    relevantInbound,
    relevantOutbound,
    voicemailResult,
    abandonedResult,
    connected,
    transferred,
    ringDuration,
    holdDuration,
    duration,
    startTime,
    result,
    callId
  };
}

async function listAccountCallLogRecords(params) {
  const records = [];
  let page = 1;

  while (page <= 10) {
    const r = await platform.get('/restapi/v1.0/account/~/call-log', {
      ...params,
      page
    });
    const data = await r.json();
    if (data.errorCode) {
      const err = new Error(data.message || data.errorCode);
      err.rcData = data;
      throw err;
    }
    records.push(...(data.records || []));
    if (!data.navigation || !data.navigation.nextPage || !(data.records || []).length) break;
    page++;
    await sleep(400);
  }

  return records;
}

async function listExtensionCallLogRecords(extensionId, params) {
  const records = [];
  let page = 1;

  while (page <= 10) {
    const r = await platform.get(`/restapi/v1.0/account/~/extension/${extensionId}/call-log`, {
      ...params,
      page
    });
    const data = await r.json();
    if (data.errorCode) {
      const err = new Error(data.message || data.errorCode);
      err.rcData = data;
      throw err;
    }
    records.push(...(data.records || []));
    if (!data.navigation || !data.navigation.nextPage || !(data.records || []).length) break;
    page++;
    await sleep(500);
  }

  return records;
}

function buildAgentLookups(agents) {
  const byId = {};
  const byExt = {};
  const byName = {};

  for (const agent of agents) {
    if (agent.rc_id) byId[String(agent.rc_id)] = agent;
    if (agent.extension) byExt[String(agent.extension)] = agent;
    if (agent.name) byName[String(agent.name).toLowerCase()] = agent;
  }

  return { byId, byExt, byName };
}

function resolveCallOwner(call, lookups) {
  const { byId, byExt, byName } = lookups;
  const idCandidates = [
    call.extension && call.extension.id,
    call.extensionId,
    call.to && call.to.extensionId,
    call.from && call.from.extensionId
  ].filter(Boolean).map(v => String(v));

  for (const leg of (call.legs || [])) {
    if (leg.extension && leg.extension.id) idCandidates.push(String(leg.extension.id));
  }

  for (const candidate of idCandidates) {
    if (byId[candidate]) return byId[candidate];
  }

  const extCandidates = [
    call.extension && call.extension.extensionNumber,
    call.extensionNumber,
    call.to && call.to.extensionNumber,
    call.from && call.from.extensionNumber
  ].filter(Boolean).map(v => String(v));

  for (const leg of (call.legs || [])) {
    if (leg.extension && leg.extension.extensionNumber) extCandidates.push(String(leg.extension.extensionNumber));
  }

  for (const candidate of extCandidates) {
    if (byExt[candidate]) return byExt[candidate];
  }

  const nameCandidates = [
    call.extension && call.extension.name,
    call.extensionName,
    call.to && call.to.name,
    call.from && call.from.name
  ].filter(Boolean).map(v => String(v).toLowerCase());

  for (const leg of (call.legs || [])) {
    if (leg.extension && leg.extension.name) nameCandidates.push(String(leg.extension.name).toLowerCase());
  }

  for (const candidate of nameCandidates) {
    if (byName[candidate]) return byName[candidate];
  }

  return null;
}

async function fetchAccountQueueAbandonCalls(istMidnight, agents) {
  const lookups = buildAgentLookups(agents);
  const r = await platform.get('/restapi/v1.0/account/~/call-log', {
    dateFrom: istMidnight.toISOString(),
    perPage: 200,
    view: 'Detailed',
    direction: 'Inbound'
  });
  const d = await r.json();
  const logs = [];

  for (const call of (d.records || [])) {
    if (!isAbandonedStyleResult(call.result)) continue;

    const resolvedOwner = resolveCallOwner(call, lookups);
    if (resolvedOwner) continue;
    const owner =
      isCustomerServiceLabel(call.to && call.to.name) ||
      isCustomerServiceLabel(call.from && call.from.name) ||
      isCustomerServiceLabel(call.extension && call.extension.name) ||
      isCustomerServiceLabel(call.extensionName) ||
      callTouchesCustomerServiceQueue(call)
        ? {
            rc_id: `queue:${customerServiceQueueId || 'customer-service'}`,
            name: (call.to && call.to.name) || (call.extension && call.extension.name) || call.extensionName || 'Customer Service Queue'
          }
        : null;

    if (!owner) continue;

    const { ringDuration, holdDuration, transferred, isVoicemail } = parseCallDetails(call);
    const voicemailResult = isVoicemail || isVoicemailResult(call.result);
    logs.push({
      agentId: owner.rc_id,
      agentName: owner.name,
      callId: call.id,
      direction: call.direction,
      result: call.result,
      duration: call.duration || 0,
      ringDuration: ringDuration || call.ringDuration || call.duration || 0,
      holdDuration: holdDuration || call.holdDuration || 0,
      transferred,
      isVoicemail: voicemailResult,
      startTime: call.startTime
    });
  }

  console.log(`✅ Account call log abandon sync: ${logs.length} relevant inbound calls`);
  return logs;
}

async function fetchQueueDashboardSummary(dateStr, force = false, timeZone = 'America/Chicago') {
  const now = Date.now();
  if (
    !force &&
    lastQueueDashboardSummary &&
    lastQueueDashboardSummary.date === dateStr &&
    lastQueueDashboardSummary.timeZone === timeZone &&
    now - lastQueueDashboardAt < DASHBOARD_SUMMARY_TTL_MS
  ) {
    return lastQueueDashboardSummary;
  }

  try {
    await resolveAgentRcIds();
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    const lookups = buildAgentLookups(agents);
    if (!customerServiceQueueId) await findQueueId();

    const { start, end } = getDateWindow(dateStr, timeZone);
    const calls = await listAccountCallLogRecords({
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      perPage: 200,
      view: 'Detailed'
    });

    const summary = {
      date: dateStr,
      timeZone,
      source: 'account-call-log',
      inboundCount: 0,
      outboundCount: 0,
      voicemailCount: 0,
      abandonedCount: 0,
      transferCount: 0,
      ahtInbound: 0,
      ahtOutbound: 0,
      avgRingTime: 0,
      avgHoldTime: 0,
      totalHoldTime: 0,
      longestRing: 0,
      matchedCalls: 0,
      abandonedCalls: []
    };

    let ringTotal = 0;
    let ringCount = 0;
    let holdTotal = 0;
    let holdCount = 0;
    let inboundTalkTotal = 0;
    let inboundTalkCount = 0;
    let outboundTalkTotal = 0;
    let outboundTalkCount = 0;

    const sessions = new Map();
    for (const call of calls) {
      const key = getCallSessionKey(call);
      if (!sessions.has(key)) sessions.set(key, []);
      sessions.get(key).push(call);
    }

    for (const sessionCalls of sessions.values()) {
      const session = buildSessionSummary(sessionCalls, lookups);
      const { owner, relevantInbound, relevantOutbound, voicemailResult, abandonedResult, transferred } = session;
      if (!relevantInbound && !relevantOutbound) continue;

      const effectiveRing = session.ringDuration || 0;
      const effectiveHold = session.holdDuration || 0;

      summary.matchedCalls++;
      summary.longestRing = Math.max(summary.longestRing, effectiveRing);
      if (effectiveRing > 0) {
        ringTotal += effectiveRing;
        ringCount++;
      }
      if (effectiveHold > 0) {
        holdTotal += effectiveHold;
        holdCount++;
        summary.totalHoldTime += effectiveHold;
      }
      if (transferred) summary.transferCount++;

      if (relevantInbound) {
        summary.inboundCount++;
        if (!voicemailResult && !abandonedResult && session.connected && session.duration > 0) {
          inboundTalkTotal += session.duration;
          inboundTalkCount++;
        }
        if (voicemailResult) summary.voicemailCount++;
        if (!voicemailResult && abandonedResult) {
          summary.abandonedCount++;
          summary.abandonedCalls.push({
            agentId: owner ? owner.rc_id : `queue:${customerServiceQueueId || 'customer-service'}`,
            agentName: owner ? owner.name : customerServiceQueueName,
            extension: owner ? owner.extension : null,
            callId: session.callId,
            result: session.result,
            ringDuration: effectiveRing,
            holdDuration: effectiveHold,
            startTime: session.startTime
          });
        }
      }

      if (relevantOutbound) {
        summary.outboundCount++;
        if (session.connected && session.duration > 0) {
          outboundTalkTotal += session.duration;
          outboundTalkCount++;
        }
      }
    }

    summary.ahtInbound = inboundTalkCount ? Math.round(inboundTalkTotal / inboundTalkCount) : 0;
    summary.ahtOutbound = outboundTalkCount ? Math.round(outboundTalkTotal / outboundTalkCount) : 0;
    summary.avgRingTime = ringCount ? Math.round(ringTotal / ringCount) : 0;
    summary.avgHoldTime = holdCount ? Math.round(holdTotal / holdCount) : 0;
    summary.abandonedCalls.sort((a, b) => (b.ringDuration || 0) - (a.ringDuration || 0) || String(b.startTime || '').localeCompare(String(a.startTime || '')));

    lastQueueDashboardSummary = summary;
    lastQueueDashboardAt = now;
    console.log(`📊 Queue dashboard summary: in ${summary.inboundCount} / out ${summary.outboundCount} / vm ${summary.voicemailCount} / abd ${summary.abandonedCount}`);
    return summary;
  } catch (e) {
    if (lastQueueDashboardSummary && lastQueueDashboardSummary.date === dateStr && lastQueueDashboardSummary.timeZone === timeZone) {
      console.warn(`⚠️ Using cached queue dashboard summary: ${e.message}`);
      return { ...lastQueueDashboardSummary, stale: true };
    }
    throw e;
  }
}

function isRateLimitError(err, data) {
  const msg = `${err?.message || ''} ${data?.message || ''} ${data?.errorCode || ''}`.toLowerCase();
  return msg.includes('rate limit') || msg.includes('rate exceeded') || msg.includes('too many requests') || data?.errorCode === 'CMN-301';
}

function buildLiveStatusEntry(agent, data, fetchedAt) {
  return buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, null);
}

function mergeQueueInfoWithPresence(queueInfo, data) {
  const merged = queueInfo ? { ...queueInfo } : {};
  const d = (data?.dndStatus || '').toLowerCase();

  // RingCentral maps acceptQueueCalls to DnD status:
  // - TakeAllCalls => queue calls allowed
  // - DoNotAcceptDepartmentCalls / DoNotAcceptAnyCalls => queue calls blocked
  if (d === 'takeallcalls') {
    merged.acceptQueueCalls = true;
  } else if (d === 'donotacceptdepartmentcalls' || d === 'donotacceptanycalls') {
    merged.acceptQueueCalls = false;
  }

  return Object.keys(merged).length ? merged : null;
}

function deriveQueueStatus(queueInfo) {
  if (!queueInfo) return 'Unknown';
  if (queueInfo.acceptQueueCalls === false) return 'All Queues Off';
  if (queueInfo.acceptCurrentQueueCalls === false) return 'This Queue Off';
  return 'In Queue';
}

function deriveQueueAwareStatus(data, queueInfo) {
  return deriveDisplayStatus(data, queueInfo);
}

function deriveDisplayStatus(data, queueInfo) {
  const resolvedQueueInfo = mergeQueueInfoWithPresence(queueInfo, data);
  const tel = data.telephonyStatus;
  const hasActiveCall = Array.isArray(data.activeCalls) && data.activeCalls.length > 0;
  const isOnCall = isActiveTelephonyState(tel) || hasActiveCall;
  const basePresence = normalizePresenceOnly(data.presenceStatus, data.userStatus, data.dndStatus);

  if (!resolvedQueueInfo) {
    return normalizeStatus(data.presenceStatus, data.telephonyStatus, data.userStatus, data.dndStatus);
  }

  if (tel === 'Ringing') return 'Ringing';
  if (isOnCall) return 'On Call';
  if (resolvedQueueInfo.acceptQueueCalls === false || resolvedQueueInfo.acceptCurrentQueueCalls === false) return 'Unavailable';
  if (basePresence === 'Available') return 'Available';
  return 'Unavailable';
}

function deriveQueueReadyStatus(data, queueInfo) {
  const resolvedQueueInfo = mergeQueueInfoWithPresence(queueInfo, data);
  const tel = (data.telephonyStatus || '').toLowerCase();
  const hasActiveCall = Array.isArray(data.activeCalls) && data.activeCalls.length > 0;
  const basePresence = normalizePresenceOnly(data.presenceStatus, data.userStatus, data.dndStatus);
  const canTakeQueueCalls = resolvedQueueInfo &&
    resolvedQueueInfo.acceptQueueCalls !== false &&
    resolvedQueueInfo.acceptCurrentQueueCalls !== false;

  if (!canTakeQueueCalls) return 'Unavailable';
  if (basePresence !== 'Available') return 'Unavailable';
  if (isActiveTelephonyState(tel) || hasActiveCall) return 'Unavailable';
  return 'Available';
}

function buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, queueInfo, prevEntry = null) {
  const resolvedQueueInfo = mergeQueueInfoWithPresence(queueInfo, data);
  const tel = data.telephonyStatus;
  const activeCalls = Array.isArray(data.activeCalls) ? data.activeCalls : [];
  const primaryCall = activeCalls.find(call => call && (call.startTime || call.direction)) || activeCalls[0] || null;
  const isOnCall = isActiveTelephonyState(tel) || activeCalls.length > 0;
  let direction = null, callDuration = 0, callStartTime = null;
  const displayStatus = deriveDisplayStatus(data, resolvedQueueInfo);
  const queueReadyStatus = deriveQueueReadyStatus(data, resolvedQueueInfo);
  direction = resolveLiveDirection(agent, data, prevEntry);
  callStartTime = (primaryCall && primaryCall.startTime) || data.callStartTime || (prevEntry && prevEntry.isOnCall ? prevEntry.callStartTime : null);
  callDuration = callStartTime ? Math.floor((Date.now() - new Date(callStartTime).getTime()) / 1000) : 0;
  return {
    agentId: agent.rc_id,
    agentName: agent.name,
    telephonyStatus: tel,
    isOnCall,
    direction,
    callDuration,
    presenceStatus: data.presenceStatus,
    displayStatus,
    queueReadyStatus,
    normalizedStatus: displayStatus,
    userStatus: data.userStatus || null,
    dndStatus: data.dndStatus || null,
    activeCalls,
    callStartTime,
    fetchedAt,
    queueStatus: deriveQueueStatus(resolvedQueueInfo),
    acceptQueueCalls: resolvedQueueInfo ? resolvedQueueInfo.acceptQueueCalls : null,
    acceptCurrentQueueCalls: resolvedQueueInfo ? resolvedQueueInfo.acceptCurrentQueueCalls : null
  };
}

function resolveWebhookBaseUrl() {
  const explicit = process.env.APP_BASE_URL || process.env.WEBHOOK_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

function getWebhookAddress() {
  const base = resolveWebhookBaseUrl();
  return base ? `${base}/api/rc-webhook` : null;
}

function getSubscriptionFilters() {
  if (!customerServiceQueueId) return ['/restapi/v1.0/account/~/presence'];
  return [
    '/restapi/v1.0/account/~/presence',
    `/restapi/v1.0/account/~/call-queues/${customerServiceQueueId}/presence`
  ];
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return a.normalizedStatus === b.normalizedStatus &&
    a.queueStatus === b.queueStatus &&
    a.telephonyStatus === b.telephonyStatus &&
    a.presenceStatus === b.presenceStatus &&
    a.userStatus === b.userStatus &&
    a.dndStatus === b.dndStatus &&
    a.direction === b.direction &&
    a.callStartTime === b.callStartTime;
}

async function getAgentMap() {
  await resolveAgentRcIds();
  const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
  const byId = {};
  for (const agent of agents) byId[String(agent.rc_id)] = agent;
  return byId;
}

function emitLiveUpdate(reason, agentId) {
  liveEvents.emit('update', { reason, agentId, at: new Date().toISOString() });
}

async function upsertSnapshotEntry(agent, data, queueInfo, fetchedAt, reason = 'sync') {
  const prevEntry = lastLiveStatusSnapshot[agent.rc_id];
  const nextEntry = buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, queueInfo, prevEntry);
  const displayChanged = !prevEntry || prevEntry.displayStatus !== nextEntry.displayStatus;
  const queueReadyChanged = !prevEntry ||
    prevEntry.queueReadyStatus !== nextEntry.queueReadyStatus ||
    prevEntry.queueStatus !== nextEntry.queueStatus;

  nextEntry.stateSince = displayChanged
    ? (nextEntry.callStartTime || fetchedAt)
    : (prevEntry && prevEntry.stateSince) || (nextEntry.callStartTime || fetchedAt);

  lastLiveStatusSnapshot[agent.rc_id] = nextEntry;
  lastLiveStatusAt = Date.now();

  if (queueReadyChanged) {
    await insertPresenceEvent(agent.rc_id, agent.name, nextEntry.queueReadyStatus, nextEntry.queueStatus, fetchedAt);
  }

  if (displayChanged || queueReadyChanged) {
    emitLiveUpdate(reason, agent.rc_id);
  }

  return { changed: displayChanged || queueReadyChanged, nextEntry, prevEntry, displayChanged, queueReadyChanged };
}

async function renewSubscription(subscription) {
  try {
    const resp = await platform.put(`/restapi/v1.0/subscription/${subscription.id}`, {
      eventFilters: subscription.eventFilters,
      deliveryMode: subscription.deliveryMode,
      expiresIn: 7 * 24 * 60 * 60
    });
    const data = await resp.json();
    subscriptionInfo = data;
    scheduleSubscriptionRenewal();
    console.log(`🔄 Subscription renewed: ${data.id}`);
  } catch (e) {
    console.error('❌ renewSubscription:', e.message);
  }
}

function scheduleSubscriptionRenewal() {
  if (subscriptionRenewTimer) clearTimeout(subscriptionRenewTimer);
  if (!subscriptionInfo || !subscriptionInfo.expirationTime) return;
  const renewAt = new Date(subscriptionInfo.expirationTime).getTime() - SUBSCRIPTION_RENEW_BEFORE_MS;
  const delay = Math.max(30000, renewAt - Date.now());
  subscriptionRenewTimer = setTimeout(() => { void renewSubscription(subscriptionInfo); }, delay);
}

async function ensureRealtimeSubscription() {
  const address = getWebhookAddress();
  if (!address) {
    console.warn('⚠️ Webhook base URL not configured; using fallback polling only');
    return;
  }
  if (subscriptionInfo && subscriptionInfo.id) return;
  const eventFilters = getSubscriptionFilters();
  try {
    console.log(`🔗 Ensuring realtime subscription at ${address}`);
    const resp = await platform.post('/restapi/v1.0/subscription', {
      eventFilters,
      deliveryMode: { transportType: 'WebHook', address },
      expiresIn: 7 * 24 * 60 * 60
    });
    const data = await resp.json();
    subscriptionInfo = data;
    if (subscriptionRetryTimer) {
      clearTimeout(subscriptionRetryTimer);
      subscriptionRetryTimer = null;
    }
    scheduleSubscriptionRenewal();
    console.log(`✅ Realtime subscription ready: ${data.id}`);
  } catch (e) {
    console.error('❌ ensureRealtimeSubscription:', e.message);
    if (!subscriptionRetryTimer) {
      subscriptionRetryTimer = setTimeout(async () => {
        subscriptionRetryTimer = null;
        await ensureRealtimeSubscription();
      }, WEBHOOK_RETRY_MS);
      console.log(`⏳ Retrying realtime subscription in ${WEBHOOK_RETRY_MS}ms`);
    }
  }
}

async function authenticate() {
  try {
    await platform.login({ jwt: process.env.RC_JWT });
    console.log('✅ Authenticated with RingCentral');
    // Find Customer Service queue ID
    await findQueueId();
  } catch(e) { console.error('❌ Auth failed:', e.message); }
}

async function findQueueId() {
  try {
    const r = await platform.get('/restapi/v1.0/account/~/call-queues', { perPage: 100 });
    const data = await r.json();
    const queues = data.records || [];
    // Look for Customer Service queue
    const csQueue = queues.find(q =>
      q.name && (
        q.name.toLowerCase().includes('customer service') ||
        q.name.toLowerCase().includes('t1 cs') ||
        q.name.toLowerCase().includes('cs stars')
      )
    );
    if (csQueue) {
      customerServiceQueueId = csQueue.id;
      customerServiceQueueName = csQueue.name || customerServiceQueueName;
      console.log(`✅ Found queue: "${csQueue.name}" (ID: ${csQueue.id})`);
    } else {
      // Use first queue as fallback
      if (queues.length > 0) {
        customerServiceQueueId = queues[0].id;
        customerServiceQueueName = queues[0].name || customerServiceQueueName;
        console.log(`⚠️ Using first queue: "${queues[0].name}" (ID: ${queues[0].id})`);
      }
      console.log('All queues:', queues.map(q => q.name).join(', '));
    }
  } catch(e) { console.error('❌ findQueueId:', e.message); }
}

async function fetchQueueStatuses() {
  const now = Date.now();
  if (now - lastQueueStatusAt < QUEUE_STATUS_TTL_MS && Object.keys(lastQueueStatuses).length) {
    return lastQueueStatuses;
  }
  if (!customerServiceQueueId) {
    await findQueueId();
    if (!customerServiceQueueId) return {};
  }
  try {
    const r = await platform.get(
      `/restapi/v1.0/account/~/call-queues/${customerServiceQueueId}/presence`
    );
    const data = await r.json();
    const statusMap = {};
    for (const rec of (data.records || [])) {
      if (rec.member && rec.member.id) {
        statusMap[String(rec.member.id)] = {
          acceptQueueCalls: rec.acceptQueueCalls !== false,
          acceptCurrentQueueCalls: rec.acceptCurrentQueueCalls !== false
        };
      }
    }
    lastQueueStatuses = statusMap;
    lastQueueStatusAt = now;
    console.log(`📋 Queue statuses fetched: ${Object.keys(statusMap).length} members`);
    return statusMap;
  } catch(e) {
    console.error('❌ fetchQueueStatuses:', e.message);
    return lastQueueStatuses;
  }
}

async function fetchAccountPresenceMap() {
  const r = await platform.get('/restapi/v1.0/account/~/presence', {
    detailedTelephonyState: true
  });
  const data = await r.json();
  if (data.errorCode) {
    const err = new Error(data.message || data.errorCode);
    err.rcData = data;
    throw err;
  }
  const presenceMap = {};
  for (const rec of (data.records || [])) {
    const extId = String(
      (rec.extension && rec.extension.id) ||
      rec.extensionId ||
      rec.id ||
      ''
    );
    if (extId) presenceMap[extId] = rec;
  }
  return presenceMap;
}

async function searchRCUsers(query) {
  try {
    let allRecords = [], page = 1;
    while (true) {
      const r = await platform.get('/restapi/v1.0/account/~/extension', {
        status: 'Enabled', type: 'User', perPage: 200, page
      });
      const d = await r.json();
      allRecords = allRecords.concat(d.records || []);
      if (!d.navigation || !d.navigation.nextPage) break;
      page++;
      await sleep(1200);
    }
    const q = query.toLowerCase();
    return allRecords
      .filter(r => {
        const name = (r.name || '').toLowerCase();
        const ext = (r.extensionNumber || '').toLowerCase();
        const email = (r.contact && r.contact.email || '').toLowerCase();
        return name.includes(q) || ext.includes(q) || email.includes(q);
      })
      .slice(0, 15)
      .map(r => ({
        id: String(r.id), name: r.name,
        extension: r.extensionNumber,
        email: r.contact && r.contact.email || ''
      }));
  } catch(e) { console.error('❌ searchRCUsers:', e.message); return []; }
}

async function resolveAgentRcIds() {
  const agents = await getMonitoredAgents();
  for (const agent of agents.filter(a => !a.rc_id)) {
    try {
      const r = await platform.get('/restapi/v1.0/account/~/extension', {
        extensionNumber: agent.extension, status: 'Enabled'
      });
      const d = await r.json();
      if (d.records && d.records.length > 0) {
        await updateAgentRcId(agent.extension, String(d.records[0].id));
        console.log(`✅ Resolved ${agent.name} → ${d.records[0].id}`);
      }
      await sleep(1500);
    } catch(e) { console.error(`❌ Resolve ext ${agent.extension}:`, e.message); }
  }
}

async function fetchPresenceForAll(force = false) {
  if (presenceSyncPromise && !force) {
    console.log('⏭️ Presence sync already running, reusing current run');
    return presenceSyncPromise;
  }

  presenceSyncPromise = (async () => {
    await resolveAgentRcIds();
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    if (!agents.length) return;
    console.log(`📡 Presence fetch: ${agents.length} agents via account presence snapshot`);
    const fetchedAt = new Date().toISOString();
    const queueStatuses = await fetchQueueStatuses().catch(() => lastQueueStatuses || {});
    const presenceMap = await fetchAccountPresenceMap();
    const snapshot = { ...lastLiveStatusSnapshot };

    for (const agent of agents) {
      try {
        const data = presenceMap[agent.rc_id];
        if (!data) {
          console.warn(`⚠️ Presence missing for ${agent.name} (${agent.rc_id})`);
          continue;
        }
        const queueInfo = mergeQueueInfoWithPresence(
          queueStatuses[agent.rc_id] || lastQueueStatuses[agent.rc_id] || null,
          data
        );
        if (queueInfo) lastQueueStatuses[agent.rc_id] = queueInfo;
        const status = deriveDisplayStatus(data, queueInfo);
        const prevEntry = snapshot[agent.rc_id];
        const { changed, nextEntry } = await upsertSnapshotEntry(agent, data, queueInfo, fetchedAt, 'poll');
        snapshot[agent.rc_id] = nextEntry;
        if (changed) {
          console.log(`✅ ${agent.name}: ${prevEntry ? prevEntry.displayStatus : '--'} → ${status} (${nextEntry.queueStatus})`);
        }
      } catch(e) {
        console.error(`❌ Presence ${agent.name}:`, e.message);
        if (snapshot[agent.rc_id]) {
          snapshot[agent.rc_id] = {
            ...snapshot[agent.rc_id],
            stale: true,
            staleReason: isRateLimitError(e) ? 'rate_limited' : 'fetch_failed'
          };
        }
      }
    }
    lastLiveStatusSnapshot = snapshot;
    lastLiveStatusAt = Date.now();
    console.log('✅ Presence snapshot saved');
  })().catch(e => {
    console.error('❌ fetchPresenceForAll:', e.message);
  }).finally(() => {
    presenceSyncPromise = null;
  });

  return presenceSyncPromise;
}

async function fetchCallLogs(force = false) {
  if (callLogSyncPromise) {
    console.log('⏭️ Call log sync already running, reusing current run');
    return callLogSyncPromise;
  }

  if (!force && lastCallLogSyncAt && Date.now() - lastCallLogSyncAt < CALL_LOG_SYNC_MIN_INTERVAL_MS) {
    console.log('⏭️ Call log sync skipped; last snapshot is still fresh');
    return { skipped: true };
  }

  callLogSyncPromise = (async () => {
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    if (!agents.length) return;
    // Use IST midnight as start of shift day
    const istMidnight = new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}) + 'T00:00:00+05:30');
    const istNextMidnight = new Date(istMidnight.getTime() + 86400000);
    console.log(`📞 Fetching calls from IST midnight: ${istMidnight.toISOString()}`);
    const pendingLogs = [];
    const failedAgents = [];
    try {
      pendingLogs.push(...await fetchAccountQueueAbandonCalls(istMidnight, agents));
    } catch (e) {
      console.error('❌ Account call log abandon sync:', e.message);
    }
    let imported = 0;
    let successfulAgents = 0;
    for (const agent of agents) {
      let attempts = 0;
      while (attempts < 2) {
        attempts++;
        try {
          await sleep(2500);
          const calls = await listExtensionCallLogRecords(agent.rc_id, {
            dateFrom: istMidnight.toISOString(),
            dateTo: istNextMidnight.toISOString(),
            perPage: 200,
            view: 'Detailed'
          });
          for (const call of calls) {
            const { ringDuration, holdDuration, transferred, isVoicemail } = parseCallDetails(call);
            pendingLogs.push({
              agentId: agent.rc_id,
              agentName: agent.name,
              callId: call.id,
              direction: call.direction,
              result: call.result,
              duration: call.duration || 0,
              ringDuration,
              holdDuration,
              transferred,
              isVoicemail,
              startTime: call.startTime
            });
            imported++;
          }
          successfulAgents++;
          console.log(`✅ ${agent.name}: ${calls.length} calls today`);
          break;
        } catch (e) {
          if (attempts < 2 && isRateLimitError(e, e.rcData)) {
            console.warn(`⏳ Call log retry for ${agent.name} after rate limit`);
            await sleep(8000);
            continue;
          }
          console.error(`❌ Call log ${agent.name}:`, e.message);
          failedAgents.push(agent.name);
          break;
        }
      }
    }
    const hadGoodSnapshot = lastSuccessfulCallLogSyncAt > 0;
    const shouldPreserveExisting = hadGoodSnapshot && failedAgents.length > 0;

    if (pendingLogs.length === 0) {
      console.warn('⚠️ No call logs gathered; keeping existing snapshot');
      lastCallLogSyncAt = Date.now();
      return { imported: 0, preserved: true };
    }

    if (shouldPreserveExisting) {
      console.warn(`⚠️ Preserving previous call log snapshot; partial sync hit ${failedAgents.length} failed agents`);
      lastCallLogSyncAt = Date.now();
      return { imported, preserved: true, failedAgents };
    }

    await replaceCallLogsRange(istMidnight.toISOString(), istNextMidnight.toISOString(), pendingLogs);
    lastCallLogSyncAt = Date.now();
    lastSuccessfulCallLogSyncAt = lastCallLogSyncAt;
    console.log(`✅ Call logs synced: ${imported} agent-scoped calls`);
    return { imported, preserved: false, failedAgents, successfulAgents };
  })().catch(e => {
    console.error('❌ fetchCallLogs:', e.message);
    return { imported: 0, preserved: true, error: e.message };
  }).finally(() => {
    callLogSyncPromise = null;
  });

  return callLogSyncPromise;
}

async function fetchLiveCallStatus() {
  try {
    const hasSnapshot = Object.keys(lastLiveStatusSnapshot).length > 0;

    // Important: /api/live-status must be read-only.
    // Browser refreshes should not trigger new RingCentral presence pulls,
    // otherwise the UI itself causes rate limiting and stale data.
    if (!hasSnapshot && !presenceSyncPromise) {
      void fetchPresenceForAll();
    }
    return lastLiveStatusSnapshot;
  } catch(e) { return lastLiveStatusSnapshot || {}; }
}

async function handleWebhookNotification(payload) {
  try {
    const agentMap = await getAgentMap();
    const event = payload.event || '';
    const body = payload.body || {};
    const fetchedAt = payload.timestamp || new Date().toISOString();

    if (event.includes('/call-queues/') && Array.isArray(body.records)) {
      console.log(`📨 Queue webhook: ${body.records.length} record(s)`);
      for (const rec of body.records) {
        const agentId = String(rec.member && rec.member.id || '');
        if (!agentId || !agentMap[agentId]) continue;
        lastQueueStatuses[agentId] = {
          ...(lastQueueStatuses[agentId] || {}),
          acceptQueueCalls: rec.acceptQueueCalls !== false,
          acceptCurrentQueueCalls: rec.acceptCurrentQueueCalls !== false
        };
        lastQueueStatusAt = Date.now();
        const existing = lastLiveStatusSnapshot[agentId];
        if (!existing) continue;
        const agent = agentMap[agentId];
        await upsertSnapshotEntry(agent, existing, lastQueueStatuses[agentId], fetchedAt, 'queue-webhook');
      }
      return;
    }

    const accountPresence = body.extensionId || body.presenceStatus || body.telephonyStatus;
    if (event.includes('/account/~/presence') || accountPresence) {
      console.log(`📨 Presence webhook: ${body.extensionId || body.id || 'unknown'}`);
      const agentId = String(body.extensionId || body.id || '');
      if (!agentId || !agentMap[agentId]) return;
      const agent = agentMap[agentId];
      const existing = lastLiveStatusSnapshot[agentId] || {};
      const merged = {
        ...existing,
        ...body,
        presenceStatus: body.presenceStatus ?? existing.presenceStatus,
        telephonyStatus: body.telephonyStatus ?? existing.telephonyStatus,
        userStatus: body.userStatus ?? existing.userStatus,
        dndStatus: body.dndStatus ?? existing.dndStatus,
        activeCalls: body.activeCalls ?? existing.activeCalls ?? []
      };
      const queueInfo = mergeQueueInfoWithPresence(lastQueueStatuses[agentId] || null, merged);
      if (queueInfo) {
        lastQueueStatuses[agentId] = queueInfo;
        lastQueueStatusAt = Date.now();
      }
      await upsertSnapshotEntry(agent, merged, queueInfo, fetchedAt, 'presence-webhook');
    }
  } catch (e) {
    console.error('❌ handleWebhookNotification:', e.message);
  }
}

function getFallbackSyncMs() {
  return FALLBACK_SYNC_MS;
}

module.exports = {
  authenticate,
  ensureRealtimeSubscription,
  fetchPresenceForAll,
  fetchCallLogs,
  fetchQueueDashboardSummary,
  searchRCUsers,
  fetchLiveCallStatus,
  handleWebhookNotification,
  liveEvents,
  getFallbackSyncMs
};
