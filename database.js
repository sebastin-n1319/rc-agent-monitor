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

  const alerts = {
    breakDayExceeded: breakSeconds > 3600,
    brbSingleExceeded: maxBrbInstanceSeconds > 600,
    brbDayExceeded: brbSeconds > 1200
  };
  alerts.hasAlert = alerts.breakDayExceeded || alerts.brbSingleExceeded || alerts.brbDayExceeded;

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
    is_voicemail INTEGER DEFAULT 0, start_time DATETIME,
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
    `ALTER TABLE break_events ADD COLUMN action_label TEXT DEFAULT ''`,
    `ALTER TABLE break_events ADD COLUMN current_status TEXT DEFAULT 'Logged Out'`,
    `ALTER TABLE break_events ADD COLUMN event_type TEXT DEFAULT 'session'`,
    `ALTER TABLE break_events ADD COLUMN note TEXT`,
    `ALTER TABLE break_events ADD COLUMN notified INTEGER DEFAULT 0`,
    `ALTER TABLE break_events ADD COLUMN notify_status TEXT`,
    `ALTER TABLE break_events ADD COLUMN notify_response TEXT`,
    `ALTER TABLE app_roles ADD COLUMN breakbot_enabled INTEGER DEFAULT 1`,
  ]) { try { await run(sql); } catch(e) {} }

  for (const email of ['sebastin.n@adit.com','ronnie@adit.com','imran@adit.com']) {
    try { await run(`INSERT OR IGNORE INTO app_roles (email,role,added_by) VALUES (?,'admin','system')`,[email]); } catch(e) {}
  }
  console.log('Database initialized');
}

// AGENTS
function addAgent(n,ext,email){return run(`INSERT OR IGNORE INTO monitored_agents (name,extension,email) VALUES (?,?,?)`,[n,ext,email||null]);}
function removeAgent(ext){return run(`DELETE FROM monitored_agents WHERE extension=?`,[ext]);}
function getMonitoredAgents(){return all(`SELECT * FROM monitored_agents ORDER BY name ASC`);}
function updateAgentRcId(ext,rcId){return run(`UPDATE monitored_agents SET rc_id=? WHERE extension=?`,[rcId,ext]);}

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
    log.startTime
  ];
}

function insertCallLog(log){
  return run(`INSERT OR IGNORE INTO call_logs
    (agent_id,agent_name,call_id,source_call_id,direction,result,duration,ring_duration,hold_duration,transferred,is_voicemail,start_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    getStoredCallLogValues(log));
}

function deleteCallLogsRange(startIso,endIso){
  return run(`DELETE FROM call_logs WHERE start_time >= ? AND start_time < ?`,[startIso,endIso]);
}

async function replaceCallLogsRange(startIso,endIso,logs){
  await run('BEGIN IMMEDIATE');
  try{
    await run(`DELETE FROM call_logs WHERE start_time >= ? AND start_time < ?`,[startIso,endIso]);
    for(const log of logs){
      await run(`INSERT OR IGNORE INTO call_logs
        (agent_id,agent_name,call_id,source_call_id,direction,result,duration,ring_duration,hold_duration,transferred,is_voicemail,start_time)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        getStoredCallLogValues(log));
    }
    await run('COMMIT');
  }catch(e){
    try{await run('ROLLBACK');}catch(_){}
    throw e;
  }
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
    let availTime=0,unavailTime=0,toggleCount=0;
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

module.exports={
  initDB,addAgent,removeAgent,getMonitoredAgents,updateAgentRcId,
  insertPresenceEvent,getPresenceEvents,
  insertCallLog,deleteCallLogsRange,replaceCallLogsRange,getAgentSummary,getAbandonedCalls,
  insertLoginLog,getLoginLogs,
  insertBreakEvent,updateBreakEventNotification,getBreakEvents,getBreakTracker,
  getAllRoles,setRole,setBreakbotEnabled,removeRole,getRoleForEmail,getRoleSettingsForEmail
};
