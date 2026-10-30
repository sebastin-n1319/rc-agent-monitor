'use strict';
/**
 * Batch 197: Open T1 ticket review (admins, Adit Expert > Open tickets).
 * Lists every ticket in the T1 view of Zoho Desk (team "T1 - Customer Support", status anything but Closed) and has
 * Adit Expert review each one: the whole Desk record (messages, call and chat notes, internal notes, history,
 * screenshots, attachments, the Desk fields), the client's earlier tickets, the CRM and account analysis, the Help
 * Center and the team rules, and the linked Asana task when ASANA_ACCESS_TOKEN is set. It suggests: close, keep open
 * (and what it waits for), act now, or hand over. Suggestions only: nothing is ever changed in Zoho Desk.
 * A ticket is reviewed again only when it changed in Desk since the last review (or on request).
 */
const T1_TEAM = process.env.T1_TEAM_ID || '197800000052125116';
const T1_DEPT = process.env.T1_DEPT_ID || '197800000000006907';
const VERDICTS = ['close', 'wait', 'act', 'handover'];
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const clean = (s, n = 600) => String(s == null ? '' : s).replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
const days = (iso, now = Date.now()) => { const t = Date.parse(iso); return isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 864e5)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_triage (ticket_id TEXT PRIMARY KEY, number TEXT, subject TEXT, status TEXT, status_type TEXT,
    owner TEXT, channel TEXT, created TEXT, modified TEXT, client_at TEXT, asana TEXT, web_url TEXT, in_view INTEGER DEFAULT 1, seen_at TEXT,
    verdict TEXT, result_json TEXT, analysed_at TEXT, analysed_modified TEXT, error TEXT, by_email TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS expert_triage_state (k TEXT PRIMARY KEY, v TEXT)`);
  // Batch 199: the reviewer's call on each suggestion, and what the review learns from it
  // Batch 200: Asana change tracking and the lasting read cache
  for (const col of ['asana_gids TEXT', 'asana_seen TEXT', 'asana_changed INTEGER DEFAULT 0']) await run(`ALTER TABLE expert_triage ADD COLUMN ${col}`).catch(() => {});
  await run(`CREATE TABLE IF NOT EXISTS expert_cache (k TEXT PRIMARY KEY, v TEXT, at INTEGER)`);
  for (const col of ['reviewer_verdict TEXT', 'reviewer_comment TEXT', 'reviewer_by TEXT', 'reviewer_at TEXT', 'reviewer_modified TEXT', 'feedback_id INTEGER']) await run(`ALTER TABLE expert_triage ADD COLUMN ${col}`).catch(() => {});
  await run(`CREATE TABLE IF NOT EXISTS expert_triage_lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, number TEXT, ai_verdict TEXT, reviewer_verdict TEXT, agree INTEGER,
    comment TEXT, lesson TEXT, ai_reply TEXT, status TEXT NOT NULL DEFAULT 'active', by_email TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
}
async function getState(k, d = null) { const r = await get(`SELECT v FROM expert_triage_state WHERE k = ?`, [k]).catch(() => null); return r ? r.v : d; }
async function setState(k, v) { await run(`INSERT INTO expert_triage_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, String(v)]); }

// ── The T1 view from Desk ──────────────────────────────────────────────
let _statuses = null, _agents = null;
async function openStatuses() {
  if (_statuses && Date.now() - _statuses.at < 6 * 3600e3) return _statuses.list;
  let list = null;
  try {
    const j = await D.desk.fetchRaw('/organizationFields?module=tickets');
    const f = ((j && j.data) || []).find((x) => x.apiName === 'status');
    if (f && f.allowedValues) list = f.allowedValues.map((v) => v.value).filter((v) => v && v !== 'Closed');
  } catch (e) { /* use the known list */ }
  if (!list || !list.length) list = ['Open', 'On Hold', 'Escalated', 'Pending Adit', 'Pending Customer', 'Under Observation', 'Pending Meeting', 'Pending with T2', 'Pending Whitelisting', 'Dispute',
    'Pending Customer Response', 'Approved', 'Rejected', 'Under Review', 'Resolution Follow-up', 'Missing Information', 'Pending UA/Live Access', 'Working', 'Pending Carrier', 'Pending Review - T1'];
  _statuses = { at: Date.now(), list };
  return list;
}
async function agentNames() {
  if (_agents && Date.now() - _agents.at < 6 * 3600e3) return _agents.map;
  const map = new Map();
  for (let from = 0; from < 1000; from += 200) {
    const j = await D.desk.fetchRaw(`/agents?limit=200&from=${from}`).catch(() => null);
    const d = (j && j.data) || [];
    d.forEach((a) => map.set(String(a.id), [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || ''));
    if (d.length < 200) break;
  }
  _agents = { at: Date.now(), map };
  return map;
}
const FIELDS = 'ticketNumber,subject,status,statusType,channel,createdTime,modifiedTime,customerResponseTime,webUrl,assigneeId,cf_asana_task_link';
let _listing = null;
/** Reads the T1 view from Desk and stores it. Tickets that left the view (closed or moved) are marked out of view. */
async function refreshList() {
  if (_listing) return _listing;
  _listing = (async () => {
    if (!D.desk || !D.desk.isConfigured()) throw Object.assign(new Error('Zoho Desk is not set up'), { status: 503 });
    const st = (await openStatuses()).map(encodeURIComponent).join(',');
    const rows = [];
    for (let from = 0; from < 2000; from += 100) {
      const j = await D.desk.fetchRaw(`/tickets?departmentId=${T1_DEPT}&teamIds=${T1_TEAM}&status=${st}&limit=100&from=${from}&fields=${FIELDS}`);
      const d = (j && j.data) || [];
      rows.push(...d.filter((t) => t.status !== 'Closed'));
      if (d.length < 100) break;
    }
    const names = await agentNames().catch(() => new Map());
    const now = new Date().toISOString();
    for (const t of rows) {
      const cf = t.cf || {};
      await run(`INSERT INTO expert_triage (ticket_id, number, subject, status, status_type, owner, channel, created, modified, client_at, asana, web_url, in_view, seen_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(ticket_id) DO UPDATE SET number=excluded.number, subject=excluded.subject, status=excluded.status,
        status_type=excluded.status_type, owner=excluded.owner, channel=excluded.channel, created=excluded.created, modified=excluded.modified,
        client_at=excluded.client_at, asana=excluded.asana, web_url=excluded.web_url, in_view=1, seen_at=excluded.seen_at`,
      [String(t.id), String(t.ticketNumber), clean(t.subject, 300), t.status || '', t.statusType || '', t.assigneeId ? (names.get(String(t.assigneeId)) || '') : '',
        t.channel || '', t.createdTime || '', t.modifiedTime || '', t.customerResponseTime || '', cf.cf_asana_task_link || '', t.webUrl || '', now]);
    }
    await run(`UPDATE expert_triage SET in_view = 0 WHERE in_view = 1 AND (seen_at IS NULL OR seen_at < ?)`, [now]);
    await setState('listed_at', now);
    return { count: rows.length, at: now };
  })();
  try { return await _listing; } finally { _listing = null; }
}

// ── Asana (only with ASANA_ACCESS_TOKEN) ───────────────────────────────
function asanaGid(link) {
  const s = String(link || '');
  const m = s.match(/\/task\/(\d{6,})/) || s.match(/\/item\/(\d{6,})/) || s.match(/app\.asana\.com\/0\/\d+\/(\d{6,})/) || s.match(/(\d{12,})(?:\/f)?\/?(?:\?|$)/);
  return m ? m[1] : null;
}
async function asanaTask(link) {
  const tok = process.env.ASANA_ACCESS_TOKEN, gid = asanaGid(link);
  if (!gid) return null;
  if (!tok) return { gid, read: false, err: 'no Asana token set' };
  const H = { Authorization: 'Bearer ' + tok, Accept: 'application/json' };
  const go = (p) => fetch('https://app.asana.com/api/1.0' + p, { headers: H, signal: AbortSignal.timeout(15000) }).then(async (r) => {
    if (r.ok) return r.json();
    const why = r.status === 401 ? 'the Asana token is not valid' : r.status === 403 || r.status === 404 ? 'the Asana token cannot see this task (not shared with its owner)' : 'Asana ' + r.status;
    throw new Error(why);
  });
  const [t, s] = await Promise.all([
    go(`/tasks/${gid}?opt_fields=name,completed,completed_at,due_on,modified_at,assignee.name,notes,num_subtasks,memberships.section.name,memberships.project.name,custom_fields.name,custom_fields.display_value`),
    go(`/tasks/${gid}/stories?limit=100&opt_fields=type,resource_subtype,text,created_at,created_by.name`).catch(() => ({ data: [] })),
  ]);
  const d = t.data || {};
  // Batch 199: every update (comments, moves between columns, assignments, completion), newest last
  const updates = (s.data || []).filter((x) => x.text && x.resource_subtype !== 'sticker_added').slice(-14)
    .map((x) => `${String(x.created_at || '').slice(0, 10)} ${(x.created_by && x.created_by.name) || 'Asana'}${x.type === 'comment' ? ' commented' : ''}: ${clean(String(x.text).replace(/https:\/\/app\.asana\.com\/\S*profile\/\d+/g, '@someone').replace(/https:\/\/app\.asana\.com\/app\/asana\/-\/get_asset\S*/g, '[image]'), 600)}`);
  const sections = (d.memberships || []).map((m) => [m.project && m.project.name, m.section && m.section.name].filter(Boolean).join(' > ')).filter(Boolean);
  const cfs = (d.custom_fields || []).filter((c) => c.display_value).slice(0, 8).map((c) => `${c.name}: ${clean(c.display_value, 80)}`);
  const doneColumn = (d.memberships || []).some((m) => m.section && /\b(complete|completed|done|closed|resolved|fixed)\b/i.test(m.section.name || ''));
  return { gid, read: true, name: clean(d.name, 200), completed: !!d.completed, doneColumn, completedAt: d.completed_at || '', due: d.due_on || '', modified: d.modified_at || '', assignee: (d.assignee && d.assignee.name) || '',
    sections, fields: cfs, notes: clean(d.notes, 1200), updates };
}
function asanaText(a) {
  if (!a) return '';
  if (!a.read) return `Asana task ${a.gid} is linked, but it could not be read (${a.err || 'unknown reason'}). Judge from the Desk fields and the notes, and say the Asana status must be checked by hand.`;
  const state = a.completed ? 'COMPLETED (ticked)' + (a.completedAt ? ' on ' + a.completedAt.slice(0, 10) : '') : a.doneColumn ? 'DONE: the task sits in a done column, although it is not ticked complete' : 'open';
  return [`Asana task ${a.gid}: ${a.name}`, `State: ${state}${a.due ? ', due ' + a.due : ''}${a.assignee ? ', assignee ' + a.assignee : ''}${a.modified ? ', last changed ' + a.modified.slice(0, 10) : ''}`,
    a.sections.length ? 'Board column: ' + a.sections.join('; ') : '', a.fields.length ? 'Fields: ' + a.fields.join('; ') : '', a.notes ? 'Description: ' + a.notes : '',
    a.updates.length ? 'Updates and comments (oldest first):\n- ' + a.updates.join('\n- ') : 'No updates or comments on the task.'].filter(Boolean).join('\n');
}

// ── The review ─────────────────────────────────────────────────────────
const SYS = `You are Adit Expert reviewing an OPEN Zoho Desk ticket that sits with the T1 Customer Support team at Adit (dental practice software: texting, calls and VoIP, reminders, forms, payments, reviews, scheduling, EHR sync, AI front desk). A support lead uses your review to decide what to do with each open ticket. Read the whole record carefully and in detail: every message, call and chat note, internal note, the history, screenshot descriptions, attachments, Desk fields, the client's earlier tickets, the CRM and account picture, the Asana task, the Help Center matches and the team rules.

Decide ONE verdict:
- "close": nothing is left to do. The issue is solved and the client confirmed or did not come back after being told it was fixed, OR the client stopped replying after the agent's follow-ups (say how many follow-ups over how many days), OR it is a duplicate, spam, an automatic message or a ticket opened by mistake, OR the request was completed by another team. Never close while the client's latest message is unanswered, while an Asana or development task linked to it is still open, or while the client is waiting on Adit.
- "wait": keep it open, it is correctly waiting: on the client for something only the office can give, on a scheduled meeting, on an open Asana or development task, on a carrier or port, or under observation for a short agreed period. Say what it waits for, since when, and when to check again.
- "act": T1 must do something now: the client's latest message is unanswered, a promised update or follow-up is overdue, an Asana task is completed but the client was not told, the status is wrong for where it stands, or a Help Center covered step was not done.
- "handover": T1 cannot finish it and it is not with the right owner: escalation, cancellation or port-out (goes to the account CSM or the escalation manager), billing, development or a team T1 does not cover. T1 never moves a ticket to another team itself: it sets the status to Pending Review - T1 so a reviewer moves it. T1 cannot make outbound calls: a call back goes to VoIP.

Asana: a task counts as done when it is ticked complete OR sits in a done column (Completed, Done, Closed), OR the last comments say the work was done. When the work is done and nobody told the client, the verdict is "act": tell the client. When it is open, check the last update date: no update for more than 7 days on a client-facing request means "act" (chase the task owner).

Rules: anything a Help Center article covers is done by T1 itself. Follow the team rules given. Use only facts in the record; never invent a company rule, a date or a fix. If the record is too thin to be sure, say so and lower the confidence. Plain English, short sentences, no em or en dashes.

The reviewer reads "short" and "action" first and decides in seconds: make them plain and decisive, no hedging. Put the detail in the other fields.

Reply with JSON:
{"verdict":"close|wait|act|handover","confidence":"high|medium|low",
"short":"one sentence, at most 25 words: why (for wait: what it is waiting for and since when)",
"action":"one instruction, at most 20 words, starting with a verb (for wait: 'Nothing now, check again on <date>')",
"headline":"one line under 120 characters: what to do with the ticket and why",
"why":"a detailed account in 4 to 8 sentences: what the client needed, what was tried, what the files and screenshots showed, what is still open and where it stands now",
"timeline":["the key events in order with dates (client asks, agent replies, transfers, Asana updates, promises made), 3 to 10 lines"],
"files":["what each attached file or screenshot shows and what it means for the ticket, one line each, or empty"],
"promises":["anything the agent or Adit promised the client and whether it was kept, or empty"],
"waiting_on":"client|adit team|asana or development|T1 agent|nobody",
"status_now":"is the current Desk status right? 'ok' or the status it should be in and why",
"next":["the next steps for the agent, in order (1 to 4)"],
"client_message":"a short ready to send message to the client when one is due now (a follow-up, an update, a closing note), else ''. Start 'Hi there,' and end 'Thanks,'. Never mention internal teams, tiers, statuses or Asana.",
"internal_note":"one or two lines for the Desk private note: the verdict and the evidence",
"evidence":["3 to 6 short facts with dates that support the verdict"],
"asana":"what the Asana task shows and what it means for this ticket, or ''",
"risk":"churn, escalation, repeat problem or CSAT risk seen, or ''",
"kb":"the Help Center article that covers it, or ''"}`;

function facts(tk, row) {
  const tl = tk.timeline || [], now = Date.now();
  const client = tl.filter((x) => x.kind === 'client'), agent = tl.filter((x) => x.kind === 'agent');
  const lastC = client.slice(-1)[0], lastA = agent.slice(-1)[0];
  const after = lastC ? agent.filter((x) => Date.parse(x.at) > Date.parse(lastC.at)).length : agent.length;
  const m = tk.meta;
  return [`Today: ${new Date().toISOString().slice(0, 10)}.`,
    `Open ${days(m.created, now)} days. Status "${m.status}" (${m.statusType || '?'}), owner ${m.owner || row.owner || 'unassigned'}, channel ${m.channel || '?'}.`,
    lastC ? `Client last wrote ${days(lastC.at, now)} days ago (${String(lastC.at).slice(0, 10)}).` : 'No message from the client on the ticket.',
    lastA ? `Agent last wrote ${days(lastA.at, now)} days ago (${String(lastA.at).slice(0, 10)}).` : 'No agent reply on the ticket yet.',
    lastC ? `Agent messages since the client's last message: ${after}.` : '',
    `Last change in Desk ${days(row.modified || m.created, now)} days ago.`,
    lastC && lastA && Date.parse(lastC.at) > Date.parse(lastA.at) ? "The client's latest message has NOT been answered." : '',
  ].filter(Boolean).join('\n');
}

function shape(j) {
  const arr = (x, n, m) => (Array.isArray(x) ? x : []).map((v) => clean(typeof v === 'string' ? v : JSON.stringify(v), m)).filter(Boolean).slice(0, n);
  const v = VERDICTS.includes(String(j.verdict || '').toLowerCase()) ? String(j.verdict).toLowerCase() : 'act';
  return { verdict: v, confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium', short: clean(j.short, 220), action: clean(j.action, 180), headline: clean(j.headline, 160), why: clean(j.why, 2000),
    waiting_on: clean(j.waiting_on, 60), status_now: clean(j.status_now, 240), next: arr(j.next, 5, 280), client_message: String(j.client_message || '').replace(/[\u2014\u2013]/g, ',').slice(0, 1500).trim(),
    internal_note: clean(j.internal_note, 700), evidence: arr(j.evidence, 8, 260), timeline: arr(j.timeline, 12, 260), files: arr(j.files, 10, 400), promises: arr(j.promises, 5, 260), asana: clean(j.asana, 500), risk: clean(j.risk, 300), kb: clean(j.kb, 200) };
}

async function analyse(ticketId, { by = 'system' } = {}) {
  const row = await get(`SELECT * FROM expert_triage WHERE ticket_id = ?`, [String(ticketId)]);
  if (!row) throw Object.assign(new Error('Ticket not in the T1 list'), { status: 404 });
  if (!D.ai || !D.ai.anyConfigured()) throw Object.assign(new Error('The AI is not set up'), { status: 503 });
  try {
    const tk = await withTimeout(D.ticket.load(row.number, { deep: true }), 150000);
    const F = tk.meta.fields || {};
    const [crm, asanas, kb, rules, lessons] = await Promise.all([
      withTimeout(D.expert.crmContext(row.number), 30000).catch(() => null),
      Promise.all(Array.from(new Set([F.asana, row.asana].concat(tk.meta.asanaLinks || []).map(asanaGid).filter(Boolean))).slice(0, 3)
        .map((g) => withTimeout(asanaTask('https://app.asana.com/0/0/' + g), 20000).catch((e) => ({ gid: g, read: false, err: e.message })))),
      D.expert.searchLocal([tk.meta.subject, String(tk.lastClient || '').slice(0, 300)], { limit: 4, maxChars: 5000, srcs: ['kb'] }).catch(() => []),
      D.expert.rules().catch(() => []),
      activeLessons().catch(() => []),
    ]);
    const asana = asanas.filter(Boolean)[0] || null;
    const user = [
      'Facts worked out from the record:\n' + facts(tk, row),
      'Team rules:\n' + rules.map((r) => `- ${r.title}: ${r.body}`).join('\n'),
      lessons.length ? 'What reviewers taught you on earlier tickets (follow these unless this ticket is clearly different):\n' + lessons.map((l) => `- ${l.lesson}`).join('\n') : '',
      '[TICKET]\n' + tk.text,
      crm && crm.text ? '[CRM AND ACCOUNT]\n' + crm.text : '[CRM AND ACCOUNT]\nNot found.',
      asanas.filter(Boolean).length ? '[ASANA]\n' + asanas.filter(Boolean).map(asanaText).join('\n\n') : '',
      kb.length ? '[HELP CENTER MATCHES]\n' + kb.map((c) => `${c.module} > ${c.title}${c.section ? ' > ' + c.section : ''}${c.url ? ' (' + c.url + ')' : ''}\n${String(c.text).slice(0, 900)}`).join('\n\n') : '',
    ].filter(Boolean).join('\n\n');
    let r;
    try { r = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON({ system: SYS, user, maxTokens: 6000, timeoutMs: 120000 }) : await D.ai.bestJSON({ system: SYS, user, maxTokens: 6000, timeoutMs: 120000 }); }
    catch (e) { r = await D.ai.bestJSON({ system: SYS, user, maxTokens: 6000, timeoutMs: 120000 }); }
    const out = shape(r.json || {});
    out.meta = { owner: tk.meta.owner || row.owner, account: tk.meta.account, module: tk.meta.module, images: tk.images, files: (tk.docs || []).length, messages: tk.msgCount, notes: tk.commentCount,
      asanaRead: !!(asana && asana.read), asanaDone: asana && asana.read ? (asana.completed || asana.doneColumn) : null, asanaErr: asana && !asana.read ? asana.err || '' : '', asanaLink: asana ? 'https://app.asana.com/0/0/' + asana.gid : '', crm: !!(crm && crm.text), csm: crm && crm.facts ? crm.facts.csm : (tk.meta.csm || ''),
      facts: facts(tk, row).split('\n').slice(1) };
    if (row.reviewer_verdict && (row.reviewer_modified || '') !== (row.modified || '')) await run(`UPDATE expert_triage SET reviewer_verdict = NULL, reviewer_comment = NULL, reviewer_by = NULL, reviewer_at = NULL, feedback_id = NULL WHERE ticket_id = ?`, [row.ticket_id]);
    const readA = asanas.filter((a) => a && a.read);
    await run(`UPDATE expert_triage SET verdict = ?, result_json = ?, analysed_at = ?, analysed_modified = ?, error = NULL, by_email = ?, owner = COALESCE(NULLIF(?, ''), owner), status = ?, asana_gids = ?, asana_seen = ?, asana_changed = 0 WHERE ticket_id = ?`,
      [out.verdict, JSON.stringify(out), new Date().toISOString(), row.modified || '', by, tk.meta.owner || '', tk.meta.status || row.status,
        asanas.filter(Boolean).map((a) => a.gid).join(','), readA.map((a) => a.modified || '').sort().pop() || '', row.ticket_id]);
    return out;
  } catch (e) {
    await run(`UPDATE expert_triage SET error = ?, analysed_at = ? WHERE ticket_id = ?`, [clean(e.message, 200), new Date().toISOString(), row.ticket_id]).catch(() => {});
    throw e;
  }
}

// ── Reviewer feedback: the review learns, and pushes back when the record says otherwise ──
async function activeLessons() {
  return all(`SELECT lesson FROM expert_triage_lessons WHERE status = 'active' AND lesson IS NOT NULL AND lesson != '' ORDER BY id DESC LIMIT 40`);
}
const FB_SYS = `You are Adit Expert. A support lead (the reviewer) checked your suggestion on an open T1 ticket and gave feedback. Reviewers know the process well but can also be wrong: check their point against the ticket record, the Asana task and the team rules before you accept it.
- If the record supports the reviewer, say so plainly and name what you missed.
- If the record contradicts the reviewer, say so politely and quote the facts with dates (for example the client's unanswered message, an Asana comment that says it is done, a follow-up count).
- If both have a point, say which part each got right.
Then write the lesson that should guide future reviews if the reviewer's view is applied: one general sentence about the kind of ticket, not about this client (for example "Pending Adit tickets whose Asana task is in the Completed column need the client told the same day"). Leave it empty when there is nothing general to learn. Plain English, no em or en dashes.
Reply with JSON: {"reviewer_right":"yes|partly|no","reply":"2 to 4 sentences to the reviewer","lesson":"one sentence or ''","final_verdict":"close|wait|act|handover"}`;

async function feedback(ticketId, { agree = false, verdict = '', comment = '', by = '' } = {}) {
  const row = await get(`SELECT * FROM expert_triage WHERE ticket_id = ?`, [String(ticketId)]);
  if (!row || !row.result_json) throw Object.assign(new Error('Review the ticket first'), { status: 400 });
  const res = JSON.parse(row.result_json);
  const rv = agree ? res.verdict : String(verdict || '').toLowerCase();
  if (!VERDICTS.includes(rv)) throw Object.assign(new Error('Pick the right call'), { status: 400 });
  comment = clean(comment, 1500);
  if (!agree && !comment) throw Object.assign(new Error('Say why, so the review can learn'), { status: 400 });
  const now = new Date().toISOString();
  let out = { reviewer_right: 'yes', reply: '', lesson: '', final_verdict: rv };
  if (comment) {
    const tk = await withTimeout(D.ticket.load(row.number, { deep: true }), 150000).catch(() => null);
    const asanas = tk ? await Promise.all(Array.from(new Set([row.asana].concat(tk.meta.asanaLinks || []).map(asanaGid).filter(Boolean))).slice(0, 3)
      .map((g) => withTimeout(asanaTask('https://app.asana.com/0/0/' + g), 20000).catch((e) => ({ gid: g, read: false, err: e.message })))) : [];
    const user = [`Your suggestion: ${res.verdict} (${res.confidence}). ${res.short || res.headline}\nWhy: ${res.why}\nEvidence: ${(res.evidence || []).join('; ')}`,
      `Reviewer ${agree ? 'AGREES with the verdict' : 'says the right call is "' + rv + '"'}. Their comment: ${comment}`,
      tk ? 'Facts:\n' + facts(tk, row) : '', asanas.filter(Boolean).length ? '[ASANA]\n' + asanas.filter(Boolean).map(asanaText).join('\n\n') : '',
      tk ? '[TICKET]\n' + String(tk.text).slice(0, 40000) : '[TICKET]\nCould not be loaded; judge from your earlier review.'].filter(Boolean).join('\n\n');
    try { const r = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON({ system: FB_SYS, user, maxTokens: 1500, timeoutMs: 90000 }) : await D.ai.bestJSON({ system: FB_SYS, user, maxTokens: 1500, timeoutMs: 90000 }); out = Object.assign(out, r.json || {}); }
    catch (e) { out.reply = 'Saved. The AI could not check this feedback just now.'; }
  }
  const right = ['yes', 'partly', 'no'].includes(out.reviewer_right) ? out.reviewer_right : 'yes';
  const status = !comment ? 'agree' : right === 'no' ? 'disputed' : 'active';
  const ins = await run(`INSERT INTO expert_triage_lessons (ticket_id, number, ai_verdict, reviewer_verdict, agree, comment, lesson, ai_reply, status, by_email) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [row.ticket_id, row.number, res.verdict, rv, agree ? 1 : 0, comment, clean(out.lesson, 400), clean(out.reply, 900), status, by]);
  await run(`UPDATE expert_triage SET reviewer_verdict = ?, reviewer_comment = ?, reviewer_by = ?, reviewer_at = ?, reviewer_modified = ?, feedback_id = ? WHERE ticket_id = ?`,
    [rv, comment, by, now, row.modified || '', ins.lastID, row.ticket_id]);
  return { status, reviewerRight: right, reply: clean(out.reply, 900), lesson: clean(out.lesson, 400), id: ins.lastID };
}
/** A disputed point: keep the reviewer's call (the lesson is used) or accept the AI's (dropped). remove: stop using a lesson. */
async function settle(id, action, by) {
  const l = await get(`SELECT * FROM expert_triage_lessons WHERE id = ?`, [Number(id)]);
  if (!l) throw Object.assign(new Error('Not found'), { status: 404 });
  if (action === 'keep') await run(`UPDATE expert_triage_lessons SET status = 'active', updated_at = datetime('now') WHERE id = ?`, [l.id]);
  else if (action === 'accept_ai') {
    await run(`UPDATE expert_triage_lessons SET status = 'dropped', updated_at = datetime('now') WHERE id = ?`, [l.id]);
    await run(`UPDATE expert_triage SET reviewer_verdict = NULL, reviewer_comment = NULL, reviewer_by = NULL, reviewer_at = NULL, feedback_id = NULL WHERE ticket_id = ? AND feedback_id = ?`, [l.ticket_id, l.id]);
  } else if (action === 'remove') await run(`UPDATE expert_triage_lessons SET status = 'removed', updated_at = datetime('now') WHERE id = ?`, [l.id]);
  else throw Object.assign(new Error('Unknown action'), { status: 400 });
  return { ok: true };
}
async function lessons() {
  return all(`SELECT id, number, ai_verdict, reviewer_verdict, agree, comment, lesson, ai_reply, status, by_email, created_at FROM expert_triage_lessons WHERE status IN ('active', 'disputed') AND (lesson != '' OR status = 'disputed') ORDER BY id DESC LIMIT 100`);
}

// ── Background queue ───────────────────────────────────────────────────
const Q = { running: false, done: 0, failed: 0, total: 0, current: null, startedAt: null, finishedAt: null, stop: false };
/** Reviews every ticket in the view that is new, changed in Desk since its last review, or failed last time (all: every ticket). */
// Batch 200: reviews are kept ready on their own. Every 5 minutes the queue takes what needs a (new) review, most
// important first: never reviewed, changed in Desk, Asana task changed, failed (retried after an hour), and any review
// older than a day (facts like "no reply for N days" move on). An hourly cap and the Desk rate-limit pause keep it within limits.
const PER_HOUR = Math.max(5, Number(process.env.TRIAGE_PER_HOUR || 60));
const _doneAt = [];
function budgetLeft() { const h = Date.now() - 3600e3; while (_doneAt.length && _doneAt[0] < h) _doneAt.shift(); return Math.max(0, PER_HOUR - _doneAt.length); }
async function pending(limit, everything) {
  const hourAgo = new Date(Date.now() - 3600e3).toISOString(), dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
  return all(`SELECT ticket_id, number, CASE WHEN verdict IS NULL AND error IS NULL THEN 0 WHEN COALESCE(analysed_modified, '') != COALESCE(modified, '') THEN 1
      WHEN asana_changed = 1 THEN 2 WHEN error IS NOT NULL THEN 3 ELSE 4 END AS pr
    FROM expert_triage WHERE in_view = 1 ${everything ? '' : `AND (verdict IS NULL OR COALESCE(analysed_modified, '') != COALESCE(modified, '') OR asana_changed = 1
      OR (error IS NOT NULL AND analysed_at < ?) OR analysed_at IS NULL OR analysed_at < ?)`}
    ORDER BY pr, modified DESC LIMIT ?`, everything ? [limit] : [hourAgo, dayAgo, limit]);
}
async function runAll({ all: everything = false, by = 'system', auto = false } = {}) {
  if (Q.running) return status();
  const limit = auto ? budgetLeft() : 1000;
  if (!limit) return status();
  const rows = await pending(limit, everything);
  if (!rows.length) return status();
  Object.assign(Q, { running: true, done: 0, failed: 0, total: rows.length, current: null, startedAt: new Date().toISOString(), finishedAt: null, stop: false, auto });
  (async () => {
    let i = 0;
    const worker = async () => {
      while (i < rows.length && !Q.stop) {
        const rl = D.desk.getRateLimitState ? D.desk.getRateLimitState() : { paused: false };
        if (rl.paused) { if (auto) { Q.stop = true; break; } await sleep(Math.min(rl.resumesInMs + 1000, 15 * 60e3)); }
        const r = rows[i++]; Q.current = r.number;
        try { await analyse(r.ticket_id, { by }); Q.done++; } catch (e) { Q.failed++; }
        _doneAt.push(Date.now());
        await sleep(2000); // easy on the Desk API
      }
    };
    await Promise.all([worker(), worker()]); // two at a time
    Q.running = false; Q.current = null; Q.finishedAt = new Date().toISOString();
    await setState('run_at', Q.finishedAt).catch(() => {});
    if (Q.total) console.log(`🗂️ Open T1 ticket review${auto ? ' (auto)' : ''}: ${Q.done} reviewed, ${Q.failed} failed of ${Q.total}`);
  })().catch((e) => { Q.running = false; console.warn('ticket triage run:', e.message); });
  return status();
}
/** Marks tickets whose Asana task changed since their last review (one light Asana call per task, every 30 minutes). */
async function checkAsana() {
  const tok = process.env.ASANA_ACCESS_TOKEN; if (!tok) return { checked: 0 };
  const rows = await all(`SELECT ticket_id, asana_gids, asana_seen FROM expert_triage WHERE in_view = 1 AND asana_gids IS NOT NULL AND asana_gids != '' AND COALESCE(asana_changed, 0) = 0`);
  let checked = 0, changed = 0;
  for (const r of rows) {
    let latest = '';
    for (const g of r.asana_gids.split(',').filter(Boolean).slice(0, 3)) {
      const j = await fetch(`https://app.asana.com/api/1.0/tasks/${g}?opt_fields=modified_at`, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(10000) }).then((x) => x.ok ? x.json() : null).catch(() => null);
      checked++; const m = j && j.data && j.data.modified_at; if (m && m > latest) latest = m;
      await sleep(450); // well under Asana's 150 requests a minute
    }
    if (latest && latest > (r.asana_seen || '')) { changed++; await run(`UPDATE expert_triage SET asana_changed = 1 WHERE ticket_id = ?`, [r.ticket_id]); }
  }
  return { checked, changed };
}
/** The lasting cache behind the ticket reader (messages, notes, files, screenshot readings). */
const cache = {
  async get(k, ttlMs) { const r = await get(`SELECT v, at FROM expert_cache WHERE k = ?`, [k]); if (!r) return null; if (ttlMs && Date.now() - r.at > ttlMs) return null; try { return JSON.parse(r.v); } catch (e) { return null; } },
  async set(k, v) { await run(`INSERT INTO expert_cache (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`, [k, JSON.stringify(v), Date.now()]); },
  async prune() { await run(`DELETE FROM expert_cache WHERE at < ?`, [Date.now() - 90 * 864e5]); },
};
function stop() { Q.stop = true; return status(); }
function status() { const { stop: _s, ...q } = Q; return q; }

