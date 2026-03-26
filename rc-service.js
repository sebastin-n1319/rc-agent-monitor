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

function normalizeStatus(presenceStatus, telephonyStatus, userStatus, dndStatus) {
  const t = (telephonyStatus || '').toLowerCase();
  const p = (presenceStatus || '').toLowerCase();
  const u = (userStatus || '').toLowerCase();
  const d = (dndStatus || '').toLowerCase();
  // Call state takes priority
  if (t === 'callconnected' || t === 'oncall' || t === 'talking') return 'On Call';
  if (t === 'ringing') return 'Ringing';
  // DND = Unavailable
  if (d === 'donotdisturb') return 'Unavailable';
  // User status (most reliable for available/unavailable)
  if (u === 'available') return 'Available';
  if (u === 'busy' || u === 'unavailable' || u === 'away') return 'Unavailable';
  // Presence status fallback
  if (p === 'available') return 'Available';
  if (p === 'busy' || p === 'unavailable' || p === 'dnd') return 'Unavailable';
  if (p === 'offline') return 'Offline';
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

async function authenticate() {
  try {
    await platform.login({ jwt: process.env.RC_JWT });
    console.log('✅ Authenticated with RingCentral');
  } catch(e) { console.error('❌ Auth failed:', e.message); }
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

async function fetchPresenceForAll() {
  try {
    await resolveAgentRcIds();
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    if (!agents.length) return;
    for (const agent of agents) {
      try {
        const r = await platform.get(
          `/restapi/v1.0/account/~/extension/${agent.rc_id}/presence`,
          { detailedTelephonyState: true }
        );
        const d = await r.json();
        await insertPresenceEvent(agent.rc_id, agent.name,
          normalizeStatus(d.presenceStatus, d.telephonyStatus));
        await sleep(1200);
      } catch(e) { console.error(`❌ Presence ${agent.name}:`, e.message); }
    }
    console.log('✅ Presence snapshot saved');
  } catch(e) { console.error('❌ fetchPresenceForAll:', e.message); }
}

async function fetchCallLogs() {
  try {
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    if (!agents.length) return;
    const today = new Date(); today.setHours(0,0,0,0);
    for (const agent of agents) {
      try {
        await sleep(3000); // 3s between agents to avoid rate limit
        const r = await platform.get(
          `/restapi/v1.0/account/~/extension/${agent.rc_id}/call-log`,
          { dateFrom: today.toISOString(), perPage: 200, view: 'Detailed' }
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
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id);
    const liveStatus = {};
    for (const agent of agents) {
      try {
        const r = await platform.get(
          `/restapi/v1.0/account/~/extension/${agent.rc_id}/presence`,
          { detailedTelephonyState: true }
        );
        const d = await r.json();
        const tel = d.telephonyStatus;
        const isOnCall = tel === 'CallConnected' || tel === 'Ringing';
        let direction = null, callDuration = 0;
        if (isOnCall && d.activeCalls && d.activeCalls.length > 0) {
          const ac = d.activeCalls[0];
          direction = ac.direction;
          callDuration = ac.startTime ? Math.floor((Date.now()-new Date(ac.startTime).getTime())/1000) : 0;
        }
        liveStatus[agent.rc_id] = {
          agentId: agent.rc_id, agentName: agent.name,
          telephonyStatus: tel, isOnCall, direction, callDuration,
          presenceStatus: d.presenceStatus
        };
        await sleep(1000);
      } catch(e) {}
    }
    return liveStatus;
  } catch(e) { return {}; }
}

module.exports = { authenticate, fetchPresenceForAll, fetchCallLogs, searchRCUsers, fetchLiveCallStatus };