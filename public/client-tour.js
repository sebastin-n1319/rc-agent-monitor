/* Guided tours for new features (Client lookup, Support guides). Agents must finish each once: no close button, no Escape, no click-away. */
(function () {
  'use strict';
  var BASE = (typeof BACKEND !== 'undefined' ? BACKEND : '');
  var T = window.ClientTour = { running: false, checked: false };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(path, body) {
    var o = { credentials: 'include', method: body ? 'POST' : 'GET' };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(BASE + path, o).then(function (r) { return r.json().catch(function () { return { success: false }; }); });
  }
  // Pop-ups that must be dealt with first (update gate, review gate, daily mood check-in, break and lock screens).
  var BLOCKERS = '#pu-gate,#tka-gate,#wellness-modal,#agentBreakModal,#autolock-overlay,#logoutOverlay,#agent-notes-modal,#tl-edit-modal';
  function blocked() {
    var l = document.querySelectorAll(BLOCKERS);
    for (var k = 0; k < l.length; k++) { var cs = getComputedStyle(l[k]); var r = l[k].getBoundingClientRect(); if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) return true; }
    return false;
  }
  function goLookup() {
    try { if (typeof sbAgent === 'function') sbAgent('talerts', document.getElementById('sb-agent-talerts')); else if (typeof switchAgentSection === 'function') switchAgentSection('talerts', document.getElementById('agent-tab-talerts')); } catch (e) {}
    try { if (window.TA && TA.alertsTabs) TA.alertsTabs(); } catch (e) {}
    var tabs = document.querySelectorAll('#tka-alerts-tabs .tka-tab');
    if (tabs[1] && !tabs[1].classList.contains('on')) tabs[1].click();
  }
  function sample(kind) {
    if (kind === 'guide') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, ['Phone issue', 'EHR not syncing', 'Billing'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'YOU CAN START WITH' }), h('p', { text: '"I can see your phone history, let me check the line now."' }), h('small', { text: 'CHECK FIRST' }), h('p', { text: 'Is the line online? Which devices are affected?' })])]);
    if (kind === 'history') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag bad', text: 'Escalated (Tier 2)' }), h('span', { class: 'ct-s-who', text: 'Owner: a named person, with the date it started' })]),
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag', text: '2 open' }), h('span', { class: 'ct-tag', text: '61 tickets' }), h('span', { class: 'ct-tag', text: 'Last: #413539' })]),
      h('div', { class: 'ct-s-bar' }, [h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i')])]);
    if (kind === 'ticket') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag', text: '#413707' }), h('span', { class: 'ct-tag', text: 'Web' }), h('span', { class: 'ct-s-who', text: 'Waiting on: us' })]),
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-chip on', text: 'Email reply' }), h('span', { class: 'ct-chip', text: 'Call guide (on request)' })]),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'DRAFT REPLY' }), h('p', { text: 'Hi, thanks for your patience. I checked the sync and here is what we did next...' }), h('small', { text: 'BASED ON' }), h('p', { text: 'Similar solved ticket, recent process update' })])]);
    if (kind === 'gtabs') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, ['VoIP support', 'AI support', 'Ask AI'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'SEARCH THE VOIP GUIDE' }), h('p', { text: '"one way audio"  3 matches in 2 sections. Press Enter for the next one.' })])]);
    if (kind === 'gask') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, ['All guides', 'VoIP only', 'AI only'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'YOUR QUESTION' }), h('p', { text: 'Calls drop after 30 seconds, what should I check?' }), h('small', { text: 'FROM THE GUIDE' }), h('p', { text: 'A short answer, a link to the section it came from, and past tickets like #409238 that open in Zoho Desk.' })])]);
    return null;
  }
  function goGuides() {
    try { if (typeof sbAgent === 'function') sbAgent('guides', document.getElementById('sb-agent-guides')); } catch (e) {}
  }
  var CL_STEPS = [
    { title: 'Meet Client lookup', text: 'New on your Tkt Alerts page. Before you answer a call, find the client and see what we already know about them: who they are, whether they are escalated, what is open, and what was said before.', mark: 'NEW' },
    { title: 'Open it from Tkt Alerts', text: 'Your sidebar tile for ticket alerts is now called Tkt Alerts. Client lookup is the second tab on that page.', target: '#sb-agent-talerts', side: 'right' },
    { title: 'Search any way the client gives it', text: 'Type a ticket number, deal name, account name, phone number or email. If there is one match it opens straight away, otherwise pick the right client from the list.', target: '.tka-cl-q', side: 'bottom', before: goLookup },
    { title: 'Tell it why they are calling', text: 'After you open a client, write what the call is about, or tap a topic. You get earlier tickets and conversations on that topic, known issues, and suggested checks with what you can say and do.', sample: 'guide' },
    { title: 'Got a ticket number? Get the next step', text: 'Search a ticket number and the page also reads that ticket and suggests the best next step. Email and web tickets get an email reply draft, always. Phone tickets get a call guide. Need the other one? Use the button on the panel, for example when the client asks for a call. It draws on similar solved tickets and recent updates, and lists what it used.', sample: 'ticket' },
    { title: 'Check the history first', text: 'The top of the page shows the escalation status and its owner, open tickets, the last ticket, and the full support history. If the client is escalated, keep the escalation owner informed.', sample: 'history' },
    { title: 'Use it as help, not a script', text: 'The suggestions come from our records and AI, so confirm every detail with the client. Do not read internal notes or escalation details out to the client, and do not promise a fix or a time you cannot guarantee.', last: true }
  ];
  var GD_STEPS = [
    { title: 'Meet Support guides', text: 'The VoIP support guide and the AI support runbook now live inside the tool, with Ask AI to find answers quickly while you are on a ticket or a call.', mark: 'NEW' },
    { title: 'Open it from Guides', text: 'Guides is in your sidebar. It opens the guides right here in the tool, so you do not need another tab or file.', target: '#sb-agent-guides', side: 'right' },
    { title: 'Two guides, one place', text: 'VoIP support covers phone setup, troubleshooting and the query catalog. AI support is the AI runbook. Use the search box on the left to jump to every match; press Enter for the next one.', sample: 'gtabs', before: goGuides },
    { title: 'Ask AI for a quick answer', text: 'Open the Ask AI tab and type the question the way the client put it. Choose All guides, VoIP only or AI only. Answers come only from the guides and link to the section they came from.', sample: 'gask' },
    { title: 'Ticket numbers open in Zoho Desk', text: 'Ticket numbers in the guides and in Ask AI answers are links. Click one to open that ticket in Zoho Desk and see how it was handled.' },
    { title: 'Check before you act', text: 'Open the linked section before you act on a live call, and confirm details with the client. If the guides do not cover the issue, Ask AI says so; follow the usual process and escalate when needed.', last: true }
  ];
  function visibleSidebar() {
    var a = document.getElementById('adit-admin-sidebar'), b = document.getElementById('adit-agent-sidebar');
    if (a && getComputedStyle(a).display !== 'none') return a;
    return b && getComputedStyle(b).display !== 'none' ? b : null;
  }
  var HD_STEPS = [
    { title: 'Getting around', text: 'A quick look at the header, your profile menu and the sidebar, so you can find anything in the tool in a couple of clicks.', mark: 'TOUR' },
    { title: 'Clock and time zone', text: 'The live clock shows the time in the zone you pick. Switch between CST and IST here; times across the tool follow your choice.', target: '#hmTime', side: 'bottom' },
    { title: 'Notifications', text: 'The bell collects announcements, what is new in the tool, assessment updates and items meant just for you. A number shows what you have not read.', target: '#ncBell', side: 'bottom' },
    { title: 'Your profile menu', text: 'Click your name to replay any tour, jump to any page, search everything, see keyboard shortcuts, turn on dark mode or sign out. Admins also switch between admin and agent view here.', target: '#hmMe', side: 'bottom' },
    { title: 'Your pages', text: 'Every page you can open is in the sidebar on the left. The highlighted item is the page you are on.', target: visibleSidebar, side: 'right' },
    { title: 'Search from anywhere', text: 'Press Ctrl K (or /) on any page to search pages and actions, and press ? to see all keyboard shortcuts.', last: true }
  ];
  var TOURS = [
    { id: 'client-lookup', title: 'Client lookup', blurb: 'Find a client before you answer', icon: 'lookup', agent: true, steps: CL_STEPS, ack: ' I understand how to use Client lookup', toast: 'Client lookup is ready to use under Tkt Alerts' },
    { id: 'support-guides', title: 'Support guides', blurb: 'VoIP and AI guides with Ask AI', icon: 'guides', agent: true, steps: GD_STEPS, ack: ' I understand how to use Support guides', toast: 'Support guides are ready under Guides in your sidebar' },
    { id: 'getting-around', title: 'Getting around', blurb: 'Header, profile menu and sidebar', icon: 'header', optional: true, steps: HD_STEPS, toast: 'Tour finished. Replay it any time from your profile menu.' }
  ];

  function start(tour, then, replay) {
    if (T.running || document.getElementById('ct-root')) return;
    T.running = true;
    var STEPS = tour.steps, ID = tour.id;
    var i = 0, timer = null;
    var ring = h('div', { class: 'ct-ring' });
    var back = h('div', { class: 'ct-back' });
    var title = h('h2', { id: 'ct-t' }), text = h('p', { class: 'ct-text' }), extra = h('div', { class: 'ct-extra' });
    var dots = h('div', { class: 'ct-dots', 'aria-hidden': 'true' }, STEPS.map(function () { return h('i'); }));
    var ack = h('input', { type: 'checkbox', id: 'ct-ack' });
    var ackRow = h('label', { class: 'ct-ack', for: 'ct-ack' }, [ack, tour.ack || ' I understand']);
    var err = h('p', { class: 'ct-err', role: 'alert' });
    var prev = h('button', { type: 'button', class: 'ct-btn', text: 'Back' });
    var next = h('button', { type: 'button', class: 'ct-btn primary' });
    var card = h('div', { class: 'ct-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ct-t', tabindex: '-1' }, [h('div', { class: 'ct-top' }, [h('span', { class: 'ct-pill', text: replay ? 'Tour' : 'New feature' }), h('span', { class: 'ct-top-r' }, [h('span', { class: 'ct-count' }), replay ? h('button', { type: 'button', class: 'ct-x', 'aria-label': 'Close tour', title: 'Close tour (Esc)', text: '\u00d7', onclick: function () { finish(false); } }) : null])]), title, text, extra, ackRow, err, h('div', { class: 'ct-foot' }, [dots, h('div', { class: 'ct-btns' }, [prev, next])])]);
    var root = h('div', { class: 'ct-root', id: 'ct-root' }, [back, ring, card]);
    document.body.appendChild(root); document.body.classList.add('ct-lock');
    function block(e) { if (!card.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }
    ['mousedown', 'click', 'touchstart'].forEach(function (ev) { root.addEventListener(ev, block, true); });
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (replay) finish(false); return; }
      if (e.key === 'Tab') {
        var f = card.querySelectorAll('button:not([disabled]), input:not([disabled])'); if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1];
        if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    function place() {
      var s = STEPS[i], el = s.target ? (typeof s.target === 'function' ? s.target() : document.querySelector(s.target)) : null;
      if (el && el.offsetParent !== null) {
        try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
        var r = el.getBoundingClientRect(), pad = 8;
        ring.style.cssText = 'display:block;left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
        back.style.display = 'none';
        var cw = Math.min(card.offsetWidth || 420, window.innerWidth - 24), ch = card.offsetHeight || 260, left, top;
        if (s.side === 'right' && r.right + cw + 24 < window.innerWidth) { left = r.right + 20; top = Math.max(12, Math.min(r.top, window.innerHeight - ch - 12)); }
        else { left = Math.max(12, Math.min(r.left, window.innerWidth - cw - 12)); top = r.bottom + 20; if (top + ch > window.innerHeight - 12) top = Math.max(12, r.top - ch - 20); }
        card.classList.add('pos'); card.style.cssText = 'left:' + left + 'px;top:' + top + 'px';
      } else {
        ring.style.display = 'none'; back.style.display = 'block'; card.classList.remove('pos'); card.style.cssText = '';
      }
    }
    function show() {
      var s = STEPS[i];
      clearTimeout(timer);
      if (s.before) { try { s.before(); } catch (e) {} }
      title.textContent = s.title; text.textContent = s.text; extra.replaceChildren(); var sm = s.sample ? sample(s.sample) : null; if (sm) extra.appendChild(sm);
      card.querySelector('.ct-count').textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
      Array.prototype.forEach.call(dots.children, function (d, n) { d.className = n === i ? 'on' : n < i ? 'past' : ''; });
      prev.style.visibility = i ? 'visible' : 'hidden';
      ackRow.style.display = s.last && !replay ? '' : 'none'; err.textContent = '';
      next.textContent = s.last ? 'Finish' : 'Next';
      // A short pause on each step so the tour is read, not clicked through.
      var wait = i === 0 || replay ? 0 : 1500; next.disabled = true;
      function ready() { next.disabled = s.last && !replay ? !ack.checked : false; }
      timer = setTimeout(ready, wait); ack.onchange = ready;
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      setTimeout(function () { place(); try { (next.disabled ? card : next).focus({ preventScroll: true }); } catch (e) {} }, s.before ? 450 : 30);
    }
    prev.addEventListener('click', function () { if (i) { i--; show(); } });
    next.addEventListener('click', function () {
      if (i < STEPS.length - 1) { i++; show(); return; }
      next.disabled = true; err.textContent = '';
      api('/api/tours/' + ID + '/done', {}).then(function (r) {
        if (r && r.success) finish(true);
        else if (replay) finish(true);
        else { err.textContent = 'Could not save that. Check your connection and press Finish again.'; next.disabled = false; }
      }).catch(function () {
        if (replay) { finish(true); return; }
        err.textContent = 'Could not save that. Check your connection and press Finish again.'; next.disabled = false;
      });
    });
    function finish(completed) {
      clearTimeout(timer); clearInterval(watch); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place);
      root.remove(); document.body.classList.remove('ct-lock'); T.running = false;
      if (completed) { try { if (typeof showToast === 'function') showToast(tour.toast, 'success'); } catch (e) {} }
      if (then) setTimeout(then, 1200);
    }
    window.addEventListener('resize', place);
    // If another pop-up appears while the tour is open (for example the mood check-in), step aside until it is dismissed.
    var hidden = false, watch;
    watch = setInterval(function () {
      if (!document.getElementById('ct-root')) { clearInterval(watch); return; }
      var b = blocked();
      if (b && !hidden) { hidden = true; root.style.visibility = 'hidden'; }
      else if (!b && hidden) { hidden = false; root.style.visibility = ''; place(); }
    }, 400);
    show();
  }

  T.list = function () { return TOURS.map(function (t) { return { id: t.id, title: t.title, blurb: t.blurb, icon: t.icon, steps: t.steps.length, status: true }; }); };
  T.status = function (id) { return api('/api/tours/' + id + '/status').then(function (r) { return !!(r && r.success && r.done); }); };
  // Replay from the profile menu: can be closed at any time. Agent tours open agent view first.
  T.replay = function (id) {
    var t = TOURS.filter(function (x) { return x.id === id; })[0];
    if (!t || T.running) return;
    var admin = typeof currentRole !== 'undefined' && currentRole === 'admin';
    var inAdminView = admin && typeof currentViewMode !== 'undefined' && currentViewMode === 'admin';
    if (t.agent && inAdminView && typeof toggleView === 'function') { toggleView(); return setTimeout(function () { start(t, null, true); }, 900); }
    start(t, null, true);
  };
  // Wait for the update and review screens that appear at sign-in, then check whether this person has finished the tour.
  T.maybe = function (role) {
    if (T.checked || T.running || role === 'assessment') return;
    var inAgentView = role === 'agent' || (typeof currentViewMode !== 'undefined' && currentViewMode === 'agent');
    if (!inAgentView) return;
    T.checked = true;
    var tries = 0;
    (function wait() {
      // Give the other sign-in pop-ups (the mood check-in appears about 4 seconds after sign-in) time to show up first, then wait for them to close.
      if ((performance.now() < 9000 || blocked()) && tries++ < 1800) return setTimeout(wait, 800);
      next(0);
    })();
    // Run each unfinished tour in turn, oldest first.
    function next(k) {
      if (k >= TOURS.length) return;
      if (TOURS[k].optional) return next(k + 1);
      api('/api/tours/' + TOURS[k].id + '/status').then(function (r) {
        if (r && r.success && !r.done) start(TOURS[k], function () { next(k + 1); });
        else if (r && r.success) next(k + 1);
        else T.checked = false;
      }).catch(function () { T.checked = false; });
    }
  };
})();
