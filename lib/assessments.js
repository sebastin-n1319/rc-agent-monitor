/**
 * Session 56-57: Assessments (/assess, and embedded in the main app).
 *
 * Design notes (from how TestGorilla, HackerRank, Mettl and the Duolingo
 * English Test run remote tests):
 *  - Everything is graded on the server. Questions are served one at a
 *    time, the page never holds the whole test or any answer key.
 *  - Each question has a server-side clock. Late answers score zero and
 *    reloading does not reset it. Session 62: by default each question
 *    keeps its own time bank, so an agent can go back while time is left
 *    and review everything before submitting ("One way" keeps the old
 *    lock-on-submit flow). Reviewers can reset an attempt; it stays in
 *    the results marked Reset and stops counting.
 *  - Question order and option order are shuffled per attempt, and a test
 *    can draw a random set from a tagged pool so no two agents get the
 *    same paper.
 *  - One browser tab per attempt (client token).
 *  - Activity is logged, not screen recorded: tab switches, full screen
 *    exits, copy/paste, Print Screen, developer tools keys, a second
 *    screen. Optional camera snapshots (off by default, with consent).
 *  - Integrity is reported as a behaviour tier (No issues / Some issues /
 *    Major issues): signals to look into, never proof.
 *  - "Explain your answer" follow-ups, marked by a reviewer.
 *
 * Access: tool members always get in. Anyone else needs to be on the
 * guest list, unless the link is opened to the whole @adit.com domain.
 * Reviewers (assess_reviewers) are the only people who see answer keys,
 * results, camera snapshots and activity logs; being an admin elsewhere in
 * the tool does not make someone a reviewer.
 */
const crypto = require('crypto');

let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

const GRACE_MS = 2500;          // network and render allowance on each deadline
const ABANDON_GRACE_MIN = 30;   // Session 61: extra minutes before an abandoned attempt is auto-submitted
const EXPLAIN_SEC = 90;         // time for an "explain your answer" follow-up
const OWNER_EMAIL = 'sebastin.n@adit.com';
const QUESTION_TYPES = new Set(['single', 'multi', 'truefalse', 'ordering', 'matching']);
let deps = {}; // Session 60: { postChat(url, text), mentionFor(email), inAlertHours(), publicUrl }
function setDeps(d) { deps = d || {}; }
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

const j = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (_) { return d; } };
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
const nowIso = () => new Date().toISOString();
const isAditEmail = (e) => /^[^@\s]+@adit\.com$/.test(lc(e));
function httpError(status, msg, code) { const e = new Error(msg); e.status = status; if (code) e.code = code; return e; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const k = crypto.randomInt(i + 1); [a[i], a[k]] = [a[k], a[i]]; }
  return a;
}
function tagList(s) {
  return Array.from(new Set((Array.isArray(s) ? s : String(s || '').split(','))
    .map(t => lc(t).replace(/[^a-z0-9 _-]/g, '').trim()).filter(Boolean))).slice(0, 12);
}

async function addColumn(table, def) {
  try { await run(`ALTER TABLE ${table} ADD COLUMN ${def}`); }
  catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
}

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS assess_reviewers (
    email TEXT PRIMARY KEY, added_by TEXT, added_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS assess_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, prompt TEXT NOT NULL, options_json TEXT, answer_json TEXT,
    explanation TEXT, tags TEXT, difficulty TEXT, status TEXT NOT NULL DEFAULT 'approved',
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  await addColumn('assess_questions', 'source TEXT');
  await addColumn('assess_questions', 'module TEXT');
  await addColumn('assess_questions', 'sub_module TEXT');
  await addColumn('assess_questions', 'image BLOB');
  await addColumn('assess_questions', 'image_type TEXT');
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
  await addColumn('assess_attempts', 'extra_pct INTEGER DEFAULT 0');
  await addColumn('assess_attempts', 'review_verdict TEXT');
  await addColumn('assess_attempts', 'review_notes TEXT');
  await addColumn('assess_attempts', 'reviewed_by TEXT');
  await addColumn('assess_attempts', 'reviewed_at TEXT');
  // Session 62: time-bank navigation, soft reset
  await addColumn('assess_attempts', 'nav_mode TEXT');
  await addColumn('assess_attempts', 'bank_review INTEGER DEFAULT 0');
  await addColumn('assess_attempts', 'reset_by TEXT');
  await addColumn('assess_attempts', 'reset_at TEXT');
  await addColumn('assess_attempts', 'reset_note TEXT');
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_attempts_test ON assess_attempts(test_id, email)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_answers (
    attempt_id INTEGER NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, question_id INTEGER,
    ref_idx INTEGER, response_json TEXT, correct INTEGER, served_at TEXT, answered_at TEXT,
    elapsed_ms INTEGER, late INTEGER DEFAULT 0, replays INTEGER DEFAULT 0,
    review_score REAL, review_note TEXT, PRIMARY KEY (attempt_id, idx))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_answers_q ON assess_answers(question_id)`);
  await addColumn('assess_answers', 'used_ms INTEGER DEFAULT 0');
  await addColumn('assess_answers', 'visits INTEGER DEFAULT 0');
  await addColumn('assess_answers', 'flagged INTEGER DEFAULT 0');
  await run(`CREATE TABLE IF NOT EXISTS assess_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, idx INTEGER,
    type TEXT NOT NULL, detail TEXT, at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_events_attempt ON assess_events(attempt_id)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_guests (
    email TEXT PRIMARY KEY, note TEXT, added_by TEXT, added_at TEXT DEFAULT (datetime('now')), last_seen TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_extra_time (
    email TEXT PRIMARY KEY, pct INTEGER NOT NULL, added_by TEXT, added_at TEXT DEFAULT (datetime('now')))`);
  await addColumn('assess_extra_time', 'plain INTEGER DEFAULT 0');
  await run(`CREATE TABLE IF NOT EXISTS assess_config (key TEXT PRIMARY KEY, value TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, idx INTEGER,
    at TEXT DEFAULT (datetime('now')), img BLOB)`);
  await addColumn('assess_snapshots', 'faces INTEGER');
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_snapshots_attempt ON assess_snapshots(attempt_id)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_audio (
    question_id INTEGER NOT NULL, voice TEXT NOT NULL, text_hash TEXT NOT NULL, mp3 BLOB, created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (question_id, voice))`);
  await run(`INSERT OR IGNORE INTO assess_reviewers (email, added_by) VALUES (?, 'system')`, [OWNER_EMAIL]);
  await seedPrototype();
}

// ── Prototype seed ────────────────────────────────────────────────────
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
    const r = await run(`INSERT INTO assess_questions (type, prompt, options_json, answer_json, tags, difficulty, status, created_by, source) VALUES (?,?,?,?,?,?,?,?,?)`,
      [q.type, q.prompt, JSON.stringify(q.options.map((t, i) => ({ id: i, text: t }))), JSON.stringify(q.answer), q.tags, 'easy', 'approved', 'system', 'Sample']);
    ids.push(r.lastID);
  }
  await run(`INSERT INTO assess_tests (title, description, question_ids_json, settings_json, assign_json, status, created_by) VALUES (?,?,?,?,?,?,?)`,
    ['Prototype: fade text check', 'Four sample questions to test the fade timing and readability. Not scored for real.',
      JSON.stringify(ids), JSON.stringify({ secondsPerQuestion: 40, explainCount: 1, passPct: 75, attempts: 3, showScore: true }),
      JSON.stringify({ everyone: false, emails: [OWNER_EMAIL] }), 'published', 'system']);
}

// ── Settings ──────────────────────────────────────────────────────────
const MODS = require('./assess-modules');
const DEFAULT_SETTINGS = {
  secondsPerQuestion: 40, displayMode: 'fade', voice: 'alloy', wordsPerChunk: 4, chunkMs: 1000,
  explainCount: 1, passPct: 70, attempts: 1, showScore: false, shuffleQuestions: true, shuffleOptions: true,
  watermark: 'off', camera: false, snapshotSec: 30, navigation: 'bank',
  pool: { mode: 'fixed', tags: [], count: 10, difficulty: '' },
  opensAt: '', closesAt: '', releaseMode: 'none',
  repeat: { mode: 'none', openDays: 7 }, parentId: null, modules: [], prep: { summary: '', topics: [] },
};
function normSettings(s) {
  const o = { ...DEFAULT_SETTINGS, ...(s || {}) };
  const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  const pool = { ...DEFAULT_SETTINGS.pool, ...(o.pool || {}) };
  return {
    secondsPerQuestion: clamp(o.secondsPerQuestion, 15, 180, 40),
    displayMode: ['full', 'audio'].includes(o.displayMode) ? o.displayMode : 'fade',
    voice: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(o.voice) ? o.voice : 'alloy',
    wordsPerChunk: clamp(o.wordsPerChunk, 2, 10, 4),
    chunkMs: clamp(o.chunkMs, 500, 3000, 1000),
    explainCount: clamp(o.explainCount, 0, 5, 1),
    passPct: clamp(o.passPct, 0, 100, 70),
    attempts: clamp(o.attempts, 1, 10, 1),
    showScore: !!o.showScore,
    shuffleQuestions: o.shuffleQuestions !== false,
    shuffleOptions: o.shuffleOptions !== false,
    watermark: o.watermark === 'subtle' ? 'subtle' : 'off',
    camera: !!o.camera,
    navigation: o.navigation === 'locked' ? 'locked' : 'bank',
    snapshotSec: clamp(o.snapshotSec, 15, 120, 30),
    opensAt: o.opensAt && !Number.isNaN(Date.parse(o.opensAt)) ? new Date(o.opensAt).toISOString() : '',
    closesAt: o.closesAt && !Number.isNaN(Date.parse(o.closesAt)) ? new Date(o.closesAt).toISOString() : '',
    releaseMode: ['score', 'answers'].includes(o.releaseMode) ? o.releaseMode : 'none',
    repeat: { mode: ['weekly', 'monthly'].includes(o.repeat && o.repeat.mode) ? o.repeat.mode : 'none', openDays: clamp(o.repeat && o.repeat.openDays, 1, 28, 7) },
    parentId: o.parentId ? Number(o.parentId) : null,
    modules: MODS.normModules(o.modules), prep: MODS.normPrep(o.prep),
    pool: { mode: pool.mode === 'random' ? 'random' : 'fixed', tags: tagList(pool.tags), count: clamp(pool.count, 1, 100, 10), difficulty: DIFFICULTIES.has(pool.difficulty) ? pool.difficulty : '' },
  };
}
function normAssign(a) {
  const emails = Array.from(new Set((Array.isArray(a && a.emails) ? a.emails : String((a && a.emails) || '').split(/[\s,;]+/))
    .map(lc).filter(isAditEmail))).slice(0, 500);
  return { everyone: !!(a && a.everyone), emails };
}

// ── Access ────────────────────────────────────────────────────────────
async function getConfig(key, dflt) { const r = await get(`SELECT value FROM assess_config WHERE key = ?`, [key]); return r ? r.value : dflt; }
async function setConfig(key, value) { await run(`INSERT INTO assess_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, String(value)]); }

function isOwner(email) { return lc(email) === OWNER_EMAIL; }
async function isReviewer(email) { return !!(await get(`SELECT 1 FROM assess_reviewers WHERE email = ?`, [lc(email)])); }

/** Who may use the assessment pages at all. Members of the tool always
 *  can; anyone else must be on the guest list, unless the link is open
 *  to the whole @adit.com domain. */
async function accessFor(email, member) {
  const e = lc(email);
  if (member) return { allowed: true, via: 'member' };
  if (await isReviewer(e)) return { allowed: true, via: 'reviewer' };
  const guest = await get(`SELECT email FROM assess_guests WHERE email = ?`, [e]);
  if (guest) { run(`UPDATE assess_guests SET last_seen = datetime('now') WHERE email = ?`, [e]).catch(() => {}); return { allowed: true, via: 'guest' }; }
  if ((await getConfig('link_mode', 'list')) === 'domain' && isAditEmail(e)) return { allowed: true, via: 'domain' };
  return { allowed: false, via: null };
}

async function accessOverview() {
  return {
    linkMode: await getConfig('link_mode', 'list'),
    guests: await all(`SELECT email, note, added_by, added_at, last_seen FROM assess_guests ORDER BY added_at DESC`),
    reviewers: await all(`SELECT email, added_by, added_at FROM assess_reviewers ORDER BY email`),
    extraTime: await all(`SELECT email, pct, COALESCE(plain,0) AS plain, added_by, added_at FROM assess_extra_time ORDER BY email`),
    photoDays: Number(await getConfig('photo_days', '90')) || 90,
    photoStats: await get(`SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(img)), 0) AS bytes, MIN(at) AS oldest FROM assess_snapshots`),
  };
}
async function setLinkMode(mode) { await setConfig('link_mode', mode === 'domain' ? 'domain' : 'list'); }
async function addGuests(emailsRaw, note, by) {
  const emails = Array.from(new Set(String(emailsRaw || '').split(/[\s,;]+/).map(lc).filter(Boolean)));
  const bad = emails.filter(e => !isAditEmail(e));
  if (bad.length) throw httpError(400, `Only @adit.com emails can be added: ${bad.slice(0, 3).join(', ')}`);
  for (const e of emails.slice(0, 200)) await run(`INSERT OR IGNORE INTO assess_guests (email, note, added_by) VALUES (?,?,?)`, [e, clean(note, 120) || null, lc(by)]);
  return emails.length;
}
async function removeGuest(email) { await run(`DELETE FROM assess_guests WHERE email = ?`, [lc(email)]); }
async function addReviewer(email, by) {
  const e = lc(email);
  if (!isAditEmail(e)) throw httpError(400, 'Use an @adit.com email');
  await run(`INSERT OR IGNORE INTO assess_reviewers (email, added_by) VALUES (?, ?)`, [e, lc(by)]);
}
async function removeReviewer(email) {
  const e = lc(email);
  if (e === OWNER_EMAIL) throw httpError(400, 'The owner cannot be removed');
  await run(`DELETE FROM assess_reviewers WHERE email = ?`, [e]);
}
/** Accommodations: extra time (%) and/or plain text (questions shown as
 *  normal text so screen readers and zoom work). */
async function setExtraTime(email, pct, by, plain) {
  const e = lc(email);
  if (!isAditEmail(e)) throw httpError(400, 'Use an @adit.com email');
  const n = Math.max(0, Math.min(200, Math.round(Number(pct) || 0)));
  const pl = plain ? 1 : 0;
  if (!n && !pl) { await run(`DELETE FROM assess_extra_time WHERE email = ?`, [e]); return; }
  await run(`INSERT INTO assess_extra_time (email, pct, added_by, plain) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET pct = excluded.pct, added_by = excluded.added_by, plain = excluded.plain`, [e, n, lc(by), pl]);
}
async function plainFor(email) { const r = await get(`SELECT plain FROM assess_extra_time WHERE email = ?`, [lc(email)]); return !!(r && r.plain); }

// ── Question bank ─────────────────────────────────────────────────────
function normQuestion(b) {
  const type = QUESTION_TYPES.has(b.type) ? b.type : 'single';
  const prompt = clean(b.prompt, 1500).trim();
  if (prompt.length < 8) throw httpError(400, 'Write the question (at least a few words)');
  if (type === 'ordering' || type === 'matching') {
    const raw = (Array.isArray(b.options) ? b.options : []).map(o => {
      if (typeof o === 'string') { const m = o.split(/\s*(?:=>|\|\|)\s*/); return { text: clean(m[0], 300).trim(), match: clean(m[1] || '', 300).trim() }; }
      return { text: clean(o && o.text, 300).trim(), match: clean(o && o.match, 300).trim() };
    }).filter(o => o.text && (type === 'ordering' || o.match));
    if (raw.length < 3) throw httpError(400, type === 'ordering' ? 'Add at least three steps' : 'Add at least three complete pairs');
    if (raw.length > (type === 'ordering' ? 8 : 6)) throw httpError(400, type === 'ordering' ? 'Use eight steps or fewer' : 'Use six pairs or fewer');
    if (type === 'matching' && new Set(raw.map(o => lc(o.match))).size !== raw.length) throw httpError(400, 'Each item needs a different match');
    const opts = raw.map((o, k) => type === 'matching' ? { id: k, text: o.text, match: o.match } : { id: k, text: o.text });
    return {
      type, prompt, options: opts, answer: opts.map(o => o.id),
      explanation: clean(b.explanation, 1500).trim() || null,
      tags: tagList(b.tags).join(','),
      difficulty: DIFFICULTIES.has(b.difficulty) ? b.difficulty : 'medium',
      status: ['draft', 'approved', 'retired'].includes(b.status) ? b.status : 'draft',
      source: clean(b.source, 200) || null,
      module: MODS.moduleKey(b.module) || null, subModule: b.module ? (MODS.cleanSub(b.subModule) || null) : null,
    };
  }
  let options = (Array.isArray(b.options) ? b.options : []).map(o => clean(typeof o === 'string' ? o : (o && o.text), 400).trim());
  if (type === 'truefalse') options = ['True', 'False'];
  const keep = options.map((t, i) => ({ t, i })).filter(x => x.t);
  if (keep.length < 2) throw httpError(400, 'Add at least two options');
  if (keep.length > 8) throw httpError(400, 'Use eight options or fewer');
  const correctIn = new Set((Array.isArray(b.correct) ? b.correct : []).map(Number));
  const opts = keep.map((x, k) => ({ id: k, text: x.t }));
  const answer = keep.map((x, k) => (correctIn.has(x.i) ? k : -1)).filter(k => k >= 0);
  if (!answer.length) throw httpError(400, 'Mark the correct answer');
  if (type !== 'multi' && answer.length !== 1) throw httpError(400, 'Mark exactly one correct answer, or change the type to "Select all that apply"');
  return {
    type, prompt, options: opts, answer,
    explanation: clean(b.explanation, 1500).trim() || null,
    tags: tagList(b.tags).join(','),
    difficulty: DIFFICULTIES.has(b.difficulty) ? b.difficulty : 'medium',
    status: ['draft', 'approved', 'retired'].includes(b.status) ? b.status : 'draft',
    source: clean(b.source, 200) || null,
    module: MODS.moduleKey(b.module) || null, subModule: b.module ? (MODS.cleanSub(b.subModule) || null) : null,
  };
}

async function questionStats(ids) {
  const where = ids && ids.length ? `AND question_id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = await all(`SELECT question_id AS id, COUNT(*) AS shown, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS right_n,
      AVG(CASE WHEN late = 0 THEN elapsed_ms END) AS avg_ms, MAX(served_at) AS last_used
      FROM assess_answers WHERE kind = 'q' AND attempt_id NOT IN (SELECT id FROM assess_attempts WHERE status = 'reset') ${where} GROUP BY question_id`, ids || []);
  const map = new Map(rows.map(r => [r.id, r]));
  // Session 60: discrimination. Compare how the top and bottom 27% of
  // submitted attempts (by total score) did on each question.
  const att = await all(`SELECT id, score * 1.0 / max_score AS pct FROM assess_attempts WHERE status = 'submitted' AND max_score > 0`);
  if (att.length >= 10) {
    const sorted = att.map(a => a.pct).sort((x, y) => x - y);
    const lo = sorted[Math.floor(sorted.length * 0.27)], hi = sorted[Math.ceil(sorted.length * 0.73) - 1];
    const grp = new Map(att.map(a => [a.id, a.pct <= lo ? 'lo' : (a.pct >= hi ? 'hi' : '')]));
    const ans = await all(`SELECT attempt_id, question_id, correct FROM assess_answers WHERE kind = 'q' ${where}`, ids || []);
    const acc = {};
    for (const x of ans) {
      const g = grp.get(x.attempt_id); if (!g) continue;
      const k = acc[x.question_id] || (acc[x.question_id] = { hi: 0, hiN: 0, lo: 0, loN: 0 });
      k[g + 'N']++; if (x.correct === 1) k[g]++;
    }
    for (const [qid, k] of Object.entries(acc)) {
      const r = map.get(Number(qid));
      if (r && k.hiN >= 3 && k.loN >= 3) r.disc = Math.round((k.hi / k.hiN - k.lo / k.loN) * 100) / 100;
    }
  }
  return map;
}
function statFlag(st, limit) {
  if (!st) return null;
  if (limit && st.shown >= limit) return `Used ${st.shown} times, over your limit of ${limit}. Random pools skip it now; write a fresh version.`;
  if (st.disc != null && st.disc < 0) return 'Weaker agents get this right more often than stronger ones. Check the answer key.';
  if (st.shown < 5) return null;
  const pct = st.right_n / st.shown;
  if (pct >= 0.9) return 'Almost everyone gets this right. It may be too easy, or it may have leaked.';
  if (pct <= 0.3) return 'Most people get this wrong. Check the wording and the answer key.';
  if (st.disc != null && st.disc < 0.1) return 'Strong and weak agents score about the same on this, so it tells you little.';
  return null;
}
async function exposureLimit() { return Math.max(0, Number(await getConfig('exposure_limit', '0')) || 0); }

