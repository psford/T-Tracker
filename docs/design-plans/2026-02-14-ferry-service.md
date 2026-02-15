# Ferry Service Support Design

## Summary

This design adds support for MBTA ferry service (route type 4) to T-Tracker, completing the application's coverage of all five MBTA transit modes. Ferries will appear on the map alongside existing subway, bus, and commuter rail vehicles, using the boat icon that's already implemented in the vehicle icon library. The implementation follows the established pattern used for other transit types: extending API filter strings to include route type 4, adding a classification branch in the route sorter to create a "Ferry" group in the Routes selector panel, and mapping the ferry toggle to localStorage persistence.

The approach is minimalist by design. Most ferry-specific functionality already exists in the codebase — the boat icon, notification text ("Ferry approaching..."), and vehicle type labels are already implemented and require no changes. Ferries use the same GPS-based tracking and `current_status` values as other vehicle types, so no special handling is needed in the notification system or interpolation logic. The only new code is a handful of filter string additions, one classification branch, and test coverage for the new group.

## Definition of Done
T-Tracker supports MBTA ferry service (route type 4) as a first-class transit mode alongside subway, bus, and commuter rail. Ferry vehicles appear on the map with the existing boat icon in MBTA aqua #008EAA (no darkening). Ferry routes, polylines, and stops are fetched from the API and displayed. A "Ferry" group appears last in the Routes selector panel, hidden by default on first visit. The ferry icon, notification text ("Ferry approaching..."), and vehicle type label already work and require no changes. Ferries use the same GPS-based tracking and current_status values (STOPPED_AT, INCOMING_AT, IN_TRANSIT_TO) as all other vehicle types — no special ferry handling needed for notifications.

## Acceptance Criteria

### ferry-service.AC1: Ferry data flows through the application
- **ferry-service.AC1.1 Success:** SSE vehicle stream includes ferry vehicles (route type 4) alongside other transit types
- **ferry-service.AC1.2 Success:** Ferry routes fetched from MBTA API with polylines and metadata
- **ferry-service.AC1.3 Success:** Ferry stops fetched and displayed on the map
- **ferry-service.AC1.4 Success:** Ferry vehicles render with the existing boat icon in MBTA aqua #008EAA (no color darkening applied)

### ferry-service.AC2: Ferry group appears in Routes selector panel
- **ferry-service.AC2.1 Success:** Route sorter classifies type 4 routes into a "Ferry" group
- **ferry-service.AC2.2 Success:** Ferry group appears as 4th group (after Subway, Bus, Commuter Rail)
- **ferry-service.AC2.3 Success:** Ferry routes sorted alphabetically by longName within the group
- **ferry-service.AC2.4 Success:** Ferry group hidden by default on first visit (service toggle defaults to `false`)
- **ferry-service.AC2.5 Success:** Ferry toggle state persists in localStorage across page reloads
- **ferry-service.AC2.6 Edge:** When no ferry routes exist in API response, no Ferry group appears in panel (no empty group)

### ferry-service.AC3: No regression to existing transit types
- **ferry-service.AC3.1 Success:** Existing route sorter tests pass unchanged (Subway, Bus, Commuter Rail grouping and sorting unaffected)
- **ferry-service.AC3.2 Success:** Existing notification tests pass unchanged

## Glossary

- **Route type**: MBTA's numeric classification for transit modes (0=light rail, 1=subway, 2=commuter rail, 3=bus, 4=ferry). Used in API filters and route classification logic.
- **SSE (Server-Sent Events)**: One-way persistent HTTP connection where the MBTA API streams real-time vehicle position updates to the browser.
- **Route sorter**: Module (`route-sorter.js`) that groups routes by transit type (Subway, Bus, Commuter Rail, Ferry) and sorts them for display in the Routes selector panel.
- **Service toggle**: Checkbox in the Routes panel that controls visibility of an entire transit type (e.g., "Subway", "Ferry"). State persists in localStorage.
- **Polyline**: Encoded geographic path representing a route's shape on the map. Decoded and rendered by Leaflet.
- **current_status**: MBTA field indicating a vehicle's relationship to its next stop (`STOPPED_AT`, `INCOMING_AT`, `IN_TRANSIT_TO`). Used by the notification system to determine when to fire alerts.
- **Filter string**: Query parameter in MBTA API requests that restricts which data is returned (e.g., `filter[route_type]=0,1,2,3,4` requests vehicles from all five transit types).

