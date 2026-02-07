# T-Tracker Test Requirements

Maps each acceptance criterion from the MBTA Real-Time Transit Tracker design to a verification method. Because this is a browser-only project with no build tools, no test framework (no npm, jest, vitest, or playwright), and no server-side code, all verification is **human operational testing** -- opening the app in a browser and checking behavior manually.

---

## Verification Context

- **Project type:** Pure ES6 modules loaded directly in the browser
- **Build tools:** None
- **Test framework:** None
- **Server requirement:** Local HTTP server only (e.g., `python -m http.server 8000`) because ES6 modules require HTTP, not `file://`
- **Automated tests:** Not applicable -- there is no test runner in this project
- **All criteria require human verification** via browser-based operational testing

---

## Verification Legend

| Label | Meaning |
|-------|---------|
| **VISUAL** | Open browser, look at the screen |
| **CONSOLE** | Open browser DevTools Console tab |
| **NETWORK** | Open browser DevTools Network tab |
| **DEVTOOLS** | Use DevTools Performance, Application, or Elements tabs |
| **RESPONSIVE** | Resize browser window or use DevTools device emulation |
| **INTERACTION** | Click, tap, pan, zoom, toggle UI controls |
| **SIMULATE-FAILURE** | Disconnect network, throttle, or block requests |
| **CROSS-BROWSER** | Repeat in Chrome, Firefox, Safari, Edge |
| **STORAGE** | Inspect localStorage via DevTools Application tab |

---

## AC1: Display Transit Map with Leaflet

