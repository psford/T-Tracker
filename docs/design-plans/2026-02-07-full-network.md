# Full MBTA Network Expansion Design

## Summary

This design expands T-Tracker from Green Line + Bus to the full MBTA rapid transit and commuter rail network. Three hardcoded route_type filters (SSE stream, route fetch, stop fetch) are expanded from `0,3` to `0,1,2,3` to include heavy rail (Red, Orange, Blue) and commuter rail. The existing highlighting system is replaced with a simpler visibility toggle model: visible routes render at full style, hidden routes are removed entirely from the map. A new three-tier UI control replaces the flat checkbox list — service type master toggles (Subway, Bus, Commuter Rail) expand to reveal per-line checkboxes, with Green Line getting a nested sub-group for its branches. Polyline weight adapts based on visible route count to prevent visual clutter. All toggle state persists to localStorage.

## Definition of Done

The deliverable is an enhancement to T-Tracker that:

1. **Expands transit coverage** — Adds Orange, Red, and Blue subway lines (route_type=1) and all ~12 Commuter Rail lines (route_type=2) to the existing Green Line + Bus display
2. **Streams all transit types via a single SSE connection** — Expands the filter to route_type=0,1,2,3; vehicles for toggled-off services are filtered client-side
3. **Introduces a three-tier UI toggle system** — Three service type groups (Subway, Bus, Commuter Rail), each with a master toggle that expands to show per-line checkboxes. Toggling off a service hides both polylines AND vehicle markers
4. **Uses theme-adapted MBTA colors** — Official MBTA line colors (Red, Orange, Blue, Green) adjusted for brightness/saturation to fit the dark map theme
5. **Persists all toggle state** — Both service type and individual line selections saved to localStorage and restored on reload
6. **Keeps the current map view** — No auto-zoom/pan when toggling services; user controls their own view

**Out of scope:** Ferry service, Stream Deck plugin changes, predictions/arrival times, map auto-fitting behavior.

## Acceptance Criteria

### full-network.AC1: Expanded transit data streaming
- **full-network.AC1.1 Success:** SSE connection filter includes route_type=0,1,2,3 (light rail, heavy rail, commuter rail, bus)
- **full-network.AC1.2 Success:** Vehicle events for Red, Orange, Blue lines arrive and are parsed correctly
- **full-network.AC1.3 Success:** Vehicle events for commuter rail lines arrive and are parsed correctly
- **full-network.AC1.4 Success:** Route polylines load for all four transit types on startup
- **full-network.AC1.5 Success:** Stop data loads for all four transit types on startup
- **full-network.AC1.6 Edge:** Existing Green Line and Bus functionality unchanged after filter expansion
- **full-network.AC1.7 Failure:** If MBTA API returns no data for a transit type, app continues working with available types

### full-network.AC2: Three-tier toggle UI
- **full-network.AC2.1 Success:** Route panel shows three service type groups: Subway, Bus, Commuter Rail
- **full-network.AC2.2 Success:** Each group has a master toggle checkbox that shows/hides all routes in that group
- **full-network.AC2.3 Success:** Clicking a master toggle expands/collapses to reveal per-line checkboxes
- **full-network.AC2.4 Success:** Master toggle unchecked = group collapsed, all child routes hidden from map
- **full-network.AC2.5 Success:** Master toggle checked = group expanded, child routes visible per individual toggle state
- **full-network.AC2.6 Success:** Subway group contains: Green Line sub-group (B, C, D, E), Red, Orange, Blue
- **full-network.AC2.7 Success:** Green Line has a nested sub-group header within Subway, with its branches listed beneath
- **full-network.AC2.8 Success:** Bus group contains all bus routes, sorted numerically then alphanumerically
- **full-network.AC2.9 Success:** Commuter Rail group contains all CR lines, sorted alphabetically by line name
- **full-network.AC2.10 Success:** Individual line checkbox toggles that specific line's vehicles and polyline on/off
- **full-network.AC2.11 Edge:** Checking a master toggle when some children are already checked preserves those children's state
- **full-network.AC2.12 Edge:** Unchecking all children within a group does NOT auto-uncheck the master toggle
- **full-network.AC2.13 Edge:** Mobile drawer still works with expanded toggle hierarchy
- **full-network.AC2.14 Edge:** Route panel scrolls correctly when all groups are expanded simultaneously

### full-network.AC3: Visibility replaces highlighting
- **full-network.AC3.1 Success:** Visible routes render polylines at adaptive weight (thicker when fewer routes visible)
- **full-network.AC3.2 Success:** Hidden routes have NO polylines or vehicle markers on map
- **full-network.AC3.3 Success:** Toggling a route off immediately removes its polyline and all its vehicles
- **full-network.AC3.4 Success:** Toggling a route on immediately shows its polyline and any active vehicles
- **full-network.AC3.5 Success:** No dim/bright distinction between routes — all visible routes rendered equally
- **full-network.AC3.6 Success:** Pulsing glow effect removed from vehicle markers
- **full-network.AC3.7 Success:** Vehicle marker size uniform for all visible routes (no highlighted/normal distinction)
- **full-network.AC3.8 Edge:** Adaptive weight scales smoothly: ~5px for 1-4 routes, ~3px for 5-15, ~2px for 16+

