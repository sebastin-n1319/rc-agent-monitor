/**
 * Ticket Lifecycle Admin — Session 20 (+ Session 21 filters/progress)
 * (+ Session 27: hover tooltips on every metric, a team-summary strip
 * with previous-period deltas, a client-side agent finder, expand/
 * collapse-all, and grouped "Ticket flow" / "Outcomes" pill layout.)
 *
 * Automated replacement for the manually-exported Zoho Desk "lifecycle
 * report" CSV, and the eventual replacement for the manual per-ticket
 * data-entry form agents fill in today (POST /api/tickets → Google Sheet).
 * Shows per-T1-agent, per-channel ticket stats sourced directly from Zoho
 * Desk ticket properties: unique tickets, solely-handled vs reassigned,
 * closed, currently-handling (live), FCR%, and channel / Adit App Module /
 * category / classification breakdowns. Kept current by a background sync
 * against the Zoho Desk API (server-side, see lib/desk-service.js +
 * lib/desk-lifecycle.js).
 *
 * CSAT% (Session 20): real per-ticket data, sourced from Zoho Analytics'
 * own "Survey (Zoho Desk)" table -- the public Desk REST API doesn't
 * expose this for this org (confirmed by exhausting every plausible
 * endpoint live), but Analytics' dedicated Desk connector syncs it
 * separately. See lib/analytics-service.js. Good / (Good+Okay+Bad),
 * filtered by when the survey was submitted (not ticket closed time),
 * scoped to whichever agent owned the ticket.
 *
 * NPS% is NOT shown here: checked the data warehouse and it's an
 * account/deal-level relationship survey (collected by CSM/account
 * staff), not tied to individual Desk tickets or T1 agents -- unlike
 * CSAT, there's no per-ticket NPS source to attribute to one agent.
 *
 * Session 21: sync progress % (departments × pages completed) with
 * auto-refresh on completion, a full relative-date filter (rolling
 * 7/30/90 days, calendar Today/Yesterday/This-Last Week/Month/Quarter/
 * Year, current season, and a custom range picker -- all calendar
 * boundaries computed in America/Chicago wall-clock time, DST-aware),
 * a combined customer search box (company/contact name/email, one
 * field, server-side LIKE match), and a reorganized filter bar.
 *
 * Session 27: every pill and breakdown-group title now carries a
 * data-tip explaining exactly what it counts and how it's windowed
 * (grounded in this file's + lib/desk-lifecycle.js's own definitions,
 * not paraphrased) -- FCR/CSAT tips show the live numerator/denominator
 * for that agent, not just the static definition. A "Team summary" strip
 * sits above the per-agent cards with pooled team totals and, when a
 * same-length prior period is available, a delta vs. that prior period.
 * A client-side "Find agent" box narrows the rendered cards instantly
 * (separate from the server-side Customer search, which searches by
 * customer, not agent). Pills are grouped into "Ticket flow" (unique /
 * solely handled / reassigned / transferred / handed off) vs "Outcomes"
 * (closed / handling now / avg handle / FCR / CSAT) for scannability.
 *
 * Entry point: window.openDeskLifecycleAdmin(), rendering into
 * #desk-lifecycle-root.
 */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function toastSafe(msg, type, dur) {
    if (typeof showToast === 'function') showToast(msg, type, dur);
  }

  let _sortKey = 'activity';
  const _expanded = new Set(); // emails whose breakdown panel is open, survives re-sorts within a render

  // ── Filter state ──────────────────────────────────────────────────────
  let _selectedPreset = 'r30';
  let _customFrom = null; // 'YYYY-MM-DD'
  let _customTo = null;   // 'YYYY-MM-DD'
  let _customerQuery = '';
  let _searchDebounce = null;
  let _agentQuery = ''; // Session 27: client-side "Find agent" filter, no server round-trip

  // Session 28: quick-filter chips -- client-side toggles on top of the
  // Find-agent filter, answering "apart from the date filter, think of any
  // other useful filters" with filters an admin actually reaches for:
  // agents worth checking in on, not just agents matching a typed name.
  let _quickFilters = new Set(); // subset of QUICK_FILTERS keys, AND'd together
  const QUICK_FILTERS = [
    { key: 'attention', label: 'Needs attention', tip: 'Needs attention\n\nAgents whose FCR% (with at least 3 closed tickets in range) is below the team\'s pooled FCR% for the same agents shown.' },
    { key: 'reassign',  label: 'High reassignment', tip: 'High reassignment\n\nAgents where Reassigned tickets are at least 25% of their Unique tickets in range (min. 4 unique tickets).' },
    { key: 'handling',  label: 'Currently handling', tip: 'Currently handling\n\nAgents with at least one ticket open right now. Live, not windowed by the date filter.' },
  ];

  // ── Sync polling state ───────────────────────────────────────────────
  let _pollHandle = null;
  let _wasSyncRunning = false;

  const SORT_OPTIONS = [
    { key: 'activity',  label: 'Total activity',      fn: (a) => (a.unique_tickets || 0) },
    { key: 'closed',    label: 'Closed',               fn: (a) => (a.closed_count || 0) },
    { key: 'handling',  label: 'Currently handling',   fn: (a) => (a.currently_handling || 0) },
    { key: 'fcr',       label: 'FCR %',                fn: (a) => (a.fcr_pct == null ? -1 : a.fcr_pct) },
    { key: 'csat',      label: 'CSAT %',               fn: (a) => (a.csat_pct == null ? -1 : a.csat_pct) },
    { key: 'reassigned',label: 'Reassigned',           fn: (a) => (a.reassigned || 0) },
    { key: 'transferred',label: 'Transferred',          fn: (a) => (a.transferred || 0) },
    { key: 'handed_off_internal', label: 'Handed off internally', fn: (a) => (a.handed_off_internal || 0) },
    { key: 'name',      label: 'Name (A–Z)',           fn: null },
  ];

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/Chicago', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }) + ' CST';
    } catch (e) { return iso; }
  }

  // Session 32: "Last synced <absolute time>" alone doesn't tell anyone
  // how fresh the data actually is at a glance, or that it's on a timer
  // at all rather than live -- the direct cause of the Sabrina Quinn
  // confusion (her tickets were correct in Zoho, just not synced into
  // this page's local snapshot yet). Pairs with the explicit "syncs
  // automatically every 20 minutes" note added to statusBanner() below.
  function minutesAgo(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!(ms >= 0) || Number.isNaN(ms)) return null;
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  // ── Chicago (Central Time) DST-aware date math ──────────────────────
  // Same conversion pattern as lib/analytics-service.js's
  // centralWallTimeToUtcIso(), ported here so calendar-period filters
  // (Today, This month, This quarter, ...) line up with what the
  // customer actually experienced as "today" regardless of DST.
  function pad2(n) { return String(n).padStart(2, '0'); }

  function chicagoOffsetMinutesAt(utcMs) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = dtf.formatToParts(new Date(utcMs)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((asIfUtc - utcMs) / 60000); // negative for Chicago
  }

  function centralWallTimeToUtcIso(naiveLocalStr) {
    const m = String(naiveLocalStr).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return new Date(naiveLocalStr).toISOString();
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    const approxUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
    const offsetMin = chicagoOffsetMinutesAt(approxUtcMs);
    const realUtcMs = approxUtcMs - offsetMin * 60000;
    return new Date(realUtcMs).toISOString();
  }

  function dayStartIso(y, m, d) {
    return centralWallTimeToUtcIso(`${y}-${pad2(m)}-${pad2(d)} 00:00:00`);
  }

  function chicagoTodayYMD() {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = dtf.formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    return { y: +parts.year, m: +parts.month, d: +parts.day };
  }

  // Pure calendar-date math (UTC-anchored day count, no timezone
  // conversion) so we can add/subtract days safely across month/year
  // boundaries before handing the result to dayStartIso().
  function addDays(y, m, d, delta) {
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  function weekdayOf(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); } // 0=Sun..6=Sat
  function mondayOnOrBefore(y, m, d) {
    const wd = weekdayOf(y, m, d);
    return addDays(y, m, d, -((wd + 6) % 7)); // days since Monday
  }
  function quarterStartMonth(m) { return Math.floor((m - 1) / 3) * 3 + 1; }
  function seasonStartMonth(m) {
    if (m === 12 || m === 1 || m === 2) return 12;
    if (m >= 3 && m <= 5) return 3;
    if (m >= 6 && m <= 8) return 6;
    return 9;
  }
  function seasonLabel(m) { return { 12: 'Winter', 3: 'Spring', 6: 'Summer', 9: 'Fall' }[seasonStartMonth(m)]; }

  function computeRolling(days) {
    return { from: new Date(Date.now() - days * 24 * 3600 * 1000).toISOString(), to: new Date().toISOString() };
  }
  function computeToday() {
    const t = chicagoTodayYMD();
    return { from: dayStartIso(t.y, t.m, t.d), to: new Date().toISOString() };
  }
  function computeYesterday() {
    const t = chicagoTodayYMD();
    const y1 = addDays(t.y, t.m, t.d, -1);
    return { from: dayStartIso(y1.y, y1.m, y1.d), to: dayStartIso(t.y, t.m, t.d) };
  }
  function computeThisWeek() {
    const t = chicagoTodayYMD();
    const mon = mondayOnOrBefore(t.y, t.m, t.d);
    return { from: dayStartIso(mon.y, mon.m, mon.d), to: new Date().toISOString() };
  }
  function computeLastWeek() {
    const t = chicagoTodayYMD();
    const thisMon = mondayOnOrBefore(t.y, t.m, t.d);
    const lastMon = addDays(thisMon.y, thisMon.m, thisMon.d, -7);
    return { from: dayStartIso(lastMon.y, lastMon.m, lastMon.d), to: dayStartIso(thisMon.y, thisMon.m, thisMon.d) };
  }
  function computeThisMonth() {
    const t = chicagoTodayYMD();
    return { from: dayStartIso(t.y, t.m, 1), to: new Date().toISOString() };
  }
  function computeLastMonth() {
    const t = chicagoTodayYMD();
    const pm = t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 };
    return { from: dayStartIso(pm.y, pm.m, 1), to: dayStartIso(t.y, t.m, 1) };
  }
  function computeThisQuarter() {
    const t = chicagoTodayYMD();
    const qm = quarterStartMonth(t.m);
    return { from: dayStartIso(t.y, qm, 1), to: new Date().toISOString() };
  }
  function computeLastQuarter() {
    const t = chicagoTodayYMD();
    const qm = quarterStartMonth(t.m);
    const pq = qm === 1 ? { y: t.y - 1, m: 10 } : { y: t.y, m: qm - 3 };
    return { from: dayStartIso(pq.y, pq.m, 1), to: dayStartIso(t.y, qm, 1) };
  }
  function computeThisSeason() {
    const t = chicagoTodayYMD();
    const sm = seasonStartMonth(t.m);
    const sy = (sm === 12 && t.m !== 12) ? t.y - 1 : t.y; // Jan/Feb belong to the Winter that started last December
    return { from: dayStartIso(sy, sm, 1), to: new Date().toISOString() };
  }
  function computeThisYear() {
    const t = chicagoTodayYMD();
    return { from: dayStartIso(t.y, 1, 1), to: new Date().toISOString() };
  }
  function computeLastYear() {
    const t = chicagoTodayYMD();
    return { from: dayStartIso(t.y - 1, 1, 1), to: dayStartIso(t.y, 1, 1) };
  }
  function computeCustom() {
    if (!_customFrom || !_customTo) return computeRolling(30); // fallback until both dates are picked
    const [fy, fm, fd] = _customFrom.split('-').map(Number);
    const [ty, tm, td] = _customTo.split('-').map(Number);
    const end = addDays(ty, tm, td, 1); // inclusive end-of-day
    return { from: dayStartIso(fy, fm, fd), to: dayStartIso(end.y, end.m, end.d) };
  }

  function buildPresets() {
    return [
      { key: 'r7',  label: 'Last 7 days',  group: 'Rolling',  compute: () => computeRolling(7) },
      { key: 'r30', label: 'Last 30 days', group: 'Rolling',  compute: () => computeRolling(30) },
      { key: 'r90', label: 'Last 90 days', group: 'Rolling',  compute: () => computeRolling(90) },
      { key: 'today',       label: 'Today',                              group: 'Calendar', compute: computeToday },
      { key: 'yesterday',   label: 'Yesterday',                          group: 'Calendar', compute: computeYesterday },
      { key: 'thisWeek',    label: 'This week',                          group: 'Calendar', compute: computeThisWeek },
      { key: 'lastWeek',    label: 'Last week',                          group: 'Calendar', compute: computeLastWeek },
      { key: 'thisMonth',   label: 'This month',                         group: 'Calendar', compute: computeThisMonth },
      { key: 'lastMonth',   label: 'Last month',                         group: 'Calendar', compute: computeLastMonth },
      { key: 'thisQuarter', label: 'This quarter',                       group: 'Calendar', compute: computeThisQuarter },
      { key: 'lastQuarter', label: 'Last quarter',                       group: 'Calendar', compute: computeLastQuarter },
      { key: 'thisSeason',  label: `This season (${seasonLabel(chicagoTodayYMD().m)})`, group: 'Calendar', compute: computeThisSeason },
      { key: 'thisYear',    label: 'This year',                          group: 'Calendar', compute: computeThisYear },
      { key: 'lastYear',    label: 'Last year',                          group: 'Calendar', compute: computeLastYear },
      { key: 'custom',      label: 'Custom range…',                      group: 'Custom',   compute: computeCustom },
    ];
  }
  function findPreset(key) {
    const all = buildPresets();
    return all.find(p => p.key === key) || all[1];
  }
  function currentRange() { return findPreset(_selectedPreset).compute(); }

  // Session 27: the same-length period immediately before `range`, used
  // only for the team-summary "vs prior period" deltas. Not tied to any
  // preset -- just range.to becomes the new range.from, shifted back by
  // the same span, so "Last 30 days" compares against the 30 days before
  // that, "This month" compares against an equal number of days before
  // the 1st, etc.
  function previousRange(range) {
    const spanMs = new Date(range.to).getTime() - new Date(range.from).getTime();
    if (!(spanMs > 0)) return null;
    return {
      from: new Date(new Date(range.from).getTime() - spanMs).toISOString(),
      to: range.from,
    };
  }

  // ── Data loading ─────────────────────────────────────────────────────
  async function loadStatus() {
    const r = await fetch('/api/desk-lifecycle/status', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load sync status');
    return j;
  }

  async function loadSummary(range, q) {
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (q) params.set('q', q);
    const r = await fetch(`/api/desk-lifecycle/summary?${params.toString()}`, { credentials: 'include' });
    if (r.status === 401) throw new Error('Not logged in');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load ticket summary');
    return j;
  }

  // Session 27: best-effort — a failed/slow previous-period fetch should
  // never block or error out the main view, it just means no delta chips.
  async function loadPrevSummarySafe(range, q) {
    const prev = previousRange(range);
    if (!prev) return null;
    try { return await loadSummary(prev, q); } catch (e) { return null; }
  }

  async function triggerSync(btn, root) {
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    try {
      const r = await fetch('/api/admin/desk-lifecycle/sync-now', { method: 'POST', credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || ('HTTP ' + r.status));
      toastSafe('🎫 Sync started — this runs in the background and refreshes automatically', 'success', 4000);
      _wasSyncRunning = true;
      pollStatusOnce(root);
    } catch (e) {
      toastSafe('❌ ' + e.message, 'error', 5000);
      btn.disabled = false;
      btn.textContent = '↻ Sync Now';
    }
  }

  // ── Sync progress polling ───────────────────────────────────────────
  function stopPolling() {
    if (_pollHandle) { clearInterval(_pollHandle); _pollHandle = null; }
  }

  async function pollStatusOnce(root) {
    if (!document.body.contains(root)) { stopPolling(); return; }
    let status;
    try { status = await loadStatus(); } catch (e) { return; }
    renderBanner(root, status);
    if (status.configured && status.syncRunning) {
      _wasSyncRunning = true;
      if (!_pollHandle) _pollHandle = setInterval(() => pollStatusOnce(root), 2500);
    } else {
      stopPolling();
      if (_wasSyncRunning) {
        _wasSyncRunning = false;
        toastSafe('✅ Sync complete — refreshing results', 'success', 2500);
        window.openDeskLifecycleAdmin();
      }
    }
  }

  function notConfiguredCard() {
    return `
      <div class="tkt-card">
        <div class="tkt-card-title">Not configured</div>
        <div class="tkt-card-sub">
          Ticket lifecycle sync needs Zoho Desk API credentials that aren't set yet.
          Add <code>ZOHO_CLIENT_ID</code>, <code>ZOHO_CLIENT_SECRET</code>,
          <code>ZOHO_REFRESH_TOKEN</code> and <code>ZOHO_DESK_ORG_ID</code>
          in Railway env vars to enable it. Every department is synced
          automatically; set <code>ZOHO_DESK_DEPARTMENT_IDS</code> (comma-separated)
          only to restrict it to specific ones.
        </div>
      </div>`;
  }

  function statusBanner(status) {
    if (status.syncRunning) {
      const pct = status.syncProgressPct != null ? status.syncProgressPct : 0;
      return `
        <div class="tkt-banner tkt-banner-syncing">
          <div class="tkt-banner-main">
            <span class="tkt-banner-dot tkt-banner-dot-syncing"></span>
            <div style="flex:1 1 auto">
              <div class="tkt-banner-title">Syncing… ${pct}%</div>
              <div class="tkt-progress-track"><div class="tkt-progress-fill" style="width:${pct}%"></div></div>
              <div class="tkt-banner-sub">This refreshes automatically once it hits 100%.</div>
            </div>
          </div>
          <button type="button" class="tkt-btn tkt-btn-light tkt-sync-btn" disabled>↻ Syncing…</button>
        </div>`;
    }
    const cls = status.lastError ? 'tkt-banner-warning' : 'tkt-banner-ok';
    const title = status.lastError ? 'Last sync had an error' : 'Sync running';
    const ago = minutesAgo(status.lastSyncAt);
    const sub = status.lastError
      ? esc(status.lastError)
      : `Last synced ${ago ? `${ago} (${fmtDateTime(status.lastSyncAt)})` : fmtDateTime(status.lastSyncAt)} · syncs automatically every 20 min · ${status.ticketsTracked} tickets tracked · ${status.eventsTracked} agent-ticket links synced`;
    return `
      <div class="tkt-banner ${cls}">
        <div class="tkt-banner-main">
          <span class="tkt-banner-dot"></span>
          <div>
            <div class="tkt-banner-title">${title}</div>
            <div class="tkt-banner-sub">${sub}</div>
          </div>
        </div>
        <button type="button" class="tkt-btn tkt-btn-light tkt-sync-btn">↻ Sync Now</button>
      </div>`;
  }

  // Renders a {label: count} breakdown dict as a sorted, capped chip list.
  function breakdownChips(dict, cap) {
    const entries = Object.entries(dict || {}).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<div class="tkt-bd-empty">No data in range</div>';
    const shown = entries.slice(0, cap || 8);
    const rest = entries.length - shown.length;
    let html = '<div class="tkt-bd-chips">' + shown.map(([k, v]) =>
      `<span class="tkt-bd-chip">${esc(k)} <b>${v}</b></span>`
    ).join('') + '</div>';
    if (rest > 0) html += `<div class="tkt-bd-empty" style="margin-top:4px">+${rest} more</div>`;
    return html;
  }

  // ── Session 27: tooltip copy ─────────────────────────────────────────
  // One source of truth for "what does this number mean", grounded in
  // lib/desk-lifecycle.js's own field definitions (see its module doc
  // comment) rather than a paraphrase that could drift out of sync.
  // FCR/CSAT tips are built per-agent so they show that agent's actual
  // numerator/denominator, not just the abstract formula.
  function fmtPct(pct) { return (pct == null) ? '—' : `${pct}%`; }

  function metricTip(key, a) {
    switch (key) {
      case 'unique':
        return 'Unique tickets\n\nEvery ticket this agent appears in anywhere in its ownership history — even one hand-off counts, once. Counted by when the ticket was CREATED.';
      case 'solely':
        return 'Solely handled\n\nOf the Unique tickets: the ones this agent owned start to finish with no other individual ever touching it, and the ticket is now Closed.';
      case 'reassigned':
        return 'Reassigned\n\nTickets that arrived already in progress — a different person owned it immediately before this agent picked it up.';
      case 'transferred':
        return 'Transferred\n\nTickets this agent handed off to someone outside the T1 roster (a different team). See "Departments transferred to" below for where they went.';
      case 'handed_off':
        return 'Handed off (T1)\n\nTickets this agent handed directly to another monitored T1 agent — stayed inside the team, so it does NOT count as a cross-team Transfer. The receiving agent logs it as their own Reassigned.';
      case 'closed':
        return 'Closed\n\nTickets now Closed in Zoho Desk, closed within this date range — credited to whoever is the CURRENT owner, even if it passed through other hands first.';
      case 'handling':
        return 'Handling now\n\nTickets this agent currently owns that are still open. A live count — not limited to the selected date range.';
      case 'avg_handle':
        return 'Avg handle time\n\nAverage time from ticket creation to closing, across this agent\'s Closed tickets in range. Wall-clock hours (calendar time), not business hours — see FCR for the business-hours definition.';
      case 'fcr': {
        const total = a.fcr_total || 0, yes = a.fcr_yes || 0;
        if (!total) return 'First Contact Resolution (FCR)\n\nNo Closed tickets in this range yet.';
        return `First Contact Resolution (FCR)\n\n${yes} of ${total} closed tickets resolved within 24 business hours (Mon–Fri, 7am–7pm CST) with zero reopens.\n\n${yes} / ${total} = ${fmtPct(a.fcr_pct)}\n\nCredited to whoever currently owns the ticket, even after a transfer.`;
      }
      case 'csat': {
        const total = a.csat_total || 0, good = a.csat_good || 0;
        if (!total) return 'Customer Satisfaction (CSAT)\n\nNo survey responses in this range yet.';
        return `Customer Satisfaction (CSAT)\n\n${good} of ${total} survey responses were rated "Good".\n\n${good} / ${total} = ${fmtPct(a.csat_pct)}\n\nRatings: Good / Okay / Bad. Counted by when the survey was submitted, not when the ticket closed.`;
      }
      default: return '';
    }
  }

  function breakdownTip(key) {
    switch (key) {
      case 'channel': return 'Channel\n\nHow the ticket came in — Phone, Email, Chat, and so on.';
      case 'module': return 'Adit App Module\n\nWhich Adit product area the ticket relates to (Adit Pay, Adit Voice, Adit AI Agent, EHR/PMS integrations, etc).';
      case 'category': return 'Category\n\nZoho Desk\'s own ticket category field.';
      case 'classification': return 'Classification\n\nZoho Desk\'s own ticket classification field.';
      case 'departments': return 'Departments transferred to\n\nWhere this agent\'s Transferred tickets ended up — the team/role shown in Zoho\'s owner-change log at the point it left T1.';
      default: return '';
    }
  }

  function agentBreakdownPanel(a) {
    return `
      <div>
        <div class="tkt-bd-group-title" data-tip="${esc(breakdownTip('channel'))}">Channel</div>
        ${breakdownChips(a.channel)}
      </div>
      <div>
        <div class="tkt-bd-group-title" data-tip="${esc(breakdownTip('module'))}">Adit App Module</div>
        ${breakdownChips(a.module)}
      </div>
      <div>
        <div class="tkt-bd-group-title" data-tip="${esc(breakdownTip('category'))}">Category</div>
        ${breakdownChips(a.category)}
      </div>
      <div>
        <div class="tkt-bd-group-title" data-tip="${esc(breakdownTip('classification'))}">Classification</div>
        ${breakdownChips(a.classification)}
      </div>
      <div>
        <div class="tkt-bd-group-title" data-tip="${esc(breakdownTip('departments'))}">Departments transferred to</div>
        ${breakdownChips(a.departments_transferred)}
      </div>`;
  }

  function pillHtml(cls, n, label, tipKey, a) {
    const tip = metricTip(tipKey, a);
    return `<div class="tkt-pill${cls ? ' ' + cls : ''}" data-tip="${esc(tip)}">
        <div class="tkt-pill-n">${n}</div><div class="tkt-pill-l">${esc(label)}</div>
      </div>`;
  }

  function agentCard(a) {
    const displayName = esc(a.pseudo || a.full_name || a.email);
    const fcr = a.fcr_pct != null ? `${a.fcr_pct}%` : (a.fcr_total ? '0%' : '—');
    const csat = a.csat_pct != null ? `${a.csat_pct}%` : (a.csat_total ? '0%' : '—');
    const avgHandle = a.avg_handle_hours != null ? `${a.avg_handle_hours}h` : '—';
    const isExpanded = _expanded.has(a.email);

    const flowPills = [
      pillHtml('', a.unique_tickets || 0, 'Unique', 'unique', a),
      pillHtml('tkt-pill-good', a.solely_handled || 0, 'Solely handled', 'solely', a),
      pillHtml('tkt-pill-warn', a.reassigned || 0, 'Reassigned', 'reassigned', a),
      pillHtml('tkt-pill-warn', a.transferred || 0, 'Transferred', 'transferred', a),
      pillHtml('', a.handed_off_internal || 0, 'Handed off (T1)', 'handed_off', a),
    ].join('');
    const outcomePills = [
      pillHtml('', a.closed_count || 0, 'Closed', 'closed', a),
      pillHtml('tkt-pill-live', a.currently_handling || 0, 'Handling now', 'handling', a),
      pillHtml('', avgHandle, 'Avg handle', 'avg_handle', a),
      pillHtml('', fcr, `FCR${a.fcr_total ? ` (${a.fcr_total})` : ''}`, 'fcr', a),
      pillHtml('', csat, `CSAT${a.csat_total ? ` (${a.csat_total})` : ''}`, 'csat', a),
    ].join('');

    // Session 28: stacked full-width pill rows replace the old side-by-side
    // split (two ~250px-min-width flex halves plus a vertical divider) --
    // that layout left a lot of dead space on wide screens whenever a
    // group's pills didn't fill their half evenly. Each group now spans
    // the full card width in its own dense auto-fill grid.
    return `
      <div class="tkt-agent-card${isExpanded ? ' tkt-expanded' : ''}" data-email="${esc(a.email)}">
        <div class="tkt-agent-head">
          <div class="tkt-agent-id">
            <div class="tkt-agent-name">${displayName}</div>
            <div class="tkt-agent-email">${esc(a.email)}</div>
          </div>
          <button type="button" class="tkt-expand-btn">${isExpanded ? 'Hide breakdown ▲' : 'Channel / module / category ▾'}</button>
        </div>
        <div class="tkt-stat-groups">
          <div class="tkt-stat-group">
            <div class="tkt-stat-group-label">Ticket flow</div>
            <div class="tkt-stat-subgrid">${flowPills}</div>
          </div>
          <div class="tkt-stat-group">
            <div class="tkt-stat-group-label">Outcomes</div>
            <div class="tkt-stat-subgrid">${outcomePills}</div>
          </div>
        </div>
        <div class="tkt-agent-breakdown">${agentBreakdownPanel(a)}</div>
      </div>`;
  }

  // Session 27: pooled team totals across whichever agents are currently
  // rendered (post Find-agent filter). FCR/CSAT are pooled sums (Σyes/Σtotal),
  // not an average of percentages -- correct when agents have very
  // different ticket volumes, same convention as each agent's own %.
  function poolTeamTotals(agents) {
    const t = {
      count: agents.length, unique: 0, closed: 0, handling: 0,
      fcrYes: 0, fcrTotal: 0, csatGood: 0, csatTotal: 0,
    };
    for (const a of agents) {
      t.unique += a.unique_tickets || 0;
      t.closed += a.closed_count || 0;
      t.handling += a.currently_handling || 0;
      t.fcrYes += a.fcr_yes || 0;
      t.fcrTotal += a.fcr_total || 0;
      t.csatGood += a.csat_good || 0;
      t.csatTotal += a.csat_total || 0;
    }
    t.fcrPct = t.fcrTotal ? Math.round((t.fcrYes / t.fcrTotal) * 1000) / 10 : null;
    t.csatPct = t.csatTotal ? Math.round((t.csatGood / t.csatTotal) * 1000) / 10 : null;
    return t;
  }

  function deltaChip(curr, prev, opts) {
    opts = opts || {};
    if (prev == null || curr == null) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < (opts.epsilon || 0.05)) return `<span class="tkt-delta tkt-delta-flat">flat</span>`;
    const up = diff > 0;
    const good = opts.higherIsBetter == null ? null : (up === opts.higherIsBetter);
    const cls = good == null ? '' : (good ? ' tkt-delta-good' : ' tkt-delta-bad');
    const sign = up ? '▲' : '▼';
    const magnitude = opts.pct ? `${Math.abs(Math.round(diff * 10) / 10)}pt` : Math.abs(Math.round(diff));
    return `<span class="tkt-delta${cls}">${sign} ${magnitude}</span>`;
  }

  function teamSummaryHtml(agents, prevAgents) {
    const t = poolTeamTotals(agents);
    const prevT = prevAgents ? poolTeamTotals(prevAgents) : null;
    const cells = [
      {
        n: t.count, l: 'Agents shown', tip: 'Agents shown\n\nHow many monitored T1 agents match the current filters (Find agent + Customer search).',
        delta: '',
      },
      {
        n: t.unique, l: 'Total unique tickets', tip: 'Total unique tickets\n\nSum of every shown agent\'s Unique tickets. A ticket touched by two shown agents is counted once for each of them, so this can exceed the ticket count in Zoho.',
        delta: prevT ? deltaChip(t.unique, prevT.unique, { higherIsBetter: null }) : '',
      },
      {
        n: t.closed, l: 'Total closed', tip: 'Total closed\n\nSum of every shown agent\'s Closed count for this range.',
        delta: prevT ? deltaChip(t.closed, prevT.closed, { higherIsBetter: null }) : '',
      },
      {
        n: t.handling, l: 'Handling now', tip: 'Handling now\n\nSum of every shown agent\'s currently-open ticket count. Live, not windowed by date.',
        delta: '',
      },
      {
        n: fmtPct(t.fcrPct), l: `Team FCR${t.fcrTotal ? ` (${t.fcrYes}/${t.fcrTotal})` : ''}`,
        tip: t.fcrTotal ? `Team FCR\n\n${t.fcrYes} of ${t.fcrTotal} closed tickets across shown agents resolved within 24 business hours with zero reopens.\n\n${t.fcrYes} / ${t.fcrTotal} = ${fmtPct(t.fcrPct)}` : 'Team FCR\n\nNo closed tickets in this range yet.',
        delta: (prevT && prevT.fcrPct != null && t.fcrPct != null) ? deltaChip(t.fcrPct, prevT.fcrPct, { higherIsBetter: true, pct: true }) : '',
      },
      {
        n: fmtPct(t.csatPct), l: `Team CSAT${t.csatTotal ? ` (${t.csatGood}/${t.csatTotal})` : ''}`,
        tip: t.csatTotal ? `Team CSAT\n\n${t.csatGood} of ${t.csatTotal} survey responses across shown agents were rated "Good".\n\n${t.csatGood} / ${t.csatTotal} = ${fmtPct(t.csatPct)}` : 'Team CSAT\n\nNo survey responses in this range yet.',
        delta: (prevT && prevT.csatPct != null && t.csatPct != null) ? deltaChip(t.csatPct, prevT.csatPct, { higherIsBetter: true, pct: true }) : '',
      },
    ];
    return `
      <div class="tkt-team-summary">
        ${cells.map(c => `
          <div class="tkt-team-cell" data-tip="${esc(c.tip)}">
            <div class="tkt-team-n">${c.n}${c.delta ? ` ${c.delta}` : ''}</div>
            <div class="tkt-team-l">${esc(c.l)}</div>
          </div>`).join('')}
        ${prevT ? '' : '<div class="tkt-team-note">Deltas need a same-length prior period — not enough history for this range yet.</div>'}
      </div>`;
  }

  function summaryList(agents) {
    if (!agents.length) {
      return `<div class="tkt-empty">${_agentQuery ? 'No agent name or email matches "' + esc(_agentQuery) + '".' : "No monitored agents with an email on file yet — add emails in the Agents admin page to see their ticket stats here."}</div>`;
    }
    const opt = SORT_OPTIONS.find(o => o.key === _sortKey) || SORT_OPTIONS[0];
    const sorted = [...agents].sort((a, b) => {
      if (!opt.fn) return String(a.pseudo || a.full_name || a.email).localeCompare(String(b.pseudo || b.full_name || b.email));
      return opt.fn(b) - opt.fn(a);
    });
    const anyExpanded = sorted.some(a => _expanded.has(a.email));
    const toolRow = `
      <div class="tkt-sort-opts">
        <span class="tkt-sort-label">Sort by</span>
        <select class="tkt-sort-select">
          ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${o.key === _sortKey ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        <button type="button" class="tkt-btn tkt-btn-light tkt-expand-all-btn">${anyExpanded ? 'Collapse all' : 'Expand all'}</button>
      </div>`;
    return toolRow + sorted.map(agentCard).join('');
  }

  // ── Filter bar ───────────────────────────────────────────────────────
  function filterBarHtml() {
    const presets = buildPresets();
    const groups = {};
    presets.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
    const groupOrder = ['Rolling', 'Calendar', 'Custom'];
    const selectHtml = `
      <select class="tkt-select tkt-preset-select">
        ${groupOrder.map(g => `<optgroup label="${esc(g)}">${(groups[g] || []).map(p =>
          `<option value="${p.key}" ${p.key === _selectedPreset ? 'selected' : ''}>${esc(p.label)}</option>`
        ).join('')}</optgroup>`).join('')}
      </select>`;
    const showCustom = _selectedPreset === 'custom';
    // Toggled via a class (not an inline style) so it can't lose a
    // specificity fight with this file's blanket `!important` convention
    // -- an inline `style="display:none"` was previously being overridden
    // by `.tkt-date-inputs { display:flex !important }`, so the custom
    // date-range picker rendered full-size on EVERY preset, not just
    // "Custom range…", which is what was eating all the space at the top
    // of the page.
    const customHtml = `
      <div class="tkt-date-inputs${showCustom ? ' tkt-date-inputs-open' : ''}">
        <div class="tkt-date-range">
          <input type="date" class="tkt-date-from" value="${esc(_customFrom || '')}">
          <span class="tkt-date-sep">to</span>
          <input type="date" class="tkt-date-to" value="${esc(_customTo || '')}">
        </div>
        <button type="button" class="tkt-btn tkt-btn-light tkt-date-apply">Apply</button>
      </div>`;
    return `
      <div class="tkt-filterbar">
        <div class="tkt-filter-group">
          <span class="tkt-filter-label">Period</span>
          ${selectHtml}
          ${customHtml}
        </div>
        <div class="tkt-filter-group tkt-filter-search">
          <span class="tkt-filter-label">Customer</span>
          <input type="search" class="tkt-search-input" placeholder="Company, contact name, or email…" value="${esc(_customerQuery || '')}">
        </div>
        <div class="tkt-filter-group tkt-filter-search">
          <span class="tkt-filter-label">Find agent</span>
          <input type="search" class="tkt-agent-search-input" placeholder="Filter the cards below…" value="${esc(_agentQuery || '')}">
        </div>
        <div class="tkt-filter-group">
          <span class="tkt-filter-label">&nbsp;</span>
          <button type="button" class="tkt-btn tkt-btn-light tkt-export-btn">Export CSV</button>
        </div>
      </div>`;
  }

  function wireFilterBar(root, status) {
    const sel = $('.tkt-preset-select', root);
    if (sel) sel.addEventListener('change', () => {
      _selectedPreset = sel.value;
      const customWrap = $('.tkt-date-inputs', root);
      if (customWrap) customWrap.classList.toggle('tkt-date-inputs-open', _selectedPreset === 'custom');
      if (_selectedPreset !== 'custom' || (_customFrom && _customTo)) refreshSummary(root, status);
    });
    const applyBtn = $('.tkt-date-apply', root);
    if (applyBtn) applyBtn.addEventListener('click', () => {
      const f = $('.tkt-date-from', root);
      const t = $('.tkt-date-to', root);
      if (!f || !t || !f.value || !t.value) { toastSafe('Pick both a start and end date', 'error', 3000); return; }
      if (f.value > t.value) { toastSafe('Start date must be before end date', 'error', 3000); return; }
      _customFrom = f.value; _customTo = t.value;
      refreshSummary(root, status);
    });
    const search = $('.tkt-search-input', root);
    if (search) search.addEventListener('input', () => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        _customerQuery = search.value.trim();
        refreshSummary(root, status);
      }, 350);
    });
    const agentSearch = $('.tkt-agent-search-input', root);
    if (agentSearch) agentSearch.addEventListener('input', () => {
      _agentQuery = agentSearch.value.trim();
      renderResults(root, status, _lastSummaryData, _lastPrevSummaryData);
    });
    const exportBtn = $('.tkt-export-btn', root);
    if (exportBtn) exportBtn.addEventListener('click', () => {
      const range = currentRange();
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (_customerQuery) params.set('q', _customerQuery);
      window.open(`/api/desk-lifecycle/summary/export?${params.toString()}`, '_blank');
    });
  }

  // Client-side "Find agent" match — name or email, case-insensitive.
  function matchesAgentQuery(a) {
    if (!_agentQuery) return true;
    const needle = _agentQuery.toLowerCase();
    const hay = `${a.pseudo || ''} ${a.full_name || ''} ${a.email || ''}`.toLowerCase();
    return hay.includes(needle);
  }

  // Session 28: quick-filter chips, AND'd together with each other and
  // with the Find-agent text match. `teamFcrPct` is the pooled FCR% of
  // whichever agents already passed the Find-agent filter, so "Needs
  // attention" is always relative to the currently-shown roster, not a
  // stale global average.
  function matchesQuickFilters(a, teamFcrPct) {
    for (const key of _quickFilters) {
      if (key === 'attention') {
        const total = a.fcr_total || 0;
        if (total < 3 || teamFcrPct == null || a.fcr_pct == null || a.fcr_pct >= teamFcrPct) return false;
      } else if (key === 'reassign') {
        const unique = a.unique_tickets || 0;
        if (unique < 4 || ((a.reassigned || 0) / unique) < 0.25) return false;
      } else if (key === 'handling') {
        if (!(a.currently_handling > 0)) return false;
      }
    }
    return true;
  }

  function quickFiltersHtml() {
    return `
      <div class="tkt-quick-filters">
        <span class="tkt-quick-filters-label">Quick filters</span>
        ${QUICK_FILTERS.map(f => `
          <button type="button" class="tkt-chip-btn${_quickFilters.has(f.key) ? ' tkt-chip-btn-active' : ''}" data-quick-filter="${f.key}" data-tip="${esc(f.tip)}">${esc(f.label)}</button>
        `).join('')}
        ${_quickFilters.size ? '<button type="button" class="tkt-chip-btn tkt-chip-btn-clear" data-quick-filter-clear="1">Clear</button>' : ''}
      </div>`;
  }

  // ── Results ──────────────────────────────────────────────────────────
  // Session 27: keep the last-loaded summary/prev-summary around at
  // module scope so the client-side "Find agent" filter can re-render
  // without a network round-trip.
  let _lastSummaryData = null;
  let _lastPrevSummaryData = null;

  function resultsCardHtml(summaryData, prevSummaryData) {
    const allAgents = summaryData.agents || [];
    // Find-agent (text) match first -- this is the baseline "Needs
    // attention" measures each agent's FCR against, so toggling a quick
    // filter never shifts the goalposts it's comparing to.
    const agentMatched = allAgents.filter(matchesAgentQuery);
    const baseTotals = poolTeamTotals(agentMatched);
    const shownAgents = agentMatched.filter(a => matchesQuickFilters(a, baseTotals.fcrPct));
    const count = shownAgents.length;
    const prevAgents = prevSummaryData ? prevSummaryData.agents || [] : null;
    return `
      <div class="tkt-card">
        <div class="tkt-card-title">Per-agent summary</div>
        <div class="tkt-card-sub">Range: ${fmtDateTime(summaryData.from)} → ${fmtDateTime(summaryData.to)}${_customerQuery ? ` · Filtered by "${esc(_customerQuery)}"` : ''} · ${count} of ${allAgents.length} agent${allAgents.length === 1 ? '' : 's'} shown<br>Unique/solely-handled/reassigned and the breakdowns below are windowed by when the ticket was created; Closed/Avg handle/FCR are windowed by when it closed; Handling now is live, not windowed.</div>
        <div class="tkt-note">CSAT% now reflects real per-ticket survey ratings (Good/Okay/Bad) from Zoho Analytics, filtered by when the customer submitted the survey. NPS% still isn't shown -- it's an account-level relationship survey (CSM team), not tied to individual tickets or T1 agents. Hover any number for what it means.</div>
        ${teamSummaryHtml(shownAgents, prevAgents)}
        ${quickFiltersHtml()}
        ${summaryList(shownAgents)}
      </div>`;
  }

  function wireResults(root, status, summaryData, prevSummaryData) {
    const sortSel = $('.tkt-sort-select', root);
    if (sortSel) sortSel.addEventListener('change', () => {
      _sortKey = sortSel.value;
      renderResults(root, status, summaryData, prevSummaryData);
    });
    const expandAllBtn = $('.tkt-expand-all-btn', root);
    if (expandAllBtn) expandAllBtn.addEventListener('click', () => {
      const shown = (summaryData.agents || []).filter(matchesAgentQuery);
      const anyExpanded = shown.some(a => _expanded.has(a.email));
      if (anyExpanded) shown.forEach(a => _expanded.delete(a.email));
      else shown.forEach(a => _expanded.add(a.email));
      renderResults(root, status, summaryData, prevSummaryData);
    });
    root.querySelectorAll('.tkt-agent-card').forEach((card) => {
      const btn = $('.tkt-expand-btn', card);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const email = card.dataset.email;
        if (_expanded.has(email)) _expanded.delete(email); else _expanded.add(email);
        renderResults(root, status, summaryData, prevSummaryData);
      });
    });
    root.querySelectorAll('[data-quick-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.quickFilter;
        if (_quickFilters.has(key)) _quickFilters.delete(key); else _quickFilters.add(key);
        renderResults(root, status, summaryData, prevSummaryData);
      });
    });
    const clearBtn = $('[data-quick-filter-clear]', root);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      _quickFilters.clear();
      renderResults(root, status, summaryData, prevSummaryData);
    });
    wireTooltips(root);
  }

  function renderResults(root, status, summaryData, prevSummaryData) {
    const host = $('.tkt-results-host', root);
    if (!host) return;
    _lastSummaryData = summaryData;
    _lastPrevSummaryData = prevSummaryData;
    host.innerHTML = resultsCardHtml(summaryData, prevSummaryData);
    wireResults(root, status, summaryData, prevSummaryData);
  }

  async function refreshSummary(root, status) {
    const host = $('.tkt-results-host', root);
    if (host) host.style.opacity = '0.55';
    try {
      const range = currentRange();
      const [summaryData, prevSummaryData] = await Promise.all([
        loadSummary(range, _customerQuery),
        loadPrevSummarySafe(range, _customerQuery),
      ]);
      renderResults(root, status, summaryData, prevSummaryData);
    } catch (e) {
      toastSafe('❌ ' + e.message, 'error', 4000);
    } finally {
      if (host) host.style.opacity = '';
    }
  }

  // ── Banner ───────────────────────────────────────────────────────────
  function wireBanner(root) {
    const syncBtn = $('.tkt-sync-btn', root);
    if (syncBtn && !syncBtn.disabled) syncBtn.addEventListener('click', () => triggerSync(syncBtn, root));
  }

  function renderBanner(root, status) {
    const host = $('.tkt-banner-host', root);
    if (!host) return;
    host.innerHTML = status.configured ? statusBanner(status) : notConfiguredCard();
    wireBanner(root);
  }

  // ── Session 27: hover/focus tooltip system ──────────────────────────
  // One shared floating element per page, positioned via JS (not pure
  // CSS `content: attr()`) so it can escape .tkt-agent-card's
  // overflow:hidden (needed for the card's rounded corners) and stay
  // clamped inside the viewport instead of overflowing off-screen near
  // the page edges. Content is set via textContent (never innerHTML),
  // and `white-space:pre-line` in the CSS turns the \n\n in the tip
  // strings above into paragraph breaks.
  let _tipEl = null;
  function ensureTipEl() {
    if (_tipEl && document.body.contains(_tipEl)) return _tipEl;
    _tipEl = document.createElement('div');
    _tipEl.className = 'tkt-tooltip';
    _tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(_tipEl);
    return _tipEl;
  }
  function showTip(anchor) {
    const text = anchor.getAttribute('data-tip');
    if (!text) return;
    const tip = ensureTipEl();
    tip.textContent = text;
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.classList.add('tkt-tooltip-visible');
    const ar = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let top = ar.top - tr.height - 10;
    let flipped = false;
    if (top < 8) { top = ar.bottom + 10; flipped = true; }
    let left = ar.left + ar.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.classList.toggle('tkt-tooltip-below', flipped);
  }
  function hideTip() {
    if (_tipEl) _tipEl.classList.remove('tkt-tooltip-visible');
  }
  function wireTooltips(root) {
    (root || document).querySelectorAll('[data-tip]').forEach((el) => {
      if (el.__tktTipWired) return;
      el.__tktTipWired = true;
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('focus', () => showTip(el));
      el.addEventListener('blur', hideTip);
      el.addEventListener('touchstart', () => showTip(el), { passive: true });
    });
  }
  if (!window.__tktTooltipScrollWired) {
    window.__tktTooltipScrollWired = true;
    window.addEventListener('scroll', hideTip, { passive: true, capture: true });
    window.addEventListener('resize', hideTip, { passive: true });
  }

  // ── Top-level render ─────────────────────────────────────────────────
  function render(root, status, summaryData, prevSummaryData) {
    _lastSummaryData = summaryData;
    _lastPrevSummaryData = prevSummaryData;
    root.innerHTML = `
      <div class="tkt-wrap">
        <div class="tkt-sticky-top">
          <div class="tkt-header">
            <div>
              <div class="tkt-h1">Ticket Lifecycle</div>
              <div class="tkt-h1-sub">Per-agent, per-channel ticket stats sourced from Zoho Desk — replaces the manual lifecycle report export.</div>
            </div>
          </div>

          ${status.configured ? filterBarHtml() : ''}

          <div class="tkt-banner-host">${status.configured ? statusBanner(status) : notConfiguredCard()}</div>
        </div>

        <div class="tkt-results-host">${status.configured ? resultsCardHtml(summaryData, prevSummaryData) : ''}</div>
      </div>`;

    wireBanner(root);
    if (status.configured) {
      wireFilterBar(root, status);
      wireResults(root, status, summaryData, prevSummaryData);
    }
  }

  window.openDeskLifecycleAdmin = async function () {
    const root = document.getElementById('desk-lifecycle-root');
    if (!root) return;
    stopPolling();
    root.innerHTML = '<div class="tkt-loading"><div class="tkt-spinner"></div>Loading ticket lifecycle data…</div>';
    try {
      const status = await loadStatus();
      const range = currentRange();
      const [summaryData, prevSummaryData] = status.configured
        ? await Promise.all([loadSummary(range, _customerQuery), loadPrevSummarySafe(range, _customerQuery)])
        : [{ agents: [] }, null];
      render(root, status, summaryData, prevSummaryData);
      if (status.configured && status.syncRunning) {
        _wasSyncRunning = true;
        if (!_pollHandle) _pollHandle = setInterval(() => pollStatusOnce(root), 2500);
      }
    } catch (e) {
      root.innerHTML = `<div class="tkt-error">❌ ${esc(e.message)}</div>`;
    }
  };
})();
