# Human Test Plan: Stop Marker Merging

**Feature:** Stop Marker Merging
**Date:** 2026-03-11
**Branch:** `feature/stop-marker-merging`
**Implementation plan:** `docs/implementation-plans/2026-03-11-stop-marker-merging/`

---

## Prerequisites

- Local dev server running: `python -m http.server 8000` from project root
- `config.js` present with valid MBTA API key (copy from `config.example.js` if needed)
- All automated tests passing:
  - `node tests/stop-markers.test.js`
  - `node tests/stop-popup.test.js`
- Browser: Chrome or Firefox with DevTools available

---

## Phase 1: Merged Marker Visual Verification

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Navigate to `http://localhost:8000`. Wait for SSE connection (vehicle markers should appear). | Map loads with dark theme, vehicle markers animate on subway routes. |
| 1.2 | Ensure Subway is enabled in the route panel (left side). Zoom to downtown Boston area (Park Street / Downtown Crossing area, around zoom 15-16). | Subway stop markers visible as colored dots along routes. |
| 1.3 | Look at Park Street station. Count the stop markers at that location. | Should be ONE merged marker instead of multiple overlapping markers for the different platforms (Red Line, Green Line branches). |
| 1.4 | Look at Downtown Crossing station. Count the stop markers. | Should be ONE merged marker combining Red and Orange Line platform stops. |
| 1.5 | Zoom to a simpler station with only one line (e.g., Charles/MGH on Red Line). | Should display a single normal (unmerged) stop marker, visually identical to pre-merge behavior. |
| 1.6 | Toggle Bus routes on in the route panel. Zoom to a bus stop that has divided-highway stops (e.g., Route 66 along Harvard Ave). | Bus stops sharing a parent station should merge into single markers where applicable. |
| 1.7 | Toggle Commuter Rail on. Zoom to South Station or North Station. | Commuter rail platform stops sharing a parent should appear as a single merged marker. |

---

## Phase 2: Merged Marker Popup Interaction

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Click on the merged marker at Park Street station. | Popup opens listing routes from ALL child platforms: Red Line AND Green Line branches (Green-B, Green-C, Green-D, Green-E). |
| 2.2 | Verify each route in the popup has direction buttons (e.g., "Ashmont/Braintree" and "Alewife" for Red). | Each route shows two directional alert buttons (or "Alert me here" for terminus stops). |
| 2.3 | Close the popup by clicking the X or clicking elsewhere on the map. | Popup closes cleanly, no visual artifacts remain. |
| 2.4 | Hover over the merged marker at Park Street (desktop only). | Tooltip appears showing the station name. Tooltip disappears when mouse leaves. |
| 2.5 | Click on a non-merged stop (e.g., Charles/MGH). | Popup opens showing only routes that serve that single stop. Behavior identical to pre-merge. |
| 2.6 | Compare popup appearance between merged and non-merged markers. | Layout, styling, route swatches, and direction buttons should look consistent. Only content differs (more routes for merged). |

---

