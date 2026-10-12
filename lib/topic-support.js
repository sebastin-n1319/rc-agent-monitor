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
    sqlTeam: 'ai support',
    sqlTopic: '\\mai\\M|a\\.i\\.|front desk|call intelligence|chat ?bot|voice agent',
    sqlDesc: '\\mai\\M|ai front desk|front desk agent|call intelligence|sms agent|ai webchat|ai agent',
    topic: /\bAI\b|front desk|call intelligence|voice agent|chat ?bot|ai onboarding|ai product|ai receptionist/,
    subject: /\bai\b|a\.i\.|front desk agent|ai front desk|call intelligence|chat ?bot/i,
  },
  voip: {
    key: 'voip', label: 'VoIP support', goLive: '2026-10-12', teamLabel: 'VoIP teams',
    team: /voip csm|voip ob|voip bops|voip assets|voip support|^voip/i,
    sqlTeam: 'voip csm|voip ob|voip bops|voip assets|voip support',
    sqlTopic: 'voip|phone|fax|caller id|call flow|voicemail|extension|ringing|outbound call|inbound call|call park|softphone|cordless|yealink|dropped call|one.way audio',
    sqlDesc: 'voip|e-?fax|voicemail|caller id|call flow|softphone|cordless|yealink|grandstream|no account|not ringing|dropped call|one.way audio|call park|desk phone',
    topic: /voip|phone|fax|outbound call|outbound calling|caller id|call flow|call quality|call routing|voicemail|ringing|extension|softphone|desk phone|cordless|dropped call|one.way audio|call park|hold music/i,
    subject: /voip|e-?fax|\bfax\b|caller id|call flow|voicemail|softphone|desk phone|cordless|yealink|not ringing|dropped call|one.way audio|outbound call|inbound call|call park|hold music|phones? (?:are |is )?(?:down|not working|dead|offline)|no account|calls? (?:are |is )?not (?:coming|going|ringing|connecting)|(?:issue|problem|trouble)s? with (?:the |our |my )?phones?|phones? (?:issue|problem)/i,
  },
};

