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
 *   - Any `.ac-overlay`, `.sa-overlay`, `.an-overlay` shown with display:flex
 *   - When the modal closes (display:none), the trap auto-releases
 *
 * Returns focus to the previously-focused element on release.
 */
(function () {
  'use strict';

  const TRAPS = new WeakMap();
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
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus(); } catch (e) {}
      }
    };
    TRAPS.set(element, release);
    return release;
  }

  function release(element) {
    const fn = TRAPS.get(element);
    if (fn) fn();
  }

  /* Auto-activate / auto-release based on visibility of overlay modals.
   * Watches for display:flex (open) vs display:none (closed). */
  const SELECTORS = ['.ac-overlay', '.sa-overlay', '.an-overlay'];

  function syncAll() {
    SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(modal => {
        const visible = modal.style.display === 'flex' && modal.offsetParent !== null;
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