async function list() {
  const rows = await all(`SELECT * FROM expert_triage WHERE in_view = 1 ORDER BY modified DESC`);
  const fbIds = rows.map((r) => r.feedback_id).filter(Boolean), fbById = {};
  if (fbIds.length) (await all(`SELECT id, status, ai_reply, lesson FROM expert_triage_lessons WHERE id IN (${fbIds.map(() => '?').join(',')})`, fbIds)).forEach((f) => { fbById[f.id] = { id: f.id, status: f.status, reply: f.ai_reply, lesson: f.lesson }; });
  const now = Date.now();
  return {
    rows: rows.map((r) => {
      let res = null; try { res = r.result_json ? JSON.parse(r.result_json) : null; } catch (e) { res = null; }
      return { id: r.ticket_id, number: r.number, subject: r.subject, status: r.status, owner: r.owner, channel: r.channel, created: r.created, modified: r.modified,
        age: days(r.created, now), idle: days(r.modified, now), asana: r.asana || '', url: r.web_url, verdict: r.verdict, result: res, analysedAt: r.analysed_at,
        stale: !!(r.verdict && (r.analysed_modified || '') !== (r.modified || '')), error: r.error,
        reviewer: r.reviewer_verdict ? { verdict: r.reviewer_verdict, comment: r.reviewer_comment || '', by: r.reviewer_by || '', at: r.reviewer_at, fb: fbById[r.feedback_id] || null } : null };
    }),
    lessons: await lessons(),
    listedAt: await getState('listed_at'), runAt: await getState('run_at'), queue: status(), perHour: PER_HOUR, asana: !!process.env.ASANA_ACCESS_TOKEN,
  };
}

module.exports = { setDB, setDeps, initSchema, refreshList, analyse, feedback, settle, lessons, runAll, checkAsana, cache, stop, status, list, getState, setState, _asanaGid: asanaGid, _asanaTask: asanaTask, _asanaText: asanaText, _shape: shape, VERDICTS };
