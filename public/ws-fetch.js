/**
 * Batch 360: every call this page makes to the tool's API says which workspace it is for (T1 CS or Adit Pay), so the
 * server answers with that workspace's people, calls and tickets only. Loaded first, before any other script, so no
 * request goes out without it. The server checks the person really has that workspace.
 */
(function () {
  'use strict';
  function current() {
    try {
      var list = JSON.parse(localStorage.getItem('rcWorkspaces') || 'null'), saved = localStorage.getItem('rcWorkspace');
      if (Array.isArray(list) && list.length) return list.indexOf(saved) >= 0 ? saved : (list.indexOf('t1') >= 0 ? 't1' : list[0]);
      return saved || '';
    } catch (e) { return ''; }
  }
  window.__ws = current();
  function ours(url) {
    if (!url) return false;
    if (url.charAt(0) === '/') return url.indexOf('/api/') === 0;
    try { var u = new URL(url, location.href); return u.origin === location.origin && u.pathname.indexOf('/api/') === 0; } catch (e) { return false; }
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (window.__ws && ours(url)) {
          init = Object.assign({}, init || {});
          var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
          if (!h.has('X-Workspace')) h.set('X-Workspace', window.__ws);
          init.headers = h;
        }
      } catch (e) { /* send as it was */ }
      return origFetch.call(this, input, init);
    };
  }
  var OrigES = window.EventSource;
  if (OrigES) {
    var ES = function (url, cfg) {
      try { if (window.__ws && ours(String(url))) url = String(url) + (String(url).indexOf('?') >= 0 ? '&' : '?') + 'ws=' + encodeURIComponent(window.__ws); } catch (e) { /* as it was */ }
      return new OrigES(url, cfg);
    };
    ES.prototype = OrigES.prototype; ES.CONNECTING = 0; ES.OPEN = 1; ES.CLOSED = 2;
    window.EventSource = ES;
  }
  var origOpen = window.XMLHttpRequest && XMLHttpRequest.prototype.open;
  if (origOpen) {
    XMLHttpRequest.prototype.open = function (m, url) {
      this.__wsUrl = url; return origOpen.apply(this, arguments);
    };
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      try { if (window.__ws && ours(String(this.__wsUrl || ''))) this.setRequestHeader('X-Workspace', window.__ws); } catch (e) { /* as it was */ }
      return origSend.apply(this, arguments);
    };
  }
  if (window.__ws === 'aditpay') document.documentElement.classList.add('ws-aditpay-early');
})();
