# Notification Expiry Design

## Summary

Notification expiry adds a user-controlled countdown to the MBTA T-Tracker alert system. Today, a notification pair — a user-configured watch on a specific stop, route, and direction — fires indefinitely until manually deleted. This feature lets users specify how many times an alert should fire before it disappears automatically: once, twice, three times, a custom number, or the existing unlimited behavior. When the remaining count reaches zero after a notification fires, the pair removes itself, its stop marker un-highlights on the map, and the alerts panel updates without any user action.

The implementation extends the existing pair data model with two new integer fields (`remainingCount` and `totalCount`), adds a reusable "chip picker" UI element that appears inline inside both the stop popup (at creation) and the alerts panel (for editing), and hooks the countdown logic into the existing `shouldNotify()` function. All four phases build on patterns already present in the codebase — pure HTML generation functions, event delegation for click handling, and `localStorage` read/write with graceful migration — so no new architectural patterns are introduced. Existing saved pairs load as unlimited automatically, requiring no manual migration by the user.

## Definition of Done

- Notifications auto-expire after a user-chosen number of train passes (1, 2, 3, custom, or unlimited)
- User selects count when creating an alert via inline chip picker in the stop popup
- Alerts panel shows remaining count per pair and allows editing via the same chip picker
- When remaining count reaches 0, the pair auto-deletes (stop unhighlighted, panel updated)
- Unlimited option preserves current indefinite behavior
- Existing notification pairs (from localStorage) migrate gracefully to the new format

## Acceptance Criteria

### notification-expiry.AC1: Alert creation includes count selection
- **notification-expiry.AC1.1 Success:** Tapping a direction button in stop popup reveals chip picker with options `[1] [2] [3] [#] [∞]`
- **notification-expiry.AC1.2 Success:** Chip `1` is pre-selected by default
- **notification-expiry.AC1.3 Success:** Tapping a chip creates the alert with the chosen count (e.g., tap `3` → pair has `remainingCount: 3, totalCount: 3`)
- **notification-expiry.AC1.4 Success:** Tapping `∞` creates an unlimited pair (`remainingCount: null, totalCount: null`)
- **notification-expiry.AC1.5 Success:** Tapping `#` reveals inline number input; entering a number and confirming creates pair with that count
- **notification-expiry.AC1.6 Failure:** Custom input rejects non-numeric, 0, negative, or >99 values
- **notification-expiry.AC1.7 Edge:** Tapping a different direction while chips are showing for a previous direction collapses the first and shows chips for the new one

### notification-expiry.AC2: Notifications decrement remaining count
- **notification-expiry.AC2.1 Success:** When a vehicle triggers notification for a counted pair, `remainingCount` decrements by 1
- **notification-expiry.AC2.2 Success:** Unlimited pairs (`remainingCount: null`) fire without decrementing
- **notification-expiry.AC2.3 Success:** Updated count persists to localStorage after each decrement
- **notification-expiry.AC2.4 Edge:** Two different vehicles passing the same stop in the same event batch each decrement the counter independently

### notification-expiry.AC3: Auto-delete on expiry
- **notification-expiry.AC3.1 Success:** When `remainingCount` reaches 0, the pair is removed from the config array and localStorage
- **notification-expiry.AC3.2 Success:** Stop marker unhighlights when its last pair auto-deletes
- **notification-expiry.AC3.3 Success:** Alerts panel updates immediately when a pair expires (no stale entries)
- **notification-expiry.AC3.4 Success:** Status indicator updates pair count when a pair expires

### notification-expiry.AC4: Alerts panel shows and edits count
- **notification-expiry.AC4.1 Success:** Each pair in the panel displays "N remaining" (or "∞ unlimited")
- **notification-expiry.AC4.2 Success:** Tapping the count text reveals chip picker inline
- **notification-expiry.AC4.3 Success:** Selecting a new count updates the pair's `remainingCount` and `totalCount` and persists to localStorage
- **notification-expiry.AC4.4 Success:** Selecting `∞` on a counted pair converts it to unlimited
- **notification-expiry.AC4.5 Success:** Selecting a count on an unlimited pair converts it to counted

