require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const {
  initDB, getAgentSummary, addAgent, removeAgent, getMonitoredAgents,
  getPresenceEvents, getAbandonedCalls, insertLoginLog, getLoginLogs,
  getAllRoles, setRole, removeRole, getRoleForEmail
} = require('./database');
const {
  authenticate, fetchPresenceForAll, fetchCallLogs, fetchQueueDashboardSummary, searchRCUsers, fetchLiveCallStatus,
  handleWebhookNotification, liveEvents, getFallbackSyncMs, ensureRealtimeSubscription
} = require('./rc-service');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Set();

function broadcastLiveEvent(payload) {
  const msg = `event: live-update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(msg);
}

initDB().then(() => console.log('DB ready'));

liveEvents.on('update', payload => broadcastLiveEvent(payload));

app.get('/api/summary', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try { res.json({ success: true, date, data: await getAgentSummary(date) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/presence-events', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try { res.json({ success: true, data: await getPresenceEvents(date) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/abandoned-calls', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try { res.json({ success: true, date, data: await getAbandonedCalls(date) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/queue-dashboard', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try { res.json({ success: true, date, data: await fetchQueueDashboardSummary(date) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/agents', async (req, res) => {
  try { res.json({ success: true, data: await getMonitoredAgents() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/agents', async (req, res) => {
  const { name, extension, email } = req.body;
  if (!name || !extension) return res.status(400).json({ success: false, error: 'Name and extension required' });
  try {
    await addAgent(name.trim(), extension.trim(), email ? email.trim() : null);
    res.json({ success: true, message: `${name} added` });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/agents/:extension', async (req, res) => {
  try { await removeAgent(req.params.extension); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/rc-search', async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json({ success: true, data: [] });
  try { res.json({ success: true, data: await searchRCUsers(q) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/live-status', async (req, res) => {
  try { res.json({ success: true, data: await fetchLiveCallStatus() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/live-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/rc-webhook', (req, res) => {
  res.status(200).json({ ok: true, service: 'rc-webhook' });
});

app.head('/api/rc-webhook', (req, res) => {
  res.status(200).end();
});

app.post('/api/rc-webhook', async (req, res) => {
  const validationToken = req.get('Validation-Token');
  if (validationToken) {
    res.set('Validation-Token', validationToken);
    return res.status(200).end();
  }

  res.status(200).json({ ok: true });
  void handleWebhookNotification(req.body);
});

app.post('/api/refresh', async (req, res) => {
  try {
    await fetchPresenceForAll();
    await fetchCallLogs();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Login log - also auto-registers user in access list
app.post('/api/login-log', async (req, res) => {
  const { username, email, role, ip, location, systemInfo } = req.body;
  const realIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ip;
  try {
    await insertLoginLog(username, email, role, realIp, location, systemInfo);
    // Auto-add to roles if not already there (preserves existing role)
    const existingRole = await getRoleForEmail(email);
    if (!existingRole) {
      await setRole(email, 'agent', 'auto');
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/login-logs', async (req, res) => {
  try { res.json({ success: true, data: await getLoginLogs() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/roles', async (req, res) => {
  try { res.json({ success: true, data: await getAllRoles() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/roles', async (req, res) => {
  const { email, role, addedBy } = req.body;
  if (!email || !role) return res.status(400).json({ success: false, error: 'Email and role required' });
  try { await setRole(email.trim(), role, addedBy); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/roles/:email', async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (['sebastin.n@adit.com','ronnie@adit.com','imran@adit.com'].includes(email))
    return res.status(403).json({ success: false, error: 'Cannot remove core admin' });
  try { await removeRole(email); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/role-check', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ success: false });
  try { res.json({ success: true, role: (await getRoleForEmail(email)) || 'agent' }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

async function startScheduler() {
  setInterval(() => { void fetchPresenceForAll(); }, getFallbackSyncMs());
  cron.schedule('*/15 * * * *', async () => { await fetchCallLogs(); });
  console.log(`✅ Scheduler started (fallback sync every ${getFallbackSyncMs()}ms)`);
}

async function start() {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, async () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    try {
      await authenticate();
      await fetchPresenceForAll();
      setTimeout(() => { void fetchCallLogs(); }, 20000);
      await startScheduler();
      setTimeout(() => { void ensureRealtimeSubscription(); }, 15000);
    } catch(e) { console.error('❌ Startup error:', e.message); }
  });
}

start();
