# MBTA Data Pipeline Design

## Summary

T-Tracker currently fetches all static MBTA data — route metadata, stop locations, route shapes, and route-stop associations — live from the MBTA API every time a user opens the app. This design moves that work offline: a Node.js script runs nightly in GitHub Actions, fetches and processes the full dataset, and commits a pre-built JSON file (`data/mbta-static.json`) directly to the repository. Cloudflare Pages picks up that commit and deploys it automatically, so browsers receive a static file on first load instead of making several API calls.

The browser-side change is handled by a new module, `src/static-data.js`, which replaces the three startup API calls with a single file fetch (or a localStorage cache hit on returning visits). After hydrating from static data, the module runs one lightweight background check against the live MBTA API to detect whether the route set has changed since the file was generated. If it has, the app re-fetches and caches fresh data silently. The polyline merge algorithm — which collapses parallel route shapes into single lines — is extracted from `src/map.js` into a standalone module so it can be shared between the prebake script (Node.js) and the browser fallback path without pulling in any Leaflet dependency.

## Definition of Done

A nightly GitHub Actions job fetches all static MBTA data (route metadata, stop locations, merged polylines, route-stop associations) and commits a pre-generated JSON file to master, triggering a Cloudflare Pages deploy.

The browser app loads this static file immediately on startup — no MBTA API calls for static data, no merge algorithm in the client.

A background check runs after startup: it compares a lightweight field against the live MBTA API. If stale, it fetches fresh data, updates the in-memory state and localStorage so the current session and future visits on this device are immediately current.

Out of scope: live vehicle positions (still SSE), predictions, schedule data.

## Acceptance Criteria

### mbta-data-pipeline.AC1: Prebake script generates valid static data
- **mbta-data-pipeline.AC1.1 Success:** `scripts/fetch-mbta-data.mjs` runs without error and writes `data/mbta-static.json`
- **mbta-data-pipeline.AC1.2 Success:** Output file contains all route types (0–4), all stops, and all route-stop associations
- **mbta-data-pipeline.AC1.3 Success:** Each route's polyline is a single merged line (not two parallel lines for same-street routes)
- **mbta-data-pipeline.AC1.4 Success:** Route-stop associations exclude stops >150m from the route's polyline
- **mbta-data-pipeline.AC1.5 Success:** Output file includes `generatedAt` Unix timestamp
- **mbta-data-pipeline.AC1.6 Failure:** Script exits non-zero if `MBTA_API_KEY` is missing
- **mbta-data-pipeline.AC1.7 Failure:** Script exits non-zero if any MBTA API call fails

### mbta-data-pipeline.AC2: App loads from static file on startup
- **mbta-data-pipeline.AC2.1 Success:** Fresh visit — app hydrates routes/stops/polylines from `data/mbta-static.json` with no MBTA API calls for static data
- **mbta-data-pipeline.AC2.2 Success:** Returning visit — app hydrates from localStorage with no file fetch and no MBTA API calls
- **mbta-data-pipeline.AC2.3 Success:** Route polylines, stop markers, and route panel all render correctly from static data
- **mbta-data-pipeline.AC2.4 Failure:** If `data/mbta-static.json` fails to load, app falls back to live MBTA API calls and continues working

### mbta-data-pipeline.AC3: Background staleness check
- **mbta-data-pipeline.AC3.1 Success:** After startup, app fires exactly one lightweight request to `/routes?fields[route]=id`
- **mbta-data-pipeline.AC3.2 Success:** If returned route IDs match static data, no further MBTA API calls are made
- **mbta-data-pipeline.AC3.3 Success:** If returned route IDs differ, app re-fetches full live data, updates in-memory state and localStorage
- **mbta-data-pipeline.AC3.4 Success:** Background check failure is silent — app continues with static data, no user-visible error

### mbta-data-pipeline.AC4: Nightly CI updates the data file
- **mbta-data-pipeline.AC4.1 Success:** GitHub Actions workflow runs nightly at ~03:00 UTC
- **mbta-data-pipeline.AC4.2 Success:** Workflow commits updated `data/mbta-static.json` to master if MBTA data changed
- **mbta-data-pipeline.AC4.3 Success:** Workflow exits successfully without committing if data has not changed
- **mbta-data-pipeline.AC4.4 Success:** Workflow can be triggered manually via `workflow_dispatch`

