# Stop Marker Merging by Parent Station Design

## Summary

Many transit stations have multiple stop records in the MBTA API — one per platform, per direction, or per route branch — each with its own latitude and longitude. On the map, these appear as a cluster of overlapping markers at what users perceive as a single location. This design merges those co-located stops into one marker by grouping them using the `parentStopId` field already provided by the API, then placing a single marker at the averaged position of all the children. A 200-metre safety valve prevents stops that share a parent ID but are genuinely far apart from being incorrectly collapsed.

The merge is confined entirely to `stop-markers.js` and is implemented as a pre-processing step before any marker is placed on the map. Downstream logic — notification alerts, popup formatting, route filtering — is unchanged and continues to operate on individual child stop IDs. The result is a cleaner map with fewer overlapping pins, while preserving the ability to configure precise, per-direction arrival alerts from within the merged marker's popup.

## Definition of Done
1. Stops sharing a parent station render as a single merged marker at the averaged position of all children
2. Merged marker popup shows all child stops' routes and directions for alert configuration
3. Notification alerts created from merged markers use the correct child stop ID (not the parent)
4. Stops without a parent station render unchanged
5. Safety valve prevents merging children that are geographically distant (>200m)
6. All existing stop marker behaviors (highlighting, notification config, hover/click) work on merged markers
7. Applies to all route types (subway, bus, commuter rail, ferry)

## Acceptance Criteria

### stop-marker-merging.AC1: Stops sharing parent merge into single marker
- **stop-marker-merging.AC1.1 Success:** Two child stops with same `parentStopId` within 200m render as one marker at their averaged lat/lng
- **stop-marker-merging.AC1.2 Success:** Three+ children in a group produce one marker at the centroid
- **stop-marker-merging.AC1.3 Edge:** Single child in a parent group renders as a normal (unmerged) stop

### stop-marker-merging.AC2: Merged popup shows all children's routes/directions
- **stop-marker-merging.AC2.1 Success:** Merged marker popup lists routes from all child stops
- **stop-marker-merging.AC2.2 Success:** Each direction button in the popup carries the correct child stop ID in its `data-stop-id` attribute

### stop-marker-merging.AC3: Notifications use correct child stop ID
- **stop-marker-merging.AC3.1 Success:** Creating an alert from a merged marker popup calls `addNotificationPair()` with the child stop ID, not the parent ID
- **stop-marker-merging.AC3.2 Success:** Existing alerts for child stops show as "already configured" in merged marker popups

### stop-marker-merging.AC4: Unmerged stops unchanged
- **stop-marker-merging.AC4.1 Success:** Stops without `parentStopId` render at their original (snapped) position
- **stop-marker-merging.AC4.2 Success:** Stops whose parent group has only one visible child render as normal

### stop-marker-merging.AC5: Safety valve prevents bad merges
- **stop-marker-merging.AC5.1 Success:** Children >200m apart in the same parent group render as separate markers (not merged)

### stop-marker-merging.AC6: Existing behaviors preserved on merged markers
- **stop-marker-merging.AC6.1 Success:** Notification highlight (enlarged red ring) applies to merged marker when any child stop has a configured alert
- **stop-marker-merging.AC6.2 Success:** Highlight removal (`refreshAllHighlights`) correctly resets merged markers
- **stop-marker-merging.AC6.3 Success:** Hover/click popup behavior works identically on merged markers

## Glossary
- **Parent station**: A logical grouping in the MBTA data model representing a physical transit facility. Child stops belong to it via the `parentStopId` field.
- **Child stop**: An individual platform or direction-specific stop record that belongs to a parent station. Each has its own stop ID used by the notification engine.
- **Merged marker**: A single Leaflet map marker representing 2+ child stops sharing a parent station, positioned at the centroid of its children.
- **Safety valve**: The 200-metre distance threshold that prevents merging child stops whose parent grouping does not reflect geographic proximity.
- **Endpoint snapping**: An existing pattern in `map.js` that averages nearby polyline endpoints within 50m. The parent-station merging follows the same averaging principle applied to stop markers.
- **Notification highlight**: The visual treatment (enlarged red ring) applied to a stop marker when it has a configured arrival alert.

## Architecture

Parent station grouping in `stop-markers.js`. After collecting visible stops, a new grouping step clusters child stops by their `parentStopId` (already stored in `stopsData` from the MBTA API). Groups with 2+ children within 200m produce a single marker at the averaged lat/lng. The popup aggregates route/direction data from all children. Notification creation passes the correct child stop ID for the selected route+direction.

