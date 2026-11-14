'use strict';
/**
 * Batch 336: the before and after test for Adit Expert. Takes past questions that already have a confirmed answer
 * (an agent marked it helpful, else the checker verified it), asks Expert again twice: once the old way (no Expert
 * library) and once the new way (with the library), and measures each run's AI cost and time. A grader that does not
 * know which is which then scores both against the confirmed answer. Nothing is logged as a real question and nothing
 * is sent anywhere. Admins start it from Settings > Expert library.
 */
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const one = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_eval_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT DEFAULT (datetime('now')), by_email TEXT, status TEXT, n INTEGER, done INTEGER DEFAULT 0, summary_json TEXT, finished_at TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS expert_eval_items (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, log_id INTEGER, question TEXT, reference TEXT,
    old_answer TEXT, new_answer TEXT, old_cost REAL, new_cost REAL, old_ms INTEGER, new_ms INTEGER, old_calls INTEGER, new_calls INTEGER, page TEXT, routine INTEGER, grade_json TEXT, error TEXT)`);
}

function answerText(a) {
  if (!a) return '';
  // Batch 338: the agent brief (bottom line, what was found, the reply) is part of the answer; leaving it out made some
  // answers look empty to the grader.
  const b = a.brief || {};
  const brief = [b.bottom_line ? 'Bottom line: ' + b.bottom_line : '', (b.found || []).length ? 'Found:\n' + b.found.map((x) => '- ' + x).join('\n') : '', b.reply ? 'Reply' + (b.reply_label ? ' (' + b.reply_label + ')' : '') + ':\n' + b.reply : '', (b.replies || []).filter((x) => x && x.text).map((x) => 'Reply' + (x.label ? ' (' + x.label + ')' : '') + ':\n' + x.text).join('\n\n'), (b.unknown || []).length ? 'Still to find out:\n' + b.unknown.map((x) => '- ' + x).join('\n') : ''];
  const out = brief.concat([a.answer, (a.steps || []).length ? 'Steps:\n' + a.steps.map((x, i) => (i + 1) + '. ' + x).join('\n') : '', (a.checks || []).length ? 'Checks:\n' + a.checks.map((x) => '- ' + x).join('\n') : '', a.say ? 'Say to the client:\n' + a.say : '', a.owner ? 'Owner: ' + (typeof a.owner === 'string' ? a.owner : (a.owner.who || '') + (a.owner.when ? ', ' + a.owner.when : '')) : '']);
  return out.filter(Boolean).join('\n\n').slice(0, 8000);
}

// Past questions with a confirmed answer, newest first, one per question. About a third are ticket questions (where the
// costly ticket history and cross-Adit lookups run); the grader is told the ticket may have moved on since.
async function pick(n) {
  const rows = await all(`SELECT id, question, mode, answer_json, vote, verified FROM expert_log WHERE answer_json IS NOT NULL AND (vote = 1 OR verified = 1)
    AND length(question) BETWEEN 12 AND 600 AND found = 1 ORDER BY (vote = 1) DESC, id DESC LIMIT ?`, [n * 6]).catch(() => []);
  const seen = new Set(), out = []; let tickets = 0; const maxTk = Math.max(1, Math.round(n / 3));
  for (const r of rows) {
    const isTk = /#?\b\d{6}\b/.test(r.question);
    if (isTk && tickets >= maxTk) continue;
    const k = one(r.question, 200).toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    let a = null; try { a = JSON.parse(r.answer_json); } catch (e) { continue; }
    const ref = answerText(a); if (ref.length < 60) continue;
    if (isTk) tickets++;
    out.push({ ticket: isTk, logId: r.id, question: r.question, mode: ['call', 'email', 'chat', 'reply', 'troubleshoot'].includes(r.mode) ? r.mode : '', reference: ref, why: r.vote === 1 ? 'marked helpful' : 'verified' });
    if (out.length >= n) break;
  }
  return out;
}

const GRADE_SYS = `You grade two answers from Adit's internal support assistant (Adit is software for dental, orthodontic, optometry and chiropractic practices) against a REFERENCE answer the support team already confirmed. Score each answer from 1 to 5 on: accuracy (agrees with the reference and contains nothing wrong or invented), completeness (covers what the reference covers that matters), actionable (exact steps, menu paths, who owns it, what to say). Mark "contradicts" true when the answer says something the reference says is wrong. An answer may be better than the reference when it is more exact; say so. Then pick the better answer overall, or "tie". When the question names a ticket, the ticket may have moved on since the reference was written: do not mark an answer down only for newer facts, judge how well it handles the ticket. No em or en dashes.
Return JSON {"X": {"accuracy": n, "completeness": n, "actionable": n, "contradicts": bool, "vs_reference": "better, same or worse"}, "Y": {...}, "better": "X, Y or tie", "why": "one line"}`;

async function grade(item, oldA, newA) {
  const flip = Math.random() < 0.5; // the grader never knows which one is new
  const X = flip ? newA : oldA, Y = flip ? oldA : newA;
  const r = await D.ai.bestJSON({ system: GRADE_SYS, user: `QUESTION:\n${item.question}\n\nREFERENCE (confirmed):\n${item.reference}\n\nANSWER X:\n${X}\n\nANSWER Y:\n${Y}`, maxTokens: 900, feature: 'expert-eval', timeoutMs: 90000, temperature: 0 });
  const j = (r && r.json) || {};
  const s = (o) => ({ accuracy: Number(o && o.accuracy) || 0, completeness: Number(o && o.completeness) || 0, actionable: Number(o && o.actionable) || 0, contradicts: !!(o && o.contradicts), vs_reference: one(o && o.vs_reference, 10) });
  const b = String(j.better || '').toUpperCase();
  return { old: s(flip ? j.Y : j.X), new: s(flip ? j.X : j.Y), better: b === 'TIE' || !b ? 'tie' : ((b === 'X') === flip ? 'new' : 'old'), why: one(j.why, 300) };
}

const U = () => require('./ai-usage');
async function once(item, noLibrary) {
  const t0 = Date.now();
  const { value, meter } = await U().meter(() => D.expert.ask({ question: item.question, mode: item.mode, depth: 'thinking', fresh: true, evalRun: true, noLibrary, email: 'expert-eval' }));
  return { text: answerText(value && value.answer), cost: meter.cost, calls: meter.calls, ms: Date.now() - t0, page: meter.page || null };
}

const TARGET = Number(process.env.EXPERT_ACCURACY_TARGET || 4.5); // Batch 337: accuracy comes first; 4.5 of 5 or better
let _running = null;
function status() { return _running ? Object.assign({}, _running) : null; }
// Batch 337: the same benchmark questions every time, so runs can be compared and the trend is real: the questions of
// the last test are kept, topped up with newer confirmed questions when more are asked for (fresh starts a new set).
async function benchmark(n, fresh) {
  const first = fresh ? null : await get(`SELECT run_id FROM expert_eval_items WHERE error IS NULL ORDER BY run_id DESC, id ASC LIMIT 1`).catch(() => null);
  const base = first ? (await all(`SELECT log_id, question, reference FROM expert_eval_items WHERE run_id = ? AND error IS NULL ORDER BY id`, [first.run_id])).map((r) => ({ logId: r.log_id, question: r.question, reference: r.reference, ticket: /#?\b\d{6}\b/.test(r.question), mode: '' })) : [];
  if (base.length >= n) return base.slice(0, n);
  const more = (await pick(n + base.length)).filter((x) => !base.some((b) => b.logId === x.logId));
  return base.concat(more).slice(0, n);
}
async function start({ n = 12, by = '', fresh = false } = {}) {
  if (_running) return { running: true, status: status() };
  if (!D.expert || !D.ai) throw new Error('Expert is not set up');
  n = Math.max(3, Math.min(40, Number(n) || 12));
  const items = await benchmark(n, fresh);
  if (!items.length) throw new Error('No past questions with a confirmed answer yet');
  const id = (await run(`INSERT INTO expert_eval_runs (by_email, status, n) VALUES (?, 'running', ?)`, [by, items.length])).lastID;
  _running = { id, n: items.length, done: 0 };
  (async () => {
    for (const it of items) {
      try {
        const a = await once(it, true);
        const b = await once(it, false);
        const g = await grade(it, a.text, b.text).catch((e) => ({ error: e.message }));
        await run(`INSERT INTO expert_eval_items (run_id, log_id, question, reference, old_answer, new_answer, old_cost, new_cost, old_ms, new_ms, old_calls, new_calls, page, routine, grade_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, it.logId, one(it.question, 600), it.reference, a.text, b.text, r4(a.cost), r4(b.cost), a.ms, b.ms, a.calls, b.calls, b.page ? b.page.title : '', b.page && b.page.routine ? 1 : 0, JSON.stringify(g)]);
      } catch (e) {
        await run(`INSERT INTO expert_eval_items (run_id, log_id, question, error) VALUES (?,?,?,?)`, [id, it.logId, one(it.question, 600), one(e.message, 300)]).catch(() => {});
      }
      _running.done++; await run(`UPDATE expert_eval_runs SET done = ? WHERE id = ?`, [_running.done, id]).catch(() => {});
    }
    const s = await summary(id);
    await run(`UPDATE expert_eval_runs SET status = 'done', summary_json = ?, finished_at = datetime('now') WHERE id = ?`, [JSON.stringify(s), id]);
    console.log('🧪 Expert before and after test:', JSON.stringify(s));
  })().catch((e) => console.warn('expert eval:', e.message)).finally(() => { _running = null; });
  return { started: true, id, n: items.length };
}

