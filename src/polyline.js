// src/polyline.js — Pure function for decoding Google-encoded polylines
// Extracted from map.js for testability

/**
 * Decodes a Google-encoded polyline string to an array of [lat, lng] coordinate pairs.
 * Implements the standard Google polyline encoding algorithm.
 *
 * @param {string} encoded — the encoded polyline string
 * @returns {Array<Array<number>>} — array of [lat, lng] coordinate pairs
 */
export function decodePolyline(encoded) {
    const coords = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let result = 0;
        let shift = 0;
        let byte;

        // Decode latitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
        lat += dlat;

        result = 0;
        shift = 0;

        // Decode longitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
        lng += dlng;

        coords.push([lat / 1e5, lng / 1e5]);
    }

    return coords;
}
