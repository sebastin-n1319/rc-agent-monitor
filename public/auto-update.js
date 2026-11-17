/* Batch 394: every open tab refreshes itself after an update, at a quiet moment.
   The page asks the server for its version once a minute. When it changed, the page waits until the person has not
   touched it for 45 seconds and is not in the middle of typing, then reloads (spread over up to a minute so the
   whole team does not reload in the same second). Hidden tabs reload at once, unless something is typed in them. */
(function () {
  'use strict';
  var POLL_MS = 60000, QUIET_MS = 45000, CHECK_MS = 10000, KEY = 'rcAutoUpd';
  var base = null, lastInput = Date.now(), waiting = false, timer = null;

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true });
  });

  function version() {
    return fetch('/api/app-version', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.version ? String(d.version) : null; })
      .catch(function () { return null; });
  }
  function typing() {
    var a = document.activeElement;
    if (!a || a === document.body) return false;
    var tag = (a.tagName || '').toLowerCase();
    if (a.isContentEditable) return (a.textContent || '').trim().length > 0;
    if (tag === 'textarea') return (a.value || '').trim().length > 0;
    if (tag === 'input' && /^(text|search|email|url|tel|number|)$/i.test(a.type || '')) return (a.value || '').trim().length > 0;
    return false;
  }
  // Two quick update reloads in a row is as many as one page makes; the next one waits for the next poll cycle.
  function tooMany() {
    try {
      var n = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(function (t) { return Date.now() - t < 5 * 60000; });
      return n.length >= 2;
    } catch (e) { return false; }
  }
  function mark() {
    try {
      var n = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(function (t) { return Date.now() - t < 5 * 60000; });
      n.push(Date.now()); sessionStorage.setItem(KEY, JSON.stringify(n));
    } catch (e) { /* the reload still happens */ }
  }
  function notice() {
    var d = document.createElement('div');
    d.setAttribute('role', 'status');
    d.textContent = 'Updating to the latest version...';
    d.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;background:#072B40;color:#fff;padding:10px 18px;border-radius:999px;font:600 13px Poppins,system-ui,sans-serif;box-shadow:0 8px 24px rgba(7,43,64,.3)';
    document.body.appendChild(d);
  }
  function go() {
    if (tooMany()) { waiting = false; return 'done'; }
    if (typing()) return 'wait';
    var quiet = Date.now() - lastInput >= QUIET_MS;
    if (document.visibilityState === 'visible' && !quiet) return 'wait';
    mark();
    if (document.visibilityState === 'visible') { notice(); setTimeout(function () { location.reload(); }, 1200); }
    else location.reload();
    return 'done';
  }
  function changed() {
    if (waiting) return;
    waiting = true;
    // Spread the team's reloads over up to a minute after the restart.
    setTimeout(function tick() {
      if (go() === 'wait') timer = setTimeout(tick, CHECK_MS);
    }, Math.floor(Math.random() * 45000));
  }
  function poll() {
    if (waiting) return;
    version().then(function (v) {
      if (!v) return;
      if (base === null) { base = v; return; }
      if (v !== base) changed();
    });
  }
  function init() {
    version().then(function (v) { base = v; });
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') poll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
