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
    '.aph-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}','.aph-split{display:flex;height:10px;border-radius:999px;overflow:hidden;background:#F0F2F5;margin:4px 0 6px}.aph-split i{display:block;height:100%}','.aph-leg{display:flex;gap:14px;font-size:11.5px;color:#3A5068;flex-wrap:wrap}.aph-leg span:before{content:"";display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:var(--c)}',
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
    '.aph-stats small{display:block;font-size:11px;color:#6B849A;margin-top:2px}',
    '.aph-t{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.aph-dh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.aph-date{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid #E1E6EB;border-radius:8px}',
    '.aph-t td small{display:block;color:#6B849A;font-size:11px;margin-top:2px}.aph-sub td{padding-top:0!important;border-top:0!important}.aph-sub ul{margin:0 0 6px 16px;padding:0;font-size:11.5px;color:#4C6378}',
    '.aph-copy{font:inherit;font-size:11.5px;padding:4px 9px;border:1px solid #CFE9EA;background:#F2FAFA;color:#1F7F84;border-radius:7px;cursor:pointer;white-space:nowrap}',
    '.aph-t th{text-align:left;font-size:11px;color:#6B849A;font-weight:600;padding:6px 6px;border-bottom:1px solid #E6ECF4}',
    '.aph-t td{padding:8px 6px;border-bottom:1px solid #F0F2F5;vertical-align:top;color:#072B40}',
    '.aph-t td small{display:block;color:#6B849A;font-size:11px}',
    '.aph-t a{color:#1F8E93;font-weight:600;text-decoration:none}',
    '.aph-chip{display:inline-block;font-size:10.5px;padding:2px 8px;border-radius:999px;background:#F0F2F5;color:#3A5068;white-space:nowrap}',
    '.aph-chip.old{background:#FDECEC;color:#C9474C}',
    '.aph-ad .aph-bar em{background:#21AAE0}.aph-ad .k7 em{background:#2DDC96}.aph-ad .k3 em{background:#FBC84B}.aph-ad .kx em{background:#ED666B}',
    '.aph-note{font-size:11.5px;color:#9BAFC0;margin-top:8px}',
    '.aph-empty{color:#6B849A;font-size:12.5px;padding:8px 0}',
    '.aph-nav{display:inline-flex;background:#F0F2F5;border-radius:999px;padding:3px;gap:2px;margin-left:12px}.aph-nav button{border:0;background:transparent;padding:5px 12px;border-radius:999px;font:600 12px Poppins,sans-serif;color:#4C6378;cursor:pointer}.aph-nav button[aria-pressed=true]{background:#2A9FA4;color:#fff}',
    '.aph-seg{display:inline-flex;gap:4px}.aph-seg button{border:1px solid #E6ECF4;background:#fff;border-radius:8px;padding:4px 10px;font:600 11.5px Poppins,sans-serif;color:#4C6378;cursor:pointer}.aph-seg button[aria-pressed=true]{border-color:#2A9FA4;color:#1F7F84;background:#F2FAFA}',
    '.aph-chart{width:100%;height:auto;display:block}.aph-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:#4C6378;margin:6px 0 0}.aph-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}',
    '.aph-t td.r,.aph-t th.r{text-align:right}.aph-t tr.fc td{color:#4C6378}.aph-t tr.cur td{background:#F7FBFB}.aph-how li{margin:0 0 6px;font-size:12px;color:#3A5068}',
    '.aph-tip{position:fixed;pointer-events:none;background:#072B40;color:#fff;font-size:11.5px;padding:6px 8px;border-radius:8px;z-index:50;white-space:nowrap}',
    '.aph-sec{margin-bottom:14px}.aph-grid{font-size:11.5px;min-width:1100px}.aph-grid th small{display:block;font-weight:500;color:#9BAFC0}.aph-grid td{padding:4px 6px;white-space:nowrap}.aph-grid td.ex{background:#F2FAFA;color:#4C6378;font-style:italic}.aph-grid tr.tot td{font-weight:700;border-top:2px solid #E6ECF4}.aph-grid th.fc{color:#1F7F84}',
    '@media print{body *{visibility:hidden}.aph-rev,.aph-rev *{visibility:visible}.aph-rev{position:absolute;left:0;top:0;width:100%}.aph-rev .aph-seg,.aph-rev .aph-nav{display:none}.aph-c{break-inside:avoid}}',
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

  // Batch 358: declines, refunds, fees and the monthly trend from the Stripe data in Zoho Analytics
  function stripeCard(st) {
    if (!st) return '';
    if (st.loading) return '<div class="aph-c" style="margin-bottom:14px"><h3>Payments, declines and refunds</h3><p class="aph-note">Stripe figures are loading. Press Refresh in a minute.</p></div>';
    var c = st.charges, b = st.balance, mo = (st.months || []).slice(0, 6);
    if (!c && !b && !mo.length) return '';
    var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var label = function (m) { var p = String(m.month).split('-'); return MN[Number(p[1]) - 1] + ' ' + p[0] + (m === mo[0] ? ' (so far)' : ''); };
    var h = '<div class="aph-g2">';
    h += '<div class="aph-c"><h3>Payments, declines and refunds</h3><p class="sub">Last 30 days, from Stripe</p><div class="aph-stats">' +
      (c ? '<div><label>Declined or failed</label><b>' + n(c.failed) + '</b><small>' + (c.declineRate == null ? '' : (Math.round(c.declineRate * 1000) / 10) + '% of attempts · ') + money(c.failedAmount, true) + '</small></div>' : '') +
      (b ? '<div><label>Refunds issued</label><b>' + n(b.refunds.n) + '</b><small>' + money(b.refunds.amount, true) + '</small></div>' : '') +
      (b && b.applicationFees != null ? '<div><label>Processing fees collected</label><b>' + money(b.applicationFees, true) + '</b><small>Application fees on payments</small></div>' : '') +
      (b && b.networkCost != null ? '<div><label>Card network costs</label><b>' + money(b.networkCost, true) + '</b><small>Stripe fees ' + money(b.stripeFees, true) + '</small></div>' : '') +
      '</div>' + (st.cards && st.cards.brands.length ? '<p class="sub" style="margin:4px 0 6px">Cards used: ' + st.cards.brands.map(function (x) { return esc(x.name.charAt(0).toUpperCase() + x.name.slice(1)) + ' ' + Math.round(100 * (x.share || 0)) + '%'; }).join(' · ') + (st.cards.funding.length ? ' · by type: ' + st.cards.funding.map(function (x) { return esc(x.name) + ' ' + Math.round(100 * (x.share || 0)) + '%'; }).join(', ') : '') + '</p>' : '') + ((st.failures || []).length ? '<p class="sub" style="margin:4px 0 6px">Why payments failed</p>' + bars(st.failures, function (x) { return x.code.charAt(0).toUpperCase() + x.code.slice(1); }, function (x) { return x.n; }) : '') + '</div>';
    h += '<div class="aph-c"><h3>Monthly volume</h3><p class="sub">From Stripe, same as the Adit Pay Daily Volume report</p>' + (mo.length ? bars(mo, label, function (m) { return m.amount; }).replace(/<span>([\d,]+)<\/span><\/div>/g, function (all, v) { return '<span>$' + v + '</span></div>'; }) : '<div class="aph-empty">Not available.</div>') + '</div>';
    return h + '</div>';
  }

  function render(root, d) {
    var q = d.queue, r = d.revenue, t = d.terminals, a = d.adoption;
    var when = new Date(d.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT';
    var h = '<div class="aph">';
    h += '<div class="aph-hd"><div><h2>Adit Pay home' + navHtml(d) + '</h2><p>T2 Adit Pay queue, revenue and terminals · updated ' + esc(when) + ' · from Desk, CRM and Stripe data</p></div><button type="button" data-aph="refresh">Refresh</button></div>';
    h += '<div class="aph-kpis">' +
      '<div class="aph-k"><label>Open tickets</label><b>' + n(q.open) + '</b><small>' + n(q.stale) + ' open more than 5 days</small></div>' +
      '<div class="aph-k c2"><label>Created / closed (7 days)</label><b>' + n(q.created7d) + ' / ' + n(q.closed7d) + '</b><small>' + (q.closed7d >= q.created7d ? 'Closing faster than new ones arrive' : 'More arriving than closing') + '</small></div>' +
      '<div class="aph-k c3"><label>Median resolution (30 days)</label><b>' + (q.medianBusinessHours30d == null ? '-' : q.medianBusinessHours30d + 'h') + '</b><small>Business hours, Mon to Fri 7 AM to 7 PM CT</small></div>' +
      '<div class="aph-k c4"><label>Processing volume (30 days)</label><b>' + money(r.vol30, true) + '</b><small>' + n(r.txns30) + ' transactions · ' + n(r.active30d) + ' practices</small></div>' +
      '<div class="aph-k c5"><label>Adit Pay MRR</label><b>' + money(r.mrr, true) + '</b><small>' + n(r.deals) + ' deals with Adit Pay revenue</small></div>' +
      '</div>';
    h += '<div class="aph-g2">';
    h += '<div class="aph-c"><h3>Queue by owner</h3><p class="sub">Open T2 Adit Pay tickets now</p>' + (q.owners.length ? bars(q.owners, function (o) { return o.who; }, function (o) { return o.open; }, function (o) { return o.stale ? '<span class="st">' + o.stale + ' stale</span>' : ''; }) : '<div class="aph-empty">No open tickets.</div>') +
      '<p class="sub" style="margin-top:10px">' + q.byStatus.map(function (s) { return esc(s.status) + ' ' + s.n; }).join(' · ') + '</p></div>';
    h += '<div class="aph-c"><h3>What tickets are about</h3><p class="sub">Last 30 days, sorted by AI from each ticket\'s summary and description</p>' + (d.topics.length ? bars(d.topics, function (x) { return x.topic; }, function (x) { return x.n; }) : '<div class="aph-empty">No tickets in 30 days.</div>') + '</div>';
    h += '</div><div class="aph-g2">';
    var cpPct = r.cpShare != null ? Math.round(100 * r.cpShare) : r.vol30 ? Math.round(100 * (r.cp30 || 0) / r.vol30) : 0;
    var stripe = r.source === 'stripe';
    h += '<div class="aph-c"><h3>Revenue and volume</h3><p class="sub">' + (stripe ? 'Volume from Stripe, same as the Adit Pay Daily Volume report; MRR from deals' : 'Adit Pay revenue from deals; volume from the CRM Adit Pay module') + '</p>' + (r.crmOk || stripe ? '<div class="aph-stats">' +
      '<div><label>Volume (30 days)</label><b>' + money(r.vol30) + '</b></div>' +
      '<div><label>Volume (90 days)</label><b>' + money(r.vol90, true) + '</b></div>' +
      '<div><label>' + (stripe ? 'Successful payments (30 days)' : 'Transactions (30 days)') + '</label><b>' + n(r.txns30) + '</b></div>' +
      '<div><label>Average payment</label><b>' + money(r.avgTicket) + '</b></div>' +
      '<div><label>Average per business day</label><b>' + money(r.dailyAvg, true) + '</b></div>' +
      '<div><label>Adit Pay MRR</label><b>' + money(r.mrr) + '</b></div>' +
      '</div><div class="aph-split" title="Card present ' + cpPct + '%"><i style="width:' + cpPct + '%;background:#36AFB4"></i><i style="width:' + (100 - cpPct) + '%;background:#21AAE0"></i></div>' +
      '<div class="aph-leg"><span style="--c:#36AFB4">Terminal (card present) ' + money(r.cp30, true) + ', ' + cpPct + '%</span><span style="--c:#21AAE0">Online (card not present) ' + money(r.cnp30, true) + '</span></div>'
      : '<div class="aph-stats"><div><label>Adit Pay MRR</label><b>' + money(r.mrr) + '</b></div><div><label>Deals with Pay revenue</label><b>' + n(r.deals) + '</b></div></div><p class="aph-note">Volume needs the CRM Adit Pay module, which the tool could not read just now.</p>') + '</div>';
    h += '<div class="aph-c"><h3>Terminals</h3><p class="sub">Every reader in the CRM Stripe Terminal module</p>' + (t.ok ? '<div class="aph-stats">' +
      '<div><label>Delivered</label><b>' + n(t.delivered) + '</b></div>' +
      '<div><label>Used in the last 30 days</label><b>' + n(t.used30) + '</b></div>' +
      '<div><label>On the way (ready, shipped, pending)</label><b>' + n(t.inTransit) + '</b></div>' +
      '<div><label>Returned or lost</label><b>' + n(t.returned) + '</b></div>' +
      '<div><label>Card present volume (30 days)</label><b>' + money(t.vol30, true) + '</b></div>' +
      '<div><label>Practices with a terminal, not using Pay</label><b>' + n(t.notUsing) + '</b></div>' +
      '</div>' + (t.readers.length ? '<p class="sub" style="margin:0">Delivered by reader: ' + t.readers.map(function (x) { return esc(x.type) + ' ' + n(x.n); }).join(' · ') + '</p>' : '')
      : '<div class="aph-stats"><div><label>Practices with a terminal</label><b>' + n(t.withTerminal) + '</b></div><div><label>Not using Pay</label><b>' + n(t.notUsing) + '</b></div></div><p class="aph-note">Terminal detail needs the CRM Stripe Terminal module, which the tool could not read just now.</p>') + '</div>';
    h += '</div>';
    h += '<div class="aph-c" id="aph-daily" style="margin-bottom:14px"></div>'; // Batch 362: team daily report
    h += stripeCard(d.stripe);
    if (d.topPractices && d.topPractices.length) h += '<div class="aph-c" style="margin-bottom:14px"><h3>Top practices by volume</h3><p class="sub">Last 30 days, ' + (d.topSource === 'stripe' ? 'from Stripe (each practice\'s Stripe account name)' : 'from the CRM Adit Pay module') + '</p><table class="aph-t"><thead><tr><th>Practice</th><th>Volume</th><th>Terminal share</th><th>' + (d.topSource === 'stripe' ? 'Payments' : 'Transactions') + '</th>' + (d.topSource === 'stripe' ? '' : '<th>Terminals</th><th>Last payment</th>') + '</tr></thead><tbody>' + d.topPractices.map(function (x) {
      return '<tr><td>' + esc(x.practice) + '</td><td>' + money(x.vol30) + '</td><td>' + (x.vol30 ? Math.round(100 * (x.cp30 || 0) / x.vol30) + '%' : '-') + '</td><td>' + n(x.txns30) + '</td>' + (d.topSource === 'stripe' ? '' : '<td>' + n(x.terminals) + '</td><td>' + esc(ago(x.last)) + '</td>') + '</tr>';
    }).join('') + '</tbody></table></div>';
    h += '<div class="aph-c aph-ad" style="margin-bottom:14px"><h3>Adit Pay adoption</h3><p class="sub">Current category of each deal (' + n(a.total) + ' deals)</p>' + (a.buckets.length ? bars(a.buckets, function (x) { return x.k + '. ' + x.label; }, function (x) { return x.n; }, null, function (x) { return x.k === 7 ? 'k7' : x.k === 3 ? 'k3' : x.k >= 8 ? 'kx' : ''; }) : '<div class="aph-empty">Not available.</div>') + '</div>';
    h += '<div class="aph-c"><h3>Oldest open tickets</h3><p class="sub">Start here: the ones waiting longest</p>' + (q.oldest.length ? '<table class="aph-t"><thead><tr><th>Ticket</th><th>Practice and subject</th><th>Owner</th><th>Status</th><th>Age</th></tr></thead><tbody>' + q.oldest.map(function (x) {
      var days = Math.floor((Date.now() - new Date(x.created).getTime()) / 864e5);
      return '<tr><td><a href="' + esc(x.url) + '" target="_blank" rel="noopener">#' + esc(x.number) + '</a></td><td>' + esc(x.practice || 'No account') + '<small>' + esc(x.subject) + '</small></td><td>' + esc(x.owner) + '</td><td><span class="aph-chip">' + esc(x.status) + '</span></td><td><span class="aph-chip' + (days > 5 ? ' old' : '') + '">' + esc(ago(x.created)) + '</span></td></tr>';
    }).join('') + '</tbody></table>' : '<div class="aph-empty">No open tickets.</div>') + '</div>';
    h += '</div>';
    root.innerHTML = h;
    loadDaily(root.querySelector('#aph-daily'), null);
    var b = root.querySelector('[data-aph="refresh"]'); if (b) b.onclick = function () { load(root, true); };
    wireNav(root, d);
  }

  // Batch 362: the daily numbers the team posts in Chat: calls, demos and trainings (Avoma), new tickets and follow-ups
  var dailyDate = null;
  function loadDaily(box, day) {
    if (!box) return;
    var today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    dailyDate = day || dailyDate || today;
    box.innerHTML = '<h3>Team daily report</h3><p class="sub">Loading ' + esc(dailyDate) + '...</p>';
    fetch('/api/aditpay/daily?date=' + encodeURIComponent(dailyDate), { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) { box.innerHTML = '<h3>Team daily report</h3><p class="aph-note">' + esc(j.error || 'Could not load the daily report.') + '</p>'; return; }
      var KL = { training: 'Training / walkthrough', demo: 'Demo / sign-up', meeting: 'Calendar meeting' };
      var rows = j.people.map(function (p, i) {
        var c = p.calls, s = p.sessions || {};
        var list = (s.list || []).map(function (m) { var t = new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); return '<li>' + esc(t) + ' CT · ' + esc(KL[m.kind] || m.kind) + (m.onCall ? ' (call)' : '') + ': ' + esc(m.title || 'Meeting') + (m.practice ? ' · ' + esc(m.practice) : '') + (m.minutes ? ' · ' + m.minutes + ' min' : '') + '</li>'; }).join('')
          // Batch 371: what Avoma had that was not counted (ticket follow-ups, short calls), so the number can be checked
          + (s.skipped || []).map(function (m) { var t = new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); return '<li style="opacity:.6">' + esc(t) + ' CT · Not counted (' + esc(m.why) + '): ' + esc(m.title || 'Meeting') + (m.minutes ? ' · ' + m.minutes + ' min' : '') + '</li>'; }).join('');
        var sp = c && c.split; // Batch 363: incoming split into queue calls and calls straight to the person's own number or ext
        var qs = sp ? Object.keys(sp.byQueue || {}).map(function (q) { return esc(q) + ' ' + sp.byQueue[q]; }).join(', ') : '';
        return '<tr><td><b>' + esc(p.name) + '</b>' + (sp && sp.ext ? '<small>Ext ' + esc(sp.ext) + '</small>' : '') + (p.tracked ? '' : '<small>Not in Manage Agents yet, so no calls</small>') + '</td>' +
          '<td>' + (c ? n(c.total) + '<small>' + n(c.inbound) + ' in · ' + n(c.outbound) + ' out</small>' + (sp ? '<small>In: ' + n(sp.queue) + ' from queue' + (qs ? ' (' + qs + ')' : '') + ' · ' + n(sp.direct) + ' direct to own number or ext' + (sp.missedQueue + sp.missedDirect ? ' · ' + n(sp.missedQueue + sp.missedDirect) + ' missed' : '') + '</small>' : '') : '-') + '</td>' +
          '<td>' + n(s.total || 0) + (s.total ? '<small>' + [s.training ? s.training + ' training' : '', s.demo ? s.demo + ' demo' : '', s.meeting ? s.meeting + ' other' : ''].filter(Boolean).join(' · ') + '</small>' : '') + '</td>' +
          '<td>' + n(p.tickets.new) + '</td><td>' + n(p.tickets.followup) + '</td>' +
          '<td><button type="button" class="aph-copy" data-i="' + i + '">Copy for Chat</button></td></tr>' +
          (list ? '<tr class="aph-sub"><td colspan="6"><ul>' + list + '</ul></td></tr>' : '');
      }).join('');
      box.innerHTML = '<div class="aph-dh"><div><h3>Team daily report</h3><p class="sub">Calls from RingCentral (queue and direct calls; callbacks the person dials count as outgoing), demos and trainings from Avoma (booked sessions and recorded calls of 30 minutes or more; ticket follow-ups are not sessions), tickets from Ticket Lifecycle</p></div>' +
        '<input type="date" class="aph-date" max="' + today + '" value="' + esc(j.date) + '" aria-label="Report date"></div>' +
        (j.sessionsOk ? '' : '<p class="aph-note">Avoma meetings could not be read just now, so sessions show 0.</p>') +
        (j.people.length ? '<table class="aph-t"><thead><tr><th>Person</th><th>Calls handled</th><th>Demos / training</th><th>New tickets</th><th>Follow-ups</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="aph-empty">No Adit Pay people yet. Add them in Manage Agents and Access Control.</div>');
      var inp = box.querySelector('.aph-date'); if (inp) inp.onchange = function () { if (inp.value) loadDaily(box, inp.value); };
      box.querySelectorAll('.aph-copy').forEach(function (b) { b.onclick = function () { var p = j.people[Number(b.dataset.i)]; try { navigator.clipboard.writeText(p.chat.replace(/^\*[^*]+\*\n/, '')); b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy for Chat'; }, 1500); } catch (e) { b.textContent = 'Copy failed'; } }; });
    }).catch(function () { box.innerHTML = '<h3>Team daily report</h3><p class="aph-note">Could not load the daily report.</p>'; });
  }

  function load(root, fresh) {
    css();
    if (!root.innerHTML) root.innerHTML = '<div class="aph"><p class="aph-empty">Loading Adit Pay home...</p></div>';
    fetch('/api/aditpay/home' + (fresh ? '?fresh=1' : ''), { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) { root.innerHTML = '<div class="aph"><p class="aph-empty">' + esc(j.error || 'Could not load Adit Pay home.') + '</p></div>'; return; }
      j.data._admin = !!j.admin; // Batch 374: Revenue is for admins
      if (view === 'revenue' && j.admin) renderRevenue(root, j.data); else render(root, j.data);
    }).catch(function () { root.innerHTML = '<div class="aph"><p class="aph-empty">Could not load Adit Pay home. Check the connection and try Refresh.</p></div>'; });
  }

  // ── Batch 374/376: Revenue (admins): the whole history since day one, a six month forecast, charts and the day by month grid ──
  var view = 'overview', rv = { metric: 'volume', span: '36', gmetric: 'volume', showAll: false, data: null };
  function navHtml(d) { return d && d._admin ? '<span class="aph-nav" role="group" aria-label="Adit Pay home view"><button type="button" data-view="overview" aria-pressed="' + (view === 'overview') + '">Overview</button><button type="button" data-view="revenue" aria-pressed="' + (view === 'revenue') + '">Revenue</button></span>' : ''; }
  function wireNav(root, d) { root.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { view = b.dataset.view; if (view === 'revenue') renderRevenue(root, d); else render(root, d); }; }); }
  var LBL = { volume: 'Volume', revenue: 'Revenue', net: 'Net revenue', costs: 'Costs' };
  var COL = { a: '#2A9FA4', f: '#7FC7CA', band: 'rgba(54,175,180,.14)', grid: '#EEF1F5', ink: '#6B849A', cost: '#F4A259', net: '#072B40' };
  var YC = ['#B8C4D0', '#9BAFC0', '#7FC7CA', '#21AAE0', '#2A9FA4', '#F4891F', '#072B40'];
  function mn(m, long) { var p = m.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, 15)).toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }); }
  function pct(v, dp) { return v == null ? '-' : (v * 100).toFixed(dp == null ? 1 : dp) + '%'; }
  function tip(el, text) { var t = document.getElementById('aph-tip'); if (!t) { t = document.createElement('div'); t.id = 'aph-tip'; t.className = 'aph-tip'; document.body.appendChild(t); } el.addEventListener('mousemove', function (e) { t.textContent = text; t.style.display = 'block'; t.style.left = Math.min(window.innerWidth - 260, e.clientX + 12) + 'px'; t.style.top = (e.clientY + 12) + 'px'; }); el.addEventListener('mouseleave', function () { t.style.display = 'none'; }); }
  function axis(W, L, T, Hp, max, fmt) { var g = ''; for (var i = 0; i <= 4; i++) { var v = max * i / 4, y = T + Hp * (1 - i / 4); g += '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '" stroke="' + COL.grid + '"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="' + COL.ink + '">' + (fmt || function (x) { return money(x, true); })(v) + '</text>'; } return g; }
  function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  // history and forecast: monthly line with the forecast dashed inside its likely range
  function trendChart(R, k, span) {
    var hist = R.history.filter(function (h) { return h[k] != null; }); if (span !== 'all') hist = hist.slice(-Number(span));
    var pts = hist.map(function (h) { return { m: h.month, v: h[k], kind: 'a' }; });
    var cv = R.current[k], fc = R.forecast.map(function (f) { return { m: f.month, v: f[k], lo: k === 'volume' ? f.low : k === 'revenue' ? f.revenueLow : f[k] * (1 - R.model.band / 100), hi: k === 'volume' ? f.high : k === 'revenue' ? f.revenueHigh : f[k] * (1 + R.model.band / 100), kind: 'f' }; });
    var all = pts.concat([{ m: R.current.month, v: cv, kind: 'c' }], fc);
    var W = 900, H = 280, L = 64, T = 12, B = 30, Hp = H - T - B, max = niceMax(Math.max.apply(null, all.map(function (p) { return Math.max(p.v || 0, p.hi || 0); })));
    var x = function (i) { return L + i * (W - L - 16) / Math.max(1, all.length - 1); }, y = function (v) { return T + Hp * (1 - v / max); };
    var g = axis(W, L, T, Hp, max), nA = pts.length, fi = nA;
    var band = fc.map(function (p, i) { return x(fi + 1 + i) + ',' + y(p.hi); }).join(' ') + ' ' + fc.slice().reverse().map(function (p, i) { return x(fi + fc.length - i) + ',' + y(p.lo); }).join(' ');
    g += '<polygon points="' + x(fi) + ',' + y(cv) + ' ' + band + '" fill="' + COL.band + '"/>';
    g += '<polyline fill="none" stroke="' + COL.a + '" stroke-width="2.4" points="' + pts.map(function (p, i) { return x(i) + ',' + y(p.v); }).join(' ') + '"/>';
    g += '<polyline fill="none" stroke="' + COL.a + '" stroke-width="2.4" stroke-dasharray="6 4" points="' + (nA ? x(nA - 1) + ',' + y(pts[nA - 1].v) + ' ' : '') + x(fi) + ',' + y(cv) + ' ' + fc.map(function (p, i) { return x(fi + 1 + i) + ',' + y(p.v); }).join(' ') + '"/>';
    var every = Math.ceil(all.length / 14);
    all.forEach(function (p, i) {
      var lab = mn(p.m) + ': ' + money(p.v) + (p.kind === 'f' ? ' forecast (' + money(p.lo, true) + ' to ' + money(p.hi, true) + ')' : p.kind === 'c' ? ' projected' : '');
      g += '<circle data-tip="' + esc(lab) + '" cx="' + x(i) + '" cy="' + y(p.v) + '" r="' + (p.kind === 'a' ? 3 : 4) + '" fill="' + (p.kind === 'a' ? COL.a : '#fff') + '" stroke="' + COL.a + '" stroke-width="2"/>';
      if (i % every === 0 || i === all.length - 1) g += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="' + COL.ink + '">' + esc(mn(p.m)) + '</text>';
    });
    g += '<line x1="' + x(fi) + '" x2="' + x(fi) + '" y1="' + T + '" y2="' + (T + Hp) + '" stroke="#C9D3DD" stroke-dasharray="3 3"/><text x="' + (x(fi) + 4) + '" y="' + (T + 10) + '" font-size="10" fill="' + COL.ink + '">Today</text>';
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(LBL[k]) + ' by month, history and forecast">' + g + '</svg><div class="aph-legend"><span><i style="background:' + COL.a + '"></i>Actual</span><span><i style="background:#fff;border:2px dashed ' + COL.a + '"></i>Projected and forecast</span><span><i style="background:' + COL.band + '"></i>Likely range (' + R.model.band + '%)</span></div>';
  }
  // year over year: one line per year, January to December
  function yoyChart(R) {
    var ys = Object.keys(R.years).sort(), W = 440, H = 240, L = 56, T = 12, B = 28, Hp = H - T - B;
    var max = niceMax(Math.max.apply(null, ys.map(function (y) { return Math.max.apply(null, Object.values(R.years[y]).map(Number)); })));
    var x = function (m) { return L + (m - 1) * (W - L - 12) / 11; }, yy = function (v) { return T + Hp * (1 - v / max); }, g = axis(W, L, T, Hp, max);
    ys.forEach(function (yr, i) { var c = YC[Math.max(0, YC.length - ys.length + i)], o = R.years[yr], ms = Object.keys(o).map(Number).sort(function (a, b) { return a - b; });
      g += '<polyline fill="none" stroke="' + c + '" stroke-width="' + (i === ys.length - 1 ? 3 : 2) + '" points="' + ms.map(function (m) { return x(m) + ',' + yy(o[m]); }).join(' ') + '"/>';
      ms.forEach(function (m) { g += '<circle data-tip="' + esc(yr + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ': ' + money(o[m])) + '" cx="' + x(m) + '" cy="' + yy(o[m]) + '" r="3" fill="' + c + '"/>'; }); });
    ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].forEach(function (l, i) { g += '<text x="' + x(i + 1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10" fill="' + COL.ink + '">' + l + '</text>'; });
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Volume by year">' + g + '</svg><div class="aph-legend">' + ys.map(function (yr, i) { return '<span><i style="background:' + YC[Math.max(0, YC.length - ys.length + i)] + '"></i>' + yr + '</span>'; }).join('') + '</div>';
  }
  function barsChart(items, valKey, labKey, fmt, W, ref) {
    W = W || 440; var H = 200, L = 40, T = 12, B = 26, Hp = H - T - B, max = Math.max(1.3, Math.max.apply(null, items.map(function (i) { return i[valKey]; })) * 1.1);
    var bw = (W - L - 8) / items.length, y = function (v) { return T + Hp * (1 - v / max); }, g = '';
    [0, 0.5, 1].forEach(function (v) { g += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v === 1 ? '#C9D3DD' : COL.grid) + '"' + (v === 1 ? ' stroke-dasharray="3 3"' : '') + '/><text x="' + (L - 5) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="' + COL.ink + '">' + v.toFixed(1) + 'x</text>'; });
    items.forEach(function (it, i) { var v = it[valKey], x0 = L + i * bw + 4; g += '<rect data-tip="' + esc(it[labKey] + ': ' + fmt(v)) + '" x="' + x0 + '" y="' + y(v) + '" width="' + (bw - 8) + '" height="' + (y(0) - y(v)) + '" rx="4" fill="' + (v >= 1 ? COL.a : '#9BAFC0') + '"/><text x="' + (x0 + (bw - 8) / 2) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10" fill="' + COL.ink + '">' + esc(it[labKey]) + '</text>'; });
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(ref || '') + '">' + g + '</svg>';
  }
  // revenue split into costs and net, with the take rate
  function profitChart(R) {
    var rows = R.history.filter(function (h) { return h.revenue != null; }).slice(-12).concat([R.current], R.forecast);
    var W = 900, H = 260, L = 64, T = 12, B = 30, Hp = H - T - B, max = niceMax(Math.max.apply(null, rows.map(function (r) { return r.revenue || 0; })));
    var bw = (W - L - 12) / rows.length, y = function (v) { return T + Hp * (1 - v / max); }, g = axis(W, L, T, Hp, max);
    rows.forEach(function (r, i) { var x0 = L + i * bw + 5, w = bw - 10, f = r.kind !== 'actual', op = f ? ' fill-opacity=".45"' : '';
      g += '<rect data-tip="' + esc(mn(r.month) + (f ? ' (' + (r.kind === 'current' ? 'projected' : 'forecast') + ')' : '') + ': revenue ' + money(r.revenue) + ', costs ' + money(r.costs) + ', net ' + money(r.net) + ', take rate ' + pct(r.takeRate, 2)) + '" x="' + x0 + '" y="' + y(r.revenue) + '" width="' + w + '" height="' + (y(0) - y(r.revenue)) + '" rx="3" fill="' + COL.cost + '"' + op + '/>';
      g += '<rect x="' + x0 + '" y="' + y(r.net) + '" width="' + w + '" height="' + (y(0) - y(r.net)) + '" rx="3" fill="' + COL.net + '"' + op + ' pointer-events="none"/>';
      if (i % 2 === 0 || i === rows.length - 1) g += '<text x="' + (x0 + w / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="' + COL.ink + '">' + esc(mn(r.month)) + '</text>'; });
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenue, costs and net by month">' + g + '</svg><div class="aph-legend"><span><i style="background:' + COL.net + '"></i>Net</span><span><i style="background:' + COL.cost + '"></i>Costs (bar top is revenue)</span><span><i style="background:' + COL.cost + ';opacity:.45"></i>Projected or forecast</span></div>';
  }
  // the accuracy test: what the method would have said six months ago, against what happened
  function testChart(R) {
    var t = R.model.test, W = 440, H = 220, L = 56, T = 12, B = 28, Hp = H - T - B, max = niceMax(Math.max.apply(null, t.map(function (x) { return Math.max(x.actual, x.predicted); })));
    var bw = (W - L - 8) / t.length, y = function (v) { return T + Hp * (1 - v / max); }, g = axis(W, L, T, Hp, max);
    t.forEach(function (r, i) { var x0 = L + i * bw + 6, w = (bw - 12) / 2, miss = r.actual ? (r.predicted - r.actual) / r.actual : 0;
      g += '<rect data-tip="' + esc(mn(r.month) + ': actual ' + money(r.actual) + ', forecast ' + money(r.predicted) + ' (' + (miss >= 0 ? '+' : '') + pct(miss) + ')') + '" x="' + x0 + '" y="' + y(r.actual) + '" width="' + w + '" height="' + (y(0) - y(r.actual)) + '" rx="3" fill="' + COL.a + '"/>';
      g += '<rect x="' + (x0 + w) + '" y="' + y(r.predicted) + '" width="' + w + '" height="' + (y(0) - y(r.predicted)) + '" rx="3" fill="#DDEFF0" stroke="' + COL.f + '" stroke-dasharray="3 2" pointer-events="none"/>';
      g += '<text x="' + (x0 + w) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10" fill="' + COL.ink + '">' + esc(mn(r.month)) + '</text>'; });
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Forecast test">' + g + '</svg><div class="aph-legend"><span><i style="background:' + COL.a + '"></i>Actual</span><span><i style="background:#DDEFF0;border:1px dashed ' + COL.f + '"></i>What the forecast said</span></div>';
  }
  function dailyChart(R, k) {
    var ds = R.daily.filter(function (d) { return d[k] != null; }), W = 900, H = 200, L = 64, T = 10, B = 24, Hp = H - T - B;
    var max = niceMax(Math.max.apply(null, ds.map(function (d) { return d[k]; }))), bw = (W - L - 8) / Math.max(1, ds.length), y = function (v) { return T + Hp * (1 - v / max); }, g = axis(W, L, T, Hp, max);
    var avg = ds.map(function (d, i) { var s = ds.slice(Math.max(0, i - 6), i + 1); return s.reduce(function (a, b) { return a + b[k]; }, 0) / s.length; });
    ds.forEach(function (d, i) { var x0 = L + i * bw; g += '<rect data-tip="' + esc(new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + ': ' + money(d[k]) + ' (7-day average ' + money(avg[i]) + ')') + '" x="' + x0 + '" y="' + y(d[k]) + '" width="' + Math.max(1, bw - 1) + '" height="' + (y(0) - y(d[k])) + '" fill="#BFE6E7"/>'; if (d.date.slice(8) === '01') g += '<text x="' + x0 + '" y="' + (H - 6) + '" font-size="10" fill="' + COL.ink + '">' + esc(mn(d.date.slice(0, 7))) + '</text>'; });
    g += '<polyline fill="none" stroke="' + COL.a + '" stroke-width="2" points="' + avg.map(function (v, i) { return (L + i * bw + bw / 2) + ',' + y(v); }).join(' ') + '" pointer-events="none"/>';
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily ' + esc(LBL[k]) + '">' + g + '</svg><div class="aph-legend"><span><i style="background:#BFE6E7"></i>Each day</span><span><i style="background:' + COL.a + '"></i>7-day average</span></div>';
  }
  // day by month, like the Daily Volume report: days down, months across, totals at the bottom
  function gridHtml(R, k) {
    var G = R.grid, h = '<div style="overflow:auto"><table class="aph-t aph-grid"><thead><tr><th>Day</th>' + G.map(function (g) { return '<th class="r' + (g.kind !== 'actual' ? ' fc' : '') + '">' + esc(mn(g.month)) + (g.kind === 'forecast' ? '<small>forecast</small>' : g.kind === 'current' ? '<small>this month</small>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var i = 1; i <= 31; i++) h += '<tr><td>' + i + '</td>' + G.map(function (g) { var x = g.days[i - 1]; return '<td class="r' + (x && x.expected ? ' ex' : '') + '">' + (x && x[k] != null ? money(x[k]) : '') + '</td>'; }).join('') + '</tr>';
    h += '<tr class="tot"><td>Total</td>' + G.map(function (g) { return '<td class="r">' + money(g.days.reduce(function (s, x) { return s + (x[k] || 0); }, 0)) + '</td>'; }).join('') + '</tr></tbody></table></div>';
    return h;
  }
  function csv(rows) { return rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n'); }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function gridCsv(R, k) { var G = R.grid, rows = [['Day'].concat(G.map(function (g) { return mn(g.month) + (g.kind === 'forecast' ? ' (forecast)' : g.kind === 'current' ? ' (this month)' : ''); }))]; for (var i = 1; i <= 31; i++) rows.push([i].concat(G.map(function (g) { var x = g.days[i - 1]; return x && x[k] != null ? x[k] : ''; }))); rows.push(['Total'].concat(G.map(function (g) { return Math.round(g.days.reduce(function (s, x) { return s + (x[k] || 0); }, 0) * 100) / 100; }))); return csv(rows); }
  function monthCsv(R) { var rows = [['Month', 'Type', 'Volume', 'Revenue', 'Costs', 'Net', 'Take rate %', 'Low', 'High']]; R.history.concat([R.current], R.forecast).forEach(function (r) { rows.push([r.month, r.kind, r.volume, r.revenue, r.costs, r.net, r.takeRate == null ? '' : (r.takeRate * 100).toFixed(3), r.low || '', r.high || '']); }); return csv(rows); }
  function revHtml(R, d) {
    var M = R.model, T = R.totals, cur = R.current, k = rv.metric, yoy = T.prior12.volume ? T.last12.volume / T.prior12.volume - 1 : null;
    var h = '<div class="aph aph-rev"><div class="aph-hd"><div><h2>Adit Pay home' + navHtml(d) + '</h2><p>Revenue analytics · since ' + esc(mn(R.firstMonth, true)) + ' · admins only · updated ' + esc(new Date(R.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })) + ' CT</p></div><span class="aph-seg"><button type="button" data-rv="print">Print or save as PDF</button><button type="button" data-rv="csv-month">Monthly CSV</button><button type="button" data-rv="refresh">Refresh</button></span></div>';
    h += '<div class="aph-kpis">' +
      '<div class="aph-k"><label>Volume, last 12 months</label><b>' + money(T.last12.volume, true) + '</b><small>' + (yoy == null ? '' : (yoy >= 0 ? '+' : '') + pct(yoy) + ' on the 12 months before') + '</small></div>' +
      '<div class="aph-k c2"><label>Revenue, last 12 months</label><b>' + money(T.last12.revenue, true) + '</b><small>Net ' + money(T.last12.net, true) + ' · take rate ' + pct(M.takeRate, 2) + '</small></div>' +
      '<div class="aph-k c3"><label>' + esc(mn(cur.month, true)) + '</label><b>' + money(cur.volume, true) + '</b><small>Projected volume · ' + money(cur.toDate.volume, true) + ' so far · revenue ' + money(cur.revenue, true) + '</small></div>' +
      '<div class="aph-k c4"><label>Next 6 months, forecast</label><b>' + money(T.next6.volume, true) + '</b><small>Revenue ' + money(T.next6.revenue, true) + ' · net ' + money(T.next6.net, true) + '</small></div>' +
      '<div class="aph-k c5"><label>Growth and accuracy</label><b>' + (M.growthPerMonth >= 0 ? '+' : '') + M.growthPerMonth + '%/mo</b><small>' + M.growthPerYear + '% a year · forecast test missed by ' + M.mape + '%</small></div></div>';
    h += '<div class="aph-c aph-sec"><div class="aph-dh"><div><h3>History and forecast</h3><p class="sub">Every month since ' + esc(mn(R.firstMonth, true)) + ', this month projected and the next six months forecast with the likely range</p></div><span class="aph-seg">' + ['volume', 'revenue', 'net'].map(function (m) { return '<button type="button" data-metric="' + m + '" aria-pressed="' + (k === m) + '">' + LBL[m] + '</button>'; }).join('') + '<span style="width:8px"></span>' + [['12', '1 yr'], ['36', '3 yrs'], ['all', 'All']].map(function (s) { return '<button type="button" data-span="' + s[0] + '" aria-pressed="' + (rv.span === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</span></div>' + trendChart(R, k, rv.span) + '</div>';
    h += '<div class="aph-g2 aph-sec"><div class="aph-c"><h3>Year over year</h3><p class="sub">Monthly volume, one line per year (this year includes this month projected)</p>' + yoyChart(R) + '</div>' +
      '<div class="aph-c"><h3>How accurate is the forecast</h3><p class="sub">Run as if it were six months ago: average miss ' + M.mape + '%</p>' + testChart(R) + '</div></div>';
    h += '<div class="aph-c aph-sec"><h3>Revenue, costs and net</h3><p class="sub">Last 12 months, this month and the forecast. Revenue = Adit\'s application fees less refunds; costs = Stripe fees and card network costs; net = revenue less costs. Hover a bar for the take rate.</p>' + profitChart(R) + '</div>';
    h += '<div class="aph-g2 aph-sec"><div class="aph-c"><h3>Seasonality</h3><p class="sub">Each calendar month against an average month, from ' + M.seasonYears + ' years of history</p>' + barsChart(M.seasonality, 'index', 'month', function (v) { return v.toFixed(2) + 'x an average month'; }, 440, 'Seasonality') + '</div>' +
      '<div class="aph-c"><h3>Weekday pattern</h3><p class="sub">Each weekday against an average day, last eight weeks (from ' + esc(M.weekdayFrom) + ')</p>' + barsChart(M.weekday, 'volume', 'day', function (v) { return v.toFixed(2) + 'x an average day'; }, 440, 'Weekday pattern') + '</div></div>';
    h += '<div class="aph-c aph-sec"><h3>Day by day, last six months</h3><p class="sub">Volume each day with the 7-day average. Hover a day for the amount.</p>' + dailyChart(R, 'volume') + '</div>';
    h += '<div class="aph-c aph-sec"><div class="aph-dh"><div><h3>Day by month</h3><p class="sub">Like the Daily Volume report: days down, months across. Shaded cells are expected (rest of this month and forecast months).</p></div><span class="aph-seg">' + ['volume', 'revenue'].map(function (m) { return '<button type="button" data-gmetric="' + m + '" aria-pressed="' + (rv.gmetric === m) + '">' + LBL[m] + '</button>'; }).join('') + '<button type="button" data-rv="csv-grid">Download CSV</button></span></div>' + gridHtml(R, rv.gmetric) + '</div>';
    var rows = (rv.showAll ? R.history : R.history.slice(-12)).slice().reverse();
    var tr = function (r, label) { return '<tr class="' + (r.kind === 'forecast' ? 'fc' : r.kind === 'current' ? 'cur' : '') + '"><td>' + esc(mn(r.month, true)) + '</td><td>' + label + '</td><td class="r">' + money(r.volume) + '</td><td class="r">' + money(r.revenue) + '</td><td class="r">' + money(r.costs) + '</td><td class="r"><b>' + money(r.net) + '</b></td><td class="r">' + pct(r.takeRate, 2) + '</td></tr>'; };
    h += '<div class="aph-c aph-sec"><div class="aph-dh"><div><h3>Month by month</h3><p class="sub">Forecast months first, then this month and the actuals' + (rv.showAll ? ' since ' + esc(mn(R.firstMonth, true)) : ' for the last 12 months') + '</p></div><span class="aph-seg"><button type="button" data-rv="all">' + (rv.showAll ? 'Last 12 months' : 'Every month') + '</button></span></div><table class="aph-t"><thead><tr><th>Month</th><th>Type</th><th class="r">Volume</th><th class="r">Revenue</th><th class="r">Costs</th><th class="r">Net</th><th class="r">Take rate</th></tr></thead><tbody>' +
      R.forecast.slice().reverse().map(function (f) { return tr(f, 'Forecast <small>' + money(f.low, true) + ' to ' + money(f.high, true) + ' volume</small>'); }).join('') + tr(cur, 'This month <small>' + money(cur.toDate.volume, true) + ' so far</small>') + rows.map(function (r) { return tr(r, 'Actual'); }).join('') + '</tbody></table></div>';
    h += '<div class="aph-c aph-sec aph-how"><h3>How the forecast is worked out</h3><ol>' + R.method.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div></div>';
    return h;
  }
  function renderRevenue(root, d, fresh) {
    css(); view = 'revenue';
    if (!rv.data || fresh) root.innerHTML = '<div class="aph"><div class="aph-hd"><div><h2>Adit Pay home' + navHtml(d) + '</h2><p>Reading every day since day one from Stripe and the Daily Volume report. This can take a minute or two the first time.</p></div></div></div>';
    wireNav(root, d);
    var draw = function () {
      var R = rv.data; root.innerHTML = revHtml(R, d); wireNav(root, d);
      root.querySelectorAll('[data-tip]').forEach(function (el) { tip(el, el.getAttribute('data-tip')); });
      root.querySelectorAll('[data-metric]').forEach(function (b) { b.onclick = function () { rv.metric = b.dataset.metric; draw(); }; });
      root.querySelectorAll('[data-span]').forEach(function (b) { b.onclick = function () { rv.span = b.dataset.span; draw(); }; });
      root.querySelectorAll('[data-gmetric]').forEach(function (b) { b.onclick = function () { rv.gmetric = b.dataset.gmetric; draw(); }; });
      var on = function (k, fn) { var b = root.querySelector('[data-rv="' + k + '"]'); if (b) b.onclick = fn; };
      on('refresh', function () { renderRevenue(root, d, true); });
      on('all', function () { rv.showAll = !rv.showAll; draw(); });
      on('print', function () { window.print(); });
      on('csv-month', function () { download('adit-pay-revenue-by-month.csv', monthCsv(R)); });
      on('csv-grid', function () { download('adit-pay-' + rv.gmetric + '-day-by-month.csv', gridCsv(R, rv.gmetric)); });
    };
    if (rv.data && !fresh) { draw(); return; }
    fetch('/api/aditpay/revenue' + (fresh ? '?fresh=1' : ''), { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
      if (view !== 'revenue') return;
      var p = root.querySelector('.aph-hd p');
      if (!j.success) { if (p) p.textContent = j.error || 'Could not load revenue.'; return; }
      if (j.data.loading) { setTimeout(function () { if (view === 'revenue') renderRevenue(root, d); }, 15000); return; }
      if (j.data.error) { if (p) p.textContent = 'Stripe data could not be read: ' + j.data.error; return; }
      rv.data = j.data; draw();
    }).catch(function () { var p = root.querySelector('.aph-hd p'); if (p) p.textContent = 'Could not load revenue. Try Refresh.'; });
  }

  var mounted = null;
  window.AditPayHome = { mount: function (root) { if (!root) return; mounted = root; load(root, false); } };
})();