async function listQuestions({ q, tag, status, type, module, source, difficulty, from, to, used } = {}) {
  const where = [], p = [];
  if (module === '__none') where.push(`(module IS NULL OR module = '')`);
  else if (module) { where.push('module = ?'); p.push(MODS.moduleKey(module) || '-'); }
  if (source) { where.push('source = ?'); p.push(String(source)); }
  if (difficulty) { where.push('difficulty = ?'); p.push(String(difficulty)); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { where.push('date(created_at) >= ?'); p.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) { where.push('date(created_at) <= ?'); p.push(to); }
  if (status) { where.push('status = ?'); p.push(status); } else where.push(`status != 'retired'`);
  if (type) { where.push('type = ?'); p.push(type); }
  if (tag) { where.push(`(',' || tags || ',') LIKE ?`); p.push(`%,${lc(tag)},%`); }
  if (q) { where.push('(prompt LIKE ? OR options_json LIKE ? OR tags LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await all(`SELECT * FROM assess_questions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`, p);
  const stats = await questionStats(rows.map(r => r.id));
  const limit = await exposureLimit();
  const tests = await all(`SELECT id, title, question_ids_json FROM assess_tests WHERE status != 'archived'`);
  const mapped = rows.map(r => {
    const st = stats.get(r.id);
    const usedIn = tests.filter(t => j(t.question_ids_json, []).map(Number).includes(r.id)).map(t => t.title);
    return {
      createdAt: r.created_at,
      id: r.id, type: r.type, prompt: r.prompt, options: j(r.options_json, []).map(o => o.text), matches: r.type === 'matching' ? j(r.options_json, []).map(o => o.match || '') : null, correct: j(r.answer_json, []),
      hasImage: !!r.image_type, module: r.module || '', subModule: r.sub_module || '',
      explanation: r.explanation, tags: r.tags ? r.tags.split(',').filter(Boolean) : [], difficulty: r.difficulty, status: r.status,
      source: r.source, createdBy: r.created_by, updatedAt: r.updated_at, usedIn,
      stats: st ? { shown: st.shown, pctCorrect: Math.round(st.right_n / st.shown * 100), avgSec: st.avg_ms != null ? Math.round(st.avg_ms / 100) / 10 : null, lastUsed: st.last_used, disc: st.disc != null ? st.disc : null, flag: statFlag(st, limit) } : { shown: 0 },
    };
  });
  if (used === 'unused') return mapped.filter(x => !x.usedIn.length);
  if (used === 'used') return mapped.filter(x => x.usedIn.length);
  return mapped;
}
/** Filter helpers for the bank: upload sources, and how many have no module yet. */
async function questionFacets() {
  const sources = await all(`SELECT source, COUNT(*) AS n, MAX(created_at) AS last FROM assess_questions WHERE status != 'retired' AND source IS NOT NULL AND source != '' GROUP BY source ORDER BY last DESC LIMIT 60`);
  const u = await get(`SELECT COUNT(*) AS n FROM assess_questions WHERE status != 'retired' AND (module IS NULL OR module = '')`);
  const t = await get(`SELECT COUNT(*) AS n FROM assess_questions WHERE status != 'retired'`);
  return { sources: sources.map(r => ({ name: r.source, n: r.n, last: r.last })), untagged: u ? u.n : 0, total: t ? t.n : 0 };
}
/** Give every question that has no module one, in small batches. */
async function tagUntagged(ai) {
  const rows = await all(`SELECT id FROM assess_questions WHERE status != 'retired' AND (module IS NULL OR module = '') ORDER BY id DESC LIMIT 400`);
  const ids = rows.map(r => r.id);
  let tagged = 0;
  for (let i = 0; i < ids.length; i += 30) {
    try { tagged += (await classifyQuestions(ids.slice(i, i + 30), ai)).tagged; } catch (e) { /* keep going with the next batch */ }
  }
  return { tagged, left: Math.max(0, ids.length - tagged) };
}
async function allTags() {
  const rows = await all(`SELECT tags FROM assess_questions WHERE status != 'retired' AND tags IS NOT NULL AND tags != ''`);
  const count = {};
  for (const r of rows) for (const t of r.tags.split(',').filter(Boolean)) count[t] = (count[t] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n }));
}
async function saveQuestion(id, body, by) {
  const q = normQuestion(body || {});
  if (id) {
    const ex = await get(`SELECT id FROM assess_questions WHERE id = ?`, [Number(id)]);
    // (the image is kept; it is set or removed through setQuestionImage)
    if (!ex) throw httpError(404, 'Question not found');
    await run(`UPDATE assess_questions SET type=?, prompt=?, options_json=?, answer_json=?, explanation=?, tags=?, difficulty=?, status=?, source=COALESCE(?, source), module=?, sub_module=?, updated_at=datetime('now') WHERE id=?`,
      [q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.explanation, q.tags, q.difficulty, q.status, q.source, q.module, q.subModule, ex.id]);
    return ex.id;
  }
  const r = await run(`INSERT INTO assess_questions (type, prompt, options_json, answer_json, explanation, tags, difficulty, status, created_by, source, module, sub_module) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.explanation, q.tags, q.difficulty, q.status, lc(by), q.source, q.module, q.subModule]);
  return r.lastID;
}
async function setQuestionImage(id, buf, type) {
  const q = await get(`SELECT id FROM assess_questions WHERE id = ?`, [Number(id)]);
  if (!q) throw httpError(404, 'Question not found');
  if (!buf) { await run(`UPDATE assess_questions SET image = NULL, image_type = NULL WHERE id = ?`, [q.id]); return; }
  if (!/^image\/(png|jpeg|webp)$/.test(type || '')) throw httpError(400, 'Use a PNG, JPG or WebP image');
  if (buf.length > 2 * 1024 * 1024) throw httpError(413, 'Images must be under 2 MB');
  await run(`UPDATE assess_questions SET image = ?, image_type = ?, updated_at = datetime('now') WHERE id = ?`, [buf, type, q.id]);
}
async function questionImage(id) { return get(`SELECT image, image_type FROM assess_questions WHERE id = ?`, [Number(id)]); }

/** Used questions are retired rather than deleted, so past results keep
 *  their wording and answer key. */
async function deleteQuestion(id) {
  const used = await get(`SELECT 1 FROM assess_answers WHERE question_id = ? LIMIT 1`, [Number(id)]);
  if (used) { await run(`UPDATE assess_questions SET status='retired', updated_at=datetime('now') WHERE id=?`, [Number(id)]); return 'retired'; }
  await run(`DELETE FROM assess_questions WHERE id = ?`, [Number(id)]);
  const tests = await all(`SELECT id, question_ids_json FROM assess_tests`);
  for (const t of tests) {
    const ids = j(t.question_ids_json, []).map(Number);
    if (ids.includes(Number(id))) await run(`UPDATE assess_tests SET question_ids_json = ? WHERE id = ?`, [JSON.stringify(ids.filter(x => x !== Number(id))), t.id]);
  }
  return 'deleted';
}
async function bulkQuestions(ids, action) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean).slice(0, 500);
  let n = 0;
  for (const id of list) {
    if (action === 'approve') await run(`UPDATE assess_questions SET status='approved', updated_at=datetime('now') WHERE id=?`, [id]);
    else if (action === 'draft') await run(`UPDATE assess_questions SET status='draft', updated_at=datetime('now') WHERE id=?`, [id]);
    else if (action === 'delete') await deleteQuestion(id);
    else continue;
    n++;
  }
  return n;
}

/** CSV import. Columns (header row required, any order):
 *  type, question, option1..option8, correct (letters like "B" or "A,C"),
 *  tags, difficulty, explanation. Imported as drafts. */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
async function importCsv(text, by, sourceName) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw httpError(400, 'The file needs a header row and at least one question');
  const head = rows[0].map(h => lc(h).replace(/\s+/g, ''));
  const col = (name) => head.indexOf(name);
  const qi = col('question') >= 0 ? col('question') : col('prompt');
  if (qi < 0 || col('correct') < 0) throw httpError(400, 'Columns "question" and "correct" are required');
  const out = { imported: 0, errors: [] };
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const options = []; for (let k = 1; k <= 8; k++) { const ci = col('option' + k); if (ci >= 0) options.push(row[ci] || ''); }
    const letters = String(row[col('correct')] || '').toUpperCase().split(/[\s,;|]+/).filter(Boolean);
    let type = lc(row[col('type')] || '');
    if (!QUESTION_TYPES.has(type)) type = letters.length > 1 ? 'multi' : (options.filter(Boolean).length === 2 && /^true$/i.test(options[0]) ? 'truefalse' : 'single');
    let correct = type === 'truefalse' ? letters.map(l => (l === 'T' || l === 'TRUE' || l === 'A') ? 0 : 1) : letters.map(l => l.charCodeAt(0) - 65);
    if (type === 'ordering' && letters.length) {
      // "correct" lists the options in the right order, e.g. C,A,B
      const ordered = letters.map(l => options[l.charCodeAt(0) - 65]).filter(Boolean);
      options.length = 0; ordered.forEach(o => options.push(o)); correct = [];
    }
    try {
      await saveQuestion(null, { type, prompt: row[qi], options, correct, tags: col('tags') >= 0 ? row[col('tags')] : '', difficulty: col('difficulty') >= 0 ? lc(row[col('difficulty')]) : 'medium', explanation: col('explanation') >= 0 ? row[col('explanation')] : '', status: 'draft', source: sourceName ? `CSV: ${sourceName}` : 'CSV import' }, by);
      out.imported++;
    } catch (e) { out.errors.push(`Row ${r + 1}: ${e.message}`); }
  }
  return out;
}

/** Drafts questions from a document with AI. Everything lands as a draft
 *  for a reviewer to edit and approve. */
/** Session 64: the AI question writer on its own, so AI Studio can keep
 *  drafts outside the bank until the reviewer is happy with them. */
async function aiWriteQuestions({ text, count, types, focus, difficulty, sourceName, ai, avoid }) {
  if (!ai || !(ai.anyConfigured ? ai.anyConfigured() : ai.isConfigured())) throw httpError(503, 'AI is not configured on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY).');
  const body = clean(text, 60000).replace(/\s+\n/g, '\n').trim();
  if (body.length < 120) throw httpError(400, 'There is not enough text here to write questions from.');
  const n = Math.min(25, Math.max(1, Math.round(Number(count) || 10)));
  const allowed = (Array.isArray(types) && types.length ? types : ['single', 'multi', 'truefalse']).filter(t => QUESTION_TYPES.has(t));
  if (!allowed.length) throw httpError(400, 'Pick at least one question type');
  const diff = DIFFICULTIES.has(difficulty) ? difficulty : 'mixed';
  const system = [
    'You write assessment questions for customer support agents at a dental and healthcare software company.',
    'Use ONLY facts stated in the source document. Never invent policies, numbers, team names or timelines.',
    'Prefer scenario and judgement questions ("A customer says X. What do you do first?") that test whether the agent knows the internal process, owners, escalation paths, time limits and edge cases in the document, over definitions that anyone could look up.',
    'Wrong options must be plausible mistakes a new agent could make. Do not use "All of the above", "None of the above", jokes, or options that give the answer away by length or wording.',
    'Keep each question under 45 words and each option under 20 words. Plain, clear English.',
    'Return JSON: {"questions":[{"type":"single|multi|truefalse","prompt":"...","options":["..."],"correct":[index,...],"explanation":"one or two sentences citing the document","tags":["topic"],"difficulty":"easy|medium|hard"}]}.',
    'single: 4 options, exactly one correct. multi: 4 or 5 options, two or more correct. truefalse: options ["True","False"].',
    'ordering: "options" are 3 to 6 steps listed in the CORRECT order, "correct": []. Use only for real sequences in the document (for example escalation or troubleshooting steps).',
    'matching: "pairs": [["item","its match"], ...] with 3 to 5 pairs (for example issue to owning team), "correct": [].',
  ].join('\n');
  const user = [
    `Write ${n} questions. Allowed types: ${allowed.join(', ')}. Difficulty: ${diff}.`,
    focus ? `Focus on: ${clean(focus, 600)}` : '',
    Array.isArray(avoid) && avoid.length ? `Do not repeat these existing questions:\n${avoid.slice(0, 40).map(x => '- ' + clean(x, 200)).join('\n')}` : '',
    `Source document${sourceName ? ` (${clean(sourceName, 120)})` : ''}:\n"""\n${body}\n"""`,
  ].filter(Boolean).join('\n\n');
  const r = ai.bestJSON ? await ai.bestJSON({ system, user, maxTokens: 8000, timeoutMs: 150000 })
    : await ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens: 6000, temperature: 0.4, timeoutMs: 90000 });
  const list = (r.json && Array.isArray(r.json.questions)) ? r.json.questions : [];
  const out = [];
  for (const q of list.slice(0, n)) {
    if (!allowed.includes(q.type)) q.type = allowed[0];
    if (q.type === 'matching' && Array.isArray(q.pairs)) q.options = q.pairs.map(p => ({ text: p[0], match: p[1] }));
    out.push(q);
  }
  return { questions: out, provider: r.provider || 'openai' };
}
async function generateFromText({ text, count, types, focus, difficulty, sourceName, by, ai }) {
  const n = Math.min(25, Math.max(1, Math.round(Number(count) || 10)));
  const allowed = (Array.isArray(types) && types.length ? types : ['single', 'multi', 'truefalse']).filter(t => QUESTION_TYPES.has(t));
  const r = await aiWriteQuestions({ text, count: n, types: allowed, focus, difficulty, sourceName, ai });
  const list = r.questions;
  const ids = [], errors = [];
  for (const q of list.slice(0, n)) {
    try {
      if (!allowed.includes(q.type)) q.type = allowed[0];
      if (q.type === 'matching' && Array.isArray(q.pairs)) q.options = q.pairs.map(p => ({ text: p[0], match: p[1] }));
      ids.push(await saveQuestion(null, { ...q, status: 'draft', source: sourceName ? `AI draft: ${clean(sourceName, 120)}` : 'AI draft' }, by));
    } catch (e) { errors.push(e.message); }
  }
  if (!ids.length) throw httpError(502, 'The AI did not return usable questions. Try again, or narrow the focus.');
  let tagged = 0; try { tagged = (await classifyQuestions(ids, ai)).tagged; } catch (e) { /* tagging is best effort */ }
  return { created: ids.length, ids, errors, tagged, provider: r.provider || 'openai' };
}

/** Suggests a mark for a written answer. The reviewer still decides. */
async function suggestMark({ attemptId, idx, ai }) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const d = await adminAttemptDetail(attemptId, OWNER_EMAIL);
  const it = d.items.find(x => x.idx === Number(idx) && x.kind === 'explain');
  if (!it) throw httpError(404, 'Written answer not found');
  if (!it.text || !it.text.trim()) return { mark: '0', label: 'Weak', reason: 'No answer was written.' };
  const ref = d.items.find(x => x.idx === it.refIdx) || {};
  const system = 'You help a support team lead mark short written answers from customer support agents. Judge only understanding of the process, not grammar. Be fair and brief. Return JSON {"mark":"strong|partial|weak","reason":"one or two sentences"}.';
  const lines = [
    'Question: ' + (ref.prompt || it.about),
    'Correct answer: ' + (ref.correctAnswer || []).join(' | '),
    ref.explanation ? 'Why it is correct: ' + ref.explanation : '',
    'The agent picked: ' + ((ref.chosen || []).join(' | ') || 'nothing'),
    'The agent was asked to explain why the right answer is right and what they would do next.',
    'Agent explanation (between the markers):',
    '<<<', clean(it.text, 3000), '>>>',
  ].filter(Boolean);
  const r = await ai.bestJSON({ system, user: lines.join('\n'), maxTokens: 1500, timeoutMs: 60000 });
  const m = String((r.json && r.json.mark) || '').toLowerCase();
  const map = { strong: ['1', 'Strong'], partial: ['0.5', 'Partial'], weak: ['0', 'Weak'] };
  const pick = map[m] || map.partial;
  return { mark: pick[0], label: pick[1], reason: clean(r.json && r.json.reason, 400), provider: r.provider };
}

// ── Tests (reviewer) ──────────────────────────────────────────────────
async function adminTests() {
  const tests = await all(`SELECT * FROM assess_tests WHERE status != 'archived' ORDER BY id DESC`);
  const out = [];
  for (const t of tests) {
    const st = await get(`SELECT COUNT(*) AS n, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS done,
      AVG(CASE WHEN status='submitted' AND max_score > 0 THEN score * 100.0 / max_score END) AS avg_pct FROM assess_attempts WHERE test_id = ?`, [t.id]);
    const s = normSettings(j(t.settings_json, {}));
    out.push({ id: t.id, title: t.title, description: t.description || '', status: t.status, modules: MODS.resolve(s.modules), questionIds: j(t.question_ids_json, []),
      settings: s, assign: normAssign(j(t.assign_json, {})), attempts: st.n || 0, submitted: st.done || 0,
      avgPct: st.avg_pct != null ? Math.round(st.avg_pct) : null, poolSize: s.pool.mode === 'random' ? await poolSize(s.pool) : null, updatedAt: t.updated_at });
  }
  return out;
}
async function poolQuestions(pool) {
  const where = [`status = 'approved'`], p = [];
  if (pool.tags && pool.tags.length) { where.push('(' + pool.tags.map(() => `(',' || tags || ',') LIKE ?`).join(' OR ') + ')'); pool.tags.forEach(t => p.push(`%,${t},%`)); }
  if (pool.difficulty) { where.push('difficulty = ?'); p.push(pool.difficulty); }
  const limit = await exposureLimit();
  if (limit) { where.push(`(SELECT COUNT(*) FROM assess_answers x WHERE x.question_id = assess_questions.id AND x.kind = 'q') < ?`); p.push(limit); }
  return all(`SELECT id FROM assess_questions WHERE ${where.join(' AND ')}`, p);
}
async function poolSize(pool) { return (await poolQuestions(pool)).length; }

async function saveTest(id, body, by) {
  const b = body || {};
  const t = id ? await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(id)]) : null;
  if (id && !t) throw httpError(404, 'Assessment not found');
  const title = b.title != null ? clean(b.title, 160).trim() : (t ? t.title : '');
  if (!title) throw httpError(400, 'Give the assessment a title');
  const description = b.description != null ? clean(b.description, 1000) : (t ? t.description : '');
  const settings = normSettings({ ...(t ? j(t.settings_json, {}) : {}), ...(b.settings || {}), pool: { ...((t && j(t.settings_json, {}).pool) || {}), ...((b.settings && b.settings.pool) || {}) } });
  const assign = b.assign ? normAssign(b.assign) : (t ? normAssign(j(t.assign_json, {})) : { everyone: false, emails: [] });
  let qids = b.questionIds != null ? Array.from(new Set((b.questionIds || []).map(Number).filter(Boolean))).slice(0, 200) : (t ? j(t.question_ids_json, []) : []);
  const status = ['published', 'draft'].includes(b.status) ? b.status : (t ? t.status : 'draft');
  if (status === 'published') {
    const n = settings.pool.mode === 'random' ? await poolSize(settings.pool) : qids.length;
    if (!n) throw httpError(400, settings.pool.mode === 'random' ? 'No approved questions match this pool yet' : 'Add at least one question before publishing');
  }
  if (t) {
    await run(`UPDATE assess_tests SET title=?, description=?, question_ids_json=?, settings_json=?, assign_json=?, status=?, updated_at=datetime('now') WHERE id=?`,
      [title, description, JSON.stringify(qids), JSON.stringify(settings), JSON.stringify(assign), status, t.id]);
    if (t.status !== 'published' && status === 'published') await autoAnnounce(t.id, settings);
    return t.id;
  }
  const r = await run(`INSERT INTO assess_tests (title, description, question_ids_json, settings_json, assign_json, status, created_by) VALUES (?,?,?,?,?,?,?)`,
    [title, description, JSON.stringify(qids), JSON.stringify(settings), JSON.stringify(assign), status, lc(by)]);
  if (status === 'published') await autoAnnounce(r.lastID, settings);
  return r.lastID;
}
async function autoAnnounce(id, settings) {
  if (settings.repeat && settings.repeat.mode !== 'none') return;
  const cfg = await chatConfig();
  if (!cfg.webhook || !cfg.announceOnPublish) return;
  if (await getConfig(`announce:${id}:last`, '')) return; // once per assessment
  announceTest(id, 'announce').catch(e => console.warn('assess announce:', e.message));
}
async function archiveTest(id) {
  // Session 64: always archive; permanent delete is a separate step from Archived
  await run(`UPDATE assess_tests SET status='archived', updated_at=datetime('now') WHERE id=?`, [Number(id)]);
}
async function testQuestions(id) {
  const t = await get(`SELECT question_ids_json FROM assess_tests WHERE id = ?`, [Number(id)]);
  if (!t) throw httpError(404, 'Assessment not found');
  const ids = j(t.question_ids_json, []).map(Number);
  if (!ids.length) return [];
  const rows = await all(`SELECT id, type, prompt, status, tags, difficulty, module, sub_module FROM assess_questions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(i => byId.get(i)).filter(Boolean).map(r => ({ id: r.id, type: r.type, prompt: r.prompt, status: r.status, tags: r.tags ? r.tags.split(',').filter(Boolean) : [], difficulty: r.difficulty, module: r.module || '', subModule: r.sub_module || '' }));
}

// ── Taker side ────────────────────────────────────────────────────────
function assignedTo(test, email) {
  const a = j(test.assign_json, {});
  return !!(a.everyone || (Array.isArray(a.emails) && a.emails.map(lc).includes(lc(email))));
}
async function extraPctFor(email) { const r = await get(`SELECT pct FROM assess_extra_time WHERE email = ?`, [lc(email)]); return r ? r.pct : 0; }
function withExtra(sec, pct) { return Math.round(sec * (1 + (pct || 0) / 100)); }

async function myTests(email) {
  await autoSubmitAbandoned().catch(() => 0); // so an expired attempt never shows as "Resume"
  const tests = await all(`SELECT * FROM assess_tests WHERE status = 'published' ORDER BY id DESC`);
  const extra = await extraPctFor(email);
  const out = [];
  for (const t of tests) {
    if (!assignedTo(t, email)) continue;
    const s = normSettings(j(t.settings_json, {}));
    if (s.repeat.mode !== 'none') continue; // repeat templates are never taken directly
    const atts = await all(`SELECT id, status, score, max_score, finished_at FROM assess_attempts WHERE test_id = ? AND email = ? AND status != 'reset' ORDER BY id`, [t.id, lc(email)]);
    const stopped = atts.find(a => a.status === 'stopped');
    const done = atts.filter(a => a.status !== 'in_progress' && a.status !== 'stopped');
    const open = atts.find(a => a.status === 'in_progress');
    const last = done[done.length - 1];
    const nQ = s.pool.mode === 'random' ? Math.min(s.pool.count, await poolSize(s.pool)) : j(t.question_ids_json, []).length;
    const sec = withExtra(s.secondsPerQuestion, extra);
    const now = Date.now();
    const windowState = s.opensAt && now < Date.parse(s.opensAt) ? 'upcoming' : (s.closesAt && now > Date.parse(s.closesAt) ? 'closed' : 'open');
    out.push({
      opensAt: s.opensAt || null, closesAt: s.closesAt || null, windowState,
      releaseMode: s.releaseMode, lastAttemptId: last ? last.id : null, abandonGraceMin: ABANDON_GRACE_MIN,
      autoSubmitAt: open ? new Date(autoSubmitAt(await get(`SELECT * FROM assess_attempts WHERE id = ?`, [open.id]), s)).toISOString() : null,
      id: t.id, title: t.title, description: t.description || '', modules: MODS.resolve(s.modules), prep: s.prep,
      questions: nQ, secondsPerQuestion: sec, explainCount: Math.min(s.explainCount, nQ), extraPct: extra,
      estMinutes: Math.max(1, Math.ceil((nQ * sec + Math.min(s.explainCount, nQ) * withExtra(EXPLAIN_SEC, extra)) / 60)),
      displayMode: s.displayMode, camera: s.camera, snapshotSec: s.snapshotSec, watermark: s.watermark, navigation: s.navigation,
      attemptsAllowed: s.attempts, attemptsUsed: atts.length, inProgress: !!open,
      stopped: !!stopped,
      canStart: !stopped && (!!open || (atts.length < s.attempts && windowState === 'open')),
      last: last ? { finishedAt: last.finished_at, score: (s.showScore || s.releaseMode !== 'none') ? last.score : null, maxScore: (s.showScore || s.releaseMode !== 'none') ? last.max_score : null } : null,
    });
  }
  return out;
}

function publicSettings(s, extra) {
  return { secondsPerQuestion: withExtra(s.secondsPerQuestion, extra), displayMode: s.displayMode, voice: s.voice, wordsPerChunk: s.wordsPerChunk, chunkMs: s.chunkMs,
    explainSeconds: withExtra(EXPLAIN_SEC, extra), watermark: s.watermark, camera: s.camera, snapshotSec: s.snapshotSec, navigation: s.navigation };
}

async function startAttempt({ testId, email, name, ua, cameraChecked }) {
  const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(testId)]);
  if (!t || t.status !== 'published' || !assignedTo(t, email)) throw httpError(403, 'This assessment is not assigned to you');
  const s = normSettings(j(t.settings_json, {}));
  if (s.repeat.mode !== 'none') throw httpError(403, 'This is a repeat template; take the dated copy instead');
  if (s.camera && !cameraChecked) throw httpError(400, 'This assessment needs your camera check first. Go back to the setup check, allow the camera and show your face.', 'camera_check');
  const stoppedRow = await get(`SELECT id FROM assess_attempts WHERE test_id = ? AND email = ? AND status = 'stopped' LIMIT 1`, [t.id, lc(email)]);
  if (stoppedRow) throw httpError(403, 'Your last attempt was stopped because the camera rules were not followed. Ask your reviewer to send you a retest.', 'stopped');
  const token = crypto.randomBytes(18).toString('hex');
  const open = await get(`SELECT * FROM assess_attempts WHERE test_id = ? AND email = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`, [t.id, lc(email)]);
  if (open && Date.now() >= autoSubmitAt(open, s)) { await autoSubmitAbandoned(); throw httpError(409, 'This attempt was not finished in time, so it was submitted automatically. Unanswered questions counted as missed.'); }
  if (open) {
    if (open.client_token) await logEvent(open.id, open.current_idx, 'resumed', 'Opened again; the earlier tab was closed off');
    await run(`UPDATE assess_attempts SET client_token = ? WHERE id = ?`, [token, open.id]);
    return { attemptId: open.id, token, resumed: true, title: t.title, settings: { ...publicSettings(s, open.extra_pct), navigation: open.nav_mode === 'bank' ? 'bank' : 'locked', plain: await plainFor(email) }, total: j(open.plan_json, []).length };
  }
  const used = await get(`SELECT COUNT(*) AS n FROM assess_attempts WHERE test_id = ? AND email = ? AND status != 'reset'`, [t.id, lc(email)]);
  if ((used && used.n) >= s.attempts) throw httpError(409, 'No attempts left on this assessment');
  if (s.opensAt && Date.now() < Date.parse(s.opensAt)) throw httpError(409, 'This assessment has not opened yet');
  if (s.closesAt && Date.now() > Date.parse(s.closesAt)) throw httpError(409, 'This assessment has closed');

  let qids;
  if (s.pool.mode === 'random') qids = shuffle((await poolQuestions(s.pool)).map(r => r.id)).slice(0, s.pool.count);
  else qids = j(t.question_ids_json, []).map(Number).filter(Boolean);
  const rows = qids.length ? await all(`SELECT id, type, options_json FROM assess_questions WHERE status != 'retired' AND id IN (${qids.map(() => '?').join(',')})`, qids) : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  qids = qids.filter(id => byId.has(id));
  if (!qids.length) throw httpError(409, 'This assessment has no questions yet');
  if (s.shuffleQuestions) qids = shuffle(qids);
  const plan = qids.map(id => {
    const opts = j(byId.get(id).options_json, []).map(o => o.id);
    const isM = byId.get(id).type === 'matching', isO = byId.get(id).type === 'ordering';
    const item = { kind: 'q', qid: id, opt: (s.shuffleOptions || isO) ? shuffle(opts) : opts };
    if (isM) item.rt = shuffle(opts);
    return item;
  });
  const nExplain = Math.min(s.explainCount, plan.length);
  const picks = shuffle(plan.map((_, i) => i)).slice(0, nExplain).sort((a, b) => a - b);
  for (const ref of picks) plan.push({ kind: 'explain', ref });
  const extra = await extraPctFor(email);
  const plainMode = await plainFor(email);
  const r = await run(`INSERT INTO assess_attempts (test_id, email, name, plan_json, client_token, ua, extra_pct, nav_mode) VALUES (?,?,?,?,?,?,?,?)`,
    [t.id, lc(email), clean(name, 120), JSON.stringify(plan), token, clean(ua, 300), extra, s.navigation]);
  await logEvent(r.lastID, 0, 'started', extra ? `Extra time +${extra}%` : null);
  return { attemptId: r.lastID, token, resumed: false, title: t.title, settings: { ...publicSettings(s, extra), plain: plainMode }, total: plan.length };
}

