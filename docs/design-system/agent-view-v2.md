# Agent View V2 — Design System

**Status:** In progress (Session 1 of 15)
**Owner:** UX/Eng
**Last updated:** 2026-05-26

## Goal

Redesign the 6 agent-facing pages (`dashboard`, `breakbot`, `bonus`, `tickets`, `hall`, `writer`) using a premium SaaS visual language. Inspired by ui-ux-pro-max patterns and Motion.dev spring physics.

## Principles

1. **Strict 4/8 spacing grid** — no arbitrary pixel values
2. **Typographic hierarchy** — clear scale from `--av2-t-xs` (11px) to `--av2-t-hero` (56px)
3. **Motion as a first-class citizen** — every state change has a spring curve
4. **Accessibility built-in** — all interactive elements have visible focus, ARIA labels, semantic landmarks
5. **Reduced-motion respected** — `prefers-reduced-motion: reduce` zeros out all transitions
6. **Mobile-first responsive** — breakpoints at 600px and 900px

## Files

| File | Purpose |
|---|---|
| `/public/agent-view-v2.css` | Design tokens + component styles, scoped under `.av2` |
| `/public/agent-view-v2.js` | Interactive helpers (`av2.countTo`, `av2.renderAgentRow`, etc.) |
| `/docs/design-system/agent-view-v2.md` | This document |

## Scope rule

All V2 styles are scoped under a `.av2` parent class. To enable on any page:

```html
<div class="agent-shell-page av2" id="agent-section-foo">
  <div class="av2-container">
    <!-- v2 markup here -->
  </div>
</div>
```

This means V2 can be rolled out **incrementally** — one page at a time without breaking the others.

## Tokens

### Spacing — strict 4/8 grid
```
--av2-s1: 4px   --av2-s6: 24px
--av2-s2: 8px   --av2-s7: 32px
--av2-s3: 12px  --av2-s8: 40px
--av2-s4: 16px  --av2-s9: 56px
--av2-s5: 20px  --av2-s10: 72px
```

### Type scale
```
--av2-t-xs:   11px (overlines, kbd labels)
--av2-t-sm:   13px (UI labels, body small)
--av2-t-base: 14px (default body)
--av2-t-md:   16px (lead paragraph)
--av2-t-lg:   20px (section title)
--av2-t-xl:   28px (page section heading)
--av2-t-2xl:  40px (hero title, stat values)
--av2-t-hero: 56px (landing hero only)
```

### Motion
```
--av2-spring-snap:   cubic-bezier(0.22, 1, 0.36, 1)    /* default UI motion */
--av2-spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1) /* playful, attention */
--av2-spring-soft:   cubic-bezier(0.25, 0.46, 0.45, 0.94) /* calm fade */

--av2-d-fast:   140ms (micro-interactions)
--av2-d-base:   240ms (default transitions)
--av2-d-slow:   400ms (entrance animations)
--av2-d-slower: 600ms (large hero animations)
```

### Elevation
```
--av2-e1: subtle card baseline
--av2-e2: hover lift on cards
--av2-e3: floating panel (dropdowns, modals)
--av2-e4: large modal / lightbox
```

## Component inventory

### Implemented (Session 1)

- ✅ `.av2-hero` — page hero with overline, title, sub, right-aligned status
- ✅ `.av2-stat-grid` + `.av2-stat` — KPI cards with icon, label, animated value, delta indicator
- ✅ `.av2-section` + `.av2-section-head` — content section with title + meta
- ✅ `.av2-panel` — content container (with `.av2-panel-flush` for tables)
- ✅ `.av2-search` — accessible search input with leading icon
- ✅ `.av2-chip` — inline tag (status, count, label)
- ✅ `.av2-table` — clean table with sortable columns
- ✅ `.av2-agent-cell` — avatar + name + extension cluster
- ✅ `.av2-pill` — colored status pill (available, unavailable, oncall, ringing, offline)
- ✅ `.av2-btn` — modern button (primary, ghost, sm, icon variants)
- ✅ `.av2-empty` — empty state with icon + title + sub
- ✅ `.av2-skel` — skeleton loader with shimmer
- ✅ `.av2-banner` — alert banner (warning, info tones)
- ✅ `.av2-shift-state` — pill showing current Break Bot state (live, away, break, offline)

### Planned (subsequent sessions)

- [ ] `.av2-action-row` — Break Bot action button row (Sessions 2-3)
- [ ] `.av2-timeline` — vertical event timeline
- [ ] `.av2-progress-ring` — circular SVG progress (Pomodoro, break budget)
- [ ] `.av2-tab-bar` — segmented control / tab nav
- [ ] `.av2-card-list` — vertical card list with hover affordance
- [ ] `.av2-toast` — top-right slide-in notifications (migrate from existing)
- [ ] `.av2-modal` — bottom-sheet on mobile, centered on desktop
- [ ] `.av2-leaderboard-row` — Hall of Fame ranking row
- [ ] `.av2-ticket-card` — ticket summary card

## Pages — rollout status

| Page | Status | Session |
|---|---|---|
| `dashboard` | ✅ Converted | 1 |
| `breakbot` | Planned | 2 |
| `bonus` | Planned | 3 |
| `tickets` | Planned | 4 |
| `hall` | Planned | 5 |
| `writer` | Planned | 5 |

## Quality gates (per page)

Each page conversion must pass:

1. **Visual review** — side-by-side screenshot vs. current
2. **Lighthouse a11y** ≥ 90
3. **Keyboard navigation** — all actions reachable without mouse
4. **Reduced motion** — verify with DevTools emulation
5. **Mobile** — 375px width, 600px width snapshots
6. **No regression** — existing JS that targets element IDs continues to work
7. **Unit/E2E tests** — at minimum a Playwright smoke test that renders the page

## API helpers

```js
av2.greeting()              // "Good morning" / "Good afternoon" / etc.
av2.initials("Jane Doe")    // "JD"
av2.countTo(el, 142, opts)  // animated counter
av2.fmtDuration(seconds)    // "1h 23m"
av2.renderHero(root, data)
av2.updateStat(root, key, value, opts)
av2.updateStatDelta(root, key, pct)
av2.renderAgentRow(agent, idx)
av2.renderAgentTable(tbody, agents)
av2.filterAgentTable(tbody, query)
av2.escape(s)
```

## Backwards compatibility

- All existing JS that targets element IDs (`#ag-avail`, `#agent-view-table`, etc.) **continues to work** — the V2 markup preserves every ID.
- The legacy CSS (`.card`, `.metric`, `.tbl-wrap`) is **untouched** so pages not yet converted still look the same.
- `.av2` namespacing prevents any leakage of new styles to old pages.

## Out of scope (for now)

- Theme switcher (light/dark V2) — current design is light-mode only
- Print stylesheets
- High-contrast V2 (legacy `hc-mode` still works)
- RTL support
