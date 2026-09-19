/**
 * Ticket Lifecycle Admin — Session 20 (+ Session 21 filters/progress)
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
    const sub = status.lastError
      ? esc(status.lastError)
      : `Last synced ${fmtDateTime(status.lastSyncAt)} · ${status.ticketsTracked} tickets tracked · ${status.eventsTracked} agent-ticket links synced`;
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

  function agentBreakdownPanel(a) {
    return `
      <div>
        <div class="tkt-bd-group-title">Channel</div>
        ${breakdownChips(a.channel)}
      </div>
      <div>
        <div class="tkt-bd-group-title">Adit App Module</div>
        ${breakdownChips(a.module)}
      </div>
      <div>
        <div class="tkt-bd-group-title">Category</div>
        ${breakdownChips(a.category)}
      </div>
      <div>
        <div class="tkt-bd-group-title">Classification</div>
        ${breakdownChips(a.classification)}
      </div>`;
  }

  function agentCard(a) {
    const displayName = esc(a.pseudo || a.full_name || a.email);
    const fcr = a.fcr_pct != null ? `${a.fcr_pct}%` : (a.fcr_total ? '0%' : '—');
    const csat = a.csat_pct != null ? `${a.csat_pct}%` : (a.csat_total ? '0%' : '—');
    const avgHandle = a.avg_handle_hours != null ? `${a.avg_handle_hours}h` : '—';
    const isExpanded = _expanded.has(a.email);
    return `
      <div class="tkt-agent-card${isExpanded ? ' tkt-expanded' : ''}" data-email="${esc(a.email)}">
        <div class="tkt-agent-head">
          <div class="tkt-agent-id">
            <div class="tkt-agent-name">${displayName}</div>
            <div class="tkt-agent-email">${esc(a.email)}</div>
          </div>
          <div class="tkt-stat-grid">
            <div class="tkt-pill"><div class="tkt-pill-n">${a.unique_tickets || 0}</div><div class="tkt-pill-l">Unique</div></div>
            <div class="tkt-pill tkt-pill-good"><div class="tkt-pill-n">${a.solely_handled || 0}</div><div class="tkt-pill-l">Solely handled</div></div>
            <div class="tkt-pill tkt-pill-warn"><div class="tkt-pill-n">${a.reassigned || 0}</div><div class="tkt-pill-l">Reassigned</div></div>
            <div class="tkt-pill"><div class="tkt-pill-n">${a.closed_count || 0}</div><div class="tkt-pill-l">Closed</div></div>
            <div class="tkt-pill tkt-pill-live"><div class="tkt-pill-n">${a.currently_handling || 0}</div><div class="tkt-pill-l">Handling now</div></div>
            <div class="tkt-pill"><div class="tkt-pill-n">${avgHandle}</div><div class="tkt-pill-l">Avg handle</div></div>
            <div class="tkt-pill"><div class="tkt-pill-n">${fcr}</div><div class="tkt-pill-l">FCR${a.fcr_total ? ` (${a.fcr_total})` : ''}</div></div>
            <div class="tkt-pill"><div class="tkt-pill-n">${csat}</div><div class="tkt-pill-l">CSAT${a.csat_total ? ` (${a.csat_total})` : ''}</div></div>
          </div>
          <button type="button" class="tkt-expand-btn">${isExpanded ? 'Hide breakdown ▲' : 'Channel / module / category ▾'}</button>
        </div>
        <div class="tkt-agent-breakdown">${agentBreakdownPanel(a)}</div>
      </div>`;
  }

  function summaryList(agents) {
    if (!agents.length) {
      return `<div class="tkt-empty">No T1 roster agents with an email on file yet — add emails in Roster to see their ticket stats here.</div>`;
    }
    const opt = SORT_OPTIONS.find(o => o.key === _sortKey) || SORT_OPTIONS[0];
    const sorted = [...agents].sort((a, b) => {
      if (!opt.fn) return String(a.pseudo || a.full_name || a.email).localeCompare(String(b.pseudo || b.full_name || b.email));
      return opt.fn(b) - opt.fn(a);
    });
    const sortRow = `
      <div class="tkt-sort-opts">
        <span class="tkt-sort-label">Sort by</span>
        <select class="tkt-sort-select">
          ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${o.key === _sortKey ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>`;
    return sortRow + sorted.map(agentCard).join('');
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
    const customHtml = `
      <div class="tkt-date-inputs"${showCustom ? '' : ' style="display:none"'}>
        <input type="date" class="tkt-date-from" value="${esc(_customFrom || '')}">
        <span class="tkt-date-sep">to</span>
        <input type="date" class="tkt-date-to" value="${esc(_customTo || '')}">
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
      if (customWrap) customWrap.style.display = (_selectedPreset === 'custom') ? '' : 'none';
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
    const exportBtn = $('.tkt-export-btn', root);
    if (exportBtn) exportBtn.addEventListener('click', () => {
      const range = currentRange();
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (_customerQuery) params.set('q', _customerQuery);
      window.open(`/api/desk-lifecycle/summary/export?${params.toString()}`, '_blank');
    });
  }

  // ── Results ──────────────────────────────────────────────────────────
  function resultsCardHtml(summaryData) {
    const count = (summaryData.agents || []).length;
    return `
      <div class="tkt-card">
        <div class="tkt-card-title">Per-agent summary</div>
        <div class="tkt-card-sub">Range: ${fmtDateTime(summaryData.from)} → ${fmtDateTime(summaryData.to)}${_customerQuery ? ` · Filtered by "${esc(_customerQuery)}"` : ''} · ${count} agent${count === 1 ? '' : 's'} shown<br>Unique/solely-handled/reassigned and the breakdowns below are windowed by when the ticket was created; Closed/Avg handle/FCR are windowed by when it closed; Handling now is live, not windowed.</div>
        <div class="tkt-note">CSAT% now reflects real per-ticket survey ratings (Good/Okay/Bad) from Zoho Analytics, filtered by when the customer submitted the survey. NPS% still isn't shown -- it's an account-level relationship survey (CSM team), not tied to individual tickets or T1 agents.</div>
        ${summaryList(summaryData.agents || [])}
      </div>`;
  }

  function wireResults(root, status, summaryData) {
    const sortSel = $('.tkt-sort-select', root);
    if (sortSel) sortSel.addEventListener('change', () => {
      _sortKey = sortSel.value;
      renderResults(root, status, summaryData);
    });
    root.querySelectorAll('.tkt-agent-card').forEach((card) => {
      const btn = $('.tkt-expand-btn', card);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const email = card.dataset.email;
        if (_expanded.has(email)) _expanded.delete(email); else _expanded.add(email);
        renderResults(root, status, summaryData);
      });
    });
  }

  function renderResults(root, status, summaryData) {
    const host = $('.tkt-results-host', root);
    if (!host) return;
    host.innerHTML = resultsCardHtml(summaryData);
    wireResults(root, status, summaryData);
  }

  async function refreshSummary(root, status) {
    const host = $('.tkt-results-host', root);
    if (host) host.style.opacity = '0.55';
    try {
      const summaryData = await loadSummary(currentRange(), _customerQuery);
      renderResults(root, status, summaryData);
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

  // ── Top-level render ─────────────────────────────────────────────────
  function render(root, status, summaryData) {
    root.innerHTML = `
      <div class="tkt-wrap">
        <div class="tkt-header">
          <div>
            <div class="tkt-h1">Ticket Lifecycle</div>
            <div class="tkt-h1-sub">Per-agent, per-channel ticket stats sourced from Zoho Desk — replaces the manual lifecycle report export.</div>
          </div>
        </div>

        ${status.configured ? filterBarHtml() : ''}

        <div class="tkt-banner-host">${status.configured ? statusBanner(status) : notConfiguredCard()}</div>

        <div class="tkt-results-host">${status.configured ? resultsCardHtml(summaryData) : ''}</div>
      </div>`;

    wireBanner(root);
    if (status.configured) {
      wireFilterBar(root, status);
      wireResults(root, status, summaryData);
    }
  }

  window.openDeskLifecycleAdmin = async function () {
    const root = document.getElementById('desk-lifecycle-root');
    if (!root) return;
    stopPolling();
    root.innerHTML = '<div class="tkt-loading"><div class="tkt-spinner"></div>Loading ticket lifecycle data…</div>';
    try {
      const status = await loadStatus();
      const summaryData = status.configured ? await loadSummary(currentRange(), _customerQuery) : { agents: [] };
      render(root, status, summaryData);
      if (status.configured && status.syncRunning) {
        _wasSyncRunning = true;
        if (!_pollHandle) _pollHandle = setInterval(() => pollStatusOnce(root), 2500);
      }
    } catch (e) {
      root.innerHTML = `<div class="tkt-error">❌ ${esc(e.message)}</div>`;
    }
  };
})();
