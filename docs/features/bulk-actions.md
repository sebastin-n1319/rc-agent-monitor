# Bulk Admin Actions (Session 10)

**Status:** In progress
**Replaces:** the rough Session 1 stub (`bulkActions` flag, prompt+toast only)
**Last updated:** 2026-05-27

## Problem

Supervisors today manage 13+ agents and frequently need to do the same thing
to many of them at once. The current options are:
- Click into each agent individually (toil; ~5s per agent → 1 minute per round)
- Use the Session 1 stub which was a `prompt()` + fake success toast (Option-C
  flagged off, never wired to a real backend)
- Use Sessions 4-5's bulk-apply *for schedules only*

For everyday operations like "send everyone a message" or "force-logout a stale
session", there's no good path. Supervisors fall back to direct DB edits or
asking the engineering team.

## Goals

1. **One real backend endpoint** — `POST /api/admin/bulk-actions` that
   accepts an action enum + a list of emails + a payload, performs each
   action atomically per-agent, returns a per-agent result
2. **Strict action whitelist** — no arbitrary fields. The server defines
   the supported actions; the client can only request from the list.
3. **Audit-logged** — every bulk operation writes one summary row plus one
   per-agent row to `audit_log`, so you can answer "who logged out which
   agents at 2:14pm" months later.
4. **Idempotent where safe** — re-sending the same bulk request (e.g. the
   browser retried because the network blipped) doesn't duplicate sends.
5. **Confirmation + diff preview** — before executing, the UI shows
   "About to do X to N agents: …" with a confirm button. No more silent
   "did you really mean it?" bugs.
6. **Per-agent failure isolation** — one bad email doesn't abort the batch.
   Results are reported per-row.
7. **Self-contained UI** — new `bulk-actions.js/.css` module, multi-select
   toolbar pattern matching schedule-admin's bulk-apply.

## Supported actions (v1)

| Action key | What | Payload | Safety |
|---|---|---|---|
| `notify` | Send a Google Chat DM to each agent | `{ message: string ≤500 }` | Reversible, low blast radius |
| `set_breakbot_enabled` | Toggle whether an agent sees the Break Bot UI | `{ enabled: boolean }` | Reversible — affects only their UI |
| `clear_session` | Force-logout an agent (deletes their app_session row) | `{}` | Recoverable — they just log in again |
| `set_role` | Promote/demote between 'agent' and 'admin' | `{ role: 'agent'\|'admin' }` | High-risk → triple-confirmation in UI |

**Deferred to a later session** (need design discussion):
- `force_status` — direct manipulation of RC presence is risky; admins should
  call RingCentral support instead
- `send_break_event` — same idempotency story as personal break events, would
  need careful per-agent state validation

## Architecture

```
   Supervisor selects 5 agents → clicks "Bulk apply…"
                                ▼
   ┌────────────────────────────────────────────┐
   │ bulk-actions.js                            │
   │   1. Render action picker (4 options)      │
   │   2. Render payload form for chosen action │
   │   3. Show preview: "{action} to N agents"  │
   │   4. Confirm → POST /api/admin/bulk-actions│
   │      { action, payload, emails, requestId }│
   └─────────────────┬──────────────────────────┘
                     │
                     ▼
   ┌────────────────────────────────────────────┐
   │ POST /api/admin/bulk-actions               │
   │   • requireAdmin                           │
   │   • Validate action in WHITELIST           │
   │   • Validate payload shape per action      │
   │   • Idempotency: skip if requestId already │
   │     used in last 24h                       │
   │   • For each email:                        │
   │     - Run the action's handler             │
   │     - Catch errors per-agent               │
   │     - Append to results array              │
   │   • Insert audit_log summary row           │
   │   • Insert audit_log per-agent rows        │
   │   • Return { ok, results: [{email, ok}…] } │
   └────────────────────────────────────────────┘
                     │
                     ▼
   ┌────────────────────────────────────────────┐
   │ Toast: "✓ Notify sent to 5 agents,         │
   │         2 failed"                          │
   │ Modal: per-agent ✓/✗ breakdown             │
   └────────────────────────────────────────────┘
```