async function loadOwnedAttempt(attemptId, email, token) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a || lc(a.email) !== lc(email)) throw httpError(404, 'Attempt not found');
  if (a.status !== 'in_progress') throw httpError(409, 'This attempt is already submitted', 'finished');
  if (!token || token !== a.client_token) throw httpError(409, 'This assessment is open in another tab or window. Continue there, or start it again here to move it to this tab.', 'elsewhere');
  return a;
}
function secondsFor(item, s, extra) { return withExtra(item.kind === 'explain' ? EXPLAIN_SEC : s.secondsPerQuestion, extra); }

async function expireOverdue(a, s, plan) {
  let idx = a.current_idx, servedAt = a.current_served_at, changed = false;
  while (idx < plan.length && servedAt) {
    const deadline = Date.parse(servedAt) + secondsFor(plan[idx], s, a.extra_pct) * 1000 + GRACE_MS;
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
/** Session 61: when an unfinished attempt is submitted automatically:
 *  start time + the time for every item + 30 minutes, or when the test
 *  closes, whichever is first. */
function autoSubmitAt(a, s) {
  const plan = j(a.plan_json, []);
  const totalSec = plan.reduce((t, it) => t + secondsFor(it, s, a.extra_pct), 0);
  const started = Date.parse(String(a.started_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(a.started_at) ? '' : 'Z'));
  let at = started + totalSec * 1000 + ABANDON_GRACE_MIN * 60000;
  if (s.closesAt) at = Math.min(at, Date.parse(s.closesAt));
  return at;
}
/** The browser reports that the camera rules were broken for too long: the
 *  attempt ends, keeps its answers as a draft (never scored) and waits for a
 *  reviewer to send a retest. */
async function stopAttempt({ attemptId, email, token, reason }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  if (!s.camera) throw httpError(400, 'This assessment does not use the camera');
  await run(`UPDATE assess_attempts SET status = 'stopped', finished_at = ?, client_token = NULL WHERE id = ?`, [nowIso(), a.id]);
  await logEvent(a.id, a.current_idx, 'camera_stop', clean(reason, 200) || 'Camera rules were not followed');
  return { stopped: true };
}
async function autoSubmitAbandoned() {
  const rows = await all(`SELECT * FROM assess_attempts WHERE status = 'in_progress'`);
  let n = 0;
  for (const a of rows) {
    const s = await testSettingsFor(a);
    if (Date.now() < autoSubmitAt(a, s)) continue;
    const plan = j(a.plan_json, []);
    if (a.nav_mode === 'bank') {
      const nav = await bankNav(a, s, plan);
      await bankFinishNow(a, s, plan, null);
      await logEvent(a.id, null, 'auto_submit', `Not finished in time; submitted automatically with ${nav.filter(x => !x.answered).length} unanswered item(s)`);
      n++;
      continue;
    }
    for (let idx = a.current_idx; idx < plan.length; idx++) {
      const it = plan[idx];
      await run(`INSERT OR IGNORE INTO assess_answers (attempt_id, idx, kind, question_id, ref_idx, response_json, correct, served_at, answered_at, elapsed_ms, late)
                 VALUES (?,?,?,?,?,?,?,?,?,?,1)`, [a.id, idx, it.kind, it.qid || null, it.ref ?? null, null, it.kind === 'q' ? 0 : null, idx === a.current_idx ? a.current_served_at : null, null, null]);
    }
    await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = NULL WHERE id = ?`, [plan.length, a.id]);
    await logEvent(a.id, a.current_idx, 'auto_submit', `Not finished in time; submitted automatically, ${plan.length - a.current_idx} unanswered item(s) counted as missed`);
    await finish(a.id);
    n++;
  }
  return n;
}
async function testSettingsFor(a) {
  const t = await get(`SELECT settings_json FROM assess_tests WHERE id = ?`, [a.test_id]);
  return normSettings(j(t && t.settings_json, {}));
}

async function current({ attemptId, email, token }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  const plan = j(a.plan_json, []);
  if (a.nav_mode === 'bank') return bankCurrent(a, s, plan);
  await expireOverdue(a, s, plan);
  if (a.current_idx >= plan.length) return { done: true, result: await finish(a.id) };
  const item = plan[a.current_idx];
  if (!a.current_served_at) {
    a.current_served_at = nowIso();
    await run(`UPDATE assess_attempts SET current_served_at = ? WHERE id = ?`, [a.current_served_at, a.id]);
  } else {
    await logEvent(a.id, a.current_idx, 'reserved', 'The same question was loaded again (reload); the timer kept running');
  }
  const secs = secondsFor(item, s, a.extra_pct);
  const leftMs = Math.max(0, Date.parse(a.current_served_at) + secs * 1000 - Date.now());
  return itemPayload(a, s, plan, a.current_idx, secs, leftMs);
}
async function itemPayload(a, s, plan, idx, secs, leftMs) {
  const item = plan[idx];
  const qCount = plan.filter(p => p.kind === 'q').length;
  const base = { done: false, idx, total: plan.length, qCount, seconds: secs, leftMs, kind: item.kind };
  if (item.kind === 'explain') {
    const refItem = plan[item.ref];
    const q = await get(`SELECT prompt FROM assess_questions WHERE id = ?`, [refItem.qid]);
    const aud = s.displayMode === 'audio' && !(await plainFor(a.email));
    return { ...base, type: 'explain', audio: aud, about: aud ? null : clean(q && q.prompt, 600), prompt: 'In your own words, explain why the right answer is right, and what you would do next with the customer.' };
  }
  const q = await get(`SELECT id, type, prompt, options_json, image_type FROM assess_questions WHERE id = ?`, [item.qid]);
  const optList = j(q.options_json, []);
  const opts = new Map(optList.map(o => [o.id, o.text]));
  const audio = s.displayMode === 'audio' && !(await plainFor(a.email));
  const out = { ...base, type: q.type, audio, prompt: audio ? null : q.prompt, hasImage: !!q.image_type, options: item.opt.map((oid, i) => ({ key: i, text: opts.get(oid) || '' })) };
  if (q.type === 'matching') {
    const mt = new Map(optList.map(o => [o.id, o.match]));
    out.matches = (item.rt || item.opt).map((oid, i) => ({ key: i, text: mt.get(oid) || '' }));
  }
  return out;
}

/** Session 58: read-aloud mode. The question text never goes to the
 *  browser, only an MP3 of it, and only for the question the agent is on
 *  right now. Audio is generated once per question and voice, then cached
 *  (regenerated if the wording changes). */
async function textToSpeechCached(qid, text, voice, ai) {
  const hash = crypto.createHash('sha1').update(text).digest('hex');
  const hit = await get(`SELECT mp3 FROM assess_audio WHERE question_id = ? AND voice = ? AND text_hash = ?`, [qid, voice, hash]);
  if (hit && hit.mp3) return hit.mp3;
  if (!ai || !ai.isConfigured()) throw httpError(503, 'Read-aloud is not available right now (voice service not configured).');
  const mp3 = await ai.speech({ input: text, voice });
  await run(`INSERT INTO assess_audio (question_id, voice, text_hash, mp3) VALUES (?,?,?,?)
             ON CONFLICT(question_id, voice) DO UPDATE SET text_hash = excluded.text_hash, mp3 = excluded.mp3, created_at = datetime('now')`, [qid, voice, hash, mp3]);
  return mp3;
}
async function currentImage({ attemptId, email, token }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const item = j(a.plan_json, [])[a.current_idx];
  if (!item || item.kind !== 'q' || !a.current_served_at) throw httpError(409, 'No question is open');
  const r = await questionImage(item.qid);
  if (!r || !r.image) throw httpError(404, 'No image');
  return r;
}
async function currentAudio({ attemptId, email, token, ai }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  const plan = j(a.plan_json, []);
  let item = plan[a.current_idx];
  if (!item || !a.current_served_at) throw httpError(409, 'No question is open');
  if (item.kind === 'explain') item = plan[item.ref]; // the question being explained
  const q = await get(`SELECT id, prompt FROM assess_questions WHERE id = ?`, [item.qid]);
  return textToSpeechCached(q.id, q.prompt, s.voice, ai);
}
async function previewSpeech({ text, voice, ai }) {
  if (!ai || !ai.isConfigured()) throw httpError(503, 'The voice service is not configured on the server (OPENAI_API_KEY).');
  return ai.speech({ input: clean(text, 400) || 'This is how questions will sound.', voice });
}

function grade(qType, answerIds, chosenIds) {
  if (qType === 'ordering') { const w = (answerIds || []).map(Number), g = (chosenIds || []).map(Number); return w.length === g.length && w.every((x, i) => x === g[i]) ? 1 : 0; }
  const want = new Set((answerIds || []).map(Number));
  const got = new Set((chosenIds || []).map(Number));
  if (qType === 'multi') return want.size === got.size && [...want].every(x => got.has(x)) ? 1 : 0;
  return got.size === 1 && want.has([...got][0]) ? 1 : 0;
}

async function answer({ attemptId, email, token, idx, choice, text, replays, go, flag }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  const plan = j(a.plan_json, []);
  if (a.nav_mode === 'bank') return bankAnswer(a, s, plan, { idx, choice, text, replays, go, flag });
  await expireOverdue(a, s, plan);
  if (Number(idx) !== a.current_idx) throw httpError(409, 'That question has already closed', 'moved');
  if (!a.current_served_at) throw httpError(409, 'Question was not served');
  const item = plan[a.current_idx];
  const elapsed = Date.now() - Date.parse(a.current_served_at);
  const late = elapsed > secondsFor(item, s, a.extra_pct) * 1000 + GRACE_MS ? 1 : 0;
  let { response, correct } = await buildResponse(item, choice, text);
  if (late && item.kind === 'q') correct = 0;
  await run(`INSERT OR REPLACE INTO assess_answers (attempt_id, idx, kind, question_id, ref_idx, response_json, correct, served_at, answered_at, elapsed_ms, late, replays)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [a.id, a.current_idx, item.kind, item.qid || null, item.ref ?? null, JSON.stringify(response), correct, a.current_served_at, nowIso(), elapsed, late, Math.max(0, Math.min(99, Number(replays) || 0))]);
  const next = a.current_idx + 1;
  await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = NULL WHERE id = ?`, [next, a.id]);
  if (next >= plan.length) return { done: true, result: await finish(a.id) };
  return { done: false };
}

/** Turn what the browser sent (keys in the order shown) into stored ids,
 *  and grade it. Session 62: shared by locked and time-bank modes. */
async function buildResponse(item, choice, text) {
  if (item.kind !== 'q') return { response: { text: clean(text, 4000) }, correct: null };
  const q = await get(`SELECT type, answer_json FROM assess_questions WHERE id = ?`, [item.qid]);
  if (q.type === 'matching') {
    // choice[i] = key of the match picked for the i-th item as shown
    const rt = item.rt || item.opt;
    const arr = Array.isArray(choice) ? choice : [];
    const pairs = {};
    item.opt.forEach((leftId, i) => { const k = Number(arr[i]); if (Number.isInteger(k) && k >= 0 && k < rt.length) pairs[leftId] = rt[k]; });
    return { response: { pairs }, correct: item.opt.every(leftId => pairs[leftId] === leftId) ? 1 : 0 };
  }
  const keys = (Array.isArray(choice) ? choice : [choice]).map(Number).filter(k => Number.isInteger(k) && k >= 0 && k < item.opt.length);
  const chosenIds = Array.from(new Set(keys)).map(k => item.opt[k]);
  return { response: { chosen: chosenIds }, correct: grade(q.type, j(q.answer_json, []), chosenIds) };
}
/** Stored response back to what the page needs to show the selection. */
function draftFor(item, resp) {
  if (!resp) return null;
  if (item.kind !== 'q') return { text: resp.text || '' };
  if (resp.pairs) { const rt = item.rt || item.opt; return { choice: item.opt.map(leftId => resp.pairs[leftId] != null ? rt.indexOf(resp.pairs[leftId]) : -1) }; }
  return { choice: (resp.chosen || []).map(id => item.opt.indexOf(id)).filter(k => k >= 0) };
}
function hasAnswer(resp) {
  if (!resp) return false;
  if (resp.text != null) return !!String(resp.text).trim();
  if (resp.pairs) return Object.keys(resp.pairs).length > 0;
  return Array.isArray(resp.chosen) && resp.chosen.length > 0;
}

// ── Session 62: time-bank navigation ──────────────────────────────────
// Every item keeps its own clock (the same seconds as before). The clock
// only runs while that item is open, so an agent can go back and change
// an answer while the item still has time left. Answers are saved as
// they change; nothing is final until the agent submits the whole test
// from the review screen, or every item runs out of time.
const allowedMsFor = (item, s, a) => secondsFor(item, s, a.extra_pct) * 1000;
async function bankRows(a) {
  const rows = await all(`SELECT idx, response_json, used_ms, visits, flagged FROM assess_answers WHERE attempt_id = ?`, [a.id]);
  return new Map(rows.map(r => [r.idx, r]));
}
async function ensureRow(a, idx, item) {
  await run(`INSERT OR IGNORE INTO assess_answers (attempt_id, idx, kind, question_id, ref_idx, response_json, correct, served_at, used_ms, visits)
             VALUES (?,?,?,?,?,NULL,?,?,0,0)`, [a.id, idx, item.kind, item.qid || null, item.ref ?? null, item.kind === 'q' ? 0 : null, nowIso()]);
}
/** Stop the clock on the open item and add the time to its bank. */
async function bankClose(a, s, plan) {
  if (!a.current_served_at || a.current_idx >= plan.length) return;
  const idx = a.current_idx, item = plan[idx];
  await ensureRow(a, idx, item);
  const row = await get(`SELECT used_ms FROM assess_answers WHERE attempt_id = ? AND idx = ?`, [a.id, idx]);
  const used = Math.min(allowedMsFor(item, s, a), (row.used_ms || 0) + Math.max(0, Date.now() - Date.parse(a.current_served_at)));
  await run(`UPDATE assess_answers SET used_ms = ?, elapsed_ms = ? WHERE attempt_id = ? AND idx = ?`, [used, used, a.id, idx]);
  await run(`UPDATE assess_attempts SET current_served_at = NULL WHERE id = ?`, [a.id]);
  a.current_served_at = null;
}
function bankLeft(item, s, a, row, openSince) {
  const run_ = openSince ? Math.max(0, Date.now() - Date.parse(openSince)) : 0;
  return allowedMsFor(item, s, a) - ((row && row.used_ms) || 0) - run_;
}
/** Close the open item if its time is used up (plus the network grace). */
async function bankExpire(a, s, plan) {
  if (!a.current_served_at || a.current_idx >= plan.length) return false;
  const rows = await bankRows(a);
  if (bankLeft(plan[a.current_idx], s, a, rows.get(a.current_idx), a.current_served_at) > -GRACE_MS) return false;
  await bankClose(a, s, plan);
  await logEvent(a.id, a.current_idx, 'timeout', 'Time used up on this item');
  return true;
}
async function bankNav(a, s, plan) {
  const rows = await bankRows(a);
  return plan.map((it, i) => {
    const r = rows.get(i);
    const left = bankLeft(it, s, a, r, i === a.current_idx ? a.current_served_at : null);
    return { idx: i, kind: it.kind, answered: hasAnswer(j(r && r.response_json, null)), flagged: !!(r && r.flagged), out: left < 1000, leftMs: Math.max(0, Math.round(left)), seen: !!r };
  });
}
function nextOpen(nav, from, wrap) {
  for (let i = from + 1; i < nav.length; i++) if (!nav[i].out) return i;
  if (wrap) for (let i = 0; i <= Math.min(from, nav.length - 1); i++) if (!nav[i].out) return i;
  return -1;
}
async function bankOpen(a, idx) {
  a.current_idx = idx; a.current_served_at = nowIso(); a.bank_review = 0;
  await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = ?, bank_review = 0 WHERE id = ?`, [idx, a.current_served_at, a.id]);
  await run(`UPDATE assess_answers SET visits = visits + 1 WHERE attempt_id = ? AND idx = ?`, [a.id, idx]);
}
async function bankToReview(a) {
  a.bank_review = 1;
  await run(`UPDATE assess_attempts SET bank_review = 1, current_served_at = NULL WHERE id = ?`, [a.id]);
}
async function bankCurrent(a, s, plan) {
  if (a.current_idx >= plan.length) return { done: true, result: await finish(a.id) };
  await bankExpire(a, s, plan);
  let nav = await bankNav(a, s, plan);
  if (nav.every(n => n.out)) return { done: true, result: await bankFinishNow(a, s, plan, 'Every item ran out of time') };
  if (a.bank_review) return reviewPayload(a, s, plan, nav);
  if (!a.current_served_at) {
    let idx = a.current_idx;
    if (nav[idx] && nav[idx].out) idx = nextOpen(nav, idx, true);
    if (idx < 0) { await bankToReview(a); return reviewPayload(a, s, plan, await bankNav(a, s, plan)); }
    await ensureRow(a, idx, plan[idx]);
    await bankOpen(a, idx);
    nav = await bankNav(a, s, plan);
  } else {
    await logEvent(a.id, a.current_idx, 'reserved', 'The same question was loaded again (reload); its clock kept running');
  }
  const it = plan[a.current_idx];
  const row = (await bankRows(a)).get(a.current_idx);
  const payload = await itemPayload(a, s, plan, a.current_idx, secondsFor(it, s, a.extra_pct), nav[a.current_idx].leftMs);
  return { ...payload, bank: true, nav, draft: draftFor(it, j(row && row.response_json, null)), flagged: !!(row && row.flagged), visits: row ? row.visits : 1 };
}
function reviewPayload(a, s, plan, nav) {
  const qCount = plan.filter(p => p.kind === 'q').length;
  return { done: false, bank: true, review: true, total: plan.length, qCount, nav,
    leftMs: nav.reduce((t, n) => t + n.leftMs, 0) };
}
async function bankAnswer(a, s, plan, { idx, choice, text, replays, go, flag }) {
  if (a.current_idx >= plan.length) return { done: true, result: await finish(a.id) };
  const expired = await bankExpire(a, s, plan);
  const onItem = !a.bank_review && a.current_served_at && Number(idx) === a.current_idx;
  if (!expired && onItem) {
    const item = plan[a.current_idx];
    await ensureRow(a, a.current_idx, item);
    const hasChoice = item.kind !== 'q' || (Array.isArray(choice) ? choice.length : choice != null);
    const built = hasChoice ? await buildResponse(item, choice, text) : { response: null, correct: item.kind === 'q' ? 0 : null };
    const sets = ['response_json = ?', 'correct = ?', 'answered_at = ?', 'replays = MAX(COALESCE(replays,0), ?)'];
    const vals = [built.response ? JSON.stringify(built.response) : null, built.correct, nowIso(), Math.max(0, Math.min(99, Number(replays) || 0))];
    if (typeof flag === 'boolean') { sets.push('flagged = ?'); vals.push(flag ? 1 : 0); }
    await run(`UPDATE assess_answers SET ${sets.join(', ')} WHERE attempt_id = ? AND idx = ?`, [...vals, a.id, a.current_idx]);
  } else if (!expired && !a.bank_review && Number(idx) !== a.current_idx && go === 'stay') {
    throw httpError(409, 'That question is no longer open', 'moved');
  }
  if (go === 'stay' || go == null) {
    if (onItem && !expired) {
      // bank the time so far and keep the clock running
      await bankClose(a, s, plan);
      a.current_served_at = nowIso();
      await run(`UPDATE assess_attempts SET current_served_at = ? WHERE id = ?`, [a.current_served_at, a.id]);
    }
    const nav = await bankNav(a, s, plan);
    return { done: false, saved: !expired, expired, leftMs: nav[a.current_idx] ? nav[a.current_idx].leftMs : 0 };
  }
  await bankClose(a, s, plan);
  const nav = await bankNav(a, s, plan);
  if (nav.every(n => n.out)) return { done: true, result: await bankFinishNow(a, s, plan, 'Every item ran out of time') };
  if (go === 'review') { await bankToReview(a); return { done: false, review: true }; }
  let target = go === 'auto' || go === 'next' ? nextOpen(nav, a.current_idx, go === 'auto') : Number(go);
  if (go === 'next' && target < 0) { await bankToReview(a); return { done: false, review: true }; }
  if (!Number.isInteger(target) || target < 0 || target >= plan.length) { await bankToReview(a); return { done: false, review: true }; }
  if (nav[target].out) throw httpError(409, 'That question has no time left, so it is locked.', 'out');
  await ensureRow(a, target, plan[target]);
  // current() opens it and starts its clock
  await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = NULL, bank_review = 0 WHERE id = ?`, [target, a.id]);
  return { done: false, idx: target };
}
async function bankFinishNow(a, s, plan, why) {
  await bankClose(a, s, plan);
  for (let i = 0; i < plan.length; i++) await ensureRow(a, i, plan[i]);
  await run(`UPDATE assess_attempts SET current_idx = ?, current_served_at = NULL, bank_review = 0 WHERE id = ?`, [plan.length, a.id]);
  if (why) await logEvent(a.id, null, 'submitted_by', why);
  return finish(a.id);
}
/** Final submit from the review screen. */
async function submitAll({ attemptId, email, token }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const s = await testSettingsFor(a);
  const plan = j(a.plan_json, []);
  if (a.nav_mode !== 'bank') throw httpError(400, 'This attempt submits one question at a time');
  const nav = await bankNav(a, s, plan);
  const open = nav.filter(n => !n.answered).length;
  return { done: true, result: await bankFinishNow(a, s, plan, open ? `Submitted by the agent with ${open} item(s) unanswered` : 'Submitted by the agent') };
}

const EVENT_TYPES = new Set(['blur', 'focus', 'hidden', 'visible', 'fullscreen_exit', 'fullscreen_enter', 'copy', 'cut', 'paste', 'contextmenu',
  'printscreen', 'devtools_key', 'mouse_out', 'resize', 'replay', 'print', 'select', 'camera_on', 'camera_off', 'camera_denied', 'multi_screen', 'auto_submit',
  'face_missing', 'face_back', 'face_multi', 'camera_dark', 'face_check_off', 'nav']);
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
    await logEvent(a.id, Number.isInteger(ev.idx) ? ev.idx : null, type, (tokenOk ? '' : '[older tab] ') + clean(ev.detail || '', 200));
    n++;
  }
  return n;
}

async function saveSnapshot({ attemptId, email, token, idx, image, faces }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  if (!(await testSettingsFor(a)).camera) throw httpError(400, 'Camera photos are not on for this assessment');
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
  if (!m) throw httpError(400, 'Bad image');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 200000) throw httpError(413, 'Image too large');
  const cnt = await get(`SELECT COUNT(*) AS n FROM assess_snapshots WHERE attempt_id = ?`, [a.id]);
  if (cnt.n >= 400) return false;
  const f = Number.isInteger(faces) && faces >= 0 && faces < 10 ? faces : null;
  await run(`INSERT INTO assess_snapshots (attempt_id, idx, img, faces) VALUES (?,?,?,?)`, [a.id, Number.isInteger(idx) ? idx : null, buf, f]);
  return true;
}
/** Camera photos are deleted automatically after photo_days (default 90). */
async function purgeOldSnapshots() {
  const days = Math.max(7, Math.min(365, Number(await getConfig('photo_days', '90')) || 90));
  const r = await run(`DELETE FROM assess_snapshots WHERE at < datetime('now', ?)`, [`-${days} days`]);
  return r.changes || 0;
}
async function setPhotoDays(days) { await setConfig('photo_days', String(Math.max(7, Math.min(365, Math.round(Number(days) || 90))))); }
async function deleteSnapshotsFor(attemptId) { const r = await run(`DELETE FROM assess_snapshots WHERE attempt_id = ?`, [Number(attemptId)]); return r.changes || 0; }
async function listSnapshots(attemptId) { return all(`SELECT id, idx, at, faces FROM assess_snapshots WHERE attempt_id = ? ORDER BY id`, [Number(attemptId)]); }
async function getSnapshot(id) { const r = await get(`SELECT img FROM assess_snapshots WHERE id = ?`, [Number(id)]); return r ? r.img : null; }

/** Behaviour tier, the way TestGorilla and HackerRank report it: signals
 *  worth a conversation, never proof on their own. */
function integrityFrom(events, answers, settings) {
  const c = {};
  let faceSecs = 0;
  for (const e of events) {
    c[e.type] = (c[e.type] || 0) + 1;
    if (e.type === 'face_back' && e.detail) { const m = /(\d+)s/.exec(e.detail); if (m) faceSecs += Number(m[1]); }
  }
  const slowRight = answers.filter(a => a.kind === 'q' && a.correct === 1 && a.elapsed_ms != null && a.allowedMs && a.elapsed_ms > a.allowedMs * 0.8).length;
  const flags = [];
  const add = (key, text, level) => flags.push({ key, text, level });
  if (c.hidden) add('hidden', `Left the test tab ${c.hidden}x`, c.hidden >= 3 ? 'major' : 'some');
  if (c.blur && c.blur - (c.hidden || 0) > 0) add('blur', `Clicked outside the test window ${c.blur}x`, c.blur >= 6 ? 'major' : 'some');
  if (c.fullscreen_exit) add('fullscreen_exit', `Left full screen ${c.fullscreen_exit}x`, c.fullscreen_exit >= 3 ? 'major' : 'some');
  if (c.paste) add('paste', `Tried to paste ${c.paste}x`, 'major');
  if (c.copy || c.cut) add('copy', `Tried to copy ${(c.copy || 0) + (c.cut || 0)}x`, 'some');
  if (c.printscreen) add('printscreen', `Pressed Print Screen ${c.printscreen}x`, 'major');
  if (c.devtools_key) add('devtools', `Tried developer tools ${c.devtools_key}x`, 'major');
  if (c.multi_screen) add('multi_screen', 'A second screen was connected', 'some');
  if (settings && settings.camera) {
    if (c.camera_denied) add('camera', 'Did not allow the camera', 'major');
    else if (c.camera_off) add('camera', `Camera stopped ${c.camera_off}x`, 'major');
    // Session 62: on-device face check
    if (c.face_missing) add('face_missing', `No face in view ${c.face_missing}x${faceSecs ? ` (about ${faceSecs}s in total)` : ''}`, c.face_missing >= 3 || faceSecs >= 20 ? 'major' : 'some');
    if (c.face_multi) add('face_multi', `More than one face in view ${c.face_multi}x`, 'major');
    if (c.camera_dark) add('camera_dark', `Camera covered or too dark ${c.camera_dark}x`, 'major');
  }
  if (c.resumed) add('resumed', `Opened the test again in another tab ${c.resumed}x`, c.resumed >= 2 ? 'major' : 'some');
  if (c.reserved) add('reserved', `Reloaded a question ${c.reserved}x`, c.reserved >= 3 ? 'major' : 'some');
  if (slowRight >= 2) add('slow_right', `${slowRight} correct answers came in the last seconds`, slowRight >= 4 ? 'major' : 'some');
  const tier = flags.some(f => f.level === 'major') ? 'major' : flags.length ? 'some' : 'none';
  return { tier, flags, counts: c };
}

async function finish(attemptId) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [attemptId]);
  const s = await testSettingsFor(a);
  const answers = await all(`SELECT * FROM assess_answers WHERE attempt_id = ?`, [a.id]);
  const plan = j(a.plan_json, []);
  const qItems = plan.filter(p => p.kind === 'q').length;
  const score = answers.filter(x => x.kind === 'q' && x.correct === 1).length;
  if (a.status === 'in_progress') {
    const events = await all(`SELECT type, detail FROM assess_events WHERE attempt_id = ?`, [a.id]);
    const integ = integrityFrom(events, answers.map(x => ({ ...x, allowedMs: withExtra(s.secondsPerQuestion, a.extra_pct) * 1000 })), s);
    await run(`UPDATE assess_attempts SET status = 'submitted', finished_at = ?, score = ?, max_score = ?, integrity_json = ?, client_token = NULL WHERE id = ?`,
      [nowIso(), score, qItems, JSON.stringify(integ), a.id]);
    await logEvent(a.id, null, 'submitted', null);
  }
  return s.showScore ? { score, maxScore: qItems, pct: qItems ? Math.round(score / qItems * 100) : 0, passed: qItems ? score / qItems * 100 >= s.passPct : false, passPct: s.passPct } : { hidden: true };
}

// ── Results (reviewer) ────────────────────────────────────────────────
async function adminAttempts(testId, viewer) {
  const rows = await all(`SELECT a.id, a.test_id, a.email, a.name, a.status, a.started_at, a.finished_at, a.score, a.max_score, a.integrity_json, a.current_idx, a.plan_json,
      (SELECT COUNT(*) FROM assess_snapshots s WHERE s.attempt_id = a.id) AS snaps,
      (SELECT COUNT(*) FROM assess_answers x WHERE x.attempt_id = a.id AND x.kind = 'explain' AND x.review_score IS NULL AND x.response_json IS NOT NULL) AS unmarked,
      (SELECT AVG(review_score) FROM assess_answers x WHERE x.attempt_id = a.id AND x.kind = 'explain' AND x.review_score IS NOT NULL) AS written_avg,
      a.review_verdict, a.nav_mode, a.reset_by, a.reset_at, a.reset_note,
      (SELECT COUNT(*) FROM assess_answers x WHERE x.attempt_id = a.id AND x.response_json IS NOT NULL) AS answered_n
      FROM assess_attempts a WHERE a.test_id = ? ORDER BY a.id DESC`, [Number(testId)]);
  const t = await get(`SELECT settings_json FROM assess_tests WHERE id = ?`, [Number(testId)]);
  const passPct = normSettings(j(t && t.settings_json, {})).passPct;
  return rows.map(r => {
    const integ = j(r.integrity_json, null);
    const total = j(r.plan_json, []).length;
    return { id: r.id, email: r.email, name: r.name, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at,
      score: r.score, maxScore: r.max_score, pct: r.max_score ? Math.round(r.score / r.max_score * 100) : null, passed: r.max_score ? r.score / r.max_score * 100 >= passPct : null,
      tier: integ ? integ.tier || null : null, flags: integ && Array.isArray(integ.flags) ? integ.flags.map(f => typeof f === 'string' ? f : f.text) : [],
      snapshots: isOwner(viewer) ? r.snaps : null, unmarked: r.unmarked, writtenPct: r.written_avg != null ? Math.round(r.written_avg * 100) : null,
      verdict: r.review_verdict || null, progress: `${r.nav_mode === 'bank' ? Math.min(r.answered_n, total) : Math.min(r.current_idx, total)}/${total}`,
      reset: r.status === 'reset' ? { by: r.reset_by, at: r.reset_at, note: r.reset_note || '' } : null };
  });
}

async function adminAttemptDetail(attemptId, viewer) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a) throw httpError(404, 'Attempt not found');
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
        elapsedMs: ans ? ans.elapsed_ms : null, answered: !!(ans && hasAnswer(resp)), reviewScore: ans ? ans.review_score : null, reviewNote: ans ? ans.review_note : null,
        visits: ans ? ans.visits || 0 : 0, flagged: !!(ans && ans.flagged) };
    }
    const q = qById.get(p.qid) || {};
    const opts = j(q.options_json, []);
    const text = (id) => (opts.find(o => o.id === id) || {}).text || `Option ${id}`;
    const matchOf = (id) => (opts.find(o => o.id === id) || {}).match || '?';
    let correctAnswer, chosen;
    if (q.type === 'ordering') {
      correctAnswer = [j(q.answer_json, []).map((id, k) => (k + 1) + '. ' + text(id)).join('   ')];
      chosen = resp ? [(resp.chosen || []).map((id, k) => (k + 1) + '. ' + text(id)).join('   ') || 'Not ordered'] : null;
    } else if (q.type === 'matching') {
      correctAnswer = opts.map(o => o.text + ' → ' + o.match);
      chosen = resp ? opts.map(o => o.text + ' → ' + (resp.pairs && resp.pairs[o.id] != null ? matchOf(resp.pairs[o.id]) : 'no match')) : null;
    } else {
      correctAnswer = j(q.answer_json, []).map(text);
      chosen = resp ? (resp.chosen || []).map(text) : null;
    }
    return { idx: i, kind: 'q', type: q.type, prompt: q.prompt, explanation: q.explanation || null, shownOrder: p.opt.map(text), qid: q.id, tags: q.tags ? q.tags.split(',').filter(Boolean) : [],
      correctAnswer, chosen,
      correct: ans ? ans.correct === 1 : false, late: !!(ans && ans.late), answered: !!(ans && (a.nav_mode === 'bank' ? hasAnswer(resp) : true)),
      elapsedMs: ans ? ans.elapsed_ms : null, replays: ans ? ans.replays : 0, visits: ans ? ans.visits || 0 : 0, flagged: !!(ans && ans.flagged) };
  });
  const events = await all(`SELECT idx, type, detail, at FROM assess_events WHERE attempt_id = ? ORDER BY id`, [a.id]);
  const t = await get(`SELECT title, settings_json FROM assess_tests WHERE id = ?`, [a.test_id]);
  const s = normSettings(j(t && t.settings_json, {}));
  let integ = j(a.integrity_json, null);
  if (integ && Array.isArray(integ.flags) && integ.flags.length && typeof integ.flags[0] === 'string') integ = { tier: integ.score >= 85 ? 'none' : integ.score >= 60 ? 'some' : 'major', flags: integ.flags.map(f => ({ text: f, level: 'some' })) };
  return { id: a.id, testId: a.test_id, testTitle: t ? t.title : '', email: a.email, name: a.name, status: a.status,
    startedAt: a.started_at, finishedAt: a.finished_at, score: a.score, maxScore: a.max_score, ua: a.ua, extraPct: a.extra_pct || 0,
    passPct: s.passPct, camera: s.camera, integrity: integ, items, events,
    canSeePhotos: isOwner(viewer), snapshots: isOwner(viewer) ? await listSnapshots(a.id) : null,
    photoCount: (await get(`SELECT COUNT(*) AS n FROM assess_snapshots WHERE attempt_id = ?`, [a.id])).n,
    verdict: a.review_verdict || null, notes: a.review_notes || '', reviewedBy: a.reviewed_by || null, reviewedAt: a.reviewed_at || null,
    navigation: a.nav_mode === 'bank' ? 'bank' : 'locked', reset: a.status === 'reset' ? { by: a.reset_by, at: a.reset_at, note: a.reset_note || '' } : null };
}

async function reviewExplain(attemptId, idx, { score, note }) {
  const n = score == null || score === '' ? null : Math.max(0, Math.min(1, Number(score)));
  await run(`UPDATE assess_answers SET review_score = ?, review_note = ? WHERE attempt_id = ? AND idx = ? AND kind = 'explain'`,
    [Number.isFinite(n) ? n : null, clean(note, 1000), Number(attemptId), Number(idx)]);
}
const VERDICTS = new Set(['cleared', 'follow_up', 'concern']);
async function reviewAttempt(attemptId, { verdict, notes }, by) {
  await run(`UPDATE assess_attempts SET review_verdict = ?, review_notes = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`,
    [VERDICTS.has(verdict) ? verdict : null, clean(notes, 3000), lc(by), Number(attemptId)]);
}
async function duplicateTest(id, by) {
  const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(id)]);
  if (!t) throw httpError(404, 'Assessment not found');
  const r = await run(`INSERT INTO assess_tests (title, description, question_ids_json, settings_json, assign_json, status, created_by) VALUES (?,?,?,?,?,?,?)`,
    [clean(t.title + ' (copy)', 160), t.description, t.question_ids_json, t.settings_json, JSON.stringify({ everyone: false, emails: [] }), 'draft', lc(by)]);
  return r.lastID;
}
/** What an agent may see about their own submitted attempt, depending on
 *  the test's release setting: the score, or answers too. */
async function myResult(attemptId, email) {
  const a = await get(`SELECT * FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a || lc(a.email) !== lc(email) || a.status !== 'submitted') throw httpError(404, 'Result not found');
  const s = await testSettingsFor(a);
  if (s.releaseMode === 'none' && !s.showScore) throw httpError(403, 'Your reviewer has not released results for this assessment yet.');
  const d = await adminAttemptDetail(a.id, null);
  const out = { testTitle: d.testTitle, finishedAt: d.finishedAt, score: d.score, maxScore: d.maxScore, pct: d.maxScore ? Math.round(d.score / d.maxScore * 100) : 0, passPct: s.passPct, releaseMode: s.releaseMode === 'none' ? 'score' : s.releaseMode };
  if (s.releaseMode === 'answers') {
    out.items = d.items.map(it => it.kind === 'explain'
      ? { kind: 'explain', about: it.about, text: it.text, mark: it.reviewScore }
      : { kind: 'q', prompt: it.prompt, chosen: it.chosen, correctAnswer: it.correctAnswer, correct: it.correct, late: it.late, explanation: it.explanation });
  }
  return out;
}
async function deleteAttempt(attemptId) {
  for (const tbl of ['assess_answers', 'assess_events', 'assess_snapshots']) await run(`DELETE FROM ${tbl} WHERE attempt_id = ?`, [Number(attemptId)]);
  await run(`DELETE FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
}
/** Session 62: soft reset. The attempt stays in the results, marked Reset,
 *  and no longer counts toward scores or the attempts allowed, so the
 *  person can take the test again. */
async function resetAttempt(attemptId, by, note) {
  const a = await get(`SELECT id, test_id, email, status FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
  if (!a) throw httpError(404, 'Attempt not found');
  if (a.status === 'reset') throw httpError(409, 'This attempt is already reset');
  await run(`UPDATE assess_attempts SET status = 'reset', client_token = NULL, reset_by = ?, reset_at = ?, reset_note = ?, finished_at = COALESCE(finished_at, ?) WHERE id = ?`,
    [lc(by), nowIso(), clean(note, 300) || null, nowIso(), a.id]);
  await logEvent(a.id, null, 'reset', `Reset by ${lc(by)}${note ? ': ' + clean(note, 200) : ''}`);
  return { testId: a.test_id, email: a.email };
}
async function exportCsv(testId) {
  const rows = await adminAttempts(testId, null);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const tierLabel = { none: 'No issues', some: 'Some issues', major: 'Major issues' };
  const verdictLabel = { cleared: 'Cleared', follow_up: 'Needs follow-up', concern: 'Concern' };
  const head = ['Name', 'Email', 'Status', 'Started (UTC)', 'Finished (UTC)', 'Score', 'Out of', 'Percent', 'Result', 'Written answers (%)', 'Written answers to mark', 'Behaviour', 'Flags', 'Reviewer verdict'];
  const lines = rows.map(r => [r.name, r.email, r.status, r.startedAt, r.finishedAt, r.score, r.maxScore, r.pct != null ? r.pct + '%' : '',
    r.passed == null ? '' : (r.passed ? 'Pass' : 'Below pass'), r.writtenPct != null ? r.writtenPct + '%' : '', r.unmarked, tierLabel[r.tier] || '', (r.flags || []).join('; '), verdictLabel[r.verdict] || ''].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}


// ── Session 60: Google Chat announcements and reminders ───────────────
const CHAT_HOOK_RE = /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^\s]+$/;
async function chatConfig() {
  return {
    webhook: await getConfig('chat_webhook', ''),
    announceOnPublish: (await getConfig('announce_on_publish', '1')) === '1',
    remindBeforeClose: (await getConfig('remind_before_close', '1')) === '1',
    exposureLimit: await exposureLimit(),
  };
}
async function setChatConfig(b) {
  if (b.webhook != null) {
    const w = String(b.webhook || '').trim();
    if (w && !CHAT_HOOK_RE.test(w)) throw httpError(400, 'Paste a Google Chat webhook URL (https://chat.googleapis.com/v1/spaces/...)');
    await setConfig('chat_webhook', w);
  }
  if (b.announceOnPublish != null) await setConfig('announce_on_publish', b.announceOnPublish ? '1' : '0');
  if (b.remindBeforeClose != null) await setConfig('remind_before_close', b.remindBeforeClose ? '1' : '0');
  if (b.exposureLimit != null) await setConfig('exposure_limit', String(Math.max(0, Math.min(1000, Math.round(Number(b.exposureLimit) || 0)))));
}
async function mentionsFor(emails) {
  const out = [];
  for (const e of emails.slice(0, 40)) {
    let m = null;
    try { m = deps.mentionFor ? await deps.mentionFor(e) : null; } catch (x) { m = null; }
    out.push(m || e.split('@')[0]);
  }
  return out;
}
async function pendingPeople(t) {
  const a = normAssign(j(t.assign_json, {}));
  if (a.everyone) return { everyone: true, emails: [] };
  const done = new Set((await all(`SELECT DISTINCT email FROM assess_attempts WHERE test_id = ? AND status = 'submitted'`, [t.id])).map(r => lc(r.email)));
  return { everyone: false, emails: a.emails.filter(e => !done.has(e)) };
}
function fmtCst(iso) {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CST';
}
async function postToChat(text, kind, testId) {
  const cfg = await chatConfig();
  if (!cfg.webhook) throw httpError(400, 'Add a Google Chat webhook on the Access page first');
  if (!deps.postChat) throw httpError(500, 'Chat posting is not available');
  const r = await deps.postChat(cfg.webhook, text);
  await setConfig(`${kind}:${testId}:last`, nowIso());
  if (!r || !r.ok) throw httpError(502, 'Google Chat did not accept the message' + (r && r.status ? ` (HTTP ${r.status})` : ''));
  return true;
}
async function announceTest(id, kind = 'announce') {
  const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(id)]);
  if (!t) throw httpError(404, 'Assessment not found');
  if (t.status !== 'published') throw httpError(400, 'Publish the assessment first');
  const s = normSettings(j(t.settings_json, {}));
  if (s.repeat.mode !== 'none') throw httpError(400, 'Repeat templates are announced automatically when each copy opens');
  const who = await pendingPeople(t);
  if (kind === 'remind' && !who.everyone && !who.emails.length) return { sent: false, reason: 'Everyone assigned has already submitted' };
  const nQ = s.pool.mode === 'random' ? s.pool.count : j(t.question_ids_json, []).length;
  const mins = Math.max(1, Math.ceil((nQ * s.secondsPerQuestion + Math.min(s.explainCount, nQ) * EXPLAIN_SEC) / 60));
  const url = (deps.publicUrl || '') + '/assess';
  const tags = who.everyone ? [] : await mentionsFor(who.emails);
  const lines = kind === 'remind'
    ? [`⏰ *Reminder: ${clean(t.title, 120)}* closes ${s.closesAt ? fmtCst(s.closesAt) : 'soon'}.`, `About ${mins} minutes. Start here: <${url}|Open assessments>`]
    : [`📝 *New assessment: ${clean(t.title, 120)}*`, t.description ? clean(t.description, 300) : null,
       `${nQ} questions, about ${mins} minutes${s.closesAt ? ` · due ${fmtCst(s.closesAt)}` : ''}.`,
       `Find a quiet spot, then start here: <${url}|Open assessments>`];
  if (tags.length) lines.push((kind === 'remind' ? 'Still to submit: ' : 'For: ') + tags.join(' ') + (who.emails.length > 40 ? ` and ${who.emails.length - 40} more` : ''));
  else if (who.everyone) lines.push('For: everyone on the team.');
  await postToChat(lines.filter(Boolean).join('\n'), kind, t.id);
  return { sent: true, tagged: tags.length };
}
/** Every 15 minutes: remind once, about 24 hours before a test closes
 *  (inside alert hours), and open the next copy of each repeat template. */
