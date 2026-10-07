/* Dark mode contrast guard. Some buttons and badges are filled with a bright colour in inline styles, which
   a stylesheet cannot reach. In dark mode this gives any such fill a dark label when white text would fail 4.5:1.
   It only touches the colour of the text, and removes its changes when dark mode is switched off. */
(function () {
  'use strict';
  var root = document.documentElement, timer = null, MARK = 'data-dkc';
  function rgb(s) { var m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; var p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c) { function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function fill(cs) {
    var c = rgb(cs.backgroundColor);
    if ((!c || c.a < 0.9) && cs.backgroundImage && cs.backgroundImage.indexOf('gradient') > -1) { var m = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (m) c = rgb(m[0]); }
    return c && c.a >= 0.9 ? c : null;
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function pass() {
    timer = null;
    if (!root.classList.contains('dark-mode')) return;
    var list = document.querySelectorAll('button, .btn, [role="button"], [class*="badge"], [class*="pill"]');
    var n = Math.min(list.length, 900);
    for (var i = 0; i < n; i++) {
      var el = list[i];
      if (el.hasAttribute(MARK) || el.offsetWidth === 0 || el.closest('#brain-panel,#brain-bubble')) continue;
      var cs = getComputedStyle(el), bg = fill(cs), fg = rgb(cs.color);
      if (!bg || !fg || lum(bg) < 0.2) continue;
      if (ratio(fg, bg) < 4.5) { el.style.setProperty('color', '#06202F', 'important'); el.setAttribute(MARK, '1'); }
    }
  }
  function schedule() { if (timer || !root.classList.contains('dark-mode')) return; timer = setTimeout(pass, 700); }
  function undo() { document.querySelectorAll('[' + MARK + ']').forEach(function (el) { el.style.removeProperty('color'); el.removeAttribute(MARK); }); }
  function start() {
    new MutationObserver(function () { schedule(); }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(function () { if (root.classList.contains('dark-mode')) schedule(); else undo(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
    schedule();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
