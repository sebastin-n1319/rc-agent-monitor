/**
 * schedule-admin.js — UI module for Schedule Adherence Part 2 (Session 5).
 *
 * Owns:
 *   • Dashboard modal — today's adherence, auto-grouped by status
 *   • Per-agent schedule editor — 7 day-of-week rows + working toggle
 *   • Bulk apply modal — pick template + agents → POST /api/schedules/bulk
 *   • Inline timeline visualization (planned vs actual)
 *   • History viewer for versioned schedule changes
 *
 * Feature flag: scheduleAdherenceV2 (default OFF — set via setFlag).
 * Keyboard shortcut: `T` opens dashboard (admin only).
 *
 * Public API (window-scoped):
 *   ScheduleAdmin.open()
 *   ScheduleAdmin.close()
 *   ScheduleAdmin.editSchedule(email)
 *   ScheduleAdmin.openBulkApply()
 *   ScheduleAdmin.refresh()
 */
(function () {
  'use strict';

  const ML = window.Motion || window.motion || {};
  const animate = ML.animate || null;
  const SPRING = [0.22, 1, 0.36, 1];

  // ─── State ───────────────────────────────────────────────────────────
  let adherenceCache = [];
  let schedulesCache = {};        // { email → rowsArray }
  let agentRoster = [];           // monitored_agents (for bulk apply picker)
  let dashboardOpen = false;
  let currentDate = null;

  // 3 hardcoded templates for bulk apply. Templates-in-DB land in Session 6.
  const TEMPLATES = [
    {
      id: 'mf95',
      name: 'Mon-Fri · 9 AM – 5 PM CST',
      week: makeUniformWeek({ workDays: [1,2,3,4,5], start: '09:00', end: '17:00' })
    },
    {
      id: 'mf84',
      name: 'Mon-Fri · 8 AM – 4 PM CST',
      week: makeUniformWeek({ workDays: [1,2,3,4,5], start: '08:00', end: '16:00' })
    },
    {
      id: 'ts106',
      name: 'Tue-Sat · 10 AM – 6 PM CST',
      week: makeUniformWeek({ workDays: [2,3,4,5,6], start: '10:00', end: '18:00' })
    }
  ];

  function makeUniformWeek({ workDays, start, end, timezone = 'America/Chicago' }) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const working = workDays.includes(d);
      week.push({
        day_of_week: d,
        is_working_day: working ? 1 : 0,
        start_time: working ? start : '00:00',
        end_time: working ? end : '00:00',
        timezone
      });
    }
    return week;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (v != null) node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(c => {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function flagOn(name) {
    if (typeof window.flag === 'function') return window.flag(name);
    return true;
  }

  function todayISO(tz = 'America/Chicago') {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz });
  }

  function fmtTime(m) {
    if (m == null || !isFinite(m)) return '—';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function dayName(d) {
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d] || '?';
  }

  function statusBadge(status) {
    const map = {
      'no-show':    { ico: '🚫', label: 'No-show',    cls: 'critical' },
      'late':       { ico: '⏰', label: 'Late',       cls: 'warning' },
      'minor-late': { ico: '⏱️', label: 'Minor late', cls: 'warning' },
      'early-leave':{ ico: '🚪', label: 'Early leave',cls: 'warning' },
      'overstay':   { ico: '📈', label: 'Overstay',   cls: 'info' },
      'on-time':    { ico: '✓',  label: 'On-time',    cls: 'success' },
      'day-off':    { ico: '🛌', label: 'Day off',    cls: 'muted' },
      'pending':    { ico: '⏳', label: 'Pending',    cls: 'muted' },
      'unknown':    { ico: '?',  label: 'Unknown',    cls: 'muted' }
    };
    return map[status] || map.unknown;
  }

  // ─── Severity → group ordering ───────────────────────────────────────
  const GROUP_ORDER = ['no-show','late','minor-late','early-leave','overstay','pending','unknown','on-time','day-off'];

  // ─── Data fetching ───────────────────────────────────────────────────
  async function fetchAdherence(date) {
    try {
      const r = await fetch('/api/schedule-adherence?date=' + encodeURIComponent(date), { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'load failed');
      adherenceCache = j.adherence || [];
      currentDate = j.date;
      return adherenceCache;
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Failed to load adherence: ' + e.message, 'error', 4000);
      return [];
    }
  }

  async function fetchAllSchedules() {
    try {
      const r = await fetch('/api/schedules', { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) return {};
      schedulesCache = j.schedules || {};
      return schedulesCache;
    } catch (e) { return {}; }
  }

  async function fetchAgentRoster() {
    try {
      const r = await fetch('/api/agents', { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) return [];
      agentRoster = j.data || [];
      return agentRoster;
    } catch (e) { return []; }
  }

  // ─── Dashboard modal ─────────────────────────────────────────────────
  function ensureDashboard() {
    let modal = document.getElementById('sa-dashboard');
    if (modal) return modal;
    modal = el('div', {
      id: 'sa-dashboard',
      class: 'sa-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Schedule Adherence Dashboard',
      onClick: (e) => { if (e.target.id === 'sa-dashboard') close(); }
    }, [
      el('div', { class: 'sa-modal sa-modal-dash' }, [
        el('div', { class: 'sa-modal-head' }, [
          el('div', { class: 'sa-modal-title' }, [
            el('span', { text: 'Schedule Adherence' }),
            el('span', { id: 'sa-date-chip', class: 'sa-chip' })
          ]),
          el('div', { class: 'sa-modal-actions' }, [
            el('button', { class: 'sa-btn sa-btn-ghost', text: '+ Add agent…', onClick: () => editSchedule(null) }),
            el('button', { class: 'sa-btn sa-btn-primary', text: 'Bulk apply…', onClick: openBulkApply }),
            el('button', { class: 'sa-btn sa-btn-close', text: '✕', 'aria-label': 'Close', onClick: close })
          ])
        ]),
        el('div', { class: 'sa-filters' }, [
          el('label', { html: 'Show <select id="sa-filter"><option value="all">All</option><option value="issues">Issues only</option><option value="ontime">On-time only</option></select>' }),
          el('label', { html: 'Severity <select id="sa-sev"><option value="">Any</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select>' }),
          el('input', { id: 'sa-search', type: 'text', placeholder: '🔍 Search agents…' })
        ]),
        el('div', { id: 'sa-dash-body', class: 'sa-dash-body' })
      ])
    ]);
    document.body.appendChild(modal);
    modal.querySelector('#sa-filter').addEventListener('change', renderDashboard);
    modal.querySelector('#sa-sev').addEventListener('change', renderDashboard);
    modal.querySelector('#sa-search').addEventListener('input', renderDashboard);
    return modal;
  }

  function renderDashboard() {
    const body = document.getElementById('sa-dash-body');
    const dateChip = document.getElementById('sa-date-chip');
    if (!body) return;
    const filter = document.getElementById('sa-filter')?.value || 'all';
    const sevFilter = document.getElementById('sa-sev')?.value || '';
    const q = (document.getElementById('sa-search')?.value || '').toLowerCase().trim();

    if (dateChip) dateChip.textContent = (currentDate || todayISO()) + ' · ' + adherenceCache.length + ' agents';

    if (!adherenceCache.length) {
      body.innerHTML = `<div class="sa-empty">
        <div class="sa-empty-ico">📭</div>
        <div class="sa-empty-title">No agents tracked</div>
        <div class="sa-empty-sub">Add agents in Manage Agents, then come back to set their schedules.</div>
      </div>`;
      return;
    }

    // Filter
    let rows = adherenceCache;
    if (q) rows = rows.filter(r => (r.name || r.email || '').toLowerCase().includes(q));
    if (filter === 'issues') rows = rows.filter(r => ['no-show','late','minor-late','early-leave','overstay'].includes(r.status));
    if (filter === 'ontime') rows = rows.filter(r => r.status === 'on-time');
    if (sevFilter) {
      const sevMap = { critical: ['no-show'], warning: ['late','minor-late','early-leave'], info: ['overstay'] };
      const allow = sevMap[sevFilter] || [];
      rows = rows.filter(r => allow.includes(r.status));
    }

    if (!rows.length) {
      body.innerHTML = `<div class="sa-empty">
        <div class="sa-empty-ico">✓</div>
        <div class="sa-empty-title">No matches</div>
        <div class="sa-empty-sub">Try changing the filters above.</div>
      </div>`;
      return;
    }

    // Group by status
    const groups = {};
    for (const r of rows) {
      const key = r.status || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }

    const orderedGroups = GROUP_ORDER.filter(g => groups[g]);
    body.innerHTML = orderedGroups.map(status => {
      const badge = statusBadge(status);
      const items = groups[status].map(rowHtml).join('');
      return `<section class="sa-group sa-group-${esc(badge.cls)}">
        <header class="sa-group-head">
          <span class="sa-group-ico">${badge.ico}</span>
          <span class="sa-group-label">${esc(badge.label)}</span>
          <span class="sa-group-count">${groups[status].length}</span>
        </header>
        <div class="sa-group-body">${items}</div>
      </section>`;
    }).join('');

    // Wire row buttons
    body.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => editSchedule(btn.dataset.email));
    });
    body.querySelectorAll('[data-action="end"]').forEach(btn => {
      btn.addEventListener('click', () => endSchedule(btn.dataset.email));
    });

    if (animate) {
      body.querySelectorAll('.sa-row').forEach((row, i) => {
        animate(row, { opacity: [0, 1], y: [8, 0] }, { duration: 0.25, delay: Math.min(i, 12) * 0.025, easing: SPRING });
      });
    }
  }

  // Single row in the dashboard
  function rowHtml(r) {
    const sched = r.schedule || {};
    const scheduledRange = sched.isWorkingDay === false
      ? '— day off —'
      : (sched.start || '09:00') + '–' + (sched.end || '17:00');
    const varianceTxt = r.startVarianceMin != null
      ? (r.startVarianceMin > 0 ? '+' + r.startVarianceMin + ' min' : r.startVarianceMin + ' min')
      : '';
    const flags = (r.flags || []).filter(f => f !== 'error').map(f => `<span class="sa-flag">${esc(f)}</span>`).join('');
    return `<article class="sa-row" data-email="${esc(r.email)}">
      <div class="sa-row-name">
        <strong>${esc(r.name || r.email)}</strong>
        <span class="sa-row-meta">${esc(r.email)}</span>
      </div>
      <div class="sa-row-times">
        <div class="sa-row-sched">${esc(scheduledRange)}</div>
        <div class="sa-row-actual">${esc(r.summary || '')}</div>
        ${flags ? `<div class="sa-row-flags">${flags}</div>` : ''}
        ${timelineHtml(r)}
      </div>
      <div class="sa-row-vari">${esc(varianceTxt)}</div>
      <div class="sa-row-actions">
        <button class="sa-btn sa-btn-ghost sa-btn-sm" data-action="edit" data-email="${esc(r.email)}">Edit</button>
        ${sched.source === 'configured' ? `<button class="sa-btn sa-btn-ghost sa-btn-sm sa-btn-danger" data-action="end" data-email="${esc(r.email)}" title="End-date this schedule">⋯</button>` : ''}
      </div>
    </article>`;
  }

  // Mini timeline showing planned vs actual
  function timelineHtml(r) {
    const sched = r.schedule || {};
    if (sched.isWorkingDay === false) return '';
    const startStr = sched.start || '09:00';
    const endStr = sched.end || '17:00';
    const [sH, sM] = startStr.split(':').map(Number);
    const [eH, eM] = endStr.split(':').map(Number);
    const start = sH * 60 + sM;
    const end = eH * 60 + eM;
    if (!isFinite(start) || !isFinite(end) || end <= start) return '';
    // Treat day as 24h window
    const totalMin = 1440;
    const schedLeft = (start / totalMin) * 100;
    const schedWidth = ((end - start) / totalMin) * 100;
    // Actual bar
    let actLeft = null, actWidth = null;
    if (r.startVarianceMin != null) {
      const actualStart = start + r.startVarianceMin;
      const actualEnd = r.endVarianceMin != null ? end + r.endVarianceMin : Math.min(actualStart + (end - start), totalMin);
      if (isFinite(actualStart) && actualStart >= 0 && actualStart < totalMin) {
        actLeft = (actualStart / totalMin) * 100;
        actWidth = Math.max(2, ((actualEnd - actualStart) / totalMin) * 100);
      }
    }
    return `<div class="sa-timeline" title="Scheduled vs actual">
      <div class="sa-tl-track">
        <div class="sa-tl-sched" style="left:${schedLeft}%;width:${schedWidth}%"></div>
        ${actLeft != null ? `<div class="sa-tl-actual" style="left:${actLeft}%;width:${actWidth}%"></div>` : `<div class="sa-tl-missing" style="left:${schedLeft}%;width:${schedWidth}%"></div>`}
      </div>
    </div>`;
  }

  // ─── Per-agent editor ────────────────────────────────────────────────
  function editSchedule(email) {
    closeDashboard();
    if (!email) {
      email = prompt('Agent email to edit:');
      if (!email) return;
    }
    let modal = document.getElementById('sa-editor');
    if (modal) { modal.remove(); }
    modal = buildEditor(email);
    document.body.appendChild(modal);
    loadEditorData(email);
  }

  function buildEditor(email) {
    const existing = (schedulesCache[email] || []);
    // Resolve current week from latest effective_from
    const week = buildCurrentWeek(existing);
    return el('div', {
      id: 'sa-editor',
      class: 'sa-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Edit schedule',
      onClick: (e) => { if (e.target.id === 'sa-editor') closeEditor(); }
    }, [
      el('div', { class: 'sa-modal sa-modal-editor' }, [
        el('div', { class: 'sa-modal-head' }, [
          el('div', { class: 'sa-modal-title' }, [
            el('span', { text: 'Edit Schedule' }),
            el('span', { class: 'sa-chip', text: email })
          ]),
          el('div', { class: 'sa-modal-actions' }, [
            el('button', { class: 'sa-btn sa-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeEditor })
          ])
        ]),
        el('div', { class: 'sa-editor-head' }, [
          el('label', { html: 'Effective from <input id="sa-eff-from" type="date" value="' + esc(todayISO()) + '">' }),
          el('label', { html: 'Timezone <select id="sa-tz"><option value="America/Chicago">America/Chicago (CST)</option><option value="America/New_York">America/New_York (EST)</option><option value="America/Los_Angeles">America/Los_Angeles (PST)</option><option value="Asia/Kolkata">Asia/Kolkata (IST)</option></select>' })
        ]),
        el('div', { id: 'sa-week-rows', class: 'sa-week-rows', html: weekRowsHtml(week) }),
        el('div', { class: 'sa-modal-foot' }, [
          el('button', { class: 'sa-link', text: 'View history →', onClick: () => viewHistory(email) }),
          el('div', { class: 'sa-foot-actions' }, [
            el('button', { class: 'sa-btn sa-btn-ghost', text: 'Cancel', onClick: closeEditor }),
            el('button', { id: 'sa-save', class: 'sa-btn sa-btn-primary', text: '💾 Save', onClick: () => saveEditor(email) })
          ])
        ])
      ])
    ]);
  }

  function buildCurrentWeek(rows) {
    // Pick the most recent row for each day_of_week
    const map = {};
    for (const r of (rows || [])) {
      if (!map[r.day_of_week] || r.effective_from > map[r.day_of_week].effective_from) {
        map[r.day_of_week] = r;
      }
    }
    const week = [];
    for (let d = 0; d < 7; d++) {
      const existing = map[d];
      if (existing) {
        week.push({
          day_of_week: d,
          is_working_day: existing.is_working_day,
          start_time: existing.start_time,
          end_time: existing.end_time,
          timezone: existing.timezone
        });
      } else {
        const defaultWorking = d >= 1 && d <= 5;
        week.push({
          day_of_week: d,
          is_working_day: defaultWorking ? 1 : 0,
          start_time: defaultWorking ? '09:00' : '00:00',
          end_time: defaultWorking ? '17:00' : '00:00',
          timezone: 'America/Chicago'
        });
      }
    }
    return week;
  }

  function weekRowsHtml(week) {
    return week.map(row => {
      const working = row.is_working_day !== 0;
      return `<div class="sa-week-row ${working ? 'sa-working' : 'sa-off'}" data-day="${row.day_of_week}">
        <div class="sa-day-name">${esc(dayName(row.day_of_week))}</div>
        <label class="sa-day-toggle">
          <input type="checkbox" ${working ? 'checked' : ''} data-field="working">
          <span>${working ? 'Working' : 'Off'}</span>
        </label>
        <input type="time" data-field="start" value="${esc(row.start_time || '09:00')}" ${working ? '' : 'disabled'}>
        <span class="sa-day-sep">→</span>
        <input type="time" data-field="end" value="${esc(row.end_time || '17:00')}" ${working ? '' : 'disabled'}>
      </div>`;
    }).join('');
  }

  async function loadEditorData(email) {
    try {
      const r = await fetch('/api/schedules/' + encodeURIComponent(email), { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) return;
      schedulesCache[email] = j.schedules || [];
      // Re-render with fresh data
      const wkBody = document.getElementById('sa-week-rows');
      if (wkBody) wkBody.innerHTML = weekRowsHtml(buildCurrentWeek(schedulesCache[email]));
      attachEditorToggles();
    } catch (e) {}
  }

  function attachEditorToggles() {
    const wk = document.getElementById('sa-week-rows');
    if (!wk) return;
    wk.querySelectorAll('.sa-week-row').forEach(row => {
      const toggle = row.querySelector('[data-field="working"]');
      const startInput = row.querySelector('[data-field="start"]');
      const endInput = row.querySelector('[data-field="end"]');
      const label = row.querySelector('.sa-day-toggle span');
      if (!toggle) return;
      toggle.addEventListener('change', () => {
        const on = toggle.checked;
        row.classList.toggle('sa-working', on);
        row.classList.toggle('sa-off', !on);
        if (startInput) startInput.disabled = !on;
        if (endInput) endInput.disabled = !on;
        if (label) label.textContent = on ? 'Working' : 'Off';
      });
    });
  }

  function closeEditor() {
    const m = document.getElementById('sa-editor');
    if (m) m.remove();
    // Re-open dashboard if we came from there
    if (dashboardOpen) renderDashboard();
  }

  async function saveEditor(email) {
    const effectiveFrom = document.getElementById('sa-eff-from')?.value;
    const tz = document.getElementById('sa-tz')?.value || 'America/Chicago';
    if (!effectiveFrom) {
      if (typeof window.showToast === 'function') window.showToast('Please choose an effective date', 'warning');
      return;
    }
    const week = [];
    document.querySelectorAll('#sa-week-rows .sa-week-row').forEach(row => {
      const day = parseInt(row.dataset.day);
      const working = row.querySelector('[data-field="working"]')?.checked ? 1 : 0;
      const start = row.querySelector('[data-field="start"]')?.value || '00:00';
      const end = row.querySelector('[data-field="end"]')?.value || '00:00';
      week.push({ day_of_week: day, is_working_day: working, start_time: start, end_time: end, timezone: tz });
    });
    const saveBtn = document.getElementById('sa-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    try {
      const r = await fetch('/api/schedules/' + encodeURIComponent(email), {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveFrom, week })
      });
      const j = await r.json();
      if (j.success) {
        if (typeof window.showToast === 'function') window.showToast('✓ Schedule saved for ' + email, 'success', 2500);
        closeEditor();
        if (dashboardOpen) await refresh();
      } else {
        if (typeof window.showToast === 'function') window.showToast('Failed: ' + (j.error || 'unknown'), 'error', 3500);
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Network error: ' + e.message, 'error', 3500);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save'; }
    }
  }

  async function endSchedule(email) {
    if (!confirm('End the current schedule for ' + email + '? They will fall back to the default 9-5 Mon-Fri.')) return;
    try {
      const r = await fetch('/api/schedules/' + encodeURIComponent(email), { method: 'DELETE', credentials: 'same-origin' });
      const j = await r.json();
      if (j.success && typeof window.showToast === 'function') {
        window.showToast('Schedule ended for ' + email, 'info', 2500);
        await refresh();
      }
    } catch (e) {}
  }

  // ─── History view ────────────────────────────────────────────────────
  async function viewHistory(email) {
    try {
      const r = await fetch('/api/schedules/' + encodeURIComponent(email) + '/history', { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) return;
      const lines = (j.history || []).map(h => {
        return (h.effective_from || '?') + ' → ' + (h.effective_to || 'open') +
          ' · day ' + h.day_of_week + ' · ' + (h.is_working_day ? (h.start_time + '–' + h.end_time) : 'off') +
          ' (by ' + (h.created_by || 'system') + ')';
      });
      alert('Schedule history for ' + email + ':\n\n' + (lines.join('\n') || 'No history yet — only default schedule applies.'));
    } catch (e) {}
  }

  // ─── Bulk apply ──────────────────────────────────────────────────────
  async function openBulkApply() {
    closeDashboard();
    if (!agentRoster.length) await fetchAgentRoster();
    let modal = document.getElementById('sa-bulk');
    if (modal) modal.remove();
    modal = el('div', {
      id: 'sa-bulk',
      class: 'sa-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bulk apply schedule',
      onClick: (e) => { if (e.target.id === 'sa-bulk') closeBulk(); }
    }, [
      el('div', { class: 'sa-modal sa-modal-bulk' }, [
        el('div', { class: 'sa-modal-head' }, [
          el('div', { class: 'sa-modal-title' }, [el('span', { text: 'Bulk apply schedule' })]),
          el('div', { class: 'sa-modal-actions' }, [
            el('button', { class: 'sa-btn sa-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeBulk })
          ])
        ]),
        el('div', { class: 'sa-bulk-body' }, [
          el('div', { class: 'sa-step' }, [
            el('h3', { text: '1 · Choose template' }),
            el('div', { id: 'sa-templates', class: 'sa-template-list', html: TEMPLATES.map((t, i) =>
              `<label class="sa-template"><input type="radio" name="sa-tpl" value="${esc(t.id)}" ${i === 0 ? 'checked' : ''}><div><strong>${esc(t.name)}</strong></div></label>`
            ).join('') })
          ]),
          el('div', { class: 'sa-step' }, [
            el('h3', { text: '2 · Pick agents' }),
            el('div', { class: 'sa-bulk-toolbar' }, [
              el('label', { html: '<input type="checkbox" id="sa-select-all"> Select all' }),
              el('span', { id: 'sa-bulk-count', class: 'sa-bulk-count', text: '0 selected' }),
              el('input', { id: 'sa-bulk-search', type: 'text', placeholder: '🔍 Filter…' })
            ]),
            el('div', { id: 'sa-bulk-agents', class: 'sa-bulk-agents' })
          ]),
          el('div', { class: 'sa-step' }, [
            el('h3', { text: '3 · Effective from' }),
            el('input', { id: 'sa-bulk-eff', type: 'date', value: todayISO() })
          ])
        ]),
        el('div', { class: 'sa-modal-foot' }, [
          el('span', { class: 'sa-foot-hint', text: 'Existing schedules will be end-dated automatically.' }),
          el('div', { class: 'sa-foot-actions' }, [
            el('button', { class: 'sa-btn sa-btn-ghost', text: 'Cancel', onClick: closeBulk }),
            el('button', { id: 'sa-bulk-apply', class: 'sa-btn sa-btn-primary', text: 'Apply', onClick: applyBulk })
          ])
        ])
      ])
    ]);
    document.body.appendChild(modal);
    renderBulkAgents();
    modal.querySelector('#sa-select-all').addEventListener('change', (e) => {
      modal.querySelectorAll('.sa-bulk-cb:not([disabled])').forEach(cb => { cb.checked = e.target.checked; });
      updateBulkCount();
    });
    modal.querySelector('#sa-bulk-search').addEventListener('input', renderBulkAgents);
  }

  function renderBulkAgents() {
    const wrap = document.getElementById('sa-bulk-agents');
    if (!wrap) return;
    const q = (document.getElementById('sa-bulk-search')?.value || '').toLowerCase().trim();
    const filtered = (agentRoster || []).filter(a => !q || (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
    if (!filtered.length) {
      wrap.innerHTML = '<div class="sa-empty"><div class="sa-empty-ico">👥</div><div class="sa-empty-title">No agents found</div></div>';
      return;
    }
    wrap.innerHTML = filtered.map(a => {
      const hasEmail = !!a.email;
      return `<label class="sa-bulk-row${hasEmail ? '' : ' sa-disabled'}" title="${hasEmail ? '' : 'No email on file — cannot apply'}">
        <input type="checkbox" class="sa-bulk-cb" value="${esc(a.email || '')}" ${hasEmail ? '' : 'disabled'}>
        <div><strong>${esc(a.name)}</strong> <span class="sa-row-meta">${esc(a.email || '— no email')}</span></div>
      </label>`;
    }).join('');
    wrap.querySelectorAll('.sa-bulk-cb').forEach(cb => cb.addEventListener('change', updateBulkCount));
    updateBulkCount();
  }

  function updateBulkCount() {
    const checked = document.querySelectorAll('.sa-bulk-cb:checked').length;
    const countEl = document.getElementById('sa-bulk-count');
    if (countEl) countEl.textContent = checked + ' selected';
    const applyBtn = document.getElementById('sa-bulk-apply');
    if (applyBtn) {
      applyBtn.disabled = checked === 0;
      applyBtn.textContent = checked === 0 ? 'Apply' : 'Apply to ' + checked;
    }
  }

  async function applyBulk() {
    const tplId = document.querySelector('input[name="sa-tpl"]:checked')?.value;
    const tpl = TEMPLATES.find(t => t.id === tplId);
    if (!tpl) { if (typeof window.showToast === 'function') window.showToast('Pick a template', 'warning'); return; }
    const emails = Array.from(document.querySelectorAll('.sa-bulk-cb:checked')).map(cb => cb.value).filter(Boolean);
    if (!emails.length) { if (typeof window.showToast === 'function') window.showToast('Pick at least one agent', 'warning'); return; }
    const effectiveFrom = document.getElementById('sa-bulk-eff')?.value;
    if (!effectiveFrom) { if (typeof window.showToast === 'function') window.showToast('Pick effective date', 'warning'); return; }

    const btn = document.getElementById('sa-bulk-apply');
    if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }
    try {
      const r = await fetch('/api/schedules/bulk', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, effectiveFrom, week: tpl.week })
      });
      const j = await r.json();
      const okCount = (j.results || []).filter(x => x.ok).length;
      const failCount = (j.results || []).filter(x => !x.ok).length;
      if (typeof window.showToast === 'function') {
        if (failCount === 0) window.showToast('✓ Applied to ' + okCount + ' agents', 'success', 3000);
        else window.showToast(okCount + ' applied, ' + failCount + ' failed', 'warning', 4000);
      }
      closeBulk();
      await refresh();
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Bulk apply failed: ' + e.message, 'error', 4000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
    }
  }

  function closeBulk() {
    const m = document.getElementById('sa-bulk');
    if (m) m.remove();
  }

  // ─── Open / close / refresh ──────────────────────────────────────────
  async function open() {
    if (!flagOn('scheduleAdherenceV2')) {
      if (typeof window.showToast === 'function') {
        window.showToast('Schedule Adherence is in preview — enable via setFlag(\'scheduleAdherenceV2\', true)', 'info', 4000);
      }
      return;
    }
    ensureDashboard();
    dashboardOpen = true;
    const modal = document.getElementById('sa-dashboard');
    modal.style.display = 'flex';
    await refresh();
    if (animate) {
      animate(modal, { opacity: [0, 1] }, { duration: 0.15 });
      animate(modal.querySelector('.sa-modal'), { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] }, { duration: 0.25, easing: SPRING });
    }
  }

  function close() {
    closeDashboard();
  }

  function closeDashboard() {
    const modal = document.getElementById('sa-dashboard');
    if (!modal) return;
    dashboardOpen = false;
    if (animate) {
      animate(modal, { opacity: [1, 0] }, { duration: 0.12 }).finished.then(() => { modal.style.display = 'none'; });
    } else {
      modal.style.display = 'none';
    }
  }

  async function refresh() {
    const date = todayISO();
    await Promise.all([
      fetchAdherence(date),
      fetchAllSchedules()
    ]);
    renderDashboard();
  }

  // ─── Status-bar button (lazy injected) ───────────────────────────────
  function ensureStatusBarButton() {
    if (document.getElementById('sa-bar-btn')) return;
    const sbRight = document.querySelector('#status-bar .sb-right');
    if (!sbRight) return;
    const btn = el('button', {
      id: 'sa-bar-btn', class: 'sb-btn',
      title: 'Schedule Adherence (T)',
      'aria-label': 'Open schedule adherence',
      onClick: open,
      text: '📅'
    });
    // Insert before the bell if present
    const bell = document.getElementById('ac-bell');
    if (bell) sbRight.insertBefore(btn, bell);
    else sbRight.insertBefore(btn, sbRight.firstChild);
  }

  // ─── Keyboard shortcut ───────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toUpperCase() || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') open();
    if (e.key === 'Escape') {
      if (document.getElementById('sa-bulk')?.style.display !== 'none' && document.getElementById('sa-bulk')) closeBulk();
      else if (document.getElementById('sa-editor')) closeEditor();
      else if (dashboardOpen) closeDashboard();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    ensureStatusBarButton();
  }
  document.addEventListener('DOMContentLoaded', init);
  if (window.MutationObserver) {
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('app-authenticated')) init();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // ─── Public API ──────────────────────────────────────────────────────
  window.ScheduleAdmin = {
    open,
    close,
    refresh,
    editSchedule,
    openBulkApply
  };
})();
