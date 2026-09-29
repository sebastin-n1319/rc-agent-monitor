/**
 * Session 56: Assessments (the /assess page).
 *
 * One page that anyone in the org can sign in to, with everything graded
 * on the server:
 *  - Questions are served one at a time. The page never holds the whole
 *    test or any answer key, so nothing can be read out of the browser.
 *  - Each question has a server-side deadline (seconds per question plus a
 *    small grace). A late answer scores zero, reloading the page does not
 *    reset the clock, and there is no going back.
 *  - Question order and option order are shuffled per attempt.
 *  - Only one browser tab holds an attempt at a time (a per-attempt client
 *    token); opening it elsewhere ends the first tab and is logged.
 *  - Integrity events (blur, tab switch, fullscreen exit, copy/paste,
 *    right-click, print screen) are stored per attempt, and a simple
 *    integrity score is built from patterns rather than single events.
 *  - "Explain your answer" follow-ups on random questions, marked by a
 *    reviewer.
 *
 * Reviewers (assess_reviewers) are the only people who see answer keys,
 * results and integrity logs. Being an admin elsewhere in the tool does
 * not make someone a reviewer.
 */
const crypto = require('crypto');

let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

const GRACE_MS = 2500;          // network and render allowance on each deadline
const EXPLAIN_SEC = 90;         // time for an "explain your answer" follow-up
const OWNER_EMAIL = 'sebastin.n@adit.com';
const QUESTION_TYPES = new Set(['single', 'multi', 'truefalse']);

const j = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (_) { return d; } };
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
const nowIso = () => new Date().toISOString();
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const k = crypto.randomInt(i + 1); [a[i], a[k]] = [a[k], a[i]]; }
  return a;
}

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS assess_reviewers (
    email TEXT PRIMARY KEY, added_by TEXT, added_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS assess_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, prompt TEXT NOT NULL, options_json TEXT, answer_json TEXT,
    explanation TEXT, tags TEXT, difficulty TEXT, status TEXT NOT NULL DEFAULT 'approved',
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS assess_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, description TEXT, question_ids_json TEXT NOT NULL DEFAULT '[]',
    settings_json TEXT NOT NULL DEFAULT '{}', assign_json TEXT NOT NULL DEFAULT '{"everyone":false,"emails":[]}',
    status TEXT NOT NULL DEFAULT 'draft', created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS assess_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL, email TEXT NOT NULL, name TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress', plan_json TEXT NOT NULL,
    current_idx INTEGER NOT NULL DEFAULT 0, current_served_at TEXT, client_token TEXT,
    started_at TEXT DEFAULT (datetime('now')), finished_at TEXT,
    score REAL, max_score REAL, integrity_json TEXT, ua TEXT)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_attempts_test ON assess_attempts(test_id, email)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_answers (
    attempt_id INTEGER NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, question_id INTEGER,
    ref_idx INTEGER, response_json TEXT, correct INTEGER, served_at TEXT, answered_at TEXT,
    elapsed_ms INTEGER, late INTEGER DEFAULT 0, replays INTEGER DEFAULT 0,
    review_score REAL, review_note TEXT, PRIMARY KEY (attempt_id, idx))`);
  await run(`CREATE TABLE IF NOT EXISTS assess_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, idx INTEGER,
    type TEXT NOT NULL, detail TEXT, at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_events_attempt ON assess_events(attempt_id)`);
  await run(`INSERT OR IGNORE INTO assess_reviewers (email, added_by) VALUES (?, 'system')`, [OWNER_EMAIL]);
  await seedPrototype();
}

// ── Prototype seed: 4 clearly marked sample questions + one test ───────
async function seedPrototype() {
  const has = await get(`SELECT COUNT(*) AS n FROM assess_tests`);
  if (has && has.n) return;
  const qs = [
    { type: 'single', prompt: 'Sample question. A customer calls, upset, and says their issue was already reported twice last week with no update. Before troubleshooting anything, what is the best first move?',
      options: ['Start troubleshooting right away to save time', 'Search their existing tickets and acknowledge the history before anything else', 'Create a fresh ticket so the new report is tracked', 'Transfer the call to a team lead'], answer: [1], tags: 'sample,judgement' },
    { type: 'multi', prompt: 'Sample question. Select every item that must be in an internal note before you hand a ticket to another team.',
      options: ['What the customer reported, in their words', 'What you already checked and the result', 'Your personal opinion of the customer', 'What you need the next team to do'], answer: [0, 1, 3], tags: 'sample,process' },
    { type: 'truefalse', prompt: 'Sample question. If a customer asks you to stay on the line while they reboot, it is fine to leave the call on hold without telling them.',
      options: ['True', 'False'], answer: [1], tags: 'sample,process' },
    { type: 'single', prompt: 'Sample question. Three tickets land at the same time: a password reset, an office whose phones are completely down, and a billing question about next month. Which one do you take first?',
      options: ['The password reset, because it is quickest', 'The billing question, because money is involved', 'The office with phones down, because it stops the practice working', 'Whichever arrived first by timestamp'], answer: [2], tags: 'sample,judgement' },
  ];
  const ids = [];
  for (const q of qs) {
    const r = await run(`INSERT INTO assess_questions (type, prompt, options_json, answer_json, tags, difficulty, status, created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [q.type, q.prompt, JSON.stringify(q.options.map((t, i) => ({ id: i, text: t }))), JSON.stringify(q.answer), q.tags, 'easy', 'approved', 'system']);
    ids.push(r.lastID);
  }
  await run(`INSERT INTO assess_tests (title, description, question_ids_json, settings_json, assign_json, status, created_by) VALUES (?,?,?,?,?,?,?)`,
    ['Prototype: fade text check', 'Four sample questions to test the fade timing and readability. Not scored for real.',
      JSON.stringify(ids), JSON.stringify({ secondsPerQuestion: 40, wordsPerChunk: 4, chunkMs: 1100, visibleChunks: 2, explainCount: 1, passPct: 75, attempts: 3, showScore: true, shuffleQuestions: true, shuffleOptions: true }),
      JSON.stringify({ everyone: false, emails: [OWNER_EMAIL] }), 'published', 'system']);
}

