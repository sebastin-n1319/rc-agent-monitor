/**
 * session-guard.js: Session 37
 *
 * Global 401 handler.
 *
 * The app's optimistic boot flow (see index.html's initSession()) renders
 * the authenticated shell straight from a locally-cached session
 * (localStorage.rcSession, kept valid client-side for up to 7 days)
 * without first confirming the actual server-side cookie (a 12h rolling
 * TTL, see requireAuth()/getAppSession() in server.js/database.js) is
 * still good. That's intentional, it's what makes a reload instant
 * instead of round-tripping to the server first, but it means a tab
 * left open past 12h keeps showing "logged in" while every real API
 * call underneath it quietly starts failing with 401, and until now
 * nothing caught that centrally: each module just rendered its own raw
 * "❌ HTTP 401" error tile with no way back to sign-in (reported by
 * Sebastin: "frequently getting this error, not just here, everywhere,
 * in agent view also").
 *
 * This wraps window.fetch once, as early as possible (same
 * load-me-first convention as adit-reset.js), and watches every
 * same-origin /api/* response for a 401. On the first one, it shows a
 * toast (if the toast system has loaded yet, it usually has, since
 * real API calls only start well after boot) and hands off to the
 * app's own doLogout() after a short delay, which cleanly clears the
 * stale local cache and returns to the Google sign-in screen, instead
 * of leaving the user staring at a broken data panel with no obvious
 * next step.
 *
 * Deliberately does NOT alter the response handed back to the original
 * caller, every existing fetch().then(...) call site keeps working
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

  // Batch 348: a 401 only signs you out when the server confirms the sign-in is really gone. Requests still running from
  // a sign-out, or sent in the moment before a fresh sign-in's cookie lands, used to show "Your session has expired" on
  // every sign-in and sign-out and could sign a fresh session straight back out.
  function signedInHere() { try { return !!(sessionStorage.getItem('rcUser') || localStorage.getItem('rcSession')); } catch (e) { return true; } }
  function handleExpired() {
    if (_handling || window.__rcLoggingOut || !signedInHere()) return;
    if (window.__rcLoginAt && Date.now() - window.__rcLoginAt < 15000) return;
    _handling = true;
    origFetch('/api/session', { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (s) {
      if (s && s.success) { _handling = false; return; } // still signed in: that request was just early or late
      expiredNow();
    }).catch(function () { _handling = false; });
  }
  function expiredNow() {
    var toastShown = false;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast('Your session has expired, signing you out', 'error', 2500);
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
        } else if (response && response.status === 403 && isGuardedApiPath(url) && window.location.pathname.indexOf('/assess') !== 0 && window.location.pathname.indexOf('/guides') !== 0) {
          // Session 56: an account outside the tool can only use /assess (Batch 156: or /guides).
          response.clone().json().then(function (b) {
            if (b && b.guidesOnly) window.location.replace('/guides');
            else if (b && b.assessmentOnly) window.location.replace('/assess');
          }).catch(function () {});
        }
      } catch (e) { /* never let the guard break a real request */ }
      return response;
    });
  };
})();
