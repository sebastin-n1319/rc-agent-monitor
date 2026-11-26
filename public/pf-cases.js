/* Batch 421: Patient forms, watch only. Labelling page for SPOCs and admins (Review > Patient forms).
   Nothing here changes Desk or Asana: it shows what the detector would do, and a lead labels each case. */
(function () {
  'use strict';
  var TYPES = ['New Form', 'Edit Existing Form', 'Spanish Version', 'Copy to Location', 'Mapping/Import'];
  var S = { view: 'tolabel', q: '', offset: 0, root: null };
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function api(url, opt) {
    return fetch(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opt || {})).then(function (r) { return r.json().catch(function () { return { success: false, error: 'Bad response' }; }); })
      .then(function (j) { if (!j || !j.success) throw new Error((j && j.error) || 'Request failed'); return j; });
  }
  function toast(m) { if (window.showToast) window.showToast(m); else if (window.toast) window.toast(m); }
  function deskUrl(r) { return 'https://help.adit.com/agent/aditadvertising/support/tickets/details/' + encodeURIComponent(r.ticket_id); }
  function fmtDate(s) { if (!s) return ''; var d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

  function mount(root) { S.root = root; root.className = 'pfc'; draw(); }
  function draw() {
    var r = S.root; r.replaceChildren(h('p', { class: 'pfc-muted', text: 'Loading patient forms...' }));
    Promise.all([api('/api/pf/stats'), api('/api/pf/cases?view=' + S.view + '&q=' + encodeURIComponent(S.q) + '&offset=' + S.offset + '&limit=40')]).then(function (x) {
      var st = x[0], list = x[1]; r.replaceChildren(head(st), kpis(st), bar(), rows(list), pager(list));
    }).catch(function (e) { r.replaceChildren(h('div', { class: 'pfc-err', text: 'Could not load: ' + e.message })); });
  }
  function head(st) {
    var rp = st.replay, admin = st.admin;
    var kids = [h('div', null, [h('h3', { text: 'Patient forms requests' }), h('p', { class: 'pfc-muted', text: 'Watch only: nothing is changed in Desk or Asana. Each case shows what would happen. Mark each one PF request or Not PF, so we can measure if detection is right 95% of the time.' })])];
    var side = h('div', { class: 'pfc-side' }, [h('span', { class: 'pfc-pill ' + (st.mode === 'off' ? 'warn' : 'ok'), text: st.mode === 'off' ? 'Off' : 'Watching new tickets' })]);
    if (rp && rp.running) side.appendChild(h('span', { class: 'pfc-pill', text: 'Replay: ' + rp.checked + ' of ' + rp.total }));
    if (admin) {
      side.appendChild(h('button', { type: 'button', class: 'pfc-btn', disabled: rp && rp.running ? true : null, text: rp && rp.done ? 'Replay again (90 days)' : 'Replay last 90 days', onclick: function (e) { e.target.disabled = true; api('/api/pf/replay', { method: 'POST', body: JSON.stringify({ days: 90 }) }).then(function () { toast('Replay started. It takes a few minutes.'); setTimeout(draw, 4000); }).catch(function (x) { toast(x.message); e.target.disabled = false; }); } }));
      side.appendChild(h('button', { type: 'button', class: 'pfc-btn ghost', text: st.mode === 'off' ? 'Turn watching on' : 'Turn off', onclick: function () { api('/api/pf/mode', { method: 'POST', body: JSON.stringify({ mode: st.mode === 'off' ? 'watch' : 'off' }) }).then(draw).catch(function (x) { toast(x.message); }); } }));
    }
    if (rp && rp.running) setTimeout(function () { if (document.body.contains(S.root)) draw(); }, 8000);
    kids.push(side);
    return h('div', { class: 'pfc-head' }, kids);
  }
  function kpi(label, val, sub, cls) { return h('div', { class: 'pfc-kpi ' + (cls || '') }, [h('b', { text: val }), h('span', { text: label }), sub ? h('small', { text: sub }) : null]); }
  function kpis(st) {
    var s = st.suggest, p = s.precision == null ? 'No labels' : s.precision + '%';
    return h('div', { class: 'pfc-kpis' }, [
      kpi('Detector is right', p, s.labelled + ' of ' + s.n + ' "would suggest" cases labelled', st.gate ? 'good' : s.precision != null && s.precision < 95 ? 'bad' : ''),
      kpi('PF requests it finds', st.recall == null ? 'No labels' : st.recall + '%', st.missed + ' labelled PF requests it would miss'),
      kpi('Keywords alone', st.keywordsOnly.precision == null ? 'No labels' : st.keywordsOnly.precision + '%', 'right, on ' + st.keywordsOnly.labelled + ' labelled'),
      kpi('Request type right', st.typeAccuracy == null ? 'No labels' : st.typeAccuracy + '%', 'on confirmed cases'),
      h('div', { class: 'pfc-gate ' + (st.gate ? 'good' : '') }, [h('b', { text: st.gate ? 'Ready for the next step' : 'Not ready yet' }), h('span', { text: st.gateNote })]),
    ]);
  }
  function bar() {
    var views = [['tolabel', 'To label'], ['suggest', 'Would suggest'], ['disagree', 'Detector was wrong'], ['labelled', 'Labelled'], ['skipped', 'Skipped'], ['all', 'All']];
    var q = h('input', { class: 'pfc-q', type: 'search', placeholder: 'Ticket # or subject', 'aria-label': 'Search cases', value: S.q });
    q.addEventListener('change', function () { S.q = q.value.trim(); S.offset = 0; draw(); });
    return h('div', { class: 'pfc-bar' }, views.map(function (v) { return h('button', { type: 'button', class: 'pfc-tab' + (S.view === v[0] ? ' on' : ''), 'aria-pressed': String(S.view === v[0]), text: v[1], onclick: function () { S.view = v[0]; S.offset = 0; draw(); } }); }).concat([q]));
  }
  function rows(list) {
    if (!list.rows.length) return h('div', { class: 'pfc-empty', text: S.view === 'tolabel' ? 'Nothing to label right now. New cases appear as tickets come in, or run the replay.' : 'No cases here.' });
    return h('div', { class: 'pfc-list' }, list.rows.map(card));
  }
  function card(r) {
    var type = r.ai_type || r.kw_type || '';
    var sel = h('select', { class: 'pfc-sel', 'aria-label': 'Request type' }, [h('option', { value: '', text: 'Type' })].concat(TYPES.map(function (t) { return h('option', { value: t, text: t }); })));
    sel.value = r.label_type || type || '';
    function save(l) { api('/api/pf/cases/' + r.ticket_id + '/label', { method: 'POST', body: JSON.stringify({ label: l, type: sel.value }) }).then(function () { toast(l === 'pf' ? 'Marked PF request' : l === 'not_pf' ? 'Marked not PF' : 'Label cleared'); draw(); }).catch(function (e) { toast(e.message); }); }
    var verdict = r.would === 'suggest' ? h('span', { class: 'pfc-pill ok', text: 'Would suggest: ' + type }) : r.skip ? h('span', { class: 'pfc-pill', text: 'Skipped: ' + r.skip }) : h('span', { class: 'pfc-pill', text: 'Would do nothing' });
    var why = [r.kw_hit ? 'Keywords: yes' : 'Keywords: no', r.ai_pf == null ? (r.ai_error ? 'AI: error' : 'AI: not run') : 'AI: ' + (r.ai_pf ? 'yes' : 'no') + (r.ai_conf != null ? ' (' + Math.round(r.ai_conf * 100) + '%)' : ''), r.asana_hint === 1 ? 'Had a PF Asana task' : null].filter(Boolean).join(' · ');
    return h('article', { class: 'pfc-card' + (r.label ? ' done ' + r.label : '') }, [
      h('div', { class: 'pfc-top' }, [h('a', { href: deskUrl(r), target: '_blank', rel: 'noopener', class: 'pfc-num', text: '#' + r.number }), h('b', { class: 'pfc-subj', text: r.subject || '(no subject)' }), verdict]),
      h('div', { class: 'pfc-meta', text: [fmtDate(r.created_time), r.owner, r.source === 'replay' ? 'from the replay' : 'live'].filter(Boolean).join(' · ') }),
      r.snippet ? h('p', { class: 'pfc-snip', text: r.snippet }) : null,
      h('div', { class: 'pfc-why', text: why + (r.ai_reason ? ' · ' + r.ai_reason : '') }),
      h('div', { class: 'pfc-act' }, [sel,
        h('button', { type: 'button', class: 'pfc-btn' + (r.label === 'pf' ? ' on' : ''), text: 'PF request', onclick: function () { save('pf'); } }),
        h('button', { type: 'button', class: 'pfc-btn ghost' + (r.label === 'not_pf' ? ' on' : ''), text: 'Not PF', onclick: function () { save('not_pf'); } }),
        r.label ? h('button', { type: 'button', class: 'pfc-link', text: 'Clear', onclick: function () { save(''); } }) : null,
        r.label ? h('span', { class: 'pfc-muted', text: 'Labelled by ' + String(r.labelled_by || '').split('@')[0] }) : null]),
    ]);
  }
  function pager(list) {
    if (list.total <= 40) return null;
    return h('div', { class: 'pfc-pager' }, [
      h('button', { type: 'button', class: 'pfc-btn ghost', disabled: S.offset ? null : true, text: 'Previous', onclick: function () { S.offset = Math.max(0, S.offset - 40); draw(); } }),
      h('span', { class: 'pfc-muted', text: (S.offset + 1) + ' to ' + Math.min(S.offset + 40, list.total) + ' of ' + list.total }),
      h('button', { type: 'button', class: 'pfc-btn ghost', disabled: S.offset + 40 < list.total ? null : true, text: 'Next', onclick: function () { S.offset += 40; draw(); } })]);
  }
  var css = document.createElement('style');
  css.textContent = '.pfc{display:grid;gap:14px}.pfc-head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.pfc-head h3{margin:0 0 4px;font-size:18px}.pfc-side{display:flex;gap:8px;align-items:center;flex-wrap:wrap}'
    + '.pfc-muted{color:var(--text3,var(--t3,#8a94a6));font-size:12.5px;margin:0}.pfc-err{color:#d33}.pfc-empty{padding:28px;text-align:center;color:var(--text3,#8a94a6)}'
    + '.pfc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.pfc-kpi,.pfc-gate{border:1px solid var(--border,#d6dce6);border-radius:12px;padding:12px 14px;display:grid;gap:2px}.pfc-kpi b{font-size:24px;font-variant-numeric:tabular-nums}.pfc-kpi span{font-size:12.5px}.pfc-kpi small,.pfc-gate span{font-size:11.5px;color:var(--text3,#8a94a6)}'
    + '.pfc-kpi.good b,.pfc-gate.good b{color:#13a274}.pfc-kpi.bad b{color:#d33}.pfc-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.pfc-tab{font:inherit;font-size:12.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--border,#d6dce6);background:transparent;color:inherit;cursor:pointer}.pfc-tab.on{background:var(--accent,#ff823c);border-color:transparent;color:#fff}'
    + '.pfc-q{margin-left:auto;font:inherit;font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid var(--border,#d6dce6);background:transparent;color:inherit;min-width:0;width:220px;max-width:100%}'
    + '.pfc-list{display:grid;gap:10px}.pfc-card{border:1px solid var(--border,#d6dce6);border-radius:12px;padding:12px 14px;display:grid;gap:6px}.pfc-card.done{opacity:.75}.pfc-card.done.pf{border-left:4px solid #13a274}.pfc-card.done.not_pf{border-left:4px solid #8a94a6}'
    + '.pfc-top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.pfc-num{font-weight:700;color:var(--accent,#ff823c);text-decoration:none}.pfc-subj{flex:1;min-width:200px}.pfc-meta,.pfc-why{font-size:12px;color:var(--text3,#8a94a6)}.pfc-snip{margin:0;font-size:13px;line-height:1.5;max-height:6.2em;overflow:auto}'
    + '.pfc-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pfc-sel{font:inherit;font-size:12.5px;padding:5px 8px;border-radius:8px;border:1px solid var(--border,#d6dce6);background:transparent;color:inherit}'
    + '.pfc-btn{font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid transparent;background:var(--accent,#ff823c);color:#fff;cursor:pointer}.pfc-btn.ghost{background:transparent;color:inherit;border-color:var(--border,#d6dce6)}.pfc-btn.on{box-shadow:0 0 0 3px rgba(255,130,60,.35)}.pfc-btn[disabled]{opacity:.5;cursor:default}'
    + '.pfc-link{font:inherit;font-size:12px;background:none;border:0;color:var(--accent,#ff823c);cursor:pointer;text-decoration:underline}.pfc-pill{font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(127,127,127,.14)}.pfc-pill.ok{background:rgba(43,222,164,.16);color:#13a274}.pfc-pill.warn{background:rgba(251,191,36,.2);color:#b77900}'
    + '.pfc-pager{display:flex;gap:10px;align-items:center;justify-content:center}.pfc button:focus-visible,.pfc a:focus-visible,.pfc input:focus-visible,.pfc select:focus-visible{outline:2px solid var(--accent,#ff823c);outline-offset:2px}';
  document.head.appendChild(css);
  window.PFCases = { mount: mount };
})();
