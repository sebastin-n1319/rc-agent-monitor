const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'productivity.db'));
const run = (sql, params=[]) => new Promise((res,rej) => db.run(sql, params, function(err){err?rej(err):res(this);}));
const get = (sql, params=[]) => new Promise((res,rej) => db.get(sql, params, (err,row)=>err?rej(err):res(row)));
const all = (sql, params=[]) => new Promise((res,rej) => db.all(sql, params, (err,rows)=>err?rej(err):res(rows)));

async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS monitored_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    extension TEXT UNIQUE NOT NULL, email TEXT, rc_id TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS presence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
    agent_name TEXT, status TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
    agent_name TEXT, call_id TEXT UNIQUE, direction TEXT,
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
    `ALTER TABLE login_logs ADD COLUMN ip TEXT`,
    `ALTER TABLE login_logs ADD COLUMN location TEXT`,
    `ALTER TABLE login_logs ADD COLUMN system_info TEXT`,
    `ALTER TABLE call_logs ADD COLUMN ring_duration INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN hold_duration INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN transferred INTEGER DEFAULT 0`,
    `ALTER TABLE call_logs ADD COLUMN is_voicemail INTEGER DEFAULT 0`,
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
function insertPresenceEvent(agentId,agentName,status){
  return run(`INSERT INTO presence_events (agent_id,agent_name,status) VALUES (?,?,?)`,[agentId,agentName,status]);
}
async function getPresenceEvents(date){
  const agents=await getMonitoredAgents();
  const rcIds=agents.map(a=>a.rc_id).filter(Boolean);
  if(!rcIds.length)return[];
  return all(`SELECT * FROM presence_events WHERE DATE(timestamp)=? AND agent_id IN (${rcIds.map(()=>'?').join(',')}) ORDER BY timestamp ASC`,[date,...rcIds]);
}

// CALL LOGS - now with ring/hold/transfer/voicemail
function insertCallLog(log){
  return run(`INSERT OR IGNORE INTO call_logs
    (agent_id,agent_name,call_id,direction,result,duration,ring_duration,hold_duration,transferred,is_voicemail,start_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [log.agentId,log.agentName,log.callId,log.direction,log.result,
     log.duration||0,log.ringDuration||0,log.holdDuration||0,
     log.transferred?1:0,log.isVoicemail?1:0,log.startTime]);
}

// SUMMARY with all new metrics
async function getAgentSummary(date){
  const agents=await getMonitoredAgents();
  if(!agents.length)return[];
  const results=[];
  for(const agent of agents){
    const agentId=agent.rc_id||agent.extension;
    const events=await all(`SELECT status,timestamp FROM presence_events WHERE agent_id=? AND DATE(timestamp)=? ORDER BY timestamp ASC`,[agentId,date]);
    let availTime=0,unavailTime=0,toggleCount=0;
    for(let i=0;i<events.length-1;i++){
      const dur=(new Date(events[i+1].timestamp)-new Date(events[i].timestamp))/1000;
      if(events[i].status==='Available')availTime+=dur;else unavailTime+=dur;
      toggleCount++;
    }
    // Inbound
    const inb=await get(`SELECT COUNT(*) as total,AVG(duration) as avgDur,AVG(ring_duration) as avgRing,SUM(hold_duration) as totalHold,SUM(CASE WHEN result='Missed' THEN 1 ELSE 0 END) as missed,SUM(is_voicemail) as voicemails FROM call_logs WHERE agent_id=? AND DATE(start_time)=? AND direction='Inbound'`,[agentId,date]);
    // Outbound
    const out=await get(`SELECT COUNT(*) as total,AVG(duration) as avgDur,AVG(ring_duration) as avgRing,SUM(hold_duration) as totalHold FROM call_logs WHERE agent_id=? AND DATE(start_time)=? AND direction='Outbound'`,[agentId,date]);
    // Transfers
    const xfer=await get(`SELECT SUM(transferred) as total FROM call_logs WHERE agent_id=? AND DATE(start_time)=?`,[agentId,date]);

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
  insertCallLog,getAgentSummary,
  insertLoginLog,getLoginLogs,
  getAllRoles,setRole,removeRole,getRoleForEmail
};