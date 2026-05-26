# Real-Time Alerts — Live Test Plan

**Production URL:** `https://rc-t1cs-monitor.up.railway.app`
**Deployed commit:** `8ff32ce` (Session 2 Part 1)

This runbook walks through validating the alert system against live production
data. Estimated time: 15 minutes hands-on, then check back in 1 hour.

## Part 1 — Smoke test (no auth needed, 30 seconds)

Anyone can run this; it just confirms the deploy is live and routes work.

```bash
curl -s https://rc-t1cs-monitor.up.railway.app/healthz | jq
# Expect: {"server":"ok","db":"ok",...}

curl -s -o /dev/null -w "%{http_code}\n" https://rc-t1cs-monitor.up.railway.app/api/alerts/active
# Expect: 401  (auth required — correct behavior)
```

## Part 2 — Live UI test (5 minutes, requires admin login)

### Step 1. Open the live app

Go to https://rc-t1cs-monitor.up.railway.app/ and log in with your @adit.com Google account.

### Step 2. Open DevTools console (Cmd+Option+J)

Paste this whole block. It will:
1. Confirm you're authenticated
2. Show current threshold config
3. Fire a synthetic alert
4. Confirm the toast appears within 30 seconds

```js
(async function liveAlertTest(){
  console.log('🧪 Adit alert system — live test starting…');

  // 1. Confirm session — /api/session returns current session via cookie.
  // (NOT /api/role-check — that one requires ?email= and is used during
  // OAuth pre-check, not for current-session lookup.)
  const me = await fetch('/api/session', { credentials: 'same-origin' })
    .then(r => r.json()).catch(()=>null);
  console.log('1. Session:', me?.success ? `${me.email} (${me.role})` : 'NO SESSION — please log in first');
  if (!me?.success) return;

  // 2. Show current thresholds
  const t = await fetch('/api/alerts/thresholds', { credentials: 'same-origin' }).then(r => r.json());
  console.log('2. Current thresholds:');
  console.table(Object.entries(t.thresholds).map(([k, v]) => ({
    key: k, enabled: v.enabled, severity: v.severity,
    cooldown_s: v.cooldown_seconds, threshold: JSON.stringify(v.threshold)
  })));

  // 3. Read active alerts (currently active in DB)
  const active = await fetch('/api/alerts/active', { credentials: 'same-origin' }).then(r => r.json());
  console.log('3. Currently active alerts:', active.counts);
  console.table(active.alerts.map(a => ({
    id: a.id, key: a.key, severity: a.severity,
    body: a.body.slice(0, 60), createdAt: a.createdAt
  })));

  // 4. Fire a synthetic alert via the admin endpoint
  if (me.role === 'admin') {
    const fire = await fetch('/api/admin/alerts/test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'stuck_call',
        severity: 'warning',
        body: 'Live test alert — fired ' + new Date().toLocaleTimeString()
      })
    }).then(r => r.json());
    console.log('4. Test alert fired:', fire);
    console.log('   → Toast should appear within 30 seconds');
  } else {
    console.log('4. Skipping fire — admin only');
  }

  // 5. Manual poll to confirm round-trip
  setTimeout(async () => {
    const recheck = await fetch('/api/alerts/active', { credentials: 'same-origin' }).then(r => r.json());
    console.log('5. Post-fire count:', recheck.counts);
    const testRows = recheck.alerts.filter(a => a.body.includes('Live test'));
    console.log('   Test alerts visible:', testRows.length);
  }, 4000);

  console.log('✅ Test complete — watch top-right for a yellow ⚠ toast.');
})();
```

### Expected outcomes

| Step | What you should see |
|---|---|
| 1 | `Session: admin` (or `agent` if you're an agent) |
| 2 | Table of 5 rows — `abandonment_spike`, `stuck_call`, `queue_backup`, `long_aux`, `coverage_gap`, all `enabled=1` |
| 3 | Active alerts (probably 0 or a few real ones if any rules are tripping) |
| 4 | `{ success: true, id: <number> }` if admin |
| 5 | At least 1 row matching "Live test"; **a yellow ⚠ toast appears in top-right** |

### If the toast doesn't appear

1. Open Network tab and watch `/api/alerts/active` — it should be polled every 30s.
2. Check that `flag('alerts')` returns `true` in console.
3. Look for errors in Application → Service Workers (the SW might be returning stale data).

## Part 3 — Tune a threshold (admin only)

While DevTools is still open, try lowering the `stuck_call` threshold to 1 minute
so it fires on any real agent currently on a call:

```js
await fetch('/api/alerts/thresholds/stuck_call', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ threshold: { callMinutes: 1 } })
}).then(r => r.json());
```

Wait up to 30 seconds. If any agent has been on a call for more than 1 minute,
you'll get a real production alert. **To revert:**

```js
await fetch('/api/alerts/thresholds/stuck_call', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ threshold: { callMinutes: 18 } })
}).then(r => r.json());
```

## Part 4 — Observe for 1 hour

The cron runs every 30 seconds. Over an hour you should see:
- 120 cron evaluations (`alert_evaluator_failed` should be 0)
- 0 or more `alert_fired` events depending on real conditions
- Cooldown should prevent same-key alerts from firing more than once per
  `cooldown_seconds` window (default 5–10 min depending on key)

To inspect logs after an hour, check Railway → Deployments → Logs and filter for
`alert_`:

```
alert_cron_started
alert_fired           ← good, a real alert triggered
alert_skipped_cooldown ← good, dedup working
alert_acked           ← a supervisor acknowledged
alert_evaluator_failed ← bad, investigate
```

## Quick reference — alert keys & default thresholds

| Key | Trigger | Default |
|---|---|---|
| `abandonment_spike` | abandoned / total ≥ X% over last 15 min | 15%, min 5 calls |
| `stuck_call` | agent on single call ≥ X min | 18 min |
| `queue_backup` | depth ≥ X for ≥ Y min | 5 callers, 3 min |
| `long_aux` | agent in BRB/break/training ≥ X min | 25 min |
| `coverage_gap` | 0 available for ≥ X min, business hours | 2 min, 9am–5pm CST |

## Resetting any test data

If the test alerts clutter `/api/alerts/active`, ack them all:

```js
const a = await fetch('/api/alerts/active').then(r => r.json());
for (const x of a.alerts.filter(x => x.body.includes('TEST') || x.body.includes('Live test'))) {
  await fetch(`/api/alerts/${x.id}/ack`, { method: 'POST' });
}
console.log('Acked', a.alerts.length, 'test alerts');
```

## What to report back

After the test, let me know:
1. Did the toast appear? (yes/no, what color)
2. Anything weird in DevTools console or Network tab?
3. Any real `alert_fired` events in the first hour?
4. Any false positives or alerts that fired when they shouldn't have?

That last item drives threshold tuning for Session 3.
