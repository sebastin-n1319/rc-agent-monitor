'use strict';
/**
 * Batch 212: keep the tool's "available" time the same as scrin.io's.
 * Every minute the tool reads who is online in scrin.io. When an agent is Logged In here but scrin.io has shown them
 * away or offline for 2 minutes, the tool moves them to the "Away (scrin.io)" aux, dated from when scrin.io last saw
 * them active (never before their last status change here). When scrin.io shows them online again, they are moved back
 * to Logged In. Each move is posted to the Break Bot Google Chat space and the agent gets a message in the tool.
 * Only agents matched to the Roster (by email or real name) are touched. Switch off with SCRIN_AUTO_AUX=off.
 * An agent on a RingCentral call or with an open SalesIQ chat is working even when scrin.io marks them away (no typing
 * on a long call): they are never moved out, and are moved back if they were.
 */
const GRACE_MS = 2 * 60e3;
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
function enabled() { return !!process.env.SCRIN_API_KEY && String(process.env.SCRIN_AUTO_AUX || 'on').toLowerCase() !== 'off'; }
const lc = (s) => String(s || '').trim().toLowerCase();
const fromSql = (s) => { if (!s) return null; const t = Date.parse(String(s).replace(' ', 'T') + (/[zZ+]/.test(String(s).slice(10)) ? '' : 'Z')); return isNaN(t) ? null : t; };
const ct = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
const notAway = new Map(); // email -> first time scrin.io was seen not online while Logged In here
const _last = { at: null, moved: [], back: [], error: null };

async function tick(now = Date.now()) {
  if (!enabled()) return { skipped: true };
  _last.at = new Date(now).toISOString(); _last.moved = []; _last.back = []; _last.error = null;
  try {
    const sc = await D.scrin.people({ force: true });
    const today = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const tr = await D.getBreakTracker(today, 'America/Chicago');
    const rows = Array.isArray(tr) ? tr : (tr && (tr.tracker || tr.rows)) || [];
    const byEmail = new Map(rows.map((r) => [lc(r.email), r]));
    const busy = D.busy ? await D.busy().catch(() => ({})) : {};
    for (const p of sc.people || []) {
      if (!p.roster) continue;
      const email = lc(p.roster.email || p.email);
      const row = byEmail.get(email) || byEmail.get(lc(p.email));
      if (!row) { notAway.delete(email); continue; }
      const b = busy[email] || busy[lc(p.email)] || {};
      const working = !!(b.onCall || b.activeChats > 0);
      const online = p.status === 'online' || working;
      if (row.currentStatus === 'Logged In' && !online) {
        if (!notAway.has(email)) notAway.set(email, now);
        if (now - notAway.get(email) < GRACE_MS) continue;
        // From when scrin.io last saw them active, but never before their last change here
        const lastHere = fromSql(row.lastActionAt) || 0;
        const lastActive = p.lastActive ? Date.parse(p.lastActive) : 0;
        const from = Math.min(now, Math.max(lastHere + 1000, lastActive || notAway.get(email)));
        await move(row, 'SSM_AWAY_OUT', from, `Auto: scrin.io shows ${p.status || 'away'} since ${ct(from)} CT (last active in scrin.io ${lastActive ? ct(lastActive) + ' CT' : 'not today'})`, p);
        notAway.delete(email);
        _last.moved.push(row.username || email);
      } else if (row.currentStatus === 'Away (scrin.io)' && online) {
        await move(row, 'SSM_AWAY_IN', now, working && p.status !== 'online' ? 'Auto: on a call or chat, back to Logged In' : 'Auto: back online in scrin.io', p);
        notAway.delete(email);
        _last.back.push(row.username || email);
      } else if (online || row.currentStatus !== 'Logged In') {
        notAway.delete(email);
      }
    }
  } catch (e) { _last.error = String(e.message || e).slice(0, 200); }
  return status();
}

async function move(row, action, at, note, p) {
  const event = await D.insertBreakEvent({ username: row.username, email: row.email, role: row.role || 'agent', action, note, timestamp: new Date(at) });
  if (D.notify) D.notify(event).catch(() => {});
  if (D.notices && D.notices.notifyPerson) {
    const out = action === 'SSM_AWAY_OUT';
    D.notices.notifyPerson(row.email, {
      title: out ? 'Moved to Away (scrin.io)' : 'Back to Logged In',
      body: out ? `scrin.io shows you ${p.status || 'away'}, so the tool moved you to the Away (scrin.io) aux from ${ct(at)} CT. Start or resume tracking in scrin.io and you are moved back automatically.`
        : 'scrin.io shows you online again, so the tool moved you back to Logged In.',
      category: 'general', urgent: out,
    }).catch(() => {});
  }
  return event;
}
function status() { return { enabled: enabled(), graceMinutes: GRACE_MS / 60e3, ..._last, watching: [...notAway.keys()] }; }

module.exports = { setDeps, tick, status, enabled, _notAway: notAway };
