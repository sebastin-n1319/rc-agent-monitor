/* Batch 266: Teach the AI (Call QA). QA reviewers answer the AI's questions; the AI follows up until the answer is enough,
   drafts the rule, and the reviewer confirms it. Admins also pick the QA reviewers, the survey rule, and switch rules off. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function api(url, body) {
    return fetch(url, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { success: false, error: 'Bad response' }; }); }).catch(function () { return { success: false, error: 'Could not reach the server' }; });
  }
  var TOPIC = { opening: 'Call Opening', verification: 'Verification', hold: 'Hold / dead air', transfer: 'Transfer', empathy: 'Empathy', acknowledgement: 'Acknowledgement', listening: 'Active Listening',
    interruptions: 'Interruptions', communication: 'Communication', closing: 'Call Closing', account: 'Account Analysis', ownership: 'Ownership', education: 'Client Education', objection: 'Objection Handling',
    probing: 'Probing', documentation: 'Documentation', survey: 'Survey', stage: 'Call stage', fatal: 'Fatals', documentation_task: 'Documentation fatal', callback: 'Callback fatal' };
  var ST = { open: 'To answer', followup: 'AI asked more', confirm: 'Confirm the rule', done: 'Done', skipped: 'Skipped', review: 'Sent to admin' };
  function finished(x) { return x.status === 'done' || x.status === 'skipped' || x.status === 'review'; }
  function topic(t) { return TOPIC[t] || String(t || 'General'); }

  function mount(root, opts) {
    opts = opts || {};
    var S = { data: null, admin: null, open: null, busy: {}, err: null, tab: opts.admin ? 'admin' : 'today', drafts: {} };
    root.className = 'cqt';
    // Batch 269: a refresh keeps what is on screen until new data arrives, and only redraws when something changed.
    // Redrawing every time made the page flicker and threw away a half-typed answer.
    var lastSig = null;
    function load() {
      if (!S.data) render();
      api('/api/call-qa/teach/today').then(function (r) {
        if (!r.success) { if (S.err !== r.error) { S.err = r.error; render(); } return; }
        var sig = JSON.stringify(r);
        if (sig === lastSig && !S.err) return;
        lastSig = sig;
        S.err = null; S.data = r; release();
        if (S.open == null) { var first = r.items.filter(function (x) { return !finished(x); })[0]; S.open = first ? first.id : null; }
        render();
      });
      if (opts.admin) api('/api/call-qa/teach/admin').then(function (r) { if (r.success) { S.admin = r; render(); } });
    }
    // Batch 268: QA reviewers stay on Teach AI until today's questions are done (or none could be written).
    function release() {
      if (!S.data) return;
      var open = S.data.items.filter(function (x) { return !finished(x); }).length;
      window.__cqtMustFinish = !!(S.data.noSkip && open > 0);
      if (typeof window.__cqtBanner === 'function') window.__cqtBanner();
    }
    function replace(item) { if (!S.data) return; S.data.items = S.data.items.map(function (x) { return x.id === item.id ? item : x; }); S.data.doneToday = S.data.items.filter(function (x) { return x.day === S.data.day && finished(x); }).length; release(); }
    function act(item, path, body, btn) {
      if (S.busy[item.id]) return; S.busy[item.id] = true; if (btn) { btn.disabled = true; btn.textContent = 'Thinking...'; }
      api('/api/call-qa/teach/q/' + item.id + '/' + path, body || {}).then(function (r) {
        S.busy[item.id] = false;
        if (!r.success) { item._err = r.error; render(); return; }
        replace(r.item);
        if (finished(r.item)) { var next = S.data.items.filter(function (x) { return !finished(x); })[0]; S.open = next ? next.id : null; }
        render();
      });
    }

    function render() {
      var kids = [h('div', { class: 'cqt-head' }, [h('div', null, [h('h2', { text: 'Teach the AI' }),
        h('p', { text: 'About 30 minutes a day. The AI asks what it is unsure about. Answer in your own words; it asks again until it has a clear rule, then you confirm it. Confirmed rules change how it audits straight away.' })])])];
      if (opts.admin) kids.push(h('div', { class: 'cqt-seg', role: 'tablist' }, [['admin', 'Progress and settings'], ['today', 'My questions']].map(function (t) {
        return h('button', { type: 'button', role: 'tab', 'aria-selected': S.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { S.tab = t[0]; render(); } });
      })));
      if (S.err) kids.push(h('div', { class: 'cqt-card cqt-bad', role: 'alert', text: S.err }));
      if (S.tab === 'admin') kids.push(adminView());
      else kids.push(todayView());
      root.replaceChildren.apply(root, kids);
    }

    // ── today ─────────────────────────────────────────────────────────
    function todayView() {
      var d = S.data;
      if (!d) return h('div', { class: 'cqt-card cqt-muted', text: 'Getting today’s questions ready. The first load of the day takes up to a minute.' });
      var pct = Math.min(100, Math.round(100 * d.doneToday / d.perDay));
      var p = d.progress || {}, a = p.agreement || {};
      var top = h('div', { class: 'cqt-stats' }, [
        stat('Today', d.doneToday + ' of ' + d.perDay, h('div', { class: 'cqt-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: 'width:' + pct + '%' }))),
        stat('Rules you taught', String(d.rulesTaught)), stat('Rules in use', String(p.rules || 0)),
        a.within10Pct != null ? stat('AI within 10 points of QA', a.within10Pct + '%', null, 'Calls where the AI score is within 10 points of the human QA score') : null,
        a.fatalAgreePct != null ? stat('Fatal agreement', a.fatalAgreePct + '%') : null
      ]);
      var out = [top];
      if (d.genError && !d.items.length) out.push(h('div', { class: 'cqt-card cqt-bad', text: 'Could not write today’s questions: ' + d.genError }));
      if (!d.items.length && !d.genError) out.push(h('div', { class: 'cqt-card cqt-muted', text: 'No questions right now. Check back tomorrow.' }));
      var left = d.items.filter(function (x) { return !finished(x); }).length;
      if (d.noSkip && left) out.push(h('div', { class: 'cqt-card cqt-must', role: 'status' }, [h('b', { text: left + ' question' + (left === 1 ? '' : 's') + ' left today. ' }), 'Answer each one until the AI says it has enough. The rest of the tool opens when you are done.']));
      if (d.doneToday >= d.perDay) out.push(h('div', { class: 'cqt-card cqt-good', text: 'All done for today. Thank you, every answer makes the audits closer to yours.' }));
      d.items.forEach(function (it, i) { out.push(itemView(it, i)); });
      return h('div', null, out);
    }
    function stat(label, value, extra, tip) { return h('div', { class: 'cqt-stat', title: tip || null }, [h('span', { text: label }), h('b', { text: value }), extra]); }
    function itemView(it, i) {
      var open = S.open === it.id;
      var head = h('button', { type: 'button', class: 'cqt-qhead', 'aria-expanded': open ? 'true' : 'false', onclick: function () { S.open = open ? null : it.id; render(); } }, [
        h('span', { class: 'cqt-n', text: String(i + 1) }),
        h('span', { class: 'cqt-qt' }, [h('span', { class: 'cqt-tags' }, [h('em', { class: 'cqt-tag', text: it.kind === 'call' ? 'Real call' : 'Scenario' }), h('em', { class: 'cqt-tag', text: topic(it.topic) })]), h('span', { text: it.question })]),
        h('span', { class: 'cqt-st st-' + it.status, text: ST[it.status] || it.status })]);
      var kids = [head];
      if (open) kids.push(body(it));
      return h('section', { class: 'cqt-card cqt-q' + (open ? ' open' : '') }, kids);
    }
    function body(it) {
      var b = [];
      if (it.context) b.push(h('div', { class: 'cqt-ctx' }, [h('b', { text: it.kind === 'call' ? 'The call' : 'Scenario' }), h('p', { text: it.context })]));
      if (it.call) b.push(callBox(it.call));
      if (it.needs && it.needs.length && (it.status === 'open' || it.status === 'followup')) b.push(h('p', { class: 'cqt-needs' }, [h('b', { text: 'A full answer covers: ' }), it.needs.join(' · ')]));
      if (it.thread.length) b.push(h('div', { class: 'cqt-thread' }, it.thread.map(function (t) { return h('div', { class: 'cqt-msg ' + (t.role === 'qa' ? 'me' : 'ai') }, [h('span', { text: t.role === 'qa' ? 'You' : t.role === 'admin' ? 'Admin' : 'AI' }), h('p', { text: t.text })]); })));
      if (it._err) b.push(h('p', { class: 'cqt-bad', role: 'alert', text: it._err }));
      if (it.status === 'open' || it.status === 'followup') {
        var ta = h('textarea', { class: 'cqt-in', rows: '4', 'aria-label': 'Your answer', placeholder: it.status === 'followup' ? 'Answer the AI’s follow-up' : 'Your answer: what you decide, when it applies, any exceptions' });
        var dk = it.id + ':' + it.thread.length; if (S.drafts[dk]) ta.value = S.drafts[dk];
        ta.addEventListener('input', function () { S.drafts[dk] = ta.value; });
        var send = h('button', { type: 'button', class: 'cqt-btn primary', text: S.busy[it.id] ? 'Thinking...' : 'Send', disabled: S.busy[it.id] ? true : null });
        send.addEventListener('click', function () { var v = ta.value.trim(); if (!v) { ta.focus(); return; } act(it, 'answer', { text: v }, send); });
        ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send.click(); } });
        b.push(ta, h('div', { class: 'cqt-row' }, [send, S.data && S.data.noSkip ? null : h('button', { type: 'button', class: 'cqt-btn', text: 'Skip', onclick: function (e) { act(it, 'skip', {}, e.currentTarget); } }), h('span', { class: 'cqt-muted cqt-small', text: S.data && S.data.noSkip ? 'Not sure? Say what you would check and why. Ctrl or Cmd + Enter sends' : 'Ctrl or Cmd + Enter sends' })]));
        setTimeout(function () { if (document.body.contains(ta) && document.activeElement !== ta) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } } }, 0);
      }
      if (it.status === 'confirm') {
        var drafts = it.rules.filter(function (r) { return r.status === 'draft'; });
        var boxes = drafts.map(function (r) {
          var t = h('textarea', { class: 'cqt-in', rows: '2', 'aria-label': 'Rule' }); t.value = r.text;
          var keep = h('input', { type: 'checkbox', checked: true }); keep.checked = true;
          return { r: r, t: t, keep: keep, el: h('div', { class: 'cqt-rule' }, [h('label', { class: 'cqt-small' }, [keep, ' Keep · ' + topic(r.param)]), t]) };
        });
        var ok = h('button', { type: 'button', class: 'cqt-btn primary', text: 'Confirm rule' + (drafts.length > 1 ? 's' : '') });
        ok.addEventListener('click', function () { act(it, 'confirm', { rules: boxes.map(function (x) { return { id: x.r.id, text: x.t.value, drop: !x.keep.checked }; }) }, ok); });
        b.push(h('div', { class: 'cqt-rules' }, [h('b', { text: 'The rule the AI will follow' })].concat(boxes.map(function (x) { return x.el; }))),
          h('div', { class: 'cqt-row' }, [ok, h('button', { type: 'button', class: 'cqt-btn', text: 'Not right, explain more', onclick: function (e) { act(it, 'more', {}, e.currentTarget); } })]));
      }
      if (it.status === 'done') {
        var rs = it.rules.filter(function (r) { return r.status !== 'draft'; });
        b.push(h('div', { class: 'cqt-rules' }, [h('b', { text: 'Rules from this answer' })].concat(rs.map(function (r) {
          return h('p', { class: 'cqt-done-rule' }, [h('em', { class: 'cqt-st st-' + (r.status === 'active' ? 'done' : r.status === 'conflict' ? 'confirm' : 'skipped'), text: r.status === 'active' ? 'In use' : r.status === 'conflict' ? 'Waiting for an admin (differs from another rule)' : 'Off' }), ' ' + r.text]);
        }))));
      }
      return h('div', { class: 'cqt-body' }, b);
    }
    function callBox(c) {
      var ref = [c.human.audit ? 'CRM Call Audit ' + c.human.audit : null, c.agent, c.when, c.human.auditor ? 'audited by ' + c.human.auditor : null].filter(Boolean).join(' \u00b7 ');
      var rows = [ref ? h('p', { class: 'cqt-ref' }, [h('b', { text: ref }), c.human.audit ? h('button', { type: 'button', class: 'cqt-btn sm', text: 'Copy audit ID', onclick: function (e) { var b = e.currentTarget; try { navigator.clipboard.writeText(c.human.audit).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy audit ID'; }, 1400); }); } catch (x) {} } }) : null]) : null,h('p', null, [h('b', { text: 'AI ' + (c.ai.score == null ? '-' : c.ai.score) }), ' (' + (c.ai.stage || '-') + ')  vs  ', h('b', { text: 'Human QA ' + (c.human.score == null ? '-' : c.human.score) }), ' (' + (c.human.stage || '-') + ')', c.agent ? ' · ' + c.agent : ''])];
      if (c.ai.fatal.length) rows.push(h('p', null, [h('b', { text: 'AI fatal: ' }), c.ai.fatal.map(function (f) { return f.param + ' (' + f.why + ')'; }).join('; ')]));
      if (c.ai.missed.length) rows.push(h('p', null, [h('b', { text: 'AI marked missed: ' }), c.ai.missed.map(function (m) { return m.param + (m.why ? ' (' + m.why + ')' : ''); }).join('; ')]));
      if (c.human.note) rows.push(h('p', null, [h('b', { text: 'Human QA note: ' }), c.human.note]));
      if (c.transcript) rows.push(h('details', null, [h('summary', { text: 'Transcript' }), h('pre', { class: 'cqt-tr', text: c.transcript })]));
      return h('div', { class: 'cqt-call' }, rows);
    }

    // ── admin ─────────────────────────────────────────────────────────
    function adminView() {
      var A = S.admin;
      if (!A) return h('div', { class: 'cqt-card cqt-muted', text: 'Loading...' });
      var p = A.progress || {}, a = p.agreement || {};
      var out = [h('div', { class: 'cqt-stats' }, [stat('Rules in use', String(p.rules || 0)), stat('Waiting for you', String(A.rules.filter(function (r) { return r.status === 'conflict'; }).length)),
        a.within10Pct != null ? stat('AI within 10 points', a.within10Pct + '%') : null, a.fatalAgreePct != null ? stat('Fatal agreement', a.fatalAgreePct + '%') : null,
        a.overall != null ? stat('Parameter agreement', a.overall + '%') : null, p.learning && p.learning.until ? stat('Learning period ends', String(p.learning.until).slice(0, 10)) : null])];
      // QA reviewers
      var ta = h('textarea', { class: 'cqt-in', rows: '2', 'aria-label': 'QA reviewer emails', placeholder: 'name@adit.com, one or more, separated by commas' }); ta.value = A.trainers.join(', ');
      out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'QA reviewers' }), h('p', { class: 'cqt-muted cqt-small', text: 'Everyone with the QA role is a reviewer automatically. Add anyone else here (for example an agent who also does QA). They see Teach AI in their sidebar and get 8 questions a day. Only @adit.com addresses.' }), ta,
        h('div', { class: 'cqt-row' }, [h('button', { type: 'button', class: 'cqt-btn primary', text: 'Save reviewers', onclick: function (e) { var b = e.currentTarget; b.disabled = true; api('/api/call-qa/teach/trainers', { emails: ta.value }).then(function (r) { if (r.success) { S.admin = r; } render(); }); } })])]));
      // Survey rule
      var modes = [['fatal', 'Fatal (the written rule)', 'A missing pitch on a call that needed it makes the score 0.'], ['closing', 'Call Closing miss', 'No fatal; Call Closing is marked missed.'], ['ai', 'Let QA rules decide', 'No rule in code; the AI follows what the QA team teaches it.']];
      out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'Missing survey pitch' }), h('p', { class: 'cqt-muted cqt-small', text: 'Changing this audits the human-paired calls again, so you can see the effect on agreement.' }),
        h('div', { class: 'cqt-modes', role: 'radiogroup', 'aria-label': 'Survey rule' }, modes.map(function (m) {
          return h('button', { type: 'button', role: 'radio', 'aria-checked': A.surveyMode === m[0] ? 'true' : 'false', class: 'cqt-mode' + (A.surveyMode === m[0] ? ' on' : ''), onclick: function () { if (A.surveyMode === m[0]) return; api('/api/call-qa/teach/survey-mode', { mode: m[0] }).then(function (r) { if (r.success) S.admin = r; render(); }); } }, [h('b', { text: m[1] }), h('span', { text: m[2] })]);
        }))]));
      // Rules
      var conflicts = A.rules.filter(function (r) { return r.status === 'conflict'; });
      var ruleRow = function (r) {
        return h('div', { class: 'cqt-arule' }, [h('div', null, [h('span', { class: 'cqt-tags' }, [h('em', { class: 'cqt-tag', text: topic(r.param) }), h('em', { class: 'cqt-st st-' + (r.status === 'active' ? 'done' : r.status === 'conflict' ? 'confirm' : 'skipped'), text: r.status === 'active' ? 'In use' : r.status === 'conflict' ? 'Differs from rule ' + (r.conflict && r.conflict.with) : 'Off' })]),
          h('p', { text: r.text }), h('p', { class: 'cqt-muted cqt-small', text: 'From ' + String(r.by_email || '').split('@')[0] + ' · ' + String(r.at || '').slice(0, 10) + (r.conflict && r.conflict.why ? ' · ' + r.conflict.why : '') })]),
          h('div', { class: 'cqt-row' }, [r.status !== 'active' ? h('button', { type: 'button', class: 'cqt-btn sm primary', text: 'Use it', onclick: function () { api('/api/call-qa/teach/rules/' + r.id, { status: 'active' }).then(function (x) { if (x.success) S.admin = x; render(); }); } }) : null,
            r.status !== 'off' ? h('button', { type: 'button', class: 'cqt-btn sm', text: 'Switch off', onclick: function () { api('/api/call-qa/teach/rules/' + r.id, { status: 'off' }).then(function (x) { if (x.success) S.admin = x; render(); }); } }) : null])]);
      };
      if (A.review && A.review.length) out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'Questions waiting for you (' + A.review.length + ')' }), h('p', { class: 'cqt-muted cqt-small', text: 'The reviewer answered 6 times and the AI still had no clear rule. Read the thread and write the rule.' })].concat(A.review.map(function (q) {
        var t = h('textarea', { class: 'cqt-in', rows: '2', 'aria-label': 'Rule for this question', placeholder: 'The rule the AI should follow' });
        return h('div', { class: 'cqt-arule' }, [h('div', { style: 'flex:1' }, [h('span', { class: 'cqt-tags' }, [h('em', { class: 'cqt-tag', text: topic(q.topic) }), h('em', { class: 'cqt-tag', text: String(q.thread.filter(function (x) { return x.role === 'qa'; }).length) + ' answers' })]),
          h('p', { text: q.question }), h('details', null, [h('summary', { text: 'Thread' }), h('div', { class: 'cqt-thread' }, q.thread.map(function (m) { return h('div', { class: 'cqt-msg ' + (m.role === 'qa' ? 'me' : 'ai') }, [h('span', { text: m.role === 'qa' ? 'QA' : 'AI' }), h('p', { text: m.text })]); }))]), t]),
          h('div', { class: 'cqt-row' }, [h('button', { type: 'button', class: 'cqt-btn sm primary', text: 'Save rule', onclick: function (e) { var b = e.currentTarget; b.disabled = true; api('/api/call-qa/teach/admin/q/' + q.id + '/settle', { text: t.value, param: q.topic }).then(function (x) { if (x.success) S.admin = x; else b.disabled = false; render(); }); } })])]);
      }))));
      if (conflicts.length) out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'Rules waiting for you (' + conflicts.length + ')' }), h('p', { class: 'cqt-muted cqt-small', text: 'Two QA reviewers answered differently. Pick the one to use and switch the other off.' })].concat(conflicts.map(ruleRow))));
      out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'Rules (' + A.rules.length + ')' })].concat(A.rules.length ? A.rules.filter(function (r) { return r.status !== 'conflict'; }).map(ruleRow) : [h('p', { class: 'cqt-muted', text: 'No rules yet.' })])));
      // Activity
      out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'QA reviewer activity' }), A.byQa.length ? h('table', { class: 'cqt-table' }, [h('thead', null, h('tr', null, ['Reviewer', 'Today', 'Answered', 'Skipped', 'Asked'].map(function (x, i) { return h('th', { scope: 'col', class: i ? 'n' : null, text: x }); }))),
        h('tbody', null, A.byQa.map(function (q) { return h('tr', null, [h('th', { scope: 'row', text: String(q.owner).split('@')[0] }), h('td', { class: 'n', text: (q.today_done || 0) + ' of ' + (q.today || 0) }), h('td', { class: 'n', text: String(q.done || 0) }), h('td', { class: 'n', text: String(q.skipped || 0) }), h('td', { class: 'n', text: String(q.asked || 0) })]); }))]) : h('p', { class: 'cqt-muted', text: 'No answers yet.' })]));
      if (A.needs && A.needs.length) out.push(h('section', { class: 'cqt-card' }, [h('h3', { text: 'What the AI is asking about most' }), h('ul', { class: 'cqt-list' }, A.needs.map(function (n) { return h('li', { text: n.label + ': agrees with QA on ' + n.agreePct + '% of calls' }); }))]));
      return h('div', null, out);
    }
    load();
    return { refresh: load };
  }
  // Shows the sidebar entry to QA reviewers only (the QA role and people named as reviewers).
  // Batch 270: admins no longer get it in Agent View; theirs is Admin View > Call QA > Teach.
  function gate() {
    api('/api/call-qa/teach/me').then(function (m) {
      if (!m || !m.success) return;
      ['sb-agent-qateach', 'agent-tab-qateach'].forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.toggle('ap-hidden', !m.trainer); });
      if (!m.trainer && typeof currentAgentSection !== 'undefined' && currentAgentSection === 'qateach' && typeof switchAgentSection === 'function') { try { switchAgentSection('dashboard', document.getElementById('agent-tab-dashboard')); } catch (e) {} }
      // Batch 268: QA reviewers finish the day's questions first. The page releases this once they are done (or if none could be written).
      if (m.mustFinish && m.pending && (m.pending.open > 0 || m.pending.madeToday < 8)) {
        window.__cqtMustFinish = true;
        if (typeof sbAgent === 'function') { try { sbAgent('qateach', document.getElementById('sb-agent-qateach')); } catch (e) {} }
      }
    });
  }
  window.CQTeach = { mount: mount, gate: gate };
})();
