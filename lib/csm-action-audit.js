'use strict';
/**
 * Batch 233: was a CSM transfer real CSM work?
 * The owner history alone cannot tell. A ticket can reach a CSM during a warm call transfer and come straight back, or
 * the CSM can leave a note such as "T1 can do the callback" without doing anything. This reads each ticket's timeline
 * from Desk (owner changes, private notes and comments, replies) and asks the AI two questions:
 *   transfer:   correct | not needed | unclear       (was the CSM the right owner, under the T1 process rules)
 *   csm_action: real action | note only | no action | pending
 *     real action = the CSM called or spoke with the client, investigated or fixed something, gave specific guidance to
 *     T1 or the client, or routed it to the right owner with a reason (for example the escalation owner).
 * Results are cached per ticket and CSM, and redone only when the ticket's timeline changes.
 */
const crypto = require('crypto');
let D = {}, _db = null;
function setDeps(d) { D = Object.assign({}, D, d || {}); }
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
async function initSchema() {
  // Batch 235: a history row only when the result changes (transfer or CSM action), kept for 400 days.
  await run(`CREATE TABLE IF NOT EXISTS csm_action_audit_hist (ticket_id TEXT NOT NULL, csm TEXT NOT NULL, transfer TEXT, csm_action TEXT, at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_caah_ticket ON csm_action_audit_hist(ticket_id)`);
  await run(`CREATE TABLE IF NOT EXISTS csm_action_audit (ticket_id TEXT NOT NULL, csm TEXT NOT NULL, input_hash TEXT, transfer TEXT, csm_action TEXT, note TEXT,
    audited_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (ticket_id, csm))`);
}
const nm = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
const q_ = (v) => `'${String(v == null ? '' : v).replace(/'/g, "''")}'`;
// Strip HTML and Desk mention markup, and keep contact details out of the prompt.
function clean(t, n = 600) {
  return nm(String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/zsu\[@user:\d+\]zsu/g, '@someone').replace(/zsu\[#(\d+):[^\]]*\]zsu/g, '#$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')).slice(0, n);
}
// Desk writes the owner change log in Central time; turn it into UTC so it sorts with notes, replies and calls.
function centralToUtc(date, hh, mm, ss) {
  const want = Date.parse(`${date}T${hh}:${mm}:${ss}Z`);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t))) p[x.type] = x.value;
    t -= Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - want;
  }
  return new Date(t).toISOString();
}
function parseLog(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    const m = /Owner changed to (.+?) on (\d{4}-\d\d-\d\d) (\d\d):(\d\d):(\d\d)\s*\|\s*Role\s*:\s*(.*)$/i.exec(line.trim());
    if (m) out.push({ name: nm(m[1]), at: centralToUtc(m[2], m[3], m[4], m[5]), role: nm(m[6]) });
  }
  return out;
}
const SYS = `You audit one Zoho Desk ticket that a T1 support agent at Adit (dental practice software) sent to a named Tech CSM (account manager). Times are UTC. Read the timeline and decide:
transfer:
- "correct" when this CSM was the right owner: the client is escalated or has an open escalation, account, billing, contract, pricing or subscription questions, cancellation, churn risk or port-out, the client asked for this CSM, this CSM was already working the issue, or it needs account-level action T1 cannot take. T1 cannot make outbound calls, so a needed callback with account context is also a correct reason.
- "wrong CSM" when it needed a CSM but not this one: the account's CSM in Desk is someone else and nothing shows this CSM was the right person (for example the client did not ask for them and they were not already working it).
- "not needed" when T1 could have handled it (basic how-to, a Help Center topic, a simple setting or a routine request), or it was only a warm call transfer that came straight back with nothing for the CSM to do.
- "unclear" when the timeline does not show enough.
csm_action (what THIS CSM did; work by anyone else does not count, even another CSM, unless this CSM handed it to them with a reason):
- "real action": this CSM called or spoke with the client (a phone call by this CSM in the timeline counts), investigated or fixed something, answered the client, gave specific guidance or findings to T1, or routed it to the right owner with a reason (for example to the escalation owner or the account's own CSM).
- "note only": this CSM left a note without substance, for example "T1 can handle this", "T1 can do the callback", "please check", or moved it back, with no contact, investigation or specific guidance.
- "no action": nothing by this CSM; the ticket went back or moved on without them doing anything (for example they held it a few minutes and it went back to T1).
- "pending": still with this CSM and nothing done yet.
Judge only from the timeline. In the note, name who did the work. Reply with JSON {"transfer":"correct|wrong CSM|not needed|unclear","csm_action":"real action|note only|no action|pending","note":"one short sentence, at most 20 words, on what happened; no patient names or contact details"}.`;
const TRANSFER = ['correct', 'wrong CSM', 'not needed', 'unclear'], ACTION = ['real action', 'note only', 'no action', 'pending'];

