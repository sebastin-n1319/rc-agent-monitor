'use strict';
/**
 * Batch 181: keeping the Question bank healthy, and the AI tools around it.
 *
 *   lint            rule-based item-writing checks (the classic multiple-choice flaws: giveaway longest answer,
 *                   "all of the above", absolute words only in wrong options, unflagged negatives, broken keys...)
 *   aiCheck         an AI reviewer that scores questions 1 to 5, names the problems and proposes a fix
 *   health / queue  "Needs attention" buckets for the bank: drafts, quality, stats warnings, near-duplicates,
 *                   reported by agents, never used
 *   reports         agents report a question (wrong key, unclear, two right answers, out of date) from the exam
 *                   or from their result; reviewers fix or dismiss, and the reporter is told
 *   bulkSet         change difficulty, module, tags or set for many questions at once
 *   optionAnalysis  how often each option is picked (which wrong answer people fall for)
 *   weakTopics      modules and topics the team scores lowest on, with the most-missed questions
 *   weakBuild       a Build that writes new questions for those topics, grounded in the uploaded documents
 *   variants        rewordings of one question that test the same point; a random pool draws one per family
 */
const MODS = require('./assess-modules');
let _db = null, A = null, B = null, S = null;
function setDB(db, assessments, builder, studio) { _db = db; A = assessments; B = builder; S = studio; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const j = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (_) { return d; } };
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
const lc = (s) => String(s || '').trim().toLowerCase();
const nowIso = () => new Date().toISOString();
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const ids = (list, max = 500) => Array.from(new Set((Array.isArray(list) ? list : []).map(Number).filter(Boolean))).slice(0, max);
const qm = (n) => Array(n).fill('?').join(',');
const STOP = new Set('the and for are but not you your with that this from have has was were will what when which who how why into about than then them they their there these those does did can could should would may might must been being also only just very more most such each other some any all our out use used using via per its it'.split(' '));
const tok = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
const sim = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };
const askOf = (p) => String(p || '').replace(/^Case:[\s\S]*?\n\n/, '');

const REASONS = {
  wrong: 'The marked answer is wrong',
  two: 'More than one answer is right',
  unclear: 'The question is unclear',
  outdated: 'It is out of date',
  typo: 'Typo or wording',
  other: 'Something else',
};

