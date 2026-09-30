/**
 * Session 64: AI Studio. Turn a document (or pasted text, or a web page)
 * into one or more assessments, together with the AI.
 *
 *  1. Read: the text is split into sections from its headings (or into
 *     even parts when it has none). Big documents are fine: the AI only
 *     sees each section's title, size and opening lines when planning.
 *  2. Plan: the AI summarises every section, marks boilerplate to skip,
 *     and suggests how to group sections into assessments.
 *  3. Draft: questions are written per assessment from the full text of
 *     its sections. Drafts live here, not in the question bank, until the
 *     reviewer saves them.
 *  4. Chat: the reviewer talks to the AI ("make them harder", "split the
 *     first one", "add three questions on refunds"). The AI answers and
 *     proposes actions, which the server carries out on the drafts.
 *  5. Save: drafts go to the bank as drafts (tagged by section) and one
 *     draft assessment is created per group. Nothing reaches agents until
 *     it is published.
 */
const crypto = require('crypto');
let _db = null, A = null;
function setDB(db, assessments) { _db = db; A = assessments; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const j = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (_) { return d; } };
const clean = (s, n = 2000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);
const lc = (s) => String(s || '').trim().toLowerCase();
const uid = () => crypto.randomBytes(5).toString('hex');
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
const MAX_TEXT = 1500000;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS assess_studio (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, source_name TEXT, source_kind TEXT, focus TEXT,
    text TEXT, sections_json TEXT, groups_json TEXT, drafts_json TEXT, messages_json TEXT, summary TEXT,
    status TEXT NOT NULL DEFAULT 'open', created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  try { await run(`ALTER TABLE assess_studio ADD COLUMN history_json TEXT`); } catch (_) { /* already there */ }
}