**Phase:** 1 (Project Structure and Map Initialization)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC1.1 | Map loads with CartoDB Dark Matter tiles centered on Boston (42.3601, -71.0589) | VISUAL, CONSOLE | 1. Start local server (`python -m http.server 8000`). 2. Open `http://localhost:8000`. 3. Confirm dark-themed map tiles render. 4. Confirm map is centered on downtown Boston (visible landmarks: Boston Common, Charles River). 5. No console errors. |
| AC1.2 | User can pan and zoom using mouse/touch controls | INTERACTION | 1. Click and drag to pan the map. 2. Use mouse scroll wheel to zoom in/out. 3. Click the +/- zoom buttons in the control. 4. On touch device: pinch to zoom, drag to pan. 5. Confirm all controls respond smoothly. |
| AC1.3 | Map displays entire MBTA system area at default zoom level 12 | VISUAL | 1. Reload page (no manual zoom). 2. Confirm the visible area spans roughly from Braintree (south) to Alewife (north), covering the MBTA service area. 3. Confirm zoom level indicator shows 12 (or verify via console: map object's getZoom()). |
| AC1.4 | Map tiles load correctly on desktop and mobile browsers | CROSS-BROWSER, RESPONSIVE | 1. Test in Chrome, Firefox, Safari, Edge on desktop. 2. Test in iOS Safari and Chrome Android on mobile device (or use DevTools device emulation at 390x844). 3. Confirm tiles load without gaps or errors in all browsers. |
| AC1.5 | Map displays error message if tile service unavailable | SIMULATE-FAILURE | 1. Open DevTools Network tab. 2. Block requests to `*.basemaps.cartocdn.com` (via DevTools request blocking or disconnect network after page load). 3. Zoom/pan to trigger new tile requests. 4. Confirm a user-friendly error message appears (e.g., "Map tiles unavailable -- check your connection"). 5. Confirm no raw error objects shown to user. |
| AC1.6 | Map renders correctly at viewport sizes from 320px to 2560px wide | RESPONSIVE | 1. Use DevTools responsive mode. 2. Test at: 320px, 390px, 768px, 1024px, 1400px, 1920px, 2560px widths. 3. Confirm map fills viewport without overflow, scrollbars, or layout breakage at each size. |

---

## AC2: Show Real-Time Vehicle Positions with Smooth Animation

**Phases:** 3 (State Management), 4 (Markers on Map), 7 (Mobile/Polish)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC2.1 | Green Line vehicles appear as directional markers on map | VISUAL | 1. Open app with SSE connected (green status dot). 2. Look in the downtown Boston / Kenmore / Brookline area. 3. Confirm green-tinted directional arrow markers appear on or near Green Line routes. |
| AC2.2 | Bus vehicles appear as directional markers on map | VISUAL | 1. Zoom out to see wider Boston area. 2. Confirm amber/yellow-tinted directional arrow markers appear distributed across bus routes. 3. Confirm buses are visually distinct from Green Line vehicles. |
| AC2.3 | Vehicle markers rotate to match bearing/direction from API | VISUAL | 1. Observe vehicle markers. 2. Confirm arrows point in the direction of travel (not all pointing the same way). 3. Watch a vehicle moving along a curved route -- confirm the arrow rotates as direction changes. |
| AC2.4 | Vehicle position smoothly interpolates between SSE updates over 800ms | VISUAL | 1. Zoom in close on a single moving vehicle. 2. Observe that the marker glides smoothly rather than teleporting between positions. 3. The motion should feel like 1-second-ish smooth slides. |
| AC2.5 | New vehicles fade in over 200ms when they appear | VISUAL | 1. This is difficult to catch in real-time. Wait for early morning or late night when vehicles enter service. 2. Alternatively, disconnect and reconnect network -- on reset event, all vehicles should fade in. 3. Confirm markers appear with a brief opacity transition, not an abrupt pop-in. |
| AC2.6 | Vehicles fade out over 200ms when removed from service | VISUAL | 1. Similar to AC2.5 -- watch during end-of-service hours or wait for a vehicle to go out of service. 2. Confirm marker fades out rather than abruptly disappearing. |
| AC2.7 | Large position jumps (>100m) snap instantly instead of animating | VISUAL, CONSOLE | 1. This edge case is hard to trigger naturally. 2. To verify the code path exists: inspect `src/vehicles.js` and confirm the `haversineDistance()` check against `config.animation.snapThreshold` (100m). 3. If a vehicle teleports (e.g., GPS glitch), it should snap to new position without a long animated slide. |
| AC2.8 | Bearing changes wrap correctly (359 to 1 degrees rotates 2 degrees, not 358 degrees) | VISUAL | 1. Watch vehicles traveling roughly northward. 2. When a vehicle's bearing crosses the 0/360 boundary, confirm the marker does not spin nearly a full rotation. 3. The rotation should always take the shortest arc. |
| AC2.9 | Animation pauses when browser tab is hidden (no wasted CPU) | DEVTOOLS | 1. Open DevTools Performance tab. 2. Start recording. 3. Switch to another browser tab for 10 seconds. 4. Switch back. 5. Stop recording. 6. Inspect the timeline -- confirm no `requestAnimationFrame` callbacks fired while the tab was hidden. 7. Confirm vehicles resume animating smoothly on tab return (no "catch up" jump). |
| AC2.10 | Only vehicles within viewport bounds animate (performance optimization) | DEVTOOLS | 1. Zoom in tightly to show only a few vehicles. 2. Open DevTools Performance tab, record a few seconds. 3. Confirm the number of marker DOM updates corresponds roughly to visible vehicles, not all vehicles systemwide. 4. Pan to an empty area -- minimal marker updates should occur. |

---

## AC3: Stream Live Data via SSE

**Phases:** 2 (API Integration), 8 (Error Handling)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC3.1 | Application connects to MBTA `/vehicles` endpoint with SSE | NETWORK | 1. Open DevTools Network tab, filter by "EventStream" or "vehicles". 2. Confirm a persistent SSE connection to `api-v3.mbta.com/vehicles` is open. 3. Confirm events stream continuously (data frames in the response). |
| AC3.2 | Connection includes API key for 1000 req/min rate limit | NETWORK | 1. In Network tab, inspect the SSE request URL. 2. Confirm `api_key=` parameter is present in the query string. 3. Confirm the key is not the placeholder `YOUR_API_KEY_HERE`. |
| AC3.3 | Filter includes only route types 0 (light rail) and 3 (bus) | NETWORK | 1. In Network tab, inspect the SSE request URL. 2. Confirm `filter[route_type]=0,3` is present in the query string. |
| AC3.4 | Vehicle positions update in real-time as SSE events arrive | VISUAL, NETWORK | 1. Watch the map -- vehicles should move periodically. 2. In Network tab, confirm SSE data frames arrive every few seconds. 3. Each arrival should correspond to a visible marker movement on the map. |
| AC3.5 | Connection auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s) | SIMULATE-FAILURE, CONSOLE | 1. Open console. 2. Disconnect network (DevTools > Network > Offline). 3. Observe console logs showing reconnection attempts. 4. Confirm delays increase: ~1s, ~2s, ~4s, ~8s, ~16s, ~30s, ~30s (capped). 5. Reconnect network. 6. Confirm SSE stream resumes and backoff resets. |
| AC3.6 | Connection status shows "reconnecting" during network outage | VISUAL, SIMULATE-FAILURE | 1. Note the connection status indicator (bottom-left). 2. Disconnect network. 3. Confirm status changes to amber dot with "Reconnecting..." text. 4. Reconnect network. 5. Confirm status returns to green dot with "Live" text. |
| AC3.7 | Parse errors for malformed JSON events are logged but don't crash app | CONSOLE | 1. This is an edge case that requires malformed data from the API (rare). 2. Verify by code inspection: confirm `JSON.parse` calls in `src/api.js` are wrapped in try/catch. 3. Confirm catch blocks log to console.error without throwing. 4. Confirm the app continues operating after a parse error (no crash, no frozen UI). |
| AC3.8 | Rate limit (429) triggers user warning but app continues | SIMULATE-FAILURE, VISUAL | 1. This is difficult to trigger with a valid API key (1000 req/min limit). 2. Verify by code inspection: confirm `src/api.js` has rate-limit detection logic. 3. Confirm the status indicator would show red/error state with user-friendly message. 4. Confirm the app does not crash -- it should retry with increased backoff. |
| AC3.9 | Initial 'reset' event loads all active vehicles correctly | CONSOLE, VISUAL | 1. Reload the page. 2. In console, confirm a "Reset -- vehicles: N" log (or equivalent) shows the initial vehicle count. 3. Visually confirm that many vehicle markers appear on the map within a few seconds of page load. |
| AC3.10 | 'add', 'update', 'remove' events correctly modify vehicle state | VISUAL, CONSOLE | 1. Watch the map for several minutes during active service hours. 2. Confirm new vehicles appear (add). 3. Confirm vehicles move (update). 4. Confirm vehicles disappear when they go out of service (remove). 5. Optionally enable console logging to see event types. |