async function summary(id) {
  const rows = (await all(`SELECT * FROM expert_eval_items WHERE run_id = ? AND error IS NULL`, [id])).map((r) => { let g = {}; try { g = JSON.parse(r.grade_json || '{}'); } catch (e) { /* */ } return Object.assign(r, { g }); }).filter((r) => r.g && r.g.old);
  const n = rows.length; if (!n) return { n: 0 };
  const avg = (f) => Math.round(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0) / n * 100) / 100;
  const score = (x) => (x.accuracy + x.completeness + x.actionable) / 3;
  return {
    n,
    cost: { old: r4(avg((r) => r.old_cost)), new: r4(avg((r) => r.new_cost)) },
    seconds: { old: Math.round(avg((r) => r.old_ms) / 100) / 10, new: Math.round(avg((r) => r.new_ms) / 100) / 10 },
    quality: { old: avg((r) => score(r.g.old)), new: avg((r) => score(r.g.new)) },
    accuracy: { old: avg((r) => r.g.old.accuracy), new: avg((r) => r.g.new.accuracy) },
    contradicts: { old: rows.filter((r) => r.g.old.contradicts).length, new: rows.filter((r) => r.g.new.contradicts).length },
    wins: { new: rows.filter((r) => r.g.better === 'new').length, old: rows.filter((r) => r.g.better === 'old').length, tie: rows.filter((r) => r.g.better === 'tie').length },
    pages: rows.filter((r) => r.page).length, routine: rows.filter((r) => r.routine).length,
  };
}
async function latest() {
  const r = await get(`SELECT * FROM expert_eval_runs ORDER BY id DESC LIMIT 1`).catch(() => null);
  if (!r) return { run: null, running: status() };
  const items = await all(`SELECT id, question, old_cost, new_cost, old_ms, new_ms, page, routine, grade_json, error, old_answer, new_answer, reference FROM expert_eval_items WHERE run_id = ? ORDER BY id`, [r.id]).catch(() => []);
  let s = null; try { s = JSON.parse(r.summary_json || 'null'); } catch (e) { /* */ }
  const hist = (await all(`SELECT id, at, n, summary_json FROM expert_eval_runs WHERE status = 'done' ORDER BY id DESC LIMIT 10`).catch(() => [])).map((h) => { let x = null; try { x = JSON.parse(h.summary_json || 'null'); } catch (e) { /* */ } return x && x.n ? { id: h.id, at: h.at, n: x.n, accuracy: x.accuracy.new, quality: x.quality.new, cost: x.cost.new } : null; }).filter(Boolean);
  return { target: TARGET, history: hist, run: { id: r.id, at: r.at, status: r.status, n: r.n, done: r.done, summary: s || (r.status !== 'done' ? await summary(r.id) : null) }, running: status(),
    items: items.map((x) => { let g = null; try { g = JSON.parse(x.grade_json || 'null'); } catch (e) { /* */ } return Object.assign(x, { grade: g, grade_json: undefined }); }) };
}

module.exports = { setDB, setDeps, initSchema, pick, grade, start, status, summary, latest, _answerText: answerText };
