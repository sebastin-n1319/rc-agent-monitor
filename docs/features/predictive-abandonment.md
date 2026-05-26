# Predictive Abandonment (#16 — Session 11)

**Status:** In progress
**Replaces:** the rough Session 1 stub (`predictiveAbandonment` flag, per-hour-mean only)
**Last updated:** 2026-05-27

## Problem

Supervisors need to know **15-30 minutes in advance** when abandonment is
likely to spike, so they can pull agents off breaks, reassign queue priorities,
or escalate to the floor manager. The current Session 1 stub answers
"what's the average for this hour" which:

- Doesn't account for current queue state
- Doesn't reflect day-of-week patterns
- Has no confidence signal (is this a "definite spike" or just noise?)
- Doesn't compose with other features (queue depth, wait time)

## Goals

1. **Real logistic regression** — not per-hour averages
2. **5 features** that supervisors intuitively understand:
   - `queue_depth` (current ringing calls)
   - `hour_of_day` (0-23 in business tz)
   - `weekday` (0=Sun…6=Sat)
   - `avg_wait_seconds_last_15min`
   - `agents_available_count`
3. **15-minute forecast** — probability of any abandonment in the next 15 min
4. **Confidence interval** — derived from training set size + recent
   prediction accuracy
5. **Backtest viewer** — "yesterday we predicted X, reality was Y" so
   supervisors learn to trust (or distrust) the signal
6. **Daily retraining** — model weights persisted, refreshed at 3am CST
   (same time as anomaly cron) using the last 30 days of data
7. **Graceful degradation** — if there's no model yet (cold start, < 7 days
   of data), endpoint returns `{ ready: false, reason: "insufficient_data" }`
   instead of misleading numbers

## Non-goals

- Per-agent abandonment risk (this is queue-level)
- Neural networks or fancy models — logistic regression is interpretable
  and explainable, which matters when supervisors are deciding whether
  to act on the signal
- Real-time online learning — daily batch retraining is sufficient

## The math (logistic regression in ~120 lines)

We have a 5-feature input vector `x = (q, h, d, w, a)` and want the
probability `p` that ≥1 call abandons in the next 15-minute window.

```
p(x) = sigmoid(b + Σ wᵢ·xᵢ)   where sigmoid(z) = 1 / (1 + e^-z)
```

Training: standardize each feature (z = (x - μ) / σ), then minimize
log-loss via batch gradient descent with L2 regularization:

```
loss = -Σ[y·log(p) + (1-y)·log(1-p)] + λ·||w||²
```

We don't need a fancy optimizer — 200 iterations of vanilla GD with
learning rate 0.1 converges fine on this dataset size (~5K training rows).

### Why logistic regression, not a stub or a deep net?

| Approach | Pros | Cons |
|---|---|---|
| Per-hour mean (Session 1) | Trivial, fast | Ignores everything except hour; no confidence; no signal |
| **Logistic regression** | Interpretable, fast to train + infer, gives probability + confidence | Slight underfit on complex patterns |
| Random forest / XGBoost | Higher accuracy on noisy data | Heavier dep (would need bundling); harder to explain to supervisors |
| Neural net | Theoretical max accuracy | Massive overkill for 5 features and ~5K rows; "why did it predict this?" becomes unanswerable |

For call-center abandonment, logistic regression is the right Pareto pick.

## Training data shape

We need historical `(features, label)` pairs. Build them at training time
by scanning the last 30 days of call_logs + presence_events:

For each non-overlapping 15-minute window in the lookback:
- **Label** = 1 if ≥1 call abandoned in window, else 0
- **Features:**
  - `queue_depth` at the START of the window → from presence_events
  - `hour_of_day` of window midpoint
  - `weekday`
  - `avg_wait_seconds_last_15min` → avg of `ring_duration` for calls
    in PRIOR 15-min window
  - `agents_available_count` at window start → from presence_events

Excluded windows: outside business hours (no signal), data gaps, holidays
(detected by all-zero windows for >30min).

## Architecture

