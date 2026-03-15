# T-Tracker Source Modules

Last verified: 2026-03-13

## Purpose
Fifteen ES6 modules that separate data acquisition (SSE), state management (interpolation),
rendering (Leaflet markers/polylines/stop markers), user controls (route filtering), polyline decoding,
polyline merging, route organization, popup content formatting, vehicle icon data, stop popup formatting,
and notification engine, notification UI management, and static data loading.

## Data Flow
```
static-data.js (localStorage + file cache)
       ↓
index.html (orchestrator — hydrate or fetch)
       ↓
MBTA API (SSE) -> api.js (parse) -> vehicles.js (interpolate) -> map.js (render)
                      |                  ^                           ^
                      |               ui.js (configure)      polyline.js (decode)
                      |                  ^                      polyline-merge.js (merge decision)
                      |                  (organize routes)   stop-markers.js (render stops)
                      |                                      vehicle-popup.js (format)
                      |                                      stop-popup.js (format)
                      |                                      vehicle-icons.js (icon data)
                      |                                      route-sorter.js
                      |
                      +-> notifications.js (monitor & fire)
                            |
                            +-> notification-ui.js (status & panel)
```

## Contracts

### api.js -- SSE Client
- **Exposes**: `connect()`, `disconnect()`, `parseVehicle(data)`, `apiEvents` (EventTarget)
- **Guarantees**: Emits `vehicles:reset` (array), `vehicles:add` (object),
  `vehicles:update` (object), `vehicles:remove` ({id}) on apiEvents.
  Emits `connection:status` with `{state, message}` for UI indicator.
  All vehicle data flattened from JSON:API before emitting.
  `parseVehicle()` is a pure function that extracts and flattens vehicle data from JSON:API.
  Auto-reconnects with exponential backoff (1s-30s).
- **Expects**: `config.api.key` and `config.api.baseUrl` set in config.js

### vehicles.js -- State Manager and Animation Loop
- **Exposes**: `initVehicles(apiEvents, boundsCallback)`, `getVehicles()`, `onVehicleUpdate(cb)`
- **Guarantees**: Calls registered callbacks every animation frame with full `Map<id, vehicle>`.
  Interpolates position/bearing with easeOutCubic easing. Snaps if distance >100m.
  Fade-in (entering), fade-out (exiting) with opacity transitions.
  Pauses animation when tab is hidden (Page Visibility API).
- **Expects**: apiEvents EventTarget emitting vehicles:* events

### map.js -- Leaflet Rendering
- **Exposes**: `initMap(containerId)`, `loadRoutes()`, `loadStops()`,
  `fetchRouteStops(routeIds)`, `hydrateRouteStopsMap(routeId, stopIds)`,
  `hydrateRoutes(routes)`, `hydrateStops(stops)`, `getVisibleRoutes()`,
  `syncVehicleMarkers(vehiclesMap)`, `getRouteMetadata()`,
  `setVisibleRoutes(routeIds)`, `getStopData()`, `getRouteColorMap()`, `getRouteStopsMap()`
- **Guarantees**: Route polylines render below vehicle markers (layer ordering).
  Visible routes render polylines and 48x32 vehicle icon markers with type-specific SVG silhouettes.
  Hidden routes have no polylines or markers on map. Icons filled with route color, accented with fixed contrast details.
  Route colors from MBTA API applied to polylines. Vehicle popups bound to markers on creation.
  Desktop: hover opens, mouseout closes. Mobile: tap opens.
  Popup content refreshes when popup is open and vehicle data changes (throttled by updatedAt comparison).
  `fetchRouteStops(routeIds)` fetches route-stops mapping for only the specified routes (not all routes),
  limits concurrency to 3 simultaneous requests to avoid browser connection limits and rate limiting.
  `hydrateRouteStopsMap(routeId, stopIds)` populates the internal route-stops map from cached data without making network calls,
  accepts stopIds as either an Array or Set and stores as a Set.
- **Expects**: Leaflet `L` global available. `config.map.*`, `config.tiles.*` set.
  Creates custom `stopPane` (z-index 625) between markerPane (600) and tooltipPane (650) for stop marker layering.