async function addColumn(table, def) { try { await run(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
async function initSchema() {
  await addColumn('assess_questions', 'quality_json TEXT');
  await addColumn('assess_questions', 'variant_of INTEGER');
  await run(`CREATE TABLE IF NOT EXISTS assess_question_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL, attempt_id INTEGER, idx INTEGER, test_id INTEGER,
    email TEXT NOT NULL, reason TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'open',
    outcome TEXT, reply TEXT, resolved_by TEXT, resolved_at TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_qreports_q ON assess_question_reports (question_id, status)`);
}

// ── 1. Rule-based checks ────────────────────────────────────────────────
const ABS = /\b(always|never|only|all|none|every|must|guaranteed|completely|impossible)\b/i;
/** q: { type, prompt, options: [text], correct: [index], explanation } -> [{ code, sev, msg }] */
function lint(q) {
  const out = [], add = (code, sev, msg) => out.push({ code, sev, msg });
  const opts = (q.options || []).map(o => String(typeof o === 'string' ? o : (o && o.text) || '').trim());
  const key = (q.correct || []).map(Number);
  const stem = askOf(q.prompt);
  const choice = q.type === 'single' || q.type === 'multi' || q.type === 'truefalse';
  if (choice) {
    if (!key.length || key.some(k => k < 0 || k >= opts.length)) add('key', 'high', 'No valid correct answer is marked.');
    else if (q.type !== 'multi' && key.length !== 1) add('key', 'high', 'One-answer question with more than one answer marked.');
    else if (q.type === 'multi' && key.length < 2) add('key', 'med', 'Select-all question with only one right answer. Make it a one-answer question.');
    const seen = new Set(); if (opts.some(o => { const k = lc(o); if (seen.has(k)) return true; seen.add(k); return false; })) add('dupopt', 'high', 'Two options are the same.');
    if (opts.some(o => !o)) add('emptyopt', 'high', 'An option is empty.');
  }
  if ((q.type === 'single' || q.type === 'multi') && opts.length >= 3 && key.length) {
    if (opts.some(o => /\b(all|none|both) of the above\b/i.test(o))) add('aota', 'med', '"All / None of the above" lets people guess without knowing the answer.');
    const right = key.map(k => opts[k] || ''), wrong = opts.filter((_, i) => !key.includes(i));
    const avgW = wrong.reduce((s, o) => s + o.length, 0) / Math.max(1, wrong.length), avgR = right.reduce((s, o) => s + o.length, 0) / Math.max(1, right.length);
    if (q.type === 'single' && avgR >= avgW * 1.6 && avgR - avgW >= 18) add('longest', 'med', 'The right answer is much longer than the others, which gives it away.');
    if (wrong.filter(o => ABS.test(o)).length >= 2 && !right.some(o => ABS.test(o))) add('absolute', 'low', 'Words like "always" or "never" appear only in wrong options, a known giveaway.');
    const st = tok(stem), cue = [...tok(right.join(' '))].filter(w => w.length >= 5 && st.has(w) && !wrong.some(o => tok(o).has(w)));
    if (q.type === 'single' && cue.length >= 2) add('clang', 'low', `The right answer repeats words from the question (${cue.slice(0, 3).join(', ')}) and the others do not.`);
    if (opts.length < 3) add('few', 'low', 'Only two options. Add plausible wrong answers or make it True/False.');
  }
  if (q.type === 'multi' && !/select all|all that apply|choose (two|three|all)|pick (two|three|all)/i.test(stem)) add('multicue', 'low', 'Say "Select all that apply" so people know more than one is right.');
  if (/\b(not|except)\b/.test(stem) && !/\b(NOT|EXCEPT)\b/.test(stem)) add('negative', 'low', 'Negative question. Write NOT or EXCEPT in capitals, or ask it the positive way.');
  if (q.type === 'truefalse' && ABS.test(stem)) add('tfabs', 'low', 'True/False with "always/never/only" is usually guessable as False.');
  if (stem.split(/\s+/).length > 60) add('long', 'low', 'The question is long. Trim it to what the agent needs to decide.');
  if (!String(q.explanation || '').trim()) add('expl', 'low', 'No explanation, so people do not learn why from their result.');
  if (/[\u2013\u2014]/.test(q.prompt + opts.join(' ') + (q.explanation || ''))) add('dash', 'low', 'Uses a long dash. House style is commas or full stops.');
  return out;
}
const SEV = { high: 3, med: 2, low: 1 };
const worst = (iss) => iss.reduce((m, x) => Math.max(m, SEV[x.sev] || 0), 0);

function rowQ(r) { return { id: r.id, type: r.type, prompt: r.prompt, options: j(r.options_json, []).map(o => o.text), matches: r.type === 'matching' ? j(r.options_json, []).map(o => o.match || '') : null, correct: j(r.answer_json, []), explanation: r.explanation || '', tags: r.tags ? r.tags.split(',').filter(Boolean) : [], difficulty: r.difficulty, module: r.module, subModule: r.sub_module, source: r.source, status: r.status }; }

// ── 2. AI reviewer ──────────────────────────────────────────────────────
async function aiCheck(list, ai) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const want = ids(list, 120);
  if (!want.length) throw httpError(400, 'Pick some questions to check');
  const rows = await all(`SELECT * FROM assess_questions WHERE id IN (${qm(want.length)}) AND status != 'retired'`, want);
  const batches = []; for (let i = 0; i < rows.length; i += 8) batches.push(rows.slice(i, i + 8));
  let done = 0, flagged = 0;
  const system = [
    'You review multiple-choice questions for Adit\'s T1 customer support team (practice software for dental, optometry and other offices).',
    'Judge each question like an experienced item writer. Check: is the marked answer right and the only defensible one; is the question clear and focused on one point;',
    'are the wrong options plausible mistakes of similar length and style; any giveaways (longest answer, word repeats, absolute words, grammar cues, "all/none of the above");',
    'is it worth knowing for a support agent; is the explanation helpful. You cannot check facts against the KB, so only flag a wrong key when the question itself shows it.',
    'Score 5 = ready, 4 = minor polish, 3 = needs a fix, 2 = weak, 1 = broken. For a score of 4 or less give a fixed version that keeps the same point and type.',
    'Plain, clear English. No em dashes or en dashes.',
    'Return JSON {"reviews":[{"id":number,"score":1-5,"issues":["short phrase", ...],"fix":null | {"prompt":"...","options":["..."],"correct":[index,...],"explanation":"..."}}]}. For ordering and matching questions keep fix null.',
  ].join('\n');
  await pool(batches, 3, async (bt) => {
    const user = 'Questions:\n' + JSON.stringify(bt.map(r => { const q = rowQ(r); return { id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation }; }));
    let r; try { r = await ai.bestJSON({ system, user, maxTokens: 6000, timeoutMs: 120000 }); } catch (e) { console.warn('aiCheck', e.message); return; }
    const reviews = (r.json && Array.isArray(r.json.reviews)) ? r.json.reviews : [];
    for (const rv of reviews) {
      const row = bt.find(x => x.id === Number(rv.id)); if (!row) continue;
      const q = rowQ(row);
      let fix = rv.fix && typeof rv.fix === 'object' && q.type !== 'ordering' && q.type !== 'matching' ? rv.fix : null;
      if (fix) {
        const opts = q.type === 'truefalse' ? ['True', 'False'] : (Array.isArray(fix.options) ? fix.options.map(o => clean(o, 400).trim()).filter(Boolean) : []);
        const corr = (Array.isArray(fix.correct) ? fix.correct : []).map(Number).filter(k => k >= 0 && k < opts.length);
        fix = opts.length >= 2 && corr.length && clean(fix.prompt, 1500).trim().length >= 8 && (q.type === 'multi' || corr.length === 1)
          ? { prompt: clean(fix.prompt, 1500).trim(), options: opts, correct: corr, explanation: clean(fix.explanation, 1500).trim() || q.explanation } : null;
      }
      const score = Math.max(1, Math.min(5, Math.round(Number(rv.score) || 3)));
      const qual = { score, issues: (Array.isArray(rv.issues) ? rv.issues : []).map(x => clean(x, 160)).filter(Boolean).slice(0, 5), fix, at: nowIso() };
      await run(`UPDATE assess_questions SET quality_json = ? WHERE id = ?`, [JSON.stringify(qual), row.id]);
      done++; if (score <= 3) flagged++;
    }
  });
  bust();
  return { checked: done, flagged, asked: rows.length };
}
async function applyFix(id, by) {
  const r = await get(`SELECT * FROM assess_questions WHERE id = ?`, [Number(id)]); if (!r) throw httpError(404, 'Question not found');
  const qual = j(r.quality_json, null); if (!qual || !qual.fix) throw httpError(400, 'There is no suggested fix for this question');
  const q = rowQ(r);
  await A.saveQuestion(r.id, { type: q.type, prompt: qual.fix.prompt, options: qual.fix.options, correct: qual.fix.correct, explanation: qual.fix.explanation, tags: q.tags, difficulty: q.difficulty, status: 'draft', module: q.module, subModule: q.subModule }, by);
  await run(`UPDATE assess_questions SET quality_json = ? WHERE id = ?`, [JSON.stringify({ score: null, issues: [], fixed: true, prev: { prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation }, at: nowIso() }), r.id]);
  bust();
  return r.id;
}
async function undoFix(id, by) {
  const r = await get(`SELECT * FROM assess_questions WHERE id = ?`, [Number(id)]); if (!r) throw httpError(404, 'Question not found');
  const qual = j(r.quality_json, null); if (!qual || !qual.prev) throw httpError(400, 'Nothing to undo');
  const q = rowQ(r);
  await A.saveQuestion(r.id, { type: q.type, ...qual.prev, tags: q.tags, difficulty: q.difficulty, status: q.status, module: q.module, subModule: q.subModule }, by);
  await run(`UPDATE assess_questions SET quality_json = NULL WHERE id = ?`, [r.id]);
  bust();
  return r.id;
}
async function dismissQuality(list) { const want = ids(list); if (want.length) await run(`UPDATE assess_questions SET quality_json = ? WHERE id IN (${qm(want.length)})`, [JSON.stringify({ score: 5, issues: [], dismissed: 1, at: nowIso() }), ...want]); bust(); return want.length; }

// ── 3. Needs attention ──────────────────────────────────────────────────
let cache = null;
function bust() { cache = null; }
async function health(statsFn) {
  if (cache && Date.now() - cache.at < 45000) return cache;
  const rows = await all(`SELECT id, type, prompt, options_json, answer_json, explanation, status, quality_json, variant_of FROM assess_questions WHERE status != 'retired' ORDER BY id DESC LIMIT 3000`);
  const tests = await all(`SELECT question_ids_json FROM assess_tests WHERE status != 'archived'`);
  const inTest = new Set(); tests.forEach(t => j(t.question_ids_json, []).forEach(x => inTest.add(Number(x))));
  const stats = statsFn ? await statsFn(rows.map(r => r.id)) : new Map();
  const rep = await all(`SELECT question_id, COUNT(*) AS n FROM assess_question_reports WHERE status = 'open' GROUP BY question_id`);
  const repMap = new Map(rep.map(r => [r.question_id, r.n]));
  const b = { drafts: new Set(), quality: new Set(), stats: new Set(), dupes: new Set(), reported: new Set(), unused: new Set() };
  const lintMap = new Map(), dupOf = new Map();
  for (const r of rows) {
    const q = rowQ(r), iss = lint(q); lintMap.set(r.id, iss);
    const qual = j(r.quality_json, null);
    if (r.status === 'draft') b.drafts.add(r.id);
    if ((!qual || !qual.dismissed) && (worst(iss) >= 2 || (qual && qual.score != null && qual.score <= 3))) b.quality.add(r.id);
    const st = stats.get(r.id); if (st && st.flag) b.stats.add(r.id);
    if (repMap.has(r.id)) b.reported.add(r.id);
    if (!inTest.has(r.id) && !(st && st.shown)) b.unused.add(r.id);
  }
  // near-duplicates (variants of the same question are expected to be close, so they are skipped)
  const toks = rows.map(r => ({ id: r.id, fam: r.variant_of || r.id, t: tok(askOf(r.prompt)) })).filter(x => x.t.size >= 3);
  for (let i = 0; i < toks.length; i++) for (let k = i + 1; k < toks.length; k++) {
    const x = toks[i], y = toks[k]; if (x.fam === y.fam || x.fam === y.id || y.fam === x.id) continue;
    const sc = sim(x.t, y.t);
    if (sc >= 0.72) { b.dupes.add(x.id); b.dupes.add(y.id); if (!dupOf.has(x.id) || dupOf.get(x.id).score < sc) dupOf.set(x.id, { id: y.id, score: Math.round(sc * 100) / 100 }); if (!dupOf.has(y.id) || dupOf.get(y.id).score < sc) dupOf.set(y.id, { id: x.id, score: Math.round(sc * 100) / 100 }); }
  }
  const fam = {}; rows.forEach(r => { const f = r.variant_of || r.id; fam[f] = (fam[f] || 0) + 1; });
  cache = { at: Date.now(), buckets: b, lintMap, dupOf, repMap, fam, famOf: new Map(rows.map(r => [r.id, r.variant_of || r.id])) };
  return cache;
}
async function counts(statsFn) { const h = await health(statsFn); const out = {}; for (const k of Object.keys(h.buckets)) out[k] = h.buckets[k].size; return out; }
async function queueIds(queue, statsFn) { const h = await health(statsFn); return h.buckets[queue] ? [...h.buckets[queue]] : null; }
/** Extra fields for bank rows: lint issues, AI review, reports, near-duplicate, variant family. */
async function annotate(list, statsFn) {
  const h = await health(statsFn);
  const qrows = list.length ? await all(`SELECT id, quality_json, variant_of FROM assess_questions WHERE id IN (${qm(list.length)})`, list.map(q => q.id)) : [];
  const qmap = new Map(qrows.map(r => [r.id, r]));
  const reps = list.length ? await all(`SELECT question_id, reason, note, email, created_at FROM assess_question_reports WHERE status = 'open' AND question_id IN (${qm(list.length)}) ORDER BY id DESC`, list.map(q => q.id)) : [];
  return list.map(q => {
    const r = qmap.get(q.id) || {}; const qual = j(r.quality_json, null);
    const f = r.variant_of || q.id;
    return { ...q, lint: h.lintMap.get(q.id) || lint(q), quality: qual && !qual.dismissed ? { score: qual.score, issues: qual.issues || [], hasFix: !!qual.fix, fix: qual.fix || null, fixed: !!qual.fixed, at: qual.at } : null,
      reports: reps.filter(x => x.question_id === q.id).map(x => ({ reason: REASONS[x.reason] || x.reason, note: x.note, email: x.email, at: x.created_at })),
      dupOf: h.dupOf.get(q.id) || null, family: f, familySize: h.fam[f] || 1, variantOf: r.variant_of || null };
  });
}
const SORTS = {
  newest: (a, b) => b.id - a.id,
  oldest: (a, b) => a.id - b.id,
  hardest: (a, b) => (a.stats ? a.stats.pctCorrect : 999) - (b.stats ? b.stats.pctCorrect : 999),
  easiest: (a, b) => (b.stats ? b.stats.pctCorrect : -1) - (a.stats ? a.stats.pctCorrect : -1),
  used: (a, b) => (b.stats ? b.stats.shown : 0) - (a.stats ? a.stats.shown : 0),
  weakest: (a, b) => (a.stats && a.stats.disc != null ? a.stats.disc : 9) - (b.stats && b.stats.disc != null ? b.stats.disc : 9),
  quality: (a, b) => ((b.reports.length * 10 + worst(b.lint) * 2 + (b.quality && b.quality.score ? 6 - b.quality.score : 0)) - (a.reports.length * 10 + worst(a.lint) * 2 + (a.quality && a.quality.score ? 6 - a.quality.score : 0))) || (b.id - a.id),
  updated: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
};
function sortList(list, key) { return SORTS[key] ? list.slice().sort(SORTS[key]) : list; }

// ── 4. Agent reports ────────────────────────────────────────────────────
async function report({ attemptId, idx, email, reason, note }) {
  const a = await get(`SELECT id, test_id, email FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a || lc(a.email) !== lc(email)) throw httpError(404, 'Attempt not found');
  const ans = await get(`SELECT question_id FROM assess_answers WHERE attempt_id = ? AND idx = ? AND kind = 'q'`, [a.id, Number(idx)]);
  if (!ans || !ans.question_id) throw httpError(400, 'That question cannot be reported');
  const n = await get(`SELECT COUNT(*) AS n FROM assess_question_reports WHERE attempt_id = ?`, [a.id]);
  if (n && n.n >= 30) throw httpError(429, 'You have reported a lot of questions in this attempt. Your reviewer will look at them.');
  const dupe = await get(`SELECT id FROM assess_question_reports WHERE attempt_id = ? AND idx = ? AND status = 'open'`, [a.id, Number(idx)]);
  const rs = REASONS[reason] ? reason : 'other';
  if (dupe) await run(`UPDATE assess_question_reports SET reason = ?, note = ? WHERE id = ?`, [rs, clean(note, 600).trim() || null, dupe.id]);
  else await run(`INSERT INTO assess_question_reports (question_id, attempt_id, idx, test_id, email, reason, note) VALUES (?,?,?,?,?,?,?)`, [ans.question_id, a.id, Number(idx), a.test_id, lc(email), rs, clean(note, 600).trim() || null]);
  bust();
  return { ok: true };
}
async function resolveReports(qid, { outcome, reply }, by) {
  const open = await all(`SELECT r.id, r.email, t.title FROM assess_question_reports r LEFT JOIN assess_tests t ON t.id = r.test_id WHERE r.question_id = ? AND r.status = 'open'`, [Number(qid)]);
  if (!open.length) return 0;
  const oc = outcome === 'fixed' ? 'fixed' : 'dismissed';
  await run(`UPDATE assess_question_reports SET status = 'closed', outcome = ?, reply = ?, resolved_by = ?, resolved_at = ? WHERE question_id = ? AND status = 'open'`, [oc, clean(reply, 600).trim() || null, lc(by), nowIso(), Number(qid)]);
  const byMail = {}; open.forEach(r => { (byMail[r.email] = byMail[r.email] || r.title || 'an assessment'); });
  for (const [email, title] of Object.entries(byMail)) {
    try {
      await A.notify([email], { kind: 'update', title: oc === 'fixed' ? 'Thanks, we fixed a question you reported' : 'We checked a question you reported',
        body: (oc === 'fixed' ? `The question you reported in "${title}" has been corrected.` : `The question you reported in "${title}" is correct as written.`) + (reply ? ' ' + clean(reply, 300) : ''), link: '' });
    } catch (e) { /* best effort */ }
  }
  bust();
  return open.length;
}
async function reportSummary() {
  const rows = await all(`SELECT reason, COUNT(*) AS n FROM assess_question_reports WHERE status = 'open' GROUP BY reason`);
  return rows.map(r => ({ reason: r.reason, label: REASONS[r.reason] || r.reason, n: r.n }));
}

// ── 5. Bulk edit ────────────────────────────────────────────────────────
async function bulkSet(list, f) {
  const want = ids(list); if (!want.length) throw httpError(400, 'Pick some questions first');
  const rows = await all(`SELECT id, tags FROM assess_questions WHERE id IN (${qm(want.length)})`, want);
  const add = (Array.isArray(f.addTags) ? f.addTags : String(f.addTags || '').split(',')).map(lc).map(t => t.replace(/[^a-z0-9 &/+.-]/g, '').trim()).filter(Boolean).slice(0, 10);
  const del = new Set((Array.isArray(f.removeTags) ? f.removeTags : String(f.removeTags || '').split(',')).map(lc).filter(Boolean));
  const diff = ['easy', 'medium', 'hard'].includes(f.difficulty) ? f.difficulty : null;
  const mod = f.module === '__clear' ? '__clear' : (f.module ? MODS.moduleKey(f.module) : null);
  const setName = f.setName != null && String(f.setName).trim() ? clean(f.setName, 200).trim() : null;
  let n = 0;
  for (const r of rows) {
    const sets = [], vals = [];
    if (add.length || del.size) { const t = (r.tags ? r.tags.split(',') : []).filter(x => x && !del.has(lc(x))); add.forEach(x => { if (!t.map(lc).includes(x)) t.push(x); }); sets.push('tags = ?'); vals.push(t.join(',')); }
    if (diff) { sets.push('difficulty = ?'); vals.push(diff); }
    if (mod === '__clear') { sets.push('module = NULL, sub_module = NULL'); }
    else if (mod) { sets.push('module = ?', 'sub_module = ?'); vals.push(mod, f.subModule ? MODS.cleanSub(f.subModule) || null : null); }
    if (setName) { sets.push('source = ?'); vals.push(setName); }
    if (!sets.length) continue;
    await run(`UPDATE assess_questions SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...vals, r.id]); n++;
  }
  bust();
  return n;
}

