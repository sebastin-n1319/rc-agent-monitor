/* Batch 301: Settings > Desk drafts and Settings > Desk webhook. Manage the Adit Expert drafts that the Zoho Desk webhook
   asks for: pause, pilot agents, run one by hand, read every draft and note, and see each webhook call with its reason. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  const ct = (utc) => { const d = new Date(/Z$|T/.test(String(utc)) ? utc : String(utc || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const store = { get(k, d) { try { const v = localStorage.getItem('ddm.' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('ddm.' + k, v); } catch (e) { /* private mode */ } } };
  async function api(u, body) {
    const r = await fetch(u, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || 'Request failed (' + r.status + ')'); return j;
  }
  const deskUrl = (id) => 'https://help.adit.com/agent/aditadvertising/support/tickets/details/' + encodeURIComponent(id);
  const pill = (cls, t) => `<span class="aiu-pill ${cls}">${esc(t)}</span>`;
  const statusPill = (s) => s === 'done' ? pill('ok', 'Done') : s === 'failed' ? pill('bad', 'Failed') : pill('', s === 'working' ? 'Writing' : 'Waiting');
  const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info', 3000); };

  // ── Desk drafts ──────────────────────────────────────────────────────
  async function renderDrafts(root) {
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading Desk drafts...</div>';
    let st, jl; const filter = store.get('jobs', '');
    try { [st, jl] = await Promise.all([api('/api/admin/desk-drafts/state'), api('/api/admin/desk-drafts/jobs?limit=100' + (filter ? '&status=' + filter : ''))]); }
    catch (e) { root.innerHTML = `<div class="stg-error">Could not load Desk drafts: ${esc(e.message)}</div>`; return; }
    const S = st.settings, w = st.stats.week || {}, done = (w.done || {}), failed = (w.failed || {});
    const pilotOn = st.pilot.length > 0, pilotSet = new Set(st.pilot.map((p) => p.id));
    const state = !st.enabled ? pill('warn', 'Off: EXPERT_DESK_KEY is not set on Railway') : S.paused ? pill('warn', 'Paused') : pill('ok', 'On');
    root.innerHTML = `
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">Expert drafts in Zoho Desk</div>
          <div class="stg-card-sub">When a client emails a T1 ticket, Adit Expert reads the ticket and saves a draft reply and a private note in Desk. It never sends: the agent reviews, edits and sends.</div></div>
          <button type="button" class="stg-btn ${S.paused ? 'stg-btn-ghost' : 'stg-btn-warning'} ddm-pause">${S.paused ? 'Resume drafts' : 'Pause drafts'}</button></div>
        <div class="ddm-pills">${state} ${st.canSave ? pill('ok', 'Saves drafts itself') : pill('', 'Text mode only (no Desk write token)')} ${pilotOn ? pill('', 'Pilot: ' + st.pilot.length + ' agents') : pill('ok', 'All T1 agents')}</div>
        <div class="aiu-kpis"><div class="aiu-kpi"><div class="aiu-kpi-l">Last 24 hours</div><div class="aiu-kpi-v">${num(st.stats.today)}</div></div>
          <div class="aiu-kpi"><div class="aiu-kpi-l">Done (7 days)</div><div class="aiu-kpi-v">${num(done.n)}</div></div>
          <div class="aiu-kpi"><div class="aiu-kpi-l">Failed (7 days)</div><div class="aiu-kpi-v">${num(failed.n)}</div></div>
          <div class="aiu-kpi"><div class="aiu-kpi-l">Average time</div><div class="aiu-kpi-v">${done.avgSec ? done.avgSec + 's' : '-'}</div></div></div>
      </div>
      <div class="stg-card">
        <div class="stg-card-title">Who gets drafts</div>
        <div class="stg-card-sub">${S.pilotFromEnv && pilotOn ? 'Now set by EXPERT_PILOT_OWNERS on Railway. Saving here takes over from it.' : 'A ticket gets a draft only when its owner is in this list, or every T1 ticket when "All T1 agents" is chosen.'}</div>
        <div class="ddm-radio" role="radiogroup" aria-label="Who gets drafts">
          <label><input type="radio" name="ddm-who" value="all" ${pilotOn ? '' : 'checked'}> All T1 agents</label>
          <label><input type="radio" name="ddm-who" value="pilot" ${pilotOn ? 'checked' : ''}> Only these agents (pilot)</label></div>
        <div class="ddm-agents" ${pilotOn ? '' : 'hidden'}>${st.agents.length ? st.agents.map((a) => `<label class="ddm-agent"><input type="checkbox" value="${esc(a.id)}" ${pilotSet.has(a.id) ? 'checked' : ''}> ${esc(a.name)}</label>`).join('') : '<p class="aiu-empty">No agents with a matching Desk name were found.</p>'}
          ${st.pilot.filter((p) => !st.agents.some((a) => a.id === p.id)).map((p) => `<label class="ddm-agent"><input type="checkbox" value="${esc(p.id)}" checked> ${esc(p.name)}</label>`).join('')}</div>
        <div class="ddm-row"><button type="button" class="stg-btn stg-btn-primary ddm-save-who">Save</button></div>
      </div>
      <div class="stg-card">
        <div class="stg-card-title">Draft one ticket now</div>
        <div class="stg-card-sub">Runs Expert on a ticket by hand (${st.canSave ? 'full review, saved in Desk' : 'quick answer, shown here only'}). Useful to test a ticket or redo a failed one.</div>
        <form class="ddm-row ddm-run"><label class="ddm-sr" for="ddm-num">Ticket number</label><input id="ddm-num" class="ddm-input" inputmode="numeric" placeholder="Ticket number, e.g. 428848" autocomplete="off">
          <button type="submit" class="stg-btn stg-btn-primary">Draft it</button><span class="ddm-run-msg" role="status"></span></form>
      </div>
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">Drafts</div><div class="stg-card-sub">Latest 100. Click a row to read the draft and the private note.</div></div>
          <div class="aiu-seg" role="radiogroup" aria-label="Filter drafts">${[['', 'All'], ['done', 'Done'], ['failed', 'Failed'], ['working', 'Writing']].map((x) => `<button type="button" role="radio" aria-checked="${filter === x[0]}" data-f="${x[0]}">${x[1]}</button>`).join('')}</div></div>
        ${jl.jobs.length ? `<div class="aiu-tbl-wrap"><table class="aiu-tbl ddm-jobs"><thead><tr><th>When (CT)</th><th>Ticket</th><th>Mode</th><th>Status</th><th class="r">Time</th><th>Problem</th></tr></thead><tbody>${jl.jobs.map((j) => `
          <tr class="ddm-job" tabindex="0" aria-expanded="false" data-id="${j.id}"><td>${esc(ct(j.created_at))}</td><td><a href="${deskUrl(j.ticket_id)}" target="_blank" rel="noopener">#${esc(j.number)}</a></td>
            <td>${j.mode === 'save' ? 'Full review' : 'Quick'}</td><td>${statusPill(j.status)}</td><td class="r">${j.ms ? Math.round(j.ms / 1000) + 's' : '-'}</td><td class="aiu-err">${esc(j.error || '')}</td></tr>
          <tr class="ddm-detail" hidden><td colspan="6"><div class="ddm-cols"><div><div class="aiu-sub-h">Draft reply</div><pre class="ddm-pre">${esc(j.reply || 'No reply text.')}</pre></div>
            <div><div class="aiu-sub-h">Private note</div><pre class="ddm-pre">${esc(j.note || 'No note.')}</pre></div></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="aiu-empty">No drafts here yet.</p>'}
      </div>`;
    root.querySelector('.ddm-pause').addEventListener('click', async (e) => { e.target.disabled = true; try { await api('/api/admin/desk-drafts/settings', { paused: !S.paused }); toast(S.paused ? 'Drafts resumed' : 'Drafts paused', 'success'); } catch (x) { toast(x.message, 'error'); } renderDrafts(root); });
    const agentsBox = root.querySelector('.ddm-agents');
    root.querySelectorAll('input[name="ddm-who"]').forEach((r) => r.addEventListener('change', () => { agentsBox.hidden = (root.querySelector('input[name="ddm-who"]:checked') || {}).value !== 'pilot'; }));
    root.querySelector('.ddm-save-who').addEventListener('click', async (e) => {
      const who = (root.querySelector('input[name="ddm-who"]:checked') || {}).value;
      const ids = [...root.querySelectorAll('.ddm-agent input:checked')].map((x) => x.value);
      if (who === 'pilot' && !ids.length) { toast('Pick at least one agent, or choose All T1 agents', 'warning'); return; }
      e.target.disabled = true;
      try { await api('/api/admin/desk-drafts/settings', { pilot: who === 'pilot' ? ids : [] }); toast('Saved', 'success'); } catch (x) { toast(x.message, 'error'); }
      renderDrafts(root);
    });
    root.querySelector('.ddm-run').addEventListener('submit', async (e) => {
      e.preventDefault(); const n = root.querySelector('#ddm-num').value.replace(/\D/g, ''), msg = root.querySelector('.ddm-run-msg'), b = e.target.querySelector('button');
      if (!n) { msg.textContent = 'Type a ticket number.'; return; }
      b.disabled = true; msg.textContent = 'Starting...';
      try { const r = await api('/api/admin/desk-drafts/run', { ticketNumber: n }); msg.textContent = r.duplicate ? 'Already drafted in the last 10 minutes (job ' + r.jobId + ').' : r.status === 'done' ? 'Done.' : 'Started (job ' + r.jobId + '). It appears below in 1 to 2 minutes.'; setTimeout(() => renderDrafts(root), r.status === 'done' ? 300 : 2500); }
      catch (x) { msg.textContent = x.message; } finally { b.disabled = false; }
    });
    root.querySelectorAll('.aiu-seg button').forEach((b) => b.addEventListener('click', () => { store.set('jobs', b.dataset.f); renderDrafts(root); }));
    root.querySelectorAll('.ddm-job').forEach((tr) => {
      const toggle = (ev) => { if (ev.target.closest('a')) return; const d = tr.nextElementSibling, open = d.hidden; d.hidden = !open; tr.setAttribute('aria-expanded', String(open)); };
      tr.addEventListener('click', toggle); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(ev); } });
    });
  }

  // ── Desk webhook ─────────────────────────────────────────────────────
  async function renderWebhook(root) {
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading the Desk webhook...</div>';
    let st, hl; const filter = store.get('hooks', '');
    try { [st, hl] = await Promise.all([api('/api/admin/desk-drafts/state'), api('/api/admin/desk-drafts/webhook?limit=150' + (filter ? '&result=' + filter : ''))]); }
    catch (e) { root.innerHTML = `<div class="stg-error">Could not load the webhook: ${esc(e.message)}</div>`; return; }
    const S = st.settings, total = hl.summary.reduce((s, r) => s + r.n, 0) || 1, last = hl.rows[0];
    root.innerHTML = `
      <div class="stg-card">
        <div class="stg-card-title">Zoho Desk webhook</div>
        <div class="stg-card-sub">Desk calls the tool when a ticket is added or a client email arrives. The tool decides whether the ticket gets an Expert draft.</div>
        <div class="ddm-pills">${st.enabled ? pill('ok', 'Accepting calls') : pill('warn', 'Off: EXPERT_DESK_KEY is not set')} ${S.paused ? pill('warn', 'Drafts paused') : ''} ${last ? pill('', 'Last call ' + ct(last.at)) : pill('warn', 'No calls yet')}</div>
        <dl class="ddm-dl">
          <div><dt>Callback URL</dt><dd><code>${esc(location.origin + st.webhookPath)}</code><div class="ddm-hint">The key is part of the URL. Keep the full URL only in Desk.</div></dd></div>
          <div><dt>Events in Desk</dt><dd>Tickets: Add, and Tickets: Incoming Threads. Support department. Supervisor rule events off.</dd></div>
          <div><dt>T1 team ID</dt><dd><code>${esc(st.team)}</code></dd></div>
          <div><dt>New tickets</dt><dd>A ticket with no team or owner yet is read again after 2 minutes, after the T1 Assignment Helper runs.</dd></div>
        </dl>
      </div>
      <div class="stg-card"><div class="stg-card-title">Last 24 hours</div><div class="stg-card-sub">What happened to each call.</div>
        ${hl.summary.length ? `<div class="ddm-bars">${hl.summary.map((r) => `<div class="ddm-bar-row"><span class="ddm-bar-l">${esc(r.reason)}</span><span class="aiu-share ddm-wide"><span style="width:${Math.round(100 * r.n / total)}%"></span></span><span class="ddm-bar-n">${num(r.n)}</span></div>`).join('')}</div>` : '<p class="aiu-empty">No calls in the last 24 hours.</p>'}</div>
      <div class="stg-card"><div class="stg-card-title">Skip rules</div>
        <div class="stg-card-sub">Emails from these senders, or with these words in the subject, never get a draft. Built-in rules always apply; add your own senders below (part of an address is enough, e.g. "@vendor.com").</div>
        <div class="aiu-sub-h">Built-in senders</div><div class="ddm-chips">${st.skipSenders.map((x) => `<span class="ddm-chip">${esc(x)}</span>`).join('')}</div>
        <div class="aiu-sub-h">Built-in subjects</div><div class="ddm-chips">${st.skipSubjects.map((x) => `<span class="ddm-chip">${esc(x)}</span>`).join('')}</div>
        <label class="aiu-sub-h" for="ddm-extra">Your extra senders (one per line)</label>
        <textarea id="ddm-extra" class="ddm-input ddm-ta" rows="4" placeholder="@vendor.com">${esc((S.extraSkip || []).join('\n'))}</textarea>
        <div class="ddm-row"><button type="button" class="stg-btn stg-btn-primary ddm-save-skip">Save</button></div></div>
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">Calls</div><div class="stg-card-sub">Latest 150 calls from Desk, newest first.</div></div>
          <div class="aiu-seg" role="radiogroup" aria-label="Filter calls">${[['', 'All'], ['started', 'Draft started'], ['skipped', 'Skipped']].map((x) => `<button type="button" role="radio" aria-checked="${filter === x[0]}" data-f="${x[0]}">${x[1]}</button>`).join('')}</div></div>
        ${hl.rows.length ? `<div class="aiu-tbl-wrap"><table class="aiu-tbl"><thead><tr><th>When (CT)</th><th>Ticket</th><th>Result</th></tr></thead><tbody>${hl.rows.map((r) => `
          <tr><td>${esc(ct(r.at))}</td><td>${r.ticket ? (String(r.ticket).length > 9 ? `<a href="${deskUrl(r.ticket)}" target="_blank" rel="noopener">Open</a>` : '#' + esc(r.ticket)) : '-'}</td>
          <td>${r.started ? pill('ok', r.duplicate ? 'Already drafting' : 'Draft started') + ' job ' + esc(r.started) : esc(r.skip || r.event || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="aiu-empty">No calls yet.</p>'}
      </div>`;
    root.querySelector('.ddm-save-skip').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await api('/api/admin/desk-drafts/settings', { extraSkip: root.querySelector('#ddm-extra').value.split(/\n|,/).map((x) => x.trim()).filter(Boolean) }); toast('Saved', 'success'); } catch (x) { toast(x.message, 'error'); }
      renderWebhook(root);
    });
    root.querySelectorAll('.aiu-seg button').forEach((b) => b.addEventListener('click', () => { store.set('hooks', b.dataset.f); renderWebhook(root); }));
  }
  window.renderDeskDraftsAdmin = renderDrafts;
  window.renderDeskWebhookAdmin = renderWebhook;
})();
