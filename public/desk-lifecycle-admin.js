/**
 * Ticket Lifecycle Admin — Session 19
 *
 * Automated replacement for the manually-exported Zoho Desk "lifecycle
 * report" CSV. Shows per-T1-agent ticket counts (open backlog, closed in
 * range, average handle time) and a sentiment breakdown, kept current by
 * a background sync against the Zoho Desk API (server-side, see
 * lib/desk-service.js + lib/desk-lifecycle.js).
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
      : `Last synced ${fmtDateTime(status.lastSyncAt)} · ${status.ticketsTracked} tickets tracked · ${status.eventsTracked} events cached`;
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

  function sentimentChip(sentiment) {
    const order = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];
    const parts = order
      .filter(k => sentiment[k])
      .map(k => `<span class="tkt-sent tkt-sent-${k.toLowerCase()}">${sentiment[k]}</span>`);
    const other = Object.keys(sentiment).filter(k => !order.includes(k));
    for (const k of other) parts.push(`<span class="tkt-sent">${sentiment[k]}</span>`);
    return parts.length ? parts.join('') : '<span class="tkt-sent-none">—</span>';
  }

  function summaryTable(agents) {
    if (!agents.length) {
      return `<div class="tkt-empty">No T1 roster agents with an email on file yet — add emails in Roster to see their ticket stats here.</div>`;
    }
    const sorted = [...agents].sort((a, b) => (b.closed_count + b.backlog_open) - (a.closed_count + a.backlog_open));
    const rows = sorted.map(a => `
      <div class="tkt-row">
        <div class="tkt-row-agent">
          <div class="tkt-row-name">${esc(a.pseudo || a.full_name || a.email)}</div>
          <div class="tkt-row-email">${esc(a.email)}</div>
        </div>
        <div class="tkt-row-stat"><div class="tkt-stat-n">${a.backlog_open}</div><div class="tkt-stat-l">Open backlog</div></div>
        <div class="tkt-row-stat"><div class="tkt-stat-n">${a.closed_count}</div><div class="tkt-stat-l">Closed</div></div>
        <div class="tkt-row-stat"><div class="tkt-stat-n">${a.avg_handle_hours != null ? a.avg_handle_hours + 'h' : '—'}</div><div class="tkt-stat-l">Avg handle time</div></div>
        <div class="tkt-row-stat"><div class="tkt-stat-n">${a.reassignment_events}</div><div class="tkt-stat-l">Reassign events<span class="tkt-approx">*</span></div></div>
        <div class="tkt-row-sentiment">${sentimentChip(a.sentiment)}</div>
      </div>`).join('');
    return `
      <div class="tkt-table">
        <div class="tkt-row tkt-row-head">
          <div class="tkt-row-agent">Agent</div>
          <div class="tkt-row-stat">Open</div>
          <div class="tkt-row-stat">Closed</div>
          <div class="tkt-row-stat">Avg handle</div>
          <div class="tkt-row-stat">Reassigned<span class="tkt-approx">*</span></div>
          <div class="tkt-row-sentiment">Sentiment (new tickets)</div>
        </div>
        ${rows}
      </div>
      <div class="tkt-footnote">* Reassignment counts are best-effort — based on assignee-change events Zoho's ticket history reports, not an audited figure.</div>`;
  }

  function render(root, status, summaryData) {
    root.innerHTML = `
      <div class="tkt-wrap">
        <div class="tkt-header">
          <div>
            <div class="tkt-h1">Ticket Lifecycle</div>
            <div class="tkt-h1-sub">Per-agent ticket stats from Zoho Desk — replaces the manual lifecycle report export.</div>
          </div>
          <div class="tkt-range-opts">
            ${RANGE_PRESETS.map(p => `<button type="button" class="tkt-range-btn ${p.days === _selectedDays ? 'tkt-range-selected' : ''}" data-days="${p.days}">${p.label}</button>`).join('')}
          </div>
        </div>

        ${status.configured ? statusBanner(status) : notConfiguredCard()}

        ${status.configured ? `
        <div class="tkt-card">
          <div class="tkt-card-title">Per-agent summary</div>
          <div class="tkt-card-sub">Range: ${fmtDateTime(summaryData.from)} → ${fmtDateTime(summaryData.to)}</div>
          ${summaryTable(summaryData.agents || [])}
        </div>` : ''}
      </div>`;

    root.querySelectorAll('.tkt-range-btn').forEach((b) => {
      b.addEventListener('click', () => { _selectedDays = parseInt(b.dataset.days, 10); window.openDeskLifecycleAdmin(); });
    });
    const syncBtn = $('.tkt-sync-btn', root);
    if (syncBtn) syncBtn.addEventListener('click', () => triggerSync(syncBtn));
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