async function fetchTimelines(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const list = ids.slice(i, i + 80).map(q_).join(',');
    const [t, calls, c, th] = await Promise.all([
      D.query(`SELECT id, ticket_number, subject, channel, status, owner_user_name, cf_csm_account_manager, cf_owner_change_log FROM desk_tickets WHERE id IN (${list})`, 200),
      // Calls with the client's account around the ticket (RingCentral and Avoma), with who made them. A CSM call is real action.
      D.query(`SELECT d.id AS ticket_id, c.start_at, c.duration_seconds, split_part(c.organizer_email, '@', 1) AS who FROM desk_tickets d JOIN call_facts c ON c.account_id = d.aria_account_id
        WHERE d.id IN (${list}) AND c.kind = 'call' AND COALESCE(c.duration_seconds, 0) >= 30 AND c.start_at BETWEEN d.created_time - interval '1 day' AND d.created_time + interval '21 days' ORDER BY d.id, c.start_at`, 4000).catch(() => ({ rows: [] })),
      D.query(`SELECT ticket_id, author_name, created_time, LEFT(content, 2500) AS content FROM desk_ticket_comments WHERE ticket_id IN (${list}) ORDER BY ticket_id, created_time`, 4000),
      D.query(`SELECT ticket_id, author_name, direction, channel, created_time, LEFT(COALESCE(NULLIF(summary, ''), content), 1500) AS content FROM desk_ticket_threads WHERE ticket_id IN (${list}) ORDER BY ticket_id, created_time`, 6000)]);
    for (const r of (t.rows || [])) out.set(String(r.id), { ticket: r, comments: [], threads: [], calls: [] });
    for (const r of (calls.rows || [])) { const o = out.get(String(r.ticket_id)); if (o && r.who && !o.calls.some((x) => x.who === r.who && Math.abs(Date.parse(x.start_at) - Date.parse(r.start_at)) < 120e3)) o.calls.push(r); }
    for (const r of (c.rows || [])) { const o = out.get(String(r.ticket_id)); if (o) o.comments.push(r); }
    for (const r of (th.rows || [])) { const o = out.get(String(r.ticket_id)); if (o) o.threads.push(r); }
  }
  return out;
}
function timeline(x, who, aliasName) {
  const t = x.ticket, ev = [];
  const log = parseLog(t.cf_owner_change_log);
  log.forEach((o, i) => { const next = log[i + 1], held = next ? Math.round((Date.parse(next.at) - Date.parse(o.at)) / 60000) : null;
    ev.push({ at: o.at, line: `Owner changed to ${o.name} ${who(o.name)}` + (held != null ? ` (held it ${held < 120 ? held + ' min' : Math.round(held / 60) + ' h'})` : ' (still the owner)') }); });
  for (const c of x.comments) { const txt = clean(c.content); if (txt) ev.push({ at: String(c.created_time), line: `Note by ${nm(c.author_name)} ${who(c.author_name)}: ${txt}` }); }
  for (const k of (x.calls || [])) { const name = (aliasName && aliasName.get(String(k.who).toLowerCase())) || String(k.who).split('.').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
    ev.push({ at: String(k.start_at), line: `Phone call with the client by ${name} ${who(name)}, ${Math.max(1, Math.round(Number(k.duration_seconds) / 60))} min` }); }
  for (const h of x.threads) ev.push({ at: String(h.created_time), line: `${h.direction === 'in' ? 'Client message' : 'Reply sent by ' + nm(h.author_name) + ' ' + who(h.author_name)} (${nm(h.channel)}): ${clean(h.content, 300)}` });
  ev.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const acsm = nm(String(t.cf_csm_account_manager || '').split(' - ')[0]);
  const head = `Ticket #${t.ticket_number}: ${clean(t.subject, 160)}\nChannel: ${nm(t.channel)}. Status now: ${nm(t.status)}. Owner now: ${nm(t.owner_user_name)} ${who(t.owner_user_name)}. The account's CSM in Desk: ${acsm || 'not set'}`;
  return (head + '\nTimeline (oldest first):\n' + ev.map((e) => `- ${String(e.at).slice(0, 16)} ${e.line}`).join('\n')).slice(0, 9000);
}
const hashOf = (x) => crypto.createHash('sha1').update(['v2', x.ticket.status, x.ticket.cf_csm_account_manager, x.ticket.owner_user_name, x.ticket.cf_owner_change_log, x.comments.length, x.threads.length,
  x.comments.slice(-1)[0] ? x.comments.slice(-1)[0].created_time : '', x.threads.slice(-1)[0] ? x.threads.slice(-1)[0].created_time : '', (x.calls || []).length].join('|')).digest('hex').slice(0, 16);

