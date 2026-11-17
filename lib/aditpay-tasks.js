'use strict';
/**
 * Batch 382 (from the old Adit Pay Ops tool): open tasks in the Adit Pay Asana project, per assignee.
 * Read only, with the tool's ASANA_ACCESS_TOKEN. The project is ADITPAY_ASANA_PROJECT_ID (the Adit Pay Ops project by
 * default). Cached for 5 minutes. Never throws: a failure comes back as { ok: false, error }.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const PROJECT = () => String(process.env.ADITPAY_ASANA_PROJECT_ID || '1204109210327959').replace(/[^0-9]/g, '');
const fetchFn = () => D.fetch || fetch;
const lc = (s) => String(s || '').trim().toLowerCase();
let _cache = null;

async function load() {
  const tok = process.env.ASANA_ACCESS_TOKEN;
  if (!tok) return { ok: false, error: 'Asana is not connected (ASANA_ACCESS_TOKEN is not set)' };
  const fields = 'name,completed,due_on,due_at,permalink_url,assignee.name,assignee.email,memberships.section.name,modified_at';
  let url = `https://app.asana.com/api/1.0/tasks?project=${PROJECT()}&completed_since=now&limit=100&opt_fields=${encodeURIComponent(fields)}`;
  const tasks = [];
  for (let page = 0; url && page < 5; page++) {
    const r = await fetchFn()(url, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: 'Asana: ' + ((j && j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + r.status).slice(0, 140) };
    for (const t of (j && j.data) || []) if (!t.completed) tasks.push(t);
    url = j && j.next_page && j.next_page.uri ? j.next_page.uri : null;
  }
  return { ok: true, tasks };
}

/** { ok, at, byEmail: { email: { open, overdue, dueToday, list: [{ name, due, url, section }] } }, unassigned } */
async function summary({ fresh = false, today } = {}) {
  if (!fresh && _cache && Date.now() - _cache.at < 5 * 60e3) return _cache.v;
  const day = today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const r = await load().catch((e) => ({ ok: false, error: String(e.message || e).slice(0, 160) }));
  if (!r.ok) { const v = { ok: false, error: r.error, byEmail: {}, unassigned: 0 }; _cache = { at: Date.now() - 4 * 60e3, v }; return v; }
  const byEmail = {}; let unassigned = 0;
  for (const t of r.tasks) {
    const em = lc(t.assignee && t.assignee.email);
    if (!em) { unassigned++; continue; }
    const o = byEmail[em] || (byEmail[em] = { open: 0, overdue: 0, dueToday: 0, list: [] });
    const due = t.due_on || (t.due_at ? String(t.due_at).slice(0, 10) : null);
    o.open++; if (due && due < day) o.overdue++; else if (due === day) o.dueToday++;
    o.list.push({ name: String(t.name || 'Untitled task').slice(0, 140), due, url: t.permalink_url || null, section: (t.memberships || []).map((m) => m.section && m.section.name).filter(Boolean)[0] || null });
  }
  for (const o of Object.values(byEmail)) o.list.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0);
  const v = { ok: true, at: new Date().toISOString(), project: PROJECT(), byEmail, unassigned };
  _cache = { at: Date.now(), v };
  return v;
}
module.exports = { setDeps, summary, PROJECT };
