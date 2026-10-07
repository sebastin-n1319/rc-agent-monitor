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

let _kb = null;
function setKb(fn) { _kb = fn; }

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
  if (!_kb || !ticketId) return null;
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
  if (!dealId || !_kb) return null;
  const hit = _cache.get('d:' + dealId);
  if (hit && hit.v && Date.now() - hit.at < 6 * 3600000) return hit.v;
  const r = await _kb('crm_deals', { select: 'id,deal_name,stage,account_name', filters: [`id:eq:${dealId}`], limit: 1 }).catch(e => { note(e); return []; });
  if (r[0]) _cache.set('d:' + dealId, { at: Date.now(), v: r[0] });
  return r[0] || null;
}
async function escalationStatus(t) {
  if (!_kb || !t) return null;
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

async function quick(ticketId) {
  try {
    const t = await ticketRow(ticketId);
    if (!t) return null;
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
  if (!_kb || !accountId) return { ok: false, reason: 'no account' };
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

async function dealTickets(t) {
  if (!_kb || !t) return [];
  const f = t.aria_deal_id ? `aria_deal_id:eq:${t.aria_deal_id}` : t.aria_account_id ? `aria_account_id:eq:${t.aria_account_id}` : null;
  if (!f) return [];
  const hit = _cache.get('dt:' + f);
  if (hit && hit.v.length && Date.now() - hit.at < 15 * 60000) return hit.v;
  let rows = [];
  try { rows = await kbTry('desk_tickets', 'id,ticket_number,subject,status,channel,created_time,closed_time,assignee_name,cf_fcr_achieved', 'id,ticket_number,subject,status,channel,created_time,assignee_name', { filters: [f], order_by: 'created_time', desc: true, limit: 60 }); }
  catch (e) { note(e); rows = []; }
  if (rows.length) _cache.set('dt:' + f, { at: Date.now(), v: rows });
  return rows;
}

const bucket = (s) => /closed|resolved/i.test(s) ? 'closed' : /on ?hold|pending customer|waiting/i.test(s) ? 'on hold' : 'open';

async function detail(ticketId, localAll) {
  const t = await ticketRow(ticketId);
  if (!t) return { available: false, note: _lastErr ? 'Could not read this ticket from AditKB (' + _lastErr + ').' : 'This ticket is not in AditKB yet, so there is no deal context.' };
  const [q, tix, a] = await Promise.all([quick(ticketId), dealTickets(t), analysisFor(t.aria_account_id)]);
  const rows = tix.map(r => ({ number: r.ticket_number, subject: clean(r.subject, 140), status: clean(r.status, 40), state: bucket(r.status || ''), channel: clean(r.channel, 20), created: r.created_time, closed: r.closed_time, agent: clean(r.assignee_name, 60), fcr: r.cf_fcr_achieved }));
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
  // Agents who worked tickets in this deal, from the ticket owners (always available), with the analysis voices alongside.
  const byAgent = new Map();
  for (const r of rows) if (r.agent) byAgent.set(r.agent, (byAgent.get(r.agent) || 0) + 1);
  const owners = [...byAgent.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([name, tickets]) => ({ name, tickets }));
  return {
    available: true, quick: q, ticketsShown: rows.length, counts,
    journey: rows.slice(0, 25),
    owners,
    fcr: { achieved: fcrYes, closed: fcrN, pct: fcrN ? Math.round(fcrYes * 100 / fcrN) : null },
    csat: { good, bad, total: good + bad, pct: good + bad ? Math.round(good * 100 / (good + bad)) : null },
    analysis: an,
  };
}

module.exports = { setKb, quick, detail, _shape: shapeAnalysis };
