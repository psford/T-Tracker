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

/**
 * Darkens a hex color by reducing each RGB channel.
 * @param {string} hex — hex color string (e.g., '#DA291C')
 * @param {number} amount — darkening factor (0-1, where 0.15 = 15% darker)
 * @returns {string} — darkened hex color string
 */
export function darkenHexColor(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const darken = (c) => Math.round(c * (1 - amount));
    return `#${darken(r).toString(16).padStart(2, '0')}${darken(g).toString(16).padStart(2, '0')}${darken(b).toString(16).padStart(2, '0')}`;
}

/**
 * Converts bearing (compass direction) to CSS transform values for vehicle icons.
 * Icons are drawn facing right (east = 90 degrees).
 * Vehicles heading left (180-360°) are flipped horizontally so wheels remain on bottom.
 * @param {number|null|undefined} bearing — bearing in degrees (0=north, 90=east, 180=south, 270=west)
 * @returns {{ rotate: number, scaleX: number }} — CSS transform values (rotate in degrees, scaleX is 1 or -1)
 */
export function bearingToTransform(bearing) {
    // Default to 90 (facing right/east) if bearing is null or undefined
    if (bearing === null || bearing === undefined) {
        return { rotate: 0, scaleX: 1 };
    }

    // Normalize bearing to [0, 360)
    let normalizedBearing = ((bearing % 360) + 360) % 360;

    // For bearings 0-180 (heading rightward/upward): rotate only, no flip
    if (normalizedBearing <= 180) {
        return {
            rotate: normalizedBearing - 90,
            scaleX: 1
        };
    }

    // For bearings 180-360 (heading leftward/downward): flip horizontally + adjusted rotation
    // scaleX = -1 flips the icon, rotate = -(bearing - 270) applies rotation in flipped space
    // Use || 0 to convert -0 to +0 for consistency
    return {
        rotate: -(normalizedBearing - 270) || 0,
        scaleX: -1
    };
}