```
                    Nightly cron (03:00 CST)
                              │
                              ▼
              ┌──────────────────────────────────┐
              │  buildTrainingSet(days=30)       │
              │    → [{features, label}…]        │
              └──────────────┬───────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────┐
              │  trainModel(rows, opts)          │
              │    standardize → grad descent    │
              │    → { weights, mu, sigma, n,    │
              │        evalMetrics }             │
              └──────────────┬───────────────────┘
                             │ persist
                             ▼
              ┌──────────────────────────────────┐
              │  predict_models table (1 row)    │
              │    id, fitted_at, weights_json,  │
              │    mu_json, sigma_json,          │
              │    sample_size, precision,       │
              │    recall, accuracy              │
              └──────────────┬───────────────────┘
                             │ inference
                             ▼
              ┌──────────────────────────────────┐
              │  predict({queueDepth,            │
              │           hourOfDay,             │
              │           weekday,               │
              │           avgWait,               │
              │           agentsAvail})          │
              │   → { probability, confidence,   │
              │       expectedAbandons }         │
              └──────────────────────────────────┘
```

## Database schema

### `predict_models` table (Session 11)

Stores the most recently trained model. We keep ONE row, replacing on retrain.
The shape is small enough that we don't need partitioning by model version.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | always 1 (single-row table for now) |
| `model_key` | TEXT | currently always 'abandon_15min' |
| `fitted_at` | DATETIME | when last trained |
| `weights_json` | TEXT | array of weights including intercept at [0] |
| `mu_json` | TEXT | array of feature means |
| `sigma_json` | TEXT | array of feature standard deviations |
| `feature_keys_json` | TEXT | ordered names so we can validate inference |
| `sample_size` | INTEGER | how many rows trained on |
| `precision` | REAL | evaluated on hold-out set |
| `recall` | REAL | |
| `accuracy` | REAL | |
| `notes` | TEXT | "trained at 3am" / "insufficient_data" / etc. |

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/predict/abandonment` | requireAuth | Current 15-min forecast |
| POST | `/api/admin/predict/train` | requireAdmin | Force retrain now |
| GET | `/api/predict/backtest?days=N` | requireAuth | "yesterday's predictions vs reality" |
| GET | `/api/predict/model` | requireAdmin | Model debug info (weights, eval metrics) |

The legacy stub at `/api/predict/abandonment` (Session 1) was returning
per-hour averages. The new implementation reuses the same path but returns
a fundamentally different response shape — protected by `predictiveAbandonmentV2`
flag.

## Acceptance criteria

1. ✅ `lib/predict.js` exports pure functions: `sigmoid`, `standardize`,
   `trainLogisticRegression`, `predictAbandonProb`, `evaluateModel`
2. ✅ Functions are deterministic (no I/O, no clock) — `now` always passed in
3. ✅ Training converges on synthetic data (clear signal → high accuracy)
4. ✅ ≥ 20 unit tests covering math primitives + training + inference + edges
5. ✅ Engine never throws on malformed input
6. ✅ DB table `predict_models` created on first boot
7. ✅ Nightly cron retrains at 03:00 CST (same scheduler as anomaly)
8. ✅ `GET /api/predict/abandonment` returns `ready:false` when no model yet
9. ✅ When ready, returns `{ probability, confidence, expectedAbandons }`
10. ✅ `POST /api/admin/predict/train` triggers retrain + writes audit log
11. ✅ Eval metrics (precision/recall/accuracy) stored with each fitted model
12. ✅ Feature-flagged behind `predictiveAbandonmentV2` (default OFF)
13. ✅ All prior 219 tests still pass
14. ✅ E2E tests for endpoints + auth gates
15. ✅ Backtest endpoint returns `[{date, predicted, actual}]` pairs

## Out of scope (Session 12+)

- Per-agent or per-queue models
- Hyperparameter tuning UI for admins
- A/B comparison between model versions
- Slack alerts when probability > threshold (extend `lib/alerts.js`)
- Auto-staffing recommendations
- UI dashboard for predictions (separate session)

## Rollout

1. Ship behind `predictiveAbandonmentV2` flag (default OFF)
2. Force a training run via `POST /api/admin/predict/train` to bootstrap
3. Observe `precision`/`recall`/`accuracy` for one week
4. If metrics are healthy (precision > 0.6), enable for one supervisor
5. Promote to all supervisors
6. Build UI dashboard (Session 12)
