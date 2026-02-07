# Vehicle Hover Cards — Human Test Plan

Generated: 2026-02-07

## Prerequisites

- Python 3 installed (for `python -m http.server`)
- `config.js` in project root (copy from `config.example.js`, insert valid MBTA API key)
- Modern desktop browser (Chrome recommended for DevTools)
- Mobile device or Chrome DevTools device emulation
- All automated tests passing:
  ```
  node tests/vehicle-popup.test.js
  ```
- Local HTTP server running:
  ```
  cd T-Tracker
  python -m http.server 8000
  ```
- App accessible at `http://localhost:8000`
- Active MBTA service hours (vehicles must be reporting)

---

## Desktop Hover Interaction (AC1)

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open `http://localhost:8000` in Chrome. Wait for vehicle markers to appear. | Vehicle markers render. Green "Live" indicator in bottom-left. (AC1.1) |
| 1.2 | Hover the mouse cursor over any vehicle marker. | Dark-themed popup appears anchored to marker with: vehicle number, route swatch + name, status with stop, direction, speed (if moving), relative time. (AC1.1) |
| 1.3 | Move the mouse cursor off the vehicle marker. | Popup closes immediately. (AC1.2) |
| 1.4 | Rapidly sweep the mouse across 3-4 vehicle markers. | Each popup opens/closes in sequence. No stale popups remain. (AC1.3) |
| 1.5 | Hover over a marker, then move directly to an adjacent marker. | First popup closes, second opens. No overlap. (AC1.3) |

## Mobile/Touch Interaction (AC2)

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Toggle DevTools device toolbar (Ctrl+Shift+M). Select mobile preset (390x844). Reload. | Map renders at mobile viewport. Vehicle markers visible. (AC2.1) |
| 2.2 | Tap (click) on a vehicle marker. | Popup appears with same content as desktop. (AC2.1) |
| 2.3 | With popup open, tap on empty map area. | Popup dismisses. (AC2.2) |
| 2.4 | Tap a marker to open popup. Click-drag the map (pan gesture). | Map pans normally. Popup does not interfere. (AC2.3) |
| 2.5 | With no popup open, scroll to zoom. | Map zooms normally. No phantom popups. (AC2.3) |

## Live Content Refresh (AC4)

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Hover over a marker. Note the relative time (e.g., "5s ago"). Keep hovering 15-30 seconds. | Popup content updates in-place. Relative time resets on SSE update (e.g., "25s ago" → "2s ago"). (AC4.1, AC4.2) |
| 4.2 | Open popup on a vehicle "In transit to [stop]". Wait for arrival. | Status updates to "Stopped at [stop]" when vehicle status changes. (AC4.1) |
| 4.3 | DevTools > Performance tab. Record 10 seconds with popup open. | `setContent` fires 0-2 times (on data change), not 600 (per-frame). (AC4.3) |

## Dark Theme Styling (AC5)

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Hover over a marker. Inspect popup background. | Dark blue-gray background, NOT default white. (AC5.1) |
| 5.2 | Read popup text. | All text light-colored and readable. Route name bright, label muted gray. (AC5.2) |
| 5.3 | Inspect popup tip/arrow triangle. | Matches dark popup background color. No white triangle. (AC5.3) |
| 5.4 | Check for close button. | Close button either hidden (expected — `closeButton: false`) or styled dark if visible. (AC5.4) |

## End-to-End: Full Vehicle Popup Lifecycle

| Step | Action | Expected |
|------|--------|----------|
| E2E.1 | Open app. Wait for full load. Open DevTools Console. | No console errors. Green "Live" indicator. |
| E2E.2 | Console: `const v = (await import('./src/vehicles.js')).getVehicles(); console.log(v.values().next().value);` | Vehicle object has: label, routeId, currentStatus, directionId, speed, updatedAt, stopId. |
| E2E.3 | Hover over that vehicle. Compare popup to raw data. | Label, route, status, direction, speed (m/s→mph), time all match. |
| E2E.4 | Find a stopped vehicle (speed null/0). Hover over it. | No speed line shown. No "0 mph". |
| E2E.5 | Hard reload (Ctrl+Shift+R). Immediately hover a marker before stops load. | Status shows without stop name (e.g., "In transit"). After stops load, re-hover shows full status. |

## Traceability Matrix

All 28 acceptance criteria (AC1.1-AC1.3, AC2.1-AC2.3, AC3.1-AC3.9, AC4.1-AC4.3, AC5.1-AC5.4, AC6.1-AC6.5) are mapped to at least one verification step above. Automated tests in `tests/vehicle-popup.test.js` validate pure-function logic (AC3, AC6). Manual steps validate browser integration (AC1, AC2, AC4, AC5).