async function tick() {
  const auto = await autoSubmitAbandoned().catch(e => { console.warn('assess auto-submit:', e.message); return 0; });
  if (auto) console.log(`📝 assessments: auto-submitted ${auto} abandoned attempt(s)`);
  const cfg = await chatConfig();
  const live = !deps.inAlertHours || deps.inAlertHours();
  const tests = await all(`SELECT * FROM assess_tests WHERE status = 'published'`);
  for (const t of tests) {
    const s = normSettings(j(t.settings_json, {}));
    if (s.repeat.mode !== 'none') { await runRepeat(t, s, cfg).catch(e => console.warn('assess repeat:', e.message)); continue; }
    if (cfg.webhook && cfg.remindBeforeClose && live && s.closesAt) {
      const left = Date.parse(s.closesAt) - Date.now();
      const key = `remind:${t.id}:${s.closesAt}`;
      if (left > 0 && left <= 24 * 3600e3 && !(await getConfig(key, ''))) {
        await setConfig(key, nowIso());
        await announceTest(t.id, 'remind').catch(e => console.warn('assess remind:', e.message));
      }
    }
  }
}
function periodOf(mode, d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
  if (mode === 'monthly') {
    const label = new Date(Date.UTC(+parts.year, +parts.month - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { key: `${parts.year}-${parts.month}`, label, hour: +parts.hour };
  }
  // ISO-ish week: the Monday of this week in Central time
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const mon = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day - dow));
  const key = mon.toISOString().slice(0, 10);
  return { key, label: 'week of ' + mon.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), hour: +parts.hour };
}
async function runRepeat(t, s, cfg) {
  const p = periodOf(s.repeat.mode);
  if (p.hour < 8) return; // open copies from 8 AM Central
  const key = `repeat:${t.id}:${p.key}`;
  if (await getConfig(key, '')) return;
  await setConfig(key, nowIso());
  const settings = { ...s, repeat: { mode: 'none', openDays: s.repeat.openDays }, parentId: t.id, opensAt: nowIso(), closesAt: new Date(Date.now() + s.repeat.openDays * 86400e3).toISOString() };
  const r = await run(`INSERT INTO assess_tests (title, description, question_ids_json, settings_json, assign_json, status, created_by) VALUES (?,?,?,?,?,?,?)`,
    [clean(`${t.title} · ${p.label}`, 160), t.description, t.question_ids_json, JSON.stringify(settings), t.assign_json, 'published', 'repeat']);
  if (cfg.webhook && cfg.announceOnPublish) await announceTest(r.lastID, 'announce').catch(e => console.warn('assess repeat announce:', e.message));
  return r.lastID;
}