### notification-expiry.AC5: Migration of existing pairs
- **notification-expiry.AC5.1 Success:** Existing localStorage pairs (without count fields) load as unlimited (`remainingCount: null`)
- **notification-expiry.AC5.2 Success:** No data loss — all existing pair fields preserved
- **notification-expiry.AC5.3 Edge:** Corrupted or missing count fields default to unlimited rather than erroring

## Glossary

- **Notification pair**: A saved alert configuration tied to a specific stop, route, and direction of travel. When a vehicle on that route passes the stop in the specified direction, a browser notification fires.
- **remainingCount**: The number of times a pair will still fire before auto-deleting. `null` means unlimited.
- **totalCount**: The count the user originally selected when creating the pair. Stored for display context and re-arming.
- **Chip picker**: A compact inline UI control showing selectable option buttons — `[1] [2] [3] [#] [∞]` — used to choose a count without opening a separate dialog.
- **Auto-delete**: The automatic removal of a notification pair when its `remainingCount` reaches 0, including unhighlighting its stop marker and updating the alerts panel.
- **SSE (Server-Sent Events)**: A browser API for receiving a continuous stream of data from a server over a single HTTP connection. T-Tracker uses it to receive live vehicle position updates from the MBTA V3 API.
- **Event delegation**: A pattern where a single click listener on a parent element handles clicks from many child elements by inspecting `event.target`.
- **Pure function**: A function that returns a value based only on its inputs with no side effects. `shouldNotify()` and `formatStopPopup()` are pure; this design keeps new logic pure for testability.
- **Migration**: Code that detects old-format data in localStorage and silently upgrades it to the new format on load without data loss.
- **`notifiedVehicles` Set**: A session-scoped deduplication store that prevents the same vehicle from firing the same alert more than once per page session.

## Architecture

Notification expiry adds a countdown mechanism to the existing notification pair system. Each pair gains two new fields: `remainingCount` (number or `null` for unlimited) and `totalCount` (original selection, for display). When a notification fires, `remainingCount` decrements. At 0, the pair auto-deletes.

**Data model change:**

```javascript
// Existing pair fields (unchanged)
{
    id: string,
    checkpointStopId: string,
    routeId: string,
    directionId: number,
}

// New fields added
{
    remainingCount: number | null,  // null = unlimited (∞)
    totalCount: number | null,      // original selection, null = unlimited
}
```

**UI additions:**

1. **Chip picker component** — Reusable inline count selector: `[1] [2] [3] [#] [∞]`. Used in both stop popup (creation) and alerts panel (editing). The `#` chip expands to an inline number input with confirm button. Default selection: 1.

2. **Stop popup flow change** — Tapping a direction button no longer immediately creates the alert. Instead, it reveals the chip picker below that button. Tapping a chip confirms and creates the alert. Two taps total.

3. **Alerts panel enhancement** — Each pair displays "N remaining" (or "∞ unlimited"). Tapping the count text reveals the chip picker inline to change or re-arm the count.

**Firing logic change in `shouldNotify()`:**

After a notification fires successfully, the system:
1. Decrements `remainingCount` (if not `null`)
2. Persists updated pairs to localStorage
3. If `remainingCount` reaches 0: removes the pair, unhighlights the stop, updates panel/status

**Migration:**

Existing pairs in localStorage (without `remainingCount`/`totalCount`) are treated as unlimited (`null`/`null`) on load. No version bump needed — missing fields default to unlimited behavior.

## Existing Patterns