### stop-markers.js -- Stop Marker Rendering & Notification Config
- **Exposes**: `initStopMarkers(map, apiEventsTarget)`, `updateVisibleStops(routeIds)`, `computeVisibleStops(visibleRouteIds, routeStopsMap, routeColorMap, stopsData = null)`, `createStopMarker(lat, lng, color)`, `refreshAllHighlights()`, `resolveMarkerKey(stopId)`, `getStopConfigState(stopId, childStopIds = null)`
- **Guarantees**: Renders stop markers as `L.marker` + `L.divIcon` with 44×44px touch targets in a custom `stopPane` (z-index 625) above vehicles.
  Creates one marker per unique stop (deduplication for stops on multiple routes, AC1.5).
  First visible route to claim a stop sets its color (no visual stacking).
  Only creates/removes markers on route visibility changes, not on every update (AC1.4 performance).
  Binds click popups to markers with stop name and routes serving that stop (via `formatStopPopup(configState)`).
  Popups are click-activated and include close button; autoPan ensures full visibility.
  `computeVisibleStops()` is a pure function for testability. Accepts optional 4th parameter `stopsData` (Map<stopId, {parentStopId, latitude, longitude, name, ...}>).
  Returns object with fields: `visibleStopIds` (Set), `stopColorMap` (Map), `stopRouteMap` (Map), and `mergedStops` (Map<parentId, {lat, lng, childStopIds, color}> with merged parent station data when stopsData provided).
  Implements parent station merging: stops sharing a `parentStopId` within 200m render as one marker at their averaged position (stop-marker-merging.AC1.1).
  Merged markers keyed by parentId in `stopMarkers` Map. Stores `marker._childStopIds` and `marker._isMerged` metadata for highlight and popup context.
  Module-level `childToParentMap` (Map<childStopId, parentStopId>) enables highlight resolution for merged groups (stop-marker-merging.AC6.1, AC6.2).
  `resolveMarkerKey(stopId)` returns the marker key for a stop ID: the stopId itself if it has a direct marker, or the parentId via childToParentMap if merged. Returns undefined if not found.
  `getStopConfigState(stopId, childStopIds)` computes popup config state. When childStopIds is provided, aggregates routes and existing alerts across all children; adds `stopId` field to each routeDirection entry identifying which child stop to configure.
  `highlightConfiguredStop()` resolves child stop IDs to parent-keyed markers via childToParentMap, applying stop-dot--configured class to merged markers when any child has a configured alert.
  Implements Phase 2 two-tap notification alert creation workflow via chip picker: first tap on direction button reveals chip picker with count options below the button (AC1.1), second tap on a chip updates the "Set Alert" button's data-count attribute and visually selects the chip (AC1.3), tapping "Set Alert" button creates the alert (AC1.3, AC1.4, AC1.5).
  Delegates chip picker interactions via event delegation on popupopen Leaflet event listener.
  On successful pair creation, calls `highlightConfiguredStop()` to visually enlarge configured stop markers.
  On page load, restores highlights for all previously-configured stops from localStorage.
  Computes fresh `configState` on each popup open with current pair count, existing alerts, and per-route direction info.
  For merged markers, `configState` is computed with `getStopConfigState(parentId, childStopIds)` to aggregate existing alerts and routes across all children.
  Each routeDirection entry can include optional `stopId` field (set by getStopConfigState for merged markers) indicating which child stop to use for alert creation (stop-marker-merging.AC3.1).
  Imports `MAX_PAIRS` constant from `notifications.js` for consistent limits across all modules.
  Sanitizes error messages with `escapeHtml()` before rendering to DOM (defense-in-depth for unsanitized API strings).
  Imports `buildChipPickerHtml` from `stop-popup.js` for chip picker HTML generation on direction button click.
  Centralized success/error handling for alert creation: after `addNotificationPair()` resolves, calls `highlightConfiguredStop()`, `updateNotificationStatus()`, `renderPanel()`, and closes popup on success; shows inline error message on failure.
  Listens for `notification:pair-expired` CustomEvent on apiEventsTarget to refresh stop highlights when pairs auto-delete.
