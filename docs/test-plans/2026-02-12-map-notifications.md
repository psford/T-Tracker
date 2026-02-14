# Human Test Plan: Map-Based Train Notification System

**Implementation Plan:** `docs/implementation-plans/2026-02-12-map-notifications/`
**Date:** 2026-02-13
**Automated Coverage:** 30/30 criteria with automated tests, 50/50 total criteria addressed

---

## Prerequisites

- Local dev server running: `python -m http.server 8000` from project root
- Browser: Chrome or Firefox with Notification API support
- Open `http://localhost:8000` in a tab
- Valid `config.js` with MBTA API key present (copied from `config.example.js`)
- All automated tests passing:
  ```
  node tests/stop-popup.test.js
  node tests/notifications.test.js
  node tests/notification-ui.test.js
  node tests/stop-markers.test.js
  ```
- Browser notification permission for `localhost:8000` reset to "Ask" (Chrome: Settings > Privacy and security > Site Settings > Notifications > remove localhost entry)
- Browser DevTools console open (F12) to observe warnings and errors
- localStorage for `localhost:8000` cleared (DevTools > Application > Local Storage > right-click > Clear)

---

## Phase 1: Stop Markers -- Visual Rendering (AC1)

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open `http://localhost:8000`. Wait for the connection status indicator (bottom of screen) to show a green dot with "Connected" text. | Map loads centered on Boston metropolitan area. Route controls panel visible on the left side. Green connection status dot visible. |
| 1.2 | Confirm Red Line is visible in route controls (should be toggled on by default). Zoom into the downtown Boston area near Park Street / Downtown Crossing using scroll wheel or pinch. | Small colored circle dots (approximately 3px radius, red color `#DA291C`, slightly transparent at 60% fill opacity) are visible along the Red Line route polyline. Each dot corresponds to a Red Line stop location. |
| 1.3 | Toggle the Orange Line ON via the route controls panel on the left side. Zoom to the Downtown Crossing area (intersection of Red and Orange lines). | Orange dots (`#ED8936`) appear along the Orange Line polyline. At Downtown Crossing -- a stop served by both Red and Orange -- only ONE circle marker is visible, not two stacked markers. The marker color belongs to whichever route appeared first in the visible route list. |
| 1.4 | Toggle ON all subway routes: Red, Orange, Blue, Green-B, Green-C, Green-D, Green-E, and Mattapan (if available). The total stop count across all subway routes exceeds 100 stops. | All subway stop markers render on the map. Pan rapidly by click-dragging across the full subway network extent (from Alewife in the north to Braintree in the south). Zoom in and out rapidly with scroll wheel. Frame rate remains smooth -- no stuttering, no visual jank, no browser "page unresponsive" warnings. |
| 1.5 | Navigate to Park Street station (42.3563, -71.0625) at the intersection of the Red Line and Green Line branches. Zoom in closely. | A single circle marker is visible at the Park Street location. There are NOT multiple overlapping circles. The marker uses one color (from whichever visible route first claims the stop in the iteration order). |
| 1.6 | Toggle the Red Line OFF by clicking its entry in the route controls panel. | All Red Line stop markers disappear from the map. Stops that are shared with other still-visible routes (e.g., Park Street, which is also Green Line) retain their marker, now colored by the remaining route. Stops exclusive to the Red Line (e.g., Alewife, Davis, Porter) are gone. |
| 1.7 | Toggle the Red Line back ON. | Red Line stop markers reappear at their original geographic positions with correct red coloring. The map state matches what it looked like before step 1.6. |

---

