/**
 * Brain v3 — Futuristic Intelligent AI Co-pilot
 * Full inline styles, animated aurora background, smart context
 */
(function() {
  'use strict';

  var msgs = [];
  var busy = false;
  var isOpen = false;
  var bubbleTimer = null;
  var lastPage = '';
  var sessionGreeted = false;
  var animFrame = null;

  /* ── FAB CSS injection ─────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('brain-injected-css')) return;
    var s = document.createElement('style');
    s.id = 'brain-injected-css';
    s.textContent = [
      '#brain-fab-wrap{position:fixed!important;bottom:28px!important;right:28px!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:14px!important;pointer-events:none!important;}',
      '#brain-fab-wrap>*{pointer-events:auto!important;}',
      '.bfab{width:60px!important;height:60px!important;border-radius:50%!important;border:none!important;cursor:pointer!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;outline:none!important;background:transparent!important;padding:0!important;}',
      '.bfab-inner{width:60px;height:60px;border-radius:50%;background:conic-gradient(from 0deg,#F97316,#EA580C,#F59E0B,#F97316);display:flex;align-items:center;justify-content:center;position:relative;animation:bfab-spin 4s linear infinite;}',
      '.bfab-inner::before{content:"";position:absolute;inset:3px;border-radius:50%;background:#0F172A;}',
      '.bfab-icon{position:relative;z-index:2;}',
      '@keyframes bfab-spin{to{transform:rotate(360deg)}}',
      '.bfab-glow{position:absolute;inset:-8px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.4) 0%,transparent 70%);animation:bfab-pulse 2s ease-in-out infinite;}',
      '@keyframes bfab-pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}',
      '.bbbl{background:rgba(15,23,42,.95);backdrop-filter:blur(20px);border-radius:16px 16px 4px 16px;padding:12px 36px 12px 16px;position:relative;box-shadow:0 8px 32px rgba(249,115,22,.2),0 2px 8px rgba(0,0,0,.4);max-width:270px;font-size:12.5px;color:rgba(255,255,255,.9);line-height:1.5;border:1px solid rgba(249,115,22,.3);animation:bbbl-in .4s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes bbbl-in{from{opacity:0;transform:scale(.8) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '#brain-panel{border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(249,115,22,.1);display:none;flex-direction:column;width:400px;height:580px;position:relative;}',
      '#brain-panel.bopen{display:flex;animation:bp-in .42s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes bp-in{from{opacity:0;transform:scale(.55) translateY(30px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '@keyframes bmsg-in{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes btype{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-7px);opacity:1}}',
      '@keyframes bglow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}',
      '@keyframes aurora{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── Context & helpers ─────────────────────────────────── */
  function fn() { var u=(typeof currentUser!=='undefined'?currentUser:''); return u?u.split(' ')[0]:'there'; }
  function hr() { return new Date().getHours(); }
  function greet() { var h=hr(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }
  function ts() { return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(new Date()); }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function md(t){
    return t
      .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#FB923C;font-weight:700;">$1</strong>')
      .replace(/\n- /g,'<br><span style="color:#F97316;margin-right:6px;">›</span>')
      .replace(/^- /,'<span style="color:#F97316;margin-right:6px;">›</span>')
      .replace(/\n\n/g,'<br><br>')
      .replace(/\n/g,'<br>');
  }
  function ctx() {
    var user=(typeof currentUser!=='undefined'?currentUser:'');
    var role=(typeof currentRole!=='undefined'?currentRole:'');
    var view=(typeof currentViewMode!=='undefined'?currentViewMode:'');
    var section=(typeof currentAgentSection!=='undefined'?currentAgentSection:'');
    var tab=''; var at=document.querySelector('.nav-tab.active'); if(at) tab=at.getAttribute('data-tab')||'';
    var page=view==='admin'?'admin/'+tab:'agent/'+section;
    return {user:user,role:role,view:view,page:page};
  }

  var PAGE_TIPS = {
    'admin/live':    '👁 Live Dashboard is open. I can explain any metric, flag anomalies, or break down what\'s happening right now.',
    'admin/roster':  '📅 Roster open — left-click a cell to cycle status, right-click for the full palette. Want me to explain ATT% calculation?',
    'admin/tickets': '🎫 Viewing ticket reports. Ask me about ticket type patterns or how the AI Learning feedback works.',
    'admin/breaks':  '⏱ Break tracker live. I can explain break budgets, policies, or help diagnose missing data.',
    'admin/reports': '📊 Reports page — ask me to explain any chart, metric, or trend you\'re seeing.',
    'admin/ai-agent':'🧠 AI Learning Agent — this is where agent feedback trains the suggestion engine. Ask me how it works!',
    'agent/tickets': '🎫 Ready to log a ticket? Paste your Zoho number — it fetches details automatically. Ask me about weekend mode or AI Suggest.',
    'agent/breakbot':'⏰ Break Bot ready. Tap a break type to start. Your supervisor sees it live in real time.',
    'agent/dashboard':'🏠 Your dashboard — ask me about your shift stats, how to log tickets, or any feature.',
    'agent/writer':  '✍️ AI Writer open — paste any message and I\'ll help transform it. Try "make this more empathetic".',
  };

  var QUICK_CHIPS = [
    {e:'🐛',l:'Report bug',  m:'I found a bug in the tool. Here\'s what\'s happening:'},
    {e:'📅',l:'Roster help', m:'How do I mark attendance in the Roster? Walk me through it.'},
    {e:'🎫',l:'Log ticket',  m:'Walk me through logging a ticket step by step.'},
    {e:'🔍',l:'Zoho issue',  m:'My Zoho ticket number isn\'t loading. What should I do?'},
    {e:'⏰',l:'Break Bot',   m:'How does the Break Bot work for agents?'},
    {e:'📖',l:'Full guide',  m:'Give me a complete overview of this tool — all features explained.'},
  ];

  /* ── Aurora animated background ────────────────────────── */
  var AURORA_STYLE = 'position:absolute;inset:0;z-index:0;' +
    'background:linear-gradient(-45deg,#0F172A,#1a0a2e,#0a1628,#162038,#0F172A);' +
    'background-size:400% 400%;animation:aurora 8s ease infinite;';

  var PANEL_OVERLAY = 'position:absolute;inset:0;z-index:1;pointer-events:none;' +
    'background:radial-gradient(ellipse at 30% 20%,rgba(249,115,22,.08) 0%,transparent 50%),' +
    'radial-gradient(ellipse at 80% 80%,rgba(139,92,246,.08) 0%,transparent 50%);';

  /* ── Inline style constants ─────────────────────────────── */
  var z = 'position:relative;z-index:2;';
  var S = {
    wrap:    z+'display:flex;flex-direction:column;height:100%;',
    hdr:     z+'display:flex;align-items:center;gap:12px;padding:16px 16px 12px;' +
             'background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;backdrop-filter:blur(8px);cursor:grab;',
    avWrap:  'position:relative;width:40px;height:40px;flex-shrink:0;',
    avRing:  'position:absolute;inset:-4px;border-radius:50%;' +
             'background:conic-gradient(from 0deg,#F97316,#8B5CF6,#06B6D4,#F97316);' +
             'animation:bfab-spin 3s linear infinite;',
    avInner: 'position:absolute;inset:2px;border-radius:50%;background:#0F172A;' +
             'display:flex;align-items:center;justify-content:center;',
    title:   'font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em;line-height:1;',
    tag:     'display:inline-flex;align-items:center;gap:5px;margin-top:3px;' +
             'font-size:9px;font-weight:800;color:#F97316;letter-spacing:.1em;text-transform:uppercase;',
    dot:     'width:5px;height:5px;border-radius:50%;background:#F97316;' +
             'box-shadow:0 0 8px #F97316;animation:bglow 1.4s ease-in-out infinite;',
    closeBtn:'margin-left:auto;width:30px;height:30px;border-radius:9px;' +
             'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);' +
             'color:rgba(255,255,255,.6);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;',
    chips:   z+'display:flex;gap:6px;padding:10px 14px 8px;flex-wrap:wrap;flex-shrink:0;' +
             'border-bottom:1px solid rgba(255,255,255,.05);',
    chip:    'display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;' +
             'font-size:10.5px;font-weight:600;background:rgba(255,255,255,.06);' +
             'border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.7);cursor:pointer;' +
             'transition:all .2s;white-space:nowrap;font-family:inherit;',
    msgs:    z+'flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;',
    rowAI:   'display:flex;gap:8px;align-items:flex-start;animation:bmsg-in .25s cubic-bezier(.34,1.56,.64,1) both;',
    rowU:    'display:flex;gap:8px;align-items:flex-start;flex-direction:row-reverse;animation:bmsg-in .25s cubic-bezier(.34,1.56,.64,1) both;',
    avAI:    'width:28px;height:28px;border-radius:9px;flex-shrink:0;' +
             'background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;' +
             'box-shadow:0 4px 12px rgba(249,115,22,.35);',
    avU:     'width:28px;height:28px;border-radius:9px;flex-shrink:0;' +
             'background:rgba(255,255,255,.1);',
    bubAI:   'max-width:82%;padding:10px 14px;border-radius:4px 14px 14px 14px;' +
             'font-size:12.5px;line-height:1.65;' +
             'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.92);',
    bubU:    'max-width:82%;padding:10px 14px;border-radius:14px 4px 14px 14px;' +
             'font-size:12.5px;line-height:1.65;' +
             'background:linear-gradient(135deg,rgba(249,115,22,.85),rgba(234,88,12,.85));color:#fff;' +
             'box-shadow:0 4px 16px rgba(249,115,22,.25);',
    time:    'font-size:9px;color:rgba(255,255,255,.25);margin-top:4px;',
    inputRow:z+'display:flex;gap:8px;padding:10px 14px;flex-shrink:0;align-items:flex-end;' +
             'border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.3);',
    input:   'flex:1;padding:10px 14px;border-radius:12px;' +
             'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);' +
             'color:#fff;font-size:12.5px;font-family:inherit;outline:none;resize:none;' +
             'max-height:100px;min-height:38px;line-height:1.5;',
    sendBtn: 'width:38px;height:38px;border-radius:11px;flex-shrink:0;border:none;cursor:pointer;' +
             'background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;' +
             'box-shadow:0 4px 14px rgba(249,115,22,.45);transition:transform .2s,box-shadow .2s;',
  };

  var BRAIN_SVG_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>';
  var BRAIN_SVG_LG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" style="width:22px;height:22px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>';

  /* ── Render ─────────────────────────────────────────────── */
  function msgHTML(m) {
    var isAI = m.role === 'assistant';
    return '<div style="' + (isAI?S.rowAI:S.rowU) + '">' +
      '<div style="' + (isAI?S.avAI:S.avU) + '">' + (isAI?BRAIN_SVG_SM:'') + '</div>' +
      '<div><div style="' + (isAI?S.bubAI:S.bubU) + '">' +
        (isAI ? md(m.content) : esc(m.content)) +
      '</div><div style="' + S.time + '">' + (m.time||'') + '</div></div></div>';
  }

  function welcomeHTML() {
    var n=fn(), g=greet(), h=hr();
    var emoji = h<12?'🌅':h<17?'☀️':'🌙';
    var subtext = h<12 ? 'Starting your shift? I\'m watching. Ask me anything.' :
                  h<17 ? 'Midshift check — how can I help?' :
                         'Late shift? I\'ve got you. Ask away.';
    return '<div style="display:flex;flex-direction:column;align-items:center;padding:28px 20px 10px;text-align:center;">' +
      '<div style="width:68px;height:68px;position:relative;margin-bottom:14px;">' +
        '<div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#F97316,#8B5CF6,#06B6D4,#10B981,#F97316);animation:bfab-spin 4s linear infinite;"></div>' +
        '<div style="position:absolute;inset:4px;border-radius:50%;background:#0F172A;display:flex;align-items:center;justify-content:center;">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="1.8" stroke-linecap="round" style="width:28px;height:28px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-.01em;margin-bottom:3px;">' + emoji + ' ' + g + ', ' + esc(n) + '</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:14px;">' + subtext + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;justify-content:center;">' +
        '<div style="padding:5px 12px;background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.25);border-radius:99px;font-size:10px;font-weight:700;color:#FB923C;">🔍 Diagnose issues</div>' +
        '<div style="padding:5px 12px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);border-radius:99px;font-size:10px;font-weight:700;color:#A78BFA;">📖 Feature guide</div>' +
        '<div style="padding:5px 12px;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.2);border-radius:99px;font-size:10px;font-weight:700;color:#67E8F9;">⚡ Instant fixes</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var panel = document.getElementById('brain-panel');
    if (!panel) return;

    var chipsHTML = QUICK_CHIPS.map(function(c){
      return '<button style="' + S.chip + '" onclick="Brain.quick(' + JSON.stringify(c.m) + ')">' + c.e + ' ' + c.l + '</button>';
    }).join('');

    var msgsContent = msgs.length===0 ? welcomeHTML() : msgs.map(msgHTML).join('');

    panel.innerHTML =
      // Aurora background
      '<div style="' + AURORA_STYLE + '"></div>' +
      '<div style="' + PANEL_OVERLAY + '"></div>' +
      // Content wrapper
      '<div style="' + S.wrap + '">' +
        // Header
        '<div style="' + S.hdr + '" id="brain-drag-h">' +
          '<div style="' + S.avWrap + '">' +
            '<div style="' + S.avRing + '"></div>' +
            '<div style="' + S.avInner + '">' + BRAIN_SVG_LG + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="' + S.title + '">Brain</div>' +
            '<div style="' + S.tag + '"><span style="' + S.dot + '"></span>Brain is Braining</div>' +
          '</div>' +
          '<button style="' + S.closeBtn + '" onclick="Brain.close()" title="Minimize">&#8722;</button>' +
        '</div>' +
        // Quick chips
        '<div style="' + S.chips + '">' + chipsHTML + '</div>' +
        // Messages
        '<div style="' + S.msgs + '" id="brain-msgs">' + msgsContent + '</div>' +
        // Input
        '<div style="' + S.inputRow + '">' +
          '<textarea style="' + S.input + '" id="brain-input" placeholder="Ask anything — features, bugs, how-to…" onkeydown="Brain.key(event)" oninput="Brain.resize(this)" rows="1"></textarea>' +
          '<button style="' + S.sendBtn + '" id="brain-send" onclick="Brain.send()">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="width:14px;height:14px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    scroll();
    drag();
  }

  function scroll(){setTimeout(function(){var e=document.getElementById('brain-msgs');if(e)e.scrollTop=e.scrollHeight;},70);}

  function addTyping(){
    var el=document.getElementById('brain-msgs');
    if(!el) return;
    var d=document.createElement('div');
    d.id='brain-t';
    d.style.cssText=S.rowAI;
    d.innerHTML='<div style="'+S.avAI+'">'+BRAIN_SVG_SM+'</div>' +
      '<div style="'+S.bubAI+';display:flex;gap:5px;align-items:center;padding:12px 14px;">' +
        '<span style="width:7px;height:7px;border-radius:50%;background:#F97316;box-shadow:0 0 8px #F97316;display:inline-block;animation:btype .9s ease-in-out infinite;"></span>' +
        '<span style="width:7px;height:7px;border-radius:50%;background:#F97316;box-shadow:0 0 8px #F97316;display:inline-block;animation:btype .9s .2s ease-in-out infinite;"></span>' +
        '<span style="width:7px;height:7px;border-radius:50%;background:#F97316;box-shadow:0 0 8px #F97316;display:inline-block;animation:btype .9s .4s ease-in-out infinite;"></span>' +
      '</div>';
    el.appendChild(d);
    scroll();
  }
  function rmTyping(){var e=document.getElementById('brain-t');if(e)e.remove();}

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

  /* ── AI call with rich context ─────────────────────────── */
  async function callAI(userMsg) {
    msgs.push({role:'user',content:userMsg,time:ts()});
    busy=true; render(); addTyping();
    var btn=document.getElementById('brain-send'); if(btn) btn.disabled=true;
    try {
      var c=ctx();
      // Gather live stats from the page
      var userStats = {
        page: c.page,
        role: c.role,
        hour: hr(),
        ticketsToday: null,
        agentsOnline: null,
      };
      try {
        var kpiEl = document.getElementById('la-kpi-total');
        if(kpiEl && kpiEl.textContent !== '—') userStats.feedbackTotal = kpiEl.textContent;
        var teamEl = document.querySelector('.team-count, [data-stat="team"]');
        if(teamEl) userStats.agentsOnline = teamEl.textContent;
      } catch(e2){}

      var res = await fetch('/api/brain/chat',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          messages: msgs.map(function(m){return{role:m.role,content:m.content};}),
          context: 'User: ' + c.user + ' | Role: ' + c.role + ' | Page: ' + c.page + ' | Hour: ' + hr() + 'h CST',
          userStats: userStats
        })
      });
      var data=await res.json();
      rmTyping();
      msgs.push({role:'assistant',content:data.success?data.reply:'Having trouble — please try again.',time:ts()});
    } catch(e){
      rmTyping();
      msgs.push({role:'assistant',content:'Connection issue. Check your internet.',time:ts()});
    }
    busy=false; render();
    var s2=document.getElementById('brain-send'); if(s2) s2.disabled=false;
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
        el.style.transition='opacity .5s';el.style.opacity='0';
        setTimeout(function(){el.style.display='none';el.style.opacity='';el.style.transition='';},500);
      },8000);
    },delay||0);
  }

  /* ── Open / close ───────────────────────────────────────── */
  function openPanel(){
    isOpen=true;
    var p=document.getElementById('brain-panel'),f=document.getElementById('brain-fab'),b=document.getElementById('brain-bubble');
    if(p) p.classList.add('bopen');
    if(f){f.style.opacity='.7';f.style.transform='scale(.9)';}
    if(b) b.style.display='none';
    render();
    setTimeout(function(){
      var inp=document.getElementById('brain-input');if(inp) inp.focus();
      if(!sessionGreeted){
        sessionGreeted=true;
        var greeting_msg = greet()+', '+fn()+'! I\'m ready. I can see you\'re on **'+ctx().page+'**. What can I help you with?';
        msgs.push({role:'assistant',content:greeting_msg,time:ts()});
        render();
      }
    },150);
  }
  function closePanel(){
    isOpen=false;
    var p=document.getElementById('brain-panel'),f=document.getElementById('brain-fab');
    if(p) p.classList.remove('bopen');
    if(f){f.style.opacity='';f.style.transform='';}
  }

  /* ── Page watcher ───────────────────────────────────────── */
  function watchPage(){
    setInterval(function(){
      var c=ctx();
      if(c.page && c.page!==lastPage){
        var prev=lastPage; lastPage=c.page;
        if(prev) {
          var tip=PAGE_TIPS[c.page];
          if(tip && !isOpen) showBubble(tip,1000);
          if(isOpen && msgs.length>0){
            msgs.push({role:'assistant',content:'Switched to **'+c.page+'**. '+(tip||'Let me know if you need help here.'),time:ts()});
            render();
          }
        }
      }
    },1200);
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.Brain={
    toggle:function(){isOpen?closePanel():openPanel();},
    close: closePanel,
    send:function(){
      if(busy) return;
      var inp=document.getElementById('brain-input');
      var msg=inp?inp.value.trim():''; if(!msg) return;
      inp.value=''; inp.style.height='';
      callAI(msg);
    },
    quick:function(msg){if(!busy){if(!isOpen)openPanel();setTimeout(function(){callAI(msg);},200);}},
    key:function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();Brain.send();}},
    resize:function(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,100)+'px';},
    dismissBubble:function(){var e=document.getElementById('brain-bubble');if(e)e.style.display='none';}
  };

  /* ── Init ───────────────────────────────────────────────── */
  function init(){
    injectCSS();
    var p=document.getElementById('brain-panel');if(p) p.classList.remove('bopen');
    setTimeout(function(){
      var n=fn(); if(n) showBubble(greet()+', '+n+'! ✨ I\'m Brain — tap me anytime',0);
    },2500);
    watchPage();
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
  else{setTimeout(init,800);}
})();
