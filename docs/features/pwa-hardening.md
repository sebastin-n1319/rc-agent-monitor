# PWA Hardening (Session 8)

**Status:** In progress
**Builds on:** Session 1 (basic SW + manifest from `#21+#5 Part 1`)
**Last updated:** 2026-05-27

## Problem

Today the app:
- Has a service worker but its cache strategy is naive (network-first with
  in-memory stale tolerance only)
- Has no way to handle break-bot actions that fail because the agent's
  Wi-Fi blipped — the action just **disappears** and the agent has to
  remember to click again
- Doesn't survive a true offline scenario — the UI loads from cache, but
  the agent can't take any action until the network is back
- Has no UI feedback that the app is offline, much less that anything's queued

Agents at Adit are mobile (between desk/break room/parking lot). They will
have spotty Wi-Fi. We need to make actions durable across that flakiness.

## Goals

1. **Durable break-bot actions** — if the user clicks "BRB Out" with no
   network, the action is queued locally and synced when the network returns
2. **Background sync** — even if the agent closes the tab, the queued action
   syncs when the OS detects connectivity (where supported)
3. **Visible state** — agent can see "offline · 2 queued" in the status bar
   and force a sync attempt manually
4. **Resilient caching** — versioned caches that don't strand users on old
   shells; clear migration path on every version bump
5. **No data loss on collision** — if the same action is replayed twice
   (e.g., the user clicks then closes the laptop), the server idempotently
   accepts only the first
6. **Tested** — both the IDB queue and the SW logic have unit/E2E coverage

## Non-goals

- True P2P sync between devices
- Conflict resolution for multi-tab edits (server already serializes)
- Encrypted local storage (queue holds break-event records, not PII)
- Native push notifications when sync completes (Session 9 maybe)

## Architecture

```
                ┌─────────────────────────────────────────────┐
                │  User clicks "BRB Out" in the Break Bot    │
                └─────────────────────┬───────────────────────┘
                                      │
                          navigator.onLine? ── yes ──► POST /api/break-events
                                      │ no
                                      ▼
                ┌─────────────────────────────────────────────┐
                │  lib/offline-queue.js                        │
                │   • Generate idempotency key (uuid)          │
                │   • IDB: append to "outbox" object store     │
                │   • Update UI: show pending pill             │
                └─────────────────────┬───────────────────────┘
                                      │
                          navigator.onLine = true (event)
                          OR background sync fires
                                      │
                                      ▼
                ┌─────────────────────────────────────────────┐
                │  drainQueue()                                │
                │   • Pop oldest                               │
                │   • POST /api/break-events with X-Idempo header │
                │   • On success: delete from IDB              │
                │   • On 4xx (final): move to "dead" store     │
                │   • On 5xx/network: leave in queue, retry    │
                └─────────────────────────────────────────────┘

           ┌──────────────────────────────────────┐
           │  Service worker (sw.js v1.5.0)       │
           │   • Versioned caches with cleanup    │
           │   • Network-first for API responses  │
           │   • Stale-while-revalidate for shell │
           │   • 'sync' event → drainQueue()      │
           │   • 'message' postMessage → drain    │
           └──────────────────────────────────────┘
```

## Database / storage shape

### IndexedDB: database `adit-offline`, version 1

**Object store: `outbox`**

| Key | Type | Notes |
|---|---|---|
| `id` (auto) | number | primary key |
| `endpoint` | string | e.g. `/api/break-events` |
| `method` | string | always 'POST' for now |
| `body` | object | the JSON payload |
| `idempotencyKey` | string | UUID generated client-side |
| `enqueuedAt` | number | epoch ms |
| `attempts` | number | retry count |
| `lastError` | string | last server error message |
| `lastAttemptAt` | number | epoch ms |

**Object store: `dead`**

Same shape as `outbox` plus `deadAt` (when we gave up).
Used for retrospective debugging — never re-tried.

### Server-side: idempotency

The server already accepts `POST /api/break-events`. We extend it to:
- Read `X-Idempotency-Key` header
- Check if a break_event with that key exists already
- If yes → return 200 with the original record
- If no → insert, return 201

This makes retries safe. (Schema: add `idempotency_key TEXT UNIQUE` column.)

