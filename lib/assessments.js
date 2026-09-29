/**
 * Session 56-57: Assessments (/assess, and embedded in the main app).
 *
 * Design notes (from how TestGorilla, HackerRank, Mettl and the Duolingo
 * English Test run remote tests):
 *  - Everything is graded on the server. Questions are served one at a
 *    time, the page never holds the whole test or any answer key.
 *  - Each question has a server-side deadline. Late answers score zero,
 *    reloading does not reset the clock, there is no going back.
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
const EXPLAIN_SEC = 90;         // time for an "explain your answer" follow-up
const OWNER_EMAIL = 'sebastin.n@adit.com';
const QUESTION_TYPES = new Set(['single', 'multi', 'truefalse']);
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
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_attempts_test ON assess_attempts(test_id, email)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_answers (
    attempt_id INTEGER NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, question_id INTEGER,
    ref_idx INTEGER, response_json TEXT, correct INTEGER, served_at TEXT, answered_at TEXT,
    elapsed_ms INTEGER, late INTEGER DEFAULT 0, replays INTEGER DEFAULT 0,
    review_score REAL, review_note TEXT, PRIMARY KEY (attempt_id, idx))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_answers_q ON assess_answers(question_id)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, idx INTEGER,
    type TEXT NOT NULL, detail TEXT, at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_events_attempt ON assess_events(attempt_id)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_guests (
    email TEXT PRIMARY KEY, note TEXT, added_by TEXT, added_at TEXT DEFAULT (datetime('now')), last_seen TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_extra_time (
    email TEXT PRIMARY KEY, pct INTEGER NOT NULL, added_by TEXT, added_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS assess_config (key TEXT PRIMARY KEY, value TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS assess_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, idx INTEGER,
    at TEXT DEFAULT (datetime('now')), img BLOB)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_assess_snapshots_attempt ON assess_snapshots(attempt_id)`);
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
const DEFAULT_SETTINGS = {
  secondsPerQuestion: 40, displayMode: 'fade', wordsPerChunk: 4, chunkMs: 1000,
  explainCount: 1, passPct: 70, attempts: 1, showScore: false, shuffleQuestions: true, shuffleOptions: true,
  watermark: 'off', camera: false, snapshotSec: 30,
  pool: { mode: 'fixed', tags: [], count: 10, difficulty: '' },
};
function normSettings(s) {
  const o = { ...DEFAULT_SETTINGS, ...(s || {}) };
  const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  const pool = { ...DEFAULT_SETTINGS.pool, ...(o.pool || {}) };
  return {
    secondsPerQuestion: clamp(o.secondsPerQuestion, 15, 180, 40),
    displayMode: o.displayMode === 'full' ? 'full' : 'fade',
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
    snapshotSec: clamp(o.snapshotSec, 15, 120, 30),
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
    extraTime: await all(`SELECT email, pct, added_by, added_at FROM assess_extra_time ORDER BY email`),
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
async function setExtraTime(email, pct, by) {
  const e = lc(email);
  if (!isAditEmail(e)) throw httpError(400, 'Use an @adit.com email');
  const n = Math.round(Number(pct));
  if (!Number.isFinite(n) || n <= 0) { await run(`DELETE FROM assess_extra_time WHERE email = ?`, [e]); return; }
  await run(`INSERT INTO assess_extra_time (email, pct, added_by) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET pct = excluded.pct, added_by = excluded.added_by`, [e, Math.min(200, n), lc(by)]);
}

// ── Question bank ─────────────────────────────────────────────────────
function normQuestion(b) {
  const type = QUESTION_TYPES.has(b.type) ? b.type : 'single';
  const prompt = clean(b.prompt, 1500).trim();
  if (prompt.length < 8) throw httpError(400, 'Write the question (at least a few words)');
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
  };
}

async function questionStats(ids) {
  const where = ids && ids.length ? `AND question_id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = await all(`SELECT question_id AS id, COUNT(*) AS shown, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS right_n,
      AVG(CASE WHEN late = 0 THEN elapsed_ms END) AS avg_ms, MAX(served_at) AS last_used
      FROM assess_answers WHERE kind = 'q' ${where} GROUP BY question_id`, ids || []);
  return new Map(rows.map(r => [r.id, r]));
}
function statFlag(st) {
  if (!st || st.shown < 5) return null;
  const pct = st.right_n / st.shown;
  if (pct >= 0.9) return 'Almost everyone gets this right. It may be too easy, or it may have leaked.';
  if (pct <= 0.3) return 'Most people get this wrong. Check the wording and the answer key.';
  return null;
}

async function listQuestions({ q, tag, status, type } = {}) {
  const where = [], p = [];
  if (status) { where.push('status = ?'); p.push(status); } else where.push(`status != 'retired'`);
  if (type) { where.push('type = ?'); p.push(type); }
  if (tag) { where.push(`(',' || tags || ',') LIKE ?`); p.push(`%,${lc(tag)},%`); }
  if (q) { where.push('(prompt LIKE ? OR options_json LIKE ? OR tags LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await all(`SELECT * FROM assess_questions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`, p);
  const stats = await questionStats(rows.map(r => r.id));
  const tests = await all(`SELECT id, title, question_ids_json FROM assess_tests WHERE status != 'archived'`);
  return rows.map(r => {
    const st = stats.get(r.id);
    const usedIn = tests.filter(t => j(t.question_ids_json, []).map(Number).includes(r.id)).map(t => t.title);
    return {
      id: r.id, type: r.type, prompt: r.prompt, options: j(r.options_json, []).map(o => o.text), correct: j(r.answer_json, []),
      explanation: r.explanation, tags: r.tags ? r.tags.split(',').filter(Boolean) : [], difficulty: r.difficulty, status: r.status,
      source: r.source, createdBy: r.created_by, updatedAt: r.updated_at, usedIn,
      stats: st ? { shown: st.shown, pctCorrect: Math.round(st.right_n / st.shown * 100), avgSec: st.avg_ms != null ? Math.round(st.avg_ms / 100) / 10 : null, lastUsed: st.last_used, flag: statFlag(st) } : { shown: 0 },
    };
  });
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
    if (!ex) throw httpError(404, 'Question not found');
    await run(`UPDATE assess_questions SET type=?, prompt=?, options_json=?, answer_json=?, explanation=?, tags=?, difficulty=?, status=?, source=COALESCE(?, source), updated_at=datetime('now') WHERE id=?`,
      [q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.explanation, q.tags, q.difficulty, q.status, q.source, ex.id]);
    return ex.id;
  }
  const r = await run(`INSERT INTO assess_questions (type, prompt, options_json, answer_json, explanation, tags, difficulty, status, created_by, source) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.explanation, q.tags, q.difficulty, q.status, lc(by), q.source]);
  return r.lastID;
}
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
    const correct = type === 'truefalse' ? letters.map(l => (l === 'T' || l === 'TRUE' || l === 'A') ? 0 : 1) : letters.map(l => l.charCodeAt(0) - 65);
    try {
      await saveQuestion(null, { type, prompt: row[qi], options, correct, tags: col('tags') >= 0 ? row[col('tags')] : '', difficulty: col('difficulty') >= 0 ? lc(row[col('difficulty')]) : 'medium', explanation: col('explanation') >= 0 ? row[col('explanation')] : '', status: 'draft', source: sourceName ? `CSV: ${sourceName}` : 'CSV import' }, by);
      out.imported++;
    } catch (e) { out.errors.push(`Row ${r + 1}: ${e.message}`); }
  }
  return out;
}

/** Drafts questions from a document with AI. Everything lands as a draft
 *  for a reviewer to edit and approve. */
