/**
 * Brain — Adit Agent Monitor AI Assistant
 * Separate file to avoid HTML/template-literal escaping issues
 */
(function() {
  'use strict';

  var _messages = [];
  var _busy = false;
  var _guideOpen = false;

  var QUICK_PROMPTS = [
    { icon: '🐛', label: 'Report a bug', msg: 'I found a bug in the tool. Let me describe what\'s happening:' },
    { icon: '📖', label: 'How to log a ticket', msg: 'How do I log a ticket using the Tickets page?' },
    { icon: '📅', label: 'Roster help', msg: 'How do I use the Roster page to mark attendance?' },
    { icon: '⏰', label: 'Break Bot help', msg: 'How does the Break Bot work for agents?' },
    { icon: '🌙', label: 'Weekend mode', msg: 'How does Weekend Support Mode work in the ticket logger?' },
    { icon: '🔍', label: 'Ticket not found', msg: 'My ticket number is not being found in Zoho Desk. What should I do?' },
  ];

  var GUIDE_FEATURES = [
    { icon: '📊', name: 'Live Dashboard', color: 'rgba(249,115,22,.1)', desc: 'Real-time agent status, active calls, break monitoring, queue health at a glance' },
    { icon: '⏰', name: 'Break Bot', color: 'rgba(33,170,224,.1)', desc: 'Start/end breaks as an agent. Supervisor sees all break activity live. Shift-aware.' },
    { icon: '🎫', name: 'Ticket Logger', color: 'rgba(139,92,246,.1)', desc: 'Log tickets to Google Sheets with Zoho lookup. Weekend mode logs to a second sheet automatically.' },
    { icon: '📅', name: 'Roster Attendance', color: 'rgba(16,185,129,.1)', desc: 'Monthly calendar. Left-click = cycle status. Right-click = full palette. Bulk fill by column.' },
    { icon: '📈', name: 'Reports', color: 'rgba(245,158,11,.1)', desc: 'Productivity analytics, attendance trends, ticket volume charts by agent and channel.' },
    { icon: '✍️', name: 'AI Writer', color: 'rgba(99,102,241,.1)', desc: 'Draft emails and messages. Transforms: formal, shorter, empathetic, bullets, subject lines.' },
    { icon: '🗓️', name: 'Schedule', color: 'rgba(6,182,212,.1)', desc: 'View and manage agent shift schedules. Set shift times, days off, and schedule changes.' },
    { icon: '🧠', name: 'Brain Assistant', color: 'rgba(249,115,22,.1)', desc: 'Ask anything about the tool. Report bugs. Get step-by-step guidance. Available 24/7.' },
  ];

  var QUICK_TIPS = [
    ['Left-click a roster cell', 'Cycles P → WFH → OFF → clear'],
    ['Right-click a roster cell', 'Opens full status palette (PL, UPL, SL, NCNS, etc.)'],
    ['Click date header in roster', 'Bulk-fill all empty cells in that column'],
    ['Weekend date in ticket logger', 'Auto-shows weekend fields + logs to 2 sheets'],
    ['AI Suggest in ticket notes', 'Fetches Zoho conversation and generates a summary'],
    ['Ctrl+Shift+R', 'Hard refresh — clears cache and loads latest version'],
  ];

  var COMMON_ISSUES = [
    ['Ticket not found in Zoho', 'Check the ticket number is correct. May be very old or in a different org. Try Retry.'],
    ['Weekend fields not showing', 'Select a Saturday or Sunday in the date picker.'],
    ['Wrong page after refresh', 'Hard refresh (Ctrl+Shift+R). Clears cached service worker.'],
    ['Roster not saving', 'Changes auto-save after 600ms. Check your internet connection.'],
  ];

  function ts() {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function mdToHtml(text) {
    // Convert simple markdown to HTML — avoid backticks in regex by using alternatives
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- /g, '\n<li>')
      .replace(/^- /g, '<li>')
      .replace(/\n/g, '<br>');
  }

  function scrollBottom() {
    setTimeout(function() {
      var msgs = document.getElementById('brain-msgs');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 60);
  }

  function renderTypingIndicator() {
    var msgs = document.getElementById('brain-msgs');
    if (!msgs) return;
    var el = document.createElement('div');
    el.className = 'brain-msg';
    el.id = 'brain-typing-indicator';
    el.innerHTML =
      '<div class="brain-msg-avatar brain-msg-avatar-ai">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px">' +
          '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>' +
          '<path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>' +
        '</svg>' +
      '</div>' +
      '<div class="brain-msg-bubble brain-msg-bubble-ai brain-typing"><span></span><span></span><span></span></div>';
    msgs.appendChild(el);
    scrollBottom();
  }

  function removeTyping() {
    var el = document.getElementById('brain-typing-indicator');
    if (el) el.remove();
  }

  function buildMsgHTML(m) {
    var isAI = m.role === 'assistant';
    var avatarIcon = isAI
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="width:13px;height:13px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>'
      : '';
    var content = isAI ? mdToHtml(m.content) : esc(m.content);
    return (
      '<div class="brain-msg' + (isAI ? '' : ' brain-msg-user') + '">' +
        '<div class="brain-msg-avatar ' + (isAI ? 'brain-msg-avatar-ai' : 'brain-msg-avatar-user') + '">' + avatarIcon + '</div>' +
        '<div>' +
          '<div class="brain-msg-bubble ' + (isAI ? 'brain-msg-bubble-ai' : 'brain-msg-bubble-user') + '">' + content + '</div>' +
          '<div class="brain-msg-time">' + (m.time || '') + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function buildWelcomeHTML() {
    return (
      '<div style="display:flex;flex-direction:column;align-items:center;padding:30px 16px 10px;">' +
        '<div style="width:60px;height:60px;border-radius:18px;background:linear-gradient(135deg,#F97316,#FB923C);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(249,115,22,.3);margin-bottom:14px;">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:30px;height:30px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
        '</div>' +
        '<div style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:6px;">Hey, I\'m Brain 👋</div>' +
        '<div style="font-size:13px;color:#64748B;text-align:center;max-width:340px;line-height:1.6;">I know everything about this tool. Ask me how something works, report a bug, or describe any issue — I\'ll help you fix it.</div>' +
        '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center;">' +
          '<div style="padding:5px 12px;background:#FFF7ED;border:1px solid rgba(249,115,22,.25);border-radius:99px;font-size:11px;font-weight:600;color:#C2410C;">🔍 Diagnose issues</div>' +
          '<div style="padding:5px 12px;background:#EFF6FF;border:1px solid rgba(33,170,224,.25);border-radius:99px;font-size:11px;font-weight:600;color:#1D4ED8;">📖 Tool guide</div>' +
          '<div style="padding:5px 12px;background:#F0FDF4;border:1px solid rgba(16,185,129,.25);border-radius:99px;font-size:11px;font-weight:600;color:#065F46;">✅ Step-by-step help</div>' +
        '</div>' +
      '</div>'
    );
  }

  function buildGuideHTML() {
    var featuresHTML = GUIDE_FEATURES.map(function(f) {
      return (
        '<div class="brain-feature" onclick="Brain.askAbout(' + JSON.stringify(f.name) + ')">' +
          '<div class="brain-feature-icon" style="background:' + f.color + '">' + f.icon + '</div>' +
          '<div>' +
            '<div class="brain-feature-name">' + esc(f.name) + '</div>' +
            '<div class="brain-feature-desc">' + esc(f.desc) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var tipsHTML = QUICK_TIPS.map(function(t) {
      return (
        '<div style="display:flex;gap:10px;padding:9px 12px;background:#F8FAFC;border:1px solid #E5E9F0;border-radius:10px;">' +
          '<div style="font-size:12px;font-weight:700;color:#F97316;min-width:160px;flex-shrink:0;">' + esc(t[0]) + '</div>' +
          '<div style="font-size:12px;color:#475569;">' + esc(t[1]) + '</div>' +
        '</div>'
      );
    }).join('');

    var issuesHTML = COMMON_ISSUES.map(function(i) {
      return (
        '<div style="padding:10px 14px;background:#FFF8F4;border:1px solid rgba(249,115,22,.2);border-radius:10px;cursor:pointer;margin-bottom:7px;" onclick="Brain.askAbout(' + JSON.stringify(i[0]) + ')">' +
          '<div style="font-size:12px;font-weight:700;color:#C2410C;margin-bottom:3px;">⚠ ' + esc(i[0]) + '</div>' +
          '<div style="font-size:11.5px;color:#92400E;">' + esc(i[1]) + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="brain-guide-panel" id="brain-guide">' +
        '<div class="brain-guide-header">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2" stroke-linecap="round" style="width:18px;height:18px"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' +
          '<span class="brain-guide-title">Adit Agent Monitor — Tool Guide</span>' +
          '<button class="brain-guide-close" onclick="Brain.toggleGuide()">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="brain-guide-body">' +
          '<div class="brain-guide-section">' +
            '<div class="brain-guide-section-title">Features</div>' +
            featuresHTML +
          '</div>' +
          '<div class="brain-guide-section">' +
            '<div class="brain-guide-section-title">Quick Tips</div>' +
            '<div style="display:flex;flex-direction:column;gap:7px;">' + tipsHTML + '</div>' +
          '</div>' +
          '<div class="brain-guide-section">' +
            '<div class="brain-guide-section-title">Common Issues</div>' +
            issuesHTML +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  var BRAIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>';

  function render() {
    var root = document.getElementById('brain-root');
    if (!root) return;

    var quickHTML = QUICK_PROMPTS.map(function(q) {
      return '<button class="brain-quick-btn" onclick="Brain.quickSend(' + JSON.stringify(q.msg) + ')">' + q.icon + ' ' + q.label + '</button>';
    }).join('');

    var msgsHTML = _messages.length === 0
      ? buildWelcomeHTML()
      : _messages.map(buildMsgHTML).join('');

    root.innerHTML =
      '<div class="brain-header">' +
        '<div class="brain-avatar">' +
          '<div class="brain-avatar-pulse"></div>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" style="width:22px;height:22px"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' +
        '</div>' +
        '<div class="brain-header-text">' +
          '<div class="brain-title">Brain</div>' +
          '<div class="brain-tag"><span class="brain-tag-dot"></span>Brain is Braining</div>' +
        '</div>' +
        '<button class="brain-guide-btn" onclick="Brain.toggleGuide()">📖 Tool Guide</button>' +
      '</div>' +
      '<div class="brain-quick">' + quickHTML + '</div>' +
      '<div class="brain-messages" id="brain-msgs">' + msgsHTML + '</div>' +
      '<div class="brain-input-wrap">' +
        '<textarea class="brain-input" id="brain-input" rows="1" placeholder="Ask anything, report a bug, or describe an issue…" onkeydown="Brain.onKey(event)" oninput="Brain.autoResize(this)"></textarea>' +
        '<button class="brain-send" id="brain-send" onclick="Brain.send()" title="Send">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>' +
      (_guideOpen ? buildGuideHTML() : '');

    scrollBottom();
  }

  async function callAI(userMsg) {
    _messages.push({ role: 'user', content: userMsg, time: ts() });
    _busy = true;
    render();
    renderTypingIndicator();
    var sendBtn = document.getElementById('brain-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      var ctxUser = (typeof currentUser !== 'undefined' ? currentUser : 'unknown');
      var ctxRole = (typeof currentRole !== 'undefined' ? currentRole : 'unknown');
      var ctxView = (typeof currentViewMode !== 'undefined' ? currentViewMode : 'unknown');
      var res = await fetch('/api/brain/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: _messages.map(function(m) { return { role: m.role, content: m.content }; }),
          context: 'User: ' + ctxUser + ', Role: ' + ctxRole + ', View: ' + ctxView
        })
      });
      var data = await res.json();
      removeTyping();
      _messages.push({
        role: 'assistant',
        content: data.success ? data.reply : 'Sorry, I\'m having trouble right now. Please try again.',
        time: ts()
      });
    } catch(e) {
      removeTyping();
      _messages.push({ role: 'assistant', content: 'Connection issue — check your internet and try again.', time: ts() });
    }
    _busy = false;
    render();
    if (document.getElementById('brain-send')) document.getElementById('brain-send').disabled = false;
  }

  // Public API
  window.Brain = {
    init: function() { render(); },
    send: function() {
      if (_busy) return;
      var inp = document.getElementById('brain-input');
      var msg = inp ? inp.value.trim() : '';
      if (!msg) return;
      inp.value = '';
      inp.style.height = '';
      callAI(msg);
    },
    quickSend: function(msg) {
      if (_busy) return;
      callAI(msg);
    },
    askAbout: function(topic) {
      _guideOpen = false;
      render();
      setTimeout(function() {
        callAI('Tell me about the ' + topic + ' feature — how does it work and what can I do with it?');
      }, 100);
    },
    onKey: function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    },
    autoResize: function(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    },
    toggleGuide: function() {
      _guideOpen = !_guideOpen;
      render();
    }
  };

  // Hook into section switching
  document.addEventListener('DOMContentLoaded', function() {
    var origSwitch = window.switchAgentSection;
    if (typeof origSwitch === 'function') {
      window.switchAgentSection = function(section, el) {
        origSwitch.call(this, section, el);
        if (section === 'brain') setTimeout(function() { Brain.init(); }, 80);
      };
    }
  });

})();
