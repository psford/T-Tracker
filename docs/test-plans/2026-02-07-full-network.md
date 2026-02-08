# Human Test Plan: Full MBTA Network Expansion

**Feature:** Expand T-Tracker from Green Line + Bus to the full MBTA rapid transit and commuter rail network

**Implementation plan:** `docs/implementation-plans/2026-02-07-full-network/`

**Branch:** `feature/full-network`

**Date:** 2026-02-07

**Automated test coverage:** 10 acceptance criteria are covered by automated unit tests across 3 test files (`tests/ui.test.js`, `tests/vehicles.test.js`, `tests/vehicle-popup.test.js`). Run all tests with:
```bash
node tests/vehicles.test.js && node tests/api.test.js && node tests/polyline.test.js && node tests/ui.test.js && node tests/vehicle-popup.test.js
```

**Human verification:** 43 acceptance criteria require manual browser testing, organized into 6 focused sessions below plus an end-to-end lifecycle test.

---

## Prerequisites

- App running: `python -m http.server 8000` from project root, open `http://localhost:8000`
- Browser DevTools available (Chrome/Edge recommended)
- Valid MBTA API key in `config.js`
- Clear localStorage before starting: `localStorage.clear()` in DevTools console

---

## Session 1: Data Expansion Verification

**Covers:** AC1.1, AC1.2, AC1.3, AC1.4, AC1.5, AC1.6, AC1.7

**Setup:** Clear localStorage. Open app with DevTools Network tab open.

### AC1.1 -- SSE connection includes all transit types
- [ ] Locate SSE connection in Network tab (EventSource request)
- [ ] Verify URL contains `filter%5Broute_type%5D=0%2C1%2C2%2C3`

### AC1.2 -- Heavy rail vehicle events arrive
- [ ] Observe vehicle markers appearing on Red, Orange, and Blue lines
- [ ] Hover over a Red/Orange/Blue vehicle to confirm routeId in popup

### AC1.3 -- Commuter rail vehicle events arrive
- [ ] Enable Commuter Rail in route panel
- [ ] Zoom out to see commuter rail coverage
- [ ] Verify CR vehicle markers appear on commuter rail lines
- [ ] Hover over a CR vehicle -- popup shows a `CR-` prefixed route

### AC1.4 -- Polylines load for all four transit types
- [ ] Verify Network tab shows `/routes` request with `filter%5Btype%5D=0%2C1%2C2%2C3`
- [ ] Verify polylines visible for: Green Line (type 0), Red/Orange/Blue (type 1), commuter rail extending beyond downtown (type 2), bus routes (type 3)

### AC1.5 -- Stop data loads for all transit types
- [ ] Verify Network tab shows `/stops` request with `filter%5Broute_type%5D=0%2C1%2C2%2C3`
- [ ] No console errors related to stop data
- [ ] Hover over a heavy rail or CR vehicle -- popup shows stop name if vehicle reports one

### AC1.6 -- Green Line and Bus unchanged
- [ ] Green Line branches display polylines and animated vehicle markers as before
- [ ] Bus routes display polylines and vehicle markers as before
- [ ] Toggle Green Line routes on/off -- behavior unchanged
- [ ] Hover over Green Line and bus vehicles -- popups display correctly

### AC1.7 -- Graceful degradation with missing transit types
- [ ] In DevTools, block a route type by editing fetch URL (remove type 2 from filter)
- [ ] Verify app loads without errors for remaining types
- [ ] (Automated partial: `tests/ui.test.js` covers empty group handling)

---

## Session 2: Three-Tier Toggle UI

**Covers:** AC2.1, AC2.2, AC2.3, AC2.4, AC2.5, AC2.10, AC2.11, AC2.12, AC2.13, AC2.14

**Setup:** Clear localStorage. Reload app.

### AC2.1 -- Three service type groups visible
- [ ] Route panel shows exactly three groups: "Subway", "Bus", "Commuter Rail" (in that order)

