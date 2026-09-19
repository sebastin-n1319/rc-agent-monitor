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
 * Session 21: added Call Activity (RingCentral, same date range as the
 * ticket numbers -- see database.js's getAgentCallStatsRange) and Chat
 * Activity (Zoho SalesIQ chat count / avg response time / avail-busy
 * time -- see lib/salesiq-lifecycle.js) cards.
 *
 * Session 22: migrated off the page-local tkt-* / tkta-* token set and onto
 * the shared `.av2` Agent View design system (agent-view-v2.css) — same
 * panels, stat cards, table, pills, buttons, skeleton and motion as
 * Home/Live, and the real adit.com brand orange instead of the old one.
 * Requires `.av2` on the `#agent-section-mystats` shell (see index.html).
 *
 * Entry point: window.openDeskLifecycleAgent(), rendering into
 * #desk-lifecycle-agent-root.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ── Period filter — Session 23: ported from desk-lifecycle-admin.js's
  // filter bar so agents get the same Period options admins already have
  // (rolling/calendar/custom, all DST-aware Chicago wall-clock math),
  // instead of the previous fixed 7/30/90-day buttons. The backend
  // (/api/desk-lifecycle/my-summary, /my-tickets) already accepted
  // arbitrary from/to -- this was purely a frontend gap.
  let _selectedPreset = 'r30';
  let _customFrom = null; // 'YYYY-MM-DD'
  let _customTo = null;   // 'YYYY-MM-DD'

  function pad2(n) { return String(n).padStart(2, '0'); }
  function chicagoOffsetMinutesAt(utcMs) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = dtf.formatToParts(new Date(utcMs)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((asIfUtc - utcMs) / 60000);
  }
  function centralWallTimeToUtcIso(naiveLocalStr) {
    const m = String(naiveLocalStr).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return new Date(naiveLocalStr).toISOString();
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    const approxUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
    const offsetMin = chicagoOffsetMinutesAt(approxUtcMs);
    return new Date(approxUtcMs - offsetMin * 60000).toISOString();
  }
  function dayStartIso(y, m, d) { return centralWallTimeToUtcIso(`${y}-${pad2(m)}-${pad2(d)} 00:00:00`); }
  function chicagoTodayYMD() {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = dtf.formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    return { y: +parts.year, m: +parts.month, d: +parts.day };
  }
  function addDays(y, m, d, delta) {
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  function weekdayOf(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function mondayOnOrBefore(y, m, d) { const wd = weekdayOf(y, m, d); return addDays(y, m, d, -((wd + 6) % 7)); }
  function quarterStartMonth(m) { return Math.floor((m - 1) / 3) * 3 + 1; }
  function seasonStartMonth(m) {
    if (m === 12 || m === 1 || m === 2) return 12;
    if (m >= 3 && m <= 5) return 3;
    if (m >= 6 && m <= 8) return 6;
    return 9;
  }
  function seasonLabel(m) { return { 12: 'Winter', 3: 'Spring', 6: 'Summer', 9: 'Fall' }[seasonStartMonth(m)]; }

  function computeRolling(days) { return { from: new Date(Date.now() - days * 24 * 3600 * 1000).toISOString(), to: new Date().toISOString() }; }
  function computeToday() { const t = chicagoTodayYMD(); return { from: dayStartIso(t.y, t.m, t.d), to: new Date().toISOString() }; }
  function computeYesterday() { const t = chicagoTodayYMD(); const y1 = addDays(t.y, t.m, t.d, -1); return { from: dayStartIso(y1.y, y1.m, y1.d), to: dayStartIso(t.y, t.m, t.d) }; }
  function computeThisWeek() { const t = chicagoTodayYMD(); const mon = mondayOnOrBefore(t.y, t.m, t.d); return { from: dayStartIso(mon.y, mon.m, mon.d), to: new Date().toISOString() }; }
  function computeLastWeek() { const t = chicagoTodayYMD(); const thisMon = mondayOnOrBefore(t.y, t.m, t.d); const lastMon = addDays(thisMon.y, thisMon.m, thisMon.d, -7); return { from: dayStartIso(lastMon.y, lastMon.m, lastMon.d), to: dayStartIso(thisMon.y, thisMon.m, thisMon.d) }; }
  function computeThisMonth() { const t = chicagoTodayYMD(); return { from: dayStartIso(t.y, t.m, 1), to: new Date().toISOString() }; }
  function computeLastMonth() { const t = chicagoTodayYMD(); const pm = t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 }; return { from: dayStartIso(pm.y, pm.m, 1), to: dayStartIso(t.y, t.m, 1) }; }
  function computeThisQuarter() { const t = chicagoTodayYMD(); const qm = quarterStartMonth(t.m); return { from: dayStartIso(t.y, qm, 1), to: new Date().toISOString() }; }
  function computeLastQuarter() { const t = chicagoTodayYMD(); const qm = quarterStartMonth(t.m); const pq = qm === 1 ? { y: t.y - 1, m: 10 } : { y: t.y, m: qm - 3 }; return { from: dayStartIso(pq.y, pq.m, 1), to: dayStartIso(t.y, qm, 1) }; }
  function computeThisSeason() { const t = chicagoTodayYMD(); const sm = seasonStartMonth(t.m); const sy = (sm === 12 && t.m !== 12) ? t.y - 1 : t.y; return { from: dayStartIso(sy, sm, 1), to: new Date().toISOString() }; }
  function computeThisYear() { const t = chicagoTodayYMD(); return { from: dayStartIso(t.y, 1, 1), to: new Date().toISOString() }; }
  function computeLastYear() { const t = chicagoTodayYMD(); return { from: dayStartIso(t.y - 1, 1, 1), to: dayStartIso(t.y, 1, 1) }; }
  function computeCustom() {
    if (!_customFrom || !_customTo) return computeRolling(30);
    const [fy, fm, fd] = _customFrom.split('-').map(Number);
    const [ty, tm, td] = _customTo.split('-').map(Number);
    const end = addDays(ty, tm, td, 1);
    return { from: dayStartIso(fy, fm, fd), to: dayStartIso(end.y, end.m, end.d) };
  }
  function buildPresets() {
    return [
      { key: 'r7',  label: 'Last 7 days',  group: 'Rolling',  compute: () => computeRolling(7) },
      { key: 'r30', label: 'Last 30 days', group: 'Rolling',  compute: () => computeRolling(30) },
      { key: 'r90', label: 'Last 90 days', group: 'Rolling',  compute: () => computeRolling(90) },
      { key: 'today',       label: 'Today',                                            group: 'Calendar', compute: computeToday },
      { key: 'yesterday',   label: 'Yesterday',                                        group: 'Calendar', compute: computeYesterday },
      { key: 'thisWeek',    label: 'This week',                                        group: 'Calendar', compute: computeThisWeek },
      { key: 'lastWeek',    label: 'Last week',                                        group: 'Calendar', compute: computeLastWeek },
      { key: 'thisMonth',   label: 'This month',                                       group: 'Calendar', compute: computeThisMonth },
      { key: 'lastMonth',   label: 'Last month',                                       group: 'Calendar', compute: computeLastMonth },
      { key: 'thisQuarter', label: 'This quarter',                                     group: 'Calendar', compute: computeThisQuarter },
      { key: 'lastQuarter', label: 'Last quarter',                                     group: 'Calendar', compute: computeLastQuarter },
      { key: 'thisSeason',  label: `This season (${seasonLabel(chicagoTodayYMD().m)})`, group: 'Calendar', compute: computeThisSeason },
      { key: 'thisYear',    label: 'This year',                                        group: 'Calendar', compute: computeThisYear },
      { key: 'lastYear',    label: 'Last year',                                        group: 'Calendar', compute: computeLastYear },
      { key: 'custom',      label: 'Custom range…',                                    group: 'Custom',   compute: computeCustom },
    ];
  }
  function findPreset(key) { const all = buildPresets(); return all.find(p => p.key === key) || all[1]; }
  function currentRange() { return findPreset(_selectedPreset).compute(); }

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

  // "1h 23m" / "4m 12s" / "38s" -- matches the existing Summary page's
  // talk-time formatting style.
  function fmtDuration(totalSeconds) {
    if (totalSeconds == null) return '—';
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  async function loadMySummary(range) {
    const { from, to } = range;
    const r = await fetch(`/api/desk-lifecycle/my-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include' });
    if (r.status === 401) throw new Error('Not logged in');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load your ticket summary');
    return j;
  }

  async function loadMyTickets(range) {
    const { from, to } = range;
    const r = await fetch(`/api/desk-lifecycle/my-tickets?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load your tickets');
    return j;
  }

  // ── av2 icon set — same viewBox/stroke conventions as agent-view-v2 ──
  const ICON = {
    ticket:   '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
    check:    '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    x:        '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    alert:    '<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    pulse:    '<path d="M3 12h4l2-8 4 16 2-8h6"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    target:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    star:     '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    phoneIn:  '<path d="M21 8 13 16l-4-4-6 6"/><path d="M14 8h7v7"/>',
    phoneOut: '<path d="m21 16-8-8-4 4-6-6"/><path d="M14 16h7V9"/>',
    phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    voicemail:'<circle cx="6" cy="12" r="4"/><circle cx="18" cy="12" r="4"/><path d="M6 16h12"/>',
    swap:     '<path d="M7 7h10M7 7l3-3M7 7l3 3"/><path d="M17 17H7M17 17l-3-3M17 17l-3 3"/>',
    chat:     '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    pause:    '<circle cx="12" cy="12" r="9"/><path d="M9 9v6M15 9v6"/>',
  };
  function statIcon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ICON.ticket}</svg>`;
  }
  function stat(icon, tone, value, label) {
    return `
      <article class="av2-stat"${tone ? ` data-tone="${tone}"` : ''}>
        <div class="av2-stat-ico" aria-hidden="true">${statIcon(icon)}</div>
        <div class="av2-stat-label">${esc(label)}</div>
        <div class="av2-stat-value">${value}</div>
      </article>`;
  }
  function panel(title, sub, body) {
    return `
      <section class="av2-section">
        <div class="av2-panel">
          <div class="av2-section-head" style="margin-bottom:${sub ? '4px' : '14px'};">
            <div>
              <h3 class="av2-section-title">${esc(title)}</h3>
              ${sub ? `<div class="av2-section-sub">${sub}</div>` : ''}
            </div>
          </div>
          ${body}
        </div>
      </section>`;
  }
  function emptyState(title, sub) {
    return `<div class="av2-empty"><div class="av2-empty-title">${esc(title)}</div><div class="av2-empty-sub">${esc(sub)}</div></div>`;
  }

  function breakdownChips(dict, cap) {
    const entries = Object.entries(dict || {}).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<div class="av2-section-meta">No data in range</div>';
    const shown = entries.slice(0, cap || 10);
    const rest = entries.length - shown.length;
    let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + shown.map(([k, v]) =>
      `<span class="av2-chip">${esc(k)} <b style="color:var(--av2-t1)">${v}</b></span>`
    ).join('') + '</div>';
    if (rest > 0) html += `<div class="av2-section-meta" style="margin-top:6px">+${rest} more</div>`;
    return html;
  }

  function noDataPanel() {
    return panel('No tickets in this range yet', '', emptyState(
      'Nothing to show yet',
      "Either you haven't handled any tickets in this window, or the sync hasn't reached your tickets yet — it runs in the background every 20 minutes."
    ));
  }

  function statsSection(s) {
    if (!s) return noDataPanel();
    const fcr = s.fcr_pct != null ? `${s.fcr_pct}%` : (s.fcr_total ? '0%' : '—');
    const csat = s.csat_pct != null ? `${s.csat_pct}%` : (s.csat_total ? '0%' : '—');
    const avgHandle = s.avg_handle_hours != null ? `${s.avg_handle_hours}h` : '—';
    const body = `
      <div class="av2-stat-grid">
        ${stat('ticket', null,   s.unique_tickets || 0, 'Unique tickets')}
        ${stat('check',  'green', s.solely_handled || 0, 'Solely handled')}
        ${stat('alert',  'red',   s.reassigned || 0, 'Reassigned')}
        ${stat('check',  'teal',  s.closed_count || 0, 'Closed')}
        ${stat('pulse',  'blue',  s.currently_handling || 0, 'Handling now')}
        ${stat('clock',  'purple', avgHandle, 'Avg handle time')}
        ${stat('target', 'teal',  fcr, `FCR${s.fcr_total ? ` (${s.fcr_total})` : ''}`)}
        ${stat('star',   'purple', csat, `CSAT${s.csat_total ? ` (${s.csat_total})` : ''}`)}
      </div>`;
    return panel('My numbers', 'Unique/solely-handled/reassigned and the breakdowns below count tickets created in this range; Closed/Avg handle/FCR count tickets closed in this range; Handling now is live.', body);
  }

  function breakdownSection(s) {
    if (!s) return '';
    const body = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--av2-s5);">
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Channel</div>${breakdownChips(s.channel)}</div>
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Adit App Module</div>${breakdownChips(s.module)}</div>
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Category</div>${breakdownChips(s.category)}</div>
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Classification</div>${breakdownChips(s.classification)}</div>
      </div>`;
    return panel('Breakdown', '', body);
  }

  // Session 21: RingCentral call stats, same range as the ticket numbers
  // above. Missing entirely (null) means this session email isn't linked
  // to a monitored RingCentral extension yet, rather than "zero calls".
  function callStatsSection(c) {
    if (!c) {
      return panel('Call Activity', 'RingCentral call stats for this range.',
        emptyState('Not linked yet', 'No RingCentral extension linked to your account yet — ask your admin to add you under Agents.'));
    }
    const body = `
      <div class="av2-stat-grid">
        ${stat('phoneIn',  'teal',   c.inboundCalls || 0, 'Inbound')}
        ${stat('phoneOut', 'purple', c.outboundCalls || 0, 'Outbound')}
        ${stat('phone',    null,     c.totalCalls || 0, 'Total calls')}
        ${stat('x',        'red',    c.missedCalls || 0, 'Missed')}
        ${stat('voicemail','red',    c.voicemails || 0, 'Voicemails')}
        ${stat('clock',    'green',  fmtDuration(c.totalTalkSeconds), 'Total talk time')}
        ${stat('clock',    'blue',   fmtDuration(c.ahtInboundSeconds), 'AHT inbound')}
        ${stat('clock',    'blue',   fmtDuration(c.ahtOutboundSeconds), 'AHT outbound')}
        ${stat('swap',     'teal',   c.transferCount || 0, 'Transfers')}
      </div>`;
    return panel('Call Activity', 'RingCentral calls in this range — same period as the ticket numbers above.', body);
  }

  // Session 21: Zoho SalesIQ chat stats. Chat count / avg response time
  // are fully historical (synced from SalesIQ's own chat log); avail/busy
  // time is only tracked from whenever this feature shipped forward (see
  // lib/salesiq-lifecycle.js -- SalesIQ has no historical presence log),
  // so it fills in over time rather than covering the whole range at first.
  function chatStatsSection(cs, cp) {
    if (!cs && !cp) {
      return panel('Chat Activity', 'Zoho SalesIQ chat stats for this range.',
        emptyState('Not available', "Chat stats aren't available for this account."));
    }
    const avgResp = cs && cs.avgResponseSeconds != null ? fmtDuration(cs.avgResponseSeconds) : '—';
    const body = `
      <div class="av2-stat-grid">
        ${stat('chat',  null,   cs ? (cs.chatCount || 0) : '—', 'Chats handled')}
        ${stat('clock', 'blue', avgResp, 'Avg response time')}
        ${stat('check', 'green', cp ? fmtDuration(cp.availSeconds) : '—', 'Chat available')}
        ${stat('pause', 'red',  cp ? fmtDuration(cp.busySeconds) : '—', 'Chat busy')}
      </div>`;
    return panel('Chat Activity', 'Zoho SalesIQ chats in this range. Available/busy time started tracking when this shipped, so it fills in over time rather than covering the full range right away.', body);
  }

  function statusPill(status, statusType) {
    const t = (statusType || status || '').toLowerCase();
    let state = 'offline';
    if (t.includes('closed')) state = 'available';
    else if (t.includes('open')) state = 'oncall';
    else if (t.includes('hold')) state = 'ringing';
    return `<span class="av2-pill" data-state="${state}"><span class="av2-pill-dot"></span>${esc(status || '—')}</span>`;
  }

  function ticketsTable(tickets) {
    if (!tickets.length) {
      return emptyState('No tickets found', 'Nothing in this range yet.');
    }
    const rows = tickets.map(t => `
      <tr>
        <td>${t.web_url ? `<a href="${esc(t.web_url)}" target="_blank" rel="noopener" style="color:var(--av2-orange);font-weight:600;text-decoration:none;">#${esc(t.ticket_number)}</a>` : `#${esc(t.ticket_number)}`}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
        <td>${statusPill(t.status, t.status_type)}</td>
        <td>${esc(t.channel || '—')}</td>
        <td>${esc(t.category || '—')}</td>
        <td>${t.reassign_count ? `<span style="color:var(--av2-red);font-weight:700;">${t.reassign_count}</span>` : '—'}</td>
        <td>${t.fcr_achieved === 'true' ? '✅' : '—'}</td>
        <td>${fmtDate(t.created_time)}</td>
        <td>${fmtDate(t.closed_time)}</td>
      </tr>`).join('');
    return `
      <div style="overflow-x:auto;">
        <table class="av2-table">
          <thead><tr>
            <th>Ticket</th><th>Subject</th><th>Status</th><th>Channel</th><th>Category</th>
            <th>Reassigned</th><th>FCR</th><th>Created</th><th>Closed</th>
          </tr></thead>
          <tbody id="mystats-ticket-rows">${rows}</tbody>
        </table>
      </div>`;
  }

  function render(root, summaryJson, ticketsJson) {
    root.innerHTML = `
      <div class="av2-container">
        <div class="av2-section-head" style="margin-bottom:6px;">
          <div>
            <h2 class="av2-section-title">My Ticket Stats</h2>
            <div class="av2-section-sub">Your own ticket activity, straight from Zoho Desk — no need to log it by hand.</div>
          </div>
          <div class="mystats-filterbar">
            ${(() => {
              const presets = buildPresets();
              const groups = {};
              presets.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
              const groupOrder = ['Rolling', 'Calendar', 'Custom'];
              return `
                <select class="mystats-preset-select">
                  ${groupOrder.map(g => `<optgroup label="${esc(g)}">${(groups[g] || []).map(p =>
                    `<option value="${p.key}" ${p.key === _selectedPreset ? 'selected' : ''}>${esc(p.label)}</option>`
                  ).join('')}</optgroup>`).join('')}
                </select>
                <div class="mystats-date-inputs"${_selectedPreset === 'custom' ? '' : ' style="display:none"'}>
                  <input type="date" class="mystats-date-from" value="${esc(_customFrom || '')}">
                  <span class="mystats-date-sep">to</span>
                  <input type="date" class="mystats-date-to" value="${esc(_customTo || '')}">
                  <button type="button" class="av2-btn av2-btn-sm av2-btn-ghost mystats-date-apply">Apply</button>
                </div>`;
            })()}
          </div>
        </div>
        <div class="av2-section-meta" style="margin-bottom:var(--av2-s5);">Range: ${fmtDateTime(summaryJson.from)} → ${fmtDateTime(summaryJson.to)}</div>

        ${statsSection(summaryJson.summary)}
        ${callStatsSection(summaryJson.callStats)}
        ${chatStatsSection(summaryJson.chatStats, summaryJson.chatPresence)}
        ${breakdownSection(summaryJson.summary)}

        ${panel('Recent tickets', 'Most recently created first, up to 200.', ticketsTable(ticketsJson.tickets || []))}
      </div>`;

    const presetSel = root.querySelector('.mystats-preset-select');
    if (presetSel) presetSel.addEventListener('change', () => {
      _selectedPreset = presetSel.value;
      const customWrap = root.querySelector('.mystats-date-inputs');
      if (customWrap) customWrap.style.display = (_selectedPreset === 'custom') ? '' : 'none';
      if (_selectedPreset !== 'custom' || (_customFrom && _customTo)) window.openDeskLifecycleAgent();
    });
    const applyBtn = root.querySelector('.mystats-date-apply');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      const f = root.querySelector('.mystats-date-from');
      const t = root.querySelector('.mystats-date-to');
      if (!f || !t || !f.value || !t.value) { if (typeof showToast === 'function') showToast('Pick both a start and end date', 'error', 3000); return; }
      if (f.value > t.value) { if (typeof showToast === 'function') showToast('Start date must be before end date', 'error', 3000); return; }
      _customFrom = f.value; _customTo = t.value;
      window.openDeskLifecycleAgent();
    });

    // Stagger the ticket rows in, matching the dashboard's row entrance
    // (see agent-view-v2.js) — same Motion One instance, already loaded.
    const ML = window.Motion || window.motion || {};
    const animate = ML.animate || null;
    if (animate) {
      const rows = root.querySelectorAll('#mystats-ticket-rows tr');
      rows.forEach((tr, i) => {
        const d = Math.min(i, 24);
        animate(tr, { opacity: [0, 1], y: [8, 0] }, { duration: 0.28, delay: d * 0.02, easing: [0.22, 1, 0.36, 1] });
      });
    }
  }

  function skeletonHTML() {
    const card = () => `<div class="av2-stat"><div class="av2-skel" style="height:12px;width:55%;margin-bottom:10px;"></div><div class="av2-skel" style="height:24px;width:38%;"></div></div>`;
    return `
      <div class="av2-container">
        <div class="av2-skel" style="height:22px;width:200px;margin-bottom:8px;border-radius:6px;"></div>
        <div class="av2-skel" style="height:14px;width:320px;margin-bottom:24px;border-radius:6px;"></div>
        <div class="av2-stat-grid">${Array.from({ length: 8 }).map(card).join('')}</div>
      </div>`;
  }

  window.openDeskLifecycleAgent = async function () {
    const root = document.getElementById('desk-lifecycle-agent-root');
    if (!root) return;
    root.innerHTML = skeletonHTML();
    try {
      const range = currentRange();
      const [summaryJson, ticketsJson] = await Promise.all([
        loadMySummary(range),
        loadMyTickets(range),
      ]);
      render(root, summaryJson, ticketsJson);
    } catch (e) {
      root.innerHTML = `
        <div class="av2-container">
          <div class="av2-banner" data-tone="warning">
            <svg class="av2-banner-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <div class="av2-banner-msg">${esc(e.message)}</div>
          </div>
        </div>`;
    }
  };
})();
