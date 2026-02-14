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
 * Calculates the compass bearing (0-360 degrees) from one lat/lng point to another.
 * Returns the direction of travel along the great circle route.
 * @param {number} lat1 — starting latitude
 * @param {number} lon1 — starting longitude
 * @param {number} lat2 — ending latitude
 * @param {number} lon2 — ending longitude
 * @returns {number} — bearing in degrees (0=north, 90=east, 180=south, 270=west)
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;

    const dLon = (lon2 - lon1) * toRad;
    const lat1Rad = lat1 * toRad;
    const lat2Rad = lat2 * toRad;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    const bearing = Math.atan2(y, x) * toDeg;
    // Normalize to 0-360
    return (bearing + 360) % 360;
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
 * Find the nearest point on line segment AB to point P.
 * Uses projected parameter t clamped to [0,1] so the result always lies on the segment.
 * Coordinates are in degrees (lat/lng). Distance comparison uses squared degree difference
 * (sufficient for nearest-point ranking at city scale).
 *
 * @param {number} pLat — point latitude
 * @param {number} pLng — point longitude
 * @param {number} aLat — segment start latitude
 * @param {number} aLng — segment start longitude
 * @param {number} bLat — segment end latitude
 * @param {number} bLng — segment end longitude
 * @returns {{ lat: number, lng: number, distSq: number }} — nearest point and squared distance
 */
export function nearestPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
    const dx = bLng - aLng;
    const dy = bLat - aLat;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        // Segment is a point
        const dLat = pLat - aLat;
        const dLng = pLng - aLng;
        return { lat: aLat, lng: aLng, distSq: dLat * dLat + dLng * dLng };
    }

    // Project P onto line AB, clamped to [0, 1]
    let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const nearLat = aLat + t * dy;
    const nearLng = aLng + t * dx;
    const dLat = pLat - nearLat;
    const dLng = pLng - nearLng;

    return { lat: nearLat, lng: nearLng, distSq: dLat * dLat + dLng * dLng };
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