## Module shape

### `lib/offline-queue.js` — pure logic + IDB adapter

```js
const Q = require('./lib/offline-queue');
await Q.init();                              // open IDB
const handle = await Q.enqueue({             // returns { id, idempotencyKey }
  endpoint: '/api/break-events',
  body: { action: 'BRB_OUT' }
});
const count = await Q.size();                // pending count
const result = await Q.drain({ fetch });     // returns { sent, failed, dead }
```

All public methods async. No DOM access — works in SW context too via the
same module (shipped as both ESM-ish and `self.OfflineQueue` global from SW).

### `sw.js` — caches + sync handler

- Bump `CACHE_VERSION` to `adit-v1.5.0`
- Three cache buckets:
  - `shell-v1.5.0` — HTML/CSS/JS, stale-while-revalidate
  - `assets-v1.5.0` — fonts, images, cache-first
  - `api-v1.5.0` — last-known good API responses, network-first
- `install` event pre-caches the shell
- `activate` deletes any cache not in current version set
- `fetch` event dispatches by URL pattern
- `sync` event (where supported): drain the outbox
- `message` event: lets the client trigger a drain manually

## Client integration

`sendBreakAction()` (existing global) gets wrapped:

```js
const original = window.sendBreakAction;
window.sendBreakAction = async function(action, btn) {
  if (navigator.onLine) {
    return original.call(this, action, btn);
  }
  // Queue for later
  await OfflineQueue.enqueue({
    endpoint: '/api/break-events',
    body: { action },
    idempotencyKey: uuid()
  });
  showToast('📡 Offline — action queued, will sync when back online', 'warning', 4000);
  updateOfflinePill();
};
```

The original handler stays in charge when online — no logic change for the
happy path.

## UI

A small **offline pill** in the status bar, between the live dot and the clock:

```
●Live · 14:23:01 · 📡offline · 2 queued · [Sync now]
```

- Visible only when `!navigator.onLine` OR `queueSize > 0`
- "Sync now" forces a drain attempt
- Auto-hides when online + queue empty
- Subscribes to `online`/`offline` window events + a custom `queue-changed` event

## Acceptance criteria

A condition is met when **every** statement below is verifiable:

1. ✅ `lib/offline-queue.js` exports `init`, `enqueue`, `drain`, `size`, `peek`
2. ✅ Module uses IndexedDB when present, in-memory Map fallback when not
3. ✅ `enqueue()` generates a UUID if one isn't provided
4. ✅ `drain(opts)` retries idempotency-keyed POSTs and removes successes
5. ✅ 4xx responses move to `dead` store; 5xx/network errors keep in `outbox`
6. ✅ At least 12 unit tests covering enqueue/drain/dead/size/peek edges
7. ✅ Service worker bumped to v1.5.0
8. ✅ SW has 3 versioned caches (shell, assets, api) + cleanup on activate
9. ✅ SW handles `sync` event (drain) where supported
10. ✅ SW handles `message` event to allow manual drain trigger
11. ✅ `sendBreakAction` wrapped — offline path queues, online path unchanged
12. ✅ Server-side idempotency: `X-Idempotency-Key` header honored
13. ✅ DB schema: `break_events.idempotency_key TEXT UNIQUE` added
14. ✅ Offline pill renders in status bar when offline OR queue non-empty
15. ✅ "Sync now" button drains and shows result toast
16. ✅ E2E test: SW registers, IDB opens, OfflineQueue API stable
17. ✅ All prior 170 tests still pass
18. ✅ Feature-flagged behind `offlineQueueV2` (default OFF)
19. ✅ Cache version bumped → forces shell refresh

## Out of scope (Session 9+)

- Conflict resolution for two devices acting simultaneously
- Encrypted offline storage
- Native push notifications when sync completes
- Offline state for OTHER actions (only break-bot for now)
- Battery-aware throttling

## Rollout

1. Ship behind `offlineQueueV2` flag (default OFF)
2. Internal soak: admin enables for self, takes laptop to coffee shop, takes
   break-bot actions on/off Wi-Fi, verifies the queue drains correctly
3. Enable for one pilot agent for a week
4. Promote to all agents
5. Consider extending to other endpoints (handoff notes, wellness check-ins)
