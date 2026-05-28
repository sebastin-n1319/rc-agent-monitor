/**
 * Roster Admin v3 — 2026-05-29
 *
 * World-class attendance grid inspired by Deputy / Humanity / When I Work.
 *
 * Features:
 *  • 5 KPI cards  (Active · Present · On Leave · NCNS · Coverage %)
 *  • Day-header coverage heatmap  (green→amber→red ring)
 *  • Weekly dividers (thicker border every 7 days)
 *  • Daily coverage row pinned at bottom of grid
 *  • Full per-agent totals: P | WFH | OD | OFF | PL | UPL | SL | NCNS | Att %
 *  • Left-click = cycle P→WFH→OFF→clear  |  Right-click = full palette
 *  • Shift grouping  (group rows by shift sub-header)
 *  • Double-click agent name = edit agent modal
 *  • Bulk-column fill: click date header to fill all empty in that column
 *  • Audit log with 80-event history
 *  • Export CSV
 *  • Debounced auto-save (600ms)
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */
  const STATUS_LABEL = {
    '': '—', present: 'P', off: 'OFF', pl: 'PL', hd_pl: '½PL',
    upl: 'UPL', hd_upl: '½UPL', sl: 'SL', hd_sl: '½SL',
    wfh: 'WFH', on_duty: 'OD', holiday: 'HOL',
    ncns: 'NCNS', relieved: 'REL', absent: 'A', na: 'N/A',
  };
  const STATUS_LONG = {
    present: 'Present', off: 'Weekly Off', pl: 'Paid Leave',
    hd_pl: 'Half-Day PL', upl: 'Unpaid Leave', hd_upl: 'Half-Day UPL',
    sl: 'Sick Leave', hd_sl: 'Half-Day SL', wfh: 'Work From Home',
    on_duty: 'On Duty', holiday: 'Holiday', ncns: 'No Call No Show',
    relieved: 'Relieved', absent: 'Absent', na: 'N/A',
  };

  // Palette groups for the right-click popover
  const PALETTE_GROUPS = [
    { label: 'Productive', statuses: ['present', 'wfh', 'on_duty'] },
    { label: 'Off / Holiday', statuses: ['off', 'holiday'] },
    { label: 'Paid Leave', statuses: ['pl', 'hd_pl'] },
    { label: 'Unpaid Leave', statuses: ['upl', 'hd_upl'] },
    { label: 'Sick Leave', statuses: ['sl', 'hd_sl'] },
    { label: 'Issues', statuses: ['ncns', 'absent'] },
  ];

  // Left-click cycle: P → WFH → OFF → clear
  const CYCLE = ['present', 'wfh', 'off', ''];

  /* ══════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════ */
  const _s = {
    month: null,
    data: null,
    showRelieved: false,
    groupByShift: false,
    agentSearch: '',
    pendingSaves: new Map(),
    saveTimer: null,
  };

  /* ══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nowMonthIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = yyyymm => {
    const [y, m] = yyyymm.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };
  const dowChar = date => 'SMTWTFS'[new Date(date + 'T00:00:00').getDay()];
  const isWeekend = date => { const d = new Date(date + 'T00:00:00').getDay(); return d === 0 || d === 6; };
  const isSunday = date => new Date(date + 'T00:00:00').getDay() === 0;

  /* ══════════════════════════════════════════════════════════
     API
  ══════════════════════════════════════════════════════════ */
  async function loadMonth(yyyymm) {
    _s.month = yyyymm;
    const r = await fetch(`/api/roster/month/${yyyymm}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _s.data = await r.json();
  }

  async function postReseed() {
    const r = await fetch('/api/admin/roster/reseed', { method: 'POST', credentials: 'include' });
    return r.json();
  }

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT
  ══════════════════════════════════════════════════════════ */
  window.openRosterAdmin = async function () {
    const root = $('#roster-admin-root');
    if (!root) return;
    root.innerHTML = '<div class="rx-loading"><div class="rx-spinner"></div>Loading roster…</div>';
    try {
      await loadMonth(_s.month || nowMonthIso());
      render();
    } catch (e) {
      root.innerHTML = `<div class="rx-error">❌ Failed to load: ${esc(e.message)}</div>`;
    }
  };

  /* ══════════════════════════════════════════════════════════
     COMPUTE STATS
  ══════════════════════════════════════════════════════════ */
  function agentStats(empId, dates, grid) {
    const row = grid[empId] || {};
    let p = 0, wfh = 0, od = 0, off = 0, pl = 0, upl = 0, sl = 0, ncns = 0, filled = 0;
    for (const d of dates) {
      const s = row[d]?.status || '';
      if (s === 'present') { p++; filled++; }
      else if (s === 'wfh') { wfh++; filled++; }
      else if (s === 'on_duty') { od++; filled++; }
      else if (s === 'off') { off++; filled++; }
      else if (s === 'pl' || s === 'hd_pl') { pl += (s === 'hd_pl' ? 0.5 : 1); filled++; }
      else if (s === 'upl' || s === 'hd_upl') { upl += (s === 'hd_upl' ? 0.5 : 1); filled++; }
      else if (s === 'sl' || s === 'hd_sl') { sl += (s === 'hd_sl' ? 0.5 : 1); filled++; }
      else if (s === 'ncns' || s === 'absent') { ncns++; filled++; }
      // holiday, relieved, na, empty: don't count toward att%
    }
    const productive = p + wfh + od;
    const pct = filled > 0 ? Math.round((productive / filled) * 100) : null;
    return { p, wfh, od, off, pl: Math.round(pl * 10) / 10, upl: Math.round(upl * 10) / 10, sl: Math.round(sl * 10) / 10, ncns, pct };
  }

  function dayCoverage(dates, agents, grid) {
    // Returns { date: { present, leave, off, ncns, total } }
    const out = {};
    for (const d of dates) {
      let present = 0, leave = 0, off = 0, ncns = 0, total = 0;
      for (const a of agents) {
        if (a.status === 'relieved') continue;
        const s = (grid[a.emp_id] || {})[d]?.status || '';
        if (!s || s === 'na') continue;
        total++;
        if (s === 'present' || s === 'wfh' || s === 'on_duty') present++;
        else if (s === 'pl' || s === 'hd_pl' || s === 'upl' || s === 'hd_upl' || s === 'sl' || s === 'hd_sl') leave++;
        else if (s === 'off' || s === 'holiday') off++;
        else if (s === 'ncns' || s === 'absent') ncns++;
      }
      out[d] = { present, leave, off, ncns, total };
    }
    return out;
  }

  function coverageClass(pct) {
    if (pct === null) return 'rx-cov-none';
    if (pct >= 70) return 'rx-cov-good';
    if (pct >= 40) return 'rx-cov-mid';
    return 'rx-cov-low';
  }

  /* ══════════════════════════════════════════════════════════
     MAIN RENDER
  ══════════════════════════════════════════════════════════ */
  function render() {
    const root = $('#roster-admin-root');
    if (!_s.data) return;
    const { dates, agents, grid } = _s.data;
    if (!agents || agents.length === 0) { renderEmpty(root); return; }

    const today = todayIso();
    const todayInMonth = today.startsWith(_s.month);
    const search = _s.agentSearch.toLowerCase();

    let visible = agents.filter(a => _s.showRelieved || a.status !== 'relieved');
    if (search) {
      visible = visible.filter(a =>
        (a.pseudo || '').toLowerCase().includes(search) ||
        (a.full_name || '').toLowerCase().includes(search) ||
        (a.emp_id || '').toLowerCase().includes(search) ||
        (a.designation || '').toLowerCase().includes(search)
      );
    }

    const relievedCount = agents.filter(a => a.status === 'relieved').length;
    const activeAgents = agents.filter(a => a.status !== 'relieved');

    // KPI for today
    let presentToday = 0, leaveToday = 0, ncnsToday = 0;
    if (todayInMonth) {
      for (const a of activeAgents) {
        const s = (grid[a.emp_id] || {})[today]?.status || '';
        if (s === 'present' || s === 'wfh' || s === 'on_duty') presentToday++;
        else if (['pl', 'hd_pl', 'upl', 'hd_upl', 'sl', 'hd_sl'].includes(s)) leaveToday++;
        else if (s === 'ncns' || s === 'absent') ncnsToday++;
      }
    }
    const coveragePct = activeAgents.length
      ? Math.round((presentToday / activeAgents.length) * 100) : 0;

    // Day coverage heatmap
    const dayCov = dayCoverage(dates, agents, grid);

    // Shift groups (optional)
    const SHIFT_ORDER = [];
    if (_s.groupByShift) {
      const shiftMap = {};
      for (const a of visible) {
        const s = a.shift || 'Other';
        if (!shiftMap[s]) { shiftMap[s] = []; SHIFT_ORDER.push(s); }
        shiftMap[s].push(a);
      }
      // dedupe
      const seen = new Set();
      for (let i = SHIFT_ORDER.length - 1; i >= 0; i--) {
        if (seen.has(SHIFT_ORDER[i])) SHIFT_ORDER.splice(i, 1);
        else seen.add(SHIFT_ORDER[i]);
      }
    }

    // Build grid rows HTML
    let gridRowsHtml = '';
    if (visible.length === 0) {
      gridRowsHtml = `<tr><td colspan="${dates.length + 9}" class="rx-no-rows">No agents match your search.</td></tr>`;
    } else if (_s.groupByShift && SHIFT_ORDER.length > 0) {
      const shiftMap = {};
      for (const a of visible) { const k = a.shift || 'Other'; if (!shiftMap[k]) shiftMap[k] = []; shiftMap[k].push(a); }
      for (const shift of SHIFT_ORDER) {
        const grpAgents = shiftMap[shift] || [];
        if (!grpAgents.length) continue;
        gridRowsHtml += `<tr class="rx-shift-row"><td class="rx-shift-header" colspan="${dates.length + 9}">
          <span class="rx-shift-dot"></span> ${esc(shift)}<span class="rx-shift-count">${grpAgents.length} agents</span></td></tr>`;
        for (const a of grpAgents) gridRowsHtml += renderAgentRow(a, dates, grid, today, dayCov);
      }
    } else {
      for (const a of visible) gridRowsHtml += renderAgentRow(a, dates, grid, today, dayCov);
    }

    // Coverage summary row
    let covRowHtml = `<tr class="rx-cov-row">
      <td class="rx-td-name rx-cov-label">
        <div class="rx-name" style="font-size:11px;color:#6B849A;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Coverage</div>
        <div class="rx-meta">P · WFH · OD per day</div>
      </td>`;
    for (const d of dates) {
      const c = dayCov[d] || {};
      const pct = c.total > 0 ? Math.round((c.present / c.total) * 100) : null;
      const cls = coverageClass(pct);
      const isW = isWeekend(d);
      const isT = d === today;
      const isWeekEnd = isSunday(d);
      covRowHtml += `<td class="rx-cov-cell ${cls} ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        title="${d}: ${c.present ?? 0} present / ${c.total ?? 0} total${pct !== null ? ' (' + pct + '%)' : ''}">
        <span class="rx-cov-num">${c.present ?? ''}</span>
        ${pct !== null ? `<span class="rx-cov-pct">${pct}%</span>` : ''}
      </td>`;
    }
    covRowHtml += `<td class="rx-td-tot" colspan="8"></td></tr>`;

    // Date headers
    const dateHeadersHtml = dates.map((d, idx) => {
      const c = dayCov[d] || {};
      const pct = c.total > 0 ? Math.round((c.present / c.total) * 100) : null;
      const cls = coverageClass(pct);
      const isW = isWeekend(d);
      const isT = d === today;
      const isWeekEnd = isSunday(d);
      return `<th class="rx-th rx-th-day ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        data-col-date="${d}"
        title="Click to fill all empty in column · ${d}: ${c.present ?? 0}/${c.total ?? 0} present${pct !== null ? ' (' + pct + '%)' : ''}">
        <div class="rx-th-dow">${dowChar(d)}</div>
        <div class="rx-th-num">${d.slice(-2)}</div>
        ${pct !== null ? `<div class="rx-th-cov ${cls}"></div>` : '<div class="rx-th-cov"></div>'}
      </th>`;
    }).join('');

    root.innerHTML = `
<div class="rx-wrap">

  <!-- KPI STRIP -->
  <div class="rx-kpis">
    <div class="rx-kpi">
      <div class="rx-kpi-icon">👥</div>
      <div class="rx-kpi-lbl">Active Agents</div>
      <div class="rx-kpi-val">${activeAgents.length}</div>
      <div class="rx-kpi-sub">${relievedCount} relieved · ${agents.length} total</div>
    </div>
    <div class="rx-kpi rx-kpi-green">
      <div class="rx-kpi-icon">✅</div>
      <div class="rx-kpi-lbl">Present Today</div>
      <div class="rx-kpi-val">${todayInMonth ? presentToday : '—'}</div>
      <div class="rx-kpi-sub">${todayInMonth ? 'P · WFH · OD' : 'viewing past month'}</div>
    </div>
    <div class="rx-kpi rx-kpi-amber">
      <div class="rx-kpi-icon">🏖️</div>
      <div class="rx-kpi-lbl">On Leave Today</div>
      <div class="rx-kpi-val">${todayInMonth ? leaveToday : '—'}</div>
      <div class="rx-kpi-sub">${todayInMonth ? 'PL · UPL · SL' : ''}</div>
    </div>
    <div class="rx-kpi rx-kpi-red">
      <div class="rx-kpi-icon">🚨</div>
      <div class="rx-kpi-lbl">Issues Today</div>
      <div class="rx-kpi-val">${todayInMonth ? ncnsToday : '—'}</div>
      <div class="rx-kpi-sub">${todayInMonth ? 'NCNS · Absent' : ''}</div>
    </div>
    <div class="rx-kpi rx-kpi-teal">
      <div class="rx-kpi-icon">📊</div>
      <div class="rx-kpi-lbl">Coverage Today</div>
      <div class="rx-kpi-val">${todayInMonth ? coveragePct + '%' : '—'}</div>
      <div class="rx-kpi-sub">${todayInMonth ? `${presentToday} of ${activeAgents.length} live` : ''}</div>
      ${todayInMonth ? `<div class="rx-kpi-bar"><div class="rx-kpi-bar-fill ${coverageClass(coveragePct)}" style="width:${coveragePct}%"></div></div>` : ''}
    </div>
  </div>

  <!-- TOOLBAR -->
  <div class="rx-toolbar">
    <div class="rx-tb-group">
      <button class="rx-icon-btn" id="rx-prev" title="Previous month">&#8249;</button>
      <div class="rx-month-display" title="Click to pick month">
        <input type="month" id="rx-month-input" value="${_s.month}">
        <span>${monthLabel(_s.month)}</span>
      </div>
      <button class="rx-icon-btn" id="rx-next" title="Next month">&#8250;</button>
      <button class="rx-pill" id="rx-today-btn">Today</button>
    </div>

    <div class="rx-search rx-tb-grow">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="rx-search-ico"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
      <input type="text" id="rx-search" placeholder="Search agent, shift, designation…" value="${esc(_s.agentSearch)}">
    </div>

    <div class="rx-tb-group">
      <label class="rx-switch" title="Group rows by shift schedule">
        <input type="checkbox" id="rx-group-shift" ${_s.groupByShift ? 'checked' : ''}> Group shifts
      </label>
      <label class="rx-switch" title="Show relieved agents">
        <input type="checkbox" id="rx-show-relieved" ${_s.showRelieved ? 'checked' : ''}> Relieved (${relievedCount})
      </label>
      <button class="rx-pill" id="rx-audit" title="View recent changes">📋 Audit</button>
      <button class="rx-pill" id="rx-add" title="Add new agent">＋ Agent</button>
      <button class="rx-pill rx-pill-primary" id="rx-export" title="Download CSV">⬇ Export</button>
    </div>
  </div>

  <!-- LEGEND -->
  <div class="rx-legend">
    ${PALETTE_GROUPS.map(g => g.statuses.map(s =>
      `<span class="rx-lg rx-st-${s}"><span class="rx-lg-code">${STATUS_LABEL[s]}</span><span class="rx-lg-name">${STATUS_LONG[s]}</span></span>`
    ).join('')).join('')}
    <span class="rx-lg-tip">Left-click cycles P→WFH→OFF→clear · Right-click for full palette · Click date header to fill column</span>
  </div>

  <!-- GRID -->
  <div class="rx-grid-wrap">
    <table class="rx-grid" id="rx-grid-table">
      <thead>
        <tr>
          <th class="rx-th rx-th-name">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>Agent</span>
              <span style="font-size:9px;opacity:.6;font-weight:500;">${visible.length} shown</span>
            </div>
          </th>
          ${dateHeadersHtml}
          <th class="rx-th rx-th-tot" title="Present days">P</th>
          <th class="rx-th rx-th-tot" title="Work From Home">WFH</th>
          <th class="rx-th rx-th-tot" title="On Duty">OD</th>
          <th class="rx-th rx-th-tot" title="Weekly Off">OFF</th>
          <th class="rx-th rx-th-tot" title="Paid Leave">PL</th>
          <th class="rx-th rx-th-tot" title="Unpaid Leave">UPL</th>
          <th class="rx-th rx-th-tot" title="Sick Leave">SL</th>
          <th class="rx-th rx-th-tot" title="No Call No Show / Absent">NCNS</th>
          <th class="rx-th rx-th-tot rx-th-att" title="Attendance %  = (P+WFH+OD) / filled days">Att%</th>
        </tr>
      </thead>
      <tbody>
        ${gridRowsHtml}
        ${covRowHtml}
      </tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div class="rx-footer">
    <span class="rx-foot-stat">${visible.length} / ${agents.length} agents</span>
    <span class="rx-foot-stat">${dates.length} days · ${monthLabel(_s.month)}</span>
    <span class="rx-foot-flex"></span>
    <span class="rx-save-state" id="rx-save-state"></span>
  </div>

</div>`;

    wire(root);
  }

  /* ══════════════════════════════════════════════════════════
     AGENT ROW
  ══════════════════════════════════════════════════════════ */
  function renderAgentRow(a, dates, grid, today) {
    const stats = agentStats(a.emp_id, dates, grid);
    const row = grid[a.emp_id] || {};

    const cells = dates.map(d => {
      const s = (row[d]?.status) || '';
      const isW = isWeekend(d);
      const isT = d === today;
      const isWeekEnd = isSunday(d);
      const lbl = STATUS_LABEL[s] || '';
      const tip = `${esc(a.pseudo || a.emp_id)} · ${d}${s ? ' · ' + STATUS_LONG[s] : ''}`;
      return `<td class="rx-cell rx-st-${s || 'empty'} ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        data-date="${d}" data-emp="${esc(a.emp_id)}" data-status="${s}"
        title="${tip}">${lbl}</td>`;
    }).join('');

    const attHtml = stats.pct !== null
      ? `<span class="rx-att-pct ${stats.pct >= 70 ? 'rx-att-good' : stats.pct >= 40 ? 'rx-att-mid' : 'rx-att-low'}">${stats.pct}%</span>`
      : '—';

    return `<tr class="rx-row ${a.status === 'relieved' ? 'rx-row-relieved' : ''}" data-emp="${esc(a.emp_id)}">
      <td class="rx-td-name" title="Double-click to edit">
        <div class="rx-name">${esc(a.pseudo || a.full_name || a.emp_id)}</div>
        <div class="rx-meta">${esc(a.emp_id)}${a.designation ? ' · ' + esc(a.designation.replace('Technical Support Representative','TSR').replace('Technical Support','TS')) : ''}${a.shift ? ' · <em>' + esc(a.shift) + '</em>' : ''}</div>
      </td>
      ${cells}
      <td class="rx-td-tot rx-tot-p">${stats.p || '—'}</td>
      <td class="rx-td-tot rx-tot-wfh">${stats.wfh || '—'}</td>
      <td class="rx-td-tot rx-tot-od">${stats.od || '—'}</td>
      <td class="rx-td-tot">${stats.off || '—'}</td>
      <td class="rx-td-tot rx-tot-pl">${stats.pl || '—'}</td>
      <td class="rx-td-tot rx-tot-upl">${stats.upl || '—'}</td>
      <td class="rx-td-tot rx-tot-sl">${stats.sl || '—'}</td>
      <td class="rx-td-tot rx-tot-ncns">${stats.ncns || '—'}</td>
      <td class="rx-td-tot rx-td-att">${attHtml}</td>
    </tr>`;
  }

  /* ══════════════════════════════════════════════════════════
     EMPTY STATE
  ══════════════════════════════════════════════════════════ */
  function renderEmpty(root) {
    root.innerHTML = `
      <div class="rx-empty-card">
        <div class="rx-empty-ico">📋</div>
        <div class="rx-empty-title">No roster data for this month</div>
        <div class="rx-empty-sub">29 agents · 31 months of history are bundled with the app. Import them to get started.</div>
        <div class="rx-empty-actions">
          <button class="rx-pill rx-pill-primary" id="rx-seed">⬆ Import history snapshot</button>
          <button class="rx-pill" id="rx-add-empty">＋ Add agent manually</button>
        </div>
        <div class="rx-empty-status" id="rx-seed-status"></div>
      </div>`;
    $('#rx-seed').onclick = async () => {
      const btn = $('#rx-seed'), st = $('#rx-seed-status');
      btn.disabled = true; btn.textContent = 'Importing…';
      st.style.color = '#1A6FA0'; st.textContent = 'Loading…';
      try {
        const j = await postReseed();
        if (!j.success) throw new Error(j.error || 'Import failed');
        st.style.color = '#0F6F46'; st.textContent = `✅ Loaded ${j.agentsInserted} agents · ${j.daysInserted} records`;
        await loadMonth(_s.month || nowMonthIso()); render();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Retry';
        st.style.color = '#B33438'; st.textContent = 'Failed: ' + e.message;
      }
    };
    $('#rx-add-empty').onclick = openAddAgent;
  }

  /* ══════════════════════════════════════════════════════════
     WIRE-UP
  ══════════════════════════════════════════════════════════ */
  function wire(root) {
    $('#rx-prev').onclick = () => shiftMonth(-1);
    $('#rx-next').onclick = () => shiftMonth(+1);
    $('#rx-today-btn').onclick = () => go(nowMonthIso());
    $('#rx-month-input').onchange = e => go(e.target.value);
    $('#rx-search').oninput = e => {
      _s.agentSearch = e.target.value;
      const caret = document.activeElement?.id === 'rx-search' ? e.target.selectionStart : null;
      render();
      const el = $('#rx-search'); if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret); }
    };
    $('#rx-group-shift').onchange = e => { _s.groupByShift = e.target.checked; render(); };
    $('#rx-show-relieved').onchange = e => { _s.showRelieved = e.target.checked; render(); };
    $('#rx-add').onclick = openAddAgent;
    $('#rx-audit').onclick = openAuditLog;
    $('#rx-export').onclick = exportCsv;

    // Cell left-click: cycle, right-click: palette
    $$('.rx-cell', root).forEach(cell => {
      cell.addEventListener('click', ev => { ev.preventDefault(); cycleCell(cell); });
      cell.addEventListener('contextmenu', ev => { ev.preventDefault(); openPalette(cell, ev); });
    });

    // Date header click: bulk fill column
    $$('.rx-th-day[data-col-date]', root).forEach(th => {
      th.addEventListener('click', ev => {
        if (ev.target === th || th.contains(ev.target)) openColumnFill(th.dataset.colDate);
      });
    });

    // Double-click agent name: edit
    $$('.rx-td-name', root).forEach(td => {
      td.addEventListener('dblclick', () => {
        const empId = td.closest('tr')?.dataset?.emp;
        if (empId && _s.data) {
          const agent = _s.data.agents.find(a => a.emp_id === empId);
          if (agent) openEditAgent(agent);
        }
      });
    });
  }

  function go(yyyymm) {
    const root = $('#roster-admin-root');
    root.innerHTML = '<div class="rx-loading"><div class="rx-spinner"></div>Loading…</div>';
    loadMonth(yyyymm).then(render).catch(e => {
      root.innerHTML = `<div class="rx-error">Failed: ${esc(e.message)}</div>`;
    });
  }

  function shiftMonth(delta) {
    const [y, m] = _s.month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    go(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  /* ══════════════════════════════════════════════════════════
     CELL INTERACTIONS
  ══════════════════════════════════════════════════════════ */
  function cycleCell(cell) {
    const cur = cell.dataset.status || '';
    const idx = CYCLE.indexOf(cur);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    applyCell(cell, next);
  }

  function applyCell(cell, status) {
    const date = cell.dataset.date;
    const emp = cell.dataset.emp;

    // Update DOM
    cell.dataset.status = status;
    const classes = ['rx-cell'];
    if (isWeekend(date)) classes.push('rx-w');
    if (date === todayIso()) classes.push('rx-t');
    if (isSunday(date)) classes.push('rx-week-end');
    classes.push('rx-st-' + (status || 'empty'));
    cell.className = classes.join(' ');
    cell.textContent = STATUS_LABEL[status] || '';

    // Update data model
    if (!_s.data.grid[emp]) _s.data.grid[emp] = {};
    if (status) _s.data.grid[emp][date] = { status };
    else delete _s.data.grid[emp][date];

    recalcRow(cell.closest('tr'), emp);

    // Queue save
    _s.pendingSaves.set(`${date}|${emp}`, { date, emp_id: emp, status });
    scheduleSave();
  }

  function recalcRow(tr, emp) {
    if (!tr) return;
    const stats = agentStats(emp, _s.data.dates, _s.data.grid);
    const tots = tr.querySelectorAll('.rx-td-tot');
    if (tots.length < 9) return;
    tots[0].textContent = stats.p || '—';
    tots[1].textContent = stats.wfh || '—';
    tots[2].textContent = stats.od || '—';
    tots[3].textContent = stats.off || '—';
    tots[4].textContent = stats.pl || '—';
    tots[5].textContent = stats.upl || '—';
    tots[6].textContent = stats.sl || '—';
    tots[7].textContent = stats.ncns || '—';
    const attCell = tr.querySelector('.rx-td-att');
    if (attCell) {
      if (stats.pct !== null) {
        const cls = stats.pct >= 70 ? 'rx-att-good' : stats.pct >= 40 ? 'rx-att-mid' : 'rx-att-low';
        attCell.innerHTML = `<span class="rx-att-pct ${cls}">${stats.pct}%</span>`;
      } else {
        attCell.textContent = '—';
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     PALETTE POPOVER (right-click)
  ══════════════════════════════════════════════════════════ */
  function closePopovers() { $$('.rx-popover').forEach(p => p.remove()); }

  function openPalette(cell, ev) {
    closePopovers();
    const rect = cell.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'rx-popover';

    const curStatus = cell.dataset.status || '';
    const agentName = cell.title.split(' · ')[0];

    pop.innerHTML = `
      <div class="rx-pop-head">
        <span>${esc(agentName)}</span>
        <span class="rx-pop-date">${cell.dataset.date}</span>
      </div>
      <div class="rx-pop-body">
        ${PALETTE_GROUPS.map(g => `
          <div class="rx-pop-group-label">${g.label}</div>
          <div class="rx-pop-group">
            ${g.statuses.map(s => `
              <button class="rx-pop-opt rx-st-${s} ${s === curStatus ? 'rx-pop-active' : ''}" data-s="${s}">
                <span class="rx-pop-code">${STATUS_LABEL[s]}</span>
                <span class="rx-pop-name">${STATUS_LONG[s]}</span>
              </button>`).join('')}
          </div>`).join('')}
      </div>
      <div class="rx-pop-foot">
        <button class="rx-pop-clear" data-s="">✕ Clear</button>
        <button class="rx-pop-close">Close</button>
      </div>`;

    document.body.appendChild(pop);

    // Position
    const vw = window.innerWidth, vh = window.innerHeight;
    const popH = 360, popW = 310;
    let top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - popW / 2;
    if (top + popH > vh) top = Math.max(6, rect.top - popH - 6);
    if (left + popW > vw) left = vw - popW - 8;
    if (left < 8) left = 8;
    pop.style.cssText = `top:${top}px;left:${left}px;`;

    pop.querySelectorAll('[data-s]').forEach(b => {
      b.onclick = () => { applyCell(cell, b.dataset.s); pop.remove(); };
    });
    pop.querySelector('.rx-pop-close').onclick = () => pop.remove();

    setTimeout(() => {
      const dismiss = e => {
        if (!pop.contains(e.target) && e.target !== cell) { pop.remove(); document.removeEventListener('mousedown', dismiss); }
      };
      document.addEventListener('mousedown', dismiss);
    }, 50);
  }

  /* ══════════════════════════════════════════════════════════
     COLUMN FILL
  ══════════════════════════════════════════════════════════ */
  function openColumnFill(date) {
    const existing = $$(`[data-col-date="${date}"]`, document.getElementById('rx-grid-table'));
    const cells = $$(`[data-date="${date}"].rx-cell`);
    const emptyCells = cells.filter(c => !c.dataset.status);
    if (cells.length === 0) return;

    const pop = document.createElement('div');
    pop.className = 'rx-popover rx-col-fill-pop';
    pop.innerHTML = `
      <div class="rx-pop-head">
        <span>Fill column: ${date}</span>
        <span class="rx-pop-date">${emptyCells.length} empty · ${cells.length} total</span>
      </div>
      <div class="rx-pop-body" style="padding:10px;">
        <div style="font-size:11px;color:#6B849A;margin-bottom:8px;">Apply to:
          <label style="margin-right:10px;"><input type="radio" name="rx-fill-scope" value="empty" checked> Empty only (${emptyCells.length})</label>
          <label><input type="radio" name="rx-fill-scope" value="all"> All (${cells.length})</label>
        </div>
        <div class="rx-pop-group" style="grid-template-columns:repeat(3,1fr);">
          ${['present','wfh','off','holiday','pl','upl','sl','ncns'].map(s => `
            <button class="rx-pop-opt rx-st-${s}" data-fill-s="${s}">
              <span class="rx-pop-code">${STATUS_LABEL[s]}</span>
              <span class="rx-pop-name">${STATUS_LONG[s]}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="rx-pop-foot">
        <button class="rx-pop-close">Cancel</button>
      </div>`;

    document.body.appendChild(pop);
    const vw = window.innerWidth;
    const hdrEl = $$('.rx-th-day[data-col-date="' + date + '"]')[0];
    let left = 200;
    if (hdrEl) {
      const r = hdrEl.getBoundingClientRect();
      left = Math.min(r.left, vw - 330);
    }
    pop.style.cssText = `top:140px;left:${Math.max(8, left)}px;`;

    pop.querySelectorAll('[data-fill-s]').forEach(btn => {
      btn.onclick = () => {
        const scope = pop.querySelector('input[name="rx-fill-scope"]:checked')?.value;
        const targetCells = scope === 'all' ? cells : emptyCells;
        for (const cell of targetCells) applyCell(cell, btn.dataset.fillS);
        pop.remove();
      };
    });
    pop.querySelector('.rx-pop-close').onclick = () => pop.remove();
    setTimeout(() => {
      const d = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', d); } };
      document.addEventListener('mousedown', d);
    }, 50);
  }

  /* ══════════════════════════════════════════════════════════
     SAVE
  ══════════════════════════════════════════════════════════ */
  function scheduleSave() {
    setSaveState('saving', '⏳ Saving…');
    clearTimeout(_s.saveTimer);
    _s.saveTimer = setTimeout(flushSaves, 600);
  }

  async function flushSaves() {
    if (!_s.pendingSaves.size) return;
    const updates = Array.from(_s.pendingSaves.values());
    _s.pendingSaves.clear();
    try {
      const r = await fetch('/api/roster/bulk', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Save failed');
      setSaveState('ok', `✅ Saved ${updates.length} change${updates.length === 1 ? '' : 's'} · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setSaveState('err', '❌ Save failed: ' + e.message);
    }
  }

  function setSaveState(kind, msg) {
    const el = $('#rx-save-state'); if (!el) return;
    el.className = 'rx-save-state rx-save-' + kind;
    el.textContent = msg;
  }

  /* ══════════════════════════════════════════════════════════
     ADD / EDIT AGENT MODAL
  ══════════════════════════════════════════════════════════ */
  function agentFormHtml(a) {
    a = a || {};
    return `
      <div class="rx-form"><label>Emp ID</label><input id="rx-f-emp_id" placeholder="AD0xxx" value="${esc(a.emp_id || '')}" ${a.emp_id ? 'readonly' : ''}></div>
      <div class="rx-form"><label>Display Name</label><input id="rx-f-pseudo" placeholder="Pseudo / display name" value="${esc(a.pseudo || '')}"></div>
      <div class="rx-form"><label>Full Name</label><input id="rx-f-full_name" value="${esc(a.full_name || '')}"></div>
      <div class="rx-form"><label>Email</label><input id="rx-f-email" type="email" value="${esc(a.email || '')}"></div>
      <div class="rx-form"><label>Designation</label><input id="rx-f-designation" value="${esc(a.designation || '')}"></div>
      <div class="rx-form"><label>Date of Join</label><input id="rx-f-doj" type="date" value="${esc(a.doj || '')}"></div>
      <div class="rx-form"><label>Shift</label><input id="rx-f-shift" placeholder="e.g. 8:30 AM – 5:30 PM" value="${esc(a.shift || '')}"></div>
      <div class="rx-form"><label>Status</label>
        <select id="rx-f-status">
          <option value="active" ${a.status === 'active' || !a.status ? 'selected' : ''}>Active</option>
          <option value="relieved" ${a.status === 'relieved' ? 'selected' : ''}>Relieved</option>
          <option value="on_leave" ${a.status === 'on_leave' ? 'selected' : ''}>On Leave</option>
        </select>
      </div>`;
  }

  function openAddAgent() { openAgentModal(null); }
  function openEditAgent(agent) { openAgentModal(agent); }

  function openAgentModal(agent) {
    const isEdit = !!agent;
    const bg = document.createElement('div');
    bg.className = 'rx-modal-bg';
    bg.id = 'rx-agent-bg';
    bg.innerHTML = `
      <div class="rx-modal">
        <div class="rx-modal-head">
          <div class="rx-modal-title">${isEdit ? '✏️ Edit Agent' : '＋ Add Agent'}</div>
          <button class="rx-modal-x">×</button>
        </div>
        <div class="rx-modal-body">${agentFormHtml(agent)}</div>
        <div class="rx-modal-foot">
          <button class="rx-pill" id="rx-agent-cancel">Cancel</button>
          <button class="rx-pill rx-pill-primary" id="rx-agent-save">${isEdit ? 'Update' : 'Add Agent'}</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('.rx-modal-x').onclick = close;
    $('#rx-agent-cancel').onclick = close;
    $('#rx-agent-save').onclick = async () => {
      const body = {
        emp_id: $('#rx-f-emp_id').value.trim(),
        pseudo: $('#rx-f-pseudo').value.trim() || null,
        full_name: $('#rx-f-full_name').value.trim() || null,
        email: $('#rx-f-email').value.trim().toLowerCase() || null,
        designation: $('#rx-f-designation').value.trim() || null,
        doj: $('#rx-f-doj').value || null,
        shift: $('#rx-f-shift').value.trim() || null,
        status: $('#rx-f-status').value,
      };
      if (!body.emp_id) { alert('Emp ID is required'); return; }
      try {
        const r = await fetch('/api/roster/agents', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        close();
        await loadMonth(_s.month); render();
      } catch (e) { alert('Save failed: ' + e.message); }
    };
  }

  /* ══════════════════════════════════════════════════════════
     AUDIT LOG
  ══════════════════════════════════════════════════════════ */
  async function openAuditLog() {
    let events = [];
    try {
      const r = await fetch('/api/roster/audit?limit=100', { credentials: 'include' });
      const j = await r.json(); events = j.events || [];
    } catch (e) { return alert('Could not load audit log'); }

    const bg = document.createElement('div');
    bg.className = 'rx-modal-bg'; bg.id = 'rx-audit-bg';
    const rows = events.length === 0
      ? '<div style="padding:24px;text-align:center;color:#9BAFC0;">No changes yet.</div>'
      : `<table class="rx-audit-tbl">
          <thead><tr><th>When</th><th>Who</th><th>Agent</th><th>Date</th><th>From → To</th></tr></thead>
          <tbody>${events.map(e => `<tr>
            <td>${esc(e.ts || '')}</td>
            <td>${esc(e.actor_name || e.actor_email || '—')}</td>
            <td>${esc(e.emp_id || '—')}</td>
            <td>${esc(e.date || '—')}</td>
            <td>
              <span class="rx-st-badge rx-st-${e.prev_status || 'empty'}">${STATUS_LABEL[e.prev_status] || '∅'}</span>
              → <span class="rx-st-badge rx-st-${e.new_status || 'empty'}">${STATUS_LABEL[e.new_status] || '∅'}</span>
            </td>
          </tr>`).join('')}</tbody>
        </table>`;

    bg.innerHTML = `
      <div class="rx-modal rx-modal-wide">
        <div class="rx-modal-head">
          <div class="rx-modal-title">📋 Audit Log (${events.length} changes)</div>
          <button class="rx-modal-x">×</button>
        </div>
        <div class="rx-modal-body">${rows}</div>
        <div class="rx-modal-foot">
          <button class="rx-pill" id="rx-audit-close">Close</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    bg.querySelector('.rx-modal-x').onclick = () => bg.remove();
    $('#rx-audit-close').onclick = () => bg.remove();
  }

  /* ══════════════════════════════════════════════════════════
     EXPORT CSV
  ══════════════════════════════════════════════════════════ */
  function exportCsv() {
    if (!_s.data) return;
    const { dates, agents, grid } = _s.data;
    const head = ['Emp ID', 'Pseudo', 'Full Name', 'Email', 'Designation', 'Shift', ...dates, 'P', 'WFH', 'OD', 'OFF', 'PL', 'UPL', 'SL', 'NCNS', 'Att%'];
    const lines = [head.join(',')];
    for (const a of agents) {
      const s = agentStats(a.emp_id, dates, grid);
      const row = grid[a.emp_id] || {};
      const cells = dates.map(d => STATUS_LABEL[row[d]?.status || ''] || '');
      lines.push([a.emp_id, q(a.pseudo), q(a.full_name), q(a.email), q(a.designation), q(a.shift),
        ...cells, s.p, s.wfh, s.od, s.off, s.pl, s.upl, s.sl, s.ncns, s.pct != null ? s.pct + '%' : ''
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `roster-${_s.month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function q(v) { if (v == null) return ''; const s = String(v); return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s; }

})();
