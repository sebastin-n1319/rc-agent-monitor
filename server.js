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
  createAppSession, getAppSession, deleteAppSession, pruneExpiredSessions, getPictureForEmail,
  insertAuditLog, getAuditLog,
  getBreakThresholds, setBreakThreshold,
  getBreakReportData,
  pruneOldData, getDbStats
} = require('./database');
const {
  authenticate, fetchPresenceForAll, fetchCallLogs, fetchQueueDashboardSummary, searchRCUsers, fetchLiveCallStatus,
  handleWebhookNotification, liveEvents, getFallbackSyncMs, ensureRealtimeSubscription, getCallSyncStatus
} = require('./rc-service');
const { runArchive, getDbSizeMB } = require('./archive-service');

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
const TICKET_SHEET_ID = process.env.TICKET_SHEET_ID || '105ML5aHdxEJjCxa87zCniTx7VKH6wI7eBXOWjRg6U7Y';
const TICKET_SHEET_TAB = 'Working';
const CORE_ADMINS = (process.env.CORE_ADMINS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const NOTIFICATION_BLOCKLIST = (process.env.NOTIFICATION_BLOCKLIST || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
// Test/demo accounts — always blocked from notifications and break tracking display
const TEST_ACCOUNTS = new Set(['test.agent@adit.com']);
function isTestAccount(email){ return TEST_ACCOUNTS.has((email||'').toLowerCase().trim()); }

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

async function buildBreakChatPayload(event){
  const stamp = new Date(String(event.createdAt).replace(' ', 'T') + 'Z');
  const timeCst = formatBreakTime(stamp, 'America/Chicago', 'CST');
  const timeIst = formatBreakTime(stamp, 'Asia/Kolkata', 'IST');
  const meta = getBreakChatMeta(event);
  const isOut = meta.flow === 'out';
  const directionLabel = isOut ? 'OUT' : 'IN';

  // Use real Google profile picture if available, fallback to initials avatar
  const googlePic = await getPictureForEmail(event.email).catch(() => null);
  const avatarName = encodeURIComponent(event.username || 'Agent');
  const avatarUrl  = googlePic
    || `https://ui-avatars.com/api/?name=${avatarName}&background=072B40&color=ffffff&size=128&bold=true`;

  const widgets = [
    {
      decoratedText: {
        topLabel: 'Update',
        text: `${meta.emoji} ${meta.detail}`,
        bottomLabel: `Lane: ${meta.lane}`
      }
    },
    {
      decoratedText: {
        topLabel: '🇮🇳 IST (Primary)',
        text: `🕒 ${timeIst}`
      }
    },
    {
      decoratedText: {
        topLabel: '🇺🇸 CST (Reference)',
        text: `${timeCst}`
      }
    }
  ];

  // Duration — shown on return events
  if (event.linkedDurationSeconds) {
    widgets.push({
      decoratedText: {
        topLabel: 'Duration',
        text: `⏱ ${formatBreakDuration(event.linkedDurationSeconds)}`
      }
    });
  }

  // Reason — shown if agent selected a break category
  if (event.note) {
    widgets.push({
      decoratedText: {
        topLabel: 'Reason',
        text: `${event.note}`
      }
    });
  }

  return {
    cardsV2: [
      {
        cardId: `break-${event.action}-${Date.now()}`,
        card: {
          header: {
            title: event.username || 'Agent',
            subtitle: `${meta.accent} ${directionLabel} · ${meta.lane}`,
            imageUrl: avatarUrl,
            imageType: 'CIRCLE',
            imageAltText: `${event.username} avatar`
          },
          sections: [{ widgets }]
        }
      }
    ]
  };
}

async function sendBreakChatNotification(event){
  if(!GOOGLE_CHAT_WEBHOOK_URL){
    return { notified: false, status: 'disabled', response: 'GOOGLE_CHAT_WEBHOOK_URL not configured' };
  }
  const payload = await buildBreakChatPayload(event);
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

initDB().then(async () => {
  console.log('DB ready');
  // Run cleanup immediately on startup to reclaim space (volume limit = 500MB)
  try {
    const r = await pruneOldData();
    console.log('🧹 Startup prune+vacuum:', JSON.stringify(r));
  } catch(e) { console.error('❌ startup prune:', e.message); }
});

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
    if(skipNotify || isTestAccount(email) || NOTIFICATION_BLOCKLIST.includes((email || '').toLowerCase().trim())) {
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
    const { archive = false } = req.body || {};
    console.log('🧹 Manual DB cleanup triggered by', req.session?.email, archive ? '+ archive' : '');
    // Optionally archive first
    let archiveResult = null;
    if (archive) {
      archiveResult = await runArchive(true); // force=true ignores threshold
      if (archiveResult) insertAuditLog(req.session?.email||'system', 'manual_archive', 'google_sheets', JSON.stringify(archiveResult)).catch(()=>{});
    }
    const results = await pruneOldData();
    insertAuditLog(req.session?.email||'system', 'db_cleanup', 'manual', JSON.stringify(results)).catch(()=>{});
    res.json({ success: true, results, archiveResult });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Zoho Desk Integration ─────────────────────────────────────────────────────
const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID     || '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || '';
const ZOHO_DESK_ORG_ID   = process.env.ZOHO_DESK_ORG_ID   || '';
const ZOHO_API_BASE      = 'https://desk.zoho.com/api/v1';

// In-memory token cache (refresh_token gives us a new access_token when needed)
let _zohoToken = null;
let _zohoTokenExpiry = 0;

async function getZohoAccessToken() {
  if (_zohoToken && Date.now() < _zohoTokenExpiry - 60000) return _zohoToken;
  if (!ZOHO_CLIENT_ID || !ZOHO_REFRESH_TOKEN) throw new Error('Zoho not configured');
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Zoho token refresh failed: ' + JSON.stringify(data));
  _zohoToken       = data.access_token;
  _zohoTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _zohoToken;
}

async function zohoDesk(path, params = {}) {
  const token = await getZohoAccessToken();
  const qs    = new URLSearchParams(params).toString();
  const url   = `${ZOHO_API_BASE}${path}${qs ? '?' + qs : ''}`;
  const res   = await fetch(url, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'orgId': ZOHO_DESK_ORG_ID,
    },
  });
  if (!res.ok) throw new Error(`Zoho API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Map Zoho channel → our channel names
function mapZohoChannel(ch) {
  const m = { EMAIL: 'Email', CHAT: 'Chat', PHONE: 'Phone', WEB: 'Web',
              EMAIL_IN:'Email', TWITTER:'Web', FACEBOOK:'Web', WHATSAPP:'Chat' };
  return m[(ch||'').toUpperCase()] || 'Email';
}
// Map Zoho category/tags → our ticket types
function mapZohoType(ticket) {
  const cat = ((ticket.category || ticket.subCategory || ticket.classification || '')).toLowerCase();
  if (cat.includes('follow') || cat.includes('follow-up')) return 'Follow-up Ticket';
  if (cat.includes('reopen'))  return 'Reopened Ticket';
  if (cat.includes('transfer') && cat.includes('in'))  return 'Transfer-In Ticket';
  if (cat.includes('transfer')) return 'New Ticket - Transferred';
  if (cat.includes('merge'))   return 'Merged Ticket';
  if (cat.includes('outbound') || cat.includes('proactive')) return 'Outbound Ticket';
  if (cat.includes('feedback') || cat.includes('csat')) return 'Feedback Ticket';
  if (cat.includes('spam') || cat.includes('auto'))   return 'Auto-Generated/Spam Ticket';
  return 'New Ticket';
}

// GET /api/zoho/ping — test Zoho connectivity using tickets scope (admin only)
app.get('/api/zoho/ping', requireAdmin, async (req, res) => {
  try {
    if (!ZOHO_CLIENT_ID)     return res.json({ ok:false, step:'config', error:'ZOHO_CLIENT_ID not set' });
    if (!ZOHO_REFRESH_TOKEN) return res.json({ ok:false, step:'config', error:'ZOHO_REFRESH_TOKEN not set' });
    if (!ZOHO_DESK_ORG_ID)  return res.json({ ok:false, step:'config', error:'ZOHO_DESK_ORG_ID not set' });
    // Step 1: get access token
    const token = await getZohoAccessToken();
    // Step 2: test with /tickets (within our Desk.tickets.ALL scope)
    const r = await fetch(`${ZOHO_API_BASE}/tickets?limit=1`, {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID }
    });
    const body = await r.json();
    if (!r.ok) return res.json({ ok:false, step:'api', status:r.status, body });
    res.json({ ok:true, step:'success', status:r.status, ticketCount: body.count, token_preview: token.slice(0,20)+'...' });
  } catch(e) {
    res.json({ ok: false, step:'exception', error: e.message });
  }
});

// GET /api/zoho/ticket/:id — fetch a Zoho Desk ticket and return structured data
app.get('/api/zoho/ticket/:id', requireAuth, rateLimit(60, 60000), async (req, res) => {
  try {
    if (!ZOHO_CLIENT_ID) return res.status(503).json({ success: false, error: 'Zoho not configured' });
    const rawId = req.params.id.replace(/^#/, '');
    const token = await getZohoAccessToken();
    const headers = { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID };

    let ticket = null;

    // Fetch recent tickets and return sample ticket numbers for debugging
    const r1  = await fetch(`${ZOHO_API_BASE}/tickets?from=0&limit=10`, { headers });
    const d1  = await r1.json();
    const sample = (d1.data||[]).map(t => ({ num: t.ticketNumber, id: t.id, status: t.status }));

    // Search across 500 tickets in batches (agents may log tickets from earlier today)
    for (const from of [0, 100, 200, 300, 400]) {
      const r = await fetch(`${ZOHO_API_BASE}/tickets?from=${from}&limit=100`, { headers });
      if (!r.ok) break;
      const d = await r.json();
      if (!(d.data||[]).length) break; // no more tickets
      const found = d.data.find(t => String(t.ticketNumber) === rawId);
      if (found) { ticket = found; break; }
    }

    if (!ticket) return res.json({ success: true, found: false, searched: 500, sample });
    if (!ticket) return res.json({ success: true, found: false });

    // Get contact info
    let contact = null;
    if (ticket.contactId) {
      try { contact = await zohoDesk(`/contacts/${ticket.contactId}`); } catch(e) {}
    }

    res.json({
      success: true,
      found: true,
      ticket: {
        id:           ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject:      ticket.subject,
        status:       ticket.status,
        priority:     ticket.priority,
        channel:      mapZohoChannel(ticket.channel),
        ticketType:   mapZohoType(ticket),
        assignee:     ticket.assignee?.name || ticket.assigneeId || null,
        contact:      contact ? { name: contact.fullName, email: contact.email } : null,
        createdTime:  ticket.createdTime,
        modifiedTime: ticket.modifiedTime,
        satisfaction: ticket.satisfaction?.type || null,
        teamId:       ticket.teamId,
        departmentId: ticket.departmentId,
        tags:         ticket.tags || [],
      }
    });
  } catch(e) {
    console.error('❌ Zoho ticket lookup:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Ticket Logger — Google Sheets Integration ─────────────────────────────────
// GET /api/check-ticket — check if ticket ID already exists in sheet (any agent, any type)
app.get('/api/check-ticket', requireAuth, rateLimit(120, 60000), async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.json({ found: false });
    if (!TICKET_SHEET_ID) return res.json({ found: false });
    const sheets = getTicketSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:H`,
    });
    const rows = (resp.data.values || []).slice(1);
    // Return ALL entries with this ticket ID (not just one, not filtered by type)
    const matches = rows
      .filter(r => (r[0] || '').trim() === id.trim())
      .map(r => ({
        ticketId:   (r[0] || '').trim(),
        agentName:  (r[1] || '').trim(),
        channel:    (r[2] || '').trim(),
        ticketType: (r[4] || '').trim(),
        date:       (r[5] || '').trim(),
        month:      (r[6] || '').trim(),
        notes:      (r[7] || '').trim(),
      }));
    if (matches.length) return res.json({ found: true, entries: matches });
    res.json({ found: false });
  } catch(e) {
    res.json({ found: false });
  }
});

