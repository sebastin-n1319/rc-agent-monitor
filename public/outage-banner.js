/* Batch 287: outage banner. Shows an active outage alert from the outage watch to everyone signed in to the tool.
   Checks once a minute while the tab is visible. Dismissed per alert; it comes back if more practices are affected. */
(function () {
  'use strict';
  var KEY = 'rcOutageDismissed', box = null, last = null;
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v == null || v === false) return; if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function dismissed() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function setDismissed(a) { try { localStorage.setItem(KEY, JSON.stringify({ id: a.id, practices: a.practices })); } catch (e) { /* private mode */ } }
  function css() {
    if (document.getElementById('ob-css')) return;
    var st = document.createElement('style'); st.id = 'ob-css';
    st.textContent = '.ob{position:sticky;top:0;z-index:9000;background:#7f1d1d;color:#fff;padding:10px 16px;font-size:14px;line-height:1.45;box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
      '.ob-row{display:flex;gap:12px;align-items:flex-start;max-width:1400px;margin:0 auto}.ob-main{flex:1;min-width:0}.ob b{font-weight:700}' +
      '.ob details{margin-top:6px}.ob summary{cursor:pointer;font-weight:600;min-height:28px;display:inline-flex;align-items:center}.ob summary:focus-visible,.ob button:focus-visible,.ob a:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
      '.ob ul{margin:6px 0 0;padding-left:18px}.ob a{color:#fff;text-decoration:underline}.ob-x{background:transparent;border:1px solid rgba(255,255,255,.6);color:#fff;border-radius:8px;min-width:32px;min-height:32px;cursor:pointer;font-size:16px}' +
      '.ob-tk{display:flex;flex-wrap:wrap;gap:4px 14px;list-style:none;padding:0}.ob-sub{opacity:.9}';
    document.head.appendChild(st);
  }
  function ct(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); } catch (e) { return ''; } }
  function paint(a) {
    if (box) { box.remove(); box = null; }
    if (!a) return;
    var d = dismissed(); if (d.id === a.id && (a.practices || 0) <= (d.practices || 0)) return;
    css();
    var tickets = (a.tickets || []).slice().reverse();
    box = h('div', { class: 'ob', role: 'alert', 'aria-live': 'assertive' }, [h('div', { class: 'ob-row' }, [
      h('div', { class: 'ob-main' }, [
        h('div', null, [h('b', { text: a.headline || 'Possible phones outage' })]),
        a.mix ? h('div', { class: 'ob-sub', text: 'By voice version: ' + a.mix + (a.sharedError ? '. ' + a.sharedError : '') }) : null,
        h('details', null, [h('summary', { text: 'What to do' }), h('ul', null, (a.asks || []).map(function (x) { return h('li', { text: x }); }))]),
        tickets.length ? h('details', null, [h('summary', { text: 'Tickets (' + tickets.length + ')' }), h('ul', { class: 'ob-tk' }, tickets.map(function (t) {
          return h('li', null, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }) : '#' + t.number, ' ' + (t.practice || '') + ' · ' + (t.version || '') + ' · ' + ct(t.at)]);
        }))]) : null]),
      h('button', { type: 'button', class: 'ob-x', 'aria-label': 'Hide this alert', title: 'Hide (it comes back if more practices report it)', onclick: function () { setDismissed(a); paint(null); }, text: '×' })])]);
    document.body.insertBefore(box, document.body.firstChild);
  }
  function poll() {
    if (document.visibilityState !== 'visible') return;
    if (!document.documentElement.classList.contains('app-authenticated')) return;
    fetch('/api/outage-watch', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var a = j && j.alert, sig = a ? a.id + ':' + a.practices + ':' + (a.tickets || []).length : '';
      if (sig !== last) { last = sig; paint(a); }
    }).catch(function () {});
  }
  setTimeout(poll, 4000); setInterval(poll, 60000);
  document.addEventListener('visibilitychange', poll);
})();
