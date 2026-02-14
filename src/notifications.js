// src/notifications.js — Notification engine with config management and persistence

export const MAX_PAIRS = 5;

const CONFIG_KEY = 'ttracker-notifications-config';
const PAUSED_KEY = 'ttracker-notifications-paused';
let pairs = []; // In-memory cache, synced with localStorage
let paused = false; // In-memory pause state, synced with localStorage

/**
 * Reads notification config from localStorage.
 * Validates that parsed JSON is an array. Returns empty array on error or missing data.
 *
 * @returns {Array<Object>} — array of notification pair objects
 */
function readConfig() {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (!stored) {
        return [];
    }
    try {
        const data = JSON.parse(stored);
        if (!Array.isArray(data)) {
            console.error('Notification config is not an array, starting fresh');
            return [];
        }
        return data;
    } catch (error) {
        console.error('Failed to parse notification config, starting fresh:', error.message);
        return [];
    }
}

/**
 * Writes notification config to localStorage.
 * Handles quota exceeded errors gracefully (logs error, doesn't crash).
 *
 * @param {Array<Object>} config — array of notification pair objects
 */
function writeConfig(config) {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
        // AC8.4: localStorage quota exceeded
        console.error('Failed to save notification config (storage quota exceeded):', error.message);
    }
}

/**
 * Validates a new notification pair before adding.
 * Pure function for testability.
 *
 * @param {string} checkpointStopId — checkpoint stop ID
 * @param {string} myStopId — destination stop ID
 * @param {Array<Object>} existingPairs — current list of pairs
 * @returns {Object} — { error?: string } if invalid, {} if valid
 */
export function validatePair(checkpointStopId, myStopId, existingPairs) {
    // AC3.4: Enforce max pairs
    if (existingPairs.length >= MAX_PAIRS) {
        return { error: `Maximum ${MAX_PAIRS} notification pairs configured` };
    }

    // AC3.5: Checkpoint and destination must be different
    if (checkpointStopId === myStopId) {
        return { error: 'Checkpoint and destination must be different stops' };
    }

    return {};
}

/**
 * Request notification permission. Must be called from user gesture (click handler).
 * AC9.1: Requests permission on first configuration.
 *
 * @returns {Promise<string>} — 'granted', 'denied', or 'default'
 */
export async function requestPermission() {
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    return result;
}

/**
 * Get current permission state without prompting user.
 * AC9.6: Detects if previously granted permission was revoked.
 *
 * @returns {string} — 'granted', 'denied', 'default', or 'unavailable'
 */
export function getPermissionState() {
    if (typeof Notification === 'undefined') return 'unavailable';
    return Notification.permission;
}

/**
 * Adds a new notification pair.
 * Validates, enforces max 5, saves with learnedDirectionId: null.
 * AC9.1: Requests permission on first configuration.
 * AC9.2: Saves config even if permission denied.
 *
 * @param {string} checkpointStopId — checkpoint stop ID
 * @param {string} myStopId — destination stop ID
 * @param {string} routeId — route ID (e.g., "Red", "Green-D", "39")
 * @returns {Promise<Object>} — { pair: {...}, permissionState: string } or { error: string }
 */
export async function addNotificationPair(checkpointStopId, myStopId, routeId) {
    const validation = validatePair(checkpointStopId, myStopId, pairs);
    if (validation.error) {
        return { error: validation.error };
    }

    // AC9.1: Request permission on first config
    if (pairs.length === 0) {
        await requestPermission();
    }

    const newPair = {
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        checkpointStopId,
        myStopId,
        routeId,
        learnedDirectionId: null,
    };

    pairs.push(newPair);
    writeConfig(pairs); // AC9.2: Save even if permission denied

    return { pair: newPair, permissionState: getPermissionState() };
}

/**
 * Removes a notification pair by ID.
 * Updates localStorage after removal.
 *
 * @param {string} pairId — pair ID to remove
 * @returns {boolean} — true if removed, false if not found
 */
export function removeNotificationPair(pairId) {
    const index = pairs.findIndex(p => p.id === pairId);
    if (index === -1) return false;

    pairs.splice(index, 1);
    writeConfig(pairs);
    return true;
}

/**
 * Returns current notification pairs (in-memory cache).
 * Returns a shallow copy to prevent external mutations of internal state.
 *
 * @returns {Array<Object>} — shallow copy of notification pair objects
 */
export function getNotificationPairs() {
    return [...pairs];
}


/**
 * Pause notifications. Config preserved, notifications stop firing.
 * AC5.1: Paused stops notifications from firing.
 */
export function pauseNotifications() {
    paused = true;
    try {
        localStorage.setItem(PAUSED_KEY, 'true');
    } catch (error) {
        console.error('Failed to save pause state to localStorage:', error.message);
    }
}

/**
 * Resume notifications. Re-enables notification firing.
 * AC5.2: Resume re-enables notifications.
 */
export function resumeNotifications() {
    paused = false;
    try {
        localStorage.setItem(PAUSED_KEY, 'false');
    } catch (error) {
        console.error('Failed to save pause state to localStorage:', error.message);
    }
}

/**
 * Toggle pause state.
 */
export function togglePause() {
    if (paused) {
        resumeNotifications();
    } else {
        pauseNotifications();
    }
}

/**
 * Check if notifications are paused.
 * @returns {boolean}
 */
export function isPaused() {
    return paused;
}

