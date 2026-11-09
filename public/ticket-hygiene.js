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
    return { refresh: load };
  }
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
        rep ? h('span', { class: 'th-asof', text: 'As of ' + asOf(rep.at) }) : null,
        rep ? h('span', { class: 'th-pill conf-' + rep.confidence.toLowerCase(), title: 'How complete the data and AI labels were for this read', text: rep.confidence + ' confidence' }) : null,
        h('button', { type: 'button', class: 'th-btn', disabled: S.running ? true : null, text: S.running ? 'Reading tickets...' : 'Refresh now', onclick: function (e) { runNow(e.currentTarget); } }),
        rep ? h('button', { type: 'button', class: 'th-btn primary', text: 'Copy Chat message', onclick: function (e) { copy(rep.chat, e.currentTarget); } }) : null
      ])
    ]);
    var kids = [head];
    if (S.error && (!rep || S.error.at > rep.at)) kids.push(h('div', { class: 'th-card th-note bad', role: 'alert', text: 'The last refresh failed: ' + S.error.msg }));
    if (!rep) {
      kids.push(h('div', { class: 'th-card th-empty' }, [h('p', { text: S.running ? 'Reading every open T1 CS ticket and its conversation. This takes a minute or two.' : 'No read yet. Press Refresh now to build the first one.' })]));
      S.root.replaceChildren.apply(S.root, kids); return;
    }
    var seg = h('div', { class: 'th-seg', role: 'tablist', 'aria-label': 'Ticket hygiene views' }, [['overview', 'Overview'], ['agents', 'Agents'], ['tickets', 'Tickets'], ['chat', 'Chat message']].map(function (t) {
      return h('button', { type: 'button', role: 'tab', 'aria-selected': S.view === t[0] ? 'true' : 'false', text: t[1], onclick: function () { S.view = t[0]; render(); } });
    }));
    kids.push(kpis(rep), seg);
    var body = h('div', { class: 'th-body' });
    kids.push(body);
    S.root.replaceChildren.apply(S.root, kids);
    ({ overview: viewOverview, agents: viewAgents, tickets: viewTickets, chat: viewChat })[S.view](body, rep);
  }
  function go(bucket, agent, category) { S.view = 'tickets'; S.f.bucket = bucket || ''; S.f.agent = agent || ''; S.f.category = category || ''; render(); window.scrollTo && S.root.scrollIntoView({ block: 'start' }); }

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
  function stacked(rows, keys, clsOf, labelOf, onRow, onSeg) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));
    return h('div', { class: 'th-bars' }, rows.map(function (r) {
      var segs = keys.filter(function (k) { return r.parts[k]; }).map(function (k) {
        return h('span', { class: 'th-seg-b ' + clsOf(k), style: 'width:' + (100 * r.parts[k] / max) + '%', title: r.label + ': ' + labelOf(k) + ' ' + r.parts[k], onclick: onSeg ? function (e) { e.stopPropagation(); onSeg(r, k); } : null });
      });
      return h('div', { class: 'th-bar-row' + (onRow ? ' click' : ''), role: onRow ? 'button' : null, tabindex: onRow ? '0' : null, 'aria-label': r.label + ', ' + r.total + ': ' + keys.filter(function (k) { return r.parts[k]; }).map(function (k) { return labelOf(k) + ' ' + r.parts[k]; }).join(', '),
        onclick: onRow ? function () { onRow(r); } : null, onkeydown: onRow ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } } : null }, [
        h('span', { class: 'th-bar-l', title: r.label, text: r.label }), h('span', { class: 'th-bar-t' }, segs), h('span', { class: 'th-bar-n', text: String(r.total) })]);
    }));
  }
  function simple(pairs, cls, onRow) {
    var max = Math.max.apply(null, pairs.map(function (p) { return p[1]; }).concat([1]));
    return h('div', { class: 'th-bars' }, pairs.map(function (p) {
      return h('div', { class: 'th-bar-row' + (onRow ? ' click' : ''), role: onRow ? 'button' : null, tabindex: onRow ? '0' : null, 'aria-label': p[0] + ': ' + p[1], onclick: onRow ? function () { onRow(p[0]); } : null, onkeydown: onRow ? function (e) { if (e.key === 'Enter') onRow(p[0]); } : null }, [
        h('span', { class: 'th-bar-l', title: p[0], text: p[0] }), h('span', { class: 'th-bar-t' }, [p[1] ? h('span', { class: 'th-seg-b ' + cls, style: 'width:' + (100 * p[1] / max) + '%', title: p[0] + ': ' + p[1] }) : null]), h('span', { class: 'th-bar-n', text: String(p[1]) })]);
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
        var tt = document.createElementNS(ns, 'title'); tt.textContent = p.day + ': ' + (k === 'total' ? 'Open' : BL[k]) + ' ' + (p[k] || 0); c.appendChild(tt); svg.appendChild(c); });
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
      card('Issue category (AI)', 'The AI reads the subject and the client’s messages and picks one category. Split by bucket.', h('div', null, [legend(BUCKETS.map(function (b) { return [BL[b], 'b-' + b]; })), stacked(cats, BUCKETS, function (k) { return 'b-' + k; }, function (k) { return BL[k]; }, function (r) { go('', '', r.label === 'Other' ? '' : r.label); }, function (r, k) { go(k, '', r.label === 'Other' ? '' : r.label); })])),
      card('Tickets by status', null, simple(sk.map(function (s) { return [s, d.byStatus[s]]; }), 'th-c0')),
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
      sel('Category', f.category, cats.map(function (c) { return [c, c]; }), 'category'),
      h('label', { class: 'th-fl grow' }, [h('span', { text: 'Search' }), h('input', { class: 'th-in', type: 'search', placeholder: 'Ticket number, subject or account', value: f.q || '', oninput: debounce(function (e) { S.f.q = e.target.value; var pos = e.target.selectionStart; render(); var i = S.root.querySelector('.th-filters input'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 250) })]),
      (f.bucket || f.agent || f.category || f.q || f.unownedPC) ? h('button', { type: 'button', class: 'th-btn sm', text: 'Clear', onclick: function () { S.f = { bucket: '', agent: '', category: '', q: '' }; render(); } }) : null
    ]);
    var list = filtered(rep);
    var head = h('p', { class: 'th-small th-muted', text: list.length + ' ticket' + (list.length === 1 ? '' : 's') + (f.unownedPC ? ' Pending Customer with no owner' : '') + (f.bucket ? ' · ' + BHELP[f.bucket] : '') });
    var rows = list.slice(0, 300).map(function (r) {
      return h('div', { class: 'th-row' }, [
        h('span', { class: 'th-b b-' + r.bucket, title: BL[r.bucket], text: r.isNew ? 'New' : BL[r.bucket] }),
        h('div', { class: 'th-row-m' }, [
          h('div', { class: 'th-row-t' }, [r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener', text: '#' + r.number }) : h('b', { text: '#' + r.number }), ' ', h('span', { class: 'th-subj', text: r.subject || '(no subject)' })]),
          h('div', { class: 'th-row-r', text: r.reason + (r.ai && r.ai.why && AI_CODES.indexOf(r.code) >= 0 ? ' · AI: ' + r.ai.why : '') }),
          h('div', { class: 'th-chips' }, [
            h('span', { class: 'th-chip', text: r.agent + (r.inferred ? ' †' : '') }), h('span', { class: 'th-chip', text: r.status }), h('span', { class: 'th-chip', text: r.category }),
            r.ageDays != null ? h('span', { class: 'th-chip', text: r.ageDays + 'd old' }) : null,
            r.lastContact ? h('span', { class: 'th-chip', text: 'last contact ' + ago(r.lastContact) }) : h('span', { class: 'th-chip warn', text: 'never contacted' }),
            r.esc ? h('span', { class: 'th-chip bad', text: 'Escalated' }) : null,
            r.dependency ? h('span', { class: 'th-chip info', text: 'Dependency: ' + r.depWhy }) : null,
            r.dup ? h('span', { class: 'th-chip warn', title: 'Same account and subject as ' + r.dup.join(', '), text: 'Possible duplicate' }) : null,
            r.account ? h('span', { class: 'th-chip mute', text: r.account }) : null
          ])
        ])
      ]);
    });
    body.appendChild(h('section', { class: 'th-card wide' }, [bar, head, rows.length ? h('div', { class: 'th-list' }, rows) : h('p', { class: 'th-empty', text: 'Nothing matches these filters.' }), list.length > 300 ? h('p', { class: 'th-small th-muted', text: 'Showing the first 300. Narrow the filters to see the rest.' }) : null]));
  }
  function debounce(fn, ms) { var t; return function (e) { clearTimeout(t); var ev = e; t = setTimeout(function () { fn(ev); }, ms); }; }

  function viewChat(body, rep) {
    var pre = h('pre', { class: 'th-chat', tabindex: '0', 'aria-label': 'Google Chat message', text: rep.chat });
    body.appendChild(card('Google Chat message', 'Copy and paste it into the team space. Nothing is posted from here. ' + rep.chat.length + ' characters' + (rep.chat.length > 4000 ? ', over the 4,096 Chat limit, so paste it in two parts' : '') + '.',
      h('div', null, [h('div', { class: 'th-ctl' }, [h('button', { type: 'button', class: 'th-btn primary', text: 'Copy Chat message', onclick: function (e) { copy(rep.chat, e.currentTarget); } })]), pre]), true));
  }

  window.TicketHygiene = { mount: mount };
})();
