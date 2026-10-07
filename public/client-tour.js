/* Guided tour for Client lookup. Agents must finish it once: no close button, no Escape, no click-away. */
(function () {
  'use strict';
  var ID = 'client-lookup';
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
    return null;
  }
  var STEPS = [
    { title: 'Meet Client lookup', text: 'New on your Tkt Alerts page. Before you answer a call, find the client and see what we already know about them: who they are, whether they are escalated, what is open, and what was said before.', mark: 'NEW' },
    { title: 'Open it from Tkt Alerts', text: 'Your sidebar tile for ticket alerts is now called Tkt Alerts. Client lookup is the second tab on that page.', target: '#sb-agent-talerts', side: 'right' },
    { title: 'Search any way the client gives it', text: 'Type a ticket number, deal name, account name, phone number or email. If there is one match it opens straight away, otherwise pick the right client from the list.', target: '.tka-cl-q', side: 'bottom', before: goLookup },
    { title: 'Tell it why they are calling', text: 'After you open a client, write what the call is about, or tap a topic. You get earlier tickets and conversations on that topic, known issues, and suggested checks with what you can say and do.', sample: 'guide' },
    { title: 'Got a ticket number? Get the next step', text: 'Search a ticket number and the page also reads that ticket and suggests the best next step. Email and web tickets get an email reply draft, always. Phone tickets get a call guide. Need the other one? Use the button on the panel, for example when the client asks for a call. It draws on similar solved tickets and recent updates, and lists what it used.', sample: 'ticket' },
    { title: 'Check the history first', text: 'The top of the page shows the escalation status and its owner, open tickets, the last ticket, and the full support history. If the client is escalated, keep the escalation owner informed.', sample: 'history' },
    { title: 'Use it as help, not a script', text: 'The suggestions come from our records and AI, so confirm every detail with the client. Do not read internal notes or escalation details out to the client, and do not promise a fix or a time you cannot guarantee.', last: true }
  ];

  function start() {
    if (T.running || document.getElementById('ct-root')) return;
    T.running = true;
    var i = 0, timer = null;
    var ring = h('div', { class: 'ct-ring' });
    var back = h('div', { class: 'ct-back' });
    var title = h('h2', { id: 'ct-t' }), text = h('p', { class: 'ct-text' }), extra = h('div', { class: 'ct-extra' });
    var dots = h('div', { class: 'ct-dots', 'aria-hidden': 'true' }, STEPS.map(function () { return h('i'); }));
    var ack = h('input', { type: 'checkbox', id: 'ct-ack' });
    var ackRow = h('label', { class: 'ct-ack', for: 'ct-ack' }, [ack, ' I understand how to use Client lookup']);
    var err = h('p', { class: 'ct-err', role: 'alert' });
    var prev = h('button', { type: 'button', class: 'ct-btn', text: 'Back' });
    var next = h('button', { type: 'button', class: 'ct-btn primary' });
    var card = h('div', { class: 'ct-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ct-t', tabindex: '-1' }, [h('div', { class: 'ct-top' }, [h('span', { class: 'ct-pill', text: 'New feature' }), h('span', { class: 'ct-count' })]), title, text, extra, ackRow, err, h('div', { class: 'ct-foot' }, [dots, h('div', { class: 'ct-btns' }, [prev, next])])]);
    var root = h('div', { class: 'ct-root', id: 'ct-root' }, [back, ring, card]);
    document.body.appendChild(root); document.body.classList.add('ct-lock');
    function block(e) { if (!card.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }
    ['mousedown', 'click', 'touchstart'].forEach(function (ev) { root.addEventListener(ev, block, true); });
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
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
      var s = STEPS[i], el = s.target ? document.querySelector(s.target) : null;
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
      ackRow.style.display = s.last ? '' : 'none'; err.textContent = '';
      next.textContent = s.last ? 'Finish' : 'Next';
      // A short pause on each step so the tour is read, not clicked through.
      var wait = i === 0 ? 0 : 1500; next.disabled = true;
      function ready() { next.disabled = s.last ? !ack.checked : false; }
      timer = setTimeout(ready, wait); ack.onchange = ready;
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      setTimeout(function () { place(); try { (next.disabled ? card : next).focus({ preventScroll: true }); } catch (e) {} }, s.before ? 450 : 30);
    }
    prev.addEventListener('click', function () { if (i) { i--; show(); } });
    next.addEventListener('click', function () {
      if (i < STEPS.length - 1) { i++; show(); return; }
      next.disabled = true; err.textContent = '';
      api('/api/tours/' + ID + '/done', {}).then(function (r) {
        if (r && r.success) {
          clearTimeout(timer); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place);
          root.remove(); document.body.classList.remove('ct-lock'); T.running = false;
          try { if (typeof showToast === 'function') showToast('Client lookup is ready to use under Tkt Alerts', 'success'); } catch (e) {}
        } else { err.textContent = 'Could not save that. Check your connection and press Finish again.'; next.disabled = false; }
      }).catch(function () { err.textContent = 'Could not save that. Check your connection and press Finish again.'; next.disabled = false; });
    });
    window.addEventListener('resize', place);
    show();
  }

  // Wait for the update and review screens that appear at sign-in, then check whether this person has finished the tour.
  T.maybe = function (role) {
    if (T.checked || T.running || role === 'assessment') return;
    var inAgentView = role === 'agent' || (typeof currentViewMode !== 'undefined' && currentViewMode === 'agent');
    if (!inAgentView) return;
    T.checked = true;
    var tries = 0;
    (function wait() {
      if (document.getElementById('pu-gate') || document.getElementById('tka-gate')) { if (tries++ < 900) return setTimeout(wait, 800); }
      api('/api/tours/' + ID + '/status').then(function (r) { if (r && r.success && !r.done) start(); else if (!(r && r.success)) T.checked = false; }).catch(function () { T.checked = false; });
    })();
  };
})();
