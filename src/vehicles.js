// src/vehicles.js — Vehicle state management and animation loop
import { config } from '../config.js';
import { lerp, easeOutCubic, lerpAngle, haversineDistance } from './vehicle-math.js';

// Map<vehicleId, VehicleState>
const vehicles = new Map();

// Callbacks registered via onVehicleUpdate()
const updateCallbacks = [];

// Page visibility and animation control
let isTabVisible = !document.hidden;
let animationFrameId = null;
let getViewportBounds = null; // Callback to get current map bounds

/**
 * Helper to create a VehicleState object
 */
function createVehicleState(vehicle, duration) {
    return {
        id: vehicle.id,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        bearing: vehicle.bearing ?? 0,
        targetLatitude: vehicle.latitude,
        targetLongitude: vehicle.longitude,
        targetBearing: vehicle.bearing ?? 0,
        prevLatitude: vehicle.latitude,
        prevLongitude: vehicle.longitude,
        prevBearing: vehicle.bearing ?? 0,
        animationStart: performance.now(),
        animationDuration: duration,
        routeId: vehicle.routeId,
        currentStatus: vehicle.currentStatus,
        stopId: vehicle.stopId,
        currentStopSequence: vehicle.currentStopSequence,
        directionId: vehicle.directionId,
        label: vehicle.label,
        state: 'entering',
        opacity: 0,
    };
}

/**
 * Handle vehicles:reset event
 */
function onReset(vehicleArray) {
    vehicles.clear();

    for (const vehicle of vehicleArray) {
        const state = createVehicleState(vehicle, config.animation.fadeInDuration);
        vehicles.set(vehicle.id, state);
    }
}

/**
 * Handle vehicles:add event
 */
function onAdd(vehicle) {
    const state = createVehicleState(vehicle, config.animation.fadeInDuration);
    vehicles.set(vehicle.id, state);
}

/**
 * Handle vehicles:update event
 */
function onUpdate(vehicle) {
    const existing = vehicles.get(vehicle.id);
    if (!existing) return;

    // Snapshot current interpolated position as prev*
    existing.prevLatitude = existing.latitude;
    existing.prevLongitude = existing.longitude;
    existing.prevBearing = existing.bearing;

    // Check if position jump exceeds snap threshold
    const distance = haversineDistance(
        existing.latitude,
        existing.longitude,
        vehicle.latitude,
        vehicle.longitude
    );

    if (distance > config.animation.snapThreshold) {
        // Snap instantly
        const bearing = vehicle.bearing ?? 0;
        existing.latitude = vehicle.latitude;
        existing.longitude = vehicle.longitude;
        existing.bearing = bearing;
        existing.targetLatitude = vehicle.latitude;
        existing.targetLongitude = vehicle.longitude;
        existing.targetBearing = bearing;
        existing.prevLatitude = vehicle.latitude;
        existing.prevLongitude = vehicle.longitude;
        existing.prevBearing = bearing;
        existing.animationStart = performance.now();
        existing.animationDuration = 0;
    } else {
        // Set target and animate
        existing.targetLatitude = vehicle.latitude;
        existing.targetLongitude = vehicle.longitude;
        existing.targetBearing = vehicle.bearing ?? 0;
        existing.animationStart = performance.now();
        existing.animationDuration = config.animation.interpolationDuration;
    }

    // Update metadata
    existing.routeId = vehicle.routeId;
    existing.currentStatus = vehicle.currentStatus;
    existing.stopId = vehicle.stopId;
    existing.currentStopSequence = vehicle.currentStopSequence;
    existing.directionId = vehicle.directionId;
    existing.label = vehicle.label;

    // Note: State transition from 'entering' to 'active' is handled by animate()
    // when fade-in completes (t >= 1.0). This ensures we don't skip fade-in animations
    // when updates arrive before the fade-in finishes.
}

/**
 * Handle vehicles:remove event
 */
function onRemove(eventDetail) {
    const existing = vehicles.get(eventDetail.id);
    if (!existing) return;

    existing.state = 'exiting';
    existing.animationStart = performance.now();
    existing.animationDuration = config.animation.fadeOutDuration;
}

/**
 * Check if a vehicle position is within viewport bounds
 * Handles both Leaflet LatLngBounds and custom {north, south, east, west} objects
 */