### AC2.2 -- Master toggle checkboxes
- [ ] Each group header has a checkbox
- [ ] Each master checkbox toggles independently

### AC2.3 -- Expand/collapse behavior
- [ ] Uncheck Subway master -- children collapse (hidden)
- [ ] Check Subway master -- children expand (visible)
- [ ] Repeat for Bus and Commuter Rail

### AC2.4 -- Master unchecked = collapsed + hidden from map
- [ ] With Subway visible, uncheck Subway master
- [ ] Children list collapses
- [ ] All subway polylines disappear from map
- [ ] All subway vehicle markers disappear from map

### AC2.5 -- Master checked = expanded, child state preserved
- [ ] Within Subway, uncheck Red Line
- [ ] Uncheck Subway master (collapses)
- [ ] Re-check Subway master
- [ ] Red Line checkbox still unchecked, Red not on map
- [ ] Other subway lines visible

### AC2.10 -- Individual route toggle
- [ ] Uncheck Red Line individually
- [ ] Red Line polyline disappears, vehicles disappear
- [ ] Re-check Red Line -- polyline and vehicles reappear
- [ ] Other subway lines unaffected

### AC2.11 -- Master toggle preserves child state
- [ ] Uncheck Red and Orange within Subway
- [ ] Uncheck Subway master (collapses)
- [ ] Re-check Subway master (expands)
- [ ] Red and Orange still unchecked
- [ ] Only Blue and Green lines visible on map

### AC2.12 -- Unchecking all children doesn't affect master
- [ ] Within Subway (master checked), uncheck every route (Green-B/C/D/E, Red, Orange, Blue)
- [ ] Subway master toggle remains checked
- [ ] Group remains expanded but no subway routes on map

### AC2.13 -- Mobile drawer works
- [ ] Switch to mobile viewport (390x844 in DevTools)
- [ ] Open route drawer
- [ ] Three service groups visible
- [ ] Expand/collapse works
- [ ] Touch targets adequate (44px minimum height)
- [ ] Close drawer -- map is interactive

### AC2.14 -- Scroll with all groups expanded
- [ ] Desktop viewport
- [ ] Expand all three groups
- [ ] Route panel scrolls to show all routes
- [ ] All routes accessible via scrolling
- [ ] No layout overflow or clipping

---

## Session 3: Visibility Model

**Covers:** AC3.1, AC3.2, AC3.3, AC3.4, AC3.5, AC3.6, AC3.7, AC3.8

**Setup:** Reload app with default state.

### AC3.1 -- Adaptive polyline weight
- [ ] With 2-3 routes visible, inspect SVG path `stroke-width` -- should be ~5px
- [ ] Toggle on 20+ routes -- polylines visibly thinner (~2px)

### AC3.2 -- Hidden routes fully removed
- [ ] Uncheck a route
- [ ] Polyline removed from map (not just dimmed)
- [ ] Vehicle markers removed
- [ ] Inspect Leaflet layer group -- no hidden layers for that route

### AC3.3 -- Toggle off is immediate
- [ ] With a route visible that has active vehicles
- [ ] Uncheck the route
- [ ] Polyline and vehicles disappear immediately (no fade, no animation)

### AC3.4 -- Toggle on is immediate
- [ ] Uncheck a route, then re-check it
- [ ] Polyline appears immediately
- [ ] Active vehicles appear on map

### AC3.5 -- No dim/bright distinction
- [ ] Multiple routes visible
- [ ] Inspect all polylines in DevTools
- [ ] All have identical `weight` and `opacity` values
- [ ] No route appears dimmer or brighter

### AC3.6 -- No pulsing glow
- [ ] Inspect any vehicle marker in DevTools Elements panel
- [ ] No `pulse-glow` animation
- [ ] No `drop-shadow` filter
- [ ] No `.vehicle-marker--highlighted` class anywhere
- [ ] Search styles.css -- `pulse-glow` does not exist

