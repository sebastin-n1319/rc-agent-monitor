/* Ticket audits: queue, audit form, rule list, SPOC management, updates and insights. */
(function () {
  'use strict';
  var TA = window.TA = { me: null, root: null, mode: 'admin', tab: 'queue', filter: 'open', spocFilter: '', destF: '', agentF: '', signalF: '', sumOpen: true, q: '', auditId: null, draftRules: [], editUpdate: null };
  var BASE = (typeof BACKEND !== 'undefined' ? BACKEND : '');

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k === 'value') e.value = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(path, body, method) {
    var o = { credentials: 'include', method: method || (body ? 'POST' : 'GET') };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(BASE + path, o).then(function (r) { return r.json().catch(function () { return { success: false, error: 'HTTP ' + r.status }; }); });
  }
  function toast(msg, type) { try { if (typeof showToast === 'function') showToast(msg, type || 'success'); } catch (e) {} }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).indexOf('T') > -1 || String(iso).indexOf('Z') > -1 ? iso : String(iso).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function ago(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).indexOf('T') > -1 ? iso : String(iso).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 60) return Math.max(1, m) + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    var days = Math.round(m / 1440); return days === 1 ? 'yesterday' : days + ' days ago';
  }
  var STATUS_LABEL = { pending: 'Pending', in_audit: 'In audit', returned: 'Returned to agent', approved: 'Approved', closed: 'Closed' };
  function pill(text, cls, title) { return h('span', { class: 'tka-pill ' + (cls || ''), text: text, title: title || null }); }
  function btn(text, cls, fn, attrs) { return h('button', Object.assign({ type: 'button', class: 'tka-btn ' + (cls || ''), text: text, onclick: fn }, attrs || {})); }
  function isAdmin() { return !!(TA.me && TA.me.admin); }
  function nameOf(email, name) { return name || String(email || '').split('@')[0]; }
  function busy(b, on, label) { if (!b) return; b.disabled = !!on; if (label) b.textContent = label; }

  // ── shell ────────────────────────────────────────────────────────────
  function tabs() {
    var t = [['queue', 'Queue'], ['rules', 'Rule list'], ['updates', 'Updates']];
    if (isAdmin()) t = t.concat([['spocs', 'SPOC management'], ['insights', 'Insights']]);
    return t;
  }
  TA.open = function (mode) {
    TA.mode = mode || TA.mode;
    TA.root = document.getElementById(TA.mode === 'admin' ? 'tka-admin-root' : 'tka-agent-root');
    if (!TA.root) return;
    TA.root.className = 'tka-page';
    TA.root.replaceChildren(h('p', { class: 'tka-empty', text: 'Loading...' }));
    api('/api/audits/me').then(function (m) {
      if (!m || !m.success || !m.access) { TA.root.replaceChildren(h('div', { class: 'tka-note', text: 'Ticket audits are for SPOCs and admins.' })); return; }
      TA.me = m; setBadge(m.open || 0);
      if (!tabs().some(function (t) { return t[0] === TA.tab; })) TA.tab = 'queue';
      render();
    });
  };
  function render() {
    if (!TA.root) return;
    TA.root.classList.remove('tka-wide');
    var bar = h('div', { class: 'tka-tabs', role: 'tablist' }, tabs().map(function (t) {
      return h('button', { type: 'button', role: 'tab', class: 'tka-tab' + (TA.tab === t[0] && !TA.auditId ? ' on' : ''), text: t[1], onclick: function () { TA.tab = t[0]; TA.auditId = null; render(); } });
    }));
    var body = h('div', { class: 'tka-body' });
    TA.root.replaceChildren(
      h('div', { class: 'tka-head' }, [h('div', null, [h('h2', { text: 'Ticket audits' }), h('p', { text: 'Review tickets moved to other teams, record what was missed, and turn it into rules and team updates.' })])]),
      bar, body);
    if (TA.auditId) return viewAudit(body, TA.auditId);
    ({ queue: viewQueue, rules: viewRules, spocs: viewSpocs, updates: viewUpdates, insights: viewInsights })[TA.tab](body);
  }
  function setBadge(n) {
    ['sb-agent-audits', 'agent-tab-audits', 'sb-audits'].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      var b = el.querySelector('.pu-badge');
      if (!b) { b = h('span', { class: 'pu-badge' }); el.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n); b.style.display = n ? '' : 'none';
    });
  }
  // Called after sign-in: shows the SPOC sidebar entry and the open count.
  TA.gate = function () {
    api('/api/audits/me').then(function (m) {
      if (!m || !m.success) return;
      TA.me = m;
      ['sb-agent-audits', 'agent-tab-audits', 'sb-audits'].forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.toggle('ap-hidden', id === 'sb-audits' ? !m.admin : !m.access); });
      setBadge(m.open || 0);
    }).catch(function () {});
  };

  // ── queue ────────────────────────────────────────────────────────────
  function viewQueue(body) {
    var list = h('div', { class: 'tka-list' }), chips = h('div', { class: 'tka-chips' });
    var spocSel = null;
    var search = h('input', { class: 'tka-input', type: 'search', placeholder: 'Ticket number, subject or agent', value: TA.q, 'aria-label': 'Search audits' });
    var t = null;
    search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { TA.q = search.value; load(); }, 300); });
    var addIn = h('input', { class: 'tka-input narrow', inputmode: 'numeric', placeholder: 'Add by ticket number', 'aria-label': 'Add ticket by number' });
    var addBtn = btn('Add', '', function () {
      var num = addIn.value.replace(/[^0-9]/g, ''); if (!num) return;
      busy(addBtn, true);
      api('/api/audits/add', { ticket: num }).then(function (j) {
        busy(addBtn, false);
        if (!j.success && /Choose which agent/.test(j.error || '')) { askAgent(num); return; }
        if (!j.success) return toast(j.error || 'Could not add', 'error');
        toast(j.existed ? 'Already in the queue' : 'Added to the queue'); addIn.value = ''; load();
      });
    });
    function askAgent(num) {
      api('/api/audits/agents').then(function (a) {
        var sel = h('select', { class: 'tka-input', 'aria-label': 'Agent' }, [h('option', { value: '', text: 'Which agent handled it?' })].concat((a.agents || []).map(function (x) { return h('option', { value: x.email, text: x.name }); })));
        var go = btn('Add ticket', 'primary', function () {
          if (!sel.value) return;
          api('/api/audits/add', { ticket: num, agentEmail: sel.value }).then(function (j) { if (!j.success) return toast(j.error || 'Could not add', 'error'); toast('Added to the queue'); box.remove(); addIn.value = ''; load(); });
        });
        var box = h('div', { class: 'tka-note' }, [h('span', { text: 'No transfer was recorded for #' + num + '. ' }), sel, go]);
        top.after(box);
      });
    }
    var top = h('div', { class: 'tka-toolbar' }, [search, addIn, addBtn]);
    var sumHost = h('div', { class: 'tka-sum' }), filterBar = h('div', { class: 'tka-filters' });
    function refreshAll() { loadSummary(); load(); }
    if (isAdmin()) {
      top.appendChild(btn('Sync', '', function (ev) {
        var b = ev.currentTarget; busy(b, true, 'Syncing...');
        api('/api/audits/queue-now', {}).then(function (j) { busy(b, false, 'Sync'); toast(j.success ? (j.queued ? j.queued + ' new transfer' + (j.queued > 1 ? 's' : '') + ' queued, flags refreshed' : 'Up to date, flags refreshed') : (j.error || 'Failed'), j.success ? 'success' : 'error'); refreshAll(); });
      }, { title: 'Pull in new transfers, refresh rule flags and scan new tickets with AI' }));
      top.appendChild(btn('Assign equally', '', function (ev) {
        if (!confirm('Reshuffle every pending ticket so each active SPOC gets the same number? Tickets already in audit stay where they are.')) return;
        var b = ev.currentTarget; busy(b, true, 'Assigning...');
        api('/api/audits/rebalance', {}).then(function (j) { busy(b, false, 'Assign equally'); toast(j.success ? (j.moved ? j.moved + ' of ' + j.total + ' pending tickets moved' : 'Already balanced') : (j.error || 'Failed'), j.success ? 'success' : 'error'); refreshAll(); });
      }, { title: 'Round-robin all pending tickets across active SPOCs' }));
    }
    top.appendChild(btn('Re-scan with AI', '', function (ev) {
      var b = ev.currentTarget; busy(b, true, 'Reading tickets...');
      api('/api/audits/rescan', { force: true }).then(function (j) { busy(b, false, 'Re-scan with AI'); toast(j.success ? (j.busy ? 'A scan is already running' : j.scanned + ' ticket' + (j.scanned === 1 ? '' : 's') + ' scanned') : (j.error || 'Failed'), j.success ? 'success' : 'error'); refreshAll(); });
    }, { title: 'AI reads the description and conversation to spot frustrated customers, missed follow-ups, escalations and cancellations' }));
    function fmtH(x) { return x == null ? 'none' : x >= 48 ? Math.round(x / 24) + ' d' : x + ' h'; }
    function tile(label, value, sub, cls, fn) {
      return h(fn ? 'button' : 'div', { type: fn ? 'button' : null, class: 'tka-tile ' + (cls || '') + (fn ? ' click' : ''), onclick: fn || null }, [h('span', { class: 'tka-tile-l', text: label }), h('b', { class: 'tka-tile-v', text: String(value) }), sub ? h('span', { class: 'tka-tile-s', text: sub }) : null]);
    }
    function loadSummary() {
      api('/api/audits/summary').then(function (j) {
        if (!j.success) { sumHost.replaceChildren(); return; }
        var q = j.queue, kids = [];
        var head = h('div', { class: 'tka-inline between' }, [h('h3', { text: isAdmin() ? 'Auditor summary' : 'Your summary' }), btn(TA.sumOpen ? 'Hide' : 'Show', 'ghost sm', function () { TA.sumOpen = !TA.sumOpen; loadSummary(); })]);
        kids.push(head);
        if (TA.sumOpen) {
          var tiles = [tile('Open', q.open, q.pending + ' pending', '', function () { TA.filter = 'open'; TA.urgentF = false; TA.signalF = ''; load(); }),
            tile('Urgent by AI', q.urgent, j.aiReady ? 'cancellation, escalation, anger' : 'keyword scan only', q.urgent ? 'hot' : '', function () { TA.filter = 'open'; TA.signalF = 'urgent'; load(); })];
          if (isAdmin()) tiles.push(tile('No SPOC yet', q.unassigned, q.unassigned ? 'use Assign equally' : 'all assigned', q.unassigned ? 'warn' : '', function () { TA.filter = 'open'; TA.spocFilter = 'none'; load(); }));
          tiles.push(tile('Oldest waiting', fmtH(q.oldestHours), 'pending ticket'), tile('Audited', q.today + ' today', q.week + ' this week'), tile('Sent back', q.needsFixPct == null ? 'none' : q.needsFixPct + '%', q.done ? q.needsFix + ' of ' + q.done + ' audits' : 'no audits yet'));
          kids.push(h('div', { class: 'tka-tiles' }, tiles));
          if (j.unscanned) kids.push(h('p', { class: 'tka-hint', text: j.unscanned + ' ticket' + (j.unscanned === 1 ? '' : 's') + ' waiting for the AI scan. It runs by itself in the background.' }));
          if (j.spocs && j.spocs.length) kids.push(h('div', { class: 'tka-spocs' }, j.spocs.map(function (s) {
            var tot = s.approved + s.returned;
            return h('div', { class: 'tka-spoc' + (s.active ? '' : ' off') }, [h('b', { text: s.name }), h('div', { class: 'tka-spoc-n' }, [h('span', null, [h('b', { text: String(s.open) }), ' open']), h('span', null, [h('b', { text: String(s.done) }), ' audited'])]),
              h('span', { class: 'tka-when', text: (tot ? s.approved + ' approved, ' + s.returned + ' sent back' : 'no verdicts yet') + (s.avgHours != null ? ', about ' + s.avgHours + ' h each' : '') + (s.active ? '' : ', paused') })]);
          })));
          if (isAdmin() && (j.topMistakes || j.agents || j.destinations)) {
            function mini(title, rows, fmt) { return h('div', { class: 'tka-mini' }, [h('b', { text: title })].concat(rows.length ? rows.map(function (r) { return h('div', { class: 'tka-mini-r' }, [h('span', { text: fmt[0](r) }), h('b', { text: fmt[1](r) })]); }) : [h('span', { class: 'tka-when', text: 'Not enough audits yet' })])); }
            kids.push(h('div', { class: 'tka-minis' }, [
              mini('Most missed', j.topMistakes || [], [function (r) { return r.label; }, function (r) { return String(r.count); }]),
              mini('Agents with most mistakes', (j.agents || []).filter(function (r) { return r.mistakes; }), [function (r) { return r.name; }, function (r) { return r.mistakes + ' in ' + r.audited; }]),
              mini('Transferred to', j.destinations || [], [function (r) { return r.name; }, function (r) { return r.audited + (r.needs ? ' (' + r.needs + ' sent back)' : ''); }])]));
          }
        }
        sumHost.replaceChildren.apply(sumHost, kids);
      });
    }
    function loadFacets() {
      api('/api/audits/facets').then(function (f) {
        if (!f.success) return;
        function sel(label, val, opts, set) {
          var el = h('select', { class: 'tka-input', 'aria-label': label }, [h('option', { value: '', text: label })].concat(opts));
          el.value = val || ''; el.addEventListener('change', function () { set(el.value); load(); }); return el;
        }
        var sigOpts = [h('option', { value: 'urgent', text: 'Urgent by AI (' + f.signals.urgent + ')' })].concat(Object.keys(f.signalLabels).map(function (k) { return h('option', { value: k, text: f.signalLabels[k] + ' (' + f.signals[k] + ')' }); }));
        var bits = [
          sel('Moved to: any team', TA.destF, f.dests.map(function (d) { return h('option', { value: d.name, text: d.name + ' (' + d.n + ')' }); }), function (v) { TA.destF = v; }),
          sel('Agent: anyone', TA.agentF, f.agents.map(function (a) { return h('option', { value: a.email, text: a.name + ' (' + a.n + ')' }); }), function (v) { TA.agentF = v; }),
          sel('Signal: any', TA.signalF, sigOpts, function (v) { TA.signalF = v; })];
        if (isAdmin()) bits.push(sel('SPOC: anyone', TA.spocFilter, [h('option', { value: 'none', text: 'No SPOC yet' })].concat(f.spocs.map(function (a) { return h('option', { value: a.email, text: a.name + ' (' + a.n + ')' }); })), function (v) { TA.spocFilter = v; }));
        bits.push(btn('Clear filters', 'ghost sm', function () { TA.destF = TA.agentF = TA.signalF = TA.spocFilter = ''; TA.q = ''; search.value = ''; loadFacets(); load(); }));
        filterBar.replaceChildren.apply(filterBar, bits);
      });
    }
    body.append(sumHost, top, filterBar, chips, list);
    loadSummary(); loadFacets();
    function load() {
      var qs = '?status=' + encodeURIComponent(TA.filter) + (TA.spocFilter ? '&spoc=' + encodeURIComponent(TA.spocFilter) : '') + (TA.destF ? '&dest=' + encodeURIComponent(TA.destF) : '') + (TA.agentF ? '&agent=' + encodeURIComponent(TA.agentF) : '') + (TA.signalF === 'urgent' ? '&urgent=1' : TA.signalF ? '&signal=' + encodeURIComponent(TA.signalF) : '') + (TA.q ? '&q=' + encodeURIComponent(TA.q) : '');
      api('/api/audits/queue' + qs).then(function (j) {
        if (!j.success) { list.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not load the queue' })); return; }
        setBadge(j.counts.open || 0);
        var defs = [['open', 'Open'], ['pending', 'Pending'], ['in_audit', 'In audit'], ['returned', 'Returned'], ['approved', 'Approved'], ['closed', 'Closed'], ['all', 'All']];
        chips.replaceChildren.apply(chips, defs.map(function (d) {
          return h('button', { type: 'button', class: 'tka-chip' + (TA.filter === d[0] ? ' on' : ''), onclick: function () { TA.filter = d[0]; load(); } }, [d[1], h('b', { text: String(j.counts[d[0]] || 0) })]);
        }));
        if (isAdmin()) {
          if (j.counts.unassigned) chips.appendChild(h('button', { type: 'button', class: 'tka-chip warn' + (TA.spocFilter === 'none' ? ' on' : ''), onclick: function () { TA.spocFilter = TA.spocFilter === 'none' ? '' : 'none'; load(); } }, ['No SPOC yet', h('b', { text: String(j.counts.unassigned) })]));
          if (TA.spocFilter && TA.spocFilter !== 'none') chips.appendChild(h('button', { type: 'button', class: 'tka-chip on', text: 'Clear SPOC filter', onclick: function () { TA.spocFilter = ''; load(); } }));
        }
        var items = j.items.slice();
        if (TA.filter === 'open' || TA.filter === 'pending') items.sort(function (a, b) { return (b.flagScore - a.flagScore) || String(b.transferred_at).localeCompare(String(a.transferred_at)); });
        if (!items.length) { list.replaceChildren(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'Nothing here' }), h('p', { text: TA.filter === 'open' ? 'New tickets arrive automatically when an agent moves a ticket out of T1. You can also add one by number above.' : 'No audits in this view.' })])); return; }
        list.replaceChildren.apply(list, items.map(row));
      });
    }
    load();
  }
  var SIGNAL_LABEL = { frustrated: 'Frustrated', missed_followup: 'Missed follow-up', escalation: 'Escalation', cancellation: 'Cancellation risk' };
  function row(a) {
    var meta = [h('span', { text: nameOf(a.agent_email, a.agent_name) }), h('span', { class: 'tka-arrow', text: 'moved to' }), pill(a.dest_group || 'another team', 'dest'), h('span', { class: 'tka-when', text: ago(a.transferred_at) })];
    if (isAdmin()) meta.push(h('span', { class: 'tka-when', text: a.spoc_email ? 'SPOC: ' + nameOf(a.spoc_email, a.spoc_name) : 'No SPOC' }));
    var flags = h('div', { class: 'tka-flags' }, (a.aiSignals || []).map(function (x) { return pill('AI: ' + (SIGNAL_LABEL[x.key] || x.key), 'ai ai-' + x.key, x.evidence); }).concat(a.flags.map(function (f) { return pill(f.title, 'sev-' + f.severity, f.why); })));
    var hasFlags = a.flags.length || (a.aiSignals || []).length;
    return h('article', { class: 'tka-row' + (a.ai_priority >= 2 && (a.status === 'pending' || a.status === 'in_audit') ? ' hot' : a.flagScore >= 3 && (a.status === 'pending' || a.status === 'in_audit') ? ' warm' : '') }, [
      h('div', { class: 'tka-row-main' }, [
        h('div', { class: 'tka-row-top' }, [
          a.web_url ? h('a', { class: 'tka-num', href: a.web_url, target: '_blank', rel: 'noopener', text: '#' + a.ticket_number }) : h('b', { class: 'tka-num', text: '#' + a.ticket_number }),
          h('span', { class: 'tka-sub', text: a.subject || '' })]),
        h('div', { class: 'tka-meta' }, meta), a.ai_summary ? h('p', { class: 'tka-ai-sum', text: a.ai_summary }) : null, hasFlags ? flags : null]),
      h('div', { class: 'tka-row-side' }, [pill(STATUS_LABEL[a.status] || a.status, 'st-' + a.status),
        btn(a.status === 'pending' || a.status === 'in_audit' ? 'Audit' : 'View', a.status === 'pending' || a.status === 'in_audit' ? 'primary' : '', function () { TA.auditId = a.id; render(); })])]);
  }

  // ── audit form ───────────────────────────────────────────────────────
  function viewAudit(body, id) {
    body.replaceChildren(h('p', { class: 'tka-empty', text: 'Loading...' }));
    api('/api/audits/ticket/' + id + '/start', {}).then(function () { return api('/api/audits/ticket/' + id); }).then(function (j) {
      if (!j.success) { body.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not open this audit' }), btn('Back to queue', '', function () { TA.auditId = null; render(); })); return; }
      var a = j.audit;
      var checks = {}; // rule key -> { on, note }
      (a.findings || []).forEach(function (f) { checks[f.rule_id != null ? 'r' + f.rule_id : 'c' + f.label] = { on: true, note: f.note || '', label: f.label, rule_id: f.rule_id }; });
      var flagged = {}; a.flags.forEach(function (f) { flagged[f.rule_id] = f; });
      var done = a.status === 'approved' || a.status === 'returned' || a.status === 'closed';
      var verdict = a.verdict || '';
      var head = h('div', { class: 'tka-card' }, [
        h('div', { class: 'tka-row-top' }, [
          a.web_url ? h('a', { class: 'tka-num big', href: a.web_url, target: '_blank', rel: 'noopener', text: '#' + a.ticket_number + ' (open in Zoho Desk)' }) : h('b', { class: 'tka-num big', text: '#' + a.ticket_number }),
          pill(STATUS_LABEL[a.status] || a.status, 'st-' + a.status)]),
        h('p', { class: 'tka-subject', text: a.subject || '' }),
        h('div', { class: 'tka-meta' }, [h('span', { text: nameOf(a.agent_email, a.agent_name) }), h('span', { class: 'tka-arrow', text: 'moved to' }), pill(a.dest_group || 'another team', 'dest'), h('span', { class: 'tka-when', text: when(a.transferred_at) }),
          a.channel ? h('span', { class: 'tka-when', text: a.channel }) : null])]);
      if (isAdmin()) {
        var sel = h('select', { class: 'tka-input', 'aria-label': 'Assigned SPOC' }, [h('option', { value: '', text: 'No SPOC' })]);
        api('/api/audits/spocs').then(function (s) {
          (s.spocs || []).filter(function (x) { return x.active && x.email !== a.agent_email; }).forEach(function (x) { sel.appendChild(h('option', { value: x.email, text: nameOf(x.email, x.name) })); });
          sel.value = a.spoc_email || '';
        });
        head.appendChild(h('div', { class: 'tka-inline' }, [h('span', { class: 'tka-when', text: 'Assigned to' }), sel, btn('Reassign', 'sm', function () { api('/api/audits/ticket/' + id + '/reassign', { spoc: sel.value }).then(function (r) { toast(r.success ? 'Reassigned' : (r.error || 'Failed'), r.success ? 'success' : 'error'); }); })]));
      }
      // one short card with everything that was spotted automatically
      var spot = h('div', { class: 'tka-card tka-ai' }, [h('div', { class: 'tka-inline between' }, [h('h3', { text: 'Spotted for you' }), btn('Re-scan', 'ghost sm', function (ev) { var b = ev.currentTarget; busy(b, true, 'Reading...'); api('/api/audits/ticket/' + id + '/rescan', {}).then(function (r) { busy(b, false, 'Re-scan'); if (!r.success) return toast(r.error || 'Failed', 'error'); viewAudit(body, id); }); }, { title: 'Read the conversation again with AI' })])]);
      if (a.ai_summary) spot.appendChild(h('p', { class: 'tka-ai-sum', text: a.ai_summary }));
      var pills = (a.aiSignals || []).map(function (x) { return pill(SIGNAL_LABEL[x.key] || x.key, 'ai ai-' + x.key, x.evidence); });
      if (pills.length) spot.appendChild(h('div', { class: 'tka-flags' }, pills));
      a.flags.forEach(function (f) { spot.appendChild(h('div', { class: 'tka-flag-row' }, [pill(f.severity, 'sev-' + f.severity), h('div', null, [h('b', { text: f.title }), h('span', { text: f.why })])])); });
      if (!a.flags.length && !pills.length) spot.appendChild(h('p', { class: 'tka-empty', text: a.ai_scanned_at ? 'Nothing was flagged automatically. Check it by hand.' : 'Not scanned yet. Check it by hand.' }));
      // checklist: flagged rules first, the rest tucked away
      var checkBox = h('div', { class: 'tka-card' }, [h('h3', { text: 'What was missed?' }), h('p', { class: 'tka-hint', text: 'Tick what you found and say what exactly was missed. Nothing is ticked for you.' })]);
      var allRules = a.rules.filter(function (r) { return r.enabled; });
      function ruleRow(key, label, ruleId, desc, flagInfo) {
        var st = checks[key] || (checks[key] = { on: false, note: '', label: label, rule_id: ruleId });
        var note = h('textarea', { class: 'tka-note-in', rows: '2', placeholder: 'What exactly was missed? (the agent will see this)', maxlength: '600', value: st.note, 'aria-label': 'Note for ' + label });
        note.addEventListener('input', function () { st.note = note.value; });
        var cb = h('input', { type: 'checkbox', id: 'tka-ck-' + key });
        cb.checked = st.on;
        var wrap = h('div', { class: 'tka-ck' + (flagInfo ? ' flagged' : '') + (st.on ? ' on' : '') }, [
          h('label', { for: 'tka-ck-' + key, title: desc || '' }, [cb, h('span', { class: 'tka-ck-t' }, [h('b', { text: label }), flagInfo ? h('i', { text: 'Flagged: ' + flagInfo.why }) : null])]), note]);
        note.style.display = st.on ? '' : 'none';
        cb.addEventListener('change', function () { st.on = cb.checked; wrap.classList.toggle('on', cb.checked); note.style.display = cb.checked ? '' : 'none'; });
        return wrap;
      }
      var flaggedRules = allRules.filter(function (r) { return flagged[r.id]; }), otherRules = allRules.filter(function (r) { return !flagged[r.id]; });
      flaggedRules.forEach(function (r) { checkBox.appendChild(ruleRow('r' + r.id, r.title, r.id, r.description, flagged[r.id])); });
      var moreWrap = h('div', { class: 'tka-more' });
      var more = h('details', { class: 'tka-fold', open: flaggedRules.length ? null : 'open' }, [h('summary', { text: flaggedRules.length ? 'Other things to check (' + otherRules.length + ')' : 'Things to check (' + otherRules.length + ')' }), moreWrap]);
      otherRules.forEach(function (r) { moreWrap.appendChild(ruleRow('r' + r.id, r.title, r.id, r.description, null)); });
      Object.keys(checks).filter(function (k) { return k.charAt(0) === 'c'; }).forEach(function (k) { moreWrap.appendChild(ruleRow(k, checks[k].label, null, '', null)); });
      var customIn = h('input', { class: 'tka-input', placeholder: 'Something else that was missed', maxlength: '140', 'aria-label': 'Other mistake' });
      var customRow = h('div', { class: 'tka-inline' }, [customIn, btn('Add', 'sm', function () {
        var label = customIn.value.trim(); if (!label) return;
        var key = 'c' + label; checks[key] = { on: true, note: '', label: label, rule_id: null };
        moreWrap.insertBefore(ruleRow(key, label, null, '', null), customRow); customIn.value = ''; more.open = true;
      })]);
      moreWrap.appendChild(customRow);
      checkBox.appendChild(more);

      var verdictHint = h('p', { class: 'tka-hint' });
      function setHint() { verdictHint.textContent = verdict === 'needs_fix' ? 'The agent is tagged in the Live Ops alerts group with the misses and your feedback, and Ronnie is copied. The ticket stays with the agent until it is fixed.' : verdict === 'correct' ? 'The agent is thanked in their notifications.' : ''; }
      var verdictBtns = h('div', { class: 'tka-verdicts' });
      function vbtn(val, label, cls) {
        var b = h('button', { type: 'button', class: 'tka-vbtn ' + cls + (verdict === val ? ' on' : ''), text: label, 'aria-pressed': String(verdict === val) });
        b.addEventListener('click', function () { verdict = val; Array.prototype.forEach.call(verdictBtns.children, function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); setHint(); });
        return b;
      }
      verdictBtns.append(vbtn('correct', 'Transfer was correct', 'good'), vbtn('needs_fix', 'Needs correction', 'bad'));
      setHint();
      var summary = h('textarea', { class: 'tka-note-in', rows: '3', maxlength: '800', placeholder: 'Feedback for the agent: what to fix before this ticket moves on (specific and kind)', value: a.summary || '', 'aria-label': 'Feedback for the agent' });
      var submit = btn(done ? 'Update audit' : 'Submit audit', 'primary', function () {
        if (!verdict) return toast('Choose whether the transfer was correct or needs correction', 'error');
        var findings = Object.keys(checks).filter(function (k) { return checks[k].on; }).map(function (k) { return { rule_id: checks[k].rule_id, label: checks[k].label, note: checks[k].note }; });
        busy(submit, true, 'Saving...');
        api('/api/audits/ticket/' + id + '/submit', { verdict: verdict, summary: summary.value, findings: findings }).then(function (r) {
          busy(submit, false, done ? 'Update audit' : 'Submit audit');
          if (!r.success) return toast(r.error || 'Could not save', 'error');
          if (r.status === 'returned') toast(r.chat && r.chat.ok ? 'Returned. The agent was tagged in the Live Ops alerts group' : r.chat ? 'Returned, but the group message was not sent: ' + (r.chat.error || 'unknown reason') : 'Returned to the agent with your feedback', r.chat && !r.chat.ok ? 'error' : 'success'); else toast('Audit approved'); viewAudit(body, id);
        });
      });
      var verdictBox = h('div', { class: 'tka-card' }, [h('h3', { text: 'Your verdict' }), verdictBtns, summary, verdictHint, h('div', { class: 'tka-actions' }, [submit])]);
      var actions = [];
      if (a.status === 'returned' || a.status === 'approved') actions.push(btn('Mark closed', '', function () { api('/api/audits/ticket/' + id + '/close', {}).then(function (r) { toast(r.success ? 'Closed' : (r.error || 'Failed'), r.success ? 'success' : 'error'); viewAudit(body, id); }); }));
      if (a.status === 'closed') actions.push(btn('Reopen audit', '', function () { api('/api/audits/ticket/' + id + '/reopen', {}).then(function () { viewAudit(body, id); }); }));
      var log = h('details', { class: 'tka-fold' }, [h('summary', { text: 'History (' + (a.log || []).length + ')' })].concat((a.log || []).map(function (l) { return h('div', { class: 'tka-tl' }, [h('span', { class: 'tka-when', text: when(l.at) }), h('span', { text: nameOf(l.actor) + ' ' + String(l.action).replace(/_/g, ' ') + (l.note ? ': ' + l.note : '') })]); })));
      var back = btn('Back to the queue', 'ghost', function () { TA.auditId = null; render(); });
      var side = h('div', { class: 'tka-side' }, [storyCard(id)]);
      var main = h('div', { class: 'tka-main' }, [spot].concat(a.own ? [h('div', { class: 'tka-note', text: 'You handled this ticket, so you cannot audit it. Another SPOC will review it.' })] : [checkBox, verdictBox, actions.length ? h('div', { class: 'tka-actions pad' }, actions) : null]).concat([log]).filter(Boolean));
      body.replaceChildren(back, head, h('div', { class: 'tka-cols' }, [main, side]));
      if (TA.root) TA.root.classList.add('tka-wide');
      body.classList.add('tka-audit');
      try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    });
  }
  // Right-hand panel: where the ticket stands now, the conversation in pointers, and the changes that mattered.
  var KIND_LABEL = { created: 'Created', customer: 'Customer', agent: 'Agent reply', note: 'Note', status: 'Status', team: 'Team', owner: 'Owner', priority: 'Priority' };
  function storyCard(id) {
    var card = h('div', { class: 'tka-card tka-story' }, [h('h3', { text: 'Ticket at a glance' }), h('p', { class: 'tka-empty', text: 'Reading the ticket from Zoho Desk...' })]);
    function load(refresh) {
      api('/api/audits/ticket/' + id + '/story' + (refresh ? '?refresh=1' : '')).then(function (j) {
        var kids = [h('div', { class: 'tka-inline between' }, [h('h3', { text: 'Ticket at a glance' }), btn('Refresh', 'ghost sm', function (ev) { busy(ev.currentTarget, true, 'Reading...'); load(true); })])];
        if (!j.success || !j.available) { kids.push(h('p', { class: 'tka-empty', text: (j && (j.reason || j.error)) || 'Could not read the ticket.' })); card.replaceChildren.apply(card, kids); return; }
        var c = j.current || {};
        kids.push(h('div', { class: 'tka-now' }, [
          h('div', { class: 'tka-inline' }, [pill(c.status || 'Unknown', c.escalated ? 'sev-high' : 'dest'), c.escalated ? pill('Escalated', 'sev-high') : null, c.overdue ? pill('Overdue', 'sev-medium') : null]),
          j.statusLine ? h('p', { class: 'tka-ai-sum', text: j.statusLine }) : null,
          h('div', { class: 'tka-kv' }, [['Owner', c.owner || 'none'], ['Team', c.team || 'unknown'], ['Waiting', c.waiting || ''], ['Messages', c.customerMessages + ' from customer, ' + c.agentReplies + ' agent repl' + (c.agentReplies === 1 ? 'y' : 'ies') + (c.notes ? ', ' + c.notes + ' note' + (c.notes === 1 ? '' : 's') : '')], ['Last customer', c.lastCustomerAt ? when(c.lastCustomerAt) : 'none'], ['Last agent reply', c.lastAgentAt ? when(c.lastAgentAt) : 'none']].map(function (kv) { return h('div', { class: 'tka-kvr' }, [h('span', { text: kv[0] }), h('b', { text: kv[1] })]); }))]));
        kids.push(h('h4', { class: 'tka-sub-h', text: 'The conversation in short' }));
        kids.push(h('div', { class: 'tka-pts' }, (j.points || []).map(function (p) { return h('div', { class: 'tka-pt' }, [h('i'), h('span', { text: p })]); })));
        kids.push(h('h4', { class: 'tka-sub-h', text: 'What changed' }));
        var tl = h('div', { class: 'tka-story-tl' }, (j.timeline || []).map(function (e) {
          return h('div', { class: 'tka-ev k-' + e.kind }, [h('i'), h('div', null, [h('span', { class: 'tka-when', text: when(e.at) + (KIND_LABEL[e.kind] ? ' · ' + KIND_LABEL[e.kind] : '') }), h('p', { text: e.text })])]);
        }));
        kids.push(tl);
        kids.push(h('p', { class: 'tka-when', text: (j.source === 'ai' ? 'Summarised by AI from Zoho Desk' : 'Read from Zoho Desk') + ', ' + when(j.at) }));
        card.replaceChildren.apply(card, kids);
      }).catch(function () { card.replaceChildren(h('h3', { text: 'Ticket at a glance' }), h('p', { class: 'tka-empty', text: 'Could not read the ticket.' })); });
    }
    load(false);
    return card;
  }
  function fact(k, v) { return h('div', { class: 'tka-fact' }, [h('span', { text: k }), h('b', { text: v })]); }

  // ── rules ────────────────────────────────────────────────────────────
  var TEAMS = ['T2', 'T3/DEV', 'VOIP', 'CSM', 'POD'];
  // AI suggestions written from auditors' findings. type: 'rule' or 'update'.
  function suggestCard(type, sg, done) {
    var items = ((sg && sg.suggestions) || []).filter(function (x) { return x.type === type; });
    var card = h('div', { class: 'tka-card tka-ai' });
    var title = type === 'rule' ? 'AI suggested rules' : 'AI suggested updates';
    var analyze = btn('Analyze audits with AI', '', function () {
      busy(analyze, true, 'Reading audits...');
      api('/api/audits/suggestions/analyze', {}).then(function (r) {
        busy(analyze, false, 'Analyze audits with AI');
        if (!r.success) return toast(r.error || 'Could not analyze', 'error');
        var n = (r.rules || 0) + (r.updates || 0); toast(n ? n + ' new suggestion' + (n > 1 ? 's' : '') : 'Nothing new to suggest yet');
        done();
      });
    });
    card.appendChild(h('div', { class: 'tka-inline between' }, [h('div', null, [h('h3', { text: title }), h('p', { class: 'tka-hint', text: sg && sg.analyzedAt ? 'Written from what SPOCs recorded in audits. Last read ' + when(sg.analyzedAt) + '.' : 'Written from what SPOCs record in audits. It also runs by itself after every 5 finished audits.' })]), analyze]));
    if (!items.length) card.appendChild(h('p', { class: 'tka-empty', text: 'No suggestions waiting.' }));
    items.forEach(function (x) {
      var p = x;
      var body = type === 'rule'
        ? [h('div', { class: 'tka-row-top' }, [h('b', { text: p.title }), p.severity ? pill(p.severity, 'sev-' + p.severity) : null, pill(p.category || 'General', 'cat')]), p.description ? h('p', { class: 'tka-sub', text: p.description }) : null]
        : [h('div', { class: 'tka-row-top' }, [h('b', { text: p.title }), pill(p.kind === 'product' ? 'Product' : 'Process', 'cat')]), h('p', { class: 'tka-sub', text: p.body || '' })];
      if (x.evidence) body.push(h('p', { class: 'tka-when', text: 'Why: ' + x.evidence }));
      var acceptBtn = btn(type === 'rule' ? 'Add rule' : 'Use as draft', 'primary', function () {
        busy(acceptBtn, true);
        api('/api/audits/suggestions/' + x.id + '/accept', {}).then(function (r) {
          busy(acceptBtn, false);
          if (!r.success) return toast(r.error || 'Failed', 'error');
          toast(type === 'rule' ? 'Rule added' : 'Saved as a draft');
          done();
        });
      });
      card.appendChild(h('div', { class: 'tka-sugg' }, [h('div', { class: 'tka-rule-main' }, body), h('div', { class: 'tka-row-side' }, [acceptBtn, btn('Dismiss', 'ghost', function () { api('/api/audits/suggestions/' + x.id + '/dismiss', {}).then(function () { done(); }); })])]));
    });
    return card;
  }

  function viewRules(body) {
    var host = h('div');
    body.appendChild(host);
    Promise.all([api('/api/audits/rules'), isAdmin() ? api('/api/audits/insights') : Promise.resolve(null), api('/api/audits/suggestions')]).then(function (res) {
      var j = res[0], ins = res[1], sg = res[2];
      if (!j.success) { host.appendChild(h('div', { class: 'tka-note', text: j.error || 'Could not load rules' })); return; }
      var head = h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'Rule list' }), h('p', { class: 'tka-hint', text: 'Rules with a detector highlight matching tickets in the queue. Checklist rules are for the SPOC to tick during an audit.' })])]);
      head.appendChild(btn('Add rule', 'primary', function () { ruleForm(null); }));
      host.append(head);
      var formHost = h('div'), listHost = h('div', { class: 'tka-list' });
      host.append(formHost);
      host.appendChild(suggestCard('rule', sg, function () { TA.tab = 'rules'; render(); }));
      if (ins) {
        var unlisted = (ins.topMistakes || []).filter(function (m) { return m.rule_id == null; });
        if (unlisted.length) host.appendChild(h('div', { class: 'tka-card' }, [h('h3', { text: 'Written by SPOCs, not on the list yet' }), h('p', { class: 'tka-hint', text: 'Turn repeated mistakes into rules so they show up for every SPOC.' })].concat(unlisted.map(function (m) {
          return h('div', { class: 'tka-inline between' }, [h('span', null, [h('b', { text: m.label }), h('em', { class: 'tka-when', text: ' seen ' + m.count + ' time' + (m.count > 1 ? 's' : '') })]),
            btn('Add as rule', '', function () { api('/api/audits/rules', { title: m.label, category: 'General', severity: 'medium', detector: 'manual' }).then(function (r) { toast(r.success ? 'Rule added' : (r.error || 'Failed'), r.success ? 'success' : 'error'); TA.tab = 'rules'; render(); }); })]);
        }))));
      }
      host.appendChild(listHost);
      j.rules.forEach(function (r) { listHost.appendChild(ruleCard(r)); });
      function ruleCard(r) {
        var det = r.detector === 'manual' ? 'Checklist' : r.detectorLabel;
        var ps = r.params || {};
        var extra = r.detector === 'quick_transfer' ? ' (within ' + ps.minutes + ' min)' : r.detector === 'repeat_transfer' ? ' (' + ps.count + ' or more)' : r.detector === 'no_followups' ? ' (' + (ps.count || 3) + ' follow-up days)' : (ps.pattern ? ' (' + ps.pattern + (ps.expected ? ' should go to ' + ps.expected : '') + ')' : '');
        var c = h('article', { class: 'tka-rule' + (r.enabled ? '' : ' off') }, [
          h('div', { class: 'tka-rule-main' }, [h('div', { class: 'tka-row-top' }, [h('b', { text: r.title }), pill(r.severity, 'sev-' + r.severity), pill(r.category || 'General', 'cat')]),
            r.description ? h('p', { class: 'tka-sub', text: r.description }) : null,
            h('div', { class: 'tka-meta' }, [h('span', { text: det + extra }), h('span', { class: 'tka-when', text: 'Flagged ' + r.flagged + ', confirmed by SPOCs ' + r.confirmed })])])]);
        c.appendChild(h('div', { class: 'tka-row-side' }, [
          btn(r.enabled ? 'On' : 'Off', r.enabled ? 'on' : '', function () { api('/api/audits/rules/' + r.id, { enabled: !r.enabled }, 'PUT').then(function () { viewRulesRefresh(); }); }, { 'aria-pressed': String(!!r.enabled) }),
          btn('Edit', '', function () { ruleForm(r); }),
          isAdmin() ? btn('Delete', 'danger', function () { if (confirm('Delete this rule? Past audit notes keep its name.')) api('/api/audits/rules/' + r.id, null, 'DELETE').then(function () { viewRulesRefresh(); }); }) : null]));
        return c;
      }
      function viewRulesRefresh() { TA.tab = 'rules'; render(); }
      function ruleForm(r) {
        r = r || { title: '', category: '', description: '', severity: 'medium', detector: 'manual', params: {}, enabled: true };
        var f = { title: h('input', { class: 'tka-input', value: r.title, maxlength: '140', placeholder: 'Rule title', 'aria-label': 'Rule title' }),
          category: h('input', { class: 'tka-input', value: r.category || '', maxlength: '60', placeholder: 'Category, for example Follow-up', 'aria-label': 'Category' }),
          description: h('textarea', { class: 'tka-note-in', rows: '2', maxlength: '600', value: r.description || '', placeholder: 'What good looks like, and what the mistake is', 'aria-label': 'Description' }),
          severity: h('select', { class: 'tka-input', 'aria-label': 'Severity' }, ['low', 'medium', 'high'].map(function (s) { return h('option', { value: s, text: s.charAt(0).toUpperCase() + s.slice(1) }); })),
          detector: h('select', { class: 'tka-input', 'aria-label': 'How it is detected' }, Object.keys(j.detectors).map(function (k) { return h('option', { value: k, text: j.detectors[k] }); })),
          a: h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '240', 'aria-label': 'Value' }),
          pattern: h('input', { class: 'tka-input', maxlength: '200', placeholder: 'Words to look for, separate with | (billing|invoice|refund)', 'aria-label': 'Words to look for' }),
          expected: h('select', { class: 'tka-input', 'aria-label': 'Correct team' }, TEAMS.map(function (t) { return h('option', { value: t, text: t }); })) };
        f.severity.value = r.severity; f.detector.value = r.detector;
        f.a.value = r.detector === 'quick_transfer' ? (r.params.minutes || 10) : (r.params.count || 3);
        f.pattern.value = r.params.pattern || ''; f.expected.value = r.params.expected || 'T2';
        var dyn = h('div', { class: 'tka-inline' });
        function drawDyn() {
          var d = f.detector.value; dyn.replaceChildren();
          if (d === 'quick_transfer') dyn.append(h('span', { text: 'Flag when moved within' }), f.a, h('span', { text: 'minutes of creation' }));
          if (d === 'no_followups') dyn.append(h('span', { text: 'Expect' }), f.a, h('span', { text: 'follow-up days after the first reply' }));
          if (d === 'repeat_transfer') dyn.append(h('span', { text: 'Flag at' }), f.a, h('span', { text: 'or more reassignments' }));
          if (d === 'category_team') dyn.append(f.pattern, h('span', { text: 'should go to' }), f.expected);
          if (d === 'subject_keyword') dyn.append(f.pattern);
        }
        f.detector.addEventListener('change', drawDyn); drawDyn();
        var save = btn(r.id ? 'Save rule' : 'Add rule', 'primary', function () {
          var d = f.detector.value, params = {};
          if (d === 'quick_transfer') params.minutes = Number(f.a.value);
          if (d === 'repeat_transfer' || d === 'no_followups') params.count = Number(f.a.value);
          if (d === 'category_team') { params.pattern = f.pattern.value; params.expected = f.expected.value; }
          if (d === 'subject_keyword') params.pattern = f.pattern.value;
          var payload = { title: f.title.value, category: f.category.value, description: f.description.value, severity: f.severity.value, detector: d, params: params };
          busy(save, true);
          (r.id ? api('/api/audits/rules/' + r.id, payload, 'PUT') : api('/api/audits/rules', payload)).then(function (x) { busy(save, false); if (!x.success) return toast(x.error || 'Could not save', 'error'); toast('Rule saved'); viewRulesRefresh(); });
        });
        var words = h('textarea', { class: 'tka-note-in', rows: '2', maxlength: '800', placeholder: 'Describe the mistake in your own words, for example: agents move billing tickets to T2 without checking the invoice first', 'aria-label': 'Describe the rule in your own words' });
        var fill = btn('Fill the form with AI', '', function () {
          if (words.value.trim().length < 8) return toast('Describe the mistake in a sentence first', 'error');
          busy(fill, true, 'Writing...');
          api('/api/audits/rules/draft', { words: words.value }).then(function (x) {
            busy(fill, false, 'Fill the form with AI');
            if (!x.success) return toast(x.error || 'Could not write the rule', 'error');
            var d = x.rule; f.title.value = d.title || ''; f.category.value = d.category || ''; f.description.value = d.description || ''; f.severity.value = d.severity || 'medium'; f.detector.value = d.detector || 'manual';
            var ps = d.params || {}; f.a.value = d.detector === 'quick_transfer' ? (ps.minutes || 10) : (ps.count || 3); f.pattern.value = ps.pattern || ''; f.expected.value = ps.expected || 'T2'; drawDyn();
            toast('Filled in. Check it and save.');
          });
        });
        formHost.replaceChildren(h('div', { class: 'tka-card' }, [h('h3', { text: r.id ? 'Edit rule' : 'New rule' }), r.id ? null : h('div', { class: 'tka-aibox' }, [h('p', { class: 'tka-hint', text: 'Optional: let AI turn a sentence into a full rule, then edit anything.' }), words, h('div', { class: 'tka-actions' }, [fill])]), f.title, h('div', { class: 'tka-inline' }, [f.category, f.severity]), f.description,
          h('div', { class: 'tka-inline' }, [h('span', { text: 'How it is found' }), f.detector]), dyn, h('div', { class: 'tka-actions' }, [save, btn('Cancel', 'ghost', function () { formHost.replaceChildren(); })])]));
        formHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // ── SPOC management ──────────────────────────────────────────────────
  function viewSpocs(body) {
    api('/api/audits/spocs').then(function (j) {
      if (!j.success) { body.appendChild(h('div', { class: 'tka-note', text: j.error || 'Could not load SPOCs' })); return; }
      var have = {}; j.spocs.forEach(function (s) { have[s.email] = true; });
      var sel = h('select', { class: 'tka-input', 'aria-label': 'Pick a person' }, [h('option', { value: '', text: 'Pick an agent or admin' })].concat(j.candidates.filter(function (c) { return !have[c.email]; }).map(function (c) { return h('option', { value: c.email, text: c.name + ' (' + c.kind + ')' }); })));
      var add = btn('Add SPOC', 'primary', function () {
        if (!sel.value) return; busy(add, true);
        api('/api/audits/spocs', { email: sel.value }).then(function (r) { busy(add, false); if (!r.success) return toast(r.error || 'Could not add', 'error'); toast('SPOC added'); TA.tab = 'spocs'; render(); });
      });
      var cards = j.spocs.length ? j.spocs.map(function (s) {
        return h('article', { class: 'tka-rule' + (s.active ? '' : ' off') }, [
          h('div', { class: 'tka-rule-main' }, [h('b', { text: s.name || s.email }), h('div', { class: 'tka-meta' }, [h('span', { text: s.email }), h('span', { text: s.open + ' open' }), h('span', { text: s.done + ' audited' }), h('span', { text: s.avgHours != null ? 'about ' + s.avgHours + ' h per audit' : 'no turnaround yet' })])]),
          h('div', { class: 'tka-row-side' }, [
            btn(s.active ? 'Active' : 'Paused', s.active ? 'on' : '', function () { api('/api/audits/spocs/' + encodeURIComponent(s.email), { active: !s.active }, 'PUT').then(function () { TA.tab = 'spocs'; render(); }); }, { 'aria-pressed': String(!!s.active) }),
            btn('Remove', 'danger', function () { if (confirm('Remove this SPOC? Their open audits go back to the pool.')) api('/api/audits/spocs/' + encodeURIComponent(s.email), null, 'DELETE').then(function () { TA.tab = 'spocs'; render(); }); })])]);
      }) : [h('div', { class: 'tka-empty-card' }, [h('b', { text: 'No SPOCs yet' }), h('p', { text: 'Add people below. Queued tickets are shared between active SPOCs automatically, and nobody audits their own tickets.' })])];
      var since = h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '120', value: String(Math.max(1, Math.round((Date.now() - Date.parse(j.settings.queueSince || Date.now())) / 864e5)) || 14), 'aria-label': 'Days back' });
      var auto = h('input', { type: 'checkbox', id: 'tka-auto' }); auto.checked = !!j.settings.autoQueue;
      var aa = h('input', { type: 'checkbox', id: 'tka-aa' }); aa.checked = j.settings.autoAnalyze !== false;
      var saveSet = btn('Save settings', '', function () {
        api('/api/audits/settings', { autoQueue: auto.checked, sinceDays: Number(since.value), autoAnalyze: aa.checked }, 'PUT').then(function (r) { toast(r.success ? 'Saved' : (r.error || 'Failed'), r.success ? 'success' : 'error'); });
      });
      body.append(
        h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'SPOC management' }), h('p', { class: 'tka-hint', text: 'SPOCs are existing agents or admins. They see the Ticket audits page with only the tickets assigned to them, plus the rule list.' })])]),
        h('div', { class: 'tka-card' }, [h('div', { class: 'tka-inline' }, [sel, add])]),
        h('div', { class: 'tka-list' }, cards),
        h('div', { class: 'tka-card' }, [h('h3', { text: 'Queue settings' }),
          h('label', { class: 'tka-inline', for: 'tka-auto' }, [auto, h('span', { text: 'Add tickets automatically when an agent moves them out of T1' })]),
          h('div', { class: 'tka-inline' }, [h('span', { text: 'Include transfers from the last' }), since, h('span', { text: 'days' })]),
          h('label', { class: 'tka-inline', for: 'tka-aa' }, [aa, h('span', { text: 'Let AI suggest new rules and updates after every 5 finished audits' })]),
          h('div', { class: 'tka-actions' }, [saveSet])]));
    });
  }

  // ── updates ──────────────────────────────────────────────────────────
  function viewUpdates(body) {
    Promise.all([api('/api/audits/updates'), api('/api/audits/rules'), api('/api/audits/suggestions')]).then(function (res) {
      var u = res[0], rj = res[1], sg = res[2];
      if (!u.success) { body.appendChild(h('div', { class: 'tka-note', text: u.error || 'Could not load updates' })); return; }
      var rules = (rj.rules || []).filter(function (r) { return r.enabled; });
      var cur = TA.editUpdate || { id: null, kind: 'process', title: '', body: '', rule_ids: TA.draftRules.slice(), audience: 'agents' };
      TA.editUpdate = null; TA.draftRules = [];
      var kind = h('select', { class: 'tka-input', 'aria-label': 'Update type' }, [h('option', { value: 'process', text: 'Process update' }), h('option', { value: 'product', text: 'Product update' })]); kind.value = cur.kind;
      var aud = h('select', { class: 'tka-input', 'aria-label': 'Audience' }, [h('option', { value: 'agents', text: 'Agents' }), h('option', { value: 'all', text: 'Everyone' })]); aud.value = cur.audience || 'agents';
      var picked = {}; (cur.rule_ids || []).forEach(function (i) { picked[i] = true; });
      var ruleBox = h('div', { class: 'tka-picks' }, rules.map(function (r) {
        var cb = h('input', { type: 'checkbox', id: 'tka-up-' + r.id }); cb.checked = !!picked[r.id];
        cb.addEventListener('change', function () { picked[r.id] = cb.checked; });
        return h('label', { for: 'tka-up-' + r.id, class: 'tka-pick' }, [cb, h('span', { text: r.title })]);
      }));
      var gist = h('textarea', { class: 'tka-note-in', rows: '2', maxlength: '800', placeholder: 'Optional: the correct process or any detail the draft should include', 'aria-label': 'Extra context' });
      var title = h('input', { class: 'tka-input', maxlength: '140', value: cur.title, placeholder: 'Title', 'aria-label': 'Title' });
      var text = h('textarea', { class: 'tka-note-in', rows: '5', maxlength: '600', value: cur.body, placeholder: 'What happened, why it matters, and what to do instead', 'aria-label': 'Update text' });
      var count = h('span', { class: 'tka-when', text: text.value.length + '/600' });
      text.addEventListener('input', function () { count.textContent = text.value.length + '/600'; });
      function ids() { return Object.keys(picked).filter(function (k) { return picked[k]; }).map(Number); }
      var draft = btn('Draft with AI', '', function () {
        if (!ids().length && gist.value.trim().length < 6) return toast('Pick a rule or write a few words first', 'error');
        busy(draft, true, 'Drafting...');
        api('/api/audits/updates/draft', { ruleIds: ids(), kind: kind.value, gist: gist.value }).then(function (r) {
          busy(draft, false, 'Draft with AI');
          if (!r.success) return toast(r.error || 'Could not draft', 'error');
          title.value = r.draft.title; text.value = r.draft.body; count.textContent = text.value.length + '/600';
        });
      });
      var polishIn = h('input', { class: 'tka-input', maxlength: '200', placeholder: 'Optional: how to change it, for example shorter, add the correct steps', 'aria-label': 'How should AI change the text' });
      var polish = btn('Polish with AI', '', function () {
        if (text.value.trim().length < 10) return toast('Write the update first, then AI can polish it', 'error');
        busy(polish, true, 'Polishing...');
        api('/api/audits/updates/draft', { ruleIds: ids(), kind: kind.value, current: { title: title.value, body: text.value }, instruction: polishIn.value }).then(function (r) {
          busy(polish, false, 'Polish with AI');
          if (!r.success) return toast(r.error || 'Could not polish', 'error');
          title.value = r.draft.title || title.value; text.value = r.draft.body || text.value; count.textContent = text.value.length + '/600';
        });
      });
      function payload() { return { kind: kind.value, title: title.value, body: text.value, audience: aud.value, rule_ids: ids() }; }
      function save(then) {
        return (cur.id ? api('/api/audits/updates/' + cur.id, payload(), 'PUT') : api('/api/audits/updates', payload())).then(function (r) {
          if (!r.success) { toast(r.error || 'Could not save', 'error'); return null; }
          return r.id || cur.id;
        });
      }
      var saveBtn = btn(cur.status === 'published' ? 'Save changes' : 'Save draft', '', function () { busy(saveBtn, true); save().then(function (id) { busy(saveBtn, false); if (id) { toast(cur.status === 'published' ? 'Changes saved' : 'Draft saved'); TA.tab = 'updates'; render(); } }); });
      var pub = !isAdmin() ? null : btn('Publish to the bell', 'primary', function () {
        if (!title.value.trim() || !text.value.trim()) return toast('Add a title and text first', 'error');
        if (!confirm('Publish this ' + kind.value + ' update to ' + (aud.value === 'all' ? 'everyone' : 'all agents') + '?')) return;
        busy(pub, true, 'Publishing...');
        save().then(function (id) {
          if (!id) { busy(pub, false, 'Publish to the bell'); return; }
          api('/api/audits/updates/' + id + '/publish', {}).then(function (r) { busy(pub, false, 'Publish to the bell'); if (!r.success) return toast(r.error || 'Could not publish', 'error'); toast('Published'); TA.tab = 'updates'; render(); });
        });
      });
      var list = u.updates.map(function (x) {
        var c = h('article', { class: 'tka-rule' }, [h('div', { class: 'tka-rule-main' }, [h('div', { class: 'tka-row-top' }, [h('b', { text: x.title }), pill(x.kind === 'product' ? 'Product' : 'Process', 'cat'), pill(x.status === 'published' ? 'Published' : 'Draft', x.status === 'published' ? 'st-approved' : 'st-pending')]),
          h('p', { class: 'tka-sub', text: x.body || '' }), h('div', { class: 'tka-meta' }, [h('span', { class: 'tka-when', text: x.status === 'published' ? 'Published ' + when(x.published_at) : 'Created ' + when(x.created_at) })])])]);
        c.appendChild(h('div', { class: 'tka-row-side' }, [btn('Edit', '', function () { TA.editUpdate = x; TA.tab = 'updates'; render(); }), isAdmin() ? btn('Delete', 'danger', function () { if (confirm('Delete this update?')) api('/api/audits/updates/' + x.id, null, 'DELETE').then(function () { TA.tab = 'updates'; render(); }); }) : null]));
        return c;
      });
      body.append(
        suggestCard('update', sg, function () { TA.tab = 'updates'; render(); }),
        h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: cur.id ? (cur.status === 'published' ? 'Edit published update' : 'Edit update') : 'New update' }), h('p', { class: 'tka-hint', text: (isAdmin() ? 'Pick the rules behind a recurring mistake, let AI draft or polish a blameless update, edit it, then publish it to everyone\'s bell.' : 'Pick the rules behind a recurring mistake, let AI draft or polish a blameless update and save it. An admin publishes it.') + (cur.status === 'published' ? ' Saving also updates the bell entry.' : '') })])]),
        h('div', { class: 'tka-card' }, [h('div', { class: 'tka-inline' }, [kind, aud]), h('p', { class: 'tka-hint', text: 'Rules behind this update' }), ruleBox, gist, h('div', { class: 'tka-actions' }, [draft]),
          title, text, h('div', { class: 'tka-inline between' }, [count]), h('div', { class: 'tka-inline' }, [polishIn, polish]), h('div', { class: 'tka-actions' }, [saveBtn, cur.status === 'published' ? null : pub, cur.id ? btn('New update', 'ghost', function () { TA.tab = 'updates'; render(); }) : null])]),
        h('h3', { class: 'tka-h3', text: 'Drafts and published updates' }), h('div', { class: 'tka-list' }, list.length ? list : [h('p', { class: 'tka-empty', text: 'Nothing yet.' })]));
    });
  }

  // ── insights ─────────────────────────────────────────────────────────
  function bars(items, max, labelKey, valKey, sub) {
    return h('div', { class: 'tka-bars' }, items.map(function (it) {
      var pct = max ? Math.round((it[valKey] / max) * 100) : 0;
      return h('div', { class: 'tka-bar' }, [h('span', { class: 'tka-bar-l', text: it[labelKey] }), h('span', { class: 'tka-bar-t' }, [h('i', { style: 'width:' + Math.max(pct, 2) + '%' })]), h('b', { text: String(it[valKey]) + (sub ? sub(it) : '') })]);
    }));
  }
  function viewInsights(body) {
    api('/api/audits/insights').then(function (j) {
      if (!j.success) { body.appendChild(h('div', { class: 'tka-note', text: j.error || 'Could not load insights' })); return; }
      var tile = function (n, l) { return h('div', { class: 'tka-tile' }, [h('b', { text: String(n) }), h('span', { text: l })]); };
      var tiles = h('div', { class: 'tka-tiles' }, [tile(j.total, 'Tickets in the audit queue'), tile(j.audited, 'Audited'), tile(j.needsFixPct == null ? '-' : j.needsFixPct + '%', 'Needed correction'), tile(j.flagged, 'Flagged by rules')]);
      var mk = j.topMistakes.length ? h('div', { class: 'tka-card' }, [h('h3', { text: 'Most common mistakes' }), bars(j.topMistakes, j.topMistakes[0].count, 'label', 'count')].concat(j.topMistakes.slice(0, 5).filter(function (m) { return m.rule_id != null; }).map(function (m) {
        return h('div', { class: 'tka-inline between' }, [h('span', { text: m.label }), btn('Write an update', '', function () { TA.draftRules = [m.rule_id]; TA.tab = 'updates'; render(); })]);
      }))) : h('div', { class: 'tka-card' }, [h('h3', { text: 'Most common mistakes' }), h('p', { class: 'tka-empty', text: 'Appears after SPOCs submit their first audits.' })]);
      var wk = j.weeks.length ? h('div', { class: 'tka-card' }, [h('h3', { text: 'Audits per week' }), bars(j.weeks.map(function (w) { return { week: w.week, audited: w.audited, needs: w.needs }; }), Math.max.apply(null, j.weeks.map(function (w) { return w.audited; })), 'week', 'audited', function (it) { return ' (' + it.needs + ' needed correction)'; })]) : null;
      var ag = j.agents.length ? h('div', { class: 'tka-card' }, [h('h3', { text: 'By agent' }), h('p', { class: 'tka-hint', text: 'Use this for coaching conversations, not for ranking people.' }),
        bars(j.agents.map(function (a) { return { n: a.name, audited: a.audited, needs: a.needs, mistakes: a.mistakes }; }), Math.max.apply(null, j.agents.map(function (a) { return a.audited; })), 'n', 'audited', function (it) { return ' audited, ' + it.needs + ' needed correction'; })]) : null;
      var ds = j.destinations.length ? h('div', { class: 'tka-card' }, [h('h3', { text: 'By destination team' }), bars(j.destinations, Math.max.apply(null, j.destinations.map(function (d) { return d.audited; })), 'name', 'audited', function (it) { return ' audited, ' + it.needs + ' needed correction'; })]) : null;
      body.append(tiles, mk, wk, ag, ds);
    });
  }
})();
