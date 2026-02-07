# MBTA Real-Time Transit Tracker — Human Test Plan

Generated: 2026-02-07

## Prerequisites

- Python 3 installed (for `python -m http.server`)
- `config.js` in project root (copy from `config.example.js`, insert valid MBTA API key from https://api-v3.mbta.com)
- Browsers: Chrome (latest), Firefox (latest), Edge (latest); optionally Safari on macOS/iOS
- All supplementary unit tests passing:
  ```
  node tests/api.test.js
  node tests/vehicles.test.js
  node tests/ui.test.js
  node tests/polyline.test.js
  ```
- Local HTTP server running:
  ```
  cd T-Tracker
  python -m http.server 8000
  ```
- App accessible at `http://localhost:8000`

---

## Phase 1: Map Initialization (AC1, AC6)

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open `http://localhost:8000` in Chrome | Dark-themed map tiles render. Map centered on downtown Boston. No console errors. (AC1.1, AC6.1) |
| 1.2 | Open DevTools Console. Check for errors. | Zero errors from application code. (AC7.6) |
| 1.3 | Check zoom level via console: `document.querySelector('#map')._leaflet_map.getZoom()` | Zoom level is 12. Visible area spans roughly Braintree to Alewife. (AC1.3) |
| 1.4 | Click-drag to pan. Scroll to zoom. Click +/- buttons. | All controls respond smoothly. (AC1.2) |
| 1.5 | DevTools > Network tab. Inspect all requests. | Leaflet from `unpkg.com` with SRI hash. JS/CSS from localhost. SSE/REST to `api-v3.mbta.com`. No CORS errors. (AC6.3, AC6.4) |
| 1.6 | Verify no `package.json`, no `node_modules/`. Confirm `<script type="module">`. | Pure ES6 modules, no build step. (AC6.2) |
| 1.7 | Open `index.html` directly via `file://` protocol. | CORS/module errors. App does not function. (AC6.5) |
| 1.8 | DevTools responsive mode at: 320px, 390px, 768px, 1024px, 1400px, 1920px, 2560px. | Map fills viewport at every width. No overflow. (AC1.6) |

## Phase 2: SSE Streaming (AC3)

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | DevTools > Network > filter "EventStream" | Persistent SSE connection to `api-v3.mbta.com/vehicles`. Data frames stream continuously. (AC3.1) |
| 2.2 | Inspect SSE request URL. | Contains `api_key=` and `filter[route_type]=0,3`. (AC3.2, AC3.3) |
| 2.3 | Watch map for 30 seconds. | Vehicle markers move as SSE events arrive. (AC3.4) |
| 2.4 | Reload page. Watch console. | Log shows initial vehicle count. Markers appear within seconds. (AC3.9) |
| 2.5 | Watch 2-3 minutes during MBTA service hours. | New vehicles appear, vehicles move, vehicles disappear when out of service. (AC3.10) |

## Phase 3: Vehicle Animation Math (AC2 partial)

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Zoom in close on a moving vehicle. Watch over several updates. | Smooth glide (~800ms ease-out). No teleporting. (AC2.4) |
| 3.2 | Code inspect: `src/vehicles.js` onUpdate function for haversineDistance > snapThreshold. | Distances >100m set animationDuration = 0 (snap). (AC2.7) |
| 3.3 | Code inspect: `src/vehicle-math.js` lerpAngle function. | Normalizes angles, shortest arc, result in [0, 360). (AC2.8) |

## Phase 4: Vehicle Markers on Map (AC2)

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Look in downtown Boston / Kenmore area. | Green-tinted arrows on/near Green Line routes. (AC2.1) |
| 4.2 | Zoom out to wider Boston. | Amber arrows on bus routes. Visually distinct from Green Line. (AC2.2) |
| 4.3 | Observe several markers. | Arrows point in travel direction. Rotate on curves. (AC2.3) |
| 4.4 | Disconnect network, then reconnect. | On reset, markers fade in over ~200ms. (AC2.5) |
| 4.5 | Watch during end-of-service or extended period. | Exiting vehicles fade out over ~200ms. (AC2.6) |

## Phase 5: Route Polylines (AC7.4, AC7.5)

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | DevTools > Network. Reload. | One `/routes` request with shapes include. Polylines appear. (AC7.4) |
| 5.2 | Wait 3-5 minutes. Check Network. | No additional `/routes` requests. (AC7.4) |
| 5.3 | Check Network for `/stops` request. | Single request. Console shows cached stop count. (AC7.5) |

## Phase 6: Route Highlighting (AC4)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Clear localStorage. Reload. | Green-E checked by default. Brighter/thicker polyline. Larger markers with glow. (AC4.1) |
| 6.2 | Check Green-B, Green-C, Green-D individually. | Each branch's polyline highlights (weight 5, opacity 0.9). Markers enlarge with glow. (AC4.2, AC4.5) |
| 6.3 | Check a bus route. | Bus polyline highlights. Bus vehicles show larger markers with glow. (AC4.3) |
| 6.4 | Check Green-E and a bus route simultaneously. | Both highlighted. Both vehicle sets enlarged with glow. (AC4.4) |
| 6.5 | Compare highlighted vs non-highlighted markers. | Highlighted: 28px. Normal: 24px. (AC4.6) |
| 6.6 | Zoom in on highlighted marker. | Pulsing glow animation (~2s cycle). (AC4.7) |
| 6.7 | Check Network for `/routes` request. | Route list from API, not hardcoded. (AC4.8) |
| 6.8 | Code inspect `src/ui.js` initUI. | Built from routeMetadata parameter. No hardcoded route names. (AC4.9, AC4.12) |
| 6.9 | Check `config.example.js` routes.defaultHighlighted. | Contains `['Green-E']`. Configurable. (AC4.12) |
| 6.10 | Check/uncheck routes. DevTools > Application > Local Storage. | Key `ttracker-highlighted-routes` matches checkbox state. (AC4.10) |
| 6.11 | Select non-default routes. Close tab. Reopen. | Same routes restored. (AC4.11) |

## Phase 7: Mobile and Responsive (AC5, AC2.9, AC2.10)

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Set viewport to 390px. | Panel hidden. Toggle button in top-right. (AC5.3) |
| 7.2 | Tap toggle button. | Drawer slides in. Touch targets >= 44px tall. (AC5.3) |
| 7.3 | Tap backdrop outside drawer. | Drawer closes. (AC5.3) |
| 7.4 | Test at 390x844, 768x1024, 1400x900. | Layout adapts at all breakpoints. (AC5.7) |
| 7.5 | DevTools > Performance. Record. Switch tabs 10s. Switch back. Stop. | No rAF callbacks while hidden. Smooth resume, no catch-up jump. (AC2.9) |
| 7.6 | Zoom tight. Record Performance. | DOM updates proportional to visible vehicles. (AC2.10) |

## Phase 8: Error Handling and Polish (AC3.5-3.8, AC5.4-5.6, AC7.1-7.3, AC7.7)

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Observe status indicator (bottom-left). | Green dot, "Live" text. (AC7.2) |
| 8.2 | Disconnect network. Watch console. | Amber dot, "Reconnecting..." Delays: ~1s, 2s, 4s, 8s, 16s, 30s (capped). (AC3.5, AC3.6, AC7.2) |
| 8.3 | Reconnect network. | Green dot, "Live". Backoff resets. (AC3.5, AC3.6) |
| 8.4 | While disconnected, observe status text. | Human-readable message, no raw Error objects. (AC7.1) |
| 8.5 | Block `*.basemaps.cartocdn.com` in DevTools. Zoom/pan. | User-friendly tile error message. (AC1.5) |
| 8.6 | Code inspect `src/api.js` reset/add/update handlers. | All JSON.parse in try/catch. App continues after parse error. (AC3.7) |
| 8.7 | Code inspect `src/api.js` error handler. | Rate-limit detection, aggressive backoff, no crash. (AC3.8) |
| 8.8 | Console: `const v = (await import('./src/vehicles.js')).getVehicles(); v.values().next().value` | Vehicle has lat/lng AND stopId, currentStopSequence, currentStatus. (AC5.4) |
| 8.9 | Code inspect `src/api.js`. | Exports apiEvents EventTarget. Events dispatched for all vehicle types. (AC5.5, AC5.6) |
| 8.10 | Code inspect `src/vehicles.js`. | Does not import map.js. Uses callbacks. Renderer-agnostic. (AC5.5) |
| 8.11 | Inspect all UI elements. | Dark backgrounds, light text. No unstyled bright elements. (AC7.3) |
| 8.12 | Hard-reload with Network tab open. | First vehicle marker < 3 seconds on broadband. (AC7.7) |

## Cross-Browser Verification (AC1.4, AC5.1, AC5.2)

| Step | Action | Expected |
|------|--------|----------|
| CB.1 | Repeat steps 1.1, 2.1, 2.3, 6.1, 8.1 in Firefox. | All functional. No browser-specific errors. (AC5.1) |
| CB.2 | Repeat same steps in Edge. | Same results. (AC5.1) |
| CB.3 | Mobile device or 390x844 emulation. | Fully functional on mobile. (AC1.4, AC5.2) |

## End-to-End: Fresh User Experience

1. Clear all browser data for localhost:8000.
2. Open `http://localhost:8000`.
3. Map loads dark-themed, centered on Boston, zoom 12. Status: "Connecting..." then green "Live".
4. Within 3 seconds: vehicle markers appear (green for Green Line, amber for buses).
5. Green-E highlighted by default (brighter polyline, larger markers with glow).
6. Open route panel. Check Green-B. Both Green-B and Green-E highlighted.
7. Zoom in on moving vehicle. Smooth interpolation, not teleporting.
8. Disconnect network. Status: amber "Reconnecting..." with increasing delays.
9. Reconnect. Status: green "Live". Vehicles resume.
10. Resize to 390px. Toggle button appears. Drawer slides in/out.
11. Close tab. Reopen. Green-B and Green-E still highlighted (localStorage).

## End-to-End: Architecture Resilience

1. In console:
   ```js
   const { apiEvents } = await import('./src/api.js');
   apiEvents.addEventListener('vehicles:update', (e) => console.log('Custom:', e.detail.id));
   ```
2. Confirm both map updates and custom listener fire on each SSE event.
3. Validates AC5.5, AC5.6: multiple renderers can subscribe independently.

## Traceability Matrix

All 55 acceptance criteria (AC1.1-AC1.6, AC2.1-AC2.10, AC3.1-AC3.10, AC4.1-AC4.12, AC5.1-AC5.7, AC6.1-AC6.5, AC7.1-AC7.7) are mapped to at least one manual verification step above. Supplementary automated tests in `tests/` validate underlying pure-function logic but do not replace manual verification.
