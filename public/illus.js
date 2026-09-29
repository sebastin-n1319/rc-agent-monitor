/* Session 63: original, animated illustrations shared by the main app and
 * /assess. Each one is a small inline SVG built from simple shapes (hex
 * shields, orbits, radar rings), coloured with the Adit orange and navy.
 * Motion lives in illus.css and switches off for reduced motion.
 *
 *   AditIllus.svg('gate' | 'pending' | 'denied' | 'inbox' | 'radar' | 'tests' | 'people' | 'log', { size })
 *   Any element with data-illus="name" is filled in automatically.
 */
(function () {
  'use strict';
  var uid = 0;
  function grad(id) {
    return '<defs>' +
      '<linearGradient id="' + id + 'o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB25C"/><stop offset="1" stop-color="#F4891F"/></linearGradient>' +
      '<linearGradient id="' + id + 'n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12476A"/><stop offset="1" stop-color="#072B40"/></linearGradient>' +
      '<radialGradient id="' + id + 'g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F4891F" stop-opacity=".35"/><stop offset="1" stop-color="#F4891F" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21AAE0" stop-opacity="0"/><stop offset=".5" stop-color="#21AAE0" stop-opacity=".55"/><stop offset="1" stop-color="#21AAE0" stop-opacity="0"/></linearGradient>' +
      '</defs>';
  }
  function hex(cx, cy, r) {
    var p = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 180 * (60 * i - 90); p.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); }
    return p.join(' ');
  }
  function floor(id) {
    // perspective grid under the scene
    var s = '<g class="il-floor" stroke="currentColor" stroke-opacity=".12" fill="none">';
    for (var i = 0; i < 6; i++) s += '<path d="M' + (20 + i * 40) + ' 176 L120 128"/>';
    s += '<path d="M8 176H232M34 160H206M58 146H182M80 136H160"/></g>';
    return s;
  }
  var ART = {
    gate: function (id) {
      return grad(id) + floor(id) +
        '<circle cx="120" cy="86" r="70" fill="url(#' + id + 'g)"/>' +
        '<g class="il-spin" style="transform-origin:120px 86px"><ellipse cx="120" cy="86" rx="92" ry="30" fill="none" stroke="#21AAE0" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="4 7"/><circle cx="212" cy="86" r="4" fill="#21AAE0"/></g>' +
        '<g class="il-spin-rev" style="transform-origin:120px 86px"><ellipse cx="120" cy="86" rx="30" ry="84" fill="none" stroke="#F4891F" stroke-opacity=".4" stroke-width="1.5" stroke-dasharray="2 8"/><circle cx="120" cy="2" r="3.5" fill="#F4891F"/></g>' +
        '<g class="il-float">' +
          '<polygon points="' + hex(120, 86, 46) + '" fill="url(#' + id + 'n)" stroke="url(#' + id + 'o)" stroke-width="3"/>' +
          '<polygon points="' + hex(120, 86, 34) + '" fill="none" stroke="#FFFFFF" stroke-opacity=".14" stroke-width="1.5"/>' +
          '<circle cx="120" cy="78" r="10" fill="url(#' + id + 'o)"/><path d="M114 84h12l3 20h-18z" fill="url(#' + id + 'o)"/>' +
          '<rect class="il-scan" x="76" y="40" width="88" height="14" fill="url(#' + id + 's)"/>' +
        '</g>' +
        '<g fill="#F4891F"><circle class="il-blink" cx="38" cy="40" r="2.5"/><circle class="il-blink d2" cx="206" cy="30" r="2"/><circle class="il-blink d3" cx="196" cy="140" r="2.5"/><circle class="il-blink d4" cx="46" cy="130" r="2"/></g>';
    },
    pending: function (id) {
      return grad(id) + floor(id) +
        '<g transform="translate(160 84)"><circle class="il-ring" r="22" fill="none" stroke="#F4891F" stroke-width="2"/><circle class="il-ring d2" r="22" fill="none" stroke="#F4891F" stroke-width="2"/><circle class="il-ring d3" r="22" fill="none" stroke="#F4891F" stroke-width="2"/>' +
          '<polygon points="' + hex(0, 0, 24) + '" fill="url(#' + id + 'n)" stroke="url(#' + id + 'o)" stroke-width="2.5"/>' +
          '<circle r="11" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2"/><path d="M0 -6V0l4 3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></g>' +
        '<path class="il-dash" d="M28 138 C 60 70, 110 150, 136 92" fill="none" stroke="#21AAE0" stroke-opacity=".6" stroke-width="2" stroke-dasharray="3 7"/>' +
        '<g class="il-fly"><g transform="translate(64 102) rotate(-24)"><path d="M0 0 L34 -12 L22 12 L14 4 Z" fill="url(#' + id + 'o)"/><path d="M14 4 L34 -12 L8 10 Z" fill="#C96A0E"/></g></g>' +
        '<g fill="#21AAE0"><circle class="il-blink" cx="36" cy="44" r="2"/><circle class="il-blink d3" cx="214" cy="40" r="2.5"/><circle class="il-blink d2" cx="100" cy="30" r="2"/></g>';
    },
    denied: function (id) {
      return grad(id) + floor(id) +
        '<g class="il-float"><polygon points="' + hex(120, 84, 46) + '" fill="url(#' + id + 'n)" stroke="#ED666B" stroke-opacity=".8" stroke-width="3"/>' +
        '<circle cx="120" cy="84" r="20" fill="none" stroke="#ED666B" stroke-width="4"/><path d="M106 98 L134 70" stroke="#ED666B" stroke-width="4" stroke-linecap="round"/></g>' +
        '<g class="il-spin" style="transform-origin:120px 84px"><ellipse cx="120" cy="84" rx="86" ry="26" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="1.5" stroke-dasharray="3 8"/></g>';
    },
    inbox: function (id) {
      return grad(id) + floor(id) +
        '<circle cx="120" cy="84" r="62" fill="url(#' + id + 'g)"/>' +
        '<g class="il-spin" style="transform-origin:120px 84px"><circle cx="120" cy="84" r="58" fill="none" stroke="#21AAE0" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="2 9"/><circle cx="178" cy="84" r="3.5" fill="#21AAE0"/></g>' +
        '<g class="il-float"><path d="M84 88 L96 60 H144 L156 88 V112 H84 Z" fill="url(#' + id + 'n)" stroke="url(#' + id + 'o)" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<path d="M84 88 H104 L110 98 H130 L136 88 H156" fill="none" stroke="url(#' + id + 'o)" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<circle cx="120" cy="46" r="13" fill="url(#' + id + 'o)"/><path d="M114 46 l4 4 8-8" fill="none" stroke="#1F1305" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>' +
        '<g fill="#F4891F"><circle class="il-blink" cx="60" cy="50" r="2"/><circle class="il-blink d2" cx="186" cy="44" r="2.5"/><circle class="il-blink d3" cx="190" cy="128" r="2"/></g>';
    },
    radar: function (id) {
      return grad(id) +
        '<circle cx="120" cy="88" r="70" fill="none" stroke="currentColor" stroke-opacity=".14"/><circle cx="120" cy="88" r="48" fill="none" stroke="currentColor" stroke-opacity=".14"/><circle cx="120" cy="88" r="26" fill="none" stroke="currentColor" stroke-opacity=".14"/>' +
        '<path d="M50 88H190M120 18V158" stroke="currentColor" stroke-opacity=".1"/>' +
        '<g class="il-spin" style="transform-origin:120px 88px;animation-duration:3.4s"><path d="M120 88 L120 18 A70 70 0 0 1 169.5 38.5 Z" fill="url(#' + id + 'o)" fill-opacity=".28"/><path d="M120 88 L169.5 38.5" stroke="#F4891F" stroke-width="2"/></g>' +
        '<circle class="il-blink" cx="150" cy="52" r="4" fill="#F4891F"/><circle class="il-blink d2" cx="80" cy="108" r="3.5" fill="#21AAE0"/><circle class="il-blink d3" cx="138" cy="132" r="3" fill="#21AAE0"/>' +
        '<circle cx="120" cy="88" r="6" fill="url(#' + id + 'o)"/>';
    },
    tests: function (id) {
      return grad(id) + floor(id) +
        '<circle cx="120" cy="84" r="64" fill="url(#' + id + 'g)"/>' +
        '<g class="il-float"><rect x="86" y="34" width="68" height="92" rx="10" fill="url(#' + id + 'n)" stroke="url(#' + id + 'o)" stroke-width="2.5"/>' +
          '<rect x="104" y="28" width="32" height="12" rx="4" fill="url(#' + id + 'o)"/>' +
          '<g stroke="#fff" stroke-opacity=".75" stroke-width="2.5" stroke-linecap="round" fill="none"><path d="M98 62 l4 4 8-8"/><path d="M118 63h24"/><path d="M98 84 l4 4 8-8"/><path d="M118 85h24"/><path d="M118 107h16" stroke-opacity=".35"/><rect x="98" y="100" width="12" height="12" rx="3" stroke-opacity=".35"/></g>' +
          '<rect class="il-scan" x="88" y="40" width="64" height="12" fill="url(#' + id + 's)"/></g>' +
        '<g class="il-spin" style="transform-origin:120px 84px"><circle cx="120" cy="84" r="74" fill="none" stroke="#21AAE0" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="3 9"/><circle cx="194" cy="84" r="4" fill="#F4891F"/></g>';
    },
    people: function (id) {
      return grad(id) + floor(id) +
        '<g class="il-spin" style="transform-origin:120px 86px"><circle cx="120" cy="86" r="64" fill="none" stroke="#21AAE0" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="2 8"/></g>' +
        '<g class="il-float"><polygon points="' + hex(120, 86, 40) + '" fill="url(#' + id + 'n)" stroke="url(#' + id + 'o)" stroke-width="2.5"/>' +
          '<circle cx="120" cy="76" r="10" fill="url(#' + id + 'o)"/><path d="M100 106 a20 16 0 0 1 40 0" fill="url(#' + id + 'o)"/></g>' +
        '<g><circle cx="56" cy="70" r="12" fill="url(#' + id + 'n)" stroke="#21AAE0" stroke-width="2"/><circle cx="184" cy="70" r="12" fill="url(#' + id + 'n)" stroke="#21AAE0" stroke-width="2"/>' +
          '<path class="il-dash" d="M68 72 L84 80M172 72 L156 80" stroke="#21AAE0" stroke-width="2" stroke-dasharray="3 5"/></g>';
    },
    log: function (id) {
      return grad(id) + floor(id) +
        '<g class="il-float"><rect x="70" y="36" width="100" height="92" rx="12" fill="url(#' + id + 'n)" stroke="url(#' + id + 'o)" stroke-width="2.5"/>' +
          '<g stroke-linecap="round" stroke-width="3"><path d="M86 58h10" stroke="#F4891F"/><path d="M104 58h50" stroke="#fff" stroke-opacity=".6"/><path d="M86 78h10" stroke="#21AAE0"/><path d="M104 78h38" stroke="#fff" stroke-opacity=".6"/><path d="M86 98h10" stroke="#F4891F"/><path d="M104 98h44" stroke="#fff" stroke-opacity=".6"/></g>' +
          '<rect class="il-scan" x="72" y="42" width="96" height="12" fill="url(#' + id + 's)"/></g>' +
        '<g transform="translate(172 124)"><circle r="18" fill="url(#' + id + 'o)"/><circle r="7" fill="none" stroke="#1F1305" stroke-width="3"/><path d="M5 5l7 7" stroke="#1F1305" stroke-width="3" stroke-linecap="round"/></g>';
    },
  };
  function svg(name, opts) {
    opts = opts || {};
    var f = ART[name] || ART.radar;
    var id = 'il' + (++uid) + '_';
    var w = opts.size || 200;
    return '<svg class="il il-' + name + '" viewBox="0 0 240 180" width="' + w + '" height="' + Math.round(w * 0.75) + '" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + f(id) + '</svg>';
  }
  function hydrate(root) {
    (root || document).querySelectorAll('[data-illus]:not([data-illus-done])').forEach(function (el) {
      el.innerHTML = svg(el.getAttribute('data-illus'), { size: Number(el.getAttribute('data-size')) || undefined });
      el.setAttribute('data-illus-done', '1');
    });
  }
  // Empty states in the main app: any ".no-data" message (not a loading
  // one) gets a small animated radar above its text.
  function dressEmpty(el) {
    if (!el || el.getAttribute('data-il')) return;
    var t = (el.textContent || '').trim();
    if (!t || /^loading/i.test(t)) return;
    el.setAttribute('data-il', '1');
    el.classList.add('il-nodata');
    var art = document.createElement('span');
    art.className = 'il-nodata-art';
    art.innerHTML = svg(/agent|people|user/i.test(t) ? 'people' : /log|record|event|change/i.test(t) ? 'log' : 'radar', { size: 120 });
    el.insertBefore(art, el.firstChild);
  }
  function watchEmpty(sel) {
    var scan = function (root) { (root.querySelectorAll ? root : document).querySelectorAll(sel).forEach(dressEmpty); };
    scan(document);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') { var p = m.target.parentElement; if (p && p.matches && p.matches(sel)) dressEmpty(p); continue; }
        for (var k = 0; k < m.addedNodes.length; k++) {
          var n = m.addedNodes[k];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches(sel)) dressEmpty(n);
          if (n.querySelectorAll) n.querySelectorAll(sel).forEach(dressEmpty);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.AditIllus = { svg: svg, hydrate: hydrate, watchEmpty: watchEmpty };
  function boot() { hydrate(); if (document.getElementById('mainApp')) watchEmpty('.no-data'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
