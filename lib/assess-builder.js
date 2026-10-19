'use strict';
/**
 * Batch 180: Assessment Builder. The simple way to turn a document into assessments.
 *
 *   1. Upload a document (or paste text) and say who it is for (new joinee, experienced agent, calls or chat wing,
 *      team lead, or your own words) and how many questions you want in total (up to 200).
 *   2. The builder writes the questions in the background, section by section, in small batches, so the count you ask
 *      for is the count you get (it tops up if a batch comes back short, and drops near-duplicates of each other and
 *      of the bank). You watch the progress.
 *   3. Questions land in their own Question set (a named group in the bank), as drafts, split into parts of the size
 *      you chose (for example 50 questions in 2 parts of 25).
 *   4. Review: approve, edit, rewrite with AI, replace or remove, per part.
 *   5. Create the assessments: one per part, released together, every N hours or days, or each part only after the
 *      previous one is finished (or passed). Parts carry a series tag, so agents see "Part 2 of 3" and why it is locked.
 */
const crypto = require('crypto');
let _db = null, A = null, splitSections = null;
function setDB(db, assessments, studio) { _db = db; A = assessments; splitSections = studio._splitSections; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const j = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (_) { return d; } };
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
const lc = (s) => String(s || '').trim().toLowerCase();
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const TYPES = ['single', 'multi', 'truefalse', 'ordering', 'matching'];
const MAX_TOTAL = 200;

const AUDIENCES = {
  newjoinee: { label: 'New joinee (first weeks)', level: 'foundation', guide: 'The reader joined T1 Customer Support in the last few weeks. Test the fundamentals they must know on day one: what each product and feature does, where to find things, the basic steps of common requests, the right team to transfer to, key terms, and what to tell the customer. Use plain words, one idea per question, mostly easy and medium. Avoid trick questions, rare edge cases and deep troubleshooting.' },
  agent: { label: 'Experienced T1 agent', level: 'intermediate', guide: 'The reader is an experienced T1 support agent. Test applied knowledge: real customer scenarios, troubleshooting steps in the right order, edge cases, escalation and transfer rules, time limits and ownership. Mostly medium with some hard.' },
  calls: { label: 'Calls wing agent', level: 'intermediate', guide: 'The reader handles phone support. Frame questions as live calls: what to ask the caller, what to check while they wait, how to explain it simply, when to transfer or create a ticket.' },
  chat: { label: 'Chat wing agent', level: 'intermediate', guide: 'The reader handles chat support. Frame questions as chat conversations: what to reply, which details to ask for, links or steps to share, when to move the chat to a ticket or another team.' },
  lead: { label: 'Team lead / SME', level: 'advanced', guide: 'The reader is a team lead or subject matter expert. Test deep process ownership, policy decisions, quality and escalation judgement, and how to coach an agent who got it wrong. Mostly hard.' },
  refresher: { label: 'Refresher for everyone', level: 'mixed', guide: 'A quick refresher for the whole team. Focus on the points people most often get wrong and on recent changes in the document. Balanced mix of difficulty.' },
};
const LEVELS = { foundation: 'Mostly easy (about 60%), some medium, no hard.', intermediate: 'Mostly medium (about 60%), some easy and some hard.', advanced: 'Mostly hard (about 60%), the rest medium.', mixed: 'About one third each of easy, medium and hard.' };

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS assess_builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, source_name TEXT, text TEXT, sections_json TEXT,
    options_json TEXT NOT NULL DEFAULT '{}', items_json TEXT NOT NULL DEFAULT '[]', test_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'queued', progress_json TEXT, error TEXT, created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  // A build that was writing when the server restarted can be continued from where it stopped.
  await run(`UPDATE assess_builds SET status = 'paused', error = 'The server restarted while writing. Press Continue to finish.' WHERE status IN ('queued','writing')`);
}
const setName = (id, title) => `Set #${id}: ${clean(title, 100)}`;