## Database

No new tables. Two reuses:

1. **`audit_log`** — existing table. Bulk action writes:
   - 1 summary row: `action='bulk_<key>_summary'`, `subject=<requester>`, `detail='emails=N,ok=M'`
   - N detail rows: `action='bulk_<key>'`, `subject=<agent_email>`, `detail=<result>`

2. **In-memory idempotency cache** — a `Map<requestId, {at, result}>` with 24h
   TTL. Lives in `server.js` next to the existing `_cache`. No DB column needed.

## Endpoint contract

### `POST /api/admin/bulk-actions`

**Request:**
```json
{
  "action": "notify",
  "payload": { "message": "Stand-up in 5 min" },
  "emails": ["alice@adit.com", "bob@adit.com"],
  "requestId": "client-uuid-v4"
}
```

**Response (success):**
```json
{
  "success": true,
  "action": "notify",
  "requestId": "client-uuid-v4",
  "summary": { "total": 2, "ok": 2, "failed": 0 },
  "results": [
    { "email": "alice@adit.com", "ok": true },
    { "email": "bob@adit.com", "ok": true }
  ]
}
```

**Response (partial failure):**
```json
{
  "success": true,
  "summary": { "total": 2, "ok": 1, "failed": 1 },
  "results": [
    { "email": "alice@adit.com", "ok": true },
    { "email": "ghost@adit.com", "ok": false, "error": "agent not found" }
  ]
}
```

**Status codes:**
- `200` — at least one agent processed (even if some failed)
- `400` — invalid action / payload shape
- `401/403` — auth gate
- `404` — emails list empty
- `409` — same `requestId` was used in last 24h (idempotent replay returns
  the original result with HTTP 200 + `replayed: true`)

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ `POST /api/admin/bulk-actions` exists and requires admin
2. ✅ Action whitelist enforced — unknown action returns 400 with `code: 'unknown_action'`
3. ✅ Payload shape validated per action (e.g. `notify` requires `message`)
4. ✅ Per-agent failure does not abort the batch
5. ✅ Each result entry has `email`, `ok`, optional `error`
6. ✅ `requestId` idempotency: replays return the original result with `replayed:true`
7. ✅ Audit log: 1 summary + N detail rows per bulk operation
8. ✅ New UI module `public/bulk-actions.js` + matching CSS
9. ✅ Public API: `BulkActions.open({emails})`, `.close()`
10. ✅ UI: action picker → payload form → confirm preview → execute → per-agent result
11. ✅ Multi-select toolbar attached to existing agent table (replaces Session 1 stub)
12. ✅ Old rough stub removed — `bulkActions` flag default off, `bulkActionsV2` introduced
13. ✅ At least 8 unit tests for the action-handler functions
14. ✅ At least 6 E2E tests for asset serving + auth gates + API contract
15. ✅ All prior 210 tests still pass
16. ✅ Feature-flagged behind `bulkActionsV2` (default OFF)
17. ✅ Rogue-widget-killer + adit-reset whitelist updated
18. ✅ SW cache version bumped (v1.5.0 → v1.6.0)
19. ✅ Each action's handler emits a structured log line
20. ✅ `role='admin'` action requires the requester to NOT be demoting themselves
    (safety — prevents accidental self-lockout)

## Out of scope (Session 11+)

- Bulk schedule changes (already exists in Session 5 — `POST /api/schedules/bulk`)
- Custom action plugins
- Bulk import/export agents (separate feature)
- Slack/Teams delivery (notify currently uses Google Chat webhook)
- Saved bulk-action templates ("send my standard standup message")
- Undo / rollback for the destructive actions (clear_session, set_role)

## Rollout

1. Ship behind `bulkActionsV2` flag (default OFF)
2. Admin enables via DevTools: `setFlag('bulkActionsV2', true); location.reload()`
3. Test with a 2-agent batch first (notify is safest)
4. Soak for a week with the 3 core admins
5. Enable for all admins
6. Consider extending the action list based on real usage feedback