---

## AC4: Configurable Route Highlighting (Not Hardcoded)

**Phase:** 6 (Route Highlighting Controls)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC4.1 | E-line is highlighted by default on first load | VISUAL, STORAGE | 1. Clear localStorage (DevTools > Application > Local Storage > clear). 2. Reload page. 3. Confirm Green-E checkbox is checked in the control panel. 4. Confirm Green-E polyline is brighter/thicker than other routes. 5. Confirm Green-E vehicle markers are larger with glow effect. |
| AC4.2 | User can select any Green Line branch (B, C, D, E) to highlight | INTERACTION | 1. Open the route control panel. 2. Check Green-B, Green-C, Green-D individually. 3. Confirm each selected branch's polyline becomes brighter/thicker. 4. Confirm each branch's vehicle markers enlarge with glow. |
| AC4.3 | User can select any active bus route to highlight | INTERACTION | 1. Scroll down in the route list past Green Line branches. 2. Check a bus route (e.g., Route 1, Route 39). 3. Confirm the bus route polyline highlights. 4. Confirm bus vehicles on that route show larger markers with glow. |
| AC4.4 | Multiple routes can be highlighted simultaneously | INTERACTION | 1. Check Green-E and a bus route simultaneously. 2. Confirm both routes show highlighted styling at the same time. 3. Confirm both sets of vehicles show enlarged markers with glow. |
| AC4.5 | Highlighted routes show brighter color, thicker lines (weight 5 vs 3) | VISUAL | 1. With one route highlighted, compare its polyline to non-highlighted routes. 2. Highlighted route should be visibly thicker and more opaque. 3. Non-highlighted routes should appear thinner and more translucent. |
| AC4.6 | Highlighted route vehicles show larger markers (28px vs 24px) | VISUAL, DEVTOOLS | 1. With a route highlighted, compare its vehicle markers to non-highlighted ones. 2. Highlighted markers should be visibly larger. 3. Optionally: inspect marker element in DevTools, confirm width/height is 28px (vs 24px for non-highlighted). |
| AC4.7 | Highlighted route vehicles have pulsing glow effect | VISUAL | 1. Zoom in on a highlighted vehicle marker. 2. Observe a pulsing glow/shadow effect around the marker. 3. Confirm the glow animates (brightens and dims cyclically). |
| AC4.8 | Route list populated dynamically from MBTA `/routes` API | NETWORK, VISUAL | 1. Open DevTools Network tab on page load. 2. Confirm a request to `api-v3.mbta.com/routes` with `filter[type]=0,3`. 3. Confirm the control panel lists routes matching the API response. |
| AC4.9 | New routes added by MBTA appear in dropdown automatically | VISUAL | 1. This is a design verification -- since routes are fetched dynamically from the API on each page load, any new route MBTA adds will appear automatically on next visit. 2. Verify by confirming no routes are hardcoded in the UI code (inspect `src/ui.js` -- route list built from `getRouteMetadata()`, not a static array). |
| AC4.10 | Route selections persist to localStorage | STORAGE, INTERACTION | 1. Check/uncheck several routes. 2. Open DevTools > Application > Local Storage. 3. Confirm key `ttracker-highlighted-routes` exists with a JSON array of selected route IDs. 4. Confirm the stored value matches current checkbox state. |
| AC4.11 | Selections restore from localStorage on next visit | STORAGE, INTERACTION | 1. Select a non-default set of routes (e.g., uncheck Green-E, check Green-B and a bus route). 2. Close the browser tab. 3. Reopen `http://localhost:8000`. 4. Confirm the same routes are checked as before. 5. Confirm highlighted styling matches the restored selection. |
| AC4.12 | Highlighting config stored in config.js, not hardcoded in source | CODE INSPECTION | 1. Open `config.js`. 2. Confirm `routes.defaultHighlighted` array exists (e.g., `['Green-E']`). 3. Open `src/ui.js`. 4. Confirm the default highlighted route(s) are read from config, not hardcoded as string literals. 5. Change the default in `config.js` to a different route, clear localStorage, reload -- confirm the new default applies. |

