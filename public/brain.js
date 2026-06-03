/**
 * Brain v4 — Branded Design System
 * Uses the Brain robot character, brand colors, and design language from the style guide
 */
(function() {
  'use strict';

  var msgs = [];
  var busy = false;
  var isOpen = false;
  var bubbleTimer = null;
  var lastPage = '';
  var sessionGreeted = false;

  /* ── Brand Images — from uploaded design system ────────── */
  var IMG = {
    logo:     '/brain-logo.png',
    avatar:   '/brain-avatar.png',
    thinking: '/brain-thinking.png',
    search:   '/brain-search.png',
    success:  '/brain-success.png',
    error:    '/brain-error.png',
    widget:   '/brain-widget.png',
    learning: '/brain-learning.png',
  };

  var ROBOT_XS = '<img src="' + IMG.avatar + '" width="30" height="30" style="border-radius:50%;object-fit:cover;" alt="Brain"/>';
  var ROBOT_SVG = function(w, h) {
    return '<img src="' + IMG.avatar + '" width="'+(w||40)+'" height="'+(h||40)+'" style="border-radius:50%;object-fit:cover;" alt="Brain"/>';
  };
  var ROBOT_HI = '<img src="' + IMG.thinking + '" width="160" height="140" style="object-fit:contain;filter:drop-shadow(0 8px 24px rgba(249,115,22,.3));" alt="Brain thinking"/>';

  /* ── CSS Injection ─────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('brain-injected-css')) return;
    var s = document.createElement('style');
    s.id = 'brain-injected-css';
    s.textContent = [
      '#brain-fab-wrap{position:fixed!important;bottom:28px!important;right:28px!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:12px!important;pointer-events:none!important;}',
      '#brain-fab-wrap>*{pointer-events:auto!important;}',
      // FAB button
      '#brain-fab{width:64px;height:64px;border-radius:50%;border:none;cursor:pointer;position:relative;display:flex;align-items:center;justify-content:center;outline:none;background:linear-gradient(135deg,#FF8C00,#F97316);box-shadow:0 8px 28px rgba(249,115,22,.5),0 2px 8px rgba(0,0,0,.2);padding:0;transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s;}',
      '#brain-fab:hover{transform:scale(1.1) translateY(-2px);box-shadow:0 14px 40px rgba(249,115,22,.6);}',
      '#brain-fab-pulse{position:absolute;inset:-6px;border-radius:50%;border:2.5px solid rgba(249,115,22,.5);animation:brain-pulse-ring 2s ease-out infinite;}',
      '#brain-fab-pulse2{position:absolute;inset:-12px;border-radius:50%;border:1.5px solid rgba(249,115,22,.25);animation:brain-pulse-ring 2s ease-out .6s infinite;}',
      '@keyframes brain-pulse-ring{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.35)}}',
      // Bubble
      '#brain-bubble{background:#fff;border-radius:18px 18px 4px 18px;padding:12px 38px 12px 14px;box-shadow:0 8px 28px rgba(26,31,60,.15);max-width:260px;font-size:12.5px;color:#1A1F3C;line-height:1.55;border:1.5px solid #F0F2F5;animation:brain-bub-in .4s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes brain-bub-in{from{opacity:0;transform:scale(.8) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      // Panel
      '#brain-panel{width:400px;height:580px;border-radius:24px;overflow:hidden;border:1.5px solid #F0F2F5;box-shadow:0 24px 60px rgba(26,31,60,.18),0 4px 16px rgba(26,31,60,.1);display:none;flex-direction:column;background:#fff;}',
      '#brain-panel.bopen{display:flex;animation:brain-panel-in .4s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes brain-panel-in{from{opacity:0;transform:scale(.6) translateY(28px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      // Chip hover
      '.brain-chip-btn:hover{background:#FFF3E0!important;border-color:#F97316!important;color:#F97316!important;transform:translateY(-1px);}',
      // Message animation
      '.brain-msg-row{animation:brain-msg-in .25s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes brain-msg-in{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
      // Typing dots
      '.brain-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#F97316;animation:brain-dot-bounce .8s ease-in-out infinite;}',
      '.brain-dot:nth-child(2){animation-delay:.16s;}.brain-dot:nth-child(3){animation-delay:.32s;}',
      '@keyframes brain-dot-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-8px);opacity:1}}',
      // Input focus
      '#brain-input-el:focus{border-color:#F97316!important;box-shadow:0 0 0 3px rgba(249,115,22,.15)!important;}',
      // Send btn hover
      '#brain-send-btn:hover{transform:scale(1.08);box-shadow:0 6px 18px rgba(249,115,22,.45)!important;}',
      '#brain-send-btn:disabled{opacity:.45;transform:none!important;}',
      // Scrollbar
      '#brain-msgs::-webkit-scrollbar{width:5px;}#brain-msgs::-webkit-scrollbar-thumb{background:#E8EBF0;border-radius:99px;}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function fn(){var u=(typeof currentUser!=='undefined'?currentUser:'');return u?u.split(' ')[0]:'there';}
  function hr(){return new Date().getHours();}
  function greet(){var h=hr();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
  function ts(){return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(new Date());}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function md(t){
    return t
      .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#F97316;font-weight:700;">$1</strong>')
      .replace(/\n- /g,'<br><span style="color:#F97316;font-weight:700;margin-right:4px;">›</span>')
      .replace(/^- /,'<span style="color:#F97316;font-weight:700;margin-right:4px;">›</span>')
      .replace(/\n\n/g,'<br><br>')
      .replace(/\n/g,'<br>');
  }
  function ctx(){
    var user=(typeof currentUser!=='undefined'?currentUser:'');
    var role=(typeof currentRole!=='undefined'?currentRole:'');
    var view=(typeof currentViewMode!=='undefined'?currentViewMode:'');
    var section=(typeof currentAgentSection!=='undefined'?currentAgentSection:'');
    var tab='';var at=document.querySelector('.nav-tab.active');if(at)tab=at.getAttribute('data-tab')||'';
    return {user:user,role:role,view:view,page:view==='admin'?'admin/'+tab:'agent/'+section};
  }

  var PAGE_TIPS = {
    'admin/live':   'Live Dashboard is open — I can explain any metric or flag what needs attention.',
    'admin/roster': 'Roster open — left-click cycles status, right-click opens the full palette. Need help?',
    'admin/tickets':'Viewing ticket reports — ask me about ticket type patterns or AI Learning feedback.',
    'agent/tickets':'Ready to log? Enter your Zoho ticket number and I\'ll walk you through it.',
    'agent/breakbot':'Break Bot ready — tap a break type to start. Supervisor sees it live.',
    'agent/writer': 'AI Writer is open — paste any draft and ask me to transform it.',
  };

  var CHIPS = [
    {e:'🐛',l:'Report bug',  m:'I found a bug. Here\'s what\'s happening:'},
    {e:'📅',l:'Roster help', m:'Walk me through the Roster attendance features.'},
    {e:'🎫',l:'Log ticket',  m:'Walk me through logging a ticket step by step.'},
    {e:'🔍',l:'Zoho issue',  m:'My Zoho ticket number isn\'t loading — what should I do?'},
    {e:'⏰',l:'Break Bot',   m:'How does the Break Bot work?'},
    {e:'📖',l:'Full guide',  m:'Give me a full overview of this tool and all its features.'},
  ];

  /* ── Build message HTML with contextual state images ─── */
  function msgHTML(m) {
    var isAI = m.role === 'assistant';
    if (isAI) {
      // Detect message context for appropriate illustration
      var content = m.content || '';
      var contextImg = '';
      if (m.showImg === 'success' || /✅|found|success|done|fixed|resolved/i.test(content.slice(0,60))) {
        contextImg = '<img src="'+IMG.success+'" width="80" height="70" style="object-fit:contain;margin:6px 0 4px;display:block;filter:drop-shadow(0 4px 10px rgba(16,185,129,.2));" alt=""/>';
      } else if (m.showImg === 'error' || /❌|error|not found|failed|issue|broken/i.test(content.slice(0,60))) {
        contextImg = '<img src="'+IMG.error+'" width="80" height="70" style="object-fit:contain;margin:6px 0 4px;display:block;filter:drop-shadow(0 4px 10px rgba(239,68,68,.2));" alt=""/>';
      } else if (m.showImg === 'search' || /search|lookup|scan|looking|checking/i.test(content.slice(0,60))) {
        contextImg = '<img src="'+IMG.search+'" width="80" height="70" style="object-fit:contain;margin:6px 0 4px;display:block;" alt=""/>';
      }
      return '<div class="brain-msg-row" style="display:flex;gap:8px;align-items:flex-start;">' +
        '<img src="'+IMG.avatar+'" width="30" height="30" style="border-radius:50%;object-fit:cover;flex-shrink:0;box-shadow:0 2px 8px rgba(249,115,22,.3);" alt="Brain"/>' +
        '<div style="max-width:80%;">' +
          '<div style="background:#F8F9FC;border:1.5px solid #F0F2F5;border-radius:4px 16px 16px 16px;padding:10px 14px;font-size:12.5px;line-height:1.65;color:#1A1F3C;">' +
            md(m.content) +
          '</div>' +
          '<div style="font-size:9.5px;color:#9BA3B2;margin-top:4px;padding-left:4px;">' + esc(m.time||'') + '</div>' +
        '</div>' +
      '</div>';
    } else {
      return '<div class="brain-msg-row" style="display:flex;gap:8px;align-items:flex-start;flex-direction:row-reverse;">' +
        '<div style="width:30px;height:30px;flex-shrink:0;border-radius:50%;background:linear-gradient(135deg,#1A1F3C,#2D3561);display:flex;align-items:center;justify-content:center;">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '</div>' +
        '<div style="max-width:80%;">' +
          '<div style="background:linear-gradient(135deg,#F97316,#FF8C00);border-radius:16px 4px 16px 16px;padding:10px 14px;font-size:12.5px;line-height:1.65;color:#fff;box-shadow:0 4px 14px rgba(249,115,22,.25);">' +
            esc(m.content) +
          '</div>' +
          '<div style="font-size:9.5px;color:#9BA3B2;margin-top:4px;padding-right:4px;text-align:right;">' + esc(m.time||'') + '</div>' +
        '</div>' +
      '</div>';
    }
  }

  /* ── State illustrations ─────────────────────────────── */
  function stateImg(src, alt, w, h, extra) {
    return '<img src="'+src+'" width="'+(w||120)+'" height="'+(h||100)+'" alt="'+(alt||'Brain')+'" style="object-fit:contain;'+(extra||'')+'">';
  }

  function welcomeHTML() {
    var n=fn(), g=greet(), h=hr();
    var emoji = h<12?'🌅':h<17?'☀️':'🌙';
    return '<div style="display:flex;flex-direction:column;align-items:center;padding:16px 20px 8px;text-align:center;">' +
      // Logo
      '<img src="'+IMG.logo+'" style="width:180px;height:auto;object-fit:contain;margin-bottom:12px;" alt="Brain"/>' +
      // Thinking illustration
      '<div style="position:relative;margin-bottom:10px;">' +
        stateImg(IMG.thinking, 'Brain working', 180, 140, 'filter:drop-shadow(0 6px 20px rgba(249,115,22,.25));') +
      '</div>' +
      '<div style="font-size:16px;font-weight:800;color:#1A1F3C;letter-spacing:-.01em;margin-bottom:4px;">' + emoji + ' ' + g + ', ' + esc(n) + '!</div>' +
      '<div style="font-size:11.5px;color:#6B7280;line-height:1.6;max-width:280px;margin-bottom:14px;">I watch your session and help with bugs, features, and anything about Adit Monitor.</div>' +
      // Capability pills using image icons
      '<div style="display:flex;flex-wrap:wrap;gap:7px;justify-content:center;">' +
        '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:#FFF3E0;border:1.5px solid rgba(249,115,22,.25);border-radius:99px;font-size:10px;font-weight:700;color:#F97316;">' +
          '<img src="'+IMG.search+'" width="14" height="14" style="border-radius:3px;object-fit:cover;">Diagnose issues</span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:#ECFDF5;border:1.5px solid rgba(16,185,129,.25);border-radius:99px;font-size:10px;font-weight:700;color:#059669;">' +
          '<img src="'+IMG.success+'" width="14" height="14" style="border-radius:3px;object-fit:cover;">Instant fixes</span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:#EEF2FF;border:1.5px solid rgba(99,102,241,.2);border-radius:99px;font-size:10px;font-weight:700;color:#6366F1;">' +
          '<img src="'+IMG.learning+'" width="14" height="14" style="border-radius:3px;object-fit:cover;">AI Learning</span>' +
      '</div>' +
    '</div>';
  }

  /* ── Main render ─────────────────────────────────────────── */
  function render() {
    var panel = document.getElementById('brain-panel');
    if (!panel) return;

    var chipsHTML = CHIPS.map(function(c){
      return '<button class="brain-chip-btn" style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:999px;font-size:10.5px;font-weight:600;background:#F8F9FC;border:1.5px solid #E8EBF0;color:#4B5563;cursor:pointer;white-space:nowrap;font-family:inherit;transition:all .18s;" onclick="Brain.quick(' + JSON.stringify(c.m) + ')">' + c.e + ' ' + c.l + '</button>';
    }).join('');

    var msgsHTML = msgs.length === 0 ? welcomeHTML() : msgs.map(msgHTML).join('');

    panel.innerHTML =
      // Header - dark navy brand
      '<div style="background:linear-gradient(135deg,#1A1F3C 0%,#2D3561 100%);padding:16px;display:flex;align-items:center;gap:12px;flex-shrink:0;cursor:grab;position:relative;overflow:hidden;" id="brain-drag-h">' +
        // Neural network decoration
        '<div style="position:absolute;right:0;top:0;bottom:0;width:160px;opacity:.15;background:radial-gradient(circle at 80% 50%,rgba(249,115,22,.6) 0%,transparent 70%);pointer-events:none;"></div>' +
        // Robot avatar
        '<img src="'+IMG.avatar+'" width="44" height="44" style="border-radius:50%;object-fit:cover;flex-shrink:0;box-shadow:0 4px 14px rgba(249,115,22,.4);" alt="Brain"/>' +
        '<div style="position:relative;z-index:1;">' +
          '<img src="'+IMG.logo+'" height="28" style="object-fit:contain;filter:brightness(0) invert(1);" alt="Brain"/>' +
          '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;">' +
            '<div style="width:6px;height:6px;border-radius:50%;background:#F97316;box-shadow:0 0 8px #F97316;animation:brain-dot-bounce .8s ease-in-out infinite;"></div>' +
            '<span style="font-size:9px;font-weight:800;color:rgba(249,115,22,.9);text-transform:uppercase;letter-spacing:.1em;">Brain is Braining</span>' +
          '</div>' +
        '</div>' +
        '<button style="margin-left:auto;width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;position:relative;z-index:1;" onclick="Brain.close()">&#8722;</button>' +
      '</div>' +
      // Quick chips
      '<div style="display:flex;gap:6px;padding:10px 14px 8px;flex-wrap:wrap;flex-shrink:0;border-bottom:1.5px solid #F0F2F5;background:#FAFBFC;">' + chipsHTML + '</div>' +
      // Messages
      '<div style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;background:#fff;" id="brain-msgs">' + msgsHTML + '</div>' +
      // Input row
      '<div style="display:flex;gap:8px;padding:12px 14px;flex-shrink:0;align-items:flex-end;background:#FAFBFC;border-top:1.5px solid #F0F2F5;">' +
        '<textarea id="brain-input-el" style="flex:1;padding:10px 14px;border-radius:14px;border:1.5px solid #E8EBF0;background:#fff;color:#1A1F3C;font-size:12.5px;font-family:inherit;outline:none;resize:none;max-height:100px;min-height:40px;line-height:1.5;transition:border-color .2s,box-shadow .2s;" placeholder="Ask anything — features, bugs, how-to…" onkeydown="Brain.key(event)" oninput="Brain.resize(this)" rows="1"></textarea>' +
        '<button id="brain-send-btn" style="width:40px;height:40px;border-radius:12px;flex-shrink:0;border:none;cursor:pointer;background:linear-gradient(135deg,#F97316,#FF8C00);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(249,115,22,.4);transition:transform .2s,box-shadow .2s;" onclick="Brain.send()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="width:15px;height:15px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>';

    scroll();
    drag();
  }

  function scroll(){setTimeout(function(){var e=document.getElementById('brain-msgs');if(e)e.scrollTop=e.scrollHeight;},70);}

  function addTyping(){
    var el=document.getElementById('brain-msgs');
    if(!el) return;
    var d=document.createElement('div');
    d.id='brain-typing-el';
    d.className='brain-msg-row';
    d.style.cssText='display:flex;gap:8px;align-items:flex-start;';
    d.innerHTML=
      '<div style="width:30px;height:30px;flex-shrink:0;border-radius:50%;background:linear-gradient(135deg,#FF8C00,#F97316);display:flex;align-items:center;justify-content:center;">' + ROBOT_XS + '</div>' +
      '<div style="background:#F8F9FC;border:1.5px solid #F0F2F5;border-radius:4px 16px 16px 16px;padding:12px 16px;display:flex;gap:5px;align-items:center;">' +
        '<span class="brain-dot"></span><span class="brain-dot"></span><span class="brain-dot"></span>' +
        '<span style="font-size:11px;color:#9BA3B2;margin-left:4px;">Thinking…</span>' +
      '</div>';
    el.appendChild(d);
    scroll();
  }
  function rmTyping(){var e=document.getElementById('brain-typing-el');if(e)e.remove();}

  function drag(){
    var h=document.getElementById('brain-drag-h'),w=document.getElementById('brain-fab-wrap');
    if(!h||!w) return;
    h.onmousedown=function(e){
      if(e.target.tagName==='BUTTON') return;
      e.preventDefault();
      var sx=e.clientX,sy=e.clientY,sr=parseInt(w.style.right)||28,sb=parseInt(w.style.bottom)||28;
      function mv(ev){
        w.style.right=Math.max(8,Math.min(window.innerWidth-100,sr+(sx-ev.clientX)))+'px';
        w.style.bottom=Math.max(8,Math.min(window.innerHeight-100,sb+(sy-ev.clientY)))+'px';
      }
      function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
      document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
    };
  }

  /* ── AI call ─────────────────────────────────────────────── */
  async function callAI(userMsg) {
    msgs.push({role:'user',content:userMsg,time:ts()});
    busy=true; render(); addTyping();
    var btn=document.getElementById('brain-send-btn'); if(btn) btn.disabled=true;
    try {
      var c=ctx();
      var res=await fetch('/api/brain/chat',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          messages:msgs.map(function(m){return{role:m.role,content:m.content};}),
          context:'User: '+c.user+' | Role: '+c.role+' | Page: '+c.page+' | Hour: '+hr()+'h',
          userStats:{page:c.page,role:c.role,hour:hr()}
        })
      });
      var data=await res.json();
      rmTyping();
      msgs.push({role:'assistant',content:data.success?data.reply:'Having trouble connecting — please try again.',time:ts()});
    } catch(e){
      rmTyping();
      msgs.push({role:'assistant',content:'Connection issue — check your internet and retry.',time:ts()});
    }
    busy=false; render();
    var b2=document.getElementById('brain-send-btn'); if(b2) b2.disabled=false;
  }

  /* ── Proactive bubble ───────────────────────────────────── */
  function showBubble(text,delay){
    clearTimeout(bubbleTimer);
    bubbleTimer=setTimeout(function(){
      if(isOpen) return;
      var el=document.getElementById('brain-bubble'),txt=document.getElementById('brain-bubble-text');
      if(!el||!txt) return;
      txt.textContent=text; el.style.display='block'; el.style.opacity='1';
      clearTimeout(bubbleTimer);
      bubbleTimer=setTimeout(function(){
        el.style.transition='opacity .5s'; el.style.opacity='0';
        setTimeout(function(){el.style.display='none';el.style.opacity='';el.style.transition='';},500);
      },8000);
    },delay||0);
  }

  /* ── Open / close ─────────────────────────────────────────── */
  function openPanel(){
    isOpen=true;
    var p=document.getElementById('brain-panel'),f=document.getElementById('brain-fab'),b=document.getElementById('brain-bubble');
    if(p){
      p.style.display='flex'; // override inline display:none
      p.style.flexDirection='column';
      requestAnimationFrame(function(){ p.classList.add('bopen'); });
    }
    if(f){f.style.transform='scale(.88)';f.style.boxShadow='0 4px 16px rgba(249,115,22,.4)';}
    if(b) b.style.display='none';
    render();
    setTimeout(function(){
      var inp=document.getElementById('brain-input-el'); if(inp) inp.focus();
      if(!sessionGreeted){
        sessionGreeted=true;
        msgs.push({role:'assistant',content:greet()+', **'+fn()+'**! I\'m Brain — your AI co-pilot for Adit Agent Monitor.\n\nI can see you\'re on the **'+ctx().page+'** page. What can I help you with today?',time:ts()});
        render();
      }
    },160);
  }
  function closePanel(){
    isOpen=false;
    var p=document.getElementById('brain-panel'),f=document.getElementById('brain-fab');
    if(p){
      p.classList.remove('bopen');
      setTimeout(function(){ if(!isOpen) p.style.display='none'; }, 420); // after animation
    }
    if(f){f.style.transform='';f.style.boxShadow='';}
  }

  /* ── Page watcher ─────────────────────────────────────────── */
  function watchPage(){
    setInterval(function(){
      var c=ctx();
      if(c.page && c.page!==lastPage){
        var prev=lastPage; lastPage=c.page;
        if(prev){
          var tip=PAGE_TIPS[c.page];
          if(tip && !isOpen) showBubble(tip,1000);
        }
      }
    },1200);
  }

  /* ── Public API ───────────────────────────────────────────── */
  window.Brain={
    toggle:function(){isOpen?closePanel():openPanel();},
    close: closePanel,
    send:function(){
      if(busy) return;
      var inp=document.getElementById('brain-input-el');
      var msg=inp?inp.value.trim():''; if(!msg) return;
      inp.value=''; inp.style.height='';
      callAI(msg);
    },
    quick:function(msg){if(!busy){if(!isOpen)openPanel();setTimeout(function(){callAI(msg);},200);}},
    key:function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();Brain.send();}},
    resize:function(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px';},
    dismissBubble:function(){var e=document.getElementById('brain-bubble');if(e)e.style.display='none';}
  };

  /* ── Init ─────────────────────────────────────────────────── */
  function init(){
    injectCSS();
    var p=document.getElementById('brain-panel');if(p) p.classList.remove('bopen');
    setTimeout(function(){
      var n=fn(); if(n) showBubble(greet()+', '+n+'! I\'m Brain — tap me anytime 🤖',0);
    },2500);
    watchPage();
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
  else{setTimeout(init,800);}
})();
