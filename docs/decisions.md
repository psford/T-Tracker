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

## Basemap and Renderer

### DECIDED — MapLibre GL replaces Leaflet; VersaTiles Shadow basemap; no theming; undarkened line colours (2026-08-27, TT-1.1 migration history)

- **Renderer:** MapLibre GL JS replaces Leaflet, chosen after reviewing rendered mockups. Vector
  tiles, smooth continuous zoom, sharp labels at every zoom and on high-DPI.
- **Basemap:** VersaTiles Shadow, used as shipped. Neutral grey (`rgb(60,60,60)`) land, fully
  desaturated cartography, so the MBTA route colours are the only saturated thing on the map.
- **No light/dark theming.** One map. Not a user preference, not a media query.
- **No darkening of transit line colours.** The old 15% darken (`darkenHexColor(color, 0.15)`,
  previously applied in `hydrateRoutes` and the route-label path) was tuned for CARTO's
  near-black land; on Shadow's mid-grey it made Green and Blue muddy. Route colours now render
  exactly as MBTA publishes them.

**Why this shipped at all:** CARTO retired the keyless raster basemap endpoint T-Tracker had
always used (`{s}.basemaps.cartocdn.com/dark_all/...`). Tiles kept returning HTTP 200 but every
one was stamped "API KEY REQUIRED" — supertra.in was defaced live. Registering for a CARTO API
key was the fast fix and was rejected in favor of removing the CARTO raster dependency entirely.

### DECIDED — Basemap provider is a config descriptor, swappable without touching src/ (2026-08-27, TT-1.1 migration history)

`config.basemap` expresses both vector and raster providers behind one seam (`src/basemap.js`);
changing provider is a config edit, never a code edit. Patrick: "we should _always_ architect our
code that relies on third party sources like this to be able to be connected to a new provider
with as minimal pain as possible." This epic exists because that seam did not exist, and a third
party's unilateral change — CARTO's endpoint retirement — defaced the live site with no warning.

### REJECTED — Esri Dark Gray Canvas (2026-08-27, visual review)

**Rejected because:** Inverts figure/ground — light land, dark water — and caps at zoom 16,
below the app's maxZoom of 18.

### REJECTED — VersaTiles Eclipse, unmodified (2026-08-27, visual review)

**Rejected because:** Orange highways and blue water fight the Orange and Blue MBTA lines.

### REJECTED — VersaTiles Graybeard and Neutrino (2026-08-27, visual review)

**Rejected because:** Both are light themes; the app is dark-themed throughout.

### REJECTED — OpenFreeMap Dark (2026-08-27, visual review)

**Rejected because:** Good overall, but all-caps labels and a less legible road hierarchy than
Shadow.

### REJECTED — Client-side recolour pass over VersaTiles Eclipse (2026-08-27, visual review)

**Proposed as:** Recolour Eclipse's roads and water client-side to stop them fighting the Orange
and Blue lines.
**Rejected because:** Looked best of all the options reviewed, but is ~60 lines of custom
machinery maintaining a fork of someone else's design decisions. Shadow gets roughly 90% of the
same result for free, with none of the maintenance burden.

### OPEN — VersaTiles' fair-use / production terms for `tiles.versatiles.org` are unknown; the risk is accepted at this scale, not resolved (2026-08-27, TT-1.1)

**Status:** Unresolved. VersaTiles states FLOSS, self-hostable, no API keys, no usage fees, but
publishes no fair-use policy or production terms for `tiles.versatiles.org` that anyone could
find.

**Accepted anyway, knowingly:** the audience is Patrick plus roughly three colleagues at work —
small enough that the mitigation is the config seam above, not a contract. If VersaTiles adds a
key requirement or goes away, the response is swapping the config descriptor, not another epic.

**Do not treat this as settled.** Nobody has confirmed what VersaTiles' actual terms are — only
that the risk of using the service without confirming them is small enough to accept for now.
Re-open this if VersaTiles publishes terms, if usage patterns change, or if the audience grows.

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
