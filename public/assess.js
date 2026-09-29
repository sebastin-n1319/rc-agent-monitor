/* Session 56: Assessments page (/assess).
 * Takers: assigned tests, a rules screen, then one question at a time.
 * Question text is drawn on a canvas as a rolling fade (only a few word
 * groups visible at once), options are drawn on canvases too, and a tiled
 * watermark with the taker's name covers the screen. Timing and grading
 * happen on the server. Reviewers also get test settings, results,
 * answer detail, explanation marking and CSV export. */
(function () {
  'use strict';

  var main = document.getElementById('as-main');
  var nav = document.getElementById('as-nav');
  var userBox = document.getElementById('as-user');
  var me = null;
  var view = 'tests';

  // ── helpers ──────────────────────────────────────────────────────────
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.token) headers['X-Assess-Token'] = opts.token;
    return fetch(path, { method: opts.method || 'GET', credentials: 'same-origin', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return { success: false, error: 'HTTP ' + r.status }; }).then(function (j) {
          if (r.status === 401) { location.replace('/?next=/assess'); throw new Error('Please sign in'); }
          if (!r.ok || j.success === false) { var e = new Error(j.error || ('HTTP ' + r.status)); e.code = j.code; e.status = r.status; throw e; }
          return j;
        });
      });
  }
  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CST';
  }
  function secs(ms) { return ms == null ? '' : (Math.round(ms / 100) / 10) + 's'; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function errBox(msg) { return h('p', { class: 'as-err', role: 'alert', text: msg }); }

  // ── boot ─────────────────────────────────────────────────────────────
  function boot() {
    api('/api/assess/me').then(function (j) {
      me = j;
      renderUser();
      renderNav();
      show('tests');
    }).catch(function (e) {
      if (/sign in/i.test(e.message)) return;
      clear(main); main.appendChild(errBox('Could not load assessments: ' + e.message));
    });
  }
  function renderUser() {
    clear(userBox);
    if (me.picture) userBox.appendChild(h('img', { src: me.picture, alt: '', referrerpolicy: 'no-referrer' }));
    userBox.appendChild(h('span', { text: me.name || me.email, title: me.email }));
    if (me.member) userBox.appendChild(h('a', { class: 'as-link', href: '/', text: 'Back to tool' }));
    userBox.appendChild(h('button', { class: 'as-link', type: 'button', text: 'Sign out', onclick: function () {
      fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).finally(function () {
        try { localStorage.removeItem('rcSession'); sessionStorage.clear(); } catch (e) {}
        location.replace('/?next=/assess');
      });
    } }));
  }
  function renderNav() {
    clear(nav);
    var items = [['tests', 'My assessments']];
    if (me.reviewer) items.push(['review', 'Review'], ['reviewers', 'Reviewers']);
    if (items.length < 2) return;
    items.forEach(function (it) {
      nav.appendChild(h('button', { type: 'button', 'aria-current': view === it[0] ? 'page' : null, text: it[1], onclick: function () { show(it[0]); } }));
    });
  }
  function show(v, arg) {
    view = v; renderNav(); clear(main); main.focus();
    if (v === 'tests') return viewTests();
    if (v === 'rules') return viewRules(arg);
    if (v === 'review') return viewReview();
    if (v === 'settings') return viewSettings(arg);
    if (v === 'results') return viewResults(arg);
    if (v === 'attempt') return viewAttempt(arg);
    if (v === 'reviewers') return viewReviewers();
  }

  // ── taker: list ──────────────────────────────────────────────────────
  function viewTests() {
    main.appendChild(h('h1', { class: 'as-h1', text: 'My assessments' }));
    main.appendChild(h('p', { class: 'as-sub', text: 'Assessments assigned to you. Each question is timed and there is no going back, so start only when you are ready.' }));
    api('/api/assess/me').then(function (j) {
      me.tests = j.tests;
      if (!j.tests.length) { main.appendChild(h('div', { class: 'as-empty', text: 'No assessments are assigned to you right now.' })); return; }
      var grid = h('div', { class: 'as-grid' });
      j.tests.forEach(function (t) {
        var meta = h('div', { class: 'as-meta' }, [
          h('span', { class: 'as-pill', text: t.questions + ' questions' }),
          h('span', { class: 'as-pill', text: t.secondsPerQuestion + 's each' }),
          t.explainCount ? h('span', { class: 'as-pill', text: t.explainCount + ' written' }) : null,
          h('span', { class: 'as-pill', text: 'Attempts ' + t.attemptsUsed + ' of ' + t.attemptsAllowed }),
        ]);
        var last = null;
        if (t.last) last = h('p', { class: 'as-note', text: 'Last submitted ' + fmtWhen(t.last.finishedAt) + (t.last.score != null ? ', score ' + t.last.score + ' of ' + t.last.maxScore : '') + '.' });
        var btn = h('button', { class: 'as-btn primary', type: 'button', disabled: !t.canStart, text: t.inProgress ? 'Resume' : (t.canStart ? 'Start' : 'No attempts left'),
          onclick: function () { show('rules', t); } });
        grid.appendChild(h('div', { class: 'as-card' }, [h('h2', { text: t.title }), t.description ? h('p', { text: t.description }) : null, meta, last, h('div', { class: 'as-row' }, [btn])]));
      });
      main.appendChild(grid);
    }).catch(function (e) { main.appendChild(errBox(e.message)); });
  }

  // ── taker: rules ─────────────────────────────────────────────────────
  function viewRules(t) {
    var wrap = h('div', { class: 'as-rules' });
    wrap.appendChild(h('h1', { class: 'as-h1', text: t.title }));
    wrap.appendChild(h('p', { class: 'as-sub', text: t.inProgress ? 'You have an attempt in progress. The timer on the current question kept running while you were away.' : 'Read this once before you start.' }));
    var card = h('div', { class: 'as-card' });
    card.appendChild(h('h2', { text: 'How it works' }));
    card.appendChild(h('ol', null, [
      h('li', { text: 'Each question appears a few words at a time and fades as it goes. Use "Replay from start" if you need it again. Replays are recorded.' }),
      h('li', { text: 'You have ' + t.secondsPerQuestion + ' seconds per question. When time runs out, your current selection is submitted and the next question opens. You cannot go back.' }),
      t.explainCount ? h('li', { text: 'At the end you will explain ' + (t.explainCount === 1 ? 'one of your answers' : t.explainCount + ' of your answers') + ' in your own words.' }) : null,
      h('li', { text: 'The test runs in full screen. Leaving the window, switching tabs, copying, pasting or taking screenshots is recorded for your reviewer.' }),
      h('li', { text: 'Reloading the page does not stop the clock, and opening the test in a second tab closes the first one.' }),
    ]));
    var c1 = h('input', { type: 'checkbox', id: 'as-c1' });
    var c2 = h('input', { type: 'checkbox', id: 'as-c2' });
    var start = h('button', { class: 'as-btn primary', type: 'button', disabled: true, text: t.inProgress ? 'Resume in full screen' : 'Start in full screen' });
    function sync() { start.disabled = !(c1.checked && c2.checked); }
    c1.addEventListener('change', sync); c2.addEventListener('change', sync);
    card.appendChild(h('label', { class: 'as-check', for: 'as-c1' }, [c1, h('span', { text: 'I am answering on my own, without help from people, notes, search or AI tools.' })]));
    card.appendChild(h('label', { class: 'as-check', for: 'as-c2' }, [c2, h('span', { text: 'I understand that my activity during the test is recorded and reviewed.' })]));
    var err = h('div');
    card.appendChild(err);
    card.appendChild(h('div', { class: 'as-row' }, [h('button', { class: 'as-btn ghost', type: 'button', text: 'Back', onclick: function () { show('tests'); } }), h('span', { class: 'as-spacer' }), start]));
    start.addEventListener('click', function () {
      start.disabled = true;
      var fs = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen().catch(function () {}) : Promise.resolve();
      fs.then(function () { return api('/api/assess/tests/' + t.id + '/start', { method: 'POST' }); })
        .then(function (j) { runExam(j); })
        .catch(function (e) { clear(err); err.appendChild(errBox(e.message)); start.disabled = false; if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); });
    });
    wrap.appendChild(card);
    main.appendChild(wrap);
  }

  // ── watermark ────────────────────────────────────────────────────────
  var wmTimer = null;
  function drawWatermark() {
    var c = document.getElementById('as-wm');
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    var stamp = (me.name || '') + '  ·  ' + me.email + '  ·  ' + new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CST';
    ctx.fillStyle = cssVar('--as-wm') || 'rgba(0,0,0,.07)';
    ctx.font = '500 14px Poppins, sans-serif';
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.rotate(-0.42);
    var w = ctx.measureText(stamp).width + 90, step = 96, span = Math.hypot(innerWidth, innerHeight);
    for (var y = -span; y < span; y += step) {
      var off = (Math.round(y / step) % 2) * (w / 2);
      for (var x = -span - off; x < span; x += w) ctx.fillText(stamp, x, y);
    }
  }
  function startWatermark() { drawWatermark(); clearInterval(wmTimer); wmTimer = setInterval(drawWatermark, 30000); window.addEventListener('resize', drawWatermark); }
  function stopWatermark() { clearInterval(wmTimer); window.removeEventListener('resize', drawWatermark); }

  // ── canvas text ──────────────────────────────────────────────────────
  function fitCanvas(c, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth || c.parentNode.clientWidth;
    if (cssH) c.style.height = cssH + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round((cssH || c.clientHeight) * dpr);
    var ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: cssH || c.clientHeight };
  }
  function layoutWords(ctx, text, maxW, font, lineH) {
    ctx.font = font;
    var words = String(text).split(/\s+/).filter(Boolean), out = [], x = 0, y = lineH * 0.8, space = ctx.measureText(' ').width;
    words.forEach(function (wd) {
      var ww = ctx.measureText(wd).width;
      if (x > 0 && x + ww > maxW) { x = 0; y += lineH; }
      out.push({ t: wd, x: x, y: y, w: ww }); x += ww + space;
    });
    return { words: out, height: y + lineH * 0.35 };
  }
  function drawStatic(c, text, font, color) {
    var probe = c.getContext('2d');
    var w = c.clientWidth || c.parentNode.clientWidth;
    var lay = layoutWords(probe, text, w, font, 22);
    var f = fitCanvas(c, Math.max(24, lay.height));
    f.ctx.font = font; f.ctx.fillStyle = color; f.ctx.textBaseline = 'alphabetic';
    lay.words.forEach(function (wd) { f.ctx.fillText(wd.t, wd.x, wd.y); });
  }

  /** Rolling fade: chunk i fades in at i*chunkMs, stays while the next
   *  (visibleChunks-1) chunks appear, then fades out. Word positions are
   *  fixed, so it reads left to right like normal text. */
  function FadeText(canvas, text, s, onDone) {
    var font = '500 19px Poppins, sans-serif', lineH = 30;
    var probe = canvas.getContext('2d');
    var w = canvas.clientWidth || canvas.parentNode.clientWidth;
    var lay = layoutWords(probe, text, w, font, lineH);
    var f = fitCanvas(canvas, Math.max(90, lay.height + 8));
    var per = Math.max(1, s.wordsPerChunk), n = Math.ceil(lay.words.length / per);
    var fadeIn = 220, fadeOut = 320, color = cssVar('--as-t1');
    var t0 = 0, raf = 0, finished = false;
    function alphaFor(i, t) {
      var on = i * s.chunkMs, off = (i + s.visibleChunks) * s.chunkMs;
      if (t < on) return 0;
      if (t < on + fadeIn) return (t - on) / fadeIn;
      if (t < off) return 1;
      if (t < off + fadeOut) return 1 - (t - off) / fadeOut;
      return 0;
    }
    function frame(now) {
      if (!t0) t0 = now;
      var t = now - t0;
      f.ctx.clearRect(0, 0, f.w, f.h);
      f.ctx.font = font; f.ctx.textBaseline = 'alphabetic';
      for (var i = 0; i < n; i++) {
        var a = alphaFor(i, t);
        if (a <= 0) continue;
        f.ctx.globalAlpha = a; f.ctx.fillStyle = color;
        for (var k = i * per; k < Math.min(lay.words.length, (i + 1) * per); k++) f.ctx.fillText(lay.words[k].t, lay.words[k].x, lay.words[k].y + 4);
      }
      f.ctx.globalAlpha = 1;
      if (t < (n - 1 + s.visibleChunks) * s.chunkMs + fadeOut) raf = requestAnimationFrame(frame);
      else if (!finished) { finished = true; if (onDone) onDone(); }
    }
    this.play = function () { cancelAnimationFrame(raf); t0 = 0; finished = false; raf = requestAnimationFrame(frame); };
    this.stop = function () { cancelAnimationFrame(raf); f.ctx.clearRect(0, 0, f.w, f.h); };
    this.durationMs = (n - 1 + s.visibleChunks) * s.chunkMs + fadeOut;
  }

  // ── exam runner ──────────────────────────────────────────────────────
  function runExam(start) {
    var token = start.token, attemptId = start.attemptId, s = start.settings;
    var evQueue = [], curIdx = null, tick = 0, fader = null, busy = false, ended = false;
    document.body.classList.add('as-exam');
    startWatermark();

    function ev(type, detail) { evQueue.push({ type: type, idx: curIdx, detail: detail || '' }); if (evQueue.length >= 20) flush(); }
    function flush() {
      if (!evQueue.length) return;
      var batch = evQueue.splice(0, 50);
      api('/api/assess/attempts/' + attemptId + '/events', { method: 'POST', token: token, body: { events: batch } }).catch(function () {});
    }
    var flushTimer = setInterval(flush, 4000);

    // Guards (all recorded; blocking is best-effort)
    function block(type) { return function (e) { e.preventDefault(); ev(type); }; }
    var onCopy = block('copy'), onCut = block('cut'), onCtx = block('contextmenu'), onDrag = function (e) { e.preventDefault(); };
    var onPaste = function (e) { e.preventDefault(); ev('paste'); };
    function onKey(e) {
      var k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (k === 'printscreen') { ev('printscreen'); try { navigator.clipboard.writeText(''); } catch (_) {} }
      if (k === 'f12' || (mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) || (mod && k === 'u')) { e.preventDefault(); ev('devtools_key', e.key); }
      if (mod && (k === 'p' || k === 's')) { e.preventDefault(); ev(k === 'p' ? 'print' : 'devtools_key', e.key); }
      if (mod && (k === 'c' || k === 'x') && !e.shiftKey) { e.preventDefault(); ev('copy', 'keyboard'); }
      if (mod && k === 'v') { e.preventDefault(); ev('paste', 'keyboard'); }
      if (mod && k === 'a' && !(e.target && e.target.tagName === 'TEXTAREA')) e.preventDefault();
    }
    function onVis() { ev(document.hidden ? 'hidden' : 'visible'); }
    function onBlur() { ev('blur'); }
    var lastOut = 0;
    function onMouseOut(e) { if (!e.relatedTarget && Date.now() - lastOut > 3000) { lastOut = Date.now(); ev('mouse_out'); } }
    function onFs() {
      if (ended) return;
      if (!document.fullscreenElement) { ev('fullscreen_exit'); showShield(); } else { ev('fullscreen_enter'); hideShield(); }
    }
    function onPop() { history.pushState(null, '', location.href); ev('blur', 'Tried the browser back button'); }
    function onUnload() { try { if (evQueue.length) navigator.sendBeacon('/api/assess/attempts/' + attemptId + '/events', new Blob([JSON.stringify({ events: evQueue, token: token })], { type: 'application/json' })); } catch (e) {} }
    function onBefore(e) { if (!ended) { e.preventDefault(); e.returnValue = ''; } }
    document.addEventListener('copy', onCopy); document.addEventListener('cut', onCut); document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onCtx); document.addEventListener('dragstart', onDrag); document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBlur); document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('popstate', onPop); window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onBefore);
    history.pushState(null, '', location.href);

    var shield = null;
    function showShield() {
      if (shield) return;
      shield = h('div', { class: 'as-shield', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'as-sh-t' }, [h('div', null, [
        h('h2', { id: 'as-sh-t', text: 'Return to full screen' }),
        h('p', { text: 'The timer is still running. Leaving full screen has been recorded.' }),
        h('button', { class: 'as-btn primary', type: 'button', text: 'Back to the question', onclick: function () { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function () {}); } }),
      ])]);
      document.body.appendChild(shield);
      shield.querySelector('button').focus();
    }
    function hideShield() { if (shield) { shield.remove(); shield = null; } }

    function teardown() {
      ended = true; clearInterval(flushTimer); clearInterval(tick); flush(); stopWatermark(); hideShield();
      if (fader) fader.stop();
      document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCut); document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onCtx); document.removeEventListener('dragstart', onDrag); document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur); document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('popstate', onPop); window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onBefore);
      document.body.classList.remove('as-exam');
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    }

    function fail(e) {
      if (e && e.code === 'elsewhere') { teardown(); clear(main); main.appendChild(errBox(e.message)); main.appendChild(h('button', { class: 'as-btn', type: 'button', text: 'Back to my assessments', onclick: function () { show('tests'); } })); return; }
      if (e && e.code === 'finished') { teardown(); doneScreen({ hidden: true }); return; }
      if (e && e.code === 'moved') { load(); return; }
      teardown(); clear(main); main.appendChild(errBox('Something went wrong: ' + (e && e.message))); main.appendChild(h('button', { class: 'as-btn', type: 'button', text: 'Back to my assessments', onclick: function () { show('tests'); } }));
    }

    function load() {
      clearInterval(tick); if (fader) { fader.stop(); fader = null; }
      api('/api/assess/attempts/' + attemptId + '/current', { token: token }).then(function (q) {
        if (q.done) { teardown(); doneScreen(q.result); return; }
        renderQuestion(q);
      }).catch(fail);
    }

    function doneScreen(r) {
      clear(main);
      var card = h('div', { class: 'as-card', style: 'max-width:560px' });
      card.appendChild(h('h1', { class: 'as-h1', text: 'Submitted' }));
      if (r && !r.hidden) {
        card.appendChild(h('p', { text: 'You scored ' + r.score + ' of ' + r.maxScore + ' (' + r.pct + '%). ' + (r.passed ? 'That is a pass.' : 'That is below the pass mark.') }));
        card.appendChild(h('p', { class: 'as-note', text: 'Written answers are marked by your reviewer and are not in this score.' }));
      } else card.appendChild(h('p', { text: 'Thanks. Your reviewer will share your results.' }));
      card.appendChild(h('div', { class: 'as-row' }, [h('button', { class: 'as-btn primary', type: 'button', text: 'Back to my assessments', onclick: function () { show('tests'); } })]));
      main.appendChild(card);
    }

    function renderQuestion(q) {
      curIdx = q.idx; busy = false;
      clear(main);
      var deadline = Date.now() + q.leftMs;
      var bar = h('i'), barWrap = h('div', { class: 'as-timer', role: 'progressbar', 'aria-label': 'Time left', 'aria-valuemin': '0', 'aria-valuemax': String(q.seconds) }, [bar]);
      var secsEl = h('span', { class: 'as-secs', 'aria-live': 'off' });
      main.appendChild(h('div', { class: 'as-exam-head' }, [h('span', { class: 'as-q', text: (q.kind === 'explain' ? 'Written answer ' : 'Question ') + (q.idx + 1) + ' of ' + q.total }), barWrap, secsEl]));
      var stage = h('div', { class: 'as-stage' });
      main.appendChild(stage);
      var submitBtn = h('button', { class: 'as-btn primary', type: 'button', text: q.idx + 1 === q.total ? 'Submit and finish' : 'Submit answer' });
      var selected = [], replays = 0, getText = null;

      if (q.kind === 'explain') {
        var pc = h('canvas', { class: 'as-prompt', 'aria-hidden': 'true' });
        stage.appendChild(pc);
        requestAnimationFrame(function () { drawStatic(pc, q.prompt, '500 16px Poppins, sans-serif', cssVar('--as-t1')); });
        var ta = h('textarea', { class: 'as-explain', 'aria-label': 'Your explanation', maxlength: '4000', spellcheck: 'true', placeholder: 'Type your explanation here. Pasting is disabled.' });
        stage.appendChild(h('p', { class: 'as-note', style: 'margin:12px 0 6px', text: 'Written in your own words. Pasting is disabled.' }));
        stage.appendChild(ta);
        getText = function () { return ta.value; };
        setTimeout(function () { ta.focus(); }, 50);
      } else {
        var canvas = h('canvas', { class: 'as-prompt', 'aria-hidden': 'true' });
        stage.appendChild(canvas);
        var status = h('span', { text: 'Reading…' });
        var replayBtn = h('button', { class: 'as-btn', type: 'button', text: 'Replay from start', onclick: function () { replays++; ev('replay', String(replays)); status.textContent = 'Replaying…'; fader.play(); } });
        stage.appendChild(h('div', { class: 'as-prompt-tools' }, [replayBtn, status, h('span', { class: 'as-spacer' }), h('span', { text: q.type === 'multi' ? 'Select every correct option' : 'Select one option' })]));
        var opts = h('div', { class: 'as-opts', role: q.type === 'multi' ? 'group' : 'radiogroup', 'aria-label': 'Options' });
        stage.appendChild(opts);
        var letters = 'ABCDEFGH';
        var btns = q.options.map(function (o, i) {
          var cv = h('canvas', { 'aria-hidden': 'true' });
          var b = h('button', { class: 'as-opt', type: 'button', role: q.type === 'multi' ? null : 'radio', 'aria-pressed': q.type === 'multi' ? 'false' : null, 'aria-checked': q.type === 'multi' ? null : 'false', 'aria-label': 'Option ' + letters[i] }, [h('span', { class: 'k', text: letters[i] }), cv]);
          b.addEventListener('click', function () { choose(i); });
          opts.appendChild(b);
          requestAnimationFrame(function () { drawStatic(cv, o.text, '400 15px Poppins, sans-serif', cssVar('--as-t1')); });
          return b;
        });
        function choose(i) {
          if (q.type === 'multi') {
            var at = selected.indexOf(i); if (at >= 0) selected.splice(at, 1); else selected.push(i);
          } else selected = [i];
          btns.forEach(function (b, k) { var on = selected.indexOf(k) >= 0; if (q.type === 'multi') b.setAttribute('aria-pressed', String(on)); else b.setAttribute('aria-checked', String(on)); });
        }
        main._choose = choose; main._nopts = q.options.length;
        (document.fonts && document.fonts.load ? document.fonts.load('500 19px Poppins') : Promise.resolve()).then(function () {
          fader = new FadeText(canvas, q.prompt, s, function () { status.textContent = 'Use Replay to read it again.'; });
          fader.play();
        });
      }

      function send(auto) {
        if (busy) return; busy = true; submitBtn.disabled = true; clearInterval(tick);
        var body = { idx: q.idx, replays: replays };
        if (q.kind === 'explain') body.text = getText ? getText() : ''; else body.choice = selected;
        api('/api/assess/attempts/' + attemptId + '/answer', { method: 'POST', token: token, body: body })
          .then(function (r) { flush(); if (r.done) { teardown(); doneScreen(r.result); } else load(); })
          .catch(fail);
        if (auto) ev('focus', 'Time ran out; submitted automatically');
      }
      submitBtn.addEventListener('click', function () { send(false); });
      main.appendChild(h('div', { class: 'as-exam-foot' }, [h('span', { class: 'as-note', text: q.kind === 'explain' ? '' : 'Keys 1 to ' + (q.options ? q.options.length : 4) + ' select, Enter submits.' }), h('span', { class: 'as-spacer' }), submitBtn]));

      main._send = function () { send(false); };
      function paint() {
        var left = Math.max(0, deadline - Date.now());
        var frac = left / (q.seconds * 1000);
        bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, frac)) + ')';
        var sLeft = Math.ceil(left / 1000);
        secsEl.textContent = sLeft + 's';
        barWrap.setAttribute('aria-valuenow', String(sLeft));
        var low = sLeft <= 10; barWrap.classList.toggle('low', low); secsEl.classList.toggle('low', low);
        if (left <= 0) send(true);
      }
      paint(); tick = setInterval(paint, 200);
    }

    // number keys + Enter while a question is open
    document.addEventListener('keydown', function numKeys(e) {
      if (ended) { document.removeEventListener('keydown', numKeys); return; }
      if (e.target && e.target.tagName === 'TEXTAREA') return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && main._choose && n <= (main._nopts || 0)) { main._choose(n - 1); e.preventDefault(); }
      else if (e.key === 'Enter' && main._send) { e.preventDefault(); main._send(); }
    });

    if (!document.fullscreenElement) ev('fullscreen_exit', 'Did not enter full screen at start');
    load();
  }

  // ── reviewer: tests ──────────────────────────────────────────────────
  function viewReview() {
    main.appendChild(h('h1', { class: 'as-h1', text: 'Review' }));
    main.appendChild(h('p', { class: 'as-sub', text: 'Assessment settings, who each one is assigned to, and results. Only reviewers can see this.' }));
    api('/api/assess/admin/tests').then(function (j) {
      if (!j.tests.length) { main.appendChild(h('div', { class: 'as-empty', text: 'No assessments yet.' })); return; }
      var grid = h('div', { class: 'as-grid' });
      j.tests.forEach(function (t) {
        grid.appendChild(h('div', { class: 'as-card' }, [
          h('h2', { text: t.title }),
          t.description ? h('p', { text: t.description }) : null,
          h('div', { class: 'as-meta' }, [
            h('span', { class: 'as-pill ' + (t.status === 'published' ? 'ok' : 'warn'), text: t.status === 'published' ? 'Published' : 'Draft' }),
            h('span', { class: 'as-pill', text: t.questionIds.length + ' questions' }),
            h('span', { class: 'as-pill', text: t.assign.everyone ? 'Assigned to everyone' : ('Assigned to ' + t.assign.emails.length) }),
            h('span', { class: 'as-pill', text: t.submitted + ' submitted' }),
          ]),
          h('div', { class: 'as-row' }, [
            h('button', { class: 'as-btn primary', type: 'button', text: 'Results', onclick: function () { show('results', t); } }),
            h('button', { class: 'as-btn', type: 'button', text: 'Settings', onclick: function () { show('settings', t); } }),
          ]),
        ]));
      });
      main.appendChild(grid);
    }).catch(function (e) { main.appendChild(errBox(e.message)); });
  }

  function viewSettings(t) {
    var s = t.settings;
    main.appendChild(h('div', { class: 'as-row', style: 'margin-bottom:12px' }, [h('button', { class: 'as-btn ghost', type: 'button', text: 'Back to Review', onclick: function () { show('review'); } })]));
    main.appendChild(h('h1', { class: 'as-h1', text: 'Settings' }));
    main.appendChild(h('p', { class: 'as-sub', text: t.title }));
    var f = {};
    function num(key, label, hint, min, max) {
      var id = 'as-f-' + key;
      f[key] = h('input', { class: 'as-in', id: id, type: 'number', min: String(min), max: String(max), value: String(s[key]) });
      return h('div', { class: 'as-field' }, [h('label', { for: id, text: label }), f[key], hint ? h('span', { class: 'hint', text: hint }) : null]);
    }
    function tog(key, label, val) { f[key] = h('input', { type: 'checkbox', checked: val ? true : null }); return h('label', { class: 'as-toggle' }, [f[key], h('span', { text: label })]); }
    f.title = h('input', { class: 'as-in', id: 'as-f-title', value: t.title, maxlength: '160' });
    f.description = h('textarea', { class: 'as-ta', id: 'as-f-desc', maxlength: '1000' }); f.description.value = t.description || '';
    f.emails = h('textarea', { class: 'as-ta', id: 'as-f-emails', placeholder: 'name@adit.com, one per line' }); f.emails.value = t.assign.emails.join('\n');
    f.status = h('select', { class: 'as-sel', id: 'as-f-status' }, [h('option', { value: 'published', text: 'Published' }), h('option', { value: 'draft', text: 'Draft (hidden from takers)' })]); f.status.value = t.status;
    var card = h('div', { class: 'as-card' }, [
      h('div', { class: 'as-form' }, [
        h('div', { class: 'as-field', style: 'grid-column:1/-1' }, [h('label', { for: 'as-f-title', text: 'Title' }), f.title]),
        h('div', { class: 'as-field', style: 'grid-column:1/-1' }, [h('label', { for: 'as-f-desc', text: 'Description' }), f.description]),
        num('secondsPerQuestion', 'Seconds per question', '30 to 45 breaks the AI round trip', 15, 180),
        num('wordsPerChunk', 'Words per fade group', 'Fewer words, harder to capture', 1, 12),
        num('chunkMs', 'Milliseconds per group', 'Lower is faster', 400, 4000),
        num('visibleChunks', 'Groups visible at once', '1 or 2 is strongest', 1, 4),
        num('explainCount', 'Written follow-ups', '"Explain your answer" questions', 0, 5),
        num('passPct', 'Pass mark (%)', null, 0, 100),
        num('attempts', 'Attempts allowed', null, 1, 10),
        h('div', { class: 'as-field' }, [h('label', { for: 'as-f-status', text: 'Status' }), f.status]),
      ]),
      h('div', { class: 'as-row', style: 'gap:18px' }, [tog('showScore', 'Show the score when they finish', s.showScore), tog('shuffleQuestions', 'Shuffle questions', s.shuffleQuestions), tog('shuffleOptions', 'Shuffle options', s.shuffleOptions)]),
      h('h3', { text: 'Assigned to' }),
      tog('everyone', 'Everyone in the organisation', t.assign.everyone),
      h('div', { class: 'as-field' }, [h('label', { for: 'as-f-emails', text: 'Or these people' }), f.emails, h('span', { class: 'hint', text: '@adit.com emails, separated by lines or commas.' })]),
    ]);
    var msg = h('span', { class: 'as-note', role: 'status' });
    var save = h('button', { class: 'as-btn primary', type: 'button', text: 'Save' });
    save.addEventListener('click', function () {
      save.disabled = true; msg.textContent = 'Saving…';
      var settings = {}; ['secondsPerQuestion', 'wordsPerChunk', 'chunkMs', 'visibleChunks', 'explainCount', 'passPct', 'attempts'].forEach(function (k) { settings[k] = Number(f[k].value); });
      ['showScore', 'shuffleQuestions', 'shuffleOptions'].forEach(function (k) { settings[k] = f[k].checked; });
      api('/api/assess/admin/tests/' + t.id, { method: 'PUT', body: { title: f.title.value, description: f.description.value, status: f.status.value, settings: settings, assign: { everyone: f.everyone.checked, emails: f.emails.value } } })
        .then(function () { msg.textContent = 'Saved.'; return api('/api/assess/admin/tests'); })
        .then(function (j) { var nt = j.tests.find(function (x) { return x.id === t.id; }); if (nt) { t = nt; f.emails.value = nt.assign.emails.join('\n'); } })
        .catch(function (e) { msg.textContent = e.message; })
        .finally(function () { save.disabled = false; });
    });
    card.appendChild(h('div', { class: 'as-row' }, [save, msg]));
    main.appendChild(card);
  }

  // ── reviewer: results ────────────────────────────────────────────────
  function integPill(v) {
    if (v == null) return h('span', { class: 'as-pill', text: 'n/a' });
    return h('span', { class: 'as-pill ' + (v >= 85 ? 'ok' : v >= 60 ? 'warn' : 'bad'), text: String(Math.round(v)) });
  }
  function viewResults(t) {
    main.appendChild(h('div', { class: 'as-row', style: 'margin-bottom:12px' }, [
      h('button', { class: 'as-btn ghost', type: 'button', text: 'Back to Review', onclick: function () { show('review'); } }),
      h('span', { class: 'as-spacer' }),
      h('a', { class: 'as-btn', href: '/api/assess/admin/tests/' + t.id + '/export', text: 'Export CSV' }),
    ]));
    main.appendChild(h('h1', { class: 'as-h1', text: 'Results' }));
    main.appendChild(h('p', { class: 'as-sub', text: t.title + '. Integrity is 100 minus recorded events (tab switches, full screen exits, paste, screenshots, long pauses before a right answer). Read it as a pattern, not proof.' }));
    var holder = h('div');
    main.appendChild(holder);
    api('/api/assess/admin/tests/' + t.id + '/attempts').then(function (j) {
      if (!j.attempts.length) { holder.appendChild(h('div', { class: 'as-empty', text: 'No attempts yet.' })); return; }
      var tb = h('tbody');
      j.attempts.forEach(function (a) {
        tb.appendChild(h('tr', null, [
          h('td', null, [h('button', { class: 'as-link', type: 'button', text: a.name || a.email, onclick: function () { show('attempt', a.id); } }), h('small', { text: a.email })]),
          h('td', null, [h('span', { class: 'as-pill ' + (a.status === 'submitted' ? 'ok' : 'warn'), text: a.status === 'submitted' ? 'Submitted' : 'In progress ' + a.progress })]),
          h('td', { class: 'num', text: a.score != null ? a.score + ' / ' + a.maxScore + ' (' + pct(a.score, a.maxScore) + '%)' : '' }),
          h('td', null, [integPill(a.integrity)]),
          h('td', { text: (a.flags || []).join(', ') || 'None' }),
          h('td', { class: 'num', text: fmtWhen(a.finishedAt || a.startedAt) }),
        ]));
      });
      holder.appendChild(h('div', { class: 'as-table-wrap' }, [h('table', { class: 'as-table' }, [
        h('thead', null, [h('tr', null, ['Agent', 'Status', 'Score', 'Integrity', 'Flags', 'When'].map(function (x) { return h('th', { scope: 'col', text: x }); }))]), tb])]));
    }).catch(function (e) { holder.appendChild(errBox(e.message)); });
  }

  var EVENT_LABELS = { started: 'Started', submitted: 'Submitted', hidden: 'Left the tab', visible: 'Came back to the tab', blur: 'Window lost focus', focus: 'Note', fullscreen_exit: 'Left full screen', fullscreen_enter: 'Back in full screen',
    copy: 'Tried to copy', cut: 'Tried to cut', paste: 'Tried to paste', contextmenu: 'Right-click', printscreen: 'Print Screen key', devtools_key: 'Developer tools key', print: 'Tried to print', mouse_out: 'Mouse left the window',
    replay: 'Replayed the question', timeout: 'Timed out', resumed: 'Reopened in another tab', reserved: 'Reloaded the question', resize: 'Window resized', select: 'Selected text' };

  function viewAttempt(id) {
    var holder = h('div');
    main.appendChild(holder);
    api('/api/assess/admin/attempts/' + id).then(function (j) {
      var a = j.attempt;
      holder.appendChild(h('div', { class: 'as-row', style: 'margin-bottom:12px' }, [
        h('button', { class: 'as-btn ghost', type: 'button', text: 'Back to results', onclick: function () { api('/api/assess/admin/tests').then(function (x) { show('results', x.tests.find(function (t) { return t.id === a.testId; })); }); } }),
        h('span', { class: 'as-spacer' }),
        h('button', { class: 'as-btn danger', type: 'button', text: 'Allow a retake (delete this attempt)', onclick: function (e) {
          if (!window.confirm('Delete this attempt for ' + (a.name || a.email) + '? Their answers and activity log are removed and they can take it again.')) return;
          e.target.disabled = true;
          api('/api/assess/admin/attempts/' + a.id, { method: 'DELETE' }).then(function () { return api('/api/assess/admin/tests'); }).then(function (x) { show('results', x.tests.find(function (t) { return t.id === a.testId; })); }).catch(function (er) { e.target.disabled = false; alert(er.message); });
        } }),
      ]));
      holder.appendChild(h('h1', { class: 'as-h1', text: a.name || a.email }));
      holder.appendChild(h('p', { class: 'as-sub', text: a.testTitle + ' · ' + a.email + ' · started ' + fmtWhen(a.startedAt) + (a.finishedAt ? ', finished ' + fmtWhen(a.finishedAt) : '') }));
      var integ = a.integrity || { score: null, flags: [] };
      holder.appendChild(h('dl', { class: 'as-summary' }, [
        h('div', null, [h('dt', { text: 'Score' }), h('dd', { text: a.score != null ? a.score + ' / ' + a.maxScore : 'In progress' })]),
        h('div', null, [h('dt', { text: 'Percent' }), h('dd', { text: a.score != null ? pct(a.score, a.maxScore) + '%' + (pct(a.score, a.maxScore) >= a.passPct ? ' pass' : ' below pass') : '' })]),
        h('div', null, [h('dt', { text: 'Integrity' }), h('dd', null, [integPill(integ.score)])]),
        h('div', null, [h('dt', { text: 'Flags' }), h('dd', { style: 'font-size:13px;font-weight:500', text: (integ.flags || []).join(', ') || 'None' })]),
      ]));
      var list = h('div', { style: 'display:grid;gap:10px' });
      a.items.forEach(function (it) {
        if (it.kind === 'explain') {
          var sel = h('select', { class: 'as-sel', 'aria-label': 'Mark', style: 'width:auto;min-width:150px' }, [h('option', { value: '', text: 'Not marked' }), h('option', { value: '1', text: 'Strong' }), h('option', { value: '0.5', text: 'Partial' }), h('option', { value: '0', text: 'Weak' })]);
          sel.value = it.reviewScore == null ? '' : String(it.reviewScore);
          var note = h('input', { class: 'as-in', 'aria-label': 'Note', placeholder: 'Note (optional)', value: it.reviewNote || '', style: 'flex:1;width:auto;min-width:180px' });
          var st = h('span', { class: 'as-note', role: 'status' });
          var sv = h('button', { class: 'as-btn', type: 'button', text: 'Save mark', onclick: function () { st.textContent = 'Saving…'; api('/api/assess/admin/attempts/' + a.id + '/explain/' + it.idx, { method: 'PUT', body: { score: sel.value, note: note.value } }).then(function () { st.textContent = 'Saved.'; }).catch(function (e) { st.textContent = e.message; }); } });
          list.appendChild(h('div', { class: 'as-item' }, [
            h('div', { class: 'as-row' }, [h('strong', { text: 'Written answer ' + (it.idx + 1) }), it.late ? h('span', { class: 'as-pill bad', text: 'Timed out' }) : null, h('span', { class: 'as-note', text: it.elapsedMs != null ? secs(it.elapsedMs) : '' })]),
            h('div', { class: 'as-note', text: 'About: ' + it.about }),
            h('div', { class: 'q', style: 'white-space:pre-wrap', text: it.text || (it.answered ? '(empty)' : 'Not answered') }),
            h('div', { class: 'as-row' }, [sel, note, sv, st]),
          ]));
          return;
        }
        list.appendChild(h('div', { class: 'as-item' }, [
          h('div', { class: 'as-row' }, [h('strong', { text: 'Q' + (it.idx + 1) }),
            h('span', { class: 'as-pill ' + (it.correct ? 'ok' : 'bad'), text: it.correct ? 'Correct' : (it.late ? 'Timed out' : (it.answered ? 'Wrong' : 'Not answered')) }),
            h('span', { class: 'as-note', text: (it.elapsedMs != null ? secs(it.elapsedMs) : '') + (it.replays ? ' · replayed ' + it.replays + 'x' : '') })]),
          h('div', { class: 'q', text: it.prompt }),
          h('dl', { class: 'as-kv' }, [
            h('dt', { text: 'Their answer' }), h('dd', { text: it.chosen && it.chosen.length ? it.chosen.join(' | ') : 'None' }),
            h('dt', { text: 'Correct answer' }), h('dd', { text: it.correctAnswer.join(' | ') }),
            h('dt', { text: 'Order shown' }), h('dd', { text: it.shownOrder.map(function (x, i) { return 'ABCDEFGH'[i] + '. ' + x; }).join('   ') }),
          ]),
        ]));
      });
      holder.appendChild(h('h2', { style: 'font-size:16px;margin:0 0 10px', text: 'Answers' }));
      holder.appendChild(list);
      holder.appendChild(h('h2', { style: 'font-size:16px;margin:20px 0 10px', text: 'Activity log' }));
      var tb = h('tbody');
      a.events.forEach(function (e) {
        tb.appendChild(h('tr', null, [h('td', { class: 'num', text: fmtWhen(e.at) }), h('td', { text: e.idx != null ? String(e.idx + 1) : '' }), h('td', { text: EVENT_LABELS[e.type] || e.type }), h('td', { text: e.detail || '' })]));
      });
      holder.appendChild(h('div', { class: 'as-table-wrap as-events' }, [h('table', { class: 'as-table' }, [h('thead', null, [h('tr', null, ['When', 'Q', 'Event', 'Detail'].map(function (x) { return h('th', { scope: 'col', text: x }); }))]), tb])]));
      if (a.ua) holder.appendChild(h('p', { class: 'as-note', style: 'margin-top:10px', text: 'Browser: ' + a.ua }));
    }).catch(function (e) { holder.appendChild(errBox(e.message)); });
  }

  // ── reviewer: reviewers ──────────────────────────────────────────────
  function viewReviewers() {
    main.appendChild(h('h1', { class: 'as-h1', text: 'Reviewers' }));
    main.appendChild(h('p', { class: 'as-sub', text: 'Reviewers can see every result, answer key and activity log, and change assessment settings. Being an admin elsewhere in the tool does not make someone a reviewer.' }));
    var holder = h('div', { class: 'as-card', style: 'max-width:640px' });
    main.appendChild(holder);
    function load() {
      clear(holder);
      api('/api/assess/admin/reviewers').then(function (j) {
        j.reviewers.forEach(function (r) {
          holder.appendChild(h('div', { class: 'as-row' }, [h('span', { text: r.email }), h('span', { class: 'as-note', text: r.added_by && r.added_by !== 'system' ? 'added by ' + r.added_by : '' }), h('span', { class: 'as-spacer' }),
            r.email === me.email ? null : h('button', { class: 'as-btn danger', type: 'button', text: 'Remove', onclick: function (e) { e.target.disabled = true; api('/api/assess/admin/reviewers/' + encodeURIComponent(r.email), { method: 'DELETE' }).then(load).catch(function (er) { e.target.disabled = false; alert(er.message); }); } })]));
        });
        var inp = h('input', { class: 'as-in', type: 'email', placeholder: 'name@adit.com', 'aria-label': 'Reviewer email', style: 'flex:1;min-width:200px' });
        var msg = h('span', { class: 'as-note', role: 'status' });
        holder.appendChild(h('div', { class: 'as-row', style: 'margin-top:8px' }, [inp, h('button', { class: 'as-btn primary', type: 'button', text: 'Add reviewer', onclick: function () {
          api('/api/assess/admin/reviewers', { method: 'POST', body: { email: inp.value } }).then(load).catch(function (e) { msg.textContent = e.message; });
        } }), msg]));
      }).catch(function (e) { holder.appendChild(errBox(e.message)); });
    }
    load();
  }

  boot();
})();
