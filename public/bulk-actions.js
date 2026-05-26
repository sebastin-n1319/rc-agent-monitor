/**
 * bulk-actions.js — UI module for admin bulk operations (Session 10).
 *
 * Replaces the rough Session 1 stub. Adds multi-select to the agent table
 * and an action picker modal with payload form + confirm preview.
 *
 * Feature flag: `bulkActionsV2` (default OFF — set via setFlag).
 *
 * Public API (window-scoped):
 *   BulkActions.open(opts?)              — open picker modal (opts.emails preselects)
 *   BulkActions.close()
 *   BulkActions.refresh()                — re-query selected agents
 *   BulkActions.installMultiSelect(opts) — attach checkboxes to a table
 *
 * Workflow (high level):
 *   1. User selects agents via checkboxes (installed by installMultiSelect)
 *   2. Floating toolbar appears: "N selected · [Bulk apply…]"
 *   3. Click "Bulk apply…" → action picker modal
 *   4. Pick action → payload form
 *   5. Preview: "About to {action} N agents:" → Confirm
 *   6. POST /api/admin/bulk-actions
 *   7. Per-agent result modal with ✓/✗ breakdown
 */
(function () {
  'use strict';

  const ML = window.Motion || window.motion || {};
  const animate = ML.animate || null;
  const SPRING = [0.22, 1, 0.36, 1];

  // ─── State ───────────────────────────────────────────────────────────
  const selected = new Set();   // current selected agent emails
  let modalOpen = false;
  let availableActions = null;  // [{key, label}] — fetched lazily
  let lastResult = null;

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

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  // ─── Multi-select toolbar (attached to agent table) ──────────────────
  function ensureToolbar() {
    if (document.getElementById('ba-toolbar')) return;
    const bar = el('div', {
      id: 'ba-toolbar',
      class: 'ba-toolbar',
      role: 'toolbar',
      'aria-label': 'Bulk action toolbar',
      style: 'display:none'
    }, [
      el('span', { id: 'ba-count', class: 'ba-count', text: '0 selected' }),
      el('button', {
        class: 'ba-btn ba-btn-ghost', text: 'Clear', type: 'button',
        'aria-label': 'Clear selection',
        onClick: clearSelection
      }),
      el('button', {
        class: 'ba-btn ba-btn-primary', text: 'Bulk apply…', type: 'button',
        'aria-label': 'Open bulk action picker',
        onClick: () => open()
      })
    ]);
    document.body.appendChild(bar);
  }

  function updateToolbar() {
    ensureToolbar();
    const bar = document.getElementById('ba-toolbar');
    const count = document.getElementById('ba-count');
    if (!bar || !count) return;
    if (selected.size > 0) {
      count.textContent = selected.size + (selected.size === 1 ? ' selected' : ' selected');
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
  }

  function clearSelection() {
    selected.clear();
    document.querySelectorAll('.ba-checkbox:checked').forEach(cb => { cb.checked = false; });
    updateToolbar();
  }

  /**
   * Install checkboxes on a table. Caller provides:
   *   tableSelector — e.g. '#admin-agent-tbl-wrap table'
   *   emailFromRow(tr) → string|null — how to extract the agent email from a row
   */
  function installMultiSelect(opts) {
    if (!flagOn('bulkActionsV2')) return;
    const { tableSelector, emailFromRow } = opts || {};
    if (!tableSelector || typeof emailFromRow !== 'function') return;
    const table = document.querySelector(tableSelector);
    if (!table) return;
    // Don't double-install
    if (table.dataset.baInstalled === '1') return;
    table.dataset.baInstalled = '1';

    // Inject a checkbox column header
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.ba-th')) {
      const th = el('th', { class: 'ba-th', scope: 'col', 'aria-label': 'Selection' }, [
        el('input', {
          type: 'checkbox',
          class: 'ba-th-cb',
          'aria-label': 'Select all visible',
          onChange: (e) => {
            table.querySelectorAll('tbody .ba-checkbox').forEach(cb => {
              cb.checked = e.target.checked;
              const email = cb.dataset.email;
              if (email) {
                if (e.target.checked) selected.add(email);
                else selected.delete(email);
              }
            });
            updateToolbar();
          }
        })
      ]);
      headRow.insertBefore(th, headRow.firstChild);
    }

    // Walk current rows
    function wireRow(tr) {
      if (tr.querySelector('.ba-td')) return;
      const email = emailFromRow(tr);
      if (!email) return;
      const td = el('td', { class: 'ba-td' }, [
        el('input', {
          type: 'checkbox',
          class: 'ba-checkbox',
          'aria-label': 'Select ' + email,
          dataset: { email },
          onChange: (e) => {
            if (e.target.checked) selected.add(email);
            else selected.delete(email);
            updateToolbar();
          }
        })
      ]);
      tr.insertBefore(td, tr.firstChild);
    }

    table.querySelectorAll('tbody tr').forEach(wireRow);

    // Re-wire newly-added rows
    if (window.MutationObserver) {
      new MutationObserver(() => {
        table.querySelectorAll('tbody tr').forEach(wireRow);
      }).observe(table.querySelector('tbody') || table, { childList: true });
    }
  }

  // ─── Action picker modal ─────────────────────────────────────────────
  async function fetchAvailableActions() {
    if (availableActions) return availableActions;
    try {
      const r = await fetch('/api/admin/bulk-actions/list', { credentials: 'same-origin' });
      const j = await r.json();
      availableActions = (j && j.actions) || [];
      return availableActions;
    } catch (e) {
      availableActions = [];
      return availableActions;
    }
  }

  async function open(opts) {
    if (!flagOn('bulkActionsV2')) {
      if (typeof window.showToast === 'function') {
        window.showToast('Bulk Actions is in preview — enable via setFlag(\'bulkActionsV2\', true)', 'info', 4500);
      }
      return;
    }
    // Allow caller to preselect agents
    if (opts && Array.isArray(opts.emails)) {
      opts.emails.forEach(e => selected.add(e));
      updateToolbar();
    }
    if (selected.size === 0) {
      if (typeof window.showToast === 'function') {
        window.showToast('Select one or more agents first', 'warning', 2800);
      }
      return;
    }

    let modal = document.getElementById('ba-picker');
    if (modal) modal.remove();
    const actions = await fetchAvailableActions();
    if (!actions.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('Could not load actions — check server logs', 'error', 4000);
      }
      return;
    }

    modal = el('div', {
      id: 'ba-picker',
      class: 'ba-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bulk action picker',
      onClick: (e) => { if (e.target.id === 'ba-picker') close(); }
    }, [
      el('div', { class: 'ba-modal' }, [
        el('div', { class: 'ba-modal-head' }, [
          el('div', { class: 'ba-modal-title' }, [
            el('span', { text: 'Bulk action' }),
            el('span', { class: 'ba-chip', text: selected.size + ' agent' + (selected.size === 1 ? '' : 's') })
          ]),
          el('button', { class: 'ba-btn ba-btn-close', text: '✕', 'aria-label': 'Close', onClick: close })
        ]),
        el('div', { class: 'ba-step' }, [
          el('h3', { text: '1 · Choose action' }),
          el('div', { id: 'ba-action-list', class: 'ba-action-list', html: actions.map((a, i) =>
            `<label class="ba-action${i === 0 ? ' is-selected' : ''}">
              <input type="radio" name="ba-action" value="${esc(a.key)}" ${i === 0 ? 'checked' : ''}>
              <div><strong>${esc(a.label)}</strong><span class="ba-action-key">${esc(a.key)}</span></div>
            </label>`).join('') })
        ]),
        el('div', { id: 'ba-payload-step', class: 'ba-step' }, [
          el('h3', { text: '2 · Configure' }),
          el('div', { id: 'ba-payload-form', class: 'ba-payload-form' })
        ]),
        el('div', { id: 'ba-preview', class: 'ba-step ba-preview' }),
        el('div', { class: 'ba-modal-foot' }, [
          el('button', { class: 'ba-btn ba-btn-ghost', text: 'Cancel', onClick: close }),
          el('button', { id: 'ba-execute', class: 'ba-btn ba-btn-primary', text: 'Execute', onClick: execute })
        ])
      ])
    ]);
    document.body.appendChild(modal);
    modalOpen = true;

    // Wire action radio change → re-render payload form
    modal.querySelectorAll('input[name="ba-action"]').forEach(radio => {
      radio.addEventListener('change', () => {
        modal.querySelectorAll('.ba-action').forEach(l => l.classList.remove('is-selected'));
        radio.closest('.ba-action').classList.add('is-selected');
        renderPayloadForm();
      });
    });
    renderPayloadForm();

    if (animate) {
      animate(modal, { opacity: [0, 1] }, { duration: 0.15 });
      animate(modal.querySelector('.ba-modal'), { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] }, { duration: 0.25, easing: SPRING });
    }
  }

  // Render the payload form depending on the chosen action
  function renderPayloadForm() {
    const form = document.getElementById('ba-payload-form');
    const preview = document.getElementById('ba-preview');
    if (!form || !preview) return;
    const action = document.querySelector('input[name="ba-action"]:checked')?.value;
    let html = '';
    let previewLine = '';
    if (action === 'notify') {
      html = `<label class="ba-field">
        <span>Message <small>(max 500 chars)</small></span>
        <textarea data-payload-field="message" rows="3" maxlength="500" placeholder="Stand-up in 5 min…"></textarea>
      </label>`;
      previewLine = '📢 Send chat notification to ' + selected.size + ' agent' + (selected.size === 1 ? '' : 's');
    } else if (action === 'set_breakbot_enabled') {
      html = `<label class="ba-field ba-toggle-field">
        <span>Break Bot UI</span>
        <select data-payload-field="enabled">
          <option value="true">Enabled (show Break Bot)</option>
          <option value="false">Disabled (hide Break Bot)</option>
        </select>
      </label>`;
      previewLine = '⚙️ Toggle Break Bot UI for ' + selected.size + ' agent' + (selected.size === 1 ? '' : 's');
    } else if (action === 'clear_session') {
      html = `<div class="ba-field-info">
        ⚠️ This will <strong>force-logout</strong> the selected agent${selected.size === 1 ? '' : 's'}.
        They will need to sign in again with Google. Recoverable — no data is lost.
      </div>`;
      previewLine = '⏻ Force-logout ' + selected.size + ' agent' + (selected.size === 1 ? '' : 's');
    } else if (action === 'set_role') {
      html = `<label class="ba-field">
        <span>New role</span>
        <select data-payload-field="role">
          <option value="agent">agent</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <div class="ba-field-info ba-field-warn">
        🚨 <strong>High-risk action.</strong> You cannot demote yourself.
        Audit-logged with your email and timestamp.
      </div>`;
      previewLine = '🔐 Change role for ' + selected.size + ' agent' + (selected.size === 1 ? '' : 's');
    }
    form.innerHTML = html;
    preview.innerHTML = `<div class="ba-preview-line">${esc(previewLine)}</div>
      <div class="ba-preview-emails">${[...selected].slice(0, 8).map(e => `<code>${esc(e)}</code>`).join(' ')}${selected.size > 8 ? ' …+' + (selected.size - 8) : ''}</div>`;
  }

  function collectPayload() {
    const out = {};
    document.querySelectorAll('#ba-payload-form [data-payload-field]').forEach(inp => {
      const k = inp.dataset.payloadField;
      let v = inp.value;
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      out[k] = v;
    });
    return out;
  }

  async function execute() {
    const action = document.querySelector('input[name="ba-action"]:checked')?.value;
    if (!action) return;
    const payload = collectPayload();
    const emails = [...selected];
    if (!emails.length) return;

    // Per-action confirm
    let confirmMsg = `Apply "${action}" to ${emails.length} agent${emails.length === 1 ? '' : 's'}?`;
    if (action === 'clear_session' || action === 'set_role') {
      confirmMsg = `⚠️ HIGH-RISK: ${confirmMsg}\nThis is audit-logged.`;
    }
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('ba-execute');
    if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
    try {
      const r = await fetch('/api/admin/bulk-actions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, emails, requestId: uuid() })
      });
      const j = await r.json();
      lastResult = j;
      if (j.success) {
        showResultModal(j);
        clearSelection();
      } else {
        if (typeof window.showToast === 'function') {
          window.showToast('Failed: ' + (j.error || 'unknown'), 'error', 4500);
        }
      }
    } catch (e) {
      if (typeof window.showToast === 'function') {
        window.showToast('Network error: ' + e.message, 'error', 4500);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Execute'; }
    }
  }

  function showResultModal(result) {
    close();   // close picker
    let modal = document.getElementById('ba-result');
    if (modal) modal.remove();
    const sev = result.summary.failed > 0
      ? (result.summary.ok > 0 ? 'warning' : 'critical')
      : 'success';
    modal = el('div', {
      id: 'ba-result', class: 'ba-overlay',
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bulk action result',
      onClick: (e) => { if (e.target.id === 'ba-result') closeResult(); }
    }, [
      el('div', { class: 'ba-modal ba-modal-result' }, [
        el('div', { class: 'ba-modal-head' }, [
          el('div', { class: 'ba-modal-title' }, [
            el('span', { text: 'Bulk action result' }),
            el('span', { class: 'ba-chip ba-chip-' + sev, text: result.summary.ok + '/' + result.summary.total + ' ok' })
          ]),
          el('button', { class: 'ba-btn ba-btn-close', text: '✕', 'aria-label': 'Close', onClick: closeResult })
        ]),
        el('div', { class: 'ba-result-body', html: result.results.map(r =>
          `<div class="ba-result-row ${r.ok ? 'is-ok' : 'is-fail'}">
            <span class="ba-result-ico">${r.ok ? '✓' : '✗'}</span>
            <code>${esc(r.email)}</code>
            ${r.error ? `<span class="ba-result-err">${esc(r.error)}</span>` : ''}
          </div>`
        ).join('') }),
        el('div', { class: 'ba-modal-foot' }, [
          el('span', { class: 'ba-foot-hint', text: 'Logged in audit_log · action=bulk_' + result.action }),
          el('button', { class: 'ba-btn ba-btn-primary', text: 'Done', onClick: closeResult })
        ])
      ])
    ]);
    document.body.appendChild(modal);
    if (typeof window.showToast === 'function') {
      const toastType = sev === 'success' ? 'success' : sev === 'warning' ? 'warning' : 'error';
      window.showToast(`Bulk ${result.action}: ${result.summary.ok}/${result.summary.total} ok`, toastType, 3500);
    }
  }

  function closeResult() { const m = document.getElementById('ba-result'); if (m) m.remove(); }

  function close() {
    const modal = document.getElementById('ba-picker');
    if (!modal) return;
    modalOpen = false;
    if (animate) {
      animate(modal, { opacity: [1, 0] }, { duration: 0.12 }).finished.then(() => modal.remove());
    } else {
      modal.remove();
    }
  }

  // ─── Keyboard ────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName?.toUpperCase() || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.key === 'Escape') {
      if (document.getElementById('ba-result')) closeResult();
      else if (modalOpen) close();
    }
  });

  function refresh() {
    updateToolbar();
  }

  // ─── Public API ──────────────────────────────────────────────────────
  window.BulkActions = {
    open,
    close,
    refresh,
    installMultiSelect,
    _selected: selected   // exposed for tests / debugging
  };

  // ─── Auto-init: attempt to wire to the admin agent table if visible ─
  function autoInit() {
    if (!flagOn('bulkActionsV2')) return;
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    // Best-effort: the admin agent table lives at #admin-agent-tbl-wrap (from Session 1+)
    installMultiSelect({
      tableSelector: '#admin-agent-tbl-wrap table',
      emailFromRow: (tr) => {
        const cell = tr.querySelector('[data-email], .agent-email');
        if (cell) return cell.getAttribute('data-email') || cell.textContent.trim();
        // Fall back: try second-column text matching @adit.com
        const cells = tr.querySelectorAll('td');
        for (const c of cells) {
          const t = (c.textContent || '').trim();
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return t;
        }
        return null;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', autoInit);
  if (window.MutationObserver) {
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('app-authenticated')) autoInit();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
})();
