/* Session 50: Google Chat report composer (preview, versions, schedules).
   window.openChatComposer(opts) opens it as a modal; window.openDigest()
   renders the full Reports page into #digest-root. */
(function () {
  'use strict';
  const TZ_LABEL = { 'America/Chicago': 'CST', 'Asia/Kolkata': 'IST' };
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const PERIOD_ORDER = ['today', 'yesterday', 'last_workday', 'this_week', 'last_week', 'last_7', 'this_month', 'last_month', 'last_30', 'custom'];
  const VERSIONS = {
    perf: [
      ['summary', 'Team summary', 'Totals, wing split, top performers, callouts'],
      ['leaderboard', 'Leaderboard', 'Everyone ranked by one metric'],
      ['detailed', 'Per-agent detail', 'One line per agent with every metric'],
      ['coaching', 'Coaching', 'Only exceptions, plus kudos'],
    ],
    breaks: [
      ['full', 'Full report', 'Over, close to and within limit'],
      ['exceptions', 'Exceptions only', 'Only agents over or near limit'],
      ['compact', 'Compact', 'Counts and team totals'],
      ['by_wing', 'By wing', 'Call Wing and Chat Wing lists'],
    ],
  };
  const TONES = {
    perf: {
      friendly: 'Hi team 👋 Here is how we did for {period}. Thanks for all the effort!',
      motivating: 'Great hustle, team! 🚀 {calls} calls, {chats} chats and {tickets} tickets handled for {period}. Let\'s keep the momentum going!',
      formal: 'Hello team, please find the productivity summary for {period} below.',
      short: 'Productivity for {period} 👇',
      none: '',
    },
    breaks: {
      friendly: 'Hi team 👋 Here is the break summary for {period}. Thanks for keeping breaks on plan!',
      motivating: 'Nice discipline, team! ☕ Here is how breaks looked for {period}.',
      formal: 'Hello team, please find the break compliance summary for {period} below.',
      short: 'Breaks for {period} 👇',
      none: '',
    },
  };
  const DEFAULT_TITLE = { perf: '📈 T1 CS Productivity', breaks: '☕ Break Report' };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = s => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>');
  const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t || 'success'); };
  const api = async (url, opts) => {
    const r = await fetch(url, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!j) throw new Error('Server error');
    return j;
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('crCfg_' + k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('crCfg_' + k, JSON.stringify(v)); } catch (e) {} },
  };

  let META = null;
  async function meta() {
    if (META) return META;
    const j = await api('/api/chat-reports/meta');
    if (!j.success) throw new Error(j.error || 'No access');
    META = j; return META;
  }

  function defaults(kind) {
    return {
      kind, period: 'today', start: '', end: '', version: kind === 'breaks' ? 'full' : 'summary',
      metrics: META ? META.defaultMetrics.slice() : [], title: DEFAULT_TITLE[kind], tone: 'friendly', intro: TONES[kind].friendly, outro: '',
      options: { wing: '', groupByWing: true, showTop: true, topN: 3, showCallouts: true, compare: false, hideIdle: true, rankBy: 'tickets', showTotals: true, showLimits: true, mentionAll: false, format: 'card' },
    };
  }

  // ── Composer instance ─────────────────────────────────────────────
  function Composer(host, init, hooks) {
    const self = this;
    this.host = host; this.hooks = hooks || {};
    const saved = store.get(init.kind || 'perf');
    this.cfg = Object.assign(defaults(init.kind || 'perf'), saved || {}, init);
    this.cfg.options = Object.assign(defaults(this.cfg.kind).options, (saved && saved.options) || {}, init.options || {});
    this.sched = null; this.confirmUntil = 0; this.seq = 0; this.timer = null;
    host.addEventListener('click', e => self.onClick(e));
    host.addEventListener('input', e => self.onInput(e));
    host.addEventListener('change', e => self.onInput(e));
    this.render(); this.refresh();
  }
  Composer.prototype.setKind = function (kind) {
    if (kind === this.cfg.kind) return;
    store.set(this.cfg.kind, this.cfg);
    const saved = store.get(kind);
    const keep = { period: this.cfg.period, start: this.cfg.start, end: this.cfg.end };
    this.cfg = Object.assign(defaults(kind), saved || {}, keep);
    this.cfg.options = Object.assign(defaults(kind).options, (saved && saved.options) || {});
    this.render(); this.refresh();
  };
  Composer.prototype.load = function (cfg, sched) {
    this.cfg = Object.assign(defaults(cfg.kind || 'perf'), cfg);
    this.cfg.options = Object.assign(defaults(this.cfg.kind).options, cfg.options || {});
    this.sched = sched ? Object.assign({}, sched) : null;
    this.render(); this.refresh();
    this.host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  Composer.prototype.payload = function () {
    const c = this.cfg;
    return { kind: c.kind, period: c.period, start: c.start, end: c.end, version: c.version, metrics: c.metrics, title: c.title, intro: c.intro, outro: c.outro, options: c.options, tone: c.tone };
  };

  Composer.prototype.controlsHTML = function () {
    const c = this.cfg, o = c.options, P = META.periods, M = META.metrics;
    const chip = (attr, val, label, on) => `<button type="button" class="cr-chip${on ? ' on' : ''}" ${attr}="${esc(val)}" aria-pressed="${on}">${esc(label)}</button>`;
    const tog = (key, label, hint) => `<label class="cr-tog"><input type="checkbox" data-opt="${key}"${o[key] ? ' checked' : ''}><span class="cr-sw" aria-hidden="true"></span><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
    const perf = c.kind === 'perf';
    return `
      <div class="cr-seg" role="tablist" aria-label="Report type">
        ${chip('data-kind', 'perf', '📈 Productivity', perf)}${chip('data-kind', 'breaks', '☕ Breaks', !perf)}
      </div>
      <section class="cr-sec"><h4>Period</h4>
        <div class="cr-chips">${PERIOD_ORDER.map(k => chip('data-period', k, P[k], c.period === k)).join('')}</div>
        ${c.period === 'custom' ? `<div class="cr-row"><label>From<input type="date" class="cr-in" data-f="start" value="${esc(c.start)}"></label><label>To<input type="date" class="cr-in" data-f="end" value="${esc(c.end)}"></label></div>` : ''}
      </section>
      <section class="cr-sec"><h4>Version</h4>
        <div class="cr-vers">${VERSIONS[c.kind].map(([k, t, d]) => `<button type="button" class="cr-ver${c.version === k ? ' on' : ''}" data-version="${k}" aria-pressed="${c.version === k}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}</div>
      </section>
      ${perf ? `<section class="cr-sec"><h4>Metrics <small>${c.metrics.length} selected</small></h4>
        <div class="cr-chips">${Object.keys(M).map(k => chip('data-metric', k, M[k].label, c.metrics.includes(k))).join('')}</div>
        <div class="cr-row"><label>Rank by<select class="cr-in" data-opt="rankBy">${Object.keys(M).map(k => `<option value="${k}"${o.rankBy === k ? ' selected' : ''}>${esc(M[k].label)}</option>`).join('')}</select></label>
        <label>Top<select class="cr-in" data-opt="topN">${[3, 5, 10].map(n => `<option${Number(o.topN) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      </section>` : ''}
      <section class="cr-sec"><h4>Who</h4>
        <div class="cr-chips">${chip('data-wing', '', 'Whole team', !o.wing)}${chip('data-wing', 'call', '📞 Call Wing', o.wing === 'call')}${chip('data-wing', 'chat', '💬 Chat Wing', o.wing === 'chat')}</div>
      </section>
      <section class="cr-sec"><h4>Options</h4><div class="cr-togs">
        ${perf ? tog('groupByWing', 'Split by wing') + tog('showTop', 'Top performers') + tog('showCallouts', 'Needs attention', 'Missed calls, break limits, low FCR') + tog('compare', 'Compare with previous period', 'Adds ▲▼ change on team totals') + tog('hideIdle', 'Hide agents with no activity') : tog('showTotals', 'Team total line') + tog('showLimits', 'Show limits next to times')}
        ${tog('mentionAll', 'Notify everyone', 'Adds @all so the space gets a ping')}
      </div>
        <div class="cr-row"><span class="cr-lbl">Format</span><div class="cr-chips">${chip('data-format', 'card', 'Card', o.format !== 'text')}${chip('data-format', 'text', 'Plain text', o.format === 'text')}</div></div>
      </section>
      <section class="cr-sec"><h4>Message</h4>
        <label class="cr-full">Title<input class="cr-in" data-f="title" maxlength="150" value="${esc(c.title)}"></label>
        <div class="cr-row cr-tones"><span class="cr-lbl">Tone</span><div class="cr-chips">${['friendly', 'motivating', 'formal', 'short', 'none'].map(t => chip('data-tone', t, t[0].toUpperCase() + t.slice(1), c.tone === t)).join('')}</div></div>
        <label class="cr-full">Opening message<textarea class="cr-in" data-f="intro" rows="3" maxlength="1500">${esc(c.intro)}</textarea></label>
        <div class="cr-help"><span>Placeholders: ${(perf ? ['period', 'agents', 'calls', 'chats', 'tickets', 'fcr'] : ['period', 'agents', 'over']).map(v => `<code>{${v}}</code>`).join(' ')}</span><button type="button" class="cr-link" data-polish>✨ Polish with AI</button></div>
        <label class="cr-full"><span>Sign-off <small>(optional)</small></span><input class="cr-in" data-f="outro" maxlength="600" placeholder="e.g. Regards, Sebastin" value="${esc(c.outro)}"></label>
      </section>`;
  };

  Composer.prototype.scheduleHTML = function () {
    const s = this.sched;
    if (!s) return '';
    const hm = s.time_hm || '19:30';
    return `<div class="cr-sched" role="group" aria-label="Schedule">
      <div class="cr-sched-h"><b>${s.id ? 'Edit schedule' : 'Schedule this report'}</b><button type="button" class="cr-x" data-sched-close aria-label="Close schedule form">✕</button></div>
      <label class="cr-full">Name<input class="cr-in" data-s="name" maxlength="80" value="${esc(s.name || '')}" placeholder="e.g. Daily productivity"></label>
      <div class="cr-row"><span class="cr-lbl">Repeat</span><div class="cr-chips">${['daily', 'weekly', 'monthly'].map(f => `<button type="button" class="cr-chip${s.freq === f ? ' on' : ''}" data-freq="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div></div>
      <div class="cr-row">
        <label>Time<input type="time" class="cr-in" data-s="time_hm" value="${esc(hm)}"></label>
        <label>Zone<select class="cr-in" data-s="tz">${Object.keys(TZ_LABEL).map(z => `<option value="${z}"${s.tz === z ? ' selected' : ''}>${TZ_LABEL[z]}</option>`).join('')}</select></label>
        ${s.freq === 'weekly' ? `<label>On<select class="cr-in" data-s="weekday">${WEEKDAYS.map((d, i) => `<option value="${i}"${Number(s.weekday) === i ? ' selected' : ''}>${d}</option>`).join('')}</select></label>` : ''}
        ${s.freq === 'monthly' ? `<label>Day<select class="cr-in" data-s="monthday">${Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<option value="${d}"${Number(s.monthday) === d ? ' selected' : ''}>${d === 31 ? 'Last day' : d}</option>`).join('')}</select></label>` : ''}
      </div>
      ${s.freq === 'daily' ? `<label class="cr-tog"><input type="checkbox" data-s="weekdays_only"${s.weekdays_only ? ' checked' : ''}><span class="cr-sw" aria-hidden="true"></span><span><b>Weekdays only</b></span></label>` : ''}
      <p class="cr-note">Each run uses the period above (<b>${esc(META.periods[this.cfg.period])}</b>) as of the send time.${this.cfg.period === 'custom' ? ' A custom range repeats the same dates, pick a relative period instead.' : ''}</p>
      <div class="cr-actions"><button type="button" class="cr-btn cr-primary" data-sched-save>${s.id ? 'Update schedule' : 'Save schedule'}</button></div>
    </div>`;
  };

  Composer.prototype.render = function () {
    this.host.innerHTML = `
      <div class="cr-grid">
        <div class="cr-controls">${this.controlsHTML()}</div>
        <div class="cr-side">
          <div class="cr-prev-h"><span>Preview</span><span class="cr-target" data-target></span></div>
          <div class="cr-prev" data-prev aria-live="polite"><div class="cr-skel"></div><div class="cr-skel"></div><div class="cr-skel short"></div></div>
          <div class="cr-actions">
            <button type="button" class="cr-btn cr-primary" data-send>Send to Chat</button>
            <button type="button" class="cr-btn" data-copy>Copy text</button>
            <button type="button" class="cr-btn" data-sched-open>${this.sched && this.sched.id ? 'Edit schedule' : 'Schedule'}</button>
          </div>
          <div data-sched-host>${this.scheduleHTML()}</div>
        </div>
      </div>`;
  };

  Composer.prototype.refresh = function () {
    clearTimeout(this.timer);
    const self = this;
    this.timer = setTimeout(async () => {
      const my = ++self.seq;
      const prev = self.host.querySelector('[data-prev]');
      if (prev) prev.classList.add('cr-busy');
      store.set(self.cfg.kind, self.cfg);
      try {
        const j = await api('/api/chat-reports/preview', { method: 'POST', body: JSON.stringify(self.payload()) });
        if (my !== self.seq) return;
        if (!j.success) throw new Error(j.error || 'Preview failed');
        self.last = j; self.paint(j);
      } catch (e) {
        if (my !== self.seq) return;
        if (prev) prev.innerHTML = `<div class="cr-err">${esc(e.message || 'Preview failed')}</div>`;
      } finally { if (prev) prev.classList.remove('cr-busy'); }
    }, 300);
  };

  Composer.prototype.paint = function (j) {
    const m = j.model, o = this.cfg.options;
    const prev = this.host.querySelector('[data-prev]');
    const tgt = this.host.querySelector('[data-target]');
    if (tgt) tgt.innerHTML = j.configured ? `To <b>${esc(j.target)}</b>` : '<span class="cr-warn">Chat webhook not set</span>';
    const mention = o.mentionAll ? '<span class="cr-at">@all</span> ' : '';
    const blocks = m.blocks.map(b => `<div class="cr-card-sec">${b.heading ? `<div class="cr-card-hd">${md(b.heading)}</div>` : ''}<div class="cr-card-tx">${b.lines.map(md).join('<br>')}</div></div>`).join('');
    const body = o.format === 'text'
      ? `<div class="cr-msg-text">${mention}<b>${esc(m.title)}</b><br><i>${esc(m.subtitle)}</i>${m.intro ? '<br><br>' + md(m.intro) : ''}${m.blocks.map(b => '<br><br>' + (b.heading ? `<b>${md(b.heading)}</b><br>` : '') + b.lines.map(md).join('<br>')).join('')}${m.outro ? '<br><br>' + md(m.outro) : ''}</div>`
      : `${mention ? `<div class="cr-msg-text">${mention}</div>` : ''}<div class="cr-card">
          <div class="cr-card-top"><div class="cr-card-t">${esc(m.title)}</div><div class="cr-card-s">${esc(m.subtitle)}</div></div>
          ${m.intro ? `<div class="cr-card-sec"><div class="cr-card-tx">${md(m.intro)}</div></div>` : ''}
          ${blocks}
          ${m.outro ? `<div class="cr-card-sec"><div class="cr-card-tx">${md(m.outro)}</div></div>` : ''}
        </div>`;
    prev.innerHTML = `<div class="cr-msg"><div class="cr-av" aria-hidden="true">A</div><div class="cr-msg-b"><div class="cr-msg-n">Adit Agent Monitor <span>App</span> <time>now</time></div>${body}</div></div>`;
  };

  Composer.prototype.onInput = function (e) {
    const t = e.target, c = this.cfg;
    if (t.dataset.f) { c[t.dataset.f] = t.value; if (t.dataset.f === 'intro') c.tone = 'custom'; this.refresh(); return; }
    if (t.dataset.opt) { c.options[t.dataset.opt] = t.type === 'checkbox' ? t.checked : t.value; this.refresh(); return; }
    if (t.dataset.s && this.sched) { this.sched[t.dataset.s] = t.type === 'checkbox' ? t.checked : t.value; }
  };

  Composer.prototype.onClick = async function (e) {
    const b = e.target.closest('button'); if (!b || !this.host.contains(b)) return;
    const c = this.cfg, d = b.dataset;
    const rerender = () => { this.render(); if (this.last) this.paint(this.last); };
    if (d.kind) return this.setKind(d.kind);
    if (d.period) { c.period = d.period; if (d.period === 'custom' && !c.start) { const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); c.start = c.end = t; } rerender(); return this.refresh(); }
    if (d.version) { c.version = d.version; rerender(); return this.refresh(); }
    if (d.metric) { const i = c.metrics.indexOf(d.metric); if (i >= 0) { if (c.metrics.length > 1) c.metrics.splice(i, 1); } else c.metrics.push(d.metric); rerender(); return this.refresh(); }
    if (d.wing !== undefined) { c.options.wing = d.wing; rerender(); return this.refresh(); }
    if (d.format) { c.options.format = d.format; rerender(); return this.refresh(); }
    if (d.tone) { c.tone = d.tone; c.intro = TONES[c.kind][d.tone]; rerender(); return this.refresh(); }
    if (d.polish !== undefined) {
      if (!c.intro.trim()) { c.intro = TONES[c.kind].friendly; }
      b.disabled = true; b.textContent = 'Polishing...';
      try {
        const j = await api('/api/chat-reports/polish', { method: 'POST', body: JSON.stringify({ text: c.intro, tone: c.tone === 'custom' || c.tone === 'none' ? 'friendly' : c.tone }) });
        if (j.success && j.text) { c.intro = j.text; c.tone = 'custom'; rerender(); this.refresh(); } else toast(j.error || 'AI is busy, try again', 'error');
      } catch (err) { toast('AI is busy, try again', 'error'); }
      b.disabled = false; b.textContent = '✨ Polish with AI';
      return;
    }
    if (d.copy !== undefined) {
      const text = this.last ? this.last.text : '';
      try { await navigator.clipboard.writeText(text); toast('Report text copied'); } catch (err) { toast('Copy failed', 'error'); }
      return;
    }
    if (d.send !== undefined) {
      if (Date.now() > this.confirmUntil) {
        this.confirmUntil = Date.now() + 4000; b.textContent = 'Click again to send'; b.classList.add('cr-confirm');
        setTimeout(() => { if (Date.now() >= this.confirmUntil) { b.textContent = 'Send to Chat'; b.classList.remove('cr-confirm'); } }, 4100);
        return;
      }
      this.confirmUntil = 0; b.disabled = true; b.textContent = 'Sending...';
      try {
        const j = await api('/api/chat-reports/send', { method: 'POST', body: JSON.stringify(this.payload()) });
        toast(j.success ? 'Report posted to Google Chat' : (j.error || 'Send failed'), j.success ? 'success' : 'error');
        if (j.success && this.hooks.onSent) this.hooks.onSent();
      } catch (err) { toast('Send failed', 'error'); }
      b.disabled = false; b.textContent = 'Send to Chat'; b.classList.remove('cr-confirm');
      return;
    }
    if (d.schedOpen !== undefined) {
      if (!this.sched) {
        const freq = ['this_week', 'last_week', 'last_7'].includes(c.period) ? 'weekly' : ['this_month', 'last_month', 'last_30'].includes(c.period) ? 'monthly' : 'daily';
        this.sched = { name: (c.kind === 'perf' ? 'Productivity' : 'Breaks') + ' ' + freq, freq, time_hm: '19:30', tz: 'America/Chicago', weekday: 5, monthday: 31, weekdays_only: true };
      }
      rerender(); return;
    }
    if (d.schedClose !== undefined) { this.sched = null; rerender(); return; }
    if (d.freq && this.sched) {
      const auto = !this.sched.name || /^(Productivity|Breaks) (daily|weekly|monthly)$/.test(this.sched.name);
      this.sched.freq = d.freq;
      if (auto) this.sched.name = (c.kind === 'perf' ? 'Productivity' : 'Breaks') + ' ' + d.freq;
      const short = ['today', 'yesterday', 'last_workday'], week = ['this_week', 'last_week', 'last_7'], month = ['this_month', 'last_month', 'last_30'];
      const want = d.freq === 'weekly' ? (week.includes(c.period) ? null : 'this_week') : d.freq === 'monthly' ? (month.includes(c.period) ? null : 'this_month') : (short.includes(c.period) ? null : 'today');
      if (want) { c.period = want; toast('Period set to ' + META.periods[want] + ' to match a ' + d.freq + ' schedule', 'info'); this.refresh(); }
      rerender(); return;
    }
    if (d.schedSave !== undefined && this.sched) {
      b.disabled = true;
      try {
        const j = await api('/api/chat-reports/schedules', { method: 'POST', body: JSON.stringify(Object.assign({}, this.sched, { config: this.payload() })) });
        if (!j.success) throw new Error(j.error);
        toast(this.sched.id ? 'Schedule updated' : 'Schedule saved');
        this.sched = null; rerender();
        if (this.hooks.onScheduled) this.hooks.onScheduled();
      } catch (err) { toast('Could not save schedule', 'error'); b.disabled = false; }
    }
  };

  // ── Modal ─────────────────────────────────────────────────────────
  window.openChatComposer = async function (opts) {
    try { await meta(); } catch (e) { toast('Only admins can send Chat reports', 'error'); return; }
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'cr-overlay'; wrap.id = 'cr-overlay';
    wrap.innerHTML = `<div class="cr-modal" role="dialog" aria-modal="true" aria-labelledby="cr-mt">
      <div class="cr-modal-h"><div><h3 id="cr-mt">Send report to Google Chat</h3><p>Pick a period and version, tune the message, check the preview.</p></div>
      <div class="cr-modal-hr"><button type="button" class="cr-btn" data-open-page>Open Reports page</button><button type="button" class="cr-x" data-close aria-label="Close">✕</button></div></div>
      <div class="cr-modal-b" data-host></div></div>`;
    document.body.appendChild(wrap);
    document.documentElement.classList.add('cr-lock');
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) closeModal();
      if (e.target.closest('[data-open-page]')) { closeModal(); if (typeof sbAdmin === 'function') sbAdmin('digest'); }
    });
    wrap._esc = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', wrap._esc);
    new Composer(wrap.querySelector('[data-host]'), opts || {});
    setTimeout(() => { const f = wrap.querySelector('.cr-chip.on'); if (f) f.focus(); }, 30);
  };
  function closeModal() {
    const w = document.getElementById('cr-overlay');
    if (!w) return;
    document.removeEventListener('keydown', w._esc);
    w.remove(); document.documentElement.classList.remove('cr-lock');
  }

  // ── Reports page ──────────────────────────────────────────────────
  let pageComposer = null;
  const describe = s => {
    const t = `${s.time_hm} ${TZ_LABEL[s.tz] || s.tz}`;
    if (s.freq === 'weekly') return `Every ${WEEKDAYS[s.weekday ?? 5]} at ${t}`;
    if (s.freq === 'monthly') return `Monthly on ${Number(s.monthday) === 31 ? 'the last day' : 'day ' + s.monthday} at ${t}`;
    return `${s.weekdays_only ? 'Weekdays' : 'Every day'} at ${t}`;
  };
  const when = ts => { if (!ts) return '-'; const d = new Date(String(ts).replace(' ', 'T') + (String(ts).includes('Z') ? '' : 'Z')); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

  async function loadLists(root) {
    const sh = root.querySelector('[data-schedules]'), hh = root.querySelector('[data-history]');
    try {
      const [s, h] = await Promise.all([api('/api/chat-reports/schedules'), api('/api/chat-reports/history')]);
      const rows = (s.data || []);
      root._schedules = rows;
      sh.innerHTML = rows.length ? rows.map(r => `<div class="cr-srow${r.enabled ? '' : ' off'}">
          <div class="cr-sname"><b>${esc(r.name)}</b><small>${r.kind === 'breaks' ? '☕ Breaks' : '📈 Productivity'} · ${esc((META.periods || {})[r.config.period] || r.config.period)} · ${esc(describe(r))}</small></div>
          <div class="cr-smeta"><small>Next</small><span>${esc(r.next_run || (r.enabled ? '-' : 'Paused'))}</span></div>
          <div class="cr-smeta"><small>Last</small><span class="${/fail/.test(r.last_status || '') ? 'cr-bad' : ''}">${esc(r.last_status || 'Never run')}</span></div>
          <div class="cr-sact">
            <label class="cr-tog cr-tog-sm" title="${r.enabled ? 'Pause' : 'Resume'}"><input type="checkbox" data-toggle="${r.id}"${r.enabled ? ' checked' : ''} aria-label="Enabled"><span class="cr-sw" aria-hidden="true"></span></label>
            <button type="button" class="cr-btn cr-sm" data-run="${r.id}">Send now</button>
            <button type="button" class="cr-btn cr-sm" data-edit="${r.id}">Edit</button>
            <button type="button" class="cr-btn cr-sm cr-danger" data-del="${r.id}">Delete</button>
          </div></div>`).join('') : '<div class="cr-empty">No schedules yet. Build a report above and press <b>Schedule</b>.</div>';
      hh.innerHTML = (h.data || []).length ? (h.data || []).map(l => `<div class="cr-hrow"><span class="cr-dotc ${l.ok ? 'ok' : 'bad'}" aria-hidden="true"></span><span class="cr-hmain"><b>${esc(l.title)}</b> · ${esc(l.period_label || '')}${l.version ? ' · ' + esc(l.version) : ''}</span><span class="cr-hwho">${esc(String(l.sent_by || '').replace('@adit.com', ''))}</span><time>${esc(when(l.created_at))}</time>${l.ok ? '' : `<span class="cr-bad">${esc(l.error || 'failed')}</span>`}</div>`).join('') : '<div class="cr-empty">Nothing sent yet.</div>';
    } catch (e) { sh.innerHTML = '<div class="cr-err">Could not load schedules</div>'; }
  }

  window.openDigest = async function () {
    const root = document.getElementById('digest-root');
    if (!root) return;
    if (!root.dataset.ready) {
      root.innerHTML = `<div class="cr-page">
        <div class="cr-page-h"><div><h2>Chat reports</h2><p>Build a productivity or break report, preview exactly what the team will see, send it now or put it on a schedule.</p></div></div>
        <div class="cr-panel" data-composer></div>
        <div class="cr-cols">
          <div class="cr-panel"><h3>Schedules</h3><div data-schedules><div class="cr-skel"></div></div></div>
          <div class="cr-panel"><h3>Recently sent</h3><div data-history><div class="cr-skel"></div></div></div>
        </div></div>`;
      root.dataset.ready = '1';
      try { await meta(); } catch (e) { root.querySelector('[data-composer]').innerHTML = '<div class="cr-err">Only admins can use Chat reports.</div>'; return; }
      pageComposer = new Composer(root.querySelector('[data-composer]'), {}, { onSent: () => loadLists(root), onScheduled: () => loadLists(root) });
      root.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        const id = b.dataset.run || b.dataset.edit || b.dataset.del; if (!id) return;
        if (b.dataset.edit) { const s = (root._schedules || []).find(x => String(x.id) === id); if (s) pageComposer.load(Object.assign({}, s.config, { kind: s.kind }), { id: s.id, name: s.name, freq: s.freq, time_hm: s.time_hm, tz: s.tz, weekday: s.weekday, monthday: s.monthday, weekdays_only: !!s.weekdays_only, enabled: !!s.enabled }); return; }
        if (b.dataset.del) {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirm delete'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 4000); return; }
          await api('/api/chat-reports/schedules/' + id, { method: 'DELETE' }).catch(() => {}); toast('Schedule deleted'); return loadLists(root);
        }
        if (b.dataset.run) { b.disabled = true; b.textContent = 'Sending...'; const j = await api('/api/chat-reports/schedules/' + id + '/run', { method: 'POST' }).catch(() => ({})); toast(j.success ? 'Report posted to Google Chat' : (j.error || 'Send failed'), j.success ? 'success' : 'error'); return loadLists(root); }
      });
      root.addEventListener('change', async e => {
        const t = e.target; if (!t.dataset.toggle) return;
        await api('/api/chat-reports/schedules/' + t.dataset.toggle + '/toggle', { method: 'POST', body: JSON.stringify({ enabled: t.checked }) }).catch(() => {});
        toast(t.checked ? 'Schedule resumed' : 'Schedule paused'); loadLists(root);
      });
    }
    loadLists(root);
  };

  // Breaks page button opens the composer on the day being viewed.
  window.openBreakReportSend = function () {
    const day = typeof getBreakTrackerDate === 'function' ? getBreakTrackerDate() : '';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    window.openChatComposer(!day || day === today ? { kind: 'breaks', period: 'today' } : { kind: 'breaks', period: 'custom', start: day, end: day });
  };

  // If the app booted straight onto this tab before this script loaded.
  const boot = () => { const pg = document.getElementById('tab-digest'); if (pg && pg.classList.contains('active')) window.openDigest(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
