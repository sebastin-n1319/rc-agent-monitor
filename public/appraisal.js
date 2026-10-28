/* Batch 193: agent appraisals (admin, under Bonus, next to the Bonus Calculator). Data: /api/appraisals. */
(function () {
  'use strict';
  var S = { view: 'list', items: null, agents: null, a: null, edits: {}, fb: {}, show: [], notes: '', name: '', title: '', status: 'draft', dirty: false, busy: '', err: '' };
  var KPIS = [
    { key: 'calls', kra: 'Productivity', label: 'No. Of Calls', perDay: true, steps: [7, 5, 4, 3] },
    { key: 'chats', kra: 'Productivity', label: 'No. Of Chats', perDay: true, steps: [4, 3.5, 3, 2.5] },
    { key: 'tickets', kra: 'Productivity', label: 'No. Of tickets handled', perDay: true, steps: [7, 5, 4, 3] },
    { key: 'csat', kra: 'Performance', label: 'CSAT%', pct: true, steps: [90, 85, 80, 75] },
    { key: 'fcr', kra: 'Performance', label: 'FCR%', pct: true, steps: [75, 70, 65, 60] },
    { key: 'qa', kra: 'People Excellence', label: 'QA', pct: true, steps: [90, 85, 80, 75] },
  ];
  var INFO = [{ key: 'days', kra: 'People Excellence', label: 'No.of Working Days' }, { key: 'shrink', kra: 'People Excellence', label: 'Unplanned Shrinkage', pct: true }];
  var KRAS = ['Productivity', 'Performance', 'People Excellence'];
  var FB = [
    ['Overall Feedback', [['overall', 'Overall feedback', 5]]],
    ['Productivity', [['productivity', 'Productivity rating line', 1], ['calls', 'Call handling', 4], ['chats', 'Chat handling', 3], ['tickets', 'Ticket resolution', 4]]],
    ['Performance Quality', [['performance', 'Performance rating line', 1], ['csat', 'Customer satisfaction (CSAT)', 4], ['fcr', 'First contact resolution (FCR)', 4]]],
    ['People Excellence', [['people', 'People Excellence rating line', 1], ['qa', 'Quality assurance (QA)', 4], ['attendance', 'Attendance and reliability', 3]]],
    ['Strengths', [['strengths', 'One strength per line', 5]]],
    ['Areas for Development', [['development', 'One area per line', 4]]],
    ['Overall Summary', [['summary', 'Overall summary', 5]]],
  ];
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return e;
  }
  function api(path, body, method) {
    var o = { credentials: 'include', method: method || (body ? 'POST' : 'GET') };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json(); }).then(function (j) { if (!j.success) throw new Error(j.error || 'Something went wrong'); return j; });
  }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  var t2 = function (n) { return n == null || !isFinite(n) ? null : Math.floor(n * 100 + 1e-9) / 100; };
  var f2 = function (n) { return n == null ? '-' : t2(n).toFixed(2); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var mlabel = function (k) { var p = String(k || '').split('-'); return p.length === 2 ? MON[+p[1] - 1] + ' ' + p[0] : k; };
  var root = function () { return document.getElementById('ap-root'); };

  // the sheet's rules (same as lib/appraisal.js)
  function rate(k, v, days) {
    if (v == null || v === '' || !isFinite(v) || Number(v) <= 0) return null;
    var x = Number(v); if (k.perDay) { if (!days || days <= 0) return null; x = x / days; }
    return x > k.steps[0] ? 5 : x > k.steps[1] ? 4 : x > k.steps[2] ? 3 : x > k.steps[3] ? 2 : 1;
  }
  function avg(xs) { var v = xs.filter(function (x) { return x != null && x > 0; }); return v.length ? v.reduce(function (t, x) { return t + x; }, 0) / v.length : null; }
  function val(m, f) { var e = S.edits[m]; if (e && Object.prototype.hasOwnProperty.call(e, f)) return e[f] === '' || e[f] == null ? null : Number(e[f]); var a = S.a.auto[m] || {}; return a[f] == null ? null : a[f]; }
  // the other wing's channel is hidden and not rated unless switched on for this appraisal (same as lib/appraisal.js)
  function hidden() { var team = S.a && S.a.agent && S.a.agent.team; if (team === 'chat') return S.show.indexOf('calls') >= 0 ? [] : ['calls']; return S.show.indexOf('chats') >= 0 ? [] : ['chats']; }
  function scores() {
    var keys = S.a.months.map(function (m) { return m.key; }), hid = hidden();
    var kpis = KPIS.filter(function (k) { return hid.indexOf(k.key) < 0; }).map(function (k) { var monthly = keys.map(function (m) { return rate(k, val(m, k.key), val(m, 'days')); }); return { key: k.key, kra: k.kra, monthly: monthly, raw: avg(monthly) }; });
    var kras = KRAS.map(function (n) { return { name: n, raw: avg(kpis.filter(function (k) { return k.kra === n; }).map(function (k) { return k.raw; })) }; });
    return { kpis: kpis, kras: kras, overall: avg(kras.map(function (k) { return k.raw; })) };
  }

  function load() {
    S.err = ''; S.busy = 'list'; draw();
    Promise.all([api('/api/appraisals'), S.agents ? Promise.resolve({ agents: S.agents }) : api('/api/bonus/agents')]).then(function (r) { S.items = r[0].items; S.agents = r[1].agents; })
      .catch(function (e) { S.err = e.message; }).then(function () { S.busy = ''; draw(); });
  }
  function openOne(a) { S.a = a; S.edits = JSON.parse(JSON.stringify(a.edits || {})); S.fb = Object.assign({}, a.feedback || {}); S.notes = a.notes || ''; S.name = a.name || ''; S.title = a.title || ''; S.status = a.status || 'draft'; S.show = (a.show || []).slice(); S.dirty = false; S.view = 'edit'; draw(); window.scrollTo(0, 0); }
  function open(id) { S.busy = 'open'; draw(); api('/api/appraisals/' + id).then(function (j) { S.busy = ''; openOne(j.appraisal); }).catch(function (e) { S.busy = ''; toast(e.message, 'error'); draw(); }); }
  function save(then) {
    S.busy = 'save'; draw();
    return api('/api/appraisals/' + S.a.id + '/save', { name: S.name, title: S.title, edits: S.edits, feedback: S.fb, notes: S.notes, status: S.status, show: S.show })
      .then(function (j) { S.busy = ''; openOne(j.appraisal); if (!then) toast('Appraisal saved', 'success'); return j; })
      .catch(function (e) { S.busy = ''; toast(e.message, 'error'); draw(); throw e; });
  }
  function download() {
    var go = function () { window.location.href = '/api/appraisals/' + S.a.id + '/xlsx'; };
    if (S.dirty) save(true).then(go, function () {}); else go();
  }
  function confirmLeave() { return !S.dirty || window.confirm('You have unsaved changes. Leave without saving?'); }

  // ── list ──
  function monthsAgo(n) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function drawList(R) {
    R.appendChild(h('div', { class: 'ap-head' }, [h('div', null, [h('h2', { class: 'ap-h1', text: 'Appraisals' }),
      h('p', { class: 'ap-sub', text: 'Build an agent\'s appraisal for HR. The numbers come from the same data as the bonus and My Stats; edit anything before you download. Ratings follow the appraisal sheet rules.' })])]));
    if (S.err) R.appendChild(h('div', { class: 'ap-note bad', role: 'alert', text: S.err }));
    var agents = (S.agents || []).slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
    var sel = h('select', { class: 'ap-in', id: 'ap-agent', 'aria-label': 'Agent' }, [h('option', { value: '', text: 'Choose an agent' })].concat(agents.map(function (a) { return h('option', { value: a.email, text: a.name + (a.team === 'chat' ? ' (Chat)' : ' (Calls)') }); })));
    var from = h('input', { class: 'ap-in', type: 'month', id: 'ap-from', value: monthsAgo(6), 'aria-label': 'From month' });
    var to = h('input', { class: 'ap-in', type: 'month', id: 'ap-to', value: monthsAgo(1), 'aria-label': 'To month' });
    var title = h('input', { class: 'ap-in wide', type: 'text', id: 'ap-title', placeholder: 'Title (optional, for example Sabrina Appraisal 2026)', 'aria-label': 'Title' });
    var btn = h('button', { type: 'button', class: 'ap-btn primary', disabled: S.busy === 'create' ? true : null, text: S.busy === 'create' ? 'Reading the numbers and writing the feedback...' : 'Create appraisal',
      onclick: function () {
        if (!sel.value) { toast('Choose an agent', 'error'); sel.focus(); return; }
        if (!from.value || !to.value || from.value > to.value) { toast('Pick a start month before the end month', 'error'); return; }
        S.busy = 'create'; draw();
        api('/api/appraisals', { email: sel.value, from: from.value, to: to.value, title: title.value }).then(function (j) { S.busy = ''; S.items = null; openOne(j.appraisal); })
          .catch(function (e) { S.busy = ''; toast(e.message, 'error'); draw(); });
      } });
    R.appendChild(h('section', { class: 'ap-card' }, [h('h3', { class: 'ap-card-h', text: 'New appraisal' }),
      h('div', { class: 'ap-form' }, [h('label', null, [h('span', { text: 'Agent' }), sel]), h('label', null, [h('span', { text: 'From' }), from]), h('label', null, [h('span', { text: 'To' }), to]),
        h('label', { class: 'grow' }, [h('span', { text: 'Title' }), title]), btn]),
      h('p', { class: 'ap-hint', text: 'Up to 12 months. Months before the tool has QA or attendance stay blank for you to fill in. Reading older call months from RingCentral can take a minute; use Refresh numbers on the appraisal later.' })]));
    var items = S.items || [];
    var list = h('section', { class: 'ap-card' }, [h('h3', { class: 'ap-card-h', text: 'Saved appraisals' })]);
    if (S.busy === 'list') list.appendChild(h('p', { class: 'ap-hint', text: 'Loading...' }));
    else if (!items.length) list.appendChild(h('p', { class: 'ap-hint', text: 'No appraisals yet. Create the first one above.' }));
    else list.appendChild(h('div', { class: 'ap-scroll' }, [h('table', { class: 'ap-table' }, [
      h('thead', null, [h('tr', null, ['Agent', 'Title', 'Period', 'Overall', 'Status', 'Updated', ''].map(function (t) { return h('th', { scope: 'col', text: t }); }))]),
      h('tbody', null, items.map(function (x) {
        return h('tr', null, [h('td', null, [h('button', { type: 'button', class: 'ap-link', text: x.name, onclick: function () { open(x.id); } })]), h('td', { text: x.title }),
          h('td', { text: mlabel(x.from) + ' to ' + mlabel(x.to) }), h('td', null, [h('b', { text: x.overall == null ? '-' : f2(x.overall) + ' / 5' })]),
          h('td', null, [h('span', { class: 'ap-pill ' + (x.status === 'final' ? 'ok' : ''), text: x.status === 'final' ? 'Final' : 'Draft' })]),
          h('td', { class: 'muted', text: String(x.updatedAt || '').slice(0, 16) + (x.updatedBy ? ' · ' + String(x.updatedBy).split('@')[0] : '') }),
          h('td', { class: 'acts' }, [h('button', { type: 'button', class: 'ap-btn sm', text: 'Open', onclick: function () { open(x.id); } }),
            h('a', { class: 'ap-btn sm', href: '/api/appraisals/' + x.id + '/xlsx', text: 'Download' }),
            h('button', { type: 'button', class: 'ap-btn sm ghost', 'aria-label': 'Delete ' + x.title, text: 'Delete', onclick: function () {
              if (!window.confirm('Delete "' + x.title + '"? This cannot be undone.')) return;
              api('/api/appraisals/' + x.id, null, 'DELETE').then(function () { toast('Appraisal deleted', 'success'); load(); }).catch(function (e) { toast(e.message, 'error'); });
            } })])]);
      }))])]));
    R.appendChild(list);
  }

  // ── editor ──
  function drawEdit(R) {
    var a = S.a, sc = scores(), keys = a.months.map(function (m) { return m.key; });
    var mark = function () { if (!S.dirty) { S.dirty = true; var b = document.getElementById('ap-dirty'); if (b) b.hidden = false; } };
    R.appendChild(h('button', { type: 'button', class: 'ap-back', text: '< All appraisals', onclick: function () { if (!confirmLeave()) return; S.view = 'list'; S.a = null; load(); } }));
    var overall = h('div', { class: 'ap-overall', 'aria-live': 'polite' }, [h('span', { text: 'Overall rating' }), h('b', { id: 'ap-ov', text: f2(sc.overall) }), h('small', { text: '/ 5' })]);
    R.appendChild(h('div', { class: 'ap-head' }, [
      h('div', { class: 'ap-titles' }, [
        h('input', { class: 'ap-title-in', value: S.title, 'aria-label': 'Appraisal title', oninput: function (e) { S.title = e.target.value; mark(); } }),
        h('div', { class: 'ap-meta' }, [h('label', null, [h('span', { text: 'Name on appraisal' }), h('input', { class: 'ap-in', value: S.name, oninput: function (e) { S.name = e.target.value; mark(); } })]),
          h('span', { class: 'muted', text: (a.agent && a.agent.team === 'chat' ? 'Chat Wing' : 'Calls Wing') + ' · ' + a.months[0].label + ' to ' + a.months[a.months.length - 1].label }),
          h('div', { class: 'ap-seg', role: 'group', 'aria-label': 'Status' }, [['draft', 'Draft'], ['final', 'Final']].map(function (s) { return h('button', { type: 'button', 'aria-pressed': S.status === s[0] ? 'true' : 'false', text: s[1], onclick: function () { S.status = s[0]; mark(); draw(); } }); }))])]),
      overall]));
    R.appendChild(h('div', { class: 'ap-bar' }, [
      h('button', { type: 'button', class: 'ap-btn primary', disabled: S.busy ? true : null, text: S.busy === 'save' ? 'Saving...' : 'Save', onclick: function () { save(); } }),
      h('button', { type: 'button', class: 'ap-btn', disabled: S.busy ? true : null, text: 'Download for HR (.xlsx)', onclick: download }),
      h('button', { type: 'button', class: 'ap-btn', disabled: S.busy ? true : null, text: S.busy === 'refresh' ? 'Reading...' : 'Refresh numbers', title: 'Read the tool\'s numbers again; values you edited stay as edited',
        onclick: function () { if (S.dirty && !window.confirm('Save your changes first? Unsaved edits will be lost.')) return; S.busy = 'refresh'; draw(); api('/api/appraisals/' + a.id + '/refresh', {}).then(function (j) { S.busy = ''; openOne(j.appraisal); toast('Numbers read again', 'success'); }).catch(function (e) { S.busy = ''; toast(e.message, 'error'); draw(); }); } }),
      h('span', { class: 'ap-dirty', id: 'ap-dirty', hidden: S.dirty ? null : true, text: 'Unsaved changes' })]));
    (a.warnings || []).forEach(function (w) { R.appendChild(h('div', { class: 'ap-note', text: w })); });

    // scores table
    var tb = h('tbody');
    var hid = hidden(), lines = KPIS.filter(function (k) { return hid.indexOf(k.key) < 0; }).concat(INFO), seen = {};
    lines.forEach(function (k) {
      var first = !seen[k.kra]; seen[k.kra] = true;
      var span = lines.filter(function (x) { return x.kra === k.kra; }).length;
      var sk = sc.kpis.filter(function (x) { return x.key === k.key; })[0], kra = sc.kras.filter(function (x) { return x.name === k.kra; })[0];
      var tr = h('tr', null, [first ? h('th', { scope: 'rowgroup', rowspan: span, class: 'kra', text: k.kra }) : null, h('th', { scope: 'row', class: 'kpi', text: k.label })]);
      keys.forEach(function (m, i) {
        var auto = (a.auto[m] || {})[k.key], edited = S.edits[m] && Object.prototype.hasOwnProperty.call(S.edits[m], k.key);
        var v = val(m, k.key), r = sk ? sk.monthly[i] : null;
        var inp = h('input', { class: 'ap-cell' + (edited ? ' edited' : ''), type: 'number', step: 'any', min: '0', value: v == null ? '' : String(t2(v)), 'aria-label': k.label + ' ' + a.months[i].label,
          title: edited ? 'Edited. The tool had ' + (auto == null ? 'no value' : t2(auto) + (k.pct ? '%' : '')) : (auto == null ? 'No value in the tool. Type one to rate this month.' : 'From the tool'),
          oninput: function (e) { (S.edits[m] = S.edits[m] || {})[k.key] = e.target.value === '' ? '' : Number(e.target.value); e.target.classList.add('edited'); mark(); refresh(); } });
        tr.appendChild(h('td', null, [h('div', { class: 'ap-cellwrap' }, [inp, k.pct ? h('span', { class: 'u', text: '%' }) : null]), sk ? h('span', { class: 'ap-r r' + (r || 0), id: 'ap-r-' + k.key + '-' + i, text: r == null ? '-' : String(r) }) : null]));
      });
      tr.appendChild(h('td', { class: 'rt' }, [h('b', { id: 'ap-rt-' + k.key, text: sk ? f2(sk.raw) : '-' })]));
      if (first) tr.appendChild(h('td', { class: 'kr', rowspan: span }, [h('b', { id: 'ap-kr-' + KRAS.indexOf(k.kra), text: f2(kra && kra.raw) })]));
      tb.appendChild(tr);
    });
    R.appendChild(h('section', { class: 'ap-card' }, [h('h3', { class: 'ap-card-h', text: 'Scores' }),
      h('p', { class: 'ap-hint', text: 'Small chips are the month ratings (1 to 5). Clear a value to leave that month unrated, for example a month on another channel. Edited cells are outlined.' }),
      h('div', { class: 'ap-scroll' }, [h('table', { class: 'ap-table ap-scores' }, [
        h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'KRA' }), h('th', { scope: 'col', text: 'KPI' })].concat(a.months.map(function (m) { return h('th', { scope: 'col', text: m.label + (m.partial ? ' (to date)' : '') }); })).concat([h('th', { scope: 'col', text: 'Rating' }), h('th', { scope: 'col', text: 'KRA rating' })]))]), tb])]),
      (function () {
        var other = a.agent && a.agent.team === 'chat' ? ['calls', 'Also rate calls (for months the agent took calls)'] : ['chats', 'Also rate chats (for months the agent was on chat)'];
        var cb = h('input', { type: 'checkbox', checked: S.show.indexOf(other[0]) >= 0 ? true : null, onchange: function (e) {
          S.show = S.show.filter(function (x) { return x !== other[0]; }); if (e.target.checked) S.show.push(other[0]); mark(); draw(); } });
        return h('label', { class: 'ap-toggle' }, [cb, h('span', { text: other[1] })]);
      })(),
      h('details', { class: 'ap-rules' }, [h('summary', { text: 'Rating rules' }), h('p', { text: 'Calls and tickets per working day: more than 7 is 5, more than 5 is 4, more than 4 is 3, more than 3 is 2, otherwise 1. Chats per working day: more than 4 is 5, 3.5 is 4, 3 is 3, 2.5 is 2. CSAT and QA: above 90% is 5, 85% is 4, 80% is 3, 75% is 2. FCR: above 75% is 5, 70% is 4, 65% is 3, 60% is 2. A KPI rating is the average of its rated months, a KRA rating the average of its KPIs, and the overall rating the average of the three KRAs. Working days and unplanned shrinkage are shown, not rated.' })])]));

    // feedback
    var fbBox = h('section', { class: 'ap-card' }, [h('h3', { class: 'ap-card-h', text: 'Feedback' })]);
    var notes = h('textarea', { class: 'ap-ta', rows: '3', placeholder: 'Your context for the AI, for example: FCR drop is partly due to ticket handling negligence. January was a full month on chat.', oninput: function (e) { S.notes = e.target.value; mark(); } });
    notes.value = S.notes;
    var hasFb = Object.keys(S.fb).some(function (k) { return String(S.fb[k] || '').trim(); });
    fbBox.appendChild(h('div', { class: 'ap-ai' }, [h('label', { class: 'grow' }, [h('span', { text: 'Your notes (the AI uses them, they are not in the download)' }), notes]),
      h('button', { type: 'button', class: 'ap-btn primary', disabled: S.busy ? true : null, text: S.busy === 'ai' ? 'Writing...' : (hasFb ? 'Rewrite with AI' : 'Write with AI'), onclick: function () {
        if (hasFb && !window.confirm('Replace the feedback below with a new AI draft?')) return;
        var go = function () { S.busy = 'ai'; draw(); api('/api/appraisals/' + a.id + '/ai', {}).then(function (j) { S.busy = ''; S.fb = j.feedback; S.dirty = true; draw(); toast('Draft written. Read it, edit anything, then save.', 'success'); })
          .catch(function (e) { S.busy = ''; toast(e.message, 'error'); draw(); }); };
        if (S.dirty) save(true).then(go, function () {}); else go();
      } })]));
    FB.forEach(function (g) {
      var grp = h('div', { class: 'ap-fbg' }, [h('h4', { text: g[0] })]);
      g[1].forEach(function (f) {
        if ((f[0] === 'chats' || f[0] === 'calls') && hidden().indexOf(f[0]) >= 0) return;
        var ta = h('textarea', { class: 'ap-ta', rows: String(f[2]), 'aria-label': f[1], oninput: function (e) { S.fb[f[0]] = e.target.value; mark(); } }); ta.value = S.fb[f[0]] || '';
        grp.appendChild(h('label', null, [h('span', { text: f[1] }), ta]));
      });
      fbBox.appendChild(grp);
    });
    R.appendChild(fbBox);
  }

  // live ratings while typing (no redraw, so the cursor stays where it is)
  function refresh() {
    var sc = scores(), set = function (id, t, cls) { var el = document.getElementById(id); if (el) { el.textContent = t; if (cls != null) el.className = cls; } };
    sc.kpis.forEach(function (k) { k.monthly.forEach(function (r, i) { set('ap-r-' + k.key + '-' + i, r == null ? '-' : String(r), 'ap-r r' + (r || 0)); }); set('ap-rt-' + k.key, f2(k.raw)); });
    sc.kras.forEach(function (k, i) { set('ap-kr-' + i, f2(k.raw)); });
    set('ap-ov', f2(sc.overall));
  }
  function draw() {
    var R = root(); if (!R) return;
    var y = window.scrollY;
    while (R.firstChild) R.removeChild(R.firstChild);
    if (S.view === 'edit' && S.a) drawEdit(R); else drawList(R);
    if (S.view === 'edit') window.scrollTo(0, y);
  }
  window.addEventListener('beforeunload', function (e) { if (S.dirty && S.view === 'edit') { e.preventDefault(); e.returnValue = ''; } });
  window.openAppraisals = function () { if (S.view === 'edit' && S.a) { draw(); return; } load(); };
})();