// ── 6. Option analysis ──────────────────────────────────────────────────
async function optionAnalysis(qid) {
  const r = await get(`SELECT * FROM assess_questions WHERE id = ?`, [Number(qid)]); if (!r) throw httpError(404, 'Question not found');
  const q = rowQ(r);
  const rows = await all(`SELECT x.response_json, x.correct, a.score * 1.0 / NULLIF(a.max_score, 0) AS pct FROM assess_answers x JOIN assess_attempts a ON a.id = x.attempt_id
    WHERE x.question_id = ? AND x.kind = 'q' AND a.status NOT IN ('reset') AND COALESCE(a.preview, 0) = 0`, [r.id]);
  const n = rows.length; let blank = 0, right = 0;
  const pick = q.options.map(() => 0), pickStrong = q.options.map(() => 0);
  const pcts = rows.map(x => x.pct).filter(x => x != null).sort((a, b) => a - b); const strongCut = pcts.length >= 10 ? pcts[Math.floor(pcts.length * 0.73)] : null;
  rows.forEach(x => {
    if (x.correct === 1) right++;
    const resp = j(x.response_json, null);
    if (!resp || (!resp.chosen && !resp.pairs)) { blank++; return; }
    (resp.chosen || []).forEach(id => { if (pick[id] != null) { pick[id]++; if (strongCut != null && x.pct >= strongCut) pickStrong[id]++; } });
  });
  const strongN = strongCut != null ? rows.filter(x => x.pct != null && x.pct >= strongCut).length : 0;
  const choice = q.type === 'single' || q.type === 'multi' || q.type === 'truefalse';
  const options = choice ? q.options.map((t, i) => ({ text: t, correct: q.correct.includes(i), n: pick[i], pct: n ? Math.round(pick[i] / n * 100) : 0, strongPct: strongN ? Math.round(pickStrong[i] / strongN * 100) : null })) : [];
  const notes = [];
  options.forEach(o => {
    if (!o.correct && n >= 8 && o.pct === 0) notes.push(`Nobody picks "${o.text.slice(0, 60)}". Replace it with a more realistic mistake.`);
    if (!o.correct && n >= 8 && o.strongPct != null && o.strongPct >= 30) notes.push(`Strong agents often pick "${o.text.slice(0, 60)}". Check it is really wrong.`);
    if (!o.correct && n >= 8 && o.pct >= 40) notes.push(`"${o.text.slice(0, 60)}" is a common misunderstanding. Worth covering in coaching.`);
  });
  return { n, right, pctCorrect: n ? Math.round(right / n * 100) : null, blank, options, notes, choice };
}

