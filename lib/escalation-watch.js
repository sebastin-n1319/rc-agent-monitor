/**
 * Escalation watch (Session 90).
 *
 * T1 agents do not always report escalations. Every 15 minutes this reads
 * what T1 handled (ticket replies, customer messages and private comments,
 * and T1 calls recorded in Avoma or RingCentral), looks for the escalation
 * triggers in Adit's escalation process (frustration with lack of
 * resolution, ongoing issues, missed follow-up, cancellation or port out,
 * legal threat), and posts an alert to a Google Chat webhook:
 *   - client already escalated  -> alert with the existing ESC id, tier and owner
 *   - de-escalated within 60 days -> reopen that ESC (per the process)
 *   - nothing on record         -> new escalation, with a summary to file
 * Then it checks CRM after a few hours and reminds once if nothing was
 * created or updated ("not reported").
 *
 * Data: AditKB (desk_ticket_threads, desk_ticket_comments, desk_tickets,
 * call_facts, shiv_avoma_transcripts, unit_summaries, crm_escalations) and the
 * app's own desk_ticket_activity / desk_ticket_snapshot to find candidates.
 * Tables: esc_settings, esc_signals, esc_seen.
 */
let _db = null;
let _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign(_deps, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').replace(/[\u2014\u2013]/g, ',').replace(/\s+/g, ' ').trim().slice(0, n);
const chatSafe = (s, n) => clean(s, n).replace(/[<>*_~`]/g, '');
const stripHtml = (x) => String(x || '').replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
// Tags line: Google Chat webhooks only notify for <users/ID> (or <users/all>), so emails are turned
// into that form using the Google ID stored when the person signed in to this tool.
async function tagLine(raw) {
  const parts = clean(raw, 400).split(/[\s,;]+/).filter(Boolean).slice(0, 15);
  const out = [], unresolved = [];
  for (let t of parts) {
    t = t.replace(/^<|>$/g, '');
    if (/^(users\/)?all$/i.test(t) || /^@all$/i.test(t)) out.push('<users/all>');
    else if (/^users\/\d+$/.test(t)) out.push(`<${t}>`);
    else if (/^\d{6,}$/.test(t)) out.push(`<users/${t}>`);
    else if (/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(t)) {
      let id = null;
      if (_deps.resolveChatId) { try { id = await _deps.resolveChatId(t.toLowerCase()); } catch (e) { id = null; } }
      if (id) out.push(`<users/${String(id).replace(/^users\//, '')}>`);
      else { out.push('@' + t.split('@')[0]); unresolved.push(t.toLowerCase()); }
    } else out.push(t.replace(/[<>*_~`]/g, ''));
  }
  return { text: out.join(' '), unresolved };
}
const HOOK_RE = /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^\s]+$/;

const DEFAULTS = {
  enabled: '0',            // off until a webhook is saved
  webhook: '',
  tags: '',                // free text put at the top of every alert (user IDs, names)
  reminder_hours: '2',
  min_confidence: '0.6',
  dedupe_hours: '12',
};
const TRIGGERS = /\b(cancel\w*|terminat\w*|port(ing)?\s*(out|away|our number)|switch(ing)?\s+(to|provider|compan)|leav(e|ing)\s+adit|another (provider|company|vendor)|not renew|end (the|our) contract|refund|chargeback|dispute|lawyer|attorney|legal|sue|lawsuit|bbb|review (online|on google)|escalat\w*|manager|supervisor|owner of (the )?company|frustrat\w*|upset|angry|unacceptable|ridiculous|terrible|horrible|worst|disappoint\w*|fed up|waste of|not happy|unhappy|nothing works|still (not|broken|no|waiting|having)|again and again|(second|third|fourth|3rd|4th) time|for (weeks|months)|no one (has )?(called|replied|responded|got back)|never (heard|got|received) back|keeps? (happening|breaking|dropping)|every (day|week)|ongoing issue|losing (patients|money|business))\b/i;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS esc_settings (key TEXT PRIMARY KEY, value TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS esc_seen (key TEXT PRIMARY KEY, fp TEXT, checked_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS esc_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, source_key TEXT, ticket_number TEXT, ticket_url TEXT, call_label TEXT,
    account_id TEXT, deal_id TEXT, account_name TEXT, deal_stage TEXT, csm TEXT, ob_owner TEXT,
    agent_email TEXT, agent_name TEXT, kind TEXT, esc_name TEXT, esc_status TEXT, esc_owner TEXT, esc_id TEXT,
    tier_suggestion TEXT, signals TEXT, summary TEXT, quote TEXT, confidence REAL, via TEXT,
    status TEXT NOT NULL DEFAULT 'alerted', post_ok INTEGER, post_error TEXT, reported_esc TEXT, reported_at TEXT, reminded_at TEXT,
    detected_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS esc_reads (day TEXT NOT NULL, agent_email TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, agent_email, kind))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_esc_signals_acct ON esc_signals(account_id, detected_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_esc_signals_status ON esc_signals(status, detected_at)`);
  for (const [k, v] of Object.entries(DEFAULTS)) if ((await getSetting(k)) == null) await setSetting(k, v);
  if ((await getSetting('scan_from')) == null) await setSetting('scan_from', new Date(Date.now() - 2 * 3600e3).toISOString());
}
async function getSetting(k) { const r = await get(`SELECT value FROM esc_settings WHERE key = ?`, [k]); return r ? r.value : null; }
async function setSetting(k, v) { await run(`INSERT OR REPLACE INTO esc_settings (key, value) VALUES (?, ?)`, [k, v == null ? null : String(v)]); }
async function settings(includeSecret) {
  const hook = (await getSetting('webhook')) || '';
  return {
    enabled: (await getSetting('enabled')) === '1',
    webhookSet: !!hook, webhookMasked: hook ? hook.replace(/(key=)[^&]+/, '$1....').replace(/(token=)[^&]+/, '$1....').slice(0, 90) : '',
    webhook: includeSecret ? hook : undefined,
    tags: (await getSetting('tags')) || '',
    reminderHours: Math.max(1, Number(await getSetting('reminder_hours')) || 2),
    minConfidence: Math.min(0.95, Math.max(0.3, Number(await getSetting('min_confidence')) || 0.6)),
    dedupeHours: Math.max(1, Number(await getSetting('dedupe_hours')) || 12),
    lastScanAt: await getSetting('last_scan_at'), lastScanResult: await getSetting('last_scan_result'),
    access: JSON.parse((await getSetting('access')) || '{}'),
  };
}
async function saveSettings(b) {
  if (typeof b.webhook === 'string') {
    const u = b.webhook.trim();
    if (u && !HOOK_RE.test(u)) throw fail('That does not look like a Google Chat webhook URL (it starts with https://chat.googleapis.com/v1/spaces/).');
    if (u) await setSetting('webhook', u);
  }
  if (b.clearWebhook) await setSetting('webhook', '');
  if (typeof b.tags === 'string') await setSetting('tags', clean(b.tags, 400));
  if (b.reminderHours != null) await setSetting('reminder_hours', String(Math.max(1, Math.min(48, Number(b.reminderHours) || 2))));
  if (b.minConfidence != null) await setSetting('min_confidence', String(Math.max(0.3, Math.min(0.95, Number(b.minConfidence) || 0.6))));
  if (b.dedupeHours != null) await setSetting('dedupe_hours', String(Math.max(1, Math.min(72, Number(b.dedupeHours) || 12))));
  if (typeof b.enabled === 'boolean') {
    if (b.enabled && !(await getSetting('webhook'))) throw fail('Add the Google Chat webhook first');
    await setSetting('enabled', b.enabled ? '1' : '0');
    if (b.enabled) await setSetting('scan_from', new Date(Date.now() - 2 * 3600e3).toISOString());
  }
  return settings(false);
}

// ── AditKB ───────────────────────────────────────────────────────────────
const KB = 'https://aditkb-production.up.railway.app';
function kbKey() { return process.env.ADITKB_ESC_API_KEY || process.env.ADITKB_ACTIVITY_API_KEY || process.env.ADITKB_API_KEY || ''; }
const _access = {};
async function kb(table, { select, filters = [], order_by, desc, limit = 200 } = {}) {
  const url = new URL(`${KB}/v1/tables/${table}/rows`);
  if (select) url.searchParams.set('select', select);
  if (order_by) url.searchParams.set('order_by', order_by);
  if (desc != null) url.searchParams.set('desc', String(desc));
  url.searchParams.set('limit', String(limit));
  for (const f of filters) url.searchParams.append('filter', f);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${kbKey()}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    _access[table] = `HTTP ${res.status}`;
    const e = new Error(`AditKB ${table}: HTTP ${res.status} ${body.slice(0, 160)}`); e.status = res.status; throw e;
  }
  _access[table] = 'ok';
  const j = await res.json();
  return j.rows || [];
}
// AditKB returns nothing for a ">= today" bound on some tables; widen to yesterday (see lib/aditkb-service.js).
function clampBound(iso) {
  const ms = Date.parse(iso), now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return ms < start ? new Date(ms).toISOString() : new Date(start - 864e5).toISOString();
}

// ── candidates ───────────────────────────────────────────────────────────
async function ticketCandidates(fromIso, emails) {
  if (!emails.length) return [];
  const ph = emails.map(() => '?').join(',');
  const ids = new Set();
  try {
    for (const r of await all(`SELECT DISTINCT ticket_id FROM desk_ticket_activity WHERE author_email IN (${ph}) AND created_time >= ? AND source IN ('thread','comment')`, [...emails, fromIso])) ids.add(String(r.ticket_id));
    for (const r of await all(`SELECT ticket_id FROM desk_ticket_snapshot WHERE assignee_email IN (${ph}) AND modified_time >= ?`, [...emails, fromIso])) ids.add(String(r.ticket_id));
  } catch (e) { /* tables may be missing on a fresh install */ }
  return [...ids].slice(0, 150);
}
async function ticketContext(ticketId) {
  const [threads, comments, trow] = await Promise.all([
    kb('desk_ticket_threads', { select: 'direction,author_name,author_email,channel,summary,content,created_time', filters: [`ticket_id:eq:${ticketId}`], order_by: 'created_time', desc: true, limit: 14 }).then(rows => { _access['desk_ticket_threads'] = 'ok'; return rows; }),
    kb('desk_ticket_comments', { select: 'author_name,author_email,is_private,content,created_time', filters: [`ticket_id:eq:${ticketId}`], order_by: 'created_time', desc: true, limit: 8 }).catch(() => []),
    kb('desk_tickets', { select: 'id,ticket_number,subject,channel,web_url,status,aria_account_id,aria_deal_id,contact_account_name,assignee_email,assignee_name,cf_deal_stage,cf_csm_account_manager,cf_onboarding_owner,cf_escalations_status', filters: [`id:eq:${ticketId}`], limit: 1 }).then(r => r[0] || null).catch(() => null),
  ]);
  const items = [];
  for (const t of threads) {
    const chat = /CHAT/i.test(String(t.channel || ''));
    const txt = stripHtml(t.content || t.summary);
    items.push({ at: t.created_time, who: chat ? 'SALESIQ CHAT TRANSCRIPT' : String(t.direction) === 'in' ? 'CUSTOMER' : `AGENT ${t.author_name || ''}`.trim(), email: lc(t.author_email), inbound: String(t.direction) === 'in', chat,
      text: chat ? (txt.length > 6000 ? txt.slice(0, 2500) + ' ... ' + txt.slice(-3500) : txt) : txt.slice(0, 1200) });
  }
  for (const c of comments) items.push({ at: c.created_time, who: `${c.is_private ? 'PRIVATE NOTE' : 'NOTE'} by ${c.author_name || ''}`.trim(), email: lc(c.author_email), inbound: false, text: stripHtml(c.content).slice(0, 900) });
  items.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  return { items, ticket: trow };
}

// ── escalation records in CRM ────────────────────────────────────────────
const ESC_SELECT = 'id,account_id,deal_id,account_name,deal_name,owner_name,created_time,modified_time,j_name,j_escalation_status,j_tier_1_stage,j_tier_2_stage,j_de_escalation_date,j_int_esc_notes_last_updated,j_latest_escalation';
async function escalationsFor({ accountId, dealId, accountName }) {
  let rows = [];
  if (accountId) rows = await kb('crm_escalations', { select: ESC_SELECT, filters: [`account_id:eq:${accountId}`], order_by: 'created_time', desc: true, limit: 20 }).catch(() => []);
  if (!rows.length && dealId) rows = await kb('crm_escalations', { select: ESC_SELECT, filters: [`deal_id:eq:${dealId}`], order_by: 'created_time', desc: true, limit: 20 }).catch(() => []);
  if (!rows.length && accountName) rows = await kb('crm_escalations', { select: ESC_SELECT, filters: [`account_name:eq:${accountName}`], order_by: 'created_time', desc: true, limit: 20 }).catch(() => []);
  return rows;
}
function classifyEscalations(rows) {
  const active = rows.find(r => !/de-?escalat|churn/i.test(String(r.j_escalation_status || '')));
  if (active) return { kind: 'existing', esc: active };
  const recent = rows.find(r => r.j_de_escalation_date && Date.now() - Date.parse(r.j_de_escalation_date) < 60 * 864e5);
  if (recent) return { kind: 'reopen', esc: recent };
  return { kind: 'new', esc: null };
}

// ── AI read ──────────────────────────────────────────────────────────────
const SYSTEM = `You watch a dental software company's T1 support conversations for clients who should be escalated.
Escalate when the client is frustrated by lack of resolution, has ongoing or repeated issues, complains about missing follow-up from support, mentions cancelling, porting numbers out, switching providers, not renewing, refunds or chargebacks, or mentions lawyers, legal action or public reviews.
Tier 1: the client can likely be saved. Tier 2: the client asked to cancel or port out, or there is little chance to save them.
Do not escalate routine how-to questions, simple bugs the client is calm about, or a single small delay.
Return JSON only: {"escalate": true|false, "confidence": 0 to 1, "tier": "Tier 1"|"Tier 2", "signals": ["short labels like Cancellation risk, Frustrated with lack of resolution, Ongoing issue, Missed follow-up, Legal threat, Port out"], "concerns": ["product area or issue, few words each"], "summary": "2 to 3 plain sentences: what the client is upset about, what has happened so far, what is still open", "quote": "one short exact client quote that shows it, or empty"}.
No em dashes. Do not invent facts.`;
function keywordRead(text) {
  const m = TRIGGERS.exec(text || '');
  if (!m) return null;
  const strong = /cancel|terminat|port|lawyer|attorney|legal|sue|chargeback|refund|switch|leav/i.test(m[0]);
  return { escalate: true, confidence: strong ? 0.65 : 0.45, tier: /cancel|terminat|port/i.test(m[0]) ? 'Tier 2' : 'Tier 1', signals: [strong ? 'Cancellation or legal risk' : 'Frustration'], concerns: [], summary: '', quote: m[0], via: 'keywords' };
}
async function aiRead(body) {
  const ai = _deps.ai;
  if (!ai || !ai.anyConfigured || !ai.anyConfigured()) return null;
  try {
    const r = await ai.bestJSON({ system: SYSTEM, user: body.slice(0, 9000), maxTokens: 700, feature: 'analyze', timeoutMs: 45000 });
    const j = r && r.json;
    if (!j || typeof j.escalate !== 'boolean') return null;
    return { escalate: j.escalate, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)), tier: /2/.test(String(j.tier)) ? 'Tier 2' : 'Tier 1',
      signals: (Array.isArray(j.signals) ? j.signals : []).slice(0, 5).map(x => clean(x, 50)).filter(Boolean),
      concerns: (Array.isArray(j.concerns) ? j.concerns : []).slice(0, 5).map(x => clean(x, 50)).filter(Boolean),
      summary: clean(j.summary, 600), quote: clean(j.quote, 200), via: 'ai' };
  } catch (e) { return null; }
}

// ── alert ────────────────────────────────────────────────────────────────
async function postToChat(text) {
  const hook = await getSetting('webhook');
  if (!hook) return { ok: false, error: 'No webhook set' };
  try {
    const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ text: text.slice(0, 4000) }), signal: AbortSignal.timeout(15000) });
    return r.ok ? { ok: true } : { ok: false, error: `Google Chat returned HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: 'Could not reach Google Chat' }; }
}
function alertText(s, tags) {
  const head = s.kind === 'existing' ? `⚠️ *Escalated client reporting again: ${chatSafe(s.esc_name, 20)} (${chatSafe(s.esc_status, 20)})*`
    : s.kind === 'reopen' ? `⚠️ *Escalation signal, recently de-escalated: reopen ${chatSafe(s.esc_name, 20)}*`
    : `🚨 *New escalation signal from T1 (no escalation on record)*`;
  const lines = [];
  if (tags) lines.push(tags);
  lines.push(head);
  lines.push(`*Client:* ${chatSafe(s.account_name || (s.account_id ? 'CRM account ' + s.account_id : 'Unknown account'), 90)}${s.deal_stage ? ' (' + chatSafe(s.deal_stage, 30) + ')' : ''}`);
  const owners = [s.csm ? 'CSM: ' + chatSafe(s.csm, 40) : '', s.ob_owner ? 'Onboarding: ' + chatSafe(s.ob_owner, 40) : '', s.esc_owner ? 'ESC owner: ' + chatSafe(s.esc_owner, 40) : ''].filter(Boolean);
  if (owners.length) lines.push(owners.join(' | '));
  lines.push(`*Source:* ${s.source !== 'call' ? (s.source === 'chat' ? 'SalesIQ chat, ticket #' : 'Ticket #') + chatSafe(s.ticket_number, 20) : chatSafe(s.call_label || 'Call', 90)}, handled by ${chatSafe(s.agent_name || s.agent_email || 'T1 agent', 50)}`);
  const sig = JSON.parse(s.signals || '[]');
  if (sig.length) lines.push(`*Signals:* ${sig.map(x => chatSafe(x, 50)).join(', ')}${s.tier_suggestion && s.kind !== 'existing' ? ' | Suggested: ' + s.tier_suggestion : ''}`);
  if (s.summary) { lines.push(''); lines.push(chatSafe(s.summary, 600)); }
  if (s.quote) lines.push(`Client said: "${chatSafe(s.quote, 200)}"`);
  lines.push('');
  lines.push(s.kind === 'existing' ? `Next step: add this to ${chatSafe(s.esc_name, 20)} notes in CRM (date, source, ticket link) and move it to Ongoing Issues if needed.`
    : s.kind === 'reopen' ? `Next step: reopen ${chatSafe(s.esc_name, 20)} in CRM (de-escalated under 60 days ago) and add today's notes.`
    : `Next step: create a ${s.tier_suggestion || 'Tier 1'} escalation on the deal in CRM (Escalations module) with this summary, source and ticket link.`);
  if (s.ticket_url) lines.push(`Ticket: ${s.ticket_url}`);
  lines.push(`_Detected ${s.via === 'ai' ? 'by AI' : 'by keywords'} from T1 conversations. Confidence ${Math.round((s.confidence || 0) * 100)}%._`);
  return lines.join('\n');
}
function reminderText(s, tags) {
  const lines = [];
  if (tags) lines.push(tags);
  lines.push(`⏰ *Escalation not reported yet*`);
  lines.push(`${chatSafe(s.account_name || (s.account_id ? 'CRM account ' + s.account_id : 'Unknown account'), 90)}: ${s.kind === 'new' ? 'no escalation was created in CRM' : 'no update on ' + chatSafe(s.esc_name, 20) + ' in CRM'} since the alert ${Math.round((Date.now() - Date.parse(String(s.detected_at).replace(' ', 'T') + 'Z')) / 3600e3)} h ago.`);
  lines.push(`Handled by ${chatSafe(s.agent_name || s.agent_email || 'T1 agent', 50)}. ${s.source !== 'call' ? (s.source === 'chat' ? 'SalesIQ chat, ticket #' : 'Ticket #') + chatSafe(s.ticket_number, 20) : chatSafe(s.call_label || 'Call', 90)}${s.ticket_url ? ': ' + s.ticket_url : ''}`);
  return lines.join('\n');
}