## Phase 3: Notification Alert from Merged Marker

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Click on a merged marker (e.g., Park Street). In the popup, click a direction button for the Red Line (e.g., "Ashmont/Braintree"). | Chip picker appears with count options (1, 2, 3, #, infinity). |
| 3.2 | Select chip "1" and click "Set Alert". | Alert is created. The direction button is replaced with a "configured" indicator. Counter updates (e.g., "1/5 alerts configured"). |
| 3.3 | Close and reopen the popup on the same merged marker. | The previously configured direction still shows as "configured" indicator. The alert persists. |
| 3.4 | Open browser DevTools, go to Application > Local Storage > `http://localhost:8000`. Find the `ttracker-notifications-config` key. | The stored notification pair should have `checkpointStopId` set to the CHILD stop ID (e.g., `70075`), NOT the parent station ID (e.g., `place-pktrm`). |
| 3.5 | Now click a direction button for a different route in the same merged popup (e.g., Green-B "Boston College"). Set another alert. | Second alert created. Check localStorage again: this pair should have a DIFFERENT `checkpointStopId` (the Green-B child stop), confirming each route targets the correct child. |
| 3.6 | Verify the merged marker visually shows the notification highlight (pulsing ring or color change). | Merged marker should display highlight styling indicating at least one child has a configured alert. |

---

## Phase 4: Edge Cases

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Toggle Subway OFF, then back ON in the route panel. | Merged markers reappear at the same positions. No duplicate markers, no orphaned markers. |
| 4.2 | Toggle only one subway line (e.g., turn off Green Line, keep Red on). Zoom to Park Street. | If only Red platform is visible, Park Street should show as a normal (unmerged) marker since only one child is visible. |
| 4.3 | Re-enable Green Line. | Park Street should re-merge into a single marker with both Red and Green routes in its popup. |
| 4.4 | Zoom out to a very wide view (zoom 11-12). | Stop markers should not appear (per existing zoom threshold behavior). No errors in console. |
| 4.5 | Zoom back in to zoom 15+. | Merged markers reappear correctly. |

---

## End-to-End: Full Notification Lifecycle on Merged Marker

**Purpose:** Validates that the complete flow from merged marker click through alert creation to vehicle notification delivery uses the correct child stop ID at every step.

1. Navigate to `http://localhost:8000`, ensure Subway is on, zoom to Downtown Crossing.
2. Click the merged marker for Downtown Crossing (Red + Orange lines).
3. Set an alert for Red Line direction "Ashmont/Braintree" with count 1.
4. Verify in localStorage that the pair's `checkpointStopId` is a child stop ID (not `place-dwnxg`).
5. Wait for a Red Line vehicle approaching Downtown Crossing from the Alewife direction.
6. When the vehicle crosses the checkpoint, verify a notification fires (browser notification or in-app alert).
7. Verify the notification references the correct station name and route.
8. After the notification fires, the alert count should decrement (or be removed if count was 1).
9. Reopen the merged popup — the direction should no longer show as "configured" since the alert was consumed.

---

## Acceptance Criteria Traceability

| Criterion | Automated Test | Manual Step |
|-----------|----------------|-------------|
| AC1.1: Two children merge into one marker | `testParentStationGroupingAC1_1` | Phase 1, Steps 1.3–1.4 |
| AC1.2: Three+ children produce centroid marker | `testParentStationGroupingAC1_2` | Phase 1, Step 1.7 |
| AC1.3: Single child renders unmerged | `testParentStationGroupingAC1_3` | Phase 4, Step 4.2 |
| AC2.1: Merged popup lists all children's routes | `testGetStopConfigStateMergedMarker` | Phase 2, Step 2.1 |
| AC2.2: Direction buttons carry correct child stop ID | `testPerRouteDirectionStopId` | Phase 3, Step 3.4 |
| AC3.1: Alert creation uses child stop ID | `testPerRouteDirectionStopId` | Phase 3, Steps 3.4–3.5 |
| AC3.2: Existing alerts show as configured | `testGetStopConfigStateMergedMarkerWithAlerts` | Phase 3, Step 3.3 |
| AC4.1: Stops without parent render normally | `testParentStationGroupingAC4_1` | Phase 1, Step 1.5 |
| AC4.2: Single visible child renders normally | `testParentStationGroupingAC4_2` | Phase 4, Step 4.2 |
| AC5.1: Children >200m apart don't merge | `testParentStationGroupingAC5_1` | — (data-dependent) |
| AC6.1: Highlight applies to merged marker | `testHighlightResolutionAC6_1` | Phase 3, Step 3.6 |
| AC6.2: Highlight removal resets correctly | `testHighlightRefreshAC6_2` | Phase 4, Steps 4.1–4.3 |
| AC6.3: Hover/click popup identical on merged | — (manual only) | Phase 2, Steps 2.1–2.6 |
| Visual clutter reduction | — (manual only) | Phase 1, Steps 1.2–1.7 |
