# Anomaly Detection UI (Session 7)

**Status:** In progress
**Builds on:** Session 6 (`docs/features/anomaly-detection.md`)
**Last updated:** 2026-05-27

## Goal

Turn the working-but-invisible Session 6 anomaly engine into a real supervisor
experience. After Session 7, admins get:

1. **Anomaly center dashboard** — severity-grouped list of detected anomalies
2. **Per-agent drill-down** — last 30 days of anomalies for one agent, with a sparkline
3. **Admin threshold form** — tune the 5 metric thresholds without curl
4. **Live toasts** — when anomalies fire (via SSE), supervisors get a toast immediately
5. **CSV export** for retrospective analysis

## Non-goals (Session 8+)

- Cross-agent correlation ("is the whole team off?")
- Predictive forecasting
- Per-supervisor mute / do-not-disturb
- Email/Slack delivery
- Mobile push notifications

## Architecture

```
                              anomaly-center.js
                              ──────────────────
                          window.AnomalyCenter
                          │
                          ├── open()             → dashboard modal
                          ├── drillDown(email)   → agent's anomaly history
                          ├── openThresholdAdmin() → threshold form
                          └── close()
                                  │
                                  │ fetch
                                  ▼
              ┌───────────────────────────────────────────┐
              │ Server endpoints from Session 6:          │
              │   GET  /api/anomalies/active              │
              │   GET  /api/anomalies/recent              │
              │   GET  /api/anomalies/agent/:email        │
              │   POST /api/anomalies/:id/ack             │
              │   GET  /api/anomaly/thresholds            │
              │   PUT  /api/anomaly/thresholds/:metric    │
              │   POST /api/admin/anomalies/run           │
              └───────────────────────────────────────────┘
                                  │
                                  │ also receives
                                  ▼
                  SSE channel: event=anomaly (new)
                  broadcast on every insertAnomalyEvent() success
```

## Components

### 1. Dashboard modal

Opens via `AnomalyCenter.open()`, status bar 📈 button, or `N` keyboard.

```
┌─ Anomaly Center ─────────────── 13 active · 7d  ✕ ─┐
│ ┌─ Filters ─────────────────────────────────────┐  │
│ │ Days [7▾] · Severity [All▾] · Metric [All▾]   │  │
│ │ [Show acked]  🔍 Search…  [📥 CSV] [🔧 Tune]   │  │
│ └───────────────────────────────────────────────┘  │
│                                                    │
│ ┌─ Critical (3) ─────────────────────────────────┐│
│ │ 🚨 Sarah Chen · daily_missed_calls             ││
│ │    today 18 (median 1, z=+12.1)                ││
│ │    ━━━━━━━━━━━━━━━━━━━━━━━━━━━ ●               ││
│ │    [Drill down]                  [Acknowledge] ││
│ └────────────────────────────────────────────────┘│
│                                                    │
│ … (warning section follows)                       │
└────────────────────────────────────────────────────┘
```

- Auto-grouped by severity (critical → warning → info)
- Per-row: agent, metric, today/median/z, sparkline
- Sparkline: horizontal track from min to max, with bands at ±threshold,
  the **today** marker (orange/red dot), and the **median** as a vertical line
- Footer counts + filter pills + drill-down / ack actions

### 2. Per-agent drill-down

```
┌─ Anomalies for Sarah Chen ────────── 30 days  ✕ ─┐
│  daily_missed_calls (4 events)                    │
│    May 27  18  ━━━━━━━━━━━━━━━━━━━━━━●  z=+12.1   │
│    May 26  16  ━━━━━━━━━━━━━━━━━━━●     z=+10.5   │
│    May 24   8  ━━━━━━━━━━━●              z=+5.3   │
│    May 20   6  ━━━━━━━━●                  z=+3.8  │
│                                                    │
│  daily_break_minutes (1 event)                    │
│    May 25  92  ━━━━━━━━━━━━━━━●          z=+4.2   │
└────────────────────────────────────────────────────┘
```

- Reads `/api/anomalies/agent/:email`
- Groups by metric, then chronological within metric
- Each row shows a sparkline of `[median ── ── today]` plus the z

### 3. Threshold admin form

Same shape as alert-center's threshold form. 5 cards (one per metric), each
with enable/disable toggle, z_threshold input, direction selector, lookback
days input, and Save/Reset buttons.

### 4. SSE live toasts

When the server fires `insertAnomalyEvent()` (whether via daily cron or
manual `/api/admin/anomalies/run`), it broadcasts `event: anomaly` with
the inserted row. The client surfaces a toast:

> 🔬 `daily_missed_calls` anomaly: Sarah Chen — today 18 (z=+12.1)

The bell on the AlertCenter does NOT update for anomalies (anomalies are
NOT alerts; different lifecycle, different mental model). They live in
their own dashboard.

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ `AnomalyCenter` global with stable 4-method API
2. ✅ Dashboard modal opens via API + keyboard + status bar button
3. ✅ Severity grouping in order critical → warning → info
4. ✅ Each row shows: agent, metric, today, median, z, sparkline
5. ✅ Acknowledge button removes row optimistically + persists
6. ✅ "Show acked" toggle includes acked rows in the list
7. ✅ Filters: days, severity, metric, search
8. ✅ CSV export of currently filtered rows
9. ✅ Drill-down modal renders agent's last 30 days grouped by metric
10. ✅ Threshold admin form renders 5 cards
11. ✅ Threshold save persists via PUT + audit log
12. ✅ "Run now" admin action triggers POST /api/admin/anomalies/run
13. ✅ SSE event=anomaly received → toast + dashboard refresh
14. ✅ Polling fallback every 60s when SSE unavailable
15. ✅ A11y: role=dialog, ARIA labels, focus rings, keyboard nav
16. ✅ Reduced-motion respected
17. ✅ Mobile bottom-sheet at <760px
18. ✅ Status bar 📈 button + `N` keyboard shortcut
19. ✅ Rogue-widget-killer SAFE_IDS + adit-reset whitelist updated
20. ✅ SW cache version bumped (forces shell refresh)
21. ✅ Feature-flagged behind `anomalyDetectionV2` (default OFF)
22. ✅ E2E tests for asset serving + API stability + auth gates
23. ✅ All prior 160 tests still pass

## Out of scope (Session 8+)

- Cross-agent correlation
- Predictive features
- Per-supervisor mute
- Slack/email delivery

## Rollout

1. Ship behind `anomalyDetectionV2` flag (default OFF)
2. Admin enables via `setFlag('anomalyDetectionV2', true)`
3. Force-run via `POST /api/admin/anomalies/run` to backfill last day
4. Tune thresholds based on noise rate
5. Enable flag for all admins
6. Promote to default ON
