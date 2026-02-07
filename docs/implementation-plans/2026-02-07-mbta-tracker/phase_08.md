# MBTA Real-Time Transit Tracker Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 8 phases from original design (phases 1-8)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements:

### mbta-tracker.AC3: Stream live data via SSE
- **mbta-tracker.AC3.6 Failure:** Connection status shows "reconnecting" during network outage
- **mbta-tracker.AC3.8 Failure:** Rate limit (429) triggers user warning but app continues

### mbta-tracker.AC5: Cross-platform support (desktop, mobile, Stream Deck-ready)
- **mbta-tracker.AC5.4 Success:** Vehicle data includes geographic (lat/lng) and topological (stop-sequence) information
- **mbta-tracker.AC5.5 Success:** Data layer is renderer-agnostic (MapRenderer for web, RibbonRenderer for Stream Deck)
- **mbta-tracker.AC5.6 Success:** api.js emits events that multiple renderers can subscribe to

### mbta-tracker.AC7: Cross-Cutting Behaviors
- **mbta-tracker.AC7.1:** All MBTA API errors include user-friendly messages (no raw error objects shown)
- **mbta-tracker.AC7.2:** Connection status indicator visible in UI (green/amber/red states)
- **mbta-tracker.AC7.3:** Dark theme applied consistently across all UI elements
- **mbta-tracker.AC7.5:** Stop data fetched and cached on startup for future use
- **mbta-tracker.AC7.6:** No console errors during normal operation
- **mbta-tracker.AC7.7:** Application startup completes within 3 seconds on broadband connection

---

<!-- START_TASK_1 -->
### Task 1: Add connection status indicator and error handling to api.js

**Files:**
- Modify: `src/api.js` — emit connection status events, detect 429 rate limiting, improve error messages
- Modify: `index.html` — add `<div id="status"></div>` element for connection indicator and wire status event listener
- Modify: `styles.css` — add status indicator styling (green/amber/red states with animations)

**Implementation:**

**Updates to `src/api.js`:**

1. Add a new event type emitted on `apiEvents`: `connection:status`
   - Event detail shape: `{ state: 'connected' | 'reconnecting' | 'error', message: string }`
   - Emit `{ state: 'reconnecting', message: 'Connecting...' }` when first opening EventSource
   - Emit `{ state: 'connected', message: 'Live' }` when first SSE event arrives successfully (reset backoff)
   - Emit `{ state: 'reconnecting', message: 'Reconnecting in Ns...' }` on EventSource error, showing current backoff delay
   - Emit `{ state: 'error', message: 'Rate limited — retrying...' }` if rate limiting detected (429)
   - Emit `{ state: 'error', message: 'Connection failed' }` on persistent failures (after max backoff reached multiple times)

2. **429 rate limit detection:** EventSource doesn't expose HTTP status codes directly. However, if the connection closes immediately after opening (error fires within ~1 second of open), and this happens repeatedly, treat it as a likely rate limit. Increase backoff more aggressively (double the max temporarily). Emit warning status but don't crash.

3. **Malformed JSON handling (AC3.7):** Already wrapped in try/catch from Phase 2. Add a parse error counter. If more than 5 parse errors occur within 30 seconds, emit a warning status: `{ state: 'error', message: 'Data format errors' }`. Reset counter on successful parse.

4. **All errors user-friendly (AC7.1):** Never expose raw error objects in status messages. Always provide a human-readable message. Log technical details to console for debugging.

**Add to `index.html` body:**
```html
<div id="status" class="connection-status">
    <span class="status-dot"></span>
    <span class="status-text">Connecting...</span>
</div>
```

**Wire in `index.html` module script:**
```javascript
const statusEl = document.getElementById('status');
const statusDot = statusEl.querySelector('.status-dot');
const statusText = statusEl.querySelector('.status-text');

apiEvents.addEventListener('connection:status', (e) => {
    const { state, message } = e.detail;
    statusEl.className = `connection-status connection-status--${state}`;
    statusText.textContent = message;
});
```

**Add to `styles.css`:**
```css
.connection-status {
    position: fixed;
    bottom: 10px;
    left: 10px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(22, 33, 62, 0.9);
    border: 1px solid #0f3460;
    border-radius: 20px;
    font-size: 12px;
    color: #c0c0d0;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #888;
    flex-shrink: 0;
}

.connection-status--connected .status-dot {
    background: #00cc66;
}

.connection-status--reconnecting .status-dot {
    background: #ffaa00;
    animation: blink 1s ease-in-out infinite;
}

.connection-status--error .status-dot {
    background: #ff4444;
    animation: blink 0.5s ease-in-out infinite;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}
```

