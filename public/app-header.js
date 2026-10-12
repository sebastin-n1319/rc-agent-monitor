/* Header profile menu: identity, switch view, replay tours, go to a page, search, shortcuts, dark mode, sign out. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  // The app keeps these in top-level let variables, so read them by name with a guard.
  var V = {
    currentUser: function () { return typeof currentUser !== 'undefined' ? currentUser : null; },
    currentEmail: function () { return typeof currentEmail !== 'undefined' ? currentEmail : null; },
    currentRole: function () { return typeof currentRole !== 'undefined' ? currentRole : null; },
    currentViewMode: function () { return typeof currentViewMode !== 'undefined' ? currentViewMode : null; },
    currentTZ: function () { return typeof currentTZ !== 'undefined' ? currentTZ : null; }
  };
  var g = function (name, d) { try { var v = V[name](); return v == null ? d : v; } catch (e) { return d; } };
  var open = false, view = 'main';

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length || p[0] === '--') return '?';
    return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function isAdminView() { return g('currentRole', null) === 'admin' && g('currentViewMode', 'admin') === 'admin'; }

  function sync() {
    var full = g('currentUser', null) || ($('userLabel') && $('userLabel').textContent) || '';
    var role = g('currentRole', null);
    var ini = initials(full);
    if ($('hmInit')) $('hmInit').textContent = ini;
    if ($('hmFull')) $('hmFull').textContent = full || 'Signed in';
    if ($('hmEmail')) $('hmEmail').textContent = g('currentEmail', '') || '';
    var av = $('userAvatar'), card = $('hmCardAv');
    if (card) {
      var src = av && av.getAttribute('src') && av.style.display !== 'none' ? av.src : '';
      if (src) { if (!card.querySelector('img') || card.querySelector('img').src !== src) { card.replaceChildren(); var im = document.createElement('img'); im.alt = ''; im.src = src; card.appendChild(im); } }
      else card.textContent = ini;
    }
    var vText = role === 'admin' ? (isAdminView() ? 'Admin view' : 'Agent view') : (role === 'agent' ? 'Agent' : '');
    if ($('hmSub')) $('hmSub').textContent = role === 'admin' ? (isAdminView() ? 'Admin' : 'Admin in agent view') : (role ? 'Agent' : 'Signed in');
    if ($('hmWs')) { var ws = role === 'admin' ? (isAdminView() ? 'Admin' : 'Agent view') : (role ? 'Agent' : ''); if ($('hmWs').textContent !== ws) $('hmWs').textContent = ws; $('hmWs').setAttribute('data-v', role === 'admin' && isAdminView() ? 'admin' : 'agent'); }
    if ($('hmViewTag')) { $('hmViewTag').textContent = vText; $('hmViewTag').hidden = role !== 'admin'; }
    var tz = g('currentTZ', 'CST');
    document.querySelectorAll('.hm-tz').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-tz') === tz ? 'true' : 'false'); });
    var dark = document.documentElement.classList.contains('dark-mode');
    if ($('hmDark')) $('hmDark').setAttribute('aria-checked', dark ? 'true' : 'false');
  }

  function items() {
    var menu = $('hmMenu'); if (!menu) return [];
    var v = menu.querySelector('.hm-view:not([hidden])');
    return v ? Array.prototype.filter.call(v.querySelectorAll('button, input'), function (b) { return b.offsetParent !== null && !b.disabled; }) : [];
  }
  function focusFirst() {
    if (view === 'pages' && $('hmPageQ')) { $('hmPageQ').focus(); return; }
    var l = items(); var t = view === 'main' ? l[0] : (l[1] || l[0]);
    if (t) t.focus();
  }

  function show(v) {
    view = v;
    document.querySelectorAll('#hmMenu .hm-view').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== v; });
    if (v === 'pages') { $('hmPageQ').value = ''; drawPages(''); }
    if (v === 'tours') drawTours();
    setTimeout(focusFirst, 20);
  }
  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    var menu = $('hmMenu'), me = $('hmMe');
    if (!menu || !me) return;
    if (open) { sync(); place(); show('main'); menu.hidden = false; me.setAttribute('aria-expanded', 'true'); requestAnimationFrame(function () { menu.classList.add('in'); }); }
    else { menu.classList.remove('in'); menu.hidden = true; me.setAttribute('aria-expanded', 'false'); }
  }
  // The menu lives on <body> (the header clips overflow), so line it up under the profile button.
  function place() {
    var menu = $('hmMenu'), me = $('hmMe'); if (!menu || !me) return;
    if (window.matchMedia('(max-width: 640px)').matches) { menu.style.top = ''; menu.style.right = ''; return; }
    var r = me.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
  }
  function close(refocus) { if (!open) return; toggle(false); if (refocus) { var me = $('hmMe'); if (me) me.focus(); } }

  // ── Pages: read straight from the sidebar the person can see ──
  function sidebar() {
    var a = $('adit-admin-sidebar'), b = $('adit-agent-sidebar');
    if (a && getComputedStyle(a).display !== 'none') return a;
    if (b && getComputedStyle(b).display !== 'none') return b;
    return isAdminView() ? a : b;
  }
  function drawPages(q) {
    var host = $('hmPages'), sb = sidebar(); if (!host) return;
    q = String(q || '').trim().toLowerCase();
    var list = sb ? Array.prototype.filter.call(sb.querySelectorAll('.sb-item'), function (it) { return getComputedStyle(it).display !== 'none' && it.querySelector('.sb-label'); }) : [];
    var rows = list.map(function (it) {
      var name = it.querySelector('.sb-label').textContent.trim();
      var hint = (it.getAttribute('title') || '').replace(/^[^:]*:\s*/, '');
      if (hint.toLowerCase() === name.toLowerCase()) hint = '';
      return { it: it, name: name, hint: hint, on: it.classList.contains('active') };
    }).filter(function (r) { return !q || (r.name + ' ' + r.hint).toLowerCase().indexOf(q) !== -1; });
    host.replaceChildren();
    if (!rows.length) { var p = document.createElement('p'); p.className = 'hm-empty'; p.textContent = q ? 'No page matches "' + q + '".' : 'No pages to show yet.'; host.appendChild(p); return; }
    rows.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hm-row hm-page' + (r.on ? ' on' : '');
      var ic = r.it.querySelector('svg'); var icw = document.createElement('span'); icw.className = 'hm-pic'; icw.setAttribute('aria-hidden', 'true'); if (ic) icw.appendChild(ic.cloneNode(true)); b.appendChild(icw);
      var t = document.createElement('span'); t.textContent = r.name; b.appendChild(t);
      if (r.on) { var c = document.createElement('small'); c.className = 'hm-cur'; c.textContent = 'You are here'; b.appendChild(c); }
      else if (r.hint) { var h = document.createElement('small'); h.textContent = r.hint; b.appendChild(h); }
      if (r.on) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', function () { close(false); r.it.click(); });
      host.appendChild(b);
    });
  }

  // ── Tours ──
  function drawTours() {
    var host = $('hmTours'); if (!host) return;
    host.replaceChildren();
    var T = window.ClientTour;
    var list = T && T.list ? T.list() : [];
    if (!list.length) { var p = document.createElement('p'); p.className = 'hm-empty'; p.textContent = 'Tours are still loading. Try again in a moment.'; host.appendChild(p); return; }
    list.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hm-row hm-tour'; b.setAttribute('data-ic', t.icon || 'tour');
      var s = document.createElement('span'); s.textContent = t.title; b.appendChild(s);
      var sm = document.createElement('small'); sm.textContent = t.blurb + ' · ' + t.steps + ' steps'; b.appendChild(sm);
      var st = document.createElement('em'); st.className = 'hm-st'; b.appendChild(st);
      if (t.status) T.status(t.id).then(function (d) { st.textContent = d ? 'Done' : 'New'; st.className = 'hm-st ' + (d ? 'done' : 'new'); }).catch(function () {});
      b.addEventListener('click', function () { close(false); T.replay(t.id); });
      host.appendChild(b);
    });
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (view !== 'main') show('main'); else close(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var l = items(); if (!l.length) return;
      var i = l.indexOf(document.activeElement);
      e.preventDefault();
      var n = e.key === 'ArrowDown' ? (i + 1) % l.length : (i <= 0 ? l.length - 1 : i - 1);
      l[n].focus();
      return;
    }
    if (e.key === 'Tab') {
      var f = items(); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.key === 'Enter' && document.activeElement === $('hmPageQ')) { var first = document.querySelector('#hmPages .hm-page'); if (first) { e.preventDefault(); first.click(); } }
  }

  // ── Current page name in the header, with a short slide when it changes ──
  var lastPage = '';
  function pageName() {
    var sb = sidebar(); var it = sb && sb.querySelector('.sb-item.active');
    if (!it) return '';
    var t = (it.getAttribute('title') || '').split(':')[0].split(',')[0].trim();
    var l = it.querySelector('.sb-label'); var lab = l ? l.textContent.trim() : '';
    return (t && t.length <= 32 ? t : lab) || lab;
  }
  function syncPage() {
    var host = document.querySelector('.hm-page'); if (!host) return;
    var name = pageName(); if (!name || name === lastPage) return;
    var first = !lastPage; lastPage = name;
    var cur = host.querySelector('.hm-page-t:not(.out)');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (first || reduce || !cur) { if (cur) cur.textContent = name; else { var c = document.createElement('span'); c.className = 'hm-page-t'; c.textContent = name; host.appendChild(c); } return; }
    var nx = document.createElement('span'); nx.className = 'hm-page-t in'; nx.textContent = name;
    cur.classList.add('out'); cur.removeAttribute('id');
    host.appendChild(nx); nx.id = 'hmPage';
    setTimeout(function () { if (cur.parentNode) cur.remove(); nx.classList.remove('in'); }, 320);
    var bar = $('hmProgress'); if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); }
  }

  function setTZ(z) { if (g('currentTZ', 'CST') !== z && typeof window.toggleTZ === 'function') window.toggleTZ(); sync(); }

  function init() {
    var wrap = $('hmMeWrap'), menu = $('hmMenu'); if (!wrap || !menu) return;
    document.body.appendChild(menu);
    window.addEventListener('resize', function () { if (open) place(); });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', function (e) { if (open && !wrap.contains(e.target) && !menu.contains(e.target)) close(false); });
    var q = $('hmPageQ'); if (q) q.addEventListener('input', function () { drawPages(q.value); });
    var pending = false;
    var mo = new MutationObserver(function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; sync(); }); });
    ['userLabel', 'userRoleTag', 'viewToggleBtn', 'userAvatar'].forEach(function (id) { var el = $(id); if (el) mo.observe(el, { attributes: true, childList: true, characterData: true, subtree: true }); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Watch the sidebars for the active page.
    var po = new MutationObserver(function () { requestAnimationFrame(syncPage); });
    ['adit-admin-sidebar', 'adit-agent-sidebar'].forEach(function (id) { var el = $(id); if (el) po.observe(el, { attributes: true, attributeFilter: ['class', 'style'], subtree: true }); });
    sync(); syncPage();
  }

  window.hmToggle = function () { toggle(); };
  window.hmClose = function () { close(false); };
  window.hmShow = show;
  window.hmSync = sync;
  window.hmSetTZ = setTZ;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
