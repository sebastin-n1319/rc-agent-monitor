# Schedule Adherence — Part 2 (Session 5)

**Status:** In progress
**Builds on:** Session 4 Part 1 (`docs/features/schedule-adherence.md`)
**Last updated:** 2026-05-26

## Goal

Turn the working-but-curl-only schedule API from Session 4 into a real
admin + monitor experience. After Session 5, admins get:

1. A **schedule admin dashboard** to see today's adherence at a glance
2. A **per-agent editor** with 7 day-of-week rows (no more JSON)
3. **Bulk apply** — pick a template + a set of agents → push to all
4. A **timeline visualization** for each agent (planned vs actual)
5. Quick **filters** by severity status (no-show, late, on-time)

## Non-goals

- Schedule templates as DB entities (Session 6)
- Multi-week rotation patterns
- Approved exceptions (sick day, PTO override) — manual end-date for now
- Per-agent custom break-budget input — uses global 60min default

## Architecture

```
                              schedule-admin.js
                              ─────────────────
                          window.ScheduleAdmin
                          │
                          ├── open()          → dashboard modal
                          ├── editSchedule(email) → per-agent editor
                          ├── openBulkApply() → bulk modal
                          └── close()
                                  │
                                  │ fetch
                                  ▼
              ┌───────────────────────────────────────────┐
              │ Server endpoints from Session 4:          │
              │   GET  /api/schedule-adherence            │
              │   GET  /api/schedules                     │
              │   GET  /api/schedules/:email              │
              │   GET  /api/schedules/:email/history      │
              │   PUT  /api/schedules/:email              │
              │   POST /api/schedules/bulk                │
              │   DELETE /api/schedules/:email            │
              └───────────────────────────────────────────┘
```

## Components

### 1. Dashboard modal (admin view)

Opens via `ScheduleAdmin.open()` or status bar 📅 button.

```
┌─ Schedule Adherence ────────────── 🗓 May 26 · 13 agents · ✕ ─┐
│ ┌─ Filters ────────────────────────────────────────────────┐│
│ │ [All] [Issues only] [On-time only]   Severity: [▾]       ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌─ No-show (1) ─────────────────────────────────────────┐   │
│ │ 🚫 Emma Wilson · scheduled 09:00–17:00 · no login     │   │
│ │                                          [Edit  …]    │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌─ Late (2) ────────────────────────────────────────────┐   │
│ │ ⏰ Sarah Chen · 09:32 (32 min late, 09:00 scheduled)   │   │
│ │ ┃───────━━━━━━━━━━━━━━━━━━━━━━━━━━━┃   (timeline)     │   │
│ │                                          [Edit  …]    │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                              │
│ … (collapsed groups for on-time)                            │
│                                                              │
│ [+ Add schedule to agent…]   [Bulk apply template…]         │
└──────────────────────────────────────────────────────────────┘
```

- Auto-grouped by status (no-show first, then late, early-leave, etc.)
- Inline timeline showing the gap between planned and actual
- Edit button opens per-agent editor (mode 2)
- Bottom CTAs for add/bulk

### 2. Per-agent editor

Modal with 7 weekday rows.

```
┌─ Edit Schedule · sarah.chen@adit.com ──────────────── ✕ ─┐
│  Effective from [2026-06-01 ▾]   Timezone [America/Chicago ▾] │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Mon  [☑ working]  09:00 → 17:00                      ││
│  │ Tue  [☑ working]  09:00 → 17:00                      ││
│  │ Wed  [☑ working]  09:00 → 17:00                      ││
│  │ Thu  [☑ working]  09:00 → 17:00                      ││
│  │ Fri  [☑ working]  09:00 → 17:00                      ││
│  │ Sat  [☐ off]      — — — —                            ││
│  │ Sun  [☐ off]      — — — —                            ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [View history]                  [Cancel]  [💾 Save]     │
└──────────────────────────────────────────────────────────┘
```

- Default: Mon-Fri 9-5 in America/Chicago
- "Working" toggle disables/enables the time inputs per row
- "View history" link → modal showing all prior versions
- Save → `PUT /api/schedules/:email` with `effectiveFrom` + `week`
- After save: toast + close + refresh dashboard

### 3. Bulk apply modal

```
┌─ Bulk Apply Schedule ───────────────────────── ✕ ─┐
│ Step 1: Choose template                            │
│  ○ Mon-Fri 9 AM – 5 PM (default)                   │
│  ○ Mon-Fri 8 AM – 4 PM                             │
│  ○ Tue-Sat 10 AM – 6 PM                            │
│  ○ Custom… → opens per-agent editor                │
│                                                    │
│ Step 2: Pick agents                                │
│  [☑ Select all] · 7 of 13 selected                 │
│  [☑] Sarah Chen                                    │
│  [☑] Marcus Rivera                                 │
│  [☐] Emma Wilson                                   │
│  …                                                 │
│                                                    │
│ Step 3: Effective from [2026-06-01 ▾]              │
│                                                    │
│                          [Cancel]  [Apply to 7]    │
└────────────────────────────────────────────────────┘
```

- 3 hardcoded templates this session; templates-in-DB come Session 6
- Multi-select with shift-click range, "Select all" toggle
- Apply → `POST /api/schedules/bulk` with `emails`, `effectiveFrom`, `week`
- Per-agent success/error reported in results toast

### 4. Timeline visualization

Inline mini-bar per row showing planned vs actual:

```
 09:00 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 17:00
        ┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
        09:32 ← agent's actual ← still active
```

- Grey track = scheduled window
- Orange bar = actual logged-in window (or "missing" striped pattern for no-shows)
- Updates live for in-progress shifts

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ `ScheduleAdmin` global with 4-method API stable
2. ✅ Dashboard modal renders with auto-grouped status sections
3. ✅ Severity sort: no-show → late → minor-late → on-time → day-off
4. ✅ Per-agent editor with 7 day rows + working/off toggle
5. ✅ Per-agent editor saves via `PUT /api/schedules/:email`
6. ✅ Bulk apply modal with 3 templates + multi-select agents
7. ✅ Bulk apply calls `POST /api/schedules/bulk`
8. ✅ Timeline mini-bar renders for in-progress agents
9. ✅ Filter buttons (All / Issues only / On-time only)
10. ✅ Status bar 📅 button or keyboard shortcut to open
11. ✅ Rogue widget killer + adit-reset.js whitelist updated
12. ✅ SW cache version bumped to force shell refresh
13. ✅ All E2E tests pass (existing 18 + new ones)
14. ✅ All 78 unit tests still pass
15. ✅ A11y: keyboard nav, ARIA labels, focus rings
16. ✅ Reduced-motion respected
17. ✅ Mobile bottom-sheet at <760px (reuse `.ac-overlay` responsive)
18. ✅ Feature-flagged behind `scheduleAdherenceV2`

## Out of scope (Session 6+)

- Schedule templates persisted in DB (new table: `schedule_templates`)
- Self-service request flow (agent submits change → admin approves)
- Holiday calendar overlay
- Auto-suggested schedule from observed patterns
- Slack/email notifications when schedules change

## Rollout

1. Ship behind `scheduleAdherenceV2` flag (default OFF)
2. Admin opens via keyboard shortcut `T` (team schedule) or status bar button
3. Use bulk-apply to seed defaults for all agents in one click
4. Tune for a week using real adherence data
5. Promote flag to default ON for admins
