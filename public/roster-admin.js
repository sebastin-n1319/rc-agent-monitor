/**
 * Roster Admin (Session 16 — v2 redesign, 2026-05-27)
 *
 * Replaces the standalone "T1 CS Team Roster" xlsx. Admin lands here from
 * the sidebar to see and edit daily attendance for the team.
 *
 * Layout (top → bottom):
 *   1. KPI strip — Active agents · Present today · On leave today · Coverage %
 *   2. Toolbar  — month picker, prev/next, today, agent search, +Agent,
 *                 Audit log, Export CSV, "Show relieved" toggle
 *   3. Legend   — color-coded status palette
 *   4. Grid     — agent × day matrix; click cell for status palette popover
 *   5. Footer   — save state + selection count
 *
 * Interactions:
 *   • Cell click   → small popover with all status options + a "Clear" button
 *   • Cell shift-click → quick clear without opening popover
 *   • Bulk saves debounced 600ms via POST /api/roster/bulk
 *   • Agent search filters rows live
 */
(function(){
  'use strict';

  const STATUS_LABELS = {
    '': '—',
    present: 'P',  off: 'OFF', pl: 'PL', hd_pl: '½PL',
    upl: 'UPL', hd_upl: '½UPL', sl: 'SL', hd_sl: '½SL',
    wfh: 'WFH', on_duty: 'OD', holiday: 'HOL',
    ncns: 'NCNS', relieved: 'REL', absent: 'A', na: 'N/A',
  };
  const STATUS_LONG = {
    present: 'Present', off: 'Weekly Off', pl: 'Paid Leave',
    hd_pl: 'Half-day Paid', upl: 'Unpaid Leave', hd_upl: 'Half-day Unpaid',
    sl: 'Sick Leave', hd_sl: 'Half-day Sick', wfh: 'Work From Home',
    on_duty: 'On Duty', holiday: 'Holiday', ncns: 'No Call No Show',
    relieved: 'Relieved', absent: 'Absent', na: 'N/A',
  };
  // Order used in the palette popover and legend
  const PALETTE_ORDER = [
    'present','wfh','on_duty','off','holiday',
    'pl','hd_pl','upl','hd_upl','sl','hd_sl',
    'ncns','absent'
  ];

  let _state = {
    month: null,                  // 'YYYY-MM'
    data: null,                   // { dates, agents, grid }
    showRelieved: false,
    agentSearch: '',
    pendingSaves: new Map(),
    saveTimer: null,
  };

  // ─── Helpers ────────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const todayIso = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  };
  const currentMonthIso = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  };
  const monthLabel = (yyyymm) => {
    const [y, m] = yyyymm.split('-').map(Number);
    return new Date(y, m-1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };
  const dowLetter = (date) => 'SMTWTFS'[new Date(date+'T00:00:00').getDay()];
  const isWeekend = (date) => {
    const d = new Date(date+'T00:00:00').getDay();
    return d === 0 || d === 6;
  };

  // ─── Data loading ────────────────────────────────────────────────────────
  async function loadMonth(yyyymm) {
    _state.month = yyyymm;
    const r = await fetch('/api/roster/month/' + yyyymm, { credentials: 'include' });
    if (!r.ok) throw new Error('Could not load roster: ' + r.status);
    _state.data = await r.json();
    return _state.data;
  }

  async function callSeed() {
    const r = await fetch('/api/admin/roster/reseed', { method:'POST', credentials:'include' });
    return r.json();
  }

  // ─── Top-level entry point ───────────────────────────────────────────────
  window.openRosterAdmin = async function openRosterAdmin() {
    const root = $('#roster-admin-root');
    if (!root) return;
    root.innerHTML = `<div class="rx-loading"><div class="rx-spinner"></div>Loading roster…</div>`;
    try {
      await loadMonth(_state.month || currentMonthIso());
      render();
    } catch (e) {
      root.innerHTML = `<div class="rx-error">Failed to load roster: ${escape(e.message)}</div>`;
    }
  };

  function escape(s) { return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ─── Render ──────────────────────────────────────────────────────────────
  function render() {
    const root = $('#roster-admin-root');
    if (!_state.data) return;
    const { dates, agents, grid } = _state.data;

    if (!agents || agents.length === 0) { renderEmpty(root); return; }

    const today = todayIso();
    const todayInMonth = today.startsWith(_state.month);

    // Filter agents by relieved toggle + search
    const search = _state.agentSearch.toLowerCase();
    let visible = agents.filter(a => _state.showRelieved || a.status !== 'relieved');
    if (search) {
      visible = visible.filter(a =>
        (a.pseudo||'').toLowerCase().includes(search) ||
        (a.full_name||'').toLowerCase().includes(search) ||
        (a.emp_id||'').toLowerCase().includes(search) ||
        (a.email||'').toLowerCase().includes(search)
      );
    }

    // KPI calculations — for today (only if current month visible)
    let presentToday = 0, onLeaveToday = 0;
    if (todayInMonth) {
      for (const a of visible) {
        const s = (grid[a.emp_id]||{})[today]?.status;
        if (s === 'present' || s === 'wfh' || s === 'on_duty') presentToday++;
        else if (s === 'pl' || s === 'hd_pl' || s === 'upl' || s === 'hd_upl' || s === 'sl' || s === 'hd_sl') onLeaveToday++;
      }
    }
    const activeCount = visible.length;
    const coverage = activeCount ? Math.round((presentToday / activeCount) * 100) : 0;
    const relievedCount = agents.filter(a => a.status === 'relieved').length;

    root.innerHTML = `
      <div class="rx-wrap">
        <!-- KPI strip -->
        <div class="rx-kpis">
          <div class="rx-kpi">
            <div class="rx-kpi-lbl">Active agents</div>
            <div class="rx-kpi-val">${activeCount}</div>
            <div class="rx-kpi-sub">${relievedCount} relieved</div>
          </div>
          <div class="rx-kpi rx-kpi-green">
            <div class="rx-kpi-lbl">Present today</div>
            <div class="rx-kpi-val">${todayInMonth ? presentToday : '—'}</div>
            <div class="rx-kpi-sub">${todayInMonth ? 'P · WFH · OD' : 'past month'}</div>
          </div>
          <div class="rx-kpi rx-kpi-amber">
            <div class="rx-kpi-lbl">On leave today</div>
            <div class="rx-kpi-val">${todayInMonth ? onLeaveToday : '—'}</div>
            <div class="rx-kpi-sub">${todayInMonth ? 'PL · UPL · SL' : 'past month'}</div>
          </div>
          <div class="rx-kpi rx-kpi-teal">
            <div class="rx-kpi-lbl">Coverage today</div>
            <div class="rx-kpi-val">${todayInMonth ? coverage + '%' : '—'}</div>
            <div class="rx-kpi-sub">${todayInMonth ? `${presentToday}/${activeCount} live` : ''}</div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="rx-toolbar">
          <div class="rx-tb-group">
            <button class="rx-icon-btn" id="rx-prev" title="Previous month">‹</button>
            <div class="rx-month-display">
              <input type="month" id="rx-month-input" value="${_state.month}">
              <span class="rx-month-label">${monthLabel(_state.month)}</span>
            </div>
            <button class="rx-icon-btn" id="rx-next" title="Next month">›</button>
            <button class="rx-pill" id="rx-today-btn">Today</button>
          </div>
          <div class="rx-tb-group rx-tb-grow">
            <div class="rx-search">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="rx-search-ico"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
              <input type="text" id="rx-search" placeholder="Search agents…" value="${escape(_state.agentSearch)}">
            </div>
          </div>
          <div class="rx-tb-group">
            <label class="rx-switch"><input type="checkbox" id="rx-show-relieved" ${_state.showRelieved?'checked':''}> Show relieved (${relievedCount})</label>
            <button class="rx-pill" id="rx-audit">Audit log</button>
            <button class="rx-pill" id="rx-add">+ Agent</button>
            <button class="rx-pill rx-pill-primary" id="rx-export">Export CSV</button>
          </div>
        </div>

        <!-- Legend -->
        <div class="rx-legend">
          ${PALETTE_ORDER.map(s => `<span class="rx-lg rx-st-${s}"><span class="rx-lg-code">${STATUS_LABELS[s]}</span><span class="rx-lg-name">${STATUS_LONG[s]}</span></span>`).join('')}
          <span class="rx-lg-tip">Click any cell to choose a status. Shift-click clears it.</span>
        </div>

        <!-- Grid -->
        <div class="rx-grid-wrap">
          <table class="rx-grid">
            <thead>
              <tr>
                <th class="rx-th rx-th-name">Agent</th>
                ${dates.map(d => {
                  const isW = isWeekend(d);
                  const isT = d === today;
                  return `<th class="rx-th rx-th-day ${isW?'rx-w':''} ${isT?'rx-t':''}">
                    <div class="rx-th-dow">${dowLetter(d)}</div>
                    <div class="rx-th-num">${d.slice(-2)}</div>
                  </th>`;
                }).join('')}
                <th class="rx-th rx-th-tot">P</th>
                <th class="rx-th rx-th-tot">OFF</th>
                <th class="rx-th rx-th-tot">PL</th>
                <th class="rx-th rx-th-tot">UPL</th>
              </tr>
            </thead>
            <tbody>
              ${visible.length === 0
                ? `<tr><td colspan="${dates.length+5}" class="rx-no-rows">No agents match your search</td></tr>`
                : visible.map(a => renderAgentRow(a, dates, grid, today)).join('')}
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="rx-footer">
          <span class="rx-foot-stat">${visible.length} of ${agents.length} agents</span>
          <span class="rx-foot-stat">${dates.length} days · ${monthLabel(_state.month)}</span>
          <span class="rx-foot-flex"></span>
          <span class="rx-save-state" id="rx-save-state"></span>
        </div>
      </div>
    `;
    wire(root);
  }

  function renderAgentRow(a, dates, grid, today) {
    const row = grid[a.emp_id] || {};
    let p=0, off=0, pl=0, upl=0;
    const cells = dates.map(d => {
      const s = (row[d]?.status) || '';
      if (s === 'present' || s === 'wfh' || s === 'on_duty') p++;
      else if (s === 'off') off++;
      else if (s === 'pl' || s === 'hd_pl') pl++;
      else if (s === 'upl' || s === 'hd_upl') upl++;
      const isW = isWeekend(d);
      const isT = d === today;
      const lbl = STATUS_LABELS[s] || '';
      const titleTxt = `${a.pseudo || a.full_name || a.emp_id} · ${new Date(d+'T00:00:00').toDateString()}${s?(' · '+STATUS_LONG[s]):''}`;
      return `<td class="rx-cell rx-st-${s||'empty'} ${isW?'rx-w':''} ${isT?'rx-t':''}" data-date="${d}" data-emp="${a.emp_id}" data-status="${s}" title="${escape(titleTxt)}">${lbl}</td>`;
    }).join('');
    return `<tr class="rx-row ${a.status==='relieved'?'rx-row-relieved':''}">
      <td class="rx-td-name">
        <div class="rx-name">${escape(a.pseudo || a.full_name || a.emp_id)}</div>
        <div class="rx-meta">${escape(a.emp_id)}${a.shift?' · '+escape(a.shift):''}</div>
      </td>
      ${cells}
      <td class="rx-td-tot rx-tot-p">${p}</td>
      <td class="rx-td-tot">${off}</td>
      <td class="rx-td-tot rx-tot-pl">${pl}</td>
      <td class="rx-td-tot rx-tot-upl">${upl}</td>
    </tr>`;
  }

  function renderEmpty(root) {
    root.innerHTML = `
      <div class="rx-empty-card">
        <div class="rx-empty-ico">📋</div>
        <div class="rx-empty-title">No roster data yet</div>
        <div class="rx-empty-sub">Import the history snapshot (29 agents · 30 months from Aug 2023) bundled with the app, or add agents one at a time.</div>
        <div class="rx-empty-actions">
          <button class="rx-pill rx-pill-primary" id="rx-seed">Import history snapshot</button>
          <button class="rx-pill" id="rx-add-empty">+ Add agent manually</button>
        </div>
        <div class="rx-empty-status" id="rx-seed-status"></div>
      </div>
    `;
    $('#rx-seed').onclick = async () => {
      const btn = $('#rx-seed'); const st = $('#rx-seed-status');
      btn.disabled = true; btn.textContent = 'Importing…';
      st.style.color = '#1A6FA0'; st.textContent = 'Loading 30 months of history…';
      try {
        const j = await callSeed();
        if (!j.success) throw new Error(j.error || 'Import failed');
        st.style.color = '#0F6F46'; st.textContent = `Loaded ${j.agentsInserted} agents and ${j.daysInserted} day records. Reloading…`;
        await loadMonth(_state.month || currentMonthIso()); render();
      } catch(e) {
        btn.disabled = false; btn.textContent = 'Retry import';
        st.style.color = '#B33438'; st.textContent = 'Import failed: ' + e.message;
      }
    };
    $('#rx-add-empty').onclick = openAddAgent;
  }

  // ─── Wire-up ─────────────────────────────────────────────────────────────
  function wire(root) {
    $('#rx-prev').onclick = () => shiftMonth(-1);
    $('#rx-next').onclick = () => shiftMonth(+1);
    $('#rx-today-btn').onclick = () => loadMonth(currentMonthIso()).then(render);
    $('#rx-month-input').onchange = e => loadMonth(e.target.value).then(render);
    $('#rx-show-relieved').onchange = e => { _state.showRelieved = e.target.checked; render(); };
    $('#rx-search').oninput = e => {
      _state.agentSearch = e.target.value;
      // Re-render but preserve cursor focus on the search input
      const wasFocused = document.activeElement?.id === 'rx-search';
      const caret = wasFocused ? e.target.selectionStart : null;
      render();
      if (wasFocused) {
        const el = $('#rx-search'); if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret); }
      }
    };
    $('#rx-add').onclick = openAddAgent;
    $('#rx-audit').onclick = openAuditLog;
    $('#rx-export').onclick = exportCsv;

    // Cell clicks → popover
    $$('.rx-cell', root).forEach(c => c.onclick = ev => onCellClick(c, ev));
  }

  function shiftMonth(delta) {
    const [y, m] = _state.month.split('-').map(Number);
    const d = new Date(y, m-1+delta, 1);
    const next = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    loadMonth(next).then(render);
  }

  // ─── Cell interaction: popover palette ──────────────────────────────────
  function onCellClick(cell, ev) {
    if (ev.shiftKey) { setCell(cell, ''); return; }
    closeAnyPopover();
    const rect = cell.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'rx-popover';
    pop.innerHTML = `
      <div class="rx-pop-head">${escape(cell.title.split(' · ').slice(0,2).join(' · '))}</div>
      <div class="rx-pop-grid">
        ${PALETTE_ORDER.map(s =>
          `<button class="rx-pop-opt rx-st-${s}" data-s="${s}" title="${STATUS_LONG[s]}">
            <span class="rx-pop-code">${STATUS_LABELS[s]}</span>
            <span class="rx-pop-name">${STATUS_LONG[s]}</span>
          </button>`
        ).join('')}
      </div>
      <div class="rx-pop-foot">
        <button class="rx-pill rx-pill-ghost" data-s="">Clear</button>
        <button class="rx-pill" id="rx-pop-close">Close</button>
      </div>
    `;
    document.body.appendChild(pop);
    // Position above cell if there's no room below
    const vw = window.innerWidth, vh = window.innerHeight;
    const popH = 280;
    let top = rect.bottom + 6;
    if (top + popH > vh) top = Math.max(8, rect.top - popH - 6);
    let left = rect.left + rect.width/2 - 150;
    if (left + 300 > vw) left = vw - 308;
    if (left < 8) left = 8;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    pop.querySelectorAll('.rx-pop-opt,.rx-pill-ghost').forEach(b => {
      b.onclick = () => { setCell(cell, b.dataset.s); pop.remove(); };
    });
    $('#rx-pop-close').onclick = () => pop.remove();
    setTimeout(() => {
      const dismiss = e => {
        if (!pop.contains(e.target) && e.target !== cell) { pop.remove(); document.removeEventListener('click', dismiss); }
      };
      document.addEventListener('click', dismiss);
    }, 50);
  }
  function closeAnyPopover() { document.querySelectorAll('.rx-popover').forEach(p => p.remove()); }

  function setCell(cell, status) {
    const date = cell.dataset.date;
    const emp = cell.dataset.emp;
    cell.dataset.status = status;
    cell.className = cell.className.replace(/rx-st-\S+/g, '').trim() + ' rx-st-' + (status || 'empty');
    if (isWeekend(date)) cell.classList.add('rx-w');
    if (date === todayIso()) cell.classList.add('rx-t');
    cell.textContent = STATUS_LABELS[status] || '';

    if (!_state.data.grid[emp]) _state.data.grid[emp] = {};
    if (status) _state.data.grid[emp][date] = { status, note: null };
    else delete _state.data.grid[emp][date];
    recalcRow(cell.closest('tr'), emp);

    _state.pendingSaves.set(date + '|' + emp, { date, emp_id: emp, status });
    scheduleSave();
  }

  function recalcRow(tr, emp) {
    if (!tr) return;
    const row = _state.data.grid[emp] || {};
    let p=0, off=0, pl=0, upl=0;
    for (const d of _state.data.dates) {
      const s = row[d]?.status;
      if (s === 'present' || s === 'wfh' || s === 'on_duty') p++;
      else if (s === 'off') off++;
      else if (s === 'pl' || s === 'hd_pl') pl++;
      else if (s === 'upl' || s === 'hd_upl') upl++;
    }
    const tds = tr.querySelectorAll('.rx-td-tot');
    if (tds[0]) tds[0].textContent = p;
    if (tds[1]) tds[1].textContent = off;
    if (tds[2]) tds[2].textContent = pl;
    if (tds[3]) tds[3].textContent = upl;
  }

  function scheduleSave() {
    setSaveState('saving', 'Saving…');
    clearTimeout(_state.saveTimer);
    _state.saveTimer = setTimeout(flushSaves, 600);
  }
  async function flushSaves() {
    if (_state.pendingSaves.size === 0) return;
    const updates = Array.from(_state.pendingSaves.values());
    _state.pendingSaves.clear();
    try {
      const r = await fetch('/api/roster/bulk', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Save failed');
      setSaveState('ok', `Saved ${updates.length} change${updates.length===1?'':'s'} · ${new Date().toLocaleTimeString()}`);
    } catch(e) {
      console.error('roster save failed', e);
      setSaveState('err', 'Save failed: ' + e.message);
    }
  }
  function setSaveState(kind, msg) {
    const el = $('#rx-save-state'); if (!el) return;
    el.className = 'rx-save-state rx-save-' + kind;
    el.textContent = msg;
  }

  // ─── Add / Edit Agent modal ─────────────────────────────────────────────
  function openAddAgent() {
    const html = `
      <div class="rx-modal-bg" id="rx-add-bg">
        <div class="rx-modal">
          <div class="rx-modal-head"><div class="rx-modal-title">Add Agent</div><button class="rx-modal-x">×</button></div>
          <div class="rx-modal-body">
            <div class="rx-form"><label>Emp ID</label><input id="rx-f-emp_id" placeholder="AD0xxx"></div>
            <div class="rx-form"><label>Pseudo</label><input id="rx-f-pseudo" placeholder="Display name"></div>
            <div class="rx-form"><label>Full Name</label><input id="rx-f-full_name"></div>
            <div class="rx-form"><label>Email</label><input id="rx-f-email" type="email"></div>
            <div class="rx-form"><label>Designation</label><input id="rx-f-designation"></div>
            <div class="rx-form"><label>DOJ</label><input id="rx-f-doj" type="date"></div>
            <div class="rx-form"><label>Shift</label><input id="rx-f-shift" placeholder="e.g. 8.30 PM - 5.30 AM"></div>
            <div class="rx-form"><label>Status</label>
              <select id="rx-f-status"><option value="active">Active</option><option value="relieved">Relieved</option><option value="on_leave">On Leave</option></select>
            </div>
          </div>
          <div class="rx-modal-foot">
            <button class="rx-pill" id="rx-add-cancel">Cancel</button>
            <button class="rx-pill rx-pill-primary" id="rx-add-save">Save</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div'); wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    const close = () => $('#rx-add-bg').remove();
    $('.rx-modal-x').onclick = close;
    $('#rx-add-cancel').onclick = close;
    $('#rx-add-save').onclick = async () => {
      const body = {
        emp_id: $('#rx-f-emp_id').value.trim(),
        pseudo: $('#rx-f-pseudo').value.trim() || null,
        full_name: $('#rx-f-full_name').value.trim() || null,
        email: ($('#rx-f-email').value.trim().toLowerCase()) || null,
        designation: $('#rx-f-designation').value.trim() || null,
        doj: $('#rx-f-doj').value || null,
        shift: $('#rx-f-shift').value.trim() || null,
        status: $('#rx-f-status').value,
      };
      if (!body.emp_id) { alert('Emp ID is required'); return; }
      try {
        const r = await fetch('/api/roster/agents', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        close();
        await loadMonth(_state.month); render();
      } catch(e) { alert('Save failed: ' + e.message); }
    };
  }

  // ─── Audit log modal ────────────────────────────────────────────────────
  async function openAuditLog() {
    let events = [];
    try {
      const r = await fetch('/api/roster/audit?limit=80', { credentials:'include' });
      const j = await r.json(); events = j.events || [];
    } catch(e) { return alert('Could not load audit log'); }
    const rows = events.length === 0 ? '<div class="rx-empty-sub">No changes yet.</div>' : `
      <table class="rx-audit-tbl">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Agent</th><th>Date</th><th>From → To</th></tr></thead>
        <tbody>${events.map(e => `<tr>
          <td>${escape(e.ts||'')}</td>
          <td>${escape(e.actor_name || e.actor_email || '—')}</td>
          <td>${escape(e.action)}</td>
          <td>${escape(e.emp_id || '—')}</td>
          <td>${escape(e.date || '—')}</td>
          <td>${escape(e.prev_status || '∅')} → ${escape(e.new_status || '∅')}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    const html = `<div class="rx-modal-bg" id="rx-audit-bg">
      <div class="rx-modal rx-modal-wide">
        <div class="rx-modal-head"><div class="rx-modal-title">Recent Changes (${events.length})</div><button class="rx-modal-x">×</button></div>
        <div class="rx-modal-body">${rows}</div>
      </div></div>`;
    const wrap = document.createElement('div'); wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    $('.rx-modal-x').onclick = () => $('#rx-audit-bg').remove();
  }

  // ─── Export ──────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!_state.data) return;
    const { dates, agents, grid } = _state.data;
    const head = ['Emp ID','Pseudo','Full Name','Email','Designation','Shift', ...dates];
    const lines = [head.join(',')];
    for (const a of agents) {
      const row = grid[a.emp_id] || {};
      const cells = [a.emp_id, csv(a.pseudo), csv(a.full_name), csv(a.email), csv(a.designation), csv(a.shift),
        ...dates.map(d => STATUS_LABELS[row[d]?.status || ''] || '')];
      lines.push(cells.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `roster-${_state.month}.csv`; link.click();
    URL.revokeObjectURL(url);
    function csv(v) { if (v == null) return ''; const s = String(v); return (s.includes(',')||s.includes('"')) ? '"'+s.replace(/"/g,'""')+'"' : s; }
  }
})();
