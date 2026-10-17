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
  // Batch 175: icons, switches, count-up numbers and first-paint motion.
  var ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h6M7 14h10"/>',
    spark: '<path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  };
  function ico(n, sz) { var w = document.createElement('span'); w.style.display = 'inline-flex'; w.setAttribute('aria-hidden', 'true');
    w.innerHTML = '<svg width="' + (sz || 15) + '" height="' + (sz || 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || '') + '</svg>'; return w; }
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function anim(el, i) { if (S.fresh && el) { el.classList.add('bnc-anim'); el.style.setProperty('--i', i || 0); } return el; }
  function countUp(el, to, fmt) {
    if (!S.fresh || REDUCED || !isFinite(to) || to === 0) { el.textContent = fmt(to); return el; }
    var t0 = null, dur = 700; el.textContent = fmt(0);
    function step(t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(p < 1 ? Math.round(to * e) : to); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step); return el;
  }
  function toggle(on, label, onchange, o) {
    o = o || {};
    var b = h('button', { type: 'button', role: 'switch', class: 'bnc-switch' + (o.compact ? ' compact' : ''), 'aria-checked': on ? 'true' : 'false', 'aria-label': o.aria || label, disabled: o.disabled,
      onclick: function () { var v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); if (st) st.textContent = v ? (o.onText || 'On') : (o.offText || 'Off'); onchange(v); } });
    b.appendChild(h('span', { class: 'trk', 'aria-hidden': 'true' }));
    var st = null;
    if (!o.compact) { b.appendChild(h('span', null, [label, ' '])); st = h('span', { class: 'st', text: on ? (o.onText || 'On') : (o.offText || 'Off') }); b.appendChild(st); }
    return b;
  }
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
      S.data = j; S.edits = {}; S.fresh = true; S.ai = null;
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
  function tile(label, value, sub, cls, num, fmt) {
    var v = h('b', { class: 'bnc-tile-v' }); if (num != null) countUp(v, num, fmt || function (x) { return String(x); }); else v.textContent = String(value);
    return h('div', { class: 'bnc-tile ' + (cls || '') }, [h('span', { class: 'bnc-tile-l', text: label }), v, sub ? h('span', { class: 'bnc-tile-s', text: sub }) : null]); }
  function chip(slab, eligible) {
    if (!eligible || !slab) return h('span', { class: 'bnc-chip no', text: 'Not eligible' });
    return h('span', { class: 'bnc-chip ' + slab, text: slab === 's1' ? 'Slab 1' : 'Slab 2' });
  }

  function draw() {
    var root = document.getElementById('bnc-root'); if (!root) return;
    if (!S.value) S.value = defaultValue(S.type);
    var d = S.data;
    var pq = encodeURIComponent(period());
    function dl(kind, title, sub, ic) { return h('a', { class: 'bnc-menu-item', href: '/api/bonus/export?kind=' + kind + '&period=' + pq, role: 'menuitem' }, [h('span', { class: 'ic' }, [ico(ic)]), h('span', null, [h('b', { text: title }), h('span', { text: sub })])]); }
    var menu = h('details', { class: 'bnc-menu' }, [h('summary', { class: 'bnc-btn primary', 'aria-haspopup': 'menu' }, [ico('download'), 'Download']),
      h('div', { class: 'bnc-menu-list', role: 'menu' }, [h('div', { class: 'bnc-menu-h', text: 'For you' }),
        dl('calc', 'Full calculation', 'Every metric, slab, leave factor and amount', 'sheet'),
        dl('cards', 'Agent report cards', 'One card per agent, no rupee amounts', 'card'),
        h('div', { class: 'bnc-menu-sep' }), h('div', { class: 'bnc-menu-h', text: 'For the finance team' }),
        dl('fincalc', 'Finance: calculation', 'Slabs, eligibility, slab split and CSAT, with notes on each cell', 'sheet'),
        dl('findata', 'Finance: data', 'Calls, chats, FCR, ticket surveys, attendance and QA', 'sheet')])]);
    var head = h('div', { class: 'bnc-head' }, [
      h('div', null, [h('h2', { class: 'bnc-h1', text: 'Bonus calculator' }),
        h('p', { class: 'bnc-sub', text: 'T1 CS bonus by the 2026 structure. Calls, tickets, FCR and ticket CSAT come from the tool. On the Inputs tab, enter QA scores and attendance (attendance marked on the Roster is filled in for you) and upload the SalesIQ operator report for chats and chat ratings.' })]),
    ]);
    var toolbar = h('div', { class: 'bnc-toolbar' }, [
      h('div', { class: 'bnc-ctrl' }, [
        seg([['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['mtd', 'Month to date']], S.type, function (v) { S.type = v; S.value = defaultValue(v); load(); }, 'Period type'),
        S.type !== 'mtd' ? h('select', { class: 'bnc-sel period', 'aria-label': 'Period', onchange: function (e) { S.value = e.target.value; load(); } },
          options(S.type).map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === S.value) op.selected = true; return op; })) : null,
        h('button', { type: 'button', class: 'bnc-btn icon', title: 'Refresh', 'aria-label': S.busy ? 'Loading' : 'Refresh', disabled: S.busy, onclick: load }, [(function () { var i = ico('refresh'); if (S.busy) i.classList.add('bnc-spin'); return i; })()]),
      ]),
      h('div', { class: 'bnc-ctrl' }, [menu]),
    ]);
    var kids = [head, toolbar];
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
  function paint(root, kids) { root.innerHTML = ''; kids.forEach(function (k) { if (k) root.appendChild(k); }); S.fresh = false; }

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
        if (m.partial) return h('span', { class: 'bnc-lock open' }, [ico('unlock'), h('b', { text: m.label }), ' in progress']);
        if (m.locked) return h('span', { class: 'bnc-lock done' }, [ico('lock'), h('b', { text: m.label }), ' finalised' + (m.lockedBy ? ' by ' + m.lockedBy.split('@')[0] : '') + (m.lockedAt ? ' on ' + String(m.lockedAt).slice(0, 10) : '') + ' ',
          h('button', { type: 'button', class: 'bnc-link', text: 'Reopen', onclick: function () { lockAction(m, true); } })]);
        return h('span', { class: 'bnc-lock open' }, [ico('unlock'), h('b', { text: m.label }), ' not finalised ', h('button', { type: 'button', class: 'bnc-btn small', text: 'Finalise',  'aria-label': 'Finalise ' + m.label, onclick: function () { lockAction(m, false); } })]);
      }))]);
  }
  // Batch 170: what the Hall of Fame shows agents, with the status tag on top of it.
  function hofCard(d) {
    var card = h('div', { class: 'bnc-card' }, [h('h3', { class: 'bnc-h3', text: 'Hall of Fame' }),
      h('p', { class: 'bnc-card-sub', text: 'The Hall of Fame shows points, slabs and eligibility (never amounts). Agents see the board and only their own breakdown. While the numbers are being checked it carries a "yet to be confirmed" tag; switch it to Validated and confirmed once they are final.' })]);
    var body = h('div', { class: 'bnc-hof' }, [h('span', { class: 'bnc-card-sub', text: 'Loading...' })]);
    card.appendChild(body);
    function paintHof(c) {
      body.innerHTML = '';
      var showing = c.period ? c.period : 'nothing yet';
      var save = function (patch) { api('/api/bonus/hof', patch).then(function (j) { if (!j.success) throw new Error(j.error || 'Could not save'); toast('Hall of Fame updated', 'success'); paintHof(j); }).catch(function (e) { toast(e.message, 'error'); }); };
      var same = c.period === period();
      body.appendChild(h('div', { class: 'bnc-hof-row' }, [
        h('span', { class: 'bnc-live' + (c.visible ? ' on' : '') }, [h('i'), c.visible ? 'Live for agents' : 'Hidden from agents']),
        h('span', { class: 'bnc-live' + (c.status === 'confirmed' ? ' on' : ' prov') }, [h('i'), c.status === 'confirmed' ? 'Validated and confirmed' : 'Yet to be confirmed']),
        h('span', { class: 'bnc-line mute' }, [h('b', { text: 'Showing ' + showing + '.' }), c.at ? ' Last changed ' + String(c.at).slice(0, 16).replace('T', ' ') + (c.by ? ' by ' + c.by.split('@')[0] : '') + '.' : '']),
      ]));
      body.appendChild(h('div', { class: 'bnc-hof-row' }, [
        same ? null : h('button', { type: 'button', class: 'bnc-btn primary', text: 'Show ' + d.label + ' on the Hall of Fame', disabled: S.type === 'mtd', onclick: function () { save({ period: period() }); } }),
        seg([['in_progress', 'In progress'], ['confirmed', 'Validated and confirmed']], c.status, function (v) {
          if (v === c.status) return;
          if (v === 'confirmed') { var open = d.months.filter(function (m) { return !m.locked; }); if (open.length && !window.confirm('Mark the numbers as validated and confirmed? ' + open.map(function (m) { return m.label; }).join(', ') + ' are not finalised yet, so they can still change. Finalise them first if these are the final numbers.')) return; }
          save({ status: v }); }, 'Hall of Fame status'),
        toggle(!!c.visible, 'Visible to agents', function (v) { save({ visible: v }); }, { onText: 'On', offText: 'Off' }),
        h('a', { class: 'bnc-btn', href: '/hall-of-fame.html', target: '_blank', rel: 'noopener' }, [ico('trophy'), 'Open Hall of Fame', ico('ext', 12)]),
      ]));
    }
    api('/api/bonus/hof').then(function (j) { if (j.success) paintHof(j); else body.textContent = j.error || 'Could not load'; });
    return card;
  }
  // Batch 175: AI review of the period (reads the same numbers; never changes one).
  function aiCard(d) {
    var card = h('div', { class: 'bnc-card bnc-ai' });
    var st = S.ai && S.ai.period === period() ? S.ai : null;
    var run = function () { S.ai = { period: period(), busy: true }; draw();
      api('/api/bonus/ai-review', { period: period() }).then(function (j) { if (!j.success) throw new Error(j.error || 'Could not get the AI review'); S.ai = { period: period(), r: j.review }; draw(); })
        .catch(function (e) { S.ai = { period: period(), err: e.message }; draw(); }); };
    card.appendChild(h('div', { class: 'bnc-ai-hd' }, [h('div', null, [h('span', { class: 'bnc-ai-badge' }, [ico('spark', 13), 'AI assistant']),
      h('h3', { class: 'bnc-h3', text: 'What stands out in ' + d.label }),
      h('p', { class: 'bnc-card-sub', text: 'Generate a review (highlights, numbers to double-check, a coaching tip per agent) or ask anything about this period below. The AI only reads the calculation; it never changes a number.' })]),
      h('button', { type: 'button', class: 'bnc-btn' + (st && st.r ? '' : ' primary'), disabled: !!(st && st.busy), onclick: run }, [ico('spark', 14), st && st.busy ? 'Thinking...' : st && st.r ? 'Run again' : 'Generate AI review'])]));
    card.appendChild(aiChat(d));
    if (!st) return card;
    if (st.busy) { card.appendChild(h('div', { 'aria-live': 'polite', 'aria-busy': 'true' }, [h('div', { class: 'bnc-skel', style: 'width:70%' }), h('div', { class: 'bnc-skel', style: 'width:92%' }), h('div', { class: 'bnc-skel', style: 'width:55%' })])); return card; }
    if (st.err) { card.appendChild(h('div', { class: 'bnc-note bad', role: 'alert', text: st.err })); return card; }
    var r = st.r, list = function (arr) { return h('ul', null, arr.map(function (t) { return h('li', { text: t }); })); };
    card.appendChild(h('p', { class: 'bnc-ai-head', text: r.headline }));
    card.appendChild(h('div', { class: 'bnc-ai-grid' }, [
      h('div', { class: 'bnc-ai-col' }, [h('h4', null, [ico('check', 13), 'Highlights']), list(r.highlights || [])]),
      h('div', { class: 'bnc-ai-col' }, [h('h4', null, [ico('alert', 13), 'Worth checking']), list(r.watch || [])]),
      h('div', { class: 'bnc-ai-col' }, [h('h4', null, [ico('bulb', 13), 'Coaching']), h('ul', null, (r.coaching || []).map(function (c) { return h('li', null, [h('b', { text: c.agent + ': ' }), c.tip]); }))]),
    ]));
    card.appendChild(h('p', { class: 'bnc-ai-foot', text: 'AI-written from this calculation' + (r.at ? ' at ' + new Date(r.at).toLocaleTimeString() : '') + '. Check anything important against the numbers below.' }));
    card.appendChild(card.querySelector('.bnc-chat'));
    return card;
  }
  // Batch 176: ask the AI about this period (admin). Same numbers as the table; it never changes them.
  var ADMIN_STARTERS = ['Who is closest to the next slab?', 'Which numbers look unusual?', 'Explain each not-eligible month', 'Draft a Google Chat note for the Hall of Fame (no amounts)'];
  function fmtAns(t) {
    var wrap = h('div'), list = null;
    String(t || '').split(/\n+/).filter(Boolean).forEach(function (l) { var m = l.match(/^\s*[-*\u2022]\s+(.*)$/);
      if (m) { if (!list) { list = h('ul'); wrap.appendChild(list); } list.appendChild(h('li', { text: m[1] })); }
      else { list = null; wrap.appendChild(h('p', { text: l })); } });
    return wrap;
  }
  function askAI(q) {
    var c = S.chat; if (!c || c.asking || !q) return;
    var history = c.msgs.slice(-8); c.msgs.push({ role: 'user', content: q }); c.asking = true; c.followups = []; c.open = true; draw();
    api('/api/bonus/ai-ask', { period: period(), question: q, history: history }).then(function (j) {
      if (!j.success) throw new Error(j.error || 'The AI is not available right now.');
      c.msgs.push({ role: 'assistant', content: j.reply.answer }); c.followups = j.reply.followups || [];
    }).catch(function (e) { c.msgs.push({ role: 'assistant', content: e.message }); })
      .then(function () { c.asking = false; draw(); var i = document.getElementById('bnc-chat-in'); if (i) i.focus(); });
  }
  function aiChat(d) {
    if (!S.chat || S.chat.period !== period()) S.chat = { period: period(), msgs: [], open: false };
    var c = S.chat;
    var box = h('div', { class: 'bnc-chat' });
    var thread = c.msgs.length || c.asking ? h('div', { class: 'bnc-thread', 'aria-live': 'polite' }, c.msgs.map(function (m) {
      return h('div', { class: 'bnc-msg ' + (m.role === 'user' ? 'me' : 'bot') }, [m.role === 'user' ? m.content : fmtAns(m.content)]); }).concat(c.asking ? [h('div', { class: 'bnc-msg bot typing', 'aria-label': 'AI is typing' }, [h('i'), h('i'), h('i')])] : [])) : null;
    if (thread) box.appendChild(h('div', { class: 'bnc-chat-hd' }, [h('b', null, [ico('chat', 14), ' Questions about ' + d.label]),
      h('button', { type: 'button', class: 'bnc-link', text: 'Clear', onclick: function () { S.chat = null; draw(); } })]));
    if (thread) box.appendChild(thread);
    var chips = (c.followups && c.followups.length ? c.followups : (c.msgs.length ? [] : ADMIN_STARTERS)).slice(0, 4);
    if (chips.length && !c.asking) box.appendChild(h('div', { class: 'bnc-chips' }, chips.map(function (q) { return h('button', { type: 'button', class: 'bnc-chip-q', text: q, onclick: function () { askAI(q); } }); })));
    var inp = h('input', { id: 'bnc-chat-in', class: 'bnc-chat-in', type: 'text', maxlength: '500', placeholder: 'Ask about any agent, month, slab or amount...', 'aria-label': 'Ask the AI about this bonus period', disabled: c.asking });
    box.appendChild(h('form', { class: 'bnc-ask', onsubmit: function (e) { e.preventDefault(); var q = inp.value.trim(); if (q) askAI(q); } }, [inp,
      h('button', { type: 'submit', class: 'bnc-send', 'aria-label': 'Send', disabled: c.asking }, [ico('send', 16)])]));
    if (thread) requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });
    return box;
  }
  function summary(d) {
    var wrap = h('div');
    var am = 0, el = 0; d.agents.forEach(function (a) { d.months.forEach(function (m) { am++; if (a.months[m.key].eligible && a.months[m.key].slab) el++; }); });
    wrap.appendChild(h('div', { class: 'bnc-tiles' }, [
      tile('Total bonus', '', 'Slab bonus + CSAT incentive', 'acc', d.totals.total, rs),
      tile('Slab bonus', '', 'After planned-leave cuts', 'blue', d.totals.slab, rs),
      tile('CSAT incentive', '', 'Rs. 150 per Good ticket, Rs. 50 per Happy chat', 'blue', d.totals.csat, rs),
      tile('Eligible months', '', 'Agent-months at 70+ points and 18+ days', el ? 'ok' : 'mute', el, function (x) { return x + ' of ' + am; }),
      tile('Still to enter', '', 'Agent-months missing QA or attendance', (d.missing || []).length ? 'warn' : 'ok', (d.missing || []).length),
    ]));
    Array.prototype.forEach.call(wrap.firstChild.children, function (t, i) { anim(t, i); });
    wrap.appendChild(aiCard(d));
    wrap.appendChild(monthsCard(d));
    wrap.appendChild(hofCard(d));
    ['calls', 'chat'].forEach(function (team) {
      var list = d.agents.filter(function (a) { return a.team === team; }); if (!list.length) return;
      var card = h('div', { class: 'bnc-card' }, [h('h3', { class: 'bnc-h3', text: team === 'chat' ? 'Chat Team' : 'Calls Team' }),
        h('p', { class: 'bnc-card-sub', text: 'Points out of 100, the slab reached, and the amount for each month. Select an agent to see every metric and why.' })]);
      var thead = h('tr', null, [h('th', { scope: 'col', text: 'Agent' })].concat(d.months.map(function (m) { return h('th', { scope: 'col', text: m.label + (m.partial ? ' (to date)' : m.locked ? ' (final)' : '') }); }))
        .concat([h('th', { scope: 'col', class: 'num', text: 'Slab' }), h('th', { scope: 'col', class: 'num', text: 'CSAT' }), h('th', { scope: 'col', class: 'num', text: 'Total' })]));
      var tb = h('tbody');
      list.forEach(function (a) {
        var open = !!S.open[a.email];
        var tr = h('tr', { class: 'bnc-row' + (open ? ' on' : '') }, [h('th', { scope: 'row' }, [h('button', { type: 'button', class: 'bnc-name', 'aria-expanded': open ? 'true' : 'false', onclick: function () { S.open[a.email] = !open; draw(); } }, [h('span', { class: 'bnc-chev' }, [ico('chev', 12)]), a.name]), a.eligible ? null : h('span', { class: 'bnc-tag', text: 'Not eligible this period' })])]
          .concat(d.months.map(function (m) { var x = a.months[m.key];
            if (x.outside) return h('td', null, [h('div', { class: 'bnc-cell' }, [h('span', { class: 'bnc-miss', text: 'Not in T1 CS this month' })])]);
            var bar = h('span', { class: 'bnc-bar ' + (x.points >= 100 ? 'full' : x.eligible ? (x.slab === 's2' ? 's2' : 'ok') : ''), 'aria-hidden': 'true' }, [h('i', { style: 'width:' + Math.min(100, x.points) + '%' })]);
            var whyShort = !x.eligible && x.present === 0 ? 'On leave' : !x.eligible && x.why && x.why.length ? x.why.map(function (w) { return w.replace(/Points below 70 \(scored \d+\)\.?\s*Need (\d+) more\.?/, '$1 pts short of 70').replace(/Present days below 18 \(was ([\d.]+)\)\.?/, '$1 days, needs 18').replace(/\.$/, ''); }).join(', ') : '';
            var amt = x.total ? h('span', { class: 'bnc-amt' }, [rs(x.slabAmt), x.csat && x.csat.amount ? h('small', { text: ' + ' + Math.round(x.csat.amount).toLocaleString('en-IN') + ' CSAT' }) : null]) : h('span', { class: 'bnc-amt', text: '-' });
            if (x.eligible && x.slab && x.slabAmt && x.factor < 1) amt.appendChild(h('small', { text: ' (' + Math.round(x.factor * 100) + '% leave)' }));
            if (x.eligible && x.slab && !x.slabAmt && x.unplanned) amt.appendChild(h('small', { text: ' (unplanned leave)' }));
            return h('td', null, [h('div', { class: 'bnc-cell' }, [h('b', { text: x.points + ' pts' }), bar, chip(x.slab, x.eligible), whyShort ? h('span', { class: 'bnc-why', text: whyShort }) : null, amt, x.missing.length ? h('span', { class: 'bnc-miss', text: 'Needs ' + x.missing.join(' and ') }) : null])]); }))
          .concat([h('td', { class: 'num', text: rs(a.totals.slab) }), h('td', { class: 'num', text: rs(a.totals.csat) }), h('td', { class: 'num strong', text: rs(a.totals.total) })]));
        tb.appendChild(tr);
        if (open) tb.appendChild(h('tr', { class: 'bnc-detail' }, [h('td', { colspan: String(d.months.length + 4) }, [detail(d, a)])]));
      });
      card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table' }, [h('thead', null, [thead]), tb])]));
      wrap.appendChild(anim(card, 6));
    });
    if (d.rawRatings && d.rawRatings.length) wrap.appendChild(h('p', { class: 'bnc-range', text: 'Chat rating values seen from SalesIQ: ' + d.rawRatings.map(function (r) { return '"' + r.raw + '" as ' + (r.rating || 'unknown') + ' (' + r.n + ')'; }).join(', ') + '.' }));
    return wrap;
  }
  function detail(d, a) {
    var ex = h('div', { class: 'bnc-explain' }, [h('button', { type: 'button', class: 'bnc-btn small ai', onclick: function () {
      askAI('Explain ' + a.name + '\'s bonus for ' + d.label + ' month by month: points, slab, leave factor, CSAT, and what would have moved them up.');
      var el = document.querySelector('#bnc-root .bnc-ai'); if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); } }, [ico('spark', 13), 'Explain ' + a.name.split(' ')[0] + ' with AI'])]);
    return h('div', null, [ex, detailGrid(d, a)]);
  }
  function detailGrid(d, a) {
    return h('div', { class: 'bnc-months' }, d.months.map(function (m) {
      var x = a.months[m.key];
      var rows = x.metrics.map(function (mt) {
        var v = mt.value == null ? (mt.key === 'qa' ? 'Not entered' : '-') : mt.pct ? mt.value.toFixed(2) + '%' : mt.value.toFixed(2) + ' ' + mt.unit;
        var raw = mt.raw != null ? ' (' + mt.raw + ')' : '';
        return h('tr', null, [h('td', { text: mt.label }), h('td', { text: v + raw }), h('td', { text: (mt.pct ? mt.s1 + '% / ' + mt.s2 + '%' : mt.s1 + ' / ' + mt.s2) }),
          h('td', null, [mt.outcome === 's1' || mt.outcome === 's2' ? h('span', { class: 'bnc-chip ' + mt.outcome, text: mt.outcome === 's1' ? 'Slab 1' : 'Slab 2' }) : h('span', { class: 'bnc-chip no', text: mt.outcome === 'na' ? 'Not entered' : 'Missed' })]),
          h('td', { class: 'num', text: mt.points + ' / ' + mt.max })]);
      });
      var L = x.leave, leaveTxt = 'Present ' + (x.present == null ? 'not entered' : x.present) + ' (' + (x.attendanceSource === 'roster' ? 'from Roster' : x.attendanceSource) + ')'
        + ', planned ' + L.pl + ', sick ' + L.sl + ', half days ' + (L.hd_pl + L.hd_sl + L.hd_upl) + ', unplanned ' + L.upl + (L.ncns ? ', NCNS ' + L.ncns : '') + (L.fl ? ', floater ' + L.fl + ' (not counted)' : '') + '. Leave count ' + x.leaveCount + '.';
      return h('div', { class: 'bnc-month' }, [h('h4', { text: m.long + (m.partial ? ' (to date)' : '') }),
        h('table', { class: 'bnc-mini' }, [h('thead', null, [h('tr', null, ['Metric', 'Result', 'Slab 1 / Slab 2', 'Outcome', 'Points'].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), h('tbody', null, rows)]),
        h('p', { class: 'bnc-line' }, [h('b', { text: x.points + ' / 100. ' }), x.eligible ? 'Eligible, ' + (x.slab === 's1' ? 'Slab 1' : 'Slab 2') + '. ' : 'Not eligible. ' + x.why.join(' '), x.leaveNote ? ' ' + x.leaveNote : '', x.slabAmt ? ' Slab bonus ' + rs(x.slabAmt) + '.' : '']),
        h('p', { class: 'bnc-line' }, [x.csat.why, x.csat.amount ? ' ' + rs(x.csat.amount) + '.' : '']),
        h('p', { class: 'bnc-line mute', text: leaveTxt }),
        h('p', { class: 'bnc-line mute', text: a.team === 'chat' ? 'Chat ratings ' + x.data.happy + ' Happy, ' + x.data.ok + ' Ok, ' + x.data.bad + ' Bad (' + (x.data.chatSource === 'entered' ? 'entered' : 'SalesIQ') + '). Tickets closed ' + x.data.closed + ', FCR ' + x.data.fcrYes + '.' : 'Ticket surveys ' + x.data.csatGood + ' Good of ' + x.data.csatTotal + '. Tickets closed ' + x.data.closed + ', FCR ' + x.data.fcrYes + '. Inbound calls ' + x.data.inbound + '.' }),
      ]);
    }));
  }

  var COLS = [['qa', 'QA %'], ['present', 'Present days'], ['pl', 'Planned'], ['hd_pl', 'Half-day planned'], ['sl', 'Sick'], ['hd_sl', 'Half-day sick'], ['upl', 'Unplanned'], ['hd_upl', 'Half-day unplanned'], ['ncns', 'NCNS'], ['fl', 'Floater']];
  var CHATCOLS = [['chats', 'Owned'], ['chat_happy', 'Happy'], ['chat_ok', 'Ok'], ['chat_bad', 'Bad']];
  function editKey(email, k) { return S.inMonth + '|' + email + '|' + k; }
  function inputs(d) {
    var month = d.months.filter(function (m) { return m.key === S.inMonth; })[0] || d.months[0];
    var card = h('div', { class: 'bnc-card' }, [
      h('div', { class: 'bnc-card-hd' }, [h('div', null, [h('h3', { class: 'bnc-h3', text: 'QA scores and attendance' }),
        h('p', { class: 'bnc-card-sub', text: 'Grey numbers are what the tool already has (attendance from the Roster, chat ratings and a chat count from SalesIQ); type a number to use yours instead, clear it to go back. Half days count 0.5 toward planned leave and floater leave is not counted; any unplanned day, half day or NCNS removes the month\'s bonus.' })]),
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
        ? x.data.chats + ' chats, ' + x.data.closed + ' tickets, FCR ' + (x.data.closed ? (Math.floor(x.data.fcrYes / x.data.closed * 10000 + 1e-9) / 100).toFixed(2) + '%' : '-')
        : x.data.inbound + ' calls, ' + x.data.closed + ' tickets, FCR ' + (x.data.closed ? (Math.floor(x.data.fcrYes / x.data.closed * 10000 + 1e-9) / 100).toFixed(2) + '%' : '-') + ', CSAT ' + x.data.csatGood + '/' + x.data.csatTotal }));
      tb.appendChild(h('tr', null, tds));
    });
    card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table inputs' }, [h('thead', null, [head]), tb])]));
    var paste = h('textarea', { class: 'bnc-paste', rows: '4', 'aria-label': 'Paste from Excel', placeholder: 'Optional: paste rows from Excel, one agent per line: Agent name, QA %, Present days, Planned, Half-day planned, Sick, Half-day sick, Unplanned, Half-day unplanned, NCNS, Floater' });
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
      h('p', { class: 'bnc-card-sub', text: 'Include an agent, pick the team their metrics are scored on, and switch off bonus eligibility (for example during probation). Set the months someone was in T1 CS when they joined or moved team mid-quarter (blank = no limit); months outside are not worked out or paid. Untick Hall of Fame to keep someone off the agents\' Hall of Fame while still paying them.' })]);
    if (!S.agents) { card.appendChild(h('p', { class: 'bnc-card-sub', text: 'Loading...' })); return card; }
    var tb = h('tbody');
    S.agents.forEach(function (a) {
      function upd(patch) { api('/api/bonus/agents', Object.assign({ email: a.email }, patch)).then(function (j) { if (!j.success) throw new Error(j.error); Object.assign(a, j.agent); toast('Saved ' + a.name, 'success'); S.data = null; load(); }).catch(function (e) { toast(e.message, 'error'); }); }
      var team = h('select', { class: 'bnc-sel', 'aria-label': 'Team for ' + a.name, onchange: function (e) { upd({ team: e.target.value }); } }, [['calls', 'Calls'], ['chat', 'Chat']].map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (a.team === o[0]) op.selected = true; return op; }));
      var inc = toggle(!!a.include, 'Included', function (v) { upd({ include: v }); }, { compact: true, aria: 'Include ' + a.name });
      var el = toggle(!!a.eligible, 'Bonus eligible', function (v) { upd({ eligible: v }); }, { compact: true, aria: 'Bonus eligible: ' + a.name });
      var hof = toggle(a.hof !== false, 'Hall of Fame', function (v) { upd({ hof: v }); }, { compact: true, aria: 'Show ' + a.name + ' on the Hall of Fame' });
      var monIn = function (k, lbl) { return h('input', { type: 'month', class: 'bnc-in month', 'aria-label': lbl + ' for ' + a.name, value: a[k] || '', onchange: function (e) { var p = {}; p[k] = e.target.value || ''; upd(p); } }); };
      tb.appendChild(h('tr', null, [h('th', { scope: 'row' }, [a.name, a.monitored === false ? h('span', { class: 'bnc-tag', text: 'Not on the call monitor' }) : null]), h('td', { text: a.empId || '-' }), h('td', { text: a.doj || '-' }), h('td', null, [inc]), h('td', null, [team]), h('td', null, [el]),
        h('td', null, [monIn('fromMonth', 'In T1 CS from')]), h('td', null, [monIn('toMonth', 'In T1 CS until')]), h('td', null, [hof])]));
    });
    card.appendChild(h('div', { class: 'bnc-scroll' }, [h('table', { class: 'bnc-table' }, [h('thead', null, [h('tr', null, ['Agent', 'Emp Id', 'DOJ', 'Included', 'Team', 'Bonus eligible', 'In T1 CS from', 'In T1 CS until', 'Hall of Fame'].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), tb])]));
    var addEmail = h('input', { class: 'bnc-in wide', type: 'email', placeholder: 'name@adit.com', 'aria-label': 'Email of the agent to add' });
    var addName = h('input', { class: 'bnc-in wide', placeholder: 'Name as in Zoho (e.g. Debra Horton)', 'aria-label': 'Name of the agent to add' });
    var addTeam = h('select', { class: 'bnc-sel', 'aria-label': 'Team of the agent to add' }, [h('option', { value: 'calls', text: 'Calls' }), h('option', { value: 'chat', text: 'Chat' })]);
    card.appendChild(h('details', { class: 'bnc-pastebox' }, [h('summary', { text: 'Add someone who is not on the call monitor (moved to another team)' }),
      h('div', { class: 'bnc-actions' }, [addEmail, addName, addTeam, h('button', { type: 'button', class: 'bnc-btn primary', text: 'Find in RingCentral and add', onclick: function () {
        var em = addEmail.value.trim(), nm = addName.value.trim(); if (!em || !nm) { toast('Enter the email and the name', 'warning'); return; }
        api('/api/rc-search?q=' + encodeURIComponent(nm)).then(function (r) {
          var hit = (r.data || []).filter(function (x) { return String(x.email || '').toLowerCase() === em.toLowerCase(); })[0];
          return api('/api/bonus/agents', { email: em, name: nm, team: addTeam.value, include: true, eligible: true, rcId: hit ? hit.id : '', extension: hit ? hit.extension : '' }).then(function (j) {
            if (!j.success) throw new Error(j.error || 'Could not add'); toast('Added ' + nm + (hit ? ' (RingCentral extension ' + hit.extension + ')' : ' (no RingCentral extension found, calls will be blank)'), hit ? 'success' : 'warning'); S.agents = null; loadAgents(); S.data = null; load(); });
        }).catch(function (e) { toast(e.message, 'error'); });
      } })])]));
    card.appendChild(h('div', { class: 'bnc-actions' }, [h('button', { type: 'button', class: 'bnc-btn', text: 'Read chat ratings again from 1 Jul', onclick: function () {
      api('/api/bonus/chat-ratings/reread', { from: '2026-07-01T05:00:00Z' }).then(function (j) { toast(j.running ? 'Already reading chats; refresh in a few minutes.' : 'Reading chats from SalesIQ in the background; refresh in a few minutes.', 'info'); });
    } })]));
    return card;
  }

  document.addEventListener('click', function (e) { document.querySelectorAll('#bnc-root details.bnc-menu[open]').forEach(function (m) { if (!m.contains(e.target)) m.removeAttribute('open'); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('#bnc-root details.bnc-menu[open]').forEach(function (m) { m.removeAttribute('open'); var sm = m.querySelector('summary'); if (sm) sm.focus(); }); });
  window.openBonusCalc = function () { if (!S.data || Date.now() - (S.at || 0) > 5 * 60000) { S.at = Date.now(); if (!S.value) S.value = defaultValue(S.type); load(); } else draw(); };
})();
