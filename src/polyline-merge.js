// src/polyline-merge.js
// Pure function for deciding whether two polylines should be merged.
// No Leaflet dependency — works in Node.js (prebake script) and browser.

import { haversineDistance } from './vehicle-math.js';

const SAMPLES = 30;
const SEGMENT_MIN_VERTICES = 2;
const MIN_DIVERGENT_RUN = 3; // minimum consecutive "far" vertices to be treated as divergent

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

/**
 * Smooth a boolean classification array in-place: reclassify short "far" (false) runs
 * as "close" (true) to prevent noise from vertices oscillating near the threshold.
 * A "far" run must have at least MIN_DIVERGENT_RUN consecutive vertices to be kept.
 * @param {boolean[]} classification - Array of close (true) / far (false) values, modified in-place
 */
function smoothClassification(classification) {
    let i = 0;
    while (i < classification.length) {
        if (!classification[i]) {
            // Found start of a "far" run — measure its length
            const start = i;
            while (i < classification.length && !classification[i]) i++;
            const runLen = i - start;
            // If too short, reclassify as "close"
            if (runLen < MIN_DIVERGENT_RUN) {
                for (let k = start; k < i; k++) classification[k] = true;
            }
        } else {
            i++;
        }
    }
}

/**
 * Merge two polylines segment-by-segment based on physical proximity.
 * Where vertices are close (same street/track), average them into one line.
 * Where vertices diverge (different streets, terminus loops), keep both paths.
 *
 * @param {Array<{lat: number, lng: number}>} coordsA - First polyline
 * @param {Array<{lat: number, lng: number}>} coordsB - Second polyline (oriented same direction as A)
 * @param {number} threshold - Max distance in meters for "close" classification (default 20)
 * @returns {Array<Array<{lat: number, lng: number}>>} - Array of polyline segments
 */
export function mergePolylineSegments(coordsA, coordsB, threshold = 20) {
    // For each vertex in A, find nearest vertex in B and distance
    const nearestB = coordsA.map(a => {
        let minDist = Infinity, minIdx = -1;
        for (let j = 0; j < coordsB.length; j++) {
            const d = haversineDistance(a.lat, a.lng, coordsB[j].lat, coordsB[j].lng);
            if (d < minDist) { minDist = d; minIdx = j; }
        }
        return { dist: minDist, idx: minIdx };
    });

    // For each vertex in B, find nearest vertex in A and distance
    const nearestA = coordsB.map(b => {
        let minDist = Infinity, minIdx = -1;
        for (let i = 0; i < coordsA.length; i++) {
            const d = haversineDistance(b.lat, b.lng, coordsA[i].lat, coordsA[i].lng);
            if (d < minDist) { minDist = d; minIdx = i; }
        }
        return { dist: minDist, idx: minIdx };
    });

    // Classify A vertices: close (< threshold) or far (>= threshold)
    const aClose = coordsA.map((_, i) => nearestB[i].dist < threshold);
    const bClose = coordsB.map((_, j) => nearestA[j].dist < threshold);

    // Smooth classifications: short "far" runs (< MIN_DIVERGENT_RUN) are reclassified
    // as "close" to prevent noise from vertices oscillating near the threshold boundary.
    smoothClassification(aClose);
    smoothClassification(bClose);

    // Build segments from A: merged (close) and A-only (far)
    const segments = [];
    let current = [];
    let currentType = null; // 'merged' or 'a-only'

    for (let i = 0; i < coordsA.length; i++) {
        const type = aClose[i] ? 'merged' : 'a-only';

        if (type !== currentType && current.length > 0) {
            segments.push(current);
            current = [];
        }
        currentType = type;

        if (aClose[i]) {
            // Average with nearest B vertex
            const b = coordsB[nearestB[i].idx];
            current.push({
                lat: (coordsA[i].lat + b.lat) / 2,
                lng: (coordsA[i].lng + b.lng) / 2,
            });
        } else {
            current.push({ lat: coordsA[i].lat, lng: coordsA[i].lng });
        }
    }
    if (current.length > 0) segments.push(current);

    // Build B-only segments (B vertices that are far from A)
    let bOnly = [];
    for (let j = 0; j < coordsB.length; j++) {
        if (!bClose[j]) {
            bOnly.push({ lat: coordsB[j].lat, lng: coordsB[j].lng });
        } else {
            if (bOnly.length > 0) {
                segments.push(bOnly);
                bOnly = [];
            }
        }
    }
    if (bOnly.length > 0) segments.push(bOnly);

    // Filter out segments too short to form a line
    return segments.filter(s => s.length >= SEGMENT_MIN_VERTICES);
}
