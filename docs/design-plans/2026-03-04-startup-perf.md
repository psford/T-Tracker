# Startup Performance Optimization Design

## Summary

T-Tracker currently blocks its entire UI startup on `buildRouteStopsMapping()`, a function that makes roughly 180 sequential API requests to fetch the list of stops for every MBTA route before the map or vehicle feed becomes usable. This design eliminates that bottleneck through two complementary changes: the startup sequence is restructured so the map, route selector, and live vehicle feed initialize immediately after the initial data load, and route-stops mapping is fetched only for routes the user has visible (roughly 12 subway routes by default rather than all 180).

A new `route-stops-cache.js` module persists the route-stops mapping to localStorage with a 24-hour TTL, keyed per-route. On a returning visit with a warm cache, stop markers appear instantly with no API requests at all. On a first visit or stale cache, only visible routes are fetched, reducing startup API calls by roughly 93%. When the user toggles a service group (for example, enabling Bus), any uncached routes for that group are fetched on demand and cached for future visits.

## Definition of Done
1. **Non-blocking startup**: UI initializes immediately after `loadRoutes()` + `loadStops()` complete — route selector, map, and SSE connection are usable without waiting for route-stops mapping
2. **Selective fetching**: On startup, only fetch stop mappings for visible routes (~12 subway routes by default) instead of all ~180 routes
3. **localStorage caching**: Route-stops mapping cached in localStorage with 24hr TTL, so subsequent page loads skip API fetches entirely when cache is fresh
4. **Stop markers appear from cache**: On cached visits, stop markers render immediately; on first visit or stale cache, they appear after mapping completes (brief delay acceptable)

## Acceptance Criteria

### startup-perf.AC1: localStorage caching with TTL
- **startup-perf.AC1.1 Success:** Cache stores route-stops mapping per-route with timestamp, retrievable after page reload
- **startup-perf.AC1.2 Success:** Cache entries within 24hr TTL return stored stop IDs without API fetch
- **startup-perf.AC1.3 Success:** Cache entries older than 24hr are treated as stale and trigger re-fetch
- **startup-perf.AC1.4 Edge:** Malformed or corrupted cache JSON falls back to API fetch without error
- **startup-perf.AC1.5 Edge:** Cache version mismatch (schema change) triggers full cache clear and re-fetch

### startup-perf.AC2: Selective route-stops fetching
- **startup-perf.AC2.1 Success:** `fetchRouteStops(['Red', 'Orange'])` fetches only those 2 routes (not all ~180)
- **startup-perf.AC2.2 Success:** `hydrateRouteStopsMap(routeId, stopIds)` populates internal map identically to API fetch

### startup-perf.AC3: Non-blocking startup with cache-first strategy
- **startup-perf.AC3.1 Success:** Route selector, map tiles, and SSE vehicle markers are usable before route-stops mapping completes
- **startup-perf.AC3.2 Success:** Cached visit: stop markers appear without any API fetch for route-stops
- **startup-perf.AC3.3 Success:** First visit (no cache): stop markers appear after visible routes (~12 subway) are fetched
- **startup-perf.AC3.4 Success:** Fetched route-stops are written to cache for next visit

### startup-perf.AC4: On-demand route toggle fetching
- **startup-perf.AC4.1 Success:** Toggling Bus service fetches uncached bus route stops on demand and renders markers
- **startup-perf.AC4.2 Success:** Toggling a service with cached routes renders stop markers immediately (no fetch)

## Glossary
- **route-stops mapping (`routeStopsMap`)**: Internal `Map<routeId, Set<stopId>>` recording which stops belong to each route. Required for rendering stop markers and configuring notifications.
- **`buildRouteStopsMapping()`**: The existing function in `map.js` that fetches stop IDs for every MBTA route at startup. This design replaces it with `fetchRouteStops()` and `hydrateRouteStopsMap()`.
- **TTL (Time To Live)**: Duration after which a cached value is considered stale. This design uses 24 hours (86,400,000ms) per route entry.
- **cache hydration**: Populating an in-memory data structure from a stored cache entry, bypassing a network request.
- **cache-first strategy**: Check local cache before making network requests; fall back to network only on cache miss or stale entry.
- **visible routes**: Routes currently toggled on in the UI. By default, only subway routes are visible; Bus, Commuter Rail, and Ferry are off.
- **pure module**: A JavaScript module with no side effects, no DOM access, and no imports from other app modules. Independently testable.

