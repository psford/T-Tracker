# Test Requirements — Vehicle Hover Cards

Generated from: `docs/design-plans/2026-02-07-vehicle-hover-cards.md`

## Automated Test Coverage

### vehicle-hover-cards.AC3: Popup content includes all required fields

| AC | Test | File |
|----|------|------|
| AC3.1 | `formatVehiclePopup` output contains vehicle label | `tests/vehicle-popup.test.js` |
| AC3.2 | `formatVehiclePopup` output contains route swatch with color and route name | `tests/vehicle-popup.test.js` |
| AC3.3 | `formatStatus('STOPPED_AT', 'Park Street')` → `'Stopped at Park Street'` | `tests/vehicle-popup.test.js` |
| AC3.4 | `formatVehiclePopup` output contains direction text | `tests/vehicle-popup.test.js` |
| AC3.5 | `formatSpeed(6.7056)` → `'15 mph'` | `tests/vehicle-popup.test.js` |
| AC3.6 | `formatTimeAgo` with recent ISO string → relative time string | `tests/vehicle-popup.test.js` |
| AC3.7 | `formatSpeed(null)` and `formatSpeed(0)` → `''` | `tests/vehicle-popup.test.js` |
| AC3.8 | `formatVehiclePopup` with null stopName omits stop from status | `tests/vehicle-popup.test.js` |
| AC3.9 | `formatStatus` tested for all three variants (STOPPED_AT, IN_TRANSIT_TO, INCOMING_AT) | `tests/vehicle-popup.test.js` |

### vehicle-hover-cards.AC6: Pure functions are unit-tested

| AC | Test | File |
|----|------|------|
| AC6.1 | `formatVehiclePopup` tested with complete vehicle data | `tests/vehicle-popup.test.js` |
| AC6.2 | `formatStatus` tested for all 3 variants ± stop name (6+ assertions) | `tests/vehicle-popup.test.js` |
| AC6.3 | `formatSpeed` tested for conversion, null, zero, negative | `tests/vehicle-popup.test.js` |
| AC6.4 | `formatTimeAgo` tested for seconds, minutes, hours ranges | `tests/vehicle-popup.test.js` |
| AC6.5 | All tests pass via `node tests/vehicle-popup.test.js` | `tests/vehicle-popup.test.js` |

## Manual Verification Required

The following ACs require browser-based manual verification (no automated tests):

| AC | Verification | Phase |
|----|-------------|-------|
| AC1.1 | Hover marker → popup opens | Phase 2 |
| AC1.2 | Mouse out → popup closes | Phase 2 |
| AC1.3 | Rapid hover across markers → no stale popups | Phase 2 |
| AC2.1 | Tap marker (mobile) → popup opens | Phase 2 |
| AC2.2 | Tap elsewhere → popup dismisses | Phase 2 |
| AC2.3 | Popup doesn't interfere with pan/zoom | Phase 2 |
| AC4.1 | Open popup, wait for SSE update → content changes | Phase 2 |
| AC4.2 | Relative time reflects latest updatedAt | Phase 2 |
| AC4.3 | Content doesn't flicker at 60fps (only updates on data change) | Phase 2 |
| AC5.1 | Popup background is dark | Phase 2 |
| AC5.2 | Text is light and readable | Phase 2 |
| AC5.3 | Tip/arrow matches dark background | Phase 2 |
| AC5.4 | Close button (if visible) styled dark | Phase 2 |
