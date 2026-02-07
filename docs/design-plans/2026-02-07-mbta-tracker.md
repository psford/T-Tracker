# MBTA Real-Time Transit Tracker Design

## Summary

This design specifies a real-time MBTA (Massachusetts Bay Transportation Authority) transit tracker web application that visualizes live vehicle positions on an interactive map. The application connects to the MBTA's streaming API to receive continuous updates about bus and Green Line train locations, displaying them as animated directional markers on a dark-themed Leaflet map. The system is architected with clean separation between data acquisition (SSE streaming from MBTA), state management (interpolating positions for smooth 60fps animation), and rendering (Leaflet-based geographic display). A key architectural decision is the dual-model vehicle representation: each vehicle maintains both geographic coordinates (latitude/longitude) and topological position (current stop, next stop, progress along route), enabling future non-geographic renderers like a Stream Deck plugin to consume the same data stream without modification.

The implementation follows a no-build-tools approach for Phase 1, using pure ES6 modules that run directly in the browser. Configuration is externalized to enable route highlighting customization without code changes—the E-line is highlighted by default, but users can select any active route through a dynamic dropdown populated from the MBTA API. The design prioritizes performance through viewport culling (only animating visible vehicles), tab backgrounding detection (pausing animation when hidden), and intelligent interpolation (snapping for large jumps, smooth easing for normal updates). Error handling includes exponential backoff for reconnection, user-friendly messages for API failures, and a visible connection status indicator.

## Definition of Done

The deliverable is a web application that:

1. **Displays a transit schematic map** of the entire MBTA system using Leaflet
2. **Shows real-time vehicle positions** for Green Line and buses as directional icons that smoothly animate between updates
3. **Streams live data** from MBTA API via Server-Sent Events (SSE)
4. **Supports configurable route highlighting** - E-line highlighted by default, but system allows any route to be highlighted (not hardcoded)
5. **Works cross-platform** - runs in desktop browser and scales to mobile, with architecture that separates data/rendering to enable future Stream Deck plugin
6. **Runs locally** - no server deployment required, just open in browser

**Out of scope for Phase 1:**
- Commuter rail, ferry, and heavy rail subway (Red/Orange/Blue lines) - architecture supports them but not implemented yet
- Stream Deck plugin itself (just architected to enable it)
- Server-side caching or deployment
- Predictions/arrival times (just positions)

## Acceptance Criteria

### mbta-tracker.AC1: Display transit map with Leaflet
- **mbta-tracker.AC1.1 Success:** Map loads with CartoDB Dark Matter tiles centered on Boston (42.3601, -71.0589)
- **mbta-tracker.AC1.2 Success:** User can pan and zoom the map using mouse/touch controls
- **mbta-tracker.AC1.3 Success:** Map displays entire MBTA system area at default zoom level 12
- **mbta-tracker.AC1.4 Success:** Map tiles load correctly on desktop and mobile browsers
- **mbta-tracker.AC1.5 Failure:** Map displays error message if tile service unavailable
- **mbta-tracker.AC1.6 Edge:** Map renders correctly at viewport sizes from 320px to 2560px wide

### mbta-tracker.AC2: Show real-time vehicle positions with smooth animation
- **mbta-tracker.AC2.1 Success:** Green Line vehicles appear as directional markers on map
- **mbta-tracker.AC2.2 Success:** Bus vehicles appear as directional markers on map
- **mbta-tracker.AC2.3 Success:** Vehicle markers rotate to match bearing/direction from API
- **mbta-tracker.AC2.4 Success:** Vehicle position smoothly interpolates between SSE updates over 800ms
- **mbta-tracker.AC2.5 Success:** New vehicles fade in over 200ms when they appear
- **mbta-tracker.AC2.6 Success:** Vehicles fade out over 200ms when removed from service
- **mbta-tracker.AC2.7 Edge:** Large position jumps (>100m) snap instantly instead of animating
- **mbta-tracker.AC2.8 Edge:** Bearing changes wrap correctly (359° to 1° rotates 2°, not 358°)
- **mbta-tracker.AC2.9 Edge:** Animation pauses when browser tab is hidden (no wasted CPU)
- **mbta-tracker.AC2.10 Edge:** Only vehicles within viewport bounds animate (performance optimization)

