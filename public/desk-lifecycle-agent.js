/**
 * My Ticket Stats — Session 20
 *
 * Self-service view of the Ticket Lifecycle report, scoped to the logged-in
 * agent's own session email (no admin access needed). Pulls the same
 * Zoho-Desk-sourced numbers the admin report shows — unique tickets, solely
 * handled vs reassigned, closed, currently handling (live), FCR%, and
 * channel / Adit App Module / category / classification breakdowns — plus
 * a recent-tickets list, so agents can see their own activity here instead
 * of filling in the manual ticket-logging form.
 *
 * Entry point: window.openDeskLifecycleAgent(), rendering into
 * #desk-lifecycle-agent-root.
 */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
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
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

  function rangeISO(days) {
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  async function loadMySummary(days) {
    const { from, to } = rangeISO(days);
    const r = await fetch(`/api/desk-lifecycle/my-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include' });
    if (r.status === 401) throw new Error('Not logged in');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load your ticket summary');
    return j;
  }

  async function loadMyTickets(days) {
    const { from, to } = rangeISO(days);
    const r = await fetch(`/api/desk-lifecycle/my-tickets?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load your tickets');
    return j;
  }

  function breakdownChips(dict, cap) {
    const entries = Object.entries(dict || {}).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<div class="tkt-bd-empty">No data in range</div>';
    const shown = entries.slice(0, cap || 10);
    const rest = entries.length - shown.length;
    let html = '<div class="tkt-bd-chips">' + shown.map(([k, v]) =>
      `<span class="tkt-bd-chip">${esc(k)} <b>${v}</b></span>`
    ).join('') + '</div>';
    if (rest > 0) html += `<div class="tkt-bd-empty" style="margin-top:4px">+${rest} more</div>`;
    return html;
  }

  function noDataCard() {
    return `
      <div class="tkt-card">
        <div class="tkt-card-title">No tickets in this range yet</div>
        <div class="tkt-card-sub">Either you haven't handled any tickets in this window, or the sync hasn't reached your tickets yet — it runs in the background every 20 minutes.</div>
      </div>`;
  }

  function statsSection(s) {
    if (!s) return noDataCard();
    const fcr = s.fcr_pct != null ? `${s.fcr_pct}%` : (s.fcr_total ? '0%' : '—');
    const csat = s.csat_pct != null ? `${s.csat_pct}%` : (s.csat_total ? '0%' : '—');
    const avgHandle = s.avg_handle_hours != null ? `${s.avg_handle_hours}h` : '—';
    return `
      <div class="tkt-card">
        <div class="tkt-card-title">My numbers</div>
        <div class="tkt-card-sub">Unique/solely-handled/reassigned and the breakdowns below count tickets created in this range; Closed/Avg handle/FCR count tickets closed in this range; Handling now is live.</div>
        <div class="tkta-stat-grid">
          <div class="tkta-pill"><div class="tkta-pill-n">${s.unique_tickets || 0}</div><div class="tkta-pill-l">Unique tickets</div></div>
          <div class="tkta-pill tkta-pill-good"><div class="tkta-pill-n">${s.solely_handled || 0}</div><div class="tkta-pill-l">Solely handled</div></div>
          <div class="tkta-pill tkta-pill-warn"><div class="tkta-pill-n">${s.reassigned || 0}</div><div class="tkta-pill-l">Reassigned</div></div>
          <div class="tkta-pill"><div class="tkta-pill-n">${s.closed_count || 0}</div><div class="tkta-pill-l">Closed</div></div>
          <div class="tkta-pill tkta-pill-live"><div class="tkta-pill-n">${s.currently_handling || 0}</div><div class="tkta-pill-l">Handling now</div></div>
          <div class="tkta-pill"><div class="tkta-pill-n">${avgHandle}</div><div class="tkta-pill-l">Avg handle time</div></div>
          <div class="tkta-pill"><div class="tkta-pill-n">${fcr}</div><div class="tkta-pill-l">FCR${s.fcr_total ? ` (${s.fcr_total} tickets)` : ''}</div></div>
          <div class="tkta-pill"><div class="tkta-pill-n">${csat}</div><div class="tkta-pill-l">CSAT${s.csat_total ? ` (${s.csat_total} surveys)` : ''}</div></div>
        </div>
      </div>
      <div class="tkt-card">
        <div class="tkt-card-title">Breakdown</div>
        <div class="tkta-bd-grid">
          <div><div class="tkt-bd-group-title">Channel</div>${breakdownChips(s.channel)}</div>
          <div><div class="tkt-bd-group-title">Adit App Module</div>${breakdownChips(s.module)}</div>
          <div><div class="tkt-bd-group-title">Category</div>${breakdownChips(s.category)}</div>
          <div><div class="tkt-bd-group-title">Classification</div>${breakdownChips(s.classification)}</div>
        </div>
      </div>`;
  }

  function statusPill(status, statusType) {
    const t = (statusType || status || '').toLowerCase();
    let cls = 'tkta-status-default';
    if (t.includes('closed')) cls = 'tkta-status-closed';
    else if (t.includes('open')) cls = 'tkta-status-open';
    else if (t.includes('hold')) cls = 'tkta-status-hold';
    return `<span class="tkta-status ${cls}">${esc(status || '—')}</span>`;
  }

  function ticketsTable(tickets) {
    if (!tickets.length) {
      return `<div class="tkt-empty">No tickets found in this range.</div>`;
    }
    const rows = tickets.map(t => `
      <tr>
        <td>${t.web_url ? `<a href="${esc(t.web_url)}" target="_blank" rel="noopener">#${esc(t.ticket_number)}</a>` : `#${esc(t.ticket_number)}`}</td>
        <td class="tkta-subject" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
        <td>${statusPill(t.status, t.status_type)}</td>
        <td>${esc(t.channel || '—')}</td>
        <td>${esc(t.category || '—')}</td>
        <td>${t.reassign_count ? `<span class="tkta-reassign-flag">${t.reassign_count}</span>` : '—'}</td>
        <td>${t.fcr_achieved === 'true' ? '✅' : (t.fcr_achieved === 'false' ? '—' : '—')}</td>
        <td>${fmtDate(t.created_time)}</td>
        <td>${fmtDate(t.closed_time)}</td>
      </tr>`).join('');
    return `
      <div class="tkta-table-wrap">
        <table class="tkta-table">
          <thead><tr>
            <th>Ticket</th><th>Subject</th><th>Status</th><th>Channel</th><th>Category</th>
            <th>Reassigned</th><th>FCR</th><th>Created</th><th>Closed</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function render(root, summaryJson, ticketsJson) {
    root.innerHTML = `
      <div class="tkt-wrap">
        <div class="tkt-header">
          <div>
            <div class="tkt-h1">My Ticket Stats</div>
            <div class="tkt-h1-sub">Your own ticket activity, straight from Zoho Desk — no need to log it by hand.</div>
          </div>
          <div class="tkt-range-opts">
            ${RANGE_PRESETS.map(p => `<button type="button" class="tkt-range-btn ${p.days === _selectedDays ? 'tkt-range-selected' : ''}" data-days="${p.days}">${p.label}</button>`).join('')}
          </div>
        </div>
        <div class="tkt-card-sub" style="margin:-6px 0 14px 2px;">Range: ${fmtDateTime(summaryJson.from)} → ${fmtDateTime(summaryJson.to)}</div>

        ${statsSection(summaryJson.summary)}

        <div class="tkt-card">
          <div class="tkt-card-title">Recent tickets</div>
          <div class="tkt-card-sub">Most recently created first, up to 200.</div>
          ${ticketsTable(ticketsJson.tickets || [])}
        </div>
      </div>`;

    root.querySelectorAll('.tkt-range-btn').forEach((b) => {
      b.addEventListener('click', () => { _selectedDays = parseInt(b.dataset.days, 10); window.openDeskLifecycleAgent(); });
    });
  }

  window.openDeskLifecycleAgent = async function () {
    const root = document.getElementById('desk-lifecycle-agent-root');
    if (!root) return;
    root.innerHTML = '<div class="tkt-loading"><div class="tkt-spinner"></div>Loading your ticket stats…</div>';
    try {
      const [summaryJson, ticketsJson] = await Promise.all([
        loadMySummary(_selectedDays),
        loadMyTickets(_selectedDays),
      ]);
      render(root, summaryJson, ticketsJson);
    } catch (e) {
      root.innerHTML = `<div class="tkt-error">❌ ${esc(e.message)}</div>`;
    }
  };
})();
