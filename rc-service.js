const RC = require('@ringcentral/sdk').SDK;
const { insertPresenceEvent, insertCallLog, getMonitoredAgents, updateAgentRcId } = require('./database');
require('dotenv').config();

const rcsdk = new RC({
  server: process.env.RC_SERVER_URL,
  clientId: process.env.RC_CLIENT_ID,
  clientSecret: process.env.RC_CLIENT_SECRET
});
const platform = rcsdk.platform();

async function authenticate() {
  try {
    await platform.login({ jwt: process.env.RC_JWT });
    console.log('✅ Authenticated with RingCentral');
  } catch(e) { console.error('❌ Auth failed:', e.message); }
}

async function searchRCUsers(query) {
  try {
    let allRecords = [];
    let page = 1;
    while (true) {
      const response = await platform.get('/restapi/v1.0/account/~/extension', {
        status: 'Enabled', type: 'User', perPage: 200, page
      });
      const data = await response.json();
      const records = data.records || [];
      allRecords = allRecords.concat(records);
      if (!data.navigation || !data.navigation.nextPage) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
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
        id: String(r.id),
        name: r.name,
        extension: r.extensionNumber,
        email: r.contact && r.contact.email || ''
      }));
  } catch(e) { console.error('❌ searchRCUsers:', e.message); return []; }
}

async function resolveAgentRcIds() {
  const agents = await getMonitoredAgents();
  const unresolved = agents.filter(a => !a.rc_id);
  if (!unresolved.length) return;
  for (const agent of unresolved) {
    try {
      const response = await platform.get('/restapi/v1.0/account/~/extension', {
        extensionNumber: agent.extension, status: 'Enabled'
      });
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        await updateAgentRcId(agent.extension, String(data.records[0].id));
        console.log(`✅ Resolved ${agent.name} → ${data.records[0].id}`);
      }
      await new Promise(r => setTimeout(r, 400));
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
        const response = await platform.get(`/restapi/v1.0/account/~/extension/${agent.rc_id}/presence`);
        const data = await response.json();
        await insertPresenceEvent(agent.rc_id, agent.name, data.presenceStatus || 'Unknown');
        await new Promise(r => setTimeout(r, 300));
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
        const response = await platform.get(`/restapi/v1.0/account/~/extension/${agent.rc_id}/call-log`, {
          dateFrom: today.toISOString(), perPage: 200, view: 'Detailed'
        });
        const data = await response.json();
        for (const call of (data.records || [])) {
          await insertCallLog({
            agentId: agent.rc_id, agentName: agent.name,
            callId: call.id, direction: call.direction,
            result: call.result, duration: call.duration, startTime: call.startTime
          });
        }
        await new Promise(r => setTimeout(r, 300));
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
        const response = await platform.get(`/restapi/v1.0/account/~/extension/${agent.rc_id}/presence`, {
          detailedTelephonyState: true
        });
        const data = await response.json();
        const tel = data.telephonyStatus;
        const isOnCall = tel === 'CallConnected' || tel === 'Ringing';
        let direction = null, callDuration = 0;
        if (isOnCall && data.activeCalls && data.activeCalls.length > 0) {
          const activeCall = data.activeCalls[0];
          direction = activeCall.direction;
          const startTime = activeCall.startTime ? new Date(activeCall.startTime).getTime() : Date.now();
          callDuration = Math.floor((Date.now() - startTime) / 1000);
        }
        liveStatus[agent.rc_id] = {
          agentId: agent.rc_id,
          agentName: agent.name,
          telephonyStatus: tel,
          isOnCall,
          direction,
          callDuration,
          presenceStatus: data.presenceStatus
        };
        await new Promise(r => setTimeout(r, 200));
      } catch(e) {}
    }
    return liveStatus;
  } catch(e) { return {}; }
}

module.exports = { authenticate, fetchPresenceForAll, fetchCallLogs, searchRCUsers, fetchLiveCallStatus };