Investigation found the notification system follows these patterns:
- **Pure validation functions:** `validatePair()` and `shouldNotify()` in `src/notifications.js` are pure, testable functions with no side effects
- **Event-driven communication:** Modules communicate via CustomEvent on EventTarget — no direct imports between notification and vehicle systems
- **Session-scoped dedup:** `notifiedVehicles` Set prevents duplicate notifications per session (cleared on reload)
- **localStorage persistence:** `readConfig()`/`writeConfig()` handle serialization with graceful error handling and migration support (existing `myStopId` migration at line 35)
- **Stop popup is pure HTML:** `formatStopPopup()` in `src/stop-popup.js` returns HTML strings; event delegation in `src/stop-markers.js` handles clicks

This design follows all existing patterns:
- Count picker HTML generated as pure function output (same as existing popup buttons)
- Click handling via event delegation on the map (same as existing alert button handler)
- Decrement logic added to the pure `shouldNotify()` flow
- Migration via defaulting missing fields (same pattern as `myStopId` migration)

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: Data Model and Notification Logic
**Goal:** Add expiry fields to pair data model, implement countdown and auto-delete on fire

**Components:**
- `src/notifications.js` — Add `remainingCount`/`totalCount` to pair creation, decrement on fire, auto-delete at 0, migrate existing pairs
- `tests/notifications.test.js` — Tests for countdown decrement, auto-delete, unlimited behavior, migration

**Dependencies:** None

**Done when:** Pairs with counts decrement on notification fire, auto-delete at 0, unlimited pairs fire indefinitely, existing localStorage pairs migrate to unlimited
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: Chip Picker UI Component
**Goal:** Reusable inline count picker that works in both stop popup and alerts panel

**Components:**
- `src/stop-popup.js` — Chip picker HTML generation function (pure), inline number input for custom `#` chip
- `src/stop-markers.js` — Event delegation for chip picker interactions (direction tap reveals chips, chip tap confirms)
- `styles.css` — Chip picker styles (compact chips, selected state, inline input, responsive for mobile)

**Dependencies:** Phase 1 (data model)

**Done when:** Tapping a direction in stop popup reveals chip picker, selecting a chip creates alert with chosen count, custom `#` chip shows inline number input
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: Alerts Panel Enhancement
**Goal:** Show remaining count per pair and allow editing via chip picker

**Components:**
- `src/notification-ui.js` — Display "N remaining" or "∞ unlimited" per pair, tap-to-edit reveals chip picker inline, count changes persist immediately
- `styles.css` — Panel count display and edit mode styles

**Dependencies:** Phase 1 (data model), Phase 2 (chip picker pattern)

**Done when:** Alerts panel shows remaining count, tapping count reveals chip picker, selecting new count updates pair and persists to localStorage
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Integration and Polish
**Goal:** Wire auto-delete to UI updates, handle edge cases, update docs

**Components:**
- `src/stop-markers.js` — Unhighlight stop when pair auto-deletes (listen for pair removal from fire path)
- `src/notification-ui.js` — Auto-refresh panel and status when pair expires
- `index.html` — Wire any new exports if needed
- `CLAUDE.md` and `src/CLAUDE.md` — Update module contracts
- `docs/TECHNICAL_SPEC.md` — Update notification system documentation

**Dependencies:** Phases 1-3

**Done when:** Auto-deleted pairs unhighlight stops, panel updates in real-time as counts decrement, all existing notification tests still pass, docs updated
<!-- END_PHASE_4 -->

## Additional Considerations

**Edge case — rapid-fire notifications:** If two vehicles pass a stop in quick succession (within the same SSE event batch), both should decrement the counter. The existing `notifiedVehicles` dedup Set prevents the same vehicle from firing twice, but different vehicles at the same stop should each decrement.

**Edge case — count reaches 0 mid-session:** When a pair auto-deletes, the `notifiedVehicles` Set still contains entries for that pair. These stale entries are harmless (the pair no longer exists to match against) and will be cleared on next page load.

**Minimum custom count:** The inline number input should enforce a minimum of 1 and reasonable maximum (99). Non-numeric input rejected.
