/* Batch 156: Support guides (/guides). VoIP guide, AI runbook and Ask AI. Also embedded in the app (?embed=1). */
(function () {
  'use strict';
  var EMBED = document.documentElement.classList.contains('embed');
  var main = document.getElementById('gd-main'), nav = document.getElementById('gd-nav'), userBox = document.getElementById('gd-user'), live = document.getElementById('gd-live');
  var S = { docs: [], me: null, ai: false, tab: 'voip', voipHtml: null, thread: [], scope: '', busy: false };

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function icon(path, cls) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + (cls || '')); s.setAttribute('aria-hidden', 'true'); s.innerHTML = path; return s; }
  var IC = {
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>'
  };
  // Six-digit Zoho Desk ticket numbers open the ticket (the server finds it in AditKB).
  function linkTickets(text) {
    var frag = document.createDocumentFragment(), re = /(^|[^\d.#\/=-])(\d{6})(?![\d.])/g, at = 0, m;
    text = String(text || '');
    while ((m = re.exec(text))) {
      var start = m.index + m[1].length;
      frag.appendChild(document.createTextNode(text.slice(at, start)));
      frag.appendChild(h('a', { class: 'gd-tk', href: '/guides/ticket/' + m[2], target: '_blank', rel: 'noopener', title: 'Open ticket #' + m[2] + ' in Zoho Desk', text: m[2] }));
      at = start + 6;
    }
    frag.appendChild(document.createTextNode(text.slice(at)));
    return frag;
  }
  function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }
  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401) { try { localStorage.removeItem('rcSession'); localStorage.removeItem('rcLastUser'); } catch (e) {} location.replace(EMBED ? '/' : '/?next=/guides'); throw new Error('Please sign in'); }
        return r.json().catch(function () { return { success: false, error: 'The server is busy, try again in a moment.' }; }).then(function (j) {
          if (r.status === 403 && j && j.assessmentOnly) { location.replace('/assess'); throw new Error('No access'); }
          if (!r.ok || !j || j.success === false) throw new Error((j && j.error) || ('HTTP ' + r.status));
          return j;
        });
      });
  }

  // ── shell ───────────────────────────────────────────────────────────
  var TABS = [['voip', 'VoIP support', 'phone'], ['ai', 'AI support', 'bot'], ['ask', 'Ask AI', 'spark']];
  function renderNav() {
    nav.replaceChildren.apply(nav, TABS.map(function (t) {
      return h('button', { type: 'button', 'aria-current': S.tab === t[0] ? 'page' : null, onclick: function () { go(t[0]); } }, [icon(IC[t[2]], t[0] === 'ask' ? 'gd-spark' : ''), t[1]]);
    }));
  }
  function renderUser() {
    if (EMBED || !S.me) return;
    var kids = [h('b', { text: S.me.name || S.me.email })];
    if (S.me.member) kids.push(h('a', { class: 'gd-btn', href: '/', text: 'Open the tool' }));
    else if (S.me.assess) kids.push(h('a', { class: 'gd-btn', href: '/assess', text: 'Tests' }));
    kids.push(h('button', { type: 'button', class: 'gd-btn', text: 'Sign out', onclick: function () {
      fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).finally(function () { try { localStorage.removeItem('rcSession'); localStorage.removeItem('rcLastUser'); } catch (e) {} location.replace('/?next=/guides'); });
    } }));
    userBox.replaceChildren.apply(userBox, kids);
  }
  function go(tab, anchor) {
    var hash = '#' + tab + (anchor ? '/' + anchor : '');
    if (location.hash !== hash) { try { history.pushState(null, '', hash); } catch (e) { location.hash = hash; } }
    route();
  }
  function route() {
    var m = /^#(voip|ai|ask)(?:\/(.+))?$/.exec(location.hash || '');
    S.tab = m ? m[1] : 'voip';
    var anchor = m && m[2] ? decodeURIComponent(m[2]) : null;
    renderNav();
    if (S.tab === 'voip') showVoip(anchor);
    else if (S.tab === 'ai') showAi(anchor);
    else showAsk();
  }
  window.addEventListener('popstate', route);
  function fab() { return S.ai ? h('button', { type: 'button', class: 'gd-fab', onclick: function () { go('ask'); } }, [icon(IC.spark), 'Ask AI']) : null; }

  // ── VoIP guide ──────────────────────────────────────────────────────
  var reader = null;
  function showVoip(anchor) {
    if (reader && S.voipHtml) { main.replaceChildren(reader.root, fab()); if (anchor) jump(anchor); return; }
    main.replaceChildren(h('p', { class: 'gd-empty', text: 'Loading the VoIP guide...' }));
    api('/api/guides/doc/voip').then(function (j) { S.voipHtml = j.html; buildReader(); main.replaceChildren(reader.root, fab()); if (anchor) jump(anchor); })
      .catch(function (e) { main.replaceChildren(h('div', { class: 'gd-note', text: 'Could not load the guide: ' + e.message })); });
  }
  // Layout only: the guide's words are not changed. Parts become banners, each section a numbered block,
  // each sub-topic a card, and every "Who handles it" line a callout, like the AI runbook.
  function structure(doc) {
    var nodes = Array.prototype.slice.call(doc.childNodes);
    var intro = h('div', { class: 'gd-lede' }), part = null, partNo = 0, sec = null, secNo = 0, card = null, counts = [];
    var frag = document.createDocumentFragment();
    nodes.forEach(function (n) {
      var tag = n.nodeType === 1 ? n.tagName : '';
      if (tag === 'H1') {
        partNo++; secNo = 0; sec = null; card = null; counts[partNo - 1] = 0;
        part = h('div', { class: 'gd-part gd-part-' + partNo });
        part.appendChild(h('div', { class: 'gd-part-hd' }, [h('span', { class: 'gd-eyebrow', text: 'Part ' + partNo }), n]));
        frag.appendChild(part); return;
      }
      if (tag === 'H2') {
        secNo++; card = null; if (partNo) counts[partNo - 1]++;
        var num = (secNo < 10 ? '0' : '') + secNo;
        n.setAttribute('data-num', num);
        sec = h('section', { class: 'gd-sec' }, [h('div', { class: 'gd-sec-hd' }, [h('span', { class: 'gd-num', 'aria-hidden': 'true', text: num }), n])]);
        (part || frag).appendChild(sec); return;
      }
      if (tag === 'H3') {
        card = h('div', { class: 'gd-card' }, [n]);
        (sec || part || frag).appendChild(card); return;
      }
      if (tag === 'P' && /^\s*Who handles it:/.test(n.textContent)) n.className = 'gd-who';
      (card || sec || part || intro).appendChild(n);
    });
    var facts = h('dl', { class: 'gd-facts' }, [
      h('div', null, [h('dt', { text: 'Part 1' }), h('dd', { text: 'Support guide, ' + (counts[0] || 0) + ' sections' })]),
      h('div', null, [h('dt', { text: 'Part 2' }), h('dd', { text: 'Query catalog, ' + (counts[1] || 0) + ' topics' })]),
      h('div', null, [h('dt', { text: 'Tickets' }), h('dd', { text: 'Numbers open the ticket in Zoho Desk' })])
    ]);
    var mast = h('div', { class: 'gd-mast' }, [h('div', null, [h('span', { class: 'gd-eyebrow', text: 'Tier 1 Support · Adit Voice' }), h('h1', { class: 'gd-title', text: 'T1 CS VoIP Support Guide and Query Catalog' }), intro]), facts]);
    doc.replaceChildren(mast, frag);
  }
  function buildReader() {
    var doc = h('article', { class: 'gd-doc', 'aria-label': 'VoIP support guide' });
    doc.innerHTML = S.voipHtml; // static guide content, cleaned when it was imported
    structure(doc);
    var toc = h('ul', { class: 'gd-toc' });
    var heads = Array.prototype.slice.call(doc.querySelectorAll('h1[id],h2[id],h3[id]'));
    var items = heads.map(function (hd) {
      var label = hd.textContent.replace(/\s+/g, ' ').trim();
      var a = h('a', { href: '#voip/' + hd.id, class: 'l' + hd.tagName.charAt(1), onclick: function (ev) { ev.preventDefault(); go('voip', hd.id); } });
      if (hd.getAttribute('data-num')) a.appendChild(h('span', { class: 'gd-toc-n', text: hd.getAttribute('data-num') }));
      a.appendChild(document.createTextNode(label));
      var li = h('li', null, [a]); toc.appendChild(li); return { hd: hd, a: a, li: li };
    });
    var count = h('span', { class: 'gd-find-n', 'aria-live': 'polite' });
    var input = h('input', { type: 'search', placeholder: 'Search the VoIP guide', 'aria-label': 'Search the VoIP guide' });
    var timer = null, hits = [], hitAt = -1;
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { find(input.value); }, 200); });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && hits.length) { ev.preventDefault(); hitAt = (hitAt + 1) % hits.length; hits[hitAt].scrollIntoView({ block: 'center' }); } });
    function sectionOf(i) { var hd = items[i].hd; var box = hd.tagName === 'H1' ? null : hd.closest('.gd-card, .gd-sec'); return box ? [box] : []; }
    function find(q) {
      q = String(q || '').trim();
      doc.innerHTML = S.voipHtml;
      structure(doc);
      heads = Array.prototype.slice.call(doc.querySelectorAll('h1[id],h2[id],h3[id]'));
      items.forEach(function (it, i) { it.hd = heads[i]; });
      hits = []; hitAt = -1;
      if (q.length < 2) { items.forEach(function (it) { it.li.classList.remove('hide'); }); count.textContent = ''; return; }
      var ql = q.toLowerCase(), found = 0;
      items.forEach(function (it, i) {
        var txt = it.hd.textContent + ' ' + sectionOf(i).map(function (n) { return n.textContent || ''; }).join(' ');
        var on = txt.toLowerCase().indexOf(ql) > -1;
        it.li.classList.toggle('hide', !on); if (on) found++;
      });
      var walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, null), nodes = [], n;
      while ((n = walker.nextNode())) if (n.nodeValue.toLowerCase().indexOf(ql) > -1) nodes.push(n);
      nodes.slice(0, 400).forEach(function (node) {
        var t = node.nodeValue, low = t.toLowerCase(), frag = document.createDocumentFragment(), at = 0, k;
        while ((k = low.indexOf(ql, at)) > -1) { frag.appendChild(document.createTextNode(t.slice(at, k))); var mk = h('mark', { text: t.slice(k, k + q.length) }); frag.appendChild(mk); hits.push(mk); at = k + q.length; }
        frag.appendChild(document.createTextNode(t.slice(at))); node.parentNode.replaceChild(frag, node);
      });
      count.textContent = hits.length ? hits.length + ' match' + (hits.length === 1 ? '' : 'es') + ' in ' + found + ' section' + (found === 1 ? '' : 's') + '. Press Enter for the next one.' : 'No matches. Try Ask AI.';
      if (hits.length) { hitAt = 0; hits[0].scrollIntoView({ block: 'center' }); }
      spy();
    }
    var side = h('aside', { class: 'gd-side', 'aria-label': 'Contents' }, [h('div', { class: 'gd-find' }, [icon(IC.search), input, count]), h('nav', { 'aria-label': 'Guide sections' }, [toc])]);
    var root = h('div', { class: 'gd-reader' }, [side, doc]);
    var obs = null;
    function spy() {
      if (obs) obs.disconnect();
      if (!('IntersectionObserver' in window)) return;
      obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { if (!e.isIntersecting) return; items.forEach(function (it) { var on = it.hd === e.target; it.a.classList.toggle('on', on); if (on) { var r = it.a.getBoundingClientRect(), sr = side.getBoundingClientRect(); if (r.top < sr.top || r.bottom > sr.bottom) it.a.scrollIntoView({ block: 'nearest' }); } }); });
      }, { rootMargin: '-70px 0px -70% 0px' });
      items.forEach(function (it) { obs.observe(it.hd); });
    }
    setTimeout(spy, 50);
    reader = { root: root, doc: doc };
  }
  function jump(id) {
    var el = reader && reader.doc.querySelector('[id="' + String(id).replace(/"/g, '') + '"]');
    if (!el) return;
    setTimeout(function () { el.scrollIntoView({ block: 'start' }); el.classList.remove('gd-flash'); void el.offsetWidth; el.classList.add('gd-flash'); }, 30);
  }

  // ── AI runbook (own design, framed) ─────────────────────────────────
  var aiFrame = null;
  function showAi(anchor) {
    var src = '/guides/doc/ai' + (anchor ? '#' + encodeURIComponent(anchor) : '');
    if (!aiFrame) aiFrame = h('iframe', { class: 'gd-frame', title: 'T1 AI Support Runbook', src: src });
    else if (anchor) { try { aiFrame.contentWindow.location.hash = anchor; } catch (e) { aiFrame.src = src; } }
    main.replaceChildren(aiFrame, fab());
  }

  // ── Ask AI ──────────────────────────────────────────────────────────
  var askView = null;
  var SUGG = ['Client says the desk phone shows "No Account". What do I check?', 'How do I change the greeting or voicemail message?', 'The AI is texting patients but the SMS Agent is off. Who handles it?', 'Calls go straight to voicemail. What are the checks?', 'What do I attach before routing an AI call issue to AI Support?'];
  function showAsk() {
    if (!askView) askView = buildAsk();
    main.replaceChildren(askView.root);
    setTimeout(function () { askView.input.focus(); }, 30);
  }
  function buildAsk() {
    var thread = h('div', { class: 'gd-thread', role: 'log', 'aria-label': 'Answers' });
    var input = h('textarea', { rows: '2', placeholder: S.ai ? 'Ask about a VoIP or AI support issue...' : 'Ask AI is not set up yet', 'aria-label': 'Your question', disabled: !S.ai });
    var send = h('button', { type: 'submit', class: 'gd-btn primary', disabled: !S.ai, 'aria-label': 'Ask' }, [icon(IC.send), 'Ask']);
    var scopes = [['', 'All guides'], ['voip', 'VoIP only'], ['ai', 'AI only']];
    var scopeBox = h('div', { class: 'gd-scope', role: 'group', 'aria-label': 'Search in' });
    function drawScopes() { scopeBox.replaceChildren.apply(scopeBox, scopes.map(function (s) { return h('button', { type: 'button', class: 'gd-chip', 'aria-pressed': S.scope === s[0] ? 'true' : 'false', text: s[1], onclick: function () { S.scope = s[0]; drawScopes(); } }); })); }
    drawScopes();
    var sugg = h('div', { class: 'gd-sugg' }, SUGG.map(function (q) { return h('button', { type: 'button', text: q, onclick: function () { input.value = q; submit(); } }); }));
    var form = h('form', { class: 'gd-form', onsubmit: function (ev) { ev.preventDefault(); submit(); } }, [input, send]);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(); } });
    function bubble(kind, text) { var b = h('div', { class: 'gd-msg ' + kind }); if (text != null) b.textContent = text; thread.appendChild(b); b.scrollIntoView({ block: 'end' }); return b; }
    function submit() {
      var q = input.value.trim();
      if (!q || S.busy) return;
      S.busy = true; send.disabled = true; sugg.remove();
      bubble('me', q); input.value = '';
      var wait = bubble('bot'); wait.appendChild(h('span', { class: 'gd-dots', 'aria-label': 'Finding the answer' }, [h('i'), h('i'), h('i')]));
      var history = S.thread.slice(-6);
      api('/api/guides/ask', { question: q, history: history, doc: S.scope || null }).then(function (j) {
        wait.replaceChildren(linkTickets(j.answer));
        if (j.sources && j.sources.length) {
          wait.appendChild(h('div', { class: 'gd-src' }, [h('span', { class: 'gd-src-l', text: 'From the guide:' })].concat(j.sources.map(function (s) {
            return h('a', { href: '#' + s.doc + '/' + encodeURIComponent(s.id), text: s.docTitle + ': ' + s.title, onclick: function (ev) { ev.preventDefault(); go(s.doc, s.id); } });
          }))));
        }
        S.thread.push({ role: 'user', content: q }, { role: 'assistant', content: j.answer });
        say('Answer ready');
      }).catch(function (e) { wait.className = 'gd-msg bot err'; wait.textContent = e.message || 'Something went wrong, try again.'; })
        .then(function () { S.busy = false; send.disabled = !S.ai; input.focus(); });
    }
    var root = h('section', { class: 'gd-ask', 'aria-labelledby': 'gd-ask-h' }, [
      h('div', { class: 'gd-ask-hd' }, [h('h1', { id: 'gd-ask-h', text: 'Ask AI' }), h('p', { text: 'Answers come only from the VoIP and AI support guides, with links to the part of the guide they came from.' })]),
      scopeBox, thread, sugg, form,
      h('p', { class: 'gd-fine', text: 'Check the linked section before you act on a live call. If the guide does not cover it, Ask AI says so.' })
    ]);
    return { root: root, input: input };
  }

  // ── start ───────────────────────────────────────────────────────────
  api('/api/guides/docs').then(function (j) {
    S.docs = j.docs || []; S.me = j.me || null; S.ai = !!j.ai;
    renderUser(); route();
  }).catch(function (e) {
    if (/sign in|No access/i.test(e.message)) return;
    main.replaceChildren(h('div', { class: 'gd-note', text: 'You do not have access to the Support guides yet. Ask Sebastin to add you in Access Control.' }));
  });
})();
