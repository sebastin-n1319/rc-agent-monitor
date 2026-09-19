/**
 * Ticket Lifecycle Admin — Session 20
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

  const RANGE_PRESETS = [
    { label: '7 days',  days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
  ];
  let _selectedDays = 30;
  let _sortKey = 'activity';
  const _expanded = new Set(); // emails whose breakdown panel is open, survives re-sorts within a render

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

  function rangeISO(days) {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  async function loadStatus() {
    const r = await fetch('/api/desk-lifecycle/status', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load sync status');
    return j;
  }

  async function loadSummary(days) {
    const { from, to } = rangeISO(days);
    const r = await fetch(`/api/desk-lifecycle/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include' });
    if (r.status === 401) throw new Error('Not logged in');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load ticket summary');
    return j;
  }

  async function triggerSync(btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    try {
      const r = await fetch('/api/admin/desk-lifecycle/sync-now', { method: 'POST', credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || ('HTTP ' + r.status));
      toastSafe('🎫 Sync started — this runs in the background, refresh in a minute', 'success', 4000);
    } catch (e) {
      toastSafe('❌ ' + e.message, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '↻ Sync Now';
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

  function render(root, status, summaryData) {
    root.innerHTML = `
      <div class="tkt-wrap">
        <div class="tkt-header">
          <div>
            <div class="tkt-h1">Ticket Lifecycle</div>
            <div class="tkt-h1-sub">Per-agent, per-channel ticket stats sourced from Zoho Desk — replaces the manual lifecycle report export.</div>
          </div>
          <div class="tkt-range-opts">
            ${RANGE_PRESETS.map(p => `<button type="button" class="tkt-range-btn ${p.days === _selectedDays ? 'tkt-range-selected' : ''}" data-days="${p.days}">${p.label}</button>`).join('')}
          </div>
        </div>

        ${status.configured ? statusBanner(status) : notConfiguredCard()}

        ${status.configured ? `
        <div class="tkt-card">
          <div class="tkt-card-title">Per-agent summary</div>
          <div class="tkt-card-sub">Range: ${fmtDateTime(summaryData.from)} → ${fmtDateTime(summaryData.to)} · Unique/solely-handled/reassigned and the breakdowns below are windowed by when the ticket was created; Closed/Avg handle/FCR are windowed by when it closed; Handling now is live, not windowed.</div>
          <div class="tkt-note">CSAT% now reflects real per-ticket survey ratings (Good/Okay/Bad) from Zoho Analytics, filtered by when the customer submitted the survey. NPS% still isn't shown -- it's an account-level relationship survey (CSM team), not tied to individual tickets or T1 agents.</div>
          ${summaryList(summaryData.agents || [])}
        </div>` : ''}
      </div>`;

    root.querySelectorAll('.tkt-range-btn').forEach((b) => {
      b.addEventListener('click', () => { _selectedDays = parseInt(b.dataset.days, 10); window.openDeskLifecycleAdmin(); });
    });
    const syncBtn = $('.tkt-sync-btn', root);
    if (syncBtn) syncBtn.addEventListener('click', () => triggerSync(syncBtn));
    const sortSel = $('.tkt-sort-select', root);
    if (sortSel) sortSel.addEventListener('change', () => {
      _sortKey = sortSel.value;
      render(root, status, summaryData);
    });
    root.querySelectorAll('.tkt-agent-card').forEach((card) => {
      const btn = $('.tkt-expand-btn', card);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const email = card.dataset.email;
        if (_expanded.has(email)) _expanded.delete(email); else _expanded.add(email);
        render(root, status, summaryData);
      });
    });
  }

  window.openDeskLifecycleAdmin = async function () {
    const root = document.getElementById('desk-lifecycle-root');
    if (!root) return;
    root.innerHTML = '<div class="tkt-loading"><div class="tkt-spinner"></div>Loading ticket lifecycle data…</div>';
    try {
      const status = await loadStatus();
      const summaryData = status.configured ? await loadSummary(_selectedDays) : { agents: [] };
      render(root, status, summaryData);
    } catch (e) {
      root.innerHTML = `<div class="tkt-error">❌ ${esc(e.message)}</div>`;
    }
  };
})();