## Phase 2: Stop Popups -- Click Interaction (AC2)

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | With Red and Green lines visible, click directly on the Park Street stop marker dot. | A Leaflet popup appears anchored to the marker with an arrow pointing to the dot. The popup contains: (a) stop name "Park Street" inside an element with class `stop-popup__name`; (b) a route list section showing all routes serving Park Street, each with a colored square swatch and route short name (e.g., "Red", "Green-B"); (c) two buttons: "Set as Checkpoint" and "Set as My Stop"; (d) text "0/5 pairs configured". |
| 2.2 | Read the route list entries inside the Park Street popup. | Each route entry displays a small colored square (`stop-popup__swatch`) with an inline `background` style matching the route color (Red: `#DA291C`, Green-B: `#00843D`, etc.), followed by the route short name in a `<span>`. |
| 2.3 | Without closing the Park Street popup, click on a different stop marker (e.g., the Downtown Crossing stop dot). | The Park Street popup closes automatically. A new popup opens at Downtown Crossing showing its stop name and routes. Only one popup is visible at any time. |
| 2.4 | With the Downtown Crossing popup open, click-and-drag on the map background to pan the view away from Downtown Crossing. | The popup remains attached to the Downtown Crossing marker as the map pans. The popup does not close. It moves with the marker as the map viewport shifts. |
| 2.5 | Toggle ON a Commuter Rail route (e.g., Providence/Stoughton Line via route controls). Navigate to a Commuter Rail stop and click its marker. | The popup opens showing the stop name. The route list entry for this CR route shows the long name "Providence/Stoughton Line" (not the short internal ID "CR-Providence"). |

---

## Phase 3: Notification Pair Configuration Workflow (AC3)

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Click the Park Street stop marker. In the popup, click the "Set as Checkpoint" button. | The popup closes. No visible change on the map yet. Internally, Park Street is stored as the pending checkpoint. |
| 3.2 | Click the Downtown Crossing stop marker. Observe the popup content. | The popup shows: (a) a pending message "Checkpoint: Park Street" at the top of the actions area; (b) only a "Set as My Stop" button (the "Set as Checkpoint" button is absent); (c) the "Set as My Stop" button has highlighted/active styling (class `stop-popup__btn--active`). |
| 3.3 | Click "Set as My Stop" in the Downtown Crossing popup. | The browser notification permission dialog appears (this is the first pair, triggering AC9.1). Click "Allow" to grant permission. The popup closes. Both the Park Street and Downtown Crossing stop markers visually change to a highlighted state: radius increases from 3 to 5 pixels, fill opacity increases from 0.6 to 1.0, border weight increases from 1 to 2. These markers are visually larger and brighter than unconfigured stop markers nearby. |
| 3.4 | Click the Park Street stop marker again after configuring it as a checkpoint. | The popup shows "Checkpoint for Red alert" indicator text. No "Set as Checkpoint" or "Set as My Stop" buttons are present. |
| 3.5 | Click the Downtown Crossing stop marker again after configuring it as a destination. | The popup shows "Destination for Red alert" indicator text. No configuration buttons are present. |
| 3.6 | Repeat the two-click configuration workflow (steps 3.1-3.3) four more times with different stop pairs. Use stops on different routes if desired (e.g., Orange Line pair, Blue Line pair, Green-B pair). | Each pair configures successfully. The counter text in each subsequent popup increments: "1/5 pairs configured", "2/5 pairs configured", "3/5 pairs configured", "4/5 pairs configured", "5/5 pairs configured (maximum reached)". |
| 3.7 | With 5 pairs configured, click any unconfigured stop marker. | The popup shows text "5/5 pairs configured (maximum reached)". No "Set as Checkpoint" or "Set as My Stop" buttons are visible. |
| 3.8 | Click the "Alerts" button (visible in the top-left control area). In the panel that opens, click the "Delete" button next to any one of the 5 pairs. | The pair disappears from the panel list. The counter in the panel updates to "4/5 pairs configured". The two stop markers for the deleted pair (checkpoint and destination) revert to default style (smaller, more transparent). |
| 3.9 | Click an unconfigured stop marker on the map. | The popup shows "4/5 pairs configured" with both "Set as Checkpoint" and "Set as My Stop" buttons available again. A new pair can be configured. |

---