### mbta-tracker.AC3: Stream live data via SSE
- **mbta-tracker.AC3.1 Success:** Application connects to MBTA `/vehicles` endpoint with SSE
- **mbta-tracker.AC3.2 Success:** Connection includes API key for 1000 req/min rate limit
- **mbta-tracker.AC3.3 Success:** Filter includes only route types 0 (light rail) and 3 (bus)
- **mbta-tracker.AC3.4 Success:** Vehicle positions update in real-time as SSE events arrive
- **mbta-tracker.AC3.5 Success:** Connection auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- **mbta-tracker.AC3.6 Failure:** Connection status shows "reconnecting" during network outage
- **mbta-tracker.AC3.7 Failure:** Parse errors for malformed JSON events are logged but don't crash app
- **mbta-tracker.AC3.8 Failure:** Rate limit (429) triggers user warning but app continues
- **mbta-tracker.AC3.9 Edge:** Initial 'reset' event loads all active vehicles correctly
- **mbta-tracker.AC3.10 Edge:** 'add', 'update', 'remove' events correctly modify vehicle state

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

### mbta-tracker.AC5: Cross-platform support (desktop, mobile, Stream Deck-ready)
- **mbta-tracker.AC5.1 Success:** Application works in Chrome, Firefox, Safari, Edge (latest versions)
- **mbta-tracker.AC5.2 Success:** Application works on mobile browsers (iOS Safari, Chrome Android)
- **mbta-tracker.AC5.3 Success:** Mobile displays touch-optimized controls (drawer instead of dropdown)
- **mbta-tracker.AC5.4 Success:** Vehicle data includes geographic (lat/lng) and topological (stop-sequence) information
- **mbta-tracker.AC5.5 Success:** Data layer is renderer-agnostic (MapRenderer for web, RibbonRenderer for Stream Deck)
- **mbta-tracker.AC5.6 Success:** api.js emits events that multiple renderers can subscribe to
- **mbta-tracker.AC5.7 Edge:** Responsive layout adapts correctly at mobile (390px), tablet (768px), desktop (1400px)

### mbta-tracker.AC6: Runs locally without server
- **mbta-tracker.AC6.1 Success:** Opening index.html in browser loads and runs application
- **mbta-tracker.AC6.2 Success:** No build step required for Phase 1 (pure ES6 modules)
- **mbta-tracker.AC6.3 Success:** Application connects directly to MBTA API via CORS
- **mbta-tracker.AC6.4 Success:** All assets load from CDN or local files (no server needed)
- **mbta-tracker.AC6.5 Edge:** Local development requires a simple HTTP server (e.g., `python -m http.server 8000`) since ES6 modules require HTTP, not file:// protocol

### mbta-tracker.AC7: Cross-Cutting Behaviors
- **mbta-tracker.AC7.1:** All MBTA API errors include user-friendly messages (no raw error objects shown)
- **mbta-tracker.AC7.2:** Connection status indicator visible in UI (green/amber/red states)
- **mbta-tracker.AC7.3:** Dark theme applied consistently across all UI elements
- **mbta-tracker.AC7.4:** Route polylines load once on startup (cached, not live-updated)
- **mbta-tracker.AC7.5:** Stop data fetched and cached on startup for future use
- **mbta-tracker.AC7.6:** No console errors during normal operation
- **mbta-tracker.AC7.7:** Application startup completes within 3 seconds on broadband connection

## Glossary

