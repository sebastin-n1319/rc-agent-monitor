/**
 * adit-reset.js
 * Nuclear CSS reset — disables ALL inline <style> blocks (except auth-gate-css)
 * and ALL external stylesheets (except Google Fonts, Chart.js, adit-theme.css).
 * Then adit-theme.css becomes the sole design source with a clean slate.
 *
 * Run this as the FIRST script in <head> so it fires before paint.
 */
(function () {
  'use strict';

  var KEEP_STYLE_IDS = { 'auth-gate-css': true, 'ui-engine-css': true };
  var KEEP_HREF_FRAGMENTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'adit-theme.css',
    'agent-view-v2.css',
    'alert-center.css',
    'schedule-admin.css',
    'anomaly-center.css',
    'offline-bridge.css',
    'chart.umd',
    'cdnjs.cloudflare.com'
  ];

  function shouldKeepLink(href) {
    if (!href) return false;
    for (var i = 0; i < KEEP_HREF_FRAGMENTS.length; i++) {
      if (href.indexOf(KEEP_HREF_FRAGMENTS[i]) !== -1) return true;
    }
    return false;
  }

  function disableConflictingStyles() {
    /* Disable all <style> tags except auth-gate-css */
    var styles = document.querySelectorAll('style');
    for (var i = 0; i < styles.length; i++) {
      var el = styles[i];
      if (!KEEP_STYLE_IDS[el.id]) {
        el.disabled = true;
        el.setAttribute('media', 'not all'); /* belt + braces */
      }
    }

    /* Disable external <link rel="stylesheet"> except Google Fonts / CDN / adit-theme */
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var j = 0; j < links.length; j++) {
      var link = links[j];
      if (!shouldKeepLink(link.getAttribute('href') || link.href)) {
        link.disabled = true;
      }
    }
  }

  /* Run immediately if DOM is ready, otherwise wait */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableConflictingStyles);
  } else {
    disableConflictingStyles();
  }

  /* Watch for dynamically injected <style> blocks and disable them too */
  if (window.MutationObserver) {
    var observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        for (var n = 0; n < added.length; n++) {
          var node = added[n];
          if (node.tagName === 'STYLE' && !KEEP_STYLE_IDS[node.id]) {
            node.disabled = true;
            node.setAttribute('media', 'not all');
          }
        }
      }
    });
    /* Start observing as early as possible */
    var target = document.documentElement || document.head || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }
})();
