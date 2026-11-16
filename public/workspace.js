/**
 * Batch 353: workspaces. One tool, two workspaces: T1 CS (as it is) and
 * Adit Pay. People whose access includes both get a switch in the top bar.
 *
 * The Adit Pay look keeps the same layout and palette. It swaps T1's orange
 * accent for the palette's teal (worked out from the live stylesheets, so it
 * covers every page without touching them), uses DM Sans for text with
 * Poppins kept for titles, and adds thin colored lines under card titles,
 * the top bar and the active page. Status colors (warnings, late, missed,
 * alerts) are left as they are so their meaning does not change.
 */
(function () {
  'use strict';
  var KEY = 'rcWorkspace';
  var NAMES = { t1: 'T1 CS', aditpay: 'Adit Pay' };
  var state = { list: ['t1'], current: 't1' };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ---- color mapping: orange hues become teal, everything else untouched ----
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h /= 360;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (v) { return Math.round(v * 255); });
  }
  function isOrange(rgb) {
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    return hsl[0] >= 14 && hsl[0] <= 38 && hsl[1] >= 0.45 && hsl[2] > 0.12;
  }
  function toTeal(rgb) {
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    // palette teal is #36AFB4 (hue 182, sat ~54%); keep the tint's lightness
    var l = hsl[2], s = Math.min(hsl[1], 0.62);
    if (l > 0.35 && l < 0.65) l = Math.max(0.36, l - 0.06); // solid accents read a touch deeper
    return hslToRgb(182, s, l);
  }
  var COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g;
  function swapColors(val) {
    var hit = false;
    var out = val.replace(COLOR_RE, function (m) {
      var rgb, a = null;
      if (m[0] === '#') { rgb = hexToRgb(m); if (m.length === 9) a = parseInt(m.slice(7, 9), 16) / 255; }
      else { var n = m.match(/[\d.]+/g).map(Number); rgb = n.slice(0, 3); if (n.length > 3) a = n[3]; }
      if (!rgb || !isOrange(rgb)) return m;
      hit = true;
      var t = toTeal(rgb);
      return a == null ? 'rgb(' + t.join(',') + ')' : 'rgba(' + t.join(',') + ',' + a + ')';
    });
    return hit ? out : null;
  }

  var SKIP_SEL = /warn|late|overdue|breach|risk|danger|error|alert|missed|outage|\bob-|urgent|sla|over-?limit|exceed|critical|stale|pending-review|strike/i;
  var HEAD_SEL = /\bh[1-4]\b|title|heading|brand|logo|hm-name|kpi-val|stat-val|big|hero|display|mono|code|kbd|\.num/i;
  var PROPS = ['color', 'background', 'background-color', 'background-image', 'border', 'border-color', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'outline', 'outline-color', 'box-shadow', 'fill', 'stroke', 'text-decoration-color', 'caret-color', 'accent-color'];

  function prefix(sel) {
    return sel.split(',').map(function (s) {
      s = s.trim();
      if (!s) return s;
      if (/^(html|:root)\b/.test(s)) return null;
      if (/^body\b/.test(s)) return s.replace(/^body/, 'body.ws-aditpay');
      return 'body.ws-aditpay ' + s;
    }).filter(Boolean).join(', ');
  }

  function scanRules(rules, out) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.cssRules && r.media) { // @media
        var inner = []; scanRules(r.cssRules, inner);
        if (inner.length) out.push('@media ' + r.media.mediaText + '{' + inner.join('') + '}');
        continue;
      }
      if (!r.selectorText || !r.style) continue;
      var sel = r.selectorText;
      var decl = [];
      if (!SKIP_SEL.test(sel)) {
        for (var p = 0; p < PROPS.length; p++) {
          var v = r.style.getPropertyValue(PROPS[p]);
          if (!v) continue;
          var nv = swapColors(v);
          if (nv) decl.push(PROPS[p] + ':' + nv + ' !important');
        }
      }
      var ff = r.style.getPropertyValue('font-family');
      if (ff && /Poppins/i.test(ff) && !HEAD_SEL.test(sel)) decl.push("font-family:'DM Sans','Poppins',system-ui,sans-serif !important");
      if (decl.length) { var ps = prefix(sel); if (ps) out.push(ps + '{' + decl.join(';') + '}'); }
    }
  }

  var BASE = [
    "body.ws-aditpay{font-family:'DM Sans','Poppins',system-ui,sans-serif;font-variant-numeric:tabular-nums}",
    // thin colored lines: top bar, card titles, active page
    "html body.ws-aditpay #mainApp header.hm-bar::after{content:\"\"!important;position:absolute!important;left:0!important;right:0!important;top:auto!important;bottom:-1px!important;height:2px!important;width:auto!important;background:#36AFB4!important;animation:none!important;opacity:1!important;transform:none!important;pointer-events:none!important}",
    "body.ws-aditpay .hm-stars{display:none !important}",
    "body.ws-aditpay .card-title,body.ws-aditpay .tl-card-title,body.ws-aditpay .acx-title,body.ws-aditpay .ld-panel-title,body.ws-aditpay .btk-panel-title{background-image:linear-gradient(#36AFB4,#36AFB4)!important;background-size:28px 2px!important;background-repeat:no-repeat!important;background-position:0 100%!important;padding-bottom:6px!important}",
    // workspace switch
    ".ws-sw{display:inline-flex;align-items:center;background:#F0F2F5;border-radius:999px;padding:3px;margin-left:10px;gap:2px;font:600 11.5px 'Poppins',sans-serif}",
    ".ws-sw button{border:0;background:transparent;color:#6B849A;padding:5px 11px;border-radius:999px;cursor:pointer;font:inherit;line-height:1.2}",
    ".ws-sw button:focus-visible{outline:2px solid #21AAE0;outline-offset:1px}",
    ".ws-sw button[aria-pressed=true]{background:#F4891F;color:#fff}",
    "body.ws-aditpay .ws-sw button[aria-pressed=true]{background:#2A9FA4;color:#fff}",
    ".ws-tag{display:none;margin-left:8px;font:600 10.5px 'DM Sans',sans-serif;color:#1F8E93;background:#E6F6F6;padding:3px 8px;border-radius:999px;white-space:nowrap}",
    "body.ws-aditpay .ws-tag{display:inline-block}",
    // Batch 360: T1 processes with no Adit Pay counterpart are not shown in the Adit Pay workspace
    "body.ws-aditpay #sb-bonus,body.ws-aditpay #sb-audits,body.ws-aditpay #sb-ai-agent,body.ws-aditpay #sb-agent-bonus,body.ws-aditpay #sb-agent-tickets,body.ws-aditpay #sb-agent-audits,body.ws-aditpay #sb-agent-qateach,body.ws-aditpay #sb-agent-hall,body.ws-aditpay #brain-fab-wrap,body.ws-aditpay #brain-panel{display:none !important}",
    "body.ws-aditpay .sb-subtab-btn[data-tab=cf1025],body.ws-aditpay .sb-subtab-btn[data-tab=roster],body.ws-aditpay .sb-subtab-btn[data-tab=callsummary],body.ws-aditpay .sb-subtab-btn[data-tab=ticket-hygiene],body.ws-aditpay .sb-subtab-btn[data-tab=voip-project],body.ws-aditpay .sb-subtab-btn[data-tab=voip-fix],body.ws-aditpay .sb-subtab-btn[data-tab=custom-reports],body.ws-aditpay .sb-subtab-btn[data-tab=digest],body.ws-aditpay .sb-subtab-btn[data-tab=alerts-missed]{display:none !important}"
  ].join('\n');

  var built = '';
  function build() {
    var out = [];
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      if (sh.disabled) continue;
      if (sh.ownerNode && sh.ownerNode.id === 'ws-css') continue;
      var rules; try { rules = sh.cssRules; } catch (e) { continue; }
      if (rules) scanRules(rules, out);
    }
    return BASE + '\n' + out.join('\n');
  }
  function ensureStyle() {
    var st = document.getElementById('ws-css');
    if (!st) { st = document.createElement('style'); st.id = 'ws-css'; document.head.appendChild(st); }
    return st;
  }
  function ensureFont() {
    if (document.getElementById('ws-font')) return;
    var l = document.createElement('link');
    l.id = 'ws-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap';
    document.head.appendChild(l);
  }
  var timer = null;
  function refresh() {
    if (state.current !== 'aditpay') return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      var css = build();
      if (css !== built) { built = css; ensureStyle().textContent = css; }
    }, 250);
  }

  // ---- header switch ----
  function renderSwitch() {
    var brand = document.querySelector('.hm-brand');
    if (!brand) return;
    var t1 = brand.querySelector('.hm-t1');
    if (t1) t1.textContent = NAMES[state.current] || 'T1 CS';
    var sw = document.getElementById('wsSwitch');
    if (state.list.length < 2) { if (sw) sw.remove(); return; }
    if (!sw) {
      sw = document.createElement('div');
      sw.id = 'wsSwitch'; sw.className = 'ws-sw'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Workspace');
      brand.parentNode.insertBefore(sw, brand.nextSibling);
    }
    sw.innerHTML = state.list.map(function (w) {
      return '<button type="button" data-ws="' + w + '" aria-pressed="' + (w === state.current) + '">' + NAMES[w] + '</button>';
    }).join('');
    sw.onclick = function (e) {
      var b = e.target.closest('button[data-ws]');
      if (b && b.dataset.ws !== state.current) set(b.dataset.ws);
    };
  }

  function apply() {
    document.body.classList.toggle('ws-aditpay', state.current === 'aditpay');
    document.body.setAttribute('data-workspace', state.current);
    if (state.current === 'aditpay') { ensureFont(); ensureStyle(); refresh(); }
    renderSwitch();
    try { window.dispatchEvent(new CustomEvent('workspace-change', { detail: { workspace: state.current } })); } catch (e) {}
  }

  // Batch 355: the Adit Pay workspace has its own home page in the sidebar.
  function syncNav(go) {
    var sb = document.getElementById('sb-aditpay');
    if (sb) sb.style.display = state.current === 'aditpay' ? '' : 'none';
    var onPay = document.getElementById('tab-aditpay') && document.getElementById('tab-aditpay').classList.contains('active');
    if (typeof window.sbAdmin !== 'function') return;
    if (state.current === 'aditpay' && go && sb) window.sbAdmin('aditpay', sb);
    else if (state.current !== 'aditpay' && onPay) window.sbAdmin('live', document.getElementById('sb-live'));
  }

  // Batch 360: every page's data comes from the workspace (ws-fetch.js sends it with each request), so a switch reloads
  // the tool in the other workspace instead of mixing what is already on screen.
  function set(ws) {
    if (state.list.indexOf(ws) < 0) return;
    lsSet(KEY, ws);
    try { localStorage.setItem('rcActiveTab', ws === 'aditpay' ? 'aditpay' : 'live'); } catch (e) {}
    location.reload();
  }

  function init(list) {
    state.list = (list && list.length ? list : ['t1']).filter(function (w) { return NAMES[w]; });
    if (!state.list.length) state.list = ['t1'];
    var saved = lsGet(KEY);
    state.current = state.list.indexOf(saved) >= 0 ? saved : (state.list.indexOf('t1') >= 0 ? 't1' : state.list[0]);
    apply(); syncNav(false);
  }

  window.Workspace = { get: function () { return state.current; }, list: function () { return state.list.slice(); }, set: set };

  // Restyle when pages inject or enable new stylesheets.
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.target && m.target.id === 'ws-css') continue;
        if (m.type === 'childList' || m.attributeName === 'disabled' || m.attributeName === 'media') { refresh(); break; }
      }
    }).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'media'] });
  } catch (e) {}

  function boot() {
    // Fast start from the last known value, then confirm with the server.
    var cached = lsGet('rcWorkspaces');
    if (cached) { try { init(JSON.parse(cached)); } catch (e) {} }
    fetch('/api/session', { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (s) {
      if (!s || !s.success) return;
      var list = Array.isArray(s.workspaces) ? s.workspaces : ['t1'];
      lsSet('rcWorkspaces', JSON.stringify(list));
      init(list);
      // Batch 360: the page loaded with an older workspace (first sign-in, or access changed): load it again in the right one
      if ((window.__ws || '') !== state.current) {
        var guard = 0; try { guard = Number(sessionStorage.getItem('rcWsReload') || 0); } catch (e) {}
        if (Date.now() - guard > 20000) { try { sessionStorage.setItem('rcWsReload', String(Date.now())); localStorage.setItem('rcActiveTab', state.current === 'aditpay' ? 'aditpay' : 'live'); } catch (e) {} location.reload(); }
      }
    }).catch(function () {});
    // The header can render after this script: place the switch once it exists.
    var tries = 0, iv = setInterval(function () { tries++; if (document.querySelector('.hm-brand')) { renderSwitch(); syncNav(false); clearInterval(iv); } else if (tries > 40) clearInterval(iv); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
