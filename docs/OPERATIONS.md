# Adit Agent Monitor — Operations Runbook

**Last updated:** 2026-05-27 (Session 9)
**Production:** https://rc-t1cs-monitor.up.railway.app
**Repo:** https://github.com/sebastin-n1319/rc-agent-monitor

This runbook covers what was built across 9 sessions, how to enable each
feature in production, and how to operate the system day-to-day.

## Quick reference

| What | Where |
|---|---|
| App URL | https://rc-t1cs-monitor.up.railway.app |
| Health check | `/healthz` → `{server:"ok", db:"ok", ...}` |
| Push to deploy | `git push origin main` → Railway auto-deploys |
| Logs | Railway dashboard → Deployments → Logs (JSON-line format) |
| DB | SQLite at `/data/productivity.db` on Railway volume |
| Admin emails (always-admin) | env: `CORE_ADMINS=sebastin.n@adit.com,ronnie@adit.com,imran@adit.com` |

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
| `comparison` | Side-by-side agent comparison modal | 1 (rough) |
| `bulkActions` | Multi-select agent table | 1 (rough) |
| `predictiveAbandonment` | Predictive abandonment (still stub from Session 1) | 1 |
| `callCorrelation` | Break vs abandonment chart | 1 |
| `virtualScroll` | Virtual scrolling for large tables | 1 |
| `moduleLoader` | Future split-monolith hot loader | 1 |
| `websocketDiff` | Diff-only SSE broadcasts | 1 |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` / `/` | Command palette |
| `?` | Show shortcuts modal |
| `Esc` | Close any modal / cancel |
| `1` – `8` | Switch admin tabs (Live, Reports, Agents, Access, Breaks, Calls, Tickets, AI Agent) |
| `A` | Open Alert Center (Session 3) |
| `T` | Open Schedule Admin (Session 5) |
| `N` | Open Anomaly Center (Session 7) |
| `F` | Toggle Focus Mode |
| `H` | Toggle High Contrast |
| `P` | Toggle Pomodoro |
| `R` | Refresh data |
| `S` | Save current view (filter combo) |
| `V` | List saved views |
| `C` | Open agent comparison (preview) |
| `B` | Report a bug |

## Endpoint glossary

### Public / no-auth
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness/readiness probe |
| `GET` | `/manifest.webmanifest` | PWA manifest |
| `GET` | `/sw.js` | Service worker |
| `GET` | `/index.html`, `/*.css`, `/*.js` | App shell |

### Auth-gated (any logged-in user)
| Method | Path |
|---|---|
| `GET` | `/api/session` |
| `POST` | `/api/break-events` (supports `X-Idempotency-Key`) |
| `GET` | `/api/break-tracker` |
| `GET` | `/api/alerts/active`, `/api/alerts/recent` |
| `POST` | `/api/alerts/:id/ack`, `/api/alerts/:id/snooze`, `/api/alerts/ack-all` |
| `GET` | `/api/anomalies/active`, `/api/anomalies/recent` |
| `POST` | `/api/anomalies/:id/ack` |
| `GET` | `/api/anomaly/thresholds` |
| `GET` | `/api/schedule-adherence`, `/api/schedules/:email` |
| `GET` | `/api/coach-flag/me`, `/api/wellness/today` |
| `POST` | `/api/handoff`, `/api/wellness` |

### Admin-only
| Method | Path |
|---|---|
| `PUT` | `/api/alerts/thresholds/:key` |
| `PUT` | `/api/anomaly/thresholds/:metric` |
| `POST` | `/api/admin/alerts/test`, `/api/admin/anomalies/test`, `/api/admin/anomalies/run` |
| `GET` | `/api/schedules`, `/api/schedules/:email/history` |
| `PUT` | `/api/schedules/:email` |
| `POST` | `/api/schedules/bulk` |
| `DELETE` | `/api/schedules/:email` |
| `GET` | `/api/admin/backup-db` (streams the SQLite file) |
| `GET` | `/api/admin/daily-digest` (HTML rollup) |
| `GET` | `/api/admin/cache-stats`, `POST /api/admin/cache-flush` |
| `GET` | `/api/admin/jobs`, `POST /api/admin/jobs/heavy-report` |

## Rollout playbook (per-feature)

For each preview feature, the rollout pattern is the same:

1. **Smoke test in DevTools** for an admin:
   ```js
   setFlag('flagName', true);
   location.reload();
   ```
2. **Watch Railway logs** for `flagName` related events. Filter the JSON
   logs by `event` field — every important state change emits a structured
   event:
   ```
   alert_cron_started, alert_fired, alert_acked,
   anomaly_run_complete, anomaly_detected,
   schedule_updated, schedule_bulk_updated
   ```
3. **Enable for the 3 core admins** by sharing the `setFlag()` snippet
4. **Soak for 3-7 days** — gather feedback, tune thresholds via the admin
   UI (no curl needed for alerts, anomalies, or schedules)
5. **Promote to default ON** by changing the default in `defaultFlags()`
   inside `public/index.html` (search for `defaultFlags()` to find it)

## Common operations

### Force a re-run of anomaly detection
```bash
curl -X POST https://rc-t1cs-monitor.up.railway.app/api/admin/anomalies/run \
  -b "session-cookie-from-browser-devtools"
```
Or use the **⚡ Run now** button inside the Anomaly Center dashboard.

### Backup the production DB
```bash
curl -o backup-$(date +%F).db \
  -b "session-cookie" \
  https://rc-t1cs-monitor.up.railway.app/api/admin/backup-db
```
Schedule via cron on your machine or Railway's scheduler.

### Tune an alert threshold
Inside the Alert Center → **🔧 Tune** button → adjust per-row. Saves via
PUT and writes an audit log entry. Or by curl:
```bash
curl -X PUT https://rc-t1cs-monitor.up.railway.app/api/alerts/thresholds/stuck_call \
  -b "session-cookie" \
  -H 'Content-Type: application/json' \
  -d '{"threshold":{"callMinutes":25}}'
```

### Apply a schedule to multiple agents at once
1. Press `T` to open Schedule Admin
2. Click **"Bulk apply…"**
3. Pick a template (Mon-Fri 9-5, etc.) or "Custom…"
4. Select agents with checkboxes
5. Pick effective date → **Apply**

### Manually drain the offline queue
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
| Anomalies firing | `event:anomaly_detected` |
| Real-time alerts firing | `event:alert_fired` |
| Cron-evaluator failing | `event:anomaly_evaluator_failed` OR `event:alert_evaluator_failed` |
| Schedule mutations | `event:schedule_updated` OR `event:schedule_bulk_updated` |
| Threshold changes (audit) | `event:alert_threshold_updated` OR `event:anomaly_threshold_updated` |
| Unhandled errors | `severity:error` |
| Idempotent break-event replays | `event:break_event_idempo_replay` |

### Background processes

| Job | Cadence | Owner |
|---|---|---|
| Alert evaluator | every 30s | `lib/alerts.js` + `runAlertEvaluator()` |
| Anomaly evaluator | every 10m, fires when CST hour == 3 | `lib/anomaly.js` + `runAnomalyEvaluator()` |
| Agent presence sync | every `FALLBACK_SYNC_MS` (default 30s) | `fetchPresenceForAll()` |
| Missed-call → Google Chat | every 3 min if `MISSED_CALL_WEBHOOK_URL` set | `runMissedCallPoll()` |
| Cache TTL | 5s on /api/agents | `cacheWrap` in `server.js` |

## Architecture maps

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ index.html (1.3 MB monolith — split is Session 10+)    │ │
│  │   • Login + main app shell + admin views               │ │
│  │   • All keyboard shortcuts, toasts, status bar         │ │
│  └──────────────┬─────────────────────────────────────────┘ │
│                 │                                            │
│  ┌──────────────┴──────────────┐                            │
│  │ Modular UI (Sessions 1-9):  │                            │
│  │  agent-view-v2.{js,css}     │  ← V2 dashboard            │
│  │  alert-center.{js,css}      │  ← Alerts (S3)             │
│  │  schedule-admin.{js,css}    │  ← Schedule admin (S5)     │
│  │  anomaly-center.{js,css}    │  ← Anomalies (S7)          │
│  │  offline-bridge.{js,css}    │  ← PWA queue (S8)          │
│  │  a11y-focus-trap.js         │  ← Focus management (S9)   │
│  │  sw.js (v1.5.0)             │  ← Service worker          │
│  │  manifest.webmanifest       │  ← PWA install            │
│  └─────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVER (Railway)                       │
│  server.js (~3300 lines)                                    │
│   • Express + cookie auth (server-side sessions in SQLite)  │
│   • Security headers (CSP, HSTS, X-Frame, etc — S9)         │
│   • Structured logger (lib/logger.js)                       │
│   • In-memory cache (5s TTL)                                │
│   • Routes: 130+ endpoints                                  │
│                                                              │
│  lib/                                                       │
│   ├── alerts.js          Pure alert engine (S2)             │
│   ├── schedule.js        Pure adherence engine (S4)         │
│   ├── anomaly.js         Pure anomaly engine (S6)           │
│   ├── offline-queue.js   IDB queue + Node fallback (S8)     │
│   └── logger.js          Structured JSON logger (S1)        │
│                                                              │
│  Cron loops (started in app.listen() callback):             │
│   • Alert evaluator (every 30s)                             │
│   • Anomaly evaluator (every 10m, fires at 03:00 CST)       │
│   • Missed-call notifier (every 3min)                       │
│   • Agent presence sync (every 30s)                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  SQLITE (/data/productivity.db)             │
│   Core tables:                                              │
│     monitored_agents, presence_events, call_logs,           │
│     break_events (with idempotency_key), login_logs,        │
│     app_roles, app_sessions, audit_log, agent_notes         │
│   Session 2-8 additions:                                    │
│     alert_thresholds, alert_events,                         │
│     agent_schedules, anomaly_thresholds, anomaly_events,    │
│     shift_handoff, wellness_checkin, coach_flag             │
└─────────────────────────────────────────────────────────────┘
```

## Testing

```bash
# Unit tests (vitest, runs in Node)
npm test                  # all unit tests, no watch
npm run test:watch        # watch mode
npm run test:coverage     # with coverage report

# E2E (Playwright, auto-starts server)
npm run test:e2e
npm run test:e2e:ui       # interactive

# Everything (used by CI)
npm run ci
```

Current totals:

| Suite | Files | Tests |
|---|---|---|
| Unit (`tests/unit/*.test.js`) | 6 | 143 |
| E2E (`tests/e2e/*.spec.js`) | 7 | 67 |
| **Total** | **13** | **210** |

## What's NOT in production yet

These are shipped behind flags or as preview-only stubs:

- Bulk admin actions (#15 rough — needs proper backend wiring, see Session 10 candidates)
- Predictive abandonment v2 (#16 — still per-hour-mean stub)
- Daily digest email delivery (#13 — generator exists, needs SendGrid)
- Agent comparison (rough Session 1 stub)
- Virtual scrolling (helper exists, never called)
- Schedule templates in DB (templates are hardcoded in `schedule-admin.js`)

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
