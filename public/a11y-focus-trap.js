/**
 * a11y-focus-trap.js — small, dependency-free focus trap for modals (Session 9).
 *
 * Why we need this:
 *   When a user opens a modal via keyboard, Tab should cycle within the modal —
 *   not escape into the dimmed page underneath. Screen readers also expect
 *   focus to be inside aria-modal=true containers.
 *
 * Strategy: attach a `keydown` listener to the modal that intercepts Tab and
 *   Shift+Tab when focus would leave the container. Lightweight: no MutationObserver,
 *   no library, ~80 LOC.
 *
 * Public API (window-scoped):
 *   FocusTrap.activate(element)   → returns a release() function
 *   FocusTrap.release(element)    → manually release a trap
 *
 * Auto-discovers and traps:
 *   - Any `.ac-overlay`, `.sa-overlay`, `.an-overlay`, `.ba-overlay`,
 *     `.pc-overlay`, `.rx-modal-bg` that becomes visible
 *   - When the modal closes, the trap auto-releases. Some of these modules
 *     toggle an inline display:none/flex on a persistent element; others
 *     (bulk-actions.js, predict-center.js, roster-admin.js) instead
 *     append/remove the overlay element itself, with display:flex baked
 *     into their stylesheet — isVisible() below checks computed style +
 *     DOM presence so both patterns are detected the same way.
 *
 * Returns focus to the previously-focused element on release.
 */
(function () {
  'use strict';

  const TRAPS = new WeakMap();
  // WeakMap keys aren't enumerable, so we also keep a Set of elements with
  // an active trap — needed to notice when one of them is REMOVED from the
  // DOM entirely (bulk-actions.js/predict-center.js/roster-admin.js close
  // their modals with .remove() rather than hiding them), since a detached
  // element no longer matches any querySelectorAll(sel) for syncAll() to
  // find and release it through the normal path below.
  const ACTIVE = new Set();
  const FOCUSABLE_SELECTOR = [
    'a[href]:not([disabled])',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'audio[controls]',
    'video[controls]',
    'iframe',
    '[contenteditable]:not([contenteditable="false"])'
  ].join(',');

  function focusable(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }

  function activate(element) {
    if (!element || TRAPS.has(element)) return TRAPS.get(element);
    const previousFocus = document.activeElement;

    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusable(element);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !element.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !element.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    element.addEventListener('keydown', handler);
    // Focus first item if no current focus is inside
    const first = focusable(element)[0];
    if (first && !element.contains(document.activeElement)) {
      // Defer so animation/render completes
      setTimeout(() => first.focus(), 0);
    }

    const release = () => {
      element.removeEventListener('keydown', handler);
      TRAPS.delete(element);
      ACTIVE.delete(element);
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus(); } catch (e) {}
      }
    };
    TRAPS.set(element, release);
    ACTIVE.add(element);
    return release;
  }

  function release(element) {
    const fn = TRAPS.get(element);
    if (fn) fn();
  }

  /* Auto-activate / auto-release based on visibility of overlay modals. */
  const SELECTORS = ['.ac-overlay', '.sa-overlay', '.an-overlay', '.ba-overlay', '.pc-overlay', '.rx-modal-bg'];

  // Works for BOTH: (a) a persistent element toggled via inline
  // style.display, and (b) an element appended/removed from the DOM with
  // display:flex coming from its stylesheet class, not inline style — (a)
  // alone (checking modal.style.display) misses (b) entirely, since its
  // inline style is never set. offsetParent isn't used here because it's
  // null for position:fixed elements in some browsers, which every one of
  // these overlays is.
  function isVisible(modal) {
    if (!modal.isConnected) return false;
    const cs = window.getComputedStyle(modal);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function syncAll() {
    // Sweep first: a modal closed via .remove() (bulk-actions.js,
    // predict-center.js, roster-admin.js) is gone from the document by the
    // time this runs, so it won't be found by the selector query below —
    // without this, its trap would never release and focus would never be
    // restored to whatever was focused before it opened.
    ACTIVE.forEach(modal => { if (!modal.isConnected) release(modal); });
    SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(modal => {
        const visible = isVisible(modal);
        const has = TRAPS.has(modal);
        if (visible && !has) activate(modal);
        else if (!visible && has) release(modal);
      });
    });
  }

  // Use MutationObserver to react to style changes on overlays.
  function startWatch() {
    if (!window.MutationObserver) return;
    const observer = new MutationObserver(() => syncAll());
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['style']
    });
    syncAll();
  }

  document.addEventListener('DOMContentLoaded', startWatch);

  window.FocusTrap = { activate, release };
})();