// ── 1. Sections ─────────────────────────────────────────────────────────
function isHeading(line, prev, next) {
  const t = line.trim();
  if (!t || t.length > 90 || t.length < 3) return false;
  if (/^#{1,4}\s+\S/.test(t)) return true;
  if (/^(section|chapter|part|module|unit|appendix)\s+[\w.]+/i.test(t)) return true;
  if (/^(\d+(\.\d+){0,3}|[IVX]+|[A-Z])[.)]\s+[A-Z]/.test(t) && !/[.:;,]$/.test(t) && t.split(/\s+/).length <= 12) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && t.split(/\s+/).length <= 10) return true;
  // a short title-case line with blank lines around it
  if (!prev.trim() && !next.trim() && !/[.:;,!?]$/.test(t) && t.split(/\s+/).length <= 9 && /^[A-Z]/.test(t)) return true;
  return false;
}
function splitSections(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const secs = [];
  let cur = { title: 'Introduction', lines: [] };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (isHeading(ln, lines[i - 1] || '', lines[i + 1] || '')) {
      if (cur.lines.join('\n').trim()) secs.push(cur);
      cur = { title: ln.trim().replace(/^#+\s*/, '').slice(0, 120), lines: [] };
    } else cur.lines.push(ln);
  }
  if (cur.lines.join('\n').trim()) secs.push(cur);
  let out = secs.map(sc => ({ title: sc.title, text: sc.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }));
  // merge tiny sections into the next one
  const merged = [];
  for (const sc of out) {
    const last = merged[merged.length - 1];
    if (last && last.text.length < 280) { last.text = (last.text + '\n\n' + sc.title + '\n' + sc.text).trim(); if ((last.title + ' / ' + sc.title).length <= 120) last.title = last.title + ' / ' + sc.title; continue; }
    merged.push(sc);
  }
  out = merged;
  // no real structure: even parts at paragraph breaks
  if (out.length < 2 || out.some(sc => sc.text.length > 60000)) {
    const paras = String(text).split(/\n\s*\n/);
    out = []; let buf = '';
    const target = Math.max(3500, Math.min(12000, Math.ceil(String(text).length / 12)));
    for (const p of paras) {
      if ((buf + '\n\n' + p).length > target && buf) { out.push({ title: 'Part ' + (out.length + 1), text: buf.trim() }); buf = p; }
      else buf = buf ? buf + '\n\n' + p : p;
    }
    if (buf.trim()) out.push({ title: 'Part ' + (out.length + 1), text: buf.trim() });
  }
  return out.slice(0, 60).map((sc, i) => ({ id: 's' + (i + 1), title: sc.title || 'Section ' + (i + 1), text: sc.text, chars: sc.text.length, summary: '', keyPoints: [], include: true }));
}

// ── 2. Plan with the AI ─────────────────────────────────────────────────
async function plan(st, ai) {
  const secs = j(st.sections_json, []);
  const brief = secs.map(sc => `[${sc.id}] ${sc.title} (${sc.chars} chars)\n${sc.text.slice(0, sc.chars > 20000 ? 900 : 650).replace(/\s+/g, ' ')}`).join('\n\n');
  const system = [
    'You are the assessment designer for a customer support team lead at a dental and healthcare software company.',
    'You receive a document split into sections (id, title, size, opening text). Plan how to turn it into assessments that check whether agents really know the process.',
    'Return JSON: {"summary":"2-3 sentences on what the document covers","sections":[{"id":"s1","title":"short clear title","summary":"one sentence","keyPoints":["..."],"include":true|false}],',
    '"groups":[{"title":"assessment title","sectionIds":["s1","s2"],"questionCount":8,"difficulty":"easy|medium|hard|mixed","why":"one sentence"}],',
    '"message":"a short friendly note to the reviewer: what you found, how you grouped it and why, and 2 or 3 questions or options for them (for example whether to split further or focus on escalations)"}.',
    'Set include=false for tables of contents, revision history, legal boilerplate, contact lists and anything with nothing testable.',
    'Group related sections so each assessment takes 5 to 12 minutes (about 6 to 15 questions). One group is fine for a short document. Never put a section in two groups.',
  ].join('\n');
  const user = [st.focus ? `The reviewer wants to focus on: ${st.focus}` : '', `Document: ${st.source_name || 'Untitled'} (${(st.text || '').length} characters, ${secs.length} sections)`, brief].filter(Boolean).join('\n\n');
  const r = await ai.bestJSON({ system, user: user.slice(0, 90000), maxTokens: 6000, timeoutMs: 150000 });
  const js = r.json || {};
  const byId = new Map(secs.map(sc => [sc.id, sc]));
  for (const x of (js.sections || [])) {
    const sc = byId.get(x.id); if (!sc) continue;
    if (x.title) sc.title = clean(x.title, 120);
    sc.summary = clean(x.summary, 400); sc.keyPoints = (x.keyPoints || []).slice(0, 6).map(k => clean(k, 200)); sc.include = x.include !== false;
  }
  const used = new Set();
  let groups = (js.groups || []).map(g => ({
    id: 'g' + uid(), title: clean(g.title, 140) || 'Assessment', why: clean(g.why, 300),
    sectionIds: (g.sectionIds || []).filter(id => byId.has(id) && !used.has(id) && used.add(id)),
    questionCount: Math.max(3, Math.min(25, Math.round(Number(g.questionCount) || 8))),
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(g.difficulty) ? g.difficulty : 'mixed',
    types: ['single', 'multi', 'truefalse'],
  })).filter(g => g.sectionIds.length);
  if (!groups.length) groups = [{ id: 'g' + uid(), title: st.title || 'Assessment', why: '', sectionIds: secs.filter(sc => sc.include).map(sc => sc.id), questionCount: 10, difficulty: 'mixed', types: ['single', 'multi', 'truefalse'] }];
  const msgs = j(st.messages_json, []);
  msgs.push({ role: 'assistant', text: clean(js.message, 3000) || `I split this into ${secs.length} sections and suggest ${groups.length} assessment${groups.length > 1 ? 's' : ''}. Adjust the groups, then press Write questions.`, at: new Date().toISOString() });
  await save(st.id, { sections: secs, groups, messages: msgs, summary: clean(js.summary, 1000) });
}

// ── helpers ─────────────────────────────────────────────────────────────
async function save(id, { sections, groups, drafts, messages, summary, title, status, history }) {
  const sets = [], p = [];
  if (sections) { sets.push('sections_json = ?'); p.push(JSON.stringify(sections)); }
  if (groups) { sets.push('groups_json = ?'); p.push(JSON.stringify(groups)); }
  if (drafts) { sets.push('drafts_json = ?'); p.push(JSON.stringify(drafts)); }
  if (messages) { sets.push('messages_json = ?'); p.push(JSON.stringify(messages.slice(-80))); }
  if (history) { sets.push('history_json = ?'); p.push(JSON.stringify(history.slice(-12))); }
  if (summary != null) { sets.push('summary = ?'); p.push(summary); }
  if (title) { sets.push('title = ?'); p.push(clean(title, 160)); }
  if (status) { sets.push('status = ?'); p.push(status); }
  sets.push(`updated_at = datetime('now')`);
  await run(`UPDATE assess_studio SET ${sets.join(', ')} WHERE id = ?`, [...p, Number(id)]);
}
async function load(id) {
  const st = await get(`SELECT * FROM assess_studio WHERE id = ?`, [Number(id)]);
  if (!st) throw httpError(404, 'Studio session not found');
  return st;
}

// ── similarity + coverage (no AI) ───────────────────────────────────────
const STOP = new Set('the a an and or of to in on for with is are was were be by at as it this that from your you we our can will what which when how does do not no any all if then than into about after before should must may'.split(' '));
const toks = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
const jacc = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };
const draftText = (d) => [d.prompt].concat((d.options || []).map(o => (o && o.text) || o || '')).join(' ');
const secTokCache = new Map();
function secTokens(st, sc) {
  const k = st.id + ':' + sc.id + ':' + sc.chars;
  if (!secTokCache.has(k)) { if (secTokCache.size > 600) secTokCache.clear(); secTokCache.set(k, toks(sc.title + ' ' + sc.text)); }
  return secTokCache.get(k);
}
/** Which section does each draft test? One section chosen at write time wins, otherwise the best word overlap. */
function coverageFor(st, g, drafts, secsAll) {
  const secs = secsAll.filter(sc => g.sectionIds.includes(sc.id) && sc.include !== false);
  const mine = drafts.filter(d => d.groupId === g.id);
  if (!secs.length || !mine.length) return null;
  const sets = secs.map(sc => ({ sc, t: secTokens(st, sc) }));
  const df = new Map(); sets.forEach(x => x.t.forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const have = {}; secs.forEach(sc => { have[sc.id] = 0; });
  let unassigned = 0;
  for (const d of mine) {
    if (d.sectionIds && d.sectionIds.length === 1 && have[d.sectionIds[0]] != null) { have[d.sectionIds[0]]++; continue; }
    const dt = toks(draftText(d) + ' ' + (d.explanation || ''));
    let best = null, bs = 0;
    for (const x of sets) { let sc = 0; for (const w of dt) if (x.t.has(w)) sc += 1 / df.get(w); if (sc > bs) { bs = sc; best = x.sc; } }
    if (best && bs >= 1.2) have[best.id]++; else unassigned++;
  }
  const target = Math.max(1, g.questionCount || 8);
  const total = secs.reduce((t, sc) => t + sc.chars, 0) || 1;
  const needed = secs.slice().sort((a, b) => b.chars - a.chars).slice(0, target);
  const rows = secs.map(sc => {
    const want = needed.includes(sc) ? Math.max(1, Math.round(target * sc.chars / total)) : 0;
    const h = have[sc.id];
    const gap = want > 0 && (h === 0 || h / want <= 0.5);
    return { id: sc.id, title: sc.title, have: h, want, gap, need: gap ? Math.min(5, want - h) : 0 };
  });
  const mix = { easy: 0, medium: 0, hard: 0 };
  mine.forEach(d => { if (mix[d.difficulty] != null) mix[d.difficulty]++; });
  const share = g.difficulty === 'mixed' ? { easy: 0.3, medium: 0.5, hard: 0.2 } : null;
  const n = Math.max(mine.length, target);
  const mixNeed = { easy: 0, medium: 0, hard: 0 };
  if (share) for (const k of Object.keys(mix)) mixNeed[k] = Math.max(0, Math.round(n * share[k]) - mix[k]);
  return { sections: rows, unassigned, mix, target: share, mixNeed, total: mine.length, gapCount: rows.filter(r => r.gap).length, mixGap: Object.values(mixNeed).reduce((t, x) => t + x, 0) >= 2 };
}
/** Flag drafts that look like a question already in the bank, or like another draft. */
async function markDupes(drafts) {
  const live = drafts.filter(d => !d.saved && d.ok !== false);
  let bank = [];
  try { bank = await A.similarTo(live.map(d => d.prompt), { min: 0.6 }); } catch (_) { bank = []; }
  const tk = live.map(d => toks(d.prompt));
  live.forEach((d, i) => {
    d.dupe = null;
    if (d.dupeOk) return;
    let best = bank[i] ? { kind: 'bank', id: bank[i].id, prompt: bank[i].prompt, score: bank[i].score } : null;
    for (let k = 0; k < i; k++) { const sc = jacc(tk[i], tk[k]); if (sc >= 0.7 && (!best || sc > best.score)) best = { kind: 'draft', id: live[k].id, prompt: live[k].prompt.slice(0, 200), score: Math.round(sc * 100) / 100 }; }
    d.dupe = best;
  });
  drafts.forEach(d => { if (d.saved) d.dupe = null; });
  return drafts;
}

// ── undo history ────────────────────────────────────────────────────────
function pushHistory(st, label) {
  const h = j(st.history_json, []);
  const snap = { id: 'h' + uid(), at: new Date().toISOString(), label: clean(label, 120), groups: j(st.groups_json, []), drafts: j(st.drafts_json, []), include: j(st.sections_json, []).map(sc => [sc.id, sc.include !== false]) };
  h.push(snap);
  return { history: h.slice(-12), id: snap.id };
}
function view(st) {
  const secs = j(st.sections_json, []), groups = j(st.groups_json, []), drafts = j(st.drafts_json, []);
  const coverage = {};
  for (const g of groups) { const c = coverageFor(st, g, drafts, secs); if (c) coverage[g.id] = c; }
  return { id: st.id, title: st.title, sourceName: st.source_name, sourceKind: st.source_kind, focus: st.focus || '', summary: st.summary || '', status: st.status,
    chars: (st.text || '').length, createdBy: st.created_by, createdAt: st.created_at, updatedAt: st.updated_at,
    sections: secs.map(sc => ({ id: sc.id, title: sc.title, chars: sc.chars, summary: sc.summary, keyPoints: sc.keyPoints, include: sc.include, preview: sc.text.slice(0, 600) })),
    groups, drafts, messages: j(st.messages_json, []), coverage,
    history: j(st.history_json, []).map(h => ({ id: h.id, at: h.at, label: h.label })) };
}
function groupText(st, g) {
  const secs = j(st.sections_json, []).filter(sc => g.sectionIds.includes(sc.id) && sc.include !== false);
  return secs.map(sc => `## ${sc.title}\n${sc.text}`).join('\n\n');
}
function normDraft(q, g, sectionIds) {
  const d = { id: 'q' + uid(), groupId: g.id, sectionIds: sectionIds || g.sectionIds, type: q.type, prompt: clean(q.prompt, 1500), options: q.options, correct: Array.isArray(q.correct) ? q.correct : [],
    explanation: clean(q.explanation, 1500), tags: Array.isArray(q.tags) ? q.tags.slice(0, 6) : [], difficulty: q.difficulty || 'medium', ok: true, problem: null };
  try { A._normQuestion({ ...d, options: d.options, status: 'draft' }); } catch (e) { d.ok = false; d.problem = e.message; }
  return d;
}
const newGroupBase = (g) => ({ id: g.id || 'g' + uid(), title: clean(g.title, 140) || 'Assessment', why: clean(g.why, 300),
  sectionIds: (g.sectionIds || []).map(String).slice(0, 60), questionCount: Math.max(1, Math.min(25, Math.round(Number(g.questionCount) || 8))),
  difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(g.difficulty) ? g.difficulty : 'mixed',
  types: (Array.isArray(g.types) && g.types.length ? g.types : ['single', 'multi', 'truefalse']).filter(t => ['single', 'multi', 'truefalse', 'ordering', 'matching'].includes(t)) });

/** Merge several groups into one (first one's id is kept). Pure: returns new lists. */
function mergeGroupList(groups, drafts, ids, title) {
  const pick = groups.filter(g => ids.includes(g.id));
  if (pick.length < 2) throw httpError(400, 'Choose at least two assessments to combine');
  const keep = pick[0];
  const secIds = Array.from(new Set(pick.flatMap(g => g.sectionIds)));
  const diffs = new Set(pick.map(g => g.difficulty));
  const merged = { ...keep, title: clean(title, 140) || pick.map(g => g.title).join(' + ').slice(0, 140), why: pick.map(g => g.why).filter(Boolean).join(' ').slice(0, 300),
    sectionIds: secIds, questionCount: Math.min(25, pick.reduce((t, g) => t + (g.questionCount || 0), 0)), difficulty: diffs.size === 1 ? keep.difficulty : 'mixed',
    types: Array.from(new Set(pick.flatMap(g => g.types || []))), testId: undefined };
  const outGroups = []; let placed = false;
  for (const g of groups) { if (ids.includes(g.id)) { if (!placed) { outGroups.push(merged); placed = true; } } else outGroups.push(g); }
  const outDrafts = drafts.map(d => ids.includes(d.groupId) ? { ...d, groupId: keep.id } : d);
  return { groups: outGroups, drafts: outDrafts, merged };
}

// ── public API ──────────────────────────────────────────────────────────
async function create({ text, sourceName, sourceKind, focus, by, ai }) {
  const body = clean(text, MAX_TEXT).replace(/[ \t]+\n/g, '\n').trim();
  if (body.length < 300) throw httpError(400, 'There is not enough text here to build an assessment from.');
  const sections = splitSections(body);
  const title = clean(sourceName, 140) || 'Untitled source';
  const r = await run(`INSERT INTO assess_studio (title, source_name, source_kind, focus, text, sections_json, groups_json, drafts_json, messages_json, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [title, title, sourceKind || 'text', clean(focus, 600), body, JSON.stringify(sections), '[]', '[]', '[]', lc(by)]);
  const st = await load(r.lastID);
  if (ai && ai.anyConfigured()) {
    try { await plan(st, ai); }
    catch (e) {
      await save(st.id, { groups: [{ id: 'g' + uid(), title, why: '', sectionIds: sections.map(sc => sc.id), questionCount: 10, difficulty: 'mixed', types: ['single', 'multi', 'truefalse'] }],
        messages: [{ role: 'assistant', text: 'I split the document into ' + sections.length + ' sections but could not reach the AI to plan it (' + e.message + '). You can still group sections and try Write questions.', at: new Date().toISOString() }] });
    }
  }
  return view(await load(st.id));
}
async function list() {
  const rows = await all(`SELECT id, title, source_name, status, created_by, created_at, updated_at, length(text) AS chars, groups_json, drafts_json FROM assess_studio ORDER BY updated_at DESC LIMIT 50`);
  return rows.map(r => ({ id: r.id, title: r.title, sourceName: r.source_name, status: r.status, createdBy: r.created_by, updatedAt: r.updated_at, chars: r.chars, groups: j(r.groups_json, []).length, drafts: j(r.drafts_json, []).length, unsaved: j(r.drafts_json, []).filter(d => !d.saved && d.ok !== false).length }));
}
async function getView(id) { return view(await load(id)); }
async function remove(id) { await run(`DELETE FROM assess_studio WHERE id = ?`, [Number(id)]); }

/** Manual edits from the page: groups (title, sections, count, difficulty), section include, drafts. */
async function update(id, b) {
  const st = await load(id);
  const out = {};
  if (Array.isArray(b.groups)) out.groups = b.groups.slice(0, 20).map(g => { const n = newGroupBase(g); if (g.testId) n.testId = g.testId; return n; });
  if (Array.isArray(b.sections)) {
    const secs = j(st.sections_json, []);
    const inc = new Map(b.sections.map(x => [x.id, x.include !== false]));
    secs.forEach(sc => { if (inc.has(sc.id)) sc.include = inc.get(sc.id); });
    out.sections = secs;
  }
  if (Array.isArray(b.drafts)) {
    const groups = out.groups || j(st.groups_json, []);
    const old = new Map(j(st.drafts_json, []).map(d => [d.id, d]));
    out.drafts = b.drafts.slice(0, 400).map(d => {
      const g = groups.find(x => x.id === d.groupId) || groups[0] || { id: 'g0', sectionIds: [] };
      const n = normDraft(d, g, d.sectionIds); n.id = d.id || n.id;
      const o = old.get(n.id);
      if (o && o.saved) n.saved = o.saved;           // the server decides what is already in the bank
      if (d.locked) n.locked = true;
      if (d.dupeOk) n.dupeOk = true;
      return n;
    });
    if (b.drafts.length !== old.size || b.drafts.some(d => !old.has(d.id))) { const h = pushHistory(st, 'Manual edit'); out.history = h.history; }
    await markDupes(out.drafts);
  }
  await save(st.id, out);
  return view(await load(st.id));
}

async function writeForGroup(st, g, ai, { count, focus, sectionIds, types, difficulty } = {}) {
  const gg = { ...g, sectionIds: sectionIds && sectionIds.length ? sectionIds : g.sectionIds };
  const text = groupText(st, gg);
  const existing = j(st.drafts_json, []).filter(d => d.groupId === g.id).map(d => d.prompt);
  const n = Math.max(1, Math.min(25, Math.round(Number(count) || g.questionCount || 8)));
  // big groups: spread questions across sections so nothing is cut off
  if (text.length > 55000 && gg.sectionIds.length > 1) {
    const secs = j(st.sections_json, []).filter(sc => gg.sectionIds.includes(sc.id) && sc.include !== false);
    const total = secs.reduce((t, sc) => t + sc.chars, 0) || 1;
    const out = [];
    for (const sc of secs) {
      const k = Math.max(1, Math.round(n * sc.chars / total));
      const r = await A.aiWriteQuestions({ text: `## ${sc.title}\n${sc.text}`, count: k, types: types || g.types, focus: focus || st.focus, difficulty: difficulty || (g.difficulty === 'mixed' ? '' : g.difficulty), sourceName: st.source_name, ai, avoid: existing });
      r.questions.forEach(q => out.push(normDraft(q, g, [sc.id])));
    }
    return out.slice(0, n + 3);
  }
  const r = await A.aiWriteQuestions({ text, count: n, types: types || g.types, focus: focus || st.focus, difficulty: difficulty || (g.difficulty === 'mixed' ? '' : g.difficulty), sourceName: st.source_name, ai, avoid: existing });
  return r.questions.map(q => normDraft(q, g, gg.sectionIds));
}
/** Write (or rewrite) the questions for some groups. Locked and saved questions stay. */
async function generate(id, { groupIds, replace }, ai) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const st = await load(id);
  const groups = j(st.groups_json, []);
  let drafts = j(st.drafts_json, []);
  const pick = groups.filter(g => !groupIds || !groupIds.length || groupIds.includes(g.id));
  const errors = [];
  const hist = pushHistory(st, (replace !== false ? 'Wrote questions for ' : 'Added questions to ') + (pick.length === 1 ? `"${pick[0].title}"` : pick.length + ' assessments'));
  let made = 0;
  for (const g of pick) {
    try {
      const qs = await writeForGroup(st, g, ai);
      if (replace !== false) drafts = drafts.filter(d => d.groupId !== g.id || d.saved || d.locked);
      drafts.push(...qs); made += qs.length;
      st.drafts_json = JSON.stringify(drafts);
    } catch (e) { errors.push(`${g.title}: ${e.message}`); }
  }
  await markDupes(drafts);
  await save(st.id, { drafts, history: made ? hist.history : undefined });
  return { ...view(await load(st.id)), errors };
}

