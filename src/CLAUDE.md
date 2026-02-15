# T-Tracker Source Modules

Last verified: 2026-02-14

## Purpose
Thirteen ES6 modules that separate data acquisition (SSE), state management (interpolation),
rendering (Leaflet markers/polylines/stop markers), user controls (route filtering), polyline decoding,
route organization, popup content formatting, vehicle icon data, stop popup formatting, notification engine,
and notification UI management.

## Data Flow
```
MBTA API (SSE) -> api.js (parse) -> vehicles.js (interpolate) -> map.js (render)
                      |                  ^                           ^
                      |               ui.js (configure)      polyline.js (decode)
                      |                  ^                      stop-markers.js (render stops)
                      |                  (organize routes)   vehicle-popup.js (format)
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
  `buildRouteStopsMapping()`, `syncVehicleMarkers(vehiclesMap)`, `getRouteMetadata()`,
  `setVisibleRoutes(routeIds)`, `getStopData()`, `getRouteColorMap()`, `getRouteStopsMap()`
- **Guarantees**: Route polylines render below vehicle markers (layer ordering).
  Visible routes render polylines and 48x32 vehicle icon markers with type-specific SVG silhouettes.
  Hidden routes have no polylines or markers on map. Icons filled with route color, accented with fixed contrast details.
  Route colors from MBTA API applied to polylines. Vehicle popups bound to markers on creation.
  Desktop: hover opens, mouseout closes. Mobile: tap opens.
  Popup content refreshes when popup is open and vehicle data changes (throttled by updatedAt comparison).
  `buildRouteStopsMapping()` limits concurrency to 3 simultaneous requests to avoid browser connection limits and rate limiting.
- **Expects**: Leaflet `L` global available. `config.map.*`, `config.tiles.*` set.

### stop-markers.js -- Stop Marker Rendering & Notification Config
- **Exposes**: `initStopMarkers(map)`, `updateVisibleStops(routeIds)`, `computeVisibleStops(visibleRouteIds, routeStopsMap, routeColorMap)`
- **Guarantees**: Renders lightweight SVG circle markers for stops on visible routes (AC1.1).
  Creates one marker per unique stop (deduplication for stops on multiple routes, AC1.5).
  First visible route to claim a stop sets its color (no visual stacking).
  Only creates/removes markers on route visibility changes, not on every update (AC1.4 performance).
  Binds click popups to markers with stop name and routes serving that stop (via `formatStopPopup(configState)`).
  Popups are click-activated and include close button; autoPan ensures full visibility.
  `computeVisibleStops()` is a pure function for testability.
  Implements Phase 4 two-click notification config workflow: User clicks "Set as Checkpoint" on stop A, then "Set as My Stop" on stop B to create pair.
  Maintains module-level state for pending checkpoint (stopId + routeId) during workflow.
  Delegates config button clicks via Leaflet `popupopen` event listener on map instance.
  On successful pair creation, calls `highlightConfiguredStop()` to visually enlarge configured stop markers.
  On page load, restores highlights for all previously-configured stops from localStorage.
  Computes fresh `configState` on each popup open, resolving `pendingCheckpoint` stopId to human-readable `pendingCheckpointName` from stop data (ensures dynamic state like pending checkpoint and pair count are always current, and pending checkpoint displays as "Checkpoint: Park Street" not raw ID).
  Imports `MAX_PAIRS` constant from `notifications.js` for consistent limits across all modules.
  Sanitizes error messages with `escapeHtml()` before rendering to DOM (defense-in-depth for unsanitized API strings).
- **Expects**: Leaflet `L` global available. `map.js` exports for stop data, route-stop mapping, and route colors. `stop-popup.js` for popup content formatting (`formatStopPopup`) and HTML escaping (`escapeHtml`). `notifications.js` for pair management (`addNotificationPair`, `getNotificationPairs`), MAX_PAIRS constant.

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
- **Exposes**: `formatStopPopup(stop, routeInfos, configState = {})`, `escapeHtml(str)`
- **Guarantees**: Pure functions, no side effects. Returns HTML strings. Gracefully handles null/missing data (omits sections rather than showing empty/broken content). HTML-escapes all user strings to prevent injection. Commuter rail (type 2) uses longName; subway and bus use shortName. Generates 5 popup states based on configState: (1) Default — both "Set as Checkpoint" and "Set as My Stop" buttons, (2) Pending checkpoint selected — shows pending checkpoint's human-readable name via `pendingCheckpointName`, only "Set as My Stop" button (active style), (3) Already configured as checkpoint — shows "Checkpoint for [route]" indicator, no buttons, (4) Already configured as destination — shows "Destination for [route]" indicator, no buttons, (5) Max pairs reached — shows "X/X pairs configured (maximum reached)" message, no buttons. All buttons include `data-stop-id` and `data-route-ids` attributes. Counter shows `pairCount/maxPairs` in default and pending states.
- **Expects**: Stop object with {id, name, latitude, longitude}. Route infos as Array<{id, shortName, longName, color, type}> or null. Optional configState object with shape {isCheckpoint, isDestination, pairCount, pendingCheckpoint, pendingCheckpointName, maxPairs}.

### notifications.js -- Notification Engine
- **Exposes**: `MAX_PAIRS` (constant: 5), `initNotifications(apiEvents, stopsData)`, `addNotificationPair(checkpointStopId, myStopId, routeId)`, `removeNotificationPair(pairId)`, `getNotificationPairs()`, `validatePair(checkpointStopId, myStopId, existingPairs)`, `shouldNotify(vehicle, pair, notifiedSet)`, `requestPermission()`, `getPermissionState()`, `pauseNotifications()`, `resumeNotifications()`, `togglePause()`, `isPaused()`
- **Guarantees**: Max 5 notification pairs enforced. Same checkpoint+destination rejected. Config persists to localStorage (key: `ttracker-notifications-config`). Duplicate prevention: same vehicle+pair only notifies once per session. Direction detection: first vehicle at checkpoint sets learned direction; opposite-direction vehicles filtered. Graceful degradation: if Notification API unavailable, config still works. Pairs with invalid stop IDs filtered on init. Storage quota exceeded handled gracefully without crashing. `addNotificationPair()` is async: requests permission on first configuration (AC9.1), returns with permissionState. `requestPermission()` must be called from user gesture context. `getPermissionState()` queries current permission without prompting. Pause state persists to localStorage (key: `ttracker-notifications-paused`). `pauseNotifications()` and `resumeNotifications()` only modify paused flag — pairs array never modified (AC5.5). Paused state skips checkAllPairs processing — notifications do not fire when paused (AC5.1). Paused state restored on `initNotifications()` from localStorage (AC5.3).
- **Expects**: `apiEvents` EventTarget emitting `vehicles:update` and `vehicles:add` with vehicle detail objects. `stopsData` Map from `map.js` for stop name lookups and AC8.5 validation. Vehicle object must have {id, stopId, routeId, directionId, label} properties.

### notification-ui.js -- Notification Status and Panel UI
- **Exposes**: `formatPairForDisplay(pair, stopsData, routeMetadata)`, `initNotificationUI(statusElement)`, `updateStatus()`,
  `initNotificationPanel(panelElement, toggleButton)`, `renderPanel()`
- **Guarantees**: Status indicator shows current state: active (green), blocked (red), default (gray), paused (amber), or hidden.
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
- **Expects**: `#notification-status` and `#notification-panel` elements in DOM.
  `notifications.js` functions for state queries (`getNotificationPairs()`, `getPermissionState()`, `requestPermission()`, `isPaused()`, `togglePause()`, `removeNotificationPair()`).
  `getStopData()` and `getRouteMetadata()` from `map.js` for name resolution.