// ── 7. Weak topics ──────────────────────────────────────────────────────
async function weakTopics(statsFn) {
  const rows = await all(`SELECT id, prompt, tags, module, answer_json, options_json, explanation FROM assess_questions WHERE status != 'retired'`);
  const stats = await statsFn(rows.map(r => r.id));
  const modName = new Map(MODS.MODULES.map(m => [m.key, m.name]));
  const acc = {};
  const bump = (kind, key, label, r, st) => {
    const k = kind + ':' + key; const a = acc[k] || (acc[k] = { kind, key, label, shown: 0, right: 0, questions: 0, missed: [] });
    a.shown += st.shown; a.right += st.right_n; a.questions++;
    if (st.shown >= 3) a.missed.push({ id: r.id, prompt: askOf(r.prompt).slice(0, 220), pct: Math.round(st.right_n / st.shown * 100), answer: j(r.answer_json, []).map(i => (j(r.options_json, [])[i] || {}).text).filter(Boolean).join('; ').slice(0, 200), explanation: clean(r.explanation, 300) });
  };
  for (const r of rows) {
    const st = stats.get(r.id); if (!st || !st.shown) continue;
    if (r.module) bump('module', r.module, modName.get(r.module) || r.module, r, st);
    (r.tags ? r.tags.split(',') : []).filter(Boolean).slice(0, 4).forEach(t => bump('tag', lc(t), t, r, st));
  }
  const list = Object.values(acc).filter(a => a.shown >= 8).map(a => ({ ...a, pct: Math.round(a.right / a.shown * 100), missed: a.missed.sort((x, y) => x.pct - y.pct).slice(0, 5) }));
  list.sort((a, b) => a.pct - b.pct || b.shown - a.shown);
  return { modules: list.filter(x => x.kind === 'module').slice(0, 15), tags: list.filter(x => x.kind === 'tag').slice(0, 25) };
}
/** Pull the passages from uploaded documents that best match the weak topics, then hand them to the Builder. */
async function weakBuild(b, by, ai, statsFn) {
  const want = (Array.isArray(b.topics) ? b.topics : []).slice(0, 8).map(t => ({ kind: t.kind === 'tag' ? 'tag' : 'module', key: String(t.key || ''), label: clean(t.label || t.key, 80) })).filter(t => t.key);
  if (!want.length) throw httpError(400, 'Pick at least one topic');
  const wt = await weakTopics(statsFn);
  const chosen = want.map(t => (t.kind === 'module' ? wt.modules : wt.tags).find(x => x.key === t.key) || { ...t, pct: null, missed: [] });
  const qTok = tok(chosen.map(c => [c.label, ...c.missed.map(m => m.prompt + ' ' + m.answer + ' ' + m.explanation)].join(' ')).join(' '));
  const label = chosen.map(c => c.label).join(', ');
  // candidate passages from every uploaded document (Builder and Studio)
  const docs = (await all(`SELECT id, source_name, text FROM assess_builds WHERE text IS NOT NULL AND LENGTH(text) >= 300 ORDER BY id DESC LIMIT 30`))
    .concat(S ? await all(`SELECT id, source_name, text FROM assess_studio WHERE text IS NOT NULL AND LENGTH(text) >= 300 ORDER BY id DESC LIMIT 30`).catch(() => []) : []);
  const split = S && S._splitSections ? S._splitSections : (t) => [{ id: 's1', title: 'Document', text: t, chars: t.length }];
  const seen = new Set(), cand = [];
  for (const d of docs) for (const sc of split(d.text)) {
    const key = sc.text.slice(0, 200); if (seen.has(key) || sc.text.length < 200) continue; seen.add(key);
    const t = tok(sc.title + ' ' + sc.text.slice(0, 6000)); let hit = 0; for (const w of qTok) if (t.has(w)) hit++;
    const labelHit = chosen.some(c => lc(sc.title + ' ' + sc.text.slice(0, 3000)).includes(lc(c.label)));
    if (hit >= 4 || labelHit) cand.push({ score: hit + (labelHit ? 15 : 0), title: sc.title, text: sc.text, src: d.source_name });
  }
  cand.sort((x, y) => y.score - x.score);
  let text = '', used = 0;
  for (const c of cand) { if (text.length > 60000) break; text += `\n\n# ${c.title}${c.src ? ' (' + c.src + ')' : ''}\n${c.text}`; used++; }
  // what the team already gets wrong, as known facts (always included so the builder has material)
  const facts = chosen.flatMap(c => c.missed.map(m => `- ${m.prompt} Answer: ${m.answer}.${m.explanation ? ' ' + m.explanation : ''}`));
  if (facts.length) text += `\n\n# What the team gets wrong (${label})\n` + facts.join('\n');
  if (text.trim().length < 300) throw httpError(400, 'There is not enough material on these topics yet. Upload the KB articles for them in Build from a document first.');
  const focus = `The team scores low on: ${chosen.map(c => c.label + (c.pct != null ? ` (${c.pct}% correct)` : '')).join(', ')}. Write questions that teach and test the points people get wrong, from new angles, without copying the existing questions.`;
  const title = clean(b.title, 140).trim() || `Weak topics: ${label}`.slice(0, 140);
  const id = await B.create({ ...b, text, sourceName: `Weak topics (${used} passage${used === 1 ? '' : 's'} from your documents)`, title, focus: [focus, clean(b.focus, 300)].filter(Boolean).join(' '), origin: 'weak' }, by, ai);
  return { id, passages: used, facts: facts.length };
}