/** Write questions for whatever the coverage map says is missing. */
async function fillGaps(id, { groupId }, ai) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const st = await load(id);
  const groups = j(st.groups_json, []);
  const g = groups.find(x => x.id === groupId);
  if (!g) throw httpError(404, 'Assessment not found in this session');
  const secs = j(st.sections_json, []);
  let drafts = j(st.drafts_json, []);
  const cov = coverageFor(st, g, drafts, secs);
  if (!cov) throw httpError(400, 'Write some questions first, then check what is missing.');
  const tasks = [];
  cov.sections.filter(r => r.gap).forEach(r => tasks.push({ label: r.title, count: r.need, sectionIds: [r.id] }));
  if (cov.mixGap) Object.entries(cov.mixNeed).filter(([, n]) => n > 0).forEach(([d, n]) => tasks.push({ label: d + ' level', count: n, difficulty: d }));
  if (!tasks.length) {
    const msgs = j(st.messages_json, []); msgs.push({ role: 'assistant', text: `"${g.title}" already covers its sections and difficulty mix well. Nothing to fill.`, at: new Date().toISOString(), done: [], problems: [] });
    await save(st.id, { messages: msgs });
    return { ...view(await load(st.id)), errors: [], filled: 0 };
  }
  const hist = pushHistory(st, `Filled gaps in "${g.title}"`);
  const done = [], problems = []; let filled = 0;
  for (const t of tasks.slice(0, 6)) {
    try {
      const qs = await writeForGroup(st, g, ai, { count: t.count, sectionIds: t.sectionIds, difficulty: t.difficulty });
      const add = qs.slice(0, t.count + 1);
      drafts.push(...add); filled += add.length; st.drafts_json = JSON.stringify(drafts);
      done.push(`Added ${add.length} on ${t.label}`);
    } catch (e) { problems.push(`${t.label}: ${e.message}`); }
  }
  await markDupes(drafts);
  const msgs = j(st.messages_json, []);
  msgs.push({ role: 'assistant', text: filled ? `I filled the gaps in "${g.title}".` : `I could not fill the gaps in "${g.title}".`, at: new Date().toISOString(), done, problems, undoId: filled ? hist.id : null });
  await save(st.id, { drafts, messages: msgs, history: filled ? hist.history : undefined });
  return { ...view(await load(st.id)), errors: problems, filled };
}

