# Mobile Touch Target Improvements Design

## Summary
Stop markers on the T-Tracker map are currently rendered as 12px SVG circles using Leaflet's `L.circleMarker`, where the clickable area equals the visual size. On mobile, these are difficult to tap accurately. This design replaces stop markers with DOM-based `L.divIcon` elements inside a 44×44px invisible container, matching platform accessibility guidelines without changing visual appearance.

Vehicle markers currently sit above stop markers in Leaflet's layer stack, allowing vehicles near stops to intercept taps. A custom `stopPane` (z-index 650) places stops above vehicles, guaranteeing stop tap priority. A separate CSS fix addresses notification count chips overflowing their popup container at terminus stops.

## Definition of Done
1. Stop markers have mobile-friendly touch targets — invisible hit area expanded to ~44px, no visual change to the markers themselves
2. Stops are always tappable over vehicles — when a stop and vehicle overlap, tapping selects the stop
3. Chip overflow bug fixed — notification count chips (1, 2, 3, #, ∞) wrap properly within popup container at terminus stops
4. No regression at dense stop areas — expanded hit areas don't create unusable overlap at reasonable zoom levels

## Acceptance Criteria

### touch-targets.AC1: Stop markers have mobile-friendly touch targets
- **touch-targets.AC1.1 Success:** Tapping within 22px of a stop center opens the stop popup on mobile
- **touch-targets.AC1.2 Success:** Stop markers render as 12px colored dots (visually unchanged from current)

### touch-targets.AC2: Stops tappable over vehicles
- **touch-targets.AC2.1 Success:** When a stop and vehicle marker overlap, tapping the overlap area opens the stop popup (not the vehicle popup)

### touch-targets.AC3: Chip overflow fixed
- **touch-targets.AC3.1 Success:** At terminus stops, notification count chips (1, 2, 3, #, ∞) wrap to a second row instead of overflowing the popup container

### touch-targets.AC4: No regression at dense stop areas
- **touch-targets.AC4.1 Success:** At normal zoom levels, adjacent stops are individually tappable and each opens its own popup

## Glossary
- **`L.circleMarker`**: Leaflet class rendering a circle as SVG. Visual radius and clickable area are always the same size.
- **`L.divIcon`**: Leaflet icon type rendering arbitrary HTML. Decouples visual size from clickable area — a transparent 44px container can hold a 12px visible dot.
- **Leaflet pane**: Named DOM container with a z-index controlling stacking order between map layer types. Custom panes can be created above built-in ones.
- **`stopPane`**: Custom pane (z-index 650) created by this feature, above vehicle `markerPane` (600) and below `popupPane` (800).
- **Touch target**: The tappable area of an interactive element. Apple HIG and Material Design both recommend at least 44×44px.
- **Terminus stop**: First or last stop on a line. Has a single direction, making the chip overflow bug most visible here.
- **Configured stop**: A stop with active notification alerts. Visually highlighted with a larger red dot.
- **Visual review mock page**: Standalone HTML in `.visual-review/mocks/` loading production CSS with hardcoded content for screenshot-based CSS testing.

## Architecture

Stop markers switch from `L.circleMarker` (SVG, 12px visual = 12px click area) to `L.marker` with `L.divIcon` (DOM element, 44×44px invisible container with 12px visual dot centered inside). This decouples the visual size from the touch target size.

A custom Leaflet pane (`stopPane`, z-index 650) places stop markers above vehicle markers (`markerPane`, z-index 600) and below popups (`popupPane`, z-index 800). This guarantees stop taps take priority over vehicle taps at any overlap.

The chip overflow fix adds `flex-wrap: wrap` to `.chip-picker__chips`, allowing notification count chips to flow to a second row in narrow popup containers (terminus stops).

## Existing Patterns

Vehicle markers already use `L.marker` + `L.divIcon` with 48×32px icon size in `src/map.js`. Stop markers will follow this same pattern — `L.divIcon` with a custom CSS class, inline color styling, and a centered visual element.

Existing mobile detection via `window.matchMedia('(hover: hover)')` in `src/stop-markers.js` differentiates desktop hover behavior from mobile tap behavior. The touch target expansion applies universally (both desktop and mobile) since larger click areas benefit both platforms.

The configured/highlighted stop state currently uses `marker.setStyle({ radius: 10 })` on the `L.circleMarker`. With `L.divIcon`, this changes to toggling a CSS class (`.stop-dot--configured`) on the inner dot element. The highlight function `highlightConfiguredStop()` and `resetStopHighlight()` in `stop-markers.js` will need corresponding updates.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Stop Pane and Marker Rendering
**Goal:** Replace `L.circleMarker` stops with `L.divIcon` stops in a custom pane above vehicles.

**Components:**
- Custom `stopPane` creation in `src/map.js` — `map.createPane('stopPane')` with z-index 650
- `createStopMarker()` in `src/stop-markers.js` — switch from `L.circleMarker` to `L.marker` + `L.divIcon` with `iconSize: [44, 44]`, `iconAnchor: [22, 22]`, `pane: 'stopPane'`
- New CSS classes in `styles.css` — `.stop-marker` (transparent container, replaces Leaflet default icon styling), `.stop-dot` (12px centered circle with route color), `.stop-dot--configured` (20px red highlight state)
- `highlightConfiguredStop()` and `resetStopHighlight()` in `src/stop-markers.js` — update to toggle CSS class instead of `setStyle()`

**Dependencies:** None

**Covers:** `touch-targets.AC1.1`, `touch-targets.AC1.2`, `touch-targets.AC2.1`, `touch-targets.AC4.1`

**Done when:** Stop markers render visually identical to current (12px colored dots), touch target is 44×44px, stops render above vehicles, popup binding works on both desktop and mobile, configured stop highlight applies correctly
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Chip Overflow Fix
**Goal:** Fix notification count chip overflow in stop popups at terminus stops.

**Components:**
- `.chip-picker__chips` in `styles.css` — add `flex-wrap: wrap`

**Dependencies:** None (independent of Phase 1)

**Covers:** `touch-targets.AC3.1`

**Done when:** Chips wrap to second row when popup container is too narrow, verified via visual review mock page
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Tests and Visual Review
**Goal:** Verify all changes with unit tests and visual screenshots.

**Components:**
- Unit tests in `tests/stop-markers.test.js` — verify marker type, pane assignment, icon size, CSS class application, highlight toggling
- Visual review mock page in `.visual-review/mocks/` — stop markers at various states (default, configured, clustered), terminus popup with chip wrapping

**Dependencies:** Phase 1, Phase 2

**Covers:** `touch-targets.AC1.1`, `touch-targets.AC1.2`, `touch-targets.AC2.1`, `touch-targets.AC3.1`, `touch-targets.AC4.1`

**Done when:** All existing tests pass, new tests pass, visual review screenshots confirm no visual regression
<!-- END_PHASE_3 -->

## Additional Considerations

**Zoom behavior:** At extreme zoom-out levels, many stops will have overlapping 44px touch targets. This is acceptable — Leaflet's native event handling delivers the tap to the topmost marker in the pane, which is consistent behavior. Users can zoom in to disambiguate. No special handling needed.

**Performance:** Switching from `L.circleMarker` (SVG) to `L.marker` + `L.divIcon` (DOM) changes rendering from canvas/SVG to HTML elements. For the number of stops rendered at any given time (typically 20-100 visible), this is not a performance concern. Leaflet handles thousands of DOM markers without issue.
