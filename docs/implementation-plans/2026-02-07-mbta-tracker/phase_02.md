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
- **mbta-tracker.AC3.1 Success:** Application connects to MBTA `/vehicles` endpoint with SSE
- **mbta-tracker.AC3.2 Success:** Connection includes API key for 1000 req/min rate limit
- **mbta-tracker.AC3.3 Success:** Filter includes only route types 0 (light rail) and 3 (bus)
- **mbta-tracker.AC3.4 Success:** Vehicle positions update in real-time as SSE events arrive
- **mbta-tracker.AC3.5 Success:** Connection auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- **mbta-tracker.AC3.7 Failure:** Parse errors for malformed JSON events are logged but don't crash app
- **mbta-tracker.AC3.9 Edge:** Initial 'reset' event loads all active vehicles correctly
- **mbta-tracker.AC3.10 Edge:** 'add', 'update', 'remove' events correctly modify vehicle state

---

<!-- START_TASK_1 -->
### Task 1: Create src/api.js — SSE connection and JSON:API parsing

**Files:**
- Create: `src/api.js`
- Modify: `index.html` (update module import to wire up api.js for verification)

**Implementation:**

Create the MBTA API client module. Responsibilities:
1. Manage EventSource SSE connection to `/vehicles` endpoint
2. Parse MBTA's JSON:API format — flatten `data.attributes` + `data.relationships` into a simple vehicle object
3. Emit custom DOM events (`vehicles:reset`, `vehicles:add`, `vehicles:update`, `vehicles:remove`) on a shared EventTarget
4. Implement custom exponential backoff reconnection (1s, 2s, 4s, max 30s) — disable EventSource's default auto-reconnect by closing on error and reconnecting manually

The module exports:
- `apiEvents` — an EventTarget that consumers subscribe to
- `connect()` — starts the SSE connection
- `disconnect()` — closes the SSE connection

**Flattened vehicle object shape** (what consumers receive in `event.detail`):
```javascript
{
    id: 'G-10300',
    latitude: 42.3628,
    longitude: -71.0581,
    bearing: 160,
    currentStatus: 'INCOMING_AT',
    currentStopSequence: 30,
    directionId: 0,
    label: '3633-3868',
    speed: null,
    updatedAt: '2018-06-08T11:22:55-04:00',
    routeId: 'Green-E',
    stopId: '70204',
    tripId: '36420357',
}
```

**MBTA API details (from research):**

SSE endpoint URL:
```
https://api-v3.mbta.com/vehicles?api_key=KEY&filter[route_type]=0,3
```

Four SSE event types:
- `reset` — first event on connection, `data` is JSON array of vehicle objects
- `add` — new vehicle, `data` is single JSON:API vehicle object
- `update` — vehicle changed, `data` is single JSON:API vehicle object
- `remove` — vehicle gone, `data` is object with only `id` and `type`

JSON:API vehicle structure:
```json
{
    "type": "vehicle",
    "id": "G-10300",
    "attributes": {
        "bearing": 160,
        "current_status": "INCOMING_AT",
        "current_stop_sequence": 30,
        "direction_id": 0,
        "label": "3633-3868",
        "latitude": 42.36283874511719,
        "longitude": -71.05811309814453,
        "speed": null,
        "updated_at": "2018-06-08T11:22:55-04:00"
    },
    "relationships": {
        "route": { "data": { "id": "Green-E", "type": "route" } },
        "stop": { "data": { "id": "70204", "type": "stop" } },
        "trip": { "data": { "id": "36420357", "type": "trip" } }
    }
}
```

API key must be passed as query parameter (EventSource cannot set custom headers).

**Key implementation details:**

1. `parseVehicle(data)` function — extracts `attributes` fields (camelCase) and `relationships.*.data.id` into flat object
2. On `reset`: data is an array — parse each item, dispatch `vehicles:reset` with full array in `event.detail`
3. On `add`/`update`: data is single object — parse and dispatch `vehicles:add`/`vehicles:update`
4. On `remove`: data has only `id` — dispatch `vehicles:remove` with `{ id }` in `event.detail`
5. Wrap `JSON.parse` in try/catch — log malformed payloads to console without crashing (AC3.7)
6. On EventSource error: close connection, schedule reconnect with exponential backoff (1s initial, 2x multiplier, 30s max)
7. On successful connection (first event received): reset backoff delay to initial value
8. Export `apiEvents` as EventTarget for consumers to subscribe: `apiEvents.addEventListener('vehicles:update', handler)`

**Verification:**

Update the `<script type="module">` block in `index.html` to:
```html
<script type="module">
    import { initMap } from './src/map.js';
    import { connect, apiEvents } from './src/api.js';

    initMap('map');

    apiEvents.addEventListener('vehicles:reset', (e) => {
        console.log('Reset — vehicles:', e.detail.length);
    });
    apiEvents.addEventListener('vehicles:update', (e) => {
        console.log('Update:', e.detail.id, e.detail.latitude, e.detail.longitude);
    });

    connect();
</script>
```

Open in browser. Verify:
1. Console shows "Reset — vehicles: N" with a count of active vehicles
2. Console shows periodic "Update:" lines with vehicle IDs and positions
3. Disconnect network → console shows reconnection attempts with increasing delays
4. Reconnect network → stream resumes with a new reset event
5. No uncaught exceptions in console

**Commit:** `feat: add MBTA SSE streaming client with JSON:API parsing`

<!-- END_TASK_1 -->

---

**Verifies:** None (infrastructure phase — verified operationally via console output and network behavior)

**Phase done when:** Browser console logs vehicle update events with parsed data (id, lat, lng, bearing, route), SSE connection auto-reconnects on disconnect with exponential backoff (1s, 2s, 4s, max 30s).
