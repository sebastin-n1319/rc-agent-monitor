/* Session 68: tool-wide notification centre (bell in the main header).
   Merges admin announcements, what's new, personal items and assessment items. */
(function () {
  'use strict';
  var S = { items: [], muted: [], cats: [], admin: false, open: false, showMute: false, showForm: false, posted: [], build: null, firstBuild: null, timer: null, err: false };
  var bell, badge, panel;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'include', headers: {} };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === false) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } return j; }); });
  }
  function ago(iso) {
    var t = Date.parse(String(iso || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso || '') ? '' : 'Z'));
    if (!t) return '';
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.floor(m / 60) + ' h ago';
    return Math.floor(m / 1440) + ' d ago';
  }
  function catLabel(k) { for (var i = 0; i < S.cats.length; i++) if (S.cats[i].key === k) return S.cats[i].label; return k; }
  function shown() { return S.items.filter(function (i) { return !i.muted; }); }
  function unread() { return shown().filter(function (i) { return !i.read; }).length; }

  function load() {
    var a = api('/api/notices').then(function (r) { S.err = false; S.admin = !!r.admin; S.muted = r.muted || []; S.cats = r.categories || []; S.build = r.build || null; if (!S.firstBuild) S.firstBuild = S.build; return r.items.map(function (i) { i.key = 'n' + i.id; i.kind = 'notice'; return i; }); }).catch(function () { S.err = true; return null; });
    var b = api('/api/assess/notifications').then(function (r) { return r.items.map(function (i) { return { key: 'a' + i.id, id: i.id, kind: 'assess', category: 'assessments', title: i.title, body: i.body, link: '/assess', at: i.at, read: i.read, urgent: false, muted: S.muted.indexOf('assessments') > -1 }; }); }).catch(function () { return []; });
    return Promise.all([a, b]).then(function (x) {
      if (x[0] === null) { draw(); return; }
      var assess = x[1].map(function (i) { i.muted = S.muted.indexOf('assessments') > -1; return i; });
      S.items = x[0].concat(assess).sort(function (p, q) { return (Date.parse(String(q.at).replace(' ', 'T') + 'Z') || 0) - (Date.parse(String(p.at).replace(' ', 'T') + 'Z') || 0); });
      draw();
    });
  }
  function loadPosted() { if (!S.admin) return Promise.resolve(); return api('/api/admin/notices').then(function (r) { S.posted = r.data || []; draw(); }).catch(function () {}); }

  function markRead(items) {
    var n = [], a = [];
    items.forEach(function (i) { if (!i.read) { i.read = true; (i.kind === 'assess' ? a : n).push(i.id); } });
    if (n.length) api('/api/notices/read', { method: 'POST', body: { ids: n } }).catch(function () {});
    if (a.length) api('/api/assess/notifications/read', { method: 'POST', body: { ids: a } }).catch(function () {});
    draw();
  }
  function openItem(i) {
    markRead([i]);
    if (i.link === 'app:updates') {
      S.open = false; draw();
      try {
        if (typeof isAdminRole === 'function' && isAdminRole() && typeof applyView === 'function' && typeof currentViewMode !== 'undefined' && currentViewMode !== 'agent') applyView('agent');
        if (typeof sbAgent === 'function') sbAgent('updates', document.getElementById('sb-agent-updates'));
      } catch (e) {}
      return;
    }
    if (i.link === 'app:audits') {
      S.open = false; draw();
      if (!(window.TA && window.TA.me && window.TA.me.access)) return;
      try {
        var adminView = typeof isAdminRole === 'function' && isAdminRole() && typeof currentViewMode !== 'undefined' && currentViewMode !== 'agent';
        if (adminView && typeof sbAdmin === 'function') sbAdmin('audits', document.getElementById('sb-audits'));
        else if (typeof sbAgent === 'function') sbAgent('audits', document.getElementById('sb-agent-audits'));
      } catch (e) {}
      return;
    }
    if (i.link) { S.open = false; draw(); if (/^https:\/\//.test(i.link)) window.open(i.link, '_blank', 'noopener'); else window.location.href = i.link; }
  }
  function saveMute(key, on) {
    var m = S.muted.filter(function (k) { return k !== key; });
    if (on) m.push(key);
    S.muted = m;
    S.items.forEach(function (i) { i.muted = m.indexOf(i.category) > -1 && !i.urgent; });
    draw();
    api('/api/notices/prefs', { method: 'PUT', body: { muted: m } }).catch(function () {});
  }

  function formBox() {
    var f = {};
    function fld(name, node) { f[name] = node; return node; }
    var people = fld('people', el('textarea', { placeholder: 'Emails, separated by commas', style: 'display:none;min-height:50px' }));
    var aud = fld('audience', el('select', { 'aria-label': 'Audience', onchange: function () { people.style.display = aud.value === 'people' ? '' : 'none'; } }, [
      el('option', { value: 'all', text: 'Everyone' }), el('option', { value: 'agents', text: 'Agents only' }), el('option', { value: 'admins', text: 'Admins only' }), el('option', { value: 'people', text: 'Chosen people' })]));
    var cat = fld('category', el('select', { 'aria-label': 'Category' }, S.cats.map(function (c) { return el('option', { value: c.key, text: c.label }); })));
    var urgent = fld('urgent', el('input', { type: 'checkbox', id: 'ncUrgent', style: 'width:auto' }));
    var msg = el('div', { class: 'nc-m', role: 'status' });
    var send = el('button', { class: 'nc-btn', type: 'button', text: 'Post announcement', onclick: function () {
      send.disabled = true; msg.textContent = '';
      api('/api/admin/notices', { method: 'POST', body: {
        title: f.title.value, body: f.body.value, link: f.link.value, audience: aud.value, category: cat.value, urgent: urgent.checked,
        expiresInDays: Number(f.exp.value) || 0,
        people: people.value.split(/[,\s;]+/).filter(Boolean) } })
        .then(function () { S.showForm = false; return Promise.all([load(), loadPosted()]); })
        .catch(function (e) { msg.textContent = e.message; })
        .then(function () { send.disabled = false; });
    } });
    // AI: describe it in a few words, it writes the title and message for review.
    var gist = el('textarea', { maxlength: 1200, placeholder: 'Tell me the gist, e.g. "New retest rule for assessments from Monday, agents must stay in full screen"', 'aria-label': 'What do you want to announce?', style: 'min-height:56px' });
    var aiMsg = el('div', { class: 'nc-m', role: 'status' });
    var aiBtn = el('button', { class: 'nc-btn', type: 'button', text: 'Write it with AI', onclick: function () {
      if (String(gist.value).trim().length < 6) { aiMsg.textContent = 'Write a few words first.'; return; }
      aiBtn.disabled = true; aiBtn.textContent = 'Writing...'; aiMsg.textContent = '';
      api('/api/admin/notices/compose', { method: 'POST', body: { gist: gist.value, audience: aud.value } }).then(function (r) {
        var d = r.draft || {};
        f.title.value = d.title || ''; f.body.value = d.body || '';
        if (d.category && S.cats.some(function (c) { return c.key === d.category; })) cat.value = d.category;
        if (aud.value !== 'people' && d.audience) aud.value = d.audience;
        urgent.checked = !!d.urgent;
        aiMsg.textContent = 'Drafted. Read it, edit anything you like, then post.';
      }).catch(function (e) { aiMsg.textContent = e.message; }).then(function () { aiBtn.disabled = false; aiBtn.textContent = 'Write it again'; });
    } });
    return el('div', { class: 'nc-form open' }, [
      gist, el('div', { class: 'nc-row' }, [aiBtn]), aiMsg,
      fld('title', el('input', { type: 'text', maxlength: 140, placeholder: 'Title', 'aria-label': 'Title' })),
      fld('body', el('textarea', { maxlength: 600, placeholder: 'What should people know?', 'aria-label': 'Message' })),
      el('div', { class: 'nc-row' }, [aud, cat]),
      people,
      el('div', { class: 'nc-row' }, [
        fld('link', el('input', { type: 'text', placeholder: 'Optional link (https://...)', 'aria-label': 'Link' })),
        fld('exp', el('select', { 'aria-label': 'Expires' }, [el('option', { value: '', text: 'No expiry' }), el('option', { value: '3', text: 'Expires in 3 days' }), el('option', { value: '7', text: 'Expires in 7 days' }), el('option', { value: '30', text: 'Expires in 30 days' })]))]),
      el('label', { for: 'ncUrgent', style: 'display:flex;gap:8px;align-items:center;cursor:pointer' }, [urgent, 'Urgent (ignores muted categories)']),
      el('div', { class: 'nc-row' }, [send, el('button', { class: 'nc-btn ghost', type: 'button', text: 'Cancel', onclick: function () { S.showForm = false; draw(); } })]),
      msg]);
  }
  function postedBox() {
    if (!S.posted.length) return null;
    return el('div', { style: 'border-bottom:1px solid #E3E9F0' }, [el('p', { class: 'nc-m', style: 'padding:8px 14px 0;margin:0', text: 'Your recent announcements' })].concat(S.posted.slice(0, 5).map(function (p) {
      return el('div', { class: 'nc-posted' }, [el('span', { text: p.title + ' (' + p.reads + ' read)' }), el('button', { class: 'nc-link', type: 'button', text: 'Delete', onclick: function () { api('/api/admin/notices/' + p.id, { method: 'DELETE' }).then(function () { return Promise.all([load(), loadPosted()]); }).catch(function () {}); } })]);
    })));
  }

  function draw() {
    if (!bell) return;
    var u = unread();
    badge.textContent = u > 99 ? '99+' : String(u);
    badge.style.display = u ? '' : 'none';
    bell.setAttribute('aria-label', u ? 'Notifications, ' + u + ' unread' : 'Notifications');
    panel.className = 'nc-panel' + (S.open ? ' open' : '');
    bell.setAttribute('aria-expanded', S.open ? 'true' : 'false');
    if (!S.open) return;
    panel.textContent = '';
    var list = shown();
    var top = el('div', { class: 'nc-top' }, [el('b', { text: 'Notifications' }),
      u ? el('button', { class: 'nc-link', type: 'button', text: 'Mark all read', onclick: function () { markRead(list); } }) : null,
      el('button', { class: 'nc-link', type: 'button', text: 'Filter', 'aria-expanded': S.showMute ? 'true' : 'false', onclick: function () { S.showMute = !S.showMute; draw(); } })]);
    var mute = el('div', { class: 'nc-mute' + (S.showMute ? ' open' : '') }, [el('p', { text: 'Untick a category to stop seeing it. Urgent posts always show.' })].concat(S.cats.map(function (c) {
      var cb = el('input', { type: 'checkbox', onchange: function () { saveMute(c.key, !cb.checked); } });
      cb.checked = S.muted.indexOf(c.key) === -1;
      return el('label', {}, [cb, c.label]);
    })));
    var stale = S.build && S.firstBuild && S.build !== S.firstBuild
      ? el('div', { class: 'nc-refresh' }, [el('span', { text: 'A new version of the tool is ready.' }), el('button', { type: 'button', text: 'Refresh', onclick: function () { window.location.reload(); } })]) : null;
    function itemNode(i) {
      return el('button', { class: 'nc-item' + (i.read ? '' : ' unread') + (i.urgent ? ' urgent' : ''), type: 'button', onclick: function () { openItem(i); } }, [
        el('div', { class: 'nc-t', text: i.title }),
        i.body ? el('div', { class: 'nc-b', text: i.body }) : null,
        el('div', { class: 'nc-m' }, [el('span', { class: 'nc-chip', text: catLabel(i.category) }), el('span', { text: ago(i.at) })])]);
    }
    // Grouped by type, in the order of the category list; newest first inside each group
    var groups = [];
    S.cats.forEach(function (c) { var g = list.filter(function (i) { return i.category === c.key; }); if (g.length) groups.push({ label: c.label, items: g }); });
    var known = S.cats.map(function (c) { return c.key; });
    var rest = list.filter(function (i) { return known.indexOf(i.category) === -1; }); if (rest.length) groups.push({ label: 'Other', items: rest });
    var nodes = [];
    groups.forEach(function (g) {
      var un = g.items.filter(function (i) { return !i.read; }).length;
      nodes.push(el('div', { class: 'nc-grp', role: 'heading', 'aria-level': '3' }, [el('span', { text: g.label }), el('span', { class: 'nc-grp-n' + (un ? ' on' : ''), text: un ? un + ' new' : String(g.items.length) })]));
      g.items.forEach(function (i) { nodes.push(itemNode(i)); });
    });
    var body = el('div', { class: 'nc-list' }, nodes.length ? nodes : [el('div', { class: 'nc-empty', text: S.err ? 'Could not load notifications. Retrying soon.' : 'Nothing new. You are all caught up.' })]);
    var foot = S.admin ? el('div', { class: 'nc-foot' }, [el('button', { class: 'nc-btn', type: 'button', text: S.showForm ? 'Close form' : 'New announcement', onclick: function () { S.showForm = !S.showForm; if (S.showForm) loadPosted(); draw(); } })]) : null;
    [top, mute, stale, S.admin && S.showForm ? formBox() : null, S.admin && S.showForm ? postedBox() : null, body, foot].forEach(function (n) { if (n) panel.appendChild(n); });
  }

  function toggle(force) {
    S.open = typeof force === 'boolean' ? force : !S.open;
    draw();
    if (S.open) load();
  }
  function poll() { if (!document.hidden && bell && bell.isConnected) load(); }
  function mount() {
    var right = document.querySelector('header .hdr-right');
    var logout = right && right.querySelector('.logout-btn');
    if (!right || !logout || document.getElementById('ncBell')) return !!document.getElementById('ncBell');
    bell = el('button', { id: 'ncBell', class: 'nc-bell', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Notifications', title: 'Notifications', onclick: function (e) { e.stopPropagation(); toggle(); } });
    bell.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2a6 6 0 0 1 6 6c0 3.5 1.5 5 1.5 5h-15S4 11.5 4 8a6 6 0 0 1 6-6z"/><path d="M8.7 17a1.4 1.4 0 0 0 2.6 0"/></svg>';
    badge = el('span', { class: 'nc-badge', style: 'display:none', 'aria-hidden': 'true' });
    bell.appendChild(badge);
    panel = el('div', { class: 'nc-panel', role: 'dialog', 'aria-label': 'Notifications' });
    var wrap = el('div', { class: 'nc-wrap' }, [bell]);
    right.insertBefore(wrap, logout);
    document.body.appendChild(panel);
    document.addEventListener('click', function (e) { if (S.open && e.target.isConnected && !wrap.contains(e.target) && !panel.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) { toggle(false); bell.focus(); } });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
    return true;
  }
  function start() {
    // The header exists from page load but only belongs to signed-in users: wait for a session.
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (!document.documentElement.classList.contains('app-authenticated') && tries < 600) return;
      clearInterval(t);
      if (!mount()) return;
      load();
      S.timer = setInterval(poll, 60000);
    }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.ToolNotices = { refresh: load, open: function () { toggle(true); } };
})();