## Architecture

Ferry support extends the existing transit type pattern. The app already handles four MBTA route types (0=light rail, 1=subway, 2=commuter rail, 3=bus). Ferry is route type 4. The architecture requires no new modules or data flows — only widening existing filters and adding a classification branch.

Data flow is unchanged:

```
MBTA API (SSE + REST) → api.js / map.js (fetch + filter) → vehicles.js / stop-markers.js (render)
                                                                    ↑
                                                              route-sorter.js (classify)
                                                                    ↑
                                                              ui.js (toggle visibility)
```

Three API filter strings gate which route types enter the app. Adding `4` to each opens the data pipeline. The route sorter classifies routes into UI groups; adding a `Ferry` branch completes the UI integration. The service toggle in `ui.js` controls visibility defaults and persistence.

Components already handling ferry with no changes needed:
- `src/vehicle-icons.js` — ferry icon (type 4) already defined
- `src/notifications.js` — "Ferry approaching..." label already implemented
- `src/stop-markers.js` — route-type agnostic, works for any type
- `src/stop-popup.js` — direction buttons work for any route type
- Color darkening in `src/map.js` — only darkens types 1 and 2; ferry (#008EAA) naturally excluded

## Existing Patterns

Ferry follows the exact same pattern used for subway, bus, and commuter rail throughout the codebase:

- **API filters**: Filter strings in `src/api.js:168`, `src/map.js:313`, and `src/map.js:620` use comma-separated route type numbers (`'0,1,2,3'`). Ferry adds `4` to each.
- **Route classification**: `src/route-sorter.js:22-36` uses a `forEach` with type-based `if` branches pushing to typed arrays. Ferry adds a `type === 4` branch.
- **Group building**: `src/route-sorter.js:82-121` conditionally pushes groups in display order. Ferry adds a 4th group after Commuter Rail.
- **Service toggles**: `src/ui.js:80-84` maps group names to toggle keys. `src/ui.js:95-98` maps route types to toggle keys. Ferry adds entries to both.
- **Default visibility**: `src/ui.js:132-133` sets first-visit defaults per service type. Ferry defaults to `false` (hidden).
- **Sorting**: Ferry routes sorted alphabetically by `longName`, same as Commuter Rail.

No divergence from existing patterns. No new patterns introduced.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Ferry Data Pipeline and UI Integration

**Goal:** Ferry vehicles, routes, polylines, and stops appear on the map. Ferry group appears in the Routes selector panel with toggle control.

**Components:**
- API SSE filter in `src/api.js` — add type 4 to `filter[route_type]` string
- Route fetch filter in `src/map.js` — add type 4 to `filter[type]` string
- Stops fetch filter in `src/map.js` — add type 4 to `filter[route_type]` string
- Route classifier in `src/route-sorter.js` — add type 4 classification, ferry array, sort logic, and group entry
- Service toggle mapping in `src/ui.js` — add `'Ferry': 'ferry'` to `groupToToggleKey`, add `ferry: false` to defaults, add `type === 4` branch to `getServiceTypeForRoute`
- Route sorter tests in `tests/ui.test.js` — add ferry routes to test data, verify 4th group appears in correct position with correct sorting
- Filter comment updates in `src/api.js`, `src/map.js`, `config.example.js` — update comments to mention ferry

**Dependencies:** None (single phase)

**Done when:** Ferry vehicles render on map with boat icon in aqua #008EAA. Ferry routes appear as 4th group in Routes panel (after Commuter Rail), hidden by default. Ferry toggle persists in localStorage. All existing tests pass. New route sorter tests verify ferry group. `ferry-service.AC1.1` through `ferry-service.AC2.4` covered by tests.
<!-- END_PHASE_1 -->

## Additional Considerations

**Ferry availability:** MBTA ferries operate seasonally and during limited hours. During off-hours, the API returns zero ferry vehicles. The app handles this gracefully — an empty Ferry group in the Routes panel is expected and mirrors how other transit types behave when no vehicles are active.

**MBTA ferry routes (6 active):** Boat-F4 (Charlestown), Boat-F1 (Hingham/Hull), Boat-EastBoston (East Boston), Boat-Lynn (Lynn), Boat-F6 (Winthrop), Boat-F7 (Quincy). All share color #008EAA.
