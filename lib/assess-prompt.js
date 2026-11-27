/**
 * Batch 432: build an AI Studio source from a prompt instead of a document.
 * The reviewer says what to test ("the new reminder changes and last month's routing mistakes") and picks where the
 * facts come from: the latest Adit Updates, where agents went wrong (transfers sent back, ticket audits that needed a
 * fix, human call reviews), and the team rules Expert follows. This gathers those records into one source text with a
 * section per item, so the normal Studio steps (plan, draft, chat, save) work on it unchanged. Questions are still
 * written only from this text. Agent names are never included; the writer is told to keep scenarios anonymous.
 */
let _db = null, _deps = {};
function setDB(db) { _db = db; }
function setDeps(d) { _deps = Object.assign(_deps, d || {}); }
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const clean = (s, n) => String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim().slice(0, n);
const httpError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };

const STOP = new Set('the a an and or of to in on for with about from into on at by is are was were be this that these those what how why when who test agents agent assessment assessments questions question make create build write based last month week weeks days recent latest new their them they our we us it its all any some most more mistakes mistake failed failing fail wrong went where scenario scenarios update updates'.split(' '));
function terms(prompt) { return Array.from(new Set(String(prompt || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)))); }
function score(text, ts) { if (!ts.length) return 0; const t = String(text || '').toLowerCase(); return ts.reduce((n, w) => n + (t.includes(w.replace(/(ing|ed|es|s)$/, '')) ? 1 : 0), 0); }
/** The best matches for the prompt when any match, otherwise the most recent ones. */
function pick(items, ts, max) {
  const scored = items.map((x) => ({ x, s: score(x.match, ts) }));
  const hits = scored.filter((y) => y.s > 0).sort((a, b) => b.s - a.s || String(b.x.at).localeCompare(String(a.x.at)));
  const list = hits.length ? hits.map((y) => y.x) : items;
  return { list: list.slice(0, max), matched: hits.length > 0 };
}
const SOURCES = ['updates', 'misses', 'rules'];

async function updates(days, ts) {
  if (!_deps.productUpdates) return { items: [], matched: false };
  const since = Date.now() - days * 864e5;
  const r = await _deps.productUpdates.archive().catch(() => ({ items: [] }));
  const items = (r.items || []).filter((u) => Date.parse(u.postedAt || 0) >= since).map((u) => ({
    at: String(u.postedAt || '').slice(0, 10), match: [u.title, u.summary, u.impact, u.details, (u.modules || []).join(' ')].join(' '),
    text: `**Update ${String(u.postedAt || '').slice(0, 10)}: ${clean(u.title, 160)}**\n${clean(u.summary, 1200)}${u.impact ? '\nWhat agents should do: ' + clean(u.impact, 800) : ''}${u.details ? '\nDetails: ' + clean(u.details, 2500) : ''}`,
  }));
  return pick(items, ts, 30);
}
async function misses(days, ts) {
  const since = `-${days} days`, items = [];
  const tr = await all(`SELECT subject, to_team, comment, reviewed_at FROM tr_reviews WHERE verdict = 'invalid' AND voided = 0 AND comment IS NOT NULL AND reviewed_at >= datetime('now', ?) ORDER BY reviewed_at DESC LIMIT 400`, [since]).catch(() => []);
  for (const r of tr) items.push({ at: r.reviewed_at, match: [r.subject, r.to_team, r.comment].join(' '),
    text: `**Transfer sent back: ${clean(r.subject, 140)}**\nThe agent tried to hand this ticket over${r.to_team ? ' (it was going to ' + clean(r.to_team, 80) + ')' : ''}, and the reviewer sent it back.\nWhat was missed: ${clean(r.comment, 700)}` });
  const au = await all(`SELECT subject, summary, findings, completed_at FROM audit_tickets WHERE verdict = 'needs_fix' AND completed_at >= datetime('now', ?) ORDER BY completed_at DESC LIMIT 300`, [since]).catch(() => []);
  for (const r of au) {
    const f = parse(r.findings, []).map((x) => clean(x.label, 140) + (x.note ? ': ' + clean(x.note, 300) : '')).filter(Boolean);
    if (!f.length && !r.summary) continue;
    items.push({ at: r.completed_at, match: [r.subject, r.summary, f.join(' ')].join(' '),
      text: `**Ticket audit needed a fix: ${clean(r.subject, 140)}**\n${f.length ? 'Mistakes found:\n' + f.map((x) => '- ' + x).join('\n') : ''}${r.summary ? '\nAuditor note: ' + clean(r.summary, 500) : ''}` });
  }
  const cq = await all(`SELECT name, areas, summary, completed FROM cq_human WHERE areas IS NOT NULL AND length(areas) > 25 AND completed >= datetime('now', ?) ORDER BY completed DESC LIMIT 300`, [since]).catch(() => []);
  for (const r of cq) items.push({ at: r.completed, match: [r.areas, r.summary].join(' '),
    text: `**Call review: what to improve**\n${clean(r.areas, 700)}${r.summary ? '\nReviewer summary: ' + clean(r.summary, 400) : ''}` });
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return pick(items, ts, 60);
}
async function rules(ts) {
  const rows = await all(`SELECT title, body, module, updated_at FROM expert_notes WHERE status = 'active' ORDER BY updated_at DESC LIMIT 800`).catch(() => []);
  const items = rows.map((r) => ({ at: r.updated_at, match: [r.title, r.body, r.module].join(' '), text: `**Team rule: ${clean(r.title, 140)}${r.module ? ' (' + clean(r.module, 40) + ')' : ''}**\n${clean(r.body, 1500)}` }));
  const p = pick(items, ts, 25);
  return p.matched ? p : { list: [], matched: false }; // rules only when they bear on the prompt
}

