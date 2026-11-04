'use strict';
/**
 * Batch 247 (from Aria's Deep research and Strategise), for support leadership (admins).
 * Deep research: a bigger question is broken into parts; the admin checks the plan (assumptions, parts, known limits),
 * unticks what is not needed and runs it. Parts are answered two at a time from the data (the same read-only tools
 * Expert's lookups use), then a report is written: three to five summary points marked Strength, Problem, Watch or
 * Mixed with what to do, the sections with the figures, the confidence, how many figures trace back to a part, and
 * what it could not answer. Runs in the background; a Google Chat message can be sent when it is ready.
 * Strategise: a goal ("cut T1 transfers by 20%") becomes a measurable goal, assumptions and a driver tree of levers;
 * the admin confirms; the baseline and "why" parts are researched; the report opens with recommendations ranked by
 * impact, each with where the gap is, why, and actions marked Now, Next quarter or Not immediately actionable, with an
 * owner, a deadline, the expected lift and steps. Estimates are labelled as estimates.
 * Stopped or failed runs resume, keeping the parts already answered.
 */
let _db = null, D = {};
function setDB(db) { _db = db; }
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const lc = (s) => String(s || '').trim().toLowerCase();
const one = (s, n = 400) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
const txt = (s, n = 4000) => String(s == null ? '' : s).replace(/[\u2014\u2013]/g, ', ').trim().slice(0, n);
const arr = (x, n, m = 300) => (Array.isArray(x) ? x : []).map((v) => one(typeof v === 'string' ? v : JSON.stringify(v), m)).filter(Boolean).slice(0, n);
const J = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const KINDS = ['deep', 'strategy'];

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS expert_research (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'deep',
    question TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned', plan_json TEXT, parts_json TEXT, report_json TEXT, notify INTEGER DEFAULT 0,
    note TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), started_at TEXT, finished_at TEXT)`);
  // A restart stops whatever was running; it can be resumed.
  await run(`UPDATE expert_research SET status = 'stopped', error = 'Stopped by a restart of the tool; resume to carry on' WHERE status = 'running'`).catch(() => {});
}

const CONTEXT = `Adit sells practice software to dental, orthodontic, optometry and chiropractic offices. The questions come from the leadership of the T1 Customer Support team (calls and chat, Zoho Desk tickets, transfers to other teams through Pending Review - T1, basic AI and VoIP support). The data available: Zoho Desk tickets with their threads, comments, owners, teams and status history; Zoho CRM accounts, deals, escalations and onboarding; RingCentral calls; Avoma call transcripts and summaries; Aria's written account analyses.`;
const PLAN_SYS = {
  deep: `${CONTEXT}
Plan a deep research run for the question. Break it into 3 to 6 parts that can each be answered from the data on its own (a count, a rate, a breakdown, a comparison with the period before, or reading a sample of tickets for the reasons). Each part names its window (default the last 90 days) and the comparison that matters. List the assumptions you made (what a word means, the window, who counts). For each part give its known limits honestly (for example "reasons are read from a sample, not every ticket").
Reply with JSON: {"title": "short title", "assumptions": ["..."], "parts": [{"title": "short", "question": "the exact question for this part", "limits": "known limits or ''"}]}. No em or en dashes.`,
  strategy: `${CONTEXT}
Frame a strategy question the way a consultant would. Turn it into ONE measurable goal (metric, from what, to what, by when; say if the starting value must first be measured). List the assumptions. Build a driver tree: the levers that add up or multiply to the goal (for example tickets per day x share transferred x share of transfers that were not needed), each with how it moves the goal. Then plan 3 to 6 research parts: first the baseline numbers for the levers (today's values), then the "why" parts that read the causes behind the biggest levers. Each part must be answerable from the data.
Reply with JSON: {"title": "short title", "goal": "the measurable goal", "assumptions": ["..."], "levers": [{"lever": "name", "how": "how it moves the goal", "measure": "the metric"}], "parts": [{"title": "short", "question": "the exact question", "limits": "known limits or ''"}]}. No em or en dashes.`,
};
const REPORT_SYS = {
  deep: `${CONTEXT}
Write the report of a deep research run from the parts' findings ONLY. Never add a figure that is not in a finding; when you combine or round figures, say so. Keep figures apart from your reading of them.
Reply with JSON: {"summary": [{"tag": "Strength" | "Problem" | "Watch" | "Mixed", "point": "one or two sentences with at most two rounded figures, against the comparison that matters", "do": "what to do"}] (3 to 5 points),
"sections": [{"title": "...", "body": "the detail: the exact figures, the breakdowns, the evidence, 3 to 8 sentences or short lines"}],
"confidence": "high" | "medium" | "low", "confidence_why": "one line", "figures": "how many of the report's figures trace back to a part's finding, as 'n of m'", "could_not_answer": ["..."]}. No em or en dashes.`,
  strategy: `${CONTEXT}
Write the strategy report from the goal, the driver tree and the parts' findings ONLY. Recommendations are ranked by how much they move the goal. Each goes all the way down: where the gap is (against the best team, period or segment the findings show), why (each root cause, measured from the findings), and what to do about each cause. Every action is marked "Now", "Next quarter" or "Not immediately actionable" (explain the last kind and leave it out of the expected impact). Each action has an owner (a role or team), a deadline, the expected lift (labelled as an estimate) and 3 to 6 execution steps. Never invent a figure; an estimate says what it rests on.
Reply with JSON: {"goal": "...", "recommendations": [{"title": "...", "impact": "how much it moves the goal (estimate, and what it rests on)", "where": "...", "why": ["root causes with figures"], "actions": [{"text": "...", "when": "Now" | "Next quarter" | "Not immediately actionable", "owner": "...", "deadline": "...", "lift": "...", "steps": ["..."]}], "confidence": "high" | "medium" | "low"}],
"levers": [{"lever": "...", "today": "value from the findings or 'not measured'", "realistic": "a realistic value, labelled as an estimate", "kept": true | false, "why": "why kept or ruled out (too small, not in our control, no difference between segments, sample too small)"}],
"options_considered": ["..."], "risks": ["..."], "confidence": "high" | "medium" | "low", "could_not_answer": ["..."]}. No em or en dashes.`,
};