function normOptions(b) {
  const total = Math.max(5, Math.min(MAX_TOTAL, Math.round(Number(b.total) || 25)));
  const partSize = Math.max(5, Math.min(total, Math.round(Number(b.partSize) || total)));
  const audience = AUDIENCES[b.audience] ? b.audience : (b.audience === 'custom' ? 'custom' : 'newjoinee');
  const level = LEVELS[b.level] ? b.level : (AUDIENCES[audience] ? AUDIENCES[audience].level : 'mixed');
  const types = (Array.isArray(b.types) ? b.types : ['single', 'multi', 'truefalse']).filter(t => TYPES.includes(t));
  return { total, partSize, audience, audienceNote: clean(b.audienceNote, 600), level, types: types.length ? types : ['single', 'truefalse'],
    focus: clean(b.focus, 600), avoid: clean(b.avoid, 600), order: b.order === 'mixed' ? 'mixed' : 'document' };
}
function audienceText(o) {
  const base = o.audience === 'custom' ? '' : AUDIENCES[o.audience].guide;
  return [base, o.audienceNote ? 'More about the audience from the reviewer: ' + o.audienceNote : ''].filter(Boolean).join(' ');
}

async function create(b, by, ai) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const text = clean(b.text, 1500000).trim();
  if (text.length < 300) throw httpError(400, 'There is not enough text in this document to write questions from.');
  const o = normOptions(b);
  const title = clean(b.title, 140).trim() || (o.audience === 'newjoinee' ? 'New joinee starter' : 'Assessment') + (b.sourceName ? ': ' + clean(b.sourceName, 80).replace(/\.[a-z0-9]{2,5}$/i, '') : '');
  const secs = splitSections(text).map(s => ({ id: s.id, title: s.title, chars: s.chars, text: s.text, include: s.chars >= 200 && !/^(table of contents|contents|revision history|change log|index)\b/i.test(s.title) }));
  if (!secs.some(s => s.include)) secs.forEach(s => { s.include = true; });
  const r = await run(`INSERT INTO assess_builds (title, source_name, text, sections_json, options_json, status, progress_json, created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [title, clean(b.sourceName, 160), text, JSON.stringify(secs.map(s => ({ id: s.id, title: s.title, chars: s.chars, include: s.include }))), JSON.stringify({ ...o, schedule: b.schedule || null }),
      'queued', JSON.stringify({ done: 0, total: o.total, msg: 'Reading the document' }), lc(by)]);
  start(r.lastID, ai);
  return r.lastID;
}
const RUNNING = new Set();
function start(id, ai) { if (RUNNING.has(id)) return; RUNNING.add(id); writeAll(id, ai).catch(async (e) => { console.warn('assess builder', id, e.message); await run(`UPDATE assess_builds SET status = 'paused', error = ?, updated_at = datetime('now') WHERE id = ?`, [clean(e.message, 400), id]).catch(() => {}); }).finally(() => RUNNING.delete(id)); }
async function setProgress(id, p, status) { await run(`UPDATE assess_builds SET progress_json = ?, status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(p), status || null, id]); }

/** How many questions each section gets: by size (square root, so one huge section does not take everything). */
function allocate(secs, n) {
  const inc = secs.filter(s => s.include);
  const w = inc.map(s => Math.sqrt(Math.max(200, s.chars)));
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  const out = inc.map((s, i) => ({ id: s.id, n: Math.floor(n * w[i] / tot) }));
  let left = n - out.reduce((a, b) => a + b.n, 0);
  const order = inc.map((s, i) => i).sort((a, b) => (n * w[b] / tot % 1) - (n * w[a] / tot % 1));
  for (let k = 0; left > 0; k = (k + 1) % order.length) { out[order[k]].n++; left--; }
  return out.filter(x => x.n > 0);
}
const STOP = new Set('the a an and or of to in on for with is are was were be by at as it this that from your you we our can will what which when how does do not no any all if then than into about after before should must may customer agent'.split(' '));
const tok = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
function sim(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); }

