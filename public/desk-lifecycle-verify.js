/**
 * "Verify tickets" drill-down — Session 34.
 *
 * Built after Sabrina Quinn's manually-tracked count (13 tickets handled
 * today, per her team's Google Sheet) conflicted with the Ticket
 * Lifecycle card's number (7) for the same agent/period — with no way to
 * see which tickets the system actually counted, there was no way to
 * tell whether the card was wrong, the manual sheet was wrong, or both
 * were counting different things. This opens a full-screen overlay,
 * launched from either the admin Ticket Lifecycle page (any monitored
 * agent, via a click on one of that agent's pill numbers) or the agent
 * My Stats page (a "Verify my tickets" button, self-scoped), showing the
 * EXACT tickets counted toward one metric for one agent/period, each
 * with a real link into Zoho Desk so it can be checked by hand.
 *
 * Backed by GET /api/desk-lifecycle/verify-tickets (server.js), which
 * calls lib/desk-lifecycle.js's agentTicketsForMetric() — the same
 * owner_change_log walk and date-basis agentSummary() uses for the
 * aggregate cards, so this view's total always equals the card's number.
 *
 * Self-contained IIFE, no shared state with desk-lifecycle-admin.js or
 * desk-lifecycle-agent.js (same convention those two already use with
 * each other) -- exposes exactly one global, window.openDeskLifecycleVerify(opts):
 *   opts.agentEmail  (required) -- the agent to open scoped to
 *   opts.agentName   (optional) -- shown immediately, before the first fetch resolves
 *   opts.isAdmin     (bool)     -- whether to show the Agent picker + customer search
 *   opts.metric      (optional) -- initial metric key, default 'unique'
 *   opts.presetKey   (optional) -- the caller's own current Period preset key
 *                                  (e.g. 'today'), so the panel opens scoped to
 *                                  the same window as the number being checked
 *   opts.customFrom/opts.customTo (optional) -- 'YYYY-MM-DD', used when
 *                                  opts.presetKey === 'custom'
 *   opts.from/opts.to(optional) -- literal ISO fallback when no presetKey
 *                                  is passed (or it doesn't match a known
 *                                  preset) -- opens on a custom range built
 *                                  from these instead of defaulting to Last 30 days
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ── Period presets — same Chicago-wall-clock math as desk-lifecycle-
  // admin.js / desk-lifecycle-agent.js (kept as its own copy, same
  // convention those two already use with each other rather than a
  // shared module). ──
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
    if (!_state.customFrom || !_state.customTo) return computeRolling(30);
    const [fy, fm, fd] = _state.customFrom.split('-').map(Number);
    const [ty, tm, td] = _state.customTo.split('-').map(Number);
    const end = addDays(ty, tm, td, 1);
    return { from: dayStartIso(fy, fm, fd), to: dayStartIso(end.y, end.m, end.d) };
  }
  // Session 34: same full preset set as desk-lifecycle-admin.js / desk-
  // lifecycle-agent.js (not just a trimmed subset), so a caller passing
  // through its own currently-selected preset key (e.g. a pill clicked
  // while Period="Today" is selected) always finds a matching option
  // here and opens already scoped to the exact period being questioned.
  function buildPresets() {
    return [
      { key: 'r7',  label: 'Last 7 days',  compute: () => computeRolling(7) },
      { key: 'r30', label: 'Last 30 days', compute: () => computeRolling(30) },
      { key: 'r90', label: 'Last 90 days', compute: () => computeRolling(90) },
      { key: 'today',       label: 'Today',                                            compute: computeToday },
      { key: 'yesterday',   label: 'Yesterday',                                        compute: computeYesterday },
      { key: 'thisWeek',    label: 'This week',                                        compute: computeThisWeek },
      { key: 'lastWeek',    label: 'Last week',                                        compute: computeLastWeek },
      { key: 'thisMonth',   label: 'This month',                                       compute: computeThisMonth },
      { key: 'lastMonth',   label: 'Last month',                                       compute: computeLastMonth },
      { key: 'thisQuarter', label: 'This quarter',                                     compute: computeThisQuarter },
      { key: 'lastQuarter', label: 'Last quarter',                                     compute: computeLastQuarter },
      { key: 'thisSeason',  label: `This season (${seasonLabel(chicagoTodayYMD().m)})`, compute: computeThisSeason },
      { key: 'thisYear',    label: 'This year',                                        compute: computeThisYear },
      { key: 'lastYear',    label: 'Last year',                                        compute: computeLastYear },
      { key: 'custom',      label: 'Custom range…',                                    compute: computeCustom },
    ];
  }
  function findPreset(key) { const all = buildPresets(); return all.find(p => p.key === key) || all[1]; }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/Chicago', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }) + ' CST';
    } catch (e) { return iso; }
  }

  // ── Metric definitions — labels/date-basis/explanation text mirror the
  // same wording desk-lifecycle-admin.js's metricTip() and desk-lifecycle-
  // agent.js's metricTip() already use for their card tooltips, so this
  // view never disagrees with what hovering the card says. ──
  const METRIC_DEFS = {
    unique: {
      label: 'Unique tickets', basis: 'created',
      def: 'Every ticket this agent\'s name appears on as an individual owner (queue/pod hand-offs and "Unassigned" excluded), created in this period.',
    },
    solely_handled: {
      label: 'Solely handled', basis: 'created',
      def: 'Of the Unique tickets: the ones this agent owned start to finish with no other individual ever touching it, and the ticket is now Closed.',
    },
    reassigned: {
      label: 'Reassigned', basis: 'created',
      def: 'Tickets that arrived already in progress — a different person owned it immediately before this agent picked it up.',
    },
    transferred: {
      label: 'Transferred', basis: 'created',
      def: 'Tickets this agent handed off to someone outside the T1 roster (a different team).',
    },
    handed_off_internal: {
      label: 'Handed off (T1)', basis: 'created',
      def: 'Tickets this agent handed directly to another monitored T1 agent — stayed inside the team.',
    },
    closed: {
      label: 'Closed', basis: 'closed',
      def: 'Tickets now Closed in Zoho Desk, closed within this period — credited to whoever is the CURRENT owner, even if it passed through other hands first.',
    },
    fcr: {
      label: 'First Contact Resolution (FCR)', basis: 'closed',
      def: 'Of this agent\'s Closed tickets in this period, resolved within 24 business hours (Mon–Fri, 7am–7pm CST) with zero reopens.',
    },
    csat: {
      label: 'Customer Satisfaction (CSAT)', basis: 'survey',
      def: 'Survey responses on this agent\'s tickets, submitted in this period (by survey time, not ticket close time). Ratings: Good / Okay / Bad.',
    },
    currently_handling: {
      label: 'Handling now', basis: 'live',
      def: 'Tickets this agent currently owns that are still open, right now — a live count, not scoped to the period below.',
    },
  };
  const METRIC_ORDER = ['unique', 'solely_handled', 'reassigned', 'transferred', 'handed_off_internal', 'closed', 'fcr', 'csat', 'currently_handling'];

  let _state = null;
  let _overlayEl = null;

  function statusPill(status, statusType) {
    const t = (statusType || status || '').toLowerCase();
    let state = 'offline';
    if (t.includes('closed')) state = 'available';
    else if (t.includes('open')) state = 'oncall';
    else if (t.includes('hold')) state = 'ringing';
    return `<span class="av2-pill" data-state="${state}"><span class="av2-pill-dot"></span>${esc(status || '—')}</span>`;
  }

  function ticketLink(t) {
    const num = esc(t.ticket_number || t.ticket_id || '—');
    return t.web_url
      ? `<a href="${esc(t.web_url)}" target="_blank" rel="noopener" class="dlv-ticket-link">#${num}</a>`
      : `#${num}`;
  }

  function flagChips(flags) {
    if (!flags) return '—';
    const on = [];
    if (flags.solely_handled) on.push('Solely handled');
    if (flags.reassigned) on.push('Reassigned');
    if (flags.transferred) on.push('Transferred');
    if (flags.handed_off_internal) on.push('Handed off (T1)');
    if (!on.length) return '<span class="dlv-dim">—</span>';
    return on.map(l => `<span class="av2-chip">${esc(l)}</span>`).join(' ');
  }

  function distinctValues(rows, field) {
    const set = new Set();
    rows.forEach(r => { const v = (r[field] || '').trim(); if (v) set.add(v); });
    return Array.from(set).sort();
  }

  function tableHtml(metric, allTickets) {
    if (!allTickets.length) {
      return `<div class="av2-empty"><div class="av2-empty-title">No tickets found</div><div class="av2-empty-sub">Nothing counted toward this metric for this agent/period.</div></div>`;
    }
    const statuses = distinctValues(allTickets, 'status_type');
    const channels = distinctValues(allTickets, 'channel');

    let tickets = allTickets;
    if (_state.statusFilter !== 'all') tickets = tickets.filter(t => (t.status_type || t.status || '') === _state.statusFilter);
    if (_state.channelFilter !== 'all') tickets = tickets.filter(t => (t.channel || '') === _state.channelFilter);
    if (metric === 'fcr' && _state.fcrFilter !== 'all') {
      tickets = tickets.filter(t => _state.fcrFilter === 'achieved' ? t.fcr_achieved : !t.fcr_achieved);
    }
    if (metric === 'csat' && _state.ratingFilter !== 'all') {
      tickets = tickets.filter(t => (t.rating || '') === _state.ratingFilter);
    }

    const chipsBar = `
      <div class="dlv-chips-bar">
        <div class="dlv-chips">
          ${statuses.length > 1 ? `
          <label class="dlv-chip-field">Status
            <select class="dlv-status-filter">
              <option value="all" ${_state.statusFilter === 'all' ? 'selected' : ''}>All</option>
              ${statuses.map(s => `<option value="${esc(s)}" ${s === _state.statusFilter ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
          </label>` : ''}
          ${channels.length > 1 ? `
          <label class="dlv-chip-field">Channel
            <select class="dlv-channel-filter">
              <option value="all" ${_state.channelFilter === 'all' ? 'selected' : ''}>All</option>
              ${channels.map(c => `<option value="${esc(c)}" ${c === _state.channelFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </label>` : ''}
          ${metric === 'fcr' ? `
          <label class="dlv-chip-field">FCR
            <select class="dlv-fcr-filter">
              <option value="all" ${_state.fcrFilter === 'all' ? 'selected' : ''}>All</option>
              <option value="achieved" ${_state.fcrFilter === 'achieved' ? 'selected' : ''}>Achieved</option>
              <option value="missed" ${_state.fcrFilter === 'missed' ? 'selected' : ''}>Missed</option>
            </select>
          </label>` : ''}
          ${metric === 'csat' ? `
          <label class="dlv-chip-field">Rating
            <select class="dlv-rating-filter">
              <option value="all" ${_state.ratingFilter === 'all' ? 'selected' : ''}>All</option>
              ${distinctValues(allTickets, 'rating').map(r => `<option value="${esc(r)}" ${r === _state.ratingFilter ? 'selected' : ''}>${esc(r)}</option>`).join('')}
            </select>
          </label>` : ''}
        </div>
        <span class="dlv-dim">${tickets.length} of ${allTickets.length} shown</span>
      </div>`;

    if (!tickets.length) {
      return chipsBar + `<div class="av2-empty"><div class="av2-empty-title">No tickets match these filters</div><div class="av2-empty-sub">Try loosening one of the filters above.</div></div>`;
    }

    const ownerFamily = new Set(['unique', 'solely_handled', 'reassigned', 'transferred', 'handed_off_internal']);
    let head, rows;
    if (ownerFamily.has(metric)) {
      head = '<th>Ticket</th><th>Subject</th><th>Status</th><th>Channel</th><th>Created</th><th>Also counts as</th>';
      rows = tickets.map(t => `
        <tr>
          <td>${ticketLink(t)}</td>
          <td class="dlv-subject" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
          <td>${statusPill(t.status, t.status_type)}</td>
          <td>${esc(t.channel || '—')}</td>
          <td>${fmtDateTime(t.created_time)}</td>
          <td>${flagChips(t.flags)}</td>
        </tr>`).join('');
    } else if (metric === 'closed') {
      head = '<th>Ticket</th><th>Subject</th><th>Status</th><th>Channel</th><th>Created</th><th>Closed</th>';
      rows = tickets.map(t => `
        <tr>
          <td>${ticketLink(t)}</td>
          <td class="dlv-subject" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
          <td>${statusPill(t.status, t.status_type)}</td>
          <td>${esc(t.channel || '—')}</td>
          <td>${fmtDateTime(t.created_time)}</td>
          <td>${fmtDateTime(t.closed_time)}</td>
        </tr>`).join('');
    } else if (metric === 'fcr') {
      head = '<th>Ticket</th><th>Subject</th><th>Channel</th><th>Closed</th><th>Resolution (biz hrs)</th><th>Reopens</th><th>FCR</th>';
      rows = tickets.map(t => `
        <tr>
          <td>${ticketLink(t)}</td>
          <td class="dlv-subject" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
          <td>${esc(t.channel || '—')}</td>
          <td>${fmtDateTime(t.closed_time)}</td>
          <td>${t.resolution_business_hours != null ? t.resolution_business_hours : '—'}</td>
          <td>${t.reopen_count || 0}</td>
          <td>${t.fcr_achieved ? '✅' : '❌'}</td>
        </tr>`).join('');
    } else if (metric === 'csat') {
      head = '<th>Ticket</th><th>Subject</th><th>Channel</th><th>Survey time</th><th>Rating</th>';
      rows = tickets.map(t => `
        <tr>
          <td>${ticketLink(t)}</td>
          <td class="dlv-subject" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
          <td>${esc(t.channel || '—')}</td>
          <td>${fmtDateTime(t.survey_time)}</td>
          <td><span class="av2-chip">${esc(t.rating || '—')}</span></td>
        </tr>`).join('');
    } else { // currently_handling
      head = '<th>Ticket</th><th>Subject</th><th>Status</th><th>Channel</th><th>Created</th>';
      rows = tickets.map(t => `
        <tr>
          <td>${ticketLink(t)}</td>
          <td class="dlv-subject" title="${esc(t.subject || '')}">${esc(t.subject || '—')}</td>
          <td>${statusPill(t.status, t.status_type)}</td>
          <td>${esc(t.channel || '—')}</td>
          <td>${fmtDateTime(t.created_time)}</td>
        </tr>`).join('');
    }

    return chipsBar + `
      <div style="overflow-x:auto;">
        <table class="av2-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function totalCardHtml(json) {
    const def = METRIC_DEFS[_state.metric];
    const extra = [];
    if (_state.metric === 'fcr' && json) {
      const yes = json.tickets.filter(t => t.fcr_achieved).length;
      extra.push(`${yes} of ${json.total} achieved (${json.total ? Math.round((yes / json.total) * 1000) / 10 : 0}%)`);
    }
    if (_state.metric === 'csat' && json) {
      const good = json.tickets.filter(t => t.rating === 'Good').length;
      extra.push(`${good} of ${json.total} rated "Good" (${json.total ? Math.round((good / json.total) * 1000) / 10 : 0}%)`);
    }
    return `
      <div class="dlv-total-card">
        <div class="dlv-total-num">${json ? json.total : '—'}</div>
        <div class="dlv-total-meta">
          <div class="dlv-total-label">${esc(def.label)}</div>
          <div class="dlv-total-def">${esc(def.def)}</div>
          ${extra.length ? `<div class="dlv-total-extra">${extra.map(esc).join(' · ')}</div>` : ''}
        </div>
      </div>`;
  }

  function periodControlsHtml() {
    const presets = buildPresets();
    const disabled = _state.metric === 'currently_handling';
    return `
      <label class="dlv-field">
        <span>Period</span>
        <select class="dlv-preset-select" ${disabled ? 'disabled' : ''}>
          ${presets.map(p => `<option value="${p.key}" ${p.key === _state.selectedPreset ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
        </select>
      </label>
      <div class="dlv-date-inputs"${_state.selectedPreset === 'custom' && !disabled ? '' : ' style="display:none"'}>
        <div class="dlv-date-range">
          <input type="date" class="dlv-date-from" value="${esc(_state.customFrom || '')}">
          <span class="dlv-date-sep">to</span>
          <input type="date" class="dlv-date-to" value="${esc(_state.customTo || '')}">
        </div>
        <button type="button" class="av2-btn av2-btn-sm av2-btn-ghost dlv-date-apply">Apply</button>
      </div>
      ${disabled ? `<div class="dlv-live-note">Handling now is live, so it ignores the period above — same as the card.</div>` : ''}`;
  }

  function render() {
    if (!_overlayEl) return;
    const s = _state;
    const json = s.lastResponse;
    const agentPicker = s.isAdmin ? `
      <label class="dlv-field">
        <span>Agent</span>
        <select class="dlv-agent-select">
          ${(s.monitoredAgents || [{ email: s.agentEmail, name: s.agentName }]).map(a =>
            `<option value="${esc(a.email)}" ${a.email === s.agentEmail ? 'selected' : ''}>${esc(a.name || a.email)}</option>`
          ).join('')}
        </select>
      </label>
      <label class="dlv-field dlv-field-search">
        <span>Customer</span>
        <input type="search" class="dlv-q-input" placeholder="Company, contact, or email…" value="${esc(s.q || '')}">
      </label>` : '';

    _overlayEl.querySelector('.dlv-panel').innerHTML = `
      <div class="dlv-head">
        <div>
          <div class="dlv-title">Verify tickets — ${esc(s.agentName || s.agentEmail)}</div>
          <div class="dlv-sub">Exactly which tickets count toward this number, each linking to the real Zoho Desk ticket to check by hand.</div>
        </div>
        <button type="button" class="av2-btn av2-btn-sm av2-btn-ghost dlv-close">Close ✕</button>
      </div>
      <div class="dlv-controls">
        <label class="dlv-field">
          <span>Metric</span>
          <select class="dlv-metric-select">
            ${METRIC_ORDER.map(k => `<option value="${k}" ${k === s.metric ? 'selected' : ''}>${esc(METRIC_DEFS[k].label)}</option>`).join('')}
          </select>
        </label>
        ${periodControlsHtml()}
        ${agentPicker}
      </div>
      ${s.loading ? `<div class="dlv-loading">Loading…</div>` : ''}
      ${s.error ? `<div class="dlv-error">${esc(s.error)}</div>` : ''}
      ${(!s.loading && !s.error) ? totalCardHtml(json) : ''}
      ${(!s.loading && !s.error && json) ? `<div class="dlv-table-wrap">${tableHtml(s.metric, json.tickets)}</div>` : ''}
    `;
    wireControls();
  }

  function wireControls() {
    const root = _overlayEl;
    root.querySelector('.dlv-close').addEventListener('click', closeVerify);

    const metricSel = root.querySelector('.dlv-metric-select');
    if (metricSel) metricSel.addEventListener('change', () => {
      _state.metric = metricSel.value;
      _state.statusFilter = 'all'; _state.channelFilter = 'all'; _state.fcrFilter = 'all'; _state.ratingFilter = 'all';
      fetchAndRender();
    });

    const presetSel = root.querySelector('.dlv-preset-select');
    if (presetSel) presetSel.addEventListener('change', () => {
      _state.selectedPreset = presetSel.value;
      render();
      if (_state.selectedPreset !== 'custom') fetchAndRender();
    });
    const applyBtn = root.querySelector('.dlv-date-apply');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      const from = root.querySelector('.dlv-date-from').value;
      const to = root.querySelector('.dlv-date-to').value;
      if (!from || !to) return;
      _state.customFrom = from; _state.customTo = to;
      fetchAndRender();
    });

    const agentSel = root.querySelector('.dlv-agent-select');
    if (agentSel) agentSel.addEventListener('change', () => {
      const match = (_state.monitoredAgents || []).find(a => a.email === agentSel.value);
      _state.agentEmail = agentSel.value;
      _state.agentName = match ? match.name : agentSel.value;
      fetchAndRender();
    });
    const qInput = root.querySelector('.dlv-q-input');
    if (qInput) {
      let debounceT = null;
      qInput.addEventListener('input', () => {
        clearTimeout(debounceT);
        debounceT = setTimeout(() => { _state.q = qInput.value; fetchAndRender(); }, 400);
      });
    }

    const statusFilter = root.querySelector('.dlv-status-filter');
    if (statusFilter) statusFilter.addEventListener('change', () => { _state.statusFilter = statusFilter.value; render(); });
    const channelFilter = root.querySelector('.dlv-channel-filter');
    if (channelFilter) channelFilter.addEventListener('change', () => { _state.channelFilter = channelFilter.value; render(); });
    const fcrFilter = root.querySelector('.dlv-fcr-filter');
    if (fcrFilter) fcrFilter.addEventListener('change', () => { _state.fcrFilter = fcrFilter.value; render(); });
    const ratingFilter = root.querySelector('.dlv-rating-filter');
    if (ratingFilter) ratingFilter.addEventListener('change', () => { _state.ratingFilter = ratingFilter.value; render(); });
  }

  async function fetchAndRender() {
    _state.loading = true; _state.error = null;
    render();
    try {
      // currently_handling ignores from/to server-side (a live count, same
      // as the card) -- whatever the Period control resolves to here is
      // sent but has no effect on that one metric's result.
      const range = findPreset(_state.selectedPreset).compute();
      const params = new URLSearchParams({
        metric: _state.metric, from: range.from, to: range.to, agentEmail: _state.agentEmail,
      });
      if (_state.q) params.set('q', _state.q);
      const r = await fetch(`/api/desk-lifecycle/verify-tickets?${params.toString()}`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      _state.lastResponse = j;
      _state.isAdmin = !!j.isAdminCaller;
      if (j.monitoredAgents) _state.monitoredAgents = j.monitoredAgents;
      _state.agentName = j.agentName || _state.agentName;
      _state.loading = false;
    } catch (e) {
      _state.loading = false;
      _state.error = e.message || 'Failed to load';
    }
    render();
  }

  function closeVerify() {
    if (_overlayEl && _overlayEl.parentNode) _overlayEl.parentNode.removeChild(_overlayEl);
    _overlayEl = null;
    _state = null;
    document.removeEventListener('keydown', onKeydown);
  }
  function onKeydown(e) { if (e.key === 'Escape') closeVerify(); }

  function openDeskLifecycleVerify(opts) {
    if (!opts || !opts.agentEmail) return;
    if (_overlayEl) closeVerify();

    // Session 34: if the caller passes its own currently-selected preset
    // key (e.g. Period="Today" on the page a pill was clicked from), open
    // already scoped to that same period instead of resetting to Last 30
    // days -- so the numbers being questioned and the ones shown here
    // start out describing the same window. Falls back to a literal
    // custom range built from opts.from/opts.to when no matching preset
    // key is given (or 'custom' is passed with its own customFrom/To).
    const presetKeys = new Set(buildPresets().map(p => p.key));
    let selectedPreset = 'r30', customFrom = null, customTo = null;
    if (opts.presetKey && presetKeys.has(opts.presetKey)) {
      selectedPreset = opts.presetKey;
      if (opts.presetKey === 'custom') { customFrom = opts.customFrom || null; customTo = opts.customTo || null; }
    } else if (opts.from && opts.to) {
      selectedPreset = 'custom';
      customFrom = opts.from.slice(0, 10);
      customTo = opts.to.slice(0, 10);
    }

    _state = {
      agentEmail: opts.agentEmail,
      agentName: opts.agentName || opts.agentEmail,
      isAdmin: !!opts.isAdmin,
      metric: METRIC_DEFS[opts.metric] ? opts.metric : 'unique',
      selectedPreset, customFrom, customTo,
      q: '',
      monitoredAgents: null,
      lastResponse: null,
      loading: true, error: null,
      statusFilter: 'all', channelFilter: 'all', fcrFilter: 'all', ratingFilter: 'all',
    };

    _overlayEl = document.createElement('div');
    _overlayEl.className = 'av2 dlv-overlay';
    _overlayEl.innerHTML = '<div class="dlv-panel"></div>';
    _overlayEl.addEventListener('mousedown', (e) => { if (e.target === _overlayEl) closeVerify(); });
    document.body.appendChild(_overlayEl);
    document.addEventListener('keydown', onKeydown);

    fetchAndRender();
  }

  window.openDeskLifecycleVerify = openDeskLifecycleVerify;
})();
