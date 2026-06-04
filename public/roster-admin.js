/**
 * Roster Admin v3 — 2026-05-29
 *
 * World-class attendance grid inspired by Deputy / Humanity / When I Work.
 *
 * Features:
 *  • 5 KPI cards  (Active · Present · On Leave · NCNS · Coverage %)
 *  • Day-header coverage heatmap  (green→amber→red ring)
 *  • Weekly dividers (thicker border every 7 days)
 *  • Daily coverage row pinned at bottom of grid
 *  • Full per-agent totals: P | WFH | OD | OFF | PL | UPL | SL | NCNS | Att %
 *  • Left-click = cycle P→WFH→OFF→clear  |  Right-click = full palette
 *  • Shift grouping  (group rows by shift sub-header)
 *  • Double-click agent name = edit agent modal
 *  • Bulk-column fill: click date header to fill all empty in that column
 *  • Audit log with 80-event history
 *  • Export CSV
 *  • Debounced auto-save (600ms)
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     CSS INJECTION — guarantees styles even if SW serves stale
  ══════════════════════════════════════════════════════════ */
  (function injectCSS() {
    if (document.getElementById('rx-injected-css')) return;
    const s = document.createElement('style');
    s.id = 'rx-injected-css';
    s.textContent = `
/* ═══════════════════════════════════════════════════════════════
   ADIT ROSTER — PREMIUM REDESIGN v5.0
   Inspired by Keka / Deputy / modern HR SaaS
═══════════════════════════════════════════════════════════════ */
:root {
  --rx-bg: #F0F2F7;
  --rx-surface: #FFFFFF;
  --rx-surface2: #F8FAFC;
  --rx-border: #E2E8F0;
  --rx-border2: #EEF1F6;
  --rx-ink: #0F172A;
  --rx-ink2: #475569;
  --rx-ink3: #94A3B8;
  --rx-ink4: #CBD5E1;
  --rx-accent: #F97316;
  --rx-accent-light: rgba(249,115,22,.08);
  --rx-accent-glow: rgba(249,115,22,.20);
  --rx-weekend: #F5F3FF;
  --rx-today-bg: rgba(249,115,22,.06);
  --rx-green: #059669;
  --rx-navy: #1E293B;
  --rx-shadow-xs: 0 1px 3px rgba(15,23,42,.07);
  --rx-shadow-sm: 0 2px 8px rgba(15,23,42,.08);
  --rx-shadow-md: 0 4px 20px rgba(15,23,42,.10);
  --rx-radius: 16px;
  --rx-radius-sm: 10px;
  --rx-row-h: 46px;
  --rx-cell-w: 38px;
  --rx-agent-w: 300px;
  --rx-att-w: 100px;
  --rx-spring: cubic-bezier(.34,1.56,.64,1);
  --rx-ease: cubic-bezier(.4,0,.2,1);
}

#roster-admin-root {
  background: var(--rx-bg) !important;
  font-family: 'Poppins', system-ui, -apple-system, sans-serif !important;
  -webkit-font-smoothing: antialiased !important;
  color: var(--rx-ink) !important;
}
#roster-admin-root * { box-sizing: border-box !important; }
#roster-admin-root .rx-wrap { width:100% !important; max-width:100% !important; margin:0 !important; padding:0 16px 32px !important; }

/* ── KPI CARDS ─────────────────────────────────────────────── */
#roster-admin-root .rx-kpis {
  display: grid !important;
  grid-template-columns: repeat(5,1fr) !important;
  gap: 12px !important; margin-bottom: 12px !important;
}
#roster-admin-root .rx-kpi {
  background: var(--rx-surface) !important;
  border: 1px solid var(--rx-border) !important;
  border-radius: var(--rx-radius) !important;
  padding: 16px 18px 14px !important;
  box-shadow: var(--rx-shadow-sm) !important;
  display: flex !important; align-items: flex-start !important;
  gap: 14px !important; position: relative !important;
  overflow: hidden !important;
  transition: box-shadow .22s var(--rx-ease), transform .22s var(--rx-ease) !important;
}
#roster-admin-root .rx-kpi:hover { box-shadow: var(--rx-shadow-md) !important; transform: translateY(-1px) !important; }
#roster-admin-root .rx-kpi::before {
  content: '' !important; display: block !important;
  position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important;
  height: 3px !important; border-radius: var(--rx-radius) var(--rx-radius) 0 0 !important;
  background: var(--rx-accent) !important;
}
#roster-admin-root .rx-kpi::after { display: none !important; }
#roster-admin-root .rx-kpi.rx-kpi-green::before  { background: linear-gradient(90deg,#059669,#34D399) !important; }
#roster-admin-root .rx-kpi.rx-kpi-amber::before  { background: linear-gradient(90deg,#D97706,#FCD34D) !important; }
#roster-admin-root .rx-kpi.rx-kpi-red::before    { background: linear-gradient(90deg,#DC2626,#FCA5A5) !important; }
#roster-admin-root .rx-kpi.rx-kpi-teal::before   { background: linear-gradient(90deg,#0891B2,#67E8F9) !important; }
#roster-admin-root .rx-kpi.rx-kpi-purple::before { background: linear-gradient(90deg,#7C3AED,#C4B5FD) !important; }
#roster-admin-root .rx-kpi-icon {
  width: 42px !important; height: 42px !important; min-width: 42px !important;
  border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important;
  background: var(--rx-surface2) !important; flex-shrink: 0 !important; margin-top: 2px !important;
}
#roster-admin-root .rx-kpi.rx-kpi-green .rx-kpi-icon  { background: rgba(16,185,129,.10) !important; }
#roster-admin-root .rx-kpi.rx-kpi-amber .rx-kpi-icon  { background: rgba(245,158,11,.10) !important; }
#roster-admin-root .rx-kpi.rx-kpi-red   .rx-kpi-icon  { background: rgba(239,68,68,.10) !important; }
#roster-admin-root .rx-kpi.rx-kpi-teal  .rx-kpi-icon  { background: rgba(6,182,212,.10) !important; }
#roster-admin-root .rx-kpi.rx-kpi-purple .rx-kpi-icon { background: rgba(139,92,246,.10) !important; }
#roster-admin-root .rx-kpi-text { flex: 1 !important; min-width: 0 !important; }
#roster-admin-root .rx-kpi-lbl { font-size: 10px !important; font-weight: 700 !important; color: var(--rx-ink3) !important; letter-spacing: .06em !important; text-transform: uppercase !important; margin: 0 0 5px !important; }
#roster-admin-root .rx-kpi-val { font-size: 28px !important; font-weight: 800 !important; letter-spacing: -0.04em !important; color: var(--rx-ink) !important; line-height: 1 !important; margin: 0 0 4px !important; }
#roster-admin-root .rx-kpi-sub { font-size: 10.5px !important; color: var(--rx-ink3) !important; font-weight: 400 !important; line-height: 1.3 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
#roster-admin-root .rx-kpi-bar { height: 3px !important; border-radius: 99px !important; background: var(--rx-border2) !important; margin-top: 10px !important; overflow: hidden !important; }
#roster-admin-root .rx-kpi-bar-fill { height: 100% !important; border-radius: 99px !important; background: linear-gradient(90deg,var(--rx-accent),#FB923C) !important; transition: width .6s var(--rx-ease) !important; }

/* ── TOOLBAR ─────────────────────────────────────────────────── */
#roster-admin-root .rx-toolbar {
  display: flex !important; align-items: center !important; gap: 8px !important; flex-wrap: wrap !important;
  background: var(--rx-surface) !important; border: 1px solid var(--rx-border) !important;
  border-radius: var(--rx-radius) !important; padding: 10px 14px !important;
  box-shadow: var(--rx-shadow-xs) !important; margin-bottom: 8px !important;
}
#roster-admin-root .rx-month-display {
  display: flex !important; align-items: center !important; position: relative !important;
  background: var(--rx-navy) !important; border-radius: var(--rx-radius-sm) !important;
  padding: 0 12px !important; height: 34px !important; min-width: 140px !important;
}
#roster-admin-root .rx-month-display span { font-size: 13px !important; font-weight: 700 !important; min-width: 110px !important; text-align: center !important; color: #fff !important; }
#roster-admin-root .rx-month-display input[type=month] { position: absolute !important; opacity: 0 !important; width: 100% !important; height: 100% !important; cursor: pointer !important; left: 0 !important; }
#roster-admin-root .rx-icon-btn {
  width: 34px !important; height: 34px !important; border-radius: var(--rx-radius-sm) !important;
  border: 1px solid var(--rx-border) !important; background: var(--rx-surface) !important; color: var(--rx-ink3) !important;
  cursor: pointer !important; display: grid !important; place-items: center !important; font-size: 14px !important;
  transition: all .15s var(--rx-ease) !important; flex-shrink: 0 !important;
}
#roster-admin-root .rx-icon-btn:hover { background: var(--rx-accent-light) !important; border-color: var(--rx-accent) !important; color: var(--rx-accent) !important; }
#roster-admin-root .rx-pill {
  height: 34px !important; padding: 0 12px !important; border-radius: var(--rx-radius-sm) !important;
  border: 1px solid var(--rx-border) !important; background: var(--rx-surface) !important; color: var(--rx-ink2) !important;
  font-family: 'Poppins',sans-serif !important; font-size: 12px !important; font-weight: 500 !important;
  cursor: pointer !important; display: inline-flex !important; align-items: center !important; gap: 6px !important;
  transition: all .14s !important; white-space: nowrap !important;
}
#roster-admin-root .rx-pill:hover { background: var(--rx-surface2) !important; }
#roster-admin-root .rx-pill-primary { background: var(--rx-accent) !important; border-color: var(--rx-accent) !important; color: #fff !important; font-weight: 600 !important; box-shadow: 0 2px 8px rgba(249,115,22,.28) !important; }
#roster-admin-root .rx-search {
  display: flex !important; align-items: center !important; gap: 8px !important; height: 34px !important; padding: 0 12px !important;
  border: 1px solid var(--rx-border) !important; border-radius: var(--rx-radius-sm) !important;
  background: var(--rx-surface2) !important; flex: 1 !important; min-width: 180px !important;
  transition: border-color .15s, box-shadow .15s !important;
}
#roster-admin-root .rx-search:focus-within { border-color: var(--rx-accent) !important; box-shadow: 0 0 0 3px var(--rx-accent-glow) !important; background: var(--rx-surface) !important; }
#roster-admin-root .rx-search input { border: none !important; outline: none !important; font-family: 'Poppins',sans-serif !important; font-size: 12.5px !important; width: 100% !important; color: var(--rx-ink) !important; background: transparent !important; }
#roster-admin-root .rx-search input::placeholder { color: var(--rx-ink4) !important; }
#roster-admin-root .rx-switch { display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 11.5px !important; color: var(--rx-ink2) !important; cursor: pointer !important; padding: 4px 10px !important; background: var(--rx-surface2) !important; border-radius: 99px !important; border: 1px solid var(--rx-border) !important; user-select: none !important; }
#roster-admin-root .rx-switch input { accent-color: var(--rx-accent) !important; cursor: pointer !important; }
#roster-admin-root .rx-tb-group { display: flex !important; align-items: center !important; gap: 6px !important; }
#roster-admin-root .rx-tb-grow { flex: 1 1 auto !important; }

/* ── FILTER BAR ──────────────────────────────────────────────── */
#roster-admin-root .rx-filter-bar {
  display: flex !important; align-items: center !important; padding: 8px 14px !important;
  background: var(--rx-surface) !important; border: 1px solid var(--rx-border) !important;
  border-radius: var(--rx-radius) !important; flex-wrap: wrap !important; gap: 0 !important; row-gap: 5px !important;
  margin-bottom: 8px !important; box-shadow: var(--rx-shadow-xs) !important;
}
#roster-admin-root .rx-filter-group { display: flex !important; align-items: center !important; gap: 4px !important; flex-wrap: wrap !important; }
#roster-admin-root .rx-filter-label { font-size: 9px !important; font-weight: 800 !important; color: var(--rx-ink3) !important; text-transform: uppercase !important; letter-spacing: .08em !important; display: inline-flex !important; align-items: center !important; gap: 3px !important; white-space: nowrap !important; margin-right: 5px !important; }
#roster-admin-root .rx-filter-sep { width: 1px !important; height: 20px !important; background: var(--rx-border) !important; margin: 0 10px !important; flex-shrink: 0 !important; }
#roster-admin-root .rx-filter-chip {
  display: inline-flex !important; align-items: center !important; gap: 5px !important; padding: 3px 11px !important;
  border-radius: 999px !important; font-size: 11px !important; font-weight: 500 !important; border: 1.5px solid transparent !important;
  background: var(--rx-surface2) !important; color: var(--rx-ink2) !important; cursor: pointer !important;
  transition: all .14s var(--rx-ease) !important; font-family: 'Poppins',sans-serif !important;
}
#roster-admin-root .rx-filter-chip:hover { border-color: var(--rx-accent) !important; color: var(--rx-accent) !important; background: var(--rx-accent-light) !important; }
#roster-admin-root .rx-filter-chip.active { background: var(--rx-accent) !important; border-color: var(--rx-accent) !important; color: #fff !important; font-weight: 600 !important; }
#roster-admin-root .rx-fc-dot { width: 7px !important; height: 7px !important; border-radius: 50% !important; display: inline-block !important; flex-shrink: 0 !important; }
#roster-admin-root .rx-filter-clear { margin-left: auto !important; display: inline-flex !important; align-items: center !important; gap: 4px !important; padding: 3px 11px !important; border-radius: 999px !important; font-size: 10.5px !important; font-weight: 600 !important; border: 1.5px solid rgba(239,68,68,.25) !important; background: rgba(239,68,68,.06) !important; color: #DC2626 !important; cursor: pointer !important; font-family: 'Poppins',sans-serif !important; transition: all .14s !important; }

/* ── VIEW TABS — segmented control ──────────────────────────── */
#roster-admin-root .rx-view-tabs {
  display: flex !important; align-items: center !important; gap: 0 !important; margin-bottom: 8px !important;
  background: var(--rx-surface) !important; border: 1px solid var(--rx-border) !important;
  border-radius: var(--rx-radius) !important; padding: 4px !important; width: fit-content !important;
  box-shadow: var(--rx-shadow-xs) !important;
}
#roster-admin-root .rx-view-tab { display: inline-flex !important; align-items: center !important; gap: 6px !important; padding: 7px 18px !important; border-radius: 10px !important; font-size: 12.5px !important; font-weight: 500 !important; border: none !important; background: transparent !important; color: var(--rx-ink3) !important; cursor: pointer !important; transition: all .18s var(--rx-ease) !important; font-family: 'Poppins',sans-serif !important; }
#roster-admin-root .rx-view-tab:hover { color: var(--rx-ink2) !important; background: var(--rx-surface2) !important; }
#roster-admin-root .rx-view-tab.active { background: var(--rx-accent) !important; color: #fff !important; font-weight: 600 !important; box-shadow: 0 2px 8px var(--rx-accent-glow) !important; }
#roster-admin-root .rx-view-count { margin-left: auto !important; font-size: 11px !important; color: var(--rx-ink3) !important; padding-left: 12px !important; }

/* ── LEGEND ──────────────────────────────────────────────────── */
#roster-admin-root .rx-legend { display: flex !important; flex-wrap: wrap !important; gap: 4px 10px !important; padding: 5px 2px 6px !important; align-items: center !important; }
#roster-admin-root .rx-lg { display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 11px !important; color: var(--rx-ink2) !important; }
#roster-admin-root .rx-lg-code { font-weight: 800 !important; font-size: 8.5px !important; padding: 2px 7px !important; border-radius: 6px !important; letter-spacing: .02em !important; }
#roster-admin-root .rx-lg-name { font-size: 11px !important; }
#roster-admin-root .rx-lg-tip { margin-left: auto !important; font-size: 9.5px !important; color: var(--rx-ink4) !important; font-style: italic !important; }

/* ── GRID ────────────────────────────────────────────────────── */
#roster-admin-root .rx-grid-wrap {
  border-radius: var(--rx-radius) !important;
  box-shadow: 0 2px 12px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.05) !important;
  border: 1px solid var(--rx-border) !important;
  background: var(--rx-surface) !important;
  max-height: 68vh !important; overflow: auto !important;
  scroll-behavior: smooth !important;
}
#roster-admin-root .rx-grid-wrap::-webkit-scrollbar { width: 5px !important; height: 5px !important; }
#roster-admin-root .rx-grid-wrap::-webkit-scrollbar-thumb { background: #CBD5E1 !important; border-radius: 99px !important; }
#roster-admin-root .rx-grid { border-collapse: separate !important; border-spacing: 0 !important; min-width: 100% !important; width: max-content !important; }

/* Header row */
#roster-admin-root .rx-grid thead .rx-th {
  position: sticky !important; top: 0 !important; z-index: 5 !important;
  background: var(--rx-navy) !important;
  border-bottom: 2px solid rgba(255,255,255,.1) !important;
  height: 50px !important; vertical-align: middle !important; padding: 0 !important;
}
#roster-admin-root .rx-th-name {
  position: sticky !important; left: 0 !important; z-index: 7 !important;
  background: var(--rx-navy) !important; text-align: left !important; padding-left: 20px !important;
  min-width: var(--rx-agent-w) !important; width: var(--rx-agent-w) !important;
  border-right: 1px solid rgba(255,255,255,.1) !important;
  font-size: 10px !important; font-weight: 700 !important; color: rgba(255,255,255,.6) !important;
  letter-spacing: .08em !important; text-transform: uppercase !important;
}
#roster-admin-root .rx-th-day {
  min-width: var(--rx-cell-w) !important; max-width: var(--rx-cell-w) !important;
  width: var(--rx-cell-w) !important; cursor: pointer !important; text-align: center !important;
  transition: background .12s !important;
}
#roster-admin-root .rx-th-day:hover { background: rgba(255,255,255,.08) !important; }
#roster-admin-root .rx-th-day.rx-w { background: rgba(139,92,246,.15) !important; }
#roster-admin-root .rx-th-day.rx-week-end { border-left: 1px solid rgba(255,255,255,.06) !important; }
#roster-admin-root .rx-th-day.rx-t { background: rgba(249,115,22,.25) !important; }
#roster-admin-root .rx-th-day.rx-t .rx-th-dow,
#roster-admin-root .rx-th-day.rx-t .rx-th-num { color: #FFB347 !important; }
#roster-admin-root .rx-th-dow { font-size: 9px !important; font-weight: 600 !important; color: rgba(255,255,255,.45) !important; display: block !important; line-height: 1 !important; text-transform: uppercase !important; letter-spacing: .06em !important; }
#roster-admin-root .rx-th-num { font-size: 14px !important; font-weight: 800 !important; color: rgba(255,255,255,.9) !important; display: block !important; line-height: 1 !important; margin-top: 3px !important; }
#roster-admin-root .rx-th-cov { display: none !important; }
#roster-admin-root .rx-th-tot { display: none !important; }
#roster-admin-root .rx-th-att {
  position: sticky !important; right: 0 !important; z-index: 6 !important;
  background: var(--rx-navy) !important; border-left: 1px solid rgba(255,255,255,.1) !important;
  width: var(--rx-att-w) !important; min-width: var(--rx-att-w) !important;
  font-size: 9.5px !important; font-weight: 700 !important; color: rgba(255,255,255,.6) !important;
  letter-spacing: .06em !important; text-transform: uppercase !important; text-align: center !important;
}

/* Rows */
#roster-admin-root .rx-row { height: var(--rx-row-h) !important; background: var(--rx-surface) !important; transition: background .10s !important; }
#roster-admin-root .rx-row:not(:last-child) td { border-bottom: 1px solid #F1F5F9 !important; }
#roster-admin-root .rx-row:nth-child(even) { background: #FAFBFD !important; }
#roster-admin-root .rx-row:hover { background: rgba(249,115,22,.03) !important; }
#roster-admin-root .rx-row-relieved { opacity: .45 !important; }
#roster-admin-root .rx-no-rows { padding: 60px 20px !important; text-align: center !important; color: var(--rx-ink3) !important; font-size: 13px !important; }

/* Agent column */
#roster-admin-root .rx-td-name {
  position: sticky !important; left: 0 !important; z-index: 4 !important;
  background: var(--rx-surface) !important; border-right: 1px solid var(--rx-border) !important;
  padding: 0 0 0 16px !important; vertical-align: middle !important;
  min-width: var(--rx-agent-w) !important; width: var(--rx-agent-w) !important; cursor: pointer !important;
}
#roster-admin-root .rx-row:hover .rx-td-name { background: rgba(249,115,22,.03) !important; box-shadow: inset 3px 0 0 var(--rx-accent) !important; }
#roster-admin-root .rx-row:nth-child(even) .rx-td-name { background: #FAFBFD !important; }
#roster-admin-root .rx-row:nth-child(even):hover .rx-td-name { background: rgba(249,115,22,.03) !important; }
#roster-admin-root .rx-avatar { width: 36px !important; height: 36px !important; min-width: 36px !important; border-radius: 50% !important; flex-shrink: 0 !important; font-size: 12px !important; font-weight: 700 !important; color: #fff !important; display: flex !important; align-items: center !important; justify-content: center !important; box-shadow: 0 1px 4px rgba(0,0,0,.15) !important; }
#roster-admin-root .rx-name { font-size: 13px !important; font-weight: 600 !important; color: var(--rx-ink) !important; line-height: 1.2 !important; display: block !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
#roster-admin-root .rx-meta { font-size: 9.5px !important; color: var(--rx-ink3) !important; margin-top: 1px !important; display: block !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 220px !important; }

/* Date cells */
#roster-admin-root .rx-cell {
  width: var(--rx-cell-w) !important; height: var(--rx-row-h) !important;
  text-align: center !important; vertical-align: middle !important; border: none !important; font-size: 0 !important;
  cursor: pointer !important; user-select: none !important; padding: 0 !important; background: transparent !important;
  transition: none !important; position: relative !important;
}
#roster-admin-root .rx-cell::before, #roster-admin-root .rx-cell::after { display: none !important; content: none !important; }
#roster-admin-root .rx-cell.rx-w { background: rgba(139,92,246,.04) !important; }
#roster-admin-root .rx-cell.rx-t { background: rgba(249,115,22,.04) !important; }
#roster-admin-root .rx-cell.rx-week-end { border-left: 1px solid #F1F5F9 !important; }

/* Status circles — premium redesign */
#roster-admin-root .rx-day-num {
  width: 34px !important; height: 34px !important; border-radius: 50% !important;
  margin: 0 auto !important; display: flex !important; align-items: center !important; justify-content: center !important;
  font-size: 12px !important; font-weight: 700 !important;
  transition: transform .22s var(--rx-spring), box-shadow .22s var(--rx-ease) !important;
}
#roster-admin-root .rx-day-empty { background: transparent !important; color: var(--rx-ink4) !important; font-weight: 400 !important; font-size: 12px !important; }
#roster-admin-root .rx-cell.rx-w .rx-day-empty { color: #D8D8E5 !important; }
#roster-admin-root .rx-cell.rx-t .rx-day-empty {
  color: var(--rx-accent) !important; font-weight: 800 !important;
  box-shadow: 0 0 0 2px var(--rx-accent) !important;
  background: rgba(249,115,22,.08) !important; border-radius: 50% !important;
}
#roster-admin-root .rx-cell.rx-t .rx-day-num:not(.rx-day-empty) { box-shadow: 0 0 0 2.5px var(--rx-accent), 0 0 0 5px var(--rx-accent-glow) !important; }
#roster-admin-root .rx-cell:hover .rx-day-num { transform: scale(1.2) !important; z-index: 3 !important; }

/* Status colors — vivid & distinct */
#roster-admin-root .rx-st-present .rx-day-num  { background: linear-gradient(135deg,#059669,#10B981) !important; color: #fff !important; box-shadow: 0 3px 8px rgba(5,150,105,.35) !important; }
#roster-admin-root .rx-st-wfh     .rx-day-num  { background: linear-gradient(135deg,#7C3AED,#8B5CF6) !important; color: #fff !important; box-shadow: 0 3px 8px rgba(124,58,237,.35) !important; }
#roster-admin-root .rx-st-on_duty .rx-day-num  { background: linear-gradient(135deg,#F97316,#FB923C) !important; color: #fff !important; box-shadow: 0 3px 8px rgba(249,115,22,.35) !important; }
#roster-admin-root .rx-st-off     .rx-day-num  { background: linear-gradient(135deg,#475569,#64748B) !important; color: #fff !important; }
#roster-admin-root .rx-st-holiday .rx-day-num  { background: linear-gradient(135deg,#0891B2,#06B6D4) !important; color: #fff !important; }
#roster-admin-root .rx-st-pl      .rx-day-num  { background: linear-gradient(135deg,#2563EB,#3B82F6) !important; color: #fff !important; }
#roster-admin-root .rx-st-hd_pl   .rx-day-num  { background: #BFDBFE !important; color: #1E40AF !important; }
#roster-admin-root .rx-st-upl     .rx-day-num  { background: linear-gradient(135deg,#6B7280,#9CA3AF) !important; color: #fff !important; }
#roster-admin-root .rx-st-hd_upl  .rx-day-num  { background: #E5E7EB !important; color: #374151 !important; }
#roster-admin-root .rx-st-sl      .rx-day-num  { background: linear-gradient(135deg,#DC2626,#EF4444) !important; color: #fff !important; box-shadow: 0 3px 8px rgba(220,38,38,.35) !important; }
#roster-admin-root .rx-st-hd_sl   .rx-day-num  { background: #FCA5A5 !important; color: #7F1D1D !important; }
#roster-admin-root .rx-st-ncns    .rx-day-num  { background: linear-gradient(135deg,#7F1D1D,#991B1B) !important; color: #fff !important; box-shadow: 0 0 0 3px rgba(153,27,27,.25), 0 3px 10px rgba(153,27,27,.45) !important; }
#roster-admin-root .rx-st-absent  .rx-day-num  { background: linear-gradient(135deg,#1E293B,#334155) !important; color: #fff !important; }

/* ATT% */
#roster-admin-root .rx-td-tot { display: none !important; }
#roster-admin-root .rx-td-att {
  position: sticky !important; right: 0 !important; z-index: 2 !important;
  background: var(--rx-surface) !important; border-left: 1px solid var(--rx-border) !important;
  padding: 0 12px !important; width: var(--rx-att-w) !important; min-width: var(--rx-att-w) !important; vertical-align: middle !important;
}
#roster-admin-root .rx-row:nth-child(even) .rx-td-att { background: #FAFBFD !important; }
#roster-admin-root .rx-row:hover .rx-td-att { background: rgba(249,115,22,.03) !important; }
#roster-admin-root .rx-td-att-inner { display: flex !important; flex-direction: column !important; width: 100% !important; }
#roster-admin-root .rx-att-pct { display: block !important; font-size: 13px !important; font-weight: 700 !important; text-align: right !important; margin-bottom: 4px !important; font-variant-numeric: tabular-nums !important; }
#roster-admin-root .rx-att-bar { height: 5px !important; border-radius: 99px !important; background: var(--rx-border2) !important; overflow: hidden !important; width: 100% !important; }
#roster-admin-root .rx-att-bar i { display: block !important; height: 100% !important; border-radius: 99px !important; transition: width .4s var(--rx-ease) !important; }
#roster-admin-root .rx-att-good .rx-att-pct { color: #059669 !important; }
#roster-admin-root .rx-att-good .rx-att-bar i { background: linear-gradient(90deg,#059669,#34D399) !important; }
#roster-admin-root .rx-att-mid .rx-att-pct { color: #D97706 !important; }
#roster-admin-root .rx-att-mid .rx-att-bar i { background: linear-gradient(90deg,#D97706,#FCD34D) !important; }
#roster-admin-root .rx-att-low .rx-att-pct { color: #DC2626 !important; }
#roster-admin-root .rx-att-low .rx-att-bar i { background: linear-gradient(90deg,#DC2626,#FCA5A5) !important; }

/* Bulk bar */
#roster-admin-root .rx-bulk-bar { background: var(--rx-navy) !important; border-radius: var(--rx-radius) !important; padding: 8px 14px !important; box-shadow: 0 16px 48px rgba(15,23,42,.25) !important; align-items: center !important; gap: 10px !important; flex-wrap: nowrap !important; min-height: 48px !important; border: none !important; }
#roster-admin-root .rx-bulk-bar[style*="display: flex"],#roster-admin-root .rx-bulk-bar[style*="display:flex"] { display: flex !important; }
#roster-admin-root .rx-bulk-count { color: #fff !important; font-size: 11.5px !important; font-weight: 700 !important; white-space: nowrap !important; background: rgba(255,255,255,.12) !important; padding: 4px 12px !important; border-radius: 99px !important; border: 1px solid rgba(255,255,255,.15) !important; }
#roster-admin-root .rx-bulk-sel,#roster-admin-root .rx-bulk-date { height: 30px !important; font-size: 11.5px !important; padding: 0 10px !important; border-radius: 8px !important; border: 1px solid rgba(255,255,255,.20) !important; background: rgba(255,255,255,.08) !important; color: #fff !important; font-family: 'Poppins',sans-serif !important; }
#roster-admin-root .rx-bulk-date { max-width: 140px !important; }
#roster-admin-root .rx-bulk-btn { height: 30px !important; padding: 0 14px !important; border-radius: 8px !important; border: 1px solid rgba(255,255,255,.20) !important; background: rgba(255,255,255,.10) !important; color: #fff !important; font-size: 11.5px !important; font-weight: 600 !important; cursor: pointer !important; font-family: 'Poppins',sans-serif !important; white-space: nowrap !important; transition: all .14s !important; }
#roster-admin-root .rx-bulk-btn:hover { background: rgba(255,255,255,.20) !important; }
#roster-admin-root .rx-bulk-btn-primary { background: var(--rx-accent) !important; border-color: var(--rx-accent) !important; }
#roster-admin-root .rx-bulk-btn-danger { background: rgba(220,38,38,.25) !important; border-color: rgba(220,38,38,.45) !important; }
#roster-admin-root .rx-bulk-sep { width: 1px !important; height: 20px !important; background: rgba(255,255,255,.18) !important; flex-shrink: 0 !important; }

/* Quick-pick popup */
#roster-admin-root .rx-qp { background: var(--rx-surface) !important; border: 1px solid var(--rx-border) !important; border-radius: 18px !important; box-shadow: 0 20px 60px rgba(15,23,42,.18),0 4px 12px rgba(15,23,42,.08) !important; animation: rx-qp-enter .18s var(--rx-spring) both !important; min-width: 340px !important; padding: 0 !important; flex-direction: column !important; align-items: stretch !important; }
@keyframes rx-qp-enter { from { opacity:0; transform: scale(.88) translateY(-8px); } to { opacity:1; transform: scale(1) translateY(0); } }
#roster-admin-root .rx-qp-header { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 11px 14px 9px !important; border-bottom: 1px solid var(--rx-border2) !important; background: var(--rx-surface2) !important; border-radius: 18px 18px 0 0 !important; }
#roster-admin-root .rx-qp-title { font-size: 10px !important; font-weight: 800 !important; color: var(--rx-ink2) !important; text-transform: uppercase !important; letter-spacing: .10em !important; }
#roster-admin-root .rx-qp-body { display: flex !important; flex-direction: row !important; padding: 12px !important; gap: 0 !important; }
#roster-admin-root .rx-qp-group { display: flex !important; flex-direction: column !important; gap: 6px !important; }
#roster-admin-root .rx-qp-glabel { font-size: 8.5px !important; font-weight: 800 !important; color: var(--rx-ink3) !important; text-transform: uppercase !important; letter-spacing: .10em !important; padding: 0 2px 3px !important; }
#roster-admin-root .rx-qp-grow { display: flex !important; flex-wrap: wrap !important; gap: 5px !important; }
#roster-admin-root .rx-qp-vsep { width: 1px !important; background: var(--rx-border2) !important; align-self: stretch !important; margin: 0 10px !important; }
#roster-admin-root .rx-qp-btn { display: flex !important; flex-direction: column !important; align-items: center !important; gap: 3px !important; padding: 8px 9px !important; border-radius: 11px !important; border: 1.5px solid var(--rx-border2) !important; background: var(--rx-surface2) !important; cursor: pointer !important; min-width: 48px !important; font-family: 'Poppins',sans-serif !important; transition: all .16s var(--rx-spring) !important; }
#roster-admin-root .rx-qp-btn:hover { transform: translateY(-3px) scale(1.06) !important; box-shadow: 0 6px 16px rgba(0,0,0,.1) !important; border-color: transparent !important; }
#roster-admin-root .rx-qp-code { font-weight: 800 !important; font-size: 9.5px !important; padding: 2px 6px !important; border-radius: 6px !important; display: block !important; }
#roster-admin-root .rx-qp-lbl { font-size: 7.5px !important; color: var(--rx-ink2) !important; white-space: nowrap !important; text-align: center !important; font-weight: 500 !important; }
#roster-admin-root .rx-qp-clear { display: flex !important; align-items: center !important; justify-content: center !important; width: 28px !important; height: 28px !important; border-radius: 8px !important; border: 1.5px solid rgba(220,38,38,.30) !important; background: rgba(220,38,38,.06) !important; cursor: pointer !important; color: #DC2626 !important; transition: all .14s !important; font-size: 14px !important; }
#roster-admin-root .rx-qp-clear:hover { background: rgba(220,38,38,.12) !important; border-color: #DC2626 !important; }


/* ── CRITICAL: Name row layout (flex horizontal) ────────── */
#roster-admin-root .rx-name-row {
  display: flex !important; align-items: center !important; gap: 10px !important;
  padding-right: 8px !important;
}
#roster-admin-root .rx-name-info { flex: 1 !important; min-width: 0 !important; }
#roster-admin-root .rx-avatar {
  width: 30px !important; height: 30px !important; min-width: 30px !important;
  border-radius: 50% !important; flex-shrink: 0 !important;
  font-size: 11px !important; font-weight: 700 !important; color: #fff !important;
  display: flex !important; align-items: center !important; justify-content: center !important;
  box-shadow: 0 1px 4px rgba(0,0,0,.2) !important;
}
#roster-admin-root .rx-row-chk { flex-shrink: 0 !important; }

/* ── Row height — compact ────────────────────────────────── */
#roster-admin-root { --rx-row-h: 46px !important; }

/* ── TD-name must be flex to center content ─────────────── */
#roster-admin-root .rx-td-name {
  position: sticky !important; left: 0 !important; z-index: 4 !important;
  background: var(--rx-surface) !important; border-right: 1px solid var(--rx-border) !important;
  padding: 0 0 0 12px !important; vertical-align: middle !important;
  min-width: var(--rx-agent-w) !important; width: var(--rx-agent-w) !important;
  cursor: pointer !important;
}

/* ── Name & meta compact styling ────────────────────────── */
#roster-admin-root .rx-name {
  font-size: 12.5px !important; font-weight: 600 !important; color: var(--rx-ink) !important;
  line-height: 1.2 !important; display: block !important;
  white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
  max-width: 185px !important;
}
#roster-admin-root .rx-meta {
  font-size: 9.5px !important; color: var(--rx-ink3) !important; margin-top: 1px !important;
  display: block !important; white-space: nowrap !important; overflow: hidden !important;
  text-overflow: ellipsis !important; max-width: 185px !important;
}
#roster-admin-root .rx-meta em { font-style: normal !important; color: var(--rx-ink2) !important; }

/* ── Today column — stronger visual ─────────────────────── */
#roster-admin-root .rx-cell.rx-t {
  background: rgba(249,115,22,.05) !important;
}
#roster-admin-root .rx-th-day.rx-t {
  background: rgba(249,115,22,.25) !important;
}

/* ── Weekend columns — subtle lavender ───────────────────── */
#roster-admin-root .rx-cell.rx-w { background: rgba(139,92,246,.04) !important; }
#roster-admin-root .rx-th-day.rx-w { background: rgba(139,92,246,.18) !important; }

/* ── Empty date cell numbers ─────────────────────────────── */
#roster-admin-root .rx-day-empty {
  background: transparent !important; color: #D1D5DB !important;
  font-weight: 400 !important; font-size: 12px !important;
}
#roster-admin-root .rx-cell.rx-w .rx-day-empty { color: #C4B5FD !important; opacity: .5 !important; }

/* ── Row hover with left stripe ──────────────────────────── */
#roster-admin-root .rx-row:hover .rx-td-name {
  background: rgba(249,115,22,.04) !important;
  box-shadow: inset 3px 0 0 var(--rx-accent) !important;
}
#roster-admin-root .rx-row:nth-child(even) .rx-td-name { background: #FAFBFD !important; }
#roster-admin-root .rx-row:nth-child(even):hover .rx-td-name { background: rgba(249,115,22,.04) !important; box-shadow: inset 3px 0 0 var(--rx-accent) !important; }

/* ── ATT% sticky column ──────────────────────────────────── */
#roster-admin-root .rx-td-att {
  position: sticky !important; right: 0 !important; z-index: 2 !important;
  background: var(--rx-surface) !important; border-left: 1px solid var(--rx-border) !important;
  padding: 0 12px !important; width: var(--rx-att-w) !important; min-width: var(--rx-att-w) !important;
  vertical-align: middle !important;
}
#roster-admin-root .rx-row:nth-child(even) .rx-td-att { background: #FAFBFD !important; }

/* ── Status dot indicators ───────────────────────────────── */
#roster-admin-root .rx-name-dot { display: inline-block !important; width: 6px !important; height: 6px !important; border-radius: 50% !important; margin-right: 4px !important; vertical-align: middle !important; }
#roster-admin-root .rx-dot-leave { background: #3B82F6 !important; }
#roster-admin-root .rx-dot-rel { background: #94A3B8 !important; }

/* Animations */
@keyframes rx-fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
#roster-admin-root .rx-kpis { animation: rx-fade-in .28s ease both !important; }
#roster-admin-root .rx-toolbar { animation: rx-fade-in .30s ease .03s both !important; }
#roster-admin-root .rx-filter-bar { animation: rx-fade-in .30s ease .06s both !important; }
#roster-admin-root .rx-view-tabs { animation: rx-fade-in .30s ease .09s both !important; }
#roster-admin-root .rx-legend { animation: rx-fade-in .30s ease .12s both !important; }
#roster-admin-root .rx-grid-wrap { animation: rx-fade-in .34s ease .15s both !important; }
`;
    document.head.appendChild(s);
  })();

  /* ══════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════ */
  const STATUS_LABEL = {
    '': '—', present: 'P', off: 'OFF', pl: 'PL', hd_pl: '½PL',
    upl: 'UPL', hd_upl: '½UPL', sl: 'SL', hd_sl: '½SL',
    wfh: 'WFH', on_duty: 'OD', holiday: 'HOL',
    ncns: 'NCNS', relieved: 'REL', absent: 'A', na: 'N/A',
  };
  const STATUS_LONG = {
    present: 'Present', off: 'Weekly Off', pl: 'Paid Leave',
    hd_pl: 'Half-Day PL', upl: 'Unpaid Leave', hd_upl: 'Half-Day UPL',
    sl: 'Sick Leave', hd_sl: 'Half-Day SL', wfh: 'Work From Home',
    on_duty: 'On Duty', holiday: 'Holiday', ncns: 'No Call No Show',
    relieved: 'Relieved', absent: 'Absent', na: 'N/A',
  };

  // Palette groups for the right-click popover
  const PALETTE_GROUPS = [
    { label: 'Productive', statuses: ['present', 'wfh', 'on_duty'] },
    { label: 'Off / Holiday', statuses: ['off', 'holiday'] },
    { label: 'Paid Leave', statuses: ['pl', 'hd_pl'] },
    { label: 'Unpaid Leave', statuses: ['upl', 'hd_upl'] },
    { label: 'Sick Leave', statuses: ['sl', 'hd_sl'] },
    { label: 'Issues', statuses: ['ncns', 'absent'] },
  ];

  // Quick-pick statuses (left-click on cell) — ordered by frequency
  const QUICK_PICK = [
    { s: 'present',    label: 'P',    name: 'Present',       group: 'work' },
    { s: 'wfh',        label: 'WFH',  name: 'Work From Home', group: 'work' },
    { s: 'on_duty',    label: 'OD',   name: 'On Duty',       group: 'work' },
    { s: 'off',        label: 'OFF',  name: 'Week Off',      group: 'off'  },
    { s: 'holiday',    label: 'HOL',  name: 'Holiday',       group: 'off'  },
    { s: 'pl',         label: 'PL',   name: 'Paid Leave',    group: 'leave'},
    { s: 'hd_pl',      label: '½PL',  name: 'Half-Day PL',   group: 'leave'},
    { s: 'sl',         label: 'SL',   name: 'Sick Leave',    group: 'leave'},
    { s: 'hd_sl',      label: '½SL',  name: 'Half-Day SL',   group: 'leave'},
    { s: 'upl',        label: 'UPL',  name: 'Unpaid Leave',  group: 'leave'},
    { s: 'hd_upl',     label: '½UPL', name: 'Half-Day UPL',  group: 'leave'},
    { s: 'absent',     label: 'A',    name: 'Absent',        group: 'issue'},
    { s: 'ncns',       label: 'NCNS', name: 'No Call No Show', group: 'issue'},
  ];

  // Predefined shift options (all IST, 9 hours each)
  const SHIFT_OPTIONS = [
    { group: 'IST Morning (CST Overnight)', shifts: [
      '6:30 AM - 3:30 PM',
      '7:30 AM - 4:30 PM',
      '8:30 AM - 5:30 PM',
      '9:30 AM - 6:30 PM',
    ]},
    { group: 'IST Evening (CST Business Day)', shifts: [
      '5:30 PM - 2:30 AM',
      '6:30 PM - 3:30 AM',
      '7:30 PM - 4:30 AM',
      '8:30 PM - 5:30 AM',
      '9:30 PM - 6:30 AM',
    ]},
  ];

  /* ══════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════ */
  const _s = {
    month: null,
    data: null,
    showRelieved: false,
    groupByShift: false,
    agentSearch: '',
    designationFilter: '',
    statusFilter: '',
    view: 'calendar',   // 'calendar' | 'agents'
    agentListSearch: '',
    pendingSaves: new Map(),
    saveTimer: null,
  };

  /* ══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nowMonthIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = yyyymm => {
    const [y, m] = yyyymm.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };
  const dowChar = date => 'SMTWTFS'[new Date(date + 'T00:00:00').getDay()];
  const isWeekend = date => { const d = new Date(date + 'T00:00:00').getDay(); return d === 0 || d === 6; };
  const isSunday = date => new Date(date + 'T00:00:00').getDay() === 0;

  /* ══════════════════════════════════════════════════════════
     API
  ══════════════════════════════════════════════════════════ */
  async function loadMonth(yyyymm) {
    _s.month = yyyymm;
    const r = await fetch(`/api/roster/month/${yyyymm}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _s.data = await r.json();
  }

  async function postReseed() {
    const r = await fetch('/api/admin/roster/reseed', { method: 'POST', credentials: 'include' });
    return r.json();
  }

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT
  ══════════════════════════════════════════════════════════ */
  window.openRosterAdmin = async function () {
    const root = $('#roster-admin-root');
    if (!root) return;
    root.innerHTML = '<div class="rx-loading"><div class="rx-spinner"></div>Loading roster…</div>';
    try {
      await loadMonth(_s.month || nowMonthIso());
      render();
    } catch (e) {
      root.innerHTML = `<div class="rx-error">❌ Failed to load: ${esc(e.message)}</div>`;
    }
  };

  /* ══════════════════════════════════════════════════════════
     COMPUTE STATS
  ══════════════════════════════════════════════════════════ */
  function agentStats(empId, dates, grid) {
    const row = grid[empId] || {};
    let p = 0, wfh = 0, od = 0, off = 0, pl = 0, upl = 0, sl = 0, ncns = 0, filled = 0;
    for (const d of dates) {
      const s = row[d]?.status || '';
      if (s === 'present') { p++; filled++; }
      else if (s === 'wfh') { wfh++; filled++; }
      else if (s === 'on_duty') { od++; filled++; }
      else if (s === 'off') { off++; filled++; }
      else if (s === 'pl' || s === 'hd_pl') { pl += (s === 'hd_pl' ? 0.5 : 1); filled++; }
      else if (s === 'upl' || s === 'hd_upl') { upl += (s === 'hd_upl' ? 0.5 : 1); filled++; }
      else if (s === 'sl' || s === 'hd_sl') { sl += (s === 'hd_sl' ? 0.5 : 1); filled++; }
      else if (s === 'ncns' || s === 'absent') { ncns++; filled++; }
      // holiday, relieved, na, empty: don't count toward att%
    }
    const productive = p + wfh + od;
    const pct = filled > 0 ? Math.round((productive / filled) * 100) : null;
    return { p, wfh, od, off, pl: Math.round(pl * 10) / 10, upl: Math.round(upl * 10) / 10, sl: Math.round(sl * 10) / 10, ncns, pct };
  }

  function dayCoverage(dates, agents, grid) {
    // Returns { date: { present, leave, off, ncns, total } }
    const out = {};
    for (const d of dates) {
      let present = 0, leave = 0, off = 0, ncns = 0, total = 0;
      for (const a of agents) {
        if (a.status === 'relieved') continue;
        const s = (grid[a.emp_id] || {})[d]?.status || '';
        if (!s || s === 'na') continue;
        total++;
        if (s === 'present' || s === 'wfh' || s === 'on_duty') present++;
        else if (s === 'pl' || s === 'hd_pl' || s === 'upl' || s === 'hd_upl' || s === 'sl' || s === 'hd_sl') leave++;
        else if (s === 'off' || s === 'holiday') off++;
        else if (s === 'ncns' || s === 'absent') ncns++;
      }
      out[d] = { present, leave, off, ncns, total };
    }
    return out;
  }

  function coverageClass(pct) {
    if (pct === null) return 'rx-cov-none';
    if (pct >= 70) return 'rx-cov-good';
    if (pct >= 40) return 'rx-cov-mid';
    return 'rx-cov-low';
  }

  /* ══════════════════════════════════════════════════════════
     MAIN RENDER
  ══════════════════════════════════════════════════════════ */
  function render() {
    const root = $('#roster-admin-root');
    if (!_s.data) return;
    const { dates, agents, grid } = _s.data;
    if (!agents || agents.length === 0) { renderEmpty(root); return; }

    const today = todayIso();
    const todayInMonth = today.startsWith(_s.month);
    const search = _s.agentSearch.toLowerCase();

    let visible = agents.filter(a => _s.showRelieved || a.status !== 'relieved');
    if (search) {
      visible = visible.filter(a =>
        (a.pseudo || '').toLowerCase().includes(search) ||
        (a.full_name || '').toLowerCase().includes(search) ||
        (a.emp_id || '').toLowerCase().includes(search) ||
        (a.designation || '').toLowerCase().includes(search)
      );
    }
    // Designation filter
    if (_s.designationFilter) {
      visible = visible.filter(a => {
        const d = (a.designation || '').toLowerCase();
        return d.includes(_s.designationFilter.toLowerCase());
      });
    }
    // Today status filter
    if (_s.statusFilter && todayInMonth) {
      visible = visible.filter(a => {
        const s = (grid[a.emp_id] || {})[today]?.status || 'empty';
        if (_s.statusFilter === 'present') return ['present','wfh','on_duty'].includes(s);
        if (_s.statusFilter === 'leave')   return ['pl','hd_pl','upl','hd_upl','sl','hd_sl','holiday'].includes(s);
        if (_s.statusFilter === 'absent')  return ['ncns','absent'].includes(s);
        if (_s.statusFilter === 'off')     return s === 'off';
        if (_s.statusFilter === 'empty')   return !s || s === '';
        return s === _s.statusFilter;
      });
    }

    const relievedCount = agents.filter(a => a.status === 'relieved').length;
    const activeAgents = agents.filter(a => a.status !== 'relieved');
    // Collect unique designations for filter
    const designations = [...new Set(agents
      .map(a => (a.designation || '').replace('Technical Support Representative','TSR').replace('Technical Support Specialist','TS Specialist').trim())
      .filter(Boolean))].sort();

    // KPI for today
    let presentToday = 0, leaveToday = 0, ncnsToday = 0;
    if (todayInMonth) {
      for (const a of activeAgents) {
        const s = (grid[a.emp_id] || {})[today]?.status || '';
        if (s === 'present' || s === 'wfh' || s === 'on_duty') presentToday++;
        else if (['pl', 'hd_pl', 'upl', 'hd_upl', 'sl', 'hd_sl'].includes(s)) leaveToday++;
        else if (s === 'ncns' || s === 'absent') ncnsToday++;
      }
    }
    const coveragePct = activeAgents.length
      ? Math.round((presentToday / activeAgents.length) * 100) : 0;

    // Day coverage heatmap
    const dayCov = dayCoverage(dates, agents, grid);

    // Shift groups (optional)
    const SHIFT_ORDER = [];
    if (_s.groupByShift) {
      const shiftMap = {};
      for (const a of visible) {
        const s = a.shift || 'Other';
        if (!shiftMap[s]) { shiftMap[s] = []; SHIFT_ORDER.push(s); }
        shiftMap[s].push(a);
      }
      // dedupe
      const seen = new Set();
      for (let i = SHIFT_ORDER.length - 1; i >= 0; i--) {
        if (seen.has(SHIFT_ORDER[i])) SHIFT_ORDER.splice(i, 1);
        else seen.add(SHIFT_ORDER[i]);
      }
    }

    // Build grid rows HTML
    let gridRowsHtml = '';
    if (visible.length === 0) {
      gridRowsHtml = `<tr><td colspan="${dates.length + 9}" class="rx-no-rows">No agents match your search.</td></tr>`;
    } else if (_s.groupByShift && SHIFT_ORDER.length > 0) {
      const shiftMap = {};
      for (const a of visible) { const k = a.shift || 'Other'; if (!shiftMap[k]) shiftMap[k] = []; shiftMap[k].push(a); }
      for (const shift of SHIFT_ORDER) {
        const grpAgents = shiftMap[shift] || [];
        if (!grpAgents.length) continue;
        gridRowsHtml += `<tr class="rx-shift-row"><td class="rx-shift-header" colspan="${dates.length + 9}">
          <span class="rx-shift-dot"></span> ${esc(shift)}<span class="rx-shift-count">${grpAgents.length} agents</span></td></tr>`;
        for (const a of grpAgents) gridRowsHtml += renderAgentRow(a, dates, grid, today, dayCov);
      }
    } else {
      for (const a of visible) gridRowsHtml += renderAgentRow(a, dates, grid, today, dayCov);
    }

    // Coverage summary row
    let covRowHtml = `<tr class="rx-cov-row">
      <td class="rx-td-name rx-cov-label">
        <div class="rx-name-row">
          <div class="rx-avatar" style="background:#1A4F6E;font-size:9px;">📊</div>
          <div class="rx-name-info">
            <div class="rx-name" style="font-size:11px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Coverage</div>
            <div class="rx-meta" style="color:rgba(255,255,255,.4)">P · WFH · OD per day</div>
          </div>
        </div>
      </td>`;
    for (const d of dates) {
      const c = dayCov[d] || {};
      const pct = c.total > 0 ? Math.round((c.present / c.total) * 100) : null;
      const cls = coverageClass(pct);
      const isW = isWeekend(d);
      const isT = d === today;
      const isWeekEnd = isSunday(d);
      covRowHtml += `<td class="rx-cov-cell ${cls} ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        title="${d}: ${c.present ?? 0} present / ${c.total ?? 0} total${pct !== null ? ' (' + pct + '%)' : ''}">
        <span class="rx-cov-num">${c.present ?? ''}</span>
        ${pct !== null ? `<span class="rx-cov-pct">${pct}%</span>` : ''}
      </td>`;
    }
    covRowHtml += `<td class="rx-cov-cell rx-cov-none"><span class="rx-cov-num"></span></td></tr>`;

    // Date headers
    const dateHeadersHtml = dates.map((d, idx) => {
      const c = dayCov[d] || {};
      const pct = c.total > 0 ? Math.round((c.present / c.total) * 100) : null;
      const cls = coverageClass(pct);
      const isW = isWeekend(d);
      const isT = d === today;
      const isWeekEnd = isSunday(d);
      return `<th class="rx-th rx-th-day ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        data-col-date="${d}"
        title="Click to fill all empty in column · ${d}: ${c.present ?? 0}/${c.total ?? 0} present${pct !== null ? ' (' + pct + '%)' : ''}">
        <div class="rx-th-dow">${dowChar(d)}</div>
        <div class="rx-th-num">${d.slice(-2)}</div>
        ${pct !== null ? `<div class="rx-th-cov ${cls}"></div>` : '<div class="rx-th-cov"></div>'}
      </th>`;
    }).join('');

    root.innerHTML = `
<div class="rx-wrap">

  <!-- KPI STRIP -->
  <div class="rx-kpis">
    <div class="rx-kpi">
      <div class="rx-kpi-icon"><svg viewBox="0 0 20 20" fill="none" stroke="#F4891F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><circle cx="8" cy="6" r="3"/><path d="M2 18c0-3.31 2.69-5 6-5s6 1.69 6 5"/><circle cx="15" cy="7" r="2.5"/><path d="M18 18c0-2.76-1.5-4-3.5-4.5"/></svg></div>
      <div class="rx-kpi-text">
        <div class="rx-kpi-lbl">Active Agents</div>
        <div class="rx-kpi-val">${activeAgents.length}</div>
        <div class="rx-kpi-sub">${relievedCount} relieved · ${agents.length} total</div>
      </div>
    </div>
    <div class="rx-kpi rx-kpi-green">
      <div class="rx-kpi-icon"><svg viewBox="0 0 20 20" fill="none" stroke="#2DDC96" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><circle cx="10" cy="10" r="8"/><path d="M6.5 10.5l2.5 2.5 5-5"/></svg></div>
      <div class="rx-kpi-text">
        <div class="rx-kpi-lbl">Present Today</div>
        <div class="rx-kpi-val">${todayInMonth ? presentToday : '—'}</div>
        <div class="rx-kpi-sub">${todayInMonth ? 'P · WFH · OD' : 'viewing past month'}</div>
      </div>
    </div>
    <div class="rx-kpi rx-kpi-amber">
      <div class="rx-kpi-icon"><svg viewBox="0 0 20 20" fill="none" stroke="#FBC84B" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><circle cx="10" cy="7" r="3"/><path d="M4 17s1-6 6-6 6 6 6 6"/><path d="M2 17h16"/></svg></div>
      <div class="rx-kpi-text">
        <div class="rx-kpi-lbl">On Leave Today</div>
        <div class="rx-kpi-val">${todayInMonth ? leaveToday : '—'}</div>
        <div class="rx-kpi-sub">${todayInMonth ? 'PL · UPL · SL' : ''}</div>
      </div>
    </div>
    <div class="rx-kpi rx-kpi-red">
      <div class="rx-kpi-icon"><svg viewBox="0 0 20 20" fill="none" stroke="#ED666B" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M10 2l8 14H2L10 2z"/><path d="M10 9v4"/><circle cx="10" cy="15" r=".5" fill="#ED666B"/></svg></div>
      <div class="rx-kpi-text">
        <div class="rx-kpi-lbl">Issues Today</div>
        <div class="rx-kpi-val">${todayInMonth ? ncnsToday : '—'}</div>
        <div class="rx-kpi-sub">${todayInMonth ? 'NCNS · Absent' : ''}</div>
      </div>
    </div>
    <div class="rx-kpi rx-kpi-teal">
      <div class="rx-kpi-icon"><svg viewBox="0 0 20 20" fill="none" stroke="#21AAE0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><rect x="2" y="13" width="4" height="5" rx="1"/><rect x="8" y="8" width="4" height="10" rx="1"/><rect x="14" y="3" width="4" height="15" rx="1"/></svg></div>
      <div class="rx-kpi-text">
        <div class="rx-kpi-lbl">Coverage Today</div>
        <div class="rx-kpi-val">${todayInMonth ? coveragePct + '%' : '—'}</div>
        <div class="rx-kpi-sub">${todayInMonth ? `${presentToday} of ${activeAgents.length} live` : ''}</div>
        ${todayInMonth ? `<div class="rx-kpi-bar"><div class="rx-kpi-bar-fill ${coverageClass(coveragePct)}" style="width:${coveragePct}%"></div></div>` : ''}
      </div>
    </div>
  </div>

  <!-- TOOLBAR ROW 1: Navigation + Search + Actions -->
  <div class="rx-toolbar">
    <div class="rx-tb-group">
      <button class="rx-icon-btn" id="rx-prev" title="Previous month">&#8249;</button>
      <div class="rx-month-display" title="Click to pick month">
        <input type="month" id="rx-month-input" value="${_s.month}">
        <span>${monthLabel(_s.month)}</span>
      </div>
      <button class="rx-icon-btn" id="rx-next" title="Next month">&#8250;</button>
      <button class="rx-pill" id="rx-today-btn">Today</button>
    </div>

    <div class="rx-search rx-tb-grow">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="rx-search-ico"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
      <input type="text" id="rx-search" placeholder="Search by name, ID, shift…" value="${esc(_s.agentSearch)}">
    </div>

    <div class="rx-tb-group">
      <label class="rx-switch" title="Group rows by shift schedule">
        <input type="checkbox" id="rx-group-shift" ${_s.groupByShift ? 'checked' : ''}> Group shifts
      </label>
      <label class="rx-switch" title="Show relieved agents">
        <input type="checkbox" id="rx-show-relieved" ${_s.showRelieved ? 'checked' : ''}> Relieved (${relievedCount})
      </label>
      <button class="rx-pill" id="rx-audit" title="View recent changes"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;display:inline;vertical-align:-1px"><path d="M4 4h8M4 7h6M4 10h4"/><rect x="2" y="1" width="12" height="14" rx="2"/></svg> Audit</button>
      <button class="rx-pill" id="rx-add" title="Add new agent"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="width:13px;height:13px;display:inline;vertical-align:-1px"><path d="M8 3v10M3 8h10"/></svg> Agent</button>
      <button class="rx-pill rx-pill-primary" id="rx-export" title="Download CSV"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;display:inline;vertical-align:-1px"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/></svg> Export</button>
    </div>
  </div>

  <!-- FILTER BAR ROW 2: Designation + Status filters -->
  <div class="rx-filter-bar" id="rx-filter-bar">
    <!-- Designation filter -->
    <div class="rx-filter-group">
      <span class="rx-filter-label">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="width:11px;height:11px"><circle cx="6" cy="5" r="2.5"/><path d="M1 12c0-2.76 2.24-4 5-4s5 1.24 5 4"/></svg>
        Role
      </span>
      <button class="rx-filter-chip ${!_s.designationFilter ? 'active' : ''}" data-desg="">All</button>
      ${designations.map(d => `<button class="rx-filter-chip ${_s.designationFilter === d ? 'active' : ''}" data-desg="${esc(d)}">${esc(d)}</button>`).join('')}
    </div>
    <div class="rx-filter-sep"></div>
    <!-- Today status filter -->
    <div class="rx-filter-group">
      <span class="rx-filter-label">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="width:11px;height:11px"><rect x="1" y="2" width="12" height="11" rx="1.5"/><path d="M1 6h12M4 1v2M10 1v2"/></svg>
        Today
      </span>
      <button class="rx-filter-chip ${!_s.statusFilter ? 'active' : ''}" data-sf="">All</button>
      <button class="rx-filter-chip rx-sf-present ${_s.statusFilter==='present'?'active':''}" data-sf="present">
        <span class="rx-fc-dot" style="background:#2DDC96"></span>Present
      </button>
      <button class="rx-filter-chip rx-sf-leave ${_s.statusFilter==='leave'?'active':''}" data-sf="leave">
        <span class="rx-fc-dot" style="background:#21AAE0"></span>On Leave
      </button>
      <button class="rx-filter-chip rx-sf-off ${_s.statusFilter==='off'?'active':''}" data-sf="off">
        <span class="rx-fc-dot" style="background:#9BAFC0"></span>Day Off
      </button>
      <button class="rx-filter-chip rx-sf-absent ${_s.statusFilter==='absent'?'active':''}" data-sf="absent">
        <span class="rx-fc-dot" style="background:#ED666B"></span>Absent
      </button>
      <button class="rx-filter-chip rx-sf-empty ${_s.statusFilter==='empty'?'active':''}" data-sf="empty">
        <span class="rx-fc-dot" style="background:#E2E8F0"></span>No Entry
      </button>
    </div>
    ${(_s.designationFilter || _s.statusFilter) ? `
    <button class="rx-filter-clear" id="rx-filter-clear">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:10px;height:10px"><path d="M2 2l8 8M10 2L2 10"/></svg>
      Clear filters
    </button>` : ''}
  </div>

  <!-- VIEW TABS -->
  <div class="rx-view-tabs">
    <button class="rx-view-tab ${_s.view==='calendar'?'active':''}" id="rx-view-cal">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="width:13px;height:13px"><rect x="1" y="2" width="14" height="13" rx="1.5"/><path d="M1 6h14M5 1v2M11 1v2"/></svg>
      Calendar
    </button>
    <button class="rx-view-tab ${_s.view==='agents'?'active':''}" id="rx-view-agents">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="width:13px;height:13px"><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-2.76 2.24-4 5-4s5 1.24 5 4"/><path d="M11 7l2 2 3-3"/></svg>
      Agents List
    </button>
    <span class="rx-view-count">${visible.length} ${visible.length===1?'agent':'agents'}</span>
  </div>

  <!-- LEGEND (calendar view only) -->
  <div class="rx-legend" ${_s.view==='agents'?'style="display:none"':''}>
    ${PALETTE_GROUPS.map(g => g.statuses.map(s =>
      `<span class="rx-lg rx-st-${s}"><span class="rx-lg-code">${STATUS_LABEL[s]}</span><span class="rx-lg-name">${STATUS_LONG[s]}</span></span>`
    ).join('')).join('')}
    <span class="rx-lg-tip">Click cell → quick-pick all statuses · Right-click cell → full palette · Right-click agent name → status actions · Click date header → fill column</span>
  </div>

  <!-- BULK ACTION BAR (hidden until agents selected) -->
  <div class="rx-bulk-bar" id="rx-bulk-bar" style="display:none">
    <span class="rx-bulk-count" id="rx-bulk-count">0 agents selected</span>
    <div class="rx-bulk-actions">
      <select class="rx-bulk-sel" id="rx-bulk-status-val" title="Status to apply">
        <option value="">— Pick status —</option>
        ${QUICK_PICK.map(q => `<option value="${q.s}">${q.label} — ${q.name}</option>`).join('')}
      </select>
      <input type="date" class="rx-bulk-date" id="rx-bulk-date" title="Apply to this date" value="${today}">
      <button class="rx-bulk-btn rx-bulk-btn-primary" id="rx-bulk-apply"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;display:inline;vertical-align:-1px"><path d="M2 7l3.5 3.5L12 3"/></svg> Apply</button>
      <div class="rx-bulk-sep"></div>
      <select class="rx-bulk-sel" id="rx-bulk-shift-val" title="Shift to assign">
        <option value="">— Pick shift —</option>
        ${SHIFT_OPTIONS.map(g => `<optgroup label="${g.group}">${g.shifts.map(sh => `<option value="${sh}">${sh}</option>`).join('')}</optgroup>`).join('')}
      </select>
      <button class="rx-bulk-btn" id="rx-bulk-shift-apply"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;display:inline;vertical-align:-1px"><path d="M2 7l3.5 3.5L12 3"/></svg> Change Shift</button>
      <div class="rx-bulk-sep"></div>
      <button class="rx-bulk-btn rx-bulk-btn-danger" id="rx-bulk-clear"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px;display:inline;vertical-align:-1px"><path d="M2 2l10 10M12 2L2 12"/></svg> Deselect All</button>
    </div>
  </div>

  <!-- CALENDAR VIEW -->
  <div id="rx-calendar-view" ${_s.view==='agents'?'style="display:none"':''}>
  <div class="rx-grid-wrap">
    <table class="rx-grid" id="rx-grid-table">
      <thead>
        <tr>
          <th class="rx-th rx-th-name">
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="rx-sel-all" title="Select / deselect all" style="accent-color:#F4891F;cursor:pointer;width:14px;height:14px;">
              <span>Agent</span>
              <span style="font-size:9px;opacity:.6;font-weight:500;">${visible.length} shown</span>
            </div>
          </th>
          ${dateHeadersHtml}
          <th class="rx-th rx-th-att" title="Attendance % = (P+WFH+OD) / filled days">Att%</th>
        </tr>
      </thead>
      <tbody>
        ${gridRowsHtml}
        ${covRowHtml}
      </tbody>
    </table>
  </div>

  <!-- ATTENDANCE SUMMARY -->
  </div><!-- end calendar view -->

  <!-- AGENTS LIST VIEW -->
  <div id="rx-agents-view" ${_s.view==='calendar'?'style="display:none"':''}>
    <div class="rx-agents-toolbar">
      <div class="rx-search" style="max-width:320px">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="rx-search-ico"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
        <input type="text" id="rx-alist-search" placeholder="Search agents…" value="${esc(_s.agentListSearch)}">
      </div>
      <button class="rx-pill rx-pill-primary" id="rx-alist-add">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="width:13px;height:13px"><path d="M8 3v10M3 8h10"/></svg> Add Agent
      </button>
    </div>
    <div class="rx-agents-table-wrap">
      <table class="rx-agents-tbl">
        <thead>
          <tr>
            <th style="width:44px"></th>
            <th>Name</th>
            <th>Emp ID</th>
            <th>Designation</th>
            <th>Shift (IST)</th>
            <th>Joined</th>
            <th>Status</th>
            <th style="width:80px">Actions</th>
          </tr>
        </thead>
        <tbody id="rx-alist-body">
          ${(() => {
            const q = (_s.agentListSearch || '').toLowerCase();
            const rows = (_s.data?.agents || []).filter(a =>
              !q || (a.pseudo||a.full_name||''). toLowerCase().includes(q) ||
              (a.emp_id||''). toLowerCase().includes(q) ||
              (a.designation||''). toLowerCase().includes(q)
            );
            if (!rows.length) return '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9BAFC0;font-size:13px;">No agents found</td></tr>';
            const palette = ['#F4891F','#21AAE0','#2DDC96','#8B5CF6','#F43F5E','#F59E0B','#06B6D4'];
            return rows.map((a,i) => {
              const ini = ((a.pseudo||a.full_name||'?').trim().split(/\s+/).map(p=>p[0]||''). join(''). toUpperCase()).slice(0,2);
              const av = palette[i % palette.length];
              const desg = (a.designation||''). replace('Technical Support Representative','TSR'). replace('Technical Support Specialist','TS Specialist');
              const statusBadge = a.status==='relieved'
                ? '<span class="rx-badge rx-badge-grey">Relieved</span>'
                : a.status==='on_leave'
                  ? '<span class="rx-badge rx-badge-blue">On Leave</span>'
                  : '<span class="rx-badge rx-badge-green">Active</span>';
              return `<tr class="rx-alist-row">
                <td><div class="rx-alist-avatar" style="background:${av}">${ini}</div></td>
                <td>
                  <div class="rx-alist-name">${esc(a.pseudo||a.full_name||'—')}</div>
                  ${a.full_name && a.pseudo && a.full_name!==a.pseudo ? '<div class="rx-alist-sub">'+esc(a.full_name)+'</div>' : ''}
                </td>
                <td><span class="rx-mono">${esc(a.emp_id||'—')}</span></td>
                <td>${esc(desg||'—')}</td>
                <td class="rx-alist-shift">${esc(a.shift||'—')}</td>
                <td>${esc(a.doj||'—')}</td>
                <td>${statusBadge}</td>
                <td>
                  <div class="rx-alist-actions">
                    <button class="rx-alist-btn rx-alist-edit" data-emp="${esc(a.emp_id)}" title="Edit">
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M10 2l2 2-7 7H3V9l7-7z"/></svg>
                    </button>
                    <button class="rx-alist-btn rx-alist-delete" data-emp="${esc(a.emp_id)}" title="Remove">
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M2 4h10M5 4V2h4v2M5.5 7v4M8.5 7v4M3 4l.8 8h6.4L11 4"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`;
            }).join('');
          })()}
        </tbody>
      </table>
    </div>
  </div>

  <details class="rx-summary-wrap" id="rx-summary-panel">
    <summary class="rx-summary-toggle">📊 Monthly Attendance Summary — ${monthLabel(_s.month)}</summary>
    <div class="rx-summary-scroll">
      <table class="rx-summary-tbl">
        <thead>
          <tr>
            <th class="rx-sth rx-sth-name">Agent</th>
            <th class="rx-sth rx-sth-p" title="Present">P</th>
            <th class="rx-sth rx-sth-wfh" title="Work From Home">WFH</th>
            <th class="rx-sth rx-sth-od" title="On Duty">OD</th>
            <th class="rx-sth" title="Weekly Off">OFF</th>
            <th class="rx-sth rx-sth-pl" title="Paid Leave">PL</th>
            <th class="rx-sth rx-sth-upl" title="Unpaid Leave">UPL</th>
            <th class="rx-sth rx-sth-sl" title="Sick Leave">SL</th>
            <th class="rx-sth rx-sth-ncns" title="No Call No Show / Absent">NCNS</th>
            <th class="rx-sth rx-sth-att" title="Attendance %">Att%</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(a => {
            const st = agentStats(a.emp_id, dates, grid);
            const attCls = st.pct === null ? '' : st.pct >= 70 ? 'rx-att-good' : st.pct >= 40 ? 'rx-att-mid' : 'rx-att-low';
            const avatarHue = Math.abs([...a.emp_id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 360;
            return `<tr class="rx-srow">
              <td class="rx-std-name">
                <div class="rx-name-row">
                  <div class="rx-avatar rx-avatar-sm" style="background:hsl(${avatarHue},52%,42%)">${(a.pseudo||a.emp_id).split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')}</div>
                  <div class="rx-name-info">
                    <div class="rx-name">${esc(a.pseudo||a.full_name||a.emp_id)}</div>
                    <div class="rx-meta">${esc(a.emp_id)}${a.shift ? ' · <em>'+esc(a.shift)+'</em>' : ''}</div>
                  </div>
                </div>
              </td>
              <td class="rx-std">${st.p ? `<span class="rx-stat-p">${st.p}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.wfh ? `<span class="rx-stat-wfh">${st.wfh}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.od ? `<span class="rx-stat-od">${st.od}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.off ? `<span class="rx-stat-off">${st.off}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.pl ? `<span class="rx-stat-pl">${st.pl}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.upl ? `<span class="rx-stat-upl">${st.upl}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.sl ? `<span class="rx-stat-sl">${st.sl}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.ncns ? `<span class="rx-stat-ncns">${st.ncns}</span>` : '<span class="rx-stat-nil">—</span>'}</td>
              <td class="rx-std">${st.pct !== null ? `<span class="rx-att-pct ${attCls}">${st.pct}%</span>` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </details>

  <!-- FOOTER -->
  <div class="rx-footer">
    <span class="rx-foot-stat">${visible.length} / ${agents.length} agents</span>
    <span class="rx-foot-stat">${dates.length} days · ${monthLabel(_s.month)}</span>
    <span class="rx-foot-flex"></span>
    <span class="rx-save-state" id="rx-save-state"></span>
  </div>

</div>`;

    wire(root);
  }

  /* ══════════════════════════════════════════════════════════
     AGENT ROW
  ══════════════════════════════════════════════════════════ */
  function renderAgentRow(a, dates, grid, today) {
    const stats = agentStats(a.emp_id, dates, grid);
    const row = grid[a.emp_id] || {};

    const cells = dates.map(d => {
      const s = (row[d]?.status) || '';
      const isW = isWeekend(d);
      const isT = d === today;
      const isWeekEnd = isSunday(d);
      const lbl = STATUS_LABEL[s] || '';
      const dayNum = d.slice(-2).replace(/^0/, ''); // day number without leading zero
      const tip = `${esc(a.pseudo || a.emp_id)} · ${d}${s ? ' · ' + STATUS_LONG[s] : ''}`;
      // Render day number in a span + status label — CSS uses these to build circular cells
      const inner = s
        ? `<span class="rx-day-num">${dayNum}</span>`
        : `<span class="rx-day-num rx-day-empty">${dayNum}</span>`;
      return `<td class="rx-cell rx-st-${s || 'empty'} ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        data-date="${d}" data-emp="${esc(a.emp_id)}" data-status="${s}"
        title="${tip}">${inner}</td>`;
    }).join('');

    const attCls2 = stats.pct !== null ? (stats.pct >= 70 ? 'rx-att-good' : stats.pct >= 40 ? 'rx-att-mid' : 'rx-att-low') : '';
    const attHtml = stats.pct !== null
      ? `<div class="rx-td-att-inner ${attCls2}">
           <span class="rx-att-pct">${stats.pct}%</span>
           <div class="rx-att-bar"><i class="rx-att-bar-fill" style="width:${stats.pct}%"></i></div>
         </div>`
      : '<span style="color:#9AA3AF;font-size:11px;">—</span>';

    // Avatar initials + color
    const displayName = a.pseudo || a.full_name || a.emp_id;
    const initials = displayName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
    const avatarHue = Math.abs([...a.emp_id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 360;
    const avatarBg = `hsl(${avatarHue},52%,42%)`;
    const statusDot = a.status === 'on_leave' ? '<span class="rx-name-dot rx-dot-leave" title="On Extended Leave"></span>'
                    : a.status === 'relieved'  ? '<span class="rx-name-dot rx-dot-rel" title="Relieved"></span>'
                    : '';

    return `<tr class="rx-row ${a.status === 'relieved' ? 'rx-row-relieved' : ''} ${a.status === 'on_leave' ? 'rx-row-leave' : ''}" data-emp="${esc(a.emp_id)}">
      <td class="rx-td-name" title="Double-click to edit · Right-click for quick actions">
        <div class="rx-name-row">
          <input type="checkbox" class="rx-row-chk" data-emp="${esc(a.emp_id)}" style="accent-color:#F4891F;cursor:pointer;width:13px;height:13px;flex-shrink:0;" title="Select agent">
          <div class="rx-avatar" style="background:${avatarBg}">${initials}</div>
          <div class="rx-name-info">
            <div class="rx-name">${statusDot}${esc(displayName)}</div>
            <div class="rx-meta">${esc(a.emp_id)}${a.designation ? ' · ' + esc(a.designation.replace('Technical Support Representative','TSR').replace('Technical Support','TS')) : ''}${a.shift ? ' · <em>' + esc(a.shift) + '</em>' : ''}</div>
          </div>
        </div>
      </td>
      ${cells}
      <td class="rx-td-att ${attCls2}">${attHtml}</td>
    </tr>`;
  }

  /* ══════════════════════════════════════════════════════════
     EMPTY STATE
  ══════════════════════════════════════════════════════════ */
  function renderEmpty(root) {
    root.innerHTML = `
      <div class="rx-empty-card">
        <div class="rx-empty-ico">📋</div>
        <div class="rx-empty-title">No roster data for this month</div>
        <div class="rx-empty-sub">29 agents · 31 months of history are bundled with the app. Import them to get started.</div>
        <div class="rx-empty-actions">
          <button class="rx-pill rx-pill-primary" id="rx-seed">⬆ Import history snapshot</button>
          <button class="rx-pill" id="rx-add-empty">＋ Add agent manually</button>
        </div>
        <div class="rx-empty-status" id="rx-seed-status"></div>
      </div>`;
    $('#rx-seed').onclick = async () => {
      const btn = $('#rx-seed'), st = $('#rx-seed-status');
      btn.disabled = true; btn.textContent = 'Importing…';
      st.style.color = '#1A6FA0'; st.textContent = 'Loading…';
      try {
        const j = await postReseed();
        if (!j.success) throw new Error(j.error || 'Import failed');
        st.style.color = '#0F6F46'; st.textContent = `✅ Loaded ${j.agentsInserted} agents · ${j.daysInserted} records`;
        await loadMonth(_s.month || nowMonthIso()); render();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Retry';
        st.style.color = '#B33438'; st.textContent = 'Failed: ' + e.message;
      }
    };
    $('#rx-add-empty').onclick = openAddAgent;
  }

  /* ══════════════════════════════════════════════════════════
     WIRE-UP
  ══════════════════════════════════════════════════════════ */
  function wire(root) {
    $('#rx-prev').onclick = () => shiftMonth(-1);
    $('#rx-next').onclick = () => shiftMonth(+1);
    $('#rx-today-btn').onclick = () => go(nowMonthIso());
    $('#rx-month-input').onchange = e => go(e.target.value);
    // View tab switcher
    const viewCal = $('#rx-view-cal'), viewAgents = $('#rx-view-agents');
    const calView = root.querySelector('#rx-calendar-view'), agentsView = root.querySelector('#rx-agents-view');
    if (viewCal) viewCal.onclick = () => { _s.view = 'calendar'; go(_s.month); };
    if (viewAgents) viewAgents.onclick = () => { _s.view = 'agents'; go(_s.month); };

    // Agents list: search
    const alistSearch = $('#rx-alist-search');
    if (alistSearch) alistSearch.oninput = e => { _s.agentListSearch = e.target.value; go(_s.month); };

    // Agents list: add
    const alistAdd = $('#rx-alist-add');
    if (alistAdd) alistAdd.onclick = openAddAgent;

    // Agents list: edit buttons
    root.querySelectorAll('.rx-alist-edit').forEach(btn => {
      btn.onclick = () => {
        const emp = btn.dataset.emp;
        const agent = (_s.data?.agents || []).find(a => a.emp_id === emp);
        if (agent) openEditAgent(agent);
      };
    });

    // Agents list: delete buttons
    root.querySelectorAll('.rx-alist-delete').forEach(btn => {
      btn.onclick = async () => {
        const emp = btn.dataset.emp;
        const agent = (_s.data?.agents || []).find(a => a.emp_id === emp);
        if (!agent) return;
        if (!confirm(`Remove ${agent.pseudo || agent.emp_id} from this roster?\n\nThis only removes them from the monitoring roster, not from RingCentral.`)) return;
        try {
          const r = await fetch('/api/roster/agent/' + encodeURIComponent(emp), { method: 'DELETE', credentials: 'include' });
          const j = await r.json();
          if (!j.success) throw new Error(j.error || 'Delete failed');
          if (_s.data) _s.data.agents = _s.data.agents.filter(a => a.emp_id !== emp);
          go(_s.month);
          setSaveState('ok', `Removed ${agent.pseudo || emp}`);
        } catch(e) {
          setSaveState('err', '❌ ' + e.message);
        }
      };
    });

    // Filter bar — designation chips
    root.querySelectorAll('[data-desg]').forEach(btn => {
      btn.onclick = () => { _s.designationFilter = btn.dataset.desg; go(_s.month); };
    });
    // Filter bar — today status chips
    root.querySelectorAll('[data-sf]').forEach(btn => {
      btn.onclick = () => { _s.statusFilter = btn.dataset.sf; go(_s.month); };
    });
    // Clear all filters
    const clearBtn = $('#rx-filter-clear');
    if (clearBtn) clearBtn.onclick = () => { _s.designationFilter = ''; _s.statusFilter = ''; go(_s.month); };

    $('#rx-search').oninput = e => {
      _s.agentSearch = e.target.value;
      const caret = document.activeElement?.id === 'rx-search' ? e.target.selectionStart : null;
      render();
      const el = $('#rx-search'); if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret); }
    };
    $('#rx-group-shift').onchange = e => { _s.groupByShift = e.target.checked; render(); };
    $('#rx-show-relieved').onchange = e => { _s.showRelieved = e.target.checked; render(); };
    $('#rx-add').onclick = openAddAgent;
    $('#rx-audit').onclick = openAuditLog;
    $('#rx-export').onclick = exportCsv;

    // Multi-select checkboxes
    const selAllChk = $('#rx-sel-all');
    const rowChks = $$('.rx-row-chk', root);
    const bulkBar = $('#rx-bulk-bar');
    const bulkCount = $('#rx-bulk-count');

    function updateBulkBar() {
      const checked = $$('.rx-row-chk:checked', root);
      const n = checked.length;
      if (n > 0) {
        bulkBar.style.display = 'flex';
        bulkCount.textContent = `${n} agent${n > 1 ? 's' : ''} selected`;
      } else {
        bulkBar.style.display = 'none';
      }
      if (selAllChk) selAllChk.indeterminate = n > 0 && n < rowChks.length;
      if (selAllChk) selAllChk.checked = n === rowChks.length && n > 0;
    }

    rowChks.forEach(chk => {
      chk.addEventListener('change', updateBulkBar);
      chk.addEventListener('click', e => e.stopPropagation()); // don't trigger row dblclick
    });

    if (selAllChk) {
      selAllChk.onchange = () => {
        rowChks.forEach(c => c.checked = selAllChk.checked);
        updateBulkBar();
      };
    }

    // Bulk: apply status to a specific date
    $('#rx-bulk-apply')?.addEventListener('click', async () => {
      const checked = $$('.rx-row-chk:checked', root);
      const status = $('#rx-bulk-status-val').value;
      const date = $('#rx-bulk-date').value;
      if (!status) { alert('Please pick a status to apply'); return; }
      if (!date) { alert('Please pick a date'); return; }
      const empIds = checked.map(c => c.dataset.emp);
      // Apply to DOM cells immediately
      empIds.forEach(emp => {
        const cell = root.querySelector(`.rx-cell[data-emp="${emp}"][data-date="${date}"]`);
        if (cell) applyCell(cell, status);
      });
      setSaveState('saving', `⏳ Applying to ${empIds.length} agents…`);
    });

    // Bulk: change shift for selected agents
    $('#rx-bulk-shift-apply')?.addEventListener('click', async () => {
      const checked = $$('.rx-row-chk:checked', root);
      const shift = $('#rx-bulk-shift-val').value;
      if (!shift) { alert('Please pick a shift'); return; }
      const empIds = checked.map(c => c.dataset.emp);
      setSaveState('saving', `⏳ Updating shift for ${empIds.length} agents…`);
      let ok = 0;
      for (const emp of empIds) {
        try {
          const r = await fetch('/api/roster/agents', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emp_id: emp, shift }),
          });
          const j = await r.json();
          if (j.success) {
            ok++;
            if (_s.data) {
              const a = _s.data.agents.find(x => x.emp_id === emp);
              if (a) a.shift = shift;
            }
          }
        } catch (e) {}
      }
      setSaveState('ok', `✅ Shift updated for ${ok} agent${ok !== 1 ? 's' : ''}`);
      render();
    });

    // Bulk: deselect all
    $('#rx-bulk-clear')?.addEventListener('click', () => {
      rowChks.forEach(c => c.checked = false);
      if (selAllChk) selAllChk.checked = false;
      updateBulkBar();
    });

    // Cell left-click: cycle, right-click: palette
    $$('.rx-cell', root).forEach(cell => {
      cell.addEventListener('click', ev => { ev.preventDefault(); openQuickPick(cell, ev); });
      cell.addEventListener('contextmenu', ev => { ev.preventDefault(); openPalette(cell, ev); });
    });

    // Date header click: bulk fill column
    $$('.rx-th-day[data-col-date]', root).forEach(th => {
      th.addEventListener('click', ev => {
        if (ev.target === th || th.contains(ev.target)) openColumnFill(th.dataset.colDate);
      });
    });

    // Double-click agent name: edit | Right-click: context menu
    $$('.rx-td-name', root).forEach(td => {
      td.addEventListener('dblclick', () => {
        const empId = td.closest('tr')?.dataset?.emp;
        if (empId && _s.data) {
          const agent = _s.data.agents.find(a => a.emp_id === empId);
          if (agent) openEditAgent(agent);
        }
      });
      td.addEventListener('contextmenu', ev => {
        const empId = td.closest('tr')?.dataset?.emp;
        if (empId && _s.data) {
          const agent = _s.data.agents.find(a => a.emp_id === empId);
          if (agent) openAgentCtx(agent, ev);
        }
      });
    });
  }

  function go(yyyymm) {
    const root = $('#roster-admin-root');
    root.innerHTML = '<div class="rx-loading"><div class="rx-spinner"></div>Loading…</div>';
    loadMonth(yyyymm).then(render).catch(e => {
      root.innerHTML = `<div class="rx-error">Failed: ${esc(e.message)}</div>`;
    });
  }

  function shiftMonth(delta) {
    const [y, m] = _s.month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    go(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  /* ══════════════════════════════════════════════════════════
     CELL INTERACTIONS
  ══════════════════════════════════════════════════════════ */
  function openQuickPick(cell, ev) {
    // Remove any existing quick-pick
    const old = document.getElementById('rx-qp');
    if (old) { old.remove(); return; }

    const curStatus = cell.dataset.status || '';
    const qp = document.createElement('div');
    qp.className = 'rx-qp';
    qp.id = 'rx-qp';

    // Group statuses
    const groups = [
      { key: 'work',  label: 'Work',  items: QUICK_PICK.filter(q=>q.group==='work')  },
      { key: 'off',   label: 'Off',   items: QUICK_PICK.filter(q=>q.group==='off')   },
      { key: 'leave', label: 'Leave', items: QUICK_PICK.filter(q=>q.group==='leave') },
      { key: 'issue', label: 'Issues',items: QUICK_PICK.filter(q=>q.group==='issue') },
    ];

    const groupHTML = groups.map(g => `
      <div class="rx-qp-group">
        <div class="rx-qp-glabel">${g.label}</div>
        <div class="rx-qp-grow">
          ${g.items.map(({s, label, name}) => `
            <button class="rx-qp-btn rx-st-${s} ${s === curStatus ? 'rx-qp-active' : ''}" data-s="${s}" title="${name}">
              <span class="rx-qp-code">${label}</span>
              <span class="rx-qp-lbl">${name}</span>
            </button>`).join('')}
        </div>
      </div>`).join('<div class="rx-qp-vsep"></div>');

    qp.innerHTML = `
      <div class="rx-qp-header">
        <span class="rx-qp-title">Set Status</span>
        <button class="rx-qp-clear" data-s="" title="Clear status"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:10px;height:10px"><path d="M2 2l8 8M10 2L2 10"/></svg></button>
      </div>
      <div class="rx-qp-body">${groupHTML}</div>`;
    document.body.appendChild(qp);

    // Position below cell, inside viewport
    const rect = cell.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // Give browser one frame to render so we get real dimensions
    requestAnimationFrame(() => {
      const qpW = qp.offsetWidth || 400, qpH = qp.offsetHeight || 120;
      let top = rect.bottom + 6;
      let left = rect.left + rect.width / 2 - qpW / 2;
      if (top + qpH > vh - 10) top = rect.top - qpH - 6;
      if (left + qpW > vw - 10) left = vw - qpW - 10;
      if (left < 10) left = 10;
      qp.style.top = top + 'px';
      qp.style.left = left + 'px';
    });

    qp.querySelectorAll('[data-s]').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); applyCell(cell, btn.dataset.s); qp.remove(); };
    });

    // Dismiss on outside click or Escape
    const dismiss = e => {
      if (!qp.contains(e.target) && e.target !== cell) { qp.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    const keyDismiss = e => { if (e.key === 'Escape') { qp.remove(); document.removeEventListener('keydown', keyDismiss); } };
    setTimeout(() => {
      document.addEventListener('mousedown', dismiss);
      document.addEventListener('keydown', keyDismiss);
    }, 50);
  }

  function applyCell(cell, status) {
    const date = cell.dataset.date;
    const emp = cell.dataset.emp;

    // Update DOM
    cell.dataset.status = status;
    const classes = ['rx-cell'];
    if (isWeekend(date)) classes.push('rx-w');
    if (date === todayIso()) classes.push('rx-t');
    if (isSunday(date)) classes.push('rx-week-end');
    classes.push('rx-st-' + (status || 'empty'));
    cell.className = classes.join(' ');
    // Preserve day number span, update status content
    const daySpan = cell.querySelector('.rx-day-num');
    const dayN = cell.dataset.date ? cell.dataset.date.slice(-2).replace(/^0/,'') : '';
    if (status) {
      cell.innerHTML = `<span class="rx-day-num">${dayN}</span>`;
    } else {
      cell.innerHTML = `<span class="rx-day-num rx-day-empty">${dayN}</span>`;
    }
    // Pop-in animation on status change
    if (status) {
      cell.classList.add('rx-just-set');
      setTimeout(() => cell.classList.remove('rx-just-set'), 350);
    }

    // Update data model
    if (!_s.data.grid[emp]) _s.data.grid[emp] = {};
    if (status) _s.data.grid[emp][date] = { status };
    else delete _s.data.grid[emp][date];

    recalcRow(cell.closest('tr'), emp);

    // Queue save
    _s.pendingSaves.set(`${date}|${emp}`, { date, emp_id: emp, status });
    scheduleSave();
  }

  function recalcRow(tr, emp) {
    if (!tr) return;
    const stats = agentStats(emp, _s.data.dates, _s.data.grid);
    const tots = tr.querySelectorAll('.rx-td-tot');
    if (tots.length < 9) return;
    tots[0].textContent = stats.p || '—';
    tots[1].textContent = stats.wfh || '—';
    tots[2].textContent = stats.od || '—';
    tots[3].textContent = stats.off || '—';
    tots[4].textContent = stats.pl || '—';
    tots[5].textContent = stats.upl || '—';
    tots[6].textContent = stats.sl || '—';
    tots[7].textContent = stats.ncns || '—';
    const attCell = tr.querySelector('.rx-td-att');
    if (attCell) {
      if (stats.pct !== null) {
        const cls = stats.pct >= 70 ? 'rx-att-good' : stats.pct >= 40 ? 'rx-att-mid' : 'rx-att-low';
        attCell.innerHTML = `<span class="rx-att-pct ${cls}">${stats.pct}%</span>`;
      } else {
        attCell.textContent = '—';
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     PALETTE POPOVER (right-click)
  ══════════════════════════════════════════════════════════ */
  function closePopovers() { $$('.rx-popover').forEach(p => p.remove()); }

  function openPalette(cell, ev) {
    closePopovers();
    const rect = cell.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'rx-popover';

    const curStatus = cell.dataset.status || '';
    const agentName = cell.title.split(' · ')[0];

    pop.innerHTML = `
      <div class="rx-pop-head">
        <span>${esc(agentName)}</span>
        <span class="rx-pop-date">${cell.dataset.date}</span>
      </div>
      <div class="rx-pop-body">
        ${PALETTE_GROUPS.map(g => `
          <div class="rx-pop-group-label">${g.label}</div>
          <div class="rx-pop-group">
            ${g.statuses.map(s => `
              <button class="rx-pop-opt rx-st-${s} ${s === curStatus ? 'rx-pop-active' : ''}" data-s="${s}">
                <span class="rx-pop-code">${STATUS_LABEL[s]}</span>
                <span class="rx-pop-name">${STATUS_LONG[s]}</span>
              </button>`).join('')}
          </div>`).join('')}
      </div>
      <div class="rx-pop-foot">
        <button class="rx-pop-clear" data-s="">✕ Clear</button>
        <button class="rx-pop-close">Close</button>
      </div>`;

    document.body.appendChild(pop);

    // Position
    const vw = window.innerWidth, vh = window.innerHeight;
    const popH = 360, popW = 310;
    let top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - popW / 2;
    if (top + popH > vh) top = Math.max(6, rect.top - popH - 6);
    if (left + popW > vw) left = vw - popW - 8;
    if (left < 8) left = 8;
    pop.style.cssText = `top:${top}px;left:${left}px;`;

    pop.querySelectorAll('[data-s]').forEach(b => {
      b.onclick = () => { applyCell(cell, b.dataset.s); pop.remove(); };
    });
    pop.querySelector('.rx-pop-close').onclick = () => pop.remove();

    setTimeout(() => {
      const dismiss = e => {
        if (!pop.contains(e.target) && e.target !== cell) { pop.remove(); document.removeEventListener('mousedown', dismiss); }
      };
      document.addEventListener('mousedown', dismiss);
    }, 50);
  }

  /* ══════════════════════════════════════════════════════════
     COLUMN FILL
  ══════════════════════════════════════════════════════════ */
  function openColumnFill(date) {
    const existing = $$(`[data-col-date="${date}"]`, document.getElementById('rx-grid-table'));
    const cells = $$(`[data-date="${date}"].rx-cell`);
    const emptyCells = cells.filter(c => !c.dataset.status);
    if (cells.length === 0) return;

    const pop = document.createElement('div');
    pop.className = 'rx-popover rx-col-fill-pop';
    pop.innerHTML = `
      <div class="rx-pop-head">
        <span>Fill column: ${date}</span>
        <span class="rx-pop-date">${emptyCells.length} empty · ${cells.length} total</span>
      </div>
      <div class="rx-pop-body" style="padding:10px;">
        <div style="font-size:11px;color:#6B849A;margin-bottom:8px;">Apply to:
          <label style="margin-right:10px;"><input type="radio" name="rx-fill-scope" value="empty" checked> Empty only (${emptyCells.length})</label>
          <label><input type="radio" name="rx-fill-scope" value="all"> All (${cells.length})</label>
        </div>
        <div class="rx-pop-group" style="grid-template-columns:repeat(3,1fr);">
          ${['present','wfh','off','holiday','pl','upl','sl','ncns'].map(s => `
            <button class="rx-pop-opt rx-st-${s}" data-fill-s="${s}">
              <span class="rx-pop-code">${STATUS_LABEL[s]}</span>
              <span class="rx-pop-name">${STATUS_LONG[s]}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="rx-pop-foot">
        <button class="rx-pop-close">Cancel</button>
      </div>`;

    document.body.appendChild(pop);
    const vw = window.innerWidth;
    const hdrEl = $$('.rx-th-day[data-col-date="' + date + '"]')[0];
    let left = 200;
    if (hdrEl) {
      const r = hdrEl.getBoundingClientRect();
      left = Math.min(r.left, vw - 330);
    }
    pop.style.cssText = `top:140px;left:${Math.max(8, left)}px;`;

    pop.querySelectorAll('[data-fill-s]').forEach(btn => {
      btn.onclick = () => {
        const scope = pop.querySelector('input[name="rx-fill-scope"]:checked')?.value;
        const targetCells = scope === 'all' ? cells : emptyCells;
        for (const cell of targetCells) applyCell(cell, btn.dataset.fillS);
        pop.remove();
      };
    });
    pop.querySelector('.rx-pop-close').onclick = () => pop.remove();
    setTimeout(() => {
      const d = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', d); } };
      document.addEventListener('mousedown', d);
    }, 50);
  }

  /* ══════════════════════════════════════════════════════════
     SAVE
  ══════════════════════════════════════════════════════════ */
  function scheduleSave() {
    setSaveState('saving', '⏳ Saving…');
    clearTimeout(_s.saveTimer);
    _s.saveTimer = setTimeout(flushSaves, 600);
  }

  async function flushSaves() {
    if (!_s.pendingSaves.size) return;
    const updates = Array.from(_s.pendingSaves.values());
    _s.pendingSaves.clear();
    try {
      const r = await fetch('/api/roster/bulk', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Save failed');
      setSaveState('ok', `✅ Saved ${updates.length} change${updates.length === 1 ? '' : 's'} · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setSaveState('err', '❌ Save failed: ' + e.message);
    }
  }

  function setSaveState(kind, msg) {
    const el = $('#rx-save-state'); if (!el) return;
    el.className = 'rx-save-state rx-save-' + kind;
    el.textContent = msg;
  }

  /* ══════════════════════════════════════════════════════════
     AGENT CONTEXT MENU (right-click on agent name)
  ══════════════════════════════════════════════════════════ */
  function openAgentCtx(agent, ev) {
    ev.preventDefault();
    // Remove any existing context menu
    const old = document.getElementById('rx-agent-ctx');
    if (old) old.remove();

    const status = agent.status || 'active';
    const statusLabel = { active: 'Active', relieved: 'Relieved', on_leave: 'On Leave' }[status] || status;
    const statusCls = `s-${status}`;
    const isActive = status === 'active' || status === '';
    const isRelieved = status === 'relieved';
    const isOnLeave = status === 'on_leave';

    const ctx = document.createElement('div');
    ctx.className = 'rx-agent-ctx';
    ctx.id = 'rx-agent-ctx';
    ctx.innerHTML = `
      <div class="rx-agent-ctx-header">
        <span class="rx-agent-ctx-name">${esc(agent.pseudo || agent.full_name || agent.emp_id)}</span>
        <span class="rx-agent-ctx-id">${esc(agent.emp_id)}${agent.designation ? ' · ' + esc(agent.designation.replace('Technical Support Representative','TSR')) : ''}</span>
        <span class="rx-agent-ctx-status ${statusCls}">${statusLabel}</span>
      </div>
      <div class="rx-agent-ctx-body">
        ${!isRelieved ? `<button class="rx-agent-ctx-item rx-ctx-danger" data-action="relieved">
          <span class="rx-agent-ctx-icon">🚫</span> Mark as Relieved
        </button>` : ''}
        ${!isOnLeave ? `<button class="rx-agent-ctx-item" data-action="on_leave">
          <span class="rx-agent-ctx-icon">🏖️</span> Mark on Extended Leave
        </button>` : ''}
        ${!isActive ? `<button class="rx-agent-ctx-item rx-ctx-success" data-action="active">
          <span class="rx-agent-ctx-icon">✅</span> Reactivate
        </button>` : ''}
        <div class="rx-agent-ctx-sep"></div>
        <button class="rx-agent-ctx-item" data-action="edit">
          <span class="rx-agent-ctx-icon">✏️</span> Edit Details
        </button>
      </div>`;

    document.body.appendChild(ctx);

    // Position near cursor, keep inside viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = ev.clientX + 4, y = ev.clientY + 4;
    const ctxW = 224, ctxH = ctx.offsetHeight || 180;
    if (x + ctxW > vw) x = ev.clientX - ctxW - 4;
    if (y + ctxH > vh) y = ev.clientY - ctxH - 4;
    ctx.style.cssText = `left:${Math.max(8, x)}px;top:${Math.max(8, y)}px`;

    ctx.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.action;
        ctx.remove();
        if (action === 'edit') { openEditAgent(agent); return; }
        await quickSetStatus(agent, action);
      };
    });

    // Dismiss on outside click
    setTimeout(() => {
      const dismiss = e => {
        if (!ctx.contains(e.target)) { ctx.remove(); document.removeEventListener('mousedown', dismiss); }
      };
      document.addEventListener('mousedown', dismiss);
    }, 50);
  }

  async function quickSetStatus(agent, newStatus) {
    // Optimistic update in _s.data
    if (_s.data) {
      const a = _s.data.agents.find(x => x.emp_id === agent.emp_id);
      if (a) a.status = newStatus;
    }
    render();

    try {
      const r = await fetch('/api/roster/agents', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: agent.emp_id, status: newStatus }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Update failed');
      // Sync back from server
      if (j.agent && _s.data) {
        const idx = _s.data.agents.findIndex(x => x.emp_id === agent.emp_id);
        if (idx !== -1) _s.data.agents[idx] = { ..._s.data.agents[idx], ...j.agent };
      }
      setSaveState('ok', `✅ ${agent.pseudo || agent.emp_id} → ${newStatus}`);
    } catch(e) {
      // Rollback
      if (_s.data) {
        const a = _s.data.agents.find(x => x.emp_id === agent.emp_id);
        if (a) a.status = agent.status;
      }
      render();
      setSaveState('err', '❌ ' + e.message);
    }
  }

  /* ══════════════════════════════════════════════════════════
     ADD / EDIT AGENT MODAL
  ══════════════════════════════════════════════════════════ */
  function agentFormHtml(a) {
    a = a || {};
    return `
      <div class="rx-form"><label>Emp ID</label><input id="rx-f-emp_id" placeholder="AD0xxx" value="${esc(a.emp_id || '')}" ${a.emp_id ? 'readonly' : ''}></div>
      <div class="rx-form"><label>Display Name</label><input id="rx-f-pseudo" placeholder="Pseudo / display name" value="${esc(a.pseudo || '')}"></div>
      <div class="rx-form"><label>Full Name</label><input id="rx-f-full_name" value="${esc(a.full_name || '')}"></div>
      <div class="rx-form"><label>Email</label><input id="rx-f-email" type="email" value="${esc(a.email || '')}"></div>
      <div class="rx-form"><label>Designation</label><input id="rx-f-designation" value="${esc(a.designation || '')}"></div>
      <div class="rx-form"><label>Date of Join</label><input id="rx-f-doj" type="date" value="${esc(a.doj || '')}"></div>
      <div class="rx-form"><label>Shift (IST)</label>
        <select id="rx-f-shift">
          <option value="">— Select shift —</option>
          ${SHIFT_OPTIONS.map(g => `<optgroup label="${g.group}">
            ${g.shifts.map(sh => `<option value="${sh}" ${(a.shift || '').replace(/\./g,':').replace(/\s+/g,' ').trim() === sh ? 'selected' : ''}>${sh} IST (9 hrs)</option>`).join('')}
          </optgroup>`).join('')}
          <option value="__custom__" ${a.shift && !SHIFT_OPTIONS.flatMap(g=>g.shifts).includes((a.shift||'').replace(/\./g,':').replace(/\s+/g,' ').trim()) ? 'selected' : ''}>Other / Custom…</option>
        </select>
      </div>
      <div class="rx-form" id="rx-shift-custom-row" style="display:${a.shift && !SHIFT_OPTIONS.flatMap(g=>g.shifts).includes((a.shift||'').replace(/\./g,':').replace(/\s+/g,' ').trim()) ? 'flex' : 'none'}">
        <label>Custom shift</label><input id="rx-f-shift-custom" placeholder="e.g. 10:30 PM – 7:30 AM" value="${esc(a.shift || '')}">
      </div>
      <div class="rx-form"><label>Status</label>
        <select id="rx-f-status">
          <option value="active" ${a.status === 'active' || !a.status ? 'selected' : ''}>Active</option>
          <option value="relieved" ${a.status === 'relieved' ? 'selected' : ''}>Relieved</option>
          <option value="on_leave" ${a.status === 'on_leave' ? 'selected' : ''}>On Leave</option>
        </select>
      </div>`;
  }

  function openAddAgent() { openAgentModal(null); }
  function openEditAgent(agent) { openAgentModal(agent); }

  function openAgentModal(agent) {
    const isEdit = !!agent;
    const bg = document.createElement('div');
    bg.className = 'rx-modal-bg';
    bg.id = 'rx-agent-bg';
    bg.innerHTML = `
      <div class="rx-modal">
        <div class="rx-modal-head">
          <div class="rx-modal-title">${isEdit ? '✏️ Edit Agent' : '＋ Add Agent'}</div>
          <button class="rx-modal-x">×</button>
        </div>
        <div class="rx-modal-body">${agentFormHtml(agent)}</div>
        <div class="rx-modal-foot">
          <button class="rx-pill" id="rx-agent-cancel">Cancel</button>
          <button class="rx-pill rx-pill-primary" id="rx-agent-save">${isEdit ? 'Update' : 'Add Agent'}</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('.rx-modal-x').onclick = close;
    $('#rx-agent-cancel').onclick = close;
    $('#rx-agent-save').onclick = async () => {
      const body = {
        emp_id: $('#rx-f-emp_id').value.trim(),
        pseudo: $('#rx-f-pseudo').value.trim() || null,
        full_name: $('#rx-f-full_name').value.trim() || null,
        email: $('#rx-f-email').value.trim().toLowerCase() || null,
        designation: $('#rx-f-designation').value.trim() || null,
        doj: $('#rx-f-doj').value || null,
        shift: (() => {
          const sel = $('#rx-f-shift').value;
          if (!sel || sel === '__custom__') return ($('#rx-f-shift-custom')?.value || '').trim() || null;
          return sel;
        })(),
        status: $('#rx-f-status').value,
      };
      if (!body.emp_id) { alert('Emp ID is required'); return; }
      try {
        const r = await fetch('/api/roster/agents', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        close();
        await loadMonth(_s.month); render();
      } catch (e) { alert('Save failed: ' + e.message); }
    };
    // Show/hide custom shift row
    const shiftSel = $('#rx-f-shift');
    if (shiftSel) {
      shiftSel.onchange = () => {
        const row = document.getElementById('rx-shift-custom-row');
        if (row) row.style.display = shiftSel.value === '__custom__' ? 'flex' : 'none';
      };
    }
  }

  /* ══════════════════════════════════════════════════════════
     AUDIT LOG
  ══════════════════════════════════════════════════════════ */
  async function openAuditLog() {
    let events = [];
    try {
      const r = await fetch('/api/roster/audit?limit=100', { credentials: 'include' });
      const j = await r.json(); events = j.events || [];
    } catch (e) { return alert('Could not load audit log'); }

    const bg = document.createElement('div');
    bg.className = 'rx-modal-bg'; bg.id = 'rx-audit-bg';
    const rows = events.length === 0
      ? '<div style="padding:24px;text-align:center;color:#9BAFC0;">No changes yet.</div>'
      : `<table class="rx-audit-tbl">
          <thead><tr><th>When</th><th>Who</th><th>Agent</th><th>Date</th><th>From → To</th></tr></thead>
          <tbody>${events.map(e => `<tr>
            <td>${esc(e.ts || '')}</td>
            <td>${esc(e.actor_name || e.actor_email || '—')}</td>
            <td>${esc(e.emp_id || '—')}</td>
            <td>${esc(e.date || '—')}</td>
            <td>
              <span class="rx-st-badge rx-st-${e.prev_status || 'empty'}">${STATUS_LABEL[e.prev_status] || '∅'}</span>
              → <span class="rx-st-badge rx-st-${e.new_status || 'empty'}">${STATUS_LABEL[e.new_status] || '∅'}</span>
            </td>
          </tr>`).join('')}</tbody>
        </table>`;

    bg.innerHTML = `
      <div class="rx-modal rx-modal-wide">
        <div class="rx-modal-head">
          <div class="rx-modal-title">📋 Audit Log (${events.length} changes)</div>
          <button class="rx-modal-x">×</button>
        </div>
        <div class="rx-modal-body">${rows}</div>
        <div class="rx-modal-foot">
          <button class="rx-pill" id="rx-audit-close">Close</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    bg.querySelector('.rx-modal-x').onclick = () => bg.remove();
    $('#rx-audit-close').onclick = () => bg.remove();
  }

  /* ══════════════════════════════════════════════════════════
     EXPORT CSV
  ══════════════════════════════════════════════════════════ */
  function exportCsv() {
    if (!_s.data) return;
    const { dates, agents, grid } = _s.data;
    const head = ['Emp ID', 'Pseudo', 'Full Name', 'Email', 'Designation', 'Shift', ...dates, 'P', 'WFH', 'OD', 'OFF', 'PL', 'UPL', 'SL', 'NCNS', 'Att%'];
    const lines = [head.join(',')];
    for (const a of agents) {
      const s = agentStats(a.emp_id, dates, grid);
      const row = grid[a.emp_id] || {};
      const cells = dates.map(d => STATUS_LABEL[row[d]?.status || ''] || '');
      lines.push([a.emp_id, q(a.pseudo), q(a.full_name), q(a.email), q(a.designation), q(a.shift),
        ...cells, s.p, s.wfh, s.od, s.off, s.pl, s.upl, s.sl, s.ncns, s.pct != null ? s.pct + '%' : ''
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `roster-${_s.month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function q(v) { if (v == null) return ''; const s = String(v); return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s; }

})();