- **Expects**: Leaflet `L` global available. `map.js` exports for stop data, route-stop mapping, and route colors. `stop-popup.js` for popup content formatting (`formatStopPopup`), chip picker HTML generation (`buildChipPickerHtml`), and HTML escaping (`escapeHtml`). `notifications.js` for pair management (`addNotificationPair`, `getNotificationPairs`), MAX_PAIRS constant. `notification-ui.js` for status/panel updates (`updateStatus`, `renderPanel`). `vehicle-math.js` for `haversineDistance()` (200m proximity check for parent station merging). `apiEventsTarget` EventTarget for listening to `notification:pair-expired` events (optional, defaults to null).
  `stopsData` Map must contain stop objects with `parentStopId`, `latitude`, `longitude`, and `name` properties for merged marker support.

### vehicle-math.js -- Pure Math
- **Exposes**: `lerp(a, b, t)`, `easeOutCubic(t)`, `lerpAngle(a, b, t)`, `haversineDistance(lat1, lon1, lat2, lon2)`, `darkenHexColor(hex, amount)`, `bearingToTransform(bearing)`
- **Guarantees**: Pure functions, no side effects. `lerpAngle` always returns [0, 360).
  `haversineDistance` returns meters.
  `darkenHexColor` darkens a hex color by reducing each RGB channel by the specified amount (0-1).
  `bearingToTransform` converts compass bearing (0-360) to CSS transform values {rotate, scaleX} for directional vehicle icons; returns {rotate: 0, scaleX: 1} for null/undefined bearing.
- **Expects**: Numeric inputs for math functions. Hex color string and amount (0-1) for `darkenHexColor`. Number|null|undefined for `bearingToTransform` bearing input.

### vehicle-icons.js -- Vehicle Icon SVG Data
- **Exposes**: `VEHICLE_ICONS` (object), `DEFAULT_ICON` (string)
- **Guarantees**: Pure data module, no logic, no dependencies, no imports.
  `VEHICLE_ICONS` maps MBTA route type numbers (0-4) to SVG content strings.
  Icons designed for viewBox `0 0 48 32`, facing right (east) by default.
  Body shapes use `currentColor` for route color fill.
  `DEFAULT_ICON` equals `VEHICLE_ICONS[3]` (bus) for unknown route types.
- **Expects**: Nothing (pure data)

### ui.js -- Route Selection Panel
- **Exposes**: `initUI(routeMetadata, onVisibilityChange)`
- **Guarantees**: Populates #controls with checkboxes grouped in four-tier hierarchy: Subway (heavy rail + Green Line branches), Bus, Commuter Rail, Ferry.
  Persists service toggle states to localStorage (key: `ttracker-service-toggles`) and individual route selections to localStorage (key: `ttracker-visible-routes`).
  First-visit defaults: Subway on, Bus off, Commuter Rail off, Ferry off (derived from metadata, not config).
  Returning-visit behavior: restores stored state, silently drops removed routes, adds new routes as visible if their service type is enabled.
  Mobile (<768px): slide-in drawer with backdrop. Desktop: static panel.
- **Expects**: `#controls` element in DOM. Route metadata from `getRouteMetadata()`.

### polyline.js -- Google Encoded Polyline Decoder
- **Exposes**: `decodePolyline(encoded)`
- **Guarantees**: Pure function. Returns array of [lat, lng] coordinate pairs.
  Handles Google's 5-digit decimal precision encoding algorithm.
- **Expects**: String input in Google encoded polyline format

