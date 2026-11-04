'use strict';
/**
 * Batch 242 (from Aria's "Ask Aria fixes"): when Expert could not answer a question (not found, or it handed the lookup
 * back to the agent), the question is queued. A worker (at most 5 a day) looks for the answer the way a lead would:
 * how the team solved it before and what the data shows, then proposes a team note for an admin to approve. Approving
 * saves the note, asks the question again, and sends the person who asked a Google Chat message with the new answer.
 * Nothing is learned without an admin's approval.
 */
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const lc = (s) => String(s || '').trim().toLowerCase();
const one = (s, n = 400) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
const clean = (s, n = 4000) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').trim().slice(0, n);
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const MAX_PER_DAY = 5;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_gapfix (id INTEGER PRIMARY KEY AUTOINCREMENT, log_id INTEGER, email TEXT, question TEXT NOT NULL,
    qkey TEXT, gap TEXT, ticket TEXT, answer TEXT, status TEXT NOT NULL DEFAULT 'queued', proposal_json TEXT, error TEXT, extra_emails TEXT,
    decided_by TEXT, decided_at TEXT, note_id INTEGER, rerun_share TEXT, notified TEXT, built_at TEXT, created_at TEXT DEFAULT (datetime('now')))`);
}
const qkeyOf = (q) => lc(q).replace(/#?\d{5,7}/g, '#').replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

/** Called by Expert when an answer is a gap. The same question asked again while its fix is open joins that fix. */
async function enqueue({ logId, email, question, gap, answer, ticket }) {
  if (!_db || !question) return null;
  const k = qkeyOf(question);
  const open = await get(`SELECT id, email, extra_emails FROM expert_gapfix WHERE qkey = ? AND status IN ('queued','proposed') ORDER BY id DESC LIMIT 1`, [k]);
  if (open) {
    const extra = new Set(String(open.extra_emails || '').split(',').filter(Boolean));
    if (lc(email) && lc(email) !== lc(open.email)) extra.add(lc(email));
    await run(`UPDATE expert_gapfix SET extra_emails = ? WHERE id = ?`, [[...extra].join(','), open.id]);
    return open.id;
  }
  const r = await run(`INSERT INTO expert_gapfix (log_id, email, question, qkey, gap, ticket, answer) VALUES (?,?,?,?,?,?,?)`, [logId || null, lc(email), clean(question, 1500), k, one(gap, 80), String(ticket || ''), clean(answer, 1500)]);
  return r.lastID;
}

const PROPOSE_SYS = `You help Adit Expert (the assistant for Adit's T1 support agents) learn a question it could not answer. You get the question, why Expert failed, what Expert said, and what a search of Adit's own records found (how the team handled the same request before, and other facts).
Write ONE team note that would let Expert answer this kind of question correctly next time, using only what the evidence shows. A note is short, general (not about one client), plain, and says what T1 does, what Adit can and cannot do, and who owns it when it is not T1. Never invent a feature, setting, price, policy or owner. If the evidence does not settle it, set "fix" to false and say what a lead needs to tell Expert.
Reply with JSON: {"fix": true or false, "why_failed": "one line: why Expert could not answer (for example no Help Center article, the fact is only in past tickets, it did not know who owns it)", "title": "short note title", "body": "the note, 2 to 6 sentences", "module": "product area or ''", "evidence": ["ticket numbers or records it rests on, with one line each"], "confidence": "high, medium or low", "ask_lead": "when fix is false: the exact question a lead should answer, else ''"}. No em or en dashes.`;

let _busy = false;
/** Builds the next proposal. Returns the row id it worked on, or null. */
async function work() {
  if (_busy || !_db || !D.investigate || !D.ai) return null;
  const today = new Date().toISOString().slice(0, 10);
  const built = await get(`SELECT COUNT(*) AS n FROM expert_gapfix WHERE substr(built_at,1,10) = ?`, [today]);
  if (built && built.n >= MAX_PER_DAY) return null;
  const row = await get(`SELECT * FROM expert_gapfix WHERE status = 'queued' ORDER BY id LIMIT 1`);
  if (!row) return null;
  _busy = true;
  try {
    const INV = D.investigate;
    const [prec, look] = await Promise.all([
      INV.isConfigured() ? INV.investigate({ goal: 'precedent', question: row.question, budgetMs: 70000, maxCalls: 14 }).catch(() => null) : null,
      INV.isConfigured() && INV.needsLookup(row.question, null, null) ? INV.investigate({ question: row.question, budgetMs: 60000, maxCalls: 12 }).catch(() => null) : null,
    ]);
    const evidence = [prec && prec.summary ? 'How the team handled it before:\n' + prec.summary : '', look && look.summary ? 'Other facts found:\n' + look.summary : ''].filter(Boolean).join('\n\n') || '(the search found nothing)';
    const user = `Question: ${row.question}\nWhy it was flagged: ${row.gap}\nWhat Expert answered: ${row.answer || '(nothing)'}\n\nEvidence:\n${evidence.slice(0, 14000)}`;
    const r = await D.ai.bestJSON({ system: PROPOSE_SYS, user, maxTokens: 1500, timeoutMs: 90000, temperature: 0 });
    const j = (r && r.json) || {};
    const p = { fix: j.fix !== false && !!j.title && !!j.body, why_failed: one(j.why_failed, 300), title: one(j.title, 160), body: clean(j.body, 2000), module: one(j.module, 80),
      evidence: (Array.isArray(j.evidence) ? j.evidence : []).map((x) => one(x, 240)).filter(Boolean).slice(0, 6), confidence: ['high', 'medium', 'low'].includes(lc(j.confidence)) ? lc(j.confidence) : 'medium', ask_lead: one(j.ask_lead, 400),
      searched: (prec ? prec.steps.length : 0) + (look ? look.steps.length : 0) };
    await run(`UPDATE expert_gapfix SET status = 'proposed', proposal_json = ?, built_at = datetime('now'), error = NULL WHERE id = ?`, [JSON.stringify(p), row.id]);
    await notifyAdmins(row, p).catch(() => {});
    return row.id;
  } catch (e) {
    await run(`UPDATE expert_gapfix SET status = 'failed', error = ?, built_at = datetime('now') WHERE id = ?`, [one(e.message, 300), row.id]).catch(() => {});
    return row.id;
  } finally { _busy = false; }
}

async function notifyAdmins(row, p) {
  if (!D.dm || !D.admins) return;
  const to = await D.admins();
  const link = (D.publicUrl || '') + '/guides#teach';
  const text = `Adit Expert could not answer a question and has a fix for you to check.\n\nQuestion: ${one(row.question, 300)}\nWhat went wrong: ${p.why_failed || row.gap}\n` +
    (p.fix ? `Proposed note: ${p.title}\n${one(p.body, 700)}\n` : `It needs a lead to answer: ${p.ask_lead || 'see the details'}\n`) + `\nApprove or reject it in Expert > Teach: ${link}`;
  const sent = [];
  for (const e of to.slice(0, 5)) { try { await D.dm({ toEmail: e, text }); sent.push(e); } catch (err) { /* one person failing does not stop the rest */ } }
  if (sent.length) await run(`UPDATE expert_gapfix SET notified = ? WHERE id = ?`, [sent.join(','), row.id]);
}

async function list() {
  const rows = await all(`SELECT * FROM expert_gapfix WHERE status IN ('queued','proposed','failed') OR datetime(created_at) >= datetime('now','-14 days') ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'queued' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END, id DESC LIMIT 60`);
  return rows.map((r) => { let p = null; try { p = JSON.parse(r.proposal_json || 'null'); } catch (e) { /* bad row */ }
    return { id: r.id, question: r.question, gap: r.gap, ticket: r.ticket, email: r.email, others: String(r.extra_emails || '').split(',').filter(Boolean).length, status: r.status, proposal: p, error: r.error, decidedBy: r.decided_by, decidedAt: r.decided_at, rerunShare: r.rerun_share, at: r.created_at }; });
}

/** Approve: save the note (as edited), ask again for the person who asked, and tell them. */
async function approve(id, { title, body, module } = {}, by) {
  const row = await get(`SELECT * FROM expert_gapfix WHERE id = ?`, [Number(id)]);
  if (!row) throw httpError(404, 'Not found');
  if (row.status !== 'proposed') throw httpError(409, 'This fix is not waiting for approval');
  let p = {}; try { p = JSON.parse(row.proposal_json || '{}'); } catch (e) { /* use the edit */ }
  const t = one(title || p.title, 160), b = clean(body || p.body, 4000);
  if (t.length < 3 || b.length < 10) throw httpError(400, 'Give the note a title and a few sentences');
  const noteId = await D.saveNote(null, { title: t, body: b, module: one(module != null ? module : p.module, 80), kind: 'note', source: 'gapfix' }, by);
  await run(`UPDATE expert_gapfix SET status = 'approved', decided_by = ?, decided_at = datetime('now'), note_id = ? WHERE id = ?`, [lc(by), noteId, row.id]);
  // Ask again and tell the people who asked (in the background: approving returns at once).
  (async () => {
    try {
      const v = await D.ask({ question: row.question, email: row.email || by, fresh: true, depth: 'thinking' });
      const shareId = D.share ? await D.share(row.email || by, [{ q: row.question, mode: v.mode, j: v }]) : null;
      const link = shareId ? (D.publicUrl || '') + '/guides#ask/share/' + shareId : '';
      await run(`UPDATE expert_gapfix SET rerun_share = ? WHERE id = ?`, [shareId, row.id]);
      if (D.dm && link) {
        const people = [row.email].concat(String(row.extra_emails || '').split(',')).map(lc).filter(Boolean);
        for (const e of [...new Set(people)].slice(0, 10)) {
          await D.dm({ toEmail: e, text: `Sorry I could not answer your question well before: "${one(row.question, 200)}". I have learned it now and asked it again for you: ${link}` }).catch(() => {});
        }
      }
    } catch (e) { await run(`UPDATE expert_gapfix SET error = ? WHERE id = ?`, ['Re-asking failed: ' + one(e.message, 200), row.id]).catch(() => {}); }
  })();
  return { noteId };
}
async function reject(id, by) {
  const r = await run(`UPDATE expert_gapfix SET status = 'rejected', decided_by = ?, decided_at = datetime('now') WHERE id = ? AND status IN ('queued','proposed','failed')`, [lc(by), Number(id)]);
  if (!r.changes) throw httpError(404, 'Not found');
  return { ok: true };
}
async function retry(id) {
  const r = await run(`UPDATE expert_gapfix SET status = 'queued', error = NULL WHERE id = ? AND status IN ('failed','proposed')`, [Number(id)]);
  if (!r.changes) throw httpError(404, 'Not found');
  return { ok: true };
}

module.exports = { setDB, setDeps, initSchema, enqueue, work, list, approve, reject, retry, MAX_PER_DAY, _qkey: qkeyOf };
