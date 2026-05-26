# Real-Time Alerts — Part 2 (Session 3)

**Status:** In progress
**Builds on:** Session 2 Part 1 (`docs/features/real-time-alerts.md`)
**Last updated:** 2026-05-26

## Goal

Turn the working but invisible alert pipeline into a first-class supervisor
experience. After Session 3, supervisors get:

1. A persistent **bell badge** that shows unread alert count at all times
2. An **alert center modal** to triage all active alerts (ack / snooze / view detail)
3. **Instant push** delivery — alerts arrive within ~1 second, not 30
4. **Browser notifications** when the tab isn't focused (no more missed alerts)
5. A **threshold admin form** to tune the 5 rules without touching code/console
6. An **alert history page** for retrospective analysis

## Non-goals

- Per-user notification preferences (deferred to Session 4)
- Alert routing to specific roles/people (deferred)
- Alert escalation chains (deferred)
- SMS / email delivery (Session 5 — needs SendGrid)

## Architecture

```
       SERVER                              CLIENT
       ──────                              ──────
                                       
   alert_events                       Status bar bell icon
   inserts                            (always visible)
       │                                    ▲
       ▼                                    │ unread count
   broadcastSseEvent('alert', ...)          │
       │                                    │
       │ SSE message                        │
       ▼                                    │
   /api/live-stream ──────────────────► EventSource
                                            │
                                            ├──► toast (top-right)
                                            ├──► Notification API (if tab unfocused)
                                            └──► alert center modal (on click)
                                                  │
                                                  ├──► ack button → POST /api/alerts/:id/ack
                                                  └──► snooze button → POST /api/alerts/:id/snooze
```

The 30-second poll stays as a fallback for browsers that disconnect/reconnect SSE.

## Components

### 1. Alert bell (status bar)

```
┌─ statusbar ────────────────────────────────────────────────┐
│ ● Live · 14:23:01    [Search ⌘K]    🔔(3) ⌨️ 🎯 ↻ 📲       │
└────────────────────────────────────────────────────────────┘
                                       ▲
                                       │
                              click → opens alert center
```

- Hidden when `unread === 0`
- Yellow `●` dot if any `warning`, red `●` if any `critical`
- Number badge shows total unread

### 2. Alert center modal

```
┌─ Alert Center ────────────────────────────── ✕ ─┐
│  3 active                          Mark all read │
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ 🚨 critical · 2 min ago                     ││
│  │ Abandonment rate is 22.0% (11/50 calls)…    ││
│  │                            [Snooze ▾] [Ack] ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ ⚠ warning · 5 min ago · Sarah Chen          ││
│  │ Sarah Chen has been on a call for 22m 14s.  ││
│  │                            [Snooze ▾] [Ack] ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  History (last 30 days)  →                       │
└──────────────────────────────────────────────────┘
```

- Snooze dropdown: 15min, 1h, until tomorrow, custom
- Ack is instant — row fades + removes from list
- Footer link to history page

### 3. Admin threshold form (under Access Control tab)

Replaces the curl/console pattern. Renders 5 cards (one per alert) with:
- Enable/disable toggle
- Severity selector (info/warning/critical)
- Cooldown input (seconds)
- Per-rule threshold inputs (callMinutes, ratePercent, etc.)
- "Save" button per row — saves only changed row
- "Reset to defaults" button per row
- "Fire test" button per row (synthetic alert)

### 4. Alert history (under new tab `History`, admin only)

- Table with columns: Time · Key · Severity · Body · Agent · Acked By · Acked At
- Filters: last 24h / 7d / 30d, severity, key, only-acked / only-unacked
- CSV export
- Re-uses existing `/api/alerts/recent` endpoint

## SSE push delivery

The existing `/api/live-stream` SSE endpoint already broadcasts presence updates.
We extend it with a new event type:

```
event: alert
data: {"id":42,"key":"stuck_call","severity":"warning","body":"…","createdAt":"…"}
```

Server side:
- Implement `global.broadcastSseEvent(type, payload)` if not present
- Call it from `runAlertEvaluator()` after each `insertAlertEvent()`

Client side:
- Add a handler in the existing EventSource for `event: alert`
- Show toast + update bell badge + (if unfocused) Notification API

Reconnection / disconnect handling — the existing live-stream client already
auto-reconnects. The 30-second polling fallback ensures no alerts are missed
during reconnection windows.

## Browser notifications (graceful)

Permission flow:
1. First alert when tab is unfocused — show inline banner asking permission
2. Granted → use Notification API for all future alerts
3. Denied → silently fall back to toast only (never re-prompt)
4. Default state → keep falling back to toast, prompt only once per week

Notification content:
- Title: severity emoji + key name (e.g., "🚨 Abandonment Spike")
- Body: alert.body (truncated to 100 chars)
- Tag: alert.key (so consecutive same-key alerts replace, not stack)
- Icon: /adit-logo-dark.png
- requireInteraction: false (auto-dismiss)
- silent: false (use system sound)

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ Bell icon present in status bar, hidden when unread = 0
2. ✅ Bell shows total unread count + severity color (warning/critical)
3. ✅ Clicking bell opens alert center modal
4. ✅ Modal renders all active alerts with body + relative timestamp + agent
5. ✅ Snooze dropdown shows 4 options + custom; POST updates DB
6. ✅ Ack button instantly marks row acked, fades + removes
7. ✅ "Mark all read" acks every visible row
8. ✅ History page renders last N days with filters (severity, key, date)
9. ✅ History CSV export works
10. ✅ Admin threshold form renders 5 rule cards under Access Control
11. ✅ Form changes persist to DB; audit log entry created
12. ✅ "Fire test" button on each rule produces an alert in `<5` seconds
13. ✅ SSE delivery: synthetic alert appears in toast in `<2` seconds (not 30s)
14. ✅ Notification API: tab unfocused → OS notification appears (if granted)
15. ✅ Notification permission denied → graceful fallback to toast only
16. ✅ At least 4 new Playwright E2E tests covering critical UI flows
17. ✅ All existing tests still pass (41 from prior sessions)
18. ✅ A11y: keyboard navigable, screen reader labels on bell/modal/buttons
19. ✅ Reduced-motion respected (no springs/bounces if `prefers-reduced-motion`)
20. ✅ Mobile responsive (modal becomes bottom-sheet at <600px)

## Out of scope (deferred)

- Per-user mute / "do not disturb" hours
- Alert routing rules (escalate if not acked in X min)
- Alert grouping (deduplicate same-agent alerts into one card)
- Slack/Teams webhook delivery
- Mobile push (would need separate native infra)

## Rollout

1. Ship behind flag `alertsV2` (default OFF) — admin testers only
2. Internal soak for 3 days — gather threshold feedback
3. Enable for all admins
4. Promote to default ON for everyone
5. Remove the old `alertCenter` shim from the polling stub
