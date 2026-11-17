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

  // ── Batch 374: Revenue (admins): past six months, this month and a six month forecast, with the day-wise split ──
  var view = 'overview', last = null, rv = { metric: 'revenue', month: null, data: null };
  function navHtml(d) { return d && d._admin ? '<span class="aph-nav" role="group" aria-label="Adit Pay home view"><button type="button" data-view="overview" aria-pressed="' + (view === 'overview') + '">Overview</button><button type="button" data-view="revenue" aria-pressed="' + (view === 'revenue') + '">Revenue</button></span>' : ''; }
  function wireNav(root, d) { root.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { view = b.dataset.view; if (view === 'revenue') renderRevenue(root, d); else render(root, d); }; }); }
  var LBL = { revenue: 'Revenue', net: 'Net revenue', volume: 'Volume', costs: 'Costs' };
  function monthName(m) { var p = m.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, 15)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }); }
  function tip(el, text) { var t = document.getElementById('aph-tip'); if (!t) { t = document.createElement('div'); t.id = 'aph-tip'; t.className = 'aph-tip'; document.body.appendChild(t); } el.addEventListener('mousemove', function (e) { t.textContent = text; t.style.display = 'block'; t.style.left = (e.clientX + 12) + 'px'; t.style.top = (e.clientY + 12) + 'px'; }); el.addEventListener('mouseleave', function () { t.style.display = 'none'; }); }
  function monthChart(R, k) {
    var bars = R.past.map(function (p) { return { m: p.month, v: p[k], kind: 'a' }; });
    var cur = R.current, cp = cur.projected || {};
    bars.push({ m: cur.month, v: k === 'revenue' || k === 'volume' ? cur.toDate[k] : null, p: cp[k], kind: 'c' });
    R.forecast.forEach(function (f) { bars.push({ m: f.month, v: f[k], lo: f[k + 'Low'], hi: f[k + 'High'], kind: 'f' }); });
    var max = Math.max.apply(null, bars.map(function (b) { return Math.max(b.v || 0, b.p || 0, b.hi || 0); })) || 1;
    var W = 760, H = 220, L = 54, B = 26, T = 10, bw = (W - L - 10) / bars.length, y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var g = '';
    for (var i = 0; i <= 4; i++) { var v = max * i / 4; g += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#EEF1F5"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="#6B849A">' + money(v, true) + '</text>'; }
    bars.forEach(function (b, i) {
      var x = L + i * bw + 5, w = bw - 10;
      if (b.kind === 'a') g += '<rect data-tip="' + esc(monthName(b.m) + ': ' + money(b.v) + ' (actual)') + '" x="' + x + '" y="' + y(b.v) + '" width="' + w + '" height="' + (y(0) - y(b.v)) + '" rx="4" fill="#2A9FA4"/>';
      else if (b.kind === 'c') { if (b.p) g += '<rect data-tip="' + esc(monthName(b.m) + ': ' + money(b.p) + ' projected') + '" x="' + x + '" y="' + y(b.p) + '" width="' + w + '" height="' + (y(0) - y(b.p)) + '" rx="4" fill="#BFE6E7"/>'; if (b.v != null) g += '<rect data-tip="' + esc(monthName(b.m) + ': ' + money(b.v) + ' so far') + '" x="' + x + '" y="' + y(b.v) + '" width="' + w + '" height="' + (y(0) - y(b.v)) + '" rx="4" fill="#2A9FA4"/>'; }
      else { g += '<rect data-tip="' + esc(monthName(b.m) + ': ' + money(b.v) + ' forecast (' + money(b.lo, true) + ' to ' + money(b.hi, true) + ')') + '" x="' + x + '" y="' + y(b.v) + '" width="' + w + '" height="' + (y(0) - y(b.v)) + '" rx="4" fill="#DDEFF0" stroke="#7FC7CA" stroke-dasharray="3 2"/>'; g += '<line x1="' + (x + w / 2) + '" x2="' + (x + w / 2) + '" y1="' + y(b.hi) + '" y2="' + y(b.lo) + '" stroke="#4C6378" stroke-width="1.5"/>'; }
      g += '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#6B849A">' + esc(monthName(b.m)) + '</text>';
    });
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(LBL[k]) + ' by month, actual and forecast">' + g + '</svg>' +
      '<div class="aph-legend"><span><i style="background:#2A9FA4"></i>Actual</span><span><i style="background:#BFE6E7"></i>This month, projected</span><span><i style="background:#DDEFF0;border:1px dashed #7FC7CA"></i>Forecast (line: likely range)</span></div>';
  }
  function dayChart(R, k) {
    var ds = R.daily.slice(-186), max = Math.max.apply(null, ds.map(function (d) { return d[k]; })) || 1;
    var W = 760, H = 150, L = 54, B = 20, T = 8, bw = (W - L - 6) / Math.max(1, ds.length), y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var g = '';
    for (var i = 0; i <= 3; i++) { var v = max * i / 3; g += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#EEF1F5"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="#6B849A">' + money(v, true) + '</text>'; }
    ds.forEach(function (d, i) { var x = L + i * bw; g += '<rect data-tip="' + esc(new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) + ': ' + money(d[k])) + '" x="' + x + '" y="' + y(d[k]) + '" width="' + Math.max(1, bw - 1) + '" height="' + (y(0) - y(d[k])) + '" fill="#36AFB4"/>'; if (d.date.slice(8) === '01') g += '<text x="' + x + '" y="' + (H - 5) + '" font-size="10" fill="#6B849A">' + esc(monthName(d.date.slice(0, 7))) + '</text>'; });
    return '<svg class="aph-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily ' + esc(LBL[k]) + ', last six months">' + g + '</svg>';
  }
  function revHtml(R, d) {
    var k = rv.metric, T = R.totals, cur = R.current, months = [cur.month].concat(R.forecast.map(function (f) { return f.month; }));
    if (!rv.month || months.indexOf(rv.month) < 0) rv.month = R.forecast[0].month;
    var h = '<div class="aph"><div class="aph-hd"><div><h2>Adit Pay home' + navHtml(d) + '</h2><p>Revenue from Stripe · admins only · updated ' + esc(new Date(R.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })) + ' CT</p></div><button type="button" data-rv="refresh">Refresh</button></div>';
    h += '<div class="aph-kpis">' +
      '<div class="aph-k"><label>Revenue, last 6 months</label><b>' + money(T.past6.revenue, true) + '</b><small>Net ' + money(T.past6.net, true) + ' after ' + money(T.past6.costs, true) + ' costs</small></div>' +
      '<div class="aph-k c2"><label>Volume, last 6 months</label><b>' + money(T.past6.volume, true) + '</b><small>Take rate ' + (T.past6.volume ? (T.past6.revenue / T.past6.volume * 100).toFixed(2) + '%' : '-') + '</small></div>' +
      '<div class="aph-k c3"><label>' + esc(monthName(cur.month)) + ' so far</label><b>' + money(cur.toDate.revenue, true) + '</b><small>Projected ' + money(cur.projected.revenue, true) + ' for the month</small></div>' +
      '<div class="aph-k c4"><label>Forecast revenue, next 6 months</label><b>' + money(T.next6.revenue, true) + '</b><small>Net ' + money(T.next6.net, true) + '</small></div>' +
      '<div class="aph-k c5"><label>Forecast volume, next 6 months</label><b>' + money(T.next6.volume, true) + '</b><small>Trend ' + (R.method.trend.revenue.perMonth >= 0 ? '+' : '') + money(R.method.trend.revenue.perMonth, true) + ' revenue a month</small></div></div>';
    h += '<div class="aph-c" style="margin-bottom:14px"><div class="aph-dh"><div><h3>By month</h3><p class="sub">Six months of actuals, this month so far and projected, and the next six months forecast</p></div><span class="aph-seg" role="group" aria-label="Metric">' + ['revenue', 'net', 'volume'].map(function (m) { return '<button type="button" data-metric="' + m + '" aria-pressed="' + (k === m) + '">' + LBL[m] + '</button>'; }).join('') + '</span></div>' + monthChart(R, k) + '</div>';
    var row = function (p, cls, type) { return '<tr class="' + cls + '"><td>' + esc(monthName(p.month)) + '</td><td>' + type + '</td><td class="r">' + money(p.volume) + '</td><td class="r">' + money(p.revenue) + '</td><td class="r">' + money(p.costs) + '</td><td class="r"><b>' + money(p.net) + '</b></td><td class="r">' + (p.volume ? (p.revenue / p.volume * 100).toFixed(2) + '%' : '-') + '</td></tr>'; };
    var cp = Object.assign({ month: cur.month }, cur.projected);
    h += '<div class="aph-c" style="margin-bottom:14px"><h3>Monthly figures</h3><p class="sub">Revenue = Adit\'s application fees less fee refunds. Costs = Stripe fees and card network costs. Net = revenue less costs.</p><table class="aph-t"><thead><tr><th>Month</th><th>Type</th><th class="r">Volume</th><th class="r">Revenue</th><th class="r">Costs</th><th class="r">Net</th><th class="r">Take rate</th></tr></thead><tbody>' +
      R.past.map(function (p) { return row(p, '', 'Actual'); }).join('') + row(cp, 'cur', 'This month (' + money(cur.toDate.revenue, true) + ' so far, day ' + cur.toDate.throughDay + ' of ' + cur.toDate.daysInMonth + ')') +
      R.forecast.map(function (f) { return row(f, 'fc', 'Forecast <small>' + money(f.revenueLow, true) + ' to ' + money(f.revenueHigh, true) + ' revenue</small>'); }).join('') + '</tbody></table></div>';
    h += '<div class="aph-c" style="margin-bottom:14px"><h3>Day by day, last six months</h3><p class="sub">' + esc(LBL[k === 'volume' ? 'volume' : 'revenue']) + ' per day. Hover a day for the amount.</p>' + dayChart(R, k === 'volume' ? 'volume' : 'revenue') + '</div>';
    var sel = '<select class="aph-date" data-month aria-label="Month">' + months.map(function (m) { return '<option value="' + m + '"' + (m === rv.month ? ' selected' : '') + '>' + monthName(m) + (m === cur.month ? ' (this month)' : '') + '</option>'; }).join('') + '</select>';
    var days = rv.month === cur.month ? R.curDays : (R.forecast.find(function (f) { return f.month === rv.month; }) || { days: [] }).days;
    var todayStr = R.today;
    h += '<div class="aph-g2"><div class="aph-c"><div class="aph-dh"><div><h3>Day-wise split</h3><p class="sub">Each day\'s expected amount; past days of this month show the actual</p></div>' + sel + '</div><table class="aph-t"><thead><tr><th>Day</th><th class="r">Revenue</th><th class="r">Volume</th></tr></thead><tbody>' +
      days.map(function (x) { var past = rv.month === cur.month && x.date < todayStr; var wd = new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); return '<tr' + (past ? '' : ' class="fc"') + '><td>' + esc(wd) + (past ? ' <small>actual</small>' : '') + '</td><td class="r">' + money(past ? x.actual : x.amount) + '</td><td class="r">' + money(past ? x.actualVolume : x.volume) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    h += '<div class="aph-c aph-how"><h3>How the numbers are worked out</h3><ol>' + R.method.text.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol><p class="aph-note">Trend per month: revenue ' + money(R.method.trend.revenue.perMonth) + ', volume ' + money(R.method.trend.volume.perMonth) + ', net ' + money(R.method.trend.net.perMonth) + '. Typical miss: revenue ' + money(R.method.trend.revenue.miss) + '. Weekday pattern from ' + esc(R.method.weekday.from) + ' to ' + esc(R.method.weekday.to) + '.</p></div></div></div>';
    return h;
  }
  function renderRevenue(root, d, fresh) {
    css(); view = 'revenue';
    if (!rv.data || fresh) root.innerHTML = '<div class="aph"><div class="aph-hd"><div><h2>Adit Pay home' + navHtml(d) + '</h2><p>Reading six months of Stripe data. This can take a minute the first time.</p></div></div></div>';
    wireNav(root, d);
    var draw = function () {
      root.innerHTML = revHtml(rv.data, d); wireNav(root, d);
      root.querySelectorAll('[data-tip]').forEach(function (el) { tip(el, el.getAttribute('data-tip')); });
      root.querySelectorAll('[data-metric]').forEach(function (b) { b.onclick = function () { rv.metric = b.dataset.metric; draw(); }; });
      var ms = root.querySelector('[data-month]'); if (ms) ms.onchange = function () { rv.month = ms.value; draw(); };
      var rf = root.querySelector('[data-rv="refresh"]'); if (rf) rf.onclick = function () { renderRevenue(root, d, true); };
    };
    if (rv.data && !fresh) { draw(); return; }
    fetch('/api/aditpay/revenue' + (fresh ? '?fresh=1' : ''), { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
      if (view !== 'revenue') return;
      if (!j.success) { root.querySelector('.aph-hd p').textContent = j.error || 'Could not load revenue.'; return; }
      if (j.data.loading) { setTimeout(function () { if (view === 'revenue') renderRevenue(root, d); }, 15000); return; }
      if (j.data.error) { root.querySelector('.aph-hd p').textContent = 'Stripe data could not be read: ' + j.data.error; return; }
      rv.data = j.data; draw();
    }).catch(function () { var p = root.querySelector('.aph-hd p'); if (p) p.textContent = 'Could not load revenue. Try Refresh.'; });
  }

  var mounted = null;
  window.AditPayHome = { mount: function (root) { if (!root) return; mounted = root; load(root, false); } };
})();