## Phase 4: Permission Handling (AC9)

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Clear all site data for `localhost:8000` (DevTools > Application > Clear site data). Reload the page. Wait for connection. Configure a notification pair by clicking checkpoint stop then destination stop. | When clicking "Set as My Stop" to complete the first pair, the browser's native notification permission dialog appears. This confirms AC9.1: permission is requested on first configuration. |
| 4.2 | Click "Block" or "Deny" on the browser permission dialog. | The pair IS saved despite the denial (check Alerts panel -- the pair appears in the list). The notification status bar (below the map controls area) shows red-colored text: "Notifications blocked" with a clickable "Enable" button. This confirms AC9.2 (config saved on denial) and AC9.3 (blocked banner with enable button). |
| 4.3 | Click the "Enable" button in the red status bar. | The browser notification permission dialog appears again. This confirms AC9.4. |
| 4.4 | Click "Allow" on the permission dialog this time. | The status bar changes from red "Notifications blocked" to green "Active: 1 alert" with a "Pause" button. The red warning banner disappears. This confirms AC9.5. |
| 4.5 | With green "Active" status showing, open browser settings in a new tab (Chrome: `chrome://settings/content/notifications`; Firefox: Settings > Privacy & Security > Permissions > Notifications). Find `localhost:8000` and change its permission to "Block". Switch back to the T-Tracker tab. | On returning to the tab (the `visibilitychange` event fires), the status bar immediately changes from green "Active" to red "Notifications blocked -- Enable". This confirms AC9.6 and AC6.5: permission revocation is detected when the tab regains focus. |

---

## Phase 5: Notification Firing (AC4)

**Note:** This phase requires live MBTA vehicle data. Choose a route and time of day when trains are running frequently (weekday daytime is best). The Red Line typically has the highest frequency.

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Grant notification permission. Configure a pair on an active subway route. For example: Red Line with checkpoint at Alewife (northern terminus) and destination at Davis (one stop south). Wait for a Red Line vehicle position update showing a vehicle at or near Alewife. Monitor the DevTools console for log messages from `shouldNotify`. | When a Red Line vehicle is reported at the Alewife stop heading toward Davis (correct directionId), a browser notification popup appears in the system notification area. This confirms AC4.1. The first vehicle at the checkpoint also triggers direction learning (`pair.learnedDirectionId` set). |
| 5.2 | Read the browser notification content when it appears. | The notification title contains the train's label/ID and the checkpoint stop name (format: "Train [label] at Alewife"). The notification body contains the destination name (format: "Heading toward Davis"). This confirms AC4.2. |
| 5.3 | Continue watching after the first notification. The same train (same vehicle ID) should remain near Alewife for subsequent position updates. | No second notification fires for the same vehicle+pair combination. The `notifiedSet` prevents duplicates. Check console -- `shouldNotify` returns `false` for the repeated key. This confirms AC4.3. |
| 5.4 | Monitor for Red Line vehicles arriving at Alewife from the opposite direction (directionId different from the learned value). On the Red Line, Alewife is a terminus, so vehicles changing direction here may have a different directionId. | Vehicles heading in the opposite direction (away from Davis) do NOT trigger notifications. `shouldNotify` returns `false` due to direction mismatch. This confirms AC4.4. |
| 5.5 | If buses or other route vehicles happen to report positions near Alewife. | No notification fires for vehicles on routes other than Red. `shouldNotify` returns `false` due to `vehicle.routeId !== pair.routeId`. This confirms AC4.5. |
| 5.6 | Wait for a second, different Red Line train to arrive at Alewife heading toward Davis (same direction as the learned directionId). | A new, separate notification fires for this second train. Each unique vehicle ID generates its own notification independently. This confirms AC4.6 and AC4.7. |

---

## Phase 6: Pause and Resume (AC5)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | With at least one configured pair and notification permission granted, observe the notification status bar. | The status bar shows green text: "Active: N alert(s)" followed by a clickable "Pause" button. This confirms AC6.1. |
| 6.2 | Click the "Pause" button in the status bar. | The status bar changes to amber/yellow text: "Paused" followed by a clickable "Resume" button. This confirms AC5.4 and AC6.2. |
| 6.3 | While paused, wait for a vehicle to reach a configured checkpoint stop (or check DevTools console for vehicle update events). | No notification fires. The `checkAllPairs` function returns early when `paused === true`. This confirms AC5.1. |
| 6.4 | Click the "Resume" button in the status bar. | The status bar changes back to green "Active: N alert(s)" with a "Pause" button. This confirms AC5.2. |
| 6.5 | After resuming, wait for the next vehicle to reach the checkpoint. | Notification fires normally, confirming resume re-enabled the notification engine. |
| 6.6 | Click "Pause" again. Press F5 to reload the page. Wait for the page to fully load and connect. | After reload, the status bar still shows amber "Paused" text with a "Resume" button. The paused state was persisted in localStorage and restored by `initNotifications()`. This confirms AC5.3. |
| 6.7 | While still paused, click the "Alerts" button to open the notification panel. Inspect the pair list. | All previously configured pairs are still listed in the panel with correct checkpoint, destination, and route names. Pausing did not delete or modify any configuration. This confirms AC5.5. |
| 6.8 | Click "Resume". Press F5 to reload again. | After reload, status shows green "Active". Pairs still present. Both pause and resume states persist correctly across reloads. |

