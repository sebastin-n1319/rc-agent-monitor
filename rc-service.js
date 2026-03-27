const RC = require('@ringcentral/sdk').SDK;
const { EventEmitter } = require('events');
const { insertPresenceEvent, insertCallLog, getMonitoredAgents, updateAgentRcId } = require('./database');
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
const DASHBOARD_SUMMARY_TTL_MS = Number(process.env.DASHBOARD_SUMMARY_TTL_MS || 45000);

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

const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(50);

function normalizeStatus(presenceStatus, telephonyStatus, userStatus, dndStatus) {
  const t = (telephonyStatus || '').toLowerCase();

  // 1. Active call state takes highest priority
  if (t === 'callconnected' || t === 'oncall' || t === 'talking') return 'On Call';
  if (t === 'ringing') return 'Ringing';

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

function isAbandonedStyleResult(result) {
  const normalized = String(result || '').toLowerCase();
  return normalized === 'missed' || normalized === 'voicemail' || normalized === 'abandoned';
}

function isCustomerServiceLabel(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes(String(customerServiceQueueName || '').toLowerCase()) ||
    normalized.includes('customer service') ||
    normalized.includes('t1 cs') ||
    normalized.includes('cs stars');
}

function getIstDateWindow(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
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

  return labelCandidates.some(isCustomerServiceLabel);
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
  let imported = 0;

  for (const call of (d.records || [])) {
    if (!isAbandonedStyleResult(call.result)) continue;

    const owner = resolveCallOwner(call, lookups) || (
      isCustomerServiceLabel(call.to && call.to.name) ||
      isCustomerServiceLabel(call.from && call.from.name) ||
      isCustomerServiceLabel(call.extension && call.extension.name) ||
      isCustomerServiceLabel(call.extensionName)
        ? {
            rc_id: `queue:${customerServiceQueueId || 'customer-service'}`,
            name: (call.to && call.to.name) || (call.extension && call.extension.name) || call.extensionName || 'Customer Service Queue'
          }
        : null
    );

    if (!owner) continue;

    const { ringDuration, holdDuration, transferred, isVoicemail } = parseCallDetails(call);
    await insertCallLog({
      agentId: owner.rc_id,
      agentName: owner.name,
      callId: call.id,
      direction: call.direction,
      result: call.result,
      duration: call.duration || 0,
      ringDuration: ringDuration || call.ringDuration || call.duration || 0,
      holdDuration: holdDuration || call.holdDuration || 0,
      transferred,
      isVoicemail,
      startTime: call.startTime
    });
    imported++;
  }

  console.log(`✅ Account call log abandon sync: ${imported} relevant inbound calls`);
}

async function fetchQueueDashboardSummary(dateStr, force = false) {
  const now = Date.now();
  if (
    !force &&
    lastQueueDashboardSummary &&
    lastQueueDashboardSummary.date === dateStr &&
    now - lastQueueDashboardAt < DASHBOARD_SUMMARY_TTL_MS
  ) {
    return lastQueueDashboardSummary;
  }

  await resolveAgentRcIds();
  const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
  const lookups = buildAgentLookups(agents);
  if (!customerServiceQueueId) await findQueueId();

  const { start, end } = getIstDateWindow(dateStr);
  const calls = await listAccountCallLogRecords({
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
    perPage: 200,
    view: 'Detailed'
  });

  const summary = {
    date: dateStr,
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

  for (const call of calls) {
    const owner = resolveCallOwner(call, lookups);
    const queueTouched = callTouchesCustomerServiceQueue(call);
    const direction = String(call.direction || '').toLowerCase();
    const inbound = direction === 'inbound';
    const outbound = direction === 'outbound';
    const relevantInbound = inbound && (queueTouched || owner);
    const relevantOutbound = outbound && !!owner;
    if (!relevantInbound && !relevantOutbound) continue;

    const { ringDuration, holdDuration, transferred, isVoicemail } = parseCallDetails(call);
    const result = String(call.result || '').toLowerCase();
    const effectiveRing = ringDuration || call.ringDuration || call.duration || 0;
    const effectiveHold = holdDuration || call.holdDuration || 0;

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
      if (!isVoicemail && result !== 'missed' && result !== 'abandoned' && result !== 'voicemail' && (call.duration || 0) > 0) {
        inboundTalkTotal += call.duration || 0;
        inboundTalkCount++;
      }
      if (isVoicemail || result.includes('voicemail')) summary.voicemailCount++;
      if (!isVoicemail && (result === 'missed' || result === 'abandoned')) {
        summary.abandonedCount++;
        summary.abandonedCalls.push({
          agentId: owner ? owner.rc_id : `queue:${customerServiceQueueId || 'customer-service'}`,
          agentName: owner ? owner.name : customerServiceQueueName,
          extension: owner ? owner.extension : null,
          callId: call.id,
          result: call.result,
          ringDuration: effectiveRing,
          holdDuration: effectiveHold,
          startTime: call.startTime
        });
      }
    }

    if (relevantOutbound) {
      summary.outboundCount++;
      if (result === 'call connected' && (call.duration || 0) > 0) {
        outboundTalkTotal += call.duration || 0;
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
  const isOnCall = tel === 'CallConnected' || tel === 'Ringing';
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
  const basePresence = normalizePresenceOnly(data.presenceStatus, data.userStatus, data.dndStatus);
  const canTakeQueueCalls = resolvedQueueInfo &&
    resolvedQueueInfo.acceptQueueCalls !== false &&
    resolvedQueueInfo.acceptCurrentQueueCalls !== false;

  if (!canTakeQueueCalls) return 'Unavailable';
  if (basePresence !== 'Available') return 'Unavailable';
  if (tel === 'ringing' || tel === 'callconnected' || tel === 'oncall' || tel === 'talking') return 'Unavailable';
  return 'Available';
}

function buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, queueInfo) {
  const resolvedQueueInfo = mergeQueueInfoWithPresence(queueInfo, data);
  const tel = data.telephonyStatus;
  const isOnCall = tel === 'CallConnected' || tel === 'Ringing';
  let direction = null, callDuration = 0, callStartTime = null;
  const displayStatus = deriveDisplayStatus(data, resolvedQueueInfo);
  const queueReadyStatus = deriveQueueReadyStatus(data, resolvedQueueInfo);
  if (isOnCall && data.activeCalls && data.activeCalls.length > 0) {
    const ac = data.activeCalls[0];
    direction = ac.direction;
    callStartTime = ac.startTime || null;
    callDuration = ac.startTime ? Math.floor((Date.now()-new Date(ac.startTime).getTime())/1000) : 0;
  }
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
    activeCalls: data.activeCalls || [],
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
  const nextEntry = buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, queueInfo);
  const prevEntry = lastLiveStatusSnapshot[agent.rc_id];
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

async function fetchCallLogs() {
  try {
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    if (!agents.length) return;
    // Use IST midnight as start of shift day
    const istMidnight = new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}) + 'T00:00:00+05:30');
    console.log(`📞 Fetching calls from IST midnight: ${istMidnight.toISOString()}`);
    try {
      await fetchAccountQueueAbandonCalls(istMidnight, agents);
    } catch (e) {
      console.error('❌ Account call log abandon sync:', e.message);
    }
    for (const agent of agents) {
      try {
        await sleep(3000);
        const r = await platform.get(
          `/restapi/v1.0/account/~/extension/${agent.rc_id}/call-log`,
          { dateFrom: istMidnight.toISOString(), perPage: 200, view: 'Detailed' }
        );
        const d = await r.json();
        for (const call of (d.records || [])) {
          const { ringDuration, holdDuration, transferred, isVoicemail } = parseCallDetails(call);
          await insertCallLog({
            agentId: agent.rc_id, agentName: agent.name,
            callId: call.id, direction: call.direction,
            result: call.result, duration: call.duration || 0,
            ringDuration, holdDuration, transferred, isVoicemail,
            startTime: call.startTime
          });
        }
        console.log(`✅ ${agent.name}: ${(d.records||[]).length} calls today`);
      } catch(e) { console.error(`❌ Call log ${agent.name}:`, e.message); }
    }
    console.log('✅ Call logs synced');
  } catch(e) { console.error('❌ fetchCallLogs:', e.message); }
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