const DEFAULT_SETTINGS = { secondsPerQuestion: 40, wordsPerChunk: 4, chunkMs: 1100, visibleChunks: 2, explainCount: 1, passPct: 70, attempts: 1, showScore: false, shuffleQuestions: true, shuffleOptions: true };
function normSettings(s) {
  const o = { ...DEFAULT_SETTINGS, ...(s || {}) };
  const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  return {
    secondsPerQuestion: clamp(o.secondsPerQuestion, 15, 180, 40),
    wordsPerChunk: clamp(o.wordsPerChunk, 1, 12, 4),
    chunkMs: clamp(o.chunkMs, 400, 4000, 1100),
    visibleChunks: clamp(o.visibleChunks, 1, 4, 2),
    explainCount: clamp(o.explainCount, 0, 5, 1),
    passPct: clamp(o.passPct, 0, 100, 70),
    attempts: clamp(o.attempts, 1, 10, 1),
    showScore: !!o.showScore,
    shuffleQuestions: o.shuffleQuestions !== false,
    shuffleOptions: o.shuffleOptions !== false,
  };
}
function normAssign(a) {
  const emails = Array.from(new Set((Array.isArray(a && a.emails) ? a.emails : String((a && a.emails) || '').split(/[\s,;]+/))
    .map(lc).filter(e => /^[^@\s]+@adit\.com$/.test(e)))).slice(0, 500);
  return { everyone: !!(a && a.everyone), emails };
}

// ── Reviewers ─────────────────────────────────────────────────────────
async function isReviewer(email) { return !!(await get(`SELECT 1 FROM assess_reviewers WHERE email = ?`, [lc(email)])); }
async function listReviewers() { return all(`SELECT email, added_by, added_at FROM assess_reviewers ORDER BY email`); }
async function addReviewer(email, by) {
  const e = lc(email);
  if (!/^[^@\s]+@adit\.com$/.test(e)) throw new Error('Use an @adit.com email');
  await run(`INSERT OR IGNORE INTO assess_reviewers (email, added_by) VALUES (?, ?)`, [e, lc(by)]);
}
async function removeReviewer(email) {
  const e = lc(email);
  if (e === OWNER_EMAIL) throw new Error('The owner cannot be removed');
  await run(`DELETE FROM assess_reviewers WHERE email = ?`, [e]);
}

