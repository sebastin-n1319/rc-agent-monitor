/**
 * Roster Admin (Session 16) — public/roster-admin.js
 *
 * Replaces the standalone "T1 CS Team Roster" xlsx. Admins land here from
 * the sidebar to view + edit daily attendance status per agent per day.
 *
 * UX:
 *   • Month picker at top (defaults to current month)
 *   • Grid of agents × days, click any cell to cycle through status codes
 *     (P → OFF → PL → UPL → WFH → On Duty → SL → Holiday → clear).
 *   • Header row colors weekend cells differently.
 *   • Bottom: totals per agent + audit log.
 *
 * Data layer:
 *   GET /api/roster/month/:yyyymm  — fetch grid for a month
 *   POST /api/roster/day           — set a single cell
 *   POST /api/roster/bulk          — set many cells at once
 *   GET /api/roster/agents         — list agents (for adding new)
 *   POST /api/roster/agents        — add/update an agent
 *   GET /api/roster/audit          — recent changes
 */
(function(){
  'use strict';

  const STATUS_ORDER = ['', 'present', 'off', 'pl', 'hd_pl', 'upl', 'sl', 'hd_sl', 'wfh', 'on_duty', 'holiday', 'ncns', 'absent'];
  const STATUS_LABELS = {
    '': '—',
    present: 'P', off: 'OFF', pl: 'PL', hd_pl: '½PL', upl: 'UPL', hd_upl: '½UPL',
    sl: 'SL', hd_sl: '½SL', wfh: 'WFH', on_duty: 'OD', holiday: 'HOL',
    ncns: 'NCNS', relieved: 'REL', absent: 'A', na: 'N/A'
  };
  const STATUS_LONG = {
    '': 'Clear', present: 'Present', off: 'Weekly Off', pl: 'Paid Leave',
    hd_pl: 'Half-day Paid', upl: 'Unpaid Leave', hd_upl: 'Half-day Unpaid',
    sl: 'Sick Leave', hd_sl: 'Half-day Sick', wfh: 'Work From Home',
    on_duty: 'On Duty', holiday: 'Holiday', ncns: 'No Call No Show',
    relieved: 'Relieved', absent: 'Absent', na: 'N/A'
  };

  let _currentMonth = null;
  let _data = null;          // { month, dates, agents, grid }
  let _pendingSaves = new Map(); // key → {date, emp_id, status} — debounced bulk writer
  let _saveTimer = null;

  function currentMonthIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function todayIso() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  async function loadMonth(yyyymm) {
    _currentMonth = yyyymm;
    const res = await fetch('/api/roster/month/' + yyyymm, { credentials: 'include' });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('Failed to load month: ' + t);
    }
    _data = await res.json();
    return _data;
  }

  function render() {
    const root = document.getElementById('roster-admin-root');
    if (!root) return;
    if (!_data) { root.innerHTML = '<div class="ra-loading">Loading roster…</div>'; return; }

    const { dates, agents, grid } = _data;

    // Filter to active agents by default but keep relieved at bottom
    const active = agents.filter(a => a.status !== 'relieved');
    const relieved = agents.filter(a => a.status === 'relieved');
    const showAll = root.querySelector('#ra-show-relieved')?.checked;
    const visibleAgents = showAll ? agents : active;

    const today = todayIso();

    let html = `
      <div class="ra-toolbar">
        <div class="ra-toolbar-left">
          <button class="ra-btn ra-btn-ico" id="ra-prev-month" title="Previous month">‹</button>
          <input type="month" id="ra-month-picker" value="${_currentMonth}" class="ra-month-input">
          <button class="ra-btn ra-btn-ico" id="ra-next-month" title="Next month">›</button>
          <button class="ra-btn" id="ra-today-btn">Today</button>
        </div>
        <div class="ra-toolbar-right">
          <label class="ra-switch"><input type="checkbox" id="ra-show-relieved" ${showAll?'checked':''}> Show relieved (${relieved.length})</label>
          <button class="ra-btn ra-btn-ghost" id="ra-show-audit">Audit log</button>
          <button class="ra-btn ra-btn-ghost" id="ra-add-agent">+ Agent</button>
          <button class="ra-btn ra-btn-primary" id="ra-export-month">Export CSV</button>
        </div>
      </div>

      <div class="ra-legend">
        ${['present','off','pl','hd_pl','upl','sl','wfh','on_duty','holiday','ncns'].map(s =>
          `<span class="ra-legend-item ra-st-${s}"><span class="ra-st-dot"></span>${STATUS_LABELS[s]} · ${STATUS_LONG[s]}</span>`
        ).join('')}
        <span class="ra-legend-tip">Click any cell to cycle status. Shift-click clears.</span>
      </div>

      <div class="ra-grid-wrap">
        <table class="ra-grid">
          <thead>
            <tr>
              <th class="ra-th-sticky ra-th-name">Agent</th>
              ${dates.map(d => {
                const day = new Date(d + 'T00:00:00');
                const dow = day.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = d === today;
                return `<th class="ra-th-day ${isWeekend?'ra-weekend':''} ${isToday?'ra-today':''}" title="${day.toDateString()}">
                  <div class="ra-th-dow">${['S','M','T','W','T','F','S'][dow]}</div>
                  <div class="ra-th-num">${d.slice(-2)}</div>
                </th>`;
              }).join('')}
              <th class="ra-th-tot">P</th>
              <th class="ra-th-tot">OFF</th>
              <th class="ra-th-tot">PL</th>
              <th class="ra-th-tot">UPL</th>
            </tr>
          </thead>
          <tbody>
            ${visibleAgents.map(a => renderAgentRow(a, dates, grid, today)).join('')}
          </tbody>
        </table>
      </div>

      <div class="ra-footer-bar">
        <span class="ra-stat">${visibleAgents.length} agents</span>
        <span class="ra-stat">${dates.length} days</span>
        <span class="ra-stat-flex"></span>
        <span class="ra-save-state" id="ra-save-state"></span>
      </div>
    `;

    root.innerHTML = html;
    wireEvents(root);
  }

  function renderAgentRow(agent, dates, grid, today) {
    const row = grid[agent.emp_id] || {};
    let p=0, off=0, pl=0, upl=0;
    const cells = dates.map(d => {
      const cell = row[d] || { status: '' };
      if (cell.status === 'present' || cell.status === 'wfh') p++;
      else if (cell.status === 'off') off++;
      else if (cell.status === 'pl' || cell.status === 'hd_pl') pl++;
      else if (cell.status === 'upl' || cell.status === 'hd_upl') upl++;
      const day = new Date(d + 'T00:00:00');
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      const isToday = d === today;
      const label = STATUS_LABELS[cell.status] || '';
      return `<td class="ra-cell ra-st-${cell.status||'empty'} ${isWeekend?'ra-weekend':''} ${isToday?'ra-today':''}"
                  data-date="${d}" data-emp="${agent.emp_id}" data-status="${cell.status||''}"
                  title="${agent.pseudo||agent.full_name||agent.emp_id} · ${day.toDateString()}${cell.status?(' · '+STATUS_LONG[cell.status]):''}">${label}</td>`;
    }).join('');

    return `<tr class="ra-row ${agent.status==='relieved'?'ra-row-relieved':''}">
      <td class="ra-td-name ra-th-sticky">
        <div class="ra-agent-pseudo">${agent.pseudo || agent.full_name || agent.emp_id}</div>
        <div class="ra-agent-meta">${agent.emp_id}${agent.shift?' · '+agent.shift:''}</div>
      </td>
      ${cells}
      <td class="ra-td-tot">${p}</td>
      <td class="ra-td-tot">${off}</td>
      <td class="ra-td-tot">${pl}</td>
      <td class="ra-td-tot">${upl}</td>
    </tr>`;
  }

  function wireEvents(root) {
    // Month nav
    root.querySelector('#ra-prev-month')?.addEventListener('click', () => shiftMonth(-1));
    root.querySelector('#ra-next-month')?.addEventListener('click', () => shiftMonth(+1));
    root.querySelector('#ra-month-picker')?.addEventListener('change', e => {
      loadMonth(e.target.value).then(render).catch(showError);
    });
    root.querySelector('#ra-today-btn')?.addEventListener('click', () => {
      loadMonth(currentMonthIso()).then(render).catch(showError);
    });
    root.querySelector('#ra-show-relieved')?.addEventListener('change', render);
    root.querySelector('#ra-add-agent')?.addEventListener('click', openAddAgent);
    root.querySelector('#ra-show-audit')?.addEventListener('click', openAuditLog);
    root.querySelector('#ra-export-month')?.addEventListener('click', exportCsv);

    // Cell clicks
    root.querySelectorAll('.ra-cell').forEach(cell => {
      cell.addEventListener('click', e => onCellClick(cell, e));
    });
  }

  function shiftMonth(delta) {
    if (!_currentMonth) return;
    const [y, m] = _currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    loadMonth(next).then(render).catch(showError);
  }

  function onCellClick(cell, ev) {
    const cur = cell.dataset.status || '';
    let next;
    if (ev.shiftKey) {
      next = '';
    } else {
      const idx = STATUS_ORDER.indexOf(cur);
      next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    }
    cell.dataset.status = next;
    cell.className = cell.className.replace(/ra-st-\S+/g, '').trim() + ' ra-st-' + (next || 'empty');
    // weekend/today flags still apply
    const date = cell.dataset.date;
    const day = new Date(date + 'T00:00:00');
    if (day.getDay() === 0 || day.getDay() === 6) cell.classList.add('ra-weekend');
    if (date === todayIso()) cell.classList.add('ra-today');
    cell.textContent = STATUS_LABELS[next] || '';

    // Update grid in-memory + recompute totals on this row
    const empId = cell.dataset.emp;
    if (!_data.grid[empId]) _data.grid[empId] = {};
    if (next) _data.grid[empId][date] = { status: next, note: null };
    else delete _data.grid[empId][date];
    recomputeRowTotals(cell.parentElement, empId);

    // Queue save
    _pendingSaves.set(date + '|' + empId, { date, emp_id: empId, status: next });
    scheduleSave();
  }

  function recomputeRowTotals(tr, empId) {
    if (!tr) return;
    const row = _data.grid[empId] || {};
    let p=0, off=0, pl=0, upl=0;
    for (const d of _data.dates) {
      const s = row[d]?.status;
      if (s === 'present' || s === 'wfh') p++;
      else if (s === 'off') off++;
      else if (s === 'pl' || s === 'hd_pl') pl++;
      else if (s === 'upl' || s === 'hd_upl') upl++;
    }
    const tots = tr.querySelectorAll('.ra-td-tot');
    if (tots.length >= 4) {
      tots[0].textContent = p; tots[1].textContent = off;
      tots[2].textContent = pl; tots[3].textContent = upl;
    }
  }

  function scheduleSave() {
    setSaveState('saving', 'Saving…');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(flushSaves, 650);
  }

  async function flushSaves() {
    if (_pendingSaves.size === 0) return;
    const updates = Array.from(_pendingSaves.values());
    _pendingSaves.clear();
    try {
      const res = await fetch('/api/roster/bulk', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Save failed');
      setSaveState('ok', `Saved ${updates.length} change${updates.length===1?'':'s'} · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.error('roster save failed', e);
      setSaveState('err', 'Save failed — ' + e.message);
    }
  }

  function setSaveState(kind, msg) {
    const el = document.getElementById('ra-save-state');
    if (!el) return;
    el.className = 'ra-save-state ra-save-' + kind;
    el.textContent = msg;
  }

  function openAddAgent() {
    const html = `
      <div class="ra-modal-backdrop" id="ra-add-backdrop">
        <div class="ra-modal">
          <div class="ra-modal-head">
            <div class="ra-modal-title">Add / Edit Agent</div>
            <button class="ra-modal-close" id="ra-add-close">×</button>
          </div>
          <div class="ra-modal-body">
            <div class="ra-form-row"><label>Emp ID</label><input id="ra-f-emp_id" placeholder="AD0xxx"></div>
            <div class="ra-form-row"><label>Pseudo Name</label><input id="ra-f-pseudo" placeholder="Display name"></div>
            <div class="ra-form-row"><label>Full Name</label><input id="ra-f-full_name"></div>
            <div class="ra-form-row"><label>Email</label><input id="ra-f-email" type="email"></div>
            <div class="ra-form-row"><label>Designation</label><input id="ra-f-designation"></div>
            <div class="ra-form-row"><label>DOJ</label><input id="ra-f-doj" type="date"></div>
            <div class="ra-form-row"><label>Shift</label><input id="ra-f-shift" placeholder="e.g. 8.30 PM - 5.30 AM"></div>
            <div class="ra-form-row"><label>Status</label>
              <select id="ra-f-status"><option value="active">Active</option><option value="relieved">Relieved</option><option value="on_leave">On Leave</option></select>
            </div>
            <div class="ra-form-row"><label>Notes</label><textarea id="ra-f-notes" rows="2"></textarea></div>
          </div>
          <div class="ra-modal-foot">
            <button class="ra-btn" id="ra-add-cancel">Cancel</button>
            <button class="ra-btn ra-btn-primary" id="ra-add-save">Save Agent</button>
          </div>
        </div>
      </div>
    `;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    document.getElementById('ra-add-close').onclick =
      document.getElementById('ra-add-cancel').onclick = () => document.getElementById('ra-add-backdrop').remove();
    document.getElementById('ra-add-save').onclick = async () => {
      const body = {
        emp_id: document.getElementById('ra-f-emp_id').value.trim(),
        pseudo: document.getElementById('ra-f-pseudo').value.trim() || null,
        full_name: document.getElementById('ra-f-full_name').value.trim() || null,
        email: document.getElementById('ra-f-email').value.trim().toLowerCase() || null,
        designation: document.getElementById('ra-f-designation').value.trim() || null,
        doj: document.getElementById('ra-f-doj').value || null,
        shift: document.getElementById('ra-f-shift').value.trim() || null,
        status: document.getElementById('ra-f-status').value,
        notes: document.getElementById('ra-f-notes').value.trim() || null,
      };
      if (!body.emp_id) { alert('Emp ID is required'); return; }
      try {
        const res = await fetch('/api/roster/agents', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.error);
        document.getElementById('ra-add-backdrop').remove();
        await loadMonth(_currentMonth);
        render();
      } catch (e) { alert('Save failed: ' + e.message); }
    };
  }

  async function openAuditLog() {
    let events = [];
    try {
      const r = await fetch('/api/roster/audit?limit=80', { credentials: 'include' });
      const j = await r.json();
      events = j.events || [];
    } catch(e) { return alert('Could not load audit log'); }

    const html = `
      <div class="ra-modal-backdrop" id="ra-audit-backdrop">
        <div class="ra-modal ra-modal-wide">
          <div class="ra-modal-head">
            <div class="ra-modal-title">Recent Changes (${events.length})</div>
            <button class="ra-modal-close" id="ra-audit-close">×</button>
          </div>
          <div class="ra-modal-body">
            ${events.length === 0 ? '<div class="ra-empty">No changes yet.</div>' :
              `<table class="ra-audit-tbl">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Agent</th><th>Date</th><th>From → To</th></tr></thead>
                <tbody>
                  ${events.map(e => `<tr>
                    <td>${e.ts || ''}</td>
                    <td>${e.actor_name || e.actor_email || '—'}</td>
                    <td>${e.action}</td>
                    <td>${e.emp_id || '—'}</td>
                    <td>${e.date || '—'}</td>
                    <td>${(e.prev_status||'∅')} → ${(e.new_status||'∅')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
          </div>
        </div>
      </div>
    `;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    document.getElementById('ra-audit-close').onclick = () => document.getElementById('ra-audit-backdrop').remove();
  }

  function exportCsv() {
    if (!_data) return;
    const { dates, agents, grid } = _data;
    const header = ['Emp ID','Pseudo','Full Name','Email','Designation','Shift', ...dates];
    const lines = [header.join(',')];
    for (const a of agents) {
      const row = grid[a.emp_id] || {};
      const cells = [
        a.emp_id, csv(a.pseudo), csv(a.full_name), csv(a.email),
        csv(a.designation), csv(a.shift),
        ...dates.map(d => STATUS_LABELS[row[d]?.status || ''] || '')
      ];
      lines.push(cells.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster-${_currentMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    function csv(v) {
      if (v == null) return '';
      const s = String(v);
      return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }
  }

  function showError(e) {
    const root = document.getElementById('roster-admin-root');
    if (root) root.innerHTML = `<div class="ra-error">${e.message || e}</div>`;
    console.error('[Roster]', e);
  }

  // Entry point — called from index.html when admin opens the Roster tab
  window.openRosterAdmin = async function openRosterAdmin() {
    const root = document.getElementById('roster-admin-root');
    if (!root) return;
    root.innerHTML = '<div class="ra-loading">Loading roster…</div>';
    try {
      await loadMonth(_currentMonth || currentMonthIso());
      render();
    } catch (e) {
      showError(e);
    }
  };
})();
