/* Batch 225: Tickets > Reports. Scheduled reports written from a plain-words request, sent to a Google Chat space. */
(function () {
  'use strict';
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function api(path, body, method) {
    var m = method || (body ? 'POST' : 'GET');
    return fetch(path, { method: m, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { success: false, error: 'The server is busy, try again.' }; }).then(function (j) { if (!r.ok || !j || j.success === false) throw new Error((j && j.error) || 'HTTP ' + r.status); return j; }); });
  }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var TZS = [['America/Chicago', 'CT'], ['Asia/Kolkata', 'IST'], ['America/New_York', 'ET'], ['America/Los_Angeles', 'PT']];
  var EXAMPLES = ['Tickets T1 sent to each CSM, highest first, with the total and how many went through review versus moved without review. Under each CSM list the ticket numbers as links, grouped by channel. Then show the tickets that came back to T1 with no CSM action, and the total tickets each CSM moved to T1, with ticket numbers',
    'How many tickets T1 sent to each CSM, highest first, with the total',
    'Invalid transfers by T1 agent, with fatal and feedback counts',
    'T1 tickets created and closed, by channel',
    'Chats handled by each agent, average first response time and Happy, Ok and Bad ratings',
    'List the tickets T1 sent to each CSM, grouped by CSM, with ticket number, subject and link'];
  function hm12(t) { var p = String(t || '09:00').split(':'), H = +p[0], M = p[1]; return ((H % 12) || 12) + ':' + M + ' ' + (H < 12 ? 'AM' : 'PM'); }
  function tzLabel(tz) { var x = TZS.filter(function (z) { return z[0] === tz; })[0]; return x ? x[1] : tz; }
  function when(r) {
    var at = hm12(r.time) + ' ' + tzLabel(r.tz);
    if (r.freq === 'weekly') return 'Every ' + DAYS[r.weekday == null ? 1 : r.weekday] + ' at ' + at;
    if (r.freq === 'monthly') return 'Monthly on day ' + (r.monthday || 1) + ' at ' + at;
    return (r.weekdaysOnly ? 'Weekdays' : 'Every day') + ' at ' + at;
  }
  function ago(s) { if (!s) return ''; var t = Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); if (isNaN(t)) return s; return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  function Reports(root) {
    var S = { list: [], periods: {}, edit: null, busy: false, err: '' };
    root.classList.add('crp');
    function toast(t) { if (window.showToast) window.showToast(t); }
    function load() {
      return api('/api/custom-reports').then(function (j) { S.list = j.reports || []; S.periods = j.periods || {}; S.err = ''; paint(); })
        .catch(function (e) { S.err = e.message; paint(); });
    }
    function paint() {
      clear(root);
      root.appendChild(h('div', { class: 'crp-hd' }, [
        h('div', {}, [h('h2', { text: 'Scheduled reports' }), h('p', { text: 'Say what the report should show; Expert works out the numbers and posts it to a Google Chat space on your schedule.' })]),
        h('button', { type: 'button', class: 'crp-btn primary', onclick: function () { openEditor(null); } }, ['+ New report'])]));
      if (S.err) root.appendChild(h('div', { class: 'crp-note bad', text: S.err }));
      if (!S.list.length && !S.err) root.appendChild(h('div', { class: 'crp-empty' }, [h('b', { text: 'No reports yet' }),
        h('p', { text: 'For example: every Monday at 9 AM, send Kushal how many tickets T1 sent to each CSM last week.' }),
        h('button', { type: 'button', class: 'crp-btn primary', onclick: function () { openEditor(null, { name: 'Tickets T1 sent to each CSM', prompt: EXAMPLES[0], freq: 'weekly', weekday: 1, time: '09:00', period: 'last_week' }); } }, ['Start from this example'])]));
      var grid = h('div', { class: 'crp-list' }); root.appendChild(grid);
      S.list.forEach(function (r) { grid.appendChild(card(r)); });
      // The editor sits on the page body, so no page layout can clip it.
      var old = document.querySelector('.crp-scrim'); if (old) old.remove();
      if (S.edit) { var ov = editor(); document.body.appendChild(ov); }
    }
    function card(r) {
      var tog = h('button', { type: 'button', class: 'crp-switch', role: 'switch', 'aria-checked': r.enabled ? 'true' : 'false', 'aria-label': (r.enabled ? 'Pause ' : 'Turn on ') + r.name });
      tog.addEventListener('click', function () { api('/api/custom-reports/' + r.id + '/toggle', { enabled: !r.enabled }).then(load).catch(function (e) { toast(e.message); }); });
      var hist = (r.history || []).slice(0, 5);
      return h('article', { class: 'crp-card' + (r.enabled ? '' : ' off') }, [
        h('div', { class: 'crp-c1' }, [h('h3', { text: r.name }), tog]),
        h('p', { class: 'crp-prompt', text: r.prompt }),
        h('dl', { class: 'crp-kv' }, [
          h('dt', { text: 'When' }), h('dd', { text: when(r) }),
          h('dt', { text: 'Covers' }), h('dd', { text: r.periodLabel }),
          h('dt', { text: 'Sends to' }), h('dd', { text: r.target || 'Google Chat space' }),
          h('dt', { text: 'Next' }), h('dd', { text: r.enabled ? (r.next ? r.next + ' ' + tzLabel(r.tz) : 'not scheduled') : 'Paused' }),
          h('dt', { text: 'Last' }), h('dd', { class: /^failed/.test(r.lastStatus || '') ? 'bad' : '', text: r.lastRunAt ? ago(r.lastRunAt) + ' (' + (r.lastStatus || '') + ')' : 'Not sent yet' })]),
        hist.length ? h('details', { class: 'crp-hist' }, [h('summary', { text: 'History' }), h('ul', {}, hist.map(function (l) { return h('li', { class: l.ok ? '' : 'bad', text: ago(l.created_at) + (l.period_label ? ', ' + l.period_label : '') + (l.ok ? ', sent' : ', failed: ' + (l.error || '')) + (l.sent_by && !/^schedule:/.test(l.sent_by) ? ' (by ' + l.sent_by + ')' : '') }); }))]) : null,
        h('div', { class: 'crp-row' }, [
          h('button', { type: 'button', class: 'crp-btn', onclick: function () { openEditor(r, null, true); } }, ['Preview']),
          h('button', { type: 'button', class: 'crp-btn', onclick: function () { openEditor(r); } }, ['Edit']),
          h('button', { type: 'button', class: 'crp-btn', onclick: function (e) { sendNow(r, e.currentTarget); } }, ['Send now']),
          h('button', { type: 'button', class: 'crp-btn ghost danger', onclick: function () { if (confirmDelete(r)) api('/api/custom-reports/' + r.id, null, 'DELETE').then(load).catch(function (e) { toast(e.message); }); } }, ['Delete'])])]);
    }
    function confirmDelete(r) { return window.confirm('Delete the report "' + r.name + '"? It stops sending.'); }
    function sendNow(r, btn) {
      if (!window.confirm('Send "' + r.name + '" to ' + (r.target || 'the Google Chat space') + ' now?')) return;
      btn.disabled = true; btn.textContent = 'Sending...';
      api('/api/custom-reports/' + r.id + '/send', {}).then(function (j) { toast(j.ok ? 'Report sent' : 'Not sent: ' + (j.error || '')); load(); }).catch(function (e) { toast(e.message); load(); });
    }

    // ── editor ──
    function openEditor(r, preset, autoPreview) {
      var x = r || preset || {};
      S.edit = { id: r ? r.id : null, name: x.name || '', prompt: x.prompt || '', period: x.period || 'last_week', webhook: '', hookHint: r ? r.hookHint : '', target: r ? (r.target || '') : '',
        freq: x.freq || 'weekly', weekday: x.weekday == null ? 1 : x.weekday, monthday: x.monthday || 1, time: x.time || '09:00', tz: x.tz || 'America/Chicago', weekdaysOnly: x.weekdaysOnly !== false, enabled: r ? r.enabled : true,
        plan: r && r.plan ? r.plan : null, preview: null, draftPlan: null, msg: '' };
      paint();
      var first = document.querySelector('.crp-ed input'); if (first) first.focus();
      if (autoPreview) doPreview(false);
    }
    function field(label, el, hint) { return h('label', { class: 'crp-f' }, [h('span', { text: label }), el, hint ? h('small', { text: hint }) : null]); }
    function bind(el, key, fn) { el.value = S.edit[key] == null ? '' : S.edit[key]; el.addEventListener('input', function () { S.edit[key] = el.type === 'number' ? Number(el.value) : el.value; if (fn) fn(); }); el.addEventListener('change', function () { S.edit[key] = el.value; if (fn) fn(); }); return el; }
    function select(key, opts, fn) { var s = h('select', {}, opts.map(function (o) { return h('option', { value: String(o[0]), text: o[1] }); })); bind(s, key, fn); return s; }
    function editor() {
      var E = S.edit;
      var name = bind(h('input', { type: 'text', maxlength: '120', placeholder: 'e.g. Tickets T1 sent to each CSM' }), 'name');
      var prompt = bind(h('textarea', { rows: '4', maxlength: '2000', placeholder: 'Describe the numbers you want, in your own words.' }), 'prompt', function () { E.preview = null; E.draftPlan = null; markPrev(); });
      var chips = h('div', { class: 'crp-chips' }, EXAMPLES.map(function (t) { return h('button', { type: 'button', class: 'crp-chip', text: t, onclick: function () { E.prompt = t; prompt.value = t; E.preview = null; E.draftPlan = null; markPrev(); } }); }));
      var periods = Object.keys(S.periods).map(function (k) { return [k, S.periods[k]]; });
      var hook = bind(h('input', { type: 'url', placeholder: E.id ? 'Leave empty to keep ' + (E.hookHint || 'the current space') : 'https://chat.googleapis.com/v1/spaces/.../messages?key=...', autocomplete: 'off', spellcheck: 'false' }), 'webhook');
      var sched = h('div', { class: 'crp-sched' });
      function paintSched() {
        clear(sched);
        sched.appendChild(field('How often', select('freq', [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], paintSched)));
        if (E.freq === 'weekly') sched.appendChild(field('Day', select('weekday', DAYS.map(function (d, i) { return [i, d]; }))));
        if (E.freq === 'monthly') sched.appendChild(field('Day of month', select('monthday', Array.from({ length: 28 }, function (_, i) { return [i + 1, String(i + 1)]; }))));
        if (E.freq === 'daily') { var cb = h('input', { type: 'checkbox' }); cb.checked = !!E.weekdaysOnly; cb.addEventListener('change', function () { E.weekdaysOnly = cb.checked; }); sched.appendChild(h('label', { class: 'crp-cb' }, [cb, 'Weekdays only'])); }
        sched.appendChild(field('Time', bind(h('input', { type: 'time', step: '300' }), 'time')));
        sched.appendChild(field('Time zone', select('tz', TZS)));
      }
      paintSched();
      var prev = h('div', { class: 'crp-prev', 'aria-live': 'polite' });
      function markPrev() { clear(prev); prev.appendChild(previewBody()); }
      prev.appendChild(previewBody());
      var saveBtn = h('button', { type: 'button', class: 'crp-btn primary' }, ['Save report']);
      saveBtn.addEventListener('click', function () {
        var body = Object.assign({}, E, { draftPlan: E.draftPlan ? { prompt: E.prompt, plan: E.draftPlan } : null });
        if (!body.webhook) delete body.webhook;
        saveBtn.disabled = true; E.msg = '';
        api(E.id ? '/api/custom-reports/' + E.id : '/api/custom-reports', body).then(function () { S.edit = null; toast('Report saved'); load(); })
          .catch(function (e) { E.msg = e.message; saveBtn.disabled = false; var m = document.querySelector('.crp-edmsg'); if (m) m.textContent = e.message; });
      });
      var box = h('div', { class: 'crp-ed', role: 'dialog', 'aria-modal': 'true', 'aria-label': E.id ? 'Edit report' : 'New report' }, [
        h('div', { class: 'crp-edhd' }, [h('h3', { text: E.id ? 'Edit report' : 'New report' }), h('button', { type: 'button', class: 'crp-x', 'aria-label': 'Close', onclick: function () { S.edit = null; paint(); } }, ['×'])]),
        h('div', { class: 'crp-edbody' }, [
          h('div', { class: 'crp-col' }, [
            field('Name', name),
            field('What should it show?', prompt, 'Plain words. Expert turns this into the numbers, then saves how it measured them so every run is consistent.'), chips,
            field('Period it covers', select('period', periods, function () { E.preview = null; markPrev(); })),
            h('fieldset', { class: 'crp-fs' }, [h('legend', { text: 'Schedule' }), sched]),
            h('fieldset', { class: 'crp-fs' }, [h('legend', { text: 'Send to' }),
              field('Google Chat webhook', hook, 'In the space: Apps and integrations, Webhooks, Add webhook, then copy the link. Google Chat webhooks work for spaces, not one-to-one DMs; for one person, make a small space with them.'),
              field('Label (optional)', bind(h('input', { type: 'text', maxlength: '80', placeholder: 'e.g. Kushal CSM reports' }), 'target'))])]),
          h('div', { class: 'crp-col' }, [h('h4', { text: 'Preview' }), prev])]),
        h('div', { class: 'crp-edft' }, [h('span', { class: 'crp-edmsg', role: 'alert', text: E.msg || '' }), h('button', { type: 'button', class: 'crp-btn', onclick: function () { S.edit = null; paint(); } }, ['Cancel']), saveBtn])]);
      var wrap = h('div', { class: 'crp crp-scrim' }, [box]);
      wrap.addEventListener('click', function (e) { if (e.target === wrap) { S.edit = null; paint(); } });
      wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') { S.edit = null; paint(); } });
      return wrap;
    }
    function previewBody() {
      var E = S.edit, frag = h('div', {});
      var go = h('button', { type: 'button', class: 'crp-btn' }, [E.preview ? 'Preview again' : 'Build preview']);
      go.addEventListener('click', function () { doPreview(false); });
      var again = E.preview ? h('button', { type: 'button', class: 'crp-btn ghost', title: 'Work out the queries again from the request' }, ['Rethink the numbers']) : null;
      if (again) again.addEventListener('click', function () { doPreview(true); });
      frag.appendChild(h('div', { class: 'crp-row' }, [go, again]));
      if (E.busy) frag.appendChild(h('div', { class: 'crp-skel', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i')]));
      if (E.pErr) frag.appendChild(h('div', { class: 'crp-note bad', text: E.pErr }));
      if (E.preview) {
        var P = E.preview;
        frag.appendChild(h('div', { class: 'crp-msg' }, [h('div', { class: 'crp-msghd', text: 'Google Chat message, ' + P.period + (P.parts > 1 ? ' (sent as ' + P.parts + ' messages, it is long)' : '') }), h('pre', { text: P.text || '(empty)' })]));
        var pv = P.planView || {};
        frag.appendChild(h('details', { class: 'crp-how' }, [h('summary', { text: 'How the numbers were worked out' }),
          pv.notes ? h('p', { text: pv.notes }) : null,
          h('ol', {}, (pv.queries || []).map(function (q) { return h('li', {}, [h('b', { text: q.purpose }), h('span', { class: 'crp-muted', text: ' ' + q.source + ', ' + (q.error ? 'failed: ' + q.error : q.rows + ' row' + (q.rows === 1 ? '' : 's')) }), h('code', { text: q.sql })]); }))]));
      } else if (!E.busy) frag.appendChild(h('p', { class: 'crp-muted', text: 'Build a preview to see the exact message before saving. Nothing is sent.' }));
      return frag;
    }
    function doPreview(rebuild) {
      var E = S.edit; if (!E || E.busy) return;
      if (!E.name || E.name.length < 3) E.name = E.name || 'Report';
      E.busy = true; E.pErr = ''; refreshPrev();
      api('/api/custom-reports/preview', { id: E.id, name: E.name, prompt: E.prompt, period: E.period, tz: E.tz, rebuild: !!rebuild })
        .then(function (j) { E.preview = j; E.draftPlan = j.plan; }).catch(function (e) { E.pErr = e.message; })
        .then(function () { E.busy = false; refreshPrev(); });
    }
    function refreshPrev() { var p = document.querySelector('.crp-prev'); if (p) { clear(p); p.appendChild(previewBody()); } }
    load();
    return { reload: load };
  }
  window.CustomReports = { mount: function (el) { if (!el._crp) el._crp = Reports(el); else el._crp.reload(); } };
})();