No changes to the notification engine, popup formatting, or map rendering. The merge is purely a stop-markers concern — downstream modules continue to receive child stop IDs.

**Data flow change:**

```
stopsData (with parentStopId)
  → computeVisibleStops() — NEW: groups by parentStopId, averages positions
  → updateVisibleStops() — creates merged markers keyed by parentId
  → popup function — aggregates children's routes/directions
  → addNotificationPair() — receives child stop ID (unchanged)
```

## Existing Patterns

The codebase already has endpoint snapping in `map.js:417-468` which averages nearby polyline endpoints within 50m. The stop merging follows the same principle — average nearby positions to reduce visual noise — applied to stop markers instead of polyline endpoints.

`computeVisibleStops()` is already a pure function extracted for testability. The grouping logic extends this function's return value with a new `mergedStops` field, following the same pure-function pattern.

`haversineDistance()` in `vehicle-math.js` is already used for distance calculations (polyline snapping, notification proximity). Reused here for the 200m safety check.

`parentStopId` is already parsed and stored by `loadStops()` in `map.js:639` and `fetchRouteStops()` in `map.js:719`. No new API calls needed.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Parent Station Grouping in computeVisibleStops

**Goal:** Extend the pure `computeVisibleStops()` function to group child stops by parent station and return merged stop data.

**Components:**
- `computeVisibleStops()` in `src/stop-markers.js` — add grouping logic after collecting visible stops. New return field `mergedStops: Map<parentId, {lat, lng, childStopIds[]}>`. Import `haversineDistance` from `vehicle-math.js` for 200m safety check.
- `stopsData` parameter — function needs access to stop data (including `parentStopId`) to build groups. Pass as new parameter or access via `getStopData()`.

**Dependencies:** None (first phase)

**Done when:** Unit tests verify: two stops sharing parent → merged with averaged position; three stops → averaged; no parent → unchanged; children >200m apart → not merged; single child in group → not merged.
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Merged Marker Rendering in updateVisibleStops

**Goal:** Render one marker per merged group instead of one per child stop.

**Components:**
- `updateVisibleStops()` in `src/stop-markers.js` — consume `mergedStops` from `computeVisibleStops()`. For merged groups: create marker at averaged position keyed by parent ID, store `childStopIds` on marker. For unmerged stops: render as today.
- Marker metadata — store `marker._childStopIds` array for popup and highlight lookup.
- `highlightConfiguredStop()` and `refreshAllHighlights()` in `src/stop-markers.js` — check both parent-keyed markers and child stop IDs when applying/removing highlights.

**Dependencies:** Phase 1 (grouping data available)

**Done when:** Divided highway stops (like bus route 66) show one marker instead of two. Unmerged stops render unchanged. Highlights apply correctly to merged markers when a child stop has a configured notification.
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Popup Aggregation for Merged Markers

**Goal:** Merged marker popups show routes/directions from all child stops.

**Components:**
- Popup function in `updateVisibleStops()` in `src/stop-markers.js` — for merged markers, build `routeInfos` and `configState` by aggregating across all `childStopIds`.
- `getStopConfigState()` in `src/stop-markers.js` — accept optional `childStopIds[]` parameter. When present, aggregate `routeDirections` and `existingAlerts` from all children.
- Direction button `data-stop-id` attributes — each button uses the correct child stop ID for its route+direction pair, so `addNotificationPair()` receives the right child ID.

**Dependencies:** Phase 2 (merged markers exist with `_childStopIds`)

**Done when:** Tapping a merged marker shows all routes serving that station with both directions. Creating an alert from a merged marker popup passes the correct child stop ID. Existing alert indicators show correctly in the popup for merged stops.
<!-- END_PHASE_3 -->

## Additional Considerations

**Threshold tuning:** The 200m safety valve is generous to accommodate wide highway medians and transit stations with platforms far apart. Users are commuters who know their stations — precise marker placement matters less than having a single tappable point. The threshold can be increased if real-world data shows legitimate parent groups exceeding it.

**Bus stop parent coverage:** If MBTA bus stops widely lack `parentStopId`, this feature won't merge many bus stops. It will still help commuter rail and subway. A proximity-based fallback could be added later if needed, but is not in scope for this design.
