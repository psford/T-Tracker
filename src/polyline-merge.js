// src/polyline-merge.js
// Pure function for deciding whether two polylines should be merged.
// No Leaflet dependency — works in Node.js (prebake script) and browser.

import { haversineDistance } from './vehicle-math.js';

const SAMPLES = 30;

/**
 * Decide whether two polylines represent the same physical path.
 *
 * Samples SAMPLES points along coords1 at equal arc-length intervals.
 * For each sample, finds the nearest vertex in coords2.
 * Returns true if the median of those distances is ≤ thresholdMeters.
 *
 * @param {Array<{lat: number, lng: number}>} coords1
 * @param {Array<{lat: number, lng: number}>} coords2
 * @param {number} thresholdMeters - default 50
 * @returns {boolean}
 */
export function shouldMergePolylines(coords1, coords2, thresholdMeters = 50) {
    // Build cumulative arc lengths along coords1
    const arcLengths = [0];
    for (let i = 1; i < coords1.length; i++) {
        arcLengths.push(arcLengths[i - 1] + haversineDistance(
            coords1[i - 1].lat, coords1[i - 1].lng,
            coords1[i].lat, coords1[i].lng
        ));
    }
    const totalLen = arcLengths[arcLengths.length - 1];

    const distances = [];
    for (let i = 0; i < SAMPLES; i++) {
        const target = (i / (SAMPLES - 1)) * totalLen;

        // Binary search for segment containing target distance
        let lo = 0, hi = arcLengths.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (arcLengths[mid] <= target) lo = mid; else hi = mid;
        }
        const frac = arcLengths[hi] > arcLengths[lo]
            ? (target - arcLengths[lo]) / (arcLengths[hi] - arcLengths[lo])
            : 0;
        const samplePt = {
            lat: coords1[lo].lat + frac * (coords1[hi].lat - coords1[lo].lat),
            lng: coords1[lo].lng + frac * (coords1[hi].lng - coords1[lo].lng),
        };

        // Distance to nearest vertex in coords2
        let minDist = Infinity;
        for (const v of coords2) {
            const d = haversineDistance(samplePt.lat, samplePt.lng, v.lat, v.lng);
            if (d < minDist) minDist = d;
        }
        distances.push(minDist);
    }

    distances.sort((a, b) => a - b);
    const median = distances[Math.floor(SAMPLES / 2)];
    return median <= thresholdMeters;
}
