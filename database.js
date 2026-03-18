const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'productivity.db'));
const run = (sql, params=[]) => new Promise((res,rej) => db.run(sql, params, function(err){err?rej(err):res(this);}));
const get = (sql, params=[]) => new Promise((res,rej) => db.get(sql, params, (err,row)=>err?rej(err):res(row)));
const all = (sql, params=[]) => new Promise((res,rej) => db.all(sql, params, (err,rows)=>err?rej(err):res(rows)));

async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS monitored_agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, extension TEXT UNIQUE NOT NULL, email TEXT, rc_id TEXT, added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS presence_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, agent_name TEXT, status TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS call_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, agent_name TEXT, call_id TEXT UNIQUE, direction TEXT, result TEXT, duration INTEGER, start_time DATETIME, fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS login_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT, role TEXT, ip TEXT, location TEXT, system_info TEXT, logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS app_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'agent', added_by TEXT, added_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  for (const sql of [`ALTER TABLE monitored_agents ADD COLUMN email TEXT`,`ALTER TABLE login_logs ADD COLUMN ip TEXT`,`ALTER TABLE login_logs ADD COLUMN location TEXT`,`ALTER TABLE login_logs ADD COLUMN system_info TEXT`]) {
    try { await run(sql); } catch(e) {}
  }
  for (const email of ['sebastin.n@adit.com','ronnie@adit.com','imran@adit.com']) {
    try { await run(`INSERT OR IGNORE INTO app_roles (email,role,added_by) VALUES (?,'admin','system')`,[email]); } catch(e) {}
  }
  console.log('✅ Database initialized');
}

function addAgent(name,extension,email){return run(`INSERT OR IGNORE INTO monitored_agents (name,extension,email) VALUES (?,?,?)`,[name,extension,email||null]);}
function removeAgent(extension){return run(`DELETE FROM monitored_agents WHERE extension=?`,[extension]);}
function getMonitoredAgents(){return all(`SELECT * FROM monitored_agents ORDER BY name ASC`);}
function updateAgentRcId(extension,rcId){return run(`UPDATE monitored_agents SET rc_id=? WHERE extension=?`,[rcId,extension]);}
function insertPresenceEvent(agentId,agentName,status){return run(`INSERT INTO presence_events (agent_id,agent_name,status) VALUES (?,?,?)`,[agentId,agentName,status]);}
async function getPresenceEvents(date){
  const agents=await getMonitoredAgents();
  const rcIds=agents.map(a=>a.rc_id).filter(Boolean);
  if(!rcIds.length)return[];
  return all(`SELECT * FROM presence_events WHERE DATE(timestamp)=? AND agent_id IN (${rcIds.map(()=>'?').join(',')}) ORDER BY timestamp ASC`,[date,...rcIds]);
}
function insertCallLog(log){return run(`INSERT OR IGNORE INTO call_logs (agent_id,agent_name,call_id,direction,result,duration,start_time) VALUES (?,?,?,?,?,?,?)`,[log.agentId,log.agentName,log.callId,log.direction,log.result,log.duration,log.startTime]);}
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
    const calls=await get(`SELECT COUNT(*) as total,SUM(duration) as totalDuration,SUM(CASE WHEN result='Missed' THEN 1 ELSE 0 END) as missed FROM call_logs WHERE agent_id=? AND DATE(start_time)=?`,[agentId,date]);
    results.push({agentId,agentName:agent.name,extension:agent.extension,availableSeconds:Math.round(availTime),unavailableSeconds:Math.round(unavailTime),toggleCount,totalCalls:calls.total||0,missedCalls:calls.missed||0,avgHandleTime:calls.total>0?Math.round(calls.totalDuration/calls.total):0});
  }
  return results;
}
function insertLoginLog(username,email,role,ip,location,systemInfo){return run(`INSERT INTO login_logs (username,email,role,ip,location,system_info) VALUES (?,?,?,?,?,?)`,[username,email,role,ip||null,location||null,systemInfo||null]);}
function getLoginLogs(){return all(`SELECT * FROM login_logs ORDER BY logged_in_at DESC LIMIT 500`);}
function getAllRoles(){return all(`SELECT * FROM app_roles ORDER BY role ASC,email ASC`);}
function setRole(email,role,addedBy){return run(`INSERT INTO app_roles (email,role,added_by) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,added_by=excluded.added_by`,[email,role,addedBy]);}
function removeRole(email){return run(`DELETE FROM app_roles WHERE email=?`,[email]);}
async function getRoleForEmail(email){const row=await get(`SELECT role FROM app_roles WHERE email=?`,[email]);return row?row.role:null;}

module.exports={initDB,addAgent,removeAgent,getMonitoredAgents,updateAgentRcId,insertPresenceEvent,getPresenceEvents,insertCallLog,getAgentSummary,insertLoginLog,getLoginLogs,getAllRoles,setRole,removeRole,getRoleForEmail};