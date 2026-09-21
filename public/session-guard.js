/**
 * session-guard.js — Session 37
 *
 * Global 401 handler.
 *
 * The app's optimistic boot flow (see index.html's initSession()) renders
 * the authenticated shell straight from a locally-cached session
 * (localStorage.rcSession, kept valid client-side for up to 7 days)
 * without first confirming the actual server-side cookie (a 12h rolling
 * TTL, see requireAuth()/getAppSession() in server.js/database.js) is
 * still good. That's intentional — it's what makes a reload instant
 * instead of round-tripping to the server first — but it means a tab
 * left open past 12h keeps showing "logged in" while every real API
 * call underneath it quietly starts failing with 401, and until now
 * nothing caught that centrally: each module just rendered its own raw
 * "❌ HTTP 401" error tile with no way back to sign-in (reported by
 * Sebastin: "frequently getting this error, not just here — everywhere,
 * in agent view also").
 *
 * This wraps window.fetch once, as early as possible (same
 * load-me-first convention as adit-reset.js), and watches every
 * same-origin /api/* response for a 401. On the first one, it shows a
 * toast (if the toast system has loaded yet — it usually has, since
 * real API calls only start well after boot) and hands off to the
 * app's own doLogout() after a short delay, which cleanly clears the
 * stale local cache and returns to the Google sign-in screen — instead
 * of leaving the user staring at a broken data panel with no obvious
 * next step.
 *
 * Deliberately does NOT alter the response handed back to the original
 * caller — every existing fetch().then(...) call site keeps working
 * exactly as it did before; this is a pure side-effect observer, not a
 * replacement for each module's own error handling.
 */
(function () {
  'use strict';

  if (typeof window.fetch !== 'function') return;

  var _handling = false;

  function isGuardedApiPath(url) {
    try {
      var u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return false;
      // /api/session never actually returns 401 -- an invalid/missing
      // cookie gets a 200 {success:false} instead, by design (see
      // server.js) -- but excluding it here is cheap insurance against
      // this guard ever reacting to its own logout DELETE call.
      return u.pathname.indexOf('/api/') === 0 && u.pathname !== '/api/session';
    } catch (e) {
      return false;
    }
  }

  function handleExpired() {
    if (_handling) return;
    _handling = true;
    var toastShown = false;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast('Your session has expired — signing you out', 'error', 2500);
        toastShown = true;
      }
    } catch (e) { /* never let the guard itself break the page */ }
    setTimeout(function () {
      try {
        if (typeof window.doLogout === 'function') window.doLogout();
        else window.location.reload();
      } catch (e) {
        window.location.reload();
      }
    }, toastShown ? 1100 : 0);
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    return origFetch(input, init).then(function (response) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (response && response.status === 401 && isGuardedApiPath(url)) {
          handleExpired();
        }
      } catch (e) { /* never let the guard break a real request */ }
      return response;
    });
  };
})();