### polyline-merge.js -- Polyline Merge Decision and Segment Merging
- **Exposes**: `shouldMergePolylines(coords1, coords2, thresholdMeters = 50)`, `mergePolylineSegments(coordsA, coordsB, threshold = 20)`
- **Guarantees**: Pure functions, no side effects. Works in both browser and Node.js (no Leaflet dependency).
  `shouldMergePolylines`: Samples 30 points along coords1 at equal arc-length intervals using binary search. For each sample, finds the nearest vertex in coords2 via exhaustive search. Returns true if the median of those distances is ≤ thresholdMeters (default 50m). Used as a gate to decide whether two polylines represent the same physical route.
  `mergePolylineSegments`: Segment-by-segment merge of two oriented polylines. For each vertex, finds nearest vertex on the other polyline. Where distance < threshold (default 20m), averages the vertex pairs (same street/track). Where distance ≥ threshold, keeps both paths as separate segments (different streets, terminus loops). Applies hysteresis smoothing: short divergent runs (< 3 consecutive vertices) are reclassified as "close" to prevent noise from threshold boundary oscillation. Returns array of polyline coordinate arrays (multiple segments per merged pair). Filters segments with < 2 vertices.
- **Expects**: Two arrays of coordinate objects with {lat, lng} properties. Both polylines should be oriented in the same direction before calling `mergePolylineSegments`.

### route-sorter.js -- Route Sorting and Grouping
- **Exposes**: `groupAndSortRoutes(routes)`
- **Guarantees**: Pure function. Returns routes organized into four top-level groups:
  (1) Subway (types 0 + 1): Heavy rail routes (Red, Orange, Blue) in fixed order, with optional subgroup
  for Green Line branches (B, C, D, E) sorted alphabetically.
  (2) Bus (type 3): Sorted numerically (1, 2, ...) then alphanumerically (CT1, ...).
  (3) Commuter Rail (type 2): Sorted alphabetically by longName.
  (4) Ferry (type 4): Sorted alphabetically by longName.
  Return shape: `Array<{group: string, routes: Array<Object>, subGroups?: Array<{group: string, routes: Array<Object>}>}>`.
  Each group only appears if it has routes.
- **Expects**: Array of route objects with {id, shortName, longName, color, type} properties

### vehicle-popup.js -- Popup Content Formatting
- **Exposes**: `formatVehiclePopup(vehicle, stopName, routeMeta)`, `formatStatus(currentStatus, stopName)`, `formatSpeed(speedMs)`, `formatTimeAgo(updatedAt)`
- **Guarantees**: Pure functions, no side effects. Returns HTML strings. Gracefully handles null/missing data (omits sections rather than showing empty/broken content). Speed converted from m/s to mph. Commuter rail (type 2) displays longName for context; subway and bus display shortName for conciseness.
- **Expects**: Vehicle object with {label, routeId, currentStatus, directionId, speed, updatedAt}. Stop name as string or null. Route metadata as {type, shortName, longName, color} or null.