/** Combine several assessments of this session into one. */
async function mergeGroups(id, { groupIds, title }) {
  const st = await load(id);
  const hist = pushHistory(st, 'Combined assessments');
  const r = mergeGroupList(j(st.groups_json, []), j(st.drafts_json, []), (groupIds || []).map(String), title);
  const msgs = j(st.messages_json, []);
  msgs.push({ role: 'assistant', text: `Combined ${groupIds.length} assessments into "${r.merged.title}" (${r.drafts.filter(d => d.groupId === r.merged.id).length} questions).`, at: new Date().toISOString(), done: [], problems: [], undoId: hist.id });
  await markDupes(r.drafts);
  await save(st.id, { groups: r.groups, drafts: r.drafts, messages: msgs, history: hist.history });
  return view(await load(st.id));
}

async function undo(id, historyId) {
  const st = await load(id);
  const h = j(st.history_json, []);
  const k = historyId ? h.findIndex(x => x.id === historyId) : h.length - 1;
  if (k < 0) throw httpError(404, 'Nothing to undo');
  const snap = h[k];
  const cur = new Map(j(st.drafts_json, []).map(d => [d.id, d]));
  const drafts = snap.drafts.map(d => { const c = cur.get(d.id); return c && c.saved ? { ...d, saved: c.saved } : d; });
  const secs = j(st.sections_json, []); const inc = new Map(snap.include || []);
  secs.forEach(sc => { if (inc.has(sc.id)) sc.include = inc.get(sc.id); });
  const msgs = j(st.messages_json, []);
  msgs.push({ role: 'assistant', text: `Undid: ${snap.label}.`, at: new Date().toISOString(), done: [], problems: [] });
  await save(st.id, { groups: snap.groups, drafts, sections: secs, messages: msgs, history: h.slice(0, k) });
  if (!h.slice(0, k).length) await run(`UPDATE assess_studio SET history_json = '[]' WHERE id = ?`, [st.id]);
  return view(await load(st.id));
}

