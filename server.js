require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const {
  initDB, getAgentSummary, addAgent, removeAgent, getMonitoredAgents,
  getPresenceEvents, insertLoginLog, getLoginLogs,
  getAllRoles, setRole, removeRole, getRoleForEmail
} = require('./database');
const { authenticate, fetchPresenceForAll, fetchCallLogs, searchRCUsers } = require('./rc-service');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));  // ✅ serve from root (index.html is here)

// ── SUMMARY ──────────────────────────────────────────────────
app.get('/api/summary', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try { res.json({ success: true, date, data: await getAgentSummary(date) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── PRESENCE EVENTS ───────────────────────────────────────────
app.get('/api/presence-events', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try { res.json({ success: true, data: await getPresenceEvents(date) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── AGENTS ───────────────────────────────────────────────────
app.get('/api/agents', async (req, res) => {
  try { res.json({ success: true, data: await getMonitoredAgents() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/agents', async (req, res) => {
  const { name, extension, email } = req.body;
  if (!name || !extension) return res.status(400).json({ success: false, error: 'Name and extension required' });
  try {
    await addAgent(name.trim(), extension.trim(), email ? email.trim() : null);
    await fetchPresenceForAll();
    await fetchCallLogs();
    res.json({ success: true, message: `${name} added` });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/agents/:extension', async (req, res) => {
  try { await removeAgent(req.params.extension); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── RC USER SEARCH (for autocomplete) ────────────────────────
app.get('/api/rc-search', async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json({ success: true, data: [] });
  try {
    const results = await searchRCUsers(q);
    res.json({ success: true, data: results });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── REFRESH ───────────────────────────────────────────────────
app.post('/api/refresh', async (req, res) => {
  try {
    await fetchPresenceForAll();
    await fetchCallLogs();
    res.json({ success: true, message: 'Refreshed' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── LOGIN LOGS ────────────────────────────────────────────────
app.post('/api/login-log', async (req, res) => {
  const { username, email, role, ip, location, systemInfo } = req.body;
  const realIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || ip;
  try {
    await insertLoginLog(username, email, role, realIp, location, systemInfo);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/login-logs', async (req, res) => {
  try { res.json({ success: true, data: await getLoginLogs() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── ROLE MANAGEMENT ───────────────────────────────────────────
app.get('/api/roles', async (req, res) => {
  try { res.json({ success: true, data: await getAllRoles() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/roles', async (req, res) => {
  const { email, role, addedBy } = req.body;
  if (!email || !role) return res.status(400).json({ success: false, error: 'Email and role required' });
  if (!['admin','agent'].includes(role)) return res.status(400).json({ success: false, error: 'Role must be admin or agent' });
  try { await setRole(email.trim(), role, addedBy); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/roles/:email', async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (['sebastin.n@adit.com','ronnie@adit.com','imran@adit.com'].includes(email)) {
    return res.status(403).json({ success: false, error: 'Cannot remove core admin' });
  }
  try { await removeRole(email); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── ROLE CHECK (for login) ────────────────────────────────────
app.get('/api/role-check', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ success: false });
  try {
    const role = await getRoleForEmail(email);
    res.json({ success: true, role: role || 'agent' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── SCHEDULER ─────────────────────────────────────────────────
async function startScheduler() {
  cron.schedule('*/5 * * * *', async () => { console.log('⏰ Presence...'); await fetchPresenceForAll(); });
  cron.schedule('*/15 * * * *', async () => { console.log('⏰ Calls...'); await fetchCallLogs(); });
  console.log('✅ Scheduler started');
}

async function start() {
  try {
    await initDB();
    await authenticate();
    await fetchPresenceForAll();
    await fetchCallLogs();
    await startScheduler();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch(e) { console.error('❌ Startup error:', e.message); }
}

start();