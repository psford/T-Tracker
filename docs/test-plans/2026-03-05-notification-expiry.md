# Human Test Plan: Notification Expiry

**Feature:** Notification expiry — countdown on fire, auto-delete at 0, chip picker UI
**Generated:** 2026-03-05
**Automated Coverage:** 22/22 acceptance criteria have automated tests

## Prerequisites

- Local HTTP server running: `python -m http.server 8000` from project root
- Application accessible at `http://localhost:8000`
- `config.js` present with valid MBTA API key
- All automated tests passing:
  ```
  node tests/stop-popup.test.js
  node tests/notifications.test.js
  node tests/notification-ui.test.js
  ```
- Browser with notification permissions available (Chrome or Firefox recommended)
- Device or browser DevTools for mobile viewport testing (390x844)

## Phase 1: Chip Picker Creation Flow

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Navigate to `http://localhost:8000`. Wait for map to load with vehicle markers. | Map renders with dark theme, vehicles visible on subway lines. |
| 1.2 | Click a stop marker on the Red Line (e.g., Park Street). | Stop popup appears with stop name, route swatch, and direction buttons labeled with destinations (e.g., "Ashmont/Braintree" and "Alewife"). Buttons use `data-action="show-chips"`, not `set-alert`. |
| 1.3 | Click one direction button (e.g., "Ashmont/Braintree"). | Chip picker appears below the button with 5 chips: `1`, `2`, `3`, `#`, `∞`. Chip `1` is highlighted in blue (`#4a9eff`). A "Set Alert" button appears below the chips. |
| 1.4 | Click chip `3`. | Chip `3` becomes highlighted (blue). Chip `1` loses highlight. Only one chip is selected at a time. |
| 1.5 | Click "Set Alert" with chip `3` selected. | Alert is created. Browser prompts for notification permission if not yet granted. Stop marker becomes highlighted. Popup updates to show a configured indicator for that direction. |
| 1.6 | Re-open the same stop popup. Click the other direction button (e.g., "Alewife"). | First direction shows a configured indicator (not a button). Second direction shows a chip picker. Previous chip picker for first direction is not visible. |

## Phase 2: Custom Count Input

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open a stop popup, click a direction, then click the `#` chip. | Custom input area becomes visible with a number input (placeholder "1-99") and a confirm button. |
| 2.2 | Type `0` into the input and click the confirm button. | Input rejects the value. Input clears or shows an error style. No alert is created. |
| 2.3 | Type `-1` into the input. | Input rejects the value (HTML `min="1"` prevents negative, or validation catches it). |
| 2.4 | Type `abc` into the input. | Input rejects non-numeric value. No alert is created. |
| 2.5 | Type `100` into the input and attempt to confirm. | Input rejects the value (HTML `max="99"` or validation catches it). |
| 2.6 | Type `15` into the input and click confirm. | Alert is created with count 15. Stop marker highlights. |

## Phase 3: Countdown and Expiry

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Create a notification pair with count `1` on a busy Red Line stop (e.g., Downtown Crossing, direction toward Alewife). | Pair created. Status indicator shows 1 active pair. Alerts panel shows "1 remaining" for this pair. |
| 3.2 | Wait for a Red Line vehicle to arrive at the stop heading in the configured direction. | Browser notification fires. The alerts panel updates: pair row disappears (count reached 0, auto-deleted). Status indicator updates to show no active pairs. Stop marker returns to unhighlighted (default) style. |
| 3.3 | Create a notification pair with count `2`. Wait for one vehicle arrival. | Notification fires. Alerts panel now shows "1 remaining" (decremented from 2). Pair still exists. |
| 3.4 | Create an unlimited pair (select `∞` chip). Wait for a vehicle arrival. | Notification fires. Alerts panel still shows "∞ unlimited". Pair is not removed. |

## Phase 4: Alerts Panel Editing

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Open the alerts panel (notification bell/icon). Verify a counted pair is listed. | Panel shows pair with stop name, direction, route, and count text (e.g., "2 remaining"). |
| 4.2 | Tap/click the count text ("2 remaining"). | Inline chip picker appears within the panel row, showing `1`, `2`, `3`, `#`, `∞` chips. Current count chip is pre-selected. |
| 4.3 | Select `∞` from the inline chip picker and click Apply. | Count text changes to "∞ unlimited". Pair is now unlimited. |
| 4.4 | Tap the count text again, select `3`, click Apply. | Count text changes to "3 remaining". Pair is now counted with 3. |

## Phase 5: Migration

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | In DevTools Console, run: `localStorage.setItem('ttracker-notifications-config', JSON.stringify([{id:'test1',checkpointStopId:'place-pktrm',routeId:'Red',directionId:0}]))` then reload the page. | Application loads without errors. The existing pair appears in the alerts panel with "∞ unlimited" (migrated to unlimited). |

## End-to-End: Full Lifecycle of a Counted Notification

**Purpose:** Validates the complete flow from creation through decrement to auto-expiry (AC1, AC2, AC3, AC5).

