/* Batch 265: Call QA (Call Logs > Call QA, admins only). The AI audits every recorded T1 call with the QA rubric. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function api(url, body) {
    return fetch(url, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return { success: false, error: 'HTTP ' + r.status }; }); })
      .catch(function () { return { success: false, error: 'Network error' }; });
  }
  function toast(msg, kind) { if (window.showToast) window.showToast(msg, kind); else if (window.toast) window.toast(msg, kind); }
  var TZ = 'America/Chicago';
  function day(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
  function when(iso) { return iso ? new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function mins(s) { s = Number(s) || 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function pc(v) { return v == null ? 'none' : v + '%'; }
  function scoreEl(v, excluded) {
    if (v == null) return h('span', { class: 'cq-muted', text: 'none' });
    return h('span', { class: 'cq-score ' + (excluded ? '' : v >= 90 ? 'good' : v >= 75 ? 'mid' : 'low'), title: excluded ? 'Not counted in the QA average (stage)' : null, text: String(v) + (excluded ? '*' : '') });
  }
  function pill(text, kind, title) { return h('span', { class: 'cq-pill ' + (kind || ''), title: title || null, text: text }); }
  function meter(v, hv) {
    return h('div', { class: 'cq-meter', title: 'AI ' + pc(v) + (hv != null ? ', human QA ' + pc(hv) : '') }, [h('span', null, [h('i', { style: 'width:' + Math.min(100, v || 0) + '%' }), hv != null ? h('i', { class: 'h', style: 'width:' + Math.min(100, hv) + '%' }) : null]), h('em', { text: pc(v) })]);
  }
  function table(head, rows, opts) {
    opts = opts || {};
    return h('div', { class: 'cq-tw' }, h('table', { class: 'cq-t' }, [h('thead', null, h('tr', null, head.map(function (c) { return h('th', { class: c[1] || null, scope: 'col', text: c[0] }); }))),
      h('tbody', null, rows.length ? rows : [h('tr', null, h('td', { colspan: String(head.length), class: 'cq-empty', text: opts.empty || 'Nothing yet' }))])]));
  }

  var PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month']];
  function rangeOf(p) {
    var now = Date.now(), t = day(now);
    if (p === 'today') return { from: t, to: t };
    if (p === 'yesterday') { var y = day(now - 864e5); return { from: y, to: y }; }
    if (p === '30') return { from: day(now - 29 * 864e5), to: t };
    if (p === 'month') return { from: t.slice(0, 8) + '01', to: t };
    return { from: day(now - 6 * 864e5), to: t };
  }

  function mount(root) {
    var S = { preset: '7', tab: 'overview', agent: '', status: '', fatal: false, q: '', data: null, calls: null, calib: null };
    root.innerHTML = '';
    var wrap = h('div', { class: 'cq' }); root.appendChild(wrap);
    function qs() { var r = rangeOf(S.preset); return 'from=' + r.from + '&to=' + r.to; }

    function head() {
      var seg = h('div', { class: 'cq-seg', role: 'group', 'aria-label': 'Date range' }, PRESETS.map(function (p) {
        return h('button', { type: 'button', 'aria-pressed': S.preset === p[0] ? 'true' : 'false', onclick: function () { S.preset = p[0]; S.calls = null; load(); }, text: p[1] });
      }));
      return h('div', { class: 'cq-head' }, [h('div', null, [h('h1', { text: 'Call QA' }), h('p', { class: 'cq-sub', text: 'Every recorded T1 CS call, audited by AI with the QA rubric: the Avoma or RingCentral transcript, the ticket from the call and Adit Expert knowledge, calibrated on a year of human QA audits. Scores stay in this tool; nothing is written to CRM.' })]),
        h('div', { class: 'cq-ctl' }, [seg, h('button', { type: 'button', class: 'cq-btn', onclick: function () { load(); }, text: 'Refresh' })])]);
    }
    function tabs() {
      return h('div', { class: 'cq-tabs', role: 'tablist' }, [['overview', 'Overview'], ['calls', 'Calls'], ['calibration', 'Calibration'], ['guide', 'What the AI learned']].map(function (t) {
        return h('button', { type: 'button', role: 'tab', 'aria-selected': S.tab === t[0] ? 'true' : 'false', onclick: function () { S.tab = t[0]; draw(); if (t[0] === 'calls' && !S.calls) loadCalls(); if ((t[0] === 'calibration' || t[0] === 'guide') && !S.calib) loadCalib(); }, text: t[1] });
      }));
    }

    function overview(d) {
      var t = d.totals, st = d.status || {}, kids = [];
      if (st.enabled === false) kids.push(h('div', { class: 'cq-note', text: 'Call QA is paused. New calls are not audited until it is resumed.' }));
      if (st.rcError) kids.push(h('div', { class: 'cq-note', text: 'RingCentral recordings could not be read: ' + st.rcError + '. Calls with an Avoma transcript are still audited.' }));
      if (st.humanError) kids.push(h('div', { class: 'cq-note', text: 'Human QA audits could not be read from CRM: ' + st.humanError }));
      var done = t.audited, all = t.calls || 0;
      kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'Audit progress' }), h('p', { text: 'Calls are found every 30 minutes and audited about 20 minutes after they end, so Avoma has posted its transcript.' })]),
        h('div', { class: 'cq-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all), 'aria-valuenow': String(done), 'aria-label': 'Calls audited' }, h('i', { style: 'width:' + (all ? Math.round(done / all * 100) : 0) + '%' })),
        h('p', { class: 'cq-small cq-muted' }, done + ' of ' + all + ' calls audited (' + t.fromAvoma + ' from Avoma, ' + t.fromRc + ' transcribed from RingCentral). ' + t.waiting + ' waiting, ' + t.skipped + ' with no recording or speech' + (t.errors ? ', ' + t.errors + ' failed' : '') + '.'),
        h('div', { class: 'cq-ctl' }, [h('button', { type: 'button', class: 'cq-btn sm', onclick: function (e) { var b = e.currentTarget; b.disabled = true; api('/api/call-qa/backfill', { days: 7 }).then(function (r) { b.disabled = false; toast(r.success ? r.added + ' older calls found, they will be audited next' : r.error, r.success ? 'success' : 'error'); load(); }); }, text: 'Find calls from the last 7 days' }),
          h('button', { type: 'button', class: 'cq-btn sm', onclick: function (e) { var b = e.currentTarget; b.disabled = true; api('/api/call-qa/enabled', { on: st.enabled === false }).then(function () { load(); }); }, text: st.enabled === false ? 'Resume Call QA' : 'Pause Call QA' })])]));
      var hm = d.human || {};
      kids.push(h('div', { class: 'cq-kpis' }, [
        h('div', { class: 'cq-kpi' }, [h('b', null, t.avg == null ? 'none' : String(t.avg)), h('span', { text: 'AI QA score' }), h('small', { text: hm.scored ? 'Human QA ' + hm.avg + ' on ' + hm.scored + ' calls' : 'No human QA audits in these days' })]),
        h('div', { class: 'cq-kpi' }, [h('b', { text: String(t.scored) }), h('span', { text: 'Calls scored' }), h('small', { text: hm.scored ? 'Human QA scored ' + hm.scored + ' in the same days' : 'Human QA scored none' })]),
        h('div', { class: 'cq-kpi' }, [h('b', { text: pc(t.fatalPct) }), h('span', { text: 'Fatal (' + t.fatals + ' calls)' }), h('small', { text: hm.scored ? 'Human QA ' + pc(hm.fatalPct) : 'No human QA to compare' })]),
        h('div', { class: 'cq-kpi' }, [h('b', { text: pc(t.surveyPct) }), h('span', { text: 'Full survey pitch' }), h('small', { text: 'on ' + t.surveyNeed + ' calls that needed it' })])]));
      kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'By agent' }), h('p', { text: 'Lowest AI score first. Not Relevant and Disconnected calls are left out of the averages, the same as the CRM QA report. Open an agent to see their calls.' })]),
        table([['Agent'], ['Audited', 'n'], ['AI QA', 'n'], ['Human QA', 'n'], ['Fatal', 'n'], ['Most missed']], d.agents.map(function (a) {
          return h('tr', { class: 'cq-click', tabindex: '0', onclick: function () { S.agent = a.email; S.tab = 'calls'; S.calls = null; draw(); loadCalls(); }, onkeydown: function (e) { if (e.key === 'Enter') e.currentTarget.click(); } }, [
            h('td', null, h('b', { text: a.name || a.email })), h('td', { class: 'n', text: String(a.audited) }), h('td', { class: 'n' }, scoreEl(a.avg)),
            h('td', { class: 'n', text: a.human ? a.human.avg + ' (' + a.human.audits + ')' : 'none' }), h('td', { class: 'n', text: String(a.fatal) }),
            h('td', { text: a.worst ? a.worst + ' (' + a.worstPct + '%)' : 'none' })]);
        }), { empty: 'No audited calls in these days yet' })]));
      kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'Parameters' }), h('p', { text: 'How often each parameter was missed on scored calls. The thin grey line is how often human QA missed it in the same days.' })]),
        table([['Parameter'], ['Points', 'n'], ['Missed by AI'], ['Human QA', 'n']], d.params.map(function (p) {
          return h('tr', null, [h('td', null, h('b', { text: p.label })), h('td', { class: 'n', text: String(p.weight) }), h('td', null, meter(p.missPct, p.humanMissPct)), h('td', { class: 'n', text: pc(p.humanMissPct) })]);
        })),
        h('h3', { text: 'Fatal errors' }), h('div', { class: 'cq-ctl' }, d.fatals.map(function (f) { return pill(f.label + ': ' + f.hits, f.hits ? 'bad' : ''); }))]));
      return kids;
    }

    function callsView() {
      var d = S.data, kids = [];
      var ag = h('select', { class: 'cq-in', 'aria-label': 'Agent', onchange: function (e) { S.agent = e.target.value; loadCalls(); } }, [h('option', { value: '', text: 'All agents' })].concat((d ? d.agents : []).map(function (a) { var o = h('option', { value: a.email, text: a.name || a.email }); if (a.email === S.agent) o.selected = true; return o; })));
      var stSel = h('select', { class: 'cq-in', 'aria-label': 'Status', onchange: function (e) { S.status = e.target.value; loadCalls(); } }, [['', 'Every status'], ['done', 'Audited'], ['pending', 'Waiting'], ['skipped', 'No recording'], ['error', 'Failed']].map(function (o) { var x = h('option', { value: o[0], text: o[1] }); if (o[0] === S.status) x.selected = true; return x; }));
      var fat = h('input', { type: 'checkbox', id: 'cq-fat' }); fat.checked = S.fatal; fat.addEventListener('change', function () { S.fatal = fat.checked; loadCalls(); });
      var q = h('input', { class: 'cq-in cq-q', type: 'search', placeholder: 'Search agent, ticket #, what the caller wanted', 'aria-label': 'Search calls', value: S.q });
      var tm = null; q.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { S.q = q.value; loadCalls(); }, 300); });
      kids.push(h('div', { class: 'cq-filters' }, [ag, stSel, h('label', { class: 'cq-ctl cq-small', for: 'cq-fat' }, [fat, 'Fatal only']), q]));
      if (!S.calls) { kids.push(h('div', { class: 'cq-card cq-empty', text: 'Loading calls...' })); return kids; }
      kids.push(h('div', { class: 'cq-card' }, [h('p', { class: 'cq-small cq-muted', text: S.calls.length + ' calls. * = not counted in the QA average (Not Relevant or Disconnected). Open a call for the full audit, the transcript and corrections.' }),
        table([['When (CST)'], ['Agent'], ['Call'], ['Stage'], ['Score', 'n'], ['Missed'], ['Ticket'], ['Length', 'n']], S.calls.map(function (c) {
          var status = c.status === 'done' ? null : pill(c.status === 'skipped' ? 'No recording' : c.status === 'error' ? 'Failed' : 'Waiting', c.status === 'error' ? 'bad' : '', c.err || null);
          return h('tr', { class: 'cq-click', tabindex: '0', onclick: function () { openCall(c.id); }, onkeydown: function (e) { if (e.key === 'Enter') openCall(c.id); } }, [
            h('td', { text: when(c.at) }), h('td', null, h('b', { text: c.agent || c.email })), h('td', { text: c.callType || '' }),
            h('td', null, status || [c.stage || '', c.fatal ? h('span', null, [' ', pill('Fatal', 'bad')]) : null, c.overridden ? h('span', null, [' ', pill('Corrected', 'blue')]) : null]),
            h('td', { class: 'n' }, c.status === 'done' ? scoreEl(c.total, c.excluded) : ''), h('td', { class: 'cq-small', text: c.missed.slice(0, 3).join(', ') + (c.missed.length > 3 ? ' +' + (c.missed.length - 3) : '') }),
            h('td', null, c.tickets.map(function (t) { return h('a', { href: t.url, target: '_blank', rel: 'noopener', onclick: function (e) { e.stopPropagation(); }, text: '#' + t.number + ' ' }); })),
            h('td', { class: 'n', text: mins(c.duration) })]);
        }), { empty: 'No calls match' })]));
      return kids;
    }

    function calibView() {
      var c = S.calib; if (!c) return [h('div', { class: 'cq-card cq-empty', text: 'Loading calibration...' })];
      var a = c.agreement, st = c.status || {}, hu = st.human || {}, kids = [];
      kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'How closely the AI agrees with human QA' }), h('p', { text: 'The AI audits calls the human QA team already audited, without seeing their score. Read only from CRM Call Audits: ' + (hu.n || 0) + ' human audits (' + (hu.first || '') + ' to ' + (hu.last || '') + '), ' + (hu.paired || 0) + ' matched to an Avoma transcript.' })]),
        h('div', { class: 'cq-kpis' }, [
          h('div', { class: 'cq-kpi' }, [h('b', { text: pc(a.overall) }), h('span', { text: 'Parameter agreement' }), h('small', { text: a.calls + ' calls compared' })]),
          h('div', { class: 'cq-kpi' }, [h('b', { text: a.avgDiff == null ? 'none' : String(a.avgDiff) }), h('span', { text: 'Average score gap' }), h('small', { text: pc(a.within10Pct) + ' within 10 points' })]),
          h('div', { class: 'cq-kpi' }, [h('b', { text: pc(a.fatalAgreePct) }), h('span', { text: 'Fatal agreement' })]),
          h('div', { class: 'cq-kpi' }, [h('b', { text: pc(a.stageAgreePct) }), h('span', { text: 'Same stage' })])]),
        h('div', { class: 'cq-ctl' }, [h('button', { type: 'button', class: 'cq-btn primary sm', onclick: function (e) { var b = e.currentTarget; b.disabled = true; api('/api/call-qa/calibration/run', { n: 60 }).then(function (r) { b.disabled = false; toast(r.success ? r.queued + ' human-audited calls queued for the AI' : r.error, r.success ? 'success' : 'error'); }); }, text: 'Compare 60 more calls' }),
          h('button', { type: 'button', class: 'cq-btn sm', onclick: function (e) { var b = e.currentTarget; b.disabled = true; b.textContent = 'Learning...'; api('/api/call-qa/relearn', {}).then(function (r) { b.disabled = false; b.textContent = 'Relearn from human QA'; toast(r.success ? 'Learned again from ' + (r.added || 0) + ' new human audits' : r.error, r.success ? 'success' : 'error'); S.calib = null; loadCalib(); }); }, text: 'Relearn from human QA' })])]));
      kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'Per parameter' }), h('p', { text: 'Caught: of the calls human QA marked missed, how many the AI also marked missed. Extra: of the AI\'s misses, how many human QA passed.' })]),
        table([['Parameter'], ['Calls', 'n'], ['Agree', 'n'], ['Human missed', 'n'], ['Caught', 'n'], ['AI missed', 'n'], ['Extra', 'n']], a.params.map(function (p) {
          return h('tr', null, [h('td', null, h('b', { text: p.label })), h('td', { class: 'n', text: String(p.pairs) }), h('td', { class: 'n', text: pc(p.agreePct) }), h('td', { class: 'n', text: String(p.humanMiss) }), h('td', { class: 'n', text: pc(p.caughtPct) }), h('td', { class: 'n', text: String(p.aiMiss) }), h('td', { class: 'n', text: pc(p.falseMissPct) })]);
        }), { empty: 'No calls compared yet' })]));
      kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'Biggest gaps' }), h('p', { text: 'Calls where the AI and human QA differ by 20 points or more. Open one to compare, and correct the AI where it is wrong.' })]),
        table([['When (CST)'], ['Agent'], ['AI', 'n'], ['Human', 'n'], ['Human QA note']], a.gaps.map(function (g) {
          return h('tr', { class: 'cq-click', tabindex: '0', onclick: function () { openCall(g.cid); }, onkeydown: function (e) { if (e.key === 'Enter') openCall(g.cid); } }, [h('td', { text: when(g.at) }), h('td', null, h('b', { text: g.agent || '' })), h('td', { class: 'n' }, scoreEl(g.ai)), h('td', { class: 'n' }, scoreEl(g.human)), h('td', { class: 'cq-small', text: g.note || '' })]);
        }), { empty: 'No big gaps' })]));
      return kids;
    }

    function guideView() {
      var c = S.calib; if (!c) return [h('div', { class: 'cq-card cq-empty', text: 'Loading...' })];
      var g = c.guide, hs = c.human || {};
      if (!g) return [h('div', { class: 'cq-card cq-empty', text: 'The AI has not learned from human QA yet. It reads CRM Call Audits within a few minutes of starting.' })];
      var P = (c.agreement && c.agreement.params) || [];
      return [h('div', { class: 'cq-card cq-guide' }, [h('div', { class: 'cq-ch' }, [h('h2', { text: 'How Adit QA applies the rubric' }), h('p', { text: 'Written by the AI from ' + g.from + ' human audits and their improvement notes, ' + when(g.at) + '. Relearned every week. Human QA, last 6 months: average ' + (hs.avg == null ? 'none' : hs.avg) + ', fatal ' + pc(hs.fatalPct) + ' on ' + (hs.scored || 0) + ' scored calls.' })]),
        g.general ? h('p', null, [h('b', { text: 'Reviewer habits. ' }), g.general]) : null, g.fatal ? h('p', null, [h('b', { text: 'Fatal errors. ' }), g.fatal]) : null,
        h('h3', { text: 'Per parameter' })].concat(P.map(function (p) { return g.params[p.key] ? h('p', null, [h('b', { text: p.label + ' (' + p.weight + ' pts, human QA misses it on ' + pc((hs.missPct || {})[p.key]) + '). ' }), g.params[p.key]]) : null; })))];
    }

    function openCall(id) {
      var dlg = h('div', { class: 'cq-dlg cq', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Call audit' });
      var panel = h('div', { class: 'cq-dlg-p' }, h('div', { class: 'cq-empty', text: 'Loading the audit...' }));
      dlg.appendChild(panel); document.body.appendChild(dlg);
      var prev = document.activeElement;
      function close() { dlg.remove(); document.removeEventListener('keydown', esc); if (prev && prev.focus) prev.focus(); }
      function esc(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', esc);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
      function render(c) {
        var r = c.result, kids = [];
        kids.push(h('div', { class: 'cq-dlg-h' }, [h('div', null, [h('h2', { text: (c.agent || c.email) + ', ' + when(c.at) + ' CST' }),
          h('p', { class: 'cq-small cq-muted', text: (c.direction || 'Call') + ', ' + mins(c.duration) + ', transcript from ' + (c.source === 'avoma' ? 'Avoma' : c.source === 'rc' ? 'RingCentral (machine transcribed)' : 'none') + (c.auditedAt ? ', audited ' + when(c.auditedAt.replace(' ', 'T') + 'Z') : '') + (c.kind === 'calib' ? ', calibration call' : '') })]),
          h('button', { type: 'button', class: 'cq-x', 'aria-label': 'Close', onclick: close, text: '×' })]));
        if (!r) { kids.push(h('div', { class: 'cq-card' }, [h('p', { text: c.status === 'skipped' ? 'Not audited: ' + (c.err || 'no recording') : c.status === 'error' ? 'The audit failed: ' + (c.err || '') : 'Waiting to be audited.' }), c.status !== 'pending' ? reBtn() : null])); panel.replaceChildren.apply(panel, kids); return; }
        kids.push(h('div', { class: 'cq-card' }, [h('div', { class: 'cq-ctl', style: 'justify-content:space-between' }, [
          h('div', { class: 'cq-ctl' }, [h('span', { class: 'cq-big' }, scoreEl(c.total, c.excluded)), h('div', null, [h('div', null, [pill(c.stage), ' ', c.fatal ? pill('Fatal', 'bad') : pill('No fatal', 'ok'), ' ', r.fcr ? pill('FCR', 'blue') : null, ' ', pill('AI confidence: ' + r.confidence)]),
            h('p', { class: 'cq-small cq-muted', style: 'margin:4px 0 0', text: (r.callType || '') + (c.aiTotal != null && c.aiTotal !== c.total ? '. AI scored ' + c.aiTotal + ' before corrections.' : '') + (c.excluded ? ' Not counted in the QA average.' : '') })])]), reBtn()]),
          c.fatal ? h('p', { class: 'cq-note', style: 'margin:10px 0 0', text: 'Fatal: ' + c.rubric.fatals.filter(function (f) { return r.fatal[f.key] && r.fatal[f.key].hit; }).map(function (f) { return f.label + (r.fatal[f.key].why ? ' (' + r.fatal[f.key].why + ')' : ''); }).join('; ') }) : null,
          h('p', { style: 'margin:10px 0 0;font-size:13.5px;line-height:1.55', text: r.summary })]));
        if (c.human) kids.push(h('div', { class: 'cq-card' }, [h('h3', { style: 'margin-top:0', text: 'Human QA on this call: ' + c.human.total + ' (' + c.human.stage + ', ' + (c.human.auditor || '') + ', ' + (c.human.name || '') + ')' }), c.human.areas ? h('p', { class: 'cq-small', text: 'Improve: ' + c.human.areas }) : null, c.human.positives ? h('p', { class: 'cq-small', text: 'Positives: ' + c.human.positives }) : null]));
        var params = h('div', { class: 'cq-card' }, [h('h3', { style: 'margin-top:0', text: 'Parameters' })].concat(c.rubric.params.map(function (p) {
          var x = r.params[p.key] || {}, hv = c.human && c.human.fields ? c.human.fields[p.crm] : null;
          return prow(p.key, p.label + '', p.weight + ' pts' + (hv ? ', human: ' + hv : ''), x.r === 'missed' ? pill('Missed', 'bad') : x.r === 'na' ? pill('N/A') : pill('Met', 'ok'), x.why, x.quote, x.overridden, [['met', 'Met'], ['missed', 'Missed'], ['na', 'N/A']]);
        })));
        var fat = h('div', { class: 'cq-card' }, [h('h3', { style: 'margin-top:0', text: 'Fatal parameters' })].concat(c.rubric.fatals.map(function (f) {
          var x = r.fatal[f.key] || {};
          return prow(f.key, f.label, '', x.hit ? pill('Fatal', 'bad') : pill('Clear', 'ok'), x.hit ? x.why : '', '', x.overridden, [['clear', 'Clear'], ['hit', 'Fatal']]);
        })).concat([h('h3', { text: 'Survey' }), h('p', { class: 'cq-small', text: (r.survey.required ? 'Required on this call. ' : 'Not required. ') + 'Pitched: ' + r.survey.pitched + '. ' + (r.survey.why || '') })]));
        var side = h('div', null, [
          h('div', { class: 'cq-card' }, [h('h3', { style: 'margin-top:0', text: 'Coaching for the agent' }), h('p', { class: 'cq-small', style: 'line-height:1.55', text: r.coaching }),
            r.positives.length ? h('div', null, [h('h3', { text: 'Done well' }), h('ul', null, r.positives.map(function (x) { return h('li', { text: x }); }))]) : null,
            r.improvements.length ? h('div', null, [h('h3', { text: 'To improve' }), h('ul', null, r.improvements.map(function (x) { return h('li', { text: x }); }))]) : null]),
          h('div', { class: 'cq-card' }, [h('h3', { style: 'margin-top:0', text: 'Ticket' }), h('p', { class: 'cq-small', text: r.ticketCheck || '' }),
            c.tickets.length ? h('ul', null, c.tickets.map(function (t) { return h('li', null, [h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }), ' ' + t.subject + ' (' + t.status + (t.reopen ? ', reopened ' + t.reopen + 'x' : '') + ')']); })) : h('p', { class: 'cq-small cq-muted', text: 'No ticket was found for this call.' })]),
          h('div', { class: 'cq-card' }, [prow('stage', 'Stage', '', pill(c.stage), '', '', (c.overrides || []).some(function (o) { return o.field === 'stage'; }), c.rubric.stages.map(function (s) { return [s, s]; }))]),
          c.overrides && c.overrides.length ? h('div', { class: 'cq-card' }, [h('h3', { style: 'margin-top:0', text: 'Corrections' }), h('ul', null, c.overrides.map(function (o) { return h('li', { text: o.field + ' set to ' + o.value + ' by ' + String(o.by_email || '').split('@')[0] + ': ' + o.reason }); }))]) : null]);
        kids.push(h('div', { class: 'cq-grid2' }, [h('div', null, [params, fat]), side]));
        kids.push(h('details', { class: 'cq-card' }, [h('summary', { text: 'Transcript' }), h('div', { class: 'cq-tx', text: c.transcript || 'No transcript' })]));
        panel.replaceChildren.apply(panel, kids);
        function prow(key, label, sub, res, why, quote, over, opts) {
          var form = h('div', { class: 'cq-ov' });
          var sel = h('select', { class: 'cq-in', 'aria-label': 'Correct result for ' + label }, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
          var rsn = h('input', { class: 'cq-in', placeholder: 'Why the AI was wrong (it learns from this)', 'aria-label': 'Reason for the correction', maxlength: '600' });
          form.appendChild(sel); form.appendChild(rsn);
          form.appendChild(h('button', { type: 'button', class: 'cq-btn primary sm', onclick: function (e) {
            if (rsn.value.trim().length < 5) { rsn.focus(); return toast('Write why the AI was wrong', 'error'); }
            var b = e.currentTarget; b.disabled = true;
            api('/api/call-qa/calls/' + c.id + '/override', { field: key, value: sel.value, reason: rsn.value }).then(function (x) { b.disabled = false; if (!x.success) return toast(x.error || 'Failed', 'error'); toast('Saved', 'success'); render(x.call); dirty = true; });
          }, text: 'Save' }));
          return h('div', { class: 'cq-prow' }, [h('div', { class: 'lab' }, [label, sub ? h('small', { text: sub }) : null, over ? h('span', null, [' ', pill('Corrected', 'blue')]) : null]),
            h('div', { class: 'act' }, [res, h('button', { type: 'button', class: 'cq-btn sm', 'aria-expanded': 'false', onclick: function (e) { var on = form.classList.toggle('on'); e.currentTarget.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) sel.focus(); }, text: 'Correct' })]),
            why || quote ? h('div', { class: 'w' }, [why || '', quote ? h('q', { text: '"' + quote + '"' }) : null]) : null, form]);
        }
        function reBtn() { return h('button', { type: 'button', class: 'cq-btn sm', onclick: function (e) { var b = e.currentTarget; b.disabled = true; b.textContent = 'Auditing...'; api('/api/call-qa/calls/' + c.id + '/reaudit', {}).then(function (x) { if (!x.success) { b.disabled = false; b.textContent = 'Audit again'; return toast(x.error || 'Failed', 'error'); } render(x.call); dirty = true; }); }, text: 'Audit again' }); }
      }
      var dirty = false;
      api('/api/call-qa/calls/' + id).then(function (x) { if (!x.success) { panel.replaceChildren(h('div', { class: 'cq-empty', text: x.error || 'Could not load the call' })); return; } render(x.call); var b = panel.querySelector('.cq-x'); if (b) b.focus(); });
      var obs = new MutationObserver(function () { if (!document.body.contains(dlg)) { obs.disconnect(); if (dirty) { S.calls = null; load(); } } });
      obs.observe(document.body, { childList: true });
    }

    function draw() {
      var kids = [head(), tabs()];
      if (!S.data) kids.push(h('div', { class: 'cq-card cq-empty', text: S.err || 'Loading Call QA...' }));
      else if (S.tab === 'overview') kids = kids.concat(overview(S.data));
      else if (S.tab === 'calls') kids = kids.concat(callsView());
      else if (S.tab === 'calibration') kids = kids.concat(calibView());
      else kids = kids.concat(guideView());
      wrap.replaceChildren.apply(wrap, kids);
    }
    function load() {
      draw();
      api('/api/call-qa/summary?' + qs()).then(function (r) { if (!r.success) { S.err = r.error; S.data = null; draw(); return; } S.err = null; S.data = r; draw(); if (S.tab === 'calls') loadCalls(); });
    }
    function loadCalls() {
      S.calls = null; draw();
      api('/api/call-qa/calls?' + qs() + '&agent=' + encodeURIComponent(S.agent) + '&status=' + S.status + (S.fatal ? '&fatal=1' : '') + '&q=' + encodeURIComponent(S.q)).then(function (r) { S.calls = r.success ? r.calls : []; if (S.tab === 'calls') { var f = document.activeElement; var id = f && f.getAttribute('aria-label'); draw(); if (id) { var el = wrap.querySelector('[aria-label="' + id + '"]'); if (el) el.focus(); } } });
    }
    function loadCalib() { api('/api/call-qa/calibration').then(function (r) { S.calib = r.success ? r : { agreement: { params: [], gaps: [] }, status: {} }; draw(); }); }
    load();
    return { refresh: function () { load(); } };
  }
  window.CallQA = { mount: mount };
})();
