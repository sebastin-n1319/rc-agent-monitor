# Anomaly Detection v2 (#20)

**Status:** Session 6
**Replaces:** the rough Session 1 stub (`detectAnomalies` z-score on live-timer DOM scrape)
**Last updated:** 2026-05-26

## Problem

Supervisors today have no way to spot patterns like:

- An agent who normally handles 18 calls/day is suddenly handling 4 (illness? disengagement?)
- An agent's AHT has crept up from 4:30 to 8:00 over two weeks (struggling? new product change?)
- An agent's break time doubled this week (burnout signal? life event?)
- A team's overall missed-call rate spiked while individual agents look fine

These are signals you only catch if you stare at the dashboard daily for weeks
and have a great memory. We can do this automatically and surface real human
problems before they cost retention or service quality.

The Session 1 stub:
- Used naive z-score (`stdev`) which is fooled by outliers
- DOM-scraped live-timer text instead of using real data
- Only looked at one metric
- Fired toast notifications that were forgotten in 5 seconds
- Had no persistence, no UI, no audit trail

## Goals

1. **Robust statistics** — median + MAD-based modified z-score, immune to outliers
2. **Multiple metrics** per agent, each with a meaningful direction (low/high/either)
3. **Persistent anomaly events** — store + acknowledge + audit, not just toasts
4. **Configurable sensitivity** — per metric, admin-tunable
5. **Daily evaluation** — nightly cron, plus on-demand
6. **Real data sources** — DB queries against presence_events, call_logs, break_events
7. **Graceful for new agents** — skip metrics with too little history rather than misfire

## Non-goals

- ML / autoencoders / fancy models (modified z-score is sufficient and explainable)
- Multi-agent correlation ("is the WHOLE team off?")
- Predictive forecasting ("will this person burn out next week?")
- Per-supervisor mute / threshold (single org config for now)

## The 5 metrics

| Key | What | Source | Direction concerning |
|---|---|---|---|
| `daily_live_minutes` | minutes agent was Live (not break/aux) | `presence_events` | LOW (under-engaged) |
| `daily_call_volume` | inbound + outbound calls handled | `call_logs` | either (low = idle, high = stress) |
| `daily_missed_calls` | calls that rang to agent but were missed | `call_logs` | HIGH (declining quality) |
| `daily_break_minutes` | total break/AUX time | `break_events` | HIGH (burnout signal) |
| `daily_aht_seconds` | avg handle time per inbound call | `call_logs` | either (high = struggle, low = rush) |

Each metric has independent threshold + direction + enable flag stored in
`anomaly_thresholds` table. Admins can tune via `PUT /api/anomaly/thresholds/:metric`.

## The math — modified z-score

