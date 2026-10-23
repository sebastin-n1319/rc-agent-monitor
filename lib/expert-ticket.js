'use strict';
/**
 * Batch 189: Adit Expert reads a ticket. Give a ticket number and it pulls the ticket from Zoho Desk: the details,
 * every email, chat and call note on it in order (with internal comments), the history (status, owner and team
 * changes, transfers), and the client's earlier tickets. Expert then reviews how it has gone and how to handle or
 * answer it better. Phone numbers and email addresses are removed before anything reaches the AI.
 */
let desk = null;
function setDesk(d) { desk = d; }
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
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out; }

async function load(number) {
  if (!desk || !desk.isConfigured()) throw new Error('Zoho Desk is not set up');
  const s = await desk.fetchRaw(`/tickets/search?ticketNumber=${encodeURIComponent(number)}&limit=1`);
  const hit = (s && s.data && s.data[0]) || null;
  if (!hit) { const e = new Error(`Ticket #${number} was not found in Zoho Desk`); e.status = 404; throw e; }
  const id = hit.id;
  const [t, threadsR, commentsR, hist] = await Promise.all([
    desk.fetchRaw(`/tickets/${id}?include=contacts,assignee,team`).catch(() => hit),
    desk.fetchRaw(`/tickets/${id}/threads?limit=60`).catch(() => ({ data: [] })),
    desk.fetchRaw(`/tickets/${id}/comments?limit=60`).catch(() => ({ data: [] })),
    desk.fetchRaw(`/tickets/${id}/History?limit=99`).catch(() => ({ data: [] })),
  ]);
  const threads = (threadsR && threadsR.data) || [];
  // Full text of the latest messages (the list only has a short summary)
  const recent = threads.slice().sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime)).slice(0, 8);
  const full = await pool(recent, 3, (th) => desk.fetchRaw(`/tickets/${id}/threads/${th.id}`));
  const fullById = {}; full.forEach(f => { if (f && f.id) fullById[f.id] = f; });
  const msgs = threads.map(th => { const f = fullById[th.id]; const text = f ? (f.plainText || strip(f.content)) : (th.summary || '');
    return { at: th.createdTime, dir: th.direction === 'in' ? 'Client' : 'Agent', who: th.direction === 'in' ? 'Client' : ((th.author && th.author.name) || 'Agent'), channel: th.channel || '', text: cut(scrub(unquote(text)), f ? 1400 : 300) }; })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const comments = ((commentsR && commentsR.data) || []).map(c => ({ at: c.commentedTime, who: (c.commenter && c.commenter.name) || 'Agent', text: cut(scrub(strip(c.content)), 900) })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
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
  let prior = [];
  const cid = t.contactId || (t.contact && t.contact.id), aid = t.accountId || (t.contact && t.contact.account && t.contact.account.id);
  for (const path of [cid && `/contacts/${cid}/tickets?limit=15&sortBy=-createdTime`, aid && `/accounts/${aid}/tickets?limit=15&sortBy=-createdTime`].filter(Boolean)) {
    try { const r = await desk.fetchRaw(path); prior = ((r && r.data) || []).filter(x => String(x.ticketNumber) !== String(number)); if (prior.length) break; } catch (e) { /* next */ }
  }
  prior = prior.slice(0, 12).map(x => ({ number: String(x.ticketNumber), subject: cut(x.subject, 140), status: x.status, channel: x.channel, created: x.createdTime, closed: x.closedTime || null }));
  const cf = t.cf || {}, custom = t.customFields || {};
  const meta = { id, number: String(t.ticketNumber || number), subject: t.subject || hit.subject, status: t.status, statusType: t.statusType, channel: t.channel, priority: t.priority, classification: t.classification,
    owner: t.assignee ? [t.assignee.firstName, t.assignee.lastName].filter(Boolean).join(' ') : '', team: (t.team && t.team.name) || '', account: (t.contact && t.contact.account && t.contact.account.accountName) || '',
    created: t.createdTime, closed: t.closedTime, dueDate: t.dueDate, reopened: custom['Reopen Count'] || null, module: custom['Adit App Module'] || cf.cf_adit_app_module || '', ehr: custom['EHR/PMS'] || '',
    csm: custom['CSM/Account Manager'] || '', dealStage: custom['Deal Stage'] || '', risk: custom['Risk Category - Account'] || '', webUrl: t.webUrl || hit.webUrl || '' };
  const lastClient = msgs.filter(m => m.dir === 'Client').slice(-1)[0];
  const desc = cut(scrub(strip(t.description || '')), 1500);
  const text = [
    `Ticket #${meta.number}: ${meta.subject}`,
    `Status ${meta.status}${meta.statusType ? ' (' + meta.statusType + ')' : ''}, channel ${meta.channel || '?'}, priority ${meta.priority || '?'}, classification ${meta.classification || '?'}, owner ${meta.owner || 'unassigned'}${meta.team ? ', team ' + meta.team : ''}.`,
    `Opened ${when(meta.created)}${meta.closed ? ', closed ' + when(meta.closed) : ''}${meta.reopened ? ', reopened ' + meta.reopened + ' time(s)' : ''}. Account: ${meta.account || '?'}${meta.module ? ', module ' + meta.module : ''}${meta.ehr ? ', EHR ' + meta.ehr : ''}${meta.dealStage ? ', deal stage ' + meta.dealStage : ''}${meta.csm ? ', CSM ' + meta.csm : ''}${meta.risk ? ', account risk ' + meta.risk : ''}.`,
    desc ? 'Description:\n' + desc : '',
    msgs.length ? 'Messages (oldest first):\n' + msgs.map(m => `- ${when(m.at)} ${m.who}${m.channel ? ' (' + m.channel + ')' : ''}: ${m.text}`).join('\n') : 'No messages on the ticket yet.',
    comments.length ? 'Internal comments:\n' + comments.map(c => `- ${when(c.at)} ${c.who}: ${c.text}`).join('\n') : '',
    events.length ? 'History:\n' + events.slice(-40).map(e => `- ${when(e.at)} ${e.text}`).join('\n') : '',
    prior.length ? "The client's earlier tickets (newest first):\n" + prior.map(p => `- #${p.number} ${when(p.created)} ${p.subject} (${p.status}${p.channel ? ', ' + p.channel : ''})`).join('\n') : 'No earlier tickets from this client.',
  ].filter(Boolean).join('\n\n');
  return { meta, prior, msgCount: msgs.length, commentCount: comments.length, lastClient: lastClient ? lastClient.text : desc, text: cut(text, 16000),
    timeline: msgs.map(m => ({ at: m.at, kind: m.dir === 'Client' ? 'client' : 'agent', who: m.who, channel: m.channel, text: cut(m.text, 280) }))
      .concat(comments.map(c => ({ at: c.at, kind: 'comment', who: c.who, text: cut(c.text, 280) }))).concat(events.map(e => ({ at: e.at, kind: 'event', text: e.text })))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-60) };
}
module.exports = { setDesk, detect, load, _strip: strip, _unquote: unquote };