- **SSE (Server-Sent Events)**: A web standard for one-way real-time communication where the server pushes updates to the client over a persistent HTTP connection. Used here to stream live vehicle positions from MBTA's API without polling.
- **JSON:API**: A specification for structuring JSON responses with standardized `data`, `included`, and `relationships` objects. MBTA's API uses this format, requiring parsing to flatten nested structures into usable vehicle data.
- **Leaflet**: An open-source JavaScript library for interactive web maps. Provides the geographic display layer, tile rendering, marker management, and user controls (pan/zoom).
- **requestAnimationFrame**: A browser API for scheduling smooth animations synchronized with the display refresh rate (typically 60fps). Used here to interpolate vehicle positions between SSE updates.
- **Interpolation**: The process of calculating intermediate values between two known points. The application uses easeOutCubic interpolation to smoothly transition vehicle positions over 800ms between SSE updates.
- **Lerp (linear interpolation)**: A mathematical function that calculates a value between two endpoints based on a progress ratio (0 to 1). Used for smooth position transitions.
- **Bearing**: The compass direction a vehicle is traveling, measured in degrees (0-360°, where 0° is north). Used to rotate vehicle markers to match their direction of travel.
- **Polyline**: A series of connected line segments on a map, rendered by Leaflet to show routes. Each MBTA route (e.g., Green Line E branch) displays as a colored polyline.
- **Route types**: MBTA's classification system for transit modes. Type 0 = light rail (Green Line), Type 3 = bus. The application filters the SSE stream to these types only.
- **CartoDB Dark Matter**: A minimalist dark-themed map tile set used as the base layer. Optimized for overlaying data visualizations without visual clutter.
- **ES6 modules**: Modern JavaScript module syntax using `import`/`export` statements. Enables code organization without build tools when used with `<script type="module">`.
- **Exponential backoff**: A retry strategy where wait time doubles after each failure (1s, 2s, 4s, 8s...) up to a maximum. Used for SSE reconnection to avoid overwhelming the server.
- **Topological position**: A vehicle's location described relative to the route structure (current stop, next stop, progress between stops) rather than geographic coordinates. Enables linear/ribbon rendering for non-map displays.
- **Viewport culling**: A performance optimization that skips processing (here, animation) for objects outside the visible screen area.
- **CORS (Cross-Origin Resource Sharing)**: A browser security mechanism that controls which domains can access a web API. MBTA's API supports CORS, allowing direct browser connections without a proxy server.
- **localStorage**: A browser API for persisting key-value data across page reloads. Used to save user's route highlighting preferences.
- **Stream Deck**: A physical hardware device with programmable LCD buttons/displays, manufactured by Elgato. The application is architected to support a future plugin that shows vehicle positions on this device.
- **Event-driven communication**: An architecture pattern where components emit events that other components subscribe to, rather than calling functions directly. Provides loose coupling between modules.

## Architecture

ES6 module-based web application with clean separation between data acquisition, state management, and rendering layers.

**File Structure:**
```
T-Tracker/
├── index.html          # Entry point, loads Leaflet + ES6 modules
├── styles.css          # Dark theme styling, responsive layout
├── config.js           # Configuration (API key, route defaults, animation settings)
├── src/
│   ├── api.js          # MBTA API client (SSE connection, JSON:API parsing)
│   ├── map.js          # Leaflet initialization, layer management, marker CRUD
│   ├── vehicles.js     # Vehicle state management, animation loop
│   └── ui.js           # Route highlighting controls, dynamic route discovery
└── assets/
    └── icons/          # Vehicle SVG icons (directional arrows)
```

**Data Flow:**
```
MBTA API (SSE) → api.js (parse JSON:API) → vehicles.js (interpolate) → map.js (render)
                                                ↑
                                             ui.js (configure)
```

**Module Responsibilities:**

- **config.js**: Exports configuration object with API key, map center/zoom, route highlighting defaults, animation timing
- **api.js**: Manages SSE connection to `/vehicles` endpoint, parses MBTA's JSON:API format (flattens `data`, `included`, `relationships`), emits custom events (`vehicles:reset`, `vehicles:update`, `vehicles:remove`)
- **map.js**: Initializes Leaflet with CartoDB Dark Matter tiles, creates vehicle marker layer, provides functions to add/update/remove markers, handles route polyline rendering
- **vehicles.js**: Maintains vehicle state map (id → position/bearing/route), runs requestAnimationFrame loop for smooth interpolation between SSE updates, handles fade-in/fade-out animations
- **ui.js**: Builds route highlighting dropdown, fetches available routes from MBTA API on startup, updates highlighted route styling, persists preferences to localStorage

**Key Architectural Decisions:**

1. **Data/Presentation Separation**: Vehicle data includes both geographic (lat/lng) and topological (stop-sequence) information. This enables future renderers (e.g., Stream Deck linear ribbon) to consume the same data without modifying the data layer.

2. **Pluggable Renderers**: `map.js` implements `MapRenderer` pattern for geographic display. Future `RibbonRenderer` can consume same vehicle events for linear/stop-based display.

