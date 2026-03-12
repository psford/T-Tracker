# T-Tracker Technical Specification

**Version:** 1.3
**Last updated:** 2026-03-11

## Architecture Overview

T-Tracker is a pure client-side web application with zero server-side logic. It consists of vanilla ES6 modules loaded directly by the browser -- no bundler, no transpiler, no npm. The only external runtime dependency is Leaflet (loaded from CDN). All data comes from the MBTA V3 API.

```
Browser
  ├── index.html (entry point, wires modules)
  ├── styles.css (dark theme)
  ├── config.js (API key, settings -- gitignored)
  └── src/
       ├── api.js         SSE client, JSON:API parser
       ├── vehicles.js    State management, animation loop
       ├── vehicle-math.js    Pure math (lerp, easing, haversine, color, bearing)
       ├── vehicle-icons.js   SVG silhouette data (pure data, no logic)
       ├── map.js         Leaflet rendering, markers, polylines
       ├── ui.js          Route selection panel, localStorage
       ├── polyline.js    Google polyline decoder
       ├── route-sorter.js    Route grouping and sorting
       └── vehicle-popup.js   Popup HTML formatting
```

### Data Flow

```
MBTA API (SSE) → api.js (parse + validate) → vehicles.js (interpolate + animate)
                                                      ↓
                                                 vehicle-math.js (pure math)
                                                      ↓
                                              map.js (render + visibility)
                                                ↑               ↑
                                          ui.js (configure)  vehicle-icons.js (icon data)
```

1. `api.js` opens an SSE connection to the MBTA `/vehicles` endpoint
2. Incoming events (`reset`, `add`, `update`, `remove`) are parsed from JSON:API format into flat objects
3. `vehicles.js` manages a `Map<vehicleId, VehicleState>` and runs a `requestAnimationFrame` loop that interpolates positions between API updates
4. Each frame, `map.js` receives the full vehicles Map and reconciles it with Leaflet markers (create, update position/rotation, remove stale)
5. `ui.js` controls which routes are visible; `map.js` filters vehicles by route before rendering

### Module Dependency Graph

```
index.html
  ├── api.js ← config.js
  ├── vehicles.js ← config.js, vehicle-math.js
  ├── map.js ← config.js, polyline.js, vehicle-popup.js, vehicle-math.js, vehicle-icons.js
  └── ui.js ← route-sorter.js
```

No circular dependencies. Pure modules (`vehicle-math.js`, `vehicle-icons.js`, `polyline.js`, `route-sorter.js`, `vehicle-popup.js`) have no side effects and no imports from other application modules.

## Technology Stack

| Layer | Technology | Version | Source |
|-------|-----------|---------|--------|
| Language | JavaScript (ES6 modules) | ES2020+ | Native browser |
| Map | Leaflet | 1.9.4 | CDN (unpkg) with SRI hash |
| Basemap tiles | CartoDB Dark Matter | -- | cartocdn.com |
| Data API | MBTA V3 | v3 | api-v3.mbta.com |
| Streaming | Server-Sent Events (SSE) | -- | Native EventSource |
| Hosting | Cloudflare Pages | -- | Free tier |
| DNS | Cloudflare | -- | Free tier |
| Domain | supertra.in | -- | Registered at Hover |
| Tests | Node.js assert module | 18+ | `node --experimental-vm-modules` |

### What We Explicitly Do Not Use

- No npm, no package.json, no node_modules
- No bundler (Webpack, Vite, Rollup, esbuild)
- No framework (React, Vue, Angular, Svelte)
- No TypeScript
- No CSS preprocessor (Sass, Less, PostCSS)
- No server-side runtime (Node.js, Deno, Python backend)

## External Dependencies

### Runtime (Browser)

| Dependency | Purpose | Loaded From | Integrity |
|-----------|---------|-------------|-----------|
| Leaflet 1.9.4 CSS | Map styling | unpkg.com CDN | SRI hash in index.html |
| Leaflet 1.9.4 JS | Map rendering, markers, popups, polylines | unpkg.com CDN | SRI hash in index.html |
| CartoDB Dark Matter tiles | Basemap imagery | basemaps.cartocdn.com | Subdomains a-d |
| MBTA V3 API | Vehicle positions, routes, stops | api-v3.mbta.com | API key required |

### Build-Time (Cloudflare Pages)