// ── Session 60: live monitoring ───────────────────────────────────────
async function adminLive() {
  const rows = await all(`SELECT a.id, a.test_id, a.email, a.name, a.started_at, a.current_idx, a.current_served_at, a.plan_json, a.extra_pct, a.nav_mode, a.bank_review, t.title, t.settings_json,
      (SELECT MAX(at) FROM assess_events e WHERE e.attempt_id = a.id) AS last_event
      FROM assess_attempts a JOIN assess_tests t ON t.id = a.test_id
      WHERE a.status = 'in_progress' AND a.started_at >= datetime('now', '-6 hours') ORDER BY a.started_at DESC`);
  const out = [];
  for (const r of rows) {
    const plan = j(r.plan_json, []), s = normSettings(j(r.settings_json, {}));
    const ev = await all(`SELECT type, COUNT(*) AS n FROM assess_events WHERE attempt_id = ? GROUP BY type`, [r.id]);
    const c = {}; ev.forEach(x => { c[x.type] = x.n; });
    const item = plan[r.current_idx];
    let leftSec = null, progress = Math.min(r.current_idx, plan.length);
    if (r.nav_mode === 'bank') {
      const nav = await bankNav(r, s, plan);
      progress = nav.filter(x => x.answered).length;
      if (item && r.current_served_at && !r.bank_review) leftSec = Math.round(nav[r.current_idx].leftMs / 1000);
    } else if (item && r.current_served_at) leftSec = Math.round((Date.parse(r.current_served_at) + secondsFor(item, s, r.extra_pct) * 1000 - Date.now()) / 1000);
    const lastMs = Math.max(r.current_served_at ? Date.parse(r.current_served_at) : 0, r.last_event ? Date.parse(r.last_event.replace(' ', 'T') + 'Z') : 0, Date.parse(r.started_at.replace(' ', 'T') + 'Z'));
    const integ = integrityFrom(ev.flatMap(x => Array(x.n).fill({ type: x.type })), [], s);
    out.push({ id: r.id, testId: r.test_id, title: r.title, email: r.email, name: r.name, startedAt: r.started_at,
      progress, total: plan.length, onWritten: item && item.kind === 'explain', onReview: !!r.bank_review,
      leftSec, idleSec: Math.round((Date.now() - lastMs) / 1000), tier: integ.tier, flags: integ.flags.map(f => f.text),
      counts: { tab: c.hidden || 0, fullscreen: c.fullscreen_exit || 0, paste: c.paste || 0, screenshot: c.printscreen || 0 } });
  }
  return out;
}

