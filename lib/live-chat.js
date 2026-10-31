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

// ── Conversations ─────────────────────────────────────────────────────
// Batch 220: SalesIQ returns about 5 conversations per read whatever the limit, and "index" is a record offset (1, 6,
// 11...), not a page number. Reading index 1..4 only ever saw the first ~8 chats, so busy hours dropped chats and ended
// ones were "not found". Lists are now read by offset, and every chat seen is remembered (number -> id) so it can be
// read directly later, even after it ends.
const _refs = new Map(); // reference number -> conversation id
function remember(c) { if (c && c.reference_id && c.id) { _refs.set(String(c.reference_id), String(c.id)); if (_refs.size > 5000) _refs.delete(_refs.keys().next().value); } }
async function readList(path, { maxReads = 10, stop = null } = {}) {
  const out = [], seen = new Set(); let index = 1;
  for (let r = 0; r < maxReads; r++) {
    const j = await D.siq.rawGet(`${path}${path.includes('?') ? '&' : '?'}index=${index}&limit=100`).catch(() => null);
    const rows = (j && j.data) || [];
    let fresh = 0; for (const c of rows) if (!seen.has(String(c.id))) { seen.add(String(c.id)); out.push(c); remember(c); fresh++; }
    if (!rows.length || !fresh) break;
    if (stop && stop(rows)) break;
    if (rows.length < 5 && !(j && j.more_data_available)) break;
    index += rows.length;
  }
  return out;
}
const older = (rows, t) => { const m = Number(rows[rows.length - 1].last_modified_time || 0); return !!m && m < t; };
let _recent = { at: 0, list: [] };
async function recent() {
  if (Date.now() - _recent.at < 10000) return _recent.list; // shared by everyone, so SalesIQ is read at most every 10 s
  // Newest activity first; an open chat has had activity recently, so stop once the rows are 3 hours old.
  const cutoff = Date.now() - 3 * 3600e3;
  if (_recent.p) return _recent.p; // one read at a time, shared
  _recent.p = readList('conversations', { maxReads: 14, stop: (rows) => older(rows, cutoff) }).then((list) => { _recent = { at: Date.now(), list }; return list; }).finally(() => { _recent.p = null; });
  return _recent.p;
}
const _one = new Map(); // id -> { at, c }
// Batch 226: a failed read (SalesIQ busy or rate limited) is not "not found": the last good copy is used, or the
// agent sees "SalesIQ is busy" and the page tries again by itself.
async function readOne(id) {
  const hit = _one.get(id); if (hit && Date.now() - hit.at < 3000) return hit.c;
  let j = null, err = null;
  for (let a = 0; a < 2 && !j; a++) {
    try { j = await D.siq.rawGet(`conversations/${id}`); }
    catch (e) { err = e; if (/\b(400|404)\b/.test(String(e.message)) && !/rate|limit|too many/i.test(e.message)) break; await new Promise((r) => setTimeout(r, 700)); }
  }
  const c = j && (j.data && j.data.id ? j.data : j.id ? j : null);
  if (c) { remember(c); _one.set(id, { at: Date.now(), c }); if (_one.size > 500) _one.delete(_one.keys().next().value); return c; }
  if (err && !/\b(400|404)\b/.test(String(err.message))) {
    if (hit) return hit.c;
    throw httpError(503, 'SalesIQ is busy right now; the chat opens again in a few seconds');
  }
  return null;
}
let _scan = { at: 0, p: null };
async function deepFind(ref) {
  // Not seen yet (or the server restarted): read further back through recent and ended chats, at most once a minute.
  if (!_scan.p || Date.now() - _scan.at > 60000) {
    _scan = { at: Date.now(), p: (async () => {
      const since = Date.now() - 72 * 3600e3;
      await readList('conversations', { maxReads: 40, stop: (rows) => older(rows, since) });
      await readList(`conversations?status=closed&from_time=${since}&to_time=${Date.now()}`, { maxReads: 40 });
    })().catch(() => {}) };
  }
  await _scan.p;
  return _refs.get(ref) || null;
}
// Batch 219: open means SalesIQ calls it open (status_key open, reopen or waiting). Missed chats ("Tracked in CRM", no
// operator took them) and ended ones never count, whatever their label says.
const isOpen = (c) => {
  if (c.end_time) return false;
  const cs = c.chat_status || {}, key = lc(cs.status_key), state = lc(cs.state_key);
  const label = String(c.status || '') + ' ' + String(cs.label || '');
  if (/tracked in crm|missed|\b(end|ended|closed?|declined|blocked|archived|completed)\b/i.test(label) || /^(end|closed|missed)$/.test(state)) return false;
  if (key) return /^(open|reopen|waiting|queued?)$/.test(key);
  return true;
};
// Who is on a chat: the attender, the owner, and anyone SalesIQ lists as a participant (a chat that was offered or
// transferred to an agent stays theirs to read).
const people = (c) => {
  const out = [c.attender && c.attender.email, c.owner && c.owner.email];
  const parts = Array.isArray(c.participants) ? c.participants : [];
  for (const p of parts) if (p && typeof p === 'object') out.push(p.email || p.email_id || (p.operator && p.operator.email));
  return out.filter((x) => typeof x === 'string' && x.includes('@')).map(lc);
};
function shape(c) {
  const v = c.visitor || {};
  return { id: String(c.id), ref: String(c.reference_id || ''), open: isOpen(c), status: (c.chat_status && c.chat_status.label) || c.status || '',
    visitor: clean(v.name || 'Visitor', 60), company: clean(v.company_name || (v.info && v.info.company) || '', 80), question: clean(c.question || '', 300),
    start: c.start_time ? new Date(Number(c.start_time)).toISOString() : null, last: c.last_modified_time ? new Date(Number(c.last_modified_time)).toISOString() : null,
    agent: clean((c.attender && c.attender.name) || '', 60), department: clean((c.department && c.department.name) || '', 60) };
}

