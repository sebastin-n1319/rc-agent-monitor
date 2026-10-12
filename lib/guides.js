/**
 * Support guides (Batch 156).
 * Two read-only guides for agents, stored as HTML in content/guides/:
 *   voip        T1 CS VoIP Support Guide and Query Catalog (from the Word document)
 *   ai          T1 AI Support Runbook (copied from t1-ai-support.web.app, shown with its own design)
 * Ask AI answers a question from these guides only: the question picks the closest guide passages (simple keyword
 * scoring, no external search), and the AI writes a short answer citing those passages.
 *
 * Access: every tool member, plus a guest list of people outside the team (guide_guests) who can open only /guides.
 */
const fs = require('fs');
const path = require('path');

let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS guide_guests (email TEXT PRIMARY KEY, note TEXT, added_by TEXT, added_at TEXT DEFAULT (datetime('now')))`);
}
async function listGuests() { return all(`SELECT email, note, added_by, added_at FROM guide_guests ORDER BY added_at DESC`); }
async function isGuest(email) { const r = await get(`SELECT 1 AS ok FROM guide_guests WHERE email = ?`, [lc(email)]).catch(() => null); return !!r; }
async function addGuests(emails, note, by) {
  const list = (Array.isArray(emails) ? emails : String(emails || '').split(/[\s,;]+/)).map(lc).filter(e => EMAIL_RE.test(e));
  let added = 0;
  for (const e of list) { const r = await run(`INSERT OR IGNORE INTO guide_guests (email, note, added_by) VALUES (?,?,?)`, [e, String(note || '').slice(0, 120) || null, by || null]); added += r.changes || 0; }
  return { added, emails: list };
}
async function removeGuest(email) { await run(`DELETE FROM guide_guests WHERE email = ?`, [lc(email)]); }

// ── documents ─────────────────────────────────────────────────────────────
const DIR = path.join(__dirname, '..', 'content', 'guides');
const DOCS = [
  { id: 'voip', file: 'voip.html', title: 'VoIP support', sub: 'T1 CS VoIP Support Guide and Query Catalog', kind: 'fragment' },
  { id: 'ai', file: 'ai-runbook.html', title: 'AI support', sub: 'T1 AI Support Runbook', kind: 'page' },
];
const decode = s => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&middot;/g, '·');
const textOf = h => decode(String(h).replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<(br|\/p|\/li|\/tr|\/h\d|\/div)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

let _cache = null;
function load() {
  if (_cache) return _cache;
  const out = {};
  for (const d of DOCS) {
    let html = '';
    try { html = fs.readFileSync(path.join(DIR, d.file), 'utf8'); } catch (e) { html = ''; }
    const chunks = [];
    if (d.id === 'voip') {
      // Sections start at each h1/h2/h3; the path of parent headings is kept for context.
      const re = /<h([1-3]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
      const marks = []; let m;
      while ((m = re.exec(html))) marks.push({ lvl: Number(m[1]), id: m[2], title: textOf(m[3]).replace(/\s+/g, ' '), at: m.index, end: re.lastIndex });
      const trail = [];
      marks.forEach((k, i) => {
        trail[k.lvl - 1] = k.title; trail.length = k.lvl;
        const body = textOf(html.slice(k.end, i + 1 < marks.length ? marks[i + 1].at : html.length));
        if (body.length > 20) chunks.push({ id: k.id, title: k.title, path: trail.slice(0, -1).filter(Boolean).join(' > '), text: body });
      });
    } else {
      const main = html.slice(Math.max(0, html.indexOf('<main')));
      const re = /<section id="([^"]+)">|<article class="case">/g;
      const marks = []; let m;
      while ((m = re.exec(main))) marks.push({ id: m[1] || null, at: m.index });
      let sec = null, secTitle = '';
      marks.forEach((k, i) => {
        const seg = main.slice(k.at, i + 1 < marks.length ? marks[i + 1].at : main.length);
        if (k.id) { sec = k.id; const h = /<h2>([\s\S]*?)<\/h2>/.exec(seg); secTitle = h ? textOf(h[1]) : k.id; }
        let title = secTitle;
        if (!k.id) { const t = /<div class="case-title">([\s\S]*?)<\/div>|<h3[^>]*>([\s\S]*?)<\/h3>/.exec(seg); const head = textOf(seg).split('\n')[0]; title = (t ? textOf(t[1] || t[2]) : head.slice(0, 90)).replace(/\s+/g, ' ').trim(); }
        const body = textOf(seg);
        if (sec && body.length > 20) chunks.push({ id: sec, title, path: k.id ? '' : secTitle, text: body });
      });
    }
    // Long sections are cut into pieces of about 1,800 characters so one question does not pull a whole chapter.
    const pieces = [];
    for (const c of chunks) {
      if (c.text.length <= 2200) { pieces.push(c); continue; }
      const paras = c.text.split('\n'); let buf = '';
      for (const p of paras) { if ((buf + '\n' + p).length > 1800 && buf) { pieces.push({ ...c, text: buf }); buf = p; } else buf = buf ? buf + '\n' + p : p; }
      if (buf) pieces.push({ ...c, text: buf });
    }
    out[d.id] = { ...d, html, chunks: pieces };
  }
  _cache = out;
  return out;
}
function docList() { const d = load(); return DOCS.map(x => ({ id: x.id, title: x.title, sub: x.sub, kind: x.kind, sections: d[x.id].chunks.length })); }
function docHtml(id) { const d = load()[id]; return d ? d.html : null; }

// ── retrieval ─────────────────────────────────────────────────────────────
const STOP = new Set('a an the and or but if of to in on at for with by from is are was were be been it its this that these those how what why when where who which do does did can could should would will i we you they he she my our your their me us them not no yes as so than then there here about into out up down over under after before again just also only very more most some any all each per via vs please help need want get got make made use using used t1 adit client clients'.split(' '));
const words = s => lc(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
function stem(w) { return w.replace(/(ing|ed|es|s)$/,'') || w; }
function search(question, { limit = 8, maxChars = 14000, doc = null } = {}) {
  const docs = load();
  const qw = [...new Set(words(question).map(stem))];
  if (!qw.length) return [];
  const all = [];
  for (const d of Object.values(docs)) { if (doc && d.id !== doc) continue; for (const c of d.chunks) all.push({ doc: d.id, docTitle: d.title, ...c }); }
  const N = all.length || 1, df = {};
  const toks = all.map(c => { const t = words(c.title + ' ' + c.path + ' ' + c.text).map(stem); const set = new Set(t); for (const w of set) df[w] = (df[w] || 0) + 1; return t; });
  const scored = all.map((c, i) => {
    const t = toks[i], tf = {}; for (const w of t) tf[w] = (tf[w] || 0) + 1;
    const titleW = new Set(words(c.title + ' ' + c.path).map(stem));
    let s = 0, hit = 0;
    for (const w of qw) { if (!tf[w]) continue; hit++; const idf = Math.log(1 + N / df[w]); s += idf * (tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + 0.75 * t.length / 260)) + (titleW.has(w) ? idf * 1.5 : 0); }
    return { c, s: s * (0.5 + hit / qw.length) };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const picked = []; let used = 0;
  for (const x of scored) { if (picked.length >= limit) break; if (used + x.c.text.length > maxChars && picked.length) continue; picked.push(x.c); used += x.c.text.length; }
  return picked;
}

// ── Ask AI ────────────────────────────────────────────────────────────────
async function ask({ question, history = [], doc = null, ai }) {
  const q = String(question || '').trim().slice(0, 600);
  if (q.length < 3) throw Object.assign(new Error('Type a question first'), { status: 400 });
  const lastUser = (history || []).filter(m => m.role === 'user').slice(-1).map(m => m.content).join(' ');
  let hits = search(q + ' ' + lastUser, { doc });
  if (!hits.length) hits = search(q, {});
  if (!hits.length) return { answer: "I couldn't find this in the VoIP or AI support guides. Check with your lead or the owning team.", sources: [], found: false };
  const ctx = hits.map((h, i) => `[S${i + 1}] ${h.docTitle} guide > ${h.path ? h.path + ' > ' : ''}${h.title}\n${h.text}`).join('\n\n');
  const hist = (history || []).slice(-6).map(m => `${m.role === 'user' ? 'Agent' : 'Assistant'}: ${String(m.content).slice(0, 800)}`).join('\n');
  const system = `You help Adit Tier 1 support agents answer client questions about Adit Voice (VoIP) and Adit AI products, using ONLY the guide excerpts given.
