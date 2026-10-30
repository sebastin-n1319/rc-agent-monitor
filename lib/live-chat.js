'use strict';
/**
 * Batch 215: Live chat help for chat agents (Adit Expert > Live chats).
 * The agent's open SalesIQ chats open as tabs on their own; any chat can also be added by its number (reference id).
 * Each tab shows the live transcript (refreshed every 10 seconds) and, when the client writes something new, Adit Expert
 * writes the next reply from the Help Center, the team rules, Adit Updates and solved cases, ready to copy into SalesIQ.
 * The reply carries Help Center links (only ones from the sources) and [Screenshot: ...] placeholders the agent swaps for an
 * image; the agent can ask Expert to improve it (shorter, friendlier, add steps).
 * Agents only see chats they own or attend; admins and SPOCs can open any chat. Nothing is ever sent from here.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n = 600) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
const scrub = (s) => String(s || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

// ── Conversations (shared, cached 20 s) ───────────────────────────────
let _recent = { at: 0, hours: 0, list: [] };
async function recent(hours = 12) {
  if (Date.now() - _recent.at < 20000 && _recent.hours >= hours) return _recent.list;
  const now = Date.now(), from = now - hours * 3600e3, list = [], seen = new Set();
  const add = (c) => { if (c && !seen.has(String(c.id))) { seen.add(String(c.id)); list.push(c); } };
  // The plain list (newest activity first) carries reopened chats that a start-time window misses.
  for (let index = 1; index <= 4; index++) {
    const j = await D.siq.rawGet(`conversations?index=${index}&limit=100`).catch(() => null);
    const rows = (j && j.data) || [];
    rows.forEach(add);
    if (!j || !j.more_data_available || !rows.length || Number(rows[rows.length - 1].last_modified_time || 0) < from) break;
  }
  for (let index = 1; index <= 6; index++) {
    const pg = await D.siq.fetchConversationsPage({ fromTimeMs: from, toTimeMs: now, index, limit: 100 });
    (pg.conversations || []).forEach(add);
    if (!pg.moreDataAvailable) break;
  }
  _recent = { at: Date.now(), hours, list };
  return list;
}
// SalesIQ lists open chats by default; ended ones need status=closed. Read on demand, cached 60 s.
let _closed = { at: 0, list: [] };
async function closedByRef(ref) {
  if (Date.now() - _closed.at > 60000) {
    const now = Date.now(), list = [];
    for (let index = 1; index <= 5; index++) {
      const j = await D.siq.rawGet(`conversations?status=closed&from_time=${now - 72 * 3600e3}&to_time=${now}&index=${index}&limit=100`).catch(() => null);
      list.push(...((j && j.data) || []));
      if (!j || !j.more_data_available) break;
    }
    _closed = { at: Date.now(), list };
  }
  return _closed.list.find((x) => String(x.reference_id) === ref) || null;
}
const isOpen = (c) => { const st = String(c.status || '') + ' ' + String((c.chat_status && (c.chat_status.label || c.chat_status.status_key)) || ''); return !c.end_time && !/\b(end|ended|closed?|missed|declined|blocked|archived|completed)\b/i.test(st); };
const people = (c) => [c.attender && c.attender.email, c.owner && c.owner.email].filter(Boolean).map(lc);
function shape(c) {
  const v = c.visitor || {};
  return { id: String(c.id), ref: String(c.reference_id || ''), open: isOpen(c), status: (c.chat_status && c.chat_status.label) || c.status || '',
    visitor: clean(v.name || 'Visitor', 60), company: clean(v.company_name || (v.info && v.info.company) || '', 80), question: clean(c.question || '', 300),
    start: c.start_time ? new Date(Number(c.start_time)).toISOString() : null, last: c.last_modified_time ? new Date(Number(c.last_modified_time)).toISOString() : null,
    agent: clean((c.attender && c.attender.name) || '', 60), department: clean((c.department && c.department.name) || '', 60) };
}

/** The agent's open chats. */
async function mine(email) {
  const me = lc(email);
  return (await recent(12)).filter((c) => isOpen(c) && people(c).includes(me)).map(shape).sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
async function byRef(ref) {
  ref = String(ref || '').replace(/\D/g, '');
  if (!ref) throw httpError(400, 'Type the chat number');
  let c = (await recent(12)).find((x) => String(x.reference_id) === ref);
  if (!c) c = (await recent(72)).find((x) => String(x.reference_id) === ref);
  if (!c) c = await closedByRef(ref);
  if (!c) throw httpError(404, `Chat ${ref} was not found in the last 3 days`);
  return c;
}
function canSee(c, who) { return !!(who.admin || who.spoc || people(c).includes(lc(who.email))); }

// ── Transcript (cached 8 s per chat) ──────────────────────────────────
const _tx = new Map();
function msgText(m) {
  const x = m.message;
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'object') return x.text || x.msg || (x.file && ('[File: ' + (x.file.name || 'attachment') + ']')) || (x.url ? '[Link] ' + x.url : '') || '';
  return String(x);
}
async function messages(id) {
  const hit = _tx.get(id);
  if (hit && Date.now() - hit.at < 8000) return hit.v;
  const out = [], seen = new Set();
  for (let index = 1; index <= 5; index++) {
    const j = await D.siq.rawGet(`conversations/${id}/messages?limit=100&index=${index}`);
    let fresh = 0;
    for (const m of (j && j.data) || []) {
      if (seen.has(m.id)) continue; seen.add(m.id); fresh++;
      const type = (m.sender && m.sender.type) || 'system';
      const text = clean(msgText(m), 2000);
      if (!text) continue;
      out.push({ id: String(m.id), at: m.time ? new Date(Number(m.time)).toISOString() : null, who: type === 'visitor' ? 'client' : type === 'operator' ? 'agent' : type === 'bot' ? 'bot' : 'system',
        name: clean((m.sender && m.sender.name) || '', 60), text, seq: Number(m.sequence_id || 0) });
    }
    if (!fresh || !(j && j.more_data_available)) break;
  }
  out.sort((a, b) => (a.seq - b.seq) || String(a.at).localeCompare(String(b.at)));
  _tx.set(id, { at: Date.now(), v: out });
  if (_tx.size > 300) _tx.delete(_tx.keys().next().value);
  return out;
}

