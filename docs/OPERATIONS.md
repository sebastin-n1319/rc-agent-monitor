# Adit Agent Monitor — Operations Runbook

**Last updated:** 2026-05-27 (Session 13)
**Production:** https://rc-t1cs-monitor.up.railway.app
**Repo:** https://github.com/sebastin-n1319/rc-agent-monitor

This runbook covers what was built across 13 sessions, how to enable each
feature in production, and how to operate the system day-to-day.

## At a glance

| Aspect | Status |
|---|---|
| Production URL | https://rc-t1cs-monitor.up.railway.app |
| Health check | `GET /healthz` → `{server:"ok", db:"ok", ...}` |
| Push to deploy | `git push origin main` → Railway auto-deploys |
| Lighthouse a11y | **94/100** (Session 13 audit) |
| Lighthouse best-practices | **92/100** |
| Lighthouse SEO | **91/100** |
| Lighthouse performance | 55/100 (1.3 MB monolith — split scheduled) |
| npm audit | **0 vulnerabilities** |
| Test count | **273** (181 unit / 92 E2E) |
| Service worker | `adit-v1.7.0` (8 assets pre-cached) |
| Security headers | 6 baseline headers on every response (Session 9) |
| Logs | Railway dashboard → Deployments → Logs (JSON-line format) |
| DB | SQLite at `/data/productivity.db` on Railway volume |
| Always-admin emails | env `CORE_ADMINS=sebastin.n@adit.com,ronnie@adit.com,imran@adit.com` |

## Feature flag matrix

Every Session 2+ feature is gated behind a localStorage flag.
Set per browser via DevTools console: `setFlag('flagName', true); location.reload()`

### Safe defaults (on out of the box)

| Flag | Feature | Default |
|---|---|---|
| `alerts` | Real-time alerts polling/SSE | ✅ on |
| `pomodoro` | Pomodoro 50/10 timer | ❌ off (opt-in) |
| `highContrast` | High-contrast mode | ❌ off (opt-in) |
| `breakSuggestions` | Toast suggesting break after 2h live | ✅ on |
| `bugCapture` | "Report a bug" floating button | ✅ on |
| `wellnessCheckin` | Daily mood pulse modal | ✅ on |
| `handoffNotes` | Shift-handoff prompt on logout | ✅ on |
| `coachMode` | Supervisor coach flag prompts | ✅ on |
| `pwaInstall` | "📲 Install" button when SW + manifest are healthy | ✅ on |
| `statusBar` | Bottom status bar (clock, search, etc.) | ✅ on |

### Preview features (default off — flip flag to enable)

| Flag | Feature | Session |
|---|---|---|
| `alertsV2` | New alert center UI (bell + modal + drill-down) | 3 |
| `scheduleAdherenceV2` | Schedule admin dashboard + per-agent editor + bulk apply | 5 |
| `anomalyDetectionV2` | Anomaly dashboard + drill-down + threshold tuning | 7 |
| `offlineQueueV2` | PWA offline queue + background sync | 8 |
| `bulkActionsV2` | Multi-select agent table + 4 backend actions + audit log | 10 |
| `predictiveAbandonmentV2` | Logistic-regression forecast + backtest + admin retrain | 11+12 |
| `comparison` | Side-by-side agent comparison modal | 1 (rough) |
| `bulkActions` | Legacy Session 1 stub (removed in Session 10) | 1 (deprecated) |
| `predictiveAbandonment` | Legacy Session 1 per-hour-mean stub | 1 (deprecated) |
| `scheduleAdherence` | Legacy Session 1 stub | 1 (deprecated) |
| `callCorrelation` | Break vs abandonment chart | 1 |
| `virtualScroll` | Virtual scrolling for large tables | 1 |
| `moduleLoader` | Future split-monolith hot loader | 1 |
| `websocketDiff` | Diff-only SSE broadcasts | 1 |

## Keyboard shortcuts

| Key | Action | Session |
|---|---|---|
| `⌘K` / `Ctrl+K` / `/` | Command palette | 1 |
| `?` | Show shortcuts modal | 1 |
| `Esc` | Close any modal / cancel | 1 |
| `1` – `8` | Switch admin tabs (Live, Reports, Agents, Access, Breaks, Calls, Tickets, AI Agent) | 1 |
| `A` | Open Alert Center | 3 |
| `T` | Open Schedule Admin | 5 |
| `N` | Open Anomaly Center | 7 |
| `Y` | Open Predict Center (forecast + backtest) | 12 |
| `F` | Toggle Focus Mode | 1 |
| `H` | Toggle High Contrast | 1 |
| `P` | Toggle Pomodoro | 1 |
| `R` | Refresh data | 1 |
| `S` | Save current view (filter combo) | 1 |
| `V` | List saved views | 1 |
| `C` | Open agent comparison (preview) | 1 |
| `B` | Report a bug | 1 |