Rules: answer in plain, short sentences an agent can act on during a live call; use numbered steps for procedures (max 8 steps); include settings paths and ticket numbers exactly as written; say who handles it when the guide says so (T1, Phones team, AI Support). If the excerpts do not answer the question, say so plainly and suggest the closest topic; never invent settings, numbers, names or policies. Never use em dashes or en dashes. Keep the answer under 180 words.
Return JSON: {"answer": string, "sources": [numbers of the excerpts you used, e.g. 1,3], "found": boolean}`;
  const user = `${hist ? 'Conversation so far:\n' + hist + '\n\n' : ''}Question: ${q}\n\nGuide excerpts:\n${ctx}`;
  const r = await ai.bestJSON({ system, user, maxTokens: 900, feature: 'guides', timeoutMs: 60000 });
  const j = r.json || {};
  const nums = Array.isArray(j.sources) ? j.sources.map(n => Number(String(n).replace(/\D/g, ''))).filter(n => n >= 1 && n <= hits.length) : [];
  const seen = new Set();
  const sources = nums.map(n => hits[n - 1]).filter(h => { const k = h.doc + '#' + h.id; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(h => ({ doc: h.doc, docTitle: h.docTitle, id: h.id, title: h.title, path: h.path }));
  const answer = String(j.answer || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').slice(0, 2500);
  return { answer: answer || "I couldn't find this in the guides.", sources, found: j.found !== false };
}

module.exports = { setDB, initSchema, listGuests, isGuest, addGuests, removeGuest, docList, docHtml, search, ask, load };
