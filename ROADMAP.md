# T-Tracker Roadmap

**Purpose:** Lightweight tracker for enhancement ideas and future features. For detailed design work, use the `/ed3d-plan-and-execute:start-design-plan` skill workflow.

**Last updated:** 2026-02-12

---

## Status Legend
- 🎯 **Planned** — Prioritized for implementation
- 💭 **Idea** — Potential enhancement, needs evaluation
- ⏸️ **Paused** — Started but blocked/deprioritized
- ✅ **Done** — Completed and deployed

---

## Planned Features

### 🎯 Train Arrival Notifications
**Status:** Paused (design phase)
**Design doc:** [docs/design-plans/2026-02-11-notifications-paused.md](docs/design-plans/2026-02-11-notifications-paused.md)

Notify users when trains approach their station (e.g., "2 stops away"). Requires:
- Station selection/tracking
- Prediction logic
- Notification system (browser/SMS/push)
- User preferences

**Open questions:** Backend vs client-only? Web Notifications vs push? All services or CR-only?

---

## Ideas & Enhancements

### 💭 Route-Aware Continuous Motion
Vehicles should move continuously along route paths at realistic speeds, not just interpolate between discrete API updates. Currently vehicles "wait then slide" every 10-30 seconds when position updates arrive from MBTA API.

**Full implementation requirements:**
- Route path following: animate along actual polyline paths, not straight lines
- Speed-based extrapolation: use reported speed to calculate position between updates
- ETA integration: use MBTA predictions API to know when vehicles reach stops
- Stop behavior: decelerate approaching stops, dwell, then accelerate away
- Fallback handling: gracefully handle missing speed/prediction data

**Considerations:** High complexity, requires careful GPS drift vs predicted position handling, performance impact of path-following for 100+ vehicles, may need server-side component for prediction caching

**Note:** Speed-based extrapolation prototype (simpler approach) in development

### 💭 Historical Playback
Record vehicle positions over time and allow users to "replay" a day's transit activity. Could help visualize service patterns, delays, or rush hour flows.

**Considerations:** Storage requirements, privacy implications, data retention policy

### 💭 Route Performance Metrics
Show stats per route: average speed, on-time percentage, headway distribution, service frequency by time of day.

**Considerations:** Requires historical data collection, aggregation logic, UI for displaying metrics

### 💭 Trip Planning Integration
Let users select origin/destination and show which vehicles will get them there, with transfer points highlighted on map.

**Considerations:** Significant scope increase, overlaps with existing MBTA trip planners, may duplicate functionality

### 💭 Accessibility Features
- High contrast mode toggle
- Screen reader optimization for vehicle popups
- Keyboard navigation for route selection
- Larger touch targets option

**Considerations:** Testing requirements, WCAG 2.1 AA compliance verification

### 💭 Service Alerts Overlay
Display MBTA service advisories on map (delays, detours, station closures) as overlays or banner notifications.

**Considerations:** MBTA V3 Alerts API integration, how to surface alerts without cluttering map

---

## Recently Completed

### ✅ Smooth Vehicle Animation
**Completed:** 2026-02-07 (initial implementation)
Vehicles interpolate smoothly between position updates using ease-out cubic easing over 800ms. Positions >100m apart snap instantly (GPS corrections).

### ✅ Movement-Based Bearing Calculation
**Completed:** 2026-02-12
Vehicle icons now calculate rotation from actual movement direction (from current position to target position) instead of using potentially stale API bearing values. Icons accurately align with tracks. Stopped vehicles (<1m movement) preserve previous bearing to avoid vertical orientation.

### ✅ Pulsing Directional Indicators
**Completed:** 2026-02-11
Vehicle icons show pulsing white headlights (front) and red taillights (rear) to indicate direction of travel. 1.5s CSS animation cycle with ease-in-out timing.

### ✅ Vehicle Type Icons
**Completed:** 2026-02-08
Type-specific SVG silhouettes for trolley, subway, commuter rail, bus, and ferry. Icons face direction of travel and flip horizontally when heading left.

---

## Notes

- **For formal design work:** Use `/ed3d-plan-and-execute:start-design-plan` skill to start structured design process
- **For quick fixes:** Branch from develop, commit directly, PR to main
- **Specs first:** Update FUNCTIONAL_SPEC.md and TECHNICAL_SPEC.md as you code
- **Completed features:** Move from "Planned" to "Recently Completed" with completion date and brief summary

---

## How to Use This File

1. **Adding ideas:** Drop them in "Ideas & Enhancements" section with 💭 emoji
2. **Promoting to planned:** Move to "Planned Features" section, change to 🎯 emoji, add any design doc links
3. **Pausing work:** Change to ⏸️ emoji, document why paused and what's needed to resume
4. **Completing work:** Move to "Recently Completed" with ✅ emoji and completion date
5. **Archiving:** After ~6 months, move completed items to version history in TECHNICAL_SPEC.md

This file is for **quick capture** of ideas. Detailed requirements, architecture, and implementation plans belong in `docs/design-plans/` and `docs/implementation-plans/`.
