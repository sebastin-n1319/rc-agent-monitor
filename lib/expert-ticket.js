'use strict';
/**
 * Batch 189: Adit Expert reads a ticket. Give a ticket number and it pulls the ticket from Zoho Desk: the details,
 * every email, chat and call note on it in order (with internal comments), the history (status, owner and team
 * changes, transfers), and the client's earlier tickets. Expert then reviews how it has gone and how to handle or
 * answer it better. Phone numbers and email addresses are removed before anything reaches the AI.
 */
let desk = null, ai = null;
function setDesk(d) { desk = d; }
function setAI(a) { ai = a; }
// Batch 190: screenshots in the latest messages (pasted in the email or attached) are read by the AI.
const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;
function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
}
function imagesIn(f) {
  const out = [];
  const html = String((f && f.content) || '');
  const re = /<img\b[^>]*>/gi; let m;
  while ((m = re.exec(html))) {
    const tag = m[0], src = (tag.match(/src="([^"]+)"/i) || [])[1] || '';
    const w = Number((tag.match(/width="(\d+)"/i) || [])[1] || 0), h = Number((tag.match(/height="(\d+)"/i) || [])[1] || 0);
    if (!/inlineImages|\/attachments\//.test(src)) continue; // skip outside links (logos, trackers)
    if ((w && w < 40) || (h && h < 20)) continue;          // icons
    out.push(src);
  }
  for (const a of (f && f.attachments) || []) if (IMG_EXT.test(a.name || '') && Number(a.size || 0) < 4 * 1024 * 1024 && a.href) out.push(a.href);
  return out;
}
async function readImages(threadsFull, context, info, max = 4) {
  if (!ai || !ai.describeImages || !desk || !desk.fetchBinary) { info.err = 'not wired'; return {}; }
  // newest messages first, client messages before agent ones and notes, up to max images
  const order = threadsFull.filter(Boolean).sort((a, b) => (a.direction === 'in' ? 0 : 1) - (b.direction === 'in' ? 0 : 1) || Date.parse(b.createdTime) - Date.parse(a.createdTime));
  const want = [];
  for (const f of order) for (const src of imagesIn(f)) if (want.length < max) want.push({ tid: f.id, src });
  info.found = want.length;
  if (!want.length) return {};
  const errs = [];
  const got = await pool(want, 2, async (w) => {
    try { const r = await desk.fetchBinary(w.src); const mime = sniff(r.buf) || r.mime;
      if (!/^image\/(png|jpeg|gif|webp)$/.test(mime)) { errs.push('type ' + (r.mime || '?') + ' ' + r.buf.length + 'b'); return null; }
      if (r.buf.length < 400) { errs.push('tiny ' + r.buf.length + 'b'); return null; }
      return { tid: w.tid, mime, b64: r.buf.toString('base64') };
    } catch (e) { errs.push(String(e.message || e).slice(0, 80)); return null; } });
  const imgs = got.filter(Boolean);
  info.fetched = imgs.length; if (errs.length) info.err = errs.slice(0, 3).join('; ');
  if (!imgs.length) return {};
  // read 4 at a time so each image gets a full description
  const groups = []; for (let i = 0; i < imgs.length; i += 4) groups.push(imgs.slice(i, i + 4));
  const said = [].concat(...(await pool(groups, 2, (g) => ai.describeImages({ images: g, context }).then(r => g.map((_, i) => r[i] || ''), (e) => { info.err = 'read: ' + e.message; return g.map(() => ''); }))));
  info.read = said.filter(Boolean).length; if (!info.read && !info.err) info.err = 'AI returned nothing';
  const byThread = {};
  imgs.forEach((im, i) => { if (said[i]) (byThread[im.tid] = byThread[im.tid] || []).push(scrub(cut(said[i], 600))); });
  return byThread;
}
// Batch 198: attached files are opened and read, not just named: PDFs (text, or read by the AI when scanned), Word,
// Excel, CSV and text files. Recordings and videos are only named.
const DOC_EXT = /\.(pdf|docx|xlsx|csv|txt|log|json|xml|html?|eml|md|rtf)$/i;
function docsIn(f) { return ((f && f.attachments) || []).filter(a => DOC_EXT.test(a.name || '') && a.href && Number(a.size || 0) < 12 * 1024 * 1024).map(a => ({ name: a.name, href: a.href, size: Number(a.size || 0) })); }
async function docText(buf, name, context) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    let t = '';
    try { t = (await require('pdf-parse/lib/pdf-parse.js')(buf)).text || ''; } catch (e) { t = ''; }
    // a scanned PDF or a form has little text: the AI reads the pages
    if (t.replace(/\s+/g, '').length < 150 && ai && ai.readDocument && buf.length < 8 * 1024 * 1024) {
      const r = await ai.readDocument({ b64: buf.toString('base64'), name, context }).catch(() => '');
      if (r) return '(read by the AI) ' + r;
    }
    return t;
  }
  if (ext === 'docx') return (await require('mammoth').extractRawText({ buffer: buf })).value || '';
  if (ext === 'xlsx') {
    const sheets = await require('./xlsx-lite').readSheets(buf);
    return Object.keys(sheets).map(n => `Sheet ${n}:\n` + sheets[n].filter(r => r.some(Boolean)).slice(0, 80).map(r => r.join(' | ')).join('\n')).join('\n\n');
  }
  const t = buf.toString('utf8');
  return /^(html?|xml|eml|rtf)$/.test(ext) ? strip(t.replace(/\{\\[^{}]*\}|\\[a-z]+\d* ?/g, ' ')) : t;
}
async function readDocs(want, context, info, per) {
  info.docsFound = want.length;
  if (!want.length || !desk || !desk.fetchBinary) return [];
  const errs = [];
  const got = await pool(want, 2, async (w) => {
    try {
      const r = await desk.fetchBinary(w.href, 12 * 1024 * 1024);
      const text = String(await docText(r.buf, w.name, context) || '').replace(/[\u2014\u2013]/g, '-').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
      if (!text) { errs.push(w.name + ': empty'); return null; }
      return { tid: w.tid, name: w.name, text: scrub(cut(text, per)) };
    } catch (e) { errs.push(cut(w.name, 40) + ': ' + String(e.message || e).slice(0, 60)); return null; }
  });
  const docs = got.filter(Boolean); info.docsRead = docs.length; if (errs.length) info.docErr = errs.slice(0, 3).join('; ');
  return docs;
}
const strip = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[\u2014\u2013]/g, '-').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const scrub = (s) => String(s || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
// Quoted earlier emails repeat the whole thread: keep only the new part of each message.
const unquote = (t) => String(t).split(/\n(?:On .{5,80} wrote:|-{2,} ?Original Message|From: .+\nSent: |_{5,})/)[0];
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '...' : s; };
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'; };

