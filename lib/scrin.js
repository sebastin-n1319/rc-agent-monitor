'use strict';
/**
 * Batch 212: scrin.io (Screenshot Monitor) agent productivity, read only.
 * The API token (SCRIN_API_KEY, the "X-SSM-Token" from scrin.io My Account > API v2) can also change settings, delete
 * people and edit time. This file only ever calls the three read calls: GetCommonData (companies and people),
 * GetActivities (tracked time) and GetScreenshots (activity level and apps per interval; the screenshot images
 * themselves are never fetched or stored).
 * scrin.io has people's real names; Desk uses pseudo names. People are matched to the Roster by email, then by real
 * name (Roster full name), then by pseudo name.
 */
const BASES = ['https://screenshotmonitor.com/api/v2', 'https://scrin.io/api/v2'];
const READ_ONLY = new Set(['GetCommonData', 'GetActivities', 'GetScreenshots']);
let _base = null, _roster = null, _common = null;
function setDeps(d) { if (d && d.roster) _roster = d.roster; }
function configured() { return !!process.env.SCRIN_API_KEY; }
const lc = (s) => String(s || '').trim().toLowerCase();
const norm = (s) => lc(s).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function call(name, body) {
  if (!READ_ONLY.has(name)) throw new Error('Only read calls are allowed');
  if (!configured()) throw Object.assign(new Error('scrin.io is not connected (SCRIN_API_KEY is not set)'), { status: 503 });
  const bases = _base ? [_base] : BASES;
  let last = null;
  for (const b of bases) {
    for (const method of body === undefined ? ['GET', 'POST'] : ['POST']) {
      try {
        const res = await fetch(`${b}/${name}`, { method, headers: { 'X-SSM-Token': process.env.SCRIN_API_KEY, Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
          body: method === 'POST' ? JSON.stringify(body === undefined ? {} : body) : undefined, signal: AbortSignal.timeout(30000) });
        const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
        if (res.ok && j != null) { _base = b; return j; }
        last = `${b} ${method} ${res.status}${j && j.message ? ': ' + j.message : text ? ': ' + text.slice(0, 120) : ''}`;
        if (res.status === 401 || res.status === 403) break;
      } catch (e) { last = `${b} ${method}: ${e.message}`; }
    }
  }
  const e = new Error('scrin.io did not answer: ' + last); e.status = 502; throw e;
}

/** Companies and people, cached 10 minutes. */
async function common(force) {
  if (!force && _common && Date.now() - _common.at < 50e3) return _common.v; // fresh enough for live status
  const v = await call('GetCommonData');
  _common = { at: Date.now(), v };
  return v;
}

/** scrin.io people of the company (the one this account manages) matched to the Roster. */
async function people({ force = false } = {}) {
  const c = await common(force);
  const companies = (c.companies || []).filter((x) => x.isManager);
  const company = companies.sort((a, b) => (b.employments || []).length - (a.employments || []).length)[0] || (c.companies || [])[0] || null;
  const roster = _roster ? await _roster.listAgents({ includeRelieved: false }).catch(() => []) : [];
  const byEmail = new Map(), byName = new Map();
  for (const a of roster) {
    if (a.email) byEmail.set(lc(a.email), a);
    for (const n of [a.full_name, a.pseudo]) if (n) byName.set(norm(n), a);
  }
  const list = ((company && company.employments) || []).map((e) => {
    const a = byEmail.get(lc(e.email)) || byName.get(norm(e.name)) || null;
    return { id: e.id, name: e.name, email: lc(e.email), status: e.activityStatus || '', lastActive: e.lastActive ? new Date(e.lastActive * 1000).toISOString() : null,
      roster: a ? { emp_id: a.emp_id, pseudo: a.pseudo, full_name: a.full_name, email: a.email, designation: a.designation } : null,
      matchedBy: a ? (byEmail.get(lc(e.email)) === a ? 'email' : 'name') : null };
  });
  const matchedIds = new Set(list.filter((p) => p.roster).map((p) => p.roster.emp_id));
  return { company: company ? { id: company.id, name: company.name, isManager: !!company.isManager } : null, companies: (c.companies || []).map((x) => ({ id: x.id, name: x.name, isManager: !!x.isManager, people: (x.employments || []).length })),
    people: list, notInScrin: roster.filter((a) => !matchedIds.has(a.emp_id)).map((a) => ({ emp_id: a.emp_id, pseudo: a.pseudo, full_name: a.full_name, email: a.email })), base: _base };
}

/** Tracked time: [{ employmentId, from, to (seconds) }] -> activities. */
async function activities(ranges) { return call('GetActivities', ranges); }

/** email (Roster email and scrin.io email) -> { status: online|away|offline, lastActive, name }. Never throws. */
async function statusByEmail() {
  if (!configured()) return { configured: false, data: {} };
  try {
    const r = await people();
    const data = {};
    for (const p of r.people || []) {
      if (!p.roster) continue;
      const v = { status: p.status || 'offline', lastActive: p.lastActive, name: p.name };
      data[lc(p.email)] = v; if (p.roster.email) data[lc(p.roster.email)] = v;
    }
    return { configured: true, data };
  } catch (e) { return { configured: true, data: {}, error: String(e.message || e).slice(0, 160) }; }
}
module.exports = { statusByEmail, setDeps, configured, people, activities, _call: call };
