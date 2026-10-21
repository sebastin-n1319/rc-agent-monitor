'use strict';
/**
 * Batch 186: Real scenarios. Assessments built from what actually happens on the floor.
 *
 * The reviewer picks who it is for (new joinees, existing agents, a refresher on mistakes, leads), where the scenarios come
 * from (tickets, calls, chats, escalations, reviewer decisions), the topics and the period. The tool finds real solved
 * cases, anonymises them, and the reviewer ticks the ones to use. Each picked case goes to the Builder as one section,
 * together with the Help Center articles and team rules that apply to it, so the right answer is always the documented
 * way of handling it, not just what one agent did. From there it is a normal build: review, then release in parts.
 */
const crypto = require('crypto');
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s*[\u2014\u2013]\s*/g, ', ').slice(0, n);
const one = (s, n = 400) => clean(s, n * 3).replace(/\s+/g, ' ').trim().slice(0, n);
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Modules as AditKB's case index names them, with the words that find them in reviews and call notes.
const MODULES = {
  phones: ['Phones and VoIP', 'phone voip call calls ring ringing extension voicemail fax port porting hold ivr transfer'],
  rcm: ['Insurance and RCM', 'insurance eligibility verification rcm claim claims benefits'],
  platform: ['Platform and login', 'login password user users permission sync integration ehr pms server extension'],
  adit_pay: ['Adit Pay', 'pay payment payments terminal refund card reader payout deposit'],
  ai_front_desk: ['AI Front Desk', 'ai agent front desk receptionist bot webchat'],
  patient_forms: ['Patient Forms', 'form forms intake signature consent'],
  marketing: ['Marketing', 'marketing website seo google listing ads'],
  engage: ['Engage (texts and reminders)', 'engage reminder reminders text texts sms confirmation recall'],
  online_scheduling: ['Online Scheduling', 'scheduling scheduler booking appointment online'],
  billing: ['Billing', 'billing invoice charge charges overage cancel cancellation'],
  onboarding_lifecycle: ['Onboarding', 'onboarding setup go live training'],
  texting_chat: ['Texting and chat', 'texting chat two-way messages inbox'],
  call_tracking: ['Call Tracking', 'call tracking tracking number'],
  call_intelligence: ['Call Intelligence', 'call intelligence transcript recording analysis'],
  patient_records: ['Patient records', 'patient card records duplicate patient'],
  practice_analytics: ['Practice Analytics', 'analytics report reports dashboard'],
  pozative: ['Pozative reviews', 'review reviews pozative reputation'],
  email_campaigns: ['Email campaigns', 'email campaign campaigns newsletter'],
};
const SOURCES = ['tickets', 'calls', 'chats', 'escalations', 'reviews'];
const label = (m) => (MODULES[m] ? MODULES[m][0] : String(m || 'General').replace(/_/g, ' '));

