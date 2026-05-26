# Real-Time Alerts (#11)

**Status:** Session 2 Part 1 — engine + DB + admin API
**Owner:** Eng
**Last updated:** 2026-05-26

## Problem

Supervisors today must manually watch the Live Dashboard to spot:
- Abandonment rate spikes
- Agents stuck on calls
- Queue backups
- Long breaks/AUX times
- Coverage gaps

This burns supervisor attention and means problems are noticed late. We need
an alert system that surfaces these conditions automatically, with proper
acknowledge / snooze workflows and a configurable threshold per condition.

## Goals

1. **Detect** the five most impactful conditions automatically every 30 seconds.
2. **Notify** the right people in real-time (in-app toast + optional browser push).
3. **Acknowledge / snooze** flow — supervisors mark alerts as seen so they don't
   keep firing.
4. **Configurable** thresholds — admins can tune sensitivity per condition.
5. **Audited** — every alert and ack is logged for compliance + retrospective.

## Non-goals

- ML-driven anomaly alerts (separate effort — see #20 anomaly detection)
- SMS / email delivery (Part 3 — add SendGrid integration later)
- Per-agent custom alert rules (deferred)

## The 5 alert types

| # | Alert key | Trigger condition | Default threshold | Severity |
|---|---|---|---|---|
| 1 | `abandonment_spike` | Abandoned calls / total calls in last 15 min ≥ X%, with ≥ N total calls | **15%**, N=5 | critical |
| 2 | `stuck_call` | Agent on a single call ≥ X min | **18 min** | warning |
| 3 | `queue_backup` | Queue depth ≥ X callers for ≥ Y minutes | **5 callers, 3 min** | critical |
| 4 | `long_aux` | Agent in BRB/break/training/QA AUX ≥ X min | **25 min** | warning |
| 5 | `coverage_gap` | Available agents = 0 during business hours for ≥ X min | **2 min, 9am-5pm CST** | critical |

All thresholds and severities are persisted in the `alert_thresholds` table
and editable via `PUT /api/alerts/thresholds/:key`. Defaults are seeded on
first boot — see `seedDefaultThresholds()` in `database.js`.

## Alert lifecycle

```
                      cron tick (every 30s)
                              │
              ┌───────────────┴───────────────┐
              │  evaluateAll(state, config)   │
              │  pure function in lib/alerts  │
              └───────────────┬───────────────┘
                              │ returns [{key, severity, body, agentEmail?, ttl}]
              ┌───────────────┴───────────────┐
              │   For each result:            │
              │   • Skip if same key fired    │
              │     in last `cooldown` window │
              │   • Skip if snoozed           │
              │   • Insert into alert_events  │
              │   • Broadcast via SSE / push  │
              └───────────────┬───────────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
            Supervisor sees         Logged in
            alert in UI            alert_events
                  │
        ┌─────────┴─────────┐
        │                   │
     Acknowledge          Snooze 15m
        │                   │
        ▼                   ▼
   alert_acks         alert_snoozes
```

## Database schema

### `alert_thresholds`
Admin-editable knobs. Single row per alert key.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PRIMARY KEY | matches alert key in code |
| `enabled` | INTEGER | 0 or 1 |
| `severity` | TEXT | 'critical' \| 'warning' \| 'info' |
| `threshold_json` | TEXT | JSON object — shape is alert-specific |
| `cooldown_seconds` | INTEGER | minimum gap between identical alerts (default 300) |
| `updated_at` | DATETIME | autoset |
| `updated_by` | TEXT | email of last editor |

### `alert_events`
Every time an alert *fires*, we log it here. Append-only for audit + retrospective.

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `key` | TEXT |
| `severity` | TEXT |
| `body` | TEXT — human-readable summary |
| `data_json` | TEXT — full context for debugging |
| `agent_email` | TEXT NULL — for agent-scoped alerts |
| `created_at` | DATETIME |
| `acked_at` | DATETIME NULL |
| `acked_by` | TEXT NULL |
| `snoozed_until` | DATETIME NULL |

### `alert_acks` *(implicit — uses the columns on `alert_events`)*

We don't need a separate ack table — ack metadata lives on the event row.

## Architecture

### `lib/alerts.js` — pure evaluation engine

All threshold-checking logic is in this module as **pure functions**. They take
a snapshot of system state + threshold config and return zero or more alert
descriptions. **No I/O, no clock dependency** — `now` is always passed in as
an argument. This makes the engine 100% deterministic and testable.

```js
const { evaluateAll, alertSpecs } = require('./lib/alerts');

const results = evaluateAll({
  now: Date.now(),
  thresholds,           // map of {key: {enabled, severity, threshold, cooldown}}
  agents,               // array of {email, status, since, currentCallStartedAt, ...}
  callsLast15Min,       // [{abandoned, ...}]
  queueDepth,           // {current, sinceMs}
  recentEvents          // array of recent alert_events for cooldown check
});
// → [{ key, severity, body, agentEmail?, data, suppressUntil? }]
```

### Server-side runner

A `setInterval` in `server.js` calls the engine every 30s. Results are
deduplicated against `alert_events` (cooldown check), then inserted and
broadcast via the existing SSE stream.

### Client side

- Subscribes to SSE `/api/live-stream` (already exists)
- New event type `alert` carries the broadcast payload
- Bell badge in the status bar shows unread count + opens the alert center
- (Alert center UI built in Session 3)

## API endpoints (Part 1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/alerts/active` | requireAuth | List unacked, unsnoozed alerts |
| GET | `/api/alerts/recent?days=N` | requireAuth | Last N days of all alerts (audit view) |
| POST | `/api/alerts/:id/ack` | requireAuth | Mark single alert acknowledged |
| POST | `/api/alerts/:id/snooze?minutes=N` | requireAuth | Snooze for N min |
| GET | `/api/alerts/thresholds` | requireAuth | Read all thresholds |
| PUT | `/api/alerts/thresholds/:key` | requireAdmin | Update one threshold |
| POST | `/api/admin/alerts/test` | requireAdmin | Fire a synthetic alert for testing |

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ Engine in `lib/alerts.js` is a pure function — no `Date.now()`, no `db`, no `fetch`.
2. ✅ ≥ 12 unit tests covering each alert type's true/false/edge cases.
3. ✅ Default thresholds match the table above; seeded on first boot.
4. ✅ `GET /api/alerts/thresholds` returns the 5 configured rows.
5. ✅ `PUT /api/alerts/thresholds/:key` (admin only) persists changes.
6. ✅ Cron evaluator fires every 30s; cooldown prevents duplicates within window.
7. ✅ Acknowledge endpoint marks `acked_at` and excludes from `/active`.
8. ✅ Snooze endpoint sets `snoozed_until` and excludes from `/active` until past.
9. ✅ Audit log entry on every threshold change.
10. ✅ Engine never throws — tested with malformed input.
11. ✅ Feature flag: `setFlag('realTimeAlerts', true)` enables client subscription.
12. ✅ Existing rate-limited toast `checkAlerts()` is removed / replaced.

## Out of scope for this session

- Alert center UI panel (Part 2, Session 3)
- Browser push notifications (Part 2)
- Per-agent custom rules (future)
- SMS/email delivery (future)
- Acknowledgement broadcast to all watchers (future, via SSE)

## Rollout

1. Ship Part 1 — engine + DB + admin API + tests behind flag `realTimeAlerts` (default OFF).
2. Tune thresholds in dev for one week using `/api/admin/alerts/test`.
3. Ship Part 2 — UI + browser push.
4. Enable flag for admins only; gather feedback for a week.
5. Promote to default ON for all supervisors.
