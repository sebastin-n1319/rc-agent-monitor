/* Batch 391: who is online in the tool. Every signed-in tab sends a beat; admins (leads) see an "Online now" list in the header. */
(function () {
  'use strict';
  var BEAT_MS = 60000, LIST_MS = 30000, IDLE_MS = 5 * 60000;
  var lastInput = Date.now(), beatTimer = null, listTimer = null, open = false, last = [];
  var $ = function (id) { return document.getElementById(id); };
  function role() { try { return typeof currentRole !== 'undefined' ? currentRole : null; } catch (e) { return null; } }
  function signedIn() { return document.documentElement.classList.contains('app-authenticated') && !!role(); }
  function isAdmin() { return role() === 'admin'; }
  function page() {
    var it = document.querySelector('#adit-admin-sidebar .sb-item.active, #adit-agent-sidebar .sb-item.active');
    if (!it || it.offsetParent === null) return '';
    var l = it.querySelector('.sb-label'); return l ? l.textContent.trim().slice(0, 40) : '';
  }
  function active() { return document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS; }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { var was = Date.now() - lastInput >= IDLE_MS; lastInput = Date.now(); if (was) beat(); }, { passive: true, capture: true });
  });

  function beat() {
    if (!signedIn()) return;
    fetch('/api/presence/beat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: active(), page: page() }) }).catch(function () {});
  }
  function bye() {
    if (!signedIn()) return;
    try { navigator.sendBeacon('/api/presence/bye', new Blob(['{}'], { type: 'application/json' })); } catch (e) { /* the beat simply times out */ }
  }

  function initials(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function av(p, cls) {
    var s = document.createElement('span'); s.className = cls;
    if (p.picture) { var i = document.createElement('img'); i.src = p.picture; i.alt = ''; i.referrerPolicy = 'no-referrer'; i.loading = 'lazy'; i.onerror = function () { i.remove(); s.textContent = initials(p.name); }; s.appendChild(i); }
    else s.textContent = initials(p.name);
    return s;
  }
  function ago(ms) { var m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }

  function drawButton() {
    var b = $('onBtn'); if (!b) return;
    var stack = $('onStack'), n = $('onCount'), act = last.filter(function (p) { return p.status === 'active'; }).length;
    stack.textContent = '';
    last.slice(0, 3).forEach(function (p) { stack.appendChild(av(p, 'on-av')); });
    n.textContent = last.length + ' online';
    b.setAttribute('aria-label', last.length + ' online now, ' + act + ' active. Show who is online');
  }
  function drawList() {
    var box = $('onList'); if (!box) return;
    box.textContent = '';
    var hd = $('onHead'); if (hd) hd.textContent = last.length ? last.length + ' online now' : 'No one else is online';
    last.forEach(function (p) {
      var row = document.createElement('li'); row.className = 'on-row';
      var a = av(p, 'on-av lg'); var dot = document.createElement('span'); dot.className = 'on-dot ' + p.status; a.appendChild(dot);
      var who = document.createElement('span'); who.className = 'on-who';
      var nm = document.createElement('span'); nm.className = 'on-name'; nm.textContent = p.name + (p.me ? ' (you)' : '');
      var sub = document.createElement('span'); sub.className = 'on-sub';
      sub.textContent = (p.status === 'idle' ? 'Idle ' + p.idleMin + ' min' : 'Active') + (p.page ? ' · ' + p.page : '') + ' · open for ' + ago(Date.now() - p.since);
      who.appendChild(nm); who.appendChild(sub); row.appendChild(a); row.appendChild(who); box.appendChild(row);
    });
  }
  function load() {
    if (!isAdmin() || document.visibilityState !== 'visible') return;
    fetch('/api/presence', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.success) return;
      last = d.online || []; var w = $('onWrap'); if (w) w.hidden = false;
      drawButton(); if (open) drawList();
    }).catch(function () {});
  }
  function toggle(force) {
    var pop = $('onPop'), b = $('onBtn'); if (!pop || !b) return;
    open = typeof force === 'boolean' ? force : !open;
    pop.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { drawList(); load(); }
  }

  function start() {
    beat(); if (!beatTimer) beatTimer = setInterval(beat, BEAT_MS);
    var w = $('onWrap');
    if (isAdmin()) { load(); if (!listTimer) listTimer = setInterval(load, LIST_MS); }
    else { if (w) w.hidden = true; if (listTimer) { clearInterval(listTimer); listTimer = null; } }
  }
  function init() {
    var b = $('onBtn');
    if (b) b.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener('mousedown', function (e) { var w = $('onWrap'); if (open && w && !w.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { toggle(false); var bb = $('onBtn'); if (bb) bb.focus(); } });
    document.addEventListener('visibilitychange', function () { beat(); if (document.visibilityState === 'visible') load(); });
    window.addEventListener('pagehide', bye);
    if (signedIn()) start();
    new MutationObserver(function () {
      if (signedIn()) start();
      else { var w = $('onWrap'); if (w) w.hidden = true; }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // The role can arrive after the page is marked signed in.
    var tries = 0, t = setInterval(function () { tries++; if (signedIn()) { start(); clearInterval(t); } else if (tries > 30) clearInterval(t); }, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