3. **Event-Driven Communication**: `api.js` emits custom DOM events rather than direct function calls. Loose coupling allows multiple subscribers (current: vehicles.js; future: Stream Deck plugin, logging, analytics).

4. **Configuration-Driven Behavior**: Route highlighting, animation timing, and API settings live in `config.js`, not hardcoded. Enables easy customization and future config UI.

## Existing Patterns

Investigation found no existing codebase (new project). This design establishes initial patterns:

- **ES6 modules without build tools**: Import/export syntax with `type="module"` in HTML. All modern browsers support this. Build tools (Vite/Webpack) deferred to Phase 2+ when needed for optimization or npm dependencies.
- **Functional module exports**: Each module exports pure functions and objects. No class-based architecture. Aligns with functional core, imperative shell separation.
- **Dark theme first**: CartoDB Dark Matter basemap with custom CSS for controls. Optimized for always-on displays (Stream Deck, old iPhone on desk).
- **localStorage for preferences**: User settings (highlighted routes) persist across sessions via localStorage API.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Project Structure and Map Initialization

**Goal:** Establish file structure, load Leaflet, display empty map

**Components:**
- `index.html` - HTML skeleton with Leaflet CDN links, ES6 module imports
- `styles.css` - Base dark theme styling, Leaflet override for dark mode
- `config.js` - Configuration object with map center (Boston), zoom levels, API key
- `src/map.js` - Leaflet initialization function, CartoDB Dark Matter tile layer

**Dependencies:** None (first phase)

**Done when:** Opening index.html in browser displays CartoDB Dark Matter map centered on Boston (42.3601, -71.0589) at zoom 12, with working zoom/pan controls
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: MBTA API Integration

**Goal:** Connect to MBTA SSE stream, parse vehicle position updates

**Components:**
- `src/api.js` - EventSource connection to MBTA `/vehicles` endpoint with filters (route_type 0,3), JSON:API parser that flattens nested structure, custom event emitter for vehicle updates
- Updates to `config.js` - MBTA API base URL, SSE endpoint configuration

**Dependencies:** Phase 1 (project structure exists)

**Done when:** Browser console logs vehicle update events with parsed data (id, lat, lng, bearing, route), SSE connection auto-reconnects on disconnect with exponential backoff (1s, 2s, 4s, max 30s)
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Vehicle State Management and Animation

**Goal:** Maintain vehicle state, interpolate positions for smooth animation

**Components:**
- `src/vehicles.js` - Vehicle state map (id → current/target position), requestAnimationFrame loop for interpolation, lerp/easeOutCubic functions, event listeners for api.js events

**Dependencies:** Phase 2 (API events are firing)

**Done when:** Browser console logs interpolated vehicle positions at 60fps, animation smoothly transitions between SSE updates (800ms duration with easing), handles large position jumps (>100m) by snapping instead of animating
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Vehicle Markers on Map

**Goal:** Render vehicles as directional markers on map

**Components:**
- Updates to `src/map.js` - Functions to create/update/remove Leaflet markers with custom HTML/CSS icons, marker rotation based on bearing
- Updates to `src/vehicles.js` - Call map.js functions from animation loop to update marker positions
- `assets/icons/` - SVG icons for vehicles (simple arrow shapes for Phase 1)
- Updates to `styles.css` - Vehicle marker styling (size, colors, rotation transform)

**Dependencies:** Phase 3 (vehicle state is interpolating)

**Done when:** Map shows animated vehicle markers for all active Green Line and bus vehicles, markers rotate to match vehicle bearing, markers fade in when vehicle appears and fade out when removed (200ms transitions)
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: Route Polylines

**Goal:** Display Green Line and bus route paths on map

**Components:**
- Updates to `src/map.js` - Fetch route shapes from MBTA `/shapes` endpoint on startup, render as Leaflet polylines with route colors, manage route layer separately from vehicle layer
- Updates to `config.js` - Route styling configuration (weight, opacity for normal vs highlighted)

**Dependencies:** Phase 4 (map is displaying vehicles)

**Done when:** Map shows Green Line branches (B, C, D, E) as green polylines and active bus routes in their respective colors, routes render below vehicle markers (correct layer order), routes load once on startup (not live-updated)
<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->
### Phase 6: Route Highlighting Controls

