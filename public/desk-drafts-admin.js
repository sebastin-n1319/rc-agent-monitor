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
  const statusPill = (s) => s === 'done' ? pill('ok', 'Done') : s === 'failed' ? pill('bad', 'Failed') : s === 'skipped' ? pill('warn', 'Not needed') : pill('', s === 'working' ? 'Writing' : 'Waiting');
  const STATE = { 'in desk': 'Draft waiting in Desk', sent: 'Sent by the agent', removed: 'Removed: agent sent their own reply', 'agent replied': 'Agent sent their own reply', gone: 'Draft deleted in Desk', 'not saved': 'Agent replied first', replaced: 'Replaced by a newer draft', edited: 'Edited by the agent and sent' };
  const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info', 3000); };

  // ── Desk drafts ──────────────────────────────────────────────────────
  async function renderDrafts(root) {
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading Desk drafts...</div>';
    let st, jl; const filter = store.get('jobs', '');
    try { [st, jl] = await Promise.all([api('/api/admin/desk-drafts/state'), api('/api/admin/desk-drafts/jobs?limit=10' + (filter ? '&status=' + filter : ''))]); }
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
        <div class="stg-card-title">Tickets already waiting</div>
        <div class="stg-card-sub">The webhook drafts when a client writes. Open T1 email tickets where the client wrote last before that (last 14 days, ${st.pilot.length ? 'pilot agents' : 'all T1 agents'}) can be drafted here, up to 15 at a time.</div>
        <div class="ddm-row"><button type="button" class="stg-btn stg-btn-ghost ddm-bl-check">Find waiting tickets</button><span class="ddm-run-msg ddm-bl-msg" role="status"></span></div>
        <div class="ddm-bl-list"></div>
      </div>
      <div class="stg-card">
        <div class="stg-card-title">Draft one ticket now</div>
        <div class="stg-card-sub">Runs Expert on a ticket by hand (${st.canSave ? 'full review, saved in Desk' : 'quick answer, shown here only'}). Useful to test a ticket or redo a failed one.</div>
        <form class="ddm-row ddm-run"><label class="ddm-sr" for="ddm-num">Ticket number</label><input id="ddm-num" class="ddm-input" inputmode="numeric" placeholder="Ticket number, e.g. 428848" autocomplete="off">
          <button type="submit" class="stg-btn stg-btn-primary">Draft it</button><span class="ddm-run-msg" role="status"></span></form>
      </div>
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">Latest drafts</div><div class="stg-card-sub">The last 10. Search and filter every draft on the <button type="button" class="ddm-link ddm-go-tickets">Drafted tickets</button> page.</div></div>
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
    const blMsg = root.querySelector('.ddm-bl-msg'), blList = root.querySelector('.ddm-bl-list');
    root.querySelector('.ddm-bl-check').addEventListener('click', async (e) => {
      e.target.disabled = true; blMsg.textContent = 'Looking in Desk...'; blList.innerHTML = '';
      try {
        const r = await api('/api/admin/desk-drafts/backlog', { dry: true });
        if (!r.waiting) { blMsg.textContent = 'No waiting tickets without a draft.'; return; }
        blMsg.textContent = r.waiting + ' waiting ' + (r.waiting === 1 ? 'ticket' : 'tickets') + ', oldest first:';
        blList.innerHTML = `<div class="aiu-tbl-wrap"><table class="aiu-tbl"><thead><tr><th>Ticket</th><th>Owner</th><th>Client wrote (CT)</th></tr></thead><tbody>${r.tickets.map((t) => `<tr><td><a href="${deskUrl(t.id)}" target="_blank" rel="noopener">#${esc(t.number)}</a><div class="ddm-sub">${esc(t.subject)}</div></td><td>${esc(t.owner)}</td><td>${esc(ct(t.at))}</td></tr>`).join('')}</tbody></table></div>
          <div class="ddm-row"><button type="button" class="stg-btn stg-btn-primary ddm-bl-go">Draft the oldest ${Math.min(15, r.waiting)}</button></div>`;
        blList.querySelector('.ddm-bl-go').addEventListener('click', async (ev) => {
          ev.target.disabled = true; blMsg.textContent = 'Starting...';
          try { const g = await api('/api/admin/desk-drafts/backlog', { dry: false, max: 15 }); blMsg.textContent = g.started.length + ' started, ' + g.skipped.length + ' skipped. Drafts appear in Desk over the next minutes.'; toast(g.started.length + ' drafts started', 'success'); }
          catch (x) { blMsg.textContent = x.message; ev.target.disabled = false; }
        });
      } catch (x) { blMsg.textContent = x.message; } finally { e.target.disabled = false; }
    });
    root.querySelector('.ddm-run').addEventListener('submit', async (e) => {
      e.preventDefault(); const n = root.querySelector('#ddm-num').value.replace(/\D/g, ''), msg = root.querySelector('.ddm-run-msg'), b = e.target.querySelector('button');
      if (!n) { msg.textContent = 'Type a ticket number.'; return; }
      b.disabled = true; msg.textContent = 'Starting...';
      try { const r = await api('/api/admin/desk-drafts/run', { ticketNumber: n }); msg.textContent = r.duplicate ? 'Already drafted in the last 10 minutes (job ' + r.jobId + ').' : r.status === 'done' ? 'Done.' : 'Started (job ' + r.jobId + '). It appears below in 1 to 2 minutes.'; setTimeout(() => renderDrafts(root), r.status === 'done' ? 300 : 2500); }
      catch (x) { msg.textContent = x.message; } finally { b.disabled = false; }
    });
    root.querySelectorAll('.aiu-seg button').forEach((b) => b.addEventListener('click', () => { store.set('jobs', b.dataset.f); renderDrafts(root); }));
    root.querySelector('.ddm-go-tickets').addEventListener('click', () => window.openSettingsAdmin('tickets'));
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

  // ── Batch 303: Drafted tickets (every draft, with filters) ───────────
  const F = { status: '', owner: '', q: '', account: '', deal: '', source: '', days: '30' };
  try { Object.assign(F, JSON.parse(store.get('filters', '{}')) || {}); } catch (e) { /* defaults */ }
  async function renderTickets(root, offset = 0, keep) {
    if (!keep) root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading drafted tickets...</div>';
    const qs = new URLSearchParams(Object.assign({}, F, { offset: String(offset), limit: '50' })).toString();
    let d; try { d = await api('/api/admin/desk-drafts/list?' + qs); } catch (e) { root.innerHTML = `<div class="stg-error">Could not load drafted tickets: ${esc(e.message)}</div>`; return; }
    const src = { webhook: 'Desk webhook', manual: 'By hand', automation: 'Desk function', backlog: 'Waiting tickets' };
    const rows = d.rows.map((j) => `
      <tr class="ddm-job" tabindex="0" aria-expanded="false"><td>${esc(ct(j.created_at))}</td>
        <td><a href="${deskUrl(j.ticket_id)}" target="_blank" rel="noopener">#${esc(j.number)}</a><div class="ddm-sub">${esc(j.subject || '')}</div></td>
        <td>${esc(j.owner || '-')}</td><td>${esc(j.account || '-')}${j.deal ? `<div class="ddm-sub">${esc(j.deal)}</div>` : ''}</td>
        <td>${statusPill(j.status)}<div class="ddm-sub">${esc(STATE[j.draft_state] || src[j.source || 'automation'] || j.source)}</div>${j.note_state === 'removed' ? '<div class="ddm-sub">Note removed: agent added their own</div>' : ''}</td><td class="r">${j.ms ? Math.round(j.ms / 1000) + 's' : '-'}</td></tr>
      <tr class="ddm-detail" hidden><td colspan="6">${j.error ? `<div class="aiu-alert">${esc(j.error)}</div>` : ''}<div class="ddm-cols"><div><div class="aiu-sub-h">Draft reply</div><pre class="ddm-pre">${esc(j.reply || 'No reply text.')}</pre></div>
        <div><div class="aiu-sub-h">Private note</div><pre class="ddm-pre">${esc(j.note || 'No note.')}</pre></div></div>
        <div class="ddm-row"><button type="button" class="stg-btn stg-btn-ghost ddm-redo" data-n="${esc(j.number)}">Draft this ticket again</button></div></td></tr>`).join('');
    if (keep) { const tb = root.querySelector('.ddm-tickets tbody'); tb.insertAdjacentHTML('beforeend', rows); wire(root); moreBtn(root, d, offset); return; }
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    root.innerHTML = `
      <div class="stg-card">
        <div class="stg-card-title">Drafted tickets</div>
        <div class="stg-card-sub">Every ticket Adit Expert drafted a reply for. Click a row to read the draft and the private note.</div>
        <form class="ddm-filters" role="search" aria-label="Filter drafted tickets">
          <label>Search<input class="ddm-input" name="q" value="${esc(F.q)}" placeholder="Ticket number or words"></label>
          <label>Status<select class="ddm-input" name="status">${opt('', 'All', F.status)}${opt('done', 'Done', F.status)}${opt('failed', 'Failed', F.status)}${opt('working', 'Writing', F.status)}${opt('queued', 'Waiting', F.status)}${opt('skipped', 'Not needed', F.status)}</select></label>
          <label>Owner<select class="ddm-input" name="owner">${opt('', 'All owners', F.owner)}${d.owners.map((o) => opt(o.name, o.name + ' (' + o.n + ')', F.owner)).join('')}</select></label>
          <label>Account<input class="ddm-input" name="account" value="${esc(F.account)}" placeholder="Practice or account"></label>
          <label>Deal<input class="ddm-input" name="deal" value="${esc(F.deal)}" placeholder="Deal name"></label>
          <label>From<select class="ddm-input" name="source">${opt('', 'Anywhere', F.source)}${opt('webhook', 'Desk webhook', F.source)}${opt('manual', 'By hand', F.source)}${opt('automation', 'Desk function', F.source)}${opt('backlog', 'Waiting tickets', F.source)}</select></label>
          <label>When<select class="ddm-input" name="days">${opt('1', 'Last 24 hours', F.days)}${opt('7', 'Last 7 days', F.days)}${opt('30', 'Last 30 days', F.days)}${opt('0', 'All time', F.days)}</select></label>
          <div class="ddm-fbtns"><button type="submit" class="stg-btn stg-btn-primary">Apply</button><button type="button" class="stg-btn stg-btn-ghost ddm-clear">Clear</button></div>
        </form>
        <div class="ddm-count" role="status">${num(d.total)} ${d.total === 1 ? 'ticket' : 'tickets'}</div>
        ${d.rows.length ? `<div class="aiu-tbl-wrap"><table class="aiu-tbl ddm-jobs ddm-tickets"><thead><tr><th>When (CT)</th><th>Ticket</th><th>Owner</th><th>Account / deal</th><th>Status</th><th class="r">Time</th></tr></thead><tbody>${rows}</tbody></table></div><div class="ddm-row ddm-more-wrap"></div>` : '<p class="aiu-empty">No drafted tickets match these filters.</p>'}
        <p class="ddm-hint">"Not needed": an agent replied or started a draft while Expert was writing, so no draft was added. Drafts left after an agent sends their own reply are removed within about 5 minutes. When an agent edits a draft before sending, or sends their own reply, Expert keeps the difference and learns from it; when an agent adds their own private note, Expert's note is removed.</p>
      </div>`;
    const form = root.querySelector('.ddm-filters');
    form.addEventListener('submit', (e) => { e.preventDefault(); new FormData(form).forEach((v, k) => { F[k] = String(v).trim(); }); store.set('filters', JSON.stringify(F)); renderTickets(root); });
    form.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => form.requestSubmit()));
    root.querySelector('.ddm-clear').addEventListener('click', () => { Object.assign(F, { status: '', owner: '', q: '', account: '', deal: '', source: '', days: '30' }); store.set('filters', JSON.stringify(F)); renderTickets(root); });
    wire(root); moreBtn(root, d, offset);
  }
  function moreBtn(root, d, offset) {
    const w = root.querySelector('.ddm-more-wrap'); if (!w) return; w.innerHTML = '';
    if (offset + d.rows.length < d.total) { const b = document.createElement('button'); b.type = 'button'; b.className = 'stg-btn stg-btn-ghost'; b.textContent = 'Show more'; b.addEventListener('click', () => { b.disabled = true; renderTickets(root, offset + 50, true); }); w.appendChild(b); }
  }
  function wire(root) {
    root.querySelectorAll('.ddm-job:not([data-w])').forEach((tr) => {
      tr.setAttribute('data-w', '1');
      const toggle = (ev) => { if (ev.target.closest('a,button')) return; const d = tr.nextElementSibling, open = d.hidden; d.hidden = !open; tr.setAttribute('aria-expanded', String(open)); };
      tr.addEventListener('click', toggle); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(ev); } });
    });
    root.querySelectorAll('.ddm-redo:not([data-w])').forEach((b) => { b.setAttribute('data-w', '1'); b.addEventListener('click', async () => {
      b.disabled = true; try { const r = await api('/api/admin/desk-drafts/run', { ticketNumber: b.dataset.n }); toast(r.duplicate ? 'Already drafted in the last 10 minutes' : 'Drafting again (job ' + r.jobId + ')', 'success'); } catch (x) { toast(x.message, 'error'); b.disabled = false; } }); });
  }
  window.renderDeskTicketsAdmin = (root) => renderTickets(root);
  window.renderDeskDraftsAdmin = renderDrafts;
  window.renderDeskWebhookAdmin = renderWebhook;
})();
