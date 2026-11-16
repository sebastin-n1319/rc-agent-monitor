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
    if (document.getElementById('ob-css2')) return;
    var st = document.createElement('style'); st.id = 'ob-css2';
    // Batch 352: the banner is a fixed card under the top bar (it was squeezed into the page layout and its colours
    // were overridden). Every rule is !important so page styles cannot reach it.
    st.textContent = '#ob-root{position:fixed!important;top:76px!important;left:50%!important;transform:translateX(-50%)!important;width:min(980px,calc(100vw - 32px))!important;max-height:calc(100vh - 100px)!important;overflow:auto!important;z-index:2147483000!important;' +
      'background:#7f1d1d!important;color:#fff!important;padding:12px 16px!important;border-radius:12px!important;font:400 14px/1.45 Poppins,system-ui,sans-serif!important;box-shadow:0 12px 32px rgba(0,0,0,.3)!important;text-align:left!important}' +
      '#ob-root *{color:#fff!important;background:transparent!important;font-family:inherit!important;letter-spacing:normal!important;text-transform:none!important}' +
      '#ob-root .ob-row{display:flex!important;gap:12px!important;align-items:flex-start!important;width:100%!important}#ob-root .ob-main{flex:1 1 auto!important;min-width:0!important;display:block!important}#ob-root b{font-weight:700!important}' +
      '#ob-root details{display:block!important;margin-top:6px!important}#ob-root summary{display:list-item!important;cursor:pointer!important;font-weight:600!important;min-height:24px!important}' +
      '#ob-root summary:focus-visible,#ob-root button:focus-visible,#ob-root a:focus-visible{outline:2px solid #fff!important;outline-offset:2px!important}' +
      '#ob-root ul{display:block!important;margin:6px 0 0!important;padding-left:18px!important;list-style:disc!important}#ob-root li{display:list-item!important;margin:2px 0!important}#ob-root a{text-decoration:underline!important}' +
      '#ob-root .ob-x{flex:none!important;border:1px solid rgba(255,255,255,.6)!important;border-radius:8px!important;min-width:32px!important;min-height:32px!important;cursor:pointer!important;font-size:16px!important;line-height:1!important}' +
      '#ob-root .ob-tk{list-style:none!important;padding:0!important;max-height:240px!important;overflow:auto!important}#ob-root .ob-sub{opacity:.9!important;margin-top:2px!important}' +
      '@media (max-width:700px){#ob-root{top:64px!important}}';
    document.head.appendChild(st);
  }
  function ct(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); } catch (e) { return ''; } }
  function paint(a) {
    if (box) { box.remove(); box = null; }
    if (!a) return;
    var d = dismissed(); if (d.id === a.id && (a.practices || 0) <= (d.practices || 0)) return;
    css();
    var tickets = (a.tickets || []).slice().reverse();
    box = h('div', { id: 'ob-root', class: 'ob', role: 'alert', 'aria-live': 'assertive' }, [h('div', { class: 'ob-row' }, [
      h('div', { class: 'ob-main' }, [
        h('div', null, [h('b', { text: a.headline || 'Possible phones outage' })]),
        a.mix ? h('div', { class: 'ob-sub', text: 'By voice version: ' + a.mix + (a.sharedError ? '. ' + a.sharedError : '') }) : a.sub ? h('div', { class: 'ob-sub', text: a.sub }) : null,
        h('details', null, [h('summary', { text: 'What to do' }), h('ul', null, (a.asks || []).map(function (x) { return h('li', { text: x }); }))]),
        tickets.length ? h('details', null, [h('summary', { text: (a.kind === 'issue' ? 'Reports (' : 'Tickets (') + tickets.length + ')' }), h('ul', { class: 'ob-tk' }, tickets.map(function (t) {
          // Batch 351: repeated-issue reports come from tickets, chats and calls; each shows its source and what the client said.
          if (a.kind === 'issue') return h('li', { style: 'flex-basis:100%' }, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }) : (t.kind || 'Report') + (t.number ? ' ' + t.number : ''), ' ' + ct(t.at) + (t.text ? ': ' + t.text : '')]);
          return h('li', null, [t.url ? h('a', { href: t.url, target: '_blank', rel: 'noopener', text: '#' + t.number }) : '#' + t.number, ' ' + (t.practice || '') + ' · ' + (t.version || '') + ' · ' + ct(t.at)]);
        }))]) : null]),
      h('button', { type: 'button', class: 'ob-x', 'aria-label': 'Hide this alert', title: 'Hide (it comes back if more practices report it)', onclick: function () { setDismissed(a); paint(null); }, text: '\u00d7' })])]);
    document.body.appendChild(box);
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