// ── Session 60: insights, progress, export ────────────────────────────
function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [y, m] = month.split('-').map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)).toISOString(), new Date(Date.UTC(y, m, 1)).toISOString()];
}
async function topicRows(whereSql, params) {
  return all(`SELECT at.email, at.name, q.tags, x.correct FROM assess_answers x
      JOIN assess_attempts at ON at.id = x.attempt_id JOIN assess_questions q ON q.id = x.question_id
      WHERE x.kind = 'q' AND at.status = 'submitted' ${whereSql}`, params);
}
async function adminInsights({ month } = {}) {
  const rng = monthRange(month);
  const w = rng ? `AND at.finished_at >= ? AND at.finished_at < ?` : '';
  const pr = rng || [];
  const rows = await topicRows(w, pr);
  const agents = new Map(), tagTotals = {};
  for (const r of rows) {
    const a = agents.get(r.email) || { email: r.email, name: r.name, topics: {} };
    agents.set(r.email, a);
    for (const tag of (r.tags || '').split(',').filter(Boolean)) {
      const k = a.topics[tag] || (a.topics[tag] = { right: 0, n: 0 }); k.n++; if (r.correct === 1) k.right++;
      const g = tagTotals[tag] || (tagTotals[tag] = { right: 0, n: 0 }); g.n++; if (r.correct === 1) g.right++;
    }
  }
  const att = await all(`SELECT email, name, COUNT(*) AS n, AVG(score * 100.0 / max_score) AS avg_pct, MAX(finished_at) AS last,
      SUM(CASE WHEN review_verdict = 'concern' THEN 1 ELSE 0 END) AS concerns
      FROM assess_attempts WHERE status = 'submitted' AND max_score > 0 ${rng ? 'AND finished_at >= ? AND finished_at < ?' : ''} GROUP BY email`, pr);
  for (const r of att) { const a = agents.get(r.email) || { email: r.email, name: r.name, topics: {} }; agents.set(r.email, Object.assign(a, { attempts: r.n, avgPct: Math.round(r.avg_pct), last: r.last, concerns: r.concerns })); }
  const tags = Object.entries(tagTotals).filter(([t]) => t !== 'sample').sort((x, y) => y[1].n - x[1].n).slice(0, 14)
    .map(([tag, v]) => ({ tag, n: v.n, pct: Math.round(v.right / v.n * 100) }));
  const list = [...agents.values()].map(a => ({ email: a.email, name: a.name, attempts: a.attempts || 0, avgPct: a.avgPct != null ? a.avgPct : null, last: a.last || null, concerns: a.concerns || 0,
    topics: Object.fromEntries(Object.entries(a.topics).map(([t, v]) => [t, { pct: Math.round(v.right / v.n * 100), n: v.n }])) }))
    .sort((x, y) => (y.avgPct || 0) - (x.avgPct || 0));
  return { month: month || null, tags, agents: list };
}
async function insightsCsv(month) {
  const d = await adminInsights({ month });
  const esc = (v) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const head = ['Name', 'Email', 'Assessments submitted', 'Average score (%)', 'Last submitted (UTC)', 'Concern verdicts'].concat(d.tags.map(t => `Topic: ${t.tag} (%)`));
  const lines = d.agents.map(a => [a.name, a.email, a.attempts, a.avgPct, a.last, a.concerns].concat(d.tags.map(t => a.topics[t.tag] ? a.topics[t.tag].pct : '')).map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}
/** An agent's own progress by topic, from assessments whose results have
 *  been released to them. */
async function myProgress(email) {
  const atts = await all(`SELECT a.id, a.test_id, a.score, a.max_score, a.finished_at, t.title, t.settings_json FROM assess_attempts a JOIN assess_tests t ON t.id = a.test_id
      WHERE a.email = ? AND a.status = 'submitted' AND a.max_score > 0 ORDER BY a.finished_at`, [lc(email)]);
  const released = atts.filter(a => { const s = normSettings(j(a.settings_json, {})); return s.releaseMode !== 'none' || s.showScore; });
  if (!released.length) return { tests: [], topics: [] };
  const ids = released.map(a => a.id);
  const rows = await all(`SELECT q.tags, x.correct FROM assess_answers x JOIN assess_questions q ON q.id = x.question_id WHERE x.kind = 'q' AND x.attempt_id IN (${ids.map(() => '?').join(',')})`, ids);
  const tg = {};
  for (const r of rows) for (const t of (r.tags || '').split(',').filter(Boolean)) { if (t === 'sample') continue; const k = tg[t] || (tg[t] = { right: 0, n: 0 }); k.n++; if (r.correct === 1) k.right++; }
  return {
    tests: released.map(a => ({ title: a.title, pct: Math.round(a.score / a.max_score * 100), finishedAt: a.finished_at })),
    topics: Object.entries(tg).filter(([, v]) => v.n >= 2).map(([tag, v]) => ({ tag, pct: Math.round(v.right / v.n * 100), n: v.n })).sort((x, y) => x.pct - y.pct),
  };
}

// ── Session 64: retest, archive and delete, downloads, reports, AI improve ──
async function testRow(id) { const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(id)]); if (!t) throw httpError(404, 'Assessment not found'); return t; }
/** Reset their latest attempt and, if asked, tag them in Google Chat. */
async function retest({ attemptIds, testId, below, by, note, notify }) {
  let ids = (Array.isArray(attemptIds) ? attemptIds : []).map(Number).filter(Boolean);
  if (testId && below) {
    const t = await testRow(testId);
    const pass = normSettings(j(t.settings_json, {})).passPct;
    const rows = await all(`SELECT id, email, score, max_score FROM assess_attempts WHERE test_id = ? AND status = 'submitted' ORDER BY id DESC`, [t.id]);
    const seen = new Set();
    for (const r of rows) { if (seen.has(r.email)) continue; seen.add(r.email); if (r.max_score && r.score / r.max_score * 100 < pass) ids.push(r.id); }
  }
  ids = Array.from(new Set(ids)).slice(0, 200);
  if (!ids.length) return { reset: 0, notified: false, reason: 'Nobody matched' };
  const people = [], titles = new Set();
  for (const id of ids) {
    const a = await get(`SELECT id, test_id, email, name, status FROM assess_attempts WHERE id = ?`, [id]);
    if (!a || a.status === 'reset') continue;
    await resetAttempt(a.id, by, note || 'Retest');
    people.push(a.email);
    titles.add(a.test_id);
  }
  let notified = false, reason = null;
  if (notify && people.length) {
    try {
      const t = await testRow([...titles][0]);
      const tags = await mentionsFor(people);
      const url = (deps.publicUrl || '') + '/assess';
      await postToChat([`🔁 *Retest: ${clean(t.title, 120)}*`, note ? clean(note, 300) : null, `${tags.join(' ')}, please take it again when you have a quiet 15 minutes.`, `<${url}|Open assessments>`].filter(Boolean).join('\n'), 'retest', t.id);
      notified = true;
    } catch (e) { reason = e.message; }
  }
  return { reset: people.length, notified, reason };
}
async function archivedTests() {
  const rows = await all(`SELECT t.id, t.title, t.description, t.updated_at, (SELECT COUNT(*) FROM assess_attempts a WHERE a.test_id = t.id) AS attempts FROM assess_tests t WHERE status = 'archived' ORDER BY updated_at DESC`);
  return rows.map(r => ({ id: r.id, title: r.title, description: r.description || '', archivedAt: r.updated_at, attempts: r.attempts }));
}
async function restoreTest(id) { await testRow(id); await run(`UPDATE assess_tests SET status = 'draft', updated_at = datetime('now') WHERE id = ?`, [Number(id)]); }
/** Permanent delete: the test, every attempt, answer, event and photo. */
async function deleteTestForever(id, confirmTitle) {
  const t = await testRow(id);
  if (t.status !== 'archived') throw httpError(400, 'Archive the assessment first');
  if (String(confirmTitle || '').trim() !== t.title.trim()) throw httpError(400, 'Type the assessment name exactly to confirm');
  const atts = await all(`SELECT id FROM assess_attempts WHERE test_id = ?`, [t.id]);
  for (const a of atts) await deleteAttempt(a.id);
  await run(`DELETE FROM assess_tests WHERE id = ?`, [t.id]);
  return { deleted: true, attempts: atts.length, title: t.title };
}

