# Retrospective: PWA Notifications (2026-03-07)

## Scope
PRs #8 (PWA notifications) and #9 (SW SSE fix), 10 commits

## What Went Well
- PWA implementation was comprehensive — shipped in single PR
- Post-deploy SSE bug diagnosed and fixed within same session
- Platform-specific UI messaging (iOS, standalone, desktop) is user-friendly

## What Went Poorly
- SW fetch handler broke cross-origin SSE streams (post-deploy discovery)
- No SW tests existed — origin guard fix shipped without automated verification
- fireNotification() dual pathway (SW vs constructor) was untested
- Icon validation missing from build — broken PNGs would deploy silently
- Platform detection functions tested via inline reimplementation, not real code

## Mitigations Implemented

### Build-time gates (M1, M6)
- Icon validation: PNG magic bytes + minimum size check blocks broken icons
- SW verification: static analysis ensures fetch handler has origin guard

### New tests (M2, M3, M4, M5, M8)
- `tests/sw.test.js` — 8 tests for SW fetch handler origin guard
- `tests/fire-notification.test.js` — 6 tests for notification pathway selection
- `tests/sse-notification-integration.test.js` — 8 integration tests for full pipeline
- `tests/vehicles-state.test.js` — 8 tests for vehicle state management
- Exported isIOS/isStandalone and replaced 4 inline-reimplementation tests with 7 real function tests

### Code changes
- Extracted `selectNotificationPathway()` as testable pure function in notifications.js
- Exported `isIOS()` and `isStandalone()` from notification-ui.js
- Total: 37 new tests, 3 net new test files, 2 build-time validation steps
