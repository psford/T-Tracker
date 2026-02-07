# MBTA Real-Time Transit Tracker Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 8 phases from original design (phases 1-8)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements:

### mbta-tracker.AC4: Configurable route highlighting (not hardcoded)
- **mbta-tracker.AC4.1 Success:** E-line is highlighted by default on first load
- **mbta-tracker.AC4.2 Success:** User can select any Green Line branch (B, C, D, E) to highlight
- **mbta-tracker.AC4.3 Success:** User can select any active bus route to highlight
- **mbta-tracker.AC4.4 Success:** Multiple routes can be highlighted simultaneously
- **mbta-tracker.AC4.5 Success:** Highlighted routes show brighter color, thicker lines (weight 5 vs 3)
- **mbta-tracker.AC4.6 Success:** Highlighted route vehicles show larger markers (28px vs 24px)
- **mbta-tracker.AC4.7 Success:** Highlighted route vehicles have pulsing glow effect
- **mbta-tracker.AC4.8 Success:** Route list populated dynamically from MBTA `/routes` API
- **mbta-tracker.AC4.9 Success:** New routes added by MBTA appear in dropdown automatically
- **mbta-tracker.AC4.10 Success:** Route selections persist to localStorage
- **mbta-tracker.AC4.11 Success:** Selections restore from localStorage on next visit
- **mbta-tracker.AC4.12 Edge:** Highlighting config stored in config.js, not hardcoded in source

---

<!-- START_TASK_1 -->
### Task 1: Create src/ui.js — Route selection UI

**Files:**
- Create: `src/ui.js`
- Modify: `styles.css` — add control panel styling
- Modify: `index.html` — add `<div id="controls"></div>` container element

**Implementation:**

