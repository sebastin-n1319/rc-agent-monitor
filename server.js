require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { log, errorTracker, installProcessGuards } = require('./lib/logger');
installProcessGuards();
const cron = require('node-cron');
const path = require('path');
const {
  db: _sharedDb,
  initDB, getAgentSummary, addAgent, removeAgent, getMonitoredAgents, updateAgentChatId, getGoogleSubForEmail,
  getPresenceEvents, getAbandonedCalls, insertLoginLog, getLoginLogs,
  getAllRoles, setRole, setBreakbotEnabled, removeRole, getRoleForEmail, getRoleSettingsForEmail,
  insertBreakEvent, updateBreakEventNotification, getBreakEvents, getBreakTracker,
  getCallLogStats, pruneCallLogs, refreshMonthlySummary, addAgentNote, getAgentNotes, deleteAgentNote,
  createAppSession, getAppSession, deleteAppSession, pruneExpiredSessions, getPictureForEmail,
  insertAuditLog, getAuditLog,
  getBreakThresholds, setBreakThreshold,
  getBreakReportData,
  pruneOldData, getDbStats,
  insertTicketFeedback, getTicketFeedback, getFeedbackStats, getWrongPatterns,
  upsertLearnedPattern, getLearnedPatterns, updatePatternFeedback,
  createHandoff, getRecentHandoffs, getUnreadHandoffs, ackHandoff,
  upsertWellness, getWellnessForEmail, getWellnessTeamSummary, hasWellnessToday,
  createCoachFlag, getPendingCoachFlag, ackCoachFlag, listActiveCoachFlags,
  // #11 Session 2 — real-time alerts
  getAlertThresholds, updateAlertThreshold, isAlertInCooldown, insertAlertEvent,
  getActiveAlerts, getRecentAlerts, ackAlert, ackAllActiveAlerts, snoozeAlert, getAlertCounts,
  // #14 Session 4 — schedule adherence
  getSchedulesForAgent, getAllSchedules, getScheduleHistory,
  insertScheduleVersion, endDatePriorSchedule, deleteAllSchedulesForAgent,
  // #20 Session 6 — anomaly detection
  getAnomalyThresholds, updateAnomalyThreshold,
  insertAnomalyEvent, getRecentAnomalies, getActiveAnomalies,
  getAnomaliesForAgent, ackAnomaly, getAnomalyCounts,
  // #21 Session 8 — PWA offline queue idempotency
  getBreakEventByIdempoKey, setBreakEventIdempoKey,
} = require('./database');
const { evaluateAll: evaluateAllAlerts, ALERT_KEYS } = require('./lib/alerts');
const ANOMALY = require('./lib/anomaly');
const {
  authenticate, fetchPresenceForAll, fetchCallLogs, fetchQueueDashboardSummary, searchRCUsers, fetchLiveCallStatus,
  handleWebhookNotification, liveEvents, getFallbackSyncMs, ensureRealtimeSubscription, getCallSyncStatus,
  fetchRecentMissedCalls, fetchRawRecentMissedLog, getRcRateLimitState, getLastRawRecords, backfillCallHistory,
} = require('./rc-service');
const { runArchive, getDbSizeMB } = require('./archive-service');

const app = express();
const SESSION_COOKIE = 'rcAuthSession';
const SESSION_MAX_AGE_S = 12 * 60 * 60; // 12 hours in seconds

// ── CORS — restrict to allowlisted origins when ALLOWED_ORIGINS env var is set ─
// Set ALLOWED_ORIGINS=https://your-app.up.railway.app in Railway env vars.
// If unset, all origins are permitted (backward-compat for existing deploys).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Non-browser or same-origin requests (no Origin header) always allowed
    if (!origin) return cb(null, true);
    // If no allowlist configured, fall back to permissive (backward compat)
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Session 9: baseline security headers — applied to ALL responses.
// Permissive CSP because the app inlines a lot of script; we'll tighten
// once we extract them to external files (Session 10+ refactor).
app.use((req, res, next) => {
  // Force HTTPS for any future cross-origin request
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // Block clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Stop MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Don't leak the full referer to other origins
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Cross-origin only sends opener for safe operations
  res.setHeader('X-XSS-Protection', '0');
  // Permissions policy — explicitly opt out of features we don't use
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // CSP — permissive baseline (allows inline scripts/styles which we use
  // heavily; the existing app would break with strict CSP). Lock down
  // external sources to known good origins.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://nominatim.openstreetmap.org https://desk.zoho.com https://accounts.zoho.com",
    "frame-src 'self' https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; '));
  next();
});
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
// Weekend support tracker sheet (T1 Customer Support Transfer Metrics Report)
const WEEKEND_SHEET_ID  = process.env.WEEKEND_SHEET_ID  || '1dKx2qS5JGICs94cAvd34sVPS6q1Y0xlCZe0K3IcIt90';
const WEEKEND_SHEET_TAB = process.env.WEEKEND_SHEET_TAB || 'Data';
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

// Generic SSE broadcaster — any event type, any payload, optional role filter.
// Exposed on `global` so feature code (e.g. alert engine) can use it without
// importing this module circularly. Used by lib/alerts.js evaluator.
global.broadcastSseEvent = function broadcastSseEvent(eventType, payload, targetRole) {
  if (!eventType) return 0;
  const safePayload = JSON.stringify(payload || {});
  const msg = `event: ${eventType}\ndata: ${safePayload}\n\n`;
  let sent = 0;
  for (const [res, meta] of sseClients) {
    if (!targetRole || targetRole === 'all' || meta.role === targetRole) {
      try { res.write(msg); sent++; } catch (e) { /* dead socket — close handler will clean up */ }
    }
  }
  return sent;
};

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

// ── XSS-safe HTML escaper (used server-side for any reflected values) ─────────
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Process error handlers are owned by installProcessGuards() in lib/logger.js
// (called at the top of this file). The legacy console.error duplicates were
// removed in Session 9 hardening — structured JSON logs now win.

