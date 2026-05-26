# Schedule Adherence (#14)

**Status:** Session 4 Part 1 — engine + DB + API
**Last updated:** 2026-05-26
**Replaces:** the rough hardcoded 9–5 stub from Session 1

## Problem

Today the system has *no concept* of when agents are supposed to be working.
That makes it impossible to answer:

- Who logged in late this morning?
- Who left before their shift ended?
- Who hit their break budget vs. who skipped breaks?
- Is the floor covered during scheduled hours, or are we relying on goodwill?

The Session 1 stub assumes everyone works 9-5 Central. That's wrong for:
- Agents covering early/late/weekend shifts
- Half-days, on-call rotations, split shifts
- New hires in training (different schedule)
- Holidays / approved exceptions

## Goals

1. **Configurable schedules** per agent, per day-of-week
2. **Versioned** — schedule changes don't rewrite history
3. **Pure adherence engine** — deterministic, testable, no I/O
4. **Real `/api/schedule-adherence` endpoint** — not the stub
5. **Backwards compatible** — agents without a configured schedule fall back to a sensible default (rather than throwing)
6. **Audit-logged** — every schedule change tracked

## Non-goals (deferred to Session 5)

- Admin UI to set schedules (curl/API only this session)
- Timeline visualization
- Schedule templates / bulk assignment UI
- Approved exceptions (sick day, PTO override)
- Multi-week rotations
- Auto-detection of regular patterns

## Data model

### `agent_schedules` table

One row per (agent, day_of_week, effective_from). When a schedule changes,
insert a *new* row with a later `effective_from` instead of updating. This
preserves history so retrospective reports stay accurate.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `agent_email` | TEXT NOT NULL | matches monitored_agents.email |
| `day_of_week` | INTEGER NOT NULL | 0 = Sunday … 6 = Saturday |
| `start_time` | TEXT NOT NULL | `HH:MM` 24h in `timezone` |
| `end_time` | TEXT NOT NULL | `HH:MM` 24h in `timezone` (next day if < start) |
| `timezone` | TEXT NOT NULL DEFAULT 'America/Chicago' | IANA tz name |
| `is_working_day` | INTEGER NOT NULL DEFAULT 1 | 0 = scheduled day off |
| `effective_from` | TEXT NOT NULL | `YYYY-MM-DD` |
| `effective_to` | TEXT | `YYYY-MM-DD` — null = open-ended |
| `created_at` | DATETIME | autoset |
| `created_by` | TEXT | email of admin who set it |

**Lookup**: for agent X on date D, take the most-recent row where
`effective_from ≤ D` AND (`effective_to IS NULL` OR `effective_to ≥ D`)
AND `day_of_week` matches D's weekday. If no row, fall back to default.

### Default schedule (no DB row)

When no schedule is configured:
```
Mon-Fri: 9:00 AM – 5:00 PM America/Chicago
Sat/Sun: not a working day
```

This matches the original stub behavior so nothing breaks.

## Adherence engine — pure functions

`lib/schedule.js` exports:

```js
DEFAULT_SCHEDULE        // {dayOfWeek → {start, end, isWorkingDay, timezone}}
ADHERENCE_STATUSES      // ['on-time', 'minor-late', 'late', 'no-show', 'early-leave', 'overstay', 'day-off', 'pending']
TOLERANCES              // {minorLateMin: 5, lateMin: 15, earlyLeaveMin: 5, breakOverMin: 5}

resolveScheduleForDate(schedulesForAgent, date)
  // pick the version active on that date for that weekday
  // returns {start, end, isWorkingDay, timezone, source: 'configured'|'default'}

evaluateAdherence({schedule, actuals, now})
  // actuals = { firstLoginAt, lastLogoutAt, breakMinutes, scheduledBreakMinutes }
  // returns { status, startVarianceMin, endVarianceMin, breakOverageMin, summary }

evaluateBulk(schedulesByAgent, actualsByAgent, now)
  // returns array of {email, ...adherence} for every agent
```

All functions are deterministic, take `now` as a parameter, never throw.

## Status logic

For a single agent on a single date:

| Condition | Status |
|---|---|
| `isWorkingDay === false` | `day-off` |
| `firstLoginAt == null` AND `now > scheduledEndAt` | `no-show` |
| `firstLoginAt == null` AND `now < scheduledStartAt` | `pending` |
| `firstLoginAt` within ±5 min of `start` | `on-time` |
| `firstLoginAt` 5–15 min after `start` | `minor-late` |
| `firstLoginAt` >15 min after `start` | `late` |
| `lastLogoutAt` >5 min before `end` AND `now > end` | `early-leave` |
| `lastLogoutAt` >15 min after `end` | `overstay` |
| `breakMinutes` > policy + 5 min | `break-overage` (compounding flag) |

Note: a single day can have multiple flags (e.g., `late` + `break-overage`).
The engine returns the *primary* status plus a `flags` array.

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/schedules` | admin | list all schedules (current effective) |
| GET | `/api/schedules/:email` | auth (self) or admin | get one agent's schedule |
| GET | `/api/schedules/:email/history` | admin | versioned history |
| PUT | `/api/schedules/:email` | admin | set or replace agent's schedule (creates new effective row) |
| POST | `/api/schedules/bulk` | admin | apply a schedule to multiple agents |
| DELETE | `/api/schedules/:email` | admin | end-date the current schedule (falls back to default) |
| GET | `/api/schedule-adherence?date=YYYY-MM-DD` | auth | adherence for all agents on that date |
| GET | `/api/schedule-adherence/:email?days=30` | auth (self) or admin | per-agent adherence history |

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ `lib/schedule.js` is pure — no `Date.now()`, no DB, no `fetch`
2. ✅ ≥ 15 unit tests covering each status + edge cases
3. ✅ Default schedule (Mon-Fri 9-5 CST) used when no DB row exists
4. ✅ Schedule versioning — old rows preserved when new effective_from added
5. ✅ Cross-midnight shifts handled (e.g., 22:00-06:00 night shift)
6. ✅ DST transition days handled (no crash, correct hour count)
7. ✅ `GET /api/schedule-adherence` returns rows for every monitored agent
8. ✅ Endpoint is auth-gated (auth) and self-or-admin where applicable
9. ✅ All schedule mutations write to audit_log
10. ✅ Engine never throws — tested with malformed/null input
11. ✅ Existing tests still pass (59 from sessions 1-3)
12. ✅ Feature flag `scheduleAdherenceV2` gates client consumption

## Out of scope for this session

- Admin UI form (Session 5)
- Timeline visualization (Session 5)
- Bulk assignment UI
- Exception handling for PTO / sick days
- Multi-week rotation patterns
- Auto-suggestions for irregular agents

## Rollout

1. Ship Part 1 — engine + DB + API behind flag (default OFF for client)
2. Seed default schedules for all agents (admin task — one-time POST)
3. Tune for one week against real login data
4. Ship Part 2 — admin UI + viz
5. Enable flag for admins
6. Promote to all supervisors
