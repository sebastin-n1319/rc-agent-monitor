/* Batch 335: Settings > Expert library. The maintained topic pages Expert reads first, how often they are used, the
   lookups they saved, the answers the team confirmed, the weekly health check and the change log. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  const day = (t) => t ? new Date(String(t).replace(' ', 'T') + (String(t).includes('Z') ? '' : 'Z')).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  async function api(u, o) { const r = await fetch(u, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, o || {})); const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || 'Request failed'); return j; }
  const KIND = { ingest: 'New page', update: 'Updated', fileback: 'Confirmed answer added', lint: 'Health check', discover: 'New topics', skip: 'Skipped', error: 'Error' };

  window.renderExpertLibraryAdmin = async function (root) {
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading the Expert library…</div>';
    let d;
    try { d = await api('/api/admin/expert-library'); } catch (e) { root.innerHTML = `<div class="stg-error">Could not load the Expert library: ${esc(e.message)}</div>`; return; }
    const C = window.StgCharts, T = d.totals || {};
    const kpi = (l, v, s) => C ? C.kpi(l, v, s) : `<div><b>${v}</b> ${esc(l)}</div>`;
    root.innerHTML = `
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">Expert library</div>
          <div class="stg-card-sub">Short pages Expert keeps up to date, one per common T1 topic, built from the Help Center, guides, team rules, product updates and solved cases. Expert reads the matching page first. On a routine how-to it skips the wider searches, which makes answers faster and cheaper. Answers agents mark helpful and drafts sent as written are added to the page. A health check runs every week.</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="stg-btn stg-btn-ghost elib-lint">Run health check</button><button type="button" class="stg-btn elib-run">Update pages now</button></div></div>
        ${d.enabled ? '' : '<p class="stg-card-sub"><b>Off:</b> EXPERT_LIBRARY is set to off on Railway.</p>'}
      </div>
      <div class="sc-grid sc-g5" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:14px 0">
        ${kpi('Pages ready', num(T.ready), num(T.pages) + ' topics')}${kpi('Times used', num(T.hits), 'answers that read a page')}${kpi('Lookups saved', num(T.saved), 'wider searches skipped')}${kpi('Confirmed answers', num(T.confirmed), 'from agents')}${kpi('Open questions', num(T.issues), 'from the health check')}
      </div>
      <div class="stg-card"><div class="stg-card-title">Pages</div>
        ${d.pages.length ? `<table class="stg-table elib-table" style="width:100%"><thead><tr><th>Topic</th><th>Module</th><th>Version</th><th>Used</th><th>Saved</th><th>Confirmed</th><th>Open questions</th><th>Updated</th></tr></thead><tbody>
          ${d.pages.map((p) => `<tr class="elib-row" tabindex="0" data-slug="${esc(p.slug)}" aria-expanded="false" style="cursor:pointer"><td><b>${esc(p.title)}</b>${p.summary ? `<div class="stg-card-sub">${esc(p.summary)}</div>` : ''}${p.ready ? '' : '<div class="stg-card-sub">Waiting for its first build</div>'}</td><td>${esc(p.module || '')}</td><td>${p.version || 0}</td><td>${num(p.hits)}</td><td>${num(p.saved)}</td><td>${num(p.confirmed)}</td><td>${p.issues.length ? `<span style="color:#C3640A;font-weight:600">${p.issues.length}</span>` : '0'}</td><td>${esc(day(p.built))}</td></tr>`).join('')}
        </tbody></table>` : '<p class="stg-card-sub">No pages yet. The first build runs about 10 minutes after the server starts, or press Update pages now.</p>'}
      </div>
      <div class="stg-card"><div class="stg-card-title">What changed</div>
        ${(d.log || []).length ? `<ul style="list-style:none;padding:0;margin:0">${d.log.map((l) => `<li style="padding:6px 0;border-bottom:1px solid var(--stg-line,#eee)"><b>${esc(KIND[l.kind] || l.kind)}</b>${l.slug ? ' · ' + esc(l.slug.replace(/-/g, ' ')) : ''} <span class="stg-card-sub">${esc(day(l.at))}</span><div class="stg-card-sub">${esc(l.detail)}</div></li>`).join('')}</ul>` : '<p class="stg-card-sub">Nothing yet.</p>'}
      </div>`;
    const busy = (b, t) => { b.disabled = true; b.dataset.t = b.textContent; b.textContent = t; };
    root.querySelector('.elib-run').addEventListener('click', async (e) => { busy(e.target, 'Updating…'); try { await api('/api/admin/expert-library/run', { method: 'POST', body: '{}' }); e.target.textContent = 'Started, refresh in a few minutes'; } catch (er) { e.target.textContent = er.message; } });
    root.querySelector('.elib-lint').addEventListener('click', async (e) => { busy(e.target, 'Checking…'); try { await api('/api/admin/expert-library/run', { method: 'POST', body: JSON.stringify({ lint: true }) }); e.target.textContent = 'Started, refresh in a few minutes'; } catch (er) { e.target.textContent = er.message; } });
    root.querySelectorAll('.elib-row').forEach((tr) => {
      const open = async () => {
        const nx = tr.nextElementSibling;
        if (nx && nx.classList.contains('elib-detail')) { nx.remove(); tr.setAttribute('aria-expanded', 'false'); return; }
        tr.setAttribute('aria-expanded', 'true');
        const row = document.createElement('tr'); row.className = 'elib-detail'; row.innerHTML = '<td colspan="8"><div class="stg-loading"><div class="stg-spinner"></div>Loading…</div></td>'; tr.after(row);
        try {
          const p = (await api('/api/admin/expert-library/page/' + encodeURIComponent(tr.dataset.slug))).page;
          row.firstElementChild.innerHTML = `<div style="padding:10px 4px">
            ${p.issues.length ? `<div style="background:#FFF4E8;border-radius:10px;padding:10px 12px;margin-bottom:10px"><b>Open questions</b><ul>${p.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            <pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(p.body || 'Not built yet.')}</pre>
            ${p.confirmed.length ? `<div style="margin-top:10px"><b>Confirmed answers</b><ul>${p.confirmed.slice(-5).map((c) => `<li>${esc(c.q)} <span class="stg-card-sub">(${esc(c.via)}, ${esc(c.at)})</span></li>`).join('')}</ul></div>` : ''}
            ${p.sources.length ? `<div style="margin-top:10px"><b>Built from</b><ul>${p.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ul></div>` : ''}
            <div style="margin-top:10px;display:flex;gap:8px"><button type="button" class="stg-btn stg-btn-ghost elib-one" data-act="build">Rebuild this page</button><button type="button" class="stg-btn stg-btn-ghost elib-one" data-act="lint">Check this page</button></div></div>`;
          row.querySelectorAll('.elib-one').forEach((b) => b.addEventListener('click', async () => { busy(b, b.dataset.act === 'lint' ? 'Checking…' : 'Rebuilding…'); try { await api('/api/admin/expert-library/run', { method: 'POST', body: JSON.stringify({ slug: tr.dataset.slug, lint: b.dataset.act === 'lint' }) }); window.renderExpertLibraryAdmin(root); } catch (er) { b.textContent = er.message; } }));
        } catch (er) { row.firstElementChild.innerHTML = `<div class="stg-error">${esc(er.message)}</div>`; }
      };
      tr.addEventListener('click', open); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
    });
  };
})();
