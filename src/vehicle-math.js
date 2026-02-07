// src/vehicle-math.js — Pure math functions for vehicle animation
// Extracted for testability and reusability

/**
 * Linear interpolation: a + (b - a) * t
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Easing function: ease-out-cubic
 * 1 - (1 - t)^3
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Angle interpolation with shortest arc wrapping
 * Handles 359° to 1° = 2° rotation (not 358°)
 */
export function lerpAngle(a, b, t) {
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

    // Interpolate along shortest arc and normalize result to [0, 360)
    const result = (a + delta * t) % 360;
    return result < 0 ? result + 360 : result;
}

/**
 * Haversine distance in meters between two lat/lng coordinates
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
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