async function generateFromText({ text, count, types, focus, difficulty, sourceName, by, ai }) {
  if (!ai || !ai.isConfigured()) throw httpError(503, 'AI is not configured on the server (OPENAI_API_KEY).');
  const body = clean(text, 60000).replace(/\s+\n/g, '\n').trim();
  if (body.length < 200) throw httpError(400, 'There is not enough text in this document to write questions from.');
  const n = Math.min(25, Math.max(1, Math.round(Number(count) || 10)));
  const allowed = (Array.isArray(types) && types.length ? types : ['single', 'multi', 'truefalse']).filter(t => QUESTION_TYPES.has(t));
  const diff = DIFFICULTIES.has(difficulty) ? difficulty : 'mixed';
  const system = [
    'You write assessment questions for customer support agents at a dental and healthcare software company.',
    'Use ONLY facts stated in the source document. Never invent policies, numbers, team names or timelines.',
    'Prefer scenario and judgement questions ("A customer says X. What do you do first?") that test whether the agent knows the internal process, owners, escalation paths, time limits and edge cases in the document, over definitions that anyone could look up.',
    'Wrong options must be plausible mistakes a new agent could make. Do not use "All of the above", "None of the above", jokes, or options that give the answer away by length or wording.',
    'Keep each question under 45 words and each option under 20 words. Plain, clear English.',
    'Return JSON: {"questions":[{"type":"single|multi|truefalse","prompt":"...","options":["..."],"correct":[index,...],"explanation":"one or two sentences citing the document","tags":["topic"],"difficulty":"easy|medium|hard"}]}.',
    'single: 4 options, exactly one correct. multi: 4 or 5 options, two or more correct. truefalse: options ["True","False"].',
  ].join('\n');
  const user = [
    `Write ${n} questions. Allowed types: ${allowed.join(', ')}. Difficulty: ${diff}.`,
    focus ? `Focus on: ${clean(focus, 400)}` : '',
    `Source document${sourceName ? ` (${clean(sourceName, 120)})` : ''}:\n"""\n${body}\n"""`,
  ].filter(Boolean).join('\n\n');
  const r = await ai.chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens: 6000, temperature: 0.4, timeoutMs: 90000 });
  const list = (r.json && Array.isArray(r.json.questions)) ? r.json.questions : [];
  const ids = [], errors = [];
  for (const q of list.slice(0, n)) {
    try {
      if (!allowed.includes(q.type)) q.type = allowed[0];
      ids.push(await saveQuestion(null, { ...q, status: 'draft', source: sourceName ? `AI draft: ${clean(sourceName, 120)}` : 'AI draft' }, by));
    } catch (e) { errors.push(e.message); }
  }
  if (!ids.length) throw httpError(502, 'The AI did not return usable questions. Try again, or narrow the focus.');
  return { created: ids.length, ids, errors };
}

