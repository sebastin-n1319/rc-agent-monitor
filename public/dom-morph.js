/* Batch 234: update a page section in place instead of replacing it.
 * window.morphHTML(el, html) turns el's content into html while keeping the nodes that did not change, so periodic
 * refreshes do not rebuild headings, cards and lists (no flashing, no lost scroll, focus, hover or open menus).
 * Returns false when nothing changed. */
(function () {
  'use strict';
  function sameKind(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    if (a.tagName !== b.tagName) return false;
    const ka = a.getAttribute('data-key') || a.id, kb = b.getAttribute('data-key') || b.id;
    return !ka || !kb || ka === kb;
  }
  function syncAttrs(from, to) {
    for (const at of Array.from(from.attributes)) if (!to.hasAttribute(at.name)) from.removeAttribute(at.name);
    for (const at of Array.from(to.attributes)) if (from.getAttribute(at.name) !== at.value) from.setAttribute(at.name, at.value);
    // keep what the person typed or picked; only follow the new value when the field is not being edited
    if ((from.tagName === 'INPUT' || from.tagName === 'TEXTAREA' || from.tagName === 'SELECT') && document.activeElement !== from) {
      if ('value' in to && from.value !== to.value && to.hasAttribute('value')) from.value = to.value;
      if (from.type === 'checkbox' || from.type === 'radio') from.checked = to.hasAttribute('checked');
    }
  }
  function morphChildren(from, to) {
    let a = from.firstChild, b = to.firstChild;
    while (b) {
      const next = b.nextSibling;
      if (!a) { from.appendChild(b); b = next; continue; }
      if (sameKind(a, b)) {
        if (a.nodeType === 1) { syncAttrs(a, b); if (a.tagName !== 'SCRIPT') morphChildren(a, b); }
        else if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
        a = a.nextSibling;
      } else {
        from.insertBefore(b, a);
      }
      b = next;
    }
    while (a) { const n = a.nextSibling; from.removeChild(a); a = n; }
  }
  window.morphHTML = function (el, html) {
    if (!el) return false;
    if (el.__morphLast === html) return false;
    el.__morphLast = html;
    if (!el.firstChild) { el.innerHTML = html; return true; }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphChildren(el, tpl.content);
    return true;
  };
})();