### AC3.7 -- Uniform marker size
- [ ] Inspect several vehicle markers in DevTools
- [ ] All 24x24px dimensions
- [ ] No size variation

### AC3.8 -- Adaptive weight thresholds
- [ ] Enable exactly 2 routes. Inspect `stroke-width` -- ~5
- [ ] Enable 10 routes total -- ~3
- [ ] Enable 20+ routes -- ~2
- [ ] Verify transitions at threshold crossings (4->5, 15->16)

---

## Session 4: Theme-Adapted Colors and Vehicle Types

**Covers:** AC4.4, AC4.6, AC4.7, AC4.8 (human portions), AC6.1, AC6.2, AC6.3, AC6.4, AC6.5

**Setup:** Enable all service types.

### AC4.4 -- Green Line retains original color
- [ ] Inspect Green Line polyline color in DevTools
- [ ] Compare with MBTA API color -- should match (no darkening)

### AC4.6 -- Bus routes retain original colors
- [ ] Inspect a bus polyline color
- [ ] Compare with MBTA API color -- should match (no darkening)

### AC4.7 -- Vehicle markers use route color
- [ ] Inspect a subway vehicle marker
- [ ] `--route-color` CSS variable matches darkened route color
- [ ] SVG fill uses this color
- [ ] Check Red, Orange, and Blue line vehicles

### AC4.8 -- Colors distinguishable at all zoom levels (human portion)
- [ ] At zoom 10: Red, Orange, Blue, Green, Purple polylines distinguishable
- [ ] At zoom 12: same check
- [ ] At zoom 14: same check

### AC6.1 -- Vehicle icon CSS classes by type
- [ ] Inspect subway vehicle marker -- class `vehicle-marker--subway`
- [ ] Inspect bus vehicle marker -- class `vehicle-marker--bus`
- [ ] Inspect CR vehicle marker -- class `vehicle-marker--commuter-rail`

### AC6.2 -- Subway vehicles use route color
- [ ] Red Line vehicles have red-tinted markers
- [ ] Orange Line vehicles have orange-tinted markers
- [ ] Blue Line vehicles have blue-tinted markers
- [ ] Green Line vehicles have green-tinted markers
- [ ] `--route-color` matches theme-darkened line color

### AC6.3 -- Commuter rail styling
- [ ] CR vehicle marker has class `vehicle-marker--commuter-rail`
- [ ] `--route-color` is darkened purple

### AC6.4 -- Bus vehicles retain existing styling
- [ ] Bus vehicle marker has class `vehicle-marker--bus`
- [ ] Same SVG arrow icon, same color application as pre-expansion

### AC6.5 -- Type detection uses metadata, not string matching
- [ ] Run: `grep -r "startsWith('Green-')" src/` -- zero matches in map.js
- [ ] Inspect `getVehicleIconHtml()` in map.js -- uses `routeTypeMap.get()`

---

## Session 5: Persistence

**Covers:** AC5.1, AC5.2, AC5.3, AC5.4, AC5.5, AC5.6

### AC5.4 -- First-visit defaults
- [ ] `localStorage.clear()` in DevTools console
- [ ] Reload app
- [ ] Subway master checked (expanded), all subway lines checked
- [ ] Bus master unchecked (collapsed)
- [ ] Commuter Rail master unchecked (collapsed)
- [ ] Map shows all subway lines, no buses, no commuter rail

### AC5.1 -- Service toggle persistence
- [ ] Check Bus master toggle
- [ ] DevTools Application > Local Storage: `ttracker-service-toggles` = `{"subway":true,"bus":true,"commuterRail":false}`
- [ ] Uncheck Bus
- [ ] Value updates to `{"subway":true,"bus":false,"commuterRail":false}`

### AC5.2 -- Route visibility persistence
- [ ] Uncheck Red Line within Subway
- [ ] `ttracker-visible-routes` no longer contains "Red"
- [ ] Re-check Red
- [ ] "Red" reappears in stored array

