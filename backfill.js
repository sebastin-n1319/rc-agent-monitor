// ╔══════════════════════════════════════════════════════════════╗
// ║  RC Agent Monitor — 30 Day Call Log Backfill Script         ║
// ║  Run ONCE: node backfill.js                                 ║
// ╚══════════════════════════════════════════════════════════════╝
require('dotenv').config();
const RC = require('@ringcentral/sdk').SDK;
const { initDB, getMonitoredAgents, insertCallLog, updateAgentRcId } = require('./database');

const rcsdk = new RC({
  server: process.env.RC_SERVER_URL,
  clientId: process.env.RC_CLIENT_ID,
  clientSecret: process.env.RC_CLIENT_SECRET
});
const platform = rcsdk.platform();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function backfill() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  RC Agent Monitor — 30 Day Backfill     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Init DB
  await initDB();

  // Auth
  try {
    await platform.login({ jwt: process.env.RC_JWT });
    console.log('✅ Authenticated with RingCentral\n');
  } catch(e) {
    console.error('❌ Auth failed:', e.message);
    process.exit(1);
  }

  const agents = await getMonitoredAgents();
  if (!agents.length) {
    console.log('⚠️  No monitored agents found. Add agents first, then run backfill.');
    process.exit(0);
  }

  console.log(`📋 Found ${agents.length} monitored agents`);
  console.log('─'.repeat(50));

  // Resolve RC IDs for unresolved agents
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
      await sleep(400);
    } catch(e) { console.error(`❌ Could not resolve ${agent.name}`); }
  }

  // Build date range: last 30 days
  const dates = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }

  const resolvedAgents = await getMonitoredAgents();
  const activeAgents = resolvedAgents.filter(a => a.rc_id);

  let totalCalls = 0;
  let totalErrors = 0;

  for (const agent of activeAgents) {
    console.log(`\n👤 ${agent.name} (Ext: ${agent.extension})`);

    for (const date of dates) {
      const dateFrom = new Date(date);
      const dateTo = new Date(date);
      dateTo.setHours(23, 59, 59, 999);

      try {
        let page = 1;
        let pageCalls = 0;

        while (true) {
          const response = await platform.get(
            `/restapi/v1.0/account/~/extension/${agent.rc_id}/call-log`,
            {
              dateFrom: dateFrom.toISOString(),
              dateTo: dateTo.toISOString(),
              perPage: 100,
              page,
              view: 'Detailed'
            }
          );
          const data = await response.json();
          const records = data.records || [];

          for (const call of records) {
            await insertCallLog({
              agentId: agent.rc_id,
              agentName: agent.name,
              callId: call.id,
              direction: call.direction,
              result: call.result,
              duration: call.duration || 0,
              startTime: call.startTime
            });
            pageCalls++;
            totalCalls++;
          }

          if (!data.navigation || !data.navigation.nextPage) break;
          page++;
          await sleep(300);
        }

        if (pageCalls > 0) {
          const ds = date.toLocaleDateString('en-CA');
          process.stdout.write(`  📅 ${ds}: ${pageCalls} calls\n`);
        }

        await sleep(300);
      } catch(e) {
        totalErrors++;
        if (e.message && !e.message.includes('CMN-101')) {
          process.stdout.write(`  ⚠️  ${date.toLocaleDateString('en-CA')}: ${e.message.substring(0,50)}\n`);
        }
      }
    }

    console.log(`  ✅ Done — ${totalCalls} total calls so far`);
    await sleep(500);
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  Backfill Complete!                      ║`);
  console.log(`║  Total calls imported: ${String(totalCalls).padEnd(17)}║`);
  console.log(`║  Errors: ${String(totalErrors).padEnd(31)}║`);
  console.log('╚══════════════════════════════════════════╝\n');
  console.log('✅ Your Reports tab now has 30 days of call history!');
  console.log('   Open the dashboard and check the Reports tab.\n');
  process.exit(0);
}

backfill().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });