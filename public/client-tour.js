/* Guided tours for new features (Client lookup, Support guides). Agents must finish each once: no close button, no Escape, no click-away. */
(function () {
  'use strict';
  var BASE = (typeof BACKEND !== 'undefined' ? BACKEND : '');
  var T = window.ClientTour = { running: false, checked: false };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(path, body) {
    var o = { credentials: 'include', method: body ? 'POST' : 'GET' };
    if (body) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(body); }
    return fetch(BASE + path, o).then(function (r) { return r.json().catch(function () { return { success: false }; }); });
  }
  // Pop-ups that must be dealt with first (update gate, review gate, daily mood check-in, break and lock screens).
  var BLOCKERS = '#pu-gate,#tka-gate,#wellness-modal,#agentBreakModal,#autolock-overlay,#logoutOverlay,#agent-notes-modal,#tl-edit-modal';
  function blocked() {
    var l = document.querySelectorAll(BLOCKERS);
    for (var k = 0; k < l.length; k++) { var cs = getComputedStyle(l[k]); var r = l[k].getBoundingClientRect(); if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) return true; }
    return false;
  }
  function goLookup() {
    try { if (typeof sbAgent === 'function') sbAgent('talerts', document.getElementById('sb-agent-talerts')); else if (typeof switchAgentSection === 'function') switchAgentSection('talerts', document.getElementById('agent-tab-talerts')); } catch (e) {}
    try { if (window.TA && TA.alertsTabs) TA.alertsTabs(); } catch (e) {}
    var tabs = document.querySelectorAll('#tka-alerts-tabs .tka-tab');
    if (tabs[1] && !tabs[1].classList.contains('on')) tabs[1].click();
  }
  function sample(kind) {
    if (kind === 'guide') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, ['Phone issue', 'EHR not syncing', 'Billing'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'YOU CAN START WITH' }), h('p', { text: '"I can see your phone history, let me check the line now."' }), h('small', { text: 'CHECK FIRST' }), h('p', { text: 'Is the line online? Which devices are affected?' })])]);
    if (kind === 'history') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag bad', text: 'Escalated (Tier 2)' }), h('span', { class: 'ct-s-who', text: 'Owner: a named person, with the date it started' })]),
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag', text: '2 open' }), h('span', { class: 'ct-tag', text: '61 tickets' }), h('span', { class: 'ct-tag', text: 'Last: #413539' })]),
      h('div', { class: 'ct-s-bar' }, [h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i'), h('i')])]);
    if (kind === 'ticket') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag', text: '#413707' }), h('span', { class: 'ct-tag', text: 'Web' }), h('span', { class: 'ct-s-who', text: 'Waiting on: us' })]),
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-chip on', text: 'Email reply' }), h('span', { class: 'ct-chip', text: 'Call guide (on request)' })]),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'DRAFT REPLY' }), h('p', { text: 'Hi, thanks for your patience. I checked the sync and here is what we did next...' }), h('small', { text: 'BASED ON' }), h('p', { text: 'Similar solved ticket, recent process update' })])]);
    if (kind === 'gtabs') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, ['VoIP support', 'AI support', 'Ask AI'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'SEARCH THE VOIP GUIDE' }), h('p', { text: '"one way audio"  3 matches in 2 sections. Press Enter for the next one.' })])]);
    if (kind === 'gask') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, ['All guides', 'VoIP only', 'AI only'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'YOUR QUESTION' }), h('p', { text: 'Calls drop after 30 seconds, what should I check?' }), h('small', { text: 'FROM THE GUIDE' }), h('p', { text: 'A short answer, a link to the section it came from, and past tickets like #409238 that open in Zoho Desk.' })])]);
    if (kind === 'qacard') return h('div', { class: 'ct-sample' }, [
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag', text: 'Scenario' }), h('span', { class: 'ct-tag', text: 'Survey' })]),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'THE AI ASKS' }), h('p', { text: 'The agent closes the ticket and ends the call without the survey pitch. Fatal, a Call Closing miss, or neither?' }),
        h('small', { text: 'A FULL ANSWER COVERS' }), h('p', { text: 'The decision · when it applies · exceptions' })])]);
    if (kind === 'qafollow') return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-guide' }, [h('small', { text: 'YOU' }), h('p', { text: 'Not fatal.' }),
      h('small', { text: 'AI FOLLOW-UP' }), h('p', { text: 'Thanks. Does Call Closing lose points instead, and is there any case where a missing survey is fatal?' })])]);
    if (kind === 'qarule') return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-guide' }, [h('small', { text: 'THE RULE THE AI WILL FOLLOW' }),
      h('p', { text: 'A missing survey pitch is never fatal. On first contact resolution calls the agent closed, mark Call Closing missed.' })]),
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-chip on', text: 'Confirm rule' }), h('span', { class: 'ct-chip', text: 'Not right, explain more' })])]);
    if (kind === 'lanes') return h('div', { class: 'ct-sample' }, [h('ul', { class: 'ct-lanes' }, [
      ['BRB', 'A quick step away, like water or the restroom.', 'BRB Out, then BRB In'],
      ['Break', 'Your planned break.', 'Break Out, then Break In'],
      ['Training', 'Training or a coaching session with your lead.', 'Training Out, then In'],
      ['QA AUX', 'An audit review or calibration session.', 'QA Session Out, then In'],
      ['Internal', 'An internal call or team huddle.', 'Internal Calls Out, then In']].map(function (l) { return h('li', null, [h('b', { text: l[0] }), h('span', null, [l[1] + ' ', h('em', { text: l[2] })])]); }))]);
    if (kind === 'compose') return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-guide' }, [
      h('small', { text: 'TYPE THE QUESTION' }), h('p', { class: 'ct-q', text: isPay() ? 'Practice says the payout from last Friday has not reached their bank.' : 'Patients say they are not getting appointment reminder texts.' }),
      h('small', { text: 'OR PASTE A TICKET NUMBER' }), h('p', { class: 'ct-q', text: '#412345   (Expert reads the ticket, the earlier tickets and the account)' })]),
      h('div', { class: 'ct-s-row' }, [h('span', { class: 'ct-tag', text: 'Attach a screenshot' }), h('span', { class: 'ct-tag', text: 'Mic' }), h('span', { class: 'ct-tag', text: 'Auto, Fast or Thinking' })])]);
    if (kind === 'channel') return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-row' }, [['1', 'On a call', 'call'], ['2', 'Ticket (email)', 'email'], ['3', 'Live chat', 'chat'], ['4', 'Just for me', 'me']].map(function (c) {
      var on = isPay() ? (c[2] === 'call' || c[2] === 'email') : c[2] === 'email';
      return h('span', { class: 'ct-chip' + (on ? ' on' : ''), text: c[0] + '  ' + c[1] });
    })), h('div', { class: 'ct-s-guide' }, [h('small', { text: 'WHAT YOU GET' }), h('p', { text: 'Call: a talk track to read out. Email: a ready to send reply. Chat: short messages. Just for me: the answer and steps only.' })])]);
    if (kind === 'anatomy') return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-row' }, ['Answer', 'Steps', 'What to say or send', 'Check first', 'Owner', 'Screenshots', 'Sources'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i < 3 ? ' on' : ''), text: t }); })),
      h('div', { class: 'ct-s-guide' }, [h('small', { text: 'PRIVATE NOTE' }), h('p', { text: 'Anything only you should see (internal steps, known issues) stays in a private note, never in the client reply.' })])]);
    if (kind === 'after') return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-row' }, ['Ask a follow-up', 'For call', 'For email', 'Thumbs up or down', 'Share', 'Refresh answer'].map(function (t, i) { return h('span', { class: 'ct-chip' + (i === 0 ? ' on' : ''), text: t }); }))]);
    var tm = /^today(\d)$/.exec(kind || '');
    if (tm) return todaySample(Number(tm[1]));
    if (kind === 'pickq') return pickSample();
    return null;
  }
  // Batch 381: welcome tour helpers. The sample questions are the biggest themes in the person's own team's tickets today.
  function isPay() { return window.__ws === 'aditpay' || document.body.classList.contains('ws-aditpay'); }
  var CHANS = [['email', 'Ticket (email)'], ['call', 'On a call'], ['answer', 'Just for me']];
  T.prefill = '';
  function loadToday() {
    if (T._todayP) return T._todayP;
    T._todayP = api('/api/guides/expert/top-today').then(function (r) {
      if (r && r.success && r.items && r.items.length) { T.today = r; if (r.building || r.items.some(function (x) { return !x.answer; })) setTimeout(function () { T._todayP = null; }, 20000); }
      else T._todayP = null;
      return T.today;
    }).catch(function () { T._todayP = null; return T.today; });
    return T._todayP;
  }
  function prefillBtn(q) {
    var b = h('button', { type: 'button', class: 'ct-mini', 'aria-pressed': String(T.prefill === q), onclick: function () { T.prefill = T.prefill === q ? '' : q; b.setAttribute('aria-pressed', String(T.prefill === q)); b.textContent = T.prefill === q ? 'Waiting in Expert after the tour' : 'Put this in Expert after the tour'; } });
    b.textContent = T.prefill === q ? 'Waiting in Expert after the tour' : 'Put this in Expert after the tour';
    return b;
  }
  function todaySample(n) {
    var d = T.today, x = d && d.items && d.items[n];
    if (!x) return h('div', { class: 'ct-sample' }, [h('p', { class: 'ct-wait', text: 'Loading today’s questions for your team...' })]);
    var ch = CHANS[n % CHANS.length], a = x.answer;
    var head = (d.live ? 'TOP ISSUE ' + (n + 1) + (d.hours > 24 ? ' THIS WEEK' : ' TODAY') : 'COMMON QUESTION ' + (n + 1)) + (x.topic ? ' · ' + x.topic.toUpperCase() : '') + (d.live && x.n ? ' · ' + x.n + ' TICKET' + (x.n === 1 ? '' : 'S') : '');
    return h('div', { class: 'ct-sample' }, [h('div', { class: 'ct-s-guide' }, [
      h('small', { text: head }),
      h('small', { text: '1. YOU TYPE' }), h('p', { class: 'ct-q', text: x.q }),
      h('small', { text: '2. YOU PICK' }), h('div', { class: 'ct-s-row' }, CHANS.map(function (c) { return h('span', { class: 'ct-chip' + (c === ch ? ' on' : ''), text: c[1] }); })),
      h('small', { text: '3. EXPERT ANSWERS (SHORT VERSION)' }),
      a && a.text ? h('p', { class: 'ct-ans', text: a.text }) : h('p', { class: 'ct-wait', text: 'Expert is still preparing today’s answer. Ask it yourself after the tour to see the full answer, with the reply written for your channel.' }),
      a && a.steps && a.steps.length ? h('ol', { class: 'ct-ans-steps' }, a.steps.map(function (s) { return h('li', { text: s }); })) : null,
      a && a.sources ? h('small', { text: 'BASED ON ' + a.sources + ' SOURCE' + (a.sources === 1 ? '' : 'S') + ', CHECKED BY A SECOND AI' }) : null]),
      prefillBtn(x.q)]);
  }
  function pickSample() {
    var d = T.today; if (!d || !d.items) return null;
    var box = h('div', { class: 'ct-qpick', role: 'group', 'aria-label': 'Question to have ready in Expert' });
    function paint() {
      box.replaceChildren(h('small', { text: 'HAVE ONE READY IN EXPERT (OPTIONAL)' }));
      d.items.forEach(function (x) { box.appendChild(h('button', { type: 'button', 'aria-pressed': String(T.prefill === x.q), text: x.q, onclick: function () { T.prefill = T.prefill === x.q ? '' : x.q; paint(); } })); });
    }
    paint();
    return h('div', { class: 'ct-sample' }, [box]);
  }
  function onBreaks() { var p = document.getElementById('agent-section-breakbot'); if (!p || p.offsetParent === null) goBreaks(); }
  function goBreaks() { try { if (typeof sbAgent === 'function') sbAgent('breakbot', document.getElementById('sb-agent-breakbot')); } catch (e) {} }
  // After the tour: open Expert and put the chosen question in its box (it is not sent).
  function openPrefill() {
    var q = T.prefill; T.prefill = ''; if (!q) return;
    goGuides();
    var n = 0, tm = setInterval(function () {
      var fr = document.querySelector('#agent-section-guides iframe');
      try { if (fr && fr.contentDocument && fr.contentDocument.querySelector('.ax-comp textarea')) { fr.contentWindow.postMessage({ type: 'ax-prefill', q: q }, location.origin); clearInterval(tm); return; } } catch (e) {}
      if (++n > 25) clearInterval(tm);
    }, 800);
  }
  // Admins and named reviewers can replay the QA tour from the profile menu once they can see Teach AI.
  function canTeach() { var el = document.getElementById('sb-agent-qateach'); return !!(el && !el.classList.contains('ap-hidden')) || (typeof currentRole !== 'undefined' && currentRole === 'admin'); }
  function goTeach() { try { if (typeof sbAgent === 'function') sbAgent('qateach', document.getElementById('sb-agent-qateach')); } catch (e) {} }
  function goCallQa() { try { if (typeof sbAgent === 'function') sbAgent('callqa', document.getElementById('sb-agent-callqa')); } catch (e) {} }
  function isQa() { return typeof currentRole === 'string' && currentRole.toLowerCase() === 'qa'; }
  function goGuides() {
    try { if (typeof sbAgent === 'function') sbAgent('guides', document.getElementById('sb-agent-guides')); } catch (e) {}
  }
  var CL_STEPS = [
    { title: 'Meet Client lookup', text: 'New on your Tkt Alerts page. Before you answer a call, find the client and see what we already know about them: who they are, whether they are escalated, what is open, and what was said before.', mark: 'NEW' },
    { title: 'Open it from Tkt Alerts', text: 'Your sidebar tile for ticket alerts is now called Tkt Alerts. Client lookup is the second tab on that page.', target: '#sb-agent-talerts', side: 'right' },
    { title: 'Search any way the client gives it', text: 'Type a ticket number, deal name, account name, phone number or email. If there is one match it opens straight away, otherwise pick the right client from the list.', target: '.tka-cl-q', side: 'bottom', before: goLookup },
    { title: 'Tell it why they are calling', text: 'After you open a client, write what the call is about, or tap a topic. You get earlier tickets and conversations on that topic, known issues, and suggested checks with what you can say and do.', sample: 'guide' },
    { title: 'Got a ticket number? Get the next step', text: 'Search a ticket number and the page also reads that ticket and suggests the best next step. Email and web tickets get an email reply draft, always. Phone tickets get a call guide. Need the other one? Use the button on the panel, for example when the client asks for a call. It draws on similar solved tickets and recent updates, and lists what it used.', sample: 'ticket' },
    { title: 'Check the history first', text: 'The top of the page shows the escalation status and its owner, open tickets, the last ticket, and the full support history. If the client is escalated, keep the escalation owner informed.', sample: 'history' },
    { title: 'Use it as help, not a script', text: 'The suggestions come from our records and AI, so confirm every detail with the client. Do not read internal notes or escalation details out to the client, and do not promise a fix or a time you cannot guarantee.', last: true }
  ];
  var GD_STEPS = [
    { title: 'Meet Support guides', text: 'The VoIP support guide and the AI support runbook now live inside the tool, with Ask AI to find answers quickly while you are on a ticket or a call.', mark: 'NEW' },
    { title: 'Open it from Guides', text: 'Guides is in your sidebar. It opens the guides right here in the tool, so you do not need another tab or file.', target: '#sb-agent-guides', side: 'right' },
    { title: 'Two guides, one place', text: 'VoIP support covers phone setup, troubleshooting and the query catalog. AI support is the AI runbook. Use the search box on the left to jump to every match; press Enter for the next one.', sample: 'gtabs', before: goGuides },
    { title: 'Ask AI for a quick answer', text: 'Open the Ask AI tab and type the question the way the client put it. Choose All guides, VoIP only or AI only. Answers come only from the guides and link to the section they came from.', sample: 'gask' },
    { title: 'Ticket numbers open in Zoho Desk', text: 'Ticket numbers in the guides and in Ask AI answers are links. Click one to open that ticket in Zoho Desk and see how it was handled.' },
    { title: 'Check before you act', text: 'Open the linked section before you act on a live call, and confirm details with the client. If the guides do not cover the issue, Ask AI says so; follow the usual process and escalate when needed.', last: true }
  ];
  function visibleSidebar() {
    var a = document.getElementById('adit-admin-sidebar'), b = document.getElementById('adit-agent-sidebar');
    if (a && getComputedStyle(a).display !== 'none') return a;
    return b && getComputedStyle(b).display !== 'none' ? b : null;
  }
  var HD_STEPS = [
    { title: 'Getting around', text: 'A quick look at the header, your profile menu and the sidebar, so you can find anything in the tool in a couple of clicks.', mark: 'TOUR' },
    { title: 'Clock and time zone', text: 'The live clock shows the time in the zone you pick. Switch between CST and IST here; times across the tool follow your choice.', target: '#hmTime', side: 'bottom' },
    { title: 'Notifications', text: 'The bell collects announcements, what is new in the tool, assessment updates and items meant just for you. A number shows what you have not read.', target: '#ncBell', side: 'bottom' },
    { title: 'Your profile menu', text: 'Click your name to replay any tour, jump to any page, search everything, see keyboard shortcuts, turn on dark mode or sign out. Admins also switch between admin and agent view here.', target: '#hmMe', side: 'bottom' },
    { title: 'Your pages', text: 'Every page you can open is in the sidebar on the left. The highlighted item is the page you are on.', target: visibleSidebar, side: 'right' },
    { title: 'Search from anywhere', text: 'Press Ctrl K (or /) on any page to search pages and actions, and press ? to see all keyboard shortcuts.', last: true }
  ];
  // Batch 267: for QA reviewers. What the role is for, and the daily Teach the AI task.
  var QA_STEPS = [
    { title: 'Welcome, QA reviewer', text: 'An AI now audits every recorded T1 call with the QA rubric. Your job here is to teach it to score calls the way you do, so it can take over routine audits. You see only the pages you need for that.', mark: 'QA' },
    { title: 'Your daily task: Teach AI', text: 'Every working day, spend about 30 minutes in Teach AI. It is your home page and is always in your sidebar.', target: '#sb-agent-qateach', side: 'right' },
    { title: '8 questions a day', text: 'The AI writes them from what it gets wrong most: short made-up scenarios, and real calls where its score and the human QA score were far apart. Each one shows what a full answer must cover.', sample: 'qacard', before: goTeach },
    { title: 'Answer in your own words', text: 'Say what you decide, when it applies and the exceptions. If the answer is vague, the AI asks a follow-up. Keep answering until it says it has enough. Questions cannot be skipped: each day the rest of the tool opens once all of them are done. Real calls show the CRM Call Audit ID so you can open the audit in CRM.', sample: 'qafollow' },
    { title: 'Confirm the rule', text: 'The AI then writes the rule it will follow. Edit it if the wording is off, then confirm. Confirmed rules change the audits straight away. If your rule differs from another reviewer\u2019s, an admin decides which one stays.', sample: 'qarule' },
    { title: 'Watch your progress', text: 'The top of Teach AI shows how many questions you have done today, the rules you taught, and how close the AI now is to human QA. The aim is 80% of calls within 10 points and 95% agreement on fatals.', target: '.cqt-stats', side: 'bottom', before: goTeach },
    { title: 'Call QA: check and correct', text: 'Call QA shows every AI audit with the transcript and the AI\u2019s reasons. If the AI got an item wrong, correct it and write why. Corrections teach it too.', target: '#sb-agent-callqa', side: 'right' },
    { title: 'Be specific and consistent', text: 'Teach the rule you actually apply, not the exception. Give numbers where they matter (for example how many seconds is dead air). Never paste a caller\u2019s phone number or email into an answer.', last: true }
  ];
  // Batch 381: first sign-in tour for every agent (T1 and Adit Pay): pages, Breaks in detail, and Adit Expert in detail
  // with three questions taken from the person's own team's tickets today.
  var WX_STEPS = [
    { title: 'Welcome to the tool', mark: 'WELCOME', text: function () { return 'This tour takes about 5 minutes. It shows where your pages are, how to log your shift and breaks, and how to get answers from Adit Expert, using real questions from ' + (isPay() ? 'the Adit Pay team’s' : 'your team’s') + ' tickets today. Each step pauses briefly so you have time to read it.'; } },
    { title: 'Your pages', target: visibleSidebar, side: 'right', text: 'Everything you can open is in the sidebar. Home is your day at a glance, Breaks is your shift log, My Stats has your numbers, Tkt Alerts has ticket alerts and Client lookup, Updates has product and process news, Tests has your assessments, and Expert answers your questions.' },
    { title: 'Your profile menu', target: '#hmMe', side: 'bottom', text: 'Click your name to replay this tour or any other, search the whole tool, see keyboard shortcuts, turn on dark mode or sign out.' },
    { title: 'Breaks: your shift log', target: '#sb-agent-breakbot', side: 'right', text: 'Breaks (Break Bot) is where you log your shift: when you start, each time you step away, and when you finish. Your lead and the team see it live, so keep it accurate.' },
    { title: 'Step 1: start with Logged In', before: goBreaks, target: '[data-break-action="LOGGED_IN"]', side: 'right', text: 'Every shift starts here. Until you press Logged In, every other button stays locked. Press it once when you are at your desk and ready to take work.' },
    { title: 'Your status at a glance', before: onBreaks, target: '.bbn-status-card', side: 'bottom', text: 'This card shows the lane you are in (Logged In, BRB, Break and so on), since when, and what you can do next. If you press a button that is not allowed in your lane, the tool tells you which one to use instead.' },
    { title: 'Stepping away: Out, then In', before: onBreaks, target: '.break-actions', side: 'right', sample: 'lanes', text: 'Each away lane has an Out button and an In button. Press Out when you leave and In as soon as you are back. You can move straight from one lane to another, for example from BRB to Break, without coming back first.' },
    { title: 'Your daily break budget', before: onBreaks, target: '.bbn-budget-section', side: 'bottom', text: 'Today’s Break Budget fills as you use it: BRB has 10 minutes a day and Break has 30 minutes a day. Training, QA and internal call time is tracked separately and does not use your break budget.' },
    { title: 'scrin.io keeps it in step', before: onBreaks, target: '#break-self-status', side: 'bottom', text: 'If scrin.io shows you away or offline while you are logged in, the tool moves you to Away (scrin.io) by itself. Start tracking in scrin.io again and you go back to Logged In automatically. Keep scrin.io running for your whole shift.' },
    { title: 'Floor Signal and your log', before: onBreaks, target: '.bbn-right', side: 'bottom', text: 'Floor Signal shows who on your team is live or away right now. Your Break Log lists every button you pressed today with the time, so you can check your day.' },
    { title: 'End of shift: Logged Out', before: onBreaks, target: '[data-break-action="LOGGED_OUT"]', side: 'right', text: 'When your shift ends, press Logged Out. You may be asked to leave a handoff note for the next shift. If you missed a button during the day, let your lead know.' },
    { title: 'Meet Adit Expert', target: '#sb-agent-guides', side: 'right', text: function () { return 'Expert answers questions about every Adit product for any client situation. It reads the Help Center, the internal guides, your team’s rules and how similar tickets, chats and calls were solved, and a second AI checks every answer.' + (isPay() ? ' For the Adit Pay team it looks at Adit Pay first.' : ''); } },
    { title: 'Ask it the way the client said it', before: goGuides, sample: 'compose', text: 'Type or paste what the client asked, in their words. Or paste a ticket number or a Desk link: Expert reads the ticket, the client’s earlier tickets and the account, then suggests the next step. You can attach a screenshot or a file, or use the mic.' },
    { title: 'Pick where the client is', sample: 'channel', text: function () { return 'Without a ticket number, Expert asks where the client is so the reply fits. Press 1 to 4 or click a tile. With a ticket number, it uses the ticket’s channel by itself.' + (isPay() ? ' Your team works calls and tickets, so you will mostly pick On a call or Ticket (email).' : ''); } },
    { title: 'How every answer is laid out', sample: 'anatomy', text: 'Each answer has the same parts: a short answer, the steps, what to say or send, what to check first, who owns it if it has to go further, and the sources it used. Screenshots from the guides appear when they help, and each part has a copy button.' },
    { title: 'Try it: today’s top issue 1', sample: 'today0', text: 'This is one of the biggest themes in your team’s tickets today. Here is what you would type, the channel you would pick, and a short version of what Expert answered.' },
    { title: 'Try it: today’s top issue 2', sample: 'today1', text: 'A second theme from today. Notice the answer gives steps you can follow while the client waits.' },
    { title: 'Try it: today’s top issue 3', sample: 'today2', text: 'A third one. When you ask it yourself, the answer is written for the channel you pick, ready to say or send.' },
    { title: 'Follow up, switch and rate', sample: 'after', text: 'Ask a follow-up in the same box; Expert keeps the conversation. Need it for another channel? Use For call or For email under the answer. Thumbs up or down teaches it, and with a thumbs down say what was wrong. Share copies a link for a colleague.' },
    { title: 'Use it well', last: true, sample: 'pickq', text: 'Confirm details with the client before you act, and open the linked source for anything unusual. Never share internal notes, outages or app issues with clients. If Expert is not sure, it says so: follow the process and ask your lead. You can pick one of today’s questions to have it ready in Expert.' }
  ];
  var TOURS = [
    { id: 'welcome-expert', title: 'Expert and Breaks', blurb: 'Your shift log and how to use Adit Expert', icon: 'guides', agent: true, noQa: true, page: 'sb-agent-guides', steps: WX_STEPS, ack: ' I understand how to log my shift and breaks and how to use Adit Expert', toast: 'You are all set. Replay this tour any time from your profile menu.', after: openPrefill, prep: loadToday },
    { id: 'qa-teach', title: 'Teach the AI (QA)', blurb: 'What the QA role does and the daily task', icon: 'guides', agent: true, qa: true, steps: QA_STEPS, ack: ' I understand my daily Teach the AI task', toast: 'Teach AI is ready. About 30 minutes a day.' },
    { id: 'client-lookup', title: 'Client lookup', blurb: 'Find a client before you answer', icon: 'lookup', agent: true, noQa: true, steps: CL_STEPS, ack: ' I understand how to use Client lookup', toast: 'Client lookup is ready to use under Tkt Alerts' },
    { id: 'support-guides', title: 'Support guides', blurb: 'VoIP and AI guides with Ask AI', icon: 'guides', agent: true, noPay: true, page: 'sb-agent-guides', steps: GD_STEPS, ack: ' I understand how to use Support guides', toast: 'Support guides are ready under Guides in your sidebar' },
    { id: 'getting-around', title: 'Getting around', blurb: 'Header, profile menu and sidebar', icon: 'header', optional: true, steps: HD_STEPS, toast: 'Tour finished. Replay it any time from your profile menu.' }
  ];

  function start(tour, then, replay) {
    if (T.running || document.getElementById('ct-root')) return;
    T.running = true;
    var STEPS = tour.steps, ID = tour.id;
    if (tour.prep) { try { tour.prep(); } catch (e) {} }
    var i = 0, timer = null;
    var ring = h('div', { class: 'ct-ring' });
    var back = h('div', { class: 'ct-back' });
    var title = h('h2', { id: 'ct-t' }), text = h('p', { class: 'ct-text' }), extra = h('div', { class: 'ct-extra' });
    var dots = h('div', { class: 'ct-dots' + (STEPS.length > 12 ? ' many' : ''), 'aria-hidden': 'true' }, STEPS.map(function () { return h('i'); }));
    var ack = h('input', { type: 'checkbox', id: 'ct-ack' });
    var ackRow = h('label', { class: 'ct-ack', for: 'ct-ack' }, [ack, tour.ack || ' I understand']);
    var err = h('p', { class: 'ct-err', role: 'alert' });
    var prev = h('button', { type: 'button', class: 'ct-btn', text: 'Back' });
    var next = h('button', { type: 'button', class: 'ct-btn primary' });
    var card = h('div', { class: 'ct-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ct-t', tabindex: '-1' }, [h('div', { class: 'ct-top' }, [h('span', { class: 'ct-pill', text: replay ? 'Tour' : 'New feature' }), h('span', { class: 'ct-top-r' }, [h('span', { class: 'ct-count' }), replay ? h('button', { type: 'button', class: 'ct-x', 'aria-label': 'Close tour', title: 'Close tour (Esc)', text: '\u00d7', onclick: function () { finish(false); } }) : null])]), title, text, extra, ackRow, err, h('div', { class: 'ct-foot' }, [dots, h('div', { class: 'ct-btns' }, [prev, next])])]);
    var root = h('div', { class: 'ct-root', id: 'ct-root' }, [back, ring, card]);
    document.body.appendChild(root); document.body.classList.add('ct-lock');
    function block(e) { if (!card.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }
    ['mousedown', 'click', 'touchstart'].forEach(function (ev) { root.addEventListener(ev, block, true); });
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (replay) finish(false); return; }
      if (e.key === 'Tab') {
        var f = card.querySelectorAll('button:not([disabled]), input:not([disabled])'); if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1];
        if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    function place() {
      var s = STEPS[i], el = s.target ? (typeof s.target === 'function' ? s.target() : document.querySelector(s.target)) : null;
      if (el && el.offsetParent !== null) {
        try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
        var r = el.getBoundingClientRect(), pad = 8;
        ring.style.cssText = 'display:block;left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
        back.style.display = 'none';
        var cw = Math.min(card.offsetWidth || 420, window.innerWidth - 24), ch = card.offsetHeight || 260, left, top;
        if (s.side === 'right' && r.right + cw + 24 < window.innerWidth) { left = r.right + 20; top = Math.max(12, Math.min(r.top, window.innerHeight - ch - 12)); }
        else { left = Math.max(12, Math.min(r.left, window.innerWidth - cw - 12)); top = r.bottom + 20; if (top + ch > window.innerHeight - 12) top = Math.max(12, r.top - ch - 20); }
        card.classList.add('pos'); card.style.cssText = 'left:' + left + 'px;top:' + top + 'px';
      } else {
        ring.style.display = 'none'; back.style.display = 'block'; card.classList.remove('pos'); card.style.cssText = '';
      }
    }
    function show() {
      var s = STEPS[i];
      clearTimeout(timer);
      if (s.before) { try { s.before(); } catch (e) {} }
      title.textContent = typeof s.title === 'function' ? s.title() : s.title; text.textContent = typeof s.text === 'function' ? s.text() : s.text; extra.replaceChildren(); var sm = s.sample ? sample(s.sample) : null; if (sm) extra.appendChild(sm);
      // Batch 381: today's questions arrive after the tour opens; fill the sample in when they do.
      if (s.sample && /^(today\d|pickq)$/.test(s.sample) && tour.prep) { var at = i; Promise.resolve(tour.prep()).then(function () { if (i !== at || !document.getElementById('ct-root')) return; var again = sample(s.sample); extra.replaceChildren(); if (again) extra.appendChild(again); place(); }); }
      card.querySelector('.ct-count').textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
      Array.prototype.forEach.call(dots.children, function (d, n) { d.className = n === i ? 'on' : n < i ? 'past' : ''; });
      prev.style.visibility = i ? 'visible' : 'hidden';
      ackRow.style.display = s.last && !replay ? '' : 'none'; err.textContent = '';
      next.textContent = s.last ? 'Finish' : 'Next';
      // A short pause on each step so the tour is read, not clicked through.
      var wait = i === 0 || replay ? 0 : 1500; next.disabled = true;
      function ready() { next.disabled = s.last && !replay ? !ack.checked : false; }
      timer = setTimeout(ready, wait); ack.onchange = ready;
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      setTimeout(function () { place(); try { (next.disabled ? card : next).focus({ preventScroll: true }); } catch (e) {} }, s.before ? 450 : 30);
    }
    prev.addEventListener('click', function () { if (i) { i--; show(); } });
    next.addEventListener('click', function () {
      if (i < STEPS.length - 1) { i++; show(); return; }
      next.disabled = true; err.textContent = '';
      api('/api/tours/' + ID + '/done', {}).then(function (r) {
        if (r && r.success) finish(true);
        else if (replay) finish(true);
        else { err.textContent = 'Could not save that. Check your connection and press Finish again.'; next.disabled = false; }
      }).catch(function () {
        if (replay) { finish(true); return; }
        err.textContent = 'Could not save that. Check your connection and press Finish again.'; next.disabled = false;
      });
    });
    function finish(completed) {
      clearTimeout(timer); clearInterval(watch); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place);
      root.remove(); document.body.classList.remove('ct-lock'); T.running = false;
      if (completed) { try { if (typeof showToast === 'function') showToast(tour.toast, 'success'); } catch (e) {} }
      if (completed && tour.after) { try { tour.after(); } catch (e) {} }
      if (then) setTimeout(then, 1200);
    }
    window.addEventListener('resize', place);
    // If another pop-up appears while the tour is open (for example the mood check-in), step aside until it is dismissed.
    var hidden = false, watch;
    watch = setInterval(function () {
      if (!document.getElementById('ct-root')) { clearInterval(watch); return; }
      var b = blocked();
      if (b && !hidden) { hidden = true; root.style.visibility = 'hidden'; }
      else if (!b && hidden) { hidden = false; root.style.visibility = ''; place(); }
    }, 400);
    show();
  }

  T.list = function () { return TOURS.filter(function (t) { return (!t.noPay || !isPay()) && (isQa() ? !t.noQa : (!t.qa || canTeach())); }).map(function (t) { return { id: t.id, title: t.title, blurb: t.blurb, icon: t.icon, steps: t.steps.length, status: true }; }); };
  T.status = function (id) { return api('/api/tours/' + id + '/status').then(function (r) { return !!(r && r.success && r.done); }); };
  // Replay from the profile menu: can be closed at any time. Agent tours open agent view first.
  T.replay = function (id) {
    var t = TOURS.filter(function (x) { return x.id === id; })[0];
    if (!t || T.running) return;
    var admin = typeof currentRole !== 'undefined' && currentRole === 'admin';
    var inAdminView = admin && typeof currentViewMode !== 'undefined' && currentViewMode === 'admin';
    if (t.agent && inAdminView && typeof toggleView === 'function') { toggleView(); return setTimeout(function () { start(t, null, true); }, 900); }
    start(t, null, true);
  };
  // Wait for the update and review screens that appear at sign-in, then check whether this person has finished the tour.
  T.maybe = function (role) {
    if (T.checked || T.running || role === 'assessment') return;
    var inAgentView = role === 'agent' || role === 'qa' || (typeof currentViewMode !== 'undefined' && currentViewMode === 'agent');
    if (!inAgentView) return;
    T.checked = true;
    var tries = 0;
    (function wait() {
      // Give the other sign-in pop-ups (the mood check-in appears about 4 seconds after sign-in) time to show up first, then wait for them to close.
      if ((performance.now() < 9000 || blocked()) && tries++ < 1800) return setTimeout(wait, 800);
      next(0);
    })();
    // Run each unfinished tour in turn, oldest first.
    function next(k) {
      if (k >= TOURS.length) return;
      if (TOURS[k].optional) return next(k + 1);
      // The QA tour runs for the QA role only; agent-only tours are skipped for it.
      if (TOURS[k].qa && !isQa()) return next(k + 1);
      if (TOURS[k].noQa && isQa()) return next(k + 1);
      if (TOURS[k].noPay && isPay()) return next(k + 1);
      // Batch 269: skip a tour whose page this person cannot open (it bounced them between pages). It runs once the page is given to them.
      if (TOURS[k].page) { var pg = document.getElementById(TOURS[k].page); if (!pg || pg.classList.contains('ap-hidden')) return next(k + 1); }
      api('/api/tours/' + TOURS[k].id + '/status').then(function (r) {
        if (r && r.success && !r.done) start(TOURS[k], function () { next(k + 1); });
        else if (r && r.success) next(k + 1);
        else T.checked = false;
      }).catch(function () { T.checked = false; });
    }
  };
})();