/** The agent's open chats. */
// The agent's open chats; an admin gets every open chat (Batch 218), each marked as their own or not.
async function mine(email, { all = false } = {}) {
  const me = lc(email);
  return (await recent()).filter((c) => isOpen(c) && (all || people(c).includes(me)))
    .map((c) => Object.assign(shape(c), { own: people(c).includes(me) })).sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
async function byRef(ref, idHint) {
  ref = String(ref || '').replace(/\D/g, '');
  if (!ref) throw httpError(400, 'Type the chat number');
  let id = _refs.get(ref) || (idHint && /^\d{6,}$/.test(String(idHint)) ? String(idHint) : null);
  if (!id) { const c = (await recent()).find((x) => String(x.reference_id) === ref); if (c) id = String(c.id); }
  if (!id && Date.now() - _recent.at > 3000) { _recent.at = 0; const c = (await recent()).find((x) => String(x.reference_id) === ref); if (c) id = String(c.id); } // a chat that started seconds ago
  if (!id) id = await deepFind(ref);
  const c = id ? await readOne(id) : null;
  if (!c || String(c.reference_id) !== ref) throw httpError(404, `Chat ${ref} was not found in the last 3 days`);
  return c;
}
function canSee(c, who) { return !!(who.admin || who.spoc || people(c).includes(lc(who.email))); }

// ── Transcript (cached 8 s per chat) ──────────────────────────────────
const _tx = new Map();
const _files = new Map(); // "chatId:msgId" -> fileInfo (refs stay on the server)
function msgText(m) {
  const x = m.message;
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'object') return x.text || x.msg || (x.file && ('[File: ' + (x.file.name || 'attachment') + ']')) || (x.url ? '[Link] ' + x.url : '') || '';
  return String(x);
}
// Batch 217: what SalesIQ tells us about a file the client or agent sent (name, type, and every id or link that can fetch it).
function fileInfo(m) {
  const x = m && m.message; if (!x || typeof x !== 'object') return null;
  const f = x.file || x.attachment || (/file|attach|image/i.test(String(m.type || '')) ? x : null);
  if (!f || typeof f !== 'object') return null;
  const refs = [];
  const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 3) return; for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && v && (/url|link|href|path|key|id/i.test(k) || /^https?:|^\/|attachments\//.test(v))) refs.push({ k, v }); else if (typeof v === 'number' && /id$/i.test(k)) refs.push({ k, v: String(v) }); else if (v && typeof v === 'object') walk(v, d + 1); } };
  walk(f, 0);
  const name = String(f.name || f.file_name || 'attachment');
  const type = String(f.type || f.content_type || f.mime_type || '');
  return { name, type, size: Number(f.size || 0) || null, image: /^image\//i.test(type) || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(name), refs, keys: Object.keys(f) };
}
async function messages(id) {
  const hit = _tx.get(id);
  if (hit && Date.now() - hit.at < 3000) return hit.v; // short, so a new client message shows within seconds
  const out = [], seen = new Set();
  let after = 0; // SalesIQ pages messages by time (from_time), not by index
  for (let page = 1; page <= 5; page++) {
    const j = await D.siq.rawGet(`conversations/${id}/messages?limit=100${after ? '&from_time=' + after : ''}`);
    let fresh = 0;
    for (const m of (j && j.data) || []) {
      after = Math.max(after, Number(m.time || 0) + 1);
      if (seen.has(m.id)) continue; seen.add(m.id); fresh++;
      const type = (m.sender && m.sender.type) || 'system';
      const text = clean(msgText(m), 2000);
      if (!text) continue;
      const fi = fileInfo(m);
      out.push(Object.assign({ id: String(m.id), at: m.time ? new Date(Number(m.time)).toISOString() : null, who: type === 'visitor' ? 'client' : type === 'operator' ? 'agent' : type === 'bot' ? 'bot' : 'system',
        name: clean((m.sender && m.sender.name) || '', 60), text, seq: Number(m.sequence_id || 0) }, fi ? { file: { name: clean(fi.name, 120), type: fi.type, size: fi.size, image: fi.image } } : {}));
      if (fi) _files.set(id + ':' + String(m.id), fi);
    }
    if (!fresh || !(j && j.more_data_available)) break;
  }
  out.sort((a, b) => (a.seq - b.seq) || String(a.at).localeCompare(String(b.at)));
  _tx.set(id, { at: Date.now(), v: out });
  if (_tx.size > 300) _tx.delete(_tx.keys().next().value);
  return out;
}


// ── Images the client sent (Batch 217) ────────────────────────────────
const _img = new Map(); // "chatId:msgId" -> { at, mime, buf } | { at, error }
const _diag = [];
async function loadFile(chatId, msgId) {
  const key = chatId + ':' + msgId, hit = _img.get(key);
  if (hit && (hit.buf || Date.now() - hit.at < 60e3)) { if (hit.error) throw httpError(404, hit.error); return hit; }
  const fi = _files.get(key);
  if (!fi) throw httpError(404, 'That file is not in this chat');
  const sn = D.siq.screenName ? D.siq.screenName() : '';
  const tries = [];
  // SalesIQ serves the file at conversations/{id}/attachments/{attachment_id} (confirmed live); try that first.
  const refs = fi.refs.slice().sort((a, b) => (b.k === 'attachment_id') - (a.k === 'attachment_id'));
  for (const r of refs) {
    const v = String(r.v);
    if (/blur|thumb|dimension|width|height/i.test(r.k) || v.length > 400) continue; // inline previews, not links
    if (r.k === 'attachment_id' && /^\d+$/.test(v)) tries.push(`/api/v2/${sn}/conversations/${chatId}/attachments/${v}`);
    else if (/^https?:\/\//i.test(v) || /^\/(api|attachments)\//.test(v)) tries.push(v);
    else if (/^attachments\//i.test(v)) tries.push(`/api/v2/${sn}/conversations/${chatId}/${v}`, `/api/v1/${sn}/chats/${chatId}/${v}`);
    else if (/^[\w-]{6,}$/.test(v)) tries.push(`/api/v2/${sn}/conversations/${chatId}/attachments/${v}`);
  }
  const log = [];
  for (const t of [...new Set(tries)].slice(0, 8)) {
    try {
      let r = await D.siq.fetchFile(t);
      if (r.json) { const u = r.json.data && (r.json.data.download_url || r.json.data.url) || r.json.download_url; log.push(`${t.replace(/\d{6,}/g, 'N')} -> ${r.status} json${u ? ' download_url' : ''}`); if (!u) continue; r = await D.siq.fetchFile(u, { auth: false }); }
      log.push(`${t.replace(/\d{6,}/g, 'N')} -> ${r.status} ${r.mime || ''} ${r.buf ? r.buf.length : 0}b`);
      const mime = sniff(r.buf) || r.mime || '';
      if (r.ok && r.buf && r.buf.length > 100 && /^image\//i.test(mime)) { const v = { at: Date.now(), mime, buf: r.buf }; _img.set(key, v); trimImg(); return v; }
    } catch (e) { log.push(`${t.replace(/\d{6,}/g, 'N')} -> ${String(e.message || e).slice(0, 80)}`); }
  }
  _diag.unshift({ at: new Date().toISOString(), name: fi.name, type: fi.type, keys: fi.keys, refKeys: fi.refs.map((r) => r.k), log }); _diag.length = Math.min(_diag.length, 20);
  _img.set(key, { at: Date.now(), error: 'The image could not be loaded from SalesIQ' });
  throw httpError(404, 'The image could not be loaded from SalesIQ');
}
// SalesIQ sends files as application/download, so the type is read from the first bytes.
function sniff(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}
function trimImg() { let total = 0; for (const [k, v] of [..._img.entries()].reverse()) { total += v.buf ? v.buf.length : 0; if (total > 60e6) _img.delete(k); } }
async function image(ref, who, msgId) {
  const { c } = await open(ref, who);
  return loadFile(String(c.id), String(msgId));
}
// What the client's screenshots show, read by the AI once per image (cached).
const _seen = new Map();
async function describeImages(chatId, msgs, context) {
  if (!D.ai || !D.ai.describeImages) return {};
  const imgs = msgs.filter((m) => m.who === 'client' && m.file && m.file.image).slice(-4);
  const out = {}, todo = [];
  for (const m of imgs) { const k = chatId + ':' + m.id; if (_seen.has(k)) out[m.id] = _seen.get(k); else todo.push(m); }
  if (todo.length) {
    const got = [];
    for (const m of todo) { try { const f = await loadFile(chatId, m.id); if (f.buf.length < 4.5e6) got.push({ m, mime: f.mime, b64: f.buf.toString('base64') }); } catch (e) { _seen.set(chatId + ':' + m.id, ''); } }
    if (got.length) {
      const d = await D.ai.describeImages({ images: got.map((g) => ({ mime: g.mime, b64: g.b64 })), context: String(context || '').slice(0, 600), timeoutMs: 30000 }).catch(() => []);
      got.forEach((g, i) => { const t = clean(d[i] || '', 900); _seen.set(chatId + ':' + g.m.id, t); out[g.m.id] = t; });
    }
  }
  if (_seen.size > 500) _seen.delete(_seen.keys().next().value);
  return out;
}

// ── The client's account (Batch 216) ─────────────────────────────────
// The Adit account number the client gives in the chat (or the agent types in) loads the account review: name, deal stage,
// CSM, onboarding, escalation, health and the open issues, for the banner and for Expert's reply.
const ACCT_NEAR = /\b(?:acc(?:oun)?t|acct|a\/c)\b[^0-9]{0,40}?#?\s*(\d{4,6})\b/i;
function findAcct(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]; if (m.who !== 'client') continue;
    const t = String(m.text || '').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, ' ');
    const a = ACCT_NEAR.exec(t); if (a) return a[1];
    // A bare 5 digit number right after the agent asked for the account number
    const asked = msgs.slice(Math.max(0, i - 3), i).some((x) => x.who === 'agent' && /account\s*(number|no|#)/i.test(x.text));
    const b = asked && /(?:^|\D)(\d{5})(?!\d)/.exec(t); if (b) return b[1];
  }
  return null;
}
const _acct = new Map();
function accountFor(key) {
  const m = /^(email|phone):(.+)$/.exec(key), via = m ? m[1] : 'number', n = m ? '' : key;
  const hit = _acct.get(key);
  if (hit && (hit.pending || Date.now() - hit.at < 10 * 60e3)) return hit.v || { number: n, via, loading: true };
  const pending = (async () => {
    let v;
    try {
      const r = D.expert && D.expert.crmContext ? await Promise.race([D.expert.crmContext(n, m ? { query: m[2] } : { acct: true }), new Promise((res) => setTimeout(() => res('timeout'), 30000))]) : null;
      if (r === 'timeout') v = { number: n, via, found: false, error: 'The account record took too long; it is tried again in a minute' };
      else if (!r) v = { number: n, via, found: false };
      else {
        const H = r.header || {}, f = r.facts || {}, a = r.account || {}, an = r.analysis || null;
        const tickets = r.accountId ? await accountTickets(r.accountId).catch(() => []) : [];
        v = { number: a.number || n, via, found: true, recent: tickets, name: a.name || H.account || '', city: a.city || '', ehr: a.ehr || '', locations: a.locations || '', deal: H.deal || '', stage: f.stage, csm: f.csm, ob: f.ob,
          escalation: f.escalation && !/^none$/i.test(f.escalation) ? f.escalation : '', escalationOwner: H.escalationOwner || '', risk: f.risk, contractEnd: f.contractEnd, health: f.health, mood: f.mood,
          fcr: f.fcr, csat: f.csat, tickets: a.tickets, analysis: an, text: r.text };
      }
    } catch (e) { v = { number: n, via, found: false, error: 'Could not read the account record' }; }
    _acct.set(key, { at: v.error ? Date.now() - 9 * 60e3 : Date.now(), v });
    return v;
  })();
  _acct.set(key, { at: Date.now(), pending });
  if (_acct.size > 200) _acct.delete(_acct.keys().next().value);
  return { number: n, via, loading: true };
}
// The account's recent tickets and, where known, what fixed them.
async function accountTickets(accountId) {
  if (!D.kb) return [];
  const rows = await D.kb('desk_tickets', { select: 'id,ticket_number,subject,status,created_time,channel', filters: [`aria_account_id:eq:${accountId}`], order_by: 'created_time', desc: true, limit: 8 }).catch(() => []);
  const fix = await Promise.all(rows.slice(0, 6).map((t) => D.kb('case_index', { select: 'ref,resolution', filters: [`ref:eq:${t.id}`], limit: 1 }).then((x) => x[0] || null).catch(() => null)));
  return rows.map((t, i) => ({ number: String(t.ticket_number || ''), subject: clean(t.subject, 140), status: clean(t.status, 40), at: String(t.created_time || '').slice(0, 10), channel: clean(t.channel, 20),
    fix: fix[i] && fix[i].resolution ? clean(String(fix[i].resolution).replace(/<[^>]+>/g, ' '), 400) : '' }));
}
const acctNum = (msgs, given) => { const g = String(given || '').replace(/\D/g, ''); return g.length >= 4 && g.length <= 7 ? g : findAcct(msgs); };
// Batch 222: when the client has not given their account number, find the account from what SalesIQ knows about the
// visitor (an account number passed by the Adit app, their email, their phone) or a phone number they typed.
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
function visitorKeys(c) {
  const v = c.visitor || {}, out = { acct: '', email: '', phone: '' };
  const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 3) return; for (const [k, x] of Object.entries(o)) {
    if (x && typeof x === 'object') { walk(x, d + 1); continue; }
    const val = String(x == null ? '' : x).trim(); if (!val) continue;
    if (!out.acct && /acc(oun)?t|acct|client.?id|location.?id|customer.?id/i.test(k) && /^\d{4,7}$/.test(val)) out.acct = val;
    else if (!out.email && /mail/i.test(k) && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(val)) out.email = val.toLowerCase();
    else if (!out.phone && /phone|mobile|contact.?number/i.test(k) && val.replace(/\D/g, '').length >= 10) out.phone = val.replace(/\D/g, '').slice(-10);
  } };
  walk(v, 0);
  return out;
}
function acctKey(c, msgs, given) {
  const n = acctNum(msgs, given); if (n) return n;
  const vk = visitorKeys(c);
  if (vk.acct) return vk.acct;
  if (vk.email && !/@adit\.com$/i.test(vk.email)) return 'email:' + vk.email;
  if (vk.phone) return 'phone:' + vk.phone;
  for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; if (m.who !== 'client') continue; const e = /[^@\s<>()]+@[^@\s<>()]+\.[a-z]{2,}/i.exec(m.text); if (e && !/@adit\.com$/i.test(e[0])) return 'email:' + e[0].toLowerCase(); const p = PHONE_RE.exec(m.text); if (p) return 'phone:' + p[0].replace(/\D/g, '').slice(-10); }
  return null;
}
const banner = (v) => { if (!v) return null; const o = Object.assign({}, v); delete o.text; return o; };

