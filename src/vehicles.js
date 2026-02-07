// src/vehicles.js — Vehicle state management and animation loop
import { config } from '../config.js';

// Map<vehicleId, VehicleState>
const vehicles = new Map();

// Callbacks registered via onVehicleUpdate()
const updateCallbacks = [];

/**
 * Linear interpolation: a + (b - a) * t
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Easing function: ease-out-cubic
 * 1 - (1 - t)^3
 */
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Angle interpolation with shortest arc wrapping
 * Handles 359° to 1° = 2° rotation (not 358°)
 */
function lerpAngle(a, b, t) {
    // Normalize angles to [0, 360)
    a = a % 360;
    b = b % 360;
    if (a < 0) a += 360;
    if (b < 0) b += 360;

    // Find shortest rotation direction
    let delta = b - a;
    if (delta > 180) {
        delta -= 360;
    } else if (delta < -180) {
        delta += 360;
    }

    // Interpolate along shortest arc
    return (a + delta * t) % 360;
}

/**
 * Haversine distance in meters between two lat/lng coordinates
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;

    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Handle vehicles:reset event
 */
function onReset(vehicleArray) {
    vehicles.clear();

    for (const vehicle of vehicleArray) {
        const state = {
            id: vehicle.id,
            latitude: vehicle.latitude,
            longitude: vehicle.longitude,
            bearing: vehicle.bearing,
            targetLatitude: vehicle.latitude,
            targetLongitude: vehicle.longitude,
            targetBearing: vehicle.bearing,
            prevLatitude: vehicle.latitude,
            prevLongitude: vehicle.longitude,
            prevBearing: vehicle.bearing,
            animationStart: performance.now(),
            animationDuration: config.animation.interpolationDuration,
            routeId: vehicle.routeId,
            currentStatus: vehicle.currentStatus,
            directionId: vehicle.directionId,
            label: vehicle.label,
            state: 'entering',
            opacity: 0,
        };

        vehicles.set(vehicle.id, state);
    }
}

/**
 * Handle vehicles:add event
 */
function onAdd(vehicle) {
    const state = {
        id: vehicle.id,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        bearing: vehicle.bearing,
        targetLatitude: vehicle.latitude,
        targetLongitude: vehicle.longitude,
        targetBearing: vehicle.bearing,
        prevLatitude: vehicle.latitude,
        prevLongitude: vehicle.longitude,
        prevBearing: vehicle.bearing,
        animationStart: performance.now(),
        animationDuration: config.animation.fadeInDuration,
        routeId: vehicle.routeId,
        currentStatus: vehicle.currentStatus,
        directionId: vehicle.directionId,
        label: vehicle.label,
        state: 'entering',
        opacity: 0,
    };

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
        existing.latitude = vehicle.latitude;
        existing.longitude = vehicle.longitude;
        existing.bearing = vehicle.bearing;
        existing.targetLatitude = vehicle.latitude;
        existing.targetLongitude = vehicle.longitude;
        existing.targetBearing = vehicle.bearing;
        existing.prevLatitude = vehicle.latitude;
        existing.prevLongitude = vehicle.longitude;
        existing.prevBearing = vehicle.bearing;
        existing.animationStart = performance.now();
        existing.animationDuration = 0;
    } else {
        // Set target and animate
        existing.targetLatitude = vehicle.latitude;
        existing.targetLongitude = vehicle.longitude;
        existing.targetBearing = vehicle.bearing;
        existing.animationStart = performance.now();
        existing.animationDuration = config.animation.interpolationDuration;
    }

    // Update metadata
    existing.routeId = vehicle.routeId;
    existing.currentStatus = vehicle.currentStatus;
    existing.directionId = vehicle.directionId;
    existing.label = vehicle.label;

    // Return to active if not already
    if (existing.state === 'entering') {
        existing.state = 'active';
    }
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
 * requestAnimationFrame loop — interpolates all vehicles
 */
function animate(timestamp) {
    const changedVehicles = [];

    for (const vehicle of vehicles.values()) {
        const elapsed = timestamp - vehicle.animationStart;
        let t = elapsed / vehicle.animationDuration;
        t = Math.min(t, 1.0);

        const eased = easeOutCubic(t);

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

        changedVehicles.push(vehicle);
    }

    // Call registered callbacks
    for (const callback of updateCallbacks) {
        callback(vehicles);
    }

    // Request next frame
    requestAnimationFrame(animate);
}

/**
 * Initialize vehicle state management
 * Subscribe to API events and start animation loop
 */
export function initVehicles(apiEventsTarget) {
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

    // Start animation loop
    requestAnimationFrame(animate);
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
