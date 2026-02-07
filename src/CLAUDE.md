# T-Tracker Source Modules

Last verified: 2026-02-07

## Purpose
Six ES6 modules that separate data acquisition (SSE), state management (interpolation),
rendering (Leaflet markers/polylines), user controls (route filtering), polyline decoding,
and route organization.

## Data Flow
```
MBTA API (SSE) -> api.js (parse) -> vehicles.js (interpolate) -> map.js (render)
                                          ^                           ^
                                       ui.js (configure)      polyline.js (decode)
                                          ^                      route-sorter.js
                                          (organize routes)
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
  `syncVehicleMarkers(vehiclesMap)`, `getRouteMetadata()`, `setHighlightedRoutes(routeIds)`,
  `getStopData()`
- **Guarantees**: Route polylines render below vehicle markers (layer ordering).
  Marker icons reflect highlight state (size 24px normal, 28px highlighted).
  Route colors from MBTA API applied to polylines and marker glow.
- **Expects**: Leaflet `L` global available. `config.map.*`, `config.tiles.*` set.

### vehicle-math.js -- Pure Math
- **Exposes**: `lerp(a, b, t)`, `easeOutCubic(t)`, `lerpAngle(a, b, t)`, `haversineDistance(lat1, lon1, lat2, lon2)`
- **Guarantees**: Pure functions, no side effects. `lerpAngle` always returns [0, 360).
  `haversineDistance` returns meters.
- **Expects**: Numeric inputs

### ui.js -- Route Selection Panel
- **Exposes**: `initUI(routeMetadata, onHighlightChange)`
- **Guarantees**: Populates #controls with checkboxes grouped by Green Line / Bus.
  Persists selections to localStorage (key: `ttracker-highlighted-routes`).
  Restores from localStorage on load, falls back to config defaults.
  Mobile (<768px): slide-in drawer with backdrop. Desktop: static panel.
- **Expects**: `#controls` element in DOM. Route metadata from `getRouteMetadata()`.

### polyline.js -- Google Encoded Polyline Decoder
- **Exposes**: `decodePolyline(encoded)`
- **Guarantees**: Pure function. Returns array of [lat, lng] coordinate pairs.
  Handles Google's 5-digit decimal precision encoding algorithm.
- **Expects**: String input in Google encoded polyline format

### route-sorter.js -- Route Sorting and Grouping
- **Exposes**: `groupAndSortRoutes(routes)`
- **Guarantees**: Pure function. Returns routes organized into groups with sorting:
  Green Line branches (B, C, D, E) sorted alphabetically first,
  then bus routes sorted numerically (1, 2, ...) then alphanumerically (CT1, ...).
- **Expects**: Array of route objects with {id, shortName, color, type} properties

## Key Decisions
- Event-driven (CustomEvent/EventTarget) over direct function calls: enables multiple subscribers
- requestAnimationFrame loop in vehicles.js, not map.js: separates state from rendering
- Vehicle data includes topological fields (stopId, currentStopSequence): enables future non-map renderers

## Invariants
- api.js is the only module that talks to MBTA API
- All MBTA JSON:API parsing happens at the api.js boundary (downstream modules receive flat objects)
- vehicles.js owns the canonical vehicle state Map; map.js only renders from it
- config.js is the single source for all tunable parameters
