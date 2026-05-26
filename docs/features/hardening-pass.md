# Hardening Pass (Session 9)

**Status:** In progress
**Last updated:** 2026-05-27
**Scope:** Cross-cutting polish across 8 sessions of shipped features

## Why now

After 8 sessions of feature work, the codebase has accumulated drift. A
deliberate hardening pass keeps every shipped feature at "top-notch" quality
the user explicitly asked for at the start of the 3-week plan.

This session is **explicitly not adding new features**. The acceptance test
is: every existing flow keeps working, and the cross-cutting metrics improve.

## Audit findings (real, measured)

| Area | Finding | Action |
|---|---|---|
| a11y | `offline-bridge.js` injects a button with **0** `aria-label`s | Add labels to all dynamically-created controls |
| a11y | Modal focus is not trapped — Tab can escape into the page underneath | Add a focus-trap helper used by every overlay |
| a11y | No skip-to-content link for screen readers | Add `<a class="skip-link">` |
| code drift | **39** `console.*` calls left in `server.js` despite the structured logger | Replace with `log.info / warn / error` |
| reliability | **109** `catch` blocks across **116** routes — 7 untracked | Audit + add catches with structured logging |
| perf | `index.html` is **1.3MB / 24,645 lines** | Defer non-critical inline scripts (full split = Session 10) |
| perf | **9** external CDN scripts; some block first paint | Add `async`/`defer` where safe |
| security | `brace-expansion` moderate CVE (auto-fixable) | `npm audit fix` |
| security | No `Content-Security-Policy` header | Add a permissive baseline CSP |
| security | Rate-limiting present but inconsistent | Document the rules; spot-fix obvious gaps |

## Goals

1. **A11y** — keyboard nav + screen-reader friendly. Focus-trap in modals. Skip link. All buttons labeled.
2. **Logging hygiene** — zero `console.*` in `server.js`. Structured logger only.
3. **Error coverage** — every async route has try/catch + structured log on failure.
4. **Security** — `npm audit` clean. Permissive CSP header. Express rate-limit doc.
5. **Documentation** — `OPERATIONS.md` runbook covering all 8 sessions of features.
6. **CI signal** — Lighthouse a11y score target ≥ 90 (we'll measure, fix top 3 issues).

## Non-goals (Session 10+)

- Splitting `index.html` into ES modules (multi-week refactor)
- Migration to TypeScript
- Full CSP report-only deployment loop
- React/Vue/etc. rewrite of any UI module

## Acceptance criteria

1. ✅ `offline-bridge.js` button has aria-label + title
2. ✅ Focus-trap helper added (lib or inline) and used by every `.*-overlay` modal
3. ✅ Skip-to-content link present + functional in `index.html`
4. ✅ `console.*` count in `server.js` drops from 39 → 0 (or close, only intentional ones remain)
5. ✅ Every `app.get / .post / .put / .delete` handler in server.js has a try/catch
6. ✅ `npm audit` reports 0 moderate+ vulnerabilities
7. ✅ Content-Security-Policy header set with permissive baseline
8. ✅ `docs/OPERATIONS.md` exists with: feature flags table, keyboard shortcuts cheat-sheet, endpoint glossary, rollout instructions
9. ✅ All prior 202 tests still pass (regression check)
10. ✅ At least 5 new tests added for the focus-trap helper / CSP header

## Out of scope

- New features
- UI redesign
- New endpoints (unless a missing-catch handler needs one)
- DB schema changes