### AC5.3 -- State restores on reload
- [ ] Uncheck Orange and Blue
- [ ] Check Bus master toggle
- [ ] Reload page
- [ ] Orange and Blue unchecked, Bus expanded, Subway expanded
- [ ] Map shows Green Line branches + bus routes, not Orange or Blue

### AC5.5 -- Stale persisted routes silently ignored
- [ ] In console: `localStorage.setItem('ttracker-visible-routes', JSON.stringify(["Green-E","FAKE-ROUTE-999"]))`
- [ ] Reload
- [ ] No console errors
- [ ] Green-E visible, no checkbox for FAKE-ROUTE-999

### AC5.6 -- New routes default to on if service type is on
- [ ] In console: `localStorage.setItem('ttracker-visible-routes', JSON.stringify(["Green-E"]))`
- [ ] In console: `localStorage.setItem('ttracker-service-toggles', JSON.stringify({"subway":true,"bus":false,"commuterRail":false}))`
- [ ] Reload
- [ ] Green-E checked
- [ ] Red, Orange, Blue, Green-B/C/D (subway, not in stored state) default to visible/checked
- [ ] Bus routes remain hidden (service type off)

---

## Session 6: Cross-Cutting

**Covers:** AC7.1, AC7.2, AC7.3, AC7.4

### AC7.1 -- Startup within 3 seconds
- [ ] DevTools Performance tab
- [ ] Hard-reload (Ctrl+Shift+R)
- [ ] All polylines visible + SSE connected within 3 seconds
- [ ] Repeat 3 times

### AC7.2 -- No console errors
- [ ] DevTools Console (filter: Errors)
- [ ] Enable all three service types
- [ ] Let app run for 2 minutes
- [ ] Zero console errors
- [ ] Toggle routes on/off during this period -- no errors

### AC7.3 -- Mobile layout
- [ ] Mobile viewport (390x844)
- [ ] Open drawer, expand all groups
- [ ] Drawer doesn't overflow, content scrolls, touch targets adequate
- [ ] Backdrop closes drawer, map interactive after closing
- [ ] Repeat at tablet viewport (768x1024)

### AC7.4 -- Config structure preserved
- [ ] Review `config.example.js`
- [ ] `routes.defaultVisible` has subway line IDs
- [ ] `routeStyles` and `markerSize` sections removed
- [ ] All other config sections (`api`, `map`, `tiles`, `animation`) unchanged
- [ ] Same nested object pattern as before

---

## End-to-End Session Lifecycle Test

**Purpose:** Verify the complete user experience from first visit through ongoing use.

1. [ ] Clear all localStorage
2. [ ] Open app fresh -- subway visible, bus/CR hidden
3. [ ] Enable Bus and Commuter Rail
4. [ ] Uncheck Green-B and Orange Line
5. [ ] Close and reopen browser tab
6. [ ] Verify: Bus/CR enabled, Green-B and Orange unchecked, all other subway lines visible
7. [ ] Toggle routes rapidly (on/off/on) -- no visual glitches or errors
8. [ ] Zoom in/out across all zoom levels -- polylines and markers render correctly
9. [ ] Switch to mobile viewport -- drawer works, all groups accessible
10. [ ] Let app run for 5 minutes with all types enabled -- no console errors, vehicles animate smoothly

---

## Automated Test Summary

| Test File | ACs Covered |
|-----------|-------------|
| `tests/ui.test.js` | AC2.6, AC2.7, AC2.8, AC2.9, AC1.7 (partial) |
| `tests/vehicles.test.js` | AC4.1, AC4.2, AC4.3, AC4.5, AC4.8 (partial) |
| `tests/vehicle-popup.test.js` | AC6.6 |
| `tests/api.test.js` | Regression only (AC1.6) |
| `tests/polyline.test.js` | Regression only |

Generated with [Claude Code](https://claude.com/claude-code)