| Dependency | Purpose |
|-----------|---------|
| Node.js (Cloudflare-provided) | Runs `build.js` |
| `fs`, `path` (Node built-ins) | File copy, config injection |

No external packages installed at build time.

### Development

| Tool | Purpose |
|------|---------|
| Python `http.server` | Local development server (any HTTP server works) |
| Node.js 18+ | Running unit tests |
| Git | Version control |

## MBTA API Integration

### Endpoints Used

| Endpoint | Method | Purpose | When |
|----------|--------|---------|------|
| `GET /vehicles?filter[route_type]=0,1,2,3,4` | SSE | Live vehicle positions | App startup (persistent connection) |
| `GET /routes?filter[type]=0,1,2,3,4&include=route_patterns.representative_trip.shape` | REST | Route metadata + polylines | App startup (one-time) |
| `GET /stops?filter[route_type]=0,1,2,3,4` | REST | Stop names for popups | App startup (one-time) |

### SSE Event Types

| Event | Payload | Handler |
|-------|---------|---------|
| `reset` | Array of all vehicles | Replace entire vehicle state |
| `add` | Single vehicle | Add to state |
| `update` | Single vehicle | Update position/metadata |
| `remove` | `{id}` | Begin fade-out, then delete |

### JSON:API Parsing

The MBTA API uses [JSON:API](https://jsonapi.org/) format. `api.js` flattens this at the boundary:
- `data.attributes.current_status` becomes `vehicle.currentStatus`
- `data.relationships.route.data.id` becomes `vehicle.routeId`
- Vehicles with null/NaN latitude or longitude are silently dropped

### Rate Limiting and Reconnection

- API allows 1,000 requests/minute with an API key
- SSE counts as 1 persistent request
- Startup fetches (routes + stops) use ~10 requests total
- On SSE error: exponential backoff starting at 1s, doubling to max 30s
- Rapid-close detection (connection dies within 1s, twice): likely rate limited, backoff multiplied by 4x
- Parse error tracking: 5+ parse errors in 30 seconds triggers error status

## Hosting and Deployment

### Infrastructure

```
GitHub (psford/T-Tracker)
    │
    │ push to master
    ▼
Cloudflare Pages (build)
    │ node build.js
    │ → copies files to dist/
    │ → injects MBTA_API_KEY into config.js
    ▼
Cloudflare CDN (serve)
    │ t-tracker.pages.dev
    │ supertra.in (custom domain)
    ▼
User's Browser
    │ loads index.html, CSS, JS
    │ opens SSE to api-v3.mbta.com
    ▼
MBTA API (data source)
```

### Build Process

`build.js` is a ~45-line Node.js script using only `fs` and `path`:

1. Reads `MBTA_API_KEY` from environment variable (fails if not set)
2. Cleans and creates `dist/` directory
3. Copies `index.html`, `styles.css` to `dist/`
4. Copies all `src/*.js` files to `dist/src/`
5. Reads `config.example.js`, replaces all occurrences of `YOUR_API_KEY_HERE` with the real key, writes to `dist/config.js`

### Environment Variables

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `MBTA_API_KEY` | Cloudflare Pages dashboard (encrypted) | Injected into config.js at build time |

### Deployment Trigger

Every push to the `master` branch triggers an automatic build and deploy on Cloudflare Pages. No manual deployment step required.

### Domain Configuration

| Domain | Provider | Purpose |
|--------|----------|---------|
| `t-tracker.pages.dev` | Cloudflare (automatic) | Default Pages URL |
| `supertra.in` | Hover (registration), Cloudflare (DNS) | Custom domain |

DNS management is transferred from Hover to Cloudflare. Hover's nameservers are replaced with Cloudflare's. Cloudflare provisions SSL automatically.

## Application State

### Client-Side State

| State | Location | Lifetime |
|-------|----------|----------|
| Vehicle positions | `vehicles.js` Map | Session (rebuilt from SSE on each visit) |
| Route metadata | `map.js` array | Session (fetched once on startup) |
| Stop data | `map.js` Map | Session (fetched once on startup) |
| Route visibility | localStorage (`ttracker-visible-routes`) | Persistent across visits |
| Service toggles | localStorage (`ttracker-service-toggles`) | Persistent across visits |
| Leaflet map instance | `map.js` variable | Session |
| Vehicle markers | `map.js` Map | Session |

### No Server-Side State

There is no database, no user accounts, no server. The MBTA API is the sole data source. The API key is the only secret, and it's visible in client-side JavaScript (acceptable for free MBTA keys).

## Animation System

### Interpolation

When a vehicle update arrives from the API, `vehicles.js` doesn't jump the marker to the new position. Instead:

1. The current interpolated position is saved as `prev*`
2. The new API position becomes the `target*`
3. Over the next 800ms, the position is interpolated from prev to target using ease-out cubic easing
4. If the distance exceeds 100m (GPS correction, route reassignment), the marker snaps instantly

### Bearing/Rotation

Vehicle icons face the direction of travel. `bearingToTransform()` converts a compass bearing (0-360) into CSS transform values:
- Bearings 0-180 (heading right/up): `rotate` only, no flip
- Bearings 180-360 (heading left/down): `scaleX(-1)` flip + adjusted rotation
- This keeps wheels on the bottom regardless of direction

### Lifecycle States

Each vehicle transitions through:
1. **Entering** -- fade in from 0 to 1 opacity over 200ms
2. **Active** -- full opacity, position interpolation
3. **Exiting** -- fade out from 1 to 0 opacity over 200ms, then removed

### Directional Indicators

Vehicle icons include pulsing headlights (white, front) and taillights (red, rear) to indicate direction of travel:
- Implemented via CSS `@keyframes` animations (1.5s cycle, ease-in-out)
- Headlight pulses between 100% and 40% opacity
- Taillight pulses between 90% and 30% opacity
- Class names `vehicle-headlight` and `vehicle-taillight` hook SVG circles to CSS animations

## Testing

### Test Framework

Tests use Node.js `assert` module with `--experimental-vm-modules` for ES module support. No test framework (Jest, Mocha, etc.).

### Test Coverage

| Test File | Module | Tests |
|-----------|--------|-------|
| `vehicles.test.js` | vehicle-math.js | lerp, easeOutCubic, lerpAngle, haversineDistance, darkenHexColor, bearingToTransform |
| `vehicle-icons.test.js` | vehicle-icons.js | All 5 icon types exist, use currentColor, are visually distinct, fallback works |
| `api.test.js` | api.js | parseVehicle (JSON:API flattening, null validation) |
| `polyline.test.js` | polyline.js | decodePolyline (Google encoding algorithm) |
| `ui.test.js` | route-sorter.js | groupAndSortRoutes (3-tier grouping, sorting rules) |
| `vehicle-popup.test.js` | vehicle-popup.js | formatStatus, formatSpeed, formatTimeAgo, formatVehiclePopup |

All pure functions have unit tests. Browser-dependent modules (`map.js`, `vehicles.js` animation loop, `ui.js` DOM manipulation) are tested via human test plans.

### Running Tests

```bash
node tests/vehicles.test.js
node tests/vehicle-icons.test.js
node tests/api.test.js
node tests/polyline.test.js
node tests/ui.test.js
node tests/vehicle-popup.test.js
```

## Notification Expiry

### Overview

Notification expiry is a four-phase feature that introduces countdown-based notification pairs with progressive UI integration. Users select a count (1, 2, 3, custom, or unlimited) when creating an alert, and the pair auto-deletes when remaining count reaches 0, with immediate UI updates.

### Data Model

Each notification pair stores `remainingCount` (number of alerts left) and `totalCount` (original count selected):

```javascript
{
  id: string,                    // unique identifier
  checkpointStopId: string,      // target stop
  routeId: string,               // route
  directionId: number,           // direction 0 or 1
  remainingCount: number | null, // null for unlimited, number for countdown
  totalCount: number | null      // original count for display
}
```

**localStorage format:** The config entry (`ttracker-notifications-config`) includes pairs with optional count fields:
```json
[
  {
    "id": "pair-1",
    "checkpointStopId": "70036",
    "routeId": "Red",
    "directionId": 0,
    "remainingCount": 2,
    "totalCount": 5
  },
  {
    "id": "pair-2",
    "checkpointStopId": "70086",
    "routeId": "1",
    "directionId": 1,
    "remainingCount": null,
    "totalCount": null
  }
]
```

### Chip Picker UI (Phase 2)

**Overview:** Phase 2 introduces a chip picker inline count selector for notification pair creation. Users tap a direction button in a stop popup to reveal a count picker, then tap a chip to create the alert with that count.

**Pure HTML generation:** `stop-popup.js` exports `buildChipPickerHtml(stopId, routeId, directionId)` — a pure function that generates the chip picker HTML structure without side effects.

**Event delegation:** `stop-markers.js` handles all chip picker interactions via event delegation on the popup `popupopen` Leaflet event:
- Direction button tap (`data-action="show-chips"`) inserts chip picker HTML below the button
- Chip tap updates the "Set Alert" button's `data-count` attribute and visual selection state
- Custom chip (#) reveals inline number input for 1-99
- "Set Alert" button tap calls `addNotificationPair()` with the selected count

**Centralized error handling:** Helper function `handleAlertResult()` encapsulates success/error flow after `addNotificationPair()`:
- Success: highlight stop marker, update notification status, render panel, close popup
- Error: display inline error message in popup

**Component structure:**
```html
<div class="chip-picker" data-stop-id="..." data-route-id="..." data-direction-id="...">
  <div class="chip-picker__chips">
    <button data-count="1" class="chip-picker__chip chip-picker__chip--selected">1</button>
    <button data-count="2" class="chip-picker__chip">2</button>
    <button data-count="3" class="chip-picker__chip">3</button>
    <button data-count="custom" class="chip-picker__chip">#</button>
    <button data-count="unlimited" class="chip-picker__chip">∞</button>
  </div>
  <div class="chip-picker__custom" style="display: none;">
    <input type="number" class="chip-picker__input" min="1" max="99" placeholder="1-99">
    <button class="chip-picker__confirm">OK</button>
  </div>
  <button class="chip-picker__create" data-action="create-alert" data-count="1">Set Alert</button>
</div>
```

**Two-tap alert creation flow:**
1. **Tap 1: Direction Button** — User taps "→ Downtown" or "→ Uptown" in stop popup, triggers `show-chips` event handler, inserts chip picker below button, collapses other open pickers
2. **Tap 2: Count Selection** — Tapping a standard chip (1/2/3) directly creates alert; tapping # reveals custom input for 1-99; tapping ∞ creates unlimited alert
3. **Alert Creation** — `handleAlertResult()` processes creation result

**CSS styling:** Chip picker follows dark theme (backgrounds #1a1a2e, borders #333, text #e0e0e0):
- `.chip-picker__chips` — flex row with 4px gap
- `.chip-picker__chip` — rounded button, transitions on hover/select
- `.chip-picker__chip--selected` — blue background (#4a9eff) with white text
- `.chip-picker__custom` — hidden by default, flex row for input + confirm button
- `.chip-picker__input` — number input with error state (red border on validation failure)
- `.chip-picker__create` — green "Set Alert" button (full width)

**Validation:** Custom count input validation rejects non-numeric, 0, negative, >99 values; adds error class to input border (red #ff6b6b); clears input and shows hint "1-99".

### Alerts Panel Editing (Phase 3)

**Count editing:** In the notification panel, users click on the count display ("3 remaining", "∞ unlimited") to reveal a chip picker for editing the pair's remaining count.

**Apply button:** After selecting a new count (standard, custom, or unlimited), the Apply button updates the pair's remaining count in localStorage and immediately rerenders the panel to reflect the change.

### Auto-Delete and Event Integration (Phase 4)

**Countdown mechanism:** When a matching vehicle is detected:
1. If `remainingCount` is null, the pair is unlimited — no decrement, never expires
2. If `remainingCount` is a number, it decrements by 1 after each notification
3. When `remainingCount` reaches 0, the pair is removed from the pairs array and localStorage
4. A `notification:pair-expired` CustomEvent is emitted to notify the UI

**Event flow on auto-delete:**
1. `checkAllPairs()` detects `remainingCount <= 0`
2. Pair is removed from pairs array
3. `writeConfig()` saves updated pairs to localStorage
4. `notification:pair-expired` event dispatched with `{pairId, checkpointStopId}` detail
5. Subscribed modules update their UI state

**UI integration:** Three modules listen for `notification:pair-expired`:
1. `stop-markers.js` — calls `refreshAllHighlights()` to unhighlight the stop marker if no other pairs remain for that stop
2. `notification-ui.js` — calls `updateStatus()` and `renderPanel()` to update the alerts panel and status indicator
3. No app-level listener needed — module-level event handlers manage the flow

**UI updates on expiry:**
- **Stop marker highlights:** When a pair expires, the stop marker is unhighlighted if it has no remaining configured pairs
- **Alerts panel:** The panel rerenders immediately to remove the expired pair entry; pair count ("X/5 alerts") updates
- **Status indicator:** The pair count in the status label updates (e.g., "Active: 4 alerts — Pause" when count drops from 5 to 4)

### Backward Compatibility

Existing pairs without count fields are automatically upgraded to unlimited (remainingCount=null, totalCount=null) on load with no user intervention. Users do not see any change in behavior — unlimited pairs continue to fire indefinitely as before.

## Security Considerations

- **API key exposure:** The MBTA API key is visible in client-side JavaScript. This is acceptable because MBTA keys are free and have no billing implications. The key is not committed to Git -- it's injected at build time from an encrypted Cloudflare environment variable.
- **XSS prevention:** `vehicle-popup.js` and `stop-popup.js` escape all user-facing strings (stop names, vehicle labels, direction labels) with `escapeHtml()` before HTML interpolation. `buildChipPickerHtml()` escapes stopId and routeId in data attributes.
- **CDN integrity:** Leaflet is loaded with Subresource Integrity (SRI) hashes to prevent CDN tampering.
- **No authentication:** The app has no user accounts, no server, no stored user data.

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 59 | Entry point, CDN links, module wiring |
| `styles.css` | 368 | Dark theme, responsive layout, all component styles |
| `config.example.js` | 32 | Configuration template (committed) |
| `config.js` | 32 | Configuration with real API key (gitignored) |
| `build.js` | 46 | Cloudflare Pages build script |
| `src/api.js` | 289 | SSE client, JSON:API parsing, reconnection |
| `src/vehicles.js` | 294 | Vehicle state, animation loop, viewport culling |
| `src/vehicle-math.js` | 107 | Pure math functions |
| `src/vehicle-icons.js` | 130 | SVG silhouette data |
| `src/map.js` | 579 | Leaflet rendering, markers, polylines, popups |
| `src/ui.js` | 365 | Route selection panel, localStorage |
| `src/polyline.js` | 50 | Google polyline decoder |
| `src/route-sorter.js` | 123 | Route grouping and sorting |
| `src/vehicle-popup.js` | 155 | Popup HTML formatting |
| `src/stop-popup.js` | 185 | Stop popup HTML formatting, chip picker generation |
| `src/stop-markers.js` | 419 | Stop marker rendering, notification config UI, event delegation |
| `src/notifications.js` | 421 | Notification pair management, permission handling, expiry logic |
| `src/notification-ui.js` | 312 | Notification status indicator, alerts panel |
| `src/route-stops-cache.js` | 89 | Route-stops mapping cache with localStorage TTL |
| `tests/` (12 files) | ~1,200 | Unit tests for pure functions and data modules |

**Total application code:** ~4,300 lines across 17 files (excluding tests and docs).

## Version History

| Date | Change |
|------|--------|
| 2026-02-07 | Initial build: map, SSE, vehicle markers, route lines, route panel, connection status |
| 2026-02-07 | Vehicle hover cards with stop names, speed, direction |
| 2026-02-07 | Full network expansion: bus, commuter rail, adaptive polyline weight, route labels |
| 2026-02-08 | Vehicle type icons: SVG silhouettes for trolley, subway, commuter rail, bus, ferry |
| 2026-02-09 | Cloudflare Pages deployment with build-time API key injection |
| 2026-02-11 | Bug fixes: tile retry backoff, route visibility logic, polyline typicality filtering, endpoint snapping, page load flash |
| 2026-02-11 | Feature: pulsing directional indicators (headlights/taillights) on vehicle icons |
| 2026-02-14 | Ferry service support: route type 4 (MBTA aqua #008EAA boat icon), Ferry group in UI (hidden by default), full API integration |
| 2026-03-05 | Notification expiry: countdown on fire, auto-delete at 0, chip picker UI for count selection, alerts panel count editing, pair-expired event integration, migration of existing pairs |
| 2026-03-11 | Stop marker merging: parent stations with 2+ child stops within 200m render as single merged marker; merged popup aggregates routes and alerts from all children; per-route-direction stopId routing for correct child stop alerts |