const csvEsc = (v) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
/** Question bank download, with or without the answer key. */
async function bankExport({ answers, status, tag, q, ids }) {
  let rows;
  if (Array.isArray(ids) && ids.length) rows = await all(`SELECT * FROM assess_questions WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids.map(Number));
  else {
    const where = [], p = [];
    if (status) { where.push('status = ?'); p.push(status); } else where.push(`status != 'retired'`);
    if (tag) { where.push(`(',' || tags || ',') LIKE ?`); p.push(`%,${lc(tag)},%`); }
    if (q) { where.push('(prompt LIKE ? OR tags LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
    rows = await all(`SELECT * FROM assess_questions WHERE ${where.join(' AND ')} ORDER BY id`, p);
  }
  const L = 'ABCDEFGH';
  const items = rows.map((r, n) => {
    const opts = j(r.options_json, []), ans = j(r.answer_json, []);
    let shown = opts.map(o => o.text), key = '';
    if (r.type === 'matching') {
      const rights = shuffle(opts.map(o => o.match));
      shown = opts.map((o, i) => `${o.text}  ->  ${L[i]}`);
      shown = opts.map(o => o.text);
      key = opts.map(o => `${o.text} = ${o.match}`).join(' | ');
      return { n: n + 1, id: r.id, type: r.type, prompt: r.prompt, options: shown, matches: rights, key, explanation: r.explanation || '', tags: r.tags || '', difficulty: r.difficulty || '', status: r.status };
    }
    if (r.type === 'ordering') { shown = shuffle(opts).map(o => o.text); key = ans.map(id => (opts.find(o => o.id === id) || {}).text).join(' > '); }
    else key = ans.map(id => { const k = opts.findIndex(o => o.id === id); return k >= 0 ? `${L[k]}. ${opts[k].text}` : ''; }).join(' | ');
    return { n: n + 1, id: r.id, type: r.type, prompt: r.prompt, options: shown, key, explanation: r.explanation || '', tags: r.tags || '', difficulty: r.difficulty || '', status: r.status };
  });
  const head = ['#', 'ID', 'Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option F', 'Match choices']
    .concat(answers ? ['Correct answer', 'Explanation'] : []).concat(['Tags', 'Difficulty', 'Status']);
  const lines = items.map(it => [it.n, it.id, it.type, it.prompt].concat([0, 1, 2, 3, 4, 5].map(k => it.options[k] || '')).concat([it.matches ? it.matches.join(' | ') : ''])
    .concat(answers ? [it.key, it.explanation] : []).concat([it.tags, it.difficulty, it.status]).map(csvEsc).join(','));
  return { csv: [head.join(','), ...lines].join('\n'), items: items.map(it => answers ? it : { ...it, key: undefined, explanation: undefined }) };
}

/** Results across assessments, with filters. Used by the download and Reports. */
async function resultRows({ testIds, from, to, email, result, includeReset }) {
  const where = [`a.status ${includeReset ? "IN ('submitted','reset')" : "= 'submitted'"}`], p = [];
  const ids = (Array.isArray(testIds) ? testIds : String(testIds || '').split(',')).map(Number).filter(Boolean);
  if (ids.length) { where.push(`a.test_id IN (${ids.map(() => '?').join(',')})`); p.push(...ids); }
  if (/^\d{4}-\d{2}-\d{2}/.test(from || '')) { where.push(`a.finished_at >= ?`); p.push(String(from).slice(0, 10)); }
  if (/^\d{4}-\d{2}-\d{2}/.test(to || '')) { where.push(`a.finished_at < date(?, '+1 day')`); p.push(String(to).slice(0, 10)); }
  if (email) { where.push(`a.email = ?`); p.push(lc(email)); }
  const rows = await all(`SELECT a.*, t.title, t.settings_json FROM assess_attempts a JOIN assess_tests t ON t.id = a.test_id WHERE ${where.join(' AND ')} ORDER BY a.finished_at DESC LIMIT 5000`, p);
  const out = rows.map(r => {
    const s = normSettings(j(r.settings_json, {}));
    const pct = r.max_score ? Math.round(r.score / r.max_score * 100) : null;
    const integ = j(r.integrity_json, null);
    const started = Date.parse(String(r.started_at).replace(' ', 'T') + (/[zZ]$/.test(r.started_at) ? '' : 'Z'));
    const fin = r.finished_at ? Date.parse(r.finished_at) : null;
    return { id: r.id, testId: r.test_id, test: r.title, email: r.email, name: r.name || r.email, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at,
      score: r.score, maxScore: r.max_score, pct, passPct: s.passPct, passed: pct != null ? pct >= s.passPct : null,
      tier: integ ? integ.tier || 'none' : 'none', flags: integ && Array.isArray(integ.flags) ? integ.flags.map(f => typeof f === 'string' ? f : f.text) : [],
      verdict: r.review_verdict || null, minutes: fin && started ? Math.max(0, Math.round((fin - started) / 6000) / 10) : null, resetBy: r.reset_by || null };
  });
  if (result === 'pass') return out.filter(r => r.passed);
  if (result === 'fail') return out.filter(r => r.passed === false);
  return out;
}
async function resultsCsv(f) {
  const rows = await resultRows(f);
  const tier = { none: 'No issues', some: 'Some issues', major: 'Major issues' };
  const head = ['Assessment', 'Name', 'Email', 'Status', 'Started (UTC)', 'Finished (UTC)', 'Minutes', 'Score', 'Out of', 'Percent', 'Pass mark', 'Result', 'Behaviour', 'Flags', 'Verdict', 'Attempt ID'];
  const lines = rows.map(r => [r.test, r.name, r.email, r.status, r.startedAt, r.finishedAt, r.minutes, r.score, r.maxScore, r.pct != null ? r.pct + '%' : '', r.passPct + '%',
    r.passed == null ? '' : (r.passed ? 'Pass' : 'Below pass'), tier[r.tier] || '', r.flags.join('; '), r.verdict || '', r.id].map(csvEsc).join(','));
  return [head.join(','), ...lines].join('\n');
}
/** Reports page: KPIs, distribution, trend, per test, per agent, topics,
 *  hardest questions with the most-picked wrong option, behaviour. */
async function reportData(f) {
  const rows = await resultRows(f || {});
  const n = rows.length;
  const avg = n ? Math.round(rows.reduce((t, r) => t + (r.pct || 0), 0) / n) : null;
  const passRate = n ? Math.round(rows.filter(r => r.passed).length / n * 100) : null;
  const mins = rows.map(r => r.minutes).filter(x => x != null).sort((a, b) => a - b);
  const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
  const dist = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, n: 0 }));
  rows.forEach(r => { if (r.pct != null) dist[Math.min(9, Math.floor(r.pct / 10))].n++; });
  const wk = new Map();
  rows.forEach(r => {
    if (!r.finishedAt) return;
    const d = new Date(r.finishedAt); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day);
    const key = d.toISOString().slice(0, 10);
    const w = wk.get(key) || { week: key, n: 0, sum: 0, pass: 0 }; w.n++; w.sum += r.pct || 0; if (r.passed) w.pass++; wk.set(key, w);
  });
  const trend = [...wk.values()].sort((a, b) => a.week < b.week ? -1 : 1).map(w => ({ week: w.week, n: w.n, avg: Math.round(w.sum / w.n), passRate: Math.round(w.pass / w.n * 100) }));
  const group = (key) => { const m = new Map(); rows.forEach(r => { const k = r[key]; const g = m.get(k) || []; g.push(r); m.set(k, g); }); return m; };
  const byTest = [...group('testId').entries()].map(([id, g]) => ({ testId: id, test: g[0].test, n: g.length, avg: Math.round(g.reduce((t, r) => t + (r.pct || 0), 0) / g.length), passRate: Math.round(g.filter(r => r.passed).length / g.length * 100) }))
    .sort((a, b) => b.n - a.n);
  const byAgent = [...group('email').entries()].map(([email, g]) => ({ email, name: g[0].name, n: g.length, avg: Math.round(g.reduce((t, r) => t + (r.pct || 0), 0) / g.length), best: Math.max(...g.map(r => r.pct || 0)),
    passed: g.filter(r => r.passed).length, last: g[0].finishedAt, flagged: g.filter(r => r.tier !== 'none').length,
    retestIds: (() => { const seen = new Set(), ids = []; g.forEach(r => { if (r.status !== 'submitted' || seen.has(r.testId)) return; seen.add(r.testId); ids.push(r.id); }); return ids; })() }))
    .sort((a, b) => a.avg - b.avg);
  const tiers = { none: 0, some: 0, major: 0 }; rows.forEach(r => { tiers[r.tier] = (tiers[r.tier] || 0) + 1; });
  // questions and topics
  const attemptIds = rows.map(r => r.id);
  let questions = [], topics = [];
  if (attemptIds.length) {
    const ans = [];
    for (let i = 0; i < attemptIds.length; i += 400) {
      const chunk = attemptIds.slice(i, i + 400);
      ans.push(...await all(`SELECT x.question_id, x.correct, x.response_json, x.elapsed_ms, x.late FROM assess_answers x WHERE x.kind = 'q' AND x.attempt_id IN (${chunk.map(() => '?').join(',')})`, chunk));
    }
    const qids = [...new Set(ans.map(a => a.question_id).filter(Boolean))];
    const qs = qids.length ? await all(`SELECT id, type, prompt, options_json, answer_json, tags FROM assess_questions WHERE id IN (${qids.map(() => '?').join(',')})`, qids) : [];
    const qById = new Map(qs.map(q => [q.id, q]));
    const acc = new Map(), tagAcc = {};
    for (const a of ans) {
      const q = qById.get(a.question_id); if (!q) continue;
      const k = acc.get(q.id) || { n: 0, right: 0, ms: 0, msn: 0, none: 0, picks: {} }; acc.set(q.id, k);
      k.n++; if (a.correct === 1) k.right++;
      if (a.elapsed_ms != null && !a.late) { k.ms += a.elapsed_ms; k.msn++; }
      const resp = j(a.response_json, null);
      if (!resp || (Array.isArray(resp.chosen) && !resp.chosen.length)) k.none++;
      else if (a.correct !== 1 && Array.isArray(resp.chosen) && ['single', 'truefalse', 'multi'].includes(q.type)) {
        const want = new Set(j(q.answer_json, []));
        resp.chosen.filter(id => !want.has(id)).forEach(id => { k.picks[id] = (k.picks[id] || 0) + 1; });
      }
      for (const t of String(q.tags || '').split(',').filter(Boolean)) { if (t === 'sample') continue; const g = tagAcc[t] || (tagAcc[t] = { n: 0, right: 0 }); g.n++; if (a.correct === 1) g.right++; }
    }
    questions = [...acc.entries()].map(([id, k]) => {
      const q = qById.get(id); const opts = j(q.options_json, []);
      const top = Object.entries(k.picks).sort((a, b) => b[1] - a[1])[0];
      const wrongN = k.n - k.right;
      return { id, prompt: q.prompt, type: q.type, n: k.n, pct: Math.round(k.right / k.n * 100), avgSec: k.msn ? Math.round(k.ms / k.msn / 100) / 10 : null, unanswered: k.none,
        topWrong: top ? { text: (opts.find(o => o.id === Number(top[0])) || {}).text || '?', n: top[1], share: wrongN ? Math.round(top[1] / wrongN * 100) : 0 } : null,
        correct: j(q.answer_json, []).map(aid => (opts.find(o => o.id === aid) || {}).text).filter(Boolean) };
    }).sort((a, b) => a.pct - b.pct);
    topics = Object.entries(tagAcc).map(([tag, g]) => ({ tag, n: g.n, pct: Math.round(g.right / g.n * 100) })).sort((a, b) => a.pct - b.pct);
  }
  return { filters: f || {}, kpis: { attempts: n, people: new Set(rows.map(r => r.email)).size, avg, passRate, medianMinutes: median, flagged: n ? Math.round((tiers.some + tiers.major) / n * 100) : null },
    distribution: dist, trend, byTest, byAgent, tiers, questions: questions.slice(0, 60), topics: topics.slice(0, 20), rows: rows.slice(0, 500) };
}
/** One question, rewritten by the AI: clearer wording, better wrong options,
 *  an explanation. Same type and the same correct answer meaning. */
async function improveQuestion({ question, instruction, ai }) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const q = question || {};
  const system = [
    'You improve assessment questions for customer support agents at a dental and healthcare software company.',
    'Keep the same question type and the same correct answer meaning. Do not invent new facts or policies.',
    'Make the wording short and unambiguous, make every wrong option a plausible mistake of similar length, remove giveaways ("always", "never", "all of the above"), and write a one or two sentence explanation.',
    'Return JSON {"question":{"type":"...","prompt":"...","options":["..."],"correct":[index,...],"explanation":"...","tags":["..."],"difficulty":"easy|medium|hard"},"changes":"one short sentence on what you changed"}.',
    'For matching return "pairs": [["item","match"],...] instead of options. For ordering list the options in the correct order and "correct": [].',
  ].join('\n');
  const user = [instruction ? `Reviewer's request: ${clean(instruction, 500)}` : 'Improve this question.', 'Question JSON:', JSON.stringify({
    type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, pairs: q.pairs, explanation: q.explanation, tags: q.tags, difficulty: q.difficulty,
  }).slice(0, 6000)].join('\n');
  const r = await ai.bestJSON({ system, user, maxTokens: 2000, timeoutMs: 60000 });
  const out = r.json && r.json.question;
  if (!out || !out.prompt) throw httpError(502, 'The AI did not return a usable question. Try again.');
  if (out.type === 'matching' && Array.isArray(out.pairs)) out.options = out.pairs.map(p => ({ text: p[0], match: p[1] }));
  normQuestion({ ...out, correct: out.correct || [] }); // throws if unusable
  return { question: out, changes: clean(r.json.changes, 300), provider: r.provider };
}

