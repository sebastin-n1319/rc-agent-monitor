/**
 * Brain — Floating AI Assistant — ALL INLINE STYLES (zero CSS class dependency)
 */
(function() {
  'use strict';

  var msgs = [];
  var busy = false;
  var isOpen = false;
  var bubbleTimer = null;
  var lastPage = '';
  var sessionGreeted = false;

  /* ── FAB & panel CSS — injected once ───────────────── */
  function injectFabCSS() {
    if (document.getElementById('brain-injected-css')) return;
    var s = document.createElement('style');
    s.id = 'brain-injected-css';
    s.textContent =
      '#brain-fab-wrap{position:fixed!important;bottom:28px!important;right:28px!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:12px!important;pointer-events:none!important;}' +
      '#brain-fab-wrap>*{pointer-events:auto!important;}' +
      '.bfab{width:58px!important;height:58px!important;border-radius:50%!important;background:linear-gradient(135deg,#F97316,#EA580C)!important;border:none!important;cursor:pointer!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;box-shadow:0 8px 32px rgba(249,115,22,.45)!important;outline:none!important;transition:transform .3s,box-shadow .3s!important;}' +
      '.bfab:hover{transform:scale(1.1) translateY(-2px)!important;}' +
      '.bfab-ring{position:absolute!important;inset:0!important;border-radius:50%!important;border:2px solid rgba(249,115,22,.5)!important;animation:bfring 2.4s ease-out infinite!important;}' +
      '.bfab-ring.r2{animation-delay:.8s!important;}.bfab-ring.r3{animation-delay:1.6s!important;}' +
      '@keyframes bfring{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}' +
      '#brain-panel{width:380px!important;height:560px!important;background:rgba(15,23,42,.97)!important;border-radius:24px!important;overflow:hidden!important;border:1px solid rgba(255,255,255,.1)!important;box-shadow:0 32px 80px rgba(0,0,0,.5)!important;display:none!important;flex-direction:column!important;color:#fff!important;}' +
      '#brain-panel.bopen{display:flex!important;animation:bpin .38s cubic-bezier(.34,1.56,.64,1) both!important;}' +
      '@keyframes bpin{from{opacity:0;transform:scale(.6) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}' +
      '.bbbl{background:#fff!important;border-radius:16px 16px 4px 16px!important;padding:12px 36px 12px 14px!important;position:relative!important;box-shadow:0 8px 32px rgba(15,23,42,.15)!important;max-width:260px!important;font-size:12.5px!important;color:#0F172A!important;line-height:1.5!important;border:1px solid #E5E9F0!important;animation:bbin .4s cubic-bezier(.34,1.56,.64,1) both!important;}' +
      '@keyframes bbin{from{opacity:0;transform:scale(.8) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}' +
      '@keyframes bdot{0%,100%{opacity:1}50%{opacity:.3}}' +
      '@keyframes btype{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1}}' +
      '@keyframes bmsgin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}' +
      '.bmsg{animation:bmsgin .22s ease both!important;}';
    document.head.appendChild(s);
  }

  /* ── Context helpers ────────────────────────────────── */
  function firstName() {
    var u = (typeof currentUser !== 'undefined' ? currentUser : '');
    return u ? u.split(' ')[0] : 'there';
  }
  function hour() { return new Date().getHours(); }
  function greeting() { var h=hour(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }
  function ts() { return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(new Date()); }
  function ctx() {
    var user=(typeof currentUser!=='undefined'?currentUser:'');
    var role=(typeof currentRole!=='undefined'?currentRole:'');
    var view=(typeof currentViewMode!=='undefined'?currentViewMode:'');
    var section=(typeof currentAgentSection!=='undefined'?currentAgentSection:'');
    var tab=''; var at=document.querySelector('.nav-tab.active'); if(at) tab=at.getAttribute('data-tab')||'';
    return {user:user,role:role,page:(view==='admin'?'admin/'+tab:'agent/'+section)};
  }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function md(t){return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n- /g,'<br>• ').replace(/\n/g,'<br>');}

  /* ── Inline style constants ─────────────────────────── */
  var S = {
    panel:    'display:flex;flex-direction:column;height:100%;color:#fff;font-family:Poppins,system-ui,sans-serif;',
    hdr:      'display:flex;align-items:center;gap:12px;padding:14px 16px 10px;background:linear-gradient(135deg,rgba(249,115,22,.15),rgba(249,115,22,.05));border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;',
    avt:      'width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;flex-shrink:0;',
    title:    'font-size:15px;font-weight:800;color:#fff;line-height:1;',
    status:   'display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;color:rgba(249,115,22,.9);text-transform:uppercase;letter-spacing:.07em;margin-top:3px;',
    dot:      'width:6px;height:6px;border-radius:50%;background:#F97316;display:inline-block;animation:bdot 1.4s ease-in-out infinite;',
    closebtn: 'margin-left:auto;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;',
    chips:    'display:flex;gap:6px;padding:10px 12px 8px;flex-wrap:wrap;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.05);',
    chip:     'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:10.5px;font-weight:600;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.8);cursor:pointer;',
    msgs:     'flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;',
    msgRow:   'display:flex;gap:8px;',
    msgRowU:  'display:flex;gap:8px;flex-direction:row-reverse;',
    avAI:     'width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;flex-shrink:0;',
    avU:      'width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.12);flex-shrink:0;',
    bubAI:    'max-width:78%;padding:9px 13px;border-radius:4px 14px 14px 14px;font-size:12.5px;line-height:1.6;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:#fff;',
    bubU:     'max-width:78%;padding:9px 13px;border-radius:14px 4px 14px 14px;font-size:12.5px;line-height:1.6;background:linear-gradient(135deg,rgba(249,115,22,.9),rgba(234,88,12,.9));color:#fff;',
    time:     'font-size:9px;color:rgba(255,255,255,.3);margin-top:3px;',
    inputRow: 'display:flex;gap:8px;padding:10px 12px;background:rgba(0,0,0,.25);border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;align-items:flex-end;',
    input:    'flex:1;padding:9px 13px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:12.5px;font-family:Poppins,sans-serif;outline:none;resize:none;max-height:100px;min-height:36px;line-height:1.5;',
    sendBtn:  'width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#F97316,#EA580C);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;',
  };

  var CHIPS = [
    {e:'🐛',l:'Report bug',  m:'I found a bug. Here is what is happening:'},
    {e:'📅',l:'Roster help', m:'How do I mark attendance in the Roster?'},
    {e:'🎫',l:'Log ticket',  m:'How do I log a ticket correctly?'},
    {e:'🔍',l:'Zoho issue',  m:'My Zoho ticket is not being found.'},
    {e:'⏰',l:'Break Bot',   m:'How does the Break Bot work?'},
    {e:'📖',l:'Full guide',  m:'Give me a full overview of this tool.'},
  ];

  var PAGE_TIPS = {
    'admin/live':    'Live Dashboard — I can explain any metric here.',
    'admin/roster':  'Roster open — left-click cycles status, right-click opens full palette.',
    'agent/tickets': 'Logging tickets? Ask me about weekend mode or Zoho issues.',
    'agent/breakbot':'Break Bot — tap a break type to start. Supervisor sees it live.',
  };

  /* ── Render (all inline styles) ─────────────────────── */
  function buildMsgHTML(m) {
    var isAI = m.role === 'assistant';
    var brainIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>';
    return '<div class="bmsg" style="' + (isAI ? S.msgRow : S.msgRowU) + '">' +
      '<div style="' + (isAI ? S.avAI : S.avU) + '">' + (isAI ? brainIcon : '') + '</div>' +
      '<div><div style="' + (isAI ? S.bubAI : S.bubU) + '">' + (isAI ? md(m.content) : esc(m.content)) + '</div>' +
      '<div style="' + S.time + '">' + (m.time||'') + '</div></div></div>';
  }

  function buildWelcome() {
    var n = firstName(), g = greeting();
    return '<div style="display:flex;flex-direction:column;align-items:center;padding:24px 16px 8px;text-align:center;">' +
      '<div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(249,115,22,.4);margin-bottom:12px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:28px;height:28px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
      '</div>' +
      '<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:5px;">' + g + ', ' + esc(n) + '!</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,.45);line-height:1.7;max-width:280px;">I watch your session and help with bugs, tool guidance, and anything about Adit Monitor.</div>' +
    '</div>';
  }

  function render() {
    var panel = document.getElementById('brain-panel');
    if (!panel) return;

    var brainSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:18px;height:18px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>';

    var chipsHTML = CHIPS.map(function(c) {
      return '<button style="' + S.chip + '" onclick="Brain.quick(' + JSON.stringify(c.m) + ')">' + c.e + ' ' + c.l + '</button>';
    }).join('');

    var msgsContent = msgs.length === 0 ? buildWelcome() : msgs.map(buildMsgHTML).join('');

    panel.style.cssText = S.panel + 'display:flex;flex-direction:column;';
    panel.innerHTML =
      '<div style="' + S.hdr + 'cursor:grab;" id="brain-drag-h">' +
        '<div style="' + S.avt + '">' + brainSVG + '</div>' +
        '<div>' +
          '<div style="' + S.title + '">Brain</div>' +
          '<div style="' + S.status + '"><span style="' + S.dot + '"></span>Brain is Braining</div>' +
        '</div>' +
        '<button style="' + S.closebtn + '" onclick="Brain.close()" title="Close">&#8722;</button>' +
      '</div>' +
      '<div style="' + S.chips + '">' + chipsHTML + '</div>' +
      '<div style="' + S.msgs + '" id="brain-msgs">' + msgsContent + '</div>' +
      '<div style="' + S.inputRow + '">' +
        '<textarea style="' + S.input + '" id="brain-input" placeholder="Ask anything…" onkeydown="Brain.key(event)" oninput="Brain.resize(this)" rows="1"></textarea>' +
        '<button style="' + S.sendBtn + '" onclick="Brain.send()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" style="width:14px;height:14px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>';

    scroll();
    drag();
  }

  function scroll() {
    setTimeout(function(){var e=document.getElementById('brain-msgs');if(e)e.scrollTop=e.scrollHeight;},60);
  }

  function addTyping() {
    var e = document.getElementById('brain-msgs');
    if (!e) return;
    var d = document.createElement('div');
    d.id = 'brain-t';
    d.style.cssText = S.msgRow;
    d.innerHTML = '<div style="' + S.avAI + '"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg></div>' +
      '<div style="' + S.bubAI + 'display:flex;gap:5px;align-items:center;">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:#F97316;display:inline-block;animation:btype .9s ease-in-out infinite;"></span>' +
        '<span style="width:6px;height:6px;border-radius:50%;background:#F97316;display:inline-block;animation:btype .9s .2s ease-in-out infinite;"></span>' +
        '<span style="width:6px;height:6px;border-radius:50%;background:#F97316;display:inline-block;animation:btype .9s .4s ease-in-out infinite;"></span>' +
      '</div>';
    e.appendChild(d);
    scroll();
  }

  function rmTyping() { var e=document.getElementById('brain-t'); if(e) e.remove(); }

  function drag() {
    var h = document.getElementById('brain-drag-h');
    var w = document.getElementById('brain-fab-wrap');
    if (!h || !w) return;
    h.onmousedown = function(e) {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      var sx=e.clientX, sy=e.clientY;
      var sr=parseInt(w.style.right)||28, sb=parseInt(w.style.bottom)||28;
      function mv(ev){
        w.style.right = Math.max(8,Math.min(window.innerWidth-100,sr+(sx-ev.clientX)))+'px';
        w.style.bottom = Math.max(8,Math.min(window.innerHeight-100,sb+(sy-ev.clientY)))+'px';
      }
      function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
      document.addEventListener('mousemove',mv);
      document.addEventListener('mouseup',up);
    };
  }

  /* ── AI call ─────────────────────────────────────────── */
  async function callAI(msg) {
    msgs.push({role:'user',content:msg,time:ts()});
    busy = true; render(); addTyping();
    var btn = document.getElementById('brain-send'); if(btn) btn.disabled=true;
    try {
      var c = ctx();
      var res = await fetch('/api/brain/chat',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          messages:msgs.map(function(m){return{role:m.role,content:m.content};}),
          context:'User:'+c.user+'|Role:'+c.role+'|Page:'+c.page
        })
      });
      var data = await res.json();
      rmTyping();
      msgs.push({role:'assistant',content:data.success?data.reply:'Having trouble — try again.',time:ts()});
    } catch(e) {
      rmTyping();
      msgs.push({role:'assistant',content:'Connection issue. Check internet.',time:ts()});
    }
    busy=false; render();
    var b2=document.getElementById('brain-send'); if(b2) b2.disabled=false;
  }

  /* ── Bubble ──────────────────────────────────────────── */
  function showBubble(text, delay) {
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function(){
      if(isOpen) return;
      var el=document.getElementById('brain-bubble'), txt=document.getElementById('brain-bubble-text');
      if(!el||!txt) return;
      txt.textContent=text; el.style.display='block'; el.style.opacity='1';
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function(){
        el.style.opacity='0';
        setTimeout(function(){el.style.display='none';el.style.opacity='';},500);
      },7000);
    }, delay||0);
  }

  /* ── Open/close ──────────────────────────────────────── */
  function openPanel() {
    isOpen = true;
    var p=document.getElementById('brain-panel'), f=document.getElementById('brain-fab'), b=document.getElementById('brain-bubble');
    if(p){p.classList.add('bopen');}
    if(f) f.style.background='linear-gradient(135deg,#1E293B,#0F172A)';
    if(b) b.style.display='none';
    render();
    setTimeout(function(){
      var inp=document.getElementById('brain-input'); if(inp) inp.focus();
      if(!sessionGreeted){
        sessionGreeted=true;
        msgs.push({role:'assistant',content:greeting()+', '+firstName()+'! I\'m Brain. I\'m ready to help — ask me anything about this tool or describe any issue.',time:ts()});
        render();
      }
    },150);
  }

  function closePanel() {
    isOpen = false;
    var p=document.getElementById('brain-panel'), f=document.getElementById('brain-fab');
    if(p) p.classList.remove('bopen');
    if(f) f.style.background='linear-gradient(135deg,#F97316,#EA580C)';
  }

  /* ── Page watcher ────────────────────────────────────── */
  function watchPage() {
    setInterval(function(){
      var c=ctx();
      if(c.page && c.page!==lastPage){
        lastPage=c.page;
        var tip=PAGE_TIPS[c.page];
        if(tip && !isOpen) showBubble(tip,1200);
      }
    },1200);
  }

  /* ── Public ─────────────────────────────────────────── */
  window.Brain = {
    toggle: function(){ isOpen?closePanel():openPanel(); },
    close:  closePanel,
    send: function(){
      if(busy) return;
      var inp=document.getElementById('brain-input');
      var msg=inp?inp.value.trim():''; if(!msg) return;
      inp.value=''; inp.style.height='';
      callAI(msg);
    },
    quick: function(msg){ if(!busy){if(!isOpen) openPanel(); setTimeout(function(){callAI(msg);},200);} },
    key:   function(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();Brain.send();} },
    resize:function(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px'; },
    dismissBubble: function(){ var e=document.getElementById('brain-bubble'); if(e) e.style.display='none'; }
  };

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectFabCSS();
    var p=document.getElementById('brain-panel'); if(p) p.classList.remove('bopen');
    setTimeout(function(){
      var n=firstName(); if(n) showBubble(greeting()+', '+n+'! I\'m Brain — tap me anytime for help',0);
    },2500);
    watchPage();
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
  else{setTimeout(init,800);}
})();