const _ctx = new Map(); // chatId -> { similar, images, situation }
async function chat(ref, who, { acct = '' } = {}) {
  const { c, msgs, basis } = await open(ref, who);
  const sg = _sugg.get(String(c.id));
  const n = acctKey(c, msgs, acct);
  const cx = _ctx.get(String(c.id)) || {};
  const seen = {}; for (const m of msgs) { const k = String(c.id) + ':' + m.id; if (m.file && _seen.has(k)) seen[m.id] = _seen.get(k); }
  return { chat: shape(c), messages: msgs.map((m) => seen[m.id] ? Object.assign({}, m, { seen: seen[m.id] }) : m), lastClientId: basis === 'none' ? null : basis, suggestion: sg && sg.v && sg.basis === basis ? sg.v : null,
    account: n ? banner(accountFor(n)) : null, similar: cx.similar || [], silence: c && isOpen(c) ? silence(msgs) : null };
}

// ── The next reply ────────────────────────────────────────────────────
const _sugg = new Map();
const SYS = `You are Adit Expert, a senior T1 support specialist at Adit (software for dental, orthodontic, optometry and chiropractic offices: texting, calls and VoIP, reminders, forms, payments, reviews, scheduling, EHR sync, AI front desk). You help an agent answer a LIVE SalesIQ chat.
Work in two steps.
1. Understand. Read the whole transcript, the screenshots the client sent (described for you), the client's account record and their recent tickets, and the similar solved cases. Work out what the client is actually trying to do, what has already been tried or answered, what is still missing, and what the client's LATEST message means in that context (a short "yes" or "no" answers the agent's last question, so move forward, never ask again). If this account had the same problem before, or a solved case shows the real fix, use it.
2. Reply. Write the agent's NEXT reply to the latest message: specific to this client and this problem, never generic. Prefer the concrete next step or the answer over a restatement. Name the exact screen, menu path or setting from the sources. 1 to 3 short chat messages separated by a blank line, one or two sentences each; numbered steps are fine when the client has to do something. Ask at most one question, and only when it is needed to move forward.
Rules:
- Answer from the Help Center, the team rules, Adit Updates, the account record and the solved cases given. Never invent a feature, setting, price or timeline. If the sources do not cover it, say what you will check, honestly.
- When a Help Center article given in the sources helps, put its full link on its own line. Only links that appear in the sources.
- Where a screenshot from the agent would help the client find a button or setting, put a placeholder on its own line, exactly like: [Screenshot: Settings > Phone > Call Forwarding, the Forward To field]. At most 2.
- Never ask for something the client already gave (account number, name, phone, a screenshot). Do not repeat what the agent already said. No filler like "I want to make sure I understand".
- T1 rules: anything a Help Center article covers is done by T1 in the chat. T1 cannot make outbound calls. Escalations, cancellations and port-outs go to the account CSM or the escalation manager. Never mention internal teams, tiers, tickets process, CSM names, health or escalation status to the client.
- If the chat is over or only needs a closing, write a short closing message.
- Plain words, no emoji, no em or en dashes.
Reply with JSON: {"situation":"one or two lines for the agent: what the client needs, what is known, what is missing","reply":"the message(s) to send","why":"one line: why this is the right next step, naming the source used (e.g. Help Center article, solved case #123456, the account's ticket #123456)","checks":["what the agent should check in Adit before sending (0 to 3)"],"handover":"if T1 cannot finish this in chat, what to do next, else ''","kb":"the Help Center article title used, or ''","kb_url":"its link, or ''","cases":["ticket numbers of the solved cases or account tickets you relied on"]}`;
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