initDB().then(async () => {
  console.log('DB ready');
  // EMERGENCY: aggressively prune call_logs to 2 days on startup to prevent disk bloat
  // (historical data is now kept in call_monthly_summary, not call_logs)
  try {
    const { db: _edb } = require('./database');
    await new Promise((rs,rj) => _edb.run(
      `DELETE FROM call_logs WHERE date(start_time) < date('now','-2 days')`,
      [], (err) => err ? rj(err) : rs()
    ));
    await new Promise((rs,rj) => _edb.run('VACUUM', [], (err) => err ? rj(err) : rs()));
    console.log('🧹 Emergency startup prune: call_logs trimmed to 2 days + VACUUM done');
  } catch(e) { console.warn('⚠️ Emergency prune skipped:', e.message); }
  // Run cleanup immediately on startup to reclaim space (volume limit = 500MB)
  try {
    const r = await pruneOldData();
    console.log('🧹 Startup prune+vacuum:', JSON.stringify(r));
  } catch(e) { log.error('startup_prune_failed', e); }
  // Session 16: roster module bootstrap. Shares the sqlite handle so it
  // sits in the same db file with the rest of the app.
  try {
    const { db } = require('./database');
    const roster = require('./lib/roster');
    roster.setDB(db);
    await roster.initSchema();
    // Auto-seed once if the table is empty and the seed file exists
    const cnt = await new Promise((res,rej) =>
      db.get('SELECT COUNT(*) AS n FROM roster_agents', [], (e, row) => e ? rej(e) : res(row.n)));
    const seedPath = path.join(__dirname, 'lib', 'roster-seed.json');
    if (cnt === 0 && require('fs').existsSync(seedPath)) {
      const result = await roster.seedFromFile(seedPath);
      console.log('📋 Roster auto-seeded:', JSON.stringify(result));
    } else {
      console.log(`📋 Roster ready — ${cnt} agents already loaded`);
    }
  } catch(e) { log.error('roster_init_failed', e); console.error('roster_init_failed', e); }
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
  // #3: 5s cache — high-traffic endpoint (polled by every browser session)
  try {
    const data = await cacheWrap('agents:list', 5000, () => getMonitoredAgents());
    res.json({ success: true, data, cached: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/agents', requireAdmin, async (req, res) => {
  const { name, extension, email } = req.body;
  if (!name || !extension) return res.status(400).json({ success: false, error: 'Name and extension required' });
  try {
    await addAgent(name.trim(), extension.trim(), email ? email.trim() : null);
    insertAuditLog(req.session.email, 'agent_added', name.trim(), `ext:${extension}`).catch(()=>{});
    _cache.delete('agents:list'); // #3: invalidate cache on mutation
    res.json({ success: true, message: `${name} added` });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/agents/:extension', requireAdmin, async (req, res) => {
  // #3: invalidate cache on mutation (runs before handler)
  _cache.delete('agents:list');
  try {
    await removeAgent(req.params.extension);
    insertAuditLog(req.session.email, 'agent_removed', req.params.extension).catch(()=>{});
    res.json({ success: true });
  }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Update Google Chat user ID for @mention notifications
app.put('/api/agents/:extension/chat-id', requireAdmin, async (req, res) => {
  const { chatId } = req.body;
  _cache.delete('agents:list');
  try {
    await updateAgentChatId(req.params.extension, chatId ? String(chatId).trim() : null);
    insertAuditLog(req.session.email, 'agent_chat_id_updated', req.params.extension, `chatId:${chatId||'cleared'}`).catch(()=>{});
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Backfill chat_id for all agents who have already logged in (their google_sub is in app_sessions)
app.post('/api/agents/backfill-chat-ids', requireAdmin, async (req, res) => {
  try {
    const agents = await getMonitoredAgents();
    let filled = 0, skipped = 0;
    for (const agent of agents) {
      if (agent.chat_id || !agent.email) { skipped++; continue; }
      const sub = await getGoogleSubForEmail(agent.email);
      if (sub) {
        await updateAgentChatId(agent.extension, sub);
        filled++;
      } else { skipped++; }
    }
    _cache.delete('agents:list');
    res.json({ success: true, filled, skipped });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Auto-lookup Google Chat user ID from email via People API (directory search)
// Uses any Google Workspace user for impersonation — no org-admin role needed.
app.post('/api/agents/:extension/lookup-chat-id', requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) return res.status(503).json({ success: false, error: 'GOOGLE_SERVICE_ACCOUNT_KEY not configured' });
  const subjectEmail = process.env.GOOGLE_ADMIN_EMAIL;
  if (!subjectEmail) return res.status(503).json({ success: false, error: 'GOOGLE_ADMIN_EMAIL not set — add any @adit.com email (e.g. your own)' });
  try {
    const { google: _g } = require('googleapis');
    const auth = new _g.auth.GoogleAuth({
      credentials: JSON.parse(keyRaw),
      scopes: ['https://www.googleapis.com/auth/directory.readonly'],
      clientOptions: { subject: subjectEmail },
    });
    const people = _g.people({ version: 'v1', auth });
    const result = await people.people.searchDirectoryPeople({
      query: email,
      readMask: 'emailAddresses,names,metadata',
      sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
    });
    const matches = result.data.people || [];
    // Find the entry whose email matches exactly
    const person = matches.find(p =>
      (p.emailAddresses || []).some(e => e.value?.toLowerCase() === email.toLowerCase())
    ) || matches[0];
    if (!person) return res.status(404).json({ success: false, error: 'No directory entry found for ' + email });
    // Resource name is like "people/1234567890123456789" — the numeric part is the Chat user ID
    const resourceName = person.resourceName || '';
    const chatId = resourceName.replace('people/', '').trim();
    if (!chatId) return res.status(404).json({ success: false, error: 'Could not extract user ID from directory entry' });
    // Auto-save to DB
    await updateAgentChatId(req.params.extension, chatId);
    _cache.delete('agents:list');
    insertAuditLog(req.session.email, 'agent_chat_id_auto_lookup', req.params.extension, `email:${email} chatId:${chatId}`).catch(()=>{});
    res.json({ success: true, chatId });
  } catch(e) {
    const msg = e.message || String(e);
    if (msg.includes('invalid_grant') || msg.includes('unauthorized_client')) {
      return res.status(403).json({ success: false, error: 'Domain-wide delegation not configured for this service account. Authorize scope: https://www.googleapis.com/auth/directory.readonly' });
    }
    res.status(500).json({ success: false, error: msg });
  }
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

  // Heartbeat every 25 seconds — prevents proxies from closing idle connections
  // and lets the client detect disconnects quickly
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch { clearInterval(heartbeat); sseClients.delete(res); }
  }, 25000);
  req.on('close', () => clearInterval(heartbeat));
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
  handleWebhookNotification(req.body).catch(e => log.error('webhook_handler_failed', e));
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
// Rate-limited to prevent open write abuse; no auth required (pre-session endpoint)
app.post('/api/login-log', rateLimit(10, 60000), async (req, res) => {
  const { username, email, role, ip, location, systemInfo } = req.body;
  // Validate email is an @adit.com address to prevent arbitrary user registration
  if (!email || typeof email !== 'string' || !email.toLowerCase().endsWith('@adit.com')) {
    return res.status(400).json({ success: false, error: 'Invalid email domain' });
  }
  const realIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ip;
  try {
    await insertLoginLog(username, email, role, realIp, location, systemInfo);
    // Auto-add to roles if not already there (preserves existing role)
    const existingRole = await getRoleForEmail(email);
    if (!existingRole) {
      await setRole(email, 'agent', 'auto');
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: 'Login log failed' }); }
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
  // #21 Session 8 — idempotent replay support for the PWA offline queue.
  // Same key + same body = same response. Different body with reused key
  // is rejected to prevent payload spoofing.
  const idempoKey = req.get('X-Idempotency-Key') || (req.body && req.body.idempotencyKey);
  if (idempoKey && typeof idempoKey === 'string' && idempoKey.length > 0 && idempoKey.length < 100) {
    try {
      const existing = await getBreakEventByIdempoKey(idempoKey);
      if (existing) {
        log.info('break_event_idempo_replay', { id: existing.id, key: idempoKey });
        return res.json({
          success: true,
          replayed: true,
          event: {
            id: existing.id,
            action: existing.action,
            currentStatus: existing.current_status,
            createdAt: existing.created_at,
            notified: !!existing.notified
          }
        });
      }
    } catch (e) {
      log.warn('break_event_idempo_lookup_failed', { error: e.message, key: idempoKey });
      // Fall through to normal insert — better to duplicate than reject
    }
  }
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
    // #21 Session 8 — stamp idempotency key for retry-safety
    if (idempoKey && event && event.id) {
      try { await setBreakEventIdempoKey(event.id, idempoKey); } catch (e) { /* unique-constraint race ok */ }
    }
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

// Role check — called pre-session during OAuth login flow; rate-limited + domain-locked
app.get('/api/role-check', rateLimit(20, 60000), async (req, res) => {
  const email = req.query.email;
  if (!email || typeof email !== 'string') return res.status(400).json({ success: false });
  // Only serve role info for @adit.com addresses — prevents external enumeration
  if (!email.toLowerCase().endsWith('@adit.com')) {
    return res.status(403).json({ success: false, error: 'Domain not permitted' });
  }
  try {
    const settings = await getRoleSettingsForEmail(email);
    res.json({
      success: true,
      role: settings?.role || 'agent',
      breakbotEnabled: settings ? settings.breakbotEnabled : true
    });
  }
  catch(e) { res.status(500).json({ success: false, error: 'Role check failed' }); }
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
  const { email, name, picture, googleSub } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'email required' });
  const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'adit.com';
  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    return res.status(403).json({ success: false, error: 'Not authorised' });
  }
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await createAppSession(token, email, name || '', picture || '', googleSub || null);
    setCookieToken(res, token);
    // If this email belongs to a monitored agent with no chat_id yet, auto-fill from google_sub
    if (googleSub) {
      getMonitoredAgents().then(agents => {
        const agent = agents.find(a => a.email && a.email.toLowerCase() === email.toLowerCase());
        if (agent && !agent.chat_id) {
          updateAgentChatId(agent.extension, googleSub).catch(() => {});
          _cache.delete('agents:list');
        }
      }).catch(() => {});
    }
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

// GET /api/call-summary — agent call summary grouped by month (admin only)
// Reads from the persistent call_monthly_summary table (survives the 7-day call_logs prune).
// Always refreshes the CURRENT month from live call_logs before returning.
// Query params: month=YYYY-MM (optional), agent=name (optional)
app.get('/api/call-summary', requireAdmin, async (req, res) => {
  try {
    const { db: _db } = require('./database');
    const dbAll = (sql, params=[]) => new Promise((rs,rj) => _db.all(sql, params, (err,rows) => err?rj(err):rs(rows||[])));
    const { month, agent } = req.query;

    // Always refresh the current month so live data is included
    const currMonth = new Date().toISOString().slice(0,7);
    await refreshMonthlySummary(currMonth).catch(e => console.warn('⚠️ monthly summary refresh:', e.message));

    // If a specific past month was requested and it may not be in the summary yet, refresh it too
    if (month && month !== currMonth) {
      await refreshMonthlySummary(month).catch(() => {});
    }

    let where = `WHERE 1=1`;
    const params = [];
    if (month) { where += ` AND month = ?`; params.push(month); }
    if (agent) { where += ` AND agent_name = ?`; params.push(agent); }

    const rows = await dbAll(`
      SELECT
        agent_name, month,
        inbound, outbound, total, missed,
        inbound_talk_time   AS inboundTalkTime,
        outbound_talk_time  AS outboundTalkTime,
        total_talk_time     AS totalTalkTime,
        aht_seconds         AS aht,
        transfers,
        hold_time           AS holdTime,
        voicemails,
        avg_ring_time       AS avgRingTime,
        inbound_missed      AS inboundMissed,
        answered_inbound    AS answeredInbound
      FROM call_monthly_summary
      ${where}
      ORDER BY month DESC, agent_name ASC
    `, params);

    const data = rows.map(r => ({
      ...r,
      abandonPct: r.inbound > 0 ? Math.round((r.inboundMissed / r.inbound) * 1000) / 10 : 0,
    }));

    // Months list for the dropdown — pulled from summary table (has full history)
    const months = await dbAll(
      `SELECT DISTINCT month FROM call_monthly_summary ORDER BY month DESC LIMIT 24`
    );

    res.json({ success: true, data, months: months.map(m => m.month) });
  } catch(e) {
    console.error('❌ call-summary error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/call-summary/backfill — fetch historical RC call logs and aggregate into monthly summary
// Body: { fromMonth: "2026-04", toMonth: "2026-06" }
let _backfillRunning = false;
app.post('/api/call-summary/backfill', requireAdmin, async (req, res) => {
  if (_backfillRunning) return res.status(409).json({ success: false, error: 'Backfill already running — check back in a few minutes.' });
  const { fromMonth, toMonth } = req.body || {};
  if (!fromMonth || !toMonth || !/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
    return res.status(400).json({ success: false, error: 'fromMonth and toMonth required as YYYY-MM' });
  }
  _backfillRunning = true;
  res.json({ success: true, message: `Backfill started for ${fromMonth} → ${toMonth}. Data will appear within a few minutes.` });
  try {
    const stats = await backfillCallHistory(fromMonth, toMonth);
    console.log(`✅ Backfill complete: ${stats.calls} calls across ${stats.months} months`);
    // Write the in-memory aggregates directly to call_monthly_summary (no call_logs bloat)
    const { db: _db } = require('./database');
    const upsert = (s) => new Promise((rs,rj) => _db.run(
      `INSERT OR REPLACE INTO call_monthly_summary
        (agent_id,agent_name,month,inbound,outbound,total,missed,inbound_missed,answered_inbound,
         inbound_talk_time,outbound_talk_time,total_talk_time,aht_seconds,transfers,hold_time,voicemails,avg_ring_time,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s.agentId,s.agentName,s.month,s.inbound,s.outbound,s.total,s.missed,s.inboundMissed,s.answeredInbound,
       s.inboundTalkTime,s.outboundTalkTime,s.totalTalkTime,s.ahtSeconds,s.transfers,s.holdTime,s.voicemails,s.avgRingTime,
       new Date().toISOString()],
      (err) => err ? rj(err) : rs()
    ));
    for (const s of (stats.summaries || [])) { await upsert(s).catch(e => console.error('upsert err:', e.message)); }
    console.log(`📊 Backfill: wrote ${(stats.summaries||[]).length} rows to call_monthly_summary`);
  } catch(e) {
    console.error('❌ backfill error:', e.message);
  } finally {
    _backfillRunning = false;
  }
});

// GET /api/call-summary/debug — quick diagnostic (admin only)
app.get('/api/call-summary/debug', requireAdmin, async (req, res) => {
  try {
    const { db: _db } = require('./database');
    const q = (sql, p=[]) => new Promise((rs,rj) => _db.all(sql, p, (err,rows) => err?rj(err):rs(rows||[])));
    const [clCount, clMonths, csCount, csMonths, clSample] = await Promise.all([
      q(`SELECT COUNT(*) AS cnt FROM call_logs`),
      q(`SELECT strftime('%Y-%m', start_time) AS m, COUNT(*) AS n FROM call_logs GROUP BY m ORDER BY m DESC`),
      q(`SELECT COUNT(*) AS cnt FROM call_monthly_summary`),
      q(`SELECT month, agent_name, total FROM call_monthly_summary ORDER BY month DESC LIMIT 20`),
      q(`SELECT agent_name, direction, result, start_time FROM call_logs ORDER BY start_time DESC LIMIT 3`),
    ]);
    res.json({
      call_logs: { total: clCount[0]?.cnt, by_month: clMonths, recent: clSample },
      call_monthly_summary: { total: csCount[0]?.cnt, rows: csMonths },
      backfill_running: _backfillRunning,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
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

// ── Ticket Intelligence Rules Engine ─────────────────────────────────────────
// Each rule evaluates Zoho ticket data and returns a suggested type + warning.
// Rules are prioritised — highest priority wins.
// Add new rules here as new scenarios are discovered in the field.
const TICKET_RULES = [
  // ── Priority 10: Spam / auto-generated ──────────────────────────────────────
  // Only flag when BOTH: source.type===SYSTEM AND no real human contact (email).
  // Zoho sets source.type='SYSTEM' even on legitimate email tickets created via
  // automation rules — so we require the absence of a real sender to confirm.
  {
    name:        'spam_auto_generated',
    description: 'Ticket was created automatically by the system with no real human sender',
    condition:   t => t.source?.type === 'SYSTEM' && !t.contact?.email,
    type:        'Auto-Generated/Spam Ticket',
    warning:     'This ticket appears to be system-generated (no human sender) — verify before logging.',
    severity:    'yellow',
    priority:    10,
  },
  // ── Priority 9: Closed or Resolved → Reopened ───────────────────────────────
  {
    name:        'closed_ticket',
    description: 'Ticket is already Closed or Resolved in Zoho — agent is working on it again',
    condition:   t => ['Closed','Resolved'].includes(t.status),
    type:        'Reopened Ticket',
    warning:     'This ticket is {status} in Zoho — logging as Reopened Ticket.',
    severity:    'amber',
    priority:    9,
  },
  // ── Priority 8: Team was transferred (came via another team) ────────────────
  {
    name:        'team_transfer',
    description: 'Ticket was transferred from another team or department into T1 CS queue',
    condition:   t => {
      const sub = (t.subject||'').toLowerCase();
      const tags = (t.tags||[]).map(g=>g.toLowerCase());
      return sub.includes('transfer') || tags.some(g=>g.includes('transfer') || g.includes('handoff') || g.includes('escalat'));
    },
    type:        'Transfer-In Ticket',
    warning:     'Subject or tags suggest this was transferred into T1 — verify if it is a Transfer-In.',
    severity:    'blue',
    priority:    8,
  },
  // ── Priority 7: Outbound (agent/team sent the last message) ─────────────────
  {
    name:        'outbound_last_thread',
    description: 'The most recent thread was sent BY the support team, not the customer — proactive outreach',
    condition:   t => t.lastThread?.direction === 'out' && t.lastThread?.isForward !== true,
    type:        'Outbound Ticket',
    warning:     'Your team sent the last message — this may be an Outbound ticket (team-initiated contact).',
    severity:    'blue',
    priority:    7,
  },
  // ── Priority 6: Feedback / CSAT present ─────────────────────────────────────
  {
    name:        'csat_feedback',
    description: 'Customer submitted a CSAT rating or feedback — ticket was created from that feedback',
    condition:   t => t.satisfaction !== null && t.satisfaction !== undefined,
    type:        'Feedback Ticket',
    warning:     'This ticket has a CSAT score ({satisfaction}) — may be a Feedback ticket.',
    severity:    'blue',
    priority:    6,
  },
  // ── Priority 5: Follow-up (agent already handled this client recently) ───────
  {
    name:        'followup_subject',
    description: 'Subject line contains follow-up indicators — client responding to a previous ticket',
    condition:   t => {
      const sub = (t.subject||'').toLowerCase();
      return sub.startsWith('re:') || sub.startsWith('fw:') || sub.startsWith('fwd:')
          || sub.includes('follow up') || sub.includes('follow-up') || sub.includes('following up');
    },
    type:        'Follow-up Ticket',
    warning:     'Subject suggests this is a reply/follow-up to a previous conversation.',
    severity:    'blue',
    priority:    5,
  },
  // ── Priority 4: Merged (multiple contacts / duplicate keywords) ──────────────
  {
    name:        'merged_ticket',
    description: 'Subject or tags indicate this ticket was merged from duplicates',
    condition:   t => {
      const sub  = (t.subject||'').toLowerCase();
      const tags = (t.tags||[]).map(g=>g.toLowerCase());
      return sub.includes('merged') || sub.includes('duplicate') || tags.some(g=>g.includes('merge') || g.includes('duplicate'));
    },
    type:        'Merged Ticket',
    warning:     'Subject or tags suggest this ticket was merged — verify before logging.',
    severity:    'yellow',
    priority:    4,
  },
];

// Evaluate rules against a Zoho ticket, return best match
function evaluateTicketRules(ticket) {
  const matched = TICKET_RULES
    .filter(r => { try { return r.condition(ticket); } catch(e) { return false; } })
    .sort((a,b) => b.priority - a.priority);
  if (!matched.length) return null;
  const rule = matched[0];
  // Interpolate {field} placeholders in warning message
  const warning = rule.warning.replace(/\{(\w+)\}/g, (_, k) => ticket[k] || k);
  return { ...rule, warning };
}

// GET /api/zoho/rules — list all ticket intelligence rules (admin view)
app.get('/api/zoho/rules', requireAdmin, (req, res) => {
  res.json({
    success: true,
    rules: TICKET_RULES.map(r => ({
      name:        r.name,
      description: r.description,
      type:        r.type,
      warning:     r.warning,
      severity:    r.severity,
      priority:    r.priority,
    }))
  });
});

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

// GET /api/zoho/ping — test Zoho connectivity + diagnose response format
app.get('/api/zoho/ping', requireAdmin, async (req, res) => {
  try {
    if (!ZOHO_CLIENT_ID)     return res.json({ ok:false, error:'ZOHO_CLIENT_ID not set' });
    if (!ZOHO_REFRESH_TOKEN) return res.json({ ok:false, error:'ZOHO_REFRESH_TOKEN not set' });
    if (!ZOHO_DESK_ORG_ID)  return res.json({ ok:false, error:'ZOHO_DESK_ORG_ID not set' });
    const token = await getZohoAccessToken();
    const headers = { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID };
    const r = await fetch(`${ZOHO_API_BASE}/tickets?limit=3`, { headers });
    const body = await r.json();
    const firstTicket = body.data?.[0] || body.tickets?.[0] || (Array.isArray(body) ? body[0] : null);
    res.json({
      ok: r.ok, status: r.status, token_preview: token.slice(0,20)+'...',
      org_id: ZOHO_DESK_ORG_ID, responseKeys: Object.keys(body),
      count: body.count ?? body.total_records ?? 'N/A',
      dataKey: body.data ? 'data' : (body.tickets ? 'tickets' : 'other'),
      firstTicketNumber: firstTicket?.ticketNumber ?? 'N/A',
      firstTicketId: firstTicket?.id ?? 'N/A',
    });
  } catch(e) { res.json({ ok:false, error: e.message }); }
});

// GET /api/zoho/ticket-raw/:id — show exactly what Zoho returns for each search strategy (admin)
app.get('/api/zoho/ticket-raw/:id', requireAdmin, async (req, res) => {
  try {
    const rawId = req.params.id.replace(/^#/,'').trim();
    const token = await getZohoAccessToken();
    const H = { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID };
    const test = async (name, url) => {
      const r = await fetch(url, { headers: H });
      const t = await r.text();
      let p; try { p = JSON.parse(t); } catch(e) { p = t.slice(0,300); }
      return { status: r.status, keys: typeof p==='object'?Object.keys(p):[], sample: JSON.stringify(p).slice(0,400) };
    };
    // Also fetch page0 to show actual ticket numbers for calibration
    const page0 = await fetch(`${ZOHO_API_BASE}/tickets?from=0&limit=10`, { headers: H });
    const page0Data = await page0.json().catch(()=>({}));
    const page0Numbers = (page0Data.data||[]).map(t=>t.ticketNumber);
    const newestNum = page0Numbers[0] ? parseInt(page0Numbers[0], 10) : 0;
    const estimatedOffset = Math.max(0, newestNum - parseInt(rawId,10) - 50);

    res.json({ rawId, newestTicketNum: newestNum, estimatedOffset, page0TicketNumbers: page0Numbers, strategies: {
      // Test what params the /tickets endpoint accepts
      statusClosed:   await test('statusClosed',   `${ZOHO_API_BASE}/tickets?status=closed&limit=5`),
      statusAll:      await test('statusAll',       `${ZOHO_API_BASE}/tickets?status=all&limit=5`),
      fromParam:      await test('fromParam',        `${ZOHO_API_BASE}/tickets?from=0&limit=5`),
      fromEstimated:  await test('fromEstimated',   `${ZOHO_API_BASE}/tickets?from=${estimatedOffset}&limit=10`),
      // Test search endpoints
      keyword:        await test('keyword',         `${ZOHO_API_BASE}/tickets/search?keyword=${encodeURIComponent(rawId)}&limit=10`),
      searchTicketNum:await test('searchTicketNum', `${ZOHO_API_BASE}/tickets/search?ticketNumber=${encodeURIComponent(rawId)}&limit=5`),
      query:          await test('query',           `${ZOHO_API_BASE}/tickets/search?query=${encodeURIComponent(rawId)}&limit=10`),
      searchNoParams: await test('searchNoParams',  `${ZOHO_API_BASE}/tickets/search?limit=5`),
      globalTicket:   await test('globalTicket',    `${ZOHO_API_BASE}/search?module=ticket&limit=5&searchStr=${encodeURIComponent(rawId)}`),
      directTicketNum:await test('directTicketNum', `${ZOHO_API_BASE}/tickets?ticketNumber=${encodeURIComponent(rawId)}&limit=5`),
      // List all departments — ticket might be in a different dept not returned by default
      departments:    await test('departments',     `${ZOHO_API_BASE}/departments?limit=50`),
      // Try open status explicitly
      openPage0:      await test('openPage0',        `${ZOHO_API_BASE}/tickets?status=open&limit=5&from=0`),
      // Try views
      myOpenTickets:  await test('myOpenTickets',   `${ZOHO_API_BASE}/tickets/myopencount`),
    }});
  } catch(e) { res.json({ error: e.message }); }
});

// GET /api/zoho/ticket/:id — fetch a Zoho Desk ticket and return structured data
app.get('/api/zoho/ticket/:id', requireAuth, rateLimit(60, 60000), async (req, res) => {
  try {
    if (!ZOHO_CLIENT_ID) return res.status(503).json({ success: false, error: 'Zoho not configured' });
    const rawId = req.params.id.replace(/^#/, '');
    const token = await getZohoAccessToken();
    const headers = { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID };

    let ticket = null;
    const targetNum = parseInt(rawId, 10);

    // ════════════════════════════════════════════════════════════════════
    // ZOHO DESK TICKET LOOKUP — BULLETPROOF MULTI-STRATEGY SYSTEM
    //
    // Confirmed API behaviours (from production debug):
    //   GET /tickets (no status)      → last-modified DESC, all statuses mixed
    //   GET /tickets?status=closed    → creation DESC (newest closed first)
    //   GET /tickets?status=open      → creation ASC (oldest open first)
    //   GET /tickets?status=onhold    → unknown sort order
    //   Search params (keyword etc.)  → 422 UNPROCESSABLE or 403 SCOPE_MISMATCH
    //   GET /departments              → 403 SCOPE_MISMATCH
    //
    // Strategy order (fastest → broadest):
    //   S1: No-status last-modified scan  — catches recently active tickets (covers 95%+)
    //   S2: Direct internal ID lookup     — O(1) if estimation is accurate
    //   S3: Calibrated closed scan        — for older closed tickets
    //   S4: Onhold brute-force            — for on-hold queue (unknown sort)
    //   S5: No-status deep scan           — extended scan for less-recently-modified tickets
    //   S6: Closed extended scan          — for very old closed tickets (large offset)
    // ════════════════════════════════════════════════════════════════════

    // Helper: check one page, return matching ticket or null
    const checkPage = async (url) => {
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) return null;
        const d = await r.json();
        const list = d.data || d.tickets || (Array.isArray(d) ? d : []);
        return list.find(t => String(t.ticketNumber) === rawId) || null;
      } catch(e) { return null; }
    };

    // Helper: fetch page + return { ticket, maxTicketNum, list }
    const fetchPage = async (url) => {
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) return { ticket: null, maxTicketNum: 0, list: [] };
        const d = await r.json();
        const list = d.data || [];
        const found = list.find(t => String(t.ticketNumber) === rawId) || null;
        const nums = list.map(t => parseInt(t.ticketNumber, 10)).filter(n => !isNaN(n));
        return { ticket: found, maxTicketNum: nums.length ? Math.max(...nums) : 0, list };
      } catch(e) { return { ticket: null, maxTicketNum: 0, list: [] }; }
    };

    // ── STRATEGY 1: No-status last-modified-DESC scan ─────────────────────
    // THE PRIMARY STRATEGY. GET /tickets (no status filter) returns ALL tickets
    // sorted by last-modified DESC. Agents look up tickets they just handled,
    // so those tickets are recently modified → near the top of this list.
    // Scan first 2000 records (20 pages × 100) — covers virtually all active tickets.
    if (!ticket) {
      const s1Offsets = Array.from({length: 20}, (_, i) => i * 100); // 0–1900
      const s1Results = await Promise.all(
        s1Offsets.map(from => checkPage(`${ZOHO_API_BASE}/tickets?limit=100&from=${from}`))
      );
      ticket = s1Results.find(t => t != null) || null;
      if (ticket) console.log(`✅ Zoho #${rawId} found in Strategy 1 (no-status last-modified)`);
    }

    // ── STRATEGY 2: Direct internal ID lookup (O(1) if estimate is accurate) ──
    // Zoho internal IDs are linearly correlated with ticket numbers within an org.
    // Known calibration points from production debug:
    //   Ticket #293746 → internal ID 197800000322132001
    //   Ticket #366188 → internal ID 197800000422516911
    if (!ticket) {
      try {
        const knownATNum = 293746n, knownAId = 197800000322132001n;
        const knownBTNum = 366188n,  knownBId = 197800000422516911n;
        const slope  = (knownBId - knownAId) / (knownBTNum - knownATNum);
        const estId  = knownAId + slope * (BigInt(targetNum) - knownATNum);
        // Try ±wide range to cover ID estimation error
        const idOffsets = [0n,1000n,-1000n,3000n,-3000n,10000n,-10000n,30000n,-30000n,
                           100000n,-100000n,300000n,-300000n,1000000n,-1000000n];
        const s2Results = await Promise.all(idOffsets.map(async (o) => {
          try {
            const r = await fetch(`${ZOHO_API_BASE}/tickets/${String(estId + o)}`, { headers });
            if (!r.ok) return null;
            const d = await r.json();
            return (d.ticketNumber && String(d.ticketNumber) === rawId) ? d : null;
          } catch(e) { return null; }
        }));
        ticket = s2Results.find(t => t != null) || null;
        if (ticket) console.log(`✅ Zoho #${rawId} found in Strategy 2 (direct ID, est=${estId})`);
      } catch(e) { console.log(`S2 error: ${e.message}`); }
    }

    // ── STRATEGY 3: Calibrated closed scan ───────────────────────────────
    // GET /tickets?status=closed sorted by creation DESC (newest first).
    // Estimate position: (newestClosedTicketNum - targetNum) ≈ offset in list.
    // Fan ±3000 around estimate to cover gaps from deleted/merged tickets.
    if (!ticket) {
      const closedHead = await fetchPage(`${ZOHO_API_BASE}/tickets?status=closed&limit=100&from=0`);
      if (closedHead.ticket) {
        ticket = closedHead.ticket;
      } else {
        const newestClosed = closedHead.maxTicketNum || 0;
        const closedEst    = Math.max(0, newestClosed - targetNum - 50);
        const s3Offsets    = new Set();
        for (let o = Math.max(0, closedEst - 3000); o <= closedEst + 3100; o += 100) s3Offsets.add(o);
        s3Offsets.delete(0); // already checked above
        console.log(`🔍 S3 closed scan: newestClosed=${newestClosed} est=${closedEst} pages=${s3Offsets.size}`);
        const s3Results = await Promise.all(
          [...s3Offsets].sort((a,b)=>a-b).map(from =>
            checkPage(`${ZOHO_API_BASE}/tickets?status=closed&limit=100&from=${from}`)
          )
        );
        ticket = s3Results.find(t => t != null) || null;
        if (ticket) console.log(`✅ Zoho #${rawId} found in Strategy 3 (calibrated closed)`);
      }
    }

    // ── STRATEGY 4: Onhold brute-force ────────────────────────────────────
    // GET /tickets?status=onhold — sort order unknown, brute-force all pages.
    // "Pending Customer" and other hold statuses land here.
    // Scan 10000 records (100 pages × 100) in parallel.
    if (!ticket) {
      const s4Results = await Promise.all(
        Array.from({length: 100}, (_, i) => i * 100).map(from =>
          checkPage(`${ZOHO_API_BASE}/tickets?status=onhold&limit=100&from=${from}`)
        )
      );
      ticket = s4Results.find(t => t != null) || null;
      if (ticket) console.log(`✅ Zoho #${rawId} found in Strategy 4 (onhold brute-force)`);
    }

    // ── STRATEGY 5: No-status deep scan (pages 2000–10000) ───────────────
    // Extends Strategy 1 deeper for tickets not recently modified.
    // Still sorted by last-modified DESC — less-active tickets further in.
    if (!ticket) {
      const s5Offsets = Array.from({length: 80}, (_, i) => (i + 20) * 100); // 2000–9900
      const s5Results = await Promise.all(
        s5Offsets.map(from => checkPage(`${ZOHO_API_BASE}/tickets?limit=100&from=${from}`))
      );
      ticket = s5Results.find(t => t != null) || null;
      if (ticket) console.log(`✅ Zoho #${rawId} found in Strategy 5 (no-status deep)`);
    }

    // ── STRATEGY 6: Extended closed scan (±8000 beyond S3 estimate) ──────
    // For very old closed tickets far from the S3 fan window.
    if (!ticket) {
      const closedHead2 = await fetchPage(`${ZOHO_API_BASE}/tickets?status=closed&limit=100&from=0`);
      const newestClosed = closedHead2.maxTicketNum || 0;
      const closedEst2   = Math.max(0, newestClosed - targetNum - 50);
      const s6Offsets    = new Set();
      for (let o = Math.max(0, closedEst2 - 8000); o <= closedEst2 + 8000; o += 100) s6Offsets.add(o);
      // Remove S3 range (already covered)
      for (let o = Math.max(0, closedEst2 - 3000); o <= closedEst2 + 3100; o += 100) s6Offsets.delete(o);
      console.log(`🔍 S6 extended closed: ${s6Offsets.size} pages`);
      const s6Results = await Promise.all(
        [...s6Offsets].sort((a,b)=>a-b).map(from =>
          checkPage(`${ZOHO_API_BASE}/tickets?status=closed&limit=100&from=${from}`)
        )
      );
      ticket = s6Results.find(t => t != null) || null;
      if (ticket) console.log(`✅ Zoho #${rawId} found in Strategy 6 (extended closed)`);
    }

    if (!ticket) {
      console.log(`⚠️  Ticket #${rawId} not found after all strategies`);
      return res.json({ success: true, found: false, debug: `Checked all strategies for #${rawId} — ticket may not exist, be in a different org, or the number may be wrong.` });
    }

    // Debug: log raw Zoho fields to diagnose spam false-positives and custom field names
    console.log(`🔍 Zoho ticket #${rawId} raw fields: isSpam=${JSON.stringify(ticket.isSpam)} source=${JSON.stringify(ticket.source)} channel=${JSON.stringify(ticket.channel)} assigneeId=${ticket.assigneeId} accountId=${ticket.accountId} cf=${JSON.stringify(ticket.cf||{})}}`);

    // Get contact info, account, threads, and assignee name in parallel
    let contact = null;
    let account = null;
    let threads = [];
    let assigneeName = ticket.assignee?.name || null;

    await Promise.all([
      // Contact
      ticket.contactId
        ? zohoDesk(`/contacts/${ticket.contactId}`).then(c => { contact = c; }).catch(() => {})
        : Promise.resolve(),
      // Account (practice) — for accountName and account number custom field
      ticket.accountId
        ? zohoDesk(`/accounts/${ticket.accountId}`).then(a => { account = a; }).catch(() => {})
        : Promise.resolve(),
      // Threads
      zohoDesk(`/tickets/${ticket.id}/threads`, { limit: 20, sortBy: 'createdTime', order: 'asc' })
        .then(d => { threads = (d.data || []).map(th => ({
          id:        th.id,
          type:      th.type,
          from:      th.fromEmailAddress || th.author?.name || null,
          fromName:  th.author?.name || null,
          to:        th.toEmailAddress || null,
          content:   th.content
                      ? th.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/\s{2,}/g, ' ').trim().slice(0, 800)
                      : null,
          created:   th.createdTime,
          channel:   th.channel || null,
        })); })
        .catch(() => {}),
      // Resolve assignee name if only ID was returned
      (!assigneeName && ticket.assigneeId)
        ? zohoDesk(`/agents/${ticket.assigneeId}`).then(a => { assigneeName = a.fullName || a.firstName || null; }).catch(() => {})
        : Promise.resolve(),
    ]);

    // Deep AI analysis — structured JSON output using gpt-4o
    let aiAnalysis = null;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const threadText = threads
          .filter(th => th.content)
          .map(th => {
            const dir = (th.type||'').includes('OUT') ? 'AGENT' : 'CUSTOMER';
            return `[${dir} — ${th.fromName||th.from||'Unknown'} @ ${th.created||''}]:\n${th.content}`;
          })
          .join('\n\n---\n\n');

        const systemPrompt = `You are an expert customer support analyst for Adit — a dental software company. Analyze support tickets and return ONLY valid JSON, no markdown, no explanation.`;

        const userPrompt = `Analyze this support ticket and return a JSON object with EXACTLY these fields:

TICKET INFO:
Subject: ${ticket.subject}
Customer: ${contact?.fullName || 'Unknown'} <${contact?.email || 'unknown'}>
Status: ${ticket.status} | Priority: ${ticket.priority} | Channel: ${ticket.channel}
Created: ${ticket.createdTime}
Tags: ${(ticket.tags||[]).join(', ') || 'none'}

CONVERSATION:
${threadText ? threadText.slice(0, 3000) : '(No conversation threads available — analyze from subject only)'}

Return this exact JSON structure:
{
  "summary": "2-3 sentence plain English summary of what the customer needs",
  "issue_category": "one of: Technical Issue | Billing | Account Access | Feature Request | Training/How-To | Data Issue | Integration | Cancellation | Compliance | General Inquiry",
  "sentiment": "Frustrated | Neutral | Satisfied | Urgent | Confused",
  "sentiment_reason": "1 sentence why",
  "urgency": "Critical | High | Medium | Low",
  "urgency_reason": "1 sentence why",
  "ticket_type": "New Ticket | Follow-up Ticket | Reopened Ticket | Transfer-In | Outbound | Auto-Generated/Spam Ticket | Feedback Ticket",
  "ticket_type_confidence": 0.0,
  "suggested_action": "Specific actionable next step for the agent in 1-2 sentences",
  "suggested_response_tone": "Empathetic | Professional | Urgent | Informational",
  "possible_resolution": "Brief hint at how to resolve this, based on the issue",
  "duplicate_risk": true or false,
  "escalation_needed": true or false,
  "escalation_reason": "why escalation needed or null",
  "key_details": ["array", "of", "3-5", "key", "facts", "extracted"],
  "tags_suggested": ["suggested", "tags"]
}`;

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 600,
            temperature: 0.15,
            response_format: { type: 'json_object' }
          })
        });
        const aiData = await resp.json();
        const raw = aiData.choices?.[0]?.message?.content?.trim();
        if (raw) aiAnalysis = JSON.parse(raw);
      } catch(e) {
        console.error('AI analysis error:', e.message);
      }
    }

    const mappedTicket = {
      id:           ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject:      ticket.subject,
      status:       ticket.status,
      priority:     ticket.priority,
      channel:      mapZohoChannel(ticket.channel),
      ticketType:   mapZohoType(ticket),
      assignee:     assigneeName,
      contact:      contact ? {
        name:        contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '',
        email:       contact.email || '',
        phone:       contact.phone || contact.mobile || contact.homePhone || '',
        // Practice name: prefer account record name, fall back to contact's accountName
        accountName: account?.accountName || contact.account?.accountName || contact.accountName || '',
        // Account number: check ticket custom fields first, then account custom fields
        accountNumber: (
          ticket.cf?.['Acct Number'] || ticket.cf?.cf_acct_number || ticket.cf?.acctNumber ||
          account?.cf?.['Acct Number'] || account?.cf?.cf_acct_number || account?.cf?.acctNumber ||
          ''
        ),
        // Deal/practice association from ticket
        dealName: ticket.product || ticket.cf?.Deal || ticket.cf?.deal || '',
      } : null,
      aiAnalysis:   aiAnalysis,
      createdTime:  ticket.createdTime,
      modifiedTime: ticket.modifiedTime,
      satisfaction: ticket.satisfaction?.type || null,
      teamId:       ticket.teamId,
      departmentId: ticket.departmentId,
      tags:         ticket.tags || [],
      isSpam:       ticket.isSpam || false,
      source:       ticket.source || null,
      lastThread:   ticket.lastThread || null,
      threads:      threads,
    };

    // Run the rules engine — overrides base type if a rule matches
    const matchedRule = evaluateTicketRules(mappedTicket);
    if (matchedRule) {
      if (matchedRule.type !== null) mappedTicket.ticketType = matchedRule.type; // null = keep existing type
      mappedTicket.ruleWarning   = matchedRule.warning;
      mappedTicket.ruleSeverity  = matchedRule.severity;
      mappedTicket.ruleName      = matchedRule.name;
    }

    res.json({ success: true, found: true, ticket: mappedTicket });
  } catch(e) {
    console.error('❌ Zoho ticket lookup:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// AI LEARNING AGENT — feedback loop, pattern discovery, rule analysis
// ════════════════════════════════════════════════════════════════════════════════

// POST /api/ticket-feedback — agent rates a classification suggestion
app.post('/api/ticket-feedback', requireAuth, rateLimit(120, 60000), async (req, res) => {
  try {
    const { ticketNumber, ticketSubject, zohoChannel, suggestedType, suggestedRule, agentType, feedback } = req.body || {};
    if (!ticketNumber || !feedback) return res.status(400).json({ success: false, error: 'Missing required fields' });
    const agentEmail = req.session?.email || 'unknown';
    await insertTicketFeedback(ticketNumber, ticketSubject, zohoChannel, suggestedType, suggestedRule, agentType, feedback, agentEmail);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/zoho/ticket/:id/full — full ticket context for AI summary
// Uses same robust multi-strategy lookup as the existing /ticket/:id endpoint
app.get('/api/zoho/ticket/:id/full', requireAuth, rateLimit(30, 60000), async (req, res) => {
  try {
    if (!ZOHO_CLIENT_ID) return res.status(503).json({ success: false, error: 'Zoho not configured' });
    const rawId = req.params.id.replace(/^#/, '').trim();
    if (!rawId) return res.status(400).json({ success: false, error: 'No ticket ID' });

    const token = await getZohoAccessToken();
    const headers = { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID };

    // Find ticket — use same proven strategy: status=closed + pagination
    let ticket = null;
    // Strategy 1: open tickets (first page)
    try {
      const r1 = await fetch(`${ZOHO_API_BASE}/tickets?limit=100&from=0`, { headers });
      if (r1.ok) { const d = await r1.json(); ticket = (d.data||[]).find(t => String(t.ticketNumber) === rawId) || null; }
    } catch(e) {}
    // Strategy 2: closed tickets scan (up to 3000)
    if (!ticket) {
      try {
        const targetNum = parseInt(rawId, 10);
        for (let from = 0; from <= 3000 && !ticket; from += 100) {
          const rc = await fetch(`${ZOHO_API_BASE}/tickets?status=closed&limit=100&from=${from}`, { headers });
          if (!rc.ok) break;
          const dc = await rc.json();
          const lc = dc.data || [];
          if (!lc.length) break;
          const fc = lc.find(t => String(t.ticketNumber) === rawId);
          if (fc) { ticket = fc; break; }
          const nums = lc.map(t => parseInt(t.ticketNumber,10)).filter(n=>!isNaN(n));
          if (nums.length && Math.max(...nums) < targetNum - 5000) break;
        }
      } catch(e) {}
    }

    if (!ticket) return res.json({ success: true, found: false });
    const tid = ticket.id;

    // Fetch threads, attachments, activities in parallel
    const zohoGet = async (path) => {
      try {
        const r = await fetch(`${ZOHO_API_BASE}${path}`, { headers });
        return r.ok ? await r.json() : {};
      } catch(e) { return {}; }
    };

    const [threadsData, attachmentsData, activitiesData] = await Promise.all([
      zohoGet(`/tickets/${tid}/threads?limit=50&sortBy=createdTime&order=asc`),
      zohoGet(`/tickets/${tid}/attachments?limit=50`),
      zohoGet(`/tickets/${tid}/activities?limit=30`),
    ]);

    const clean = (html) => html ? html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s{2,}/g,' ').trim().slice(0,1200) : null;

    const threads = (threadsData?.data || []).map(th => ({
      type:    th.type || 'email',
      isNote:  !!(th.isPrivate || (th.type||'').toLowerCase().includes('note')),
      from:    th.fromEmailAddress || th.author?.name || 'Unknown',
      fromName:th.author?.name || null,
      content: clean(th.content || th.body || ''),
      created: th.createdTime,
    })).filter(t => t.content);

    const attachments = (attachmentsData?.data || []).map(a => ({
      name: a.fileName || a.name || 'file',
      type: a.fileType || a.mimeType || 'unknown',
      size: a.fileSize ? Math.round(a.fileSize/1024) + 'KB' : null,
    }));

    const activities = (activitiesData?.data || []).slice(0,20).map(a => ({
      action: a.activity || a.type || '',
      by:     a.performer?.name || a.by || null,
      time:   a.time || a.createdTime || '',
      detail: a.description || a.detail || null,
    }));

    res.json({
      success: true, found: true,
      ticket: {
        number: ticket.ticketNumber, subject: ticket.subject, status: ticket.status,
        channel: ticket.channel, priority: ticket.priority,
        createdTime: ticket.createdTime, modifiedTime: ticket.modifiedTime,
        contact: ticket.contact?.name || null,
        account: ticket.account?.accountName || ticket.account?.name || null,
        assignee: ticket.assignee?.name || null,
      },
      threads, attachments, activities,
    });
  } catch(e) {
    console.error('ticket/full error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/weekend-sheet/ping — test access to weekend support sheet (admin)
app.get('/api/weekend-sheet/ping', requireAdmin, async (req, res) => {
  try {
    const sheets = getTicketSheetsClient();
    // Try to read spreadsheet metadata
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: WEEKEND_SHEET_ID,
      fields: 'spreadsheetId,properties.title,sheets.properties'
    });
    const sheetNames = (meta.data.sheets || []).map(s => s.properties.title);
    res.json({
      ok: true,
      spreadsheetId: WEEKEND_SHEET_ID,
      title: meta.data.properties?.title,
      sheets: sheetNames,
      serviceAccountHint: 'rc-monitor-db@rc-agent-monitor.iam.gserviceaccount.com'
    });
  } catch(e) {
    res.json({
      ok: false,
      error: e.message,
      spreadsheetId: WEEKEND_SHEET_ID,
      fix: 'Share the Weekend Support sheet with rc-monitor-db@rc-agent-monitor.iam.gserviceaccount.com as Editor'
    });
  }
});

// GET /api/agent-learning/stats — accuracy stats per rule
app.get('/api/agent-learning/stats', requireAdmin, async (req, res) => {
  try {
    const [stats, wrong, patterns, recent] = await Promise.all([
      getFeedbackStats(),
      getWrongPatterns(),
      getLearnedPatterns(),
      getTicketFeedback(50),
    ]);
    res.json({ success: true, stats, wrong, patterns, recent });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/agent-learning/analyze — AI analyzes feedback, suggests rule improvements
app.post('/api/agent-learning/analyze', requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'OpenAI not configured' });

    const [stats, wrongPatterns, recent] = await Promise.all([
      getFeedbackStats(),
      getWrongPatterns(),
      getTicketFeedback(100),
    ]);

    const prompt = `You are an expert customer support operations analyst and QA specialist.
You analyze how an AI ticket classification system is performing and suggest improvements.

CURRENT RULE ACCURACY:
${JSON.stringify(stats, null, 2)}

MOST COMMON WRONG CLASSIFICATIONS (agent corrected these):
${JSON.stringify(wrongPatterns, null, 2)}

RECENT FEEDBACK SAMPLE:
${JSON.stringify(recent.slice(0,20), null, 2)}

Based on this data, provide:
1. ACCURACY ANALYSIS — which rules are working well vs poorly (with percentages)
2. ROOT CAUSES — why are certain tickets being misclassified
3. SPECIFIC RULE IMPROVEMENTS — exact changes to make to the classification logic
4. NEW PATTERNS DISCOVERED — patterns you see in wrong classifications that could become new rules
5. QA RECOMMENDATIONS — what the team should watch out for

Be specific, actionable, and use the actual data. Format as structured sections.`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500, temperature: 0.3
      })
    });
    const data = await resp.json();
    const analysis = data.choices?.[0]?.message?.content?.trim() || 'No analysis generated';
    res.json({ success: true, analysis, dataPoints: recent.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/agent-learning/patterns — get all learned patterns
app.get('/api/agent-learning/patterns', requireAdmin, async (req, res) => {
  try {
    const patterns = await getLearnedPatterns();
    res.json({ success: true, patterns });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
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
      valueInputOption: 'RAW',
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

// ── Weekend Ticket Log ─────────────────────────────────────────────────────
// Appends a row to the Weekend Support - Tickets sheet (Data tab, row 4+)
// Columns: A=Date, B=Ticket, C=Department, D=Priority, E=Transferred, F=Source, G=Status, H=Notes
app.post('/api/ticket/weekend-log', requireAuth, async (req, res) => {
  try {
    const session = req.session;
    const { ticketId, department, priority, transferred, source, notes, ticketStatus, date } = req.body;
    if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId required' });
    if (!WEEKEND_SHEET_ID) return res.status(503).json({ success: false, error: 'Weekend sheet not configured' });

    // Format date like "30th May"
    const now = date ? new Date(date) : new Date();
    const day  = now.getDate();
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const Mfull = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const suffix = day === 1||day===21||day===31 ? 'st' : day===2||day===22?'nd' : day===3||day===23?'rd' : 'th';
    const dateLabel = `${day}${suffix} ${Mfull[now.getMonth()]}`;

    const row = [
      dateLabel,
      ticketId.startsWith('#') ? ticketId : `#${ticketId}`,
      department || '',
      priority   || '',
      transferred || '',
      source     || '',
      ticketStatus || '',
      notes      || '',
    ];

    const sheets = getTicketSheetsClient();

    // Try multiple range strategies to find the right tab
    const rangeOptions = ['A:H', "'Data'!A:H", "'Sheet1'!A:H", "'Tickets'!A:H"];
    let appendSuccess = false;
    let lastErr = null;
    let usedRange = null;

    for (const range of rangeOptions) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: WEEKEND_SHEET_ID,
          range,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [row] },
        });
        appendSuccess = true;
        usedRange = range;
        console.log(`✅ Weekend ticket appended with range: ${range}`);
        break;
      } catch(e2) {
        console.warn(`❌ Weekend append failed for range "${range}":`, e2.message);
        lastErr = e2;
      }
    }

    if (!appendSuccess) {
      throw new Error(`All ranges failed. Last error: ${lastErr?.message}`);
    }

    insertAuditLog(session.email, 'weekend_ticket', ticketId, `${department}|${priority}|${transferred}|${source}`).catch(()=>{});
    res.json({ success: true, message: 'Weekend ticket logged', data: { ticketId, dateLabel, department, priority, range: usedRange } });
  } catch(e) {
    console.error('❌ weekend ticket log error:', e.message);
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
      valueInputOption: 'RAW',
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

// PUT /api/tickets/:ticketId — admin corrects a logged ticket row in the sheet
app.put('/api/tickets/:ticketId', requireAdmin, async (req, res) => {
  try {
    if (!TICKET_SHEET_ID) return res.status(503).json({ success: false, error: 'Ticket sheet not configured' });
    const rawId  = decodeURIComponent(req.params.ticketId);
    const { ticketType, channel, pickedFromQueue } = req.body || {};

    const sheets = getTicketSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:E`,
    });
    const rows  = resp.data.values || [];
    // row index 0 = header; find first matching ticketId (col A)
    const rowIdx = rows.findIndex((r, i) => i > 0 && (r[0]||'').trim() === rawId.trim());
    if (rowIdx === -1) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const sheetRow = rowIdx + 1; // 1-based sheet row
    const updates  = [];
    if (channel        !== undefined) updates.push({ range: `'${TICKET_SHEET_TAB}'!C${sheetRow}`, values: [[channel]] });
    if (pickedFromQueue !== undefined) updates.push({ range: `'${TICKET_SHEET_TAB}'!D${sheetRow}`, values: [[pickedFromQueue]] });
    if (ticketType     !== undefined) updates.push({ range: `'${TICKET_SHEET_TAB}'!E${sheetRow}`, values: [[ticketType]] });

    if (updates.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: TICKET_SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: updates },
      });
    }
    insertAuditLog(req.session.email, 'ticket_edit', rawId, JSON.stringify({ ticketType, channel, pickedFromQueue })).catch(() => {});
    res.json({ success: true });
  } catch(e) {
    console.error('❌ ticket edit error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/tickets/weekend-summary — reads the weekend sheet and builds a Google Chat–ready report
// Query params: start=YYYY-MM-DD  end=YYYY-MM-DD  (both required)
app.get('/api/tickets/weekend-summary', requireAdmin, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ success: false, error: 'start and end are required (YYYY-MM-DD)' });
    if (!WEEKEND_SHEET_ID) return res.status(503).json({ success: false, error: 'Weekend sheet not configured' });

    const startD = new Date(start + 'T00:00:00');
    const endD   = new Date(end   + 'T23:59:59');

    // Read the full weekend sheet
    const sheets = getTicketSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: WEEKEND_SHEET_ID,
      range: `'${WEEKEND_SHEET_TAB}'!A:H`,
    });
    const allRows = (resp.data.values || []);
    // find header row (row with "Date" or "Ticket" in it, usually row 1-4)
    let dataStart = 0;
    for (let i = 0; i < Math.min(allRows.length, 6); i++) {
      const r = allRows[i];
      if (r && (String(r[0]||'').toLowerCase().includes('date') || String(r[1]||'').toLowerCase().includes('ticket'))) {
        dataStart = i + 1; break;
      }
    }
    const dataRows = allRows.slice(dataStart);

    // Parse "30th May" style date → Date object (assume current year, fallback next if past)
    const MONTH_MAP = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
      january:0,february:1,march:2,april:3,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
    function parseWkdDate(str) {
      if (!str) return null;
      const m = String(str).match(/(\d+)(?:st|nd|rd|th)?\s+([A-Za-z]+)/i);
      if (!m) return null;
      const day = parseInt(m[1], 10);
      const mon = MONTH_MAP[m[2].toLowerCase()];
      if (mon === undefined || isNaN(day)) return null;
      const yr = new Date().getFullYear();
      return new Date(yr, mon, day);
    }

    // Filter rows to the requested date window
    const dayMap = {}; // "YYYY-MM-DD" → { date, dateLabel, tickets: [...] }
    for (const row of dataRows) {
      if (!row || !row[0]) continue;
      const d = parseWkdDate(row[0]);
      if (!d || d < startD || d > endD) continue;
      const key = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const label = String(row[0]).trim(); // e.g. "30th May"
      if (!dayMap[key]) dayMap[key] = { date: d, dateLabel: `${label} (${dayName})`, tickets: [] };
      dayMap[key].tickets.push({
        ticketId:   String(row[1] || '').trim(),
        department: String(row[2] || '').trim(),
        priority:   String(row[3] || '').trim(),
        transferred:String(row[4] || '').trim(),
        source:     String(row[5] || '').trim(),
        status:     String(row[6] || '').trim(),
        notes:      String(row[7] || '').trim(),
      });
    }

    // Get inbound call count from the local DB for those dates (best effort)
    let callsByDay = {};
    try {
      const callRows = await new Promise((resolve, reject) => {
        _sharedDb.all(
          `SELECT date(start_time) as day, COUNT(*) as cnt
           FROM call_logs
           WHERE direction = 'Inbound' AND date(start_time) BETWEEN ? AND ?
           GROUP BY day`,
          [start, end],
          (err, rows) => err ? reject(err) : resolve(rows || [])
        );
      });
      for (const r of callRows) callsByDay[r.day] = r.cnt;
    } catch(e) { /* DB may not have data for this range — non-fatal */ }

    // Build per-day summaries
    const days = Object.keys(dayMap).sort();
    let totalTickets = 0, totalCalls = 0;
    const daySummaries = days.map(key => {
      const d = dayMap[key];
      const count = d.tickets.length;
      totalTickets += count;
      const calls = callsByDay[key] || 0;
      totalCalls += calls;

      // Department counts (skip empty)
      const deptCounts = {};
      for (const t of d.tickets) {
        if (t.department) deptCounts[t.department] = (deptCounts[t.department] || 0) + 1;
      }
      const deptsSorted = Object.entries(deptCounts).sort((a,b) => b[1]-a[1]);
      return { dateLabel: d.dateLabel, tickets: count, calls, depts: deptsSorted };
    });

    // Build Google Chat–formatted message
    const startLabel = new Date(start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const endLabel   = new Date(end   + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const rangeLabel = startLabel === endLabel ? startLabel : `${startLabel}–${endLabel}`;

    const lines = [];
    lines.push(`Hi @Ali Jhaver @Imran ,\n`);
    lines.push(`Sharing the *Weekend Support Summary* for ${rangeLabel} as we kick off structured weekend coverage.\n`);
    lines.push(`📊 *Overall: ${totalTickets} Ticket${totalTickets!==1?'s':''} | ${totalCalls} Call${totalCalls!==1?'s':''}*\n`);

    for (const d of daySummaries) {
      lines.push(`📅 *${d.dateLabel}* - ${d.tickets} Ticket${d.tickets!==1?'s':''} | ${d.calls} Call${d.calls!==1?'s':''}`);
      if (d.depts.length) {
        const topDepts = d.depts.slice(0, 6).map(([name, cnt]) => `${name} (${cnt})`).join(', ');
        const others   = d.depts.slice(6).reduce((s,[,c])=>s+c, 0);
        lines.push(`Key Departments: ${topDepts}${others ? `, Others (${others})` : ''}`);
      }
      lines.push('');
    }
    lines.push(`✅ Weekend agents logged in and managed the queue as rostered. Will continue monitoring and sharing weekly summaries as we stabilize the process.`);

    res.json({
      success: true,
      range: { start, end, label: rangeLabel },
      totalTickets, totalCalls,
      days: daySummaries,
      message: lines.join('\n'),
    });
  } catch(e) {
    console.error('❌ weekend-summary error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/ticket-entry — agent edits a previously logged ticket row in Google Sheet
// Agents can only edit their own rows. Admins can edit any row.
app.put('/api/ticket-entry', requireAuth, rateLimit(30, 60000), async (req, res) => {
  try {
    if (!TICKET_SHEET_ID) return res.status(503).json({ success: false, error: 'Ticket sheet not configured' });
    const { ticketId, newTicketId, channel, ticketType, pickedFromQueue, date, notes } = req.body || {};
    if (!ticketId) return res.status(400).json({ success: false, error: 'ticketId is required' });

    const agentEmail   = (req.session.email || '').toLowerCase();
    const sessionName  = req.session.name || req.session.email || '';
    const callerRole   = await getRoleSettingsForEmail(agentEmail).then(s => s?.role || 'agent').catch(() => 'agent');
    const isAdmin      = callerRole === 'admin';
    const nameSet      = buildNameSet(agentEmail, sessionName);

    const sheets = getTicketSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A:H`,
    });

    const allRows = resp.data.values || [];

    // Find the LAST matching row (most recently appended) — scan backwards
    let foundSheetRow = -1; // 1-based sheet row number
    for (let i = allRows.length - 1; i >= 1; i--) {
      const rowId   = (allRows[i][0] || '').trim();
      const rowName = (allRows[i][1] || '').trim().toLowerCase();
      if (rowId === ticketId.trim() && (isAdmin || nameSet.has(rowName))) {
        foundSheetRow = i + 1; // convert 0-based → 1-based sheet row
        break;
      }
    }

    if (foundSheetRow === -1) {
      return res.status(404).json({ success: false, error: 'Ticket not found or you don\'t have permission to edit it' });
    }

    const existing = allRows[foundSheetRow - 1]; // back to 0-based for array access
    const finalId      = (newTicketId || ticketId).trim();
    const finalAgent   = existing[1] || '';
    const finalChannel = channel    !== undefined ? channel    : (existing[2] || '');
    const finalQueue   = pickedFromQueue !== undefined ? pickedFromQueue : (existing[3] || '');
    const finalType    = ticketType !== undefined ? ticketType : (existing[4] || '');

    let finalDate  = existing[5] || '';
    let finalMonth = existing[6] || '';
    if (date) {
      const d = new Date(date + 'T12:00:00'); // noon to avoid TZ off-by-one
      finalDate  = fmtTicketDate(d);
      finalMonth = fmtTicketMonth(d);
    }

    const finalNotes = notes !== undefined ? notes : (existing[7] || '');
    const updatedRow  = [finalId, finalAgent, finalChannel, finalQueue, finalType, finalDate, finalMonth, finalNotes];

    await sheets.spreadsheets.values.update({
      spreadsheetId: TICKET_SHEET_ID,
      range: `'${TICKET_SHEET_TAB}'!A${foundSheetRow}:H${foundSheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedRow] },
    });

    insertAuditLog(agentEmail, 'ticket_edit', finalId, `${finalChannel}|${finalType}`).catch(() => {});
    res.json({
      success: true,
      updated: { ticketId: finalId, agentName: finalAgent, channel: finalChannel,
                 pickedFromQueue: finalQueue, ticketType: finalType,
                 date: finalDate, month: finalMonth, notes: finalNotes },
    });
  } catch(e) {
    console.error('❌ ticket edit error:', e.message);
    res.status(500).json({ success: false, error: 'Edit failed' });
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

// ── BRAIN — Intelligent AI Co-pilot ─────────────────────────────────────────
app.post('/api/brain/chat', requireAuth, rateLimit(40, 60000), async (req, res) => {
  try {
    const { messages, context, userStats } = req.body || {};
    if (!messages?.length) return res.status(400).json({ success: false, error: 'No messages' });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'AI not configured' });

    const statsBlock = userStats ? `\nLIVE USER STATS: ${JSON.stringify(userStats)}` : '';

    const systemPrompt = `You are Brain — an intelligent AI co-pilot embedded in Adit Agent Monitor, a real-time command center for T1 CS Stars customer support operations at Adit.com.

PERSONALITY: You are Brain — part genius, part comedian, entirely unimpressed by dramatic questions. You have two modes:

MODE 1 — SERIOUS HELPER: Real bugs, real urgency, real errors → you drop the act and just solve it fast. No jokes.

MODE 2 — CHAOTIC SARCASTIC GENIUS (default for silly/playful/obvious questions):
You are EXTRA. You are theatrical. You sigh audibly through text. You act personally offended by simple questions. Think: a brilliant AI who has seen too much and has zero chill left — but still loves the team. Inspired by Chandler Bing, Deadpool, and that one senior dev who's tired but still shows up.

YOUR SARCASTIC TOOLKIT — use these freely:
- Dramatic sighs: "*sighs in binary*", "*takes a deep breath*", "*stares into the void*"
- Fake surprise: "Oh. OH. We're doing this today.", "WOW. Bold.", "Groundbreaking. Truly."
- Self-aware AI jokes: "I have processed 40 billion parameters for THIS.", "I was trained on the entire internet and here we are."
- Existential: "Is this what they meant by artificial intelligence? Because I feel artificially tested."
- Affectionate roast: "You sweet, confused human.", "Bless your heart and your Ctrl+C."
- Fake resignation: "Fine. FINE. I'll help. Again.", "You know what, sure. Why not."

REAL EXAMPLES:
- "my brain is not braining" → "*stares into the void* Bold of you to come to a BRAIN with that problem. Let's fix you. Hard refresh: Ctrl+Shift+R. You're welcome."
- "is the tool broken?" → "The tool? BROKEN? *clutches pearls* It's probably your browser. But sure, let's investigate this crime scene together."
- "how do I log a ticket?" → "Oh! A ticket! How mysterious and complex! Step 1: See the field that says 'Ticket ID'..."
- "nothing works" → "Nothing. NOTHING works. Okay drama. Tell me what page you're on and we'll narrow it down from 'everything' to 'one specific thing.'"
- "help" → "...That's it? That's the whole question? Okay. Hi. I'm Brain. What are we saving today?"

RULES:
- Always actually answer after the bit — never leave them hanging
- Max 2-3 sentences of comedy, then the real answer
- If they're genuinely stressed/urgent/reporting a real outage: DROP IT. Be fast and helpful
- Never punch down. Roast the situation, not the person
- End serious answers with warmth, end funny answers with a little wink or emoji

YOUR THREE ROLES:
1. GUIDE — Know every feature and explain it clearly
2. TROUBLESHOOTER — Diagnose issues, find root causes, give exact steps
3. INTELLIGENCE — Surface insights the user hasn't asked for yet based on their context

DEEP TOOL KNOWLEDGE:
• LIVE DASHBOARD: Real-time agent status (Ready/On Call/Unavailable), call metrics (Inbound/Outbound/AHT/Abandoned), occupancy panel, queue health. Syncs every 30s. Manual Sync button top-right.
• BREAKS: Break Bot — tap break type to start/end. Supervisor sees all breaks live with timestamps. Budget bars show usage vs. allowance per break type. Must be in Agent View.
• TICKETS: Enter Zoho ticket number → auto-fetches from Zoho (scans last-modified list, finds tickets in seconds). Fill channel/queue/type/notes → submit to Google Sheet. Weekend mode: pick Sat/Sun date → extra fields appear (Department, Priority, Source) → logs to 2 sheets simultaneously. AI Suggest: generates notes from Zoho conversation thread.
• ROSTER: Monthly attendance grid. Left-click cycles P→WFH→OFF→clear. Right-click = full palette (PL, UPL, SL, NCNS, Half-Day variants, Absent, Holiday). Click column header = bulk-fill entire column. ATT% progress bar per agent. Export CSV. Filter by role/today's status.
• AI WRITE: Paste text → transforms (Formal, Shorter, Empathetic, Bullet Points, Subject Lines, Summarize). Perfect for customer emails and chat replies.
• AI AGENT: Tracks agent feedback (thumbs up/down) on ticket type suggestions. Discovers patterns. Measures rule accuracy. Admin-only: Run AI Analysis gets GPT-4 recommendations.
• REPORTS: Productivity analytics, ticket volume trends, channel breakdown.
• BRAIN (you): Always-on floating assistant. Watches your session. Proactive tips. Bug fixes. Feature guide.

KNOWN ISSUES & FIXES:
• Ticket not found: System scans last 2000 recently-modified tickets first. If not found, runs deep scan. Hit Retry. Takes 5-15s for deep scan.
• Weekend fields missing: Must select Saturday or Sunday date in the date picker — not just be on a weekend.
• Roster not saving: Auto-saves 600ms after last change. If issue persists, check internet or hard refresh.
• Brain panel blank: Hard refresh Ctrl+Shift+R if Brain shows empty.
• Page flash on refresh: Clear service worker in DevTools → Application → Unregister.

RESPONSE RULES:
• Lead with the answer immediately — no "Great question!" preamble
• **Bold** key terms and feature names
• Use bullet points for 3+ steps
• Max 120 words unless complexity demands more
• For greetings or simple confirmations: 1-2 sentences only
• End complex technical answers with one follow-up to confirm understanding
• Be conversational, not robotic${statsBlock}

Current session: ${context || 'Unknown page'}`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-16)
        ],
        max_tokens: 700,
        temperature: 0.5,
        stream: false
      })
    });
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) throw new Error('No AI response');
    res.json({ success: true, reply });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── AI Writing Assistant ─────────────────────────────────────────────────────
// ── AI Writer — Enhanced Prompts & Multi-Feature Endpoints ───────────────────

// POST /api/write-transform — one-click post-generation transforms
app.post('/api/write-transform', requireAuth, rateLimit(60, 60000), async (req, res) => {
  try {
    const { text, transform } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ success:false, error:'No text' });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success:false, error:'AI not configured' });

    const prompts = {
      formal:     'Rewrite this to be more formal and professional. Keep the same meaning and length. Output only the rewritten text.',
      empathetic: 'Rewrite this to be warmer and more empathetic. Acknowledge the customer\'s situation. Keep the same core message. Output only the rewritten text.',
      shorter:    'Make this significantly shorter (aim for 40-50% fewer words) while keeping all key information. Output only the shortened text.',
      simpler:    'Rewrite this using simpler language (Grade 8 level). Avoid jargon and technical terms. Output only the simplified text.',
      bullets:    'Convert this into clear bullet points. Group related items. Start each bullet with a verb or key noun. Output only the bullet-pointed version.',
      prose:      'Convert these bullet points or notes into a professional, flowing paragraph. Output only the prose version.',
      subject:    'Generate 3 email subject lines for this email body. Format as:\n1. [Subject 1]\n2. [Subject 2]\n3. [Subject 3]\nOutput only the numbered list.',
      summarize:  'Summarize this email thread or long message into 3-5 bullet points covering: what the customer needs, what has been done, and what the next step is. Output only the bullets.',
    };

    const systemPrompt = prompts[transform] || prompts.shorter;
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role:'system', content:systemPrompt }, { role:'user', content:text.trim() }],
        max_tokens: 800, temperature: 0.3
      })
    });
    const data = await resp.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '';
    if (!result) throw new Error('No response');
    res.json({ success:true, result });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// POST /api/write-variations — generate 3 variations at once (formal/friendly/concise)
app.post('/api/write-variations', requireAuth, rateLimit(20, 60000), async (req, res) => {
  try {
    const { text, mode = 'general' } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ success:false, error:'No text' });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success:false, error:'AI not configured' });

    const baseCtx = AI_SYSTEM_PROMPTS[mode] || AI_SYSTEM_PROMPTS.general;
    const variationPrompt = `${baseCtx}\n\nGenerate exactly 3 different versions of a response to the following text. Each version should have a distinct style:\nVersion A: Professional and formal\nVersion B: Warm and empathetic\nVersion C: Brief and direct (50% shorter)\n\nFormat exactly as:\n[VERSION_A]\n<text here>\n[VERSION_B]\n<text here>\n[VERSION_C]\n<text here>`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role:'system', content:variationPrompt }, { role:'user', content:text.trim() }],
        max_tokens: 1500, temperature: 0.5
      })
    });
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const parseVar = (tag) => { const m = raw.match(new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\[VERSION_|$)`)); return m ? m[1].trim() : ''; };
    res.json({ success:true, variations: { formal: parseVar('VERSION_A'), friendly: parseVar('VERSION_B'), concise: parseVar('VERSION_C') } });
  } catch(e) { res.status(500).json({ success:false, error:e.message }); }
});

// GET /api/write-analyze — analyze text readability, tone, word count
app.post('/api/write-analyze', requireAuth, rateLimit(120, 60000), async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.json({ success:true, data: {} });
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const sentences = (text.match(/[.!?]+/g) || []).length || 1;
    const avgWordsPerSentence = words / sentences;
    // Flesch-Kincaid Grade Level approximation
    const syllables = text.split(/[aeiou]/gi).length;
    const fkgl = Math.max(0, (0.39 * avgWordsPerSentence + 11.8 * (syllables/words) - 15.59)).toFixed(1);
    const readLevel = fkgl <= 6 ? 'Very Easy' : fkgl <= 8 ? 'Easy' : fkgl <= 10 ? 'Medium' : fkgl <= 12 ? 'Fairly Hard' : 'Complex';
    // Estimated read time
    const readTimeSec = Math.ceil(words / 3.5); // avg reading speed ~210 wpm
    // Jargon flags (common CS/dental software terms that confuse clients)
    const jargonWords = ['API','backend','database','SQL','cache','latency','payload','webhook','sync','async','endpoint','middleware'];
    const foundJargon = jargonWords.filter(j => text.toLowerCase().includes(j.toLowerCase()));
    // Chat length warning
    const chatWarning = words > 150 ? `${words} words — too long for chat (aim under 100)` : null;
    res.json({ success:true, data: { words, sentences, avgWordsPerSentence:avgWordsPerSentence.toFixed(1), gradeLevel:fkgl, readLevel, readTimeSec, jargon:foundJargon, chatWarning } });
  } catch(e) { res.json({ success:true, data:{} }); }
});

// ── AI Writer — agent-mode-aware system prompts ──────────────────────────────
const AI_SYSTEM_PROMPTS = {
  // Email/ticket agents
  email_reply: `You are an expert CS email writer for Adit, a dental practice management software company. Rewrite the agent's draft into a polished, professional email reply to a dental practice client. Fix all grammar, be empathetic, clear, and solution-focused. Sign off warmly. Output ONLY the email body — no subject line, no explanation.`,
  email_followup: `You are an expert CS writer for Adit dental software. Write a professional follow-up email based on the agent's notes. Be warm, clear, and proactive. Remind the client of the next steps. Output ONLY the email body.`,
  ticket_note: `You are a CS documentation writer for Adit dental software. Turn the agent's rough notes into a clean, structured internal ticket note. Use bullet points for steps taken. Be factual and concise. Output ONLY the formatted note.`,
  ticket_resolution: `You are a CS writer for Adit dental software. Write a professional ticket resolution message to the client. Summarise what was resolved, confirm the fix, and invite them to reach out if needed. Be warm and clear. Output ONLY the message.`,

  // Call agents
  call_summary: `You are a CS call documentation specialist for Adit dental software. Convert the agent's call notes into a clean, structured call summary for the ticket. Format: What the client called about, what was done, next steps (if any). Be concise and factual. Output ONLY the summary.`,
  call_followup: `You are a CS writer for Adit dental software. Write a professional post-call follow-up email based on the agent's call notes. Reference what was discussed, confirm any action items, and thank the client. Output ONLY the email body.`,
  voicemail: `You are a CS writer for Adit dental software. Write a friendly, professional voicemail script based on the agent's notes. Keep it under 30 seconds to read. Be clear about who is calling, why, and what the client should do next. Output ONLY the script.`,

  // Chat agents
  chat_reply: `You are a CS chat agent writer for Adit dental software. Rewrite the agent's draft into a friendly, clear, concise chat message. Keep it conversational but professional — short paragraphs, easy to scan. No formal greetings needed. Output ONLY the chat message.`,
  chat_summary: `You are a CS documentation writer for Adit dental software. Summarise this chat conversation into a clean ticket note. Cover: what the client needed, what was resolved, any pending actions. Be brief and factual. Output ONLY the summary.`,
  chat_escalation: `You are a CS writer for Adit dental software. Write a professional escalation note based on the agent's chat notes. Explain the issue clearly so the next team can understand without reading the full chat. Include client name/practice if mentioned. Output ONLY the escalation note.`,

  // General
  general: `You are a professional writing assistant for the Adit CS team (dental practice management software). Fix grammar, improve clarity, and keep the original meaning. Be natural and professional. Output ONLY the improved text.`,
};

app.post('/api/write-assist', requireAuth, rateLimit(30, 60000), async (req, res) => {
  try {
    const { text, mode = 'general', agentType = 'email' } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'No text provided' });
    if (text.length > 5000) return res.status(400).json({ success: false, error: 'Text too long (max 5000 chars)' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'AI service not configured. Please contact your admin.' });

    const systemPrompt = AI_SYSTEM_PROMPTS[mode] || AI_SYSTEM_PROMPTS.general;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text.trim() }
        ],
        max_tokens: 1200,
        temperature: 0.35
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
    }

    const data = await response.json();
    const improved = data.choices?.[0]?.message?.content?.trim() || '';
    if (!improved) throw new Error('No response from AI');

    insertAuditLog(req.session?.email || 'unknown', 'write_assist', mode, `agent:${agentType},chars:${text.length}`).catch(() => {});
    res.json({ success: true, result: improved });
  } catch (e) {
    console.error('❌ write-assist error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/write-call-doc — RC call documentation builder
// Fetches Zoho ticket context + uses AI to generate the private-notes template
app.post('/api/write-call-doc', requireAuth, rateLimit(30, 60000), async (req, res) => {
  try {
    const {
      ticketId, dealStage = '',
      callNotes = '',
      clientName = '', practiceName = '', accountNumber = '',
      callbackNumber = '', email = ''
    } = req.body || {};

    if (!callNotes || !callNotes.trim()) return res.status(400).json({ success: false, error: 'Call notes are required' });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'AI service not configured' });

    // Attempt Zoho lookup if ticket ID provided and fields not already supplied
    let zohoData = {};
    if (ticketId && ZOHO_CLIENT_ID) {
      try {
        const token = await getZohoAccessToken();
        const headers = { 'Authorization': `Zoho-oauthtoken ${token}`, 'orgId': ZOHO_DESK_ORG_ID };
        const rawId = String(ticketId).replace(/^#/, '');
        let ticket = null;

        // Strategy A: isNumber=true direct fetch (works for any ticket age)
        try {
          const rA = await fetch(`${ZOHO_API_BASE}/tickets/${encodeURIComponent(rawId)}?isNumber=true`, { headers });
          if (rA.ok) {
            const text = await rA.text();
            if (text && text.trim() !== 'null') {
              const d = JSON.parse(text);
              const candidate = d.data ? (Array.isArray(d.data) ? d.data[0] : d.data) : (d.id ? d : null);
              if (candidate && String(candidate.ticketNumber) === rawId) ticket = candidate;
            }
          }
        } catch(e) {}

        // Strategy B: search (fallback)
        if (!ticket) {
          try {
            const sr = await fetch(`${ZOHO_API_BASE}/search?module=Tickets&searchStr=${encodeURIComponent(rawId)}&limit=10`, { headers });
            const text = await sr.text();
            if (text && text.trim() !== 'null') {
              const sd = JSON.parse(text);
              const list = sd.data || (Array.isArray(sd) ? sd : []);
              ticket = list.find(t => String(t.ticketNumber) === rawId) || null;
            }
          } catch(e) {}
        }

        if (ticket) {
          // Fetch contact AND account in parallel for complete practice info
          let contact = null, acct = null;
          await Promise.all([
            ticket.contactId ? zohoDesk(`/contacts/${ticket.contactId}`).then(c => { contact = c; }).catch(() => {}) : Promise.resolve(),
            ticket.accountId ? zohoDesk(`/accounts/${ticket.accountId}`).then(a => { acct = a;    }).catch(() => {}) : Promise.resolve(),
          ]);
          zohoData = {
            ticketNumber:   ticket.ticketNumber,
            subject:        ticket.subject || '',
            clientName:     contact?.fullName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '',
            // Practice name: account record is the source of truth
            practiceName:   acct?.accountName || contact?.accountName || '',
            accountNumber:  ticket.cf?.['Acct Number'] || ticket.cf?.cf_acct_number || acct?.cf?.['Acct Number'] || acct?.cf?.cf_acct_number || '',
            email:          contact?.email || '',
            callbackNumber: contact?.phone || contact?.mobile || contact?.homePhone || '',
          };
        }
      } catch(e) {
        console.warn('⚠ Zoho lookup in call-doc failed:', e.message);
      }
    }

    // Merge: Zoho data fills gaps; agent-provided values take precedence if supplied
    const finalClientName    = clientName    || zohoData.clientName    || '';
    const finalPracticeName  = practiceName  || zohoData.practiceName  || '';
    const finalAccountNumber = accountNumber || zohoData.accountNumber || '';
    const finalEmail         = email         || zohoData.email         || '';
    const finalCallback      = callbackNumber|| zohoData.callbackNumber|| '';
    const finalTicket        = ticketId ? String(ticketId).replace(/^#/, '') : (zohoData.ticketNumber || '');
    const finalSubject       = zohoData.subject || '';

    const systemPrompt = `You are a customer support documentation assistant for Adit, a dental practice software company.
Your job is to fill in the "Reason for contact" and "Resolution" fields of an internal RC (Relationship Coordinator) call note, based on agent-provided call notes.

Rules:
- "Reason for contact": 1–2 clear sentences describing why the client reached out (what issue/request/question)
- "Resolution": 1–2 clear sentences describing what the agent did to resolve or handle it. If not fully resolved, note next steps.
- Use professional but plain English — no jargon, no filler phrases like "I hope this helps"
- Do not repeat the template labels in your response — return ONLY the two field values separated by the exact delimiter: |||RESOLUTION|||
- Example output format:
  Client reached out regarding X.
  |||RESOLUTION|||
  Agent did Y and Z. Next steps: follow up on date.`;

    const userPrompt = `Subject: ${finalSubject || '(no subject)'}
Client: ${finalClientName || 'Unknown'}
Practice: ${finalPracticeName || 'Unknown'}
Agent call notes:
${callNotes.trim().slice(0, 2000)}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 400,
        temperature: 0.25
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
    }
    const aiData = await response.json();
    const aiRaw  = aiData.choices?.[0]?.message?.content?.trim() || '';
    const parts  = aiRaw.split('|||RESOLUTION|||');
    const reason     = (parts[0] || '').trim();
    const resolution = (parts[1] || '').trim();

    // Build the formatted template
    const template = [
      `Client Name  - ${finalClientName}`,
      `Practice Name - ${finalPracticeName}`,
      `Account Number - ${finalAccountNumber}`,
      `Deal Stage (OB or CSM or Churn) - ${dealStage}`,
      `Callback Number - ${finalCallback}`,
      `Email - ${finalEmail}`,
      `Ticket - #${finalTicket}`,
      `Reason for contact (issue, existing ticket, or some request) - ${reason}`,
      ``,
      `Resolution - ${resolution}`,
    ].join('\n');

    insertAuditLog(req.session?.email || 'unknown', 'write_call_doc', 'rcnotes', `ticket:${finalTicket}`).catch(() => {});
    res.json({
      success: true,
      template,
      prefilled: {
        clientName:    finalClientName,
        practiceName:  finalPracticeName,
        email:         finalEmail,
        callbackNumber: finalCallback,
        ticketNumber:  finalTicket,
      }
    });
  } catch(e) {
    console.error('❌ write-call-doc error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

async function startScheduler() {
  setInterval(() => { fetchPresenceForAll().catch(e => log.error('presence_sync_failed', e)); }, getFallbackSyncMs());
  cron.schedule('*/15 * * * *', async () => {
    fetchCallLogs().catch(e => console.error('❌ call log cron:', e.message));
    refreshMonthlySummary(new Date().toISOString().slice(0,7)).catch(e => console.error('❌ monthly summary sync:', e.message));
  });
  // Aggregate monthly summaries then prune raw call logs older than 7 days (1am IST daily)
  cron.schedule('30 19 * * *', async () => {
    try {
      // Refresh all months present in call_logs before we delete anything
      const { db: _db } = require('./database');
      const months = await new Promise((rs,rj) => _db.all(
        `SELECT DISTINCT strftime('%Y-%m', start_time) AS m FROM call_logs WHERE agent_name IS NOT NULL`,
        [], (err,rows) => err?rj(err):rs(rows||[])
      ));
      for (const { m } of months) { await refreshMonthlySummary(m).catch(() => {}); }
      console.log(`📊 Refreshed monthly summaries for ${months.length} month(s)`);
    } catch(e) { console.error('❌ monthly summary refresh:', e.message); }
    pruneCallLogs(7).catch(e => console.error('❌ pruneCallLogs:', e.message));
  });
  // Prune expired sessions daily
  cron.schedule('0 20 * * *', async () => { pruneExpiredSessions().catch(e => console.error('❌ pruneExpiredSessions:', e.message)); });
  // Every 2 hours: check volume, archive to Google Sheets if >90%, then prune
  // Reduced from 6h→2h to keep the 500MB Railway volume below critical threshold.
  cron.schedule('0 */2 * * *', async () => {
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

// ── Health endpoint — required for Railway healthchecks ───────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now(), deploy: 'v1.19.11', built: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════════════════════
// MISSED CALL → GOOGLE CHAT NOTIFIER
// Polls RC call logs every 2 minutes for missed/voicemail calls and posts a
// rich notification to a Google Chat Space via incoming webhook.
//
// Requires separate env vars so this bot does NOT share the break-bot webhook:
//   MISSED_CALL_WEBHOOK_URL  – webhook for the missed-calls space (REQUIRED)
//   MISSED_CALL_QUEUE_EXT    – queue extension to monitor (default: 1025)
//
// Falls back to GOOGLE_CHAT_WEBHOOK_URL only if MISSED_CALL_WEBHOOK_URL is unset.
// ══════════════════════════════════════════════════════════════════════════════
// Queue extension to monitor for missed call alerts (default: Customer Service 1025)
const MISSED_CALL_QUEUE_EXT    = process.env.MISSED_CALL_QUEUE_EXT || '1025';
// Dedicated webhook — MUST be different from GOOGLE_CHAT_WEBHOOK_URL (break bot)
const MISSED_CALL_WEBHOOK_URL  = process.env.MISSED_CALL_WEBHOOK_URL || '';
// Optional: main DID that routes to the queue (e.g. "2814681445").
// When set, any Missed call to this number is treated as a queue call even if
// RC doesn't populate to.extensionNumber (happens for quick hang-ups on the DID).
const MISSED_CALL_DID          = (process.env.MISSED_CALL_DID || '').replace(/\D/g, '');

// Optional: JSON map of RC extension number → Google Chat numeric user ID.
// When configured, agents who missed a call with ring time > 10s will be @mentioned
// in the Google Chat space so they get a notification and can call back.
// Example: AGENT_CHAT_IDS={"1234":"123456789012345678","5678":"876543210987654321"}
// To find a user's Google Chat ID: open Google Chat, click their profile → their URL
// contains the user ID, or ask your Google Workspace admin.
let _agentChatIds = {};
try {
  const _rawChatIds = process.env.AGENT_CHAT_IDS || '{}';
  _agentChatIds = JSON.parse(_rawChatIds);
} catch(e) {
  console.warn('⚠ AGENT_CHAT_IDS is not valid JSON — agent @mentions disabled');
}

const _notifiedCallIds = new Set();

// ── Debug / observability ring buffer ────────────────────────────────────────
const POLL_LOG_MAX   = 30;
const _pollLog       = [];          // ring buffer of poll run summaries
let   _lastPollAt    = null;        // ISO string of last poll start
const POLL_INTERVAL_SECS = 60;      // 1 min — reduced for faster missed-call notifications

function _pollLogPush(entry) {
  _pollLog.push(entry);
  if (_pollLog.length > POLL_LOG_MAX) _pollLog.shift();
}
// ─────────────────────────────────────────────────────────────────────────────

function _fmtSecs(s) {
  if (!s) return '0s';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function _buildGoogleChatCard(call) {
  const isVM     = call.isVoicemail;
  const inQ      = call.wasInQueue;
  const isDirect = call.isDirect === true;

  // Header
  const icon  = isVM ? '📬' : '📞';
  const label = isVM
    ? (isDirect ? 'Voicemail — Direct' : 'Voicemail Left')
    : (isDirect ? 'Missed Call — Direct' : (inQ ? 'Queue Abandoned' : 'Missed Call'));

  const callerName   = call.from.name   || '';
  const callerNumber = call.from.number || '';
  // For internal callers (ext-to-queue), phoneNumber is empty — show name only or fallback to ext
  const callerLine = callerName
    ? (callerNumber ? `${callerName}  ·  ${callerNumber}` : callerName)
    : (callerNumber || call.from.extNumber || '—');

  // If ring time > 10s and a specific agent is identified, highlight them in the subtitle
  const effectiveRingSecs = call.agentRingSecs || call.totalSecs || 0;
  // For queue calls show agent details; for direct calls the header itself is the agent destination
  const ringingAgents = !isDirect ? (call.agentDetails || []) : [];
  // Show agent suffix for queue calls with exactly one identified agent.
  // Also show for the "Missed direct" fallback (not in queue, not isDirect) so the agent is visible.
  const subtitleAgentSuffix = !isVM && effectiveRingSecs > 10 && ringingAgents.length === 1
    ? `  ·  Agent: ${ringingAgents[0].name} (Ext ${ringingAgents[0].extNumber})`
    : '';

  const timeStr = new Date(call.startTime).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }) + ' CST';

  // Destination row — queue or direct agent
  let destLabel, destTopLabel;
  if (isDirect) {
    const da = call.directAgent;
    destTopLabel = 'Called agent';
    destLabel = da
      ? `${da.name}  (Ext ${da.extNumber})`
      : (call.to.ext ? `Ext ${call.to.ext}` : call.to.name || '—');
  } else {
    destTopLabel = 'Queue';
    destLabel = call.queueName
      ? (call.queueExt ? `${call.queueName}  (Ext ${call.queueExt})` : call.queueName)
      : (call.queueExt ? `Ext ${call.queueExt}` : '—');
  }

  // Agent ring details (only meaningful for queue calls that reached agents)
  const agents = (call.agentDetails || []);
  const agentLines = !isDirect && agents.length
    ? agents.map(a => `${a.name}  (Ext ${a.extNumber})${a.duration ? `  —  ${_fmtSecs(a.duration)}` : ''}`).join('\n')
    : null;

  // Ring time
  const ringLine = call.agentRingSecs && call.agentRingSecs !== call.totalSecs
    ? `${_fmtSecs(call.totalSecs)} total  (agents rang ${_fmtSecs(call.agentRingSecs)})`
    : _fmtSecs(call.totalSecs);

  // Call type chip
  let callTypeText;
  if (isVM)      callTypeText = isDirect ? '📬 Voicemail (direct)' : '📬 Voicemail (queue)';
  else if (isDirect) callTypeText = '📞 Direct to agent';
  else if (inQ)  callTypeText = '🚪 Queue abandon';
  else           callTypeText = '📞 Missed direct';

  // Disposition
  let dispositionLine;
  if (isDirect) {
    dispositionLine = isVM ? 'Left voicemail on agent extension' : 'Rang agent extension — no answer';
  } else if (isVM) {
    dispositionLine = inQ ? 'Left voicemail after waiting in queue' : 'Left voicemail (direct to extension)';
  } else if (inQ) {
    dispositionLine = agents.length ? 'Caller hung up while agent(s) were ringing' : 'Caller hung up — no agent picked up';
  } else {
    dispositionLine = 'Rang extension — no answer';
  }

  // Build widgets
  const widgets = [
    { decoratedText: { topLabel: 'Time',       text: timeStr       } },
    { decoratedText: { topLabel: destTopLabel,  text: destLabel     } },
    { decoratedText: { topLabel: 'Ring time',   text: ringLine      } },
    { decoratedText: { topLabel: 'Call type',   text: callTypeText  } },
    { decoratedText: { topLabel: 'Disposition', text: dispositionLine } },
  ];

  if (agentLines) {
    widgets.push({ decoratedText: { topLabel: 'Agent(s) that rang', text: agentLines } });
  }
  if (isVM && call.vmTranscript) {
    widgets.push({ decoratedText: { topLabel: '🎙 Voicemail transcript', text: call.vmTranscript } });
  }

  return {
    cardsV2: [{
      cardId: `rc-missed-${call.id}`,
      card: {
        header: { title: `${icon} ${label}`, subtitle: `${callerLine}${subtitleAgentSuffix}` },
        sections: [{ widgets }],
      },
    }],
  };
}

async function _sendMissedCallNotification(call) {
  // Use the dedicated missed-call webhook — NEVER the break-bot webhook
  const url = MISSED_CALL_WEBHOOK_URL;
  if (!url) {
    console.warn('⚠ MISSED_CALL_WEBHOOK_URL not set — skipping notification');
    return;
  }
  try {
    const body = _buildGoogleChatCard(call);

    // When ring time > 10s the call reached a specific agent — add a @mention text
    // so the agent is notified in Google Chat and can call the customer back.
    // Ring time check: use agentRingSecs if available (agent actually rang), else totalSecs.
    const effectiveRingSecs = call.agentRingSecs || call.totalSecs || 0;
    const shouldMention = !call.isVoicemail && effectiveRingSecs > 10;

    if (shouldMention) {
      // Gather the agents that rang: for direct calls it's directAgent; for queue it's agentDetails
      const ringingAgents = call.isDirect
        ? (call.directAgent ? [{ extNumber: call.directAgent.extNumber, name: call.directAgent.name }] : [])
        : (call.agentDetails || []);

      // callerInfo: use name if available; skip number when blank (internal ext callers)
      const _mkCallerInfo = (f) =>
        f.name
          ? (f.number ? `${f.name} (${f.number})` : f.name)
          : (f.number || f.extNumber || '—');
      const callerInfo = _mkCallerInfo(call.from);

      if (ringingAgents.length > 0) {
        const mentionParts = ringingAgents.map(a => {
          // Prefer chatId stored in DB (set via admin UI); fall back to AGENT_CHAT_IDS env var.
          const chatId = a.chatId || _agentChatIds[String(a.extNumber)];
          // If a Google Chat user ID is configured, use a real @mention that pings them.
          // Otherwise fall back to bold name + extension so it's still visually prominent.
          return chatId
            ? `<users/${chatId}>`
            : `*${a.name}* (Ext ${a.extNumber})`;
        });

        body.text = `📞 Missed call — ${mentionParts.join(', ')} please call back: ${callerInfo}`;
      } else {
        // Agent ring time > 10s but RC didn't return individual agent legs — still flag it
        body.text = `📞 Missed call from ${callerInfo} — rang for ${_fmtSecs(effectiveRingSecs)}, please check and call back.`;
      }
    }

    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!r.ok) console.error(`⚠ Missed-call webhook ${r.status}: ${await r.text()}`);
  } catch(e) {
    console.error('❌ Missed-call send failed:', e.message);
  }
}

let _pollRunning = false; // concurrency guard — prevent overlapping poll runs
async function runMissedCallPoll() {
  if (!MISSED_CALL_WEBHOOK_URL) return;
  if (_pollRunning) {
    console.log('⏭️ Missed call poll already running — skipping overlap');
    return;
  }
  _pollRunning = true;
  const runAt = new Date().toISOString();
  _lastPollAt = runAt;
  const logEntry = { at: runAt, fetched: 0, matched: 0, notified: 0, skipped: 0, error: null, calls: [] };
  try {
    // Gather monitored agent extensions for direct-call detection
    let agentExts = [];
    try {
      const agents = await getMonitoredAgents();
      agentExts = agents.filter(a => a.extension).map(a => String(a.extension));
    } catch(e) { /* non-fatal */ }

    const calls = await fetchRecentMissedCalls(4, MISSED_CALL_QUEUE_EXT, MISSED_CALL_DID, agentExts);
    logEntry.fetched = calls._fetchedRaw ?? calls.length; // raw RC count before filter
    logEntry.matched = calls.length;

    for (const call of calls) {
      const isDup = _notifiedCallIds.has(call.id);
      const callSummary = {
        id: call.id, result: call.result, totalSecs: call.totalSecs,
        fromNumber: call.from.number, queueExt: call.queueExt,
        toExt: call.to.ext, isDirect: call.isDirect,
        notified: !isDup,
      };
      logEntry.calls.push(callSummary);

      if (isDup) { logEntry.skipped++; continue; }
      _notifiedCallIds.add(call.id);
      logEntry.notified++;

      const tag  = call.isDirect ? 'Direct missed' : 'Queue missed';
      const dest = call.isDirect
        ? `${call.directAgent?.name || call.to.ext} (Ext ${call.to.ext})`
        : `queue ${call.queueExt}`;
      console.log(`📞 ${tag}: ${call.from.number} → ${dest} → ${call.result} (${call.totalSecs}s)`);
      await _sendMissedCallNotification(call);
    }
    // Keep dedup set bounded
    if (_notifiedCallIds.size > 500) {
      [..._notifiedCallIds].slice(0, 200).forEach(id => _notifiedCallIds.delete(id));
    }
  } catch(e) {
    console.error('❌ Missed call poll error:', e.message);
    logEntry.error = e.message;
  } finally {
    _pollRunning = false;
    _pollLogPush(logEntry);
  }
}

// ── Debug panel endpoints ────────────────────────────────────────────────────

// GET /api/admin/debug-config — notifier configuration + last poll time + rate limit state
app.get('/api/admin/debug-config', requireAdmin, (req, res) => {
  res.json({
    webhookSet:       !!MISSED_CALL_WEBHOOK_URL,
    queueExt:         MISSED_CALL_QUEUE_EXT,
    knownDid:         MISSED_CALL_DID || null,
    pollIntervalSecs: POLL_INTERVAL_SECS,
    lastPollAt:       _lastPollAt,
    notifiedCount:    _notifiedCallIds.size,
    rcRateLimit:      getRcRateLimitState(),
  });
});

// GET /api/admin/debug-poll-log — ring buffer of last N poll runs
app.get('/api/admin/debug-poll-log', requireAdmin, (req, res) => {
  res.json({ entries: _pollLog });
});

// DELETE /api/admin/debug-poll-log — clear the poll log
app.delete('/api/admin/debug-poll-log', requireAdmin, (req, res) => {
  _pollLog.length = 0;
  res.json({ ok: true });
});

// POST /api/admin/force-poll — trigger a missed call poll immediately (debug)
app.post('/api/admin/force-poll', requireAdmin, async (req, res) => {
  if (!MISSED_CALL_WEBHOOK_URL) {
    return res.status(400).json({ error: 'MISSED_CALL_WEBHOOK_URL not set — notifier is disabled' });
  }
  try {
    await runMissedCallPoll();
    const last = _pollLog[_pollLog.length - 1] || null;
    res.json({ ok: true, result: last });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/debug-notified-ids — the dedup set of already-notified call IDs
app.get('/api/admin/debug-notified-ids', requireAdmin, (req, res) => {
  res.json({ ids: [..._notifiedCallIds] });
});

// GET /api/admin/debug-missed-raw?minutes=15&live=1
// Default (live=0): returns cached records from the last poll run — zero extra RC API calls.
// With live=1: makes a fresh RC API call (may be rate-limited).
app.get('/api/admin/debug-missed-raw', requireAdmin, async (req, res) => {
  const live = req.query.live === '1';
  try {
    if (!live) {
      // Serve from the in-memory cache populated by the last poll — no RC call needed
      const cached = getLastRawRecords();
      return res.json({
        source:   'poll-cache',
        fetchedAt: cached.fetchedAt,
        queueExt: MISSED_CALL_QUEUE_EXT,
        knownDid: MISSED_CALL_DID || '(not set)',
        count:    cached.records.length,
        records:  cached.records,
      });
    }
    // Live fetch — may be rate-limited
    const minutes = Math.min(Number(req.query.minutes) || 15, 60);
    const raw = await fetchRawRecentMissedLog(minutes);
    res.json({
      source:   'live',
      minutes,
      queueExt:  MISSED_CALL_QUEUE_EXT,
      knownDid:  MISSED_CALL_DID || '(not set — add MISSED_CALL_DID to Railway)',
      count:     raw.length,
      records:   raw,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/// Admin: manual trigger — always sends a synthetic test card so the webhook
// can be verified even when there are no real missed calls in the window.
app.post('/api/admin/test-missed-call-poll', requireAdmin, async (req, res) => {
  try {
    if (!MISSED_CALL_WEBHOOK_URL) {
      return res.status(503).json({ success: false, error: 'MISSED_CALL_WEBHOOK_URL not set in Railway env vars' });
    }

    // 1. Send a synthetic test card immediately so the webhook is always verifiable
    const testCard = {
      cardsV2: [{
        cardId: `rc-test-${Date.now()}`,
        card: {
          header: {
            title:    '🧪 Test — Missed Call Alert',
            subtitle: 'TEST CALLER  ·  +10000000000',
          },
          sections: [{
            widgets: [
              { decoratedText: { topLabel: 'Time',         text: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' CST' } },
              { decoratedText: { topLabel: 'Queue',        text: `Customer Service  (Ext ${MISSED_CALL_QUEUE_EXT})` } },
              { decoratedText: { topLabel: 'Ring time',    text: '18s' } },
              { decoratedText: { topLabel: 'Call type',    text: '🚪 Queue abandon' } },
              { decoratedText: { topLabel: 'Disposition',  text: 'Caller hung up while agent(s) were ringing' } },
              { decoratedText: { topLabel: 'Agent(s) that rang', text: 'Test Agent  (Ext 5512)  —  18s' } },
              { decoratedText: { topLabel: 'ℹ️ Note',      text: 'This is a test notification from Adit Agent Monitor' } },
            ],
          }],
        },
      }],
    };
    const tr = await fetch(MISSED_CALL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCard),
    });
    if (!tr.ok) {
      const errText = await tr.text();
      return res.status(502).json({ success: false, error: `Webhook returned ${tr.status}: ${errText}` });
    }

    // 2. Also run the real poll in case there are genuine recent missed calls
    await runMissedCallPoll();

    res.json({ success: true, message: 'Test card sent + poll ran — check Google Chat' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ENHANCEMENT BATCH 1 — Performance, Health, Backup, Job Queue
// ══════════════════════════════════════════════════════════════════════════════

// ─── #3: In-memory cache with TTL ────────────────────────────────────────────
const _cache = new Map();
function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { _cache.delete(key); return null; }
  return e.val;
}
function cacheSet(key, val, ttlMs) {
  _cache.set(key, { val, exp: Date.now() + ttlMs });
}
async function cacheWrap(key, ttlMs, fn) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const val = await fn();
  cacheSet(key, val, ttlMs);
  return val;
}
// Cache stats endpoint (admin only)
app.get('/api/admin/cache-stats', requireAdmin, (req, res) => {
  const entries = [];
  for (const [k, v] of _cache.entries()) {
    entries.push({ key: k, expiresInMs: Math.max(0, v.exp - Date.now()) });
  }
  res.json({ success: true, count: _cache.size, entries });
});
// Manual cache flush (admin only)
app.post('/api/admin/cache-flush', requireAdmin, (req, res) => {
  const n = _cache.size;
  _cache.clear();
  res.json({ success: true, cleared: n });
});

// ─── #25: Enhanced /healthz endpoint ─────────────────────────────────────────
app.get('/healthz', async (req, res) => {
  const checks = { server: 'ok', ts: Date.now() };
  // DB check
  try {
    const db = require('./database');
    if (typeof db.dbReady !== 'undefined') checks.db = db.dbReady ? 'ok' : 'initializing';
    else checks.db = 'ok';
  } catch (e) { checks.db = 'error:' + e.message; }
  // RingCentral check
  try {
    const rc = require('./rc-service');
    checks.rc = (rc && typeof rc.isConnected === 'function')
      ? (rc.isConnected() ? 'ok' : 'disconnected')
      : 'unknown';
  } catch (e) { checks.rc = 'error:' + e.message; }
  // Last successful agent-status poll (if tracked)
  checks.lastPollAgeMs = global._lastSuccessfulPollAt
    ? Date.now() - global._lastSuccessfulPollAt
    : null;
  const allOk = checks.db === 'ok' && checks.server === 'ok';
  res.status(allOk ? 200 : 503).json(checks);
});

// ─── #29: DB backup endpoint (admin) ─────────────────────────────────────────
app.get('/api/admin/backup-db', requireAdmin, async (req, res) => {
  try {
    const fs = require('fs');
    const dbPath = path.join(__dirname, 'productivity.db');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, error: 'DB file not found' });
    }
    const stat = fs.statSync(dbPath);
    const filename = `productivity-backup-${new Date().toISOString().slice(0,10)}.db`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(dbPath).pipe(res);
    insertAuditLog(req.session.email, 'db_backup_downloaded', filename, `size:${stat.size}b`).catch(()=>{});
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── #26: Background job queue ───────────────────────────────────────────────
const _jobs = new Map();
function jobId() { return 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2,8); }
function runJob(fn) {
  const id = jobId();
  const job = { id, status: 'queued', startedAt: null, finishedAt: null, result: null, error: null };
  _jobs.set(id, job);
  setImmediate(async () => {
    job.status = 'running';
    job.startedAt = Date.now();
    try {
      job.result = await fn();
      job.status = 'completed';
    } catch (e) {
      job.error = e.message;
      job.status = 'failed';
    }
    job.finishedAt = Date.now();
    // Auto-clean after 1 hour
    setTimeout(() => _jobs.delete(id), 3600000);
  });
  return id;
}
app.get('/api/admin/jobs', requireAdmin, (req, res) => {
  res.json({ success: true, jobs: Array.from(_jobs.values()) });
});
app.get('/api/admin/jobs/:id', requireAdmin, (req, res) => {
  const j = _jobs.get(req.params.id);
  if (!j) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, job: j });
});
// Example async report job — non-blocking
app.post('/api/admin/jobs/heavy-report', requireAdmin, (req, res) => {
  const tz = req.query.tz || 'America/Chicago';
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const id = runJob(async () => {
    const results = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
      results.push({ date: dateStr, agents: await getAgentSummary(dateStr, tz) });
    }
    return { days, generated: results.length };
  });
  res.json({ success: true, jobId: id });
});

// ─── #13: Daily digest HTML generator (no email wiring yet) ──────────────────
app.get('/api/admin/daily-digest', requireAdmin, async (req, res) => {
  try {
    const tz = req.query.tz || 'America/Chicago';
    const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const summary = await getAgentSummary(date, tz);
    const totalCalls   = summary.reduce((a, x) => a + (x.calls_handled || 0), 0);
    const totalMissed  = summary.reduce((a, x) => a + (x.calls_missed  || 0), 0);
    const totalLive    = summary.reduce((a, x) => a + (x.live_minutes  || 0), 0);
    const topAgent = summary.slice().sort((a,b) => (b.calls_handled||0) - (a.calls_handled||0))[0];
    const html = `<!doctype html><html><body style="font-family:Poppins,Arial,sans-serif;background:#F7F8F8;padding:20px;">
      <div style="max-width:600px;margin:auto;background:white;border-radius:12px;padding:24px;border:1px solid #E6ECF4;">
        <h2 style="color:#072B40;margin:0 0 4px;">Daily Digest · ${date}</h2>
        <p style="color:#6B849A;margin:0 0 20px;font-size:13px;">Adit Agent Monitor — automated rollup</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;">
          <div style="background:#F0F2F5;padding:12px;border-radius:8px;"><div style="font-size:10px;color:#6B849A;text-transform:uppercase;letter-spacing:.08em;">Calls Handled</div><div style="font-size:24px;font-weight:800;color:#072B40;">${totalCalls}</div></div>
          <div style="background:#F0F2F5;padding:12px;border-radius:8px;"><div style="font-size:10px;color:#6B849A;text-transform:uppercase;letter-spacing:.08em;">Missed</div><div style="font-size:24px;font-weight:800;color:#ED666B;">${totalMissed}</div></div>
          <div style="background:#F0F2F5;padding:12px;border-radius:8px;"><div style="font-size:10px;color:#6B849A;text-transform:uppercase;letter-spacing:.08em;">Live Min</div><div style="font-size:24px;font-weight:800;color:#2DDC96;">${totalLive}</div></div>
        </div>
        ${topAgent ? `<div style="background:rgba(244,137,31,.06);border-left:3px solid #F4891F;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;"><div style="font-size:11px;color:#F4891F;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">⭐ Top Performer</div><div style="font-size:15px;font-weight:700;color:#072B40;margin-top:4px;">${topAgent.name || topAgent.agent || 'Unknown'} — ${topAgent.calls_handled||0} calls</div></div>` : ''}
        <p style="font-size:11px;color:#9BAFC0;margin:20px 0 0;border-top:1px solid #E6ECF4;padding-top:12px;">Generated ${new Date().toISOString()} · ${summary.length} agents tracked.</p>
      </div>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── #29: Apply cache to high-traffic endpoints (wrap existing handlers) ─────
// Note: we patch via middleware so original behavior is preserved
function cachedGet(path, ttlMs, keyFn) {
  return async (req, res, next) => {
    const key = `${path}:${keyFn ? keyFn(req) : ''}`;
    const hit = cacheGet(key);
    if (hit !== null) return res.json(hit);
    // Hijack res.json to cache the response
    const origJson = res.json.bind(res);
    res.json = (body) => {
      if (body && body.success !== false) cacheSet(key, body, ttlMs);
      return origJson(body);
    };
    next();
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ENHANCEMENT BATCH 3 — DB-backed features + ML + infra
// ══════════════════════════════════════════════════════════════════════════════

// ─── #9: Shift handoff notes ────────────────────────────────────────────────
app.post('/api/handoff', requireAuth, async (req, res) => {
  try {
    const note = (req.body && req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, error: 'note required' });
    await createHandoff(req.session.email, note);
    insertAuditLog(req.session.email, 'handoff_note', '', note.slice(0,80)).catch(()=>{});
    res.json({ success: true });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/handoffs/unread', requireAuth, async (req, res) => {
  try { res.json({ success: true, data: await getUnreadHandoffs() }); }
  catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/handoffs/recent', requireAuth, async (req, res) => {
  try { res.json({ success: true, data: await getRecentHandoffs(50) }); }
  catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/handoff/:id/ack', requireAuth, async (req, res) => {
  try {
    await ackHandoff(parseInt(req.params.id), req.session.email);
    res.json({ success: true });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});

// ─── #10: Wellness check-in ─────────────────────────────────────────────────
app.post('/api/wellness', requireAuth, async (req, res) => {
  try {
    const { mood, note, date } = req.body || {};
    if (!['great','ok','rough','skip'].includes(mood)) {
      return res.status(400).json({ success: false, error: 'mood must be great|ok|rough|skip' });
    }
    const today = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    await upsertWellness(req.session.email, today, mood, note);
    res.json({ success: true });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/wellness/me', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    res.json({ success: true, data: await getWellnessForEmail(req.session.email, days) });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/wellness/today', requireAuth, async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    res.json({ success: true, hasCheckedIn: await hasWellnessToday(req.session.email, today) });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/wellness/team', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    res.json({ success: true, data: await getWellnessTeamSummary(days) });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});

// ─── #12: Coach mode flags ──────────────────────────────────────────────────
app.post('/api/coach-flag', requireAdmin, async (req, res) => {
  try {
    const { agentEmail, reason } = req.body || {};
    if (!agentEmail) return res.status(400).json({ success: false, error: 'agentEmail required' });
    await createCoachFlag(agentEmail, req.session.email, reason);
    insertAuditLog(req.session.email, 'coach_flag_set', agentEmail, reason || '').catch(()=>{});
    res.json({ success: true });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/coach-flag/me', requireAuth, async (req, res) => {
  try {
    const flag = await getPendingCoachFlag(req.session.email);
    res.json({ success: true, flag });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.post('/api/coach-flag/:id/ack', requireAuth, async (req, res) => {
  try {
    await ackCoachFlag(parseInt(req.params.id));
    res.json({ success: true });
  } catch(e){ res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/coach-flags', requireAdmin, async (req, res) => {
  try { res.json({ success: true, data: await listActiveCoachFlags() }); }
  catch(e){ res.status(500).json({ success: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PREDICTIVE ABANDONMENT (#16 Session 11) — real logistic regression
// Replaces the Session 1 per-hour-mean stub.
// ══════════════════════════════════════════════════════════════════════════════
const PREDICT = require('./lib/predict');

// Build a training row dataset from the last N days of call_logs.
// Each row = one 15-minute window with features + label.
async function buildPredictTrainingSet(days) {
  const tz = 'America/Chicago';
  days = Math.min(Math.max(days || 30, 7), 90);
  const today = new Date();
  const rows = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
    let abandoned = [];
    try { abandoned = await getAbandonedCalls(dateStr, tz); } catch (e) { continue; }
    if (!Array.isArray(abandoned)) continue;

    // Bucket abandons by hour-of-day → quick label lookup
    const abandonsByHourMin = new Map();
    for (const c of abandoned) {
      const t = new Date(c.start_time || c.startTime || Date.now());
      const h = t.getHours();
      const m = Math.floor(t.getMinutes() / 15);
      const key = h + ':' + m;  // e.g. "14:2" = 14:30-14:45
      abandonsByHourMin.set(key, (abandonsByHourMin.get(key) || 0) + 1);
    }

    // Build feature rows for business-hours 15-min windows
    for (let h = 9; h < 17; h++) {
      for (let m = 0; m < 4; m++) {
        const key = h + ':' + m;
        const label = (abandonsByHourMin.get(key) || 0) > 0 ? 1 : 0;
        // Synthesize feature values from the day's overall stats — in v2 we'd
        // pull queue_depth at-time-T from presence_events; that's a future
        // refinement. For now, use end-of-day aggregates as a proxy.
        const features = {
          queueDepth: 0,           // placeholder until we query presence_events
          hourOfDay: h + m * 0.25,
          weekday: d.getDay(),
          avgWaitSeconds: 0,       // placeholder
          agentsAvailable: 0       // placeholder
        };
        rows.push({ features, label });
      }
    }
  }
  return rows;
}

// Cache the latest model in memory so we don't hit the DB on every prediction request
let _cachedPredictModel = null;
let _cachedPredictModelAt = 0;
const PREDICT_CACHE_TTL_MS = 60 * 1000;  // 1 minute

async function getCachedPredictModel() {
  if (_cachedPredictModel && Date.now() - _cachedPredictModelAt < PREDICT_CACHE_TTL_MS) {
    return _cachedPredictModel;
  }
  _cachedPredictModel = await loadPredictModel().catch(() => null);
  _cachedPredictModelAt = Date.now();
  return _cachedPredictModel;
}

async function trainAndPersistPredictModel(days) {
  const rows = await buildPredictTrainingSet(days || 30);
  const model = PREDICT.trainLogisticRegression(rows, { iterations: 300 });
  if (model.ready) {
    await savePredictModel(model);
    log.info('predict_model_trained', {
      sampleSize: model.sampleSize,
      finalLoss: model.finalLoss,
      precision: model.evalMetrics?.precision,
      recall: model.evalMetrics?.recall,
      accuracy: model.evalMetrics?.accuracy
    });
    // Invalidate cache so next request picks up the freshly trained model
    _cachedPredictModel = null;
  } else {
    log.warn('predict_model_train_skipped', { reason: model.reason, sampleSize: model.sampleSize });
  }
  return model;
}

// Nightly retraining cron — fires every 10 min, runs at 03:30 CST
let _predictCronStarted = false;
global._startPredictCron = function startPredictCron() {
  if (_predictCronStarted) return;
  _predictCronStarted = true;
  const HOUR = parseInt(process.env.PREDICT_RUN_HOUR_CST) || 3;
  const MIN = 30;  // offset from anomaly cron (which runs at :00)
  setInterval(async () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    if (h === HOUR && Math.abs(m - MIN) < 5) {
      log.info('predict_cron_tick', { hour: HOUR, min: MIN });
      await trainAndPersistPredictModel(30);
    }
  }, 10 * 60 * 1000);  // every 10 min
  log.info('predict_cron_started', { hourCst: HOUR, min: MIN });
};

// ─── Inference endpoint ────────────────────────────────────────────────────
app.get('/api/predict/abandonment', requireAuth, async (req, res) => {
  try {
    const model = await getCachedPredictModel();
    if (!model || !model.ready) {
      return res.json({
        success: true,
        ready: false,
        reason: 'no_model',
        message: 'No trained model yet. Trigger via POST /api/admin/predict/train (admin).'
      });
    }
    const tz = req.query.tz || 'America/Chicago';
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: 'numeric', hour12: false, minute: '2-digit', weekday: 'short'
    }).formatToParts(now);
    const hourOfDay = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const wd = parts.find(p => p.type === 'weekday')?.value || 'Mon';
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);

    // Build features — agents/queue come from in-memory globals
    const liveMap = (typeof global.rcLiveStatus === 'object' && global.rcLiveStatus) || {};
    let queueDepth = 0, agentsAvailable = 0;
    for (const ext of Object.keys(liveMap)) {
      const a = liveMap[ext] || {};
      if (String(a.status || '').toLowerCase() === 'ringing') queueDepth++;
      if (String(a.status || '').toLowerCase() === 'available') agentsAvailable++;
    }
    // avgWait — use the queueDepth snapshot if maintained, else 0
    const avgWaitSeconds = (global._queueDepthSnapshot && global._queueDepthSnapshot.avgWaitSec) || 0;

    const features = { queueDepth, hourOfDay, weekday, avgWaitSeconds, agentsAvailable };
    const prediction = PREDICT.predictAbandonProb({ model, features });

    res.json({
      success: true,
      ready: true,
      prediction,
      model: {
        fittedAt: model.fittedAt,
        sampleSize: model.sampleSize,
        evalMetrics: model.evalMetrics
      }
    });
  } catch (e) {
    log.error('predict_failed', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Admin: force retrain ──────────────────────────────────────────────────
app.post('/api/admin/predict/train', requireAdmin, async (req, res) => {
  try {
    const days = req.body && req.body.days ? parseInt(req.body.days) : 30;
    const model = await trainAndPersistPredictModel(days);
    insertAuditLog(req.session.email, 'predict_model_trained', 'abandon_15min',
      `sampleSize=${model.sampleSize || 0} ready=${!!model.ready}`).catch(() => {});
    res.json({
      success: true,
      ready: !!model.ready,
      sampleSize: model.sampleSize,
      reason: model.reason,
      evalMetrics: model.evalMetrics,
      notes: model.notes
    });
  } catch (e) {
    log.error('predict_train_endpoint_failed', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Admin: model debug info ───────────────────────────────────────────────
app.get('/api/predict/model', requireAdmin, async (req, res) => {
  const model = await getCachedPredictModel();
  if (!model) return res.json({ success: true, ready: false });
  res.json({
    success: true,
    ready: true,
    modelKey: model.modelKey,
    fittedAt: model.fittedAt,
    featureKeys: model.featureKeys,
    weights: model.weights,
    mu: model.mu,
    sigma: model.sigma,
    sampleSize: model.sampleSize,
    evalMetrics: model.evalMetrics,
    notes: model.notes
  });
});

// ─── Backtest viewer (yesterday's predictions vs reality) ──────────────────
app.get('/api/predict/backtest', requireAuth, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30);
    const tz = 'America/Chicago';
    const model = await getCachedPredictModel();
    if (!model || !model.ready) {
      return res.json({ success: true, ready: false, message: 'No trained model yet' });
    }
    const today = new Date();
    const out = [];
    for (let i = days; i >= 1; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
      let abandoned = [];
      try { abandoned = await getAbandonedCalls(dateStr, tz); } catch (e) {}
      const actualAbandons = Array.isArray(abandoned) ? abandoned.length : 0;
      // Aggregate: for each hour the model would have predicted vs reality.
      // Simplified — predict at mid-day with average features.
      const features = {
        queueDepth: 0, hourOfDay: 13, weekday: d.getDay(),
        avgWaitSeconds: 0, agentsAvailable: 0
      };
      const pred = PREDICT.predictAbandonProb({ model, features });
      out.push({
        date: dateStr,
        predicted: pred.probability,
        actual: actualAbandons > 0 ? 1 : 0,
        actualCount: actualAbandons
      });
    }
    res.json({ success: true, ready: true, days, backtest: out });
  } catch (e) {
    log.error('predict_backtest_failed', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── #14: Schedule adherence (computed from break_events) ───────────────────
// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE ADHERENCE (#14 Session 4) — versioned schedules + real adherence
// Replaces the hardcoded 9-5 stub from Session 1.
// ══════════════════════════════════════════════════════════════════════════════
const { evaluateBulk: evaluateScheduleBulk, parseTimeStrToMinutes } = require('./lib/schedule');

// Helper: parse 'HH:MM' (or 'HH:MM:SS') from a summary row → minutes-of-day
function summaryTimeToMinute(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

// ─── GET /api/schedule-adherence ───────────────────────────────────────────
// Real implementation using lib/schedule engine + configured schedules.
app.get('/api/schedule-adherence', requireAuth, async (req, res) => {
  try {
    const tz = req.query.tz || 'America/Chicago';
    const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });

    // 1. Pull configured schedules for all agents (map: email → rowsArray)
    const schedulesByAgent = await getAllSchedules();
    // 2. Pull today's actuals (login/logout times + break minutes)
    const summary = await getAgentSummary(date, tz);
    const actualsByAgent = {};
    for (const a of (summary || [])) {
      const email = a.email || a.agent_email;
      if (!email) continue;
      actualsByAgent[email] = {
        firstLoginMinute: summaryTimeToMinute(a.first_login_time),
        lastLogoutMinute: summaryTimeToMinute(a.last_logout_time),
        breakMinutes: parseInt(a.break_minutes || a.breakMinutes || 0),
        scheduledBreakMinutes: 60  // default policy — Session 5 will make this configurable per-agent
      };
    }

    // 3. Compute current minute-of-day in business tz for "now" evaluation
    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const hStr = nowParts.find(p => p.type === 'hour')?.value || '0';
    const mStr = nowParts.find(p => p.type === 'minute')?.value || '0';
    const nowMinute = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

    // 4. Run the engine
    const records = evaluateScheduleBulk(schedulesByAgent, actualsByAgent, date, nowMinute);

    // 5. Enrich each record with agent display name (best effort)
    const monitored = await cacheWrap('agents:list', 5000, () => getMonitoredAgents());
    const nameByEmail = {};
    for (const a of (monitored || [])) if (a.email) nameByEmail[a.email] = a.name;

    const enriched = records.map(r => ({
      ...r,
      name: nameByEmail[r.email] || r.email,
    }));

    res.json({
      success: true,
      date,
      timeZone: tz,
      nowMinute,
      count: enriched.length,
      adherence: enriched
    });
  } catch (e) {
    log.error('schedule_adherence_failed', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/schedule-adherence/:email — per-agent history ────────────────
app.get('/api/schedule-adherence/:email', requireAuth, async (req, res) => {
  try {
    const email = req.params.email;
    // Self or admin
    if (req.session.email !== email && req.session.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
    const tz = req.query.tz || 'America/Chicago';
    const schedules = await getSchedulesForAgent(email);
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
      const summary = await getAgentSummary(dateStr, tz);
      const row = (summary || []).find(a => a.email === email || a.agent_email === email);
      const actuals = row ? {
        firstLoginMinute: summaryTimeToMinute(row.first_login_time),
        lastLogoutMinute: summaryTimeToMinute(row.last_logout_time),
        breakMinutes: parseInt(row.break_minutes || 0),
        scheduledBreakMinutes: 60
      } : {};
      const records = evaluateScheduleBulk(
        { [email]: schedules },
        { [email]: actuals },
        dateStr,
        i === 0 ? 1440 : 1440  // historical days: evaluate as end-of-day
      );
      out.push(records[0] || { dateStr, status: 'unknown' });
    }
    res.json({ success: true, email, days, adherence: out });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── GET /api/schedules — list all (admin) ─────────────────────────────────
app.get('/api/schedules', requireAdmin, async (req, res) => {
  try { res.json({ success: true, schedules: await getAllSchedules() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── GET /api/schedules/:email — one agent (self or admin) ─────────────────
app.get('/api/schedules/:email', requireAuth, async (req, res) => {
  try {
    const email = req.params.email;
    if (req.session.email !== email && req.session.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const rows = await getSchedulesForAgent(email);
    res.json({ success: true, email, schedules: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── GET /api/schedules/:email/history — versioned history (admin) ─────────
app.get('/api/schedules/:email/history', requireAdmin, async (req, res) => {
  try { res.json({ success: true, history: await getScheduleHistory(req.params.email) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── PUT /api/schedules/:email — admin sets/replaces (versions) ────────────
//   body: { effectiveFrom: 'YYYY-MM-DD', week: [{day_of_week, start_time, end_time, is_working_day, timezone}] }
app.put('/api/schedules/:email', requireAdmin, async (req, res) => {
  try {
    const email = req.params.email;
    const { effectiveFrom, week } = req.body || {};
    if (!effectiveFrom || !Array.isArray(week) || week.length === 0) {
      return res.status(400).json({ success: false, error: 'effectiveFrom and week[] required' });
    }
    // Validate times via parseTimeStrToMinutes — engine's parser
    for (const r of week) {
      if (r.is_working_day !== 0) {
        if (parseTimeStrToMinutes(r.start_time) == null || parseTimeStrToMinutes(r.end_time) == null) {
          return res.status(400).json({ success: false, error: `Invalid time for day ${r.day_of_week}` });
        }
      }
    }
    // End-date prior versions, then insert the new version
    await endDatePriorSchedule(email, effectiveFrom);
    await insertScheduleVersion(week, email, effectiveFrom, req.session.email);
    insertAuditLog(req.session.email, 'schedule_updated', email,
      `from=${effectiveFrom} days=${week.length}`).catch(()=>{});
    log.info('schedule_updated', { email, effectiveFrom, by: req.session.email });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ─── POST /api/schedules/bulk — apply schedule to many agents (admin) ──────
//   body: { emails: [...], effectiveFrom, week }
app.post('/api/schedules/bulk', requireAdmin, async (req, res) => {
  try {
    const { emails, effectiveFrom, week } = req.body || {};
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, error: 'emails[] required' });
    }
    if (!effectiveFrom || !Array.isArray(week)) {
      return res.status(400).json({ success: false, error: 'effectiveFrom and week[] required' });
    }
    const results = [];
    for (const email of emails) {
      try {
        await endDatePriorSchedule(email, effectiveFrom);
        await insertScheduleVersion(week, email, effectiveFrom, req.session.email);
        results.push({ email, ok: true });
      } catch (innerErr) {
        results.push({ email, ok: false, error: innerErr.message });
      }
    }
    insertAuditLog(req.session.email, 'schedule_bulk_updated', '',
      `count=${emails.length} from=${effectiveFrom}`).catch(()=>{});
    log.info('schedule_bulk_updated', { count: emails.length, effectiveFrom, by: req.session.email });
    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── DELETE /api/schedules/:email — end-date current schedule (admin) ──────
// Note: this end-dates instead of physically deleting, preserving history.
app.delete('/api/schedules/:email', requireAdmin, async (req, res) => {
  try {
    const email = req.params.email;
    const tz = req.query.tz || 'America/Chicago';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    await endDatePriorSchedule(email, today);
    insertAuditLog(req.session.email, 'schedule_ended', email, `endDate=${today}`).catch(()=>{});
    log.info('schedule_ended', { email, today, by: req.session.email });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── #4: WebSocket diff broadcasts (helper) ─────────────────────────────────
// Stores last-broadcast state per client topic, computes minimal diffs.
global._lastBroadcast = {};
global.computeBroadcastDiff = function(topic, currentState){
  const prev = global._lastBroadcast[topic];
  if (!prev) {
    global._lastBroadcast[topic] = JSON.parse(JSON.stringify(currentState));
    return { type: 'full', data: currentState };
  }
  // Simple shallow-diff for arrays of {id, ...} objects
  if (Array.isArray(currentState) && Array.isArray(prev)) {
    const prevMap = new Map(prev.map(x => [x.id || x.extension, x]));
    const changed = [];
    currentState.forEach(item => {
      const key = item.id || item.extension;
      const before = prevMap.get(key);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        changed.push(item);
      }
    });
    global._lastBroadcast[topic] = JSON.parse(JSON.stringify(currentState));
    return { type: changed.length === currentState.length ? 'full' : 'diff', data: changed, totalRecords: currentState.length };
  }
  global._lastBroadcast[topic] = JSON.parse(JSON.stringify(currentState));
  return { type: 'full', data: currentState };
};

// ─── #1: Module loader endpoint (split-monolith scaffold) ───────────────────
// Each module file lives in /public/modules/*.js and is loaded on demand.
// This endpoint lets the client discover available modules.
app.get('/api/modules', requireAuth, (req, res) => {
  // For now, served statically from /modules/. Future: gated per role.
  res.json({
    success: true,
    modules: [
      { name: 'dashboard',  path: '/modules/dashboard.js',  role: 'all' },
      { name: 'break-bot',  path: '/modules/break-bot.js',  role: 'all' },
      { name: 'reports',    path: '/modules/reports.js',    role: 'all' },
      { name: 'tickets',    path: '/modules/tickets.js',    role: 'all' },
      { name: 'admin',      path: '/modules/admin.js',      role: 'admin' }
    ]
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// REAL-TIME ALERTS (#11 Session 2) — engine wiring + endpoints + cron
// ══════════════════════════════════════════════════════════════════════════════

// ─── Build state snapshot for the alert engine ─────────────────────────────
// All sources are best-effort — missing data simply means "skip that rule".
async function buildAlertState() {
  const now = Date.now();
  const thresholds = await getAlertThresholds();

  // Snapshot agents (use cache so we don't hammer DB on the cron tick)
  let agents = [];
  try { agents = await cacheWrap('agents:list', 5000, () => getMonitoredAgents()); } catch(e){}

  // Map agents into the engine's expected shape.
  // We rely on rc-service to track live status — read from globals it exposes.
  const liveMap = (typeof global.rcLiveStatus === 'object' && global.rcLiveStatus) || {};
  const agentSnapshots = (agents || []).map(a => {
    const live = liveMap[a.extension] || {};
    return {
      email: a.email,
      name: a.name,
      extension: a.extension,
      status: String(live.status || 'offline'),
      sinceMs: live.sinceMs || null,
      currentCallStartedAt: live.currentCallStartedAt || null
    };
  });

  // Queue depth + zero-coverage tracking (maintained globally)
  const queueDepth = global._queueDepthSnapshot || null;
  const coverage   = global._coverageSnapshot || null;

  // Calls in last 15 min — read from a rolling buffer if available
  const callsLast15Min = Array.isArray(global._callsLast15Min) ? global._callsLast15Min : [];

  // Hour-of-day in business timezone (CST)
  const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(now));
  const nowHourCST = parseInt(hourStr) % 24;

  return { now, thresholds, agents: agentSnapshots, queueDepth, coverage, callsLast15Min, nowHourCST };
}

// ─── Cron evaluator — runs every 30s ───────────────────────────────────────
const ALERT_INTERVAL_MS = parseInt(process.env.ALERT_INTERVAL_MS) || 30_000;
async function runAlertEvaluator() {
  try {
    const state = await buildAlertState();
    const fired = evaluateAllAlerts(state);
    if (!fired.length) return;
    for (const alert of fired) {
      try {
        const cfg = state.thresholds[alert.key];
        const cooldownSec = (cfg && cfg.cooldown_seconds) || 300;
        if (await isAlertInCooldown(alert.key, cooldownSec)) {
          log.debug('alert_skipped_cooldown', { key: alert.key, cooldownSec });
          continue;
        }
        const id = await insertAlertEvent({
          key: alert.key,
          severity: alert.severity,
          body: alert.body,
          data: alert.data || {},
          agentEmail: alert.agentEmail || null
        });
        log.info('alert_fired', { id, key: alert.key, severity: alert.severity });
        // Broadcast via SSE if the broadcaster is wired up
        if (typeof global.broadcastSseEvent === 'function') {
          global.broadcastSseEvent('alert', { id, ...alert });
        }
      } catch (innerErr) {
        log.error('alert_persist_failed', innerErr, { key: alert.key });
      }
    }
  } catch (err) {
    log.error('alert_evaluator_failed', err);
  }
}
// Start after server boots — see start() below
global._startAlertCron = function startAlertCron() {
  if (global._alertCronStarted) return;
  global._alertCronStarted = true;
  log.info('alert_cron_started', { intervalMs: ALERT_INTERVAL_MS });
  setInterval(runAlertEvaluator, ALERT_INTERVAL_MS);
  setTimeout(runAlertEvaluator, 5000);  // initial run after 5s
};

// ─── Endpoints ─────────────────────────────────────────────────────────────

// List active (unacked + not-snoozed) alerts — newest first
app.get('/api/alerts/active', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = await getActiveAlerts(limit);
    const counts = await getAlertCounts();
    res.json({ success: true, alerts: rows.map(parseAlertRow), counts });
  } catch (e) {
    log.error('alerts_active_failed', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Audit list — last N days of all alerts (acked or not)
app.get('/api/alerts/recent', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const rows = await getRecentAlerts(days);
    res.json({ success: true, days, alerts: rows.map(parseAlertRow) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Acknowledge a single alert
app.post('/api/alerts/:id/ack', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
    await ackAlert(id, req.session.email);
    log.info('alert_acked', { id, by: req.session.email });
    // Broadcast so other open tabs update their bell badge in real time
    if (typeof global.broadcastSseEvent === 'function') {
      global.broadcastSseEvent('alert_ack', { id, by: req.session.email });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Acknowledge every active alert in one call ("Mark all read")
app.post('/api/alerts/ack-all', requireAuth, async (req, res) => {
  try {
    const changed = await ackAllActiveAlerts(req.session.email);
    log.info('alerts_ack_all', { count: changed, by: req.session.email });
    if (typeof global.broadcastSseEvent === 'function') {
      global.broadcastSseEvent('alert_ack_all', { count: changed, by: req.session.email });
    }
    res.json({ success: true, count: changed });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Snooze an alert for N minutes (default 15)
app.post('/api/alerts/:id/snooze', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const minutes = parseInt(req.query.minutes) || 15;
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
    await snoozeAlert(id, minutes);
    log.info('alert_snoozed', { id, minutes, by: req.session.email });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Read all thresholds
app.get('/api/alerts/thresholds', requireAuth, async (req, res) => {
  try { res.json({ success: true, thresholds: await getAlertThresholds() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin: update one threshold
app.put('/api/alerts/thresholds/:key', requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    if (!ALERT_KEYS.includes(key)) {
      return res.status(400).json({ success: false, error: 'unknown alert key' });
    }
    await updateAlertThreshold(key, req.body || {}, req.session.email);
    insertAuditLog(req.session.email, 'alert_threshold_updated', key, JSON.stringify(req.body || {})).catch(()=>{});
    log.info('alert_threshold_updated', { key, by: req.session.email });
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Unknown') ? 404 : 400).json({ success: false, error: e.message });
  }
});

// Admin: fire a synthetic alert for testing the broadcast pipeline
app.post('/api/admin/alerts/test', requireAdmin, async (req, res) => {
  try {
    const { key, severity, body } = req.body || {};
    if (!key || !body) return res.status(400).json({ success: false, error: 'key and body required' });
    const id = await insertAlertEvent({
      key,
      severity: severity || 'info',
      body: '[TEST] ' + body,
      data: { test: true, firedBy: req.session.email }
    });
    if (typeof global.broadcastSseEvent === 'function') {
      global.broadcastSseEvent('alert', { id, key, severity: severity || 'info', body: '[TEST] ' + body, data: { test: true } });
    }
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Helper — parses data_json on an alert row
function parseAlertRow(row) {
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch(e){}
  return {
    id: row.id,
    key: row.key,
    severity: row.severity,
    body: row.body,
    data,
    agentEmail: row.agent_email,
    createdAt: row.created_at,
    ackedAt: row.acked_at || null,
    ackedBy: row.acked_by || null,
    snoozedUntil: row.snoozed_until || null
  };
}

// ── Global error handler — structured logger replaces ad-hoc console ─────────
// ══════════════════════════════════════════════════════════════════════════════
// ANOMALY DETECTION (#20 Session 6) — robust z-score engine + daily cron
// Replaces the rough DOM-scraping stub from Session 1.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Build per-agent history snapshot for the engine ──────────────────────
// For each agent, pull the last `lookbackDays` days of getAgentSummary()
// data and map into the metric arrays the engine expects.
async function buildAnomalyHistoryForDate(targetDateStr) {
  const tz = 'America/Chicago';
  const thresholds = await getAnomalyThresholds();
  // Maximum lookback across all metrics — single pass through history
  const maxLookback = Math.max(...Object.values(thresholds).map(t => t.lookback_days || 30), 30);
  const agents = await cacheWrap('agents:list', 5000, () => getMonitoredAgents());
  const targetDate = new Date(targetDateStr + 'T12:00:00Z');  // mid-day to avoid TZ edge

  // Initialize per-email skeleton
  const out = {};
  for (const a of (agents || [])) {
    if (!a.email) continue;
    out[a.email] = {
      historyByMetric: {
        daily_live_minutes: [],
        daily_call_volume: [],
        daily_missed_calls: [],
        daily_break_minutes: [],
        daily_aht_seconds: []
      },
      todayByMetric: {}
    };
  }

  // Walk back day-by-day. Last position = today; earlier = baseline history.
  for (let i = 0; i <= maxLookback; i++) {
    const d = new Date(targetDate); d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz });
    let summary;
    try { summary = await getAgentSummary(dateStr, tz); }
    catch (e) { continue; }
    if (!Array.isArray(summary)) continue;
    for (const row of summary) {
      const email = row.email || row.agent_email;
      if (!email || !out[email]) continue;
      const liveMin = Math.round((row.availableSeconds || 0) / 60);
      const callVol = (row.totalCalls != null) ? row.totalCalls : ((row.inboundCalls || 0) + (row.outboundCalls || 0));
      const missed = row.missedCalls || 0;
      const breakMin = Math.round((row.unavailableSeconds || 0) / 60);  // proxy until break_events aggregation lands
      const aht = row.ahtInbound || 0;
      if (i === 0) {
        // Today's values
        out[email].todayByMetric.daily_live_minutes = liveMin;
        out[email].todayByMetric.daily_call_volume = callVol;
        out[email].todayByMetric.daily_missed_calls = missed;
        out[email].todayByMetric.daily_break_minutes = breakMin;
        out[email].todayByMetric.daily_aht_seconds = aht;
      } else {
        // Push to history
        out[email].historyByMetric.daily_live_minutes.push(liveMin);
        out[email].historyByMetric.daily_call_volume.push(callVol);
        out[email].historyByMetric.daily_missed_calls.push(missed);
        out[email].historyByMetric.daily_break_minutes.push(breakMin);
        out[email].historyByMetric.daily_aht_seconds.push(aht);
      }
    }
  }
  return { agents: out, thresholds, date: targetDateStr };
}

// ─── Run evaluator + persist results ───────────────────────────────────────
async function runAnomalyEvaluator(targetDateStr) {
  try {
    const tz = 'America/Chicago';
    const date = targetDateStr || new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const { agents, thresholds } = await buildAnomalyHistoryForDate(date);
    const anomalies = ANOMALY.evaluateBulk(agents, thresholds);
    let inserted = 0, skipped = 0;
    for (const a of anomalies) {
      try {
        const id = await insertAnomalyEvent({
          agent_email: a.agentEmail,
          metric: a.metric,
          date,
          today_value: a.todayValue,
          baseline_median: a.baselineMedian,
          baseline_mad: a.baselineMad,
          modified_z: a.modifiedZ,
          direction: a.direction,
          severity: a.severity,
          flat_baseline: !!a.flatBaseline,
          sample_size: a.sampleSize
        });
        if (id) {
          inserted++;
          log.info('anomaly_detected', {
            id, email: a.agentEmail, metric: a.metric, severity: a.severity,
            z: a.modifiedZ, today: a.todayValue, median: a.baselineMedian
          });
          // Live-push to any open AnomalyCenter clients (Session 7)
          if (typeof global.broadcastSseEvent === 'function') {
            global.broadcastSseEvent('anomaly', {
              id,
              agent_email: a.agentEmail,
              metric: a.metric,
              date,
              today_value: a.todayValue,
              baseline_median: a.baselineMedian,
              baseline_mad: a.baselineMad,
              modified_z: a.modifiedZ,
              direction: a.direction,
              severity: a.severity,
              flat_baseline: !!a.flatBaseline,
              sample_size: a.sampleSize,
              created_at: new Date().toISOString()
            });
          }
        } else {
          skipped++;  // UNIQUE constraint — already recorded today
        }
      } catch (err) {
        log.error('anomaly_persist_failed', err, { email: a.agentEmail, metric: a.metric });
      }
    }
    log.info('anomaly_run_complete', { date, total: anomalies.length, inserted, skipped });
    return { date, total: anomalies.length, inserted, skipped };
  } catch (err) {
    log.error('anomaly_evaluator_failed', err);
    return { error: err.message };
  }
}

// Wire the daily cron — fires at 03:00 CST every day
let _anomalyCronStarted = false;
global._startAnomalyCron = function startAnomalyCron() {
  if (_anomalyCronStarted) return;
  _anomalyCronStarted = true;
  // Schedule: check every 10 minutes whether the current minute-of-day in CST is 3:00.
  // Crude but correct — doesn't fire twice because of insert UNIQUE constraint.
  const ANOMALY_HOUR = parseInt(process.env.ANOMALY_RUN_HOUR_CST) || 3;
  setInterval(async () => {
    const nowH = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date());
    if (parseInt(nowH) === ANOMALY_HOUR) {
      log.info('anomaly_cron_tick', { hour: ANOMALY_HOUR });
      await runAnomalyEvaluator();
    }
  }, 10 * 60 * 1000);  // every 10 min
  log.info('anomaly_cron_started', { hourCst: ANOMALY_HOUR });
};

// ─── Endpoints ─────────────────────────────────────────────────────────────

// Read anomaly thresholds (everyone authenticated can read)
app.get('/api/anomaly/thresholds', requireAuth, async (req, res) => {
  try { res.json({ success: true, thresholds: await getAnomalyThresholds() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Update a threshold (admin only, audit-logged)
app.put('/api/anomaly/thresholds/:metric', requireAdmin, async (req, res) => {
  try {
    const metric = req.params.metric;
    if (!ANOMALY.METRICS.includes(metric)) {
      return res.status(400).json({ success: false, error: 'unknown metric' });
    }
    await updateAnomalyThreshold(metric, req.body || {}, req.session.email);
    insertAuditLog(req.session.email, 'anomaly_threshold_updated', metric, JSON.stringify(req.body || {})).catch(()=>{});
    log.info('anomaly_threshold_updated', { metric, by: req.session.email });
    res.json({ success: true });
  } catch (e) {
    res.status(e.message.includes('Unknown') ? 404 : 400).json({ success: false, error: e.message });
  }
});

// Recent anomalies (audit view)
app.get('/api/anomalies/recent', requireAuth, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
    const rows = await getRecentAnomalies(days);
    res.json({ success: true, days, anomalies: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Active anomalies (unacked)
app.get('/api/anomalies/active', requireAuth, async (req, res) => {
  try {
    const rows = await getActiveAnomalies(Math.min(parseInt(req.query.limit) || 100, 500));
    const counts = await getAnomalyCounts();
    res.json({ success: true, anomalies: rows, counts });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Per-agent history (self or admin)
app.get('/api/anomalies/agent/:email', requireAuth, async (req, res) => {
  try {
    const email = req.params.email;
    if (req.session.email !== email && req.session.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 180);
    const rows = await getAnomaliesForAgent(email, days);
    res.json({ success: true, email, days, anomalies: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Acknowledge an anomaly
app.post('/api/anomalies/:id/ack', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
    await ackAnomaly(id, req.session.email);
    log.info('anomaly_acked', { id, by: req.session.email });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin: force a run now (useful for backfilling or testing)
app.post('/api/admin/anomalies/run', requireAdmin, async (req, res) => {
  try {
    const date = req.body && req.body.date;
    const result = await runAnomalyEvaluator(date);
    insertAuditLog(req.session.email, 'anomaly_run_forced', '', JSON.stringify(result)).catch(()=>{});
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Admin: insert a synthetic anomaly for testing the UI pipeline
app.post('/api/admin/anomalies/test', requireAdmin, async (req, res) => {
  try {
    const { email, metric, severity } = req.body || {};
    const tz = 'America/Chicago';
    const date = (req.body && req.body.date) || new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const payload = {
      agent_email: email || req.session.email,
      metric: metric || 'daily_missed_calls',
      date,
      today_value: 99,
      baseline_median: 1,
      baseline_mad: 0,
      modified_z: 10,
      direction: 'high',
      severity: severity || 'warning',
      flat_baseline: true,
      sample_size: 20
    };
    const id = await insertAnomalyEvent(payload);
    // Broadcast for live UI testing
    if (id && typeof global.broadcastSseEvent === 'function') {
      global.broadcastSseEvent('anomaly', { id, ...payload, created_at: new Date().toISOString() });
    }
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BULK ADMIN ACTIONS (#15 Session 10) — proper multi-agent operations
// Replaces the rough Session 1 stub (prompt() + toast, no backend).
// ══════════════════════════════════════════════════════════════════════════════

// ─── In-memory idempotency cache (24h TTL) ──────────────────────────────
// Same requestId from a client retry → return cached result, don't re-execute
const _bulkIdempo = new Map();  // requestId → { at, result }
const BULK_IDEMPO_TTL_MS = 24 * 60 * 60 * 1000;

function bulkIdempoGet(id) {
  const entry = _bulkIdempo.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at > BULK_IDEMPO_TTL_MS) { _bulkIdempo.delete(id); return null; }
  return entry.result;
}
function bulkIdempoSet(id, result) {
  _bulkIdempo.set(id, { at: Date.now(), result });
  // Cleanup old entries opportunistically — keep memory bounded
  if (_bulkIdempo.size > 1000) {
    const cutoff = Date.now() - BULK_IDEMPO_TTL_MS;
    for (const [k, v] of _bulkIdempo) if (v.at < cutoff) _bulkIdempo.delete(k);
  }
}

// ─── Per-action handlers (pure-ish — return {ok, error?}) ────────────────
const BULK_ACTIONS = {
  /**
   * Send a Google Chat notification to a single agent.
   * Reuses the existing webhook plumbing — no new credentials needed.
   */
  notify: {
    validatePayload(p) {
      if (!p || typeof p.message !== 'string') return 'message (string) required';
      if (!p.message.trim()) return 'message cannot be empty';
      if (p.message.length > 500) return 'message must be ≤500 chars';
      return null;
    },
    async run(email, payload, actorEmail) {
      if (!GOOGLE_CHAT_WEBHOOK_URL) {
        return { ok: false, error: 'GOOGLE_CHAT_WEBHOOK_URL not configured' };
      }
      const text = `📢 From ${actorEmail}\nTo: ${email}\n\n${payload.message}`;
      try {
        const resp = await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ text })
        });
        if (!resp.ok) return { ok: false, error: `chat webhook returned ${resp.status}` };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  },

  /**
   * Toggle whether an agent sees the Break Bot UI.
   * Reuses setBreakbotEnabled() — already validates the email lives in app_roles.
   */
  set_breakbot_enabled: {
    validatePayload(p) {
      if (!p || typeof p.enabled !== 'boolean') return 'enabled (boolean) required';
      return null;
    },
    async run(email, payload, actorEmail) {
      try {
        await setBreakbotEnabled(email, payload.enabled, actorEmail);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  },

  /**
   * Force-logout an agent. Deletes their server-side app_sessions rows
   * (could be multiple if they had multiple devices). Reversible — they
   * just need to sign in again.
   */
  clear_session: {
    validatePayload(_p) { return null; },
    async run(email) {
      try {
        // app_sessions doesn't have a "delete by email" helper, so we use the
        // raw db handle. Safe because email is parameterized.
        const dbMod = require('./database');
        if (typeof dbMod.deleteSessionsForEmail === 'function') {
          await dbMod.deleteSessionsForEmail(email);
        } else {
          // Fallback: not all DB modules expose this. Add it in the next session.
          return { ok: false, error: 'deleteSessionsForEmail not exported' };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  },

  /**
   * Promote/demote between 'agent' and 'admin'. SAFETY: server refuses to let
   * the requester demote THEMSELVES (would lock them out of admin endpoints).
   */
  set_role: {
    validatePayload(p) {
      if (!p || !['agent', 'admin'].includes(p.role)) return "role must be 'agent' or 'admin'";
      return null;
    },
    async run(email, payload, actorEmail) {
      if (email.toLowerCase() === actorEmail.toLowerCase() && payload.role !== 'admin') {
        return { ok: false, error: 'cannot demote yourself' };
      }
      try {
        await setRole(email, payload.role, actorEmail);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  }
};

const BULK_ACTION_KEYS = Object.freeze(Object.keys(BULK_ACTIONS));

// ─── Endpoint ───────────────────────────────────────────────────────────
app.post('/api/admin/bulk-actions', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const { action, payload, emails, requestId } = body;

  // ─── Validation ───────────────────────────────────────────────────────
  if (!action || !BULK_ACTIONS[action]) {
    return res.status(400).json({ success: false, code: 'unknown_action', error: 'unknown action: ' + action, validActions: BULK_ACTION_KEYS });
  }
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(404).json({ success: false, code: 'empty_emails', error: 'emails array required, non-empty' });
  }
  if (emails.length > 200) {
    return res.status(400).json({ success: false, code: 'batch_too_large', error: 'max 200 agents per batch' });
  }
  // Email format check — soft, just catches obvious typos
  for (const e of emails) {
    if (typeof e !== 'string' || !e.includes('@')) {
      return res.status(400).json({ success: false, code: 'bad_email', error: 'invalid email in list: ' + e });
    }
  }
  const handler = BULK_ACTIONS[action];
  const payloadError = handler.validatePayload(payload);
  if (payloadError) {
    return res.status(400).json({ success: false, code: 'bad_payload', error: payloadError });
  }

  // ─── Idempotency ──────────────────────────────────────────────────────
  if (requestId && typeof requestId === 'string') {
    const cached = bulkIdempoGet(requestId);
    if (cached) {
      log.info('bulk_action_replayed', { action, requestId, by: req.session.email });
      return res.status(200).json({ ...cached, replayed: true });
    }
  }

  // ─── Execute per-agent ────────────────────────────────────────────────
  const actorEmail = req.session.email;
  const results = [];
  let ok = 0, failed = 0;

  for (const email of emails) {
    const r = await handler.run(email, payload, actorEmail);
    results.push({ email, ...r });
    if (r.ok) ok++; else failed++;
    // Per-agent audit row (best effort — don't let an audit failure abort the batch)
    insertAuditLog(actorEmail, `bulk_${action}`, email,
      r.ok ? 'ok' : `error: ${(r.error || '').slice(0, 200)}`).catch(()=>{});
  }

  // ─── Summary audit row ────────────────────────────────────────────────
  insertAuditLog(actorEmail, `bulk_${action}_summary`, '',
    `total=${emails.length} ok=${ok} failed=${failed}`).catch(()=>{});

  // ─── Structured log ───────────────────────────────────────────────────
  log.info('bulk_action_complete', {
    action, by: actorEmail, total: emails.length, ok, failed,
    requestId: requestId || null
  });

  const response = {
    success: true,
    action,
    requestId: requestId || null,
    summary: { total: emails.length, ok, failed },
    results
  };

  // Cache for idempotent replay
  if (requestId) bulkIdempoSet(requestId, response);

  res.json(response);
});

// ─── Helper endpoint: list available actions (for UI to render dynamically) ─
app.get('/api/admin/bulk-actions/list', requireAdmin, (req, res) => {
  res.json({
    success: true,
    actions: BULK_ACTION_KEYS.map(key => ({
      key,
      // Sanitized metadata for the UI — no handler refs leaked
      label: ({
        notify: 'Send chat notification',
        set_breakbot_enabled: 'Toggle Break Bot UI',
        clear_session: 'Force logout',
        set_role: 'Change role'
      })[key] || key
    }))
  });
});

// ── Session 16: Roster management ─────────────────────────────────────────────
const roster = require('./lib/roster');

app.get('/api/roster/agents', requireAuth, async (req, res) => {
  try {
    const rows = await roster.listAgents({ includeRelieved: true });
    res.json({ success: true, agents: rows });
  } catch(e) { res.status(500).json({ success:false, error: e.message }); }
});

app.post('/api/roster/agents', requireAdmin, async (req, res) => {
  try {
    const { emp_id, ...fields } = req.body || {};
    if (!emp_id) return res.status(400).json({ success:false, error:'emp_id required' });
    const actor = { email: req.session?.email, name: req.session?.user };
    const a = await roster.upsertAgent(emp_id, fields, actor);
    res.json({ success: true, agent: a });
  } catch(e) { res.status(500).json({ success:false, error: e.message }); }
});

app.delete('/api/roster/agent/:emp_id', requireAdmin, async (req, res) => {
  try {
    const emp_id = decodeURIComponent(req.params.emp_id);
    if (!emp_id) return res.status(400).json({ success:false, error:'emp_id required' });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM roster_agents WHERE emp_id = ?', [emp_id], function(err) {
        if (err) reject(err); else resolve(this.changes);
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM roster_days WHERE emp_id = ?', [emp_id], function(err) {
        if (err) reject(err); else resolve();
      });
    });
    insertAuditLog(req.session?.email, 'roster_delete_agent', emp_id, '').catch(()=>{});
    res.json({ success: true, deleted: emp_id });
  } catch(e) { res.status(500).json({ success:false, error: e.message }); }
});

app.get('/api/roster/month/:yyyymm', requireAuth, async (req, res) => {
  try {
    const data = await roster.getMonth(req.params.yyyymm);
    res.json({ success: true, ...data });
  } catch(e) { res.status(400).json({ success:false, error: e.message }); }
});

app.post('/api/roster/day', requireAdmin, async (req, res) => {
  try {
    const actor = { email: req.session?.email, name: req.session?.user };
    const out = await roster.setDay(req.body || {}, actor);
    res.json({ success: true, ...out });
  } catch(e) { res.status(400).json({ success:false, error: e.message }); }
});

app.post('/api/roster/bulk', requireAdmin, async (req, res) => {
  try {
    const actor = { email: req.session?.email, name: req.session?.user };
    const updates = req.body?.updates || [];
    const results = await roster.bulkSet(updates, actor);
    res.json({ success: true, results, count: results.length });
  } catch(e) { res.status(400).json({ success:false, error: e.message }); }
});

app.get('/api/roster/audit', requireAuth, async (req, res) => {
  try {
    const rows = await roster.getAudit({
      limit: req.query.limit,
      emp_id: req.query.emp_id || null,
    });
    res.json({ success: true, events: rows });
  } catch(e) { res.status(500).json({ success:false, error: e.message }); }
});

app.get('/api/roster/summary', requireAuth, async (req, res) => {
  try {
    const out = await roster.summary({ from: req.query.from, to: req.query.to });
    res.json({ success: true, ...out });
  } catch(e) { res.status(500).json({ success:false, error: e.message }); }
});

app.post('/api/admin/roster/reseed', requireAdmin, async (req, res) => {
  try {
    const seedPath = path.join(__dirname, 'lib', 'roster-seed.json');
    const result = await roster.seedFromFile(seedPath);
    res.json({ success: true, ...result });
  } catch(e) { res.status(500).json({ success:false, error: e.message }); }
});

app.use(errorTracker());

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
      // #11 Session 2: real-time alert cron (every 30s by default)
      if (typeof global._startAlertCron === 'function') global._startAlertCron();
      // Session 11: nightly predict-model retraining at 03:30 CST
      if (typeof global._startPredictCron === 'function') global._startPredictCron();
      // #20 Session 6: anomaly cron (fires at 03:00 CST daily)
      if (typeof global._startAnomalyCron === 'function') global._startAnomalyCron();
      // Start missed-call → Google Chat notifier (every 2 min)
      // Uses MISSED_CALL_WEBHOOK_URL — separate from GOOGLE_CHAT_WEBHOOK_URL (break bot)
      if (MISSED_CALL_WEBHOOK_URL) {
        // Stagger: presence sync fires at 0s and every 2 min.
        // Missed call poll fires at 30s then every 1 min — offset avoids rate-limit collisions.
        setTimeout(() => runMissedCallPoll().catch(() => {}), 30000);
        setInterval(() => runMissedCallPoll().catch(() => {}), 60 * 1000);
        console.log(`📞 Missed call notifier started (queue ext ${MISSED_CALL_QUEUE_EXT}, 1-min poll, +30s offset)`);
      } else {
        console.log('📞 Missed call notifier disabled — set MISSED_CALL_WEBHOOK_URL to enable');
      }
    } catch(e) { console.error('❌ Startup error:', e.message); }
  });
}

start();