// ── Session 65: modules, suggested names, assessments from drafts ────────
async function questionsForMeta(ids) {
  ids = Array.from(new Set((ids || []).map(Number).filter(Boolean))).slice(0, 200);
  if (!ids.length) return [];
  const rows = await all(`SELECT id, type, prompt, options_json, tags, explanation, module, sub_module, status FROM assess_questions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(i => byId.get(i)).filter(Boolean).map(r => ({ id: r.id, prompt: r.prompt, options: j(r.options_json, []).map(o => o.text), tags: r.tags ? r.tags.split(',').filter(Boolean) : [], explanation: r.explanation, module: r.module || '', subModule: r.sub_module || '' }));
}
async function moduleList() {
  const rows = await all(`SELECT module, sub_module, COUNT(*) AS n FROM assess_questions WHERE status != 'retired' AND module IS NOT NULL AND module != '' GROUP BY module, sub_module`);
  const subs = {}, count = {};
  rows.forEach(r => { count[r.module] = (count[r.module] || 0) + r.n; if (r.sub_module) (subs[r.module] = subs[r.module] || []).push(r.sub_module); });
  const tests = await all(`SELECT settings_json FROM assess_tests WHERE status != 'archived'`);
  tests.forEach(t => (j(t.settings_json, {}).modules || []).forEach(m => { (m.subs || []).forEach(x => { const a = (subs[m.key] = subs[m.key] || []); if (!a.some(y => y.toLowerCase() === x.toLowerCase())) a.push(x); }); }));
  return MODS.MODULES.map(m => ({ key: m.key, name: m.name, group: m.group, icon: m.icon, questions: count[m.key] || 0, subs: Array.from(new Set(subs[m.key] || [])).sort() }));
}
async function suggestMeta({ questionIds, ai, hint }) {
  const qs = await questionsForMeta(questionIds);
  if (!qs.length) throw httpError(400, 'Pick some questions first');
  const existing = {};
  (await moduleList()).forEach(m => { if (m.subs.length) existing[m.key] = m.subs; });
  const out = await MODS.suggest({ questions: qs, ai, existingSubs: existing, hint });
  out.modules = MODS.normModules(out.modules.map(m => ({ key: m.key, subs: m.subs })));
  return out;
}
/** Tags questions that have no module yet. Best effort. */
async function setQuestionModule(id, module, sub) {
  const k = MODS.moduleKey(module); if (!k) return;
  await run(`UPDATE assess_questions SET module = ?, sub_module = ?, updated_at = datetime('now') WHERE id = ? AND (module IS NULL OR module = '')`, [k, MODS.cleanSub(sub) || null, Number(id)]);
}
async function classifyQuestions(ids, ai, { force = false } = {}) {
  const qs = await questionsForMeta(ids);
  const todo = force ? qs : qs.filter(q => !q.module);
  if (!todo.length) return { tagged: 0 };
  const meta = await suggestMeta({ questionIds: todo.map(q => q.id), ai });
  let tagged = 0;
  for (const q of todo) {
    const pq = meta.perQuestion[q.id] || (meta.modules[0] ? { module: meta.modules[0].key, sub: (meta.modules[0].subs || [])[0] || '' } : null);
    if (!pq) continue;
    await run(`UPDATE assess_questions SET module = ?, sub_module = ?, updated_at = datetime('now') WHERE id = ?`, [pq.module, pq.sub || null, q.id]);
    tagged++;
  }
  return { tagged, meta };
}
/** One click: a draft assessment from a set of (draft) questions, with a
 *  suggested name, description, module tags and a "what this covers" list. */
async function testFromQuestions({ questionIds, approve = true, by, ai, title, description, secondsPerQuestion, hint }) {
  const ids = Array.from(new Set((questionIds || []).map(Number).filter(Boolean))).slice(0, 200);
  if (!ids.length) throw httpError(400, 'Pick some questions first');
  const meta = await suggestMeta({ questionIds: ids, ai, hint });
  for (const q of await questionsForMeta(ids)) {
    if (q.module) continue;
    const pq = meta.perQuestion[q.id]; if (!pq) continue;
    await run(`UPDATE assess_questions SET module = ?, sub_module = ?, updated_at = datetime('now') WHERE id = ?`, [pq.module, pq.sub || null, q.id]);
  }
  if (approve) await run(`UPDATE assess_questions SET status = 'approved', updated_at = datetime('now') WHERE status = 'draft' AND id IN (${ids.map(() => '?').join(',')})`, ids);
  const id = await saveTest(null, {
    title: clean(title, 160).trim() || meta.title || 'New assessment', description: description != null ? description : meta.description,
    questionIds: ids, status: 'draft',
    settings: { secondsPerQuestion: Math.max(15, Math.min(180, Number(secondsPerQuestion) || 40)), navigation: 'bank', explainCount: 1, modules: meta.modules, prep: meta.prep },
  }, by);
  return { id, title: clean(title, 160).trim() || meta.title, meta: { title: meta.title, description: meta.description, modules: MODS.resolve(meta.modules), prep: meta.prep, provider: meta.provider }, approved: !!approve };
}

module.exports = {
  questionFacets, tagUntagged, stopAttempt, aiWriteQuestions, moduleList, suggestMeta, classifyQuestions, setQuestionModule, testFromQuestions, retest, archivedTests, restoreTest, deleteTestForever, bankExport, resultRows, resultsCsv, reportData, improveQuestion,
  _normQuestion: normQuestion, saveQuestion, saveTest,
  setDB, initSchema, QUESTION_TYPES, OWNER_EMAIL, isOwner, setDeps,
  chatConfig, setChatConfig, announceTest, tick, autoSubmitAbandoned, adminLive, adminInsights, insightsCsv, myProgress,
  setQuestionImage, questionImage, currentImage, _periodOf: periodOf,
  suggestMark, reviewAttempt, duplicateTest, myResult,
  isReviewer, accessFor, accessOverview, setLinkMode, addGuests, removeGuest, addReviewer, removeReviewer, setExtraTime,
  listQuestions, allTags, saveQuestion, deleteQuestion, bulkQuestions, importCsv, generateFromText,
  adminTests, saveTest, archiveTest, testQuestions,
  myTests, startAttempt, current, answer, clientEvents, saveSnapshot, listSnapshots, getSnapshot,
  currentAudio, previewSpeech, purgeOldSnapshots, setPhotoDays, deleteSnapshotsFor,
  adminAttempts, adminAttemptDetail, reviewExplain, deleteAttempt, exportCsv, resetAttempt, submitAll,
  _integrityFrom: integrityFrom, _grade: grade, _parseCsv: parseCsv, _normSettings: normSettings,
};
