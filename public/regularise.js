/* Session 68: break regularise requests UI (agent form + admin approvals).
   Used by breaks-v2.js through window.RegUI. */
(function () {
  'use strict';
  var S = { mine: [], all: [], pending: 0, notes: {}, at: 0, busy: {} };
  var dlg;
  var GROUPS = [
    ['Shift', [['LOGGED_IN', 'Logged In (start of shift)'], ['LOGGED_OUT', 'Logged Out (end of shift)']]],
    ['Break', [['BREAK_OUT', 'Break Out (I left for a break)'], ['BREAK_IN', 'Break In (I came back)']]],
    ['BRB', [['BRB_OUT', 'BRB Out (I stepped away)'], ['BRB_IN', 'BRB In (I came back)']]],
    ['Other timed statuses', [['TRAINING_OUT', 'Training / Coaching Out'], ['TRAINING_IN', 'Training / Coaching In'], ['QA_SESSION_OUT', 'QA Session AUX Out'], ['QA_SESSION_IN', 'QA Session AUX In'], ['INTERNAL_CALL_OUT', 'Internal Calls Out'], ['INTERNAL_CALL_IN', 'Internal Calls In']]],
  ];
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function role() { try { return typeof window.currentRole === 'string' ? window.currentRole : (sessionStorage.getItem('rcRole') || ''); } catch (x) { return ''; } }
  function isAdmin() { return role() === 'admin'; }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function api(url, method, body) {
    var init = { method: method || 'GET', credentials: 'include', headers: {} };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === false) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  }
  function when(r) {
    var t = Date.parse(String(r.atUtc).replace(' ', 'T') + 'Z');
    var z = r.tz === 'Asia/Kolkata' ? 'IST' : 'CST';
    return r.localText + ' ' + z + (t ? '' : '');
  }
  function pill(st) { var c = st === 'approved' ? 'green' : st === 'declined' ? 'red' : 'yellow'; return '<span class="bx-pill bx-' + (st === 'approved' ? 'live' : st === 'declined' ? 'off' : 'break') + '"><span class="bx-dot"></span>' + e(st) + '</span>'; }

  function load(cb, force) {
    if (!force && Date.now() - S.at < 15000) return;
    S.at = Date.now();
    var jobs = [api('/api/regularise/mine').then(function (j) { S.mine = j.data || []; }).catch(function () {})];
    if (isAdmin()) jobs.push(api('/api/admin/regularise').then(function (j) { S.all = j.data || []; S.pending = j.pending || 0; }).catch(function () {}));
    Promise.all(jobs).then(function () { if (typeof cb === 'function') cb(); });
  }

  function agentBar() {
    var recent = S.mine.slice(0, 3);
    return '<section class="bx-card bx-pad rg-card" aria-label="Regularise a missed tap">' +
      '<div class="bx-row bx-between"><div><div class="bx-strong">Missed a tap?</div><div class="bx-sub">Forgot to log in, log out, or come back from a break? Ask for it to be corrected. An admin approves it.</div></div>' +
      '<button class="bx-btn" type="button" data-rg-open>Regularise</button></div>' +
      (recent.length ? '<div class="rg-list">' + recent.map(function (r) {
        return '<div class="rg-item"><div><b>' + e(r.actionLabel) + '</b> <span class="bx-sub">' + e(when(r)) + '</span>' + (r.note ? '<div class="bx-sub">Note: ' + e(r.note) + '</div>' : '') + '</div>' + pill(r.status) + '</div>';
      }).join('') + '</div>' : '') + '</section>';
  }

  function adminCard() {
    var pend = S.all.filter(function (r) { return r.status === 'pending'; });
    var done = S.all.filter(function (r) { return r.status !== 'pending'; }).slice(0, 3);
    var rows = pend.map(function (r) {
      var busy = S.busy[r.id];
      return '<div class="rg-item rg-pend"><div class="rg-main"><b>' + e(r.name || r.email) + '</b> <span class="bx-sub">missed</span> <b>' + e(r.actionLabel) + '</b> <span class="bx-sub">at ' + e(when(r)) + '</span>' +
        '<div class="bx-sub">' + e(r.reason) + '</div></div>' +
        '<input class="rg-note" type="text" maxlength="300" placeholder="Note to agent (optional)" aria-label="Note to agent" data-rg-note="' + r.id + '" value="' + e(S.notes[r.id] || '') + '">' +
        '<div class="bx-row"><button class="bx-btn rg-ok" type="button" data-rg-approve="' + r.id + '"' + (busy ? ' disabled' : '') + '>Approve</button><button class="bx-btn" type="button" data-rg-decline="' + r.id + '"' + (busy ? ' disabled' : '') + '>Decline</button></div></div>';
    }).join('');
    var hist = done.length ? '<div class="bx-sub" style="margin-top:10px">Recently decided</div>' + done.map(function (r) {
      return '<div class="rg-item"><div><b>' + e(r.name || r.email) + '</b> <span class="bx-sub">' + e(r.actionLabel) + ' at ' + e(when(r)) + '</span></div>' + pill(r.status) + '</div>';
    }).join('') : '';
    return '<section class="bx-card bx-pad rg-card" style="margin-bottom:16px" aria-label="Regularise requests"><div class="bx-strong">Regularise requests' + (pend.length ? ' <span class="rg-count">' + pend.length + '</span>' : '') + '</div>' +
      (pend.length ? '<div class="rg-list">' + rows + '</div>' : '<div class="bx-sub">No pending requests.</div>') + hist + '</section>';
  }

  function todayStr(offsetDays, tz) {
    var d = new Date(Date.now() - (offsetDays || 0) * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function openDialog() {
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'rg-dlg'; dlg.setAttribute('aria-label', 'Regularise a missed tap'); dlg.setAttribute('role', 'dialog');
      document.body.appendChild(dlg);
    }
    var tzDefault = 'America/Chicago';
    try { if (typeof window.activeTimeZone === 'function' && window.activeTimeZone() === 'Asia/Kolkata') tzDefault = 'Asia/Kolkata'; } catch (x) {}
    dlg.innerHTML = '<form method="dialog" class="rg-form"><h3>Regularise a missed tap</h3>' +
      '<label>What did you miss?<select name="action" required><option value="">Choose one</option>' + GROUPS.map(function (g) { return '<optgroup label="' + e(g[0]) + '">' + g[1].map(function (o) { return '<option value="' + o[0] + '">' + e(o[1]) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></label>' +
      '<div class="rg-two"><label>Date<input type="date" name="date" required></label><label>Time<input type="time" name="time" required></label></div>' +
      '<label>Time zone<select name="tz"><option value="America/Chicago">CST (Chicago)</option><option value="Asia/Kolkata">IST (India)</option></select></label>' +
      '<label>Reason<textarea name="reason" maxlength="300" required placeholder="What happened? For example: my system froze and I forgot to tap Break In."></textarea></label>' +
      '<div class="rg-msg" role="alert"></div>' +
      '<div class="rg-actions"><button type="button" class="bx-btn" data-rg-cancel>Cancel</button><button type="submit" class="bx-btn rg-ok" data-rg-send>Send for approval</button></div></form>';
    var f = dlg.querySelector('form');
    var E = f.elements; E.tz.value = tzDefault;
    function bounds() { E.date.max = todayStr(0, E.tz.value); E.date.min = todayStr(7, E.tz.value); }
    bounds(); E.date.value = todayStr(0, E.tz.value);
    E.tz.addEventListener('change', bounds);
    dlg.querySelector('[data-rg-cancel]').addEventListener('click', function () { dlg.close(); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = dlg.querySelector('[data-rg-send]'), msg = dlg.querySelector('.rg-msg');
      btn.disabled = true; msg.textContent = '';
      api('/api/regularise', 'POST', { action: f.elements.action.value, date: f.elements.date.value, time: f.elements.time.value, tz: f.elements.tz.value, reason: f.elements.reason.value })
        .then(function () { dlg.close(); toast('Sent to your admins for approval', 'success'); load(redraw, true); })
        .catch(function (er) { msg.textContent = er.message; btn.disabled = false; });
    });
    dlg.showModal();
  }
  function redraw() { if (typeof window.renderBreaksV2 === 'function') { try { window.renderBreaksV2(); } catch (x) {} } }
  function decide(id, ok) {
    S.busy[id] = true; redraw();
    api('/api/admin/regularise/' + id + '/' + (ok ? 'approve' : 'decline'), 'POST', { note: S.notes[id] || '' })
      .then(function () { toast(ok ? 'Approved, event added to their day' : 'Declined', 'success'); delete S.notes[id]; })
      .catch(function (er) { toast(er.message, 'error'); })
      .then(function () { delete S.busy[id]; load(redraw, true); if (typeof window.loadBreakTracker === 'function') { try { window.loadBreakTracker(); } catch (x) {} } });
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.closest('[data-rg-open]')) { ev.preventDefault(); openDialog(); return; }
    var a = t.closest('[data-rg-approve]'); if (a) { decide(a.getAttribute('data-rg-approve'), true); return; }
    var d = t.closest('[data-rg-decline]'); if (d) { decide(d.getAttribute('data-rg-decline'), false); }
  });
  document.addEventListener('input', function (ev) { var n = ev.target.closest && ev.target.closest('[data-rg-note]'); if (n) S.notes[n.getAttribute('data-rg-note')] = n.value; });
  window.RegUI = { agentBar: agentBar, adminCard: adminCard, load: function () { load(redraw); } };
})();
