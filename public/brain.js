/**
 * Brain — Floating Intelligent AI Assistant
 * Fixed: close button, rendering, draggable, smart position
 */
(function() {
  'use strict';


  /* ── Inject Brain CSS so it works even if adit-theme.css is cached ── */
  function injectBrainCSS() {
    if (document.getElementById('brain-injected-css')) return;
    var s = document.createElement('style');
    s.id = 'brain-injected-css';
    s.textContent = [
      '#brain-fab-wrap{position:fixed;bottom:28px;right:28px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;gap:12px;pointer-events:none;}',
      '#brain-fab-wrap>*{pointer-events:auto;}',
      '.brain-fab{width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#F97316,#EA580C);border:none;cursor:pointer;position:relative;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(249,115,22,.45);transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s;outline:none;}',
      '.brain-fab:hover{transform:scale(1.1) translateY(-2px);box-shadow:0 16px 48px rgba(249,115,22,.55);}',
      '.brain-fab.open{background:linear-gradient(135deg,#1E293B,#0F172A);box-shadow:0 8px 32px rgba(15,23,42,.5);}',
      '.brain-fab-icon{position:relative;z-index:2;transition:transform .3s cubic-bezier(.34,1.56,.64,1);}',
      '.brain-fab.open .brain-fab-icon{transform:rotate(15deg) scale(.88);}',
      '.brain-fab-rings{position:absolute;inset:0;border-radius:50%;}',
      '.brain-fab-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(249,115,22,.5);animation:brain-ring-pulse 2.4s ease-out infinite;}',
      '.brain-fab-ring.r2{animation-delay:.8s;}.brain-fab-ring.r3{animation-delay:1.6s;}',
      '.brain-fab.open .brain-fab-ring{animation:none;opacity:0;}',
      '@keyframes brain-ring-pulse{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}',
      '.brain-fab-badge{position:absolute;right:calc(100% + 10px);top:50%;transform:translateY(-50%) translateX(6px) scale(.95);background:#0F172A;color:#fff;font-size:10px;font-weight:700;white-space:nowrap;padding:4px 10px;border-radius:999px;letter-spacing:.04em;opacity:0;transition:all .2s cubic-bezier(.34,1.56,.64,1);pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3);}',
      '.brain-fab-badge::after{content:"";position:absolute;right:-5px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left-color:#0F172A;border-right:0;}',
      '.brain-fab:hover .brain-fab-badge{opacity:1;transform:translateY(-50%) translateX(0) scale(1);}',
      '.brain-bubble{background:#fff;border-radius:16px 16px 4px 16px;padding:12px 36px 12px 14px;position:relative;box-shadow:0 8px 32px rgba(15,23,42,.15);max-width:260px;font-size:12.5px;color:#0F172A;line-height:1.5;border:1px solid #E5E9F0;animation:brain-bubble-in .4s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes brain-bubble-in{from{opacity:0;transform:scale(.8) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '.brain-bubble::before{content:"🧠";position:absolute;top:-8px;left:12px;font-size:14px;}',
      '.brain-bubble-dismiss{position:absolute;top:6px;right:8px;background:none;border:none;cursor:pointer;color:#94A3B8;font-size:14px;padding:2px;}',
      '.brain-panel{width:380px;height:560px;background:rgba(15,23,42,.97);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 32px 80px rgba(0,0,0,.45),0 8px 24px rgba(0,0,0,.3);display:none;flex-direction:column;transform-origin:bottom right;}',
      '.brain-panel.open{display:flex;animation:brain-panel-in .38s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes brain-panel-in{from{opacity:0;transform:scale(.6) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '.brain-ph{padding:14px 16px 10px;background:linear-gradient(135deg,rgba(249,115,22,.15),rgba(249,115,22,.05));border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:12px;flex-shrink:0;cursor:grab;}',
      '.brain-ph-avatar{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(249,115,22,.4);position:relative;}',
      '.brain-ph-avatar-glow{position:absolute;inset:-3px;border-radius:15px;border:1.5px solid rgba(249,115,22,.4);animation:brain-glow-ring 2s ease-in-out infinite;}',
      '@keyframes brain-glow-ring{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:0;transform:scale(1.15)}}',
      '.brain-ph-title{font-size:15px;font-weight:800;color:#fff;line-height:1;}',
      '.brain-ph-status{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;color:rgba(249,115,22,.9);text-transform:uppercase;letter-spacing:.07em;margin-top:3px;}',
      '.brain-ph-dot{width:6px;height:6px;border-radius:50%;background:#F97316;animation:brain-dot-blink 1.4s ease-in-out infinite;}',
      '@keyframes brain-dot-blink{0%,100%{opacity:1}50%{opacity:.3}}',
      '.brain-ph-close{margin-left:auto;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;transition:all .15s;}',
      '.brain-ph-close:hover{background:rgba(255,255,255,.16);color:#fff;}',
      '.brain-chips{display:flex;gap:6px;padding:10px 12px 8px;flex-wrap:wrap;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.05);}',
      '.brain-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:10.5px;font-weight:600;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.7);cursor:pointer;font-family:"Poppins",sans-serif;transition:all .16s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;}',
      '.brain-chip:hover{background:rgba(249,115,22,.2);border-color:rgba(249,115,22,.5);color:#fff;transform:translateY(-1px);}',
      '.brain-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}',
      '.brain-msgs::-webkit-scrollbar{width:4px;}.brain-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:99px;}',
      '.brain-msg{display:flex;gap:8px;animation:brain-msg-slide .24s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes brain-msg-slide{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '.brain-msg-u{flex-direction:row-reverse;}',
      '.brain-msg-av{width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;}',
      '.brain-msg-av-ai{background:linear-gradient(135deg,#F97316,#EA580C);color:#fff;}',
      '.brain-msg-av-u{background:rgba(255,255,255,.12);color:rgba(255,255,255,.7);}',
      '.brain-msg-bub{max-width:78%;padding:9px 13px;border-radius:14px;font-size:12.5px;line-height:1.6;font-family:"Poppins",sans-serif;}',
      '.brain-msg-bub-ai{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.9);border-radius:4px 14px 14px 14px;}',
      '.brain-msg-bub-u{background:linear-gradient(135deg,rgba(249,115,22,.9),rgba(234,88,12,.9));color:#fff;border-radius:14px 4px 14px 14px;}',
      '.brain-msg-time{font-size:9px;color:rgba(255,255,255,.25);margin-top:3px;text-align:right;}',
      '.brain-typing{display:flex;gap:4px;align-items:center;padding:8px 12px;}',
      '.brain-typing span{width:6px;height:6px;border-radius:50%;background:rgba(249,115,22,.6);animation:brain-type .9s ease-in-out infinite;}',
      '.brain-typing span:nth-child(2){animation-delay:.2s;}.brain-typing span:nth-child(3){animation-delay:.4s;}',
      '@keyframes brain-type{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1;background:#F97316}}',
      '.brain-input-row{display:flex;gap:8px;padding:10px 12px;background:rgba(0,0,0,.2);border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;align-items:flex-end;}',
      '.brain-input-txt{flex:1;padding:9px 13px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:12.5px;font-family:"Poppins",sans-serif;outline:none;resize:none;max-height:100px;min-height:36px;transition:border-color .15s,box-shadow .15s;line-height:1.5;}',
      '.brain-input-txt:focus{border-color:rgba(249,115,22,.6);box-shadow:0 0 0 3px rgba(249,115,22,.12);background:rgba(255,255,255,.09);}',
      '.brain-input-txt::placeholder{color:rgba(255,255,255,.25);}',
      '.brain-send-btn{width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#F97316,#EA580C);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(249,115,22,.4);transition:all .2s cubic-bezier(.34,1.56,.64,1);}',
      '.brain-send-btn:hover{transform:scale(1.1);}.brain-send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}',
    ].join('');
    document.head.appendChild(s);
  }

  var msgs = [];
  var busy = false;
  var isOpen = false;
  var bubbleTimer = null;
  var lastPage = '';
  var sessionGreeted = false;
  var dragState = null;
  var panelPos = { right: 28, bottom: 88 }; // default above FAB

  /* ── Context ─────────────────────────────────────────────── */
  function ctx() {
    var user = (typeof currentUser !== 'undefined' ? currentUser : '');
    var role = (typeof currentRole !== 'undefined' ? currentRole : '');
    var view = (typeof currentViewMode !== 'undefined' ? currentViewMode : '');
    var section = (typeof currentAgentSection !== 'undefined' ? currentAgentSection : '');
    var adminTab = '';
    var activeAdmin = document.querySelector('.nav-tab.active');
    if (activeAdmin) adminTab = activeAdmin.getAttribute('data-tab') || '';
    var page = view === 'admin' ? ('admin/' + adminTab) : ('agent/' + section);
    return { user: user, role: role, view: view, page: page };
  }
  function firstName() {
    var u = (typeof currentUser !== 'undefined' ? currentUser : '');
    return u ? u.split(' ')[0] : 'there';
  }
  function hour() { return new Date().getHours(); }
  function greeting() {
    var h = hour();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function ts() {
    return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(new Date());
  }

  /* ── Page tips ──────────────────────────────────────────── */
  var PAGE_TIPS = {
    'admin/live':    'Live Dashboard open. I can explain any metric or help you spot anomalies.',
    'admin/tickets': 'Viewing tickets. Ask me about ticket types, filters, or export options.',
    'admin/roster':  'Roster is open. Left-click cycles status, right-click opens the full palette.',
    'admin/breaks':  'Break tracker live. Ask me about break policies or missing data.',
    'admin/reports': 'Reports page. Ask me to explain any chart or metric.',
    'agent/tickets': 'Logging tickets? I can guide you through weekend mode or Zoho lookup issues.',
    'agent/breakbot':'Break Bot active. Tap your break type to start. Supervisor sees it live.',
    'agent/dashboard':'Your agent dashboard. Ask me anything — tickets, stats, or tool help.',
    'agent/writer':  'AI Writer open. Try Formal, Shorter, or Empathetic transforms on your drafts.',
  };

  /* ── Bubble ─────────────────────────────────────────────── */
  function showBubble(text, delay) {
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function() {
      if (isOpen) return;
      var el = document.getElementById('brain-bubble');
      var txt = document.getElementById('brain-bubble-text');
      if (!el || !txt) return;
      txt.textContent = text;
      el.style.display = 'block';
      el.style.opacity = '1';
      el.style.transition = '';
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function() {
        el.style.transition = 'opacity .5s ease';
        el.style.opacity = '0';
        setTimeout(function(){ el.style.display='none'; el.style.opacity=''; el.style.transition=''; }, 500);
      }, 7000);
    }, delay || 0);
  }

  /* ── Render ─────────────────────────────────────────────── */
  var CHIPS = [
    { e:'🐛', l:'Report bug',   m:'I found a bug in the tool. Here is what is happening:' },
    { e:'📅', l:'Roster help',  m:'How do I mark attendance in the Roster page?' },
    { e:'🎫', l:'Log ticket',   m:'How do I log a ticket correctly?' },
    { e:'🔍', l:'Zoho issue',   m:'My Zoho ticket is not being found. What should I do?' },
    { e:'⏰', l:'Break Bot',    m:'How does the Break Bot work for agents?' },
    { e:'📖', l:'Full guide',   m:'Give me a full overview of this tool and all its features.' },
  ];

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function mdToHtml(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\n- /g,'<br>&#8226; ')
      .replace(/^- /,'&#8226; ')
      .replace(/\n\n/g,'<br><br>')
      .replace(/\n/g,'<br>');
  }

  function buildMsgHTML(m) {
    var isAI = m.role === 'assistant';
    var brainSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>';
    return '<div class="brain-msg' + (isAI ? '' : ' brain-msg-u') + '">' +
      '<div class="brain-msg-av ' + (isAI ? 'brain-msg-av-ai' : 'brain-msg-av-u') + '">' + (isAI ? brainSVG : '') + '</div>' +
      '<div><div class="brain-msg-bub ' + (isAI ? 'brain-msg-bub-ai' : 'brain-msg-bub-u') + '">' +
        (isAI ? mdToHtml(m.content) : esc(m.content)) +
      '</div><div class="brain-msg-time">' + esc(m.time || '') + '</div></div>' +
    '</div>';
  }

  function buildWelcome() {
    var n = firstName(), g = greeting();
    return '<div style="display:flex;flex-direction:column;align-items:center;padding:20px 16px 8px;text-align:center;">' +
      '<div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(249,115,22,.4);margin-bottom:10px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:26px;height:26px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
      '</div>' +
      '<div style="font-size:15px;font-weight:800;color:#fff;margin-bottom:4px;">' + g + ', ' + esc(n) + '!</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,.45);line-height:1.6;max-width:270px;">I watch your session and help with bugs, guidance, and anything about this tool. Try a quick chip below or just ask.</div>' +
    '</div>';
  }

  function render() {
    var root = document.getElementById('brain-panel');
    if (!root) { console.warn('[Brain] brain-panel not found'); return; }
    root.style.display = 'flex';
    root.style.flexDirection = 'column';

    var chipsHTML = CHIPS.map(function(c) {
      return '<button class="brain-chip" onclick="Brain.quick(' + JSON.stringify(c.m) + ')">' + c.e + ' ' + c.l + '</button>';
    }).join('');

    var msgsHTML = msgs.length === 0 ? buildWelcome() : msgs.map(buildMsgHTML).join('');

    root.innerHTML =
      // HEADER — draggable
      '<div class="brain-ph" id="brain-drag-handle" style="cursor:grab;">' +
        '<div class="brain-ph-avatar"><div class="brain-ph-avatar-glow"></div>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:18px;height:18px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
        '</div>' +
        '<div><div class="brain-ph-title">Brain</div>' +
          '<div class="brain-ph-status"><span class="brain-ph-dot"></span>Brain is Braining</div></div>' +
        '<button class="brain-ph-close" onclick="Brain.close()" style="pointer-events:all;z-index:10;cursor:pointer;" title="Minimize">&#8722;</button>' +
      '</div>' +
      // CHIPS
      '<div class="brain-chips">' + chipsHTML + '</div>' +
      // MESSAGES
      '<div class="brain-msgs" id="brain-msgs">' + msgsHTML + '</div>' +
      // INPUT
      '<div class="brain-input-row">' +
        '<textarea class="brain-input-txt" id="brain-input" rows="1" placeholder="Ask anything…" ' +
          'onkeydown="Brain.key(event)" oninput="Brain.resize(this)"></textarea>' +
        '<button class="brain-send-btn" id="brain-send" onclick="Brain.send()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" style="width:14px;height:14px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>';

    scrollBottom();
    // Attach drag
    attachDrag();
  }

  function scrollBottom() {
    setTimeout(function() {
      var el = document.getElementById('brain-msgs');
      if (el) el.scrollTop = el.scrollHeight;
    }, 60);
  }

  function addTyping() {
    var el = document.getElementById('brain-msgs');
    if (!el) return;
    var div = document.createElement('div');
    div.id = 'brain-typing-el';
    div.className = 'brain-msg';
    div.innerHTML =
      '<div class="brain-msg-av brain-msg-av-ai">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
      '</div>' +
      '<div class="brain-msg-bub brain-msg-bub-ai brain-typing"><span></span><span></span><span></span></div>';
    el.appendChild(div);
    scrollBottom();
  }
  function rmTyping() { var e = document.getElementById('brain-typing-el'); if(e) e.remove(); }

  /* ── Drag support ──────────────────────────────────────── */
  function attachDrag() {
    var handle = document.getElementById('brain-drag-handle');
    var wrap = document.getElementById('brain-fab-wrap');
    if (!handle || !wrap) return;
    handle.onmousedown = function(e) {
      if (e.target.id === 'brain-close-btn') return;
      e.preventDefault();
      var panel = document.getElementById('brain-panel');
      var startX = e.clientX;
      var startY = e.clientY;
      var startRight = parseInt(wrap.style.right) || panelPos.right;
      var startBottom = parseInt(wrap.style.bottom) || panelPos.bottom;
      handle.style.cursor = 'grabbing';
      function onMove(ev) {
        var dx = startX - ev.clientX;
        var dy = startY - ev.clientY;
        var newRight = Math.max(8, Math.min(window.innerWidth - 100, startRight + dx));
        var newBottom = Math.max(8, Math.min(window.innerHeight - 100, startBottom + dy));
        wrap.style.right = newRight + 'px';
        wrap.style.bottom = newBottom + 'px';
        panelPos = { right: newRight, bottom: newBottom };
      }
      function onUp() {
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  /* ── Smart position: avoid covering active area ─────────── */
  function smartPosition() {
    var wrap = document.getElementById('brain-fab-wrap');
    if (!wrap) return;
    // Check if sidebar is on the right — keep panel on the right by default
    // If user hasn't dragged, keep at default position
    wrap.style.right = panelPos.right + 'px';
    wrap.style.bottom = panelPos.bottom + 'px';
  }

  /* ── AI call ─────────────────────────────────────────── */
  async function callAI(userMsg) {
    msgs.push({ role: 'user', content: userMsg, time: ts() });
    busy = true;
    render();
    addTyping();
    var sendBtn = document.getElementById('brain-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      var c = ctx();
      var res = await fetch('/api/brain/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgs.map(function(m){ return {role:m.role,content:m.content}; }),
          context: 'User: ' + c.user + ' | Role: ' + c.role + ' | Page: ' + c.page + ' | Time: ' + hour() + 'h'
        })
      });
      var data = await res.json();
      rmTyping();
      msgs.push({ role:'assistant', content: data.success ? data.reply : 'Having trouble connecting — try again.', time: ts() });
    } catch(e) {
      rmTyping();
      msgs.push({ role:'assistant', content:'Connection issue. Check your internet.', time: ts() });
    }
    busy = false;
    render();
    var s = document.getElementById('brain-send');
    if(s) s.disabled = false;
  }

  /* ── Open/close ─────────────────────────────────────── */
  function openPanel() {
    isOpen = true;
    var panel = document.getElementById('brain-panel');
    var fab   = document.getElementById('brain-fab');
    var bubble = document.getElementById('brain-bubble');
    if (panel) { panel.classList.add('open'); }
    if (fab)   fab.classList.add('open');
    if (bubble) bubble.style.display = 'none';
    smartPosition();
    render();
    setTimeout(function() {
      var inp = document.getElementById('brain-input');
      if (inp) inp.focus();
      // First-session greeting from Brain
      if (!sessionGreeted) {
        sessionGreeted = true;
        setTimeout(function() {
          var c = ctx();
          var greeting_msg = greeting() + ', ' + firstName() + '. I just opened on the ' + (c.page || 'main') + ' page. What can I help you with?';
          msgs.push({ role: 'assistant', content: greeting_msg, time: ts() });
          render();
        }, 400);
      }
    }, 120);
  }

  function closePanel() {
    isOpen = false;
    var panel = document.getElementById('brain-panel');
    var fab   = document.getElementById('brain-fab');
    if (panel) panel.classList.remove('open');
    if (fab)   fab.classList.remove('open');
  }

  /* ── Page watcher ──────────────────────────────────── */
  function watchPage() {
    setInterval(function() {
      var c = ctx();
      if (c.page && c.page !== lastPage) {
        lastPage = c.page;
        var tip = PAGE_TIPS[c.page];
        if (tip && !isOpen) showBubble(tip, 1500);
        // If panel open, add context message
        if (isOpen && msgs.length > 0) {
          msgs.push({ role:'assistant', content:'You switched to **' + c.page + '**. ' + (tip || 'Let me know if you need help here.'), time: ts() });
          render();
        }
      }
    }, 1000);
  }

  /* ── Public API ─────────────────────────────────────── */
  window.Brain = {
    toggle: function() { isOpen ? closePanel() : openPanel(); },
    open:   openPanel,
    close:  closePanel,
    send: function() {
      if (busy) return;
      var inp = document.getElementById('brain-input');
      var msg = inp ? inp.value.trim() : '';
      if (!msg) return;
      inp.value = ''; inp.style.height = '';
      callAI(msg);
    },
    quick: function(msg) { if (!busy) { if (!isOpen) openPanel(); setTimeout(function(){ callAI(msg); }, 300); } },
    key:   function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Brain.send(); } },
    resize: function(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px'; },
    dismissBubble: function() {
      var el = document.getElementById('brain-bubble');
      if (el) el.style.display = 'none';
    }
  };

  /* ── Init ───────────────────────────────────────────── */
  function init() {
    injectBrainCSS();
    // Ensure panel is hidden initially
    var panel = document.getElementById('brain-panel');
    if (panel) { panel.classList.remove('open'); }

    setTimeout(function() {
      var name = firstName();
      if (name) showBubble(greeting() + ', ' + name + '! I\'m Brain — tap me anytime for help', 0);
    }, 2500);

    watchPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 800);
  }

})();
