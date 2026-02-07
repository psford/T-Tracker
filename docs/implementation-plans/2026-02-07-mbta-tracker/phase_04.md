# MBTA Real-Time Transit Tracker Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 8 phases from original design (phases 1-8)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements:

### mbta-tracker.AC2: Show real-time vehicle positions with smooth animation
- **mbta-tracker.AC2.1 Success:** Green Line vehicles appear as directional markers on map
- **mbta-tracker.AC2.2 Success:** Bus vehicles appear as directional markers on map
- **mbta-tracker.AC2.3 Success:** Vehicle markers rotate to match bearing/direction from API
- **mbta-tracker.AC2.5 Success:** New vehicles fade in over 200ms when they appear
- **mbta-tracker.AC2.6 Success:** Vehicles fade out over 200ms when removed from service

---

<!-- START_TASK_1 -->
### Task 1: Create vehicle SVG icon and marker styles

**Files:**
- Create: `assets/icons/` directory
- Create: `assets/icons/vehicle-arrow.svg` — simple directional arrow SVG (placeholder — designed to be swapped for bus/train icons later)
- Modify: `styles.css` — add vehicle marker CSS (rotation, sizing, colors, opacity transitions)

**Implementation:**

Create a simple arrow SVG pointing north (bearing 0°). CSS `transform: rotate(Ndeg)` will rotate it to match vehicle bearing. Keep the SVG minimal — a filled triangle/chevron shape. This is a placeholder icon; the architecture should make it trivial to swap for proper bus/train icons later (see Task 2's `getVehicleIconHtml()` function).

SVG should be ~24x24px viewBox, filled with white (CSS will colorize via `filter` or the icon can be inline SVG colored via `fill`).

For styles, add CSS classes to `styles.css`:
- `.vehicle-marker` — base marker styling (width/height 24px, pointer-events, transition for opacity)
- `.vehicle-marker--green-line` — Green Line tint (green)
- `.vehicle-marker--bus` — Bus tint (amber/yellow)
- Opacity transitions: use CSS `transition: opacity 200ms ease` so entering/exiting states animate automatically when opacity is changed via JavaScript

Marker size: 24px default (design spec). Phase 6 will add 28px for highlighted routes.

**Commit:** `feat: add vehicle marker SVG placeholder and CSS styles`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add marker management functions to src/map.js

**Files:**
- Modify: `src/map.js` — add functions to create, update, and remove Leaflet markers

**Implementation:**

Add to `src/map.js`:

1. A `Map<vehicleId, L.Marker>` (module-level) to track active markers on the map.

2. `getVehicleIconHtml(vehicle)` — **single function that determines marker HTML based on vehicle type**. Returns the HTML string for the marker icon. Currently returns the arrow SVG for all vehicles with appropriate CSS class. This is the ONE function to change when swapping to proper bus/train icons later — everything else (rotation, positioning, lifecycle) stays the same.

   Determines vehicle type from `routeId`:
   - Route starts with "Green-" → class `vehicle-marker--green-line`
   - Otherwise → class `vehicle-marker--bus`

3. `createVehicleMarker(vehicle)` — creates an `L.marker` at `[vehicle.latitude, vehicle.longitude]` with a `L.divIcon`. The divIcon uses `getVehicleIconHtml(vehicle)` for its content, with `className: ''` (to avoid Leaflet's default icon styling). Sets CSS transform rotation from `vehicle.bearing` on the container element. Adds to map and markers Map.

4. `updateVehicleMarker(vehicle)` — updates existing marker's:
   - Position via `marker.setLatLng([vehicle.latitude, vehicle.longitude])`
   - Rotation via updating CSS `transform: rotate(${vehicle.bearing}deg)` on the icon element
   - Opacity via setting `style.opacity` on the icon element (CSS transition handles animation)

5. `removeVehicleMarker(vehicleId)` — removes marker from Leaflet map and from markers Map.

6. `syncVehicleMarkers(vehiclesMap)` — reconciliation function called from animation loop:
   - For each vehicle in vehiclesMap: create if no marker exists, update if marker exists
   - For each marker not in vehiclesMap: remove
   - Handles entering/exiting opacity based on `vehicle.state` and `vehicle.opacity`

Use `L.divIcon` (not `L.icon`) because it supports custom HTML/CSS — needed for rotation via CSS transform and opacity transitions.

**Commit:** `feat: add vehicle marker management to map module`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Wire animation loop to map rendering

**Files:**
- Modify: `src/vehicles.js` — call map.js sync function from animation loop
- Modify: `index.html` — clean up debug logging, keep as app entry point

**Implementation:**

In `vehicles.js`, the `onVehicleUpdate` callback mechanism (from Phase 3) should be used to push vehicle state to the map. In the `index.html` entry point, register `syncVehicleMarkers` as the update callback:

```javascript
import { initMap, syncVehicleMarkers } from './src/map.js';
import { connect, apiEvents } from './src/api.js';
import { initVehicles, onVehicleUpdate } from './src/vehicles.js';

initMap('map');
initVehicles(apiEvents);
onVehicleUpdate(syncVehicleMarkers);
connect();
```

This keeps `vehicles.js` renderer-agnostic (it doesn't import map.js directly). The entry point wires them together. Future renderers (e.g., Stream Deck) can register their own callbacks without modifying vehicles.js.

Remove the debug `setInterval` logging from Phase 3's verification code — the map is now the visual output.

**Verification:**

Open in browser. Verify:
1. Vehicle markers appear on the map as directional arrows
2. Green Line vehicles show green tint, buses show amber/yellow tint
3. Markers rotate to match vehicle bearing/heading
4. Markers move smoothly between SSE updates (not teleporting)
5. New vehicles fade in over ~200ms
6. Vehicles leaving service fade out over ~200ms
7. No console errors, no visible performance issues with dozens of markers

**Commit:** `feat: wire vehicle animation to map markers`

<!-- END_TASK_3 -->

---

**Verifies:** None (infrastructure phase — verified operationally by visual inspection)

**Design note:** The `getVehicleIconHtml()` function in `map.js` is the single point of change for swapping placeholder arrows to proper bus/train icons. All other marker logic (positioning, rotation, lifecycle) is icon-agnostic.

**Phase done when:** Map shows animated vehicle markers for all active Green Line and bus vehicles. Markers rotate to match bearing. New markers fade in, removed markers fade out. Positions animate smoothly between SSE updates.