## Status bar lineup

```
●Live · 14:23:01 · [offline 3] · ⌘K · 🔮  📈  📅  🔔(3)  📲  ⌨ 🎯 ↻ 🐛
       │                              │   │   │    │       │  │  │  │
       Live dot                       │   │   │    Bell    │  │  │  Bug
                                      │   │   │    (S3)    │  │  Refresh
                                      │   │   Schedule    Install │
                                      │   │   (S5)        (S8)    Focus
                                      │   Anomaly (S7)            (S1)
                                      Predict (S12)
```

## Endpoint glossary

### Public / no-auth
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness/readiness probe |
| `GET` | `/manifest.webmanifest` | PWA manifest |
| `GET` | `/sw.js` | Service worker |
| `GET` | `/*.css`, `/*.js`, `/*.png` | Static shell |

### Auth-gated (any logged-in user)
| Method | Path | Session |
|---|---|---|
| `GET` | `/api/session` | — |
| `POST` | `/api/break-events` (supports `X-Idempotency-Key`) | 8 |
| `GET` | `/api/break-tracker` | — |
| `GET` | `/api/alerts/active`, `/api/alerts/recent` | 2 |
| `POST` | `/api/alerts/:id/ack`, `/api/alerts/:id/snooze`, `/api/alerts/ack-all` | 2-3 |
| `GET` | `/api/anomalies/active`, `/api/anomalies/recent` | 6 |
| `POST` | `/api/anomalies/:id/ack` | 6 |
| `GET` | `/api/anomaly/thresholds` | 6 |
| `GET` | `/api/schedule-adherence`, `/api/schedules/:email` | 4 |
| `GET` | `/api/predict/abandonment` | 11 |
| `GET` | `/api/predict/backtest?days=N` | 11 |
| `GET` | `/api/coach-flag/me`, `/api/wellness/today` | — |
| `POST` | `/api/handoff`, `/api/wellness` | — |

### Admin-only
| Method | Path | Session |
|---|---|---|
| `PUT` | `/api/alerts/thresholds/:key` | 3 |
| `PUT` | `/api/anomaly/thresholds/:metric` | 7 |
| `POST` | `/api/admin/alerts/test`, `/api/admin/anomalies/test`, `/api/admin/anomalies/run` | 2-7 |
| `GET` | `/api/schedules`, `/api/schedules/:email/history` | 4 |
| `PUT` | `/api/schedules/:email` | 4-5 |
| `POST` | `/api/schedules/bulk` | 5 |
| `DELETE` | `/api/schedules/:email` | 4 |
| `GET` | `/api/admin/bulk-actions/list` | 10 |
| `POST` | `/api/admin/bulk-actions` | 10 |
| `POST` | `/api/admin/predict/train` | 11 |
| `GET` | `/api/predict/model` | 11 |
| `GET` | `/api/admin/backup-db` (streams the SQLite file) | 1 |
| `GET` | `/api/admin/daily-digest` (HTML rollup) | 1 |
| `GET` | `/api/admin/cache-stats`, `POST /api/admin/cache-flush` | 1 |
| `GET` | `/api/admin/jobs`, `POST /api/admin/jobs/heavy-report` | 1 |

## Rollout playbook (per-feature)

For each preview feature, the rollout pattern is the same:

1. **Smoke test in DevTools** for an admin:
   ```js
   setFlag('flagName', true);
   location.reload();
   ```
2. **Watch Railway logs** for `flagName` related events. Filter by `event`:
   ```
   alert_cron_started, alert_fired, alert_acked,
   anomaly_run_complete, anomaly_detected,
   schedule_updated, schedule_bulk_updated,
   bulk_action_complete, predict_model_trained,
   predict_cron_started
   ```
3. **Enable for the 3 core admins** by sharing the `setFlag()` snippet
4. **Soak for 3-7 days** — gather feedback, tune thresholds via the admin
   UI (no curl needed for alerts, anomalies, schedules, or predictions)
5. **Promote to default ON** by changing the default in `defaultFlags()`
   inside `public/index.html` (search for `defaultFlags()` to find it)

## Common operations

### Train the prediction model from scratch (Session 11+12)
```bash
curl -X POST https://rc-t1cs-monitor.up.railway.app/api/admin/predict/train \
  -b "session-cookie" -H 'Content-Type: application/json' -d '{"days":30}'
```
Or just open the Predictions UI (`Y` key) → click **⚡ Retrain**.

### Run a bulk admin action (Session 10)
Open Manage Agents → check 2-5 agent rows → toolbar pill appears
bottom-right → click **Bulk apply…** → pick action → fill payload →
confirm → see per-agent ✓/✗ result modal.