// ── 8. Variants ─────────────────────────────────────────────────────────
async function variants(qid, count, ai, by) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const r = await get(`SELECT * FROM assess_questions WHERE id = ?`, [Number(qid)]); if (!r) throw httpError(404, 'Question not found');
  const q = rowQ(r); const k = Math.max(1, Math.min(4, Math.round(Number(count) || 2)));
  const root = r.variant_of || r.id;
  const fam = await all(`SELECT prompt FROM assess_questions WHERE (id = ? OR variant_of = ?) AND status != 'retired'`, [root, root]);
  const system = [
    'You write variants of one assessment question for Adit\'s T1 customer support team. A variant tests exactly the same point and has the same right answer in meaning,',
    'but uses different wording, a different realistic situation (office type, customer name, channel) and reordered, reworded options, so someone who memorised the original cannot spot it.',
    'Keep the type, difficulty and length. Wrong options stay plausible. Plain, clear English. No em dashes or en dashes. Do not invent facts beyond the original and its explanation.',
    'Return JSON {"questions":[{"prompt":"...","options":["..."],"correct":[index,...],"explanation":"..."}]}. For ordering keep the steps in the correct order with correct: []. For matching return "pairs": [["item","match"],...].',
  ].join('\n');
  const user = `Write ${k} variant${k === 1 ? '' : 's'} of this ${q.type} question.\n` + JSON.stringify({ prompt: q.prompt, options: q.type === 'matching' ? q.options.map((t, i) => [t, q.matches[i]]) : q.options, correct: q.correct, explanation: q.explanation })
    + '\nAlready in this family (do not repeat):\n' + fam.map(f => '- ' + askOf(f.prompt).slice(0, 200)).join('\n');
  const res = await ai.bestJSON({ system, user, maxTokens: 3000, timeoutMs: 90000 });
  const list = (res.json && Array.isArray(res.json.questions)) ? res.json.questions : [];
  const famTok = fam.map(f => tok(askOf(f.prompt)));
  const out = [];
  for (const v of list.slice(0, k)) {
    if (!v || !v.prompt) continue;
    if (famTok.some(t => sim(t, tok(askOf(v.prompt))) >= 0.85)) continue;
    const opts = q.type === 'matching' && Array.isArray(v.pairs) ? v.pairs.map(p => ({ text: p[0], match: p[1] })) : v.options;
    try {
      const nid = await A.saveQuestion(null, { type: q.type, prompt: v.prompt, options: opts, correct: v.correct || [], explanation: v.explanation || q.explanation, tags: q.tags, difficulty: q.difficulty, status: 'draft', source: q.source, module: q.module, subModule: q.subModule }, by);
      await run(`UPDATE assess_questions SET variant_of = ? WHERE id = ?`, [root, nid]); out.push(nid); famTok.push(tok(askOf(v.prompt)));
    } catch (e) { /* skip a malformed one */ }
  }
  bust();
  return { ids: out, root };
}
async function family(qid) {
  const r = await get(`SELECT id, variant_of FROM assess_questions WHERE id = ?`, [Number(qid)]); if (!r) return [];
  const root = r.variant_of || r.id;
  return (await all(`SELECT id, prompt, status FROM assess_questions WHERE (id = ? OR variant_of = ?) AND status != 'retired' ORDER BY id`, [root, root])).map(x => ({ id: x.id, prompt: askOf(x.prompt).slice(0, 200), status: x.status, root: x.id === root }));
}
/** One question per variant family, for random pools. */
async function onePerFamily(qids) {
  const list = ids(qids, 5000); if (!list.length) return [];
  const rows = await all(`SELECT id, variant_of FROM assess_questions WHERE id IN (${qm(list.length)})`, list);
  const fam = new Map(rows.map(r => [r.id, r.variant_of || r.id])); const seen = new Set();
  return list.filter(id => { const f = fam.get(id) || id; if (seen.has(f)) return false; seen.add(f); return true; });
}

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

module.exports = { setDB, initSchema, REASONS, lint, aiCheck, applyFix, undoFix, dismissQuality, health, counts, queueIds, annotate, sortList, bust,
  report, resolveReports, reportSummary, bulkSet, optionAnalysis, weakTopics, weakBuild, variants, family, onePerFamily };