**Commit:** `feat: add connection status indicator with error state display`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Fetch and cache stop data on startup

**Files:**
- Modify: `src/map.js` — add `loadStops()` function to fetch and cache stop positions and metadata
- Modify: `index.html` — call `loadStops()` on startup in parallel with `loadRoutes()`

**Implementation:**

**Add to `src/map.js`:**

1. Module-level `let stopsData = new Map()` to cache stop information.

2. `loadStops()` — async function that:
   - Fetches `https://api-v3.mbta.com/stops?filter[route_type]=0,3&api_key=KEY` (from `config.api`)
   - Parses JSON:API response: for each stop in `data` array, extract:
     - `id` — stop identifier (e.g., "70098")
     - `name` — display name (e.g., "Park Street")
     - `latitude` — from `attributes.latitude`
     - `longitude` — from `attributes.longitude`
   - Stores in `stopsData` Map keyed by stop ID
   - Wrap in try/catch — log error but don't crash if stops fail to load (app works without stop data)
   - Log stop count to console for verification

3. `getStopData()` — export function returning the `stopsData` Map for consumers (future use: predictions, Stream Deck plugin)

**Update `index.html` module script:**
```javascript
// Load routes and stops in parallel on startup
Promise.all([loadRoutes(), loadStops()]).then(() => {
    const metadata = getRouteMetadata();
    initUI(metadata, setHighlightedRoutes);
});
```

Stop data changes infrequently — fetching once on startup and caching for the session is sufficient.

**Verification:**
1. Open in browser, check console for "Cached N stops" log message
2. Check Network tab — single request to `/stops` endpoint
3. No console errors if stops fail to load (degrade gracefully)

**Commit:** `feat: fetch and cache stop data on startup`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Expose topological position fields in vehicle data model

**Files:**
- Modify: `src/vehicles.js` — ensure topological fields from API data are preserved and exposed in vehicle state

**Implementation:**

The Phase 2 API parser (`parseVehicle()` in api.js) already extracts:
- `stopId` — current/next stop ID from `relationships.stop.data.id`
- `currentStopSequence` — from `attributes.current_stop_sequence`
- `currentStatus` — from `attributes.current_status` (STOPPED_AT, INCOMING_AT, IN_TRANSIT_TO)

This task ensures the Phase 3 vehicle state manager preserves these fields through the update cycle:

1. In `onReset()` and `onAdd()`: copy `stopId`, `currentStopSequence`, `currentStatus` from parsed vehicle data into VehicleState
2. In `onUpdate()`: update these fields along with position/bearing when SSE update arrives
3. These fields should be available via `getVehicles()` — any consumer (current: map renderer; future: Stream Deck ribbon renderer) can read them

The data layer is already renderer-agnostic (AC5.5, AC5.6):
- `apiEvents` emits events any renderer can subscribe to
- `getVehicles()` returns state with both geographic (lat/lng) and topological (stop-sequence) data
- No renderer-specific code in api.js or vehicles.js

**Verification:**

Expose `getVehicles` on `window` temporarily in `index.html` for debugging:
```javascript
import { getVehicles } from './src/vehicles.js';
window.debugGetVehicles = getVehicles;
```

Then in browser console:
```javascript
const v = debugGetVehicles();
const first = v.values().next().value;
console.log(first.stopId, first.currentStopSequence, first.currentStatus);
```

1. Verify vehicle objects include `stopId` (a string like "70204"), `currentStopSequence` (a number), `currentStatus` (one of STOPPED_AT, INCOMING_AT, IN_TRANSIT_TO)
2. Run the console check again after a few seconds — values should change as SSE updates arrive

**Step 4: Remove debug code**

Remove the `window.debugGetVehicles = getVehicles;` line from `index.html` before committing. Debug code must not ship.

**Commit:** `feat: expose topological position fields in vehicle data model`

<!-- END_TASK_3 -->

---

**Verifies:** None (infrastructure phase — verified operationally)

**AC7.7 startup timing verification:** Open DevTools Network tab, reload page. Measure time from navigation start to first vehicle marker appearing on map. Should complete within 3 seconds on broadband. The SSE connection starts in parallel with route/stop loading, so vehicle markers can appear even before route polylines finish loading.

**Phase done when:** Connection status indicator shows in UI bottom-left (green dot = connected, amber blinking = reconnecting, red = error). Vehicle data model includes topological fields (stopId, currentStopSequence, currentStatus) accessible via `getVehicles()`. API errors display user-friendly messages (no raw error objects). Rate limit triggers warning but app continues working. Stop data fetched and cached on startup. Application startup completes within 3 seconds on broadband (AC7.7). No console errors during normal operation.