/** Drop every unlocked, unsaved draft that looks like a duplicate. */
async function removeDupes(id) {
  const st = await load(id);
  const drafts = j(st.drafts_json, []);
  await markDupes(drafts);
  const drop = new Set(drafts.filter(d => d.dupe && !d.saved && !d.locked && !d.dupeOk && (d.dupe.kind === 'bank' || drafts.findIndex(x => x.id === d.id) > drafts.findIndex(x => x.id === d.dupe.id))).map(d => d.id));
  if (!drop.size) return { ...view(st), removed: 0 };
  const hist = pushHistory(st, `Removed ${drop.size} duplicate(s)`);
  const left = drafts.filter(d => !drop.has(d.id));
  await markDupes(left);
  await save(st.id, { drafts: left, history: hist.history });
  return { ...view(await load(st.id)), removed: drop.size };
}

async function askAI(ai, args) {
  try { return await ai.bestJSON(args); }
  catch (e) {
    if (!/unreadable/i.test(e.message || '')) throw e;
    return await ai.bestJSON({ ...args, user: args.user + '\n\nYour last answer could not be read. Answer again with ONE valid JSON object only, in the form {"reply":"...","actions":[...]}.' });
  }
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/** Talk to the AI about the plan and the drafts. It replies and proposes
 *  actions; the server carries them out, tells you what changed, and keeps an undo point. */
async function chat(id, { message, groupId, questionId }, ai, by) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const st = await load(id);
  const msg = clean(message, 2000).trim();
  if (!msg) throw httpError(400, 'Type a message');
  const secs = j(st.sections_json, []), groups = j(st.groups_json, []), drafts = j(st.drafts_json, []);
  const messages = j(st.messages_json, []);
  const focusGroup = groups.find(g => g.id === groupId) || null;
  const focusQ = drafts.find(d => d.id === questionId) || null;
  const userMsg = { role: 'user', text: msg, at: new Date().toISOString(), by: lc(by), focus: focusQ ? 'Question: ' + focusQ.prompt.slice(0, 60) : focusGroup ? focusGroup.title : '' };
  messages.push(userMsg);
  const covs = {};
  for (const g of groups) { const c = coverageFor(st, g, drafts, secs); if (c) covs[g.id] = { gaps: c.sections.filter(r => r.gap).map(r => r.title), mix: c.mix }; }
  const context = {
    document: st.source_name, summary: st.summary, focus: st.focus,
    sections: secs.map(sc => ({ id: sc.id, title: sc.title, chars: sc.chars, include: sc.include, summary: sc.summary })),
    groups: groups.map(g => ({ id: g.id, title: g.title, sectionIds: g.sectionIds, questionCount: g.questionCount, difficulty: g.difficulty, types: g.types, coverage: covs[g.id] || null })),
    drafts: drafts.filter(d => !d.saved).slice(0, 150).map(d => ({ id: d.id, groupId: d.groupId, type: d.type, prompt: d.prompt.slice(0, 220), difficulty: d.difficulty, locked: !!d.locked || undefined, duplicateOf: d.dupe ? d.dupe.kind : undefined })),
    selectedGroup: focusGroup ? focusGroup.id : null, selectedQuestion: focusQ ? focusQ.id : null,
  };
  const system = [
    'You are the assessment designer working with a customer support team lead on turning a document into assessments.',
    'Reply briefly and helpfully, like a colleague. If the request is unclear, ask one short question and take no action.',
    'When the reviewer has selected an assessment (selectedGroup) or a question (selectedQuestion), "this", "these" and "it" mean that one.',
    'Questions marked locked must never be changed or removed.',
    'You can change things by returning actions. Available actions:',
    '{"op":"add_questions","groupId":"...","count":3,"focus":"...","sectionIds":["s2"],"types":["single","multi","truefalse","ordering","matching"],"difficulty":"easy|medium|hard"}',
    '{"op":"rewrite","questionIds":["q..."],"instruction":"what to change"}   (max 20 questions)',
    '{"op":"remove","questionIds":["q..."]}',
    '{"op":"set_groups","groups":[{"id":"existing id or new","title":"...","sectionIds":["s1"],"questionCount":8,"difficulty":"mixed","types":["single","multi","truefalse"]}]}   (the full new list of groups; use to split or regroup)',
    '{"op":"merge_groups","groupIds":["g..","g.."],"title":"optional new title"}   (combine assessments, keeps their questions)',
    '{"op":"include_sections","sectionIds":["s3"],"include":false}',
    '{"op":"write_group","groupId":"..."}   (write a fresh set of questions for a group)',
    '{"op":"fill_gaps","groupId":"..."}   (write questions for sections and difficulty levels that are under-covered)',
    '{"op":"remove_duplicates"}   (drop questions that repeat another question)',
    '{"op":"lock","questionIds":["q.."],"locked":true}',
    'Return JSON {"reply":"your message","actions":[...]} with at most 6 actions. Use ids exactly as given. Never invent facts that are not in the document. Describe what you did in the past tense; the app lists the exact changes itself.',
  ].join('\n');
  const history = messages.slice(-10, -1).map(m => `${m.role === 'user' ? 'Reviewer' : 'You'}: ${m.text}`).join('\n');
  const user = `Current state (JSON):\n${JSON.stringify(context).slice(0, 60000)}\n\nConversation so far:\n${history || '(none)'}\n\nReviewer's latest message: ${msg}`;
  let r;
  try { r = await askAI(ai, { system, user, maxTokens: 3000, timeoutMs: 90000 }); }
  catch (e) { const er = httpError(e.status && e.status >= 400 && e.status < 600 ? 502 : 502, 'The AI could not answer just now (' + (e.message || 'no reply') + '). Nothing was changed. Try again.'); throw er; }
  const js = r.json || {};
  const actions = (Array.isArray(js.actions) ? js.actions : []).filter(a => a && typeof a === 'object').slice(0, 6);
  const hist = pushHistory(st, msg.length > 70 ? msg.slice(0, 67) + '...' : msg);
  const done = [], problems = [];
  let curGroups = groups.slice(), curDrafts = drafts.slice(), curSecs = secs.slice();
  const lockedIds = () => new Set(curDrafts.filter(d => d.locked).map(d => d.id));
  for (const a of actions) {
    try {
      if (a.op === 'remove') {
        const want = new Set((a.questionIds || []).map(String)); const lk = lockedIds();
        const hit = curDrafts.filter(d => want.has(d.id));
        if (!hit.length) { problems.push('Could not find the question(s) to remove'); continue; }
        const skip = hit.filter(d => lk.has(d.id) || d.saved).length;
        curDrafts = curDrafts.filter(d => !(want.has(d.id) && !lk.has(d.id) && !d.saved));
        if (hit.length - skip) done.push(`Removed ${hit.length - skip} question(s)`);
        if (skip) problems.push(`Kept ${skip} locked or already-saved question(s)`);
      } else if (a.op === 'include_sections') {
        const ids = new Set((a.sectionIds || []).map(String)); const hit = curSecs.filter(sc => ids.has(sc.id));
        if (!hit.length) { problems.push('Could not find those sections'); continue; }
        hit.forEach(sc => { sc.include = a.include !== false; });
        done.push(`${a.include === false ? 'Skipped' : 'Included'} ${hit.length} section(s)`);
      } else if (a.op === 'set_groups') {
        const used = new Set();
        const ng = (a.groups || []).slice(0, 20).map(g => {
          const old = curGroups.find(x => x.id === g.id);
          return { id: old ? old.id : 'g' + uid(), title: clean(g.title, 140) || (old && old.title) || 'Assessment', why: clean(g.why, 300),
            sectionIds: (g.sectionIds || []).filter(sid => curSecs.some(sc => sc.id === sid) && !used.has(sid) && used.add(sid)),
            questionCount: Math.max(1, Math.min(25, Math.round(Number(g.questionCount) || (old && old.questionCount) || 8))),
            difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(g.difficulty) ? g.difficulty : 'mixed',
            types: Array.isArray(g.types) && g.types.length ? g.types : ((old && old.types) || ['single', 'multi', 'truefalse']) };
        }).filter(g => g.sectionIds.length);
        if (!ng.length) { problems.push('The new grouping had no sections'); continue; }
        curDrafts = curDrafts.map(d => { const g = ng.find(x => (d.sectionIds || []).some(sid => x.sectionIds.includes(sid))) || ng.find(x => x.id === d.groupId); return g ? { ...d, groupId: g.id } : null; }).filter(Boolean);
        curGroups = ng; done.push(`Regrouped into ${ng.length} assessment(s)`);
      } else if (a.op === 'merge_groups') {
        const m = mergeGroupList(curGroups, curDrafts, (a.groupIds || []).map(String), a.title);
        curGroups = m.groups; curDrafts = m.drafts; done.push(`Combined into "${m.merged.title}"`);
      } else if (a.op === 'add_questions' || a.op === 'write_group') {
        const g = curGroups.find(x => x.id === a.groupId) || (focusGroup && curGroups.find(x => x.id === focusGroup.id)) || curGroups[0];
        if (!g) throw new Error('No assessment to add to');
        st.drafts_json = JSON.stringify(curDrafts); st.sections_json = JSON.stringify(curSecs);
        const qs = await writeForGroup(st, g, ai, a.op === 'add_questions' ? { count: a.count || 3, focus: a.focus, sectionIds: a.sectionIds, types: a.types, difficulty: a.difficulty } : {});
        if (a.op === 'write_group') curDrafts = curDrafts.filter(d => d.groupId !== g.id || d.locked || d.saved);
        curDrafts.push(...qs); done.push(`Wrote ${qs.length} question(s) for "${g.title}"`);
      } else if (a.op === 'fill_gaps') {
        const g = curGroups.find(x => x.id === a.groupId) || (focusGroup && curGroups.find(x => x.id === focusGroup.id)) || curGroups[0];
        const cov = g && coverageFor(st, g, curDrafts, curSecs);
        if (!cov) { problems.push('Write some questions first, then I can look for gaps'); continue; }
        const tasks = cov.sections.filter(x => x.gap).map(x => ({ label: x.title, count: x.need, sectionIds: [x.id] }));
        if (cov.mixGap) Object.entries(cov.mixNeed).filter(([, n]) => n > 0).forEach(([d, n]) => tasks.push({ label: d + ' level', count: n, difficulty: d }));
        if (!tasks.length) { done.push(`"${g.title}" has no gaps`); continue; }
        let n = 0;
        for (const t of tasks.slice(0, 4)) {
          st.drafts_json = JSON.stringify(curDrafts); st.sections_json = JSON.stringify(curSecs);
          const qs = (await writeForGroup(st, g, ai, { count: t.count, sectionIds: t.sectionIds, difficulty: t.difficulty })).slice(0, t.count + 1);
          curDrafts.push(...qs); n += qs.length;
        }
        done.push(`Filled gaps in "${g.title}" with ${n} question(s)`);
      } else if (a.op === 'remove_duplicates') {
        await markDupes(curDrafts);
        const drop = new Set(curDrafts.filter(d => d.dupe && !d.saved && !d.locked && !d.dupeOk && (d.dupe.kind === 'bank' || curDrafts.findIndex(x => x.id === d.id) > curDrafts.findIndex(x => x.id === d.dupe.id))).map(d => d.id));
        curDrafts = curDrafts.filter(d => !drop.has(d.id));
        done.push(drop.size ? `Removed ${drop.size} duplicate(s)` : 'No duplicates found');
      } else if (a.op === 'lock') {
        const want = new Set((a.questionIds || []).map(String)); let n = 0;
        curDrafts.forEach(d => { if (want.has(d.id) && !d.saved) { if (a.locked === false) delete d.locked; else d.locked = true; n++; } });
        if (n) done.push(`${a.locked === false ? 'Unlocked' : 'Locked'} ${n} question(s)`); else problems.push('Could not find those questions');
      } else if (a.op === 'rewrite') {
        const lk = lockedIds();
        const ids = (a.questionIds || []).map(String).filter(q => !lk.has(q)).slice(0, 20);
        const skippedLocked = (a.questionIds || []).length - ids.length;
        const out = await pool(ids, 4, async (qid) => {
          const k = curDrafts.findIndex(d => d.id === qid); if (k < 0) return null;
          const d = curDrafts[k];
          try { const res = await A.improveQuestion({ question: d, instruction: a.instruction, ai }); const g = curGroups.find(x => x.id === d.groupId) || { id: d.groupId, sectionIds: d.sectionIds }; return { k, nd: { ...normDraft(res.question, g, d.sectionIds), id: d.id } }; }
          catch (e) { problems.push(`One question could not be rewritten (${e.message})`); return null; }
        });
        let n = 0; out.filter(Boolean).forEach(o => { curDrafts[o.k] = o.nd; n++; });
        if (n) done.push(`Rewrote ${n} question(s)`); else if (!problems.length) problems.push('Could not find the question(s) to rewrite');
        if (skippedLocked > 0) problems.push(`Kept ${skippedLocked} locked question(s) as they were`);
      } else problems.push(`I did not understand the step "${String(a.op).slice(0, 30)}"`);
    } catch (e) { problems.push(e.message); }
  }
  await markDupes(curDrafts);
  let reply = clean(js.reply, 3000).trim();
  if (!reply) reply = actions.length ? (done.length ? 'Done.' : 'I tried, but none of the changes could be applied.') : 'I did not change anything. Tell me what you would like, for example "make these questions harder" or "add 3 questions on refunds".';
  else if (actions.length && !done.length && problems.length) reply += '\n\n(None of the changes could be applied.)';
  messages.push({ role: 'assistant', text: reply, at: new Date().toISOString(), done, problems, undoId: done.length ? hist.id : null });
  await save(st.id, { groups: curGroups, drafts: curDrafts, sections: curSecs, messages, history: done.length ? hist.history : undefined });
  return view(await load(st.id));
}