// ── Taker side ────────────────────────────────────────────────────────
function assignedTo(test, email) {
  const a = j(test.assign_json, {});
  return !!(a.everyone || (Array.isArray(a.emails) && a.emails.map(lc).includes(lc(email))));
}

async function myTests(email) {
  const tests = await all(`SELECT * FROM assess_tests WHERE status = 'published' ORDER BY id DESC`);
  const out = [];
  for (const t of tests) {
    if (!assignedTo(t, email)) continue;
    const s = normSettings(j(t.settings_json, {}));
    const atts = await all(`SELECT id, status, score, max_score, finished_at FROM assess_attempts WHERE test_id = ? AND email = ? ORDER BY id`, [t.id, lc(email)]);
    const done = atts.filter(a => a.status !== 'in_progress');
    const open = atts.find(a => a.status === 'in_progress');
    const last = done[done.length - 1];
    out.push({
      id: t.id, title: t.title, description: t.description || '',
      questions: j(t.question_ids_json, []).length, secondsPerQuestion: s.secondsPerQuestion, explainCount: s.explainCount,
      attemptsAllowed: s.attempts, attemptsUsed: atts.length, inProgress: !!open,
      canStart: !!open || atts.length < s.attempts,
      last: last ? { finishedAt: last.finished_at, score: s.showScore ? last.score : null, maxScore: s.showScore ? last.max_score : null } : null,
    });
  }
  return out;
}

/** Start a new attempt, or resume the one in progress. Returns a fresh
 *  client token; any other tab holding the attempt is cut off. */
async function startAttempt({ testId, email, name, ua }) {
  const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(testId)]);
  if (!t || t.status !== 'published' || !assignedTo(t, email)) { const e = new Error('This assessment is not assigned to you'); e.status = 403; throw e; }
  const s = normSettings(j(t.settings_json, {}));
  const token = crypto.randomBytes(18).toString('hex');
  const open = await get(`SELECT * FROM assess_attempts WHERE test_id = ? AND email = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`, [t.id, lc(email)]);
  if (open) {
    if (open.client_token) await logEvent(open.id, open.current_idx, 'resumed', 'Opened again; the earlier tab was closed off');
    await run(`UPDATE assess_attempts SET client_token = ? WHERE id = ?`, [token, open.id]);
    return { attemptId: open.id, token, resumed: true, title: t.title, settings: publicSettings(s), total: j(open.plan_json, []).length };
  }
  const used = await get(`SELECT COUNT(*) AS n FROM assess_attempts WHERE test_id = ? AND email = ?`, [t.id, lc(email)]);
  if ((used && used.n) >= s.attempts) { const e = new Error('No attempts left on this assessment'); e.status = 409; throw e; }

  let qids = j(t.question_ids_json, []).map(Number).filter(Boolean);
  const rows = qids.length ? await all(`SELECT id, options_json FROM assess_questions WHERE id IN (${qids.map(() => '?').join(',')})`, qids) : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  qids = qids.filter(id => byId.has(id));
  if (!qids.length) { const e = new Error('This assessment has no questions yet'); e.status = 409; throw e; }
  if (s.shuffleQuestions) qids = shuffle(qids);
  const plan = qids.map(id => {
    const opts = j(byId.get(id).options_json, []).map(o => o.id);
    return { kind: 'q', qid: id, opt: s.shuffleOptions ? shuffle(opts) : opts };
  });
  const nExplain = Math.min(s.explainCount, plan.length);
  const picks = shuffle(plan.map((_, i) => i)).slice(0, nExplain).sort((a, b) => a - b);
  for (const ref of picks) plan.push({ kind: 'explain', ref });
  const r = await run(`INSERT INTO assess_attempts (test_id, email, name, plan_json, client_token, ua) VALUES (?,?,?,?,?,?)`,
    [t.id, lc(email), clean(name, 120), JSON.stringify(plan), token, clean(ua, 300)]);
  await logEvent(r.lastID, 0, 'started', null);
  return { attemptId: r.lastID, token, resumed: false, title: t.title, settings: publicSettings(s), total: plan.length };
}

function publicSettings(s) {
  return { secondsPerQuestion: s.secondsPerQuestion, wordsPerChunk: s.wordsPerChunk, chunkMs: s.chunkMs, visibleChunks: s.visibleChunks, explainSeconds: EXPLAIN_SEC };
}

