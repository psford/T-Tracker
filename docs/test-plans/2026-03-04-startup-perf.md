# Startup Performance Optimization — Human Test Plan

## Prerequisites

- Local HTTP server running: `python -m http.server 8000` from project root
- Browser with DevTools (Chrome or Firefox recommended)
- Valid `config.js` with MBTA API key (copy from `config.example.js` if needed)
- All automated tests passing:
  ```
  node tests/route-stops-cache.test.js && node tests/map-hydrate.test.js
  ```
- Full regression suite passing:
  ```
  node tests/vehicles.test.js && node tests/vehicle-icons.test.js && node tests/stop-markers.test.js && node tests/stop-popup.test.js && node tests/notifications.test.js && node tests/notification-ui.test.js && node tests/polyline.test.js && node tests/api.test.js && node tests/ui.test.js && node tests/vehicle-popup.test.js && node tests/route-stops-cache.test.js && node tests/map-hydrate.test.js
  ```

## Phase 1: Cache Module Verification (AC1)

These are covered by automated tests. Manual spot-check is optional but recommended for localStorage persistence across actual page reloads.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open DevTools Console. Run `localStorage.removeItem('ttracker-route-stops-cache')`. | Key removed, no error. |
| 2 | Navigate to `http://localhost:8000`. Wait for stop markers to appear on the map. | Stop markers render for visible subway routes. |
| 3 | In Console, run `JSON.parse(localStorage.getItem('ttracker-route-stops-cache'))`. | Object with `version: 1`, `routes` containing subway route keys (e.g., `Red`, `Orange`, `Blue`, `Green-B`, etc.), each with `stopIds` array and numeric `cachedAt` timestamp. |
| 4 | Reload the page (F5). | App loads. Stop markers reappear. |
| 5 | In Console, re-run the same `JSON.parse(...)` command. | Same cache structure still present. `cachedAt` values unchanged from Step 3 (cache was reused, not overwritten). |

## Phase 2: Selective Route-Stops Fetching (AC2)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Clear localStorage: `localStorage.clear()`. | All storage cleared. |
| 2 | Open DevTools Network tab. Set filter to `/stops?filter[route]=`. Clear the log. | Network log is empty, filter active. |
| 3 | Navigate to `http://localhost:8000`. | Page loads. |
| 4 | Observe network requests in the filtered log. | Approximately 12 requests appear (one per visible subway route). Each URL contains `filter[route]=<routeId>` for a single route. No request fetches all ~180 routes at once. |
| 5 | Count the requests. Compare against the number of visible routes in the sidebar. | Request count matches visible route count. No extra requests for hidden services (Bus, Commuter Rail, Ferry). |

## Phase 3: Non-Blocking Startup (AC3)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Clear localStorage: `localStorage.clear()`. | Storage cleared. |
| 2 | Open DevTools Network tab. Enable "Slow 3G" throttling (or "Fast 3G" if Slow is too aggressive). | Network throttling active. |
| 3 | Navigate to `http://localhost:8000`. | Page begins loading. |
| 4 | While route-stops requests are still in-flight (visible in Network tab as pending), check: Is the map visible with tiles loading? Is the route selector sidebar rendered and interactive (checkboxes clickable)? Do vehicle markers appear from the SSE feed? | YES to all three. The UI is usable before route-stops mapping completes. Map tiles render, sidebar is interactive, vehicle markers animate on the map. |
| 5 | Wait for all route-stops requests to complete. | Stop markers appear on the map after fetches finish. Before they complete, stop markers are absent but everything else works. |
| 6 | Disable network throttling. | Return to normal speed. |

### Cached visit verification (AC3.2)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Ensure cache is populated (visit the app once with no throttling, wait for stop markers). | Stop markers visible, cache populated. |
| 2 | Open DevTools Network tab. Filter to `/stops?filter[route]=`. Clear the log. | Empty filtered log. |
| 3 | Reload the page (F5). | App loads. |
| 4 | Check the filtered network log. | Zero requests matching `/stops?filter[route]=`. Stop markers appear immediately from cache. |

## Phase 4: On-Demand Route Toggle Fetching (AC4)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Load the app with default settings (only subway visible). Wait for full load. | Subway routes visible, Bus/CR/Ferry toggled off in sidebar. |
| 2 | Open DevTools Network tab. Filter to `/stops?filter[route]=`. Clear the log. | Empty filtered log. |
| 3 | In the sidebar, toggle the "Bus" service group ON. | Network requests appear in the filtered log for bus routes. Bus stop markers appear on the map. |
| 4 | In Console, run `JSON.parse(localStorage.getItem('ttracker-route-stops-cache'))`. | Cache now includes bus route entries alongside subway entries. |
| 5 | Toggle Bus OFF. Clear the network log. | Bus stop markers disappear from the map. |
| 6 | Toggle Bus ON again. | Zero new network requests in the filtered log. Bus stop markers reappear immediately (served from cache). |