/** Save drafts to the bank; then create a draft assessment per group, or add them to an existing one. */
async function publish(id, { groupIds, createTests = true, secondsPerQuestion, targets = {}, approve = false, skipDupes = false }, by) {
  const st = await load(id);
  const groups = j(st.groups_json, []).filter(g => !groupIds || !groupIds.length || groupIds.includes(g.id));
  const drafts = j(st.drafts_json, []);
  const secs = j(st.sections_json, []);
  const secTag = (sid) => { const sc = secs.find(x => x.id === sid); return sc ? sc.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 3).join(' ') : ''; };
  const made = [], errors = [];
  for (const g of groups) {
    const ids = []; let skippedDupes = 0;
    const tv = targets && targets[g.id]; const target = Number(tv) || 0; const bankOnly = tv === 'none';
    for (const d of drafts.filter(x => x.groupId === g.id && !x.saved)) {
      if (skipDupes && d.dupe && !d.dupeOk) { skippedDupes++; continue; }
      try {
        const tags = Array.from(new Set([...(d.tags || []), ...(d.sectionIds || []).map(secTag)].filter(Boolean))).slice(0, 8);
        const qid = await A.saveQuestion(null, { ...d, tags, status: 'draft', source: `AI Studio: ${clean(st.source_name, 80)}` }, by);
        ids.push(qid); d.saved = qid;
      } catch (e) { errors.push(`"${d.prompt.slice(0, 60)}": ${e.message}`); }
    }
    let testId = null, meta = null, addedTo = null;
    if (target) {
      const all2 = ids.concat(drafts.filter(x => x.groupId === g.id && typeof x.saved === 'number' && !ids.includes(x.saved)).map(x => x.saved));
      try { addedTo = await A.addToTest(target, all2, by, { approve }); } catch (e) { errors.push(`${g.title}: ${e.message}`); }
    } else {
      if (ids.length) { try { meta = await A.suggestMeta({ questionIds: ids, ai: require('./ai'), hint: `Assessment: ${g.title}. ${g.why || ''}` }); } catch (e) { meta = null; } }
      if (meta) { try { for (const [qid, pq] of Object.entries(meta.perQuestion || {})) await A.setQuestionModule(Number(qid), pq.module, pq.sub); } catch (e) { /* best effort */ } }
      if (createTests && !bankOnly && ids.length) {
        testId = await A.saveTest(null, { title: g.title, description: (meta && meta.description) || g.why || `Built in AI Studio from ${st.source_name}.`, questionIds: ids, status: 'draft',
          settings: { secondsPerQuestion: Math.max(15, Math.min(180, Number(secondsPerQuestion) || 40)), navigation: 'bank', explainCount: 1, modules: meta ? meta.modules : [], prep: meta ? meta.prep : undefined } }, by);
        g.testId = testId;
      }
    }
    made.push({ groupId: g.id, title: g.title, questions: ids.length, testId, addedTo, skippedDupes });
  }
  const allGroups = j(st.groups_json, []).map(g => (groups.find(x => x.id === g.id) || g));
  const msgs = j(st.messages_json, []);
  const nq = made.reduce((t, m) => t + m.questions, 0);
  const adds = made.filter(m => m.addedTo);
  msgs.push({ role: 'assistant', text: `Saved ${nq} question(s) to the bank as drafts${createTests ? ` and created ${made.filter(m => m.testId).length} draft assessment(s)` : ''}${adds.length ? `; added ${adds.reduce((t, m) => t + m.addedTo.added, 0)} to ${adds.map(m => '"' + m.addedTo.title + '"').join(', ')}` : ''}. Review them, approve the questions you like, then publish.`, at: new Date().toISOString(), done: [], problems: [] });
  // Only call it saved when nothing is left behind (saving one assessment must not hide the others).
  const left = drafts.filter(d => !d.saved && d.ok !== false).length;
  await save(st.id, { drafts, groups: allGroups, messages: msgs, status: left ? 'draft' : 'saved' });
  return { made, errors, view: view(await load(st.id)) };
}

module.exports = { setDB, initSchema, create, list, getView, remove, update, generate, chat, publish, fillGaps, mergeGroups, undo, removeDupes, _splitSections: splitSections, _coverageFor: coverageFor, _mergeGroupList: mergeGroupList };
