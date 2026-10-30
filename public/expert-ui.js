/* Batch 182: Adit Expert on the Guides page. Ask (answers from the Help Center, guides, solved tickets and calls,
   double-checked), Help Center (browse every article) and Teach (admins: rules, corrections, gaps). */
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
  var P = {
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', shield: '<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    ticket: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 5v12" stroke-dasharray="2 2"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    rule: '<path d="M6 4h12v16l-6-4-6 4z"/>', news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/>',
    up: '<path d="M7 11v9H4v-9zM7 11l4-7c1.3 0 2.3 1 2 2.4L12.5 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>',
    down: '<path d="M7 13V4H4v9zM7 13l4 7c1.3 0 2.3-1 2-2.4L12.5 14H18a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 16.8 4H7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    chat: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>', refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.6 1.5 2.6V17h4v-.5c0-1 .6-1.9 1.5-2.6A6 6 0 0 0 12 3z"/>',
  };
  function icon(n, cls) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + (cls || '')); s.setAttribute('aria-hidden', 'true'); s.innerHTML = P[n] || ''; return s; }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function copy(text, btn) {
    var done = function () { if (!btn) return; var old = btn.getAttribute('data-l') || btn.lastChild.textContent; btn.setAttribute('data-l', old); btn.lastChild.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(function () { btn.lastChild.textContent = old; btn.classList.remove('ok'); }, 1400); };
    try { navigator.clipboard.writeText(text).then(done, function () { fallback(); }); } catch (e) { fallback(); }
    function fallback() { var t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove(); }
  }
  // Batch 192: emails and private notes copy as formatted text too, so they paste into the Zoho Desk editor with
  // their paragraphs and numbered lists (plain text stays on the clipboard for anything else).
  function toHtml(text) {
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    return String(text || '').trim().split(/\n\s*\n/).map(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim(); });
      if (lines.length && lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); })) return '<ol>' + lines.map(function (l) { return '<li>' + esc(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; }).join('') + '</ol>';
      if (lines.length && lines.every(function (l) { return /^\s*[-*•]\s+/.test(l); })) return '<ul>' + lines.map(function (l) { return '<li>' + esc(l.replace(/^\s*[-*•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      return '<p>' + lines.map(esc).join('<br>') + '</p>';
    }).join('');
  }
  function copyRich(text, btn) {
    var done = function () { if (!btn) return; var old = btn.getAttribute('data-l') || btn.lastChild.textContent; btn.setAttribute('data-l', old); btn.lastChild.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(function () { btn.lastChild.textContent = old; btn.classList.remove('ok'); }, 1400); };
    try {
      if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return copy(text, btn);
      var item = new ClipboardItem({ 'text/html': new Blob(['<div style="font-family:Arial,sans-serif;font-size:13px">' + toHtml(text) + '</div>'], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) });
      navigator.clipboard.write([item]).then(done, function () { copy(text, btn); });
    } catch (e) { copy(text, btn); }
  }
  var store = { get: function (k, d) { try { var v = localStorage.getItem('ax-' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem('ax-' + k, JSON.stringify(v)); } catch (e) {} } };
  function linkTickets(text) {
    var frag = document.createDocumentFragment(), re = /(^|[^\d.#\/=-])#?(\d{6})(?![\d.])/g, at = 0, m;
    text = String(text || '');
    while ((m = re.exec(text))) { var start = m.index + m[1].length; frag.appendChild(document.createTextNode(text.slice(at, start))); frag.appendChild(h('a', { class: 'gd-tk', href: '/guides/ticket/' + m[2], target: '_blank', rel: 'noopener', text: '#' + m[2] })); at = re.lastIndex; }
    frag.appendChild(document.createTextNode(text.slice(at)));
    return frag;
  }

  // ── Ask ──────────────────────────────────────────────────────────────
  var EXAMPLES = [
    ['Patients say they are not getting appointment reminder texts', 'Engage'],
    ['Client wants to refund a payment taken by mistake', 'Adit Pay'],
    ['The card terminal will not connect', 'Adit Pay'],
    ['Pink "EHR Disconnected" banner at the bottom of the screen', 'Integrations'],
    ['How do I change the voicemail greeting?', 'Voice'],
    ['Online booking is not showing any available slots', 'Scheduling'],
    ['The AI announced a transfer but the phones never rang', 'AI Front Desk'],
    ['Client wants to add a new staff user with limited access', 'Users'],
  ];
  // Batch 188: where the client is decides how the reply is written: a talk track for a call, an email for a ticket, short messages for a chat.
  var MODES = [['call', 'Call', 'The client is on the phone: get a talk track to say'], ['email', 'Ticket (email)', 'Replying to a ticket: get a ready to send email'], ['chat', 'Chat', 'Live chat: get short messages to paste']];
  var SAY = { call: ['What to say on the call', 'Copy talk track'], email: ['Email reply', 'Copy email'], chat: ['Chat reply', 'Copy messages'] };
  function Ask(panel, ctx) {
    var S = { thread: [], busy: false, mode: store.get('mode', 'call'), module: '', useHistory: true, meta: null, items: [] };
    if (!SAY[S.mode]) S.mode = 'call';
    var root = h('div', { class: 'ax' }); panel.appendChild(root);
    // rail
    var rail = h('aside', { class: 'ax-rail', 'aria-label': 'Filters and history' });
    var modList = h('div', { class: 'ax-mods', role: 'radiogroup', 'aria-label': 'Product' });
    var popBox = h('div', { class: 'ax-pop' }), recBox = h('div', { class: 'ax-pop' });
    var newBtn = h('button', { type: 'button', class: 'gd-btn ax-new', title: 'New question', onclick: function () { reset(); } }, [icon('plus'), h('span', { text: 'New question' })]);
    // The side bar folds to a thin strip so the conversation gets the room; it folds by itself once a question is asked
    // unless the person opened it again, and the choice is remembered on this device.
    var foldBtn = h('button', { type: 'button', class: 'ax-fold', 'aria-label': 'Collapse the side bar', title: 'Collapse the side bar', onclick: function () { setFold(!S.folded, true); } }, [icon('panel')]);
    rail.appendChild(h('div', { class: 'ax-rail-top' }, [foldBtn, newBtn]));
    rail.appendChild(h('h3', { text: 'Product' })); rail.appendChild(modList);
    rail.appendChild(h('h3', { text: 'Asked a lot this week' })); rail.appendChild(popBox);
    rail.appendChild(h('h3', { text: 'Your recent questions' })); rail.appendChild(recBox);
    root.appendChild(rail);
    S.folded = store.get('fold', null);
    function setFold(v, byHand) {
      S.folded = !!v; root.classList.toggle('folded', S.folded);
      foldBtn.setAttribute('aria-label', S.folded ? 'Expand the side bar' : 'Collapse the side bar'); foldBtn.title = foldBtn.getAttribute('aria-label');
      foldBtn.setAttribute('aria-expanded', String(!S.folded));
      if (byHand) store.set('fold', S.folded);
    }
    setFold(S.folded === true);
    var col = h('div', { class: 'ax-col' }); root.appendChild(col);
    var intro = h('section', { class: 'ax-hero' });
    var thread = h('div', { class: 'ax-thread', role: 'log', 'aria-label': 'Answers', 'aria-live': 'polite' });
    // Conversation bar: shown once a conversation starts. Refresh re-asks the last question fresh; New starts over
    // (and stays in focus); End closes the conversation and goes back to the start page; Full screen gives the
    // conversation the whole screen (Esc leaves it).
    var cbTitle = h('b', { text: 'Conversation' }), cbCount = h('span', { class: 'ax-muted' });
    var refreshB = h('button', { type: 'button', class: 'ax-mini', title: 'Ask the last question again for a fresh answer', onclick: function () { refresh(); } }, [icon('refresh', 'sm'), h('span', { text: 'Refresh answer' })]);
    var newB = h('button', { type: 'button', class: 'ax-mini', title: 'Start a new conversation', onclick: function () { reset(true); } }, [icon('plus', 'sm'), h('span', { text: 'New conversation' })]);
    var endB = h('button', { type: 'button', class: 'ax-mini', title: 'End this conversation', onclick: function () { endConvo(); } }, [icon('x', 'sm'), h('span', { text: 'End' })]);
    var fullB = h('button', { type: 'button', class: 'ax-mini', title: 'Full screen (Esc to leave)', 'aria-pressed': 'false', onclick: function () { setFull(!S.full); } }, [icon('expand', 'sm'), h('span', { text: 'Full screen' })]);
    var shareB = h('button', { type: 'button', class: 'ax-mini', title: 'Copy a link to this conversation for a colleague', onclick: function () { share(); } }, [icon('link', 'sm'), h('span', { text: 'Share' })]);
    var cbar = h('div', { class: 'ax-cbar', hidden: true }, [h('span', { class: 'ax-cbar-t' }, [icon('chat', 'sm'), cbTitle, cbCount]), h('span', { class: 'ax-sp' }), shareB, refreshB, newB, endB, fullB]);
    function share() {
      if (!S.items.length || S.busy) return;
      shareB.disabled = true;
      ctx.api('/api/guides/expert/share', { items: S.items }).then(function (r) {
        var url = location.origin + '/guides#ask/share/' + r.id;
        copy(url, shareB); ctx.toast && ctx.toast('Link copied. Anyone on the team can open it and continue.');
      }).catch(function (e) { ctx.toast && ctx.toast(e.message); }).then(function () { shareB.disabled = false; });
    }
    function paintBar() { var n = S.thread.length / 2 + (S.busy ? 1 : 0); cbar.hidden = !n; cbCount.textContent = n ? Math.ceil(n) + ' question' + (Math.ceil(n) === 1 ? '' : 's') : ''; refreshB.disabled = S.busy || !S.lastQ; }
    function setFull(v) {
      S.full = !!v; document.documentElement.classList.toggle('ax-full', S.full); fullB.setAttribute('aria-pressed', String(S.full));
      fullB.lastChild.textContent = S.full ? 'Exit full screen' : 'Full screen';
      try { if (S.full && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); else if (!S.full && document.fullscreenElement) document.exitFullscreen().catch(function () {}); } catch (e) {}
    }
    document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && S.full) { S.full = false; document.documentElement.classList.remove('ax-full'); fullB.setAttribute('aria-pressed', 'false'); fullB.lastChild.textContent = 'Full screen'; } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.full && !document.querySelector('dialog[open]')) setFull(false); });
    col.appendChild(cbar); col.appendChild(intro); col.appendChild(thread);
    // composer
    var input = h('textarea', { rows: '3', placeholder: 'What is the client asking? Paste their message or describe the situation.', 'aria-label': 'Question' });
    var send = h('button', { type: 'submit', class: 'gd-btn primary ax-send', 'aria-label': 'Ask' }, [icon('send'), 'Ask']);
    var modeBox = h('div', { class: 'ax-seg', role: 'radiogroup', 'aria-label': 'Where is the client?' });
    function paintModes() { clear(modeBox); MODES.forEach(function (m) { modeBox.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(S.mode === m[0]), title: m[2], onclick: function () { S.mode = m[0]; store.set('mode', S.mode); paintModes(); } }, [m[1]])); }); }
    paintModes();
    var scopeChip = h('span', { class: 'ax-scope' });
    var form = h('form', { class: 'ax-comp', onsubmit: function (ev) { ev.preventDefault(); submit(); } }, [input,
      h('div', { class: 'ax-comp-bar' }, [h('span', { class: 'ax-comp-l', text: 'Client is on' }), modeBox, scopeChip, h('span', { class: 'ax-sp' }), send])]);
    col.appendChild(form);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(); } });
    // As soon as the agent types, the side bar folds and the suggestions fade, so the page is about the conversation.
    var fadeT = null;
    input.addEventListener('input', function () {
      var typing = !!input.value.trim();
      if (typing && !S.folded) setFold(true);
      if (typing && !intro.hidden) { intro.classList.add('fade'); clearTimeout(fadeT); fadeT = setTimeout(function () { if (intro.classList.contains('fade')) intro.hidden = true; }, 260); }
      else if (!typing && !S.thread.length && !S.busy) { clearTimeout(fadeT); intro.hidden = false; requestAnimationFrame(function () { intro.classList.remove('fade'); }); }
    });
    function paintScope() { clear(scopeChip); if (S.module) scopeChip.appendChild(h('button', { type: 'button', class: 'ax-chip on', title: 'Search everything', onclick: function () { S.module = ''; paintMods(); paintScope(); } }, [S.module, icon('x', 'sm')])); }
    function paintMods() {
      clear(modList);
      [''].concat((S.meta && S.meta.modules) || []).forEach(function (m) {
        modList.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(S.module === m), class: 'ax-mod', onclick: function () { S.module = m; paintMods(); paintScope(); input.focus(); } }, [m || 'All products']));
      });
    }
    function paintRecent() { clear(recBox); var r = store.get('recent', []); if (!r.length) recBox.appendChild(h('p', { class: 'ax-muted', text: 'Nothing yet.' })); r.slice(0, 6).forEach(function (q) { recBox.appendChild(h('button', { type: 'button', text: q, onclick: function () { input.value = q; submit(); } })); }); }
    function heroPaint() {
      clear(intro); intro.hidden = S.thread.length > 0;
      var n = S.meta ? S.meta.articles : 369;
      intro.appendChild(h('div', { class: 'ax-hero-tx' }, [h('span', { class: 'ax-eyebrow' }, [icon('spark'), 'Adit Expert']), h('h1', { text: 'Ask anything about Adit, for any client scenario' }),
        h('p', { text: 'Answers come from ' + n + ' Help Center articles, the VoIP and AI guides, your team\'s rules, and how the team solved similar tickets, chats and calls. A second AI double-checks every answer against those sources.' })]));
      intro.appendChild(h('div', { class: 'ax-ex' }, EXAMPLES.map(function (e) { return h('button', { type: 'button', class: 'ax-excard', onclick: function () { input.value = e[0]; submit(); } }, [h('span', { class: 'ax-extag', text: e[1] }), h('span', { text: e[0] })]); })));
    }
    function reset(keepFocus) {
      if (S.busy) return;
      S.thread = []; S.items = []; S.lastQ = null; S.lastCard = null; clear(thread); input.value = '';
      heroPaint(); intro.classList.remove('fade');
      if (keepFocus) { intro.hidden = true; thread.appendChild(h('p', { class: 'ax-newnote', text: 'New conversation. Ask your question below.' })); }
      paintBar(); input.focus();
    }
    function endConvo() {
      if (S.busy) return;
      if (S.full) setFull(false);
      reset(false); if (store.get('fold', null) !== true) setFold(false);
      ctx.toast && ctx.toast('Conversation ended');
    }
    function refresh() {
      if (S.busy || !S.lastQ) return;
      // drop the last turn and ask the same question again, skipping any saved answer
      S.thread = S.thread.slice(0, -2); S.items = S.items.slice(0, -1);
      if (S.lastCard && S.lastCard.parentNode) S.lastCard.remove();
      var me = thread.lastElementChild; if (me && me.classList.contains('ax-me')) me.remove();
      submit(S.lastQ, true);
    }
    // progress
    var PHASES = ['Understanding the question', 'Searching the Help Center and guides', 'Checking how the team solved it before', 'Writing the answer', 'Double-checking with a second AI'];
    function progress(q) {
      var ph = /(?:#\s?|ticket\s*(?:no\.?|number|id|#)?\s*:?\s*#?)\d{5,7}(?!\d)|^#?\d{5,7}$/i.test(String(q || '').trim()) ? ['Reading the ticket, its history and the client\'s earlier tickets'].concat(PHASES) : PHASES;
      var list = h('ol', { class: 'ax-steps' }, ph.map(function (p, i) { return h('li', { class: i === 0 ? 'on' : '' }, [h('i'), p]); }));
      var box = h('div', { class: 'ax-card ax-wait' }, [h('div', { class: 'ax-wait-hd' }, [h('span', { class: 'ax-orb' }), h('b', { text: 'Working on it' })]), list]);
      var k = 0, tm = setInterval(function () { var li = list.children; if (k < li.length - 1) { li[k].className = 'done'; k++; li[k].className = 'on'; } }, 2600);
      return { el: box, stop: function () { clearInterval(tm); } };
    }
    function submit(again, fresh) {
      var q = typeof again === 'string' ? again : input.value.trim(); if (!q || S.busy) return;
      var nn = thread.querySelector('.ax-newnote'); if (nn) nn.remove();
      if (!ctx.ai) { ctx.toast && ctx.toast('AI is not set up on the server yet.'); return; }
      S.busy = true; send.disabled = true; intro.hidden = true; S.lastQ = q; paintBar();
      if (store.get('fold', null) === null && !S.folded) setFold(true);
      var rec = store.get('recent', []).filter(function (x) { return x !== q; }); rec.unshift(q); store.set('recent', rec.slice(0, 12)); paintRecent();
      thread.appendChild(h('div', { class: 'ax-me' }, [h('span', { class: 'ax-me-mode', text: (MODES.find(function (m) { return m[0] === S.mode; }) || MODES[0])[1] + (S.module ? ' · ' + S.module : '') }), h('p', { text: q })]));
      var pg = progress(q); thread.appendChild(pg.el); pg.el.scrollIntoView({ block: 'end', behavior: 'smooth' });
      if (typeof again !== 'string') input.value = '';
      var history = S.thread.slice(-6);
      var mode = S.mode, locked = !!S.lockOnce; S.lockOnce = false;
      ctx.api('/api/guides/expert/ask', { question: q, history: history, mode: mode, module: S.module, useHistory: S.useHistory, fresh: !!fresh, modeLocked: locked }).then(function (j) {
        pg.stop(); j.mode = j.mode || mode; var card = answerCard(j, q); thread.replaceChild(card, pg.el); S.lastCard = card; S.items.push({ q: q, mode: j.mode, j: j });
        S.thread.push({ role: 'user', content: q }, { role: 'assistant', content: [j.answer.answer].concat(j.answer.steps || []).join('\n') });
        card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }).catch(function (e) { pg.stop(); thread.replaceChild(h('div', { class: 'ax-card ax-err' }, [icon('warn'), h('span', { text: e.message || 'Something went wrong, try again.' })]), pg.el); })
        .then(function () { S.busy = false; send.disabled = false; paintBar(); input.focus(); });
    }
    function section(ic, title, kids, cls) { return h('section', { class: 'ax-sec ' + (cls || '') }, [h('h4', null, [icon(ic), title])].concat(kids)); }
    function copyBtn(text, label, rich) { var b = h('button', { type: 'button', class: 'ax-mini' }, [icon('copy', 'sm'), label || 'Copy']); b.addEventListener('click', function () { (rich ? copyRich : copy)(text, b); }); return b; }
    function answerCard(j, q) {
      var a = j.answer || {}, conf = a.confidence || 'medium';
      var badges = h('div', { class: 'ax-badges' }, [
        h('span', { class: 'ax-badge conf-' + conf, title: 'How sure the answer is, given the sources' }, [conf === 'high' ? 'High confidence' : conf === 'low' ? 'Low confidence' : 'Medium confidence']),
        j.verified ? h('span', { class: 'ax-badge ver', title: j.review && j.review.issues && j.review.issues.length ? 'Second check: ' + j.review.issues.join('; ') : 'A second AI checked every step against the sources' }, [icon('shield', 'sm'), j.review && j.review.verdict === 'fixed' ? 'Double-checked and corrected' : 'Double-checked']) : null,
        !j.found ? h('span', { class: 'ax-badge conf-low' }, ['Not in the sources']) : null,
        j.plan && j.plan.module ? h('span', { class: 'ax-badge mod' }, [j.plan.module]) : null]);
      var card = h('article', { class: 'ax-card ax-ans' + (j.found ? '' : ' nf') });
      card.appendChild(h('div', { class: 'ax-ans-hd' }, [badges, h('span', { class: 'ax-sp' }), copyBtn(plain(a, j), 'Copy all')]));
      if (j.live) card.appendChild(liveBox(j.live));
      if (j.ticket) card.appendChild(ticketBox(j.ticket, a.ticket));
      if (j.modeNote) card.appendChild(h('p', { class: 'ax-modenote' }, [icon('bulb', 'sm'), j.modeNote]));
      card.appendChild(h('p', { class: 'ax-lead' }, [linkTickets(a.answer || '')]));
      if (a.checks && a.checks.length) card.appendChild(section('search', j.plan && j.plan.intent === 'troubleshoot' ? 'Check first' : 'Check or ask first', [h('ul', { class: 'ax-checks' }, a.checks.map(function (c) { return h('li', null, [linkTickets(c)]); }))]));
      if (a.steps && a.steps.length) card.appendChild(section('list', 'Steps', [h('ol', { class: 'ax-ol' }, a.steps.map(function (s) { return h('li', null, [linkTickets(String(s).replace(/^\d+[.)]\s*/, ''))]); })), h('div', { class: 'ax-row' }, [copyBtn(a.steps.map(function (s, i) { return (i + 1) + '. ' + String(s).replace(/^\d+[.)]\s*/, ''); }).join('\n'), 'Copy steps')])]));
      if (a.say) {
        var sl = SAY[j.mode] || ['What to tell the client', 'Copy message'];
        var withLink = j.share && j.mode !== 'call' ? [copyBtn(j.mode === 'email' ? a.say.replace(/\n*Thanks,?\s*$/i, '') + '\n\nHelp Center guide: ' + j.share.url + '\n\nThanks,' : a.say + '\n\n' + j.share.url, j.mode === 'email' ? 'Copy email with Help Center link' : 'Copy with Help Center link', j.mode === 'email')] : [];
        var other = MODES.filter(function (m) { return m[0] !== j.mode; }).map(function (m) { return h('button', { type: 'button', class: 'ax-mini', title: 'Ask again for ' + m[1].toLowerCase(), onclick: function () { if (S.busy) return; S.mode = m[0]; S.lockOnce = true; store.set('mode', S.mode); paintModes(); submit(q); } }, [icon('refresh', 'sm'), 'For ' + m[1].toLowerCase()]); });
        card.appendChild(section(j.mode === 'call' ? 'phone' : 'chat', sl[0], [h('blockquote', { class: 'ax-say' + (j.mode === 'call' ? ' call' : '') }, [a.say]), h('div', { class: 'ax-row' }, [copyBtn(a.say, sl[1], j.mode === 'email')].concat(withLink).concat([h('span', { class: 'ax-sp' })]).concat(other))], 'say'));
      }
      if (a.note) card.appendChild(section('edit', 'Private note for Zoho Desk', [h('pre', { class: 'ax-note' }, [a.note]), h('div', { class: 'ax-row' }, [copyBtn(a.note, 'Copy private note', true)])], 'note'));
      if (a.owner) card.appendChild(section('user', 'Who owns it', [h('p', { class: 'ax-owner' }, [h('b', { text: a.owner.who || 'T1' }), a.owner.when ? h('span', { text: ' · ' + a.owner.when }) : null])], 'own'));
      if (j.rulesUsed && j.rulesUsed.length) card.appendChild(h('p', { class: 'ax-rules' }, [icon('rule', 'sm'), 'Team rule applied: ' + j.rulesUsed.join('; ')]));
      if (a.cautions && a.cautions.length) card.appendChild(section('warn', 'Heads up', [h('ul', null, a.cautions.map(function (c) { return h('li', { text: c }); }))], 'warn'));
      if (j.share) card.appendChild(h('div', { class: 'ax-share' }, [icon('link'), h('span', null, ['Send the client: ', h('a', { href: j.share.url, target: '_blank', rel: 'noopener', text: j.share.title })]), h('span', { class: 'ax-sp' }), copyBtn(j.share.url, 'Copy link')]));
      if (j.sources && j.sources.length) card.appendChild(sourcesBox(j.sources));
      if (a.follow_ups && a.follow_ups.length) card.appendChild(h('div', { class: 'ax-fu' }, a.follow_ups.map(function (f) { return h('button', { type: 'button', class: 'ax-chip', onclick: function () { input.value = f; submit(); } }, [f]); })));
      card.appendChild(feedbackRow(j, q));
      return card;
    }
    // Batch 189: the ticket review: where the ticket stands, what the client waits for, what to do better, the timeline and earlier tickets.
    function ticketBox(T, R) {
      if (T.error) return h('div', { class: 'ax-tk ax-tk-err', role: 'note' }, [icon('warn'), h('span', { text: 'Ticket #' + T.number + ' could not be read: ' + T.error })]);
      var M = T.meta || {}, when = function (iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
      var tk = function (n, txt) { return h('a', { href: '/guides/ticket/' + n, target: '_blank', rel: 'noopener', text: txt || '#' + n }); };
      var facts = [M.status, M.channel, M.owner ? 'Owner ' + M.owner : 'Unassigned', M.team, M.account, M.module, M.reopened ? 'Reopened ' + M.reopened + 'x' : '', 'Opened ' + when(M.created)].filter(Boolean);
      var box = h('section', { class: 'ax-tk' }, [h('div', { class: 'ax-tk-hd' }, [icon('ticket'), h('b', null, ['Ticket ', tk(M.number), ': ', M.subject || '']), h('span', { class: 'ax-sp' }),
        R && R.sentiment ? h('span', { class: 'ax-badge s-' + String(R.sentiment).toLowerCase().split(/\W/)[0], text: 'Client: ' + R.sentiment }) : null]),
        h('p', { class: 'ax-tk-facts', text: facts.join(' · ') })]);
      var C = T.crm;
      if (C) { var cf = [C.stage ? 'Stage ' + C.stage : '', C.csm ? 'CSM ' + C.csm : '', C.ob ? 'OB ' + C.ob : '', C.escalation && !/^none$/i.test(C.escalation) ? 'Escalation: ' + C.escalation : '', C.risk ? 'Risk ' + C.risk : '', C.contractEnd ? 'Contract ends ' + C.contractEnd : '', C.health ? 'Health ' + C.health : '', C.mood ? 'Mood ' + C.mood : '', C.fcr != null ? 'FCR ' + C.fcr + '%' : '', C.csat != null ? 'CSAT ' + C.csat + '%' : ''].filter(Boolean);
        if (cf.length) box.appendChild(h('p', { class: 'ax-tk-facts ax-tk-crm', text: 'CRM: ' + cf.join(' · ') })); }
      if (T.related && T.related.length) box.appendChild(h('p', { class: 'ax-tk-facts' }, ['Also read: '].concat(T.related.map(function (r, i) { return h('span', null, [i ? ', ' : '', tk(r.number), ' ' + (r.subject || '')]); }))));
      if (R) {
        if (R.summary) box.appendChild(h('p', { class: 'ax-tk-sum', text: R.summary }));
        var kv = [['Waiting for', R.waiting], ['Stage', R.stage], ['Risk', R.risk]].filter(function (x) { return x[1]; });
        if (kv.length) box.appendChild(h('dl', { class: 'ax-tk-kv' }, kv.map(function (x) { return h('div', null, [h('dt', { text: x[0] }), h('dd', { text: x[1] })]); })));
        var cols = [['Next best steps', R.next, 'list', 'ol'], ['Do better', R.improve, 'warn', 'ul'], ['Went well', R.went_well, 'check', 'ul']].filter(function (x) { return x[1] && x[1].length; });
        if (cols.length) box.appendChild(h('div', { class: 'ax-tk-cols' }, cols.map(function (c) { return h('div', { class: 'ax-tk-col' }, [h('h5', null, [icon(c[2], 'sm'), c[0]]), h(c[3], null, c[1].map(function (x) { return h('li', { text: x }); }))]); })));
      }
      if (T.timeline && T.timeline.length) {
        var tl = h('details', { class: 'ax-tk-tl' }, [h('summary', { text: 'Timeline (' + (T.msgCount || 0) + ' message' + (T.msgCount === 1 ? '' : 's') + ', ' + (T.commentCount || 0) + ' internal note' + (T.commentCount === 1 ? '' : 's') + (T.images ? ', ' + T.images + ' screenshot' + (T.images === 1 ? '' : 's') + ' read' : '') + (!T.images && T.imageInfo && T.imageInfo.found ? ', screenshots could not be read' : '') + ')' })]);
        tl.appendChild(h('ol', null, T.timeline.map(function (e) { return h('li', { class: 'k-' + e.kind }, [h('time', { text: when(e.at) }), h('b', { text: e.kind === 'event' ? 'Update' : e.kind === 'comment' ? 'Note · ' + e.who : e.who + (e.channel ? ' · ' + String(e.channel).toLowerCase() : '') }), h('span', { text: e.text })]); })));
        box.appendChild(tl);
      }
      if (T.prior && T.prior.length) box.appendChild(h('details', { class: 'ax-tk-tl' }, [h('summary', { text: 'Earlier tickets from this client (' + T.prior.length + ')' }),
        h('ul', { class: 'ax-tk-prior' }, T.prior.map(function (p) { return h('li', null, [tk(p.number), h('span', { text: ' ' + p.subject }), h('em', { text: ' ' + [p.status, when(p.created)].filter(Boolean).join(' · ') })]); }))]));
      return box;
    }
    function liveBox(L) {
      var ago = function (iso) { var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
      return h('div', { class: 'ax-live', role: 'alert' }, [
        h('div', { class: 'ax-live-hd' }, [icon('warn'), h('b', { text: 'Possible outage: ' + L.today + ' similar ticket' + (L.today === 1 ? '' : 's') + ' in the last 24 hours' + (L.offices ? ' from ' + L.offices + ' offices' : '') }),
          h('span', { class: 'ax-muted', text: L.count + ' in 48 hours' })]),
        h('p', { text: 'Confirm with your lead or the incident channel whether there is a known issue before troubleshooting, and link this ticket to the ones below.' }),
        h('div', { class: 'ax-live-tk' }, L.tickets.map(function (t) { return h('a', { href: '/guides/ticket/' + t.number, target: '_blank', rel: 'noopener', title: t.subject }, [h('b', { text: '#' + t.number }), h('span', { text: t.subject }), h('em', { text: ago(t.at) })]); }))]);
    }
    function plain(a, j) {
      var out = [];
      if (a.ticket) { out.push('Ticket #' + ((j.ticket && j.ticket.meta && j.ticket.meta.number) || '') + ': ' + a.ticket.summary); if (a.ticket.waiting) out.push('Waiting for: ' + a.ticket.waiting); if (a.ticket.next && a.ticket.next.length) out.push('Next: ' + a.ticket.next.join('; ')); if (a.ticket.improve && a.ticket.improve.length) out.push('Do better: ' + a.ticket.improve.join('; ')); out.push(''); }
      out.push(a.answer);
      if (a.checks && a.checks.length) out.push('', 'Check first:', a.checks.map(function (c) { return '- ' + c; }).join('\n'));
      if (a.steps && a.steps.length) out.push('', 'Steps:', a.steps.map(function (s, i) { return (i + 1) + '. ' + String(s).replace(/^\d+[.)]\s*/, ''); }).join('\n'));
      if (a.say) out.push('', 'To the client:', a.say);
      if (a.note) out.push('', 'Private note:', a.note);
      if (a.owner) out.push('', 'Owner: ' + a.owner.who + (a.owner.when ? ' (' + a.owner.when + ')' : ''));
      if (j.share) out.push('', 'Help Center: ' + j.share.url);
      return out.join('\n');
    }
    var TYPE = { kb: ['Help Center', 'book'], guide: ['Guide', 'book'], case: ['Solved ticket', 'ticket'], call: ['Support call', 'phone'], rule: ['Team rule', 'rule'], note: ['Team note', 'rule'], update: ['Update', 'news'], review: ['Reviewer decision', 'shield'], qa: ['QA rule', 'rule'], learned: ['Answered before', 'spark'] };
    function sourcesBox(list) {
      var box = h('details', { class: 'ax-srcs' }, [h('summary', null, [h('span', { text: 'Sources (' + list.length + ')' }), h('span', { class: 'ax-src-types' }, uniq(list.map(function (s) { return s.type; })).map(function (t) { return h('span', { class: 'ax-st t-' + t, text: (TYPE[t] || [t])[0] }); }))])]);
      var ul = h('ul');
      list.forEach(function (s) {
        var t = TYPE[s.type] || [s.type, 'book'], main;
        if (s.type === 'kb') main = h('button', { type: 'button', class: 'ax-src-t', onclick: function () { ctx.openArticle(s.id); } }, [s.title + (s.section ? ' › ' + s.section : '')]);
        else if (s.type === 'guide') main = h('button', { type: 'button', class: 'ax-src-t', onclick: function () { ctx.go(s.doc, s.id); } }, [s.title]);
        else if ((s.type === 'case' || s.type === 'review') && s.number) main = h('a', { class: 'ax-src-t', href: '/guides/ticket/' + s.number, target: '_blank', rel: 'noopener', text: (s.type === 'case' ? '#' + s.number + ' ' : '') + s.title + (s.type === 'review' ? ' (#' + s.number + ')' : '') });
        else main = h('span', { class: 'ax-src-t', text: s.title });
        ul.appendChild(h('li', { class: 't-' + s.type }, [h('span', { class: 'ax-src-ic' }, [icon(t[1], 'sm')]), h('div', null, [main, h('span', { class: 'ax-src-m', text: [t[0], s.module, s.at, s.channel].filter(Boolean).join(' · ') }), s.snippet ? h('span', { class: 'ax-src-s', text: s.snippet }) : null]),
          s.url ? h('a', { class: 'ax-mini', href: s.url, target: '_blank', rel: 'noopener', title: 'Open on help.adit.com' }, [icon('ext', 'sm')]) : null]));
      });
      box.appendChild(ul); return box;
    }
    function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
    function feedbackRow(j, q) {
      var row = h('div', { class: 'ax-fb' }, [h('span', { text: 'Was this right?' })]);
      var up = h('button', { type: 'button', class: 'ax-mini', 'aria-label': 'Yes, this was right' }, [icon('up', 'sm'), 'Yes']);
      var dn = h('button', { type: 'button', class: 'ax-mini', 'aria-label': 'No, something is wrong' }, [icon('down', 'sm'), 'No']);
      row.appendChild(up); row.appendChild(dn);
      if (j.ms) row.appendChild(h('span', { class: 'ax-muted ax-ms', text: (j.cached ? 'Saved answer' : (Math.round(j.ms / 100) / 10) + 's') }));
      function sendFb(vote, corr, comment) { return ctx.api('/api/guides/expert/feedback', { logId: j.logId, vote: vote, correction: corr || '', comment: comment || '' }); }
      up.addEventListener('click', function () { sendFb(1).then(function () { clear(row); row.appendChild(h('span', { class: 'ax-thanks' }, [icon('check', 'sm'), 'Thanks. Good answers are reused for the team.'])); }).catch(function () {}); });
      dn.addEventListener('click', function () {
        clear(row);
        var ta = h('textarea', { rows: '3', placeholder: 'What is the right answer, or what was wrong? A reviewer turns it into a team note so ' + 'Adit Expert answers it right next time.' });
        var sb = h('button', { type: 'button', class: 'gd-btn primary' }, ['Send']);
        sb.addEventListener('click', function () { sb.disabled = true; sendFb(-1, ta.value.trim()).then(function () { clear(row); row.appendChild(h('span', { class: 'ax-thanks' }, [icon('check', 'sm'), 'Thanks. Sent to the reviewers.'])); }).catch(function (e) { sb.disabled = false; }); });
        row.appendChild(h('div', { class: 'ax-fb-form' }, [ta, h('div', { class: 'ax-row' }, [h('button', { type: 'button', class: 'gd-btn', text: 'Cancel', onclick: function () { clear(row); row.appendChild(h('span', { class: 'ax-muted', text: 'Feedback skipped.' })); } }), sb])]));
        ta.focus();
      });
      return row;
    }
    heroPaint(); paintMods(); paintRecent(); paintScope();
    ctx.api('/api/guides/expert/meta').then(function (m) {
      S.meta = m; paintMods(); heroPaint();
      clear(popBox); if (!m.popular.length) popBox.appendChild(h('p', { class: 'ax-muted', text: 'Not enough questions yet.' }));
      m.popular.forEach(function (q) { popBox.appendChild(h('button', { type: 'button', text: q, onclick: function () { input.value = q; submit(); } })); });
    }).catch(function () {});
    // Open a shared conversation: the same answers, and the person can carry on asking from there.
    function loadShare(id) {
      if (S.busy || S.sharedId === id) return; S.sharedId = id;
      ctx.api('/api/guides/expert/share/' + encodeURIComponent(id)).then(function (r) {
        reset(false); intro.hidden = true; setFold(true);
        thread.appendChild(h('p', { class: 'ax-newnote', text: 'Shared by ' + (r.by || 'a colleague') + (r.at ? ' on ' + String(r.at).slice(0, 16) + ' UTC' : '') + '. You can carry on asking below.' }));
        r.items.forEach(function (it) {
          var lab = (MODES.find(function (m) { return m[0] === it.mode; }) || [null, 'Question'])[1];
          thread.appendChild(h('div', { class: 'ax-me' }, [h('span', { class: 'ax-me-mode', text: lab }), h('p', { text: it.q })]));
          it.j.mode = it.mode; thread.appendChild(answerCard(it.j, it.q));
          S.thread.push({ role: 'user', content: it.q }, { role: 'assistant', content: [it.j.answer && it.j.answer.answer].concat((it.j.answer && it.j.answer.steps) || []).join('\n') });
          S.items.push(it); S.lastQ = it.q;
        });
        paintBar();
      }).catch(function (e) { ctx.toast && ctx.toast(e.message); });
    }
    return { focus: function () { input.focus(); }, prefill: function (t) { input.value = t; input.focus(); }, loadShare: loadShare };
  }

  // ── Help Center browser ──────────────────────────────────────────────
  function Kb(panel, ctx) {
    var root = h('div', { class: 'ax-kb' }); panel.appendChild(root);
    var side = h('aside', { class: 'ax-kb-side' }), view = h('div', { class: 'ax-kb-view' });
    var find = h('input', { type: 'search', placeholder: 'Filter articles', 'aria-label': 'Filter articles' });
    side.appendChild(h('div', { class: 'gd-find' }, [icon('search'), find]));
    var toc = h('div', { class: 'ax-kb-toc' }); side.appendChild(toc);
    root.appendChild(side); root.appendChild(view);
    var mods = [], cur = null;
    view.appendChild(h('div', { class: 'ax-kb-empty' }, [icon('book', 'lg'), h('b', { text: 'Adit Help Center' }), h('span', { text: 'Pick an article on the left. Every article has the link to send to the client.' })]));
    function paintToc() {
      clear(toc); var f = find.value.trim().toLowerCase();
      mods.forEach(function (m) {
        var list = m.articles.filter(function (a) { return !f || a.title.toLowerCase().indexOf(f) >= 0 || m.module.toLowerCase().indexOf(f) >= 0; });
        if (!list.length) return;
        var det = h('details', { class: 'ax-kb-mod', open: f || (cur && cur.module === m.module) ? true : null }, [h('summary', null, [h('span', { text: m.module }), h('em', { text: String(list.length) })])]);
        var ul = h('ul');
        list.forEach(function (a) { ul.appendChild(h('li', null, [h('button', { type: 'button', class: cur && cur.id === a.id ? 'on' : '', onclick: function () { open(a.id); } }, [a.title, a.kind && a.kind !== 'How To' ? h('span', { class: 'ax-kind', text: a.kind }) : null])])); });
        det.appendChild(ul); toc.appendChild(det);
      });
    }
    find.addEventListener('input', paintToc);
    function open(id) {
      clear(view); view.appendChild(h('p', { class: 'gd-empty', text: 'Loading...' }));
      ctx.api('/api/guides/expert/kb/' + encodeURIComponent(id)).then(function (j) {
        var a = j.article; cur = a; paintToc(); clear(view);
        var hd = h('header', { class: 'ax-art-hd' }, [h('span', { class: 'ax-eyebrow' }, [a.module]), h('h1', { text: a.title }),
          h('div', { class: 'ax-row' }, [a.kind ? h('span', { class: 'ax-badge mod', text: a.kind }) : null, a.updated ? h('span', { class: 'ax-muted', text: 'Updated ' + a.updated }) : null, h('span', { class: 'ax-sp' }),
            a.url ? copyLink(a.url) : null, a.url ? h('a', { class: 'gd-btn', href: a.url, target: '_blank', rel: 'noopener' }, [icon('ext', 'sm'), 'Help Center']) : null,
            h('button', { type: 'button', class: 'gd-btn primary', onclick: function () { ctx.askAbout('About "' + a.title + '": ') } }, [icon('spark', 'sm'), 'Ask about this'])])]);
        var body = h('div', { class: 'ax-art gd-doc' });
        var list = null;
        a.blocks.forEach(function (b) {
          if (b.t === 'li') { if (!list) { list = h('ul'); body.appendChild(list); } list.appendChild(h('li', { text: b.x })); return; }
          list = null;
          if (b.t === 'table') { body.appendChild(h('table', null, [h('tbody', null, b.rows.map(function (r, i) { return h('tr', null, r.map(function (c) { return h(i === 0 ? 'th' : 'td', { text: c }); })); }))])); return; }
          if (/^h\d$/.test(b.t)) { body.appendChild(h(b.t === 'h3' ? 'h2' : 'h3', { text: b.x })); return; }
          body.appendChild(h('p', { text: b.x }));
        });
        view.appendChild(hd); view.appendChild(body); view.appendChild(h('p', { class: 'ax-muted', text: 'Screenshots and videos are on the Help Center page.' }));
        window.scrollTo(0, 0);
      }).catch(function (e) { clear(view); view.appendChild(h('div', { class: 'gd-note', text: e.message })); });
    }
    function copyLink(url) { var b = h('button', { type: 'button', class: 'gd-btn' }, [icon('link', 'sm'), 'Copy link']); b.addEventListener('click', function () { copy(url, b); }); return b; }
    ctx.api('/api/guides/expert/kb').then(function (j) { mods = j.modules; paintToc(); }).catch(function (e) { toc.appendChild(h('div', { class: 'gd-note', text: e.message })); });
    return { open: open };
  }

  // ── Teach (admins) ───────────────────────────────────────────────────
  function Teach(panel, ctx) {
    var root = h('div', { class: 'ax-teach' }); panel.appendChild(root);
    var modules = [], metaD = {};
    function load() {
      clear(root); root.appendChild(h('p', { class: 'gd-empty', text: 'Loading...' }));
      Promise.all([ctx.api('/api/guides/expert/admin'), ctx.api('/api/guides/expert/meta')]).then(function (rs) { metaD = rs[1] || {}; modules = metaD.modules || []; paint(rs[0]); }).catch(function (e) { clear(root); root.appendChild(h('div', { class: 'gd-note', text: e.message })); });
    }
    function stat(n, l, sub) { return h('div', { class: 'ax-stat' }, [h('b', { text: n == null ? '-' : String(n) }), h('span', { text: l }), sub ? h('em', { text: sub }) : null]); }
    function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '-'; }
    function paint(d) {
      clear(root);
      var L = d.insights.last30, K = d.insights.knowledge;
      root.appendChild(h('div', { class: 'ax-teach-hd' }, [h('div', null, [h('h1', { text: 'Teach Adit Expert' }), h('p', { class: 'ax-muted', text: 'Rules and notes you write here outrank everything else it reads. Corrections from agents land in the queue for you to approve.' })]),
        h('button', { type: 'button', class: 'gd-btn primary', onclick: function () { noteDialog(ctx, modules, load, null); } }, [icon('plus', 'sm'), 'New note'])]));
      root.appendChild(h('div', { class: 'ax-stats' }, [stat(L.asked, 'Questions, 30 days', L.people + ' people'), stat(pct(L.found, L.asked), 'Answered from sources'), stat(pct(L.verified, L.asked), 'Double-checked'),
        stat(L.up + ' / ' + L.down, 'Helpful / not'), stat(L.avgSec != null ? L.avgSec + 's' : '-', 'Average time')]));
      var syncB = h('button', { type: 'button', class: 'ax-mini' }, [icon('refresh', 'sm'), 'Learn from new calls now']);
      syncB.addEventListener('click', function () { syncB.disabled = true; ctx.api('/api/guides/expert/sync-calls', {}).then(function (r) { ctx.toast(r.added + ' call' + (r.added === 1 ? '' : 's') + ' learned'); load(); }).catch(function (e) { syncB.disabled = false; ctx.toast(e.message); }); });
      var kbB = h('button', { type: 'button', class: 'ax-mini' }, [icon('refresh', 'sm'), 'Read the Help Center now']);
      kbB.addEventListener('click', function () { kbB.disabled = true; ctx.toast('Reading help.adit.com...'); ctx.api('/api/guides/expert/kb-sync', {}).then(function (r) { ctx.toast(r.ok === false ? (r.error || 'Could not read the Help Center') : (r.fetched ? r.fetched + ' article' + (r.fetched === 1 ? '' : 's') + ' updated' : 'Already up to date') + (r.removed ? ', ' + r.removed + ' removed' : '')); load(); }).catch(function (e) { kbB.disabled = false; ctx.toast(e.message); }); });
      var kbSub = K.modules + ' product modules, ' + (metaD.kbLive ? 'read live from help.adit.com every 30 minutes' + (metaD.kbSyncedAt ? '. Last read ' + new Date(metaD.kbSyncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') : 'from the KB export until the first live read finishes');
      root.appendChild(h('section', { class: 'ax-card ax-know' }, [h('h2', { text: 'What it knows' }), h('div', { class: 'ax-know-g' }, [
        kn('book', K.articles + ' Help Center articles', kbSub, kbB), kn('book', 'VoIP guide and AI runbook', 'The support guides on this page'),
        kn('rule', K.notes + ' team rules and notes', 'Rule list and notes; highest authority'), kn('ticket', 'Solved tickets and chats', K.cases === 'live' ? 'Searched live in AditKB for every question' : 'AditKB not connected'),
        kn('phone', K.calls + ' support calls', K.callsLast ? 'Latest ' + String(K.callsLast).slice(0, 10) + '. Learns every 6 hours.' : 'Learns every 6 hours.', syncB), kn('news', (K.updates || 0) + ' product and process updates', 'Every update on the Adit Updates site, plus published QA updates; newest wins'),
        kn('shield', (K.reviews || 0) + ' reviewer decisions', 'Transfer reviews, AI and VoIP audits and reviews, QA audits. New ones are learned within 10 minutes.'), kn('rule', (K.qa || 0) + ' QA rules', 'From Ticket audits'), kn('spark', (K.learned || 0) + ' helpful answers', 'Answers agents marked helpful are reused for the same scenario')])]));
      // feedback
      var fb = h('section', { class: 'ax-card' }, [h('h2', { text: 'Corrections from agents (' + d.feedback.length + ')' })]);
      if (!d.feedback.length) fb.appendChild(h('p', { class: 'ax-muted', text: 'Nothing waiting.' }));
      d.feedback.forEach(function (f) {
        fb.appendChild(h('div', { class: 'ax-q' }, [h('div', { class: 'ax-q-hd' }, [h('b', { text: f.question || '(question)' }), h('span', { class: 'ax-muted', text: (f.email || '') + ' · ' + String(f.at || '').slice(0, 16) })]),
          f.answer ? h('p', { class: 'ax-q-a' }, [h('em', { text: 'It said: ' }), f.answer]) : null,
          f.correction || f.comment ? h('p', { class: 'ax-q-c' }, [h('em', { text: 'Agent says: ' }), f.correction || f.comment]) : null,
          h('div', { class: 'ax-row' }, [h('button', { type: 'button', class: 'gd-btn primary', onclick: function () { noteDialog(ctx, modules, load, null, { title: f.question ? f.question.slice(0, 120) : 'Correction', body: f.correction || f.comment || '', module: f.module || '' }, f.id); } }, [icon('check', 'sm'), 'Make it a note']),
            h('button', { type: 'button', class: 'gd-btn', onclick: function () { ctx.api('/api/guides/expert/feedback/' + f.id, { action: 'dismiss' }).then(load); } }, ['Dismiss'])])]));
      });
      root.appendChild(fb);
      // gaps
      var gp = h('section', { class: 'ax-card' }, [h('h2', { text: 'Gaps: questions it could not answer well' })]);
      if (!d.insights.gaps.length) gp.appendChild(h('p', { class: 'ax-muted', text: 'None in the last 30 days.' }));
      d.insights.gaps.slice(0, 20).forEach(function (g) {
        gp.appendChild(h('div', { class: 'ax-gap' }, [h('span', { class: 'ax-badge conf-' + (g.found ? g.confidence : 'low'), text: g.found ? g.confidence : 'not found' }), h('span', { class: 'ax-gap-q', text: g.question }),
          h('button', { type: 'button', class: 'ax-mini', onclick: function () { noteDialog(ctx, modules, load, null, { title: g.question.slice(0, 120), body: '', module: g.module || '' }); } }, [icon('edit', 'sm'), 'Answer it'])]));
      });
      root.appendChild(gp);
      // notes
      var notesOnly = d.notes.filter(function (n) { return n.kind !== 'rule'; });
      var nt = h('section', { class: 'ax-card' }, [h('h2', { text: 'Notes (' + notesOnly.length + ')' }), h('p', { class: 'ax-muted', style: 'margin:-6px 0 8px' }, ['Rules that apply to every answer are in ', h('button', { type: 'button', class: 'gd-link', text: 'Rule list', onclick: function () { ctx.go('rules'); } }), '.'])]);
      notesOnly.forEach(function (n) {
        nt.appendChild(h('div', { class: 'ax-note' + (n.status === 'off' ? ' off' : '') }, [h('span', { class: 'ax-badge ' + (n.kind === 'rule' ? 'rule' : 'mod'), text: n.kind === 'rule' ? 'Rule' : 'Note' }),
          h('div', null, [h('b', { text: n.title }), h('p', { text: n.body }), h('span', { class: 'ax-muted', text: [n.module, n.status === 'off' ? 'Off' : '', n.source === 'feedback' ? 'From agent feedback' : ''].filter(Boolean).join(' · ') })]),
          h('button', { type: 'button', class: 'ax-mini', onclick: function () { noteDialog(ctx, modules, load, n); } }, [icon('edit', 'sm'), 'Edit'])]));
      });
      root.appendChild(nt);
    }
    function kn(ic, t, s, extra) { return h('div', { class: 'ax-kn' }, [h('span', { class: 'ax-kn-ic' }, [icon(ic)]), h('div', null, [h('b', { text: t }), h('span', { text: s }), extra || null])]); }
    function lab(t, el) { return h('label', { class: 'ax-lab' }, [h('span', { text: t }), el]); }
    load();
    return { reload: load };
  }

  function dlab(t, el) { return h('label', { class: 'ax-lab' }, [h('span', { text: t }), el]); }
function noteDialog(ctx, modules, done, n, pre, feedbackId) {
    var d = n || pre || {};
    var title = h('input', { class: 'ax-in', value: d.title || '', maxlength: '160', placeholder: 'e.g. Callback requests go to VoIP' });
    var body = h('textarea', { class: 'ax-in', rows: '6', placeholder: 'Write it the way you would explain it to a new agent: the rule, the steps, who owns it.' }); body.value = d.body || '';
    var mod = h('select', { class: 'ax-in' }, [h('option', { value: '', text: 'Any product' })].concat(modules.concat(['Process', 'VoIP', 'AI Front Desk']).map(function (m) { return h('option', { value: m, text: m }); }))); mod.value = d.module || '';
    var kind = h('select', { class: 'ax-in' }, [h('option', { value: 'note', text: 'Note: used when relevant' }), h('option', { value: 'rule', text: 'Rule: always applied' })]); kind.value = d.kind || 'note';
    var on = h('input', { type: 'checkbox', checked: d.status === 'off' ? null : true });
    var err = h('p', { class: 'ax-err-t' });
    var dlg = h('dialog', { class: 'ax-dlg', 'aria-label': n ? 'Edit note' : 'New note' });
    var save = h('button', { type: 'button', class: 'gd-btn primary' }, ['Save']);
    dlg.appendChild(h('div', { class: 'ax-dlg-in' }, [h('h2', { text: n ? 'Edit' : d.kind === 'rule' ? 'New rule' : 'New rule or note' }), dlab('Title', title), dlab('What Adit Expert should know', body), h('div', { class: 'ax-2' }, [dlab('Product', mod), dlab('Type', kind)]),
      h('label', { class: 'ax-tog' }, [on, h('span', { text: 'Active' })]), err,
      h('div', { class: 'ax-row' }, [n ? h('button', { type: 'button', class: 'gd-btn danger', onclick: function () { if (!confirm('Delete this note?')) return; ctx.api('/api/guides/expert/notes/' + n.id, null, 'DELETE').then(function () { dlg.close(); done(); }); } }, [icon('trash', 'sm'), 'Delete']) : null,
        h('span', { class: 'ax-sp' }), h('button', { type: 'button', class: 'gd-btn', text: 'Cancel', onclick: function () { dlg.close(); } }), save])]));
    save.addEventListener('click', function () {
      err.textContent = ''; save.disabled = true;
      var payload = { title: title.value, body: body.value, module: mod.value, kind: kind.value, status: on.checked ? 'active' : 'off' };
      var p = feedbackId ? ctx.api('/api/guides/expert/feedback/' + feedbackId, Object.assign({ action: 'apply' }, payload)) : n ? ctx.api('/api/guides/expert/notes/' + n.id, payload, 'PUT') : ctx.api('/api/guides/expert/notes', payload);
      p.then(function () { dlg.close(); ctx.toast('Saved. Adit Expert uses it from now on.'); done(); }).catch(function (e) { save.disabled = false; err.textContent = e.message; });
    });
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg); dlg.showModal(); title.focus();
  }

  // ── Rule list (everyone reads, admins edit) ─────────────────────────
  function Rules(panel, ctx) {
    var root = h('div', { class: 'ax-teach' }); panel.appendChild(root);
    var modules = [];
    function load() {
      clear(root); root.appendChild(h('p', { class: 'gd-empty', text: 'Loading...' }));
      Promise.all([ctx.api('/api/guides/expert/rules'), ctx.api('/api/guides/expert/meta')]).then(function (rs) { modules = rs[1].modules || []; paint(rs[0]); })
        .catch(function (e) { clear(root); root.appendChild(h('div', { class: 'gd-note', text: e.message })); });
    }
    function paint(d) {
      clear(root);
      var admin = !!d.admin, act = d.rules.filter(function (r) { return r.status !== 'off'; }).length;
      root.appendChild(h('div', { class: 'ax-teach-hd' }, [h('div', null, [h('h1', { text: 'Rule list' }),
        h('p', { class: 'ax-muted', text: 'Adit Expert follows every active rule in every answer, ahead of the Help Center, the guides and past tickets. ' + (admin ? 'Add, edit or switch off a rule here; the next question uses the change.' : 'Only admins can change them; ask your lead if a rule looks wrong.') })]),
        admin ? h('button', { type: 'button', class: 'gd-btn primary', onclick: function () { noteDialog(ctx, modules, load, null, { kind: 'rule', module: 'Process' }); } }, [icon('plus', 'sm'), 'Add rule']) : null]));
      var card = h('section', { class: 'ax-card' }, [h('h2', { text: act + ' active rule' + (act === 1 ? '' : 's') })]);
      if (!d.rules.length) card.appendChild(h('p', { class: 'ax-muted', text: 'No rules yet.' }));
      var ol = h('ol', { class: 'ax-rlist' });
      d.rules.forEach(function (r) {
        var tools = admin ? h('div', { class: 'ax-row' }, [
          h('button', { type: 'button', class: 'ax-mini', onclick: function () { noteDialog(ctx, modules, load, r); } }, [icon('edit', 'sm'), 'Edit']),
          h('button', { type: 'button', class: 'ax-mini', onclick: function () { ctx.api('/api/guides/expert/notes/' + r.id, { title: r.title, body: r.body, module: r.module || '', kind: 'rule', status: r.status === 'off' ? 'active' : 'off' }, 'PUT').then(function () { ctx.toast(r.status === 'off' ? 'Rule switched on' : 'Rule switched off'); load(); }).catch(function (e) { ctx.toast(e.message); }); } }, [r.status === 'off' ? 'Switch on' : 'Switch off'])]) : null;
        ol.appendChild(h('li', { class: 'ax-rule' + (r.status === 'off' ? ' off' : '') }, [h('div', { class: 'ax-rule-b' }, [h('b', { text: r.title }), h('p', { text: r.body }),
          h('span', { class: 'ax-muted', text: [r.module, r.status === 'off' ? 'Switched off' : '', r.updated_at ? 'Updated ' + String(r.updated_at).slice(0, 10) : ''].filter(Boolean).join(' · ') })]), tools]));
      });
      card.appendChild(ol); root.appendChild(card);
    }
    load();
    return { reload: load };
  }

  // ── Open tickets (Batch 197, admins) ────────────────────────────────
  // Every ticket in the T1 view of Desk with Adit Expert's suggestion: close, keep open, act now or hand over.
  var VERD = { close: 'Close', act: 'Act now', handover: 'Hand over', wait: 'Keep open' };
  function Triage(panel, ctx) {
    var root = h('div', { class: 'ax-tri' }); panel.appendChild(root);
    var D = null, F = { v: 'all', q: '', owner: '', status: '', sort: 'idle' }, open = {}, poll = null, lastDone = -1;
    function ago(iso) { if (!iso) return 'never'; var m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
    function when(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    function load(refresh) {
      if (!D) { clear(root); root.appendChild(h('p', { class: 'gd-empty', text: 'Reading the T1 view from Zoho Desk...' })); }
      return ctx.api('/api/guides/expert/triage' + (refresh ? '?refresh=1' : '')).then(function (j) { D = j; paint(); watch(); })
        .catch(function (e) { clear(root); root.appendChild(h('div', { class: 'gd-note', text: e.message })); });
    }
    function watch() {
      clearInterval(poll); poll = null;
      if (!D || !D.queue || !D.queue.running) return;
      lastDone = D.queue.done + D.queue.failed;
      poll = setInterval(function () {
        if (panel.hidden) return;
        ctx.api('/api/guides/expert/triage/status').then(function (j) {
          var q = j.queue, n = q.done + q.failed; D.queue = q;
          if (!q.running || n - lastDone >= 3) { lastDone = n; load(false); } else paintProgress();
        }).catch(function () {});
      }, 5000);
    }
    function act(path, body, msg) {
      return ctx.api('/api/guides/expert/triage/' + path, body || {}).then(function (j) { if (msg) ctx.toast(msg); if (j.queue) D.queue = j.queue; paint(); watch(); return j; }).catch(function (e) { ctx.toast(e.message); });
    }
    var progEl = null;
    function paintProgress() {
      if (!progEl) return; clear(progEl);
      var q = D.queue || {};
      if (q.running) {
        var pct = q.total ? Math.round((q.done + q.failed) / q.total * 100) : 0;
        progEl.appendChild(h('div', { class: 'ax-tri-prog', role: 'status' }, [h('span', { text: 'Reviewing ' + (q.done + q.failed) + ' of ' + q.total + (q.current ? ' (now #' + q.current + ')' : '') + (q.failed ? ', ' + q.failed + ' failed' : '') }),
          h('div', { class: 'ax-tri-bar', 'aria-hidden': 'true' }, [h('i', { style: 'width:' + pct + '%' })])]));
      }
    }
    function rowsShown() {
      var q = F.q.trim().toLowerCase();
      var list = D.rows.filter(function (r) {
        if (F.v === 'none' ? r.verdict : F.v !== 'all' && r.verdict !== F.v) return false;
        if (F.owner && (r.owner || 'Unassigned') !== F.owner) return false;
        if (F.status && r.status !== F.status) return false;
        if (q && (r.number + ' ' + r.subject + ' ' + (r.owner || '') + ' ' + ((r.result && r.result.headline) || '')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var key = { idle: function (r) { return -(r.idle || 0); }, age: function (r) { return -(r.age || 0); }, recent: function (r) { return r.idle || 0; } }[F.sort];
      return list.sort(function (a, b) { return key(a) - key(b); });
    }
    function csv() {
      var rows = rowsShown(), esc = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var out = [['Ticket', 'Subject', 'Status', 'Owner', 'Open days', 'Idle days', 'Suggestion', 'Confidence', 'What to do', 'Why', 'Next steps', 'Asana', 'Desk link'].join(',')];
      rows.forEach(function (r) { var x = r.result || {}; out.push([r.number, r.subject, r.status, r.owner || 'Unassigned', r.age, r.idle, VERD[r.verdict] || 'Not reviewed', x.confidence || '', x.headline || '', x.why || '', (x.next || []).join(' | '), r.asana, r.url].map(esc).join(',')); });
      var a = h('a', { href: URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' })), download: 'open-t1-tickets-' + new Date().toISOString().slice(0, 10) + '.csv' });
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
    }
    function sel(label, val, opts, on) {
      var s = h('select', { class: 'ax-tri-sel', 'aria-label': label, onchange: function () { on(s.value); } }, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      s.value = val; return s;
    }
    var listEl = null;
    function paint() {
      clear(root);
      var rows = D.rows, n = { all: rows.length, none: 0 }; Object.keys(VERD).forEach(function (k) { n[k] = 0; });
      rows.forEach(function (r) { if (r.verdict) n[r.verdict] = (n[r.verdict] || 0) + 1; else n.none++; });
      var q = D.queue || {}, withAsana = rows.filter(function (r) { return r.asana; }).length;
      root.appendChild(h('div', { class: 'ax-teach-hd ax-tri-hd' }, [
        h('div', {}, [h('h2', { text: 'Open T1 tickets' }), h('p', { class: 'ax-muted', text: 'Every ticket in the T1 view of Zoho Desk (team T1 - Customer Support, status not Closed). Adit Expert reads the whole ticket, the private notes, screenshots and attachments, the client\'s earlier tickets, the CRM, the Help Center and the Asana task, then suggests what to do. Suggestions only: nothing is changed in Desk.' })]),
        h('div', { class: 'ax-row ax-tri-tools' }, [
          q.running ? h('button', { type: 'button', class: 'gd-btn', onclick: function () { act('stop', {}, 'Stopping after the current ticket'); } }, [icon('x', 'sm'), 'Stop'])
            : h('button', { type: 'button', class: 'gd-btn primary', onclick: function () { act('run', {}, 'Reviewing new and changed tickets'); } }, [icon('spark', 'sm'), 'Review new and changed']),
          q.running ? null : h('button', { type: 'button', class: 'gd-btn', onclick: function () { if (confirm('Review all ' + rows.length + ' tickets again? This takes a while.')) act('run', { all: true }, 'Reviewing every ticket'); } }, ['Review all again']),
          h('button', { type: 'button', class: 'gd-btn', onclick: function () { load(true).then(function () { ctx.toast('List read from Desk'); }); } }, [icon('refresh', 'sm'), 'Refresh list']),
          h('button', { type: 'button', class: 'gd-btn', onclick: csv }, ['Download CSV'])])]));
      root.appendChild(h('p', { class: 'ax-muted ax-tri-meta', text: rows.length + ' open tickets. List read from Desk ' + ago(D.listedAt) + '. ' + (rows.length - n.none) + ' reviewed' + (D.runAt ? ', last full run ' + ago(D.runAt) : '') + '. New and changed tickets are reviewed every night at 3 AM Central.' }));
      if (D.listErr) root.appendChild(h('div', { class: 'gd-note', text: 'Could not read the list from Desk just now (' + D.listErr + '). Showing the last list.' }));
      if (!D.asana && withAsana) root.appendChild(h('div', { class: 'ax-tri-asana' }, [icon('link', 'sm'), h('span', { text: withAsana + (withAsana === 1 ? ' ticket links' : ' tickets link') + ' an Asana task. Adit Expert sees the Asana owner and due date from Desk, but cannot read the task itself yet. Add an ASANA_ACCESS_TOKEN variable in Railway to let it read task status and comments.' })]));
      progEl = h('div'); root.appendChild(progEl); paintProgress();
      var chips = h('div', { class: 'ax-tri-chips', role: 'group', 'aria-label': 'Filter by suggestion' });
      [['all', 'All'], ['act', VERD.act], ['close', VERD.close], ['handover', VERD.handover], ['wait', VERD.wait], ['none', 'Not reviewed']].forEach(function (c) {
        chips.appendChild(h('button', { type: 'button', class: 'ax-tri-chip v-' + c[0], 'aria-pressed': F.v === c[0] ? 'true' : 'false', onclick: function () { F.v = c[0]; paint(); } }, [h('span', { text: c[1] }), h('b', { text: String(n[c[0]] || 0) })]));
      });
      root.appendChild(chips);
      var owners = {}, stats = {}; rows.forEach(function (r) { owners[r.owner || 'Unassigned'] = 1; stats[r.status] = 1; });
      var search = h('input', { type: 'search', class: 'ax-tri-q', placeholder: 'Search ticket, subject, owner', 'aria-label': 'Search tickets', value: F.q });
      search.addEventListener('input', function () { F.q = search.value; paintList(); });
      root.appendChild(h('div', { class: 'ax-row ax-tri-filters' }, [search,
        sel('Owner', F.owner, [['', 'All owners']].concat(Object.keys(owners).sort().map(function (o) { return [o, o]; })), function (v) { F.owner = v; paintList(); }),
        sel('Status', F.status, [['', 'All statuses']].concat(Object.keys(stats).sort().map(function (o) { return [o, o]; })), function (v) { F.status = v; paintList(); }),
        sel('Sort', F.sort, [['idle', 'Longest without a change'], ['age', 'Oldest ticket first'], ['recent', 'Changed most recently']], function (v) { F.sort = v; paintList(); })]));
      listEl = h('ol', { class: 'ax-tri-list' }); root.appendChild(listEl); paintList();
    }
    function paintList() {
      clear(listEl);
      var rows = rowsShown();
      if (!rows.length) { listEl.appendChild(h('li', { class: 'ax-muted ax-tri-empty', text: 'No tickets match.' })); return; }
      rows.forEach(function (r) { listEl.appendChild(item(r)); });
    }
    function item(r) {
      var x = r.result, isOpen = !!open[r.id];
      var pill = h('span', { class: 'ax-tri-v v-' + (r.verdict || 'none'), text: VERD[r.verdict] || 'Not reviewed' });
      var meta = [r.status, r.owner || 'Unassigned', 'open ' + r.age + ' d', 'no change ' + r.idle + ' d', r.asana ? 'Asana' : '', x && x.confidence ? x.confidence + ' confidence' : ''].filter(Boolean).join(' · ');
      var head = h('button', { type: 'button', class: 'ax-tri-head', 'aria-expanded': isOpen ? 'true' : 'false', onclick: function () { open[r.id] = !open[r.id]; li.replaceWith(item(r)); } }, [
        pill, h('span', { class: 'ax-tri-main' }, [h('b', { text: '#' + r.number + ' ' + r.subject }), h('span', { class: 'ax-muted', text: meta }),
          x && x.headline ? h('span', { class: 'ax-tri-hl', text: x.headline }) : r.error ? h('span', { class: 'ax-tri-err', text: 'Review failed: ' + r.error }) : null])]);
      var li = h('li', { class: 'ax-tri-item' + (isOpen ? ' open' : '') }, [h('div', { class: 'ax-tri-top' }, [head, r.url ? h('a', { class: 'ax-mini', href: r.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open ticket ' + r.number + ' in Desk' }, [icon('ext', 'sm'), 'Desk']) : null])]);
      if (isOpen) li.appendChild(detail(r));
      return li;
    }
    function block(title, kids) { return h('div', { class: 'ax-tri-b' }, [h('h4', { text: title })].concat(kids)); }
    function copyBtn(text, label) { var b = h('button', { type: 'button', class: 'ax-mini' }, [icon('copy', 'sm'), label]); b.addEventListener('click', function () { copy(text, b); }); return b; }
    function detail(r) {
      var x = r.result, box = h('div', { class: 'ax-tri-d' });
      var again = h('button', { type: 'button', class: 'ax-mini', onclick: function () {
        again.disabled = true; again.textContent = 'Reviewing...';
        ctx.api('/api/guides/expert/triage/' + encodeURIComponent(r.id) + '/analyse', {}).then(function (j) { r.result = j.result; r.verdict = j.result.verdict; r.error = null; r.stale = false; r.analysedAt = new Date().toISOString(); ctx.toast('Ticket #' + r.number + ' reviewed'); paint(); })
          .catch(function (e) { ctx.toast(e.message); again.disabled = false; again.textContent = 'Review again'; });
      } }, [icon('refresh', 'sm'), x ? 'Review again' : 'Review now']);
      if (!x) { box.appendChild(h('p', { class: 'ax-muted', text: r.error ? 'The last review failed (' + r.error + ').' : 'Not reviewed yet.' })); box.appendChild(again); return box; }
      box.appendChild(h('p', { class: 'ax-tri-why', text: x.why }));
      var cols = h('div', { class: 'ax-tri-cols' });
      var left = h('div'), right = h('div');
      if (x.next && x.next.length) left.appendChild(block('Next steps', [h('ol', {}, x.next.map(function (s) { return h('li', { text: s }); }))]));
      if (x.client_message) left.appendChild(block('Message to the client', [h('pre', { class: 'ax-tri-msg', text: x.client_message }), copyBtn(x.client_message, 'Copy message')]));
      if (x.internal_note) left.appendChild(block('Private note for Desk', [h('p', { text: x.internal_note }), copyBtn(x.internal_note, 'Copy note')]));
      var kv = [['Waiting on', x.waiting_on], ['Status', /^ok\b/i.test(x.status_now || '') ? 'Correct as it is' : x.status_now], ['Asana', x.asana], ['Risk', x.risk], ['Help Center', x.kb], ['CSM', x.meta && x.meta.csm]].filter(function (p) { return p[1]; });
      if (kv.length) right.appendChild(block('At a glance', [h('dl', { class: 'ax-tri-kv' }, [].concat.apply([], kv.map(function (p) { return [h('dt', { text: p[0] }), h('dd', { text: p[1] })]; })))]));
      if (x.evidence && x.evidence.length) right.appendChild(block('Evidence', [h('ul', {}, x.evidence.map(function (s) { return h('li', { text: s }); }))]));
      cols.appendChild(left); cols.appendChild(right); box.appendChild(cols);
      var m = x.meta || {};
      box.appendChild(h('div', { class: 'ax-tri-foot' }, [h('span', { class: 'ax-muted', text: 'Reviewed ' + when(r.analysedAt) + (r.stale ? '. Changed in Desk since then.' : '.') + ' Read ' + (m.messages || 0) + ((m.messages === 1) ? ' message, ' : ' messages, ') + (m.notes || 0) + (m.notes === 1 ? ' private note' : ' private notes') + (m.images ? ', ' + m.images + (m.images === 1 ? ' screenshot' : ' screenshots') : '') + (m.crm ? ', the CRM' : '') + (m.asanaRead ? ', the Asana task' : '') + '.' }), again]));
      return box;
    }
    load(false);
    return { reload: function () { load(false); } };
  }

  window.AditExpert = { Ask: Ask, Kb: Kb, Teach: Teach, Rules: Rules, Triage: Triage };
})();