async function loadOwnedAttempt(attemptId, email, token) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a || lc(a.email) !== lc(email)) { const e = new Error('Attempt not found'); e.status = 404; throw e; }
  if (a.status !== 'in_progress') { const e = new Error('This attempt is already submitted'); e.status = 409; e.code = 'finished'; throw e; }
  if (!token || token !== a.client_token) { const e = new Error('This assessment was opened in another tab or window. Continue there, or reload here to take it over.'); e.status = 409; e.code = 'elsewhere'; throw e; }
  return a;
}

function secondsFor(item, s) { return item.kind === 'explain' ? EXPLAIN_SEC : s.secondsPerQuestion; }

/** Records a blank, late answer for any item whose deadline already
 *  passed (the tab was closed, or the agent walked away), then moves on. */
async function expireOverdue(a, s, plan) {
  let idx = a.current_idx, servedAt = a.current_served_at, changed = false;
  while (idx < plan.length && servedAt) {
    const deadline = Date.parse(servedAt) + secondsFor(plan[idx], s) * 1000 + GRACE_MS;
    if (Date.now() <= deadline) break;
    await run(`INSERT OR IGNORE INTO assess_answers (attempt_id, idx, kind, question_id, ref_idx, response_json, correct, served_at, answered_at, elapsed_ms, late)
               VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      [a.id, idx, plan[idx].kind, plan[idx].qid || null, plan[idx].ref ?? null, null, plan[idx].kind === 'q' ? 0 : null, servedAt, null, null]);
    await logEvent(a.id, idx, 'timeout', 'No answer before the timer ran out');
    idx++; servedAt = null; changed = true;
  }
  if (changed) {
    await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = ? WHERE id = ?`, [idx, servedAt, a.id]);
    a.current_idx = idx; a.current_served_at = servedAt;
  }
}

async function testSettingsFor(a) {
  const t = await get(`SELECT settings_json FROM assess_tests WHERE id = ?`, [a.test_id]);
  return normSettings(j(t && t.settings_json, {}));
}

/** The item the agent should see now. Serving starts the clock once;
 *  asking again (a reload) returns the same item with the time left. */
async function current({ attemptId, email, token }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  const plan = j(a.plan_json, []);
  await expireOverdue(a, s, plan);
  if (a.current_idx >= plan.length) return { done: true, result: await finish(a.id) };
  const item = plan[a.current_idx];
  if (!a.current_served_at) {
    a.current_served_at = nowIso();
    await run(`UPDATE assess_attempts SET current_served_at = ? WHERE id = ?`, [a.current_served_at, a.id]);
  } else {
    await logEvent(a.id, a.current_idx, 'reserved', 'The same question was loaded again (reload); the timer kept running');
  }
  const secs = secondsFor(item, s);
  const leftMs = Math.max(0, Date.parse(a.current_served_at) + secs * 1000 - Date.now());
  const base = { done: false, idx: a.current_idx, total: plan.length, seconds: secs, leftMs, kind: item.kind };
  if (item.kind === 'explain') {
    const refItem = plan[item.ref];
    const q = await get(`SELECT prompt FROM assess_questions WHERE id = ?`, [refItem.qid]);
    return { ...base, type: 'explain', prompt: `Explain your answer. Earlier you were asked: "${clean(q && q.prompt, 600)}" In your own words, explain why the right answer is right, and what you would do next with the customer.` };
  }
  const q = await get(`SELECT id, type, prompt, options_json FROM assess_questions WHERE id = ?`, [item.qid]);
  const opts = new Map(j(q.options_json, []).map(o => [o.id, o.text]));
  return { ...base, type: q.type, prompt: q.prompt, options: item.opt.map((oid, i) => ({ key: i, text: opts.get(oid) || '' })) };
}

function grade(qType, answerIds, chosenIds) {
  const want = new Set((answerIds || []).map(Number));
  const got = new Set((chosenIds || []).map(Number));
  if (qType === 'multi') return want.size === got.size && [...want].every(x => got.has(x)) ? 1 : 0;
  return got.size === 1 && want.has([...got][0]) ? 1 : 0;
}

