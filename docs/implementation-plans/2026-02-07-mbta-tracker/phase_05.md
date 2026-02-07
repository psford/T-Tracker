# MBTA Real-Time Transit Tracker Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 8 phases from original design (phases 1-8)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements:

### mbta-tracker.AC7: Cross-Cutting Behaviors
- **mbta-tracker.AC7.4 Success:** Route polylines load once on startup (cached, not live-updated)

---

<!-- START_TASK_1 -->
### Task 1: Add route polyline rendering to src/map.js

**Files:**
- Modify: `src/map.js` — add route fetching, polyline decoding, and Leaflet polyline rendering
- Modify: `config.js` — add route styling configuration (weight, opacity for normal vs highlighted)

**Implementation:**

Add to `config.js`:
```javascript
routeStyles: {
    normal: { weight: 3, opacity: 0.5 },
    highlighted: { weight: 5, opacity: 0.9 },
},
```

Add to `src/map.js`:

1. `decodePolyline(encoded)` — inline implementation of Google's encoded polyline algorithm. Takes an encoded string, returns array of `[lat, lng]` pairs. The algorithm:
   - Read characters from the encoded string
   - For each coordinate component (lat then lng): accumulate 5-bit chunks until a chunk without the continuation bit (0x20) is found, apply sign inversion if lowest bit is set, divide by 1e5 to get decimal degrees
   - Each decoded value is a delta from the previous value
   - Returns array of `[lat, lng]` coordinate pairs

   This is a well-documented ~20 line function — no external library needed.

2. `loadRoutes()` — async function that:
   - Fetches `https://api-v3.mbta.com/routes?filter[type]=0,3&include=route_patterns.representative_trip.shape&api_key=KEY` (from `config.api`)
   - Parses the JSON:API response: `data` array (routes) and `included` array (route_patterns, trips, shapes)
   - For each route in `data`:
     - Get route color from `route.attributes.color` (6-char hex, prepend `#`)
     - Walk relationships: `route.relationships.route_patterns.data` → find each pattern in `included` → pattern's `relationships.representative_trip.data` → find trip in `included` → trip's `relationships.shape.data` → find shape in `included`
     - For each shape found: decode `shape.attributes.polyline` using `decodePolyline()`
     - Create `L.polyline(decodedCoords, { color, weight: config.routeStyles.normal.weight, opacity: config.routeStyles.normal.opacity })`
     - Add polyline to a route-specific `L.layerGroup`
   - Add route layer group to map **before** the vehicle markers layer group (ensures polylines render below markers)
   - Store route polylines in a `Map<routeId, L.Polyline[]>` for Phase 6 highlighting
   - Store route metadata array `[{ id, color, shortName, longName, type }]` for Phase 6 UI

3. `getRouteMetadata()` — returns the stored route metadata array (for populating Phase 6 dropdown)

**Layer ordering:** Ensure the route polyline layer group is added to the map before the vehicle markers layer group. Leaflet renders in add-order, so polylines will appear below markers.

**Error handling:** If the routes fetch fails, log the error to console but don't crash — the app still works without route lines (vehicles will still show). Wrap the fetch in try/catch.

**MBTA JSON:API relationship chain:**
```
route.relationships.route_patterns.data[].id
  → find in included where type="route_pattern" and id matches
    → pattern.relationships.representative_trip.data.id
      → find in included where type="trip" and id matches
        → trip.relationships.shape.data.id
          → find in included where type="shape" and id matches
            → shape.attributes.polyline (encoded string to decode)
```

**Green Line specifics:**
- Green-B, Green-C, Green-D, Green-E are separate routes
- All share color `00843D` (dark green)
- Each has its own shape data for its branch path

**Commit:** `feat: add route polyline rendering with encoded polyline decoder`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Wire route loading into app startup

**Files:**
- Modify: `index.html` — call `loadRoutes()` on startup after map init

**Implementation:**

Update the `<script type="module">` in `index.html` to call `loadRoutes()` after `initMap()`. Since `loadRoutes()` is async (network request), run it in parallel with SSE connection — don't await it before connecting:

```javascript
import { initMap, loadRoutes, syncVehicleMarkers } from './src/map.js';
import { connect, apiEvents } from './src/api.js';
import { initVehicles, onVehicleUpdate } from './src/vehicles.js';

const map = initMap('map');
initVehicles(apiEvents);
onVehicleUpdate(syncVehicleMarkers);

// Load routes and connect to SSE in parallel — neither blocks the other
loadRoutes();
connect();
```

**Verification:**

Open in browser. Verify:
1. Green Line branches (B, C, D, E) appear as green polylines on the map
2. Active bus routes appear in their respective API-provided colors
3. Route polylines render below vehicle markers (correct z-order)
4. Routes load once on startup (check Network tab — only one routes request)
5. Vehicle markers still animate correctly on top of route lines
6. No console errors

**Commit:** `feat: load route polylines on startup`

<!-- END_TASK_2 -->

---

**Verifies:** None (infrastructure phase — verified operationally by visual inspection)

**Phase done when:** Map shows Green Line branches as green polylines and active bus routes in their API-provided colors. Routes render below vehicle markers (correct layer order). Routes load once on startup (not live-updated). No console errors.
