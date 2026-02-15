// src/notifications.js — Notification engine with config management and persistence
// Simplified model: one-click checkpoint + explicit direction choice + terminus exception

export const MAX_PAIRS = 5;

const CONFIG_KEY = 'ttracker-notifications-config';
const PAUSED_KEY = 'ttracker-notifications-paused';
let pairs = []; // In-memory cache, synced with localStorage
let paused = false; // In-memory pause state, synced with localStorage

// Injected dependencies from initNotifications
let _terminusChecker = null; // (stopId, routeId) => boolean
let _directionLabelFn = null; // (routeId) => [dir0Label, dir1Label]
let _routeMetadataFn = null; // () => Array<{id, type, ...}>

/**
 * Reads notification config from localStorage.
 * Validates that parsed JSON is an array. Returns empty array on error or missing data.
 * Filters out old-format pairs (those with myStopId) for migration.
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
        // Migration: filter out old-format pairs that have myStopId
        return data.filter(p => !p.myStopId);
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
        console.error('Failed to save notification config (storage quota exceeded):', error.message);
    }
}

/**
 * Validates a new notification pair before adding.
 * Pure function for testability.
 *
 * @param {string} checkpointStopId — checkpoint stop ID
 * @param {string} routeId — route ID
 * @param {number} directionId — direction ID (0 or 1)
 * @param {Array<Object>} existingPairs — current list of pairs
 * @returns {Object} — { error?: string } if invalid, {} if valid
 */
export function validatePair(checkpointStopId, routeId, directionId, existingPairs) {
    // Enforce max pairs
    if (existingPairs.length >= MAX_PAIRS) {
        return { error: `Maximum ${MAX_PAIRS} notification pairs configured` };
    }

    // Duplicate check: same checkpoint + route + direction already exists
    const isDuplicate = existingPairs.some(p =>
        p.checkpointStopId === checkpointStopId &&
        p.routeId === routeId &&
        p.directionId === directionId
    );
    if (isDuplicate) {
        return { error: 'Alert already configured for this stop and direction' };
    }

    return {};
}

/**
 * Request notification permission. Must be called from user gesture (click handler).
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
 *
 * @returns {string} — 'granted', 'denied', 'default', or 'unavailable'
 */
export function getPermissionState() {
    if (typeof Notification === 'undefined') return 'unavailable';
    return Notification.permission;
}

/**
 * Adds a new notification pair with explicit direction.
 * Validates, enforces max 5, requests permission on first config.
 *
 * @param {string} checkpointStopId — checkpoint stop ID
 * @param {string} routeId — route ID (e.g., "Red", "Green-D", "39")
 * @param {number} directionId — direction ID (0 or 1), user-chosen
 * @returns {Promise<Object>} — { pair: {...}, permissionState: string } or { error: string }
 */
