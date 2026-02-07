// src/vehicles.js — Vehicle state management and animation loop
import { config } from '../config.js';
import { lerp, easeOutCubic, lerpAngle, haversineDistance } from './vehicle-math.js';

// Map<vehicleId, VehicleState>
const vehicles = new Map();

// Callbacks registered via onVehicleUpdate()
const updateCallbacks = [];

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
 * requestAnimationFrame loop — interpolates all vehicles
 */
function animate(timestamp) {
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
