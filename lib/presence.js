'use strict';
// Batch 391: who has the tool open right now, like presence in RingCentral but for our tool.
// Every open tab sends a beat once a minute (and when it is hidden or shown again). A person is online while a beat
// arrived in the last 150 seconds; they are idle when none of their tabs saw a click, key or scroll for 5 minutes.
// Kept in memory only: after a restart the list fills again within a minute.
const ONLINE_MS = 150 * 1000;
const IDLE_MS = 5 * 60 * 1000;
const seen = new Map();

function beat(s, b, now = Date.now()) {
  const email = String((s && s.email) || '').toLowerCase().trim();
  if (!email) return null;
  const prev = seen.get(email);
  const fresh = prev && now - prev.at < ONLINE_MS;
  const active = !!(b && b.active);
  const pic = String((s && s.picture) || '');
  const row = {
    email,
    name: String((s && s.name) || (prev && prev.name) || email.split('@')[0]).slice(0, 80),
    picture: /^https:\/\//.test(pic) ? pic : '',
    at: now,
    activeAt: active ? now : (fresh ? prev.activeAt : now - IDLE_MS),
    since: fresh ? prev.since : now,
    page: String((b && b.page) || (fresh && prev.page) || '').replace(/[<>]/g, '').slice(0, 40),
  };
  seen.set(email, row);
  if (seen.size > 400) for (const [k, v] of seen) if (now - v.at >= ONLINE_MS) seen.delete(k);
  return row;
}

function bye(email) { seen.delete(String(email || '').toLowerCase().trim()); }

function list(now = Date.now()) {
  const out = [];
  for (const x of seen.values()) {
    if (now - x.at >= ONLINE_MS) continue;
    const idleMs = now - x.activeAt;
    out.push({ email: x.email, name: x.name, picture: x.picture, page: x.page, since: x.since,
      status: idleMs >= IDLE_MS ? 'idle' : 'active', idleMin: idleMs >= IDLE_MS ? Math.floor(idleMs / 60000) : 0 });
  }
  return out.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
}

function _reset() { seen.clear(); }

module.exports = { beat, bye, list, ONLINE_MS, IDLE_MS, _reset };
