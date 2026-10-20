/* Batch 183: Adit Expert on every page of the tool. A brain button bottom right opens the Expert in a side panel
   (the /guides page in widget mode), so agents can ask without leaving what they are doing. Hidden on the
   Assessments pages (no help during a test) and on the Expert page itself, and only shown once signed in. */
(function () {
  'use strict';
  if (window.__aditExpertWidget) return; window.__aditExpertWidget = true;
  var css = [
    /* A slim edge tab above the Brain tab: brain icon on top, "Expert" written down the tab, always fully on screen. */
    '.axw-btn{position:fixed;right:0;bottom:152px;z-index:2147483646;display:flex;flex-direction:column;align-items:center;gap:8px;width:40px;padding:8px 0 12px;border:0;border-radius:14px 0 0 14px;cursor:pointer;',
    'background:#0B2A5B;color:#fff;box-shadow:-4px 6px 18px rgba(7,43,64,.22);transition:width .2s ease,background .2s ease}',
    '.axw-btn:hover,.axw-btn:focus-visible{width:46px;background:#0E3570}.axw-btn.on,.axw-btn[hidden]{display:none!important}',
    '.axw-btn:focus-visible{outline:2px solid #F4891F;outline-offset:2px}',
    '.axw-ic{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#F7A452,#E5671B);color:#fff;flex:none}',
    '.axw-ic svg{width:19px;height:19px}',
    '.axw-lb{writing-mode:vertical-rl;transform:rotate(180deg);font:600 12px/1 Poppins,system-ui,sans-serif;letter-spacing:.06em;color:#fff;white-space:nowrap}',
    '.axw-panel{position:fixed;top:12px;right:12px;bottom:46px;z-index:2147483646;width:min(480px,calc(100vw - 24px));display:flex;flex-direction:column;border-radius:18px;overflow:hidden;',
    'background:#F4F6F9;border:1px solid rgba(11,42,63,.12);box-shadow:0 24px 70px rgba(7,43,64,.28);transform:translateX(calc(100% + 24px));transition:transform .28s cubic-bezier(.2,.8,.2,1);visibility:hidden}',
    '.axw-panel.open{transform:none;visibility:visible}',
    '.axw-hd{display:flex;align-items:center;gap:10px;height:48px;padding:0 10px 0 14px;background:#0B2A3F;color:#fff;font:600 14px Poppins,system-ui,sans-serif}',
    '.axw-hd svg{width:24px;height:24px}',
    '.axw-hd .sp{flex:1}',
    '.axw-hd a,.axw-hd button{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff;font:500 12.5px Poppins,system-ui,sans-serif;text-decoration:none;cursor:pointer}',
    '.axw-hd a:hover,.axw-hd button:hover{background:rgba(255,255,255,.1)}',
    '.axw-panel iframe{flex:1;width:100%;border:0;background:#F4F6F9}',
    '.axw-dark .axw-panel,.axw-dark .axw-panel iframe{background:#061520;border-color:#1D3A52}',
    '@media (max-width:600px){.axw-panel{top:0;right:0;bottom:0;width:100vw;border-radius:0}.axw-btn.on{display:none}}',
    '@media (prefers-reduced-motion:reduce){.axw-btn,.axw-panel{transition:none}}',
  ].join('');
  var BRAIN = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M13 6.5a3.5 3.5 0 0 0-6.6 1.7A4 4 0 0 0 4.5 15a4 4 0 0 0 1.8 6.6A4 4 0 0 0 13 24.5V6.5z" fill="rgba(255,255,255,.35)"/>'
    + '<path d="M19 6.5a3.5 3.5 0 0 1 6.6 1.7A4 4 0 0 1 27.5 15a4 4 0 0 1-1.8 6.6A4 4 0 0 1 19 24.5V6.5z" fill="rgba(255,255,255,.35)"/>'
    + '<path d="M13 11H10M13 16H8.5M13 20.5h-2.5M19 11h3M19 16h4.5M19 20.5h2.5"/><path d="M16 5v22"/></svg>';
  var st = document.createElement('style'); st.id = 'expert-widget-css'; st.textContent = css; document.head.appendChild(st);
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'axw-btn'; btn.hidden = true;
  btn.setAttribute('aria-label', 'Ask Adit Expert'); btn.title = 'Ask Adit Expert (Alt+E)';
  btn.innerHTML = '<span class="axw-ic">' + BRAIN + '</span><span class="axw-lb">Expert</span>';
  var panel = document.createElement('aside');
  panel.className = 'axw-panel'; panel.setAttribute('aria-label', 'Adit Expert'); panel.setAttribute('role', 'dialog');
  panel.innerHTML = '<div class="axw-hd">' + BRAIN + '<span>Adit Expert</span><span class="sp"></span><a href="/guides" target="_blank" rel="noopener">Full page</a><button type="button" aria-label="Close">Close</button></div>';
  var frame = null, open = false, allowed = false;
  document.body.appendChild(btn); document.body.appendChild(panel);
  function dark() { var t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (!t && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) || document.body.classList.contains('dark-mode'); }
  function setOpen(v) {
    open = v;
    if (v && !frame) { frame = document.createElement('iframe'); frame.title = 'Adit Expert'; frame.setAttribute('allow', 'fullscreen'); frame.src = '/guides?embed=1&widget=1#ask'; panel.appendChild(frame); }
    document.documentElement.classList.toggle('axw-dark', dark());
    panel.classList.toggle('open', v); btn.classList.toggle('on', v); btn.setAttribute('aria-expanded', String(v));
    var bw = document.getElementById('brain-fab-wrap'); if (bw) bw.style.visibility = v ? 'hidden' : '';
    if (v && frame) setTimeout(function () { try { frame.focus(); } catch (e) {} }, 300); else if (!v) btn.focus();
  }
  btn.addEventListener('click', function () { setOpen(!open); });
  panel.querySelector('.axw-hd button').addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open) setOpen(false);
    if (e.altKey && (e.key === 'e' || e.key === 'E' || e.code === 'KeyE') && allowed && !btn.hidden) { e.preventDefault(); setOpen(!open); }
  });
  // No help during a test, and no second copy where Adit Expert is already on screen. The app shows those pages in
  // frames (/assess, /guides), so look for a visible frame rather than a page id.
  function visible(el) { if (!el) return false; var r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 40) return false; for (var n = el; n && n !== document; n = n.parentNode) { if (n.nodeType === 1) { var cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } } return true; }
  function blocked() {
    if (document.fullscreenElement || /^\/(assess|guides)/.test(location.pathname)) return true;
    var fr = document.querySelectorAll('iframe');
    for (var i = 0; i < fr.length; i++) { if (frame && fr[i] === frame) continue; var src = fr[i].getAttribute('src') || fr[i].getAttribute('data-src') || ''; if (/\/(assess|guides)\b/.test(src) && visible(fr[i])) return true; }
    return false;
  }
  function sync() { var hide = !allowed || blocked(); btn.hidden = hide; if (hide && open) setOpen(false); }
  function check() {
    fetch('/api/guides/expert/meta', { credentials: 'same-origin' }).then(function (r) { allowed = r.ok; sync(); if (!allowed) setTimeout(check, 30000); }).catch(function () { setTimeout(check, 30000); });
  }
  setInterval(sync, 800);
  document.addEventListener('fullscreenchange', sync);
  setTimeout(check, 1500);
})();
