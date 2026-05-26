/*
 * agent-view-v2.js — interactive logic for the Agent View V2 design system.
 * - Animates stat counters when values change
 * - Wires the hero "shift state" pill to the user's current Break Bot status
 * - Builds initials avatar from name
 * - Manages skeleton → data transition
 *
 * Loaded after the page renders. All functions are namespaced under `av2`.
 */
(function () {
  'use strict';

  const ML = window.Motion || window.motion || {};
  const animate = ML.animate || null;
  const inView  = ML.inView  || null;

  const av2 = {
    /* Initials avatar — accepts "Sebastin Nathan" → "SN" */
    initials(name) {
      if (!name) return '?';
      return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    },

    /* Animated counter — counts from current value to target */
    countTo(el, target, opts) {
      if (!el || isNaN(target)) return;
      const o = Object.assign({ duration: 800, suffix: '', prefix: '', decimals: 0 }, opts || {});
      const current = parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
      const diff = target - current;
      if (diff === 0) return;
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / o.duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const val = current + diff * eased;
        el.textContent = o.prefix + val.toFixed(o.decimals) + o.suffix;
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },

    /* Format seconds → "1h 23m" or "23m" or "45s" */
    fmtDuration(secs) {
      secs = Math.max(0, Math.floor(secs || 0));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm';
      return s + 's';
    },

    /* Time-of-day greeting */
    greeting() {
      const h = new Date().getHours();
      if (h < 5)  return 'Working late';
      if (h < 12) return 'Good morning';
      if (h < 17) return 'Good afternoon';
      if (h < 21) return 'Good evening';
      return 'Working late';
    },

    /* Render hero greeting + name */
    renderHero(rootSelector, payload) {
      const root = typeof rootSelector === 'string' ? document.querySelector(rootSelector) : rootSelector;
      if (!root) return;
      const name = payload.name || 'Agent';
      const firstName = name.split(/\s+/)[0];
      const titleEl = root.querySelector('.av2-hero-title');
      if (titleEl) {
        titleEl.innerHTML = av2.greeting() + ', <span class="av2-hero-title-accent">' + av2.escape(firstName) + '</span>';
      }
      const subEl = root.querySelector('.av2-hero-sub');
      if (subEl && payload.sub) subEl.textContent = payload.sub;
      const stateEl = root.querySelector('.av2-shift-state');
      if (stateEl && payload.state) {
        stateEl.dataset.state = payload.state.toLowerCase();
        const lbl = stateEl.querySelector('.av2-state-label');
        if (lbl) lbl.textContent = payload.stateLabel || payload.state;
      }
    },

    /* Map a stat element by data-stat key and update with animation */
    updateStat(rootSelector, statKey, value, opts) {
      const root = typeof rootSelector === 'string' ? document.querySelector(rootSelector) : rootSelector;
      if (!root) return;
      const el = root.querySelector('[data-stat="' + statKey + '"] .av2-stat-value-number');
      if (el) av2.countTo(el, value, opts);
    },

    /* Apply a delta indicator (vs yesterday) to a stat card */
    updateStatDelta(rootSelector, statKey, deltaPercent) {
      const root = typeof rootSelector === 'string' ? document.querySelector(rootSelector) : rootSelector;
      if (!root) return;
      const card = root.querySelector('[data-stat="' + statKey + '"]');
      if (!card) return;
      let delta = card.querySelector('.av2-stat-delta');
      if (!delta) {
        delta = document.createElement('span');
        delta.className = 'av2-stat-delta';
        card.appendChild(delta);
      }
      const dir = deltaPercent > 0.5 ? 'up' : deltaPercent < -0.5 ? 'down' : 'flat';
      delta.dataset.dir = dir;
      const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '·';
      delta.textContent = arrow + ' ' + Math.abs(deltaPercent).toFixed(1) + '% vs yesterday';
    },

    /* HTML escape */
    escape(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    /* Render an agent row in the v2 team table */
    renderAgentRow(agent, idx) {
      const name = agent.name || 'Unknown';
      const ext  = agent.extension || agent.ext || '—';
      const status = (agent.status || 'offline').toLowerCase();
      const stateMap = {
        available: 'available', avail: 'available', online: 'available',
        unavailable: 'unavailable', dnd: 'unavailable', away: 'unavailable',
        oncall: 'oncall', busy: 'oncall', incall: 'oncall',
        ringing: 'ringing',
        offline: 'offline'
      };
      const state = stateMap[status] || 'offline';
      const live  = agent.liveTimer || '—';
      const since = agent.since || '—';
      return '<tr data-ext="' + av2.escape(ext) + '" data-name="' + av2.escape(name) + '">' +
        '<td>' + (idx + 1) + '</td>' +
        '<td><div class="av2-agent-cell">' +
          '<div class="av2-agent-avatar">' + av2.escape(av2.initials(name)) + '</div>' +
          '<div class="av2-agent-meta">' +
            '<div class="av2-agent-name">' + av2.escape(name) + '</div>' +
            '<div class="av2-agent-ext">' + av2.escape(String(ext)) + '</div>' +
          '</div>' +
        '</div></td>' +
        '<td>' + av2.escape(live) + '</td>' +
        '<td><span class="av2-pill" data-state="' + state + '"><span class="av2-pill-dot"></span>' +
          av2.escape(agent.statusLabel || agent.status || 'Offline') +
        '</span></td>' +
        '<td>' + av2.escape(String(since)) + '</td>' +
        '<td>' + av2.escape(String(agent.inboundCalls != null ? agent.inboundCalls : '—')) + '</td>' +
        '<td>' + av2.escape(String(agent.outboundCalls != null ? agent.outboundCalls : '—')) + '</td>' +
        '<td>' + av2.escape(String(agent.missedCalls != null ? agent.missedCalls : '—')) + '</td>' +
        '<td>' + av2.escape(String(agent.aht || '—')) + '</td>' +
        '</tr>';
    },

    /* Replace the legacy team table tbody with v2 rendering */
    renderAgentTable(tbodySelector, agents) {
      const tbody = typeof tbodySelector === 'string' ? document.querySelector(tbodySelector) : tbodySelector;
      if (!tbody) return;
      if (!Array.isArray(agents) || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9"><div class="av2-empty">' +
          '<div class="av2-empty-ico">👥</div>' +
          '<div class="av2-empty-title">No agents tracked</div>' +
          '<div class="av2-empty-sub">Once your team is added in Manage Agents, they\'ll appear here in real time.</div>' +
        '</div></td></tr>';
        return;
      }
      tbody.innerHTML = agents.map((a, i) => av2.renderAgentRow(a, i)).join('');
      if (animate) {
        tbody.querySelectorAll('tr').forEach((tr, i) => {
          animate(tr, { opacity: [0, 1], y: [10, 0] }, { duration: 0.3, delay: i * 0.03, easing: [0.22, 1, 0.36, 1] });
        });
      }
    },

    /* Filter the v2 agent table by query (matches name or ext) */
    filterAgentTable(tbodySelector, query) {
      const tbody = typeof tbodySelector === 'string' ? document.querySelector(tbodySelector) : tbodySelector;
      if (!tbody) return;
      const q = (query || '').toLowerCase().trim();
      let visible = 0;
      tbody.querySelectorAll('tr').forEach(tr => {
        const name = (tr.dataset.name || '').toLowerCase();
        const ext  = (tr.dataset.ext  || '').toLowerCase();
        const match = !q || name.includes(q) || ext.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      return visible;
    }
  };

  /* Expose globally */
  window.av2 = av2;
})();