function shape(r) {
  if (!r) return null;
  const plan = J(r.plan_json, {}), parts = J(r.parts_json, []), report = J(r.report_json, null);
  return { id: r.id, kind: r.kind, question: r.question, status: r.status, plan, parts: parts.map((p, i) => ({ i, title: p.title, question: p.question, limits: p.limits, on: p.on !== false, status: p.status || 'waiting', answer: p.answer || '', lookups: p.lookups || 0, ms: p.ms || 0, error: p.error || '' })),
    report, notify: !!r.notify, note: r.note || '', error: r.error || '', createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at };
}
async function list(email) { return (await all(`SELECT * FROM expert_research WHERE email = ? ORDER BY id DESC LIMIT 30`, [lc(email)])).map((r) => { const s = shape(r); return { id: s.id, kind: s.kind, question: s.question, status: s.status, title: s.plan.title || '', createdAt: s.createdAt, finishedAt: s.finishedAt }; }); }
async function getOne(email, id) { const r = await get(`SELECT * FROM expert_research WHERE id = ? AND email = ?`, [Number(id), lc(email)]); if (!r) throw httpError(404, 'Not found'); return shape(r); }

async function plan(email, { question, kind = 'deep' } = {}) {
  const q = String(question || '').trim().slice(0, 1500);
  if (q.length < 10) throw httpError(400, 'Write the question you want researched');
  if (!KINDS.includes(kind)) kind = 'deep';
  const r = await D.ai.bestJSON({ system: PLAN_SYS[kind], user: 'Question: ' + q, maxTokens: 2000, timeoutMs: 90000, temperature: 0 });
  const j = (r && r.json) || {};
  const parts = (Array.isArray(j.parts) ? j.parts : []).filter((p) => p && p.question).slice(0, 6).map((p) => ({ title: one(p.title, 100), question: txt(p.question, 600), limits: one(p.limits, 300), on: true, status: 'waiting' }));
  if (!parts.length) throw httpError(502, 'Could not plan this question; try wording it differently');
  const pl = { title: one(j.title, 120), assumptions: arr(j.assumptions, 8, 300), goal: one(j.goal, 400),
    levers: (Array.isArray(j.levers) ? j.levers : []).slice(0, 8).map((l) => ({ lever: one(l && l.lever, 100), how: one(l && l.how, 300), measure: one(l && l.measure, 160) })).filter((l) => l.lever) };
  const ins = await run(`INSERT INTO expert_research (email, kind, question, status, plan_json, parts_json) VALUES (?,?,?,?,?,?)`, [lc(email), kind, q, 'planned', JSON.stringify(pl), JSON.stringify(parts)]);
  return getOne(email, ins.lastID);
}

