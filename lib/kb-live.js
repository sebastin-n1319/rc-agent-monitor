'use strict';
/**
 * Batch 185: the Help Center, read live from help.adit.com.
 *
 * Adit Expert used to read a one-time export of the Help Center (content/kb/product-kb.json). Articles are corrected
 * and added in Zoho Desk all the time, so this reads the public Help Center API instead: the article list every
 * 30 minutes, and the full text only for articles that are new or were edited since the last read. Unpublished
 * articles drop out. The export stays as the fallback until the first read finishes, and supplies the module names.
 */
const BASE = (process.env.KB_PORTAL_BASE || 'https://help.adit.com').replace(/\/+$/, '');
const DEFAULT_PORTAL = 'edbsn16f89f92a8e41d5ebe9e0a9d047fe6ff8a54944972cb43d0d242ca8c767c966f';

let _db = null;
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function initSchema(db) {
  _db = db;
  await run(`CREATE TABLE IF NOT EXISTS expert_kb (id TEXT PRIMARY KEY, zid TEXT, permalink TEXT, title TEXT NOT NULL, module TEXT, kind TEXT,
    url TEXT, updated TEXT, modified_time TEXT, category TEXT, root_category TEXT, blocks_json TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')))`);
}

async function getJSON(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'AditExpert/1.0' } });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* not json */ }
    if (!r.ok || !j) throw new Error('Help Center ' + r.status + ': ' + text.slice(0, 160));
    if (j.errorCode) throw new Error('Help Center: ' + (j.message || j.errorCode));
    return j;
  } finally { clearTimeout(t); }
}
let _portal = process.env.KB_PORTAL_ID || null;
async function portalId() {
  if (_portal) return _portal;
  try {
    const r = await fetch(BASE + '/portal/en/kb', { headers: { 'user-agent': 'AditExpert/1.0' } });
    const m = (await r.text()).match(/portalId\\?x22:\\?x22(edbsn[0-9a-f]+)|portalId\\?"\s*:\s*\\?"(edbsn[0-9a-f]+)/);
    _portal = (m && (m[1] || m[2])) || DEFAULT_PORTAL;
  } catch (e) { _portal = DEFAULT_PORTAL; }
  return _portal;
}

