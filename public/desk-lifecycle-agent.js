/**
 * My Ticket Stats — Session 20
 * (+ Session 27: hover tooltips on every stat, delta-vs-prior-period
 * chips, a Status filter + sortable columns on the Recent tickets table.)
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
 * Session 27: every "My numbers" stat card now carries a data-tip
 * explaining exactly what it counts (same wording/definitions as the
 * admin page's tooltips, so the two never disagree) -- FCR/CSAT show
 * this agent's live numerator/denominator, not just the formula. Cards
 * also show a small delta chip vs. the same-length prior period where
 * that comparison makes sense (skipped for the two live/non-windowed
 * numbers: Handling now and Avg handle time isn't skipped -- it IS
 * windowed by closed date, so it does get a delta). The Recent tickets
 * table gained a Status filter and click-to-sort Created/Closed columns,
 * both client-side against the already-loaded up-to-200 rows.
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

  // Session 28: the Session 25 customer/company search box was dropped --
  // an individual agent's own tickets rarely span enough companies for a
  // name/email search to be useful, and it was flagged as dead weight.
  // Replaced with filters that actually help an agent look at their own
  // work: Status (Session 27), Channel, FCR outcome, and a Reassigned-only
  // toggle -- all client-side against whatever's already been fetched (up
  // to 200 rows), so none of these trigger a network round-trip.
  let _ticketStatusFilter = 'all';
  let _ticketChannelFilter = 'all';
  let _ticketFcrFilter = 'all'; // 'all' | 'achieved' | 'missed'
  let _ticketReassignedOnly = false;
  let _ticketSortKey = 'created'; // 'created' | 'closed'
  let _ticketSortDir = 'desc';    // 'asc' | 'desc'

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

  // Session 27: same-length period immediately before `range`, mirroring
  // desk-lifecycle-admin.js's previousRange() -- used only for the "My
  // numbers" delta chips.
  function previousRange(range) {
    const spanMs = new Date(range.to).getTime() - new Date(range.from).getTime();
    if (!(spanMs > 0)) return null;
    return { from: new Date(new Date(range.from).getTime() - spanMs).toISOString(), to: range.from };
  }

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

  // Session 32: agents had no visibility at all into how fresh this
  // page's numbers are -- unlike the admin Ticket Lifecycle page, My
  // Stats showed no sync status, so there was no way to tell "my ticket
  // isn't showing up yet" apart from a real bug vs. just not-yet-synced.
  // Mirrors desk-lifecycle-admin.js's minutesAgo() helper.
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

  // Session 33 redesign ("this can look better"): the Range + sync note
  // used to render as two stacked plain-text lines directly under the
  // header, with no container of their own -- easy to mistake for leftover
  // debug text. Consolidated into one bordered strip with an icon-led
  // Range segment and a live-dot Sync segment, each a compact chip inside
  // a shared pill so the pair reads as one deliberate status component.
  // The sync segment keeps the full "why it might be behind" explanation
  // as a hover tooltip (see wireTooltips()) rather than inline, since the
  // short form is all most agents need most of the time.
  function metaBarHtml(summaryJson, syncStatus) {
    const rangeItem = `
      <div class="mystats-meta-item">
        ${statIcon('calendar')}
        <span>${esc(fmtDateTime(summaryJson.from))} <span class="mystats-meta-arrow">&rarr;</span> ${esc(fmtDateTime(summaryJson.to))}</span>
      </div>`;
    let syncItem = '';
    if (syncStatus && syncStatus.lastSyncAt) {
      const ago = minutesAgo(syncStatus.lastSyncAt);
      const abs = fmtDateTime(syncStatus.lastSyncAt);
      const shortText = ago ? `Synced ${ago}` : `Synced ${abs}`;
      const fullText = `Ticket data last synced ${ago ? `${ago} (${abs})` : abs} — syncs automatically every 20 min, so a brand-new ticket may take a few minutes to show up here.`;
      syncItem = `
        <div class="mystats-meta-item mystats-meta-sync" data-tip="${esc(fullText)}">
          <span class="mystats-sync-dot" aria-hidden="true"></span>
          <span>${esc(shortText)} <span class="mystats-meta-dim">&middot; every 20 min</span></span>
        </div>`;
    }
    return `<div class="mystats-meta-bar">${rangeItem}${syncItem}</div>`;
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
    const params = new URLSearchParams({ from, to });
    const r = await fetch(`/api/desk-lifecycle/my-summary?${params.toString()}`, { credentials: 'include' });
    if (r.status === 401) throw new Error('Not logged in');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load your ticket summary');
    return j;
  }

  // Session 27: best-effort -- a failed/slow previous-period fetch should
  // never block or error out the main view, it just means no delta chips.
  async function loadMySummarySafe(range) {
    try { return await loadMySummary(range); } catch (e) { return null; }
  }

  // Session 32: same status endpoint the admin Ticket Lifecycle page
  // already uses (requireAuth, not requireAdmin -- agents can read it
  // too), just for the "last synced" note below. Best-effort like
  // loadMySummarySafe() above: never blocks or errors out the page if
  // it's slow or fails, the note just doesn't render.
  async function loadSyncStatusSafe() {
    try {
      const r = await fetch('/api/desk-lifecycle/status', { credentials: 'include' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.success ? j : null;
    } catch (e) { return null; }
  }

  async function loadMyTickets(range) {
    const { from, to } = range;
    const params = new URLSearchParams({ from, to });
    const r = await fetch(`/api/desk-lifecycle/my-tickets?${params.toString()}`, { credentials: 'include' });
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
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  };
  function statIcon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ICON.ticket}</svg>`;
  }

  // ── Session 27: tooltip copy — same definitions/wording as
  // desk-lifecycle-admin.js's metricTip() so the two pages never
  // disagree about what a number means. FCR/CSAT are built from this
  // agent's live numerator/denominator.
  function fmtPct(pct) { return (pct == null) ? '—' : `${pct}%`; }
  function metricTip(key, s) {
    switch (key) {
      case 'unique':
        return 'Unique tickets\n\nEvery ticket you appear in anywhere in its ownership history — even one hand-off counts, once. Counted by when the ticket was CREATED.';
      case 'solely':
        return 'Solely handled\n\nOf your Unique tickets: the ones you owned start to finish with no one else ever touching it, and the ticket is now Closed.';
      case 'reassigned':
        return 'Reassigned\n\nTickets that arrived already in progress — someone else owned it immediately before you picked it up.';
      case 'transferred':
        return 'Transferred\n\nTickets you handed off to someone outside the T1 roster (a different team). See "Departments transferred to" below for where they went.';
      case 'handed_off':
        return 'Handed off (T1)\n\nTickets you handed directly to another monitored T1 agent — stayed inside the team, so it does NOT count as a cross-team Transfer. The receiving agent logs it as their own Reassigned.';
      case 'closed':
        return 'Closed\n\nTickets now Closed in Zoho Desk, closed within this date range — credited to whoever is the CURRENT owner, even if it passed through other hands first.';
      case 'handling':
        return 'Handling now\n\nTickets you currently own that are still open. A live count — not limited to the selected date range.';
      case 'avg_handle':
        return 'Avg handle time\n\nAverage time from ticket creation to closing, across your Closed tickets in range. Wall-clock hours (calendar time), not business hours — see FCR for the business-hours definition.';
      case 'fcr': {
        const total = s.fcr_total || 0, yes = s.fcr_yes || 0;
        if (!total) return 'First Contact Resolution (FCR)\n\nNo Closed tickets in this range yet.';
        return `First Contact Resolution (FCR)\n\n${yes} of ${total} closed tickets resolved within 24 business hours (Mon–Fri, 7am–7pm CST) with zero reopens.\n\n${yes} / ${total} = ${fmtPct(s.fcr_pct)}\n\nCredited to whoever currently owns the ticket, even after a transfer.`;
      }
      case 'csat': {
        const total = s.csat_total || 0, good = s.csat_good || 0;
        if (!total) return 'Customer Satisfaction (CSAT)\n\nNo survey responses in this range yet.';
        return `Customer Satisfaction (CSAT)\n\n${good} of ${total} survey responses were rated "Good".\n\n${good} / ${total} = ${fmtPct(s.csat_pct)}\n\nRatings: Good / Okay / Bad. Counted by when the survey was submitted, not when the ticket closed.`;
      }
      default: return '';
    }
  }

  function deltaChip(curr, prev, opts) {
    opts = opts || {};
    if (prev == null || curr == null) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < (opts.epsilon || 0.05)) return `<span class="av2-tkt-delta av2-tkt-delta-flat">flat</span>`;
    const up = diff > 0;
    const good = opts.higherIsBetter == null ? null : (up === opts.higherIsBetter);
    const cls = good == null ? '' : (good ? ' av2-tkt-delta-good' : ' av2-tkt-delta-bad');
    const sign = up ? '▲' : '▼';
    const magnitude = opts.pct ? `${Math.abs(Math.round(diff * 10) / 10)}pt` : Math.abs(Math.round(diff * 10) / 10);
    return `<span class="av2-tkt-delta${cls}">${sign} ${magnitude}</span>`;
  }

  function stat(icon, tone, value, label, tipKey, s, prevS, deltaOpts) {
    const tip = tipKey ? metricTip(tipKey, s || {}) : '';
    const delta = (deltaOpts && prevS) ? deltaChip(deltaOpts.curr, deltaOpts.prev, deltaOpts) : '';
    return `
      <article class="av2-stat"${tone ? ` data-tone="${tone}"` : ''}${tip ? ` data-tip="${esc(tip)}"` : ''}>
        <div class="av2-stat-ico" aria-hidden="true">${statIcon(icon)}</div>
        <div class="av2-stat-label">${esc(label)}</div>
        <div class="av2-stat-value">${value}${delta ? ` ${delta}` : ''}</div>
      </article>`;
  }
  function panel(title, sub, body, sectionId) {
    return `
      <section class="av2-section"${sectionId ? ` id="${sectionId}"` : ''}>
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

  function statsSection(s, prevS) {
    if (!s) return noDataPanel();
    const fcr = s.fcr_pct != null ? `${s.fcr_pct}%` : (s.fcr_total ? '0%' : '—');
    const csat = s.csat_pct != null ? `${s.csat_pct}%` : (s.csat_total ? '0%' : '—');
    const avgHandle = s.avg_handle_hours != null ? `${s.avg_handle_hours}h` : '—';
    const body = `
      <div class="av2-stat-grid">
        ${stat('ticket', null,   s.unique_tickets || 0, 'Unique tickets', 'unique', s, prevS, { curr: s.unique_tickets || 0, prev: prevS ? (prevS.unique_tickets || 0) : null, higherIsBetter: null })}
        ${stat('check',  'green', s.solely_handled || 0, 'Solely handled', 'solely', s, prevS, { curr: s.solely_handled || 0, prev: prevS ? (prevS.solely_handled || 0) : null, higherIsBetter: true })}
        ${stat('alert',  'red',   s.reassigned || 0, 'Reassigned', 'reassigned', s, prevS, { curr: s.reassigned || 0, prev: prevS ? (prevS.reassigned || 0) : null, higherIsBetter: false })}
        ${stat('swap',   'amber', s.transferred || 0, 'Transferred', 'transferred', s, prevS, { curr: s.transferred || 0, prev: prevS ? (prevS.transferred || 0) : null, higherIsBetter: false })}
        ${stat('swap',   null,    s.handed_off_internal || 0, 'Handed off (T1)', 'handed_off', s, prevS, { curr: s.handed_off_internal || 0, prev: prevS ? (prevS.handed_off_internal || 0) : null, higherIsBetter: null })}
        ${stat('check',  'teal',  s.closed_count || 0, 'Closed', 'closed', s, prevS, { curr: s.closed_count || 0, prev: prevS ? (prevS.closed_count || 0) : null, higherIsBetter: null })}
        ${stat('pulse',  'blue',  s.currently_handling || 0, 'Handling now', 'handling', s, null, null)}
        ${stat('clock',  'purple', avgHandle, 'Avg handle time', 'avg_handle', s, prevS, (prevS && prevS.avg_handle_hours != null && s.avg_handle_hours != null) ? { curr: s.avg_handle_hours, prev: prevS.avg_handle_hours, higherIsBetter: false } : null)}
        ${stat('target', 'teal',  fcr, `FCR${s.fcr_total ? ` (${s.fcr_total})` : ''}`, 'fcr', s, prevS, (prevS && prevS.fcr_pct != null && s.fcr_pct != null) ? { curr: s.fcr_pct, prev: prevS.fcr_pct, higherIsBetter: true, pct: true } : null)}
        ${stat('star',   'purple', csat, `CSAT${s.csat_total ? ` (${s.csat_total})` : ''}`, 'csat', s, prevS, (prevS && prevS.csat_pct != null && s.csat_pct != null) ? { curr: s.csat_pct, prev: prevS.csat_pct, higherIsBetter: true, pct: true } : null)}
      </div>`;
    return panel('My numbers', 'Unique/solely-handled/reassigned and the breakdowns below count tickets created in this range; Closed/Avg handle/FCR count tickets closed in this range; Handling now is live. Hover any card for what it means, and — where a comparable prior period exists — how it changed.', body);
  }

  function breakdownSection(s) {
    if (!s) return '';
    const hasTransfers = s.departments_transferred && Object.keys(s.departments_transferred).length;
    const body = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--av2-s3);">
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Channel</div>${breakdownChips(s.channel)}</div>
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Adit App Module</div>${breakdownChips(s.module)}</div>
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Category</div>${breakdownChips(s.category)}</div>
        <div><div class="av2-stat-label" style="margin-bottom:8px;">Classification</div>${breakdownChips(s.classification)}</div>
        ${hasTransfers ? `<div><div class="av2-stat-label" style="margin-bottom:8px;">Departments transferred to</div>${breakdownChips(s.departments_transferred)}</div>` : ''}
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

  // Session 27: distinct status_type values present in this ticket set,
  // for the Status filter dropdown -- built from the data itself rather
  // than a hardcoded list, so it never drifts from what Zoho actually
  // returns.
  function distinctStatuses(tickets) {
    const set = new Set();
    tickets.forEach(t => { const v = (t.status_type || t.status || '').trim(); if (v) set.add(v); });
    return Array.from(set).sort();
  }

  // Session 28: distinct channel values present in this ticket set, for
  // the Channel filter -- same data-driven approach as distinctStatuses so
  // it never drifts from what Zoho actually returns.
  function distinctChannels(tickets) {
    const set = new Set();
    tickets.forEach(t => { const v = (t.channel || '').trim(); if (v) set.add(v); });
    return Array.from(set).sort();
  }

  function sortIndicator(key) {
    if (_ticketSortKey !== key) return '';
    return _ticketSortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function ticketsTable(allTickets) {
    if (!allTickets.length) {
      return emptyState('No tickets found', 'Nothing in this range yet.');
    }
    const statuses = distinctStatuses(allTickets);
    const channels = distinctChannels(allTickets);
    const anyReassigned = allTickets.some(t => (t.reassign_count || 0) > 0);

    let tickets = allTickets;
    if (_ticketStatusFilter !== 'all') tickets = tickets.filter(t => (t.status_type || t.status || '') === _ticketStatusFilter);
    if (_ticketChannelFilter !== 'all') tickets = tickets.filter(t => (t.channel || '') === _ticketChannelFilter);
    if (_ticketFcrFilter === 'achieved') tickets = tickets.filter(t => t.fcr_achieved === 'true');
    else if (_ticketFcrFilter === 'missed') tickets = tickets.filter(t => t.fcr_achieved !== 'true');
    if (_ticketReassignedOnly) tickets = tickets.filter(t => (t.reassign_count || 0) > 0);

    tickets = [...tickets].sort((a, b) => {
      const field = _ticketSortKey === 'closed' ? 'closed_time' : 'created_time';
      const av = a[field] ? new Date(a[field]).getTime() : (_ticketSortDir === 'asc' ? Infinity : -Infinity);
      const bv = b[field] ? new Date(b[field]).getTime() : (_ticketSortDir === 'asc' ? Infinity : -Infinity);
      return _ticketSortDir === 'asc' ? av - bv : bv - av;
    });

    // Session 28: Status/Channel/FCR/Reassigned filters -- built from the
    // data itself (only shown when there's actually more than one value to
    // filter by), all narrowing the same already-loaded 200-row set.
    const filterBar = (statuses.length > 1 || channels.length > 1 || anyReassigned) ? `
      <div class="mystats-ticket-toolbar">
        <div class="mystats-ticket-filters">
          ${statuses.length > 1 ? `
          <label class="mystats-filter-chip">
            Status
            <select class="mystats-status-filter">
              <option value="all" ${_ticketStatusFilter === 'all' ? 'selected' : ''}>All (${allTickets.length})</option>
              ${statuses.map(s => {
                const n = allTickets.filter(t => (t.status_type || t.status || '') === s).length;
                return `<option value="${esc(s)}" ${s === _ticketStatusFilter ? 'selected' : ''}>${esc(s)} (${n})</option>`;
              }).join('')}
            </select>
          </label>` : ''}
          ${channels.length > 1 ? `
          <label class="mystats-filter-chip">
            Channel
            <select class="mystats-channel-filter">
              <option value="all" ${_ticketChannelFilter === 'all' ? 'selected' : ''}>All channels</option>
              ${channels.map(c => {
                const n = allTickets.filter(t => (t.channel || '') === c).length;
                return `<option value="${esc(c)}" ${c === _ticketChannelFilter ? 'selected' : ''}>${esc(c)} (${n})</option>`;
              }).join('')}
            </select>
          </label>` : ''}
          <label class="mystats-filter-chip">
            FCR
            <select class="mystats-fcr-filter">
              <option value="all" ${_ticketFcrFilter === 'all' ? 'selected' : ''}>All</option>
              <option value="achieved" ${_ticketFcrFilter === 'achieved' ? 'selected' : ''}>Achieved</option>
              <option value="missed" ${_ticketFcrFilter === 'missed' ? 'selected' : ''}>Missed</option>
            </select>
          </label>
          ${anyReassigned ? `
          <label class="mystats-filter-chip mystats-filter-toggle">
            <input type="checkbox" class="mystats-reassigned-only" ${_ticketReassignedOnly ? 'checked' : ''}>
            Reassigned only
          </label>` : ''}
        </div>
        <span class="av2-section-meta">${tickets.length} of ${allTickets.length} shown</span>
      </div>` : '';

    if (!tickets.length) {
      return filterBar + emptyState('No tickets match these filters', 'Try loosening one of the filters above.');
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
    return filterBar + `
      <div style="overflow-x:auto;">
        <table class="av2-table">
          <thead><tr>
            <th>Ticket</th><th>Subject</th><th>Status</th><th>Channel</th><th>Category</th>
            <th>Reassigned</th><th>FCR</th>
            <th class="mystats-sortable" data-sort-key="created" style="cursor:pointer;">Created${sortIndicator('created')}</th>
            <th class="mystats-sortable" data-sort-key="closed" style="cursor:pointer;">Closed${sortIndicator('closed')}</th>
          </tr></thead>
          <tbody id="mystats-ticket-rows">${rows}</tbody>
        </table>
      </div>`;
  }

  function render(root, summaryJson, ticketsJson, prevSummaryJson, syncStatus) {
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
                  <div class="mystats-date-range">
                    <input type="date" class="mystats-date-from" value="${esc(_customFrom || '')}">
                    <span class="mystats-date-sep">to</span>
                    <input type="date" class="mystats-date-to" value="${esc(_customTo || '')}">
                  </div>
                  <button type="button" class="av2-btn av2-btn-sm av2-btn-ghost mystats-date-apply">Apply</button>
                </div>`;
            })()}
          </div>
        </div>
        ${metaBarHtml(summaryJson, syncStatus)}

        ${statsSection(summaryJson.summary, prevSummaryJson ? prevSummaryJson.summary : null)}
        ${callStatsSection(summaryJson.callStats)}
        ${chatStatsSection(summaryJson.chatStats, summaryJson.chatPresence)}
        ${breakdownSection(summaryJson.summary)}

        ${panel('Recent tickets', 'Most recently created first by default, up to 200 — click Created or Closed to re-sort, or narrow by Status, Channel, FCR outcome, or reassignment.', ticketsTable(ticketsJson.tickets || []), 'mystats-tickets-section')}
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

    wireTicketsToolbar(root, ticketsJson);
    wireTooltips(root);

    // Stagger the ticket rows in, matching the dashboard's row entrance
    // (see agent-view-v2.js) — same Motion One instance, already loaded.
    animateTicketRows(root);
  }

  // Session 27/28: Status/Channel/FCR/Reassigned filters + click-to-sort
  // Created/Closed, all re-rendering just the tickets table against the
  // already-loaded data (no network round-trip). Shared between the
  // initial render() and rerenderTicketsTable() so every filter stays
  // wired the same way in both places.
  function wireTicketsToolbar(root, ticketsJson) {
    const statusSel = root.querySelector('.mystats-status-filter');
    if (statusSel) statusSel.addEventListener('change', () => {
      _ticketStatusFilter = statusSel.value;
      rerenderTicketsTable(root, ticketsJson);
    });
    const channelSel = root.querySelector('.mystats-channel-filter');
    if (channelSel) channelSel.addEventListener('change', () => {
      _ticketChannelFilter = channelSel.value;
      rerenderTicketsTable(root, ticketsJson);
    });
    const fcrSel = root.querySelector('.mystats-fcr-filter');
    if (fcrSel) fcrSel.addEventListener('change', () => {
      _ticketFcrFilter = fcrSel.value;
      rerenderTicketsTable(root, ticketsJson);
    });
    const reassignedToggle = root.querySelector('.mystats-reassigned-only');
    if (reassignedToggle) reassignedToggle.addEventListener('change', () => {
      _ticketReassignedOnly = reassignedToggle.checked;
      rerenderTicketsTable(root, ticketsJson);
    });
    root.querySelectorAll('.mystats-sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (_ticketSortKey === key) _ticketSortDir = _ticketSortDir === 'asc' ? 'desc' : 'asc';
        else { _ticketSortKey = key; _ticketSortDir = 'desc'; }
        rerenderTicketsTable(root, ticketsJson);
      });
    });
  }

  function rerenderTicketsTable(root, ticketsJson) {
    const ticketsPanel = root.querySelector('#mystats-tickets-section .av2-panel');
    if (!ticketsPanel) return;
    // Body is everything after the section-head inside this panel.
    const head = ticketsPanel.querySelector('.av2-section-head');
    const body = ticketsTable(ticketsJson.tickets || []);
    // Remove existing content after head, then insert fresh.
    while (head && head.nextSibling) ticketsPanel.removeChild(head.nextSibling);
    ticketsPanel.insertAdjacentHTML('beforeend', body);
    wireTicketsToolbar(root, ticketsJson);
    animateTicketRows(root);
  }

  function animateTicketRows(root) {
    const ML = window.Motion || window.motion || {};
    const animate = ML.animate || null;
    if (!animate) return;
    const rows = root.querySelectorAll('#mystats-ticket-rows tr');
    rows.forEach((tr, i) => {
      const d = Math.min(i, 24);
      animate(tr, { opacity: [0, 1], y: [8, 0] }, { duration: 0.28, delay: d * 0.02, easing: [0.22, 1, 0.36, 1] });
    });
  }

  // ── Session 27: hover/focus tooltip system (mirrors desk-lifecycle-
  // admin.js's -- see the comment there for why this is JS-positioned
  // rather than pure CSS). Uses its own element/class so it never
  // collides with the admin page's tooltip if both scripts are ever
  // loaded together (they are, per index.html, though only one root is
  // visible at a time).
  let _tipEl = null;
  function ensureTipEl() {
    if (_tipEl && document.body.contains(_tipEl)) return _tipEl;
    _tipEl = document.createElement('div');
    _tipEl.className = 'av2-tkt-tooltip';
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
    tip.classList.add('av2-tkt-tooltip-visible');
    const ar = anchor.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let top = ar.top - tr.height - 10;
    let flipped = false;
    if (top < 8) { top = ar.bottom + 10; flipped = true; }
    let left = ar.left + ar.width / 2 - tr.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.classList.toggle('av2-tkt-tooltip-below', flipped);
  }
  function hideTip() {
    if (_tipEl) _tipEl.classList.remove('av2-tkt-tooltip-visible');
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
  if (!window.__av2TktTooltipScrollWired) {
    window.__av2TktTooltipScrollWired = true;
    window.addEventListener('scroll', hideTip, { passive: true, capture: true });
    window.addEventListener('resize', hideTip, { passive: true });
  }

  function skeletonHTML() {
    const card = () => `<div class="av2-stat"><div class="av2-skel" style="height:12px;width:55%;margin-bottom:10px;"></div><div class="av2-skel" style="height:24px;width:38%;"></div></div>`;
    return `
      <div class="av2-container">
        <div class="av2-skel" style="height:22px;width:200px;margin-bottom:8px;border-radius:6px;"></div>
        <div class="av2-skel" style="height:14px;width:320px;margin-bottom:24px;border-radius:6px;"></div>
        <div class="av2-stat-grid">${Array.from({ length: 10 }).map(card).join('')}</div>
      </div>`;
  }

  window.openDeskLifecycleAgent = async function () {
    const root = document.getElementById('desk-lifecycle-agent-root');
    if (!root) return;
    root.innerHTML = skeletonHTML();
    try {
      const range = currentRange();
      const prevRange = previousRange(range);
      const [summaryJson, ticketsJson, prevSummaryJson, syncStatus] = await Promise.all([
        loadMySummary(range),
        loadMyTickets(range),
        prevRange ? loadMySummarySafe(prevRange) : Promise.resolve(null),
        loadSyncStatusSafe(),
      ]);
      render(root, summaryJson, ticketsJson, prevSummaryJson, syncStatus);
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
