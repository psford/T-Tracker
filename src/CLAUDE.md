# T-Tracker Source Modules

Last verified: 2026-02-07

## Purpose
Four ES6 modules that separate data acquisition (SSE), state management (interpolation),
rendering (Leaflet markers/polylines), and user controls (route filtering).

## Data Flow
```
MBTA API (SSE) -> api.js (parse) -> vehicles.js (interpolate) -> map.js (render)
                                          ^
                                       ui.js (configure highlighting)
```

## Contracts

### api.js -- SSE Client
- **Exposes**: `connect()`, `disconnect()`, `apiEvents` (EventTarget)
- **Guarantees**: Emits `vehicles:reset` (array), `vehicles:add` (object),
  `vehicles:update` (object), `vehicles:remove` ({id}) on apiEvents.
  Emits `connection:status` with `{state, message}` for UI indicator.
  All vehicle data flattened from JSON:API before emitting.
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
  `getStopData()`, `decodePolyline(encoded)`
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

## Key Decisions
- Event-driven (CustomEvent/EventTarget) over direct function calls: enables multiple subscribers
- requestAnimationFrame loop in vehicles.js, not map.js: separates state from rendering
- Vehicle data includes topological fields (stopId, currentStopSequence): enables future non-map renderers

## Invariants
- api.js is the only module that talks to MBTA API
- All MBTA JSON:API parsing happens at the api.js boundary (downstream modules receive flat objects)
- vehicles.js owns the canonical vehicle state Map; map.js only renders from it
- config.js is the single source for all tunable parameters
