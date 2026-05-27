/**
 * Roster Management (Session 16)
 *
 * Backs the admin Roster page. Replicates the company's "T1 CS Team Roster"
 * spreadsheet — daily presence codes per agent (P / OFF / PL / UPL / WFH /
 * Holiday / SL / On Duty / NCNS / Relieved) — and makes it editable in-app
 * so we can stop maintaining a separate xlsx.
 *
 * Tables:
 *   roster_agents   — agent metadata (one row per emp_id)
 *   roster_days     — date × emp_id → status code
 *   roster_audit    — append-only change history (who changed what when)
 *
 * Status codes are stored normalized:
 *   present / off / pl / hd_pl / upl / hd_upl / sl / hd_sl / holiday /
 *   wfh / on_duty / ncns / relieved / absent / na
 */
const path = require('path');
const fs = require('fs');

let _db = null;

function setDB(db) { _db = db; }

const run = (sql, params=[]) =>
  new Promise((res,rej) => _db.run(sql, params, function(err){ err ? rej(err) : res(this); }));
const get = (sql, params=[]) =>
  new Promise((res,rej) => _db.get(sql, params, (err,row) => err ? rej(err) : res(row)));
const all = (sql, params=[]) =>
  new Promise((res,rej) => _db.all(sql, params, (err,rows) => err ? rej(err) : res(rows)));

/** Canonical status codes accepted by the API. Anything else is rejected
 *  at the endpoint so we don't quietly corrupt the matrix. */
const VALID_STATUSES = new Set([
  'present','off','pl','hd_pl','upl','hd_upl','sl','hd_sl',
  'holiday','wfh','on_duty','ncns','relieved','absent','na',''
]);

const STATUS_LABELS = {
  present:  'Present',
  off:      'Weekly Off',
  pl:       'Paid Leave',
  hd_pl:    'Half-day Paid',
  upl:      'Unpaid Leave',
  hd_upl:   'Half-day Unpaid',
  sl:       'Sick Leave',
  hd_sl:    'Half-day Sick',
  holiday:  'Holiday',
  wfh:      'Work From Home',
  on_duty:  'On Duty',
  ncns:     'No Call No Show',
  relieved: 'Relieved',
  absent:   'Absent',
  na:       'N/A',
};

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS roster_agents (
    emp_id TEXT PRIMARY KEY,
    pseudo TEXT,
    full_name TEXT,
    email TEXT,
    designation TEXT,
    doj TEXT,
    contact TEXT,
    alt_contact TEXT,
    shift TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS roster_days (
    date TEXT NOT NULL,
    emp_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT,
    PRIMARY KEY (date, emp_id)
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_roster_days_emp  ON roster_days(emp_id, date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_roster_days_date ON roster_days(date)`);

  await run(`CREATE TABLE IF NOT EXISTS roster_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT, emp_id TEXT, action TEXT,
    prev_status TEXT, new_status TEXT,
    note TEXT,
    actor_email TEXT, actor_name TEXT,
    ts TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_roster_audit_ts ON roster_audit(ts)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_roster_audit_emp ON roster_audit(emp_id, ts)`);
}

async function seedFromFile(jsonPath) {
  const file = path.resolve(jsonPath);
  if (!fs.existsSync(file)) throw new Error(`Seed file not found: ${file}`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  // Wipe + reload — seed is authoritative for the historical snapshot
  await run('DELETE FROM roster_audit');
  await run('DELETE FROM roster_days');
  await run('DELETE FROM roster_agents');

  let agentsInserted = 0, daysInserted = 0;

  // Agents
  for (const [empId, meta] of Object.entries(data.agents || {})) {
    await run(
      `INSERT INTO roster_agents
       (emp_id, pseudo, full_name, email, designation, doj, contact, alt_contact, shift, status)
       VALUES (?,?,?,?,?,?,?,?,?,'active')`,
      [
        empId,
        meta.pseudo || null,
        meta.full || null,
        meta.email || null,
        meta.designation || null,
        meta.doj || null,
        meta.contact || null,
        meta.alt_contact || null,
        meta.shift || null,
      ]
    );
    agentsInserted++;
  }

  // Days
  for (const [_month, days] of Object.entries(data.roster || {})) {
    for (const [date, statuses] of Object.entries(days)) {
      for (const [empId, status] of Object.entries(statuses)) {
        const canon = VALID_STATUSES.has(status) ? status : 'na';
        await run(
          `INSERT OR REPLACE INTO roster_days (date, emp_id, status, updated_by)
           VALUES (?,?,?,?)`,
          [date, empId, canon, 'seed']
        );
        daysInserted++;
      }
    }
  }

  await run(
    `INSERT INTO roster_audit (action, note, actor_email, actor_name)
     VALUES ('seed', ?, 'system', 'Roster seed')`,
    [`Loaded ${agentsInserted} agents and ${daysInserted} day-records from ${path.basename(file)}`]
  );

  return { agentsInserted, daysInserted };
}

async function listAgents({ includeRelieved = true } = {}) {
  const sql = includeRelieved
    ? `SELECT * FROM roster_agents ORDER BY status='active' DESC, pseudo COLLATE NOCASE`
    : `SELECT * FROM roster_agents WHERE status='active' ORDER BY pseudo COLLATE NOCASE`;
  return all(sql);
}

async function upsertAgent(emp_id, fields, actor = {}) {
  const existing = await get(`SELECT * FROM roster_agents WHERE emp_id = ?`, [emp_id]);
  const cols = ['pseudo','full_name','email','designation','doj','contact','alt_contact','shift','status','notes'];
  const data = {};
  for (const c of cols) if (fields[c] !== undefined) data[c] = fields[c];

  if (existing) {
    const setSql = Object.keys(data).map(k => `${k} = ?`).join(', ');
    if (!setSql) return existing;
    await run(
      `UPDATE roster_agents SET ${setSql}, updated_at = datetime('now') WHERE emp_id = ?`,
      [...Object.values(data), emp_id]
    );
    await run(
      `INSERT INTO roster_audit (emp_id, action, note, actor_email, actor_name)
       VALUES (?, 'agent_update', ?, ?, ?)`,
      [emp_id, JSON.stringify(data), actor.email || null, actor.name || null]
    );
  } else {
    const keys = ['emp_id', ...Object.keys(data)];
    const values = [emp_id, ...Object.values(data)];
    const placeholders = keys.map(() => '?').join(',');
    await run(
      `INSERT INTO roster_agents (${keys.join(',')}) VALUES (${placeholders})`,
      values
    );
    await run(
      `INSERT INTO roster_audit (emp_id, action, note, actor_email, actor_name)
       VALUES (?, 'agent_create', ?, ?, ?)`,
      [emp_id, JSON.stringify(data), actor.email || null, actor.name || null]
    );
  }
  return get(`SELECT * FROM roster_agents WHERE emp_id = ?`, [emp_id]);
}

async function getMonth(yyyy_mm) {
  // 'YYYY-MM' → return { dates: [...], agents: [...], grid: { emp_id → { date → {status, note} } } }
  if (!/^\d{4}-\d{2}$/.test(yyyy_mm)) throw new Error('Bad month format, use YYYY-MM');
  const [y, m] = yyyy_mm.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`);
  }

  const agents = await all(
    `SELECT * FROM roster_agents ORDER BY status='active' DESC, pseudo COLLATE NOCASE`
  );

  const rows = await all(
    `SELECT date, emp_id, status, note FROM roster_days WHERE date >= ? AND date <= ?`,
    [`${yyyy_mm}-01`, `${yyyy_mm}-${String(daysInMonth).padStart(2,'0')}`]
  );

  const grid = {};
  for (const a of agents) grid[a.emp_id] = {};
  for (const r of rows) {
    if (!grid[r.emp_id]) grid[r.emp_id] = {};
    grid[r.emp_id][r.date] = { status: r.status, note: r.note || null };
  }

  return { month: yyyy_mm, dates, agents, grid };
}

