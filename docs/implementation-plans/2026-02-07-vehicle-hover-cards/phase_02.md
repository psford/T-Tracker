# Vehicle Hover Cards Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 2 phases from design (phases 1-2)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements:

### vehicle-hover-cards.AC1: Hovering shows popup (desktop)
- **vehicle-hover-cards.AC1.1 Success:** Mouseover on a vehicle marker opens a Leaflet popup anchored to the marker
- **vehicle-hover-cards.AC1.2 Success:** Mouseout from a vehicle marker closes the popup
- **vehicle-hover-cards.AC1.3 Edge:** Rapid hover across multiple markers opens/closes cleanly

### vehicle-hover-cards.AC2: Tapping shows popup (mobile)
- **vehicle-hover-cards.AC2.1 Success:** Tapping a vehicle marker on a touch device opens the popup
- **vehicle-hover-cards.AC2.2 Success:** Tapping elsewhere on the map dismisses the popup
- **vehicle-hover-cards.AC2.3 Edge:** Popup does not interfere with map pan/zoom gestures

### vehicle-hover-cards.AC4: Popup content refreshes live
- **vehicle-hover-cards.AC4.1 Success:** While popup is open, content updates when the vehicle's SSE data changes
- **vehicle-hover-cards.AC4.2 Success:** Relative time updates reflect the latest updatedAt timestamp
- **vehicle-hover-cards.AC4.3 Edge:** Content only regenerates when updatedAt changes, not every animation frame

### vehicle-hover-cards.AC5: Dark theme styling
- **vehicle-hover-cards.AC5.1 Success:** Popup background is dark
- **vehicle-hover-cards.AC5.2 Success:** Popup text is light-colored and readable
- **vehicle-hover-cards.AC5.3 Success:** Popup tip/arrow matches the dark background
- **vehicle-hover-cards.AC5.4 Success:** Close button styled for dark theme

---

<!-- START_TASK_1 -->
### Task 1: Bind popups to vehicle markers in map.js

**Files:**
- Modify: `src/map.js` — Add import of vehicle-popup.js, bind L.popup in createVehicleMarker, add mouseover/mouseout handlers, add popup content refresh in syncVehicleMarkers

**Implementation:**

**Step 1: Add imports at top of `src/map.js`** (after line 2):

```javascript
import { formatVehiclePopup } from './vehicle-popup.js';
```

**Step 2: Add module-level tracking variable** (after `let stopsData = new Map();` at line 26):

```javascript
// Track last updatedAt per vehicle to avoid unnecessary popup refreshes at 60fps
const lastPopupUpdatedAt = new Map();
```

**Step 3: Add helper function to generate popup content** (before `createVehicleMarker`):

```javascript
/**
 * Generates popup HTML content for a vehicle using cached stop and route data.
 * Pure data lookup — formatting delegated to vehicle-popup.js.
 *
 * @param {object} vehicle — vehicle state object
 * @returns {string} — HTML string for popup content
 */
function getPopupContent(vehicle) {
    const stopName = vehicle.stopId ? (stopsData.get(vehicle.stopId)?.name || null) : null;
    const routeMeta = routeMetadata.find(r => r.id === vehicle.routeId) || null;
    return formatVehiclePopup(vehicle, stopName, routeMeta);
}
```

**Step 4: Modify `createVehicleMarker()` function** (currently at line 119-139):

After the marker is created and added to map (line 129), before setting rotation/opacity, bind a popup and add hover handlers:

```javascript
export function createVehicleMarker(vehicle) {
    if (vehicleMarkers.has(vehicle.id)) {
        return; // Marker already exists
    }

    const marker = L.marker(
        [vehicle.latitude, vehicle.longitude],
        {
            icon: createVehicleDivIcon(vehicle),
        }
    ).addTo(map);

    // Bind popup with initial content
    marker.bindPopup(getPopupContent(vehicle), {
        className: 'vehicle-popup-container',
        closeButton: false,
        autoPan: false,
    });

    // Desktop: open on hover, close on mouseout
    marker.on('mouseover', function () {
        this.openPopup();
    });
    marker.on('mouseout', function () {
        this.closePopup();
    });

    // Apply initial rotation and opacity
    const iconElement = marker.getElement().querySelector('.vehicle-marker');
    if (iconElement) {
        iconElement.style.transform = `rotate(${vehicle.bearing}deg)`;
        iconElement.style.opacity = vehicle.opacity;
    }

    vehicleMarkers.set(vehicle.id, marker);
}
```