## Key Decisions
- Event-driven (CustomEvent/EventTarget) over direct function calls: enables multiple subscribers
- requestAnimationFrame loop in vehicles.js, not map.js: separates state from rendering
- Vehicle data includes topological fields (stopId, currentStopSequence): enables future non-map renderers
- Two-click notification config via map stop popups (not a separate settings page): keeps spatial context
- notifications.js listens to apiEvents directly (not via vehicles.js): avoids coupling notification timing to animation frames
- Pure formatting modules (stop-popup.js, notification-ui.js) export display helpers separately from init: enables isolated unit testing

## Invariants
- api.js is the only module that talks to MBTA API (exception: map.js fetches route shapes and stop data at startup)
- All MBTA JSON:API parsing happens at the api.js boundary (downstream modules receive flat objects)
- vehicles.js owns the canonical vehicle state Map; map.js only renders from it
- config.js is the single source for all tunable parameters (exception: default visibility is derived from service type in ui.js, not config)
- notifications.js owns all notification pair state; stop-markers.js and notification-ui.js query it but never modify pairs directly
- MAX_PAIRS constant lives in notifications.js and is imported by stop-markers.js; never duplicated as a local constant
- All user-facing strings in stop popups are HTML-escaped via stop-popup.js `escapeHtml()` before DOM insertion
