const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = process.env.DB_PATH || path.join(__dirname, 'productivity.db');
const db = new sqlite3.Database(dbPath);
console.log('Using DB at:', dbPath);
const run = (sql, params=[]) => new Promise((res,rej) => db.run(sql, params, function(err){err?rej(err):res(this);}));
const get = (sql, params=[]) => new Promise((res,rej) => db.get(sql, params, (err,row)=>err?rej(err):res(row)));
const all = (sql, params=[]) => new Promise((res,rej) => db.all(sql, params, (err,rows)=>err?rej(err):res(rows)));

function toSqliteUtc(date){
  if(!(date instanceof Date)) date = new Date(date);
  return date.toISOString().slice(0,19).replace('T',' ');
}

function fromStoredUtc(value){
  if(!value) return null;
  if(value instanceof Date) return value;
  if(String(value).includes('T')) return new Date(value);
  return new Date(String(value).replace(' ','T') + 'Z');
}

function getTimeZoneOffsetMinutes(date,timeZone){
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone,
    timeZoneName:'shortOffset',
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit',
    hour12:false
  }).formatToParts(date);
  const raw = parts.find(p=>p.type==='timeZoneName')?.value || 'GMT+0';
  const match = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if(!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function zonedMidnightUtc(dateStr,timeZone){
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const firstPass = new Date(guess.getTime() - getTimeZoneOffsetMinutes(guess,timeZone) * 60000);
  return new Date(guess.getTime() - getTimeZoneOffsetMinutes(firstPass,timeZone) * 60000);
}

function getDateWindow(dateStr,timeZone='America/Chicago'){
  const [y,m,d] = String(dateStr).split('-').map(Number);
  const nextDate = new Date(Date.UTC(y,m-1,d+1,12,0,0)).toISOString().slice(0,10);
  return {
    start: zonedMidnightUtc(dateStr,timeZone),
    end: zonedMidnightUtc(nextDate,timeZone)
  };
}

function getTodayForTimeZone(timeZone='America/Chicago'){
  return new Date().toLocaleDateString('en-CA',{timeZone});
}

function isQueueReady(status, queueStatus){
  return status === 'Available' && queueStatus === 'In Queue';
}

const BREAK_ACTIONS = {
  LOGGED_IN: { label: 'Logged In', status: 'Logged In', type: 'session' },
  LOGGED_OUT: { label: 'Logged Out', status: 'Logged Out', type: 'session' },
  BRB_IN: { label: 'BRB In', status: 'Logged In', type: 'brb' },
  BRB_OUT: { label: 'BRB Out', status: 'BRB', type: 'brb' },
  BREAK_IN: { label: 'Break In', status: 'Logged In', type: 'break' },
  BREAK_OUT: { label: 'Break Out', status: 'Break', type: 'break' },
  TRAINING_IN: { label: 'Training / Coaching In', status: 'Logged In', type: 'training' },
  TRAINING_OUT: { label: 'Training / Coaching Out', status: 'Training / Coaching', type: 'training' },
  QA_SESSION_IN: { label: 'QA Session AUX In', status: 'Logged In', type: 'qa' },
  QA_SESSION_OUT: { label: 'QA Session AUX Out', status: 'QA Session AUX', type: 'qa' },
  INTERNAL_CALL_IN: { label: 'Internal Calls In', status: 'Logged In', type: 'internal' },
  INTERNAL_CALL_OUT: { label: 'Internal Calls Out', status: 'Internal Calls', type: 'internal' }
};

const BREAK_ALLOWED_ACTIONS = {
  'Logged Out': ['LOGGED_IN'],
  'Logged In': ['LOGGED_OUT', 'BRB_OUT', 'BREAK_OUT', 'TRAINING_OUT', 'QA_SESSION_OUT', 'INTERNAL_CALL_OUT'],
  BRB: ['BRB_IN', 'LOGGED_OUT', 'BREAK_OUT', 'TRAINING_OUT', 'QA_SESSION_OUT', 'INTERNAL_CALL_OUT'],
  Break: ['BREAK_IN', 'LOGGED_OUT', 'BRB_OUT', 'TRAINING_OUT', 'QA_SESSION_OUT', 'INTERNAL_CALL_OUT'],
  'Training / Coaching': ['TRAINING_IN', 'LOGGED_OUT', 'BRB_OUT', 'BREAK_OUT', 'QA_SESSION_OUT', 'INTERNAL_CALL_OUT'],
  'QA Session AUX': ['QA_SESSION_IN', 'LOGGED_OUT', 'BRB_OUT', 'BREAK_OUT', 'TRAINING_OUT', 'INTERNAL_CALL_OUT'],
  'Internal Calls': ['INTERNAL_CALL_IN', 'LOGGED_OUT', 'BRB_OUT', 'BREAK_OUT', 'TRAINING_OUT', 'QA_SESSION_OUT']
};

const BREAK_RETURN_ACTIONS = {
  BRB: 'BRB_IN',
  Break: 'BREAK_IN',
  'Training / Coaching': 'TRAINING_IN',
  'QA Session AUX': 'QA_SESSION_IN',
  'Internal Calls': 'INTERNAL_CALL_IN'
};

function normalizeBreakAction(action){
  const key = String(action || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if(!BREAK_ACTIONS[key]) return null;
  return { key, ...BREAK_ACTIONS[key] };
}

function getAllowedBreakActions(currentStatus='Logged Out'){
  return BREAK_ALLOWED_ACTIONS[currentStatus] || BREAK_ALLOWED_ACTIONS['Logged Out'];
}

function getBreakReturnAction(currentStatus='Logged Out'){
  return BREAK_RETURN_ACTIONS[currentStatus] || null;
}

function describeBreakTransitionError(actionKey, currentStatus){
  const attempted = BREAK_ACTIONS[actionKey]?.label || actionKey;
  const allowed = getAllowedBreakActions(currentStatus);
  const allowedLabels = allowed.map(key => BREAK_ACTIONS[key]?.label || key);
  if(currentStatus === 'Logged Out'){
    return `${attempted} is not allowed before Logged In. Start the shift first.`;
  }
  if(!allowedLabels.length){
    return `${attempted} is not allowed while status is ${currentStatus}.`;
  }
  if(allowedLabels.length === 1){
    return `${attempted} is not allowed while status is ${currentStatus}. Use ${allowedLabels[0]} next.`;
  }
  return `${attempted} is not allowed while status is ${currentStatus}. Use one of: ${allowedLabels.join(', ')}.`;
}

function resolveBreakEventStream(events, endAt){
  const accepted = [];
  let currentStatus = 'Logged Out';
  for(const event of events){
    const meta = normalizeBreakAction(event.action);
    if(!meta) continue;
    if(!getAllowedBreakActions(currentStatus).includes(meta.key)) continue;
    accepted.push({
      ...event,
      action: meta.key,
      action_label: event.action_label || meta.label,
      current_status: event.current_status || meta.status,
      event_type: event.event_type || meta.type
    });
    currentStatus = meta.status;
  }

  let brbSeconds = 0;
  let breakSeconds = 0;
  let trainingSeconds = 0;
  let qaSeconds = 0;
  let internalCallSeconds = 0;
  let loggedInSeconds = 0;
  let maxBrbInstanceSeconds = 0;
  let maxBreakInstanceSeconds = 0;
  let maxTrainingInstanceSeconds = 0;
  let maxQaInstanceSeconds = 0;
  let maxInternalInstanceSeconds = 0;
  let openBrbStart = null;
  let openBreakStart = null;
  let openTrainingStart = null;
  let openQaStart = null;
  let openInternalStart = null;
  let openSessionStart = null;

  for(let i = 0; i < accepted.length; i++){
    const current = accepted[i];
    const startAt = fromStoredUtc(current.created_at);
    const nextStamp = i < accepted.length - 1 ? fromStoredUtc(accepted[i + 1].created_at) : endAt;
    if(!startAt || !nextStamp || nextStamp <= startAt) continue;
    const duration = Math.max(0, Math.round((nextStamp - startAt) / 1000));
    if(current.current_status === 'BRB') brbSeconds += duration;
    if(current.current_status === 'Break') breakSeconds += duration;
    if(current.current_status === 'Training / Coaching') trainingSeconds += duration;
    if(current.current_status === 'QA Session AUX') qaSeconds += duration;
    if(current.current_status === 'Internal Calls') internalCallSeconds += duration;
    if(current.current_status !== 'Logged Out') loggedInSeconds += duration;
  }

  const decoratedEvents = accepted.map(event => {
    const stamp = fromStoredUtc(event.created_at);
    let linkedDurationSeconds = null;
    if(event.action === 'LOGGED_IN'){
      openSessionStart = stamp;
    } else if(event.action === 'LOGGED_OUT'){
      if(openSessionStart && stamp && stamp > openSessionStart){
        linkedDurationSeconds = Math.round((stamp - openSessionStart) / 1000);
      }
      openSessionStart = null;
      openBrbStart = null;
      openBreakStart = null;
      openTrainingStart = null;
      openQaStart = null;
      openInternalStart = null;
    } else if(event.action === 'BRB_OUT'){
      openBrbStart = stamp;
    } else if(event.action === 'BRB_IN'){
      if(openBrbStart && stamp && stamp > openBrbStart){
        linkedDurationSeconds = Math.round((stamp - openBrbStart) / 1000);
        maxBrbInstanceSeconds = Math.max(maxBrbInstanceSeconds, linkedDurationSeconds);
      }
      openBrbStart = null;
    } else if(event.action === 'BREAK_OUT'){
      openBreakStart = stamp;
    } else if(event.action === 'BREAK_IN'){
      if(openBreakStart && stamp && stamp > openBreakStart){
        linkedDurationSeconds = Math.round((stamp - openBreakStart) / 1000);
        maxBreakInstanceSeconds = Math.max(maxBreakInstanceSeconds, linkedDurationSeconds);
      }
      openBreakStart = null;
    } else if(event.action === 'TRAINING_OUT'){
      openTrainingStart = stamp;
    } else if(event.action === 'TRAINING_IN'){
      if(openTrainingStart && stamp && stamp > openTrainingStart){
        linkedDurationSeconds = Math.round((stamp - openTrainingStart) / 1000);
        maxTrainingInstanceSeconds = Math.max(maxTrainingInstanceSeconds, linkedDurationSeconds);
      }
      openTrainingStart = null;
    } else if(event.action === 'QA_SESSION_OUT'){
      openQaStart = stamp;
    } else if(event.action === 'QA_SESSION_IN'){
      if(openQaStart && stamp && stamp > openQaStart){
        linkedDurationSeconds = Math.round((stamp - openQaStart) / 1000);
        maxQaInstanceSeconds = Math.max(maxQaInstanceSeconds, linkedDurationSeconds);
      }
      openQaStart = null;
    } else if(event.action === 'INTERNAL_CALL_OUT'){
      openInternalStart = stamp;
    } else if(event.action === 'INTERNAL_CALL_IN'){
      if(openInternalStart && stamp && stamp > openInternalStart){
        linkedDurationSeconds = Math.round((stamp - openInternalStart) / 1000);
        maxInternalInstanceSeconds = Math.max(maxInternalInstanceSeconds, linkedDurationSeconds);
      }
      openInternalStart = null;
    }
    return {
      id: event.id,
      username: event.username,
      email: event.email,
      role: event.role,
      action: event.action,
      actionLabel: event.action_label,
      currentStatus: event.current_status,
      eventType: event.event_type,
      note: event.note,
      notified: !!event.notified,
      notifyStatus: event.notify_status,
      notifyResponse: event.notify_response,
      createdAt: event.created_at,
      linkedDurationSeconds
    };
  });

  const latestAccepted = accepted.length ? accepted[accepted.length - 1] : null;
  const latestStamp = latestAccepted ? fromStoredUtc(latestAccepted.created_at) : null;
  const currentLaneSeconds = latestStamp && endAt && endAt > latestStamp
    ? Math.max(0, Math.round((endAt - latestStamp) / 1000))
    : 0;
  if(currentStatus === 'BRB') maxBrbInstanceSeconds = Math.max(maxBrbInstanceSeconds, currentLaneSeconds);
  if(currentStatus === 'Break') maxBreakInstanceSeconds = Math.max(maxBreakInstanceSeconds, currentLaneSeconds);
  if(currentStatus === 'Training / Coaching') maxTrainingInstanceSeconds = Math.max(maxTrainingInstanceSeconds, currentLaneSeconds);
  if(currentStatus === 'QA Session AUX') maxQaInstanceSeconds = Math.max(maxQaInstanceSeconds, currentLaneSeconds);
  if(currentStatus === 'Internal Calls') maxInternalInstanceSeconds = Math.max(maxInternalInstanceSeconds, currentLaneSeconds);

  // Limits
  const BREAK_DAY_LIMIT   = 3600;   // 1h
  const BREAK_DAY_BUFFER  = 300;    // 5-min grace before critical
  const BRB_SINGLE_LIMIT  = 600;    // 10m
  const BRB_SINGLE_BUFFER = 120;    // 2-min grace before critical
  const BRB_DAY_LIMIT     = 1200;   // 20m

  // Warning = at limit, Critical = past limit + buffer
  const breakDayWarning  = breakSeconds > BREAK_DAY_LIMIT;
  const breakDayCritical = breakSeconds > (BREAK_DAY_LIMIT + BREAK_DAY_BUFFER);
  const brbSingleWarning  = maxBrbInstanceSeconds > BRB_SINGLE_LIMIT;
  const brbSingleCritical = maxBrbInstanceSeconds > (BRB_SINGLE_LIMIT + BRB_SINGLE_BUFFER);
  const brbDayWarning  = brbSeconds > BRB_DAY_LIMIT;
  const brbDayCritical = brbSeconds > (BRB_DAY_LIMIT + 120);

  // Build reason strings for each active alert
  const alertReasons = [];
  if(breakDayCritical)  alertReasons.push(`Break total ${Math.floor(breakSeconds/60)}m (limit 60m + 5m grace)`);
  else if(breakDayWarning) alertReasons.push(`Break total ${Math.floor(breakSeconds/60)}m (limit 60m — within 5m grace)`);
  if(brbSingleCritical) alertReasons.push(`Single BRB ${Math.floor(maxBrbInstanceSeconds/60)}m (limit 10m + 2m grace)`);
  else if(brbSingleWarning) alertReasons.push(`Single BRB ${Math.floor(maxBrbInstanceSeconds/60)}m (limit 10m — within 2m grace)`);
  if(brbDayCritical)   alertReasons.push(`BRB total ${Math.floor(brbSeconds/60)}m (limit 20m)`);
  else if(brbDayWarning) alertReasons.push(`BRB total ${Math.floor(brbSeconds/60)}m (at 20m limit)`);

  const alerts = {
    // Warning level (at limit, within buffer)
    breakDayWarning,
    brbSingleWarning,
    brbDayWarning,
    // Critical level (past limit + buffer)
    breakDayExceeded: breakDayCritical,
    brbSingleExceeded: brbSingleCritical,
    brbDayExceeded: brbDayCritical,
    // Convenience
    hasWarning: breakDayWarning || brbSingleWarning || brbDayWarning,
    hasAlert: breakDayCritical || brbSingleCritical || brbDayCritical,
    alertReasons
  };

  return {
    acceptedEvents: accepted,
    decoratedEvents,
    currentStatus,
    brbSeconds,
    breakSeconds,
    trainingSeconds,
    qaSeconds,
    internalCallSeconds,
    loggedInSeconds,
    maxBrbInstanceSeconds,
    maxBreakInstanceSeconds,
    maxTrainingInstanceSeconds,
    maxQaInstanceSeconds,
    maxInternalInstanceSeconds,
    currentLaneSeconds,
    alerts
  };
}

function defaultBreakName(email){
  const local = String(email || 'Agent').split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Agent';
}

function statusTone(status){
  if(status === 'BRB') return 'brb';
  if(status === 'Break') return 'break';
  if(status === 'Training / Coaching') return 'training';
  if(status === 'QA Session AUX') return 'qa';
  if(status === 'Internal Calls') return 'internal';
  if(status === 'Logged In') return 'online';
  if(status === 'Logged Out') return 'offline';
  return 'neutral';
}

async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS monitored_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    extension TEXT UNIQUE NOT NULL, email TEXT, rc_id TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS presence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
    agent_name TEXT, status TEXT NOT NULL, queue_status TEXT DEFAULT 'Unknown',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
    agent_name TEXT, call_id TEXT UNIQUE, source_call_id TEXT, direction TEXT,
    result TEXT, duration INTEGER, ring_duration INTEGER DEFAULT 0,
    hold_duration INTEGER DEFAULT 0, transferred INTEGER DEFAULT 0,
    is_voicemail INTEGER DEFAULT 0, from_number TEXT, to_number TEXT,
    queue_name TEXT, start_time DATETIME,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT,
    role TEXT, ip TEXT, location TEXT, system_info TEXT,
    logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS app_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent', added_by TEXT,
    breakbot_enabled INTEGER NOT NULL DEFAULT 1,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS break_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'agent',
    action TEXT NOT NULL,
    action_label TEXT NOT NULL,
    current_status TEXT NOT NULL,
    event_type TEXT NOT NULL,
    note TEXT,
    notified INTEGER DEFAULT 0,
    notify_status TEXT,
    notify_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_break_events_email_time ON break_events(email, created_at DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_break_events_time ON break_events(created_at DESC)`);
  await run(`CREATE TABLE IF NOT EXISTS agent_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    note TEXT NOT NULL,
    added_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_notes_agent ON agent_notes(agent_id, created_at DESC)`);
  await run(`CREATE TABLE IF NOT EXISTS app_sessions (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    picture TEXT,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_app_sessions_email ON app_sessions(email)`);

  // FEAT-4: Audit log table — tracks admin actions
  await run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`);

  // Break thresholds — configurable per AUX type
  await run(`CREATE TABLE IF NOT EXISTS break_thresholds (
    aux_type TEXT PRIMARY KEY,
    single_limit_minutes INTEGER,
    daily_limit_minutes INTEGER,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  // Seed defaults if table is empty
  const thresholdCount = await get(`SELECT COUNT(*) as c FROM break_thresholds`);
  if(!thresholdCount || thresholdCount.c === 0){
    const defaults = [
      ['BRB',           10,   null],
      ['BREAK',         null, 60  ],
      ['TRAINING',      null, null],
      ['QA_SESSION',    null, null],
      ['INTERNAL_CALL', null, null],
    ];
    for(const [aux, single, daily] of defaults){
      await run(`INSERT OR IGNORE INTO break_thresholds (aux_type, single_limit_minutes, daily_limit_minutes) VALUES (?,?,?)`,
        [aux, single, daily]);
    }
  }

  // ── AI Learning Agent: feedback + discovered patterns ─────────────────────
  await run(`CREATE TABLE IF NOT EXISTS ticket_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT NOT NULL,
    ticket_subject TEXT,
    zoho_channel TEXT,
    suggested_type TEXT,
    suggested_rule TEXT,
    agent_type TEXT,        -- what the agent actually selected
    feedback TEXT,          -- 'correct' | 'wrong' | 'edited'
    agent_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tf_created ON ticket_feedback(created_at DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tf_rule ON ticket_feedback(suggested_rule)`);

  await run(`CREATE TABLE IF NOT EXISTS learned_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_key TEXT UNIQUE NOT NULL,  -- e.g. 'subject:re:' or 'contact_domain:hotmail.com'
    pattern_type TEXT NOT NULL,        -- 'subject_prefix'|'contact_domain'|'channel'|'custom'
    pattern_value TEXT NOT NULL,
    suggested_type TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,       -- 0..1, updated from feedback
    sample_count INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',      -- 'active'|'paused'|'rejected'
    source TEXT DEFAULT 'agent',       -- 'agent'|'ai_analysis'
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  // #9: Shift handoff notes
  await run(`CREATE TABLE IF NOT EXISTS shift_handoff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged INTEGER DEFAULT 0,
    acknowledged_by TEXT,
    acknowledged_at DATETIME)`);

  // #10: Daily wellness check-ins
  await run(`CREATE TABLE IF NOT EXISTS wellness_checkin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    date TEXT NOT NULL,
    mood TEXT NOT NULL,  -- 'great'|'ok'|'rough'
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, date))`);

  // #12: Coach mode flags (supervisor → agent)
  await run(`CREATE TABLE IF NOT EXISTS coach_flag (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_email TEXT NOT NULL,
    set_by TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',  -- 'pending'|'acknowledged'|'dismissed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME)`);

  // #11 Session 2: Real-time alert thresholds (admin-configurable per rule)
  await run(`CREATE TABLE IF NOT EXISTS alert_thresholds (
    key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    severity TEXT NOT NULL DEFAULT 'warning',
    threshold_json TEXT NOT NULL,
    cooldown_seconds INTEGER NOT NULL DEFAULT 300,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT)`);

  // #16 Session 11: Predictive abandonment — persisted logistic regression model
  await run(`CREATE TABLE IF NOT EXISTS predict_models (
    id INTEGER PRIMARY KEY,
    model_key TEXT NOT NULL,
    fitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    weights_json TEXT NOT NULL,
    mu_json TEXT NOT NULL,
    sigma_json TEXT NOT NULL,
    feature_keys_json TEXT NOT NULL,
    sample_size INTEGER NOT NULL,
    precision REAL,
    recall REAL,
    accuracy REAL,
    notes TEXT)`);

  // #20 Session 6: Anomaly detection — thresholds + event log
  await run(`CREATE TABLE IF NOT EXISTS anomaly_thresholds (
    metric TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    z_threshold REAL NOT NULL DEFAULT 3.5,
    direction TEXT NOT NULL DEFAULT 'either',
    min_history_days INTEGER NOT NULL DEFAULT 10,
    lookback_days INTEGER NOT NULL DEFAULT 30,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT)`);

  await run(`CREATE TABLE IF NOT EXISTS anomaly_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_email TEXT NOT NULL,
    metric TEXT NOT NULL,
    date TEXT NOT NULL,
    today_value REAL,
    baseline_median REAL,
    baseline_mad REAL,
    modified_z REAL,
    direction TEXT,
    severity TEXT NOT NULL,
    flat_baseline INTEGER DEFAULT 0,
    sample_size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acked_at DATETIME,
    acked_by TEXT,
    UNIQUE(agent_email, metric, date))`);

  await run(`CREATE INDEX IF NOT EXISTS idx_anomaly_events_recent
             ON anomaly_events(created_at DESC, severity)`).catch(()=>{});

  // Seed default thresholds on first boot — never overwrite admin edits
  try {
    const { DEFAULT_THRESHOLDS: ANOM_DEFAULTS } = require('./lib/anomaly');
    for (const [metric, cfg] of Object.entries(ANOM_DEFAULTS)) {
      await run(`INSERT OR IGNORE INTO anomaly_thresholds
                 (metric, enabled, z_threshold, direction, min_history_days, lookback_days, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, 'system')`,
        [metric, cfg.enabled, cfg.z_threshold, cfg.direction, cfg.min_history_days, cfg.lookback_days]);
    }
  } catch(e) { /* non-critical */ }

  // #14 Session 4: Agent schedules (versioned, per-day-of-week)
  await run(`CREATE TABLE IF NOT EXISTS agent_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_email TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,         -- 0=Sun .. 6=Sat
    start_time TEXT NOT NULL,             -- HH:MM 24h in the timezone column
    end_time TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Chicago',
    is_working_day INTEGER NOT NULL DEFAULT 1,
    effective_from TEXT NOT NULL,         -- YYYY-MM-DD
    effective_to TEXT,                    -- YYYY-MM-DD (null = open-ended)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_schedules_lookup
             ON agent_schedules(agent_email, day_of_week, effective_from DESC)`).catch(()=>{});

  // #11 Session 2: Alert events — append-only audit log of every fire
  await run(`CREATE TABLE IF NOT EXISTS alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    severity TEXT NOT NULL,
    body TEXT NOT NULL,
    data_json TEXT,
    agent_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acked_at DATETIME,
    acked_by TEXT,
    snoozed_until DATETIME)`);

  // Performance index — every alert lookup filters by key + time
  await run(`CREATE INDEX IF NOT EXISTS idx_alert_events_key_time
             ON alert_events(key, created_at DESC)`).catch(()=>{});
  await run(`CREATE INDEX IF NOT EXISTS idx_alert_events_active
             ON alert_events(acked_at, snoozed_until, created_at DESC)`).catch(()=>{});

  // Seed default thresholds — only inserts missing rows (won't overwrite admin edits)
  const { DEFAULT_THRESHOLDS } = require('./lib/alerts');
  for (const [key, cfg] of Object.entries(DEFAULT_THRESHOLDS)) {
    try {
      await run(`INSERT OR IGNORE INTO alert_thresholds
                 (key, enabled, severity, threshold_json, cooldown_seconds, updated_by)
                 VALUES (?, ?, ?, ?, ?, 'system')`,
        [key, cfg.enabled, cfg.severity, JSON.stringify(cfg.threshold), cfg.cooldown_seconds]);
    } catch(e) { /* swallow — non-critical */ }
  }

  // Migrations
  for (const sql of [
    `ALTER TABLE monitored_agents ADD COLUMN email TEXT`,
    `ALTER TABLE presence_events ADD COLUMN queue_status TEXT DEFAULT 'Unknown'`,
    `ALTER TABLE login_logs ADD COLUMN ip TEXT`,
    `ALTER TABLE login_logs ADD COLUMN location TEXT`,
    `ALTER TABLE login_logs ADD COLUMN system_info TEXT`,
    `ALTER TABLE call_logs ADD COLUMN ring_duration INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN hold_duration INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN transferred INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN is_voicemail INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN source_call_id TEXT`,
    `ALTER TABLE call_logs ADD COLUMN from_number TEXT`,
    `ALTER TABLE call_logs ADD COLUMN to_number TEXT`,
    `ALTER TABLE call_logs ADD COLUMN queue_name TEXT`,
    `ALTER TABLE break_events ADD COLUMN action_label TEXT DEFAULT ''`,
    `ALTER TABLE break_events ADD COLUMN current_status TEXT DEFAULT 'Logged Out'`,
    `ALTER TABLE break_events ADD COLUMN event_type TEXT DEFAULT 'session'`,
    `ALTER TABLE break_events ADD COLUMN note TEXT`,
    `ALTER TABLE break_events ADD COLUMN notified INTEGER DEFAULT 0`,
    `ALTER TABLE break_events ADD COLUMN notify_status TEXT`,
    `ALTER TABLE break_events ADD COLUMN notify_response TEXT`,
    `ALTER TABLE app_roles ADD COLUMN breakbot_enabled INTEGER DEFAULT 1`,
    // #21 Session 8 — PWA offline queue idempotency
    `ALTER TABLE break_events ADD COLUMN idempotency_key TEXT`,
    // Google Chat user ID for @mention notifications
    `ALTER TABLE monitored_agents ADD COLUMN chat_id TEXT`,
    // Google account subject ID (from OAuth JWT) — captured at login
    `ALTER TABLE app_sessions ADD COLUMN google_sub TEXT`,
  ]) { try { await run(sql); } catch(e) {} }

  // Unique index — silent failure if column already exists from a prior boot
  try {
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_break_events_idempo
               ON break_events(idempotency_key)
               WHERE idempotency_key IS NOT NULL`);
  } catch(e) { /* SQLite versions vary on partial index support — non-critical */ }

  // ── Performance indexes on high-query columns (added SEC/PERF audit) ─────────
  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_call_logs_agent_time ON call_logs(agent_id, start_time DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_presence_agent_time  ON presence_events(agent_id, timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_login_logs_email      ON login_logs(email)`,
  ]) { try { await run(sql); } catch(e) {} }

  const coreAdmins = (process.env.CORE_ADMINS || 'sebastin.n@adit.com,ronnie@adit.com,imran@adit.com').split(',').map(e => e.trim()).filter(Boolean);
  for (const email of coreAdmins) {
    try { await run(`INSERT OR IGNORE INTO app_roles (email,role,added_by) VALUES (?,'admin','system')`,[email]); } catch(e) {}
  }
  console.log('Database initialized');
}

// AGENTS
function addAgent(n,ext,email){return run(`INSERT OR IGNORE INTO monitored_agents (name,extension,email) VALUES (?,?,?)`,[n,ext,email||null]);}
function removeAgent(ext){return run(`DELETE FROM monitored_agents WHERE extension=?`,[ext]);}
function getMonitoredAgents(){return all(`SELECT * FROM monitored_agents ORDER BY name ASC`);}
function updateAgentRcId(ext,rcId){return run(`UPDATE monitored_agents SET rc_id=? WHERE extension=?`,[rcId,ext]);}
function updateAgentChatId(ext,chatId){return run(`UPDATE monitored_agents SET chat_id=? WHERE extension=?`,[chatId||null,ext]);}

// PRESENCE
function insertPresenceEvent(agentId,agentName,status,queueStatus,timestamp){
  if(timestamp){
    return run(`INSERT INTO presence_events (agent_id,agent_name,status,queue_status,timestamp) VALUES (?,?,?,?,?)`,[agentId,agentName,status,queueStatus||'Unknown',toSqliteUtc(timestamp)]);
  }
  return run(`INSERT INTO presence_events (agent_id,agent_name,status,queue_status) VALUES (?,?,?,?)`,[agentId,agentName,status,queueStatus||'Unknown']);
}
async function getPresenceEvents(date,timeZone='America/Chicago'){
  const agents=await getMonitoredAgents();
  const rcIds=agents.map(a=>a.rc_id).filter(Boolean);
  if(!rcIds.length)return[];
  const { start:pStart, end:pEnd } = getDateWindow(date,timeZone);
  return all(
    `SELECT * FROM presence_events WHERE datetime(timestamp) >= datetime(?) AND datetime(timestamp) < datetime(?) AND agent_id IN (${rcIds.map(()=>'?').join(',')}) ORDER BY datetime(timestamp) ASC`,
    [toSqliteUtc(pStart), toSqliteUtc(pEnd), ...rcIds]
  );
}

// CALL LOGS - now with ring/hold/transfer/voicemail
function getStoredCallLogValues(log){
  const sourceCallId = log.callId ? String(log.callId) : null;
  const storedCallId = [
    String(log.agentId || 'unknown'),
    String(log.direction || 'unknown'),
    sourceCallId || String(log.startTime || Date.now())
  ].join('::');
  return [
    log.agentId,
    log.agentName,
    storedCallId,
    sourceCallId,
    log.direction,
    log.result,
    log.duration||0,
    log.ringDuration||0,
    log.holdDuration||0,
    log.transferred?1:0,
    log.isVoicemail?1:0,
    log.fromNumber||null,
    log.toNumber||null,
    log.queueName||null,
    log.startTime
  ];
}

function insertCallLog(log){
  return run(`INSERT OR IGNORE INTO call_logs
    (agent_id,agent_name,call_id,source_call_id,direction,result,duration,ring_duration,hold_duration,transferred,is_voicemail,from_number,to_number,queue_name,start_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    getStoredCallLogValues(log));
}

function deleteCallLogsRange(startIso,endIso){
  return run(`DELETE FROM call_logs WHERE start_time >= ? AND start_time < ?`,[startIso,endIso]);
}

async function replaceCallLogsRange(startIso,endIso,logs){
  // SAFE MERGE: never delete existing data — only add new records.
  // INSERT OR IGNORE on the UNIQUE call_id means duplicates are silently skipped
  // so a partial sync never overwrites a previously-complete snapshot.
  await run('BEGIN IMMEDIATE');
  try{
    for(const log of logs){
      await run(`INSERT OR IGNORE INTO call_logs
        (agent_id,agent_name,call_id,source_call_id,direction,result,duration,ring_duration,hold_duration,transferred,is_voicemail,from_number,to_number,queue_name,start_time)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        getStoredCallLogValues(log));
    }
    await run('COMMIT');
  }catch(e){
    try{await run('ROLLBACK');}catch(_){}
    throw e;
  }
}

async function pruneCallLogs(daysToKeep=7){
  // Remove call logs older than N days to prevent unbounded DB growth
  const cutoff=new Date(Date.now()-daysToKeep*86400000).toISOString();
  return run(`DELETE FROM call_logs WHERE start_time < ?`,[cutoff]);
}

// SUMMARY with all new metrics
async function getAgentSummary(date,timeZone='America/Chicago'){
  const agents=await getMonitoredAgents();
  if(!agents.length)return[];
  const results=[];
  for(const agent of agents){
    const agentId=agent.rc_id||agent.extension;
    const { start:dayStartUtc, end:dayEndUtc } = getDateWindow(date,timeZone);
    const dayStartSql = toSqliteUtc(dayStartUtc);
    const dayEndSql = toSqliteUtc(dayEndUtc);
    const events=await all(
      `SELECT status,timestamp,queue_status FROM presence_events WHERE agent_id=? AND datetime(timestamp) >= datetime(?) AND datetime(timestamp) < datetime(?) ORDER BY datetime(timestamp) ASC`,
      [agentId, dayStartSql, dayEndSql]
    );
    const previousEvent = await get(
      `SELECT status,timestamp,queue_status FROM presence_events WHERE agent_id=? AND datetime(timestamp) < datetime(?) ORDER BY datetime(timestamp) DESC LIMIT 1`,
      [agentId, dayStartSql]
    );
    let availTime=0,unavailTime=0,onCallTime=0,ringingTime=0,toggleCount=0;
    const segments = [];
    if(previousEvent){
      segments.push({
        status: previousEvent.status,
        timestamp: dayStartSql,
        queue_status: previousEvent.queue_status || 'Unknown'
      });
    }
    segments.push(...events);

    if(segments.length){
      const dayEnd = date===getTodayForTimeZone(timeZone)
        ? new Date(Math.min(Date.now(), dayEndUtc.getTime()))
        : dayEndUtc;
      const timeline = [];
      for(let i=0;i<segments.length;i++){
        const start = fromStoredUtc(segments[i].timestamp);
        const end = i < segments.length-1 ? fromStoredUtc(segments[i+1].timestamp) : dayEnd;
        if(!start || !end || end <= start) continue;
        timeline.push({
          status: segments[i].status,
          queue_status: segments[i].queue_status || 'Unknown',
          start,
          end
        });
      }

      const readySpans = timeline.filter(seg=>isQueueReady(seg.status, seg.queue_status));
      if(readySpans.length){
        const workStart = readySpans[0].start;
        const workEnd = readySpans[readySpans.length-1].end;
        for(const seg of timeline){
          const start = new Date(Math.max(seg.start.getTime(), workStart.getTime()));
          const end = new Date(Math.min(seg.end.getTime(), workEnd.getTime()));
          if(end <= start) continue;
          const dur = Math.max(0, (end - start) / 1000);
          if(isQueueReady(seg.status, seg.queue_status)) availTime += dur;
          else if(seg.status === 'On Call') onCallTime += dur;
          else if(seg.status === 'Ringing') ringingTime += dur;
          else unavailTime += dur;
        }
      }

      const toggleEvents = previousEvent ? [previousEvent, ...events] : events;
      for(let i=1;i<toggleEvents.length;i++){
        if(toggleEvents[i].status!==toggleEvents[i-1].status) toggleCount++;
      }
    }
    const callStart = dayStartUtc.toISOString();
    const callEnd = dayEndUtc.toISOString();
    // Inbound
    const inb=await get(`SELECT
      COUNT(*) as total,
      AVG(CASE WHEN lower(COALESCE(result,'')) NOT IN ('missed','voicemail','abandoned') AND COALESCE(is_voicemail,0)=0 AND duration>0 THEN duration END) as avgDur,
      AVG(CASE WHEN ring_duration>0 THEN ring_duration END) as avgRing,
      SUM(hold_duration) as totalHold,
      SUM(CASE WHEN lower(COALESCE(result,'')) IN ('missed','abandoned') THEN 1 ELSE 0 END) as missed,
      SUM(CASE WHEN COALESCE(is_voicemail,0)=1 OR lower(COALESCE(result,''))='voicemail' THEN 1 ELSE 0 END) as voicemails
      FROM call_logs
      WHERE agent_id=? AND start_time >= ? AND start_time < ? AND direction='Inbound'`,[agentId,callStart,callEnd]);
    // Outbound
    const out=await get(`SELECT
      COUNT(*) as total,
      AVG(CASE
        WHEN lower(COALESCE(result,'')) NOT IN ('missed','voicemail','abandoned')
          AND COALESCE(is_voicemail,0)=0
          AND duration>0
        THEN duration
      END) as avgDur,
      AVG(CASE WHEN ring_duration>0 THEN ring_duration END) as avgRing,
      SUM(hold_duration) as totalHold
      FROM call_logs
      WHERE agent_id=? AND start_time >= ? AND start_time < ? AND direction='Outbound'`,[agentId,callStart,callEnd]);
    // Transfers
    const xfer=await get(`SELECT SUM(transferred) as total FROM call_logs WHERE agent_id=? AND start_time >= ? AND start_time < ?`,[agentId,callStart,callEnd]);

    results.push({
      agentId, agentName:agent.name, extension:agent.extension,
      availableSeconds:Math.round(availTime),
      unavailableSeconds:Math.round(unavailTime),
      onCallSeconds:Math.round(onCallTime),
      ringingSeconds:Math.round(ringingTime),
      toggleCount,
      inboundCalls:inb.total||0,
      outboundCalls:out.total||0,
      missedCalls:inb.missed||0,
      voicemails:inb.voicemails||0,
      ahtInbound:Math.round(inb.avgDur||0),
      ahtOutbound:Math.round(out.avgDur||0),
      avgRingTime:Math.round(((inb.avgRing||0)+(out.avgRing||0))/2),
      totalHoldTime:Math.round((inb.totalHold||0)+(out.totalHold||0)),
      transferCount:xfer.total||0,
      totalCalls:(inb.total||0)+(out.total||0)
    });
  }
  return results;
}

async function getAbandonedCalls(date,timeZone='America/Chicago'){
  const { start, end } = getDateWindow(date,timeZone);
  const callStart = start.toISOString();
  const callEnd = end.toISOString();
  return all(
    `SELECT
      c.agent_id AS agentId,
      COALESCE(c.agent_name, m.name, 'Customer Service Queue') AS agentName,
      m.extension AS extension,
      COALESCE(c.source_call_id, c.call_id) AS callId,
      c.result,
      c.duration,
      CASE
        WHEN COALESCE(c.ring_duration, 0) > 0 THEN c.ring_duration
        WHEN lower(COALESCE(c.result, '')) IN ('missed','abandoned') THEN COALESCE(c.duration, 0)
        ELSE COALESCE(c.ring_duration, 0)
      END AS ringDuration,
      c.hold_duration AS holdDuration,
      c.start_time AS startTime
    FROM call_logs c
    LEFT JOIN monitored_agents m ON m.rc_id = c.agent_id
    WHERE c.direction='Inbound'
      AND lower(COALESCE(c.result, '')) IN ('missed','abandoned')
      AND c.start_time >= ?
      AND c.start_time < ?
    ORDER BY ringDuration DESC, c.start_time DESC`,
    [callStart, callEnd]
  );
}

// LOGIN LOGS
function insertLoginLog(u,e,r,ip,loc,sys){return run(`INSERT INTO login_logs (username,email,role,ip,location,system_info) VALUES (?,?,?,?,?,?)`,[u,e,r,ip||null,loc||null,sys||null]);}
function getLoginLogs(){return all(`SELECT * FROM login_logs ORDER BY logged_in_at DESC LIMIT 500`);}

// BREAK BOT
async function createBreakEventRow({ username, email, role, meta, note, createdAt, notified = 0, notifyStatus = null, notifyResponse = null }){
  const result = await run(
    `INSERT INTO break_events
      (username,email,role,action,action_label,current_status,event_type,note,created_at,notified,notify_status,notify_response)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      username,
      email,
      role || 'agent',
      meta.key,
      meta.label,
      meta.status,
      meta.type,
      note || null,
      createdAt,
      notified ? 1 : 0,
      notifyStatus,
      notifyResponse
    ]
  );
  return {
    id: result.lastID,
    username,
    email,
    role: role || 'agent',
    action: meta.key,
    actionLabel: meta.label,
    currentStatus: meta.status,
    eventType: meta.type,
    note: note || null,
    createdAt
  };
}

async function insertBreakEvent({ username, email, role, action, note, timestamp }){
  const meta = normalizeBreakAction(action);
  if(!meta) throw new Error('Invalid break action');
  if(!email) throw new Error('Email is required');
  if(meta.key === 'INTERNAL_CALL_OUT' && !String(note || '').trim()){
    const error = new Error('Internal Calls Out requires a short reason or comment.');
    error.statusCode = 400;
    throw error;
  }
  const createdAtDate = timestamp ? new Date(timestamp) : new Date();
  const createdAt = toSqliteUtc(createdAtDate);
  const normalizedEmail = String(email).trim().toLowerCase();
  const dayKey = createdAtDate.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const { start, end } = getDateWindow(dayKey, 'America/Chicago');
  const priorEvents = await all(
    `SELECT * FROM break_events
      WHERE lower(email)=lower(?)
      AND datetime(created_at) >= datetime(?)
      AND datetime(created_at) < datetime(?)
      AND datetime(created_at) < datetime(?)
      ORDER BY datetime(created_at) ASC, id ASC`,
    [normalizedEmail, toSqliteUtc(start), toSqliteUtc(end), createdAt]
  );
  const resolved = resolveBreakEventStream(priorEvents, createdAtDate);
  const currentStatus = resolved.currentStatus || 'Logged Out';
  if(!getAllowedBreakActions(currentStatus).includes(meta.key)){
    const error = new Error(describeBreakTransitionError(meta.key, currentStatus));
    error.statusCode = 400;
    throw error;
  }
  const cleanName = (username || defaultBreakName(email)).trim();
  const returnActionKey = getBreakReturnAction(currentStatus);
  const switchingAway = currentStatus !== 'Logged In' && currentStatus !== 'Logged Out' && meta.status !== 'Logged In';
  const closingShiftFromAway = currentStatus !== 'Logged In' && currentStatus !== 'Logged Out' && meta.key === 'LOGGED_OUT';
  if(returnActionKey && (switchingAway || closingShiftFromAway)){
    const returnMeta = normalizeBreakAction(returnActionKey);
    await createBreakEventRow({
      username: cleanName,
      email: normalizedEmail,
      role,
      meta: returnMeta,
      note: `Auto-return before ${meta.label}`,
      createdAt,
      notified: 0,
      notifyStatus: 'system',
      notifyResponse: 'auto_transition'
    });
  }
  return createBreakEventRow({
    username: cleanName,
    email: normalizedEmail,
    role,
    meta,
    note,
    createdAt
  });
}

/** PWA offline queue (Session 8): look up an existing break_event by its
 *  idempotency key. Returns null if not found. Used by the server to make
 *  POST /api/break-events idempotent under retry. */
async function getBreakEventByIdempoKey(key){
  if (!key || typeof key !== 'string') return null;
  return get(`SELECT * FROM break_events WHERE idempotency_key=? LIMIT 1`, [key]);
}

/** Stamp an idempotency key onto a freshly-inserted break_event row. */
async function setBreakEventIdempoKey(id, key){
  if (!id || !key) return;
  // UNIQUE constraint will throw if the same key was inserted in a race —
  // caller should catch and serve the prior row instead.
  return run(`UPDATE break_events SET idempotency_key=? WHERE id=? AND idempotency_key IS NULL`, [key, id]);
}

function updateBreakEventNotification(id, notified, notifyStatus, notifyResponse){
  return run(
    `UPDATE break_events
      SET notified=?, notify_status=?, notify_response=?
      WHERE id=?`,
    [notified ? 1 : 0, notifyStatus || null, notifyResponse || null, id]
  );
}

async function getBreakEvents(date, timeZone='America/Chicago', email=null){
  const { start, end } = getDateWindow(date, timeZone);
  const params = [toSqliteUtc(start), toSqliteUtc(end)];
  let sql = `SELECT * FROM break_events WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`;
  if(email){
    sql += ` AND lower(email)=lower(?)`;
    params.push(email);
  }
  sql += ` ORDER BY datetime(created_at) DESC, id DESC`;
  return all(sql, params);
}

async function getBreakTracker(date, timeZone='America/Chicago', email=null){
  const { start, end } = getDateWindow(date, timeZone);
  const startSql = toSqliteUtc(start);
  const endSql = toSqliteUtc(end);
  const recentCutoff = new Date(Date.now() - (30 * 86400000));
  const recentCutoffSql = toSqliteUtc(recentCutoff);
  const [dayEvents, priorEvents, recentEvents, loginRows, roles] = await Promise.all([
    all(
      `SELECT * FROM break_events
        WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)
        ${email ? `AND lower(email)=lower(?)` : ''}
        ORDER BY datetime(created_at) ASC, id ASC`,
      email ? [startSql, endSql, email] : [startSql, endSql]
    ),
    all(
      `SELECT * FROM break_events
        WHERE datetime(created_at) < datetime(?)
        ${email ? `AND lower(email)=lower(?)` : ''}
        ORDER BY datetime(created_at) DESC, id DESC`,
      email ? [startSql, email] : [startSql]
    ),
    all(
      `SELECT * FROM break_events
        WHERE datetime(created_at) >= datetime(?)
        ${email ? `AND lower(email)=lower(?)` : ''}
        ORDER BY datetime(created_at) DESC, id DESC`,
      email ? [recentCutoffSql, email] : [recentCutoffSql]
    ),
    all(
      `SELECT username,email,role,logged_in_at FROM login_logs
        WHERE email IS NOT NULL AND datetime(logged_in_at) >= datetime(?)
        ${email ? `AND lower(email)=lower(?)` : ''}
        ORDER BY datetime(logged_in_at) DESC, id DESC`,
      email ? [recentCutoffSql, email] : [recentCutoffSql]
    ),
    getAllRoles()
  ]);

  const roleMap = new Map(roles.map(row => [String(row.email || '').toLowerCase(), row.role]));
  const dayBuckets = new Map();
  const priorMap = new Map();
  const latestMap = new Map();
  const users = new Map();

  function ensureUser(emailValue, usernameValue, roleValue){
    const key = String(emailValue || '').trim().toLowerCase();
    if(!key) return null;
    const existing = users.get(key) || {
      email: key,
      username: usernameValue || defaultBreakName(key),
      role: roleValue || roleMap.get(key) || 'agent'
    };
    if(usernameValue) existing.username = usernameValue;
    if(roleValue) existing.role = roleValue;
    if(!existing.role) existing.role = roleMap.get(key) || 'agent';
    users.set(key, existing);
    return existing;
  }

  loginRows.forEach(row => ensureUser(row.email, row.username, row.role));

  recentEvents.forEach(event => {
    const key = String(event.email || '').toLowerCase();
    ensureUser(key, event.username, event.role);
    if(!latestMap.has(key)) latestMap.set(key, event);
  });

  priorEvents.forEach(event => {
    const key = String(event.email || '').toLowerCase();
    ensureUser(key, event.username, event.role);
    if(!priorMap.has(key)) priorMap.set(key, event);
    if(!latestMap.has(key)) latestMap.set(key, event);
  });

  dayEvents.forEach(event => {
    const key = String(event.email || '').toLowerCase();
    ensureUser(key, event.username, event.role);
    if(!dayBuckets.has(key)) dayBuckets.set(key, []);
    dayBuckets.get(key).push(event);
    latestMap.set(key, event);
  });

  const tracker = [];
  const dayEnd = date === getTodayForTimeZone(timeZone)
    ? new Date(Math.min(Date.now(), end.getTime()))
    : end;

  for(const [key, user] of users.entries()){
    const events = dayBuckets.get(key) || [];
    const resolved = resolveBreakEventStream(events, dayEnd);
    const latestToday = resolved.acceptedEvents.length ? resolved.acceptedEvents[resolved.acceptedEvents.length - 1] : null;
    const resolvedCurrentStatus = resolved.currentStatus || 'Logged Out';
    const decoratedEvents = resolved.decoratedEvents.map(event => ({
      ...event,
      username: event.username || user.username,
      email: key,
      role: event.role || user.role
    }));
    tracker.push({
      email: key,
      username: user.username || defaultBreakName(key),
      role: user.role || 'agent',
      currentStatus: resolvedCurrentStatus,
      statusTone: statusTone(resolvedCurrentStatus),
      since: latestToday ? latestToday.created_at : null,
      lastAction: latestToday ? latestToday.action : null,
      lastActionLabel: latestToday ? latestToday.action_label : 'No activity',
      lastActionAt: latestToday ? latestToday.created_at : null,
      brbSeconds: resolved.brbSeconds,
      breakSeconds: resolved.breakSeconds,
      trainingSeconds: resolved.trainingSeconds,
      qaSeconds: resolved.qaSeconds,
      internalCallSeconds: resolved.internalCallSeconds,
      loggedInSeconds: resolved.loggedInSeconds,
      currentLaneSeconds: resolved.currentLaneSeconds,
      maxBrbInstanceSeconds: resolved.maxBrbInstanceSeconds,
      maxBreakInstanceSeconds: resolved.maxBreakInstanceSeconds,
      maxTrainingInstanceSeconds: resolved.maxTrainingInstanceSeconds,
      maxQaInstanceSeconds: resolved.maxQaInstanceSeconds,
      maxInternalInstanceSeconds: resolved.maxInternalInstanceSeconds,
      alerts: resolved.alerts,
      eventCount: decoratedEvents.length,
      events: decoratedEvents.reverse()
    });
  }

  tracker.sort((a, b) => {
    const order = {
      BRB: 0,
      Break: 1,
      'Internal Calls': 2,
      'Training / Coaching': 3,
      'QA Session AUX': 4,
      'Logged In': 5,
      'Logged Out': 6
    };
    const diff = (order[a.currentStatus] ?? 4) - (order[b.currentStatus] ?? 4);
    if(diff !== 0) return diff;
    return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
  });

  const recentLog = tracker
    .flatMap(row => row.events.map(event => ({ ...event, username: row.username, role: row.role })))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 80);

  const summary = {
    teamCount: tracker.length,
    loggedInNow: tracker.filter(row => row.currentStatus === 'Logged In').length,
    loggedOutNow: tracker.filter(row => row.currentStatus === 'Logged Out').length,
    brbNow: tracker.filter(row => row.currentStatus === 'BRB').length,
    breakNow: tracker.filter(row => row.currentStatus === 'Break').length,
    internalNow: tracker.filter(row => row.currentStatus === 'Internal Calls').length,
    trainingNow: tracker.filter(row => row.currentStatus === 'Training / Coaching').length,
    qaNow: tracker.filter(row => row.currentStatus === 'QA Session AUX').length,
    brbSeconds: tracker.reduce((sum, row) => sum + row.brbSeconds, 0),
    breakSeconds: tracker.reduce((sum, row) => sum + row.breakSeconds, 0),
    internalCallSeconds: tracker.reduce((sum, row) => sum + row.internalCallSeconds, 0),
    trainingSeconds: tracker.reduce((sum, row) => sum + row.trainingSeconds, 0),
    qaSeconds: tracker.reduce((sum, row) => sum + row.qaSeconds, 0),
    alertCount: tracker.filter(row => row.alerts?.hasAlert).length
  };

  return { summary, tracker, recentLog };
}

// ROLES
function normalizeBreakbotEnabled(value){
  return value === false || value === 0 || value === '0' ? 0 : 1;
}

function getAllRoles(){
  return all(`SELECT id,email,role,added_by,added_at,COALESCE(breakbot_enabled,1) AS breakbot_enabled FROM app_roles ORDER BY role ASC,email ASC`);
}

function setRole(e,r,by,breakbotEnabled=1){
  return run(
    `INSERT INTO app_roles (email,role,added_by,breakbot_enabled)
     VALUES (?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       role=excluded.role,
       added_by=excluded.added_by,
       breakbot_enabled=excluded.breakbot_enabled`,
    [e,r,by,normalizeBreakbotEnabled(breakbotEnabled)]
  );
}

function setBreakbotEnabled(e,enabled,by){
  return run(
    `INSERT INTO app_roles (email,role,added_by,breakbot_enabled)
     VALUES (?,'agent',?,?)
     ON CONFLICT(email) DO UPDATE SET
       breakbot_enabled=excluded.breakbot_enabled,
       added_by=excluded.added_by`,
    [e,by || 'system',normalizeBreakbotEnabled(enabled)]
  );
}

function removeRole(e){return run(`DELETE FROM app_roles WHERE email=?`,[e]);}
async function getRoleForEmail(e){const row=await get(`SELECT role FROM app_roles WHERE email=?`,[e]);return row?row.role:null;}
async function getRoleSettingsForEmail(e){
  const row=await get(`SELECT role,COALESCE(breakbot_enabled,1) AS breakbot_enabled FROM app_roles WHERE email=?`,[e]);
  return row?{role:row.role,breakbotEnabled:!!row.breakbot_enabled}:null;
}

async function getCallVolume(dateIso, timeZone='Asia/Kolkata') {
  const { start, end } = getDateWindow(dateIso, timeZone);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  // Build 24 hourly buckets in the target timezone
  const buckets = [];
  for(let h=0; h<24; h++){
    const hourStart = new Date(start.getTime() + h * 3600000);
    const hourEnd   = new Date(start.getTime() + (h+1) * 3600000);
    if(hourStart >= end) break;
    const hStartIso = hourStart.toISOString();
    const hEndIso   = new Date(Math.min(hourEnd.getTime(), end.getTime())).toISOString();
    const label = hourStart.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', hour12: true });
    const inb = await get(
      `SELECT COUNT(*) as total, SUM(CASE WHEN lower(COALESCE(result,'')) IN ('missed','abandoned') THEN 1 ELSE 0 END) as missed
       FROM call_logs WHERE direction='Inbound' AND start_time >= ? AND start_time < ?`,
      [hStartIso, hEndIso]);
    const out = await get(
      `SELECT COUNT(*) as total FROM call_logs WHERE direction='Outbound' AND start_time >= ? AND start_time < ?`,
      [hStartIso, hEndIso]);
    const inbTotal = inb?.total || 0;
    const outTotal = out?.total || 0;
    const missed = inb?.missed || 0;
    if(inbTotal > 0 || outTotal > 0 || h >= 7) { // include business hours even if empty
      buckets.push({ hour: h, label, inbound: inbTotal, outbound: outTotal, missed, handled: inbTotal - missed });
    }
  }
  // Filter to only hours with any data, plus a buffer of business hours (8–20)
  const filtered = buckets.filter(b => b.inbound > 0 || b.outbound > 0 || (b.hour >= 8 && b.hour <= 20));
  return filtered;
}

async function getCallLogsFull(dateIso, timeZone='Asia/Kolkata', limit=200, offset=0) {
  const { start, end } = getDateWindow(dateIso, timeZone);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const rows = await all(
    `SELECT id, agent_id, agent_name, source_call_id, direction, result,
            duration, ring_duration, hold_duration, transferred, is_voicemail,
            from_number, to_number, queue_name, start_time, fetched_at
     FROM call_logs
     WHERE start_time >= ? AND start_time < ?
     ORDER BY start_time DESC
     LIMIT ? OFFSET ?`,
    [startIso, endIso, limit, offset]
  );
  const total = await get(
    `SELECT COUNT(*) as cnt FROM call_logs WHERE start_time >= ? AND start_time < ?`,
    [startIso, endIso]
  );
  return { rows, total: total?.cnt || 0, limit, offset };
}

async function getCallLogStats(dateIso) {
  // dateIso = 'YYYY-MM-DD' in IST; we compute IST midnight boundaries
  const istMidnight = new Date(dateIso + 'T00:00:00+05:30');
  const istNext = new Date(istMidnight.getTime() + 86400000);
  const start = istMidnight.toISOString();
  const end = istNext.toISOString();
  const total = await get(`SELECT COUNT(*) as cnt FROM call_logs WHERE start_time >= ? AND start_time < ?`, [start, end]);
  const byAgent = await all(`SELECT agent_id, COUNT(*) as cnt FROM call_logs WHERE start_time >= ? AND start_time < ? GROUP BY agent_id`, [start, end]);
  const inbound = await get(`SELECT COUNT(*) as cnt FROM call_logs WHERE start_time >= ? AND start_time < ? AND direction='Inbound'`, [start, end]);
  const outbound = await get(`SELECT COUNT(*) as cnt FROM call_logs WHERE start_time >= ? AND start_time < ? AND direction='Outbound'`, [start, end]);
  const missed = await get(`SELECT COUNT(*) as cnt FROM call_logs WHERE start_time >= ? AND start_time < ? AND lower(COALESCE(result,'')) IN ('missed','abandoned')`, [start, end]);
  return { total: total?.cnt || 0, inbound: inbound?.cnt || 0, outbound: outbound?.cnt || 0, missed: missed?.cnt || 0, byAgent };
}

// AGENT NOTES
async function addAgentNote(agentId, agentName, note, addedBy) {
  const result = await run(
    `INSERT INTO agent_notes (agent_id, agent_name, note, added_by) VALUES (?,?,?,?)`,
    [agentId, agentName || null, note, addedBy || null]
  );
  return { id: result.lastID, agentId, agentName, note, addedBy };
}
async function getAgentNotes(agentId) {
  return all(`SELECT * FROM agent_notes WHERE agent_id=? ORDER BY created_at DESC LIMIT 50`, [agentId]);
}
async function deleteAgentNote(id) {
  return run(`DELETE FROM agent_notes WHERE id=?`, [id]);
}

// APP SESSIONS — DB-backed tokens (no shared secret; survives server restarts)
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function createAppSession(token, email, name, picture, googleSub){
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return run(
    `INSERT OR REPLACE INTO app_sessions (token, email, name, picture, google_sub, expires_at) VALUES (?,?,?,?,?,?)`,
    [token, email, name || '', picture || '', googleSub || null, expiresAt]
  );
}

// Return the most recently stored google_sub for a given email
function getGoogleSubForEmail(email){
  return get(
    `SELECT google_sub FROM app_sessions WHERE email=? AND google_sub IS NOT NULL ORDER BY expires_at DESC LIMIT 1`,
    [email]
  ).then(r => r?.google_sub || null);
}

async function getAppSession(token){
  const row = await get(`SELECT * FROM app_sessions WHERE token=?`, [token]);
  if(!row) return null;
  if(row.expires_at < Date.now()){
    run(`DELETE FROM app_sessions WHERE token=?`, [token]).catch(()=>{});
    return null;
  }
  // Rolling expiry — extend on each use
  run(`UPDATE app_sessions SET expires_at=? WHERE token=?`, [Date.now() + SESSION_TTL_MS, token]).catch(()=>{});
  return row;
}

function deleteAppSession(token){
  return run(`DELETE FROM app_sessions WHERE token=?`, [token]);
}

/** Session 10 bulk-action helper — force-logout an agent by wiping all their
 *  active server-side sessions. They'll need to re-auth via Google on next page load. */
function deleteSessionsForEmail(email){
  if (!email) return Promise.resolve();
  return run(`DELETE FROM app_sessions WHERE lower(email)=lower(?)`, [String(email).trim()]);
}

/** Look up the most recent Google profile picture URL for an email address */
async function getPictureForEmail(email){
  if(!email) return null;
  const row = await get(
    `SELECT picture FROM app_sessions WHERE email=? AND picture IS NOT NULL AND picture!='' ORDER BY expires_at DESC LIMIT 1`,
    [email]
  );
  return row ? row.picture : null;
}

function pruneExpiredSessions(){
  return run(`DELETE FROM app_sessions WHERE expires_at < ?`, [Date.now()]);
}

// ── Break report data ────────────────────────────────────────────────────────
// Returns per-agent break totals across a date range (multi-day aggregation)
async function getBreakReportData(startDateIso, endDateIso, timeZone='America/Chicago'){
  const AUX_OUT = { BRB_OUT:'BRB', BREAK_OUT:'BREAK', TRAINING_OUT:'TRAINING', QA_SESSION_OUT:'QA_SESSION', INTERNAL_CALL_OUT:'INTERNAL_CALL' };
  const AUX_IN  = new Set(['BRB_IN','BREAK_IN','TRAINING_IN','QA_SESSION_IN','INTERNAL_CALL_IN','LOGGED_IN','LOGGED_OUT']);

  // Get window across entire range
  const { start } = getDateWindow(startDateIso, timeZone);
  const { end }   = getDateWindow(endDateIso,   timeZone);
  const startSql  = toSqliteUtc(start);
  const endSql    = toSqliteUtc(end);

  const events = await all(
    `SELECT * FROM break_events WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) ORDER BY email, datetime(created_at) ASC`,
    [startSql, endSql]
  );
  const thresholds = await all(`SELECT * FROM break_thresholds`);
  const threshMap = {};
  thresholds.forEach(t => { threshMap[t.aux_type] = t; });

  // Aggregate per agent
  const agentMap = {};
  const openSessions = {}; // email:aux → start time

  for(const ev of events){
    const email = (ev.email||'').toLowerCase();
    if(!agentMap[email]) agentMap[email] = { username: ev.username||email, email, totals:{}, events:[] };
    agentMap[email].events.push(ev);

    const auxOut = AUX_OUT[ev.action];
    if(auxOut){
      openSessions[email+':'+auxOut] = new Date(String(ev.created_at).replace(' ','T')+'Z').getTime();
    } else if(AUX_IN.has(ev.action)){
      // Close any open sessions
      for(const auxType of Object.keys(AUX_OUT).map(k=>AUX_OUT[k])){
        const key = email+':'+auxType;
        if(openSessions[key]){
          const durMs = new Date(String(ev.created_at).replace(' ','T')+'Z').getTime() - openSessions[key];
          const durMin = Math.max(0, durMs/60000);
          if(!agentMap[email].totals[auxType]) agentMap[email].totals[auxType]=0;
          agentMap[email].totals[auxType] += durMin;
          delete openSessions[key];
        }
      }
    }
  }

  // Convert to array with compliance status
  const now = Date.now();
  const agents = Object.values(agentMap).map(a => {
    const compliance = {};
    let anyExceeded = false, anyWarning = false;
    for(const [aux, mins] of Object.entries(a.totals)){
      const thr = threshMap[aux];
      const daily = thr?.daily_limit_minutes;
      const status = !daily ? 'ok' : mins >= daily ? 'exceeded' : mins >= daily*0.8 ? 'warning' : 'ok';
      compliance[aux] = { mins: Math.round(mins*10)/10, daily_limit: daily||null, status };
      if(status==='exceeded') anyExceeded=true;
      if(status==='warning')  anyWarning=true;
    }
    return { username:a.username, email:a.email, totals:a.totals, compliance,
      overallStatus: anyExceeded?'exceeded': anyWarning?'warning':'ok' };
  });

  return { agents, thresholds: threshMap, startDate: startDateIso, endDate: endDateIso };
}

// ── Database maintenance ──────────────────────────────────────────────────────
async function pruneOldData() {
  const results = {};

  // Presence events — BIGGEST table, poll every 2min × 13 agents = ~5MB/day.
  // Reduced from 14→7 days: 7-day trend charts still work; saves ~35MB on the
  // 500MB Railway volume that was at 93% capacity and caused the SIGTERM crash.
  const pe = await run(`DELETE FROM presence_events WHERE datetime(timestamp) < datetime('now','-7 days')`);
  results.presence_events = pe.changes;

  // Call logs — keep 7 days
  const cl = await run(`DELETE FROM call_logs WHERE date(start_time) < date('now','-7 days')`);
  results.call_logs = cl.changes;

  // Login logs — keep 30 days
  const ll = await run(`DELETE FROM login_logs WHERE datetime(logged_in_at) < datetime('now','-30 days')`);
  results.login_logs = ll.changes;

  // Break events — keep 60 days
  const be = await run(`DELETE FROM break_events WHERE datetime(created_at) < datetime('now','-60 days')`);
  results.break_events = be.changes;

  // Audit log — keep 60 days
  const al = await run(`DELETE FROM audit_log WHERE datetime(created_at) < datetime('now','-60 days')`);
  results.audit_log = al.changes;

  // Expired sessions
  const as = await run(`DELETE FROM app_sessions WHERE expires_at < ?`, [Date.now()]);
  results.app_sessions = as.changes;

  // Alert events — keep 30 days (were never pruned; could grow unboundedly)
  try {
    const ae = await run(`DELETE FROM alert_events WHERE datetime(created_at) < datetime('now','-30 days')`);
    results.alert_events = ae.changes;
  } catch(e) { results.alert_events = 0; }

  // Anomaly events — keep 30 days (were never pruned)
  try {
    const ano = await run(`DELETE FROM anomaly_events WHERE datetime(created_at) < datetime('now','-30 days')`);
    results.anomaly_events = ano.changes;
  } catch(e) { results.anomaly_events = 0; }

  // Wellness check-ins — keep 90 days (were never pruned)
  try {
    const wl = await run(`DELETE FROM wellness_checkin WHERE datetime(created_at) < datetime('now','-90 days')`);
    results.wellness_checkin = wl.changes;
  } catch(e) { results.wellness_checkin = 0; }

  // Shift handoffs — keep 30 days (were never pruned)
  try {
    const sh = await run(`DELETE FROM shift_handoff WHERE datetime(created_at) < datetime('now','-30 days')`);
    results.shift_handoff = sh.changes;
  } catch(e) { results.shift_handoff = 0; }

  // Coach flags — keep 60 days (were never pruned)
  try {
    const cf = await run(`DELETE FROM coach_flag WHERE datetime(created_at) < datetime('now','-60 days')`);
    results.coach_flag = cf.changes;
  } catch(e) { results.coach_flag = 0; }

  // Checkpoint WAL before VACUUM so SQLite flushes the write-ahead log back
  // into the main db file — otherwise VACUUM won't reclaim WAL-held pages.
  try { await run(`PRAGMA wal_checkpoint(TRUNCATE)`); } catch(e) { /* non-fatal */ }

  // VACUUM — physically reclaims disk space (DELETE only marks pages free)
  await run(`VACUUM`);
  results.vacuumed = true;

  return results;
}

async function getDbStats() {
  const tables = ['presence_events','call_logs','login_logs','break_events','audit_log','app_sessions','break_thresholds','monitored_agents'];
  const counts = {};
  for (const t of tables) {
    try {
      const r = await get(`SELECT COUNT(*) as c FROM ${t}`);
      counts[t] = r?.c ?? 0;
    } catch(e) { counts[t] = -1; }
  }
  // Page size info
  const pageSize = await get(`PRAGMA page_size`);
  const pageCount = await get(`PRAGMA page_count`);
  const freePages = await get(`PRAGMA freelist_count`);
  const dbSizeMB = ((pageSize.page_size * pageCount.page_count) / 1048576).toFixed(2);
  const freeMB   = ((pageSize.page_size * freePages.freelist_count) / 1048576).toFixed(2);
  return { counts, dbSizeMB, freeMB, path: dbPath };
}

// ── Break thresholds ─────────────────────────────────────────────────────────
async function getBreakThresholds() {
  return all(`SELECT * FROM break_thresholds ORDER BY aux_type`);
}

async function setBreakThreshold(auxType, singleLimitMinutes, dailyLimitMinutes, updatedBy) {
  return run(
    `INSERT INTO break_thresholds (aux_type, single_limit_minutes, daily_limit_minutes, updated_by, updated_at)
     VALUES (?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(aux_type) DO UPDATE SET
       single_limit_minutes=excluded.single_limit_minutes,
       daily_limit_minutes=excluded.daily_limit_minutes,
       updated_by=excluded.updated_by,
       updated_at=excluded.updated_at`,
    [auxType, singleLimitMinutes ?? null, dailyLimitMinutes ?? null, updatedBy || 'admin']
  );
}

// ── FEAT-4: Audit log ─────────────────────────────────────────────────────────
function insertAuditLog(actorEmail, action, target, detail) {
  return run(
    `INSERT INTO audit_log (actor_email, action, target, detail) VALUES (?,?,?,?)`,
    [actorEmail, action, target || null, detail || null]
  );
}

async function getAuditLog(limit = 200) {
  return all(
    `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

// ── AI Learning Agent DB functions ────────────────────────────────────────────
function insertTicketFeedback(ticketNumber, ticketSubject, zohoChannel, suggestedType, suggestedRule, agentType, feedback, agentEmail) {
  return run(`INSERT INTO ticket_feedback (ticket_number,ticket_subject,zoho_channel,suggested_type,suggested_rule,agent_type,feedback,agent_email) VALUES (?,?,?,?,?,?,?,?)`,
    [ticketNumber, ticketSubject, zohoChannel, suggestedType, suggestedRule, agentType, feedback, agentEmail]);
}
function getTicketFeedback(limit = 200) {
  return all(`SELECT * FROM ticket_feedback ORDER BY created_at DESC LIMIT ?`, [limit]);
}
function getFeedbackStats() {
  return all(`
    SELECT suggested_rule, suggested_type,
      COUNT(*) as total,
      SUM(CASE WHEN feedback='correct' THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN feedback='wrong' THEN 1 ELSE 0 END) as wrong,
      SUM(CASE WHEN feedback='edited' THEN 1 ELSE 0 END) as edited,
      ROUND(1.0*SUM(CASE WHEN feedback='correct' THEN 1 ELSE 0 END)/COUNT(*),2) as accuracy
    FROM ticket_feedback WHERE suggested_rule IS NOT NULL
    GROUP BY suggested_rule ORDER BY total DESC`);
}
function getWrongPatterns() {
  return all(`
    SELECT ticket_subject, zoho_channel, suggested_type, agent_type, COUNT(*) as freq
    FROM ticket_feedback WHERE feedback IN ('wrong','edited')
    GROUP BY ticket_subject, zoho_channel, suggested_type, agent_type
    ORDER BY freq DESC LIMIT 50`);
}
function upsertLearnedPattern(patternKey, patternType, patternValue, suggestedType, createdBy) {
  return run(`INSERT INTO learned_patterns (pattern_key,pattern_type,pattern_value,suggested_type,created_by,sample_count,correct_count)
    VALUES (?,?,?,?,?,1,0)
    ON CONFLICT(pattern_key) DO UPDATE SET
      suggested_type=excluded.suggested_type, sample_count=sample_count+1, updated_at=CURRENT_TIMESTAMP`,
    [patternKey, patternType, patternValue, suggestedType, createdBy]);
}
function getLearnedPatterns() {
  return all(`SELECT * FROM learned_patterns WHERE status='active' ORDER BY confidence DESC, sample_count DESC`);
}
function updatePatternFeedback(patternKey, isCorrect) {
  const delta = isCorrect ? 1 : 0;
  return run(`UPDATE learned_patterns SET
    sample_count=sample_count+1,
    correct_count=correct_count+?,
    confidence=ROUND(1.0*(correct_count+?)/(sample_count+1),2),
    updated_at=CURRENT_TIMESTAMP
    WHERE pattern_key=?`, [delta, delta, patternKey]);
}

// ── Shift handoff (#9) ────────────────────────────────────────────────
async function createHandoff(email, note){
  if(!email||!note) throw new Error('email and note required');
  return run(`INSERT INTO shift_handoff (email,note) VALUES (?,?)`,[email,note.trim().slice(0,500)]);
}
async function getRecentHandoffs(limit=20){
  return all(`SELECT id,email,note,created_at,acknowledged,acknowledged_by,acknowledged_at
              FROM shift_handoff ORDER BY created_at DESC LIMIT ?`,[limit]);
}
async function getUnreadHandoffs(){
  return all(`SELECT id,email,note,created_at FROM shift_handoff
              WHERE acknowledged=0 ORDER BY created_at DESC LIMIT 10`);
}
async function ackHandoff(id, byEmail){
  return run(`UPDATE shift_handoff SET acknowledged=1,acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP WHERE id=?`,[byEmail,id]);
}

// ── Wellness check-in (#10) ───────────────────────────────────────────
async function upsertWellness(email, date, mood, note){
  if(!email||!date||!mood) throw new Error('email, date, mood required');
  return run(`INSERT INTO wellness_checkin (email,date,mood,note) VALUES (?,?,?,?)
              ON CONFLICT(email,date) DO UPDATE SET mood=excluded.mood,note=excluded.note`,
    [email,date,mood,note||null]);
}
async function getWellnessForEmail(email, days=30){
  return all(`SELECT date,mood,note,created_at FROM wellness_checkin
              WHERE email=? AND date>=DATE('now',?) ORDER BY date DESC`,[email,`-${days} days`]);
}
async function getWellnessTeamSummary(days=7){
  return all(`SELECT date,mood,COUNT(*) AS count FROM wellness_checkin
              WHERE date>=DATE('now',?) GROUP BY date,mood ORDER BY date DESC`,[`-${days} days`]);
}
async function hasWellnessToday(email, date){
  const r = await get(`SELECT 1 FROM wellness_checkin WHERE email=? AND date=?`,[email,date]);
  return !!r;
}

// ── Coach mode (#12) ──────────────────────────────────────────────────
async function createCoachFlag(agentEmail, setBy, reason){
  if(!agentEmail||!setBy) throw new Error('agentEmail and setBy required');
  return run(`INSERT INTO coach_flag (agent_email,set_by,reason) VALUES (?,?,?)`,[agentEmail,setBy,reason||null]);
}
async function getPendingCoachFlag(agentEmail){
  return get(`SELECT id,agent_email,set_by,reason,created_at FROM coach_flag
              WHERE agent_email=? AND status='pending' ORDER BY created_at DESC LIMIT 1`,[agentEmail]);
}
async function ackCoachFlag(id){
  return run(`UPDATE coach_flag SET status='acknowledged',acknowledged_at=CURRENT_TIMESTAMP WHERE id=?`,[id]);
}
async function listActiveCoachFlags(){
  return all(`SELECT id,agent_email,set_by,reason,status,created_at FROM coach_flag
              WHERE status='pending' ORDER BY created_at DESC`);
}

// ── Real-time alerts (#11 Session 2) ──────────────────────────────────

/** Return all threshold configs as a map keyed by alert key. Each row's
 *  threshold_json is parsed and merged into the row's `threshold` field. */
async function getAlertThresholds(){
  const rows = await all(`SELECT key,enabled,severity,threshold_json,cooldown_seconds,updated_at,updated_by
                          FROM alert_thresholds`);
  const out = {};
  for (const r of rows) {
    let threshold = {};
    try { threshold = JSON.parse(r.threshold_json || '{}'); } catch(e){}
    out[r.key] = {
      enabled: r.enabled,
      severity: r.severity,
      threshold,
      cooldown_seconds: r.cooldown_seconds,
      updated_at: r.updated_at,
      updated_by: r.updated_by
    };
  }
  return out;
}

/** Update a single threshold. Validates severity and ensures the key exists.
 *  Returns nothing on success; throws on validation failure. */
async function updateAlertThreshold(key, updates, byEmail){
  if (!key) throw new Error('key required');
  const valid = new Set(['info','warning','critical']);
  if (updates.severity && !valid.has(updates.severity)) {
    throw new Error('severity must be info|warning|critical');
  }
  const existing = await get(`SELECT * FROM alert_thresholds WHERE key=?`,[key]);
  if (!existing) throw new Error('Unknown alert key: ' + key);
  const merged = {
    enabled: updates.enabled != null ? (updates.enabled ? 1 : 0) : existing.enabled,
    severity: updates.severity || existing.severity,
    threshold_json: updates.threshold ? JSON.stringify(updates.threshold) : existing.threshold_json,
    cooldown_seconds: updates.cooldown_seconds != null ? Number(updates.cooldown_seconds) : existing.cooldown_seconds
  };
  await run(`UPDATE alert_thresholds
             SET enabled=?, severity=?, threshold_json=?, cooldown_seconds=?,
                 updated_at=CURRENT_TIMESTAMP, updated_by=?
             WHERE key=?`,
    [merged.enabled, merged.severity, merged.threshold_json, merged.cooldown_seconds, byEmail || 'system', key]);
}

/** Check if the same alert key has fired within `cooldownSeconds`. */
async function isAlertInCooldown(key, cooldownSeconds){
  const row = await get(`SELECT created_at FROM alert_events
                         WHERE key=? AND created_at > datetime('now', ?)
                         ORDER BY created_at DESC LIMIT 1`,
    [key, `-${cooldownSeconds} seconds`]);
  return !!row;
}

/** Insert a new alert event. Returns the new row id. */
async function insertAlertEvent({ key, severity, body, data, agentEmail }){
  if (!key || !severity || !body) throw new Error('key, severity, body required');
  const r = await run(`INSERT INTO alert_events (key,severity,body,data_json,agent_email)
                       VALUES (?,?,?,?,?)`,
    [key, severity, body, JSON.stringify(data || {}), agentEmail || null]);
  return r.lastID;
}

/** Active = not acked AND (not snoozed OR snooze expired). Most recent first. */
async function getActiveAlerts(limit){
  return all(`SELECT id,key,severity,body,data_json,agent_email,created_at,snoozed_until
              FROM alert_events
              WHERE acked_at IS NULL
                AND (snoozed_until IS NULL OR snoozed_until < CURRENT_TIMESTAMP)
              ORDER BY created_at DESC LIMIT ?`,[limit || 50]);
}

/** Full audit list — used for retrospective analytics. */
async function getRecentAlerts(days){
  const d = Math.min(Math.max(parseInt(days)||7, 1), 90);
  return all(`SELECT id,key,severity,body,data_json,agent_email,created_at,acked_at,acked_by,snoozed_until
              FROM alert_events
              WHERE created_at > datetime('now', ?)
              ORDER BY created_at DESC LIMIT 500`, [`-${d} days`]);
}

async function ackAlert(id, byEmail){
  return run(`UPDATE alert_events SET acked_at=CURRENT_TIMESTAMP, acked_by=? WHERE id=? AND acked_at IS NULL`,
    [byEmail || 'unknown', id]);
}

/** Ack every currently-active alert in one statement. Returns affected count. */
async function ackAllActiveAlerts(byEmail){
  const r = await run(`UPDATE alert_events
                       SET acked_at=CURRENT_TIMESTAMP, acked_by=?
                       WHERE acked_at IS NULL
                         AND (snoozed_until IS NULL OR snoozed_until < CURRENT_TIMESTAMP)`,
    [byEmail || 'unknown']);
  return r ? r.changes : 0;
}

async function snoozeAlert(id, minutes){
  const m = Math.min(Math.max(parseInt(minutes)||15, 1), 1440);
  return run(`UPDATE alert_events SET snoozed_until=datetime('now', ?) WHERE id=?`,
    [`+${m} minutes`, id]);
}

// ── Predictive abandonment (#16 Session 11) ───────────────────────────

/** Persist the latest fitted model. Single-row table — INSERT OR REPLACE. */
async function savePredictModel(model){
  if (!model || !model.ready) throw new Error('only ready models can be saved');
  return run(`INSERT OR REPLACE INTO predict_models
    (id, model_key, fitted_at, weights_json, mu_json, sigma_json,
     feature_keys_json, sample_size, precision, recall, accuracy, notes)
    VALUES (1, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['abandon_15min',
     JSON.stringify(model.weights),
     JSON.stringify(model.mu),
     JSON.stringify(model.sigma),
     JSON.stringify(model.featureKeys),
     model.sampleSize,
     (model.evalMetrics && model.evalMetrics.precision) || 0,
     (model.evalMetrics && model.evalMetrics.recall) || 0,
     (model.evalMetrics && model.evalMetrics.accuracy) || 0,
     model.notes || null]);
}

/** Load the latest fitted model. Returns null if no model has been trained. */
async function loadPredictModel(){
  const row = await get(`SELECT * FROM predict_models WHERE id=1`);
  if (!row) return null;
  try {
    return {
      ready: true,
      modelKey: row.model_key,
      fittedAt: row.fitted_at,
      weights: JSON.parse(row.weights_json || '[]'),
      mu: JSON.parse(row.mu_json || '[]'),
      sigma: JSON.parse(row.sigma_json || '[]'),
      featureKeys: JSON.parse(row.feature_keys_json || '[]'),
      sampleSize: row.sample_size,
      evalMetrics: {
        precision: row.precision || 0,
        recall: row.recall || 0,
        accuracy: row.accuracy || 0
      },
      notes: row.notes
    };
  } catch (e) {
    return null;
  }
}

// ── Anomaly detection (#20 Session 6) ─────────────────────────────────

async function getAnomalyThresholds(){
  const rows = await all(`SELECT metric,enabled,z_threshold,direction,min_history_days,
                          lookback_days,updated_at,updated_by FROM anomaly_thresholds`);
  const out = {};
  for (const r of rows) {
    out[r.metric] = {
      enabled: r.enabled,
      z_threshold: r.z_threshold,
      direction: r.direction,
      min_history_days: r.min_history_days,
      lookback_days: r.lookback_days,
      updated_at: r.updated_at,
      updated_by: r.updated_by
    };
  }
  return out;
}

async function updateAnomalyThreshold(metric, updates, byEmail){
  if (!metric) throw new Error('metric required');
  const valid = new Set(['low','high','either']);
  if (updates.direction && !valid.has(updates.direction)) {
    throw new Error('direction must be low|high|either');
  }
  const existing = await get(`SELECT * FROM anomaly_thresholds WHERE metric=?`,[metric]);
  if (!existing) throw new Error('Unknown metric: ' + metric);
  const merged = {
    enabled: updates.enabled != null ? (updates.enabled ? 1 : 0) : existing.enabled,
    z_threshold: updates.z_threshold != null ? Number(updates.z_threshold) : existing.z_threshold,
    direction: updates.direction || existing.direction,
    min_history_days: updates.min_history_days != null ? parseInt(updates.min_history_days) : existing.min_history_days,
    lookback_days: updates.lookback_days != null ? parseInt(updates.lookback_days) : existing.lookback_days
  };
  await run(`UPDATE anomaly_thresholds
             SET enabled=?, z_threshold=?, direction=?, min_history_days=?, lookback_days=?,
                 updated_at=CURRENT_TIMESTAMP, updated_by=?
             WHERE metric=?`,
    [merged.enabled, merged.z_threshold, merged.direction, merged.min_history_days, merged.lookback_days, byEmail || 'system', metric]);
}

async function insertAnomalyEvent(ev){
  if (!ev || !ev.agent_email || !ev.metric || !ev.date || !ev.severity) {
    throw new Error('agent_email, metric, date, severity required');
  }
  // INSERT OR IGNORE — UNIQUE(agent_email, metric, date) prevents duplicates
  const r = await run(`INSERT OR IGNORE INTO anomaly_events
    (agent_email, metric, date, today_value, baseline_median, baseline_mad,
     modified_z, direction, severity, flat_baseline, sample_size)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [ev.agent_email, ev.metric, ev.date,
     ev.today_value, ev.baseline_median, ev.baseline_mad,
     ev.modified_z, ev.direction, ev.severity,
     ev.flat_baseline ? 1 : 0, ev.sample_size || null]);
  return r ? r.lastID : null;
}

async function getRecentAnomalies(days){
  const d = Math.min(Math.max(parseInt(days)||7, 1), 90);
  return all(`SELECT * FROM anomaly_events
              WHERE created_at > datetime('now', ?)
              ORDER BY created_at DESC, severity LIMIT 500`, [`-${d} days`]);
}

async function getActiveAnomalies(limit){
  return all(`SELECT * FROM anomaly_events
              WHERE acked_at IS NULL
              ORDER BY created_at DESC LIMIT ?`,[limit || 100]);
}

async function getAnomaliesForAgent(email, days){
  const d = Math.min(Math.max(parseInt(days)||30, 1), 180);
  return all(`SELECT * FROM anomaly_events
              WHERE agent_email=? AND created_at > datetime('now', ?)
              ORDER BY date DESC, created_at DESC`,[email, `-${d} days`]);
}

async function ackAnomaly(id, byEmail){
  return run(`UPDATE anomaly_events SET acked_at=CURRENT_TIMESTAMP, acked_by=?
              WHERE id=? AND acked_at IS NULL`, [byEmail || 'unknown', id]);
}

async function getAnomalyCounts(){
  const row = await get(`SELECT COUNT(*) AS total,
                                SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) AS critical,
                                SUM(CASE WHEN severity='warning' THEN 1 ELSE 0 END) AS warning
                         FROM anomaly_events WHERE acked_at IS NULL`);
  return {
    total: row ? row.total : 0,
    critical: row ? row.critical : 0,
    warning: row ? row.warning : 0
  };
}

// ── Schedule adherence (#14 Session 4) ────────────────────────────────

/** All schedule rows for one agent. The engine versions internally. */
async function getSchedulesForAgent(email){
  return all(`SELECT id,agent_email,day_of_week,start_time,end_time,timezone,
              is_working_day,effective_from,effective_to,created_at,created_by
              FROM agent_schedules WHERE agent_email=?
              ORDER BY day_of_week ASC, effective_from DESC`,[email]);
}

/** All schedule rows for every agent. Returned as map {email → rows[]}. */
async function getAllSchedules(){
  const rows = await all(`SELECT id,agent_email,day_of_week,start_time,end_time,timezone,
                          is_working_day,effective_from,effective_to,created_at,created_by
                          FROM agent_schedules
                          ORDER BY agent_email, day_of_week, effective_from DESC`);
  const out = {};
  for (const r of rows) {
    if (!out[r.agent_email]) out[r.agent_email] = [];
    out[r.agent_email].push(r);
  }
  return out;
}

/** Versioned history (admin view) for one agent — newest first. */
async function getScheduleHistory(email){
  return all(`SELECT id,agent_email,day_of_week,start_time,end_time,timezone,
              is_working_day,effective_from,effective_to,created_at,created_by
              FROM agent_schedules WHERE agent_email=?
              ORDER BY effective_from DESC, day_of_week ASC`,[email]);
}

/**
 * Insert a new schedule version. Accepts an array of day-of-week rows.
 * Caller is responsible for end-dating prior rows via endDatePriorSchedule.
 *
 * @param {Array} weekRows — [{day_of_week, start_time, end_time, timezone, is_working_day}]
 * @param {string} email
 * @param {string} effectiveFrom — YYYY-MM-DD
 * @param {string} createdBy
 */
async function insertScheduleVersion(weekRows, email, effectiveFrom, createdBy){
  if (!email || !effectiveFrom) throw new Error('email and effectiveFrom required');
  if (!Array.isArray(weekRows) || weekRows.length === 0) throw new Error('weekRows required');
  // Basic validation
  for (const r of weekRows) {
    if (r.day_of_week == null || r.day_of_week < 0 || r.day_of_week > 6) {
      throw new Error('day_of_week must be 0..6');
    }
    if (r.is_working_day !== 0) {
      if (!r.start_time || !r.end_time) throw new Error('start_time/end_time required when working');
    }
  }
  // Insert rows
  for (const r of weekRows) {
    await run(`INSERT INTO agent_schedules
               (agent_email, day_of_week, start_time, end_time, timezone, is_working_day, effective_from, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, r.day_of_week, r.start_time || '00:00', r.end_time || '00:00',
       r.timezone || 'America/Chicago', r.is_working_day != null ? (r.is_working_day ? 1 : 0) : 1,
       effectiveFrom, createdBy || 'system']);
  }
}

/** End-date all currently-open schedule rows for an agent so a new version takes over. */
async function endDatePriorSchedule(email, endDate){
  if (!email || !endDate) throw new Error('email and endDate required');
  await run(`UPDATE agent_schedules SET effective_to=?
             WHERE agent_email=? AND effective_to IS NULL AND effective_from < ?`,
    [endDate, email, endDate]);
}

/** Delete all schedule rows for an agent (rare — admin reset). */
async function deleteAllSchedulesForAgent(email){
  return run(`DELETE FROM agent_schedules WHERE agent_email=?`,[email]);
}

/** Returns unack count grouped by severity — used by the bell badge. */
async function getAlertCounts(){
  const rows = await all(`SELECT severity, COUNT(*) AS n FROM alert_events
                          WHERE acked_at IS NULL
                            AND (snoozed_until IS NULL OR snoozed_until < CURRENT_TIMESTAMP)
                          GROUP BY severity`);
  const out = { info: 0, warning: 0, critical: 0, total: 0 };
  rows.forEach(r => { out[r.severity] = r.n; out.total += r.n; });
  return out;
}

module.exports={
  db,  // Session 16: roster.js needs the raw handle to share the same connection
  createHandoff,getRecentHandoffs,getUnreadHandoffs,ackHandoff,
  upsertWellness,getWellnessForEmail,getWellnessTeamSummary,hasWellnessToday,
  createCoachFlag,getPendingCoachFlag,ackCoachFlag,listActiveCoachFlags,
  // #11 Session 2 — alerts
  getAlertThresholds, updateAlertThreshold,
  isAlertInCooldown, insertAlertEvent,
  getActiveAlerts, getRecentAlerts, ackAlert, ackAllActiveAlerts, snoozeAlert, getAlertCounts,
  // #21 Session 8 — PWA offline queue idempotency
  getBreakEventByIdempoKey, setBreakEventIdempoKey,
  // #14 Session 4 — schedule adherence
  getSchedulesForAgent, getAllSchedules, getScheduleHistory,
  insertScheduleVersion, endDatePriorSchedule, deleteAllSchedulesForAgent,
  // #20 Session 6 — anomaly detection
  getAnomalyThresholds, updateAnomalyThreshold,
  insertAnomalyEvent, getRecentAnomalies, getActiveAnomalies,
  getAnomaliesForAgent, ackAnomaly, getAnomalyCounts,
  // #16 Session 11 — predictive abandonment
  savePredictModel, loadPredictModel,
  initDB,addAgent,removeAgent,getMonitoredAgents,updateAgentRcId,updateAgentChatId,
  insertPresenceEvent,getPresenceEvents,
  insertCallLog,deleteCallLogsRange,replaceCallLogsRange,pruneCallLogs,getAgentSummary,getAbandonedCalls,
  getCallLogStats,getCallVolume,getCallLogsFull,
  addAgentNote,getAgentNotes,deleteAgentNote,
  createAppSession,getAppSession,deleteAppSession,deleteSessionsForEmail,pruneExpiredSessions,getPictureForEmail,getGoogleSubForEmail,
  insertLoginLog,getLoginLogs,
  insertBreakEvent,updateBreakEventNotification,getBreakEvents,getBreakTracker,
  getAllRoles,setRole,setBreakbotEnabled,removeRole,getRoleForEmail,getRoleSettingsForEmail,
  insertAuditLog,getAuditLog,
  getBreakThresholds,setBreakThreshold,
  getBreakReportData,
  pruneOldData,getDbStats,
  insertTicketFeedback,getTicketFeedback,getFeedbackStats,getWrongPatterns,
  upsertLearnedPattern,getLearnedPatterns,updatePatternFeedback
};
