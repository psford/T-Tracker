# Map-Based Train Notification System

## Summary

This design implements a pure client-side notification system that alerts users when transit vehicles approach their destination. Users click stop markers on the map to configure up to 5 "checkpoint → destination" pairs across different routes. When a vehicle crosses the checkpoint heading toward the destination, a browser notification fires. The system intelligently detects direction by comparing stop sequence numbers from live vehicle data—no route geometry database required. Notifications can be paused without losing configuration, and all settings persist in localStorage across sessions.

The implementation follows T-Tracker's existing architecture: three new ES6 modules integrate via the established event-driven pattern. `notifications.js` monitors the vehicle stream and triggers alerts, `stop-markers.js` renders clickable stops on the map, and `notification-ui.js` provides the configuration interface through Leaflet popups and status indicators. Permission denial is handled gracefully—configurations save even when blocked, with clear UI prompts to re-enable. The system works for all MBTA transit types (subway, bus, commuter rail) using the same stop-sequence logic.

## Definition of Done

**You can:**
- See stop markers on the map for all visible routes (small dots/bubbles along route lines)
- Click any stop to see its label and configure notifications
- Set up to 5 notification pairs (checkpoint + my stop) across different routes
- Receive a browser notification every time a train crosses your checkpoint heading toward your stop
- Dismiss/pause notifications (manual re-enable when ready)
- See clear visual status: which stops are configured, whether notifications are active/paused/blocked

**The system:**
- Auto-detects which direction to notify about (learns from actual train movement, no route database needed)
- Persists configurations in localStorage (survives page reloads)
- Tracks real vehicle positions via existing SSE stream (not MBTA predictions)
- Works for all transit types (commuter rail, subway, bus)
- Handles permission denial gracefully (saves config, shows warning + re-enable button)

**Explicitly NOT included:**
- Backend/server components (pure client-side)
- Push notifications when tab is closed
- SMS/email alerts
- Route geography database

## Acceptance Criteria

### map-notifications.AC1: Stop markers visible on map for all visible routes
- **map-notifications.AC1.1 Success:** Stop markers appear as small circle dots along route lines when route is visible
- **map-notifications.AC1.2 Success:** Markers disappear when route is toggled off via route controls
- **map-notifications.AC1.3 Success:** Markers reappear when route is toggled back on
- **map-notifications.AC1.4 Edge:** 100+ stops render without performance degradation (smooth panning/zooming)
- **map-notifications.AC1.5 Edge:** Markers for same physical stop on multiple routes don't stack visually

