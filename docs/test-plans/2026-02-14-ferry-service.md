# Human Test Plan: Ferry Service Support

Generated from implementation plan: `docs/implementation-plans/2026-02-14-ferry-service/`

## Prerequisites

- Local dev server running: `python -m http.server 8000` from project root
- Valid `config.js` in project root (copy from `config.example.js`, add MBTA API key)
- All automated tests passing:
  - `node tests/ui.test.js`
  - `node tests/notifications.test.js`
  - `node tests/notification-ui.test.js`
- Browser with DevTools available (Chrome or Firefox recommended)
- MBTA ferry service may be seasonal/limited hours -- some visual vehicle tests may need to be deferred if no ferries are operating

## Phase 1: API Data Fetching (AC1.1, AC1.2, AC1.3)

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open `http://localhost:8000` in a fresh browser tab. Open DevTools (F12) and switch to the Network tab. | DevTools Network tab is visible. |
| 1.2 | In the Network tab, filter by "EventSource" or "SSE" connection type. Locate the SSE connection to `api-v3.mbta.com`. | An active SSE connection appears. |
| 1.3 | Click the SSE request and inspect the request URL query parameters. Look for `filter[route_type]`. | The parameter value is `0,1,2,3,4`. The `4` confirms ferry vehicles are included in the SSE stream. |
| 1.4 | In the Network tab, filter by "XHR" or "Fetch". Locate the routes API request to `api-v3.mbta.com/routes`. Inspect its query parameters. | The `filter[type]` parameter value is `0,1,2,3,4`. |
| 1.5 | Click the routes API response and inspect the JSON body. Search for route IDs starting with `Boat-` (e.g., `Boat-F1`, `Boat-F4`). | Ferry routes appear in the response with `attributes.type === 4`, `attributes.color === "008EAA"`, `attributes.long_name` values like "Hingham/Hull Ferry", and `attributes.polyline` containing encoded polyline data. |
| 1.6 | In the Network tab, locate the stops API request to `api-v3.mbta.com/stops`. Inspect its query parameters. | The `filter[route_type]` parameter value is `0,1,2,3,4`. |
| 1.7 | Inspect the stops API response JSON. Search for stops associated with ferry routes (e.g., names containing "Wharf", "Hingham", "Hull", "Charlestown Navy Yard"). | Ferry terminal stops appear in the response. |

## Phase 2: Route Selection UI (AC2.4, AC2.5)

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open an incognito/private browser window. Navigate to `http://localhost:8000`. | App loads with the map visible. |
| 2.2 | Open the Routes selector panel (click the hamburger menu icon on mobile, or view the panel on desktop). | The panel shows four service groups: Subway, Bus, Commuter Rail, Ferry -- in that order from top to bottom. |
| 2.3 | Observe the master toggle checkboxes for each service group. | Subway is checked (enabled). Bus, Commuter Rail, and Ferry are all unchecked (disabled by default on first visit). |
| 2.4 | Confirm no ferry route polylines are visible on the map. Pan/zoom to the Boston Harbor area (~42.36, -71.05). | No ferry route lines or ferry stop markers are visible on the map. |
| 2.5 | Open DevTools Application tab. Navigate to Local Storage for `localhost:8000`. Inspect the `ttracker-service-toggles` key. | The value is a JSON object containing `"ferry": false` (along with `"subway": true`, `"bus": false`, `"commuterRail": false`). |
| 2.6 | In the Routes panel, check the Ferry master toggle (click the Ferry checkbox). | The Ferry group expands to show individual ferry route checkboxes (e.g., Charlestown Ferry, Hingham/Hull Ferry). Ferry route polylines appear on the map in MBTA aqua color. |
| 2.7 | Reload the page (F5 or Ctrl+R). Open the Routes panel again. | The Ferry toggle remains checked. Ferry route polylines are still visible on the map. The toggle state persisted across the reload. |
| 2.8 | Inspect `ttracker-service-toggles` in DevTools Application > Local Storage. | `"ferry": true` is now stored. |
| 2.9 | Uncheck the Ferry master toggle. Reload the page. | Ferry toggle is unchecked after reload. No ferry routes visible. `"ferry": false` in localStorage. |

