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

// Sorting rules that do not need AI. Zoho's own Desk topic and a clear subject win over the AI sorting, so a
// ticket Zoho already files under VoIP or AI is never dropped, and stale sorting cannot hide it.
const DESK_AI = /\bAI\b|front desk|call intelligence|voice agent|ai receptionist|ai onboarding|ai product/;
const DESK_VOIP = /voip|phone hardware|phone issue|phone system|\bfax\b|e-?fax|voicemail|caller id|call flow|call quality|call routing|softphone|desk phone|cordless|porting/i;
// "New Call from ... - 1025" emails are voicemail notices from Adit's own support line, not phone problems.
const LINE_NOTICE = /^\s*new call from\b/i;
function topicOf(r, sc) {
  const desk = String(r.ai_category || '') + ' ' + String(r.category || '');
  const subj = String(r.subject || '');
  if (DESK_AI.test(desk)) return { topic: 'ai', by: 'zoho' };
  if (DESK_VOIP.test(desk) && !/porting/i.test(desk)) return { topic: 'voip', by: 'zoho' };
  if (TOPICS.ai.subject.test(subj)) return { topic: 'ai', by: 'subject' };
  if (!LINE_NOTICE.test(subj) && TOPICS.voip.subject.test(subj)) return { topic: 'voip', by: 'subject' };
  if (sc) return { topic: sc.topic, by: 'guide' };
  if (LINE_NOTICE.test(subj)) return { topic: 'none', by: 'notice' };
  if (TOPICS.ai.topic.test(desk)) return { topic: 'ai', by: 'guess' };
  if (TOPICS.voip.topic.test(desk)) return { topic: 'voip', by: 'guess' };
  return { topic: 'none', by: sc ? 'guide' : 'pending' };
}
const SCOPE_VERSION = '3';

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
    const desc = await descriptionsFor(todo.map((r) => r.ticket_id)).catch(() => new Map());
    for (const r of todo) if (!r.description && desc.has(String(r.ticket_id))) r.description = desc.get(String(r.ticket_id));
    for (let i = 0; i < todo.length; i += 30) {
      const batch = todo.slice(i, i + 30);
      const lines = batch.map((r) => [r.ticket_id, r.channel || '', r.team_name || '', r.ai_category || '', String(r.subject || '').replace(/\s+/g, ' ').slice(0, 140), String(r.description || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)].join(' | ')).join('\n');
      const system = 'You sort Adit support tickets against the T1 support guide below. For each ticket decide: topic (ai, voip or none), the guide area, and who the guide says should handle it. '
        + 'Use only the ticket text; if it does not say enough, use the *_other area. A ticket about phones, calls, voicemail, fax or the Adit phone app is voip unless it is about the AI agent. Most tickets are about other things (patient forms, payments, reviews, EHR, the app in general); mark those topic none. Online booking or EHR sync blamed on the AI is ai_booking. Emails titled "New Call from ... - 1025" are voicemail notices from Adit\'s own support line: sort them by what the caller asked about, and mark them none when the text does not say. '
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
// Tickets for a topic, read live from the Zoho Desk mirror (non-personal columns only) so today's tickets are
// included. Every ticket a T1 agent touched in the range is read, not only ones whose subject looks like the topic,
// because many have vague subjects ("Issue", the practice name); the guide sorting then decides the topic.
// Falls back to the copy synced into this tool when the live read fails, and says so.
let _lastLiveError = null;
const ROW_SQL = `id AS ticket_id, ticket_number, subject, status, status_type, channel, j_team_name AS team_name,
      cf_ai_category_by_llm AS ai_category, category, cf_owner_change_log AS owner_change_log, assignee_name,
      j_created_by AS created_by_id, created_time, closed_time, web_url`;
function normRow(x) {
  return Object.assign({}, x, { ticket_id: String(x.ticket_id), ticket_number: x.ticket_number != null ? String(x.ticket_number) : '',
    created_by_id: x.created_by_id != null ? String(x.created_by_id) : null, created_time: iso(x.created_time), closed_time: iso(x.closed_time) });
}
async function liveQuery(sql, limit) {
  const kb = _deps.aditkb; let lastErr = null;
  for (let a = 0; a < 4; a++) {
    try { return await kb.query(sql, limit); }
    catch (e) { lastErr = e; if (!/too many connections|timeout|HTTP 5\d\d|HTTP 429|ECONNRESET|fetch failed/i.test(e.message)) break; await sleep(1500 * (a + 1)); }
  }
  throw lastErr;
}
async function fetchRows(T, start, end) {
  const kb = _deps.aditkb;
  if (kb && kb.isConfigured && kb.isConfigured()) {
    const where = `created_time >= '${iso(start)}' AND created_time < '${iso(end)}'`;
    const sql = `SELECT ${ROW_SQL} FROM desk_tickets WHERE ${where}
      AND (j_team_name ILIKE '%customer support%' OR cf_owner_change_log ILIKE '%T1 Support%')`;
    try {
      const r = await liveQuery(sql, 30000);
      _lastLiveError = null;
      return { source: 'live', rows: (r.rows || []).map(normRow), truncated: !!r.truncated };
    } catch (e) {
      _lastLiveError = { at: new Date().toISOString(), message: e.message };
      console.warn('topic-support: live Zoho read failed, using synced copy:', e.message);
      const rows = await localRows(start, end);
      return { source: 'synced', note: 'The live Zoho read failed just now (' + String(e.message).replace(/AditKB/gi, 'data service').slice(0, 120) + '), so this uses the copy synced into the tool; the newest tickets may be missing. Press Refresh to try again.', rows };
    }
  }
  return { source: 'synced', rows: await localRows(start, end) };
}
// Start of each ticket's description, for the guide sorting (the chat transcript for chat tickets).
async function descriptionsFor(ids) {
  const out = new Map(); const kb = _deps.aditkb;
  if (!ids.length || !kb || !kb.isConfigured || !kb.isConfigured()) return out;
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100).map((x) => String(x).replace(/[^0-9]/g, '')).filter(Boolean);
    if (!part.length) continue;
    try { const r = await liveQuery(`SELECT id, left(description_text, 3000) AS d FROM desk_tickets WHERE id IN (${part.map((x) => "'" + x + "'").join(',')})`, 200); for (const x of r.rows || []) out.set(String(x.id), x.d || ''); }
    catch (e) { /* sort from the subject only */ }
  }
  return out;
}
function localRows(start, end) {
  return all(`SELECT ticket_id, ticket_number, subject, status, status_type, channel, team_name, ai_category, category,
      owner_change_log, assignee_name, created_by_id, created_time, closed_time, web_url
      FROM desk_ticket_snapshot WHERE created_time >= ? AND created_time < ?`, [start, end]);
}

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS topic_reviews (ticket_id TEXT PRIMARY KEY, topic TEXT, agent TEXT, overall INTEGER, guide INTEGER, resolution INTEGER,
    communication INTEGER, handoff INTEGER, summary TEXT, detail TEXT, ticket_modified TEXT, reviewed_by TEXT, reviewed_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS topic_alerts (k TEXT PRIMARY KEY, ticket_id TEXT, code TEXT, at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS topic_weekly (week TEXT PRIMARY KEY, from_iso TEXT, to_iso TEXT, data TEXT, text TEXT, created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS topic_scope (ticket_id TEXT PRIMARY KEY, topic TEXT, area TEXT, expected TEXT, why TEXT, at TEXT DEFAULT (datetime('now')))`);
  // Sorting rules changed: sort every ticket again once.
  await run(`CREATE TABLE IF NOT EXISTS topic_meta (k TEXT PRIMARY KEY, v TEXT)`);
  const ver = await get(`SELECT v FROM topic_meta WHERE k = 'scope_version'`);
  if (!ver || ver.v !== SCOPE_VERSION) {
    await run(`DELETE FROM topic_scope`);
    await run(`INSERT OR REPLACE INTO topic_meta (k, v) VALUES ('scope_version', ?)`, [SCOPE_VERSION]);
  }
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
async function topicSummary({ topic, from, to, agentNames, limit = 400, skipBaseline = false }) {
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
    const tp = topicOf(r, sc);
    const topical = tp.topic === T.key;
    // Only AI or VoIP work (by the guides) that a T1 agent handled: a call, chat or ticket that never reached T1 is left out.
    if (!topical) continue;
    const otherArea = T.key === 'ai' ? 'ai_other' : 'v_other';
    r._scope = sc && sc.topic === T.key ? sc
      : (topical && tp.by !== 'guess' && AREAS[otherArea] ? { topic: T.key, area: otherArea, expected: AREAS[otherArea][1], why: tp.by === 'zoho' ? 'Zoho topic' : 'Subject' } : null);
    const ch = chan(r.channel);
    let lastT1 = -1; chain.forEach((e, i) => { if (isT1(e)) lastT1 = i; });
    if (lastT1 < 0) { out.totals.bypassedT1++; continue; }
    out.totals.inTopic++;
    const day = chiDay(r.created_time);
    const cat = (r.ai_category || r.category || 'Uncategorised').trim();
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
  out.ticketCount = out.tickets.length;
  out.tickets = out.tickets.slice(0, limit);
  // Audit verdicts already on file for the listed tickets.
  const ids = out.tickets.map((x) => x.ticketId);
  if (ids.length) {
    const aud = await all(`SELECT ticket_id, verdict, reason, guide_ref, at FROM topic_audits WHERE ticket_id IN (${ids.map(() => '?').join(',')})`, ids);
    const am = new Map(aud.map((x) => [String(x.ticket_id), x]));
    for (const x of out.tickets) { const v = am.get(x.ticketId); if (v) x.audit = { verdict: v.verdict, reason: v.reason, guide: v.guide_ref, at: v.at }; }
  }
  // Ticket reviews (ratings) on file, and per-agent scorecards built from them.
  const revs = await reviewsFor(ids);
  const DIMS = ['overall', 'guide', 'resolution', 'communication', 'handoff'];
  const agg = {};
  for (const x of out.tickets) {
    const v = revs.get(x.ticketId); if (!v) continue;
    x.review = v;
    const key = x.agent || '';
    const g = agg[key] || (agg[key] = { n: 0, sums: {}, cnt: {}, low: [], improve: {} });
    g.n++;
    for (const d of DIMS) if (v[d] != null) { g.sums[d] = (g.sums[d] || 0) + v[d]; g.cnt[d] = (g.cnt[d] || 0) + 1; }
    g.low.push({ number: x.number, url: x.url, overall: v.overall, summary: v.summary });
    (v.improve || []).forEach((t) => { const k = String(t).slice(0, 120); g.improve[k] = (g.improve[k] || 0) + 1; });
  }
  const avgOf = (g) => { const o = {}; for (const d of DIMS) o[d] = g.cnt[d] ? Math.round(g.sums[d] / g.cnt[d] * 10) / 10 : null; return o; };
  for (const a of out.byAgent) {
    const g = agg[a.name]; if (!g) continue;
    a.reviewed = g.n; a.ratings = avgOf(g);
    const dims = ['guide', 'resolution', 'communication', 'handoff'].filter((d) => a.ratings[d] != null).sort((p, q) => a.ratings[p] - a.ratings[q]);
    a.weakest = dims[0] || null;
    a.lowest = g.low.sort((p, q) => p.overall - q.overall).slice(0, 3);
    a.coaching = Object.entries(g.improve).sort((p, q) => q[1] - p[1]).slice(0, 3).map((e) => e[0]);
  }
  const all_ = Object.values(agg).reduce((m, g) => { m.n += g.n; for (const d of DIMS) { m.sums[d] = (m.sums[d] || 0) + (g.sums[d] || 0); m.cnt[d] = (m.cnt[d] || 0) + (g.cnt[d] || 0); } return m; }, { n: 0, sums: {}, cnt: {} });
  out.ratings = { reviewed: all_.n, avg: avgOf(all_), pending: out.tickets.filter((x) => !x.review && reviewable(x)).length };
  // An audit that found the transfer right (for example a call back T1 cannot make) takes it off the Against the guide count.
  out.totals.againstGuide = out.tickets.filter((x) => x.guide && x.guide.expected === 't1' && (x.outcome === 'toTopicTeam' || x.outcome === 'toOther') && !(x.audit && x.audit.verdict === 'right_transfer')).length;
  out.audits = { couldHandle: out.tickets.filter((x) => x.audit && x.audit.verdict === 'could_handle').length,
    rightTransfer: out.tickets.filter((x) => x.audit && x.audit.verdict === 'right_transfer').length,
    unclear: out.tickets.filter((x) => x.audit && x.audit.verdict === 'unclear').length };
  // Mishandling checks on every ticket (rules from the guides, plus the review when there is one).
  for (const x of out.tickets) x.flags = flagsFor(x);
  out.flagged = out.tickets.filter((x) => x.flags.length).length;
  out.flagCounts = {};
  for (const x of out.tickets) for (const f of x.flags) out.flagCounts[f.code] = (out.flagCounts[f.code] || 0) + 1;
  if (skipBaseline) return out;
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

// ── Ticket reviews ──────────────────────────────────────────────────────
// Reads the whole ticket (description, every reply and note, the SalesIQ chat transcript, matching T1 call
// transcripts from AditKB, the owner history) and rates the T1 handling 1 to 5 on four things: guide adherence,
// resolution, communication and hand-off (hand-off only when it was transferred). One review per ticket; Review
// again on the page redoes it.
function reviewable(x) { return x.agent && (x.outcome === 'resolved' || x.outcome === 'toTopicTeam' || x.outcome === 'toOther'); }
async function reviewsFor(ids) {
  const m = new Map(); if (!ids.length) return m;
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    const rows = await all(`SELECT * FROM topic_reviews WHERE ticket_id IN (${part.map(() => '?').join(',')})`, part);
    for (const r of rows) {
      let extra = {}; try { extra = JSON.parse(r.detail || '{}'); } catch (e) {}
      m.set(String(r.ticket_id), Object.assign({ overall: r.overall, guide: r.guide, resolution: r.resolution, communication: r.communication, handoff: r.handoff, summary: r.summary, at: r.reviewed_at }, extra));
    }
  }
  return m;
}
const clampDay = (iso) => { const d = new Date(iso); const today = new Date(); if (d.toISOString().slice(0, 10) >= today.toISOString().slice(0, 10)) d.setUTCDate(today.getUTCDate() - 1); return d.toISOString(); };
async function callsForTicket(t, agentEmails) {
  if (!_deps.kb || !t.aria_account_id) return [];
  const created = Date.parse(t.created_time); if (!created) return [];
  const from = new Date(created - 3 * 3600e3).toISOString(), to = created + 6 * 3600e3;
  let calls = [];
  try {
    calls = await _deps.kb('call_facts', { select: 'call_key,source,avoma_uuid,subject,start_at,duration_seconds,organizer_email,account_id,has_transcript,team',
      filters: [`account_id:eq:${t.aria_account_id}`, `start_at:gte:${clampDay(from)}`], order_by: 'start_at', desc: false, limit: 30 });
  } catch (e) { return []; }
  calls = calls.filter((c) => { const s = Date.parse(c.start_at); return s >= Date.parse(from) && s <= to && c.has_transcript && (!agentEmails.length || agentEmails.includes(lc(c.organizer_email))); }).slice(0, 2);
  const out = [];
  for (const c of calls) {
    let text = '';
    try { if (c.avoma_uuid) { const tr = await _deps.kb('shiv_avoma_transcripts', { select: 'full_text', filters: [`avoma_uuid:eq:${c.avoma_uuid}`], limit: 1 }); text = (tr[0] && tr[0].full_text) || ''; } } catch (e) {}
    if (!text) { try { const us = await _deps.kb('unit_summaries', { select: 'summary', filters: [`unit_key:eq:${c.call_key}`], limit: 1 }); text = (us[0] && us[0].summary) || ''; } catch (e) {} }
    if (text) out.push({ at: c.start_at, minutes: Math.round((c.duration_seconds || 0) / 60), who: c.organizer_email, text: text.length > 7000 ? text.slice(0, 4000) + ' ... ' + text.slice(-2500) : text });
  }
  return out;
}
async function reviewTicket({ ticketId, topic, agent, outcome, dest, agentEmails = [], by = 'system' }) {
  const T = TOPICS[topic]; if (!T) throw Object.assign(new Error('Unknown topic'), { status: 400 });
  const id = String(ticketId).replace(/[^0-9]/g, '');
  let t = null;
  if (_deps.aditkb && _deps.aditkb.isConfigured()) {
    const q = await _deps.aditkb.query(`SELECT id, ticket_number, subject, channel, status, status_type, j_team_name, cf_ai_category_by_llm, cf_owner_change_log, assignee_name, created_time, closed_time, modified_time, cf_reopen_count, aria_account_id FROM desk_tickets WHERE id = '${id}' LIMIT 1`, 1).catch(() => ({ rows: [] }));
    t = q.rows[0] || null;
  }
  if (!t) throw Object.assign(new Error('Ticket not found in Zoho'), { status: 404 });
  const c = _deps.ticketContext ? await _deps.ticketContext(id).catch(() => null) : null;
  const items = (c && c.items) || [];
  const convo = items.map((it) => `[${String(it.at || '').slice(0, 16)}] ${it.who}: ${String(it.text || '').replace(/\s+/g, ' ')}`).join('\n').slice(0, 14000);
  const calls = await callsForTicket(t, agentEmails).catch(() => []);
  const callText = calls.map((x) => `CALL ${String(x.at).slice(0, 16)} (${x.minutes} min) by ${x.who}:\n${x.text}`).join('\n\n').slice(0, 9000);
  const firstClient = (items.find((it) => it.inbound) || {}).text || '';
  const hits = _deps.guides && _deps.guides.search ? _deps.guides.search([t.subject, t.cf_ai_category_by_llm, String(firstClient).slice(0, 400)].filter(Boolean).join(' '), { limit: 6, maxChars: 7000, doc: topic === 'voip' ? 'voip' : 'ai' }) : [];
  const ref = (hits || []).map((h) => `[${h.title || h.id}] ${h.path || ''}\n${h.text || ''}`).join('\n\n').slice(0, 7000);
  const transferred = outcome === 'toTopicTeam' || outcome === 'toOther';
  const system = 'You are a QA reviewer for Adit T1 customer support (dental, optometry and other practice software). Review how the T1 agent handled this ' + T.label + ' ticket using everything provided: the ticket, every reply and note, the chat transcript, any call transcript, and the owner history. '
    + 'Score 1 to 5 (5 excellent, 4 good, 3 acceptable, 2 weak, 1 poor) on: guide (followed the support guide: right checks in the right order, right owner, transferred only when the guide says so), '
    + 'resolution (the client\'s issue actually fixed or correctly progressed, no needless back and forth, not reopened), communication (clear, polite, empathetic, set expectations, followed up), '
    + (transferred ? 'handoff (the transfer note gave the next team what the guide asks: extensions, phone model, what the screen says, when it started, one phone or all, what was checked, call flow screenshot, best callback contact). ' : 'handoff is null because the ticket was not transferred. ')
    + 'overall is your overall judgement, not an average. Judge only the T1 agent, not other teams. If the record does not show something, say so instead of guessing, and score from what is there. '
    + 'Plain short sentences, no em dashes or en dashes. Scope summary from the guides: ' + GUIDE_DIGEST
    + '\nReturn JSON {"overall":n,"guide":n,"resolution":n,"communication":n,"handoff":n|null,"summary":"two sentences on what happened and how it was handled","strengths":["..."],"improve":["specific coaching points, max 3"],"handoff_missing":["items the transfer note lacked"],"transfer_right":"yes|no|unclear|not_transferred","evidence":"which sources you relied on"}';
  const user = `Ticket #${t.ticket_number} | channel ${t.channel} | status ${t.status} | team now ${t.j_team_name || ''} | Desk topic ${t.cf_ai_category_by_llm || 'none'} | reopened ${t.cf_reopen_count || 0} times\nSubject: ${t.subject || ''}\nT1 agent: ${agent || 'unknown'} | outcome: ${transferred ? 'transferred to ' + (dest || 'another team') : outcome}\nOwner history:\n${t.cf_owner_change_log || '(none)'}\n\nCONVERSATION (oldest first):\n${convo || '(no replies found)'}\n\n${callText ? 'CALL TRANSCRIPTS:\n' + callText + '\n\n' : ''}SUPPORT GUIDE SECTIONS:\n${ref || '(none matched)'}`;
  const j = await _deps.ai.bestJSON({ system, user, maxTokens: 1200, feature: 'analyze', timeoutMs: 120000 });
  const sc = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : null; };
  const clean = (v, n) => String(v || '').replace(/[\u2013\u2014]/g, ',').slice(0, n);
  const arr = (v) => (Array.isArray(v) ? v : []).map((x) => clean(x, 200)).filter(Boolean).slice(0, 4);
  const rec = { overall: sc(j && j.overall), guide: sc(j && j.guide), resolution: sc(j && j.resolution), communication: sc(j && j.communication), handoff: transferred ? sc(j && j.handoff) : null };
  const detail = { strengths: arr(j && j.strengths), improve: arr(j && j.improve), handoffMissing: arr(j && j.handoff_missing), transferRight: clean(j && j.transfer_right, 20),
    evidence: clean(j && j.evidence, 200), sources: { replies: items.filter((i) => !i.chat).length, chat: items.some((i) => i.chat), calls: calls.length }, agent, outcome };
  if (!rec.overall) throw new Error('The review came back without a rating');
  await run(`INSERT OR REPLACE INTO topic_reviews (ticket_id, topic, agent, overall, guide, resolution, communication, handoff, summary, detail, ticket_modified, reviewed_by, reviewed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`, [id, topic, agent || null, rec.overall, rec.guide, rec.resolution, rec.communication, rec.handoff, clean(j && j.summary, 600), JSON.stringify(detail), t.modified_time || null, lc(by)]);
  return Object.assign({ ticketId: id }, rec, { summary: clean(j && j.summary, 600) }, detail);
}
// ── Mishandling ─────────────────────────────────────────────────────────
const FLAG = {
  t1_scope_transfer: 'Transferred, but the guide says T1 resolves this',
  commercial_by_t1: 'Cancellation, downgrade, upgrade or minutes kept by T1; it must go to the AI leads',
  wrong_team: 'Sent to the wrong team for this issue',
  not_voip_team: 'VoIP issue sent to a team outside VoIP',
  transfer_not_right: 'Review found the transfer was not needed',
  low_rating: 'Rated 2 or lower in the ticket review',
  weak_handoff: 'Hand-off note missing what the next team needs',
  stuck_with_t1: 'Still with T1 more than 24 hours',
};
function flagsFor(x) {
  const f = [], g = x.guide, rv = x.review, moved = x.outcome === 'toTopicTeam' || x.outcome === 'toOther';
  const add = (code, why) => f.push({ code, label: FLAG[code], why: why || '' });
  const rightByCheck = (x.audit && x.audit.verdict === 'right_transfer') || (rv && rv.transferRight === 'yes');
  if (g && g.expected === 't1' && moved && !rightByCheck) add('t1_scope_transfer', g.label);
  if (g && g.expected === 'commercial' && (x.outcome === 'resolved' || x.outcome === 'open')) add('commercial_by_t1', g.label);
  if (g && moved) {
    const d = String(x.dest || '');
    if (g.area === 'ai_booking' && /ai support/i.test(d)) add('wrong_team', 'Booking, double booking and EHR sync go through the Online Scheduling SOP first, then the AI team only if the checks are clean');
    if (g.area === 'ai_recording' && /ai support/i.test(d)) add('wrong_team', 'Missing recordings and missed-call data go to VoIP Support');
    if (g.area === 'ai_reminders' && /ai support/i.test(d)) add('wrong_team', 'Automated Reminders and Forms are not AI products; prove the sender and route to their owner');
    if (g.area === 'ai_ci' && !/ai support/i.test(d)) add('wrong_team', 'Call Intelligence goes to AI Support (Antony and Liam)');
    if (g.area && g.area.indexOf('v_') === 0 && x.outcome === 'toOther' && !/voip|porting/i.test(d)) add('not_voip_team', 'Went to ' + (d || 'another team'));
  }
  if (rv && rv.transferRight === 'no' && moved && !(x.audit && x.audit.verdict === 'right_transfer') && !f.some((y) => y.code === 't1_scope_transfer')) add('transfer_not_right', (rv.improve || [])[0] || '');
  if (rv && (rv.overall <= 2 || rv.guide <= 2 || rv.resolution <= 2)) add('low_rating', rv.summary || '');
  if (rv && moved && rv.handoff != null && rv.handoff <= 2) add('weak_handoff', (rv.handoffMissing || []).join(', '));
  if (x.outcome === 'open' && x.created && Date.now() - Date.parse(x.created) > 24 * 3600e3) add('stuck_with_t1');
  return f;
}
// Alerts for newly flagged tickets: one bell notice per ticket and problem, to the admins and active SPOCs.
// The first run only records what is already flagged and sends a single summary.
async function alertSweep({ agentNames }) {
  if (!_deps.notices) return { skipped: true };
  const first = !(await get(`SELECT k FROM topic_alerts LIMIT 1`));
  let sent = 0, fresh = 0;
  const spocs = _deps.spocs ? await _deps.spocs().catch(() => []) : [];
  for (const topic of Object.keys(TOPICS)) {
    const s = await topicSummary({ topic, from: new Date(Date.now() - 3 * 864e5).toISOString(), to: new Date().toISOString(), agentNames, limit: 5000, skipBaseline: true });
    for (const x of s.tickets) for (const fl of (x.flags || [])) {
      const r = await run(`INSERT OR IGNORE INTO topic_alerts (k, ticket_id, code) VALUES (?,?,?)`, [x.ticketId + '|' + fl.code, x.ticketId, fl.code]);
      if (!r.changes) continue;
      fresh++;
      if (first) continue;
      const title = `#${x.number} ${TOPICS[topic].label}: ${fl.label}`;
      const body = `${x.subject || ''}${x.agent ? ' · ' + x.agent : ''}${fl.why ? '. ' + fl.why : ''}. Open Tickets, AI & VoIP to check it.`;
      const urgent = fl.code === 'commercial_by_t1' || fl.code === 'wrong_team';
      await _deps.notices.notifyAudience('admins', { title, body, link: 'app:topic-support', category: 'process', urgent, days: 7 }).catch(() => {});
      for (const e of spocs) await _deps.notices.notifyPerson(e, { title, body, link: 'app:topic-support', category: 'process', urgent }).catch(() => {});
      sent++;
    }
  }
  if (first && fresh) await _deps.notices.notifyAudience('admins', { title: `${fresh} AI and VoIP tickets need attention`, body: 'Checks against the support guides found tickets that may be mishandled. Open Tickets, AI & VoIP and use the Needs attention filter. New ones will be announced one by one.', link: 'app:topic-support', category: 'process', days: 7 }).catch(() => {});
  await run(`DELETE FROM topic_alerts WHERE at < datetime('now', '-60 days')`).catch(() => {});
  return { fresh, sent };
}

// Background: review T1-handled tickets that are closed or transferred and not reviewed yet.
let _sweeping = false;
async function reviewSweep({ agentNames, max = 12 }) {
  if (_sweeping || !_deps.ai) return { skipped: true };
  _sweeping = true; let done = 0, failed = 0;
  try {
    const emails = Object.keys(agentNames || {});
    for (const topic of Object.keys(TOPICS)) {
      if (done >= max) break;
      const s = await topicSummary({ topic, from: new Date(Date.now() - 14 * 864e5).toISOString(), to: new Date().toISOString(), agentNames, limit: 5000, skipBaseline: true });
      const todo = s.tickets.filter((x) => reviewable(x) && !x.review); // newest first, so mishandling shows up quickly
      for (const x of todo) {
        if (done >= max) break;
        try { await reviewTicket({ ticketId: x.ticketId, topic, agent: x.agent, outcome: x.outcome, dest: x.dest, agentEmails: emails }); done++; }
        catch (e) { failed++; console.warn('topic review failed', x.number, e.message); if (failed > 3) break; }
      }
    }
  } finally { _sweeping = false; }
  return { reviewed: done, failed };
}

// ── Weekly report ───────────────────────────────────────────────────────
function chiMidnightIso(ymd) {
  const probe = new Date(ymd + 'T12:00:00Z');
  const off = (new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })) - new Date(probe.toLocaleString('en-US', { timeZone: 'America/Chicago' }))) / 60000;
  return new Date(Date.parse(ymd + 'T00:00:00Z') + off * 60000).toISOString();
}
// The full Monday to Sunday week (Central) before the week `ref` falls in.
function weekBounds(ref) {
  const d = new Date(ref.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  const w = d.toISOString().slice(0, 10), e = new Date(d.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  return { week: w, from: chiMidnightIso(w), to: chiMidnightIso(e) };
}
async function buildWeekly({ agentNames, ref = new Date(), force = false, by = 'system' }) {
  const wb = weekBounds(ref);
  const have = await get(`SELECT week FROM topic_weekly WHERE week = ?`, [wb.week]);
  if (have && !force) return { exists: true, week: wb.week };
  const prev = { from: new Date(Date.parse(wb.from) - 7 * 864e5).toISOString(), to: wb.from };
  const data = {};
  for (const topic of Object.keys(TOPICS)) {
    const s = await topicSummary({ topic, from: wb.from, to: wb.to, agentNames, limit: 5000, skipBaseline: true });
    const p = await topicSummary({ topic, from: prev.from, to: prev.to, agentNames, limit: 5000, skipBaseline: true });
    data[topic] = { label: s.label, totals: s.totals, prevTotals: p.totals, ratings: s.ratings, prevRatings: p.ratings,
      agents: s.byAgent.map((a) => ({ name: a.name, touched: a.touched, resolved: a.resolved, transferred: a.transferred, reviewed: a.reviewed || 0, ratings: a.ratings || null, weakest: a.weakest || null, coaching: a.coaching || [] })),
      areas: (s.byArea || []).slice(0, 10), flagged: s.flagged, flagCounts: s.flagCounts };
  }
  let text = '';
  try {
    const j = await _deps.ai.bestJSON({ system: 'Write a short weekly report for the T1 CS team lead about basic AI and VoIP support handled by T1. Use only the numbers given; do not invent anything. Sections: Headline (2 sentences), AI support, VoIP support, Agents to coach (name and one concrete coaching point each), What to change in the guide or process. Plain sentences, short bullets with "- ", no em dashes or en dashes, no markdown headers (write section names on their own line followed by a colon). Return JSON {"text":"..."}.',
      user: `Week from ${wb.from} to ${wb.to} (Central). Data, with the previous week for comparison:\n${JSON.stringify(data).slice(0, 16000)}`, maxTokens: 1500, feature: 'analyze', timeoutMs: 120000 });
    text = String((j && j.text) || '').replace(/[\u2013\u2014]/g, ',');
  } catch (e) { text = ''; }
  await run(`INSERT OR REPLACE INTO topic_weekly (week, from_iso, to_iso, data, text, created_by, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`, [wb.week, wb.from, wb.to, JSON.stringify(data), text, lc(by)]);
  if (_deps.notices && _deps.notices.notifyAudience) {
    const ai = data.ai.totals, vo = data.voip.totals;
    await _deps.notices.notifyAudience('admins', { title: 'Weekly AI & VoIP report is ready', body: `Week of ${wb.week}: AI ${ai.t1Touched} handled, ${ai.transferred} transferred; VoIP ${vo.t1Touched} handled, ${vo.transferred} transferred. Open Tickets, AI & VoIP to read it.`, link: 'app:topic-support', category: 'process', days: 14 }).catch(() => {});
  }
  return { week: wb.week, created: true };
}
async function listWeekly() {
  const rows = await all(`SELECT week, from_iso, to_iso, data, text, created_at FROM topic_weekly ORDER BY week DESC LIMIT 12`);
  return rows.map((r) => { let d = {}; try { d = JSON.parse(r.data || '{}'); } catch (e) {} return { week: r.week, from: r.from_iso, to: r.to_iso, text: r.text, data: d, created: r.created_at }; });
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

// Why a ticket is or is not on the page, for a ticket number someone expects to see.
async function explainTicket({ number, agentNames }) {
  const num = String(number || '').replace(/[^0-9]/g, '');
  if (!num) throw Object.assign(new Error('Type a ticket number'), { status: 400 });
  let t = null;
  try { const r = await liveQuery(`SELECT ${ROW_SQL} FROM desk_tickets WHERE ticket_number = '${num}' LIMIT 1`, 1); t = r.rows && r.rows[0] ? normRow(r.rows[0]) : null; }
  catch (e) { return { number: num, found: false, lines: ['The live Zoho read failed: ' + String(e.message).replace(/AditKB/gi, 'data service').slice(0, 160)] }; }
  if (!t) return { number: num, found: false, lines: ['Ticket #' + num + ' was not found in Zoho yet. New tickets can take a few minutes to arrive.'] };
  const sc = (await cachedScope([t.ticket_id])).get(t.ticket_id);
  const lines = [], c = Date.parse(t.created_time);
  lines.push(`#${num}: ${t.subject || ''} (${t.channel || ''}, team ${t.team_name || 'none'}, status ${t.status || ''}).`);
  const tp = topicOf(t, sc);
  const tName = (k) => k === 'none' ? 'neither topic' : k === 'ai' ? 'AI support' : 'VoIP support';
  lines.push(sc ? `Guide sorting: ${sc.topic === 'none' ? 'not AI or VoIP' : sc.topic === 'ai' ? 'AI support' : 'VoIP support'}${sc.area && AREAS[sc.area] ? ', ' + AREAS[sc.area][0] : ''}${sc.why ? ' (' + sc.why + ')' : ''}.` : 'Guide sorting: not sorted yet.');
  if (tp.by === 'zoho') lines.push(`Zoho files it under ${t.ai_category || t.category}, so it counts as ${tName(tp.topic)} whatever the guide sorting says.`);
  else if (tp.by === 'subject') lines.push(`The subject clearly points to ${tName(tp.topic)}, so it counts there.`);
  else if (tp.by === 'notice') lines.push('This is a voicemail notice from the support line; it counts only once the guide sorting finds a topic in it.');
  for (const key of Object.keys(TOPICS)) {
    const T = TOPICS[key];
    const goLive = Date.parse(T.goLive + 'T05:00:00.000Z');
    if (c < goLive) { lines.push(`${T.label}: created before T1 took it over on ${T.goLive}, so not counted.`); continue; }
    const s = await topicSummary({ topic: key, from: new Date(c - 1000).toISOString(), to: new Date(c + 1000).toISOString(), agentNames, limit: 50, skipBaseline: true });
    const x = s.tickets.find((y) => y.number === num);
    if (x) lines.push(`${T.label}: counted, ${({ resolved: 'resolved by T1', open: 'still with T1', toTopicTeam: 'transferred', toOther: 'transferred elsewhere', bypassed: 'went straight to team' })[x.outcome] || x.outcome}${x.agent ? ' (' + x.agent + ')' : ''}.${(x.flags || []).length ? ' Needs attention: ' + x.flags.map((f) => f.label).join('; ') + '.' : ''}`);
    else lines.push(`${T.label}: not counted${tp.topic !== key ? ' because it was sorted under ' + tName(tp.topic) : (tp.by === 'pending' ? ' yet; it is waiting to be sorted against the guide' : '')}.`);
  }
  return { number: num, found: true, lines, url: t.web_url };
}
async function resort(ids) { if (ids.length) await run(`DELETE FROM topic_scope WHERE ticket_id IN (${ids.map(() => '?').join(',')})`, ids.map(String)); }

// CSV of the ticket list (opens in Excel; UTF-8 with BOM).
const OUTCOME_LABEL = { resolved: 'Resolved by T1', open: 'Still with T1', toTopicTeam: 'Transferred', toOther: 'Transferred elsewhere', bypassed: 'Went straight to team' };
const EXPECT_LABEL = { t1: 'T1 resolves', t1_first: 'T1 checks first', team: 'Owning team', commercial: 'AI leads only' };
function toCSV(sums) {
  const head = ['Topic', 'Ticket', 'Link', 'Created (Central)', 'Channel', 'Subject', 'Desk topic', 'Guide area', 'Guide says', 'T1 agent', 'Outcome', 'Went to',
    'Rating overall', 'Guide adherence', 'Resolution', 'Communication', 'Hand-off', 'Review summary', 'Coaching points', 'Hand-off missing', 'Audit verdict', 'Audit reason', 'Needs attention'];
  const q = (v) => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lines = [head.join(',')];
  for (const s of sums) for (const x of s.tickets) {
    const r = x.review || {};
    lines.push([s.label, x.number, x.url, x.created ? new Date(x.created).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : '', x.channel, x.subject, x.category,
      x.guide ? x.guide.label : '', x.guide ? EXPECT_LABEL[x.guide.expected] || '' : '', x.agent || '', OUTCOME_LABEL[x.outcome] || x.outcome, x.dest || '',
      r.overall, r.guide, r.resolution, r.communication, r.handoff, r.summary, (r.improve || []).join('; '), (r.handoffMissing || []).join('; '),
      x.audit ? x.audit.verdict : '', x.audit ? x.audit.reason : '', (x.flags || []).map((f) => f.label + (f.why ? ' (' + f.why + ')' : '')).join('; ')].map(q).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}

module.exports = { setDB, setDeps, initSchema, topicSummary, auditTicket, reviewTicket, reviewSweep, buildWeekly, listWeekly, weekBounds, toCSV, explainTicket, alertSweep, FLAG, TOPICS, AREAS };