---

## Phase 7: Configuration Panel Management (AC10)

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Starting with no configured pairs, observe the top-left area of the map where map controls appear. | No "Alerts" button is visible (it is hidden via `display: none` when zero pairs exist). |
| 7.2 | Configure 3 notification pairs across different routes (e.g., one Red, one Orange, one Green-B). After configuration, observe the top-left area. | An "Alerts" button becomes visible. This confirms AC10.4 (button shown when pairs exist). |
| 7.3 | Click the "Alerts" button. | A panel opens below/near the button. The panel lists all 3 configured pairs. Each pair displays readable text in the format "Checkpoint Name -> Destination Name" (using arrow character) with the route name below it (e.g., "Red" for subway, "Providence/Stoughton Line" for commuter rail). This confirms AC10.1. |
| 7.4 | Observe the panel footer area. | Text reads "3/5 pairs configured". This confirms AC10.3. |
| 7.5 | Click the "Delete" button next to the middle pair in the panel list. | The pair disappears from the panel immediately. The counter updates to "2/5 pairs configured". On the map, the stop markers for the deleted pair's checkpoint and destination revert to default styling (smaller radius, lower opacity). The markers for the remaining 2 pairs stay highlighted. This confirms AC10.2. |
| 7.6 | Delete the remaining 2 pairs one at a time by clicking their Delete buttons. | After deleting the last pair: the panel shows italic text "No notifications configured" in the empty state area. The "Alerts" toggle button hides (its `display` changes to `none`). This confirms AC10.5. |

---

## Phase 8: Persistence and Edge Cases (AC8)

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Configure 2 notification pairs. Press F5 to reload the page. Wait for connection and data to load. | Both pairs appear in the Alerts panel after reload with correct names. Both pairs' stop markers are highlighted (radius 5, full opacity). This confirms AC8.1: configuration persists in localStorage across page reloads. |
| 8.2 | Click "Pause" in the status bar. Press F5 to reload. | After reload, the status bar shows amber "Paused". The paused state was preserved across the reload. This confirms AC8.2. |
| 8.3 | Open DevTools > Application > Local Storage > `http://localhost:8000`. Find the key `ttracker-notifications-config`. Double-click its value and replace it with the corrupted string: `{invalid json [{`. Press Enter to save. Press F5 to reload the page. | The app loads without crashing. The Alerts panel shows no configured pairs (empty state). The DevTools console shows an error message: "Failed to parse notification config, starting fresh". A new pair can be configured normally after this recovery. This confirms AC8.3. |
| 8.4 | In DevTools Local Storage, set `ttracker-notifications-config` to: `[{"id":"test123","checkpointStopId":"FAKE-STOP-1","myStopId":"FAKE-STOP-2","routeId":"Red","learnedDirectionId":null}]`. Press Enter. Reload the page and wait for route/stop data to fully load (wait for stop markers to appear on the map). | The pair with fake stop IDs (`FAKE-STOP-1`, `FAKE-STOP-2`) is filtered out because those IDs do not exist in the loaded stops data. The Alerts panel shows no pairs (or only other valid pairs if you had legitimate ones). The DevTools console shows a warning: "Filtered out 1 notification pairs with invalid stop IDs". This confirms AC8.5. |
| 8.5 | (Edge case) In DevTools Local Storage, fill localStorage with large data entries to approach the ~5MB quota. Then try to configure a new notification pair. | The pair is created in memory (visible in the Alerts panel for this session), but `writeConfig` catches the `QuotaExceededError` and logs "Failed to save notification config (storage quota exceeded)" to the console. The app does not crash. This confirms AC8.4. **Note:** This is difficult to reproduce in practice and is primarily validated by the automated test. |

---

## End-to-End: Complete Notification Lifecycle