For each (agent, metric):
1. Pull last N days of values (default N=30, excluding weekends/holidays for that agent's schedule)
2. Compute **median** (M) — robust to outliers
3. Compute **MAD** = median(|x_i - M|) — robust to outliers
4. **Modified z-score**: `z = 0.6745 * (today - M) / MAD`
5. Fire if `|z| > threshold` AND direction matches

The 0.6745 constant makes MAD-based z-scores comparable to traditional z-scores
under a normal distribution. A threshold of `3.5` is the standard "outlier"
cutoff. We default each metric to 3.5 with admin override.

**Why modified z-score** (not regular z-score):
- Regular z uses mean + stdev, both of which are PULLED by outliers
- An agent who had one massive day of calls would inflate their own baseline,
  making subsequent normal days look like "low" anomalies. Bad UX.
- Median + MAD use the middle of the distribution — single outliers don't move them

## Edge cases handled

- **Too little history** (<10 non-zero days): skip — return no anomaly, log `insufficient_data`
- **MAD = 0** (all values identical): skip — division would be undefined
- **All zeros** (vacation, holiday): exclude from baseline
- **Today is a "day off"** per the agent's schedule: skip evaluation entirely
- **First few weeks for a new agent**: skip — let baseline build naturally

## Architecture

```
                    nightly cron (3am CST)
                            │
                            ▼
                ┌───────────────────────────┐
                │ runAnomalyEvaluator()     │
                │   for each agent:         │
                │     for each metric:      │
                │       evaluateMetric()    │
                │         → null OR anomaly │
                └───────────┬───────────────┘
                            │
                            ▼
                ┌───────────────────────────┐
                │ insertAnomalyEvent()      │
                │ dedupe: skip if same      │
                │ (email,metric,date) exists│
                └───────────┬───────────────┘
                            │
                            ▼
              ┌───────────────────────────────┐
              │ visible via:                  │
              │  GET /api/anomalies/recent    │
              │  AlertCenter (if linked)      │
              │  Manager weekly digest        │
              └───────────────────────────────┘
```

Engine is pure — `evaluateMetric(values, todayValue, config)` takes everything
explicitly. The runner (server.js) handles I/O.

## Database schema

### `anomaly_thresholds` (admin-tunable)

One row per metric.

| Column | Type | Notes |
|---|---|---|
| `metric` | TEXT PK | matches metric key |
| `enabled` | INTEGER | 0 / 1 |
| `z_threshold` | REAL | default 3.5 |
| `direction` | TEXT | 'low' / 'high' / 'either' |
| `min_history_days` | INTEGER | min non-zero days required (default 10) |
| `lookback_days` | INTEGER | how many days to use for baseline (default 30) |
| `updated_at` | DATETIME | |
| `updated_by` | TEXT | |

### `anomaly_events` (audit log + UI)

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `agent_email` | TEXT NOT NULL | |
| `metric` | TEXT NOT NULL | |
| `date` | TEXT NOT NULL | YYYY-MM-DD when the anomaly applies |
| `today_value` | REAL | the value that triggered |
| `baseline_median` | REAL | |
| `baseline_mad` | REAL | |
| `modified_z` | REAL | |
| `direction` | TEXT | 'low' / 'high' |
| `severity` | TEXT | derived: warning if z>3.5, critical if z>5 |
| `created_at` | DATETIME | |
| `acked_at` | DATETIME | |
| `acked_by` | TEXT | |

UNIQUE constraint on (agent_email, metric, date) — one anomaly per agent/metric/day.

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/anomalies/recent?days=N` | requireAuth | last N days of anomalies |
| GET | `/api/anomalies/active` | requireAuth | unacked anomalies |
| GET | `/api/anomalies/agent/:email?days=N` | self-or-admin | agent's own anomaly history |
| POST | `/api/anomalies/:id/ack` | requireAuth | acknowledge |
| GET | `/api/anomaly/thresholds` | requireAuth | read all thresholds |
| PUT | `/api/anomaly/thresholds/:metric` | requireAdmin | update threshold |
| POST | `/api/admin/anomalies/run` | requireAdmin | force re-evaluation now |
| POST | `/api/admin/anomalies/test` | requireAdmin | insert a synthetic anomaly |

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ `lib/anomaly.js` is pure — no I/O, no clock, no DB
2. ✅ ≥ 15 unit tests covering each metric direction + edge cases
3. ✅ Modified z-score formula matches spec (`0.6745 * (x - median) / MAD`)
4. ✅ MAD=0 case returns null (no false positive)
5. ✅ Insufficient history (<10 non-zero days) returns null
6. ✅ Day-off agents are skipped
7. ✅ All 5 metric thresholds seeded with defaults on first boot
8. ✅ DB unique constraint prevents duplicate (email, metric, date) anomalies
9. ✅ Daily cron runs at configurable time (default 3 AM CST)
10. ✅ `/api/anomalies/*` endpoints auth-gated correctly
11. ✅ Threshold mutations write to audit_log
12. ✅ Engine never throws on adversarial input
13. ✅ All prior tests still pass (110 from sessions 1-5)
14. ✅ Feature-flagged behind `anomalyDetectionV2` (default OFF)
15. ✅ `POST /api/admin/anomalies/run` lets admin trigger immediately

## Out of scope for this session

- UI dashboard for anomalies (Session 7)
- Weekly digest email
- Multi-agent correlation
- Per-supervisor mute preferences
- ML / fancy models
- Predictive features

## Rollout

1. Ship engine + DB + API behind flag (default OFF)
2. Admin runs `POST /api/admin/anomalies/run` to backfill last 7 days
3. Tune thresholds via PUT endpoint based on noise rate
4. Wire into AlertCenter as a new alert source (Session 7)
5. Ship UI dashboard (Session 7)
6. Enable flag for admins
7. Promote to all supervisors