// ── Guide scope ─────────────────────────────────────────────────────────
// Areas and owners, taken from the support guides (/guides): the AI runbook's routing map, "Who owns what" and
// "T1 authority", and the VoIP guide's "Requests you can finish on the first call" and "When to hand over".
// expected: t1 = T1 resolves; t1_first = T1 checks first, hands over only if the checks fail; team = owning team;
// commercial = AI leads only, never T1.
const AREAS = {
  ai_config: ['AI: call tree, override, out of office, AI number in the call flow', 't1'],
  ai_sms_agent: ['AI: SMS Agent buffer time or on/off', 't1'],
  ai_billing: ['AI: billing, overage or minutes question', 't1'],
  ai_booking: ['AI: booking, double booking or EHR/PMS appointment sync', 't1_first'],
  ai_reminders: ['AI blamed for texts that are Automated Reminders or Forms', 't1_first'],
  ai_transfer: ['AI announced a transfer but the phones stayed silent', 't1_first'],
  ai_recording: ['AI: recording missing or missed-call data mismatch', 'team'],
  ai_behaviour: ['AI agent behaviour, script, wrong data captured, product defect', 'team'],
  ai_ci: ['Call Intelligence, any issue', 'team'],
  ai_onboarding: ['AI onboarding, go-live or training', 'team'],
  ai_commercial: ['AI cancellation, downgrade, upgrade or adding minutes', 'commercial'],
  ai_other: ['AI, other', 't1_first'],
  v_howto: ['VoIP: how-to on phones or app, labels, line keys, users and lines', 't1'],
  v_callflow: ['VoIP: call flow, schedules, holidays, greetings, menus, override, DND, forwarding', 't1'],
  v_voicemail: ['VoIP: voicemail boxes, access, notifications', 't1'],
  v_app: ['VoIP: Adit app, softphone, call pop, notifications', 't1'],
  v_efax: ['VoIP: eFax sending, receiving, access', 't1'],
  v_offline: ['VoIP: desk or cordless phone offline, No Account, frozen', 't1_first'],
  v_notringing: ['VoIP: phones not ringing, calls straight to voicemail, incoming call problems', 't1_first'],
  v_audio: ['VoIP: audio quality, one-way audio, dropped calls', 'team'],
  v_carrier: ['VoIP: outbound calling, carrier or number problems, outages, all lines down', 'team'],
  v_callerid: ['VoIP: caller ID, spam flags, CNAM, time zone, speed dials, park keys', 'team'],
  v_hardware: ['VoIP: faulty phone or headset, message light, replacements, returns, new phones, installs', 'team'],
  v_tracking: ['VoIP: call tracking, recordings, reports, porting, feature requests', 'team'],
  v_callback: ['VoIP: client needs a call back (T1 cannot make outbound calls)', 'team'],
  v_other: ['VoIP, other', 't1_first'],
};
const GUIDE_DIGEST = `AI SUPPORT (T1 handles basic AI support from 1 Oct 2026). Products: AI Front Desk (After Hours and Full Time), AI SMS Agent, AI Webchat, Call Intelligence. Automated Reminders and Automated Forms are NOT AI products.
T1 owns every AI ticket first (triage, verification, evidence, permitted changes) until it is proven to be an AI product defect or a commercial request.
T1 may: change call trees, overrides, out-of-office (AI number stays the last external element); add the AI number at the end of the tree; change SMS Agent buffer time or turn SMS Agent on/off (inform AI Support); remove AI Front Desk from the call flow in an emergency (replace with voicemail); explain billing and overages.
Never T1: change the AI script, prompts or behaviour; cancellations; downgrades; upgrades or adding minutes; pricing or credits.
Routing: booking, double booking or EHR sync -> Online Scheduling SOP first, AI only after the checks; call tree/override/out of office -> T1; SMS agent timing -> T1 changes it; "AI is texting patients" but SMS Agent is off -> Automated Reminders/Forms owner; Call Intelligence -> AI Support; recording missing or missed-call mismatch -> VoIP Support; AI announced transfer but phones silent -> T1 checks the AI Agent Transfer template, then AI Support; AI captured wrong appointment or insurance data -> AI Support; billing/overage -> T1 explains, upgrades to AI Support; cancellation or downgrade -> AI leads only.
T1 CS CANNOT MAKE OUTBOUND CALLS. When a client needs a call back (for example they went unresponsive in chat or email before the fix was done, or asked to be called), sending the ticket to VoIP for the call back is a correct transfer, even when the issue itself is one T1 resolves.
VOIP SUPPORT (T1 handles basic VoIP from 12 Oct 2026). T1 resolves when the fix is on the client's side or in the Adit app: power cycles, cables and Wi-Fi, base station restarts, DND, call override, call flow and schedule changes, voicemail greetings, app log-outs and notification settings, user and line clean-up, eFax file size or access, and how-to questions.
Send to the VoIP queue when: a phone or cordless base still shows No Account or not registered after cable, Wi-Fi and reboot checks, or is registered but not working; several or all phones at a practice go offline; a factory reset looks necessary; calls go to voicemail although override is off, phones online, not DND and the flow is right; an extra voicemail box on V2/V3; a recording is missing; repeated audio problems or drops; spam flags, caller name (CNAM), time zone, speed dials or park keys; faulty headset or message light stays on; fax failures repeat across numbers over several days; porting, new phones, installs, returns and replacements.`;

const _classifying = new Map();
async function cachedScope(ids) {
  if (!ids.length) return new Map();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    const rows = await all(`SELECT ticket_id, topic, area, expected, why FROM topic_scope WHERE ticket_id IN (${part.map(() => '?').join(',')})`, part);
    for (const r of rows) out.set(String(r.ticket_id), r);
  }
  return out;
}
// Classifies tickets against the guide with AI, 30 per call, and stores the result so each ticket is asked once.
function classifyInBackground(rows) {
  const todo = rows.filter((r) => !_classifying.has(String(r.ticket_id))).slice(0, 500);
  if (!todo.length || !_deps.ai) return;
  const job = (async () => {
    for (let i = 0; i < todo.length; i += 30) {
      const batch = todo.slice(i, i + 30);
      const lines = batch.map((r) => [r.ticket_id, r.channel || '', r.team_name || '', r.ai_category || '', String(r.subject || '').replace(/\s+/g, ' ').slice(0, 140), String(r.description || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)].join(' | ')).join('\n');
      const system = 'You sort Adit support tickets against the T1 support guide below. For each ticket decide: topic (ai, voip or none), the guide area, and who the guide says should handle it. '
        + 'Use only the ticket text; if it does not say enough, use the *_other area. A ticket about phones, calls, voicemail, fax or the Adit phone app is voip unless it is about the AI agent. Online booking or EHR sync blamed on the AI is ai_booking. '
        + 'No em dashes or en dashes.\n\nGUIDE:\n' + GUIDE_DIGEST + '\n\nAREAS (key: meaning):\n' + Object.entries(AREAS).map(([k, v]) => k + ': ' + v[0]).join('\n')
        + '\n\nReturn JSON {"items":[{"id":"ticket id","topic":"ai|voip|none","area":"area key or none","why":"under 15 words"}]}.';
      try {
        const j = await _deps.ai.bestJSON({ system, user: 'Tickets (id | channel | team | Desk topic | subject | start of description):\n' + lines, maxTokens: 3000, feature: 'analyze', timeoutMs: 90000 });
        const items = (j && j.items) || [];
        for (const it of items) {
          const id = String(it.id || ''); if (!batch.some((b) => String(b.ticket_id) === id)) continue;
          const topic = ['ai', 'voip'].includes(it.topic) ? it.topic : 'none';
          const area = AREAS[it.area] ? it.area : (topic === 'ai' ? 'ai_other' : topic === 'voip' ? 'v_other' : 'none');
          await run(`INSERT OR REPLACE INTO topic_scope (ticket_id, topic, area, expected, why, at) VALUES (?,?,?,?,?,datetime('now'))`,
            [id, topic, area, AREAS[area] ? AREAS[area][1] : null, String(it.why || '').replace(/[\u2013\u2014]/g, ',').slice(0, 200)]);
        }
      } catch (e) { console.warn('topic-support classify failed:', e.message); }
    }
  })().finally(() => { for (const r of todo) _classifying.delete(String(r.ticket_id)); });
  for (const r of todo) _classifying.set(String(r.ticket_id), job);
}