async function answer({ attemptId, email, token, idx, choice, text, replays }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  const plan = j(a.plan_json, []);
  await expireOverdue(a, s, plan);
  if (Number(idx) !== a.current_idx) { const e = new Error('That question has already closed'); e.status = 409; e.code = 'moved'; throw e; }
  if (!a.current_served_at) { const e = new Error('Question was not served'); e.status = 409; throw e; }
  const item = plan[a.current_idx];
  const elapsed = Date.now() - Date.parse(a.current_served_at);
  const late = elapsed > secondsFor(item, s) * 1000 + GRACE_MS ? 1 : 0;
  let response = null, correct = null;
  if (item.kind === 'q') {
    const q = await get(`SELECT type, answer_json FROM assess_questions WHERE id = ?`, [item.qid]);
    const keys = (Array.isArray(choice) ? choice : [choice]).map(Number).filter(k => Number.isInteger(k) && k >= 0 && k < item.opt.length);
    const chosenIds = Array.from(new Set(keys)).map(k => item.opt[k]);
    response = { chosen: chosenIds };
    correct = late ? 0 : grade(q.type, j(q.answer_json, []), chosenIds);
  } else {
    response = { text: clean(text, 4000) };
  }
  await run(`INSERT OR REPLACE INTO assess_answers (attempt_id, idx, kind, question_id, ref_idx, response_json, correct, served_at, answered_at, elapsed_ms, late, replays)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.id, a.current_idx, item.kind, item.qid || null, item.ref ?? null, JSON.stringify(response), correct, a.current_served_at, nowIso(), elapsed, late, Math.max(0, Math.min(99, Number(replays) || 0))]);
  const next = a.current_idx + 1;
  await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = NULL WHERE id = ?`, [next, a.id]);
  if (next >= plan.length) return { done: true, result: await finish(a.id) };
  return { done: false };
}