### mbta-data-pipeline.AC5: Build pipeline includes static data
- **mbta-data-pipeline.AC5.1 Success:** `node build.js` copies `data/mbta-static.json` to `dist/data/mbta-static.json`
- **mbta-data-pipeline.AC5.2 Failure:** `node build.js` exits non-zero if `data/mbta-static.json` does not exist

## Glossary

- **arc-length nearest-vertex check**: The algorithm used to decide whether two polylines represent the same physical path. It samples points along the first polyline at regular arc-length intervals, finds the nearest vertex on the second polyline for each sample, and takes the median distance. If that median falls below a threshold, the lines are merged.
- **background staleness check**: A lightweight request fired after startup that fetches only route IDs from the live MBTA API and compares them against the static file. Used to detect when the committed data is outdated without blocking the initial render.
- **Cloudflare Pages**: The static hosting platform that serves `supertra.in`. It rebuilds and redeploys automatically on every push to `master`.
- **ESM / `.mjs`**: ECMAScript Modules — the native JavaScript module format. The `.mjs` extension signals to Node.js that the file uses `import`/`export` rather than `require()`.
- **generatedAt**: A Unix timestamp embedded in `data/mbta-static.json` recording when the prebake script produced the file. Used by the browser to compute data age.
- **GitHub Actions**: The CI/CD platform used here to run the nightly data refresh job on a cron schedule and commit the result back to the repository.
- **haversineDistance**: A function in `src/vehicle-math.js` that computes the great-circle distance between two lat/lng coordinates. Used both in the merge algorithm and in the 150m proximity filter.
- **hydration**: The process of loading pre-fetched data into the app's in-memory state at startup, as opposed to fetching it live.
- **localStorage**: Browser-native key-value storage that persists across page loads. Used here to cache the static data bundle so returning visitors skip the file fetch entirely.
- **MBTA V3 API**: The Massachusetts Bay Transportation Authority's public REST API. Returns transit data (routes, stops, shapes, vehicle positions) in JSON:API format.
- **polyline**: An ordered sequence of lat/lng coordinates representing a route's geographic path on the map. MBTA shapes are encoded in Google's compressed polyline format and decoded client-side.
- **polyline merge**: The process of collapsing two nearly-identical polylines (e.g., inbound and outbound tracks on the same street) into a single line to avoid visual overlap on the map.
- **prebake script**: `scripts/fetch-mbta-data.mjs` — the Node.js script that runs at build/CI time to produce `data/mbta-static.json`. "Prebake" means the computation is done once ahead of time rather than in the browser on every visit.
- **proximity filter**: The step in the prebake script that excludes stops located more than 150m from a route's merged polyline. Prevents stops from being associated with routes they do not physically serve.
- **route-stop associations**: A mapping from route ID to the ordered list of stop IDs that appear on that route. Currently fetched per-route from the MBTA API; after this change, pre-computed and stored in the static file under `routeStops`.
- **SSE (Server-Sent Events)**: A browser API for receiving a persistent stream of push updates from a server. Used by the app for live vehicle positions — unaffected by this design.
- **ttracker-static-data**: The localStorage key where `src/static-data.js` caches the hydrated static data bundle between sessions.
- **workflow_dispatch**: A GitHub Actions trigger that allows a workflow to be started manually from the GitHub UI or API, in addition to its scheduled runs.

## Architecture

All static MBTA data (route metadata, merged polylines, stop locations, route-stop associations) is pre-computed at build time by a Node.js script and committed to the repository as `data/mbta-static.json`. The browser loads this file on startup instead of making MBTA API calls. A background check runs after startup and re-fetches live data if the route set has changed.

**Components:**

