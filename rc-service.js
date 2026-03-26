const RC = require('@ringcentral/sdk').SDK;
const { insertPresenceEvent, insertCallLog, getMonitoredAgents, updateAgentRcId } = require('./database');
require('dotenv').config();

const rcsdk = new RC({
  server: process.env.RC_SERVER_URL,
  clientId: process.env.RC_CLIENT_ID,
  clientSecret: process.env.RC_CLIENT_SECRET
});
const platform = rcsdk.platform();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE_STATUS_TTL_MS = Number(process.env.LIVE_STATUS_TTL_MS || 5000);
const QUEUE_STATUS_TTL_MS = Number(process.env.QUEUE_STATUS_TTL_MS || 5000);

let customerServiceQueueId = null;
let lastQueueStatuses = {};
let lastQueueStatusAt = 0;
let lastLiveStatusSnapshot = {};
let lastLiveStatusAt = 0;
let presenceSyncPromise = null;

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

function isRateLimitError(err, data) {
  const msg = `${err?.message || ''} ${data?.message || ''} ${data?.errorCode || ''}`.toLowerCase();
  return msg.includes('rate limit') || msg.includes('rate exceeded') || msg.includes('too many requests') || data?.errorCode === 'CMN-301';
}

function buildLiveStatusEntry(agent, data, fetchedAt) {
  return buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, null);
}

function deriveQueueStatus(queueInfo) {
  if (!queueInfo) return 'Unknown';
  if (queueInfo.acceptQueueCalls === false) return 'All Queues Off';
  if (queueInfo.acceptCurrentQueueCalls === false) return 'This Queue Off';
  return 'In Queue';
}

function deriveQueueAwareStatus(data, queueInfo) {
  const tel = data.telephonyStatus;
  const isOnCall = tel === 'CallConnected' || tel === 'Ringing';
  const activeCall = data.activeCalls && data.activeCalls.length > 0 ? data.activeCalls[0] : null;
  const direction = (activeCall && activeCall.direction || '').toLowerCase();
  const basePresence = normalizePresenceOnly(data.presenceStatus, data.userStatus, data.dndStatus);

  if (!queueInfo) {
    return normalizeStatus(data.presenceStatus, data.telephonyStatus, data.userStatus, data.dndStatus);
  }

  if (queueInfo.acceptQueueCalls === false || queueInfo.acceptCurrentQueueCalls === false) {
    return 'Unavailable';
  }

  if (direction === 'inbound') {
    if (tel === 'Ringing') return 'Ringing';
    if (isOnCall) return 'On Call';
  }

  if (basePresence !== 'Available') return 'Unavailable';

  return 'Available';
}

function buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, queueInfo) {
  const tel = data.telephonyStatus;
  const isOnCall = tel === 'CallConnected' || tel === 'Ringing';
  let direction = null, callDuration = 0, callStartTime = null;
  const normalizedStatus = deriveQueueAwareStatus(data, queueInfo);
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
    normalizedStatus,
    callStartTime,
    fetchedAt,
    queueStatus: deriveQueueStatus(queueInfo),
    acceptQueueCalls: queueInfo ? queueInfo.acceptQueueCalls : null,
    acceptCurrentQueueCalls: queueInfo ? queueInfo.acceptCurrentQueueCalls : null
  };
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
      console.log(`✅ Found queue: "${csQueue.name}" (ID: ${csQueue.id})`);
    } else {
      // Use first queue as fallback
      if (queues.length > 0) {
        customerServiceQueueId = queues[0].id;
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
        const queueInfo = queueStatuses[agent.rc_id] || lastQueueStatuses[agent.rc_id] || null;
        const status = deriveQueueAwareStatus(data, queueInfo);
        const nextEntry = buildQueueAwareLiveStatusEntry(agent, data, fetchedAt, queueInfo);
        const prevEntry = snapshot[agent.rc_id];
        const statusChanged = !prevEntry ||
          prevEntry.normalizedStatus !== nextEntry.normalizedStatus ||
          prevEntry.queueStatus !== nextEntry.queueStatus;

        snapshot[agent.rc_id] = nextEntry;

        if (statusChanged) {
          console.log(`✅ ${agent.name}: ${prevEntry ? prevEntry.normalizedStatus : '--'} → ${status} (${nextEntry.queueStatus})`);
          await insertPresenceEvent(agent.rc_id, agent.name, status, nextEntry.queueStatus);
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
    const hasFreshSnapshot = Object.keys(lastLiveStatusSnapshot).length && (Date.now() - lastLiveStatusAt < LIVE_STATUS_TTL_MS);
    if (!hasFreshSnapshot) {
      if (presenceSyncPromise) {
        await presenceSyncPromise;
      } else {
        await fetchPresenceForAll();
      }
    }
    return lastLiveStatusSnapshot;
  } catch(e) { return lastLiveStatusSnapshot || {}; }
}

module.exports = { authenticate, fetchPresenceForAll, fetchCallLogs, searchRCUsers, fetchLiveCallStatus };