async function context(c, msgs, acct) {
  const n = acctKey(c, msgs, acct);
  let ac = n ? accountFor(n) : null;
  if (ac && ac.loading) { const h = _acct.get(n); if (h && h.pending) ac = await Promise.race([h.pending, new Promise((r) => setTimeout(() => r(null), 8000))]); }
  const s = shape(c), chatId = String(c.id);
  const clientTxt = msgs.filter((m) => m.who === 'client' && !m.file).map((m) => m.text);
  const topic = [s.question, ...clientTxt.slice(-4), ...msgs.filter((m) => m.who === 'agent').slice(-2).map((m) => m.text)].join(' ').replace(/\b\d{5,}\b/g, ' ').slice(0, 900);
  const [kb, rules, ups, cases, seenImg] = await Promise.all([
    D.expert.searchLocal([topic, clientTxt.slice(-1)[0] || ''], { limit: 8, maxChars: 9000 }).catch(() => []),
    D.expert.rules().catch(() => []),
    D.expert.updatesFor ? D.expert.updatesFor(topic).catch(() => '') : '',
    D.expert.searchCases ? Promise.race([D.expert.searchCases(topic), new Promise((r) => setTimeout(() => r([]), 10000))]).catch(() => []) : [],
    describeImages(chatId, msgs, topic).catch(() => ({})),
  ]);
  const similar = (cases || []).slice(0, 5).map((x) => ({ number: x.number || '', title: x.title, module: x.module, at: x.at, text: String(x.text || '').slice(0, 700) }));
  _ctx.set(chatId, { similar: similar.map((x) => ({ number: x.number, title: x.title, module: x.module, at: x.at, fix: (String(x.text).split('What fixed it: ')[1] || '').slice(0, 300) })) });
  if (_ctx.size > 300) _ctx.delete(_ctx.keys().next().value);
  const recentTxt = msgs.slice(-40).map((m) => `${m.who === 'client' ? 'Client' : m.who === 'agent' ? 'Agent' : m.who === 'bot' ? 'Bot' : 'System'}: ${scrub(m.text)}${seenImg[m.id] ? ' (the screenshot shows: ' + scrub(seenImg[m.id]) + ')' : m.file && m.file.image && m.who === 'client' ? ' (screenshot could not be read)' : ''}`).join('\n');
  const allowed = new Set(kb.map((k) => k.url).filter(Boolean));
  const user = [
    `Chat ${s.ref} with ${s.visitor}${s.company ? ' (' + s.company + ')' : ''}, status ${s.status}${s.department ? ', department ' + s.department : ''}.`,
    'Team rules:\n' + (rules || []).map((r) => `- ${r.title}: ${r.body}`).join('\n'),
    ups ? 'Adit Updates (recent changes; a change wins over older Help Center text):\n' + ups : '',
    ac && ac.found && ac.text ? 'The client\'s account record (internal, for you only; use it to answer better, never read it out or mention CSM names, health, risk or escalation to the client):\n' + ac.text : '',
    ac && ac.found && (ac.recent || []).length ? 'This account\'s recent tickets (newest first; a repeat of the same problem matters):\n' + ac.recent.map((t) => `- #${t.number} ${t.at} [${t.status}] ${t.subject}${t.fix ? '\n  What fixed it: ' + t.fix : ''}`).join('\n') : '',
    similar.length ? 'Similar solved tickets and chats from other clients:\n' + similar.map((x, i) => `[C${i + 1}] #${x.number} ${x.title} (${x.module}, ${x.at})\n${x.text}`).join('\n\n') : '',
    kb.length ? 'Sources:\n' + kb.map((k, i) => `[S${i + 1}] ${k.src === 'kb' ? 'Help Center: ' + (k.module ? k.module + ' > ' : '') + k.title + (k.url ? ' (' + k.url + ')' : '') : k.title}\n${String(k.text).slice(0, 1200)}`).join('\n\n') : 'No matching sources.',
    'Transcript (oldest first):\n' + (recentTxt || '(no messages yet)'),
  ].filter(Boolean).join('\n\n');
  return { user, allowed };
}
async function askAI(system, user) {
  const o = { system, user, maxTokens: 2000, timeoutMs: 60000, temperature: 0 };
  try { return D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(o) : await D.ai.bestJSON(o); }
  catch (e) { return D.ai.bestJSON(o); }
}
function result(j, allowed, basis) {
  const reply = tidy(j.reply, allowed);
  const kbUrl = String(j.kb_url || '').trim();
  return { situation: clean(j.situation, 300), cases: (Array.isArray(j.cases) ? j.cases : []).map((x) => String(x).replace(/\D/g, '')).filter(Boolean).slice(0, 5), reply, why: clean(j.why, 300), checks: (Array.isArray(j.checks) ? j.checks : []).map((x) => clean(x, 200)).filter(Boolean).slice(0, 3),
    handover: clean(j.handover, 240), kb: clean(j.kb, 160), kbUrl: (allowed.has(kbUrl) || /^https:\/\/help\.adit\.com\//.test(kbUrl)) ? kbUrl : '',
    links: linksIn(reply), screenshots: shotsIn(reply).length, basis, at: new Date().toISOString() };
}

async function open(ref, who, idHint) {
  const c = await byRef(ref, idHint || (who && who.id));
  if (!canSee(c, who)) throw httpError(403, `Chat ${ref} is not one of your chats`);
  const msgs = await messages(String(c.id));
  const lastClient = msgs.filter((m) => m.who === 'client').slice(-1)[0] || null;
  return { c, msgs, basis: lastClient ? lastClient.id : 'none' };
}

async function suggest(ref, who, { force = false, acct = '' } = {}) {
  const { c, msgs, basis } = await open(ref, who);
  const id = String(c.id);
  const hit = _sugg.get(id);
  if (!force && hit && hit.v && hit.basis === basis) return hit.v;
  if (!force && hit && hit.pending && hit.pbasis === basis) return hit.pending;
  const p = (async () => {
    const { user, allowed } = await context(c, msgs, acct);
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
async function improve(ref, who, { instruction = '', current = '', acct = '' } = {}) {
  instruction = clean(instruction, 400); current = String(current || '').slice(0, 2500);
  if (!instruction) throw httpError(400, 'Tell Expert what to change');
  if (!current.trim()) throw httpError(400, 'There is no reply to improve yet');
  const { c, msgs, basis } = await open(ref, who);
  const { user, allowed } = await context(c, msgs, acct);
  const r = await askAI(IMPROVE, `${user}\n\nThe reply the agent has now:\n${current}\n\nThe agent's instruction: ${instruction}`);
  return Object.assign(result(r.json || {}, allowed, basis), { improved: true, instruction });
}

// ── Follow-ups when the client goes quiet (Batch 223) ─────────────────
// After the agent writes and the client does not answer: 2 minutes -> follow-up 1, 5 -> follow-up 2, 7 -> follow-up 3 (the
// closure that creates a ticket). The text is the team's own standard follow-up, learned from what agents sent in past
// chats, with the blanks filled from the chat and the account.
const STAGES = [{ n: 1, at: 2 }, { n: 2, at: 5 }, { n: 3, at: 7 }];
const minsSince = (iso) => Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
function silence(msgs) {
  const real = msgs.filter((m) => m.who === 'client' || m.who === 'agent');
  let i = real.length - 1; while (i >= 0 && real[i].who === 'agent') i--;
  const waiting = real.slice(i + 1); // the agent's messages since the client last wrote
  if (!waiting.length || i < 0) return null; // the client has not written yet, or wrote last
  const since = waiting[0].at, mins = minsSince(since), lastAgent = waiting[waiting.length - 1].at;
  const due = STAGES.filter((s) => mins >= s.at).map((s) => s.n).pop() || 0;
  const sent = Math.max(0, waiting.length - 1); // follow-ups already sent after the first reply
  const next = STAGES.find((s) => s.n > sent) || null;
  return { since, lastAgent, minutes: Math.floor(mins), sent, due: due > sent ? due : 0, next: next ? { n: next.n, at: next.at, inMin: Math.max(0, Math.ceil(next.at - mins)) } : null };
}
// The team's own follow-ups, learned from past chats (Batch 223b): what agents actually sent when a client went quiet,
// condensed by the AI into three standard replies with blanks. Rebuilt once a day; kept in the lasting cache.
let _tpl = { at: 0, v: null, building: null };
const TPL_KEY = 'lc:followup-templates';
const LEARN = `You read real follow-up messages that Adit T1 chat agents sent when a client stopped answering in a live chat, grouped by how many follow-ups had already been sent. Write the team's three standard follow-ups:
1. followup1: sent about 2 minutes after the client went quiet (a friendly check they are still there).
2. followup2: about 5 minutes (a second check that says the chat will close soon).
3. followup3: about 7 minutes, the closure (the chat is being closed; a ticket is created so the account or onboarding manager follows up; how to reach them; the ticket number).
Keep the team's own wording and tone; take the most common phrasing, not a new one. Replace client and account details with blanks exactly like [First name], [Manager name], [Manager phone], [Ticket number]. No emoji, no em or en dashes.
Reply with JSON: {"followup1":"...","followup2":"...","followup3":"...","notes":"one line on what the team usually does"}`;
async function learnTemplates() {
  // Batch 224: the last 30 days, up to 500 ended chats, stopping once each step has 100 examples.
  const since = Date.now() - 30 * 864e5;
  const chats = (await readList(`conversations?status=closed&from_time=${since}&to_time=${Date.now()}`, { maxReads: 110 })).slice(0, 500);
  const groups = { 1: [], 2: [], 3: [] };
  for (const c of chats) {
    if (groups[1].length >= 100 && groups[2].length >= 100 && groups[3].length >= 100) break;
    const msgs = await messages(String(c.id)).catch(() => []);
    await new Promise((r) => setTimeout(r, 400)); // gentle on SalesIQ, so live chats are never starved
    const real = msgs.filter((m) => (m.who === 'client' || m.who === 'agent') && !m.file);
    // Runs of agent messages with no client reply in between: the 2nd, 3rd and 4th are follow-ups to silence.
    let run = [];
    const flush = (endOfChat) => {
      if (run.length > 1) run.slice(1, 4).forEach((m, i) => { const gap = (Date.parse(m.at) - Date.parse(run[i].at)) / 60000; if (gap >= 1) groups[i + 1].push(scrub(m.text).slice(0, 350)); });
      if (endOfChat && run.length > 1) { const last = run[run.length - 1]; if (/ticket|unavailable|clos/i.test(last.text)) groups[3].push(scrub(last.text).slice(0, 450)); }
      run = [];
    };
    for (const m of real) { if (m.who === 'agent') run.push(m); else flush(false); }
    flush(true);
  }
  const uniq = (a) => [...new Set(a)].slice(0, 100);
  const ex = { 1: uniq(groups[1]), 2: uniq(groups[2]), 3: uniq(groups[3]) };
  const total = ex[1].length + ex[2].length + ex[3].length;
  if (total < 5) return { ok: false, examples: total, chats: chats.length };
  const user = [1, 2, 3].map((n) => `Follow-up ${n} examples:\n${ex[n].map((t) => '- ' + t.replace(/\s+/g, ' ')).join('\n') || '(none found)'}`).join('\n\n');
  const opts = { system: LEARN, user, maxTokens: 2000, timeoutMs: 150000, temperature: 0 }; // a long read of many examples
  let r; try { r = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(opts) : await D.ai.bestJSON(opts); } catch (e) { r = await D.ai.bestJSON(opts); }
  const j = (r && r.json) || {};
  const tidyT = (t) => String(t || '').replace(/[\u2014\u2013]/g, ',').trim().slice(0, 1200);
  const v = { 1: tidyT(j.followup1), 2: tidyT(j.followup2), 3: tidyT(j.followup3), notes: clean(j.notes, 240), examples: { 1: ex[1].length, 2: ex[2].length, 3: ex[3].length }, chats: chats.length, at: new Date().toISOString() };
  if (!v[1] || !v[3]) return { ok: false, examples: total, chats: chats.length };
  return { ok: true, v };
}
async function templates({ rebuild = false } = {}) {
  if (!rebuild && _tpl.v && Date.now() - _tpl.at < 6 * 3600e3) return _tpl.v;
  if (!rebuild && !_tpl.v && D.store) {
    const hit = await D.store.get(TPL_KEY, 0).catch(() => null);
    if (hit) { _tpl.v = hit; _tpl.at = Date.now(); if (Date.now() - Date.parse(hit.at) < 24 * 3600e3) return hit; }
  }
  if (!_tpl.building) {
    _tpl.building = learnTemplates().then(async (r) => { if (r.ok) { _tpl.v = r.v; _tpl.at = Date.now(); if (D.store) await D.store.set(TPL_KEY, r.v).catch(() => {}); } else _tpl.lastFail = r; return r; })
      .catch((e) => ({ ok: false, error: e.message })).finally(() => { _tpl.building = null; });
  }
  if (rebuild) return _tpl.building;
  return _tpl.v; // null while the first build runs; the follow-up is written in the usual style meanwhile
}
const STYLE = `Follow-up 1 (2 minutes quiet): a short, friendly check that the client is still there.
Follow-up 2 (5 minutes quiet): a second, slightly firmer check, saying the chat will close soon if we do not hear back.
Follow-up 3 (7 minutes quiet, closure): "<First name>, since you're unavailable on chat, I'll create a ticket so the account / onboarding manager can follow up via phone or email within 24 - 48 hours. If you'd prefer faster assistance, you can contact <manager name>, directly at <phone>. They are available Monday - Friday, 7:00 AM - 4:00 PM CST. Your ticket number is <ticket number>. Please keep it for future reference."`;
const FILL = `You prepare a follow-up message a T1 chat agent at Adit sends when a client stops answering in a live chat.
You get the team's standard follow-up for this step (learned from their past chats, with blanks such as [First name] or [Ticket number]) or, when there is none yet, the style to follow. Fill the blanks from the chat and the client's account record: the client's first name, the account or onboarding manager's name (the CSM for a live account, the onboarding owner during onboarding), and what the client was asking about. Keep that wording exactly; change only the blanks. A blank you cannot fill from the facts (a phone number, the ticket number before it exists) becomes a short bracket the agent fills in, like [ticket number] or [manager phone]. Never invent names, numbers or times. No emoji, no em or en dashes.
Reply with JSON: {"reply":"the message to send","blanks":["what the agent still has to fill in, if anything"]}`;
const _fu = new Map(); // chatId:stage:lastAgent -> result
async function followup(ref, who, { acct = '' } = {}) {
  const { c, msgs } = await open(ref, who);
  const si = silence(msgs);
  if (!si || !si.due) return { silence: si, followup: null };
  const key = String(c.id) + ':' + si.due + ':' + si.lastAgent;
  if (_fu.has(key)) return { silence: si, followup: _fu.get(key) };
  const tp = await templates().catch(() => null);
  const pick = tp && tp[si.due] ? { text: tp[si.due] } : null;
  const n = acctKey(c, msgs, acct); let ac = n ? accountFor(n) : null;
  if (ac && ac.loading) { const h = _acct.get(n); if (h && h.pending) ac = await Promise.race([h.pending, new Promise((r) => setTimeout(() => r(null), 6000))]); }
  const s = shape(c);
  const facts = [`Client name in SalesIQ: ${s.visitor}${s.company ? ' (' + s.company + ')' : ''}. Agent: ${s.agent || 'the agent'}.`,
    ac && ac.found ? `Account: ${ac.name}${ac.number ? ' #' + ac.number : ''}, stage ${ac.stage || 'unknown'}, CSM ${ac.csm || 'unknown'}, onboarding owner ${ac.ob || 'unknown'}.` : 'Account: not identified.',
    'Last messages:\n' + msgs.slice(-12).map((m) => `${m.who === 'client' ? 'Client' : m.who === 'agent' ? 'Agent' : 'System'}: ${scrub(m.text)}`).join('\n')].join('\n');
  const step = `This is follow-up ${si.due} of 3 (the client has been quiet ${si.minutes} minutes${si.due === 3 ? '; this is the closure message' : ''}).`;
  const user = pick ? `${step}\nThe team's standard follow-up ${si.due}:\n${pick.text}\n\n${facts}` : `${step}\nThere is no standard follow-up yet; write it in this style:\n${STYLE}\n\n${facts}`;
  let r = null; try { r = await askAI(FILL, user); } catch (e) { r = null; }
  const j = (r && r.json) || {};
  const text = String(j.reply || (pick ? pick.text : '')).replace(/[\u2014\u2013]/g, ',').trim().slice(0, 1500);
  const v = { stage: si.due, reply: text, source: pick ? 'learned' : 'ai', blanks: (Array.isArray(j.blanks) ? j.blanks : []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 4),
    note: pick ? '' : 'Expert is still learning your team\'s follow-ups from past chats, so it wrote this one in the usual style.', at: new Date().toISOString() };
  _fu.set(key, v); if (_fu.size > 300) _fu.delete(_fu.keys().next().value);
  return { silence: si, followup: v };
}

module.exports = { setDeps, followup, silence, followupTemplates: async (o) => ({ templates: await templates(o || {}), lastFail: _tpl.lastFail || null, building: !!_tpl.building }), _silence: silence, openAll: async () => (await recent()).filter(isOpen), mine, chat, suggest, improve, image, imageDiag: () => _diag.slice(), _fileInfo: fileInfo, _sniff: sniff, _shape: shape, _isOpen: isOpen, _msgText: msgText, _tidy: tidy, _canSee: canSee, _findAcct: findAcct, _visitorKeys: visitorKeys, _acctKey: acctKey, _reset: () => { _recent = { at: 0, list: [] }; _refs.clear(); _one.clear(); _scan = { at: 0, p: null }; _acct.clear(); _fu.clear(); _tpl = { at: 0, v: null, building: null }; _ctx.clear(); _files.clear(); _img.clear(); _seen.clear(); _tx.clear(); _sugg.clear(); } };
