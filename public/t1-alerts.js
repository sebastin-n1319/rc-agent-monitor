/* Session 51: T1 CS alerts pages.
   Admin: Tickets > Ticket Alerts (lists + settings + log).
   Agent: sidebar Alerts (unassigned lists + my idle tickets). */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t || 'success'); };
  const api = async (url, opts) => {
    const r = await fetch(url, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!j) throw new Error('Server error');
    return j;
  };
  const dur = (sec) => { const s = Math.max(0, Math.round(sec || 0)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm'; };
  const ago = (iso) => { if (!iso) return 'never'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : dur(s) + ' ago'; };
  const I = {
    phone: '<svg class="nx-ic" viewBox="0 0 24 24" aria-hidden="true"><g class="du"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></g><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    users: '<svg class="nx-ic" viewBox="0 0 24 24" aria-hidden="true"><g class="du"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></g><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
    ticket: '<svg class="nx-ic" viewBox="0 0 24 24" aria-hidden="true"><g class="du"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 5v2M13 11v2M13 17v2"/></g><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 5v2M13 11v2M13 17v2"/></svg>',
    clock: '<svg class="nx-ic" viewBox="0 0 24 24" aria-hidden="true"><g class="du"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></g><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    bolt: '<svg class="nx-ic" viewBox="0 0 24 24" aria-hidden="true"><g class="du"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></g><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  };

  let timer = null;
  function stopPoll() { clearInterval(timer); timer = null; }

  function lane(title, tone, rows, empty, withAgent) {
    return `<section class="ta-lane ta-${tone}" aria-label="${esc(title)}">
      <div class="ta-lh"><span class="ta-dot" aria-hidden="true"></span><h4>${esc(title)}</h4><span class="ta-n">${rows.length}</span></div>
      <div class="ta-list">${rows.length ? rows.map(t => `
        <a class="ta-item" href="${esc(t.url || '#')}" target="_blank" rel="noopener">
          <div class="ta-row1"><b>#${esc(t.number)}</b><span class="ta-age" title="${t.reply ? 'Counted from the customer\'s latest reply' : 'Counted from when the ticket was created'}">${esc(dur(t.ageSec != null ? t.ageSec : t.idleSec))}${t.reply ? ' since reply' : ''}</span></div>
          <div class="ta-sub">${esc(t.subject || '(no subject)')}</div>
          <div class="ta-meta">${withAgent ? `<span class="ta-agent">${esc(t.agent || '')}</span>` : ''}<span>${esc(t.channel || '')}</span>${t.team ? `<span>${esc(t.team)}</span>` : ''}</div>
        </a>`).join('') : `<div class="ta-empty">${esc(empty)}</div>`}</div>
    </section>`;
  }

  function liveHTML(st) {
    const q = st.queue || {};
    const longest = (q.waiting || [])[0];
    const off = !q.loggedIn;
    return `<div class="ta-kpis">
      <div class="ta-kpi ${longest && longest.waitSec >= 60 ? 'ta-bad' : ''}"><span class="ta-ic">${I.phone}</span><div><small>Callers waiting</small><b>${off ? '-' : (q.waiting || []).length}</b><em>${longest ? 'Longest ' + dur(longest.waitSec) : (off ? 'Team off shift' : 'Queue clear')}</em></div></div>
      <div class="ta-kpi ${!off && !q.available ? 'ta-bad' : ''}"><span class="ta-ic">${I.users}</span><div><small>Available now</small><b>${off ? '-' : q.available + ' / ' + q.loggedIn}</b><em>${q.zeroSince ? 'Nobody available for ' + dur((Date.now() - Date.parse(q.zeroSince)) / 1000) : (q.onCall ? q.onCall + ' on call' : 'logged in')}</em></div></div>
      <div class="ta-kpi ${(st.tickets.unassigned || []).some(t => t.bucket === 'over') ? 'ta-bad' : ''}"><span class="ta-ic">${I.ticket}</span><div><small>Unassigned tickets</small><b>${(st.tickets.unassigned || []).length}</b><em>${(st.tickets.unassigned || []).filter(t => t.bucket !== 'new').length} over 30 min</em></div></div>
      <div class="ta-kpi ${(st.tickets.idle || []).length ? 'ta-warn' : ''}"><span class="ta-ic">${I.clock}</span><div><small>${st.isAdmin ? 'Assigned, no action' : 'My tickets, no action'}</small><b>${(st.tickets.idle || []).length}</b><em>${st.isAdmin ? 'across T1' : 'since assignment'}</em></div></div>
    </div>`;
  }

  function listsHTML(st) {
    const u = st.tickets.unassigned || [];
    const by = k => u.filter(t => t.bucket === k);
    return `<div class="ta-lanes">
        ${lane('Under 30 min', 'new', by('new'), 'No new unassigned tickets')}
        ${lane('30 to 60 min', 'mid', by('mid'), 'Nothing waiting 30+ min')}
        ${lane('Over 1 hour', 'over', by('over'), 'Nothing over an hour')}
        ${lane(st.isAdmin ? 'Assigned, no action' : 'Mine, no action', 'idle', st.tickets.idle || [], st.isAdmin ? 'Every assigned ticket has been actioned' : 'You are all caught up', st.isAdmin)}
      </div>
      <p class="ta-foot">${st.tickets.department ? esc(st.tickets.department) + ' department · ' : ''}Unassigned shows only T1's queue (T1 - Customer Support team, or no team yet). Open tickets from the last few days. Updated ${esc(ago(st.tickets.at))}${st.tickets.error ? ' · <span class="ta-err">' + esc(st.tickets.error) + '</span>' : ''}. "No action" means no reply and no comment from the owner since the ticket was assigned to them.</p>`;
  }

  async function load(root, mode) {
    try {
      const st = await api('/api/t1-alerts/state' + (mode === 'agent' ? '?scope=me' : ''));
      if (!st.success) throw new Error(st.error);
      root.querySelector('[data-live]').innerHTML = liveHTML(st);
      root.querySelector('[data-lists]').innerHTML = listsHTML(st);
      window.dispatchEvent(new CustomEvent('t1alerts:state', { detail: st }));
    } catch (e) {
      root.querySelector('[data-lists]').innerHTML = `<div class="ta-err">Could not load alerts. ${esc(e.message || '')}</div>`;
    }
  }

  // ── Settings (admin) ──────────────────────────────────────────────
  function num(name, val, label, unit, min, max) {
    return `<label class="ta-f"><span>${esc(label)}</span><span class="ta-in-u"><input type="number" class="ta-in" name="${name}" value="${esc(val)}" min="${min}" max="${max}"><em>${esc(unit)}</em></span></label>`;
  }
  function tog(name, on, label) {
    return `<label class="ta-tog"><input type="checkbox" name="${name}"${on ? ' checked' : ''}><span class="ta-sw" aria-hidden="true"></span><b>${esc(label)}</b></label>`;
  }
  function settingsHTML(c, preview, mention) {
    return `<form class="ta-set" data-settings>
      <div class="ta-set-grid">
        <fieldset><legend>Google Chat space</legend>
          <label class="ta-f ta-wide"><span>Incoming webhook URL ${c.webhookSet ? '<i class="ta-ok">Connected</i>' : '<i class="ta-no">Not set</i>'}</span>
            <input class="ta-in" name="webhookUrl" type="url" autocomplete="off" placeholder="${c.webhookSet ? esc(c.webhookMasked) : 'https://chat.googleapis.com/v1/spaces/...'}"></label>
          <p class="ta-help">In your T1 CS Alerts space: space name, <b>Apps &amp; integrations</b>, <b>Webhooks</b>, add one named "T1 Alerts", copy the URL and paste it here.</p>
          <div class="ta-row">
            <label class="ta-f"><span>Tag on queue and coverage alerts</span><input class="ta-in" name="mention" value="${esc(c.mention || '')}" placeholder="ronnie@adit.com"></label>
            <label class="ta-f"><span>Name if no tag</span><input class="ta-in" name="mentionLabel" value="${esc(c.mentionLabel || '')}" placeholder="Ronnie"></label>
          </div>
          <p class="ta-help">${mention && mention.resolved ? `<span class="ta-ok">Real tag ready</span> ${mention.email ? esc(mention.email) + ' will be pinged.' : 'Tag set.'}` : `<span class="ta-no">Not a real tag yet</span> ${esc((mention && mention.reason) || '')} Posts show plain <code>${esc(preview || '(no tag)')}</code>. Once they sign in to this tool once, the tag becomes a real ping, or paste their Google Chat ID as users/123…`}</p>
        </fieldset>
        <fieldset><legend>Calls</legend>
          ${tog('queue.enabled', c.queue.enabled, 'Caller waiting in queue')}
          <div class="ta-row">${num('queue.waitSec', c.queue.waitSec, 'Alert after', 'sec', 15, 900)}${num('queue.repeatMin', c.queue.repeatMin, 'Remind every', 'min', 1, 120)}</div>
          ${tog('coverage.enabled', c.coverage.enabled, 'Nobody available')}
          <div class="ta-row">${num('coverage.minutes', c.coverage.minutes, 'Alert after', 'min', 1, 60)}${num('coverage.repeatMin', c.coverage.repeatMin, 'Repeat every', 'min', 5, 240)}</div>
          ${tog('coverage.notifyRecovery', c.coverage.notifyRecovery, 'Post when coverage is back')}
        </fieldset>
        <fieldset><legend>Tickets</legend>
          ${tog('tickets.enabled', c.tickets.enabled, 'Watch tickets')}
          ${tog('tickets.alertUnassigned', c.tickets.alertUnassigned, 'Post unassigned tickets')}
          ${tog('tickets.alertIdle', c.tickets.alertIdle, 'Post assigned tickets with no action')}
          <div class="ta-row">${num('tickets.unassignedMin', c.tickets.unassignedMin, 'First alert', 'min', 5, 240)}${num('tickets.overMin', c.tickets.overMin, 'Escalate', 'min', 10, 720)}</div>
          <div class="ta-row">${num('tickets.idleMin', c.tickets.idleMin, 'No action after', 'min', 10, 1440)}${num('tickets.scanMin', c.tickets.scanMin, 'Check every', 'min', 2, 60)}</div>
          <div class="ta-row">${num('tickets.lookbackDays', c.tickets.lookbackDays, 'Look back', 'days', 1, 14)}</div>
        </fieldset>
      </div>
      <div class="ta-actions">
        <button type="submit" class="ta-btn ta-primary">Save settings</button>
        <button type="button" class="ta-btn" data-test>Send test</button>
        ${c.webhookSet ? '<button type="button" class="ta-btn ta-danger" data-clear>Disconnect webhook</button>' : ''}
      </div>
    </form>`;
  }
  function readForm(f) {
    const v = n => f.elements[n];
    const b = { mention: v('mention').value, mentionLabel: v('mentionLabel').value, queue: {}, coverage: {}, tickets: {} };
    if (v('webhookUrl').value.trim()) b.webhookUrl = v('webhookUrl').value.trim();
    for (const el of f.querySelectorAll('input[name*="."]')) {
      const [g, k] = el.name.split('.');
      b[g][k] = el.type === 'checkbox' ? el.checked : Number(el.value);
    }
    return b;
  }
  async function loadSettings(root) {
    const host = root.querySelector('[data-settings-host]');
    try {
      const j = await api('/api/t1-alerts/config');
      host.innerHTML = settingsHTML(j.config, j.mentionPreview, j.mention);
    } catch (e) { host.innerHTML = '<div class="ta-err">Could not load settings</div>'; }
  }
  async function loadLog(root) {
    const host = root.querySelector('[data-log]');
    try {
      const j = await api('/api/t1-alerts/log');
      const rows = j.data || [];
      host.innerHTML = rows.length ? rows.map(r => `<div class="ta-lrow"><span class="ta-ldot ${r.ok ? 'ok' : 'bad'}" aria-hidden="true"></span><span class="ta-lk">${esc(String(r.kind).replace(/_/g, ' '))}</span><span class="ta-ls">${esc(r.summary || '')}</span><time>${esc(ago(String(r.created_at).replace(' ', 'T') + 'Z'))}</time>${r.ok ? '' : `<span class="ta-err">${esc(r.error || '')}</span>`}</div>`).join('') : '<div class="ta-empty">No alerts sent yet.</div>';
    } catch (e) { host.innerHTML = ''; }
  }

  function shell(mode) {
    const admin = mode === 'admin';
    return `<div class="ta-page">
      <div class="ta-head"><div><h2>${admin ? 'T1 CS alerts' : 'Ticket alerts'}</h2><p>${admin ? 'Live queue, coverage and ticket ownership watch. Alerts post to your T1 CS Alerts space in Google Chat.' : 'Unassigned tickets that need an owner, and your own tickets still waiting for a first action.'}</p></div>
      ${admin ? '<button type="button" class="ta-btn" data-scan>Check tickets now</button>' : ''}</div>
      <div data-live><div class="ta-skel"></div></div>
      <div class="ta-card" data-lists><div class="ta-skel"></div><div class="ta-skel"></div></div>
      ${admin ? `<div class="ta-cols"><div class="ta-card"><h3>Settings</h3><div data-settings-host><div class="ta-skel"></div></div></div><div class="ta-card"><h3>Recently posted</h3><div data-log><div class="ta-skel"></div></div></div></div>` : ''}
    </div>`;
  }

  function mount(root, mode) {
    if (!root) return;
    if (!root.dataset.ready) {
      root.innerHTML = shell(mode);
      root.dataset.ready = '1';
      root.addEventListener('submit', async e => {
        const f = e.target.closest('[data-settings]'); if (!f) return;
        e.preventDefault();
        const j = await api('/api/t1-alerts/config', { method: 'POST', body: JSON.stringify(readForm(f)) }).catch(() => ({}));
        toast(j.success ? 'Alert settings saved' : (j.error || 'Could not save'), j.success ? 'success' : 'error');
        if (j.success) loadSettings(root);
      });
      root.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-test')) {
          b.disabled = true;
          const j = await api('/api/t1-alerts/test', { method: 'POST' }).catch(() => ({}));
          toast(j.success ? 'Test posted to Google Chat' : (j.error || 'Test failed'), j.success ? 'success' : 'error');
          b.disabled = false; loadLog(root);
        }
        if (b.hasAttribute('data-clear')) {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to disconnect'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Disconnect webhook'; }, 4000); return; }
          await api('/api/t1-alerts/config', { method: 'POST', body: JSON.stringify({ clearWebhook: true }) }).catch(() => {});
          toast('Webhook disconnected'); loadSettings(root);
        }
        if (b.hasAttribute('data-scan')) {
          b.disabled = true; b.textContent = 'Checking...';
          await api('/api/t1-alerts/scan', { method: 'POST' }).catch(() => {});
          b.disabled = false; b.textContent = 'Check tickets now'; load(root, mode);
        }
      });
      if (mode === 'admin') { loadSettings(root); loadLog(root); }
    }
    load(root, mode);
    stopPoll();
    timer = setInterval(() => { if (document.hidden || !root.offsetParent) return; load(root, mode); if (mode === 'admin') loadLog(root); }, 30000);
  }

  window.openT1AlertsAdmin = () => mount(document.getElementById('t1-alerts-admin-root'), 'admin');
  window.openT1AlertsAgent = () => mount(document.getElementById('t1-alerts-agent-root'), 'agent');

  // Sidebar badge for agents: count of 30+ min unassigned plus my idle tickets.
  window.addEventListener('t1alerts:state', e => {
    const st = e.detail; if (!st) return;
    const n = (st.tickets.unassigned || []).filter(t => t.bucket !== 'new').length + (st.isAdmin ? 0 : (st.tickets.idle || []).length);
    for (const id of ['sb-agent-talerts']) {
      const el = document.getElementById(id); if (!el) continue;
      let badge = el.querySelector('.ta-badge');
      if (!badge) { badge = document.createElement('span'); badge.className = 'ta-badge'; el.appendChild(badge); }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = n ? '' : 'none';
    }
  });
  // Agents get a light background refresh of the badge every 2 minutes.
  setInterval(() => {
    if (document.hidden || !document.getElementById('sb-agent-talerts')) return;
    const ag = document.getElementById('adit-agent-sidebar');
    if (!ag || !ag.offsetParent) return;
    api('/api/t1-alerts/state?scope=me').then(st => { if (st.success) window.dispatchEvent(new CustomEvent('t1alerts:state', { detail: st })); }).catch(() => {});
  }, 120000);

  const boot = () => {
    const a = document.getElementById('tab-ticket-alerts'); if (a && a.classList.contains('active')) window.openT1AlertsAdmin();
    const g = document.getElementById('agent-section-talerts'); if (g && g.classList.contains('active')) window.openT1AlertsAgent();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
