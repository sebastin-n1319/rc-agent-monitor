/* Ticket audits: queue, audit form, rule list, SPOC management, updates and insights. */
(function () {
  'use strict';
  var TA = window.TA = { me: null, root: null, mode: 'admin', tab: 'queue', filter: 'open', spocFilter: '', q: '', auditId: null, draftRules: [], editUpdate: null };
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
  function pill(text, cls, title) { return h('span', { class: 'ta-pill ' + (cls || ''), text: text, title: title || null }); }
  function btn(text, cls, fn, attrs) { return h('button', Object.assign({ type: 'button', class: 'ta-btn ' + (cls || ''), text: text, onclick: fn }, attrs || {})); }
  function isAdmin() { return !!(TA.me && TA.me.admin); }
  function nameOf(email, name) { return name || String(email || '').split('@')[0]; }
  function busy(b, on, label) { if (!b) return; b.disabled = !!on; if (label) b.textContent = label; }

  // ── shell ────────────────────────────────────────────────────────────
  function tabs() {
    var t = [['queue', 'Queue'], ['rules', 'Rule list']];
    if (isAdmin()) t = t.concat([['spocs', 'SPOC management'], ['updates', 'Updates'], ['insights', 'Insights']]);
    return t;
  }
  TA.open = function (mode) {
    TA.mode = mode || TA.mode;
    TA.root = document.getElementById(TA.mode === 'admin' ? 'ta-admin-root' : 'ta-agent-root');
    if (!TA.root) return;
    TA.root.className = 'ta-page';
    TA.root.replaceChildren(h('p', { class: 'ta-empty', text: 'Loading...' }));
    api('/api/audits/me').then(function (m) {
      if (!m || !m.success || !m.access) { TA.root.replaceChildren(h('div', { class: 'ta-note', text: 'Ticket audits are for SPOCs and admins.' })); return; }
      TA.me = m; setBadge(m.open || 0);
      if (!tabs().some(function (t) { return t[0] === TA.tab; })) TA.tab = 'queue';
      render();
    });
  };
  function render() {
    if (!TA.root) return;
    var bar = h('div', { class: 'ta-tabs', role: 'tablist' }, tabs().map(function (t) {
      return h('button', { type: 'button', role: 'tab', class: 'ta-tab' + (TA.tab === t[0] && !TA.auditId ? ' on' : ''), text: t[1], onclick: function () { TA.tab = t[0]; TA.auditId = null; render(); } });
    }));
    var body = h('div', { class: 'ta-body' });
    TA.root.replaceChildren(
      h('div', { class: 'ta-head' }, [h('div', null, [h('h2', { text: 'Ticket audits' }), h('p', { text: 'Review tickets moved to other teams, record what was missed, and turn it into rules and team updates.' })])]),
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
      ['sb-agent-audits', 'agent-tab-audits'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = m.access ? '' : 'none'; });
      setBadge(m.open || 0);
    }).catch(function () {});
  };

  // ── queue ────────────────────────────────────────────────────────────
  function viewQueue(body) {
    var list = h('div', { class: 'ta-list' }), chips = h('div', { class: 'ta-chips' });
    var spocSel = null;
    var search = h('input', { class: 'ta-input', type: 'search', placeholder: 'Ticket number, subject or agent', value: TA.q, 'aria-label': 'Search audits' });
    var t = null;
    search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { TA.q = search.value; load(); }, 300); });
    var addIn = h('input', { class: 'ta-input narrow', inputmode: 'numeric', placeholder: 'Add by ticket number', 'aria-label': 'Add ticket by number' });
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
        var sel = h('select', { class: 'ta-input', 'aria-label': 'Agent' }, [h('option', { value: '', text: 'Which agent handled it?' })].concat((a.agents || []).map(function (x) { return h('option', { value: x.email, text: x.name }); })));
        var go = btn('Add ticket', 'primary', function () {
          if (!sel.value) return;
          api('/api/audits/add', { ticket: num, agentEmail: sel.value }).then(function (j) { if (!j.success) return toast(j.error || 'Could not add', 'error'); toast('Added to the queue'); box.remove(); addIn.value = ''; load(); });
        });
        var box = h('div', { class: 'ta-note' }, [h('span', { text: 'No transfer was recorded for #' + num + '. ' }), sel, go]);
        top.after(box);
      });
    }
    var top = h('div', { class: 'ta-toolbar' }, [search, addIn, addBtn]);
    if (isAdmin()) top.appendChild(btn('Check for new transfers', '', function (ev) {
      var b = ev.currentTarget; busy(b, true, 'Checking...');
      api('/api/audits/queue-now', {}).then(function (j) { busy(b, false, 'Check for new transfers'); toast(j.success ? (j.queued ? j.queued + ' new transfer' + (j.queued > 1 ? 's' : '') + ' queued' : 'No new transfers found') : (j.error || 'Failed'), j.success ? 'success' : 'error'); load(); });
    }));
    body.append(top, chips, list);
    function load() {
      var qs = '?status=' + encodeURIComponent(TA.filter) + (TA.spocFilter ? '&spoc=' + encodeURIComponent(TA.spocFilter) : '') + (TA.q ? '&q=' + encodeURIComponent(TA.q) : '');
      api('/api/audits/queue' + qs).then(function (j) {
        if (!j.success) { list.replaceChildren(h('div', { class: 'ta-note', text: j.error || 'Could not load the queue' })); return; }
        setBadge(j.counts.open || 0);
        var defs = [['open', 'Open'], ['pending', 'Pending'], ['in_audit', 'In audit'], ['returned', 'Returned'], ['approved', 'Approved'], ['closed', 'Closed'], ['all', 'All']];
        chips.replaceChildren.apply(chips, defs.map(function (d) {
          return h('button', { type: 'button', class: 'ta-chip' + (TA.filter === d[0] ? ' on' : ''), onclick: function () { TA.filter = d[0]; load(); } }, [d[1], h('b', { text: String(j.counts[d[0]] || 0) })]);
        }));
        if (isAdmin()) {
          if (j.counts.unassigned) chips.appendChild(h('button', { type: 'button', class: 'ta-chip warn' + (TA.spocFilter === 'none' ? ' on' : ''), onclick: function () { TA.spocFilter = TA.spocFilter === 'none' ? '' : 'none'; load(); } }, ['No SPOC yet', h('b', { text: String(j.counts.unassigned) })]));
          if (TA.spocFilter && TA.spocFilter !== 'none') chips.appendChild(h('button', { type: 'button', class: 'ta-chip on', text: 'Clear SPOC filter', onclick: function () { TA.spocFilter = ''; load(); } }));
        }
        var items = j.items.slice();
        if (TA.filter === 'open' || TA.filter === 'pending') items.sort(function (a, b) { return (b.flagScore - a.flagScore) || String(b.transferred_at).localeCompare(String(a.transferred_at)); });
        if (!items.length) { list.replaceChildren(h('div', { class: 'ta-empty-card' }, [h('b', { text: 'Nothing here' }), h('p', { text: TA.filter === 'open' ? 'New tickets arrive automatically when an agent moves a ticket out of T1. You can also add one by number above.' : 'No audits in this view.' })])); return; }
        list.replaceChildren.apply(list, items.map(row));
      });
    }
    load();
  }
  function row(a) {
    var meta = [h('span', { text: nameOf(a.agent_email, a.agent_name) }), h('span', { class: 'ta-arrow', text: 'moved to' }), pill(a.dest_group || 'another team', 'dest'), h('span', { class: 'ta-when', text: ago(a.transferred_at) })];
    if (isAdmin()) meta.push(h('span', { class: 'ta-when', text: a.spoc_email ? 'SPOC: ' + nameOf(a.spoc_email, a.spoc_name) : 'No SPOC' }));
    var flags = h('div', { class: 'ta-flags' }, a.flags.map(function (f) { return pill(f.title, 'sev-' + f.severity, f.why); }));
    return h('article', { class: 'ta-row' + (a.flagScore >= 3 && (a.status === 'pending' || a.status === 'in_audit') ? ' hot' : '') }, [
      h('div', { class: 'ta-row-main' }, [
        h('div', { class: 'ta-row-top' }, [
          a.web_url ? h('a', { class: 'ta-num', href: a.web_url, target: '_blank', rel: 'noopener', text: '#' + a.ticket_number }) : h('b', { class: 'ta-num', text: '#' + a.ticket_number }),
          h('span', { class: 'ta-sub', text: a.subject || '' })]),
        h('div', { class: 'ta-meta' }, meta), a.flags.length ? flags : null]),
      h('div', { class: 'ta-row-side' }, [pill(STATUS_LABEL[a.status] || a.status, 'st-' + a.status),
        btn(a.status === 'pending' || a.status === 'in_audit' ? 'Audit' : 'View', a.status === 'pending' || a.status === 'in_audit' ? 'primary' : '', function () { TA.auditId = a.id; render(); })])]);
  }

  // ── audit form ───────────────────────────────────────────────────────
  function viewAudit(body, id) {
    body.replaceChildren(h('p', { class: 'ta-empty', text: 'Loading...' }));
    api('/api/audits/ticket/' + id + '/start', {}).then(function () { return api('/api/audits/ticket/' + id); }).then(function (j) {
      if (!j.success) { body.replaceChildren(h('div', { class: 'ta-note', text: j.error || 'Could not open this audit' }), btn('Back to queue', '', function () { TA.auditId = null; render(); })); return; }
      var a = j.audit;
      var checks = {}; // rule key -> { on, note }
      (a.findings || []).forEach(function (f) { checks[f.rule_id != null ? 'r' + f.rule_id : 'c' + f.label] = { on: true, note: f.note || '', label: f.label, rule_id: f.rule_id }; });
      var flagged = {}; a.flags.forEach(function (f) { flagged[f.rule_id] = f; });
      var done = a.status === 'approved' || a.status === 'returned' || a.status === 'closed';
      var verdict = a.verdict || '';
      var head = h('div', { class: 'ta-card' }, [
        h('div', { class: 'ta-row-top' }, [
          a.web_url ? h('a', { class: 'ta-num big', href: a.web_url, target: '_blank', rel: 'noopener', text: '#' + a.ticket_number + ' (open in Zoho Desk)' }) : h('b', { class: 'ta-num big', text: '#' + a.ticket_number }),
          pill(STATUS_LABEL[a.status] || a.status, 'st-' + a.status)]),
        h('p', { class: 'ta-subject', text: a.subject || '' }),
        h('div', { class: 'ta-facts' }, [
          fact('Agent', nameOf(a.agent_email, a.agent_name)), fact('Moved to', a.dest_group || 'another team'), fact('Moved', when(a.transferred_at)),
          fact('Now in Zoho', a.zoho_status || '-'), fact('Current owner', a.owner_name || '-'), fact('Channel', a.channel || '-'), fact('Account', a.account_name || '-')])]);
      var reassign = null;
      if (isAdmin()) {
        var sel = h('select', { class: 'ta-input', 'aria-label': 'Assigned SPOC' }, [h('option', { value: '', text: 'No SPOC' })]);
        api('/api/audits/spocs').then(function (s) {
          (s.spocs || []).filter(function (x) { return x.active; }).forEach(function (x) { sel.appendChild(h('option', { value: x.email, text: nameOf(x.email, x.name) })); });
          sel.value = a.spoc_email || '';
        });
        reassign = h('div', { class: 'ta-inline' }, [h('span', { text: 'Assigned to' }), sel, btn('Reassign', '', function () { api('/api/audits/ticket/' + id + '/reassign', { spoc: sel.value }).then(function (r) { toast(r.success ? 'Reassigned' : (r.error || 'Failed'), r.success ? 'success' : 'error'); }); })]);
        head.appendChild(reassign);
      }
      var flagBox = h('div', { class: 'ta-card' }, [h('h3', { text: 'Highlighted by the rule list' })]);
      if (!a.flags.length) flagBox.appendChild(h('p', { class: 'ta-empty', text: 'No rule flagged this ticket automatically. Check it by hand.' }));
      a.flags.forEach(function (f) { flagBox.appendChild(h('div', { class: 'ta-flag-row' }, [pill(f.severity, 'sev-' + f.severity), h('div', null, [h('b', { text: f.title }), h('span', { text: f.why })])])); });
      var tl = h('div', { class: 'ta-card' }, [h('h3', { text: 'What the agent did on this ticket' })]);
      if (!a.timeline.length) tl.appendChild(h('p', { class: 'ta-empty', text: 'No replies, notes or updates from the agent are recorded yet.' }));
      a.timeline.forEach(function (x) { tl.appendChild(h('div', { class: 'ta-tl' }, [h('span', { class: 'ta-when', text: when(x.at) }), h('span', { text: x.text })])); });

      // checklist
      var checkBox = h('div', { class: 'ta-card' }, [h('h3', { text: 'What was missed' }), h('p', { class: 'ta-hint', text: 'Tick every mistake you found and add a short note. Flagged rules are highlighted but nothing is ticked for you.' })]);
      var cats = {};
      a.rules.filter(function (r) { return r.enabled; }).forEach(function (r) { (cats[r.category || 'General'] = cats[r.category || 'General'] || []).push(r); });
      function ruleRow(key, label, ruleId, desc, flagInfo) {
        var st = checks[key] || (checks[key] = { on: false, note: '', label: label, rule_id: ruleId });
        var note = h('textarea', { class: 'ta-note-in', rows: '2', placeholder: 'What exactly was missed? (shown to the agent)', maxlength: '600', value: st.note, 'aria-label': 'Note for ' + label });
        note.addEventListener('input', function () { st.note = note.value; });
        var cb = h('input', { type: 'checkbox', id: 'ta-ck-' + key, disabled: done && a.status !== 'closed' ? false : false });
        cb.checked = st.on;
        var wrap = h('div', { class: 'ta-ck' + (flagInfo ? ' flagged' : '') + (st.on ? ' on' : '') }, [
          h('label', { for: 'ta-ck-' + key }, [cb, h('span', { class: 'ta-ck-t' }, [h('b', { text: label }), desc ? h('em', { text: desc }) : null, flagInfo ? h('i', { text: 'Flagged: ' + flagInfo.why }) : null])]), note]);
        note.style.display = st.on ? '' : 'none';
        cb.addEventListener('change', function () { st.on = cb.checked; wrap.classList.toggle('on', cb.checked); note.style.display = cb.checked ? '' : 'none'; });
        return wrap;
      }
      Object.keys(cats).forEach(function (c) {
        checkBox.appendChild(h('div', { class: 'ta-cat', text: c }));
        cats[c].forEach(function (r) { checkBox.appendChild(ruleRow('r' + r.id, r.title, r.id, r.description, flagged[r.id])); });
      });
      Object.keys(checks).filter(function (k) { return k.charAt(0) === 'c'; }).forEach(function (k) { checkBox.appendChild(ruleRow(k, checks[k].label, null, '', null)); });
      var customIn = h('input', { class: 'ta-input', placeholder: 'Mistake that is not on the list', maxlength: '140', 'aria-label': 'Other mistake' });
      checkBox.appendChild(h('div', { class: 'ta-inline' }, [customIn, btn('Add to this audit', '', function () {
        var label = customIn.value.trim(); if (!label) return;
        var key = 'c' + label; checks[key] = { on: true, note: '', label: label, rule_id: null };
        checkBox.insertBefore(ruleRow(key, label, null, '', null), customIn.parentNode); customIn.value = '';
      })]));

      var vr = h('div', { class: 'ta-radios' }, [
        radio('correct', 'Transfer was correct'), radio('needs_fix', 'Needs correction: return to the agent')]);
      function radio(val, label) {
        var r = h('input', { type: 'radio', name: 'ta-verdict', id: 'ta-v-' + val, value: val });
        r.checked = verdict === val; r.addEventListener('change', function () { verdict = val; });
        return h('label', { for: 'ta-v-' + val, class: 'ta-radio' }, [r, h('span', { text: label })]);
      }
      var summary = h('textarea', { class: 'ta-note-in', rows: '3', maxlength: '800', placeholder: 'Feedback for the agent: what to fix before this ticket moves on (kept blameless and specific)', value: a.summary || '', 'aria-label': 'Feedback for the agent' });
      var submit = btn(done ? 'Update audit' : 'Submit audit', 'primary', function () {
        if (!verdict) return toast('Choose whether the transfer was correct or needs correction', 'error');
        var findings = Object.keys(checks).filter(function (k) { return checks[k].on; }).map(function (k) { return { rule_id: checks[k].rule_id, label: checks[k].label, note: checks[k].note }; });
        busy(submit, true, 'Saving...');
        api('/api/audits/ticket/' + id + '/submit', { verdict: verdict, summary: summary.value, findings: findings }).then(function (r) {
          busy(submit, false, done ? 'Update audit' : 'Submit audit');
          if (!r.success) return toast(r.error || 'Could not save', 'error');
          toast(r.status === 'returned' ? 'Returned to the agent with your feedback' : 'Audit approved'); viewAudit(body, id);
        });
      });
      var verdictBox = h('div', { class: 'ta-card' }, [h('h3', { text: 'Verdict' }), vr, summary,
        h('p', { class: 'ta-hint', text: 'Returning a ticket keeps it with the agent. They are notified with your feedback. Move or fix the ticket in Zoho Desk, then close the audit here.' }), h('div', { class: 'ta-actions' }, [submit])]);
      var actions = [];
      if (a.status === 'returned' || a.status === 'approved') actions.push(btn('Mark closed', '', function () { api('/api/audits/ticket/' + id + '/close', {}).then(function (r) { toast(r.success ? 'Closed' : (r.error || 'Failed'), r.success ? 'success' : 'error'); viewAudit(body, id); }); }));
      if (a.status === 'closed') actions.push(btn('Reopen audit', '', function () { api('/api/audits/ticket/' + id + '/reopen', {}).then(function () { viewAudit(body, id); }); }));
      var log = h('div', { class: 'ta-card' }, [h('h3', { text: 'History' })].concat((a.log || []).map(function (l) { return h('div', { class: 'ta-tl' }, [h('span', { class: 'ta-when', text: when(l.at) }), h('span', { text: nameOf(l.actor) + ' ' + String(l.action).replace(/_/g, ' ') + (l.note ? ': ' + l.note : '') })]); })));
      var back = btn('Back to the queue', 'ghost', function () { TA.auditId = null; render(); });
      body.replaceChildren(back, head, h('div', { class: 'ta-two' }, [h('div', null, [flagBox, tl]), h('div', null, [checkBox, verdictBox, actions.length ? h('div', { class: 'ta-actions pad' }, actions) : null])]), log);
    });
  }
  function fact(k, v) { return h('div', { class: 'ta-fact' }, [h('span', { text: k }), h('b', { text: v })]); }

  // ── rules ────────────────────────────────────────────────────────────
  var TEAMS = ['T2', 'T3/DEV', 'VOIP', 'CSM', 'POD'];
  function viewRules(body) {
    var host = h('div');
    body.appendChild(host);
    Promise.all([api('/api/audits/rules'), isAdmin() ? api('/api/audits/insights') : Promise.resolve(null)]).then(function (res) {
      var j = res[0], ins = res[1];
      if (!j.success) { host.appendChild(h('div', { class: 'ta-note', text: j.error || 'Could not load rules' })); return; }
      var head = h('div', { class: 'ta-sectionhead' }, [h('div', null, [h('h3', { text: 'Rule list' }), h('p', { class: 'ta-hint', text: 'Rules with a detector highlight matching tickets in the queue. Checklist rules are for the SPOC to tick during an audit.' })])]);
      if (isAdmin()) head.appendChild(btn('Add rule', 'primary', function () { ruleForm(null); }));
      host.append(head);
      var formHost = h('div'), listHost = h('div', { class: 'ta-list' });
      host.append(formHost);
      if (ins) {
        var unlisted = (ins.topMistakes || []).filter(function (m) { return m.rule_id == null; });
        if (unlisted.length) host.appendChild(h('div', { class: 'ta-card' }, [h('h3', { text: 'Written by SPOCs, not on the list yet' }), h('p', { class: 'ta-hint', text: 'Turn repeated mistakes into rules so they show up for every SPOC.' })].concat(unlisted.map(function (m) {
          return h('div', { class: 'ta-inline between' }, [h('span', null, [h('b', { text: m.label }), h('em', { class: 'ta-when', text: ' seen ' + m.count + ' time' + (m.count > 1 ? 's' : '') })]),
            btn('Add as rule', '', function () { api('/api/audits/rules', { title: m.label, category: 'General', severity: 'medium', detector: 'manual' }).then(function (r) { toast(r.success ? 'Rule added' : (r.error || 'Failed'), r.success ? 'success' : 'error'); TA.tab = 'rules'; render(); }); })]);
        }))));
      }
      host.appendChild(listHost);
      j.rules.forEach(function (r) { listHost.appendChild(ruleCard(r)); });
      function ruleCard(r) {
        var det = r.detector === 'manual' ? 'Checklist' : r.detectorLabel;
        var ps = r.params || {};
        var extra = r.detector === 'quick_transfer' ? ' (within ' + ps.minutes + ' min)' : r.detector === 'repeat_transfer' ? ' (' + ps.count + ' or more)' : (ps.pattern ? ' (' + ps.pattern + (ps.expected ? ' should go to ' + ps.expected : '') + ')' : '');
        var c = h('article', { class: 'ta-rule' + (r.enabled ? '' : ' off') }, [
          h('div', { class: 'ta-rule-main' }, [h('div', { class: 'ta-row-top' }, [h('b', { text: r.title }), pill(r.severity, 'sev-' + r.severity), pill(r.category || 'General', 'cat')]),
            r.description ? h('p', { class: 'ta-sub', text: r.description }) : null,
            h('div', { class: 'ta-meta' }, [h('span', { text: det + extra }), h('span', { class: 'ta-when', text: 'Flagged ' + r.flagged + ', confirmed by SPOCs ' + r.confirmed })])])]);
        if (isAdmin()) c.appendChild(h('div', { class: 'ta-row-side' }, [
          btn(r.enabled ? 'On' : 'Off', r.enabled ? 'on' : '', function () { api('/api/audits/rules/' + r.id, { enabled: !r.enabled }, 'PUT').then(function () { viewRulesRefresh(); }); }, { 'aria-pressed': String(!!r.enabled) }),
          btn('Edit', '', function () { ruleForm(r); }),
          btn('Delete', 'danger', function () { if (confirm('Delete this rule? Past audit notes keep its name.')) api('/api/audits/rules/' + r.id, null, 'DELETE').then(function () { viewRulesRefresh(); }); })]));
        return c;
      }
      function viewRulesRefresh() { TA.tab = 'rules'; render(); }
      function ruleForm(r) {
        r = r || { title: '', category: '', description: '', severity: 'medium', detector: 'manual', params: {}, enabled: true };
        var f = { title: h('input', { class: 'ta-input', value: r.title, maxlength: '140', placeholder: 'Rule title', 'aria-label': 'Rule title' }),
          category: h('input', { class: 'ta-input', value: r.category || '', maxlength: '60', placeholder: 'Category, for example Follow-up', 'aria-label': 'Category' }),
          description: h('textarea', { class: 'ta-note-in', rows: '2', maxlength: '600', value: r.description || '', placeholder: 'What good looks like, and what the mistake is', 'aria-label': 'Description' }),
          severity: h('select', { class: 'ta-input', 'aria-label': 'Severity' }, ['low', 'medium', 'high'].map(function (s) { return h('option', { value: s, text: s.charAt(0).toUpperCase() + s.slice(1) }); })),
          detector: h('select', { class: 'ta-input', 'aria-label': 'How it is detected' }, Object.keys(j.detectors).map(function (k) { return h('option', { value: k, text: j.detectors[k] }); })),
          a: h('input', { class: 'ta-input narrow', type: 'number', min: '1', max: '240', 'aria-label': 'Value' }),
          pattern: h('input', { class: 'ta-input', maxlength: '200', placeholder: 'Words to look for, separate with | (billing|invoice|refund)', 'aria-label': 'Words to look for' }),
          expected: h('select', { class: 'ta-input', 'aria-label': 'Correct team' }, TEAMS.map(function (t) { return h('option', { value: t, text: t }); })) };
        f.severity.value = r.severity; f.detector.value = r.detector;
        f.a.value = r.detector === 'quick_transfer' ? (r.params.minutes || 10) : (r.params.count || 3);
        f.pattern.value = r.params.pattern || ''; f.expected.value = r.params.expected || 'T2';
        var dyn = h('div', { class: 'ta-inline' });
        function drawDyn() {
          var d = f.detector.value; dyn.replaceChildren();
          if (d === 'quick_transfer') dyn.append(h('span', { text: 'Flag when moved within' }), f.a, h('span', { text: 'minutes of creation' }));
          if (d === 'repeat_transfer') dyn.append(h('span', { text: 'Flag at' }), f.a, h('span', { text: 'or more reassignments' }));
          if (d === 'category_team') dyn.append(f.pattern, h('span', { text: 'should go to' }), f.expected);
          if (d === 'subject_keyword') dyn.append(f.pattern);
        }
        f.detector.addEventListener('change', drawDyn); drawDyn();
        var save = btn(r.id ? 'Save rule' : 'Add rule', 'primary', function () {
          var d = f.detector.value, params = {};
          if (d === 'quick_transfer') params.minutes = Number(f.a.value);
          if (d === 'repeat_transfer') params.count = Number(f.a.value);
          if (d === 'category_team') { params.pattern = f.pattern.value; params.expected = f.expected.value; }
          if (d === 'subject_keyword') params.pattern = f.pattern.value;
          var payload = { title: f.title.value, category: f.category.value, description: f.description.value, severity: f.severity.value, detector: d, params: params };
          busy(save, true);
          (r.id ? api('/api/audits/rules/' + r.id, payload, 'PUT') : api('/api/audits/rules', payload)).then(function (x) { busy(save, false); if (!x.success) return toast(x.error || 'Could not save', 'error'); toast('Rule saved'); viewRulesRefresh(); });
        });
        formHost.replaceChildren(h('div', { class: 'ta-card' }, [h('h3', { text: r.id ? 'Edit rule' : 'New rule' }), f.title, h('div', { class: 'ta-inline' }, [f.category, f.severity]), f.description,
          h('div', { class: 'ta-inline' }, [h('span', { text: 'How it is found' }), f.detector]), dyn, h('div', { class: 'ta-actions' }, [save, btn('Cancel', 'ghost', function () { formHost.replaceChildren(); })])]));
        formHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // ── SPOC management ──────────────────────────────────────────────────
  function viewSpocs(body) {
    api('/api/audits/spocs').then(function (j) {
      if (!j.success) { body.appendChild(h('div', { class: 'ta-note', text: j.error || 'Could not load SPOCs' })); return; }
      var have = {}; j.spocs.forEach(function (s) { have[s.email] = true; });
      var sel = h('select', { class: 'ta-input', 'aria-label': 'Pick a person' }, [h('option', { value: '', text: 'Pick an agent or admin' })].concat(j.candidates.filter(function (c) { return !have[c.email]; }).map(function (c) { return h('option', { value: c.email, text: c.name + ' (' + c.kind + ')' }); })));
      var add = btn('Add SPOC', 'primary', function () {
        if (!sel.value) return; busy(add, true);
        api('/api/audits/spocs', { email: sel.value }).then(function (r) { busy(add, false); if (!r.success) return toast(r.error || 'Could not add', 'error'); toast('SPOC added'); TA.tab = 'spocs'; render(); });
      });
      var cards = j.spocs.length ? j.spocs.map(function (s) {
        return h('article', { class: 'ta-rule' + (s.active ? '' : ' off') }, [
          h('div', { class: 'ta-rule-main' }, [h('b', { text: s.name || s.email }), h('div', { class: 'ta-meta' }, [h('span', { text: s.email }), h('span', { text: s.open + ' open' }), h('span', { text: s.done + ' audited' }), h('span', { text: s.avgHours != null ? 'about ' + s.avgHours + ' h per audit' : 'no turnaround yet' })])]),
          h('div', { class: 'ta-row-side' }, [
            btn(s.active ? 'Active' : 'Paused', s.active ? 'on' : '', function () { api('/api/audits/spocs/' + encodeURIComponent(s.email), { active: !s.active }, 'PUT').then(function () { TA.tab = 'spocs'; render(); }); }, { 'aria-pressed': String(!!s.active) }),
            btn('Remove', 'danger', function () { if (confirm('Remove this SPOC? Their open audits go back to the pool.')) api('/api/audits/spocs/' + encodeURIComponent(s.email), null, 'DELETE').then(function () { TA.tab = 'spocs'; render(); }); })])]);
      }) : [h('div', { class: 'ta-empty-card' }, [h('b', { text: 'No SPOCs yet' }), h('p', { text: 'Add people below. Queued tickets are shared between active SPOCs automatically, and nobody audits their own tickets.' })])];
      var since = h('input', { class: 'ta-input narrow', type: 'number', min: '1', max: '120', value: String(Math.max(1, Math.round((Date.now() - Date.parse(j.settings.queueSince || Date.now())) / 864e5)) || 14), 'aria-label': 'Days back' });
      var auto = h('input', { type: 'checkbox', id: 'ta-auto' }); auto.checked = !!j.settings.autoQueue;
      var saveSet = btn('Save settings', '', function () {
        api('/api/audits/settings', { autoQueue: auto.checked, sinceDays: Number(since.value) }, 'PUT').then(function (r) { toast(r.success ? 'Saved' : (r.error || 'Failed'), r.success ? 'success' : 'error'); });
      });
      body.append(
        h('div', { class: 'ta-sectionhead' }, [h('div', null, [h('h3', { text: 'SPOC management' }), h('p', { class: 'ta-hint', text: 'SPOCs are existing agents or admins. They see the Ticket audits page with only the tickets assigned to them, plus the rule list.' })])]),
        h('div', { class: 'ta-card' }, [h('div', { class: 'ta-inline' }, [sel, add])]),
        h('div', { class: 'ta-list' }, cards),
        h('div', { class: 'ta-card' }, [h('h3', { text: 'Queue settings' }),
          h('label', { class: 'ta-inline', for: 'ta-auto' }, [auto, h('span', { text: 'Add tickets automatically when an agent moves them out of T1' })]),
          h('div', { class: 'ta-inline' }, [h('span', { text: 'Include transfers from the last' }), since, h('span', { text: 'days' })]),
          h('div', { class: 'ta-actions' }, [saveSet])]));
    });
  }

  // ── updates ──────────────────────────────────────────────────────────
  function viewUpdates(body) {
    Promise.all([api('/api/audits/updates'), api('/api/audits/rules')]).then(function (res) {
      var u = res[0], rj = res[1];
      if (!u.success) { body.appendChild(h('div', { class: 'ta-note', text: u.error || 'Could not load updates' })); return; }
      var rules = (rj.rules || []).filter(function (r) { return r.enabled; });
      var cur = TA.editUpdate || { id: null, kind: 'process', title: '', body: '', rule_ids: TA.draftRules.slice(), audience: 'agents' };
      TA.editUpdate = null; TA.draftRules = [];
      var kind = h('select', { class: 'ta-input', 'aria-label': 'Update type' }, [h('option', { value: 'process', text: 'Process update' }), h('option', { value: 'product', text: 'Product update' })]); kind.value = cur.kind;
      var aud = h('select', { class: 'ta-input', 'aria-label': 'Audience' }, [h('option', { value: 'agents', text: 'Agents' }), h('option', { value: 'all', text: 'Everyone' })]); aud.value = cur.audience || 'agents';
      var picked = {}; (cur.rule_ids || []).forEach(function (i) { picked[i] = true; });
      var ruleBox = h('div', { class: 'ta-picks' }, rules.map(function (r) {
        var cb = h('input', { type: 'checkbox', id: 'ta-up-' + r.id }); cb.checked = !!picked[r.id];
        cb.addEventListener('change', function () { picked[r.id] = cb.checked; });
        return h('label', { for: 'ta-up-' + r.id, class: 'ta-pick' }, [cb, h('span', { text: r.title })]);
      }));
      var gist = h('textarea', { class: 'ta-note-in', rows: '2', maxlength: '800', placeholder: 'Optional: the correct process or any detail the draft should include', 'aria-label': 'Extra context' });
      var title = h('input', { class: 'ta-input', maxlength: '140', value: cur.title, placeholder: 'Title', 'aria-label': 'Title' });
      var text = h('textarea', { class: 'ta-note-in', rows: '5', maxlength: '600', value: cur.body, placeholder: 'What happened, why it matters, and what to do instead', 'aria-label': 'Update text' });
      var count = h('span', { class: 'ta-when', text: text.value.length + '/600' });
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
      function payload() { return { kind: kind.value, title: title.value, body: text.value, audience: aud.value, rule_ids: ids() }; }
      function save(then) {
        return (cur.id ? api('/api/audits/updates/' + cur.id, payload(), 'PUT') : api('/api/audits/updates', payload())).then(function (r) {
          if (!r.success) { toast(r.error || 'Could not save', 'error'); return null; }
          return r.id || cur.id;
        });
      }
      var saveBtn = btn('Save draft', '', function () { busy(saveBtn, true); save().then(function (id) { busy(saveBtn, false); if (id) { toast('Draft saved'); TA.tab = 'updates'; render(); } }); });
      var pub = btn('Publish to the bell', 'primary', function () {
        if (!title.value.trim() || !text.value.trim()) return toast('Add a title and text first', 'error');
        if (!confirm('Publish this ' + kind.value + ' update to ' + (aud.value === 'all' ? 'everyone' : 'all agents') + '?')) return;
        busy(pub, true, 'Publishing...');
        save().then(function (id) {
          if (!id) { busy(pub, false, 'Publish to the bell'); return; }
          api('/api/audits/updates/' + id + '/publish', {}).then(function (r) { busy(pub, false, 'Publish to the bell'); if (!r.success) return toast(r.error || 'Could not publish', 'error'); toast('Published'); TA.tab = 'updates'; render(); });
        });
      });
      var list = u.updates.map(function (x) {
        var c = h('article', { class: 'ta-rule' }, [h('div', { class: 'ta-rule-main' }, [h('div', { class: 'ta-row-top' }, [h('b', { text: x.title }), pill(x.kind === 'product' ? 'Product' : 'Process', 'cat'), pill(x.status === 'published' ? 'Published' : 'Draft', x.status === 'published' ? 'st-approved' : 'st-pending')]),
          h('p', { class: 'ta-sub', text: x.body || '' }), h('div', { class: 'ta-meta' }, [h('span', { class: 'ta-when', text: x.status === 'published' ? 'Published ' + when(x.published_at) : 'Created ' + when(x.created_at) })])])]);
        if (x.status !== 'published') c.appendChild(h('div', { class: 'ta-row-side' }, [btn('Edit', '', function () { TA.editUpdate = x; TA.tab = 'updates'; render(); }), btn('Delete', 'danger', function () { api('/api/audits/updates/' + x.id, null, 'DELETE').then(function () { TA.tab = 'updates'; render(); }); })]));
        return c;
      });
      body.append(
        h('div', { class: 'ta-sectionhead' }, [h('div', null, [h('h3', { text: cur.id ? 'Edit update' : 'New update' }), h('p', { class: 'ta-hint', text: 'Pick the rules behind a recurring mistake, let AI draft a blameless update, edit it, then publish it to everyone\'s bell.' })])]),
        h('div', { class: 'ta-card' }, [h('div', { class: 'ta-inline' }, [kind, aud]), h('p', { class: 'ta-hint', text: 'Rules behind this update' }), ruleBox, gist, h('div', { class: 'ta-actions' }, [draft]),
          title, text, h('div', { class: 'ta-inline between' }, [count]), h('div', { class: 'ta-actions' }, [saveBtn, pub, cur.id ? btn('New update', 'ghost', function () { TA.tab = 'updates'; render(); }) : null])]),
        h('h3', { class: 'ta-h3', text: 'Drafts and published updates' }), h('div', { class: 'ta-list' }, list.length ? list : [h('p', { class: 'ta-empty', text: 'Nothing yet.' })]));
    });
  }

  // ── insights ─────────────────────────────────────────────────────────
  function bars(items, max, labelKey, valKey, sub) {
    return h('div', { class: 'ta-bars' }, items.map(function (it) {
      var pct = max ? Math.round((it[valKey] / max) * 100) : 0;
      return h('div', { class: 'ta-bar' }, [h('span', { class: 'ta-bar-l', text: it[labelKey] }), h('span', { class: 'ta-bar-t' }, [h('i', { style: 'width:' + Math.max(pct, 2) + '%' })]), h('b', { text: String(it[valKey]) + (sub ? sub(it) : '') })]);
    }));
  }
  function viewInsights(body) {
    api('/api/audits/insights').then(function (j) {
      if (!j.success) { body.appendChild(h('div', { class: 'ta-note', text: j.error || 'Could not load insights' })); return; }
      var tile = function (n, l) { return h('div', { class: 'ta-tile' }, [h('b', { text: String(n) }), h('span', { text: l })]); };
      var tiles = h('div', { class: 'ta-tiles' }, [tile(j.total, 'Tickets in the audit queue'), tile(j.audited, 'Audited'), tile(j.needsFixPct == null ? '-' : j.needsFixPct + '%', 'Needed correction'), tile(j.flagged, 'Flagged by rules')]);
      var mk = j.topMistakes.length ? h('div', { class: 'ta-card' }, [h('h3', { text: 'Most common mistakes' }), bars(j.topMistakes, j.topMistakes[0].count, 'label', 'count')].concat(j.topMistakes.slice(0, 5).filter(function (m) { return m.rule_id != null; }).map(function (m) {
        return h('div', { class: 'ta-inline between' }, [h('span', { text: m.label }), btn('Write an update', '', function () { TA.draftRules = [m.rule_id]; TA.tab = 'updates'; render(); })]);
      }))) : h('div', { class: 'ta-card' }, [h('h3', { text: 'Most common mistakes' }), h('p', { class: 'ta-empty', text: 'Appears after SPOCs submit their first audits.' })]);
      var wk = j.weeks.length ? h('div', { class: 'ta-card' }, [h('h3', { text: 'Audits per week' }), bars(j.weeks.map(function (w) { return { week: w.week, audited: w.audited, needs: w.needs }; }), Math.max.apply(null, j.weeks.map(function (w) { return w.audited; })), 'week', 'audited', function (it) { return ' (' + it.needs + ' needed correction)'; })]) : null;
      var ag = j.agents.length ? h('div', { class: 'ta-card' }, [h('h3', { text: 'By agent' }), h('p', { class: 'ta-hint', text: 'Use this for coaching conversations, not for ranking people.' }),
        bars(j.agents.map(function (a) { return { n: a.name, audited: a.audited, needs: a.needs, mistakes: a.mistakes }; }), Math.max.apply(null, j.agents.map(function (a) { return a.audited; })), 'n', 'audited', function (it) { return ' audited, ' + it.needs + ' needed correction'; })]) : null;
      var ds = j.destinations.length ? h('div', { class: 'ta-card' }, [h('h3', { text: 'By destination team' }), bars(j.destinations, Math.max.apply(null, j.destinations.map(function (d) { return d.audited; })), 'name', 'audited', function (it) { return ' audited, ' + it.needs + ' needed correction'; })]) : null;
      body.append(tiles, mk, wk, ag, ds);
    });
  }
})();
