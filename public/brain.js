/**
 * Brain v6 (Batch 184): redesigned to match Adit Expert. A slim edge tab (avatar and the word "Brain") docks on the
 * right edge below the Expert tab; the panel opens as a side sheet like the Expert panel, with the same navy header,
 * suggestion cards, clean message cards and composer, in light and dark. Behaviour is unchanged: grounded answers
 * from POST /api/brain/chat, page context, and the announcement drafts admins approve before anything is sent.
 */
(function () {
  'use strict';

  var BRAIN_VERSION = '6.0';
  var msgs = [];
  var busy = false;
  var isOpen = false;
  var AVATAR = '/brain-avatar.png?v=2';

  /* ── Styles ─────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('brain-injected-css')) return;
    var s = document.createElement('style');
    s.id = 'brain-injected-css';
    s.textContent = [
      '#brain-fab-wrap{--b-bg:#F4F6F9;--b-sf:#fff;--b-sf2:#F8FAFC;--b-sf3:#EEF2F6;--b-bd:#E2E8F0;--b-bd2:#CBD5E1;--b-t1:#0B2A3F;--b-t2:#3A5068;--b-t3:#5E7386;--b-ac:#F4891F;--b-ac-ink:#A6520A;--b-ac-soft:rgba(244,137,31,.12);--b-ok:#0E7C52;--b-bad:#B4323A;}',
      'html[data-theme="dark"] #brain-fab-wrap,body.dark-mode #brain-fab-wrap{--b-bg:#061520;--b-sf:#0B1F2E;--b-sf2:#0E2536;--b-sf3:#15324A;--b-bd:#1D3A52;--b-bd2:#2A4D69;--b-t1:#E8F1F7;--b-t2:#B0C4D4;--b-t3:#8AA2B5;--b-ac:#F59A3C;--b-ac-ink:#F7A452;--b-ac-soft:rgba(245,154,60,.14);--b-ok:#42CF97;--b-bad:#F27F86;}',
      '#brain-fab-wrap{position:static!important;}',
      '#brain-bubble{display:none!important;}',
      /* Launcher: the same slim edge tab as Expert, below it */
      '#brain-fab{position:fixed!important;right:0!important;bottom:44px!important;z-index:2147483646!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:8px!important;width:40px!important;height:auto!important;padding:8px 0 12px!important;margin:0!important;border:0!important;border-radius:14px 0 0 14px!important;background:#0B2A5B!important;color:#fff!important;box-shadow:-4px 6px 18px rgba(7,43,64,.22)!important;cursor:pointer;transform:none!important;opacity:1!important;transition:width .2s ease,background .2s ease!important;}',
      '#brain-fab:hover,#brain-fab:focus-visible{width:46px!important;background:#0E3570!important;}',
      '#brain-fab:focus-visible{outline:2px solid #F4891F;outline-offset:2px}',
      '#brain-fab .bf-av{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;box-shadow:0 0 0 2px rgba(255,255,255,.25)}',
      '#brain-fab .bf-lb{writing-mode:vertical-rl;transform:rotate(180deg);font:600 12px/1 Poppins,system-ui,sans-serif;letter-spacing:.06em;color:#fff;white-space:nowrap}',
      'html.brain-open #brain-fab,html.brain-open .axw-btn{display:none!important}',
      /* Panel: a side sheet like the Expert panel */
      '#brain-panel{position:fixed!important;top:12px;right:12px;bottom:46px;z-index:2147483647;width:min(440px,calc(100vw - 24px));margin:0!important;max-height:none!important;display:flex!important;flex-direction:column;border-radius:18px;overflow:hidden;background:var(--b-bg);border:1px solid var(--b-bd);box-shadow:0 24px 70px rgba(7,43,64,.28);font-family:Poppins,system-ui,sans-serif;color:var(--b-t1);transform:translateX(calc(100% + 24px));visibility:hidden;transition:transform .28s cubic-bezier(.2,.8,.2,1),visibility 0s linear .28s}',
      '#brain-panel.bopen{transform:none;visibility:visible;transition:transform .28s cubic-bezier(.2,.8,.2,1)}',
      '.bp-hd{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 10px 0 14px;background:#0B2A3F;color:#fff;flex:none}',
      '.bp-hd img{width:32px;height:32px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px rgba(255,255,255,.2)}',
      '.bp-hd b{display:block;font-size:15px;font-weight:600;line-height:1.1}',
      '.bp-hd small{display:flex;align-items:center;gap:6px;font-size:11px;color:#B8CCDA;margin-top:2px}',
      '.bp-hd small i{width:7px;height:7px;border-radius:50%;background:#42CF97;box-shadow:0 0 0 3px rgba(66,207,151,.18)}',
      '.bp-sp{flex:1}',
      '.bp-hbtn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff;font:500 12.5px Poppins,system-ui,sans-serif;cursor:pointer}',
      '.bp-hbtn:hover{background:rgba(255,255,255,.1)}',
      '.bp-body{flex:1;overflow-y:auto;padding:16px 14px 8px;display:flex;flex-direction:column;gap:12px}',
      '.bp-body::-webkit-scrollbar{width:6px}.bp-body::-webkit-scrollbar-thumb{background:var(--b-bd2);border-radius:99px}',
      '.bp-hello{padding:6px 2px 4px}',
      '.bp-hello h2{margin:0 0 4px;font-size:19px;font-weight:600;line-height:1.25;color:var(--b-t1)}',
      '.bp-hello p{margin:0;font-size:13px;line-height:1.55;color:var(--b-t2)}',
      '.bp-sugg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}',
      '.bp-card{display:flex;flex-direction:column;gap:4px;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid var(--b-bd);background:var(--b-sf);cursor:pointer;font:400 12.5px/1.4 Poppins,system-ui,sans-serif;color:var(--b-t1);transition:border-color .15s,transform .15s}',
      '.bp-card:hover{border-color:var(--b-ac);transform:translateY(-1px)}',
      '.bp-card em{font-style:normal;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--b-t3)}',
      '.bp-me{align-self:flex-end;max-width:86%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:var(--b-t1);color:var(--b-bg);font-size:13px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;animation:bpin .22s ease-out both}',
      '.bp-ai{display:flex;gap:8px;align-items:flex-start;animation:bpin .22s ease-out both}',
      '.bp-ai>img{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none;margin-top:2px}',
      '.bp-ai-c{min-width:0;flex:1;padding:12px 14px;border-radius:4px 16px 16px 16px;border:1px solid var(--b-bd);background:var(--b-sf);font-size:13px;line-height:1.6;color:var(--b-t1);word-wrap:break-word}',
      '.bp-ai-c strong{font-weight:600;color:var(--b-t1)}',
      '.bp-ai-c .bp-li{display:flex;gap:6px;margin:3px 0}.bp-ai-c .bp-li::before{content:"";flex:none;width:5px;height:5px;border-radius:50%;background:var(--b-ac);margin-top:8px}',
      '.bp-time{display:block;font-size:10.5px;color:var(--b-t3);margin-top:6px}',
      '.bp-dots{display:inline-flex;gap:4px;align-items:center}.bp-dots i{width:7px;height:7px;border-radius:50%;background:var(--b-ac);animation:bpdot 1s infinite ease-in-out}.bp-dots i:nth-child(2){animation-delay:.15s}.bp-dots i:nth-child(3){animation-delay:.3s}',
      '@keyframes bpdot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
      '@keyframes bpin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '.bp-chips{display:flex;gap:6px;overflow-x:auto;padding:8px 14px 0;flex:none;scrollbar-width:none}.bp-chips::-webkit-scrollbar{display:none}',
      '.bp-chip{flex:none;border:1px solid var(--b-bd2);background:var(--b-sf);border-radius:999px;padding:5px 12px;font:500 12px Poppins,system-ui,sans-serif;color:var(--b-t2);cursor:pointer;white-space:nowrap}',
      '.bp-chip:hover{border-color:var(--b-ac);color:var(--b-t1)}',
      '.bp-comp{flex:none;margin:8px 12px 12px;border:1px solid var(--b-bd2);border-radius:16px;background:var(--b-sf);box-shadow:0 1px 2px rgba(7,43,64,.05)}',
      '.bp-comp:focus-within{border-color:var(--b-ac)}',
      '#brain-input-el{display:block;width:100%;box-sizing:border-box;min-height:46px;max-height:120px;resize:none;border:0;outline:0;background:transparent;padding:12px 14px 4px;font:400 13.5px/1.5 Poppins,system-ui,sans-serif;color:var(--b-t1)}',
      '.bp-bar{display:flex;align-items:center;gap:8px;padding:4px 8px 8px 14px}',
      '.bp-bar span{flex:1;font-size:11px;color:var(--b-t3)}',
      '#brain-send-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:0;border-radius:10px;background:var(--b-ac);color:#1F1305;font:600 13px Poppins,system-ui,sans-serif;cursor:pointer}',
      '#brain-send-btn:hover{filter:brightness(1.05)}#brain-send-btn:disabled{opacity:.5;cursor:default}',
      '#brain-send-btn svg{width:15px;height:15px}',
      /* Announcement draft card */
      '.bp-prop{margin-top:8px;padding:12px;border-radius:12px;border:1px solid var(--b-ac);background:var(--b-sf2)}',
      '.bp-prop.sent{border-color:var(--b-ok)}.bp-prop.gone{border-color:var(--b-bd);opacity:.7}',
      '.bp-prop em{display:block;font-style:normal;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--b-ac-ink)}',
      '.bp-prop b{display:block;margin-top:4px;font-size:13px}.bp-prop small{display:block;font-size:11.5px;color:var(--b-t3);margin:2px 0 8px}',
      '.bp-prop textarea{width:100%;box-sizing:border-box;border:1px solid var(--b-bd2);border-radius:10px;padding:8px 10px;font:400 12.5px/1.5 Poppins,system-ui,sans-serif;color:var(--b-t1);background:var(--b-sf);resize:vertical}',
      '.bp-prop .bp-warn{font-size:12px;color:var(--b-bad);margin:0 0 8px}',
      '.bp-prop .bp-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}',
      '.bp-btn{height:32px;padding:0 14px;border-radius:9px;border:1px solid var(--b-bd2);background:var(--b-sf);color:var(--b-t1);font:500 12.5px Poppins,system-ui,sans-serif;cursor:pointer}',
      '.bp-btn.pri{background:var(--b-ac);border-color:var(--b-ac);color:#1F1305;font-weight:600}.bp-btn:disabled{opacity:.5;cursor:default}',
      '.bp-ok{font-size:12.5px;color:var(--b-ok);font-weight:500}',
      '@media (max-width:600px){#brain-panel{top:0;right:0;bottom:0;width:100vw;border-radius:0}.bp-sugg{grid-template-columns:1fr}}',
      '@media (prefers-reduced-motion:reduce){#brain-panel,#brain-fab,.bp-me,.bp-ai,.bp-card{transition:none!important;animation:none!important}}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function fn() { var u = (typeof currentUser !== 'undefined' ? currentUser : ''); return u ? u.split(' ')[0] : ''; }
  function greet() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function ts() { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date()); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // Replies come from an LLM and are shown with innerHTML, so they are escaped first and only then formatted.
  function md(t) {
    var lines = esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n'), out = '', prevLi = false;
    lines.forEach(function (l, i) {
      if (/^[-*] /.test(l)) { out += '<span class="bp-li"><span>' + l.slice(2) + '</span></span>'; prevLi = true; }
      else { if (i > 0 && !prevLi) out += '<br>'; out += l; prevLi = false; }
    });
    return out;
  }
  function ctx() {
    var view = (typeof currentViewMode !== 'undefined' ? currentViewMode : '');
    var section = (typeof currentAgentSection !== 'undefined' ? currentAgentSection : '');
    var tab = ''; var at = document.querySelector('.nav-tab.active'); if (at) tab = at.getAttribute('data-tab') || '';
    return { page: view === 'admin' ? 'admin/' + tab : 'agent/' + section };
  }
  function isAdmin() { return typeof currentRole !== 'undefined' && currentRole === 'admin'; }
  function suggestions() {
    var s = [
      ['My numbers', 'How am I doing today?'],
      ['Breaks', 'How does the Break Bot work?'],
      ['Tickets', 'Walk me through logging a ticket step by step.'],
      ['Assessments', isAdmin() ? 'Who has not taken their assessment yet?' : 'Which assessments do I still have to take?'],
    ];
    if (isAdmin()) s.splice(0, 1, ['Team', 'Who needs attention on the team right now?'], ['Announce', 'Help me announce something to the team']);
    return s.slice(0, 4);
  }
  var CHIPS = [['Report a bug', 'I found a bug. Here is what is happening:'], ['Roster help', 'Walk me through the Roster attendance features.'], ['Zoho issue', 'My Zoho ticket number is not loading, what should I do?'], ['Full guide', 'Give me a full overview of this tool and all its features.']];

  /* ── Rendering ───────────────────────────────────────────── */
  function propHTML(p) {
    var st = p.state || '';
    var head = '<em>Announcement draft</em><b>' + esc(p.title || 'Announcement') + '</b><small>Posts to the ' + esc(p.target || 'Google Chat space') + (p.audience ? ' · For: ' + esc(p.audience) : '') + '</small>';
    if (st === 'sent') return '<div class="bp-prop sent">' + head + '<div class="bp-ok">Sent to Google Chat.</div></div>';
    if (st === 'discarded') return '<div class="bp-prop gone">' + head + '<div style="font-size:12.5px;color:var(--b-t3)">Discarded. Nothing was sent.</div></div>';
    var id = esc(p.id), sending = st === 'sending';
    return '<div class="bp-prop">' + head +
      (p.blocker ? '<p class="bp-warn">' + esc(p.blocker) + '</p>' : '') +
      '<textarea id="brain-prop-' + id + '" rows="6" aria-label="Announcement text, you can edit it"' + (sending ? ' disabled' : '') + '>' + esc(p.text || '') + '</textarea>' +
      (st === 'error' ? '<p class="bp-warn" style="margin:6px 0 0">' + esc(p.error || 'Could not send.') + '</p>' : '') +
      '<div class="bp-acts"><button type="button" class="bp-btn" onclick="Brain.discardProposal(\'' + id + '\')"' + (sending ? ' disabled' : '') + '>Discard</button>' +
      '<button type="button" class="bp-btn pri" onclick="Brain.sendProposal(\'' + id + '\')"' + (sending || p.blocker ? ' disabled' : '') + '>' + (sending ? 'Sending...' : 'Send to Google Chat') + '</button></div></div>';
  }
  function msgHTML(m) {
    if (m.role === 'assistant') return '<div class="bp-ai"><img src="' + AVATAR + '" alt=""><div class="bp-ai-c">' + md(m.content) + (m.proposal ? propHTML(m.proposal) : '') + '<span class="bp-time">' + esc(m.time || '') + '</span></div></div>';
    return '<div class="bp-me">' + esc(m.content) + '</div>';
  }
  function helloHTML() {
    var n = fn();
    return '<div class="bp-hello"><h2>' + greet() + (n ? ', ' + esc(n) : '') + '</h2><p>I know your live numbers and how this tool works. Ask about your stats, breaks, tickets, assessments or anything on this page. For Adit product and process questions, use Adit Expert.</p>' +
      '<div class="bp-sugg">' + suggestions().map(function (s) { return '<button type="button" class="bp-card" data-q="' + esc(s[1]) + '"><em>' + esc(s[0]) + '</em><span>' + esc(s[1]) + '</span></button>'; }).join('') + '</div></div>';
  }
  function render() {
    var panel = document.getElementById('brain-panel');
    if (!panel) return;
    var keep = document.getElementById('brain-input-el'), draft = keep ? keep.value : '';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Brain');
    panel.innerHTML =
      '<div class="bp-hd"><img src="' + AVATAR + '" alt=""><div><b>Brain</b><small><i></i>Knows your live numbers</small></div><span class="bp-sp"></span>' +
        (msgs.length ? '<button type="button" class="bp-hbtn" data-act="new">New chat</button>' : '') +
        '<button type="button" class="bp-hbtn" data-act="close" aria-label="Close Brain">Close</button></div>' +
      '<div class="bp-body" id="brain-msgs" role="log" aria-live="polite">' + (msgs.length ? msgs.map(msgHTML).join('') : helloHTML()) + '</div>' +
      (msgs.length ? '<div class="bp-chips">' + CHIPS.map(function (c) { return '<button type="button" class="bp-chip" data-q="' + esc(c[1]) + '">' + esc(c[0]) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="bp-comp"><textarea id="brain-input-el" rows="1" placeholder="Ask Brain anything..." aria-label="Message Brain" onkeydown="Brain.key(event)" oninput="Brain.resize(this)"></textarea>' +
        '<div class="bp-bar"><span>Enter to send · Shift+Enter for a new line</span><button type="button" id="brain-send-btn" onclick="Brain.send()"' + (busy ? ' disabled' : '') + '>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>Send</button></div></div>';
    var inp = document.getElementById('brain-input-el'); if (inp && draft) inp.value = draft;
    panel.onclick = function (e) {
      var t = e.target.closest('[data-q],[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      if (a === 'close') return closePanel();
      if (a === 'new') { msgs = []; render(); var i2 = document.getElementById('brain-input-el'); if (i2) i2.focus(); return; }
      var q = t.getAttribute('data-q'); if (q && !busy) callAI(q);
    };
    scroll();
  }
  function scroll() { setTimeout(function () { var e = document.getElementById('brain-msgs'); if (e) e.scrollTop = e.scrollHeight; }, 60); }
  function addTyping() {
    var el = document.getElementById('brain-msgs'); if (!el) return;
    var d = document.createElement('div'); d.id = 'brain-typing-el'; d.className = 'bp-ai';
    d.innerHTML = '<img src="' + AVATAR + '" alt=""><div class="bp-ai-c"><span class="bp-dots" aria-label="Brain is thinking"><i></i><i></i><i></i></span></div>';
    el.appendChild(d); scroll();
  }

  /* ── Announcement drafts ─────────────────────────────────── */
  function findProp(id) { for (var i = 0; i < msgs.length; i++) if (msgs[i].proposal && msgs[i].proposal.id === id) return msgs[i].proposal; return null; }
  async function sendProposal(id) {
    var p = findProp(id); if (!p || p.state === 'sending' || p.state === 'sent') return;
    var ta = document.getElementById('brain-prop-' + id); if (ta) p.text = ta.value;
    p.state = 'sending'; render();
    try {
      var res = await fetch('/api/brain/announce/send', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, text: p.text }) });
      var d = await res.json();
      if (d.success) p.state = 'sent'; else { p.state = 'error'; p.error = d.error || 'Could not send.'; }
    } catch (e) { p.state = 'error'; p.error = 'Connection issue. Nothing was sent, try again.'; }
    render();
  }
  function discardProposal(id) { var p = findProp(id); if (!p) return; var ta = document.getElementById('brain-prop-' + id); if (ta) p.text = ta.value; p.state = 'discarded'; render(); }

  /* ── AI call ─────────────────────────────────────────────── */
  async function callAI(userMsg) {
    msgs.push({ role: 'user', content: userMsg, time: ts() });
    busy = true; render(); addTyping();
    try {
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var tmr = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : null;
      var res = await fetch('/api/brain/chat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, signal: ctl ? ctl.signal : undefined,
        body: JSON.stringify({ messages: msgs.slice(-12).map(function (m) { return { role: m.role, content: String(m.content).slice(0, 2000) }; }), context: ctx().page }),
      });
      if (tmr) clearTimeout(tmr);
      var data = await res.json();
      msgs.push({ role: 'assistant', content: data.success ? data.reply : (data.error || 'Having trouble connecting, please try again.'), time: ts(), proposal: (data.success && data.proposal) ? data.proposal : null });
      if (msgs.length > 60) msgs = msgs.slice(-40);
    } catch (e) {
      msgs.push({ role: 'assistant', content: 'Connection issue, check your internet and try again.', time: ts() });
    }
    busy = false; render();
    var inp = document.getElementById('brain-input-el'); if (inp) inp.focus();
  }

  /* ── Open / close ────────────────────────────────────────── */
  function openPanel() {
    isOpen = true;
    // One side panel at a time: close Adit Expert if it is open.
    var ex = document.querySelector('.axw-panel.open .axw-hd button'); if (ex) ex.click();
    document.documentElement.classList.add('brain-open');
    var p = document.getElementById('brain-panel');
    render();
    if (p) requestAnimationFrame(function () { p.classList.add('bopen'); });
    var f = document.getElementById('brain-fab'); if (f) f.setAttribute('aria-expanded', 'true');
    setTimeout(function () { var inp = document.getElementById('brain-input-el'); if (inp) inp.focus(); }, 200);
  }
  function closePanel() {
    isOpen = false;
    var p = document.getElementById('brain-panel'); if (p) p.classList.remove('bopen');
    document.documentElement.classList.remove('brain-open');
    var f = document.getElementById('brain-fab'); if (f) { f.setAttribute('aria-expanded', 'false'); f.focus(); }
  }

  /* ── Public API (used by onclick handlers in index.html) ─── */
  window.Brain = {
    toggle: function () { isOpen ? closePanel() : openPanel(); },
    close: closePanel,
    send: function () { if (busy) return; var inp = document.getElementById('brain-input-el'); var m = inp ? inp.value.trim() : ''; if (!m) return; inp.value = ''; callAI(m); },
    sendProposal: sendProposal,
    discardProposal: discardProposal,
    quick: function (m) { if (busy) return; if (!isOpen) openPanel(); setTimeout(function () { callAI(m); }, 200); },
    key: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.Brain.send(); } },
    resize: function (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; },
    dismissBubble: function () {},
    version: BRAIN_VERSION,
  };

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    injectCSS();
    var f = document.getElementById('brain-fab');
    if (f) {
      f.removeAttribute('style');
      f.innerHTML = '<img class="bf-av" src="' + AVATAR + '" alt=""><span class="bf-lb">Brain</span>';
      f.setAttribute('aria-label', 'Open Brain, your AI co-pilot for this tool'); f.title = 'Brain: your live numbers and how this tool works';
      f.setAttribute('aria-expanded', 'false');
    }
    var p = document.getElementById('brain-panel'); if (p) { p.classList.remove('bopen'); p.removeAttribute('style'); }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closePanel(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