### full-network.AC4: Theme-adapted MBTA colors
- **full-network.AC4.1 Success:** Red Line uses darkened MBTA red (#DA291C adjusted ~15% for dark theme)
- **full-network.AC4.2 Success:** Orange Line uses darkened MBTA orange (#ED8B00 adjusted)
- **full-network.AC4.3 Success:** Blue Line uses darkened MBTA blue (#003DA5 adjusted)
- **full-network.AC4.4 Success:** Green Line retains its existing color (already theme-adapted)
- **full-network.AC4.5 Success:** Commuter Rail lines use darkened MBTA purple (#80276C adjusted)
- **full-network.AC4.6 Success:** Bus routes retain their existing colors
- **full-network.AC4.7 Success:** Vehicle markers use route color for fill (existing pattern)
- **full-network.AC4.8 Edge:** Colors remain distinguishable on dark map background at all zoom levels

### full-network.AC5: Persistence
- **full-network.AC5.1 Success:** Service type toggle states persist to localStorage
- **full-network.AC5.2 Success:** Individual route toggle states persist to localStorage
- **full-network.AC5.3 Success:** Toggling state restores correctly on page reload
- **full-network.AC5.4 Success:** Default first-visit state: Subway on (all lines), Bus off, Commuter Rail off
- **full-network.AC5.5 Edge:** If a persisted route no longer exists in API data, it is silently ignored
- **full-network.AC5.6 Edge:** If new routes appear in API data that aren't in persisted state, they default to on if their service type is on

### full-network.AC6: Vehicle type detection and rendering
- **full-network.AC6.1 Success:** Vehicle icon distinguishes transit types visually (subway vs bus vs commuter rail)
- **full-network.AC6.2 Success:** Subway vehicles use route color (Red/Orange/Blue/Green)
- **full-network.AC6.3 Success:** Commuter rail vehicles render with commuter rail styling
- **full-network.AC6.4 Success:** Bus vehicles retain existing styling
- **full-network.AC6.5 Edge:** Vehicle type detection uses route metadata (type field) not string prefix matching
- **full-network.AC6.6 Edge:** Hover popups show correct transit type context (line name, not just route ID)

### full-network.AC7: Cross-cutting
- **full-network.AC7.1:** Application startup still completes within 3 seconds on broadband (expanded data set)
- **full-network.AC7.2:** No console errors during normal operation with all transit types active
- **full-network.AC7.3:** Mobile layout accommodates expanded route panel without usability issues
- **full-network.AC7.4:** Existing config.js structure extended (not restructured) for new defaults

## Glossary

- **route_type**: MBTA/GTFS classification for transit modes. 0 = Light Rail (Green Line), 1 = Heavy Rail (Red/Orange/Blue), 2 = Commuter Rail, 3 = Bus, 4 = Ferry.
- **Heavy Rail**: MBTA subway lines with dedicated right-of-way and high-platform stations. Red, Orange, and Blue lines. Distinct from Light Rail (Green Line) which shares street-level track in some segments.
- **Commuter Rail**: Regional rail service extending from Boston to surrounding cities (Worcester, Providence, Newburyport, etc.). Operates on ~12 lines with less frequent service than subway. Route IDs prefixed with `CR-`.
- **Master toggle**: A checkbox that controls visibility of an entire service type group. When unchecked, all routes in the group are hidden and the group collapses. When checked, the group expands and individual routes follow their own toggle state.
- **Three-tier toggle**: UI pattern with three levels: Service Type (Subway/Bus/CR) → Line Group (Green Line sub-group) → Individual Route (Green-B, Route 1, etc.).
- **Adaptive weight**: Polyline rendering technique where line thickness adjusts based on the number of visible routes, preventing visual clutter when many routes are shown simultaneously.
- **Visibility filtering**: Client-side filtering where vehicle data streams for all types but only routes toggled "on" are rendered. Replaces the previous highlight/dim model.
- **Theme-adapted colors**: MBTA's official brand colors (Red=#DA291C, Orange=#ED8B00, Blue=#003DA5, Purple=#80276C) adjusted by darkening/desaturating ~15% to maintain visual harmony on the dark CartoDB basemap.

## Architecture

The enhancement extends the existing modular architecture with minimal new abstractions. Changes touch all existing modules but don't alter the data flow pattern.

**Updated Data Flow:**
```
MBTA API (SSE, route_type=0,1,2,3) → api.js (parse) → vehicles.js (interpolate)
                                                              ↓
                                                    visibility filter
                                                              ↓
                                                        map.js (render)
                                                              ↑
                                                    ui.js (toggle controls)
```

**Key Change: Visibility Filter Layer**

Currently, all vehicles from the SSE stream are rendered. After this enhancement, `syncVehicleMarkers()` in map.js checks each vehicle's route against the `visibleRoutes` Set before creating/updating markers. Vehicles for hidden routes are skipped (not created) or removed (if previously visible).

**Module Changes:**

- **config.js** — Add `routes.defaultVisible` (subway lines) replacing `routes.defaultHighlighted`
- **api.js** — Expand SSE filter from `'0,3'` to `'0,1,2,3'`
- **map.js** — Expand route/stop fetch filters. Replace `highlightedRoutes` with `visibleRoutes`. Add `setVisibleRoutes()`. Implement adaptive polyline weight. Extend `getVehicleIconHtml()` to detect route types via metadata (not string prefix)
- **vehicles.js** — No changes (already processes all vehicles from stream; filtering happens in map.js rendering)
- **ui.js** — Replace flat checkbox list with three-tier collapsible toggle groups. Master toggle logic. New localStorage keys for visibility state
- **route-sorter.js** — Extend grouping: Subway (with Green Line sub-group), Bus, Commuter Rail. Detect via route type metadata instead of string prefix

**localStorage Schema Change:**
```
Old: ttracker-highlighted-routes → ["Green-E", "1"]
New: ttracker-visible-routes    → ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E"]
     ttracker-service-toggles   → {"subway": true, "bus": false, "commuterRail": false}
```

## Existing Patterns

The design follows patterns already established in the codebase:

1. **Route metadata from API** — `loadRoutes()` already fetches route objects with `type`, `color`, `shortName`, `longName` attributes. The `type` field (0, 1, 2, 3) is available but currently unused for grouping — route-sorter.js uses string prefix instead. This enhancement switches to using the `type` field for correct classification.

2. **Polyline rendering pipeline** — `loadRoutes()` walks the JSON:API relationship chain (route → route_patterns → representative_trip → shape → polyline). This works identically for heavy rail and commuter rail routes — no changes to the pipeline itself, just the initial filter.

3. **Vehicle marker creation** — `getVehicleIconHtml()` generates SVG arrows with route color fill. Currently branches on `startsWith('Green-')` for CSS class selection. Enhancement adds route type lookup from metadata Map for proper classification.

4. **localStorage persistence** — `readFromStorage()` / `writeToStorage()` pattern in ui.js with JSON serialization. Extended with new keys for the visibility model.

5. **DOM event communication** — api.js emits events, vehicles.js subscribes. No changes to this pattern.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Expand API Filters

**Goal:** Stream all transit types and fetch all route/stop data

**Components:**
- `src/api.js` — Change SSE filter from `'0,3'` to `'0,1,2,3'`
- `src/map.js` — Change route fetch filter from `'0,3'` to `'0,1,2,3'`
- `src/map.js` — Change stop fetch filter from `'0,3'` to `'0,1,2,3'`
- `config.example.js` — Update comments noting expanded transit types

**Dependencies:** None (first phase)

**Done when:** Opening app shows Red, Orange, Blue subway vehicles and commuter rail vehicles alongside existing Green Line and bus vehicles. Route polylines load for all types. Console shows vehicle events for route_type 1 and 2. No errors in console.
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Route Grouping by Transit Type

**Goal:** Classify routes by transit type using metadata instead of string prefix

**Components:**
- `src/route-sorter.js` — Rewrite grouping logic to use `route.type` field (0=Light Rail, 1=Heavy Rail, 2=Commuter Rail, 3=Bus). Create three top-level groups: Subway (types 0+1), Bus (type 3), Commuter Rail (type 2). Within Subway, nest Green Line branches under a sub-group header. Sort commuter rail alphabetically by long name.
- `src/map.js` — Update `getVehicleIconHtml()` to determine vehicle CSS class from route type metadata Map instead of `startsWith('Green-')`. Add type-specific CSS classes (subway, bus, commuter-rail).

**Dependencies:** Phase 1 (route metadata now includes types 1 and 2)

**Done when:** `groupAndSortRoutes()` returns three groups with correct classification. Vehicle icons use route type metadata for styling. Console logs confirm correct grouping.
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Three-Tier Toggle UI

**Goal:** Replace flat checkbox list with collapsible service type groups

**Components:**
- `src/ui.js` — Build three-tier toggle hierarchy: service type master checkboxes (Subway/Bus/CR) with collapsible children. Master toggle unchecked = group collapsed. Master toggle checked = group expanded, individual toggles visible. Wire individual toggles to emit visibility change events.
- `styles.css` — Styles for collapsible groups: indentation, collapse/expand animation, master toggle styling, sub-group headers (Green Line within Subway), smooth height transitions.

**Dependencies:** Phase 2 (route-sorter provides correct group structure)

**Done when:** Route panel shows three collapsible groups. Master toggles expand/collapse groups. Individual checkboxes appear within expanded groups. Green Line branches appear under a nested sub-group within Subway. Mobile drawer accommodates the hierarchy.
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Visibility Filtering (Replace Highlighting)

**Goal:** Toggle routes on/off instead of highlight/dim

**Components:**
- `src/map.js` — Remove `highlightedRoutes` Set and `setHighlightedRoutes()`. Add `visibleRoutes` Set and `setVisibleRoutes(routeIds)`. When routes become invisible: remove polylines from map, remove route labels. When routes become visible: add polylines/labels back. In `syncVehicleMarkers()`: skip vehicles whose route is not in `visibleRoutes`. Remove pulsing glow CSS class logic and marker size distinction.
- `src/ui.js` — Wire master and individual toggles to call `setVisibleRoutes()` with the union of all checked routes. Replace `onHighlightChange` callback with `onVisibilityChange`.
- `styles.css` — Remove `.vehicle-marker--highlighted` styles and `pulse-glow` animation. Remove normal/highlighted polyline weight distinction.
- `config.js` / `config.example.js` — Replace `routes.defaultHighlighted` with `routes.defaultVisible`. Remove `routeStyles.normal` / `routeStyles.highlighted` distinction. Remove `markerSize.normal` / `markerSize.highlighted` distinction.
- `index.html` — Update wiring: `initUI(metadata, setVisibleRoutes)` instead of `setHighlightedRoutes`.

**Dependencies:** Phase 3 (toggle UI is built)

**Done when:** Unchecking a route removes its polyline and vehicles from map. Checking it restores them. No dim/bright distinction between routes. No pulsing glow. All visible routes render at uniform style.
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: Adaptive Polyline Weight and Theme Colors

**Goal:** Polylines scale thickness based on visible count; subway colors darkened for theme

**Components:**
- `src/map.js` — Implement adaptive weight function: calculate weight based on `visibleRoutes.size` (~5px for 1-4 routes, ~3px for 5-15, ~2px for 16+). Apply to all visible polylines when visibility changes. Apply theme color adjustment: darken MBTA official colors ~15% for dark map. Color adjustment applied when polylines are created, using a simple HSL lightness reduction.

**Dependencies:** Phase 4 (visibility system works)

**Done when:** Toggling from 2 visible routes to 20 visibly thins the polylines. Subway line colors are distinguishable but not overly bright on dark map. Bus and Green Line colors unchanged (already theme-appropriate).
<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->
### Phase 6: Persistence and Defaults

**Goal:** Save/restore toggle state, set sensible first-visit defaults

**Components:**
- `src/ui.js` — New localStorage keys: `'ttracker-visible-routes'` (array of route IDs), `'ttracker-service-toggles'` (object with subway/bus/commuterRail booleans). Read on startup, apply to toggle states. Write on every toggle change. First-visit defaults: Subway on (all lines visible), Bus off, Commuter Rail off.
- `config.js` / `config.example.js` — Update `routes.defaultVisible` to subway line IDs.
- Remove old `'ttracker-highlighted-routes'` localStorage key handling.

**Dependencies:** Phase 4 (visibility system works), Phase 3 (toggle UI exists)

**Done when:** Toggle state survives page reload. First visit shows all subway lines, no buses or commuter rail. New routes from API that aren't in persisted state default to on if their service type is on. Removed routes in persisted state are silently ignored.
<!-- END_PHASE_6 -->

## Additional Considerations

**Performance with expanded vehicle count:** Adding heavy rail (~50 vehicles peak) and commuter rail (~60 vehicles peak) roughly doubles the vehicle count from ~100 to ~210. The existing viewport culling and tab-visibility pausing handle this well. The client-side visibility filter adds negligible overhead (Set.has() per vehicle per frame).

**SSE data volume:** Single SSE connection with `route_type=0,1,2,3` will receive more events. MBTA SSE is efficient — only position changes are streamed, not full snapshots. The volume increase is proportional to vehicle count (~2x), well within browser EventSource capacity.

**Route polyline count:** Commuter rail adds ~12 polylines, heavy rail adds 3. Current Green Line has 4 branches, buses can have 50+. The additional ~15 polylines are negligible for Leaflet performance. Adaptive weight prevents visual clutter.

**Migration from old localStorage:** Users who have existing `ttracker-highlighted-routes` data will lose their preferences (key is removed). This is acceptable since the UI model changes fundamentally — old highlighted-routes concept doesn't map to the new visibility model.
