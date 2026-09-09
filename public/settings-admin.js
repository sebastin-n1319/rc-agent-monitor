/**
 * Settings Admin — Session 17 (2026-09-09)
 *
 * Admin "Settings" tab. Currently covers:
 *  • Pause Controls — Partial Pause (RC API sync only) and Full Pause
 *    (RC sync + alert/anomaly/predict evaluators), both with a duration
 *    picker, optional reason, and one-click Resume. Backed by the
 *    server-persisted app_settings table (no env vars / redeploy needed).
 *  • Background Jobs Status — read-only view of every scheduled job and
 *    whether it's currently gated by a pause.
 *  • System — DB size + RC rate-limit snapshot, for quick context when
 *    deciding whether a pause is needed.
 *
 * Entry point: window.openSettingsAdmin(), rendering into #settings-admin-root.
 */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function toastSafe(msg, type, dur) {
    if (typeof showToast === 'function') showToast(msg, type, dur);
  }

  const JOBS = [
    { name: 'Presence Sync', gate: 'rc_sync', desc: 'Polls RingCentral presence for every monitored agent (~every 30–60s).' },
    { name: 'Call Log Sync', gate: 'rc_sync', desc: 'Pulls RingCentral call logs + refreshes monthly summary every 15 min.' },
    { name: 'Missed Call Poll', gate: 'rc_sync', desc: 'Checks RC for missed calls every 1 min and posts to Google Chat.' },
    { name: 'Realtime Webhook Renewal', gate: 'rc_sync', desc: 'Renews the RC webhook subscription shortly after boot.' },
    { name: 'Alert Evaluator', gate: 'full', desc: 'Evaluates the 5 real-time alert rules every 30s.' },
    { name: 'Anomaly Evaluator', gate: 'full', desc: 'Runs nightly anomaly detection (~3:00 AM CST).' },
    { name: 'Predict Model Training', gate: 'full', desc: 'Retrains the abandonment-prediction model (~3:30 AM CST).' },
    { name: 'DB Archive / Prune', gate: 'none', desc: 'Housekeeping — archives to Sheets + prunes old rows every 2h. Never paused (disk stewardship, not RC API load).' },
  ];

  function fmtDateTime(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-US', {
        timeZone: 'America/Chicago', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }) + ' CST';
    } catch (e) { return new Date(ts).toLocaleString(); }
  }

  function fmtRemaining(ts) {
    const ms = ts - Date.now();
    if (ms <= 0) return 'expiring…';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hrs}h ${rem}m left` : `${hrs}h left`;
  }

  async function loadSettings() {
    const r = await fetch('/api/admin/settings', { credentials: 'include' });
    if (r.status === 401) throw new Error('Not logged in');
    if (r.status === 403) throw new Error('Admin access required');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Failed to load settings');
    return j;
  }

  async function doPause(mode, hours, reason) {
    const r = await fetch('/api/admin/settings/pause', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, hours, reason }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  async function doNotify(enabled) {
    const r = await fetch('/api/admin/settings/notify', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  async function doResume(mode) {
    const r = await fetch('/api/admin/settings/resume', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  /* ── Pause dialog (inline card expansion, not a full modal) ────────────── */
  function openPauseDialog(root, mode) {
    const label = mode === 'full' ? 'Full Pause' : 'Partial Pause (RC Sync Only)';
    const existing = $('.stg-pause-dialog', root);
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'stg-pause-dialog';
    wrap.innerHTML = `
      <div class="stg-pause-dialog-inner">
        <div class="stg-pause-dialog-title">${esc(label)}</div>
        <div class="stg-field-row">
          <label>Duration</label>
          <div class="stg-duration-opts">
            <button type="button" class="stg-dur-btn" data-hours="1">1 hour</button>
            <button type="button" class="stg-dur-btn" data-hours="6">6 hours</button>
            <button type="button" class="stg-dur-btn stg-dur-selected" data-hours="24">24 hours</button>
            <button type="button" class="stg-dur-btn" data-hours="custom">Custom</button>
          </div>
          <input type="number" min="0.25" max="168" step="0.25" class="stg-custom-hours" style="display:none" placeholder="Hours" />
        </div>
        <div class="stg-field-row">
          <label>Reason <span class="stg-optional">(optional, shown in audit log)</span></label>
          <input type="text" class="stg-reason-input" maxlength="500" placeholder="e.g. Padmakumar's Aria bulk run blocked by our API volume" />
        </div>
        <div class="stg-dialog-actions">
          <button type="button" class="stg-btn stg-btn-ghost stg-cancel-btn">Cancel</button>
          <button type="button" class="stg-btn ${mode === 'full' ? 'stg-btn-danger' : 'stg-btn-warning'} stg-confirm-btn">Confirm ${esc(label)}</button>
        </div>
      </div>`;

    let selectedHours = 24;
    const durBtns = wrap.querySelectorAll('.stg-dur-btn');
    const customInput = $('.stg-custom-hours', wrap);
    durBtns.forEach((b) => b.addEventListener('click', () => {
      durBtns.forEach((x) => x.classList.remove('stg-dur-selected'));
      b.classList.add('stg-dur-selected');
      if (b.dataset.hours === 'custom') {
        customInput.style.display = '';
        customInput.focus();
        selectedHours = parseFloat(customInput.value) || 24;
      } else {
        customInput.style.display = 'none';
        selectedHours = parseFloat(b.dataset.hours);
      }
    }));
    customInput.addEventListener('input', () => { selectedHours = parseFloat(customInput.value) || 0; });

    $('.stg-cancel-btn', wrap).addEventListener('click', () => wrap.remove());
    $('.stg-confirm-btn', wrap).addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (!selectedHours || selectedHours <= 0) { toastSafe('⚠ Enter a valid duration', 'warning', 3000); return; }
      const reason = $('.stg-reason-input', wrap).value.trim();
      btn.disabled = true;
      btn.textContent = 'Pausing…';
      try {
        await doPause(mode, selectedHours, reason);
        toastSafe(`⏸ ${label} set for ${selectedHours}h`, 'success', 4000);
        await window.openSettingsAdmin();
      } catch (e) {
        toastSafe('❌ ' + e.message, 'error', 5000);
        btn.disabled = false;
        btn.textContent = `Confirm ${label}`;
      }
    });

    const anchor = mode === 'full' ? $('.stg-pause-actions', root) : $('.stg-pause-actions', root);
    anchor.appendChild(wrap);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function handleResume(mode, btn) {
    btn.disabled = true;
    btn.textContent = 'Resuming…';
    try {
      await doResume(mode);
      toastSafe('▶ Resumed — background jobs will pick back up on their next tick', 'success', 4000);
      await window.openSettingsAdmin();
    } catch (e) {
      toastSafe('❌ ' + e.message, 'error', 5000);
      btn.disabled = false;
      btn.textContent = 'Resume Now';
    }
  }

  async function handleNotifyToggle(enabled, btn) {
    btn.disabled = true;
    try {
      await doNotify(enabled);
      toastSafe(enabled ? '🔔 Missed-call notifications enabled' : '🔕 Missed-call notifications disabled', 'success', 3500);
      await window.openSettingsAdmin();
    } catch (e) {
      toastSafe('❌ ' + e.message, 'error', 5000);
      btn.disabled = false;
    }
  }

  function corsWarningBanner(system) {
    if (!system || !system.corsOpen) return '';
    return `
      <div class="stg-banner stg-banner-warning">
        <div class="stg-banner-main">
          <span class="stg-banner-dot"></span>
          <div>
            <div class="stg-banner-title">CORS is open to any origin</div>
            <div class="stg-banner-sub">ALLOWED_ORIGINS is not set in Railway env vars — any website can call this API from a browser. Set it to your app's URL to restrict this.</div>
          </div>
        </div>
      </div>`;
  }

  function notificationsCard(data) {
    const enabled = data.missedCallNotifyEnabled !== false;
    return `
      <div class="stg-card">
        <div class="stg-card-title">Notifications</div>
        <div class="stg-card-sub">Controls the Google Chat missed-call notifier. Turning this off still polls RingCentral for missed calls (so nothing is missed once re-enabled) — it just stops the chat ping.</div>
        <div class="stg-notify-row">
          <div class="stg-notify-info">
            <div class="stg-pause-option-title">Missed-call Google Chat alerts</div>
            <div class="stg-pause-option-desc">${enabled ? 'Currently sending a chat message for each new missed call.' : 'Currently silent — missed calls are still tracked, just not posted to chat.'}</div>
          </div>
          <button type="button" class="stg-btn ${enabled ? 'stg-btn-warning' : 'stg-btn-light'} stg-notify-toggle" data-enabled="${enabled ? '0' : '1'}">${enabled ? 'Turn Off' : 'Turn On'}</button>
        </div>
      </div>`;
  }

  function statusBanner(pause) {
    if (pause.fullPaused) {
      return `
        <div class="stg-banner stg-banner-danger">
          <div class="stg-banner-main">
            <span class="stg-banner-dot"></span>
            <div>
              <div class="stg-banner-title">Fully Paused</div>
              <div class="stg-banner-sub">Until ${fmtDateTime(pause.fullPauseUntil)} · ${fmtRemaining(pause.fullPauseUntil)}${pause.fullPauseReason ? ' · "' + esc(pause.fullPauseReason) + '"' : ''}</div>
            </div>
          </div>
          <button type="button" class="stg-btn stg-btn-light stg-resume-btn" data-mode="full">Resume Now</button>
        </div>`;
    }
    if (pause.rcSyncPaused) {
      return `
        <div class="stg-banner stg-banner-warning">
          <div class="stg-banner-main">
            <span class="stg-banner-dot"></span>
            <div>
              <div class="stg-banner-title">RC Sync Paused</div>
              <div class="stg-banner-sub">Until ${fmtDateTime(pause.rcSyncPauseUntil)} · ${fmtRemaining(pause.rcSyncPauseUntil)}${pause.rcSyncPauseReason ? ' · "' + esc(pause.rcSyncPauseReason) + '"' : ''}</div>
            </div>
          </div>
          <button type="button" class="stg-btn stg-btn-light stg-resume-btn" data-mode="rc_sync">Resume Now</button>
        </div>`;
    }
    return `
      <div class="stg-banner stg-banner-ok">
        <div class="stg-banner-main">
          <span class="stg-banner-dot"></span>
          <div>
            <div class="stg-banner-title">Running Normally</div>
            <div class="stg-banner-sub">All background jobs active.</div>
          </div>
        </div>
      </div>`;
  }

  function jobsTable(pause) {
    const rows = JOBS.map((j) => {
      const paused = (j.gate === 'full' && pause.fullPaused) || (j.gate === 'rc_sync' && pause.rcSyncPaused);
      const stateClass = j.gate === 'none' ? 'stg-job-always' : (paused ? 'stg-job-paused' : 'stg-job-running');
      const stateLabel = j.gate === 'none' ? 'Always on' : (paused ? 'Paused' : 'Running');
      return `
        <div class="stg-job-row">
          <span class="stg-job-dot ${stateClass}"></span>
          <div class="stg-job-info">
            <div class="stg-job-name">${esc(j.name)}</div>
            <div class="stg-job-desc">${esc(j.desc)}</div>
          </div>
          <span class="stg-job-state ${stateClass}">${stateLabel}</span>
        </div>`;
    }).join('');
    return `<div class="stg-jobs-list">${rows}</div>`;
  }

  function systemCard(system) {
    const dbSize = system && system.dbSizeMB != null ? `${system.dbSizeMB} MB` : '—';
    let rl = '—';
    if (system && system.rcRateLimit) {
      try { rl = JSON.stringify(system.rcRateLimit); } catch (e) { rl = String(system.rcRateLimit); }
    }
    return `
      <div class="stg-card">
        <div class="stg-card-title">System</div>
        <div class="stg-sys-grid">
          <div class="stg-sys-item"><div class="stg-sys-label">Database size</div><div class="stg-sys-value">${esc(dbSize)}</div></div>
          <div class="stg-sys-item"><div class="stg-sys-label">RC rate-limit state</div><div class="stg-sys-value stg-sys-mono">${esc(rl)}</div></div>
        </div>
      </div>`;
  }

  function render(root, data) {
    const pause = data.pause || {};
    root.innerHTML = `
      <div class="stg-wrap">
        <div class="stg-header">
          <div>
            <div class="stg-h1">Settings</div>
            <div class="stg-h1-sub">Pause controls and admin-tunable options for the RC Productivity Monitor.</div>
          </div>
          <button type="button" class="stg-btn stg-btn-ghost stg-refresh-btn">↻ Refresh</button>
        </div>

        ${statusBanner(pause)}
        ${corsWarningBanner(data.system)}

        <div class="stg-card">
          <div class="stg-card-title">Pause Controls</div>
          <div class="stg-card-sub">Stops the RingCentral API traffic this tool generates — useful when another RC-bound job (like a bulk run) needs headroom. Auto-resumes when the timer runs out; no redeploy needed.</div>
          <div class="stg-pause-actions">
            <div class="stg-pause-option">
              <div class="stg-pause-option-title">Partial Pause</div>
              <div class="stg-pause-option-desc">Stops presence sync, call-log sync, missed-call polling &amp; webhook renewal. Dashboard stays up and usable with last-known data.</div>
              <button type="button" class="stg-btn stg-btn-warning stg-pause-trigger" data-mode="rc_sync">Partial Pause…</button>
            </div>
            <div class="stg-pause-option">
              <div class="stg-pause-option-title">Full Pause</div>
              <div class="stg-pause-option-desc">Everything Partial Pause stops, plus the alert, anomaly and predict-model evaluators. Nothing calls out to RingCentral or runs background compute.</div>
              <button type="button" class="stg-btn stg-btn-danger stg-pause-trigger" data-mode="full">Full Pause…</button>
            </div>
          </div>
        </div>

        <div class="stg-card">
          <div class="stg-card-title">Background Jobs Status</div>
          <div class="stg-card-sub">Read-only — reflects the pause state above.</div>
          ${jobsTable(pause)}
        </div>

        ${notificationsCard(data)}

        ${systemCard(data.system)}
      </div>`;

    $('.stg-refresh-btn', root).addEventListener('click', () => window.openSettingsAdmin());
    root.querySelectorAll('.stg-pause-trigger').forEach((b) => {
      b.addEventListener('click', () => openPauseDialog(root, b.dataset.mode));
    });
    root.querySelectorAll('.stg-resume-btn').forEach((b) => {
      b.addEventListener('click', () => handleResume(b.dataset.mode, b));
    });
    root.querySelectorAll('.stg-notify-toggle').forEach((b) => {
      b.addEventListener('click', () => handleNotifyToggle(b.dataset.enabled === '1', b));
    });
  }

  window.openSettingsAdmin = async function () {
    const root = document.getElementById('settings-admin-root');
    if (!root) return;
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading settings…</div>';
    try {
      const data = await loadSettings();
      render(root, data);
    } catch (e) {
      root.innerHTML = `<div class="stg-error">❌ ${esc(e.message)}</div>`;
    }
  };
})();
