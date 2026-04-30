require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const cron = require('node-cron');
const path = require('path');
const {
  initDB, getAgentSummary, addAgent, removeAgent, getMonitoredAgents,
  getPresenceEvents, getAbandonedCalls, insertLoginLog, getLoginLogs,
  getAllRoles, setRole, setBreakbotEnabled, removeRole, getRoleForEmail, getRoleSettingsForEmail,
  insertBreakEvent, updateBreakEventNotification, getBreakEvents, getBreakTracker,
  getCallLogStats, pruneCallLogs, addAgentNote, getAgentNotes, deleteAgentNote,
  createAppSession, getAppSession, deleteAppSession, pruneExpiredSessions,
  insertAuditLog, getAuditLog,
  getBreakThresholds, setBreakThreshold,
  getBreakReportData,
  pruneOldData, getDbStats
} = require('./database');
const {
  authenticate, fetchPresenceForAll, fetchCallLogs, fetchQueueDashboardSummary, searchRCUsers, fetchLiveCallStatus,
  handleWebhookNotification, liveEvents, getFallbackSyncMs, ensureRealtimeSubscription, getCallSyncStatus
} = require('./rc-service');

const app = express();
const SESSION_COOKIE = 'rcAuthSession';
const SESSION_MAX_AGE_S = 12 * 60 * 60; // 12 hours in seconds

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