/** Items as Studio sections of about 12,000 characters each, so long lists stay whole (Studio keeps up to 60 sections). */
function chunks(title, list) {
  const out = []; let buf = [], len = 0;
  const flush = () => { if (!buf.length) return; out.push(`## ${title} (part ${out.length + 1})\n\n` + buf.join('\n\n')); buf = []; len = 0; };
  for (const x of list) { if (len + x.text.length > 12000) flush(); buf.push(x.text); len += x.text.length; }
  flush();
  return out.length === 1 ? [out[0].replace(/ \(part 1\)\n/, '\n')] : out;
}
/** Builds the Studio source for a prompt. Returns { text, sourceName, focus, counts }. */
async function build({ prompt, sources, days }) {
  const ask = clean(prompt, 600);
  if (ask.length < 10) throw httpError(400, 'Describe what the assessment should test, in a sentence or two.');
  const use = (Array.isArray(sources) ? sources : SOURCES).filter((s) => SOURCES.includes(s));
  if (!use.length) throw httpError(400, 'Pick at least one place to take the facts from.');
  const d = [7, 14, 30, 60, 90].includes(Number(days)) ? Number(days) : 30;
  const ts = terms(ask);
  const parts = [], counts = {};
  if (use.includes('updates')) { const r = await updates(d, ts); counts.updates = r.list.length; parts.push(...chunks('Latest Adit Updates', r.list)); }
  if (use.includes('misses')) { const r = await misses(d, ts); counts.misses = r.list.length; parts.push(...chunks('Where agents went wrong', r.list)); }
  if (use.includes('rules')) { const r = await rules(ts); counts.rules = r.list.length; parts.push(...chunks('Team rules', r.list)); }
  const body = parts.join('\n\n');
  if (body.length < 200) throw httpError(400, `Nothing was found for this in the last ${d} days. Widen the dates or pick more sources.`);
  const text = `# What to assess\n${ask}\n\n${body}`.slice(0, 200000);
  const focus = (ask + ' Turn the records into realistic scenarios in general terms. Never name agents, clients or practices, and never quote a ticket number.').slice(0, 600);
  const name = 'Prompt: ' + ask.slice(0, 100);
  return { text, sourceName: name, focus, counts, days: d };
}

module.exports = { setDB, setDeps, build, _terms: terms, _pick: pick };
