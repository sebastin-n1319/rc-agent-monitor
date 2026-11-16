/**
 * Batch 355: Adit Pay workspace home (queue, revenue, terminals, adoption). Data: GET /api/aditpay/home.
 * Uses the tool's palette; teal comes from the workspace style.
 */
(function () {
  'use strict';
  var CSS = [
    '.aph{padding:4px 2px 30px;font-variant-numeric:tabular-nums}',
    '.aph-hd{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}',
    '.aph-hd h2{font:600 20px Poppins,sans-serif;color:#072B40;margin:0}',
    '.aph-hd p{margin:2px 0 0;color:#6B849A;font-size:12.5px}',
    '.aph-hd button{margin-left:auto;border:1px solid #E6ECF4;background:#fff;border-radius:10px;padding:7px 12px;font:600 12px Poppins,sans-serif;color:#072B40;cursor:pointer}',
    '.aph-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}',
    '.aph-k{position:relative;background:#fff;border:1px solid #E6ECF4;border-radius:14px;padding:12px 14px 12px 16px;overflow:hidden}',
    '.aph-k:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#36AFB4}',
    '.aph-k.c2:before{background:#21AAE0}.aph-k.c3:before{background:#2DDC96}.aph-k.c4:before{background:#072B40}.aph-k.c5:before{background:#FBC84B}',
    '.aph-k label{display:block;font-size:11.5px;color:#6B849A}',
    '.aph-k b{display:block;font-size:24px;font-weight:600;color:#072B40;margin-top:4px}',
    '.aph-k small{font-size:11px;color:#6B849A}',
    '.aph-g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}',
    '.aph-c{background:#fff;border:1px solid #E6ECF4;border-radius:14px;padding:14px 16px}',
    '.aph-c h3{font:600 13.5px Poppins,sans-serif;color:#072B40;margin:0 0 4px;padding-bottom:6px;background-image:linear-gradient(#36AFB4,#36AFB4);background-size:28px 2px;background-repeat:no-repeat;background-position:0 100%}',
    '.aph-c .sub{font-size:11.5px;color:#6B849A;margin:0 0 10px}',
    '.aph-bar{display:grid;grid-template-columns:minmax(120px,1.2fr) 2fr 44px;gap:10px;align-items:center;font-size:12.5px;padding:5px 0}',
    '.aph-bar i{display:block;height:8px;border-radius:999px;background:#F0F2F5;position:relative;overflow:hidden}',
    '.aph-bar i em{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:#36AFB4}',
    '.aph-bar span:last-child{text-align:right;font-weight:600;color:#072B40}',
    '.aph-bar .st{font-size:10.5px;color:#C9474C;font-weight:600;margin-left:6px}',
    '.aph-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px}',
    '.aph-stats div{border:1px solid #F0F2F5;border-radius:10px;padding:8px 10px}',
    '.aph-stats label{display:block;font-size:11px;color:#6B849A}.aph-stats b{font-size:17px;color:#072B40}',
    '.aph-t{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.aph-t th{text-align:left;font-size:11px;color:#6B849A;font-weight:600;padding:6px 6px;border-bottom:1px solid #E6ECF4}',
    '.aph-t td{padding:8px 6px;border-bottom:1px solid #F0F2F5;vertical-align:top;color:#072B40}',
    '.aph-t td small{display:block;color:#6B849A;font-size:11px}',
    '.aph-t a{color:#1F8E93;font-weight:600;text-decoration:none}',
    '.aph-chip{display:inline-block;font-size:10.5px;padding:2px 8px;border-radius:999px;background:#F0F2F5;color:#3A5068;white-space:nowrap}',
    '.aph-chip.old{background:#FDECEC;color:#C9474C}',
    '.aph-ad .aph-bar em{background:#21AAE0}.aph-ad .k7 em{background:#2DDC96}.aph-ad .k3 em{background:#FBC84B}.aph-ad .kx em{background:#ED666B}',
    '.aph-note{font-size:11.5px;color:#9BAFC0;margin-top:8px}',
    '.aph-empty{color:#6B849A;font-size:12.5px;padding:8px 0}',
    '@media(max-width:900px){.aph-kpis{grid-template-columns:repeat(2,1fr)}.aph-g2{grid-template-columns:1fr}}'
  ].join('\n');

  function css() { if (!document.getElementById('aph-css')) { var s = document.createElement('style'); s.id = 'aph-css'; s.textContent = CSS; document.head.appendChild(s); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(v) { return v == null ? '-' : Number(v).toLocaleString('en-US'); }
  function money(v, short) {
    if (v == null) return '-';
    v = Number(v);
    if (short && v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (short && v >= 1e4) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function ago(iso) {
    if (!iso) return '';
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
    return d <= 0 ? 'today' : d === 1 ? '1 day' : d + ' days';
  }
  function bars(list, label, val, extra, cls) {
    var max = Math.max.apply(null, list.map(val).concat([1]));
    return list.map(function (x) {
      return '<div class="aph-bar ' + (cls ? cls(x) : '') + '"><span>' + esc(label(x)) + (extra ? extra(x) : '') + '</span><i><em style="width:' + Math.round(100 * val(x) / max) + '%"></em></i><span>' + n(val(x)) + '</span></div>';
    }).join('');
  }

  function render(root, d) {
    var q = d.queue, r = d.revenue, t = d.terminals, a = d.adoption;
    var when = new Date(d.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT';
    var h = '<div class="aph">';
    h += '<div class="aph-hd"><div><h2>Adit Pay home</h2><p>T2 Adit Pay queue, revenue and terminals · updated ' + esc(when) + ' · from Desk and CRM data</p></div><button type="button" data-aph="refresh">Refresh</button></div>';
    h += '<div class="aph-kpis">' +
      '<div class="aph-k"><label>Open tickets</label><b>' + n(q.open) + '</b><small>' + n(q.stale) + ' open more than 5 days</small></div>' +
      '<div class="aph-k c2"><label>Created / closed (7 days)</label><b>' + n(q.created7d) + ' / ' + n(q.closed7d) + '</b><small>' + (q.closed7d >= q.created7d ? 'Closing faster than new ones arrive' : 'More arriving than closing') + '</small></div>' +
      '<div class="aph-k c3"><label>Median resolution (30 days)</label><b>' + (q.medianBusinessHours30d == null ? '-' : q.medianBusinessHours30d + 'h') + '</b><small>Business hours, Mon to Fri 7 AM to 7 PM CT</small></div>' +
      '<div class="aph-k c4"><label>Adit Pay MRR</label><b>' + money(r.mrr, true) + '</b><small>' + n(r.deals) + ' deals with Adit Pay revenue</small></div>' +
      '<div class="aph-k c5"><label>Practices with a terminal</label><b>' + n(t.withTerminal) + '</b><small>' + n(t.notUsing) + ' have one but are not using Pay</small></div>' +
      '</div>';
    h += '<div class="aph-g2">';
    h += '<div class="aph-c"><h3>Queue by owner</h3><p class="sub">Open T2 Adit Pay tickets now</p>' + (q.owners.length ? bars(q.owners, function (o) { return o.who; }, function (o) { return o.open; }, function (o) { return o.stale ? '<span class="st">' + o.stale + ' stale</span>' : ''; }) : '<div class="aph-empty">No open tickets.</div>') +
      '<p class="sub" style="margin-top:10px">' + q.byStatus.map(function (s) { return esc(s.status) + ' ' + s.n; }).join(' · ') + '</p></div>';
    h += '<div class="aph-c"><h3>What tickets are about</h3><p class="sub">Last 30 days, from the ticket subject</p>' + (d.topics.length ? bars(d.topics, function (x) { return x.topic; }, function (x) { return x.n; }) : '<div class="aph-empty">No tickets in 30 days.</div>') + '</div>';
    h += '</div><div class="aph-g2">';
    h += '<div class="aph-c"><h3>Revenue and volume</h3><p class="sub">Adit Pay revenue across deals; processing volume since each practice started on Pay</p><div class="aph-stats">' +
      '<div><label>Adit Pay MRR</label><b>' + money(r.mrr) + '</b></div>' +
      '<div><label>Deals with Pay revenue</label><b>' + n(r.deals) + '</b></div>' +
      '<div><label>Processing volume (all time)</label><b>' + (r.volumeOk ? money(r.volume, true) : '-') + '</b></div>' +
      '<div><label>Practices processing (30 days)</label><b>' + (r.volumeOk ? n(r.active30d) : '-') + '</b></div>' +
      '</div>' + (r.volumeOk ? '' : '<p class="aph-note">Processing volume needs read access to the Stripe charges data in AditKB.</p>') + '</div>';
    h += '<div class="aph-c"><h3>Terminals</h3><p class="sub">Card present payments on Adit Pay terminals</p><div class="aph-stats">' +
      '<div><label>Terminal volume (all time)</label><b>' + (t.ok ? money(t.volume, true) : '-') + '</b></div>' +
      '<div><label>Terminal transactions</label><b>' + (t.ok ? n(t.txns) : '-') + '</b></div>' +
      '<div><label>' + (t.ok ? 'Practices using a terminal' : 'Practices with a terminal') + '</label><b>' + (t.ok ? n(t.practices) : n(t.withTerminal)) + '</b></div>' +
      '<div><label>Used in the last 30 days</label><b>' + (t.ok ? n(t.active30d) : '-') + '</b></div></div>' +
      (t.top.length ? '<table class="aph-t"><thead><tr><th>Busiest terminal practices</th><th>Terminals</th><th>Volume</th><th>Last used</th></tr></thead><tbody>' + t.top.map(function (x) { return '<tr><td>' + esc(x.practice) + '</td><td>' + n(x.terminals) + '</td><td>' + money(x.volume, true) + '</td><td>' + esc(ago(x.last)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="aph-note">' + (t.ok ? 'No terminal activity yet.' : 'Terminal detail needs read access to the Stripe terminal data in AditKB.') + '</p>') + '</div>';
    h += '</div>';
    h += '<div class="aph-c aph-ad" style="margin-bottom:14px"><h3>Adit Pay adoption</h3><p class="sub">Current category of each deal (' + n(a.total) + ' deals)</p>' + (a.buckets.length ? bars(a.buckets, function (x) { return x.k + '. ' + x.label; }, function (x) { return x.n; }, null, function (x) { return x.k === 7 ? 'k7' : x.k === 3 ? 'k3' : x.k >= 8 ? 'kx' : ''; }) : '<div class="aph-empty">Not available.</div>') + '</div>';
    h += '<div class="aph-c"><h3>Oldest open tickets</h3><p class="sub">Start here: the ones waiting longest</p>' + (q.oldest.length ? '<table class="aph-t"><thead><tr><th>Ticket</th><th>Practice and subject</th><th>Owner</th><th>Status</th><th>Age</th></tr></thead><tbody>' + q.oldest.map(function (x) {
      var days = Math.floor((Date.now() - new Date(x.created).getTime()) / 864e5);
      return '<tr><td><a href="' + esc(x.url) + '" target="_blank" rel="noopener">#' + esc(x.number) + '</a></td><td>' + esc(x.practice || 'No account') + '<small>' + esc(x.subject) + '</small></td><td>' + esc(x.owner) + '</td><td><span class="aph-chip">' + esc(x.status) + '</span></td><td><span class="aph-chip' + (days > 5 ? ' old' : '') + '">' + esc(ago(x.created)) + '</span></td></tr>';
    }).join('') + '</tbody></table>' : '<div class="aph-empty">No open tickets.</div>') + '</div>';
    h += '</div>';
    root.innerHTML = h;
    var b = root.querySelector('[data-aph="refresh"]'); if (b) b.onclick = function () { load(root, true); };
  }

  function load(root, fresh) {
    css();
    if (!root.innerHTML) root.innerHTML = '<div class="aph"><p class="aph-empty">Loading Adit Pay home...</p></div>';
    fetch('/api/aditpay/home' + (fresh ? '?fresh=1' : ''), { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) { root.innerHTML = '<div class="aph"><p class="aph-empty">' + esc(j.error || 'Could not load Adit Pay home.') + '</p></div>'; return; }
      render(root, j.data);
    }).catch(function () { root.innerHTML = '<div class="aph"><p class="aph-empty">Could not load Adit Pay home. Check the connection and try Refresh.</p></div>'; });
  }

  var mounted = null;
  window.AditPayHome = { mount: function (root) { if (!root) return; mounted = root; load(root, false); } };
})();