// PERF-4: SSE clients tracked with their role for scoped broadcasting
const sseClients = new Map(); // res → { role }
const GOOGLE_CHAT_WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK_URL || '';
const GOOGLE_CHAT_SPACE_LABEL = process.env.GOOGLE_CHAT_SPACE_LABEL || 'Chat space';
const CORE_ADMINS = (process.env.CORE_ADMINS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const NOTIFICATION_BLOCKLIST = (process.env.NOTIFICATION_BLOCKLIST || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// ── Simple in-memory rate limiter ──────────────────────────────────────────
const _rateBuckets = new Map();
function rateLimit(maxReqs, windowMs) {
  return (req, res, next) => {
    const key = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') + req.path;
    const now = Date.now();
    const bucket = _rateBuckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
    bucket.count++;
    _rateBuckets.set(key, bucket);
    if (bucket.count > maxReqs) {
      return res.status(429).json({ success: false, error: 'Too many requests — slow down.' });
    }
    next();
  };
}
// Clean up stale buckets every 10 minutes
setInterval(() => { const now = Date.now(); for (const [k,v] of _rateBuckets) if (now > v.reset) _rateBuckets.delete(k); }, 600000);

function formatBreakDuration(seconds){
  const total = Math.max(0, Number(seconds || 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs) return `${hrs}h ${mins}m`;
  if (mins) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatBreakTime(stamp, timeZone, label){
  return `${stamp.toLocaleTimeString('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })} ${label}`;
}

function getBreakChatMeta(event){
  const actionMap = {
    LOGGED_IN: { lane: 'Logged In', detail: 'Shift started', flow: 'in', emoji: '✅', accent: '🟢' },
    LOGGED_OUT: { lane: 'Logged Out', detail: 'Shift closed', flow: 'out', emoji: '⏹️', accent: '🔴' },
    BRB_OUT: { lane: 'BRB', detail: 'Quick away started', flow: 'out', emoji: '🟠', accent: '🔴' },
    BRB_IN: { lane: 'Logged In', detail: 'Back from BRB', flow: 'in', emoji: '🟢', accent: '🟢' },
    BREAK_OUT: { lane: 'Break', detail: 'Break started', flow: 'out', emoji: '🍵', accent: '🔴' },
    BREAK_IN: { lane: 'Logged In', detail: 'Back from break', flow: 'in', emoji: '🟢', accent: '🟢' },
    TRAINING_OUT: { lane: 'Training / Coaching', detail: 'Coaching started', flow: 'out', emoji: '🎯', accent: '🔴' },
    TRAINING_IN: { lane: 'Logged In', detail: 'Back from coaching', flow: 'in', emoji: '🟢', accent: '🟢' },
    QA_SESSION_OUT: { lane: 'QA Session AUX', detail: 'QA AUX started', flow: 'out', emoji: '🧪', accent: '🔴' },
    QA_SESSION_IN: { lane: 'Logged In', detail: 'Back from QA AUX', flow: 'in', emoji: '🟢', accent: '🟢' },
    INTERNAL_CALL_OUT: { lane: 'Internal Calls', detail: 'Internal call started', flow: 'out', emoji: '📞', accent: '🔴' },
    INTERNAL_CALL_IN: { lane: 'Logged In', detail: 'Back from internal call', flow: 'in', emoji: '🟢', accent: '🟢' }
  };
  return actionMap[event.action] || {
    lane: event.currentStatus || 'Updated',
    detail: event.actionLabel || 'Status updated',
    flow: 'out',
    emoji: '📣',
    accent: '🔴'
  };
}

function broadcastLiveEvent(payload, targetRole) {
  const msg = `event: live-update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [res, meta] of sseClients) {
    if (!targetRole || targetRole === 'all' || meta.role === targetRole) {
      res.write(msg);
    }
  }
}

function formatBreakChatMessage(event){
  const stamp = new Date(String(event.createdAt).replace(' ', 'T') + 'Z');
  const timeCst = formatBreakTime(stamp, 'America/Chicago', 'CST');
  const timeIst = formatBreakTime(stamp, 'Asia/Kolkata', 'IST');
  const meta = getBreakChatMeta(event);
  const detailLine = event.linkedDurationSeconds
    ? `${meta.detail} · ${formatBreakDuration(event.linkedDurationSeconds)}`
    : meta.detail;
  return [
    `${meta.emoji} ${event.username} · ${meta.flow === 'in' ? 'IN' : 'OUT'}`,
    `Status: ${meta.lane}`,
    detailLine,
    `IST: ${timeIst} · CST: ${timeCst}`,
    event.note ? `Reason: ${event.note}` : null
  ].filter(Boolean).join('\n');
}

function buildBreakChatPayload(event){
  const stamp = new Date(String(event.createdAt).replace(' ', 'T') + 'Z');
  const timeCst = formatBreakTime(stamp, 'America/Chicago', 'CST');
  const timeIst = formatBreakTime(stamp, 'Asia/Kolkata', 'IST');
  const meta = getBreakChatMeta(event);
  const directionLabel = meta.flow === 'in' ? 'IN' : 'OUT';
  const detailLine = event.linkedDurationSeconds
    ? `${meta.detail} · ${formatBreakDuration(event.linkedDurationSeconds)}`
    : meta.detail;
  const widgets = [
    {
      decoratedText: {
        topLabel: 'Update',
        text: `${meta.emoji} ${detailLine}`
      }
    },
    {
      decoratedText: {
        topLabel: 'Primary time',
        text: `🕒 IST ${timeIst}`
      }
    },
    {
      decoratedText: {
        topLabel: 'Reference time',
        text: `CST ${timeCst}`
      }
    }
  ];

  if (event.note) {
    widgets.push({
      decoratedText: {
        topLabel: 'Reason',
        text: event.note
      }
    });
  }

  return {
    cardsV2: [
      {
        cardId: 'break-bot-status',
        card: {
          header: {
            title: `${event.username}`,
            subtitle: `${meta.accent} ${directionLabel} · ${meta.lane}`
          },
          sections: [
            {
              widgets
            }
          ]
        }
      }
    ]
  };
}

async function sendBreakChatNotification(event){
  if(!GOOGLE_CHAT_WEBHOOK_URL){
    return { notified: false, status: 'disabled', response: 'GOOGLE_CHAT_WEBHOOK_URL not configured' };
  }
  const payload = buildBreakChatPayload(event);
  const resp = await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  return {
    notified: resp.ok,
    status: resp.ok ? 'sent' : `http_${resp.status}`,
    response: text || resp.statusText || 'ok'
  };
}

initDB().then(() => console.log('DB ready'));

liveEvents.on('update', payload => broadcastLiveEvent(payload));

// ── Named constants (PERF-1) ──────────────────────────────────────────────────
const SESSION_TTL_H      = 12;          // hours — session lifetime
const BREAK_BRB_LIMIT_M  = 10;         // minutes — single BRB limit
const BREAK_DAY_LIMIT_M  = 60;         // minutes — total break per day
const CALL_LOG_RETAIN_D  = 7;          // days — call log retention

// ── Auth middleware (SEC-1 + SEC-2) ──────────────────────────────────────────
// requireAuth: validates session cookie; attaches session to req.session
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const session = await getAppSession(token);
    if (!session) return res.status(401).json({ success: false, error: 'Session expired — please sign in again' });
    req.session = session;
    next();
  } catch(e) { res.status(500).json({ success: false, error: 'Auth check failed' }); }
}

// requireAdmin: extends requireAuth, also checks admin role
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    try {
      const settings = await getRoleSettingsForEmail(req.session.email);
      if (!settings || settings.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      next();
    } catch(e) { res.status(500).json({ success: false, error: 'Role check failed' }); }
  });
}

app.get('/api/summary', requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  try { res.json({ success: true, date, timeZone: tz, data: await getAgentSummary(date, tz) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// FEAT-7: 7-day trend data — returns per-agent daily summaries for the last N days
app.get('/api/trend', requireAuth, rateLimit(10, 60000), async (req, res) => {
  const tz = req.query.tz || 'America/Chicago';
  const days = Math.min(parseInt(req.query.days) || 7, 14);
  try {
    const results = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
      const summary = await getAgentSummary(dateStr, tz);
      results.push({ date: dateStr, agents: summary });
    }
    res.json({ success: true, days, timeZone: tz, data: results });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/presence-events', requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  try { res.json({ success: true, date, timeZone: tz, data: await getPresenceEvents(date, tz) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/abandoned-calls', requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  try { res.json({ success: true, date, timeZone: tz, data: await getAbandonedCalls(date, tz) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/queue-dashboard', requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  try { res.json({ success: true, date, timeZone: tz, data: await fetchQueueDashboardSummary(date, false, tz) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/agents', requireAuth, async (req, res) => {
  try { res.json({ success: true, data: await getMonitoredAgents() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/agents', requireAdmin, async (req, res) => {
  const { name, extension, email } = req.body;
  if (!name || !extension) return res.status(400).json({ success: false, error: 'Name and extension required' });
  try {
    await addAgent(name.trim(), extension.trim(), email ? email.trim() : null);
    insertAuditLog(req.session.email, 'agent_added', name.trim(), `ext:${extension}`).catch(()=>{});
    res.json({ success: true, message: `${name} added` });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/agents/:extension', requireAdmin, async (req, res) => {
  try {
    await removeAgent(req.params.extension);
    insertAuditLog(req.session.email, 'agent_removed', req.params.extension).catch(()=>{});
    res.json({ success: true });
  }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/rc-search', requireAuth, rateLimit(20, 60000), async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json({ success: true, data: [] });
  try { res.json({ success: true, data: await searchRCUsers(q) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/live-status', requireAuth, async (req, res) => {
  try { res.json({ success: true, data: await fetchLiveCallStatus() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/live-stream', requireAuth, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  // Store client with role for scoped broadcasting (PERF-4)
  const clientRole = req.session?.email
    ? await getRoleSettingsForEmail(req.session.email).then(s => s?.role || 'agent').catch(() => 'agent')
    : 'agent';
  sseClients.set(res, { role: clientRole });
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
  handleWebhookNotification(req.body).catch(e => console.error('❌ webhook handler:', e.message));
});

app.post('/api/refresh', requireAdmin, rateLimit(5, 60000), async (req, res) => {
  try {
    await fetchPresenceForAll();
    await fetchCallLogs();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Agent Notes
app.get('/api/agent-notes/:agentId', requireAuth, async (req, res) => {
  try { res.json({ success: true, data: await getAgentNotes(req.params.agentId) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/agent-notes', requireAuth, async (req, res) => {
  const { agentId, agentName, note, addedBy } = req.body || {};
  if (!agentId || !note) return res.status(400).json({ success: false, error: 'agentId and note required' });
  if (note.length > 500) return res.status(400).json({ success: false, error: 'Note must be 500 chars or fewer' });
  try { res.json({ success: true, data: await addAgentNote(agentId, agentName, note.trim(), addedBy) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.delete('/api/agent-notes/:id', requireAuth, async (req, res) => {
  try { await deleteAgentNote(req.params.id); res.json({ success: true }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/call-logs', requireAuth, async (req, res) => {
  const tz = req.query.tz || 'Asia/Kolkata';
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const limit = Math.min(parseInt(req.query.limit) || 200, 500);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const { getCallLogsFull } = require('./database');
    const data = await getCallLogsFull(date, tz, limit, offset);
    res.json({ success: true, date, timeZone: tz, ...data });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/call-volume', requireAuth, async (req, res) => {
  const tz = req.query.tz || 'Asia/Kolkata';
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
  try {
    const { getCallVolume } = require('./database');
    const data = await getCallVolume(date, tz);
    res.json({ success: true, date, timeZone: tz, data });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/sync-status', requireAuth, async (req, res) => {
  try {
    const syncInfo = getCallSyncStatus();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const callStats = await getCallLogStats(today);
    res.json({ success: true, sync: syncInfo, callLogs: callStats, today });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/force-call-sync', requireAdmin, rateLimit(3, 60000), async (req, res) => {
  try {
    const result = await fetchCallLogs(true);
    res.json({ success: true, result });
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

app.get('/api/login-logs', requireAdmin, async (req, res) => {
  try { res.json({ success: true, data: await getLoginLogs() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/break-events', requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  const email = req.query.email || null;
  try {
    res.json({ success: true, date, timeZone: tz, data: await getBreakEvents(date, tz, email) });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/break-tracker', requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  const email = req.query.email || null;
  try {
    res.json({
      success: true,
      date,
      timeZone: tz,
      chat: {
        enabled: !!GOOGLE_CHAT_WEBHOOK_URL,
        target: GOOGLE_CHAT_SPACE_LABEL
      },
      data: await getBreakTracker(date, tz, email)
    });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const VALID_BREAK_ACTIONS = new Set([
  'LOGGED_IN','LOGGED_OUT',
  'BRB_OUT','BRB_IN',
  'BREAK_OUT','BREAK_IN',
  'TRAINING_OUT','TRAINING_IN',
  'QA_SESSION_OUT','QA_SESSION_IN',
  'INTERNAL_CALL_OUT','INTERNAL_CALL_IN'
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/break-events', requireAuth, async (req, res) => {
  const { username, email, role, action, note, skipNotify } = req.body || {};
  if(!username || !email || !action)
    return res.status(400).json({ success: false, error: 'Username, email, and action are required' });
  if(!EMAIL_RE.test(email))
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  // SEC-3: Enforce that agents can only log breaks for themselves; admins can log for anyone
  const sessionSettings = await getRoleSettingsForEmail(req.session.email).catch(() => null);
  const isAdmin = sessionSettings?.role === 'admin';
  if (!isAdmin && email.toLowerCase() !== req.session.email.toLowerCase())
    return res.status(403).json({ success: false, error: 'You can only log break events for yourself' });
  if(!VALID_BREAK_ACTIONS.has(action))
    return res.status(400).json({ success: false, error: `Invalid action. Must be one of: ${[...VALID_BREAK_ACTIONS].join(', ')}` });
  if(note && note.length > 500)
    return res.status(400).json({ success: false, error: 'Note must be 500 characters or fewer' });
  if(username.length > 120)
    return res.status(400).json({ success: false, error: 'Username too long' });

  try {
    const event = await insertBreakEvent({ username, email, role, action, note });
    let notification = { notified: false, status: 'skipped', response: 'Not attempted' };
    if(skipNotify || NOTIFICATION_BLOCKLIST.includes((email || '').toLowerCase().trim())) {
      notification = { notified: false, status: 'disabled', response: 'Notifications disabled for this user' };
    } else {
      try {
        notification = await sendBreakChatNotification(event);
      } catch (notifyError) {
        notification = { notified: false, status: 'failed', response: notifyError.message };
      }
    }
    await updateBreakEventNotification(event.id, notification.notified, notification.status, notification.response);
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const tz = req.body.tz || 'America/Chicago';
    res.json({
      success: true,
      message: `${event.actionLabel} saved`,
      notification: {
        ...notification,
        target: GOOGLE_CHAT_SPACE_LABEL
      },
      data: {
        event: {
          ...event,
          notified: notification.notified,
          notifyStatus: notification.status,
          notifyResponse: notification.response
        },
        tracker: await getBreakTracker(date, tz, email)
      }
    });
  } catch(e) {
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

app.get('/api/roles', requireAdmin, async (req, res) => {
  try { res.json({ success: true, data: await getAllRoles() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/roles', requireAdmin, async (req, res) => {
  const { email, role, addedBy, breakbotEnabled } = req.body;
  if (!email || !role) return res.status(400).json({ success: false, error: 'Email and role required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Invalid email format' });
  if (!['admin','agent','readonly'].includes(role)) return res.status(400).json({ success: false, error: 'Role must be admin, agent, or readonly' });
  try {
    await setRole(email.trim(), role, addedBy, breakbotEnabled);
    insertAuditLog(req.session.email, 'role_set', email.trim(), `role:${role}`).catch(()=>{});
    res.json({ success: true });
  }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.patch('/api/roles/:email/breakbot', requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { enabled, updatedBy } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  try {
    await setBreakbotEnabled(email, enabled, updatedBy || 'system');
    insertAuditLog(req.session.email, 'breakbot_toggled', email, `enabled:${enabled}`).catch(()=>{});
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/api/roles/:email', requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (CORE_ADMINS.includes(email.toLowerCase()))
    return res.status(403).json({ success: false, error: 'Cannot remove core admin' });
  try {
    await removeRole(email);
    insertAuditLog(req.session.email, 'role_removed', email).catch(()=>{});
    res.json({ success: true });
  }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin announcement — sends a free-form card to the Google Chat space
app.post('/api/announce', requireAdmin, rateLimit(5, 60000), async (req, res) => {
  const { title, body, emoji, requester } = req.body || {};
  if(!title || !body) return res.status(400).json({ success: false, error: 'title and body required' });
  if(!GOOGLE_CHAT_WEBHOOK_URL) return res.status(503).json({ success: false, error: 'Webhook not configured' });
  try {
    const now = new Date();
    const cst = now.toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hour12:true});
    const ist = now.toLocaleTimeString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true});
    const payload = {
      cardsV2: [{
        cardId: 'admin-announce',
        card: {
          header: {
            title: `${emoji||'📢'} ${title}`,
            subtitle: `Posted by ${requester||'Admin'} · ${ist} IST / ${cst} CST`
          },
          sections: [{
            widgets: [{
              decoratedText: { topLabel: 'Message', text: body, wrapText: true }
            }]
          }]
        }
      }]
    };
    const resp = await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    res.json({ success: resp.ok, status: resp.status, response: text });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/role-check', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ success: false });
  try {
    const settings = await getRoleSettingsForEmail(email);
    res.json({
      success: true,
      role: settings?.role || 'agent',
      breakbotEnabled: settings ? settings.breakbotEnabled : true
    });
  }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Server-side sessions via DB token + plain cookie ─────────────────────────
// Token is a 32-byte random hex string stored in app_sessions table.
// The cookie holds only the token — no secrets, survives server restarts.

function setCookieToken(res, token) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
  res.cookie(SESSION_COOKIE, token, {
    maxAge: SESSION_MAX_AGE_S * 1000,
    httpOnly: true,    // not readable by JS — only sent automatically by browser
    secure: !!isProduction, // HTTPS-only on Railway, allows HTTP in local dev
    sameSite: 'lax',
    path: '/'
  });
}

// POST /api/session — called after Google sign-in; creates DB session + sets cookie
app.post('/api/session', async (req, res) => {
  const { email, name, picture } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'email required' });
  const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'adit.com';
  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    return res.status(403).json({ success: false, error: 'Not authorised' });
  }
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await createAppSession(token, email, name || '', picture || '');
    setCookieToken(res, token);
    // Look up role — default to 'agent' if not in app_roles yet
    const settings = await getRoleSettingsForEmail(email).catch(() => null);
    const role = settings?.role || 'agent';
    const breakbotEnabled = settings ? settings.breakbotEnabled !== false : true;
    res.json({ success: true, role, breakbotEnabled });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/session — on page load, check cookie token in DB
app.get('/api/session', async (req, res) => {
  try {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return res.json({ success: false });
    const session = await getAppSession(token); // also rolls expiry
    if (!session) return res.json({ success: false });
    // Look up role — default to 'agent' if not in app_roles (don't block the session)
    const settings = await getRoleSettingsForEmail(session.email).catch(() => null);
    const role = settings?.role || 'agent';
    const breakbotEnabled = settings ? settings.breakbotEnabled !== false : true;
    setCookieToken(res, token); // refresh cookie max-age
    res.json({
      success: true,
      email: session.email,
      name: session.name,
      picture: session.picture,
      role,
      breakbotEnabled
    });
  } catch(e) { res.json({ success: false }); }
});

// DELETE /api/session — called on logout
app.delete('/api/session', async (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await deleteAppSession(token).catch(() => {});
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// FEAT-4: Audit log endpoint
app.get('/api/audit-log', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    res.json({ success: true, data: await getAuditLog(limit) });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Break threshold endpoints
app.get('/api/break-thresholds', requireAuth, async (req, res) => {
  try { res.json({ success: true, data: await getBreakThresholds() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/break-thresholds', requireAdmin, async (req, res) => {
  const { aux_type, single_limit_minutes, daily_limit_minutes } = req.body || {};
  const VALID_AUX = ['BRB','BREAK','TRAINING','QA_SESSION','INTERNAL_CALL'];
  if(!aux_type || !VALID_AUX.includes(aux_type))
    return res.status(400).json({ success: false, error: 'Invalid aux_type' });
  const single = single_limit_minutes === null || single_limit_minutes === '' ? null : parseInt(single_limit_minutes);
  const daily  = daily_limit_minutes  === null || daily_limit_minutes  === '' ? null : parseInt(daily_limit_minutes);
  if(single !== null && (isNaN(single) || single < 1 || single > 1440))
    return res.status(400).json({ success: false, error: 'single_limit_minutes must be 1–1440 or null' });
  if(daily !== null && (isNaN(daily) || daily < 1 || daily > 1440))
    return res.status(400).json({ success: false, error: 'daily_limit_minutes must be 1–1440 or null' });
  try {
    await setBreakThreshold(aux_type, single, daily, req.session.email);
    insertAuditLog(req.session.email, 'threshold_updated', aux_type,
      `single:${single??'none'} daily:${daily??'none'}`).catch(()=>{});
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Break Report ─────────────────────────────────────────────────────────────
const AUX_NAMES = { BRB:'BRB', BREAK:'Break', TRAINING:'Training', QA_SESSION:'QA Session', INTERNAL_CALL:'Internal Call' };

function fmtMin(m){ const v=Math.round(m||0); return v<60?v+'m':`${Math.floor(v/60)}h ${v%60}m`; }

function buildReportChatPayload(data, label){
  const { agents } = data;
  const exceeded = agents.filter(a=>a.overallStatus==='exceeded');
  const warning  = agents.filter(a=>a.overallStatus==='warning');
  const ok       = agents.filter(a=>a.overallStatus==='ok');

  const fmt = (a) => {
    const parts = Object.entries(a.compliance).map(([aux,c])=>`${AUX_NAMES[aux]||aux}: ${fmtMin(c.mins)}${c.daily_limit?'/'+(c.daily_limit)+'m':''}`);
    return `• ${a.username}${parts.length?' — '+parts.join(' | '):''}`;
  };

  let body = '';
  if(exceeded.length) body += `🔴 *EXCEEDED LIMITS (${exceeded.length})*\n${exceeded.map(fmt).join('\n')}\n\n`;
  if(warning.length)  body += `🟡 *APPROACHING LIMIT (${warning.length})*\n${warning.map(fmt).join('\n')}\n\n`;
  if(ok.length)       body += `✅ *WITHIN LIMITS (${ok.length})*\n${ok.map(fmt).join('\n')}`;

  // Team totals
  const totals = {};
  agents.forEach(a => Object.entries(a.totals).forEach(([k,v])=>{ totals[k]=(totals[k]||0)+v; }));
  const totStr = Object.entries(totals).map(([k,v])=>`${AUX_NAMES[k]||k}: ${fmtMin(v)}`).join(' | ');
  const summary = `👥 ${agents.length} agents tracked · ${totStr||'No break data'}`;

  return {
    cardsV2:[{ cardId:'break-report', card:{
      header:{ title:`📊 Break Report — ${label}`, subtitle: summary },
      sections:[{ widgets:[{ textParagraph:{ text: body.trim()||'No break events recorded for this period.' } }] }]
    }}]
  };
}

// GET /api/break-report — fetch report data (preview)
app.get('/api/break-report', requireAdmin, async (req, res) => {
  const tz = req.query.tz || 'America/Chicago';
  const start = req.query.start;
  const end   = req.query.end || start;
  if(!start) return res.status(400).json({ success:false, error:'start date required' });
  try {
    const data = await getBreakReportData(start, end, tz);
    res.json({ success:true, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// POST /api/break-report/send — generate + send to Google Chat
app.post('/api/break-report/send', requireAdmin, rateLimit(10,60000), async (req, res) => {
  const { start, end, tz='America/Chicago', label='Break Report', target='chat' } = req.body||{};
  if(!start) return res.status(400).json({ success:false, error:'start date required' });
  try {
    const data = await getBreakReportData(start, end||start, tz);
    const payload = buildReportChatPayload(data, label);
    let sent = false, chatErr = null;
    if(target==='chat' || target==='both'){
      if(!GOOGLE_CHAT_WEBHOOK_URL) { chatErr='Google Chat webhook not configured'; }
      else {
        const r = await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
          method:'POST', headers:{'Content-Type':'application/json; charset=UTF-8'},
          body: JSON.stringify(payload)
        });
        sent = r.ok;
        if(!r.ok) chatErr = `Webhook returned HTTP ${r.status}`;
      }
    }
    insertAuditLog(req.session.email, 'report_sent', label, `start:${start} end:${end||start} target:${target}`).catch(()=>{});
    res.json({ success:true, sent, chatErr, agentCount:data.agents.length, data });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// FEAT-5: CSV export endpoints
app.get('/api/export/break-tracker', requireAdmin, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const tz = req.query.tz || 'America/Chicago';
  try {
    const data = await getBreakTracker(date, tz);
    const rows = [['Agent','Email','Action','Note','Created At (UTC)','Duration (min)']];
    for (const agent of data) {
      for (const evt of (agent.events || [])) {
        rows.push([
          agent.username || '', agent.email || '',
          evt.action || '', (evt.note || '').replace(/,/g,''),
          evt.createdAt || '',
          evt.linkedDurationSeconds ? Math.round(evt.linkedDurationSeconds/60) : ''
        ]);
      }
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="break-tracker-${date}.csv"`);
    res.send(csv);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/export/call-logs', requireAdmin, async (req, res) => {
  const tz = req.query.tz || 'Asia/Kolkata';
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
  try {
    const { getCallLogsFull } = require('./database');
    const { rows } = await getCallLogsFull(date, tz, 1000, 0);
    const header = ['Agent','Direction','Result','Duration (s)','From','To','Queue','Start Time'];
    const data = [header, ...(rows||[]).map(r => [
      r.agent_name||'', r.direction||'', r.result||'',
      r.duration||0, r.from_number||'', r.to_number||'',
      r.queue_name||'', r.start_time||''
    ])];
    const csv = data.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="call-logs-${date}.csv"`);
    res.send(csv);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// DB stats + manual cleanup endpoints (admin only)
app.get('/api/db-stats', requireAdmin, async (req, res) => {
  try { res.json({ success: true, data: await getDbStats() }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/db-cleanup', requireAdmin, rateLimit(2, 3600000), async (req, res) => {
  try {
    console.log('🧹 Manual DB cleanup triggered by', req.session?.email);
    const results = await pruneOldData();
    insertAuditLog(req.session?.email||'system', 'db_cleanup', 'manual', JSON.stringify(results)).catch(()=>{});
    res.json({ success: true, results });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

async function startScheduler() {
  setInterval(() => { fetchPresenceForAll().catch(e => console.error('❌ presence sync:', e.message)); }, getFallbackSyncMs());
  cron.schedule('*/15 * * * *', async () => { fetchCallLogs().catch(e => console.error('❌ call log cron:', e.message)); });
  // Prune call logs older than 7 days at 1am IST daily
  cron.schedule('30 19 * * *', async () => { pruneCallLogs(7).catch(e => console.error('❌ pruneCallLogs:', e.message)); });
  // Prune expired sessions daily
  cron.schedule('0 20 * * *', async () => { pruneExpiredSessions().catch(e => console.error('❌ pruneExpiredSessions:', e.message)); });
  // Full data prune + VACUUM daily at 2am IST (cleans presence_events, login_logs, break_events, etc.)
  cron.schedule('30 20 * * *', async () => {
    try {
      const r = await pruneOldData();
      console.log('🧹 Daily prune+vacuum done:', JSON.stringify(r));
    } catch(e) { console.error('❌ daily prune:', e.message); }
  });
  console.log(`✅ Scheduler started (fallback sync every ${getFallbackSyncMs()}ms)`);
}

async function start() {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, async () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    try {
      await authenticate();
      await fetchPresenceForAll();
      setTimeout(() => { fetchCallLogs().catch(e => console.error('❌ startup call log:', e.message)); }, 20000);
      await startScheduler();
      setTimeout(() => { ensureRealtimeSubscription().catch(e => console.error('❌ realtime sub:', e.message)); }, 15000);
    } catch(e) { console.error('❌ Startup error:', e.message); }
  });
}

start();