## Architecture

Cache-first lazy loading with on-demand fetching for route-stops mapping.

The current startup blocks all UI initialization on `buildRouteStopsMapping()`, which makes ~180 sequential API requests (3 concurrent) to fetch per-route stop lists. This design eliminates the blocking dependency, caches results in localStorage, and fetches only what's needed.

**Startup flow (cache hit):**
```
loadRoutes() + loadStops()        [parallel, ~1-2 API requests]
  → initUI() + initStopMarkers()  [IMMEDIATE — no waiting]
  → initNotifications() + connect()
  → hydrate routeStopsMap from cache
  → updateVisibleStops()          [INSTANT — stop markers appear]
```

**Startup flow (cache miss / first visit):**
```
loadRoutes() + loadStops()        [parallel]
  → initUI() + initStopMarkers()  [IMMEDIATE]
  → initNotifications() + connect()
  → fetch stops for visible routes only (~12 subway routes)
  → cache results per-route
  → updateVisibleStops()          [stop markers appear after fetch]
```

**On-demand route toggle (user enables Bus):**
```
Check cache for toggled route IDs
  → cached routes: hydrate + render immediately
  → uncached routes: fetch, cache, render
```

**New module:** `src/route-stops-cache.js` — pure cache logic (read/write/TTL). No network calls, no DOM access.

**Modified modules:**
- `src/map.js` — `buildRouteStopsMapping()` refactored to accept specific route IDs; new `hydrateRouteStopsMap()` for populating from cache
- `index.html` — startup flow restructured to init UI before route-stops mapping
- `src/stop-markers.js` — `updateVisibleStops()` unchanged (already reads from `routeStopsMap` via `getRouteStopsMap()`)

### Cache Structure

Single localStorage key with per-route entries:

```
Key: "ttracker-route-stops-cache"
Value: {
  version: 1,
  routes: {
    "Red": { stopIds: ["place-alfcl", "place-davis", ...], cachedAt: <timestamp> },
    "Green-B": { stopIds: [...], cachedAt: <timestamp> },
    ...
  }
}
```

- Per-route TTL checking (24hr = 86,400,000ms)
- Estimated size: ~5KB for subway-only, ~113KB for all routes
- Version field enables cache invalidation on schema changes

### Data Flow

```
route-stops-cache.js (localStorage)
       ↕ read/write
index.html (orchestrator)
       ↓ hydrate or fetch
map.js (routeStopsMap populated)
       ↓ getRouteStopsMap()
stop-markers.js (renders stop markers)
```

`route-stops-cache.js` is a pure data module — no imports from other app modules. `map.js` gains two new exports: `hydrateRouteStopsMap(routeId, stopIds)` to populate from cache, and a refactored `fetchRouteStops(routeIds)` (replacing `buildRouteStopsMapping()`) that accepts specific route IDs.

### Contract: route-stops-cache.js

```javascript
// Read cached stops for specific routes
// Returns { cached: Map<routeId, Set<stopId>>, uncached: string[] }
getCachedRouteStops(routeIds, ttlMs)

// Write stops for a single route to cache
setCachedRouteStops(routeId, stopIds)

// Clear all cached route-stops data
clearRouteStopsCache()
```

### Contract: map.js additions

```javascript
// Populate routeStopsMap from cached data (no network call)
hydrateRouteStopsMap(routeId, stopIds)

// Fetch route-stops mapping for specific routes (replaces buildRouteStopsMapping)
// Fetches only the given route IDs, max 3 concurrent
fetchRouteStops(routeIds) → Promise<void>
```

## Existing Patterns

