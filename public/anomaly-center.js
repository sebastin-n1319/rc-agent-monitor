/**
 * anomaly-center.js — UI module for Anomaly Detection (Session 7).
 *
 * Owns:
 *   • Anomaly center modal — today's anomalies, auto-grouped by severity
 *   • Per-agent drill-down — last 30 days grouped by metric
 *   • Threshold admin form — tune the 5 metric thresholds
 *   • Inline sparkline (median + today marker)
 *   • SSE subscription for instant push delivery
 *   • CSV export
 *
 * Feature flag: anomalyDetectionV2 (default OFF — set via setFlag).
 * Keyboard shortcut: `N` opens dashboard.
 *
 * Public API (window-scoped):
 *   AnomalyCenter.open()
 *   AnomalyCenter.close()
 *   AnomalyCenter.refresh()
 *   AnomalyCenter.drillDown(email)
 *   AnomalyCenter.openThresholdAdmin()
 */
(function () {
  'use strict';

  const ML = window.Motion || window.motion || {};
  const animate = ML.animate || null;
  const SPRING = [0.22, 1, 0.36, 1];

  // ─── State ───────────────────────────────────────────────────────────
  let recentCache = [];        // last N days of anomalies
  let thresholdsCache = {};    // metric → cfg
  let dashboardOpen = false;
  let sseSource = null;

  // Metric → display name + color hint
  const METRIC_DISPLAY = {
    daily_live_minutes: { label: 'Live minutes',     emoji: '⏱️', unit: 'min' },
    daily_call_volume:  { label: 'Call volume',      emoji: '📞', unit: 'calls' },
    daily_missed_calls: { label: 'Missed calls',     emoji: '🚫', unit: 'missed' },
    daily_break_minutes:{ label: 'Break minutes',    emoji: '☕', unit: 'min' },
    daily_aht_seconds:  { label: 'AHT',              emoji: '⏲️', unit: 's' }
  };

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

  function fmtRelative(iso) {
    if (!iso) return '';
    const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
    const diff = Date.now() - t;
    if (diff < 60_000) return Math.max(0, Math.floor(diff / 1000)) + 's ago';
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
    return Math.floor(diff / 86_400_000) + 'd ago';
  }

  function fmtZ(z) {
    if (z == null || !isFinite(z)) return '—';
    const s = z > 0 ? '+' : '';
    return s + Number(z).toFixed(1);
  }

  // ─── Sparkline ───────────────────────────────────────────────────────
  // Renders a horizontal bar showing where today's value sits relative to
  // the median. Bands at ±threshold visualize the "normal" range.
  function sparklineHtml(a) {
    const md = a.baseline_median;
    const today = a.today_value;
    const mad = a.baseline_mad || 0;
    const z = a.modified_z || 0;
    if (md == null || today == null || !isFinite(md) || !isFinite(today)) return '';
    // Choose display range as max(|today-median|, 4*MAD) on either side
    const span = Math.max(Math.abs(today - md), 4 * Math.max(mad, Math.abs(md) * 0.05, 0.5));
    if (span <= 0) return '';
    const lo = md - span;
    const hi = md + span;
    function pct(v) { return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)); }
    const medianPct = pct(md);
    const todayPct = pct(today);
    // Severity-tinted dot
    const dotColor = z > 5 || z < -5 ? '#ED666B' : (z > 3.5 || z < -3.5 ? '#FBC84B' : '#21AAE0');
    return `<div class="an-spark" title="median ${md} → today ${today} (z=${fmtZ(z)})">
      <div class="an-spark-track">
        <div class="an-spark-band" style="left:${pct(md - 3.5 * Math.max(mad, 0.5))}%;right:${100 - pct(md + 3.5 * Math.max(mad, 0.5))}%"></div>
        <div class="an-spark-median" style="left:${medianPct}%"></div>
        <div class="an-spark-today" style="left:${todayPct}%;background:${dotColor}"></div>
      </div>
    </div>`;
  }

  // ─── Data fetching ───────────────────────────────────────────────────
  async function fetchRecent(days) {
    try {
      const r = await fetch('/api/anomalies/recent?days=' + (days || 7), { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) return [];
      recentCache = j.anomalies || [];
      return recentCache;
    } catch (e) { return []; }
  }

  async function fetchThresholds() {
    try {
      const r = await fetch('/api/anomaly/thresholds', { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) return {};
      thresholdsCache = j.thresholds || {};
      return thresholdsCache;
    } catch (e) { return {}; }
  }

  // ─── Dashboard modal ─────────────────────────────────────────────────
  function ensureDashboard() {
    let modal = document.getElementById('an-dashboard');
    if (modal) return modal;
    modal = el('div', {
      id: 'an-dashboard',
      class: 'an-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Anomaly Center',
      onClick: (e) => { if (e.target.id === 'an-dashboard') close(); }
    }, [
      el('div', { class: 'an-modal an-modal-dash' }, [
        el('div', { class: 'an-modal-head' }, [
          el('div', { class: 'an-modal-title' }, [
            el('span', { text: 'Anomaly Center' }),
            el('span', { id: 'an-count-chip', class: 'an-chip' })
          ]),
          el('div', { class: 'an-modal-actions' }, [
            el('button', { class: 'an-btn an-btn-ghost', text: '🔧 Tune', onClick: openThresholdAdmin }),
            el('button', { class: 'an-btn an-btn-ghost', text: '⚡ Run now', onClick: runNow }),
            el('button', { class: 'an-btn an-btn-ghost', text: '📥 CSV', onClick: exportCSV }),
            el('button', { class: 'an-btn an-btn-close', text: '✕', 'aria-label': 'Close', onClick: close })
          ])
        ]),
        el('div', { class: 'an-filters' }, [
          el('label', { html: 'Days <select id="an-days"><option value="1">24h</option><option value="7" selected>7d</option><option value="30">30d</option><option value="90">90d</option></select>' }),
          el('label', { html: 'Severity <select id="an-sev"><option value="">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select>' }),
          el('label', { html: 'Metric <select id="an-metric"><option value="">All</option>' +
            Object.entries(METRIC_DISPLAY).map(([k, v]) => `<option value="${esc(k)}">${esc(v.label)}</option>`).join('') + '</select>' }),
          el('label', { class: 'an-toggle', html: '<input type="checkbox" id="an-acked"> Show acked' }),
          el('input', { id: 'an-search', type: 'text', placeholder: '🔍 Search agent…' })
        ]),
        el('div', { id: 'an-dash-body', class: 'an-dash-body' })
      ])
    ]);
    document.body.appendChild(modal);
    modal.querySelector('#an-days').addEventListener('change', refresh);
    modal.querySelector('#an-sev').addEventListener('change', renderDashboard);
    modal.querySelector('#an-metric').addEventListener('change', renderDashboard);
    modal.querySelector('#an-acked').addEventListener('change', renderDashboard);
    modal.querySelector('#an-search').addEventListener('input', renderDashboard);
    return modal;
  }

  function visibleRows() {
    const sev = document.getElementById('an-sev')?.value || '';
    const metric = document.getElementById('an-metric')?.value || '';
    const showAcked = document.getElementById('an-acked')?.checked;
    const q = (document.getElementById('an-search')?.value || '').toLowerCase().trim();
    let rows = recentCache.slice();
    if (!showAcked) rows = rows.filter(r => !r.acked_at);
    if (sev) rows = rows.filter(r => r.severity === sev);
    if (metric) rows = rows.filter(r => r.metric === metric);
    if (q) rows = rows.filter(r => (r.agent_email || '').toLowerCase().includes(q));
    return rows;
  }

  function renderDashboard() {
    const body = document.getElementById('an-dash-body');
    const chip = document.getElementById('an-count-chip');
    if (!body) return;
    const rows = visibleRows();

    if (chip) chip.textContent = rows.length + ' ' + (rows.length === 1 ? 'row' : 'rows');

    if (!rows.length) {
      body.innerHTML = `<div class="an-empty">
        <div class="an-empty-ico">✓</div>
        <div class="an-empty-title">No anomalies in this window</div>
        <div class="an-empty-sub">Either everyone is operating within baseline, or thresholds need tuning. Click 🔧 Tune to adjust.</div>
      </div>`;
      return;
    }

    // Group by severity
    const groups = { critical: [], warning: [], info: [] };
    for (const r of rows) {
      if (groups[r.severity]) groups[r.severity].push(r);
      else (groups.info = groups.info || []).push(r);
    }
    const order = ['critical', 'warning', 'info'];
    const ico = { critical: '🚨', warning: '⚠️', info: 'ℹ️' };

    body.innerHTML = order.filter(s => groups[s].length).map(sev => {
      const items = groups[sev].map(rowHtml).join('');
      return `<section class="an-group an-group-${sev}">
        <header class="an-group-head">
          <span class="an-group-ico">${ico[sev]}</span>
          <span class="an-group-label">${sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
          <span class="an-group-count">${groups[sev].length}</span>
        </header>
        <div class="an-group-body">${items}</div>
      </section>`;
    }).join('');

    // Wire actions
    body.querySelectorAll('[data-action="ack"]').forEach(btn => {
      btn.addEventListener('click', () => ackOne(parseInt(btn.dataset.id)));
    });
    body.querySelectorAll('[data-action="drill"]').forEach(btn => {
      btn.addEventListener('click', () => drillDown(btn.dataset.email));
    });

    if (animate) {
      body.querySelectorAll('.an-row').forEach((row, i) => {
        animate(row, { opacity: [0, 1], y: [8, 0] }, { duration: 0.25, delay: Math.min(i, 12) * 0.025, easing: SPRING });
      });
    }
  }

  function rowHtml(a) {
    const meta = METRIC_DISPLAY[a.metric] || { label: a.metric, emoji: '🔬', unit: '' };
    const acked = !!a.acked_at;
    return `<article class="an-row${acked ? ' an-acked' : ''}" data-id="${a.id}" data-sev="${esc(a.severity)}">
      <div class="an-row-ico">${meta.emoji}</div>
      <div class="an-row-body">
        <div class="an-row-meta">
          <strong>${esc(a.agent_email)}</strong>
          <span class="an-row-metric">· ${esc(meta.label)}</span>
          <span class="an-row-time">· ${esc(fmtRelative(a.created_at))}</span>
          ${a.flat_baseline ? '<span class="an-row-tag" title="No variance in baseline — synthetic noise floor used">flat baseline</span>' : ''}
        </div>
        <div class="an-row-numbers">
          <span>today <b>${esc(String(a.today_value))}</b> ${esc(meta.unit)}</span>
          <span>median <b>${esc(String(a.baseline_median))}</b></span>
          <span class="an-row-z">z=<b>${esc(fmtZ(a.modified_z))}</b></span>
          ${a.sample_size ? `<span class="an-row-n">n=${esc(String(a.sample_size))}</span>` : ''}
        </div>
        ${sparklineHtml(a)}
      </div>
      <div class="an-row-actions">
        <button class="an-btn an-btn-ghost an-btn-sm" data-action="drill" data-email="${esc(a.agent_email)}">Drill</button>
        ${acked ? `<span class="an-row-acked" title="${esc(a.acked_by || '')} at ${esc(a.acked_at || '')}">✓ acked</span>`
                : `<button class="an-btn an-btn-primary an-btn-sm" data-action="ack" data-id="${a.id}">Ack</button>`}
      </div>
    </article>`;
  }

  // ─── Actions ─────────────────────────────────────────────────────────
  async function ackOne(id) {
    try {
      const r = await fetch('/api/anomalies/' + id + '/ack', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json();
      if (j.success) {
        const row = recentCache.find(x => x.id === id);
        if (row) row.acked_at = new Date().toISOString();
        renderDashboard();
        if (typeof window.showToast === 'function') window.showToast('Anomaly acknowledged', 'success', 1500);
      }
    } catch (e) {}
  }

  async function runNow() {
    if (typeof window.showToast === 'function') window.showToast('Running anomaly evaluator…', 'info', 2500);
    try {
      const r = await fetch('/api/admin/anomalies/run', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json();
      if (j.success) {
        if (typeof window.showToast === 'function') window.showToast('Run complete — ' + (j.inserted || 0) + ' new, ' + (j.skipped || 0) + ' skipped', 'success', 3000);
        await refresh();
      } else if (typeof window.showToast === 'function') {
        window.showToast('Run failed: ' + (j.error || 'unknown'), 'error', 4000);
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Network error: ' + e.message, 'error', 4000);
    }
  }

  function exportCSV() {
    const rows = visibleRows();
    if (!rows.length) {
      if (typeof window.showToast === 'function') window.showToast('No data to export', 'warning', 2000);
      return;
    }
    const cols = ['created_at', 'date', 'agent_email', 'metric', 'severity', 'today_value', 'baseline_median', 'baseline_mad', 'modified_z', 'direction', 'sample_size', 'acked_at', 'acked_by'];
    const lines = [cols.join(',')];
    for (const r of rows) {
      lines.push(cols.map(c => '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""').replace(/\s+/g, ' ').trim() + '"').join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anomalies-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  // ─── Per-agent drill-down ────────────────────────────────────────────
  async function drillDown(email) {
    if (!email) return;
    let modal = document.getElementById('an-drill');
    if (modal) modal.remove();
    modal = el('div', {
      id: 'an-drill',
      class: 'an-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Anomaly drill-down',
      onClick: (e) => { if (e.target.id === 'an-drill') closeDrill(); }
    }, [
      el('div', { class: 'an-modal an-modal-drill' }, [
        el('div', { class: 'an-modal-head' }, [
          el('div', { class: 'an-modal-title' }, [
            el('span', { text: 'Anomalies for ' }),
            el('span', { class: 'an-chip', text: email })
          ]),
          el('div', { class: 'an-modal-actions' }, [
            el('button', { class: 'an-btn an-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeDrill })
          ])
        ]),
        el('div', { id: 'an-drill-body', class: 'an-drill-body', html: '<div class="an-empty"><div class="an-empty-ico">⏳</div><div class="an-empty-title">Loading…</div></div>' })
      ])
    ]);
    document.body.appendChild(modal);

    try {
      const r = await fetch('/api/anomalies/agent/' + encodeURIComponent(email) + '?days=30', { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'load failed');
      const body = document.getElementById('an-drill-body');
      if (!body) return;
      const rows = j.anomalies || [];
      if (!rows.length) {
        body.innerHTML = '<div class="an-empty"><div class="an-empty-ico">✓</div><div class="an-empty-title">No anomalies in last 30 days</div></div>';
        return;
      }
      // Group by metric
      const byMetric = {};
      for (const r of rows) {
        if (!byMetric[r.metric]) byMetric[r.metric] = [];
        byMetric[r.metric].push(r);
      }
      body.innerHTML = Object.entries(byMetric).map(([metric, list]) => {
        const meta = METRIC_DISPLAY[metric] || { label: metric, emoji: '🔬', unit: '' };
        const items = list.map(a => `<div class="an-drill-row">
          <div class="an-drill-date">${esc(a.date)}</div>
          <div class="an-drill-vals">today ${esc(String(a.today_value))} · median ${esc(String(a.baseline_median))}</div>
          ${sparklineHtml(a)}
          <div class="an-drill-z">z=${esc(fmtZ(a.modified_z))}</div>
          <div class="an-drill-sev an-sev-${esc(a.severity)}">${esc(a.severity)}</div>
        </div>`).join('');
        return `<section class="an-drill-group">
          <header><span class="an-group-ico">${meta.emoji}</span> ${esc(meta.label)} <span class="an-group-count">${list.length}</span></header>
          ${items}
        </section>`;
      }).join('');
    } catch (e) {
      const body = document.getElementById('an-drill-body');
      if (body) body.innerHTML = '<div class="an-empty"><div class="an-empty-ico">⚠️</div><div class="an-empty-title">Could not load</div><div class="an-empty-sub">' + esc(e.message) + '</div></div>';
    }
  }
  function closeDrill() { const m = document.getElementById('an-drill'); if (m) m.remove(); }

  // ─── Threshold admin form ────────────────────────────────────────────
  async function openThresholdAdmin() {
    let modal = document.getElementById('an-thresh');
    if (modal) modal.remove();
    modal = el('div', {
      id: 'an-thresh',
      class: 'an-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tune anomaly thresholds',
      onClick: (e) => { if (e.target.id === 'an-thresh') closeThresh(); }
    }, [
      el('div', { class: 'an-modal an-modal-thresh' }, [
        el('div', { class: 'an-modal-head' }, [
          el('div', { class: 'an-modal-title' }, [el('span', { text: 'Tune Thresholds' })]),
          el('div', { class: 'an-modal-actions' }, [
            el('button', { class: 'an-btn an-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeThresh })
          ])
        ]),
        el('div', { id: 'an-thresh-body', class: 'an-thresh-body', html: '<div class="an-empty"><div class="an-empty-ico">⏳</div><div class="an-empty-title">Loading…</div></div>' })
      ])
    ]);
    document.body.appendChild(modal);
    await fetchThresholds();
    renderThresholds();
  }

  function renderThresholds() {
    const body = document.getElementById('an-thresh-body');
    if (!body) return;
    if (!Object.keys(thresholdsCache).length) {
      body.innerHTML = '<div class="an-empty"><div class="an-empty-ico">⚠️</div><div class="an-empty-title">Could not load thresholds</div></div>';
      return;
    }
    body.innerHTML = Object.entries(thresholdsCache).map(([metric, cfg]) => {
      const meta = METRIC_DISPLAY[metric] || { label: metric, emoji: '🔬' };
      return `<article class="an-thresh-card" data-metric="${esc(metric)}">
        <header class="an-thresh-head">
          <h3>${meta.emoji} ${esc(meta.label)}</h3>
          <label class="an-thresh-toggle">
            <input type="checkbox" data-field="enabled" ${cfg.enabled ? 'checked' : ''}>
            <span>Enabled</span>
          </label>
        </header>
        <div class="an-thresh-grid">
          <label class="an-thresh-field"><span>z threshold</span>
            <input type="number" step="0.1" min="0.5" max="10" data-field="z_threshold" value="${esc(String(cfg.z_threshold))}">
          </label>
          <label class="an-thresh-field"><span>direction</span>
            <select data-field="direction">
              <option value="low" ${cfg.direction === 'low' ? 'selected' : ''}>low</option>
              <option value="high" ${cfg.direction === 'high' ? 'selected' : ''}>high</option>
              <option value="either" ${cfg.direction === 'either' ? 'selected' : ''}>either</option>
            </select>
          </label>
          <label class="an-thresh-field"><span>min history days</span>
            <input type="number" step="1" min="3" max="60" data-field="min_history_days" value="${esc(String(cfg.min_history_days))}">
          </label>
          <label class="an-thresh-field"><span>lookback days</span>
            <input type="number" step="1" min="7" max="90" data-field="lookback_days" value="${esc(String(cfg.lookback_days))}">
          </label>
        </div>
        <footer class="an-thresh-foot">
          <button class="an-btn an-btn-primary an-btn-sm" data-action="save" data-metric="${esc(metric)}">Save</button>
        </footer>
      </article>`;
    }).join('');
    body.querySelectorAll('[data-action="save"]').forEach(b => b.addEventListener('click', () => saveThreshold(b.dataset.metric)));
  }

  async function saveThreshold(metric) {
    const card = document.querySelector(`.an-thresh-card[data-metric="${metric}"]`);
    if (!card) return;
    const updates = {};
    card.querySelectorAll('[data-field]').forEach(inp => {
      const f = inp.dataset.field;
      if (inp.type === 'checkbox') updates[f] = inp.checked;
      else if (inp.type === 'number') updates[f] = Number(inp.value);
      else updates[f] = inp.value;
    });
    try {
      const r = await fetch('/api/anomaly/thresholds/' + metric, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const j = await r.json();
      if (j.success && typeof window.showToast === 'function') {
        window.showToast('Saved ' + (METRIC_DISPLAY[metric]?.label || metric), 'success', 2000);
      } else if (typeof window.showToast === 'function') {
        window.showToast('Failed: ' + (j.error || 'unknown'), 'error', 3500);
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Network error', 'error', 3000);
    }
  }
  function closeThresh() { const m = document.getElementById('an-thresh'); if (m) m.remove(); }

  // ─── SSE subscription ────────────────────────────────────────────────
  function connectSse() {
    if (sseSource) return;
    if (!window.EventSource) return;
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    try {
      sseSource = new EventSource('/api/live-stream');
      sseSource.addEventListener('anomaly', (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          handleIncomingAnomaly(payload);
        } catch (e) {}
      });
      sseSource.onerror = () => {
        if (sseSource && sseSource.readyState === EventSource.CLOSED) {
          sseSource = null;
          setTimeout(connectSse, 5000);
        }
      };
    } catch (e) { sseSource = null; }
  }

  function handleIncomingAnomaly(a) {
    // Prepend to cache, dedupe by id
    recentCache = [a, ...recentCache.filter(x => x.id !== a.id)];
    if (dashboardOpen) renderDashboard();
    // Toast
    if (typeof window.showToast === 'function') {
      const meta = METRIC_DISPLAY[a.metric] || { label: a.metric, emoji: '🔬' };
      const toastType = a.severity === 'critical' ? 'error' : a.severity === 'warning' ? 'warning' : 'info';
      window.showToast(meta.emoji + ' ' + (a.agent_email || 'agent') + ' · ' + meta.label + ' z=' + fmtZ(a.modified_z), toastType, 6000);
    }
  }

  // ─── Open / close / refresh ──────────────────────────────────────────
  async function open() {
    if (!flagOn('anomalyDetectionV2')) {
      if (typeof window.showToast === 'function') {
        window.showToast('Anomaly Detection is in preview — enable via setFlag(\'anomalyDetectionV2\', true)', 'info', 4000);
      }
      return;
    }
    ensureDashboard();
    dashboardOpen = true;
    const modal = document.getElementById('an-dashboard');
    modal.style.display = 'flex';
    await refresh();
    if (animate) {
      animate(modal, { opacity: [0, 1] }, { duration: 0.15 });
      animate(modal.querySelector('.an-modal'), { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] }, { duration: 0.25, easing: SPRING });
    }
  }

  function close() {
    const modal = document.getElementById('an-dashboard');
    if (!modal) return;
    dashboardOpen = false;
    if (animate) {
      animate(modal, { opacity: [1, 0] }, { duration: 0.12 }).finished.then(() => { modal.style.display = 'none'; });
    } else {
      modal.style.display = 'none';
    }
  }

  async function refresh() {
    const days = document.getElementById('an-days')?.value || '7';
    await fetchRecent(days);
    renderDashboard();
  }

  // ─── Status bar button + keyboard ────────────────────────────────────
  function ensureStatusBarButton() {
    if (document.getElementById('an-bar-btn')) return;
    const sbRight = document.querySelector('#status-bar .sb-right');
    if (!sbRight) return;
    const btn = el('button', {
      id: 'an-bar-btn',
      class: 'sb-btn',
      title: 'Anomaly Center (N)',
      'aria-label': 'Open anomaly center',
      onClick: open,
      text: '📈'
    });
    // Insert before the schedule button if present, else before bell
    const sa = document.getElementById('sa-bar-btn');
    const bell = document.getElementById('ac-bell');
    if (sa) sbRight.insertBefore(btn, sa);
    else if (bell) sbRight.insertBefore(btn, bell);
    else sbRight.insertBefore(btn, sbRight.firstChild);
  }

  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toUpperCase() || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') open();
    if (e.key === 'Escape') {
      if (document.getElementById('an-drill')) closeDrill();
      else if (document.getElementById('an-thresh')) closeThresh();
      else if (dashboardOpen) close();
    }
  });

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    ensureStatusBarButton();
    connectSse();
    setInterval(() => { if (dashboardOpen) refresh(); }, 60_000);
  }
  document.addEventListener('DOMContentLoaded', init);
  if (window.MutationObserver) {
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('app-authenticated')) init();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // ─── Public API ──────────────────────────────────────────────────────
  window.AnomalyCenter = {
    open,
    close,
    refresh,
    drillDown,
    openThresholdAdmin
  };
})();
