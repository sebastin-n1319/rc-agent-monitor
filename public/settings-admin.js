/**
 * Settings Admin: Session 17 (2026-09-09)
 *
 * Admin "Settings" tab. Currently covers:
 *  • Pause Controls: Partial Pause (RC API sync only) and Full Pause
 *    (RC sync + alert/anomaly/predict evaluators), both with a duration
 *    picker, optional reason, and one-click Resume. Backed by the
 *    server-persisted app_settings table (no env vars / redeploy needed).
 *  • Background Jobs Status, read-only view of every scheduled job and
 *    whether it's currently gated by a pause.
 *  • System: DB size + RC rate-limit snapshot, for quick context when
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
    { name: 'Presence sync', gate: 'rc_sync', desc: 'Polls RingCentral presence for every monitored agent (~every 30–60s).' },
    { name: 'Call log sync', gate: 'rc_sync', desc: 'Pulls RingCentral call logs + refreshes monthly summary every 15 min.' },
    { name: 'Missed call poll', gate: 'rc_sync', desc: 'Checks RC for missed calls every 1 min and posts to Google Chat.' },
    { name: 'Webhook renewal', gate: 'rc_sync', desc: 'Renews the RC webhook subscription shortly after boot.' },
    { name: 'Alert checks', gate: 'full', desc: 'Evaluates the 5 real-time alert rules every 30s.' },
    { name: 'Anomaly checks', gate: 'full', desc: 'Runs nightly anomaly detection (~3:00 AM CST).' },
    { name: 'Model training', gate: 'full', desc: 'Retrains the abandonment-prediction model (~3:30 AM CST).' },
    { name: 'Housekeeping', gate: 'none', desc: 'Housekeeping, archives to Sheets + prunes old rows every 2h. Never paused (disk stewardship, not RC API load).' },
  ];

  function fmtDateTime(ts) {
    if (!ts) return '-';
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
      toastSafe('▶ Resumed, background jobs will pick back up on their next tick', 'success', 4000);
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
            <div class="stg-banner-sub">ALLOWED_ORIGINS is not set in Railway env vars, any website can call this API from a browser. Set it to your app's URL to restrict this.</div>
          </div>
        </div>
      </div>`;
  }

  function notificationsCard(data) {
    const enabled = data.missedCallNotifyEnabled !== false;
    return `
      <section class="stg-card stg-sect" aria-labelledby="stg-n-t">
        <div class="stg-sect-head"><h3 class="stg-card-title" id="stg-n-t">Notifications</h3></div>
        <div class="stg-line">
          <div class="stg-line-info">
            <div class="stg-line-title">Missed-call alerts in Google Chat</div>
            <div class="stg-line-desc">${enabled ? 'A chat message goes out for each new missed call.' : 'Silent. Missed calls are still tracked, just not posted to chat.'}</div>
          </div>
          <button type="button" class="stg-switch stg-notify-toggle" role="switch" aria-checked="${enabled}" aria-label="Missed-call alerts in Google Chat" data-enabled="${enabled ? '0' : '1'}"><span class="stg-switch-knob"></span></button>
        </div>
      </section>`;
  }

  // Batch 349: one status panel. It says the state in plain words and shows every background job as a live chip.
  function statusPanel(pause) {
    const st = pause.fullPaused ? 'danger' : (pause.rcSyncPaused ? 'warning' : 'ok');
    const until = pause.fullPaused ? pause.fullPauseUntil : pause.rcSyncPauseUntil;
    const why = pause.fullPaused ? pause.fullPauseReason : pause.rcSyncPauseReason;
    const title = st === 'danger' ? 'Everything is paused' : st === 'warning' ? 'RingCentral sync is paused' : 'Everything is running';
    const sub = st === 'ok' ? 'All background jobs are active.' : `Resumes ${esc(fmtDateTime(until))} (${esc(fmtRemaining(until))})${why ? '. Reason: ' + esc(why) : ''}`;
    const chips = JOBS.map((j) => {
      const paused = (j.gate === 'full' && pause.fullPaused) || (j.gate === 'rc_sync' && pause.rcSyncPaused);
      const cls = j.gate === 'none' ? 'stg-job-always' : (paused ? 'stg-job-paused' : 'stg-job-running');
      const lab = j.gate === 'none' ? 'Always on' : (paused ? 'Paused' : 'Running');
      return `<li class="stg-chip ${cls}" title="${esc(j.desc)}"><span class="stg-chip-dot" aria-hidden="true"></span><span class="stg-chip-name">${esc(j.name)}</span><span class="stg-chip-state">${lab}</span></li>`;
    }).join('');
    return `
      <section class="stg-panel stg-panel-${st}" aria-label="Tool status">
        <div class="stg-panel-head">
          <span class="stg-panel-dot" aria-hidden="true"></span>
          <div class="stg-panel-text"><h3 class="stg-panel-title">${title}</h3><p class="stg-panel-sub">${sub}</p></div>
          <div class="stg-panel-acts">${st === 'ok' ? '' : `<button type="button" class="stg-btn stg-btn-primary stg-resume-btn" data-mode="${pause.fullPaused ? 'full' : 'rc_sync'}">Resume now</button>`}
            <button type="button" class="stg-btn stg-btn-ghost stg-refresh-btn" aria-label="Refresh status"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Refresh</button></div>
        </div>
        <ul class="stg-chips" aria-label="Background jobs">${chips}</ul>
      </section>`;
  }

  function systemCard(system) {
    const dbSize = system && system.dbSizeMB != null ? `${system.dbSizeMB} MB` : '-';
    let rl = '-';
    if (system && system.rcRateLimit) {
      try { rl = JSON.stringify(system.rcRateLimit); } catch (e) { rl = String(system.rcRateLimit); }
    }
    return `
      <section class="stg-card stg-sect">
        <div class="stg-sect-head"><h3 class="stg-card-title">System</h3></div>
        <div class="stg-sys-grid">
          <div class="stg-sys-item"><div class="stg-sys-label">Database size</div><div class="stg-sys-value">${esc(dbSize)}</div></div>
          <div class="stg-sys-item"><div class="stg-sys-label">RC rate-limit state</div><div class="stg-sys-value stg-sys-mono">${esc(rl)}</div></div>
        </div>
      </div>`;
  }

  function render(root, data) {
    const pause = data.pause || {};
    root.innerHTML = `
      <div class="stg-wrap stg-general">
        ${statusPanel(pause)}
        ${corsWarningBanner(data.system)}

        <section class="stg-card stg-sect" aria-labelledby="stg-p-t">
          <div class="stg-sect-head"><h3 class="stg-card-title" id="stg-p-t">Pause controls</h3>
            <p class="stg-card-sub">Stops the RingCentral traffic this tool makes, for example when a bulk run needs headroom. Jobs restart on their own when the timer ends.</p></div>
          <div class="stg-pause-actions">
            <div class="stg-line">
              <div class="stg-line-info">
                <div class="stg-line-title">Pause RingCentral sync</div>
                <div class="stg-line-desc">Stops presence sync, call-log sync, missed-call polling and webhook renewal. Dashboards stay up with the last data.</div>
              </div>
              <button type="button" class="stg-btn stg-btn-outline-warn stg-pause-trigger" data-mode="rc_sync" ${pause.rcSyncPaused || pause.fullPaused ? 'disabled' : ''}>Pause sync</button>
            </div>
            <div class="stg-line">
              <div class="stg-line-info">
                <div class="stg-line-title">Pause everything</div>
                <div class="stg-line-desc">The sync pause plus the alert, anomaly and prediction jobs. Nothing calls RingCentral or runs in the background.</div>
              </div>
              <button type="button" class="stg-btn stg-btn-outline-danger stg-pause-trigger" data-mode="full" ${pause.fullPaused ? 'disabled' : ''}>Pause everything</button>
            </div>
          </div>
        </section>

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

  // Batch 294: sub pages. General (pause controls, jobs, system) and AI usage (cost, Desk drafts, Expert log sheet).
  // Batch 349: grouped side navigation with an icon, title and one-line description per page.
  const SUBS = [['general', 'General'], ['storage', 'Storage'], ['ai', 'AI usage'], ['library', 'Expert library'], ['drafts', 'Desk drafts'], ['tickets', 'Drafted tickets'], ['webhook', 'Desk webhook']];
  const GROUPS = [['Tool', ['general', 'storage']], ['Expert AI', ['ai', 'library']], ['Zoho Desk', ['drafts', 'tickets', 'webhook']]];
  const DESC = { general: 'Tool status, pause controls and notifications.', storage: 'Disk space, Drive backups and the archive sheet.', ai: 'What the AI features cost and where the money goes.', library: 'What the Expert knows, test scores and knowledge gaps.', drafts: 'Who gets Expert drafts in Zoho Desk and how they are used.', tickets: 'Every ticket the Expert drafted a reply for.', webhook: 'Calls from Zoho Desk and the rules that skip them.' };
  const ICON = {
    general: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    storage: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    ai: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
    library: '<path d="M5 19V5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12"/>',
    drafts: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
    tickets: '<path d="M3 13h5l2 3h4l2-3h5M5.5 5h13L21 13v6H3v-6z"/>',
    webhook: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  };
  const ico = (k) => `<svg class="stg-nav-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  function subNow() { try { const v = localStorage.getItem('stg.sub'); return SUBS.some((x) => x[0] === v) ? v : 'general'; } catch (e) { return 'general'; } }
  function setSub(v) { try { localStorage.setItem('stg.sub', v); } catch (e) { /* private mode */ } }
  // Batch 315: the AI usage and Desk drafts pages refresh themselves every 30 seconds while they are open, drawn off
  // screen and swapped in, so there is no spinner flash. Skipped while someone is typing, has a row open, has the
  // waiting-tickets list out or a button busy, or has loaded more rows.
  let _auto = null;
  async function autoRefresh(root, sub, R) {
    const body = root.querySelector('.stg-sub-body');
    if (!body || !root.isConnected || subNow() !== sub || document.hidden || !body.offsetParent) return;
    const a = document.activeElement;
    if (a && body.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    if (body.querySelector('[aria-expanded="true"], .stg-loading, button:disabled') || (body.querySelector('.ddm-bl-list') && body.querySelector('.ddm-bl-list').children.length)) return;
    if (body.querySelectorAll('.ddm-tickets tbody tr.ddm-job').length > 50) return;
    const fresh = document.createElement('div'); fresh.className = 'stg-sub-body'; fresh.setAttribute('role', 'region'); fresh.setAttribute('aria-label', body.getAttribute('aria-label') || 'Settings');
    try { await window[R](fresh); } catch (e) { return; }
    if (subNow() !== sub || !body.isConnected || fresh.querySelector('.stg-error')) return;
    const a2 = document.activeElement;
    if (a2 && body.contains(a2) && /^(INPUT|SELECT|TEXTAREA)$/.test(a2.tagName)) return;
    if (body.querySelector('[aria-expanded="true"], button:disabled')) return;
    dedupe(fresh);
    body.replaceWith(fresh);
  }
  // Batch 350: a page's first card often repeats the page title (Storage, Expert library); hide that repeat.
  function dedupe(body) {
    try {
      const t = (document.querySelector('#settings-admin-root .stg-page-title') || {}).textContent;
      const first = body.querySelector('.stg-card-title');
      if (t && first && first.textContent.trim().toLowerCase() === t.trim().toLowerCase()) first.classList.add('stg-dup');
    } catch (e) { /* cosmetic only */ }
  }
  window.openSettingsAdmin = async function (sub) {
    const root = document.getElementById('settings-admin-root');
    if (!root) return;
    if (sub) setSub(sub);
    const cur = subNow();
    const name = Object.fromEntries(SUBS);
    root.innerHTML = `<div class="stg-wrap stg-shell stg-shell2">
      <nav class="stg-side" aria-label="Settings pages"><div class="stg-side-title">Settings</div>
        ${GROUPS.map((g) => `<div class="stg-side-group"><div class="stg-side-label">${g[0]}</div>${g[1].map((k) => `<button type="button" class="stg-subtab stg-nav" data-sub="${k}" aria-selected="${k === cur}" ${k === cur ? 'aria-current="page"' : ''}>${ico(k)}<span>${name[k]}</span></button>`).join('')}</div>`).join('')}
      </nav>
      <div class="stg-main"><div class="stg-page-head"><h2 class="stg-page-title">${name[cur]}</h2><p class="stg-page-sub">${DESC[cur]}</p></div>
        <div class="stg-sub-body" role="region" aria-label="${name[cur]}"></div></div></div>`;
    root.querySelectorAll('.stg-subtab').forEach((b) => b.addEventListener('click', () => window.openSettingsAdmin(b.dataset.sub)));
    const body = root.querySelector('.stg-sub-body');
    const R = { ai: 'renderAiUsageAdmin', drafts: 'renderDeskDraftsAdmin', tickets: 'renderDeskTicketsAdmin', webhook: 'renderDeskWebhookAdmin', library: 'renderExpertLibraryAdmin', storage: 'renderStorageAdmin' }[cur];
    clearInterval(_auto);
    if (R) {
      if (typeof window[R] === 'function') { _auto = setInterval(() => autoRefresh(root, cur, R), 30000); const out = await window[R](body); dedupe(body); return out; }
      body.innerHTML = '<div class="stg-error">This page did not load. Refresh the page.</div>';
      return;
    }
    body.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading settings…</div>';
    try {
      const data = await loadSettings();
      render(body, data);
    } catch (e) {
      body.innerHTML = `<div class="stg-error">❌ ${esc(e.message)}</div>`;
    }
  };
})();