Investigation found existing localStorage usage in `src/ui.js` and `src/notifications.js`:
- Keys use `ttracker-` prefix (e.g., `ttracker-visible-routes`, `ttracker-service-toggles`, `ttracker-notification-config`)
- JSON serialization with `JSON.parse/stringify`
- Read/write via small helper functions (`readFromStorage`, `writeToStorage`, `readConfig`, `writeConfig`)
- No TTL or versioning in existing cache — this design introduces both as new patterns

The throttled concurrent fetch pattern in `buildRouteStopsMapping()` (max 3 concurrent with queue management) is preserved in the refactored `fetchRouteStops()`.

Event-driven communication between modules via `CustomEvent` on `EventTarget` is the established inter-module pattern. This design does not introduce new events — the existing `updateVisibleStops()` callback mechanism handles stop marker updates.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Cache Module
**Goal:** Create `src/route-stops-cache.js` with localStorage read/write/TTL logic and unit tests.

**Components:**
- `src/route-stops-cache.js` — `getCachedRouteStops()`, `setCachedRouteStops()`, `clearRouteStopsCache()` with 24hr TTL, version field, `ttracker-route-stops-cache` key
- `tests/route-stops-cache.test.js` — tests for cache hit/miss, TTL expiry, version mismatch, malformed data handling

**Dependencies:** None

**Done when:** Cache module reads/writes localStorage correctly, TTL expiry works, tests pass covering startup-perf.AC1.1–AC1.5
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Selective Fetch
**Goal:** Refactor `buildRouteStopsMapping()` in `src/map.js` to accept specific route IDs and add cache hydration.

**Components:**
- `src/map.js` — replace `buildRouteStopsMapping()` with `fetchRouteStops(routeIds)` and add `hydrateRouteStopsMap(routeId, stopIds)`
- `src/map.js` — export new functions, deprecate/remove `buildRouteStopsMapping`
- Update `src/CLAUDE.md` contracts

**Dependencies:** Phase 1 (cache module exists)

**Done when:** `fetchRouteStops(['Red', 'Orange'])` fetches only those routes, `hydrateRouteStopsMap` populates the internal map correctly, tests pass covering startup-perf.AC2.1–AC2.2
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Startup Restructure
**Goal:** Restructure `index.html` startup flow to init UI immediately and load route-stops mapping asynchronously with cache-first strategy.

**Components:**
- `index.html` — new startup sequence: `Promise.all([loadRoutes(), loadStops()])` → init UI/notifications/SSE immediately → cache check → hydrate or fetch visible routes → `updateVisibleStops()`
- Wire visibility callback to handle on-demand fetching when user toggles new routes

**Dependencies:** Phase 1 (cache module), Phase 2 (selective fetch + hydration)

**Done when:** UI initializes without waiting for route-stops mapping, cached visits show stop markers instantly, first visits show stop markers after visible routes are fetched, route toggling fetches uncached routes on demand. Tests pass covering startup-perf.AC3.1–AC3.4 and startup-perf.AC4.1–AC4.2
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Build Script and Documentation
**Goal:** Ensure build script copies new module, update project documentation.

**Components:**
- `build.js` — verify `src/route-stops-cache.js` is included in build output (already copies all `src/*.js`)
- `CLAUDE.md` — update API Rate Limits section to reflect reduced startup requests
- `src/CLAUDE.md` — add `route-stops-cache.js` module contract

**Dependencies:** Phase 3 (startup restructure complete)

**Done when:** `node build.js` includes new module in dist, documentation reflects new architecture
<!-- END_PHASE_4 -->

## Additional Considerations

**Cache corruption:** If localStorage contains malformed JSON or unexpected schema, the cache module falls back to fetching from API. The version field enables forced cache invalidation if the schema changes in future updates.

**First visit performance:** First-ever visit (no cache) fetches ~12 subway routes instead of ~180 all routes. This reduces startup API requests from ~180 to ~12 (93% reduction). Bus/CR/Ferry routes are fetched on-demand when user toggles those services.

**Cache size:** Full cache (all routes) is ~113KB. Subway-only cache is ~5.5KB. Both are well within localStorage's 5-10MB limit and the 100KB comfort threshold.
