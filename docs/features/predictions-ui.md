# Predictions UI (Session 12)

**Status:** In progress
**Builds on:** Session 11 (`docs/features/predictive-abandonment.md`)
**Last updated:** 2026-05-27

## Goal

Turn the Session 11 logistic-regression engine into something supervisors
can actually look at. After Session 12, admins get:

1. A **forecast card** showing the current 15-min abandonment probability
   with a confidence band
2. A **backtest chart** plotting yesterday's predictions vs reality so
   supervisors learn to trust (or distrust) the signal
3. An **admin "Retrain now"** button that triggers `/api/admin/predict/train`
4. A **model debug panel** with weights, mu, sigma, sample size, eval metrics
5. **Auto-refresh** every 60 seconds while open

## Non-goals

- Per-agent or per-queue forecasts (engine is queue-level — see Session 11
  non-goals)
- Live SSE push (forecast changes slowly; 60s polling is sufficient)
- Mobile push notifications when probability exceeds threshold
- Cross-team comparison views

## Architecture

```
                              predict-center.js
                              ──────────────────
                          window.PredictCenter
                          │
                          ├── open()                → dashboard modal
                          ├── refresh()
                          ├── retrain()             → POST /api/admin/predict/train
                          └── close()
                                  │
                                  │ fetch
                                  ▼
              ┌───────────────────────────────────────────┐
              │ Server endpoints from Session 11:         │
              │   GET  /api/predict/abandonment           │
              │   GET  /api/predict/backtest?days=N       │
              │   POST /api/admin/predict/train           │
              │   GET  /api/predict/model                 │
              └───────────────────────────────────────────┘
```

## Components

### 1. Forecast card (primary UX)

```
┌─ 🔮 Next 15 minutes ─────────────────────────────────┐
│                                                       │
│             62%                                       │
│      ▰▰▰▰▰▰▱▱▱▱  (confidence band)                    │
│                                                       │
│  Expected abandonment: ≥1                             │
│  Confidence: medium · n=812 · acc 0.74                │
│                                                       │
│  Drivers:                                             │
│    • Queue depth: 4    weight: +1.2                   │
│    • Wait time: 32s    weight: +0.8                   │
│    • Agents avail: 2   weight: -0.6 (low staffing)    │
│                                                       │
│  [⚡ Retrain now]    [⚙ Debug]                         │
└───────────────────────────────────────────────────────┘
```

- Big probability number (0-100%)
- 10-segment progress bar with severity coloring at thresholds
- Top-3 feature contributors (weight × standardized value)
- "Retrain now" admin-only button
- "Debug" link opens the model debug panel

### 2. Backtest chart

```
Yesterday's predictions vs reality (last 7 days)

  P  ━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●
  r          ●                   ●                  ●
  o  ●●           ●●        ●
  b  Day1  Day2  Day3  Day4  Day5  Day6  Day7
     ✓     ✓     ✗     ✓     ✓     ✓     ✓        (predicted vs actual)
```

- Plots predicted probability per day
- Marks actual outcome (✓ if both predicted and actual = 1 or both 0)
- Calls out misses
- Hover (desktop) / tap (mobile) reveals exact values

### 3. Model debug panel (admin only)

Inline section in the same modal, hidden by default, toggled via "Debug" link.

```
Model: abandon_15min
Fitted: 2026-05-26 03:30 UTC
Sample size: 812 (train: 650, test: 162)
Eval metrics:
  • Precision: 0.71
  • Recall: 0.68
  • Accuracy: 0.74

Weights (intercept first):
  intercept: -0.42
  queueDepth: +1.21
  hourOfDay: -0.18
  weekday: -0.03
  avgWaitSeconds: +0.84
  agentsAvailable: -0.62

Feature means (mu): [3.2, 12.5, 3.0, 28.1, 4.1]
Feature stddevs (sigma): [2.1, 2.8, 1.7, 18.3, 2.4]
```

Useful for engineers debugging "why is the model predicting X". Not
visible to non-admin agents.

### 4. Status-bar entry point

Adds a 🔮 button to the right side of the status bar (after the existing
📈 anomaly button and 📅 schedule button). Keyboard shortcut `Y` (think
"y-prediction" — `P` is Pomodoro).

## Acceptance criteria

1. ✅ `PredictCenter` global with stable 4-method API: open/close/refresh/retrain
2. ✅ Status bar 🔮 button + `Y` keyboard shortcut
3. ✅ Forecast card shows probability, confidence, expected, drivers
4. ✅ Confidence band visualizes uncertainty (10-segment bar)
5. ✅ Backtest chart renders last 7 days of predictions vs reality
6. ✅ "Retrain now" admin button → POST /api/admin/predict/train + toast result
7. ✅ Model debug panel shows weights, mu, sigma, eval metrics
8. ✅ Debug panel is admin-only (gated client-side)
9. ✅ Auto-refresh every 60s while open
10. ✅ Cold-start: shows "No model yet — click Retrain" instead of crashing
11. ✅ Mobile bottom-sheet at <760px
12. ✅ A11y: role=dialog, ARIA labels, focus rings, reduced-motion
13. ✅ Feature-flagged behind `predictiveAbandonmentV2` (same as Session 11)
14. ✅ Rogue-widget-killer SAFE_IDS + adit-reset whitelist updated
15. ✅ SW cache version bumped (v1.6.0 → v1.7.0)
16. ✅ All prior 263 tests still pass
17. ✅ ≥ 5 new E2E tests for asset/API/runtime
18. ✅ Visual proof: screenshot of rendered dashboard with mock data

## Out of scope (Session 13+)

- Mobile push notifications on prediction threshold breach
- Per-day-of-week breakdown panel
- Threshold-tuning UI (admins can edit thresholds via the engine config)
- Compare-models view (we only have one model)
- Time-of-day grid heatmap

## Rollout

Same flag as Session 11 (`predictiveAbandonmentV2`). Anyone who turned that on
for the engine automatically gets the UI.

1. Admin sets flag: `setFlag('predictiveAbandonmentV2', true); location.reload()`
2. Click 🔮 in status bar OR press `Y` → dashboard opens
3. On first use: "No model yet" → click "Retrain now" to bootstrap
4. Subsequent visits: forecast card shows live probability
5. Tune by watching backtest accuracy over a week