**Purpose:** Validate the full user journey from first visit through notification receipt, pause/resume, and cleanup. This scenario spans AC1, AC2, AC3, AC4, AC5, AC6, AC8, AC9, and AC10.

| Step | Action | Expected |
|------|--------|----------|
| E2E-1 | Open `http://localhost:8000` in a fresh browser profile (cleared localStorage, reset notification permission). Wait for green "Connected" status. | Map loads. Subway stop markers (colored dots) visible along route polylines. No notification status bar visible. No "Alerts" button visible. |
| E2E-2 | Click a Red Line stop marker (e.g., Harvard at 42.3736, -71.1189). | Popup opens with: "Harvard" stop name, "Red" route with red swatch, "Set as Checkpoint" and "Set as My Stop" buttons, "0/5 pairs configured" counter. |
| E2E-3 | Click "Set as Checkpoint". | Popup closes. |
| E2E-4 | Click a downstream Red Line stop (e.g., Central at 42.3653, -71.1037). Observe the popup. | Popup shows: "Checkpoint: Harvard" pending message, highlighted "Set as My Stop" button, no "Set as Checkpoint" button. |
| E2E-5 | Click "Set as My Stop". | Browser notification permission dialog appears. Click "Allow". Popup closes. Harvard and Central markers change to highlighted style (larger, brighter). Notification status bar appears showing green "Active: 1 alert -- Pause". "Alerts" button becomes visible. |
| E2E-6 | Click the "Alerts" button. | Panel opens showing: "Harvard -> Central" pair entry, "Red" route name below it, "1/5 pairs configured" counter. |
| E2E-7 | Close the panel. Wait for a Red Line vehicle to reach Harvard heading toward Central. | Browser notification appears: title "Train [label] at Harvard", body "Heading toward Central". |
| E2E-8 | Click "Pause" in the status bar. | Status changes to amber "Paused -- Resume". |
| E2E-9 | Press F5 to reload. | Page reloads. After connection: pair still exists in Alerts panel, status still shows "Paused", Harvard and Central markers still highlighted. |
| E2E-10 | Click "Resume". | Status changes to green "Active: 1 alert -- Pause". |
| E2E-11 | Open Alerts panel. Click "Delete" on the Harvard->Central pair. | Pair disappears. Counter clears. Harvard and Central markers revert to default size/opacity. "Alerts" button hides. Status bar hides (0 pairs). |

---

## End-to-End: Multi-Route Independent Operation

**Purpose:** Validate that notification pairs on different routes operate independently.

| Step | Action | Expected |
|------|--------|----------|
| MR-1 | Configure a Red Line pair (e.g., Alewife -> Davis). | Pair 1 created. Status: "Active: 1 alert". |
| MR-2 | Configure an Orange Line pair (e.g., North Station -> Haymarket). | Pair 2 created. Status: "Active: 2 alerts". |
| MR-3 | Configure a Green-B pair (e.g., Boston College -> Babcock Street). | Pair 3 created. Status: "Active: 3 alerts". |
| MR-4 | Open Alerts panel. Verify all 3 pairs listed with correct route names. | Panel shows: Alewife->Davis (Red), North Station->Haymarket (Orange), Boston College->Babcock Street (Green-B). Counter: "3/5 pairs configured". |
| MR-5 | Delete the Orange Line pair from the panel. | Orange pair removed. Red and Green-B pairs remain. Counter: "2/5 pairs configured". Orange Line stop markers for North Station and Haymarket revert to default styling. Red and Green-B stop highlights unchanged. |
| MR-6 | Verify Red and Green-B notifications continue independently. | Each route's pair triggers notifications only for vehicles on its own route at its own checkpoint. A Green-B vehicle at a Red Line checkpoint does not trigger. |

---

## Traceability Matrix

