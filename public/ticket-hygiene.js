/* Batch 260: T1 CS ticket hygiene. Read-only buckets, dashboards and a Google Chat message to copy. Admins and SPOCs. */
(function () {
  'use strict';
  var BUCKETS = ['unactioned', 'followup', 'closure', 'check', 'notdue'];
  var BL = { unactioned: 'Unactioned', followup: 'Follow-up required', closure: 'Possible closure', check: 'Check before closing', notdue: 'Not yet due' };
  var BHELP = {
    unactioned: 'Acknowledged more than 24 h ago with no agent action since, or no contact with the client at all.',
    followup: 'The client wrote last, only a note for 24 h, an active status gone quiet, promised work, a status that does not match, or a complaint.',
    closure: 'The client confirmed, or the agent spoke last 2+ business days ago with a fix, a chase, or a repeated information request.',
    check: 'Would be closable, but only one email was sent or the fix is unclear.',
    notdue: 'Waiting within the expected time, or an open dependency.'
  };
  var AI_CODES = ['client', 'complaint', 'status', 'promise', 'confirmed', 'fix_answer', 'chase', 'info2', 'unclear'];
  var STATUS_ORDER = ['Open', 'Pending Adit', 'Working', 'Pending Customer', 'Pending Meeting', 'Pending Review - T1', 'Resolution Follow-up', 'Pending with T2'];
  var S = { rep: null, trend: [], view: 'overview', f: { bucket: 'followup', agent: '', category: '', q: '' }, polling: null, root: null };

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.setAttribute('style', v); else el.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function api(url, opt) {
    return fetch(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opt || {})).then(function (r) { return r.json().catch(function () { return { success: false, error: 'Bad response' }; }); });
  }
  function ago(ms) { if (!ms) return ''; var hr = (Date.now() - ms) / 3600000; return hr < 1 ? Math.max(1, Math.round(hr * 60)) + 'm' : hr < 48 ? Math.round(hr) + 'h' : Math.round(hr / 24) + 'd'; }
  function asOf(ms) { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) + ' CT'; } catch (e) { return new Date(ms).toLocaleString(); } }
  function statusIdx(s) { var i = STATUS_ORDER.indexOf(s); return i < 0 ? 99 : i; }
  function statusKeys(rep) { return Object.keys(rep.dash.byStatus).sort(function (a, b) { return statusIdx(a) - statusIdx(b) || rep.dash.byStatus[b] - rep.dash.byStatus[a]; }); }
  function sCls(i) { return 'th-c' + Math.min(i, 7); }

  // ── shell ────────────────────────────────────────────────────────────
  function mount(root) {
    S.root = root; root.className = 'th'; root.replaceChildren(h('p', { class: 'th-muted', text: 'Loading ticket hygiene...' }));
    load();
    startLive();
    return { refresh: load };
  }
  // Batch 264: the page checks for a newer read every minute (the server refreshes every 15 minutes on business hours)
  // and redraws in place, keeping the tab, filters and scroll. It waits while someone is typing.
  function startLive() {
    if (S.live) return;
    S.live = setInterval(function () {
      if (!S.root || !document.body.contains(S.root) || document.hidden) return;
      api('/api/ticket-hygiene' + (S.rep ? '?since=' + S.rep.at : '')).then(function (r) {
        if (!r || !r.success) return;
        var changed = !r.unchanged && r.report && (!S.rep || r.report.at > S.rep.at);
        var runChanged = !!r.running !== !!S.running;
        if (changed) { S.rep = r.report; S.trend = r.trend || []; }
        S.running = r.running; S.error = r.error;
        if (!changed && !runChanged) { tickAge(); return; }
        var a = document.activeElement;
        if (a && S.root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { S.pendingRender = true; return; }
        var y = window.scrollY; render(); window.scrollTo(0, y);
        if (changed) toast('Updated with the latest read');
      });
    }, 60000);
  }
  function ageText(ms) { var m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
  function tickAge() { var el = S.root && S.root.querySelector('.th-age'); if (el && S.rep) el.textContent = 'Updated ' + ageText(S.rep.at); if (S.pendingRender && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) { S.pendingRender = false; var y = window.scrollY; render(); window.scrollTo(0, y); } }
  function load() {
    return api('/api/ticket-hygiene').then(function (r) {
      if (!r || !r.success) { S.root.replaceChildren(h('div', { class: 'th-card th-note', text: (r && r.error) || 'Could not load ticket hygiene.' })); return; }
      S.rep = r.report; S.trend = r.trend || []; S.running = r.running; S.error = r.error;
      render();
      if (r.running) poll();
    });
  }
  function poll() { if (S.polling) return; S.polling = setInterval(function () { api('/api/ticket-hygiene').then(function (r) { if (r && r.success && !r.running) { clearInterval(S.polling); S.polling = null; S.rep = r.report; S.trend = r.trend || []; S.running = false; S.error = r.error; render(); } }); }, 6000); }
  function runNow(btn) {
    btn.disabled = true; btn.textContent = 'Reading tickets...';
    api('/api/ticket-hygiene/run', { method: 'POST', body: '{}' }).then(function (r) {
      if (!r || !r.success) { btn.disabled = false; btn.textContent = 'Refresh now'; toast((r && r.error) || 'Could not start the refresh'); return; }
      S.running = true; render(); poll();
    });
  }
  function toast(msg) { var t = h('div', { class: 'th-toast', role: 'status', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  function copy(text, btn) {
    var done = function () { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed, select the text and copy it'); } ta.remove(); }
  }

  function render() {
    var rep = S.rep;
    var head = h('div', { class: 'th-head' }, [
      h('div', null, [h('h1', { text: 'T1 CS ticket hygiene' }),
        h('p', { class: 'th-sub', text: 'Every open T1 CS ticket, sorted by what it needs next. Read-only: nothing is changed in Desk and nothing is posted. Times are Central; business days are Mon to Fri, 7 AM to 7 PM.' })]),
      h('div', { class: 'th-ctl' }, [
        rep ? h('span', { class: 'th-asof', title: 'Refreshes every 15 minutes on business days (7 AM to 7 PM CT), hourly otherwise' }, [h('span', { text: 'As of ' + asOf(rep.at) + ' \u00b7 ' }), h('span', { class: 'th-age', text: 'Updated ' + ageText(rep.at) }), S.running ? h('span', { class: 'th-live', text: ' \u00b7 refreshing now' }) : null]) : null,
        rep ? h('span', { class: 'th-pill conf-' + rep.confidence.toLowerCase(), title: 'How complete the data and AI labels were for this read', text: rep.confidence + ' confidence' }) : null,
        h('button', { type: 'button', class: 'th-btn', disabled: S.running ? true : null, text: S.running ? 'Reading tickets...' : 'Refresh now', onclick: function (e) { runNow(e.currentTarget); } }),
        rep ? h('button', { type: 'button', class: 'th-btn primary', text: 'Copy Chat message', title: 'Copies the AI message when you have written one for this read, otherwise the standard one', onclick: function (e) { var C = S.chat || {}; copy(C.message && C.at === rep.at ? C.message : rep.chat, e.currentTarget); } }) : null
      ])
    ]);
    var kids = [head];
    if (S.error && (!rep || S.error.at > rep.at)) kids.push(h('div', { class: 'th-card th-note bad', role: 'alert', text: 'The last refresh failed: ' + S.error.msg }));
    if (!rep) {
      kids.push(h('div', { class: 'th-card th-empty' }, [h('p', { text: S.running ? 'Reading every open T1 CS ticket and its conversation. This takes a minute or two.' : 'No read yet. Press Refresh now to build the first one.' })]));
      S.root.replaceChildren.apply(S.root, kids); return;
    }
    var seg = h('div', { class: 'th-seg', role: 'tablist', 'aria-label': 'Ticket hygiene views' }, [['overview', 'Overview'], ['ask', 'Ask AI'], ['agents', 'Agents'], ['tickets', 'Tickets'], ['transfers', 'Transfers'], ['teams', 'All teams'], ['chat', 'Chat message']].map(function (t) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': S.view === t[0] ? 'true' : 'false', text: t[1], onclick: function () { S.view = t[0]; render(); } });
    }));
    kids.push(kpis(rep), seg);
    var body = h('div', { class: 'th-body' });
    kids.push(body);
    S.root.replaceChildren.apply(S.root, kids);
    ({ overview: viewOverview, ask: viewAsk, agents: viewAgents, tickets: viewTickets, transfers: viewTransfers, teams: viewTeams, chat: viewChat })[S.view](body, rep);
  }
  function go(bucket, agent, category, status) { S.view = 'tickets'; S.f = { bucket: bucket || '', agent: agent || '', category: category || '', status: status || '', q: '' }; render(); window.scrollTo && S.root.scrollIntoView({ block: 'start' }); }

  function kpis(rep) {
    var c = rep.counts;
    var tiles = [['', 'Open', rep.total, rep.esc + ' escalated']].concat(BUCKETS.map(function (b) { return [b, BL[b], c[b] || 0, b === 'unactioned' ? rep.newCount + ' new, under 24 h' : b === 'notdue' ? rep.dependencies + ' with a dependency' : Math.round(100 * (c[b] || 0) / Math.max(1, rep.total)) + '% of open']; }));
    tiles.push(['pc', 'Pending Customer, no owner', rep.unownedPC.length, 'need an owner']);
    return h('div', { class: 'th-kpis' }, tiles.map(function (t) {
      return h('button', { type: 'button', class: 'th-kpi' + (t[0] && t[0] !== 'pc' ? ' b-' + t[0] : '') + (t[0] === 'pc' && t[2] ? ' warn' : ''), title: BHELP[t[0]] || null, onclick: function () { if (t[0] === 'pc') { S.view = 'tickets'; S.f = { bucket: '', agent: '', category: '', q: '', unownedPC: true }; render(); } else go(t[0]); } }, [
        h('span', { class: 'th-kpi-l' }, [t[0] && t[0] !== 'pc' ? h('i', { class: 'th-dot b-' + t[0], 'aria-hidden': 'true' }) : null, t[1]]), h('b', { text: String(t[2]) }), h('span', { class: 'th-kpi-s', text: t[3] })]);
    }));
  }

  // ── charts (HTML bars: theme aware, readable without color) ─────────
  function legend(items) { return h('div', { class: 'th-legend' }, items.map(function (it) { return h('span', null, [h('i', { class: 'th-sw ' + it[1], 'aria-hidden': 'true' }), it[0]]); })); }
  // Batch 264: one shared hover tooltip for every chart mark (data-tip), and value labels on marks wide enough to hold them.
  var TIP = null;
  function tipOn(e) {
    var t = e.target.closest && e.target.closest('[data-tip]'); if (!t) return;
    if (!TIP) { TIP = h('div', { class: 'th-tip', role: 'tooltip' }); document.body.appendChild(TIP); }
    TIP.textContent = t.getAttribute('data-tip'); TIP.style.display = 'block';
    var r = t.getBoundingClientRect(), w = TIP.offsetWidth;
    TIP.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    TIP.style.top = Math.max(8, r.top - TIP.offsetHeight - 8 + window.scrollY) + 'px';
  }
  function tipOff() { if (TIP) TIP.style.display = 'none'; }
  document.addEventListener('mouseover', tipOn); document.addEventListener('focusin', tipOn);
  document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest('[data-tip]')) tipOff(); }); document.addEventListener('focusout', tipOff);
  function pctOf(v, t) { return t ? Math.round(100 * v / t) + '%' : ''; }
  function stacked(rows, keys, clsOf, labelOf, onRow, onSeg) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));
    return h('div', { class: 'th-bars' }, rows.map(function (r) {
      var segs = keys.filter(function (k) { return r.parts[k]; }).map(function (k) {
        var v = r.parts[k], w = 100 * v / max;
        return h('span', { class: 'th-seg-b ' + clsOf(k), style: 'width:' + w + '%', 'data-tip': r.label + ' \u00b7 ' + labelOf(k) + ': ' + v + ' (' + pctOf(v, r.total) + ' of ' + r.total + ')', onclick: onSeg ? function (e) { e.stopPropagation(); onSeg(r, k); } : null },
          w >= 6 ? h('em', { class: 'th-seg-v', text: String(v) }) : null);
      });
      return h('div', { class: 'th-bar-row' + (onRow ? ' click' : ''), role: onRow ? 'button' : null, tabindex: onRow ? '0' : null, 'aria-label': r.label + ', ' + r.total + ': ' + keys.filter(function (k) { return r.parts[k]; }).map(function (k) { return labelOf(k) + ' ' + r.parts[k]; }).join(', '),
        onclick: onRow ? function () { onRow(r); } : null, onkeydown: onRow ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } } : null }, [
        h('span', { class: 'th-bar-l', title: r.label, text: r.label }), h('span', { class: 'th-bar-t' }, segs), h('span', { class: 'th-bar-n', text: String(r.total) })]);
    }));
  }
  function simple(pairs, cls, onRow, noPct) {
    var max = Math.max.apply(null, pairs.map(function (p) { return p[1]; }).concat([1]));
    var sum = noPct ? 0 : pairs.reduce(function (a, p) { return a + (Number(p[1]) || 0); }, 0);
    return h('div', { class: 'th-bars' }, pairs.map(function (p) {
      return h('div', { class: 'th-bar-row' + (onRow ? ' click' : ''), role: onRow ? 'button' : null, tabindex: onRow ? '0' : null, 'aria-label': p[0] + ': ' + p[1], onclick: onRow ? function () { onRow(p[0]); } : null, onkeydown: onRow ? function (e) { if (e.key === 'Enter') onRow(p[0]); } : null }, [
        h('span', { class: 'th-bar-l', title: p[0], text: p[0] }), h('span', { class: 'th-bar-t' }, [p[1] ? h('span', { class: 'th-seg-b ' + cls, style: 'width:' + (100 * p[1] / max) + '%', 'data-tip': p[0] + ': ' + p[1] + (sum ? ' (' + pctOf(p[1], sum) + ' of ' + sum + ')' : '') }) : null]), h('span', { class: 'th-bar-n' }, [String(p[1]), sum ? h('small', { text: ' ' + pctOf(p[1], sum) }) : null])]);
    }));
  }
  function card(title, sub, body, wide) { return h('section', { class: 'th-card' + (wide ? ' wide' : '') }, [h('div', { class: 'th-ch' }, [h('h2', { text: title }), sub ? h('p', { text: sub }) : null]), body]); }
  function trendChart(pts) {
    if (pts.length < 2) return h('p', { class: 'th-muted th-small', text: 'The trend fills in as the page refreshes each business hour. ' + pts.length + ' day so far.' });
    var W = 1000, Hh = 200, P = 30, max = Math.max.apply(null, pts.map(function (p) { return p.total || 0; }).concat([1]));
    var x = function (i) { return P + (W - 2 * P) * i / (pts.length - 1); }, y = function (v) { return Hh - P - (Hh - 2 * P) * v / max; };
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh); svg.setAttribute('class', 'th-trend'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Open tickets per day by bucket, last ' + pts.length + ' days');
    [0, 0.5, 1].forEach(function (f) { var l = document.createElementNS(ns, 'line'); l.setAttribute('x1', P); l.setAttribute('x2', W - P); l.setAttribute('y1', y(max * f)); l.setAttribute('y2', y(max * f)); l.setAttribute('class', 'th-grid'); svg.appendChild(l);
      var t = document.createElementNS(ns, 'text'); t.setAttribute('x', 2); t.setAttribute('y', y(max * f) + 4); t.setAttribute('class', 'th-axis'); t.textContent = Math.round(max * f); svg.appendChild(t); });
    ['total'].concat(BUCKETS.slice(0, 4)).forEach(function (k) {
      var pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', pts.map(function (p, i) { return x(i) + ',' + y(p[k] || 0); }).join(' ')); pl.setAttribute('class', 'th-line ' + (k === 'total' ? 'tot' : 'b-' + k)); svg.appendChild(pl);
      pts.forEach(function (p, i) { var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x(i)); c.setAttribute('cy', y(p[k] || 0)); c.setAttribute('r', 4); c.setAttribute('class', 'th-pt ' + (k === 'total' ? 'tot' : 'b-' + k));
        c.setAttribute('data-tip', p.day + ' \u00b7 ' + (k === 'total' ? 'Open' : BL[k]) + ': ' + (p[k] || 0)); c.setAttribute('tabindex', '0'); svg.appendChild(c); });
      var lp = pts[pts.length - 1], tl = document.createElementNS(ns, 'text'); tl.setAttribute('x', x(pts.length - 1) - 8); tl.setAttribute('y', y(lp[k] || 0) - 8); tl.setAttribute('text-anchor', 'end'); tl.setAttribute('class', 'th-dl ' + (k === 'total' ? 'tot' : 'b-' + k)); tl.textContent = lp[k] || 0; svg.appendChild(tl);
    });
    [0, pts.length - 1].forEach(function (i) { var t = document.createElementNS(ns, 'text'); t.setAttribute('x', x(i)); t.setAttribute('y', Hh - 6); t.setAttribute('text-anchor', i ? 'end' : 'start'); t.setAttribute('class', 'th-axis'); t.textContent = pts[i].day.slice(5); svg.appendChild(t); });
    return h('div', null, [legend([['Open', 'tot']].concat(BUCKETS.slice(0, 4).map(function (b) { return [BL[b], 'b-' + b]; }))), svg]);
  }

  function viewOverview(body, rep) {
    var d = rep.dash, sk = statusKeys(rep);
    var summary = h('section', { class: 'th-card wide th-sum' }, [
      h('div', { class: 'th-ch' }, [h('h2', { text: 'Manager summary' })]),
      h('p', { class: 'th-sum-t', text: rep.summary }),
      rep.unownedPC.length ? h('p', { class: 'th-small' }, [h('b', { text: 'Pending Customer with no owner: ' })].concat(rep.unownedPC.map(function (r, i) { return h('span', null, [i ? ', ' : '', r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener', text: '#' + r.number }) : '#' + r.number]); }))) : null,
      h('details', { class: 'th-limits' }, [h('summary', { text: 'Data limits (' + rep.limits.length + ')' }), h('ul', null, rep.limits.map(function (l) { return h('li', { text: l }); })),
        h('p', { class: 'th-small th-muted', text: 'AI labels: ' + (rep.ai.cached + rep.ai.ran) + ' tickets (' + rep.ai.ran + ' new this read)' + (rep.ai.failed ? ', ' + rep.ai.failed + ' failed' : '') + '. Code decides times, owners, statuses and dependencies; the AI only reads the last client message and the last agent reply.' })])
    ]);
    var agentRows = d.byAgent.map(function (a) { return { label: a.agent, total: a.total, parts: a.statuses, a: a }; });
    var agentB = d.byAgent.map(function (a) { return { label: a.agent, total: a.total, parts: a.buckets }; });
    var cats = Object.keys(d.categoryByBucket).map(function (c) { var p = d.categoryByBucket[c]; return { label: c, parts: p, total: BUCKETS.reduce(function (s, b) { return s + (p[b] || 0); }, 0) }; }).sort(function (a, b) { return b.total - a.total; });
    var grid = h('div', { class: 'th-grid' }, [
      summary,
      card('Open tickets by agent and status', 'Select an agent to see their tickets.', h('div', null, [legend(sk.map(function (s, i) { return [s, sCls(i)]; })), stacked(agentRows, sk, function (k) { return sCls(sk.indexOf(k)); }, function (k) { return k; }, function (r) { go('', r.label); })])),
      card('What each agent needs to do', 'Buckets per agent. Select a colour to open that list.', h('div', null, [legend(BUCKETS.map(function (b) { return [BL[b], 'b-' + b]; })), stacked(agentB, BUCKETS, function (k) { return 'b-' + k; }, function (k) { return BL[k]; }, function (r) { go('', r.label); }, function (r, k) { go(k, r.label); })])),
      card('Issue category (AI)', 'The AI reads the subject, description, conversation, notes, call transcripts and owner history, and names a specific category for every ticket. Split by bucket.', h('div', null, [legend(BUCKETS.map(function (b) { return [BL[b], 'b-' + b]; })), stacked(cats, BUCKETS, function (k) { return 'b-' + k; }, function (k) { return BL[k]; }, function (r) { go('', '', r.label); }, function (r, k) { go(k, '', r.label); })])),
      card('Tickets by status', 'Select a status to see its tickets.', simple(sk.map(function (s) { return [s, d.byStatus[s]]; }), 'th-c0', function (st) { go('', '', '', st); })),
      card('Ticket age', 'Since the ticket was created.', simple(d.byAge, 'th-c1')),
      card('Time since our last contact', 'Business days, Mon to Fri, 7 AM to 7 PM CT.', simple(d.byIdle, 'th-c2')),
      card('Adit app module', 'From the Desk module field.', simple(d.byModule, 'th-c3')),
      card('Channel', 'How the ticket came in.', simple(Object.keys(d.byChannel).sort(function (a, b) { return d.byChannel[b] - d.byChannel[a]; }).map(function (k) { return [k, d.byChannel[k]]; }), 'th-c5')),
      card('Trend, last 30 days', 'Last read of each day.', trendChart(S.trend), true)
    ]);
    body.appendChild(grid);
  }

  function viewAgents(body, rep) {
    var rows = rep.dash.byAgent;
    var tbl = h('table', { class: 'th-table' }, [
      h('thead', null, h('tr', null, [h('th', { scope: 'col', text: 'Agent' }), h('th', { scope: 'col', class: 'n', text: 'Open' })].concat(BUCKETS.map(function (b) { return h('th', { scope: 'col', class: 'n', title: BHELP[b] }, [h('i', { class: 'th-dot b-' + b, 'aria-hidden': 'true' }), BL[b]]); }), [h('th', { scope: 'col', class: 'n', text: 'Escalated' }), h('th', { scope: 'col', class: 'n', text: 'Oldest' })]))),
      h('tbody', null, rows.map(function (a) {
        return h('tr', null, [h('th', { scope: 'row' }, [h('button', { type: 'button', class: 'th-link', text: a.agent, onclick: function () { go('', a.agent); } }), a.inferred ? h('span', { class: 'th-muted th-small', title: 'Tickets with no owner, listed under the last agent who replied', text: ' †' + a.inferred }) : null]),
          h('td', { class: 'n', text: String(a.total) })].concat(BUCKETS.map(function (b) { var n = a.buckets[b] || 0; return h('td', { class: 'n' }, n ? h('button', { type: 'button', class: 'th-link', text: String(n), 'aria-label': a.agent + ' ' + BL[b] + ' ' + n, onclick: function () { go(b, a.agent); } }) : h('span', { class: 'th-muted', text: '0' })); }),
          [h('td', { class: 'n', text: String(a.esc || 0) }), h('td', { class: 'n', text: a.oldest + 'd' })]));
      }))
    ]);
    body.appendChild(card('Agent workload', '† tickets with no owner, attributed to the last agent who replied.', h('div', { class: 'th-scroll' }, tbl), true));
  }

  function filtered(rep) {
    var f = S.f, q = (f.q || '').toLowerCase();
    return rep.tickets.filter(function (r) {
      if (f.unownedPC) return !r.owner && /pending customer/i.test(r.status);
      if (f.bucket && r.bucket !== f.bucket) return false;
      if (f.agent && r.agent !== f.agent) return false;
      if (f.category && r.category !== f.category) return false;
      if (f.status && r.status !== f.status) return false;
      if (q && !(String(r.number).indexOf(q) >= 0 || (r.subject || '').toLowerCase().indexOf(q) >= 0 || (r.account || '').toLowerCase().indexOf(q) >= 0)) return false;
      return true;
    }).sort(function (a, b) { return BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || (b.esc - a.esc) || ((a.lastContact || a.created || 0) - (b.lastContact || b.created || 0)); });
  }
  function viewTickets(body, rep) {
    var f = S.f;
    var agents = rep.dash.byAgent.map(function (a) { return a.agent; });
    var cats = Array.from(new Set(rep.tickets.map(function (r) { return r.category; }))).sort();
    function sel(label, val, opts, key) {
      return h('label', { class: 'th-fl' }, [h('span', { text: label }), (function () { var s = h('select', { class: 'th-in', onchange: function (e) { S.f[key] = e.target.value; S.f.unownedPC = false; render(); } }, [h('option', { value: '', text: 'All' })].concat(opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }))); s.value = val || ''; return s; })()]);
    }
    var bar = h('div', { class: 'th-filters' }, [
      sel('Bucket', f.bucket, BUCKETS.map(function (b) { return [b, BL[b] + ' (' + (rep.counts[b] || 0) + ')']; }), 'bucket'),
      sel('Agent', f.agent, agents.map(function (a) { return [a, a]; }), 'agent'),
      sel('Status', f.status, statusKeys(rep).map(function (st) { return [st, st + ' (' + rep.dash.byStatus[st] + ')']; }), 'status'),
      sel('Category', f.category, cats.map(function (c) { return [c, c]; }), 'category'),
      h('label', { class: 'th-fl grow' }, [h('span', { text: 'Search' }), h('input', { class: 'th-in', type: 'search', placeholder: 'Ticket number, subject or account', value: f.q || '', oninput: debounce(function (e) { S.f.q = e.target.value; var pos = e.target.selectionStart; render(); var i = S.root.querySelector('.th-filters input'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 250) })]),
      (f.bucket || f.agent || f.category || f.status || f.q || f.unownedPC) ? h('button', { type: 'button', class: 'th-btn sm', text: 'Clear', onclick: function () { S.f = { bucket: '', agent: '', category: '', status: '', q: '' }; render(); } }) : null
    ]);
    var list = filtered(rep);
    var head = h('p', { class: 'th-small th-muted', text: list.length + ' ticket' + (list.length === 1 ? '' : 's') + (f.unownedPC ? ' Pending Customer with no owner' : '') + (f.bucket ? ' · ' + BHELP[f.bucket] : '') });
    var rows = list.slice(0, 300).map(function (r) {
      return h('div', { class: 'th-row' }, [
        h('span', { class: 'th-b b-' + r.bucket, title: BL[r.bucket], text: r.isNew ? 'New' : BL[r.bucket] }),
        h('div', { class: 'th-row-m' }, [
          h('div', { class: 'th-row-t' }, [r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener', text: '#' + r.number }) : h('b', { text: '#' + r.number }), ' ', h('span', { class: 'th-subj', text: r.subject || '(no subject)' })]),
          r.issue ? h('div', { class: 'th-row-i', text: r.issue }) : null,
          h('div', { class: 'th-row-r', text: r.reason + (r.ai && r.ai.why && AI_CODES.indexOf(r.code) >= 0 ? ' · AI: ' + r.ai.why : '') }),
          h('div', { class: 'th-chips' }, [
            h('span', { class: 'th-chip', text: r.agent + (r.inferred ? ' †' : '') }), h('span', { class: 'th-chip', text: r.status }), h('span', { class: 'th-chip', text: r.category }),
            r.ageDays != null ? h('span', { class: 'th-chip', text: r.ageDays + 'd old' }) : null,
            r.lastContact ? h('span', { class: 'th-chip', text: 'last contact ' + ago(r.lastContact) }) : h('span', { class: 'th-chip warn', text: 'never contacted' }),
            r.esc ? h('span', { class: 'th-chip bad', text: 'Escalated' }) : null,
            r.dependency ? h('span', { class: 'th-chip info', text: 'Dependency: ' + r.depWhy }) : null,
            r.hops >= 2 ? h('span', { class: 'th-chip' + (r.hops >= 4 ? ' warn' : ''), title: 'Owner changes in Desk' + (r.teamsVisited && r.teamsVisited.length ? ', through ' + r.teamsVisited.join(', ') : ''), text: r.hops + ' owner moves' }) : null,
            r.dup ? h('span', { class: 'th-chip warn', title: 'Same account and subject as ' + r.dup.join(', '), text: 'Possible duplicate' }) : null,
            r.account ? h('span', { class: 'th-chip mute', text: r.account }) : null
          ])
        ])
      ]);
    });
    body.appendChild(h('section', { class: 'th-card wide' }, [bar, head, rows.length ? h('div', { class: 'th-list' }, rows) : h('p', { class: 'th-empty', text: 'Nothing matches these filters.' }), list.length > 300 ? h('p', { class: 'th-small th-muted', text: 'Showing the first 300. Narrow the filters to see the rest.' }) : null]));
  }
  function debounce(fn, ms) { var t; return function (e) { clearTimeout(t); var ev = e; t = setTimeout(function () { fn(ev); }, ms); }; }


  // ── Transfers (Batch 263) ────────────────────────────────────────────
  function kv(rows, key, val) { return (rows || []).map(function (r) { return [String(r[key]), Number(r[val]) || 0]; }); }
  function staticTiles(list) {
    return h('div', { class: 'th-kpis' }, list.map(function (x) { return h('div', { class: 'th-kpi static' }, [h('span', { class: 'th-kpi-l', text: x[0] }), h('b', { text: String(x[1]) }), h('span', { class: 'th-kpi-s', text: x[2] })]); }));
  }
  function viewTransfers(body, rep) {
    var t = rep.transfers;
    if (!t) { body.appendChild(h('div', { class: 'th-card th-empty', text: 'Transfers fill in on the next refresh.' })); return; }
    var bad = (t.byResult || []).filter(function (r) { return r.k === 'Returned to T1'; })[0];
    var moved2 = (t.open.byHops || []).slice(2).reduce(function (a, x) { return a + x[1]; }, 0);
    body.appendChild(staticTiles([
      ['Transfers out of T1, 30 days', t.total, 'from Transfer review'],
      ['Returned to T1', bad ? bad.n : 0, t.total ? Math.round(100 * (bad ? bad.n : 0) / t.total) + '% not valid' : 'none'],
      ['Open tickets moved 2+ times', moved2, 'owner changes in Desk'],
      ['Ping-pong tickets', (t.open.pingPong || []).length, '4+ owner moves']
    ]));
    var agentRows = (t.byAgent || []).map(function (r) { return { label: r.k, total: r.n, parts: { good: r.good || 0, bad: r.bad || 0, other: Math.max(0, r.n - (r.good || 0) - (r.bad || 0)) } }; });
    var teamRows = (t.byTeam || []).map(function (r) { return { label: r.k, total: r.n, parts: { ok: r.n - (r.bad || 0), bad: r.bad || 0 } }; });
    var TL = { good: 'Approved', bad: 'Returned to T1', other: 'Waiting or moved without review', ok: 'Not returned' };
    var tcls = function (k) { return { good: 'b-closure', bad: 'b-unactioned', other: 'b-notdue', ok: 'b-check' }[k]; };
    var none = function (msg) { return h('p', { class: 'th-muted th-small', text: msg }); };
    body.appendChild(h('div', { class: 'th-grid' }, [
      card('Where T1 sends tickets', 'Last 30 days, by the team it went to.', teamRows.length ? h('div', null, [legend([['Not returned', 'b-check'], ['Returned to T1', 'b-unactioned']]), stacked(teamRows, ['ok', 'bad'], tcls, function (k) { return TL[k]; })]) : none('No transfers in the last 30 days.')),
      card('Transfers by agent', 'Last 30 days. Returned means the reviewer sent it back as not valid.', agentRows.length ? h('div', null, [legend([['Approved', 'b-closure'], ['Returned to T1', 'b-unactioned'], ['Waiting or moved without review', 'b-notdue']]), stacked(agentRows, ['good', 'bad', 'other'], tcls, function (k) { return TL[k]; })]) : none('No transfers in the last 30 days.')),
      card('Review result', null, simple(kv(t.byResult, 'k', 'n'), 'th-c2')),
      card('Review path', 'Moved without review skips the T1 check.', simple(kv(t.byPath, 'k', 'n'), 'th-c3')),
      card('Open tickets by owner moves', 'From the Desk owner change log.', simple(t.open.byHops || [], 'th-c0')),
      card('Open T1 tickets that passed through other teams', 'Teams from the people directory.', (t.open.byTeam || []).length ? simple(t.open.byTeam, 'th-c4') : none('None of the open tickets went through another team.')),
      card('Transfers per day', 'Last 30 days (Central).', dayBars(t.byDay || []), true),
      card('Ping-pong tickets', 'Open tickets that changed owner 4 or more times.', pingList(t.open.pingPong || []), true)
    ]));
  }
  function dayBars(rows) {
    if (!rows.length) return h('p', { class: 'th-muted th-small', text: 'No transfers in the last 30 days.' });
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    return h('div', null, [legend([['Not returned', 'b-check'], ['Returned to T1', 'b-unactioned']]), h('div', { class: 'th-cols', role: 'img', 'aria-label': 'Transfers per day' }, rows.map(function (r) {
      var bad = r.bad || 0, ok = Math.max(0, r.n - bad);
      return h('div', { class: 'th-col', 'data-tip': r.k + ': ' + r.n + ' transfers, ' + bad + ' returned to T1' }, [
        h('span', { class: 'th-col-n', text: String(r.n) }),
        h('span', { class: 'th-col-b' }, [bad ? h('i', { class: 'b-unactioned', style: 'height:' + (100 * bad / max) + '%' }) : null, h('i', { class: 'b-check', style: 'height:' + (100 * ok / max) + '%' })]),
        h('span', { class: 'th-col-l', text: String(r.k).slice(5) })]);
    }))]);
  }
  function pingList(rows) {
    if (!rows.length) return h('p', { class: 'th-muted th-small', text: 'No open ticket has moved 4 or more times.' });
    return h('div', { class: 'th-scroll' }, h('table', { class: 'th-table' }, [h('thead', null, h('tr', null, [h('th', { scope: 'col', text: 'Ticket' }), h('th', { scope: 'col', text: 'Agent now' }), h('th', { scope: 'col', class: 'n', text: 'Moves' }), h('th', { scope: 'col', class: 'n', text: 'People' }), h('th', { scope: 'col', text: 'Other teams' })])),
      h('tbody', null, rows.map(function (r) { return h('tr', null, [h('td', null, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener', text: '#' + r.number }) : '#' + r.number), h('td', { text: r.agent }), h('td', { class: 'n', text: String(r.hops) }), h('td', { class: 'n', text: String(r.owners) }), h('td', { text: (r.teams || []).join(', ') || '-' })]); }))]));
  }

  // ── All teams (Batch 263) ────────────────────────────────────────────
  function svgLines(seriesList, xs, valueOf, ariaLabel) {
    var W = 1000, Hh = 210, P = 34, max = 1;
    seriesList.forEach(function (s2) { xs.forEach(function (x0, i) { max = Math.max(max, valueOf(s2, x0, i) || 0); }); });
    var X = function (i) { return P + (W - 2 * P) * i / Math.max(1, xs.length - 1); }, Y = function (v) { return Hh - P - (Hh - 2 * P) * v / max; };
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh); svg.setAttribute('class', 'th-trend'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', ariaLabel);
    [0, 0.5, 1].forEach(function (f) { var l = document.createElementNS(ns, 'line'); l.setAttribute('x1', P); l.setAttribute('x2', W - P); l.setAttribute('y1', Y(max * f)); l.setAttribute('y2', Y(max * f)); l.setAttribute('class', 'th-grid'); svg.appendChild(l);
      var t = document.createElementNS(ns, 'text'); t.setAttribute('x', 2); t.setAttribute('y', Y(max * f) + 4); t.setAttribute('class', 'th-axis'); t.textContent = fmt(max * f); svg.appendChild(t); });
    seriesList.forEach(function (s2, si) {
      var cls = 's' + Math.min(si, 7);
      var pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', xs.map(function (x0, i) { return X(i) + ',' + Y(valueOf(s2, x0, i) || 0); }).join(' ')); pl.setAttribute('class', 'th-line ' + cls); svg.appendChild(pl);
      xs.forEach(function (x0, i) { var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', X(i)); c.setAttribute('cy', Y(valueOf(s2, x0, i) || 0)); c.setAttribute('r', 4); c.setAttribute('class', 'th-pt ' + cls);
        c.setAttribute('data-tip', x0 + ' \u00b7 ' + s2 + ': ' + fmt(valueOf(s2, x0, i) || 0)); c.setAttribute('tabindex', '0'); svg.appendChild(c); });
      // Data label on the last point of each series.
      var li = xs.length - 1, lv = valueOf(s2, xs[li], li) || 0, tl = document.createElementNS(ns, 'text');
      tl.setAttribute('x', X(li) - 8); tl.setAttribute('y', Y(lv) - 9 - si * 13); tl.setAttribute('text-anchor', 'end'); tl.setAttribute('class', 'th-dl ' + cls); tl.textContent = fmt(lv); svg.appendChild(tl);
    });
    [0, xs.length - 1].forEach(function (i) { var t = document.createElementNS(ns, 'text'); t.setAttribute('x', X(i)); t.setAttribute('y', Hh - 6); t.setAttribute('text-anchor', i ? 'end' : 'start'); t.setAttribute('class', 'th-axis'); t.textContent = xs[i]; svg.appendChild(t); });
    return h('div', null, [legend(seriesList.map(function (s2, i) { return [s2, sCls(i)]; })), svg]);
  }
  function viewTeams(body, rep) {
    var a = rep.allTeams;
    if (!a) { body.appendChild(h('div', { class: 'th-card th-empty', text: 'All-team figures fill in on the next refresh.' })); return; }
    var teams = {};
    (a.openTeam || []).forEach(function (r) { var t = teams[r.team] || (teams[r.team] = { label: r.team, total: 0, parts: {} }); t.parts[r.status] = (t.parts[r.status] || 0) + Number(r.n); t.total += Number(r.n); });
    var trows = Object.keys(teams).map(function (k) { return teams[k]; }).sort(function (x, y) { return y.total - x.total; });
    var totalOpen = trows.reduce(function (x, t) { return x + t.total; }, 0);
    trows = trows.slice(0, 14);
    var stCount = {}; trows.forEach(function (t) { Object.keys(t.parts).forEach(function (s2) { stCount[s2] = (stCount[s2] || 0) + t.parts[s2]; }); });
    var sk = Object.keys(stCount).sort(function (x, y) { return statusIdx(x) - statusIdx(y) || stCount[y] - stCount[x]; }).slice(0, 7);
    var restName = 'Other statuses', anyRest = false;
    trows.forEach(function (t) { var rest = 0; Object.keys(t.parts).forEach(function (k) { if (sk.indexOf(k) < 0) { rest += t.parts[k]; delete t.parts[k]; } }); if (rest) { t.parts[restName] = rest; anyRest = true; } });
    if (anyRest) sk.push(restName);
    var flow = a.flow || [];
    var c30 = flow.reduce(function (x, r) { return x + Number(r.created || 0); }, 0), d30 = flow.reduce(function (x, r) { return x + Number(r.closed || 0); }, 0);
    body.appendChild(staticTiles([
      ['Open, every team', totalOpen, Object.keys(teams).length + ' teams'],
      ['Created, 30 days', c30, Math.round(c30 / Math.max(1, flow.length)) + ' a day'],
      ['Closed, 30 days', d30, Math.round(d30 / Math.max(1, flow.length)) + ' a day'],
      ['Stale (open 5+ days)', (a.stale || []).reduce(function (x, r) { return x + Number(r.stale || 0); }, 0), 'in the top 15 teams']
    ]));
    var resol = h('div', { class: 'th-scroll' }, h('table', { class: 'th-table' }, [h('thead', null, h('tr', null, ['Team', 'Closed', 'Avg hours', 'Median hours', 'Slow (72 h+)', 'Reopened'].map(function (x, i) { return h('th', { scope: 'col', class: i ? 'n' : null, text: x }); }))),
      h('tbody', null, (a.resol || []).map(function (r) {
        var pct = function (v) { return Number(r.closed) ? Math.round(100 * Number(v || 0) / Number(r.closed)) + '%' : '-'; };
        return h('tr', null, [h('th', { scope: 'row', text: r.team }), h('td', { class: 'n', text: String(r.closed) }), h('td', { class: 'n', text: String(r.avg_hours) }), h('td', { class: 'n', text: String(r.median_hours) }), h('td', { class: 'n', text: pct(r.slow) }), h('td', { class: 'n', text: pct(r.reopened) })]);
      }))]));
    var staleRows = (a.stale || []).map(function (r) { return { label: r.team, total: Number(r.open), parts: { fresh: Number(r.open) - Number(r.stale || 0), stale: Number(r.stale || 0) } }; });
    var escRows = (a.stale || []).map(function (r) { return [r.team, Number(r.escalated || 0)]; }).filter(function (x) { return x[1]; });
    var xs = flow.map(function (r) { return String(r.day).slice(5, 10); });
    body.appendChild(h('div', { class: 'th-grid' }, [
      card('Open tickets by team and status', 'Every Desk team (ticketing team).', h('div', null, [legend(sk.map(function (s2, i) { return [s2, sCls(i)]; })), stacked(trows, sk, function (k) { return sCls(sk.indexOf(k)); }, function (k) { return k; })])),
      card('Stale tickets by team', 'Still open after 5 days.', h('div', null, [legend([['Under 5 days', 'b-check'], ['Stale', 'b-unactioned']]), stacked(staleRows, ['fresh', 'stale'], function (k) { return k === 'stale' ? 'b-unactioned' : 'b-check'; }, function (k) { return k === 'stale' ? 'Stale' : 'Under 5 days'; })])),
      card('Created vs closed per day', 'Every team, last 30 days (Central).', flow.length > 1 ? svgLines(['Created', 'Closed'], xs, function (s2, x0, i) { return Number(flow[i][s2 === 'Created' ? 'created' : 'closed']); }, 'Tickets created and closed per day') : h('p', { class: 'th-muted th-small', text: 'Not enough days yet.' }), true),
      card('Resolution by team', 'Tickets closed in the last 30 days, normal hours (created to closed, wall clock).', resol, true),
      card('Escalated open tickets by team', null, escRows.length ? simple(escRows, 'th-c4') : h('p', { class: 'th-muted th-small', text: 'No escalated open tickets.' }))
    ]));
  }

  // ── Ask AI (Batch 263) ───────────────────────────────────────────────
  var EXAMPLES = ['Which team has the most open tickets, by status?', 'Tickets created vs closed per week for VoIP Support, last 8 weeks', 'Average resolution hours by team last month',
    'Top issue categories for Tech CSM this month', 'Which T1 agents closed the most tickets last week?', 'Escalated tickets still open, by team and owner', 'Reopened tickets by team in the last 30 days', 'Tickets by channel each day this week'];
  S.ask = { busy: false, result: null, history: null, convo: [], follow: false };
  function viewAsk(body) {
    var A = S.ask;
    var input = h('textarea', { class: 'th-in th-ask-in', rows: '2', 'aria-label': 'Ask a question about tickets', placeholder: 'Ask anything about tickets, for any team. For example: open tickets by team and status' });
    var askBtn = h('button', { type: 'button', class: 'th-btn primary', text: A.busy ? 'Working...' : 'Ask', disabled: A.busy ? true : null });
    function submit(q) {
      q = String(q || input.value || '').trim(); if (!q || A.busy) return;
      A.busy = true; A.error = null; A.pending = q; input.value = '';
      var ctx = A.follow ? A.convo.slice(-2).map(function (c) { return 'Q: ' + c.q + ' (' + c.title + ')'; }).join(' | ') : '';
      render();
      api('/api/ticket-hygiene/ask', { method: 'POST', body: JSON.stringify({ question: q, context: ctx }) }).then(function (r) {
        A.busy = false; A.pending = null;
        if (!r || !r.success) { A.error = (r && r.error) || 'Could not answer that'; render(); return; }
        A.result = r.result; A.convo.push({ q: q, title: r.result.title }); A.history = null; render();
      }).catch(function () { A.busy = false; A.pending = null; A.error = 'Could not reach the server'; render(); });
    }
    askBtn.addEventListener('click', function () { submit(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    var follow = null;
    if (A.convo.length) { var cb = h('input', { type: 'checkbox' }); cb.checked = !!A.follow; cb.addEventListener('change', function () { A.follow = cb.checked; }); follow = h('label', { class: 'th-small th-check' }, [cb, ' Treat my next question as a follow-up']); }
    body.appendChild(h('section', { class: 'th-card wide th-ask' }, [
      h('div', { class: 'th-ch' }, [h('h2', { text: 'Ask AI about tickets' }), h('p', { text: 'Any team or department. The AI turns your question into read-only queries over the Desk data, then answers with the numbers and charts. Contact details and message text are never read.' })]),
      h('div', { class: 'th-ask-row' }, [input, askBtn]), follow,
      h('div', { class: 'th-chips th-ex' }, EXAMPLES.map(function (q) { return h('button', { type: 'button', class: 'th-chip th-chip-btn', text: q, disabled: A.busy ? true : null, onclick: function () { submit(q); } }); }))
    ]));
    if (A.busy) body.appendChild(h('div', { class: 'th-card th-empty', role: 'status' }, [h('b', { text: A.pending }), h('p', { text: 'Reading the Desk data. This usually takes 20 to 40 seconds.' })]));
    if (A.error) body.appendChild(h('div', { class: 'th-card th-note bad', role: 'alert', text: A.error }));
    if (A.result && !A.busy) body.appendChild(answerView(A.result));
    var hist = h('section', { class: 'th-card wide' }, [h('div', { class: 'th-ch' }, [h('h2', { text: 'Your recent questions' })])]);
    body.appendChild(hist);
    function fillHist() {
      if (!A.history.length) { hist.appendChild(h('p', { class: 'th-muted th-small', text: 'Nothing yet.' })); return; }
      hist.appendChild(h('div', { class: 'th-hlist' }, A.history.map(function (x) {
        return h('button', { type: 'button', class: 'th-hist', onclick: function () { api('/api/ticket-hygiene/ask/' + x.id).then(function (r) { if (r && r.success) { A.result = r.result; A.error = null; render(); } }); } },
          [h('b', { text: x.title || x.question }), h('span', { class: 'th-muted th-small', text: x.question })]);
      })));
    }
    if (!A.history) api('/api/ticket-hygiene/ask/history').then(function (r) { A.history = (r && r.items) || []; fillHist(); }); else fillHist();
  }
  function md(text) {
    var wrap = h('div', { class: 'th-md' }), ul = null;
    String(text || '').split('\n').forEach(function (line) {
      var t = line.trim(); if (!t) { ul = null; return; }
      var li = /^[-•*]\s+/.test(t), el = h(li ? 'li' : 'p');
      t.replace(/^[-•*]\s+/, '').split(/(\*[^*]+\*)/).forEach(function (part) { if (/^\*[^*]+\*$/.test(part)) el.appendChild(h('b', { text: part.slice(1, -1) })); else if (part) el.appendChild(document.createTextNode(part)); });
      if (li) { if (!ul) { ul = h('ul'); wrap.appendChild(ul); } ul.appendChild(el); } else { ul = null; wrap.appendChild(el); }
    });
    return wrap;
  }
  function answerView(r) {
    var chatText = ('*' + r.title + '*\n' + String(r.answer || '').replace(/^\s*[-*]\s+/gm, '• ')).replace(/[—–]/g, '-');
    var kids = [h('div', { class: 'th-ch' }, [h('h2', { text: r.title }), h('button', { type: 'button', class: 'th-btn sm', text: 'Copy answer', onclick: function (e) { copy(chatText, e.currentTarget); } })]),
      h('p', { class: 'th-muted th-small', text: 'Asked: ' + r.question + (r.assumptions ? ' · Read as: ' + r.assumptions : '') }), md(r.answer)];
    if (r.cannot) kids.push(h('p', { class: 'th-note', text: 'Not in the data: ' + r.cannot }));
    (r.limits || []).forEach(function (l) { kids.push(h('p', { class: 'th-note', text: l })); });
    var grid = h('div', { class: 'th-grid' });
    (r.results || []).forEach(function (res) { grid.appendChild(resultCard(res)); });
    return h('div', null, [h('section', { class: 'th-card wide th-answer' }, kids), grid]);
  }
  function num(v) { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; var n = Number(v); return isNaN(n) ? null : n; }
  function fmt(v) { var n = num(v); if (n == null) return String(v == null ? '' : v); return Number.isInteger(n) || Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 10) / 10); }
  function pickCols(res) {
    var cols = res.columns || [], rows = res.rows || [];
    var isNum = function (c) { return rows.length > 0 && rows.every(function (r) { return r[c] == null || num(r[c]) != null; }) && !/(^|_)(number|id|year)$/.test(c); };
    var value = res.value && cols.indexOf(res.value) >= 0 ? res.value : cols.filter(isNum).slice(-1)[0];
    var label = res.label && cols.indexOf(res.label) >= 0 ? res.label : (cols.filter(function (c) { return c !== value && !isNum(c); })[0] || cols[0]);
    var series = res.series && cols.indexOf(res.series) >= 0 && res.series !== label ? res.series : null;
    return { label: label, value: value, series: series, isNum: isNum };
  }
  function resultCard(res) {
    var wide = res.chart === 'table' || res.chart === 'line';
    var c = h('section', { class: 'th-card' + (wide ? ' wide' : '') });
    c.appendChild(h('div', { class: 'th-ch' }, [h('h2', { text: res.purpose || 'Result' }), h('p', { text: res.error ? '' : res.count + ' row' + (res.count === 1 ? '' : 's') + (res.capped ? ' (cut to 25 by the data service)' : '') })]));
    if (res.error) { c.appendChild(h('p', { class: 'th-note bad', text: 'This part could not be read: ' + res.error })); return c; }
    if (!res.rows || !res.rows.length) { c.appendChild(h('p', { class: 'th-muted th-small', text: 'No rows.' })); return c; }
    var k = pickCols(res), view = h('div'), showTable = res.chart === 'table' || !k.value;
    function draw() {
      view.replaceChildren();
      if (showTable) { view.appendChild(table(res)); return; }
      if (res.chart === 'number') { view.appendChild(h('div', { class: 'th-kpis' }, (res.columns || []).filter(k.isNum).map(function (col) { return h('div', { class: 'th-kpi static' }, [h('span', { class: 'th-kpi-l', text: col.replace(/_/g, ' ') }), h('b', { text: fmt(res.rows[0][col]) })]); }))); return; }
      if (res.chart === 'line') { view.appendChild(lineChart(res, k)); return; }
      if (k.series) {
        var by = {}, ser = [];
        res.rows.forEach(function (r) { var l = String(r[k.label]), s2 = String(r[k.series]), v = num(r[k.value]) || 0; var o = by[l] || (by[l] = { label: l, total: 0, parts: {} }); o.parts[s2] = (o.parts[s2] || 0) + v; o.total += v; if (ser.indexOf(s2) < 0) ser.push(s2); });
        var rows2 = Object.keys(by).map(function (x) { return by[x]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 20);
        view.appendChild(legend(ser.map(function (s2, i) { return [s2, sCls(i)]; })));
        view.appendChild(stacked(rows2, ser, function (s2) { return sCls(ser.indexOf(s2)); }, function (s2) { return s2; }));
        return;
      }
      view.appendChild(simple(res.rows.slice(0, 20).map(function (r) { return [String(r[k.label]), num(r[k.value]) || 0]; }), 'th-c0', null, true));
    }
    draw(); c.appendChild(view);
    if (res.chart !== 'table' && k.value) c.appendChild(h('button', { type: 'button', class: 'th-btn sm th-tog', text: 'Show table', onclick: function (e) { showTable = !showTable; e.currentTarget.textContent = showTable ? 'Show chart' : 'Show table'; draw(); } }));
    return c;
  }
  function table(res) {
    var cols = res.columns || [];
    return h('div', { class: 'th-scroll th-tbl-wrap' }, h('table', { class: 'th-table' }, [h('thead', null, h('tr', null, cols.map(function (c2) { return h('th', { scope: 'col', text: c2.replace(/_/g, ' ') }); }))),
      h('tbody', null, res.rows.slice(0, 200).map(function (r) { return h('tr', null, cols.map(function (c2) {
        var v = r[c2];
        if (c2 === 'web_url' && v) return h('td', null, h('a', { href: v, target: '_blank', rel: 'noopener', text: 'Open' }));
        if (typeof v === 'string' && /^\d{4}-\d\d-\d\d[T ]\d/.test(v)) return h('td', { text: v.slice(0, 16).replace('T', ' ') });
        var n = typeof v === 'number' ? v : null;
        return h('td', { class: n != null ? 'n' : null, text: n != null ? fmt(n) : String(v == null ? '' : v) });
      })); }))]));
  }
  function lineChart(res, k) {
    var rows = res.rows.slice().sort(function (a, b) { return String(a[k.label]).localeCompare(String(b[k.label])); });
    var xs = [], data = {}, ser = [];
    rows.forEach(function (r) {
      var x0 = String(r[k.label]).slice(0, 10), s2 = k.series ? String(r[k.series]) : (k.value || 'value').replace(/_/g, ' ');
      if (xs.indexOf(x0) < 0) xs.push(x0); if (ser.indexOf(s2) < 0) ser.push(s2);
      (data[s2] = data[s2] || {})[x0] = ((data[s2] || {})[x0] || 0) + (num(r[k.value]) || 0);
    });
    if (xs.length < 2) return simple(rows.map(function (r) { return [String(r[k.label]), num(r[k.value]) || 0]; }), 'th-c0');
    return svgLines(ser.slice(0, 8), xs, function (s2, x0) { return (data[s2] || {})[x0] || 0; }, res.purpose || 'Trend');
  }

  // Batch 264: the Chat message can be written by the AI from a prompt; it stays editable and is copied, never posted.
  var CHAT_EXAMPLES = ['Short huddle note: counts and the 5 most urgent tickets', 'Only follow-ups, grouped by agent, friendly tone', 'Escalated tickets first, then unactioned',
    'One message per agent with their own tickets', 'Closure candidates only, ask agents to confirm and close', 'End of day summary for my manager, no ticket numbers'];
  S.chat = S.chat || { prompt: '', message: null, busy: false, error: null, at: null };
  function viewChat(body, rep) {
    var C = S.chat;
    var text = C.message && C.at === rep.at ? C.message : rep.chat;
    var isAi = !!(C.message && C.at === rep.at);
    var prompt = h('textarea', { class: 'th-in th-ask-in', rows: '2', 'aria-label': 'What should the message say?', placeholder: 'Tell the AI what to write. For example: only follow-ups for Sky Gibson, short and friendly' });
    prompt.value = C.prompt || '';
    var genBtn = h('button', { type: 'button', class: 'th-btn primary', text: C.busy ? 'Writing...' : 'Write with AI', disabled: C.busy ? true : null });
    function gen(q) {
      q = String(q || prompt.value || '').trim(); if (!q || C.busy) return;
      C.prompt = q; C.busy = true; C.error = null; render();
      api('/api/ticket-hygiene/chat', { method: 'POST', body: JSON.stringify({ prompt: q }) }).then(function (r) {
        C.busy = false;
        if (!r || !r.success) { C.error = (r && r.error) || 'Could not write the message'; render(); return; }
        C.message = r.message; C.at = r.at; render();
      }).catch(function () { C.busy = false; C.error = 'Could not reach the server'; render(); });
    }
    genBtn.addEventListener('click', function () { gen(); });
    prompt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gen(); } });
    prompt.addEventListener('input', function () { C.prompt = prompt.value; });
    body.appendChild(h('section', { class: 'th-card wide th-ask' }, [
      h('div', { class: 'th-ch' }, [h('h2', { text: 'Write the message with AI' }), h('p', { text: 'Say who it is for, what to include and the tone. The AI uses only this read’s tickets and counts, in Google Chat format. Nothing is posted.' })]),
      h('div', { class: 'th-ask-row' }, [prompt, genBtn]),
      h('div', { class: 'th-chips th-ex' }, CHAT_EXAMPLES.map(function (q) { return h('button', { type: 'button', class: 'th-chip th-chip-btn', text: q, disabled: C.busy ? true : null, onclick: function () { prompt.value = q; gen(q); } }); }))
    ]));
    if (C.error) body.appendChild(h('div', { class: 'th-card th-note bad', role: 'alert', text: C.error }));
    var ta = h('textarea', { class: 'th-chat th-chat-edit', 'aria-label': 'Google Chat message, editable', spellcheck: 'true' }); ta.value = text;
    var count = h('span', { class: 'th-small th-muted' });
    function upd() { var n = ta.value.length; count.textContent = n + ' characters' + (n > 4000 ? ', over the 4,096 Chat limit: paste it in two parts' : ''); }
    ta.addEventListener('input', function () { upd(); if (isAi) C.message = ta.value; }); upd();
    body.appendChild(card(isAi ? 'AI message' : 'Standard message', isAi ? 'Written from: ' + C.prompt + '. You can edit it before copying.' : 'The standard check message. Edit it here or write one with AI above.',
      h('div', null, [h('div', { class: 'th-ctl' }, [
        h('button', { type: 'button', class: 'th-btn primary', text: 'Copy message', onclick: function (e) { copy(ta.value, e.currentTarget); } }),
        isAi ? h('button', { type: 'button', class: 'th-btn', text: 'Back to standard', onclick: function () { C.message = null; render(); } }) : null,
        isAi ? h('button', { type: 'button', class: 'th-btn', text: 'Rewrite', disabled: C.busy ? true : null, onclick: function () { gen(C.prompt); } }) : null,
        count]), ta]), true));
    if (C.message && C.at !== rep.at) body.appendChild(h('p', { class: 'th-small th-muted', text: 'A newer read came in, so the AI message was set aside. Write it again to use the latest numbers.' }));
  }

  window.TicketHygiene = { mount: mount };
})();