---

## AC5: Cross-Platform Support (Desktop, Mobile, Stream Deck-Ready)

**Phases:** 7 (Mobile Responsiveness), 8 (Data Model Enhancement)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC5.1 | Application works in Chrome, Firefox, Safari, Edge (latest versions) | CROSS-BROWSER | 1. Open the app in each browser. 2. Confirm map loads, vehicles appear, controls work, SSE streams. 3. Confirm no browser-specific errors in console. 4. Check that CSS renders consistently (dark theme, controls, markers). |
| AC5.2 | Application works on mobile browsers (iOS Safari, Chrome Android) | CROSS-BROWSER | 1. Open the app on a real mobile device or use DevTools device emulation. 2. Confirm map loads and is touch-interactive. 3. Confirm vehicles appear and animate. 4. Confirm route controls are accessible via drawer. |
| AC5.3 | Mobile displays touch-optimized controls (drawer instead of dropdown) | RESPONSIVE, INTERACTION | 1. Set viewport to 390px wide (mobile). 2. Confirm the route control panel is hidden by default. 3. Confirm a toggle button (filter/menu icon) appears in top-right corner. 4. Tap the toggle -- confirm a drawer slides in from the right. 5. Confirm touch targets are at least 44px tall. 6. Tap the backdrop -- confirm drawer closes. |
| AC5.4 | Vehicle data includes geographic (lat/lng) and topological (stop-sequence) information | CONSOLE | 1. In browser console, access a vehicle object (via a debug export or by adding a temporary `window.debugGetVehicles = getVehicles` line). 2. Inspect a vehicle: confirm it has `latitude`, `longitude` (geographic) AND `stopId`, `currentStopSequence`, `currentStatus` (topological). 3. Both sets of fields should have real values from the API. |
| AC5.5 | Data layer is renderer-agnostic (MapRenderer for web, RibbonRenderer for Stream Deck) | CODE INSPECTION | 1. Open `src/api.js` -- confirm it emits generic events, does not import or reference map.js. 2. Open `src/vehicles.js` -- confirm it does not import map.js directly; it uses callbacks/events. 3. Confirm that a hypothetical second renderer could subscribe to `apiEvents` without modifying the data layer. |
| AC5.6 | api.js emits events that multiple renderers can subscribe to | CODE INSPECTION | 1. Open `src/api.js`. 2. Confirm it exports an `EventTarget` (e.g., `apiEvents`). 3. Confirm events are dispatched via `apiEvents.dispatchEvent()`. 4. Confirm the event names (`vehicles:reset`, `vehicles:add`, `vehicles:update`, `vehicles:remove`) are documented or visible. 5. Confirm nothing prevents multiple `addEventListener` calls on the same event. |
| AC5.7 | Responsive layout adapts correctly at mobile (390px), tablet (768px), desktop (1400px) | RESPONSIVE | 1. Test at 390x844 (mobile): drawer toggle visible, full-screen map, no horizontal scroll. 2. Test at 768x1024 (tablet): control panel visible statically, no drawer toggle, map fills viewport. 3. Test at 1400x900 (desktop): control panel in top-right, map fills viewport, no layout issues. |