| Acceptance Criterion | Automated Test | Manual Step |
|----------------------|----------------|-------------|
| AC1.1 Stop markers visible | -- | 1.2 |
| AC1.2 Markers disappear on toggle | -- | 1.6 |
| AC1.3 Markers reappear on toggle | -- | 1.7 |
| AC1.4 100+ stops performance | -- | 1.4 |
| AC1.5 No marker stacking | `stop-markers.test.js::testComputeVisibleStops` | 1.3, 1.5 |
| AC2.1 Popup with stop name | `stop-popup.test.js::testFormatStopPopup` | 2.1 |
| AC2.2 Config buttons in popup | `stop-popup.test.js::testConfigButtons` | 3.2 |
| AC2.3 Routes in popup | `stop-popup.test.js::testFormatStopPopup` | 2.2, 2.5 |
| AC2.4 One popup at a time | -- | 2.3 |
| AC2.5 Popup survives pan | -- | 2.4 |
| AC3.1 Add pair | `notifications.test.js::testAddNotificationPair` | 3.1-3.3 |
| AC3.2 Configured stop highlight | -- | 3.3 |
| AC3.3 Cross-route pairs | `notifications.test.js::testValidatePair` | 3.6 |
| AC3.4 Max 5 pairs | `notifications.test.js::testValidatePair` | 3.7 |
| AC3.5 Same stop rejected | `notifications.test.js::testValidatePair` | -- |
| AC3.6 Delete frees slot | `notifications.test.js::testRemoveNotificationPair` | 3.8-3.9 |
| AC3.7 Counter display | `stop-popup.test.js::testConfigButtons` | 3.6 |
| AC4.1 Notify at checkpoint | `notifications.test.js::testShouldNotify` | 5.1 |
| AC4.2 Notification content | -- | 5.2 |
| AC4.3 Duplicate prevention | `notifications.test.js::testShouldNotify` | 5.3 |
| AC4.4 Wrong direction filtered | `notifications.test.js::testShouldNotify` | 5.4 |
| AC4.5 Wrong route filtered | `notifications.test.js::testShouldNotify` | 5.5 |
| AC4.6 Multiple vehicles notify | `notifications.test.js::testShouldNotify` | 5.6 |
| AC4.7 Every train triggers | `notifications.test.js::testShouldNotify` | 5.6 |
| AC5.1 Pause stops notifications | `notifications.test.js::testPauseResume` | 6.2-6.3 |
| AC5.2 Resume re-enables | `notifications.test.js::testPauseResume` | 6.4-6.5 |
| AC5.3 Pause persists reload | `notifications.test.js::testPauseResume` | 6.6 |
| AC5.4 Paused indicator | -- | 6.2 |
| AC5.5 Pause preserves config | `notifications.test.js::testPauseResume` | 6.7 |
| AC6.1 Active status | -- | 6.1 |
| AC6.2 Paused status | -- | 6.2 |
| AC6.3 Blocked status | -- | 4.2 |
| AC6.4 Configured marker style | -- | 3.3 |
| AC6.5 Permission change detection | -- | 4.5 |
| AC7.1 Direction learning | `notifications.test.js::testShouldNotify` | 5.1 |
| AC7.2 No route database needed | `notifications.test.js::testShouldNotify` | -- |
| AC7.3 Null directionId fallback | `notifications.test.js::testShouldNotify` | -- |
| AC7.4 All transit types | `notifications.test.js::testShouldNotify` | -- |
| AC8.1 Config persists reload | `notifications.test.js::testLocalStoragePersistence` | 8.1 |
| AC8.2 Pause persists reload | `notifications.test.js::testPauseResume` | 8.2 |
| AC8.3 Corrupted data recovery | `notifications.test.js::testCorruptedLocalStorage` | 8.3 |
| AC8.4 Quota exceeded | `notifications.test.js::testWriteConfigQuotaError` | 8.5 |
| AC8.5 Invalid stop IDs filtered | -- | 8.4 |
| AC9.1 Permission on first pair | `notifications.test.js::testAsyncAddNotificationPair` | 4.1 |
| AC9.2 Config saved on denial | `notifications.test.js::testAddNotificationPair` | 4.2 |
| AC9.3 Blocked banner | -- | 4.2 |
| AC9.4 Re-request permission | -- | 4.3 |
| AC9.5 Permission state API | `notifications.test.js::testPermissionHandling` | 4.4 |
| AC9.6 Revocation detection | -- | 4.5 |
| AC10.1 Panel lists pairs | -- | 7.3 |
| AC10.2 Delete removes pair | -- | 7.5 |
| AC10.3 Panel counter | -- | 7.4 |
| AC10.4 Panel toggle button | -- | 7.1-7.2 |
| AC10.5 Empty state message | -- | 7.6 |
