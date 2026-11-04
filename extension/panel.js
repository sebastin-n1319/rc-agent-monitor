/* Adit Expert for Zoho Desk (Batch 242). Reads only the ticket id from the address bar of the active tab, asks the
   tool for Expert's review of that ticket (kept until the ticket changes in Desk, so it opens at once next time) and
   shows it in four tabs: Ticket, Customer, Timeline, Similar. Nothing is ever sent or changed from here. */
(function () {
  'use strict';
  var BASE = 'https://rc-t1cs-monitor.up.railway.app';
  var ID_RE = /(?:tickets\/details\/|Cases\/dv\/)(\d{10,})/;
  var main = document.getElementById('main'), tkEl = document.getElementById('tk'), tabsEl = document.getElementById('tabs'), refreshB = document.getElementById('refresh');
  var S = { id: null, number: '', data: null, tab: 'ticket', busy: false, seq: 0 };

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (v == null || v === false) return; if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); });
    (kids || []).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function ticketLinks(text) {
    var frag = document.createDocumentFragment(), re = /(^|[^\d.#\/=-])#?(\d{6})(?!\d|\.\d)/g, at = 0, m; text = String(text || '');
    while ((m = re.exec(text))) { var st = m.index + m[1].length; frag.appendChild(document.createTextNode(text.slice(at, st))); frag.appendChild(h('a', { href: BASE + '/guides/ticket/' + m[2], target: '_blank', rel: 'noopener', text: '#' + m[2] })); at = re.lastIndex; }
    frag.appendChild(document.createTextNode(text.slice(at))); return frag;
  }
  function sec(title, kids) { return h('section', { class: 'sec' }, [h('h3', { text: title })].concat(kids)); }
  function kv(rows) { rows = rows.filter(function (r) { return r[1]; }); return rows.length ? h('dl', { class: 'kv' }, rows.map(function (r) { return h('div', null, [h('dt', { text: r[0] }), h('dd', null, [ticketLinks(r[1])])]); })) : null; }
  function copyBtn(text, label) { return h('button', { type: 'button', class: 'mini', onclick: function (ev) { var b = ev.currentTarget; navigator.clipboard.writeText(text).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label; }, 1500); }); } }, [label]); }
  function msg(text, extra) { clear(main); main.appendChild(h('p', { class: 'msg' }, [text])); if (extra) main.appendChild(extra); }

  function api(path) {
    return fetch(BASE + path, { credentials: 'include', headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().catch(function () { return { success: false, error: 'The tool did not answer' }; }).then(function (j) { if (r.status === 401 || r.status === 403) { var e = new Error('signin'); e.signin = true; throw e; } if (!j.success) throw new Error(j.error || 'Something went wrong'); return j; });
    });
  }
  function signIn() { msg('Sign in to the tool first, then come back to this ticket.', h('p', null, [h('a', { class: 'btn', href: BASE + '/guides', target: '_blank', rel: 'noopener', text: 'Open the tool to sign in' }), ' ', h('button', { type: 'button', class: 'mini', onclick: function () { load(S.id, false); }, text: "I've signed in" })])); }

  function load(id, refresh) {
    if (!id) { S.id = null; tabsEl.hidden = true; refreshB.hidden = true; tkEl.textContent = ''; msg('Open a ticket in Zoho Desk to see Expert\'s review of it.'); return; }
    var mine = ++S.seq; S.id = id; S.busy = true; refreshB.hidden = true; tabsEl.hidden = true;
    msg('Checking the ticket...');
    api('/api/guides/expert/panel?peek=1&id=' + id + (refresh ? '&refresh=1' : '')).then(function (p) {
      if (mine !== S.seq) return;
      S.number = p.number; tkEl.textContent = '#' + p.number;
      if (p.review) return show(p, mine);
      msg('Expert is reviewing #' + p.number + ': reading the ticket and the account, and checking other practices and past cases. This takes about two minutes the first time; after that it opens at once until the ticket changes.');
      return api('/api/guides/expert/panel?id=' + id + (refresh ? '&refresh=1' : '')).then(function (j) { if (mine === S.seq) show(j, mine); });
    }).catch(function (e) { if (mine !== S.seq) return; if (e.signin) signIn(); else msg(e.message); }).then(function () { if (mine === S.seq) S.busy = false; });
  }
  function show(p, mine) {
    if (mine !== S.seq) return;
    S.data = p; tabsEl.hidden = false; refreshB.hidden = false; paint();
  }
  function paint() {
    var p = S.data; if (!p) return; var v = p.review || {}, A = v.answer || {}, T = A.ticket || {}, K = v.ticket || {}, M = K.meta || {};
    Array.prototype.forEach.call(tabsEl.children, function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === S.tab)); });
    clear(main);
    var when = p.at ? new Date(String(p.at).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(p.at) ? '' : 'Z')).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    main.appendChild(h('p', { class: 'muted small', text: (M.subject ? M.subject + ' · ' : '') + (p.cached ? 'Reviewed ' + when + ', ticket unchanged since' : 'Reviewed just now') }));
    if (S.tab === 'ticket') {
      if (T.verdict) main.appendChild(h('p', { class: 'verdict' }, [h('b', { text: T.verdict }), T.confidence ? h('span', { class: 'badge c-' + T.confidence, text: T.confidence + ' confidence' }) : null]));
      if (T.summary) main.appendChild(h('p', { class: 'sum' }, [ticketLinks(T.summary)]));
      var rp = T.repeat && (T.repeat.note || T.repeat.same_issue) ? 'Same issue ' + (T.repeat.same_issue || '0') + ', same area ' + (T.repeat.same_area || '0') + ' in 12 months' + (T.repeat.note ? '. ' + T.repeat.note : '') : '';
      var d = kv([['Reply goes to', T.reply_to], ['Waiting for', T.waiting], ['Happened before?', rp], ['Fix check', T.fix_check], ['Classification', T.classification]]); if (d) main.appendChild(d);
      if (v.unverified && v.unverified.length) main.appendChild(h('p', { class: 'warn', text: 'Not found in what Expert read, treat as unverified: ' + v.unverified.map(function (n) { return '#' + n; }).join(', ') }));
      var acts = (T.actions || []).map(function (a) { return ({ immediate: 'Now: ', investigate: 'Investigate: ', process: 'Process: ', coaching: 'Coaching: ' }[a.kind] || '') + a.text + (a.who ? ' (' + a.who + ')' : ''); });
      if (!acts.length) acts = T.next || [];
      if (acts.length) main.appendChild(sec('What to do', [h('ol', null, acts.map(function (x) { return h('li', null, [ticketLinks(x)]); }))]));
      (T.findings || []).forEach(function (f, i) { main.appendChild(sec('Finding ' + (i + 1) + ': ' + f.title, [kv([['Evidence', f.evidence], ['Likely cause', f.driver], ['Impact', f.impact], ['Do', f.recommendation], ['Confidence', f.confidence]])])); });
      if (A.say) main.appendChild(sec('Reply to send', [h('pre', { class: 'say', text: A.say }), copyBtn(A.say, 'Copy reply')]));
      if (A.note) main.appendChild(sec('Private note', [h('pre', { class: 'say', text: A.note }), copyBtn(A.note, 'Copy note')]));
      if ((T.improve || []).length) main.appendChild(sec('Do better', [h('ul', null, T.improve.map(function (x) { return h('li', null, [ticketLinks(x)]); }))]));
      if ((T.limits || []).length) main.appendChild(sec('What the data could not show', [h('ul', null, T.limits.map(function (x) { return h('li', { text: x }); }))]));
    } else if (S.tab === 'customer') {
      var C = K.crm || {};
      var d2 = kv([['Account', M.account], ['Deal stage', C.stage], ['CSM', C.csm], ['Onboarding', C.ob], ['Escalation', C.escalation], ['Risk', C.risk], ['Health', C.health], ['Mood', C.mood], ['Contract end', C.contractEnd], ['First contact resolution', C.fcr != null && C.fcr !== '' ? C.fcr + '%' : ''], ['CSAT', C.csat != null && C.csat !== '' ? C.csat + '%' : '']]);
      main.appendChild(d2 || h('p', { class: 'muted', text: 'No CRM record was found for this ticket\'s account.' }));
      if (v.investigation && v.investigation.summary) main.appendChild(sec('What Expert looked up', [h('pre', { class: 'say', text: v.investigation.summary })]));
    } else if (S.tab === 'timeline') {
      var pr = K.prior || [];
      main.appendChild(sec('This client\'s tickets (newest first)', pr.length ? [h('ul', { class: 'list' }, pr.map(function (t) { return h('li', null, [ticketLinks('#' + t.number), ' ' + (t.subject || ''), h('span', { class: 'muted', text: ' · ' + (t.status || '') + (t.created ? ' · ' + String(t.created).slice(0, 10) : '') })]); }))] : [h('p', { class: 'muted', text: 'No earlier tickets.' })]));
      var tl = K.timeline || [];
      if (tl.length) main.appendChild(sec('On this ticket', [h('ul', { class: 'list' }, tl.slice(-12).map(function (m) { return h('li', null, [h('b', { text: (m.kind === 'client' ? 'Client' : (m.who || 'Agent')) + ' ' }), h('span', { class: 'muted', text: String(m.at || '').slice(0, 16).replace('T', ' ') + ' ' }), String(m.text || '').slice(0, 220)]); }))]));
    } else {
      var cl = T.cluster || [];
      main.appendChild(sec('Same problem at other practices', cl.length ? [h('ul', { class: 'list' }, cl.map(function (c) { return h('li', null, [ticketLinks('#' + c.number), ' ' + (c.account || ''), h('span', { class: 'muted', text: ' · ' + (c.status || '') }), c.note ? h('div', { class: 'muted', text: c.note }) : null]); }))] : [h('p', { class: 'muted', text: 'None found in the last 10 days.' })]));
      if (v.pattern && v.pattern.summary) main.appendChild(sec('Past cases and how they closed', [h('pre', { class: 'say' }, [ticketLinks(v.pattern.summary)])]));
    }
    main.appendChild(h('p', { class: 'muted small' }, ['Expert can be wrong: check what it cites. ', h('a', { href: BASE + '/guides#ask', target: '_blank', rel: 'noopener', text: 'Ask a follow-up in Expert' })]));
  }

  tabsEl.addEventListener('click', function (ev) { var b = ev.target.closest('[data-tab]'); if (!b) return; S.tab = b.getAttribute('data-tab'); paint(); });
  tabsEl.addEventListener('keydown', function (ev) { if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return; var bs = Array.prototype.slice.call(tabsEl.children), i = bs.findIndex(function (b) { return b.getAttribute('data-tab') === S.tab; }); i = (i + (ev.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length; S.tab = bs[i].getAttribute('data-tab'); paint(); bs[i].focus(); });
  refreshB.addEventListener('click', function () { if (S.id && !S.busy) load(S.id, true); });

  function fromUrl(url) { var m = ID_RE.exec(String(url || '')); return m ? m[1] : null; }
  chrome.runtime.onMessage.addListener(function (m) { if (m && m.type === 'tab') { var id = fromUrl(m.url); if (id !== S.id) { S.tab = 'ticket'; load(id, false); } } });
  chrome.tabs.query({ active: true, currentWindow: true }).then(function (t) { load(fromUrl(t[0] && t[0].url), false); });
})();