const { google: googleApis } = require('googleapis');

function getTicketSheetsClient() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
  const key = JSON.parse(keyRaw);
  const auth = new googleApis.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return googleApis.sheets({ version: 'v4', auth });
}

function fmtTicketDate(d) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()}-${M[d.getMonth()]}`;
}
function fmtTicketMonth(d) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${M[d.getMonth()]}'${String(d.getFullYear()).slice(2)}`;
}

const VALID_CHANNELS     = new Set(['Email','Chat','Phone','Web']);
const VALID_TICKET_TYPES = new Set([
  'New Ticket','Follow-up Ticket','Transfer-In Ticket','Reopened Ticket',
  'Merged Ticket','Outbound Ticket','Feedback Ticket',
  'Auto-Generated/Spam Ticket','New Ticket - Transferred'
]);

// POST /api/tickets — agent logs a ticket (writes a row to Google Sheet)
app.post('/api/tickets', requireAuth, rateLimit(60, 60000), async (req, res) => {
  try {
    const { ticketId, channel, pickedFromQueue, ticketType, isDuplicate, logDate } = req.body || {};
    // Validate ticket ID
    if (!ticketId || !/^#\d+$/.test(String(ticketId).trim()))
      return res.status(400).json({ success: false, error: 'Ticket ID must start with # followed by digits (e.g. #198756)' });
    if (!VALID_CHANNELS.has(channel))
      return res.status(400).json({ success: false, error: 'Invalid channel' });
    if (!VALID_TICKET_TYPES.has(ticketType))
      return res.status(400).json({ success: false, error: 'Invalid ticket type' });
    if (pickedFromQueue && !['Yes','No',''].includes(pickedFromQueue))
      return res.status(400).json({ success: false, error: 'Picked from Queue must be Yes, No, or blank' });

    const session = req.session;
    const agentName = session.name || session.email;
    // Support backlog: use provided logDate (YYYY-MM-DD) or default to today CST
    let now;
    if (logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      now = new Date(logDate + 'T12:00:00'); // noon to avoid timezone issues
      // Don't allow future dates
      const todayCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (now > todayCST) now = new Date(); // fallback to today
    } else {
      now = new Date();
    }
    const row = [
      ticketId.trim(),
      agentName,
      channel,
      pickedFromQueue || '',
      ticketType,
      fmtTicketDate(now),
      fmtTicketMonth(now),
      isDuplicate ? 'DUPLICATE' : ''   // column H — flag
    ];

    if (!TICKET_SHEET_ID) return res.status(503).json({ success: false, error: 'Ticket sheet not configured' });
    const sheets = getTicketSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:H`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    insertAuditLog(session.email, 'ticket_log', ticketId.trim(), `${channel}|${ticketType}`).catch(() => {});
    res.json({ success: true, message: 'Ticket logged successfully', data: { ticketId: ticketId.trim(), agentName, channel, pickedFromQueue: pickedFromQueue || '', ticketType, date: fmtTicketDate(now), month: fmtTicketMonth(now) } });
  } catch(e) {
    console.error('❌ ticket log error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Email → Sheet Name mapping (T1 CS Stars team) ───────────────────────────
// Maps each agent's login email to the possible names used in the Google Sheet.
// The sheet uses first-name or shortened names from months of manual entries.
const AGENT_SHEET_NAMES = {
  // Core admins
  'sebastin.n@adit.com':      ['Sebastin', 'Sabarirajan', 'Sebastin N', 'Sebastin N (Sabarirajan)'],
  'ronnie@adit.com':          ['Ronnie G', 'Ronnie'],
  'imran@adit.com':           ['Imran'],
  // Agents
  'anold.fernandes@adit.com': ['Anold', 'Anold Fernandes'],
  'audrey.miles@adit.com':    ['Audrey', 'Audrey Miles'],
  'caroline.lock@adit.com':   ['Caroline', 'Caroline Lock'],
  'debra.horton@adit.com':    ['Debra Horton', 'Debra', 'Debra Horton (Deblina Chakraborty)', 'Danica'],
  'evan.cruz@adit.com':       ['Evan', 'Evan Cruz'],
  'greg.dawson@adit.com':     ['Greg Dawson', 'Greg'],
  'henry.patel@adit.com':     ['Henry', 'Henry P', 'Henry Patel'],
  'lincy@adit.com':           ['Lincy', 'Lincy Tabita'],
  'sabrina.quinn@adit.com':   ['Sabrina', 'Sabrina Quinn'],
  'sky.gibson@adit.com':      ['Sky Gibson', 'Sky'],
  'tabbie.shine@adit.com':    ['Tabbi Shine', 'Tabbie Shine', 'Tabbi', 'Tabbie'],
  'michelle.pinto@adit.com':  ['Michelle', 'Michelle Pinto'],
  'sam.marshall@adit.com':    ['Samuel', 'Samuel Marshall', 'Sam'],
  'sandy.clark@adit.com':     ['Sandy', 'Sandy Clark', 'Sabrina'],
};

// Build a set of lowercase name variants for fast matching
function buildNameSet(email, sessionName) {
  const mapped = AGENT_SHEET_NAMES[(email||'').toLowerCase()];
  if (mapped && mapped.length) {
    // Use mapped names (case-insensitive set)
    return new Set(mapped.map(n => n.toLowerCase().trim()));
  }
  // Fallback: derive variations from session name
  const n = (sessionName || '').trim();
  const first = n.split(' ')[0];
  const variants = new Set([
    n.toLowerCase(),
    first.toLowerCase(),
  ]);
  // Also add "First L" format
  const parts = n.split(' ');
  if (parts.length >= 2) variants.add((parts[0] + ' ' + parts[1][0]).toLowerCase());
  return variants;
}

// POST /api/tickets/bulk — agent submits multiple backlog tickets at once
app.post('/api/tickets/bulk', requireAuth, rateLimit(10, 60000), async (req, res) => {
  try {
    const { tickets, channel, pickedFromQueue, ticketType, logDate } = req.body || {};
    if (!Array.isArray(tickets) || !tickets.length)
      return res.status(400).json({ success: false, error: 'No tickets provided' });
    if (tickets.length > 50)
      return res.status(400).json({ success: false, error: 'Max 50 tickets per bulk entry' });
    if (!VALID_CHANNELS.has(channel))
      return res.status(400).json({ success: false, error: 'Invalid channel' });
    if (!VALID_TICKET_TYPES.has(ticketType))
      return res.status(400).json({ success: false, error: 'Invalid ticket type' });

    const session = req.session;
    const agentName = session.name || session.email;

    let now;
    if (logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      now = new Date(logDate + 'T12:00:00');
      const todayCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (now > todayCST) now = new Date();
    } else {
      now = new Date();
    }

    const dateStr  = fmtTicketDate(now);
    const monthStr = fmtTicketMonth(now);
    const isBacklog = logDate && dateStr !== fmtTicketDate(new Date());

    if (!TICKET_SHEET_ID) return res.status(503).json({ success: false, error: 'Ticket sheet not configured' });
    const sheets = getTicketSheetsClient();

    // Each item can be a string ID (use defaults) OR a full object with own channel/type/queue
    const rows = tickets
      .map(item => {
        if (typeof item === 'string') {
          const id = item.trim();
          if (!/^#?\d+$/.test(id)) return null;
          const ticketId = id.startsWith('#') ? id : '#' + id;
          return [ticketId, agentName, channel, pickedFromQueue || '', ticketType, dateStr, monthStr, isBacklog ? 'BACKLOG' : ''];
        } else {
          // Full object: { ticketId, channel, pickedFromQueue, ticketType }
          const id = (item.ticketId || '').trim();
          if (!id) return null;
          const ch  = VALID_CHANNELS.has(item.channel) ? item.channel : channel;
          const tp  = VALID_TICKET_TYPES.has(item.ticketType) ? item.ticketType : ticketType;
          const q   = ['Yes','No',''].includes(item.pickedFromQueue) ? item.pickedFromQueue : (pickedFromQueue || '');
          return [id, agentName, ch, q, tp, dateStr, monthStr, isBacklog ? 'BACKLOG' : ''];
        }
      })
      .filter(Boolean);

    if (!rows.length) return res.status(400).json({ success: false, error: 'No valid ticket IDs found' });

    await sheets.spreadsheets.values.append({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:H`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    insertAuditLog(session.email, 'bulk_ticket_log', `${rows.length} tickets`, `${channel}|${ticketType}|${dateStr}`).catch(() => {});
    res.json({ success: true, count: rows.length, date: dateStr, isBacklog });
  } catch(e) {
    console.error('❌ bulk ticket error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/my-tickets — agent reads their own ticket entries from Google Sheet
app.get('/api/my-tickets', requireAuth, rateLimit(30, 60000), async (req, res) => {
  try {
    if (!TICKET_SHEET_ID) return res.status(503).json({ success: false, error: 'Ticket sheet not configured' });
    const sheets = getTicketSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:G`,
    });

    const agentEmail = (req.session.email || '').toLowerCase();
    const sessionName = req.session.name || req.session.email || '';
    const nameSet = buildNameSet(agentEmail, sessionName);

    const rows = (resp.data.values || []).slice(1);
    const tickets = rows
      // Skip rows where Ticket ID is empty or agent name doesn't match
      .filter(r => {
        const id   = (r[0] || '').trim();
        const name = (r[1] || '').trim().toLowerCase();
        return id && nameSet.has(name);
      })
      .map(r => ({
        ticketId:        (r[0] || '').trim(),
        agentName:       (r[1] || '').trim(),
        channel:         (r[2] || '').trim(),
        pickedFromQueue: (r[3] || '').trim(),
        ticketType:      (r[4] || '').trim(),
        date:            (r[5] || '').trim(),
        month:           (r[6] || '').trim(),
      }))
      // Final guard: skip any row that ended up with no ticket ID
      .filter(t => t.ticketId);
    res.json({ success: true, data: tickets });
  } catch(e) {
    console.error('❌ my-tickets error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/tickets — admin reads recent ticket entries from Google Sheet
app.get('/api/tickets', requireAdmin, rateLimit(20, 60000), async (req, res) => {
  try {
    if (!TICKET_SHEET_ID) return res.status(503).json({ success: false, error: 'Ticket sheet not configured' });
    const sheets = getTicketSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:H`,
    });
    const rows = (resp.data.values || []).slice(1); // skip header row
    const tickets = rows.filter(r => (r[0]||'').trim()).map(r => ({
      ticketId:        (r[0]||'').trim(),
      agentName:       (r[1]||'').trim(),
      channel:         (r[2]||'').trim(),
      pickedFromQueue: (r[3]||'').trim(),
      ticketType:      (r[4]||'').trim(),
      date:            (r[5]||'').trim(),
      month:           (r[6]||'').trim(),
      notes:           (r[7]||'').trim(),
    }));
    res.json({ success: true, data: tickets });
  } catch(e) {
    console.error('❌ ticket read error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manual archive trigger
app.post('/api/db-archive', requireAdmin, rateLimit(2, 3600000), async (req, res) => {
  try {
    const { force = false } = req.body || {};
    const result = await runArchive(force);
    if (result) insertAuditLog(req.session?.email||'system', 'manual_archive', 'google_sheets', JSON.stringify(result)).catch(()=>{});
    res.json({ success: true, result: result || { skipped: 'Volume below threshold' } });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── AI Writing Assistant ─────────────────────────────────────────────────────
app.post('/api/write-assist', requireAuth, rateLimit(30, 60000), async (req, res) => {
  try {
    const { text, style = 'email', tone = 'professional' } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'No text provided' });
    if (text.length > 4000) return res.status(400).json({ success: false, error: 'Text too long (max 4000 chars)' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'AI service not configured. Please contact your admin.' });

    const styleGuides = {
      email:    'a professional business email',
      customer: 'a clear, empathetic customer-facing response',
      docs:     'formal technical documentation',
      slack:    'a concise, friendly Slack/team message',
      general:  'clear, professional written communication'
    };
    const toneGuides = {
      professional: 'professional and polished',
      friendly:     'warm, friendly and approachable',
      concise:      'brief and to the point',
      formal:       'formal and corporate'
    };

    const systemPrompt = `You are a professional writing assistant for a customer support team at Adit, a dental software company. Your job is to improve agent-written text to be clear, correct, and well-structured.

Always:
- Fix grammar, spelling, and punctuation
- Improve sentence structure and flow
- Keep the original meaning intact
- Be natural — not overly robotic or excessively formal
- Output ONLY the improved text, no explanations or prefixes`;

    const userPrompt = `Please rewrite the following as ${styleGuides[style] || styleGuides.general}. Use a ${toneGuides[tone] || toneGuides.professional} tone.\n\nOriginal text:\n${text.trim()}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1000,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
    }

    const data = await response.json();
    const improved = data.choices?.[0]?.message?.content?.trim() || '';
    if (!improved) throw new Error('No response from AI');

    insertAuditLog(req.session?.email || 'unknown', 'write_assist', style, `tone:${tone},chars:${text.length}`).catch(() => {});
    res.json({ success: true, result: improved });
  } catch (e) {
    console.error('❌ write-assist error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

async function startScheduler() {
  setInterval(() => { fetchPresenceForAll().catch(e => console.error('❌ presence sync:', e.message)); }, getFallbackSyncMs());
  cron.schedule('*/15 * * * *', async () => { fetchCallLogs().catch(e => console.error('❌ call log cron:', e.message)); });
  // Prune call logs older than 7 days at 1am IST daily
  cron.schedule('30 19 * * *', async () => { pruneCallLogs(7).catch(e => console.error('❌ pruneCallLogs:', e.message)); });
  // Prune expired sessions daily
  cron.schedule('0 20 * * *', async () => { pruneExpiredSessions().catch(e => console.error('❌ pruneExpiredSessions:', e.message)); });
  // Every 6 hours: check volume, archive to Google Sheets if >90%, then prune
  cron.schedule('0 */6 * * *', async () => {
    try {
      // 1. Try to archive old data to Google Sheets if above 90%
      const archiveResult = await runArchive();
      if (archiveResult) {
        console.log('📤 Archive done:', JSON.stringify(archiveResult));
        insertAuditLog('system', 'auto_archive', 'google_sheets', JSON.stringify(archiveResult)).catch(()=>{});
      }
      // 2. Always prune + VACUUM regardless
      const r = await pruneOldData();
      console.log('🧹 Prune+vacuum done:', JSON.stringify(r));
    } catch(e) { console.error('❌ scheduled prune/archive:', e.message); }
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
