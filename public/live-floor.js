/**
 * Session 45: "Live floor" dashboard (Option A, picked by Sebastin).
 *
 * One card per monitored agent (card colour = current state, big timer =
 * how long they have been in it), a KPI strip, and a right rail with
 * "Needs attention" + "Queue today" for admins, or "Team right now" for
 * agents, who also get their own card on top.
 *
 * Pure renderer: index.html's loadAgentStatuses() already builds agentOps
 * every refresh cycle and calls window.renderLiveFloor(ctx). This file
 * reads the same globals the rest of the dashboard reads (breakTrackerData,
 * abandonedCalls, queueDashboardSummary, currentEmail) so its numbers never
 * disagree with the older sections kept below it.
 */
(function () {
  'use strict';

  const UNAVAIL_ALERT_SECONDS = 20 * 60; // Sebastin: unavailable over 20m
  const BREAK_ALERT_SECONDS = 15 * 60;   // breaks over 15m
  const ABANDON_WINDOW_MS = 60 * 60 * 1000;

  // Session 45: Sebastin's two support wings. Anyone not listed here is
  // shown in the Call Wing; add an email to CHAT_WING to move them.
  const CHAT_WING = new Set([
    'anold.fernandes@adit.com',
    'evan.cruz@adit.com',
    'leo.clayton@adit.com',
    'tabbie.shine@adit.com',
  ]);
  // Shared with breaks-v2.js.
  window.aditWingOf = function (email) { return CHAT_WING.has(String(email || '').toLowerCase()) ? 'chat' : 'call'; };
  function wingOf(op) {
    return CHAT_WING.has(String((op.agent && op.agent.email) || '').toLowerCase()) ? 'chat' : 'call';
  }

  const AWAY_LANES = new Set(['Break', 'BRB', 'Training / Coaching', 'QA Session AUX', 'Internal Calls']);

  let _chats = {};           // email -> chats today
  let _chatsFetchedAt = 0;
  let _chatsKey = '';
  let _mine = null;          // my-summary for today (agent view)
  let _mineFetchedAt = 0;
  let _mineKey = '';
  let _avail = null;         // /api/live-availability for today (admin view)
  let _availFetchedAt = 0;
  let _availKey = '';
  let _tick = null;
  let _last = null;

  function e(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // Globals shared with index.html (top-level let/const there, so they are
  // reachable by name but not as window properties). No eval.
  function g(name, fallback) {
    try {
      switch (name) {
        case 'breakTrackerData': return typeof breakTrackerData !== 'undefined' ? breakTrackerData : fallback;
        case 'abandonedCalls': return typeof abandonedCalls !== 'undefined' ? abandonedCalls : fallback;
        case 'queueDashboardSummary': return typeof queueDashboardSummary !== 'undefined' ? queueDashboardSummary : fallback;
        case 'currentEmail': return typeof currentEmail !== 'undefined' ? currentEmail : fallback;
        case 'currentUser': return typeof currentUser !== 'undefined' ? currentUser : fallback;
        case 'currentTZ': return typeof currentTZ !== 'undefined' ? currentTZ : fallback;
        default: return fallback;
      }
    } catch (err) { return fallback; }
  }
  function parseTs(ts) {
    if (!ts) return null;
    const s = String(ts);
    // Break tracker timestamps are naive UTC "YYYY-MM-DD HH:MM:SS".
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  }
  function clock(sec) {
    if (sec == null || !(sec >= 0)) return '-';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  function dur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }
  function shortTime(ms) {
    if (!ms) return '-';
    try {
      const tz = typeof activeTimeZone === 'function' ? activeTimeZone() : 'America/Chicago';
      return new Date(ms).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    } catch (err) { return '-'; }
  }
  function tzLabel() { return g('currentTZ', 'CST'); }

  // ── state per agent ─────────────────────────────────────────────────────
  function trackerFor(email) {
    const bt = g('breakTrackerData', null);
    const rows = (bt && bt.tracker) || [];
    const em = String(email || '').toLowerCase();
    return em ? rows.find(r => String(r.email || '').toLowerCase() === em) || null : null;
  }

  function laneCount(tr, lane) {
    if (!tr || !Array.isArray(tr.events)) return 0;
    let n = 0, prev = null;
    for (const ev of tr.events) {
      if (ev.currentStatus === lane && prev !== lane) n++;
      prev = ev.currentStatus;
    }
    return n;
  }
  function breaksToday(tr) { return laneCount(tr, 'Break'); }
  // Seconds in a lane today, counting the one still running (the tracker's
  // totals are a snapshot from its last fetch).
  function laneSeconds(tr, lane, key) {
    if (!tr) return 0;
    let secs = tr[key] || 0;
    if (tr.currentStatus === lane && tr.currentLaneSeconds != null) {
      const since = parseTs(tr.since);
      if (since) secs = Math.max(secs, (secs - (tr.currentLaneSeconds || 0)) + (Date.now() - since) / 1000);
    }
    return secs;
  }
  function shortDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${sec}s`;
  }
  function breakLine(tr) {
    if (!tr) return `<div class="lf-breaks">Breaks <b class="lf-mono">0</b></div>`;
    const nb = laneCount(tr, 'Break'), nbrb = laneCount(tr, 'BRB');
    const parts = [];
    if (nb) parts.push(`<span>Breaks <b class="lf-mono">${nb}</b> <span class="lf-dim">(${shortDur(laneSeconds(tr, 'Break', 'breakSeconds'))})</span></span>`);
    if (nbrb) parts.push(`<span>BRB <b class="lf-mono">${nbrb}</b> <span class="lf-dim">(${shortDur(laneSeconds(tr, 'BRB', 'brbSeconds'))})</span></span>`);
    if (!parts.length) parts.push('Breaks <b class="lf-mono">0</b>');
    return `<div class="lf-breaks">${parts.join('<span class="lf-sep"></span>')}</div>`;
  }

  function stateOf(op) {
    const tr = trackerFor(op.agent && op.agent.email);
    const lane = tr ? tr.currentStatus : null;
    const rc = String(op.status || '').toLowerCase();
    const live = op.live || {};
    if (lane && AWAY_LANES.has(lane)) {
      return { key: 'break', label: lane === 'Break' ? 'On break' : lane, sinceMs: parseTs(tr.since), tr };
    }
    if (live.isOnCall || rc === 'on call' || rc === 'ringing' || rc === 'talking') {
      const dir = typeof normalizeLiveDirection === 'function' ? normalizeLiveDirection(live.direction) : (live.direction || '');
      return { key: 'call', label: rc === 'ringing' ? 'Ringing' : (dir ? `On call · ${dir}` : 'On call'), sinceMs: parseTs(op.sinceTs) || parseTs(live.callStartTime), tr };
    }
    if (rc === 'available') return { key: 'avail', label: 'Available', sinceMs: parseTs(op.sinceTs), tr };
    if (rc === 'unavailable' || rc === 'busy' || rc === 'dnd' || rc === 'away') {
      // Logged out of the break tracker + unavailable on RC = shift over.
      if (lane === 'Logged Out') return { key: 'off', label: 'Logged out', sinceMs: null, tr };
      return { key: 'busy', label: 'Unavailable', sinceMs: parseTs(op.sinceTs), tr };
    }
    return { key: 'off', label: 'Offline', sinceMs: null, tr };
  }

  // ── data helpers ────────────────────────────────────────────────────────
  function dayKey() {
    const d = typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
    const tz = typeof activeTimeZone === 'function' ? activeTimeZone() : 'America/Chicago';
    return { d, tz, key: d + '|' + tz };
  }

  async function refreshChats() {
    const { d, tz, key } = dayKey();
    if (key === _chatsKey && Date.now() - _chatsFetchedAt < 120000) return;
    _chatsKey = key; _chatsFetchedAt = Date.now();
    try {
      const r = await fetch(`/api/live-floor/chats-today?date=${encodeURIComponent(d)}&tz=${encodeURIComponent(tz)}`, { credentials: 'include' });
      const j = await r.json();
      if (j && j.success) { _chats = j.data || {}; if (_last) paint(_last); }
    } catch (err) { /* chat line just stays hidden */ }
  }

  async function refreshMine() {
    const email = g('currentEmail', null);
    if (!email) return;
    const { d, tz, key } = dayKey();
    if (key === _mineKey && Date.now() - _mineFetchedAt < 300000) return;
    _mineKey = key; _mineFetchedAt = Date.now();
    try {
      const start = new Date(new Date(`${d}T00:00:00Z`).getTime());
      // Day start in the active timezone, same idea as the server's getDateWindow().
      const offMin = (() => {
        const dt = new Date(`${d}T12:00:00Z`);
        const local = new Date(dt.toLocaleString('en-US', { timeZone: tz }));
        const utc = new Date(dt.toLocaleString('en-US', { timeZone: 'UTC' }));
        return Math.round((local - utc) / 60000);
      })();
      const from = new Date(start.getTime() - offMin * 60000).toISOString();
      const r = await fetch(`/api/desk-lifecycle/my-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`, { credentials: 'include' });
      const j = await r.json();
      if (j && j.success) { _mine = j; if (_last) paint(_last); }
    } catch (err) { /* ticket tile shows '-' */ }
  }

  async function refreshAvail() {
    const { key } = dayKey();
    if (key === _availKey && Date.now() - _availFetchedAt < 90000) return;
    _availKey = key; _availFetchedAt = Date.now();
    try {
      const r = await fetch('/api/live-availability', { credentials: 'include' });
      const j = await r.json();
      if (j && j.success) { _avail = j; if (_last) paint(_last); }
    } catch (err) { /* the line just stays hidden */ }
  }
  function availFor(agent) {
    if (!_avail || !_avail.data) return null;
    const a = _avail.data[String((agent && (agent.extension || agent.ext)) || '')] || null;
    return a;
  }
  function availLine(agent) {
    if (!_avail) return '';
    const a = availFor(agent);
    if (!a || !a.started) return `<div class="lf-avt lf-dim" title="Counts from the first Take all calls of the CST day">Avail <b class="lf-mono">-</b><span class="lf-sep"></span>Unavail <b class="lf-mono">-</b></div>`;
    return `<div class="lf-avt" title="${_avail.source === 'audit' ? 'From the RingCentral Audit Trail, CST day, from first Take all calls' : 'From presence data (Audit Trail not available)'}"><span class="lf-av-g">Avail <b class="lf-mono">${shortDur(a.availSec)}</b></span><span class="lf-sep"></span><span class="lf-av-r">Unavail <b class="lf-mono">${shortDur(a.unavailSec)}</b></span></div>`;
  }

  function chatsFor(email) {
    const v = _chats[String(email || '').toLowerCase()];
    return typeof v === 'number' ? v : null;
  }

  // ── pieces ──────────────────────────────────────────────────────────────
  function pill(st) {
    return `<span class="lf-pill lf-${st.key}"><span class="lf-dot"></span>${e(st.label)}</span>`;
  }

  function kpiStrip(rows, ctx) {
    const team = Math.max(1, rows.length);
    const n = k => rows.filter(r => r.st.key === k).length;
    const q = g('queueDashboardSummary', {}) || {};
    const sumIn = rows.reduce((a, r) => a + (r.op.inboundCalls || 0), 0);
    const sumOut = rows.reduce((a, r) => a + (r.op.outboundCalls || 0), 0);
    const inbound = Math.max(q.inboundCount || 0, sumIn);
    const outbound = Math.max(q.outboundCount || 0, sumOut);
    const missed = rows.reduce((a, r) => a + (r.op.missedCalls || 0), 0);
    const calls = Math.max(1, inbound + outbound);
    const k = [
      ['Available', n('avail'), n('avail') / team, 'var(--lf-green)'],
      ['On call', n('call'), n('call') / team, 'var(--lf-teal)'],
      ['Unavailable', n('busy') + n('break'), (n('busy') + n('break')) / team, 'var(--lf-red)'],
      ['Inbound today', inbound, inbound / calls, 'var(--lf-teal)'],
      ['Outbound today', outbound, outbound / calls, 'var(--lf-purple)'],
      ['Missed today', missed, inbound ? missed / inbound : 0, 'var(--lf-orange)'],
    ];
    return `<div class="lf-kpis" role="group" aria-label="Floor summary">${k.map(([l, v, p, c]) => `
      <div class="lf-card lf-kpi"><div class="lf-kpi-label">${l}</div><div class="lf-kpi-val lf-mono">${v}</div>
      <div class="lf-bar" aria-hidden="true"><i style="width:${Math.round(Math.min(1, p) * 100)}%;background:${c}"></i></div></div>`).join('')}</div>`;
  }

  function agentCard(r, isMe, admin) {
    const op = r.op, st = r.st;
    const ch = chatsFor(op.agent.email);
    const since = st.sinceMs ? Math.max(0, (Date.now() - st.sinceMs) / 1000) : null;
    return `<article class="lf-card lf-agent lf-b-${st.key}${isMe ? ' lf-me' : ''}" aria-label="${e(op.agent.name)}, ${e(st.label)}">
      <div class="lf-agent-name">${e(op.agent.name)}${isMe ? ' <span class="lf-you">You</span>' : ''}</div>
      <div class="lf-agent-pill">${pill(st)}</div>
      <div class="lf-timer lf-mono" data-lf-since="${st.sinceMs || ''}" title="${st.sinceMs ? 'Since ' + e(shortTime(st.sinceMs)) : ''}">${since == null ? '-' : clock(since)}</div>
      <div class="lf-mini">
        ${r.wing === 'chat' ? `
        <span>Chats <b class="lf-mono">${ch == null ? 0 : ch}</b></span>
        <span>Calls <b class="lf-mono">${(op.inboundCalls || 0) + (op.outboundCalls || 0)}</b></span>` : `
        <span>In <b class="lf-mono">${op.inboundCalls || 0}</b></span>
        <span>Out <b class="lf-mono">${op.outboundCalls || 0}</b></span>
        <span>Missed <b class="lf-mono${op.missedCalls ? ' lf-neg' : ''}">${op.missedCalls || 0}</b></span>
        ${ch ? `<span>Chats <b class="lf-mono">${ch}</b></span>` : ''}`}
      </div>
      ${breakLine(st.tr)}
      ${admin ? availLine(op.agent) : ''}
    </article>`;
  }

  function attentionItems(rows) {
    const items = [];
    const now = Date.now();
    for (const r of rows) {
      const secs = r.st.sinceMs ? (now - r.st.sinceMs) / 1000 : 0;
      if (r.st.key === 'busy' && secs >= UNAVAIL_ALERT_SECONDS) {
        items.push({ sev: 3, color: 'var(--lf-red)', html: `<b>${e(r.op.agent.name)}</b> unavailable for ${e(dur(secs))}`, sub: 'Over the 20 min limit', secs });
      }
      if (r.st.key === 'break' && r.st.label === 'On break' && secs >= BREAK_ALERT_SECONDS) {
        const nb = breaksToday(r.st.tr);
        items.push({ sev: 2, color: 'var(--lf-yellow)', html: `<b>${e(r.op.agent.name)}</b> on break ${e(dur(secs))}`, sub: `Over 15 min${nb ? ` · break ${nb} today` : ''}`, secs });
      }
      const al = r.st.tr && r.st.tr.alerts;
      if (al && al.hasAlert && Array.isArray(al.alertReasons) && al.alertReasons.length) {
        items.push({ sev: 2, color: 'var(--lf-yellow)', html: `<b>${e(r.op.agent.name)}</b> ${e(al.alertReasons[0])}`, sub: 'Break policy', secs: 0 });
      }
    }
    const ab = (g('abandonedCalls', []) || []).filter(c => {
      const t = parseTs(c.startTime);
      return t && now - t <= ABANDON_WINDOW_MS;
    });
    if (ab.length) {
      const longest = ab.reduce((m, c) => Math.max(m, c.ringDuration || 0), 0);
      const last = ab.map(c => parseTs(c.startTime)).sort((a, b) => b - a)[0];
      items.push({ sev: 3, color: 'var(--lf-orange)', html: `<b>${ab.length} abandoned call${ab.length === 1 ? '' : 's'}</b> in the last hour`, sub: `Longest ring ${dur(longest)}, latest ${shortTime(last)} ${e(tzLabel())}`, secs: 0 });
    }
    return items.sort((a, b) => b.sev - a.sev || b.secs - a.secs);
  }

  function adminRail(rows) {
    const items = attentionItems(rows);
    const q = g('queueDashboardSummary', {}) || {};
    const ab = g('abandonedCalls', []) || [];
    const abandoned = Math.max(q.abandonedCount || 0, ab.length);
    const fmtS = s => (s ? dur(s) : '-');
    return `
      <section class="lf-card lf-pad" aria-labelledby="lf-att-t">
        <h3 class="lf-rail-t" id="lf-att-t">Needs attention${items.length ? ` <span class="lf-count">${items.length}</span>` : ''}</h3>
        ${items.length ? items.slice(0, 8).map(it => `
          <div class="lf-alert"><span class="lf-dot" style="background:${it.color}"></span><div>${it.html}<div class="lf-sub">${e(it.sub)}</div></div></div>`).join('')
          : '<div class="lf-sub">All clear. Nobody over the limits right now.</div>'}
      </section>
      <section class="lf-card lf-pad" aria-labelledby="lf-q-t">
        <h3 class="lf-rail-t" id="lf-q-t">Queue today</h3>
        <div class="lf-kv"><span>Abandoned</span><b class="lf-mono${abandoned ? ' lf-neg' : ''}">${abandoned}</b></div>
        <div class="lf-kv"><span>Longest ring</span><b class="lf-mono">${fmtS(q.longestRing)}</b></div>
        <div class="lf-kv"><span>Avg ring</span><b class="lf-mono">${fmtS(q.avgRingTime)}</b></div>
        <div class="lf-kv"><span>AHT inbound</span><b class="lf-mono">${fmtS(q.ahtInbound)}</b></div>
        <div class="lf-kv"><span>Voicemails</span><b class="lf-mono">${q.voicemailCount || 0}</b></div>
        <div class="lf-kv"><span>Transfers</span><b class="lf-mono">${q.transferCount || 0}</b></div>
      </section>`;
  }

  function agentRail(rows) {
    const n = k => rows.filter(r => r.st.key === k).length;
    const q = g('queueDashboardSummary', {}) || {};
    return `
      <section class="lf-card lf-pad" aria-labelledby="lf-team-t">
        <h3 class="lf-rail-t" id="lf-team-t">Team right now</h3>
        <div class="lf-kv"><span>Available</span><b class="lf-mono">${n('avail')}</b></div>
        <div class="lf-kv"><span>On call</span><b class="lf-mono">${n('call')}</b></div>
        <div class="lf-kv"><span>Unavailable / away</span><b class="lf-mono">${n('busy') + n('break')}</b></div>
        <div class="lf-kv"><span>Abandoned today</span><b class="lf-mono">${Math.max(q.abandonedCount || 0, (g('abandonedCalls', []) || []).length)}</b></div>
        <div class="lf-sub" style="margin-top:10px">Your card is outlined in orange.</div>
      </section>`;
  }

  function meCard(r) {
    const email = String(g('currentEmail', '') || '');
    const name = r ? r.op.agent.name : (g('currentUser', '') || 'there');
    const first = String(name).split(' ')[0];
    const initials = String(name).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const s = _mine && _mine.summary;
    const tickets = s && s.tickets_handled_ready ? (s.tickets_handled || 0) : '-';
    const chats = _mine && _mine.chatStats ? (_mine.chatStats.chatCount || 0) : (chatsFor(email) ?? '-');
    if (!r) {
      return `<div class="lf-card lf-mecard"><div class="lf-me-id"><div class="lf-av">${e(initials || '?')}</div><div><div class="lf-me-hi">Hi ${e(first)}</div><div class="lf-sub">Your RingCentral line is not linked to the monitor yet, ask your admin.</div></div></div></div>`;
    }
    const op = r.op, st = r.st;
    const since = st.sinceMs ? Math.max(0, (Date.now() - st.sinceMs) / 1000) : null;
    const stats = [
      [op.inboundCalls || 0, 'Inbound today'],
      [op.outboundCalls || 0, 'Outbound today'],
      [op.missedCalls || 0, 'Missed'],
      [dur(op.availableSeconds || 0), 'Available time'],
      [tickets, 'Tickets handled'],
      [chats, 'Chats today'],
      [(() => { const tr = st.tr; const nb = laneCount(tr, 'Break'); return tr ? `${nb} (${shortDur(laneSeconds(tr, 'Break', 'breakSeconds'))})` : '0'; })(), 'Breaks today'],
    ];
    return `<div class="lf-card lf-mecard">
      <div class="lf-me-id"><div class="lf-av">${e(initials)}</div><div>
        <div class="lf-me-hi">Hi ${e(first)}</div>${pill(st)}
        <div class="lf-sub lf-mono" style="margin-top:4px">in this state for <span data-lf-since="${st.sinceMs || ''}">${since == null ? '-' : clock(since)}</span></div></div></div>
      <div class="lf-me-stats">${stats.map(([v, l]) => `<div><b class="lf-mono">${e(v)}</b><span>${e(l)}</span></div>`).join('')}</div>
    </div>`;
  }

  // ── paint ───────────────────────────────────────────────────────────────
  const ORDER = { call: 0, avail: 1, busy: 2, break: 3, off: 4 };

  function paint(ctx) {
    const mode = ctx.mode;
    const root = document.getElementById(mode === 'admin' ? 'lf-admin-root' : 'lf-agent-root');
    if (!root) return;
    const rows = (ctx.agentOps || []).map(op => ({ op, st: stateOf(op), wing: wingOf(op) }))
      .sort((a, b) => (ORDER[a.st.key] - ORDER[b.st.key]) || String(a.op.agent.name).localeCompare(String(b.op.agent.name)));
    const myEmail = String(g('currentEmail', '') || '').toLowerCase();
    const me = mode === 'agent' ? rows.find(r => String(r.op.agent.email || '').toLowerCase() === myEmail) : null;

    const head = `
      <div class="lf-head">
        <div><h2 class="lf-h1">${mode === 'admin' ? 'Live floor' : 'My live dashboard'}</h2>
        <div class="lf-sub">${mode === 'admin' ? 'Every agent at a glance. Card colour is their current state; the timer is how long they have been in it.' : 'Your status first, then the team.'}</div></div>
        <div class="lf-head-r">${mode === 'admin' ? '<button type="button" class="lf-share" onclick="window.openChatComposer&&window.openChatComposer({kind:\'perf\',period:\'today\'})">Share to Chat</button>' : ''}<span class="lf-live"><span class="lf-dot"></span>Live · ${e(tzLabel())}</span></div>
      </div>`;
    const wingSection = (key, title) => {
      const list = rows.filter(r => r.wing === key);
      if (!list.length) return '';
      const n = k => list.filter(r => r.st.key === k).length;
      const sub = [`${n('avail')} available`, `${n('call')} on call`, `${n('busy') + n('break')} away`].join(' · ');
      return `<section class="lf-wing" aria-label="${e(title)}">
        <h3 class="lf-wing-t">${e(title)} <span class="lf-wing-n">${list.length}</span><span class="lf-wing-sub">${e(sub)}</span></h3>
        <div class="lf-grid">${list.map(r => agentCard(r, me && r === me, mode === 'admin')).join('')}</div>
      </section>`;
    };
    // The viewer's own wing first for agents; Call Wing first for admins.
    const order = (me && me.wing === 'chat') ? [['chat', 'Chat Wing'], ['call', 'Call Wing']] : [['call', 'Call Wing'], ['chat', 'Chat Wing']];
    const grid = rows.length
      ? order.map(([k, t]) => wingSection(k, t)).join('')
      : '<div class="lf-card lf-pad lf-sub">No monitored agents yet.</div>';

    const availNote = (mode === 'admin' && _avail && _avail.note) ? `<div class="lf-card lf-pad lf-sub" role="status" style="margin-bottom:10px">${e(_avail.note)}</div>` : '';
    root.innerHTML = head + availNote
      + (mode === 'agent' ? meCard(me) : '')
      + kpiStrip(rows, ctx)
      + `<div class="lf-main"><div class="lf-wings">${grid}</div><aside class="lf-rail">${mode === 'admin' ? adminRail(rows) : agentRail(rows)}</aside></div>`;
  }

  function startTicker() {
    if (_tick) return;
    _tick = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      document.querySelectorAll('[data-lf-since]').forEach(el => {
        const ms = Number(el.getAttribute('data-lf-since'));
        if (ms) el.textContent = clock((now - ms) / 1000);
      });
    }, 1000);
  }

  window.renderLiveFloor = function (ctx) {
    try {
      _last = ctx;
      paint(ctx);
      startTicker();
      refreshChats();
      if (ctx.mode === 'agent') refreshMine();
      if (ctx.mode === 'admin') refreshAvail();
    } catch (err) {
      console.error('renderLiveFloor', err);
    }
  };
})();
