# Vehicle Hover Cards Implementation Plan

**Goal:** Build a browser-based real-time MBTA transit visualizer using Leaflet and SSE streaming

**Architecture:** Pure ES6 modules (no build tools), Leaflet via CDN for map rendering, MBTA V3 API via SSE for live vehicle data, dark-themed CartoDB basemap

**Tech Stack:** Leaflet 1.9.4, ES6 modules, MBTA V3 API (SSE), CartoDB Dark Matter tiles

**Scope:** 2 phases from design (phases 1-2)

**Codebase verified:** 2026-02-07

---

## Acceptance Criteria Coverage

This phase implements:

### vehicle-hover-cards.AC3: Popup content includes all required fields
- **vehicle-hover-cards.AC3.1 Success:** Popup displays vehicle label (e.g., "3821")
- **vehicle-hover-cards.AC3.2 Success:** Popup displays route name with a color swatch matching route color
- **vehicle-hover-cards.AC3.3 Success:** Popup displays status with stop name (e.g., "Stopped at Park Street")
- **vehicle-hover-cards.AC3.4 Success:** Popup displays direction as "Inbound" or "Outbound"
- **vehicle-hover-cards.AC3.5 Success:** Popup displays speed in mph when speed is available and non-zero
- **vehicle-hover-cards.AC3.6 Success:** Popup displays relative update time (e.g., "15s ago")
- **vehicle-hover-cards.AC3.7 Edge:** Speed row omitted when speed is null or zero
- **vehicle-hover-cards.AC3.8 Edge:** Stop name omitted when stopsData hasn't loaded or stop ID not found
- **vehicle-hover-cards.AC3.9 Edge:** All three status variants render correctly

### vehicle-hover-cards.AC6: Pure functions are unit-tested
- **vehicle-hover-cards.AC6.1 Success:** `formatVehiclePopup()` tested with complete vehicle data
- **vehicle-hover-cards.AC6.2 Success:** `formatStatus()` tested for all three status variants with and without stop name
- **vehicle-hover-cards.AC6.3 Success:** `formatSpeed()` tested for m/s to mph conversion and null/zero handling
- **vehicle-hover-cards.AC6.4 Success:** `formatTimeAgo()` tested for seconds, minutes, and hours ranges
- **vehicle-hover-cards.AC6.5 Success:** Tests pass via `node tests/vehicle-popup.test.js`

---

<!-- START_TASK_1 -->
### Task 1: Add speed and updatedAt to vehicle state in vehicles.js

**Files:**
- Modify: `src/vehicles.js` — Add `speed` and `updatedAt` fields to `createVehicleState()` and `onUpdate()`

**Implementation:**

**IMPORTANT FINDING:** `api.js` already parses `speed` (from `attributes.speed`) and `updatedAt` (from `attributes.updated_at`) in `parseVehicle()` at line 92-93. However, `vehicles.js` does NOT store these fields in the vehicle state object. The popup needs these fields.

**Updates to `src/vehicles.js`:**

1. In `createVehicleState()` function (currently at line 19-42), add two new fields after line 38 (`label: vehicle.label,`):

```javascript
function createVehicleState(vehicle, duration) {
    return {
        // ... existing fields ...
        label: vehicle.label,
        speed: vehicle.speed ?? null,
        updatedAt: vehicle.updatedAt ?? null,
        state: 'entering',
        opacity: 0,
    };
}
```

2. In `onUpdate()` function (currently at line 67-118), add to the "Update metadata" block after line 113 (`existing.label = vehicle.label;`):

```javascript
    // Update metadata
    existing.routeId = vehicle.routeId;
    existing.currentStatus = vehicle.currentStatus;
    existing.stopId = vehicle.stopId;
    existing.currentStopSequence = vehicle.currentStopSequence;
    existing.directionId = vehicle.directionId;
    existing.label = vehicle.label;
    existing.speed = vehicle.speed ?? null;
    existing.updatedAt = vehicle.updatedAt ?? null;
```

**Verification:**
1. No test needed — this is a data passthrough (parseVehicle already tested in api.test.js)
2. Verify the app still loads without console errors by checking it in the browser

**Commit:** `feat: add speed and updatedAt to vehicle state`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create src/vehicle-popup.js with pure formatting functions

**Files:**
- Create: `src/vehicle-popup.js` — Pure formatting functions for popup content

**Implementation:**

Create `src/vehicle-popup.js` with four exported pure functions. No imports needed — all data passed as arguments. No DOM access, no Leaflet dependency.

**`formatStatus(currentStatus, stopName)`**
- Takes `currentStatus` (string: `'STOPPED_AT'`, `'IN_TRANSIT_TO'`, `'INCOMING_AT'`, or null) and `stopName` (string or null)
- Returns human-readable status string
- Mapping:
  - `'STOPPED_AT'` + stopName → `'Stopped at Park Street'`
  - `'STOPPED_AT'` + null → `'Stopped'`
  - `'IN_TRANSIT_TO'` + stopName → `'In transit to Park Street'`
  - `'IN_TRANSIT_TO'` + null → `'In transit'`
  - `'INCOMING_AT'` + stopName → `'Approaching Park Street'`
  - `'INCOMING_AT'` + null → `'Approaching'`
  - null/unknown → `''` (empty string)

**`formatSpeed(speedMs)`**
- Takes `speedMs` (number in meters/second, or null/undefined)
- Returns formatted string or empty string
- Conversion: mph = speedMs * 2.23694
- If speedMs is null, undefined, or ≤ 0: return `''`
- Otherwise: return `'${Math.round(mph)} mph'` (e.g., `'15 mph'`)