Audit trail (one summary + N detail rows):
```
bulk_notify_summary | sebastin.n@adit.com | '' | total=2 ok=2 failed=0
bulk_notify         | sebastin.n@adit.com | sarah.chen@adit.com | ok
```

### Force a re-run of anomaly detection (Session 6+7)
Inside the Anomaly Center → **⚡ Run now** button. Or:
```bash
curl -X POST https://rc-t1cs-monitor.up.railway.app/api/admin/anomalies/run \
  -b "session-cookie"
```

### Backup the production DB (Session 1)
```bash
curl -o backup-$(date +%F).db -b "session-cookie" \
  https://rc-t1cs-monitor.up.railway.app/api/admin/backup-db
```
Schedule via cron on your machine or Railway's scheduler.

### Tune an alert threshold (Session 3)
Inside the Alert Center → **🔧 Tune** button → adjust per-row. Saves
via PUT and writes an audit log entry.

### Tune an anomaly threshold (Session 7)
Inside the Anomaly Center → **🔧 Tune** button → 5 cards (one per
metric) with enable / z_threshold / direction / lookback_days /
min_history_days.

### Apply a schedule to multiple agents at once (Session 5)
Press `T` → **"Bulk apply…"** → pick template → select agents → set
effective date → **Apply**.

### Manually drain the offline queue (Session 8)
DevTools console (with `offlineQueueV2` on):
```js
OfflineBridge.size();        // see how many queued
OfflineBridge.drainNow();    // attempt sync
```
Or click "Sync now" in the bottom-left status pill.

## Monitoring + alerts

### What to grep in Railway logs

| Symptom | Filter |
|---|---|
| Alerts firing | `event:alert_fired` |
| Anomalies firing | `event:anomaly_detected` |
| Cron startup | `event:alert_cron_started OR event:anomaly_cron_started OR event:predict_cron_started` |
| Schedule changes (audit) | `event:schedule_updated OR event:schedule_bulk_updated` |
| Threshold changes (audit) | `event:alert_threshold_updated OR event:anomaly_threshold_updated` |
| Bulk admin actions | `event:bulk_action_complete` |
| Model retraining | `event:predict_model_trained OR event:predict_model_train_skipped` |
| Idempotent break-event replays | `event:break_event_idempo_replay` |
| Unhandled errors | `severity:error` |

### Background processes

| Job | Cadence | Owner |
|---|---|---|
| Alert evaluator | every 30s | `lib/alerts.js` + `runAlertEvaluator()` |
| Anomaly evaluator | every 10m, fires when CST hour == 3 | `lib/anomaly.js` + `runAnomalyEvaluator()` |
| Predict model retraining | every 10m, fires when CST 03:30 | `lib/predict.js` + `trainAndPersistPredictModel()` |
| Agent presence sync | every `FALLBACK_SYNC_MS` (default 30s) | `fetchPresenceForAll()` |
| Missed-call → Google Chat | every 3 min if `MISSED_CALL_WEBHOOK_URL` set | `runMissedCallPoll()` |
| Cache TTL | 5s on /api/agents | `cacheWrap` in `server.js` |

## Architecture map

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ index.html (1.3 MB monolith — split is Session 14+)    │ │
│  │   • Login + main app shell + admin views               │ │
│  │   • All keyboard shortcuts, toasts, status bar         │ │
│  └──────────────┬─────────────────────────────────────────┘ │
│                 │                                            │
│  ┌──────────────┴─────────────────────────────────────────┐ │
│  │ Modular UI (9 paired css/js + 1 helper):               │ │
│  │  agent-view-v2          ← V2 dashboard (S1)            │ │
│  │  alert-center           ← Alerts (S3)                  │ │
│  │  schedule-admin         ← Schedule admin (S5)          │ │
│  │  anomaly-center         ← Anomalies (S7)               │ │
│  │  offline-bridge         ← PWA queue (S8)               │ │
│  │  bulk-actions           ← Bulk admin (S10)             │ │
│  │  predict-center         ← Predictions (S12)            │ │
│  │  a11y-focus-trap.js     ← Focus management (S9)        │ │
│  │  sw.js (v1.7.0)         ← Service worker (S8)          │ │
│  │  manifest.webmanifest   ← PWA install (S1)             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │ HTTPS + CSP/HSTS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVER (Railway)                       │
│  server.js (~4150 lines)                                    │
│   • Express + cookie auth (server-side sessions in SQLite)  │
│   • Security middleware (CSP, HSTS, X-Frame, etc — S9)      │
│   • Structured JSON logger (lib/logger.js)                  │
│   • In-memory cache (5s TTL)                                │
│   • Routes: 140+ endpoints                                  │
│                                                              │
│  lib/ — 6 pure engine libraries                             │
│   ├── alerts.js          Pure alert engine (S2)             │
│   ├── schedule.js        Pure adherence engine (S4)         │
│   ├── anomaly.js         Pure anomaly engine (S6)           │
│   ├── offline-queue.js   IDB queue + Node fallback (S8)     │
│   ├── predict.js         Logistic regression (S11)          │
│   └── logger.js          Structured JSON logger (S1)        │
│                                                              │
│  Cron loops (started in app.listen() callback):             │
│   • Alert evaluator (every 30s)                             │
│   • Anomaly evaluator (every 10m, fires at 03:00 CST)       │
│   • Predict retraining (every 10m, fires at 03:30 CST)      │
│   • Missed-call notifier (every 3min)                       │
│   • Agent presence sync (every 30s)                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  SQLITE (/data/productivity.db)             │
│   Core tables:                                              │
│     monitored_agents, presence_events, call_logs,           │
│     break_events (with idempotency_key in S8), login_logs,  │
│     app_roles, app_sessions, audit_log, agent_notes         │
│   Session 2-11 additions:                                   │
│     alert_thresholds, alert_events,                         │
│     agent_schedules, anomaly_thresholds, anomaly_events,    │
│     shift_handoff, wellness_checkin, coach_flag,            │
│     predict_models                                          │
└─────────────────────────────────────────────────────────────┘
```

## Testing

```bash
# Unit tests (vitest, runs in Node) — covers lib/**
npm test                  # all unit tests, no watch
npm run test:watch        # watch mode
npm run test:coverage     # with coverage report + per-file floors