- `scripts/fetch-mbta-data.mjs` — Node.js script (ESM) that fetches from the MBTA API, runs the polyline merge algorithm, applies the 150m proximity filter, and writes `data/mbta-static.json`.
- `src/polyline-merge.js` — Pure function module extracted from `src/map.js`. Implements arc-length nearest-vertex merge check. Importable by both the prebake script (Node) and `map.js` (browser fallback).
- `data/mbta-static.json` — Committed static asset. Contains routes, merged polylines, stops, route-stop associations, and a `generatedAt` Unix timestamp.
- `src/static-data.js` — Browser module that owns startup data loading and background staleness detection. Replaces the three startup MBTA API calls currently in `map.js`.
- `.github/workflows/refresh-mbta-data.yml` — Nightly GitHub Actions workflow that runs `fetch-mbta-data.mjs` and commits back to master if the file changed.

**Data flow:**

```
scripts/fetch-mbta-data.mjs
  → MBTA API (routes, shapes, stops, route-stops)
  → src/polyline-merge.js (merge algorithm)
  → data/mbta-static.json (committed to repo)
  → Cloudflare Pages build → dist/data/mbta-static.json

Browser startup:
  src/static-data.js
    → localStorage (ttracker-static-data) — hit: hydrate immediately
    → data/mbta-static.json — miss: fetch, hydrate, write localStorage
    → background: GET /routes?fields[route]=id
        IDs match → done
        IDs differ → re-fetch MBTA API, update memory + localStorage
```

**`data/mbta-static.json` shape:**

```json
{
  "generatedAt": 1741824000,
  "routes": [
    {
      "id": "66",
      "color": "#da291c",
      "shortName": "66",
      "longName": "Harvard - Dudley",
      "type": 3,
      "directionNames": ["Outbound", "Inbound"],
      "directionDestinations": ["Dudley", "Harvard"],
      "polyline": [[42.37, -71.12], [42.36, -71.11]]
    }
  ],
  "stops": {
    "place-asmnl": {
      "id": "place-asmnl",
      "name": "Ashmont",
      "lat": 42.284652,
      "lng": -71.064489,
      "parentStopId": null
    }
  },
  "routeStops": {
    "66": ["70153", "70155", "70157"]
  }
}
```

## Existing Patterns

Investigation confirmed:

- `src/polyline.js` — pure decoder, importable by Node. The prebake script reuses it directly.
- `src/vehicle-math.js` — exports `haversineDistance`. The prebake script imports it for the 150m proximity filter and merge algorithm.
- `src/route-stops-cache.js` — localStorage cache with version field and TTL. `src/static-data.js` follows the same pattern: single localStorage key (`ttracker-static-data`), version field for invalidation, graceful fallback on parse failure. `route-stops-cache.js` is retired when `static-data.js` takes over its responsibilities.
- `build.js` — copies directories to `dist/`. The `data/` → `dist/data/` copy follows the existing `icons/` → `dist/icons/` pattern.
- `tests/*.test.js` — Node assert-based unit tests. `tests/static-data.test.js` and `tests/polyline-merge.test.js` follow the same structure.

The merge algorithm in `src/map.js` (arc-length nearest-vertex check) is extracted verbatim into `src/polyline-merge.js` — no logic changes, only relocation.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Extract Merge Algorithm
**Goal:** Move the polyline merge logic out of `src/map.js` into a standalone pure module, testable in Node without Leaflet.

**Components:**
- `src/polyline-merge.js` — pure function `shouldMergePolylines(coords1, coords2, thresholdMeters)`. Implements arc-length sampling from coords1, nearest-vertex distance to coords2, median computation. No Leaflet dependency. Imports `haversineDistance` from `src/vehicle-math.js`.
- `src/map.js` — updated to import `shouldMergePolylines` from `src/polyline-merge.js` instead of containing the logic inline.
- `tests/polyline-merge.test.js` — unit tests for the extracted function.

**Dependencies:** None (first phase)

**Done when:** `node tests/polyline-merge.test.js` passes. `src/map.js` still renders routes correctly (app works unchanged). The temporary diagnostic `console.log` in `src/map.js` is removed.
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Prebake Script and Initial Data File
**Goal:** Build the Node.js script that generates `data/mbta-static.json` and run it to produce the initial committed data file.

**Components:**
- `scripts/fetch-mbta-data.mjs` — ESM script. Fetches `/routes`, `/stops`, and `/stops?filter[route]=` per route from MBTA API. Uses `src/polyline.js` to decode shapes, `src/polyline-merge.js` for the merge decision, `src/vehicle-math.js` for the proximity filter. Writes `data/mbta-static.json` with the shape defined in Architecture above.
- `data/mbta-static.json` — generated and committed.