async function writeBatch(ai, { secTitle, secText, n, o, avoid, sourceName }) {
  const system = [
    'You write assessment questions for Adit\'s T1 customer support team (practice software for dental, optometry and other offices: Engage, Voice, Pay, AI front desk, forms, scheduling, integrations).',
    'Audience: ' + audienceText(o),
    'Difficulty mix: ' + LEVELS[o.level],
    'Use ONLY facts stated in the source text. Never invent policies, numbers, team names, menu paths or timelines.',
    'Every question must be answerable from the source text alone and must test something useful for the audience. Skip boilerplate, headers and contact details.',
    'Wrong options are plausible mistakes this audience could make, of similar length to the right one. No "All of the above" or "None of the above". No giveaways.',
    'Each question under 45 words, each option under 20 words. Plain, clear English. No em dashes or en dashes.',
    'Return JSON: {"questions":[{"type":"single|multi|truefalse|ordering|matching","prompt":"...","options":["..."],"correct":[index,...],"explanation":"one or two sentences that teach the point, citing the source","tags":["short topic"],"difficulty":"easy|medium|hard"}]}.',
    'single: 4 options, exactly one correct. multi: 4 or 5 options, two or more correct, say "Select all that apply". truefalse: options ["True","False"].',
    'ordering: options are 3 to 6 steps in the CORRECT order, correct: []. Only for real sequences. matching: "pairs": [["item","match"], ...] 3 to 5 pairs, correct: [].',
  ].join('\n');
  const user = [
    `Write exactly ${n} questions from the section "${secTitle}"${sourceName ? ` of "${sourceName}"` : ''}. Allowed types: ${o.types.join(', ')} (mostly the first ones listed).`,
    o.focus ? 'Focus on: ' + o.focus : '', o.avoid ? 'Do not ask about: ' + o.avoid : '',
    avoid.length ? 'Already written (do not repeat or rephrase these):\n' + avoid.slice(-40).map(x => '- ' + clean(x, 160)).join('\n') : '',
    'Source text:\n"""\n' + secText.slice(0, 24000) + '\n"""',
  ].filter(Boolean).join('\n\n');
  const r = await ai.bestJSON({ system, user, maxTokens: Math.min(8000, 700 + n * 450), timeoutMs: 150000 });
  const list = (r.json && Array.isArray(r.json.questions)) ? r.json.questions : [];
  return list.map(q => { if (!o.types.includes(q.type)) q.type = o.types[0]; if (q.type === 'matching' && Array.isArray(q.pairs)) q.options = q.pairs.map(p => ({ text: p[0], match: p[1] })); return q; });
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

async function writeAll(id, ai, extra) {
  const b = await get(`SELECT * FROM assess_builds WHERE id = ?`, [id]); if (!b) return;
  const o = j(b.options_json, {}); const secsMeta = j(b.sections_json, []);
  const full = splitSections(b.text || ''); const textById = new Map(full.map(s => [s.id, s.text]));
  const secs = secsMeta.map(s => ({ ...s, text: textById.get(s.id) || '' }));
  let items = j(b.items_json, []);
  const target = extra ? items.length + extra : o.total;
  const have = () => items.length;
  // existing prompts in this build and in the bank, to drop near-duplicates
  const buildToks = []; 
  if (items.length) { const rows = await all(`SELECT id, prompt FROM assess_questions WHERE id IN (${items.map(() => '?').join(',')})`, items.map(x => x.qid)); rows.forEach(r => buildToks.push(tok(r.prompt))); }
  const bank = (await all(`SELECT prompt FROM assess_questions WHERE status != 'retired' AND (source IS NULL OR source NOT LIKE ?) ORDER BY id DESC LIMIT 4000`, [`Set #${id}:%`])).map(r => tok(r.prompt));
  const avoidBySec = {};
  let round = 0, dropped = 0;
  await setProgress(id, { done: have(), total: target, msg: 'Writing questions' }, 'writing');
  while (have() < target && round < 4) {
    const need = target - have();
    // first round by size; top-up rounds favour the sections with the most text per question so far
    let plan = allocate(secs, need);
    if (round > 0) {
      const counts = {}; items.forEach(x => { counts[x.sec] = (counts[x.sec] || 0) + 1; });
      const ranked = secs.filter(s => s.include).sort((a, b) => (b.chars / ((counts[b.id] || 0) + 1)) - (a.chars / ((counts[a.id] || 0) + 1)));
      plan = []; let left = need + Math.ceil(need * 0.2);
      for (let k = 0; left > 0 && ranked.length; k = (k + 1) % ranked.length) { const p = plan.find(x => x.id === ranked[k].id); if (p) p.n++; else plan.push({ id: ranked[k].id, n: 1 }); left--; }
    }
    const jobs = [];
    plan.forEach(p => { for (let left = p.n; left > 0; left -= 8) jobs.push({ sec: p.id, n: Math.min(8, left) }); });
    await pool(jobs, 3, async (jb) => {
      if (have() >= target) return;
      const sc = secs.find(s => s.id === jb.sec); if (!sc || !sc.text) return;
      let qs = [];
      try { qs = await writeBatch(ai, { secTitle: sc.title, secText: sc.text, n: jb.n, o, avoid: avoidBySec[sc.id] || [], sourceName: b.source_name }); }
      catch (e) { console.warn('builder batch', id, e.message); return; }
      for (const q of qs) {
        if (have() >= target) break;
        const t = tok(q.prompt);
        if (buildToks.some(x => sim(x, t) >= 0.62) || bank.some(x => sim(x, t) >= 0.8)) { dropped++; continue; }
        try {
          const qid = await A.saveQuestion(null, { ...q, status: 'draft', source: setName(id, b.title), tags: (q.tags || []).concat([sc.title.slice(0, 40)]) }, b.created_by);
          items.push({ qid, sec: sc.id }); buildToks.push(t); (avoidBySec[sc.id] = avoidBySec[sc.id] || []).push(q.prompt);
        } catch (e) { dropped++; }
      }
      await run(`UPDATE assess_builds SET items_json = ? WHERE id = ?`, [JSON.stringify(items), id]);
      await setProgress(id, { done: Math.min(have(), target), total: target, msg: `Writing questions (${sc.title.slice(0, 60)})`, dropped });
    });
    round++;
  }
  await run(`UPDATE assess_builds SET items_json = ?, status = 'review', error = ?, progress_json = ?, updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify(items), have() < target ? `Wrote ${have()} of ${target}. The document may not have enough distinct material; press Add more to try again.` : null,
      JSON.stringify({ done: have(), total: target, msg: 'Ready to review', dropped }), id]);
  // modules for the bank, best effort and after the fact
  try { const ids = items.map(x => x.qid); for (let i = 0; i < ids.length; i += 30) await A.classifyQuestions(ids.slice(i, i + 30), ai); } catch (e) { /* optional */ }
}

function partsOf(items, o, secOrder) {
  const ordered = items.slice();
  if (o.order === 'mixed') {
    // spread each section across the parts: deal round-robin by section
    const by = {}; ordered.forEach(x => { (by[x.sec] = by[x.sec] || []).push(x); });
    const lists = secOrder.map(s => by[s] || []).filter(l => l.length); const out = [];
    while (lists.some(l => l.length)) lists.forEach(l => { if (l.length) out.push(l.shift()); });
    return chunk(out, o.partSize);
  }
  ordered.sort((a, b) => secOrder.indexOf(a.sec) - secOrder.indexOf(b.sec));
  return chunk(ordered, o.partSize);
}
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); if (out.length > 1 && out[out.length - 1].length < Math.ceil(n / 3)) { const last = out.pop(); out[out.length - 1] = out[out.length - 1].concat(last); } return out; }

async function view(id) {
  const b = await get(`SELECT * FROM assess_builds WHERE id = ?`, [Number(id)]); if (!b) throw httpError(404, 'Build not found');
  const o = j(b.options_json, {}); const secs = j(b.sections_json, []);
  let items = j(b.items_json, []);
  const qids = items.map(x => x.qid);
  const rows = qids.length ? await all(`SELECT id, type, prompt, options_json, answer_json, explanation, tags, difficulty, status FROM assess_questions WHERE id IN (${qids.map(() => '?').join(',')})`, qids) : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  items = items.filter(x => byId.has(x.qid) && byId.get(x.qid).status !== 'retired');
  const secTitle = new Map(secs.map(s => [s.id, s.title]));
  const q = (x) => { const r = byId.get(x.qid); return { id: r.id, sec: x.sec, section: secTitle.get(x.sec) || '', type: r.type, prompt: r.prompt, options: j(r.options_json, []).map(op => op.text), matches: r.type === 'matching' ? j(r.options_json, []).map(op => op.match || '') : null, correct: j(r.answer_json, []), explanation: r.explanation, tags: r.tags ? r.tags.split(',').filter(Boolean) : [], difficulty: r.difficulty, status: r.status }; };
  const parts = partsOf(items, o, secs.map(s => s.id)).map((p, i) => ({ n: i + 1, questions: p.map(q) }));
  const tests = j(b.test_ids_json, []);
  const testRows = tests.length ? await all(`SELECT id, title, status, settings_json FROM assess_tests WHERE id IN (${tests.map(() => '?').join(',')})`, tests) : [];
  return {
    id: b.id, title: b.title, sourceName: b.source_name, status: RUNNING.has(b.id) ? 'writing' : b.status, error: b.error, progress: j(b.progress_json, {}),
    options: o, audienceLabel: o.audience === 'custom' ? 'Custom audience' : (AUDIENCES[o.audience] || {}).label, setName: setName(b.id, b.title),
    sections: secs.map(s => ({ id: s.id, title: s.title, chars: s.chars, include: s.include, questions: items.filter(x => x.sec === s.id).length })),
    parts, counts: { total: items.length, approved: items.filter(x => byId.get(x.qid).status === 'approved').length },
    tests: testRows.map(t => { const s = j(t.settings_json, {}); return { id: t.id, title: t.title, status: t.status, opensAt: s.opensAt || null, series: s.series || null }; }),
    createdAt: b.created_at, createdBy: b.created_by,
  };
}
async function list() {
  const rows = await all(`SELECT id, title, source_name, status, options_json, items_json, test_ids_json, progress_json, created_at, created_by FROM assess_builds ORDER BY id DESC LIMIT 100`);
  const out = [];
  for (const r of rows) {
    const items = j(r.items_json, []), o = j(r.options_json, {});
    const st = items.length ? await get(`SELECT SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS a, SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS d FROM assess_questions WHERE id IN (${items.map(() => '?').join(',')})`, items.map(x => x.qid)) : { a: 0, d: 0 };
    out.push({ id: r.id, title: r.title, sourceName: r.source_name, status: RUNNING.has(r.id) ? 'writing' : r.status, audienceLabel: o.audience === 'custom' ? 'Custom audience' : (AUDIENCES[o.audience] || {}).label,
      total: o.total, partSize: o.partSize, questions: items.length, approved: st.a || 0, drafts: st.d || 0, tests: j(r.test_ids_json, []).length, progress: j(r.progress_json, {}), createdAt: r.created_at, createdBy: r.created_by });
  }
  return out;
}
async function update(id, b) {
  const row = await get(`SELECT * FROM assess_builds WHERE id = ?`, [Number(id)]); if (!row) throw httpError(404, 'Build not found');
  const o = j(row.options_json, {});
  if (b.partSize != null) o.partSize = Math.max(5, Math.min(MAX_TOTAL, Math.round(Number(b.partSize) || o.partSize)));
  if (b.order) o.order = b.order === 'mixed' ? 'mixed' : 'document';
  const title = b.title != null ? (clean(b.title, 140).trim() || row.title) : row.title;
  await run(`UPDATE assess_builds SET title = ?, options_json = ?, updated_at = datetime('now') WHERE id = ?`, [title, JSON.stringify(o), row.id]);
  if (title !== row.title) await run(`UPDATE assess_questions SET source = ? WHERE source = ?`, [setName(row.id, title), setName(row.id, row.title)]);
  return view(id);
}
async function more(id, n, ai) {
  const row = await get(`SELECT id FROM assess_builds WHERE id = ?`, [Number(id)]); if (!row) throw httpError(404, 'Build not found');
  if (RUNNING.has(row.id)) throw httpError(409, 'Still writing; wait for it to finish');
  const k = Math.max(1, Math.min(100, Math.round(Number(n) || 10)));
  RUNNING.add(row.id);
  writeAll(row.id, ai, k).catch(async (e) => { await run(`UPDATE assess_builds SET status = 'paused', error = ? WHERE id = ?`, [clean(e.message, 400), row.id]).catch(() => {}); }).finally(() => RUNNING.delete(row.id));
  return view(id);
}
function resume(id, ai) { start(Number(id), ai); return view(id); }
async function bulk(id, { ids, action }) {
  const v = await view(id); const mine = new Set(v.parts.flatMap(p => p.questions.map(q => q.id)));
  const list = (ids === 'all' ? [...mine] : (ids || []).map(Number)).filter(x => mine.has(x));
  if (!list.length) return view(id);
  if (action === 'approve' || action === 'draft') await run(`UPDATE assess_questions SET status = ?, updated_at = datetime('now') WHERE id IN (${list.map(() => '?').join(',')})`, [action === 'approve' ? 'approved' : 'draft', ...list]);
  else if (action === 'remove') { for (const q of list) await A.deleteQuestion(q); const row = await get(`SELECT items_json FROM assess_builds WHERE id = ?`, [Number(id)]); await run(`UPDATE assess_builds SET items_json = ? WHERE id = ?`, [JSON.stringify(j(row.items_json, []).filter(x => !list.includes(x.qid))), Number(id)]); }
  return view(id);
}
/** A fresh question from the same section in place of one the reviewer did not like. */
async function replace(id, qid, ai) {
  const row = await get(`SELECT * FROM assess_builds WHERE id = ?`, [Number(id)]); if (!row) throw httpError(404, 'Build not found');
  const items = j(row.items_json, []); const it = items.find(x => x.qid === Number(qid)); if (!it) throw httpError(404, 'Question not in this set');
  const o = j(row.options_json, {}); const sec = splitSections(row.text || '').find(s => s.id === it.sec) || { title: '', text: row.text || '' };
  const others = (await all(`SELECT prompt FROM assess_questions WHERE id IN (${items.map(() => '?').join(',')})`, items.map(x => x.qid))).map(r => r.prompt);
  const qs = await writeBatch(ai, { secTitle: sec.title, secText: sec.text, n: 1, o, avoid: others, sourceName: row.source_name });
  if (!qs.length) throw httpError(502, 'The AI did not return a usable question. Try again.');
  await A.saveQuestion(it.qid, { ...qs[0], status: 'draft', source: setName(row.id, row.title), tags: (qs[0].tags || []).concat([sec.title.slice(0, 40)]) }, row.created_by);
  return view(id);
}

/** One assessment per part, with the release plan. */
async function createTests(id, b, by) {
  const v = await view(id);
  if (!v.parts.length) throw httpError(400, 'There are no questions yet');
  const row = await get(`SELECT * FROM assess_builds WHERE id = ?`, [Number(id)]);
  const approveAll = b.approveAll !== false;
  const sec = Math.max(15, Math.min(180, Math.round(Number(b.secondsPerQuestion) || 45)));
  const pass = Math.max(0, Math.min(100, Math.round(Number(b.passPct) || 70)));
  const mode = ['together', 'hours', 'days', 'after', 'afterPass'].includes(b.release) ? b.release : 'together';
  const every = Math.max(1, Math.min(720, Math.round(Number(b.every) || 1)));
  const start = b.startAt && !Number.isNaN(Date.parse(b.startAt)) ? Date.parse(b.startAt) : Date.now();
  const openDays = Math.max(0, Math.min(60, Math.round(Number(b.openDays) || 0)));
  const assign = b.assign || { everyone: false, emails: [] };
  const publish = !!b.publish;
  const n = v.parts.length, ids = [];
  const seriesId = 'b' + v.id + '-' + crypto.randomBytes(3).toString('hex');
  for (const p of v.parts) {
    const qids = p.questions.map(q => q.id);
    if (approveAll) await run(`UPDATE assess_questions SET status = 'approved', updated_at = datetime('now') WHERE status = 'draft' AND id IN (${qids.map(() => '?').join(',')})`, qids);
    else if (!p.questions.every(q => q.status === 'approved')) throw httpError(400, `Part ${p.n} still has draft questions. Approve them or tick "Approve all questions".`);
    const opens = mode === 'hours' ? start + (p.n - 1) * every * 3600e3 : mode === 'days' ? start + (p.n - 1) * every * 86400e3 : start;
    const settings = { secondsPerQuestion: sec, passPct: pass, attempts: Math.max(1, Math.min(10, Math.round(Number(b.attempts) || 1))), navigation: 'bank', explainCount: 0,
      releaseMode: ['score', 'answers'].includes(b.releaseResults) ? b.releaseResults : 'none',
      opensAt: opens > Date.now() + 60e3 ? new Date(opens).toISOString() : '', closesAt: openDays ? new Date(Math.max(opens, Date.now()) + openDays * 86400e3).toISOString() : '',
      series: n > 1 ? { id: seriesId, buildId: v.id, part: p.n, of: n, gate: mode === 'after' ? 'after' : mode === 'afterPass' ? 'pass' : 'none', prevId: ids.length ? ids[ids.length - 1] : null } : null };
    const desc = clean(b.description, 900) || `${v.audienceLabel || 'Assessment'} from ${v.sourceName || 'the uploaded document'}.` + (n > 1 ? ` Part ${p.n} of ${n}.` : '');
    const tid = await A.saveTest(null, { title: n > 1 ? `${v.title} · Part ${p.n} of ${n}` : v.title, description: desc, questionIds: qids, status: publish ? 'published' : 'draft', settings, assign }, by);
    ids.push(tid);
  }
  await run(`UPDATE assess_builds SET test_ids_json = ?, status = 'created', updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(j(row.test_ids_json, []).concat(ids)), row.id]);
  return { ids, view: await view(id) };
}
async function remove(id) {
  const row = await get(`SELECT * FROM assess_builds WHERE id = ?`, [Number(id)]); if (!row) return;
  await run(`DELETE FROM assess_builds WHERE id = ?`, [row.id]);
}
function audiences() { return Object.entries(AUDIENCES).map(([k, a]) => ({ key: k, label: a.label, level: a.level, guide: a.guide })); }
module.exports = { setDB, initSchema, create, list, view, update, more, resume, bulk, replace, createTests, remove, audiences, _allocate: allocate, _partsOf: partsOf };
