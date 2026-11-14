'use strict';
/**
 * Batch 335: the Expert library (after Karpathy's "LLM Wiki" idea). Instead of rebuilding every answer from raw search
 * results each time, Expert keeps short, maintained pages, one per common T1 topic, compiled from the Help Center,
 * guides, team rules, product updates and solved cases, plus answers the team confirmed. Expert reads the matching page
 * first; a strong match also lets it skip the costly cross-Adit lookups on routine how-to tickets.
 *
 *   Discover  topics from the questions agents ask and the tickets Expert drafts (last 30 days).
 *   Build     one page per topic from its sources (Sonnet, once), with what T1 does, steps, owner, gotchas, client wording.
 *   File back answers agents marked helpful and drafts sent as written become "confirmed answers" on the page.
 *   Refresh   a page is rebuilt when its sources changed or enough new confirmed answers arrived.
 *   Lint      weekly: contradictions between the Help Center, rules and updates, stale or missing facts, per page.
 *   Log       every build, file-back and lint is logged.
 */
const crypto = require('crypto');
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const one = (s, n = 400) => String(s == null ? '' : s).replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
const clean = (s, n = 8000) => String(s == null ? '' : s).replace(/\s*[—–]\s*/g, ', ').slice(0, n);
const lc = (s) => String(s || '').toLowerCase();
const scrub = (t) => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[contact]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[contact]');
const slugOf = (t) => lc(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const enabled = () => process.env.EXPERT_LIBRARY !== 'off';
const MAX_BUILDS = () => Number(process.env.EXPERT_LIBRARY_MAX_BUILDS) || 12; // per run, to keep the cost small

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_pages (slug TEXT PRIMARY KEY, title TEXT, module TEXT, summary TEXT, keywords TEXT, body TEXT,
    sources_json TEXT, src_hash TEXT, confirmed_json TEXT DEFAULT '[]', new_confirmed INTEGER DEFAULT 0, lint_json TEXT DEFAULT '[]', status TEXT DEFAULT 'active',
    version INTEGER DEFAULT 0, hits INTEGER DEFAULT 0, saved_calls INTEGER DEFAULT 0, built_at TEXT, linted_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS expert_page_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), slug TEXT, kind TEXT, detail TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS expert_page_state (k TEXT PRIMARY KEY, v TEXT)`);
}
async function logEv(slug, kind, detail) { await run(`INSERT INTO expert_page_log (slug, kind, detail) VALUES (?,?,?)`, [slug || '', kind, one(detail, 600)]).catch(() => {}); }
async function state(k, v) { if (v === undefined) { const r = await get(`SELECT v FROM expert_page_state WHERE k = ?`, [k]).catch(() => null); return r ? r.v : null; } await run(`INSERT INTO expert_page_state (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`, [k, String(v)]).catch(() => {}); }

// ── pages as search chunks (read by Expert's search index) ──────────────
let _pages = null;
async function pages() {
  if (_pages && Date.now() - _pages.at < 5 * 60000) return _pages.v;
  const v = _db ? await all(`SELECT slug, title, module, summary, keywords, body, confirmed_json, lint_json, updated_at, version FROM expert_pages WHERE status = 'active' AND body IS NOT NULL`).catch(() => []) : [];
  _pages = { at: Date.now(), v }; return v;
}
function bust() { _pages = null; if (D.expert && D.expert.bust) D.expert.bust(); }
function pageText(p) {
  let lint = []; try { lint = JSON.parse(p.lint_json || '[]'); } catch (e) { /* none */ }
  let conf = []; try { conf = JSON.parse(p.confirmed_json || '[]'); } catch (e) { /* none */ }
  return [p.body,
    conf.length ? 'Answers the team confirmed:\n' + conf.slice(-3).map((c) => '- Q: ' + one(c.q, 200) + '\n  A: ' + one(c.a, 600)).join('\n') : '',
    lint.length ? 'Open questions from the weekly check (do not state these as fact):\n' + lint.map((x) => '- ' + one(x, 240)).join('\n') : ''].filter(Boolean).join('\n\n');
}
async function chunks() {
  if (!enabled()) return [];
  return (await pages()).map((p) => ({ src: 'page', id: p.slug, title: 'Expert library: ' + p.title + ' (v' + p.version + ', updated ' + String(p.updated_at || '').slice(0, 10) + ')', section: '', module: p.module || '', text: (p.keywords ? 'Covers: ' + p.keywords + '\n' : '') + pageText(p) }));
}
// How well the library covers a question: the best page and a score. Strong means the page title or keywords carry
// most of the question's main words.
const STOPW = new Set('a an the and or of to in on for with is are be it this that how what why when do does can could should we i you they my our your client patient office adit please help need want not get set up'.split(' '));
const toks = (s) => lc(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPW.has(w)).map((w) => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
async function match(text) {
  if (!enabled()) return null;
  const q = new Set(toks(text)); if (!q.size) return null;
  let best = null;
  for (const p of await pages()) {
    const t = new Set(toks(p.title + ' ' + (p.keywords || '') + ' ' + (p.summary || '')));
    let hit = 0; for (const w of q) if (t.has(w)) hit++;
    const score = hit / Math.min(q.size, 8);
    if (!best || score > best.score) best = { slug: p.slug, title: p.title, score: Math.round(score * 100) / 100 };
  }
  if (!best || best.score < 0.25) return null;
  best.strong = best.score >= 0.5;
  return best;
}
async function noteUse(slug, saved) { if (slug) await run(`UPDATE expert_pages SET hits = hits + 1, saved_calls = saved_calls + ? WHERE slug = ?`, [saved ? 1 : 0, slug]).catch(() => {}); }

// ── discover topics ─────────────────────────────────────────────────────
async function discover({ days = 30, max = 40 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const qs = await all(`SELECT question, module FROM expert_log WHERE created_at >= ? AND length(question) BETWEEN 8 AND 400 ORDER BY id DESC LIMIT 600`, [since]).catch(() => []);
  const tk = await all(`SELECT subject FROM expert_desk_drafts WHERE created_at >= ? AND subject IS NOT NULL ORDER BY id DESC LIMIT 300`, [since]).catch(() => []);
  const have = (await all(`SELECT slug, title FROM expert_pages`).catch(() => [])).map((r) => r.title);
  const text = qs.map((r) => '- ' + one(scrub(r.question), 200) + (r.module ? ' [' + r.module + ']' : '')).concat(tk.map((r) => '- ticket: ' + one(scrub(r.subject), 120))).join('\n').slice(0, 30000);
  if (!text.trim() || !D.ai) return [];
  const sys = `You group support questions from Adit's T1 team (Adit is software for dental, orthodontic, optometry and chiropractic practices) into recurring TOPICS worth a short internal knowledge page each. A topic is one product task or problem, for example "Customize appointment reminders", "Texts not reaching patients", "Turn off app notifications on a phone", "Patient forms not syncing to the EHR", "Port-out requests". Skip one-off, account-specific or chit-chat items. Most frequent first, at most ${max}. Do not repeat these existing pages: ${have.join('; ') || 'none'}.
Return JSON {"topics": [{"title": "short task-style title", "module": "Adit module", "keywords": "8 to 14 search words agents and clients use for it", "count": number of questions it covers}]}`;
  const r = await D.ai.chatJSON({ feature: 'analyze', _feature: 'expert-library', messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], maxTokens: 3000, temperature: 0.1, timeoutMs: 60000 }).catch(() => null)
    || await D.ai.bestJSON({ system: sys, user: text, maxTokens: 3000, feature: 'expert-library', timeoutMs: 60000, temperature: 0 }).catch(() => null);
  const list = ((r && r.json && r.json.topics) || []).filter((t) => t && t.title).slice(0, max)
    .map((t) => ({ slug: slugOf(t.title), title: one(t.title, 90), module: one(t.module, 60), keywords: one(t.keywords, 300), count: Number(t.count) || 0 }))
    .filter((t) => t.slug && !have.some((h) => slugOf(h) === t.slug));
  for (const t of list) await run(`INSERT OR IGNORE INTO expert_pages (slug, title, module, keywords, status) VALUES (?,?,?,?, 'active')`, [t.slug, t.title, t.module, t.keywords]);
  if (list.length) await logEv('', 'discover', `${list.length} new topics: ${list.map((t) => t.title).join('; ')}`);
  return list;
}

// ── build a page ────────────────────────────────────────────────────────
const BUILD_SYS = `You write and maintain the internal knowledge page for one topic for Adit's T1 support team (Adit is software for dental, orthodontic, optometry and chiropractic practices). The page is read by Adit Expert, the team's AI assistant, before it answers, so it must be exact and only contain what the numbered sources support.
Authority, highest first: [RULE] and [NOTE] team rules, [UPDATE] product updates (newer beats older), [KB] Help Center and [GUIDE] support guides for product steps, then [CASE] solved tickets and [LEARNED] confirmed answers for how the team actually solved it.
Write these sections, plain text, short lines, no em or en dashes:
WHAT IT IS: one or two sentences.
T1 OR HAND OVER: what T1 does itself and when it goes to another team (named in the sources), and how.
STEPS: numbered, exact menu paths and setting names as the sources write them, with the Help Center article link.
CHECK FIRST: the questions to ask or things to check, in order.
GOTCHAS: known pitfalls, limits and common causes seen in solved cases.
SAY TO THE CLIENT: one short, warm, client-facing example, no internal teams or tiers, no promises or time frames.
CONFLICTS: where sources disagree or a fact is missing (write "None" when none).
Never invent settings, prices, timelines or policies. Never include client or patient names, emails or phone numbers.
Return JSON {"summary": "one line: what the page answers", "keywords": "10 to 16 search words", "body": "the sections above", "conflicts": ["..."], "sources": [numbers used]}`;
async function sourcesFor(p) {
  const E = D.expert; if (!E) return [];
  const qs = [p.title, p.keywords].filter(Boolean);
  const local = await E.searchLocal(qs, { module: p.module || '', limit: 14, maxChars: 22000, srcs: ['kb', 'guide', 'rule', 'note', 'update', 'learned', 'review'] }).catch(() => []);
  const cases = await E.searchCases(qs.join(' '), p.module || '').catch(() => []);
  return local.concat(cases.slice(0, 6));
}
async function build(slug, { force = false } = {}) {
  const p = await get(`SELECT * FROM expert_pages WHERE slug = ?`, [slug]); if (!p) return { error: 'no page' };
  const src = await sourcesFor(p);
  if (!src.length) { await logEv(slug, 'skip', 'no sources found'); return { skipped: 'no sources' }; }
  let conf = []; try { conf = JSON.parse(p.confirmed_json || '[]'); } catch (e) { /* none */ }
  const h = hash(src.map((c) => c.src + c.id + (c.section || '') + c.text.length).join('|') + conf.length);
  if (!force && p.body && p.src_hash === h) return { skipped: 'no change' };
  const ctx = src.map((c, i) => `[S${i + 1}] [${({ kb: 'KB', guide: 'GUIDE', rule: 'RULE', note: 'NOTE', update: 'UPDATE', learned: 'LEARNED', review: 'REVIEW', case: 'CASE' })[c.src] || 'SRC'}] ${c.title}${c.section ? ' > ' + c.section : ''}${c.url ? ' (' + c.url + ')' : ''}\n${scrub(c.text).slice(0, 2600)}`).join('\n\n');
  const confTxt = conf.length ? '\n\nAnswers the team confirmed on real tickets (use when they agree with higher sources):\n' + conf.slice(-6).map((c) => '- Q: ' + one(c.q, 200) + '\n  A: ' + one(c.a, 700)).join('\n') : '';
  const prev = p.body ? '\n\nThe current page (keep what is still supported, fix what changed):\n' + clean(p.body, 5000) : '';
  const r = await D.ai.bestJSON({ system: BUILD_SYS, user: `TOPIC: ${p.title}${p.module ? ' (' + p.module + ')' : ''}\n\nSOURCES:\n${ctx}${confTxt}${prev}`, maxTokens: 3500, feature: 'expert-library', timeoutMs: 120000, temperature: 0 });
  const j = (r && r.json) || {};
  const body = clean(scrub(j.body || ''), 9000).trim();
  if (body.length < 120) { await logEv(slug, 'error', 'page came back empty'); return { error: 'empty page' }; }
  const used = (Array.isArray(j.sources) ? j.sources : []).map((n) => src[Number(String(n).replace(/\D/g, '')) - 1]).filter(Boolean).map((c) => ({ src: c.src, id: String(c.id), title: one(c.title, 140), url: c.url || '' }));
  const lint = (Array.isArray(j.conflicts) ? j.conflicts : []).map((x) => one(x, 240)).filter((x) => x && !/^none\.?$/i.test(x)).slice(0, 6);
  await run(`UPDATE expert_pages SET summary = ?, keywords = ?, body = ?, sources_json = ?, src_hash = ?, lint_json = ?, new_confirmed = 0, version = version + 1, built_at = datetime('now'), updated_at = datetime('now') WHERE slug = ?`,
    [one(j.summary, 200), one(j.keywords || p.keywords, 320), body, JSON.stringify(used), h, JSON.stringify(lint), slug]);
  await logEv(slug, p.body ? 'update' : 'ingest', `v${(p.version || 0) + 1} from ${used.length} sources${lint.length ? ', ' + lint.length + ' open questions' : ''}`);
  bust();
  return { built: slug, sources: used.length, conflicts: lint.length };
}

// ── file back confirmed answers ─────────────────────────────────────────
async function fileBack({ question, answer, via }) {
  if (!enabled() || !question || !answer) return null;
  const m = await match(question); if (!m) return null;
  const p = await get(`SELECT confirmed_json FROM expert_pages WHERE slug = ?`, [m.slug]); if (!p) return null;
  let conf = []; try { conf = JSON.parse(p.confirmed_json || '[]'); } catch (e) { /* none */ }
  const q = one(scrub(question), 300), a = one(scrub(answer), 1200);
  if (conf.some((c) => c.q === q)) return null;
  conf.push({ q, a, via: one(via, 40), at: new Date().toISOString().slice(0, 10) });
  await run(`UPDATE expert_pages SET confirmed_json = ?, new_confirmed = new_confirmed + 1, updated_at = datetime('now') WHERE slug = ?`, [JSON.stringify(conf.slice(-12)), m.slug]);
  await logEv(m.slug, 'fileback', `${via}: ${q}`); bust();
  return m.slug;
}

// ── weekly health check ─────────────────────────────────────────────────
const LINT_SYS = `You check one internal knowledge page of Adit's T1 support team against its current sources. List only real problems: a statement the sources contradict, a step or menu path that changed, a rule or update the page ignores, sources that disagree with each other, or an important missing fact. Each item one short line saying what to fix and where. No em or en dashes. Return JSON {"issues": ["..."]} (empty when the page is fine).`;
async function lint(slug) {
  const p = await get(`SELECT * FROM expert_pages WHERE slug = ?`, [slug]); if (!p || !p.body) return null;
  const src = await sourcesFor(p);
  const ctx = src.map((c, i) => `[S${i + 1}] ${c.title}${c.section ? ' > ' + c.section : ''}\n${scrub(c.text).slice(0, 1800)}`).join('\n\n');
  const r = await D.ai.chatJSON({ feature: 'analyze', _feature: 'expert-library', messages: [{ role: 'system', content: LINT_SYS }, { role: 'user', content: `PAGE: ${p.title}\n${p.body}\n\nSOURCES:\n${ctx}` }], maxTokens: 900, temperature: 0, timeoutMs: 60000 }).catch(() => null)
    || await D.ai.bestJSON({ system: LINT_SYS, user: `PAGE: ${p.title}\n${p.body}\n\nSOURCES:\n${ctx}`, maxTokens: 900, feature: 'expert-library', timeoutMs: 60000, temperature: 0 }).catch(() => null);
  const issues = ((r && r.json && r.json.issues) || []).map((x) => one(x, 240)).filter(Boolean).slice(0, 6);
  await run(`UPDATE expert_pages SET lint_json = ?, linted_at = datetime('now') WHERE slug = ?`, [JSON.stringify(issues), slug]);
  await logEv(slug, 'lint', issues.length ? issues.join(' | ') : 'clean'); bust();
  return issues;
}

// ── the daily run ───────────────────────────────────────────────────────
let _running = false;
async function maintain({ discoverTopics = true, lintAll = false } = {}) {
  if (!enabled() || !_db || !D.ai || _running) return { skipped: true };
  _running = true; const out = { discovered: 0, built: 0, skipped: 0, linted: 0, errors: 0 };
  try {
    const last = await state('discovered_at');
    if (discoverTopics && (!last || Date.now() - Date.parse(last) > 6 * 864e5)) { out.discovered = (await discover().catch(() => [])).length; await state('discovered_at', new Date().toISOString()); }
    // new pages first, then pages with new confirmed answers, then the oldest
    const rows = await all(`SELECT slug FROM expert_pages WHERE status = 'active' ORDER BY (body IS NULL) DESC, new_confirmed DESC, coalesce(built_at, '') ASC LIMIT ?`, [MAX_BUILDS()]);
    for (const r of rows) { const b = await build(r.slug).catch((e) => ({ error: e.message })); if (b.built) out.built++; else if (b.error) out.errors++; else out.skipped++; }
    const lastLint = await state('linted_at');
    if (lintAll || !lastLint || Date.now() - Date.parse(lastLint) > 6.5 * 864e5) {
      for (const r of await all(`SELECT slug FROM expert_pages WHERE status = 'active' AND body IS NOT NULL ORDER BY coalesce(linted_at, '') ASC LIMIT 40`)) { if (await lint(r.slug).catch(() => null)) out.linted++; }
      await state('linted_at', new Date().toISOString());
    }
  } finally { _running = false; }
  return out;
}

async function overview() {
  const rows = await all(`SELECT slug, title, module, summary, version, hits, saved_calls, lint_json, confirmed_json, built_at, linted_at, updated_at, length(body) AS size FROM expert_pages WHERE status = 'active' ORDER BY hits DESC, title`).catch(() => []);
  const list = rows.map((r) => { let l = [], c = []; try { l = JSON.parse(r.lint_json || '[]'); } catch (e) { /* */ } try { c = JSON.parse(r.confirmed_json || '[]'); } catch (e) { /* */ } return { slug: r.slug, title: r.title, module: r.module, summary: r.summary, version: r.version, hits: r.hits, saved: r.saved_calls, issues: l, confirmed: c.length, built: r.built_at, linted: r.linted_at, ready: !!r.size }; });
  const log = await all(`SELECT at, slug, kind, detail FROM expert_page_log ORDER BY id DESC LIMIT 40`).catch(() => []);
  return { enabled: enabled(), pages: list, totals: { pages: list.length, ready: list.filter((x) => x.ready).length, hits: list.reduce((s, x) => s + (x.hits || 0), 0), saved: list.reduce((s, x) => s + (x.saved || 0), 0), issues: list.reduce((s, x) => s + x.issues.length, 0), confirmed: list.reduce((s, x) => s + x.confirmed, 0) }, log };
}
async function page(slug) { const p = await get(`SELECT * FROM expert_pages WHERE slug = ?`, [slug]); if (!p) return null; let s = [], c = [], l = []; try { s = JSON.parse(p.sources_json || '[]'); c = JSON.parse(p.confirmed_json || '[]'); l = JSON.parse(p.lint_json || '[]'); } catch (e) { /* */ } return Object.assign({}, p, { sources: s, confirmed: c, issues: l }); }

module.exports = { setDB, setDeps, initSchema, chunks, match, noteUse, discover, build, fileBack, lint, maintain, overview, page, bust, enabled, _slug: slugOf };
