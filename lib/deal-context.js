'use strict';
/**
 * Deal context for the Transfer review queue.
 *  quick(ticketId)   one line of CRM facts for the waiting tile: account, deal, stage, CSM, escalation status.
 *  detail(ticketId)  what opens when the tile is clicked: issue history, unsolved queries, mood,
 *                    modules usually reported, ticket journey, agents who worked tickets, FCR and CSAT.
 * Source is AditKB (desk_tickets, crm_deals, crm_escalations and the written account analysis in theses).
 * Every read is cached and fails soft, so a missing table never breaks the review page.
 */
const clean = (s, n = 400) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const stripRefs = (s) => String(s || '').replace(/\s*\[[A-Za-z]?[\w:#@./-]+(?:\]\[[\w:#@./-]+)*\]/g, '').replace(/\s{2,}/g, ' ').trim();
const lc = (s) => String(s || '').trim().toLowerCase();

let _rawKb = null;
function setKb(fn) { _rawKb = fn; }
// The AditKB database has a small connection pool shared with other tools, so reads here go through a tiny queue
// (two at a time) and retry once when the server says it is out of connections.
let _active = 0; const _waitQ = [];
function limited(fn) {
  return new Promise((resolve, reject) => {
    const go = () => { _active++; fn().then(resolve, reject).finally(() => { _active--; const n = _waitQ.shift(); if (n) n(); }); };
    if (_active < 2) go(); else _waitQ.push(go);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function _kb(table, opts) {
  if (!_rawKb) throw new Error('AditKB not configured');
  return limited(async () => {
    try { return await _rawKb(table, opts); }
    catch (e) { if (e && (e.status === 500 || e.status === 503 || e.status === 429)) { await sleep(800); return _rawKb(table, opts); } throw e; }
  });
}

const _cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await fn();
  _cache.set(key, { at: Date.now(), v });
  if (_cache.size > 400) _cache.delete(_cache.keys().next().value);
  return v;
}

// Columns the Escalation watch already reads with the same key, so this list is known to be allowed.
const BASE_SELECT = 'id,ticket_number,subject,created_time,channel,web_url,status,aria_account_id,aria_deal_id,contact_account_name,assignee_name,cf_deal_stage,cf_csm_account_manager,cf_onboarding_owner,cf_escalations_status';
let _lastErr = null;
const note = (e) => { _lastErr = e && e.message ? String(e.message).slice(0, 200) : String(e); };

/** Try the wide column list first, fall back to the narrow one so a column the key cannot read never hides the whole row. */
async function kbTry(table, wide, narrow, opts) {
  try { return await _kb(table, Object.assign({ select: wide }, opts)); }
  catch (e) { note(e); }
  return _kb(table, Object.assign({ select: narrow }, opts));
}

async function ticketRow(ticketId) {
  if (!_rawKb || !ticketId) return null;
  const key = 't:' + ticketId, hit = _cache.get(key);
  if (hit && hit.v && Date.now() - hit.at < 30 * 60000) return hit.v;
  let r = [];
  try { r = await _kb('desk_tickets', { select: BASE_SELECT, filters: [`id:eq:${ticketId}`], limit: 1 }); }
  catch (e) { note(e); r = []; }
  const row = r[0] || null;
  if (row) _cache.set(key, { at: Date.now(), v: row });   // never cache a miss
  return row;
}
async function dealName(dealId) {
  if (!dealId || !_rawKb) return null;
  const hit = _cache.get('d:' + dealId);
  if (hit && Date.now() - hit.at < (hit.v ? 6 * 3600000 : 600000)) return hit.v || null;
  const r = await _kb('crm_deals', { select: 'id,deal_name,stage,account_name', filters: [`id:eq:${dealId}`], limit: 1 }).catch(e => { note(e); return []; });
  _cache.set('d:' + dealId, { at: Date.now(), v: r[0] || false });
  return r[0] || null;
}
async function escalationStatus(t) {
  if (!_rawKb || !t) return null;
  const f = t.aria_deal_id ? `deal_id:eq:${t.aria_deal_id}` : t.aria_account_id ? `account_id:eq:${t.aria_account_id}` : null;
  if (!f) return null;
  return cached('e:' + f, 30 * 60000, async () => {
    const rows = await _kb('crm_escalations', { select: 'id,j_name,j_escalation_status,j_tier_1_stage,j_tier_2_stage,j_de_escalation_date,created_time,owner_name', filters: [f], order_by: 'created_time', desc: true, limit: 10 }).catch(() => []);
    return rows;
  });
}
function escLabel(t, rows) {
  const active = (rows || []).find(r => !/de-?escalat|churn/i.test(String(r.j_escalation_status || '')));
  if (active) {
    const tier = active.j_tier_2_stage ? 'Tier 2' : active.j_tier_1_stage ? 'Tier 1' : '';
    return `Escalated${tier ? ' (' + tier + ')' : ''}${active.j_escalation_status ? ': ' + clean(active.j_escalation_status, 40) : ''}`;
  }
  if ((rows || []).length) return 'De-escalated earlier';
  if (t && t.cf_escalations_status) return clean(t.cf_escalations_status, 60);
  return 'Never escalated';
}

const _neg = new Map();
async function quick(ticketId) {
  try {
    if (_neg.has(ticketId) && Date.now() - _neg.get(ticketId) < 90000) return null;   // do not hammer AditKB after a failure
    const t = await ticketRow(ticketId);
    if (!t) { _neg.set(ticketId, Date.now()); return null; }
    const [d, esc] = await Promise.all([dealName(t.aria_deal_id), escalationStatus(t)]);
    return {
      account: clean(t.contact_account_name || (d && d.account_name), 120) || null,
      deal: clean(d && d.deal_name, 140) || null,
      stage: clean(t.cf_deal_stage || (d && d.stage), 60) || null,
      csm: clean(t.cf_csm_account_manager, 80) || null,
      ob: clean(t.cf_onboarding_owner, 80) || null,
      escalation: escLabel(t, esc),
    };
  } catch (e) { return null; }
}

// ── analysis (theses) ───────────────────────────────────────────────────
async function analysisFor(accountId) {
  if (!_rawKb || !accountId) return { ok: false, reason: 'no account' };
  return cached('a:' + accountId, 6 * 3600000, async () => {
    try {
      const rows = await _kb('theses', { select: 'run,saved_at,thesis', filters: [`j_account_id:eq:${accountId}`], order_by: 'saved_at', desc: true, limit: 1 });
      const row = rows[0];
      if (!row || !row.thesis) return { ok: false, reason: 'No written account analysis for this account yet.' };
      const doc = typeof row.thesis === 'string' ? JSON.parse(row.thesis) : row.thesis;
      return { ok: true, savedAt: row.saved_at, th: doc.thesis || {}, facts: doc.facts || {} };
    } catch (e) {
      return { ok: false, reason: e.status === 403 || e.status === 404 ? 'The account analysis is not available to this tool. Ask an admin to grant the theses table to its AditKB key.' : 'Could not load the account analysis right now.' };
    }
  });
}

function shapeAnalysis(a, tickets) {
  if (!a || !a.ok) return { available: false, note: a && a.reason };
  const th = a.th || {}, facts = a.facts || {};
  const issues = (Array.isArray(th.issues) ? th.issues : []).map(i => ({
    problem: clean(stripRefs(i.problem), 420), status: clean(i.status, 24), kind: clean(i.kind, 24), product: clean(i.product, 40),
    since: clean(i.first_seen, 12), times: Number(i.times_raised) || null,
  })).filter(i => i.problem);
  const open = (Array.isArray(th.open_items) ? th.open_items : []).map(o => ({ item: clean(stripRefs(o.item), 380), kind: clean(o.kind, 30), note: clean(o.age_note, 80) })).filter(o => o.item);
  // Modules usually reported: product tags on issues and touchpoints, most raised first.
  const mod = new Map();
  const bump = (name, n) => { name = clean(name, 40); if (!name) return; mod.set(name, (mod.get(name) || 0) + (n || 1)); };
  for (const i of issues) bump(i.product.replace(/_/g, ' '), i.times || 1);
  for (const tp of (Array.isArray(th.touchpoints) ? th.touchpoints : [])) for (const g of (tp.tags || [])) if (g && g.kind === 'product') bump(g.label, 1);
  const modules = [...mod.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([name, n]) => ({ name: name.replace(/^./, c => c.toUpperCase()), n }));
  const mood = th.customer_mood && typeof th.customer_mood === 'object' ? { level: clean(th.customer_mood.level, 24), why: clean(stripRefs(th.customer_mood.why), 500), asOf: clean(th.customer_mood.as_of, 12) } : null;
  const people = ((facts.people && facts.people.adit) || []).filter(p => p && p.name && Number(p.ticket_messages) > 0)
    .sort((x, y) => (Number(y.ticket_messages) || 0) - (Number(x.ticket_messages) || 0)).slice(0, 8)
    .map(p => ({ name: clean(p.name, 60), roles: (p.roles || []).map(r => clean(r, 40)).slice(0, 3), messages: Number(p.ticket_messages) || 0, last: clean(p.last_seen, 12) }));
  return {
    available: true, savedAt: a.savedAt,
    headline: clean(stripRefs(th.headline), 420), health: clean(th.health, 24), confidence: clean(th.confidence, 24),
    issues: issues.slice(0, 12), open: open.slice(0, 8), mood, modules, agents: people,
  };
}


// ── themes read from the deal's own ticket subjects ──────────────────────────
// Used when the written account analysis is not available, and to fill modules when it has none.
const THEMES = [
  { key: 'ehr', name: 'EHR sync and disconnections', module: 'EHR / server sync', re: /ehr|disconnect|last sync|not syncing|sync(?:ing)?\b|eaglesoft|dentrix|open ?dental|sikka|bridge|server|offline/i,
    cause: 'Repeated disconnections usually point to the Adit server or the EHR bridge on the practice side, not to user error. Worth a server check with Tech support.' },
  { key: 'phones', name: 'Phones and calls', module: 'Phones', re: /phone|call|voicemail|softphone|ring|fax|dial|extension/i },
  { key: 'sched', name: 'Online scheduling', module: 'Online scheduling', re: /online sched|double.?book|booking|appointment|schedul/i },
  { key: 'remind', name: 'Reminders and texting', module: 'Reminders and SMS', re: /reminder|sms|text(?:ing)?|confirmation|two.?way/i },
  { key: 'email', name: 'Email campaigns', module: 'Email campaigns', re: /email|campaign|newsletter|mass/i },
  { key: 'pay', name: 'Payments and billing', module: 'Payments and billing', re: /pay|billing|invoice|charge|refund|statement|terminal/i },
  { key: 'login', name: 'Login and access', module: 'Login and access', re: /login|log in|password|access|2fa|verification code|locked/i },
  { key: 'reviews', name: 'Reviews and reputation', module: 'Reviews', re: /review|reputation|google/i },
  { key: 'forms', name: 'Forms and patient intake', module: 'Forms', re: /form|intake|signature/i },
];
function deriveFromTickets(rows) {
  const by = new Map();
  for (const r of rows) {
    const subj = String(r.subject || '');
    if (/share your adit experience|thank-you gift|survey/i.test(subj)) continue;
    const th = THEMES.find(t => t.re.test(subj));
    if (!th) continue;
    const g = by.get(th.key) || { th, n: 0, open: 0, last: null, first: null, ex: [] };
    g.n++; if (r.state !== 'closed') g.open++;
    const c = r.created ? Date.parse(r.created) : NaN;
    if (!isNaN(c)) { if (g.last == null || c > g.last) g.last = c; if (g.first == null || c < g.first) g.first = c; }
    if (g.ex.length < 2 && !g.ex.includes(clean(subj, 90))) g.ex.push(clean(subj, 90));
    by.set(th.key, g);
  }
  const groups = [...by.values()].sort((a, b) => b.n - a.n);
  const iso = (ms) => ms ? new Date(ms).toISOString().slice(0, 10) : '';
  const issues = groups.slice(0, 6).map(g => ({
    problem: `${g.th.name}: ${g.n} ticket${g.n === 1 ? '' : 's'}${g.open ? ` (${g.open} still open)` : ''}, latest ${iso(g.last)}. For example: ${g.ex.join('; ')}.`,
    status: g.open ? 'open' : g.n >= 3 ? 'recurring' : 'solved', kind: g.n >= 3 ? 'recurring' : '', product: g.th.module, since: iso(g.first), times: g.n,
    cause: g.n >= 3 && g.th.cause ? g.th.cause : '',
  }));
  const modules = groups.slice(0, 8).map(g => ({ name: g.th.module, n: g.n }));
  return { issues, modules };
}

async function dealTickets(t) {
  if (!_rawKb || !t) return [];
  const f = t.aria_deal_id ? `aria_deal_id:eq:${t.aria_deal_id}` : t.aria_account_id ? `aria_account_id:eq:${t.aria_account_id}` : null;
  if (!f) return [];
  const hit = _cache.get('dt:' + f);
  if (hit && hit.v.length && Date.now() - hit.at < 15 * 60000) return hit.v;
  let rows = [];
  try { rows = await kbTry('desk_tickets', 'id,ticket_number,subject,status,channel,created_time,closed_time,assignee_name,cf_fcr_achieved,web_url', 'id,ticket_number,subject,status,channel,created_time,assignee_name,web_url', { filters: [f], order_by: 'created_time', desc: true, limit: 60 }); }
  catch (e) { note(e); rows = []; }
  if (rows.length) _cache.set('dt:' + f, { at: Date.now(), v: rows });
  return rows;
}

const bucket = (s) => /closed|resolved/i.test(s) ? 'closed' : /on ?hold|pending customer|waiting/i.test(s) ? 'on hold' : 'open';

async function detail(ticketId, localAll) {
  const t = await ticketRow(ticketId);
  if (!t) return { available: false, note: _lastErr ? 'Could not read this ticket from AditKB (' + _lastErr + ').' : 'This ticket is not in AditKB yet, so there is no deal context.' };
  const [q, tix, a] = await Promise.all([quick(ticketId), dealTickets(t), analysisFor(t.aria_account_id)]);
  const rows = tix.map(r => ({ number: r.ticket_number, subject: clean(r.subject, 140), status: clean(r.status, 40), state: bucket(r.status || ''), channel: clean(r.channel, 20), created: r.created_time, closed: r.closed_time, agent: clean(r.assignee_name, 60), fcr: r.cf_fcr_achieved, url: /^https:\/\//.test(r.web_url || '') ? r.web_url : null }));
  const counts = { open: 0, 'on hold': 0, closed: 0 };
  for (const r of rows) counts[r.state]++;
  // FCR: Zoho's own flag when we hold it, otherwise the AditKB custom field. Counted over closed tickets.
  const ids = tix.map(r => String(r.id)).filter(Boolean);
  let zoho = {}, surveys = [];
  if (localAll && ids.length) {
    const ph = ids.map(() => '?').join(',');
    try { for (const r of await localAll(`SELECT ticket_id, zoho_is_fcr FROM desk_ticket_snapshot WHERE ticket_id IN (${ph}) AND zoho_is_fcr IS NOT NULL`, ids)) zoho[String(r.ticket_id)] = !!r.zoho_is_fcr; } catch (e) {}
    try { surveys = await localAll(`SELECT ticket_id, rating FROM desk_ticket_survey WHERE ticket_id IN (${ph})`, ids); } catch (e) {}
  }
  let fcrYes = 0, fcrN = 0;
  for (const r of tix) {
    if (!/closed|resolved/i.test(r.status || '')) continue;
    const v = zoho[String(r.id)] != null ? zoho[String(r.id)] : (r.cf_fcr_achieved == null ? null : !!r.cf_fcr_achieved);
    if (v == null) continue;
    fcrN++; if (v) fcrYes++;
  }
  const good = surveys.filter(s => s.rating === 'Good').length, bad = surveys.filter(s => s.rating === 'Bad').length;
  const an = shapeAnalysis(a, rows);
  an.derived = deriveFromTickets(rows);
  // Agents who worked tickets in this deal, from the ticket owners (always available), with the analysis voices alongside.
  const byAgent = new Map();
  for (const r of rows) if (r.agent) byAgent.set(r.agent, (byAgent.get(r.agent) || 0) + 1);
  const owners = [...byAgent.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([name, tickets]) => ({ name, tickets }));
  return {
    available: true, quick: q, ticketsShown: rows.length, counts,
    journey: rows,
    owners,
    fcr: { achieved: fcrYes, closed: fcrN, pct: fcrN ? Math.round(fcrYes * 100 / fcrN) : null },
    csat: { good, bad, total: good + bad, pct: good + bad ? Math.round(good * 100 / (good + bad)) : null },
    analysis: an,
  };
}

module.exports = { setKb, quick, detail, _shape: shapeAnalysis };
