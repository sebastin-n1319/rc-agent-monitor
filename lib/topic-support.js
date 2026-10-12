'use strict';
/**
 * Batch 165: AI support and VoIP support handled by T1.
 * T1 took over basic AI support on 1 Oct 2026 and basic VoIP support on 12 Oct 2026. This module reads the
 * Desk tickets synced from AditKB (desk_ticket_snapshot) and, for each topic, works out which tickets T1
 * handled, which T1 resolved or still holds, and which T1 transferred (and to whom). Calls and chats are the
 * Phone and Chat channel tickets T1 logs for them. Transfer audits ask AI, with the support guides as the
 * reference, whether T1 could have handled a transferred ticket; verdicts are stored so each is asked once.
 */
let _db = null, _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign({}, _deps, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const lc = (s) => String(s || '').trim().toLowerCase();
const T1_TEAM = /^t1 - customer support$|^t1 customer support$/i;

const TOPICS = {
  ai: {
    key: 'ai', label: 'AI support', goLive: '2026-10-01', teamLabel: 'T2 - AI Support',
    team: /\bai support\b/i,
    topic: /\bAI\b|front desk|call intelligence|voice agent|chat ?bot|ai onboarding|ai product|ai receptionist/,
    subject: /\bai\b|a\.i\.|front desk agent|ai front desk|call intelligence|chat ?bot/i,
  },
  voip: {
    key: 'voip', label: 'VoIP support', goLive: '2026-10-12', teamLabel: 'VoIP teams',
    team: /voip|porting/i,
    topic: /voip|phone|fax|outbound call|outbound calling|caller id|call flow|call quality|call routing|voicemail|ringing|porting|extension|softphone|desk phone|cordless|dropped call|one.way audio|call park|hold music|spam/i,
    subject: /voip|e-?fax|\bfax\b|caller id|call flow|voicemail|softphone|desk phone|cordless|porting|not ringing|dropped call|one.way audio|outbound call|inbound call|call park|hold music|phones? (?:are |is )?(?:down|not working|dead|offline)|no account|calls? (?:are |is )?not (?:coming|going|ringing|connecting)/i,
  },
};

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS topic_audits (
    ticket_id TEXT PRIMARY KEY, topic TEXT, verdict TEXT, reason TEXT, guide_ref TEXT, model TEXT,
    audited_by TEXT, at TEXT DEFAULT (datetime('now')))`);
}

function chan(c) {
  const s = lc(c);
  if (s === 'phone') return 'call';
  if (s === 'chat') return 'chat';
  return 'ticket';
}

// Person -> the Zoho team they most often own tickets under (from synced tickets).
async function personTeams() {
  const rows = await all(`SELECT lower(assignee_name) AS name, team_name AS team, COUNT(*) AS n FROM desk_ticket_snapshot
    WHERE assignee_name IS NOT NULL AND team_name IS NOT NULL AND team_name != '' GROUP BY 1, 2 ORDER BY n ASC`);
  const m = new Map(); for (const r of rows) m.set(r.name.trim(), r.team); return m;
}

/** One topic's numbers for [from, to). */
async function topicSummary({ topic, from, to, agentNames }) {
  const T = TOPICS[topic]; if (!T) throw Object.assign(new Error('Unknown topic'), { status: 400 });
  const dl = _deps.deskLifecycle;
  const goLiveIso = new Date(T.goLive + 'T05:00:00.000Z').toISOString(); // midnight Central (CDT)
  const start = new Date(Math.max(Date.parse(from), Date.parse(goLiveIso))).toISOString();
  const end = new Date(to).toISOString();
  const rosterNameSet = new Set(Object.values(agentNames || {}).map(lc));
  const emailByName = new Map(Object.entries(agentNames || {}).map(([e, n]) => [lc(n), e]));
  const classify = await dl.staffGroupClassifier();
  const nameById = await dl.agentNameById();
  const pTeam = await personTeams();
  const ctx = { rosterNameSet, classify, nameById };

  const rows = start < end ? await all(`SELECT ticket_id, ticket_number, subject, status, status_type, channel, team_name, ai_category, category,
      owner_change_log, assignee_name, created_by_id, created_time, closed_time, web_url
      FROM desk_ticket_snapshot WHERE created_time >= ? AND created_time < ?`, [start, end]) : [];

  const isT1 = (e) => e && String(e.role || '').toLowerCase() !== 'team' && rosterNameSet.has(lc(e.name));
  const hopTeam = (e) => String(e.role || '').toLowerCase() === 'team' ? e.name : (pTeam.get(lc(e.name)) || '');
  const inTopicTeam = (e) => T.team.test(hopTeam(e));

  const out = {
    topic: T.key, label: T.label, goLive: T.goLive, teamLabel: T.teamLabel, from: start, to: end,
    totals: { inTopic: 0, t1Touched: 0, resolvedByT1: 0, openWithT1: 0, transferred: 0, toTopicTeam: 0, toOther: 0, bypassedT1: 0 },
    byChannel: { call: blank(), chat: blank(), ticket: blank() },
    byAgent: {}, byDay: {}, byCategory: {}, destinations: {}, tickets: [],
  };
  function blank() { return { t1Touched: 0, resolvedByT1: 0, openWithT1: 0, transferred: 0, toTopicTeam: 0 }; }

  for (const r of rows) {
    const chain = dl.effectiveOwnerChain(r, ctx).full;
    const touchesTeam = T.team.test(r.team_name || '') || chain.some(inTopicTeam);
    const topical = T.topic.test(r.ai_category || '') || T.topic.test(r.category || '') || T.subject.test(r.subject || '');
    if (!touchesTeam && !topical) continue;
    out.totals.inTopic++;
    const ch = chan(r.channel);
    let lastT1 = -1; chain.forEach((e, i) => { if (isT1(e)) lastT1 = i; });
    const day = String(r.created_time || '').slice(0, 10);
    const cat = (r.ai_category || r.category || 'Uncategorised').trim();
    if (lastT1 < 0) {
      out.totals.bypassedT1++;
      out.tickets.push(row(r, ch, null, 'bypassed', r.team_name || '', cat));
      continue;
    }
    const agent = chain[lastT1].name;
    const agentEmail = emailByName.get(lc(agent)) || null;
    let next = null;
    for (let i = lastT1 + 1; i < chain.length; i++) { if (!isT1(chain[i])) { next = chain[i]; break; } }
    let outcome, dest = '';
    if (!next) outcome = (lc(r.status_type) === 'closed' || r.closed_time) ? 'resolved' : 'open';
    else {
      // Where it went: the ticket's own team when that is no longer T1, otherwise the next owner's usual team.
      const tn = r.team_name || '', nt = hopTeam(next);
      dest = (tn && !T1_TEAM.test(tn)) ? tn : (nt || next.role || next.name);
      outcome = (T.team.test(dest) || T.team.test(nt)) ? 'toTopicTeam' : 'toOther';
    }
    const t = out.totals, c = out.byChannel[ch];
    t.t1Touched++; c.t1Touched++;
    if (outcome === 'resolved') { t.resolvedByT1++; c.resolvedByT1++; }
    else if (outcome === 'open') { t.openWithT1++; c.openWithT1++; }
    else { t.transferred++; c.transferred++; if (outcome === 'toTopicTeam') { t.toTopicTeam++; c.toTopicTeam++; } else t.toOther++; out.destinations[dest || 'Unknown'] = (out.destinations[dest || 'Unknown'] || 0) + 1; }
    const a = out.byAgent[agent] || (out.byAgent[agent] = { name: agent, email: agentEmail, touched: 0, resolved: 0, open: 0, transferred: 0, calls: 0, chats: 0, tickets: 0 });
    a.touched++; a[ch === 'call' ? 'calls' : ch === 'chat' ? 'chats' : 'tickets']++;
    if (outcome === 'resolved') a.resolved++; else if (outcome === 'open') a.open++; else a.transferred++;
    const d = out.byDay[day] || (out.byDay[day] = { day, handled: 0, transferred: 0 });
    if (outcome === 'resolved' || outcome === 'open') d.handled++; else d.transferred++;
    const k = out.byCategory[cat] || (out.byCategory[cat] = { category: cat, touched: 0, transferred: 0 });
    k.touched++; if (outcome === 'toTopicTeam' || outcome === 'toOther') k.transferred++;
    out.tickets.push(row(r, ch, agent, outcome, dest, cat));
  }
  function row(r, ch, agent, outcome, dest, cat) {
    return { ticketId: String(r.ticket_id), number: r.ticket_number, subject: r.subject, channel: ch, agent, outcome, dest, category: cat,
      created: r.created_time, status: r.status, url: r.web_url };
  }
  out.byAgent = Object.values(out.byAgent).sort((a, b) => b.touched - a.touched);
  out.byDay = Object.values(out.byDay).sort((a, b) => a.day.localeCompare(b.day));
  out.byCategory = Object.values(out.byCategory).sort((a, b) => b.touched - a.touched).slice(0, 15);
  out.destinations = Object.entries(out.destinations).map(([team, n]) => ({ team, n })).sort((a, b) => b.n - a.n);
  out.tickets.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  out.tickets = out.tickets.slice(0, 400);
  // Audit verdicts already on file for the listed tickets.
  const ids = out.tickets.map((x) => x.ticketId);
  if (ids.length) {
    const aud = await all(`SELECT ticket_id, verdict, reason, guide_ref, at FROM topic_audits WHERE ticket_id IN (${ids.map(() => '?').join(',')})`, ids);
    const am = new Map(aud.map((x) => [String(x.ticket_id), x]));
    for (const x of out.tickets) { const v = am.get(x.ticketId); if (v) x.audit = { verdict: v.verdict, reason: v.reason, guide: v.guide_ref, at: v.at }; }
  }
  out.audits = { couldHandle: out.tickets.filter((x) => x.audit && x.audit.verdict === 'could_handle').length,
    rightTransfer: out.tickets.filter((x) => x.audit && x.audit.verdict === 'right_transfer').length,
    unclear: out.tickets.filter((x) => x.audit && x.audit.verdict === 'unclear').length };
  // Two weeks before T1 took over: how much of this topic came in and how much went to the topic team.
  const bStart = new Date(Date.parse(goLiveIso) - 14 * 86400e3).toISOString();
  const before = await all(`SELECT team_name, ai_category, category, subject, owner_change_log FROM desk_ticket_snapshot WHERE created_time >= ? AND created_time < ?`, [bStart, goLiveIso]);
  let bIn = 0, bTeam = 0;
  for (const r of before) {
    const chain = dl.effectiveOwnerChain({ owner_change_log: r.owner_change_log }, {}).full;
    const touches = T.team.test(r.team_name || '') || chain.some(inTopicTeam);
    if (!touches && !(T.topic.test(r.ai_category || '') || T.topic.test(r.category || '') || T.subject.test(r.subject || ''))) continue;
    bIn++; if (touches) bTeam++;
  }
  out.baseline = { from: bStart, to: goLiveIso, days: 14, inTopic: bIn, toTopicTeam: bTeam };
  return out;
}

/** AI check of one transferred ticket against the support guides. */
async function auditTicket({ topic, ticketId, by }) {
  const T = TOPICS[topic]; if (!T) throw Object.assign(new Error('Unknown topic'), { status: 400 });
  const r = await get(`SELECT ticket_id, ticket_number, subject, ai_category, channel, team_name FROM desk_ticket_snapshot WHERE ticket_id = ?`, [String(ticketId)]);
  if (!r) throw Object.assign(new Error('Ticket not found in the synced data'), { status: 404 });
  let text = '';
  try {
    const c = _deps.ticketContext ? await _deps.ticketContext(String(ticketId)) : null;
    const items = (c && c.items) || [];
    text = items.map((it) => `${it.inbound ? 'CLIENT' : 'AGENT'}${it.who ? ' (' + it.who + ')' : ''}: ${String(it.text || '').replace(/\s+/g, ' ')}`).join('\n');
  } catch (e) { text = ''; }
  text = String(text).slice(0, 6000);
  const q = [r.subject, r.ai_category, text.slice(0, 600)].filter(Boolean).join('\n');
  const hits = _deps.guides && _deps.guides.search ? _deps.guides.search(q, { limit: 6, maxChars: 7000, doc: topic === 'voip' ? 'voip' : 'ai' }) : [];
  const ref = (hits || []).map((h) => `[${h.title || h.id}] ${h.path || ''}\n${h.text || ''}`).join('\n\n').slice(0, 8000);
  const system = 'You audit transfers by T1 customer support at Adit (dental and optometry practice software). T1 now handles basic ' + T.label + ' using the support guide below. '
    + 'Decide whether this ticket could have been handled by T1 using the guide, or whether transferring it to ' + T.teamLabel + ' was right. '
    + 'Base the answer only on the ticket and the guide; do not invent facts. Plain, short sentences; no em dashes or en dashes. '
    + 'Return JSON {"verdict":"could_handle"|"right_transfer"|"unclear","reason":"one or two sentences","guide":"the guide section title or id you relied on, or empty"}.';
  const user = `Ticket #${r.ticket_number} (${r.channel || ''}), topic: ${r.ai_category || 'unknown'}\nSubject: ${r.subject || ''}\n\nConversation:\n${text || '(no conversation text available)'}\n\nSupport guide sections:\n${ref || '(no matching guide section found)'}`;
  const j = await _deps.ai.bestJSON({ system, user, maxTokens: 600, feature: 'analyze', timeoutMs: 60000 });
  const verdict = ['could_handle', 'right_transfer', 'unclear'].includes(j && j.verdict) ? j.verdict : 'unclear';
  const reason = String((j && j.reason) || '').replace(/[\u2013\u2014]/g, ',').slice(0, 600);
  const guide = String((j && j.guide) || '').slice(0, 200);
  await run(`INSERT INTO topic_audits (ticket_id, topic, verdict, reason, guide_ref, audited_by, at) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(ticket_id) DO UPDATE SET topic=excluded.topic, verdict=excluded.verdict, reason=excluded.reason, guide_ref=excluded.guide_ref, audited_by=excluded.audited_by, at=excluded.at`,
    [String(ticketId), topic, verdict, reason, guide, lc(by)]);
  return { ticketId: String(ticketId), verdict, reason, guide };
}

module.exports = { setDB, setDeps, initSchema, topicSummary, auditTicket, TOPICS };
