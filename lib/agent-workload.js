'use strict';
/**
 * Batch 248 (from Aria's "how many calls did Walter make yesterday"): ask Expert "what was Evan's workload yesterday"
 * and get the agent's day from the tool's own records, not the AI: RingCentral available and unavailable time,
 * scrin.io tracked time, Desk tickets handled, replied, closed and transferred, chats, calls and breaks.
 * Admins can ask about anyone on the monitored roster; an agent can ask about their own workload only.
 *
 * This module reads the question (who and which days) and writes the answer. server.js gathers the numbers.
 */
const TZ = 'America/Chicago';
const lc = (s) => String(s || '').trim().toLowerCase();
const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const INTENT = new RegExp([
  'work\\s?load', 'productivity', 'how (?:busy|productive)', 'what did .{2,40}? (?:do|work on|handle)',
  'how (?:much|many) (?:work|tickets?|chats?|calls?)\\b', '\\bactivity (?:of|for)\\b', '\\b(?:day|stats|numbers|performance) (?:of|for)\\b',
  '(?:tickets?|chats?|calls?) (?:did|has|have) .{2,40}? (?:handle|close|take|answer|do|reply)', '\\b(?:rc|ringcentral) (?:avail|time)', 'available time',
].join('|'), 'i');

function todayCst(now = Date.now()) { return new Date(now).toLocaleDateString('en-CA', { timeZone: TZ }); }
const toMs = (d) => Date.parse(d + 'T12:00:00Z');
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => fromMs(toMs(d) + n * DAY);
const dow = (d) => new Date(toMs(d)).getUTCDay();
function label(d) { const x = new Date(toMs(d)); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MON[x.getUTCMonth()]; }

/** Which days the question means, in Central time. Default today. -> { from, to, label, days } (dates YYYY-MM-DD, to inclusive). */
function parsePeriod(q, now = Date.now()) {
  const s = lc(q), t = todayCst(now);
  const out = (from, to, lb) => ({ from, to, label: lb || (from === to ? label(from) : label(from) + ' to ' + label(to)), days: Math.round((toMs(to) - toMs(from)) / DAY) + 1 });
  let m;
  if ((m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) { const d = m[0]; return d <= t ? out(d, d) : null; }
  if ((m = s.match(/\b(\d{1,2})[/](\d{1,2})(?:[/](\d{2,4}))?\b/))) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : t.slice(0, 4);
    const d = y + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
    if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)) return out(d <= t ? d : addDays(d, -365), d <= t ? d : addDays(d, -365));
  }
  const mi = (w) => MON.findIndex((x) => w.slice(0, 3) === lc(x));
  if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/)) || (m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/))) {
    const day = /^\d/.test(m[1]) ? m[1] : m[2], mon = mi(/^\d/.test(m[1]) ? m[2] : m[1]);
    let d = t.slice(0, 4) + '-' + String(mon + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    if (d > t) d = (Number(t.slice(0, 4)) - 1) + d.slice(4);
    return out(d, d);
  }
  if (/\byesterday\b/.test(s)) { const d = addDays(t, -1); return out(d, d, 'yesterday, ' + label(d)); }
  if ((m = s.match(/\b(?:last|past) (\d{1,2}) days\b/))) { const n = Math.min(31, Math.max(1, Number(m[1]))); return out(addDays(t, -(n - 1)), t, 'the last ' + n + ' days'); }
  const monday = addDays(t, -((dow(t) + 6) % 7));
  if (/\blast week\b/.test(s)) return out(addDays(monday, -7), addDays(monday, -1), 'last week');
  if (/\bthis week\b|\bso far this week\b/.test(s)) return out(monday, t, 'this week');
  if (/\blast month\b/.test(s)) { const first = t.slice(0, 8) + '01', pEnd = addDays(first, -1); return out(pEnd.slice(0, 8) + '01', pEnd, MON[Number(pEnd.slice(5, 7)) - 1] + ' ' + pEnd.slice(0, 4)); }
  if (/\bthis month\b|\bmonth to date\b|\bmtd\b/.test(s)) return out(t.slice(0, 8) + '01', t, 'this month');
  for (let i = 0; i < 7; i++) {
    if (new RegExp('\\b(?:on |last )?' + WD[i] + '\\b').test(s)) { let back = (dow(t) - i + 7) % 7; if (back === 0 && /\blast\s+\w+day\b/.test(s)) back = 7; const d = addDays(t, -back); return out(d, d); }
  }
  return out(t, t, 'today, ' + label(t));
}

/** Who the question is about, from the monitored agents [{ email, name, pseudo, full_name }].
 *  -> { agent } | { choice: [agents] } | { self: true } | null */