Key decisions:
- `closeButton: false` — hover cards don't need close buttons (mouseout closes on desktop, tap-elsewhere closes on mobile)
- `autoPan: false` — prevent map from panning to show popup (disrupts user's view)
- `className: 'vehicle-popup-container'` — for dark theme CSS targeting
- Leaflet's default click behavior handles mobile tap-to-open. The `mouseover`/`mouseout` events don't fire on touch devices, so mobile gets tap-to-open, tap-elsewhere-to-dismiss natively.

**Step 5: Add popup content refresh in `syncVehicleMarkers()`** (currently at line 187-241):

Inside the `vehiclesMap.forEach` loop, after the existing marker update logic (line 204), add popup refresh check:

```javascript
vehiclesMap.forEach((vehicle, vehicleId) => {
    if (vehicleMarkers.has(vehicleId)) {
        const marker = vehicleMarkers.get(vehicleId);

        // ... existing highlight size check code ...

        // Refresh popup content if popup is open and data changed
        if (marker.isPopupOpen()) {
            const lastUpdated = lastPopupUpdatedAt.get(vehicleId);
            if (vehicle.updatedAt !== lastUpdated) {
                marker.getPopup().setContent(getPopupContent(vehicle));
                lastPopupUpdatedAt.set(vehicleId, vehicle.updatedAt);
            }
        }
    } else {
        createVehicleMarker(vehicle);
    }
});
```

This check runs inside the existing forEach. The `isPopupOpen()` call is cheap (property check). Content regeneration only happens when `updatedAt` changes — typically every 10-30 seconds per vehicle, not every frame.

**Step 6: Clean up lastPopupUpdatedAt when markers are removed**

In `removeVehicleMarker()` (currently at line 168-176), add cleanup:

```javascript
export function removeVehicleMarker(vehicleId) {
    const marker = vehicleMarkers.get(vehicleId);
    if (!marker) {
        return;
    }

    map.removeLayer(marker);
    vehicleMarkers.delete(vehicleId);
    lastPopupUpdatedAt.delete(vehicleId);
}
```

**Verification:**
1. Open `http://localhost:8000` in browser
2. Hover over a vehicle marker — popup should appear (will look unstyled/white at this point)
3. Move mouse away — popup should close
4. On mobile (or DevTools responsive mode): tap marker to open, tap map to close
5. No console errors

**Commit:** `feat: bind vehicle popups with hover/tap interaction and live refresh`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add dark theme popup CSS to styles.css

**Files:**
- Modify: `styles.css` — Add dark-themed Leaflet popup overrides

**Implementation:**

Add the following CSS block after the `.connection-status` rules (after line 263) and before any closing content:

```css
/* Vehicle popup styles (hover cards) */
.vehicle-popup-container .leaflet-popup-content-wrapper {
    background: rgba(22, 33, 62, 0.95);
    border: 1px solid #0f3460;
    border-radius: 8px;
    color: #e0e0e0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.vehicle-popup-container .leaflet-popup-tip {
    background: rgba(22, 33, 62, 0.95);
    border: 1px solid #0f3460;
    box-shadow: none;
}

.vehicle-popup-container .leaflet-popup-content {
    margin: 8px 10px;
    font-size: 13px;
    line-height: 1.4;
}

.vehicle-popup-container .leaflet-popup-close-btn {
    color: #8888aa;
}

.vehicle-popup-container .leaflet-popup-close-btn:hover {
    color: #e0e0e0;
}

.vehicle-popup__header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
}

.vehicle-popup__swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    display: inline-block;
}

.vehicle-popup__route {
    font-weight: 600;
    color: #e0e0e0;
}

.vehicle-popup__label {
    color: #8888aa;
    font-size: 12px;
}

.vehicle-popup__status {
    color: #c0c0d0;
    margin-bottom: 4px;
}

.vehicle-popup__details {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: #8888aa;
}
```

Key CSS decisions:
- Uses the same dark background color as the control panel: `rgba(22, 33, 62, 0.95)`
- Border color matches existing UI elements: `#0f3460`
- Text colors follow existing hierarchy: `#e0e0e0` (primary), `#c0c0d0` (secondary), `#8888aa` (tertiary)
- `.vehicle-popup-container` scopes all overrides to vehicle popups only (won't affect future popups if any)
- Popup tip (arrow) styled to match container background
- Compact spacing (8px/10px margins) appropriate for hover cards

**Verification:**
1. Open `http://localhost:8000` in browser
2. Hover over a vehicle marker
3. Popup should have dark background, light text, matching tip/arrow
4. Check on mobile viewport (390px) — popup should not overflow
5. No bright/unstyled elements visible

**Commit:** `feat: add dark theme styling for vehicle hover card popups`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Update src/CLAUDE.md contracts for new module

**Files:**
- Modify: `src/CLAUDE.md` — Add vehicle-popup.js contracts, update map.js contracts

**Implementation:**

1. Update the module count from "Seven" to "Eight" (or adjust the "Purpose" section)

2. Update the data flow diagram to include vehicle-popup.js:
```
MBTA API (SSE) -> api.js (parse) -> vehicles.js (interpolate) -> map.js (render)
                                          ^                           ^
                                       ui.js (configure)      polyline.js (decode)
                                          ^                      route-sorter.js
                                          (organize routes)   vehicle-popup.js (format)
```

3. Add vehicle-popup.js contract section:

```markdown
### vehicle-popup.js -- Popup Content Formatting
- **Exposes**: `formatVehiclePopup(vehicle, stopName, routeMeta)`, `formatStatus(currentStatus, stopName)`, `formatSpeed(speedMs)`, `formatTimeAgo(updatedAt)`
- **Guarantees**: Pure functions, no side effects. Returns HTML strings. Gracefully handles null/missing data (omits sections rather than showing empty/broken content). Speed converted from m/s to mph.
- **Expects**: Vehicle object with {label, routeId, currentStatus, directionId, speed, updatedAt}. Stop name as string or null. Route metadata as {shortName, color} or null.
```

4. Update map.js contract:
- Add to **Exposes**: (no new exports)
- Add to **Guarantees**: `Vehicle popups bound to markers on creation. Desktop: hover opens, mouseout closes. Mobile: tap opens. Content refreshes when popup is open and vehicle data changes (throttled by updatedAt comparison).`

5. Update freshness date

**Commit:** `docs: update module contracts for vehicle-popup.js`

<!-- END_TASK_3 -->

---

**Verifies:** vehicle-hover-cards.AC1, vehicle-hover-cards.AC2, vehicle-hover-cards.AC4, vehicle-hover-cards.AC5

**Phase done when:** Hovering over a vehicle marker on desktop opens a dark-themed popup with vehicle label, route swatch+name, status with stop name, direction, speed, and relative time. Mouseout closes it. Mobile tap opens, tap elsewhere dismisses. Popup content refreshes live when vehicle data changes (verified by watching an open popup update). Dark theme applied consistently — no white/bright elements. No console errors.
