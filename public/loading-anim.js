/* Loading animation for the plain "Loading..." text that many pages show while they fetch data.
   Any text that is only "Loading", "Loading something..." or the same with an ellipsis, is swapped for three
   bouncing dots with a soft shimmer on the words. The words stay (screen readers still hear them) and the
   page's own code replaces the whole thing when the data arrives, so nothing else needs to change. */
(function () {
  'use strict';
  // The styles live in loading-anim.css (an inline style tag is blocked by the page's content security policy).
  var RE = /^(?:⏳\s*)?loading(?:\s+[a-z0-9 ,'\-]{1,40}?)?\s*(?:\.{2,4}|…)$/i;
  var SKIP = /^(BUTTON|OPTION|SCRIPT|STYLE|TEXTAREA|INPUT|TITLE|SELECT|NOSCRIPT)$/;

  function build(label) {
    var w = document.createElement('span'); w.className = 'ldx-w'; w.setAttribute('role', 'status');
    var d = document.createElement('span'); d.className = 'ldx-d'; d.setAttribute('aria-hidden', 'true');
    d.appendChild(document.createElement('i')); d.appendChild(document.createElement('i')); d.appendChild(document.createElement('i'));
    var t = document.createElement('span'); t.className = 'ldx-t'; t.textContent = label;
    w.appendChild(d); w.appendChild(t); return w;
  }
  function fix(node) {
    var p = node.parentNode;
    if (!p || p.nodeType !== 1 || SKIP.test(p.tagName) || p.closest('.ldx-w,button,[contenteditable]')) return;
    var txt = node.nodeValue.trim();
    if (!RE.test(txt)) return;
    // Skip places that already draw their own spinner next to the words.
    for (var c = p.firstElementChild; c; c = c.nextElementSibling) { if (/spinner|ld-orb|ldx/i.test(c.className || '')) return; }
    var label = txt.replace(/^⏳\s*/, '').replace(/\s*(?:\.{2,4}|…)$/, '');
    // The old hourglass icon some empty states put beside the title goes away.
    var prev = p.previousElementSibling;
    if (prev && /ico/i.test(prev.className || '') && /⏳/.test(prev.textContent || '')) prev.style.display = 'none';
    node.parentNode.replaceChild(build(label), node);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 || SKIP.test(root.tagName)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) { if (n.nodeValue.length < 60 && /loading/i.test(n.nodeValue)) list.push(n); }
    list.forEach(fix);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') fix(m.target);
        else for (var k = 0; k < m.addedNodes.length; k++) scan(m.addedNodes[k]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
