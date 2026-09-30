/* Session 57: Assessments (/assess, and embedded in the main app with ?embed=1).
 *
 * Takers: My assessments, a three-step start (overview with a reading demo,
 * setup check, agreement), then one question at a time. Question text is
 * drawn on a canvas, either as a rolling reveal (a few words at a time) or
 * as the full question. Options are drawn on canvases too. Timing and
 * grading happen on the server.
 *
 * Reviewers: Assessments (builder, results, attempt detail), Question bank
 * (editor, AI drafts from documents, CSV import, question stats) and
 * Access (who can open the link, guests, reviewers, extra time).
 */
(function () {
  'use strict';

  var main = document.getElementById('as-main');
  var nav = document.getElementById('as-nav');
  var userBox = document.getElementById('as-user');
  var live = document.getElementById('as-live');
  var EMBED = document.documentElement.classList.contains('embed');
  // Session 59: the agent view in the main app shows only the taker pages,
  // even for a reviewer who switched to agent view.
  var AGENT_ONLY = (function () { try { return new URLSearchParams(location.search).get('as') === 'agent'; } catch (e) { return false; } })();
  if (EMBED) document.body.classList.add('as-embed');
  var me = null;
  var LETTERS = 'ABCDEFGH';
  var TYPE_LABEL = { single: 'Choose one', multi: 'Choose all that apply', truefalse: 'True or false', ordering: 'Put in order', matching: 'Match the pairs' };
  var TYPE_SHORT = { single: 'Single choice', multi: 'Multiple answers', truefalse: 'True or false', ordering: 'Put in order', matching: 'Match pairs' };
  var VERDICT = { cleared: ['Cleared', 'ok'], follow_up: ['Needs follow-up', 'warn'], concern: ['Concern', 'bad'] };
  var TIER = { none: ['No issues', 'ok'], some: ['Some issues', 'warn'], major: ['Major issues', 'bad'] };

  // ── Theme follows the main app ───────────────────────────────────────
  window.addEventListener('storage', function (e) {
    if (e.key !== 'aditDarkMode') return;
    if (e.newValue === '1') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.setAttribute('data-theme', 'light');
  });

  // ── Helpers ──────────────────────────────────────────────────────────
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with static strings
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    if (tag === 'video') { el.muted = true; el.playsInline = true; }
    return el;
  }
  // Session 65: icon set v3. One clean outline style, 24px grid, 2px
  // padding, round caps. No fill layers: they read as smudges at 15px.
  var ICONS = {
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M9 13.5l2 2 4-4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    eye: '<path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    warn: '<path d="M10.3 4 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
    camera: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5 21.5 7v10l-6-3.5"/>',
    screen: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    pen: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/><path d="M14.5 5.5l3 3"/>',
    replay: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.5-4.5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    doc: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M9 13h6M9 17h6"/>',
    spark: '<path d="M11 3.5l1.8 4.7 4.7 1.8-4.7 1.8L11 16.5l-1.8-4.7L4.5 10l4.7-1.8z"/><path d="M18.5 14.5v5M16 17h5"/>',
    users: '<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20.5v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M16 4a3.5 3.5 0 0 1 0 7M21.5 20.5v-1a5 5 0 0 0-3.5-4.8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
    trash: '<path d="M3.5 6h17M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 11v5.5M14 11v5.5"/>',
    shield: '<path d="M12 21.5s7.5-3.5 7.5-9.5V5.5L12 2.5l-7.5 3V12c0 6 7.5 9.5 7.5 9.5z"/><path d="M9 12l2 2 4-4"/>',
    flag: '<path d="M4.5 21.5v-17M4.5 4.5s1.5-1.5 4.5-1.5 5 2 8 2 3-1 3-1v10s-1 1-3 1-5-2-8-2-4.5 1.5-4.5 1.5"/>',
    list: '<path d="M9 6h11.5M9 12h11.5M9 18h11.5M4 6h.01M4 12h.01M4 18h.01"/>',
    edit: '<path d="M12 20.5h8.5"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    chart: '<path d="M3.5 3.5v15a2 2 0 0 0 2 2h15"/><path d="M8.5 16.5v-4M13 16.5v-9M17.5 16.5v-6"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    headphones: '<path d="M3.5 17v-5a8.5 8.5 0 0 1 17 0v5"/><path d="M20.5 18a2.5 2.5 0 0 1-2.5 2.5h-1v-6h1a2.5 2.5 0 0 1 2.5 2.5zM3.5 18A2.5 2.5 0 0 0 6 20.5h1v-6H6A2.5 2.5 0 0 0 3.5 17z"/>',
    hourglass: '<path d="M6 2.5h12M6 21.5h12M7.5 2.5v3.2a4 4 0 0 0 1.6 3.2L12 11l2.9-2.1a4 4 0 0 0 1.6-3.2V2.5M7.5 21.5v-3.2a4 4 0 0 1 1.6-3.2L12 13l2.9 2.1a4 4 0 0 1 1.6 3.2v3.2"/>',
    archive: '<rect x="2.5" y="3.5" width="19" height="4.5" rx="1"/><path d="M4.5 8v10.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8M10 12h4"/>',
    restore: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7.5V12l3 2"/>',
    send: '<path d="M21.5 2.5 10.8 13.2"/><path d="M21.5 2.5 15 21l-4.2-7.8L3 9z"/>',
    retest: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V8H16"/><path d="M9 12.5l2 2 4-4"/>',
    wand: '<path d="M3.5 20.5 14 10M12.5 8.5l3 3"/><path d="M17 2.5v3M15.5 4h3M20 8.5v3M18.5 10h3M9.5 3v2M8.5 4h2"/>',
    filter: '<path d="M3 4.5h18l-7 8.2v6.3l-4 2v-8.3z"/>',
    print: '<path d="M6.5 9V2.5h11V9"/><path d="M6.5 17.5h-2a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2"/><rect x="6.5" y="14" width="11" height="7.5" rx="1"/>',
    layers: '<path d="M12 2.5 2.5 7.5 12 12.5l9.5-5z"/><path d="M2.5 12 12 17l9.5-5M2.5 16.5 12 21.5l9.5-5"/>',
    chat: '<path d="M20.5 15a2 2 0 0 1-2 2H7.5l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>',
    bot: '<rect x="3.5" y="8" width="17" height="12" rx="3"/><path d="M12 8V4.5M9 13.5v1.5M15 13.5v1.5"/><circle cx="12" cy="3.5" r="1"/>',
    m_calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2"/>',
    m_engage: '<path d="M20.5 12a8 8 0 0 1-11.8 7L3.5 20.5l1.6-4.6A8 8 0 1 1 20.5 12z"/><path d="M8.5 11.5h7M8.5 14.5h4"/>',
    m_schedcheck: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    m_ai: '<text x="12" y="16.4" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none" style="font-family:inherit">ai</text>',
    m_tx: '<text x="12" y="16.2" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none" style="font-family:inherit">Tx</text>',
    m_dollar: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9c-.4-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2 0 3 5.4 1.4 5.4 4.2 0 1.2-1.2 2-2.7 2-1.3 0-2.4-.6-2.8-1.5M12 6v1.6M12 16.4V18"/>',
    m_phone: '<path d="M21 16.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.2 2 2 0 0 1 3.1 1h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    m_phonecall: '<path d="M20 16.5v2.4a1.6 1.6 0 0 1-1.8 1.6 15.8 15.8 0 0 1-6.9-2.5 15.6 15.6 0 0 1-4.8-4.8A15.8 15.8 0 0 1 3.9 5.3 1.6 1.6 0 0 1 5.5 3.5h2.4a1.6 1.6 0 0 1 1.6 1.4c.1.8.3 1.5.6 2.2a1.6 1.6 0 0 1-.4 1.7L8.7 9.8a12.8 12.8 0 0 0 4.8 4.8l1-1a1.6 1.6 0 0 1 1.7-.3c.7.3 1.4.5 2.2.6a1.6 1.6 0 0 1 1.6 1.6z"/><path d="M14.5 3.5a6 6 0 0 1 6 6M14.5 7a2.6 2.6 0 0 1 2.6 2.6"/>',
    m_check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.5"/>',
    m_rcm: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M12 11v7M14 12.6c-.4-.5-1.1-.8-2-.8-1.1 0-2 .6-2 1.5 0 2 4 1 4 3 0 .9-.9 1.5-2 1.5-.9 0-1.6-.3-2-.8"/>',
    m_reports: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M7.5 15.5l3-3.5 2.5 2 3.5-4.5"/>',
    m_bolt: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>',
    m_idcard: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h4.5M14 13.5h3"/>',
    m_gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.5v2.9M12 18.6v2.9M2.5 12h2.9M18.6 12h2.9M5.3 5.3l2 2M16.7 16.7l2 2M5.3 18.7l2-2M16.7 7.3l2-2"/>',
    m_fax: '<path d="M7 9V3.5h8l2 2V9"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M7 14h10v6.5H7zM17 11.5h.01"/>',
    m_folder: '<path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    report: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M9 17.5v-3M12 17.5v-5.5M15 17.5v-2"/>',
  };
  function icon(name, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  // Session 65: product modules (names and icons come from the server list)
  var MODS = null, MOD_BY = {};
  function loadMods(fresh) {
    if (MODS && !fresh) return Promise.resolve(MODS);
    return api('/api/assess/modules').then(function (j) { MODS = j.modules || []; MODS.forEach(function (m) { MOD_BY[m.key] = m; }); return MODS; }).catch(function () { MODS = []; return MODS; });
  }
  function modChip(m, sub) {
    var info = MOD_BY[m.key] || m;
    return h('span', { class: 'mchip', title: info.name }, [icon(info.icon || 'm_folder', 'sm'), h('span', { text: info.name }), sub ? h('em', { text: sub }) : null]);
  }
  function modChips(list) {
    if (!list || !list.length) return null;
    return h('div', { class: 'mchips' }, list.map(function (m) { return modChip(m, (m.subs || []).join(' · ')); }));
  }
  // Module and sub-module picker. state.modules = [{key, subs:[]}]
  function modEditor(state, onChange) {
    var el = h('div', { class: 'moded' });
    function idx(k) { for (var i = 0; i < state.modules.length; i++) if (state.modules[i].key === k) return i; return -1; }
    function changed() { if (onChange) onChange(); }
    function draw() {
      clear(el);
      if (!MODS || !MODS.length) { el.appendChild(h('p', { class: 'muted small', text: 'Loading modules...' })); return; }
      var groups = [], byG = {};
      MODS.forEach(function (m) { if (!byG[m.group]) { byG[m.group] = []; groups.push(m.group); } byG[m.group].push(m); });
      groups.forEach(function (g) {
        el.appendChild(h('div', { class: 'modgrp' }, [h('span', { class: 'lbl small', text: g }), h('div', { class: 'chips' }, byG[g].map(function (m) {
          var on = idx(m.key) >= 0;
          return h('button', { type: 'button', class: 'chip mod ' + (on ? 'sel' : 'off'), 'aria-pressed': String(on), onclick: function () {
            var at = idx(m.key);
            if (at >= 0) state.modules.splice(at, 1); else if (state.modules.length < 6) state.modules.push({ key: m.key, subs: [] }); else { toast('Six modules at most'); return; }
            draw(); changed();
          } }, [icon(m.icon, 'sm'), m.name]);
        }))]));
      });
      state.modules.forEach(function (x) {
        var m = MOD_BY[x.key]; if (!m) return;
        var dl = h('datalist', { id: 'dl-' + x.key }, (m.subs || []).map(function (sname) { return h('option', { value: sname }); }));
        var inp = h('input', { class: 'inp', type: 'text', list: 'dl-' + x.key, maxlength: '40', placeholder: 'Add a sub-module, then press Enter', 'aria-label': 'Sub-module for ' + m.name });
        function add() { var v = inp.value.replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim(); if (!v) return; if (x.subs.every(function (y) { return y.toLowerCase() !== v.toLowerCase(); }) && x.subs.length < 6) x.subs.push(v); draw(); changed(); }
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } });
        inp.addEventListener('change', add);
        el.appendChild(h('div', { class: 'modsub' }, [h('div', { class: 'modsub-h' }, [icon(m.icon, 'sm'), h('b', { text: m.name })]),
          h('div', { class: 'chips' }, x.subs.map(function (sname, i) { return h('span', { class: 'chip' }, [sname, h('button', { type: 'button', 'aria-label': 'Remove ' + sname, class: 'x', onclick: function () { x.subs.splice(i, 1); draw(); changed(); } }, [icon('x', 'sm')])]); })), inp, dl]));
      });
    }
    loadMods().then(draw); draw();
    el.redraw = draw;
    return el;
  }
  // One click: draft questions become a draft assessment with a suggested
  // name, description, modules and study list. Opens the builder to review.
  function createFromDrafts(ids, btn, hint) {
    if (!ids || !ids.length) { toast('No questions to use'); return Promise.resolve(); }
    if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    return api('/api/assess/admin/tests/from-questions', { method: 'POST', body: { questionIds: ids, approve: true, hint: hint || '' } })
      .then(function (r) { toast('Assessment created: ' + ((r.meta && r.meta.title) || 'draft') + '. Its questions are approved.'); go('edit/' + r.id); })
      .catch(function (e) { toast(e.message); if (btn) { btn.disabled = false; btn.classList.remove('busy'); } });
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function announce(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }
  function toast(t) {
    var el = h('div', { class: 'toast', role: 'status', text: t });
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }
  // Shown while the site is restarting during a live assessment
  var netDown = false;
  function reconnectBar(on) {
    var el = document.getElementById('as-reconnect');
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    el = h('div', { id: 'as-reconnect', class: 'reconnect', role: 'status' }, [icon('refresh', 'sm'), h('span', { text: 'Reconnecting. Your answers are safe and your clock is paused.' })]);
    document.body.appendChild(el);
  }
  function api(path, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var headers = {};
    if (opts.body !== undefined && !opts.raw) headers['Content-Type'] = 'application/json';
    if (opts.raw) headers['Content-Type'] = opts.contentType || 'application/octet-stream';
    if (opts.token) headers['X-Assess-Token'] = opts.token;
    // Session 66: the host restarts on every deploy and 502/503/504 come from its proxy, not from us.
    // Repeatable requests (GET, PUT, DELETE) retry quietly while it comes back; others fail with plain words.
    // Live exam calls are patient: they keep trying for up to 2.5 minutes, because the person's answers and clock are safe on the server.
    var patient = !!opts.patient, t0 = Date.now();
    var canRetry = patient || method === 'GET' || method === 'PUT' || method === 'DELETE';
    var waits = [1500, 3000, 6000, 10000];
    function again(n) { return patient ? (Date.now() - t0 < 150000) : n < waits.length; }
    function pause(n) { return patient ? Math.min(5000, 1500 + n * 1000) : waits[n]; }
    function once(n) {
      return fetch(path, { method: method, credentials: 'same-origin', headers: headers, body: opts.raw ? opts.raw : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) })
        .catch(function () { return { status: 0, ok: false, json: function () { return Promise.resolve(null); } }; })
        .then(function (r) {
          if ((r.status === 0 || r.status === 502 || r.status === 503 || r.status === 504) && canRetry && again(n)) {
            if (patient) reconnectBar(true); else if (n === 1) toast('Reconnecting to the server...');
            return new Promise(function (ok) { setTimeout(ok, pause(n)); }).then(function () { return once(n + 1); });
          }
          if (patient && !netDown) reconnectBar(false);
          return r.json().catch(function () { return null; }).then(function (j) {
            var down = r.status === 0 || r.status === 502 || r.status === 503 || r.status === 504;
            if (!j) j = { success: false, error: down ? 'The server is restarting or busy. Wait a few seconds and try again.' : 'HTTP ' + r.status };
            if (r.status === 401) { location.replace(EMBED ? '/' : '/?next=/assess'); throw new Error('Please sign in'); }
            if (!r.ok || j.success === false) { var e = new Error(j.error || ('HTTP ' + r.status)); e.code = j.code; e.status = r.status; e.noAccess = j.noAccess; throw e; }
            return j;
          });
        });
    }
    return once(0);
  }
  function toDate(iso) { if (!iso) return null; return new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(' ', 'T') + 'Z'); }
  function fmtWhen(iso) {
    var d = toDate(iso); if (!d) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CST';
  }
  function fmtDay(iso) { var d = toDate(iso); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : ''; }
  function secs(ms) { return ms == null ? '' : (Math.round(ms / 100) / 10) + 's'; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function errBox(msg) { return h('div', { class: 'alert', role: 'alert' }, [icon('warn'), h('span', { text: msg })]); }
  function initials(s) { return String(s || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0].toUpperCase(); }).join(''); }
  function pill(text, cls, dot) { return h('span', { class: 'pill' + (cls ? ' ' + cls : '') }, [dot ? h('span', { class: 'dot' }) : null, text]); }
  // Session 62: numbers that count up when they appear (off with reduced motion)
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el, to, suffix) {
    suffix = suffix || '';
    if (REDUCED || !isFinite(to)) { el.textContent = to + suffix; return; }
    var t0 = performance.now(), dur = 700;
    (function step(now) { var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e) + suffix; if (k < 1) requestAnimationFrame(step); })(t0);
  }
  // Session 64: a small dropdown menu (native <details>)
  function menu(label, ic, items, cls) {
    var d = h('details', { class: 'menu' + (cls ? ' ' + cls : '') });
    d.appendChild(h('summary', { class: 'btn' + (cls && /\bprimary\b/.test(cls) ? ' primary' : '') }, [icon(ic || 'download', 'sm'), label, h('span', { class: 'caret', 'aria-hidden': 'true', text: '▾' })]));
    var list = h('div', { class: 'menu-list', role: 'menu' });
    items.forEach(function (it) {
      if (!it) return;
      list.appendChild(h(it.href ? 'a' : 'button', { class: 'menu-item', role: 'menuitem', type: it.href ? null : 'button', href: it.href || null, onclick: function (e) { d.open = false; if (it.onclick) it.onclick(e); } }, [icon(it.icon || 'doc', 'sm'), h('span', null, [h('b', { text: it.label }), it.sub ? h('span', { text: it.sub }) : null])]));
    });
    d.appendChild(list);
    d.addEventListener('toggle', function () { if (!d.open) return; var r = d.getBoundingClientRect(); var w = list.offsetWidth || 240; var vw = document.documentElement.clientWidth; var alignLeft = (r.left + w <= vw - 8); list.style.left = alignLeft ? '0' : 'auto'; list.style.right = alignLeft ? 'auto' : '0'; if (!alignLeft && r.right - w < 8) { list.style.right = 'auto'; list.style.left = Math.max(8 - r.left, 0) + 'px'; } });
    document.addEventListener('click', function (e) { if (d.open && !d.contains(e.target)) d.open = false; });
    return d;
  }
  // Session 64: print a clean sheet (the browser's Save as PDF works too)
  function printSheet(title, sub, nodes) {
    var root = document.getElementById('print-root');
    if (root) root.remove();
    root = h('div', { id: 'print-root', class: 'print-root' }, [
      h('div', { class: 'pr-head' }, [h('img', { src: '/adit-icon-32.png', alt: '', width: '28', height: '28' }), h('div', null, [h('h1', { text: title }), sub ? h('p', { text: sub }) : null]), h('span', { class: 'pr-date', text: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })]),
    ].concat(nodes));
    document.body.appendChild(root);
    document.body.classList.add('printing');
    var done = function () { document.body.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); setTimeout(function () { if (document.body.classList.contains('printing')) done(); }, 1500); }, 60);
  }
  function printBank(answers, filter) {
    var qs = new URLSearchParams({ format: 'json', answers: answers ? '1' : '0' });
    if (filter && filter.status) qs.set('status', filter.status); if (filter && filter.tag) qs.set('tag', filter.tag); if (filter && filter.q) qs.set('q', filter.q);
    api('/api/assess/admin/questions/export?' + qs).then(function (j) {
      var nodes = j.items.map(function (it) {
        var opts = h('ol', { class: 'pr-opts', type: 'A' }, it.options.map(function (o) { return h('li', { text: o }); }));
        return h('div', { class: 'pr-q' }, [h('div', { class: 'pr-qh' }, [h('b', { text: it.n + '. ' }), h('span', { text: it.prompt })]), h('div', { class: 'pr-meta', text: TYPE_SHORT[it.type] + (it.tags ? ' · ' + it.tags.split(',').join(', ') : '') }),
          opts, it.matches ? h('div', { class: 'pr-meta', text: 'Match with: ' + it.matches.join(' · ') }) : null,
          answers ? h('div', { class: 'pr-key' }, [h('b', { text: 'Answer: ' }), it.key || '']) : null,
          answers && it.explanation ? h('div', { class: 'pr-meta', text: 'Why: ' + it.explanation }) : null]);
      });
      printSheet(answers ? 'Question bank with answer key' : 'Question bank', j.items.length + ' questions', nodes.length ? nodes : [h('p', { text: 'No questions match.' })]);
    }).catch(function (e) { toast(e.message); });
  }
  // Session 63: animated illustration (illus.js), falls back to nothing
  function art(name, size) {
    var el = h('div', { class: 'art', 'aria-hidden': 'true' });
    if (window.AditIllus) el.innerHTML = window.AditIllus.svg(name, { size: size || 170 });
    return el;
  }
  // Unlock a test that was locked because the agent left full screen. Owner and admins only (the server checks too).
  function canUnlock() { return !!(me && (me.owner || me.admin)); }
  function unlockBtn(attId, done, label) {
    var b = h('button', { class: 'btn sm primary', type: 'button', title: 'Let them carry on from the same question with the same time left' }, [icon('refresh', 'sm'), label || 'Unlock']);
    b.addEventListener('click', function (e) {
      e.stopPropagation(); b.disabled = true;
      api('/api/assess/admin/attempts/' + attId + '/unlock', { method: 'POST', body: {} }).then(function (r) { toast('Unlocked. They continue from the same question' + (r.seconds ? ' (' + r.seconds + 's was not counted).' : '.')); if (done) done(); }).catch(function (er) { toast(er.message); b.disabled = false; });
    });
    return b;
  }
  function tierPill(t) { var x = TIER[t]; return x ? pill(x[0], x[1], true) : pill('Not finished', ''); }
  function pageHead(title, sub, acts, crumb) {
    return h('div', { class: 'ph-wrap' }, [
      crumb ? h('button', { class: 'crumb', type: 'button', onclick: crumb.go }, [icon('arrowL', 'sm'), crumb.text]) : null,
      h('div', { class: 'ph' }, [h('div', null, [h('h1', { text: title }), sub ? h('p', { text: sub }) : null]), acts ? h('div', { class: 'acts' }, acts) : null]),
    ]);
  }
  function skeleton() { return h('div', null, [h('div', { class: 'skel', style: 'height:120px;margin-bottom:12px' }), h('div', { class: 'skel', style: 'height:120px' })]); }
  function field(label, input, hint, id) {
    if (id && input && !input.id) input.id = id;
    return h('div', { class: 'field' }, [h('label', { for: input && input.id, text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null]);
  }
  function toggle(label, checked, sub) {
    var inp = h('input', { type: 'checkbox', checked: checked ? true : null });
    var el = h('label', { class: 'setrow' }, [h('div', { class: 'tx' }, [h('b', { text: label }), sub ? h('span', { text: sub }) : null]), h('span', { class: 'toggle' }, [inp, h('span', { class: 'sw' })])]);
    el.input = inp; return el;
  }
  function openDrawer(title, body, foot) {
    var dlg = h('dialog', { class: 'drawer', 'aria-label': title });
    var close = h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Close' }, [icon('x')]);
    dlg.appendChild(h('div', { class: 'dh' }, [h('h2', { text: title }), close]));
    dlg.appendChild(h('div', { class: 'db' }, [body]));
    if (foot) dlg.appendChild(h('div', { class: 'df' }, foot));
    close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    return dlg;
  }

  // ── Canvas text ──────────────────────────────────────────────────────
  function fitCanvas(c, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth || (c.parentNode && c.parentNode.clientWidth) || 600;
    c.style.height = cssH + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(cssH * dpr);
    var ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: cssH };
  }
  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (wd) {
      var test = line ? line + ' ' + wd : wd;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = wd; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  function drawText(c, text, opts) {
    opts = opts || {};
    var font = opts.font || '500 20px Poppins, sans-serif', lh = opts.lineH || 32;
    var probe = c.getContext('2d'); probe.font = font;
    var w = c.clientWidth || (c.parentNode && c.parentNode.clientWidth) || 600;
    var lines = wrapLines(probe, text, w - 2);
    var f = fitCanvas(c, Math.max(opts.minH || 0, lines.length * lh + 6));
    f.ctx.font = font; f.ctx.fillStyle = opts.color || cssVar('--t1'); f.ctx.textBaseline = 'middle';
    lines.forEach(function (ln, i) { f.ctx.fillText(ln, 0, i * lh + lh / 2 + 2); });
  }

  // Session 68: reading speed. Four steps. Admins tune it on a notched dial (remembered on their device); agents get the assessment's starting speed.
  var SPEEDS = [{ label: 'Fast', ms: 700 }, { label: 'Medium', ms: 1000 }, { label: 'Slow', ms: 1400 }, { label: 'Slowest', ms: 2000 }];
  function speedFor(ms) { var best = 1, gap = 1e9; SPEEDS.forEach(function (o, i) { var d = Math.abs(o.ms - (ms || 1000)); if (d < gap) { gap = d; best = i; } }); return best; }
  function savedSpeed(dflt) { try { var v = parseInt(localStorage.getItem('as-read-speed'), 10); if (v >= 0 && v < SPEEDS.length) return v; } catch (e) {} return dflt; }
  function saveSpeed(i) { try { localStorage.setItem('as-read-speed', String(i)); } catch (e) {} }
  /** A crown-style dial: drag it, scroll over it, click it or use the arrow keys. It turns and clicks into four notches. */
  function SpeedDial(idx, onChange) {
    var wheel = h('span', { class: 'sd-wheel', 'aria-hidden': 'true' });
    var name = h('b', { class: 'sd-name' });
    var ticks = h('span', { class: 'sd-ticks', 'aria-hidden': 'true' }, SPEEDS.map(function () { return h('i'); }));
    var el = h('div', { class: 'sd', role: 'slider', tabindex: '0', 'aria-label': 'Reading speed', 'aria-valuemin': '0', 'aria-valuemax': String(SPEEDS.length - 1), title: 'Reading speed. Drag, scroll or use the arrow keys. It applies on the next replay.' }, [
      h('span', { class: 'sd-cap small muted', text: 'Reading speed' }), h('span', { class: 'sd-row' }, [wheel, h('span', { class: 'sd-lab' }, [name, ticks])])]);
    function paint() {
      wheel.style.transform = 'rotate(' + (idx * 60 - 90) + 'deg)';
      name.textContent = SPEEDS[idx].label;
      el.setAttribute('aria-valuenow', String(idx)); el.setAttribute('aria-valuetext', SPEEDS[idx].label);
      Array.prototype.forEach.call(ticks.children, function (t, k) { t.className = k === idx ? 'on' : (k < idx ? 'lo' : ''); });
    }
    function set(i, fromUser) {
      i = Math.max(0, Math.min(SPEEDS.length - 1, i));
      if (i === idx) return;
      idx = i; paint(); saveSpeed(idx); if (fromUser && navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
      if (onChange) onChange(idx);
    }
    var lastWheel = 0;
    el.addEventListener('wheel', function (e) { e.preventDefault(); var n = Date.now(); if (n - lastWheel < 140) return; lastWheel = n; set(idx + ((e.deltaY || e.deltaX) > 0 ? 1 : -1), true); }, { passive: false });
    el.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); set(idx + 1, true); }
      else if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); set(idx - 1, true); }
      else if (k === 'Home') { e.preventDefault(); set(0, true); } else if (k === 'End') { e.preventDefault(); set(SPEEDS.length - 1, true); }
    });
    var drag = null, moved = false;
    el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, at: idx }; moved = false; try { el.setPointerCapture(e.pointerId); } catch (x) {} });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var d = (e.clientX - drag.x) - (e.clientY - drag.y);
      if (Math.abs(d) > 5) moved = true;
      set(drag.at + Math.round(d / 26), true);
    });
    function up() { if (drag && !moved) set(idx + 1 >= SPEEDS.length ? 0 : idx + 1, true); drag = null; }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', function () { drag = null; });
    paint();
    return el;
  }

  /** Rolling reveal: one group of words at a time in a fixed reading band.
   *  The group before it moves up and dims, anything older is gone, so a
   *  single screenshot never holds the whole question. Groups ending in
   *  punctuation stay a little longer. */
  function Reader(host, text, s, onEnd) {
    var canvas = h('canvas', { 'aria-hidden': 'true' });
    var dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
    var state = h('span', { class: 'state', text: 'Reading…' });
    var replayBtn = h('button', { class: 'btn sm primary replay', type: 'button', disabled: true }, [icon('replay', 'sm'), 'Replay from start']);
    // The speed dial is for admins only (editor "Preview reading" only). Agents read at the assessment's starting speed.
    var showDial = !!s.dial;
    var speedIdx = showDial ? savedSpeed(speedFor(s.chunkMs)) : speedFor(s.chunkMs);
    var dial = showDial ? SpeedDial(speedIdx, function (i) { speedIdx = i; }) : null;
    host.appendChild(h('div', { class: 'reader' }, [canvas, h('div', { class: 'bar' }, [dots, h('span', { class: 'spacer' }), state, dial, replayBtn])]));
    var words = String(text).split(/\s+/).filter(Boolean), per = Math.max(2, s.wordsPerChunk || 4), chunks = [];
    for (var i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(' '));
    var starts = [], t = 0, total = 0, raf = 0, t0 = 0, running = false, self = this, lastIdx = -1;
    function timing() {
      var ms = SPEEDS[speedIdx].ms; starts = []; t = 0;
      chunks.forEach(function (c) {
        starts.push(t);
        var n = c.split(' ').length;
        t += ms * (0.55 + 0.45 * n / per) + (/[.,;:?!]$/.test(c) ? 280 : 0);
      });
      total = t + 500; self.durationMs = total;
    }
    timing();
    chunks.forEach(function () { dots.appendChild(h('i')); });
    var f = null;
    function size() { f = fitCanvas(canvas, 118); }
    function ease(x) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); }
    function drawChunk(txt, y, px, alpha, weight) {
      if (alpha <= 0 || !txt) return;
      f.ctx.globalAlpha = alpha; f.ctx.font = weight + ' ' + px + 'px Poppins, sans-serif';
      var lines = wrapLines(f.ctx, txt, f.w - 8), lh = px * 1.3;
      lines.forEach(function (ln, k) { var w = f.ctx.measureText(ln).width; f.ctx.fillText(ln, (f.w - w) / 2, y + (k - (lines.length - 1) / 2) * lh); });
    }
    function frame(now) {
      if (!t0) t0 = now;
      var el = now - t0, idx = -1;
      for (var k = 0; k < starts.length; k++) if (el >= starts[k]) idx = k;
      f.ctx.clearRect(0, 0, f.w, f.h); f.ctx.textBaseline = 'middle'; f.ctx.fillStyle = cssVar('--t1');
      if (el < t && idx >= 0) {
        var p = ease((el - starts[idx]) / 260);
        if (idx > 0) drawChunk(chunks[idx - 1], 70 - 46 * p, 24 - 9 * p, 1 - 0.62 * p, 500);
        if (idx > 1) drawChunk(chunks[idx - 2], 24 - 20 * p, 15, 0.38 * (1 - p), 500);
        drawChunk(chunks[idx], 82 - 12 * p, 24, p, 600);
      } else if (el >= t) {
        var q = ease((el - t) / 400);
        drawChunk(chunks[chunks.length - 1], 70, 24, 1 - q, 600);
        if (chunks.length > 1) drawChunk(chunks[chunks.length - 2], 24, 15, 0.38 * (1 - q), 500);
      }
      f.ctx.globalAlpha = 1;
      if (idx !== lastIdx) {
        lastIdx = idx;
        Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k === idx ? 'on' : (k < idx ? 'past' : ''); });
      }
      if (el < total) raf = requestAnimationFrame(frame);
      else { running = false; replayBtn.disabled = false; replayBtn.classList.remove('nudge'); void replayBtn.offsetWidth; replayBtn.classList.add('nudge'); state.textContent = 'Replay if you need to read it again.'; Array.prototype.forEach.call(dots.children, function (d) { d.className = 'past'; }); if (onEnd) onEnd(); }
    }
    this.play = function () { cancelAnimationFrame(raf); timing(); size(); t0 = 0; lastIdx = -1; running = true; replayBtn.disabled = true; state.textContent = 'Reading…'; raf = requestAnimationFrame(frame); };
    this.stop = function () { cancelAnimationFrame(raf); running = false; };
    this.resize = function () { size(); if (!running) f.ctx.clearRect(0, 0, f.w, f.h); };
    this.replayBtn = replayBtn;
    replayBtn.addEventListener('click', function () { if (self.onReplay) self.onReplay(); self.play(); });
  }
  function FullText(host, text) {
    var canvas = h('canvas', { 'aria-hidden': 'true' });
    host.appendChild(h('div', { class: 'reader', style: 'min-height:auto' }, [canvas]));
    function draw() { drawText(canvas, text, { font: '500 19px Poppins, sans-serif', lineH: 31 }); }
    requestAnimationFrame(draw);
    this.resize = draw; this.stop = function () {}; this.play = function () {};
  }

  /** Session 58: read-aloud mode. The question arrives as audio only, so
   *  there is no text on screen to copy, screenshot or read by OCR. */
  function AudioPrompt(host, loadBlob, onPlay) {
    var bars = h('div', { class: 'eq', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i'), h('i')]);
    var state = h('span', { class: 'state', text: 'Loading the question…' });
    var prog = h('i');
    var again = h('button', { class: 'btn sm', type: 'button', disabled: true }, [icon('replay', 'sm'), 'Play again']);
    var box = h('div', { class: 'reader audio' }, [
      h('div', { class: 'aud' }, [h('span', { class: 'aud-ic' }, [icon('headphones', 'lg')]), h('div', { style: 'flex:1;min-width:0' }, [h('b', { text: 'Listen to the question' }), state, h('div', { class: 'aprog' }, [prog])]), bars]),
      h('div', { class: 'bar' }, [h('span', { class: 'small muted', text: 'Use headphones. The question is not shown as text.' }), h('span', { class: 'spacer' }), again]),
    ]);
    host.appendChild(box);
    var audio = new Audio(), url = null, self = this, plays = 0;
    audio.addEventListener('playing', function () { box.classList.add('playing'); state.textContent = 'Playing…'; again.disabled = true; });
    audio.addEventListener('timeupdate', function () { if (audio.duration) prog.style.width = (audio.currentTime / audio.duration * 100) + '%'; });
    audio.addEventListener('ended', function () { box.classList.remove('playing'); prog.style.width = '100%'; state.textContent = 'Finished. Play again if you need to.'; again.disabled = false; });
    function play() {
      plays++; if (plays > 1 && onPlay) onPlay();
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { box.classList.remove('playing'); state.textContent = 'Press Play to hear the question.'; again.disabled = false; clear(again); again.appendChild(icon('volume', 'sm')); again.appendChild(document.createTextNode('Play')); plays--; });
    }
    again.addEventListener('click', function () { play(); });
    loadBlob().then(function (blob) {
      url = URL.createObjectURL(blob); audio.src = url; play();
    }).catch(function (e) { state.textContent = 'The audio could not be loaded: ' + e.message; });
    this.stop = function () { try { audio.pause(); } catch (e) {} if (url) URL.revokeObjectURL(url); };
    this.play = function () {}; this.resize = function () {};
  }
  function beepTest(done) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext, ctx = new Ctx();
      [[-1, 0], [1, 0.9]].forEach(function (x) {
        var o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        o.frequency.value = 523; g.gain.setValueAtTime(0.0001, ctx.currentTime + x[1]); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + x[1] + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + x[1] + 0.7);
        if (p) { p.pan.value = x[0]; o.connect(g); g.connect(p); p.connect(ctx.destination); } else { o.connect(g); g.connect(ctx.destination); }
        o.start(ctx.currentTime + x[1]); o.stop(ctx.currentTime + x[1] + 0.75);
      });
      setTimeout(function () { ctx.close(); if (done) done(); }, 1800);
    } catch (e) { if (done) done(); }
  }

  // ── Session 66: notification centre ─────────────────────────────────
  var bellBox = h('div', { class: 'bell-wrap' });
  var notif = { items: [], unread: 0, build: null, seenMax: null, open: false, timer: null };
  var KIND_ICON = { assigned: 'clipboard', retest: 'refresh', remind: 'clock', results: 'check', update: 'spark' };
  function inExam() { return !!document.querySelector('.exam'); }
  function onHome() { var hsh = location.hash.replace(/^#/, ''); return !hsh || hsh === 'my'; }
  function ago(iso) {
    var d = toDate(iso); if (!d) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    return fmtDay(iso);
  }
  function drawBell() {
    clear(bellBox);
    var btn = h('button', { class: 'bell-btn', type: 'button', 'aria-label': 'Notifications' + (notif.unread ? ', ' + notif.unread + ' unread' : ''), 'aria-expanded': String(notif.open), onclick: function (e) { e.stopPropagation(); notif.open = !notif.open; drawBell(); if (notif.open) refreshNotifs(true); } },
      [icon('bell', 'sm'), notif.unread ? h('span', { class: 'bell-n', text: notif.unread > 9 ? '9+' : String(notif.unread) }) : null]);
    bellBox.appendChild(btn);
    if (!notif.open) return;
    var upd = notif.updateReady;
    var list = notif.items.map(function (n) {
      return h('button', { class: 'nt' + (n.read ? '' : ' unread'), type: 'button', onclick: function () { openNotif(n); } }, [
        h('span', { class: 'nt-ic' }, [icon(KIND_ICON[n.kind] || 'bell', 'sm')]),
        h('span', { class: 'nt-tx' }, [h('b', { text: n.title }), n.body ? h('span', { text: n.body }) : null, h('span', { class: 'nt-t', text: ago(n.at) })]),
        n.read ? null : h('span', { class: 'nt-dot', 'aria-hidden': 'true' })]);
    });
    if (upd) list.unshift(h('button', { class: 'nt unread', type: 'button', onclick: function () { location.reload(); } }, [
      h('span', { class: 'nt-ic' }, [icon('spark', 'sm')]), h('span', { class: 'nt-tx' }, [h('b', { text: 'A new version is ready' }), h('span', { text: 'New pages or fixes were added. Tap to refresh.' })])]));
    bellBox.appendChild(h('div', { class: 'nt-panel', role: 'dialog', 'aria-label': 'Notifications' }, [
      h('div', { class: 'nt-hd' }, [h('b', { text: 'Notifications' }), h('span', { class: 'spacer' }),
        notif.unread ? h('button', { class: 'btn ghost sm', type: 'button', text: 'Mark all read', onclick: markAll }) : null]),
      list.length ? h('div', { class: 'nt-list' }, list) : h('div', { class: 'nt-empty', text: 'Nothing new. Assignments, retests and reminders show up here.' })]));
  }
  function openNotif(n) {
    notif.open = false;
    if (!n.read) { n.read = true; notif.unread = Math.max(0, notif.unread - 1); api('/api/assess/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(function () {}); }
    drawBell();
    if (!inExam()) go('');
  }
  function markAll() {
    notif.items.forEach(function (n) { n.read = true; }); notif.unread = 0; drawBell();
    api('/api/assess/notifications/read', { method: 'POST', body: {} }).catch(function () {});
  }
  function refreshNotifs(quiet) {
    return api('/api/assess/notifications').then(function (r) {
      var maxId = r.items.length ? r.items[0].id : 0;
      var fresh = notif.seenMax != null ? r.items.filter(function (n) { return n.id > notif.seenMax && !n.read; }) : [];
      notif.items = r.items; notif.unread = r.unread;
      if (notif.build && r.build && r.build !== notif.build) notif.updateReady = true;
      if (!notif.build) notif.build = r.build;
      var firstLoad = notif.seenMax == null;
      notif.seenMax = Math.max(maxId, notif.seenMax || 0);
      drawBell();
      if (fresh.length && !firstLoad && !inExam()) {
        toast(fresh[0].title + (fresh.length > 1 ? ' and ' + (fresh.length - 1) + ' more' : ''));
        if (onHome() && !document.querySelector('dialog[open]')) route(); // new work for this person: refresh the list
      }
      if (notif.updateReady && !inExam() && onHome() && !document.querySelector('dialog[open]') && document.visibilityState === 'hidden') location.reload();
    }).catch(function () {});
  }
  function startNotifs() {
    drawBell(); refreshNotifs(true);
    if (notif.timer) return;
    notif.timer = setInterval(function () { if (document.visibilityState === 'visible' && !inExam()) refreshNotifs(true); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !inExam()) refreshNotifs(true); });
    document.addEventListener('click', function (e) { if (notif.open && !bellBox.contains(e.target)) { notif.open = false; drawBell(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && notif.open) { notif.open = false; drawBell(); } });
  }
  // ── Boot + routing ───────────────────────────────────────────────────
  function boot() {
    api('/api/assess/me').then(function (j) {
      me = j;
      if (AGENT_ONLY) { me.reviewer = false; me.owner = false; }
      renderUser();
      if (!j.allowed) return gate();
      window.addEventListener('hashchange', route);
      route();
      startNotifs();
    }).catch(function (e) {
      if (/sign in/i.test(e.message)) return;
      clear(main); main.appendChild(errBox('Could not load assessments: ' + e.message));
    });
  }
  function renderUser() {
    clear(userBox);
    var av = h('span', { class: 'as-avatar' }, [me.picture ? h('img', { src: me.picture, alt: '', referrerpolicy: 'no-referrer' }) : initials(me.name || me.email)]);
    userBox.appendChild(bellBox);
    userBox.appendChild(av);
    userBox.appendChild(h('span', { class: 'who' }, [h('b', { text: me.name || me.email, title: me.email }), h('span', { text: me.reviewer ? 'Reviewer' : (me.member ? 'Team member' : 'Guest') })]));
    if (me.member && !EMBED) userBox.appendChild(h('a', { class: 'btn sm', href: '/', text: 'Open the tool' }));
    userBox.appendChild(h('button', { class: 'btn sm ghost', type: 'button', text: 'Sign out', onclick: function () {
      fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).finally(function () {
        try { localStorage.removeItem('rcSession'); sessionStorage.clear(); } catch (e) {}
        location.replace('/?next=/assess');
      });
    } }));
  }
  var SECTIONS = [['', 'My assessments', 'clipboard'], ['manage', 'Assessments', 'layers'], ['studio', 'AI Studio', 'bot'], ['reports', 'Reports', 'chart'], ['live', 'Live', 'eye'], ['bank', 'Question bank', 'list'], ['access', 'Access', 'shield']];
  function renderNav(cur) {
    clear(nav);
    var scopedOnly = !me.reviewer && me.reviewTests && me.reviewTests.length;
    if (!me.reviewer && !scopedOnly) return; // takers only have one page
    SECTIONS.filter(function (s) { return me.reviewer || s[0] === '' || s[0] === 'manage'; }).forEach(function (s) {
      nav.appendChild(h('button', { type: 'button', 'aria-current': cur === s[0] ? 'page' : null, onclick: function () { go(s[0]); } }, [icon(s[2], 'sm'), h('span', { text: s[1] })]));
    });
  }
  function hashQuery() { var q = location.hash.split('?')[1] || ''; try { return new URLSearchParams(q); } catch (e) { return new URLSearchParams(); } }
  function go(hash) { if (('#' + hash) === location.hash || (!hash && !location.hash)) route(); else location.hash = hash; }
  function route() {
    var parts = location.hash.replace(/^#/, '').split('?')[0].split('/');
    var sec = parts[0] || '', arg = parts[1];
    var scopedOnly = !me.reviewer && me.reviewTests && me.reviewTests.length;
    if (!me.reviewer && !(scopedOnly && (sec === 'manage' || sec === 'results' || sec === 'attempt'))) sec = '';
    var top = { edit: 'manage', results: 'manage', attempt: 'manage', archived: 'manage', insights: 'reports' }[sec] || sec;
    renderNav(top);
    clear(main); main.focus({ preventScroll: true }); window.scrollTo(0, 0);
    if (sec === 'manage') return viewManage();
    if (sec === 'edit') return viewBuilder(arg === 'new' ? null : Number(arg));
    if (sec === 'results') return viewResults(Number(arg));
    if (sec === 'attempt') return viewAttempt(Number(arg));
    if (sec === 'bank') return viewBank();
    if (sec === 'live') return viewLive();
    if (sec === 'insights') return viewReports('topics');
    if (sec === 'reports') return viewReports(hashQuery().get('tab') || 'overview');
    if (sec === 'archived') return viewArchived();
    if (sec === 'studio') return arg ? viewStudio(Number(arg)) : viewStudioHome();
    if (sec === 'access') return viewAccess();
    return viewHome();
  }
  function gate() {
    renderNav('');
    clear(nav);
    clear(main);
    main.appendChild(h('div', { class: 'card gate' }, [
      art('denied', 200),
      h('h1', { text: 'You do not have access yet' }),
      h('p', { text: 'You are signed in as ' + me.email + '. Assessments are open to the T1 team and people invited by a reviewer.' }),
      h('p', { class: 'muted small', text: 'Ask Sebastin (sebastin.n@adit.com) to add you, then reload this page.' }),
    ]));
  }

  // ── Taker: ground rules, one at a time, rotating gently ─────────────
  var GROUND_RULES = [
    ['monitor', 'Set up your space', 'Use a computer in a quiet, well-lit spot. Phones and tablets are not supported.'],
    ['clock', 'Every question is timed', 'When the timer ends, your current choice is saved and the next question opens.'],
    ['eye', 'Stay on the test', 'Keep the test in full screen and on its own tab. Leaving is recorded for your reviewer.'],
    ['camera', 'Camera checks', 'Some tests use your camera. Keep your face in view, stay alone, and keep the camera uncovered or the test ends.'],
    ['lock', 'No copying or looking things up', 'Copy, paste, print and right-click are blocked. Do not use notes, other people, search or AI tools.'],
    ['replay', 'If something goes wrong', 'Reopen the test from this page. Your answers are kept, but the timer keeps running.'],
    ['chat', 'A conversation may follow', 'Your reviewer may ask you to talk through some answers afterwards.'],
  ];
  function rulesStrip() {
    var i = 0, timer = null, paused = false;
    var card = h('div', { class: 'rule-card', 'aria-live': 'off' });
    var dots = h('div', { class: 'rule-dots' });
    var count = h('span', { class: 'rule-n' });
    function paint(dir) {
      var r = GROUND_RULES[i];
      clear(card);
      card.className = 'rule-card ' + (dir === -1 ? 'in-prev' : 'in-next');
      card.appendChild(h('span', { class: 'ic-round' }, [icon(r[0] === 'monitor' ? 'doc' : r[0], 'sm')]));
      card.appendChild(h('div', null, [h('b', { text: r[1] }), h('span', { text: r[2] })]));
      count.textContent = (i + 1) + ' of ' + GROUND_RULES.length;
      Array.prototype.forEach.call(dots.children, function (d, k) { d.setAttribute('aria-current', String(k === i)); });
    }
    function go_(k, dir) { i = (k + GROUND_RULES.length) % GROUND_RULES.length; paint(dir); restart(); }
    function restart() { clearInterval(timer); if (REDUCED) return; timer = setInterval(function () { if (paused) return; if (!document.body.contains(card)) { clearInterval(timer); return; } i = (i + 1) % GROUND_RULES.length; paint(1); }, 5500); }
    GROUND_RULES.forEach(function (r, k) { dots.appendChild(h('button', { type: 'button', class: 'rule-dot', 'aria-label': 'Rule ' + (k + 1) + ': ' + r[1], onclick: function () { go_(k, k < i ? -1 : 1); } })); });
    var el = h('div', { class: 'rules', role: 'region', 'aria-label': 'Ground rules' }, [
      h('div', { class: 'rules-hd' }, [h('span', { class: 'eyebrow', text: 'Ground rules' }), h('span', { class: 'spacer' }), count,
        h('button', { class: 'rule-nav', type: 'button', 'aria-label': 'Previous rule', text: '‹', onclick: function () { go_(i - 1, -1); } }),
        h('button', { class: 'rule-nav', type: 'button', 'aria-label': 'Next rule', text: '›', onclick: function () { go_(i + 1, 1); } })]),
      card, dots,
      h('details', { class: 'rules-all' }, [h('summary', { text: 'See all ground rules' }), h('ul', null, GROUND_RULES.map(function (r) { return h('li', null, [h('b', { text: r[1] + '. ' }), r[2]]); }))]),
    ]);
    el.addEventListener('mouseenter', function () { paused = true; }); el.addEventListener('mouseleave', function () { paused = false; });
    el.addEventListener('focusin', function () { paused = true; }); el.addEventListener('focusout', function () { paused = false; });
    paint(1); restart();
    return el;
  }
  // ── Taker: home ──────────────────────────────────────────────────────
  function viewHome() {
    var first = String(me.name || '').split(' ')[0];
    var hero = h('div', { class: 'hero' }, [h('div', { class: 'hero-tx' }, [h('span', { class: 'eyebrow', text: 'My assessments' }), h('h1', { text: first ? 'Hi ' + first + ', here are your assessments' : 'Your assessments' }), h('p', { text: 'Each assessment is timed and monitored so results are fair for everyone. Read the ground rules below before you start.' })]), h('div', { class: 'hero-art' }, [art('tests', 190)]), h('div', { class: 'hero-stats', id: 'hero-stats' }), rulesStrip()]);
    main.appendChild(hero);
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    api('/api/assess/me').then(function (j) {
      me.tests = j.tests; clear(holder);
      if (!j.tests.length) {
        holder.appendChild(h('div', { class: 'empty' }, [art('tests'), h('b', { text: 'Nothing assigned right now' }), h('span', { text: 'When your lead assigns an assessment, it will appear here.' })]));
        return;
      }
      var hs = document.getElementById('hero-stats');
      if (hs) {
        var todo = j.tests.filter(function (t) { return !t.last && !t.inProgress && t.canStart; }).length, prog = j.tests.filter(function (t) { return t.inProgress; }).length, doneN = j.tests.filter(function (t) { return t.last; }).length;
        [[todo, 'To do'], [prog, 'In progress'], [doneN, 'Done']].forEach(function (x) { var b = h('b', { text: '0' }); hs.appendChild(h('div', { class: 'hs' }, [b, h('span', { text: x[1] })])); countUp(b, x[0]); });
      }
      var grid = h('div', { class: 'grid-cards stagger' });
      j.tests.forEach(function (t) {
        var status = t.stopped ? pill('Stopped: camera', 'bad', true) : t.inProgress ? pill('In progress', 'warn', true) : t.windowState === 'upcoming' ? pill('Opens ' + fmtWhen(t.opensAt), '', true)
          : (t.last ? pill('Completed', 'ok', true) : t.windowState === 'closed' ? pill('Closed', 'bad', true) : pill('Not started', 'accent', true));
        var btnText = t.stopped ? 'Waiting for a retest' : t.inProgress ? 'Resume' : t.windowState === 'upcoming' ? 'Not open yet' : (t.canStart ? (t.last ? 'Take again' : 'Start') : (t.last ? 'Completed' : 'Closed'));
        var viewBtn = t.last && t.lastAttemptId && (t.releaseMode !== 'none' || t.last.score != null) ? h('button', { class: 'btn', type: 'button', onclick: function () { viewMyResult(t.lastAttemptId); } }, [icon('eye', 'sm'), 'View result']) : null;
        var due = t.inProgress && t.autoSubmitAt ? h('p', { class: 'small', style: 'margin:0;color:var(--warn)', text: 'Resume before ' + fmtWhen(t.autoSubmitAt) + '. After that it is submitted automatically and unanswered questions count as wrong.' })
          : (!t.last && t.closesAt && t.windowState === 'open' ? h('p', { class: 'small', style: 'margin:0;color:var(--warn)', text: 'Due by ' + fmtWhen(t.closesAt) }) : null);
        var result = null;
        if (t.stopped) result = h('p', { class: 'small', style: 'margin:0;color:var(--bad)', text: 'This test was stopped because the camera rules were not followed. Your reviewer can send you a retest.' });
        else if (t.last) result = h('p', { class: 'small muted', text: 'Submitted ' + fmtWhen(t.last.finishedAt) + (t.last.score != null ? '. Score ' + t.last.score + ' of ' + t.last.maxScore + '.' : '. Your reviewer will share the result.') });
        var tone = t.stopped ? 'warn' : t.inProgress ? 'warn' : (t.last ? 'ok' : (t.canStart ? 'accent' : 'mute'));
        grid.appendChild(h('div', { class: 'card tcard tone-' + tone }, [
          h('div', { class: 'top' }, [h('div', { class: 'ic' }, [icon('clipboard', 'lg')]), h('h2', { text: t.title }), status]),
          t.description ? h('p', { class: 'tdesc', text: t.description }) : null,
          modChips(t.modules),
          h('dl', { class: 'facts' }, [
            h('div', null, [h('dt', { text: 'Questions' }), h('dd', { text: String(t.questions + (t.explainCount ? ' + ' + t.explainCount : '')) })]),
            h('div', null, [h('dt', { text: t.navigation === 'locked' ? 'Per question' : 'Clock each' }), h('dd', { text: t.secondsPerQuestion + 's' })]),
            h('div', null, [h('dt', { text: 'About' }), h('dd', { text: t.estMinutes + ' min' })]),
          ]),
          result, due,
          h('div', { class: 'foot' }, [
            h('span', { class: 'small muted', text: 'Attempts ' + t.attemptsUsed + ' of ' + t.attemptsAllowed + (t.extraPct ? ' · +' + t.extraPct + '% time' : '') }),
            h('span', { class: 'foot-acts' }, [viewBtn,
              viewBtn && !t.canStart ? null : h('button', { class: 'btn primary', type: 'button', disabled: !t.canStart, onclick: function () { viewPre(t); } }, [btnText, t.canStart ? icon('arrowR', 'sm') : null])]),
          ]),
        ]));
      });
      holder.appendChild(grid);
      var prog = h('div'); holder.appendChild(prog);
      api('/api/assess/my-progress').then(function (p) {
        if (!p.topics.length && !p.tests.length) return;
        var card = h('div', { class: 'card pad stack', style: 'margin-top:20px' }, [h('div', { class: 'row' }, [icon('chart'), h('h2', { text: 'Your progress' })]),
          h('p', { class: 'small muted', style: 'margin:0', text: 'From assessments whose results have been shared with you. Lowest topics first, so you know what to revise.' })]);
        if (p.tests.length) card.appendChild(h('div', { class: 'chips' }, p.tests.slice(-6).map(function (t) { return pill(t.title + ': ' + t.pct + '%', t.pct >= 70 ? 'ok' : 'warn'); })));
        p.topics.forEach(function (t) {
          card.appendChild(h('div', { class: 'topicbar' }, [h('span', { class: 'tn', text: t.tag }), h('div', { class: 'b', role: 'img', 'aria-label': t.tag + ' ' + t.pct + ' percent' }, [h('i', { class: t.pct >= 75 ? 'ok' : t.pct >= 50 ? 'warn' : 'bad', style: 'width:' + Math.max(3, t.pct) + '%' })]), h('span', { class: 'num small', text: t.pct + '% of ' + t.n })]));
        });
        prog.appendChild(card);
      }).catch(function () {});
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }

  // ── Taker: my released result ────────────────────────────────────────
  function viewMyResult(attemptId) {
    clear(main); window.scrollTo(0, 0);
    main.appendChild(h('button', { class: 'crumb', type: 'button', onclick: function () { route(); } }, [icon('arrowL', 'sm'), 'My assessments']));
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    api('/api/assess/my-results/' + attemptId).then(function (j) {
      var r = j.result; clear(holder);
      holder.appendChild(pageHead(r.testTitle, 'Submitted ' + fmtWhen(r.finishedAt)));
      holder.appendChild(h('dl', { class: 'stats' }, [
        h('div', { class: 'card stat' }, [h('dt', { text: 'Score' }), h('dd', null, [r.score + ' / ' + r.maxScore, h('small', { text: '  ' + r.pct + '%' })])]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Result' }), h('dd', null, [r.pct >= r.passPct ? pill('Pass', 'ok') : pill('Below the ' + r.passPct + '% pass mark', 'bad')])]),
      ]));
      if (!r.items) { holder.appendChild(h('p', { class: 'muted', text: 'Your reviewer has shared your score. Ask them if you would like to go through the answers.' })); return; }
      r.items.forEach(function (it, i) {
        if (it.kind === 'explain') {
          holder.appendChild(h('div', { class: 'card item' }, [h('div', { class: 'hd' }, [h('b', { text: 'Written answer' }), it.mark == null ? pill('Not marked yet') : pill(it.mark >= 1 ? 'Strong' : it.mark > 0 ? 'Partial' : 'Weak', it.mark >= 1 ? 'ok' : it.mark > 0 ? 'warn' : 'bad')]),
            it.about ? h('div', { class: 'about small', text: it.about }) : null, h('div', { class: 'q', style: 'white-space:pre-wrap;font-weight:400', text: it.text || '(not answered)' })]));
          return;
        }
        var ans = h('div', { class: 'ans' });
        (it.chosen && it.chosen.length ? it.chosen : ['No answer']).forEach(function (c) { var ok = it.correctAnswer.indexOf(c) >= 0; ans.appendChild(h('div', { class: ok ? 'right' : 'wrong' }, [icon(ok ? 'check' : 'x', 'sm'), h('span', null, [h('span', { class: 'muted', text: 'Your answer: ' }), c])])); });
        if (!it.correct) it.correctAnswer.forEach(function (c) { if (!(it.chosen || []).includes(c)) ans.appendChild(h('div', { class: 'right' }, [icon('check', 'sm'), h('span', null, [h('span', { class: 'muted', text: 'Correct answer: ' }), c])])); });
        holder.appendChild(h('div', { class: 'card item' }, [h('div', { class: 'hd' }, [h('b', { text: 'Q' + (i + 1) }), it.correct ? pill('Correct', 'ok') : pill(it.late ? 'Timed out' : 'Wrong', 'bad')]), h('div', { class: 'q', text: it.prompt }), ans,
          it.explanation ? h('p', { class: 'small muted', style: 'margin:10px 0 0', text: 'Why: ' + it.explanation }) : null]));
      });
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }

  // ── Taker: three-step start ──────────────────────────────────────────
  var cam = { stream: null, ok: false };
  function stopCamera() { if (cam.stream) cam.stream.getTracks().forEach(function (tr) { tr.stop(); }); cam.stream = null; cam.ok = false; }
  function viewPre(t) {
    clear(main); window.scrollTo(0, 0);
    var step = 1, demo = null, camChecked = !t.camera;
    var wrap = h('div', { class: 'pre' });
    main.appendChild(wrap);
    function steps() {
      var names = ['Overview', 'Setup check', 'Start'];
      return h('ol', { class: 'steps', 'aria-label': 'Steps' }, names.map(function (n, i) {
        return h('li', { class: i + 1 === step ? 'on' : (i + 1 < step ? 'done' : ''), 'aria-current': i + 1 === step ? 'step' : null }, [h('span', { text: n })]);
      }));
    }
    function render() {
      if (demo) { demo.stop(); demo = null; }
      clear(wrap);
      wrap.appendChild(h('button', { class: 'crumb', type: 'button', onclick: function () { stopCamera(); route(); } }, [icon('arrowL', 'sm'), 'My assessments']));
      wrap.appendChild(h('div', { class: 'ph', style: 'margin-bottom:16px' }, [h('div', null, [h('h1', { text: t.title }), t.inProgress ? h('p', { text: 'You have an attempt in progress. The timer on your current question kept running while you were away.' + (t.autoSubmitAt ? ' Finish it before ' + fmtWhen(t.autoSubmitAt) + ', when it is submitted automatically.' : '') }) : null])]));
      wrap.appendChild(steps());
      var card = h('div', { class: 'card' });
      wrap.appendChild(card);
      if (step === 1) stepOverview(card);
      else if (step === 2) stepCheck(card);
      else stepAgree(card);
    }
    function prepCard(card) {
      var pr = t.prep || { summary: '', topics: [] };
      if (!(t.modules && t.modules.length) && !pr.summary && !(pr.topics && pr.topics.length)) return;
      var box = h('div', { class: 'covers' });
      box.appendChild(h('div', { class: 'covers-h' }, [h('span', { class: 'ic-round' }, [icon('layers', 'sm')]), h('h2', { text: 'What this covers' })]));
      if (t.modules && t.modules.length) box.appendChild(modChips(t.modules));
      if (pr.summary) box.appendChild(h('p', { class: 'lead', text: pr.summary }));
      if (pr.topics && pr.topics.length) {
        var grid = h('div', { class: 'ctopics' });
        pr.topics.forEach(function (tp, i) {
          grid.appendChild(h('div', { class: 'ctopic', style: '--i:' + i }, [h('b', { text: tp.title }), tp.points && tp.points.length ? h('ul', null, tp.points.map(function (x) { return h('li', { text: x }); })) : null]));
        });
        box.appendChild(grid);
      }
      box.appendChild(h('p', { class: 'small muted', text: 'Use this to revise before you start. It lists topics only, not the questions.' }));
      card.appendChild(box);
    }
    function stepOverview(card) {
      prepCard(card);
      card.appendChild(h('h2', { text: 'What to expect' }));
      card.appendChild(h('p', { class: 'lead', text: t.questions + ' questions' + (t.explainCount ? ' and ' + t.explainCount + ' written answer' + (t.explainCount > 1 ? 's' : '') : '') + ', about ' + t.estMinutes + ' minutes in total.' }));
      var modeRule = t.displayMode === 'audio' ? ['headphones', 'Questions are read aloud', 'Each question plays as audio; only the answer options are on screen. Use headphones. Play it again as often as you need; replays are noted.']
        : t.displayMode === 'full' ? ['eye', 'One question at a time', 'Read the question, pick your answer and submit.']
        : ['eye', 'Questions reveal a few words at a time', 'Each question plays once as short groups of words. Replay it from the start as often as you need; replays are noted.'];
      var bankMode = t.navigation !== 'locked';
      var rules = [
        modeRule,
        bankMode ? ['clock', 'Each question has its own ' + t.secondsPerQuestion + '-second clock', 'The clock only runs while that question is open. When it reaches zero, your answer is saved and that question locks.']
          : ['clock', t.secondsPerQuestion + ' seconds per question', 'When time runs out, whatever you selected is submitted and the next question opens.'],
        bankMode ? ['arrowL', 'Go back and change answers', 'Use Previous, Next or the question numbers at the top. You can reopen any question that still has time left. Flag the ones you want to check again.']
          : ['lock', 'No going back', 'Answers lock when you submit, so take the time you need on each one.'],
        bankMode ? ['list', 'Review before you submit', 'A review screen shows what is answered, flagged or still to do. Nothing is final until you press Submit test.'] : null,
        ['hourglass', 'Finish in one sitting', 'If you close the test, you can resume it, but only for a limited time: about ' + (t.estMinutes + t.abandonGraceMin) + ' minutes from when you start' + (t.closesAt ? ', and never after it closes' : '') + '. After that it is submitted automatically and any unanswered questions count as wrong.'],
        ['expand', 'Stay in full screen', 'The test runs in full screen. Leaving it, switching tabs, or pasting is noted for your reviewer.'],
      ];
      if (t.explainCount) rules.push(['pen', 'Explain in your own words', 'At the end you explain one of your answers. Typing only; pasting is turned off.']);
      if (t.camera) rules.push(['camera', 'Camera and face check', 'Your camera takes a photo every ' + t.snapshotSec + ' seconds, and checks on your own device that your face is in view and that no one else is. Only the assessment owner can see the photos, and they are deleted automatically.']);
      card.appendChild(h('ul', { class: 'rules stagger' }, rules.filter(Boolean).map(function (r) { return h('li', null, [h('span', { class: 'ic' }, [icon(r[0])]), h('div', null, [h('b', { text: r[1] }), h('span', { text: r[2] })])]); })));
      if (t.displayMode === 'fade') {
        var box = h('div', { class: 'demo' });
        var play = h('button', { class: 'btn sm', type: 'button' }, [icon('replay', 'sm'), 'Try the reading style']);
        box.appendChild(h('div', { class: 'row', style: 'margin-bottom:12px' }, [h('b', { text: 'Practice' }), h('span', { class: 'small muted', text: 'Not scored. See how questions appear before you start.' }), h('span', { class: 'spacer' }), play]));
        var host = h('div'); box.appendChild(host);
        card.appendChild(box);
        play.addEventListener('click', function () {
          clear(host);
          demo = new Reader(host, 'A caller says their front desk phones stopped ringing this morning. Which team owns this, and what do you check first?', { wordsPerChunk: 4, chunkMs: 1000 });
          demo.play();
        });
      }
      card.appendChild(h('div', { class: 'pre-foot' }, [h('span', { class: 'spacer' }), h('button', { class: 'btn primary lg', type: 'button', onclick: function () { step = 2; render(); } }, ['Continue', icon('arrowR', 'sm')])]));
    }
    function stepCheck(card) {
      card.appendChild(h('h2', { text: 'Check your setup' }));
      card.appendChild(h('p', { class: 'lead', text: 'A quick check so nothing interrupts you once the timer starts.' }));
      var list = h('ul', { class: 'checks' }); card.appendChild(list);
      var cont = h('button', { class: 'btn primary lg', type: 'button', disabled: true, onclick: function () { camChecked = true; step = 3; render(); } }, ['Continue', icon('arrowR', 'sm')]);
      var need = { fs: false, cam: !t.camera };
      function row(ic, title, sub) {
        var st = h('span', { class: 'st' }, [icon(ic, 'sm')]), s = h('span', { text: sub }), extra = h('div');
        var li = h('li', null, [st, h('div', { class: 'tx' }, [h('b', { text: title }), s]), extra]);
        list.appendChild(li);
        return { set: function (cls, text, ico) { st.className = 'st ' + cls; clear(st); st.appendChild(icon(ico || (cls === 'ok' ? 'check' : 'warn'), 'sm')); if (text) s.textContent = text; }, extra: extra };
      }
      function sync() { cont.disabled = !(need.fs && need.cam && need.hp !== false); }
      var fs = row('expand', 'Full screen', 'Checking…');
      if (document.fullscreenEnabled) { fs.set('ok', 'Supported in this browser.'); need.fs = true; } else fs.set('bad', 'This browser cannot go full screen. Use Chrome or Edge on a computer.');
      var sc = row('screen', 'One screen', 'Checking…');
      if (window.screen && window.screen.isExtended) sc.set('warn', 'A second screen is connected. Please disconnect it; this is noted for your reviewer.');
      else sc.set('ok', 'No second screen detected.');
      var net = row('wifi', 'Connection', 'Checking…');
      var t0 = performance.now();
      fetch('/api/assess/me', { credentials: 'same-origin' }).then(function () {
        var ms = Math.round(performance.now() - t0);
        if (ms < 1500) net.set('ok', 'Good (' + ms + ' ms).'); else net.set('warn', 'Slow (' + ms + ' ms). Answers are saved on each submit, but a stable connection helps.');
      }).catch(function () { net.set('bad', 'You look offline. Reconnect before you start.'); });
      if (t.displayMode === 'audio') {
        need.hp = false;
        var hp = row('headphones', 'Headphones', 'Questions are read aloud. Put your headphones on and play the test sound: one beep in the left ear, then one in the right.');
        var hpBtn = h('button', { class: 'btn sm', type: 'button' }, [icon('volume', 'sm'), 'Play test sound']);
        var hpOk = h('input', { type: 'checkbox', id: 'hp-ok', disabled: true });
        hp.extra.appendChild(h('div', { class: 'stack', style: 'gap:8px;align-items:flex-end' }, [hpBtn, h('label', { class: 'chk small', for: 'hp-ok' }, [hpOk, 'I heard both, on headphones'])]));
        hpBtn.addEventListener('click', function () { hpBtn.disabled = true; beepTest(function () { hpBtn.disabled = false; hpOk.disabled = false; }); });
        hpOk.addEventListener('change', function () { need.hp = hpOk.checked; if (hpOk.checked) hp.set('ok', 'Headphones confirmed.'); sync(); });
      }
      if (t.camera) {
        var cr = row('camera', 'Camera and face check', 'Required for this assessment. Allow the camera, sit facing the screen with your face in the frame, and make sure no one else is in view. A photo is taken every ' + t.snapshotSec + ' seconds; only the assessment owner can see them. You cannot start until this check passes.');
        var btn = h('button', { class: 'btn sm primary', type: 'button', text: 'Allow camera' });
        cr.extra.appendChild(btn);
        var faceLoop = null, okRuns = 0;
        function showPreview() {
          clear(cr.extra); clearInterval(faceLoop);
          var v = h('video', { class: 'cam-preview', autoplay: true, muted: true, playsinline: true });
          v.srcObject = cam.stream;
          var pl = v.play && v.play(); if (pl && pl.catch) pl.catch(function () {});
          var frame = h('div', { class: 'cam-frame big' }, [v, h('span', { class: 'cam-ring' })]);
          var marks = {};
          function mark(k, label) { var st = h('span', { class: 'cm pend' }, [icon('clock', 'sm')]); marks[k] = st; return h('div', { class: 'cmi' }, [st, h('span', { text: label })]); }
          var list2 = h('div', { class: 'cam-checks' }, [mark('face', 'Your face is in view'), mark('one', 'Only one person in view'), mark('light', 'Camera is uncovered and lit')]);
          function setMark(k, state) { var st = marks[k]; st.className = 'cm ' + state; clear(st); st.appendChild(icon(state === 'ok' ? 'check' : (state === 'bad' ? 'x' : 'clock'), 'sm')); }
          var retry = h('button', { class: 'btn sm', type: 'button', style: 'display:none', text: 'Try the face check again' });
          cr.extra.appendChild(h('div', { class: 'cam-gate' }, [frame, h('div', { class: 'stack', style: 'gap:10px;min-width:0' }, [list2, retry])]));
          need.cam = false; sync();
          cr.set('warn', 'Loading the face check…', 'camera');
          function pass(r) {
            frame.className = 'cam-frame big ' + r.status;
            setMark('light', r.status === 'dark' ? 'bad' : 'ok');
            setMark('face', r.status === 'ok' || r.status === 'multi' ? 'ok' : (r.status === 'dark' ? 'pend' : 'bad'));
            setMark('one', r.status === 'ok' ? 'ok' : (r.status === 'multi' ? 'bad' : 'pend'));
          }
          function loop() {
            retry.style.display = 'none';
            cr.set('warn', 'Looking for your face… Sit facing the screen with light on your face.', 'camera');
            clearInterval(faceLoop); okRuns = 0;
            faceLoop = setInterval(function () {
              if (!document.body.contains(v)) { clearInterval(faceLoop); return; }
              var r = FaceWatch.check(v); if (!r || r.status === 'unknown') return;
              pass(r);
              if (r.status === 'ok') {
                okRuns++;
                if (okRuns >= 3 && !need.cam) { cr.set('ok', 'Face check passed. Keep your face in view during the test. If the camera rules are broken for more than 10 seconds, the test stops and your reviewer must send you a retest.'); need.cam = true; sync(); }
              } else {
                okRuns = 0;
                if (need.cam) { need.cam = false; sync(); }
                if (r.status === 'dark') cr.set('bad', 'The camera looks covered or too dark. Uncover it or add some light.', 'camera');
                else if (r.status === 'multi') cr.set('warn', 'More than one face is in view. Only you should be at the screen.', 'camera');
                else cr.set('warn', 'We cannot see your face yet. Move so your face is in the frame.', 'camera');
              }
            }, 500);
          }
          function loadDetector() {
            cr.set('warn', 'Loading the face check…', 'camera');
            FaceWatch.load().then(loop).catch(function () {
              cr.set('bad', 'The face check could not start on this device or network, so you cannot begin this assessment. Try again, or use the latest Chrome or Edge on a computer. If it keeps failing, tell your reviewer.', 'camera');
              retry.style.display = ''; retry.onclick = loadDetector;
            });
          }
          loadDetector();
        }
        if (cam.ok && cam.stream) showPreview();
        btn.addEventListener('click', function () {
          btn.disabled = true;
          navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false }).then(function (st) {
            cam.stream = st; cam.ok = true; showPreview();
          }).catch(function () { btn.disabled = false; cr.set('bad', 'The camera is blocked or missing, so you cannot start. Allow it in the browser address bar (the camera icon), then press Allow camera again.'); });
        });
      }
      sync();
      card.appendChild(h('div', { class: 'pre-foot' }, [h('button', { class: 'btn ghost', type: 'button', onclick: function () { step = 1; render(); } }, [icon('arrowL', 'sm'), 'Back']), h('span', { class: 'spacer' }), cont]));
    }
    function stepAgree(card) {
      card.appendChild(h('h2', { text: 'Ready when you are' }));
      card.appendChild(h('p', { class: 'lead', text: 'The timer starts as soon as the first question opens.' }));
      var priv = h('div', { class: 'privacy' }, [
        h('b', { text: 'What is recorded' }),
        h('p', { style: 'margin:6px 0 0', text: 'Your answers and how long each one took, and a log of events such as leaving full screen, switching tabs, copy and paste attempts, and Print Screen.' + (t.camera ? ' A camera photo every ' + t.snapshotSec + ' seconds.' : '') }),
        h('p', { style: 'margin:6px 0 0', text: 'Your screen is not recorded' + (t.camera ? ', and there is no video or audio recording.' : ', and your camera and microphone are not used.') + ' Only reviewers can see your answers and activity' + (t.camera ? ', and only the assessment owner can see camera photos.' : '.') }),
      ]);
      card.appendChild(priv);
      var c1 = h('input', { type: 'checkbox', id: 'ag1' }), c2 = h('input', { type: 'checkbox', id: 'ag2' });
      card.appendChild(h('label', { class: 'agree', for: 'ag1' }, [c1, h('span', { text: 'I will answer on my own, without help from other people, notes, search engines or AI tools.' })]));
      card.appendChild(h('label', { class: 'agree', for: 'ag2' }, [c2, h('span', { text: 'I understand what is recorded, that my reviewer may ask me to explain some answers, and that if I leave the test unfinished it is submitted automatically with unanswered questions counted as wrong.' })]));
      var err = h('div');
      card.appendChild(err);
      var start = h('button', { class: 'btn primary lg', type: 'button', disabled: true }, [t.inProgress ? 'Resume in full screen' : 'Start in full screen', icon('arrowR', 'sm')]);
      function sync() { start.disabled = !(c1.checked && c2.checked); }
      c1.addEventListener('change', sync); c2.addEventListener('change', sync);
      start.addEventListener('click', function () {
        start.disabled = true; clear(err);
        var fsP = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen().catch(function () {}) : Promise.resolve();
        fsP.then(function () { return api('/api/assess/tests/' + t.id + '/start', { method: 'POST', body: { cameraChecked: camChecked } }); })
          .then(function (j) { runExam(j, t); })
          .catch(function (e) { err.appendChild(errBox(e.message)); start.disabled = false; if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); });
      });
      card.appendChild(h('div', { class: 'pre-foot' }, [h('button', { class: 'btn ghost', type: 'button', onclick: function () { step = 2; render(); } }, [icon('arrowL', 'sm'), 'Back']), h('span', { class: 'spacer' }), start]));
    }
    render();
  }

  // ── Watermark (optional, very faint) ─────────────────────────────────
  var wm = { timer: null, on: false };
  function drawWatermark() {
    var c = document.getElementById('as-wm');
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    var stamp = me.email + '  ' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
    ctx.fillStyle = cssVar('--wm'); ctx.font = '500 13px Poppins, sans-serif';
    ctx.translate(innerWidth / 2, innerHeight / 2); ctx.rotate(-0.35);
    var w = ctx.measureText(stamp).width + 260, step = 190, span = Math.hypot(innerWidth, innerHeight);
    for (var y = -span; y < span; y += step) { var off = (Math.round(y / step) % 2) * (w / 2); for (var x = -span - off; x < span; x += w) ctx.fillText(stamp, x, y); }
  }
  function startWatermark() { wm.on = true; document.getElementById('as-wm').classList.add('on'); drawWatermark(); clearInterval(wm.timer); wm.timer = setInterval(drawWatermark, 60000); window.addEventListener('resize', drawWatermark); }
  function stopWatermark() { wm.on = false; document.getElementById('as-wm').classList.remove('on'); clearInterval(wm.timer); window.removeEventListener('resize', drawWatermark); }

  // ── Face check (Session 62) ──────────────────────────────────────────
  // Runs on the agent's own device with MediaPipe's BlazeFace model: no
  // video leaves the browser. It answers three questions about each frame:
  // is there a face, is there more than one, is the camera covered or dark.
  var MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/';
  var FaceWatch = (function () {
    var st = { det: null, loading: null, failed: false };
    var probe = document.createElement('canvas'); probe.width = 32; probe.height = 24;
    function load() {
      if (st.loading) return st.loading;
      function via(base) {
        return import(base + 'vision_bundle.mjs').then(function (v) {
          return v.FilesetResolver.forVisionTasks(base + 'wasm').then(function (fs) {
            return v.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: '/vendor/face/blaze_face_short_range.tflite' }, runningMode: 'VIDEO', minDetectionConfidence: 0.65 });
          });
        });
      }
      // Our own server first, the public CDN as a backup
      st.loading = via('/vendor/mediapipe/').catch(function () { return via(MP_CDN); })
        .then(function (d) { st.det = d; return d; }).catch(function (e) { st.failed = true; st.err = e && e.message; st.loading = null; try { console.warn('Face check unavailable:', e && e.message); } catch (x) {} throw e; });
      return st.loading;
    }
    function brightness(video) {
      try {
        var c = probe.getContext('2d', { willReadFrequently: true });
        c.drawImage(video, 0, 0, 32, 24);
        var d = c.getImageData(0, 0, 32, 24).data, sum = 0;
        for (var i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        return sum / (d.length / 4);
      } catch (e) { return null; }
    }
    var lastTs = 0;
    function check(video) {
      if (!video || video.readyState < 2 || !video.videoWidth) return null;
      var lum = brightness(video);
      if (lum != null && lum < 14) return { status: 'dark', faces: 0 };
      if (!st.det) return { status: 'unknown', faces: null };
      var ts = Math.max(performance.now(), lastTs + 1); lastTs = ts;
      try { var n = st.det.detectForVideo(video, ts).detections.length; return { status: n === 0 ? 'none' : (n > 1 ? 'multi' : 'ok'), faces: n }; }
      catch (e) { return { status: 'unknown', faces: null }; }
    }
    return { load: load, check: check, ready: function () { return !!st.det; }, failed: function () { return st.failed; } };
  })();
  var FACE_TEXT = { ok: 'Face in view', none: 'We cannot see you', multi: 'More than one face', dark: 'Camera covered', unknown: 'Camera on' };

  function stoppedScreen(reason) {
    main.appendChild(h('div', { class: 'card gate' }, [art('denied', 190),
      h('h1', { text: 'Your test was stopped' }),
      h('p', { text: 'The camera rules were not followed: ' + String(reason || 'your face was not in view').replace(/\.$/, '') + '.' }),
      h('p', { class: 'muted small', text: 'Your answers so far are kept as a draft and are not scored. Your reviewer can see what happened and can send you a retest. Before you try again, sit facing the screen in good light, on your own, with the camera uncovered.' }),
      h('button', { class: 'btn primary', type: 'button', text: 'Back to my assessments', onclick: function () { go(''); } })]));
  }
  // ── Exam runner ──────────────────────────────────────────────────────
  var previewBack = '';
  function runExam(start, test) {
    var token = start.token, attemptId = start.attemptId, s = start.settings;
    var evQueue = [], curIdx = null, tick = 0, reader = null, busy = false, ended = false, snapTimer = null, faceTimer = null, qState = null, prevIdx = -1;
    document.body.classList.add('as-exam');
    if (s.watermark === 'subtle') startWatermark();
    clear(main);
    var exam = h('div', { class: 'exam' });
    main.appendChild(exam);
    if (s.preview) main.appendChild(h('div', { class: 'previewbar' }, [pill('Preview', 'accent'), h('span', { class: 'small', text: 'Nothing here is saved or scored for anyone.' }),
      h('button', { class: 'btn sm', type: 'button', text: 'Exit preview', onclick: function () { exitTo(function () { go(previewBack); }); } })]));

    function ev(type, detail) { evQueue.push({ type: type, idx: curIdx, detail: detail || '' }); if (evQueue.length >= 20) flush(); }
    function flush() {
      if (!evQueue.length) return;
      var batch = evQueue.splice(0, 50);
      api('/api/assess/attempts/' + attemptId + '/events', { method: 'POST', token: token, body: { events: batch } }).catch(function () {});
    }
    var flushTimer = setInterval(flush, 4000);
    // Watch the connection: while the site is down the question clock is paused here, and the server adds the downtime back on its side.
    var lastPaintT = Date.now(), beatBusy = false;
    var netTimer = setInterval(function () {
      if (ended || beatBusy) return;
      beatBusy = true;
      fetch('/healthz', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.status < 500; }, function () { return false; })
        .then(function (ok) { beatBusy = false; if (ended) return; netDown = !ok; reconnectBar(!ok); });
    }, 3000);

    // Camera snapshots and the on-device face check
    var snapCanvas = document.createElement('canvas'); snapCanvas.width = 320; snapCanvas.height = 240;
    var camVideo = null, lastFaces = null;
    var face = { status: 'unknown', since: Date.now(), episode: null };
    var faceChip = null, faceBanner = null, faceCount = null, stopping = false, strikes = 0;
    function snap() {
      if (!camVideo || !cam.stream) return;
      try {
        snapCanvas.getContext('2d').drawImage(camVideo, 0, 0, 320, 240);
        var data = snapCanvas.toDataURL('image/jpeg', 0.6);
        api('/api/assess/attempts/' + attemptId + '/snapshot', { method: 'POST', token: token, body: { idx: curIdx, image: data, faces: lastFaces } }).catch(function () {});
      } catch (e) {}
    }
    function paintFace() {
      if (faceChip) { faceChip.className = 'facechip ' + face.status; faceChip.lastChild.textContent = FACE_TEXT[face.status] || 'Camera on'; }
    }
    function showFaceBanner(kind) {
      hideFaceBanner();
      var msg = kind === 'multi' ? 'More than one face is in view. Only you should be at the screen.'
        : kind === 'dark' ? 'Your camera looks covered or too dark. Uncover it or turn on a light.'
        : 'We cannot see your face. Sit facing the screen with your face in view.';
      faceCount = h('b', { text: '' });
      faceBanner = h('div', { class: 'facebar ' + kind, role: 'alert' }, [icon('camera', 'sm'), h('span', null, [msg + ' Fix it within ', faceCount, ' or the test will end.'])]);
      exam.insertBefore(faceBanner, exam.children[1] || null);
    }
    function hideFaceBanner() { if (faceBanner) { faceBanner.remove(); faceBanner = null; } }
    var WARN_MS = 3000, STOP_MS = 10000;
    function stopExam(reason) {
      if (stopping || ended) return;
      stopping = true; hideFaceBanner();
      flush();
      setTimeout(function () {
        api('/api/assess/attempts/' + attemptId + '/stop', { method: 'POST', token: token, body: { reason: reason } }).catch(function () {}).then(function () { exitTo(function () { stoppedScreen(reason); }); });
      }, 400);
    }
    var FACE_REASON = { none: 'your face was not in view for 10 seconds', multi: 'a second person was in view for 10 seconds', dark: 'the camera was covered or too dark for 10 seconds' };
    function faceEv(status, faces) { ev(status === 'none' ? 'face_missing' : (status === 'multi' ? 'face_multi' : 'camera_dark'), status === 'multi' ? faces + ' faces' : ''); }
    function faceTick() {
      if (stopping || ended) return;
      var r = FaceWatch.check(camVideo); if (!r) return;
      lastFaces = r.faces;
      if (r.status === 'unknown') return;
      var now = Date.now();
      if (r.status !== face.status) { face.status = r.status; face.since = now; paintFace(); }
      var bad = r.status === 'none' || r.status === 'multi' || r.status === 'dark';
      if (!bad) {
        face.badSince = 0;
        if (face.episode) { ev('face_back', 'after ' + Math.round((now - face.episode.at) / 1000) + 's'); face.episode = null; hideFaceBanner(); }
        return;
      }
      if (!face.badSince) face.badSince = now;
      var ms = now - face.badSince;
      if (ms >= WARN_MS && !face.episode) {
        face.episode = { type: r.status, at: face.badSince };
        strikes++; faceEv(r.status, r.faces);
        if (strikes >= 3) { stopExam('the camera rules were broken three times'); return; }
        showFaceBanner(r.status);
      } else if (face.episode && face.episode.type !== r.status) {
        face.episode.type = r.status; faceEv(r.status, r.faces); showFaceBanner(r.status);
      }
      if (faceCount) faceCount.textContent = Math.max(0, Math.ceil((STOP_MS - ms) / 1000)) + ' seconds';
      if (ms >= STOP_MS) stopExam(FACE_REASON[r.status] || 'the camera rules were not followed');
    }
    function startCamera() {
      if (!s.camera) return Promise.resolve();
      var p = cam.stream ? Promise.resolve(cam.stream) : navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      return p.then(function (st) {
        cam.stream = st; cam.ok = true;
        camVideo = h('video', { autoplay: true, muted: true, playsinline: true }); camVideo.srcObject = st;
        var pl = camVideo.play && camVideo.play(); if (pl && pl.catch) pl.catch(function () {});
        st.getVideoTracks().forEach(function (tr) { tr.addEventListener('ended', function () { if (ended || stopping) return; ev('camera_off', 'Camera track ended'); stopExam('the camera was turned off or unplugged'); }); });
        ev('camera_on');
        setTimeout(snap, 1500);
        snapTimer = setInterval(snap, s.snapshotSec * 1000);
        return FaceWatch.load().then(function () { faceTimer = setInterval(faceTick, 500); }).catch(function () {
          ev('face_check_off', 'The face check could not load on this device');
          stopExam('the face check could not run on this device');
        });
      }).catch(function () { ev('camera_denied'); stopExam('the camera was not available'); });
    }

    // Guards: best-effort blocking, always logged
    function block(type) { return function (e) { e.preventDefault(); ev(type); }; }
    var onCopy = block('copy'), onCut = block('cut'), onCtx = block('contextmenu'), onDrag = function (e) { e.preventDefault(); };
    var onPaste = function (e) { e.preventDefault(); ev('paste'); toast('Pasting is turned off during the test.'); };
    function onKey(e) {
      var k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen') ev('printscreen');
      if (k === 'f12' || (mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) || (mod && e.altKey && (k === 'i' || k === 'j')) || (mod && k === 'u')) { e.preventDefault(); ev('devtools_key', e.key); }
      if (mod && k === 'p') { e.preventDefault(); ev('print'); }
      if (mod && (k === 'c' || k === 'x') && !e.shiftKey) { e.preventDefault(); ev('copy', 'keyboard'); }
      if (mod && k === 'v') { e.preventDefault(); ev('paste', 'keyboard'); toast('Pasting is turned off during the test.'); }
      if (mod && k === 'a' && !(e.target && e.target.tagName === 'TEXTAREA')) e.preventDefault();
      var tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!qState) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && qState.choose && n <= qState.nOpts) { qState.choose(n - 1); e.preventDefault(); }
      else if (e.key === 'Enter' && qState.canSubmit()) { e.preventDefault(); qState.submit(false); }
      else if (qState.bank && e.key === 'ArrowRight' && !mod) { e.preventDefault(); qState.next(); }
      else if (qState.bank && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); qState.prev(); }
    }
    function onVis() { ev(document.hidden ? 'hidden' : 'visible'); }
    function onBlur() { ev('blur'); }
    var lastOut = 0;
    function onMouseOut(e) { if (!e.relatedTarget && Date.now() - lastOut > 4000) { lastOut = Date.now(); ev('mouse_out'); } }
    function onFs() { if (ended) return; if (!document.fullscreenElement) { ev('fullscreen_exit'); if (s.preview) showShield(); else lockNow('Left full screen'); } else { ev('fullscreen_enter'); hideShield(); } }
    function onPop() { history.pushState(null, '', location.href); toast('Use the buttons in the test to move between questions.'); }
    function onUnload() { try { if (evQueue.length) navigator.sendBeacon('/api/assess/attempts/' + attemptId + '/events', new Blob([JSON.stringify({ events: evQueue, token: token })], { type: 'application/json' })); } catch (e) {} }
    function onBefore(e) { if (!ended) { e.preventDefault(); e.returnValue = ''; } }
    var resizeT = 0;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { if (qState && qState.redraw) qState.redraw(); }, 150); }
    document.addEventListener('copy', onCopy); document.addEventListener('cut', onCut); document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onCtx); document.addEventListener('dragstart', onDrag); document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBlur); document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('popstate', onPop); window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onBefore); window.addEventListener('resize', onResize);
    history.pushState(null, '', location.href);
    if (window.screen && window.screen.isExtended) ev('multi_screen', 'Second screen connected at start');

    // Full screen lock: leaving full screen stops the test. It stays locked until an owner or admin unlocks it, then they continue from the same question.
    var lockEl = null, lockTimer = 0, lockSent = false;
    function sendLock(reason) {
      api('/api/assess/attempts/' + attemptId + '/lock', { method: 'POST', token: token, body: { reason: reason, token: token }, patient: true }).then(function () { lockSent = true; }).catch(function () {});
    }
    function lockNow(reason) { lockSent = false; sendLock(reason); showLocked(); }
    function showLocked() {
      if (lockEl) return;
      clearInterval(tick); if (reader) reader.stop(); hideShield();
      var status = h('p', { class: 'small muted', role: 'status', 'aria-live': 'polite', text: 'Waiting for your team lead to unlock it. You can leave this page open.' });
      var go2 = h('button', { class: 'btn primary lg', type: 'button', text: 'Back to full screen and continue', style: 'display:none' });
      lockEl = h('div', { class: 'shield lockshield', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'lk-t' }, [h('div', null, [
        h('div', { class: 'shield-ic' }, [icon('shield', 'lg')]),
        h('h2', { id: 'lk-t', text: 'Your assessment is locked' }),
        h('p', { text: 'You left full screen, so the test stopped. Your answers are safe and your timer is paused. Your team lead has been told.' }),
        h('p', { class: 'small muted', text: 'Once it is unlocked you carry on from the same question with the same time left.' }),
        status, go2])]);
      document.body.appendChild(lockEl);
      go2.addEventListener('click', function () {
        var rq = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : Promise.resolve();
        Promise.resolve(rq).catch(function () {}).then(function () { hideLocked(); load(); });
      });
      function poll() {
        if (ended) return;
        if (!lockSent) sendLock('Left full screen');
        api('/api/assess/attempts/' + attemptId + '/lock-state', { token: token }).then(function (r) {
          if (r && r.locked === false && lockSent) { clearInterval(lockTimer); status.textContent = 'Unlocked. Return to full screen to carry on.'; go2.style.display = ''; go2.focus(); }
        }).catch(function (e) { if (e && (e.code === 'finished' || e.code === 'elsewhere')) { clearInterval(lockTimer); hideLocked(); fail(e); } });
      }
      clearInterval(lockTimer); lockTimer = setInterval(poll, 4000);
    }
    function hideLocked() { clearInterval(lockTimer); if (lockEl) { lockEl.remove(); lockEl = null; } }
    var shield = null;
    function showShield() {
      if (shield) return;
      shield = h('div', { class: 'shield', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'sh-t' }, [h('div', null, [
        h('div', { class: 'shield-ic' }, [icon('expand', 'lg')]),
        h('h2', { id: 'sh-t', text: 'Return to full screen' }),
        h('p', { text: 'Your timer is still running. Leaving full screen has been noted.' }),
        h('button', { class: 'btn primary lg', type: 'button', text: 'Back to the test', onclick: function () { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } }),
      ])]);
      document.body.appendChild(shield);
      shield.querySelector('button').focus();
    }
    function hideShield() { if (shield) { shield.remove(); shield = null; } }

    function teardown() {
      ended = true; clearInterval(flushTimer); clearInterval(netTimer); netDown = false; reconnectBar(false); clearInterval(tick); clearInterval(snapTimer); clearInterval(faceTimer); clearTimeout(saveT); flush(); stopWatermark(); hideShield(); hideLocked();
      if (reader) reader.stop();
      stopCamera(); qState = null;
      document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCut); document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onCtx); document.removeEventListener('dragstart', onDrag); document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur); document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('popstate', onPop); window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onBefore); window.removeEventListener('resize', onResize);
      document.body.classList.remove('as-exam');
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    }
    function exitTo(fn) { teardown(); clear(main); renderNav(''); fn(); }
    function fail(e) {
      if (e && e.code === 'locked') { lockSent = true; showLocked(); return; }
      if (e && (e.code === 'moved' || e.code === 'out')) { if (e.code === 'out') toast(e.message); load(); return; }
      if (e && e.code === 'finished') { exitTo(function () { doneScreen({ hidden: true }); }); return; }
      exitTo(function () {
        main.appendChild(h('div', { class: 'card gate' }, [h('div', { class: 'ic' }, [icon('warn', 'lg')]), h('h1', { text: e && e.code === 'elsewhere' ? 'Open in another tab' : 'Something went wrong' }), h('p', { text: e && e.message }),
          h('button', { class: 'btn primary', type: 'button', text: 'Back to my assessments', onclick: function () { go(''); } })]));
      });
    }
    function load() {
      clearInterval(tick); if (reader) { reader.stop(); reader = null; }
      api('/api/assess/attempts/' + attemptId + '/current', { token: token, patient: true }).then(function (q) {
        if (q.locked) { lockSent = true; showLocked(); return; }
        if (q.done) { exitTo(function () { doneScreen(q.result); }); return; }
        if (q.review) renderReview(q); else renderQuestion(q);
      }).catch(fail);
    }
    function previewDone(r) {
      var card = h('div', { class: 'card donecard', style: 'max-width:820px;text-align:left' });
      card.appendChild(h('div', { class: 'row', style: 'align-items:center' }, [pill('Preview', 'accent'), h('h1', { style: 'margin:0', text: 'Preview finished' })]));
      card.appendChild(h('p', { text: r.score + ' of ' + r.maxScore + ' correct (' + r.pct + '%). ' + (r.passed ? 'That would be a pass.' : 'The pass mark is ' + r.passPct + '%.') + ' Nothing was saved.' }));
      var list = h('div', { class: 'stack', style: 'gap:10px;margin-top:12px' });
      var n = 0;
      (r.key || []).forEach(function (it) {
        if (it.kind === 'explain') { list.appendChild(h('div', { class: 'card pad' }, [h('b', { text: 'Written answer' }), h('p', { class: 'small muted', style: 'margin:4px 0', text: 'About: ' + (it.about || '') }), h('p', { style: 'margin:0', text: it.text || 'No answer' })])); return; }
        n++;
        list.appendChild(h('div', { class: 'card pad' }, [
          h('div', { class: 'row', style: 'align-items:center' }, [h('b', { text: 'Question ' + n }), pill(it.correct ? 'Correct' : 'Not correct', it.correct ? 'ok' : 'bad')]),
          h('p', { style: 'margin:6px 0', text: it.prompt }),
          h('div', { class: 'small' }, [h('span', { class: 'muted', text: 'Chosen: ' }), h('span', { text: it.chosen && it.chosen.length ? it.chosen.join(' | ') : 'No answer' })]),
          h('div', { class: 'small' }, [h('span', { class: 'muted', text: 'Correct: ' }), h('b', { text: (it.correctAnswer || []).join(' | ') })]),
          it.explanation ? h('div', { class: 'small muted', style: 'margin-top:4px', text: it.explanation }) : null]));
      });
      card.appendChild(list);
      card.appendChild(h('div', { class: 'row', style: 'margin-top:16px' }, [h('button', { class: 'btn primary', type: 'button', text: 'Back to the editor', onclick: function () { go(previewBack); } })]));
      main.appendChild(h('div', { class: 'view' }, [card]));
    }
    function doneScreen(r) {
      if (r && r.preview) { previewDone(r); return; }
      var card = h('div', { class: 'card donecard' });
      card.appendChild(r && !r.hidden ? h('div', { class: 'badge pop' }, [icon('check', 'lg')]) : art('pending', 190));
      card.appendChild(h('h1', { text: 'Submitted' }));
      if (r && !r.hidden) {
        var C = 2 * Math.PI * 56, off = C * (1 - r.pct / 100);
        var ring = h('div', { class: 'ring', role: 'img', 'aria-label': r.pct + ' percent' });
        ring.innerHTML = '<svg viewBox="0 0 132 132"><circle class="trk" cx="66" cy="66" r="56"/><circle class="val" cx="66" cy="66" r="56" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>';
        var num = h('b', { text: '0%' }); ring.appendChild(num);
        if (r.passed) ring.classList.add('pass');
        card.appendChild(ring);
        requestAnimationFrame(function () { requestAnimationFrame(function () { ring.querySelector('.val').setAttribute('stroke-dashoffset', off.toFixed(1)); countUp(num, r.pct, '%'); }); });
        card.appendChild(h('p', { text: r.score + ' of ' + r.maxScore + ' correct. ' + (r.passed ? 'That is a pass.' : 'The pass mark is ' + r.passPct + '%.') }));
        card.appendChild(h('p', { class: 'small muted', text: 'Written answers are marked by your reviewer and are not in this score.' }));
      } else {
        card.appendChild(h('p', { class: 'muted', text: 'Thanks. Your answers are saved and your reviewer will share the result with you.' }));
      }
      card.appendChild(h('div', { class: 'row', style: 'justify-content:center;margin-top:18px' }, [h('button', { class: 'btn primary', type: 'button', text: 'Back to my assessments', onclick: function () { go(''); } })]));
      main.appendChild(h('div', { class: 'view' }, [card]));
    }

    // Navigator labels: questions are numbered, written answers are W1, W2
    function navLabels(nav) {
      var qn = 0, wn = 0;
      return nav.map(function (n) { return n.kind === 'explain' ? 'W' + (++wn) : String(++qn); });
    }
    function fmtClock(ms) { var t = Math.max(0, Math.ceil(ms / 1000)); var m = Math.floor(t / 60), x = t % 60; return m ? m + ':' + (x < 10 ? '0' : '') + x : x + 's'; }

    // ── Time bank: saving and moving ─────────────────────────────────
    var saveT = 0;
    function post(body) { return api('/api/assess/attempts/' + attemptId + '/answer', { method: 'POST', token: token, body: body, patient: true }); }

    function renderQuestion(q) {
      curIdx = q.idx; busy = false;
      var bank = !!q.bank;
      var dir = prevIdx < 0 ? 'first' : (q.idx >= prevIdx ? 'next' : 'prev');
      prevIdx = q.idx;
      clear(exam); faceChip = null; faceBanner = null;
      var deadline = Date.now() + q.leftMs, C = 2 * Math.PI * 22, lastAnnounce = null;
      var labels = bank ? navLabels(q.nav) : null;
      var otherLeft = bank ? q.nav.reduce(function (t, n) { return t + (n.idx === q.idx ? 0 : n.leftMs); }, 0) : 0;

      // Top bar
      var center;
      if (bank) {
        center = h('nav', { class: 'qnav', 'aria-label': 'Questions' });
        q.nav.forEach(function (n, i) {
          var cls = 'qn' + (n.idx === q.idx ? ' cur' : '') + (n.answered ? ' ans' : '') + (n.flagged ? ' flg' : '') + (n.out ? ' out' : '') + (n.kind === 'explain' ? ' w' : '');
          var lab = (n.kind === 'explain' ? 'Written answer ' + labels[i].slice(1) : 'Question ' + labels[i]) + (n.answered ? ', answered' : ', not answered') + (n.flagged ? ', flagged' : '') + (n.out ? ', no time left' : ', ' + Math.ceil(n.leftMs / 1000) + ' seconds left');
          center.appendChild(h('button', { type: 'button', class: cls, 'aria-label': lab, title: lab, 'aria-current': n.idx === q.idx ? 'step' : null, disabled: n.out || n.idx === q.idx ? true : null, onclick: function () { move(n.idx); } }, [h('span', { text: labels[i] })]));
        });
        center.appendChild(h('button', { type: 'button', class: 'qn rv', title: 'Review all answers', 'aria-label': 'Review all answers', onclick: function () { move('review'); } }, [icon('list', 'sm')]));
      } else {
        center = h('div', { class: 'segs', 'aria-hidden': 'true' });
        for (var i = 0; i < q.total; i++) center.appendChild(h('i', { class: (i < q.qCount ? '' : 'w ') + (i < q.idx ? 'done' : (i === q.idx ? 'cur' : '')) }));
      }
      var timer = h('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left on this question' });
      timer.innerHTML = '<svg viewBox="0 0 52 52"><circle class="trk" cx="26" cy="26" r="22"/><circle class="val" cx="26" cy="26" r="22" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="0"/></svg>';
      var tNum = h('b'); timer.appendChild(tNum);
      var camEl = null;
      if (s.camera && camVideo) {
        var mini = h('video', { autoplay: true, muted: true, playsinline: true }); mini.srcObject = cam.stream;
        faceChip = h('span', { class: 'facechip ' + face.status }, [h('i'), h('span', { text: FACE_TEXT[face.status] })]);
        camEl = h('div', { class: 'cam-mini', title: 'Camera on' }, [mini, faceChip]);
      }
      var totalEl = bank ? h('span', { class: 'tot' }) : null;
      var qLabel = q.kind === 'explain' ? 'Written answer' : 'Question ' + (bank ? labels[q.idx] : (q.idx + 1)) + ' of ' + q.qCount;
      exam.appendChild(h('div', { class: 'xbar' }, [
        h('div', { class: 'ttl' }, [h('b', { text: start.title }), h('span', null, [qLabel, totalEl ? ' · ' : null, totalEl])]),
        center,
        h('div', { class: 'right' }, [camEl, timer]),
      ]));
      if (face.episode) showFaceBanner(face.episode.type);
      var body = h('div', { class: 'xbody slide-' + dir });
      exam.appendChild(body);
      var card = h('div', { class: 'qcard' });
      body.appendChild(card);

      var selected = [], replays = 0, ta = null, optCanvases = [], flagged = !!q.flagged, afterSelect = function () {};
      var primary = h('button', { class: 'btn primary lg', type: 'button' });

      if (q.kind === 'explain') {
        card.appendChild(h('div', { class: 'qhead' }, [h('span', { class: 'n', text: 'Written answer' }), pill('Your own words', 'accent')]));
        var aboutC = h('canvas', { 'aria-hidden': 'true' });
        if (q.audio) {
          var aHost = h('div', { style: 'margin-bottom:16px' }); card.appendChild(aHost);
          reader = new AudioPrompt(aHost, function () {
            return fetch('/api/assess/attempts/' + attemptId + '/audio', { credentials: 'same-origin', headers: { 'X-Assess-Token': token } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); });
          }, function () { replays++; ev('replay', 'audio ' + replays); });
        } else if (s.plain) card.appendChild(h('div', { class: 'about' }, [h('div', { class: 'small muted', style: 'margin-bottom:6px', text: 'Earlier question' }), h('p', { class: 'plainq', style: 'font-size:15px', text: q.about })]));
        else card.appendChild(h('div', { class: 'about' }, [h('div', { class: 'small muted', style: 'margin-bottom:6px', text: 'Earlier question' }), aboutC]));
        var pc = s.plain ? h('p', { class: 'plainq', style: 'margin:0 0 14px', text: q.prompt }) : h('canvas', { 'aria-hidden': 'true', style: 'margin-bottom:14px' });
        card.appendChild(pc);
        ta = h('textarea', { class: 'writebox', 'aria-label': 'Your explanation', maxlength: '4000', spellcheck: 'true', placeholder: 'Aim for 2 to 4 sentences.' });
        var count = h('span', { class: 'small muted', text: '0 / 4000' });
        card.appendChild(ta);
        card.appendChild(h('div', { class: 'row', style: 'margin-top:6px' }, [h('span', { class: 'small muted', text: 'Pasting is turned off.' }), h('span', { class: 'spacer' }), count]));
        if (q.draft && q.draft.text) { ta.value = q.draft.text; count.textContent = ta.value.length + ' / 4000'; }
        ta.addEventListener('input', function () { count.textContent = ta.value.length + ' / 4000'; afterSelect(); });
        var drawEx = function () {
          if (q.about && !s.plain) drawText(aboutC, q.about, { font: '400 15px Poppins, sans-serif', lineH: 24, color: cssVar('--t2') });
          if (!s.plain) drawText(pc, q.prompt, { font: '600 18px Poppins, sans-serif', lineH: 28 });
        };
        requestAnimationFrame(drawEx);
        qState = { redraw: drawEx, nOpts: 0, canSubmit: function () { return false; } };
        setTimeout(function () { ta.focus(); }, 60);
      } else {
        card.appendChild(h('div', { class: 'qhead' }, [h('span', { class: 'n', text: 'Question ' + (bank ? labels[q.idx] : (q.idx + 1)) }), pill(TYPE_LABEL[q.type] || 'Choose one', 'accent'), bank && q.visits > 1 ? pill('Visited ' + q.visits + ' times', '') : null]));
        var rHost = h('div'); card.appendChild(rHost);
        if (s.plain) {
          reader = { stop: function () {}, play: function () {}, resize: function () {} };
          rHost.appendChild(h('div', { class: 'reader', style: 'min-height:auto' }, [h('p', { class: 'plainq', text: q.prompt })]));
        } else if (q.audio) {
          reader = new AudioPrompt(rHost, function () {
            return fetch('/api/assess/attempts/' + attemptId + '/audio', { credentials: 'same-origin', headers: { 'X-Assess-Token': token } }).then(function (r) {
              if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || ('HTTP ' + r.status)); });
              return r.blob();
            });
          }, function () { replays++; ev('replay', 'audio ' + replays); });
        } else {
          reader = s.displayMode === 'full' ? new FullText(rHost, q.prompt) : new Reader(rHost, q.prompt, s);
          reader.onReplay = function () { replays++; ev('replay', String(replays)); };
        }
        if (q.hasImage) {
          var imgBox = h('div', { class: 'qimg' }, [h('span', { class: 'small muted', text: 'Loading image…' })]);
          card.appendChild(imgBox);
          fetch('/api/assess/attempts/' + attemptId + '/image', { credentials: 'same-origin', headers: { 'X-Assess-Token': token } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
            .then(function (bl) {
              var url = URL.createObjectURL(bl); clear(imgBox);
              var im = h('img', { src: url, alt: 'Image for this question', draggable: 'false' });
              im.addEventListener('click', function () { var lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Image', onclick: function () { lb.remove(); } }, [h('img', { src: url, alt: 'Image for this question' })]); document.body.appendChild(lb); });
              imgBox.appendChild(im);
            }).catch(function () { clear(imgBox); imgBox.appendChild(h('span', { class: 'small muted', text: 'The image could not be loaded.' })); });
        }
        var fontsReady = (document.fonts && document.fonts.load ? document.fonts.load('600 24px Poppins') : Promise.resolve());
        var textEl = function (text) {
          if (s.plain) return h('span', { class: 'plainopt', text: text });
          var cv = h('canvas', { 'aria-hidden': 'true' }); optCanvases.push([cv, text]); return cv;
        };
        var drawOptsX = function () { optCanvases.forEach(function (x) { drawText(x[0], x[1], { font: '400 15px Poppins, sans-serif', lineH: 24 }); }); };
        var draft = q.draft && q.draft.choice ? q.draft.choice : null;
        if (q.type === 'ordering') {
          var seq = draft ? draft.slice() : [];
          var olist = h('div', { class: 'opts', role: 'group', 'aria-label': 'Steps to put in order' });
          card.appendChild(h('div', { class: 'row small muted', style: 'margin-top:14px' }, [h('span', { text: 'Tap the steps in the order they should happen. Tap a numbered step to take it out.' }), h('span', { class: 'spacer' }), h('button', { class: 'linkbtn small', type: 'button', text: 'Clear order', onclick: function () { seq = []; syncOrd(); afterSelect(); } })]));
          card.appendChild(olist);
          var obtns = q.options.map(function (o, i) {
            var num = h('span', { class: 'ordn empty', text: '' });
            var b = h('button', { class: 'opt ord', type: 'button', style: '--i:' + i, 'aria-label': (s.plain ? o.text : 'Step ' + LETTERS[i]) }, [num, textEl(o.text)]);
            b._num = num;
            b.addEventListener('click', function () { chooseOrd(i); });
            olist.appendChild(b); return b;
          });
          var syncOrd = function () {
            obtns.forEach(function (b, k) { var at = seq.indexOf(k); b._num.textContent = at >= 0 ? String(at + 1) : ''; b._num.classList.toggle('empty', at < 0); b.setAttribute('aria-pressed', String(at >= 0)); b.setAttribute('aria-label', (s.plain ? q.options[k].text : 'Step ' + LETTERS[k]) + (at >= 0 ? ', position ' + (at + 1) : ', not placed')); });
            selected = seq.slice(); syncPrimary();
          };
          var chooseOrd = function (i) { var at = seq.indexOf(i); if (at >= 0) seq.splice(at, 1); else seq.push(i); syncOrd(); afterSelect(); };
          qState = { choose: chooseOrd, nOpts: q.options.length, redraw: function () { drawOptsX(); if (reader.resize) reader.resize(); } };
          fontsReady.then(function () { if (reader && !q.audio) reader.play(); drawOptsX(); });
          setTimeout(syncOrd, 0);
        } else if (q.type === 'matching') {
          var picks = q.options.map(function (o, i) { return draft && draft[i] != null ? draft[i] : -1; });
          var mlist = h('div', { class: 'mlist', role: 'group', 'aria-label': 'Match each item' });
          card.appendChild(h('div', { class: 'small muted', style: 'margin-top:14px', text: 'Pick the right match for each item.' }));
          card.appendChild(mlist);
          q.options.forEach(function (o, i) {
            var sel = h('select', { class: 'sel', 'aria-label': 'Match for item ' + LETTERS[i] }, [h('option', { value: '-1', text: 'Choose…' })].concat(q.matches.map(function (m) { return h('option', { value: String(m.key), text: m.text }); })));
            sel.value = String(picks[i]);
            sel.addEventListener('change', function () { picks[i] = Number(sel.value); selected = picks.slice(); syncPrimary(); afterSelect(); });
            mlist.appendChild(h('div', { class: 'mrow', style: '--i:' + i }, [h('span', { class: 'ky', text: LETTERS[i] }), h('div', { class: 'mleft' }, [textEl(o.text)]), h('span', { class: 'muted', 'aria-hidden': 'true', text: '→' }), sel]));
          });
          selected = picks.slice();
          qState = { nOpts: 0, redraw: function () { drawOptsX(); if (reader.resize) reader.resize(); } };
          fontsReady.then(function () { if (reader && !q.audio) reader.play(); drawOptsX(); });
        } else {
          var opts = h('div', { class: 'opts', role: q.type === 'multi' ? 'group' : 'radiogroup', 'aria-label': 'Answer options' });
          card.appendChild(opts);
          var multi = q.type === 'multi';
          var btns = q.options.map(function (o, i) {
            var cv;
            if (s.plain) cv = h('span', { class: 'plainopt', text: o.text });
            else { cv = h('canvas', { 'aria-hidden': 'true' }); optCanvases.push([cv, o.text]); }
            var b = h('button', { class: 'opt' + (multi ? ' multi' : ''), style: '--i:' + i, type: 'button', role: multi ? 'checkbox' : 'radio', 'aria-checked': 'false', 'aria-label': s.plain ? LETTERS[i] + '. ' + o.text : 'Option ' + LETTERS[i] },
              [h('span', { class: 'mk' }), h('span', { class: 'ky', text: LETTERS[i] }), cv]);
            b.addEventListener('click', function () { choose(i); afterSelect(); });
            opts.appendChild(b);
            return b;
          });
          var paintSel = function () { btns.forEach(function (b, k) { b.setAttribute('aria-checked', String(selected.indexOf(k) >= 0)); }); syncPrimary(); };
          var choose = function (i) {
            if (multi) { var at = selected.indexOf(i); if (at >= 0) selected.splice(at, 1); else selected.push(i); } else selected = [i];
            paintSel();
          };
          if (draft) { selected = draft.filter(function (k) { return k >= 0 && k < btns.length; }); }
          qState = { choose: function (i) { choose(i); afterSelect(); }, nOpts: q.options.length, redraw: function () { drawOptsX(); if (reader.resize) reader.resize(); } };
          requestAnimationFrame(drawOptsX);
          fontsReady.then(function () { if (reader && !q.audio) reader.play(); drawOptsX(); });
          setTimeout(paintSel, 0);
        }
      }

      function hasSel() {
        if (q.kind === 'explain') return !!(ta && ta.value.trim());
        if (q.type === 'ordering') return selected.length === q.options.length;
        if (q.type === 'matching') return selected.length && selected.every(function (p) { return p >= 0; });
        return selected.length > 0;
      }
      function payload() {
        var p = { idx: q.idx, replays: replays };
        if (q.kind === 'explain') p.text = ta ? ta.value : '';
        else if (q.type === 'matching' || selected.length || !bank) p.choice = selected.slice();
        return p;
      }

      // Footer
      var savedEl = h('span', { class: 'saved', 'aria-live': 'polite' });
      var foot = h('div', { class: 'in' });
      exam.appendChild(h('div', { class: 'xfoot' }, [foot]));

      if (bank) {
        var hasPrev = false, nextOpenIdx = -1;
        for (var pi = q.idx - 1; pi >= 0; pi--) if (!q.nav[pi].out) { hasPrev = true; break; }
        for (var ni = q.idx + 1; ni < q.nav.length; ni++) if (!q.nav[ni].out) { nextOpenIdx = ni; break; }
        var prevIdxOpen = -1; for (var pj = q.idx - 1; pj >= 0; pj--) if (!q.nav[pj].out) { prevIdxOpen = pj; break; }
        var prevBtn = h('button', { class: 'btn lg ghost', type: 'button', 'aria-label': 'Previous question', disabled: !hasPrev || null, onclick: function () { move(prevIdxOpen); } }, [icon('arrowL', 'sm'), h('span', { class: 'lbl', text: 'Previous' })]);
        var flagBtn = h('button', { class: 'btn lg flagbtn', type: 'button', 'aria-label': 'Flag for review', 'aria-pressed': String(flagged), onclick: function () {
          flagged = !flagged; flagBtn.setAttribute('aria-pressed', String(flagged)); flagBtn.lastChild.textContent = flagged ? 'Flagged' : 'Flag for review';
          var nb = center.querySelector('.qn.cur'); if (nb) nb.classList.toggle('flg', flagged);
          var p = payload(); p.go = 'stay'; p.flag = flagged;
          post(p).catch(fail);
        } }, [icon('flag', 'sm'), h('span', { class: 'lbl', text: flagged ? 'Flagged' : 'Flag for review' })]);
        clear(primary);
        if (nextOpenIdx >= 0) { primary.appendChild(document.createTextNode('Next')); primary.appendChild(icon('arrowR', 'sm')); primary.onclick = function () { move('next'); }; }
        else { primary.appendChild(icon('list', 'sm')); primary.appendChild(document.createTextNode('Review answers')); primary.onclick = function () { move('review'); }; }
        foot.appendChild(prevBtn); foot.appendChild(flagBtn); foot.appendChild(h('span', { class: 'spacer' })); foot.appendChild(savedEl); foot.appendChild(primary);
        afterSelect = function () {
          savedEl.textContent = 'Saving…'; savedEl.className = 'saved ing';
          var nb = center.querySelector('.qn.cur'); if (nb) nb.classList.toggle('ans', hasSel());
          clearTimeout(saveT);
          saveT = setTimeout(function () {
            var p = payload(); p.go = 'stay';
            post(p).then(function (r) {
              if (r.done) { exitTo(function () { doneScreen(r.result); }); return; }
              if (r.expired) { load(); return; }
              savedEl.textContent = 'Saved'; savedEl.className = 'saved ok';
            }).catch(function (e) { if (!e.status) { savedEl.textContent = 'Not saved yet, retrying'; savedEl.className = 'saved bad'; setTimeout(afterSelect, 2000); } else fail(e); });
          }, 650);
        };
        qState.bank = true;
        qState.canSubmit = function () { return !busy; };
        qState.submit = function () { move(nextOpenIdx >= 0 ? 'next' : 'review'); };
        qState.next = function () { if (!busy) move(nextOpenIdx >= 0 ? 'next' : 'review'); };
        qState.prev = function () { if (!busy && hasPrev) move(prevIdxOpen); };
        if (q.draft) { savedEl.textContent = 'Saved'; savedEl.className = 'saved ok'; }
      } else {
        clear(primary); primary.appendChild(document.createTextNode(q.idx + 1 === q.total ? 'Submit and finish' : 'Submit answer')); primary.appendChild(icon('arrowR', 'sm'));
        primary.disabled = true;
        primary.onclick = function () { send(false); };
        foot.appendChild(h('span', { class: 'hint' }, (q.kind === 'explain' || q.type === 'matching') ? ['Answers lock when you submit.'] : [h('span', { class: 'kbd', text: '1' }), ' to ', h('span', { class: 'kbd', text: String(q.options.length) }), ' to choose, ', h('span', { class: 'kbd', text: 'Enter' }), ' to submit. Answers lock when you submit.']));
        foot.appendChild(h('span', { class: 'spacer' })); foot.appendChild(primary);
        qState.canSubmit = function () { return !primary.disabled; };
        qState.submit = send;
      }
      function syncPrimary() { if (!bank) primary.disabled = !hasSel(); }
      if (q.kind === 'explain' && !bank) ta.addEventListener('input', syncPrimary);

      // Move within the time bank: saves the current answer on the way out
      function move(target) {
        if (busy) return; busy = true; clearTimeout(saveT); clearInterval(tick);
        var p = payload(); p.go = target;
        if (typeof target === 'number') ev('nav', 'to item ' + (target + 1));
        post(p).then(function (r) {
          flush();
          if (r.done) exitTo(function () { doneScreen(r.result); }); else load();
        }).catch(function (e) {
          if (!e.status) { busy = false; toast('Connection lost, retrying…'); setTimeout(function () { move(target); }, 1500); return; }
          fail(e);
        });
      }
      // Locked mode: one answer, then the next question
      function send(auto) {
        if (busy) return; busy = true; primary.disabled = true; clearInterval(tick);
        if (auto) ev('auto_submit', 'Time ran out');
        var p = payload();
        var tries = 0;
        (function attempt() {
          post(p).then(function (r) { flush(); if (r.done) exitTo(function () { doneScreen(r.result); }); else load(); })
            .catch(function (e) {
              if (!e.status && tries < 4) { tries++; toast('Connection lost, retrying…'); setTimeout(attempt, 1500 * tries); return; }
              fail(e);
            });
        })();
      }

      var val = timer.querySelector('.val');
      function paint() {
        var nowT = Date.now();
        if (netDown) { deadline += nowT - lastPaintT; lastPaintT = nowT; return; }
        lastPaintT = nowT;
        var left = Math.max(0, deadline - nowT), frac = left / (q.seconds * 1000), sLeft = Math.ceil(left / 1000);
        val.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, Math.min(1, frac)))).toFixed(2));
        tNum.textContent = String(sLeft);
        timer.classList.toggle('low', sLeft <= 10 && sLeft > 5); timer.classList.toggle('crit', sLeft <= 5);
        if (totalEl) totalEl.textContent = fmtClock(otherLeft + left) + ' left in total';
        if ((sLeft === 10 || sLeft === 5) && lastAnnounce !== sLeft) { lastAnnounce = sLeft; announce(sLeft + ' seconds left on this question'); }
        if (left <= 0) {
          clearInterval(tick);
          if (bank) { toast('Time is up on this question. Your answer is saved.'); move('auto'); } else send(true);
        }
      }
      paint(); tick = setInterval(paint, 200);
    }

    // ── Review screen (time bank) ────────────────────────────────────
    function renderReview(q) {
      curIdx = null; busy = false; qState = null; prevIdx = -1;
      clear(exam); faceChip = null; faceBanner = null;
      var labels = navLabels(q.nav);
      var answered = q.nav.filter(function (n) { return n.answered; }).length;
      var unanswered = q.nav.filter(function (n) { return !n.answered; });
      var flaggedN = q.nav.filter(function (n) { return n.flagged; }).length;
      var camEl = null;
      if (s.camera && camVideo) {
        var mini = h('video', { autoplay: true, muted: true, playsinline: true }); mini.srcObject = cam.stream;
        faceChip = h('span', { class: 'facechip ' + face.status }, [h('i'), h('span', { text: FACE_TEXT[face.status] })]);
        camEl = h('div', { class: 'cam-mini' }, [mini, faceChip]);
      }
      exam.appendChild(h('div', { class: 'xbar' }, [
        h('div', { class: 'ttl' }, [h('b', { text: start.title }), h('span', { text: 'Review your answers' })]),
        h('div'),
        h('div', { class: 'right' }, [camEl, h('span', { class: 'pill', text: 'Clocks paused' })]),
      ]));
      if (face.episode) showFaceBanner(face.episode.type);
      var body = h('div', { class: 'xbody review slide-first' });
      exam.appendChild(body);
      body.appendChild(h('div', { class: 'rv-head' }, [
        art('inbox', 130),
        h('div', null, [h('h1', { text: 'Review before you submit' }), h('p', { class: 'muted', text: 'Question clocks are paused on this screen. Open any question that still has time to check or change your answer. Questions with no time left are locked.' })]),
      ]));
      var pct = Math.round(answered / q.nav.length * 100);
      body.appendChild(h('div', { class: 'rv-stats' }, [
        h('div', { class: 'rv-stat' }, [h('b', { text: answered + ' / ' + q.nav.length }), h('span', { text: 'Answered' }), h('div', { class: 'rv-bar' }, [h('i', { style: 'width:' + pct + '%' })])]),
        h('div', { class: 'rv-stat' + (unanswered.length ? ' warn' : '') }, [h('b', { text: String(unanswered.length) }), h('span', { text: 'Not answered' })]),
        h('div', { class: 'rv-stat' + (flaggedN ? ' accent' : '') }, [h('b', { text: String(flaggedN) }), h('span', { text: 'Flagged' })]),
        h('div', { class: 'rv-stat' }, [h('b', { text: fmtClock(q.leftMs) }), h('span', { text: 'Time left across questions' })]),
      ]));
      var grid = h('div', { class: 'rv-grid' });
      q.nav.forEach(function (n, i) {
        var state = n.out ? 'Locked, no time left' : (n.answered ? 'Answered' : 'Not answered');
        var tile = h('button', { type: 'button', class: 'rv-tile' + (n.answered ? ' ans' : ' todo') + (n.flagged ? ' flg' : '') + (n.out ? ' out' : ''), style: '--i:' + i, disabled: n.out || null,
          'aria-label': (n.kind === 'explain' ? 'Written answer ' + labels[i].slice(1) : 'Question ' + labels[i]) + ', ' + state + (n.flagged ? ', flagged' : '') + (n.out ? '' : ', ' + Math.ceil(n.leftMs / 1000) + ' seconds left'),
          onclick: function () { open(n.idx); } }, [
          h('span', { class: 'rv-n', text: labels[i] }),
          h('span', { class: 'rv-s' }, [n.flagged ? icon('flag', 'sm') : (n.answered ? icon('check', 'sm') : (n.out ? icon('lock', 'sm') : null)), h('span', { text: n.out ? 'Locked' : (n.answered ? 'Answered' : 'To do') })]),
          h('span', { class: 'rv-t', text: n.out ? 'No time left' : fmtClock(n.leftMs) + ' left' }),
        ]);
        grid.appendChild(tile);
      });
      body.appendChild(grid);
      var firstTodo = q.nav.filter(function (n) { return !n.out && (!n.answered || n.flagged); })[0] || q.nav.filter(function (n) { return !n.out; })[0];
      var back = firstTodo ? h('button', { class: 'btn lg', type: 'button', onclick: function () { open(firstTodo.idx); } }, [icon('arrowL', 'sm'), firstTodo.answered ? 'Back to the questions' : 'Answer what is left']) : null;
      var submit = h('button', { class: 'btn primary lg', type: 'button', onclick: confirmSubmit }, ['Submit test', icon('check', 'sm')]);
      exam.appendChild(h('div', { class: 'xfoot' }, [h('div', { class: 'in' }, [back, h('span', { class: 'spacer' }), h('span', { class: 'hint', text: unanswered.length ? unanswered.length + ' not answered yet' : 'Everything is answered' }), submit])]));
      function open(idx) {
        if (busy) return; busy = true;
        post({ go: idx }).then(function (r) { if (r.done) exitTo(function () { doneScreen(r.result); }); else load(); }).catch(function (e) { busy = false; fail(e); });
      }
      function confirmSubmit() {
        var dlg = h('dialog', { class: 'confirm', 'aria-labelledby': 'cf-t' });
        var msg = unanswered.length ? unanswered.length + (unanswered.length === 1 ? ' question is' : ' questions are') + ' not answered and will count as wrong.' : 'All questions are answered.';
        var go2 = h('button', { class: 'btn primary', type: 'button', text: 'Submit now' });
        dlg.appendChild(h('div', { class: 'cf-in' }, [
          h('div', { class: 'cf-ic' }, [icon(unanswered.length ? 'warn' : 'check', 'lg')]),
          h('h2', { id: 'cf-t', text: 'Submit your test?' }),
          h('p', { text: msg + (flaggedN ? ' You flagged ' + flaggedN + ' to look at again.' : '') + ' You cannot change answers after this.' }),
          h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:8px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Keep reviewing', onclick: function () { dlg.close(); } }), go2]),
        ]));
        dlg.addEventListener('close', function () { dlg.remove(); });
        go2.addEventListener('click', function () {
          go2.disabled = true;
          api('/api/assess/attempts/' + attemptId + '/submit', { method: 'POST', token: token, body: {}, patient: true })
            .then(function (r) { dlg.close(); flush(); exitTo(function () { doneScreen(r.result); }); })
            .catch(function (e) { dlg.close(); fail(e); });
        });
        document.body.appendChild(dlg); dlg.showModal();
      }
    }

    startCamera().then(function () { if (!stopping) load(); });
  }

  // ── Reviewer: assessments list ───────────────────────────────────────
  function viewManage() {
    main.appendChild(pageHead('Assessments', me.reviewer ? 'Build assessments from the question bank, choose who takes them, and review results.' : 'You review these assessments. Open one to see results and mark answers.',
      !me.reviewer ? null : [h('button', { class: 'btn ghost', type: 'button', onclick: function () { go('archived'); } }, [icon('archive', 'sm'), 'Archived']),
       h('button', { class: 'btn', type: 'button', onclick: function () { go('studio'); } }, [icon('bot', 'sm'), 'Build from a document']),
       h('button', { class: 'btn primary', type: 'button', onclick: function () { go('edit/new'); } }, [icon('plus', 'sm'), 'New assessment'])]));
    if (me.reviewer) {
      var livebar = h('div', { class: 'livebar', role: 'status' }); main.appendChild(livebar);
      (function pollLive() {
        if (!document.body.contains(livebar)) return;
        api('/api/assess/admin/live-now').then(function (r) {
          clear(livebar);
          var names = r.people.map(function (p) { return p.name + ' (' + p.progress + ')'; }).join(', ');
          livebar.className = 'livebar' + (r.count ? ' on' : '');
          livebar.appendChild(h('i', { class: 'ld' }));
          livebar.appendChild(h('span', { text: r.count ? r.count + (r.count === 1 ? ' person is' : ' people are') + ' taking an assessment right now: ' + names + '. Hold deploys until this is 0.' : 'No one is taking an assessment right now.' }));
          if (r.lastOutage) livebar.appendChild(h('span', { class: 'small muted', text: 'Last restart: about ' + r.lastOutage.seconds + 's down, ' + r.lastOutage.credited + ' open attempt(s) got their time back.' }));
        }).catch(function () {}).then(function () { setTimeout(pollLive, 30000); });
      })();
    }
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    api('/api/assess/admin/tests').then(function (j) {
      clear(holder);
      if (!j.tests.length) { holder.appendChild(h('div', { class: 'empty' }, [art('tests'), h('b', { text: 'No assessments yet' }), h('span', { text: me.reviewer ? 'Add questions to the bank, then create an assessment.' : 'Nothing to review right now.' })])); return; }
      var grid = h('div', { class: 'grid-cards' });
      j.tests.forEach(function (t) {
        var qtext = t.settings.pool.mode === 'random' ? t.settings.pool.count + ' random from ' + (t.poolSize || 0) : t.questionIds.length + ' questions';
        grid.appendChild(h('div', { class: 'card mcard' }, [
          h('div', { class: 'row', style: 'align-items:flex-start' }, [h('h2', { style: 'flex:1;font-size:16px', text: t.title }), t.status === 'published' ? pill('Published', 'ok', true) : pill('Draft', '', true)]),
          t.description ? h('p', { class: 'muted small', style: 'margin:0', text: t.description }) : null,
          modChips(t.modules),
          h('div', { class: 'meta' }, [pill(qtext), pill(t.settings.secondsPerQuestion + 's each'), pill(t.settings.navigation === 'locked' ? 'One way' : 'Back and forth'), pill(t.assign.everyone ? 'Everyone' : t.assign.emails.length + ' assigned'), t.settings.camera ? pill('Camera', 'accent') : null]),
          h('div', { class: 'nums' }, [
            h('div', null, [h('b', { text: String(t.submitted) }), h('span', { text: 'Submitted' })]),
            h('div', null, [h('b', { text: t.avgPct != null ? t.avgPct + '%' : '–' }), h('span', { text: 'Average' })]),
          ]),
          h('div', { class: 'row' }, [
            h('button', { class: 'btn primary sm', type: 'button', onclick: function () { go('results/' + t.id); } }, [icon('chart', 'sm'), 'Results']),
            !me.reviewer ? null : h('button', { class: 'btn sm', type: 'button', onclick: function () { go('edit/' + t.id); } }, [icon('edit', 'sm'), 'Edit']),
            t.submitted && me.reviewer ? h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { go('results/' + t.id + '?retest=1'); } }, [icon('retest', 'sm'), 'Retest']) : null,
          ]),
        ]));
      });
      holder.appendChild(grid);
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }

  // ── Reviewer: builder ────────────────────────────────────────────────
  function viewBuilder(id) {
    main.appendChild(pageHead(id ? 'Edit assessment' : 'New assessment', null, null, { text: 'Assessments', go: function () { go('manage'); } }));
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    Promise.all([
      id ? api('/api/assess/admin/tests') : Promise.resolve({ tests: [] }),
      id ? api('/api/assess/admin/tests/' + id + '/questions') : Promise.resolve({ questions: [] }),
      api('/api/assess/admin/questions'),
      api('/api/assess/admin/people'),
    ]).then(function (r) {
      clear(holder);
      var t = id ? r[0].tests.find(function (x) { return x.id === id; }) : null;
      if (id && !t) { holder.appendChild(errBox('Assessment not found.')); return; }
      var bank = r[2].questions, tags = r[2].tags, people = r[3].people;
      var st = t ? JSON.parse(JSON.stringify(t.settings)) : { secondsPerQuestion: 40, displayMode: 'fade', wordsPerChunk: 4, chunkMs: 1000, explainCount: 1, explainSec: 90, passPct: 70, attempts: 1, showScore: false, shuffleQuestions: true, shuffleOptions: true, watermark: 'off', camera: false, snapshotSec: 30, navigation: 'bank', modules: [], prep: { summary: '', topics: [] }, pool: { mode: 'fixed', tags: [], count: 10, difficulty: '' } };
      if (!st.navigation) st.navigation = 'bank';
      if (!st.modules) st.modules = []; if (!st.prep) st.prep = { summary: '', topics: [] };
      var picked = r[1].questions.map(function (q) { return q.id; });
      var assign = t ? { everyone: t.assign.everyone, emails: t.assign.emails.slice() } : { everyone: false, emails: [] };
      var status = t ? t.status : 'draft';
      var bankById = {}; bank.forEach(function (q) { bankById[q.id] = q; });
      r[1].questions.forEach(function (q) { if (!bankById[q.id]) bankById[q.id] = q; });

      var layout = h('div', { class: 'builder' });
      var left = h('div'), side = h('div', { class: 'side' });
      layout.appendChild(left); layout.appendChild(side); holder.appendChild(layout);

      // Details
      var title = h('input', { class: 'inp', id: 'b-title', maxlength: '160', required: true, 'aria-required': 'true', value: t ? t.title : '', placeholder: 'e.g. Escalations and ownership, October' });
      var desc = h('textarea', { class: 'ta', id: 'b-desc', maxlength: '1000', placeholder: 'What this checks. Agents see this on their card.' }); desc.value = t ? t.description : '';
      var sugBtn = h('button', { class: 'btn sm', type: 'button' }, [icon('wand', 'sm'), 'Suggest name and description']);
      var sugMsg = h('div');
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Details' }), h('p', { text: 'Agents see the title and description before they start.' }), field('Title', title), field('Description', desc), h('div', { class: 'row', style: 'margin-top:10px' }, [sugBtn, h('span', { class: 'small muted', text: 'Reads the questions below and proposes a name and description. You can edit them.' })]), sugMsg]));

      // Questions
      var qsec = h('div', { class: 'card sec' });
      left.appendChild(qsec);
      function renderQuestions() {
        clear(qsec);
        qsec.appendChild(h('h2', { text: 'Questions' }));
        qsec.appendChild(h('p', { text: 'Pick exact questions, or draw a random set from the bank so every agent gets a different paper.' }));
        var rc = h('div', { class: 'radcards' });
        [['fixed', 'Pick questions', 'The same questions for everyone, in shuffled order.'], ['random', 'Random from the bank', 'Each agent gets a different random set from matching approved questions.']].forEach(function (o) {
          var inp = h('input', { type: 'radio', name: 'pmode', value: o[0], checked: st.pool.mode === o[0] ? true : null });
          inp.addEventListener('change', function () { st.pool.mode = o[0]; renderQuestions(); renderSide(); });
          rc.appendChild(h('label', { class: 'radcard' }, [inp, h('div', null, [h('b', { text: o[1] }), h('span', { text: o[2] })])]));
        });
        qsec.appendChild(rc);
        if (st.pool.mode === 'fixed') {
          if (!picked.length) qsec.appendChild(h('p', { class: 'muted small', text: 'No questions yet.' }));
          picked.forEach(function (qid, i) {
            var q = bankById[qid] || { prompt: 'Question ' + qid, status: '' };
            qsec.appendChild(h('div', { class: 'pickrow' }, [h('span', { class: 'n', text: String(i + 1) }), h('span', { class: 't', text: q.prompt, title: q.prompt }),
              q.status === 'draft' ? pill('Draft', 'warn') : null,
              h('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': 'Remove question', onclick: function () { picked.splice(i, 1); renderQuestions(); renderSide(); } }, [icon('x', 'sm')])]));
          });
          qsec.appendChild(h('button', { class: 'btn', type: 'button', style: 'margin-top:8px', onclick: openPicker }, [icon('plus', 'sm'), 'Add questions']));
        } else {
          var chipBox = h('div', { class: 'chips' });
          tags.forEach(function (tg) {
            var on = st.pool.tags.indexOf(tg.tag) >= 0;
            chipBox.appendChild(h('button', { class: 'chip ' + (on ? 'sel' : 'off'), type: 'button', 'aria-pressed': String(on), text: tg.tag + ' (' + tg.n + ')', onclick: function () {
              var at = st.pool.tags.indexOf(tg.tag); if (at >= 0) st.pool.tags.splice(at, 1); else st.pool.tags.push(tg.tag); renderQuestions(); renderSide();
            } }));
          });
          qsec.appendChild(h('div', { class: 'field' }, [h('span', { class: 'lbl', text: 'Topics (tags)' }), tags.length ? chipBox : h('span', { class: 'hint', text: 'Add tags to questions in the bank to build pools.' }), h('span', { class: 'hint', text: 'No topic selected means any approved question.' })]));
          var diff = h('select', { class: 'sel', id: 'b-diff' }, [h('option', { value: '', text: 'Any' }), h('option', { value: 'easy', text: 'Easy' }), h('option', { value: 'medium', text: 'Medium' }), h('option', { value: 'hard', text: 'Hard' })]); diff.value = st.pool.difficulty || '';
          diff.addEventListener('change', function () { st.pool.difficulty = diff.value; renderSide(); });
          var cnt = h('input', { class: 'inp', id: 'b-count', type: 'number', min: '1', max: '100', value: String(st.pool.count) });
          cnt.addEventListener('input', function () { st.pool.count = Number(cnt.value) || 1; renderSide(); });
          qsec.appendChild(h('div', { class: 'fgrid' }, [field('Difficulty', diff), field('Questions per agent', cnt)]));
          var match = bank.filter(function (q) { return q.status === 'approved' && (!st.pool.tags.length || q.tags.some(function (x) { return st.pool.tags.indexOf(x) >= 0; })) && (!st.pool.difficulty || q.difficulty === st.pool.difficulty); }).length;
          qsec.appendChild(h('div', { class: 'alert ' + (match >= st.pool.count ? 'info' : 'warn') }, [icon(match >= st.pool.count ? 'check' : 'warn'), h('span', { text: match + ' approved questions match. ' + (match >= st.pool.count * 2 ? 'Good spread for different papers.' : match >= st.pool.count ? 'Agents will get similar papers; add more questions for variety.' : 'Fewer than the number asked for; agents get all ' + match + '.') })]));
        }
      }
      function openPicker() {
        var chosen = picked.slice();
        var q = h('input', { class: 'inp', type: 'search', placeholder: 'Search questions', 'aria-label': 'Search questions', style: 'width:100%;margin-bottom:12px' });
        var listEl = h('div');
        function draw() {
          clear(listEl);
          var term = q.value.toLowerCase();
          bank.filter(function (x) { return !term || x.prompt.toLowerCase().indexOf(term) >= 0 || x.tags.join(' ').indexOf(term) >= 0; }).forEach(function (x) {
            var cb = h('input', { type: 'checkbox', checked: chosen.indexOf(x.id) >= 0 ? true : null });
            cb.addEventListener('change', function () { var at = chosen.indexOf(x.id); if (cb.checked && at < 0) chosen.push(x.id); if (!cb.checked && at >= 0) chosen.splice(at, 1); });
            listEl.appendChild(h('label', { class: 'pickrow', style: 'cursor:pointer' }, [cb, h('span', { class: 't', text: x.prompt, title: x.prompt }), x.status === 'draft' ? pill('Draft', 'warn') : null, pill(TYPE_SHORT[x.type] || x.type)]));
          });
          if (!listEl.children.length) listEl.appendChild(h('p', { class: 'muted', text: 'No questions match.' }));
        }
        q.addEventListener('input', draw); draw();
        var dlg = openDrawer('Add questions', h('div', null, [q, listEl]), [h('span', { class: 'small muted', text: 'Drafts can be added, but approve them before agents see them.' }), h('span', { class: 'spacer' }),
          h('button', { class: 'btn primary', type: 'button', text: 'Done', onclick: function () { picked = chosen; dlg.close(); renderQuestions(); renderSide(); } })]);
      }
      renderQuestions();

      // Modules and what it covers (shown to agents before they start)
      var prep = st.prep;
      var modState = { modules: st.modules };
      var prepBox = h('div');
      var sumIn = h('textarea', { class: 'ta', id: 'b-psum', maxlength: '600', placeholder: 'A sentence or two on what agents should revise.', style: 'min-height:64px' }); sumIn.value = prep.summary || '';
      sumIn.addEventListener('input', function () { prep.summary = sumIn.value; });
      function drawPrep() {
        clear(prepBox);
        prep.topics.forEach(function (tp, i) {
          var ti = h('input', { class: 'inp', type: 'text', maxlength: '90', value: tp.title, placeholder: 'Topic', 'aria-label': 'Topic ' + (i + 1) });
          var pts = h('textarea', { class: 'ta', style: 'min-height:64px', placeholder: 'One study pointer per line', 'aria-label': 'Pointers for ' + (tp.title || 'topic') }); pts.value = (tp.points || []).join('\n');
          ti.addEventListener('input', function () { tp.title = ti.value; });
          pts.addEventListener('input', function () { tp.points = pts.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6); });
          prepBox.appendChild(h('div', { class: 'ptopic' }, [h('div', { class: 'row', style: 'flex-wrap:nowrap' }, [ti, h('button', { class: 'btn icon sm ghost', type: 'button', 'aria-label': 'Remove topic', onclick: function () { prep.topics.splice(i, 1); drawPrep(); } }, [icon('x', 'sm')])]), pts]));
        });
        if (prep.topics.length < 10) prepBox.appendChild(h('button', { class: 'btn sm', type: 'button', style: 'margin-top:6px', onclick: function () { prep.topics.push({ title: '', points: [] }); drawPrep(); } }, [icon('plus', 'sm'), 'Add a topic']));
      }
      drawPrep();
      var coverBtn = h('button', { class: 'btn sm', type: 'button' }, [icon('wand', 'sm'), 'Suggest from the questions']);
      var coverMsg = h('div');
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Modules and what it covers' }),
        h('p', { text: 'Tag the product modules this checks. Agents see the tags and the study list when they open the assessment, so they know what to revise. It never shows questions or answers.' }),
        modEditor(modState, null), h('div', { style: 'height:14px' }),
        field('Summary for agents', sumIn), h('span', { class: 'lbl small', style: 'font-weight:600;color:var(--t2)', text: 'Topics to revise' }), h('div', { style: 'height:6px' }), prepBox,
        h('div', { class: 'row', style: 'margin-top:12px' }, [coverBtn]), coverMsg]));
      function suggestIds() {
        if (st.pool.mode === 'fixed') return picked.slice(0, 60);
        return bank.filter(function (q) { return q.status === 'approved' && (!st.pool.tags.length || q.tags.some(function (x) { return st.pool.tags.indexOf(x) >= 0; })); }).slice(0, 40).map(function (q) { return q.id; });
      }
      function runSuggest(part, btn, msgBox) {
        var ids = suggestIds();
        clear(msgBox);
        if (!ids.length) { msgBox.appendChild(errBox('Add some questions first, then I can suggest from them.')); return; }
        btn.disabled = true; btn.classList.add('busy');
        api('/api/assess/admin/tests/suggest', { method: 'POST', body: { questionIds: ids, hint: title.value.slice(0, 120) } }).then(function (r) {
          var m = r.meta;
          if (part === 'text') { if (m.title) title.value = m.title; if (m.description) desc.value = m.description; msgBox.appendChild(h('div', { class: 'alert info' }, [icon('check'), h('span', { text: 'Filled in a name and description. Edit them if you like.' })])); }
          else {
            st.modules.length = 0; m.modules.forEach(function (x) { st.modules.push(x); });
            prep.summary = m.prep.summary || ''; sumIn.value = prep.summary; prep.topics.length = 0; (m.prep.topics || []).forEach(function (x) { prep.topics.push(x); });
            drawPrep(); loadMods().then(function () { document.querySelectorAll('.moded').forEach(function (e) { if (e.redraw) e.redraw(); }); });
            msgBox.appendChild(h('div', { class: 'alert info' }, [icon('check'), h('span', { text: 'Filled in modules and a study list from the questions. Edit anything that is off.' })]));
          }
        }).catch(function (e) { msgBox.appendChild(errBox(e.message)); }).finally(function () { btn.disabled = false; btn.classList.remove('busy'); });
      }
      sugBtn.addEventListener('click', function () { runSuggest('text', sugBtn, sugMsg); });
      coverBtn.addEventListener('click', function () { runSuggest('cover', coverBtn, coverMsg); });

      // Timing and display
      var secIn = h('input', { class: 'inp', id: 'b-sec', type: 'number', min: '15', max: '180', value: String(st.secondsPerQuestion) });
      secIn.addEventListener('input', function () { st.secondsPerQuestion = Number(secIn.value) || 40; renderSide(); });
      var modeCards = h('div', { class: 'radcards three' });
      [['fade', 'Rolling reveal', 'A few words at a time, then it fades. Hard to screenshot or paste into AI.'], ['audio', 'Read aloud', 'The question is spoken, never shown as text. Agents need headphones.'], ['full', 'Full question', 'The whole question stays on screen. Easiest to read.']].forEach(function (o) {
        var inp = h('input', { type: 'radio', name: 'dmode', value: o[0], checked: st.displayMode === o[0] ? true : null });
        inp.addEventListener('change', function () { st.displayMode = o[0]; fadeRow.style.display = o[0] === 'fade' ? '' : 'none'; audioRow.style.display = o[0] === 'audio' ? '' : 'none'; });
        modeCards.appendChild(h('label', { class: 'radcard' }, [inp, h('div', null, [h('b', { text: o[1] }), h('span', { text: o[2] })])]));
      });
      var wpc = h('select', { class: 'sel', id: 'b-wpc' }, [2, 3, 4, 5, 6].map(function (n) { return h('option', { value: String(n), text: n + ' words' }); })); wpc.value = String(st.wordsPerChunk);
      var spd = h('select', { class: 'sel', id: 'b-spd' }, SPEEDS.map(function (o) { return h('option', { value: String(o.ms), text: o.label }); }));
      spd.value = String(SPEEDS[speedFor(st.chunkMs)].ms);
      wpc.addEventListener('change', function () { st.wordsPerChunk = Number(wpc.value); });
      spd.addEventListener('change', function () { st.chunkMs = Number(spd.value); });
      var prevHost = h('div', { style: 'margin-top:10px' });
      var prevBtn = h('button', { class: 'btn sm', type: 'button', onclick: function () {
        clear(prevHost);
        var sample = picked.length && bankById[picked[0]] ? bankById[picked[0]].prompt : 'A caller says their front desk phones stopped ringing this morning. Which team owns this, and what do you check first?';
        new Reader(prevHost, sample, { wordsPerChunk: st.wordsPerChunk, chunkMs: st.chunkMs, dial: true }).play();
      } }, [icon('replay', 'sm'), 'Preview reading']);
      var fadeRow = h('div', { style: st.displayMode === 'fade' ? '' : 'display:none' }, [h('div', { class: 'fgrid' }, [field('Words per group', wpc), field('Starting reading speed', spd, 'Agents read at this speed. Admins can try speeds with the dial in Preview reading.')]), prevBtn, prevHost]);
      var voiceSel = h('select', { class: 'sel', id: 'b-voice' }, [['alloy', 'Alloy (neutral)'], ['nova', 'Nova (warm)'], ['shimmer', 'Shimmer (bright)'], ['echo', 'Echo (calm)'], ['onyx', 'Onyx (deep)'], ['fable', 'Fable (British)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      voiceSel.value = st.voice || 'alloy';
      voiceSel.addEventListener('change', function () { st.voice = voiceSel.value; });
      var vErr = h('div');
      var vBtn = h('button', { class: 'btn sm', type: 'button' }, [icon('volume', 'sm'), 'Preview voice']);
      vBtn.addEventListener('click', function () {
        clear(vErr); vBtn.disabled = true;
        var sample = picked.length && bankById[picked[0]] ? bankById[picked[0]].prompt : 'A caller says their front desk phones stopped ringing this morning. Which team owns this, and what do you check first?';
        fetch('/api/assess/admin/tts-preview?voice=' + encodeURIComponent(st.voice || 'alloy') + '&text=' + encodeURIComponent(sample.slice(0, 300)), { credentials: 'same-origin' })
          .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'HTTP ' + r.status); }); return r.blob(); })
          .then(function (b) { var a = new Audio(URL.createObjectURL(b)); a.play(); })
          .catch(function (e) { vErr.appendChild(errBox(e.message)); })
          .finally(function () { vBtn.disabled = false; });
      });
      var audioRow = h('div', { style: st.displayMode === 'audio' ? '' : 'display:none' }, [h('div', { class: 'fgrid' }, [field('Voice', voiceSel, 'Audio is generated once per question and reused.')]), vBtn, vErr]);
      var navCards = h('div', { class: 'radcards' });
      [['bank', 'Move between questions', 'Each question keeps its own clock, which runs only while it is open. Agents can go back while time is left, flag questions, and review everything before submitting.'], ['locked', 'One way', 'Answers lock on submit and the next question opens. No going back, no review screen.']].forEach(function (o) {
        var inp = h('input', { type: 'radio', name: 'nmode', value: o[0], checked: st.navigation === o[0] ? true : null });
        inp.addEventListener('change', function () { st.navigation = o[0]; });
        navCards.appendChild(h('label', { class: 'radcard' }, [inp, h('div', null, [h('b', { text: o[1] }), h('span', { text: o[2] })])]));
      });
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Timing and display' }), h('p', { text: '30 to 45 seconds is enough to read and answer, but too short to look it up.' }),
        h('div', { class: 'fgrid' }, [field('Seconds per question', secIn, 'Written answers have their own time, set under Integrity.')]),
        h('span', { class: 'lbl small', style: 'font-weight:600;color:var(--t2)', text: 'Moving between questions' }), h('div', { style: 'height:6px' }), navCards,
        h('span', { class: 'lbl small', style: 'font-weight:600;color:var(--t2)', text: 'How questions appear' }), h('div', { style: 'height:6px' }), modeCards, fadeRow, audioRow]));

      // Integrity
      var camT = toggle('Camera photos and face check', st.camera, 'With the agent\'s consent: a photo every 30 seconds, plus a check on their own device that their face is in view, that no one else is, and that the camera is not covered. Only you (the owner) can see photos, and they are deleted automatically.');
      var wmT = toggle('Faint name watermark', st.watermark === 'subtle', 'Very light email and time across the screen, so a photo of the screen can be traced. Off by default.');
      var shQ = toggle('Shuffle question order', st.shuffleQuestions), shO = toggle('Shuffle answer options', st.shuffleOptions);
      var exIn = h('select', { class: 'sel', id: 'b-ex' }, [0, 1, 2, 3].map(function (n) { return h('option', { value: String(n), text: n === 0 ? 'None' : n + ' question' + (n > 1 ? 's' : '') }); })); exIn.value = String(Math.min(3, st.explainCount));
      exIn.addEventListener('change', function () { st.explainCount = Number(exIn.value); exSecWrap.style.display = st.explainCount ? '' : 'none'; renderSide(); });
      if (!st.explainSec) st.explainSec = 90;
      var exSec = h('input', { class: 'inp', id: 'b-exsec', type: 'number', min: '30', max: '600', step: '10', value: String(st.explainSec), 'aria-label': 'Seconds for each written answer', style: 'width:84px' });
      exSec.addEventListener('input', function () { var n = Number(exSec.value); st.explainSec = n >= 30 && n <= 600 ? Math.round(n) : 90; renderSide(); });
      exSec.addEventListener('blur', function () { var n = Number(exSec.value); if (!(n >= 30 && n <= 600)) { exSec.value = String(st.explainSec); } });
      var exSecWrap = h('span', { style: 'display:' + (st.explainCount ? 'inline-flex' : 'none') + ';align-items:center;gap:6px;margin-left:8px' }, [exSec, h('span', { class: 'small muted', text: 'seconds each' })]);
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Integrity' }), h('p', { text: 'Tab switches, full screen exits, copy, paste and Print Screen are always logged. Nothing is screen recorded.' }),
        camT, wmT, shQ, shO, h('div', { class: 'setrow' }, [h('div', { class: 'tx' }, [h('b', { text: 'Explain your answer' }), h('span', { text: 'At the end the agent explains random answers in their own words. You mark them. Give agents the time they need, 30 to 600 seconds.' })]), h('div', { style: 'display:flex;align-items:center;flex-wrap:wrap;gap:4px' }, [exIn, exSecWrap])])]));

      // Scoring
      var passIn = h('input', { class: 'inp', id: 'b-pass', type: 'number', min: '0', max: '100', value: String(st.passPct) });
      var attIn = h('input', { class: 'inp', id: 'b-att', type: 'number', min: '1', max: '10', value: String(st.attempts) });
      var showT = toggle('Show the score when they finish', st.showScore, 'Otherwise agents see "Submitted" and you share results.');
      var relSel = h('select', { class: 'sel', id: 'b-rel' }, [['none', 'Not yet'], ['score', 'Score only'], ['answers', 'Score and answers']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      relSel.value = st.releaseMode || 'none';
      relSel.addEventListener('change', function () { st.releaseMode = relSel.value; });
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Scoring and results' }), h('div', { class: 'fgrid' }, [field('Pass mark (%)', passIn), field('Attempts allowed', attIn)]), showT,
        h('div', { class: 'fgrid', style: 'margin-top:14px' }, [field('Release results to agents', relSel, 'Agents see it under "View result". Releasing answers shows the answer key for the questions they got, so use fresh questions next time.')])]));
      // Repeat
      var rep = st.repeat || { mode: 'none', openDays: 7 }; st.repeat = rep;
      var repSel = h('select', { class: 'sel', id: 'b-rep' }, [['none', 'Does not repeat'], ['weekly', 'Every week (Monday)'], ['monthly', 'Every month (1st)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); repSel.value = rep.mode;
      var repDays = h('input', { class: 'inp', id: 'b-repdays', type: 'number', min: '1', max: '28', value: String(rep.openDays || 7) });
      repSel.addEventListener('change', function () { rep.mode = repSel.value; repNote.style.display = rep.mode === 'none' ? 'none' : ''; renderSide(); });
      repDays.addEventListener('input', function () { rep.openDays = Number(repDays.value) || 7; });
      var repNote = h('div', { class: 'alert info', style: rep.mode === 'none' ? 'display:none' : '' }, [icon('replay'), h('span', { text: 'This becomes a template. Agents never see it directly: each week or month, from 8 AM Central, a dated copy opens for the same people, draws a fresh random paper if you use a pool, closes after the days you set, and is announced in Google Chat if announcements are on.' })]);
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Repeat' }), h('p', { text: 'Use with "Random from the bank" so every round is a new paper.' }),
        h('div', { class: 'fgrid' }, [field('Repeat', repSel), field('Each copy stays open for (days)', repDays)]), repNote]));
      // Schedule
      function toLocal(iso) { if (!iso) return ''; var d = new Date(iso); var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
      var opIn = h('input', { class: 'inp', id: 'b-open', type: 'datetime-local', value: toLocal(st.opensAt) });
      var clIn = h('input', { class: 'inp', id: 'b-close', type: 'datetime-local', value: toLocal(st.closesAt) });
      opIn.addEventListener('change', function () { st.opensAt = opIn.value ? new Date(opIn.value).toISOString() : ''; });
      clIn.addEventListener('change', function () { st.closesAt = clIn.value ? new Date(clIn.value).toISOString() : ''; });
      left.appendChild(h('div', { class: 'card sec' }, [h('h2', { text: 'Schedule' }), h('p', { text: 'Optional. Times are in your computer\'s time zone. Agents see the due date on their card, and cannot start after it closes.' }),
        h('div', { class: 'fgrid' }, [field('Opens', opIn), field('Closes', clIn)])]));

      // Who takes it
      var whoSec = h('div', { class: 'card sec' }); left.appendChild(whoSec);
      function renderWho() {
        clear(whoSec);
        whoSec.appendChild(h('h2', { text: 'Who takes it' }));
        whoSec.appendChild(h('p', { text: 'Only assigned people see it. Guests must also be on the Access list.' }));
        var ev = toggle('Everyone with access', assign.everyone, 'All team members and guests.');
        ev.input.addEventListener('change', function () { assign.everyone = ev.input.checked; renderWho(); renderSide(); });
        whoSec.appendChild(ev);
        if (assign.everyone) return;
        var search = h('input', { class: 'inp', type: 'search', placeholder: 'Search people', 'aria-label': 'Search people', style: 'flex:1;min-width:180px' });
        var teams = []; people.forEach(function (p) { if (p.team && teams.indexOf(p.team) < 0) teams.push(p.team); }); teams.sort();
        var teamSel = h('select', { class: 'sel', 'aria-label': 'Team' }, [h('option', { value: '', text: 'All teams' })].concat(teams.map(function (t) { return h('option', { value: t, text: t }); })));
        var box = h('div', { class: 'people' });
        var allBtn = h('button', { class: 'btn sm', type: 'button', text: 'Select all shown' });
        function drawPeople() {
          clear(box);
          var term = search.value.toLowerCase();
          var shown = people.filter(function (p) { return (!term || (p.name + ' ' + p.email).toLowerCase().indexOf(term) >= 0) && (!teamSel.value || p.team === teamSel.value); });
          shown.forEach(function (p) {
            var cb = h('input', { type: 'checkbox', checked: assign.emails.indexOf(p.email) >= 0 ? true : null });
            cb.addEventListener('change', function () { var at = assign.emails.indexOf(p.email); if (cb.checked && at < 0) assign.emails.push(p.email); if (!cb.checked && at >= 0) assign.emails.splice(at, 1); countEl.textContent = assign.emails.length + ' selected'; renderSide(); });
            box.appendChild(h('label', null, [cb, h('div', { style: 'flex:1;min-width:0' }, [h('div', { text: p.name || p.email }), h('div', { class: 'e', text: p.email + (p.team ? ' · ' + p.team : '') })]), p.kind === 'guest' ? pill('Guest') : null]));
          });
          allBtn.onclick = function () { shown.forEach(function (p) { if (assign.emails.indexOf(p.email) < 0) assign.emails.push(p.email); }); drawPeople(); countEl.textContent = assign.emails.length + ' selected'; renderSide(); };
        }
        var countEl = h('span', { class: 'small muted', text: assign.emails.length + ' selected' });
        search.addEventListener('input', drawPeople); teamSel.addEventListener('change', drawPeople);
        whoSec.appendChild(h('div', { class: 'row', style: 'margin:6px 0 10px' }, [search, teamSel])); whoSec.appendChild(box);
        whoSec.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, [countEl, h('span', { class: 'spacer' }), allBtn, h('button', { class: 'btn sm ghost', type: 'button', text: 'Clear', onclick: function () { assign.emails = []; drawPeople(); countEl.textContent = '0 selected'; renderSide(); } })]));
        drawPeople();
      }
      renderWho();

      // Summary side
      var msg = h('div');
      function collect() {
        st.passPct = Number(passIn.value); st.attempts = Number(attIn.value); st.showScore = showT.input.checked;
        st.camera = camT.input.checked; st.watermark = wmT.input.checked ? 'subtle' : 'off'; st.shuffleQuestions = shQ.input.checked; st.shuffleOptions = shO.input.checked;
        st.prep = { summary: prep.summary, topics: prep.topics.filter(function (x) { return x.title && x.title.trim(); }) };
        return { title: title.value, description: desc.value, settings: st, questionIds: picked, assign: { everyone: assign.everyone, emails: assign.emails }, status: status };
      }
      function chatPost(btn, kind) {
        if (!id) { toast('Save the assessment first'); return; }
        btn.disabled = true;
        api('/api/assess/admin/tests/' + id + '/announce-preview?kind=' + kind)
          .then(function (pv) { announceDialog(id, kind, pv); })
          .catch(function (e) { toast(e.message); }).finally(function () { btn.disabled = false; });
      }
      function renderSide() {
        clear(side);
        var nQ = st.pool.mode === 'random' ? st.pool.count : picked.length;
        var mins = Math.max(1, Math.ceil((nQ * (Number(secIn.value) || 40) + Math.min(st.explainCount, nQ) * (st.explainSec || 90)) / 60));
        var statusSel = h('div', { class: 'seg', role: 'group', 'aria-label': 'Status' }, [['draft', 'Draft'], ['published', 'Published']].map(function (o) {
          return h('button', { type: 'button', 'aria-pressed': String(status === o[0]), text: o[1], onclick: function () { status = o[0]; renderSide(); } });
        }));
        var save = h('button', { class: 'btn primary', type: 'button', style: 'width:100%', text: 'Save' });
        save.addEventListener('click', function () {
          save.disabled = true; clear(msg);
          var body = collect();
          (id ? api('/api/assess/admin/tests/' + id, { method: 'PUT', body: body }) : api('/api/assess/admin/tests', { method: 'POST', body: body }))
            .then(function (res) { toast('Saved'); if (!id && res.id) { id = res.id; history.replaceState(null, '', '#edit/' + res.id); } save.disabled = false; })
            .catch(function (e) { msg.appendChild(errBox(e.message)); save.disabled = false; });
        });
        side.appendChild(h('div', { class: 'card pad stack' }, [
          h('h2', { text: 'Summary' }),
          h('div', null, [
            h('div', { class: 'sumrow' }, [h('span', { text: 'Questions' }), h('b', { text: nQ + (st.explainCount && nQ ? ' + ' + Math.min(st.explainCount, nQ) + ' written' : '') })]),
            h('div', { class: 'sumrow' }, [h('span', { text: 'Time' }), h('b', { text: 'About ' + mins + ' min' })]),
            st.repeat && st.repeat.mode !== 'none' ? h('div', { class: 'sumrow' }, [h('span', { text: 'Repeats' }), h('b', { text: st.repeat.mode === 'weekly' ? 'Weekly' : 'Monthly' })]) : null,
            h('div', { class: 'sumrow' }, [h('span', { text: 'Results' }), h('b', { text: { none: 'Not released', score: 'Score released', answers: 'Answers released' }[st.releaseMode || 'none'] })]),
            h('div', { class: 'sumrow' }, [h('span', { text: 'Assigned' }), h('b', { text: assign.everyone ? 'Everyone' : assign.emails.length + (assign.emails.length === 1 ? ' person' : ' people') })]),
          ]),
          h('div', null, [h('div', { class: 'small muted', style: 'margin-bottom:6px', text: 'Status' }), statusSel, h('div', { class: 'small muted', style: 'margin-top:6px', text: status === 'published' ? 'Assigned people can start it now.' : 'Hidden from agents until published.' })]),
          msg, save,
          h('button', { class: 'btn', type: 'button', style: 'width:100%', onclick: function (e) {
            if (!id) { toast('Save the assessment first, then preview it'); return; }
            var b = e.currentTarget; b.disabled = true;
            api('/api/assess/admin/tests/' + id + '/preview', { method: 'POST', body: {} }).then(function (start) { previewBack = 'edit/' + id; clear(main); renderNav(''); runExam(start, { id: id, title: start.title }); })
              .catch(function (er) { toast(er.message); }).then(function () { b.disabled = false; });
          } }, [icon('eye', 'sm'), 'Preview as an agent']),
          h('div', { class: 'small muted', style: 'margin-top:-4px', text: 'Uses the last saved version. Nothing is scored or kept.' }),
          id && status === 'published' && (!st.repeat || st.repeat.mode === 'none') ? h('div', { class: 'stack', style: 'gap:6px' }, [
            h('button', { class: 'btn', type: 'button', style: 'width:100%', onclick: function (e) { chatPost(e.currentTarget, 'announce'); } }, [icon('flag', 'sm'), 'Announce in Google Chat']),
            h('button', { class: 'btn', type: 'button', style: 'width:100%', onclick: function (e) { chatPost(e.currentTarget, 'remind'); } }, [icon('clock', 'sm'), 'Send a reminder']),
          ]) : null,
          id ? h('button', { class: 'btn ghost', type: 'button', style: 'width:100%', onclick: function () {
            api('/api/assess/admin/tests/' + id + '/duplicate', { method: 'POST', body: {} }).then(function (r) { toast('Copied as a draft'); go('edit/' + r.id); }).catch(function (e) { msg.appendChild(errBox(e.message)); });
          } }, [icon('copy', 'sm'), 'Duplicate']) : null,
          id ? h('button', { class: 'btn ghost danger', type: 'button', style: 'width:100%', onclick: function () {
            if (!confirm('Archive this assessment? Agents will no longer see it and results are kept. You can restore it, or delete it for good, from Assessments > Archived.')) return;
            api('/api/assess/admin/tests/' + id, { method: 'DELETE' }).then(function () { toast('Archived'); go('manage'); }).catch(function (e) { msg.appendChild(errBox(e.message)); });
          } }, [icon('trash', 'sm'), 'Archive']) : null,
        ]));
        if (id) side.appendChild(revBox);
      }
      // Reviewers for this assessment only: they can see and mark its results, nothing else
      var revBox = h('div', { class: 'card pad stack' });
      function loadRev() {
        clear(revBox);
        revBox.appendChild(h('div', { class: 'row', style: 'flex-direction:row;align-items:center;gap:8px;flex-wrap:nowrap' }, [icon('shield'), h('h2', { style: 'font-size:16px;margin:0', text: 'Reviewers for this assessment' })]));
        revBox.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'These people see results, answers and activity for this assessment only, and can mark written answers and save a verdict. They cannot edit it, retest or open anything else.' }));
        // Assessment-specific link to send to reviewers: opens this assessment's results after sign-in.
        var rvUrl = location.origin + '/assess#results/' + id;
        var rvIn = h('input', { class: 'inp', readonly: true, value: rvUrl, 'aria-label': 'Reviewer link for this assessment', onfocus: function () { rvIn.select(); } });
        revBox.appendChild(h('label', { class: 'small muted', style: 'margin:0', text: 'Link to send them' }));
        revBox.appendChild(h('div', { class: 'linkbox' }, [rvIn, h('button', { class: 'btn', type: 'button', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(rvUrl) : Promise.reject()).then(function () { toast('Reviewer link copied'); }).catch(function () { rvIn.select(); toast('Press Ctrl+C or Cmd+C to copy'); });
        } }, [icon('copy', 'sm'), 'Copy link'])]));
        revBox.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'They sign in with their @adit.com account and land on this assessment. It only works for people added below.' }));
        var rp = PeoplePicker({ label: 'Find people', placeholder: 'Type a name or email' });
        var list = h('div', { class: 'plist' });
        revBox.appendChild(rp.el);
        revBox.appendChild(h('button', { class: 'btn', type: 'button', text: 'Add reviewers', onclick: function () {
          var em = rp.selected(); if (!em.length) { toast('Pick at least one person'); return; }
          api('/api/assess/admin/tests/' + id + '/reviewers', { method: 'POST', body: { emails: em.join(',') } }).then(function (r) { toast(r.added + ' added'); loadRev(); }).catch(function (e) { toast(e.message); });
        } }));
        revBox.appendChild(list);
        api('/api/assess/admin/tests/' + id + '/reviewers').then(function (r) {
          if (!r.reviewers.length) list.appendChild(h('p', { class: 'small muted', text: 'No one yet. Global reviewers can already see everything.' }));
          r.reviewers.forEach(function (x) {
            list.appendChild(h('div', null, [h('span', { class: 'as-avatar', text: initials(x.email) }), h('div', { class: 'who' }, [h('b', { text: x.email }), h('span', { text: 'Added by ' + x.added_by })]),
              h('button', { class: 'btn sm ghost danger', type: 'button', text: 'Remove', onclick: function () { api('/api/assess/admin/tests/' + id + '/reviewers/' + encodeURIComponent(x.email), { method: 'DELETE' }).then(loadRev).catch(function (e) { toast(e.message); }); } })]));
          });
        }).catch(function () {});
      }
      if (id) loadRev();
      renderSide();
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }

  // ── Session 64: archived assessments: restore or delete for good ─────
  function viewArchived() {
    main.appendChild(pageHead('Archived assessments', 'Hidden from agents. Restore one to edit or reuse it, or delete it for good together with all of its results.', null, { text: 'Assessments', go: function () { go('manage'); } }));
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    api('/api/assess/admin/tests-archived').then(function (j) {
      clear(holder);
      if (!j.tests.length) { holder.appendChild(h('div', { class: 'empty' }, [art('inbox'), h('b', { text: 'Nothing archived' }), h('span', { text: 'Archive an assessment from its Edit page when you no longer need it.' })])); return; }
      var list = h('div', { class: 'grid-cards stagger' });
      j.tests.forEach(function (t) {
        list.appendChild(h('div', { class: 'card mcard arch' }, [
          h('div', { class: 'row', style: 'align-items:flex-start' }, [h('h2', { style: 'flex:1;font-size:16px', text: t.title }), pill('Archived', '', true)]),
          t.description ? h('p', { class: 'muted small', style: 'margin:0', text: t.description }) : null,
          h('div', { class: 'meta' }, [pill(t.attempts + (t.attempts === 1 ? ' attempt' : ' attempts')), pill('Archived ' + fmtDay(t.archivedAt))]),
          h('div', { class: 'row' }, [
            h('button', { class: 'btn sm', type: 'button', onclick: function (e) { e.currentTarget.disabled = true; api('/api/assess/admin/tests/' + t.id + '/restore', { method: 'POST', body: {} }).then(function () { toast('Restored as a draft'); go('edit/' + t.id); }).catch(function (er) { toast(er.message); }); } }, [icon('restore', 'sm'), 'Restore']),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm danger', type: 'button', onclick: function () { deleteForever(t); } }, [icon('trash', 'sm'), 'Delete for good']),
          ]),
        ]));
      });
      holder.appendChild(list);
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }
  function deleteForever(t) {
    var dlg = h('dialog', { class: 'confirm', 'aria-labelledby': 'df-t' });
    var inp = h('input', { class: 'inp', style: 'width:100%', 'aria-label': 'Type the assessment name', placeholder: t.title, autocomplete: 'off' });
    var ok = h('button', { class: 'btn primary danger-fill', type: 'button', disabled: true }, [icon('trash', 'sm'), 'Delete for good']);
    inp.addEventListener('input', function () { ok.disabled = inp.value.trim() !== t.title.trim(); });
    dlg.appendChild(h('div', { class: 'cf-in' }, [art('denied', 140), h('h2', { id: 'df-t', text: 'Delete "' + t.title + '" for good?' }),
      h('p', { text: 'This removes the assessment and all ' + t.attempts + ' attempt' + (t.attempts === 1 ? '' : 's') + ': answers, activity logs and camera photos. It cannot be undone. Questions stay in the bank.' }),
      h('p', { class: 'small muted', text: 'Type the name to confirm:' }), inp,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }), ok])]));
    dlg.addEventListener('close', function () { dlg.remove(); });
    ok.addEventListener('click', function () {
      ok.disabled = true;
      api('/api/assess/admin/tests/' + t.id + '/delete-forever', { method: 'POST', body: { confirm: inp.value } }).then(function () { dlg.close(); toast('Deleted'); route(); }).catch(function (e) { ok.disabled = false; toast(e.message); });
    });
    document.body.appendChild(dlg); dlg.showModal(); inp.focus();
  }

  // ── Session 65: announce / remind preview, webhook prompt, AI suggestion ──
  function announceDialog(testId, kind, pv) {
    var dlg = h('dialog', { class: 'confirm ann', 'aria-labelledby': 'an-t' });
    var isRem = kind === 'remind';
    var ta = h('textarea', { class: 'inp', rows: 7, style: 'width:100%;font:inherit;line-height:1.45', 'aria-label': 'Message to post' });
    ta.value = pv.text;
    var msg = h('div');
    var hook = h('input', { class: 'inp', style: 'width:100%', type: 'url', placeholder: 'https://chat.googleapis.com/v1/spaces/...', autocomplete: 'off', 'aria-label': 'Google Chat webhook URL' });
    var keep = h('input', { type: 'checkbox', checked: true, id: 'an-keep' });
    var aud = pv.audience.everyone ? 'Everyone on the team' : pv.audience.count + (pv.audience.count === 1 ? ' person' : ' people') + (pv.audience.names.length ? ': ' + pv.audience.names.slice(0, 6).join(', ') + (pv.audience.count > 6 ? ' and ' + (pv.audience.count - 6) + ' more' : '') : '');
    var tagNote = !pv.audience.everyone && pv.audience.count ? (pv.audience.tagged + ' of ' + pv.audience.count + ' can be @mentioned, the rest show as names.') : '';
    var ai = h('button', { class: 'btn sm', type: 'button' }, [icon('spark', 'sm'), 'Suggest with AI']);
    ai.addEventListener('click', function () {
      ai.disabled = true; clear(msg);
      api('/api/assess/admin/tests/' + testId + '/announce-suggest', { method: 'POST', body: { kind: kind } })
        .then(function (r) { ta.value = r.text; toast('Suggestion added, edit it if you like'); })
        .catch(function (e) { msg.appendChild(errBox(e.message)); }).finally(function () { ai.disabled = false; });
    });
    var reset = h('button', { class: 'btn ghost sm', type: 'button', text: 'Reset', onclick: function () { ta.value = pv.text; } });
    var send = h('button', { class: 'btn primary', type: 'button' }, [icon('flag', 'sm'), isRem ? 'Post reminder' : 'Post announcement']);
    if (pv.blocker) send.disabled = true;
    send.addEventListener('click', function () {
      clear(msg);
      var w = hook.value.trim();
      if (!pv.hasWebhook && !w) { msg.appendChild(errBox('Paste the Google Chat webhook URL first.')); hook.focus(); return; }
      send.disabled = true;
      api('/api/assess/admin/tests/' + testId + '/announce', { method: 'POST', body: { kind: kind, text: ta.value, webhook: w || undefined, saveWebhook: !!w && keep.checked } })
        .then(function (r) { dlg.close(); toast(r.sent ? 'Posted in Google Chat' + (r.tagged ? ', ' + r.tagged + ' tagged' : '') : (r.reason || 'Nothing to post')); })
        .catch(function (e) { send.disabled = false; msg.appendChild(errBox(e.message)); });
    });
    dlg.appendChild(h('div', { class: 'cf-in' }, [
      h('h2', { id: 'an-t', text: isRem ? 'Preview reminder' : 'Preview announcement' }),
      pv.blocker ? errBox(pv.blocker) : null,
      h('div', { class: 'small muted', text: 'Posts to Google Chat as this message. Edit it before sending.' }),
      h('div', { class: 'row', style: 'gap:8px;margin:8px 0 4px' }, [h('b', { class: 'small', text: 'Message' }), h('span', { class: 'spacer' }), ai, reset]),
      ta,
      h('div', { class: 'small', style: 'margin-top:8px' }, [h('b', { text: 'Audience: ' }), aud]),
      tagNote ? h('div', { class: 'small muted', text: tagNote }) : null,
      pv.hasWebhook
        ? h('div', { class: 'small muted', style: 'margin-top:6px', text: 'Sending to the saved webhook ' + pv.webhookHint })
        : h('div', { class: 'stack', style: 'gap:6px;margin-top:10px' }, [
            h('b', { class: 'small', text: 'No webhook saved yet' }), hook,
            h('label', { class: 'small row', for: 'an-keep', style: 'gap:6px;align-items:center' }, [keep, 'Save it for next time']),
            h('div', { class: 'small muted', text: 'In Google Chat: space name, Apps and integrations, Webhooks, create one and copy the URL.' })]),
      msg,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }), send])]));
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg); dlg.showModal();
  }

  // ── Session 64: send a retest (reset + optional Chat tag) ───────────
  // target: { attemptIds:[...], name, status } for one person, or
  //         { testId, below:true, count } for everyone below the pass mark
  // Pick who gets a retest: latest attempt per person that is not reset.
  function pickRetest(testId, at) {
    var latest = [], seen = {};
    at.forEach(function (a) { if (a.status === 'reset' || seen[a.email]) return; seen[a.email] = 1; latest.push(a); });
    var dlg = h('dialog', { class: 'confirm pick', 'aria-labelledby': 'pk-t' });
    var chosen = {};
    var okBtn = h('button', { class: 'btn primary', type: 'button', disabled: true }, [icon('arrowR', 'sm'), 'Next']);
    var count = h('span', { class: 'small muted', text: 'Nobody selected' });
    var all = h('input', { type: 'checkbox', 'aria-label': 'Select everyone' });
    function sync() { var n = Object.keys(chosen).length; okBtn.disabled = !n; count.textContent = n ? n + ' selected' : 'Nobody selected'; all.checked = n === latest.length && n > 0; }
    var boxes = [];
    var list = h('div', { class: 'pick-list' }, latest.map(function (a) {
      var cb = h('input', { type: 'checkbox' }); boxes.push([cb, a]);
      cb.addEventListener('change', function () { if (cb.checked) chosen[a.id] = a; else delete chosen[a.id]; sync(); });
      return h('label', { class: 'pick-row' }, [cb, h('span', { class: 'pick-who' }, [h('b', { text: a.name || a.email }), h('span', { text: a.email })]),
        a.status === 'submitted' ? (a.passed ? pill(a.pct + '%', 'ok') : pill(a.pct + '%', 'bad')) : a.status === 'stopped' ? pill('Stopped', 'bad') : pill('In progress', 'warn')]);
    }));
    all.addEventListener('change', function () { boxes.forEach(function (x) { x[0].checked = all.checked; if (all.checked) chosen[x[1].id] = x[1]; else delete chosen[x[1].id]; }); sync(); });
    dlg.appendChild(h('div', { class: 'cf-in' }, [
      h('h2', { id: 'pk-t', text: 'Who should take it again?' }),
      h('p', { text: 'Latest attempt for each person. Their attempt is kept in the results, marked Reset.' }),
      latest.length ? h('label', { class: 'pick-all' }, [all, h('b', { text: 'Everyone (' + latest.length + ')' })]) : null,
      latest.length ? list : h('p', { class: 'muted', text: 'Nobody to retest. Every attempt is already reset.' }),
      h('div', { class: 'row', style: 'margin-top:14px' }, [count, h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }), okBtn]),
    ]));
    dlg.addEventListener('close', function () { dlg.remove(); });
    okBtn.addEventListener('click', function () {
      var ids = Object.keys(chosen).map(Number), one = ids.length === 1 ? chosen[ids[0]] : null;
      dlg.close();
      retestFlow({ attemptIds: ids, name: one ? (one.name || one.email) : ids.length + ' people', status: one ? one.status : '' }, viewResultsReload);
    });
    document.body.appendChild(dlg); dlg.showModal();
  }
  function resetFlow(a, done) { retestFlow({ attemptIds: [a.id], name: a.name || a.email, status: a.status }, done); }
  function retestFlow(t, done) {
    var dlg = h('dialog', { class: 'confirm', 'aria-labelledby': 'rs-t' });
    var note = h('input', { class: 'inp', style: 'width:100%', maxlength: '300', placeholder: 'Message (optional), e.g. "Please retake after the refresher on Friday"', 'aria-label': 'Message' });
    var chat = h('input', { type: 'checkbox', id: 'rs-chat', checked: true });
    var okBtn = h('button', { class: 'btn primary', type: 'button' }, [icon('retest', 'sm'), t.below || (t.attemptIds && t.attemptIds.length > 1) ? 'Send retests' : 'Send retest']);
    var who = t.below ? (t.count + ' ' + (t.count === 1 ? 'person' : 'people') + ' below the pass mark') : t.name;
    dlg.appendChild(h('div', { class: 'cf-in' }, [
      art('pending', 150),
      h('h2', { id: 'rs-t', text: 'Send a retest to ' + who + '?' }),
      h('p', { text: (t.status === 'in_progress' ? 'Their test in progress is closed. ' : '') + 'Their latest attempt stays in the results, marked Reset, and stops counting toward scores and the attempts allowed. The test shows again as "Take again" on their list.' }),
      note,
      h('label', { class: 'chk', for: 'rs-chat', style: 'margin-top:10px' }, [chat, 'Tag ' + (t.below ? 'them' : 'them') + ' in the Google Chat space with a link']),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }), okBtn]),
    ]));
    dlg.addEventListener('close', function () { dlg.remove(); });
    okBtn.addEventListener('click', function () {
      okBtn.disabled = true;
      api('/api/assess/admin/retest', { method: 'POST', body: { attemptIds: t.attemptIds || [], testId: t.testId, below: !!t.below, note: note.value, notify: chat.checked } })
        .then(function (r) { dlg.close(); toast(r.reset ? ('Retest sent to ' + r.reset + (r.reset === 1 ? ' person' : ' people') + (r.notified ? ', tagged in Chat.' : (chat.checked && r.reason ? '. Chat: ' + r.reason : '.'))) : (r.reason || 'Nobody to retest')); done(); })
        .catch(function (e) { okBtn.disabled = false; toast(e.message); });
    });
    document.body.appendChild(dlg); dlg.showModal(); note.focus();
  }
  function viewResultsReload() { route(); }
  function printResults(title, at) {
    var rows = at.filter(function (a) { return a.status === 'submitted'; });
    var tb = h('tbody', null, rows.map(function (a) { return h('tr', null, [h('td', { text: a.name || a.email }), h('td', { text: a.pct != null ? a.score + '/' + a.maxScore + ' (' + a.pct + '%)' : '–' }), h('td', { text: a.passed ? 'Pass' : 'Below pass' }), h('td', { text: (TIER[a.tier] || ['–'])[0] }), h('td', { text: a.verdict ? VERDICT[a.verdict][0] : '' }), h('td', { text: fmtWhen(a.finishedAt) })]); }));
    var avg = rows.length ? Math.round(rows.reduce(function (s, a) { return s + (a.pct || 0); }, 0) / rows.length) : 0;
    printSheet(title, rows.length + ' submitted · average ' + avg + '% · pass rate ' + (rows.length ? Math.round(rows.filter(function (a) { return a.passed; }).length / rows.length * 100) : 0) + '%',
      [h('table', { class: 'pr-tbl' }, [h('thead', null, [h('tr', null, ['Agent', 'Score', 'Result', 'Behaviour', 'Verdict', 'Submitted'].map(function (x) { return h('th', { text: x }); }))]), tb])]);
  }
  function printAttempt(a) {
    var pct = a.maxScore ? Math.round(a.score / a.maxScore * 100) : 0;
    var nodes = [h('div', { class: 'pr-kpis' }, [['Score', a.score + ' / ' + a.maxScore + ' (' + pct + '%)'], ['Result', pct >= a.passPct ? 'Pass' : 'Below the ' + a.passPct + '% pass mark'], ['Behaviour', (TIER[(a.integrity || {}).tier] || ['–'])[0]], ['Verdict', a.verdict ? VERDICT[a.verdict][0] : 'Not set']].map(function (k) { return h('div', null, [h('span', { text: k[0] }), h('b', { text: k[1] })]); }))];
    if (a.notes) nodes.push(h('p', { class: 'pr-meta', text: 'Reviewer notes: ' + a.notes }));
    a.items.forEach(function (it, i) {
      if (it.kind === 'explain') { nodes.push(h('div', { class: 'pr-q' }, [h('div', { class: 'pr-qh' }, [h('b', { text: 'Written answer' })]), h('div', { class: 'pr-meta', text: it.about }), h('p', { text: it.text || 'Not answered' }), it.reviewScore != null ? h('div', { class: 'pr-key', text: 'Mark: ' + (it.reviewScore >= 1 ? 'Strong' : it.reviewScore > 0 ? 'Partial' : 'Weak') }) : null])); return; }
      nodes.push(h('div', { class: 'pr-q' + (it.correct ? ' ok' : ' bad') }, [h('div', { class: 'pr-qh' }, [h('b', { text: 'Q' + (it.idx + 1) + (it.correct ? ' ✓ ' : ' ✗ ') }), h('span', { text: it.prompt })]),
        h('div', { class: 'pr-meta', text: 'Their answer: ' + ((it.chosen && it.chosen.length) ? it.chosen.join(' | ') : 'No answer') }), it.correct ? null : h('div', { class: 'pr-key', text: 'Correct: ' + it.correctAnswer.join(' | ') }), it.explanation ? h('div', { class: 'pr-meta', text: 'Why: ' + it.explanation }) : null]));
    });
    printSheet((a.name || a.email) + ' · ' + a.testTitle, a.email + ' · submitted ' + fmtWhen(a.finishedAt), nodes);
  }

  // ── Reviewer: results ────────────────────────────────────────────────
  function viewResults(id) {
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    Promise.all([api('/api/assess/admin/tests'), api('/api/assess/admin/tests/' + id + '/attempts')]).then(function (r) {
      clear(holder);
      var t = r[0].tests.find(function (x) { return x.id === id; });
      var at = r[1].attempts;
      var latest = {}; at.forEach(function (a) { if (a.status === 'submitted' && !latest[a.email]) latest[a.email] = a; });
      var belowN = Object.keys(latest).filter(function (e) { return latest[e].passed === false; }).length;
      var printOnlyBtn = h('button', { class: 'btn', type: 'button', onclick: function () { printResults(t ? t.title : 'Results', at); } }, [icon('print', 'sm'), 'Print summary']);
      holder.appendChild(pageHead(t ? t.title : 'Results', 'Behaviour flags are signals to look into, not proof. Talk to the agent before acting on them.', !me.reviewer ? [printOnlyBtn] : [
        menu('Send a retest', 'retest', [
          belowN ? { label: 'Everyone below the pass mark', sub: belowN + (belowN === 1 ? ' person' : ' people') + ', based on their latest attempt.', icon: 'flag', onclick: function () { retestFlow({ testId: id, below: true, count: belowN }, viewResultsReload); } } : null,
          { label: 'Choose people', sub: 'Pick from everyone who has taken it.', icon: 'users', onclick: function () { pickRetest(id, at); } },
        ], 'primary'),
        menu('Download', 'download', [
          { label: 'Results (CSV)', sub: 'One row per attempt, with score, behaviour and verdict.', icon: 'doc', onclick: function () { location.href = '/api/assess/admin/results/export?tests=' + id + '&reset=1'; } },
          { label: 'Print summary', sub: 'Everyone\'s score on one page. Save as PDF from the print window.', icon: 'print', onclick: function () { printResults(t ? t.title : 'Results', at); } },
        ]),
        h('button', { class: 'btn', type: 'button', onclick: function () { go('reports?tests=' + id); } }, [icon('chart', 'sm'), 'Report']),
        h('button', { class: 'btn', type: 'button', onclick: function () { go('edit/' + id); } }, [icon('edit', 'sm'), 'Edit']),
      ], { text: 'Assessments', go: function () { go('manage'); } }));
      var done = at.filter(function (a) { return a.status === 'submitted'; });
      var resetN = at.filter(function (a) { return a.status === 'reset'; }).length;
      var active = at.filter(function (a) { return a.status !== 'reset'; });
      var stopN = at.filter(function (a) { return a.status === 'stopped'; }).length;
      var avg = done.length ? Math.round(done.reduce(function (s, a) { return s + (a.pct || 0); }, 0) / done.length) : null;
      var pass = done.length ? Math.round(done.filter(function (a) { return a.passed; }).length / done.length * 100) : null;
      var review = at.filter(function (a) { return a.status === 'submitted' && (a.unmarked > 0 || !a.verdict); }).length;
      holder.appendChild(h('dl', { class: 'stats' }, [
        h('div', { class: 'card stat' }, [h('dt', { text: 'Submitted' }), h('dd', null, [String(done.length), active.length > done.length + stopN ? h('small', { text: '  ' + (active.length - done.length - stopN) + ' in progress' }) : null, stopN ? h('small', { text: '  ' + stopN + ' stopped' }) : null, resetN ? h('small', { text: '  ' + resetN + ' reset' }) : null])]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Average score' }), h('dd', { text: avg != null ? avg + '%' : '–' })]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Pass rate' }), h('dd', { text: pass != null ? pass + '%' : '–' })]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Needs your review' }), h('dd', { text: String(review) })]),
      ]));
      if (!at.length) { holder.appendChild(h('div', { class: 'empty' }, [art('people'), h('b', { text: 'No attempts yet' }), h('span', { text: 'Results appear here as agents submit.' })])); return; }
      if (hashQuery().get('retest')) { history.replaceState(null, '', '#results/' + id); pickRetest(id, at); }
      var tb = h('tbody');
      var dsel = [], bulkBar = h('div');
      function paintBulk() {
        clear(bulkBar);
        if (!me.owner || !dsel.length) return;
        var del = h('button', { class: 'btn', type: 'button', style: 'background:var(--bad);border-color:var(--bad);color:#fff' }, [icon('trash', 'sm'), 'Delete ' + dsel.length + ' result' + (dsel.length === 1 ? '' : 's')]);
        del.addEventListener('click', function () {
          if (!confirm('Delete ' + dsel.length + ' result' + (dsel.length === 1 ? '' : 's') + ' completely? Answers, activity logs and camera photos are removed for good and they disappear from reports. Sending a retest is usually better because it keeps the record. This cannot be undone.')) return;
          del.disabled = true;
          api('/api/assess/admin/attempts/delete', { method: 'POST', body: { ids: dsel } }).then(function (r) { toast(r.deleted + ' result' + (r.deleted === 1 ? '' : 's') + ' deleted'); viewResultsReload(); }).catch(function (e) { del.disabled = false; toast(e.message); });
        });
        bulkBar.appendChild(h('div', { class: 'bulk' }, [h('b', { text: dsel.length + ' selected' }), h('span', { class: 'spacer' }), del, h('button', { class: 'btn', type: 'button', text: 'Clear', onclick: function () { dsel.length = 0; Array.prototype.forEach.call(tb.querySelectorAll('input[type=checkbox]'), function (c) { c.checked = false; }); paintBulk(); } })]));
      }
      holder.appendChild(bulkBar);
      at.forEach(function (a, ri) {
        var dcb = null;
        if (me.owner) {
          dcb = h('input', { type: 'checkbox', 'aria-label': 'Select result for ' + (a.name || a.email) });
          dcb.addEventListener('click', function (e) { e.stopPropagation(); });
          dcb.addEventListener('change', function () { var k = dsel.indexOf(a.id); if (dcb.checked && k < 0) dsel.push(a.id); if (!dcb.checked && k >= 0) dsel.splice(k, 1); paintBulk(); });
        }
        var resetBtn = (a.status === 'reset' || !me.reviewer) ? null : h('button', { class: 'btn sm ghost', type: 'button', title: 'Send ' + (a.name || a.email) + ' a retest', onclick: function (e) {
          e.stopPropagation(); resetFlow(a, function () { viewResultsReload(); });
        } }, [icon('retest', 'sm'), 'Retest']);
        var tr = h('tr', { class: 'click' + (a.status === 'reset' ? ' is-reset' : ''), tabindex: '0', style: '--i:' + Math.min(ri, 12) }, [
          me.owner ? h('td', { style: 'width:34px' }, [dcb]) : null,
          h('td', null, [h('b', { style: 'font-weight:500', text: a.name || a.email }), h('span', { class: 'sub', text: a.email })]),
          h('td', null, [a.status === 'reset' ? pill('Reset', '', true) : a.status === 'stopped' ? pill('Stopped: camera', 'bad', true) : a.status === 'submitted' ? (a.passed ? pill('Pass', 'ok') : pill('Below pass', 'bad')) : pill('In progress ' + a.progress, 'warn'),
            a.reset ? h('span', { class: 'sub', title: 'Reset by ' + a.reset.by + ' · ' + fmtWhen(a.reset.at), text: 'by ' + String(a.reset.by || '').split('@')[0] + ' · ' + new Date(a.reset.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }) : null]),
          h('td', null, [a.pct != null ? h('div', { class: 'scorebar' }, [h('div', { class: 'b' }, [h('i', { style: 'width:' + a.pct + '%' })]), h('span', { class: 'num', text: a.score + '/' + a.maxScore + ' · ' + a.pct + '%' })]) : h('span', { class: 'muted', text: '–' })]),
          h('td', null, [tierPill(a.tier), a.flags && a.flags.length ? h('span', { class: 'sub', text: a.flags.slice(0, 2).join(', ') + (a.flags.length > 2 ? '…' : '') }) : null]),
          h('td', null, [a.unmarked ? pill(a.unmarked + ' to mark', 'accent') : (a.writtenPct != null ? h('span', { class: 'num', text: a.writtenPct + '%' }) : h('span', { class: 'muted', text: '–' }))]),
          h('td', null, [a.verdict ? pill(VERDICT[a.verdict][0], VERDICT[a.verdict][1]) : h('span', { class: 'muted', text: '–' })]),
          (function () { var w = fmtWhen(a.finishedAt || a.startedAt), k = w.indexOf(', '); return h('td', { class: 'num' }, k > 0 ? [w.slice(0, k), h('span', { class: 'sub', text: w.slice(k + 2) })] : [w]); })(),
          h('td', { class: 'act' }, [resetBtn]),
        ]);
        tr.addEventListener('click', function () { go('attempt/' + a.id); });
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go('attempt/' + a.id); });
        tb.appendChild(tr);
      });
      holder.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
        h('thead', null, [h('tr', null, (me.owner ? [''] : []).concat(['Agent', 'Result', 'Score', 'Behaviour', 'Written', 'Verdict', 'When', '']).map(function (x) { return h('th', { scope: 'col', text: x }); }))]), tb])]));
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }

  var EVENT_LABELS = { started: 'Started', submitted: 'Submitted', hidden: 'Left the test tab', visible: 'Came back to the tab', blur: 'Clicked outside the window', focus: 'Note', fullscreen_exit: 'Left full screen', fullscreen_enter: 'Back in full screen',
    copy: 'Tried to copy', cut: 'Tried to cut', paste: 'Tried to paste', contextmenu: 'Right-click', printscreen: 'Pressed Print Screen', devtools_key: 'Developer tools key', print: 'Tried to print', mouse_out: 'Mouse left the window',
    replay: 'Replayed the question', timeout: 'Timed out', resumed: 'Reopened in another tab', locked: 'Test locked', unlocked: 'Test unlocked', reserved: 'Reloaded the question', resize: 'Window resized', select: 'Selected text',
    camera_on: 'Camera on', camera_off: 'Camera stopped', camera_denied: 'Camera not allowed', multi_screen: 'Second screen connected', auto_submit: 'Submitted automatically',
    face_missing: 'Face not in view', face_back: 'Face back in view', face_multi: 'More than one face', camera_dark: 'Camera covered or dark', face_check_off: 'Face check unavailable', camera_stop: 'Test stopped: camera rules', nav: 'Moved to another question', reset: 'Reset by a reviewer', submitted_by: 'Submitted' };
  var EVENT_LEVEL = { locked: 'bad', unlocked: 'warn', face_missing: 'warn', face_multi: 'bad', camera_dark: 'bad', reset: 'warn', hidden: 'warn', fullscreen_exit: 'warn', paste: 'bad', copy: 'warn', printscreen: 'bad', devtools_key: 'bad', camera_off: 'bad', camera_denied: 'bad', camera_stop: 'bad', multi_screen: 'warn', resumed: 'warn', reserved: 'warn', timeout: 'warn' };

  function viewAttempt(id) {
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    api('/api/assess/admin/attempts/' + id).then(function (j) {
      clear(holder);
      var a = j.attempt, integ = a.integrity || { tier: null, flags: [] };
      var pct = a.maxScore ? Math.round(a.score / a.maxScore * 100) : null;
      holder.appendChild(pageHead(a.name || a.email, a.testTitle + ' · ' + a.email + (a.extraPct ? ' · +' + a.extraPct + '% time' : '') + ' · ' + (a.navigation === 'bank' ? 'Back and forth' : 'One way'), [
        a.status !== 'reset' && me.reviewer ? h('button', { class: 'btn', type: 'button', onclick: function () { resetFlow({ id: a.id, name: a.name, email: a.email, status: a.status }, function () { go('results/' + a.testId); }); } }, [icon('retest', 'sm'), 'Send a retest']) : null,
        a.status === 'submitted' ? h('button', { class: 'btn', type: 'button', onclick: function () { printAttempt(a); } }, [icon('print', 'sm'), 'Print']) : null,
        !me.owner ? null : h('button', { class: 'btn ghost danger', type: 'button', onclick: function (e) {
          if (!confirm('Delete this attempt for ' + (a.name || a.email) + ' completely? Their answers, activity log and photos are removed for good. Reset is usually better, because it keeps the record.')) return;
          e.currentTarget.disabled = true;
          api('/api/assess/admin/attempts/' + a.id, { method: 'DELETE' }).then(function () { toast('Attempt deleted'); go('results/' + a.testId); }).catch(function (er) { toast(er.message); });
        } }, [icon('trash', 'sm'), 'Delete']),
      ], { text: 'Results', go: function () { go('results/' + a.testId); } }));
      if (a.locked) holder.appendChild(h('div', { class: 'alert warn' }, [icon('shield'), h('span', { text: 'Locked since ' + fmtWhen(a.lockedAt) + ' because the agent left full screen. Their timer is paused. Unlock it and they carry on from the same question with the same time left.' }), h('span', { class: 'spacer' }), canUnlock() ? unlockBtn(a.id, function () { go('attempt/' + a.id); }, 'Unlock and continue') : null]));
      if (a.reset) holder.appendChild(h('div', { class: 'alert warn' }, [icon('replay'), h('span', { text: 'Reset by ' + a.reset.by + ' on ' + fmtWhen(a.reset.at) + (a.reset.note ? ': ' + a.reset.note : '') + '. This attempt does not count toward scores or attempts.' })]));
      holder.appendChild(h('dl', { class: 'stats' }, [
        h('div', { class: 'card stat' }, [h('dt', { text: 'Score' }), h('dd', null, [a.score != null ? a.score + ' / ' + a.maxScore : 'In progress', pct != null ? h('small', { text: '  ' + pct + '%' }) : null])]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Result' }), h('dd', null, [pct == null ? '–' : (pct >= a.passPct ? pill('Pass', 'ok') : pill('Below pass (' + a.passPct + '%)', 'bad'))])]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Behaviour' }), h('dd', null, [tierPill(integ.tier)])]),
        h('div', { class: 'card stat' }, [h('dt', { text: 'Started' }), h('dd', { style: 'font-size:14px;font-weight:500', text: fmtWhen(a.startedAt) })]),
      ]));
      // Reviewer verdict and notes (for the verbal follow-up round)
      var verdict = a.verdict || '';
      var vSeg = h('div', { class: 'markseg', role: 'group', 'aria-label': 'Verdict' });
      [['cleared', 'Cleared', 's'], ['follow_up', 'Needs follow-up', 'p'], ['concern', 'Concern', 'w']].forEach(function (v) {
        vSeg.appendChild(h('button', { type: 'button', class: v[2], 'data-v': v[0], 'aria-pressed': String(verdict === v[0]), text: v[1], onclick: function () { verdict = verdict === v[0] ? '' : v[0]; Array.prototype.forEach.call(vSeg.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === verdict)); }); } }));
      });
      var notes = h('textarea', { class: 'ta', 'aria-label': 'Reviewer notes', placeholder: 'Notes from the verbal round: which answers you asked about, how well they explained them.', style: 'min-height:70px' }); notes.value = a.notes || '';
      holder.appendChild(h('div', { class: 'card pad stack', style: 'margin-bottom:18px' }, [
        h('div', { class: 'row' }, [h('h2', { text: 'Your verdict' }), a.reviewedBy ? h('span', { class: 'small muted', text: 'Last saved by ' + a.reviewedBy + ' · ' + fmtWhen(a.reviewedAt) }) : null]),
        vSeg, notes,
        h('div', { class: 'row' }, [h('span', { class: 'spacer' }), h('button', { class: 'btn primary sm', type: 'button', text: 'Save verdict', onclick: function () {
          api('/api/assess/admin/attempts/' + a.id + '/review', { method: 'PUT', body: { verdict: verdict, notes: notes.value } }).then(function () { toast('Verdict saved'); }).catch(function (e) { toast(e.message); });
        } })]),
      ]));
      var tabsEl = h('div', { class: 'tabs', role: 'tablist' }), panel = h('div');
      var tabs = [['answers', 'Answers'], ['behaviour', 'Behaviour'], ['activity', 'Activity log']];
      if (a.canSeePhotos && (a.camera || (a.snapshots && a.snapshots.length))) tabs.push(['camera', 'Camera photos (' + a.snapshots.length + ')']);
      function show(k) {
        Array.prototype.forEach.call(tabsEl.children, function (b) { b.setAttribute('aria-selected', String(b.dataset.k === k)); });
        clear(panel);
        if (k === 'answers') answers(); else if (k === 'behaviour') behaviour(); else if (k === 'activity') activity(); else camera();
      }
      tabs.forEach(function (tb) { tabsEl.appendChild(h('button', { type: 'button', role: 'tab', 'data-k': tb[0], text: tb[1], onclick: function () { show(tb[0]); } })); });
      holder.appendChild(tabsEl); holder.appendChild(panel);

      function answers() {
        a.items.forEach(function (it) {
          if (it.kind === 'explain') {
            var note = h('input', { class: 'inp', 'aria-label': 'Note', placeholder: 'Note for yourself (optional)', value: it.reviewNote || '', style: 'flex:1;min-width:200px' });
            var mark = it.reviewScore == null ? '' : String(it.reviewScore);
            var seg = h('div', { class: 'markseg', role: 'group', 'aria-label': 'Mark' });
            [['1', 'Strong', 's'], ['0.5', 'Partial', 'p'], ['0', 'Weak', 'w']].forEach(function (m) {
              seg.appendChild(h('button', { type: 'button', class: m[2], 'aria-pressed': String(mark === m[0]), text: m[1], onclick: function () { mark = m[0]; Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b.textContent === m[1])); }); } }));
            });
            var why = h('div', { class: 'small muted', style: 'flex-basis:100%' });
            var sug = me.ai && (me.ai.anthropic || me.ai.openai) && it.text ? h('button', { class: 'btn sm', type: 'button', onclick: function (e) {
              var b = e.currentTarget; b.disabled = true; why.textContent = 'Asking the AI…';
              api('/api/assess/admin/attempts/' + a.id + '/explain/' + it.idx + '/suggest', { method: 'POST', body: {} }).then(function (r) {
                mark = r.mark; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute('aria-pressed', String(x.textContent === r.label)); });
                why.textContent = 'Suggested ' + r.label + ': ' + r.reason + ' Check it, then save.';
              }).catch(function (er) { why.textContent = er.message; }).finally(function () { b.disabled = false; });
            } }, [icon('spark', 'sm'), 'Suggest a mark']) : null;
            var sv = h('button', { class: 'btn sm primary', type: 'button', text: 'Save mark', onclick: function () {
              api('/api/assess/admin/attempts/' + a.id + '/explain/' + it.idx, { method: 'PUT', body: { score: mark, note: note.value } }).then(function () { toast('Mark saved'); }).catch(function (e) { toast(e.message); });
            } });
            panel.appendChild(h('div', { class: 'card item' }, [
              h('div', { class: 'hd' }, [h('b', { text: 'Written answer' }), it.late ? pill('Timed out', 'bad') : null, h('span', { class: 'small muted', text: it.elapsedMs != null ? secs(it.elapsedMs) : '' })]),
              h('div', { class: 'about small', text: it.about }),
              h('div', { class: 'q', style: 'white-space:pre-wrap;font-weight:400', text: it.text || (it.answered ? '(left empty)' : 'Not answered') }),
              h('div', { class: 'row' }, [seg, note, sug, sv, why]),
            ]));
            return;
          }
          var status = it.correct ? pill('Correct', 'ok') : it.late ? pill('Timed out', 'bad') : it.answered ? pill('Wrong', 'bad') : pill('Not answered', 'bad');
          var ansList = h('div', { class: 'ans' });
          (it.chosen && it.chosen.length ? it.chosen : ['No answer']).forEach(function (c) {
            var right = it.correctAnswer.indexOf(c) >= 0;
            ansList.appendChild(h('div', { class: right ? 'right' : 'wrong' }, [icon(right ? 'check' : 'x', 'sm'), h('span', null, [h('span', { class: 'muted', text: 'Their answer: ' }), c])]));
          });
          if (!it.correct) it.correctAnswer.forEach(function (c) { if (!(it.chosen || []).includes(c)) ansList.appendChild(h('div', { class: 'right' }, [icon('check', 'sm'), h('span', null, [h('span', { class: 'muted', text: 'Correct answer: ' }), c])])); });
          panel.appendChild(h('div', { class: 'card item' }, [
            h('div', { class: 'hd' }, [h('b', { text: 'Q' + (it.idx + 1) }), status, it.flagged ? pill('Flagged by agent', 'accent') : null, h('span', { class: 'small muted', text: (it.elapsedMs != null ? secs(it.elapsedMs) : '') + (it.replays ? ' · replayed ' + it.replays + 'x' : '') + (it.visits > 1 ? ' · opened ' + it.visits + 'x' : '') })]),
            h('div', { class: 'q', text: it.prompt }), ansList,
            it.explanation ? h('p', { class: 'small muted', style: 'margin:10px 0 0', text: 'Why: ' + it.explanation }) : null,
          ]));
        });
      }
      function behaviour() {
        panel.appendChild(h('div', { class: 'card pad stack' }, [
          h('div', { class: 'row' }, [h('h2', { text: 'Behaviour' }), tierPill(integ.tier)]),
          h('p', { class: 'muted', style: 'margin:0', text: 'These are signals, not proof. A dropped connection or a notification can explain a tab switch. Ask the agent to talk you through two or three answers before drawing a conclusion.' }),
          integ.flags && integ.flags.length ? h('ul', { class: 'flags' }, integ.flags.map(function (f) { return h('li', null, [h('span', { class: 'lv ' + (f.level || 'some') }), h('span', { text: f.text })]); })) : h('p', { text: 'Nothing unusual was logged.' }),
        ]));
        behaviourDetail();
      }
      // What the agent did, behaviour by behaviour: how often, on which questions, when, and time away.
      function behaviourDetail() {
        var t0 = toDate(a.startedAt), tEnd = toDate(a.finishedAt) || new Date();
        function into(e) { var d = toDate(e.at); if (!d || !t0) return ''; var s = Math.max(0, Math.round((d - t0) / 1000)); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; }
        function dur(s) { s = Math.round(s); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; }
        var G = [
          { label: 'Left the test tab', types: ['hidden'], end: 'visible', lv: 'warn' },
          { label: 'Left full screen', types: ['fullscreen_exit'], end: 'fullscreen_enter', lv: 'warn' },
          { label: 'Test locked after leaving full screen', types: ['locked'], end: 'unlocked', lv: 'bad' },
          { label: 'Clicked outside the test window', types: ['blur'], lv: 'warn', minus: 'hidden' },
          { label: 'Tried to paste', types: ['paste'], lv: 'bad' },
          { label: 'Tried to copy or cut', types: ['copy', 'cut'], lv: 'warn' },
          { label: 'Pressed Print Screen', types: ['printscreen'], lv: 'bad' },
          { label: 'Tried developer tools', types: ['devtools_key'], lv: 'bad' },
          { label: 'Right-clicked', types: ['contextmenu'], lv: 'info' },
          { label: 'Second screen connected', types: ['multi_screen'], lv: 'warn' },
          { label: 'Camera not allowed or stopped', types: ['camera_denied', 'camera_off'], lv: 'bad' },
          { label: 'Face out of view', types: ['face_missing'], end: 'face_back', lv: 'warn', endSecs: true },
          { label: 'More than one face', types: ['face_multi'], lv: 'bad' },
          { label: 'Camera covered or too dark', types: ['camera_dark'], lv: 'bad' },
          { label: 'Opened the test in another tab', types: ['resumed'], lv: 'warn' },
          { label: 'Reloaded a question', types: ['reserved'], lv: 'warn' },
          { label: 'Replayed a question', types: ['replay'], lv: 'info' }];
        var evs = a.events || [], rows = [], clean = [];
        G.forEach(function (g) {
          var hits = evs.filter(function (e) { return g.types.indexOf(e.type) >= 0; });
          var n = hits.length;
          if (g.minus) n = Math.max(0, n - evs.filter(function (e) { return e.type === g.minus; }).length);
          if (!n) { if (g.lv !== 'info') clean.push(g.label); return; }
          var qs = []; hits.forEach(function (e) { if (e.idx != null && qs.indexOf(e.idx + 1) < 0) qs.push(e.idx + 1); }); qs.sort(function (x, y) { return x - y; });
          var away = null;
          if (g.end) {
            away = 0; var open = null;
            evs.forEach(function (e) {
              var d = toDate(e.at); if (!d) return;
              if (g.types.indexOf(e.type) >= 0 && open == null) open = d;
              else if (e.type === g.end) {
                if (g.endSecs) { var m = /(\d+)s/.exec(e.detail || ''); if (m) away += Number(m[1]); open = null; }
                else if (open != null) { away += (d - open) / 1000; open = null; }
              }
            });
            if (open != null && !g.endSecs) away += Math.max(0, (tEnd - open) / 1000);
          }
          rows.push({ g: g, n: n, qs: qs, first: hits[0], last: hits[hits.length - 1], away: away });
        });
        var card = h('div', { class: 'card pad stack', style: 'margin-top:16px' }, [h('h2', { style: 'font-size:16px;margin:0', text: 'What the agent did' })]);
        if (!rows.length) card.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'No tab switches, copy or paste attempts, screen changes or camera issues were logged.' }));
        else {
          card.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
            h('thead', null, [h('tr', null, ['Behaviour', 'Times', 'On questions', 'When (into the test)', 'Time away'].map(function (x) { return h('th', { scope: 'col', text: x }); }))]),
            h('tbody', null, rows.map(function (r) {
              var when = into(r.first) + (r.n > 1 ? ' to ' + into(r.last) : '');
              return h('tr', null, [h('td', null, [h('span', { class: 'lv ' + (r.g.lv === 'bad' ? 'major' : r.g.lv === 'warn' ? 'some' : ''), style: 'display:inline-block;margin-right:8px' }), r.g.label]), h('td', { text: String(r.n) }),
                h('td', { text: r.qs.length ? r.qs.map(function (q) { return 'Q' + q; }).join(', ') : 'Not tied to a question' }), h('td', { text: when || '-' }), h('td', { text: r.away != null && r.away > 0 ? dur(r.away) : '-' })]);
            }))])]));
        }
        if (clean.length) card.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'Checked, nothing logged: ' + clean.join(', ') + '.' }));
        panel.appendChild(card);
      }
      function activity() {
        var tl = h('ul', { class: 'tl' });
        a.events.forEach(function (e) {
          tl.appendChild(h('li', { class: EVENT_LEVEL[e.type] || '' }, [h('time', { text: fmtWhen(e.at) + (e.idx != null ? ' · item ' + (e.idx + 1) : '') }), h('span', { text: (EVENT_LABELS[e.type] || e.type) + (e.detail ? ' (' + e.detail + ')' : '') })]));
        });
        panel.appendChild(h('div', { class: 'card pad' }, [a.events.length ? tl : h('p', { class: 'muted', text: 'No events.' }), a.ua ? h('p', { class: 'small muted', style: 'margin:12px 0 0', text: 'Browser: ' + a.ua }) : null]));
      }
      function camera() {
        if (!a.snapshots.length) { panel.appendChild(h('div', { class: 'empty' }, [art('radar'), h('b', { text: 'No photos' }), h('span', { text: 'The camera was not allowed, or the attempt ended before the first photo.' })])); return; }
        panel.appendChild(h('div', { class: 'alert info' }, [icon('shield'), h('span', { text: 'Stored in the tool\'s own database on its server, not in Google Drive or on anyone\'s computer. Only you can open them (other reviewers cannot), and they are deleted automatically after the number of days set on the Access page.' })]));
        panel.appendChild(h('div', { class: 'row', style: 'margin-bottom:12px' }, [h('span', { class: 'small muted', text: a.snapshots.length + ' photos' }), h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm danger', type: 'button', onclick: function () {
            if (!confirm('Delete all camera photos for this attempt? This cannot be undone.')) return;
            api('/api/assess/admin/attempts/' + a.id + '/snapshots', { method: 'DELETE' }).then(function (r) { toast(r.deleted + ' photos deleted'); a.snapshots = []; show('camera'); }).catch(function (e) { toast(e.message); });
          } }, [icon('trash', 'sm'), 'Delete these photos'])]));
        var grid = h('div', { class: 'snaps' });
        a.snapshots.forEach(function (sn) {
          var src = '/api/assess/admin/snapshots/' + sn.id;
          grid.appendChild(h('button', { type: 'button', 'aria-label': 'Photo at ' + fmtWhen(sn.at), onclick: function () {
            var lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Photo', onclick: function () { lb.remove(); } }, [h('img', { src: src, alt: 'Camera photo at ' + fmtWhen(sn.at) })]);
            document.body.appendChild(lb);
          } }, [h('span', { class: 'snap-img' }, [h('img', { src: src, alt: '', loading: 'lazy' }), sn.faces != null && sn.faces !== 1 ? h('em', { class: 'snap-tag ' + (sn.faces === 0 ? 'warn' : 'bad'), text: sn.faces === 0 ? 'No face' : sn.faces + ' faces' }) : null]), h('span', { text: fmtWhen(sn.at) + (sn.idx != null ? ' · item ' + (sn.idx + 1) : '') })]));
        });
        panel.appendChild(grid);
      }
      show('answers');
    }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
  }

  // ── Reviewer: live monitoring (Session 60) ───────────────────────────
  var liveTimer = null;
  function viewLive() {
    clearInterval(liveTimer);
    main.appendChild(pageHead('Live', 'Everyone taking an assessment right now. Updates every 5 seconds.'));
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    var stamp = h('p', { class: 'small muted', style: 'margin-top:10px' });
    function fmtS(n) { if (n == null) return '–'; n = Math.max(0, n); return n >= 60 ? Math.floor(n / 60) + 'm ' + (n % 60) + 's' : n + 's'; }
    function load() {
      if (location.hash !== '#live') { clearInterval(liveTimer); return; }
      if (document.hidden) return;
      api('/api/assess/admin/live').then(function (j) {
        clear(holder);
        if (!j.live.length) {
          holder.appendChild(h('div', { class: 'empty' }, [art('people'), h('b', { text: 'Nobody is taking an assessment right now' }), h('span', { text: 'Attempts appear here the moment someone starts.' })]));
        } else {
          var tb = h('tbody');
          j.live.forEach(function (a) {
            var idle = a.idleSec > 150;
            var pct = Math.round(a.progress / Math.max(1, a.total) * 100);
            var tr = h('tr', { class: 'click', tabindex: '0' }, [
              h('td', null, [h('b', { style: 'font-weight:500', text: a.name || a.email }), h('span', { class: 'sub', text: a.title })]),
              h('td', null, [h('div', { class: 'scorebar' }, [h('div', { class: 'b' }, [h('i', { style: 'width:' + pct + '%' })]), h('span', { class: 'num', text: a.progress + '/' + a.total + (a.onReview ? ' · reviewing' : a.onWritten ? ' · writing' : '') })])]),
              h('td', { class: 'num', text: a.leftSec != null && a.leftSec > 0 ? fmtS(a.leftSec) + ' left' + (a.locked ? ' (paused)' : '') : '–' }),
              h('td', null, [a.locked ? h('div', { class: 'row', style: 'align-items:center;gap:8px;flex-wrap:nowrap' }, [pill('Locked', 'bad', true), canUnlock() ? unlockBtn(a.id, load) : null]) : idle ? pill('No activity ' + fmtS(a.idleSec), 'warn', true) : pill('Active', 'ok', true)]),
              h('td', null, [tierPill(a.tier), a.flags.length ? h('span', { class: 'sub', text: a.flags.slice(0, 2).join(', ') }) : null]),
              h('td', { class: 'num', text: fmtWhen(a.startedAt) }),
            ]);
            tr.addEventListener('click', function () { go('attempt/' + a.id); });
            tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go('attempt/' + a.id); });
            tb.appendChild(tr);
          });
          holder.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', null, [h('tr', null, ['Agent', 'Progress', 'This question', 'Status', 'Behaviour so far', 'Started'].map(function (x) { return h('th', { scope: 'col', text: x }); }))]), tb])]));
        }
        stamp.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        holder.appendChild(stamp);
      }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
    }
    load();
    liveTimer = setInterval(load, 5000);
  }

  // ── Reviewer: insights (Session 60) ──────────────────────────────────
  function viewInsights(host) {
    var M = host || main;
    var months = [['', 'All time']];
    var d = new Date();
    for (var i = 0; i < 6; i++) {
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push([m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'), m.toLocaleString('en-US', { month: 'long', year: 'numeric' })]);
    }
    var sel = h('select', { class: 'sel', 'aria-label': 'Period' }, months.map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
    var exp = h('a', { class: 'btn', href: '/api/assess/admin/insights/export' }, [icon('download', 'sm'), 'Export CSV']);
    M.appendChild(host ? h('div', { class: 'toolbar' }, [h('span', { class: 'small muted', style: 'flex:1;min-width:240px', text: 'Topic scores per agent, by month. The CSV can feed your bonus or QA sheets.' }), sel, exp])
      : pageHead('Insights', 'Strengths and gaps by topic across all submitted assessments. The CSV has one row per agent (average score, topic scores, concern verdicts) and can feed your bonus or QA sheets.', [sel, exp]));
    var holder = h('div'); M.appendChild(holder);
    function cls(p) { return p >= 75 ? 'ok' : p >= 50 ? 'warn' : 'bad'; }
    function load() {
      clear(holder); holder.appendChild(skeleton());
      exp.setAttribute('href', '/api/assess/admin/insights/export' + (sel.value ? '?month=' + sel.value : ''));
      api('/api/assess/admin/insights' + (sel.value ? '?month=' + sel.value : '')).then(function (j) {
        clear(holder);
        if (!j.agents.length) { holder.appendChild(h('div', { class: 'empty' }, [art('radar'), h('b', { text: 'No submitted assessments in this period' }), h('span', { text: 'Topic insights need questions with tags.' })])); return; }
        if (j.tags.length) {
          var tc = h('div', { class: 'card pad stack', style: 'margin-bottom:16px' }, [h('h2', { text: 'Team by topic' }), h('p', { class: 'small muted', style: 'margin:0', text: 'Share of answers correct across the team. Weakest topics are where to focus training.' })]);
          j.tags.slice().sort(function (a, b) { return a.pct - b.pct; }).forEach(function (t) {
            tc.appendChild(h('div', { class: 'topicbar' }, [h('span', { class: 'tn', text: t.tag }), h('div', { class: 'b', role: 'img', 'aria-label': t.tag + ' ' + t.pct + ' percent' }, [h('i', { class: cls(t.pct), style: 'width:' + Math.max(3, t.pct) + '%' })]), h('span', { class: 'num small', text: t.pct + '% of ' + t.n })]));
          });
          holder.appendChild(tc);
        }
        var head = ['Agent', 'Tests', 'Average'].concat(j.tags.map(function (t) { return t.tag; }));
        var tb = h('tbody');
        j.agents.forEach(function (a) {
          tb.appendChild(h('tr', null, [
            h('td', null, [h('b', { style: 'font-weight:500', text: a.name || a.email }), h('span', { class: 'sub', text: a.email + (a.concerns ? ' · ' + a.concerns + ' concern' : '') })]),
            h('td', { class: 'num', text: String(a.attempts) }),
            h('td', null, [a.avgPct != null ? pill(a.avgPct + '%', cls(a.avgPct)) : h('span', { class: 'muted', text: '–' })]),
          ].concat(j.tags.map(function (t) { var v = a.topics[t.tag]; return h('td', { class: 'num heat' }, [v ? h('span', { class: 'hc ' + cls(v.pct), title: v.n + ' answers', text: v.pct + '%' }) : h('span', { class: 'muted', text: '–' })]); }))));
        });
        holder.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', null, [h('tr', null, head.map(function (x) { return h('th', { scope: 'col', text: x }); }))]), tb])]));
      }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
    }
    sel.addEventListener('change', load);
    load();
  }

  // ── Session 64: AI Studio ────────────────────────────────────────────
  function viewStudioHome() {
    main.appendChild(h('div', { class: 'hero studio-hero' }, [h('div', { class: 'hero-tx' }, [h('span', { class: 'eyebrow', text: 'AI Studio' }), h('h1', { text: 'Turn a document into assessments' }), h('p', { text: 'Upload an SOP, a guide or any long document, paste text, or give a web link. The AI reads it, splits it into sections, suggests how many assessments to make, writes the questions, and works through them with you. Nothing reaches agents until you publish.' })]), h('div', { class: 'hero-art' }, [art('tests', 190)])]));
    var grid = h('div', { class: 'studio-start' });
    main.appendChild(grid);
    // source card
    var mode = 'file', file = null;
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Source' });
    var panes = {};
    [['file', 'Upload a file', 'upload'], ['text', 'Paste text', 'doc'], ['url', 'Web link', 'link']].forEach(function (o) {
      seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(mode === o[0]), onclick: function () { mode = o[0]; Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b === this)); }, this); Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== mode; }); } }, [icon(o[2], 'sm'), o[1]]));
    });
    var fin = h('input', { type: 'file', accept: '.pdf,.docx,.txt,.md,.html,.htm', hidden: true });
    var fname = h('span', { class: 'small muted', text: 'PDF, Word (.docx), text or HTML, up to 25 MB' });
    var drop = h('label', { class: 'drop' }, [art('pending', 140), h('b', { text: 'Drop a document here or choose a file' }), fname, fin]);
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) { file = e.dataTransfer.files[0]; fname.textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB'; } });
    fin.addEventListener('change', function () { file = fin.files[0] || null; if (file) fname.textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB'; });
    panes.file = h('div', null, [drop]);
    var ta = h('textarea', { class: 'ta', style: 'min-height:200px', placeholder: 'Paste the text of an SOP, a policy, a product guide or training notes. Headings help the AI split it into sections.' });
    var taName = h('input', { class: 'inp', placeholder: 'Name for this source, e.g. "Refund policy v3"' });
    panes.text = h('div', { hidden: true }, [field('Name', taName), field('Text', ta)]);
    var urlIn = h('input', { class: 'inp', type: 'url', placeholder: 'https://…' });
    panes.url = h('div', { hidden: true }, [field('Web page', urlIn, 'Public pages only. If a page needs a sign-in (Google Docs, Zoho), download it and upload the file instead.')]);
    var focus = h('textarea', { class: 'ta', style: 'min-height:70px', maxlength: '600', placeholder: 'Optional: what should the assessments focus on? e.g. "escalation owners and time limits, not the history section"' });
    var err = h('div');
    var goBtn = h('button', { class: 'btn primary lg', type: 'button' }, [icon('spark', 'sm'), 'Read it and plan assessments']);
    var progress = h('div', { class: 'studio-prog', hidden: true }, [art('radar', 150), h('ol', { class: 'sp-steps' }, ['Reading the document', 'Finding sections', 'Planning assessments'].map(function (t) { return h('li', { text: t }); }))]);
    grid.appendChild(h('div', { class: 'card pad stack' }, [h('h2', { text: 'Start with a source' }), seg, panes.file, panes.text, panes.url, field('Focus (optional)', focus), err, h('div', { class: 'row' }, [h('span', { class: 'spacer' }), goBtn]), progress]));
    goBtn.addEventListener('click', function () {
      clear(err);
      var qs = new URLSearchParams({ kind: mode }), body;
      if (focus.value.trim()) qs.set('focus', focus.value.trim());
      if (mode === 'file') { if (!file) { err.appendChild(errBox('Choose a file first')); return; } qs.set('name', file.name); body = file; }
      else if (mode === 'text') { if (ta.value.trim().length < 300) { err.appendChild(errBox('Paste a bit more text (at least a few paragraphs)')); return; } qs.set('name', taName.value.trim() || 'Pasted text'); body = new Blob([ta.value], { type: 'text/plain' }); }
      else { if (!/^https?:\/\//.test(urlIn.value.trim())) { err.appendChild(errBox('Enter a web address starting with https://')); return; } body = new Blob([urlIn.value.trim()], { type: 'text/plain' }); }
      goBtn.disabled = true; progress.hidden = false;
      var steps = progress.querySelectorAll('li'), si = 0; steps[0].className = 'on';
      var tm = setInterval(function () { if (si < steps.length - 1) { steps[si].className = 'done'; si++; steps[si].className = 'on'; } }, 4500);
      api('/api/assess/admin/studio?' + qs, { method: 'POST', raw: body, contentType: body.type || 'application/octet-stream' })
        .then(function (j) { clearInterval(tm); go('studio/' + j.studio.id); })
        .catch(function (e) { clearInterval(tm); progress.hidden = true; goBtn.disabled = false; err.appendChild(errBox(e.message)); });
    });
    // past sessions
    var past = h('div', { class: 'card pad stack' }, [h('h2', { text: 'Your studio work' }), h('p', { class: 'small muted', style: 'margin:0', text: 'Pick up where you left off.' })]);
    var pl = h('div', { class: 'plist' }); past.appendChild(pl);
    grid.appendChild(past);
    api('/api/assess/admin/studio').then(function (j) {
      if (!j.ai) err.appendChild(h('div', { class: 'alert warn' }, [icon('warn'), h('span', { text: 'AI is not configured on the server, so sections are found but questions cannot be written. Add ANTHROPIC_API_KEY or OPENAI_API_KEY.' })]));
      if (!j.sessions.length) { pl.appendChild(h('div', { class: 'il-empty' }, [art('inbox', 140), h('span', { text: 'Nothing yet. Your first document will appear here.' })])); return; }
      j.sessions.forEach(function (x) {
        pl.appendChild(h('div', { class: 'click', onclick: function () { go('studio/' + x.id); } }, [h('span', { class: 'ic-round' }, [icon(x.status === 'saved' && !x.unsaved ? 'check' : 'doc', 'sm')]),
          h('div', { class: 'who' }, [h('b', { text: x.title }), h('span', { text: x.groups + ' assessment' + (x.groups === 1 ? '' : 's') + ' planned · ' + x.drafts + ' draft questions' + (x.unsaved && x.unsaved < x.drafts ? ' (' + (x.drafts - x.unsaved) + ' in the bank)' : '') + ' · ' + fmtWhen(x.updatedAt) })]),
          x.unsaved ? pill(x.unsaved + ' not saved yet', 'accent') : (x.status === 'saved' ? pill('Saved', 'ok') : pill('In progress', 'accent'))]));
      });
    }).catch(function () {});
  }

  function viewStudio(id) {
    var holder = h('div', { class: 'studio' }); main.appendChild(holder); holder.appendChild(skeleton());
    var S = null, busy = false, selGroup = null;
    function put(body) { return api('/api/assess/admin/studio/' + id, { method: 'PUT', body: body }).then(function (j) { S = j.studio; return S; }); }
    function load() { api('/api/assess/admin/studio/' + id).then(function (j) { S = j.studio; draw(); }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); }); }
    function secById(sid) { return S.sections.find(function (x) { return x.id === sid; }); }
    function draw() {
      clear(holder);
      var totalQ = S.drafts.filter(function (d) { return !d.saved; }).length;
      holder.appendChild(pageHead(S.title, (S.summary || 'Sections found: ' + S.sections.length) + ' · ' + Math.round(S.chars / 1000) + 'k characters', [
        h('button', { class: 'btn ghost danger', type: 'button', onclick: function () { if (!confirm('Delete this studio session? Saved questions and assessments stay.')) return; api('/api/assess/admin/studio/' + id, { method: 'DELETE' }).then(function () { go('studio'); }); } }, [icon('trash', 'sm'), 'Delete session']),
        h('button', { class: 'btn primary', type: 'button', disabled: !totalQ || null, onclick: publish }, [icon('check', 'sm'), totalQ ? 'Save ' + totalQ + ' question' + (totalQ === 1 ? '' : 's') + ' and create drafts' : 'Nothing to save yet']),
      ], { text: 'AI Studio', go: function () { go('studio'); } }));
      var cols = h('div', { class: 'studio-cols' });
      holder.appendChild(cols);
      cols.appendChild(sectionsPane());
      cols.appendChild(groupsPane());
      cols.appendChild(chatPane());
    }
    // ── sections
    function sectionsPane() {
      var box = h('div', { class: 'card st-pane st-secs' }, [h('div', { class: 'st-hd' }, [icon('layers', 'sm'), h('h3', { text: 'Sections' }), h('span', { class: 'pill', text: S.sections.filter(function (x) { return x.include; }).length + ' of ' + S.sections.length })])]);
      var list = h('div', { class: 'st-scroll' });
      S.sections.forEach(function (sc, i) {
        var g = S.groups.find(function (x) { return x.sectionIds.indexOf(sc.id) >= 0; });
        var inc = h('input', { type: 'checkbox', checked: sc.include ? true : null, 'aria-label': 'Include ' + sc.title });
        inc.addEventListener('change', function () { put({ sections: [{ id: sc.id, include: inc.checked }] }).then(draw).catch(function (e) { toast(e.message); }); });
        var more = h('details', { class: 'st-sec-more' }, [h('summary', { text: sc.summary || 'Preview' }), sc.keyPoints && sc.keyPoints.length ? h('ul', null, sc.keyPoints.map(function (k) { return h('li', { text: k }); })) : null, h('p', { class: 'small muted', text: sc.preview + (sc.chars > 600 ? '…' : '') })]);
        list.appendChild(h('div', { class: 'st-sec' + (sc.include ? '' : ' off'), style: '--i:' + Math.min(i, 14) }, [h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, [inc, h('b', { text: sc.title }), h('span', { class: 'spacer' }), h('span', { class: 'small muted', text: Math.max(1, Math.round(sc.chars / 1000)) + 'k' })]),
          g ? h('span', { class: 'st-gtag', text: g.title }) : h('span', { class: 'st-gtag none', text: 'Not in an assessment' }), more]));
      });
      box.appendChild(list);
      return box;
    }
    // ── groups and drafts
    function groupsPane() {
      var box = h('div', { class: 'st-pane st-groups' });
      box.appendChild(h('div', { class: 'row', style: 'margin-bottom:10px' }, [h('h3', { style: 'margin:0', text: 'Assessments' }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm', type: 'button', onclick: function () { var ng = S.groups.concat([{ id: '', title: 'New assessment', sectionIds: [], questionCount: 8, difficulty: 'mixed' }]); put({ groups: ng }).then(draw); } }, [icon('plus', 'sm'), 'Add']),
        h('button', { class: 'btn sm primary', type: 'button', disabled: busy || null, onclick: function () { generate(null); } }, [icon('spark', 'sm'), 'Write all'])]));
      S.groups.forEach(function (g, gi) {
        var drafts = S.drafts.filter(function (d) { return d.groupId === g.id; });
        var titleIn = h('input', { class: 'inp st-title', value: g.title, 'aria-label': 'Assessment title' });
        titleIn.addEventListener('change', function () { g.title = titleIn.value; put({ groups: S.groups }).then(draw); });
        var cnt = h('input', { class: 'inp', type: 'number', min: '1', max: '25', value: String(g.questionCount), style: 'width:70px', 'aria-label': 'Number of questions' });
        cnt.addEventListener('change', function () { g.questionCount = Number(cnt.value) || 8; put({ groups: S.groups }); });
        var dif = h('select', { class: 'sel', 'aria-label': 'Difficulty' }, [['mixed', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); dif.value = g.difficulty;
        dif.addEventListener('change', function () { g.difficulty = dif.value; put({ groups: S.groups }); });
        var chips = h('div', { class: 'chips' });
        g.sectionIds.forEach(function (sid) { var sc = secById(sid); if (!sc) return; chips.appendChild(h('span', { class: 'chip' }, [sc.title, h('button', { type: 'button', 'aria-label': 'Remove section', onclick: function () { g.sectionIds = g.sectionIds.filter(function (x) { return x !== sid; }); put({ groups: S.groups }).then(draw); } }, [icon('x', 'sm')])])); });
        var free = S.sections.filter(function (sc) { return !S.groups.some(function (x) { return x.sectionIds.indexOf(sc.id) >= 0; }); });
        if (free.length) {
          var addSel = h('select', { class: 'sel sm', 'aria-label': 'Add a section' }, [h('option', { value: '', text: '+ Add section' })].concat(free.map(function (sc) { return h('option', { value: sc.id, text: sc.title }); })));
          addSel.addEventListener('change', function () { if (!addSel.value) return; g.sectionIds.push(addSel.value); put({ groups: S.groups }).then(draw); });
          chips.appendChild(addSel);
        }
        var qlist = h('div', { class: 'st-qs' });
        drafts.forEach(function (d, qi) { qlist.appendChild(draftCard(d, qi)); });
        if (!drafts.length) qlist.appendChild(h('p', { class: 'small muted', text: 'No questions yet. Press Write questions, or ask in the chat.' }));
        var card = h('div', { class: 'card st-group' + (selGroup === g.id ? ' sel' : ''), style: '--i:' + gi }, [
          h('div', { class: 'st-g-hd' }, [h('span', { class: 'st-num', text: String(gi + 1) }), titleIn,
            h('button', { class: 'btn icon ghost sm', type: 'button', title: 'Remove this assessment', 'aria-label': 'Remove this assessment', onclick: function () { if (!confirm('Remove "' + g.title + '" and its draft questions?')) return; put({ groups: S.groups.filter(function (x) { return x !== g; }), drafts: S.drafts.filter(function (d) { return d.groupId !== g.id; }) }).then(draw); } }, [icon('trash', 'sm')])]),
          g.why ? h('p', { class: 'small muted', style: 'margin:0 0 8px', text: g.why }) : null,
          chips,
          h('div', { class: 'row st-g-opts' }, [h('label', { class: 'small muted' }, ['Questions ', cnt]), dif, h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm', type: 'button', onclick: function () { selGroup = selGroup === g.id ? null : g.id; draw(); } }, [icon('chat', 'sm'), selGroup === g.id ? 'Chatting about this' : 'Chat about this']),
            h('button', { class: 'btn sm primary', type: 'button', disabled: busy || !g.sectionIds.length || null, onclick: function () { generate([g.id]); } }, [icon('spark', 'sm'), drafts.length ? 'Rewrite all' : 'Write questions'])]),
          qlist,
          !g.testId && !busy && readyGroups([g.id]).length ? h('div', { class: 'note', style: 'margin:10px 0 0' }, [icon('wand', 'sm'), h('span', { text: 'This set is ready. Convert it into an assessment? ' }), h('button', { class: 'btn sm primary', type: 'button', text: 'Convert', onclick: function () { offerConvert([g.id]); } })]) : null,
          g.testId ? h('div', { class: 'alert info', style: 'margin:10px 0 0' }, [icon('check'), h('span', null, ['Saved as a draft assessment. ', h('button', { class: 'linkbtn', type: 'button', text: 'Open it', onclick: function () { go('edit/' + g.testId); } })])]) : null,
        ]);
        box.appendChild(card);
      });
      return box;
    }
    function draftCard(d, qi) {
      var L = 'ABCDEFGH';
      var opts = h('div', { class: 'st-opts' });
      if (d.type === 'matching') (d.options || []).forEach(function (o) { opts.appendChild(h('div', { class: 'st-opt' }, [h('span', { text: (o.text || o[0]) + ' → ' + (o.match || o[1]) })])); });
      else if (d.type === 'ordering') (d.options || []).forEach(function (o, i) { opts.appendChild(h('div', { class: 'st-opt' }, [h('b', { text: (i + 1) + '.' }), h('span', { text: typeof o === 'string' ? o : o.text })])); });
      else (d.options || []).forEach(function (o, i) { var ok = (d.correct || []).indexOf(i) >= 0; opts.appendChild(h('div', { class: 'st-opt' + (ok ? ' ok' : '') }, [h('b', { text: L[i] }), h('span', { text: typeof o === 'string' ? o : o.text }), ok ? icon('check', 'sm') : null])); });
      var card = h('div', { class: 'st-q' + (d.ok ? '' : ' bad') + (d.saved ? ' saved' : ''), style: '--i:' + Math.min(qi, 14) }, [
        h('div', { class: 'row', style: 'gap:6px' }, [h('span', { class: 'st-qn', text: String(qi + 1) }), pill(TYPE_SHORT[d.type] || d.type, 'accent'), pill(d.difficulty || 'medium'), d.saved ? pill('Saved to bank', 'ok') : null, d.ok ? null : pill('Needs a fix', 'bad'), h('span', { class: 'spacer' }),
          d.saved ? null : h('button', { class: 'btn icon ghost sm', type: 'button', title: 'Edit', 'aria-label': 'Edit question', onclick: function () { editDraft(d); } }, [icon('edit', 'sm')]),
          d.saved ? null : h('button', { class: 'btn icon ghost sm', type: 'button', title: 'Improve with AI', 'aria-label': 'Improve with AI', onclick: function (e) { improveDraft(d, e.currentTarget); } }, [icon('wand', 'sm')]),
          d.saved ? null : h('button', { class: 'btn icon ghost sm', type: 'button', title: 'Remove', 'aria-label': 'Remove question', onclick: function () { put({ drafts: S.drafts.filter(function (x) { return x !== d; }) }).then(draw); } }, [icon('x', 'sm')])]),
        h('p', { class: 'st-qp', text: d.prompt }), opts,
        d.explanation ? h('p', { class: 'small muted', style: 'margin:6px 0 0', text: 'Why: ' + d.explanation }) : null,
        d.problem ? h('p', { class: 'small', style: 'color:var(--bad);margin:6px 0 0', text: d.problem }) : null,
      ]);
      return card;
    }
    function toEditor(d) {
      if (d.type === 'matching') return { type: 'matching', prompt: d.prompt, options: (d.options || []).map(function (o) { return o.text || o[0]; }), matches: (d.options || []).map(function (o) { return o.match || o[1]; }), correct: [], explanation: d.explanation, tags: d.tags || [], difficulty: d.difficulty, status: 'draft' };
      if (d.type === 'ordering') { var o = (d.options || []).map(function (x) { return typeof x === 'string' ? x : x.text; }); return { type: 'ordering', prompt: d.prompt, options: o, correct: o.map(function (_, i) { return i; }), explanation: d.explanation, tags: d.tags || [], difficulty: d.difficulty, status: 'draft' }; }
      return { type: d.type, prompt: d.prompt, options: (d.options || []).map(function (x) { return typeof x === 'string' ? x : x.text; }), correct: (d.correct || []).slice(), explanation: d.explanation, tags: d.tags || [], difficulty: d.difficulty, status: 'draft' };
    }
    function fromEditor(d, p) {
      var nd = Object.assign({}, d, { type: p.type, prompt: p.prompt, explanation: p.explanation, tags: p.tags, difficulty: p.difficulty });
      if (p.type === 'matching') { nd.options = p.options; nd.correct = []; }
      else if (p.type === 'ordering') { nd.options = p.options; nd.correct = []; }
      else { nd.options = p.options; nd.correct = p.correct; }
      return nd;
    }
    function editDraft(d) {
      openQuestion(toEditor(d), { onSave: function (p) { var nd = fromEditor(d, p); var list = S.drafts.map(function (x) { return x === d ? nd : x; }); return put({ drafts: list }).then(draw); } });
    }
    function improveDraft(d, btn) {
      btn.disabled = true; btn.classList.add('busy');
      var q = toEditor(d); if (d.type === 'matching') q.pairs = (d.options || []).map(function (o) { return [o.text, o.match]; });
      api('/api/assess/admin/questions/improve', { method: 'POST', body: { question: q } }).then(function (r) {
        var nq = r.question; var nd = Object.assign({}, d, { type: nq.type, prompt: nq.prompt, options: nq.options, correct: nq.correct || [], explanation: nq.explanation || d.explanation, difficulty: nq.difficulty || d.difficulty });
        return put({ drafts: S.drafts.map(function (x) { return x === d ? nd : x; }) }).then(function () { toast('Improved: ' + (r.changes || 'wording and options')); draw(); });
      }).catch(function (e) { toast(e.message); btn.disabled = false; btn.classList.remove('busy'); });
    }
    function generate(groupIds) {
      busy = true; draw();
      var ov = h('div', { class: 'st-busy' }, [art('tests', 150), h('b', { text: 'Writing questions…' }), h('span', { class: 'small muted', text: 'About 20 to 60 seconds per assessment.' })]);
      holder.appendChild(ov);
      api('/api/assess/admin/studio/' + id + '/generate', { method: 'POST', body: { groupIds: groupIds || [] } }).then(function (j) { S = j.studio; busy = false; draw(); if (j.studio.errors && j.studio.errors.length) toast(j.studio.errors[0]); offerConvert(groupIds); })
        .catch(function (e) { busy = false; draw(); toast(e.message); });
    }
    // Once a set is written, ask whether to turn it into an assessment.
    function readyGroups(ids) {
      return S.groups.filter(function (g) { return (!ids || !ids.length || ids.indexOf(g.id) >= 0) && !g.testId && S.drafts.some(function (d) { return d.groupId === g.id && !d.saved && d.ok !== false; }); });
    }
    function offerConvert(ids) {
      var gs = readyGroups(ids); if (!gs.length) return;
      var dlg = h('dialog', { class: 'confirm', 'aria-labelledby': 'cv-t' });
      var secs = h('input', { class: 'inp', type: 'number', min: '15', max: '180', value: '40', style: 'width:80px', 'aria-label': 'Seconds per question' });
      var yes = h('button', { class: 'btn primary', type: 'button' }, [icon('wand', 'sm'), gs.length === 1 ? 'Yes, convert it' : 'Yes, convert them']);
      var list = h('ul', { class: 'small', style: 'margin:8px 0 0;padding-left:18px' }, gs.map(function (g) { return h('li', { text: g.title + ' (' + S.drafts.filter(function (d) { return d.groupId === g.id && !d.saved; }).length + ' questions)' }); }));
      dlg.appendChild(h('div', { class: 'cf-in' }, [art('tests', 150), h('h2', { id: 'cv-t', text: gs.length === 1 ? 'Convert this set into an assessment?' : 'Convert these ' + gs.length + ' sets into assessments?' }),
        h('p', { text: 'The questions are saved to the bank as drafts, and each set opens as a draft assessment with a name, description and modules. Nothing reaches agents until you publish.' }), list,
        h('label', { class: 'small muted row', style: 'margin-top:10px' }, ['Seconds per question', secs]),
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Not now', onclick: function () { dlg.close(); } }), yes])]));
      dlg.addEventListener('close', function () { dlg.remove(); });
      yes.addEventListener('click', function () {
        yes.disabled = true; yes.classList.add('busy');
        api('/api/assess/admin/studio/' + id + '/publish', { method: 'POST', body: { createTests: true, groupIds: gs.map(function (g) { return g.id; }), secondsPerQuestion: Number(secs.value) || 40 } }).then(function (j) {
          dlg.close(); S = j.studio;
          var tests = j.made.filter(function (m) { return m.testId; });
          toast(tests.length + ' assessment' + (tests.length === 1 ? '' : 's') + ' created as draft' + (tests.length === 1 ? '' : 's') + '.');
          if (tests.length === 1) go('edit/' + tests[0].testId); else draw();
        }).catch(function (e) { yes.disabled = false; yes.classList.remove('busy'); toast(e.message); });
      });
      document.body.appendChild(dlg); dlg.showModal();
    }
    function publish() {
      var n = S.drafts.filter(function (d) { return !d.saved; }).length;
      var dlg = h('dialog', { class: 'confirm', 'aria-labelledby': 'pb-t' });
      var mk = h('input', { type: 'checkbox', id: 'pb-mk', checked: true });
      var secs = h('input', { class: 'inp', type: 'number', min: '15', max: '180', value: '40', style: 'width:80px' });
      var ok = h('button', { class: 'btn primary', type: 'button' }, [icon('check', 'sm'), 'Save']);
      dlg.appendChild(h('div', { class: 'cf-in' }, [art('inbox', 150), h('h2', { id: 'pb-t', text: 'Save ' + n + ' question' + (n === 1 ? '' : 's') + '?' }),
        h('p', { text: 'They go to the question bank as drafts, tagged by section. Approve them there before they can be used in random pools.' }),
        h('label', { class: 'chk', for: 'pb-mk' }, [mk, 'Also create one draft assessment per group (' + S.groups.filter(function (g) { return S.drafts.some(function (d) { return d.groupId === g.id && !d.saved; }); }).length + ')']),
        h('label', { class: 'small muted row', style: 'margin-top:8px' }, ['Seconds per question', secs]),
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }), ok])]));
      dlg.addEventListener('close', function () { dlg.remove(); });
      ok.addEventListener('click', function () {
        ok.disabled = true;
        api('/api/assess/admin/studio/' + id + '/publish', { method: 'POST', body: { createTests: mk.checked, secondsPerQuestion: Number(secs.value) || 40 } }).then(function (j) {
          dlg.close(); S = j.studio; draw();
          toast('Saved ' + j.made.reduce(function (t, m) { return t + m.questions; }, 0) + ' questions' + (mk.checked ? ' and ' + j.made.filter(function (m) { return m.testId; }).length + ' draft assessment(s)' : '') + (j.errors.length ? '. ' + j.errors.length + ' could not be saved.' : ''));
        }).catch(function (e) { ok.disabled = false; toast(e.message); });
      });
      document.body.appendChild(dlg); dlg.showModal();
    }
    // ── chat
    function chatPane() {
      var box = h('div', { class: 'card st-pane st-chat' });
      var g = S.groups.find(function (x) { return x.id === selGroup; });
      box.appendChild(h('div', { class: 'st-hd' }, [icon('bot', 'sm'), h('h3', { text: 'Work with the AI' }), g ? h('span', { class: 'pill accent', text: 'About: ' + g.title }) : null]));
      var log = h('div', { class: 'st-log', 'aria-live': 'polite' });
      S.messages.forEach(function (m) {
        log.appendChild(h('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') }, [
          m.role === 'user' ? null : h('span', { class: 'msg-av' }, [icon('bot', 'sm')]),
          h('div', { class: 'msg-b' }, [h('p', { text: m.text }), m.done && m.done.length ? h('ul', { class: 'msg-done' }, m.done.map(function (x) { return h('li', null, [icon('check', 'sm'), x]); })) : null, m.problems && m.problems.length ? h('p', { class: 'small', style: 'color:var(--bad)', text: m.problems.join(' · ') }) : null])]));
      });
      box.appendChild(log);
      setTimeout(function () { log.scrollTop = log.scrollHeight; }, 30);
      var sug = h('div', { class: 'chips st-sug' });
      (g ? ['Make these harder', 'Add 3 scenario questions', 'Rewrite the wrong options to be more believable', 'Remove any question that is trivia']
        : ['Split the first assessment in two', 'Make one short assessment per section', 'Focus on escalation rules and owners', 'Which sections are most important to test?']).forEach(function (t) {
        sug.appendChild(h('button', { class: 'chip off', type: 'button', text: t, onclick: function () { inp.value = t; send(); } }));
      });
      box.appendChild(sug);
      var inp = h('textarea', { class: 'ta st-in', rows: '2', placeholder: 'Ask for changes, e.g. "add 4 questions on refunds to assessment 2"', 'aria-label': 'Message to the AI' });
      var sendBtn = h('button', { class: 'btn primary', type: 'button', 'aria-label': 'Send' }, [icon('send', 'sm')]);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
      sendBtn.addEventListener('click', send);
      box.appendChild(h('div', { class: 'st-compose' }, [inp, sendBtn]));
      function send() {
        var t = inp.value.trim(); if (!t || busy) return;
        busy = true; inp.value = ''; sendBtn.disabled = true;
        log.appendChild(h('div', { class: 'msg me' }, [h('div', { class: 'msg-b' }, [h('p', { text: t })])]));
        var typing = h('div', { class: 'msg ai' }, [h('span', { class: 'msg-av' }, [icon('bot', 'sm')]), h('div', { class: 'msg-b typing' }, [h('i'), h('i'), h('i')])]);
        log.appendChild(typing); log.scrollTop = log.scrollHeight;
        api('/api/assess/admin/studio/' + id + '/chat', { method: 'POST', body: { message: t, groupId: selGroup } }).then(function (j) { S = j.studio; busy = false; draw(); })
          .catch(function (e) { busy = false; typing.remove(); sendBtn.disabled = false; toast(e.message); });
      }
      return box;
    }
    load();
  }

  // ── Session 64: Reports ──────────────────────────────────────────────
  // Charts are plain SVG: one measure per chart, one hue (the accent), a
  // recessive grid, direct labels only where they help, and a tooltip on
  // every mark. Status colours are only used for pass/below and behaviour,
  // always with a text label.
  var tipEl = null;
  function tip(e, html) {
    if (!tipEl) { tipEl = h('div', { class: 'ch-tip', role: 'status' }); document.body.appendChild(tipEl); }
    if (!html) { tipEl.style.opacity = '0'; return; }
    tipEl.innerHTML = html; tipEl.style.opacity = '1';
    var x = Math.min(window.innerWidth - tipEl.offsetWidth - 12, e.clientX + 14), y = Math.max(8, e.clientY - tipEl.offsetHeight - 10);
    tipEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function escH(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function chartCard(title, sub, body, extra) { return h('div', { class: 'card ch-card' }, [h('div', { class: 'ch-hd' }, [h('div', null, [h('h3', { text: title }), sub ? h('p', { text: sub }) : null]), extra || null]), body]); }
  // vertical columns (histogram, weekly counts)
  function columns(data, opts) {
    opts = opts || {};
    var W = 560, H = 220, P = { l: 34, r: 8, t: 12, b: 30 };
    var max = opts.max || Math.max(1, Math.max.apply(null, data.map(function (d) { return d.value; })));
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ch', role: 'img', 'aria-label': opts.label || 'Chart' });
    var ih = H - P.t - P.b, iw = W - P.l - P.r, bw = iw / data.length;
    [0, .5, 1].forEach(function (f) { var y = P.t + ih * (1 - f); svg.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, class: 'ch-grid' })); var t = svgEl('text', { x: P.l - 6, y: y + 4, class: 'ch-ax', 'text-anchor': 'end' }); t.textContent = Math.round(max * f) + (opts.unit || ''); svg.appendChild(t); });
    data.forEach(function (d, i) {
      var bh = d.value ? Math.max(2, ih * d.value / max) : 0, x = P.l + i * bw + 3, y = P.t + ih - bh, w = Math.max(4, bw - 6);
      var g = svgEl('g', { class: 'ch-hit', tabindex: '0' });
      g.appendChild(svgEl('rect', { x: P.l + i * bw, y: P.t, width: bw, height: ih, fill: 'transparent' }));
      if (bh) { var r = svgEl('path', { class: 'ch-bar', d: 'M' + x + ',' + (y + bh) + 'V' + (y + 4) + 'Q' + x + ',' + y + ' ' + (x + 4) + ',' + y + 'H' + (x + w - 4) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + 4) + 'V' + (y + bh) + 'Z' }); r.style.setProperty('--d', (i * 40) + 'ms'); g.appendChild(r); }
      var lb = svgEl('text', { x: P.l + i * bw + bw / 2, y: H - 10, class: 'ch-ax', 'text-anchor': 'middle' }); lb.textContent = d.label; g.appendChild(lb);
      g.addEventListener('mousemove', function (e) { tip(e, '<b>' + escH(d.tip || d.label) + '</b><br>' + escH(d.value + (opts.valueLabel ? ' ' + opts.valueLabel : ''))); });
      g.addEventListener('mouseleave', function () { tip(null); });
      svg.appendChild(g);
    });
    return svg;
  }
  // a line over time with markers and an optional reference line
  function line(points, opts) {
    opts = opts || {};
    var W = 560, H = 220, P = { l: 34, r: 12, t: 14, b: 30 };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ch', role: 'img', 'aria-label': opts.label || 'Chart' });
    var ih = H - P.t - P.b, iw = W - P.l - P.r;
    [0, 50, 100].forEach(function (v) { var y = P.t + ih * (1 - v / 100); svg.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, class: 'ch-grid' })); var t = svgEl('text', { x: P.l - 6, y: y + 4, class: 'ch-ax', 'text-anchor': 'end' }); t.textContent = v + '%'; svg.appendChild(t); });
    if (opts.ref != null) { var ry = P.t + ih * (1 - opts.ref / 100); svg.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: ry, y2: ry, class: 'ch-ref' })); var rt = svgEl('text', { x: W - P.r, y: ry - 5, class: 'ch-ax', 'text-anchor': 'end' }); rt.textContent = 'Pass mark ' + opts.ref + '%'; svg.appendChild(rt); }
    if (!points.length) return svg;
    var xs = function (i) { return P.l + (points.length === 1 ? iw / 2 : iw * i / (points.length - 1)); }, ys = function (v) { return P.t + ih * (1 - v / 100); };
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + xs(i).toFixed(1) + ',' + ys(p.y).toFixed(1); }).join('');
    svg.appendChild(svgEl('path', { d: d + 'L' + xs(points.length - 1) + ',' + (P.t + ih) + 'L' + xs(0) + ',' + (P.t + ih) + 'Z', class: 'ch-area' }));
    var pl = svgEl('path', { d: d, class: 'ch-line' }); svg.appendChild(pl);
    var step = Math.ceil(points.length / 8);
    points.forEach(function (p, i) {
      var c = svgEl('circle', { cx: xs(i), cy: ys(p.y), r: 4.5, class: 'ch-dot' }); svg.appendChild(c);
      if (i % step === 0 || i === points.length - 1) { var t = svgEl('text', { x: xs(i), y: H - 10, class: 'ch-ax', 'text-anchor': 'middle' }); t.textContent = p.x; svg.appendChild(t); }
      var hit = svgEl('rect', { x: xs(i) - Math.max(10, iw / points.length / 2), y: P.t, width: Math.max(20, iw / points.length), height: ih, fill: 'transparent', class: 'ch-hit' });
      hit.addEventListener('mousemove', function (e) { c.setAttribute('r', 6.5); tip(e, '<b>' + escH(p.tip || p.x) + '</b><br>' + escH(p.label || (p.y + '%'))); });
      hit.addEventListener('mouseleave', function () { c.setAttribute('r', 4.5); tip(null); });
      svg.appendChild(hit);
    });
    return svg;
  }
  // horizontal bars with a label, value and a thin track (HTML, easy to read and wrap)
  function hbars(rows, opts) {
    opts = opts || {};
    var box = h('div', { class: 'hb' });
    rows.forEach(function (r, i) {
      var pct = Math.max(0, Math.min(100, r.value));
      var row = h('div', { class: 'hb-row', tabindex: '0', style: '--i:' + i }, [h('span', { class: 'hb-l', title: r.label, text: r.label }), h('div', { class: 'hb-t' }, [h('i', { class: r.tone ? 'tone-' + r.tone : '', style: 'width:' + pct + '%' })]), h('span', { class: 'hb-v', text: (r.valueText || (r.value + '%')) })]);
      if (r.tip) { row.addEventListener('mousemove', function (e) { tip(e, r.tip); }); row.addEventListener('mouseleave', function () { tip(null); }); }
      if (r.onclick) { row.classList.add('click'); row.addEventListener('click', r.onclick); }
      box.appendChild(row);
    });
    if (!rows.length) box.appendChild(h('p', { class: 'small muted', text: opts.empty || 'No data.' }));
    return box;
  }
  var reportState = { tests: [], from: '', to: '', email: '', result: '', range: '0' };
  function viewReports(tab) {
    var q = hashQuery();
    if (q.get('tests')) reportState.tests = q.get('tests').split(',').map(Number).filter(Boolean);
    var holder = h('div');
    var qsOf = function () { var x = new URLSearchParams(); if (reportState.tests.length) x.set('tests', reportState.tests.join(',')); ['from', 'to', 'email', 'result'].forEach(function (k) { if (reportState[k]) x.set(k, reportState[k]); }); return x; };
    var dl = menu('Download', 'download', [
      { label: 'Results with these filters (CSV)', sub: 'One row per attempt.', icon: 'doc', onclick: function () { location.href = '/api/assess/admin/results/export?' + qsOf(); } },
      { label: 'Include reset attempts (CSV)', sub: 'Same, plus attempts that were reset.', icon: 'doc', onclick: function () { var x = qsOf(); x.set('reset', '1'); location.href = '/api/assess/admin/results/export?' + x; } },
      { label: 'Print this report', sub: 'Save as PDF from the print window.', icon: 'print', onclick: function () { printReport(); } },
    ]);
    main.appendChild(pageHead('Reports', 'How the team is doing across assessments: scores, pass rates, the hardest questions and the wrong answers people pick. Filters apply to every tab.', [dl]));
    // filters
    var testsBtn = h('details', { class: 'menu fsel' });
    var testsSum = h('summary', { class: 'btn' }, [icon('layers', 'sm'), h('span', { text: 'All assessments' }), h('span', { class: 'caret', text: '▾' })]);
    var testsList = h('div', { class: 'menu-list checks-list' });
    testsBtn.appendChild(testsSum); testsBtn.appendChild(testsList);
    document.addEventListener('click', function (e) { if (testsBtn.open && !testsBtn.contains(e.target)) testsBtn.open = false; });
    var rng = h('div', { class: 'seg', role: 'group', 'aria-label': 'Period' });
    [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['0', 'All time']].forEach(function (o) {
      rng.appendChild(h('button', { type: 'button', 'aria-pressed': String(reportState.range === o[0]), text: o[1], onclick: function () {
        reportState.range = o[0];
        if (o[0] === '0') { reportState.from = ''; reportState.to = ''; } else { var d = new Date(Date.now() - (Number(o[0]) - 1) * 86400000); reportState.from = d.toISOString().slice(0, 10); reportState.to = new Date().toISOString().slice(0, 10); }
        fromIn.value = reportState.from; toIn.value = reportState.to;
        Array.prototype.forEach.call(rng.children, function (b) { b.setAttribute('aria-pressed', String(b === this)); }, this); load();
      } }));
    });
    var fromIn = h('input', { class: 'inp', type: 'date', 'aria-label': 'From', value: reportState.from }), toIn = h('input', { class: 'inp', type: 'date', 'aria-label': 'To', value: reportState.to });
    [fromIn, toIn].forEach(function (x) { x.addEventListener('change', function () { reportState.from = fromIn.value; reportState.to = toIn.value; reportState.range = ''; Array.prototype.forEach.call(rng.children, function (b) { b.setAttribute('aria-pressed', 'false'); }); load(); }); });
    var personSel = h('select', { class: 'sel', 'aria-label': 'Person' }, [h('option', { value: '', text: 'Everyone' })]);
    personSel.addEventListener('change', function () { reportState.email = personSel.value; load(); });
    var resSel = h('select', { class: 'sel', 'aria-label': 'Result' }, [['', 'Any result'], ['pass', 'Passed'], ['fail', 'Below pass']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    resSel.value = reportState.result; resSel.addEventListener('change', function () { reportState.result = resSel.value; load(); });
    var clearBtn = h('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: function () { reportState = { tests: [], from: '', to: '', email: '', result: '', range: '0' }; history.replaceState(null, '', '#reports'); route(); } });
    main.appendChild(h('div', { class: 'toolbar rep-filters' }, [icon('filter', 'sm'), testsBtn, rng, h('label', { class: 'small muted rep-d' }, ['From', fromIn]), h('label', { class: 'small muted rep-d' }, ['To', toIn]), personSel, resSel, clearBtn]));
    var tabsEl = h('div', { class: 'tabs', role: 'tablist' });
    [['overview', 'Overview'], ['questions', 'Questions'], ['people', 'People'], ['topics', 'Topics by agent']].forEach(function (t) {
      tabsEl.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === t[0]), text: t[1], onclick: function () { tab = t[0]; Array.prototype.forEach.call(tabsEl.children, function (b) { b.setAttribute('aria-selected', String(b === this)); }, this); paint(); } }));
    });
    main.appendChild(tabsEl); main.appendChild(holder);
    var data = null, testsAll = [];
    api('/api/assess/admin/tests').then(function (j) {
      testsAll = j.tests;
      clear(testsList);
      j.tests.forEach(function (t) {
        var cb = h('input', { type: 'checkbox', checked: reportState.tests.indexOf(t.id) >= 0 ? true : null });
        cb.addEventListener('change', function () { var at = reportState.tests.indexOf(t.id); if (cb.checked && at < 0) reportState.tests.push(t.id); if (!cb.checked && at >= 0) reportState.tests.splice(at, 1); syncTests(); load(); });
        testsList.appendChild(h('label', { class: 'menu-item chk' }, [cb, h('span', { text: t.title })]));
      });
      syncTests();
    }).catch(function () {});
    function syncTests() { testsSum.children[1].textContent = reportState.tests.length ? reportState.tests.length + ' assessment' + (reportState.tests.length > 1 ? 's' : '') : 'All assessments'; }
    function load() {
      clear(holder); holder.appendChild(skeleton());
      api('/api/assess/admin/report?' + qsOf()).then(function (j) { data = j.report; fillPeople(); paint(); }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
    }
    function fillPeople() {
      var keep = reportState.email;
      if (personSel.options.length <= 1 || !keep) {
        clear(personSel); personSel.appendChild(h('option', { value: '', text: 'Everyone' }));
        data.byAgent.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).forEach(function (a) { personSel.appendChild(h('option', { value: a.email, text: a.name })); });
      }
      personSel.value = keep;
    }
    function kpi(label, val, suffix, sub) { var b = h('b', { text: '0' }); var el = h('div', { class: 'card kpi' }, [h('span', { class: 'kpi-l', text: label }), h('div', { class: 'kpi-v' }, [b, suffix ? h('small', { text: suffix }) : null]), sub ? h('span', { class: 'kpi-s', text: sub }) : null]); if (val == null) b.textContent = '–'; else if (val % 1) b.textContent = String(val); else countUp(b, val); return el; }
    function paint() {
      clear(holder); tip(null);
      if (!data) return;
      var k = data.kpis;
      if (tab === 'topics') { viewInsights(holder); return; }
      if (!k.attempts) { holder.appendChild(h('div', { class: 'empty' }, [art('radar'), h('b', { text: 'No submitted attempts match these filters' }), h('span', { text: 'Try a wider period or clear the filters.' })])); return; }
      if (tab === 'overview') {
        holder.appendChild(h('div', { class: 'kpis stagger' }, [kpi('Attempts', k.attempts), kpi('People', k.people), kpi('Average score', k.avg, '%'), kpi('Pass rate', k.passRate, '%'), kpi('Median time', k.medianMinutes, ' min'), kpi('Flagged behaviour', k.flagged, '%', 'Some or major issues')]));
        var passMark = data.rows.length ? data.rows[0].passPct : null;
        var grid = h('div', { class: 'ch-grid2' });
        grid.appendChild(chartCard('Score distribution', 'How many attempts landed in each score band', columns(data.distribution.map(function (d) { return { label: d.from + (d.from === 90 ? '+' : ''), value: d.n, tip: d.from + '% to ' + (d.to === 100 ? '100' : d.to - 1) + '%' }; }), { label: 'Score distribution', valueLabel: 'attempts' })));
        grid.appendChild(chartCard('Average score by week', data.trend.length > 1 ? 'Week starting Monday' : 'Needs two or more weeks of attempts to show a trend',
          line(data.trend.map(function (w) { var d = new Date(w.week + 'T12:00:00Z'); return { x: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), y: w.avg, tip: 'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), label: w.avg + '% average · ' + w.passRate + '% passed · ' + w.n + ' attempts' }; }), { ref: passMark, label: 'Average score by week' })));
        grid.appendChild(chartCard('By assessment', 'Average score; click to filter', hbars(data.byTest.map(function (t) { return { label: t.test, value: t.avg, valueText: t.avg + '% · ' + t.n, tone: 'acc', tip: '<b>' + escH(t.test) + '</b><br>' + t.avg + '% average, ' + t.passRate + '% passed, ' + t.n + ' attempts', onclick: function () { reportState.tests = [t.testId]; syncTests(); Array.prototype.forEach.call(testsList.querySelectorAll('input'), function (cb, i) { cb.checked = testsAll[i] && testsAll[i].id === t.testId; }); load(); } }; }))));
        var tiers = data.tiers, tot = (tiers.none || 0) + (tiers.some || 0) + (tiers.major || 0) || 1;
        var stack = h('div', { class: 'stackbar', role: 'img', 'aria-label': 'Behaviour: ' + tiers.none + ' no issues, ' + tiers.some + ' some issues, ' + tiers.major + ' major issues' });
        [['none', 'No issues', 'ok'], ['some', 'Some issues', 'warn'], ['major', 'Major issues', 'bad']].forEach(function (x) { var n = tiers[x[0]] || 0; if (!n) return; var seg = h('i', { class: 'tone-' + x[2], style: 'flex:' + n }); seg.addEventListener('mousemove', function (e) { tip(e, '<b>' + x[1] + '</b><br>' + n + ' attempts (' + Math.round(n / tot * 100) + '%)'); }); seg.addEventListener('mouseleave', function () { tip(null); }); stack.appendChild(seg); });
        var legend = h('div', { class: 'legend' }, [['none', 'No issues', 'ok'], ['some', 'Some issues', 'warn'], ['major', 'Major issues', 'bad']].map(function (x) { return h('span', null, [h('i', { class: 'tone-' + x[2] }), x[1] + ' · ' + (tiers[x[0]] || 0)]); }));
        grid.appendChild(chartCard('Behaviour during tests', 'Signals to look into, not proof', h('div', null, [stack, legend])));
        holder.appendChild(grid);
        // What agents actually did, behaviour by behaviour, with who did it.
        var bh = data.behaviours || [], totalAtt = data.kpis.attempts || 1;
        var bhBody;
        if (!bh.length) bhBody = h('p', { class: 'small muted', style: 'margin:0', text: 'Nothing unusual was logged in these attempts.' });
        else {
          var bhList = h('ul', { class: 'bh-who' }, bh.map(function (b) {
            return h('li', null, [h('b', { text: b.label + ': ' }), h('span', { text: b.agents.map(function (a) { return (a.name || 'Unknown') + (a.n > 1 ? ' (' + a.n + 'x)' : ''); }).join(', ') + (b.attempts > b.agents.length ? ' and others' : '') })]);
          }));
          bhBody = h('div', null, [hbars(bh.map(function (b) { return { label: b.label, value: Math.round(b.attempts / totalAtt * 100), valueText: b.attempts + ' attempt' + (b.attempts === 1 ? '' : 's') + ' · ' + b.times + 'x', tone: b.level === 'major' ? 'bad' : 'warn', tip: '<b>' + escH(b.label) + '</b><br>' + b.attempts + ' of ' + totalAtt + ' attempts, ' + b.times + ' times in total' }; })), bhList]);
        }
        holder.appendChild(chartCard('What agents did during tests', 'Share of attempts where each behaviour was logged, and who did it', bhBody));
        if (data.topics.length) holder.appendChild(chartCard('Topics, weakest first', 'Share of answers correct, from question tags', hbars(data.topics.map(function (t) { return { label: t.tag, value: t.pct, valueText: t.pct + '% · ' + t.n, tone: t.pct >= 75 ? 'ok' : t.pct >= 50 ? 'warn' : 'bad', tip: '<b>' + escH(t.tag) + '</b><br>' + t.pct + '% correct over ' + t.n + ' answers' }; }))));
      } else if (tab === 'questions') {
        holder.appendChild(h('p', { class: 'small muted', text: 'Hardest first. "Most picked wrong answer" shows which option people chose when they got it wrong, and how many of the wrong answers it takes. A single wrong option taking most of them usually means a knowledge gap on that point, or a confusing question.' }));
        var tb = h('tbody');
        data.questions.forEach(function (x, i) {
          var tr = h('tr', { style: '--i:' + Math.min(i, 14) }, [
            h('td', null, [h('span', { class: 'qtxt', text: x.prompt }), h('span', { class: 'sub', text: 'Correct: ' + x.correct.join(' | ') })]),
            h('td', { class: 'num', text: String(x.n) }),
            h('td', null, [h('div', { class: 'scorebar' }, [h('div', { class: 'b' }, [h('i', { class: x.pct >= 75 ? 'ok' : x.pct >= 50 ? 'warn' : 'bad', style: 'width:' + x.pct + '%' })]), h('span', { class: 'num', text: x.pct + '%' })])]),
            h('td', null, [x.topWrong ? h('div', { class: 'wrongpick' }, [h('span', { text: x.topWrong.text }), h('span', { class: 'sub', text: x.topWrong.n + ' picks · ' + x.topWrong.share + '% of wrong answers' })]) : h('span', { class: 'muted', text: x.n && x.pct < 100 ? 'Mixed' : '–' })]),
            h('td', { class: 'num', text: x.avgSec != null ? x.avgSec + 's' : '–' }),
            h('td', { class: 'num', text: String(x.unanswered || 0) }),
          ]);
          tb.appendChild(tr);
        });
        holder.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', null, [h('tr', null, ['Question', 'Answers', 'Correct', 'Most picked wrong answer', 'Avg time', 'Not answered'].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), tb])]));
      } else if (tab === 'people') {
        var tb2 = h('tbody');
        data.byAgent.forEach(function (a, i) {
          var tr = h('tr', { class: 'click', tabindex: '0', style: '--i:' + Math.min(i, 14) }, [
            h('td', null, [h('b', { style: 'font-weight:500', text: a.name }), h('span', { class: 'sub', text: a.email })]),
            h('td', { class: 'num', text: String(a.n) }),
            h('td', null, [h('div', { class: 'scorebar' }, [h('div', { class: 'b' }, [h('i', { style: 'width:' + a.avg + '%' })]), h('span', { class: 'num', text: a.avg + '%' })])]),
            h('td', { class: 'num', text: a.best + '%' }),
            h('td', { class: 'num', text: a.passed + ' of ' + a.n }),
            h('td', null, [a.flagged ? pill(a.flagged + ' flagged', 'warn') : h('span', { class: 'muted', text: '–' })]),
            h('td', { class: 'num', text: fmtWhen(a.last) }),
            h('td', { class: 'act' }, [a.retestIds && a.retestIds.length ? h('button', { class: 'btn sm', type: 'button', title: 'Send ' + a.name + ' a retest of ' + (a.retestIds.length === 1 ? 'their latest assessment' : 'the ' + a.retestIds.length + ' assessments in this view'), onclick: function (e) {
              e.stopPropagation(); retestFlow({ attemptIds: a.retestIds, name: a.name }, function () { load(); });
            } }, [icon('retest', 'sm'), 'Retest']) : null]),
          ]);
          tr.addEventListener('click', function () { reportState.email = a.email; personSel.value = a.email; tab = 'overview'; Array.prototype.forEach.call(tabsEl.children, function (b, k) { b.setAttribute('aria-selected', String(k === 0)); }); load(); });
          // Attempt breakdown: every attempt for this person, with owner-only delete.
          var mine = (data.rows || []).filter(function (r) { return r.email === a.email; });
          var detail = h('tr', { class: 'att-detail', hidden: true }, [h('td', { colspan: '8' })]);
          var open = false;
          var tog = h('button', { class: 'btn sm ghost', type: 'button', 'aria-expanded': 'false', title: 'Show every attempt by ' + a.name }, [icon('layers', 'sm'), 'Attempts']);
          tog.addEventListener('click', function (e) {
            e.stopPropagation(); open = !open; tog.setAttribute('aria-expanded', String(open)); detail.hidden = !open;
            if (open && !detail.firstChild.firstChild) detail.firstChild.appendChild(attemptList(mine, a));
          });
          tr.querySelector('.act').insertBefore(tog, tr.querySelector('.act').firstChild);
          tb2.appendChild(tr); tb2.appendChild(detail);
        });
        function attemptList(list, a) {
          var wrap = h('div', { class: 'att-box' });
          if (!list.length) { wrap.appendChild(h('p', { class: 'small muted', text: 'No attempts in this view.' })); return wrap; }
          var sel = {};
          var delBtn = h('button', { class: 'btn sm danger', type: 'button', disabled: true }, [icon('trash', 'sm'), 'Delete selected']);
          function upd() { var n = Object.keys(sel).length; delBtn.disabled = !n; delBtn.lastChild.textContent = n ? 'Delete ' + n + ' selected' : 'Delete selected'; }
          var rowsEl = list.map(function (r) {
            var cb = me.owner ? h('input', { type: 'checkbox', 'aria-label': 'Select attempt ' + r.id, onchange: function (e) { if (e.target.checked) sel[r.id] = 1; else delete sel[r.id]; upd(); } }) : null;
            var status = r.status === 'submitted' ? (r.passed == null ? pill('Submitted', '') : r.passed ? pill('Passed', 'ok') : pill('Below pass', 'bad')) : pill(r.status === 'reset' ? 'Reset' : r.status === 'in_progress' ? 'In progress' : (r.status || ''), r.status === 'reset' ? 'warn' : 'accent');
            return h('tr', null, [h('td', { class: 'ck' }, [cb]), h('td', { text: r.test }), h('td', { class: 'num', text: r.pct != null ? r.pct + '% (' + r.score + '/' + r.maxScore + ')' : '-' }), h('td', null, [status]),
              h('td', null, [r.status === 'submitted' ? tierPill(r.tier) : h('span', { class: 'muted', text: '-' })]), h('td', { class: 'num', text: r.minutes != null ? r.minutes + ' min' : '-' }), h('td', { class: 'num', text: fmtWhen(r.finishedAt || r.startedAt) }),
              h('td', { class: 'act' }, [h('button', { class: 'btn sm ghost', type: 'button', text: 'Open', onclick: function () { go('attempt/' + r.id); } })])]);
          });
          wrap.appendChild(h('div', { class: 'row', style: 'align-items:center;margin-bottom:8px' }, [h('b', { text: list.length + ' attempt' + (list.length === 1 ? '' : 's') + ' by ' + a.name }), h('span', { class: 'spacer' }), me.owner ? delBtn : null]));
          wrap.appendChild(h('table', { class: 'tbl att-tbl' }, [h('thead', null, [h('tr', null, [me.owner ? '' : null, 'Assessment', 'Score', 'Result', 'Behaviour', 'Time taken', 'When', ''].map(function (x) { return x == null ? null : h('th', { scope: 'col', text: x }); }))]), h('tbody', null, rowsEl)]));
          delBtn.addEventListener('click', function () {
            var ids = Object.keys(sel).map(Number); if (!ids.length) return;
            if (!confirm('Delete ' + ids.length + ' attempt' + (ids.length === 1 ? '' : 's') + ' by ' + a.name + ' completely? Answers, activity logs and camera photos are removed for good. Reset is usually better, because it keeps the record.')) return;
            delBtn.disabled = true;
            api('/api/assess/admin/attempts/delete', { method: 'POST', body: { ids: ids } }).then(function (r) { toast(r.deleted + ' attempt' + (r.deleted === 1 ? '' : 's') + ' deleted'); load(); }).catch(function (e) { toast(e.message); delBtn.disabled = false; });
          });
          return wrap;
        }
        holder.appendChild(h('p', { class: 'small muted', text: 'Lowest average first. Click a person to see their overview, open Attempts for the full breakdown, or send them a retest of their latest attempt on each assessment in this view.' }));
        holder.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [h('thead', null, [h('tr', null, ['Agent', 'Attempts', 'Average', 'Best', 'Passed', 'Behaviour', 'Last', ''].map(function (t) { return h('th', { scope: 'col', text: t }); }))]), tb2])]));
      }
    }
    function printReport() {
      if (!data) return;
      var k = data.kpis;
      var nodes = [h('div', { class: 'pr-kpis' }, [['Attempts', k.attempts], ['People', k.people], ['Average', (k.avg != null ? k.avg + '%' : '–')], ['Pass rate', (k.passRate != null ? k.passRate + '%' : '–')]].map(function (x) { return h('div', null, [h('span', { text: x[0] }), h('b', { text: String(x[1]) })]); }))];
      nodes.push(h('h2', { text: 'By assessment' }));
      nodes.push(h('table', { class: 'pr-tbl' }, [h('thead', null, [h('tr', null, ['Assessment', 'Attempts', 'Average', 'Pass rate'].map(function (x) { return h('th', { text: x }); }))]), h('tbody', null, data.byTest.map(function (t) { return h('tr', null, [h('td', { text: t.test }), h('td', { text: String(t.n) }), h('td', { text: t.avg + '%' }), h('td', { text: t.passRate + '%' })]); }))]));
      nodes.push(h('h2', { text: 'People' }));
      nodes.push(h('table', { class: 'pr-tbl' }, [h('thead', null, [h('tr', null, ['Agent', 'Attempts', 'Average', 'Passed'].map(function (x) { return h('th', { text: x }); }))]), h('tbody', null, data.byAgent.map(function (a) { return h('tr', null, [h('td', { text: a.name }), h('td', { text: String(a.n) }), h('td', { text: a.avg + '%' }), h('td', { text: a.passed + ' of ' + a.n })]); }))]));
      nodes.push(h('h2', { text: 'Hardest questions' }));
      data.questions.slice(0, 10).forEach(function (x) { nodes.push(h('div', { class: 'pr-q' }, [h('div', { class: 'pr-qh' }, [h('b', { text: x.pct + '% correct · ' }), h('span', { text: x.prompt })]), x.topWrong ? h('div', { class: 'pr-meta', text: 'Most picked wrong: ' + x.topWrong.text + ' (' + x.topWrong.share + '% of wrong answers)' }) : null])); });
      printSheet('Assessment report', (reportState.from ? reportState.from + ' to ' + (reportState.to || 'today') : 'All time') + (reportState.tests.length ? ' · ' + reportState.tests.length + ' assessment(s)' : ''), nodes);
    }
    load();
  }

  // ── Reviewer: question bank ──────────────────────────────────────────
  var bankFilter = { q: '', status: '', type: '', tag: '', module: '', source: '', difficulty: '', used: '', from: '', to: '', when: '' };
  var bankSel = [], bankAutoTagged = false;
  function viewBank() {
    var dlq = function (ans) { var qs = new URLSearchParams({ answers: ans ? '1' : '0' }); if (bankFilter.status) qs.set('status', bankFilter.status); if (bankFilter.tag) qs.set('tag', bankFilter.tag); if (bankFilter.q) qs.set('q', bankFilter.q); return '/api/assess/admin/questions/export?' + qs; };
    loadMods();
    main.appendChild(pageHead('Question bank', 'Every question used in assessments. Drafts from documents land here for you to check before agents see them.', [
      menu('Download', 'download', [
        { label: 'Questions only (CSV)', sub: 'No answers. Safe to share for revision.', icon: 'doc', onclick: function () { location.href = dlq(false); } },
        { label: 'With answer key (CSV)', sub: 'Correct answers and explanations.', icon: 'lock', onclick: function () { location.href = dlq(true); } },
        { label: 'Print questions only', sub: 'Or save as PDF from the print window.', icon: 'print', onclick: function () { printBank(false, bankFilter); } },
        { label: 'Print with answer key', sub: 'For reviewers only.', icon: 'print', onclick: function () { printBank(true, bankFilter); } },
      ]),
      h('button', { class: 'btn', type: 'button', onclick: openImport }, [icon('upload', 'sm'), 'Import CSV']),
      h('button', { class: 'btn', type: 'button', onclick: function () { openQuestion(null); } }, [icon('plus', 'sm'), 'New question']),
      h('button', { class: 'btn', type: 'button', onclick: openGenerate }, [icon('spark', 'sm'), 'Quick draft']),
      h('button', { class: 'btn primary', type: 'button', onclick: function () { go('studio'); } }, [icon('bot', 'sm'), 'AI Studio']),
    ]));
    var search = h('input', { class: 'inp', type: 'search', placeholder: 'Search questions, options or tags', 'aria-label': 'Search questions', value: bankFilter.q });
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Status' });
    [['', 'All'], ['draft', 'Drafts'], ['approved', 'Approved']].forEach(function (o) {
      seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(bankFilter.status === o[0]), text: o[1], onclick: function () { bankFilter.status = o[0]; Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b === this)); }, this); load(); } }));
    });
    var typeSel = h('select', { class: 'sel', 'aria-label': 'Type' }, [h('option', { value: '', text: 'All types' })].concat(Object.keys(TYPE_SHORT).map(function (k) { return h('option', { value: k, text: TYPE_SHORT[k] }); })));
    typeSel.value = bankFilter.type;
    var tagSel = h('select', { class: 'sel', 'aria-label': 'Tag' }, [h('option', { value: '', text: 'All topics' })]);
    var modSel = h('select', { class: 'sel', 'aria-label': 'Module' }, [h('option', { value: '', text: 'All modules' })]);
    function fillMods(untagged) {
      var keep = bankFilter.module || ''; clear(modSel);
      modSel.appendChild(h('option', { value: '', text: 'All modules' }));
      if (untagged != null) modSel.appendChild(h('option', { value: '__none', text: 'No module yet (' + untagged + ')' }));
      var gs = {};
      (MODS || []).forEach(function (m) { if (!gs[m.group]) { gs[m.group] = h('optgroup', { label: m.group }); modSel.appendChild(gs[m.group]); } gs[m.group].appendChild(h('option', { value: m.key, text: m.name + ' (' + (m.questions || 0) + ')' })); });
      modSel.value = keep;
    }
    loadMods().then(function () { fillMods(null); });
    modSel.addEventListener('change', function () { bankFilter.module = modSel.value; load(); });
    var srcSel = h('select', { class: 'sel', 'aria-label': 'Upload' }, [h('option', { value: '', text: 'All uploads' })]);
    srcSel.addEventListener('change', function () { bankFilter.source = srcSel.value; load(); });
    var diffSel = h('select', { class: 'sel', 'aria-label': 'Difficulty' }, [['', 'Any difficulty'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    diffSel.value = bankFilter.difficulty; diffSel.addEventListener('change', function () { bankFilter.difficulty = diffSel.value; load(); });
    var usedSel = h('select', { class: 'sel', 'aria-label': 'Use' }, [['', 'Used or not'], ['unused', 'Not used yet'], ['used', 'Used in an assessment']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    usedSel.value = bankFilter.used; usedSel.addEventListener('change', function () { bankFilter.used = usedSel.value; load(); });
    function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    var fromIn = h('input', { class: 'inp', type: 'date', 'aria-label': 'Uploaded from', value: bankFilter.from }), toIn = h('input', { class: 'inp', type: 'date', 'aria-label': 'Uploaded to', value: bankFilter.to });
    var whenSel = h('select', { class: 'sel', 'aria-label': 'Date uploaded' }, [['', 'Any date'], ['today', 'Uploaded today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['custom', 'Pick dates']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    whenSel.value = bankFilter.when;
    function paintWhen() { var c = whenSel.value === 'custom'; fromIn.style.display = toIn.style.display = c ? '' : 'none'; }
    whenSel.addEventListener('change', function () {
      var v = whenSel.value, now = new Date(); bankFilter.when = v;
      if (v === 'today') { bankFilter.from = bankFilter.to = iso(now); }
      else if (v === '7' || v === '30') { var d0 = new Date(now.getTime() - (Number(v) - 1) * 86400000); bankFilter.from = iso(d0); bankFilter.to = iso(now); }
      else if (v === '') { bankFilter.from = bankFilter.to = ''; }
      paintWhen(); if (v !== 'custom') load();
    });
    fromIn.addEventListener('change', function () { bankFilter.from = fromIn.value; load(); });
    toIn.addEventListener('change', function () { bankFilter.to = toIn.value; load(); });
    paintWhen();
    typeSel.addEventListener('change', function () { bankFilter.type = typeSel.value; load(); });
    tagSel.addEventListener('change', function () { bankFilter.tag = tagSel.value; load(); });
    var st = 0; search.addEventListener('input', function () { clearTimeout(st); st = setTimeout(function () { bankFilter.q = search.value.trim(); load(); }, 250); });
    main.appendChild(h('div', { class: 'toolbar' }, [h('div', { class: 'search' }, [icon('search', 'sm'), search]), seg, typeSel, modSel, tagSel]));
    var clearF = h('button', { class: 'btn ghost sm', type: 'button', text: 'Clear filters', onclick: function () { bankFilter = { q: '', status: '', type: '', tag: '', module: '', source: '', difficulty: '', used: '', from: '', to: '', when: '' }; route(); } });
    main.appendChild(h('div', { class: 'toolbar' }, [srcSel, whenSel, fromIn, toIn, diffSel, usedSel, clearF]));
    var tagNote = h('div'); main.appendChild(tagNote);
    var selRow = h('div', { style: 'position:relative;z-index:30' }); main.appendChild(selRow);
    var bulk = h('div'); main.appendChild(bulk);
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    var sel = bankSel, shownQs = [], rowBoxes = {};
    function setSel(ids, add) {
      if (!add) sel.length = 0;
      ids.forEach(function (id) { if (sel.indexOf(id) < 0) sel.push(id); });
      Object.keys(rowBoxes).forEach(function (k) { rowBoxes[k].checked = sel.indexOf(Number(k)) >= 0; });
      renderBulk();
    }
    function renderSelRow() {
      clear(selRow);
      if (!shownQs.length) return;
      var ids = shownQs.map(function (q) { return q.id; });
      var inShown = ids.filter(function (id) { return sel.indexOf(id) >= 0; }).length;
      var master = h('input', { type: 'checkbox', 'aria-label': 'Select all shown', checked: inShown === ids.length ? true : null });
      master.indeterminate = inShown > 0 && inShown < ids.length;
      master.addEventListener('change', function () { if (master.checked) setSel(ids, true); else { for (var i = sel.length - 1; i >= 0; i--) if (ids.indexOf(sel[i]) >= 0) sel.splice(i, 1); setSel([], true); } });
      function pick(fn) { return function () { setSel(shownQs.filter(fn).map(function (q) { return q.id; }), true); }; }
      function firstN(n) { return function () { setSel(ids.slice(0, n), false); }; }
      var items = [
        { label: 'Select all ' + ids.length + ' shown', sub: 'Everything that matches the filters above.', icon: 'check', onclick: function () { setSel(ids, true); } },
        { label: 'Select none', sub: 'Clear the whole selection.', icon: 'x', onclick: function () { setSel([], false); } },
        { label: 'Select drafts only', sub: 'Just the ones waiting for review.', icon: 'edit', onclick: function () { setSel(shownQs.filter(function (q) { return q.status === 'draft'; }).map(function (q) { return q.id; }), false); } },
        { label: 'Select approved only', sub: 'Questions agents can already see.', icon: 'shield', onclick: function () { setSel(shownQs.filter(function (q) { return q.status === 'approved'; }).map(function (q) { return q.id; }), false); } },
        { label: 'Select ones not used yet', sub: 'Not in any assessment.', icon: 'log', onclick: function () { setSel(shownQs.filter(function (q) { return !q.usedIn.length; }).map(function (q) { return q.id; }), false); } },
        { label: 'Select ones with no module', sub: 'Then use Tag modules.', icon: 'layers', onclick: function () { setSel(shownQs.filter(function (q) { return !q.module; }).map(function (q) { return q.id; }), false); } },
        { label: 'Select the first 10', sub: 'A small batch from the top of the list.', icon: 'list', onclick: firstN(10) },
        { label: 'Select the first 25', sub: 'A medium batch.', icon: 'list', onclick: firstN(25) },
        { label: 'Select the first 50', sub: 'A large batch.', icon: 'list', onclick: firstN(50) },
      ];
      selRow.appendChild(h('div', { class: 'selrow' }, [h('label', { class: 'selall' }, [master, h('span', { text: 'All shown' })]), menu('Select', 'check', items), h('span', { class: 'small muted', text: 'Filters keep your selection, so you can pick from several uploads or dates.' })]));
    }
    function renderBulk() {
      clear(bulk); renderSelRow();
      if (!sel.length) return;
      function act(action, label) { return h('button', { class: 'btn', type: 'button', text: label, onclick: function () {
        if (action === 'delete' && !confirm('Delete ' + sel.length + ' question(s)? Questions already used in an attempt are retired instead, so past results keep them.')) return;
        api('/api/assess/admin/questions/bulk', { method: 'POST', body: { ids: sel, action: action } }).then(function (r) { toast(r.changed + ' updated'); sel.length = 0; load(); }).catch(function (e) { toast(e.message); });
      } }); }
      var mkAssess = h('button', { class: 'btn primary', type: 'button' }, [icon('wand', 'sm'), 'Create assessment']);
      mkAssess.addEventListener('click', function () { createFromDrafts(sel.slice(), mkAssess); });
      var tagMods = h('button', { class: 'btn', type: 'button' }, [icon('layers', 'sm'), 'Tag modules']);
      tagMods.addEventListener('click', function () {
        tagMods.disabled = true; tagMods.classList.add('busy');
        api('/api/assess/admin/questions/tag', { method: 'POST', body: { ids: sel, force: true } }).then(function (r) { toast(r.tagged + ' question' + (r.tagged === 1 ? '' : 's') + ' tagged'); loadMods(true).then(function () { load(); }); }).catch(function (e) { toast(e.message); tagMods.disabled = false; tagMods.classList.remove('busy'); });
      });
      bulk.appendChild(h('div', { class: 'bulk' }, [h('b', { text: sel.length + ' selected' }), h('span', { class: 'spacer' }), mkAssess, tagMods, act('approve', 'Approve'), act('draft', 'Move to drafts'), act('delete', 'Delete'), h('button', { class: 'btn', type: 'button', text: 'Clear', onclick: function () { sel.length = 0; load(); } })]));
    }
    function load() {
      var p = new URLSearchParams(bankFilter);
      api('/api/assess/admin/questions?' + p.toString()).then(function (j) {
        clear(holder);
        var cur = tagSel.value; clear(tagSel); tagSel.appendChild(h('option', { value: '', text: 'All topics' }));
        j.tags.forEach(function (t) { tagSel.appendChild(h('option', { value: t.tag, text: t.tag + ' (' + t.n + ')' })); }); tagSel.value = cur;
        shownQs = j.questions; rowBoxes = {};
        var fac = j.facets || { sources: [], untagged: 0 };
        var keepSrc = bankFilter.source || ''; clear(srcSel); srcSel.appendChild(h('option', { value: '', text: 'All uploads' }));
        (fac.sources || []).forEach(function (x) { srcSel.appendChild(h('option', { value: x.name, text: x.name.replace(/^AI draft: /, '') + ' (' + x.n + ')' })); });
        srcSel.value = keepSrc;
        loadMods(true).then(function () { fillMods(fac.untagged); });
        clear(tagNote);
        if (fac.untagged) tagNote.appendChild(h('div', { class: 'note', style: 'margin-bottom:12px' }, [icon('layers', 'sm'), h('span', { text: fac.untagged + ' question' + (fac.untagged === 1 ? ' has' : 's have') + ' no module yet. ' }), h('button', { class: 'btn sm', type: 'button', text: 'Tag them all', onclick: function (e) { autoTag(e.currentTarget); } })]));
        if (fac.untagged && !bankAutoTagged) { bankAutoTagged = true; autoTag(null); }
        renderBulk();
        if (!j.questions.length) {
          holder.appendChild(h('div', { class: 'empty' }, [art('log'), h('b', { text: bankFilter.q || bankFilter.status || bankFilter.tag || bankFilter.type || bankFilter.module || bankFilter.source || bankFilter.from || bankFilter.to || bankFilter.difficulty || bankFilter.used ? 'No questions match' : 'The bank is empty' }), h('span', { text: 'Draft questions from an SOP or KB document, import a CSV, or write one.' })]));
          return;
        }
        var drafts = j.questions.filter(function (q) { return q.status === 'draft'; }).length;
        var allIds = j.questions.map(function (q) { return q.id; });
        var draftIds = j.questions.filter(function (q) { return q.status === 'draft'; }).map(function (q) { return q.id; });
        var mkBtn = h('button', { class: 'btn primary sm', type: 'button' }, [icon('wand', 'sm'), drafts && drafts === j.questions.length ? 'Create an assessment from these ' + drafts + ' drafts' : 'Create an assessment from these ' + Math.min(allIds.length, 200) + ' questions']);
        mkBtn.addEventListener('click', function () { if (allIds.length > 200) toast('An assessment holds up to 200 questions. Using the first 200.'); createFromDrafts(allIds.slice(0, 200), mkBtn); });
        var mkDrafts = drafts && drafts < j.questions.length ? h('button', { class: 'btn sm', type: 'button', text: 'Only the ' + drafts + ' drafts' }) : null;
        if (mkDrafts) mkDrafts.addEventListener('click', function () { createFromDrafts(draftIds, mkDrafts); });
        holder.appendChild(h('div', { class: 'row small muted', style: 'margin-bottom:10px;align-items:center' }, [h('span', { text: j.questions.length + ' questions' + (drafts ? ', ' + drafts + ' drafts waiting for review' : '') }), h('span', { class: 'spacer' }), mkDrafts, mkBtn]));
        var list = h('div', { class: 'card qlist' });
        j.questions.forEach(function (q) {
          var cb = h('input', { type: 'checkbox', 'aria-label': 'Select question', checked: sel.indexOf(q.id) >= 0 ? true : null });
          rowBoxes[q.id] = cb;
          cb.addEventListener('change', function () { var at = sel.indexOf(q.id); if (cb.checked && at < 0) sel.push(q.id); if (!cb.checked && at >= 0) sel.splice(at, 1); renderBulk(); });
          var stats = q.stats && q.stats.shown ? 'Seen ' + q.stats.shown + 'x · ' + q.stats.pctCorrect + '% correct' + (q.stats.avgSec != null ? ' · ' + q.stats.avgSec + 's average' : '') + (q.stats.disc != null ? ' · separation ' + q.stats.disc : '') : 'Not used yet';
          list.appendChild(h('div', { class: 'qrow' }, [cb,
            h('div', { style: 'min-width:0' }, [
              h('div', { class: 'p', role: 'button', tabindex: '0', text: q.prompt, onclick: function () { openQuestion(q); }, onkeydown: function (e) { if (e.key === 'Enter') openQuestion(q); } }),
              h('div', { class: 'm' }, [q.module ? modChip({ key: q.module }, q.subModule) : null, pill(TYPE_SHORT[q.type] || q.type), pill(q.difficulty || 'medium'), q.hasImage ? pill('Image') : null].concat(q.tags.map(function (t) { return pill('#' + t, 'accent'); })).concat(q.source ? [h('span', { class: 'small muted', text: q.source })] : [])),
              h('div', { class: 's', text: stats + (q.usedIn.length ? ' · in ' + q.usedIn.join(', ') : '') }),
              q.stats && q.stats.flag ? h('div', { class: 'flag' }, [icon('warn', 'sm'), q.stats.flag]) : null,
            ]),
            h('div', { class: 'row', style: 'flex-wrap:nowrap' }, [q.status === 'draft' ? pill('Draft', 'warn', true) : pill('Approved', 'ok', true), h('button', { class: 'btn sm', type: 'button', text: 'Edit', onclick: function () { openQuestion(q); } })]),
          ]));
        });
        holder.appendChild(list);
      }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
    }
    function autoTag(btn) {
      if (btn) { btn.disabled = true; btn.classList.add('busy'); }
      api('/api/assess/admin/questions/tag', { method: 'POST', body: { untagged: true } }).then(function (r) {
        if (r.tagged) toast(r.tagged + ' existing question' + (r.tagged === 1 ? '' : 's') + ' tagged with a module');
        loadMods(true).then(function () { load(); });
      }).catch(function (e) { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } if (btn) toast(e.message); });
    }
    main._reloadBank = load;
    load();
  }
  function reloadBank() { if (main._reloadBank && location.hash === '#bank') main._reloadBank(); }

  function openQuestion(q, studioOpts) {
    studioOpts = studioOpts || null;
    var d = q || { type: 'single', prompt: '', options: ['', '', '', ''], correct: [], explanation: '', tags: [], difficulty: 'medium', status: 'draft' };
    var type = d.type, correct = d.correct.slice();
    // rows: [{text, match}]
    var rows = d.type === 'truefalse' ? [{ text: 'True' }, { text: 'False' }]
      : d.type === 'ordering' ? d.correct.map(function (id) { return { text: d.options[id] || '' }; })
      : d.options.map(function (t, i) { return { text: t, match: d.matches ? d.matches[i] : '' }; });
    var body = h('div'), err = h('div');
    var prompt = h('textarea', { class: 'ta', id: 'qe-p', maxlength: '1500', required: true, placeholder: 'A customer says… What do you do first?' }); prompt.value = d.prompt;
    var typeSeg = h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Question type' });
    var optHint = h('span', { class: 'hint' });
    Object.keys(TYPE_SHORT).forEach(function (k) {
      typeSeg.appendChild(h('button', { type: 'button', 'data-k': k, 'aria-pressed': String(type === k), text: TYPE_SHORT[k], onclick: function () {
        if (k === 'truefalse') { rows = [{ text: 'True' }, { text: 'False' }]; correct = correct.filter(function (c) { return c < 2; }).slice(0, 1); }
        else if (type === 'truefalse') { rows = [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]; correct = []; }
        if (k === 'single' && correct.length > 1) correct = correct.slice(0, 1);
        if ((k === 'ordering' || k === 'matching') && rows.length < 3) while (rows.length < 3) rows.push({ text: '' });
        type = k; Array.prototype.forEach.call(typeSeg.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === k)); }); drawOpts();
      } }));
    });
    var optBox = h('div');
    function drawOpts() {
      clear(optBox);
      optHint.textContent = type === 'ordering' ? 'Enter the steps in the correct order. Agents see them shuffled and put them back in order.'
        : type === 'matching' ? 'Each item and its correct match. Agents see the matches shuffled.'
        : 'Tick the correct answer' + (type === 'multi' ? 's.' : '.');
      rows.forEach(function (o, i) {
        var line = h('div', { class: 'optedit' });
        if (type === 'ordering') {
          line.appendChild(h('span', { class: 'ordn', text: String(i + 1) }));
        } else if (type !== 'matching') {
          var on = correct.indexOf(i) >= 0;
          var mark = h('button', { class: 'mark', type: 'button', 'aria-pressed': String(on), 'aria-label': 'Mark option ' + LETTERS[i] + ' as correct', title: 'Correct answer' }, [icon('check', 'sm')]);
          mark.addEventListener('click', function () { if (type === 'multi') { var at = correct.indexOf(i); if (at >= 0) correct.splice(at, 1); else correct.push(i); } else correct = [i]; drawOpts(); });
          line.appendChild(mark);
        }
        var inp = h('input', { class: 'inp', value: o.text || '', maxlength: '400', 'aria-label': (type === 'matching' ? 'Item ' : type === 'ordering' ? 'Step ' : 'Option ') + (i + 1), readonly: type === 'truefalse' ? true : null, placeholder: type === 'matching' ? 'Item, for example "Terminal declines cards"' : type === 'ordering' ? 'Step ' + (i + 1) : 'Option ' + LETTERS[i] });
        inp.addEventListener('input', function () { rows[i].text = inp.value; });
        line.appendChild(inp);
        if (type === 'matching') {
          line.appendChild(h('span', { class: 'muted', text: '→' }));
          var mi = h('input', { class: 'inp', value: o.match || '', maxlength: '300', 'aria-label': 'Match for item ' + (i + 1), placeholder: 'Match, for example "Adit Pay team"' });
          mi.addEventListener('input', function () { rows[i].match = mi.value; });
          line.appendChild(mi);
        }
        if (type === 'ordering') {
          line.appendChild(h('button', { class: 'btn icon ghost sm', type: 'button', 'aria-label': 'Move step ' + (i + 1) + ' up', disabled: i === 0, onclick: function () { var x = rows[i]; rows[i] = rows[i - 1]; rows[i - 1] = x; drawOpts(); } }, [h('span', { text: '↑' })]));
          line.appendChild(h('button', { class: 'btn icon ghost sm', type: 'button', 'aria-label': 'Move step ' + (i + 1) + ' down', disabled: i === rows.length - 1, onclick: function () { var x = rows[i]; rows[i] = rows[i + 1]; rows[i + 1] = x; drawOpts(); } }, [h('span', { text: '↓' })]));
        }
        var minRows = type === 'ordering' || type === 'matching' ? 3 : 2;
        if (type !== 'truefalse' && rows.length > minRows) line.appendChild(h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Remove row ' + (i + 1), onclick: function () { rows.splice(i, 1); correct = correct.filter(function (c) { return c !== i; }).map(function (c) { return c > i ? c - 1 : c; }); drawOpts(); } }, [icon('x', 'sm')]));
        optBox.appendChild(line);
      });
      var max = type === 'matching' ? 6 : 8;
      if (type !== 'truefalse' && rows.length < max) optBox.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { rows.push({ text: '', match: '' }); drawOpts(); } }, [icon('plus', 'sm'), type === 'ordering' ? 'Add step' : type === 'matching' ? 'Add pair' : 'Add option']));
    }
    drawOpts();
    // Image
    var imgFile = null, removeImg = false;
    var imgPrev = h('div', { class: 'qimg-edit' });
    var imgIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'qe-img', class: 'inp', style: 'padding-top:6px' });
    function drawImg() {
      clear(imgPrev);
      if (imgFile) imgPrev.appendChild(h('img', { src: URL.createObjectURL(imgFile), alt: 'Selected image' }));
      else if (q && q.hasImage && !removeImg) imgPrev.appendChild(h('img', { src: '/api/assess/admin/questions/' + q.id + '/image?t=' + Date.now(), alt: 'Current image' }));
      if (imgFile || (q && q.hasImage && !removeImg)) imgPrev.appendChild(h('button', { class: 'btn sm ghost danger', type: 'button', text: 'Remove image', onclick: function () { imgFile = null; removeImg = true; imgIn.value = ''; drawImg(); } }));
    }
    imgIn.addEventListener('change', function () { var f = imgIn.files[0]; if (f && f.size > 2 * 1024 * 1024) { toast('Images must be under 2 MB'); imgIn.value = ''; return; } imgFile = f || null; removeImg = false; drawImg(); });
    drawImg();
    var expl = h('textarea', { class: 'ta', id: 'qe-e', maxlength: '1500', placeholder: 'Only reviewers see this, unless you release answers. Cite the SOP section if you can.' }); expl.value = d.explanation || '';
    var tags = h('input', { class: 'inp', id: 'qe-t', value: d.tags.join(', '), placeholder: 'escalation, adit pay' });
    var modSel = h('select', { class: 'sel', id: 'qe-m' }, [h('option', { value: '', text: 'No module' })]);
    var subIn = h('input', { class: 'inp', id: 'qe-sm', type: 'text', maxlength: '40', value: d.subModule || '', placeholder: 'e.g. Ring Groups', list: 'qe-sm-l' });
    var subDl = h('datalist', { id: 'qe-sm-l' });
    function fillSubs() { clear(subDl); var m = MOD_BY[modSel.value]; if (m) (m.subs || []).forEach(function (x) { subDl.appendChild(h('option', { value: x })); }); }
    loadMods().then(function () {
      var gs = {}; MODS.forEach(function (m) { if (!gs[m.group]) { gs[m.group] = h('optgroup', { label: m.group }); modSel.appendChild(gs[m.group]); } gs[m.group].appendChild(h('option', { value: m.key, text: m.name })); });
      modSel.value = d.module || ''; fillSubs();
    });
    modSel.addEventListener('change', fillSubs);
    var diff = h('select', { class: 'sel', id: 'qe-d' }, [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); diff.value = d.difficulty || 'medium';
    var stat = h('select', { class: 'sel', id: 'qe-s' }, [['draft', 'Draft'], ['approved', 'Approved']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); stat.value = d.status === 'approved' ? 'approved' : 'draft';
    // Session 64: AI improve (clearer wording, better wrong options, explanation)
    if (me.ai && (me.ai.anthropic || me.ai.openai)) {
      var impIn = h('input', { class: 'inp', style: 'flex:1;min-width:180px', maxlength: '300', placeholder: 'Optional: what to change, e.g. "make it a scenario" or "harder wrong options"', 'aria-label': 'What to improve' });
      var impNote = h('div', { class: 'small', style: 'flex-basis:100%' });
      var undo = null;
      var impBtn = h('button', { class: 'btn sm ai-btn', type: 'button' }, [icon('wand', 'sm'), 'Improve with AI']);
      impBtn.addEventListener('click', function () {
        var cur = { type: type, prompt: prompt.value, options: type === 'matching' ? rows.map(function (r) { return { text: r.text, match: r.match }; }) : rows.map(function (r) { return r.text; }), correct: type === 'ordering' ? [] : correct.slice(), explanation: expl.value, tags: tags.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean), difficulty: diff.value };
        if (type === 'matching') cur.pairs = rows.map(function (r) { return [r.text, r.match]; });
        undo = { type: type, prompt: prompt.value, rows: JSON.parse(JSON.stringify(rows)), correct: correct.slice(), expl: expl.value };
        impBtn.disabled = true; impBtn.classList.add('busy'); impNote.className = 'small muted'; impNote.textContent = 'Thinking…';
        api('/api/assess/admin/questions/improve', { method: 'POST', body: { question: cur, instruction: impIn.value } }).then(function (r) {
          var nq = r.question;
          type = nq.type || type;
          Array.prototype.forEach.call(typeSeg.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === type)); });
          prompt.value = nq.prompt || prompt.value;
          if (type === 'matching') rows = (nq.options || []).map(function (o) { return { text: o.text || o[0], match: o.match || o[1] }; });
          else if (type === 'truefalse') rows = [{ text: 'True' }, { text: 'False' }];
          else rows = (nq.options || []).map(function (t) { return { text: typeof t === 'string' ? t : t.text }; });
          correct = type === 'ordering' || type === 'matching' ? [] : (nq.correct || []).map(Number);
          if (nq.explanation) expl.value = nq.explanation;
          if (nq.difficulty) diff.value = nq.difficulty;
          drawOpts();
          clear(impNote); impNote.className = 'small ai-note';
          impNote.appendChild(h('span', { text: 'Changed: ' + (r.changes || 'wording and options') + '. Check it, then save. ' }));
          impNote.appendChild(h('button', { class: 'linkbtn small', type: 'button', text: 'Undo', onclick: function () { if (!undo) return; type = undo.type; prompt.value = undo.prompt; rows = undo.rows; correct = undo.correct; expl.value = undo.expl; Array.prototype.forEach.call(typeSeg.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === type)); }); drawOpts(); clear(impNote); } }));
        }).catch(function (e) { impNote.className = 'small'; impNote.style.color = 'var(--bad)'; impNote.textContent = e.message; })
          .finally(function () { impBtn.disabled = false; impBtn.classList.remove('busy'); });
      });
      body.appendChild(h('div', { class: 'ai-bar' }, [impBtn, impIn, impNote]));
    }
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'lbl', text: 'Type' }), typeSeg]));
    body.appendChild(field('Question', prompt, 'Scenario and judgement questions are the hardest to look up.'));
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'lbl', text: 'Answers' }), optHint, optBox]));
    if (!studioOpts) body.appendChild(h('div', { class: 'field' }, [h('label', { for: 'qe-img', text: 'Image (optional)' }), h('span', { class: 'hint', text: 'For example a ticket or screen from Zoho Desk. Shown with the question. PNG, JPG or WebP under 2 MB. Remove customer details first.' }), imgIn, imgPrev]));
    body.appendChild(field('Why this is the answer', expl));
    body.appendChild(h('div', { class: 'fgrid' }, [field('Module', modSel), field('Sub-module', subIn), subDl]));
    body.appendChild(h('div', { class: 'fgrid' }, [field('Topics (tags)', tags, 'Comma separated'), field('Difficulty', diff)]));
    if (!studioOpts) body.appendChild(field('Status', stat, 'Only approved questions go into random pools.'));
    if (d.stats && d.stats.shown) body.appendChild(h('div', { class: 'alert info' }, [icon('chart'), h('span', { text: 'Seen ' + d.stats.shown + ' times, ' + d.stats.pctCorrect + '% correct' + (d.stats.avgSec != null ? ', ' + d.stats.avgSec + 's on average' : '') + (d.stats.disc != null ? ', separation ' + d.stats.disc : '') + '.' + (d.stats.flag ? ' ' + d.stats.flag : '') })]));
    body.appendChild(err);
    var save = h('button', { class: 'btn primary', type: 'button', text: 'Save question' });
    var del = q && !studioOpts ? h('button', { class: 'btn ghost danger', type: 'button' }, [icon('trash', 'sm'), 'Delete']) : null;
    if (studioOpts) save.textContent = 'Keep changes';
    var dlg = openDrawer(studioOpts ? 'Edit draft question' : (q ? 'Edit question' : 'New question'), body, [del, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } }), save]);
    save.addEventListener('click', function () {
      clear(err); save.disabled = true;
      var options = type === 'matching' ? rows.map(function (r) { return { text: r.text, match: r.match }; }) : rows.map(function (r) { return r.text; });
      var payload = { type: type, prompt: prompt.value, options: options, correct: correct, explanation: expl.value, tags: tags.value, difficulty: diff.value, status: stat.value, module: modSel.value, subModule: subIn.value };
      if (studioOpts) { payload.tags = String(tags.value).split(',').map(function (x) { return x.trim(); }).filter(Boolean); Promise.resolve(studioOpts.onSave(payload)).then(function () { dlg.close(); }).catch(function (e) { err.appendChild(errBox(e.message)); save.disabled = false; }); return; }
      (q ? api('/api/assess/admin/questions/' + q.id, { method: 'PUT', body: payload }) : api('/api/assess/admin/questions', { method: 'POST', body: payload }))
        .then(function (r) {
          var qid = q ? q.id : r.id;
          if (imgFile) return api('/api/assess/admin/questions/' + qid + '/image', { method: 'PUT', raw: imgFile, contentType: imgFile.type });
          if (removeImg && q && q.hasImage) return api('/api/assess/admin/questions/' + qid + '/image', { method: 'DELETE' });
        })
        .then(function () { toast('Question saved'); dlg.close(); reloadBank(); })
        .catch(function (e) { err.appendChild(errBox(e.message)); save.disabled = false; });
    });
    if (del) del.addEventListener('click', function () {
      if (!confirm('Delete this question? If it was already used in an attempt it is retired instead, so past results keep it.')) return;
      api('/api/assess/admin/questions/' + q.id, { method: 'DELETE' }).then(function (r) { toast(r.result === 'retired' ? 'Question retired' : 'Question deleted'); dlg.close(); reloadBank(); }).catch(function (e) { err.appendChild(errBox(e.message)); });
    });
    setTimeout(function () { prompt.focus(); }, 80);
  }

  function openGenerate() {
    var mode = 'file', file = null;
    var body = h('div'), err = h('div'), out = h('div');
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Source' });
    var fileBox = h('div'), textBox = h('div', { style: 'display:none' });
    [['file', 'Upload a file'], ['text', 'Paste text']].forEach(function (o) {
      seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(mode === o[0]), text: o[1], onclick: function () { mode = o[0]; Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(b.textContent === o[1])); }); fileBox.style.display = mode === 'file' ? '' : 'none'; textBox.style.display = mode === 'text' ? '' : 'none'; } }));
    });
    var input = h('input', { type: 'file', accept: '.pdf,.docx,.txt,.md', style: 'display:none' });
    var fname = h('span', { class: 'small muted', text: 'PDF, Word (.docx) or text, up to 15 MB' });
    var drop = h('div', { class: 'drop', role: 'button', tabindex: '0' }, [icon('upload', 'lg'), h('b', { text: 'Choose a file or drop it here' }), fname, input]);
    function setFile(f) { file = f; fname.textContent = f ? f.name + ' (' + Math.round(f.size / 1024) + ' KB)' : 'PDF, Word (.docx) or text, up to 15 MB'; }
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { setFile(input.files[0] || null); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); setFile(e.dataTransfer.files[0] || null); });
    fileBox.appendChild(drop);
    var paste = h('textarea', { class: 'ta', id: 'gen-text', placeholder: 'Paste SOP, KB or process text here', style: 'min-height:180px' });
    textBox.appendChild(field('Text', paste));
    var count = h('select', { class: 'sel', id: 'gen-n' }, [5, 10, 15, 20, 25].map(function (n) { return h('option', { value: String(n), text: n + ' questions' }); })); count.value = '10';
    var diff = h('select', { class: 'sel', id: 'gen-d' }, [['', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var types = {}; var typeRow = h('div', { class: 'row' });
    Object.keys(TYPE_SHORT).forEach(function (k) { var cb = h('input', { type: 'checkbox', checked: true }); types[k] = cb; typeRow.appendChild(h('label', { class: 'chk' }, [cb, TYPE_SHORT[k]])); });
    var focus = h('textarea', { class: 'ta', id: 'gen-f', placeholder: 'Optional. For example: escalation owners and time limits, not product features.', style: 'min-height:70px' });
    body.appendChild(h('div', { class: 'field' }, [seg])); body.appendChild(fileBox); body.appendChild(textBox);
    body.appendChild(h('div', { class: 'fgrid', style: 'margin-top:16px' }, [field('How many', count), field('Difficulty', diff)]));
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'lbl', text: 'Question types' }), typeRow]));
    body.appendChild(field('What to focus on', focus, 'Internal process, owners, time limits and edge cases are the hardest for AI to answer.'));
    body.appendChild(h('div', { class: 'alert info' }, [icon('shield'), h('span', { text: 'Questions are drafted only from this document and saved as drafts. Nothing reaches agents until you approve it. The document text is sent to ' + (me.ai && me.ai.anthropic ? 'Anthropic (Claude)' : 'OpenAI') + ' to write the drafts and is not stored.' })]));
    body.appendChild(err); body.appendChild(out);
    var go_ = h('button', { class: 'btn primary', type: 'button' }, [icon('spark', 'sm'), 'Draft questions']);
    var dlg = openDrawer('Draft questions from a document', body, [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { dlg.close(); } }), go_]);
    go_.addEventListener('click', function () {
      clear(err); clear(out);
      var tsel = Object.keys(types).filter(function (k) { return types[k].checked; });
      if (!tsel.length) { err.appendChild(errBox('Pick at least one question type.')); return; }
      var raw, name, kind;
      if (mode === 'file') { if (!file) { err.appendChild(errBox('Choose a file first.')); return; } if (file.size > 15 * 1024 * 1024) { err.appendChild(errBox('That file is over 15 MB.')); return; } raw = file; name = file.name; kind = 'file'; }
      else { if (paste.value.trim().length < 200) { err.appendChild(errBox('Paste at least a few paragraphs.')); return; } raw = paste.value; name = 'Pasted text'; kind = 'text'; }
      go_.disabled = true;
      var started = Date.now();
      var prog = h('div', { class: 'alert info', role: 'status' }, [icon('hourglass'), h('span', { text: 'Reading the document and drafting questions. This can take up to a minute.' })]);
      out.appendChild(prog);
      var tmr = setInterval(function () { prog.lastChild.textContent = 'Reading the document and drafting questions (' + Math.round((Date.now() - started) / 1000) + 's). This can take up to a minute.'; }, 1000);
      var p = new URLSearchParams({ name: name, kind: kind, count: count.value, types: tsel.join(','), difficulty: diff.value, focus: focus.value.slice(0, 400) });
      api('/api/assess/admin/generate?' + p.toString(), { method: 'POST', raw: raw, contentType: kind === 'text' ? 'text/plain' : 'application/octet-stream' })
        .then(function (r) {
          clearInterval(tmr); clear(out); go_.disabled = false;
          out.appendChild(h('div', { class: 'alert info' }, [icon('check'), h('span', { text: r.created + ' draft questions added to the bank.' + (r.errors && r.errors.length ? ' ' + r.errors.length + ' were skipped because they were incomplete.' : '') })]));
          out.appendChild(h('p', { style: 'margin:14px 0 4px;font-weight:600', text: 'Convert this set of ' + r.created + ' into an assessment?' }));
          out.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'The questions are approved and it opens as a draft assessment you can adjust. Nothing reaches agents until you publish.' }));
          var mk = h('button', { class: 'btn primary', type: 'button' }, [icon('wand', 'sm'), 'Yes, convert it']);
          mk.addEventListener('click', function () { createFromDrafts(r.ids, mk, name).then(function () { dlg.close(); }); });
          out.appendChild(h('div', { class: 'row', style: 'margin-top:10px' }, [mk]));
          out.appendChild(h('button', { class: 'btn', type: 'button', style: 'margin-top:8px', text: 'Not now, review the drafts first', onclick: function () { dlg.close(); bankFilter = { q: '', status: 'draft', type: '', tag: '', module: '', source: '', difficulty: '', used: '', from: '', to: '', when: '' }; if (location.hash === '#bank') route(); else go('bank'); } }));
        })
        .catch(function (e) { clearInterval(tmr); clear(out); err.appendChild(errBox(e.message)); go_.disabled = false; });
    });
  }

  function openImport() {
    var body = h('div'), err = h('div'), out = h('div');
    var tmpl = 'type,question,option1,option2,option3,option4,correct,tags,difficulty,explanation\n' +
      'single,"A customer says X. What do you do first?","Option A","Option B","Option C","Option D",B,"escalation",medium,"Per SOP 3.2"\n' +
      'multi,"Select everything that must be in a hand-off note.","What the customer said","What you checked","Your opinion","What you need next","A,B,D","handoff",easy,\n' +
      'truefalse,"You can close a ticket without a reply if the customer called in.",True,False,,,B,"tickets",easy,\n';
    var link = h('a', { class: 'btn sm', download: 'question-template.csv', href: URL.createObjectURL(new Blob([tmpl], { type: 'text/csv' })) }, [icon('download', 'sm'), 'Download the template']);
    body.appendChild(h('p', { class: 'muted', style: 'margin-top:0', text: 'One question per row. Put the correct option letters in "correct" (for example B, or A,C for several). Everything is imported as a draft.' }));
    body.appendChild(link);
    var input = h('input', { type: 'file', accept: '.csv,text/csv', id: 'imp-f', class: 'inp', style: 'width:100%;margin-top:16px;padding-top:6px' });
    body.appendChild(field('CSV file', input));
    body.appendChild(err); body.appendChild(out);
    var go_ = h('button', { class: 'btn primary', type: 'button', text: 'Import' });
    var dlg = openDrawer('Import questions from CSV', body, [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { dlg.close(); } }), go_]);
    go_.addEventListener('click', function () {
      clear(err); clear(out);
      var f = input.files[0]; if (!f) { err.appendChild(errBox('Choose a CSV file.')); return; }
      go_.disabled = true;
      f.text().then(function (txt) { return api('/api/assess/admin/questions/import?name=' + encodeURIComponent(f.name), { method: 'POST', raw: txt, contentType: 'text/csv' }); })
        .then(function (r) {
          go_.disabled = false;
          out.appendChild(h('div', { class: 'alert info' }, [icon('check'), h('span', { text: r.imported + ' questions imported as drafts.' })]));
          if (r.errors && r.errors.length) out.appendChild(h('div', { class: 'alert warn' }, [icon('warn'), h('span', { text: r.errors.slice(0, 6).join(' · ') + (r.errors.length > 6 ? ' …' : '') })]));
          reloadBank();
        }).catch(function (e) { go_.disabled = false; err.appendChild(errBox(e.message)); });
    });
  }

  // ── People picker (Session 59): Zoho Desk users + teams, typeahead ───
  var dirCache = null;
  function loadDirectory(refresh) {
    if (dirCache && !refresh) return Promise.resolve(dirCache);
    return api('/api/assess/admin/directory' + (refresh ? '?refresh=1' : '')).then(function (j) { dirCache = j.people; return dirCache; });
  }
  function teamsOf(p) { var t = (p.deskTeams || []).slice(); if (p.team && t.indexOf(p.team) < 0) t.push(p.team); return t; }
  function PeoplePicker(opts) {
    var chosen = [], people = [], active = -1, matches = [];
    var uid = 'pp' + Math.random().toString(36).slice(2, 8);
    var input = h('input', { class: 'inp', id: uid + '-in', type: 'text', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': uid + '-lb', 'aria-autocomplete': 'list', placeholder: opts.placeholder || 'Type a name or email', style: 'width:100%' });
    var lb = h('div', { class: 'pp-list', id: uid + '-lb', role: 'listbox', hidden: true });
    var chips = h('div', { class: 'chips', style: 'margin-top:8px' });
    var teamSel = h('select', { class: 'sel', 'aria-label': 'Browse by team' }, [h('option', { value: '', text: 'Browse by team' })]);
    var teamBox = h('div');
    var status = h('span', { class: 'small muted', text: 'Loading the Zoho Desk directory…' });
    var refresh = h('button', { class: 'linkbtn small', type: 'button', text: 'Refresh', onclick: function () { status.textContent = 'Refreshing…'; loadDirectory(true).then(ready).catch(function (e) { status.textContent = e.message; }); } });
    var el = h('div', { class: 'field pp' }, [
      h('label', { for: uid + '-in', text: opts.label || 'People' }),
      h('div', { class: 'pp-wrap' }, [input, lb]),
      h('div', { class: 'row', style: 'margin-top:8px' }, [teamSel, h('span', { class: 'spacer' }), status, refresh]),
      teamBox, chips,
    ]);
    function renderChips() {
      clear(chips);
      chosen.forEach(function (e) {
        var p = people.find(function (x) { return x.email === e; }) || { email: e };
        chips.appendChild(h('span', { class: 'chip' }, [p.name ? p.name + ' · ' + e : e, h('button', { type: 'button', 'aria-label': 'Remove ' + e, onclick: function () { chosen.splice(chosen.indexOf(e), 1); renderChips(); drawTeam(); } }, [icon('x', 'sm')])]));
      });
    }
    function add(e) { e = String(e || '').toLowerCase(); if (e && chosen.indexOf(e) < 0) chosen.push(e); renderChips(); }
    function score(p, toks) {
      var hay = (p.name + ' ' + p.email + ' ' + teamsOf(p).join(' ')).toLowerCase(), sc = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], at = hay.indexOf(t);
        if (at < 0) return -1;
        sc += (p.name.toLowerCase().indexOf(t) === 0 ? 30 : 0) + (p.email.indexOf(t) === 0 ? 20 : 0) + (/[\s.@]/.test(hay[at - 1] || ' ') ? 10 : 0) + 1;
      }
      return sc;
    }
    function drawList() {
      var term = input.value.trim().toLowerCase();
      clear(lb); active = -1;
      if (!term) { lb.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      var toks = term.split(/\s+/);
      matches = people.map(function (p) { return [p, score(p, toks)]; }).filter(function (x) { return x[1] >= 0; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8).map(function (x) { return x[0]; });
      if (!matches.length && /^[^@\s]+@adit\.com$/.test(term)) matches = [{ email: term, name: '', deskTeams: [], team: '', raw: true }];
      matches.forEach(function (p, i) {
        var dis = p.member;
        var opt = h('div', { class: 'pp-opt' + (dis ? ' dis' : ''), role: 'option', id: uid + '-o' + i, 'aria-disabled': dis ? 'true' : null, 'aria-selected': 'false' }, [
          h('span', { class: 'as-avatar', text: initials(p.name || p.email) }),
          h('div', { style: 'flex:1;min-width:0' }, [h('b', { text: p.name || p.email }), h('span', { text: p.email })]),
          h('div', { class: 'pp-tags' }, teamsOf(p).slice(0, 2).map(function (t) { return pill(t); }).concat([p.member ? pill('Team member', 'ok') : p.guest ? pill('Guest', 'accent') : p.raw ? pill('Not in directory') : null])),
        ]);
        opt.addEventListener('mousedown', function (e) { e.preventDefault(); if (!dis) { add(p.email); input.value = ''; drawList(); input.focus(); } });
        lb.appendChild(opt);
      });
      if (!matches.length) lb.appendChild(h('div', { class: 'pp-empty', text: 'No one matches. Type a full @adit.com email to add someone who is not in the directory.' }));
      lb.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function setActive(i) {
      var opts = lb.querySelectorAll('.pp-opt');
      if (!opts.length) return;
      active = (i + opts.length) % opts.length;
      opts.forEach(function (o, k) { o.classList.toggle('on', k === active); o.setAttribute('aria-selected', String(k === active)); });
      input.setAttribute('aria-activedescendant', opts[active].id);
      opts[active].scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('input', drawList);
    input.addEventListener('blur', function () { setTimeout(function () { lb.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (lb.hidden) drawList(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var p = matches[active >= 0 ? active : 0];
        if (p && !p.member) { add(p.email); input.value = ''; drawList(); }
      } else if (e.key === 'Escape') { lb.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    });
    function drawTeam() {
      clear(teamBox);
      var t = teamSel.value; if (!t) return;
      var inTeam = people.filter(function (p) { return teamsOf(p).indexOf(t) >= 0; });
      var addable = inTeam.filter(function (p) { return !p.member; });
      var list = h('div', { class: 'people', style: 'margin-top:8px;max-height:220px' });
      inTeam.forEach(function (p) {
        var cb = h('input', { type: 'checkbox', checked: chosen.indexOf(p.email) >= 0 ? true : null, disabled: p.member ? true : null });
        cb.addEventListener('change', function () { if (cb.checked) add(p.email); else { chosen.splice(chosen.indexOf(p.email), 1); renderChips(); } });
        list.appendChild(h('label', null, [cb, h('div', { style: 'flex:1;min-width:0' }, [h('div', { text: p.name || p.email }), h('div', { class: 'e', text: p.email })]), p.member ? pill('Team member', 'ok') : p.guest ? pill('Guest', 'accent') : null]));
      });
      teamBox.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [h('span', { class: 'small muted', text: inTeam.length + ' people in ' + t + (addable.length < inTeam.length ? ', ' + (inTeam.length - addable.length) + ' already team members' : '') }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm', type: 'button', text: 'Select all', disabled: !addable.length, onclick: function () { addable.forEach(function (p) { add(p.email); }); drawTeam(); } })]));
      teamBox.appendChild(list);
    }
    teamSel.addEventListener('change', drawTeam);
    function ready(list) {
      people = list || [];
      var count = {}; people.forEach(function (p) { teamsOf(p).forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
      var cur = teamSel.value; clear(teamSel); teamSel.appendChild(h('option', { value: '', text: 'Browse by team' }));
      Object.keys(count).sort().forEach(function (t) { teamSel.appendChild(h('option', { value: t, text: t + ' (' + count[t] + ')' })); });
      teamSel.value = cur;
      status.textContent = people.length + ' people from Zoho Desk and the staff directory';
      renderChips(); drawTeam();
    }
    loadDirectory(false).then(ready).catch(function (e) { status.textContent = 'Directory unavailable (' + e.message + '). You can still type full emails.'; });
    return { el: el, selected: function () { return chosen.slice(); } };
  }

  // ── Reviewer: access ─────────────────────────────────────────────────
  function viewAccess() {
    main.appendChild(pageHead('Access', 'Team members of the tool can always open assessments. Everyone else needs to be on the guest list below. Guests only ever see the Assessments page, never the rest of the tool.'));
    var holder = h('div'); main.appendChild(holder); holder.appendChild(skeleton());
    function load() {
      api('/api/assess/admin/access').then(function (j) {
        clear(holder);
        var url = location.origin + '/assess';
        var grid = h('div', { class: 'acc' });
        holder.appendChild(grid);
        // Link
        var urlIn = h('input', { class: 'inp', readonly: true, value: url, 'aria-label': 'Assessment link' });
        grid.appendChild(h('div', { class: 'card pad wide stack' }, [
          h('div', { class: 'row' }, [icon('link'), h('h2', { text: 'Assessment link' })]),
          h('div', { class: 'linkbox' }, [urlIn, h('button', { class: 'btn', type: 'button', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied'); }).catch(function () { urlIn.select(); }); } }, [icon('copy', 'sm'), 'Copy'])]),
          h('p', { class: 'small muted', style: 'margin:0', text: 'People sign in with their @adit.com Google account. They only see assessments assigned to them.' }),
        ]));
        // Google Chat announcements + question reuse
        var chatCard = h('div', { class: 'card pad wide stack' }, [h('div', { class: 'row' }, [icon('flag'), h('h2', { text: 'Google Chat announcements' })]), h('div', { class: 'skel', style: 'height:60px' })]);
        grid.appendChild(chatCard);
        api('/api/assess/admin/chat-config').then(function (c) {
          chatCard.removeChild(chatCard.lastChild);
          var hook = h('input', { class: 'inp', id: 'ch-hook', placeholder: c.hasWebhook ? 'Saved. Paste a new URL to replace it.' : 'https://chat.googleapis.com/v1/spaces/…', style: 'flex:1;min-width:240px' });
          var annT = toggle('Announce when an assessment is published', c.announceOnPublish, 'Posts the title, length and due date, and tags everyone assigned.');
          var remT = toggle('Remind the day before it closes', c.remindBeforeClose, 'Sent once, about 24 hours before closing, only inside 7 AM to 7 PM CST. Tags only people who have not submitted.');
          var lim = h('input', { class: 'inp', id: 'ch-lim', type: 'number', min: '0', max: '1000', value: String(c.exposureLimit || 0), style: 'width:120px' });
          var msg = h('span', { class: 'small muted', role: 'status' });
          chatCard.appendChild(h('p', { class: 'small muted', style: 'margin:0', text: 'Create a webhook in the Google Chat space where agents should see new assessments (space name, then Apps and integrations, then Webhooks), and paste it here. Nothing is posted until you publish, press Announce, or a reminder is due.' }));
          chatCard.appendChild(h('div', { class: 'row' }, [hook, c.hasWebhook ? pill('Connected', 'ok', true) : pill('Not set', '', true)]));
          chatCard.appendChild(annT); chatCard.appendChild(remT);
          chatCard.appendChild(h('div', { class: 'setrow' }, [h('div', { class: 'tx' }, [h('b', { text: 'Question reuse limit' }), h('span', { text: 'Random pools skip a question once it has been answered this many times, so fewer questions leak. 0 means no limit.' })]), lim]));
          chatCard.appendChild(h('div', { class: 'row' }, [msg, h('span', { class: 'spacer' }), c.hasWebhook ? h('button', { class: 'btn ghost danger sm', type: 'button', text: 'Remove webhook', onclick: function () { api('/api/assess/admin/chat-config', { method: 'PUT', body: { webhook: '' } }).then(function () { toast('Webhook removed'); load(); }); } }) : null,
            h('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: function () {
              var body = { announceOnPublish: annT.input.checked, remindBeforeClose: remT.input.checked, exposureLimit: Number(lim.value) || 0 };
              if (hook.value.trim()) body.webhook = hook.value.trim();
              api('/api/assess/admin/chat-config', { method: 'PUT', body: body }).then(function () { toast('Saved'); if (body.webhook) load(); }).catch(function (e) { msg.textContent = e.message; });
            } })]));
        }).catch(function (e) { chatCard.appendChild(errBox(e.message)); });
        // Mode
        var modes = h('div', { class: 'radcards', style: 'margin:0' });
        [['list', 'Only people on the guest list', 'Recommended. Anyone else who opens the link sees "You do not have access".'], ['domain', 'Anyone with an @adit.com account', 'Useful for a company-wide quiz. They still only see what is assigned to them.']].forEach(function (o) {
          var inp = h('input', { type: 'radio', name: 'lm', value: o[0], checked: j.linkMode === o[0] ? true : null });
          inp.addEventListener('change', function () { api('/api/assess/admin/access/mode', { method: 'PUT', body: { mode: o[0] } }).then(function () { toast('Saved'); }).catch(function (e) { toast(e.message); }); });
          modes.appendChild(h('label', { class: 'radcard' }, [inp, h('div', null, [h('b', { text: o[1] }), h('span', { text: o[2] })])]));
        });
        grid.appendChild(h('div', { class: 'card pad wide stack' }, [h('h2', { text: 'Who else can open the link' }), modes]));
        // Guests
        var picker = PeoplePicker({ label: 'Find people', placeholder: 'Type a name or email, or browse by team' });
        var gIn = picker.el;
        var gNote = h('input', { class: 'inp', id: 'g-note', placeholder: 'Note, for example "Tech CSM team"', maxlength: '120' });
        var gList = h('div', { class: 'plist' });
        if (!j.guests.length) gList.appendChild(h('p', { class: 'small muted', text: 'No guests yet.' }));
        j.guests.forEach(function (g) {
          gList.appendChild(h('div', null, [h('span', { class: 'as-avatar', text: initials(g.email) }), h('div', { class: 'who' }, [h('b', { text: g.email }), h('span', { text: (g.note ? g.note + ' · ' : '') + (g.last_seen ? 'Last seen ' + fmtDay(g.last_seen) : 'Not signed in yet') })]),
            h('button', { class: 'btn sm ghost danger', type: 'button', text: 'Remove', onclick: function () { api('/api/assess/admin/access/guests/' + encodeURIComponent(g.email), { method: 'DELETE' }).then(load).catch(function (e) { toast(e.message); }); } })]));
        });
        var gErr = h('div');
        grid.appendChild(h('div', { class: 'card pad' }, [
          h('div', { class: 'row' }, [icon('users'), h('h2', { text: 'Guests' }), pill(String(j.guests.length))]),
          h('p', { class: 'small muted', text: 'People outside the tool who can take assessments. They cannot open any other page.' }),
          gIn, field('Note (optional)', gNote), gErr,
          h('button', { class: 'btn primary', type: 'button', text: 'Add guests', onclick: function () {
            clear(gErr);
            var emails = picker.selected();
            if (!emails.length) { gErr.appendChild(errBox('Pick at least one person.')); return; }
            api('/api/assess/admin/access/guests', { method: 'POST', body: { emails: emails.join(','), note: gNote.value } }).then(function (r) { toast(r.added + ' added'); load(); }).catch(function (e) { gErr.appendChild(errBox(e.message)); });
          } }),
          gList,
        ]));
        // Reviewers + extra time
        var col = h('div', { class: 'stack' });
        grid.appendChild(col);
        var rPicker = PeoplePicker({ label: 'Find people', placeholder: 'Type a name or email, or browse by team' });
        var rList = h('div', { class: 'plist' });
        j.reviewers.forEach(function (r) {
          rList.appendChild(h('div', null, [h('span', { class: 'as-avatar', text: initials(r.email) }), h('div', { class: 'who' }, [h('b', { text: r.email }), h('span', { text: r.added_by === 'system' ? 'Owner' : 'Added by ' + r.added_by })]),
            r.added_by === 'system' || r.email === me.email ? null : h('button', { class: 'btn sm ghost danger', type: 'button', text: 'Remove', onclick: function () { api('/api/assess/admin/access/reviewers/' + encodeURIComponent(r.email), { method: 'DELETE' }).then(load).catch(function (e) { toast(e.message); }); } })]));
        });
        col.appendChild(h('div', { class: 'card pad' }, [
          h('div', { class: 'row' }, [icon('shield'), h('h2', { text: 'Reviewers' })]),
          h('p', { class: 'small muted', text: 'Reviewers on this page see every assessment: results, answer keys and activity logs, and they manage questions and access. Camera photos stay owner-only. Being an admin in the tool does not make someone a reviewer.' }),
          rPicker.el,
          h('button', { class: 'btn', type: 'button', text: 'Add reviewers', onclick: function () { var em = rPicker.selected(); if (!em.length) { toast('Pick at least one person'); return; } api('/api/assess/admin/access/reviewers', { method: 'POST', body: { emails: em.join(',') } }).then(function () { toast('Reviewers added'); load(); }).catch(function (e) { toast(e.message); }); } }),
          h('p', { class: 'small muted', style: 'margin:0', text: 'Want someone to review only one assessment? Open that assessment and add them under Reviewers for this assessment.' }),
          rList,
        ]));
        var xIn = h('input', { class: 'inp', type: 'email', placeholder: 'name@adit.com', 'aria-label': 'Email for accommodation', style: 'flex:1;min-width:180px' });
        var xPct = h('select', { class: 'sel', 'aria-label': 'Extra time' }, [[0, 'No extra time'], [25, '+25% time'], [50, '+50% time'], [100, '+100% time']].map(function (n) { return h('option', { value: String(n[0]), text: n[1] }); })); xPct.value = '25';
        var xPlain = h('input', { type: 'checkbox' });
        var xList = h('div', { class: 'plist' });
        j.extraTime.forEach(function (x) {
          var what = [x.pct ? '+' + x.pct + '% time' : '', x.plain ? 'plain text for screen readers' : ''].filter(Boolean).join(', ');
          xList.appendChild(h('div', null, [h('div', { class: 'who' }, [h('b', { text: x.email }), h('span', { text: what })]),
            h('button', { class: 'btn sm ghost danger', type: 'button', text: 'Remove', onclick: function () { api('/api/assess/admin/access/extra-time', { method: 'PUT', body: { email: x.email, pct: 0, plain: false } }).then(load).catch(function (e) { toast(e.message); }); } })]));
        });
        col.appendChild(h('div', { class: 'card pad' }, [
          h('div', { class: 'row' }, [icon('clock'), h('h2', { text: 'Accommodations' })]),
          h('p', { class: 'small muted', text: 'Extra time, and plain text (questions shown as normal text, not a rolling reveal or audio) for anyone using a screen reader or zoom. Applies from their next attempt.' }),
          h('div', { class: 'row' }, [xIn, xPct]),
          h('div', { class: 'row', style: 'margin-top:8px' }, [h('label', { class: 'chk' }, [xPlain, 'Plain text']), h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: 'Save', onclick: function () { api('/api/assess/admin/access/extra-time', { method: 'PUT', body: { email: xIn.value, pct: xPct.value, plain: xPlain.checked } }).then(load).catch(function (e) { toast(e.message); }); } })]),
          xList,
        ]));
        if (!me.owner) return;
        var pd = h('select', { class: 'sel', 'aria-label': 'Keep camera photos for' }, [30, 60, 90, 180].map(function (n) { return h('option', { value: String(n), text: n + ' days' }); }));
        pd.value = String([30, 60, 90, 180].indexOf(j.photoDays) >= 0 ? j.photoDays : 90);
        pd.addEventListener('change', function () { api('/api/assess/admin/access/photo-days', { method: 'PUT', body: { days: pd.value } }).then(function (r) { toast('Saved' + (r.purged ? ', ' + r.purged + ' older photos deleted' : '')); }).catch(function (e) { toast(e.message); }); });
        var ps = j.photoStats || { n: 0, bytes: 0 };
        grid.appendChild(h('div', { class: 'card pad wide stack' }, [
          h('div', { class: 'row' }, [icon('camera'), h('h2', { text: 'Camera photos' })]),
          h('p', { class: 'small muted', style: 'margin:0', text: 'Only taken on assessments where you turn camera photos on. They are stored in the tool\'s own database on its server (the same place as results), never in Google Drive or on anyone\'s computer. Only you can open them, from an attempt\'s Camera photos tab; other reviewers cannot.' }),
          h('div', { class: 'row' }, [h('span', { text: 'Delete photos automatically after' }), pd, h('span', { class: 'spacer' }), h('span', { class: 'small muted', text: ps.n + (ps.n === 1 ? ' photo' : ' photos') + ' stored (' + (ps.bytes >= 1048576 ? (Math.round(ps.bytes / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(ps.bytes / 1024)) + ' KB') + ')' })]),
        ]));
      }).catch(function (e) { clear(holder); holder.appendChild(errBox(e.message)); });
    }
    load();
  }

  boot();
})();