### map-notifications.AC2: Stop labels and configuration accessible via click
- **map-notifications.AC2.1 Success:** Clicking stop marker opens popup with stop name
- **map-notifications.AC2.2 Success:** Popup shows "Set as Checkpoint" and "Set as My Stop" buttons
- **map-notifications.AC2.3 Success:** Popup displays which routes serve that stop
- **map-notifications.AC2.4 Edge:** Clicking different stop closes previous popup (one open at a time)
- **map-notifications.AC2.5 Edge:** Popup remains open when panning map (doesn't close unexpectedly)

### map-notifications.AC3: Configure up to 5 notification pairs
- **map-notifications.AC3.1 Success:** User can configure checkpoint + my stop pair via popup buttons
- **map-notifications.AC3.2 Success:** Configured stops show visual highlight (different marker style)
- **map-notifications.AC3.3 Success:** Can configure pairs across different routes (Green Line + Red Line simultaneously)
- **map-notifications.AC3.4 Failure:** 6th pair attempt shows error "Maximum 5 notification pairs configured"
- **map-notifications.AC3.5 Failure:** Selecting same stop for both checkpoint and myStop shows error "Checkpoint and destination must be different stops"
- **map-notifications.AC3.6 Edge:** Deleting a pair frees slot for new configuration
- **map-notifications.AC3.7 Edge:** Counter shows "X/5 pairs configured" in status UI

### map-notifications.AC4: Browser notifications fire when train crosses checkpoint
- **map-notifications.AC4.1 Success:** Notification appears when vehicle at checkpoint stop heading toward myStop
- **map-notifications.AC4.2 Success:** Notification shows train ID, checkpoint name, and destination name
- **map-notifications.AC4.3 Success:** Same train only notifies once per session (duplicate prevention)
- **map-notifications.AC4.4 Failure:** Vehicle heading opposite direction (checkpoint → away from myStop) does not trigger notification
- **map-notifications.AC4.5 Failure:** Vehicle on different route does not trigger notification for unrelated pair
- **map-notifications.AC4.6 Edge:** Multiple trains crossing checkpoint in sequence each trigger separate notifications
- **map-notifications.AC4.7 Edge:** Notification fires for every train crossing checkpoint (not just first one)

### map-notifications.AC5: Pause and resume notifications
- **map-notifications.AC5.1 Success:** Pause button stops notifications from firing (config preserved)
- **map-notifications.AC5.2 Success:** Resume button re-enables notifications
- **map-notifications.AC5.3 Success:** Pause state persists across page reloads
- **map-notifications.AC5.4 Success:** Status indicator shows "Paused" when notifications disabled
- **map-notifications.AC5.5 Edge:** Pausing doesn't delete configuration (all pairs remain after resume)

### map-notifications.AC6: Visual status indicators
- **map-notifications.AC6.1 Success:** Status shows "Active: X trains monitored" when notifications enabled and permission granted
- **map-notifications.AC6.2 Success:** Status shows "Paused" when user manually paused
- **map-notifications.AC6.3 Success:** Status shows "Blocked - Enable Notifications" when permission denied
- **map-notifications.AC6.4 Success:** Configured stops have different marker style than unconfigured stops
- **map-notifications.AC6.5 Edge:** Status updates immediately when permission state changes

### map-notifications.AC7: Direction auto-detection from train movement
- **map-notifications.AC7.1 Success:** System detects correct direction by comparing stop sequences (checkpoint sequence < myStop sequence = correct direction)
- **map-notifications.AC7.2 Success:** Works without route database (uses real-time vehicle stop sequence data)
- **map-notifications.AC7.3 Failure:** If stop sequence unavailable, falls back to simple "at checkpoint" check (logs warning)
- **map-notifications.AC7.4 Edge:** Works for all transit types (subway, bus, commuter rail) using same logic

### map-notifications.AC8: Configuration persistence in localStorage
- **map-notifications.AC8.1 Success:** Configured pairs persist across page reloads
- **map-notifications.AC8.2 Success:** Pause state persists across page reloads
- **map-notifications.AC8.3 Failure:** Corrupted localStorage data discarded, starts fresh (logs error, doesn't crash)
- **map-notifications.AC8.4 Failure:** localStorage quota exceeded shows warning "Notifications won't persist across reloads"
- **map-notifications.AC8.5 Edge:** Invalid stop IDs in saved config filtered out (validated against loaded stops data)

### map-notifications.AC9: Permission handling
- **map-notifications.AC9.1 Success:** Permission requested on first notification configuration
- **map-notifications.AC9.2 Success:** Denied permission saves configuration anyway (user intent preserved)
- **map-notifications.AC9.3 Success:** Denied permission shows warning banner with "Enable Notifications" button
- **map-notifications.AC9.4 Success:** Clicking "Enable Notifications" triggers permission request again
- **map-notifications.AC9.5 Success:** Granted permission hides warning banner and enables notifications
- **map-notifications.AC9.6 Edge:** Previously granted permission revoked (browser settings change) detected and shows warning

### map-notifications.AC10: Configuration management
- **map-notifications.AC10.1 Success:** Configuration panel shows all configured pairs with readable route/stop names
- **map-notifications.AC10.2 Success:** Delete button removes individual pair from config
- **map-notifications.AC10.3 Success:** Panel shows count "X/5 pairs configured"
- **map-notifications.AC10.4 Success:** Panel accessible via button in map controls
- **map-notifications.AC10.5 Edge:** Deleting all pairs shows empty state message "No notifications configured"

## Glossary

- **SSE (Server-Sent Events)**: One-way persistent HTTP connection where the server continuously streams real-time updates to the client. T-Tracker uses MBTA's SSE endpoint to receive live vehicle position updates.
- **JSON:API**: Standardized JSON specification for REST APIs that uses `data`/`attributes`/`relationships` nesting. MBTA V3 API returns data in this format; T-Tracker flattens it at the `api.js` boundary.
- **Leaflet**: Open-source JavaScript library for interactive maps. T-Tracker uses Leaflet 1.9.4 to render the base map, vehicle markers, and (in this design) stop markers.
- **Web Notifications API**: Browser API (`Notification.requestPermission()`, `new Notification()`) that displays system-level notifications outside the browser tab. Requires user permission grant.
- **localStorage**: Browser API for persistent key-value storage (survives page reloads). T-Tracker uses it to save route visibility preferences and (in this design) notification configurations.
- **Stop sequence**: Ordered position of a stop along a vehicle's current trip (e.g., stop 1, stop 2, stop 3). MBTA vehicle data includes `current_stop_sequence`. Used to determine direction: if checkpoint sequence < destination sequence, vehicle is heading the right way.
- **CustomEvent**: JavaScript event dispatched on an `EventTarget` with custom data payload. T-Tracker modules use this pattern for loose coupling (e.g., `vehicles.js` emits `vehicle-updated`, `ui.js` listens and updates map).
- **ES6 modules**: JavaScript module system using `import`/`export` syntax. T-Tracker uses pure ES6 modules with no build step—all modules loaded directly by the browser via `<script type="module">`.
- **Circle marker**: Leaflet marker rendered as a simple SVG circle (lighter weight than custom icons). Used for stop markers to minimize performance impact when rendering 100+ stops.
- **Checkpoint**: The upstream stop where a vehicle's arrival triggers a notification. User configures this as the first stop in a notification pair.

## Architecture

Browser-native notification system using Web Notifications API (no Service Worker). Pure client-side implementation following T-Tracker's existing ES6 module pattern.

Three new modules integrate with existing architecture:

**`src/notifications.js`** - Notification logic engine that monitors vehicle stream for checkpoint crossings, detects direction from actual vehicle movement (compares stop sequences), triggers browser notifications, and persists configuration to localStorage. Tracks notified vehicles to prevent duplicates within session.

**`src/stop-markers.js`** - Renders stop markers as small circle markers on map for all visible routes, shows labels on click, highlights configured stops with visual distinction, filters by route visibility for performance.

**`src/notification-ui.js`** - Configuration interface rendered in Leaflet popups (checkpoint/my-stop selection), permission warning banner when blocked, status indicator showing active/paused state, max 5 pairs limit enforcement.

Data flow: Vehicle updates from SSE → `notifications.js` checks configured pairs → checkpoint detected → browser notification shown. Stop configuration: Click marker → popup with UI → config saved to localStorage → highlight updated on map.

Integration points: Listens to `vehicle-updated` from `vehicles.js`, `stops-loaded` from `api.js`, `routes-visibility-changed` from `ui.js`. Emits `notification-triggered`, `permission-changed`, `config-updated` for cross-module coordination.

## Existing Patterns

Investigation found established patterns in T-Tracker codebase that this design follows:

**Event-driven module communication**: All modules use CustomEvent on EventTarget for loose coupling (see `src/vehicles.js` emitting `vehicle-updated`, `src/ui.js` emitting `routes-visibility-changed`). New modules follow same pattern.

**LocalStorage persistence with validation**: `src/ui.js` demonstrates pattern for persisting route visibility - JSON serialization with `Array.isArray()` validation on read, graceful fallback to defaults on parse errors. New `notifications.js` follows identical approach for notification config.

**Leaflet popup rendering**: `src/map.js` shows pattern for vehicle popups using `bindPopup()`. New `stop-markers.js` uses same approach for stop configuration UI.

**Map marker lifecycle management**: `src/map.js` manages `vehicleMarkers` Map with add/update/remove based on visibility. New `stop-markers.js` mirrors this for stop markers keyed by stop ID.

**Data flattening at API boundary**: `src/api.js` flattens JSON:API format to simple objects before emitting. New modules expect flattened data (no relationships nesting).

No divergence from existing patterns. All new modules align with established T-Tracker architecture.

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Stop Marker Rendering

**Goal:** Display stop markers on map for all visible routes as small circle markers

**Components:**
- `src/stop-markers.js` - Renders Leaflet circle markers for stops, filters by visible routes, manages marker lifecycle (add/remove on route toggle)
- CSS in `styles.css` - `.stop-marker` class for circle markers, `.stop-marker--configured` modifier for highlighted state
- Integration in `index.html` - Import stop-markers module, initialize after map.js

**Dependencies:** None (uses existing stops data from api.js, existing route visibility from ui.js)

**Done when:**
- Stop markers appear as small dots on map for all visible routes
- Markers disappear when routes are toggled off
- Markers reappear when routes are toggled back on
- No performance degradation with 100+ stops visible
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Stop Popup and Label Display

**Goal:** Show stop name and basic info when user clicks stop marker

**Components:**
- Popup rendering in `src/stop-markers.js` - Leaflet `bindPopup()` with stop name, route info
- Popup styling in `styles.css` - `.stop-popup` class matching existing vehicle popup theme

**Dependencies:** Phase 1 (stop markers exist to attach popups to)

**Done when:**
- Clicking stop marker opens popup with stop name
- Popup shows which routes serve that stop
- Popup styling matches existing T-Tracker dark theme
- Multiple popups don't stack (one open at a time)
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Notification Configuration Logic

**Goal:** Core notification engine that monitors vehicles and triggers browser notifications

**Components:**
- `src/notifications.js` - Manages notification pairs (checkpoint + myStop), monitors vehicle updates, detects direction from stop sequence comparison, triggers Web Notifications API, persists config to localStorage
- LocalStorage key: `ttracker-notifications-config` - Array of `{id, checkpointStopId, myStopId, routeId}`

**Dependencies:** Phase 1 (needs stop data structure)

**Done when:**
- Can add/remove notification pairs programmatically
- Direction detection works (compares vehicle stop sequence to configured stops)
- Browser notification fires when vehicle crosses checkpoint heading toward myStop
- Same vehicle ID only notifies once per session (duplicate prevention)
- Config persists to localStorage and restores on reload
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Configuration UI in Popups

**Goal:** User interface for configuring notifications via stop popups

**Components:**
- `src/notification-ui.js` - Renders "Set as Checkpoint" and "Set as My Stop" buttons in popups, shows current configuration state, displays max 5 pairs limit
- Updated popup content in `src/stop-markers.js` - Includes notification-ui component
- Popup styling in `styles.css` - Button styles, configuration state indicators

**Dependencies:** Phase 2 (popups exist), Phase 3 (notification logic exists)

**Done when:**
- Stop popup shows "Set as Checkpoint" and "Set as My Stop" buttons
- Clicking button saves configuration and updates localStorage
- Popup shows if stop is already configured (and in what role)
- Max 5 pairs enforced with clear UI message when limit reached
- Configured stops visually highlighted on map
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: Permission Handling and Status UI

**Goal:** Handle browser notification permissions gracefully with clear user feedback

**Components:**
- Permission request flow in `src/notifications.js` - Request on first config, detect denial, emit `permission-changed` events
- `src/notification-ui.js` - Warning banner when permissions blocked, "Enable Notifications" button, status indicator (active/paused/blocked)
- Banner styling in `styles.css` - `.notification-warning` banner positioned below route controls

**Dependencies:** Phase 4 (configuration UI exists)

**Done when:**
- Permission requested when user configures first notification
- Denied permission shows persistent warning banner with "Enable Notifications" button
- Clicking "Enable Notifications" triggers permission request
- Configuration saved even when permission denied (user intent preserved)
- Status indicator shows current state (active with count, paused, or blocked)
<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->
### Phase 6: Pause/Resume Controls

**Goal:** Allow users to temporarily disable notifications without losing configuration

**Components:**
- Pause/resume functions in `src/notifications.js` - Toggle notification monitoring, emit state change events
- Control UI in `src/notification-ui.js` - Pause/resume button in status indicator
- State persistence in localStorage - `ttracker-notifications-paused` boolean

**Dependencies:** Phase 5 (status UI exists)

**Done when:**
- Pause button stops notifications from firing (but config remains)
- Resume button re-enables notifications
- Pause state persists across page reloads
- Status indicator clearly shows paused vs active state
<!-- END_PHASE_6 -->

<!-- START_PHASE_7 -->
### Phase 7: Configuration Management UI

**Goal:** View and manage all configured notification pairs in one place

**Components:**
- Configuration panel in `src/notification-ui.js` - List of configured pairs, delete buttons, route/stop names displayed
- Panel toggle button added to map controls
- Panel styling in `styles.css` - Slide-out panel matching route selection UI style

**Dependencies:** Phase 4 (configuration exists), Phase 6 (pause/resume exists)

**Done when:**
- Panel shows all configured notification pairs with readable names (not IDs)
- Can delete individual pairs from panel
- Shows count (e.g., "3/5 pairs configured")
- Panel accessible via button in map controls
- Panel collapsible/expandable
<!-- END_PHASE_7 -->

## Additional Considerations

**Performance**: Stop marker rendering filtered by visible routes prevents rendering hundreds of markers simultaneously. Circle markers are lightweight compared to custom icons. Configuration limited to 5 pairs keeps localStorage footprint small and notification checking fast.

**Browser compatibility**: Web Notifications API supported in all modern browsers (Chrome 22+, Firefox 22+, Safari 16+, Edge 14+). Graceful degradation: if API unavailable, show warning and disable notification features (stop markers still work).

**Privacy**: All data stays client-side. No notification data sent to servers. LocalStorage contains only stop IDs and route IDs (no personal info, no location data beyond what user explicitly configures).

**Direction detection edge case**: If MBTA API doesn't provide stop sequence, fall back to comparing vehicle's current stop to configured stops - if at checkpoint, assume heading toward destination (less precise but functional). Log warning to console for debugging.

**Multi-tab behavior**: Each tab maintains own `notifiedVehicles` Set (session-scoped). User may get duplicate notifications if multiple tabs open. Acceptable given pure client-side constraint (fixing would require SharedWorker or Service Worker, both out of scope).
