'use strict';
/**
 * Batch 360: which workspace a request is for (T1 CS or Adit Pay), carried through every await of that request.
 *
 * requireAuth starts each signed-in request inside run(ws). Code anywhere below (database reads, RingCentral
 * summaries, caches) asks current(): 't1', 'aditpay', or null when there is no request (background jobs, pollers),
 * which means "everything", as before.
 *
 * Membership: a person belongs to Adit Pay when their monitored agent row says workspace 'aditpay', or their access
 * (app_roles.workspaces) covers Adit Pay and not T1. Everyone else is T1. People with both workspaces are counted
 * in T1 for their own calls and breaks.
 */
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();
const WORKSPACES = ['t1', 'aditpay'];

function run(ws, fn) { return als.run({ ws: WORKSPACES.includes(ws) ? ws : 't1' }, fn); }
function current() { const s = als.getStore(); return s ? s.ws : null; }
/** Run fn with no workspace (sees everything): for code that must look across both on purpose. */
function unscoped(fn) { return als.exit(fn); }
/** Cache keys stay apart per workspace. T1 keeps the old names (so existing cache clears still work); background jobs,
 *  which see both workspaces, use their own. */
function key(k) { const w = current(); return w === 't1' ? k : w ? w + ':' + k : 'all:' + k; }

// ── who is in Adit Pay ─────────────────────────────────────────────────────
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
let _m = null, _mAt = 0, _mP = null;
async function members() {
  if (_m && Date.now() - _mAt < 15000) return _m;
  if (_mP) return _mP;
  _mP = (async () => {
    const all = D.all;
    const out = { emails: new Set(), agentIds: new Set(), names: new Set() };
    if (!all) return out;
    const agents = await all(`SELECT name, extension, email, rc_id, workspace FROM monitored_agents`).catch(() => []);
    for (const a of agents) {
      if (String(a.workspace || 't1') !== 'aditpay') continue;
      if (a.email) out.emails.add(String(a.email).toLowerCase());
      if (a.rc_id) out.agentIds.add(String(a.rc_id));
      if (a.extension) out.agentIds.add(String(a.extension));
      if (a.name) out.names.add(String(a.name).trim().toLowerCase());
    }
    const roles = await all(`SELECT email, workspaces FROM app_roles`).catch(() => []);
    for (const r of roles) {
      const ws = String(r.workspaces || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (ws.includes('aditpay') && !ws.includes('t1')) out.emails.add(String(r.email || '').toLowerCase());
    }
    _m = out; _mAt = Date.now();
    return out;
  })().finally(() => { _mP = null; });
  return _mP;
}
function bust() { _m = null; _mAt = 0; }
/** The last membership read (may be up to 15 s old), for code that cannot wait. */
function membersSync() { if (!_m || Date.now() - _mAt > 15000) members().catch(() => {}); return _m; }
/** Which workspace an email belongs to, from the last read: 'aditpay', 't1', or null when unknown. */
function wsOfEmail(email) { const m = membersSync(); if (!m || !email) return null; return m.emails.has(String(email).toLowerCase()) ? 'aditpay' : 't1'; }

/** Is this email in the current workspace? true when there is no workspace (background). */
async function hasEmail(email) {
  const w = current(); if (!w) return true;
  const m = await members(); const pay = m.emails.has(String(email || '').toLowerCase());
  return w === 'aditpay' ? pay : !pay;
}
/** Keep the rows whose email (or agent id / name) belongs to the current workspace. */
async function filterRows(rows, { email = 'email', agentId = null, name = null } = {}) {
  const w = current(); if (!w || !Array.isArray(rows)) return rows;
  const m = await members();
  return rows.filter((r) => {
    const e = email && r[email] ? String(r[email]).toLowerCase() : '';
    const id = agentId && r[agentId] != null ? String(r[agentId]) : '';
    const n = name && r[name] ? String(r[name]).trim().toLowerCase() : '';
    const pay = (e && m.emails.has(e)) || (id && m.agentIds.has(id)) || (n && m.names.has(n));
    return w === 'aditpay' ? !!pay : !pay;
  });
}

// ── the workspace's RingCentral queue and Desk team ──────────────────────
const QUEUE = { t1: { ext: () => process.env.MISSED_CALL_QUEUE_EXT || '1025', name: () => 'Customer Service' },
  aditpay: { ext: () => process.env.ADITPAY_QUEUE_EXT || '9018', name: () => process.env.ADITPAY_QUEUE_NAME || 'Adit Pay' } };
function queue(ws) { const w = ws || current() || 't1'; const q = QUEUE[w] || QUEUE.t1; return { ws: w, ext: q.ext(), name: q.name() }; }
const TEAM = { t1: () => String(process.env.EXPERT_T1_TEAM_ID || '197800000052125116'), aditpay: () => String(process.env.ADITPAY_TEAM_ID || '197800000070274100') };
function deskTeam(ws) { const w = ws || current() || 't1'; return (TEAM[w] || TEAM.t1)(); }
const LABEL = { t1: 'T1 CS', aditpay: 'Adit Pay' };
function label(ws) { return LABEL[ws || current() || 't1'] || 'T1 CS'; }

module.exports = { run, current, unscoped, key, setDeps, members, membersSync, wsOfEmail, bust, hasEmail, filterRows, queue, deskTeam, label, WORKSPACES };