/**
 * Check if vehicle is at checkpoint heading toward destination.
 * Uses directionId learning: first vehicle at checkpoint sets the expected direction.
 * AC7.1: Direction detected from live vehicle data (directionId).
 * AC7.2: No route database needed — uses real-time vehicle directionId.
 * AC7.3: If directionId unavailable, falls back to "at checkpoint on correct route".
 * AC4.4: Opposite direction vehicles filtered out after direction is learned.
 *
 * NOTE: This function has side effects:
 * - Mutates pair.learnedDirectionId on first direction observation (sets to vehicle.directionId)
 * - Calls writeConfig(pairs) to persist the learned direction to localStorage
 *
 * @param {Object} vehicle — vehicle state from vehicles.js
 * @param {Object} pair — {checkpointStopId, myStopId, routeId, learnedDirectionId}
 * @param {Set<string>} notifiedSet — already-notified vehicle+pair keys
 * @param {Map<string, Object>} [stopsData] — optional stop data for parent station resolution
 * @returns {boolean}
 */
export function shouldNotify(vehicle, pair, notifiedSet, stopsData = null) {
    // AC4.5: Route must match
    if (vehicle.routeId !== pair.routeId) return false;

    // Vehicle must be at the checkpoint stop
    // MBTA SSE reports child/platform stop IDs (e.g., "70064") but notification pairs
    // may store parent station IDs (e.g., "place-davis"). Resolve through parent relationship.
    let atCheckpoint = vehicle.stopId === pair.checkpointStopId;
    if (!atCheckpoint && stopsData && vehicle.stopId) {
        const vehicleStop = stopsData.get(vehicle.stopId);
        if (vehicleStop?.parentStopId === pair.checkpointStopId) {
            atCheckpoint = true;
        }
    }
    if (!atCheckpoint) return false;

    // AC4.3: Duplicate prevention (per vehicle + pair)
    const notifyKey = `${vehicle.id}:${pair.id}`;
    if (notifiedSet.has(notifyKey)) return false;

    // AC7.1 + AC4.4: Direction detection via directionId
    if (vehicle.directionId != null) {
        if (pair.learnedDirectionId == null) {
            // First vehicle at checkpoint — learn the direction
            pair.learnedDirectionId = vehicle.directionId;
            // Persist learned direction to localStorage
            writeConfig(pairs);
        } else if (vehicle.directionId !== pair.learnedDirectionId) {
            // AC4.4: Wrong direction — don't notify
            return false;
        }
    } else {
        // AC7.3: directionId unavailable — fall back to "at checkpoint on route" check
        console.warn(`Vehicle ${vehicle.id} has no directionId — using checkpoint-only detection`);
    }

    return true;
}

/**
 * Fire a browser notification for a vehicle at checkpoint.
 * AC9.6: Check permission state before each notification attempt.
 *
 * @param {Object} vehicle — vehicle state
 * @param {Object} pair — notification pair config
 * @param {Map<string, Object>} stopsData — stop ID → stop object mapping
 */
function fireNotification(vehicle, pair, stopsData) {
    const permission = getPermissionState();
    if (permission !== 'granted') {
        // Permission was revoked or never granted
        return;
    }

    const checkpointName = stopsData.get(pair.checkpointStopId)?.name || pair.checkpointStopId;
    const destName = stopsData.get(pair.myStopId)?.name || pair.myStopId;

    new Notification(`Train ${vehicle.label} at ${checkpointName}`, {
        body: `Heading toward ${destName}`,
        tag: `ttracker-${vehicle.id}-${pair.id}`,
    });
}

// Session-scoped Set, cleared on page reload
const notifiedVehicles = new Set();

/**
 * Check all pairs against a vehicle update. Fire notifications as needed.
 * AC4.6: Multiple trains in sequence each trigger separate notifications.
 * AC4.7: Every crossing notifies (keyed by vehicle.id + pair.id, so different vehicles all trigger).
 * AC5.1: Skips checking when paused (notifications disabled but config preserved).
 *
 * @param {Object} vehicle — vehicle state
 * @param {Map<string, Object>} stopsData — stop ID → stop object mapping
 */
function checkAllPairs(vehicle, stopsData) {
    if (paused) return; // AC5.1: Paused — don't check or notify
    for (const pair of pairs) {
        if (shouldNotify(vehicle, pair, notifiedVehicles, stopsData)) {
            console.log(`[Notify] Vehicle ${vehicle.label || vehicle.id} at stop ${vehicle.stopId} matched checkpoint ${pair.checkpointStopId}`);
            fireNotification(vehicle, pair, stopsData);
            notifiedVehicles.add(`${vehicle.id}:${pair.id}`);
        }
    }
}

/**
 * Initialize notification monitoring.
 * Loads config from localStorage, subscribes to vehicle updates.
 * AC8.5: Filters out pairs with invalid stop IDs.
 * AC5.3: Restores paused state from localStorage.
 *
 * @param {EventTarget} apiEventsTarget — EventTarget emitting vehicles:update and vehicles:add
 * @param {Map<string, Object>} stopsData — stop ID → stop object mapping (from map.js)
 */
export function initNotifications(apiEventsTarget, stopsData) {
    // Load config from localStorage
    pairs = readConfig();

    // AC5.3: Restore paused state from localStorage
    paused = localStorage.getItem(PAUSED_KEY) === 'true';

    // AC8.5: Filter out pairs with invalid stop IDs (stops no longer in loaded data)
    if (stopsData && stopsData.size > 0) {
        const beforeCount = pairs.length;
        pairs = pairs.filter(p =>
            stopsData.has(p.checkpointStopId) && stopsData.has(p.myStopId)
        );
        if (pairs.length < beforeCount) {
            console.warn(`Filtered out ${beforeCount - pairs.length} notification pairs with invalid stop IDs`);
            writeConfig(pairs);
        }
    }

    // Monitor vehicle updates for checkpoint crossings
    apiEventsTarget.addEventListener('vehicles:update', (e) => {
        checkAllPairs(e.detail, stopsData);
    });
    apiEventsTarget.addEventListener('vehicles:add', (e) => {
        checkAllPairs(e.detail, stopsData);
    });
}