Create `src/ui.js` with responsibilities:
1. Build a control panel with a multi-select checkbox list for route selection
2. Populate route list dynamically from `getRouteMetadata()` (from Phase 5's map.js)
3. Group routes: Green Line branches first (sorted B, C, D, E), then bus routes sorted numerically
4. Apply default highlighting from `config.routes.defaultHighlighted` on first load (if no localStorage)
5. Read/write selections to `localStorage` key `'ttracker-highlighted-routes'` (JSON array of route IDs)
6. On any checkbox change: call the provided `onHighlightChange` callback with a `Set<routeId>` of currently checked routes

**Module exports:**
- `initUI(routeMetadata, onHighlightChange)` — builds the UI into `#controls` div, restores saved selections (or applies config defaults if no saved state), calls `onHighlightChange` with initial highlighted set

**UI structure:**
```html
<div class="control-panel">
    <h3 class="control-panel__title">Routes</h3>
    <div class="route-list">
        <label class="route-item">
            <input type="checkbox" value="Green-E" checked>
            <span class="route-swatch" style="background: #00843D"></span>
            <span class="route-name">Green-E</span>
        </label>
        <!-- ... more routes ... -->
    </div>
</div>
```

The panel is positioned top-right corner, collapsible. Dark background matching the app theme. Scrollable if many routes. Mobile responsive behavior deferred to Phase 7.

**localStorage persistence:**
- On first visit (no localStorage key): use `config.routes.defaultHighlighted` as initial selection
- On subsequent visits: restore from localStorage, ignoring any route IDs that no longer exist in API data
- On any change: immediately write current selection to localStorage

Add to `styles.css`:
```css
.control-panel {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1000;
    background: rgba(22, 33, 62, 0.95);
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 12px;
    max-height: 60vh;
    overflow-y: auto;
    min-width: 180px;
}

.control-panel__title {
    font-size: 14px;
    color: #e0e0e0;
    margin-bottom: 8px;
    font-weight: 600;
}

.route-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.route-item {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 13px;
}

.route-item:hover {
    background: rgba(15, 52, 96, 0.5);
}

.route-swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
}

.route-name {
    color: #c0c0d0;
}
```

Add to `index.html` body (before the map div or after — CSS position:absolute handles placement):
```html
<div id="controls"></div>
```

**Commit:** `feat: add route highlighting UI with localStorage persistence`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add highlighting functions to src/map.js

**Files:**
- Modify: `src/map.js` — add functions to update route polyline and marker styling based on highlighted state
- Modify: `styles.css` — add highlighted marker styles with pulsing glow animation

**Implementation:**

Add to `src/map.js`:

1. Module-level `let highlightedRoutes = new Set()` to track currently highlighted route IDs.

2. `setHighlightedRoutes(routeIds)` — takes a `Set<routeId>`:
   - Store as module-level `highlightedRoutes`
   - For each route in the stored polylines `Map<routeId, L.Polyline[]>`:
     - If `routeIds.has(routeId)`: set `weight: config.routeStyles.highlighted.weight` (5), `opacity: config.routeStyles.highlighted.opacity` (0.9)
     - If not highlighted: set `weight: config.routeStyles.normal.weight` (3), `opacity: config.routeStyles.normal.opacity` (0.5)
     - Use `polyline.setStyle({ weight, opacity })` on each L.Polyline

3. Update `getVehicleIconHtml(vehicle)` — check if `vehicle.routeId` is in `highlightedRoutes`. If highlighted: add CSS class `vehicle-marker--highlighted` to the marker container. If not: omit the class.

4. Update `syncVehicleMarkers(vehiclesMap)` — when creating or updating markers, re-create the divIcon with current highlighted state so marker size and glow reflect current selection. Use `marker.setIcon(newIcon)` when highlight state changes.

Add to `styles.css`:
```css
.vehicle-marker--highlighted {
    width: 28px !important;
    height: 28px !important;
}

.vehicle-marker--highlighted .vehicle-icon {
    filter: drop-shadow(0 0 6px currentColor);
    animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
    0%, 100% { filter: drop-shadow(0 0 4px currentColor); }
    50% { filter: drop-shadow(0 0 10px currentColor); }
}
```

**Commit:** `feat: add route highlighting with marker glow effect`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Wire UI to map highlighting

**Files:**
- Modify: `index.html` — wire `initUI` to `setHighlightedRoutes`

**Implementation:**

Update `index.html` `<script type="module">` to initialize the UI after routes finish loading:

```javascript
import { initMap, loadRoutes, syncVehicleMarkers, getRouteMetadata, setHighlightedRoutes } from './src/map.js';
import { connect, apiEvents } from './src/api.js';
import { initVehicles, onVehicleUpdate } from './src/vehicles.js';
import { initUI } from './src/ui.js';

const map = initMap('map');
initVehicles(apiEvents);
onVehicleUpdate(syncVehicleMarkers);

// Load routes, then initialize UI with route data
loadRoutes().then(() => {
    const metadata = getRouteMetadata();
    initUI(metadata, setHighlightedRoutes);
});

connect();
```

The flow:
1. `loadRoutes()` fetches route data and renders polylines
2. `.then()` gets route metadata and passes it to `initUI()`
3. `initUI()` builds the checkbox list, restores saved selections (or defaults), and calls `setHighlightedRoutes()` with initial highlighted set
4. Any checkbox change calls `setHighlightedRoutes()` again with updated set

**Verification:**

Open in browser. Verify:
1. Control panel appears in top-right with route checkboxes
2. Green Line branches listed first (B, C, D, E), then bus routes sorted numerically
3. E-line is checked by default on first visit (or saved selection restores)
4. Checking a route: polyline becomes thicker/brighter, vehicle markers grow to 28px with glow
5. Unchecking a route: polyline returns to thin/dimmer, markers return to 24px
6. Multiple routes can be highlighted simultaneously
7. Close browser, reopen — same routes still highlighted (localStorage)
8. No console errors

**Commit:** `feat: wire route selection UI to map highlighting`

<!-- END_TASK_3 -->

---

**Verifies:** None (infrastructure phase — verified operationally by visual inspection and localStorage check)

**Phase done when:** UI displays dynamic checkbox list populated from MBTA API. Selecting routes updates polyline styling (brighter, thicker). Highlighted route vehicles show larger markers (28px) with pulsing glow. Selections persist to localStorage and restore on reload. E-line highlighted by default on first visit.