1. Navigate to `http://localhost:8000`. Enable subway routes if not already visible.
2. Click a Red Line stop marker (e.g., Harvard). Click the "Alewife" direction button.
3. In the chip picker, select chip `2`. Click "Set Alert".
4. Verify: stop marker is highlighted, status indicator shows 1 pair, alerts panel shows "2 remaining".
5. Wait for first Red Line train heading toward Alewife to reach Harvard.
6. Verify: browser notification fires, alerts panel updates to "1 remaining", stop marker stays highlighted.
7. Wait for second train.
8. Verify: browser notification fires, pair disappears from alerts panel, stop marker unhighlights, status indicator updates.
9. Reopen the Harvard stop popup. The Alewife direction button should be available again (not showing configured indicator).

## End-to-End: Edit Count Before Expiry

**Purpose:** Validates that editing a count mid-lifecycle works correctly.

1. Create a pair with count `1` on a quiet stop (e.g., a commuter rail station with infrequent service).
2. Open the alerts panel. Tap the "1 remaining" text.
3. Change to `∞`. Verify text shows "∞ unlimited".
4. Close and reopen the panel. Verify "∞ unlimited" persisted (survived localStorage round-trip).
5. Change back to `2`. Wait for two vehicles to arrive. Verify auto-deletion after the second.

## Human Verification Required

| Criterion | Why Manual | Steps |
|-----------|------------|-------|
| AC1.6 (DOM validation) | DOM event handler rejects invalid input; HTML attributes alone are insufficient for edge cases | Steps 2.2-2.5: type `0`, `-1`, `abc`, `100` into custom input, verify each is rejected. |
| AC1.7 (direction switch collapses picker) | Leaflet popup DOM manipulation in event handler | Step 1.6: open stop popup with two unconfigured directions, tap first direction (picker appears), tap second direction (first picker gone, second visible). |
| AC3.2 visual (marker unhighlight) | Leaflet circle marker style change requires live map | Step 3.2: after count-1 pair expires, verify stop marker returns to default gray/unhighlighted style. |
| AC3.3 visual (panel update) | DOM panel rendering after expiry event | Step 3.2: after pair expires, verify the pair row disappears from the alerts panel without manual refresh. |
| AC3.4 visual (status indicator) | DOM element modified by `updateStatus()` | Step 3.2: after pair expires, verify status indicator updates to reflect no active pairs. |
| AC4.2 (inline chip picker in panel) | DOM click handler inserts chip picker in panel row | Step 4.2: tap count text in alerts panel, verify chip picker appears inline. |
| CSS rendering | Dark theme visual correctness | Verify chip picker in both stop popup and alerts panel: chips legible on dark background, selected chip is blue (`#4a9eff`), custom input is usable, buttons have adequate tap targets. Test at mobile (390x844) and desktop (1400x900). |

## Traceability

| Acceptance Criterion | Automated Test | Manual Step |
|----------------------|----------------|-------------|
| AC1.1 | `stop-popup.test.js` — `testBuildChipPickerHtml` (5 chips) | 1.3 |
| AC1.2 | `stop-popup.test.js` — `testBuildChipPickerHtml` (chip 1 selected) | 1.3 |
| AC1.3 | `notifications.test.js` — `testCountdownDecrement` | 1.5 |
| AC1.4 | `notifications.test.js` — `testUnlimitedPair` | 3.4 |
| AC1.5 | `stop-popup.test.js` — `testBuildChipPickerHtml` (custom input HTML) | 2.1 |
| AC1.6 | `stop-popup.test.js` — `testBuildChipPickerHtml` (min/max attrs) | 2.2-2.5 |
| AC1.7 | — | 1.6 |
| AC2.1 | `notifications.test.js` — `testCountdownDecrement` | 3.3 |
| AC2.2 | `notifications.test.js` — `testUnlimitedPair` | 3.4 |
| AC2.3 | `notifications.test.js` — `testPersistenceAfterDecrement` | E2E step 6 |
| AC2.4 | `notifications.test.js` — `testMultipleVehiclesDecrement` | — |
| AC3.1 | `notifications.test.js` — `testAutoDeletion` | 3.2 |
| AC3.2 | `notifications.test.js` — `testExpiryEventIntegration` (event) | 3.2 (visual) |
| AC3.3 | `notifications.test.js` — `testExpiryEventIntegration` (event) | 3.2 (visual) |
| AC3.4 | `notifications.test.js` — `testExpiryEventIntegration` (event) | 3.2 (visual) |
| AC4.1 | `notification-ui.test.js` — `testCountDisplayForCountedPair` + `testCountDisplayForUnlimitedPair` | 4.1 |
| AC4.2 | — | 4.2 |
| AC4.3 | `notification-ui.test.js` — `testUpdatePairCountPersistence` | 4.3-4.4 |
| AC4.4 | `notification-ui.test.js` — `testConvertCountedToUnlimited` | 4.3 |
| AC4.5 | `notification-ui.test.js` — `testConvertUnlimitedToCounted` | 4.4 |
| AC5.1 | `notifications.test.js` — `testMigrationWithoutCountFields` | 5.1 |
| AC5.2 | `notifications.test.js` — `testMigrationPreservesFields` | — |
| AC5.3 | `notifications.test.js` — `testMigrationCorruptedCountFields` | — |