// ── Anonymising: no names, numbers or addresses leave this file ─────────
const TEMPLATE_LINE = /^\s*(client|contact|caller|customer|patient|practice|office|doctor|dr)\s*name\b.*$|^\s*(account|acct|callback|call back|phone|mobile|email|deal stage|deal|location id|ticket)\s*(number|no|#|stage|id)?\s*[-:\u2013]+.*$|^\s*ticket (not )?shared\s*$/gim;
function scrub(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(TEMPLATE_LINE, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]').replace(/#\s?\d{4,}/g, '').replace(/\b\d{5,}\b/g, '[number]')
    .replace(/\b(Dr|Doctor|Mr|Mrs|Ms)\.?\s+[A-Z][a-z]+/g, 'the doctor').replace(/\s+/g, ' ').trim();
}

// ── What can be picked ───────────────────────────────────────────────────
let _opts = { at: 0, v: null };
async function options() {
  if (_opts.v && Date.now() - _opts.at < 6 * 3600e3) return _opts.v;
  const counts = {};
  if (D.query) {
    try {
      const r = await withTimeout(D.query(`SELECT module, count(*) AS n FROM case_index WHERE resolution IS NOT NULL AND length(resolution) > 80 AND opened > now() - interval '90 days' GROUP BY module`, 60), 15000);
      for (const x of r.rows || []) if (MODULES[x.module]) counts[x.module] = Number(x.n) || 0;
    } catch (e) { console.warn('assess-real options:', e.message); }
  }
  let reviews = 0, calls = 0;
  try { reviews = (await D.expert._reviewChunks()).filter(x => x.src === 'review').length; } catch (e) {}
  try { calls = await D.expert._callCount(); } catch (e) {}
  let updates = 0; try { updates = (await D.expert._updateChunks()).length; } catch (e) {}
  const modules = Object.keys(MODULES).map(k => ({ key: k, label: MODULES[k][0], n: counts[k] || 0 })).sort((a, b) => b.n - a.n);
  const v = { modules, cases: !!D.query, reviews, calls, updates };
  _opts = { at: Date.now(), v };
  return v;
}

// ── Find candidate cases ─────────────────────────────────────────────────
const PREVIEWS = new Map(); // token -> { at, by, items }
function sqlChannel(src) {
  const ch = [];
  if (src.includes('tickets')) ch.push(`(kind = 'ticket' AND coalesce(facets->>'channel','') IN ('Email','Web','Adit App',''))`);
  if (src.includes('calls')) ch.push(`(kind = 'ticket' AND facets->>'channel' = 'Phone')`);
  if (src.includes('chats')) ch.push(`(kind = 'ticket' AND facets->>'channel' = 'Chat')`);
  if (src.includes('escalations')) ch.push(`kind = 'escalation'`);
  return ch.length ? '(' + ch.join(' OR ') + ')' : null;
}
const JUNK = /^(closing|closed|resolved|issue resolved|done|no response|client disconnected|duplicate|spam|test)\b/i;
function chanName(kind, ch) { if (kind === 'escalation') return 'Escalation'; if (ch === 'Phone') return 'Call'; if (ch === 'Chat') return 'Chat'; return 'Ticket'; }

async function preview(b, by) {
  const src = (Array.isArray(b.sources) ? b.sources : SOURCES).filter(s => SOURCES.includes(s));
  if (!src.length) throw httpError(400, 'Pick at least one place to take scenarios from');
  const days = [30, 90, 180, 365].includes(Number(b.days)) ? Number(b.days) : 90;
  const want = Math.max(1, Math.min(40, Math.round(Number(b.cases) || 8)));
  const opt = await options();
  let mods = (Array.isArray(b.modules) ? b.modules : []).filter(m => MODULES[m]);
  const topIssues = !mods.length;
  if (topIssues) mods = opt.modules.filter(m => m.n > 0).slice(0, 6).map(m => m.key);
  if (!mods.length) mods = ['phones', 'engage', 'adit_pay', 'platform'];
  const kw = one(b.keywords, 200).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2).slice(0, 8);
  const seed = crypto.randomBytes(4).toString('hex');
  const items = [];
  // 1. Solved tickets, calls, chats and escalations from AditKB
  const chan = sqlChannel(src);
  if (chan && D.query) {
    const per = Math.max(3, Math.min(25, Math.ceil(want * 2 / mods.length) + 1));
    for (const m of mods) {
      const ts = kw.length ? ` AND tsv @@ websearch_to_tsquery('english', '${kw.join(' or ')}')` : '';
      const sql = `SELECT ref, kind, module, title, left(body, 1400) AS body, left(resolution, 1000) AS resolution, opened, facets->>'channel' AS channel
        FROM case_index WHERE module = '${m}' AND resolution IS NOT NULL AND length(resolution) > 80 AND length(body) > 60
          AND opened > now() - interval '${days} days' AND ${chan}${ts}
        ORDER BY md5(ref::text || '${seed}') LIMIT ${per}`;
      try {
        const r = await withTimeout(D.query(sql, per), 15000);
        for (const x of r.rows || []) {
          const fix = scrub(x.resolution); if (JUNK.test(fix) && fix.length < 120) continue;
          const problem = scrub(x.body); if (problem.length < 40) continue;
          items.push({ id: 'k' + crypto.createHash('md5').update(String(x.ref)).digest('hex').slice(0, 10), kind: x.kind === 'escalation' ? 'escalation' : 'case', module: m, moduleLabel: label(m),
            channel: chanName(x.kind, x.channel), at: String(x.opened || '').slice(0, 7), title: one(scrub(String(x.title || '').replace(/^#\d+\s*[-,:]?\s*/, '')), 140),
            problem: one(problem, 900), fix: one(fix, 800), score: Math.min(fix.length, 600) + Math.min(problem.length, 400) });
        }
      } catch (e) { console.warn('assess-real cases', m, e.message); }
    }
  }
  const words = new Set(mods.flatMap(m => MODULES[m][1].split(' ')).concat(kw));
  const hits = (t) => { const s = String(t || '').toLowerCase(); let n = 0; for (const w of words) if (s.includes(w)) n++; return n; };
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  // 2. Calls: what T1 calls were about and how they ended, from the call notes
  if (src.includes('calls') && D.expert) {
    try {
      for (const c of await D.expert._recentCalls(since, 400)) {
        const h = hits(c.product + ' ' + c.text); if (!topIssues && h < 2 && !mods.includes(String(c.product))) continue; if (topIssues && h < 1) continue;
        items.push({ id: 'c' + crypto.createHash('md5').update(String(c.unit_key)).digest('hex').slice(0, 10), kind: 'call', module: MODULES[c.product] ? c.product : mods[0], moduleLabel: label(MODULES[c.product] ? c.product : mods[0]),
          channel: 'Call', at: String(c.at || '').slice(0, 7), title: 'Support call findings', problem: one(scrub(c.text), 900), fix: '', score: 200 + h * 40 });
      }
    } catch (e) { console.warn('assess-real calls', e.message); }
  }
  // 3. Reviewer decisions: wrong transfers, things T1 could have handled, QA fixes. These teach the right way.
  if (src.includes('reviews') && D.expert) {
    try {
      for (const r of await D.expert._reviewChunks()) {
        if (r.src !== 'review' || (r.at && r.at < since)) continue;
        const h = hits(r.title + ' ' + r.text); if (h < (topIssues ? 1 : 2)) continue;
        const mistake = /^(Wrong transfer|T1 could have handled|QA: needed a fix|Handling review)/.test(r.title);
        items.push({ id: 'r' + crypto.createHash('md5').update(String(r.id)).digest('hex').slice(0, 10), kind: 'review', module: mods[0], moduleLabel: one(r.module, 40) || label(mods[0]),
          channel: 'Reviewer decision', at: String(r.at || '').slice(0, 7), title: one(scrub(r.title), 140), problem: one(scrub(r.text), 900), fix: '', mistake, score: 300 + h * 40 + (mistake ? 200 : 0) });
      }
    } catch (e) { console.warn('assess-real reviews', e.message); }
  }
  if (!items.length) throw httpError(404, 'No real cases matched. Try more topics, a longer period or other sources.');
  // Spread across topics and kinds, best first, and pre-tick the number asked for.
  const seen = new Set(), uniq = items.filter(x => { const k = x.title.toLowerCase().slice(0, 60) + '|' + x.problem.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
  const byKey = {}; uniq.sort((a, b) => b.score - a.score).forEach(x => { (byKey[x.module + x.kind] = byKey[x.module + x.kind] || []).push(x); });
  const out = []; const lists = Object.values(byKey);
  for (let i = 0; out.length < Math.min(uniq.length, want * 3, 90); i++) { let added = false; for (const l of lists) if (l[i]) { out.push(l[i]); added = true; } if (!added) break; }
  out.forEach((x, i) => { x.picked = i < want; });
  const token = crypto.randomBytes(8).toString('hex');
  PREVIEWS.set(token, { at: Date.now(), by: String(by || '').toLowerCase(), items: out });
  for (const [k, v] of PREVIEWS) if (Date.now() - v.at > 3600e3) PREVIEWS.delete(k);
  return { token, topIssues, modules: mods.map(m => ({ key: m, label: label(m) })), days, items: out.map(({ score, ...x }) => x) };
}

// ── Write: one section per case, with the Help Center and rules that apply ─
async function build(b, by, ai) {
  const pv = PREVIEWS.get(String(b.token || ''));
  if (!pv) throw httpError(410, 'These cases have expired. Press Find real cases again.');
  const ids = new Set(Array.isArray(b.ids) ? b.ids.map(String) : []);
  const picked = pv.items.filter(x => ids.has(x.id)).slice(0, 40);
  if (!picked.length) throw httpError(400, 'Tick at least one case');
  const sections = [];
  let n = 0;
  for (const c of picked) {
    n++;
    let refs = [];
    try { refs = await D.expert.searchLocal([c.title + ' ' + c.problem.slice(0, 300)], { limit: 4, maxChars: 3600, srcs: ['kb', 'rule', 'note', 'guide', 'update', 'qa'] }); } catch (e) {}
    const refText = refs.map(r => `- [${r.src === 'kb' ? 'Help Center' : r.src === 'rule' ? 'Team rule' : r.src === 'guide' ? 'Support guide' : r.src === 'qa' ? 'QA rule' : 'Team note'}] ${one(r.title, 140)}: ${one(r.text, 900)}${r.url ? ' (' + r.url + ')' : ''}`).join('\n');
    const head = `# Case ${n}: ${c.moduleLabel} (${c.channel}${c.at ? ', ' + c.at : ''})`;
    const body = c.kind === 'review'
      ? `What happened (a reviewer's decision on a real ticket, anonymised): ${c.problem}\nThis is a ${c.mistake ? 'mistake to learn from: test the correct handling, not what was done' : 'correct handling to learn from'}.`
      : c.kind === 'call'
        ? `What came up on a real T1 support call (anonymised notes): ${c.problem}`
        : `What the customer reported (real ${c.kind === 'escalation' ? 'escalation' : c.channel.toLowerCase()}, anonymised): ${c.problem}\nHow it was resolved: ${c.fix}`;
    sections.push(`${head}\n${body}\n${refText ? 'Help Center articles and team rules that apply:\n' + refText : 'No Help Center article matched this case; only ask about what the case itself shows.'}`);
  }
  // What changed recently in the same modules (Adit Updates site), so the questions match how things work now.
  let updatesUsed = 0;
  if (b.includeUpdates !== false && D.expert && D.expert._updateChunks) {
    try {
      const mods = Array.from(new Set(picked.map(x => x.module))).filter(m => MODULES[m]);
      const words = new Set(mods.flatMap(m => MODULES[m][1].split(' ')).filter(w => w.length > 3));
      const cutoff = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
      const ups = (await D.expert._updateChunks()).filter(u => !u.at || u.at >= cutoff).map(u => { const t = (u.title + ' ' + u.module + ' ' + u.text).toLowerCase(); let h = 0; for (const w of words) if (t.includes(w)) h++; return { u, h }; })
        .filter(x => x.h >= 1).sort((a, b) => b.h - a.h || String(b.u.at).localeCompare(String(a.u.at))).slice(0, 6).map(x => x.u);
      if (ups.length) { updatesUsed = ups.length; sections.push('# Recent product and process updates\nThese changed recently. Where they differ from older material, they win. Ask how the agent handles a customer now that this changed.\n' + ups.map(u => `- (${u.at || 'recent'}) ${one(u.text, 1200)}`).join('\n')); }
    } catch (e) { /* optional */ }
  }
  const text = sections.join('\n\n');
  const k = Math.max(1, Math.min(5, Math.round(Number(b.perCase) || 3))), perCase = Math.max(2, k);
  const style = b.style === 'situations' ? 'situations' : 'cases';
  const total = Math.max(5, Math.min(200, picked.length * k));
  const mistakes = picked.filter(x => x.mistake).length;
  const focus = [
    'These are real Adit support cases from the team\'s own tickets, calls and chats, already anonymised.',
    style === 'cases' ? 'Write one customer case per section, based on that real case.' : 'Base every question on one of the real cases.',
    'The right answer is what the Help Center and the team rules say. Where the real handling differed from them, or a reviewer marked it wrong, test the correct way.',
    'Cover the whole job: what to ask first, what to check, what to tell the customer, whether T1 handles it (anything in the Help Center is T1\'s) or who it goes to (escalations, cancellations and port-outs go to the account\'s CSM or the escalation manager; T1 never makes outbound calls, callbacks go to VoIP).',
    'Never include names, office names, phone numbers, emails, account or ticket numbers. Use a generic office type instead.',
    mistakes ? `${mistakes} of the cases are mistakes reviewers caught: make the wrong options include that mistake.` : '',
    one(b.focus, 400),
  ].filter(Boolean).join(' ');
  const title = one(b.title, 140) || `Real scenarios: ${Array.from(new Set(picked.map(x => x.moduleLabel))).slice(0, 3).join(', ')}`;
  const id = await D.builder.create({ text, sourceName: `Real cases (${picked.length}: ${['case', 'escalation', 'call', 'review'].map(k => { const c = picked.filter(x => x.kind === k).length; return c ? c + ' ' + (k === 'case' ? 'tickets/chats' : k === 'review' ? 'reviewer decisions' : k + 's') : ''; }).filter(Boolean).join(', ')})`,
    title, style, perCase, total, partSize: Math.max(5, Math.min(total, Math.round(Number(b.partSize) || total))), channel: b.channel, audience: b.audience, audienceNote: b.audienceNote, level: b.level,
    types: Array.isArray(b.types) && b.types.length ? b.types : ['single', 'multi', 'truefalse'], order: 'document', focus, origin: 'real', schedule: b.schedule || null }, by, ai);
  return { id, cases: picked.length, total, updates: updatesUsed };
}

module.exports = { setDeps, options, preview, build, _scrub: scrub, MODULES };
