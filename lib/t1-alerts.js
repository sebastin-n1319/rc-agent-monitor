/**
 * Session 51: T1 CS alerts to a Google Chat space.
 *
 *  - Queue wait: a caller has waited in the Customer Service queue longer
 *    than N seconds (default 60). Tags the configured lead (Ronnie).
 *  - No coverage: nobody is Available for N minutes while agents are
 *    logged in. Repeats every M minutes, posts a recovery note.
 *  - Unassigned tickets: open tickets with no owner, bucketed
 *    under 30 min / 30 to 60 min / over 1 hour.
 *  - Assigned, no action: open ticket owned by a T1 agent with no reply
 *    and no comment from that agent since it was assigned.
 *
 * Everything is also kept in memory for the Alerts pages, so admins and
 * agents see the same lists the Chat space gets.
 */

// Chat Wing agents take chats, not queue calls, so they never count toward
// phone coverage (same list the live floor uses).
const CHAT_WING = new Set(['anold.fernandes@adit.com', 'evan.cruz@adit.com', 'leo.clayton@adit.com', 'tabbie.shine@adit.com']);

const T1_TEAM_ID = '197800000052125116'; // Zoho Desk team "T1 - Customer Support"

const DEFAULTS = {
  enabled: true,          // master switch from the Alerts page
  webhookUrl: '',
  mention: '',            // users/123456789, an email, or "all"
  mentionLabel: 'Ronnie', // shown when no mention id is set
  queue: { enabled: true, waitSec: 60, repeatMin: 5 },
  coverage: { enabled: true, minutes: 2, repeatMin: 15, notifyRecovery: true },
  tickets: { enabled: true, t1Only: true, departmentIds: [], teamIds: [], lookbackDays: 3, unassignedMin: 30, overMin: 60, idleMin: 60, scanMin: 5, alertUnassigned: true, alertIdle: true },
};

