# Architecture & Product Decisions

This file records decisions that were made, debated, or explicitly rejected during development.
Claude MUST read this file at session start before proposing any solution related to polylines,
merging, rendering, or data pipeline. Never re-propose a REJECTED approach.

Format:
- **REJECTED** — Patrick explicitly said no. Never re-propose this.
- **DECIDED** — In-force decision. Implement as-is unless Patrick changes it.
- **OPEN** — Not yet resolved.

---

## Polyline Rendering

### DECIDED — One merged line per route, no exceptions (2026-03-12)

Every route draws as a single merged polyline on the map. Two parallel lines for the same route
are never acceptable, regardless of route type (rail, bus, ferry, commuter rail).

**Rationale:** Users see one route. Two lines 10-15m apart are visibly wrong at zoom 16+.

### REJECTED — "Don't merge bus polylines, let raw inbound/outbound overlap" (2026-03-12, re-rejected 2026-03-13, 2026-03-14)

**Proposed as:** Show both raw direction polylines overlapping; avoid merge complexity.
**Rejected because:** Two parallel lines are visible at high zoom on divided roads. Users see a visual
artifact, not a route. This was proposed and rejected at least 4-5 times across sessions.
**Do not re-propose.** If bus polyline merging has a bug, fix the bug. The merge stays.

### REJECTED — Remove entire polyline merge feature to fix dangling endpoint bug (2026-03-14)

**Proposed as:** When branch endpoints caused disconnected segments, suggested removing merge entirely.
**Rejected because:** The merge works correctly for 95% of each route. Removing a working feature
to avoid fixing a specific bug is not an acceptable trade-off.
**Correct approach:** Fix the dangling endpoint reconnection logic within the existing merge system.

### DECIDED — Rail polylines merged at render-time; bus polylines merged at prebake time (2026-03-14)

Rail uses render-time merge (hydrateRoutes). Bus polyline merging happens in fetch-mbta-data.mjs
(prebake). Do NOT apply render-time concatenation/dedup to bus routes — the prebake output is
already correct, and blanket render-time processing destroys correctly-formed bus segments.

---

## Data Pipeline

### DECIDED — Static data served from data/mbta-static.json, not fetched live at startup (2026-03-12)

Startup makes zero MBTA API calls for routes/stops/shapes. All static data comes from
data/mbta-static.json via static-data.js with localStorage cache. One lightweight staleness check
fires in background.

---

## UI Verification

### DECIDED — Every visual fix requires a Playwright screenshot before claiming "fixed" (2026-03-13)

No exceptions. "Tests pass" and "the data looks correct" are not visual proof. A screenshot
at the exact zoom level the user was looking at is visual proof.

---

## Objection Threshold

Technical objections are appropriate when a decision would cause:
- Data loss or corruption
- Security vulnerabilities
- Changes that cannot be easily reversed

Technical objections are NOT appropriate for:
- UX/aesthetic preferences ("one line looks cleaner")
- Performance trade-offs Patrick has accepted
- Simplifications Patrick prefers even if technically less precise

If you find yourself about to argue against a user decision, ask:
"Is this a safety/integrity issue, or a preference issue?"
If it's a preference issue — implement it.

---

## How to Update This File

When Patrick makes a product/UX/architecture decision during a session:
1. Add a DECIDED entry immediately (same session, same commit as the code change)
2. When Patrick rejects a proposal, add a REJECTED entry with the exact reason
3. Stage this file with the related code commit — never commit code without capturing the decision
