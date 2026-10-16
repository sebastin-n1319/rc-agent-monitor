/* Batch 166: T1 CS bonus calculator (admin, under Bonus). Data: /api/bonus. */
(function () {
  'use strict';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var S = { type: 'quarter', value: '', data: null, busy: false, err: '', tab: 'summary', inMonth: '', open: {}, agents: null, saving: false, edits: {}, op: null };
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
  function api(path, body) {
    var o = { credentials: 'include', method: body ? 'POST' : 'GET' };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json(); });
  }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function rs(n) { return 'Rs. ' + Math.round(n || 0).toLocaleString('en-IN'); }
  function nowChi() { var p = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).split('-').map(Number); return { y: p[0], m: p[1] }; }
  function options(type) {
    var n = nowChi(), out = [], i, y, m;
    if (type === 'month') { for (i = 0; i < 18; i++) { y = n.y; m = n.m - i; while (m < 1) { m += 12; y--; } out.push([y + '-' + String(m).padStart(2, '0'), MON[m - 1] + ' ' + y]); } }
    else if (type === 'quarter') { var q = Math.ceil(n.m / 3); y = n.y; for (i = 0; i < 8; i++) { out.push(['Q' + q + '-' + y, 'Q' + q + ' ' + y + ' (' + MON[(q - 1) * 3] + '-' + MON[(q - 1) * 3 + 2] + ')']); q--; if (q < 1) { q = 4; y--; } } }
    else if (type === 'year') { for (i = 0; i < 3; i++) out.push([String(n.y - i), String(n.y - i)]); }
    else out.push(['MTD', 'Month to date']);
    return out;
  }
  function defaultValue(type) {
    var n = nowChi(), o = options(type);
    if (type === 'quarter') return n.m % 3 === 1 ? o[1][0] : o[0][0]; // first month of a quarter: show the one just finished
    if (type === 'month') return o[1] ? o[1][0] : o[0][0];
    return o[0][0];
  }
  function period() { return S.type === 'mtd' ? 'MTD' : S.value; }

  function load() {
    if (S.busy) return; S.busy = true; S.err = ''; draw();
    api('/api/bonus?period=' + encodeURIComponent(period())).then(function (j) {
      S.busy = false; if (!j.success) throw new Error(j.error || 'Could not load');
      S.data = j; S.edits = {};
      if (!S.inMonth || !j.months.some(function (m) { return m.key === S.inMonth; })) S.inMonth = j.months[j.months.length - 1].key;
      draw();
    }).catch(function (e) { S.busy = false; S.err = e.message; draw(); });
  }
  function loadAgents() { return api('/api/bonus/agents').then(function (j) { if (j.success) { S.agents = j.agents; draw(); } }); }

  function seg(opts, cur, fn, label) {
    return h('div', { class: 'bnc-seg', role: 'group', 'aria-label': label }, opts.map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': cur === o[0] ? 'true' : 'false', text: o[1], onclick: function () { fn(o[0]); } });
    }));
  }
  function tile(label, value, sub, cls) { return h('div', { class: 'bnc-tile ' + (cls || '') }, [h('span', { class: 'bnc-tile-l', text: label }), h('b', { class: 'bnc-tile-v', text: String(value) }), sub ? h('span', { class: 'bnc-tile-s', text: sub }) : null]); }
  function chip(slab, eligible) {
    if (!eligible || !slab) return h('span', { class: 'bnc-chip no', text: 'Not eligible' });
    return h('span', { class: 'bnc-chip ' + slab, text: slab === 's1' ? 'Slab 1' : 'Slab 2' });
  }

  function draw() {
    var root = document.getElementById('bnc-root'); if (!root) return;
    if (!S.value) S.value = defaultValue(S.type);
    var d = S.data;
    var head = h('div', { class: 'bnc-head' }, [
      h('div', null, [h('h2', { class: 'bnc-h1', text: 'Bonus calculator' }),
        h('p', { class: 'bnc-sub', text: 'T1 CS bonus by the 2026 structure. Calls, tickets, FCR and ticket CSAT come from the tool. On the Inputs tab, enter QA scores and attendance (attendance marked on the Roster is filled in for you) and upload the SalesIQ operator report for chats and chat ratings.' })]),
      h('div', { class: 'bnc-ctrl' }, [
        seg([['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['mtd', 'Month to date']], S.type, function (v) { S.type = v; S.value = defaultValue(v); load(); }, 'Period type'),
        S.type !== 'mtd' ? h('select', { class: 'bnc-sel', 'aria-label': 'Period', onchange: function (e) { S.value = e.target.value; load(); } },
          options(S.type).map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === S.value) op.selected = true; return op; })) : null,
        h('button', { type: 'button', class: 'bnc-btn', text: S.busy ? 'Loading...' : 'Refresh', disabled: S.busy, onclick: load }),
        h('a', { class: 'bnc-btn primary', href: '/api/bonus/export?kind=calc&period=' + encodeURIComponent(period()), text: 'Download calculation' }),
        h('a', { class: 'bnc-btn', href: '/api/bonus/export?kind=cards&period=' + encodeURIComponent(period()), text: 'Download report cards' }),
      ]),
    ]);
    var kids = [head];
    if (S.err) kids.push(h('div', { class: 'bnc-note bad', role: 'alert', text: S.err }));
    if (!d) { kids.push(h('div', { class: 'bnc-note', text: S.busy ? 'Working out the bonus...' : 'Pick a period.' })); return paint(root, kids); }
    kids.push(h('p', { class: 'bnc-range', text: d.label + '. ' + (d.months.some(function (m) { return m.partial; }) ? 'The current month is to date only. ' : '') + 'Report cards have no rupee amounts; the calculation does.' }));
    (d.warnings || []).forEach(function (w) { kids.push(h('div', { class: 'bnc-note warn', text: w })); });
    if (d.missing && d.missing.length) {
      var byMonth = {}; d.missing.forEach(function (x) { (byMonth[x.month] = byMonth[x.month] || []).push(x.agent + ' (' + x.what.join(', ') + ')'); });
      kids.push(h('div', { class: 'bnc-note warn' }, [h('b', { text: 'Still to enter before this is final: ' }),
        Object.keys(byMonth).map(function (k) { return k + ': ' + byMonth[k].join('; '); }).join('.  '),
        ' ', h('button', { type: 'button', class: 'bnc-link', text: 'Open Inputs', onclick: function () { S.tab = 'inputs'; draw(); } })]));
    }
    var tabs = h('div', { class: 'bnc-tabs', role: 'tablist' }, [['summary', 'Summary'], ['inputs', 'Inputs (QA, attendance, chats)'], ['agents', 'Agents']].map(function (t) {
      return h('button', { type: 'button', role: 'tab', class: 'bnc-tab', 'aria-selected': S.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { S.tab = t[0]; if (t[0] === 'agents' && !S.agents) loadAgents(); draw(); } });
    }));
    kids.push(tabs);
    if (S.tab === 'summary') kids.push(summary(d));
    else if (S.tab === 'inputs') kids.push(inputs(d));
    else kids.push(agentsTab());
    paint(root, kids);
  }
  function paint(root, kids) { root.innerHTML = ''; kids.forEach(function (k) { if (k) root.appendChild(k); }); }

  function lockAction(m, unlock) {
    var msg = unlock ? 'Reopen ' + m.label + '? Its numbers will be worked out again from the live data.' : 'Finalise ' + m.label + '? Its numbers and amounts are kept as they are now, even if Zoho, RingCentral or SalesIQ data changes later.';
    if (!window.confirm(msg)) return;
    api('/api/bonus/lock', { month: m.key, unlock: !!unlock }).then(function (j) {
      if (!j.success) throw new Error(j.error || 'Could not save');
      toast(unlock ? m.label + ' reopened' : m.label + ' finalised (' + rs(j.total) + ')', 'success'); load();
    }).catch(function (e) { toast(e.message, 'error'); });
  }
  function monthsCard(d) {
    return h('div', { class: 'bnc-card bnc-lockcard' }, [h('h3', { class: 'bnc-h3', text: 'Finalise months' }),
      h('p', { class: 'bnc-card-sub', text: 'Finalise a month once its bonus is agreed. It then keeps these exact numbers and amounts, even if a ticket is reopened or data changes later. Reopen it only to recalculate.' }),
      h('div', { class: 'bnc-locks' }, d.months.map(function (m) {
        if (m.partial) return h('span', { class: 'bnc-lock open' }, [h('b', { text: m.label }), ' in progress']);
        if (m.locked) return h('span', { class: 'bnc-lock done' }, [h('b', { text: m.label }), ' finalised' + (m.lockedBy ? ' by ' + m.lockedBy.split('@')[0] : '') + (m.lockedAt ? ' on ' + String(m.lockedAt).slice(0, 10) : '') + ' ',
          h('button', { type: 'button', class: 'bnc-link', text: 'Reopen', onclick: function () { lockAction(m, true); } })]);
        return h('span', { class: 'bnc-lock open' }, [h('b', { text: m.label }), ' not finalised ', h('button', { type: 'button', class: 'bnc-btn small', text: 'Finalise ' + m.label, onclick: function () { lockAction(m, false); } })]);
      }))]);
  }
  function summary(d) {
    var wrap = h('div');
    var am = 0, el = 0; d.agents.forEach(function (a) { d.months.forEach(function (m) { am++; if (a.months[m.key].eligible && a.months[m.key].slab) el++; }); });
    wrap.appendChild(h('div', { class: 'bnc-tiles' }, [
      tile('Total bonus', rs(d.totals.total), 'Slab bonus + CSAT incentive'),
      tile('Slab bonus', rs(d.totals.slab), 'After planned-leave cuts'),
      tile('CSAT incentive', rs(d.totals.csat), 'Rs. 150 per Good ticket, Rs. 50 per Happy chat'),
      tile('Eligible months', el + ' of ' + am, 'Agent-months at 70+ points and 18+ days', el ? 'ok' : 'mute'),
      tile('Still to enter', (d.missing || []).length, 'Agent-months missing QA or attendance', (d.missing || []).length ? 'warn' : 'ok'),
    ]));
    wrap.appendChild(monthsCard(d));
    ['calls', 'chat'].forEach(function (team) {
      var list = d.agents.filter(function (a) { return a.team === team; }); if (!list.length) return;
      var card = h('div', { class: 'bnc-card' }, [h('h3', { class: 'bnc-h3', text: team === 'chat' ? 'Chat Team' : 'Calls Team' }),
        h('p', { class: 'bnc-card-sub', text: 'Points out of 100, the slab reached, and the amount for each month. Select an agent to see every metric and why.' })]);
      var thead = h('tr', null, [h('th', { scope: 'col', text: 'Agent' })].concat(d.months.map(function (m) { return h('th', { scope: 'col', text: m.label + (m.partial ? ' (to date)' : m.locked ? ' (final)' : '') }); }))
        .concat([h('th', { scope: 'col', class: 'num', text: 'Slab' }), h('th', { scope: 'col', class: 'num', text: 'CSAT' }), h('th', { scope: 'col', class: 'num', text: 'Total' })]));
      var tb = h('tbody');
      list.forEach(function (a) {
        var open = !!S.open[a.email];
        var tr = h('tr', { class: 'bnc-row' + (open ? ' on' : '') }, [h('th', { scope: 'row' }, [h('button', { type: 'button', class: 'bnc-name', 'aria-expanded': open ? 'true' : 'false', onclick: function () { S.open[a.email] = !open; draw(); } }, [a.name, a.eligible ? null : h('span', { class: 'bnc-tag', text: 'Not eligible this period' })])])]
          .concat(d.months.map(function (m) { var x = a.months[m.key];
            return h('td', null, [h('div', { class: 'bnc-cell' }, [h('b', { text: x.points + ' pts' }), chip(x.slab, x.eligible), h('span', { class: 'bnc-amt', text: x.total ? rs(x.total) : '-' }), x.missing.length ? h('span', { class: 'bnc-miss', text: 'Needs ' + x.missing.join(' and ') }) : null])]); }))
          .concat([h('td', { class: 'num', text: rs(a.totals.slab) }), h('td', { class: 'num', text: rs(a.totals.csat) }), h('td', { class: 'num strong', text: rs(a.totals.total) })]));
        tb.appendChild(tr);
        if (open) tb.appendChild(h('tr', { class: 'bnc-detail' }, [h('td', { colspan: String(d.months.length + 4) }, [detail(d, a)])]));
      });
      card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table' }, [h('thead', null, [thead]), tb])]));
      wrap.appendChild(card);
    });
    if (d.rawRatings && d.rawRatings.length) wrap.appendChild(h('p', { class: 'bnc-range', text: 'Chat rating values seen from SalesIQ: ' + d.rawRatings.map(function (r) { return '"' + r.raw + '" as ' + (r.rating || 'unknown') + ' (' + r.n + ')'; }).join(', ') + '.' }));
    return wrap;
  }
  function detail(d, a) {
    return h('div', { class: 'bnc-months' }, d.months.map(function (m) {
      var x = a.months[m.key];
      var rows = x.metrics.map(function (mt) {
        var v = mt.value == null ? (mt.key === 'qa' ? 'Not entered' : '-') : mt.pct ? mt.value.toFixed(1) + '%' : mt.value.toFixed(1) + ' ' + mt.unit;
        var raw = mt.raw != null ? ' (' + mt.raw + ')' : '';
        return h('tr', null, [h('td', { text: mt.label }), h('td', { text: v + raw }), h('td', { text: (mt.pct ? mt.s1 + '% / ' + mt.s2 + '%' : mt.s1 + ' / ' + mt.s2) }),
          h('td', null, [mt.outcome === 's1' || mt.outcome === 's2' ? h('span', { class: 'bnc-chip ' + mt.outcome, text: mt.outcome === 's1' ? 'Slab 1' : 'Slab 2' }) : h('span', { class: 'bnc-chip no', text: mt.outcome === 'na' ? 'Not entered' : 'Missed' })]),
          h('td', { class: 'num', text: mt.points + ' / ' + mt.max })]);
      });
      var L = x.leave, leaveTxt = 'Present ' + (x.present == null ? 'not entered' : x.present) + ' (' + (x.attendanceSource === 'roster' ? 'from Roster' : x.attendanceSource) + ')'
        + ', planned ' + L.pl + ', sick ' + L.sl + ', half days ' + (L.hd_pl + L.hd_sl + L.hd_upl) + ', unplanned ' + L.upl + (L.ncns ? ', NCNS ' + L.ncns : '') + '. Leave count ' + x.leaveCount + '.';
      return h('div', { class: 'bnc-month' }, [h('h4', { text: m.long + (m.partial ? ' (to date)' : '') }),
        h('table', { class: 'bnc-mini' }, [h('thead', null, [h('tr', null, ['Metric', 'Result', 'Slab 1 / Slab 2', 'Outcome', 'Points'].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), h('tbody', null, rows)]),
        h('p', { class: 'bnc-line' }, [h('b', { text: x.points + ' / 100. ' }), x.eligible ? 'Eligible, ' + (x.slab === 's1' ? 'Slab 1' : 'Slab 2') + '. ' : 'Not eligible. ' + x.why.join(' '), x.leaveNote ? ' ' + x.leaveNote : '', x.slabAmt ? ' Slab bonus ' + rs(x.slabAmt) + '.' : '']),
        h('p', { class: 'bnc-line' }, [x.csat.why, x.csat.amount ? ' ' + rs(x.csat.amount) + '.' : '']),
        h('p', { class: 'bnc-line mute', text: leaveTxt }),
        h('p', { class: 'bnc-line mute', text: a.team === 'chat' ? 'Chat ratings ' + x.data.happy + ' Happy, ' + x.data.ok + ' Ok, ' + x.data.bad + ' Bad (' + (x.data.chatSource === 'entered' ? 'entered' : 'SalesIQ') + '). Tickets closed ' + x.data.closed + ', FCR ' + x.data.fcrYes + '.' : 'Ticket surveys ' + x.data.csatGood + ' Good of ' + x.data.csatTotal + '. Tickets closed ' + x.data.closed + ', FCR ' + x.data.fcrYes + '. Inbound calls ' + x.data.inbound + '.' }),
      ]);
    }));
  }

  var COLS = [['qa', 'QA %'], ['present', 'Present days'], ['pl', 'Planned'], ['hd_pl', 'Half-day planned'], ['sl', 'Sick'], ['hd_sl', 'Half-day sick'], ['upl', 'Unplanned'], ['hd_upl', 'Half-day unplanned'], ['ncns', 'NCNS']];
  var CHATCOLS = [['chats', 'Owned'], ['chat_happy', 'Happy'], ['chat_ok', 'Ok'], ['chat_bad', 'Bad']];
  function editKey(email, k) { return S.inMonth + '|' + email + '|' + k; }
  function inputs(d) {
    var month = d.months.filter(function (m) { return m.key === S.inMonth; })[0] || d.months[0];
    var card = h('div', { class: 'bnc-card' }, [
      h('div', { class: 'bnc-card-hd' }, [h('div', null, [h('h3', { class: 'bnc-h3', text: 'QA scores and attendance' }),
        h('p', { class: 'bnc-card-sub', text: 'Grey numbers are what the tool already has (attendance from the Roster, chat ratings and a chat count from SalesIQ); type a number to use yours instead, clear it to go back. Half days count 0.5 toward planned leave; any unplanned day, half day or NCNS removes the month\'s bonus.' })]),
        d.months.length > 1 ? seg(d.months.map(function (m) { return [m.key, m.label]; }), month.key, function (v) { S.inMonth = v; draw(); }, 'Month') : null]),
    ]);
    var hasChat = d.agents.some(function (a) { return a.team === 'chat'; });
    var head = h('tr', null, [h('th', { scope: 'col', text: 'Agent' })].concat(COLS.map(function (c) { return h('th', { scope: 'col', text: c[1] }); }))
      .concat(hasChat ? CHATCOLS.map(function (c) { return h('th', { scope: 'col', text: 'Chat ' + c[1] }); }) : []).concat([h('th', { scope: 'col', text: 'From the tool' })]));
    var tb = h('tbody');
    d.agents.forEach(function (a) {
      var x = a.months[month.key], inp = x.input || {}, ro = x.roster || {};
      var tds = [h('th', { scope: 'row', text: a.name + (a.team === 'chat' ? ' (Chat)' : '') })];
      COLS.forEach(function (c) {
        var k = editKey(a.email, c[0]);
        var val = S.edits[k] != null ? S.edits[k] : (inp[c[0]] != null ? String(inp[c[0]]) : '');
        var ph = c[0] === 'qa' ? '' : (ro[c[0]] != null && x.roster ? String(ro[c[0]]) : '');
        tds.push(h('td', null, [h('input', { class: 'bnc-in' + (c[0] === 'qa' && val === '' ? ' need' : ''), inputmode: 'decimal', 'aria-label': c[1] + ' for ' + a.name, value: val, placeholder: ph,
          oninput: function (e) { S.edits[k] = e.target.value; } })]));
      });
      if (hasChat) CHATCOLS.forEach(function (c) {
        if (a.team !== 'chat') { tds.push(h('td', { class: 'mute', text: '-' })); return; }
        var k = editKey(a.email, c[0]);
        var val = S.edits[k] != null ? S.edits[k] : (inp[c[0]] != null ? String(inp[c[0]]) : '');
        var ph = c[0] === 'chats' ? String(x.data.chatsApi != null ? x.data.chatsApi : '') : String(x.data.chatSource === 'entered' ? '' : (c[0] === 'chat_happy' ? x.data.happy : c[0] === 'chat_ok' ? x.data.ok : x.data.bad));
        tds.push(h('td', null, [h('input', { class: 'bnc-in', inputmode: 'numeric', 'aria-label': 'Chat ' + c[1] + ' for ' + a.name, value: val, placeholder: ph, oninput: function (e) { S.edits[k] = e.target.value; } })]));
      });
      tds.push(h('td', { class: 'mute small', text: a.team === 'chat'
        ? x.data.chats + ' chats, ' + x.data.closed + ' tickets, FCR ' + (x.data.closed ? Math.round(x.data.fcrYes / x.data.closed * 100) + '%' : '-')
        : x.data.inbound + ' calls, ' + x.data.closed + ' tickets, FCR ' + (x.data.closed ? Math.round(x.data.fcrYes / x.data.closed * 100) + '%' : '-') + ', CSAT ' + x.data.csatGood + '/' + x.data.csatTotal }));
      tb.appendChild(h('tr', null, tds));
    });
    card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table inputs' }, [h('thead', null, [head]), tb])]));
    var paste = h('textarea', { class: 'bnc-paste', rows: '4', 'aria-label': 'Paste from Excel', placeholder: 'Optional: paste rows from Excel, one agent per line: Agent name, QA %, Present days, Planned, Half-day planned, Sick, Half-day sick, Unplanned, Half-day unplanned, NCNS' });
    if (month.locked) card.appendChild(h('div', { class: 'bnc-note', text: month.label + ' is finalised, so its inputs cannot be changed. Reopen it on the Summary tab to edit.' }));
    card.appendChild(h('div', { class: 'bnc-actions' }, [
      h('button', { type: 'button', class: 'bnc-btn primary', text: S.saving ? 'Saving...' : 'Save ' + month.label, disabled: S.saving || month.locked, onclick: function () { save(d, month); } }),
      h('details', { class: 'bnc-pastebox' }, [h('summary', { text: 'Paste from Excel' }), paste,
        h('button', { type: 'button', class: 'bnc-btn', text: 'Fill the grid from paste', onclick: function () { fillFromPaste(d, paste.value); } })]),
    ]));
    var wrap = h('div', null, [opCard(d), card]);
    return wrap;
  }
  // Batch 167: upload the SalesIQ Operator Reports export (.xlsx, one month) to fill chat team chats and ratings.
  function opMonthLabel(k) { var p = String(k || '').split('-'); return p.length === 2 ? MON[Number(p[1]) - 1] + ' ' + p[0] : k; }
  function opSend(file, dry) {
    S.op = Object.assign({}, S.op || {}, { busy: true, file: file, err: '' }); draw();
    return fetch('/api/bonus/operator-report' + (dry ? '?dry=1' : ''), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (!j.success) throw new Error(j.error || 'Could not read the file');
        if (dry) { S.op = { busy: false, file: file, data: j }; draw(); return; }
        S.op = null; S.inMonth = j.month;
        toast('Chats and ratings saved for ' + opMonthLabel(j.month) + ' (' + j.saved + ' agent' + (j.saved === 1 ? '' : 's') + ')', 'success'); load();
      }).catch(function (e) { S.op = Object.assign({}, S.op || {}, { busy: false, err: e.message }); draw(); });
  }
  function opCard(d) {
    var op = S.op || {};
    var fileIn = h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', class: 'bnc-file', id: 'bnc-op-file',
      onchange: function (e) { var f = e.target.files && e.target.files[0]; if (f) opSend(f, true); } });
    var card = h('div', { class: 'bnc-card' }, [h('div', { class: 'bnc-card-hd' }, [h('div', null, [h('h3', { class: 'bnc-h3', text: 'Chats and chat ratings from SalesIQ' }),
      h('p', { class: 'bnc-card-sub', text: 'In SalesIQ open Reports > Operator Reports, pick one whole month (1st to last day), export as Excel and upload it here. Chats Owned and Good, Ok and Bad ratings are filled in for the chat team; QA and attendance already entered stay as they are. You see a preview before anything is saved.' })]),
      h('div', { class: 'bnc-upload' }, [h('label', { class: 'bnc-btn primary', for: 'bnc-op-file', text: op.busy ? 'Reading...' : 'Upload operator report' }), fileIn])])]);
    if (op.err) card.appendChild(h('div', { class: 'bnc-note bad', role: 'alert', text: op.err }));
    var j = op.data; if (!j) return card;
    var inPeriod = d.months.some(function (m) { return m.key === j.month; });
    card.appendChild(h('p', { class: 'bnc-line' }, [h('b', { text: opMonthLabel(j.month) + '. ' }), 'Report range ' + j.range + (j.timeZone ? ' (' + j.timeZone + ')' : '') + (j.operators ? ', operators: ' + j.operators : '') + (j.departments ? ', departments: ' + j.departments : '') + '.']));
    if (j.locked) card.appendChild(h('div', { class: 'bnc-note warn', text: opMonthLabel(j.month) + ' is finalised. Reopen it on the Summary tab before saving.' }));
    if (!inPeriod) card.appendChild(h('div', { class: 'bnc-note warn', text: opMonthLabel(j.month) + ' is not in the period shown above. It is saved all the same; pick that period to see it.' }));
    var cell = function (now, was) { var changed = was != null && now != null && Number(was) !== Number(now); return h('td', { class: 'num' + (changed ? ' bnc-chg' : '') }, [now == null ? '-' : String(now), changed ? h('span', { class: 'bnc-was', text: ' (was ' + was + ')' }) : null]); };
    var tb = h('tbody');
    j.rows.filter(function (r) { return r.team === 'chat'; }).forEach(function (r) {
      tb.appendChild(h('tr', null, [h('th', { scope: 'row', text: r.name }), cell(r.chats, r.before.chats), cell(r.happy, r.before.happy), cell(r.ok, r.before.ok), cell(r.bad, r.before.bad),
        h('td', { class: 'small' + (r.found ? '' : ' mute'), text: r.found ? 'Will be saved' : 'Not in this report, left as it is' })]));
    });
    card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table' }, [h('thead', null, [h('tr', null, ['Chat agent', 'Chats owned', 'Good', 'Ok', 'Bad', ''].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), tb])]));
    var calls = j.rows.filter(function (r) { return r.team !== 'chat' && r.found && r.chats; });
    if (calls.length) card.appendChild(h('p', { class: 'bnc-line mute', text: 'Calls team agents with chats in this report (not used, their bonus has no chat metric): ' + calls.map(function (r) { return r.name + ' ' + r.chats; }).join(', ') + '.' }));
    card.appendChild(h('div', { class: 'bnc-actions' }, [
      h('button', { type: 'button', class: 'bnc-btn primary', text: op.busy ? 'Saving...' : 'Save to ' + opMonthLabel(j.month), disabled: op.busy || j.locked || !j.rows.some(function (r) { return r.use; }), onclick: function () { opSend(op.file, false); } }),
      h('button', { type: 'button', class: 'bnc-btn', text: 'Cancel', disabled: op.busy, onclick: function () { S.op = null; draw(); } })]));
    return card;
  }
  function fillFromPaste(d, text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean), hit = 0, miss = [];
    lines.forEach(function (l) {
      var parts = l.split(/\t|,/).map(function (x) { return x.trim(); }); var nm = (parts[0] || '').toLowerCase();
      var a = d.agents.filter(function (x) { return x.name.toLowerCase() === nm || (x.fullName && x.fullName.toLowerCase() === nm); })[0];
      if (!a) { if (nm && !/^agent|^name/.test(nm)) miss.push(parts[0]); return; }
      COLS.forEach(function (c, i) { var v = parts[i + 1]; if (v != null && v !== '') S.edits[editKey(a.email, c[0])] = v.replace('%', ''); });
      hit++;
    });
    toast(hit + ' agent(s) filled' + (miss.length ? '; not matched: ' + miss.join(', ') : '') + '. Check and press Save.', miss.length ? 'warning' : 'success');
    draw();
  }
  function save(d, month) {
    var rows = d.agents.map(function (a) {
      var x = a.months[month.key], inp = x.input || {}, r = { email: a.email };
      COLS.concat(CHATCOLS).forEach(function (c) { var k = editKey(a.email, c[0]); r[c[0]] = S.edits[k] != null ? S.edits[k] : (inp[c[0]] != null ? inp[c[0]] : null); });
      return r;
    });
    S.saving = true; draw();
    api('/api/bonus/inputs', { month: month.key, rows: rows }).then(function (j) {
      S.saving = false; if (!j.success) throw new Error(j.error || 'Could not save');
      toast('Saved ' + month.label + ' for ' + j.saved + ' agent(s)', 'success'); load();
    }).catch(function (e) { S.saving = false; toast(e.message, 'error'); draw(); });
  }

  function agentsTab() {
    var card = h('div', { class: 'bnc-card' }, [h('h3', { class: 'bnc-h3', text: 'Who is in the bonus' }),
      h('p', { class: 'bnc-card-sub', text: 'Include an agent, pick the team their metrics are scored on, and switch off bonus eligibility (for example during probation). Changes apply to every period.' })]);
    if (!S.agents) { card.appendChild(h('p', { class: 'bnc-card-sub', text: 'Loading...' })); return card; }
    var tb = h('tbody');
    S.agents.forEach(function (a) {
      function upd(patch) { api('/api/bonus/agents', Object.assign({ email: a.email }, patch)).then(function (j) { if (!j.success) throw new Error(j.error); Object.assign(a, j.agent); toast('Saved ' + a.name, 'success'); S.data = null; load(); }).catch(function (e) { toast(e.message, 'error'); }); }
      var team = h('select', { class: 'bnc-sel', 'aria-label': 'Team for ' + a.name, onchange: function (e) { upd({ team: e.target.value }); } }, [['calls', 'Calls'], ['chat', 'Chat']].map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (a.team === o[0]) op.selected = true; return op; }));
      var inc = h('input', { type: 'checkbox', 'aria-label': 'Include ' + a.name, onchange: function (e) { upd({ include: e.target.checked }); } }); inc.checked = !!a.include;
      var el = h('input', { type: 'checkbox', 'aria-label': 'Bonus eligible: ' + a.name, onchange: function (e) { upd({ eligible: e.target.checked }); } }); el.checked = !!a.eligible;
      tb.appendChild(h('tr', null, [h('th', { scope: 'row', text: a.name }), h('td', { text: a.empId || '-' }), h('td', { text: a.doj || '-' }), h('td', null, [inc]), h('td', null, [team]), h('td', null, [el])]));
    });
    card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table' }, [h('thead', null, [h('tr', null, ['Agent', 'Emp Id', 'DOJ', 'Included', 'Team', 'Bonus eligible'].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), tb])]));
    card.appendChild(h('div', { class: 'bnc-actions' }, [h('button', { type: 'button', class: 'bnc-btn', text: 'Read chat ratings again from 1 Jul', onclick: function () {
      api('/api/bonus/chat-ratings/reread', { from: '2026-07-01T05:00:00Z' }).then(function (j) { toast(j.running ? 'Already reading chats; refresh in a few minutes.' : 'Reading chats from SalesIQ in the background; refresh in a few minutes.', 'info'); });
    } })]));
    return card;
  }

  window.openBonusCalc = function () { if (!S.data || Date.now() - (S.at || 0) > 5 * 60000) { S.at = Date.now(); if (!S.value) S.value = defaultValue(S.type); load(); } else draw(); };
})();