function chiDay(t) { try { return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); } catch (e) { return String(t || '').slice(0, 10); } }
const iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Tickets for a topic, read live from AditKB (desk_tickets, non-personal columns only) so today's tickets are
// included; falls back to the synced copy in this app when AditKB is busy or not set up.
async function fetchRows(T, start, end) {
  const kb = _deps.aditkb;
  if (kb && kb.isConfigured && kb.isConfigured()) {
    const sql = `SELECT id AS ticket_id, ticket_number, subject, status, status_type, channel, j_team_name AS team_name,
      cf_ai_category_by_llm AS ai_category, category, cf_owner_change_log AS owner_change_log, assignee_name,
      j_created_by AS created_by_id, created_time, closed_time, web_url, left(description_text, 2500) AS description
      FROM desk_tickets WHERE created_time >= '${iso(start)}' AND created_time < '${iso(end)}'
      AND (j_team_name ~* '${T.sqlTeam}' OR cf_owner_change_log ~* '${T.sqlTeam}' OR cf_ai_category_by_llm ~* '${T.sqlTopic}'
        OR category ~* '${T.sqlTopic}' OR subject ~* '${T.sqlTopic}' OR description_text ~* '${T.sqlDesc}')`;
    let lastErr = null;
    for (let a = 0; a < 3; a++) {
      try {
        const r = await kb.query(sql, 20000);
        return { source: 'aditkb', rows: (r.rows || []).map((x) => Object.assign({}, x, {
          ticket_id: String(x.ticket_id), ticket_number: x.ticket_number != null ? String(x.ticket_number) : '',
          created_by_id: x.created_by_id != null ? String(x.created_by_id) : null, created_time: iso(x.created_time), closed_time: iso(x.closed_time) })) };
      } catch (e) { lastErr = e; if (!/too many connections|timeout|503|502/i.test(e.message)) break; await sleep(1500 * (a + 1)); }
    }
    console.warn('topic-support: AditKB read failed, using synced copy:', lastErr && lastErr.message);
    const rows = await localRows(start, end);
    return { source: 'synced', note: 'AditKB was busy, so this uses the copy synced into the tool; the newest tickets may be missing.', rows };
  }
  return { source: 'synced', rows: await localRows(start, end) };
}
function localRows(start, end) {
  return all(`SELECT ticket_id, ticket_number, subject, status, status_type, channel, team_name, ai_category, category,
      owner_change_log, assignee_name, created_by_id, created_time, closed_time, web_url
      FROM desk_ticket_snapshot WHERE created_time >= ? AND created_time < ?`, [start, end]);
}

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS topic_scope (ticket_id TEXT PRIMARY KEY, topic TEXT, area TEXT, expected TEXT, why TEXT, at TEXT DEFAULT (datetime('now')))`);
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

  const got = start < end ? await fetchRows(T, start, end) : { rows: [], source: 'none' };
  const rows = got.rows;
  const scope = await cachedScope(rows.map((r) => String(r.ticket_id)));
  const unclassified = rows.filter((r) => !scope.has(String(r.ticket_id)));
  classifyInBackground(unclassified);

  const hopRole = (e) => String(e.role || '');
  const isT1 = (e) => e && String(e.role || '').toLowerCase() !== 'team' && rosterNameSet.has(lc(e.name));
  const hopTeam = (e) => String(e.role || '').toLowerCase() === 'team' ? e.name : (pTeam.get(lc(e.name)) || (/voip|ai support/i.test(hopRole(e)) ? hopRole(e) : ''));
  const inTopicTeam = (e) => T.team.test(hopTeam(e));

  const out = {
    topic: T.key, label: T.label, goLive: T.goLive, teamLabel: T.teamLabel, from: start, to: end, source: got.source, sourceNote: got.note || null,
    totals: { inTopic: 0, t1Touched: 0, resolvedByT1: 0, openWithT1: 0, transferred: 0, toTopicTeam: 0, toOther: 0, bypassedT1: 0, againstGuide: 0, commercialKept: 0 },
    byChannel: { call: blank(), chat: blank(), ticket: blank() },
    byAgent: {}, byDay: {}, byCategory: {}, byArea: {}, destinations: {}, tickets: [],
  };
  function blank() { return { t1Touched: 0, resolvedByT1: 0, openWithT1: 0, transferred: 0, toTopicTeam: 0 }; }

  for (const r of rows) {
    const chain = dl.effectiveOwnerChain(r, ctx).full;
    const touchesTeam = T.team.test(r.team_name || '') || chain.some(inTopicTeam);
    const sc = scope.get(String(r.ticket_id));
    const topical = sc ? sc.topic === T.key : (T.topic.test(r.ai_category || '') || T.topic.test(r.category || '') || T.subject.test(r.subject || ''));
    if (!touchesTeam && !topical) continue;
    r._scope = sc && sc.topic === T.key ? sc : null;
    out.totals.inTopic++;
    const ch = chan(r.channel);
    let lastT1 = -1; chain.forEach((e, i) => { if (isT1(e)) lastT1 = i; });
    const day = chiDay(r.created_time);
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
    const exp = r._scope && r._scope.expected;
    const moved = outcome === 'toTopicTeam' || outcome === 'toOther';
    if (exp === 't1' && moved) t.againstGuide++;
    if (exp === 'commercial' && !moved) t.commercialKept++;
    if (r._scope) {
      const ar = out.byArea[r._scope.area] || (out.byArea[r._scope.area] = { area: r._scope.area, label: (AREAS[r._scope.area] || [r._scope.area])[0], expected: r._scope.expected, touched: 0, resolved: 0, transferred: 0 });
      ar.touched++; if (outcome === 'resolved') ar.resolved++; if (moved) ar.transferred++;
    }
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
    const sc = r._scope;
    return { ticketId: String(r.ticket_id), number: r.ticket_number, subject: r.subject, channel: ch, agent, outcome, dest, category: cat,
      created: r.created_time, status: r.status, url: r.web_url,
      guide: sc ? { area: sc.area, label: (AREAS[sc.area] || [sc.area])[0], expected: sc.expected, why: sc.why } : null };
  }
  out.byAgent = Object.values(out.byAgent).sort((a, b) => b.touched - a.touched);
  out.byDay = Object.values(out.byDay).sort((a, b) => a.day.localeCompare(b.day));
  out.byCategory = Object.values(out.byCategory).sort((a, b) => b.touched - a.touched).slice(0, 15);
  out.byArea = Object.values(out.byArea).sort((a, b) => b.touched - a.touched);
  out.classifying = unclassified.length;
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
  // An audit that found the transfer right (for example a call back T1 cannot make) takes it off the Against the guide count.
  out.totals.againstGuide = out.tickets.filter((x) => x.guide && x.guide.expected === 't1' && (x.outcome === 'toTopicTeam' || x.outcome === 'toOther') && !(x.audit && x.audit.verdict === 'right_transfer')).length;
  out.audits = { couldHandle: out.tickets.filter((x) => x.audit && x.audit.verdict === 'could_handle').length,
    rightTransfer: out.tickets.filter((x) => x.audit && x.audit.verdict === 'right_transfer').length,
    unclear: out.tickets.filter((x) => x.audit && x.audit.verdict === 'unclear').length };
  // Two weeks before T1 took over: how much of this topic came in and how much went to the topic team.
  const bStart = new Date(Date.parse(goLiveIso) - 14 * 86400e3).toISOString();
  const before = (await fetchRows(T, bStart, goLiveIso)).rows;
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
    + 'Scope summary from the guides: ' + GUIDE_DIGEST + ' '
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

module.exports = { setDB, setDeps, initSchema, topicSummary, auditTicket, TOPICS, AREAS };
