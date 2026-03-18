const Database = require('better-sqlite3');
const db = new Database('productivity.db');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitored_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      extension TEXT UNIQUE NOT NULL,
      email TEXT,
      rc_id TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS presence_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      status TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      call_id TEXT UNIQUE,
      direction TEXT,
      result TEXT,
      duration INTEGER,
      start_time DATETIME,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT,
      role TEXT,
      ip TEXT,
      location TEXT,
      system_info TEXT,
      logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',
      added_by TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations
  [
    `ALTER TABLE monitored_agents ADD COLUMN email TEXT`,
    `ALTER TABLE login_logs ADD COLUMN ip TEXT`,
    `ALTER TABLE login_logs ADD COLUMN location TEXT`,
    `ALTER TABLE login_logs ADD COLUMN system_info TEXT`,
  ].forEach(sql => { try { db.exec(sql); } catch(e) {} });

  // Seed default admins
  ['sebastin.n@adit.com','ronnie@adit.com','imran@adit.com'].forEach(email => {
    try { db.prepare(`INSERT OR IGNORE INTO app_roles (email, role, added_by) VALUES (?, 'admin', 'system')`).run(email); } catch(e) {}
  });

  console.log('✅ Database initialized');
}

// ── AGENTS ────────────────────────────────────────────────────
function addAgent(name, extension, email) {
  return db.prepare(`INSERT OR IGNORE INTO monitored_agents (name, extension, email) VALUES (?, ?, ?)`).run(name, extension, email || null);
}
function removeAgent(extension) {
  return db.prepare(`DELETE FROM monitored_agents WHERE extension = ?`).run(extension);
}
function getMonitoredAgents() {
  return db.prepare(`SELECT * FROM monitored_agents ORDER BY name ASC`).all();
}
function updateAgentRcId(extension, rcId) {
  return db.prepare(`UPDATE monitored_agents SET rc_id = ? WHERE extension = ?`).run(rcId, extension);
}

// ── PRESENCE ──────────────────────────────────────────────────
function insertPresenceEvent(agentId, agentName, status) {
  db.prepare(`INSERT INTO presence_events (agent_id, agent_name, status) VALUES (?, ?, ?)`).run(agentId, agentName, status);
}
function getPresenceEvents(date) {
  const agents = getMonitoredAgents();
  const rcIds = agents.map(a => a.rc_id).filter(Boolean);
  if (!rcIds.length) return [];
  const placeholders = rcIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT * FROM presence_events
    WHERE DATE(timestamp) = ? AND agent_id IN (${placeholders})
    ORDER BY timestamp ASC
  `).all(date, ...rcIds);
}

// ── CALL LOGS ─────────────────────────────────────────────────
function insertCallLog(log) {
  db.prepare(`
    INSERT OR IGNORE INTO call_logs (agent_id, agent_name, call_id, direction, result, duration, start_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(log.agentId, log.agentName, log.callId, log.direction, log.result, log.duration, log.startTime);
}

// ── SUMMARY ───────────────────────────────────────────────────
function getAgentSummary(date) {
  const agents = getMonitoredAgents();
  if (!agents.length) return [];
  return agents.map(agent => {
    const agentId = agent.rc_id || agent.extension;
    const events = db.prepare(`
      SELECT status, timestamp FROM presence_events
      WHERE agent_id = ? AND DATE(timestamp) = ?
      ORDER BY timestamp ASC
    `).all(agentId, date);
    let availTime = 0, unavailTime = 0, toggleCount = 0;
    for (let i = 0; i < events.length - 1; i++) {
      const dur = (new Date(events[i+1].timestamp) - new Date(events[i].timestamp)) / 1000;
      if (events[i].status === 'Available') availTime += dur;
      else unavailTime += dur;
      toggleCount++;
    }
    const calls = db.prepare(`
      SELECT COUNT(*) as total, SUM(duration) as totalDuration,
             SUM(CASE WHEN result = 'Missed' THEN 1 ELSE 0 END) as missed
      FROM call_logs WHERE agent_id = ? AND DATE(start_time) = ?
    `).get(agentId, date);
    return {
      agentId, agentName: agent.name, extension: agent.extension,
      availableSeconds: Math.round(availTime),
      unavailableSeconds: Math.round(unavailTime),
      toggleCount,
      totalCalls: calls.total || 0,
      missedCalls: calls.missed || 0,
      avgHandleTime: calls.total > 0 ? Math.round(calls.totalDuration / calls.total) : 0
    };
  });
}

// ── LOGIN LOGS ────────────────────────────────────────────────
function insertLoginLog(username, email, role, ip, location, systemInfo) {
  db.prepare(`
    INSERT INTO login_logs (username, email, role, ip, location, system_info)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(username, email, role, ip || null, location || null, systemInfo || null);
}
function getLoginLogs() {
  return db.prepare(`SELECT * FROM login_logs ORDER BY logged_in_at DESC LIMIT 500`).all();
}

// ── ROLE MANAGEMENT ───────────────────────────────────────────
function getAllRoles() {
  return db.prepare(`SELECT * FROM app_roles ORDER BY role ASC, email ASC`).all();
}
function setRole(email, role, addedBy) {
  db.prepare(`
    INSERT INTO app_roles (email, role, added_by) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET role = excluded.role, added_by = excluded.added_by
  `).run(email, role, addedBy);
}
function removeRole(email) {
  return db.prepare(`DELETE FROM app_roles WHERE email = ?`).run(email);
}
function getRoleForEmail(email) {
  const row = db.prepare(`SELECT role FROM app_roles WHERE email = ?`).get(email);
  return row ? row.role : null;
}

module.exports = {
  initDB,
  addAgent, removeAgent, getMonitoredAgents, updateAgentRcId,
  insertPresenceEvent, getPresenceEvents,
  insertCallLog, getAgentSummary,
  insertLoginLog, getLoginLogs,
  getAllRoles, setRole, removeRole, getRoleForEmail
};