const fmtDur = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60 ? (s % 60) + 's' : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};
const sqlTs = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const clean = (s, n = 80) => String(s || '').replace(/[<>|*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

function mergeConfig(raw) {
  let c = {};
  try { c = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) { c = {}; }
  return {
    ...DEFAULTS, ...c,
    queue: { ...DEFAULTS.queue, ...(c.queue || {}) },
    coverage: { ...DEFAULTS.coverage, ...(c.coverage || {}) },
    tickets: { ...DEFAULTS.tickets, ...(c.tickets || {}) },
  };
}

function mentionText(cfg) {
  const m = String(cfg.mention || '').trim();
  if (!m) return cfg.mentionLabel ? `@${clean(cfg.mentionLabel, 40)}` : '';
  if (m === 'all') return '<users/all>';
  if (/^users\/[\w.@+-]+$/.test(m)) return `<${m}>`;
  if (/^\d+$/.test(m)) return `<users/${m}>`;
  if (/^[^@\s]+@[^@\s]+$/.test(m)) return `<users/${m}>`;
  return `@${clean(m, 40)}`;
}

function createT1Alerts(deps) {
  const { isPaused = async () => false, getConfigRaw, fetchLive, fetchQueueWaiting, deskGet, getMonitoredAgents, fetchDepartments, db, fetchFn } = deps;
  const state = {
    queue: { at: null, waiting: [], available: 0, loggedIn: 0, onCall: 0, agents: [], error: null, zeroSince: null, coverageAlerted: false },
    tickets: { at: null, unassigned: [], idle: [], error: null, scanning: false, department: null },
  };
  const memSent = new Map(); // dedupeKey -> ms
  let cfgCache = { at: 0, cfg: mergeConfig({}) };

  // Google Chat only pings a person for <users/ID>, where ID is their Google
  // account id. The app stores that id (google_sub) when someone signs in, so
  // an email (typed, or derived from the name, e.g. Ronnie -> ronnie@adit.com)
  // resolves to a real mention once that person has signed in once.
  const idCache = new Map();
  async function resolveMention(cfg) {
    const m = String(cfg.mention || '').trim();
    if (m === 'all') return { text: '<users/all>', resolved: true, via: 'all' };
    if (/^users\/\d+$/.test(m)) return { text: `<${m}>`, resolved: true, via: 'id' };
    if (/^\d{6,}$/.test(m)) return { text: `<users/${m}>`, resolved: true, via: 'id' };
    const label = clean(cfg.mentionLabel || '', 40);
    const email = /^[^@\s]+@[^@\s]+$/.test(m) ? m.toLowerCase() : (label && !m ? `${label.split(/\s+/)[0].toLowerCase()}@adit.com` : '');
    if (email && deps.resolveChatId) {
      let id = idCache.get(email);
      if (id === undefined || (id === null && Date.now() - (idCache.get(email + ':at') || 0) > 600000)) {
        id = await deps.resolveChatId(email).catch(() => null) || null;
        idCache.set(email, id); idCache.set(email + ':at', Date.now());
      }
      if (id) return { text: `<users/${id}>`, resolved: true, via: 'email', email };
      return { text: `@${label || email.split('@')[0]}`, resolved: false, email, reason: `${email} has not signed in to this tool yet, so their Google Chat ID is unknown.` };
    }
    return { text: label ? `@${label}` : (m ? `@${clean(m, 40)}` : ''), resolved: false, reason: 'No email or Google Chat ID set.' };
  }

  async function config() {
    if (Date.now() - cfgCache.at < 15000) return cfgCache.cfg;
    cfgCache = { at: Date.now(), cfg: mergeConfig(await getConfigRaw().catch(() => null)) };
    return cfgCache.cfg;
  }
  function invalidate() { cfgCache.at = 0; }

  async function wasSent(key, withinMs) {
    const t = memSent.get(key);
    if (t && Date.now() - t < withinMs) return true;
    try { if (await db.t1AlertSentSince(key, sqlTs(Date.now() - withinMs))) { memSent.set(key, Date.now()); return true; } } catch (e) {}
    return false;
  }

  // Session 55: live alerts only post inside alert hours (7 AM to 7 PM
  // CST). Outside them the scans still run (the Alerts page stays live),
  // nothing is marked as sent, so anything still open at 7 AM is posted then.
  const liveHours = () => !deps.inAlertHours || deps.inAlertHours();

  async function post(kind, key, text, cfgOverride) {
    const cfg = cfgOverride || await config();
    let ok = false, error = null;
    // Review alerts and reviewer messages use their own webhook when one is set on the Alerts page.
    const own = (kind === 'review_idle' || kind === 'review_msg') && deps.reviewHook ? deps.reviewHook(kind) : '';
    const hook = own || (kind === 'review_msg' ? '' : cfg.webhookUrl);
    if (kind === 'review_msg' && deps.reviewMsgOn && !deps.reviewMsgOn()) error = 'Reviewer messages are turned off on the Alerts page';
    else if (cfg.enabled === false && kind !== 'test' && kind !== 'review_idle' && kind !== 'review_msg') error = 'Live alerts are turned off on the Alerts page';
    else if (kind !== 'test' && kind !== 'audit' && kind !== 'review_msg' && !liveHours()) return { ok: false, error: `Outside alert hours (${deps.alertHoursLabel || '7 AM to 7 PM CST'})`, offHours: true };
    else if (!hook) error = kind === 'review_msg' ? 'No reviewer messages webhook is set. Ask an admin to add it on the Alerts page (Reviewer messages) or in Transfer review, Settings.' : 'No alerts webhook set';
    else {
      try {
        const r = await fetchFn(hook, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ text: text.slice(0, 4000) }), signal: AbortSignal.timeout(15000) });
        ok = r.ok; if (!ok) error = `Google Chat returned HTTP ${r.status}`;
      } catch (e) { error = 'Could not reach Google Chat'; }
    }
    if (ok && key) memSent.set(key, Date.now());
    if (memSent.size > 3000) memSent.delete(memSent.keys().next().value);
    await db.insertT1AlertLog({ kind, dedupe_key: key, summary: text.split('\n')[0], ok, error }).catch(() => {});
    return { ok, error };
  }

  // ── Queue + coverage (every ~20s) ─────────────────────────────────
  async function tickQueue() {
    const cfg = await config();
    let snap = {};
    try { snap = (await fetchLive()) || {}; } catch (e) {}
    const monitored = await getMonitoredAgents().catch(() => []);
    const byRc = {}; for (const a of monitored) if (a.rc_id) byRc[String(a.rc_id)] = a;
    const agents = Object.entries(snap).filter(([id]) => byRc[id]).map(([id, e]) => ({
      name: byRc[id].name, email: (byRc[id].email || '').toLowerCase(),
      status: e.displayStatus, ready: String(e.queueReadyStatus || '').toLowerCase() === 'available',
      loggedIn: String(e.presenceStatus || '').toLowerCase() !== 'offline' && !/offline/i.test(e.displayStatus || ''),
      onCall: !!e.isOnCall,
    }));
    const loggedIn = agents.filter(a => a.loggedIn && !CHAT_WING.has(a.email));
    const available = loggedIn.filter(a => a.ready);
    const now = Date.now();
    Object.assign(state.queue, { at: new Date(now).toISOString(), loggedIn: loggedIn.length, available: available.length, onCall: loggedIn.filter(a => a.onCall).length, agents: loggedIn.map(a => ({ name: a.name, status: a.status, ready: a.ready })) });

    if (!loggedIn.length) { state.queue.waiting = []; state.queue.zeroSince = null; return; } // off shift
    const q = await fetchQueueWaiting().catch(e => ({ calls: [], error: e.message }));
    state.queue.waiting = (q.calls || []).map(c => ({ ...c, waitSec: c.startTime ? Math.max(0, Math.round((now - Date.parse(c.startTime)) / 1000)) : c.waitSec })).sort((a, b) => (b.waitSec || 0) - (a.waitSec || 0));
    state.queue.error = q.error || null;

    const live = liveHours();
    if (cfg.queue.enabled && live) {
      for (const c of state.queue.waiting) {
        if ((c.waitSec || 0) < cfg.queue.waitSec) continue;
        const key = `queue:${c.id}`;
        if (await wasSent(key, cfg.queue.repeatMin * 60000)) continue;
        const who = (await resolveMention(cfg)).text;
        const others = state.queue.waiting.length > 1 ? ` (${state.queue.waiting.length} callers waiting)` : '';
        await post('queue_wait', key, `📞 *Caller waiting ${fmtDur(c.waitSec)} in the queue*${others}\n${who ? who + ' please pick it up. ' : ''}Available now: ${available.length} of ${loggedIn.length} logged in.`, cfg);
      }
    }

    if (available.length) {
      if (state.queue.coverageAlerted && cfg.coverage.notifyRecovery && cfg.coverage.enabled && live) {
        await post('coverage_ok', null, `✅ Coverage restored: ${available.map(a => a.name).join(', ')} available.`, cfg);
      }
      state.queue.zeroSince = null; state.queue.coverageAlerted = false;
    } else {
      if (!state.queue.zeroSince) state.queue.zeroSince = now;
      const zeroFor = (now - state.queue.zeroSince) / 1000;
      if (cfg.coverage.enabled && live && zeroFor >= cfg.coverage.minutes * 60) {
        const key = `coverage:${sqlTs(state.queue.zeroSince)}`;
        if (!(await wasSent(key, cfg.coverage.repeatMin * 60000))) {
          const lines = loggedIn.map(a => `• ${clean(a.name, 40)}: ${clean(a.status, 30)}`).join('\n');
          const who = (await resolveMention(cfg)).text;
          await post('no_coverage', key, `🚨 *Nobody is available* for ${fmtDur(zeroFor)} (Call Wing: ${loggedIn.length} logged in, ${state.queue.onCall} on call)\n${lines}${who ? '\n' + who + ' please check.' : ''}`, cfg);
          state.queue.coverageAlerted = true;
        }
      }
    }
  }

  // ── Tickets (every few minutes) ───────────────────────────────────
  const detailCache = new Map(); // id -> { mod, assignedAt, actioned }
  async function resolveDepartments(cfg) {
    if (cfg.tickets.departmentIds && cfg.tickets.departmentIds.length) return cfg.tickets.departmentIds;
    const FALLBACK = '197800000000006907'; // Zoho Desk "Support" department
    try {
      const d = await fetchDepartments();
      const sup = d.filter(x => /^support$/i.test(x.name || ''));
      state.tickets.department = (sup[0] || {}).name || 'Support';
      return sup.length ? sup.map(x => x.id) : [FALLBACK];
    } catch (e) { state.tickets.department = 'Support'; return [FALLBACK]; }
  }

  // Session 54: /tickets/search, not GET /tickets. GET /tickets is not
  // sorted by creation time, so paging it and stopping at the first old
  // ticket missed newer ones (e.g. #410084). Search takes explicit time
  // ranges and returns team, assignee email and custom fields in one call.
  // Two windows: created in the lookback (catches old unassigned tickets)
  // plus modified in the last 12h (catches older tickets just reassigned).
  async function searchWindow(deptId, key, fromMs, toMs, maxPages) {
    const out = [];
    const range = `${new Date(fromMs).toISOString()},${new Date(toMs).toISOString()}`;
    for (let page = 0; page < maxPages; page++) {
      const qs = `departmentId=${encodeURIComponent(deptId)}&${key}=${encodeURIComponent(range)}&sortBy=-${key === 'createdTimeRange' ? 'createdTime' : 'modifiedTime'}&from=${page * 100}&limit=100`;
      const r = await deskGet(`/tickets/search?${qs}`);
      const rows = (r && r.data) || [];
      out.push(...rows);
      if (rows.length < 100) break;
    }
    return out;
  }
  async function listRecentTickets(deptId, lookbackDays) {
    const now = Date.now();
    const a = await searchWindow(deptId, 'createdTimeRange', now - lookbackDays * 864e5, now, 8);
    const b = await searchWindow(deptId, 'modifiedTimeRange', now - 12 * 3600e3, now, 6).catch(() => []);
    const byId = new Map();
    for (const t of [...a, ...b]) if (t && t.id) byId.set(t.id, t);
    return [...byId.values()];
  }

  function cfTime(t, label, api) {
    const v = (t.customFields && t.customFields[label]) || (t.cf && t.cf[api]);
    const ms = v ? Date.parse(v) : NaN;
    return Number.isNaN(ms) ? null : ms;
  }

  async function assessIdle(t, email) {
    const cached = detailCache.get(t.id);
    if (cached && cached.mod === t.modifiedTime) return cached;
    const d = t.customFields ? t : await deskGet(`/tickets/${t.id}`);
    const assignedAt = Math.max(cfTime(d, 'Ticket Assigned Time', 'cf_ticket_assigned_time') || 0, cfTime(d, 'Ticket Reassigned Time', 'cf_ticket_reassigned_time') || 0) || Date.parse(t.createdTime);
    const lastReply = cfTime(d, 'Last Reply sent on', 'cf_submission_created_date_time');
    const firstAfter = cfTime(d, 'First Response after Reassignment', 'cf_first_response_after_reassignment');
    let actioned = !!((lastReply && lastReply > assignedAt) || (firstAfter && firstAfter > assignedAt));
    if (!actioned && Number(d.commentCount || t.commentCount || 0) > 0) {
      const c = await deskGet(`/tickets/${t.id}/comments?sortBy=-commentedTime&limit=10`).catch(() => null);
      actioned = ((c && c.data) || []).some(x => (x.commenter && String(x.commenter.email || '').toLowerCase() === email) && Date.parse(x.commentedTime) > assignedAt);
    }
    const res = { mod: t.modifiedTime, assignedAt, actioned };
    detailCache.set(t.id, res);
    if (detailCache.size > 800) detailCache.delete(detailCache.keys().next().value);
    return res;
  }

  async function tickTickets(force = false) {
    const cfg = await config();
    if (!cfg.tickets.enabled && !force) return;
    if (state.tickets.scanning) return;
    state.tickets.scanning = true;
    try {
      const monitored = await getMonitoredAgents().catch(() => []);
      const roster = {}; for (const a of monitored) if (a.email) roster[a.email.toLowerCase()] = a.name;
      const byName = {}; for (const a of monitored) if (a.email && a.name) byName[a.name.trim().toLowerCase()] = a.email.toLowerCase();
      const assigneeEmail = (t) => {
        const a = t.assignee || {};
        const e = String(a.emailId || a.email || '').toLowerCase();
        if (e && roster[e]) return e;
        const n = [a.firstName, a.lastName].filter(Boolean).join(' ').trim().toLowerCase();
        return byName[n] || e;
      };
      const depts = await resolveDepartments(cfg);
      const now = Date.now();
      let all = [];
      for (const d of depts) all = all.concat(await listRecentTickets(d, Math.min(Math.max(Number(cfg.tickets.lookbackDays) || 3, 1), 14)));
      const open = all.filter(t => String(t.statusType || '').toLowerCase() === 'open' && !t.isSpam);
      const teams = (cfg.tickets.teamIds || []).map(String);
      const T30 = cfg.tickets.unassignedMin * 60, T60 = cfg.tickets.overMin * 60;

      // Only T1's queue: no team yet, or the T1 team. Tickets sitting with
      // T2 / T3 / other teams belong to those teams' own queues.
      const isT1Team = (t) => !t.teamId || String(t.teamId) === T1_TEAM_ID || /^\s*T1\s*-\s*Customer Support\s*$/i.test(String((t.team && t.team.name) || ''));
      const unassigned = open.filter(t => !t.assigneeId && (teams.length ? teams.includes(String(t.teamId || 'none')) : (cfg.tickets.t1Only === false || isT1Team(t))))
        .map(t => {
          // Waiting clock: from the latest moment the ticket needed an owner,
          // not from creation. A customer reply on an old ticket, or a fresh
          // (re)assignment to the queue, restarts it.
          const created = Date.parse(t.createdTime) || now;
          const cust = Date.parse(t.customerResponseTime) || 0;
          const since = Math.min(now, Math.max(created, cust, cfTime(t, 'Ticket Reassigned Time', 'cf_ticket_reassigned_time') || 0, cfTime(t, 'Ticket Assigned Time', 'cf_ticket_assigned_time') || 0));
          const ageSec = Math.max(0, Math.round((now - since) / 1000));
          return { since: new Date(since).toISOString(), reply: since - created > 60000, id: t.id, number: t.ticketNumber, subject: t.subject, channel: t.channel, teamId: t.teamId || null, team: (t.team && t.team.name) || (t.teamId ? '' : 'No team'), createdTime: t.createdTime, ageSec, url: t.webUrl, bucket: ageSec >= T60 ? 'over' : ageSec >= T30 ? 'mid' : 'new' };
        }).sort((a, b) => b.ageSec - a.ageSec);

      const idle = [];
      const candidates = open.filter(t => {
        const email = assigneeEmail(t);
        return email && roster[email] && (now - Date.parse(t.createdTime)) / 60000 >= 1;
      }).slice(0, 80);
      let budget = 60;
      for (const t of candidates) {
        const email = assigneeEmail(t);
        const cached = detailCache.get(t.id);
        if (!(cached && cached.mod === t.modifiedTime) && budget-- <= 0) continue;
        try {
          const r = await assessIdle(t, email);
          const idleSec = Math.round((now - r.assignedAt) / 1000);
          if (!r.actioned && idleSec >= cfg.tickets.idleMin * 60) {
            idle.push({ id: t.id, number: t.ticketNumber, subject: t.subject, channel: t.channel, agentEmail: email, agent: roster[email], assignedAt: new Date(r.assignedAt).toISOString(), idleSec, url: t.webUrl });
          }
        } catch (e) { /* skip this ticket this round */ }
      }
      idle.sort((a, b) => b.idleSec - a.idleSec);
      Object.assign(state.tickets, { at: new Date(now).toISOString(), unassigned, idle, error: null });

      // Chat alerts: only tickets that newly crossed a threshold.
      const link = (t) => `<${t.url}|#${t.number}> ${clean(t.subject, 70)}`;
      const live = liveHours();
      if (cfg.tickets.alertUnassigned && live) {
        const fresh = { over: [], mid: [] };
        for (const t of unassigned) {
          if (t.bucket === 'new') continue;
          const key = `ua-${t.bucket}:${t.id}:${Date.parse(t.since) || 0}`;
          if (await wasSent(key, 24 * 3600e3)) continue;
          fresh[t.bucket].push(t);
          memSent.set(key, now);
        }
        if (fresh.over.length || fresh.mid.length) {
          let msg = `🎫 *Unassigned tickets need an owner*${state.tickets.department ? ' (' + state.tickets.department + ')' : ''}`;
          if (fresh.over.length) msg += `\n\n⏰ Over ${cfg.tickets.overMin / 60 >= 1 ? cfg.tickets.overMin / 60 + ' hour' : cfg.tickets.overMin + ' min'} (${fresh.over.length})\n` + fresh.over.slice(0, 15).map(t => `• ${link(t)} · ${clean(t.channel, 15)} · ${fmtDur(t.ageSec)}${t.reply ? ' since customer reply' : ''}`).join('\n');
          if (fresh.mid.length) msg += `\n\n🕧 ${cfg.tickets.unassignedMin} to ${cfg.tickets.overMin} min (${fresh.mid.length})\n` + fresh.mid.slice(0, 15).map(t => `• ${link(t)} · ${clean(t.channel, 15)} · ${fmtDur(t.ageSec)}${t.reply ? ' since customer reply' : ''}`).join('\n');
          const r = await post('unassigned', `ua-batch:${now}`, msg, cfg);
          if (r.ok) for (const t of [...fresh.over, ...fresh.mid]) await db.insertT1AlertLog({ kind: 'unassigned_item', dedupe_key: `ua-${t.bucket}:${t.id}:${Date.parse(t.since) || 0}`, summary: `#${t.number}`, ok: true }).catch(() => {});
          else for (const t of [...fresh.over, ...fresh.mid]) memSent.delete(`ua-${t.bucket}:${t.id}:${Date.parse(t.since) || 0}`);
        }
      }
      if (cfg.tickets.alertIdle && live) {
        const fresh = [];
        for (const t of idle) {
          const key = `idle:${t.id}:${t.assignedAt}`;
          if (await wasSent(key, 7 * 24 * 3600e3)) continue;
          fresh.push({ ...t, key }); memSent.set(key, now);
        }
        if (fresh.length) {
          const tags = {};
          for (const t of fresh.slice(0, 20)) {
            const em = (t.agentEmail || '').toLowerCase();
            if (!em || em in tags) continue;
            let id = null;
            if (deps.resolveChatId) { try { id = await deps.resolveChatId(em); } catch (_) { id = null; } }
            tags[em] = id ? `<users/${String(id).replace(/^users\//, '')}>` : null;
          }
          const who = (t) => tags[(t.agentEmail || '').toLowerCase()] || `*${clean(t.agent, 30)}*`;
          const msg = `⏳ *Assigned, no action yet* (over ${cfg.tickets.idleMin} min since assignment)\n` + fresh.slice(0, 20).map(t => `• ${link(t)} · ${who(t)} · ${fmtDur(t.idleSec)}`).join('\n');
          const r = await post('idle', `idle-batch:${now}`, msg, cfg);
          if (r.ok) for (const t of fresh) await db.insertT1AlertLog({ kind: 'idle_item', dedupe_key: t.key, summary: `#${t.number}`, ok: true }).catch(() => {});
          else for (const t of fresh) memSent.delete(t.key);
        }
      }
    } catch (e) {
      state.tickets.error = 'Could not read tickets from Zoho Desk';
      console.error('❌ T1 ticket alerts:', e.message);
    } finally { state.tickets.scanning = false; }
  }

  let qTimer = null, tTimer = null, lastTicketTick = 0;
  function start() {
    if (qTimer) return;
    qTimer = setInterval(async () => { if (await isPaused().catch(() => false)) return; tickQueue().catch(e => console.error('❌ T1 queue alerts:', e.message)); }, 20000);
    tTimer = setInterval(async () => {
      if (await isPaused().catch(() => false)) return;
      const cfg = await config();
      if (Date.now() - lastTicketTick < Math.max(2, Number(cfg.tickets.scanMin) || 5) * 60000 - 5000) return;
      lastTicketTick = Date.now();
      tickTickets().catch(() => {});
    }, 30000);
    setTimeout(() => { tickQueue().catch(() => {}); }, 8000);
    setTimeout(() => { lastTicketTick = Date.now(); tickTickets().catch(() => {}); }, 20000);
  }

  function publicState(forEmail) {
    const t = state.tickets;
    const idle = forEmail ? t.idle.filter(x => x.agentEmail === forEmail) : t.idle;
    return {
      queue: { at: state.queue.at, waiting: state.queue.waiting.map(c => ({ waitSec: c.waitSec, status: c.status })), available: state.queue.available, loggedIn: state.queue.loggedIn, onCall: state.queue.onCall, zeroSince: state.queue.zeroSince ? new Date(state.queue.zeroSince).toISOString() : null },
      tickets: { at: t.at, department: t.department, error: t.error, scanning: t.scanning, unassigned: t.unassigned, idle, idleTeamCount: t.idle.length },
    };
  }

  // Ticket audits: a SPOC sent a ticket back for correction. Tags the agent who handled it,
  // lists what was missed with the auditor's feedback, and copies the alerts lead (Ronnie).
  async function notifyAuditReturn(p) {
    const cfg = await config();
    const em = String(p.agentEmail || '').toLowerCase();
    let id = null;
    if (deps.resolveChatId && em) { try { id = await deps.resolveChatId(em); } catch (_) { id = null; } }
    const who = clean(p.agentName || em.split('@')[0], 40);
    const tag = id ? `<users/${String(id).replace(/^users\//, '')}>` : `@${who}`;
    let cc = '';
    try { cc = (await resolveMention(cfg)).text; } catch (_) { cc = ''; }
    const lines = [`🔎 *Ticket audit: needs correction*`,
      `${tag}, ticket #${clean(p.ticketNumber, 20)}${p.subject ? ' "' + clean(p.subject, 90) + '"' : ''}${p.dest ? ' (moved to ' + clean(p.dest, 30) + ')' : ''} was audited${p.auditorName ? ' by ' + clean(p.auditorName, 40) : ''} and needs a correction.`, ''];
    const fs = Array.isArray(p.findings) ? p.findings.slice(0, 12) : [];
    if (fs.length) { lines.push('*What was missed*'); for (const f of fs) lines.push(`• ${clean(f.label, 120)}${f.note ? ': ' + clean(f.note, 300) : ''}`); lines.push(''); }
    if (p.summary) { lines.push('*Auditor feedback*'); lines.push(clean(p.summary, 800)); lines.push(''); }
    lines.push('Please fix it and keep the ticket with you until it is done.');
    if (p.url) lines.push(`Ticket: ${p.url}`);
    if (cc) lines.push(`cc ${cc}`);
    return post('audit', null, lines.join('\n'));
  }

  async function tagFor(email, fallbackName) {
    const em = String(email || '').toLowerCase();
    let id = null;
    if (deps.resolveChatId && em) { try { id = await deps.resolveChatId(em); } catch (_) { id = null; } }
    return id ? `<users/${String(id).replace(/^users\//, '')}>` : `@${clean(fallbackName || em.split('@')[0], 40)}`;
  }
  // Transfer review: tickets sitting in "Pending Review - T1" past the buffer.
  async function notifyPendingIdle(p) {
    const tags = [];
    for (const e of (p.mentions || []).slice(0, 6)) tags.push(await tagFor(e));
    const items = (p.items || []).slice(0, 15);
    const lines = [`⏰ *Pending review tickets are sitting idle*`,
      `${tags.join(' ')} ${items.length === 1 ? '1 ticket has' : items.length + ' tickets have'} waited more than ${p.bufferMin || 15} minutes for review. Please action them quickly for a better customer experience.`, ''];
    for (const it of items) lines.push(`• #${clean(it.number, 20)}${it.agent ? ' (' + clean(it.agent, 40) + ')' : ''}, waiting ${it.mins} min${it.url ? ': ' + it.url : ''}`);
    if ((p.items || []).length > items.length) lines.push(`and ${(p.items || []).length - items.length} more on the Ticket audits page.`);
    return post('review_idle', null, lines.join('\n'));
  }
  // Transfer review: a message a reviewer wrote (or edited) for the agent, sent on their click.
  async function notifyReviewMessage(p) {
    let text = String(p.text || '').trim().slice(0, 3500);
    if (!text) return { ok: false, error: 'Message is empty' };
    const name = clean(p.agentName, 60);
    if (name && p.agentEmail) {
      const tag = await tagFor(p.agentEmail, name);
      if (tag.startsWith('<users/')) {
        const at = '@' + name;
        const i = text.toLowerCase().indexOf(at.toLowerCase());
        if (i >= 0) text = text.slice(0, i) + tag + text.slice(i + at.length);
      }
    }
    return post('review_msg', null, text);
  }
  // Transfer review: an invalid transfer, counted as a strike.
  async function notifyStrike(p) {
    const cfg = await config();
    const tag = await tagFor(p.agentEmail, p.agentName);
    let cc = '';
    try { cc = (await resolveMention(cfg)).text; } catch (_) { cc = ''; }
    const extra = [];
    for (const e of (p.escalate || []).slice(0, 4)) extra.push(await tagFor(e));
    const lines = [`🚫 *Invalid transfer: strike ${p.count}${p.level ? ' (' + clean(p.level, 40) + ')' : ''}*`,
      `${tag}, ticket #${clean(p.ticketNumber, 20)}${p.subject ? ' "' + clean(p.subject, 90) + '"' : ''} was reviewed and the transfer is not valid. Please correct it before it moves on.`, ''];
    if (p.comment) { lines.push('*Reviewer comments*'); lines.push(clean(p.comment, 800)); lines.push(''); }
    lines.push(`Active strikes in the last 90 days: ${p.count}. 5th: verbal warning, 6th: written warning, 7th: PIP for 30 days, more: disciplinary action.`);
    if (p.url) lines.push(`Ticket: ${p.url}`);
    const ccs = [cc].concat(extra).filter(Boolean);
    if (ccs.length) lines.push(`cc ${[...new Set(ccs)].join(' ')}`);
    return post('audit', null, lines.join('\n'));
  }

  return { notifyAuditReturn, notifyPendingIdle, notifyReviewMessage, notifyStrike, start, tickQueue, tickTickets, publicState, post, config, invalidate, mergeConfig, mentionText, resolveMention, _state: state };
}

module.exports = { createT1Alerts, mergeConfig, mentionText, DEFAULTS };