**Goal:** UI for selecting which routes to highlight

**Components:**
- `src/ui.js` - Dropdown/checkbox UI for route selection, fetch available routes from MBTA `/routes` endpoint (filtered to type 0,3), event handlers to update highlighting, localStorage persistence for selections
- Updates to `src/map.js` - Functions to update route polyline styling (weight, opacity, color) based on highlighted state, update vehicle marker size/style for highlighted routes
- Updates to `styles.css` - Control panel styling, mobile responsive drawer
- Updates to `config.js` - Default highlighted routes (E-line)

**Dependencies:** Phase 5 (routes are displayed)

**Done when:** UI displays dropdown with all Green Line branches and active bus routes (dynamically populated from API), selecting routes updates their styling (brighter, thicker lines), highlighted route vehicles show larger markers with pulsing glow effect, selections persist to localStorage and restore on page reload, mobile displays drawer UI instead of dropdown
<!-- END_PHASE_6 -->

<!-- START_PHASE_7 -->
### Phase 7: Mobile Responsiveness and Polish

**Goal:** Optimize for mobile browsers and refine UX

**Components:**
- Updates to `styles.css` - Media queries for mobile (<768px), touch-optimized controls, viewport meta tag in index.html
- Updates to `src/ui.js` - Touch event handlers, mobile drawer behavior
- Updates to `src/vehicles.js` - Viewport-based culling (don't animate off-screen vehicles), pause animation when tab hidden

**Dependencies:** Phase 6 (full functionality exists)

**Done when:** App works smoothly on mobile browser (tested at 390x844 viewport), controls are touch-friendly, animation pauses when tab backgrounded (performance), only visible vehicles animate (performance), map pins/zooms correctly on mobile
<!-- END_PHASE_7 -->

<!-- START_PHASE_8 -->
### Phase 8: Error Handling and Data Model Enhancement

**Goal:** Graceful error handling, add topological data for future renderers

**Components:**
- Updates to `src/api.js` - Error handling for SSE failures, rate limit (429) detection with user warning, connection status indicator
- Updates to `src/vehicles.js` - Enhanced vehicle data model with stop-sequence fields (currentStop, nextStop, stopProgress), calculate topological position from lat/lng and route shape data
- Updates to `src/map.js` - Fetch stop data from MBTA `/stops` endpoint on startup, cache stop positions and sequences
- Updates to `index.html` - Connection status indicator UI
- Updates to `styles.css` - Status indicator styling (connected/disconnected/error states)

**Dependencies:** Phase 7 (mobile responsiveness complete)

**Done when:** Connection status shows in UI (green=connected, amber=reconnecting, red=error), vehicle data model includes topological fields (currentStop, stopProgress), API errors display user-friendly messages, rate limit triggers warning but app continues working, stop data cached for future use
<!-- END_PHASE_8 -->

## Additional Considerations

**Future Build Tooling:** Phase 1-8 use pure ES6 modules for simplicity. Future phases should add Vite or Webpack when:
- npm dependencies are needed (beyond Leaflet CDN)
- Code minification/bundling desired for performance
- Hot module replacement wanted for dev experience
- TypeScript conversion considered

Design supports this migration - module structure remains the same, just add build step between source and deployment.

**Stream Deck Plugin Architecture:** Vehicle data model in Phase 8 includes topological position (stop-sequence) specifically to enable Stream Deck ribbon renderer. Plugin can:
- Subscribe to same vehicle events from api.js
- Filter vehicles by route and stop range
- Render linearly using stopProgress instead of lat/lng
- Reuse configuration from config.js or config.json

No changes to data layer required for Stream Deck support.

**Performance Thresholds:** Design assumes <100 simultaneous vehicles (typical for Green Line + buses in service area). If vehicle count exceeds 100:
- Implement viewport culling (Phase 7 partial, but may need enhancement)
- Throttle animation updates (currently 60fps)
- Consider virtual scrolling for route list if >50 routes

**API Rate Limits:** MBTA allows 1000 req/min with API key. SSE connection counts as 1 request (stays open). Route/shape/stop fetches on startup are ~10 requests total. Well within limits.
