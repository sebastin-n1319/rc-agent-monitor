/**
 * predict-center.js — UI module for Predictive Abandonment (Session 12).
 *
 * Closes the loop on the Session 11 logistic-regression engine: gives
 * supervisors a real dashboard to see forecasts, backtest accuracy,
 * model weights, and trigger retraining.
 *
 * Feature flag: `predictiveAbandonmentV2` (same as Session 11 — when the
 * engine is enabled, the UI is too).
 *
 * Public API (window-scoped):
 *   PredictCenter.open()    → forecast dashboard modal
 *   PredictCenter.close()
 *   PredictCenter.refresh() → re-fetch forecast + backtest
 *   PredictCenter.retrain() → POST /api/admin/predict/train (admin)
 *
 * Keyboard shortcut: `Y` (think "y-prediction"; P is Pomodoro)
 */
(function () {
  'use strict';

  const ML = window.Motion || window.motion || {};
  const animate = ML.animate || null;
  const SPRING = [0.22, 1, 0.36, 1];

  // ─── State ───────────────────────────────────────────────────────────
  let modalOpen = false;
  let forecastCache = null;     // last /api/predict/abandonment payload
  let backtestCache = null;     // last /api/predict/backtest payload
  let modelDebugCache = null;   // last /api/predict/model payload
  let refreshTimer = null;
  let isAdmin = false;          // detected from /api/session

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
    return false;
  }

  function fmtPct(p) {
    if (p == null || !isFinite(p)) return '—';
    return Math.round(p * 100) + '%';
  }

  function fmtZ(z) {
    if (z == null || !isFinite(z)) return '—';
    return (z >= 0 ? '+' : '') + Number(z).toFixed(2);
  }

  function bandColor(probability) {
    if (probability == null || !isFinite(probability)) return 'var(--t4, #9BAFC0)';
    if (probability >= 0.7) return 'var(--red, #ED666B)';
    if (probability >= 0.4) return 'var(--yellow, #FBC84B)';
    return 'var(--green, #2DDC96)';
  }

  // ─── Data fetching ───────────────────────────────────────────────────
  async function fetchForecast() {
    try {
      const r = await fetch('/api/predict/abandonment', { credentials: 'same-origin' });
      const j = await r.json();
      forecastCache = j;
      return j;
    } catch (e) { return null; }
  }

  async function fetchBacktest(days) {
    try {
      const r = await fetch('/api/predict/backtest?days=' + (days || 7), { credentials: 'same-origin' });
      const j = await r.json();
      backtestCache = j;
      return j;
    } catch (e) { return null; }
  }

  async function fetchModelDebug() {
    if (!isAdmin) return null;
    try {
      const r = await fetch('/api/predict/model', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const j = await r.json();
      modelDebugCache = j;
      return j;
    } catch (e) { return null; }
  }

  async function detectAdmin() {
    try {
      const r = await fetch('/api/session', { credentials: 'same-origin' });
      const j = await r.json();
      isAdmin = j && j.success && j.role === 'admin';
      return isAdmin;
    } catch (e) {
      isAdmin = false;
      return false;
    }
  }

  // ─── Dashboard modal ─────────────────────────────────────────────────
  function ensureDashboard() {
    let modal = document.getElementById('pc-modal');
    if (modal) return modal;
    modal = el('div', {
      id: 'pc-modal',
      class: 'pc-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Predictive abandonment dashboard',
      onClick: (e) => { if (e.target.id === 'pc-modal') close(); }
    }, [
      el('div', { class: 'pc-modal' }, [
        el('div', { class: 'pc-modal-head' }, [
          el('div', { class: 'pc-modal-title' }, [
            el('span', { text: '🔮 Predictive Abandonment' }),
            el('span', { id: 'pc-status-chip', class: 'pc-chip' })
          ]),
          el('div', { class: 'pc-modal-actions' }, [
            el('button', { id: 'pc-retrain-btn', class: 'pc-btn pc-btn-ghost', text: '⚡ Retrain', 'aria-label': 'Retrain model now', onClick: retrain }),
            el('button', { id: 'pc-debug-btn', class: 'pc-btn pc-btn-ghost', text: '⚙ Debug', 'aria-label': 'Toggle model debug panel', onClick: toggleDebug }),
            el('button', { class: 'pc-btn pc-btn-close', text: '✕', 'aria-label': 'Close', onClick: close })
          ])
        ]),
        el('div', { class: 'pc-body' }, [
          // Forecast card
          el('section', { id: 'pc-forecast', class: 'pc-forecast', 'aria-label': 'Current forecast' },
            [el('div', { class: 'pc-empty', html: '<div class="pc-empty-ico">⏳</div><div class="pc-empty-title">Loading forecast…</div>' })]),
          // Backtest chart
          el('section', { class: 'pc-section', 'aria-label': 'Backtest' }, [
            el('header', { class: 'pc-section-head' }, [
              el('h3', { text: 'Backtest — last 7 days' }),
              el('span', { id: 'pc-backtest-meta', class: 'pc-section-meta' })
            ]),
            el('div', { id: 'pc-backtest', class: 'pc-backtest' })
          ]),
          // Debug panel (collapsed by default)
          el('section', { id: 'pc-debug', class: 'pc-section pc-debug', style: 'display:none', 'aria-label': 'Model debug' }, [
            el('header', { class: 'pc-section-head' }, [
              el('h3', { text: 'Model debug (admin)' })
            ]),
            el('div', { id: 'pc-debug-body', class: 'pc-debug-body' })
          ])
        ]),
        el('div', { class: 'pc-modal-foot' }, [
          el('span', { class: 'pc-foot-hint', html: 'Auto-refreshes every 60s · Feature flag: <code>predictiveAbandonmentV2</code>' }),
          el('button', { class: 'pc-btn pc-btn-ghost', text: '↻ Refresh', onClick: refresh })
        ])
      ])
    ]);
    document.body.appendChild(modal);
    return modal;
  }

  // ─── Forecast card render ────────────────────────────────────────────
  function renderForecast() {
    const root = document.getElementById('pc-forecast');
    const chip = document.getElementById('pc-status-chip');
    if (!root) return;

    if (!forecastCache) {
      root.innerHTML = '<div class="pc-empty"><div class="pc-empty-ico">⚠️</div><div class="pc-empty-title">Network error</div><div class="pc-empty-sub">Could not reach /api/predict/abandonment</div></div>';
      if (chip) chip.textContent = 'error';
      return;
    }
    if (!forecastCache.ready) {
      const reason = forecastCache.reason || 'no_model';
      root.innerHTML = `<div class="pc-empty">
        <div class="pc-empty-ico">🌱</div>
        <div class="pc-empty-title">No trained model yet</div>
        <div class="pc-empty-sub">${esc(forecastCache.message || 'Click "Retrain" to bootstrap from the last 30 days of call_logs.')}</div>
        <div class="pc-empty-meta"><code>${esc(reason)}</code></div>
      </div>`;
      if (chip) {
        chip.textContent = 'not ready';
        chip.dataset.state = 'cold';
      }
      // Retrain button is the only useful action
      const r = document.getElementById('pc-retrain-btn');
      if (r) r.classList.add('pc-btn-pulse');
      return;
    }

    const p = forecastCache.prediction || {};
    const m = forecastCache.model || {};
    const prob = p.probability;
    const probPct = fmtPct(prob);
    const conf = p.confidence || 'low';
    const expected = p.expectedAbandons || '—';

    if (chip) {
      chip.textContent = 'ready · ' + conf;
      chip.dataset.state = conf;
    }

    // 10-segment band — segments fill based on probability
    const segments = 10;
    const filled = Math.round((prob || 0) * segments);
    const segHtml = Array.from({ length: segments }, (_, i) =>
      `<span class="pc-band-seg${i < filled ? ' is-on' : ''}" style="${i < filled ? 'background:' + bandColor(prob) : ''}"></span>`
    ).join('');

    // Drivers — top features by absolute contribution
    const features = p.features || {};
    const weights = (m && m.evalMetrics) ? null : null;   // weights only on /api/predict/model
    const driverHtml = Object.entries(features).map(([k, v]) =>
      `<li><span class="pc-driver-k">${esc(k)}</span><span class="pc-driver-v">${esc(String(v))}</span></li>`
    ).join('');

    root.innerHTML = `
      <div class="pc-forecast-headline">
        <div class="pc-forecast-prob" data-state="${conf}" style="color:${bandColor(prob)}">${probPct}</div>
        <div class="pc-forecast-meta">
          <div class="pc-forecast-meta-line"><span>Expected abandons</span><strong>${esc(expected)}</strong></div>
          <div class="pc-forecast-meta-line"><span>Confidence</span><strong class="pc-conf pc-conf-${esc(conf)}">${esc(conf)}</strong></div>
          ${m.sampleSize ? `<div class="pc-forecast-meta-line"><span>Sample size</span><strong>${esc(String(m.sampleSize))}</strong></div>` : ''}
          ${m.evalMetrics ? `<div class="pc-forecast-meta-line"><span>Accuracy</span><strong>${esc(((m.evalMetrics.accuracy || 0) * 100).toFixed(0))}%</strong></div>` : ''}
        </div>
      </div>
      <div class="pc-band" role="meter" aria-label="Abandonment probability" aria-valuenow="${Math.round((prob || 0) * 100)}" aria-valuemin="0" aria-valuemax="100">${segHtml}</div>
      <div class="pc-drivers">
        <div class="pc-drivers-label">Live features</div>
        <ul class="pc-drivers-list">${driverHtml}</ul>
      </div>
    `;
  }

  // ─── Backtest chart ──────────────────────────────────────────────────
  function renderBacktest() {
    const root = document.getElementById('pc-backtest');
    const meta = document.getElementById('pc-backtest-meta');
    if (!root) return;

    if (!backtestCache) {
      root.innerHTML = '<div class="pc-empty"><div class="pc-empty-ico">⏳</div><div class="pc-empty-title">Loading backtest…</div></div>';
      return;
    }
    if (!backtestCache.ready) {
      root.innerHTML = '<div class="pc-empty"><div class="pc-empty-ico">🌱</div><div class="pc-empty-title">No model — backtest unavailable</div></div>';
      if (meta) meta.textContent = '';
      return;
    }
    const rows = backtestCache.backtest || [];
    if (!rows.length) {
      root.innerHTML = '<div class="pc-empty"><div class="pc-empty-ico">📭</div><div class="pc-empty-title">No backtest data</div></div>';
      return;
    }

    // Each bar: probability fill 0-100% height; ✓ if (pred>=0.5)===actual, ✗ otherwise
    const maxProb = Math.max(...rows.map(r => r.predicted || 0), 0.5);
    const bars = rows.map(r => {
      const h = Math.max(4, Math.round(((r.predicted || 0) / Math.max(maxProb, 0.01)) * 100));
      const predicted01 = (r.predicted || 0) >= 0.5 ? 1 : 0;
      const correct = predicted01 === r.actual;
      const color = bandColor(r.predicted);
      return `<div class="pc-bt-col" title="Predicted ${fmtPct(r.predicted)} · Actual ${r.actual ? 'abandons' : 'none'} (${r.actualCount || 0})">
        <div class="pc-bt-bar" style="height:${h}%; background:${color}"></div>
        <div class="pc-bt-date">${esc(r.date.slice(5))}</div>
        <div class="pc-bt-result ${correct ? 'is-ok' : 'is-miss'}">${correct ? '✓' : '✗'}</div>
      </div>`;
    }).join('');

    let correctN = 0;
    for (const r of rows) {
      const p01 = (r.predicted || 0) >= 0.5 ? 1 : 0;
      if (p01 === r.actual) correctN++;
    }
    const acc = rows.length ? (correctN / rows.length) : 0;
    if (meta) meta.textContent = correctN + '/' + rows.length + ' correct · ' + Math.round(acc * 100) + '%';

    root.innerHTML = `<div class="pc-bt-chart">${bars}</div>`;
  }

  // ─── Debug panel ─────────────────────────────────────────────────────
  function renderDebug() {
    const root = document.getElementById('pc-debug-body');
    if (!root) return;
    if (!modelDebugCache || !modelDebugCache.ready) {
      root.innerHTML = '<div class="pc-empty pc-empty-tight"><div class="pc-empty-title">No model trained yet</div></div>';
      return;
    }
    const m = modelDebugCache;
    const weights = m.weights || [];
    const featureKeys = m.featureKeys || [];
    const mu = m.mu || [];
    const sigma = m.sigma || [];
    const ev = m.evalMetrics || {};

    const weightRows = [
      `<tr><td><code>intercept</code></td><td class="pc-num">${fmtZ(weights[0])}</td><td>—</td><td>—</td></tr>`,
      ...featureKeys.map((k, i) =>
        `<tr><td><code>${esc(k)}</code></td><td class="pc-num">${fmtZ(weights[i + 1])}</td><td class="pc-num">${esc((mu[i] || 0).toFixed(2))}</td><td class="pc-num">${esc((sigma[i] || 0).toFixed(2))}</td></tr>`
      )
    ].join('');

    root.innerHTML = `
      <div class="pc-debug-grid">
        <div><span>Model key</span><code>${esc(m.modelKey || '—')}</code></div>
        <div><span>Fitted at</span><code>${esc(m.fittedAt || '—')}</code></div>
        <div><span>Sample size</span><strong>${esc(String(m.sampleSize || 0))}</strong></div>
        <div><span>Precision</span><strong>${esc(((ev.precision || 0)).toFixed(3))}</strong></div>
        <div><span>Recall</span><strong>${esc(((ev.recall || 0)).toFixed(3))}</strong></div>
        <div><span>Accuracy</span><strong>${esc(((ev.accuracy || 0)).toFixed(3))}</strong></div>
      </div>
      <table class="pc-debug-table">
        <thead><tr><th>Feature</th><th>Weight</th><th>μ</th><th>σ</th></tr></thead>
        <tbody>${weightRows}</tbody>
      </table>
      ${m.notes ? `<div class="pc-debug-notes"><strong>Notes:</strong> ${esc(m.notes)}</div>` : ''}
    `;
  }

  // ─── Actions ─────────────────────────────────────────────────────────
  async function refresh() {
    await Promise.all([fetchForecast(), fetchBacktest()]);
    renderForecast();
    renderBacktest();
    if (isAdmin) {
      await fetchModelDebug();
      renderDebug();
    }
  }

  async function retrain() {
    if (!isAdmin) {
      if (typeof window.showToast === 'function') window.showToast('Retrain requires admin role', 'warning', 2800);
      return;
    }
    const btn = document.getElementById('pc-retrain-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Training…'; }
    try {
      const r = await fetch('/api/admin/predict/train', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 })
      });
      const j = await r.json();
      if (j.success) {
        if (typeof window.showToast === 'function') {
          if (j.ready) {
            const acc = j.evalMetrics ? Math.round(j.evalMetrics.accuracy * 100) + '%' : '—';
            window.showToast(`✓ Trained on ${j.sampleSize} rows · accuracy ${acc}`, 'success', 3500);
          } else {
            window.showToast(`Train skipped: ${j.reason || 'unknown'}`, 'warning', 3500);
          }
        }
        await refresh();
      } else if (typeof window.showToast === 'function') {
        window.showToast('Train failed: ' + (j.error || 'unknown'), 'error', 4000);
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Network error: ' + e.message, 'error', 4000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Retrain'; btn.classList.remove('pc-btn-pulse'); }
    }
  }

  function toggleDebug() {
    const root = document.getElementById('pc-debug');
    if (!root) return;
    if (!isAdmin) {
      if (typeof window.showToast === 'function') window.showToast('Debug panel is admin-only', 'info', 2200);
      return;
    }
    if (root.style.display === 'none') {
      root.style.display = '';
      fetchModelDebug().then(renderDebug);
    } else {
      root.style.display = 'none';
    }
  }

  // ─── Open / close ────────────────────────────────────────────────────
  async function open() {
    if (!flagOn('predictiveAbandonmentV2')) {
      if (typeof window.showToast === 'function') {
        window.showToast("Predictive Abandonment is in preview — enable via setFlag('predictiveAbandonmentV2', true)", 'info', 4500);
      }
      return;
    }
    await detectAdmin();
    ensureDashboard();
    modalOpen = true;
    const modal = document.getElementById('pc-modal');
    modal.style.display = 'flex';
    // Hide admin-only buttons if not admin
    const dbgBtn = document.getElementById('pc-debug-btn');
    const retrainBtn = document.getElementById('pc-retrain-btn');
    if (dbgBtn) dbgBtn.style.display = isAdmin ? '' : 'none';
    if (retrainBtn) retrainBtn.style.display = isAdmin ? '' : 'none';

    if (animate) {
      animate(modal, { opacity: [0, 1] }, { duration: 0.15 });
      animate(modal.querySelector('.pc-modal'), { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] }, { duration: 0.25, easing: SPRING });
    }
    await refresh();
    // Auto-refresh every 60s while open
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, 60_000);
  }

  function close() {
    const modal = document.getElementById('pc-modal');
    if (!modal) return;
    modalOpen = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (animate) {
      animate(modal, { opacity: [1, 0] }, { duration: 0.12 }).finished.then(() => { modal.style.display = 'none'; });
    } else {
      modal.style.display = 'none';
    }
  }

  // ─── Status bar button ───────────────────────────────────────────────
  function ensureStatusBarButton() {
    if (document.getElementById('pc-bar-btn')) return;
    const sbRight = document.querySelector('#status-bar .sb-right');
    if (!sbRight) return;
    const btn = el('button', {
      id: 'pc-bar-btn',
      class: 'sb-btn',
      title: 'Predictive Abandonment (Y)',
      'aria-label': 'Open prediction dashboard',
      onClick: open,
      text: '🔮'
    });
    // Insert before the anomaly button if present, else before schedule, else first
    const an = document.getElementById('an-bar-btn');
    const sa = document.getElementById('sa-bar-btn');
    if (an) sbRight.insertBefore(btn, an);
    else if (sa) sbRight.insertBefore(btn, sa);
    else sbRight.insertBefore(btn, sbRight.firstChild);
  }

  // ─── Keyboard ────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toUpperCase() || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'y' || e.key === 'Y') open();
    if (e.key === 'Escape' && modalOpen) close();
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
  window.PredictCenter = {
    open,
    close,
    refresh,
    retrain
  };
})();