## End-to-End: Full Cold-to-Warm Startup Cycle

**Purpose:** Validates the complete user journey from first visit (cold cache, ~12 fetches) through second visit (warm cache, 0 fetches).

1. Clear all localStorage: `localStorage.clear()`.
2. Open DevTools Network tab (unfiltered). Note the total request count column.
3. Navigate to `http://localhost:8000`. Wait for full load (all stop markers visible).
4. Note the number of `/stops?filter[route]=` requests. Should be ~12.
5. Note the total load time in the Network tab waterfall.
6. Reload the page (F5).
7. Note the number of `/stops?filter[route]=` requests on second load. Should be 0.
8. Verify stop markers appear faster on the second load (no waiting for API responses).
9. Toggle Bus ON. Verify bus route fetches happen on-demand.
10. Reload again. Verify bus routes are now also served from cache (0 additional fetches for previously-fetched bus routes).

## End-to-End: Cache Expiry Cycle

**Purpose:** Validates that stale cache entries (>24hr) are automatically refreshed without user intervention.

1. Load the app to populate the cache.
2. In Console, manually expire the cache:
   ```javascript
   let c = JSON.parse(localStorage.getItem('ttracker-route-stops-cache'));
   Object.values(c.routes).forEach(r => r.cachedAt = Date.now() - 86_400_001);
   localStorage.setItem('ttracker-route-stops-cache', JSON.stringify(c));
   ```
3. Open DevTools Network tab. Filter to `/stops?filter[route]=`. Clear the log.
4. Reload the page.
5. Verify route-stops requests appear in the Network tab (cache was stale, refetched).
6. Verify stop markers appear after fetches complete.
7. Check updated cache in Console — `cachedAt` timestamps should be recent.

## Build Verification (Phase 4)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run `node build.js` from project root. | Build completes without error. |
| 2 | Check that `dist/src/route-stops-cache.js` exists. | File present in build output. |
| 3 | Serve the `dist/` directory: `cd dist && python -m http.server 8001`. Navigate to `http://localhost:8001`. | App loads and functions identically to the source version. |

## Traceability

| Acceptance Criterion | Automated Test | Manual Step |
|----------------------|----------------|-------------|
| startup-perf.AC1.1 — Cache stores mapping with timestamp | `tests/route-stops-cache.test.js` `testCacheStoreRetrieve` | Phase 1, Steps 2-3 |
| startup-perf.AC1.2 — Fresh cache returns without fetch | `tests/route-stops-cache.test.js` `testCacheTTLValid` | Phase 3, Cached visit Step 4 |
| startup-perf.AC1.3 — Stale cache triggers re-fetch | `tests/route-stops-cache.test.js` `testCacheTTLExpired` | E2E Cache Expiry, Steps 4-5 |
| startup-perf.AC1.4 — Malformed cache falls back | `tests/route-stops-cache.test.js` `testCorruptedCacheJSON` | — (automated only) |
| startup-perf.AC1.5 — Version mismatch clears cache | `tests/route-stops-cache.test.js` `testCacheVersionMismatch` | — (automated only) |
| startup-perf.AC2.1 — fetchRouteStops fetches only specified routes | — (manual only) | Phase 2, Steps 1-5 |
| startup-perf.AC2.2 — hydrateRouteStopsMap populates map | `tests/map-hydrate.test.js` (6 tests) | — (automated only) |
| startup-perf.AC3.1 — UI usable before mapping completes | — (manual only) | Phase 3, Steps 1-6 |
| startup-perf.AC3.2 — Cached visit shows stops without fetch | — (manual only) | Phase 3, Cached visit Steps 1-4 |
| startup-perf.AC3.3 — First visit fetches only visible routes | — (manual only) | Phase 2, Steps 1-5 |
| startup-perf.AC3.4 — Fetched route-stops written to cache | — (manual only) | Phase 1, Steps 1-3 |
| startup-perf.AC4.1 — Toggling uncached service fetches on demand | — (manual only) | Phase 4, Steps 1-4 |
| startup-perf.AC4.2 — Toggling cached service renders immediately | — (manual only) | Phase 4, Steps 5-6 |

**All 13 acceptance criteria mapped:** 6 to automated tests, 7 to manual verification steps, with 3 criteria having both automated and manual coverage.
