/* Ticket audits: queue, audit form, rule list, SPOC management, updates and insights. */
(function () {
  'use strict';
  var TA = window.TA = { me: null, root: null, mode: 'admin', tab: 'review', filter: 'open', spocFilter: '', destF: '', agentF: '', signalF: '', sumOpen: true, q: '', auditId: null, draftRules: [], editUpdate: null };
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
  var VERDICT_LABEL = { good: 'Good to go', invalid: 'Invalid', ignored: 'Ignored' }, VERDICT_CLS = { good: 'st-approved', invalid: 'st-returned', ignored: 'st-closed' };
  function verdictPill(r) {
    if (r.verdict === 'invalid') return (r.severity || 'fatal') === 'fatal' ? pill('Invalid: fatal', 'sev-high', 'Counts as a strike') : pill('Invalid: feedback', 'sev-medium', 'No strike');
    return pill(VERDICT_LABEL[r.verdict] || r.verdict, VERDICT_CLS[r.verdict] || 'cat');
  }
  function tabs() {
    var t = [['review', 'Pending review'], ['history', 'History']];
    if (isAdmin()) t = t.concat([['strikes', 'Strikes'], ['escalations', 'Escalation watch'], ['spocs', 'SPOC management']]);
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
      if (!tabs().some(function (t) { return t[0] === TA.tab; })) TA.tab = 'review';
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
      h('div', { class: 'tka-head' }, [h('div', null, [h('h2', { text: 'Transfer review' }), h('p', { text: 'Every transfer out of T1 is reviewed before it reaches another team.' })])]),
      bar, body);
    if (TA.auditId) return viewAudit(body, TA.auditId);
    ({ review: viewReview, history: viewHistory, strikes: viewStrikes, escalations: viewEscalations, queue: viewQueue, rules: viewRules, spocs: viewSpocs, updates: viewUpdates, insights: viewInsights })[TA.tab](body);
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

  // ── Pending review (Session 88) ──────────────────────────────────────
  function mmLabel(m) { return m == null ? '' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
  function viewReview(body) {
    var host = h('div', { class: 'tka-rv' });
    body.appendChild(host);
    function load(refresh) {
      (refresh ? api('/api/review/refresh', {}) : api('/api/review/list')).then(function (j) {
        if (!j.success) { host.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not load reviews' })); return; }
        draw(j);
      });
    }
    function draw(j) {
      var st = j.settings || {}, buf = st.bufferMin || 15;
      var over = j.waiting.filter(function (r) { return r.minutes >= buf; }).length;
      var tiles = h('div', { class: 'tka-tiles' }, [
        tileBox('Waiting for review', j.waiting.length, over ? over + ' over ' + buf + ' min' : 'all within ' + buf + ' min', over ? 'hot' : ''),
        tileBox('Moved, verdict missing', j.moved.length, 'left the status without a verdict', j.moved.length ? 'warn' : ''),
        tileBox('Reviewed today', (j.today.good || 0) + (j.today.invalid || 0), (j.today.good || 0) + ' good, ' + (j.today.invalid || 0) + ' invalid'),
        tileBox('Average review time', j.today.avgMin == null ? 'none' : j.today.avgMin + ' min', 'today')]);
      var bar = h('div', { class: 'tka-inline between' }, [
        h('p', { class: 'tka-hint', text: 'Tickets in "' + (st.statusName || 'Pending Review - T1') + '". Review each within ' + buf + ' minutes (counted between ' + (st.startHour == null ? 7 : st.startHour) + ':00 and ' + (st.endHour == null ? 19 : st.endHour) + ':00 Central): move it to the right person in Zoho Desk, then record your verdict here.' + (j.lastPollAt ? ' Checked ' + ago(j.lastPollAt) + '.' : '') }),
        h('div', { class: 'tka-inline' }, [btn('Check Zoho now', '', function (ev) { busy(ev.currentTarget, true, 'Checking...'); load(true); }),
          isAdmin() ? btn('Settings', 'ghost sm', function () { reviewSettings(host); }) : null])]);
      var kids = [tiles, bar];
      if (j.lastPollError) kids.push(h('div', { class: 'tka-note', text: 'Could not read Zoho: ' + j.lastPollError }));
      kids.push(h('h3', { class: 'tka-sec', text: 'Waiting for review (' + j.waiting.length + ')' }));
      if (!j.waiting.length) kids.push(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'Nothing waiting' }), h('p', { text: 'When a T1 agent sets a ticket to ' + (st.statusName || 'Pending Review - T1') + ', it shows here within a minute.' })]));
      j.waiting.forEach(function (r) { kids.push(reviewCard(r, buf, j.me)); });
      if (j.moved.length) {
        kids.push(h('h3', { class: 'tka-sec', text: 'Moved, verdict missing (' + j.moved.length + ')' }));
        kids.push(h('p', { class: 'tka-hint', text: 'These left the review status, or were moved by a T1 agent without it ("Skipped review"). Record a verdict so the agent gets feedback.' }));
        j.moved.forEach(function (r) { kids.push(reviewCard(r, buf, j.me)); });
      }
      if (j.done.length) {
        var d = h('details', { class: 'tka-fold' }, [h('summary', { text: 'Reviewed in the last 24 hours (' + j.done.length + ')' })]);
        j.done.forEach(function (r) {
          d.appendChild(h('div', { class: 'tka-tl' }, [h('span', { class: 'tka-when', text: when(String(r.reviewed_at).replace(' ', 'T') + 'Z') }),
            h('span', null, [r.web_url ? h('a', { href: r.web_url, target: '_blank', rel: 'noopener', class: 'tka-num', text: '#' + r.ticket_number }) : '#' + r.ticket_number, ' ' + nameOf(r.agent_email, r.agent_name) + ': ', verdictPill(r), r.to_agent ? ' to ' + r.to_agent + (r.to_team ? ' (' + r.to_team + ')' : '') : '', r.comment ? ' ' + r.comment : ''])]));
        });
        kids.push(d);
      }
      host.replaceChildren.apply(host, kids);
    }
    function tileBox(l, v, s, cls) { return h('div', { class: 'tka-tile ' + (cls || '') }, [h('span', { class: 'tka-tile-l', text: l }), h('b', { class: 'tka-tile-v', text: String(v) }), h('span', { class: 'tka-tile-s', text: s })]); }

    function copyText(txt, done) {
      function fallback() { var t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); done(ok); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, fallback); else fallback();
    }
    function composeHandoff(f, who) {
      var L = function (k, v) { return k + ' - ' + (v || ''); };
      return [(who ? '@' + who + ' ' : '') + 'Can you take the ' + (f.call ? 'call' : 'ticket') + '?', '',
        L('Client Name', f.clientName), L('Practice Name', f.practiceName), L('Account Number', f.accountNumber), L('Deal Stage (OB or CSM or Churn)', f.dealStage),
        L('Callback Number', f.callback), L('Email', f.email), L('Ticket', f.ticketUrl || (f.ticketNumber ? '#' + f.ticketNumber : '')),
        L('Reason for contact (issue, existing ticket, or some request)', f.reason), L('Resolution Provided', f.resolution)].join('\n');
    }
    function similarBox(list) {
      if (!list || !list.length) return null;
      return h('div', { class: 'tka-sim' }, [h('b', { text: 'Reviewers said this on similar tickets' })].concat(list.map(function (x) {
        return h('div', { class: 'tka-when', text: '#' + x.ticket + ' (' + (x.severity === 'feedback' ? 'feedback' : 'fatal') + '): ' + x.comment });
      })));
    }
    function assistFor(r, kind, box, who, comment, sev, setSev) {
      var body = { mode: kind === 'invalid' ? 'invalid' : 'good', toAgent: who.value };
      api('/api/review/' + r.id + '/assist', body).then(function (a) {
        if (!a.success) { box.replaceChildren(h('span', { class: 'tka-when', text: a.error || 'AI help is not available right now' })); return; }
        if (kind === 'invalid') {
          var kids = [];
          if (a.comment) {
            kids.push(h('b', { text: 'AI suggested feedback' }), h('p', { class: 'tka-sugg', text: a.comment }),
              h('div', { class: 'tka-actions' }, [btn('Use this', 'sm', function () { comment.value = a.comment; if (a.severity) setSev(a.severity); }),
                a.severity ? h('span', { class: 'tka-when', text: 'Suggested: ' + (a.severity === 'fatal' ? 'Fatal (strike)' : 'Feedback (no strike)') + '. You decide.' }) : null]));
          } else kids.push(h('span', { class: 'tka-when', text: a.ai ? 'AI could not suggest feedback for this one.' : 'AI is not set up, so no suggestion.' }));
          var sm = similarBox(a.similar); if (sm) kids.push(sm);
          box.replaceChildren.apply(box, kids.filter(Boolean)); return;
        }
        var f = a.fields || {}, dirty = false;
        var ta = h('textarea', { class: 'tka-note-in', rows: '11', 'aria-label': 'Message for the department space' });
        ta.value = composeHandoff(f, who.value);
        ta.addEventListener('input', function () { dirty = true; });
        who.addEventListener('input', function () { if (!dirty) ta.value = composeHandoff(f, who.value); });
        var dept = h('select', { class: 'tka-input', 'aria-label': 'Department space' }, [h('option', { value: '', text: 'Which department space?' })].concat((a.departments || []).map(function (t) { var o = h('option', { value: t, text: t }); if (t === a.department) o.selected = true; return o; })));
        var open = h('a', { class: 'tka-btn ghost sm', target: '_blank', rel: 'noopener', text: 'Open space' });
        var note = h('span', { class: 'tka-when' });
        function setSpace() { var u = (a.spaces || {})[dept.value]; if (u) { open.href = u; open.hidden = false; note.textContent = ''; } else { open.removeAttribute('href'); open.hidden = true; note.textContent = dept.value ? 'No space link saved for ' + dept.value + (isAdmin() ? '. Add it in Settings.' : '. Ask an admin to add it in Settings.') : ''; } }
        dept.addEventListener('change', setSpace); setSpace();
        var cp = btn('Copy message', 'primary sm', function () { copyText(ta.value, function (ok) { toast(ok ? 'Copied. Paste it in ' + (dept.value || 'the department') + ' space' : 'Could not copy, select the text and copy it', ok ? 'success' : 'error'); }); });
        var kids = [h('b', { text: 'Message for the department space' }), h('p', { class: 'tka-when', text: (a.ai ? 'AI drafted this from the ticket. ' : 'AI is not set up, so only the ticket link is filled. ') + 'Check it, copy it and post it yourself.' }), dept, ta, h('div', { class: 'tka-actions' }, [cp, open, note])];
        var sm2 = similarBox(a.similar); if (sm2) kids.push(sm2);
        box.replaceChildren.apply(box, kids);
      }).catch(function () { box.replaceChildren(h('span', { class: 'tka-when', text: 'AI help is not available right now' })); });
    }
    // Deal context: quick CRM line on the tile, full history when the tile is opened.
    function dealLine(d) {
      if (!d) return null;
      var items = [['Account', d.account], ['Deal', d.deal], ['Stage', d.stage], ['CSM', d.csm], ['Escalation', d.escalation]].filter(function (x) { return x[1]; });
      if (!items.length) return null;
      return h('dl', { class: 'tka-deal' }, items.map(function (x) {
        var hot = x[0] === 'Escalation' && /^escalated/i.test(x[1]);
        return h('div', { class: hot ? 'hot' : '' }, [h('dt', { text: x[0] }), h('dd', { text: x[1] })]);
      }));
    }
    function dpSec(title, kids) { return h('section', { class: 'tka-dp-sec' }, [h('h4', { text: title })].concat(kids.filter(Boolean))); }
    function dpNote(t) { return h('p', { class: 'tka-when', text: t }); }
    function stateCls(s) { return s === 'open' ? 'sev-high' : s === 'on hold' ? 'sev-medium' : 'st-approved'; }
    function renderDeal(box, d) {
      if (!d.available) { box.replaceChildren(dpNote(d.note || 'No deal context for this ticket.')); return; }
      var an = d.analysis || {}, kids = [];
      var live = (d.journey || []).filter(function (t) { return t.state !== 'closed'; });
      kids.push(dpSec('Issue history', an.available ? [an.headline ? h('p', { class: 'tka-dp-lead', text: an.headline }) : null].concat((an.issues || []).length ? an.issues.map(function (i) {
        return h('div', { class: 'tka-dp-item' }, [h('div', { class: 'tka-inline' }, [pill(i.status || 'unknown', /fixed|solved|resolved/i.test(i.status) ? 'st-approved' : /open|unsolved/i.test(i.status) ? 'sev-high' : 'sev-medium'), i.product ? pill(i.product.replace(/_/g, ' '), 'dest') : null, h('span', { class: 'tka-when', text: [i.since ? 'since ' + i.since : '', i.times ? 'raised ' + i.times + 'x' : ''].filter(Boolean).join(', ') })]), h('p', { text: i.problem })]);
      }) : [dpNote('No issues recorded in the account analysis.')]) : [dpNote(an.note || 'No account analysis yet.')]));
      kids.push(dpSec('Unsolved queries', (an.available && (an.open || []).length ? an.open.map(function (o) { return h('div', { class: 'tka-dp-item' }, [h('p', { text: o.item }), o.note ? h('span', { class: 'tka-when', text: o.note }) : null]); }) : []).concat(live.length ? [h('p', { class: 'tka-when', text: 'Open or on hold in Zoho Desk now:' })].concat(live.slice(0, 8).map(function (t) { return h('div', { class: 'tka-dp-row' }, [h('b', { text: '#' + t.number }), h('span', { text: t.subject }), pill(t.status, stateCls(t.state))]); })) : (an.available && (an.open || []).length ? [] : [dpNote('Nothing unsolved on record.')]))));
      kids.push(dpSec('Previous satisfaction', [an.mood ? h('div', { class: 'tka-dp-item' }, [h('div', { class: 'tka-inline' }, [pill(an.mood.level || 'unknown', /happy|positive|good/i.test(an.mood.level) ? 'st-approved' : /unhappy|negative|angry|frustrated|upset/i.test(an.mood.level) ? 'sev-high' : 'sev-medium'), an.mood.asOf ? h('span', { class: 'tka-when', text: 'as of ' + an.mood.asOf }) : null]), h('p', { text: an.mood.why })]) : dpNote('No mood read on record.'),
        h('div', { class: 'tka-inline' }, [pill('CSAT ' + (d.csat.pct == null ? 'no surveys' : d.csat.pct + '%'), d.csat.pct == null ? '' : d.csat.pct >= 80 ? 'st-approved' : 'sev-medium'), d.csat.total ? h('span', { class: 'tka-when', text: d.csat.good + ' good, ' + d.csat.bad + ' bad survey' + (d.csat.total === 1 ? '' : 's') }) : null])]));
      kids.push(dpSec('Usually reported modules', (an.modules || []).length ? [h('div', { class: 'tka-inline' }, an.modules.map(function (m) { return pill(m.name + (m.n > 1 ? ' x' + m.n : ''), 'dest'); }))] : [dpNote('No module pattern on record.')]));
      kids.push(dpSec('Support journey (' + d.counts.open + ' open, ' + d.counts['on hold'] + ' on hold, ' + d.counts.closed + ' closed)', (d.journey || []).length ? d.journey.map(function (t) {
        return h('div', { class: 'tka-dp-row' }, [h('b', { text: '#' + t.number }), h('span', { text: t.subject }), pill(t.status, stateCls(t.state)), h('span', { class: 'tka-when', text: [t.channel, t.created ? when(t.created) : '', t.agent].filter(Boolean).join(' / ') })]);
      }).concat(d.ticketsShown >= 25 ? [dpNote('Showing the latest 25.')] : []) : [dpNote('No other tickets on this deal.')]));
      kids.push(dpSec('Agents who worked tickets', (d.owners || []).length ? [h('div', { class: 'tka-inline' }, d.owners.map(function (o) { return pill(o.name + ' (' + o.tickets + ')', ''); }))].concat((an.agents || []).length ? [h('p', { class: 'tka-when', text: 'Replying on tickets: ' + an.agents.map(function (a) { return a.name + ' (' + a.messages + ')'; }).join(', ') })] : []) : [dpNote('No ticket owners on record.')]));
      kids.push(dpSec('FCR and CSAT for this deal', [h('div', { class: 'tka-inline' }, [pill('FCR ' + (d.fcr.pct == null ? 'no data' : d.fcr.pct + '%'), d.fcr.pct == null ? '' : d.fcr.pct >= 70 ? 'st-approved' : 'sev-medium'), d.fcr.closed ? h('span', { class: 'tka-when', text: d.fcr.achieved + ' of ' + d.fcr.closed + ' closed tickets solved first contact' }) : null]),
        h('div', { class: 'tka-inline' }, [pill('CSAT ' + (d.csat.pct == null ? 'no surveys' : d.csat.pct + '%'), d.csat.pct == null ? '' : d.csat.pct >= 80 ? 'st-approved' : 'sev-medium')])]));
      if (an.available && an.savedAt) kids.push(dpNote('Account analysis from ' + when(an.savedAt) + '. Tickets are live from Zoho Desk.'));
      box.replaceChildren.apply(box, kids);
    }
    function reviewCard(r, buf, me) {
      var waiting = r.state === 'waiting';
      var cls = waiting ? (r.minutes >= buf ? 'sev-high' : r.minutes >= buf - 5 ? 'sev-medium' : 'st-approved') : 'sev-low';
      var own = r.agent_email && me && r.agent_email === me;
      var form = h('div', { class: 'tka-rv-form' });
      function openForm(kind) {
        var c = h('textarea', { class: 'tka-note-in', rows: '2', maxlength: '800', placeholder: kind === 'invalid' ? 'What did the agent miss? The agent sees this.' : kind === 'ignored' ? 'Why ignore it? For example: set by mistake and moved back to Open' : 'Optional note', 'aria-label': 'Comments' });
        var who = h('input', { class: 'tka-input', list: 'tka-people', placeholder: 'Moved to (person)', value: r.to_agent || '', 'aria-label': 'Moved to' });
        var dl = document.getElementById('tka-people') || h('datalist', { id: 'tka-people' });
        if (!dl.parentNode) document.body.appendChild(dl);
        var t = null;
        who.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { api('/api/review/people?q=' + encodeURIComponent(who.value)).then(function (p) { dl.replaceChildren.apply(dl, (p.people || []).map(function (x) { return h('option', { value: x.name, text: x.team }); })); }); }, 250); });
        var sevName = 'tka-sev-' + r.id, sev = { v: null };
        var sevBox = kind !== 'invalid' ? null : h('div', { class: 'tka-radios', role: 'radiogroup', 'aria-label': 'How serious is it?' }, [['fatal', 'Fatal', 'counts as a strike'], ['feedback', 'Feedback', 'no strike, the agent still sees it']].map(function (o) {
          var rb = h('input', { type: 'radio', name: sevName, id: sevName + '-' + o[0], value: o[0] });
          rb.addEventListener('change', function () { sev.v = o[0]; save.textContent = o[0] === 'fatal' ? 'Save as fatal (strike)' : 'Save as feedback'; save.className = 'tka-btn ' + (o[0] === 'fatal' ? 'danger' : 'primary'); });
          return h('label', { class: 'tka-radio', for: sevName + '-' + o[0] }, [rb, h('span', null, [h('b', { text: o[1] }), h('span', { class: 'tka-when', text: ' ' + o[2] })])]);
        }));
        var save = btn(kind === 'invalid' ? 'Choose Fatal or Feedback' : kind === 'ignored' ? 'Ignore this one' : 'Save as good to go', kind === 'invalid' ? 'danger' : 'primary', function () {
          if (kind === 'invalid' && !sev.v) return toast('Choose Fatal (strike) or Feedback (no strike)', 'error');
          var label = save.textContent;
          busy(save, true, 'Saving...');
          api('/api/review/' + r.id + '/verdict', { verdict: kind, severity: sev.v, comment: c.value, toAgent: who.value }).then(function (x) {
            busy(save, false, label);
            if (!x.success) return toast(x.error || 'Could not save', 'error');
            toast(x.strike ? 'Saved. Strike ' + x.strike.count + ' (' + x.strike.level + ') for the agent' + (x.strike.chat && !x.strike.chat.ok ? ', group message not sent' : '') : x.severity === 'feedback' ? 'Saved. Feedback sent to the agent, no strike' : 'Saved');
            load(false);
          });
        });
        var ai = kind === 'ignored' ? null : h('div', { class: 'tka-asst' }, [h('span', { class: 'tka-when', text: 'AI is reading the ticket...' })]);
        if (ai) assistFor(r, kind, ai, who, c, sev, function (v) { var rb = document.getElementById(sevName + '-' + v); if (rb) { rb.checked = true; rb.dispatchEvent(new Event('change')); } });
        form.replaceChildren.apply(form, [h('p', { class: 'tka-hint', text: kind === 'invalid' ? 'Send the ticket back to the agent in Zoho Desk (owner and status), then save.' : kind === 'ignored' ? 'Not a transfer, for example the status was set by mistake. No strike, no feedback to the agent. It stays in History with your reason.' : 'Move the ticket to the right person in Zoho Desk, then save.' }),
          kind === 'good' ? who : null, ai, sevBox, c, h('div', { class: 'tka-actions' }, [save, btn('Cancel', 'ghost sm', function () { form.replaceChildren(); })])].filter(Boolean));
      }
      var side = own ? [h('span', { class: 'tka-when', text: 'Your own ticket' })] : [btn('Good to go', 'primary', function () { openForm('good'); }), btn('Invalid', 'danger', function () { openForm('invalid'); })];
      if (!own && !waiting) side.push(btn('Ignore', 'ghost sm', function () { openForm('ignored'); }));
      var dealBox = h('div', { class: 'tka-dp', hidden: true });
      var dealBtn = null;
      function toggleDeal() {
        var open = dealBox.hidden;
        dealBox.hidden = !open;
        if (dealBtn) { dealBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); dealBtn.textContent = open ? 'Hide deal history' : 'Deal history'; }
        if (open && !dealBox.dataset.loaded) {
          dealBox.dataset.loaded = '1';
          dealBox.replaceChildren(h('p', { class: 'tka-when', text: 'Loading deal history...' }));
          api('/api/review/' + r.id + '/deal').then(function (x) { if (!x.success) { dealBox.dataset.loaded = ''; dealBox.replaceChildren(h('p', { class: 'tka-when', text: x.error || 'Could not load deal history' })); return; } renderDeal(dealBox, x); });
        }
      }
      if (waiting) dealBtn = btn('Deal history', 'ghost sm', function (ev) { ev.stopPropagation(); toggleDeal(); }, { 'aria-expanded': 'false' });
      var art = h('article', { class: 'tka-row' + (waiting && r.minutes >= buf ? ' hot' : '') + (waiting ? ' tka-clickable' : '') }, [
        h('div', { class: 'tka-row-main' }, [
          h('div', { class: 'tka-row-top' }, [r.web_url ? h('a', { class: 'tka-num', href: r.web_url, target: '_blank', rel: 'noopener', text: '#' + r.ticket_number }) : h('b', { class: 'tka-num', text: '#' + r.ticket_number }), h('span', { class: 'tka-sub', text: r.subject || '' })]),
          h('div', { class: 'tka-meta' }, [h('span', { text: nameOf(r.agent_email, r.agent_name) }), r.channel ? pill(r.channel, 'dest') : null,
            waiting ? pill('Waiting ' + mmLabel(r.minutes), cls) : pill(r.source === 'bypass' ? 'Skipped review' : 'Left review status', r.source === 'bypass' ? 'sev-high' : 'sev-medium'),
            r.to_team || r.to_agent ? h('span', { class: 'tka-when', text: 'Now with ' + [r.to_agent, r.to_team ? '(' + r.to_team + ')' : ''].filter(Boolean).join(' ') }) : null,
            r.breach_count ? h('span', { class: 'tka-when', text: 'Escalated ' + r.breach_count + 'x' }) : null]),
          waiting ? dealLine(r.deal) : null,
          waiting ? h('div', { class: 'tka-actions' }, [dealBtn]) : null,
          dealBox,
          form]),
        h('div', { class: 'tka-row-side' }, side)]);
      if (waiting) art.addEventListener('click', function (ev) { if (ev.target.closest('a, button, input, textarea, select, label, .tka-rv-form, .tka-dp')) return; toggleDeal(); });
      return art;
    }
    load(false);
    clearInterval(TA._rvTimer);
    TA._rvTimer = setInterval(function () { if (TA.tab === 'review' && !TA.auditId && document.body.contains(host) && !host.querySelector('.tka-rv-form textarea')) load(false); else if (!document.body.contains(host)) clearInterval(TA._rvTimer); }, 30000);
  }
  function parseSpaces(t) { var o = {}; String(t || '').split(/\n+/).forEach(function (l) { var i = l.indexOf('='); if (i < 1) return; var k = l.slice(0, i).trim(), v = l.slice(i + 1).trim(); if (k && v) o[k] = v; }); return o; }
  function reviewSettings(host) {
    api('/api/review/settings').then(function (j) {
      if (!j.success) return toast(j.error || 'Could not load settings', 'error');
      var st = j.settings, picked = {}; (st.excludedTeams || []).forEach(function (t) { picked[t] = true; });
      var box = h('div', { class: 'tka-picks' }, (j.teams || []).map(function (t, i) {
        var cb = h('input', { type: 'checkbox', id: 'tka-ex-' + i }); cb.checked = !!picked[t];
        cb.addEventListener('change', function () { picked[t] = cb.checked; });
        return h('label', { for: 'tka-ex-' + i, class: 'tka-pick' }, [cb, h('span', { text: t })]);
      }));
      var buf = h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '240', value: String(st.bufferMin), 'aria-label': 'Buffer minutes' });
      var rep = h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '480', value: String(st.repeatMin || st.bufferMin), 'aria-label': 'Repeat every minutes' });
      var mx = h('input', { class: 'tka-input narrow', type: 'number', min: '0', max: '50', value: String(st.maxReminders || 0), 'aria-label': 'Stop after reminders' });
      var alOn = h('input', { type: 'checkbox', id: 'tka-al-on' }); alOn.checked = st.alertsOn !== false;
      var esc = h('input', { class: 'tka-input', value: (st.escalateEmails || []).join(', '), 'aria-label': 'People tagged when the buffer passes' });
      var stName = h('input', { class: 'tka-input', value: st.statusName, 'aria-label': 'Zoho status name' });
      var hrFrom = h('input', { class: 'tka-input narrow', type: 'number', min: '0', max: '23', value: String(st.startHour == null ? 7 : st.startHour), 'aria-label': 'Review hours start' });
      var hrTo = h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '24', value: String(st.endHour == null ? 19 : st.endHour), 'aria-label': 'Review hours end' });
      var spaces = h('textarea', { class: 'tka-note-in', rows: '5', 'aria-label': 'Department space links', placeholder: 'Team name = https://chat.google.com/room/...' });
      spaces.value = Object.keys(st.deptSpaces || {}).map(function (k) { return k + ' = ' + st.deptSpaces[k]; }).join('\n');
      var on = h('input', { type: 'checkbox', id: 'tka-rv-on' }); on.checked = st.enabled !== false;
      var card = h('div', { class: 'tka-card' }, [h('h3', { text: 'Review settings' }),
        h('p', { class: 'tka-hint', text: 'Assign directly: T1 agents may assign tickets straight to people in these teams without review. Everything else must go through ' + st.statusName + '.' }),
        box,
        h('div', { class: 'tka-inline' }, [h('span', { text: 'Review within' }), buf, h('span', { text: 'minutes, then tag' }), esc]),
        h('div', { class: 'tka-inline' }, [h('span', { text: 'Then remind every' }), rep, h('span', { text: 'minutes, stop after' }), mx, h('span', { text: 'reminders (0 means no limit)' }), h('label', { class: 'tka-inline', for: 'tka-al-on' }, [alOn, h('span', { text: 'Review alerts on' })])]),
        h('h3', { text: 'Department chat spaces' }),
        h('p', { class: 'tka-hint', text: 'One per line: team name, an equals sign, then the Google Chat space link. Good to go shows an Open space button for the chosen team. Team names: ' + ((j.teams || []).slice(0, 12).join(', ') || 'not loaded yet') + ((j.teams || []).length > 12 ? ', and more' : '') + '.' }),
        spaces,
        h('div', { class: 'tka-inline' }, [h('span', { text: 'Review hours (Central time)' }), hrFrom, h('span', { text: 'to' }), hrTo, h('span', { class: 'tka-when', text: 'The review clock and the Chat tags only run inside these hours, 24 hour clock (7 to 19 is 7 AM to 7 PM).' })]),
        h('div', { class: 'tka-inline' }, [h('span', { text: 'Zoho status' }), stName, h('label', { class: 'tka-inline', for: 'tka-rv-on' }, [on, h('span', { text: 'Review on' })])]),
        h('p', { class: 'tka-when', text: 'People directory ' + (j.peopleRefreshedAt ? 'updated ' + ago(j.peopleRefreshedAt) : 'not built yet') + ' (Zoho teams, staff list and the Who does what sheet).' }),
        h('div', { class: 'tka-actions' }, [
          btn('Save settings', 'primary', function () {
            var ex = Object.keys(picked).filter(function (k) { return picked[k]; });
            api('/api/review/settings', { excludedTeams: ex, bufferMin: Number(buf.value), escalateEmails: esc.value.split(/[,\s]+/).filter(Boolean), statusName: stName.value, enabled: on.checked, startHour: Number(hrFrom.value), endHour: Number(hrTo.value), repeatMin: Number(rep.value), maxReminders: Number(mx.value), alertsOn: alOn.checked, deptSpaces: parseSpaces(spaces.value) }, 'PUT').then(function (r) { toast(r.success ? 'Saved' : (r.error || 'Failed'), r.success ? 'success' : 'error'); if (r.success) { TA.tab = 'review'; render(); } });
          }),
          btn('Rebuild people directory', '', function (ev) { var b = ev.currentTarget; busy(b, true, 'Rebuilding...'); api('/api/review/people/refresh', {}).then(function (r) { busy(b, false, 'Rebuild people directory'); toast(r.success ? 'Directory: ' + r.zoho + ' from Zoho teams, ' + r.staff + ' staff, ' + r.sheet + ' from the sheet' : (r.error || 'Failed'), r.success ? 'success' : 'error'); }); }),
          btn('Close', 'ghost sm', function () { card.remove(); })])]);
      host.insertBefore(card, host.firstChild);
    });
  }
  function viewStrikes(body) {
    api('/api/review/strikes').then(function (j) {
      if (!j.success) { body.appendChild(h('div', { class: 'tka-note', text: j.error || 'Could not load strikes' })); return; }
      var l30 = j.last30 || {};
      body.appendChild(h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'Strikes (rolling ' + j.days + ' days)' }), h('p', { class: 'tka-hint', text: 'Only reviews marked Invalid: fatal are strikes (feedback is not). 5th: verbal warning, 6th: written warning, 7th: PIP for 30 days, more: disciplinary action. Last 30 days: ' + (l30.n || 0) + ' reviews, ' + (l30.good || 0) + ' good, ' + (l30.invalid || 0) + ' fatal, ' + (l30.feedback || 0) + ' feedback.' })])]));
      if (!j.agents.length) { body.appendChild(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'No strikes' }), h('p', { text: 'Invalid transfers show here once reviewers record them.' })])); return; }
      j.agents.forEach(function (a) {
        var d = h('details', { class: 'tka-fold' }, [h('summary', null, [h('b', { text: a.name + '  ' }), pill(a.active + ' active', a.active >= 7 ? 'sev-high' : a.active >= 5 ? 'sev-medium' : 'sev-low'), a.level ? pill(a.level, a.active >= 5 ? 'sev-high' : 'cat') : null])]);
        a.strikes.forEach(function (s) {
          d.appendChild(h('div', { class: 'tka-tl' + (s.voided ? ' off' : '') }, [h('span', { class: 'tka-when', text: when(String(s.at).replace(' ', 'T') + 'Z') }),
            h('span', null, [s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'tka-num', text: '#' + s.ticket }) : '#' + s.ticket, ' ' + (s.comment || '') + (s.voided ? ' (removed)' : ' (expires ' + when(s.expires).split(',')[0] + ')')]),
            s.voided ? null : btn('Remove strike', 'ghost sm', function (ev) { var why = prompt('Why remove this strike?'); if (why == null) return; api('/api/review/strikes/' + s.id + '/void', { reason: why }).then(function (r) { toast(r.success ? 'Strike removed' : (r.error || 'Failed'), r.success ? 'success' : 'error'); TA.tab = 'strikes'; render(); }); })]));
        });
        body.appendChild(d);
      });
    });
  }

  // ── Review history: every review, searchable, for tracing later escalations ──
  function viewHistory(body) {
    var f = TA.histF = TA.histF || { q: '', verdict: '', reviewer: '', agent: '', from: '', to: '', offset: 0 };
    var iso = function (d) { return d.toISOString().slice(0, 10); };
    if (!f.from) f.from = iso(new Date(Date.now() - 30 * 864e5));
    var q = h('input', { class: 'tka-input', type: 'search', value: f.q, placeholder: 'Search ticket #, subject, agent, comment', 'aria-label': 'Search reviews' });
    var verdict = h('select', { class: 'tka-input narrow', 'aria-label': 'Verdict' }, [['', 'All verdicts'], ['good', 'Good to go'], ['invalid', 'Invalid (all)'], ['fatal', 'Invalid: fatal'], ['feedback', 'Invalid: feedback'], ['ignored', 'Ignored'], ['none', 'No verdict yet'], ['skipped', 'Skipped review']].map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === f.verdict) op.selected = true; return op; }));
    var reviewer = h('select', { class: 'tka-input narrow', 'aria-label': 'Reviewer' }, [h('option', { value: '', text: 'All reviewers' })]);
    var agent = h('select', { class: 'tka-input narrow', 'aria-label': 'Agent' }, [h('option', { value: '', text: 'All agents' })]);
    var from = h('input', { class: 'tka-input narrow', type: 'date', value: f.from, 'aria-label': 'From date' });
    var to = h('input', { class: 'tka-input narrow', type: 'date', value: f.to, 'aria-label': 'To date' });
    var out = h('div', null, [h('p', { class: 'tka-empty', text: 'Loading...' })]);
    function params(extra) {
      var p = { q: f.q, verdict: f.verdict, reviewer: f.reviewer, agent: f.agent, from: f.from, to: f.to, offset: f.offset, limit: 50 };
      Object.assign(p, extra || {});
      return Object.keys(p).filter(function (k) { return p[k] !== '' && p[k] != null; }).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
    }
    function apply() { f.q = q.value.trim(); f.verdict = verdict.value; f.reviewer = reviewer.value; f.agent = agent.value; f.from = from.value; f.to = to.value; f.offset = 0; load(); }
    var t = null;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 350); });
    [verdict, reviewer, agent, from, to].forEach(function (x) { x.addEventListener('change', apply); });
    body.appendChild(h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'Review history' }), h('p', { class: 'tka-hint', text: 'Every review is kept. Search here when an escalation comes in later, to see who reviewed the transfer and what they decided.' })])]));
    body.appendChild(h('div', { class: 'tka-filters' }, [q, verdict, reviewer, agent, h('span', { class: 'tka-when', text: 'From' }), from, h('span', { class: 'tka-when', text: 'to' }), to,
      h('a', { class: 'tka-btn ghost sm', href: '#', text: 'Download CSV', onclick: function (ev) { ev.preventDefault(); window.open(BASE + '/api/review/history?' + params({ format: 'csv', offset: 0 }), '_blank'); } })]));
    body.appendChild(out);
    function load() {
      out.replaceChildren(h('p', { class: 'tka-empty', text: 'Loading...' }));
      api('/api/review/history?' + params()).then(function (j) {
        if (!j.success) { out.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not load history' })); return; }
        if (reviewer.options.length === 1) j.reviewers.forEach(function (r) { var op = h('option', { value: r, text: r.split('@')[0] }); if (r === f.reviewer) op.selected = true; reviewer.appendChild(op); });
        if (agent.options.length === 1) j.agents.forEach(function (a) { var op = h('option', { value: a.email, text: a.name || a.email.split('@')[0] }); if (a.email === f.agent) op.selected = true; agent.appendChild(op); });
        if (!j.rows.length) { out.replaceChildren(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'No reviews match' }), h('p', { text: 'Try a wider date range or clear the search.' })])); return; }
        var tbl = h('table', { class: 'tka-cov tka-hist' }, [h('thead', null, [h('tr', null, ['Ticket', 'Agent', 'Verdict', 'Moved to', 'Reviewer', 'When', 'Comment'].map(function (x) { return h('th', { scope: 'col', text: x }); }))]),
          h('tbody', null, j.rows.map(function (r) {
            var v = r.verdict ? verdictPill(r) : pill(r.state === 'waiting' ? 'Waiting' : 'No verdict', 'sev-medium');
            return h('tr', null, [
              h('td', null, [r.web_url ? h('a', { class: 'tka-num', href: r.web_url, target: '_blank', rel: 'noopener', text: '#' + r.ticket_number }) : h('b', { text: '#' + r.ticket_number }), h('div', { class: 'tka-when', text: (r.subject || '').slice(0, 60) })]),
              h('td', { text: nameOf(r.agent_email, r.agent_name) }),
              h('td', null, [v, r.source === 'bypass' ? h('div', { class: 'tka-when', text: 'Skipped review' }) : null, r.voided ? h('div', { class: 'tka-when', text: 'Strike removed' }) : null]),
              h('td', { text: [r.to_agent, r.to_team ? '(' + r.to_team + ')' : ''].filter(Boolean).join(' ') || '' }),
              h('td', { text: r.reviewer ? r.reviewer.split('@')[0] : '' }),
              h('td', { text: when(r.reviewed_at || r.left_at || r.entered_at) }),
              h('td', { class: 'tka-hist-c', text: r.comment || '' })]);
          }))]);
        var pages = h('div', { class: 'tka-toolbar' }, [h('span', { class: 'tka-when', text: (f.offset + 1) + ' to ' + (f.offset + j.rows.length) + ' of ' + j.total }),
          f.offset > 0 ? btn('Previous', 'ghost sm', function () { f.offset = Math.max(0, f.offset - 50); load(); }) : null,
          f.offset + j.rows.length < j.total ? btn('Next', 'ghost sm', function () { f.offset += 50; load(); }) : null]);
        out.replaceChildren(h('div', { class: 'tka-histwrap' }, [tbl]), pages);
      });
    }
    load();
  }

  // ── Escalation watch (admin) ───────────────────────────────────────
  var ESC_KIND = { 'new': ['New escalation', 'sev-high'], existing: ['Already escalated', 'sev-medium'], reopen: ['Reopen ESC', 'sev-medium'] };
  var ESC_STATUS = { alerted: ['Alerted', 'st-pending'], reported: ['Reported', 'st-approved'], late_reported: ['Reported late', 'st-returned'], not_reported: ['Not reported', 'sev-high'], dismissed: ['Dismissed', 'st-closed'],
    not_needed: ['Escalation not needed', 'st-closed'], watching: ['Checking ESC owner', 'st-pending'], handled: ['ESC owner looped in', 'st-approved'], owner_missed: ['ESC owner not looped in', 'sev-high'], noted: ['No action needed', 'st-closed'] };
  function viewEscalations(body) {
    var days = TA.escDays || 7;
    var setHost = h('div'), listHost = h('div', null, [h('p', { class: 'tka-empty', text: 'Loading...' })]);
    body.appendChild(h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'Escalation watch' }),
      h('p', { class: 'tka-hint', text: 'Every 15 minutes this reads T1 ticket conversations, SalesIQ chat transcripts, private notes and T1 call summaries (Avoma and RingCentral). When a client shows escalation signs and has no active ESC, it posts to Google Chat and reminds once if no ESC is created in time. When the client is already escalated, it posts only if the agent did not tag the ESC owner on the ticket or assign it to them.' })])]));
    var covHost = h('div');
    body.appendChild(setHost); body.appendChild(covHost); body.appendChild(listHost);
    api('/api/escalations/coverage?days=7').then(function (j) {
      if (!j.success) return;
      var ag = j.agents || [];
      var tbl = h('table', { class: 'tka-cov' }, [h('thead', null, [h('tr', null, ['Agent', 'Tickets', 'SalesIQ chats', 'Calls'].map(function (x) { return h('th', { text: x, scope: 'col' }); }))]),
        h('tbody', null, ag.map(function (a) { return h('tr', null, [h('td', null, [h('b', { text: a.name }), h('span', { class: 'tka-when', text: ' ' + a.email })]), h('td', { text: String(a.tickets) }), h('td', { text: String(a.chats) }), h('td', { text: String(a.calls) })]); }))]);
      covHost.replaceChildren(h('details', { class: 'tka-card tka-fold' }, [h('summary', null, [h('b', { text: 'Agents watched (' + ag.length + ')  ' }), h('span', { class: 'tka-when', text: 'what was read for each agent in the last 7 days' })]),
        h('p', { class: 'tka-hint', text: 'This is the agent list on the Team page. Add or remove agents there to change who is watched. Calls are read only for these agents, even though AditKB also tags some other people as T1.' }),
        ag.length ? tbl : h('p', { class: 'tka-empty', text: 'No agents on the Team page yet.' })]));
    });
    api('/api/escalations/settings').then(function (j) { if (j.success) drawEscSettings(setHost, j.settings); else setHost.appendChild(h('div', { class: 'tka-note', text: j.error || 'Could not load settings' })); });
    function loadList() {
      api('/api/escalations/list?days=' + days).then(function (j) {
        if (!j.success) { listHost.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not load alerts' })); return; }
        var sel = h('select', { class: 'tka-input narrow', 'aria-label': 'Period' }, [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(function (o) { var op = h('option', { value: String(o[0]), text: o[1] }); if (o[0] === days) op.selected = true; return op; }));
        sel.addEventListener('change', function () { days = TA.escDays = Number(sel.value); loadList(); });
        var sig = j.signals || [], c = { n: 0, nr: 0, rep: 0, om: 0, nn: 0 };
        sig.forEach(function (x) {
          if (x.status === 'not_needed') { c.nn++; return; }
          if (x.kind !== 'existing') c.n++;
          if (x.status === 'not_reported') c.nr++; else if (x.status === 'reported' || x.status === 'late_reported') c.rep++; else if (x.status === 'owner_missed') c.om++;
        });
        var F = TA.escF = TA.escF || { q: '', status: 'action', kind: '', source: '', agent: '' };
        // Tiles double as quick filters.
        var tile = function (l, v, sub, cls, status) {
          var on = F.status === status;
          return h('button', { type: 'button', class: 'tka-tile tka-tile-btn ' + (cls || '') + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: 'Show only these', onclick: function () { F.status = on ? '' : status; paintList(); } },
            [h('span', { class: 'tka-tile-l', text: l }), h('b', { class: 'tka-tile-v', text: String(v) }), h('span', { class: 'tka-tile-s', text: sub })]);
        };
        var opt = function (list, cur) { return list.map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === cur) op.selected = true; return op; }); };
        var agentsSeen = {}; sig.forEach(function (x) { if (x.agent_email) agentsSeen[x.agent_email] = nameOf(x.agent_email, x.agent_name); });
        var q = h('input', { class: 'tka-input', type: 'search', value: F.q, placeholder: 'Search ticket #, client, agent, ESC, keyword, summary', 'aria-label': 'Search alerts' });
        var fStatus = h('select', { class: 'tka-input narrow', 'aria-label': 'Status' }, opt([['action', 'Needs action'], ['', 'All statuses'], ['alerted', 'Alerted'], ['not_reported', 'Not reported'], ['reported', 'Reported'], ['owner_missed', 'ESC owner missed'], ['watching', 'Checking ESC owner'], ['handled', 'ESC owner looped in'], ['not_needed', 'Not needed'], ['noted', 'No action needed']], F.status));
        var fKind = h('select', { class: 'tka-input narrow', 'aria-label': 'Type' }, opt([['', 'All types'], ['new', 'New escalation'], ['reopen', 'Reopen ESC'], ['existing', 'Already escalated']], F.kind));
        var fSource = h('select', { class: 'tka-input narrow', 'aria-label': 'Source' }, opt([['', 'All sources'], ['ticket', 'Tickets'], ['chat', 'SalesIQ chats'], ['call', 'Calls']], F.source));
        var fAgent = h('select', { class: 'tka-input narrow', 'aria-label': 'Agent' }, opt([['', 'All agents']].concat(Object.keys(agentsSeen).sort(function (a, b) { return agentsSeen[a].localeCompare(agentsSeen[b]); }).map(function (e) { return [e, agentsSeen[e]]; })), F.agent));
        var t = null;
        q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { F.q = q.value.trim(); paintList(); }, 250); });
        [[fStatus, 'status'], [fKind, 'kind'], [fSource, 'source'], [fAgent, 'agent']].forEach(function (p) { p[0].addEventListener('change', function () { F[p[1]] = p[0].value; paintList(); }); });
        var tilesHost = h('div'), cardsHost = h('div');
        function matches(x) {
          if (F.status === 'action') { if (['alerted', 'not_reported', 'watching', 'owner_missed'].indexOf(x.status) < 0) return false; }
          else if (F.status === 'reported') { if (x.status !== 'reported' && x.status !== 'late_reported') return false; }
          else if (F.status && x.status !== F.status) return false;
          if (F.kind && x.kind !== F.kind) return false;
          if (F.source && x.source !== F.source) return false;
          if (F.agent && x.agent_email !== F.agent) return false;
          if (F.q) {
            var hay = [x.ticket_number, x.account_name, x.agent_name, x.agent_email, x.esc_name, x.reported_esc, x.esc_owner, x.csm, x.summary, x.quote, x.call_label, x.action_note, (x.signals || []).join(' '), x.matched].join(' ').toLowerCase();
            if (F.q.toLowerCase().replace(/^#/, '').split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false;
          }
          return true;
        }
        function paintList() {
          tilesHost.replaceChildren(h('div', { class: 'tka-tiles' }, [tile('New escalation alerts', c.n, c.nn ? c.nn + ' more marked not needed' : 'no ESC on record', '', 'alerted'), tile('Reported', c.rep, 'ESC created or updated in CRM', '', 'reported'), tile('Not reported', c.nr, 'no ESC after the reminder', c.nr ? 'hot' : '', 'not_reported'), tile('ESC owner missed', c.om, 'escalated client, owner not tagged or assigned', c.om ? 'hot' : '', 'owner_missed')]));
          fStatus.value = F.status;
          var shown = sig.filter(matches);
          var cards = [h('p', { class: 'tka-when', role: 'status', text: 'Showing ' + shown.length + ' of ' + sig.length + ' alerts' + (F.status === 'action' ? ' that need action' : '') })];
          if (sig.length && !shown.length) cards.push(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'Nothing matches' }), h('p', { text: 'Clear the search or choose All statuses.' })]));
          shown.forEach(function (x) { cards.push(escCard(x, loadList)); });
          cardsHost.replaceChildren.apply(cardsHost, cards);
        }
        var kids = [h('div', { class: 'tka-toolbar' }, [h('span', { class: 'tka-when', text: 'Showing' }), sel]), tilesHost];
        var ag = (j.agents || []).filter(function (a) { return a.notReported || a.ownerMissed; });
        if (ag.length) kids.push(h('div', { class: 'tka-card' }, [h('h3', { text: 'Misses by agent' }), h('div', { class: 'tka-chips' }, ag.map(function (a) { return pill(a.name + ': ' + [a.notReported ? a.notReported + ' not reported' : '', a.ownerMissed ? a.ownerMissed + ' owner missed' : ''].filter(Boolean).join(', '), 'sev-high'); }))]));
        if (!sig.length) kids.push(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'No escalation signals' }), h('p', { text: 'Alerts appear here once the watch is on and finds a client who should be escalated.' })]));
        else kids.push(h('div', { class: 'tka-filters' }, [q, fStatus, fKind, fSource, fAgent, h('button', { type: 'button', class: 'tka-btn ghost sm', text: 'Clear filters', onclick: function () { TA.escF = { q: '', status: '', kind: '', source: '', agent: '' }; loadList(); } })]), cardsHost);
        listHost.replaceChildren.apply(listHost, kids);
        paintList();
      });
    }
    loadList();
  }
  function escCard(x, reload) {
    var k = ESC_KIND[x.kind] || [x.kind, 'cat'], st = ESC_STATUS[x.status] || [x.status, 'cat'];
    var src = x.source !== 'call' ? (x.ticket_url ? h('a', { class: 'tka-num', href: x.ticket_url, target: '_blank', rel: 'noopener', text: '#' + x.ticket_number }) : h('b', { class: 'tka-num', text: '#' + (x.ticket_number || '') })) : h('span', null, [h('b', { class: 'tka-num', text: x.call_label || 'Call' }), x.ticket_url ? h('span', null, [' ', h('a', { class: 'tka-num', href: x.ticket_url, target: '_blank', rel: 'noopener', text: 'Ticket #' + x.ticket_number })]) : null]);
    var side = [];
    var form = h('div', { class: 'tka-rv-form' });
    function openAction(required) {
      var uid = 'tka-esa-' + x.id;
      var yes = h('input', { type: 'radio', name: uid, id: uid + '-y', value: 'yes' }), no = h('input', { type: 'radio', name: uid, id: uid + '-n', value: 'no' });
      yes.checked = required; no.checked = !required;
      var esc = h('input', { class: 'tka-input', id: uid + '-esc', placeholder: 'ESC id, for example ESC-1234', value: x.reported_esc || x.esc_name || '', autocomplete: 'off' });
      var escRow = h('div', null, [h('label', { class: 'tka-hint', for: uid + '-esc', text: 'ESC id (created, updated or reopened in CRM)' }), esc]);
      var note = h('textarea', { class: 'tka-note-in', id: uid + '-note', rows: '3', maxlength: '800' });
      var noteLab = h('label', { class: 'tka-hint', for: uid + '-note' });
      function sync() {
        var r = yes.checked;
        escRow.hidden = !r;
        noteLab.textContent = r ? 'What did you do? (for example: confirmed with the client, created ESC with ticket link, informed the CSM)' : 'Why is escalation not needed, and what action was taken instead?';
        note.placeholder = r ? 'Action taken' : 'For example: client was asking about appointment cancellations, not the Adit account. Issue resolved on the call.';
        save.textContent = r ? 'Save: escalation required' : 'Save: escalation not needed';
      }
      var save = btn('Save', 'primary', function () {
        busy(save, true, 'Saving...');
        api('/api/escalations/' + x.id + '/action', { required: yes.checked, esc: esc.value, note: note.value }).then(function (r) {
          busy(save, false); sync();
          if (!r.success) return toast(r.error || 'Could not save', 'error');
          toast(yes.checked ? 'Saved as escalated' : 'Saved as not needed'); reload();
        });
      });
      yes.addEventListener('change', sync); no.addEventListener('change', sync);
      form.replaceChildren(
        h('div', { class: 'tka-radios', role: 'radiogroup', 'aria-label': 'Escalation required?' }, [h('span', { class: 'tka-hint', text: 'Escalation required?' }),
          h('label', { for: uid + '-y', class: 'tka-radio' }, [yes, h('span', { text: 'Yes' })]), h('label', { for: uid + '-n', class: 'tka-radio' }, [no, h('span', { text: 'No' })])]),
        escRow, noteLab, note, h('div', { class: 'tka-actions' }, [save, btn('Cancel', 'ghost sm', function () { form.replaceChildren(); })]));
      sync();
      (yes.checked ? esc : note).focus();
    }
    var notNeeded = btn('Escalation not needed', 'ghost sm', function () { openAction(false); });
    if (x.status === 'watching' || x.status === 'owner_missed') { side.push(btn('Record action', 'primary sm', function () { openAction(true); })); side.push(notNeeded); }
    if (x.status === 'alerted' || x.status === 'not_reported') {
      side.push(btn('Mark reported', 'primary sm', function () { openAction(true); }));
      side.push(notNeeded);
    }
    return h('article', { class: 'tka-row' + (x.status === 'not_reported' || x.status === 'owner_missed' ? ' hot' : '') }, [
      h('div', { class: 'tka-row-main' }, [
        h('div', { class: 'tka-row-top' }, [src, h('span', { class: 'tka-sub', text: x.account_name || 'Unknown account' })]),
        h('div', { class: 'tka-meta' }, [pill(k[0] + (x.esc_name ? ' ' + x.esc_name : ''), k[1], x.esc_status || null), pill(st[0] + (x.reported_esc ? ' ' + x.reported_esc : ''), st[1]),
          x.tier_suggestion && x.kind !== 'existing' ? pill('Suggested ' + x.tier_suggestion, 'dest') : null,
          h('span', { text: nameOf(x.agent_email, x.agent_name) }), h('span', { class: 'tka-when', text: when(x.detected_at) + (x.via === 'ai' ? ', AI ' + Math.round((x.confidence || 0) * 100) + '%' : ', keywords') }),
          x.post_ok || x.post_ok == null ? null : pill('Not posted', 'sev-medium', x.post_error || null)]),
        (x.signals || []).length ? h('div', { class: 'tka-flags' }, x.signals.map(function (g) { return pill(g, 'ai ai-escalation'); })) : null,
        x.summary ? h('p', { class: 'tka-hint', text: x.summary }) : null,
        x.quote ? h('p', { class: 'tka-when', text: 'Client said: "' + x.quote + '"' }) : null,
        x.owner_check ? h('p', { class: 'tka-when', text: 'ESC owner check: ' + x.owner_check }) : null,
        x.action_note ? h('p', { class: 'tka-hint tka-act' }, [h('b', { text: (x.status === 'not_needed' ? 'Not needed' : 'Action taken') + ' by ' + String(x.action_by || '').split('@')[0] + ', ' + when(x.action_at) + ': ' }), x.action_note]) : (x.nn_reason ? h('p', { class: 'tka-when', text: 'Not needed: ' + x.nn_reason }) : null),
        [x.csm ? 'CSM: ' + x.csm : '', x.ob_owner ? 'Onboarding: ' + x.ob_owner : '', x.esc_owner ? 'ESC owner: ' + x.esc_owner : ''].filter(Boolean).length ? h('p', { class: 'tka-when', text: [x.csm ? 'CSM: ' + x.csm : '', x.ob_owner ? 'Onboarding: ' + x.ob_owner : '', x.esc_owner ? 'ESC owner: ' + x.esc_owner : ''].filter(Boolean).join(' | ') }) : null, form]),
      h('div', { class: 'tka-row-side' }, side)]);
  }
  // Chip picker for people to tag. Value is a comma list of emails (or "all").
  function tagPicker(initial) {
    var items = (initial || []).slice(), opts = [], active = -1, timer = null;
    var chips = h('div', { class: 'tka-tagchips' });
    var input = h('input', { class: 'tka-tagin', type: 'text', placeholder: 'Type a name, for example Ronnie', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'tka-esc-tag-list', 'aria-labelledby': 'tka-esc-tags-l' });
    var list = h('ul', { class: 'tka-taglist', id: 'tka-esc-tag-list', role: 'listbox', hidden: true });
    var el = h('div', { class: 'tka-tagbox' }, [chips, input, list]);
    el.addEventListener('click', function (ev) { if (ev.target === el || ev.target === chips) input.focus(); });
    function drawChips() {
      chips.replaceChildren.apply(chips, items.map(function (it, i) {
        return h('span', { class: 'tka-tagchip' + (it.mention ? '' : ' off'), title: it.mention ? 'Google Chat will notify ' + it.label : it.label + ' has not signed in to this tool yet, so the alert shows the name without notifying them' }, [
          h('span', { text: it.label }),
          h('button', { type: 'button', class: 'tka-tagx', 'aria-label': 'Remove ' + it.label, text: '×', onclick: function () { items.splice(i, 1); drawChips(); input.focus(); } })]);
      }));
    }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); }
    function pick(p) {
      if (!items.some(function (x) { return x.token === p.email; })) items.push({ token: p.email, label: p.name, mention: !!p.canMention });
      input.value = ''; close(); drawChips(); input.focus();
    }
    function drawList() {
      if (!opts.length) list.replaceChildren(h('li', { class: 'tka-tagempty', text: 'No one found. Try a first name.' }));
      else list.replaceChildren.apply(list, opts.map(function (p, i) {
        var li = h('li', { id: 'tka-esc-opt-' + i, role: 'option', class: 'tka-tagopt' + (i === active ? ' on' : ''), 'aria-selected': i === active ? 'true' : 'false' }, [
          h('b', { text: p.name }), h('span', { class: 'tka-when', text: ' ' + (p.email === 'all' ? '' : p.email) + (p.team ? ', ' + p.team : '') }),
          p.canMention ? null : h('span', { class: 'tka-when', text: ' (not signed in yet)' })]);
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(p); });
        return li;
      }));
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'tka-esc-opt-' + active); else input.removeAttribute('aria-activedescendant');
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      if (/^all$/i.test(q)) { opts = [{ name: 'Everyone in the space', email: 'all', canMention: true }]; active = 0; drawList(); return; }
      timer = setTimeout(function () { api('/api/escalations/people?q=' + encodeURIComponent(q)).then(function (j) { opts = (j && j.people) || []; active = opts.length ? 0 : -1; drawList(); }); }, 200);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' && opts.length) { ev.preventDefault(); active = (active + 1) % opts.length; drawList(); }
      else if (ev.key === 'ArrowUp' && opts.length) { ev.preventDefault(); active = (active - 1 + opts.length) % opts.length; drawList(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (!list.hidden && opts[active]) pick(opts[active]); }
      else if (ev.key === 'Escape') close();
      else if (ev.key === 'Backspace' && !input.value && items.length) { items.pop(); drawChips(); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    drawChips();
    return { el: el, value: function () { return items.map(function (x) { return x.token; }).join(', '); } };
  }
  function drawEscSettings(host, st) {
    var hook = h('input', { class: 'tka-input', type: 'url', placeholder: st.webhookSet ? 'Saved: ' + st.webhookMasked : 'https://chat.googleapis.com/v1/spaces/...', 'aria-label': 'Google Chat webhook URL', autocomplete: 'off' });
    var tags = tagPicker(st.tagItems || []);
    var rem = h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '48', value: String(st.reminderHours), 'aria-label': 'Reminder after hours' });
    var conf = h('input', { class: 'tka-input narrow', type: 'number', min: '30', max: '95', step: '5', value: String(Math.round(st.minConfidence * 100)), 'aria-label': 'Minimum confidence percent' });
    var kw = h('textarea', { class: 'tka-input', rows: '4', 'aria-labelledby': 'tka-esc-kw-l', placeholder: 'One phrase per line' });
    kw.value = String(st.keywords || '').split('\n').join(', ');
    var ded = h('input', { class: 'tka-input narrow', type: 'number', min: '1', max: '72', value: String(st.dedupeHours), 'aria-label': 'One alert per client every hours' });
    var lookSel = h('select', { class: 'tka-input narrow', 'aria-label': 'Scan period' }, [['0', 'Since last scan'], ['12', 'Last 12 hours'], ['24', 'Last 24 hours'], ['48', 'Last 48 hours']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var on = h('input', { type: 'checkbox', id: 'tka-esc-on' }); on.checked = !!st.enabled;
    var res = {}; try { res = JSON.parse(st.lastScanResult || '{}'); } catch (e) {}
    var acc = st.access || {}, blocked = Object.keys(acc).filter(function (t) { return acc[t] !== 'ok'; });
    var status = st.lastScanAt ? 'Last scan ' + ago(st.lastScanAt) + ': ' + (res.error ? res.error : (res.tickets || 0) + ' tickets and ' + (res.calls || 0) + ' calls read, ' + (res.alerts || 0) + ' alerts, ' + (res.reminders || 0) + ' reminders' + (res.since ? ' (activity since ' + when(res.since) + ')' : '') + (res.errors && res.errors.length ? ', ' + res.errors.length + (res.errors.length === 1 ? ' error' : ' errors') : '')) + '.' : 'No scan yet.';
    function save(extra) {
      var b = Object.assign({ keywords: kw.value, tags: tags.value(), reminderHours: Number(rem.value), minConfidence: Number(conf.value) / 100, dedupeHours: Number(ded.value), enabled: on.checked }, extra || {});
      if (hook.value.trim()) b.webhook = hook.value.trim();
      return api('/api/escalations/settings', b, 'PUT').then(function (r) { toast(r.success ? 'Saved' : (r.error || 'Failed'), r.success ? 'success' : 'error'); if (r.success) { TA.tab = 'escalations'; render(); } return r; });
    }
    var card = h('details', { class: 'tka-card tka-fold', open: st.enabled ? null : true }, [
      h('summary', null, [h('b', { text: 'Settings  ' }), pill(st.enabled ? 'On' : 'Off', st.enabled ? 'st-approved' : 'st-closed'), h('span', { class: 'tka-when', text: '  ' + status })]),
      h('p', { class: 'tka-hint', text: 'Google Chat webhook for the escalation space. It is stored on the server and never shown in full again.' }),
      hook,
      h('p', { class: 'tka-hint', id: 'tka-esc-tags-l', text: 'People to tag at the top of every alert and reminder. Type a name and pick the person. A grey chip means they have not signed in to this tool yet, so Google Chat cannot notify them until they do.' }),
      tags.el,
      h('div', { class: 'tka-inline' }, [h('span', { text: 'Remind after' }), rem, h('span', { text: 'hours if no ESC is created or updated. One alert per client every' }), ded, h('span', { text: 'hours.' })]),
      h('p', { class: 'tka-hint', id: 'tka-esc-kw-l', text: 'Escalation keywords, separated by commas. Any of these in a client message, chat, private note or call raises an alert on its own, whatever the AI confidence. Use * for word endings (cancel* also catches cancelling). Cancel next to appointment, patient, reminder or similar words is ignored.' }),
      kw,
      h('div', { class: 'tka-inline' }, [h('span', { text: 'AI alone alerts at' }), conf, h('span', { text: '% confidence or more (when no keyword matched)' }), h('label', { class: 'tka-inline', for: 'tka-esc-on' }, [on, h('span', { text: 'Watch on' })])]),
      blocked.length ? h('div', { class: 'tka-note', text: 'AditKB did not allow: ' + blocked.map(function (t) { return t + ' (' + acc[t] + ')'; }).join(', ') + '. Ask for access to these tables for the key the server uses, or set ADITKB_ESC_API_KEY.' }) : null,
      h('div', { class: 'tka-actions' }, [
        btn('Save settings', 'primary', function () { save(); }),
        btn('Send test', '', function (ev) { var b = ev.currentTarget; busy(b, true, 'Sending...'); api('/api/escalations/test', {}).then(function (r) { busy(b, false, 'Send test'); toast(!r.success ? (r.error || 'Failed') : (r.unresolved && r.unresolved.length) ? 'Posted, but no Google Chat ID yet for ' + r.unresolved.join(', ') + ' (they need to sign in to this tool once), so they show as plain text' : 'Test posted to Google Chat' + (r.tags ? ' with tags' : ''), !r.success ? 'error' : (r.unresolved && r.unresolved.length) ? 'warning' : 'success'); }); }),
        lookSel,
        btn('Scan now', '', function (ev) { var b = ev.currentTarget; busy(b, true, 'Scanning...'); api('/api/escalations/scan', { hours: Number(lookSel.value) }).then(function (r) { busy(b, false, 'Scan now'); var x = r.result || {}; toast(r.success ? (x.busy ? 'A scan is already running' : x.error ? x.error : 'Scan done: ' + (x.tickets || 0) + ' tickets and chats, ' + (x.calls || 0) + ' calls read, ' + (x.alerts || 0) + ' alerts') : (r.error || 'Failed'), r.success && !x.error ? 'success' : 'error'); TA.tab = 'escalations'; render(); }); }),
        st.webhookSet ? btn('Remove webhook', 'ghost sm', function () { if (confirm('Remove the webhook and turn the watch off?')) save({ clearWebhook: true, enabled: false }); }) : null])]);
    host.replaceChildren(card);
  }

  // ── My Stats: Transfer policy tab for every agent ─────────────────────
  TA.policyTab = function () {
    var sec = document.getElementById('agent-section-mystats'); if (!sec) return;
    var root = document.getElementById('desk-lifecycle-agent-root');
    var bar = document.getElementById('tka-mystats-tabs'), pol = document.getElementById('tka-policy-root');
    if (!bar) {
      pol = h('div', { id: 'tka-policy-root', class: 'tka-page', style: 'display:none' });
      var b1 = h('button', { type: 'button', role: 'tab', class: 'tka-tab on', text: 'Ticket stats', 'aria-selected': 'true' });
      var b2 = h('button', { type: 'button', role: 'tab', class: 'tka-tab', text: 'Transfer policy', 'aria-selected': 'false' });
      bar = h('div', { id: 'tka-mystats-tabs', class: 'tka-tabs tka-page', role: 'tablist' }, [b1, b2]);
      function pick(which) {
        var p = which === 'policy';
        b1.classList.toggle('on', !p); b2.classList.toggle('on', p); b1.setAttribute('aria-selected', String(!p)); b2.setAttribute('aria-selected', String(p));
        if (root) root.style.display = p ? 'none' : ''; pol.style.display = p ? '' : 'none';
        if (p) drawPolicy(pol);
      }
      b1.addEventListener('click', function () { pick('stats'); });
      b2.addEventListener('click', function () { pick('policy'); });
      sec.insertBefore(bar, sec.firstChild); sec.appendChild(pol);
    }
  };
  function drawPolicy(pol) {
    pol.replaceChildren(h('p', { class: 'tka-empty', text: 'Loading...' }));
    api('/api/review/my').then(function (j) {
      if (!j.success) { pol.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not load' })); return; }
      var steps = h('div', { class: 'tka-policy' }, j.policy.map(function (p) {
        var hit = j.active >= p.from && j.active <= p.to;
        return h('div', { class: 'tka-step' + (hit ? ' on' : '') + (j.active >= p.from ? ' past' : '') }, [h('b', { text: p.from === p.to ? 'Strike ' + p.from : p.to > 100 ? 'Strike ' + p.from + '+' : 'Strikes ' + p.from + ' to ' + p.to }), h('span', { text: p.label }), h('em', { text: p.text })]);
      }));
      var tipsCard = h('div', { class: 'tka-card' }, [h('h3', { text: 'Tips for your next transfers' }), h('p', { class: 'tka-empty', text: 'Loading...' })]);
      api('/api/review/my/tips').then(function (t) {
        var kids = [h('h3', { text: 'Tips for your next transfers' })];
        if (!t.success || !(t.tips || []).length) kids.push(h('p', { class: 'tka-empty', text: t.success ? 'No tips yet. They appear after a reviewer sends you feedback.' : 'Could not load tips' }));
        else { kids.push(h('p', { class: 'tka-hint', text: (t.ai ? 'Written by AI from' : 'Taken from') + ' your reviewers\' feedback. They update when you get new feedback.' })); t.tips.forEach(function (x) { kids.push(h('div', { class: 'tka-pt' }, [h('i'), h('span', { text: x })])); }); }
        tipsCard.replaceChildren.apply(tipsCard, kids);
      }).catch(function () {});
      pol.replaceChildren(
        h('div', { class: 'tka-head' }, [h('div', null, [h('h2', { text: 'Transfer policy' }), h('p', { text: 'Every transfer out of T1 is reviewed before it reaches another team.' })])]),
        h('div', { class: 'tka-card' }, [h('h3', { text: 'How it works' }),
          h('div', { class: 'tka-pts' }, [
            'Do not move a ticket to another team or person yourself. Set the status to "' + j.statusName + '".',
            'A reviewer checks it within ' + j.bufferMin + ' minutes and moves it to the right person, or sends it back to you with comments.',
            'An invalid transfer is marked Fatal or Feedback. Fatal counts as a strike and stays active for ' + j.days + ' days. Feedback is not a strike, but read it so it does not happen again.',
            j.excludedTeams && j.excludedTeams.length ? 'You may assign directly to: ' + j.excludedTeams.join(', ') + '.' : 'There are no teams you can assign to directly right now.'].map(function (t) { return h('div', { class: 'tka-pt' }, [h('i'), h('span', { text: t })]); }))]),
        h('div', { class: 'tka-tiles' }, [
          h('div', { class: 'tka-tile ' + (j.active >= 5 ? 'hot' : '') }, [h('span', { class: 'tka-tile-l', text: 'Your active strikes' }), h('b', { class: 'tka-tile-v', text: String(j.active) }), h('span', { class: 'tka-tile-s', text: j.level ? j.level : 'Clean record' })]),
          h('div', { class: 'tka-tile' }, [h('span', { class: 'tka-tile-l', text: 'Good to go' }), h('b', { class: 'tka-tile-v', text: String(j.good) }), h('span', { class: 'tka-tile-s', text: 'transfers in the last ' + j.days + ' days' })]),
          h('div', { class: 'tka-tile' }, [h('span', { class: 'tka-tile-l', text: 'Next strike means' }), h('b', { class: 'tka-tile-v sm', text: j.nextLevel || '' }), h('span', { class: 'tka-tile-s', text: 'Strikes expire after ' + j.days + ' days' })])]),
        tipsCard,
        h('div', { class: 'tka-card' }, [h('h3', { text: 'The 5 strike policy' }), steps]),
        h('div', { class: 'tka-card' }, [h('h3', { text: 'Your fatals (strikes)' })].concat(j.strikes.length ? j.strikes.map(function (s) {
          return h('div', { class: 'tka-tl' }, [h('span', { class: 'tka-when', text: when(String(s.at).replace(' ', 'T') + 'Z') }), h('span', null, [s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'tka-num', text: '#' + s.ticket }) : '#' + s.ticket, s.subject ? h('span', { class: 'tka-when', text: ' ' + s.subject + ': ' }) : ' ', s.comment || '', h('span', { class: 'tka-when', text: '  expires ' + when(s.expires).split(',')[0] })])]);
        }) : [h('p', { class: 'tka-empty', text: 'No fatals. Keep it that way.' })])),
        h('div', { class: 'tka-card' }, [h('h3', { text: 'Feedback from reviewers (' + (j.feedback || []).length + ')' }), h('p', { class: 'tka-hint', text: 'Not strikes. Each one is something to do differently next time. Last ' + j.days + ' days.' })].concat((j.feedback || []).length ? j.feedback.map(function (s) {
          return h('div', { class: 'tka-tl' }, [h('span', { class: 'tka-when', text: when(String(s.at).replace(' ', 'T') + 'Z') }), h('span', null, [s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'tka-num', text: '#' + s.ticket }) : '#' + s.ticket, s.subject ? h('span', { class: 'tka-when', text: ' ' + s.subject + ': ' }) : ' ', s.comment || ''])]);
        }) : [h('p', { class: 'tka-empty', text: 'No feedback yet.' })])));
    });
  }

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
          h('div', { class: 'tka-rule-main' }, [h('b', { text: s.name || s.email }), h('div', { class: 'tka-meta' }, [h('span', { text: s.email }), h('span', { text: s.review.today + ' reviewed today' }), h('span', { text: s.review.reviewed + ' in 30 days' }), h('span', { text: s.review.invalid + ' marked invalid' }), h('span', { text: s.review.avgMin != null ? 'about ' + s.review.avgMin + ' min per review' : 'no reviews yet' })])]),
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
        h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'SPOC management' }), h('p', { class: 'tka-hint', text: 'SPOCs are existing agents or admins. They review tickets in Pending Review - T1 and record Good to go or Invalid.' })])]),
        h('div', { class: 'tka-card' }, [h('div', { class: 'tka-inline' }, [sel, add])]),
        h('div', { class: 'tka-list' }, cards));
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