// ── HTML to the same blocks the export used: p, li, h3-h5, table ─────────
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C', hellip: '...', ndash: '-', mdash: '-', bull: '-', middot: '-', copy: '(c)', reg: '(R)', trade: '(TM)', rarr: '->', larr: '<-', gt_: '>' };
function decode(s) {
  return String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] != null ? ENT[n.toLowerCase()] : m)
    .replace(/[\u2014\u2013]/g, '-').replace(/\u00A0/g, ' ');
}
const inline = (s) => decode(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function htmlToBlocks(html) {
  let s = String(html || '').replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const tables = [];
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
    const rows = [];
    for (const tr of t.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(inline);
      if (cells.some(Boolean)) rows.push(cells);
    }
    tables.push(rows);
    return '\n\u0001' + (tables.length - 1) + '\u0001\n';
  });
  s = s.replace(/<h([1-6])[^>]*>/gi, (_, n) => '\n\u0002h' + Math.min(5, Math.max(3, +n + (+n <= 2 ? 3 - +n : 0))) + '\u0002').replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n\u0002li\u0002').replace(/<\/li>/gi, '\n')
    .replace(/<\/?(p|div|ul|ol|section|article|blockquote|pre|tr|hr)[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<img[^>]*>/gi, ' ').replace(/<[^>]+>/g, '');
  const out = []; let pending = null;
  for (let line of s.split('\n')) {
    let t = null;
    line = line.replace(/\u0002(h[345]|li)\u0002/g, (_, k) => { t = k; return ''; });
    const tm = line.match(/^\s*\u0001(\d+)\u0001\s*$/);
    if (tm) { const rows = tables[+tm[1]]; if (rows && rows.length) out.push({ t: 'table', rows }); pending = null; continue; }
    const x = decode(line).replace(/\s+/g, ' ').trim();
    if (!x) { if (t) pending = t; continue; }
    const type = t || pending || 'p'; pending = null;
    // A heading the editor wrote as a bold paragraph stays a paragraph; the search does not need it.
    if (type === 'p' && out.length && out[out.length - 1].t === 'li' && /^[a-z(]/.test(x)) { out[out.length - 1].x += ' ' + x; continue; }
    out.push({ t: type, x });
  }
  return out;
}

// ── Module names from the export, so the Help Center tab keeps the same 17 modules ─────────────
function slugOf(url) { const m = String(url || '').match(/\/articles\/([^/?#]+)/); return m ? m[1] : ''; }
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
function kindOf(root, old) {
  const r = String(root || '').toLowerCase();
  if (/how/.test(r)) return 'How To'; if (/guide/.test(r)) return 'Guide'; if (/trouble/.test(r)) return 'Troubleshooting'; if (/faq/.test(r)) return 'FAQ';
  return old || root || 'Overview';
}

let _state = { running: false, at: null, ok: null, error: null, total: 0, fetched: 0, removed: 0, changed: [] };
async function sync(fileKb, { force = false } = {}) {
  if (!_db) throw new Error('KB not initialised');
  if (_state.running) return _state;
  _state = Object.assign({}, _state, { running: true });
  try {
    const P = await portalId();
    const list = [];
    for (let from = 1; from < 5000; from += 100) {
      const j = await getJSON(`${BASE}/portal/api/kbArticles?portalId=${P}&limit=100&from=${from}&locale=en`);
      const d = j.data || []; list.push(...d);
      if (d.length < 100) break;
      await sleep(200);
    }
    if (list.length < 20) throw new Error('Help Center returned only ' + list.length + ' articles; kept the previous copy');
    const roots = {};
    try { const r = await getJSON(`${BASE}/portal/api/kbRootCategories?portalId=${P}&locale=en`); for (const c of r.data || []) roots[String(c.id)] = c.name; } catch (e) { /* kind falls back */ }
    // What the export knew: slug -> its id, module and kind; category -> its usual module.
    const bySlug = new Map(), catVotes = {};
    for (const a of (fileKb && fileKb.articles) || []) { const s = slugOf(a.url); if (s) bySlug.set(s, a); }
    for (const x of list) { const old = bySlug.get(x.permalink); if (old && old.module) { const c = (catVotes[x.categoryId] = catVotes[x.categoryId] || {}); c[old.module] = (c[old.module] || 0) + 1; } }
    const modules = Array.from(new Set(((fileKb && fileKb.articles) || []).map(a => a.module).filter(m => m && m !== 'About')));
    const guessModule = (catName) => {
      const w = new Set(String(catName || '').toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2));
      let best = null, score = 0;
      for (const m of modules) { const s = m.toLowerCase().split(/[^a-z0-9]+/).filter(x => w.has(x)).length; if (s > score) { score = s; best = m; } }
      return best || catName || 'Other';
    };
    const have = new Map((await all(`SELECT zid, modified_time, title FROM expert_kb`)).map(r => [String(r.zid), r]));
    const changed = []; let fetched = 0;
    for (const x of list) {
      const zid = String(x.id), prev = have.get(zid);
      if (!force && prev && prev.modified_time === x.modifiedTime) continue;
      let det;
      try { det = await getJSON(`${BASE}/portal/api/kbArticles/${zid}?portalId=${P}`); } catch (e) { console.warn('kb-live article', zid, e.message); continue; }
      const old = bySlug.get(x.permalink);
      const votes = catVotes[x.categoryId];
      const module = (old && old.module) || (votes && Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0]) || guessModule(x.category && x.category.name);
      let blocks = htmlToBlocks(det.answer);
      // Some articles only embed a page from adit.com: keep the exported text for those, or point to the page.
      if (!blocks.length && old && old.blocks && old.blocks.length) blocks = old.blocks;
      if (!blocks.length) { const src = String(det.answer || '').match(/<iframe[^>]*src="([^"]+)"/i); blocks = [{ t: 'p', x: (det.title || x.title) + (src ? '. The full guide is on ' + src[1] : '') }]; }
      await run(`INSERT INTO expert_kb (id, zid, permalink, title, module, kind, url, updated, modified_time, category, root_category, blocks_json, fetched_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(id) DO UPDATE SET zid=excluded.zid, permalink=excluded.permalink, title=excluded.title, module=excluded.module, kind=excluded.kind, url=excluded.url,
          updated=excluded.updated, modified_time=excluded.modified_time, category=excluded.category, root_category=excluded.root_category, blocks_json=excluded.blocks_json, fetched_at=excluded.fetched_at`,
        [(old && old.id) || x.permalink || zid, zid, x.permalink || '', det.title || x.title, module, kindOf(roots[String(x.rootCategoryId)], old && old.kind),
          x.webUrl || det.webUrl || '', fmtDate(x.modifiedTime), x.modifiedTime || '', (x.category && x.category.name) || '', roots[String(x.rootCategoryId)] || '', JSON.stringify(blocks)]);
      fetched++;
      if (prev) changed.push({ title: det.title || x.title, at: x.modifiedTime, kind: 'edited' }); else if (have.size) changed.push({ title: det.title || x.title, at: x.modifiedTime, kind: 'new' });
      await sleep(120);
    }
    // Articles taken off the Help Center are removed here too.
    const live = new Set(list.map(x => String(x.id)));
    const gone = Array.from(have.keys()).filter(z => !live.has(z));
    for (const z of gone) await run(`DELETE FROM expert_kb WHERE zid = ?`, [z]);
    _state = { running: false, at: new Date().toISOString(), ok: true, error: null, total: list.length, fetched, removed: gone.length, changed: changed.concat(_state.changed || []).slice(0, 30) };
  } catch (e) {
    _state = Object.assign({}, _state, { running: false, at: new Date().toISOString(), ok: false, error: String(e.message || e).slice(0, 200) });
  }
  return _state;
}
async function load() {
  const rows = await all(`SELECT id, title, module, kind, url, updated, blocks_json FROM expert_kb ORDER BY module, title`);
  return rows.map(r => { let blocks = []; try { blocks = JSON.parse(r.blocks_json); } catch (e) {} return { id: r.id, title: r.title, module: r.module, kind: r.kind, url: r.url, updated: r.updated, blocks }; });
}
function state() { return Object.assign({}, _state); }
module.exports = { initSchema, sync, load, state, htmlToBlocks, _slugOf: slugOf };
