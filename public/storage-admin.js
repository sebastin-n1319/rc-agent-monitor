/* Batch 342: Settings > Storage. How full the Railway volume is against the 50 to 60% band, the biggest tables, the
   ticket-read cache, the archive Google Sheet (in your Drive) and the daily budget for background AI jobs. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(u, o) { const r = await fetch(u, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, o || {})); const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || 'Request failed'); return j; }
  const day = (t) => t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  window.renderStorageAdmin = async function (root) {
    root.innerHTML = '<div class="stg-loading"><div class="stg-spinner"></div>Loading storage…</div>';
    let d; try { d = await api('/api/admin/storage'); } catch (e) { root.innerHTML = `<div class="stg-error">Could not load storage: ${esc(e.message)}</div>`; return; }
    const v = d.volume || {}, b = d.band || { low: 50, high: 60 }, B = d.budget || {};
    const state = v.pct <= b.high ? ['In the band', '#1F7A4D'] : v.livePct <= b.high ? ['Data is in the band; the file shrinks at the next compaction', '#C3640A'] : ['Above the band', '#B42318'];
    const bar = (pct, color) => `<div style="height:10px;border-radius:6px;background:var(--stg-line,#eee);overflow:hidden" role="img" aria-label="${pct}% used"><div style="width:${Math.min(100, pct)}%;height:100%;background:${color}"></div></div>`;
    const sheetUrl = d.archive && d.archive.sheetId ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(d.archive.sheetId) : '';
    root.innerHTML = `
      <div class="stg-card">
        <div class="aiu-head"><div><div class="stg-card-title">Storage</div>
          <div class="stg-card-sub">Keeps the Railway volume between ${b.low}% and ${b.high}%. Every 2 hours the ticket-read cache is trimmed and unused search vectors are emptied; above ${b.high}% older logs are copied to the archive sheet in your Drive first, then removed here. Deleted rows are reused at once; the file shrinks at a compaction, which runs outside work hours when there is room for it.</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="stg-btn stg-btn-ghost sto-compact">Compact now</button><button type="button" class="stg-btn sto-run">Free space now</button></div></div>
        <div style="margin:12px 0 6px"><b>${v.pct}% of the volume used</b> (${v.usedMB} of ${v.totalMB} MB) · <span style="color:${state[1]};font-weight:600">${esc(state[0])}</span></div>
        ${bar(v.pct, v.pct > b.high ? '#C3640A' : '#1F7A4D')}
        <div class="stg-card-sub" style="margin-top:6px">Live data ${v.livePct}% · ${v.reclaimMB} MB free inside the database (reused before the file grows) · ${v.freeMB} MB free on the volume</div>
        <div class="stg-card-sub sto-msg" role="status" style="margin-top:6px"></div>
      </div>
      <div class="stg-card"><div class="stg-card-title">Biggest tables</div>
        <table class="stg-table" style="width:100%"><thead><tr><th>Table</th><th>Size</th></tr></thead><tbody>${(d.biggest || []).map((t) => `<tr><td>${esc(t.name)}</td><td>${t.mb} MB</td></tr>`).join('')}</tbody></table>
        <div class="stg-card-sub" style="margin-top:6px">Ticket-read cache: ${(d.cache.mb || 0).toFixed(1)} MB in ${d.cache.rows} items, held under ${d.cacheCapMB} MB.${d.last && d.last.at ? ' Last guard pass ' + esc(day(d.last.at)) + '.' : ''}</div>
      </div>
      <div class="stg-card"><div class="stg-card-title">Archive sheet (your Drive)</div>
        <div class="stg-card-sub">Older presence, break, call and sign-in logs, Expert questions older than 90 days that nobody marked helpful (helpful ones stay, Expert learns from them), and a daily copy of the AI cost per feature are kept in this Google Sheet. Share the sheet with <b>${esc((d.archive && d.archive.serviceEmail) || 'the tool\'s Google service account')}</b> as Editor, then paste its link here.</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><label class="stg-card-sub" for="sto-sheet" style="align-self:center">Sheet link or ID</label><input id="sto-sheet" type="text" style="flex:1;min-width:240px" value="${esc((d.archive && d.archive.sheetId) || '')}"><button type="button" class="stg-btn sto-sheet-save">Save</button></div>
        ${sheetUrl ? `<div class="stg-card-sub" style="margin-top:6px"><a href="${sheetUrl}" target="_blank" rel="noopener">Open the archive sheet</a> · <button type="button" class="stg-btn stg-btn-ghost sto-archive">Copy logs to the sheet now</button></div>` : ''}
      </div>
      <div class="stg-card"><div class="stg-card-title">AI budget for background jobs</div>
        <div class="stg-card-sub">Open ticket review, library upkeep, escalation watch, call QA and the light sorting jobs pause for the rest of the day (CT) once they spend this much. Anything a person waits on (Expert answers, drafts, live chat) never pauses. Set AI_BACKGROUND_BUDGET_USD on Railway to change it (0 turns it off).</div>
        <div style="margin-top:8px"><b>$${(B.spentUSD || 0).toFixed(2)} of $${B.budgetUSD || 0}</b> spent today</div>
        ${B.budgetUSD ? bar(Math.round((B.spentUSD || 0) / B.budgetUSD * 100), (B.spentUSD || 0) >= B.budgetUSD ? '#B42318' : '#1F7A4D') : ''}
      </div>`;
    const msg = root.querySelector('.sto-msg');
    const act = async (btn, body, label) => { btn.disabled = true; msg.textContent = label; try { const r = await api('/api/admin/storage/run', { method: 'POST', body: JSON.stringify(body) }); const x = r.result || {}; msg.textContent = x.note || x.skipped ? 'Not run: ' + (x.note || x.skipped) : 'Done.'; setTimeout(() => window.renderStorageAdmin(root), 1500); } catch (e) { msg.textContent = e.message; btn.disabled = false; } };
    root.querySelector('.sto-run').addEventListener('click', (e) => act(e.target, {}, 'Freeing space…'));
    root.querySelector('.sto-compact').addEventListener('click', (e) => act(e.target, { compact: true }, 'Compacting… the app may pause for a minute'));
    const ar = root.querySelector('.sto-archive'); if (ar) ar.addEventListener('click', (e) => act(e.target, { archive: true }, 'Copying logs to the sheet…'));
    root.querySelector('.sto-sheet-save').addEventListener('click', async (e) => { e.target.disabled = true; try { await api('/api/admin/storage/sheet', { method: 'POST', body: JSON.stringify({ sheet: root.querySelector('#sto-sheet').value }) }); window.renderStorageAdmin(root); } catch (er) { msg.textContent = er.message; e.target.disabled = false; } });
  };
})();
