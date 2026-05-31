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
#roster-admin-root,#roster-admin-root *,.rx-popover,.rx-popover *,.rx-modal-bg,.rx-modal-bg *{box-sizing:border-box!important}
#roster-admin-root{padding:20px 24px!important;font-family:'Poppins',system-ui,sans-serif!important;color:#072B40!important;min-height:60vh!important;background:#EEF1F5!important}
#roster-admin-root .rx-loading{padding:80px!important;text-align:center!important;color:#6B849A!important;font-size:13px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:12px!important}
#roster-admin-root .rx-spinner{width:22px!important;height:22px!important;border:3px solid #E6ECF4!important;border-top-color:#F4891F!important;border-radius:50%!important;animation:rx-spin .8s linear infinite!important;flex-shrink:0!important}
@keyframes rx-spin{to{transform:rotate(360deg)}}
#roster-admin-root .rx-error{padding:32px!important;text-align:center!important;color:#B33438!important;background:rgba(237,102,107,.07)!important;border:1px solid rgba(237,102,107,.3)!important;border-radius:14px!important}
#roster-admin-root .rx-wrap{display:flex!important;flex-direction:column!important;gap:12px!important;animation:rx-fade .3s ease both!important}
@keyframes rx-fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#roster-admin-root .rx-kpis{display:grid!important;grid-template-columns:repeat(5,1fr)!important;gap:10px!important}
#roster-admin-root .rx-kpi{background:#fff!important;border:1px solid #E2E8F0!important;border-radius:14px!important;padding:14px 16px 12px!important;box-shadow:0 2px 8px rgba(7,43,64,.07)!important;position:relative!important;overflow:hidden!important;display:block!important}
#roster-admin-root .rx-kpi::before{content:""!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:4px!important;background:#F4891F!important;border-radius:4px 0 0 4px!important}
#roster-admin-root .rx-kpi.rx-kpi-green::before{background:#2DDC96!important}
#roster-admin-root .rx-kpi.rx-kpi-amber::before{background:#FBC84B!important}
#roster-admin-root .rx-kpi.rx-kpi-red::before{background:#ED666B!important}
#roster-admin-root .rx-kpi.rx-kpi-teal::before{background:#21AAE0!important}
#roster-admin-root .rx-kpi-icon{font-size:18px!important;margin-bottom:6px!important;display:block!important;line-height:1!important}
#roster-admin-root .rx-kpi-lbl{font-size:9.5px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.08em!important;color:#9BAFC0!important;display:block!important}
#roster-admin-root .rx-kpi-val{font-size:30px!important;font-weight:800!important;color:#072B40!important;line-height:1.1!important;margin-top:4px!important;font-family:'JetBrains Mono',monospace!important;display:block!important}
#roster-admin-root .rx-kpi-sub{font-size:10.5px!important;color:#9BAFC0!important;margin-top:3px!important;display:block!important}
#roster-admin-root .rx-kpi-bar{height:4px!important;background:#F0F3F6!important;border-radius:9px!important;margin-top:8px!important;overflow:hidden!important;display:block!important}
#roster-admin-root .rx-kpi-bar-fill{height:100%!important;border-radius:9px!important;transition:width .6s ease!important;background:#21AAE0!important;display:block!important}
#roster-admin-root .rx-kpi-bar-fill.rx-cov-good{background:#2DDC96!important}
#roster-admin-root .rx-kpi-bar-fill.rx-cov-mid{background:#FBC84B!important}
#roster-admin-root .rx-kpi-bar-fill.rx-cov-low{background:#ED666B!important}
#roster-admin-root .rx-toolbar{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:12px!important;padding:9px 12px!important;box-shadow:0 1px 4px rgba(7,43,64,.05)!important}
#roster-admin-root .rx-tb-group{display:flex!important;align-items:center!important;gap:7px!important}
#roster-admin-root .rx-tb-grow{flex:1!important;min-width:180px!important}
#roster-admin-root .rx-icon-btn{width:32px!important;height:32px!important;border-radius:8px!important;border:1px solid #DEE1E6!important;background:#fff!important;color:#3A5068!important;font-size:20px!important;line-height:1!important;cursor:pointer!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-family:inherit!important;transition:all .15s!important}
#roster-admin-root .rx-icon-btn:hover{background:#F4891F!important;color:#fff!important;border-color:transparent!important}
#roster-admin-root .rx-month-display{position:relative!important;display:inline-flex!important;align-items:center!important;height:32px!important;padding:0 14px!important;background:linear-gradient(135deg,#072B40,#0D3D5C)!important;color:#fff!important;border-radius:8px!important;font-weight:700!important;font-size:13px!important;min-width:164px!important;justify-content:center!important;cursor:pointer!important;border:none!important}
#roster-admin-root .rx-month-display input[type="month"]{position:absolute!important;inset:0!important;opacity:0!important;cursor:pointer!important;width:100%!important;height:100%!important}
#roster-admin-root .rx-pill{height:32px!important;padding:0 13px!important;background:#fff!important;border:1px solid #DEE1E6!important;border-radius:8px!important;font-size:12px!important;font-weight:700!important;color:#3A5068!important;cursor:pointer!important;font-family:'Poppins',sans-serif!important;display:inline-flex!important;align-items:center!important;gap:5px!important;transition:all .15s!important;box-shadow:0 1px 2px rgba(7,43,64,.04)!important;white-space:nowrap!important}
#roster-admin-root .rx-pill:hover{border-color:#F4891F!important;color:#F4891F!important}
#roster-admin-root .rx-pill.rx-pill-primary{background:linear-gradient(135deg,#F4891F,#F28820)!important;color:#fff!important;border:none!important;box-shadow:0 4px 12px rgba(244,137,31,.28)!important}
#roster-admin-root .rx-pill.rx-pill-primary:hover{transform:translateY(-1px)!important;color:#fff!important}
#roster-admin-root .rx-search{position:relative!important;display:inline-flex!important;align-items:center!important;height:32px!important;background:#F7F9FB!important;border:1px solid #DEE1E6!important;border-radius:8px!important;padding:0 12px!important;flex:1!important;min-width:200px!important;transition:border-color .15s,box-shadow .15s!important}
#roster-admin-root .rx-search:focus-within{background:#fff!important;border-color:#F4891F!important;box-shadow:0 0 0 3px rgba(244,137,31,.14)!important}
#roster-admin-root .rx-search-ico{width:14px!important;height:14px!important;color:#9BAFC0!important;margin-right:8px!important;flex-shrink:0!important}
#roster-admin-root .rx-search:focus-within .rx-search-ico{color:#F4891F!important}
#roster-admin-root .rx-search input{border:none!important;outline:none!important;background:transparent!important;flex:1!important;font-family:inherit!important;font-size:12.5px!important;font-weight:500!important;color:#072B40!important;height:100%!important;padding:0!important;box-shadow:none!important}
#roster-admin-root .rx-switch{display:inline-flex!important;align-items:center!important;gap:5px!important;font-size:11.5px!important;color:#6B849A!important;cursor:pointer!important;padding:5px 9px!important;background:#F7F9FB!important;border-radius:50px!important;border:1px solid #E6ECF4!important;user-select:none!important}
#roster-admin-root .rx-switch input{accent-color:#F4891F!important;cursor:pointer!important}
#roster-admin-root .rx-legend{display:flex!important;gap:6px!important;flex-wrap:wrap!important;align-items:center!important;padding:9px 14px!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:12px!important;box-shadow:0 1px 3px rgba(7,43,64,.04)!important}
#roster-admin-root .rx-lg{display:inline-flex!important;align-items:center!important;gap:5px!important;padding:3px 8px!important;border-radius:50px!important;font-size:10px!important;font-weight:600!important;color:#3A5068!important;background:#F7F9FB!important;border:1px solid #E6ECF4!important}
#roster-admin-root .rx-lg-code{font-family:'JetBrains Mono',monospace!important;font-weight:800!important;padding:1px 5px!important;border-radius:4px!important;font-size:9px!important}
#roster-admin-root .rx-lg.rx-st-present .rx-lg-code{background:rgba(45,220,150,.22)!important;color:#0F6F46!important}
#roster-admin-root .rx-lg.rx-st-wfh .rx-lg-code{background:rgba(155,89,182,.22)!important;color:#6D2D8A!important}
#roster-admin-root .rx-lg.rx-st-on_duty .rx-lg-code{background:rgba(244,137,31,.2)!important;color:#B25C0E!important}
#roster-admin-root .rx-lg.rx-st-off .rx-lg-code{background:rgba(148,163,184,.22)!important;color:#475569!important}
#roster-admin-root .rx-lg.rx-st-pl .rx-lg-code{background:rgba(33,170,224,.22)!important;color:#1A6FA0!important}
#roster-admin-root .rx-lg.rx-st-upl .rx-lg-code{background:rgba(237,102,107,.22)!important;color:#B33438!important}
#roster-admin-root .rx-lg.rx-st-sl .rx-lg-code{background:rgba(251,200,75,.26)!important;color:#8C5800!important}
#roster-admin-root .rx-lg.rx-st-ncns .rx-lg-code{background:#DC2626!important;color:#fff!important}
#roster-admin-root .rx-lg-name{font-size:10px!important}
#roster-admin-root .rx-lg-tip{margin-left:auto!important;font-size:10px!important;font-style:italic!important;color:#9BAFC0!important}
#roster-admin-root .rx-grid-wrap{background:#fff!important;border:1px solid #E2E8F0!important;border-radius:14px!important;overflow:auto!important;max-height:62vh!important;box-shadow:0 4px 20px rgba(7,43,64,.07)!important}
#roster-admin-root .rx-grid{border-collapse:separate!important;border-spacing:0!important;font-size:11px!important;min-width:100%!important}
#roster-admin-root .rx-grid thead .rx-th{position:sticky!important;top:0!important;z-index:5!important;background:#072B40!important;color:#fff!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.04em!important;padding:8px 3px!important;text-align:center!important;border-bottom:2px solid #0D3D5C!important}
#roster-admin-root .rx-th-name{position:sticky!important;left:0!important;z-index:7!important;text-align:left!important;padding-left:16px!important;min-width:240px!important;background:#072B40!important}
#roster-admin-root .rx-th-day{min-width:32px!important;max-width:32px!important;padding:5px 2px!important;cursor:pointer!important}
#roster-admin-root .rx-th-day:hover{background:#1A4F6E!important}
#roster-admin-root .rx-th-day.rx-w{background:#5C2A0E!important}
#roster-admin-root .rx-th-day.rx-t{background:#0A4A2E!important}
#roster-admin-root .rx-th-day.rx-week-end{border-right:2px solid rgba(255,255,255,.2)!important}
#roster-admin-root .rx-th-dow{font-size:8.5px!important;font-weight:600!important;opacity:.6!important;display:block!important}
#roster-admin-root .rx-th-num{font-size:12px!important;font-weight:800!important;font-family:'JetBrains Mono',monospace!important;display:block!important}
#roster-admin-root .rx-th-cov{width:22px!important;height:3px!important;border-radius:9px!important;margin:3px auto 0!important;background:rgba(255,255,255,.12)!important;display:block!important}
#roster-admin-root .rx-th-cov.rx-cov-good{background:#2DDC96!important}
#roster-admin-root .rx-th-cov.rx-cov-mid{background:#FBC84B!important}
#roster-admin-root .rx-th-cov.rx-cov-low{background:#ED666B!important}
#roster-admin-root .rx-th-tot{background:#0B2E43!important;color:#FBC84B!important;font-size:9px!important;min-width:36px!important;padding:6px 3px!important}
#roster-admin-root .rx-th-att{background:#0B2E43!important;color:#21AAE0!important;font-size:9px!important;min-width:44px!important;padding:6px 4px!important}
#roster-admin-root .rx-row{transition:background .12s!important}
#roster-admin-root .rx-row:nth-child(even){background:#F9FAFB!important}
#roster-admin-root .rx-row:hover{background:rgba(244,137,31,.06)!important}
#roster-admin-root .rx-row-relieved{opacity:.5!important}
#roster-admin-root .rx-no-rows{padding:44px!important;text-align:center!important;color:#9BAFC0!important;font-size:13px!important}
#roster-admin-root .rx-td-name{background:#fff!important;border-bottom:1px solid #F0F3F6!important;border-right:2px solid #E2E8F0!important;padding:9px 14px!important;vertical-align:middle!important;position:sticky!important;left:0!important;z-index:4!important;cursor:pointer!important}
#roster-admin-root .rx-row:nth-child(even) .rx-td-name{background:#F9FAFB!important}
#roster-admin-root .rx-row:hover .rx-td-name{background:#FFF5EC!important}
#roster-admin-root .rx-name{font-weight:700!important;font-size:12.5px!important;color:#072B40!important;line-height:1.2!important;display:block!important}
#roster-admin-root .rx-meta{font-size:9.5px!important;color:#9BAFC0!important;margin-top:2px!important;font-family:'JetBrains Mono',monospace!important;display:block!important}
#roster-admin-root .rx-meta em{font-style:normal!important;color:#B4C2CE!important}
#roster-admin-root .rx-cell{width:32px!important;height:28px!important;text-align:center!important;vertical-align:middle!important;border-bottom:1px solid #F0F3F6!important;border-right:1px solid #F2F4F6!important;font-size:9.5px!important;font-weight:800!important;font-family:'JetBrains Mono',monospace!important;cursor:pointer!important;user-select:none!important;padding:0!important;transition:transform .1s,box-shadow .1s!important}
#roster-admin-root .rx-cell:hover{transform:scale(1.3)!important;z-index:3!important;position:relative!important;box-shadow:0 0 0 2px #F4891F,0 4px 10px rgba(244,137,31,.3)!important;border-radius:5px!important}
#roster-admin-root .rx-cell.rx-w{background:rgba(178,92,14,.06)!important}
#roster-admin-root .rx-cell.rx-t{box-shadow:inset 0 -3px 0 #2DDC96!important}
#roster-admin-root .rx-cell.rx-week-end{border-right:2px solid #DEE1E6!important}
#roster-admin-root .rx-st-empty{background:#fff!important;color:#D0D8E2!important}
#roster-admin-root .rx-st-present{background:rgba(45,220,150,.18)!important;color:#0F6F46!important}
#roster-admin-root .rx-st-wfh{background:rgba(155,89,182,.16)!important;color:#6D2D8A!important}
#roster-admin-root .rx-st-on_duty{background:rgba(244,137,31,.16)!important;color:#B25C0E!important}
#roster-admin-root .rx-st-off{background:rgba(148,163,184,.16)!important;color:#475569!important}
#roster-admin-root .rx-st-holiday{background:rgba(244,114,182,.16)!important;color:#A1265B!important}
#roster-admin-root .rx-st-pl{background:rgba(33,170,224,.16)!important;color:#1A6FA0!important}
#roster-admin-root .rx-st-hd_pl{background:rgba(107,196,232,.18)!important;color:#1A6FA0!important}
#roster-admin-root .rx-st-upl{background:rgba(237,102,107,.16)!important;color:#B33438!important}
#roster-admin-root .rx-st-hd_upl{background:rgba(237,102,107,.08)!important;color:#B33438!important}
#roster-admin-root .rx-st-sl{background:rgba(251,200,75,.18)!important;color:#8C5800!important}
#roster-admin-root .rx-st-hd_sl{background:rgba(251,200,75,.08)!important;color:#8C5800!important}
#roster-admin-root .rx-st-ncns{background:#DC2626!important;color:#fff!important}
#roster-admin-root .rx-st-absent{background:rgba(220,38,38,.13)!important;color:#B33438!important}
#roster-admin-root .rx-st-relieved{background:rgba(100,116,139,.13)!important;color:#475569!important;text-decoration:line-through!important}
#roster-admin-root .rx-st-na{background:#F0F3F6!important;color:#9BAFC0!important}
#roster-admin-root .rx-td-tot{background:#F7F9FB!important;color:#3A5068!important;font-weight:700!important;font-size:11.5px!important;text-align:center!important;border-bottom:1px solid #F0F3F6!important;border-right:1px solid #E6ECF4!important;font-family:'JetBrains Mono',monospace!important;padding:0 4px!important;white-space:nowrap!important}
#roster-admin-root .rx-tot-p{color:#0F6F46!important;font-weight:800!important}
#roster-admin-root .rx-tot-wfh{color:#6D2D8A!important}
#roster-admin-root .rx-tot-od{color:#B25C0E!important}
#roster-admin-root .rx-tot-pl{color:#1A6FA0!important}
#roster-admin-root .rx-tot-upl{color:#B33438!important}
#roster-admin-root .rx-tot-sl{color:#8C5800!important}
#roster-admin-root .rx-tot-ncns{color:#fff!important;background:#DC2626!important;font-size:9.5px!important}
#roster-admin-root .rx-td-att{background:rgba(33,170,224,.06)!important}
#roster-admin-root .rx-att-pct{display:inline-block!important;padding:2px 7px!important;border-radius:50px!important;font-size:10px!important;font-weight:800!important}
#roster-admin-root .rx-att-good{background:rgba(45,220,150,.22)!important;color:#0F6F46!important}
#roster-admin-root .rx-att-mid{background:rgba(251,200,75,.24)!important;color:#8C5800!important}
#roster-admin-root .rx-att-low{background:rgba(237,102,107,.22)!important;color:#B33438!important}
#roster-admin-root .rx-shift-row{background:transparent!important}
#roster-admin-root .rx-shift-header{padding:6px 16px!important;background:#EEF1F5!important;border-top:1px solid #DEE1E6!important;border-bottom:1px solid #DEE1E6!important;font-size:10px!important;font-weight:800!important;color:#6B849A!important;text-transform:uppercase!important;letter-spacing:.07em!important}
#roster-admin-root .rx-shift-dot{display:inline-block!important;width:7px!important;height:7px!important;border-radius:50%!important;background:#F4891F!important;margin-right:6px!important;vertical-align:middle!important}
#roster-admin-root .rx-shift-count{margin-left:8px!important;font-weight:600!important;color:#9BAFC0!important;font-size:9.5px!important}
#roster-admin-root .rx-cov-row{background:#072B40!important}
#roster-admin-root .rx-cov-row .rx-td-name.rx-cov-label{background:#0D3D5C!important;border-right:2px solid rgba(255,255,255,.12)!important;border-bottom:none!important}
#roster-admin-root .rx-cov-row .rx-cov-label .rx-name{color:#fff!important;font-size:11px!important;text-transform:uppercase!important;letter-spacing:.05em!important}
#roster-admin-root .rx-cov-row .rx-cov-label .rx-meta{color:rgba(255,255,255,.4)!important}
#roster-admin-root .rx-cov-cell{text-align:center!important;vertical-align:middle!important;padding:5px 2px!important;border-right:1px solid rgba(255,255,255,.06)!important;border-bottom:none!important;cursor:default!important}
#roster-admin-root .rx-cov-cell.rx-week-end{border-right:2px solid rgba(255,255,255,.18)!important}
#roster-admin-root .rx-cov-num{display:block!important;font-size:12px!important;font-weight:800!important;font-family:'JetBrains Mono',monospace!important;color:#fff!important}
#roster-admin-root .rx-cov-pct{display:block!important;font-size:8.5px!important;font-weight:600!important;margin-top:1px!important}
#roster-admin-root .rx-cov-cell.rx-cov-good .rx-cov-pct{color:#2DDC96!important}
#roster-admin-root .rx-cov-cell.rx-cov-mid .rx-cov-pct{color:#FBC84B!important}
#roster-admin-root .rx-cov-cell.rx-cov-low .rx-cov-pct{color:#ED666B!important}
#roster-admin-root .rx-cov-cell.rx-cov-none .rx-cov-num{color:rgba(255,255,255,.25)!important}
#roster-admin-root .rx-cov-row .rx-td-tot{background:#0D3D5C!important;border-bottom:none!important;color:rgba(255,255,255,.25)!important}
#roster-admin-root .rx-footer{display:flex!important;align-items:center!important;gap:10px!important;padding:9px 14px!important;font-size:11.5px!important;color:#6B849A!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:12px!important;box-shadow:0 1px 3px rgba(7,43,64,.04)!important}
#roster-admin-root .rx-foot-stat{padding:3px 10px!important;background:#F7F9FB!important;border:1px solid #E6ECF4!important;border-radius:50px!important;font-weight:600!important;font-size:11px!important}
#roster-admin-root .rx-foot-flex{flex:1!important}
#roster-admin-root .rx-save-state{font-size:11px!important;font-weight:700!important;padding:4px 11px!important;border-radius:50px!important}
#roster-admin-root .rx-save-state.rx-save-saving{background:rgba(33,170,224,.14)!important;color:#1A6FA0!important}
#roster-admin-root .rx-save-state.rx-save-ok{background:rgba(45,220,150,.14)!important;color:#0F6F46!important}
#roster-admin-root .rx-save-state.rx-save-err{background:rgba(237,102,107,.14)!important;color:#B33438!important}
#roster-admin-root .rx-empty-card{max-width:560px!important;margin:50px auto!important;padding:48px 36px!important;text-align:center!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:20px!important;box-shadow:0 16px 48px rgba(7,43,64,.09)!important}
#roster-admin-root .rx-empty-ico{font-size:54px!important;margin-bottom:14px!important;display:block!important}
#roster-admin-root .rx-empty-title{font-size:20px!important;font-weight:800!important;color:#072B40!important;margin-bottom:8px!important;display:block!important}
#roster-admin-root .rx-empty-sub{font-size:13.5px!important;color:#6B849A!important;line-height:1.6!important;margin-bottom:24px!important;display:block!important}
#roster-admin-root .rx-empty-actions{display:flex!important;gap:10px!important;justify-content:center!important;flex-wrap:wrap!important}
.rx-popover{position:fixed!important;z-index:9700!important;width:310px!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:14px!important;box-shadow:0 24px 60px rgba(7,43,64,.22)!important;overflow:hidden!important;font-family:'Poppins',sans-serif!important;animation:rx-pop-in .14s ease-out!important}
@keyframes rx-pop-in{from{opacity:0;transform:translateY(-5px) scale(.96)}to{opacity:1;transform:none}}
.rx-pop-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:10px 14px!important;background:linear-gradient(135deg,#072B40,#0D3D5C)!important;color:#fff!important;font-size:12px!important;font-weight:700!important}
.rx-pop-date{font-size:10px!important;opacity:.7!important;font-family:'JetBrains Mono',monospace!important}
.rx-pop-body{padding:10px 12px!important;max-height:320px!important;overflow-y:auto!important}
.rx-pop-group-label{font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.08em!important;color:#9BAFC0!important;margin:8px 0 4px!important;display:block!important}
.rx-pop-group{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:5px!important}
.rx-pop-opt{display:flex!important;flex-direction:column!important;align-items:center!important;gap:3px!important;padding:7px 4px!important;border:1px solid #E6ECF4!important;border-radius:8px!important;background:#fff!important;cursor:pointer!important;font-family:inherit!important;transition:all .12s!important;text-align:center!important}
.rx-pop-opt:hover{transform:translateY(-2px)!important;box-shadow:0 4px 12px rgba(7,43,64,.1)!important;border-color:#F4891F!important;background:#FFF9F4!important}
.rx-pop-code{font-family:'JetBrains Mono',monospace!important;font-weight:800!important;padding:3px 7px!important;border-radius:5px!important;font-size:10px!important;display:block!important;width:100%!important;text-align:center!important}
.rx-pop-opt.rx-st-present .rx-pop-code{background:rgba(45,220,150,.22)!important;color:#0F6F46!important}
.rx-pop-opt.rx-st-wfh .rx-pop-code{background:rgba(155,89,182,.22)!important;color:#6D2D8A!important}
.rx-pop-opt.rx-st-on_duty .rx-pop-code{background:rgba(244,137,31,.22)!important;color:#B25C0E!important}
.rx-pop-opt.rx-st-off .rx-pop-code{background:rgba(148,163,184,.24)!important;color:#475569!important}
.rx-pop-opt.rx-st-pl .rx-pop-code{background:rgba(33,170,224,.22)!important;color:#1A6FA0!important}
.rx-pop-opt.rx-st-upl .rx-pop-code{background:rgba(237,102,107,.22)!important;color:#B33438!important}
.rx-pop-opt.rx-st-sl .rx-pop-code{background:rgba(251,200,75,.26)!important;color:#8C5800!important}
.rx-pop-opt.rx-st-ncns .rx-pop-code{background:#DC2626!important;color:#fff!important}
.rx-pop-name{font-size:9px!important;color:#6B849A!important}
.rx-pop-foot{padding:9px 12px!important;display:flex!important;gap:8px!important;justify-content:space-between!important;background:#F7F9FB!important;border-top:1px solid #E6ECF4!important}
.rx-pop-clear{font-size:11.5px!important;font-weight:700!important;color:#ED666B!important;border:1px solid rgba(237,102,107,.3)!important;background:transparent!important;border-radius:7px!important;padding:5px 10px!important;cursor:pointer!important;font-family:inherit!important}
.rx-pop-close{font-size:11.5px!important;font-weight:600!important;color:#6B849A!important;border:1px solid #DEE1E6!important;background:#fff!important;border-radius:7px!important;padding:5px 10px!important;cursor:pointer!important;font-family:inherit!important}
.rx-modal-bg{position:fixed!important;inset:0!important;z-index:9600!important;background:rgba(7,43,64,.6)!important;backdrop-filter:blur(7px)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important;animation:rx-fade .18s ease!important}
.rx-modal{background:#fff!important;border-radius:18px!important;width:100%!important;max-width:500px!important;box-shadow:0 32px 80px rgba(0,0,0,.36)!important;font-family:'Poppins',sans-serif!important;overflow:hidden!important}
.rx-modal-wide{max-width:860px!important}
.rx-modal-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:18px 22px!important;background:linear-gradient(135deg,#072B40,#0D3D5C)!important;color:#fff!important}
.rx-modal-title{font-size:15px!important;font-weight:700!important}
.rx-modal-x{background:rgba(255,255,255,.12)!important;border:none!important;color:#fff!important;width:30px!important;height:30px!important;border-radius:50%!important;font-size:18px!important;cursor:pointer!important;line-height:1!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
.rx-modal-body{padding:20px 22px!important;max-height:64vh!important;overflow-y:auto!important}
.rx-modal-foot{padding:14px 22px!important;background:#F7F9FB!important;display:flex!important;gap:8px!important;justify-content:flex-end!important;border-top:1px solid #E6ECF4!important}
.rx-form{display:flex!important;align-items:center!important;gap:12px!important;margin-bottom:12px!important}
.rx-form label{flex:0 0 115px!important;font-size:12px!important;font-weight:700!important;color:#3A5068!important}
.rx-form input,.rx-form select{flex:1!important;padding:9px 12px!important;border:1px solid #DEE1E6!important;border-radius:9px!important;font-size:12.5px!important;color:#072B40!important;font-family:inherit!important;outline:none!important;background:#fff!important}
.rx-form input:focus,.rx-form select:focus{border-color:#F4891F!important;box-shadow:0 0 0 3px rgba(244,137,31,.14)!important}
.rx-audit-tbl{width:100%!important;border-collapse:collapse!important;font-size:11.5px!important}
.rx-audit-tbl th{text-align:left!important;padding:9px 12px!important;background:#F7F9FB!important;color:#6B849A!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.04em!important;font-size:9.5px!important;border-bottom:1px solid #E6ECF4!important}
.rx-audit-tbl td{padding:9px 12px!important;border-bottom:1px solid #F4F5F7!important;color:#3A5068!important}
/* Bulk action bar */
#roster-admin-root .rx-bulk-bar{display:flex!important;align-items:center!important;gap:10px!important;padding:10px 16px!important;background:linear-gradient(135deg,#072B40,#0D3D5C)!important;border-radius:12px!important;flex-wrap:wrap!important}
#roster-admin-root .rx-bulk-count{color:#fff!important;font-weight:700!important;font-size:12.5px!important;white-space:nowrap!important;flex-shrink:0!important}
#roster-admin-root .rx-bulk-actions{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;flex:1!important}
#roster-admin-root .rx-bulk-sel{height:32px!important;padding:0 10px!important;border:1px solid rgba(255,255,255,.25)!important;border-radius:8px!important;background:rgba(255,255,255,.1)!important;color:#fff!important;font-size:12px!important;font-family:'Poppins',sans-serif!important;outline:none!important;cursor:pointer!important}
#roster-admin-root .rx-bulk-sel option{background:#072B40!important;color:#fff!important}
#roster-admin-root .rx-bulk-date{height:32px!important;padding:0 10px!important;border:1px solid rgba(255,255,255,.25)!important;border-radius:8px!important;background:rgba(255,255,255,.1)!important;color:#fff!important;font-size:12px!important;font-family:'Poppins',sans-serif!important;outline:none!important;cursor:pointer!important;color-scheme:dark!important}
#roster-admin-root .rx-bulk-btn{height:32px!important;padding:0 14px!important;border-radius:8px!important;border:1px solid rgba(255,255,255,.3)!important;background:rgba(255,255,255,.12)!important;color:#fff!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important;font-family:inherit!important;white-space:nowrap!important;transition:all .15s!important}
#roster-admin-root .rx-bulk-btn:hover{background:rgba(255,255,255,.22)!important}
#roster-admin-root .rx-bulk-btn-primary{background:#F4891F!important;border-color:#F4891F!important}
#roster-admin-root .rx-bulk-btn-primary:hover{background:#e07a17!important}
#roster-admin-root .rx-bulk-btn-danger{background:rgba(237,102,107,.3)!important;border-color:rgba(237,102,107,.5)!important}
#roster-admin-root .rx-bulk-btn-danger:hover{background:rgba(237,102,107,.5)!important}
#roster-admin-root .rx-bulk-sep{width:1px!important;height:24px!important;background:rgba(255,255,255,.2)!important;flex-shrink:0!important}
/* Summary section */
#roster-admin-root .rx-summary-wrap{background:#fff!important;border:1px solid #E2E8F0!important;border-radius:14px!important;overflow:hidden!important;box-shadow:0 2px 8px rgba(7,43,64,.06)!important}
#roster-admin-root .rx-summary-toggle{display:flex!important;align-items:center!important;gap:8px!important;padding:13px 18px!important;font-size:13px!important;font-weight:700!important;color:#3A5068!important;cursor:pointer!important;list-style:none!important;border-bottom:1px solid transparent!important;transition:background .12s!important}
#roster-admin-root .rx-summary-wrap[open] .rx-summary-toggle{border-bottom-color:#E2E8F0!important;background:#F7F9FB!important}
#roster-admin-root .rx-summary-toggle::-webkit-details-marker{display:none!important}
#roster-admin-root .rx-summary-scroll{overflow-x:auto!important;max-height:360px!important;overflow-y:auto!important}
#roster-admin-root .rx-summary-tbl{width:100%!important;border-collapse:separate!important;border-spacing:0!important;font-size:12px!important}
#roster-admin-root .rx-sth{position:sticky!important;top:0!important;background:#F7F9FB!important;padding:8px 10px!important;font-size:9.5px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.06em!important;color:#6B849A!important;border-bottom:2px solid #E2E8F0!important;text-align:center!important;white-space:nowrap!important}
#roster-admin-root .rx-sth-name{text-align:left!important;position:sticky!important;left:0!important;z-index:4!important;min-width:220px!important}
#roster-admin-root .rx-srow:nth-child(even){background:#F9FAFB!important}
#roster-admin-root .rx-srow:hover{background:rgba(244,137,31,.05)!important}
#roster-admin-root .rx-std-name{position:sticky!important;left:0!important;background:#fff!important;padding:8px 14px!important;border-bottom:1px solid #F0F3F6!important;z-index:2!important}
#roster-admin-root .rx-srow:nth-child(even) .rx-std-name{background:#F9FAFB!important}
#roster-admin-root .rx-std{text-align:center!important;padding:8px 6px!important;border-bottom:1px solid #F0F3F6!important;vertical-align:middle!important}
#roster-admin-root .rx-avatar-sm{width:24px!important;height:24px!important;font-size:8.5px!important}
/* Avatar + name row */
#roster-admin-root .rx-name-row{display:flex!important;align-items:center!important;gap:9px!important}
#roster-admin-root .rx-avatar{width:30px!important;height:30px!important;border-radius:50%!important;flex-shrink:0!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:10.5px!important;font-weight:800!important;color:#fff!important;letter-spacing:.02em!important;text-shadow:0 1px 2px rgba(0,0,0,.2)!important}
#roster-admin-root .rx-name-info{min-width:0!important}
#roster-admin-root .rx-name-dot{display:inline-block!important;width:7px!important;height:7px!important;border-radius:50%!important;margin-right:5px!important;vertical-align:middle!important;flex-shrink:0!important}
#roster-admin-root .rx-dot-leave{background:#FBC84B!important}
#roster-admin-root .rx-dot-rel{background:#94A3B8!important}
/* On-leave row tint */
#roster-admin-root .rx-row-leave{background:rgba(251,200,75,.04)!important}
#roster-admin-root .rx-row-leave .rx-td-name{border-left:3px solid #FBC84B!important}
/* Today column — full column highlight */
#roster-admin-root .rx-cell.rx-t{background:rgba(33,170,224,.08)!important;box-shadow:inset 0 -3px 0 #21AAE0!important}
#roster-admin-root .rx-cell.rx-t.rx-st-present{background:rgba(45,220,150,.22)!important}
#roster-admin-root .rx-cell.rx-t.rx-st-wfh{background:rgba(155,89,182,.18)!important}
#roster-admin-root .rx-cell.rx-t.rx-st-off{background:rgba(148,163,184,.18)!important}
/* Taller cells */
#roster-admin-root .rx-cell{height:36px!important}
#roster-admin-root .rx-td-name{padding:10px 14px!important}
/* Stat pill badges */
#roster-admin-root .rx-stat-nil{color:#C8D4DF!important;font-size:11px!important}
#roster-admin-root .rx-stat-p,#roster-admin-root .rx-stat-wfh,#roster-admin-root .rx-stat-od,#roster-admin-root .rx-stat-off,#roster-admin-root .rx-stat-pl,#roster-admin-root .rx-stat-upl,#roster-admin-root .rx-stat-sl,#roster-admin-root .rx-stat-ncns{display:inline-block!important;min-width:22px!important;padding:1px 5px!important;border-radius:5px!important;font-weight:800!important;font-size:10.5px!important;font-family:'JetBrains Mono',monospace!important;text-align:center!important}
#roster-admin-root .rx-stat-p{background:rgba(45,220,150,.18)!important;color:#0F6F46!important}
#roster-admin-root .rx-stat-wfh{background:rgba(155,89,182,.16)!important;color:#6D2D8A!important}
#roster-admin-root .rx-stat-od{background:rgba(244,137,31,.16)!important;color:#B25C0E!important}
#roster-admin-root .rx-stat-off{background:rgba(148,163,184,.16)!important;color:#475569!important}
#roster-admin-root .rx-stat-pl{background:rgba(33,170,224,.16)!important;color:#1A6FA0!important}
#roster-admin-root .rx-stat-upl{background:rgba(237,102,107,.16)!important;color:#B33438!important}
#roster-admin-root .rx-stat-sl{background:rgba(251,200,75,.22)!important;color:#8C5800!important}
#roster-admin-root .rx-stat-ncns{background:#DC2626!important;color:#fff!important}
/* Wider name column */
#roster-admin-root .rx-th-name{min-width:260px!important}
#roster-admin-root .rx-td-name{min-width:260px!important}
@media(max-width:900px){#roster-admin-root .rx-kpis{grid-template-columns:repeat(2,1fr)!important}#roster-admin-root .rx-toolbar{flex-direction:column!important;align-items:stretch!important}}
.rx-agent-ctx{position:fixed!important;z-index:9800!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:12px!important;box-shadow:0 12px 40px rgba(7,43,64,.18)!important;min-width:220px!important;overflow:hidden!important;animation:rx-pop-in .12s ease-out!important;font-family:'Poppins',sans-serif!important}
.rx-agent-ctx-header{padding:10px 14px 8px!important;border-bottom:1px solid #F0F3F6!important;background:#F7F9FB!important}
.rx-agent-ctx-name{font-size:12px!important;font-weight:700!important;color:#072B40!important;display:block!important}
.rx-agent-ctx-id{font-size:10px!important;color:#9BAFC0!important;font-family:'JetBrains Mono',monospace!important;display:block!important;margin-top:1px!important}
.rx-agent-ctx-status{display:inline-block!important;padding:1px 7px!important;border-radius:50px!important;font-size:9.5px!important;font-weight:700!important;margin-top:4px!important}
.rx-agent-ctx-status.s-active{background:rgba(45,220,150,.18)!important;color:#0F6F46!important}
.rx-agent-ctx-status.s-relieved{background:rgba(148,163,184,.2)!important;color:#475569!important}
.rx-agent-ctx-status.s-on_leave{background:rgba(251,200,75,.22)!important;color:#8C5800!important}
.rx-agent-ctx-body{padding:6px!important}
.rx-agent-ctx-item{display:flex!important;align-items:center!important;gap:10px!important;padding:8px 10px!important;border-radius:8px!important;cursor:pointer!important;font-size:12.5px!important;color:#3A5068!important;border:none!important;background:transparent!important;width:100%!important;text-align:left!important;font-family:inherit!important;transition:background .1s!important}
.rx-agent-ctx-item:hover{background:#F4F7FA!important;color:#072B40!important}
.rx-agent-ctx-item.rx-ctx-danger:hover{background:rgba(237,102,107,.08)!important;color:#B33438!important}
.rx-agent-ctx-item.rx-ctx-success:hover{background:rgba(45,220,150,.1)!important;color:#0F6F46!important}
.rx-agent-ctx-icon{font-size:14px!important;width:20px!important;text-align:center!important;flex-shrink:0!important}
.rx-agent-ctx-sep{height:1px!important;background:#F0F3F6!important;margin:4px 0!important}
/* Quick-pick bar (left-click on cell) */
.rx-qp{position:fixed!important;z-index:9750!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:12px!important;box-shadow:0 8px 28px rgba(7,43,64,.18)!important;display:flex!important;align-items:center!important;gap:3px!important;padding:6px!important;font-family:'Poppins',sans-serif!important;animation:rx-pop-in .1s ease-out!important}
.rx-qp-btn{display:flex!important;flex-direction:column!important;align-items:center!important;gap:2px!important;padding:6px 8px!important;border:1px solid #E6ECF4!important;border-radius:8px!important;background:#fff!important;cursor:pointer!important;min-width:42px!important;font-family:inherit!important;transition:all .1s!important}
.rx-qp-btn:hover{transform:translateY(-2px)!important;box-shadow:0 4px 10px rgba(7,43,64,.1)!important;border-color:#F4891F!important}
.rx-qp-btn.rx-qp-active{border-color:#F4891F!important;box-shadow:0 0 0 2px rgba(244,137,31,.2)!important}
.rx-qp-code{font-family:'JetBrains Mono',monospace!important;font-weight:800!important;font-size:10px!important;padding:2px 5px!important;border-radius:4px!important;display:block!important}
.rx-qp-lbl{font-size:8.5px!important;color:#9BAFC0!important;white-space:nowrap!important}
.rx-qp-sep{width:1px!important;height:36px!important;background:#F0F3F6!important;margin:0 2px!important}
.rx-qp-clear{display:flex!important;align-items:center!important;justify-content:center!important;width:32px!important;height:32px!important;border:1px solid rgba(237,102,107,.3)!important;border-radius:8px!important;background:transparent!important;cursor:pointer!important;color:#ED666B!important;font-size:14px!important;font-weight:700!important;font-family:inherit!important;transition:all .1s!important}
.rx-qp-clear:hover{background:rgba(237,102,107,.08)!important}
.rx-qp-btn.rx-st-present .rx-qp-code{background:rgba(45,220,150,.22)!important;color:#0F6F46!important}
.rx-qp-btn.rx-st-wfh .rx-qp-code{background:rgba(155,89,182,.22)!important;color:#6D2D8A!important}
.rx-qp-btn.rx-st-on_duty .rx-qp-code{background:rgba(244,137,31,.22)!important;color:#B25C0E!important}
.rx-qp-btn.rx-st-off .rx-qp-code{background:rgba(148,163,184,.24)!important;color:#475569!important}
.rx-qp-btn.rx-st-pl .rx-qp-code{background:rgba(33,170,224,.22)!important;color:#1A6FA0!important}
.rx-qp-btn.rx-st-upl .rx-qp-code{background:rgba(237,102,107,.22)!important;color:#B33438!important}
.rx-qp-btn.rx-st-sl .rx-qp-code{background:rgba(251,200,75,.26)!important;color:#8C5800!important}
.rx-qp-btn.rx-st-ncns .rx-qp-code{background:#DC2626!important;color:#fff!important}
.rx-qp-btn.rx-st-holiday .rx-qp-code{background:rgba(244,114,182,.22)!important;color:#A1265B!important}
/* Table alignment fixes */
#roster-admin-root .rx-name{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:180px!important}
#roster-admin-root .rx-meta{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:180px!important}
#roster-admin-root .rx-avatar{min-width:30px!important}
#roster-admin-root .rx-td-tot{vertical-align:middle!important;text-align:center!important}
#roster-admin-root .rx-grid tbody tr{height:40px!important}

/* ── FUTURISTIC VISUAL UPGRADES v1.19 ───────────────────────────────── */

/* Keyframes */
@keyframes rx-row-in{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
@keyframes rx-cell-pop{0%{transform:scale(0.6);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
@keyframes rx-kpi-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes rx-today-pulse{0%,100%{box-shadow:inset 0 0 0 1px rgba(33,170,224,.4)}50%{box-shadow:inset 0 0 0 1px rgba(33,170,224,.9),0 0 12px rgba(33,170,224,.2)}}
@keyframes rx-glow-border{0%,100%{border-color:rgba(244,137,31,.25)}50%{border-color:rgba(244,137,31,.7)}}
@keyframes rx-avatar-in{from{transform:scale(0.5) rotate(-15deg);opacity:0}to{transform:scale(1) rotate(0deg);opacity:1}}
@keyframes rx-badge-in{from{transform:scale(0.4);opacity:0}to{transform:scale(1);opacity:1}}

/* ── Grid wrapper — frosted glass with subtle glow ── */
#roster-admin-root .rx-grid-wrap{
  border:1px solid rgba(33,170,224,.15)!important;
  box-shadow:0 4px 24px rgba(7,43,64,.09),0 0 0 1px rgba(244,137,31,.04)!important;
  border-radius:16px!important;
}

/* ── Row entrance animation — stagger each row ── */
#roster-admin-root .rx-grid tbody .rx-row{
  animation:rx-row-in .32s cubic-bezier(.22,1,.36,1) both!important;
}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(1){animation-delay:.02s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(2){animation-delay:.05s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(3){animation-delay:.08s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(4){animation-delay:.11s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(5){animation-delay:.14s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(6){animation-delay:.17s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(7){animation-delay:.20s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(8){animation-delay:.23s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(9){animation-delay:.26s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(10){animation-delay:.29s!important}
#roster-admin-root .rx-grid tbody .rx-row:nth-child(n+11){animation-delay:.32s!important}

/* ── Taller, more breathable rows ── */
#roster-admin-root .rx-cell{
  height:40px!important;
  transition:background .18s,box-shadow .18s!important;
}

/* ── Cell hover — glowing ring, no jarring scale ── */
#roster-admin-root .rx-cell:hover{
  transform:none!important;
  background:rgba(244,137,31,.10)!important;
  box-shadow:inset 0 0 0 2px #F4891F,inset 0 0 8px rgba(244,137,31,.18)!important;
  border-radius:6px!important;
  z-index:3!important;
  position:relative!important;
}

/* ── Status cell — soft inner glow matching status color ── */
#roster-admin-root .rx-st-present{
  background:rgba(45,220,150,.18)!important;
  box-shadow:inset 0 0 0 1px rgba(45,220,150,.35)!important;
}
#roster-admin-root .rx-st-wfh{
  background:rgba(155,89,182,.16)!important;
  box-shadow:inset 0 0 0 1px rgba(155,89,182,.3)!important;
}
#roster-admin-root .rx-st-on_duty{
  background:rgba(244,137,31,.16)!important;
  box-shadow:inset 0 0 0 1px rgba(244,137,31,.3)!important;
}
#roster-admin-root .rx-st-pl{
  background:rgba(33,170,224,.16)!important;
  box-shadow:inset 0 0 0 1px rgba(33,170,224,.3)!important;
}
#roster-admin-root .rx-st-sl{
  background:rgba(251,200,75,.18)!important;
  box-shadow:inset 0 0 0 1px rgba(251,200,75,.35)!important;
}
#roster-admin-root .rx-st-upl{
  background:rgba(237,102,107,.16)!important;
  box-shadow:inset 0 0 0 1px rgba(237,102,107,.3)!important;
}
#roster-admin-root .rx-st-ncns{
  background:#DC2626!important;
  box-shadow:inset 0 0 0 1px #B91C1C,0 0 8px rgba(220,38,38,.3)!important;
}
#roster-admin-root .rx-st-off{
  background:rgba(148,163,184,.16)!important;
  box-shadow:inset 0 0 0 1px rgba(148,163,184,.3)!important;
}

/* ── Today column — pulsing teal accent ── */
#roster-admin-root .rx-cell.rx-t{
  background:rgba(33,170,224,.10)!important;
  animation:rx-today-pulse 3s ease-in-out infinite!important;
}
#roster-admin-root .rx-cell.rx-t:hover{
  animation:none!important;
  background:rgba(244,137,31,.10)!important;
  box-shadow:inset 0 0 0 2px #F4891F!important;
}
/* Override: today + status keep status color */
#roster-admin-root .rx-cell.rx-t.rx-st-present{background:rgba(45,220,150,.25)!important;animation:none!important}
#roster-admin-root .rx-cell.rx-t.rx-st-wfh{background:rgba(155,89,182,.22)!important;animation:none!important}
#roster-admin-root .rx-cell.rx-t.rx-st-off{background:rgba(148,163,184,.22)!important;animation:none!important}
#roster-admin-root .rx-cell.rx-t.rx-st-pl{background:rgba(33,170,224,.24)!important;animation:none!important}
#roster-admin-root .rx-cell.rx-t.rx-st-sl{background:rgba(251,200,75,.24)!important;animation:none!important}
#roster-admin-root .rx-cell.rx-t.rx-st-ncns{background:#DC2626!important;animation:none!important}

/* ── Weekend column warmth ── */
#roster-admin-root .rx-cell.rx-w{
  background:rgba(178,92,14,.07)!important;
}

/* ── Row hover — full-row orange wash + name highlight ── */
#roster-admin-root .rx-row:hover{
  background:rgba(244,137,31,.05)!important;
}
#roster-admin-root .rx-row:hover .rx-td-name{
  background:linear-gradient(135deg,rgba(244,137,31,.06),rgba(244,137,31,.02))!important;
  border-left:3px solid #F4891F!important;
}

/* ── Avatar — bigger, with ring + entrance animation ── */
#roster-admin-root .rx-avatar{
  width:34px!important;height:34px!important;
  font-size:11px!important;
  box-shadow:0 0 0 2px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.15)!important;
  animation:rx-avatar-in .35s cubic-bezier(.22,1,.36,1) both!important;
  transition:box-shadow .18s,transform .18s!important;
}
#roster-admin-root .rx-row:hover .rx-avatar{
  box-shadow:0 0 0 2px #F4891F,0 4px 12px rgba(244,137,31,.25)!important;
  transform:scale(1.08)!important;
}

/* ── Agent name — more weight ── */
#roster-admin-root .rx-name{
  font-size:12.5px!important;
  font-weight:700!important;
  letter-spacing:-.01em!important;
}
#roster-admin-root .rx-meta{
  font-size:9px!important;
  letter-spacing:.01em!important;
  opacity:.75!important;
}

/* ── ATT% badge — animated progress pill ── */
#roster-admin-root .rx-att-pct{
  position:relative!important;
  overflow:hidden!important;
  transition:box-shadow .18s,transform .18s!important;
}
#roster-admin-root .rx-att-pct::after{
  content:''!important;position:absolute!important;
  inset:0!important;
  background:linear-gradient(90deg,transparent 30%,rgba(255,255,255,.4) 50%,transparent 70%)!important;
  background-size:200% 100%!important;
  animation:rx-kpi-shimmer 2.4s ease-in-out infinite!important;
  pointer-events:none!important;
}
#roster-admin-root .rx-row:hover .rx-att-pct{
  transform:scale(1.07)!important;
  box-shadow:0 0 0 2px currentColor!important;
}

/* ── KPI cards — hover glow + animated left accent bar ── */
#roster-admin-root .rx-kpi{
  transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s!important;
}
#roster-admin-root .rx-kpi:hover{
  transform:translateY(-4px)!important;
  box-shadow:0 12px 32px rgba(7,43,64,.12)!important;
}
#roster-admin-root .rx-kpi::after{
  content:''!important;position:absolute!important;
  inset:0!important;border-radius:14px!important;
  background:linear-gradient(90deg,transparent 60%,rgba(255,255,255,.5) 80%,transparent 100%)!important;
  background-size:200% 100%!important;
  animation:rx-kpi-shimmer 3.5s ease-in-out infinite!important;
  pointer-events:none!important;opacity:.6!important;
}

/* KPI value pop-in */
#roster-admin-root .rx-kpi-val{
  animation:rx-cell-pop .4s cubic-bezier(.22,1,.36,1) both!important;
  animation-delay:.1s!important;
}

/* ── Header row — sharper with gradient ── */
#roster-admin-root .rx-grid thead .rx-th{
  background:linear-gradient(180deg,#0D3D5C,#072B40)!important;
  font-size:9px!important;
  letter-spacing:.06em!important;
}
#roster-admin-root .rx-th-day:hover{
  background:rgba(244,137,31,.25)!important;
  transition:background .15s!important;
}

/* ── Day header today — glowing teal top border ── */
#roster-admin-root .rx-th-day.rx-t{
  background:rgba(33,170,224,.18)!important;
  border-top:2px solid #21AAE0!important;
  box-shadow:0 0 12px rgba(33,170,224,.2)!important;
}

/* ── Toolbar — subtle gradient surface ── */
#roster-admin-root .rx-toolbar{
  background:linear-gradient(135deg,#ffffff,#F9FAFB)!important;
  border-color:rgba(33,170,224,.12)!important;
}

/* ── Legend — airy ── */
#roster-admin-root .rx-legend{
  border-color:rgba(33,170,224,.1)!important;
  background:linear-gradient(135deg,#fff,#F9FBFC)!important;
}

/* ── Shift header divider — glowing line ── */
#roster-admin-root .rx-shift-header{
  background:linear-gradient(90deg,#EEF1F5,#F4F7FA)!important;
  border-top:1px solid rgba(33,170,224,.15)!important;
  border-bottom:1px solid rgba(33,170,224,.08)!important;
  letter-spacing:.1em!important;
}

/* ── Coverage row — deeper dark with glow ── */
#roster-admin-root .rx-cov-row{
  background:linear-gradient(135deg,#072B40,#082332)!important;
}
#roster-admin-root .rx-cov-cell.rx-cov-good .rx-cov-num{
  text-shadow:0 0 10px rgba(45,220,150,.5)!important;
}
#roster-admin-root .rx-cov-cell.rx-cov-low .rx-cov-num{
  text-shadow:0 0 10px rgba(237,102,107,.5)!important;
}

/* ── Cell status pop-in (class applied dynamically) ── */
#roster-admin-root .rx-cell.rx-just-set{
  animation:rx-cell-pop .28s cubic-bezier(.22,1,.36,1) both!important;
}

/* ── Bulk bar — animated reveal with glow ── */
#roster-admin-root .rx-bulk-bar{
  box-shadow:0 8px 24px rgba(7,43,64,.25),0 0 0 1px rgba(244,137,31,.3)!important;
  animation:rx-row-in .24s cubic-bezier(.22,1,.36,1) both!important;
}

/* ── Quick-pick popup — larger, more polished ── */
.rx-qp{
  box-shadow:0 12px 40px rgba(7,43,64,.22),0 0 0 1px rgba(33,170,224,.15)!important;
  border-radius:14px!important;
  padding:8px!important;
}
.rx-qp-btn:hover{
  transform:translateY(-3px) scale(1.05)!important;
  box-shadow:0 6px 16px rgba(7,43,64,.12)!important;
  border-color:#F4891F!important;
}

/* ── Summary panel ── */
#roster-admin-root .rx-summary-wrap{
  border-color:rgba(33,170,224,.12)!important;
  box-shadow:0 2px 12px rgba(7,43,64,.07),0 0 0 1px rgba(244,137,31,.04)!important;
}

/* Accessibility — honour prefers-reduced-motion */
@media(prefers-reduced-motion:reduce){
  #roster-admin-root .rx-grid tbody .rx-row,
  #roster-admin-root .rx-kpi-val,
  #roster-admin-root .rx-avatar,
  #roster-admin-root .rx-cell.rx-t,
  #roster-admin-root .rx-att-pct::after,
  #roster-admin-root .rx-kpi::after{
    animation:none!important;
    transition:none!important;
  }
}
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
    { s: 'present',  label: 'P',    name: 'Present'    },
    { s: 'wfh',      label: 'WFH',  name: 'WFH'        },
    { s: 'on_duty',  label: 'OD',   name: 'On Duty'    },
    { s: 'off',      label: 'OFF',  name: 'Week Off'   },
    { s: 'holiday',  label: 'HOL',  name: 'Holiday'    },
    { s: 'pl',       label: 'PL',   name: 'Paid Leave' },
    { s: 'sl',       label: 'SL',   name: 'Sick Leave' },
    { s: 'upl',      label: 'UPL',  name: 'Unpaid'     },
    { s: 'ncns',     label: 'NCNS', name: 'No Show'    },
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

    const relievedCount = agents.filter(a => a.status === 'relieved').length;
    const activeAgents = agents.filter(a => a.status !== 'relieved');

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

  <!-- TOOLBAR -->
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
      <input type="text" id="rx-search" placeholder="Search agent, shift, designation…" value="${esc(_s.agentSearch)}">
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

  <!-- LEGEND -->
  <div class="rx-legend">
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

  <!-- GRID -->
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
      const tip = `${esc(a.pseudo || a.emp_id)} · ${d}${s ? ' · ' + STATUS_LONG[s] : ''}`;
      return `<td class="rx-cell rx-st-${s || 'empty'} ${isW ? 'rx-w' : ''} ${isT ? 'rx-t' : ''} ${isWeekEnd ? 'rx-week-end' : ''}"
        data-date="${d}" data-emp="${esc(a.emp_id)}" data-status="${s}"
        title="${tip}">${lbl}</td>`;
    }).join('');

    const attHtml = stats.pct !== null
      ? `<span class="rx-att-pct ${stats.pct >= 70 ? 'rx-att-good' : stats.pct >= 40 ? 'rx-att-mid' : 'rx-att-low'}">${stats.pct}%</span>`
      : '—';

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
      <td class="rx-td-tot rx-td-att">${attHtml}</td>
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

    const batchBtns = QUICK_PICK.map(({ s, label, name }) => `
      <button class="rx-qp-btn rx-st-${s} ${s === curStatus ? 'rx-qp-active' : ''}" data-s="${s}" title="${name}">
        <span class="rx-qp-code">${label}</span>
        <span class="rx-qp-lbl">${name}</span>
      </button>`).join('');

    qp.innerHTML = `${batchBtns}<div class="rx-qp-sep"></div><button class="rx-qp-clear" data-s="" title="Clear">✕</button>`;
    document.body.appendChild(qp);

    // Position below cell, inside viewport
    const rect = cell.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const qpW = qp.offsetWidth || 480, qpH = qp.offsetHeight || 70;
    let top = rect.bottom + 4;
    let left = rect.left + rect.width / 2 - qpW / 2;
    if (top + qpH > vh) top = rect.top - qpH - 4;
    if (left + qpW > vw - 8) left = vw - qpW - 8;
    if (left < 8) left = 8;
    qp.style.cssText = `top:${top}px;left:${left}px`;

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
    cell.textContent = STATUS_LABEL[status] || '';
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