/**
 * items: [{ ticket_id, csm }]; opts: { csmNames: Set(lower), t1Names: Set(lower), concurrency }
 * -> Map('ticket_id|csm lower' -> { transfer, csm_action, note })
 */
async function audit(items, opts = {}) {
  const out = new Map();
  const uniq = [...new Map(items.filter((x) => /^\d{5,25}$/.test(String(x.ticket_id))).map((x) => [String(x.ticket_id) + '|' + nm(x.csm).toLowerCase(), x])).values()];
  if (!uniq.length) return out;
  const cached = new Map((await all(`SELECT * FROM csm_action_audit WHERE ticket_id IN (${[...new Set(uniq.map((x) => String(x.ticket_id)))].map(q_).join(',')})`)).map((r) => [r.ticket_id + '|' + r.csm, r]));
  let tl;
  try { tl = await fetchTimelines([...new Set(uniq.map((x) => String(x.ticket_id)))]); }
  catch (e) { for (const [k, r] of cached) out.set(k, { transfer: r.transfer, csm_action: r.csm_action, note: r.note }); return out; }
  const csmSet = opts.csmNames || new Set(), t1 = opts.t1Names || new Set();
  const who = (n) => { const k = nm(n).toLowerCase(); return csmSet.has(k) ? '[CSM]' : t1.has(k) ? '[T1]' : '[other team]'; };
  const todo = [];
  for (const x of uniq) {
    const k = String(x.ticket_id) + '|' + nm(x.csm).toLowerCase(), data = tl.get(String(x.ticket_id)), c = cached.get(k);
    if (!data) { if (c) out.set(k, { transfer: c.transfer, csm_action: c.csm_action, note: c.note }); continue; }
    const h = hashOf(data);
    if (c && c.input_hash === h) { out.set(k, { transfer: c.transfer, csm_action: c.csm_action, note: c.note }); continue; }
    todo.push({ k, x, data, h });
  }
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const job = todo[i++];
      try {
        const o = { system: require('./aria-lens').withLens(SYS), user: `T1 sent this ticket to the CSM ${nm(job.x.csm)}.\n\n${timeline(job.data, who, opts.aliasName)}`, maxTokens: 300, timeoutMs: 60000, temperature: 0 };
        const r = D.ai.isAnthropicConfigured() ? await D.ai.claudeJSON(o) : await D.ai.bestJSON(o);
        const j = (r && r.json) || {};
        const v = { transfer: TRANSFER.includes(j.transfer) ? j.transfer : 'unclear', csm_action: ACTION.includes(j.csm_action) ? j.csm_action : 'no action', note: clean(j.note, 200).replace(/[\u2014\u2013]/g, ',') };
        out.set(job.k, v);
        const prev = cached.get(job.k);
        if (!prev || prev.transfer !== v.transfer || prev.csm_action !== v.csm_action) {
          if (prev && !(await all(`SELECT 1 FROM csm_action_audit_hist WHERE ticket_id = ? AND csm = ? LIMIT 1`, [String(job.x.ticket_id), job.k.split('|')[1]])).length)
            await run(`INSERT INTO csm_action_audit_hist (ticket_id, csm, transfer, csm_action, at) VALUES (?,?,?,?,?)`, [String(job.x.ticket_id), job.k.split('|')[1], prev.transfer, prev.csm_action, prev.audited_at || null]);
          await run(`INSERT INTO csm_action_audit_hist (ticket_id, csm, transfer, csm_action) VALUES (?,?,?,?)`, [String(job.x.ticket_id), job.k.split('|')[1], v.transfer, v.csm_action]);
        }
        await run(`INSERT OR REPLACE INTO csm_action_audit (ticket_id, csm, input_hash, transfer, csm_action, note, audited_at) VALUES (?,?,?,?,?,?, datetime('now'))`, [String(job.x.ticket_id), job.k.split('|')[1], job.h, v.transfer, v.csm_action, v.note]);
      } catch (e) { const c = cached.get(job.k); if (c) out.set(job.k, { transfer: c.transfer, csm_action: c.csm_action, note: c.note }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency || 6, todo.length) }, worker));
  return out;
}
async function prune() { await run(`DELETE FROM csm_action_audit_hist WHERE at < datetime('now', '-400 days')`); }
module.exports = { prune, setDeps, setDB, initSchema, audit, _clean: clean, _timeline: timeline, _parseLog: parseLog };
