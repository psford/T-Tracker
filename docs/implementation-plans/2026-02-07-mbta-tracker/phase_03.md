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
- **mbta-tracker.AC2.4 Success:** Vehicle position smoothly interpolates between SSE updates over 800ms
- **mbta-tracker.AC2.7 Edge:** Large position jumps (>100m) snap instantly instead of animating
- **mbta-tracker.AC2.8 Edge:** Bearing changes wrap correctly (359° to 1° rotates 2°, not 358°)

---

<!-- START_TASK_1 -->
### Task 1: Create src/vehicles.js — Vehicle state management and animation loop

**Files:**
- Create: `src/vehicles.js`
- Modify: `index.html` (update module import to wire up vehicles.js for verification)

**Implementation:**

Create the vehicle state management module. Responsibilities:
1. Maintain a `Map<vehicleId, VehicleState>` tracking current and target positions for all active vehicles
2. Listen to `apiEvents` for `vehicles:reset`, `vehicles:add`, `vehicles:update`, `vehicles:remove`
3. Run `requestAnimationFrame` loop that interpolates positions between SSE updates
4. Export vehicle state for map rendering (Phase 4 will consume this)

**VehicleState shape:**
```javascript
{
    id: 'G-10300',
    // Current interpolated position (what renderers read)
    latitude: 42.3628,
    longitude: -71.0581,
    bearing: 160,
    // Target position (from latest SSE update)
    targetLatitude: 42.3635,
    targetLongitude: -71.0575,
    targetBearing: 165,
    // Previous position (interpolation start)
    prevLatitude: 42.3628,
    prevLongitude: -71.0581,
    prevBearing: 160,
    // Animation timing
    animationStart: 0,         // performance.now() timestamp
    animationDuration: 800,    // from config
    // Metadata (passed through from API)
    routeId: 'Green-E',
    currentStatus: 'IN_TRANSIT_TO',
    directionId: 0,
    label: '3633-3868',
    // Lifecycle
    state: 'active',           // 'entering' | 'active' | 'exiting'
    opacity: 1.0,
}
```

**Key functions to implement:**

1. `lerp(a, b, t)` — linear interpolation: `a + (b - a) * t`
2. `easeOutCubic(t)` — easing function: `1 - Math.pow(1 - t, 3)`
3. `lerpAngle(a, b, t)` — angle interpolation that wraps correctly around 360°. Calculate shortest rotation direction (359° to 1° should go +2°, not -358°). Use modular arithmetic to find the shortest arc, then lerp along that arc.
4. `haversineDistance(lat1, lon1, lat2, lon2)` — great-circle distance in meters between two geographic coordinates. Used to compare against `config.animation.snapThreshold` (100m). Standard haversine formula with Earth radius 6371000m.
5. `onReset(vehicles)` — clear state map, add all vehicles from array, set each to state `'entering'` with opacity 0, begin fade-in
6. `onAdd(vehicle)` — add single new vehicle with state `'entering'`, opacity 0, fade in over `config.animation.fadeInDuration` (200ms)
7. `onUpdate(vehicle)` — for existing vehicle: snapshot current interpolated lat/lng/bearing as `prev*`, set `target*` to new values from SSE, reset `animationStart` to `performance.now()`. If `haversineDistance(current, target) > config.animation.snapThreshold`, snap instantly (set current = target, skip interpolation).
8. `onRemove({ id })` — set state to `'exiting'`, begin fade out over `config.animation.fadeOutDuration` (200ms), remove from map after fade completes
9. `animate(timestamp)` — the requestAnimationFrame callback. For each vehicle in state map:
   - Calculate `elapsed = timestamp - animationStart`
   - Calculate `t = Math.min(elapsed / animationDuration, 1.0)`
   - Apply `easeOutCubic(t)` for eased progress
   - Lerp latitude, longitude using `lerp()` with eased t
   - Lerp bearing using `lerpAngle()` with eased t
   - Handle entering/exiting opacity transitions
   - Call registered update callbacks with changed vehicles
   - Request next frame: `requestAnimationFrame(animate)`

**Module exports:**
- `initVehicles(apiEventsTarget)` — subscribes to API events and starts animation loop
- `getVehicles()` — returns the current `Map` of vehicle states (for renderers to read)
- `onVehicleUpdate(callback)` — registers a callback invoked each animation frame with the vehicles Map

**Verification:**

Update `index.html` `<script type="module">` block to:
```javascript
import { initMap } from './src/map.js';
import { connect, apiEvents } from './src/api.js';
import { initVehicles, getVehicles } from './src/vehicles.js';

initMap('map');
initVehicles(apiEvents);
connect();

// Debug: log vehicle count every 2 seconds
setInterval(() => {
    const vehicles = getVehicles();
    console.log(`Tracking ${vehicles.size} vehicles`);
    const first = vehicles.values().next().value;
    if (first) {
        console.log(`  ${first.id}: ${first.latitude.toFixed(5)}, ${first.longitude.toFixed(5)} bearing=${first.bearing.toFixed(0)}`);
    }
}, 2000);
```

Open in browser. Verify:
1. Console shows vehicle count updating every 2 seconds
2. Position values change smoothly between SSE updates (not jumping)
3. Bearing values wrap correctly (no 358° jumps)
4. No uncaught exceptions or performance issues

**Commit:** `feat: add vehicle state management with position interpolation`

<!-- END_TASK_1 -->

---

**Verifies:** None (infrastructure phase — verified operationally via console output)

**Phase done when:** Console logs show interpolated vehicle positions updating smoothly between SSE updates. Large position jumps (>100m) snap instead of animating. Bearing wraps correctly (359° to 1° = 2° rotation). Animation loop runs via requestAnimationFrame.