function parseWho(q, agents, meEmail) {
  const s = ' ' + lc(q).replace(/[^a-z0-9@.' ]+/g, ' ') + ' ';
  const list = (agents || []).filter((a) => a && a.email);
  const names = (a) => [a.name, a.pseudo, a.full_name].map(lc).filter((x) => x && x.length >= 3);
  const has = (n) => new RegExp("(?:^|\\s)" + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'s)?(?:\\s|$)").test(s);
  const full = list.filter((a) => names(a).some((n) => n.includes(' ') && has(n)) || s.includes(' ' + lc(a.email) + ' '));
  if (full.length === 1) return { agent: full[0] };
  if (full.length > 1) return { choice: full };
  const byFirst = list.filter((a) => names(a).some((n) => { const f = n.split(/\s+/)[0]; return f.length >= 3 && has(f); }));
  const uniq = [...new Map(byFirst.map((a) => [lc(a.email), a])).values()];
  if (uniq.length === 1) return { agent: uniq[0] };
  if (uniq.length > 1) return { choice: uniq };
  if (/\bmy (?:own )?(?:workload|work load|day|stats|numbers|productivity|activity)\b|\b(?:did|have|had) i\b|\bi (?:handled|closed|did|took|answered|replied|worked)\b/.test(s)) { const a = list.find((x) => lc(x.email) === lc(meEmail)); return a ? { agent: a, self: true } : { self: true }; }
  return null;
}

/** null when the question is not about an agent's workload. */
function detect(q, agents, meEmail, now) {
  const text = String(q || '').slice(0, 400);
  if (!INTENT.test(text) || /#?\b\d{6}\b/.test(text)) return null;
  const who = parseWho(text, agents, meEmail);
  if (!who) return null;
  return Object.assign({ period: parsePeriod(text, now) }, who);
}

const hm = (sec) => { if (sec == null) return null; const m = Math.round(sec / 60); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
const n0 = (v) => (v == null ? 0 : Number(v) || 0);

/** One line in the shape of Aria's answer: the person, the days, then the numbers. */
function headline(W) {
  const p = [];
  if (W.rc) p.push('RingCentral available ' + hm(W.rc.availSec) + ', unavailable ' + hm(W.rc.unavailSec));
  if (W.desk) p.push(n0(W.desk.handled) + ' tickets handled (' + n0(W.desk.replied) + ' replied, ' + n0(W.desk.closed) + ' closed' + (W.desk.transferred ? ', ' + W.desk.transferred + ' transferred' : '') + ')');
  if (W.chats) p.push(n0(W.chats.count) + ' chat' + (n0(W.chats.count) === 1 ? '' : 's'));
  if (W.calls) p.push(n0(W.calls.total) + ' call' + (n0(W.calls.total) === 1 ? '' : 's'));
  if (W.breaks && W.breaks.totalMin) p.push('breaks ' + hm(W.breaks.totalMin * 60));
  return W.agent.name + ', ' + W.period.label + ' (Central): ' + (p.length ? p.join('; ') : 'nothing recorded') + '.';
}

function plainText(W) {
  const L = [headline(W), ''];
  if (W.rc) L.push('RingCentral: available ' + hm(W.rc.availSec) + ', unavailable ' + hm(W.rc.unavailSec) + (W.rc.source === 'presence' ? ' (presence data)' : ''));
  if (W.scrinSec != null) L.push('scrin.io tracked: ' + hm(W.scrinSec));
  if (W.desk) L.push('Desk: ' + n0(W.desk.handled) + ' handled (' + n0(W.desk.newT) + ' new, ' + n0(W.desk.followup) + ' follow-up), ' + n0(W.desk.replied) + ' replied, ' + n0(W.desk.closed) + ' closed, ' + n0(W.desk.transferred) + ' transferred, ' + n0(W.desk.open) + ' open now');
  if (W.chats) L.push('Chats: ' + n0(W.chats.count) + (W.chats.avgRespSec != null ? ', first response ' + Math.round(W.chats.avgRespSec) + 's on average' : '') + (W.chats.availSec ? ', online in SalesIQ ' + hm(W.chats.availSec) : ''));
  if (W.calls) L.push('Calls: ' + n0(W.calls.total) + ' (' + n0(W.calls.inbound) + ' inbound, ' + n0(W.calls.outbound) + ' outbound, ' + n0(W.calls.missed) + ' missed), talk time ' + hm(W.calls.talkSec));
  if (W.breaks && W.breaks.items.length) L.push('Breaks: ' + W.breaks.items.map((b) => b.type + ' ' + hm(b.min * 60)).join(', '));
  if (W.limits.length) L.push('', 'Limits: ' + W.limits.join(' '));
  return L.join('\n');
}

module.exports = { TZ, INTENT, detect, parseWho, parsePeriod, headline, plainText, hm, todayCst, addDays };