**Dependencies:** Phase 1 (`src/polyline-merge.js` must exist)

**Done when:** `node scripts/fetch-mbta-data.mjs` runs without error and writes a valid `data/mbta-static.json`. File is committed to the repository.
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Browser Static Data Loader
**Goal:** New `src/static-data.js` module that loads data from `data/mbta-static.json` (with localStorage cache) and runs the background staleness check.

**Components:**
- `src/static-data.js` — exports `loadStaticData()` (async, returns hydrated data bundle), `getStaticDataAge()` (seconds since `generatedAt`). Internally: tries localStorage key `ttracker-static-data` (version-checked), falls back to `fetch('data/mbta-static.json')`, writes to localStorage on miss. After hydration, fires background check: `GET /routes?fields[route]=id`, compares IDs; if changed, re-fetches full live MBTA data and updates localStorage.
- `tests/static-data.test.js` — unit tests covering: localStorage hit, localStorage miss + file fetch, background check with matching IDs (no re-fetch), background check with differing IDs (triggers re-fetch).

**Dependencies:** Phase 2 (`data/mbta-static.json` must exist for tests)

**Done when:** `node tests/static-data.test.js` passes.
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: App Integration
**Goal:** Wire `src/static-data.js` into the app startup sequence, replacing the three MBTA API calls. Retire `src/route-stops-cache.js`.

**Components:**
- `index.html` — replace `Promise.all([loadRoutes(), loadStops()])` with `loadStaticData()`. Remove `getCachedRouteStops`/`setCachedRouteStops` imports and cache-first loader logic.
- `src/map.js` — `loadRoutes()` and `loadStops()` become thin hydration functions that accept data from `static-data.js` rather than fetching from MBTA. `fetchRouteStops()` is no longer called at startup; route-stop associations come from the static file. Live API fallback path retained for when background check detects stale data.
- `src/route-stops-cache.js` — retired (file removed or emptied to no-ops).

**Dependencies:** Phase 3

**Done when:** App loads correctly from localhost with no MBTA API calls for routes/stops/shapes on startup. Network tab shows only SSE + the single `/routes?fields[route]=id` background check. Existing tests pass.
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: CI Workflow and Build Pipeline
**Goal:** Automate nightly data refresh via GitHub Actions and update `build.js` to ship the data file.

**Components:**
- `.github/workflows/refresh-mbta-data.yml` — scheduled nightly at 03:00 UTC (`cron: '0 3 * * *'`), `workflow_dispatch` for manual runs. Checks out repo, runs `node scripts/fetch-mbta-data.mjs` with `MBTA_API_KEY` from GitHub Secret. Commits `data/mbta-static.json` to master if changed (`git diff --quiet` guard). Bot identity: `github-actions[bot]`.
- `build.js` — copy `data/` directory to `dist/data/` alongside existing file copies.
- GitHub repository: `MBTA_API_KEY` secret added (documented in setup instructions, not hardcoded).

**Dependencies:** Phase 2 (script must exist), Phase 4 (app must consume the file)

**Done when:** Workflow file is committed. `build.js` copies `data/mbta-static.json` to `dist/data/mbta-static.json`. Manual `workflow_dispatch` run succeeds in GitHub Actions.
<!-- END_PHASE_5 -->

## Additional Considerations

**Fallback path:** If `data/mbta-static.json` fails to load (network error, corrupt file), `src/static-data.js` falls back to live MBTA API calls — the existing `loadRoutes()` / `loadStops()` / `fetchRouteStops()` logic in `map.js` is preserved as the fallback. This ensures the app degrades gracefully rather than breaking if the static file is unavailable.

**File size:** `data/mbta-static.json` will be approximately 2–4 MB uncompressed (polylines are the bulk). Cloudflare Pages applies gzip compression automatically; real transfer size will be ~600–900 KB.

**Merge algorithm diagnostic logging:** The temporary `console.log` added to `src/map.js` during debugging is removed in Phase 1.