export async function addNotificationPair(checkpointStopId, routeId, directionId) {
    const validation = validatePair(checkpointStopId, routeId, directionId, pairs);
    if (validation.error) {
        return { error: validation.error };
    }

    // Request permission on first config
    if (pairs.length === 0) {
        await requestPermission();
    }

    const newPair = {
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        checkpointStopId,
        routeId,
        directionId,
    };

    pairs.push(newPair);
    writeConfig(pairs);

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
 * Check if vehicle is at checkpoint and matches configured direction.
 * Pure function — no side effects, no direction learning.
 * Terminus exception: skips direction check at terminus stops.
 *
 * @param {Object} vehicle — vehicle state from vehicles.js
 * @param {Object} pair — {checkpointStopId, routeId, directionId}
 * @param {Set<string>} notifiedSet — already-notified vehicle+pair keys
 * @param {Map<string, Object>} [stopsData] — optional stop data for parent station resolution
 * @param {Function} [terminusChecker] — (stopId, routeId) => boolean
 * @returns {boolean}
 */
export function shouldNotify(vehicle, pair, notifiedSet, stopsData = null, terminusChecker = null) {
    // Route must match
    if (vehicle.routeId !== pair.routeId) return false;

    // Vehicle must be STOPPED_AT or INCOMING_AT the stop, not just in transit
    // MBTA current_status: "STOPPED_AT" | "INCOMING_AT" | "IN_TRANSIT_TO"
    // STOPPED_AT = confirmed at platform; INCOMING_AT = within braking distance
    // Both trigger notifications to avoid missing short dwell-time stops (especially commuter rail)
    if (vehicle.currentStatus && vehicle.currentStatus !== 'STOPPED_AT' && vehicle.currentStatus !== 'INCOMING_AT') return false;

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

    // Duplicate prevention (per vehicle + pair)
    const notifyKey = `${vehicle.id}:${pair.id}`;
    if (notifiedSet.has(notifyKey)) return false;

    // Terminus exception: skip direction check at terminus stops
    const isTerminus = terminusChecker
        ? terminusChecker(pair.checkpointStopId, pair.routeId)
        : false;

    if (!isTerminus && vehicle.directionId != null && vehicle.directionId !== pair.directionId) {
        return false;
    }

    return true;
}

/**
 * Fire a browser notification for a vehicle at checkpoint.
 * Check permission state before each notification attempt.
 *
 * @param {Object} vehicle — vehicle state
 * @param {Object} pair — notification pair config
 * @param {Map<string, Object>} stopsData — stop ID → stop object mapping
 */
function fireNotification(vehicle, pair, stopsData) {
    const permission = getPermissionState();
    if (permission !== 'granted') {
        return;
    }

    const checkpointName = stopsData.get(pair.checkpointStopId)?.name || pair.checkpointStopId;

    // Build direction label from injected function or fallback
    let directionLabel = '';
    if (_directionLabelFn) {
        const labels = _directionLabelFn(pair.routeId);
        directionLabel = labels[pair.directionId] || '';
    }

    // Determine vehicle type label based on route type
    // MBTA route types: 0 = light rail, 1 = subway, 2 = commuter rail, 3 = bus, 4 = ferry
    let vehicleTypeLabel = 'Train'; // default
    if (_routeMetadataFn) {
        const metadata = _routeMetadataFn();
        const routeMeta = metadata.find(r => r.id === pair.routeId);
        if (routeMeta) {
            switch (routeMeta.type) {
                case 0: vehicleTypeLabel = 'Trolley'; break;
                case 1: vehicleTypeLabel = 'Train'; break;
                case 2: vehicleTypeLabel = 'Train'; break;
                case 3: vehicleTypeLabel = 'Bus'; break;
                case 4: vehicleTypeLabel = 'Ferry'; break;
                default: vehicleTypeLabel = 'Vehicle';
            }
        }
    }

    const body = directionLabel ? `→ ${directionLabel}` : '';

    new Notification(`${vehicleTypeLabel} approaching ${checkpointName}`, {
        body,
        tag: `ttracker-${vehicle.id}-${pair.id}`,
    });
}

// Session-scoped Set, cleared on page reload
const notifiedVehicles = new Set();

/**
 * Check all pairs against a vehicle update. Fire notifications as needed.
 *
 * @param {Object} vehicle — vehicle state
 * @param {Map<string, Object>} stopsData — stop ID → stop object mapping
 */
function checkAllPairs(vehicle, stopsData) {
    if (paused) return;
    for (const pair of pairs) {
        if (shouldNotify(vehicle, pair, notifiedVehicles, stopsData, _terminusChecker)) {
            console.log(`[Notify] Vehicle ${vehicle.label || vehicle.id} at stop ${vehicle.stopId} matched checkpoint ${pair.checkpointStopId}`);
            fireNotification(vehicle, pair, stopsData);
            notifiedVehicles.add(`${vehicle.id}:${pair.id}`);
        }
    }
}

/**
 * Initialize notification monitoring.
 * Loads config from localStorage, subscribes to vehicle updates.
 * Filters out pairs with invalid stop IDs. Restores paused state.
 *
 * @param {EventTarget} apiEventsTarget — EventTarget emitting vehicles:update and vehicles:add
 * @param {Map<string, Object>} stopsData — stop ID → stop object mapping (from map.js)
 * @param {Function} [terminusChecker] — (stopId, routeId) => boolean
 * @param {Function} [directionLabelFn] — (routeId) => [dir0Label, dir1Label]
 * @param {Function} [routeMetadataFn] — () => Array<{id, type, ...}>
 */
export function initNotifications(apiEventsTarget, stopsData, terminusChecker = null, directionLabelFn = null, routeMetadataFn = null) {
    // Store injected dependencies
    _terminusChecker = terminusChecker;
    _directionLabelFn = directionLabelFn;
    _routeMetadataFn = routeMetadataFn;

    // Load config from localStorage
    pairs = readConfig();

    // Restore paused state from localStorage
    paused = localStorage.getItem(PAUSED_KEY) === 'true';

    // Filter out pairs with invalid stop IDs (stops no longer in loaded data)
    if (stopsData && stopsData.size > 0) {
        const beforeCount = pairs.length;
        pairs = pairs.filter(p => stopsData.has(p.checkpointStopId));
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