async function chat(ref, who) {
  const { c, msgs, basis } = await open(ref, who);
  const sg = _sugg.get(String(c.id));
  return { chat: shape(c), messages: msgs, lastClientId: basis === 'none' ? null : basis, suggestion: sg && sg.v && sg.basis === basis ? sg.v : null };
}

// ── The next reply ────────────────────────────────────────────────────
const _sugg = new Map();
const SYS = `You are Adit Expert helping a T1 chat agent at Adit (software for dental, orthodontic, optometry and chiropractic offices: texting, calls and VoIP, reminders, forms, payments, reviews, scheduling, EHR sync, AI front desk) answer a LIVE SalesIQ chat.
Read the whole transcript and write the agent's NEXT reply to the client's latest message.
- 1 to 3 short chat messages, separated by a blank line, friendly and direct, one or two sentences each, ready to paste one after another. Ask at most one question at a time. Short numbered steps are fine when the client has to do something.
- Answer from the Help Center, the team rules, Adit Updates and the solved cases given. Never invent a feature, a setting, a price or a timeline. If the sources do not cover it, say what to check or who handles it, and keep the reply honest ("Let me check that for you").
- When a Help Center article given in the sources helps the client, put its full link on its own line in the reply. Only use links that appear in the sources; never make one up.
- Where a screenshot from the agent would help the client find a button or a setting, put a placeholder on its own line, exactly like: [Screenshot: Settings > Phone > Call Forwarding, the Forward To field]. The agent swaps it for the real image. At most 2 placeholders, and only when they help.
- Never ask for something the client already gave. Do not repeat what the agent already said. Match where the chat is (greeting, troubleshooting, wrapping up).
- T1 rules: anything a Help Center article covers is done by T1 in the chat. T1 cannot make outbound calls. Escalations, cancellations and port-outs go to the account CSM or the escalation manager. Never mention internal teams, tiers or ticket process to the client.
- If the chat is over or only needs a closing, write a short closing message.
- Plain words, no emoji, no em or en dashes.
Reply with JSON: {"reply":"the message(s) to send","why":"one line for the agent: what the client needs and why this reply","checks":["what the agent should check in Adit before sending, if anything (0 to 3)"],"handover":"if T1 cannot finish this in chat, what to do next, else ''","kb":"the Help Center article title used, or ''","kb_url":"its link, or ''"}`;
const IMPROVE = `You are Adit Expert improving a reply a T1 chat agent is about to send in a LIVE SalesIQ chat. The agent tells you what to change.
Rewrite the reply following the agent's instruction, while keeping it true to the transcript and the sources. Keep the same rules: 1 to 3 short chat messages separated by a blank line, Help Center links only from the sources and on their own line, screenshot placeholders exactly like [Screenshot: where in Adit] on their own line, never invent a feature, setting, price or timeline, never mention internal teams or ticket process, no emoji, no em or en dashes.
If the instruction asks for something the sources do not support, do the rest and say so in "why".
Reply with JSON: {"reply":"the improved message(s)","why":"one line: what you changed","checks":["anything the agent should check before sending (0 to 3)"],"handover":"","kb":"the Help Center article title used, or ''","kb_url":"its link, or ''"}`;

