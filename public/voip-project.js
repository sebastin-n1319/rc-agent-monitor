/* Batch 250: T1 CS VoIP. The page under Tickets and the shared read-only page for leadership use this same file:
   VoipProject.mount(root, { mode: 'admin' }) in the tool, VoipProject.mount(root, { mode: 'share', token }) on /voip-report/<token>. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { success: false, error: 'The server is busy, try again.' }; }).then(function (j) { j._status = r.status; if (!r.ok || !j || j.success === false) { var e = new Error((j && j.error) || 'Something went wrong'); e.data = j; throw e; } return j; }); });
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, kids) { var el = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); }); (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return el; }
  var pc = function (v) { return v == null ? '-' : (Math.round(v * 10) / 10) + '%'; };
  var num = function (v) { return v == null ? '-' : String(v); };
  var day = function (iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }); };
  var OUT = { closed_t1: ['Closed by T1', 'ok'], open_t1: ['Open with T1', 'muted'], back_closed_t1: ['Came back, closed by T1', 'warn'], back_open_t1: ['Came back, open with T1', 'warn'], closed_dept: ['Closed by other team', 'blue'], open_dept: ['Open with other team', 'blue'] };
  var BASIC = { done: ['Basic support done', 'ok'], partial: ['Partly done', 'warn'], not_done: ['Not done', 'bad'], not_needed: ['VoIP team owns it', 'muted'] };
  var PRESETS = [['golive', 'Since go-live'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['month', 'This month'], ['custom', 'Custom']];

  function mount(root, opts) {
    opts = opts || {};
    var S = { preset: 'golive', from: '', to: '', data: null, busy: false, f: { q: '', outcome: '', dept: '', cat: '', agent: '', basic: '' }, show: 50 };
    try { var saved = JSON.parse(localStorage.getItem('vp.range') || 'null'); if (saved && opts.mode === 'admin') { S.preset = saved.preset || 'golive'; S.from = saved.from || ''; S.to = saved.to || ''; } } catch (e) { /* default range */ }
    root.classList.add('vp'); if (opts.mode === 'share') root.classList.add('vp-share');
    clear(root);
    var head = h('header', { class: 'vp-head' }), body = h('div', { class: 'vp-body', 'aria-live': 'polite' });
    root.appendChild(head); root.appendChild(body);

    function load(fresh) {
      if (S.busy) return; S.busy = true; paintHead();
      if (!S.data) { clear(body); body.appendChild(h('div', { class: 'vp-card vp-wait' }, [h('span', { class: 'vp-spin', 'aria-hidden': 'true' }), 'Reading the VoIP tickets from Zoho Desk...'])); }
      var url = opts.mode === 'share' ? '/api/voip-share/' + encodeURIComponent(opts.token) : '/api/voip-project?preset=' + S.preset + (S.preset === 'custom' ? '&from=' + S.from + '&to=' + S.to : '') + (fresh ? '&t=' + Date.now() : '');
      api(url).then(function (j) { S.data = j; S.busy = false; paintHead(); paint(); })
        .catch(function (e) {
          S.busy = false; paintHead();
          if (opts.mode === 'share' && e.data && e.data.signIn) return opts.onSignIn && opts.onSignIn(e.data.clientId, load);
          clear(body); body.appendChild(h('div', { class: 'vp-card vp-err', role: 'alert' }, [e.message || 'Could not load the report.', ' ', h('button', { type: 'button', class: 'vp-btn', onclick: function () { load(true); } }, ['Try again'])]));
        });
    }
    function paintHead() {
      clear(head);
      var D = S.data;
      head.appendChild(h('div', { class: 'vp-title' }, [h('h1', { text: D && D.shareLabel ? D.shareLabel : 'T1 CS VoIP' }),
        h('p', { class: 'vp-sub', text: 'Basic VoIP support handled by T1 CS since 12 Oct 2026: what T1 closed, what it transferred and where, whether basic support was done first, and how it compares with the same number of days before.' + (D && D.viewer ? ' Signed in as ' + D.viewer + '.' : '') })]));
      var ctl = h('div', { class: 'vp-ctl' });
      if (opts.mode === 'admin') {
        var seg = h('div', { class: 'vp-seg', role: 'group', 'aria-label': 'Date range' }, PRESETS.map(function (p) {
          return h('button', { type: 'button', 'aria-pressed': String(S.preset === p[0]), onclick: function () { S.preset = p[0]; if (p[0] !== 'custom') { save(); load(); } else paintHead(); } }, [p[1]]);
        }));
        ctl.appendChild(seg);
        if (S.preset === 'custom') {
          var f = h('input', { type: 'date', class: 'vp-in', 'aria-label': 'From', value: S.from || '2026-10-12', min: '2026-01-01' }), t = h('input', { type: 'date', class: 'vp-in', 'aria-label': 'To', value: S.to || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) });
          ctl.appendChild(f); ctl.appendChild(t);
          ctl.appendChild(h('button', { type: 'button', class: 'vp-btn', onclick: function () { S.from = f.value; S.to = t.value; save(); load(); } }, ['Apply']));
        }
        ctl.appendChild(h('button', { type: 'button', class: 'vp-btn', disabled: S.busy, onclick: function () { load(true); } }, [S.busy ? 'Loading...' : 'Refresh']));
        ctl.appendChild(h('button', { type: 'button', class: 'vp-btn primary', onclick: shareDialog }, ['Share']));
      } else if (D) {
        ctl.appendChild(h('span', { class: 'vp-pill', text: D.range.label }));
        ctl.appendChild(h('button', { type: 'button', class: 'vp-btn', onclick: function () { load(true); } }, ['Refresh']));
      }
      head.appendChild(ctl);
    }
    function save() { try { localStorage.setItem('vp.range', JSON.stringify({ preset: S.preset, from: S.from, to: S.to })); } catch (e) { /* not kept */ } }

    // ── the report ──
    function paint() {
      var D = S.data, C = D.current, P = D.previous, T = C.totals, PT = P.totals;
      clear(body);
      var rd = D.reading || {};
      body.appendChild(h('p', { class: 'vp-meta' }, [h('b', { text: D.range.label }), ' (' + D.range.days + ' days) compared with ' + D.range.prevLabel + '. Updated ' + new Date(D.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT.',
        rd.waiting ? h('span', { class: 'vp-pill warn', text: 'AI is still reading ' + rd.waiting + ' ticket' + (rd.waiting === 1 ? '' : 's') + '; the numbers fill in as it goes' }) : h('span', { class: 'vp-pill ok', text: 'Every ticket read' })]));
      // headline tiles
      var comp = C.company, pcomp = P.company;
      body.appendChild(h('section', { class: 'vp-tiles', 'aria-label': 'Headline numbers' }, [
        tile('VoIP tickets handled by T1', num(T.handled), PT.handled, T.handled, true, 'count'),
        tile('Closed by T1', pc(T.closedT1Pct), PT.closedT1Pct, T.closedT1Pct, true, 'pct', T.closedT1 + ' tickets'),
        tile('Transferred', pc(T.transferPct), PT.transferPct, T.transferPct, false, 'pct', T.transferred + ' tickets, ' + T.toVoip + ' to VoIP teams'),
        tile('FCR', pc(T.fcrPct), PT.fcrPct, T.fcrPct, true, 'pct', T.fcr + ' closed first time'),
        tile('Basic support done before transfer', pc(T.basicDonePct), PT.basicDonePct, T.basicDonePct, true, 'pct', T.basicDone + ' of ' + (T.basicDone + T.basicPartial + T.basicNot) + ' where it applies'),
        comp ? tile('Share of all Adit VoIP tickets closed by T1', pc(comp.t1Pct), pcomp && pcomp.t1Pct, comp.t1Pct, true, 'pct', T.closedT1 + ' of ' + comp.total) : null]));
      body.appendChild(compareCard(D));
      body.appendChild(dailyCard(C.daily));
      body.appendChild(deptCard(C, T)); body.appendChild(basicCard(C, T));
      body.appendChild(catCard(C, D));
      body.appendChild(agentCard(C));
      body.appendChild(receiverCard(C));
      body.appendChild(ticketCard(D));
      body.appendChild(h('details', { class: 'vp-card vp-def' }, [h('summary', { text: 'How these numbers are worked out' }), h('ul', null, (D.definitions || []).map(function (x) { return h('li', { text: x }); }))]));
    }
    function delta(prev, cur, goodUp, kind) {
      if (prev == null || cur == null) return h('span', { class: 'vp-d muted', text: prev == null ? 'no earlier data' : '' });
      var d = Math.round((cur - prev) * 10) / 10; if (!d) return h('span', { class: 'vp-d muted', text: 'same as before' });
      var good = goodUp ? d > 0 : d < 0;
      return h('span', { class: 'vp-d ' + (good ? 'up' : 'down') }, [(d > 0 ? '▲ +' : '▼ ') + d + (kind === 'pct' ? ' pts' : ''), h('span', { class: 'vp-sr', text: good ? ' (better)' : ' (worse)' })]);
    }
    function tile(label, value, prev, cur, goodUp, kind, sub) {
      return h('div', { class: 'vp-tile' }, [h('span', { class: 'vp-tl', text: label }), h('b', { class: 'vp-tv', text: value }), sub ? h('span', { class: 'vp-ts', text: sub }) : null,
        h('span', { class: 'vp-tc' }, [delta(prev, cur, goodUp, kind), prev != null ? h('span', { class: 'vp-muted', text: ' vs ' + (kind === 'pct' ? pc(prev) : prev) + ' before' }) : null])]);
    }
    function card(title, sub, kids, cls) { return h('section', { class: 'vp-card ' + (cls || '') }, [h('div', { class: 'vp-ch' }, [h('h2', { text: title }), sub ? h('p', { class: 'vp-muted', text: sub }) : null])].concat(kids)); }
    // A sortable table. cols: [label, key or fn, { num, cls, fmt }]
    function table(cols, rows, opt) {
      opt = opt || {}; var st = { k: null, dir: -1 };
      var wrap = h('div', { class: 'vp-tw' });
      function draw() {
        clear(wrap);
        var rs = rows.slice();
        if (st.k != null) { var c = cols[st.k]; rs.sort(function (a, b) { var x = val(c, a), y = val(c, b); if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * st.dir; }); }
        var thead = h('thead', null, [h('tr', null, cols.map(function (c, i) {
          return h('th', { scope: 'col', class: (c[2] && c[2].num ? 'n' : ''), 'aria-sort': st.k === i ? (st.dir > 0 ? 'ascending' : 'descending') : 'none' }, [h('button', { type: 'button', onclick: function () { if (st.k === i) st.dir = -st.dir; else { st.k = i; st.dir = c[2] && c[2].num ? -1 : 1; } draw(); } }, [c[0]])]);
        }))]);
        var tb = h('tbody', null, rs.length ? rs.map(function (r) { return h('tr', { class: opt.rowCls ? opt.rowCls(r) : '' }, cols.map(function (c) { var o = c[2] || {}; var v = o.cell ? o.cell(r) : (o.fmt ? o.fmt(val(c, r), r) : num(val(c, r))); return h('td', { class: (o.num ? 'n ' : '') + (o.cls || '') }, [v]); })); })
          : [h('tr', null, [h('td', { colspan: String(cols.length), class: 'vp-empty', text: opt.empty || 'Nothing in this range yet.' })])]);
        wrap.appendChild(h('table', { class: 'vp-t' }, [thead, tb]));
      }
      function val(c, r) { return typeof c[1] === 'function' ? c[1](r) : r[c[1]]; }
      draw(); return wrap;
    }
    var P_ = { num: true, fmt: pc }, N_ = { num: true };
    function compareCard(D) {
      var C = D.current.totals, P = D.previous.totals, cc = D.current.company || {}, pp = D.previous.company || {};
      var rows = [
        ['VoIP tickets T1 handled', P.handled, C.handled, true, 'count'],
        ['Closed by T1 (no transfer)', P.closedT1, C.closedT1, true, 'count'],
        ['Closed by T1 %', P.closedT1Pct, C.closedT1Pct, true, 'pct'],
        ['Transferred', P.transferred, C.transferred, false, 'count'],
        ['Transfer %', P.transferPct, C.transferPct, false, 'pct'],
        ['Sent to a VoIP team', P.toVoip, C.toVoip, false, 'count'],
        ['FCR %', P.fcrPct, C.fcrPct, true, 'pct'],
        ['Basic support done before transfer %', P.basicDonePct, C.basicDonePct, true, 'pct'],
        ['Right transfers by the guide %', P.validPct, C.validPct, true, 'pct'],
        ['Complete hand-over notes %', P.handoffPct, C.handoffPct, true, 'pct'],
        ['All VoIP tickets at Adit', pp.total, cc.total, null, 'count'],
        ['Share of all VoIP tickets closed by T1 %', pp.t1Pct, cc.t1Pct, true, 'pct'],
        ['Calls / chats / emails handled', [D.previous.byChannel.call.handled, D.previous.byChannel.chat.handled, D.previous.byChannel.email.handled].join(' / '), [D.current.byChannel.call.handled, D.current.byChannel.chat.handled, D.current.byChannel.email.handled].join(' / '), null, 'text'],
      ];
      var fmt = function (v, k) { return k === 'pct' ? pc(v) : num(v); };
      var t = h('table', { class: 'vp-t vp-cmp' }, [h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Measure' }), h('th', { scope: 'col', class: 'n', text: 'Before (' + D.range.prevLabel + ')' }), h('th', { scope: 'col', class: 'n', text: 'Now (' + D.range.label + ')' }), h('th', { scope: 'col', class: 'n', text: 'Change' })])]),
        h('tbody', null, rows.map(function (r) { return h('tr', null, [h('th', { scope: 'row', text: r[0] }), h('td', { class: 'n', text: fmt(r[1], r[4]) }), h('td', { class: 'n' }, [h('b', { text: fmt(r[2], r[4]) })]), h('td', { class: 'n' }, [r[3] == null || r[4] === 'text' ? h('span', { class: 'vp-d muted', text: '' }) : delta(r[1], r[2], r[3], r[4])])]); }))]);
      var note = D.range.preset === 'golive' ? 'Before is the same number of days before T1 took basic VoIP support, when T1 sent VoIP tickets on to the VoIP team.' : 'Before is the same number of days just before this range.';
      return card('Before and after', note, [h('div', { class: 'vp-tw' }, [t])]);
    }
    function dailyCard(daily) {
      var box = card('Day by day', 'VoIP tickets T1 handled each day, by what happened to them. Hover a bar for the numbers.', []);
      if (!daily.length) { box.appendChild(h('p', { class: 'vp-empty', text: 'No tickets in this range yet.' })); return box; }
      var W = Math.max(320, (body.clientWidth || 900) - 40), H = 180, pad = 26, max = Math.max.apply(null, daily.map(function (d) { return d.closedT1 + d.transferred + d.openT1; })) || 1;
      var bw = Math.max(6, Math.min(30, (W - pad) / daily.length - 6));
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + (H + 30), class: 'vp-chart', role: 'img', 'aria-label': 'Daily VoIP tickets: closed by T1, transferred and open with T1' });
      [0, 0.5, 1].forEach(function (f) { var y = H - f * (H - 10); svg.appendChild(s('line', { x1: pad, x2: W, y1: y, y2: y, class: 'vp-grid' })); svg.appendChild(s('text', { x: pad - 6, y: y + 4, class: 'vp-ax', 'text-anchor': 'end' }, [String(Math.round(max * f))])); });
      daily.forEach(function (d, i) {
        var x = pad + 4 + i * ((W - pad - 4) / daily.length), y = H, g = s('g', { class: 'vp-bar', tabindex: '0' });
        g.appendChild(s('title', null, [d.day + ': ' + d.closedT1 + ' closed by T1, ' + d.transferred + ' transferred, ' + d.openT1 + ' open with T1']));
        [['closedT1', 'c1'], ['openT1', 'c3'], ['transferred', 'c2']].forEach(function (k) { var v = d[k[0]]; if (!v) return; var hgt = v / max * (H - 10); y -= hgt; g.appendChild(s('rect', { x: x, y: y + 1, width: bw, height: Math.max(1, hgt - 2), rx: 2, class: k[1] })); });
        svg.appendChild(g);
        if (daily.length <= 16 || i % Math.ceil(daily.length / 12) === 0) svg.appendChild(s('text', { x: x + bw / 2, y: H + 16, class: 'vp-ax', 'text-anchor': 'middle' }, [d.day.slice(5).replace('-', '/')]));
      });
      box.appendChild(h('div', { class: 'vp-legend' }, [['c1', 'Closed by T1'], ['c2', 'Transferred'], ['c3', 'Open with T1']].map(function (l) { return h('span', null, [h('i', { class: l[0] }), l[1]]); })));
      box.appendChild(h('div', { class: 'vp-tw' }, [svg]));
      return box;
    }
    function deptCard(C, T) {
      return card('Where transfers went', T.transferred + ' of ' + T.handled + ' tickets (' + pc(T.transferPct) + ') went from T1 to another department. Closure is what that department closed.', [table([
        ['Department', 'dept', { cell: function (r) { return h('span', null, [r.dept, r.voip ? h('span', { class: 'vp-tag blue', text: 'VoIP' }) : null]); } }],
        ['Transfers', 'received', N_], ['% of transfers', 'share', P_], ['% of all handled', 'ofAll', P_], ['Closed by them', 'closed', N_], ['Still open', 'open', N_], ['Came back to T1', 'back', N_], ['Closure %', 'closurePct', P_],
        ['Median hours to close', 'medianHours', { num: true, fmt: function (v) { return v == null ? '-' : v + ' h'; } }]], C.byDept, { empty: 'No transfers in this range.' })]);
    }
    function basicCard(C, T) {
      var applies = T.basicDone + T.basicPartial + T.basicNot, tot = applies + T.basicNotNeeded;
      var parts = [['done', T.basicDone], ['partial', T.basicPartial], ['not_done', T.basicNot], ['not_needed', T.basicNotNeeded]];
      var bar = h('div', { class: 'vp-stack', role: 'img', 'aria-label': parts.map(function (p) { return BASIC[p[0]][0] + ' ' + p[1]; }).join(', ') }, parts.filter(function (p) { return p[1]; }).map(function (p) { return h('span', { class: 'b-' + p[0], style: 'flex:' + p[1], title: BASIC[p[0]][0] + ': ' + p[1] }); }));
      var kids = [bar, h('ul', { class: 'vp-keys' }, parts.map(function (p) { return h('li', null, [h('i', { class: 'b-' + p[0] }), h('span', { text: BASIC[p[0]][0] }), h('b', { text: String(p[1]) }), h('span', { class: 'vp-muted', text: p[0] === 'not_needed' ? '' : ' ' + pc(applies ? p[1] / applies * 100 : null) })]); }))];
      kids.push(h('p', { class: 'vp-line' }, ['Right transfers by the guide: ', h('b', { text: pc(T.validPct) }), ' · complete hand-over notes: ', h('b', { text: pc(T.handoffPct) })]));
      if (C.topMissing.length) kids.push(h('div', null, [h('h3', { text: 'Steps most often skipped before a transfer' }), h('ol', { class: 'vp-miss' }, C.topMissing.map(function (m) { return h('li', null, [m.step, h('span', { class: 'vp-muted', text: ' (' + m.n + ')' })]); }))]));
      return card('Basic support before a transfer', tot ? 'AI checked ' + tot + ' transferred tickets against the T1 VoIP support guide.' : 'No transferred tickets read yet.', kids);
    }
    function catCard(C, D) {
      return card('Issue categories', 'What clients called about, what T1 solved and what it transferred. Expected owner comes from the T1 VoIP support guide.', [table([
        ['Category', 'label'], ['Expected owner', function (r) { return D.categories[r.key] ? D.categories[r.key].expectedLabel : ''; }, { cell: function (r) { var e = r.expected; return h('span', { class: 'vp-tag ' + (e === 't1' ? 'ok' : e === 'team' ? 'muted' : 'warn'), text: D.categories[r.key] ? D.categories[r.key].expectedLabel : '' }); } }],
        ['Tickets', 'handled', N_], ['Closed by T1', 'closedT1', N_], ['Transferred', 'transferred', N_], ['Transfer %', 'transferPct', P_], ['FCR %', 'fcrPct', P_], ['Basic done %', 'basicDonePct', P_]], C.byCategory, {
          rowCls: function (r) { return r.expected === 't1' && r.transferPct > 30 ? 'flag' : ''; } }),
        h('p', { class: 'vp-muted vp-small', text: 'Highlighted rows: categories T1 should resolve where more than 30% were transferred.' })]);
    }
    function agentCard(C) {
      return card('T1 agents', 'Each VoIP ticket counts for the T1 agent who last had it before it closed or left T1.', [table([
        ['Agent', 'name'], ['Handled', 'handled', N_], ['Calls', 'call', N_], ['Chats', 'chat', N_], ['Emails', 'email', N_], ['Closed by T1', 'closedT1', N_], ['Closure %', 'closedT1Pct', P_],
        ['Transferred', 'transferred', N_], ['Transfer %', 'transferPct', P_], ['FCR %', 'fcrPct', P_], ['Basic done %', 'basicDonePct', P_], ['Hand-over notes %', 'handoffPct', P_]], C.byAgent)]);
    }
    function receiverCard(C) {
      return card('Who picked up the transfers', 'The person who closed or now holds each ticket T1 transferred, with their department. VoIP team agents are marked.', [table([
        ['Person', 'name', { cell: function (r) { return h('span', null, [r.name, r.voip ? h('span', { class: 'vp-tag blue', text: 'VoIP' }) : null]); } }], ['Department', 'dept'],
        ['Received from T1', 'received', N_], ['Closed', 'closed', N_], ['Open', 'open', N_], ['Closure %', 'closurePct', P_], ['Median hours to close', 'medianHours', { num: true, fmt: function (v) { return v == null ? '-' : v + ' h'; } }]], C.receivers, { empty: 'No transfers in this range.' })]);
    }
    function ticketCard(D) {
      var list = D.tickets || [], f = S.f;
      var box = card('Tickets', null, []);
      var opt = function (lab, key, values) { var sel = h('select', { class: 'vp-in', 'aria-label': lab }, [h('option', { value: '', text: lab + ': all' })].concat(values.map(function (v) { return h('option', { value: v[0], text: v[1], selected: f[key] === v[0] ? '' : null }); }))); sel.addEventListener('change', function () { f[key] = sel.value; S.show = 50; redraw(); }); return sel; };
      var uniq = function (fn) { var m = {}; list.forEach(function (t) { var v = fn(t); if (v) m[v] = 1; }); return Object.keys(m).sort(); };
      var q = h('input', { type: 'search', class: 'vp-in vp-q', placeholder: 'Search number, subject, agent', 'aria-label': 'Search tickets', value: f.q });
      q.addEventListener('input', function () { f.q = q.value; S.show = 50; redraw(); });
      var bar = h('div', { class: 'vp-fbar' }, [q,
        opt('Outcome', 'outcome', Object.keys(OUT).map(function (k) { return [k, OUT[k][0]]; })),
        opt('Went to', 'dept', uniq(function (t) { return t.dest; }).map(function (v) { return [v, v]; })),
        opt('Category', 'cat', Object.keys(D.categories).map(function (k) { return [k, D.categories[k].label]; })),
        opt('T1 agent', 'agent', uniq(function (t) { return t.agent; }).map(function (v) { return [v, v]; })),
        opt('Basic support', 'basic', Object.keys(BASIC).map(function (k) { return [k, BASIC[k][0]]; })),
        h('button', { type: 'button', class: 'vp-btn', onclick: function () { csv(filtered()); } }, ['Download CSV'])]);
      var count = h('p', { class: 'vp-muted vp-small' }), wrap = h('div', { class: 'vp-tw vp-tickets' });
      box.appendChild(bar); box.appendChild(count); box.appendChild(wrap);
      function filtered() {
        var qq = f.q.trim().toLowerCase();
        return list.filter(function (t) {
          if (f.outcome && t.outcome !== f.outcome) return false; if (f.dept && t.dest !== f.dept) return false; if (f.cat && t.category !== f.cat) return false;
          if (f.agent && t.agent !== f.agent) return false; if (f.basic && !(t.ai && t.ai.basic === f.basic)) return false;
          if (qq && (t.number + ' ' + t.subject + ' ' + t.agent + ' ' + (t.owner || '')).toLowerCase().indexOf(qq) < 0) return false;
          return true;
        });
      }
      function redraw() {
        var rs = filtered(); count.textContent = rs.length + ' of ' + list.length + ' tickets';
        clear(wrap);
        var tb = h('tbody', null, rs.slice(0, S.show).map(function (t) {
          var o = OUT[t.outcome] || [t.outcome, 'muted'], b = t.ai && t.ai.basic ? BASIC[t.ai.basic] : null;
          var det = t.ai && (t.ai.summary || (t.ai.missing && t.ai.missing.length)) ? h('details', { class: 'vp-why' }, [h('summary', { text: 'Details' }), t.ai.summary ? h('p', { text: t.ai.summary }) : null,
            t.ai.done && t.ai.done.length ? h('p', null, [h('b', { text: 'Done: ' }), t.ai.done.join('; ')]) : null, t.ai.missing && t.ai.missing.length ? h('p', null, [h('b', { text: 'Missing: ' }), t.ai.missing.join('; ')]) : null,
            t.ai.why ? h('p', { class: 'vp-muted', text: t.ai.why }) : null, t.path && t.path.length ? h('p', { class: 'vp-muted', text: 'Owners: ' + t.path.join(' > ') }) : null]) : null;
          return h('tr', null, [h('td', { class: 'k' }, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }) : '#' + t.number]),
            h('td', null, [h('span', { class: 'vp-subj', text: t.subject }), det]), h('td', { text: day(t.created) }), h('td', { text: t.channel }), h('td', { text: t.agent }),
            h('td', { text: (D.categories[t.category] || {}).label || t.category }), h('td', null, [h('span', { class: 'vp-tag ' + o[1], text: o[0] })]), h('td', { text: t.dest || '' }), h('td', { text: t.owner || '' }),
            h('td', null, [b ? h('span', { class: 'vp-tag ' + b[1], text: b[0] }) : (t.transferred ? h('span', { class: 'vp-muted', text: 'Not read yet' }) : '')]), h('td', { class: 'vp-muted', text: t.by })]);
        }));
        wrap.appendChild(h('table', { class: 'vp-t' }, [h('thead', null, [h('tr', null, ['Ticket', 'Subject', 'Created', 'Channel', 'T1 agent', 'Category', 'Outcome', 'Went to', 'Owner now', 'Basic support', 'Found by'].map(function (x) { return h('th', { scope: 'col', text: x }); }))]), tb]));
        if (rs.length > S.show) wrap.appendChild(h('button', { type: 'button', class: 'vp-btn vp-more', onclick: function () { S.show += 300; redraw(); } }, ['Show more (' + (rs.length - S.show) + ' left)']));
      }
      redraw();
      return box;
    }
    function csv(rows) {
      var D = S.data, esc = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var head = ['Ticket', 'Subject', 'Created', 'Channel', 'T1 agent', 'Category', 'Outcome', 'Went to', 'Owner now', 'Basic support', 'Missing steps', 'Right transfer', 'Hand-over note', 'FCR', 'Found by', 'Link'];
      var lines = [head.join(',')].concat(rows.map(function (t) { var a = t.ai || {}; return [t.number, t.subject, day(t.created), t.channel, t.agent, (D.categories[t.category] || {}).label, (OUT[t.outcome] || [t.outcome])[0], t.dest, t.owner, a.basic ? BASIC[a.basic][0] : '', (a.missing || []).join('; '), a.valid === 1 ? 'Yes' : a.valid === 0 ? 'No' : '', a.handoff || '', t.fcr ? 'Yes' : 'No', t.by, t.url].map(esc).join(','); }));
      var link = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: 't1-cs-voip-' + D.range.from + '-to-' + D.range.to + '.csv' });
      document.body.appendChild(link); link.click(); link.remove();
    }
    // ── share links (admin) ──
    function shareDialog() {
      var old = root.querySelector('.vp-dlg'); if (old) { old.remove(); return; }
      var D = S.data, rangeTxt = S.preset === 'custom' ? 'Fixed dates: ' + (D ? D.range.label : S.from + ' to ' + S.to) : (PRESETS.filter(function (p) { return p[0] === S.preset; })[0] || [0, ''])[1] + ', always up to date';
      var label = h('input', { class: 'vp-in', type: 'text', value: 'T1 CS VoIP report', 'aria-label': 'Link name', maxlength: '120' });
      var out = h('div', { class: 'vp-shout' }), listBox = h('div');
      var dlg = h('section', { class: 'vp-card vp-dlg', role: 'dialog', 'aria-label': 'Share this report' }, [h('div', { class: 'vp-ch' }, [h('h2', { text: 'Share with leadership' }), h('button', { type: 'button', class: 'vp-btn', 'aria-label': 'Close', onclick: function () { dlg.remove(); } }, ['Close'])]),
        h('p', { class: 'vp-muted', text: 'Anyone at Adit can open the link after signing in with their Adit Google account. They see this report read-only, with ticket links. They do not need a tool account. Turn a link off at any time.' }),
        h('div', { class: 'vp-fbar' }, [label, h('span', { class: 'vp-pill', text: rangeTxt }), h('button', { type: 'button', class: 'vp-btn primary', onclick: create }, ['Create link'])]), out, h('h3', { text: 'Links already made' }), listBox]);
      head.after(dlg); label.focus();
      function create() {
        api('/api/voip-project/shares', { label: label.value, preset: S.preset, from: S.from, to: S.to }).then(function (r) {
          var url = location.origin + '/voip-report/' + r.token; clear(out);
          var inp = h('input', { class: 'vp-in vp-url', type: 'text', readonly: '', value: url, 'aria-label': 'Share link' });
          out.appendChild(h('div', { class: 'vp-fbar' }, [inp, h('button', { type: 'button', class: 'vp-btn primary', onclick: function (e) { var b = e.currentTarget; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Copied'; }).catch(function () { inp.select(); }); } }, ['Copy link']), h('a', { class: 'vp-btn', href: url, target: '_blank', rel: 'noopener' }, ['Open'])]));
          loadList();
        }).catch(function (e) { clear(out); out.appendChild(h('p', { class: 'vp-err', text: e.message })); });
      }
      function loadList() {
        api('/api/voip-project/shares').then(function (r) {
          clear(listBox);
          var rows = (r.shares || []).filter(function (x) { return !x.revoked; });
          if (!rows.length) { listBox.appendChild(h('p', { class: 'vp-muted', text: 'None yet.' })); return; }
          listBox.appendChild(h('ul', { class: 'vp-shares' }, rows.map(function (x) {
            var url = location.origin + '/voip-report/' + x.token;
            return h('li', null, [h('a', { href: url, target: '_blank', rel: 'noopener', text: x.label }), h('span', { class: 'vp-muted', text: ' · ' + (x.preset === 'custom' ? x.from_d + ' to ' + x.to_d : (PRESETS.filter(function (p) { return p[0] === x.preset; })[0] || [0, x.preset])[1]) + ' · ' + x.views + ' view' + (x.views === 1 ? '' : 's') + ' · by ' + x.created_by }),
              h('button', { type: 'button', class: 'vp-btn sm', onclick: function () { navigator.clipboard && navigator.clipboard.writeText(url); } }, ['Copy']),
              h('button', { type: 'button', class: 'vp-btn sm', onclick: function () { api('/api/voip-project/shares/' + encodeURIComponent(x.token) + '/revoke', {}).then(loadList); } }, ['Turn off'])]);
          })));
        }).catch(function () {});
      }
      loadList();
    }
    paintHead(); load();
    return { reload: function () { load(true); } };
  }
  window.VoipProject = { mount: mount };
})();
