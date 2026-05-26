/**
 * alert-center.js — UI module for the real-time alert system (Part 2).
 *
 * Owns:
 *   • Bell icon + unread badge in the status bar
 *   • Alert center modal (list + ack/snooze/mark-all-read actions)
 *   • Alert history view (last 30 days, filterable)
 *   • Admin threshold form
 *   • SSE subscription for instant push delivery
 *   • Browser Notification API permission flow
 *
 * All UI is namespaced under `.alert-center-*` and `.alert-history-*`.
 * Feature-flagged behind `alertsV2` (defaults ON when this script loads).
 *
 * Public API (window-scoped):
 *   AlertCenter.open()
 *   AlertCenter.close()
 *   AlertCenter.refresh()
 *   AlertCenter.openHistory()
 *   AlertCenter.openThresholdAdmin()
 *   AlertCenter.requestNotificationPermission()
 */
(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────
  let active = [];               // current active alerts (cached)
  let counts = { info: 0, warning: 0, critical: 0, total: 0 };
  let modalOpen = false;
  let historyOpen = false;
  let thresholdOpen = false;
  let sseSource = null;
  let notificationPrompted = false;
  let lastFocusTime = Date.now();

  const ML = window.Motion || window.motion || {};
  const animate = ML.animate || null;
  const SPRING = [0.22, 1, 0.36, 1];
  const BOUNCE = [0.34, 1.56, 0.64, 1];

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

  function escape(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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

  function severityIcon(sev) {
    return sev === 'critical' ? '🚨' : sev === 'warning' ? '⚠️' : 'ℹ️';
  }

  function flagOn(name) {
    if (typeof window.flag === 'function') return window.flag(name);
    return true;
  }

  // ─── Bell badge (status bar) ─────────────────────────────────────────
  function ensureBell() {
    let bell = document.getElementById('ac-bell');
    if (bell) return bell;
    const sbRight = document.querySelector('#status-bar .sb-right');
    if (!sbRight) return null;
    bell = el('button', {
      id: 'ac-bell',
      class: 'sb-btn ac-bell',
      title: 'Alert Center',
      'aria-label': 'Open alert center',
      onClick: openModal
    }, [
      el('span', { class: 'ac-bell-ico', 'aria-hidden': 'true', text: '🔔' }),
      el('span', { id: 'ac-bell-badge', class: 'ac-bell-badge', text: '0' })
    ]);
    sbRight.insertBefore(bell, sbRight.firstChild);
    return bell;
  }

  function updateBell() {
    const bell = ensureBell();
    if (!bell) return;
    const badge = bell.querySelector('#ac-bell-badge');
    if (!badge) return;
    if (counts.total > 0) {
      badge.textContent = counts.total > 99 ? '99+' : String(counts.total);
      badge.style.display = '';
      bell.classList.remove('ac-bell-empty');
      bell.dataset.severity = counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : 'info';
    } else {
      badge.style.display = 'none';
      bell.classList.add('ac-bell-empty');
      bell.removeAttribute('data-severity');
    }
  }

  // ─── Modal (alert center) ────────────────────────────────────────────
  function ensureModal() {
    let modal = document.getElementById('ac-modal');
    if (modal) return modal;
    modal = el('div', { id: 'ac-modal', class: 'ac-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Alert Center', onClick: (e) => { if (e.target.id === 'ac-modal') closeModal(); } }, [
      el('div', { class: 'ac-modal' }, [
        el('div', { class: 'ac-modal-head' }, [
          el('div', { class: 'ac-modal-title' }, [
            el('span', { text: 'Alert Center' }),
            el('span', { id: 'ac-modal-count', class: 'ac-chip' })
          ]),
          el('div', { class: 'ac-modal-actions' }, [
            el('button', { id: 'ac-mark-all', class: 'ac-btn ac-btn-ghost', text: 'Mark all read', onClick: markAllRead }),
            el('button', { class: 'ac-btn ac-btn-close', title: 'Close (Esc)', 'aria-label': 'Close', text: '✕', onClick: closeModal })
          ])
        ]),
        el('div', { id: 'ac-modal-body', class: 'ac-modal-body' }),
        el('div', { class: 'ac-modal-foot' }, [
          el('button', { class: 'ac-link', text: 'View history (30 days) →', onClick: openHistory }),
          el('button', { id: 'ac-perm-btn', class: 'ac-link ac-perm-btn', text: 'Enable browser notifications', onClick: requestPermissionUI })
        ])
      ])
    ]);
    document.body.appendChild(modal);
    return modal;
  }

  function renderModalBody() {
    const body = document.getElementById('ac-modal-body');
    const countEl = document.getElementById('ac-modal-count');
    if (!body) return;
    if (countEl) countEl.textContent = counts.total ? counts.total + ' active' : 'all clear';

    if (!active.length) {
      body.innerHTML = `
        <div class="ac-empty">
          <div class="ac-empty-ico">✓</div>
          <div class="ac-empty-title">No active alerts</div>
          <div class="ac-empty-sub">You're all caught up. We'll let you know if anything needs attention.</div>
        </div>`;
      return;
    }

    body.innerHTML = active.map(a => `
      <article class="ac-row" data-id="${a.id}" data-sev="${escape(a.severity)}">
        <div class="ac-row-ico">${severityIcon(a.severity)}</div>
        <div class="ac-row-body">
          <div class="ac-row-meta">
            <span class="ac-row-sev ac-row-sev-${escape(a.severity)}">${escape(a.severity)}</span>
            <span class="ac-row-time" title="${escape(a.createdAt)}">${escape(fmtRelative(a.createdAt))}</span>
            ${a.agentEmail ? `<span class="ac-row-agent">· ${escape(a.agentEmail)}</span>` : ''}
            <span class="ac-row-key">· ${escape(a.key)}</span>
          </div>
          <div class="ac-row-text">${escape(a.body)}</div>
        </div>
        <div class="ac-row-actions">
          <div class="ac-snooze-wrap">
            <button class="ac-btn ac-btn-ghost ac-snooze-trigger" data-id="${a.id}" aria-haspopup="menu">Snooze ▾</button>
            <div class="ac-snooze-menu" role="menu">
              <button data-min="15" data-id="${a.id}">15 minutes</button>
              <button data-min="60" data-id="${a.id}">1 hour</button>
              <button data-min="240" data-id="${a.id}">4 hours</button>
              <button data-min="1440" data-id="${a.id}">Until tomorrow</button>
            </div>
          </div>
          <button class="ac-btn ac-btn-primary ac-ack" data-id="${a.id}">Acknowledge</button>
        </div>
      </article>`).join('');

    // Wire ack buttons
    body.querySelectorAll('.ac-ack').forEach(btn => {
      btn.addEventListener('click', () => ackOne(parseInt(btn.dataset.id)));
    });
    // Wire snooze trigger
    body.querySelectorAll('.ac-snooze-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.ac-snooze-menu').forEach(m => m.classList.remove('open'));
        btn.nextElementSibling.classList.toggle('open');
      });
    });
    // Wire snooze options
    body.querySelectorAll('.ac-snooze-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        snoozeOne(parseInt(btn.dataset.id), parseInt(btn.dataset.min));
      });
    });

    // Stagger entrance
    if (animate) {
      body.querySelectorAll('.ac-row').forEach((row, i) => {
        animate(row, { opacity: [0, 1], y: [10, 0] }, { duration: 0.3, delay: i * 0.04, easing: SPRING });
      });
    }
  }

  function openModal() {
    ensureBell();
    const modal = ensureModal();
    modalOpen = true;
    modal.style.display = 'flex';
    renderModalBody();
    if (animate) {
      animate(modal, { opacity: [0, 1] }, { duration: 0.15 });
      animate(modal.querySelector('.ac-modal'), { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] }, { duration: 0.25, easing: SPRING });
    }
    refresh();  // fresh data on open
  }

  function closeModal() {
    const modal = document.getElementById('ac-modal');
    if (!modal) return;
    modalOpen = false;
    if (animate) {
      animate(modal, { opacity: [1, 0] }, { duration: 0.12 }).finished.then(() => { modal.style.display = 'none'; });
    } else {
      modal.style.display = 'none';
    }
    // Close any open snooze menus
    document.querySelectorAll('.ac-snooze-menu.open').forEach(m => m.classList.remove('open'));
  }

  // ─── Actions ─────────────────────────────────────────────────────────
  async function ackOne(id) {
    try {
      const r = await fetch('/api/alerts/' + id + '/ack', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json();
      if (j.success) {
        // Optimistic: remove row immediately
        active = active.filter(a => a.id !== id);
        counts.total = Math.max(0, counts.total - 1);
        renderModalBody();
        updateBell();
        if (typeof window.showToast === 'function') window.showToast('Alert acknowledged', 'success', 1500);
      } else {
        if (typeof window.showToast === 'function') window.showToast('Failed: ' + (j.error || 'unknown'), 'error', 3000);
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Network error', 'error', 3000);
    }
  }

  async function snoozeOne(id, minutes) {
    try {
      const r = await fetch('/api/alerts/' + id + '/snooze?minutes=' + minutes, { method: 'POST', credentials: 'same-origin' });
      const j = await r.json();
      if (j.success) {
        active = active.filter(a => a.id !== id);
        counts.total = Math.max(0, counts.total - 1);
        renderModalBody();
        updateBell();
        if (typeof window.showToast === 'function') window.showToast('Snoozed ' + minutes + ' min', 'info', 1500);
      }
    } catch (e) {}
  }

  async function markAllRead() {
    if (!confirm('Acknowledge ALL ' + counts.total + ' active alerts?')) return;
    try {
      const r = await fetch('/api/alerts/ack-all', { method: 'POST', credentials: 'same-origin' });
      const j = await r.json();
      if (j.success) {
        active = [];
        counts = { info: 0, warning: 0, critical: 0, total: 0 };
        renderModalBody();
        updateBell();
        if (typeof window.showToast === 'function') window.showToast('Acknowledged ' + (j.count || 0) + ' alerts', 'success', 2000);
      }
    } catch (e) {}
  }

  // ─── Refresh from server ─────────────────────────────────────────────
  async function refresh() {
    if (!flagOn('alerts')) return;
    try {
      const r = await fetch('/api/alerts/active?limit=50', { credentials: 'same-origin' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j.success) return;
      active = j.alerts || [];
      counts = j.counts || { info: 0, warning: 0, critical: 0, total: 0 };
      updateBell();
      if (modalOpen) renderModalBody();
    } catch (e) {}
  }

  // ─── SSE push subscription ───────────────────────────────────────────
  function connectSse() {
    if (sseSource) return;
    if (!window.EventSource) return;  // older browsers — polling fallback covers
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    try {
      sseSource = new EventSource('/api/live-stream');
      sseSource.addEventListener('alert', (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          handleIncomingAlert(payload);
        } catch (e) {}
      });
      sseSource.addEventListener('alert_ack', () => refresh());
      sseSource.addEventListener('alert_ack_all', () => refresh());
      sseSource.onerror = () => {
        // Browser will auto-reconnect after a delay. If it doesn't, close and let the polling fallback handle it.
        if (sseSource && sseSource.readyState === EventSource.CLOSED) {
          sseSource = null;
          setTimeout(connectSse, 5000);
        }
      };
    } catch (e) {
      sseSource = null;
    }
  }

  function handleIncomingAlert(payload) {
    // Prepend to active list, update counts
    active = [payload, ...active.filter(a => a.id !== payload.id)];
    counts.total += 1;
    if (counts[payload.severity] != null) counts[payload.severity] += 1;
    updateBell();
    if (modalOpen) renderModalBody();
    // Toast
    const toastType = payload.severity === 'critical' ? 'error' : payload.severity === 'warning' ? 'warning' : 'info';
    if (typeof window.showToast === 'function') {
      window.showToast(severityIcon(payload.severity) + ' ' + payload.body, toastType, 7000);
    }
    // Browser notification if tab unfocused
    maybeNotify(payload);
  }

  // ─── Browser notifications ───────────────────────────────────────────
  function maybeNotify(payload) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    // Only when tab is unfocused or hidden
    if (document.hasFocus && document.hasFocus() && document.visibilityState !== 'hidden') return;
    try {
      const title = severityIcon(payload.severity) + ' ' + (payload.key || 'Alert').replace(/_/g, ' ');
      const body = String(payload.body || '').slice(0, 140);
      const n = new Notification(title, {
        body,
        tag: payload.key || 'adit-alert',  // same-key replaces, not stacks
        icon: '/adit-logo-dark.png',
        silent: false,
        requireInteraction: payload.severity === 'critical'
      });
      n.onclick = () => { window.focus(); openModal(); n.close(); };
    } catch (e) {}
  }

  function requestPermissionUI() {
    if (!('Notification' in window)) {
      if (typeof window.showToast === 'function') window.showToast('This browser doesn\'t support notifications', 'warning');
      return;
    }
    if (Notification.permission === 'granted') {
      if (typeof window.showToast === 'function') window.showToast('Notifications already enabled ✓', 'success');
      const btn = document.getElementById('ac-perm-btn');
      if (btn) btn.style.display = 'none';
      return;
    }
    if (Notification.permission === 'denied') {
      if (typeof window.showToast === 'function') window.showToast('Notifications were blocked. Enable in browser settings.', 'warning', 5000);
      return;
    }
    Notification.requestPermission().then(result => {
      notificationPrompted = true;
      if (result === 'granted') {
        if (typeof window.showToast === 'function') window.showToast('🔔 Notifications enabled', 'success', 2500);
        const btn = document.getElementById('ac-perm-btn');
        if (btn) btn.style.display = 'none';
      }
    });
  }

  // ─── History view ────────────────────────────────────────────────────
  async function openHistory() {
    historyOpen = true;
    closeModal();
    let modal = document.getElementById('ac-history-modal');
    if (modal) { modal.style.display = 'flex'; loadHistory(); return; }
    modal = el('div', { id: 'ac-history-modal', class: 'ac-overlay', role: 'dialog', 'aria-modal': 'true', onClick: (e) => { if (e.target.id === 'ac-history-modal') closeHistory(); } }, [
      el('div', { class: 'ac-modal ac-history-modal' }, [
        el('div', { class: 'ac-modal-head' }, [
          el('div', { class: 'ac-modal-title' }, [
            el('span', { text: 'Alert History' }),
            el('span', { id: 'ac-history-count', class: 'ac-chip' })
          ]),
          el('div', { class: 'ac-modal-actions' }, [
            el('button', { class: 'ac-btn ac-btn-ghost', text: '📥 Export CSV', onClick: exportHistoryCSV }),
            el('button', { class: 'ac-btn ac-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeHistory })
          ])
        ]),
        el('div', { class: 'ac-history-filters' }, [
          el('label', { html: 'Days <select id="ac-hf-days"><option value="1">24h</option><option value="7" selected>7d</option><option value="30">30d</option><option value="90">90d</option></select>' }),
          el('label', { html: 'Severity <select id="ac-hf-sev"><option value="">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select>' }),
          el('label', { html: 'Status <select id="ac-hf-status"><option value="">All</option><option value="acked">Acked</option><option value="open">Open</option></select>' }),
          el('input', { id: 'ac-hf-search', type: 'text', placeholder: '🔍 Search…' })
        ]),
        el('div', { id: 'ac-history-body', class: 'ac-history-body' })
      ])
    ]);
    document.body.appendChild(modal);
    modal.querySelector('#ac-hf-days').addEventListener('change', loadHistory);
    modal.querySelector('#ac-hf-sev').addEventListener('change', renderHistory);
    modal.querySelector('#ac-hf-status').addEventListener('change', renderHistory);
    modal.querySelector('#ac-hf-search').addEventListener('input', renderHistory);
    loadHistory();
  }

  function closeHistory() {
    const m = document.getElementById('ac-history-modal');
    if (m) m.style.display = 'none';
    historyOpen = false;
  }

  let historyCache = [];
  async function loadHistory() {
    const days = document.getElementById('ac-hf-days')?.value || '7';
    try {
      const r = await fetch('/api/alerts/recent?days=' + days, { credentials: 'same-origin' });
      const j = await r.json();
      historyCache = j.alerts || [];
      renderHistory();
    } catch (e) {}
  }

  function renderHistory() {
    const body = document.getElementById('ac-history-body');
    const count = document.getElementById('ac-history-count');
    if (!body) return;
    const sev = document.getElementById('ac-hf-sev')?.value || '';
    const status = document.getElementById('ac-hf-status')?.value || '';
    const q = (document.getElementById('ac-hf-search')?.value || '').toLowerCase().trim();

    let rows = historyCache;
    if (sev) rows = rows.filter(r => r.severity === sev);
    if (status === 'acked') rows = rows.filter(r => !!r.ackedAt);
    if (status === 'open') rows = rows.filter(r => !r.ackedAt);
    if (q) rows = rows.filter(r => (r.body || '').toLowerCase().includes(q) || (r.key || '').toLowerCase().includes(q));

    if (count) count.textContent = rows.length + ' rows';
    if (!rows.length) {
      body.innerHTML = '<div class="ac-empty"><div class="ac-empty-ico">📭</div><div class="ac-empty-title">No matching alerts</div></div>';
      return;
    }
    body.innerHTML = '<table class="ac-history-table"><thead><tr>' +
      '<th>Time</th><th>Severity</th><th>Key</th><th>Body</th><th>Agent</th><th>Acked</th>' +
      '</tr></thead><tbody>' +
      rows.map(r => `<tr>
        <td title="${escape(r.createdAt)}">${escape(fmtRelative(r.createdAt))}</td>
        <td><span class="ac-row-sev ac-row-sev-${escape(r.severity)}">${escape(r.severity)}</span></td>
        <td><code>${escape(r.key)}</code></td>
        <td class="ac-history-body-cell">${escape(r.body)}</td>
        <td>${escape(r.agentEmail || '')}</td>
        <td>${r.ackedAt ? `<span title="${escape(r.ackedBy || '')} at ${escape(r.ackedAt)}">✓ ${escape(fmtRelative(r.ackedAt))}</span>` : '<span class="ac-row-sev ac-row-sev-warning">open</span>'}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  function exportHistoryCSV() {
    if (!historyCache.length) {
      if (typeof window.showToast === 'function') window.showToast('No data to export', 'warning');
      return;
    }
    const cols = ['createdAt', 'severity', 'key', 'body', 'agentEmail', 'ackedAt', 'ackedBy'];
    const lines = [cols.join(',')];
    for (const r of historyCache) {
      lines.push(cols.map(c => '"' + String(r[c] || '').replace(/"/g, '""').replace(/\s+/g, ' ').trim() + '"').join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alert-history-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  // ─── Threshold admin form ────────────────────────────────────────────
  async function openThresholdAdmin() {
    closeModal();
    let modal = document.getElementById('ac-thresh-modal');
    if (modal) { modal.style.display = 'flex'; loadThresholds(); return; }
    modal = el('div', { id: 'ac-thresh-modal', class: 'ac-overlay', role: 'dialog', 'aria-modal': 'true', onClick: (e) => { if (e.target.id === 'ac-thresh-modal') closeThresholdAdmin(); } }, [
      el('div', { class: 'ac-modal ac-thresh-modal' }, [
        el('div', { class: 'ac-modal-head' }, [
          el('div', { class: 'ac-modal-title' }, [el('span', { text: 'Alert Thresholds' })]),
          el('div', { class: 'ac-modal-actions' }, [
            el('button', { class: 'ac-btn ac-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeThresholdAdmin })
          ])
        ]),
        el('div', { id: 'ac-thresh-body', class: 'ac-thresh-body', html: '<div class="ac-empty"><div class="ac-empty-ico">⏳</div><div class="ac-empty-title">Loading…</div></div>' })
      ])
    ]);
    document.body.appendChild(modal);
    loadThresholds();
  }

  function closeThresholdAdmin() {
    const m = document.getElementById('ac-thresh-modal');
    if (m) m.style.display = 'none';
  }

  async function loadThresholds() {
    const body = document.getElementById('ac-thresh-body');
    if (!body) return;
    try {
      const r = await fetch('/api/alerts/thresholds', { credentials: 'same-origin' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Failed to load');
      renderThresholds(j.thresholds);
    } catch (e) {
      body.innerHTML = '<div class="ac-empty"><div class="ac-empty-ico">⚠️</div><div class="ac-empty-title">Could not load</div><div class="ac-empty-sub">' + escape(e.message) + '</div></div>';
    }
  }

  function renderThresholds(thresholds) {
    const body = document.getElementById('ac-thresh-body');
    if (!body) return;
    const cards = Object.entries(thresholds).map(([key, cfg]) => {
      const t = cfg.threshold || {};
      const inputs = Object.entries(t).map(([k, v]) => {
        if (Array.isArray(v) || (v && typeof v === 'object')) {
          return `<label class="ac-thresh-field"><span>${escape(k)}</span><input type="text" data-key="${escape(key)}" data-tkey="${escape(k)}" data-json="1" value='${escape(JSON.stringify(v))}'></label>`;
        }
        return `<label class="ac-thresh-field"><span>${escape(k)}</span><input type="number" data-key="${escape(key)}" data-tkey="${escape(k)}" value="${escape(String(v))}"></label>`;
      }).join('');
      return `
        <article class="ac-thresh-card" data-key="${escape(key)}">
          <header class="ac-thresh-head">
            <h3>${escape(key.replace(/_/g, ' '))}</h3>
            <label class="ac-thresh-toggle">
              <input type="checkbox" data-key="${escape(key)}" data-tkey="__enabled" ${cfg.enabled ? 'checked' : ''}>
              <span>Enabled</span>
            </label>
          </header>
          <div class="ac-thresh-grid">
            <label class="ac-thresh-field">
              <span>severity</span>
              <select data-key="${escape(key)}" data-tkey="__severity">
                <option value="info" ${cfg.severity === 'info' ? 'selected' : ''}>info</option>
                <option value="warning" ${cfg.severity === 'warning' ? 'selected' : ''}>warning</option>
                <option value="critical" ${cfg.severity === 'critical' ? 'selected' : ''}>critical</option>
              </select>
            </label>
            <label class="ac-thresh-field">
              <span>cooldown (sec)</span>
              <input type="number" data-key="${escape(key)}" data-tkey="__cooldown" value="${escape(String(cfg.cooldown_seconds))}">
            </label>
            ${inputs}
          </div>
          <footer class="ac-thresh-foot">
            <button class="ac-btn ac-btn-ghost" data-action="test" data-key="${escape(key)}">Fire test</button>
            <button class="ac-btn ac-btn-primary" data-action="save" data-key="${escape(key)}">Save</button>
          </footer>
        </article>`;
    }).join('');
    body.innerHTML = cards;
    body.querySelectorAll('[data-action="save"]').forEach(btn => btn.addEventListener('click', () => saveThreshold(btn.dataset.key)));
    body.querySelectorAll('[data-action="test"]').forEach(btn => btn.addEventListener('click', () => fireTest(btn.dataset.key)));
  }

  async function saveThreshold(key) {
    const card = document.querySelector(`.ac-thresh-card[data-key="${key}"]`);
    if (!card) return;
    const body = { threshold: {} };
    card.querySelectorAll('[data-key="' + key + '"]').forEach(inp => {
      const tk = inp.dataset.tkey;
      if (tk === '__enabled') body.enabled = inp.checked;
      else if (tk === '__severity') body.severity = inp.value;
      else if (tk === '__cooldown') body.cooldown_seconds = parseInt(inp.value);
      else if (inp.dataset.json) {
        try { body.threshold[tk] = JSON.parse(inp.value); } catch (e) { body.threshold[tk] = inp.value; }
      } else {
        const num = parseFloat(inp.value);
        body.threshold[tk] = isNaN(num) ? inp.value : num;
      }
    });
    try {
      const r = await fetch('/api/alerts/thresholds/' + key, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (j.success) {
        if (typeof window.showToast === 'function') window.showToast('Saved ' + key.replace(/_/g, ' '), 'success', 2000);
      } else {
        if (typeof window.showToast === 'function') window.showToast('Failed: ' + (j.error || 'unknown'), 'error', 3500);
      }
    } catch (e) {
      if (typeof window.showToast === 'function') window.showToast('Network error', 'error', 3000);
    }
  }

  async function fireTest(key) {
    try {
      const r = await fetch('/api/admin/alerts/test', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, severity: 'warning', body: 'Test fired for ' + key + ' at ' + new Date().toLocaleTimeString() })
      });
      const j = await r.json();
      if (j.success) {
        if (typeof window.showToast === 'function') window.showToast('Test alert fired (id=' + j.id + ')', 'info', 2000);
      } else {
        if (typeof window.showToast === 'function') window.showToast('Failed: ' + (j.error || 'unknown'), 'error', 3500);
      }
    } catch (e) {}
  }

  // ─── Keyboard ────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toUpperCase() || '';
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else if (historyOpen) closeHistory();
      else if (document.getElementById('ac-thresh-modal')?.style.display === 'flex') closeThresholdAdmin();
      return;
    }
    if (inInput) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 'A' opens alert center
    if (e.key === 'a' || e.key === 'A') { openModal(); }
  });

  // Close snooze menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ac-snooze-wrap')) {
      document.querySelectorAll('.ac-snooze-menu.open').forEach(m => m.classList.remove('open'));
    }
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────
  function init() {
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    ensureBell();
    refresh();
    connectSse();
    // Polling fallback — 60s (was 30s; SSE makes faster polling unnecessary)
    setInterval(refresh, 60_000);
    // Track focus for browser-notification gating
    window.addEventListener('focus', () => { lastFocusTime = Date.now(); });
  }

  document.addEventListener('DOMContentLoaded', init);
  // Also init when auth flips on later
  if (window.MutationObserver) {
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('app-authenticated')) init();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  // Public API
  window.AlertCenter = {
    open: openModal,
    close: closeModal,
    refresh,
    openHistory,
    openThresholdAdmin,
    requestNotificationPermission: requestPermissionUI
  };
})();