## Phase 3: Vehicle Rendering (AC1.4)

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Enable the Ferry toggle in the Routes panel. If ferry service is currently operating, wait up to 30 seconds for ferry vehicle markers to appear on the map. | If ferries are active: one or more boat-shaped markers appear in the Boston Harbor area. If no ferries are operating: no ferry markers appear, but no errors in the console either. |
| 3.2 | (If a ferry vehicle is visible) Click or hover over a ferry vehicle marker. | The vehicle popup displays route information (e.g., "Hingham/Hull Ferry") with the boat icon. |
| 3.3 | (If a ferry vehicle is visible) Right-click the ferry vehicle marker and choose "Inspect Element" in DevTools. Locate the SVG element within the marker's div. | The SVG `fill` attribute or style is `#008EAA` (MBTA aqua). No color darkening has been applied -- the hex value is exactly `#008EAA`, not a darker variant. |
| 3.4 | Compare a ferry marker's fill color with a subway marker (e.g., Red Line). Inspect both in DevTools. | The subway marker may have a darkened color applied (e.g., Red Line's `#DA291C` darkened for type 1). The ferry marker retains its original `#008EAA` -- the `darkenColor` function in `map.js` only applies to types 1 and 2, not type 4. |

## End-to-End: Full Ferry Service Lifecycle

**Purpose:** Validates that a user can discover, enable, and monitor ferry service from first visit through notification configuration.

1. Clear all localStorage for `localhost:8000` (DevTools > Application > Local Storage > right-click > Clear).
2. Navigate to `http://localhost:8000`. Verify the map loads with only Subway routes visible.
3. Open the Routes panel. Verify four groups exist: Subway (checked), Bus (unchecked), Commuter Rail (unchecked), Ferry (unchecked).
4. Enable the Ferry toggle. Verify ferry route polylines appear on the map in aqua color.
5. Zoom to Boston Harbor area (~42.36, -71.05). Verify ferry stop markers appear at terminal locations (Long Wharf, Charlestown Navy Yard, Hingham Shipyard, etc.).
6. Click a ferry stop marker. Verify the popup shows the stop name and includes notification configuration options (if the notification system is active).
7. If ferry vehicles are operating: verify boat icons appear on the map moving along ferry routes. If not operating: verify no console errors related to ferry data.
8. Disable the Ferry toggle. Verify ferry routes, stops, and vehicles disappear from the map.
9. Re-enable Ferry, reload the page. Verify the toggle state persisted and ferry data reappears.

## End-to-End: Mixed Service Type Interaction

**Purpose:** Validates that enabling/disabling Ferry does not affect other service types.

1. Start with a clean localStorage (incognito window).
2. Enable both Subway (default) and Ferry toggles.
3. Verify subway lines (Red, Orange, Blue, Green) and ferry routes both display simultaneously on the map.
4. Disable the Ferry toggle. Verify only ferry data disappears -- subway routes, stops, and vehicles remain.
5. Re-enable Ferry, then disable Subway. Verify only subway data disappears -- ferry routes remain.
6. Enable all four toggles (Subway, Bus, Commuter Rail, Ferry). Verify all route types display without visual conflicts or performance degradation.

## Traceability

| Acceptance Criterion | Automated Test | Manual Step |
|----------------------|----------------|-------------|
| AC1.1 -- SSE includes ferry vehicles | -- | Phase 1, Steps 1.2-1.3 |
| AC1.2 -- Ferry routes fetched with metadata | -- | Phase 1, Steps 1.4-1.5 |
| AC1.3 -- Ferry stops displayed on map | -- | Phase 1, Steps 1.6-1.7; Phase 2, Step 2.6 |
| AC1.4 -- Boat icon in #008EAA, no darkening | -- | Phase 3, Steps 3.1-3.4 |
| AC2.1 -- Route sorter classifies type 4 as Ferry | `tests/ui.test.js` Test 1, Test 7 | -- |
| AC2.2 -- Ferry is 4th group | `tests/ui.test.js` Test 1 | Phase 2, Step 2.2 (visual) |
| AC2.3 -- Ferry sorted alphabetically | `tests/ui.test.js` Test 1, Test 7 | -- |
| AC2.4 -- Ferry hidden by default | -- | Phase 2, Steps 2.1-2.5 |
| AC2.5 -- Toggle persists in localStorage | -- | Phase 2, Steps 2.6-2.9 |
| AC2.6 -- No Ferry group when no type 4 routes | `tests/ui.test.js` Tests 2-6 | -- |
| AC3.1 -- Existing sorter tests pass | `tests/ui.test.js` Tests 1-6 | -- |
| AC3.2 -- Existing notification tests pass | `tests/notifications.test.js`, `tests/notification-ui.test.js` | -- |

**Totals:** 6 automated (unit tests), 6 human verification
