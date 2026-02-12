# T-Tracker Functional Specification

**Version:** 1.1
**Last updated:** 2026-02-11
**URL:** https://supertra.in (pending DNS propagation) / https://t-tracker.pages.dev

## Overview

T-Tracker is a real-time transit map for the Massachusetts Bay Transportation Authority (MBTA) network. It shows live vehicle positions on a dark-themed interactive map, with smooth animations as vehicles move along their routes. Users can filter which transit services are visible and hover over vehicles for trip details.

The app covers the full MBTA network: Subway (Red, Orange, Blue, Green Lines), Commuter Rail, Bus, and Ferry.

## Target Users

- MBTA riders checking where their train or bus is in real time
- Transit enthusiasts watching the network operate
- Anyone curious about Boston's transit system

The app works on desktop browsers and mobile devices. No account or installation required.

## Features

### F1. Interactive Map

The map fills the full browser viewport with a dark-themed basemap (CartoDB Dark Matter). Users can pan, zoom, and interact with the map using standard mouse/touch gestures.

- **Center:** Boston, MA (42.3601, -71.0589)
- **Zoom range:** 10 (metro area) to 18 (street level), default 12
- **Tile error handling:** If map tiles fail to load, the app silently retries with exponential backoff (1s, 2s, 4s, 8s, max 10s). No error message is shown to avoid cluttering the UI.

### F2. Live Vehicle Positions

Vehicles appear on the map as type-specific silhouette icons colored to match their route:

| Vehicle Type | Icon Shape | Example Routes |
|-------------|-----------|----------------|
| Trolley/Streetcar | Rounded body with pantograph | Green Line (B, C, D, E) |
| Subway Car | Boxy body with window band | Red, Orange, Blue Lines |
| Commuter Rail | Tall body with angled nose | All CR lines |
| Bus | Rounded top with windshield | All bus routes |
| Ferry | Boat hull with cabin | Harbor ferries |

Vehicle icons:
- Face the direction of travel (rotate based on bearing)
- Flip horizontally when heading left so wheels stay on the bottom
- Show pulsing directional indicators: white headlight at front (1.5s pulse cycle), red taillight at rear
- Fade in when they first appear on the network
- Fade out when they leave the network
- Animate smoothly between position updates (800ms interpolation with ease-out cubic easing)
- Snap instantly if they jump more than 100 meters (route reassignment, GPS correction)

### F3. Route Lines

Each route's path is drawn on the map as a colored polyline below the vehicle markers. Route name labels appear at intervals along the longest path segment, rotated to follow the line direction.

Route polylines are filtered to show only typical patterns (MBTA typicality=1), excluding detours, short-turns, and special service variations. Nearby route endpoints within 50 meters are snapped together to eliminate visual gaps at termini where inbound/outbound patterns meet.

Polyline thickness adapts to how many routes are visible:
- 1-4 routes: 5px (thick, for clarity)
- 5-15 routes: 3px (moderate)
- 16+ routes: 2px (thin, to reduce clutter)

### F4. Route Selection Panel

A control panel lets users choose which routes to display. The panel organizes routes into three collapsible groups:

1. **Subway** -- Heavy rail (Red, Orange, Blue in fixed order) with a Green Line subgroup (branches B, C, D, E sorted alphabetically)
2. **Bus** -- Sorted numerically (1, 2, 3...) then alphanumerically (CT1, SL1...)
3. **Commuter Rail** -- Sorted alphabetically by line name

Each group has a master toggle. Unchecking a group hides all its routes and collapses the list. Individual routes have their own checkboxes with color swatches.

**First visit defaults:** Subway on, Bus off, Commuter Rail off.

**Returning visits:** The app restores the previous selection from localStorage. Removed routes are silently dropped. New routes added by MBTA are automatically visible only if (1) their service type toggle is on AND (2) you already have at least one route from that service type visible. This prevents all bus routes from suddenly appearing when you check the Bus toggle for the first time.

**Responsive layout:**
- Desktop (768px+): Static panel in the top-right corner, max height 60% of viewport, scrollable
- Mobile (<768px): Slide-in drawer from the right edge, triggered by a hamburger button. Tapping a backdrop overlay or pressing Escape closes the drawer. Touch targets are 44px minimum.

### F5. Vehicle Hover Cards

Hovering over (desktop) or tapping (mobile) a vehicle icon shows a popup with:

- **Header:** Route color swatch, route name, vehicle number (e.g., "#3821")
- **Status:** Current activity with stop name (e.g., "Stopped at Park Street", "In transit to Harvard", "Approaching Downtown Crossing")
- **Details:** Direction (Inbound/Outbound), speed in mph, time since last update (e.g., "15s ago", "2m ago")

Sections with no data are omitted entirely (no empty rows). Popup content refreshes live while the popup is open. Commuter Rail shows the full line name (e.g., "Worcester/Framingham Line"); subway and bus show the short name for conciseness.

### F6. Connection Status

A pill-shaped indicator in the bottom-left corner shows the SSE connection state:

| State | Dot Color | Animation | Message Examples |
|-------|-----------|-----------|-----------------|
| Connected | Green | None | "Live" |
| Reconnecting | Yellow | Blink (1s) | "Connecting...", "Reconnecting in 4s..." |
| Error | Red | Fast blink (0.5s) | "Rate limited -- retrying...", "Data format errors" |

### F7. Performance

- Animation loop pauses when the browser tab is hidden (Page Visibility API) to save CPU
- Viewport culling: interpolation math is skipped for vehicles outside the current map view
- Popup content only refreshes when the vehicle's `updatedAt` timestamp changes (not every frame at 60fps)

## What T-Tracker Does Not Do

- No predictions or arrival times (only shows current positions)
- No trip planning or routing
- No alerts or service advisories
- No historical data or replay
- No user accounts or personalization beyond route selection
- No offline mode (requires live internet for SSE stream and map tiles)

## Data Source

All transit data comes from the [MBTA V3 API](https://api-v3.mbta.com), a free public API. The API key is required but free to obtain. Vehicle positions stream via Server-Sent Events (SSE) for real-time updates without polling.
