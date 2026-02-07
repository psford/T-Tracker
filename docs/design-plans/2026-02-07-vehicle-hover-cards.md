# Vehicle Hover Cards Design

## Summary

This design adds interactive hover cards to vehicle markers on the T-Tracker map. When users hover over a vehicle (desktop) or tap it (mobile), a popup displays real-time information including the vehicle's label, route color and name, current status (stopped/in-transit/approaching) with stop location, direction, speed if available, and how recently the data was updated. The popup content refreshes live as the vehicle's position and status update via Server-Sent Events (SSE), providing continuous feedback without requiring the user to close and reopen the popup.

The implementation follows a functional core/imperative shell architecture: pure formatting functions in `src/vehicle-popup.js` generate the HTML content from vehicle state and route metadata, while `src/map.js` handles Leaflet popup binding, mouse/touch event wiring, and content refresh logic. This separation enables comprehensive unit testing of the formatting logic in Node.js while keeping the Leaflet integration code thin and focused on interaction. The popup styling uses dark theme CSS to match T-Tracker's existing visual design.

## Definition of Done

1. Hovering over a vehicle marker (desktop) shows a popup with vehicle details
2. Tapping a vehicle marker (mobile) shows the same popup; tapping elsewhere dismisses it
3. Popup content includes: vehicle label, route name with color swatch, status with stop name, direction, speed (if available), and relative update time
4. Popup content refreshes live when the vehicle receives SSE updates while the popup is open
5. Popup styling matches the dark theme of the application
6. Pure formatting functions are unit-tested in Node.js

## Acceptance Criteria

### vehicle-hover-cards.AC1: Hovering shows popup (desktop)
- **vehicle-hover-cards.AC1.1 Success:** Mouseover on a vehicle marker opens a Leaflet popup anchored to the marker
- **vehicle-hover-cards.AC1.2 Success:** Mouseout from a vehicle marker closes the popup
- **vehicle-hover-cards.AC1.3 Edge:** Rapid hover across multiple markers opens/closes cleanly (no stale popups left open)

### vehicle-hover-cards.AC2: Tapping shows popup (mobile)
- **vehicle-hover-cards.AC2.1 Success:** Tapping a vehicle marker on a touch device opens the popup
- **vehicle-hover-cards.AC2.2 Success:** Tapping elsewhere on the map dismisses the popup
- **vehicle-hover-cards.AC2.3 Edge:** Popup does not interfere with map pan/zoom gestures

### vehicle-hover-cards.AC3: Popup content includes all required fields
- **vehicle-hover-cards.AC3.1 Success:** Popup displays vehicle label (e.g., "3821")
- **vehicle-hover-cards.AC3.2 Success:** Popup displays route name with a color swatch matching route color (e.g., green circle + "Green-E")
- **vehicle-hover-cards.AC3.3 Success:** Popup displays status with stop name (e.g., "Stopped at Park Street")
- **vehicle-hover-cards.AC3.4 Success:** Popup displays direction as "Inbound" or "Outbound"
- **vehicle-hover-cards.AC3.5 Success:** Popup displays speed in mph when speed is available and non-zero
- **vehicle-hover-cards.AC3.6 Success:** Popup displays relative update time (e.g., "15s ago")
- **vehicle-hover-cards.AC3.7 Edge:** Speed row omitted when speed is null or zero
- **vehicle-hover-cards.AC3.8 Edge:** Stop name omitted when stopsData hasn't loaded or stop ID not found (status shows without location)
- **vehicle-hover-cards.AC3.9 Edge:** All three status variants render correctly: STOPPED_AT ("Stopped at X"), IN_TRANSIT_TO ("In transit to X"), INCOMING_AT ("Approaching X")

### vehicle-hover-cards.AC4: Popup content refreshes live
- **vehicle-hover-cards.AC4.1 Success:** While popup is open, content updates when the vehicle's SSE data changes (new position, status, speed)
- **vehicle-hover-cards.AC4.2 Success:** Relative time updates reflect the latest `updatedAt` timestamp
- **vehicle-hover-cards.AC4.3 Edge:** Content only regenerates when `updatedAt` changes, not every animation frame

### vehicle-hover-cards.AC5: Dark theme styling
- **vehicle-hover-cards.AC5.1 Success:** Popup background is dark (matching app theme, not Leaflet default white)
- **vehicle-hover-cards.AC5.2 Success:** Popup text is light-colored and readable
- **vehicle-hover-cards.AC5.3 Success:** Popup tip/arrow matches the dark background
- **vehicle-hover-cards.AC5.4 Success:** Close button (if visible) styled for dark theme

### vehicle-hover-cards.AC6: Pure functions are unit-tested
- **vehicle-hover-cards.AC6.1 Success:** `formatVehiclePopup()` tested with complete vehicle data
- **vehicle-hover-cards.AC6.2 Success:** `formatStatus()` tested for all three status variants with and without stop name
- **vehicle-hover-cards.AC6.3 Success:** `formatSpeed()` tested for m/s to mph conversion and null/zero handling
- **vehicle-hover-cards.AC6.4 Success:** `formatTimeAgo()` tested for seconds, minutes, and hours ranges
- **vehicle-hover-cards.AC6.5 Success:** Tests pass via `node tests/vehicle-popup.test.js`

## Glossary