const URL_RE = /https?:\/\/[^\s)\]<>"']+/g;
/** Keep only links that came from the sources (the Help Center); turn screenshot notes into one form. */
function tidy(reply, allowed) {
  let t = String(reply || '').replace(/[\u2014\u2013]/g, ',').replace(/\r/g, '');
  t = t.replace(URL_RE, (u) => { const x = u.replace(/[.,;:]+$/, ''); const tail = u.slice(x.length); return (allowed.has(x) || /^https:\/\/help\.adit\.com\//.test(x)) ? x + tail : ''; });
  t = t.replace(/\[\s*(?:screenshot|screen shot|image)\s*[:\-]\s*([^\]]+)\]/gi, (m, what) => `[Screenshot: ${what.trim()}]`);
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1800);
}
const linksIn = (t) => [...new Set((String(t).match(URL_RE) || []).map((u) => u.replace(/[.,;:]+$/, '')))];
const shotsIn = (t) => (String(t).match(/\[Screenshot: [^\]]+\]/g) || []);

async function context(c, msgs) {
  const recentTxt = msgs.slice(-40).map((m) => `${m.who === 'client' ? 'Client' : m.who === 'agent' ? 'Agent' : m.who === 'bot' ? 'Bot' : 'System'}: ${scrub(m.text)}`).join('\n');
  const s = shape(c);
  const topic = [s.question, ...msgs.filter((m) => m.who === 'client').slice(-3).map((m) => m.text)].join(' ').slice(0, 800);
  const [kb, rules, ups] = await Promise.all([
    D.expert.searchLocal([topic], { limit: 8, maxChars: 9000 }).catch(() => []),
    D.expert.rules().catch(() => []),
    D.expert.updatesFor ? D.expert.updatesFor(topic).catch(() => '') : '',
  ]);
  const allowed = new Set(kb.map((k) => k.url).filter(Boolean));
  const user = [
    `Chat ${s.ref} with ${s.visitor}${s.company ? ' (' + s.company + ')' : ''}, status ${s.status}${s.department ? ', department ' + s.department : ''}.`,
    'Team rules:\n' + (rules || []).map((r) => `- ${r.title}: ${r.body}`).join('\n'),
    ups ? 'Adit Updates (recent changes; a change wins over older Help Center text):\n' + ups : '',
    kb.length ? 'Sources:\n' + kb.map((k, i) => `[S${i + 1}] ${k.src === 'kb' ? 'Help Center: ' + (k.module ? k.module + ' > ' : '') + k.title + (k.url ? ' (' + k.url + ')' : '') : k.title}\n${String(k.text).slice(0, 1200)}`).join('\n\n') : 'No matching sources.',
    'Transcript (oldest first):\n' + (recentTxt || '(no messages yet)'),
  ].filter(Boolean).join('\n\n');
  return { user, allowed };
}
async function askAI(system, user) {
  const o = { system, user, maxTokens: 1500, timeoutMs: 60000, temperature: 0 };
  try { return D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(o) : await D.ai.bestJSON(o); }
  catch (e) { return D.ai.bestJSON(o); }
}
function result(j, allowed, basis) {
  const reply = tidy(j.reply, allowed);
  const kbUrl = String(j.kb_url || '').trim();
  return { reply, why: clean(j.why, 240), checks: (Array.isArray(j.checks) ? j.checks : []).map((x) => clean(x, 200)).filter(Boolean).slice(0, 3),
    handover: clean(j.handover, 240), kb: clean(j.kb, 160), kbUrl: (allowed.has(kbUrl) || /^https:\/\/help\.adit\.com\//.test(kbUrl)) ? kbUrl : '',
    links: linksIn(reply), screenshots: shotsIn(reply).length, basis, at: new Date().toISOString() };
}

async function open(ref, who) {
  const c = await byRef(ref);
  if (!canSee(c, who)) throw httpError(403, `Chat ${ref} is not one of your chats`);
  const msgs = await messages(String(c.id));
  const lastClient = msgs.filter((m) => m.who === 'client').slice(-1)[0] || null;
  return { c, msgs, basis: lastClient ? lastClient.id : 'none' };
}

async function suggest(ref, who, { force = false } = {}) {
  const { c, msgs, basis } = await open(ref, who);
  const id = String(c.id);
  const hit = _sugg.get(id);
  if (!force && hit && hit.v && hit.basis === basis) return hit.v;
  if (!force && hit && hit.pending && hit.pbasis === basis) return hit.pending;
  const p = (async () => {
    const { user, allowed } = await context(c, msgs);
    const r = await askAI(SYS, user);
    const v = result(r.json || {}, allowed, basis);
    _sugg.set(id, { basis, v });
    if (_sugg.size > 300) _sugg.delete(_sugg.keys().next().value);
    return v;
  })();
  _sugg.set(id, { basis: hit && hit.basis, v: hit && hit.v, pending: p, pbasis: basis });
  try { return await p; } catch (e) { if (hit && hit.v) _sugg.set(id, { basis: hit.basis, v: hit.v }); else _sugg.delete(id); throw e; }
}

/** The agent asks Expert to change the reply ("shorter", "add the steps", "friendlier"). Nothing is sent. */
async function improve(ref, who, { instruction = '', current = '' } = {}) {
  instruction = clean(instruction, 400); current = String(current || '').slice(0, 2500);
  if (!instruction) throw httpError(400, 'Tell Expert what to change');
  if (!current.trim()) throw httpError(400, 'There is no reply to improve yet');
  const { c, msgs, basis } = await open(ref, who);
  const { user, allowed } = await context(c, msgs);
  const r = await askAI(IMPROVE, `${user}\n\nThe reply the agent has now:\n${current}\n\nThe agent's instruction: ${instruction}`);
  return Object.assign(result(r.json || {}, allowed, basis), { improved: true, instruction });
}

module.exports = { setDeps, mine, chat, suggest, improve, _shape: shape, _isOpen: isOpen, _msgText: msgText, _tidy: tidy, _canSee: canSee, _reset: () => { _recent = { at: 0, hours: 0, list: [] }; _closed = { at: 0, list: [] }; _tx.clear(); _sugg.clear(); } };