---

## AC6: Runs Locally Without Server

**Phase:** 1 (Project Structure)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC6.1 | Opening index.html in browser loads and runs application | VISUAL | 1. Start local HTTP server (`python -m http.server 8000`). 2. Open `http://localhost:8000`. 3. Confirm the map loads, SSE connects, vehicles appear. 4. No additional build step or compilation needed. |
| AC6.2 | No build step required for Phase 1 (pure ES6 modules) | CODE INSPECTION | 1. Confirm there is no `package.json`, no `node_modules/`, no `webpack.config.js`, no `vite.config.js`. 2. Confirm all `.js` files use native `import`/`export` syntax. 3. Confirm `index.html` uses `<script type="module">`. |
| AC6.3 | Application connects directly to MBTA API via CORS | NETWORK | 1. Open Network tab. 2. Confirm SSE and REST requests go directly to `api-v3.mbta.com` (no proxy server). 3. Confirm no CORS errors in console. |
| AC6.4 | All assets load from CDN or local files (no server needed) | NETWORK | 1. Open Network tab. 2. Confirm Leaflet loads from CDN (`unpkg.com`). 3. Confirm all other assets (CSS, JS modules, SVG icons) load from localhost. 4. No requests to any other server except MBTA API and CDN. |
| AC6.5 | Local development requires a simple HTTP server since ES6 modules require HTTP, not file:// protocol | VISUAL | 1. Try opening `index.html` directly via `file://` protocol. 2. Confirm it fails with CORS/module errors in console. 3. Start `python -m http.server 8000`. 4. Open via `http://localhost:8000`. 5. Confirm it works. This confirms the documented requirement. |

---

## AC7: Cross-Cutting Behaviors

**Phases:** 5 (Route Polylines), 7 (Mobile/Polish), 8 (Error Handling)

| Criterion ID | Description | Verification Type | Verification Steps |
|---|---|---|---|
| AC7.1 | All MBTA API errors include user-friendly messages (no raw error objects shown) | SIMULATE-FAILURE, VISUAL | 1. Disconnect network after page load. 2. Confirm the connection status indicator shows a human-readable message (e.g., "Reconnecting in 4s..."), not a raw Error object or stack trace. 3. Block the routes/stops API endpoints -- confirm any error messages shown are user-friendly. |
| AC7.2 | Connection status indicator visible in UI (green/amber/red states) | VISUAL, SIMULATE-FAILURE | 1. On normal operation: confirm green dot with "Live" text in bottom-left corner. 2. Disconnect network: confirm amber dot with "Reconnecting..." text. 3. If error persists: confirm red dot with error message. 4. Reconnect: confirm return to green. |
| AC7.3 | Dark theme applied consistently across all UI elements | VISUAL | 1. Inspect all UI elements: map controls, route panel, status indicator, error messages. 2. Confirm all use dark backgrounds (dark blue/navy palette). 3. Confirm text is light-colored (white/gray). 4. Confirm no bright white boxes or unstyled elements break the dark theme. |
| AC7.4 | Route polylines load once on startup (cached, not live-updated) | NETWORK | 1. Open Network tab. 2. Reload the page. 3. Confirm exactly one request to `/routes` (with shapes included). 4. Wait several minutes. 5. Confirm no additional `/routes` requests are made. |
| AC7.5 | Stop data fetched and cached on startup for future use | NETWORK, CONSOLE | 1. Open Network tab. 2. Reload page. 3. Confirm a single request to `/stops` endpoint. 4. Confirm console shows a log of cached stop count. 5. Wait several minutes -- confirm no additional `/stops` requests. |
| AC7.6 | No console errors during normal operation | CONSOLE | 1. Open browser console (all levels: errors, warnings). 2. Reload the page. 3. Let the app run for 2-3 minutes with active SSE streaming. 4. Confirm zero errors in console. 5. Warnings are acceptable if they come from Leaflet/CDN, but no errors from app code. |
| AC7.7 | Application startup completes within 3 seconds on broadband connection | DEVTOOLS | 1. Open DevTools Network tab, set throttling to "No throttling" (or equivalent broadband speed). 2. Hard-reload the page (Ctrl+Shift+R). 3. Measure time from navigation start to first vehicle marker appearing on the map. 4. This should be under 3 seconds. 5. Note: SSE connection starts in parallel with route/stop loading, so vehicles can appear before polylines finish. |