/** A ticket number in the question: "#416875", "ticket 416875", "ticket no 416875" or the number on its own. */
function detect(q) {
  const s = String(q || '');
  // "#498391", "ticket no 498391", "tkt 498391"
  let m = s.match(/(?:#\s?|(?:ticket|tkt|tk)\s*(?:no\.?|number|id|#)?\s*:?\s*#?)(\d{5,7})(?!\d)/i);
  // "498391 - how to handle this", "498391: client says..." (number leads the question)
  if (!m) m = s.trim().match(/^#?(\d{5,7})(?![\d\/.,])/);
  // "how to handle 498391" when the question talks about a ticket
  if (!m && /\b(ticket|tkt|handle|respond|reply)\b/i.test(s)) m = s.match(/(?<![\d\-\/.(+])\b(\d{6})\b(?![\d\-\/.)])/);
  return m ? m[1] : null;
}
/** Every ticket number in a text, in order (same patterns as detect). */
function detectAll(q) {
  const s = String(q || ''), out = [];
  const add = (n) => { if (n && !out.includes(n)) out.push(n); };
  const first = detect(s); if (first) add(first);
  const re = /(?:#\s?|(?:ticket|tkt|tk)s?\s*(?:no\.?|number|id|#)?\s*:?\s*#?)(\d{5,7})(?!\d)/gi; let m;
  while ((m = re.exec(s))) add(m[1]);
  if (out.length && /\b(ticket|tkt|tickets)\b/i.test(s)) { const re2 = /(?<![\d\-\/.(+])\b(\d{6})\b(?![\d\-\/.)])/g; while ((m = re2.exec(s))) add(m[1]); }
  return out;
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out; }

const _memo = new Map();
async function load(number, opts = {}) {
  const mk = number + (opts.light ? ':l' : '') + (opts.deep ? ':d' : '');
  const hitm = _memo.get(mk); if (hitm && Date.now() - hitm.at < 3 * 60000) return hitm.v;
  const v = await loadFresh(number, opts);
  _memo.set(mk, { at: Date.now(), v }); if (_memo.size > 60) _memo.delete(_memo.keys().next().value);
  return v;
}
async function loadFresh(number, opts) {
  if (!desk || !desk.isConfigured()) throw new Error('Zoho Desk is not set up');
  const s = await desk.fetchRaw(`/tickets/search?ticketNumber=${encodeURIComponent(number)}&limit=1`);
  const hit = (s && s.data && s.data[0]) || null;
  if (!hit) { const e = new Error(`Ticket #${number} was not found in Zoho Desk`); e.status = 404; throw e; }
  const id = hit.id;
  const deep = !!opts.deep && !opts.light;
  const [t, threadsR, commentsR, hist, tAtt] = await Promise.all([
    desk.fetchRaw(`/tickets/${id}?include=contacts,assignee,team`).catch(() => hit),
    desk.fetchRaw(`/tickets/${id}/threads?limit=100`).catch(() => ({ data: [] })),
    desk.fetchRaw(`/tickets/${id}/comments?limit=100`).catch(() => ({ data: [] })),
    desk.fetchRaw(`/tickets/${id}/History?limit=99`).catch(() => ({ data: [] })),
    opts.light ? null : desk.fetchRaw(`/tickets/${id}/attachments?limit=50`).catch(() => null),
  ]);
  const threads = (threadsR && threadsR.data) || [];
  // Full text of the latest messages (the list only has a short summary)
  // Batch 198: a deep read (the open ticket review) opens every message, a normal read the latest 8 and any with files
  const byNew = threads.slice().sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime));
  const recent = deep ? byNew.slice(0, 40) : byNew.filter((th, i) => i < 8 || (i < 20 && Number(th.attachmentCount || 0) > 0)).slice(0, 12);
  const full = await pool(recent, 3, (th) => desk.fetchRaw(`/tickets/${id}/threads/${th.id}`));
  // Batch 198: private notes can carry screenshots and files too. Each note becomes a "source" read like a message.
  const rawNotes = ((commentsR && commentsR.data) || []).slice().sort((a, b) => Date.parse(b.commentedTime) - Date.parse(a.commentedTime));
  const noteSrc = opts.light ? [] : (await pool(rawNotes.slice(0, deep ? 30 : 12), 3, async (c) => {
    let atts = c.attachments;
    if (atts === undefined && deep) { const d = await desk.fetchRaw(`/tickets/${id}/comments/${c.id}`).catch(() => null); atts = (d && d.attachments) || []; }
    return { id: 'c' + c.id, direction: 'note', createdTime: c.commentedTime, content: c.content || '', attachments: atts || [] };
  })).filter(Boolean);
  const fullById = {}; full.forEach(f => { if (f && f.id) fullById[f.id] = f; });
  const imageInfo = { found: 0, fetched: 0, read: 0 };
  // Files: those in the messages (newest first) and those added to the ticket itself, each read once
  const docWant = [], seenDoc = new Set();
  const addDoc = (d, tid) => { const k = (d.name || '') + ':' + (d.size || ''); if (seenDoc.has(k)) return; seenDoc.add(k); docWant.push(Object.assign({ tid }, d)); };
  if (!opts.light) {
    for (const f of full.filter(Boolean).concat(noteSrc).sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime))) for (const d of docsIn(f)) addDoc(d, f.id);
    for (const a of ((tAtt && tAtt.data) || [])) if (DOC_EXT.test(a.name || '') && a.href && Number(a.size || 0) < 12 * 1024 * 1024) addDoc({ name: a.name, href: a.href, size: Number(a.size || 0) }, null);
  }
  const ctxLine = cut(hit.subject || '', 160);
  let shots = {}, docs = [];
  if (!opts.light) {
    const [s1, d1] = await Promise.all([
      readImages(full.filter(Boolean).concat(noteSrc), ctxLine, imageInfo, deep ? 12 : 6).catch((e) => { imageInfo.err = String(e.message || e).slice(0, 120); return {}; }),
      readDocs(docWant.slice(0, deep ? 8 : 3), ctxLine, imageInfo, deep ? 6000 : 2500).catch(() => []),
    ]);
    shots = s1; docs = d1;
  }
  const docsBy = {}; docs.forEach(d => { if (d.tid) (docsBy[d.tid] = docsBy[d.tid] || []).push(d); });
  const otherAtt = ((tAtt && tAtt.data) || []).filter(a => !seenDoc.has((a.name || '') + ':' + Number(a.size || 0)) && !IMG_EXT.test(a.name || '')).map(a => cut(a.name, 80)).slice(0, 10);
  if (imageInfo.found || imageInfo.docsFound) console.log(`Expert ticket #${number} screenshots: ${JSON.stringify(imageInfo)}`);
  let shotN = 0;
  const msgs = threads.map(th => { const f = fullById[th.id]; const text = f ? (f.plainText || strip(f.content)) : (th.summary || '');
    const pics = (shots[th.id] || []).map(d => `\n[Screenshot ${++shotN} in this message: ${d}]`).join('');
    // Batch 197: other attachments (PDFs, recordings, documents) are named so the AI knows they were sent.
    const files = f ? (f.attachments || []).filter(a => !IMG_EXT.test(a.name || '')).map(a => a.name).slice(0, 8) : [];
    const read = (docsBy[th.id] || []).map(d => `\n[Attached file "${d.name}", its content:\n${d.text}\n(end of file)]`).join('');
    const unread = files.filter(n => !(docsBy[th.id] || []).some(d => d.name === n));
    const att = read + (unread.length ? `\n[Also attached: ${unread.join(', ')}]` : '');
    return { at: th.createdTime, dir: th.direction === 'in' ? 'Client' : 'Agent', who: th.direction === 'in' ? 'Client' : ((th.author && th.author.name) || 'Agent'), channel: th.channel || '', text: cut(scrub(unquote(text)), f ? (deep ? 4000 : 1400) : 300) + pics + att, base: cut(scrub(unquote(text)), 280), pics }; })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const noteAtt = {}; noteSrc.forEach(n => { noteAtt[n.id] = n.attachments || []; });
  const comments = ((commentsR && commentsR.data) || []).map(c => { const k = 'c' + c.id;
    const pics = (shots[k] || []).map(d => `\n[Screenshot ${++shotN} in this note: ${d}]`).join('');
    const read = (docsBy[k] || []).map(d => `\n[File "${d.name}" attached to the note, its content:\n${d.text}\n(end of file)]`).join('');
    const other = (noteAtt[k] || c.attachments || []).map(a => a.name).filter(n => !IMG_EXT.test(n || '') && !(docsBy[k] || []).some(d => d.name === n)).slice(0, 6);
    return { at: c.commentedTime, who: (c.commenter && c.commenter.name) || 'Agent', text: cut(scrub(strip(c.content)), deep ? 2500 : 900) + pics + read + (other.length ? `\n[Also attached to the note: ${other.join(', ')}]` : ''), short: cut(scrub(strip(c.content)), 280) + (pics ? ' [screenshot]' : '') }; }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const hdata = (hist && hist.data && (hist.data.data || hist.data)) || [];
  const events = [];
  for (const ev of (Array.isArray(hdata) ? hdata : [])) {
    const who = (ev.actor && ev.actor.name) || '';
    if (ev.eventName === 'TicketCreated') events.push({ at: ev.eventTime, text: `Created${who ? ' by ' + who : ''}` });
    for (const p of ev.eventInfo || []) {
      const v = p.propertyValue;
      if (['Status', 'Case Owner', 'Team', 'Classification', 'Department', 'Priority'].includes(p.propertyName) && v && typeof v === 'object' && 'updatedValue' in v) {
        const nm = (x) => x && typeof x === 'object' ? (x.name || '') : (x == null ? 'none' : String(x));
        events.push({ at: ev.eventTime, text: `${p.propertyName}: ${nm(v.previousValue)} > ${nm(v.updatedValue)}${who ? ' (by ' + who + ')' : ''}` });
      }
    }
    if (/^Call/.test(ev.eventName || '')) { const sub = (ev.eventInfo || []).find(p => p.propertyName === 'Subject'); const st = (ev.eventInfo || []).find(p => p.propertyName === 'Status'); if (sub && st && st.propertyValue === 'Completed') events.push({ at: ev.eventTime, text: `${sub.propertyValue}${who ? ' (' + who + ')' : ''}` }); }
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // The client's other tickets: by contact, then by account
  // Batch 191: the contact's AND the account's tickets (other people at the same office raise tickets too)
  let prior = [];
  const cid = t.contactId || (t.contact && t.contact.id), aid = t.accountId || (t.contact && t.contact.account && t.contact.account.id);
  if (!opts.light) {
    const lists = await Promise.all([cid && `/contacts/${cid}/tickets?limit=25&sortBy=-createdTime`, aid && `/accounts/${aid}/tickets?limit=25&sortBy=-createdTime`].filter(Boolean)
      .map(pth => desk.fetchRaw(pth).then(r => (r && r.data) || []).catch(() => [])));
    const byNum = new Map();
    for (const x of [].concat(...lists)) if (String(x.ticketNumber) !== String(number) && !byNum.has(String(x.ticketNumber))) byNum.set(String(x.ticketNumber), x);
    prior = [...byNum.values()].sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime)).slice(0, 15)
      .map(x => ({ id: x.id, number: String(x.ticketNumber), subject: cut(x.subject, 140), status: x.status, channel: x.channel, created: x.createdTime, closed: x.closedTime || null }));
  }
  // What was found on the most recent earlier tickets (last 120 days): internal notes and the last messages
  const since = Date.now() - 120 * 864e5;
  const recentPrior = prior.filter(x => Date.parse(x.created) >= since).slice(0, deep ? 6 : 4);
  const priorNotes = (await pool(recentPrior, 2, async (x) => {
    const [cm, th] = await Promise.all([desk.fetchRaw(`/tickets/${x.id}/comments?limit=10`).catch(() => ({ data: [] })), desk.fetchRaw(`/tickets/${x.id}/threads?limit=6`).catch(() => ({ data: [] }))]);
    const notes = ((cm && cm.data) || []).sort((a, b) => Date.parse(a.commentedTime) - Date.parse(b.commentedTime)).map(c => `${(c.commenter && c.commenter.name) || 'Agent'}: ${cut(scrub(strip(c.content)), 500)}`);
    const msgs = ((th && th.data) || []).sort((a, b) => Date.parse(a.createdTime) - Date.parse(b.createdTime)).slice(-3).map(m => `${m.direction === 'in' ? 'Client' : 'Agent'}: ${cut(scrub(m.summary || ''), 220)}`);
    return { number: x.number, text: `#${x.number} ${when(x.created)} "${x.subject}" (${x.status}${x.channel ? ', ' + x.channel : ''})${notes.length ? '\n  Internal notes:\n  - ' + notes.join('\n  - ') : ''}${msgs.length ? '\n  Last messages:\n  - ' + msgs.join('\n  - ') : ''}` };
  })).filter(Boolean);
  prior = prior.map(({ id, ...rest }) => rest);
  const cf = t.cf || {}, custom = t.customFields || {};
  const meta = { id, number: String(t.ticketNumber || number), subject: t.subject || hit.subject, status: t.status, statusType: t.statusType, channel: t.channel, priority: t.priority, classification: t.classification,
    owner: t.assignee ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(' ') : '', team: (t.team && t.team.name) || '', account: (t.contact && t.contact.account && t.contact.account.accountName) || '',
    created: t.createdTime, closed: t.closedTime, dueDate: t.dueDate, reopened: custom['Reopen Count'] || null, module: custom['Adit App Module'] || cf.cf_adit_app_module || '', ehr: custom['EHR/PMS'] || '',
    csm: custom['CSM/Account Manager'] || '', dealStage: custom['Deal Stage'] || '', risk: custom['Risk Category - Account'] || '', webUrl: t.webUrl || hit.webUrl || '',
    // Batch 197: the Desk fields the open ticket review reads (Asana task, follow-ups, escalation, summaries)
    fields: { asana: custom['Asana Task Link'] || cf.cf_asana_task_link || '', asanaOwner: custom['Asana Task Owner'] || '', asanaDue: custom['Asana Task Due Date'] || '',
      pendingCustomer: custom['Pending Customer Field'] || '', followUp: custom['Follow-up Status'] || '', escalation: custom['Escalations Status'] || '',
      previousStatus: custom['Previous Status'] || '', lastReply: custom['Last Reply sent on'] || '', ticketType: custom['Ticket Type'] || '',
      category: [custom['CS Category'], custom['Sub Category']].filter(Boolean).join(' > '), issueSummary: cut(scrub(custom['Issue Summary'] || ''), 600), aiSummary: cut(scrub(custom['Brief AI Summary'] || ''), 600) } };
  const F = meta.fields, fieldLine = [F.asana && 'Asana task ' + F.asana + (F.asanaOwner ? ' (owner ' + F.asanaOwner + ')' : '') + (F.asanaDue ? ' due ' + F.asanaDue : ''), F.pendingCustomer && 'Pending customer: ' + F.pendingCustomer,
    F.followUp && 'Follow-up status: ' + F.followUp, F.escalation && 'Escalation status: ' + F.escalation, F.previousStatus && 'Previous status: ' + F.previousStatus, F.lastReply && 'Last reply sent on ' + F.lastReply,
    F.ticketType && 'Ticket type: ' + F.ticketType, F.category && 'CS category: ' + F.category, F.issueSummary && 'Issue summary: ' + F.issueSummary, F.aiSummary && 'Brief AI summary: ' + F.aiSummary].filter(Boolean);
  const lastClient = msgs.filter(m => m.dir === 'Client').slice(-1)[0];
  const desc = cut(scrub(strip(t.description || '')), deep ? 5000 : 1500);
  const text = [
    `Ticket #${meta.number}: ${meta.subject}`,
    `Status ${meta.status}${meta.statusType ? ' (' + meta.statusType + ')' : ''}, channel ${meta.channel || '?'}, priority ${meta.priority || '?'}, classification ${meta.classification || '?'}, owner ${meta.owner || 'unassigned'}${meta.team ? ', team ' + meta.team : ''}.`,
    `Opened ${when(meta.created)}${meta.closed ? ', closed ' + when(meta.closed) : ''}${meta.reopened ? ', reopened ' + meta.reopened + ' time(s)' : ''}. Account: ${meta.account || '?'}${meta.module ? ', module ' + meta.module : ''}${meta.ehr ? ', EHR ' + meta.ehr : ''}${meta.dealStage ? ', deal stage ' + meta.dealStage : ''}${meta.csm ? ', CSM ' + meta.csm : ''}${meta.risk ? ', account risk ' + meta.risk : ''}.`,
    fieldLine.length ? 'Desk fields:\n- ' + fieldLine.join('\n- ') : '',
    desc ? 'Description:\n' + desc : '',
    msgs.length ? 'Messages (oldest first):\n' + msgs.map(m => `- ${when(m.at)} ${m.who}${m.channel ? ' (' + m.channel + ')' : ''}: ${m.text}`).join('\n') : 'No messages on the ticket yet.',
    comments.length ? 'Internal comments:\n' + comments.map(c => `- ${when(c.at)} ${c.who}: ${c.text}`).join('\n') : '',
    docs.filter(d => !d.tid).length ? 'Files added to the ticket:\n' + docs.filter(d => !d.tid).map(d => `[File "${d.name}", its content:\n${d.text}\n(end of file)]`).join('\n') : '',
    otherAtt.length ? 'Other files on the ticket (not readable as text): ' + otherAtt.join(', ') : '',
    events.length ? 'History:\n' + events.slice(deep ? -80 : -40).map(e => `- ${when(e.at)} ${e.text}`).join('\n') : '',
    prior.length ? "The client's earlier tickets, from this contact and anyone else at the account (newest first):\n" + prior.map(p => `- #${p.number} ${when(p.created)} ${p.subject} (${p.status}${p.channel ? ', ' + p.channel : ''})`).join('\n') : (opts.light ? '' : 'No earlier tickets from this client.'),
    priorNotes.length ? 'What was found on the recent earlier tickets (read these: an earlier ticket may already explain the cause):\n' + priorNotes.map(n => n.text).join('\n') : '',
  ].filter(Boolean).join('\n\n');
  return { meta, prior, msgCount: msgs.length, commentCount: comments.length, images: shotN, docs: docs.map(d => d.name), imageInfo, lastClient: lastClient ? lastClient.text : desc, text: cut(text, deep ? 70000 : 24000),
    timeline: msgs.map(m => ({ at: m.at, kind: m.dir === 'Client' ? 'client' : 'agent', who: m.who, channel: m.channel, text: m.base + m.pics }))
      .concat(comments.map(c => ({ at: c.at, kind: 'comment', who: c.who, text: c.short }))).concat(events.map(e => ({ at: e.at, kind: 'event', text: e.text })))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-60) };
}
module.exports = { setDesk, setAI, detect, detectAll, load, _imagesIn: imagesIn, _strip: strip, _unquote: unquote };
