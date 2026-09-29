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
async function save(id, { sections, groups, drafts, messages, summary, title, status }) {
  const sets = [], p = [];
  if (sections) { sets.push('sections_json = ?'); p.push(JSON.stringify(sections)); }
  if (groups) { sets.push('groups_json = ?'); p.push(JSON.stringify(groups)); }
  if (drafts) { sets.push('drafts_json = ?'); p.push(JSON.stringify(drafts)); }
  if (messages) { sets.push('messages_json = ?'); p.push(JSON.stringify(messages.slice(-80))); }
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
function view(st) {
  const secs = j(st.sections_json, []);
  return { id: st.id, title: st.title, sourceName: st.source_name, sourceKind: st.source_kind, focus: st.focus || '', summary: st.summary || '', status: st.status,
    chars: (st.text || '').length, createdBy: st.created_by, createdAt: st.created_at, updatedAt: st.updated_at,
    sections: secs.map(sc => ({ id: sc.id, title: sc.title, chars: sc.chars, summary: sc.summary, keyPoints: sc.keyPoints, include: sc.include, preview: sc.text.slice(0, 600) })),
    groups: j(st.groups_json, []), drafts: j(st.drafts_json, []), messages: j(st.messages_json, []) };
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
  if (Array.isArray(b.groups)) out.groups = b.groups.slice(0, 20).map(g => ({ id: g.id || 'g' + uid(), title: clean(g.title, 140) || 'Assessment', why: clean(g.why, 300),
    sectionIds: (g.sectionIds || []).map(String).slice(0, 60), questionCount: Math.max(1, Math.min(25, Math.round(Number(g.questionCount) || 8))),
    difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(g.difficulty) ? g.difficulty : 'mixed',
    types: (Array.isArray(g.types) && g.types.length ? g.types : ['single', 'multi', 'truefalse']).filter(t => ['single', 'multi', 'truefalse', 'ordering', 'matching'].includes(t)) }));
  if (Array.isArray(b.sections)) {
    const secs = j(st.sections_json, []);
    const inc = new Map(b.sections.map(x => [x.id, x.include !== false]));
    secs.forEach(sc => { if (inc.has(sc.id)) sc.include = inc.get(sc.id); });
    out.sections = secs;
  }
  if (Array.isArray(b.drafts)) {
    const groups = out.groups || j(st.groups_json, []);
    out.drafts = b.drafts.slice(0, 400).map(d => { const g = groups.find(x => x.id === d.groupId) || groups[0] || { id: 'g0', sectionIds: [] }; const n = normDraft(d, g, d.sectionIds); n.id = d.id || n.id; return n; });
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
/** Write (or rewrite) the questions for some groups. */
async function generate(id, { groupIds, replace }, ai) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const st = await load(id);
  const groups = j(st.groups_json, []);
  let drafts = j(st.drafts_json, []);
  const pick = groups.filter(g => !groupIds || !groupIds.length || groupIds.includes(g.id));
  const errors = [];
  for (const g of pick) {
    try {
      const qs = await writeForGroup(st, g, ai);
      if (replace !== false) drafts = drafts.filter(d => d.groupId !== g.id || d.saved);
      drafts.push(...qs);
      st.drafts_json = JSON.stringify(drafts);
    } catch (e) { errors.push(`${g.title}: ${e.message}`); }
  }
  await save(st.id, { drafts });
  return { ...view(await load(st.id)), errors };
}

/** Talk to the AI about the plan and the drafts. It replies and proposes
 *  actions; the server carries them out. */
async function chat(id, { message, groupId }, ai, by) {
  if (!ai || !ai.anyConfigured()) throw httpError(503, 'AI is not configured on the server.');
  const st = await load(id);
  const msg = clean(message, 2000).trim();
  if (!msg) throw httpError(400, 'Type a message');
  const secs = j(st.sections_json, []), groups = j(st.groups_json, []), drafts = j(st.drafts_json, []);
  const messages = j(st.messages_json, []);
  messages.push({ role: 'user', text: msg, at: new Date().toISOString(), by: lc(by) });
  const context = {
    document: st.source_name, summary: st.summary, focus: st.focus,
    sections: secs.map(sc => ({ id: sc.id, title: sc.title, chars: sc.chars, include: sc.include, summary: sc.summary })),
    groups: groups.map(g => ({ id: g.id, title: g.title, sectionIds: g.sectionIds, questionCount: g.questionCount, difficulty: g.difficulty, types: g.types })),
    drafts: drafts.slice(0, 120).map(d => ({ id: d.id, groupId: d.groupId, type: d.type, prompt: d.prompt.slice(0, 220), difficulty: d.difficulty })),
    selectedGroup: groupId || null,
  };
  const system = [
    'You are the assessment designer working with a customer support team lead on turning a document into assessments.',
    'Reply briefly and helpfully, like a colleague. If the request is unclear, ask one short question and take no action.',
    'You can change things by returning actions. Available actions:',
    '{"op":"add_questions","groupId":"...","count":3,"focus":"...","sectionIds":["s2"],"types":["single","multi","truefalse","ordering","matching"],"difficulty":"easy|medium|hard"}',
    '{"op":"rewrite","questionIds":["q..."],"instruction":"what to change"}   (max 10 questions)',
    '{"op":"remove","questionIds":["q..."]}',
    '{"op":"set_groups","groups":[{"id":"existing id or new","title":"...","sectionIds":["s1"],"questionCount":8,"difficulty":"mixed","types":["single","multi","truefalse"]}]}   (the full new list of groups; use to split, merge or regroup)',
    '{"op":"include_sections","sectionIds":["s3"],"include":false}',
    '{"op":"write_group","groupId":"..."}   (write a fresh set of questions for a group)',
    'Return JSON {"reply":"your message","actions":[...]} with at most 5 actions. Use ids exactly as given. Never invent facts that are not in the document.',
  ].join('\n');
  const history = messages.slice(-10).map(m => `${m.role === 'user' ? 'Reviewer' : 'You'}: ${m.text}`).join('\n');
  const user = `Current state (JSON):\n${JSON.stringify(context).slice(0, 60000)}\n\nConversation so far:\n${history}\n\nReviewer's latest message: ${msg}`;
  const r = await ai.bestJSON({ system, user, maxTokens: 3000, timeoutMs: 90000 });
  const js = r.json || {};
  const done = [], problems = [];
  let curGroups = groups.slice(), curDrafts = drafts.slice(), curSecs = secs.slice();
  for (const a of (Array.isArray(js.actions) ? js.actions : []).slice(0, 5)) {
    try {
      if (a.op === 'remove') {
        const ids = new Set(a.questionIds || []); const before = curDrafts.length;
        curDrafts = curDrafts.filter(d => !ids.has(d.id)); done.push(`Removed ${before - curDrafts.length} question(s)`);
      } else if (a.op === 'include_sections') {
        const ids = new Set(a.sectionIds || []); curSecs.forEach(sc => { if (ids.has(sc.id)) sc.include = a.include !== false; });
        done.push(`${a.include === false ? 'Skipped' : 'Included'} ${ids.size} section(s)`);
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
        if (ng.length) {
          // keep drafts whose sections still belong to a group; move them to that group
          curDrafts = curDrafts.map(d => { const g = ng.find(x => (d.sectionIds || []).some(sid => x.sectionIds.includes(sid))) || ng.find(x => x.id === d.groupId); return g ? { ...d, groupId: g.id } : null; }).filter(Boolean);
          curGroups = ng; done.push(`Regrouped into ${ng.length} assessment(s)`);
        }
      } else if (a.op === 'add_questions' || a.op === 'write_group') {
        const g = curGroups.find(x => x.id === a.groupId) || curGroups.find(x => x.id === groupId) || curGroups[0];
        if (!g) throw new Error('No assessment to add to');
        st.drafts_json = JSON.stringify(curDrafts); st.sections_json = JSON.stringify(curSecs);
        const qs = await writeForGroup(st, g, ai, a.op === 'add_questions' ? { count: a.count || 3, focus: a.focus, sectionIds: a.sectionIds, types: a.types, difficulty: a.difficulty } : {});
        if (a.op === 'write_group') curDrafts = curDrafts.filter(d => d.groupId !== g.id);
        curDrafts.push(...qs); done.push(`Wrote ${qs.length} question(s) for "${g.title}"`);
      } else if (a.op === 'rewrite') {
        const ids = (a.questionIds || []).slice(0, 10); let n = 0;
        for (const qid of ids) {
          const k = curDrafts.findIndex(d => d.id === qid); if (k < 0) continue;
          const d = curDrafts[k];
          const out = await A.improveQuestion({ question: d, instruction: a.instruction, ai });
          const g = curGroups.find(x => x.id === d.groupId) || { id: d.groupId, sectionIds: d.sectionIds };
          curDrafts[k] = { ...normDraft(out.question, g, d.sectionIds), id: d.id };
          n++;
        }
        done.push(`Rewrote ${n} question(s)`);
      }
    } catch (e) { problems.push(e.message); }
  }
  messages.push({ role: 'assistant', text: clean(js.reply, 3000) || 'Done.', at: new Date().toISOString(), done, problems });
  await save(st.id, { groups: curGroups, drafts: curDrafts, sections: curSecs, messages });
  return view(await load(st.id));
}

/** Save drafts to the bank and create one draft assessment per group. */
async function publish(id, { groupIds, createTests = true, secondsPerQuestion }, by) {
  const st = await load(id);
  const groups = j(st.groups_json, []).filter(g => !groupIds || !groupIds.length || groupIds.includes(g.id));
  const drafts = j(st.drafts_json, []);
  const secs = j(st.sections_json, []);
  const secTag = (sid) => { const sc = secs.find(x => x.id === sid); return sc ? sc.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 3).join(' ') : ''; };
  const made = [], errors = [];
  for (const g of groups) {
    const ids = [];
    for (const d of drafts.filter(x => x.groupId === g.id && !x.saved)) {
      try {
        const tags = Array.from(new Set([...(d.tags || []), ...(d.sectionIds || []).map(secTag)].filter(Boolean))).slice(0, 8);
        const qid = await A.saveQuestion(null, { ...d, tags, status: 'draft', source: `AI Studio: ${clean(st.source_name, 80)}` }, by);
        ids.push(qid); d.saved = qid;
      } catch (e) { errors.push(`"${d.prompt.slice(0, 60)}": ${e.message}`); }
    }
    let testId = null, meta = null;
    if (ids.length) { try { meta = await A.suggestMeta({ questionIds: ids, ai: require('./ai'), hint: `Assessment: ${g.title}. ${g.why || ''}` }); } catch (e) { meta = null; } }
    if (meta) { try { for (const [qid, pq] of Object.entries(meta.perQuestion || {})) await A.setQuestionModule(Number(qid), pq.module, pq.sub); } catch (e) { /* best effort */ } }
    if (createTests && ids.length) {
      testId = await A.saveTest(null, { title: g.title, description: (meta && meta.description) || g.why || `Built in AI Studio from ${st.source_name}.`, questionIds: ids, status: 'draft',
        settings: { secondsPerQuestion: Math.max(15, Math.min(180, Number(secondsPerQuestion) || 40)), navigation: 'bank', explainCount: 1, modules: meta ? meta.modules : [], prep: meta ? meta.prep : undefined } }, by);
      g.testId = testId;
    }
    made.push({ groupId: g.id, title: g.title, questions: ids.length, testId });
  }
  const allGroups = j(st.groups_json, []).map(g => (groups.find(x => x.id === g.id) || g));
  const msgs = j(st.messages_json, []);
  msgs.push({ role: 'assistant', text: `Saved ${made.reduce((t, m) => t + m.questions, 0)} question(s) to the bank as drafts${createTests ? ` and created ${made.filter(m => m.testId).length} draft assessment(s)` : ''}. Review them, approve the questions you like, then publish.`, at: new Date().toISOString() });
  // Only call it saved when nothing is left behind (saving one assessment must not hide the others).
  const left = drafts.filter(d => !d.saved && d.ok !== false).length;
  await save(st.id, { drafts, groups: allGroups, messages: msgs, status: left ? 'draft' : 'saved' });
  return { made, errors, view: view(await load(st.id)) };
}

module.exports = { setDB, initSchema, create, list, getView, remove, update, generate, chat, publish, _splitSections: splitSections };
