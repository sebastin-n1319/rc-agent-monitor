/**
 * Breaks v2 (Session 47). Sebastin's pick: "Personal coach" for agents,
 * "Live lanes" + "Day timeline" for admins.
 *
 * Pure view layer on top of the existing Break Bot plumbing in index.html:
 *   - data:    breakTrackerData (loadBreakTracker(), polled/refreshed there)
 *   - actions: sendBreakAction(action, btn, { skipReason }) (same server rules,
 *              Google Chat post, offline queue)
 *   - dates:   getBreakTrackerDate() / setBreakTrackerDate()
 * index.html calls window.renderBreaksV2() after every tracker load.
 */
(function () {
  'use strict';

  const TICK_MS = 1000;
  const DAY_TZ = 'America/Chicago'; // break days follow the Chicago day (Session 48)
  const MAX_AWAY = 2;
  const AWAY = new Set(['Break', 'BRB', 'Training / Coaching', 'QA Session AUX', 'Internal Calls']);
  const LANES = {
    'Logged In':           { key: 'live',  label: 'Logged in' },
    'Break':               { key: 'break', label: 'On break' },
    'BRB':                 { key: 'brb',   label: 'BRB' },
    'Training / Coaching': { key: 'aux',   label: 'Training' },
    'QA Session AUX':      { key: 'aux',   label: 'QA session' },
    'Internal Calls':      { key: 'aux',   label: 'Internal call' },
    'Logged Out':          { key: 'off',   label: 'Logged out' },
  };
  // One tile per activity. `out` starts it, `in` ends it.
  const TILES = [
    { lane: 'Break',               out: 'BREAK_OUT',         in: 'BREAK_IN',         icon: '☕', title: 'Break' },
    { lane: 'BRB',                 out: 'BRB_OUT',           in: 'BRB_IN',           icon: '⏱', title: 'BRB' },
    { lane: 'Training / Coaching', out: 'TRAINING_OUT',      in: 'TRAINING_IN',      icon: '🎓', title: 'Training' },
    { lane: 'QA Session AUX',      out: 'QA_SESSION_OUT',    in: 'QA_SESSION_IN',    icon: '✅', title: 'QA session' },
    { lane: 'Internal Calls',      out: 'INTERNAL_CALL_OUT', in: 'INTERNAL_CALL_IN', icon: '📞', title: 'Internal call' },
  ];

  let limits = { breakDay: 60, brbDay: 20, brbSingle: 10 };
  let limitsLoaded = false;
  let monitored = null;          // [{email,name}]
  let history = null, historyFor = '', historyAt = 0;
  let tick = null;
  let inFlight = false;
  let plans = null;            // email -> { start_ist, minutes }
  let planEditor = false;

  const $ = (sel, root) => (root || document).querySelector(sel);
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function g(name, fb) {
    try {
      switch (name) {
        case 'data': return typeof breakTrackerData !== 'undefined' ? breakTrackerData : fb;
        case 'email': return typeof currentEmail !== 'undefined' ? currentEmail : fb;
        case 'user': return typeof currentUser !== 'undefined' ? currentUser : fb;
        case 'role': return typeof currentRole !== 'undefined' ? currentRole : fb;
        case 'view': return typeof currentViewMode !== 'undefined' ? currentViewMode : fb;
        case 'tz': return typeof currentTZ !== 'undefined' ? currentTZ : fb;
        default: return fb;
      }
    } catch (err) { return fb; }
  }
  function parseTs(ts) {
    if (!ts) return null;
    const s = String(ts);
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  }
  function clock(sec) {
    if (sec == null || !(sec >= 0)) return '--:--';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
  }
  function mins(sec) { return Math.round((sec || 0) / 60); }
  function dur(sec) {
    const m = mins(sec);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }
  function tzName() { try { return typeof activeTimeZone === 'function' ? activeTimeZone() : 'America/Chicago'; } catch (err) { return 'America/Chicago'; } }
  function timeOf(ms) {
    if (!ms) return '-';
    return new Date(ms).toLocaleTimeString('en-US', { timeZone: tzName(), hour: 'numeric', minute: '2-digit' });
  }
  function isToday() { try { return !(typeof breakHistoryMode === 'function' && breakHistoryMode()); } catch (err) { return true; } }
  function wingOf(email) {
    if (typeof window.aditWingOf === 'function') return window.aditWingOf(email);
    return 'call';
  }

  // Live seconds for a lane, counting the stretch still running.
  function laneSecs(row, lane, key) {
    if (!row) return 0;
    let secs = row[key] || 0;
    if (row.currentStatus === lane && isToday()) {
      const since = parseTs(row.since);
      if (since) secs = Math.max(secs, (secs - (row.currentLaneSeconds || 0)) + (Date.now() - since) / 1000);
    }
    return secs;
  }
  function laneCount(row, lane) {
    let n = 0, prev = null;
    const evs = ((row && row.events) || []).slice().reverse();
    for (const ev of evs) { if (ev.currentStatus === lane && prev !== lane) n++; prev = ev.currentStatus; }
    return n;
  }
  function overFlags(row) {
    const f = [];
    const b = laneSecs(row, 'Break', 'breakSeconds'), r = laneSecs(row, 'BRB', 'brbSeconds');
    if (mins(b) > limits.breakDay) f.push(`Break ${mins(b)}m of ${limits.breakDay}m`);
    if (mins(r) > limits.brbDay) f.push(`BRB ${mins(r)}m of ${limits.brbDay}m`);
    if (row && row.currentStatus === 'BRB') {
      const since = parseTs(row.since);
      if (since && (Date.now() - since) / 60000 > limits.brbSingle) f.push(`BRB over ${limits.brbSingle}m`);
    }
    return f;
  }

  async function loadLimits() {
    if (limitsLoaded) return;
    limitsLoaded = true;
    try {
      const j = await fetch('/api/break-thresholds', { credentials: 'include' }).then(r => r.json());
      for (const t of (j && j.data) || []) {
        if (t.aux_type === 'BREAK' && t.daily_limit_minutes) limits.breakDay = t.daily_limit_minutes;
        if (t.aux_type === 'BRB' && t.single_limit_minutes) limits.brbSingle = t.single_limit_minutes;
        if (t.aux_type === 'BRB' && t.daily_limit_minutes) limits.brbDay = t.daily_limit_minutes;
      }
      render(true);
    } catch (err) { /* defaults stay */ }
  }
  async function loadPlans(force) {
    if (plans && !force) return;
    plans = plans || {};
    try {
      const j = await fetch('/api/break-plan', { credentials: 'include' }).then(r => r.json());
      if (j && j.success) { plans = {}; for (const p of j.data || []) plans[String(p.email).toLowerCase()] = p; render(true); }
    } catch (err) { /* no plan */ }
  }
  function planFor(email) { return plans && plans[String(email || '').toLowerCase()] || null; }
  // Planned slot as a timestamp on the selected Chicago day. The team works
  // IST evenings, so a plan before noon IST belongs to the next IST date.
  function planTs(plan) {
    if (!plan) return null;
    let d = null; try { d = getBreakTrackerDate(); } catch (err) { d = null; }
    if (!d) return null;
    const hh = parseInt(plan.start_ist, 10);
    const istDate = hh < 12 ? new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) : d;
    const ms = Date.parse(`${istDate}T${plan.start_ist}:00+05:30`);
    return Number.isNaN(ms) ? null : ms;
  }
  function planLabel(plan) {
    if (!plan) return '';
    const [h, m] = plan.start_ist.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm} IST · ${plan.minutes}m`;
  }

  async function loadMonitored() {
    if (monitored) return;
    monitored = [];
    try {
      const j = await fetch('/api/agents', { credentials: 'include' }).then(r => r.json());
      monitored = ((j && j.data) || []).map(a => ({ email: String(a.email || '').toLowerCase(), name: a.name }));
      render(true);
    } catch (err) { /* show everyone */ }
  }
  async function loadHistory() {
    const email = String(g('email', '') || '').toLowerCase();
    if (!email) return;
    if (historyFor === email && Date.now() - historyAt < 5 * 60000) return;
    historyFor = email; historyAt = Date.now();
    try {
      const j = await fetch(`/api/break-history?days=7&tz=${encodeURIComponent(DAY_TZ)}`, { credentials: 'include' }).then(r => r.json());
      if (j && j.success) { history = j.days; render(true); }
    } catch (err) { /* week chart stays empty */ }
  }

  function teamRows() {
    const d = g('data', {}) || {};
    let rows = (d.tracker || []).filter(r => r.role !== 'admin' || AWAY.has(r.currentStatus) || r.currentStatus === 'Logged In');
    if (monitored && monitored.length) {
      const set = new Set(monitored.map(m => m.email));
      rows = rows.filter(r => set.has(String(r.email || '').toLowerCase()));
    }
    return rows;
  }
  function pill(row) {
    const lane = LANES[row.currentStatus] || LANES['Logged Out'];
    const over = overFlags(row).length;
    return `<span class="bx-pill bx-${over ? 'over' : lane.key}"><span class="bx-dot"></span>${e(lane.label)}${over ? ' · over' : ''}</span>`;
  }

  /* ───────────────────────── Agent view (Personal coach) ───────────────────────── */
  function ring(usedSec, limitMin, color, label) {
    const used = mins(usedSec), pct = Math.min(1, used / Math.max(1, limitMin));
    const over = used > limitMin;
    const left = Math.max(0, limitMin - used);
    return `<div class="bx-ring-row">
      <div class="bx-ring" style="--p:${(pct * 360).toFixed(1)}deg;--c:${over ? 'var(--bx-red)' : color}" role="img" aria-label="${e(label)}: ${used} of ${limitMin} minutes used">
        <div><b class="bx-mono">${over ? '+' + (used - limitMin) : left}m</b><span>${over ? 'over' : 'left'}</span></div>
      </div>
      <div><div class="bx-strong">${e(label)}</div><div class="bx-sub">${used}m used of ${limitMin}m today</div></div>
    </div>`;
  }

  function weekChart() {
    const days = history || [];
    if (!days.length) return '<div class="bx-sub">Loading your week…</div>';
    const max = Math.max(limits.breakDay + limits.brbDay, ...days.map(d => mins(d.breakSeconds) + mins(d.brbSeconds)), 1);
    const H = 110;
    return `<div class="bx-week" role="img" aria-label="Break and BRB minutes for the last 7 days">
      ${days.map(d => {
        const b = mins(d.breakSeconds), r = mins(d.brbSeconds);
        const over = b > limits.breakDay || r > limits.brbDay;
        const wd = new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        return `<div class="bx-wcol" title="${e(wd)}: break ${b}m (${d.breakCount}), BRB ${r}m (${d.brbCount})">
          <div class="bx-wbar"><i style="height:${Math.round(r / max * H)}px;background:var(--bx-orange)"></i><i style="height:${Math.round(b / max * H)}px;background:${over ? 'var(--bx-red)' : 'var(--bx-yellow)'}"></i></div>
          <span class="bx-mono">${b + r}m</span><span>${e(wd)}</span></div>`;
      }).join('')}
    </div>
    <div class="bx-legend"><span><i style="background:var(--bx-yellow)"></i>Break</span><span><i style="background:var(--bx-orange)"></i>BRB</span><span><i style="background:var(--bx-red)"></i>Over limit</span></div>`;
  }

  function teamHTML(team) {
    const myEmail = String(g('email', '') || '').toLowerCase();
    const order = { 'Break': 0, 'BRB': 1, 'Training / Coaching': 2, 'QA Session AUX': 2, 'Internal Calls': 2, 'Logged In': 3, 'Logged Out': 4 };
    const wingBlock = (w, title) => {
      const list = team.filter(r => wingOf(r.email) === w).sort((a, b) => (order[a.currentStatus] ?? 5) - (order[b.currentStatus] ?? 5) || String(a.username).localeCompare(String(b.username)));
      if (!list.length) return '';
      const away = list.filter(r => r.currentStatus === 'Break' || r.currentStatus === 'BRB').length;
      return `<div class="bx-team-wing">
        <div class="bx-row bx-between"><div class="bx-strong">${title}</div><span class="bx-pill ${away > MAX_AWAY ? 'bx-over' : 'bx-off'}">${away} away now</span></div>
        <div class="bx-team-list">${list.map(r => {
          const lane = LANES[r.currentStatus] || LANES['Logged Out'];
          const since = parseTs(r.since);
          const live = isToday() && since && r.currentStatus !== 'Logged Out';
          const plan = planFor(r.email);
          const isMe = String(r.email).toLowerCase() === myEmail;
          return `<div class="bx-team-row${isMe ? ' bx-team-me' : ''}">
            <div class="bx-team-name"><b>${e(r.username || r.email)}${isMe ? ' <span class="bx-you">You</span>' : ''}</b><span class="bx-sub">${plan ? 'Break plan ' + e(planLabel(plan)) : 'No break plan'}</span></div>
            <span class="bx-pill bx-${lane.key}"><span class="bx-dot"></span>${e(lane.label)}</span>
            <span class="bx-mono bx-team-t" data-bx-since="${live ? since : ''}">${live ? clock((Date.now() - since) / 1000) : '-'}</span>
          </div>`;
        }).join('')}</div>
      </div>`;
    };
    return `<section class="bx-card bx-pad bx-team" aria-label="Team status">
      <div class="bx-row bx-between" style="margin-bottom:10px"><div class="bx-strong">Team right now</div><div class="bx-sub">Plan your break when fewer teammates are away.</div></div>
      <div class="bx-team-grid">${wingBlock('call', 'Call Wing')}${wingBlock('chat', 'Chat Wing')}</div>
    </section>`;
  }

  function agentHTML() {
    const me = typeof getSelfBreakRow === 'function' ? getSelfBreakRow() : null;
    const status = (me && me.currentStatus) || 'Logged Out';
    const lane = LANES[status] || LANES['Logged Out'];
    const since = me ? parseTs(me.since) : null;
    const today = isToday();
    const first = String(g('user', '') || '').split(' ')[0] || 'there';
    const breakSec = laneSecs(me, 'Break', 'breakSeconds'), brbSec = laneSecs(me, 'BRB', 'brbSeconds');
    const flags = me ? overFlags(me) : [];

    let tiles;
    if (!today) {
      tiles = `<div class="bx-note">You are looking at a past day. <button class="bx-link" data-bx-today>Back to today</button> to take a break.</div>`;
    } else if (status === 'Logged Out') {
      tiles = `<button class="bx-cta" data-bx-action="LOGGED_IN"><span>▶</span> Start my shift</button>`;
    } else {
      tiles = `<div class="bx-tiles">${TILES.map(t => {
        const active = status === t.lane;
        const sub = t.lane === 'Break' ? `${Math.max(0, limits.breakDay - mins(breakSec))}m left today`
          : t.lane === 'BRB' ? `${Math.max(0, limits.brbDay - mins(brbSec))}m left · max ${limits.brbSingle}m each`
          : t.lane === 'Internal Calls' ? 'Needs a short reason' : 'AUX';
        return `<button class="bx-tile${active ? ' bx-tile-on' : ''}" data-bx-action="${active ? t.in : t.out}" aria-pressed="${active}">
          <span class="bx-tile-ico" aria-hidden="true">${t.icon}</span>
          <b>${active ? 'End ' + e(t.title.toLowerCase()) : e(t.title)}</b>
          <span>${active ? 'Tap when you are back' : e(sub)}</span>
        </button>`;
      }).join('')}
        <button class="bx-tile bx-tile-out" data-bx-action="LOGGED_OUT"><span class="bx-tile-ico" aria-hidden="true">🚪</span><b>End shift</b><span>Log out for the day</span></button>
      </div>`;
    }

    const team = teamRows();
    const myWing = wingOf(g('email', ''));
    const wingAway = team.filter(r => wingOf(r.email) === myWing && (r.currentStatus === 'Break' || r.currentStatus === 'BRB') && String(r.email).toLowerCase() !== String(g('email', '')).toLowerCase());
    const tip = wingAway.length
      ? `${wingAway.length} teammate${wingAway.length > 1 ? 's' : ''} from your wing ${wingAway.length > 1 ? 'are' : 'is'} away right now (${wingAway.map(r => e(String(r.username || '').split(' ')[0])).join(', ')}). Try to stagger your break.`
      : 'Nobody from your wing is on a break right now.';

    const log = ((me && me.events) || []).filter(ev => ev.eventType !== 'system').slice(0, 12);
    const myPlan = planFor(g('email', ''));
    const myPlanTs = planTs(myPlan);
    const planLine = myPlan
      ? `Your planned break: <b>${e(planLabel(myPlan))}</b>${myPlanTs && myPlanTs > Date.now() && today ? ` (in ${dur((myPlanTs - Date.now()) / 1000)})` : ''}.`
      : 'No planned break time set for you yet.';

    return `<div class="bx-wrap">
      <div class="bx-head">
        <div><h2 class="bx-h1">Hi ${e(first)}</h2><div class="bx-sub">Your breaks today. One tap to start, one tap to end. Every tap posts to Google Chat.</div></div>
        ${dateBar()}
      </div>
      ${flags.length ? `<div class="bx-alert" role="alert">⚠ ${flags.map(e).join(' · ')}</div>` : ''}
      <div class="bx-hero">
        <section class="bx-card bx-state bx-state-${lane.key}" aria-label="Your status">
          <div class="bx-row bx-between"><span class="bx-pill bx-${lane.key}"><span class="bx-dot"></span>${e(lane.label)}</span><span class="bx-sub">${since ? 'since ' + e(timeOf(since)) : ''}</span></div>
          <div class="bx-timer bx-mono" data-bx-since="${today && since ? since : ''}">${today && since ? clock((Date.now() - since) / 1000) : '--:--'}</div>
          ${tiles}
          <div class="bx-sub bx-tip">${planLine} ${tip}</div>
        </section>
        <section class="bx-card bx-pad" aria-label="Today's budget">
          <div class="bx-strong">Today's budget</div>
          <div class="bx-rings">${ring(breakSec, limits.breakDay, 'var(--bx-yellow)', 'Break')}${ring(brbSec, limits.brbDay, 'var(--bx-orange)', 'BRB')}</div>
          <div class="bx-strong" style="margin-top:18px">This week</div>
          ${weekChart()}
        </section>
      </div>
      ${teamHTML(team)}
      <section class="bx-card" aria-label="Today's log">
        <div class="bx-pad bx-strong" style="padding-bottom:0">Today's log</div>
        ${log.length ? `<div class="bx-scroll"><table class="bx-table"><thead><tr><th>Time</th><th>What</th><th>Duration</th><th>Note</th></tr></thead><tbody>
          ${log.map(ev => `<tr><td class="bx-mono">${e(timeOf(parseTs(ev.createdAt)))}</td><td>${e(ev.actionLabel || ev.action)}</td><td class="bx-mono">${ev.linkedDurationSeconds ? dur(ev.linkedDurationSeconds) : '-'}</td><td class="bx-sub">${e(ev.note || '-')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="bx-pad bx-sub">Nothing logged yet today.</div>'}
      </section>
    </div>`;
  }

  /* ───────────────────────── Admin view (Lanes + Timeline) ───────────────────────── */
  function dateBar() {
    let d = '';
    try { d = getBreakTrackerDate(); } catch (err) { d = ''; }
    return `<div class="bx-row bx-datebar">
      <button class="bx-btn" data-bx-shift="-1" aria-label="Previous day">◀</button>
      <input class="bx-date" type="date" value="${e(d)}" aria-label="Date">
      <button class="bx-btn" data-bx-shift="1" aria-label="Next day">▶</button>
      ${isToday() ? '<span class="bx-pill bx-live"><span class="bx-dot"></span>Live</span>' : '<button class="bx-btn" data-bx-today>Today</button>'}
    </div>`;
  }

  function segmentsFor(row, dayStart, dayEnd) {
    const evs = ((row && row.events) || []).slice().reverse();
    const segs = [];
    let cur = null, start = null;
    for (const ev of evs) {
      const t = parseTs(ev.createdAt);
      if (t == null) continue;
      if (cur && AWAY.has(cur) && start != null) segs.push({ lane: cur, from: start, to: t });
      cur = ev.currentStatus; start = t;
    }
    if (cur && AWAY.has(cur) && start != null) segs.push({ lane: cur, from: start, to: Math.min(Date.now(), dayEnd), open: true });
    return segs.filter(s => s.to > dayStart && s.from < dayEnd);
  }

  function planEditorHTML() {
    const people = (monitored && monitored.length ? monitored : teamRows().map(r => ({ email: String(r.email).toLowerCase(), name: r.username })))
      .slice().sort((a, b) => wingOf(a.email).localeCompare(wingOf(b.email)) || String(a.name).localeCompare(String(b.name)));
    // Overlap check per wing: more than MAX_AWAY planned at the same minute.
    const clashes = new Set();
    for (const w of ['call', 'chat']) {
      const ps = people.filter(p => wingOf(p.email) === w).map(p => ({ p, plan: planFor(p.email) })).filter(x => x.plan);
      const toMin = s => { const [h, m] = s.split(':').map(Number); return ((h < 12 ? h + 24 : h) * 60) + m; };
      // Count people away at each minute; flag anyone whose slot covers a
      // minute where more than MAX_AWAY are planned at once.
      const at = new Map();
      for (const a of ps) { const st = toMin(a.plan.start_ist); for (let m = st; m < st + a.plan.minutes; m++) at.set(m, (at.get(m) || 0) + 1); }
      for (const a of ps) { const st = toMin(a.plan.start_ist); for (let m = st; m < st + a.plan.minutes; m++) if (at.get(m) > MAX_AWAY) { clashes.add(a.p.email); break; } }
    }
    return `<section class="bx-card bx-pad bx-plan-editor" aria-label="Break plan">
      <div class="bx-row bx-between"><div><div class="bx-strong">Break plan</div><div class="bx-sub">Set each agent's usual break start (IST) and length. Agents see their slot and everyone else's so breaks stay staggered. Red rows mean more than ${MAX_AWAY} people from one wing overlap.</div></div>
      <button class="bx-btn bx-btn-primary" data-bx-plan-save>Save plan</button></div>
      <div class="bx-plan-grid">
        ${people.map(p => { const pl = planFor(p.email) || {}; return `<div class="bx-plan-row${clashes.has(p.email) ? ' bx-plan-clash' : ''}" data-email="${e(p.email)}">
          <div><b>${e(p.name || p.email)}</b><div class="bx-sub">${wingOf(p.email) === 'chat' ? 'Chat' : 'Call'} wing</div></div>
          <input type="time" class="bx-date" data-plan-start value="${e(pl.start_ist || '')}" aria-label="Planned break start for ${e(p.name || p.email)} (IST)">
          <select class="bx-date" data-plan-min aria-label="Break length">${[15, 30, 45, 60].map(m => `<option value="${m}" ${Number(pl.minutes || 60) === m ? 'selected' : ''}>${m}m</option>`).join('')}</select>
        </div>`; }).join('')}
      </div>
    </section>`;
  }

  function adminHTML() {
    const rows = teamRows();
    const d = g('data', {}) || {};
    const byLane = { live: [], break: [], away: [], off: [] };
    for (const r of rows) {
      const k = (LANES[r.currentStatus] || LANES['Logged Out']).key;
      (k === 'brb' || k === 'aux' ? byLane.away : byLane[k] || byLane.off).push(r);
    }
    const overRows = rows.filter(r => overFlags(r).length);
    const teamBreak = rows.reduce((a, r) => a + laneSecs(r, 'Break', 'breakSeconds') + laneSecs(r, 'BRB', 'brbSeconds'), 0);
    const kpi = (l, v, sub) => `<div class="bx-card bx-kpi"><div class="bx-kpi-l">${l}</div><div class="bx-kpi-v bx-mono">${v}</div>${sub ? `<div class="bx-sub">${sub}</div>` : ''}</div>`;

    const chip = r => {
      const since = parseTs(r.since);
      const flags = overFlags(r);
      return `<div class="bx-chip${flags.length ? ' bx-chip-over' : ''}">
        <div class="bx-row bx-between"><b>${e(r.username || r.email)}</b><span class="bx-mono bx-strong" data-bx-since="${isToday() && since && r.currentStatus !== 'Logged Out' ? since : ''}">${isToday() && since && r.currentStatus !== 'Logged Out' ? clock((Date.now() - since) / 1000) : '-'}</span></div>
        <div class="bx-sub">${wingOf(r.email) === 'chat' ? 'Chat' : 'Call'} wing · ${(LANES[r.currentStatus] || {}).label || ''}</div>
        <div class="bx-sub">Breaks ${laneCount(r, 'Break')} (${dur(laneSecs(r, 'Break', 'breakSeconds'))}) · BRB ${laneCount(r, 'BRB')} (${dur(laneSecs(r, 'BRB', 'brbSeconds'))})</div>
        ${flags.length ? `<div class="bx-over-line">⚠ ${flags.map(e).join(' · ')}</div>` : ''}
      </div>`;
    };
    const lane = (title, color, list) => `<div class="bx-lane"><h4><span class="bx-row" style="gap:8px"><i class="bx-dot" style="background:${color}"></i>${title}</span><span class="bx-mono bx-sub">${list.length}</span></h4>${list.map(chip).join('') || '<div class="bx-sub">Nobody</div>'}</div>`;

    // Day timeline window: first event of the day (or 8h ago) to now/end of day.
    const day = (() => { try { return getBreakTrackerDate(); } catch (err) { return null; } })();
    let dayStart = Infinity, dayEnd = isToday() ? Date.now() : 0;
    for (const r of rows) for (const ev of (r.events || [])) { const t = parseTs(ev.createdAt); if (t) { dayStart = Math.min(dayStart, t); if (!isToday()) dayEnd = Math.max(dayEnd, t); } }
    if (!isFinite(dayStart)) dayStart = Date.now() - 8 * 3600e3;
    dayStart = Math.floor(dayStart / 1800e3) * 1800e3;
    dayEnd = Math.max(dayEnd, dayStart + 2 * 3600e3);
    const span = dayEnd - dayStart;
    const pct = t => ((t - dayStart) / span * 100).toFixed(2) + '%';
    const col = { 'Break': 'var(--bx-yellow)', 'BRB': 'var(--bx-orange)' };
    const active = rows.filter(r => (r.events || []).length);
    // Away-at-once per 15 minutes, per wing.
    const slots = Math.max(1, Math.ceil(span / 900e3));
    const cap = { call: new Array(slots).fill(0), chat: new Array(slots).fill(0) };
    const allSegs = new Map();
    for (const r of active) {
      const segs = segmentsFor(r, dayStart, dayEnd);
      allSegs.set(r.email, segs);
      for (const s of segs) {
        if (s.lane !== 'Break' && s.lane !== 'BRB') continue;
        for (let i = Math.max(0, Math.floor((s.from - dayStart) / 900e3)); i < Math.min(slots, Math.ceil((s.to - dayStart) / 900e3)); i++) cap[wingOf(r.email)][i]++;
      }
    }
    const capBar = w => `<div class="bx-cap" role="img" aria-label="${w === 'chat' ? 'Chat' : 'Call'} wing people away per 15 minutes">${cap[w].map((c, i) => `<i title="${timeOf(dayStart + i * 900e3)}: ${c} away" style="height:${6 + c * 12}px;background:${c > MAX_AWAY ? 'var(--bx-red)' : c ? 'var(--bx-teal)' : 'var(--bx-border)'}"></i>`).join('')}</div>`;
    const ticks = [];
    for (let t = dayStart; t <= dayEnd; t += Math.max(1800e3, Math.ceil(span / 8 / 1800e3) * 1800e3)) ticks.push(t);

    const planBox = r => {
      const p = planFor(r.email), t = planTs(p);
      if (!t || t + p.minutes * 60000 < dayStart || t > dayEnd) return '';
      return `<i class="bx-plan" title="Planned break ${e(planLabel(p))}" style="left:${pct(Math.max(t, dayStart))};width:calc(${pct(Math.min(t + p.minutes * 60000, dayEnd))} - ${pct(Math.max(t, dayStart))})"></i>`;
    };
    const tlRow = r => `<div class="bx-tl-row">
      <div class="bx-tl-name"><b>${e(r.username || r.email)}</b>${pill(r)}</div>
      <div class="bx-track">${planBox(r)}${(allSegs.get(r.email) || []).map(s => `<i class="bx-seg" title="${e((LANES[s.lane] || {}).label || s.lane)} ${timeOf(s.from)} to ${s.open ? 'now' : timeOf(s.to)} (${dur((s.to - s.from) / 1000)})" style="left:${pct(Math.max(s.from, dayStart))};width:calc(${pct(Math.min(s.to, dayEnd))} - ${pct(Math.max(s.from, dayStart))});background:${col[s.lane] || 'var(--bx-purple)'}"></i>`).join('')}${isToday() ? `<i class="bx-now" style="left:${pct(Date.now())}"></i>` : ''}</div>
      <div class="bx-mono bx-sub" style="text-align:right">${dur(laneSecs(r, 'Break', 'breakSeconds') + laneSecs(r, 'BRB', 'brbSeconds'))}</div>
    </div>`;

    return `<div class="bx-wrap">
      <div class="bx-head">
        <div><h2 class="bx-h1">Break board</h2><div class="bx-sub">Who is on a break right now, how long, and who is over their limits. Limits: break ${limits.breakDay}m a day, BRB ${limits.brbDay}m a day and ${limits.brbSingle}m each.</div></div>
        <div class="bx-row">${dateBar()}
          <button class="bx-btn" data-bx-plan>${planEditor ? 'Close break plan' : 'Plan breaks'}</button>
          <button class="bx-btn" data-bx-report>Send report to Chat</button>
          <button class="bx-btn" data-bx-csv>Export CSV</button>
        </div>
      </div>
      ${planEditor ? planEditorHTML() : ''}
      <div class="bx-kpis">
        ${kpi('Logged in', byLane.live.length)}
        ${kpi('On break', byLane.break.length, byLane.break.map(r => e(String(r.username).split(' ')[0])).join(', '))}
        ${kpi('BRB / AUX', byLane.away.length, byLane.away.map(r => e(String(r.username).split(' ')[0])).join(', '))}
        ${kpi('Over a limit', overRows.length, overRows.map(r => e(String(r.username).split(' ')[0])).join(', '))}
        ${kpi('Team break time', dur(teamBreak))}
      </div>
      <div class="bx-lanes">
        ${lane('Logged in', 'var(--bx-green)', byLane.live)}
        ${lane('On break', 'var(--bx-yellow)', byLane.break)}
        ${lane('BRB / AUX', 'var(--bx-orange)', byLane.away)}
        ${lane('Logged out', 'var(--bx-t4)', byLane.off)}
      </div>
      <section class="bx-card bx-pad" style="margin-top:16px" aria-label="Day timeline">
        <div class="bx-row bx-between"><div class="bx-strong">Day timeline</div><div class="bx-legend"><span><i style="background:var(--bx-yellow)"></i>Break</span><span><i style="background:var(--bx-orange)"></i>BRB</span><span><i style="background:var(--bx-purple)"></i>AUX</span><span><i class="bx-plan-key"></i>Planned</span>${isToday() ? '<span><i style="background:var(--bx-red)"></i>Now</span>' : ''}</div></div>
        <div class="bx-caps">
          <div><div class="bx-sub">Call wing away at once (red = more than ${MAX_AWAY})</div>${capBar('call')}</div>
          <div><div class="bx-sub">Chat wing away at once</div>${capBar('chat')}</div>
        </div>
        <div class="bx-tl-row bx-tl-axis"><div></div><div class="bx-axis">${ticks.map(t => `<span style="left:${pct(t)}">${timeOf(t)}</span>`).join('')}</div><div></div></div>
        ${active.length ? active.map(tlRow).join('') : '<div class="bx-sub">No break activity yet for this day.</div>'}
      </section>
    </div>`;
  }

  /* ───────────────────────── mount / events ───────────────────────── */
  function roots() {
    return { agent: document.getElementById('bx-agent-root'), admin: document.getElementById('bx-admin-root') };
  }

  function render(force) {
    const { agent, admin } = roots();
    const view = g('view', 'admin');
    try {
      if (agent && view === 'agent') agent.innerHTML = agentHTML();
      if (admin && view === 'admin') admin.innerHTML = adminHTML();
    } catch (err) { console.error('breaks-v2 render', err); }
    startTick();
  }

  function startTick() {
    if (tick) return;
    tick = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      document.querySelectorAll('[data-bx-since]').forEach(el => {
        const ms = Number(el.getAttribute('data-bx-since'));
        if (ms) el.textContent = clock((now - ms) / 1000);
      });
    }, TICK_MS);
    // Rings, budgets and flags move with time too; redraw once a minute.
    setInterval(() => { if (!document.hidden) render(); }, 60000);
  }

  document.addEventListener('click', async ev => {
    const act = ev.target.closest('[data-bx-action]');
    if (act && (act.closest('#bx-agent-root') || act.closest('#bx-admin-root'))) {
      ev.preventDefault();
      if (typeof window.sendBreakAction !== 'function' || inFlight) return;
      inFlight = true;
      document.querySelectorAll('#bx-agent-root [data-bx-action]').forEach(b => { b.disabled = true; });
      act.classList.add('bx-busy');
      try { await window.sendBreakAction(act.getAttribute('data-bx-action'), null, { skipReason: true }); }
      finally { inFlight = false; historyAt = 0; loadHistory(); render(); }
      return;
    }
    if (ev.target.closest('[data-bx-plan]')) { planEditor = !planEditor; render(); return; }
    if (ev.target.closest('[data-bx-plan-save]')) {
      const items = [...document.querySelectorAll('#bx-admin-root .bx-plan-row')].map(row => ({
        email: row.getAttribute('data-email'),
        start: (row.querySelector('[data-plan-start]') || {}).value || '',
        minutes: (row.querySelector('[data-plan-min]') || {}).value || 60,
      }));
      try {
        const j = await fetch('/api/break-plan', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).then(r => r.json());
        if (j.success) { plans = {}; for (const p of j.data || []) plans[String(p.email).toLowerCase()] = p; render(); }
        if (typeof showToast === 'function') showToast(j.success ? 'Break plan saved' : (j.error || 'Could not save'), j.success ? 'success' : 'error');
      } catch (err) { if (typeof showToast === 'function') showToast('Could not save the plan', 'error'); }
      return;
    }
    const sh = ev.target.closest('[data-bx-shift]');
    if (sh && typeof shiftBreakTrackerWindow === 'function') { shiftBreakTrackerWindow(Number(sh.getAttribute('data-bx-shift'))); return; }
    if (ev.target.closest('[data-bx-today]') && typeof setBreakTrackerDate === 'function') { setBreakTrackerDate(typeof breakTodayStr === 'function' ? breakTodayStr() : ''); return; }
    if (ev.target.closest('[data-bx-report]') && typeof window.openBreakReportSend === 'function') { window.openBreakReportSend(); return; }
    if (ev.target.closest('[data-bx-report]')) {
      try {
        const r = await fetch('/api/break-report/send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: getBreakTrackerDate(), end: getBreakTrackerDate(), tz: DAY_TZ }) }).then(x => x.json());
        if (typeof showToast === 'function') showToast(r.success ? 'Break report posted to Google Chat' : (r.error || 'Report failed'), r.success ? 'success' : 'error');
      } catch (err) { if (typeof showToast === 'function') showToast('Report failed', 'error'); }
      return;
    }
    if (ev.target.closest('[data-bx-csv]')) {
      window.location.href = `/api/export/break-tracker?date=${encodeURIComponent(getBreakTrackerDate())}&tz=${encodeURIComponent(DAY_TZ)}`;
    }
  });
  document.addEventListener('change', ev => {
    if (ev.target.classList && ev.target.classList.contains('bx-date') && typeof setBreakTrackerDate === 'function') setBreakTrackerDate(ev.target.value);
  });

  window.renderBreaksV2 = function () {
    loadLimits(); loadMonitored(); loadPlans();
    if (g('view', 'admin') === 'agent') loadHistory();
    render();
  };
})();