---

## Summary by Verification Method

| Method | Criteria Count | Notes |
|--------|---------------|-------|
| VISUAL | 30+ | Most criteria involve visual confirmation of rendered output |
| CONSOLE | 12 | Check for logs, errors, data shape |
| NETWORK | 10 | Verify API connections, request URLs, caching |
| INTERACTION | 8 | Click, tap, pan, zoom, toggle controls |
| RESPONSIVE | 6 | Test at multiple viewport widths |
| SIMULATE-FAILURE | 6 | Disconnect network, block requests |
| CODE INSPECTION | 6 | Verify architectural decisions in source code |
| CROSS-BROWSER | 3 | Test in Chrome, Firefox, Safari, Edge, mobile browsers |
| STORAGE | 3 | Inspect localStorage for persisted selections |
| DEVTOOLS | 4 | Performance tab, Elements inspection |

---

## Recommended Testing Sequence

1. **Phase 1 complete:** AC1.1-AC1.6, AC6.1-AC6.5 (map loads, basic functionality)
2. **Phase 2 complete:** AC3.1-AC3.4, AC3.9-AC3.10 (SSE streaming works, console verification)
3. **Phase 3 complete:** AC2.4, AC2.7, AC2.8 (interpolation works, console verification)
4. **Phase 4 complete:** AC2.1-AC2.3, AC2.5-AC2.6 (markers visible and animated on map)
5. **Phase 5 complete:** AC7.4 (route polylines render)
6. **Phase 6 complete:** AC4.1-AC4.12 (route highlighting UI, localStorage persistence)
7. **Phase 7 complete:** AC2.9-AC2.10, AC5.1-AC5.3, AC5.7, AC1.6 (mobile, performance, responsive)
8. **Phase 8 complete:** AC3.5-AC3.8, AC5.4-AC5.6, AC7.1-AC7.3, AC7.5-AC7.7 (error handling, topological data, polish)

---

## Criteria That Cannot Be Fully Verified Without Special Conditions

| Criterion | Challenge | Mitigation |
|---|---|---|
| AC2.5 (fade-in) | New vehicles entering service are infrequent and unpredictable | Disconnect/reconnect network to trigger a reset event (all vehicles re-enter) |
| AC2.6 (fade-out) | Vehicles leaving service are infrequent | Test during end-of-service hours, or watch for extended periods |
| AC2.7 (snap on large jump) | GPS glitches causing >100m jumps are rare | Verify via code inspection that the haversine check and snap logic exist |
| AC2.8 (bearing wrap) | Requires a vehicle crossing the 0/360 boundary | Watch northbound vehicles for extended periods; verify via code inspection of `lerpAngle()` |
| AC3.7 (malformed JSON) | Requires the MBTA API to send malformed data (rare) | Verify via code inspection that try/catch wraps JSON.parse |
| AC3.8 (429 rate limit) | Requires exceeding 1000 req/min (nearly impossible with SSE) | Verify via code inspection that detection and recovery logic exists |
| AC4.9 (new MBTA routes) | Requires MBTA to add a new route | Verify via code inspection that route list is dynamically built from API data, not hardcoded |
