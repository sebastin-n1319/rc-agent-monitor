/* Session 53: Alerts hub. Overview of every Google Chat alert type
   (break log, missed calls, summaries, live ops), plus Break log and
   Missed call detail pages. Live ops and Summaries reuse their pages. */
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
  const ago = (ts) => {
    if (!ts) return 'never';
    const ms = Date.parse(String(ts).includes('T') ? ts : String(ts).replace(' ', 'T') + 'Z');
    if (Number.isNaN(ms)) return '-';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm ago';
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const ic = (inner) => `<svg class="nx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="du">${inner}</g>${inner}</svg>`;
  const ICON = {
    breakLog: ic('<path d="M5 10h11v3.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11.5h1.2a2.3 2.3 0 0 1 0 4.6H16M8.5 3.5c-.9 1.1.9 2.1 0 3.2M12 3.5c-.9 1.1.9 2.1 0 3.2"/>'),
    missed: ic('<path d="M5.5 4h3l1.8 4.6-2.3 1.4a10.6 10.6 0 0 0 5.9 5.9l1.4-2.3 4.6 1.8v3a1.8 1.8 0 0 1-1.9 1.8A15.2 15.2 0 0 1 3.7 5.9 1.8 1.8 0 0 1 5.5 4z"/><path d="M15 4l5 5M20 4l-5 5"/>'),
    summaries: ic('<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/><path d="M8.5 14.5v-2M12 14.5V9M15.5 14.5v-4"/>'),
    assessments: ic('<path d="M9 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z"/><path d="M9 4v4H5M9 13h6M9 17h4"/>'),
    review: ic('<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/><path d="M8.5 3.5L6 6M15.5 3.5L18 6"/>'),
    liveOps: ic('<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0M12 3v1.5"/>'),
  };
  const EVENTS = [['shift', 'Shift start and end'], ['break', 'Break'], ['brb', 'BRB'], ['training', 'Training'], ['qa', 'QA session'], ['internal', 'Internal call']];
  const SRC = { assess: 'Using the assessment webhook', app: 'Set here', env: 'From Railway', breaklog: 'Using the break log space', none: 'Not set', liveops: 'Using the live ops space' };
  const LINK = { review: ['audits', 'Open Review settings'], liveOps: ['ticket-alerts', 'Open live ops settings'], summaries: ['digest', 'Open summary composer'], breakLog: ['alerts-breaklog', 'Open break log'], missed: ['alerts-missed', 'Open missed call log'] };

  const RULES = [['closing', 'Closing soon and not taken', 'hours', 'hours before it closes', 1, 72], ['overdue', 'Overdue, closed with people who never took it'], ['low', 'Low pass rate or average'], ['stuck', 'Stuck or abandoned attempts', 'hours', 'hours open or locked', 1, 48]];
  function assessBlock(c) {
    if (c.key !== 'assessments' || !c.assess) return '';
    const cfg = c.assess.cfg, due = c.assess.due || [];
    const rows = RULES.map(([k, l, nk, nl, lo, hi]) => `<div class="ah-rule"><label><input type="checkbox" data-rule="${k}"${cfg[k].on ? ' checked' : ''}> ${l}</label>${nk ? `<span class="ah-num"><input class="ah-in" type="number" min="${lo}" max="${hi}" data-num="${k}.${nk}" value="${cfg[k][nk]}" aria-label="${l}, ${nl}"> ${nl}</span>` : ''}${k === 'low' ? `<span class="ah-num">pass rate under <input class="ah-in" type="number" min="1" max="100" data-num="low.passBelow" value="${cfg.low.passBelow}" aria-label="Pass rate below"> % or average under <input class="ah-in" type="number" min="1" max="100" data-num="low.avgBelow" value="${cfg.low.avgBelow}" aria-label="Average below"> %, from <input class="ah-in" type="number" min="1" max="200" data-num="low.minAttempts" value="${cfg.low.minAttempts}" aria-label="At least this many people"> people</span>` : ''}</div>`).join('');
    return `<fieldset class="ah-events ah-rules"><legend>Post these</legend>${rows}</fieldset>
      <p class="ah-foot" style="margin:6px 0 0">${due.length ? 'Needs attention now: ' + due.map(d => esc(d.title) + ' (' + d.kind + ')').join(', ') + '. These post at the next check, every 15 minutes during alert hours.' : 'Nothing needs attention right now. Checked every 15 minutes during alert hours, and each item posts once.'}</p>`;
  }
  function timingBlock(c) {
    const t = c.timing; if (!t) return '';
    const f = (t.fields || []).map(x => `<label class="ah-tf"><span>${esc(x.label)}</span><span class="ah-num"><input class="ah-in" type="number" min="${x.min}" max="${x.max}" data-num="${esc(x.path)}" value="${x.value}" aria-label="${esc(x.label)}"> ${esc(x.unit)}</span></label>`).join('');
    return `<div class="ah-timing"><div class="ah-tt">Timing</div>${f}${t.note ? `<p class="ah-foot" style="margin:4px 0 0">${esc(t.note)}</p>` : ''}</div>`;
  }
  function card(c) {
    const parts = c.key === 'liveOps' && c.parts ? `<div class="ah-parts">${[['queue', 'Caller in queue'], ['coverage', 'Nobody available'], ['tickets', 'Tickets']].map(([k, l]) => `<span class="${c.parts[k] ? 'on' : ''}">${l}</span>`).join('')}</div>` : '';
    const sched = c.key === 'summaries' ? `<div class="ah-parts"><span class="${c.schedulesOn ? 'on' : ''}">${c.schedulesOn || 0} of ${c.schedules || 0} schedules on</span></div>` : '';
    const events = c.key === 'breakLog' ? `<fieldset class="ah-events"><legend>Post these taps</legend>${EVENTS.map(([k, l]) => `<label><input type="checkbox" data-ev="${k}"${(c.events || []).includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</fieldset>` : '';
    return `<article class="ah-card ${c.enabled ? '' : 'is-off'}" data-key="${c.key}">
      <div class="ah-ch">
        <span class="ah-ic">${ICON[c.key] || ''}</span>
        <div class="ah-t"><h3>${esc(c.label)}</h3><p>${esc(c.desc)}</p></div>
        <label class="ah-tog" title="${c.enabled ? 'Turn off' : 'Turn on'}"><input type="checkbox" data-enable${c.enabled ? ' checked' : ''} aria-label="${esc(c.label)} on or off"><span class="ah-sw" aria-hidden="true"></span></label>
      </div>
      <dl class="ah-stats">
        <div><dt>Space</dt><dd class="${c.source === 'none' ? 'bad' : ''}">${esc(SRC[c.source] || c.source)}</dd></div>
        <div><dt>${esc(c.countLabel || 'Sent today')}</dt><dd>${c.sentToday || 0}</dd></div>
        <div><dt>Failed</dt><dd class="${c.failedToday ? 'bad' : ''}">${c.failedToday || 0}</dd></div>
        <div><dt>${esc(c.lastLabel || 'Last sent')}</dt><dd>${esc(ago(c.last))}</dd></div>
      </dl>
      ${parts}${sched}${events}${assessBlock(c)}${timingBlock(c)}
      ${c.noHook ? '' : `<div class="ah-hook">
        <input class="ah-in" type="url" data-url autocomplete="off" placeholder="${c.masked ? esc(c.masked) : 'Paste a Google Chat webhook URL'}" aria-label="${esc(c.label)} webhook URL">
        <button type="button" class="ah-btn ah-primary" data-save>Save</button>
        <button type="button" class="ah-btn" data-test>Send test</button>
        ${c.source === 'app' ? `<button type="button" class="ah-btn ah-ghost" data-clear>${c.key === 'liveOps' ? 'Disconnect' : (c.key === 'assessments' ? 'Use assessment webhook' : (c.key === 'review' ? 'Use Live ops webhook' : 'Use Railway value'))}</button>` : ''}
      </div>`}
      ${LINK[c.key] ? `<button type="button" class="ah-link" data-go="${LINK[c.key][0]}">${LINK[c.key][1]} →</button>` : ''}
    </article>`;
  }

  async function loadOverview(root) {
    const host = root.querySelector('[data-cards]');
    try {
      const j = await api('/api/alert-hub/status');
      if (!j.success) throw new Error(j.error);
      host.innerHTML = j.channels.map(card).join('');
      const on = j.channels.filter(c => c.enabled && c.source !== 'none').length;
      root.querySelector('[data-summary]').textContent = `${on} of ${j.channels.length} alert types are on and connected. Live alerts post only between 7 AM and 7 PM CST, every day.`;
    } catch (e) { host.innerHTML = `<div class="ah-err">${esc(e.message || 'Could not load')}</div>`; }
  }

  async function save(root, key, body) {
    const j = await api('/api/alert-hub/channel', { method: 'POST', body: JSON.stringify(Object.assign({ key }, body)) }).catch(() => ({}));
    toast(j.success ? 'Saved' : (j.error || 'Could not save'), j.success ? 'success' : 'error');
    if (j.success) loadOverview(root);
  }

  window.openAlertHub = function () {
    const root = document.getElementById('alert-hub-root');
    if (!root) return;
    if (!root.dataset.ready) {
      root.dataset.ready = '1';
      root.innerHTML = `<div class="ah-page">
        <div class="ah-head"><div><h2>Alerts</h2><p data-summary>Every Google Chat alert in one place: where it posts, whether it is on, and what it sent today.</p></div></div>
        <div class="ah-grid" data-cards><div class="ah-skel"></div><div class="ah-skel"></div></div>
        <p class="ah-foot">A webhook saved here overrides the Railway value for that alert type. To make one, open the Google Chat space, then Apps and integrations, then Webhooks, and copy the URL.</p>
      </div>`;
      root.addEventListener('change', e => {
        const c = e.target.closest('.ah-card'); if (!c) return;
        const key = c.dataset.key;
        if (e.target.hasAttribute('data-enable')) save(root, key, { enabled: e.target.checked });
        if (e.target.hasAttribute('data-rule')) save(root, key, { [e.target.dataset.rule]: { on: e.target.checked } });
        if (e.target.hasAttribute('data-num')) { const [g, f] = e.target.dataset.num.split('.'); const body = g === '_' ? { [f]: Number(e.target.value) } : { [g]: { [f]: Number(e.target.value) } }; save(root, key, body); }
        if (e.target.hasAttribute('data-ev')) save(root, key, { events: [...c.querySelectorAll('[data-ev]:checked')].map(x => x.dataset.ev) });
      });
      root.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        const c = b.closest('.ah-card');
        if (b.dataset.go) { if (typeof sbAdmin === 'function') sbAdmin(b.dataset.go); return; }
        if (!c) return;
        const key = c.dataset.key;
        if (b.hasAttribute('data-save')) {
          const url = c.querySelector('[data-url]').value.trim();
          if (!url) { toast('Paste the webhook URL first', 'warning'); return; }
          save(root, key, { webhookUrl: url });
        }
        if (b.hasAttribute('data-clear')) {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; const t = b.textContent; b.textContent = 'Click again to confirm'; setTimeout(() => { b.dataset.armed = ''; b.textContent = t; }, 4000); return; }
          save(root, key, { clearWebhook: true });
        }
        if (b.hasAttribute('data-test')) {
          b.disabled = true;
          const j = await api('/api/alert-hub/test', { method: 'POST', body: JSON.stringify({ key }) }).catch(() => ({}));
          toast(j.success ? 'Test posted to Google Chat' : (j.error || 'Test failed'), j.success ? 'success' : 'error');
          b.disabled = false;
        }
      });
    }
    loadOverview(root);
  };

  // ── Break log page ────────────────────────────────────────────────
  const STATUS = { sent: ['Posted', 'ok'], disabled: ['Off', 'mute'], filtered: ['Not posted (filtered)', 'mute'], skipped: ['Skipped', 'mute'] };
  window.openAlertBreakLog = async function () {
    const root = document.getElementById('alert-breaklog-root'); if (!root) return;
    root.innerHTML = `<div class="ah-page"><div class="ah-head"><div><h2>Break log alerts</h2><p>The last 40 break, BRB, AUX and shift taps, and whether each one posted to Google Chat.</p></div><button type="button" class="ah-btn" data-back>Alert settings</button></div><div class="ah-card ah-table-card" data-rows><div class="ah-skel"></div></div></div>`;
    root.querySelector('[data-back]').onclick = () => sbAdmin('alerts');
    try {
      const j = await api('/api/alert-hub/breaklog');
      const rows = j.data || [];
      root.querySelector('[data-rows]').innerHTML = rows.length ? `<table class="ah-table"><thead><tr><th>When</th><th>Agent</th><th>Tap</th><th>Chat</th></tr></thead><tbody>${rows.map(r => {
        const st = r.notified ? STATUS.sent : (STATUS[r.notify_status] || [r.notify_status ? 'Failed: ' + r.notify_status : 'Not sent', 'bad']);
        return `<tr><td>${esc(ago(r.created_at))}</td><td>${esc(r.username || '')}</td><td>${esc(r.action_label || '')}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td><td><span class="ah-pill ${st[1]}">${esc(st[0])}</span></td></tr>`;
      }).join('')}</tbody></table>` : '<div class="ah-empty">No break taps yet.</div>';
    } catch (e) { root.querySelector('[data-rows]').innerHTML = '<div class="ah-err">Could not load</div>'; }
  };

  // ── Missed calls page ─────────────────────────────────────────────
  window.openAlertMissed = async function () {
    const root = document.getElementById('alert-missed-root'); if (!root) return;
    root.innerHTML = `<div class="ah-page"><div class="ah-head"><div><h2>Missed call alerts</h2><p>Queue calls that were missed or abandoned are checked every minute and posted as a card.</p></div>
      <div class="ah-acts"><button type="button" class="ah-btn" data-test>Send test card</button><button type="button" class="ah-btn" data-back>Alert settings</button></div></div>
      <div class="ah-card" data-cfg><div class="ah-skel"></div></div>
      <div class="ah-card ah-table-card" data-rows><div class="ah-skel"></div></div></div>`;
    root.querySelector('[data-back]').onclick = () => sbAdmin('alerts');
    root.querySelector('[data-test]').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const j = await api('/api/admin/test-missed-call-poll', { method: 'POST' }).catch(() => ({}));
      toast(j.success ? 'Test card posted' : (j.error || 'Test failed'), j.success ? 'success' : 'error'); b.disabled = false;
    };
    try {
      const [cfg, log] = await Promise.all([api('/api/admin/debug-config'), api('/api/admin/debug-poll-log')]);
      root.querySelector('[data-cfg]').innerHTML = `<dl class="ah-stats ah-stats-wide">
        <div><dt>Webhook</dt><dd class="${cfg.webhookSet ? '' : 'bad'}">${cfg.webhookSet ? 'Connected' : 'Not set'}</dd></div>
        <div><dt>Queue extension</dt><dd>${esc(cfg.queueExt || '-')}</dd></div>
        <div><dt>Checks every</dt><dd>${esc(cfg.pollIntervalSecs || 60)}s</dd></div>
        <div><dt>Last check</dt><dd>${esc(ago(cfg.lastPollAt))}</dd></div></dl>`;
      const rows = (log.entries || []).slice().reverse();
      root.querySelector('[data-rows]').innerHTML = rows.length ? `<table class="ah-table"><thead><tr><th>Check</th><th>Calls found</th><th>Posted</th><th>Skipped</th><th>Result</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(ago(r.at))}</td><td>${r.matched || 0}</td><td>${r.notified || 0}</td><td>${r.skipped || 0}</td><td>${r.error ? `<span class="ah-pill bad">${esc(r.error).slice(0, 80)}</span>` : '<span class="ah-pill ok">OK</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="ah-empty">No checks recorded since the last restart.</div>';
    } catch (e) { root.querySelector('[data-rows]').innerHTML = '<div class="ah-err">Could not load</div>'; }
  };

  const boot = () => {
    const map = { 'tab-alerts': 'openAlertHub', 'tab-alerts-breaklog': 'openAlertBreakLog', 'tab-alerts-missed': 'openAlertMissed' };
    for (const [id, fn] of Object.entries(map)) { const el = document.getElementById(id); if (el && el.classList.contains('active')) window[fn](); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