**`formatTimeAgo(updatedAt)`**
- Takes `updatedAt` (ISO 8601 string, or null)
- Returns relative time string
- If null: return `''`
- Calculate difference: `(Date.now() - new Date(updatedAt).getTime()) / 1000` → seconds
- Thresholds:
  - < 60s: `'${Math.round(seconds)}s ago'`
  - < 3600s: `'${Math.round(seconds / 60)}m ago'`
  - else: `'${Math.round(seconds / 3600)}h ago'`
- If result is negative or NaN (invalid date): return `''`

**`formatVehiclePopup(vehicle, stopName, routeMeta)`**
- Takes:
  - `vehicle`: object with `{label, routeId, currentStatus, directionId, speed, updatedAt}`
  - `stopName`: string or null (already resolved from stopsData by caller)
  - `routeMeta`: object with `{shortName, color}` or null
- Returns HTML string for popup content
- Structure:

```html
<div class="vehicle-popup">
    <div class="vehicle-popup__header">
        <span class="vehicle-popup__swatch" style="background: #00843D"></span>
        <span class="vehicle-popup__route">Green-E</span>
        <span class="vehicle-popup__label">#3821</span>
    </div>
    <div class="vehicle-popup__status">Stopped at Park Street</div>
    <div class="vehicle-popup__details">
        <span>Outbound</span>
        <span>15 mph</span>
        <span>12s ago</span>
    </div>
</div>
```

- Header: color swatch (12×12 circle via inline style) + route short name + `#` + vehicle label
- Route name: use `routeMeta.shortName` if available, fall back to `vehicle.routeId`
- Route color: use `routeMeta.color` if available, fall back to `'#888888'`
- Status line: output of `formatStatus(vehicle.currentStatus, stopName)`. Omit `<div>` entirely if empty string.
- Details line: direction (`directionId === 0 ? 'Outbound' : 'Inbound'`), speed (from `formatSpeed`), time (from `formatTimeAgo`). Each wrapped in `<span>`. Omit empty spans. Omit entire `<div>` if all empty.
- If `vehicle.directionId` is null/undefined, omit direction span.

**Commit:** `feat: add vehicle-popup.js with pure formatting functions`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create tests/vehicle-popup.test.js with comprehensive unit tests

**Files:**
- Create: `tests/vehicle-popup.test.js` — Unit tests for all formatting functions

**Implementation:**

Follow the existing test pattern from `tests/vehicles.test.js`:
- Import from `../src/vehicle-popup.js`
- Use `import assert from 'assert'`
- Individual test functions called from `runTests()`
- Console log ✓ for each passing group

**Test functions to write:**

**`testFormatStatus()`** — Tests for `formatStatus()`:
1. `formatStatus('STOPPED_AT', 'Park Street')` → `'Stopped at Park Street'`
2. `formatStatus('IN_TRANSIT_TO', 'Kenmore')` → `'In transit to Kenmore'`
3. `formatStatus('INCOMING_AT', 'Boylston')` → `'Approaching Boylston'`
4. `formatStatus('STOPPED_AT', null)` → `'Stopped'`
5. `formatStatus('IN_TRANSIT_TO', null)` → `'In transit'`
6. `formatStatus('INCOMING_AT', null)` → `'Approaching'`
7. `formatStatus(null, 'Park Street')` → `''`
8. `formatStatus(undefined, null)` → `''`

**`testFormatSpeed()`** — Tests for `formatSpeed()`:
1. `formatSpeed(6.7056)` → `'15 mph'` (6.7056 m/s * 2.23694 ≈ 15)
2. `formatSpeed(0)` → `''`
3. `formatSpeed(null)` → `''`
4. `formatSpeed(undefined)` → `''`
5. `formatSpeed(-1)` → `''`
6. `formatSpeed(0.5)` → `'1 mph'` (0.5 * 2.23694 ≈ 1.12 → rounds to 1)

**`testFormatTimeAgo()`** — Tests for `formatTimeAgo()`:
1. ISO string 10 seconds ago → `'10s ago'`
2. ISO string 90 seconds ago → `'2m ago'` (90/60 = 1.5 → rounds to 2)
3. ISO string 7200 seconds ago → `'2h ago'`
4. `formatTimeAgo(null)` → `''`
5. `formatTimeAgo('invalid-date')` → `''`

For time-dependent tests, construct the ISO string dynamically:
```javascript
const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
assert.strictEqual(formatTimeAgo(tenSecondsAgo), '10s ago');
```

**`testFormatVehiclePopup()`** — Tests for `formatVehiclePopup()`:
1. Full vehicle data: verify HTML contains all expected elements (swatch, route name, label, status, direction, speed, time)
2. Missing speed (null): verify no speed span in output
3. Missing stopName (null): verify status shows without location
4. Missing routeMeta (null): verify fallback to vehicle.routeId and gray color
5. Missing directionId (null): verify no direction span

Use `String.includes()` for HTML content assertions rather than exact matching (HTML structure may vary slightly).

**Run tests:**
```bash
node tests/vehicle-popup.test.js
```

**Commit:** `test: add unit tests for vehicle-popup formatting functions`

<!-- END_TASK_3 -->

---

**Phase done when:** All four formatting functions (`formatVehiclePopup`, `formatStatus`, `formatSpeed`, `formatTimeAgo`) produce correct output for all status variants, null/missing data, speed conversion, and relative time. `speed` and `updatedAt` propagated through vehicle state. All tests pass via `node tests/vehicle-popup.test.js`. No console errors in browser.