// ── scan ─────────────────────────────────────────────────────────────────
let _scanning = false;
async function countRead(agent, kind) {
  if (!agent) return;
  await run(`INSERT INTO esc_reads (day, agent_email, kind, n) VALUES (date('now'), ?, ?, 1) ON CONFLICT(day, agent_email, kind) DO UPDATE SET n = n + 1`, [agent, kind]).catch(() => {});
}
async function recordSignal(base, read, accountInfo, settingsNow) {
  // one alert per account per dedupe window (a Tier 2 signal after a Tier 1 alert still posts)
  if (accountInfo.accountId || accountInfo.accountName) {
    const prev = await get(`SELECT * FROM esc_signals WHERE (account_id = ? OR (account_id IS NULL AND account_name = ?)) AND detected_at >= datetime('now', ?) ORDER BY id DESC LIMIT 1`,
      [accountInfo.accountId || '', accountInfo.accountName || '', `-${settingsNow.dedupeHours} hours`]);
    if (prev && !(read.tier === 'Tier 2' && prev.tier_suggestion !== 'Tier 2')) return { skipped: 'dedupe' };
  }
  const rows = await escalationsFor(accountInfo);
  const c = classifyEscalations(rows);
  if (!accountInfo.accountName && rows[0] && rows[0].account_name) accountInfo.accountName = rows[0].account_name;
  const s = {
    ...base, account_id: accountInfo.accountId || null, deal_id: accountInfo.dealId || null, account_name: accountInfo.accountName || null,
    deal_stage: accountInfo.dealStage || null, csm: accountInfo.csm || null, ob_owner: accountInfo.obOwner || null,
    kind: c.kind, esc_name: c.esc ? c.esc.j_name : null, esc_status: c.esc ? c.esc.j_escalation_status : null, esc_owner: c.esc ? c.esc.owner_name : null, esc_id: c.esc ? c.esc.id : null,
    tier_suggestion: read.tier, signals: JSON.stringify(read.signals || []), summary: read.summary || null, quote: read.quote || null, confidence: read.confidence, via: read.via,
  };
  const post = await postToChat(alertText(s, (await tagLine(settingsNow.tags)).text));
  await run(`INSERT INTO esc_signals (source, source_key, ticket_number, ticket_url, call_label, account_id, deal_id, account_name, deal_stage, csm, ob_owner, agent_email, agent_name,
      kind, esc_name, esc_status, esc_owner, esc_id, tier_suggestion, signals, summary, quote, confidence, via, status, post_ok, post_error)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'alerted',?,?)`,
    [s.source, s.source_key, s.ticket_number || null, s.ticket_url || null, s.call_label || null, s.account_id, s.deal_id, s.account_name, s.deal_stage, s.csm, s.ob_owner, s.agent_email || null, s.agent_name || null,
      s.kind, s.esc_name, s.esc_status, s.esc_owner, s.esc_id, s.tier_suggestion, s.signals, s.summary, s.quote, s.confidence, s.via, post.ok ? 1 : 0, post.error || null]);
  return { alerted: true, ok: post.ok };
}
async function scan({ force = false } = {}) {
  if (_scanning) return { busy: true };
  _scanning = true;
  const out = { tickets: 0, calls: 0, read: 0, alerts: 0, reminders: 0, errors: [] };
  try {
    const st = await settings(true);
    if (!st.enabled && !force) return { skipped: 'off' };
    if (!kbKey()) return { error: 'No AditKB key on the server' };
    const roster = _deps.roster ? await _deps.roster().catch(() => ({ emails: [], agentNames: {} })) : { emails: [], agentNames: {} };
    const emails = (roster.emails || []).map(lc), names = roster.agentNames || {};
    const fromIso = (await getSetting('scan_from')) || new Date(Date.now() - 2 * 3600e3).toISOString();
    const startedAt = new Date().toISOString();
    const minConf = st.minConfidence;

    // Tickets
    for (const tid of await ticketCandidates(fromIso, emails)) {
      try {
        const ctx = await ticketContext(tid);
        if (!ctx.items.length) continue;
        const fp = ctx.items[ctx.items.length - 1].at + '|' + ctx.items.length;
        const seen = await get(`SELECT fp FROM esc_seen WHERE key = ?`, ['T' + tid]);
        if (seen && seen.fp === fp) continue;
        await run(`INSERT OR REPLACE INTO esc_seen (key, fp, checked_at) VALUES (?,?,datetime('now'))`, ['T' + tid, fp]);
        out.tickets++;
        const t = ctx.ticket || {};
        const agentEmail = lc(t.assignee_email) && emails.includes(lc(t.assignee_email)) ? lc(t.assignee_email) : ((ctx.items.slice().reverse().find(i => emails.includes(i.email)) || {}).email || null);
        const isChat = /chat/i.test(String(t.channel || '')) || ctx.items.some(i => i.chat);
        await countRead(agentEmail, isChat ? 'chat' : 'ticket');
        const recent = ctx.items.filter(i => !seen || String(i.at || '') >= fromIso);
        const textAll = ctx.items.map(i => `[${i.who} ${String(i.at || '').slice(0, 16)}] ${i.text}`).join('\n');
        if (!TRIGGERS.test(recent.map(i => i.text).join(' '))) continue; // cheap gate before AI
        const body = `TICKET #${t.ticket_number || ''} (${t.channel || ''}) ${t.subject || ''}\nCLIENT: ${t.contact_account_name || ''}\n\n${textAll}`;
        const read = (await aiRead(body)) || keywordRead(recent.map(i => i.text).join(' '));
        out.read++;
        if (!read || !read.escalate || read.confidence < minConf) continue;
        const r = await recordSignal({ source: isChat ? 'chat' : 'ticket', source_key: 'T' + tid, ticket_number: t.ticket_number, ticket_url: t.web_url, agent_email: agentEmail, agent_name: agentEmail ? names[agentEmail] : (t.assignee_name || null) },
          read, { accountId: t.aria_account_id, dealId: t.aria_deal_id, accountName: t.contact_account_name, dealStage: t.cf_deal_stage, csm: t.cf_csm_account_manager, obOwner: t.cf_onboarding_owner }, st);
        if (r.alerted) out.alerts++;
      } catch (e) { if (out.errors.length < 5) out.errors.push(`ticket ${tid}: ${e.message}`); }
    }

    // Calls (Avoma and RingCentral recordings by T1)
    try {
      const calls = await kb('call_facts', { select: 'call_key,source,avoma_uuid,subject,start_at,duration_seconds,organizer_email,account_id,deal_id,has_transcript,deal_stage,csm,tech_ob_owner,team',
        filters: [`team:eq:T1 CS Team`, `start_at:gte:${clampBound(fromIso)}`], order_by: 'start_at', desc: true, limit: 400 });
      for (const c of calls) {
        if (Date.parse(c.start_at) < Date.parse(fromIso) - 6 * 3600e3) continue;
        if (!emails.includes(lc(c.organizer_email))) continue; // AditKB's T1 team tag also covers people outside the T1 roster
        const seen = await get(`SELECT fp FROM esc_seen WHERE key = ?`, ['C' + c.call_key]);
        if (seen) continue;
        if (!c.has_transcript) { if (Date.now() - Date.parse(c.start_at) > 6 * 3600e3) await run(`INSERT OR REPLACE INTO esc_seen (key, fp) VALUES (?, 'no-transcript')`, ['C' + c.call_key]); continue; }
        await run(`INSERT OR REPLACE INTO esc_seen (key, fp) VALUES (?, 'read')`, ['C' + c.call_key]);
        out.calls++;
        await countRead(lc(c.organizer_email), 'call');
        let text = '';
        if (c.avoma_uuid) {
          const tr = await kb('shiv_avoma_transcripts', { select: 'full_text', filters: [`avoma_uuid:eq:${c.avoma_uuid}`], limit: 1 }).catch(() => []);
          text = (tr[0] && tr[0].full_text) || '';
        }
        if (!text) {
          const us = await kb('unit_summaries', { select: 'summary', filters: [`unit_key:eq:${c.call_key}`], limit: 1 }).catch(() => []);
          text = (us[0] && us[0].summary) || '';
        }
        if (!text || !TRIGGERS.test(text)) continue;
        const short = text.length > 9000 ? text.slice(0, 5000) + '\n...\n' + text.slice(-3500) : text;
        const read = (await aiRead(`CALL: ${c.subject || ''} on ${String(c.start_at).slice(0, 16)} (${Math.round((c.duration_seconds || 0) / 60)} min)\n\n${short}`)) || keywordRead(text);
        out.read++;
        if (!read || !read.escalate || read.confidence < minConf) continue;
        const ag = lc(c.organizer_email);
        const r = await recordSignal({ source: 'call', source_key: 'C' + c.call_key, call_label: `${c.source === 'avoma' ? 'Avoma' : 'RingCentral'} call: ${clean(c.subject, 70)} (${new Date(c.start_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT, ${Math.round((c.duration_seconds || 0) / 60)} min)`, agent_email: ag || null, agent_name: names[ag] || null },
          read, { accountId: c.account_id, dealId: c.deal_id, accountName: null, dealStage: c.deal_stage, csm: c.csm, obOwner: c.tech_ob_owner }, st);
        if (r.alerted) out.alerts++;
      }
    } catch (e) { out.errors.push('calls: ' + e.message); }

    out.reminders = await reminders(st);
    await setSetting('scan_from', startedAt);
    await setSetting('last_scan_at', new Date().toISOString());
    await setSetting('last_scan_result', JSON.stringify(out));
    await setSetting('access', JSON.stringify(_access));
    return out;
  } finally { _scanning = false; }
}

