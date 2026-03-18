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
  } catch(e) { console.error('❌ Authentication failed:', e.message); }
}

async function searchRCUsers(query) {
  try {
    const response = await platform.get('/restapi/v1.0/account/~/extension', {
      status: 'Enabled', type: 'User', perPage: 100
    });
    const data = await response.json();
    const records = data.records || [];
    const q = query.toLowerCase();
    return records
      .filter(r => {
        const name = (r.name || '').toLowerCase();
        const ext = (r.extensionNumber || '').toLowerCase();
        const email = (r.contact && r.contact.email || '').toLowerCase();
        return name.includes(q) || ext.includes(q) || email.includes(q);
      })
      .slice(0, 10)
      .map(r => ({
        id: String(r.id),
        name: r.name,
        extension: r.extensionNumber,
        email: r.contact && r.contact.email || ''
      }));
  } catch(e) {
    console.error('❌ searchRCUsers error:', e.message);
    return [];
  }
}

async function resolveAgentRcIds() {
  const agents = await getMonitoredAgents(); // ✅ fixed
  const unresolved = agents.filter(a => !a.rc_id);
  if (!unresolved.length) return;
  console.log(`🔍 Resolving RC IDs for ${unresolved.length} agents...`);
  for (const agent of unresolved) {
    try {
      const response = await platform.get('/restapi/v1.0/account/~/extension', {
        extensionNumber: agent.extension, status: 'Enabled'
      });
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        const rcId = String(data.records[0].id);
        await updateAgentRcId(agent.extension, rcId); // ✅ fixed
        console.log(`✅ Resolved ${agent.name} → RC ID: ${rcId}`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch(e) { console.error(`❌ Failed to resolve ext ${agent.extension}:`, e.message); }
  }
}

async function fetchPresenceForAll() {
  try {
    await resolveAgentRcIds();
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id); // ✅ fixed
    if (!agents.length) { console.log('⚠️ No monitored agents'); return; }
    console.log(`📋 Fetching presence for ${agents.length} agents...`);
    for (const agent of agents) {
      try {
        const response = await platform.get(`/restapi/v1.0/account/~/extension/${agent.rc_id}/presence`);
        const data = await response.json();
        await insertPresenceEvent(agent.rc_id, agent.name, data.presenceStatus || 'Unknown'); // ✅ fixed
        await new Promise(r => setTimeout(r, 300));
      } catch(e) { console.error(`❌ Presence error for ${agent.name}:`, e.message); }
    }
    console.log('✅ Presence snapshot saved');
  } catch(e) { console.error('❌ fetchPresenceForAll error:', e.message); }
}

async function fetchCallLogs() {
  try {
    const agents = (await getMonitoredAgents()).filter(a => a.rc_id); // ✅ fixed
    if (!agents.length) return;
    const today = new Date(); today.setHours(0,0,0,0);
    console.log(`📞 Fetching call logs for ${agents.length} agents...`);
    for (const agent of agents) {
      try {
        const response = await platform.get(`/restapi/v1.0/account/~/extension/${agent.rc_id}/call-log`, {
          dateFrom: today.toISOString(), perPage: 100, view: 'Detailed'
        });
        const data = await response.json();
        for (const call of (data.records || [])) {
          await insertCallLog({ // ✅ fixed
            agentId: agent.rc_id, agentName: agent.name,
            callId: call.id, direction: call.direction,
            result: call.result, duration: call.duration, startTime: call.startTime
          });
        }
        await new Promise(r => setTimeout(r, 300));
      } catch(e) { console.error(`❌ Call log error for ${agent.name}:`, e.message); }
    }
    console.log('✅ Call logs synced');
  } catch(e) { console.error('❌ fetchCallLogs error:', e.message); }
}

module.exports = { authenticate, fetchPresenceForAll, fetchCallLogs, searchRCUsers };