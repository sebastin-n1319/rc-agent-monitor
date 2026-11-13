/* Batch 320: small chart kit for the Settings pages (AI usage, Desk drafts, Drafted tickets, Desk webhook).
   Plain HTML and inline SVG, no library. Every mark has a hover and keyboard tooltip, every chart a text label,
   and colour is never the only cue (labels and values sit next to each mark). */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  // Fixed order, never cycled: blue, teal, violet, amber, pink, slate.
  const PAL = ['#3B6FE0', '#12A594', '#8E59D9', '#E5932A', '#D9467A', '#6B7A90'];
  const C = { blue: PAL[0], teal: PAL[1], violet: PAL[2], amber: PAL[3], pink: PAL[4], slate: PAL[5], red: '#E5484D', grey: '#C9CED8' };
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

  // A big number tile. tone: '', 'good', 'warn', 'bad'.
  function kpi(label, value, sub, tone) {
    return `<div class="sc-kpi ${tone ? 'sc-' + tone : ''}"><div class="sc-kpi-l">${esc(label)}</div><div class="sc-kpi-v">${value}</div>${sub ? `<div class="sc-kpi-s">${sub}</div>` : ''}</div>`;
  }
  // A ring with the share in the middle (for one rate: coverage, adoption).
  function ring(value, total, label, color) {
    const p = pct(value, total), r = 34, c = 2 * Math.PI * r, off = c * (1 - p / 100);
    return `<div class="sc-ring" role="img" aria-label="${esc(label)}: ${p}% (${num(value)} of ${num(total)})">
      <svg viewBox="0 0 84 84" width="84" height="84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--sc-track)" stroke-width="9"/>
        <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color || C.blue}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>
      <div class="sc-ring-v">${p}%</div><div class="sc-ring-l">${esc(label)}<span>${num(value)} of ${num(total)}</span></div></div>`;
  }
  // Horizontal bars, one per row: [{label, n, color?, note?}]
  function hbars(rows, opts) {
    opts = opts || {};
    if (!rows.length) return `<p class="sc-empty">${esc(opts.empty || 'Nothing yet.')}</p>`;
    const max = Math.max(1e-9, ...rows.map((r) => r.n)), total = rows.reduce((s, r) => s + r.n, 0) || 1, f = opts.fmt || num;
    return `<div class="sc-hbars" role="list">${rows.map((r, i) => `<div class="sc-hbar" role="listitem" tabindex="0" title="${esc(r.label)}: ${f(r.n)} (${pct(r.n, total)}%)">
      <div class="sc-hbar-l">${esc(r.label)}${r.note ? `<span class="sc-tag">${esc(r.note)}</span>` : ''}</div>
      <div class="sc-hbar-t"><span style="width:${Math.max(2, Math.round(100 * r.n / max))}%;background:${r.color || opts.color || PAL[i % PAL.length]}"></span></div>
      <div class="sc-hbar-n">${f(r.n)}<small>${pct(r.n, total)}%</small></div></div>`).join('')}</div>`;
  }
  // A donut with a legend: [{label, n, color}]
  function donut(rows, centerLabel, fmt) {
    const total = rows.reduce((s, r) => s + r.n, 0), f = fmt || num;
    if (!total) return '<p class="sc-empty">Nothing yet.</p>';
    const r = 54, c = 2 * Math.PI * r; let acc = 0;
    const arcs = rows.filter((x) => x.n).map((x) => { const len = c * x.n / total, gap = rows.length > 1 ? 2 : 0;
      const a = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${x.color}" stroke-width="18" stroke-dasharray="${Math.max(0.5, len - gap).toFixed(1)} ${(c - Math.max(0.5, len - gap)).toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 70 70)"><title>${esc(x.label)}: ${f(x.n)} (${pct(x.n, total)}%)</title></circle>`;
      acc += len; return a; }).join('');
    return `<div class="sc-donut"><svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="${esc(rows.map((x) => x.label + ' ' + x.n).join(', '))}">${arcs}
      <text x="70" y="68" text-anchor="middle" class="sc-donut-v">${f(total)}</text><text x="70" y="86" text-anchor="middle" class="sc-donut-l">${esc(centerLabel || 'total')}</text></svg>
      <ul class="sc-legend">${rows.map((x) => `<li><i style="background:${x.color}"></i><span>${esc(x.label)}</span><b>${f(x.n)}</b><small>${pct(x.n, total)}%</small></li>`).join('')}</ul></div>`;
  }
  // Stacked columns per day or hour. series: [{key,label,color}], points: [{x (label), tip, values:{key:n}}]
  function columns(points, series, opts) {
    opts = opts || {};
    const tot = (p) => series.reduce((s, k) => s + (Number(p.values[k.key]) || 0), 0);
    const max = Math.max(1, ...points.map(tot));
    const every = Math.ceil(points.length / (opts.labels || 7));
    const cols = points.map((p, i) => {
      const t = tot(p);
      const segs = series.map((k) => { const v = Number(p.values[k.key]) || 0; return v ? `<span style="height:${(100 * v / max).toFixed(2)}%;background:${k.color}"></span>` : ''; }).join('');
      const tip = `<b>${esc(p.tip || p.x)}</b>${series.map((k) => `<div><i style="background:${k.color}"></i>${esc(k.label)} <b>${num(p.values[k.key])}</b></div>`).join('')}`;
      return `<div class="sc-col" tabindex="0" aria-label="${esc(p.tip || p.x)}: ${series.map((k) => k.label + ' ' + (p.values[k.key] || 0)).join(', ')}"><div class="sc-tip">${tip}</div><div class="sc-col-bar">${segs}</div><div class="sc-col-x">${(points.length - 1 - i) % every === 0 ? esc(p.x) : ''}</div>${t && opts.totals ? `<div class="sc-col-t" style="bottom:calc(${(100 * t / max).toFixed(1)}% + 20px)">${num(t)}</div>` : ''}</div>`;
    }).join('');
    return `<div class="sc-cols-wrap"><ul class="sc-legend sc-legend-row">${series.map((k) => `<li><i style="background:${k.color}"></i><span>${esc(k.label)}</span></li>`).join('')}</ul>
      <div class="sc-cols" role="img" aria-label="${esc(opts.label || 'Chart')}"><div class="sc-cols-y"><span>${num(max)}</span><span>0</span></div><div class="sc-cols-in">${cols}</div></div></div>`;
  }
  // A funnel: [{label, n, color}] each bar as wide as its share of the first.
  function funnel(steps) {
    const top = Math.max(1, steps[0] ? steps[0].n : 1);
    return `<div class="sc-funnel">${steps.map((s, i) => `<div class="sc-fstep" tabindex="0" title="${esc(s.label)}: ${num(s.n)}">
      <div class="sc-fbar" style="width:${Math.max(6, Math.round(100 * s.n / top))}%;background:${s.color}"><b>${num(s.n)}</b></div>
      <div class="sc-flab">${esc(s.label)}${i ? `<small>${pct(s.n, steps[i - 1].n)}% of the step above</small>` : ''}</div></div>`).join('')}</div>`;
  }
  // A line with dots (one value per point), for trends like "% changed by agents".
  function line(points, opts) {
    opts = opts || {};
    const pts = points.filter((p) => p.v != null);
    if (pts.length < 2) return `<p class="sc-empty">${esc(opts.empty || 'Needs two days of data.')}</p>`;
    const W = 320, H = 110, pad = 18, max = opts.max || Math.max(1, ...pts.map((p) => p.v));
    const xy = pts.map((p, i) => [pad + i * (W - 2 * pad) / (pts.length - 1), H - pad - (H - 2 * pad) * p.v / max]);
    return `<svg class="sc-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="sc-axis"/>
      <polyline fill="none" stroke="${opts.color || C.violet}" stroke-width="2" points="${xy.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>
      ${xy.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="${opts.color || C.violet}" stroke="#fff" stroke-width="2"><title>${esc(pts[i].x)}: ${pts[i].v}${opts.unit || ''}</title></circle>`).join('')}
      <text x="${pad}" y="${H - 3}" class="sc-axis-t">${esc(pts[0].x)}</text><text x="${W - pad}" y="${H - 3}" text-anchor="end" class="sc-axis-t">${esc(pts[pts.length - 1].x)}</text></svg>`;
  }
  // One stacked bar across the full width with a legend (share of a whole).
  function strip(rows) {
    const total = rows.reduce((s, r) => s + r.n, 0);
    if (!total) return '<p class="sc-empty">Nothing yet.</p>';
    return `<div class="sc-strip" role="img" aria-label="${esc(rows.map((r) => r.label + ' ' + r.n).join(', '))}">${rows.filter((r) => r.n).map((r) => `<span style="flex:${r.n};background:${r.color}" title="${esc(r.label)}: ${num(r.n)} (${pct(r.n, total)}%)"></span>`).join('')}</div>
      <ul class="sc-legend sc-legend-row">${rows.filter((r) => r.n).map((r) => `<li><i style="background:${r.color}"></i><span>${esc(r.label)}</span><b>${num(r.n)}</b></li>`).join('')}</ul>`;
  }
  const dayLabel = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  window.StgCharts = { kpi, ring, hbars, donut, columns, funnel, line, strip, PAL, C, pct, dayLabel };
})();