const _running = new Map(); // id -> { stop: bool }
async function start(email, id, { on = null, notify = false, note = '' } = {}) {
  const x = await getOne(email, id);
  if (x.status === 'running' || _running.has(x.id)) throw httpError(409, 'It is already running');
  const parts = J((await get(`SELECT parts_json FROM expert_research WHERE id = ?`, [x.id])).parts_json, []);
  if (Array.isArray(on)) parts.forEach((p, i) => { p.on = on.includes(i); });
  if (!parts.some((p) => p.on !== false)) throw httpError(400, 'Tick at least one part');
  await run(`UPDATE expert_research SET status = 'running', parts_json = ?, notify = ?, note = ?, error = NULL, started_at = COALESCE(started_at, datetime('now')) WHERE id = ?`, [JSON.stringify(parts), notify ? 1 : 0, one(note, 600), x.id]);
  const ctl = { stop: false }; _running.set(x.id, ctl);
  work(x.id, ctl).catch((e) => console.warn('research run', x.id, e.message)).finally(() => _running.delete(x.id));
  return getOne(email, x.id);
}
async function stop(email, id) {
  const x = await getOne(email, id);
  const ctl = _running.get(x.id); if (ctl) ctl.stop = true;
  await run(`UPDATE expert_research SET status = 'stopped' WHERE id = ? AND status = 'running'`, [x.id]);
  return getOne(email, x.id);
}

async function work(id, ctl) {
  const save = (parts) => run(`UPDATE expert_research SET parts_json = ? WHERE id = ?`, [JSON.stringify(parts), id]);
  let row = await get(`SELECT * FROM expert_research WHERE id = ?`, [id]);
  const pl = J(row.plan_json, {}), parts = J(row.parts_json, []);
  const todo = parts.map((p, i) => i).filter((i) => parts[i].on !== false && parts[i].status !== 'done');
  const context = [`The whole question: ${row.question}`, pl.goal ? 'Goal: ' + pl.goal : '', (pl.assumptions || []).length ? 'Assumptions: ' + pl.assumptions.join('; ') : '', row.note ? 'Note from the person who asked: ' + row.note : ''].filter(Boolean).join('\n');
  let k = 0;
  const next = async () => {
    while (k < todo.length && !ctl.stop) {
      const i = todo[k++], p = parts[i];
      p.status = 'running'; await save(parts);
      const t0 = Date.now();
      try {
        const v = await D.investigate.investigate({ goal: 'research', question: p.question, history: context, budgetMs: 150000, maxCalls: 22 });
        p.answer = v && v.summary ? txt(v.summary, 6000) : ''; p.lookups = v ? (v.steps || []).length : 0; p.status = p.answer ? 'done' : 'failed'; p.error = p.answer ? '' : 'No answer from the data';
      } catch (e) { p.status = 'failed'; p.error = one(e.message, 200); }
      p.ms = Date.now() - t0; await save(parts);
    }
  };
  await Promise.all([next(), next()]);
  if (ctl.stop) return;
  const done = parts.filter((p) => p.on !== false && p.status === 'done');
  if (!done.length) { await run(`UPDATE expert_research SET status = 'failed', error = 'No part could be answered from the data' WHERE id = ?`, [id]); return; }
  const user = [context, pl.levers && pl.levers.length ? 'Driver tree:\n' + pl.levers.map((l) => `- ${l.lever}: ${l.how} (metric: ${l.measure})`).join('\n') : '',
    'Parts and their findings:\n' + parts.filter((p) => p.on !== false).map((p, n) => `PART ${n + 1}: ${p.title}\nQuestion: ${p.question}\nKnown limits: ${p.limits || 'none'}\n${p.status === 'done' ? p.answer : 'NOT ANSWERED: ' + (p.error || 'failed')}`).join('\n\n')].filter(Boolean).join('\n\n');
  try {
    const r = await D.ai.bestJSON({ system: REPORT_SYS[row.kind] || REPORT_SYS.deep, user: user.slice(0, 60000), maxTokens: 6000, timeoutMs: 170000, temperature: 0 });
    const report = (r && r.json) || {};
    await run(`UPDATE expert_research SET status = 'done', report_json = ?, finished_at = datetime('now'), error = NULL WHERE id = ?`, [JSON.stringify(report), id]);
    row = await get(`SELECT * FROM expert_research WHERE id = ?`, [id]);
    if (row.notify && D.dm) await D.dm({ toEmail: row.email, text: `Your ${row.kind === 'strategy' ? 'strategy' : 'deep research'} report is ready: "${one(pl.title || row.question, 160)}"\n${(D.publicUrl || '')}/guides#research/${id}` }).catch(() => {});
  } catch (e) {
    await run(`UPDATE expert_research SET status = 'failed', error = ? WHERE id = ?`, ['Writing the report failed: ' + one(e.message, 200), id]);
    if (row.notify && D.dm) await D.dm({ toEmail: row.email, text: `Your research run "${one(pl.title || row.question, 160)}" failed while writing the report. Open it and press Resume: ${(D.publicUrl || '')}/guides#research/${id}` }).catch(() => {});
  }
}

module.exports = { running: () => _running.size, setDB, setDeps, initSchema, plan, start, stop, list, get: getOne, _work: work, _shape: shape };
