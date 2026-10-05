/* Process and product updates: sidebar page, unread badge, and the must-read screen shown at sign-in. */
(function () {
  'use strict';
  var PU = window.PU = { state: null, gateShown: false };
  var BASE = (typeof BACKEND !== 'undefined' ? BACKEND : '');

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(path, body) {
    var o = { credentials: 'include', method: body ? 'POST' : 'GET' };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(BASE + path, o).then(function (r) { return r.json().catch(function () { return { success: false, error: 'HTTP ' + r.status }; }); });
  }
  function when(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function ago(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 60) return Math.max(1, m) + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    var days = Math.round(m / 1440); return days === 1 ? 'yesterday' : days + ' days ago';
  }
  function toast(msg) { try { if (typeof showToast === 'function') showToast(msg, 'success'); } catch (e) {} }

  function setBadge(n) {
    ['sb-agent-updates', 'agent-tab-updates'].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      var b = el.querySelector('.pu-badge');
      if (!b) { b = h('span', { class: 'pu-badge' }); el.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n); b.style.display = n ? '' : 'none';
    });
  }
  function load() {
    return api('/api/updates').then(function (j) {
      if (!j || j.success === false) return PU.state;
      PU.state = j; setBadge(j.unread || 0); return j;
    }).catch(function () { return PU.state; });
  }
  function isAdmin() { try { return typeof isAdminRole === 'function' && isAdminRole(); } catch (e) { return false; } }

  function card(u, opts) {
    var meta = [];
    if (u.category) meta.push(h('span', { class: 'pu-pill', text: u.category }));
    u.modules.forEach(function (m) { meta.push(h('span', { class: 'pu-chip', text: m })); });
    var posted = h('span', { class: 'pu-when', text: when(u.postedAt) + (u.postedAt ? ' (' + ago(u.postedAt) + ')' : '') });
    var body = [h('div', { class: 'pu-top' }, [h('h3', { text: u.title }), u.acked ? h('span', { class: 'pu-state ok', text: 'Read' }) : h('span', { class: 'pu-state new', text: 'New' })]),
      h('div', { class: 'pu-meta' }, [posted].concat(meta))];
    if (u.summary) body.push(h('p', { class: 'pu-sum', text: u.summary }));
    if (u.impact) body.push(h('p', { class: 'pu-imp' }, [h('b', { text: 'What it means for you: ' }), u.impact]));
    var foot = [h('a', { class: 'pu-link', href: u.url, target: '_blank', rel: 'noopener', text: 'Read the full update' + (u.screenshots ? ' (' + u.screenshots + ' screenshot' + (u.screenshots > 1 ? 's' : '') + ')' : '') })];
    if (opts && opts.extra) foot.push(opts.extra);
    body.push(h('div', { class: 'pu-foot' }, foot));
    return h('article', { class: 'pu-card' + (u.acked ? '' : ' unread') }, body);
  }

  // ── The page ──────────────────────────────────────────────────────
  var reportOpen = false;
  PU.open = function () {
    var root = document.getElementById('pu-agent-root'); if (!root) return;
    root.classList.add('pu-page');
    if (!root.firstChild) root.appendChild(h('p', { class: 'pu-empty', text: 'Loading updates...' }));
    load().then(function (j) { paint(root, j); });
  };
  function paint(root, j) {
    while (root.firstChild) root.removeChild(root.firstChild);
    var more = j && j.moreUrl;
    var head = h('div', { class: 'pu-head' }, [
      h('div', null, [h('h2', { text: 'Process and product updates' }), h('p', { text: 'What changed in the last 7 days. Open any update for the full detail and screenshots.' })]),
      h('div', { class: 'pu-actions' }, [
        isAdmin() ? h('button', { type: 'button', class: 'pu-btn', text: reportOpen ? 'Hide who has read' : 'Who has read', onclick: function () { reportOpen = !reportOpen; paint(root, PU.state); } }) : null,
        more ? h('a', { class: 'pu-btn primary', href: more, target: '_blank', rel: 'noopener', text: 'See all updates' }) : null])]);
    root.appendChild(head);
    if (!j) { root.appendChild(h('p', { class: 'pu-empty', text: 'Could not load updates. Try again in a moment.' })); return; }
    if (!j.configured) {
      root.appendChild(h('div', { class: 'pu-note', text: isAdmin() ? 'Updates are not connected yet. Create an API key on the updates site (Settings, API) and add it to the server as ADIT_UPDATES_KEY.' : 'Updates are not connected yet. Please check back soon.' }));
      return;
    }
    if (j.error) root.appendChild(h('div', { class: 'pu-note warn', text: (j.stale ? 'Showing the last saved list. ' : '') + j.error }));
    if (isAdmin() && reportOpen) root.appendChild(h('div', { class: 'pu-report', id: 'pu-report' }, [h('p', { class: 'pu-empty', text: 'Loading who has read...' })]));
    if (j.unread) {
      root.appendChild(h('div', { class: 'pu-banner' }, [h('span', { text: j.unread + (j.unread === 1 ? ' update is' : ' updates are') + ' waiting for you. Open each one, read it, then mark it as read.' }),
        h('button', { type: 'button', class: 'pu-btn primary', text: 'Mark all as read', onclick: function (ev) { ev.target.disabled = true; api('/api/updates/ack', { all: true }).then(function (r) { if (r && r.success) { PU.state = r; setBadge(r.unread || 0); toast('Marked as read'); } paint(root, PU.state); }); } })]));
    }
    if (!j.items.length) root.appendChild(h('p', { class: 'pu-empty', text: 'No updates in the last 7 days.' }));
    j.items.forEach(function (u) {
      var extra = u.acked ? null : h('button', { type: 'button', class: 'pu-btn', text: 'Mark as read', onclick: function (ev) { ev.target.disabled = true; api('/api/updates/ack', { ids: [u.id] }).then(function (r) { if (r && r.success) { PU.state = r; setBadge(r.unread || 0); } paint(root, PU.state); }); } });
      root.appendChild(card(u, { extra: extra }));
    });
    if (more) root.appendChild(h('p', { class: 'pu-more' }, [h('a', { href: more, target: '_blank', rel: 'noopener', text: 'Older updates and the full feed' })]));
    if (isAdmin() && reportOpen) paintReport();
  }
  function paintReport() {
    var box = document.getElementById('pu-report'); if (!box) return;
    api('/api/admin/updates/report').then(function (r) {
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(h('h3', { text: 'Who has read each update' }));
      if (!r || r.success === false) { box.appendChild(h('p', { class: 'pu-empty', text: (r && r.error) || 'Could not load the report.' })); return; }
      if (!r.updates.length) { box.appendChild(h('p', { class: 'pu-empty', text: 'No updates in the last 7 days.' })); return; }
      r.updates.forEach(function (u) {
        var d = h('details', { class: 'pu-rep-row' }, [
          h('summary', null, [h('b', { text: u.title }), h('span', { class: 'pu-rep-n' + (u.pending.length ? ' warn' : ' ok'), text: u.acked.length + ' read, ' + u.pending.length + ' pending' })]),
          h('div', { class: 'pu-rep-cols' }, [
            h('div', null, [h('h4', { text: 'Pending (' + u.pending.length + ')' }), u.pending.length ? h('ul', null, u.pending.map(function (p) { return h('li', { text: p.name }); })) : h('p', { class: 'pu-empty', text: 'Everyone has read it.' })]),
            h('div', null, [h('h4', { text: 'Read (' + u.acked.length + ')' }), u.acked.length ? h('ul', null, u.acked.map(function (a) { return h('li', null, [a.name, h('span', { class: 'pu-when', text: ' ' + when(a.at.replace(' ', 'T') + 'Z') })]); })) : h('p', { class: 'pu-empty', text: 'Nobody yet.' })])])]);
        box.appendChild(d);
      });
    }).catch(function () { while (box.firstChild) box.removeChild(box.firstChild); box.appendChild(h('p', { class: 'pu-empty', text: 'Could not load the report.' })); });
  }

  // ── Must-read screen at sign-in ───────────────────────────────────
  PU.gate = function (role) {
    if (PU.gateShown || role === 'admin' || role === 'assessment') { if (role === 'admin') load(); return; }
    PU.gateShown = true;
    load().then(function (j) {
      if (!j || !j.configured || !j.unread) return;
      showGate(j.items.filter(function (u) { return !u.acked; }));
    });
  };
  function showGate(items) {
    if (document.getElementById('pu-gate')) return;
    var checks = [];
    var list = h('div', { class: 'pu-gate-list' }, items.map(function (u) {
      var cb = h('input', { type: 'checkbox', 'data-id': String(u.id), id: 'pu-cb-' + u.id });
      cb.addEventListener('change', update); checks.push(cb);
      return h('div', { class: 'pu-gate-item' }, [card(u), h('label', { class: 'pu-ack', for: 'pu-cb-' + u.id }, [cb, ' I have read this update'])]);
    }));
    var err = h('p', { class: 'pu-err', role: 'alert' });
    var go = h('button', { type: 'button', class: 'pu-btn primary big', disabled: true, text: 'Acknowledge and continue' });
    var all = h('button', { type: 'button', class: 'pu-btn', text: 'Tick all' });
    function update() { var n = checks.filter(function (c) { return c.checked; }).length; go.disabled = n !== checks.length; go.textContent = n === checks.length ? 'Acknowledge and continue' : 'Read all ' + checks.length + ' to continue (' + n + ' ticked)'; }
    all.addEventListener('click', function () { checks.forEach(function (c) { c.checked = true; }); update(); });
    var skip = null;
    function close() { var g = document.getElementById('pu-gate'); if (g) g.remove(); document.body.classList.remove('pu-lock'); }
    go.addEventListener('click', function () {
      go.disabled = true; err.textContent = '';
      api('/api/updates/ack', { ids: items.map(function (u) { return u.id; }) }).then(function (r) {
        if (r && r.success) { PU.state = r; setBadge(r.unread || 0); close(); toast('Thanks, updates acknowledged'); }
        else { err.textContent = (r && r.error) || 'Could not save that. Try again.'; go.disabled = false; if (!skip) { skip = h('button', { type: 'button', class: 'pu-btn', text: 'Continue for now', onclick: close }); foot.appendChild(skip); } }
      }).catch(function () { err.textContent = 'Could not save that. Check your connection and try again.'; go.disabled = false; });
    });
    var foot = h('div', { class: 'pu-gate-foot' }, [all, go]);
    var box = h('div', { class: 'pu-gate-box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pu-gate-t' }, [
      h('div', { class: 'pu-gate-head' }, [h('h2', { id: 'pu-gate-t', text: items.length === 1 ? 'There is a new update to read' : 'There are ' + items.length + ' new updates to read' }),
        h('p', { text: 'Please read these before you start your shift. Open the full update if you need the detail, then tick each one to confirm.' })]),
      list, err, foot]);
    var wrap = h('div', { class: 'pu-gate pu-page', id: 'pu-gate' }, [box]);
    document.body.appendChild(wrap); document.body.classList.add('pu-lock'); update();
    setTimeout(function () { try { box.querySelector('input').focus(); } catch (e) {} }, 50);
  }

  // Keep the badge fresh while the tab is open
  setInterval(function () { if (document.visibilityState === 'visible' && typeof currentUser !== 'undefined' && currentUser) load(); }, 10 * 60 * 1000);
})();
