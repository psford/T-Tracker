# Touch Targets — Human Test Plan

## Prerequisites

- Local server running: `python -m http.server 8000` from project root
- `config.js` present with valid MBTA API key
- All automated tests passing: `node tests/stop-markers.test.js`
- Chrome DevTools available for mobile emulation

## Phase 1: Touch Target Expansion (AC1.1)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Chrome, navigate to `http://localhost:8000`. Open DevTools (F12), enable device toolbar, select iPhone 14 Pro (390x844). | Map loads with dark theme. |
| 2 | Wait for SSE stream to connect (subway vehicles appear as colored markers). | Vehicle markers animate on subway routes. |
| 3 | Zoom into a subway stop (e.g., Park Street on the Red Line). Tap directly on the 12px colored stop dot. | Stop popup opens showing stop name, route info, and alert configuration buttons. |
| 4 | Close the popup. Tap approximately 15px away from the stop dot center (within the 22px radius but outside the visible 6px radius). | Stop popup opens — the invisible 44x44px hit area extends beyond the visible dot. |
| 5 | Close the popup. Tap approximately 25px away from the stop dot center (outside the 22px radius). | No popup opens — tap is outside the touch target. |

## Phase 2: Visual Appearance (AC1.2)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:8000/.visual-review/mocks/stop-markers.html` in Chrome. | Mock page renders with dark background showing stop dot examples. |
| 2 | Inspect the default stop dots. | Each dot is 12px diameter, circular, colored with the appropriate MBTA route color (Red #DA291C, Blue #003DA5, Orange #ED8936, Green #00843D, Silver #7C878E), at 60% opacity. |
| 3 | Inspect the configured stop dots. | Configured dots are 20px diameter, red (#ff6b6b), full opacity, with 3px border — visually distinct from default dots. |
| 4 | Compare against current production at `https://supertra.in`. | Stop dots should look identical to production at default state. No white square backgrounds. No visible 44px container. |
| 5 | On the live app (`localhost:8000`), right-click a stop dot and "Inspect Element". | The `.stop-marker` container is 44x44px with `background: transparent; border: none`. The `.stop-dot` child is 12px, centered via `translate(-50%, -50%)`. |

## Phase 3: Stop-over-Vehicle Priority (AC2.1)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:8000` on desktop (no mobile emulation). | Map loads with vehicles and stops visible. |
| 2 | Find a location where a vehicle marker overlaps or is very close to a stop marker. Red Line downtown (Park St, Downtown Crossing) typically has frequent vehicles near stops. | Both vehicle and stop markers visible in the area. |
| 3 | Click directly on the overlap area where both markers are present. | The **stop popup** opens (showing stop name and alert config), NOT the vehicle popup (which shows vehicle ID, speed, status). |
| 4 | Right-click and inspect the stop marker element. Check its parent pane. | Stop marker is inside a pane with `z-index: 625`. Vehicle markers are in the default `markerPane` at `z-index: 600`. |

## Phase 4: Chip Overflow at Terminus Stops (AC3.1)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:8000/.visual-review/mocks/chip-overflow.html` in Chrome. | Mock page renders showing notification count chip layouts at different container widths. |
| 2 | Inspect the normal-width container (~300px). | All 5 chips (1, 2, 3, #, infinity) fit on a single row with consistent gap spacing. |
| 3 | Inspect the narrow-width container (~180px, simulating terminus popup). | Chips wrap to a second row. No chips overflow outside the container boundary. Gap spacing is consistent between rows. |
| 4 | On the live app, navigate to a terminus stop (e.g., Alewife on Red Line, or Wonderland on Blue Line). Click/tap the stop. | Stop popup opens. Chip picker displays within the popup without overflow. |
| 5 | Click a direction button to reveal the chip picker at the terminus stop popup. | Chips wrap neatly if the popup is narrow. No horizontal scrollbar. No chips clipped or hidden. |

## Phase 5: Dense Stop Tappability (AC4.1)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:8000` in Chrome mobile emulation (iPhone 14 Pro). | Map loads. |
| 2 | Navigate to downtown Boston (zoom level ~15-16) where subway stops are densely packed (Park St, Downtown Crossing, State, Government Center). | Multiple stop dots visible in close proximity. |
| 3 | Tap on one specific stop dot (e.g., Park Street). | That stop's popup opens with "Park Street" in the header. |
| 4 | Close popup. Tap on an adjacent stop dot (e.g., Downtown Crossing). | Downtown Crossing popup opens — confirming each stop is individually tappable. |
| 5 | Zoom out to level ~13 where stops begin to visually overlap. Tap on a cluster of overlapping stops. | Leaflet delivers the tap to the topmost marker. One popup opens. This is expected graceful degradation. |

## End-to-End: Alert Configuration via Touch Target

Validates the complete flow from expanded touch target tap through notification pair creation.

1. Open `http://localhost:8000` in Chrome mobile emulation (iPhone 14 Pro, 390x844).
2. Grant notification permission when prompted.
3. Zoom to a Red Line stop (e.g., Harvard).
4. Tap near (but not directly on) the stop dot — within the 22px radius.
5. Stop popup opens showing "Harvard" with route info and direction buttons.
6. Tap the "Inbound" direction button.
7. Chip picker appears with count options (1, 2, 3, #, infinity).
8. Tap the "3" chip, then tap "Set Alert".
9. Popup closes. The Harvard stop dot changes from 12px red-line-colored at 60% opacity to 20px #ff6b6b at full opacity.
10. Tap the Harvard stop dot again to confirm the popup still opens correctly after highlight state change.
11. Navigate to Alewife (terminus). Tap the stop. Open chip picker. Verify chips wrap correctly in the narrower terminus popup.

## Traceability

| Acceptance Criterion | Automated Test | Manual Step |
|----------------------|----------------|-------------|
| touch-targets.AC1.1 — 44px touch target | `testCreateStopMarkerUsesMarkerNotCircle`, `testCreateStopMarkerDivIconConfig` | Phase 1 steps 3-5, E2E steps 4-5 |
| touch-targets.AC1.2 — 12px visual dot | `testCreateStopMarkerDivIconConfig`, `testCreateStopMarkerHTMLSupportsClassModifier` | Phase 2 steps 2-5, E2E step 9 |
| touch-targets.AC2.1 — Stop over vehicle | `testCreateStopMarkerAssignsPane` | Phase 3 steps 2-4 |
| touch-targets.AC3.1 — Chip wrapping | None (CSS-only fix) | Phase 4 steps 2-5, E2E step 11 |
| touch-targets.AC4.1 — Dense stops | `testComputeVisibleStops` (deduplication) | Phase 5 steps 3-5 |
