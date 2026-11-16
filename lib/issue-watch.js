'use strict';
/**
 * Batch 351: repeated-issue watch. Every 5 minutes in business hours it reads the last 30 minutes of client contact
 * from three places: new Desk tickets, live SalesIQ chats and recorded call transcripts (support teams). A light AI
 * model groups them by the problem the client describes, in plain words, so different wording lands in one group.
 * When one problem reaches ISSUE_MIN reports (default 10) from at least ISSUE_MIN_WHO different clients (default 5),
 * it opens an alert that shows as the outage banner inside the tool. Nothing is posted anywhere else.
 * Read-only on Desk, SalesIQ and the warehouse. The AI step runs only when there are at least ISSUE_MIN reports.
 */
let D = {}, _db = null, _running = false, _last = null;
function setDeps(d) { D = Object.assign({}, D, d || {}); }
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS issue_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'active', label TEXT, started_at TEXT, last_at TEXT,
    closed_at TEXT, json TEXT, created_at TEXT DEFAULT (datetime('now')))`);
}
const WINDOW_MIN = Number(process.env.ISSUE_WINDOW_MIN || 30), QUIET_MIN = 45;
const MIN_N = () => Number(process.env.ISSUE_MIN || 10), MIN_WHO = () => Number(process.env.ISSUE_MIN_WHO || 5);
const SUPPORT_TEAMS = ['T1 CS Team', 'VOIP Team', 'Tech CS Team', 'Adit Pay Team'];
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const redact = (s) => String(s || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').replace(/(\+?\d[\d\s().-]{8,}\d)/g, '[phone]');
function businessHours(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  return !['Sat', 'Sun'].includes(p.weekday) && h >= 7 && h < 19;
}
const ct = (iso) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };

function sqlTickets(mins) {
  return `SELECT d.ticket_number, d.web_url, d.contact_account_name AS practice, d.account_id, d.channel, d.created_time, d.subject, left(d.description_text, 500) AS body
    FROM desk_tickets d WHERE d.created_time > now() - interval '${Number(mins)} minutes' AND coalesce(d.is_deleted, false) = false
    AND coalesce(d.is_spam, false) = false ORDER BY d.created_time LIMIT 150`;
}
// Calls: recorded support calls; the start of the transcript is where the client says what is wrong.
function sqlCalls(mins) {
  return `SELECT c.avoma_uuid, c.account_id, c.deal_id, c.team, c.start_at, left(t.full_text, 900) AS body
    FROM call_facts c JOIN shiv_avoma_transcripts t ON t.avoma_uuid = c.avoma_uuid
    WHERE c.source = 'avoma' AND c.kind = 'call' AND c.start_at > now() - interval '${Number(mins)} minutes'
    AND c.team IN (${SUPPORT_TEAMS.map((x) => `'${x}'`).join(', ')}) ORDER BY c.start_at LIMIT 120`;
}

async function gather() {
  const items = [];
  const q = D.query || (() => Promise.resolve({ rows: [] }));
  const [tk, cl] = await Promise.all([q(sqlTickets(WINDOW_MIN), 150).catch(() => ({ rows: [] })), q(sqlCalls(WINDOW_MIN + 15), 120).catch(() => ({ rows: [] }))]);
  for (const r of tk.rows || []) {
    if (/^(re:\s*)?(undelivered mail|auto.?reply|out of office)/i.test(String(r.subject || ''))) continue;
    items.push({ kind: 'Ticket', id: 't' + r.ticket_number, number: String(r.ticket_number), url: r.web_url || '', who: clean(r.practice || r.account_id || ('ticket ' + r.ticket_number), 80),
      at: r.created_time, text: redact(clean(`${r.subject || ''}. ${r.body || ''}`, 420)) });
  }
  for (const r of cl.rows || []) {
    items.push({ kind: 'Call', id: 'c' + String(r.avoma_uuid).slice(0, 12), number: '', url: '', who: clean(r.account_id || r.deal_id || ('call ' + String(r.avoma_uuid).slice(0, 6)), 80),
      team: r.team, at: r.start_at, text: redact(clean(r.body, 600)) });
  }
  try {
    const lc = D.liveChat || require('./live-chat');
    const list = lc.recentAll ? await lc.recentAll() : [];
    const since = Date.now() - WINDOW_MIN * 60000;
    for (const c of list) {
      const t = Number(c.start_time || 0); if (!t || t < since) continue;
      const v = c.visitor || {}, qtext = clean(c.question || '', 400); if (!qtext) continue;
      items.push({ kind: 'Chat', id: 'h' + c.id, number: String(c.reference_id || c.id), url: '', who: clean(v.company_name || (v.info && v.info.company) || v.email || v.name || ('chat ' + c.id), 80),
        at: new Date(t).toISOString(), text: redact(qtext) });
    }
  } catch (e) { /* chats unavailable: tickets and calls still count */ }
  return items;
}

const SYS = `You watch a dental and healthcare software company's support inbox for outages and widespread breakages.
You get client reports from the last 30 minutes (tickets, chats, call transcripts). Group the reports that describe the SAME concrete problem
(for example "phones not ringing / no dial tone", "texts not delivering", "online booking link error", "Adit Pay payments failing").
Rules: only group reports about something broken or not working; ignore how-to questions, billing, meetings, sales, onboarding scheduling and greetings.
Two reports belong together only if a support lead would treat them as one incident. Use short plain labels (max 8 words), no jargon.
Reply with JSON: {"groups":[{"label":"...","product":"Phones|Texting|Fax|Adit Pay|Forms|Scheduling|AI|App/Login|Integration|Other","ids":["..."]}]} . Only include groups with 3 or more reports.`;

async function cluster(items) {
  const ai = D.ai || require('./ai');
  const user = items.map((x) => `${x.id} | ${x.kind} | ${x.who} | ${x.text}`).join('\n').slice(0, 30000);
  const r = await ai.chatJSON({ feature: 'analyze', _feature: 'issue-watch', messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }], maxTokens: 1500, temperature: 0, timeoutMs: 45000 });
  const groups = (r.json && Array.isArray(r.json.groups)) ? r.json.groups : [];
  const byId = new Map(items.map((x) => [x.id, x]));
  return groups.map((g) => ({ label: clean(g.label, 80), product: clean(g.product, 30), items: (g.ids || []).map((i) => byId.get(String(i))).filter(Boolean) }))
    .filter((g) => g.label && g.items.length);
}

// Pure: is this group big enough to be an incident?
function assess(g) {
  const who = new Set(g.items.map((x) => x.who.toLowerCase()));
  const kinds = {}; g.items.forEach((x) => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
  return { spike: g.items.length >= MIN_N() && who.size >= MIN_WHO(), reports: g.items.length, clients: who.size, kinds };
}
function describe(g, a, first) {
  const src = Object.entries(a.kinds).map(([k, n]) => `${n} ${k.toLowerCase()}${n === 1 ? '' : 's'}`).join(', ');
  return {
    kind: 'issue', label: g.label, product: g.product,
    headline: `Possible outage: "${g.label}". ${a.reports} reports from ${a.clients} clients since ${ct(first)} CT (${src}).`,
    sub: 'Seen across tickets, live chats and call recordings in the last ' + WINDOW_MIN + ' minutes.',
    asks: ['Confirm with the owning team (' + (g.product === 'Phones' || g.product === 'Fax' ? 'VoIP' : g.product === 'Adit Pay' ? 'Adit Pay' : 'Dev / product') + ') whether something is down.',
      'Check with the ' + (g.product === 'Phones' || g.product === 'Fax' ? 'VoIP' : g.product === 'Adit Pay' ? 'Adit Pay' : 'owning') + ' team for the parent Outage ticket number, then attach every matching ticket to it as a child. Do not create a new parent.',
      'Give every caller and chat the same short holding message; do not troubleshoot one office at a time.',
      'Log repeat callers and chats as children of the parent so the volume is recorded.'],
    practices: a.clients, reports: a.reports,
    tickets: g.items.slice(-60).map((x) => ({ number: x.number || '', url: x.url, practice: x.who, version: x.kind, kind: x.kind, at: x.at, text: x.text.slice(0, 140) })),
  };
}

async function check({ force = false } = {}) {
  if (_running) return { skipped: 'running' };
  if (!force && !businessHours()) return { skipped: 'outside business hours' };
  _running = true;
  try {
    const items = await gather();
    const nowIso = new Date().toISOString();
    const active = await get(`SELECT * FROM issue_alerts WHERE status = 'active' ORDER BY id DESC LIMIT 1`);
    let groups = [];
    if (items.length >= Math.min(MIN_N(), 6) || active) groups = await cluster(items).catch((e) => { _last = { at: nowIso, error: String(e.message || e).slice(0, 160) }; return []; });
    const scored = groups.map((g) => ({ g, a: assess(g) })).sort((x, y) => y.a.reports - x.a.reports);
    _last = { at: nowIso, items: items.length, groups: scored.slice(0, 5).map((s) => ({ label: s.g.label, reports: s.a.reports, clients: s.a.clients })) };
    if (active) {
      const prev = JSON.parse(active.json || '{}');
      const same = scored.find((s) => s.g.label.toLowerCase() === String(active.label || '').toLowerCase()) || scored.find((s) => s.g.product && s.g.product === prev.product && s.a.reports >= 3);
      if (same) {
        const seen = new Map((prev.tickets || []).map((t) => [t.kind + (t.number || t.at), t]));
        describe(same.g, same.a, prev.first).tickets.forEach((t) => seen.set(t.kind + (t.number || t.at), t));
        const merged = [...seen.values()].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
        const kinds = {}; merged.forEach((t) => { kinds[t.kind] = (kinds[t.kind] || 0) + 1; });
        const clients = new Set(merged.map((t) => String(t.practice).toLowerCase())).size;
        const d = describe({ label: active.label, product: prev.product, items: [] }, { reports: merged.length, clients, kinds }, prev.first);
        const j = Object.assign({}, prev, d, { tickets: merged.slice(-80), first: prev.first, updatedAt: nowIso });
        await run(`UPDATE issue_alerts SET last_at = ?, json = ? WHERE id = ?`, [nowIso, JSON.stringify(j), active.id]);
        return { active: true, updated: active.id, last: _last };
      }
      if (Date.now() - Date.parse(active.last_at) > QUIET_MIN * 60000) {
        await run(`UPDATE issue_alerts SET status = 'over', closed_at = ? WHERE id = ?`, [nowIso, active.id]);
        return { active: false, closed: active.id, last: _last };
      }
      return { active: true, id: active.id, last: _last };
    }
    const top = scored.find((s) => s.a.spike);
    if (!top) return { active: false, last: _last };
    const first = top.g.items.map((x) => x.at).sort()[0];
    const j = Object.assign(describe(top.g, top.a, first), { first, updatedAt: nowIso });
    const r = await run(`INSERT INTO issue_alerts (status, label, started_at, last_at, json) VALUES ('active', ?, ?, ?, ?)`, [top.g.label, first, nowIso, JSON.stringify(j)]);
    return { active: true, opened: r.lastID, last: _last };
  } finally { _running = false; }
}
async function current() {
  const r = await get(`SELECT * FROM issue_alerts WHERE status = 'active' ORDER BY id DESC LIMIT 1`);
  return r ? Object.assign({ id: 'i' + r.id, startedAt: r.started_at, lastAt: r.last_at }, JSON.parse(r.json || '{}')) : null;
}
async function recentAlerts(limit = 20) {
  const rows = await all(`SELECT id, status, label, started_at, last_at, closed_at, json FROM issue_alerts ORDER BY id DESC LIMIT ?`, [Math.min(100, limit)]);
  return rows.map((r) => { const j = JSON.parse(r.json || '{}'); return { id: 'i' + r.id, status: r.status, label: r.label, startedAt: r.started_at, lastAt: r.last_at, closedAt: r.closed_at, headline: j.headline, reports: j.reports, practices: j.practices }; });
}
async function close(id) { await run(`UPDATE issue_alerts SET status = 'over', closed_at = datetime('now') WHERE id = ? AND status = 'active'`, [Number(String(id).replace(/^i/, ''))]); return { closed: id }; }
const lastRun = () => _last;
module.exports = { setDeps, setDB, initSchema, check, current, recentAlerts, close, lastRun, assess, describe, businessHours, _gather: gather, _cluster: cluster, _sqlTickets: sqlTickets, _sqlCalls: sqlCalls };
