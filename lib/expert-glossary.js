'use strict';
/**
 * Batch 247 (from Aria's Glossary): "Ask what Expert knows" answers only from what the team has written down: the team
 * rules and notes, the Who Does What sheet (teams, pods, roles, hours) and the support guides. It says whether Expert
 * knows it, partly knows it or has no context, names the sections it used, and when something is missing says what a
 * lead should add. It never reads customer records.
 *
 * Also "Did you mean?": a question that names a person by first name only, when several Adit people share that name,
 * is confirmed before Expert answers.
 */
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const lc = (s) => String(s || '').trim().toLowerCase();
const one = (s, n = 400) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }

async function teamSections() {
  if (!D.whoDoesWhat) return [];
  const r = await D.whoDoesWhat().catch(() => null);
  const people = (r && r.people) || [];
  const by = new Map();
  for (const p of people) { const k = p.team || 'Other'; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  return [...by.entries()].map(([team, list]) => ({ kind: 'team', title: 'Team: ' + team,
    text: list.map((p) => `- ${p.name}${p.real ? ' (real name ' + p.real + ')' : ''}${p.role ? ', ' + p.role : ''}${p.pod ? ', ' + p.pod : ''}${p.hours ? ', hours ' + p.hours : ''}${p.manager ? ', reports to ' + p.manager : ''}${p.ehr ? ', EHR ' + p.ehr : ''}`).join('\n') }));
}

const SYS = `You answer questions from Adit's T1 support team about how Adit works: its terms, rules, process, teams and who owns what. Answer ONLY from the numbered sections given (the team rules and notes, the Who Does What sheet and the support guides). Never use outside knowledge and never guess a person, team, rule or policy.
First decide how well the sections cover the question: "knows" (they answer it fully), "partly" (some of it) or "no context" (nothing written covers it). Then answer in 1 to 4 plain sentences from those sections only. When it is partly or not covered, say exactly what is missing and what a lead should write down so Expert knows it next time.
Reply with JSON: {"knows": "knows" | "partly" | "no context", "answer": "...", "used": [numbers of the sections used], "add": "what a lead should add to the rules or notes, or ''"}. No em or en dashes.`;

async function ask(question) {
  const q = String(question || '').trim().slice(0, 600);
  if (q.length < 3) throw httpError(400, 'Type a question first');
  const [rules, notes, teams, guides] = await Promise.all([
    D.expert.rules().catch(() => []),
    D.expert.notes().catch(() => []),
    teamSections(),
    D.expert.searchLocal([q], { limit: 6, maxChars: 9000, srcs: ['guide'] }).catch(() => []),
  ]);
  const secs = []
    .concat(rules.map((r) => ({ kind: 'rule', title: 'Rule: ' + r.title, text: r.body })))
    .concat(notes.filter((n) => n.kind !== 'rule' && n.status !== 'off').slice(0, 60).map((n) => ({ kind: 'note', title: 'Note: ' + n.title, text: n.body })))
    .concat(teams)
    .concat(guides.map((g) => ({ kind: 'guide', title: 'Guide: ' + g.title + (g.section ? ' > ' + g.section : ''), text: String(g.text || '').slice(0, 1800) })));
  let budget = 60000;
  const used = [];
  for (const s of secs) { const t = `[${used.length + 1}] ${s.title}\n${String(s.text || '').slice(0, 3000)}`; if (budget - t.length < 0) break; budget -= t.length; used.push(Object.assign({}, s, { block: t })); }
  const r = await D.ai.bestJSON({ system: SYS, user: `Question: ${q}\n\nSections:\n${used.map((s) => s.block).join('\n\n')}`, maxTokens: 900, timeoutMs: 60000, temperature: 0 });
  const j = (r && r.json) || {};
  const nums = (Array.isArray(j.used) ? j.used : []).map((n) => Number(String(n).replace(/\D/g, ''))).filter((n) => n >= 1 && n <= used.length);
  return { knows: ['knows', 'partly', 'no context'].includes(lc(j.knows)) ? lc(j.knows) : 'partly', answer: one(j.answer, 1200), add: one(j.add, 400),
    used: [...new Set(nums)].map((n) => ({ kind: used[n - 1].kind, title: used[n - 1].title })), sections: used.length };
}

// ── Did you mean? ──────────────────────────────────────────────────────
// Words that are also first names are not checked when they start a sentence or read as ordinary words.
const COMMON = new Set('will may mark grace hope joy faith april june august art bill frank rose summer dawn sky lane chase hunter page bobby max ray sunny'.split(' '));
let _ppl = { at: 0, list: [] };
async function people() {
  if (Date.now() - _ppl.at < 6 * 3600e3 && _ppl.list.length) return _ppl.list;
  const out = [];
  try {
    if (D.query) {
      const r = await D.query(`select display_name, job_title, department from hr_employees where is_active = true`, 2000);
      for (const x of (r && r.rows) || []) if (x.display_name) out.push({ name: one(x.display_name, 80), role: one(x.job_title, 80), team: one(x.department, 60) });
    }
  } catch (e) { /* HR not readable: use the sheet and the agent list only */ }
  const w = D.whoDoesWhat ? await D.whoDoesWhat().catch(() => null) : null;
  for (const p of (w && w.people) || []) out.push({ name: one(p.name, 80), role: one(p.role, 60), team: one(p.team, 60), real: one(p.real, 80) });
  if (D.agents) for (const a of await D.agents().catch(() => [])) out.push({ name: one(a.name, 80), role: 'T1 agent', team: 'T1 CS' });
  // one row per name (the sheet and HR can list the same person)
  const seen = new Map();
  for (const p of out) { const k = lc(p.name); if (!k) continue; if (!seen.has(k)) seen.set(k, p); else { const s = seen.get(k); s.role = s.role || p.role; s.team = s.team || p.team; } }
  _ppl = { at: Date.now(), list: [...seen.values()] };
  return _ppl.list;
}
/** -> null, or { term, options: [{ label, detail }] } when a first name in the question matches more than one person. */
async function didYouMean(question) {
  const q = String(question || '');
  if (/#?\b\d{6}\b/.test(q)) return null; // a ticket review names people from the ticket itself
  const list = await people();
  if (!list.length) return null;
  const byFirst = new Map();
  for (const p of list) { const f = lc(p.name.split(/\s+/)[0]).replace(/[^a-z]/g, ''); if (f.length < 3) continue; if (!byFirst.has(f)) byFirst.set(f, []); byFirst.get(f).push(p); }
  const words = q.match(/\b[A-Za-z][a-z]{2,}\b/g) || [];
  for (const w of words) {
    const f = lc(w);
    const hits = byFirst.get(f);
    if (!hits || hits.length < 2 || COMMON.has(f)) continue;
    // the full name is already given
    if (hits.some((p) => lc(q).includes(lc(p.name)))) continue;
    const ms = new RegExp('\\b' + w + '\\b').exec(q); if (!ms) continue;
    // a lower-case name counts only after words that point to a person ("handled by tyler", "ask manny")
    if (w[0] !== w[0].toUpperCase() && !/\b(by|to|from|with|ask|is|was|for|and|of|did|does|tell|call|email)\s+$/i.test(q.slice(0, ms.index))) continue;
    return { term: w, options: hits.slice(0, 8).map((p) => ({ label: p.name, detail: [p.role, p.team].filter(Boolean).join(', ') })) };
  }
  return null;
}

module.exports = { setDeps, ask, didYouMean, _people: people, _reset: () => { _ppl = { at: 0, list: [] }; } };
