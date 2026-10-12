/* Batch 165: AI and VoIP support handled by T1 (admin, under Tickets). Data: /api/topic-support. */
(function () {
  'use strict';
  var S = { grain: 'day', topic: 'ai', preset: 'golive', from: '', to: '', data: null, busy: false, filter: 'all', q: '', auditing: {}, reviewing: {}, openRow: {}, weekly: null };
  var GOLIVE = { ai: '2026-09-08', voip: '2026-10-12' };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
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
  function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '0%'; }
  function chiDate(d) { return new Date(d + 'T05:00:00.000Z'); } // midnight Central (CDT)
  function todayChi() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); }
  function range() {
    var t = todayChi();
    if (S.preset === 'today') return { from: chiDate(t).toISOString(), to: new Date().toISOString() };
    if (S.preset === '7d') return { from: new Date(chiDate(t).getTime() - 6 * 864e5).toISOString(), to: new Date().toISOString() };
    if (S.preset === 'custom' && S.from) return { from: chiDate(S.from).toISOString(), to: S.to ? new Date(chiDate(S.to).getTime() + 864e5).toISOString() : new Date().toISOString() };
    return { from: chiDate(GOLIVE.ai).toISOString(), to: new Date().toISOString() };
  }
  function exportUrl() { var r = range(); return '/api/topic-support/export?topic=ai,voip&from=' + encodeURIComponent(r.from) + '&to=' + encodeURIComponent(r.to); }
  function stars(n) { return n == null ? '-' : n.toFixed ? (Math.round(n * 10) / 10).toFixed(1) : String(n); }
  function rateCls(n) { return n == null ? 'mute' : n >= 4 ? 'ok' : n >= 3 ? 'info' : n >= 2 ? 'warn' : 'bad'; }
  var DIM = [['guide', 'Guide'], ['resolution', 'Resolution'], ['communication', 'Communication'], ['handoff', 'Hand-off']];
  function fmtDay(iso) { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }); } catch (e) { return iso; } }
  function fmtWhen(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); } catch (e) { return iso; } }
  var OUT = { resolved: ['Resolved by T1', 'ok'], open: ['Still with T1', 'info'], toTopicTeam: ['Transferred', 'warn'], toOther: ['Transferred elsewhere', 'warn'], bypassed: ['Went straight to team', 'mute'] };
  var EXP = { t1: ['Guide: T1 resolves', 'ok'], t1_first: ['Guide: T1 checks first', 'info'], team: ['Guide: owning team', 'mute'], commercial: ['Guide: AI leads only', 'warn'] };
  var VERD = { could_handle: ['T1 could have handled', 'bad'], right_transfer: ['Right transfer', 'ok'], unclear: ['Unclear', 'mute'] };

  function load() {
    var root = document.getElementById('tsd-root'); if (!root) return;
    if (S.busy) return; S.busy = true;
    draw(true);
    var r = range();
    api('/api/topic-support?from=' + encodeURIComponent(r.from) + '&to=' + encodeURIComponent(r.to))
      .then(function (j) { S.busy = false; if (!j.success) throw new Error(j.error || 'Could not load'); S.data = j; draw(); })
      .catch(function (e) { S.busy = false; S.err = e.message; draw(); });
  }

  function draw(loading) {
    var root = document.getElementById('tsd-root'); if (!root) return;
    var d = S.data && S.data.data && S.data.data[S.topic];
    var head = h('div', { class: 'tsd-head' }, [
      h('div', null, [h('h2', { class: 'tsd-h1', text: 'AI & VoIP support' }),
        h('p', { class: 'tsd-sub', text: 'How much basic AI and VoIP support T1 now handles, what T1 resolves, and what still gets transferred. Built from Zoho Desk tickets; calls and chats are the Phone and Chat tickets T1 logs for them. Each ticket is sorted against the support guide.' })]),
      h('div', { class: 'tsd-ctrl' }, [
        seg([['golive', 'Since go-live'], ['7d', 'Last 7 days'], ['today', 'Today'], ['custom', 'Custom']], S.preset, function (v) { S.preset = v; if (v !== 'custom') load(); else draw(); }),
        S.preset === 'custom' ? h('span', { class: 'tsd-dates' }, [
          h('input', { type: 'date', 'aria-label': 'From', value: S.from || GOLIVE.ai, min: '2026-07-12', onchange: function (e) { S.from = e.target.value; } }),
          h('span', { text: 'to' }),
          h('input', { type: 'date', 'aria-label': 'To', value: S.to || todayChi(), onchange: function (e) { S.to = e.target.value; } }),
          h('button', { type: 'button', class: 'tsd-btn', text: 'Apply', onclick: function () { if (!S.from) S.from = GOLIVE.ai; load(); } })]) : null,
        h('button', { type: 'button', class: 'tsd-btn', text: loading ? 'Loading...' : 'Refresh', disabled: loading, onclick: load }),
        h('a', { class: 'tsd-btn', href: exportUrl(), download: '', title: 'Every ticket in this range with its outcome, guide area, ratings and coaching points. Opens in Excel.', text: 'Export to Excel' })])]);
    var tabs = h('div', { class: 'tsd-tabs', role: 'tablist' }, [['ai', 'AI support'], ['voip', 'VoIP support']].map(function (t) {
      var dd = S.data && S.data.data && S.data.data[t[0]];
      return h('button', { type: 'button', role: 'tab', 'aria-selected': S.topic === t[0] ? 'true' : 'false', class: 'tsd-tab', onclick: function () { S.topic = t[0]; S.filter = 'all'; draw(); } },
        [t[1], h('span', { class: 'tsd-live', text: 'T1 since ' + fmtDay(chiDate(GOLIVE[t[0]]).toISOString()) }), dd ? h('span', { class: 'tsd-n', text: String(dd.totals.t1Touched) }) : null]);
    }));
    var kids = [head, tabs];
    if (S.err && !d) kids.push(h('div', { class: 'tsd-note', text: 'Could not load: ' + S.err }));
    else if (!d) kids.push(h('div', { class: 'tsd-skel' }, [h('i'), h('i'), h('i'), h('i')]));
    else kids = kids.concat(body(d));
    root.replaceChildren.apply(root, kids);
  }
  function seg(opts, cur, fn) {
    return h('div', { class: 'tsd-seg', role: 'group', 'aria-label': 'Date range' }, opts.map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': cur === o[0] ? 'true' : 'false', text: o[1], onclick: function () { fn(o[0]); } });
    }));
  }
  function tile(label, value, sub, cls) { return h('div', { class: 'tsd-tile ' + (cls || '') }, [h('span', { class: 'tsd-tile-l', text: label }), h('b', { class: 'tsd-tile-v', text: String(value) }), sub ? h('span', { class: 'tsd-tile-s', text: sub }) : null]); }

  function body(d) {
    var t = d.totals, out = [];
    if (Date.parse(d.to) <= Date.parse(d.from)) out.push(h('div', { class: 'tsd-note', text: 'T1 starts ' + d.label + ' on ' + fmtDay(chiDate(d.goLive).toISOString()) + '. Pick a range that includes that date.' }));
    out.push(h('p', { class: 'tsd-range', text: 'Counting tickets created ' + fmtWhen(d.from) + ' to ' + fmtWhen(d.to) + ' Central. ' + d.label + ' moved to T1 on ' + fmtDay(chiDate(d.goLive).toISOString()) + ', so earlier dates are left out. ' + (d.source === 'live' ? 'Live from Zoho Desk.' : (d.sourceNote || 'From the Zoho tickets synced into the tool.')) }));
    out.push(h('div', { class: 'tsd-tiles' }, [
      tile('Handled by T1', t.t1Touched, 'calls, chats and tickets a T1 agent worked'),
      tile('Resolved by T1', t.resolvedByT1, pct(t.resolvedByT1, t.t1Touched) + ' of what T1 handled', 'ok'),
      tile('Still with T1', t.openWithT1, 'open or on hold with a T1 agent'),
      tile('Transferred', t.transferred, pct(t.transferred, t.t1Touched) + ' of what T1 handled · ' + t.toTopicTeam + ' to ' + d.teamLabel, t.transferred ? 'warn' : ''),
      tile('Average rating', d.ratings && d.ratings.reviewed ? stars(d.ratings.avg.overall) + ' / 5' : '-', d.ratings ? d.ratings.reviewed + ' reviewed' + (d.ratings.pending ? ' · ' + d.ratings.pending + ' waiting' : '') : '', d.ratings && d.ratings.avg.overall != null ? rateCls(d.ratings.avg.overall) : 'mute'),
      tile('Needs attention', d.flagged || 0, d.flagged ? 'possible mishandling, see the list below' : 'nothing flagged', d.flagged ? 'bad' : 'ok'),
      tile('Against the guide', (t.againstGuide || 0) + (t.commercialKept || 0), (t.againstGuide || 0) + ' transferred though the guide says T1 resolves' + (t.commercialKept ? ' · ' + t.commercialKept + ' commercial kept by T1' : ''), (t.againstGuide || t.commercialKept) ? 'bad' : 'ok')]));
    if (d.classifying) {
      out.push(h('div', { class: 'tsd-note' }, [d.classifying + ' tickets are still being read (notes, comments and conversation) and sorted against the support guide. This page refreshes by itself in a moment.']));
      clearTimeout(S._ct); S._ct = setTimeout(function () { if (document.getElementById('tsd-root') && document.getElementById('tsd-root').offsetParent !== null) load(); }, 25000);
    }
    // Calls, chats, tickets
    var chRows = [['call', 'Calls'], ['chat', 'Chats'], ['ticket', 'Email and web tickets']].map(function (c) {
      var x = d.byChannel[c[0]], rate = x.t1Touched ? x.transferred / x.t1Touched : 0;
      return h('tr', null, [h('th', { scope: 'row', text: c[1] }), h('td', { text: String(x.t1Touched) }), h('td', { text: String(x.resolvedByT1) }), h('td', { text: String(x.openWithT1) }), h('td', { text: String(x.transferred) }),
        h('td', null, [h('span', { class: 'tsd-rate' }, [h('i', { style: 'width:' + Math.round(rate * 100) + '%' })]), h('span', { class: 'tsd-rate-t', text: pct(x.transferred, x.t1Touched) })])]);
    });
    var base = d.baseline, nowRate = t.t1Touched ? t.transferred / t.t1Touched : 0, baseRate = base.inTopic ? base.toTopicTeam / base.inTopic : 0;
    out.push(h('div', { class: 'tsd-grid2' }, [
      card('Calls, chats and tickets', 'What T1 handled on each channel, and how much was transferred.',
        h('table', { class: 'tsd-table' }, [h('thead', null, [h('tr', null, ['Channel', 'Handled', 'Resolved', 'Still with T1', 'Transferred', 'Transfer rate'].map(function (x, i) { return h('th', { scope: 'col', class: i ? 'num' : '', text: x }); }))]), h('tbody', null, chRows)])),
      card('Before and after', 'The two weeks before T1 took over, against the range above.', h('div', { class: 'tsd-ba' }, [
        h('div', null, [h('span', { class: 'tsd-ba-l', text: 'Before (' + fmtDay(base.from) + ' to ' + fmtDay(new Date(Date.parse(base.to) - 1).toISOString()) + ')' }), h('b', { text: pct(base.toTopicTeam, base.inTopic) }), h('span', { class: 'tsd-ba-s', text: base.toTopicTeam + ' of ' + base.inTopic + ' tickets went to ' + d.teamLabel })]),
        h('div', null, [h('span', { class: 'tsd-ba-l', text: 'Now, of what T1 handled' }), h('b', { class: nowRate < baseRate ? 'good' : '', text: pct(t.transferred, t.t1Touched) }), h('span', { class: 'tsd-ba-s', text: t.transferred + ' of ' + t.t1Touched + ' transferred, ' + t.resolvedByT1 + ' resolved by T1' })])]))]));
    // Trend
    out.push(trendCard(d.byDay));
    // Agents + categories
    var ag = d.byAgent.map(function (a) {
      var flags = d.tickets.filter(function (x) { return x.agent === a.name && x.audit && x.audit.verdict === 'could_handle'; }).length;
      return h('tr', null, [h('th', { scope: 'row', text: a.name }), h('td', { text: String(a.touched) }), h('td', { text: a.calls + ' / ' + a.chats + ' / ' + a.tickets }), h('td', { text: String(a.resolved) }), h('td', { text: String(a.open) }), h('td', { text: String(a.transferred) }), h('td', { text: pct(a.transferred, a.touched) }), h('td', { class: flags ? 'bad' : '', text: flags ? String(flags) : '-' })]);
    });
    var areas = (d.byArea || []).map(function (c) {
      var e = EXP[c.expected] || ['', 'mute'];
      var bad = c.expected === 't1' && c.transferred;
      return h('tr', null, [h('th', { scope: 'row', text: c.label }), h('td', null, [h('span', { class: 'tsd-pill ' + e[1], text: e[0].replace('Guide: ', '') })]), h('td', { text: String(c.touched) }), h('td', { text: String(c.resolved) }), h('td', { class: bad ? 'bad' : '', text: String(c.transferred) })]);
    });
    var cats = d.byCategory.map(function (c) { return h('tr', null, [h('th', { scope: 'row', text: c.category }), h('td', { text: String(c.touched) }), h('td', { text: String(c.transferred) }), h('td', { text: pct(c.transferred, c.touched) })]); });
    out.push(h('div', { class: 'tsd-grid2 wide' }, [
      card('By agent', 'Calls / chats / tickets T1 handled. "Could have handled" counts audited transfers the guide says T1 could have solved.', ag.length ? h('div', { class: 'tsd-scroll' }, [h('table', { class: 'tsd-table' }, [h('thead', null, [h('tr', null, ['Agent', 'Handled', 'Calls / chats / tickets', 'Resolved', 'With T1', 'Transferred', 'Rate', 'Could have handled'].map(function (x, i) { return h('th', { scope: 'col', class: i ? 'num' : '', text: x }); }))]), h('tbody', null, ag)])]) : empty('No T1 agent has handled one of these yet.')),
      areas.length ? card('By guide area', 'Each ticket sorted against the support guide, with who the guide says should handle it. Red means T1 transferred something the guide says T1 resolves.', h('table', { class: 'tsd-table' }, [h('thead', null, [h('tr', null, ['Area', 'Guide says', 'Handled', 'Resolved', 'Transferred'].map(function (x, i) { return h('th', { scope: 'col', class: i > 1 ? 'num' : '', text: x }); }))]), h('tbody', null, areas)]))
        : card('Topics', 'The ticket topic (from Desk) and how often T1 transferred it.', cats.length ? h('table', { class: 'tsd-table' }, [h('thead', null, [h('tr', null, ['Topic', 'Handled', 'Transferred', 'Rate'].map(function (x, i) { return h('th', { scope: 'col', class: i ? 'num' : '', text: x }); }))]), h('tbody', null, cats)]) : empty('Nothing yet.'))]));
    if (d.destinations.length) out.push(card('Where transfers went', null, h('div', { class: 'tsd-dest' }, d.destinations.map(function (x) { return h('span', { class: 'tsd-chip' }, [x.team, h('b', { text: String(x.n) })]); }))));
    if (d.flagged) out.push(attention(d));
    out.push(scorecards(d));
    out.push(auditCard(d));
    out.push(weeklyCard());
    return out;
  }
  function attention(d) {
    var list = d.tickets.filter(function (x) { return x.flags && x.flags.length; }).slice(0, 12);
    return h('section', { class: 'tsd-card tsd-att' }, [
      h('div', { class: 'tsd-card-hd' }, [h('div', null, [h('h3', { class: 'tsd-h3', text: 'Needs attention' }),
        h('p', { class: 'tsd-card-sub', text: 'Tickets the guide checks or the ticket review say may be mishandled: wrong team, a transfer T1 should have resolved, a cancellation kept by T1, a weak hand-off, a low rating, or stuck with T1. Admins and SPOCs get a bell alert for each new one.' })]),
        h('button', { type: 'button', class: 'tsd-btn', text: 'Show all ' + d.flagged, onclick: function () { S.filter = 'flagged'; draw(); var el = document.querySelector('#tsd-root .tsd-list'); if (el) el.scrollIntoView({ block: 'start' }); } })]),
      h('div', { class: 'tsd-att-list' }, list.map(function (x) {
        return h('div', { class: 'tsd-att-row' }, [
          x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener', class: 'tsd-num', text: '#' + x.number }) : h('span', { text: '#' + x.number }),
          h('div', null, [h('b', { text: x.subject || '' }), h('small', { text: (x.agent || 'No T1 agent') + ' · ' + (OUT[x.outcome] || [x.outcome])[0] + (x.dest ? ' to ' + x.dest : '') }),
            h('ul', null, x.flags.map(function (f) { return h('li', null, [h('span', { class: 'tsd-pill bad', text: f.label }), f.why ? h('span', { class: 'tsd-why-in', text: ' ' + f.why }) : null]); }))])]);
      }))]);
  }
  function scorecards(d) {
    var list = d.byAgent.filter(function (a) { return a.reviewed; });
    var body = list.length ? h('div', { class: 'tsd-sc-grid' }, list.map(function (a) {
      return h('article', { class: 'tsd-sc' }, [
        h('div', { class: 'tsd-sc-hd' }, [h('b', { text: a.name }), h('span', { class: 'tsd-score ' + rateCls(a.ratings.overall), text: stars(a.ratings.overall) })]),
        h('p', { class: 'tsd-sc-sub', text: a.reviewed + ' of ' + a.touched + ' tickets reviewed' + (a.weakest ? ' · weakest: ' + (DIM.filter(function (x) { return x[0] === a.weakest; })[0] || ['', a.weakest])[1] : '') }),
        h('div', { class: 'tsd-dims' }, DIM.map(function (dm) {
          var v = a.ratings[dm[0]];
          return h('div', { class: 'tsd-dim' }, [h('span', { text: dm[1] }), h('span', { class: 'tsd-dim-bar' }, [h('i', { class: rateCls(v), style: 'width:' + (v ? v / 5 * 100 : 0) + '%' })]), h('b', { text: stars(v) })]);
        })),
        a.coaching && a.coaching.length ? h('div', { class: 'tsd-sc-coach' }, [h('small', { text: 'Coaching points' }), h('ul', null, a.coaching.map(function (c) { return h('li', { text: c }); }))]) : null,
        a.lowest && a.lowest.length ? h('div', { class: 'tsd-sc-low' }, [h('small', { text: 'Lowest rated' })].concat(a.lowest.map(function (t) {
          return h('div', null, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', class: 'tsd-num', text: '#' + t.number }) : '#' + t.number, h('span', { class: 'tsd-score sm ' + rateCls(t.overall), text: String(t.overall) }), h('span', { class: 'tsd-sc-sum', text: t.summary || '' })]);
        }))) : null]);
    })) : empty('No reviews yet. Tickets are reviewed in the background every 30 minutes once T1 has resolved or transferred them, or press Review on a ticket below.');
    return card('Agent scorecards', 'Average ratings from ticket reviews (1 to 5): did they follow the guide, fix the issue, communicate well and hand off properly. Each review reads the whole ticket, chat, notes, matching call transcripts and owner history.', body);
  }
  function weeklyCard() {
    var c = h('section', { class: 'tsd-card', id: 'tsd-weekly' }, [h('div', { class: 'tsd-card-hd' }, [h('div', null, [h('h3', { class: 'tsd-h3', text: 'Weekly reports' }),
      h('p', { class: 'tsd-card-sub', text: 'Built every Monday for the week before (Central), with trends and coaching points. A bell notice tells admins when it is ready.' })]),
      h('button', { type: 'button', class: 'tsd-btn', text: S.wkBusy ? 'Building...' : "Build last week's report now", disabled: !!S.wkBusy, onclick: function () {
        S.wkBusy = true; draw();
        api('/api/topic-support/weekly/run', {}).then(function (j) { if (!j.success) throw new Error(j.error || 'Could not build'); S.weekly = null; }).catch(function (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }).then(function () { S.wkBusy = false; loadWeekly(); });
      } })])]);
    if (!S.weekly) { c.appendChild(empty('Loading...')); loadWeekly(); return c; }
    if (!S.weekly.length) { c.appendChild(empty('No weekly report yet.')); return c; }
    S.weekly.forEach(function (w, i) {
      var det = h('details', { class: 'tsd-wk', open: i === 0 }, [h('summary', null, ['Week of ' + fmtDay(w.from), h('span', { class: 'tsd-sc-sub', text: ' · AI ' + ((w.data.ai && w.data.ai.totals.t1Touched) || 0) + ' handled, VoIP ' + ((w.data.voip && w.data.voip.totals.t1Touched) || 0) + ' handled' })]),
        h('div', { class: 'tsd-wk-text', text: w.text || 'The written summary could not be generated; the numbers are in the export.' })]);
      c.appendChild(det);
    });
    return c;
  }
  function loadWeekly() {
    if (S._wkLoading) return; S._wkLoading = true;
    api('/api/topic-support/weekly').then(function (j) { S.weekly = (j && j.reports) || []; }).catch(function () { S.weekly = []; }).then(function () { S._wkLoading = false; var el = document.getElementById('tsd-weekly'); if (el) el.replaceWith(weeklyCard()); });
  }
  function empty(t) { return h('p', { class: 'tsd-empty', text: t }); }
  function card(title, sub, content) { return h('section', { class: 'tsd-card' }, [h('h3', { class: 'tsd-h3', text: title }), sub ? h('p', { class: 'tsd-card-sub', text: sub }) : null, content]); }
  // ── Over time: day, week, month or quarter, with a total on each bar and a breakdown on hover or focus ──
  var GRAINS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter']];
  function ymd(dt) { return dt.toISOString().slice(0, 10); }
  function periodKey(day, g) {
    var dt = new Date(day + 'T12:00:00Z');
    if (g === 'week') { var w = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - w); return ymd(dt); }
    if (g === 'month') return day.slice(0, 7);
    if (g === 'quarter') return day.slice(0, 4) + '-Q' + (Math.floor((+day.slice(5, 7) - 1) / 3) + 1);
    return day;
  }
  function nextKey(k, g) {
    if (g === 'day' || g === 'week') { var dt = new Date(k + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + (g === 'week' ? 7 : 1)); return ymd(dt); }
    if (g === 'month') { var y = +k.slice(0, 4), m = +k.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + '-' + (m < 10 ? '0' : '') + m; }
    var yq = +k.slice(0, 4), q = +k.slice(-1) + 1; if (q > 4) { q = 1; yq++; } return yq + '-Q' + q;
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function periodLabel(k, g, long) {
    if (g === 'day') return MON[+k.slice(5, 7) - 1] + ' ' + (+k.slice(8, 10));
    if (g === 'week') { var e = new Date(k + 'T12:00:00Z'); e.setUTCDate(e.getUTCDate() + 6); var el = ymd(e);
      return (long ? 'Week of ' : '') + MON[+k.slice(5, 7) - 1] + ' ' + (+k.slice(8, 10)) + (long ? ' to ' + MON[+el.slice(5, 7) - 1] + ' ' + (+el.slice(8, 10)) : ''); }
    if (g === 'month') return MON[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4);
    return k.slice(-2) + ' ' + k.slice(0, 4);
  }
  function groupDays(days, g) {
    var m = {}, keys = [];
    days.forEach(function (x) {
      var k = periodKey(x.day, g);
      var p = m[k] || (m[k] = { key: k, handled: 0, transferred: 0, resolved: 0, open: 0, call: 0, chat: 0, ticket: 0 });
      ['handled', 'transferred', 'resolved', 'open', 'call', 'chat', 'ticket'].forEach(function (f) { p[f] += x[f] || 0; });
    });
    keys = Object.keys(m).sort();
    if (!keys.length) return [];
    var out = [], k = keys[0], guard = 0;
    while (k <= keys[keys.length - 1] && guard++ < 400) { out.push(m[k] || { key: k, handled: 0, transferred: 0, resolved: 0, open: 0, call: 0, chat: 0, ticket: 0 }); k = nextKey(k, g); }
    return out;
  }
  function trendCard(days) {
    var g = S.grain;
    var seg = h('div', { class: 'tsd-seg', role: 'group', 'aria-label': 'Group by' }, GRAINS.map(function (x) {
      return h('button', { type: 'button', 'aria-pressed': g === x[0] ? 'true' : 'false', text: x[1], onclick: function () { S.grain = x[0]; draw(); } }); }));
    var noun = { day: 'day', week: 'week', month: 'month', quarter: 'quarter' }[g];
    return h('section', { class: 'tsd-card' }, [
      h('div', { class: 'tsd-card-hd' }, [h('div', null, [h('h3', { class: 'tsd-h3', text: 'Over time' }),
        h('p', { class: 'tsd-card-sub', text: 'What T1 handled each ' + noun + ': kept by T1 against transferred. Point at a bar for the breakdown.' })]), seg]),
      trend(groupDays(days, g), g)]);
  }
  function trend(periods, g) {
    if (!periods.length) return empty('No tickets in this range yet.');
    var max = Math.max.apply(null, periods.map(function (x) { return x.handled + x.transferred; })) || 1;
    var tip = h('div', { class: 'tsd-tip', role: 'status' }); tip.hidden = true;
    var wrap = h('div', { class: 'tsd-trend-wrap' }, []);
    function pc(n, d) { return d ? Math.round(n / d * 100) + '%' : '0%'; }
    function show(el, x) {
      var tot = x.handled + x.transferred;
      tip.replaceChildren(
        h('b', { text: periodLabel(x.key, g, true) }),
        h('div', { class: 'tsd-tip-row' }, [h('span', { text: 'Handled by T1' }), h('strong', { text: String(tot) })]),
        h('div', { class: 'tsd-tip-row' }, [h('span', null, [h('i', { class: 'kp' }), 'Resolved by T1']), h('strong', { text: x.resolved + ' (' + pc(x.resolved, tot) + ')' })]),
        h('div', { class: 'tsd-tip-row' }, [h('span', null, [h('i', { class: 'kp lt' }), 'Still with T1']), h('strong', { text: String(x.open) })]),
        h('div', { class: 'tsd-tip-row' }, [h('span', null, [h('i', { class: 'tr' }), 'Transferred']), h('strong', { text: x.transferred + ' (' + pc(x.transferred, tot) + ')' })]),
        h('div', { class: 'tsd-tip-sub', text: x.call + ' calls · ' + x.chat + ' chats · ' + x.ticket + ' tickets' }));
      tip.hidden = false;
      var wr = wrap.getBoundingClientRect(), r = el.getBoundingClientRect();
      var left = r.left - wr.left + wrap.scrollLeft + r.width / 2;
      tip.style.left = Math.max(90, Math.min(left, wrap.scrollWidth - 90)) + 'px';
      wrap.querySelectorAll('.tsd-bar.on').forEach(function (b) { b.classList.remove('on'); }); el.classList.add('on');
    }
    function hide() { tip.hidden = true; wrap.querySelectorAll('.tsd-bar.on').forEach(function (b) { b.classList.remove('on'); }); }
    var bars = h('div', { class: 'tsd-trend' + (periods.length > 20 ? ' dense' : '') }, periods.map(function (x) {
      var tot = x.handled + x.transferred;
      var el = h('div', { class: 'tsd-bar', tabindex: '0', role: 'img', 'aria-label': periodLabel(x.key, g, true) + ': ' + tot + ' handled, ' + x.handled + ' kept by T1, ' + x.transferred + ' transferred' }, [
        h('span', { class: 'tsd-bar-v', text: tot ? String(tot) : '' }),
        h('div', { class: 'tsd-bar-col', style: 'height:' + (tot ? Math.max(4, Math.round(tot / max * 100)) : 0) + '%' }, [h('i', { class: 'tr', style: 'flex:' + x.transferred }), h('i', { class: 'kp', style: 'flex:' + x.handled })]),
        h('span', { class: 'tsd-bar-l', text: periodLabel(x.key, g) })]);
      el.addEventListener('mouseenter', function () { show(el, x); });
      el.addEventListener('focus', function () { show(el, x); });
      el.addEventListener('mouseleave', hide); el.addEventListener('blur', hide);
      return el;
    }));
    wrap.appendChild(bars); wrap.appendChild(tip);
    return h('div', null, [wrap,
      h('div', { class: 'tsd-legend' }, [h('span', null, [h('i', { class: 'kp' }), 'Kept by T1']), h('span', null, [h('i', { class: 'tr' }), 'Transferred'])])]);
  }
  function auditCard(d) {
    var list = d.tickets.filter(function (x) {
      if (S.filter === 'transferred' && !(x.outcome === 'toTopicTeam' || x.outcome === 'toOther')) return false;
      if (S.filter === 'resolved' && x.outcome !== 'resolved') return false;
      if (S.filter === 'open' && x.outcome !== 'open') return false;
      if (S.filter === 'bypassed' && x.outcome !== 'bypassed') return false;
      if (S.filter === 'flagged' && !(x.flags && x.flags.length)) return false;
      if (S.filter === 'low' && !(x.review && x.review.overall <= 2)) return false;
      if (S.filter === 'could' && !(x.audit && x.audit.verdict === 'could_handle')) return false;
      if (S.filter === 'against' && !(x.guide && ((x.guide.expected === 't1' && (x.outcome === 'toTopicTeam' || x.outcome === 'toOther') && !(x.audit && x.audit.verdict === 'right_transfer')) || (x.guide.expected === 'commercial' && (x.outcome === 'resolved' || x.outcome === 'open'))))) return false;
      if (S.q) { var q = S.q.toLowerCase(); if ((String(x.number) + ' ' + (x.subject || '') + ' ' + (x.agent || '') + ' ' + (x.category || '')).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
    var pending = d.tickets.filter(function (x) { return (x.outcome === 'toTopicTeam' || x.outcome === 'toOther') && !x.audit; });
    var au = d.audits;
    var filters = [['all', 'All'], ['transferred', 'Transferred'], ['resolved', 'Resolved by T1'], ['open', 'Still with T1'], ['flagged', 'Needs attention'], ['against', 'Against the guide'], ['could', 'Could have handled'], ['low', 'Rated 1 or 2']];
    var tools = h('div', { class: 'tsd-tools' }, [
      h('div', { class: 'tsd-seg', role: 'group', 'aria-label': 'Show' }, filters.map(function (f) { return h('button', { type: 'button', 'aria-pressed': S.filter === f[0] ? 'true' : 'false', text: f[1], onclick: function () { S.filter = f[0]; draw(); } }); })),
      h('input', { type: 'search', class: 'tsd-q', placeholder: 'Find a ticket, agent or topic', 'aria-label': 'Find a ticket, agent or topic', value: S.q, oninput: function (e) { S.q = e.target.value; clearTimeout(S._qt); S._qt = setTimeout(function () { var p = e.target.selectionStart; draw(); var n = document.querySelector('#tsd-root .tsd-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (er) {} } }, 200); } }),
      h('button', { type: 'button', class: 'tsd-btn primary', disabled: !pending.length || S.bulk, text: S.bulk ? 'Auditing...' : (pending.length ? 'Audit ' + Math.min(10, pending.length) + (Math.min(10, pending.length) === 1 ? ' transfer' : ' transfers') : 'All transfers audited'), onclick: function () { audit(pending.slice(0, 10).map(function (x) { return x.ticketId; }), true); } })]);
    var rows = [];
    list.slice(0, 200).forEach(function (x) {
      var o = OUT[x.outcome] || [x.outcome, 'mute'], v = x.audit && VERD[x.audit.verdict];
      var canAudit = x.outcome === 'toTopicTeam' || x.outcome === 'toOther';
      var rv = x.review, canReview = !!x.agent && x.outcome !== 'bypassed', open = !!S.openRow[x.ticketId];
      rows.push(h('tr', { class: open ? 'tsd-open' : '' }, [
        h('td', null, [x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener', class: 'tsd-num', text: '#' + x.number }) : '#' + x.number]),
        h('td', { class: 'tsd-subj' }, [h('span', { text: x.subject || '' }), h('small', { text: x.guide ? x.guide.label : x.category }),
          x.guide && EXP[x.guide.expected] ? h('span', { class: 'tsd-pill ' + EXP[x.guide.expected][1] + ' tsd-gp', title: x.guide.why || '', text: EXP[x.guide.expected][0] }) : null]),
        h('td', { text: x.channel === 'call' ? 'Call' : x.channel === 'chat' ? 'Chat' : 'Ticket' }),
        h('td', { text: x.agent || '-' }),
        h('td', null, [h('span', { class: 'tsd-pill ' + o[1], text: o[0] }), x.dest ? h('small', { class: 'tsd-dest-t', text: 'to ' + x.dest }) : null,
          (x.flags || []).length ? h('span', { class: 'tsd-pill bad tsd-gp', title: x.flags.map(function (f) { return f.label + (f.why ? ': ' + f.why : ''); }).join('\n'), text: x.flags.length === 1 ? x.flags[0].label : x.flags.length + ' problems' }) : null]),
        h('td', { class: 'num', text: fmtWhen(x.created) }),
        h('td', null, [v ? h('span', { class: 'tsd-pill ' + v[1], title: x.audit.reason + (x.audit.guide ? ' (Guide: ' + x.audit.guide + ')' : ''), text: v[0] }) : null,
          v ? h('small', { class: 'tsd-why', text: x.audit.reason }) : null,
          canAudit ? h('button', { type: 'button', class: 'tsd-link', disabled: !!S.auditing[x.ticketId], text: S.auditing[x.ticketId] ? 'Checking...' : (v ? 'Re-check' : 'Audit'), onclick: function () { audit([x.ticketId]); } }) : null]),
        h('td', null, [rv ? h('button', { type: 'button', class: 'tsd-score ' + rateCls(rv.overall), 'aria-expanded': open ? 'true' : 'false', title: 'Show the review', text: rv.overall + ' / 5', onclick: function () { S.openRow[x.ticketId] = !open; draw(); } }) : null,
          canReview ? h('button', { type: 'button', class: 'tsd-link', disabled: !!S.reviewing[x.ticketId], text: S.reviewing[x.ticketId] ? 'Reviewing...' : (rv ? 'Review again' : 'Review'), onclick: function () { review([x]); } }) : null,
          h('button', { type: 'button', class: 'tsd-link tsd-mute', title: 'Leave this ticket out of every count, for example a test ticket. You can count it again below the list.', text: 'Test ticket, leave out', onclick: function () { exclude(x.ticketId, true); } })])]));
      if (open && rv) rows.push(h('tr', { class: 'tsd-detail' }, [h('td', { colspan: '8' }, [reviewDetail(rv)])]));
    });
    return h('section', { class: 'tsd-card' }, [
      h('div', { class: 'tsd-card-hd' }, [h('div', null, [h('h3', { class: 'tsd-h3', text: 'Tickets and transfer audits' }),
        h('p', { class: 'tsd-card-sub', text: 'Every ticket counted above. Rating is the full ticket review (open it for scores and coaching points). Audit asks AI, using the support guide and the ticket conversation in Zoho Desk, whether T1 could have handled a transferred ticket. Check the reason before acting on it.' })]),
        h('div', { class: 'tsd-aud' }, [h('span', { class: 'tsd-pill bad', text: au.couldHandle + ' could have handled' }), h('span', { class: 'tsd-pill ok', text: au.rightTransfer + ' right transfers' }), au.unclear ? h('span', { class: 'tsd-pill mute', text: au.unclear + ' unclear' }) : null])]),
      tools,
      !rows.length && /^#?\d{5,}$/.test(S.q.trim()) ? whyBox(S.q.trim()) : null,
      rows.length ? h('div', { class: 'tsd-scroll' }, [h('table', { class: 'tsd-table tsd-list' }, [h('thead', null, [h('tr', null, ['Ticket', 'Subject and topic', 'Channel', 'T1 agent', 'Outcome', 'Created', 'Audit', 'Rating'].map(function (x) { return h('th', { scope: 'col', class: x === 'Created' ? 'num' : '', text: x }); }))]), h('tbody', null, rows)])]) : empty('No tickets match.'),
      list.length > 200 ? h('p', { class: 'tsd-empty', text: 'Showing the newest 200 of ' + list.length + '. Narrow the range or search to see the rest.' }) : null,
      (d.excluded || []).length ? h('div', { class: 'tsd-note' }, [h('span', { text: d.excluded.length + ' left out of the counts: ' }),
        h('ul', { class: 'tsd-why-list' }, d.excluded.map(function (e) { return h('li', null, [e.url ? h('a', { href: e.url, target: '_blank', rel: 'noopener', text: '#' + e.number }) : '#' + e.number, ' ' + (e.subject || '') + ' (' + (e.reason || 'Test ticket') + (e.by ? ', ' + e.by : '') + ') ',
          h('button', { type: 'button', class: 'tsd-link', style: 'display:inline', text: 'Count it again', onclick: function () { exclude(e.ticketId, false); } })]); }))]) : null]);
  }
  function exclude(id, on) {
    api('/api/topic-support/exclude', { ticketId: id, exclude: on, reason: 'Test ticket' }).then(function (j) {
      if (!j.success) throw new Error(j.error || 'Could not save');
      if (typeof showToast === 'function') showToast(on ? 'Left out of the counts' : 'Counted again', 'success');
      load();
    }).catch(function (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); });
  }

  function whyBox(num) {
    var box = h('div', { class: 'tsd-note' }, [h('span', { text: 'Ticket ' + num + ' is not in this list. ' }),
      h('button', { type: 'button', class: 'tsd-link', style: 'display:inline', text: 'Check why', onclick: function () {
        box.replaceChildren(h('span', { text: 'Checking ' + num + ' in Zoho...' }));
        api('/api/topic-support/why?ticket=' + encodeURIComponent(num.replace('#', ''))).then(function (j) {
          if (!j.success) throw new Error(j.error || 'Could not check');
          box.replaceChildren(h('ul', { class: 'tsd-why-list' }, (j.lines || []).map(function (l) { return h('li', { text: l }); })));
        }).catch(function (e) { box.replaceChildren(h('span', { text: e.message })); });
      } })]);
    return box;
  }
  function reviewDetail(rv) {
    var src = rv.sources || {};
    return h('div', { class: 'tsd-rv' }, [
      h('div', { class: 'tsd-dims inline' }, DIM.map(function (dm) { var v = rv[dm[0]]; return h('div', { class: 'tsd-dim' }, [h('span', { text: dm[1] }), h('b', { class: 'tsd-score sm ' + rateCls(v), text: v == null ? 'n/a' : String(v) })]); })),
      rv.summary ? h('p', { text: rv.summary }) : null,
      rv.strengths && rv.strengths.length ? h('div', null, [h('small', { text: 'Done well' }), h('ul', null, rv.strengths.map(function (t) { return h('li', { text: t }); }))]) : null,
      rv.improve && rv.improve.length ? h('div', null, [h('small', { text: 'Coaching points' }), h('ul', null, rv.improve.map(function (t) { return h('li', { text: t }); }))]) : null,
      rv.handoffMissing && rv.handoffMissing.length ? h('div', null, [h('small', { text: 'Missing from the hand-off' }), h('ul', null, rv.handoffMissing.map(function (t) { return h('li', { text: t }); }))]) : null,
      h('p', { class: 'tsd-sc-sub', text: 'Read: ' + (src.replies || 0) + ' replies and notes' + (src.chat ? ', the chat transcript' : '') + (src.calls ? ', ' + src.calls + ' call transcript' + (src.calls === 1 ? '' : 's') : '') + ', the owner history. Reviewed ' + (rv.at ? fmtWhen(String(rv.at).replace(' ', 'T') + 'Z') : '') + '. AI review: check before acting on it.' })]);
  }
  function review(items) {
    items.forEach(function (x) { S.reviewing[x.ticketId] = true; }); draw();
    api('/api/topic-support/review', { topic: S.topic, items: items.map(function (x) { return { ticketId: x.ticketId, agent: x.agent, outcome: x.outcome, dest: x.dest }; }) }).then(function (j) {
      if (!j.success) throw new Error(j.error || 'Review failed');
      var d = S.data.data[S.topic];
      (j.results || []).forEach(function (r) {
        var x = d.tickets.filter(function (t) { return t.ticketId === r.ticketId; })[0];
        if (x && !r.error) { x.review = r; S.openRow[x.ticketId] = true; }
        if (r.error && typeof showToast === 'function') showToast('Could not review: ' + r.error, 'warning');
      });
    }).catch(function (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); })
      .then(function () { items.forEach(function (x) { delete S.reviewing[x.ticketId]; }); draw(); });
  }
  function audit(ids, bulk) {
    if (!ids.length) return;
    ids.forEach(function (id) { S.auditing[id] = true; }); if (bulk) S.bulk = true; draw();
    api('/api/topic-support/audit', { topic: S.topic, ticketIds: ids }).then(function (j) {
      if (!j.success) throw new Error(j.error || 'Audit failed');
      var d = S.data.data[S.topic];
      (j.results || []).forEach(function (r) {
        var x = d.tickets.filter(function (t) { return t.ticketId === r.ticketId; })[0];
        if (x && !r.error) x.audit = { verdict: r.verdict, reason: r.reason, guide: r.guide };
      });
      d.audits = { couldHandle: d.tickets.filter(function (x) { return x.audit && x.audit.verdict === 'could_handle'; }).length,
        rightTransfer: d.tickets.filter(function (x) { return x.audit && x.audit.verdict === 'right_transfer'; }).length,
        unclear: d.tickets.filter(function (x) { return x.audit && x.audit.verdict === 'unclear'; }).length };
      var bad = (j.results || []).filter(function (r) { return r.error; });
      if (bad.length && typeof showToast === 'function') showToast(bad.length + ' could not be audited: ' + bad[0].error, 'warning');
    }).catch(function (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); })
      .then(function () { ids.forEach(function (id) { delete S.auditing[id]; }); S.bulk = false; draw(); });
  }

  window.openTopicSupport = function () { if (!S.data || Date.now() - (S.at || 0) > 5 * 60000) { S.at = Date.now(); load(); } else draw(); };
})();
