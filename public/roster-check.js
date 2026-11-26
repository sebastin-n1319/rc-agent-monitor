/* Batch 420: T1 roster check. Compares the T1 roster Google Sheet with Manage Agents (monitored agents) and tool access,
   and lists mismatches. Read only: it never changes the sheet, the agent list or anyone's access. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GROUPS = [
    ['inactiveMonitored', 'Inactive on the sheet, still in Manage Agents', 'Remove them in Manage Agents with the X next to their name.', 'bad'],
    ['inactiveWithAccess', 'Inactive on the sheet, still have tool access', 'Remove their access in Access Control if they have left.', 'bad'],
    ['activeNotMonitored', 'Active on the sheet, not in Manage Agents', 'Add them in Manage Agents so the monitor tracks them.', 'warn'],
    ['monitoredNotOnSheet', 'In Manage Agents, not on the sheet', 'Add a row on the sheet (with their Desk agent ID in column B), or remove them here if they left. Expert treats them as T1 but gives no drafts.', 'warn'],
  ];
  async function render(el, { cls = 'card' } = {}) {
    if (!el) return;
    el.innerHTML = `<div class="${cls} rck"><div class="rck-h"><b>T1 roster check</b><span class="rck-sub">Loading…</span></div></div>`;
    let j;
    try { const r = await fetch((window.BACKEND || '') + '/api/admin/t1-roster/check', { credentials: 'include' }); j = await r.json(); if (!r.ok || !j.success) throw new Error(j.error || ('HTTP ' + r.status)); }
    catch (e) { el.innerHTML = `<div class="${cls} rck"><div class="rck-h"><b>T1 roster check</b><span class="rck-sub">Could not load: ${esc(e.message)}</span></div></div>`; return; }
    const head = !j.ok
      ? `<span class="rck-pill bad">Sheet not readable</span><span class="rck-sub">${esc(j.error || '')}. Share the T1 roster sheet with ${esc(j.serviceAccount || 'the service account')} as Viewer.</span>`
      : j.issues ? `<span class="rck-pill warn">${j.issues} to check</span><span class="rck-sub">Sheet: ${j.sheet.active} Active of ${j.sheet.rows} rows · Manage Agents: ${j.monitored}</span>`
      : `<span class="rck-pill ok">All in line</span><span class="rck-sub">Sheet: ${j.sheet.active} Active of ${j.sheet.rows} rows · Manage Agents: ${j.monitored}</span>`;
    const body = j.ok ? GROUPS.filter((g) => (j[g[0]] || []).length).map((g) => `<div class="rck-g"><div class="rck-gt"><span class="rck-dot ${g[3]}"></span>${esc(g[1])} <span class="rck-n">${j[g[0]].length}</span></div>
      <div class="rck-names">${j[g[0]].map((p) => `<span class="rck-chip">${esc(p.name || p.email || p.deskId)}</span>`).join('')}</div><div class="rck-sub">${esc(g[2])}</div></div>`).join('') : '';
    const extra = j.ok && (j.activeNoEmail || []).length ? `<div class="rck-sub">${j.activeNoEmail.length} Active row(s) have no Adit email in column S: ${j.activeNoEmail.map((p) => esc(p.name)).join(', ')}.</div>` : '';
    el.innerHTML = `<div class="${cls} rck"><div class="rck-h"><b>T1 roster check</b>${head}<button type="button" class="rck-btn">Check again</button></div>${body}${extra}
      <div class="rck-foot">Read only. The sheet decides who is Active and who gets Expert drafts; this only shows what differs.</div></div>`;
    el.querySelector('.rck-btn').addEventListener('click', () => render(el, { cls }));
  }
  if (!document.getElementById('rck-css')) {
    const st = document.createElement('style'); st.id = 'rck-css';
    st.textContent = `.rck{display:grid;gap:10px}.rck-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.rck-h b{font-size:14px}
.rck-sub{font-size:12px;color:var(--text3,var(--t3,#8a94a6))}.rck-btn{margin-left:auto;font:inherit;font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid var(--border,#d0d7e2);background:transparent;color:inherit;cursor:pointer}
.rck-btn:hover,.rck-btn:focus-visible{background:rgba(127,127,127,.12)}
.rck-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px}.rck-pill.ok{background:rgba(43,222,164,.15);color:#13a274}.rck-pill.warn{background:rgba(251,191,36,.18);color:#b77900}.rck-pill.bad{background:rgba(248,113,113,.16);color:#d33}
.rck-g{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--border,#d0d7e2);border-radius:10px}.rck-gt{font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
.rck-n{font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.15)}.rck-dot{width:8px;height:8px;border-radius:50%}.rck-dot.bad{background:#f87171}.rck-dot.warn{background:#fbbf24}
.rck-names{display:flex;flex-wrap:wrap;gap:6px}.rck-chip{font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(127,127,127,.12)}.rck-foot{font-size:11px;color:var(--text3,var(--t3,#8a94a6))}`;
    document.head.appendChild(st);
  }
  window.renderRosterCheck = render;
})();