async function setDay({ date, emp_id, status, note }, actor = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bad date');
  if (!VALID_STATUSES.has(status)) throw new Error(`Bad status: ${status}`);
  if (!emp_id) throw new Error('emp_id required');

  const prev = await get(
    `SELECT status FROM roster_days WHERE date = ? AND emp_id = ?`,
    [date, emp_id]
  );

  if (status === '' || status == null) {
    await run(`DELETE FROM roster_days WHERE date = ? AND emp_id = ?`, [date, emp_id]);
  } else {
    await run(
      `INSERT INTO roster_days (date, emp_id, status, note, updated_by)
       VALUES (?,?,?,?,?)
       ON CONFLICT(date,emp_id) DO UPDATE SET
         status = excluded.status,
         note   = excluded.note,
         updated_at = datetime('now'),
         updated_by = excluded.updated_by`,
      [date, emp_id, status, note || null, actor.email || null]
    );
  }

  await run(
    `INSERT INTO roster_audit
       (date, emp_id, action, prev_status, new_status, note, actor_email, actor_name)
     VALUES (?,?,?,?,?,?,?,?)`,
    [date, emp_id, 'day_set', prev?.status || null, status || null, note || null,
     actor.email || null, actor.name || null]
  );

  return { date, emp_id, status, note: note || null };
}

async function bulkSet(updates, actor = {}) {
  if (!Array.isArray(updates)) throw new Error('updates must be an array');
  const results = [];
  for (const u of updates) {
    try {
      results.push(await setDay(u, actor));
    } catch (e) {
      results.push({ error: e.message, ...u });
    }
  }
  return results;
}

async function getAudit({ limit = 100, emp_id = null } = {}) {
  const params = [];
  let sql = `SELECT * FROM roster_audit`;
  if (emp_id) { sql += ` WHERE emp_id = ?`; params.push(emp_id); }
  sql += ` ORDER BY id DESC LIMIT ?`;
  params.push(Math.min(500, Math.max(1, Number(limit) || 100)));
  return all(sql, params);
}

async function summary({ from, to } = {}) {
  // Aggregate counts of each status code in a date range, plus per-agent totals
  const start = from || new Date().toISOString().slice(0, 7) + '-01';
  const end   = to   || new Date().toISOString().slice(0, 10);
  const codeRows = await all(
    `SELECT status, COUNT(*) AS n FROM roster_days
      WHERE date >= ? AND date <= ?
      GROUP BY status ORDER BY n DESC`, [start, end]
  );
  const agentRows = await all(
    `SELECT emp_id, status, COUNT(*) AS n FROM roster_days
      WHERE date >= ? AND date <= ?
      GROUP BY emp_id, status`, [start, end]
  );
  const byAgent = {};
  for (const r of agentRows) {
    byAgent[r.emp_id] = byAgent[r.emp_id] || {};
    byAgent[r.emp_id][r.status] = r.n;
  }
  return { from: start, to: end, byStatus: codeRows, byAgent };
}

module.exports = {
  setDB,
  initSchema,
  seedFromFile,
  listAgents,
  upsertAgent,
  getMonth,
  setDay,
  bulkSet,
  getAudit,
  summary,
  STATUS_LABELS,
  VALID_STATUSES,
};