# E2E (Playwright, auto-starts server) — covers HTTP surface
npm run test:e2e
npm run test:e2e:ui       # interactive

# Everything (used by CI)
npm run ci
```

### Current totals (Session 13)

| Suite | Files | Tests |
|---|---|---|
| Unit (`tests/unit/*.test.js`) | 7 | **181** |
| E2E (`tests/e2e/*.spec.js`) | 10 | **92** |
| **Total** | **17** | **273** |

### Coverage floors (locked in Session 13)

The `vitest.config.js` `thresholds` block enforces per-file minima so
future PRs can't quietly drop coverage:

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `lib/alerts.js` | ≥98 | ≥78 | =100 | ≥98 |
| `lib/anomaly.js` | ≥95 | ≥89 | =100 | ≥95 |
| `lib/predict.js` | ≥98 | ≥85 | =100 | ≥98 |
| `lib/schedule.js` | ≥95 | ≥91 | =100 | ≥95 |
| `lib/logger.js` | ≥60 | ≥75 | ≥40 | ≥60 |
| `lib/offline-queue.js` | ≥60 | ≥75 | ≥85 | ≥60 |
| Global | ≥85 | ≥80 | ≥80 | ≥85 |

If any of these drop below the floor, `npm test` fails.

## What's NOT in production yet

These are shipped behind flags or as preview-only stubs:

- Daily digest email delivery (#13) — generator exists, needs SendGrid creds
- Schedule templates in DB (templates are hardcoded in `schedule-admin.js`)
- Mobile push notifications (Notification API works in-tab only)
- Per-agent custom alert rules (single org config for now)
- Conflict resolution for offline queue across multiple devices (Session 8 deferred)

## Session-by-session changelog

| Session | Shipped | Tests added |
|---|---|---|
| 1 | Foundation (vitest, playwright, logger, Option C) | 9 |
| 2 | Real-time alerts engine (#11) | 23 |
| 3 | Alert UI + SSE + threshold admin + history | 9 |
| 4 | Schedule adherence engine (#14) | 37 |
| 5 | Schedule admin UI + bulk apply + timeline | 14 |
| 6 | Anomaly detection engine (#20) | 41 |
| 7 | Anomaly UI + drill-down + threshold tuning + SSE | 11 |
| 8 | PWA hardening (#21+#5): IDB queue + SW v1.5 + idempotency | 33 |
| 9 | Cross-cutting hardening: security headers, a11y, logger, CSP | 8 |
| 10 | Bulk admin actions (#15): real backend + audit + multi-select | 10 |
| 11 | Predictive abandonment v2 (#16): logistic regression + tests | 44 |
| 12 | Predictions UI: forecast card + backtest chart + retrain | 12 |
| 13 | Hardening v2: live Lighthouse, coverage floors, contrast fix | (audit-only) |
| **Total** | **9 UI modules · 6 lib engines · 140+ endpoints** | **273 tests** |

## Emergency rollback

If a session's deploy breaks production:

```bash
git revert HEAD              # revert the most recent commit
git push origin main         # Railway redeploys the prior version
```

Or pick a known-good commit:

```bash
git log --oneline -10
git revert <bad-commit-sha>
git push origin main
```

Service worker version bumps trigger shell refresh — users get the
fixed assets on next page load (or hard-reload to skip the staleness window).

## Contact

Issues, questions, or "this metric looks wrong" reports:
sebastin.n@adit.com
