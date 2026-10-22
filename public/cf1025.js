/* Batch 187: 1025 Call Flow & Capacity. Admin page under Live Dashboard: how calls reach T1's queue (ext 1025),
   who sends them, the trend and why it moved, the RingCentral fix list and the Calls Wing roster against demand. */
(function () {
  'use strict';
  var root = null, S = { tab: 'summary', data: null, calls: null, busy: false, cmp: 'auto' };
  var charts = {};
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US'); }
  function p(v) { return v == null || v === '' ? '' : (Math.round(Number(v) * 10) / 10) + '%'; }
  function todayCT() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
  function addDays(d, k) { return new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem('cf1025_' + k); localStorage.setItem('cf1025_' + k, v); } catch (x) { return null; } }
  function api(url, opt) {
    opt = opt || {};
    return fetch(url, { method: opt.method || 'GET', credentials: 'include', headers: opt.raw ? { 'Content-Type': 'text/csv' } : (opt.body ? { 'Content-Type': 'application/json' } : {}), body: opt.raw || (opt.body ? JSON.stringify(opt.body) : undefined) })
      .then(function (r) { return r.json().catch(function () { return { success: false, error: 'HTTP ' + r.status }; }); })
      .then(function (j) { if (!j.success) throw new Error(j.error || 'Something went wrong'); return j; });
  }
  function toast(m) { if (typeof window.showToast === 'function') window.showToast(m, 'info', 3500); }
  var TABS = [['summary', 'Summary'], ['daywise', 'Daywise'], ['person', 'By Person'], ['team', 'By Team'], ['detail', 'Call Detail'], ['fix', 'RC Fix List'], ['compare', 'Last 5 Days'], ['why', 'Why Analysis'], ['roster', 'Calls Roster'], ['settings', 'Settings']];
  var MK = [['fwd', 'Auto-forwarded'], ['decl', 'Declined or offline'], ['ring', 'Rang out'], ['xfer', 'Answered then transferred']];

  function q() {
    var o = { from: root.querySelector('#cf-from').value, to: root.querySelector('#cf-to').value, weekdays: root.querySelector('#cf-wd').checked ? '1' : '0' };
    if (S.cmp === 'custom') ['aFrom', 'aTo', 'bFrom', 'bTo'].forEach(function (k) { o[k] = root.querySelector('#cf-' + k).value; });
    return o;
  }
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k]; }).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }

  function shell() {
    var to = ls('to') || todayCT(), from = ls('from') || addDays(to, -29);
    root.innerHTML = '<div class="cf">' +
      '<div class="cf-head"><div><h2>1025 Call Flow &amp; Capacity</h2><p class="cf-sub">How calls reach T1 Customer Service (ext 1025): straight from the IVR, or sent by a person or another queue. Who to fix in RingCentral, why volume moved, and the Calls Wing roster against hourly demand. Times are US Central, with IST.</p></div></div>' +
      '<div class="cf-bar" role="group" aria-label="Filters">' +
        '<label class="cf-f">From<input type="date" id="cf-from" value="' + from + '"></label><label class="cf-f">To<input type="date" id="cf-to" value="' + to + '"></label>' +
        '<label class="cf-tog"><input type="checkbox" id="cf-wd"' + (ls('wd') === '1' ? ' checked' : '') + '> Mon to Fri only</label>' +
        '<label class="cf-f">Compare<select id="cf-cmp"><option value="auto">Last 5 business days vs the 5 before</option><option value="custom">Custom windows</option></select></label>' +
        '<span id="cf-cmpx" style="display:none;gap:8px;flex-wrap:wrap"><label class="cf-f">A from<input type="date" id="cf-aFrom"></label><label class="cf-f">A to<input type="date" id="cf-aTo"></label><label class="cf-f">B from<input type="date" id="cf-bFrom"></label><label class="cf-f">B to<input type="date" id="cf-bTo"></label></span>' +
        '<button class="cf-btn pri" id="cf-go" type="button">Refresh</button>' +
        '<span style="flex:1"></span>' +
        '<label class="cf-btn" for="cf-file" title="RingCentral admin: Call Log, detailed export (CSV)">Upload CSV</label><input type="file" id="cf-file" accept=".csv,text/csv" class="cf-vh">' +
        '<select class="cf-in" id="cf-synch" aria-label="How far back to read RingCentral"><option value="2">Last 2 hours</option><option value="24">Last 24 hours</option><option value="72">Last 3 days</option><option value="168">Last 7 days</option></select>' +
        '<button class="cf-btn" id="cf-sync" type="button">Sync from RingCentral</button><button class="cf-btn" id="cf-kb" type="button" title="Team mapping and T1 tickets">Refresh AditKB</button><button class="cf-btn" id="cf-xls" type="button">Export to Excel</button>' +
      '</div><div id="cf-msg"></div><div class="cf-tabs" role="tablist" aria-label="Sections">' +
      TABS.map(function (t) { return '<button class="cf-tab" role="tab" type="button" data-t="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') +
      '</div><div id="cf-body" role="tabpanel"></div></div>';
    root.querySelector('#cf-go').onclick = load;
    root.querySelector('#cf-wd').onchange = load;
    root.querySelector('#cf-cmp').onchange = function () { S.cmp = this.value; root.querySelector('#cf-cmpx').style.display = S.cmp === 'custom' ? 'inline-flex' : 'none'; };
    root.querySelectorAll('.cf-tab').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.t; ls('tab', S.tab); root.querySelectorAll('.cf-tab').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); paint(); }; });
    root.querySelector('#cf-file').onchange = upload;
    root.querySelector('#cf-sync').onclick = function () { var b = this; b.disabled = true; msg('Reading the RingCentral call log...'); api('/api/cf1025/sync', { method: 'POST', body: { hours: Number(root.querySelector('#cf-synch').value) } }).then(function (r) { msg('RingCentral: ' + n(r.records) + ' calls read, ' + n(r.reach1025) + ' reached 1025.', 'ok'); load(); }).catch(function (x) { msg(x.message, 'bad'); }).finally(function () { b.disabled = false; }); };
    root.querySelector('#cf-kb').onclick = function () { var b = this; b.disabled = true; msg('Refreshing team mapping and T1 tickets from AditKB...'); api('/api/cf1025/aditkb', { method: 'POST', body: {} }).then(function (r) { msg('AditKB: ' + (r.users != null ? n(r.users) + ' users' : 'users not refreshed (' + e(r.usersError) + '), kept the last copy') + '; ' + (r.tickets != null ? n(r.tickets) + ' T1 tickets' : 'tickets not refreshed (' + e(r.ticketsError) + ')') + '.', r.usersError || r.ticketsError ? 'warn' : 'ok'); load(); }).catch(function (x) { msg(x.message, 'bad'); }).finally(function () { b.disabled = false; }); };
    root.querySelector('#cf-xls').onclick = function () { window.location.href = '/api/cf1025/export.xlsx?' + qs(q()); };
  }
  function msg(t, kind) { var m = root.querySelector('#cf-msg'); m.innerHTML = t ? '<div class="cf-note ' + (kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : '') + '" role="status">' + t + '</div>' : ''; }
  function upload() {
    var f = this.files && this.files[0]; if (!f) return;
    msg('Reading ' + e(f.name) + ' (' + Math.round(f.size / 1048576) + ' MB)...');
    f.text().then(function (txt) { return api('/api/cf1025/upload?name=' + encodeURIComponent(f.name), { method: 'POST', raw: txt }); })
      .then(function (r) {
        var t = e(f.name) + ': ' + n(r.rows) + ' rows, ' + n(r.dupRows) + ' duplicate rows removed (' + n(r.dupSessions) + ' sessions), ' + n(r.uniqueSessions) + ' sessions, <b>' + n(r.reach1025) + '</b> reached 1025 (' + e(r.from) + ' to ' + e(r.to) + ').';
        if (r.ext1025Only) t += ' This file looks like the 1025 extension view: it has no path before 1025, so every call shows as Direct. Upload the company-wide Call Log export (detailed) to see how calls arrived.';
        msg(t, r.ext1025Only ? 'warn' : 'ok');
        if (r.from && r.to) { root.querySelector('#cf-from').value = r.from; root.querySelector('#cf-to').value = r.to; }
        load();
      }).catch(function (x) { msg(x.message, 'bad'); });
    this.value = '';
  }
  function load() {
    var o = q(); ls('from', o.from); ls('to', o.to); ls('wd', o.weekdays);
    var body = root.querySelector('#cf-body'); body.innerHTML = '<p class="muted">Loading...</p>';
    S.calls = null;
    return api('/api/cf1025/data?' + qs(o)).then(function (j) { S.data = j; paint(); }).catch(function (x) { body.innerHTML = '<div class="cf-note bad">' + e(x.message) + '</div>'; });
  }

  // ── table helper: sortable, optional filter ──
  function table(cols, rows, o) {
    o = o || {}; var id = 'cft' + Math.random().toString(36).slice(2, 8);
    var state = { k: o.sort || null, d: -1, f: '' };
    var wrap = document.createElement('div');
    function render() {
      var list = rows.slice();
      if (state.f) { var f = state.f.toLowerCase(); list = list.filter(function (r) { return cols.some(function (c) { var v = c.v ? c.v(r) : r[c.k]; return String(v == null ? '' : v).toLowerCase().indexOf(f) >= 0; }); }); }
      if (state.k != null) { var c = cols[state.k]; list.sort(function (a, b) { var x = c.v ? c.v(a) : a[c.k], y = c.v ? c.v(b) : b[c.k]; if (typeof x === 'number' || typeof y === 'number') return ((x || 0) - (y || 0)) * state.d; return String(x || '').localeCompare(String(y || '')) * state.d; }); }
      var h = (o.filter ? '<div class="cf-filter"><input class="cf-in" type="search" placeholder="Filter" aria-label="Filter rows" value="' + e(state.f) + '" style="min-width:240px"><span class="muted" style="align-self:center;font-size:12px">' + n(list.length) + ' rows</span></div>' : '') +
        '<div class="cf-tw' + (o.tall ? ' tall' : '') + '"><table id="' + id + '"><thead><tr>' + cols.map(function (c, i) { return '<th class="s' + (c.n ? ' n' : '') + '" data-i="' + i + '" scope="col" aria-sort="' + (state.k === i ? (state.d > 0 ? 'ascending' : 'descending') : 'none') + '">' + e(c.h) + (state.k === i ? (state.d > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        list.slice(0, o.max || 5000).map(function (r) { return '<tr class="' + (o.rowCls ? o.rowCls(r) : '') + '">' + cols.map(function (c) { var v = c.v ? c.v(r) : r[c.k]; var cls = (c.n ? 'n ' : '') + (c.cls ? c.cls(r, v) : ''); return '<td class="' + cls + '">' + (c.html ? c.html(r, v) : c.p ? p(v) : c.n ? n(v) : e(v)) + '</td>'; }).join('') + '</tr>'; }).join('') +
        (o.foot ? '<tr class="tot">' + o.foot.map(function (v, i) { return '<td class="' + (cols[i] && cols[i].n ? 'n' : '') + '">' + (cols[i] && cols[i].p ? p(v) : cols[i] && cols[i].n ? n(v) : e(v)) + '</td>'; }).join('') + '</tr>' : '') + '</tbody></table></div>';
      wrap.innerHTML = h;
      wrap.querySelectorAll('th.s').forEach(function (th) { th.onclick = function () { var i = Number(th.dataset.i); if (state.k === i) state.d = -state.d; else { state.k = i; state.d = cols[i].n ? -1 : 1; } render(); }; });
      var inp = wrap.querySelector('input[type=search]'); if (inp) inp.oninput = function () { state.f = inp.value; var pos = inp.selectionStart; render(); var i2 = wrap.querySelector('input[type=search]'); i2.focus(); i2.setSelectionRange(pos, pos); };
    }
    render();
    return wrap;
  }
  function card(title, kid, sub) { var c = document.createElement('section'); c.className = 'cf-card'; c.innerHTML = (title ? '<h3>' + e(title) + '</h3>' : '') + (sub ? '<p class="cf-sub" style="margin:-4px 0 10px">' + sub + '</p>' : ''); if (kid) c.appendChild(kid); return c; }
  function html(s) { var d = document.createElement('div'); d.innerHTML = s; return d; }
  function chart(id, cfg) { if (!window.Chart) return; if (charts[id]) { charts[id].destroy(); } var cv = root.querySelector('#' + id); if (cv) charts[id] = new window.Chart(cv, cfg); }

  function paint() {
    var d = S.data, body = root.querySelector('#cf-body'); if (!d) return;
    Object.keys(charts).forEach(function (k) { try { charts[k].destroy(); } catch (x) {} delete charts[k]; });
    body.innerHTML = '';
    var top = '';
    if (!d.total) top += '<div class="cf-note warn">No calls to 1025 stored for this range yet. Upload the RingCentral Call Log export (detailed) or press Sync from RingCentral.</div>';
    if (d.lastSync) top += '<p class="cf-sub" style="margin:0 0 8px">Last RingCentral sync ' + e(new Date(d.lastSync.at).toLocaleString()) + ' (' + n(d.lastSync.stored) + ' calls stored). Team mapping: ' + n(d.config.extMapCount) + ' extensions' + (d.config.extMapAt ? ', updated ' + e(String(d.config.extMapAt).slice(0, 10)) : '') + '.</p>';
    if (top) body.appendChild(html(top));
    ({ summary: vSummary, daywise: vDay, person: vPerson, team: vTeam, detail: vDetail, fix: vFix, compare: vCompare, why: vWhy, roster: vRoster, settings: vSettings }[S.tab] || vSummary)(body, d);
  }

  function vSummary(b, d) {
    var per = d.byPath.find(function (x) { return x.key === 'person'; }) || {};
    var miss = d.byPath.reduce(function (s, x) { return s + x.missedVm; }, 0);
    b.appendChild(html('<div class="cf-kpis">' + [['Calls reaching 1025', n(d.total), d.range.days + ' days'], ['Via a person', n(per.calls), p(per.share) + ' of all'], ['Missed or voicemail at 1025', n(miss), p(d.total ? miss / d.total * 100 : 0)], ['Sent back through the main IVR', n(d.viaMainIvr), 'via-person calls'], ['People sending calls', n(d.byPerson.length), d.fixList.filter(function (f) { return f.priority === 'High'; }).length + ' high priority']].map(function (k) { return '<div class="cf-kpi"><span>' + k[0] + '</span><b>' + k[1] + '</b><em>' + k[2] + '</em></div>'; }).join('') + '</div>'));
    b.appendChild(card('1025 calls by path', table([{ h: 'Path', k: 'label' }, { h: 'Calls', k: 'calls', n: 1 }, { h: 'Share', k: 'share', n: 1, p: 1 }, { h: 'Missed or voicemail', k: 'missedVm', n: 1 }, { h: 'Miss rate', k: 'missRate', n: 1, p: 1 }], d.byPath, { foot: ['Total', d.total, 100, miss, d.total ? Math.round(miss / d.total * 1000) / 10 : 0] })));
    var pk = Object.keys(d.paths);
    b.appendChild(card('Weekly trend', table([{ h: 'Week of (Mon)', k: 'week' }, { h: 'Business days', k: 'bizDays', n: 1 }, { h: 'Total', k: 'total', n: 1 }].concat(pk.map(function (k) { return { h: d.paths[k], k: k, n: 1 }; })).concat([{ h: 'Via person per business day', k: 'viaPersonPerBizDay', n: 1 }, { h: 'Via person share', k: 'viaPersonShare', n: 1, p: 1 }]), d.weekly)));
    var g = document.createElement('div'); g.className = 'cf-grid2';
    g.appendChild(card('How calls came via a person', table([{ h: 'Mechanism', k: 'label' }, { h: 'Calls', k: 'calls', n: 1 }, { h: 'Share', k: 'share', n: 1, p: 1 }], d.mechanisms, { foot: ['Total via a person', d.viaPerson, 100] }), 'Sent back through the main IVR: ' + n(d.viaMainIvr) + '.'));
    g.appendChild(card('Definitions', html('<ul class="cf-list"><li><b>Straight from IVR</b>: the caller chose Customer Service in the IVR (1001 then 1009 then 1025).</li><li><b>Via a person</b>: the call rang a person first (CSM, OB, VoIP, Sales...) and their settings sent it to 1025.</li><li><b>Rolled over from a queue</b>: the VoIP queue (1501/1502) or Sales queue (1004) overflowed to 1025.</li><li><b>Direct</b>: the call reached 1025 with no earlier leg.</li><li><b>Auto-forwarded</b>: the person\'s phone accepted and forwarded at once (forward rule or Do Not Disturb). <b>Rang out</b>: it rang about 30 seconds, nobody answered. <b>Declined or offline</b>: declined, or the phone or app was offline. <b>Answered then transferred</b>: the person picked up and sent the call to CS.</li></ul>')));
    b.appendChild(g);
  }
  function vDay(b, d) {
    b.appendChild(card('Calls by day', html('<div class="cf-chart"><canvas id="cf-c-day" aria-label="Stacked bar chart of 1025 calls per day by path" role="img"></canvas></div>')));
    var cols = [{ h: 'Date', k: 'date' }, { h: 'Straight from IVR', k: 'ivr', n: 1 }].concat(d.groups.map(function (g) { return { h: 'Via ' + g, k: 'via_' + g, n: 1 }; })).concat([{ h: 'Via a person total', k: 'viaPerson', n: 1 }, { h: 'VoIP queue (1501)', k: 'voipq', n: 1 }, { h: 'Sales queue (1004)', k: 'salesq', n: 1 }, { h: 'Other system', k: 'othersys', n: 1 }, { h: 'Direct', k: 'direct', n: 1 }, { h: 'Total', k: 'total', n: 1 }, { h: 'Missed or VM', k: 'missedVm', n: 1 }, { h: 'Via person share', k: 'viaPersonShare', n: 1, p: 1 }]);
    b.appendChild(card('Daywise', table(cols, d.daywise, { rowCls: function (r) { return r.weekend ? 'wk' : ''; }, tall: 1 }), 'Weekends are greyed out.'));
    var C = ['#21AAE0', '#F4891F', '#7C5CC4', '#D9464D', '#16A970', '#C98F06', '#2F6FD6', '#9BAFC0'];
    chart('cf-c-day', { type: 'bar', data: { labels: d.daywise.map(function (x) { return x.date.slice(5); }), datasets: [{ label: 'Straight from IVR', data: d.daywise.map(function (x) { return x.ivr; }), backgroundColor: C[0] }, { label: 'Via a person', data: d.daywise.map(function (x) { return x.viaPerson; }), backgroundColor: C[1] }, { label: 'VoIP queue', data: d.daywise.map(function (x) { return x.voipq; }), backgroundColor: C[2] }, { label: 'Sales queue', data: d.daywise.map(function (x) { return x.salesq; }), backgroundColor: C[5] }, { label: 'Direct or other', data: d.daywise.map(function (x) { return x.direct + x.othersys; }), backgroundColor: C[7] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } } } });
  }
  function vPerson(b, d) {
    var cols = [{ h: 'Ext', k: 'ext' }, { h: 'Name', k: 'name' }, { h: 'Team', k: 'team' }, { h: 'RC department', k: 'rc_department' }, { h: 'Total', k: 'total', n: 1 }].concat(MK.map(function (m) { return { h: m[1], v: function (r) { return r.mech[m[0]] || 0; }, n: 1 }; }))
      .concat([{ h: 'Via main IVR', k: 'viaMainIvr', n: 1 }]).concat(d.weekKeys.map(function (w) { return { h: 'Wk ' + w.slice(5), v: function (r) { return r.weeks[w] || 0; }, n: 1 }; }))
      .concat([{ h: 'Missed or VM at 1025', k: 'missedVm', n: 1 }, { h: 'First seen', v: function (r) { return String(r.first).slice(0, 10); } }, { h: 'Last seen', v: function (r) { return String(r.last).slice(0, 10); } }]);
    b.appendChild(card('People sending calls to 1025', table(cols, d.byPerson, { filter: 1, sort: 4, tall: 1 })));
  }
  function vTeam(b, d) {
    var cols = [{ h: 'Team', k: 'team' }, { h: 'Group', k: 'group' }, { h: 'People', k: 'people', n: 1 }, { h: 'Total', k: 'total', n: 1 }].concat(MK.map(function (m) { return { h: m[1], v: function (r) { return r.mech[m[0]] || 0; }, n: 1 }; }))
      .concat([{ h: 'Via main IVR', k: 'viaMainIvr', n: 1 }, { h: 'Missed or VM at 1025', k: 'missedVm', n: 1 }]).concat(d.weekKeys.map(function (w) { return { h: 'Wk ' + w.slice(5), v: function (r) { return r.weeks[w] || 0; }, n: 1 }; }));
    b.appendChild(card('By team', table(cols, d.byTeam, { sort: 3 })));
    b.appendChild(card('Queue rollovers', table([{ h: 'Ext', k: 'ext' }, { h: 'Queue', k: 'name' }, { h: 'Calls', k: 'calls', n: 1 }, { h: 'Missed or VM at 1025', k: 'missedVm', n: 1 }], d.queues)));
  }
  function vDetail(b, d) {
    var holder = document.createElement('div'); b.appendChild(holder);
    function draw() {
      var c = S.calls || [];
      var cols = [{ h: 'Start (Central)', v: function (r) { return new Date(r.call_start_utc).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } }, { h: 'Caller number', k: 'caller_number' }, { h: 'Caller', k: 'caller_name' }, { h: 'Dialed', k: 'number_dialed' },
        { h: 'Path', k: 'pathLabel' }, { h: 'How', k: 'mechLabel' }, { h: 'Main IVR again', v: function (r) { return r.via_main_ivr ? 'Yes' : ''; } }, { h: 'From', v: function (r) { return r.origin_ext ? r.origin_ext + ' ' + (r.origin_name || '') : ''; } }, { h: 'Team', k: 'teamShort' },
        { h: 'Result at 1025', k: 'result' }, { h: 'Secs at 1025', k: 'duration_1025_sec', n: 1 }, { h: 'Answered by', k: 'answered_by' }, { h: 'Talk secs', k: 'talk_sec', n: 1 }, { h: 'Full path', k: 'full_path' }];
      holder.innerHTML = ''; holder.appendChild(card('Every 1025 call (' + n(c.length) + ')', table(cols, c, { filter: 1, tall: 1, max: 4000 }), 'Caller numbers are shown to admins only. Search any column.'));
    }
    if (S.calls) return draw();
    holder.innerHTML = '<p class="muted">Loading calls...</p>';
    api('/api/cf1025/calls?' + qs(q())).then(function (j) { S.calls = j.calls; draw(); }).catch(function (x) { holder.innerHTML = '<div class="cf-note bad">' + e(x.message) + '</div>'; });
  }
  function vFix(b, d) {
    var wrap = document.createElement('div');
    var rows = d.fixList.map(function (f) {
      return '<tr><td><span class="pr ' + f.priority + '">' + f.priority + '</span></td><td>' + e(f.ext) + '</td><td>' + e(f.name) + '<div class="muted" style="font-size:11.5px">' + e(f.team) + (f.rc_department ? ' · ' + e(f.rc_department) : '') + '</div></td><td class="n">' + n(f.last5) + '</td><td class="n">' + n(f.total) + '</td>' +
        '<td style="font-size:12px">' + MK.filter(function (m) { return f.mech[m[0]]; }).map(function (m) { return m[1] + ' ' + f.mech[m[0]]; }).join('<br>') + (f.viaMainIvr ? '<br>Via main IVR ' + f.viaMainIvr : '') + '</td><td style="min-width:300px;font-size:12px">' + e(f.change) + '</td>' +
        '<td><input type="checkbox" data-x="done" data-ext="' + e(f.ext) + '"' + (f.done ? ' checked' : '') + ' aria-label="Fixed for ' + e(f.name) + '"></td><td><input class="cf-in" type="date" data-x="date" data-ext="' + e(f.ext) + '" value="' + e(f.dateFixed) + '" aria-label="Date fixed"></td>' +
        '<td class="n">' + (f.sinceFix == null ? '' : '<span title="Calls from this extension to 1025 since the fix date">' + n(f.sinceFix) + '</span>') + '</td><td><input class="cf-in" data-x="notes" data-ext="' + e(f.ext) + '" value="' + e(f.notes) + '" maxlength="500" aria-label="Notes" style="min-width:160px"></td></tr>';
    }).join('');
    wrap.innerHTML = '<div class="cf-tw tall"><table><thead><tr><th>Priority</th><th>Ext</th><th>Person</th><th class="n">Last 5 bus. days</th><th class="n">In range</th><th>How</th><th>What to change in RingCentral</th><th>Done</th><th>Date fixed</th><th class="n">Calls since fix</th><th>Notes</th></tr></thead><tbody>' + (rows || '<tr><td colspan="11" class="muted">Nobody sent calls to 1025 in this range.</td></tr>') + '</tbody></table></div>';
    function save(ext) {
      var get = function (x) { return wrap.querySelector('[data-x="' + x + '"][data-ext="' + ext + '"]'); };
      api('/api/cf1025/fix', { method: 'POST', body: { ext: ext, done: get('done').checked, dateFixed: get('date').value, notes: get('notes').value } }).then(function () { toast('Saved'); var f = d.fixList.find(function (x) { return x.ext === ext; }); if (f) { f.done = get('done').checked; f.dateFixed = get('date').value; f.notes = get('notes').value; } }).catch(function (x) { toast(x.message); });
    }
    wrap.querySelectorAll('[data-x]').forEach(function (el) { el.addEventListener('change', function () { if (el.dataset.x === 'done' && el.checked) { var dt = wrap.querySelector('[data-x="date"][data-ext="' + el.dataset.ext + '"]'); if (!dt.value) dt.value = todayCT(); } save(el.dataset.ext); }); });
    b.appendChild(card('RC Fix List', wrap, 'High: 5 or more in the last 5 business days, or 10 or more in the range. Medium: at least 1 in the last 5 business days. After you set a fix date, Calls since fix shows whether the change worked.'));
    b.appendChild(card('Queues', table([{ h: 'Priority', k: 'priority', html: function (r) { return '<span class="pr ' + r.priority + '">' + r.priority + '</span>'; } }, { h: 'Ext', k: 'ext' }, { h: 'Queue', k: 'name' }, { h: 'Calls', k: 'calls', n: 1 }, { h: 'What to change', k: 'change' }], d.fixQueues)));
  }
  function vCompare(b, d) {
    var c = d.compare, A = c.a, B = c.b;
    var M = [['Total', 'total'], ['Straight from IVR', 'ivr'], ['Via a person', 'person']].concat(d.groups.map(function (g) { return ['  Via ' + g, 'via_' + g]; })).concat([['VoIP queue (1501)', 'voipq'], ['Sales queue (1004)', 'salesq'], ['Direct', 'direct'], ['Answered', 'answered'], ['Missed', 'missed'], ['Voicemail at 1025', 'voicemail'], ['Missed plus voicemail rate', 'missRate', 1], ['Unique callers', 'unique'], ['Same-day repeat calls', 'sameDay'], ['Repeats after a missed or VM call', 'afterMissVm'], ['T1 tickets created', 'tickets']]);
    var rows = M.map(function (m) { var x = A[m[1]] || 0, y = B[m[1]] || 0; return { m: m[0], a: x, b: y, ch: Math.round((y - x) * 10) / 10, pc: x && !m[2] ? Math.round((y - x) / x * 1000) / 10 : null, rate: m[2] }; });
    var good = { answered: 1, unique: 0 };
    b.appendChild(card('Window A ' + c.A.from + ' to ' + c.A.to + ' vs window B ' + c.B.from + ' to ' + c.B.to, table([{ h: 'Metric', k: 'm' }, { h: 'A', k: 'a', n: 1, html: function (r) { return r.rate ? p(r.a) : n(r.a); } }, { h: 'B', k: 'b', n: 1, html: function (r) { return r.rate ? p(r.b) : n(r.b); } }, { h: 'Change', k: 'ch', n: 1, html: function (r) { return (r.ch > 0 ? '+' : '') + (r.rate ? r.ch + ' pts' : n(r.ch)); }, cls: function (r) { return r.ch > 0 ? (r.m === 'Answered' ? 'down' : 'up') : r.ch < 0 ? (r.m === 'Answered' ? 'up' : 'down') : ''; } }, { h: 'Change %', k: 'pc', n: 1, html: function (r) { return r.pc == null ? '' : (r.pc > 0 ? '+' : '') + r.pc + '%'; } }], rows)));
    b.appendChild(card('Daily trend', html('<div class="cf-chart"><canvas id="cf-c-tr" role="img" aria-label="Line chart of daily 1025 calls"></canvas></div>')));
    b.appendChild(card(null, table([{ h: 'Date', k: 'date' }, { h: 'Total', k: 'total', n: 1 }, { h: 'IVR', k: 'ivr', n: 1 }, { h: 'Via person', k: 'viaPerson', n: 1 }, { h: 'Tech CSM', k: 'techCsm', n: 1 }, { h: 'Tech OB', k: 'techOb', n: 1 }, { h: 'VoIP queue', k: 'voipq', n: 1 }, { h: 'Missed or VM', k: 'missedVm', n: 1 }, { h: 'T1 tickets', k: 'tickets', n: 1 }], c.trend)));
    var L = c.trend, C = ['#072B40', '#21AAE0', '#F4891F', '#7C5CC4', '#C98F06', '#2F6FD6', '#D9464D', '#16A970'];
    var ser = [['Total', 'total'], ['IVR', 'ivr'], ['Via person', 'viaPerson'], ['Tech CSM', 'techCsm'], ['Tech OB', 'techOb'], ['VoIP queue', 'voipq'], ['Missed or VM', 'missedVm'], ['T1 tickets', 'tickets']];
    chart('cf-c-tr', { type: 'line', data: { labels: L.map(function (x) { return x.date.slice(5); }), datasets: ser.map(function (s, i) { return { label: s[0], data: L.map(function (x) { return x[s[1]]; }), borderColor: C[i], backgroundColor: C[i], borderWidth: 2, pointRadius: 3, tension: 0.2 }; }) }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } });
  }
  function vWhy(b, d) {
    var w = d.why;
    var s = card('What changed', html('<ul class="cf-list">' + w.summary.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul><div style="margin-top:10px"><button class="cf-btn" id="cf-nar" type="button">Generate narrative</button> <span class="muted" style="font-size:12px">Sends only the computed tables to the AI, never caller data.</span></div><div id="cf-nar-out" class="cf-note" style="display:none;margin-top:10px"></div>'));
    b.appendChild(s);
    s.querySelector('#cf-nar').onclick = function () { var bt = this, out = s.querySelector('#cf-nar-out'); bt.disabled = true; out.style.display = 'block'; out.textContent = 'Writing...'; api('/api/cf1025/narrative', { method: 'POST', body: q() }).then(function (j) { out.textContent = j.text; }).catch(function (x) { out.textContent = x.message; }).finally(function () { bt.disabled = false; }); };
    b.appendChild(card('T1 ticket topics', table([{ h: 'Topic', k: 'topic' }, { h: 'Earlier', k: 'earlier', n: 1 }, { h: 'Prior window (A)', k: 'prior', n: 1 }, { h: 'Last window (B)', k: 'last', n: 1 }, { h: 'Change', k: 'change', n: 1, cls: function (r) { return r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''; } }, { h: 'Change %', k: 'changePct', n: 1, html: function (r) { return r.changePct == null ? '' : (r.changePct > 0 ? '+' : '') + r.changePct + '%'; } }], w.topics),
      'Tickets created by the Calls Wing (Zoho IDs in Settings), from AditKB' + (w.ticketsAt ? ', refreshed ' + e(String(w.ticketsAt).slice(0, 16).replace('T', ' ')) + ' UTC' : ', not loaded yet: press Refresh AditKB') + '. Topics come from the subject and AI categories (the description only when nothing else matches).'));
    b.appendChild(card('Spotlight issues per day', table([{ h: 'Date', k: 'date' }].concat(w.spotNames.map(function (nm) { return { h: nm, k: nm, n: 1 }; })), w.spotDays)));
    b.appendChild(card('Data limits', html('<ul class="cf-list">' + d.limits.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>')));
  }
  function vRoster(b, d) {
    var r = d.roster, P = d.params;
    if (r.warnings.length) b.appendChild(card('Warnings', html(r.warnings.map(function (w) { return '<div class="badge" role="note">⚠ ' + e(w.text) + '</div>'; }).join(''))));
    var head = '<tr><th scope="col">Hour (Central)</th>' + r.hourLabels.map(function (h) { return '<th class="n" scope="col">' + h + '</th>'; }).join('') + '<th class="n">Short</th></tr>';
    var line = function (label, arr, cls, extra) { return '<tr><th scope="row" style="position:static">' + label + '</th>' + arr.map(function (v) { return '<td class="n ' + (cls ? cls(v) : '') + '">' + (v > 0 && cls ? '+' : '') + v + '</td>'; }).join('') + '<td class="n">' + (extra == null ? '' : extra) + '</td></tr>'; };
    var gc = function (v) { return v < 0 ? 'neg' : v > 0 ? 'pos' : ''; };
    b.appendChild(card('Demand vs roster (weekdays)', html('<div class="cf-tw"><table><thead>' + head + '</thead><tbody>' +
      '<tr><th scope="row" style="position:static">IST</th>' + r.istLabels.map(function (x) { return '<td class="n muted">' + x + '</td>'; }).join('') + '<td></td></tr>' +
      line('Avg weekday calls', r.demand) + line('Busy-day calls (x' + P.busyMult + ')', r.busyDemand) + line('Agents needed (Erlang C)', r.need) +
      line('On floor, current', r.current) + line('Gap, current', r.gapCurrent, gc, r.shortCurrent) + line('On floor, proposed', r.proposed) + line('Gap, proposed', r.gapProposed, gc, r.shortProposed) +
      '</tbody></table></div>'), 'Average talk ' + Math.round(r.talkSec) + 's (' + (Math.round(r.talkSec / 6) / 10) + ' min) + ' + P.wrapMin + ' min wrap-up = AHT ' + r.ahtSec + 's. Target ' + Math.round(P.sl * 100) + '% answered in ' + P.answerSec + 's, occupancy at most ' + Math.round(P.maxOcc * 100) + '%. Demand from ' + r.weekdaysCounted + ' weekdays with calls. ' + e(r.dst.text)));
    var grid = function (title, g) { return card(title, html('<div class="cf-tw"><table><thead><tr><th>Agent</th>' + r.hourLabels.map(function (h) { return '<th class="n">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + g.map(function (a) { return '<tr><td>' + e(a.name) + '</td>' + a.cells.map(function (c) { return '<td class="' + (c === 'W' ? 'gW' : c === 'B' ? 'gB' : '') + '">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>')); };
    var g2 = document.createElement('div'); g2.className = 'cf-grid2'; g2.appendChild(grid('Day plan, current (W work, B break)', r.gridCurrent)); g2.appendChild(grid('Day plan, proposed', r.gridProposed)); b.appendChild(g2);
    b.appendChild(card('Weekly roster, Mon to Fri (' + r.week.dates[0] + ' to ' + r.week.dates[4] + ')', table([{ h: 'Agent', k: 'name' }, { h: 'Shift (Central)', k: 'ct' }, { h: 'Break (Central)', k: 'breakCt' }, { h: 'IST until DST change', k: 'istUntil' }, { h: 'Break IST until', k: 'breakIstUntil' }, { h: 'IST after DST change' + (r.dst.change ? ' (' + r.dst.change + ')' : ''), k: 'istAfter' }, { h: 'Break IST after', k: 'breakIstAfter' }], r.week.rows)));
    b.appendChild(card('Running rules', html('<ul class="cf-list">' + r.rules.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>')));
    b.appendChild(html('<p class="cf-sub">Change shifts, breaks, the proposed scenario and the Erlang C parameters in Settings.</p>'));
  }
  function vSettings(b, d) {
    var C = d.config;
    var hrs = function (v) { return v == null ? '' : v; };
    var rosterRows = C.roster.map(function (a, i) { return '<tr data-i="' + i + '"><td><input class="cf-in" data-k="name" value="' + e(a.name) + '" aria-label="Name"></td><td><input class="cf-in" data-k="ext" value="' + e(a.ext) + '" style="width:70px" aria-label="RC extension"></td><td><input class="cf-in" data-k="zoho_id" value="' + e(a.zoho_id) + '" style="width:170px" aria-label="Zoho agent ID">' + (a.verify ? ' <span class="pr Medium" title="Inferred, please verify">verify</span>' : '') + '</td>' +
      '<td><select class="cf-in" data-k="wing"><option' + (a.wing !== 'Chat' ? ' selected' : '') + '>Calls</option><option' + (a.wing === 'Chat' ? ' selected' : '') + '>Chat</option></select></td>' +
      ['start_h', 'len_h', 'break_h', 'prop_start_h', 'prop_break_h'].map(function (k) { return '<td><input class="cf-in" type="number" step="0.5" min="0" max="23.5" data-k="' + k + '" value="' + hrs(a[k]) + '" style="width:72px" aria-label="' + k + '"></td>'; }).join('') +
      '<td><input type="checkbox" data-k="active"' + (a.active ? ' checked' : '') + ' aria-label="Active"></td><td><button class="cf-btn" type="button" data-del="' + i + '" aria-label="Remove">✕</button></td></tr>'; }).join('');
    var w = html(
      '<section class="cf-card"><h3>Calls Wing roster</h3><p class="cf-sub" style="margin:-4px 0 10px">Hours are Central, 24-hour (7 = 7 AM, 13.5 = 1:30 PM). Shift length 9 = 8 hours on the floor + 1 hour break. IST is worked out for each date, so the US daylight saving change is handled.</p>' +
      '<div class="cf-tw"><table id="cf-ros"><thead><tr><th>Name</th><th>RC ext</th><th>Zoho agent ID</th><th>Wing</th><th>Start</th><th>Length</th><th>Break</th><th>Proposed start</th><th>Proposed break</th><th>Active</th><th></th></tr></thead><tbody>' + rosterRows + '</tbody></table></div><div style="margin-top:8px"><button class="cf-btn" type="button" id="cf-add">Add agent</button></div></section>' +
      '<section class="cf-card"><h3>Erlang C and hours</h3><div class="cf-bar" style="margin:0">' + [['wrapMin', 'Wrap-up minutes'], ['sl', 'Service level (0 to 1)'], ['answerSec', 'Answer time (seconds)'], ['maxOcc', 'Max occupancy (0 to 1)'], ['busyMult', 'Busy-day multiplier'], ['hourFrom', 'First hour (Central)'], ['hourTo', 'Last hour (Central)']].map(function (x) { return '<label class="cf-f">' + x[1] + '<input type="number" step="any" data-p="' + x[0] + '" value="' + e(d.params[x[0]]) + '" style="width:120px"></label>'; }).join('') + '</div></section>' +
      '<section class="cf-card"><h3>Daily digest and alert (Google Chat, Adit Agent Monitor app)</h3><div class="cf-bar" style="margin:0"><label class="cf-tog"><input type="checkbox" id="cf-dg-on"' + (C.digest.on ? ' checked' : '') + '> Daily digest</label><label class="cf-f">Send to<input id="cf-dg-em" value="' + e(C.digest.email) + '" style="width:220px"></label><label class="cf-f">Hour (Central)<input type="number" id="cf-dg-h" min="0" max="23" value="' + e(C.digest.hourCT) + '" style="width:80px"></label>' +
      '<label class="cf-tog"><input type="checkbox" id="cf-al-on"' + (C.alert.on ? ' checked' : '') + '> Alert when via-person calls pass</label><label class="cf-f">% of calls in 2 hours<input type="number" id="cf-al-p" value="' + e(C.alert.pct) + '" style="width:80px"></label><label class="cf-f">Minimum calls<input type="number" id="cf-al-m" value="' + e(C.alert.minCalls) + '" style="width:80px"></label><button class="cf-btn" type="button" id="cf-dg-pv">Preview digest</button></div><pre id="cf-dg-out" class="cf-note" style="display:none;white-space:pre-wrap;margin-top:10px"></pre></section>' +
      '<section class="cf-card"><h3>Team groups</h3><p class="cf-sub" style="margin:-4px 0 10px">One per line: AditKB team = group. Anything not listed is Others.</p><textarea class="cf-in" id="cf-groups" rows="10" style="width:100%;font-family:ui-monospace,monospace">' + e(d.config.groups.map(function (g) { return g[0] + ' = ' + g[1]; }).join('\n')) + '</textarea></section>' +
      '<section class="cf-card"><h3>Extension overrides</h3><p class="cf-sub" style="margin:-4px 0 10px">For extensions missing in AditKB. One per line: ext | name | team | RC department.</p><textarea class="cf-in" id="cf-ovr" rows="5" style="width:100%;font-family:ui-monospace,monospace">' + e(C.overrides.map(function (o) { return [o.ext, o.name || '', o.team || '', o.rc_department || ''].join(' | '); }).join('\n')) + '</textarea></section>' +
      '<section class="cf-card"><h3>System extensions</h3><input class="cf-in" id="cf-sys" value="' + e(C.system.join(', ')) + '" style="width:100%"><p class="cf-sub">IVR, queues and 1025. Person extensions are 4 digits starting with 3, 4, 5 or 6.</p></section>' +
      '<div><button class="cf-btn pri" type="button" id="cf-save">Save settings</button></div>');
    b.appendChild(w);
    w.querySelector('#cf-add').onclick = function () { var tb = w.querySelector('#cf-ros tbody'); var tr = document.createElement('tr'); tr.innerHTML = '<td><input class="cf-in" data-k="name" aria-label="Name"></td><td><input class="cf-in" data-k="ext" style="width:70px" aria-label="RC extension"></td><td><input class="cf-in" data-k="zoho_id" style="width:170px" aria-label="Zoho agent ID"></td><td><select class="cf-in" data-k="wing"><option>Calls</option><option>Chat</option></select></td>' + ['start_h', 'len_h', 'break_h', 'prop_start_h', 'prop_break_h'].map(function (k) { return '<td><input class="cf-in" type="number" step="0.5" data-k="' + k + '" value="' + (k === 'len_h' ? 9 : '') + '" style="width:72px" aria-label="' + k + '"></td>'; }).join('') + '<td><input type="checkbox" data-k="active" checked aria-label="Active"></td><td><button class="cf-btn" type="button" data-del="x" aria-label="Remove">✕</button></td>'; tb.appendChild(tr); };
    w.addEventListener('click', function (ev) { var t = ev.target.closest('[data-del]'); if (t) t.closest('tr').remove(); });
    w.querySelector('#cf-dg-pv').onclick = function () { var o = w.querySelector('#cf-dg-out'); o.style.display = 'block'; o.textContent = 'Building...'; api('/api/cf1025/digest-preview', { method: 'POST', body: {} }).then(function (j) { o.textContent = j.text; }).catch(function (x) { o.textContent = x.message; }); };
    w.querySelector('#cf-save').onclick = function () {
      var roster = Array.prototype.map.call(w.querySelectorAll('#cf-ros tbody tr'), function (tr) { var o = {}; tr.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; }); var old = C.roster[Number(tr.dataset.i)]; if (old && old.verify && old.zoho_id === o.zoho_id) o.verify = 1; return o; });
      var params = {}; w.querySelectorAll('[data-p]').forEach(function (el) { params[el.dataset.p] = el.value; });
      var groups = w.querySelector('#cf-groups').value.split('\n').map(function (l) { var i = l.lastIndexOf('='); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean);
      var overrides = w.querySelector('#cf-ovr').value.split('\n').map(function (l) { var x = l.split('|').map(function (s) { return s.trim(); }); return x[0] ? { ext: x[0], name: x[1], team: x[2], rc_department: x[3] } : null; }).filter(Boolean);
      var system = w.querySelector('#cf-sys').value.split(/[,\s]+/).filter(Boolean);
      api('/api/cf1025/config', { method: 'POST', body: { roster: roster, params: params, groups: groups, overrides: overrides, system: system, digest: { on: w.querySelector('#cf-dg-on').checked, email: w.querySelector('#cf-dg-em').value, hourCT: w.querySelector('#cf-dg-h').value }, alert: { on: w.querySelector('#cf-al-on').checked, pct: w.querySelector('#cf-al-p').value, minCalls: w.querySelector('#cf-al-m').value } } })
        .then(function () { toast('Settings saved'); load(); }).catch(function (x) { toast(x.message); });
    };
  }

  window.openCf1025 = function () {
    root = document.getElementById('cf1025-root'); if (!root) return;
    S.tab = ls('tab') || 'summary';
    if (!root.querySelector('.cf')) shell();
    load();
  };
})();