// ── Tests (reviewer) ──────────────────────────────────────────────────
async function adminTests() {
  const tests = await all(`SELECT * FROM assess_tests WHERE status != 'archived' ORDER BY id DESC`);
  const out = [];
  for (const t of tests) {
    const st = await get(`SELECT COUNT(*) AS n, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS done,
      AVG(CASE WHEN status='submitted' AND max_score > 0 THEN score * 100.0 / max_score END) AS avg_pct FROM assess_attempts WHERE test_id = ?`, [t.id]);
    const s = normSettings(j(t.settings_json, {}));
    out.push({ id: t.id, title: t.title, description: t.description || '', status: t.status, questionIds: j(t.question_ids_json, []),
      settings: s, assign: normAssign(j(t.assign_json, {})), attempts: st.n || 0, submitted: st.done || 0,
      avgPct: st.avg_pct != null ? Math.round(st.avg_pct) : null, poolSize: s.pool.mode === 'random' ? await poolSize(s.pool) : null, updatedAt: t.updated_at });
  }
  return out;
}
async function poolQuestions(pool) {
  const where = [`status = 'approved'`], p = [];
  if (pool.tags && pool.tags.length) { where.push('(' + pool.tags.map(() => `(',' || tags || ',') LIKE ?`).join(' OR ') + ')'); pool.tags.forEach(t => p.push(`%,${t},%`)); }
  if (pool.difficulty) { where.push('difficulty = ?'); p.push(pool.difficulty); }
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
    return t.id;
  }
  const r = await run(`INSERT INTO assess_tests (title, description, question_ids_json, settings_json, assign_json, status, created_by) VALUES (?,?,?,?,?,?,?)`,
    [title, description, JSON.stringify(qids), JSON.stringify(settings), JSON.stringify(assign), status, lc(by)]);
  return r.lastID;
}
async function archiveTest(id) {
  const has = await get(`SELECT 1 FROM assess_attempts WHERE test_id = ? LIMIT 1`, [Number(id)]);
  if (has) await run(`UPDATE assess_tests SET status='archived', updated_at=datetime('now') WHERE id=?`, [Number(id)]);
  else await run(`DELETE FROM assess_tests WHERE id = ?`, [Number(id)]);
}
async function testQuestions(id) {
  const t = await get(`SELECT question_ids_json FROM assess_tests WHERE id = ?`, [Number(id)]);
  if (!t) throw httpError(404, 'Assessment not found');
  const ids = j(t.question_ids_json, []).map(Number);
  if (!ids.length) return [];
  const rows = await all(`SELECT id, type, prompt, status, tags, difficulty FROM assess_questions WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(i => byId.get(i)).filter(Boolean).map(r => ({ id: r.id, type: r.type, prompt: r.prompt, status: r.status, tags: r.tags ? r.tags.split(',').filter(Boolean) : [], difficulty: r.difficulty }));
}

// ── Taker side ────────────────────────────────────────────────────────
function assignedTo(test, email) {
  const a = j(test.assign_json, {});
  return !!(a.everyone || (Array.isArray(a.emails) && a.emails.map(lc).includes(lc(email))));
}
async function extraPctFor(email) { const r = await get(`SELECT pct FROM assess_extra_time WHERE email = ?`, [lc(email)]); return r ? r.pct : 0; }
function withExtra(sec, pct) { return Math.round(sec * (1 + (pct || 0) / 100)); }

async function myTests(email) {
  const tests = await all(`SELECT * FROM assess_tests WHERE status = 'published' ORDER BY id DESC`);
  const extra = await extraPctFor(email);
  const out = [];
  for (const t of tests) {
    if (!assignedTo(t, email)) continue;
    const s = normSettings(j(t.settings_json, {}));
    const atts = await all(`SELECT id, status, score, max_score, finished_at FROM assess_attempts WHERE test_id = ? AND email = ? ORDER BY id`, [t.id, lc(email)]);
    const done = atts.filter(a => a.status !== 'in_progress');
    const open = atts.find(a => a.status === 'in_progress');
    const last = done[done.length - 1];
    const nQ = s.pool.mode === 'random' ? Math.min(s.pool.count, await poolSize(s.pool)) : j(t.question_ids_json, []).length;
    const sec = withExtra(s.secondsPerQuestion, extra);
    out.push({
      id: t.id, title: t.title, description: t.description || '',
      questions: nQ, secondsPerQuestion: sec, explainCount: Math.min(s.explainCount, nQ), extraPct: extra,
      estMinutes: Math.max(1, Math.ceil((nQ * sec + Math.min(s.explainCount, nQ) * withExtra(EXPLAIN_SEC, extra)) / 60)),
      displayMode: s.displayMode, camera: s.camera, snapshotSec: s.snapshotSec, watermark: s.watermark,
      attemptsAllowed: s.attempts, attemptsUsed: atts.length, inProgress: !!open,
      canStart: !!open || atts.length < s.attempts,
      last: last ? { finishedAt: last.finished_at, score: s.showScore ? last.score : null, maxScore: s.showScore ? last.max_score : null } : null,
    });
  }
  return out;
}

function publicSettings(s, extra) {
  return { secondsPerQuestion: withExtra(s.secondsPerQuestion, extra), displayMode: s.displayMode, wordsPerChunk: s.wordsPerChunk, chunkMs: s.chunkMs,
    explainSeconds: withExtra(EXPLAIN_SEC, extra), watermark: s.watermark, camera: s.camera, snapshotSec: s.snapshotSec };
}

async function startAttempt({ testId, email, name, ua }) {
  const t = await get(`SELECT * FROM assess_tests WHERE id = ?`, [Number(testId)]);
  if (!t || t.status !== 'published' || !assignedTo(t, email)) throw httpError(403, 'This assessment is not assigned to you');
  const s = normSettings(j(t.settings_json, {}));
  const token = crypto.randomBytes(18).toString('hex');
  const open = await get(`SELECT * FROM assess_attempts WHERE test_id = ? AND email = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`, [t.id, lc(email)]);
  if (open) {
    if (open.client_token) await logEvent(open.id, open.current_idx, 'resumed', 'Opened again; the earlier tab was closed off');
    await run(`UPDATE assess_attempts SET client_token = ? WHERE id = ?`, [token, open.id]);
    return { attemptId: open.id, token, resumed: true, title: t.title, settings: publicSettings(s, open.extra_pct), total: j(open.plan_json, []).length };
  }
  const used = await get(`SELECT COUNT(*) AS n FROM assess_attempts WHERE test_id = ? AND email = ?`, [t.id, lc(email)]);
  if ((used && used.n) >= s.attempts) throw httpError(409, 'No attempts left on this assessment');

  let qids;
  if (s.pool.mode === 'random') qids = shuffle((await poolQuestions(s.pool)).map(r => r.id)).slice(0, s.pool.count);
  else qids = j(t.question_ids_json, []).map(Number).filter(Boolean);
  const rows = qids.length ? await all(`SELECT id, options_json FROM assess_questions WHERE status != 'retired' AND id IN (${qids.map(() => '?').join(',')})`, qids) : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  qids = qids.filter(id => byId.has(id));
  if (!qids.length) throw httpError(409, 'This assessment has no questions yet');
  if (s.shuffleQuestions) qids = shuffle(qids);
  const plan = qids.map(id => {
    const opts = j(byId.get(id).options_json, []).map(o => o.id);
    return { kind: 'q', qid: id, opt: s.shuffleOptions ? shuffle(opts) : opts };
  });
  const nExplain = Math.min(s.explainCount, plan.length);
  const picks = shuffle(plan.map((_, i) => i)).slice(0, nExplain).sort((a, b) => a - b);
  for (const ref of picks) plan.push({ kind: 'explain', ref });
  const extra = await extraPctFor(email);
  const r = await run(`INSERT INTO assess_attempts (test_id, email, name, plan_json, client_token, ua, extra_pct) VALUES (?,?,?,?,?,?,?)`,
    [t.id, lc(email), clean(name, 120), JSON.stringify(plan), token, clean(ua, 300), extra]);
  await logEvent(r.lastID, 0, 'started', extra ? `Extra time +${extra}%` : null);
  return { attemptId: r.lastID, token, resumed: false, title: t.title, settings: publicSettings(s, extra), total: plan.length };
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
async function testSettingsFor(a) {
  const t = await get(`SELECT settings_json FROM assess_tests WHERE id = ?`, [a.test_id]);
  return normSettings(j(t && t.settings_json, {}));
}

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
  const secs = secondsFor(item, s, a.extra_pct);
  const leftMs = Math.max(0, Date.parse(a.current_served_at) + secs * 1000 - Date.now());
  const qCount = plan.filter(p => p.kind === 'q').length;
  const base = { done: false, idx: a.current_idx, total: plan.length, qCount, seconds: secs, leftMs, kind: item.kind };
  if (item.kind === 'explain') {
    const refItem = plan[item.ref];
    const q = await get(`SELECT prompt FROM assess_questions WHERE id = ?`, [refItem.qid]);
    return { ...base, type: 'explain', about: clean(q && q.prompt, 600), prompt: 'In your own words, explain why the right answer is right, and what you would do next with the customer.' };
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
  if (Number(idx) !== a.current_idx) throw httpError(409, 'That question has already closed', 'moved');
  if (!a.current_served_at) throw httpError(409, 'Question was not served');
  const item = plan[a.current_idx];
  const elapsed = Date.now() - Date.parse(a.current_served_at);
  const late = elapsed > secondsFor(item, s, a.extra_pct) * 1000 + GRACE_MS ? 1 : 0;
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

const EVENT_TYPES = new Set(['blur', 'focus', 'hidden', 'visible', 'fullscreen_exit', 'fullscreen_enter', 'copy', 'cut', 'paste', 'contextmenu',
  'printscreen', 'devtools_key', 'mouse_out', 'resize', 'replay', 'print', 'select', 'camera_on', 'camera_off', 'camera_denied', 'multi_screen', 'auto_submit']);
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

async function saveSnapshot({ attemptId, email, token, idx, image }) {
  const a = await loadOwnedAttempt(attemptId, email, token);
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
  if (!m) throw httpError(400, 'Bad image');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 200000) throw httpError(413, 'Image too large');
  const cnt = await get(`SELECT COUNT(*) AS n FROM assess_snapshots WHERE attempt_id = ?`, [a.id]);
  if (cnt.n >= 400) return false;
  await run(`INSERT INTO assess_snapshots (attempt_id, idx, img) VALUES (?,?,?)`, [a.id, Number.isInteger(idx) ? idx : null, buf]);
  return true;
}
async function listSnapshots(attemptId) { return all(`SELECT id, idx, at FROM assess_snapshots WHERE attempt_id = ? ORDER BY id`, [Number(attemptId)]); }
async function getSnapshot(id) { const r = await get(`SELECT img FROM assess_snapshots WHERE id = ?`, [Number(id)]); return r ? r.img : null; }

/** Behaviour tier, the way TestGorilla and HackerRank report it: signals
 *  worth a conversation, never proof on their own. */
function integrityFrom(events, answers, settings) {
  const c = {};
  for (const e of events) c[e.type] = (c[e.type] || 0) + 1;
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
    const events = await all(`SELECT type FROM assess_events WHERE attempt_id = ?`, [a.id]);
    const integ = integrityFrom(events, answers.map(x => ({ ...x, allowedMs: withExtra(s.secondsPerQuestion, a.extra_pct) * 1000 })), s);
    await run(`UPDATE assess_attempts SET status = 'submitted', finished_at = ?, score = ?, max_score = ?, integrity_json = ?, client_token = NULL WHERE id = ?`,
      [nowIso(), score, qItems, JSON.stringify(integ), a.id]);
    await logEvent(a.id, null, 'submitted', null);
  }
  return s.showScore ? { score, maxScore: qItems, pct: qItems ? Math.round(score / qItems * 100) : 0, passed: qItems ? score / qItems * 100 >= s.passPct : false, passPct: s.passPct } : { hidden: true };
}

// ── Results (reviewer) ────────────────────────────────────────────────
async function adminAttempts(testId) {
  const rows = await all(`SELECT a.id, a.test_id, a.email, a.name, a.status, a.started_at, a.finished_at, a.score, a.max_score, a.integrity_json, a.current_idx, a.plan_json,
      (SELECT COUNT(*) FROM assess_snapshots s WHERE s.attempt_id = a.id) AS snaps,
      (SELECT COUNT(*) FROM assess_answers x WHERE x.attempt_id = a.id AND x.kind = 'explain' AND x.review_score IS NULL AND x.response_json IS NOT NULL) AS unmarked
      FROM assess_attempts a WHERE a.test_id = ? ORDER BY a.id DESC`, [Number(testId)]);
  const t = await get(`SELECT settings_json FROM assess_tests WHERE id = ?`, [Number(testId)]);
  const passPct = normSettings(j(t && t.settings_json, {})).passPct;
  return rows.map(r => {
    const integ = j(r.integrity_json, null);
    const total = j(r.plan_json, []).length;
    return { id: r.id, email: r.email, name: r.name, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at,
      score: r.score, maxScore: r.max_score, pct: r.max_score ? Math.round(r.score / r.max_score * 100) : null, passed: r.max_score ? r.score / r.max_score * 100 >= passPct : null,
      tier: integ ? integ.tier || null : null, flags: integ && Array.isArray(integ.flags) ? integ.flags.map(f => typeof f === 'string' ? f : f.text) : [],
      snapshots: r.snaps, unmarked: r.unmarked, progress: `${Math.min(r.current_idx, total)}/${total}` };
  });
}

async function adminAttemptDetail(attemptId) {
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
        elapsedMs: ans ? ans.elapsed_ms : null, answered: !!ans, reviewScore: ans ? ans.review_score : null, reviewNote: ans ? ans.review_note : null };
    }
    const q = qById.get(p.qid) || {};
    const opts = j(q.options_json, []);
    const text = (id) => (opts.find(o => o.id === id) || {}).text || `Option ${id}`;
    return { idx: i, kind: 'q', type: q.type, prompt: q.prompt, explanation: q.explanation || null, shownOrder: p.opt.map(text),
      correctAnswer: j(q.answer_json, []).map(text), chosen: resp ? (resp.chosen || []).map(text) : null,
      correct: ans ? ans.correct === 1 : false, late: !!(ans && ans.late), answered: !!ans,
      elapsedMs: ans ? ans.elapsed_ms : null, replays: ans ? ans.replays : 0 };
  });
  const events = await all(`SELECT idx, type, detail, at FROM assess_events WHERE attempt_id = ? ORDER BY id`, [a.id]);
  const t = await get(`SELECT title, settings_json FROM assess_tests WHERE id = ?`, [a.test_id]);
  const s = normSettings(j(t && t.settings_json, {}));
  let integ = j(a.integrity_json, null);
  if (integ && Array.isArray(integ.flags) && integ.flags.length && typeof integ.flags[0] === 'string') integ = { tier: integ.score >= 85 ? 'none' : integ.score >= 60 ? 'some' : 'major', flags: integ.flags.map(f => ({ text: f, level: 'some' })) };
  return { id: a.id, testId: a.test_id, testTitle: t ? t.title : '', email: a.email, name: a.name, status: a.status,
    startedAt: a.started_at, finishedAt: a.finished_at, score: a.score, maxScore: a.max_score, ua: a.ua, extraPct: a.extra_pct || 0,
    passPct: s.passPct, camera: s.camera, integrity: integ, items, events, snapshots: await listSnapshots(a.id) };
}

async function reviewExplain(attemptId, idx, { score, note }) {
  const n = score == null || score === '' ? null : Math.max(0, Math.min(1, Number(score)));
  await run(`UPDATE assess_answers SET review_score = ?, review_note = ? WHERE attempt_id = ? AND idx = ? AND kind = 'explain'`,
    [Number.isFinite(n) ? n : null, clean(note, 1000), Number(attemptId), Number(idx)]);
}
async function deleteAttempt(attemptId) {
  for (const tbl of ['assess_answers', 'assess_events', 'assess_snapshots']) await run(`DELETE FROM ${tbl} WHERE attempt_id = ?`, [Number(attemptId)]);
  await run(`DELETE FROM assess_attempts WHERE id = ?`, [Number(attemptId)]);
}
async function exportCsv(testId) {
  const rows = await adminAttempts(testId);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const tierLabel = { none: 'No issues', some: 'Some issues', major: 'Major issues' };
  const head = ['Name', 'Email', 'Status', 'Started (UTC)', 'Finished (UTC)', 'Score', 'Out of', 'Percent', 'Result', 'Behaviour', 'Flags', 'Written answers to mark'];
  const lines = rows.map(r => [r.name, r.email, r.status, r.startedAt, r.finishedAt, r.score, r.maxScore, r.pct != null ? r.pct + '%' : '',
    r.passed == null ? '' : (r.passed ? 'Pass' : 'Below pass'), tierLabel[r.tier] || '', (r.flags || []).join('; '), r.unmarked].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

module.exports = {
  setDB, initSchema, QUESTION_TYPES,
  isReviewer, accessFor, accessOverview, setLinkMode, addGuests, removeGuest, addReviewer, removeReviewer, setExtraTime,
  listQuestions, allTags, saveQuestion, deleteQuestion, bulkQuestions, importCsv, generateFromText,
  adminTests, saveTest, archiveTest, testQuestions,
  myTests, startAttempt, current, answer, clientEvents, saveSnapshot, listSnapshots, getSnapshot,
  adminAttempts, adminAttemptDetail, reviewExplain, deleteAttempt, exportCsv,
  _integrityFrom: integrityFrom, _grade: grade, _parseCsv: parseCsv, _normSettings: normSettings,
};
