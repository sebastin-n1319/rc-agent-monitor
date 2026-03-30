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
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

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
      AVG(CASE WHEN lower(COALESCE(result,''))='call connected' AND duration>0 THEN duration END) as avgDur,
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

// ROLES
function getAllRoles(){return all(`SELECT * FROM app_roles ORDER BY role ASC,email ASC`);}
function setRole(e,r,by){return run(`INSERT INTO app_roles (email,role,added_by) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,added_by=excluded.added_by`,[e,r,by]);}
function removeRole(e){return run(`DELETE FROM app_roles WHERE email=?`,[e]);}
async function getRoleForEmail(e){const row=await get(`SELECT role FROM app_roles WHERE email=?`,[e]);return row?row.role:null;}

module.exports={
  initDB,addAgent,removeAgent,getMonitoredAgents,updateAgentRcId,
  insertPresenceEvent,getPresenceEvents,
  insertCallLog,deleteCallLogsRange,replaceCallLogsRange,getAgentSummary,getAbandonedCalls,
  insertLoginLog,getLoginLogs,
  getAllRoles,setRole,removeRole,getRoleForEmail
};