- **Leaflet**: Open-source JavaScript library for interactive maps. T-Tracker uses Leaflet to render the base map and vehicle markers.
- **L.popup**: Leaflet's API for creating popup windows that attach to map elements (markers, layers, etc.). Can be opened/closed programmatically or via user interaction.
- **SSE (Server-Sent Events)**: HTTP-based protocol for servers to push real-time updates to web clients. T-Tracker receives live vehicle position updates via SSE.
- **Functional Core / Imperative Shell**: Architectural pattern separating pure business logic (functional core) from side-effect-heavy I/O and framework code (imperative shell). Improves testability.
- **Pure function**: A function with no side effects whose output depends only on its inputs. Can be tested in isolation without mocking.
- **MBTA**: Massachusetts Bay Transportation Authority. The transit agency whose real-time vehicle data T-Tracker displays.
- **BEM (Block Element Modifier)**: CSS naming convention using dashes and underscores to indicate component structure. T-Tracker uses a simplified "BEM-lite" variant.
- **Animation frame**: Browser rendering cycle, typically ~60 fps. T-Tracker's `syncVehicleMarkers()` runs every frame to smoothly update vehicle positions.
- **Route metadata**: Information about a transit route (name, color, etc.) stored separately from individual vehicle data.
- **Stop name resolution**: Looking up the human-readable stop name (e.g., "Park Street") from a stop ID in the vehicle status data.

## Architecture

Leaflet `L.popup` bound to each vehicle marker. A new pure module `src/vehicle-popup.js` owns all content formatting. `map.js` handles binding, event wiring, and content refresh.

**Data flow:**
```
Vehicle state (vehicles.js)
    ↓
syncVehicleMarkers (map.js)  →  popup open?  →  yes → formatVehiclePopup() → setContent()
    ↓                                          no → skip
createVehicleMarker (map.js)  →  bindPopup + mouseover/mouseout handlers
    ↓
vehicle-popup.js (pure)  →  format content string from vehicle + stop + route data
```

**Module responsibilities:**
- `src/vehicle-popup.js` — Pure formatting functions. Takes vehicle data, stop name, route metadata; returns HTML string. No DOM access, no Leaflet dependency.
- `src/map.js` — Binds `L.popup` to markers on creation. Wires `mouseover`/`mouseout` for desktop. Refreshes popup content in `syncVehicleMarkers()` when popup is open and vehicle data changes.

**Key constraint:** `syncVehicleMarkers()` runs every animation frame (~60fps). Popup content must only update when the popup is open AND the underlying vehicle data has changed, not every frame.

## Existing Patterns

Investigation found the following patterns in T-Tracker:

- **Pure module extraction**: `vehicle-math.js`, `polyline.js`, and `route-sorter.js` are all pure-function modules with no side effects. `vehicle-popup.js` follows this pattern.
- **Functional Core / Imperative Shell**: Pure formatting in `vehicle-popup.js` (functional core), Leaflet binding and DOM wiring in `map.js` (imperative shell).
- **Test structure**: Existing tests in `tests/` use Node.js `assert` module with `--experimental-vm-modules`. New tests follow the same pattern.
- **CSS conventions**: Dark theme variables use `rgba()` backgrounds with existing color palette. BEM-lite naming (`block--modifier`).
- **No existing popups or tooltips**: This is the first use of Leaflet popup in T-Tracker.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Pure Formatting Module and Tests

**Goal:** Create `src/vehicle-popup.js` with all pure formatting functions and comprehensive tests.

**Components:**
- `src/vehicle-popup.js` — Pure functions: `formatVehiclePopup(vehicle, stopName, routeMeta)`, `formatStatus(currentStatus, stopName)`, `formatSpeed(speedMs)`, `formatTimeAgo(updatedAt)`
- `tests/vehicle-popup.test.js` — Unit tests for all formatting functions

**Dependencies:** None (pure functions, no integration needed)

**Done when:** All formatting functions produce correct HTML strings for all status variants (STOPPED_AT, IN_TRANSIT_TO, INCOMING_AT), null/missing data cases, speed conversion (m/s to mph), and relative time formatting. Tests pass via `node tests/vehicle-popup.test.js`.

**Verifies:** vehicle-hover-cards.AC3, vehicle-hover-cards.AC6
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Popup Binding, Interaction, and Styling

**Goal:** Wire popups to vehicle markers with desktop hover and mobile tap, add dark theme styling, and refresh content on vehicle updates.

**Components:**
- Modify `src/map.js` — In `createVehicleMarker()`: bind `L.popup` with formatted content, add `mouseover`/`mouseout` event handlers for desktop. In `syncVehicleMarkers()`: check if any marker has an open popup, refresh content if vehicle data changed.
- Modify `styles.css` — Dark-themed Leaflet popup overrides (background, text color, close button, tip arrow)

**Dependencies:** Phase 1 (vehicle-popup.js must exist)

**Done when:** Desktop hover shows popup, mouseout closes it. Mobile tap shows popup, tap elsewhere dismisses. Popup content matches design (swatch, label, status, direction, speed, time). Content refreshes live while popup is open. Dark theme applied consistently. No console errors.

**Verifies:** vehicle-hover-cards.AC1, vehicle-hover-cards.AC2, vehicle-hover-cards.AC4, vehicle-hover-cards.AC5
<!-- END_PHASE_2 -->

## Additional Considerations

**Performance:** Popup content refresh in `syncVehicleMarkers()` only runs when a popup is open (one vehicle at a time). The check is a single `marker.isPopupOpen()` call per iteration — negligible cost at 60fps. Content is only regenerated when the vehicle's `updatedAt` timestamp changes.

**Stop name resolution:** If `stopsData` hasn't loaded yet or a stop ID isn't found, the popup gracefully omits the stop name (shows status without location, e.g., "In transit" instead of "In transit to Park Street").

**Speed display:** MBTA API reports speed in meters/second. Converted to mph for display. Null/zero speed omitted from popup rather than showing "0 mph".