const EVENT_TYPES = new Set(['blur', 'focus', 'hidden', 'visible', 'fullscreen_exit', 'fullscreen_enter', 'copy', 'cut', 'paste', 'contextmenu', 'printscreen', 'devtools_key', 'mouse_out', 'resize', 'replay', 'print', 'select']);
async function logEvent(attemptId, idx, type, detail) {
  await run(`INSERT INTO assess_events (attempt_id, idx, type, detail) VALUES (?,?,?,?)`, [attemptId, idx ?? null, type, detail ? clean(detail, 300) : null]);
}
async function clientEvents({ attemptId, email, token, events }) {
  const a = await get(`SELECT id, email, client_token, status FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a || lc(a.email) !== lc(email) || a.status !== 'in_progress') return 0;
  let n = 0;
  const tokenOk = token && token === a.client_token;
  for (const ev of (Array.isArray(events) ? events : []).slice(0, 50)) {
    const type = String(ev && ev.type || '');
    if (!EVENT_TYPES.has(type)) continue;
    await logEvent(a.id, Number.isInteger(ev.idx) ? ev.idx : null, type, (tokenOk ? '' : '[stale tab] ') + clean(ev.detail || '', 200));
    n++;
  }
  return n;
}

/** Integrity score: 100 minus weighted, capped penalties. Patterns matter
 *  more than one-off events, so each type is capped. */
function integrityFrom(events, answers) {
  const c = {};
  for (const e of events) c[e.type] = (c[e.type] || 0) + 1;
  const pen = (type, per, cap) => Math.min(cap, (c[type] || 0) * per);
  let penalty = pen('hidden', 8, 32) + pen('blur', 4, 20) + pen('fullscreen_exit', 6, 18) + pen('paste', 10, 30)
    + pen('copy', 5, 15) + pen('printscreen', 10, 20) + pen('devtools_key', 8, 16) + pen('contextmenu', 2, 6)
    + pen('resumed', 6, 18) + pen('reserved', 4, 12) + pen('mouse_out', 1, 8);
  // "Long pause, then right": correct answers that took over 75% of the time.
  const slowRight = answers.filter(a => a.kind === 'q' && a.correct === 1 && a.elapsed_ms != null && a.allowedMs && a.elapsed_ms > a.allowedMs * 0.75).length;
  penalty += Math.min(15, slowRight * 5);
  const flags = [];
  if (c.hidden) flags.push(`Left the tab ${c.hidden}x`);
  if (c.blur) flags.push(`Window lost focus ${c.blur}x`);
  if (c.fullscreen_exit) flags.push(`Exited fullscreen ${c.fullscreen_exit}x`);
  if (c.paste) flags.push(`Tried to paste ${c.paste}x`);
  if (c.copy) flags.push(`Tried to copy ${c.copy}x`);
  if (c.printscreen) flags.push(`Print Screen ${c.printscreen}x`);
  if (c.devtools_key) flags.push(`Developer tools keys ${c.devtools_key}x`);
  if (c.resumed) flags.push(`Reopened in another tab ${c.resumed}x`);
  if (c.reserved) flags.push(`Reloaded a question ${c.reserved}x`);
  if (slowRight) flags.push(`${slowRight} correct answer${slowRight === 1 ? '' : 's'} after a long pause`);
  return { score: Math.max(0, 100 - penalty), flags, counts: c };
}

async function finish(attemptId) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [attemptId]);
  const s = await testSettingsFor(a);
  const answers = await all(`SELECT * FROM assess_answers WHERE attempt_id = ?`, [a.id]);
  const plan = j(a.plan_json, []);
  const qItems = plan.filter(p => p.kind === 'q').length;
  const score = answers.filter(x => x.kind === 'q' && x.correct === 1).length;
  if (a.status === 'in_progress') {
    const events = await all(`SELECT type FROM assess_events WHERE attempt_id = ?`, [a.id]);
    const integ = integrityFrom(events, answers.map(x => ({ ...x, allowedMs: s.secondsPerQuestion * 1000 })));
    await run(`UPDATE assess_attempts SET status = 'submitted', finished_at = ?, score = ?, max_score = ?, integrity_json = ?, client_token = NULL WHERE id = ?`,
      [nowIso(), score, qItems, JSON.stringify(integ), a.id]);
    await logEvent(a.id, null, 'submitted', null);
  }
  return s.showScore ? { score, maxScore: qItems, pct: qItems ? Math.round(score / qItems * 100) : 0, passed: qItems ? score / qItems * 100 >= s.passPct : false } : { hidden: true };
}

// ── Reviewer side ─────────────────────────────────────────────────────
async function adminTests() {
  const tests = await all(`SELECT * FROM assess_tests ORDER BY id DESC`);
  const out = [];
  for (const t of tests) {
    const st = await get(`SELECT COUNT(*) AS n, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS done FROM assess_attempts WHERE test_id = ?`, [t.id]);
    out.push({ id: t.id, title: t.title, description: t.description || '', status: t.status, questionIds: j(t.question_ids_json, []),
      settings: normSettings(j(t.settings_json, {})), assign: normAssign(j(t.assign_json, {})), attempts: st.n || 0, submitted: st.done || 0, updatedAt: t.updated_at });
  }
  return out;
}

async function updateTest(id, body) {
  const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(id)]);
  if (!t) { const e = new Error('Test not found'); e.status = 404; throw e; }
  const title = body.title != null ? clean(body.title, 160).trim() || t.title : t.title;
  const description = body.description != null ? clean(body.description, 1000) : t.description;
  const settings = body.settings ? normSettings({ ...j(t.settings_json, {}), ...body.settings }) : normSettings(j(t.settings_json, {}));
  const assign = body.assign ? normAssign(body.assign) : normAssign(j(t.assign_json, {}));
  const status = body.status === 'published' || body.status === 'draft' ? body.status : t.status;
  await run(`UPDATE assess_tests SET title=?, description=?, settings_json=?, assign_json=?, status=?, updated_at=datetime('now') WHERE id=?`,
    [title, description, JSON.stringify(settings), JSON.stringify(assign), status, t.id]);
}

async function adminAttempts(testId) {
  const rows = await all(`SELECT id, test_id, email, name, status, started_at, finished_at, score, max_score, integrity_json, current_idx, plan_json FROM assess_attempts WHERE test_id = ? ORDER BY id DESC`, [Number(testId)]);
  return rows.map(r => {
    const integ = j(r.integrity_json, null);
    return { id: r.id, email: r.email, name: r.name, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at,
      score: r.score, maxScore: r.max_score, integrity: integ ? integ.score : null, flags: integ ? integ.flags : [],
      progress: `${Math.min(r.current_idx, j(r.plan_json, []).length)}/${j(r.plan_json, []).length}` };
  });
}

async function adminAttemptDetail(attemptId) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a) { const e = new Error('Attempt not found'); e.status = 404; throw e; }
  const plan = j(a.plan_json, []);
  const answers = await all(`SELECT * FROM assess_answers WHERE attempt_id = ? ORDER BY idx`, [a.id]);
  const byIdx = new Map(answers.map(x => [x.idx, x]));
  const qids = Array.from(new Set(plan.filter(p => p.qid).map(p => p.qid)));
  const qs = qids.length ? await all(`SELECT * FROM assess_questions WHERE id IN (${qids.map(() => '?').join(',')})`, qids) : [];
  const qById = new Map(qs.map(q => [q.id, q]));
  const items = plan.map((p, i) => {
    const ans = byIdx.get(i);
    const resp = j(ans && ans.response_json, null);
    if (p.kind === 'explain') {
      const ref = plan[p.ref]; const q = qById.get(ref && ref.qid);
      return { idx: i, kind: 'explain', about: q ? q.prompt : '', refIdx: p.ref, text: resp ? resp.text : null, late: !!(ans && ans.late),
        elapsedMs: ans ? ans.elapsed_ms : null, answered: !!ans, reviewScore: ans ? ans.review_score : null, reviewNote: ans ? ans.review_note : null };
    }
    const q = qById.get(p.qid) || {};
    const opts = j(q.options_json, []);
    const text = (id) => (opts.find(o => o.id === id) || {}).text || `Option ${id}`;
    return { idx: i, kind: 'q', type: q.type, prompt: q.prompt, shownOrder: p.opt.map(text),
      correctAnswer: j(q.answer_json, []).map(text), chosen: resp ? (resp.chosen || []).map(text) : null,
      correct: ans ? ans.correct === 1 : false, late: !!(ans && ans.late), answered: !!ans,
      elapsedMs: ans ? ans.elapsed_ms : null, replays: ans ? ans.replays : 0 };
  });
  const events = await all(`SELECT idx, type, detail, at FROM assess_events WHERE attempt_id = ? ORDER BY id`, [a.id]);
  const t = await get(`SELECT title, settings_json FROM assess_tests WHERE id = ?`, [a.test_id]);
  return { id: a.id, testId: a.test_id, testTitle: t ? t.title : '', email: a.email, name: a.name, status: a.status,
    startedAt: a.started_at, finishedAt: a.finished_at, score: a.score, maxScore: a.max_score, ua: a.ua,
    passPct: normSettings(j(t && t.settings_json, {})).passPct,
    integrity: j(a.integrity_json, null), items, events };
}

async function reviewExplain(attemptId, idx, { score, note }) {
  const n = score == null || score === '' ? null : Math.max(0, Math.min(1, Number(score)));
  await run(`UPDATE assess_answers SET review_score = ?, review_note = ? WHERE attempt_id = ? AND idx = ? AND kind = 'explain'`,
    [Number.isFinite(n) ? n : null, clean(note, 1000), Number(attemptId), Number(idx)]);
}

async function deleteAttempt(attemptId) {
  await run(`DELETE FROM assess_answers WHERE attempt_id = ?`, [Number(attemptId)]);
  await run(`DELETE FROM assess_events WHERE attempt_id = ?`, [Number(attemptId)]);
  await run(`DELETE FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
}

async function exportCsv(testId) {
  const rows = await adminAttempts(testId);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Name', 'Email', 'Status', 'Started (UTC)', 'Finished (UTC)', 'Score', 'Out of', 'Percent', 'Integrity', 'Flags'];
  const lines = rows.map(r => [r.name, r.email, r.status, r.startedAt, r.finishedAt, r.score, r.maxScore,
    r.maxScore ? Math.round(r.score / r.maxScore * 100) + '%' : '', r.integrity, (r.flags || []).join('; ')].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

module.exports = {
  setDB, initSchema, QUESTION_TYPES,
  isReviewer, listReviewers, addReviewer, removeReviewer,
  myTests, startAttempt, current, answer, clientEvents,
  adminTests, updateTest, adminAttempts, adminAttemptDetail, reviewExplain, deleteAttempt, exportCsv,
  _integrityFrom: integrityFrom, _grade: grade,
};