/** Was it reported? New: an escalation created for the account after the alert. Existing or
 *  reopen: the ESC record modified or its notes updated after the alert. One reminder each. */
async function reminders(st) {
  const due = await all(`SELECT * FROM esc_signals WHERE status IN ('alerted','not_reported') AND detected_at >= datetime('now','-3 days') ORDER BY id`);
  let n = 0;
  for (const s of due) {
    const detected = Date.parse(String(s.detected_at).replace(' ', 'T') + 'Z');
    if (Date.now() - detected < st.reminderHours * 3600e3 && s.status === 'alerted') continue;
    let reported = null;
    try {
      const rows = await escalationsFor({ accountId: s.account_id, dealId: s.deal_id, accountName: s.account_name });
      for (const r of rows) {
        const created = Date.parse(r.created_time), modified = Date.parse(r.modified_time), notes = Date.parse(r.j_int_esc_notes_last_updated || '');
        if (s.kind === 'new' && created >= detected - 3600e3) { reported = r.j_name; break; }
        if (s.kind !== 'new' && (r.id === s.esc_id || !s.esc_id) && ((modified >= detected) || (notes && notes >= detected - 864e5 / 2))) { reported = r.j_name; break; }
      }
    } catch (e) { continue; }
    if (reported) {
      await run(`UPDATE esc_signals SET status = ?, reported_esc = ?, reported_at = datetime('now') WHERE id = ?`, [s.status === 'not_reported' ? 'late_reported' : 'reported', reported, s.id]);
      continue;
    }
    if (s.status === 'alerted') {
      await postToChat(reminderText(s, (await tagLine(st.tags)).text));
      await run(`UPDATE esc_signals SET status = 'not_reported', reminded_at = datetime('now') WHERE id = ?`, [s.id]);
      n++;
    }
  }
  return n;
}

