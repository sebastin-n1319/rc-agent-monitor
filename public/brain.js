/**
 * Brain — Floating Intelligent AI Assistant for Adit Agent Monitor
 * Context-aware, proactive, futuristic
 */
(function() {
  'use strict';

  var msgs = [];
  var busy = false;
  var open = false;
  var bubbleTimer = null;
  var lastPage = '';
  var sessionGreeted = false;

  /* ── Context awareness ─────────────────────────────────────── */
  function ctx() {
    var user = (typeof currentUser !== 'undefined' ? currentUser : '');
    var role = (typeof currentRole !== 'undefined' ? currentRole : '');
    var view = (typeof currentViewMode !== 'undefined' ? currentViewMode : '');
    var section = (typeof currentAgentSection !== 'undefined' ? currentAgentSection : '');
    var adminTab = '';
    var activeAdmin = document.querySelector('.nav-tab.active');
    if (activeAdmin) adminTab = activeAdmin.getAttribute('data-tab') || '';
    var page = view === 'admin' ? ('admin/' + adminTab) : ('agent/' + section);
    return { user: user, role: role, view: view, section: section, adminTab: adminTab, page: page };
  }

  function firstName() {
    var u = (typeof currentUser !== 'undefined' ? currentUser : '');
    return u ? u.split(' ')[0] : 'there';
  }

  function hour() { return new Date().getHours(); }

  function greeting() {
    var h = hour();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /* ── Proactive intelligence ─────────────────────────────────── */
  var PAGE_TIPS = {
    'admin/live':     'You\'re on the Live Dashboard. I can explain any metric here or help you spot anomalies. Just ask.',
    'admin/tickets':  'Ticket view is open. I can help you understand ticket types, filter logic, or export options.',
    'admin/roster':   'Roster page — left-click a cell to cycle status, right-click for the full palette. Need help with bulk fills?',
    'admin/breaks':   'Break tracker is live. I can explain break durations, shift policies, or help diagnose missing data.',
    'admin/reports':  'Reports open. Ask me to explain any chart, metric, or help you understand trend data.',
    'agent/tickets':  'Logging tickets? I can guide you through weekend mode, Zoho lookup issues, or bulk backlog entry.',
    'agent/breakbot': 'Break Bot active. Start a break by tapping your break type. Supervisor sees this in real time.',
    'agent/dashboard':'Welcome to your dashboard. Ask me anything — how to log tickets, check your stats, or get help.',
    'agent/writer':   'AI Writer is here. Try transforms like Formal, Shorter, or Empathetic on any message you draft.',
  };

  function proactiveTip(page) {
    return PAGE_TIPS[page] || null;
  }

  function ts() {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
  }

  /* ── Bubble (proactive whisper) ──────────────────────────────── */
  function showBubble(text, delay) {
    delay = delay || 0;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function() {
      if (open) return; // don't show bubble when panel is open
      var el = document.getElementById('brain-bubble');
      var txt = document.getElementById('brain-bubble-text');
      if (!el || !txt) return;
      txt.textContent = text;
      el.style.display = 'block';
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      // Auto-dismiss after 8s
      bubbleTimer = setTimeout(function() {
        el.style.opacity = '0';
        el.style.transition = 'opacity .4s ease';
        setTimeout(function() {
          el.style.display = 'none';
          el.style.opacity = '';
          el.style.transition = '';
        }, 400);
      }, 8000);
    }, delay);
  }

  /* ── Panel render ────────────────────────────────────────────── */
  var QUICK_CHIPS = [
    { e: '🐛', l: 'Report bug',     m: 'I found a bug. Here\'s what\'s happening:' },
    { e: '📅', l: 'Roster help',    m: 'How do I mark attendance in the Roster?' },
    { e: '🎫', l: 'Ticket help',    m: 'How do I log a ticket correctly?' },
    { e: '🔍', l: 'Zoho issue',     m: 'My Zoho ticket is not being found. What do I do?' },
    { e: '⏰', l: 'Break Bot',      m: 'How does the Break Bot work?' },
    { e: '📖', l: 'Tool guide',     m: 'Give me a full overview of this tool and all its features.' },
  ];

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mdToHtml(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- /g, '<br>&bull; ')
      .replace(/^- /gm, '&bull; ')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function msgHTML(m) {
    var isAI = m.role === 'assistant';
    var avCls = isAI ? 'brain-msg-av-ai' : 'brain-msg-av-u';
    var avInner = isAI
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>'
      : '';
    var bubCls = isAI ? 'brain-msg-bub-ai' : 'brain-msg-bub-u';
    var content = isAI ? mdToHtml(m.content) : esc(m.content);
    return '<div class="brain-msg' + (isAI ? '' : ' brain-msg-u') + '">' +
      '<div class="brain-msg-av ' + avCls + '">' + avInner + '</div>' +
      '<div><div class="brain-msg-bub ' + bubCls + '">' + content + '</div>' +
      '<div class="brain-msg-time">' + esc(m.time || '') + '</div></div>' +
      '</div>';
  }

  function welcomeHTML() {
    var name = firstName();
    var greet = greeting();
    return '<div style="display:flex;flex-direction:column;align-items:center;padding:24px 16px 8px;text-align:center;">' +
      '<div style="width:56px;height:56px;border-radius:18px;background:linear-gradient(135deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(249,115,22,.4);margin-bottom:12px;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:28px;height:28px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
      '</div>' +
      '<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px;">' + greet + ', ' + esc(name) + ' 👋</div>' +
      '<div style="font-size:11.5px;color:rgba(255,255,255,.5);line-height:1.6;max-width:280px;">I\'m Brain. I\'m watching your session and I\'m ready to help — guide you, fix issues, or explain anything about this tool.</div>' +
      '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;justify-content:center;">' +
        '<div style="padding:4px 10px;background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);border-radius:99px;font-size:10px;font-weight:700;color:#FB923C;">🔍 Bug detection</div>' +
        '<div style="padding:4px 10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:99px;font-size:10px;font-weight:700;color:rgba(255,255,255,.6);">📖 Tool guide</div>' +
        '<div style="padding:4px 10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:99px;font-size:10px;font-weight:700;color:rgba(255,255,255,.6);">✅ Step-by-step</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var root = document.getElementById('brain-root');
    if (!root) return;

    var chipsHTML = QUICK_CHIPS.map(function(c) {
      return '<button class="brain-chip" onclick="Brain.quickSend(' + JSON.stringify(c.m) + ')">' + c.e + ' ' + c.l + '</button>';
    }).join('');

    var msgsHTML = msgs.length === 0 ? welcomeHTML() : msgs.map(msgHTML).join('');

    root.innerHTML =
      '<div class="brain-ph">' +
        '<div class="brain-ph-avatar">' +
          '<div class="brain-ph-avatar-glow"></div>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:20px;height:20px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
        '</div>' +
        '<div>' +
          '<div class="brain-ph-title">Brain</div>' +
          '<div class="brain-ph-status"><span class="brain-ph-dot"></span>Brain is Braining</div>' +
        '</div>' +
        '<button class="brain-ph-close" onclick="Brain.toggle()">&#x2715;</button>' +
      '</div>' +
      '<div class="brain-chips">' + chipsHTML + '</div>' +
      '<div class="brain-msgs" id="brain-msgs">' + msgsHTML + '</div>' +
      '<div class="brain-input-row">' +
        '<textarea class="brain-input-txt" id="brain-input" rows="1" placeholder="Ask me anything…" onkeydown="Brain.onKey(event)" oninput="Brain.resize(this)"></textarea>' +
        '<button class="brain-send-btn" id="brain-send" onclick="Brain.send()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" style="width:14px;height:14px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>';

    scrollBottom();
  }

  function scrollBottom() {
    setTimeout(function() {
      var el = document.getElementById('brain-msgs');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  function showTyping() {
    var el = document.getElementById('brain-msgs');
    if (!el) return;
    var div = document.createElement('div');
    div.id = 'brain-typing';
    div.className = 'brain-msg';
    div.innerHTML =
      '<div class="brain-msg-av brain-msg-av-ai">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
      '</div>' +
      '<div class="brain-msg-bub brain-msg-bub-ai brain-typing"><span></span><span></span><span></span></div>';
    el.appendChild(div);
    scrollBottom();
  }

  function removeTyping() {
    var el = document.getElementById('brain-typing');
    if (el) el.remove();
  }

  /* ── AI call ─────────────────────────────────────────────────── */
  async function callAI(userMsg) {
    msgs.push({ role: 'user', content: userMsg, time: ts() });
    busy = true;
    render();
    showTyping();
    var sendBtn = document.getElementById('brain-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      var c = ctx();
      var res = await fetch('/api/brain/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgs.map(function(m) { return { role: m.role, content: m.content }; }),
          context: 'User: ' + c.user + ' | Role: ' + c.role + ' | Page: ' + c.page + ' | Hour: ' + hour()
        })
      });
      var data = await res.json();
      removeTyping();
      msgs.push({
        role: 'assistant',
        content: data.success ? data.reply : 'Having trouble connecting — please try again.',
        time: ts()
      });
    } catch(e) {
      removeTyping();
      msgs.push({ role: 'assistant', content: 'Connection issue. Check your internet and retry.', time: ts() });
    }
    busy = false;
    render();
    var s = document.getElementById('brain-send');
    if (s) s.disabled = false;
  }

  /* ── Page change watcher ─────────────────────────────────────── */
  function watchPageChange() {
    setInterval(function() {
      var c = ctx();
      if (c.page && c.page !== lastPage && c.page !== '/') {
        lastPage = c.page;
        var tip = proactiveTip(c.page);
        if (tip && !open) showBubble(tip, 1200);
      }
    }, 800);
  }

  /* ── Public API ──────────────────────────────────────────────── */
  window.Brain = {
    toggle: function() {
      open = !open;
      var panel = document.getElementById('brain-panel');
      var fab = document.getElementById('brain-fab');
      var bubble = document.getElementById('brain-bubble');
      if (panel) panel.classList.toggle('open', open);
      if (fab) fab.classList.toggle('open', open);
      if (open) {
        if (bubble) bubble.style.display = 'none';
        render();
        setTimeout(function() {
          var inp = document.getElementById('brain-input');
          if (inp) inp.focus();
          // Greet on first open
          if (!sessionGreeted && msgs.length === 0) {
            sessionGreeted = true;
            var name = firstName();
            var greet = greeting();
            setTimeout(function() {
              callAI(greet + ', ' + name + '! I\'m opening for the first time this session. Please introduce yourself briefly and tell me what you can help me with on this page.');
            }, 600);
          }
        }, 150);
      }
    },
    send: function() {
      if (busy) return;
      var inp = document.getElementById('brain-input');
      var msg = inp ? inp.value.trim() : '';
      if (!msg) return;
      inp.value = '';
      inp.style.height = '';
      callAI(msg);
    },
    quickSend: function(msg) {
      if (busy) return;
      callAI(msg);
    },
    onKey: function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Brain.send(); }
    },
    resize: function(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    },
    dismissBubble: function() {
      var el = document.getElementById('brain-bubble');
      if (el) el.style.display = 'none';
    }
  };

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    // Show welcome bubble after 3s if user is idle
    setTimeout(function() {
      var name = firstName();
      if (name) {
        showBubble(greeting() + ', ' + name + '! I\'m Brain — tap me if you need help with anything 🧠', 0);
      }
    }, 3000);
    watchPageChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }

})();
