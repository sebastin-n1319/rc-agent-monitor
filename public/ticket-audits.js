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
  var VERDICT_LABEL = { good: 'Approved', invalid: 'Needs rework', ignored: 'Skipped' }, VERDICT_CLS = { good: 'st-approved', invalid: 'st-returned', ignored: 'st-closed' };
  function verdictPill(r) {
    if (r.verdict === 'invalid') return (r.severity || 'fatal') === 'fatal' ? pill('Needs rework: fatal', 'sev-high', 'Counts as a strike') : pill('Needs rework: feedback', 'sev-medium', 'No strike');
    return pill(VERDICT_LABEL[r.verdict] || r.verdict, VERDICT_CLS[r.verdict] || 'cat');
  }
  function tabs() {
    var t = [['review', 'Pending review'], ['history', 'History']];
    if (isAdmin()) t = t.concat([['strikes', 'Strikes'], ['escalations', 'Escalation watch'], ['spocs', 'SPOC management'], ['reviewSettings', 'Settings']]);
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
    ({ review: viewReview, history: viewHistory, strikes: viewStrikes, escalations: viewEscalations, queue: viewQueue, rules: viewRules, spocs: viewSpocs, reviewSettings: viewReviewSettings, updates: viewUpdates, insights: viewInsights })[TA.tab](body);
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
  // Deal context: quick CRM line on the tile, full history when the tile is opened.
  function stageCls(v) { v = String(v || ''); return /churn|lost|offboard/i.test(v) ? 'bad' : /onboard|getting started|setup/i.test(v) ? 'warn' : /csm|won|active/i.test(v) ? 'good' : /upgrade|expan/i.test(v) ? 'info' : 'mute'; }
  function escCls(v) { v = String(v || ''); return /^escalated/i.test(v) ? 'bad' : /de-?escalated/i.test(v) ? 'warn' : /never/i.test(v) ? 'good' : 'mute'; }
  function initials(n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
  function person(role, name, sub) { return h('div', { class: 'tka-df tka-df-p' }, [h('span', { class: 'tka-df-av', 'aria-hidden': 'true', text: initials(name) }), h('span', { class: 'tka-df-t' }, [h('span', { class: 'tka-df-l', text: role }), h('span', { class: 'tka-df-v', text: name }), sub ? h('span', { class: 'tka-st-s', text: sub }) : null])]); }
  function dealLine(d) {
    if (!d) return null;
    if (!(d.account || d.deal || d.stage || d.csm || d.ob || d.escalation)) return null;
    var main = [h('span', { class: 'tka-df-l', text: d.account ? 'Account' : 'Deal' }), h('b', { class: 'tka-deal-name', text: d.account || d.deal })];
    if (d.account && d.deal && d.deal !== d.account) main.push(h('span', { class: 'tka-deal-dl', text: d.deal }));
    var facts = [];
    if (d.stage) facts.push(h('div', { class: 'tka-df' }, [h('span', { class: 'tka-df-l', text: 'Stage' }), h('span', { class: 'tka-chipv ' + stageCls(d.stage), text: d.stage })]));
    if (d.escalation) facts.push(h('div', { class: 'tka-df' }, [h('span', { class: 'tka-df-l', text: 'Escalation' }), h('span', { class: 'tka-chipv ' + escCls(d.escalation), text: d.escalation })]));
    if (d.escalationOwner && d.escalationOwner.owner) facts.push(person(d.escalationOwner.past ? 'Last escalation owner' : 'Escalation owner', d.escalationOwner.owner, d.escalationOwner.since ? (d.escalationOwner.past ? 'de-escalated ' : 'since ') + d.escalationOwner.since : ''));
    if (d.csm) facts.push(person('CSM', d.csm));
    if (d.ob) facts.push(person('OB', d.ob));
    return h('div', { class: 'tka-deal e-' + escCls(d.escalation) }, [h('div', { class: 'tka-deal-main' }, main), facts.length ? h('div', { class: 'tka-deal-facts' }, facts) : null]);
  }
  function dpSec(title, kids, aside, cls) { return h('section', { class: 'tka-dp-sec' + (cls ? ' ' + cls : '') }, [h('div', { class: 'tka-dp-h' }, [h('h4', { text: title }), aside || null])].concat(kids.filter(Boolean))); }
  function dpNote(t) { return h('p', { class: 'tka-when', text: t }); }
  function stateCls(s) { return s === 'open' ? 'sev-high' : s === 'on hold' ? 'sev-medium' : 'st-approved'; }
  function issueItem(i) {
    var tone = /fixed|solved|resolved/i.test(i.status) ? 'st-approved' : /open|unsolved/i.test(i.status) ? 'sev-high' : 'sev-medium';
    return h('div', { class: 'tka-iss-i' }, [
      h('div', { class: 'tka-iss-top' }, [pill(i.status || 'unknown', tone), i.product ? pill(String(i.product).replace(/_/g, ' '), 'dest') : null, i.times ? h('span', { class: 'tka-iss-n', text: i.times + (i.times === 1 ? ' ticket' : ' tickets') }) : null]),
      h('p', { text: i.problem }),
      i.since ? h('span', { class: 'tka-when', text: 'Since ' + i.since }) : null,
      i.cause ? h('p', { class: 'tka-dp-cause', text: 'Likely cause: ' + i.cause }) : null]);
  }
  function statBox(label, value, sub, tone) { return h('div', { class: 'tka-st' + (tone ? ' ' + tone : '') }, [h('span', { class: 'tka-df-l', text: label }), h('b', { class: 'tka-st-v', text: String(value) }), sub ? h('span', { class: 'tka-st-s', text: sub }) : null]); }
  function ticketRow(t) {
    return h('div', { class: 'tka-dp-row' }, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }) : h('b', { text: '#' + t.number }), h('span', { class: 'tka-dp-subj', text: t.subject || '', title: t.subject || '' }), pill(t.status, stateCls(t.state))]);
  }
  function dealSkeleton(msg) {
    return [h('p', { class: 'tka-when tka-dp-wait', role: 'status', text: msg }),
      h('div', { class: 'tka-dp-stats' }, [0, 1, 2, 3, 4, 5].map(function () { return h('div', { class: 'tka-skel', style: 'height:62px' }); })),
      h('div', { class: 'tka-dp-grid' }, [h('div', { class: 'tka-skel', style: 'height:170px' }), h('div', { class: 'tka-skel', style: 'height:170px' })])];
  }
  // Long analysis summaries stay readable: a few lines, then "Show the full summary".
  function leadBlock(text) {
    var p = h('p', { class: 'tka-dp-lead clamp', text: text });
    if (text.length < 420 && text.split('\n').length < 7) { p.classList.remove('clamp'); return p; }
    var b = h('button', { type: 'button', class: 'tka-link', text: 'Show the full summary', 'aria-expanded': 'false' });
    b.addEventListener('click', function () { var open = p.classList.toggle('clamp') === false; b.textContent = open ? 'Show less' : 'Show the full summary'; b.setAttribute('aria-expanded', String(open)); });
    return h('div', { class: 'tka-dp-leadbox' }, [p, b]);
  }
  function renderDeal(box, d, opts) {
    if (!d.available) { box.replaceChildren(dpNote(d.note || 'No deal context for this ticket.')); return; }
    var an = d.analysis || {}, dv = an.derived || { issues: [], modules: [] };
    var live = (d.journey || []).filter(function (t) { return t.state !== 'closed'; });
    var now = Date.now(), dated = (d.journey || []).filter(function (t) { return t.created && !isNaN(Date.parse(t.created)); });
    var recent = dated.filter(function (t) { return now - Date.parse(t.created) < 14 * 864e5; }).length;
    var first = dated.length ? new Date(Math.min.apply(null, dated.map(function (t) { return Date.parse(t.created); }))) : null;
    var c = d.counts || { open: 0, 'on hold': 0, closed: 0 };
    // Summary numbers first, so the reviewer reads the deal at a glance.
    var stats = [statBox('Tickets', d.ticketsShown || dated.length, first ? 'since ' + first.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''),
      statBox('Open', c.open, live.length ? 'in Zoho Desk now' : 'none open', c.open ? 'bad' : ''),
      statBox('On hold', c['on hold'], '', c['on hold'] ? 'warn' : ''),
      statBox('Closed', c.closed, '', 'good'),
      statBox('Last 14 days', recent, recent >= 3 ? 'busy, check the pattern' : 'new tickets', recent >= 3 ? 'bad' : ''),
      statBox('FCR', d.fcr.pct == null ? 'n/a' : d.fcr.pct + '%', d.fcr.closed ? d.fcr.achieved + ' of ' + d.fcr.closed + ' first contact' : 'no data', d.fcr.pct == null ? '' : d.fcr.pct >= 70 ? 'good' : 'warn'),
      statBox('CSAT', d.csat.pct == null ? 'n/a' : d.csat.pct + '%', d.csat.total ? d.csat.good + ' good, ' + d.csat.bad + ' bad' : 'no surveys', d.csat.pct == null ? '' : d.csat.pct >= 80 ? 'good' : 'warn')];
    if (an.health) stats.unshift(statBox('Account health', an.health, String(an.healthWhy || '').split(';').pop().trim(), /good|healthy|green|strong|stable/i.test(an.health) ? 'good' : /risk|poor|bad|red|critical|churn/i.test(an.health) ? 'bad' : 'warn'));
    // Main column: journey and issue history. Side column: what is open now and who worked it.
    var issues = an.available ? (an.issues || []) : dv.issues;
    var issueSec = dpSec('Issue history', [
      an.available && an.headline ? leadBlock(an.headline) : null,
      an.available && an.trigger ? h('p', { class: 'tka-dp-cause', text: 'What triggered it: ' + an.trigger }) : null,
      an.available ? null : dpNote('Built from this deal\'s ticket subjects. ' + (an.note || 'The written account analysis is not available to this tool yet.')),
      issues.length ? h('div', { class: 'tka-iss' }, issues.map(issueItem)) : dpNote(an.available ? 'No issues recorded in the account analysis.' : 'No clear pattern in the ticket subjects.')], issues.length ? h('span', { class: 'tka-dp-cnt', text: String(issues.length) }) : null);
    var unsolved = (an.available && (an.open || []).length ? an.open.map(function (o) { return h('div', { class: 'tka-dp-item' }, [h('p', { text: o.item }), o.note ? h('span', { class: 'tka-when', text: o.note }) : null]); }) : [])
      .concat(live.slice(0, 8).map(ticketRow));
    var mods = (an.modules || []).length ? an.modules : dv.modules;
    var side = [dpSec('Unsolved queries', unsolved.length ? unsolved : [dpNote('Nothing unsolved on record.')], unsolved.length ? h('span', { class: 'tka-dp-cnt bad', text: String(unsolved.length) }) : null),
      dpSec('Usually reported modules', mods.length ? [h('div', { class: 'tka-mchips' }, mods.map(function (m) { return h('span', { class: 'tka-mod' }, [h('span', { text: m.name }), m.n > 1 ? h('b', { text: String(m.n) }) : null]); }))] : [dpNote('No module pattern on record.')]),
      dpSec('Agents who worked tickets', (d.owners || []).length ? [h('div', { class: 'tka-mchips' }, d.owners.map(function (o) { return h('span', { class: 'tka-mod' }, [h('span', { class: 'tka-df-av sm', 'aria-hidden': 'true', text: initials(o.name) }), h('span', { text: o.name }), h('b', { text: String(o.tickets) })]); }))].concat((an.agents || []).length ? [h('p', { class: 'tka-when', text: 'Replying on tickets: ' + an.agents.map(function (a) { return a.name + ' (' + a.messages + ')'; }).join(', ') })] : []) : [dpNote('No ticket owners on record.')])];
    if ((d.reviews || []).length) side.push(dpSec('Earlier transfer reviews', d.reviews.map(function (x) { return h('div', { class: 'tka-dp-row' }, [h('b', { text: '#' + x.number }), h('span', { class: 'tka-dp-subj', text: (x.subject || '') + (x.team ? ' (to ' + x.team + ')' : ''), title: x.subject || '' }), pill(x.verdict === 'invalid' ? 'Needs rework' : x.verdict === 'good' ? 'Approved' : x.state === 'waiting' ? 'Waiting' : 'No verdict', x.verdict === 'invalid' ? 'sev-high' : x.verdict === 'good' ? 'st-approved' : 'sev-medium')]); })));
    var findSec = an.available && (an.findings || []).length ? dpSec('Serious findings', [h('div', { class: 'tka-find' }, an.findings.map(function (f) {
      return h('div', { class: 'tka-find-i' }, [h('div', { class: 'tka-iss-top' }, [pill('High', 'sev-high'), f.category ? pill(f.category, '') : null, f.product ? pill(f.product, 'dest') : null]), h('p', { text: f.claim })]);
    }))].concat(an.findingsTotal > an.findings.length ? [dpNote('Showing ' + an.findings.length + ' of the high severity findings. The analysis holds ' + an.findingsTotal + ' findings in total.')] : []), h('span', { class: 'tka-dp-cnt bad', text: String(an.findings.length) })) : null;
    var kids = opts && opts.wide
      ? [h('div', { class: 'tka-dp-stats' }, stats), journeySec(d), issueSec, findSec, h('div', { class: 'tka-dp-trio' }, side)].filter(Boolean)
      : [h('div', { class: 'tka-dp-stats' }, stats),
        h('div', { class: 'tka-dp-grid' }, [h('div', { class: 'tka-dp-col' }, [journeySec(d), issueSec, findSec].filter(Boolean)), h('div', { class: 'tka-dp-col' }, side)])];
    if (an.available && an.savedAt) kids.push(dpNote('Account analysis from ' + when(an.savedAt) + '. Tickets are live from Zoho Desk.'));
    box.replaceChildren.apply(box, kids);
    Array.prototype.forEach.call(box.querySelectorAll('.tka-st, .tka-dp-sec'), function (el, n) { el.style.setProperty('--i', n); });
  }
  // Support journey: a compact timeline drawn at the real pixel width (text never scales up), one mark per ticket.
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function journeySec(d) {
    var rows = (d.journey || []).filter(function (t) { return t.created && !isNaN(Date.parse(t.created)); });
    var title = 'Support journey';
    if (!rows.length) return dpSec(title, [dpNote('No other tickets on this deal.')]);
    var now = Date.now(), t0 = Math.min.apply(null, rows.map(function (t) { return Date.parse(t.created); }));
    t0 = Math.min(t0, now - 30 * 864e5);
    var COL = { open: 'var(--tka-red)', 'on hold': 'var(--tka-amber)', closed: 'var(--tka-green)' };
    var sorted = rows.slice().sort(function (a, b) { return Date.parse(a.created) - Date.parse(b.created); });
    var wrap = h('div', { class: 'tka-jr-wrap' });
    var tip = h('div', { class: 'tka-jr-tip', role: 'tooltip', 'aria-hidden': 'true' });
    var painted = false, lastW = 0;
    function showTip(t, px, py, W, below) {
      tip.replaceChildren(h('b', { text: '#' + t.number + ', ' + t.status }), h('span', { text: t.subject || '' }), h('span', { class: 'tka-when', text: [when(t.created), t.agent, t.channel].filter(Boolean).join(', ') + (t.url ? '. Click to open.' : '') }));
      tip.classList.toggle('below', !!below);
      tip.style.left = Math.max(130, Math.min(px, W - 130)) + 'px'; tip.style.top = (below ? py + 12 : py - 10) + 'px'; tip.classList.add('on');
    }
    function hideTip() { tip.classList.remove('on'); }
    function draw(W) {
      var H = 116, L = 62, R = 14, BH = 24, lanes = { open: 20, 'on hold': 50, closed: 80 }, AX = H - 6;
      var x = function (ms) { return L + (W - L - R) * ((ms - t0) / (now - t0)); };
      var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group', class: 'tka-jr' + (painted ? '' : ' anim'), 'aria-label': 'Support journey: ' + d.counts.open + ' open, ' + d.counts['on hold'] + ' on hold, ' + d.counts.closed + ' closed' });
      Object.keys(lanes).forEach(function (k) {
        svg.appendChild(svgEl('rect', { x: L, y: lanes[k] - BH / 2, width: W - L - R, height: BH, rx: 7, class: 'tka-jr-band ' + k.replace(' ', '') }));
        var tx = svgEl('text', { x: L - 10, y: lanes[k] + 4, 'text-anchor': 'end', class: 'tka-jr-lab' }); tx.textContent = k === 'on hold' ? 'On hold' : k.charAt(0).toUpperCase() + k.slice(1); svg.appendChild(tx);
      });
      var todayX = x(now), lastLab = -999, dt = new Date(t0); dt = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
      for (var first = true; dt.getTime() < now; dt = new Date(dt.getFullYear(), dt.getMonth() + 1, 1)) {
        var gx = x(dt.getTime()); if (gx < L + 6 || gx > W - R - 6) continue;
        svg.appendChild(svgEl('line', { x1: gx, x2: gx, y1: 6, y2: lanes.closed + BH / 2, class: 'tka-jr-grid' }));
        if (gx - lastLab >= 58 && todayX - gx > 64) {
          var mt = svgEl('text', { x: gx, y: AX, 'text-anchor': 'middle', class: 'tka-jr-ax' });
          mt.textContent = dt.toLocaleDateString('en-US', { month: 'short' }) + (first || dt.getMonth() === 0 ? " '" + String(dt.getFullYear()).slice(2) : '');
          svg.appendChild(mt); lastLab = gx; first = false;
        }
      }
      svg.appendChild(svgEl('line', { x1: todayX, x2: todayX, y1: 4, y2: lanes.closed + BH / 2 + 2, class: 'tka-jr-today' }));
      var td = svgEl('text', { x: todayX, y: AX, 'text-anchor': 'end', class: 'tka-jr-ax today' }); td.textContent = 'Today'; svg.appendChild(td);
      // Spread marks that fall on nearly the same day across three rows of their lane, so they do not pile up.
      var placed = { open: [], 'on hold': [], closed: [] }, liveMarks = [];
      sorted.forEach(function (t) {
        var st = lanes[t.state] ? t.state : 'closed', cx = x(Date.parse(t.created)), base = lanes[st], cy = base;
        var tries = [0, -6, 6];
        for (var k = 0; k < tries.length; k++) {
          var yy = base + tries[k];
          if (!placed[st].some(function (p) { return Math.abs(p.x - cx) < 9 && Math.abs(p.y - yy) < 9; })) { cy = yy; break; }
        }
        placed[st].push({ x: cx, y: cy });
        var wrapEl = t.url ? svgEl('a', { href: t.url, target: '_blank', rel: 'noopener', class: 'tka-jr-pt link', 'aria-label': '#' + t.number + ', ' + t.status + ', ' + (t.subject || '') + '. Open in Zoho Desk' }) : svgEl('g', { class: 'tka-jr-pt', tabindex: '0', 'aria-label': '#' + t.number + ', ' + t.status + ', ' + (t.subject || '') });
        wrapEl.appendChild(svgEl('circle', { cx: cx, cy: cy, r: 10, fill: 'transparent' }));
        var m = st === 'closed' ? svgEl('circle', { cx: cx, cy: cy, r: 4.5 })
          : st === 'on hold' ? svgEl('rect', { x: cx - 4.5, y: cy - 4.5, width: 9, height: 9, transform: 'rotate(45 ' + cx + ' ' + cy + ')' })
          : svgEl('rect', { x: cx - 5, y: cy - 5, width: 10, height: 10, rx: 2 });
        m.setAttribute('fill', COL[st]); m.setAttribute('class', 'tka-jr-mk'); m.setAttribute('style', '--d:' + Math.round((cx - L) / (W - L) * 420) + 'ms');
        wrapEl.appendChild(m);
        var on = function () { showTip(t, cx, cy, W, st === 'open'); }; wrapEl.addEventListener('pointerenter', on); wrapEl.addEventListener('focus', on);
        wrapEl.addEventListener('pointerleave', hideTip); wrapEl.addEventListener('blur', hideTip);
        svg.appendChild(wrapEl);
        if (st !== 'closed') liveMarks.push({ t: t, x: cx, y: base, el: wrapEl });
      });
      // Labels for open and on hold tickets sit inside their lane, to the left of the mark, chained so they never overlap.
      ['open', 'on hold'].forEach(function (st) {
        var edge = W;
        liveMarks.filter(function (p) { return p.t.state === st; }).sort(function (a, b) { return b.x - a.x; }).forEach(function (p) {
          var txt = '#' + p.t.number, w = txt.length * 6.6, right = Math.min(p.x - 9, edge - 8);
          if (right - w < L + 6) return;
          var lb = svgEl('text', { x: right, y: p.y + 4, 'text-anchor': 'end', class: 'tka-jr-hl' }); lb.textContent = txt; p.el.appendChild(lb);
          edge = right - w;
        });
      });
      return svg;
    }
    function paint() {
      var W = Math.round(wrap.clientWidth || 0); if (W < 40) return;
      W = Math.max(380, W); if (painted && Math.abs(W - lastW) < 6) return;
      lastW = W; hideTip(); wrap.replaceChildren(draw(W), tip); painted = true;
    }
    if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (painted && !wrap.isConnected) { ro.disconnect(); return; } paint(); }); ro.observe(wrap); }
    else setTimeout(paint, 0);
    var key = h('div', { class: 'tka-jr-key', 'aria-hidden': 'true' }, [h('span', null, [h('i', { class: 'o' }), 'Open']), h('span', null, [h('i', { class: 'hd' }), 'On hold']), h('span', null, [h('i', { class: 'c' }), 'Closed']), h('span', { class: 'tka-when', text: 'Hover a mark for details. Click to open it in Zoho Desk.' })]);
    var det = h('details', { class: 'tka-dp-det' }, [h('summary', { text: 'All tickets (' + d.ticketsShown + ')' }), h('div', { class: 'tka-dp-list' }, d.journey.map(function (t) {
      return h('div', { class: 'tka-dp-row wide' }, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }) : h('b', { text: '#' + t.number }), h('span', { class: 'tka-dp-subj', text: t.subject || '', title: t.subject || '' }), pill(t.status, stateCls(t.state)), h('span', { class: 'tka-when', text: [t.channel, t.created ? when(t.created) : '', t.agent].filter(Boolean).join(', ') })]);
    }))]);
    return dpSec(title, [key, wrap, det], h('span', { class: 'tka-when', text: d.counts.open + ' open, ' + d.counts['on hold'] + ' on hold, ' + d.counts.closed + ' closed' }), 'tka-dp-jr');
  }
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
        tileBox('Reviewed today', (j.today.good || 0) + (j.today.invalid || 0), (j.today.good || 0) + ' approved, ' + (j.today.invalid || 0) + ' need rework'),
        tileBox('Average review time', j.today.avgMin == null ? 'none' : j.today.avgMin + ' min', 'today')]);
      var bar = h('div', { class: 'tka-inline between' }, [
        h('p', { class: 'tka-hint', text: 'Tickets in "' + (st.statusName || 'Pending Review - T1') + '". Review each within ' + buf + ' minutes (counted between ' + (st.startHour == null ? 7 : st.startHour) + ':00 and ' + (st.endHour == null ? 19 : st.endHour) + ':00 Central): move it to the right person in Zoho Desk, then record your verdict here.' + (j.lastPollAt ? ' Checked ' + ago(j.lastPollAt) + '.' : '') }),
        h('div', { class: 'tka-inline' }, [btn('Check Zoho now', 'sm', function (ev) { busy(ev.currentTarget, true, 'Checking...'); load(true); }),
          isAdmin() ? btn('Settings', 'ghost sm', function () { TA.tab = 'reviewSettings'; render(); }) : null])]);
      var kids = [tiles, bar];
      if (j.lastPollError) kids.push(h('div', { class: 'tka-note', text: 'Could not read Zoho: ' + j.lastPollError }));
      kids.push(h('div', { class: 'tka-sech' }, [h('h3', { text: 'Waiting for review' }), h('span', { class: 'tka-sech-n' + (over ? ' hot' : ''), text: String(j.waiting.length) })]));
      if (!j.waiting.length) kids.push(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'Nothing waiting' }), h('p', { text: 'When a T1 agent sets a ticket to ' + (st.statusName || 'Pending Review - T1') + ', it shows here within a minute.' })]));
      if (j.waiting.length) kids.push(h('div', { class: 'tka-cards' }, j.waiting.map(function (r) { return reviewCard(r, buf, j.me); })));
      if (j.moved.length) {
        kids.push(h('div', { class: 'tka-sech' }, [h('h3', { text: 'Moved, verdict missing' }), h('span', { class: 'tka-sech-n warn', text: String(j.moved.length) }), h('p', { class: 'tka-hint', text: 'These left the review status, or were moved by a T1 agent without it ("Skipped review"). Record a verdict so the agent gets feedback.' })]));
        kids.push(movedList(j.moved, buf, j.me));
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
    // Message to the agent: drafted from the ticket, edited by the reviewer, posted to the space only when they click Send.
    function msgBox(r, kind, comment) {
      var ta = h('textarea', { class: 'tka-note-in', rows: '6', 'aria-label': 'Message to the agent', placeholder: 'Drafting a message...' });
      var status = h('span', { class: 'tka-when' });
      var send = btn('Send to space', 'primary sm', function () {
        var label = send.textContent; busy(send, true, 'Sending...');
        api('/api/review/' + r.id + '/message', { text: ta.value }).then(function (x) {
          busy(send, false, label);
          if (!x.success) { status.textContent = ''; return toast(x.error || 'Could not send', 'error'); }
          status.textContent = 'Sent to the space just now.'; send.textContent = 'Send again'; toast('Message sent to the space', 'success');
        }).catch(function () { busy(send, false, label); toast('Could not send', 'error'); });
      });
      send.disabled = true;
      var again = btn('Redraft', 'ghost sm', function () { draft(); });
      function draft() {
        ta.disabled = true; send.disabled = true; status.textContent = 'Drafting...';
        api('/api/review/' + r.id + '/message-draft', { mode: kind === 'invalid' ? 'invalid' : 'good', comment: comment.value }).then(function (a) {
          ta.disabled = false;
          if (!a.success) { status.textContent = a.error || 'Could not draft a message'; return; }
          ta.value = a.text || ''; send.disabled = false;
          status.textContent = (a.ai && a.instruction ? 'AI drafted this from the ticket. ' : 'AI is not set up or had nothing to add, so write the instruction. ') + 'Check it, then click Send. It posts in the reviewer space and tags the agent.' + (a.sentAt ? ' Already sent once for this ticket.' : '');
        }).catch(function () { ta.disabled = false; status.textContent = 'Could not draft a message'; });
      }
      draft();
      return h('div', { class: 'tka-msg' }, [h('b', { text: 'Message to the agent' }), status, ta, h('div', { class: 'tka-actions' }, [send, again])]);
    }
    // Moved tickets as a compact list: one line per ticket, a search box and agent chips with counts, details open in place.
    function movedList(rows, buf, me) {
      var q = h('input', { class: 'tka-input tka-lf-q', type: 'search', placeholder: 'Search ticket #, subject, agent, destination', 'aria-label': 'Search moved tickets', value: TA.mvQ || '' });
      var chips = h('div', { class: 'tka-lf-chips', role: 'group', 'aria-label': 'Filter by agent' });
      var count = h('span', { class: 'tka-when tka-lf-n' });
      var head = h('div', { class: 'tka-lr-cols', 'aria-hidden': 'true' }, ['Ticket', 'Agent', 'Channel', 'Status', 'Now with', 'Decision'].map(function (t) { return h('span', { text: t }); }));
      var list = h('div', { class: 'tka-lr-list' });
      var byAgent = {}; rows.forEach(function (r) { var n = nameOf(r.agent_email, r.agent_name); byAgent[n] = (byAgent[n] || 0) + 1; });
      var names = Object.keys(byAgent).sort(function (a, b) { return byAgent[b] - byAgent[a]; });
      if (TA.mvAgent && !byAgent[TA.mvAgent]) TA.mvAgent = '';
      function match(r) {
        var n = nameOf(r.agent_email, r.agent_name);
        if (TA.mvAgent && n !== TA.mvAgent) return false;
        var t = (TA.mvQ || '').trim().toLowerCase();
        return !t || [r.ticket_number, r.subject, n, r.to_agent, r.to_team, r.channel].join(' ').toLowerCase().indexOf(t) > -1;
      }
      function paintChips() {
        chips.replaceChildren.apply(chips, [['', 'All', rows.length]].concat(names.map(function (n) { return [n, n, byAgent[n]]; })).map(function (c) {
          var on = (TA.mvAgent || '') === c[0];
          return h('button', { type: 'button', class: 'tka-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: function () { TA.mvAgent = c[0]; paintChips(); fill(); } }, [h('span', { text: c[1] }), h('b', { text: String(c[2]) })]);
        }));
      }
      function fill() {
        var shown = rows.filter(match);
        count.textContent = shown.length === rows.length ? '' : shown.length + ' of ' + rows.length + ' shown';
        if (!shown.length) { list.replaceChildren(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'No tickets match' }), h('p', { text: 'Clear the search or pick All.' })])); return; }
        list.replaceChildren.apply(list, shown.map(function (r) { return reviewCard(r, buf, me, true); }));
      }
      var t = null;
      q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { TA.mvQ = q.value; fill(); }, 120); });
      paintChips(); fill();
      return h('div', { class: 'tka-lr' }, [h('div', { class: 'tka-lf' }, [q, count]), chips, h('div', { class: 'tka-lr-box' }, [head, list])]);
    }
    function reviewCard(r, buf, me, asRow) {
      var waiting = r.state === 'waiting';
      var cls = waiting ? (r.minutes >= buf ? 'sev-high' : r.minutes >= buf - 5 ? 'sev-medium' : 'st-approved') : 'sev-low';
      var own = r.agent_email && me && r.agent_email === me;
      var form = h('div', { class: 'tka-rv-form' });
      function openForm(kind) {
        var c = h('textarea', { class: 'tka-note-in', rows: '2', maxlength: '800', placeholder: kind === 'invalid' ? 'What did the agent miss? The agent sees this.' : kind === 'ignored' ? 'Why skip it? For example: set by mistake and moved back to Open' : 'Optional note', 'aria-label': 'Comments' });
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
        var save = btn(kind === 'invalid' ? 'Choose Fatal or Feedback' : kind === 'ignored' ? 'Skip this one' : 'Save as approved', kind === 'invalid' ? 'danger' : 'primary', function () {
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
          kind === 'good' ? who : null, ai, sevBox, c, kind === 'ignored' ? null : msgBox(r, kind, c), h('div', { class: 'tka-actions' }, [save, btn('Cancel', 'ghost sm', function () { form.replaceChildren(); })])].filter(Boolean));
      }
      function vb(cls, icon, label, hint, kind) { return h('button', { type: 'button', class: 'tka-vb ' + cls, title: hint, onclick: function () { openForm(kind); } }, [h('span', { class: 'tka-vb-i', 'aria-hidden': 'true', text: icon }), h('span', { text: label })]); }
      var side = own ? [h('span', { class: 'tka-when', text: 'Your own ticket' })] : [];
      var vrow = own ? null : h('div', { class: 'tka-vrow', role: 'group', 'aria-label': 'Review decision' }, [vb('ok', '\u2713', 'Approved', 'The transfer was right', 'good'), vb('fix', '\u21BA', 'Needs rework', 'Send it back to the agent', 'invalid')].concat(waiting ? [] : [vb('skip', '\u2192', 'Skip', 'Not a transfer, no strike', 'ignored')]));
      var dealBox = h('div', { class: 'tka-dp' });
      var shell = h('div', { class: 'tka-dp-shell' }, [h('div', { class: 'tka-dp-clip' }, [dealBox])]);
      shell.inert = true;
      var isOpen = false, art = null;
      var lineHost = h('div', { class: 'tka-lr-line' }, [dealLine(r.deal)]);
      var dealBtn = null;
      function toggleDeal() {
        var open = isOpen = !isOpen;
        if (open) { art.classList.add('deal-open'); shell.inert = false; requestAnimationFrame(function () { requestAnimationFrame(function () { if (isOpen) shell.classList.add('open'); }); }); }
        else {
          shell.classList.remove('open'); shell.inert = true;
          var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          setTimeout(function () { if (!isOpen) art.classList.remove('deal-open'); }, calm ? 0 : 300);
        }
        TA.dealOpen = TA.dealOpen || {}; if (open) TA.dealOpen[r.id] = true; else delete TA.dealOpen[r.id];
        if (dealBtn) { dealBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); dealBtn.querySelector('.tka-dealbtn-t').textContent = open ? (asRow ? 'Hide' : 'Hide deal history') : (asRow ? 'Deal history' : 'Deal history'); }
        if (open && !dealBox.dataset.loaded) loadDeal(0);
      }
      function loadDeal(attempt) {
        dealBox.dataset.loaded = '1';
        dealBox.replaceChildren.apply(dealBox, dealSkeleton(attempt ? 'AditKB is busy, trying again...' : 'Loading deal history...'));
        api('/api/review/' + r.id + '/deal').then(function (x) {
          if (!x.success) { dealBox.dataset.loaded = ''; dealBox.replaceChildren(h('p', { class: 'tka-when', text: x.error || 'Could not load deal history' })); return; }
          if (x.busy) {
            if (attempt < 2) { setTimeout(function () { if (isOpen) loadDeal(attempt + 1); }, 3000 + attempt * 2500); return; }
            dealBox.dataset.loaded = '';
            dealBox.replaceChildren(h('p', { class: 'tka-when', text: x.note }), btn('Try again', 'sm', function () { loadDeal(0); }));
            return;
          }
          if (!r.deal && x.quick) lineHost.replaceChildren(dealLine(x.quick));
          renderDeal(dealBox, x);
        }).catch(function () { dealBox.dataset.loaded = ''; dealBox.replaceChildren(h('p', { class: 'tka-when', text: 'Could not load deal history' }), btn('Try again', 'sm', function () { loadDeal(0); })); });
      }
      var showDeal = waiting || r.state === 'moved';
      if (showDeal) { dealBtn = btn('', 'tka-dealbtn', function (ev) { ev.stopPropagation(); toggleDeal(); }, { 'aria-expanded': 'false' }); dealBtn.replaceChildren(h('span', { class: 'tka-dealbtn-t', text: 'Deal history' }), h('span', { class: 'tka-chev', 'aria-hidden': 'true', text: '\u25BE' })); }
      TA.seen = TA.seen || {}; var fresh = !TA.seen[r.id]; TA.seen[r.id] = 1;
      var numEl = r.web_url ? h('a', { class: 'tka-num', href: r.web_url, target: '_blank', rel: 'noopener', text: '#' + r.ticket_number }) : h('b', { class: 'tka-num', text: '#' + r.ticket_number });
      var destTxt = [r.to_agent, r.to_team ? '(' + r.to_team + ')' : ''].filter(Boolean).join(' ');
      if (asRow) {
        art = h('article', { class: 'tka-row lr' + (showDeal ? ' tka-clickable' : '') + (fresh ? ' tka-in' : '') }, [
          h('div', { class: 'tka-lr-head' }, [
            h('div', { class: 'tka-lr-t' }, [numEl, h('span', { class: 'tka-sub', text: r.subject || '', title: r.subject || null })]),
            h('span', { class: 'tka-lr-ag', text: nameOf(r.agent_email, r.agent_name) }),
            h('span', { class: 'tka-lr-ch' }, [r.channel ? pill(r.channel, 'dest') : null]),
            h('span', { class: 'tka-lr-st' }, [pill(r.source === 'bypass' ? 'Skipped review' : 'Left status', r.source === 'bypass' ? 'sev-high' : 'sev-medium')]),
            h('span', { class: 'tka-lr-to', title: destTxt || null, text: destTxt || 'Not recorded' }),
            h('div', { class: 'tka-lr-act' }, [dealBtn, vrow])]),
          showDeal ? lineHost : null, shell, form].filter(Boolean));
        if (showDeal && TA.dealOpen && TA.dealOpen[r.id]) setTimeout(toggleDeal, 0);
        if (showDeal) art.addEventListener('click', function (ev) { if (ev.target.closest('a, button, input, textarea, select, label, .tka-rv-form, .tka-dp-shell, .tka-deal')) return; toggleDeal(); });
        return art;
      }
      art = h('article', { class: 'tka-row' + (waiting && r.minutes >= buf ? ' hot' : '') + (showDeal ? ' tka-clickable' : '') + (fresh ? ' tka-in' : '') }, [
        h('div', { class: 'tka-row-main' }, [
          h('div', { class: 'tka-row-top' }, [r.web_url ? h('a', { class: 'tka-num', href: r.web_url, target: '_blank', rel: 'noopener', text: '#' + r.ticket_number }) : h('b', { class: 'tka-num', text: '#' + r.ticket_number }), h('span', { class: 'tka-sub', text: r.subject || '', title: r.subject || null })]),
          h('div', { class: 'tka-meta' }, [h('span', { text: nameOf(r.agent_email, r.agent_name) }), r.channel ? pill(r.channel, 'dest') : null,
            waiting ? pill('Waiting ' + mmLabel(r.minutes), cls) : pill(r.source === 'bypass' ? 'Skipped review' : 'Left review status', r.source === 'bypass' ? 'sev-high' : 'sev-medium'),
            r.to_team || r.to_agent ? h('span', { class: 'tka-when', text: 'Now with ' + [r.to_agent, r.to_team ? '(' + r.to_team + ')' : ''].filter(Boolean).join(' ') }) : null,
            r.breach_count ? h('span', { class: 'tka-when', text: 'Escalated ' + r.breach_count + 'x' }) : null]),
          showDeal ? lineHost : null,
          (dealBtn || vrow) ? h('div', { class: 'tka-acts' }, [dealBtn, vrow]) : null,
          shell,
          form]),
        side.length ? h('div', { class: 'tka-row-side' }, side) : null].filter(Boolean));
      if (showDeal && TA.dealOpen && TA.dealOpen[r.id]) setTimeout(toggleDeal, 0);
      if (showDeal) art.addEventListener('click', function (ev) { if (ev.target.closest('a, button, input, textarea, select, label, .tka-rv-form, .tka-dp-shell')) return; toggleDeal(); });
      return art;
    }
    load(false);
    clearInterval(TA._rvTimer);
    TA._rvTimer = setInterval(function () { if (TA.tab === 'review' && !TA.auditId && document.body.contains(host) && !host.querySelector('.tka-rv-form textarea') && !host.querySelector('.tka-lf-q:focus') && !host.querySelector('.tka-row.deal-open')) load(false); else if (!document.body.contains(host)) clearInterval(TA._rvTimer); }, 30000);
  }
  function parseSpaces(t) { var o = {}; String(t || '').split(/\n+/).forEach(function (l) { var i = l.indexOf('='); if (i < 1) return; var k = l.slice(0, i).trim(), v = l.slice(i + 1).trim(); if (k && v) o[k] = v; }); return o; }
  // ── Review settings: a page of its own, admins only ────────────────────────────
  function viewReviewSettings(body) {
    body.appendChild(h('p', { class: 'tka-empty', text: 'Loading settings...' }));
    Promise.all([api('/api/review/settings'), api('/api/alert-hub/status').catch(function () { return { success: false }; })]).then(function (res) {
      var j = res[0], hub = res[1];
      if (!j.success) { body.replaceChildren(h('div', { class: 'tka-note', text: j.error || 'Could not load settings' })); return; }
      var st = j.settings, teams = Array.from(new Set(j.teams || [])).sort(function (a, b) { return a.localeCompare(b); });
      var picked = {}; (st.excludedTeams || []).forEach(function (t) { picked[t] = true; });
      var dirty = false, saveBar;
      function touch() { if (!dirty) { dirty = true; if (saveBar) saveBar.classList.add('dirty'); } }
      function field(label, input, hint) { return h('label', { class: 'tka-fld' }, [h('span', { class: 'tka-fld-l', text: label }), input, hint ? h('span', { class: 'tka-fld-h', text: hint }) : null]); }
      function num(v, min, max, aria) { var e = h('input', { class: 'tka-input', type: 'number', min: String(min), max: String(max), value: String(v), 'aria-label': aria }); e.addEventListener('input', touch); return e; }
      function toggle(label, checked, hint) { var cb = h('input', { type: 'checkbox' }); cb.checked = !!checked; cb.addEventListener('change', touch); return { cb: cb, el: h('label', { class: 'tka-sw' }, [cb, h('span', { class: 'tka-sw-t' }, [h('b', { text: label }), hint ? h('span', { text: hint }) : null])]) }; }
      function card(title, hint, kids) { return h('section', { class: 'tka-set' }, [h('h3', { text: title }), hint ? h('p', { class: 'tka-hint', text: hint }) : null].concat(kids)); }

      // 1. Review window and reminders
      var buf = num(st.bufferMin, 1, 240, 'Review within minutes'), rep = num(st.repeatMin || st.bufferMin, 1, 480, 'Remind every minutes'), mx = num(st.maxReminders || 0, 0, 50, 'Stop after reminders');
      var hrFrom = num(st.startHour == null ? 7 : st.startHour, 0, 23, 'Review hours start'), hrTo = num(st.endHour == null ? 19 : st.endHour, 1, 24, 'Review hours end');
      var esc = h('input', { class: 'tka-input', value: (st.escalateEmails || []).join(', '), 'aria-label': 'People tagged when the review window passes', placeholder: 'name@adit.com, name@adit.com' }); esc.addEventListener('input', touch);
      var stName = h('input', { class: 'tka-input', value: st.statusName, 'aria-label': 'Zoho status name' }); stName.addEventListener('input', touch);
      var on = toggle('Review is on', st.enabled !== false, 'Watch the Zoho status and list tickets for review'), alOn = toggle('Idle review alerts', st.alertsOn !== false, 'Tag the people below in the review alerts space');
      var c1 = card('Review window and reminders', 'How long a ticket may wait, who is tagged when it waits too long, and the hours the clock runs.', [
        h('div', { class: 'tka-fgrid' }, [field('Review within', buf, 'minutes before the first alert'), field('Remind every', rep, 'minutes'), field('Stop after', mx, 'reminders (0 means no limit)'),
          field('Review hours start', hrFrom, 'Central time, 24 hour clock'), field('Review hours end', hrTo, '7 to 19 is 7 AM to 7 PM'), field('Zoho status', stName, 'the status agents set to request review')]),
        field('Tag these people', esc, 'comma separated emails, tagged in the review alerts space'),
        h('div', { class: 'tka-swrow' }, [on.el, alOn.el])]);

      // 2. Webhooks
      var chans = {}; ((hub && hub.channels) || []).forEach(function (c) { chans[c.key] = c; });
      function hookRow(key, title, desc) {
        var c = chans[key] || {}, inp = h('input', { class: 'tka-input', type: 'url', autocomplete: 'off', placeholder: c.masked || 'Paste a Google Chat webhook URL', 'aria-label': title + ' webhook URL' });
        var src = h('span', { class: 'tka-pill ' + (c.source === 'app' ? 'st-approved' : 'sev-medium'), text: c.source === 'app' ? 'Connected' : (c.source === 'liveops' ? 'Using the Live ops webhook' : 'Not connected') });
        function save(clear) { var body2 = { key: key }; if (clear) body2.clearWebhook = true; else if (inp.value.trim()) body2.webhookUrl = inp.value.trim(); else return toast('Paste a webhook URL first', 'error'); api('/api/alert-hub/channel', body2).then(function (r) { toast(r.success ? (clear ? 'Webhook removed' : 'Webhook saved') : (r.error || 'Could not save'), r.success ? 'success' : 'error'); if (r.success) render(); }); }
        return h('div', { class: 'tka-hook' }, [h('div', { class: 'tka-hook-h' }, [h('b', { text: title }), src]), h('p', { class: 'tka-fld-h', text: desc }),
          h('div', { class: 'tka-hook-r' }, [inp, btn('Save', 'primary sm', function () { save(false); }), btn('Send test', 'sm', function (ev) { var b = ev.currentTarget; busy(b, true, 'Sending...'); api('/api/alert-hub/test', { key: key }).then(function (r) { busy(b, false, 'Send test'); toast(r.success ? 'Test message sent' : (r.error || 'Test failed'), r.success ? 'success' : 'error'); }); }), c.source === 'app' ? btn('Remove', 'ghost sm', function () { save(true); }) : null])]);
      }
      var c2 = card('Webhooks', 'Two different spaces. Webhooks are saved on their own with Save, not with the settings below.', hub && hub.success ? [
        hookRow('review', 'Review alerts', 'Idle tickets: tickets waiting in the review status too long. Falls back to the Live ops webhook.'),
        hookRow('reviewMsg', 'Reviewer messages', 'Messages reviewers send to agents from the review form. Nothing posts until the reviewer clicks Send.')] : [h('p', { class: 'tka-when', text: 'Webhooks could not be loaded. Open the Alerts page to manage them.' })]);

      // 3. Direct assign teams
      var q = h('input', { class: 'tka-input', type: 'search', placeholder: 'Filter teams', 'aria-label': 'Filter teams' });
      var count = h('span', { class: 'tka-when' }), grid = h('div', { class: 'tka-chips2' });
      function paintTeams() {
        var f = q.value.trim().toLowerCase(), n = 0; Object.keys(picked).forEach(function (k) { if (picked[k]) n++; });
        count.textContent = n + ' of ' + teams.length + ' selected';
        grid.replaceChildren.apply(grid, teams.filter(function (t) { return !f || t.toLowerCase().indexOf(f) >= 0; }).map(function (t) {
          return h('button', { type: 'button', class: 'tka-tg' + (picked[t] ? ' on' : ''), 'aria-pressed': picked[t] ? 'true' : 'false', text: t, onclick: function (ev) { picked[t] = !picked[t]; touch(); ev.currentTarget.classList.toggle('on', picked[t]); ev.currentTarget.setAttribute('aria-pressed', picked[t] ? 'true' : 'false'); var m = 0; Object.keys(picked).forEach(function (k) { if (picked[k]) m++; }); count.textContent = m + ' of ' + teams.length + ' selected'; } });
        }));
        if (!grid.children.length) grid.appendChild(h('span', { class: 'tka-when', text: teams.length ? 'No team matches.' : 'No teams loaded yet. Rebuild the people directory below.' }));
      }
      q.addEventListener('input', paintTeams); paintTeams();
      var c3 = card('Direct assign teams', 'T1 agents may assign tickets straight to people in the selected teams without review. Everything else must go through ' + st.statusName + '.', [
        h('div', { class: 'tka-inline' }, [q, count, btn('Clear all', 'ghost sm', function () { picked = {}; touch(); paintTeams(); })]), grid]);

      // 4. Department chat spaces
      var rows = h('div', { class: 'tka-sprows' });
      function spaceRow(team, url) {
        var sel = h('select', { class: 'tka-input', 'aria-label': 'Team' }, [h('option', { value: '', text: 'Choose a team' })].concat(teams.concat(team && teams.indexOf(team) < 0 ? [team] : []).map(function (t) { var o = h('option', { value: t, text: t }); if (t === team) o.selected = true; return o; })));
        var u = h('input', { class: 'tka-input', type: 'url', value: url || '', placeholder: 'https://chat.google.com/room/...', 'aria-label': 'Space link' });
        var row = h('div', { class: 'tka-sprow' }, [sel, u, btn('Remove', 'ghost sm', function () { row.remove(); touch(); })]);
        sel.addEventListener('change', touch); u.addEventListener('input', touch); return row;
      }
      Object.keys(st.deptSpaces || {}).forEach(function (k) { rows.appendChild(spaceRow(k, st.deptSpaces[k])); });
      var c4 = card('Department chat spaces', 'Approved shows an Open space button for the chosen team on the hand-off message.', [rows, h('div', { class: 'tka-actions' }, [btn('Add a team', 'sm', function () { rows.appendChild(spaceRow('', '')); })])]);

      // 5. People directory
      var c5 = card('People directory', 'Who is in which team, built from Zoho teams, the staff list and the Who does what sheet. ' + (j.peopleRefreshedAt ? 'Updated ' + ago(j.peopleRefreshedAt) + '.' : 'Not built yet.'), [
        h('div', { class: 'tka-actions' }, [btn('Rebuild people directory', 'sm', function (ev) { var b = ev.currentTarget; busy(b, true, 'Rebuilding...'); api('/api/review/people/refresh', {}).then(function (r) { busy(b, false, 'Rebuild people directory'); toast(r.success ? 'Directory: ' + r.zoho + ' from Zoho teams, ' + r.staff + ' staff, ' + r.sheet + ' from the sheet' : (r.error || 'Failed'), r.success ? 'success' : 'error'); }); })])]);

      var note = h('span', { class: 'tka-when', text: 'All saved' });
      saveBar = h('div', { class: 'tka-savebar' }, [note, h('span', { class: 'tka-when tka-unsaved', text: 'Unsaved changes' }), h('span', { class: 'grow' }),
        btn('Discard changes', 'ghost sm', function () { TA.tab = 'reviewSettings'; render(); }),
        btn('Save settings', 'primary', function (ev) {
          var b = ev.currentTarget, spacesMap = {};
          Array.prototype.forEach.call(rows.children, function (r) { var t = r.querySelector('select').value, u = r.querySelector('input').value.trim(); if (t && u) spacesMap[t] = u; });
          busy(b, true, 'Saving...');
          api('/api/review/settings', { excludedTeams: Object.keys(picked).filter(function (k) { return picked[k]; }), bufferMin: Number(buf.value), escalateEmails: esc.value.split(/[,\s]+/).filter(Boolean), statusName: stName.value, enabled: on.cb.checked, startHour: Number(hrFrom.value), endHour: Number(hrTo.value), repeatMin: Number(rep.value), maxReminders: Number(mx.value), alertsOn: alOn.cb.checked, deptSpaces: spacesMap }, 'PUT').then(function (r) {
            busy(b, false, 'Save settings');
            if (!r.success) return toast(r.error || 'Could not save', 'error');
            toast('Settings saved', 'success'); dirty = false; saveBar.classList.remove('dirty'); TA.tab = 'reviewSettings'; render();
          });
        })]);
      body.replaceChildren(h('div', { class: 'tka-setpage' }, [c1, c2, c3, c4, c5]), saveBar);
    }).catch(function () { body.replaceChildren(h('div', { class: 'tka-note', text: 'Could not load settings' })); });
  }
  function viewStrikes(body) {
    api('/api/review/strikes').then(function (j) {
      if (!j.success) { body.appendChild(h('div', { class: 'tka-note', text: j.error || 'Could not load strikes' })); return; }
      var l30 = j.last30 || {};
      body.appendChild(h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'Strikes (rolling ' + j.days + ' days)' }), h('p', { class: 'tka-hint', text: 'Only reviews marked Needs rework: fatal are strikes (feedback is not). 5th: verbal warning, 6th: written warning, 7th: PIP for 30 days, more: disciplinary action. Last 30 days: ' + (l30.n || 0) + ' reviews, ' + (l30.good || 0) + ' good, ' + (l30.invalid || 0) + ' fatal, ' + (l30.feedback || 0) + ' feedback.' })])]));
      if (!j.agents.length) { body.appendChild(h('div', { class: 'tka-empty-card' }, [h('b', { text: 'No strikes' }), h('p', { text: 'Transfers marked Needs rework show here once reviewers record them.' })])); return; }
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
    var verdict = h('select', { class: 'tka-input narrow', 'aria-label': 'Verdict' }, [['', 'All verdicts'], ['good', 'Approved'], ['invalid', 'Needs rework (all)'], ['fatal', 'Needs rework: fatal'], ['feedback', 'Needs rework: feedback'], ['ignored', 'Skipped by reviewer'], ['none', 'No verdict yet'], ['skipped', 'Agent skipped review']].map(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === f.verdict) op.selected = true; return op; }));
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


  // ── Tickets and Alerts page (agents): Ticket alerts + Client lookup ──
  TA.alertsTabs = function () {
    var sec = document.getElementById('agent-section-talerts'); if (!sec) return;
    var root = document.getElementById('t1-alerts-agent-root');
    if (document.getElementById('tka-alerts-tabs')) return;
    var look = h('div', { id: 'tka-lookup-root', class: 'tka-page', style: 'display:none' });
    var b1 = h('button', { type: 'button', role: 'tab', class: 'tka-tab on', text: 'Ticket alerts', 'aria-selected': 'true' });
    var b2 = h('button', { type: 'button', role: 'tab', class: 'tka-tab', text: 'Client lookup', 'aria-selected': 'false' });
    var bar = h('div', { id: 'tka-alerts-tabs', class: 'tka-tabs tka-page', role: 'tablist' }, [b1, b2]);
    var drawn = false;
    function pick(l) {
      b1.classList.toggle('on', !l); b2.classList.toggle('on', l); b1.setAttribute('aria-selected', String(!l)); b2.setAttribute('aria-selected', String(l));
      if (root) root.style.display = l ? 'none' : ''; look.style.display = l ? '' : 'none';
      if (l && !drawn) { drawn = true; clientLookup(look); }
    }
    b1.addEventListener('click', function () { pick(false); });
    b2.addEventListener('click', function () { pick(true); });
    sec.insertBefore(bar, sec.firstChild); sec.appendChild(look);
  };
  // ── Client lookup, for agents on a live call ───────────────
  var CALL_TOPICS = [['Phone issue', 'phone calls not working'], ['EHR not syncing', 'ehr not syncing'], ['Online scheduling', 'online scheduling double booking'], ['Reminders and texts', 'reminders text messages'], ['Billing', 'billing invoice charge'], ['Login or access', 'cannot log in password'], ['Email campaign', 'email campaign'], ['Reviews', 'reviews reputation'], ['Forms', 'patient forms']];
  function clientLookup(host) {
    var input = h('input', { class: 'tka-input tka-cl-q', type: 'search', placeholder: 'Ticket #, deal name, account name, phone or email', 'aria-label': 'Search for a client', autocomplete: 'off' });
    var results = h('div', { class: 'tka-cl-results' }), view = h('div', { class: 'tka-cl-view' });
    var t = null, seq = 0;
    host.replaceChildren(
      h('div', { class: 'tka-head' }, [h('div', null, [h('h2', { text: 'Client lookup' }), h('p', { text: 'Find who is calling and see what we know before you speak. Search by ticket number, deal, account, phone or email.' })])]),
      h('div', { class: 'tka-cl-bar' }, [input]), results, view);
    function showResults(list, q) {
      if (!list.length) { results.replaceChildren(h('p', { class: 'tka-empty', text: 'No client found for "' + q + '". Try the account name, or the last digits of the phone number.' })); return; }
      results.replaceChildren.apply(results, list.map(function (r, n) {
        var c = h('button', { type: 'button', class: 'tka-cl-card', style: '--i:' + n }, [
          h('b', { text: r.deal || r.account || 'Client' }),
          h('span', { class: 'tka-when', text: [r.deal ? r.account : '', r.stage].filter(Boolean).join(' · ') }),
          h('span', { class: 'tka-cl-m', text: r.matchedOn || '' })]);
        c.addEventListener('click', function () { openProfile(r.accountId, r.dealId); });
        return c;
      }));
    }
    function run() {
      var q = input.value.trim(); if (q.length < 2) { results.replaceChildren(); return; }
      var my = ++seq; results.replaceChildren(h('div', { class: 'tka-skel', style: 'height:58px' }));
      api('/api/client-lookup/search?q=' + encodeURIComponent(q)).then(function (j) {
        if (my !== seq) return;
        if (!j.success) { results.replaceChildren(h('p', { class: 'tka-empty', text: j.error || 'Search failed' })); return; }
        if (j.results.length === 1) { results.replaceChildren(); openProfile(j.results[0].accountId, j.results[0].dealId); return; }
        showResults(j.results, q);
      });
    }
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 400); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(t); run(); } });

    function openProfile(accountId, dealId) {
      results.replaceChildren();
      view.replaceChildren.apply(view, dealSkeleton('Loading client...'));
      api('/api/client-lookup/profile?account=' + encodeURIComponent(accountId || '') + '&deal=' + encodeURIComponent(dealId || '')).then(function (p) {
        if (!p.success || !p.available) { view.replaceChildren(h('div', { class: 'tka-note', text: p.error || p.note || 'Could not load this client' })); return; }
        drawProfile(p);
      });
    }
    function drawProfile(p) {
      var a = p.account || {};
      var strip = h('div', { class: 'tka-cl-strip' }, [dealLine(p.header)]);
      var facts = [];
      if (a.phone) facts.push(['Office line', a.phone]); if (a.city) facts.push(['Location', a.city]); if (a.ehr) facts.push(['EHR', a.ehr]);
      if (a.locations) facts.push(['Locations', a.locations]); if (a.contractEnd) facts.push(['Contract ends', String(a.contractEnd).slice(0, 10)]); if (a.owner) facts.push(['Account owner', a.owner]);
      var jr = p.detail && p.detail.journey && p.detail.journey[0];
      if (p.detail) { var cn = p.detail.counts || {}; facts.push(['Open now', String((cn.open || 0) + (cn['on hold'] || 0)) + ' ticket' + (((cn.open || 0) + (cn['on hold'] || 0)) === 1 ? '' : 's')]); }
      if (jr) facts.push(['Last ticket', '#' + jr.number + (jr.created ? ', ' + String(jr.created).slice(0, 10) : '')]);
      var factRow = facts.length ? h('div', { class: 'tka-cl-facts' }, facts.map(function (f) { return h('div', { class: 'tka-df' }, [h('span', { class: 'tka-df-l', text: f[0] }), h('span', { text: f[1] })]); })) : null;
      // Call assist
      var topicIn = h('input', { class: 'tka-input', type: 'text', placeholder: 'What is the client calling about? e.g. phones keep dropping', 'aria-label': 'Reason for the call' });
      var chips = h('div', { class: 'tka-chips' }, CALL_TOPICS.map(function (c) { return h('button', { type: 'button', class: 'tka-chip', text: c[0], onclick: function () { topicIn.value = c[1]; go(true); } }); }));
      var out = h('div', { class: 'tka-cl-out' });
      var goBtn = btn('Show me', 'primary', function () { go(true); });
      var tt = null, tseq = 0;
      topicIn.addEventListener('input', function () { clearTimeout(tt); tt = setTimeout(function () { go(false); }, 600); });
      topicIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(tt); go(true); } });
      function guideCard(g) {
        if (!g) return null;
        var list = function (title, arr, cls) { return arr && arr.length ? h('div', { class: 'tka-cl-g ' + (cls || '') }, [h('h5', { text: title })].concat(arr.map(function (x) { return h('div', { class: 'tka-pt' }, [h('i'), h('span', { text: x })]); }))) : null; };
        return h('div', { class: 'tka-cl-guide' }, [
          g.headsUp ? h('div', { class: 'tka-note', text: g.headsUp }) : null,
          g.opener ? h('div', { class: 'tka-cl-open' }, [h('span', { class: 'tka-df-l', text: 'You can start with' }), h('p', { text: '"' + g.opener + '"' })]) : null,
          h('div', { class: 'tka-cl-gg' }, [list('Check first', g.check), list('What you can do now', g.can), list('What to say', g.say)]),
          g.escalate ? h('p', { class: 'tka-cl-esc' }, [h('b', { text: 'Escalate when: ' }), g.escalate]) : null,
          h('p', { class: 'tka-when', text: g.ai ? 'Suggested by AI from this client\'s history. Check it against what the client tells you.' : 'General guidance for this topic.' })]);
      }
      function go(full) {
        var q = topicIn.value.trim();
        if (q.length < 3) { out.replaceChildren(); return; }
        var my = ++tseq;
        var gHost = h('div', { class: 'tka-cl-gh' });
        if (full) gHost.appendChild(h('div', { class: 'tka-skel', style: 'height:120px' }));
        var tHost = h('div', { class: 'tka-cl-th' }, [h('div', { class: 'tka-skel', style: 'height:90px' })]);
        out.replaceChildren(gHost, tHost);
        var base = '?account=' + encodeURIComponent(p.accountId || '') + '&deal=' + encodeURIComponent(p.dealId || '') + '&q=' + encodeURIComponent(q);
        api('/api/client-lookup/topic' + base).then(function (r) {
          if (my !== tseq) return;
          var kids = [];
          var tags = (r.themes || []);
          kids.push(h('div', { class: 'tka-cl-tags' }, [h('span', { class: 'tka-df-l', text: 'Looks like' })].concat(tags.length ? tags.map(function (x) { return pill(x, 'dest'); }) : [h('span', { class: 'tka-when', text: 'no known topic, searching your words' })])));
          kids.push(dpSec('Earlier tickets on this (' + (r.tickets || []).length + ')', (r.tickets || []).length ? r.tickets.map(ticketRow) : [dpNote('No earlier ticket on this topic for this client.')]));
          if ((r.issues || []).length) kids.push(dpSec('Known issues on this topic', r.issues.map(issueItem)));
          if ((r.findings || []).length) kids.push(dpSec('Serious findings', r.findings.map(function (f) { return h('div', { class: 'tka-iss-i' }, [h('p', { text: f.claim })]); })));
          kids.push(dpSec('Earlier conversations', (r.convos || []).length ? r.convos.map(function (c) {
            return h('details', { class: 'tka-cl-cv' }, [h('summary', null, ['#' + c.number + ' ', h('span', { class: 'tka-when', text: c.subject })]),
              h('div', { class: 'tka-cl-msgs' }, c.messages.map(function (m) { return h('div', { class: 'tka-cl-msg ' + (m.who === 'Client' ? 'in' : 'out') }, [h('b', { text: m.who + (m.name && m.who !== 'Call' ? ' · ' + m.name : '') }), h('span', { text: m.text })]); }))]);
          }) : [dpNote('No conversation found on this topic.')]));
          tHost.replaceChildren.apply(tHost, kids);
        });
        if (full) api('/api/client-lookup/guide' + base).then(function (g) {
          if (my !== tseq) return;
          gHost.replaceChildren(g.success ? guideCard(g) : h('div', { class: 'tka-note', text: g.error || 'Could not get guidance' }));
        });
      }
      var assist = h('div', { class: 'tka-card tka-cl-assist' }, [h('h3', { text: 'Client is calling about...' }), h('div', { class: 'tka-toolbar' }, [topicIn, goBtn]), chips, out]);
      // Right rail: people (compact) and other deals
      var rail = [];
      var ppl = p.contacts || [];
      if (ppl.length) {
        var list = h('div', { class: 'tka-cl-people' });
        var more = null;
        var draw = function (all) {
          list.replaceChildren.apply(list, (all ? ppl : ppl.slice(0, 5)).map(function (c) {
            var line = [];
            if (c.phone) line.push(h('a', { href: 'tel:' + c.phone.replace(/[^0-9+]/g, ''), text: c.phone }));
            if (c.email) line.push(h('a', { href: 'mailto:' + c.email, text: c.email }));
            return h('div', { class: 'tka-cl-pr' }, [h('span', { class: 'tka-df-av', 'aria-hidden': 'true', text: initials(c.name || c.email) }),
              h('div', { class: 'tka-cl-pi' }, [h('b', { text: c.name || c.email }), c.title ? h('span', { class: 'tka-when', text: c.title }) : null, h('div', { class: 'tka-cl-pl' }, line)])]);
          }));
          if (more) more.textContent = all ? 'Show fewer' : 'Show all ' + ppl.length;
        };
        if (ppl.length > 5) { more = h('button', { type: 'button', class: 'tka-link', onclick: function () { draw(more.textContent.indexOf('all') > -1); } }); }
        draw(false);
        rail.push(h('div', { class: 'tka-card tka-cl-rc' }, [h('div', { class: 'tka-cl-rh' }, [h('h3', { text: 'People on this account' }), h('span', { class: 'tka-dp-cnt', text: String(ppl.length) })]), list, more]));
      }
      if ((p.deals || []).length > 1) rail.push(h('div', { class: 'tka-card tka-cl-rc' }, [h('div', { class: 'tka-cl-rh' }, [h('h3', { text: 'Deals on this account' }), h('span', { class: 'tka-dp-cnt', text: String(p.deals.length) })]), h('div', { class: 'tka-cl-deals' }, p.deals.map(function (d) {
        return h('button', { type: 'button', class: 'tka-cl-dl' + (d.id === p.dealId ? ' on' : ''), onclick: function () { openProfile(p.accountId, d.id); } }, [h('span', { text: d.name || 'Deal' }), pill(d.stage || '', stageCls(d.stage) === 'good' ? 'st-approved' : '')]);
      }))]));
      var dealBox = h('div', { class: 'tka-dp tka-cl-deal' });
      if (p.detail) renderDeal(dealBox, p.detail, { wide: true }); else dealBox.replaceChildren(dpNote(p.detailNote || 'No support history yet.'));
      view.replaceChildren(h('div', { class: 'tka-card tka-cl-head' }, [strip, factRow]),
        h('div', { class: 'tka-cl-grid' }, [assist, rail.length ? h('div', { class: 'tka-cl-rail' }, rail) : null]),
        h('div', { class: 'tka-card tka-cl-hist' }, [h('h3', { text: 'Support history' }), dealBox]));
      try { view.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      topicIn.focus();
    }
  }
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
          h('div', { class: 'tka-tile' }, [h('span', { class: 'tka-tile-l', text: 'Approved' }), h('b', { class: 'tka-tile-v', text: String(j.good) }), h('span', { class: 'tka-tile-s', text: 'transfers in the last ' + j.days + ' days' })]),
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
        h('div', { class: 'tka-sectionhead' }, [h('div', null, [h('h3', { text: 'SPOC management' }), h('p', { class: 'tka-hint', text: 'SPOCs are existing agents or admins. They review tickets in Pending Review - T1 and record Approved or Needs rework.' })])]),
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