async function list({ days = 7 } = {}) {
  const rows = await all(`SELECT * FROM esc_signals WHERE detected_at >= datetime('now', ?) ORDER BY id DESC LIMIT 300`, [`-${Math.max(1, Math.min(90, days))} days`]);
  const byAgent = {};
  for (const r of rows) {
    const k = r.agent_email || 'unknown';
    const o = byAgent[k] = byAgent[k] || { email: k, name: r.agent_name || k.split('@')[0], alerts: 0, reported: 0, notReported: 0 };
    o.alerts++; if (/reported/.test(r.status) && r.status !== 'not_reported') o.reported++; if (r.status === 'not_reported') o.notReported++;
  }
  return { signals: rows.map(r => ({ ...r, signals: JSON.parse(r.signals || '[]') })), agents: Object.values(byAgent).sort((a, b) => b.notReported - a.notReported || b.alerts - a.alerts) };
}
/** Who is watched, and what was read for each in the last N days. */
async function coverage({ days = 7 } = {}) {
  const roster = _deps.roster ? await _deps.roster().catch(() => ({ emails: [], agentNames: {} })) : { emails: [], agentNames: {} };
  const rows = await all(`SELECT agent_email, kind, SUM(n) n FROM esc_reads WHERE day >= date('now', ?) GROUP BY agent_email, kind`, [`-${Math.max(1, Math.min(90, days))} days`]);
  const by = {};
  for (const r of rows) (by[r.agent_email] = by[r.agent_email] || {})[r.kind] = r.n;
  return (roster.emails || []).map(e => ({ email: lc(e), name: (roster.agentNames || {})[e] || lc(e).split('@')[0], tickets: (by[lc(e)] || {}).ticket || 0, chats: (by[lc(e)] || {}).chat || 0, calls: (by[lc(e)] || {}).call || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function markReported(id, by, escName) {
  await run(`UPDATE esc_signals SET status = 'reported', reported_esc = COALESCE(?, reported_esc), reported_at = datetime('now') WHERE id = ?`, [clean(escName, 30) || null, id]);
}
async function dismiss(id) { await run(`UPDATE esc_signals SET status = 'dismissed' WHERE id = ?`, [id]); }
async function testPost(by) {
  const t = await tagLine(await getSetting('tags'));
  const r = await postToChat(`${t.text ? t.text + '\n' : ''}✅ Escalation watch is connected. Alerts about T1 escalation signals will post here. (Test sent by ${chatSafe(by, 60)})`);
  return { ...r, tags: t.text, unresolved: t.unresolved };
}

module.exports = { coverage, tagLine, setDB, setDeps, initSchema, settings, saveSettings, scan, list, markReported, dismiss, testPost, TRIGGERS };
