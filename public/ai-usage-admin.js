/* Batch 294: Settings > AI usage. What the AI costs by feature and day (estimates from list prices), the cheaper-model
   quality check, Zoho Desk drafts made by Adit Expert, and the Expert search log sheet. Admin only (the APIs check). */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Number(n) || 0).toFixed(2);
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  const tok = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); };
  const store = { get(k, d) { try { const v = localStorage.getItem('aiu.' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('aiu.' + k, v); } catch (e) { /* private mode */ } } };
  const LABEL = {
    'ticket-triage': 'Open T1 ticket review', expert: 'Adit Expert answers', 'expert-investigate': 'Expert lookups', 'expert-investigate:pattern': 'Expert lookups (same issue elsewhere)',
    'expert-investigate:precedent': 'Expert lookups (past cases)', 'expert-investigate:research': 'Expert research', 'live-chat': 'Live chat assist', 'call-qa': 'Call QA',
    'call-qa-teach': 'Call QA teaching', 'describe-images': 'Reading screenshots', 'read-document': 'Reading PDFs', 'escalation-watch': 'Escalation watch', 'voip-project': 'VoIP ticket reads',
    'transfer-review': 'Transfer review', 'ticket-hygiene': 'Ticket hygiene', 'expert-gapfix': 'Expert gap fixes', 'expert-ticket': 'Expert ticket reading', 'ticket-audits': 'Ticket audits',
    assessments: 'Assessments', 'bonus-ai': 'Bonus AI', appraisal: 'Appraisals', server: 'Other (server)', other: 'Other',
  };
  const label = (f) => { const base = String(f).replace(/ \(check\)$/, ''); const l = LABEL[base] || base.replace(/[-:]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()); return / \(check\)$/.test(f) ? l + ' (quality check)' : l; };
  const modelName = (m) => /haiku/i.test(m) ? 'Claude Haiku' : /sonnet/i.test(m) ? 'Claude Sonnet' : /opus/i.test(m) ? 'Claude Opus' : /4\.1-mini/.test(m) ? 'OpenAI mini' : /nano/.test(m) ? 'OpenAI nano' : m;
  const ctDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
  const ctTime = (utc) => { const d = new Date(String(utc || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  async function getJ(u, opt) { const r = await fetch(u, Object.assign({ credentials: 'same-origin' }, opt || {})); const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || 'Could not load (' + r.status + ')'); return j; }

  function kpis(u) {
    const today = ctDay(new Date()), wk = ctDay(new Date(Date.now() - 6 * 864e5)), mon = today.slice(0, 7);
    let t = 0, w = 0, m = 0;
    Object.entries(u.days || {}).forEach(([d, c]) => { if (d === today) t += c; if (d >= wk) w += c; if (d.slice(0, 7) === mon) m += c; });
    const p = u.byProvider || {};
    return `<div class="aiu-kpis">
      <div class="aiu-kpi"><div class="aiu-kpi-l">Today</div><div class="aiu-kpi-v">${money(t)}</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-l">Last 7 days</div><div class="aiu-kpi-v">${money(w)}</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-l">This month</div><div class="aiu-kpi-v">${money(m)}</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-l">Claude / OpenAI (31 days)</div><div class="aiu-kpi-v aiu-kpi-sm">${money(p.claude)} <span class="aiu-mute">/</span> ${money(p.openai)}</div></div>
    </div>`;
  }
  function chart(u, range) {
    const days = []; for (let i = range - 1; i >= 0; i--) days.push(ctDay(new Date(Date.now() - i * 864e5)));
    const vals = days.map((d) => Number((u.days || {})[d]) || 0), max = Math.max(0.01, ...vals);
    const bars = days.map((d, i) => { const v = vals[i], h = v ? Math.max(3, Math.round(100 * v / max)) : 0;
      const lab = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="aiu-bar-col" tabindex="0" aria-label="${esc(lab)}: ${money(v)}"><div class="aiu-tip">${esc(lab)}<b>${money(v)}</b></div><div class="aiu-bar" style="height:${h}%"></div><div class="aiu-bar-x">${(range - 1 - i) % Math.ceil(range / 7) === 0 ? esc(lab) : ''}</div></div>`; }).join('');
    return `<div class="aiu-chart" role="img" aria-label="Estimated AI cost per day, last ${range} days"><div class="aiu-chart-y"><span>${money(max)}</span><span>$0</span></div><div class="aiu-bars">${bars}</div></div>`;
  }
  function featureTable(u) {
    const rows = (u.features || []).filter((f) => f.calls);
    if (!rows.length) return '<p class="aiu-empty">No AI calls recorded in this period yet.</p>';
    const total = rows.reduce((s, f) => s + f.cost, 0) || 1;
    return `<div class="aiu-tbl-wrap"><table class="aiu-tbl"><thead><tr><th>Feature</th><th>Model</th><th class="r">Calls</th><th class="r">Tokens in / out</th><th class="r">From cache</th><th class="r">Est. cost</th><th class="r">Share</th></tr></thead><tbody>${rows.map((f) => `
      <tr><td>${esc(label(f.feature))}</td><td>${esc(Object.keys(f.models || {}).map(modelName).filter((v, i, a) => a.indexOf(v) === i).join(', '))}</td><td class="r">${num(f.calls)}</td>
      <td class="r">${tok(f.input + f.cache_read + f.cache_write)} / ${tok(f.output)}</td><td class="r">${f.cacheShare ? f.cacheShare + '%' : '-'}</td><td class="r"><b>${money(f.cost)}</b></td>
      <td class="r"><span class="aiu-share"><span style="width:${Math.round(100 * f.cost / total)}%"></span></span>${Math.round(100 * f.cost / total)}%</td></tr>`).join('')}</tbody></table></div>`;
  }
  function lightCard(u) {
    const light = u.light || {}, sh = u.shadow || {};
    const rows = (light.features || []).map((f) => { const s = sh[f] || {}; const ok = s.light !== false;
      return `<tr><td>${esc(label(f))}</td><td class="r">${s.samples || 0}</td><td class="r">${s.agree == null ? 'Not enough checks yet' : s.agree + '%'}</td><td><span class="aiu-pill ${ok ? 'ok' : 'warn'}">${ok ? 'On cheaper model' : 'Back on Sonnet'}</span></td></tr>`; }).join('');
    return `<div class="stg-card"><div class="stg-card-title">Cheaper model quality check</div>
      <div class="stg-card-sub">These background jobs run on ${light.provider === 'openai' ? 'OpenAI mini' : 'Claude Haiku'}. 1 in 20 answers is also asked of Claude Sonnet and compared. Below 85% agreement, the job goes back to Sonnet by itself.</div>
      <div class="aiu-tbl-wrap"><table class="aiu-tbl"><thead><tr><th>Job</th><th class="r">Checks</th><th class="r">Agreement</th><th>Now</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function draftsCard(d) {
    const jobs = d.jobs || [];
    const done = jobs.filter((j) => j.status === 'done'), failed = jobs.filter((j) => j.status === 'failed');
    const avg = done.length ? Math.round(done.reduce((s, j) => s + (Number(j.ms) || 0), 0) / done.length / 1000) : null;
    const today = ctDay(new Date()), nToday = jobs.filter((j) => ctDay(new Date(String(j.created_at).replace(' ', 'T') + 'Z')) === today).length;
    const state = !d.enabled ? '<span class="aiu-pill warn">Off: EXPERT_DESK_KEY is not set on Railway</span>' : '<span class="aiu-pill ok">On</span>' + (d.canSave ? ' <span class="aiu-pill ok">Can save drafts itself</span>' : ' <span class="aiu-pill">Text mode only (no Desk write token)</span>');
    const st = (s) => s === 'done' ? '<span class="aiu-pill ok">Done</span>' : s === 'failed' ? '<span class="aiu-pill bad">Failed</span>' : '<span class="aiu-pill">' + esc(s === 'working' ? 'Writing' : 'Waiting') + '</span>';
    return `<div class="stg-card"><div class="stg-card-title">Zoho Desk drafts by Adit Expert</div>
      <div class="stg-card-sub">Drafts the Desk automation asks for. Expert never sends: the agent reviews, edits and sends. ${state}</div>
      <div class="aiu-kpis aiu-kpis-sm"><div class="aiu-kpi"><div class="aiu-kpi-l">Today</div><div class="aiu-kpi-v">${num(nToday)}</div></div>
        <div class="aiu-kpi"><div class="aiu-kpi-l">Done (last ${jobs.length})</div><div class="aiu-kpi-v">${num(done.length)}</div></div>
        <div class="aiu-kpi"><div class="aiu-kpi-l">Failed</div><div class="aiu-kpi-v">${num(failed.length)}</div></div>
        <div class="aiu-kpi"><div class="aiu-kpi-l">Average time</div><div class="aiu-kpi-v">${avg == null ? '-' : avg + 's'}</div></div></div>
      ${jobs.length ? `<div class="aiu-tbl-wrap"><table class="aiu-tbl"><thead><tr><th>When (CT)</th><th>Ticket</th><th>Mode</th><th>Status</th><th class="r">Time</th><th>Problem</th></tr></thead><tbody>${jobs.map((j) => `
        <tr><td>${esc(ctTime(j.created_at))}</td><td>#${esc(j.number)}</td><td>${j.mode === 'save' ? 'Full review, saved by tool' : 'Quick, saved by Desk'}</td><td>${st(j.status)}</td><td class="r">${j.ms ? Math.round(j.ms / 1000) + 's' : '-'}</td><td class="aiu-err">${esc(j.error || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="aiu-empty">No drafts yet.</p>'}</div>`;
  }
  function sheetCard(s) {
    const url = s.sheetId ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(s.sheetId) + '/edit' : '';
    return `<div class="stg-card"><div class="stg-card-title">Expert search log (Google Sheet)</div>
      <div class="stg-card-sub">Every Expert question is copied to the sheet every 10 minutes, about 20 minutes after it is asked (so the agent's rating is in).</div>
      <div class="aiu-sheet">
        <div><div class="aiu-kpi-l">Sheet</div><div>${url ? `<a href="${url}" target="_blank" rel="noopener">Adit Expert Search Log</a> (tab "${esc(s.tab)}")` : 'Not set'}</div></div>
        <div><div class="aiu-kpi-l">Last copied</div><div>${s.syncedAt ? esc(new Date(s.syncedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' CT' : 'Not yet'}</div></div>
        <div><div class="aiu-kpi-l">Questions copied / waiting</div><div>${num(s.lastId)} / ${num(s.waiting)}</div></div>
        <button type="button" class="stg-btn stg-btn-ghost aiu-sync">Copy now</button>
      </div>
      ${s.error ? `<div class="aiu-alert" role="alert">${esc(s.error)}</div>` : ''}</div>`;
  }

  async function render(root) {
    const range = Number(store.get('range', 14)) || 14;
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading AI usage...</div>';
    let u, d, s;
    try { [u, d, s] = await Promise.all([getJ('/api/admin/ai-usage?days=31'), getJ('/api/admin/expert-drafts?limit=50').catch((e) => ({ error: e.message, jobs: [] })), getJ('/api/admin/expert-sheet').catch((e) => ({ error: e.message }))]); }
    catch (e) { root.innerHTML = `<div class="stg-error">Could not load AI usage: ${esc(e.message)}</div>`; return; }
    root.innerHTML = `
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">AI cost</div>
          <div class="stg-card-sub">Estimated from list prices and the tokens each call used (the provider's bill is the final number). Recorded since Nov 12, 2026. Background AI jobs run weekdays 7 AM to 7 PM CT${u.workHours ? ' (running now)' : ' (paused now)'}.</div></div>
          <div class="aiu-seg" role="radiogroup" aria-label="Chart range">${[7, 14, 31].map((n) => `<button type="button" role="radio" aria-checked="${n === range}" data-range="${n}">${n === 31 ? '31 days' : n + ' days'}</button>`).join('')}</div></div>
        ${kpis(u)}
        ${chart(u, range)}
      </div>
      <div class="stg-card"><div class="stg-card-title">Cost by feature (last 31 days)</div>
        <div class="stg-card-sub">Most expensive first. "From cache" is the share of input read from the prompt cache, at a tenth of the price.</div>
        ${featureTable(u)}</div>
      ${lightCard(u)}
      ${draftsCard(d)}
      ${sheetCard(s)}`;
    root.querySelectorAll('.aiu-seg button').forEach((b) => b.addEventListener('click', () => { store.set('range', b.dataset.range); render(root); }));
    const sb = root.querySelector('.aiu-sync');
    if (sb) sb.addEventListener('click', async () => { sb.disabled = true; sb.textContent = 'Copying...'; try { await getJ('/api/admin/expert-sheet/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { /* shown after reload */ } render(root); });
  }
  window.renderAiUsageAdmin = render;
})();
