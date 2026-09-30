'use strict';
/**
 * Available / Unavailable time from the RingCentral Audit Trail.
 *
 * The Audit Trail logs each "Set DND status from X to Y" change an agent makes
 * (Users > Status). For one CST day we start the clock at the agent's first
 * "Take all calls" and from then on count time in "Take all calls" as
 * available and time in any "Do not accept ..." state as unavailable.
 *
 * RingCentral does not publish the record layout, so records are read
 * defensively: all text in a record is flattened and matched on the same
 * wording the admin console shows.
 */

const DND_RE = /DND status from\s+(.+?)\s+to\s+(.+?)(?:\s*\||\s*$)/i;
const EXT_RE = /Ext\.?\s*(\d{3,7})/ig;

function flatStrings(v, out = [], depth = 0) {
  if (v == null || depth > 5) return out;
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'number') out.push(String(v));
  else if (Array.isArray(v)) v.forEach(x => flatStrings(x, out, depth + 1));
  else if (typeof v === 'object') Object.values(v).forEach(x => flatStrings(x, out, depth + 1));
  return out;
}

/** One audit record -> { at, ext, name, from, to, take } or null when it is not a DND change. */
function parseRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const strings = flatStrings(rec);
  const joined = strings.join(' | ');
  const m = joined.match(DND_RE) || strings.map(s => s.match(DND_RE)).find(Boolean);
  if (!m) return null;
  const at = Date.parse(rec.eventTime || rec.timestamp || rec.time || rec.eventTimeStamp || '');
  if (!Number.isFinite(at)) return null;
  // The person whose status changed: prefer the record's target, then anything carrying an extension.
  const targetText = flatStrings(rec.target || rec.changedFor || rec.changeMadeTo || []).join(' | ');
  const pickExt = (text) => { EXT_RE.lastIndex = 0; const x = EXT_RE.exec(text); return x ? x[1] : null; };
  const ext = pickExt(targetText) || pickExt(joined) || (rec.target && rec.target.extensionNumber ? String(rec.target.extensionNumber) : null);
  const name = (rec.target && rec.target.name) || (rec.initiator && rec.initiator.name) || null;
  const to = String(m[2]).trim();
  return { at, ext, name, from: String(m[1]).trim(), to, take: /take all calls/i.test(to) };
}

/** events for ONE agent (any order) -> totals. now/dayEnd are epoch ms. */
function computeAvailability(events, nowMs, dayEndMs, openEnded) {
  const ev = events.slice().sort((a, b) => a.at - b.at);
  const first = ev.findIndex(x => x.take);
  if (first < 0) return { started: false, availSec: 0, unavailSec: 0, firstTakeAt: null, currentTake: false, changes: ev.length };
  // Today runs to now; a finished day stops at its last change (or midnight if that is earlier).
  const endMs = openEnded ? Math.min(nowMs, dayEndMs) : Math.min(ev[ev.length - 1].at, dayEndMs);
  let avail = 0, unavail = 0, lastAt = ev[first].at, take = true;
  for (let i = first + 1; i < ev.length; i++) {
    const t = Math.min(ev[i].at, endMs);
    if (t > lastAt) { if (take) avail += t - lastAt; else unavail += t - lastAt; lastAt = t; }
    take = ev[i].take;
  }
  if (endMs > lastAt) { if (take) avail += endMs - lastAt; else unavail += endMs - lastAt; }
  return { started: true, availSec: Math.round(avail / 1000), unavailSec: Math.round(unavail / 1000), firstTakeAt: new Date(ev[first].at).toISOString(), currentTake: take, changes: ev.length - first };
}

/** Group parsed events by monitored agent (extension first, then name) and compute totals. */
function computeForAgents(events, agents, nowMs, dayEndMs, openEnded) {
  const byExt = new Map(), byName = new Map();
  agents.forEach(a => { if (a.extension) byExt.set(String(a.extension), a); if (a.name) byName.set(String(a.name).trim().toLowerCase(), a); });
  const groups = new Map();
  for (const e of events) {
    const a = (e.ext && byExt.get(String(e.ext))) || (e.name && byName.get(String(e.name).trim().toLowerCase()));
    if (!a) continue;
    const k = String(a.extension || a.name);
    if (!groups.has(k)) groups.set(k, { agent: a, events: [] });
    groups.get(k).events.push(e);
  }
  const out = {};
  for (const [k, g] of groups) out[k] = { name: g.agent.name, email: g.agent.email || null, ...computeAvailability(g.events, nowMs, dayEndMs, openEnded) };
  return out;
}

module.exports = { parseRecord, computeAvailability, computeForAgents, flatStrings };
