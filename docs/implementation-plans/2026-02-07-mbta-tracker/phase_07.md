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
- **mbta-tracker.AC2.9 Edge:** Animation pauses when browser tab is hidden (no wasted CPU)
- **mbta-tracker.AC2.10 Edge:** Only vehicles within viewport bounds animate (performance optimization)

### mbta-tracker.AC5: Cross-platform support (desktop, mobile, Stream Deck-ready)
- **mbta-tracker.AC5.1 Success:** Application works in Chrome, Firefox, Safari, Edge (latest versions)
- **mbta-tracker.AC5.2 Success:** Application works on mobile browsers (iOS Safari, Chrome Android)
- **mbta-tracker.AC5.3 Success:** Mobile displays touch-optimized controls (drawer instead of dropdown)
- **mbta-tracker.AC5.7 Edge:** Responsive layout adapts correctly at mobile (390px), tablet (768px), desktop (1400px)

### mbta-tracker.AC1: Display transit map with Leaflet
- **mbta-tracker.AC1.6 Edge:** Map renders correctly at viewport sizes from 320px to 2560px wide

---

<!-- START_TASK_1 -->
### Task 1: Add viewport culling and tab backgrounding to vehicles.js

**Files:**
- Modify: `src/vehicles.js` — add visibility detection and viewport-based culling

**Implementation:**

1. **Tab backgrounding** — use Page Visibility API:
   - Listen to `document.addEventListener('visibilitychange', handler)`
   - When `document.hidden === true`: stop requesting animation frames (don't call `requestAnimationFrame` in the animate loop). SSE events still arrive and update target positions, but no interpolation runs.
   - When `document.hidden === false`: resume the animation loop by calling `requestAnimationFrame(animate)`. Reset animation start times for all vehicles to `performance.now()` so they don't try to "catch up" the elapsed time while hidden.

2. **Viewport culling** — in the `animate()` function, for each vehicle:
   - Before running interpolation math and calling marker update callbacks, check if the vehicle's current position is within the visible map bounds
   - Accept a `getViewportBounds()` callback parameter in `initVehicles()`. This callback returns an object with `{ north, south, east, west }` or a Leaflet `LatLngBounds` object
   - If vehicle position is outside bounds: still update internal state (target positions from SSE), but skip the marker update callback for that vehicle
   - When the map pans/zooms, newly visible vehicles will be picked up on the next animation frame

   The `getViewportBounds` callback approach keeps vehicles.js renderer-agnostic — it doesn't import map.js directly.

**Wiring in index.html:**
```javascript
import { initMap, loadRoutes, syncVehicleMarkers, getRouteMetadata, setHighlightedRoutes } from './src/map.js';
import { connect, apiEvents } from './src/api.js';
import { initVehicles, onVehicleUpdate } from './src/vehicles.js';
import { initUI } from './src/ui.js';

const map = initMap('map');
initVehicles(apiEvents, () => map.getBounds());
onVehicleUpdate(syncVehicleMarkers);

loadRoutes().then(() => {
    const metadata = getRouteMetadata();
    initUI(metadata, setHighlightedRoutes);
});

connect();
```

**Verification:**

1. Open in browser, open DevTools Performance tab
2. Switch to another tab → animation frame calls should stop (CPU usage drops)
3. Switch back → animation resumes smoothly (no "catch up" jump)
4. Zoom in to show only a few vehicles → only those vehicles' markers should update
5. Pan to empty area → minimal marker updates in the animation loop

**Commit:** `perf: add viewport culling and tab backgrounding for animation`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add mobile responsive styles and touch drawer

**Files:**
- Modify: `styles.css` — add media queries for mobile (<768px) and tablet
- Modify: `src/ui.js` — add drawer behavior for mobile (slide-in panel with toggle button)
- Modify: `index.html` — add drawer toggle button element

**Implementation:**

**Mobile drawer behavior in `src/ui.js`:**
- In `initUI()`, create a floating toggle button (`<button class="drawer-toggle">`) with a filter/menu icon
- On mobile (<768px as detected by CSS or `matchMedia`): clicking toggle adds/removes `.control-panel--open` class
- Create a backdrop `<div class="drawer-backdrop">` that appears when drawer is open
- Close drawer when: backdrop is tapped, or a route checkbox is toggled (immediate feedback)
- On desktop (>=768px): toggle button hidden via CSS, control panel always visible in static position

**CSS media queries in `styles.css`:**

```css
/* Mobile: drawer behavior */
@media (max-width: 767px) {
    .control-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 280px;
        max-height: 100vh;
        height: 100%;
        border-radius: 0;
        border-left: 1px solid #0f3460;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        overflow-y: auto;
    }

    .control-panel--open {
        transform: translateX(0);
    }

    .drawer-backdrop {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
    }

    .drawer-backdrop--visible {
        display: block;
    }

    .route-item {
        padding: 10px 12px;
        min-height: 44px; /* Touch-friendly minimum */
    }

    .drawer-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 998;
        width: 44px;
        height: 44px;
        background: rgba(22, 33, 62, 0.95);
        border: 1px solid #0f3460;
        border-radius: 8px;
        color: #e0e0e0;
        font-size: 20px;
        cursor: pointer;
    }
}

/* Desktop: static panel, no toggle */
@media (min-width: 768px) {
    .drawer-toggle {
        display: none;
    }

    .drawer-backdrop {
        display: none !important;
    }
}
```

**Verification:**

1. Desktop (1400px wide): control panel visible in top-right, no toggle button
2. Resize to mobile (390px): control panel hidden, toggle button appears
3. Tap toggle: drawer slides in from right with backdrop
4. Tap backdrop: drawer closes
5. Check a route in drawer: highlighting updates, drawer closes
6. Touch targets are at least 44px tall
7. Test at 768px (tablet breakpoint): panel visible, no drawer

**Commit:** `feat: add mobile responsive drawer and touch-optimized controls`

<!-- END_TASK_2 -->

---

**Verifies:** None (infrastructure phase — verified operationally by visual and responsive testing)

**Phase done when:** App works smoothly at 390x844 mobile viewport with touch-friendly drawer controls. Animation pauses when tab is backgrounded. Only vehicles within the visible viewport animate (viewport culling). Responsive layout works at 320px, 390px, 768px, 1400px, 2560px.