function isWithinBounds(vehicle, bounds) {
    if (!bounds) return true; // No bounds filter = all vehicles visible

    // Leaflet LatLngBounds object
    if (typeof bounds.contains === 'function') {
        return bounds.contains([vehicle.latitude, vehicle.longitude]);
    }

    // Custom {north, south, east, west} object
    if (bounds.north !== undefined && bounds.south !== undefined) {
        return (
            vehicle.latitude >= bounds.south &&
            vehicle.latitude <= bounds.north &&
            vehicle.longitude >= bounds.west &&
            vehicle.longitude <= bounds.east
        );
    }

    // Unrecognized bounds format, don't filter
    return true;
}

/**
 * requestAnimationFrame loop — interpolates all vehicles
 */
function animate(timestamp) {
    // Get current viewport bounds for culling
    const bounds = getViewportBounds ? getViewportBounds() : null;

    for (const vehicle of vehicles.values()) {
        const elapsed = timestamp - vehicle.animationStart;
        let t = elapsed / vehicle.animationDuration;
        t = Math.min(t, 1.0);

        const eased = easeOutCubic(t);

        // Viewport culling: skip interpolation math for out-of-viewport vehicles (performance optimization)
        if (!isWithinBounds(vehicle, bounds)) {
            continue;
        }

        // Interpolate position
        const prevLat = vehicle.prevLatitude;
        const prevLon = vehicle.prevLongitude;
        const prevBearing = vehicle.prevBearing;

        vehicle.latitude = lerp(prevLat, vehicle.targetLatitude, eased);
        vehicle.longitude = lerp(prevLon, vehicle.targetLongitude, eased);
        vehicle.bearing = lerpAngle(prevBearing, vehicle.targetBearing, eased);

        // Handle entering/exiting opacity transitions
        if (vehicle.state === 'entering') {
            vehicle.opacity = lerp(0, 1, eased);
            if (t >= 1.0) {
                vehicle.state = 'active';
            }
        } else if (vehicle.state === 'exiting') {
            vehicle.opacity = lerp(1, 0, eased);
            if (t >= 1.0) {
                vehicles.delete(vehicle.id);
                continue;
            }
        }
    }

    // Call registered callbacks with FULL vehicles map (not filtered)
    // Callbacks can use visibility information from earlier in the frame if needed
    for (const callback of updateCallbacks) {
        callback(vehicles);
    }

    // Request next frame if tab is visible
    if (isTabVisible) {
        animationFrameId = requestAnimationFrame(animate);
    }
}

/**
 * Initialize vehicle state management
 * Subscribe to API events and start animation loop
 * @param {EventTarget} apiEventsTarget - Event target for vehicles:* events
 * @param {Function} [viewportBoundsCallback] - Optional callback returning viewport bounds
 */
export function initVehicles(apiEventsTarget, viewportBoundsCallback) {
    apiEventsTarget.addEventListener('vehicles:reset', (e) => {
        onReset(e.detail);
    });

    apiEventsTarget.addEventListener('vehicles:add', (e) => {
        onAdd(e.detail);
    });

    apiEventsTarget.addEventListener('vehicles:update', (e) => {
        onUpdate(e.detail);
    });

    apiEventsTarget.addEventListener('vehicles:remove', (e) => {
        onRemove(e.detail);
    });

    // Store viewport bounds callback
    getViewportBounds = viewportBoundsCallback;

    // Set up Page Visibility API to pause animation when tab is hidden
    document.addEventListener('visibilitychange', () => {
        isTabVisible = !document.hidden;

        if (isTabVisible) {
            // Tab became visible: reset animation start times and resume
            const now = performance.now();
            for (const vehicle of vehicles.values()) {
                vehicle.animationStart = now;
            }
            // Resume animation loop
            animationFrameId = requestAnimationFrame(animate);
        } else {
            // Tab became hidden: cancel animation frame to prevent wasted CPU
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }
    });

    // Start animation loop
    animationFrameId = requestAnimationFrame(animate);
}

/**
 * Get current vehicles Map
 */
export function getVehicles() {
    return vehicles;
}

/**
 * Register a callback to be invoked each animation frame with vehicles Map
 */
export function onVehicleUpdate(callback) {
    updateCallbacks.push(callback);
}