### stop-popup.js -- Stop Popup Content Formatting
- **Exposes**: `formatStopPopup(stop, routeInfos, configState = {})`, `buildChipPickerHtml(stopId, routeId, directionId)`, `escapeHtml(str)`
- **Guarantees**: Pure functions, no side effects. Returns HTML strings. Gracefully handles null/missing data (omits sections rather than showing empty/broken content). HTML-escapes all user strings to prevent injection. Commuter rail (type 2) uses longName; subway and bus use shortName. Generates popup with direction buttons that trigger two-tap alert creation flow: first tap on direction button reveals inline chip picker with count options `[1] [2] [3] [#] [∞]`, second tap on chip creates the alert with that count. Chip picker with count selection component: `buildChipPickerHtml()` generates div with selectable count chips (1, 2, 3 as presets), custom input option (#), unlimited option (∞), and "Set Alert" button. Chip `1` is pre-selected by default. Custom chip (#) reveals inline number input for values 1-99. Counter shows `pairCount/maxPairs` in actions area. All buttons include `data-stop-id` and `data-route-id` attributes for event delegation. For merged markers, `data-stop-id` attribute uses `routeDirection.stopId` if present (identifying the specific child stop to configure alerts for), falling back to `stop.id` for backward compatibility.
- **Expects**: Stop object with {id, name, latitude, longitude}. Route infos as Array<{id, shortName, longName, color, type}> or null. Optional configState object with shape {pairCount, maxPairs, existingAlerts: Array<{routeId, directionId}>, routeDirections: Array<{routeId, routeName, dir0Label, dir1Label, isTerminus, stopId?: string}>>}. The `stopId` field in routeDirections is optional and used only for merged markers to specify which child stop to use for alert creation.

### notifications.js -- Notification Engine
- **Exposes**: `MAX_PAIRS` (constant: 5), `initNotifications(apiEventsTarget, stopsData, terminusChecker?, directionLabelFn?, routeMetadataFn?)`, `addNotificationPair(checkpointStopId, routeId, directionId, count = null)`, `removeNotificationPair(pairId)`, `updatePairCount(pairId, count)`, `getNotificationPairs()`, `validatePair(checkpointStopId, routeId, directionId, existingPairs)`, `shouldNotify(vehicle, pair, notifiedSet, stopsData?, terminusChecker?)`, `requestPermission()`, `getPermissionState()`, `pauseNotifications()`, `resumeNotifications()`, `togglePause()`, `isPaused()`
- **Guarantees**: Max 5 notification pairs enforced. Same checkpoint+route+direction rejected. Config persists to localStorage (key: `ttracker-notifications-config`). Duplicate prevention: same vehicle+pair only notifies once per session. Graceful degradation: if Notification API unavailable, config still works. Pairs with invalid stop IDs filtered on init. Storage quota exceeded handled gracefully without crashing. `addNotificationPair(checkpointStopId, routeId, directionId, count = null)` is async: creates pair with optional `count` parameter (number for limited notifications, null for unlimited). Requests permission on first configuration (AC9.1), returns with permissionState. `updatePairCount(pairId, count)` updates a pair's remaining/total count for the alerts panel. `requestPermission()` must be called from user gesture context. `getPermissionState()` queries current permission without prompting. Pause state persists to localStorage (key: `ttracker-notifications-paused`). `pauseNotifications()` and `resumeNotifications()` only modify paused flag — pairs array never modified (AC5.5). Paused state skips checkAllPairs processing — notifications do not fire when paused (AC5.1). Paused state restored on `initNotifications()` from localStorage (AC5.3). Notification pairs include fields: `id`, `checkpointStopId`, `routeId`, `directionId`, `remainingCount` (number|null), `totalCount` (number|null). On notification fire, if `remainingCount` is not null, it decrements by 1. When `remainingCount` reaches 0, the pair is auto-deleted and removed from localStorage (emits `notification:pair-expired` CustomEvent). Existing pairs without count fields migrate to unlimited (null/null) on load.
- **CustomEvents emitted**: `notification:pair-expired` (detail: `{pairId, checkpointStopId}`) when a pair's remainingCount reaches 0 and the pair is auto-deleted
- **Expects**: `apiEventsTarget` EventTarget emitting `vehicles:update` and `vehicles:add` with vehicle detail objects. `stopsData` Map from `map.js` for stop name lookups. Vehicle object must have {id, stopId, routeId, directionId, label} properties. Stores apiEventsTarget reference for dispatching `notification:pair-expired` events. Optional injected dependencies: `terminusChecker(stopId, routeId)` for terminus detection, `directionLabelFn(routeId)` for direction labels, `routeMetadataFn()` for route metadata.

### notification-ui.js -- Notification Status and Panel UI
- **Exposes**: `formatCountDisplay(remainingCount)`, `formatPairForDisplay(pair, stopsData, routeMetadata)`, `initNotificationUI(statusElement, apiEventsTarget)`, `updateStatus()`,
  `initNotificationPanel(panelElement, toggleButton)`, `renderPanel()`
- **Guarantees**: `formatCountDisplay(remainingCount)` returns human-readable count string: "N remaining" for numbers, "unlimited" with infinity symbol for null.
  Status indicator shows current state: active (green), blocked (red), default (gray), paused (amber), or hidden.
  Updates immediately on config or permission changes.
  "Enable" button triggers permission request from user gesture context.
  Detects permission revocation on tab focus via visibilitychange event.
  AC6.1: Shows "Active: N alerts — Pause" when permission granted and pairs configured.
  AC6.2: Shows "Paused — Resume" when manually paused (AC5.4).
  AC6.3: Shows "Notifications blocked — Enable" button when permission denied.
  AC9.3: Warning banner shown when permission denied.
  AC9.4: Enable button triggers permission request again.
  AC9.5: Status updates after permission change.
  AC5.4: Paused state shows amber "Paused — Resume" button with pause/resume toggle.
  AC6.5: Updates immediately when permission state changes.
  Panel lists all pairs with readable stop/route names (AC10.1).
  Delete button removes individual pairs (AC10.2).
  Counter shows "X/5 pairs configured" (AC10.3).
  Toggle button shown/hidden based on pair count (AC10.4).
  Empty state shows "No notifications configured" (AC10.5).
  AC4.1: Each pair displays "N remaining" (or "∞ unlimited") count below route name.
  AC4.2: Tapping the count text reveals inline chip picker for editing.
  AC4.3: Selecting a new count updates the pair's remainingCount and totalCount via `updatePairCount()` and persists to localStorage.
  AC4.4: Selecting ∞ on a counted pair converts it to unlimited (remainingCount = null).
  AC4.5: Selecting a count on an unlimited pair converts it to counted (remainingCount = count).
  Helper functions: `buildPanelChipPickerHtml(pairId, currentCount)` generates chip picker HTML for editing pair counts.
  Helper function: `bindPanelChipPicker(picker, pairId)` binds chip selection, custom input, and apply interactions.
  Listens for `notification:pair-expired` CustomEvent on apiEventsTarget to update status and panel when pairs auto-delete.
- **Expects**: `#notification-status` and `#notification-panel` elements in DOM.
  `notifications.js` functions for state queries (`getNotificationPairs()`, `getPermissionState()`, `requestPermission()`, `isPaused()`, `togglePause()`, `removeNotificationPair()`, `updatePairCount()`).
  `getStopData()` and `getRouteMetadata()` from `map.js` for name resolution.
  `escapeHtml()` from `stop-popup.js` for HTML escaping.
  `apiEventsTarget` EventTarget for listening to `notification:pair-expired` events (optional, defaults to null).

### static-data.js -- Static Data Loader
- **Exposes**: `loadStaticData(onRefresh = null, apiKey = '')`, `getStaticDataAge(bundle)`
- **Guarantees**: Loads MBTA static data from `data/mbta-static.json` with localStorage caching. On fresh visit: fetches file, writes to localStorage with version field. On returning visit: reads from localStorage (version-checked). After hydration, fires background staleness check (non-blocking). Returns bundle `{ generatedAt, routes, stops, routeStops }`. Staleness check fetches only route IDs (lightweight), compares with cached set. If IDs match: no further calls (AC3.2). If IDs differ: re-fetches file (cache-busted), updates localStorage, calls `onRefresh(freshBundle)`. Check failure is silent per AC3.4. Throws if both localStorage and file fetch fail, allowing caller to fall back to live MBTA API (AC2.4). `getStaticDataAge(bundle)` returns seconds since `generatedAt`.
- **Expects**: `globalThis.localStorage` available. `globalThis.fetch` for HTTP requests. `apiKey` (MBTA API key) to append to staleness check URL (prevents rate limiting).

## Build and CI Scripts

### scripts/fetch-mbta-data.mjs -- MBTA Static Data Prebake
- **Purpose**: Node.js ESM script that fetches routes, shapes, and stops from MBTA V3 API, applies polyline merging and proximity filtering, and writes `data/mbta-static.json`
- **Usage**: `MBTA_API_KEY=<key> node scripts/fetch-mbta-data.mjs`
- **Output**: `data/mbta-static.json` with schema `{ generatedAt: timestamp, routes: [], stops: [], routeStops: {routeId: [stopIds]} }`
- **Processing**: Orientation-aligned polyline merging (rail only), 150m proximity filter for nearby stops, route type and name sorting
- **Expectations**: `MBTA_API_KEY` environment variable, network access to MBTA V3 API

## Key Decisions
- Event-driven (CustomEvent/EventTarget) over direct function calls: enables multiple subscribers
- requestAnimationFrame loop in vehicles.js, not map.js: separates state from rendering
- Vehicle data includes topological fields (stopId, currentStopSequence): enables future non-map renderers
- Two-click notification config via map stop popups (not a separate settings page): keeps spatial context
- notifications.js listens to apiEvents directly (not via vehicles.js): avoids coupling notification timing to animation frames
- Pure formatting modules (stop-popup.js, notification-ui.js) export display helpers separately from init: enables isolated unit testing

## Route Type Behavior Matrix

MBTA route types differ in how their polylines are processed at prebake time
(`scripts/fetch-mbta-data.mjs`) and at render time (`src/map.js`).
**Any code touching polylines MUST consult this table.**

| Processing Stage | Type 0 Light Rail | Type 1 Heavy Rail | Type 2 Commuter Rail | Type 3 Bus | Type 4 Ferry |
|---|---|---|---|---|---|
| **Prebake: inbound/outbound dedup** | YES — same physical track | YES — same physical track | NO | NO | NO |
| **Prebake: segment-merge (average close paths)** | NO (rail uses dedup instead) | NO (rail uses dedup instead) | YES — same street averaging | YES — same street averaging | YES |
| **Prebake: terminus loop extraction** | YES — Green-E Heath St style | YES | NO | NO | NO |
| **Prebake: direction stop classification** | YES — stops may be direction-only | YES — stops may be direction-only | NO — all stops serve both directions | NO — opposite-side bus stops both serve both directions | NO |
| **Render-time: concat fragments** | YES | YES | NO | NO | NO |
| **Render-time: start+end dedup** | YES | YES | NO — would destroy one-way paths | NO — would destroy one-way paths | NO |
| **Render-time: terminal trim to stops** | YES | YES | NO | NO | NO |
| **Stop marker direction buttons** | Both shown unless stop is rail direction-only | Both shown unless stop is rail direction-only | Both always shown | Both always shown | Both always shown |

### Why Non-Rail Does NOT Get Rail Dedup

Bus inbound and outbound routes can be 10-15m apart on the **same street** (visibly doubled
at zoom 17+) or 50-150m apart on **different streets** at each terminus. The segment-merge
algorithm handles both cases: it averages where paths share the same street and keeps separate
segments where they diverge.

Rail dedup uses a start+end proximity gate that would collapse both bus directions into one
even when they use different streets at terminuses. This destroyed Bus 39's one-way terminus
paths in the bug that triggered 9 algorithm rewrites.

### isRailType() Definition

The canonical definition is `type === 0 || type === 1`. It appears in:
- `scripts/fetch-mbta-data.mjs` — prebake pipeline
- `src/map.js` — `const isRailRoute`
- `src/stop-markers.js` — `const isRail`
- `tests/route-type-polyline.test.js` — `isRailType()` helper

**All four must agree.** If you change the definition in one place, update all four and
update this table.

### Adding a New Route Type

If MBTA ever introduces a type 5:
1. Add a row to this table
2. Update `isRailType()` in all four files above
3. Add the new type to `testAllTypesBranchAssignment()` in `tests/route-type-polyline.test.js`
4. Run `node tests/route-type-polyline.test.js` — it will fail until the matrix is updated

## Invariants
- api.js is the only module that talks to MBTA API for live vehicle data (exceptions: map.js fetches route shapes at startup; static-data.js makes a lightweight staleness check against /routes; scripts/fetch-mbta-data.mjs prebakes static data offline)
- All MBTA JSON:API parsing happens at the api.js boundary (downstream modules receive flat objects)
- vehicles.js owns the canonical vehicle state Map; map.js only renders from it
- config.js is the single source for all tunable parameters (exception: default visibility is derived from service type in ui.js, not config)
- notifications.js owns all notification pair state; stop-markers.js and notification-ui.js query it but never modify pairs directly
- MAX_PAIRS constant lives in notifications.js and is imported by stop-markers.js; never duplicated as a local constant
- All user-facing strings in stop popups are HTML-escaped via stop-popup.js `escapeHtml()` before DOM insertion
