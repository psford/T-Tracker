// scripts/fetch-mbta-data.mjs
// Prebake script: fetches MBTA static data and writes data/mbta-static.json.
// Usage: MBTA_API_KEY=<key> node scripts/fetch-mbta-data.mjs
// Requires Node 18+ (native fetch).

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { decodePolyline } from '../src/polyline.js';
import { shouldMergePolylines, mergePolylineSegments } from '../src/polyline-merge.js';
import { haversineDistance } from '../src/vehicle-math.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_KEY = process.env.MBTA_API_KEY;
if (!API_KEY) {
    console.error('Error: MBTA_API_KEY environment variable is required');
    process.exit(1);
}

const BASE_URL = 'https://api-v3.mbta.com';
const STOP_PROXIMITY_THRESHOLD = 150; // meters
const MERGE_THRESHOLD = 50;           // meters

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`MBTA API error: ${res.status} ${res.statusText}\n  URL: ${url}`);
    }
    return res.json();
}

const SEGMENT_MERGE_THRESHOLD = 20; // meters — per-vertex threshold for segment-by-segment merge

const RAIL_DEDUP_MAX_DIST = 20;  // meters — max nearest-vertex distance for two polylines to be "same path"
const RAIL_MERGE_THRESHOLD = 40; // meters — segment merge threshold for shared rail corridors

/**
 * Connect dangling branch endpoints back to the main chain.
 *
 * After mergePolylineSegments, branch segments (terminus loops, one-way streets)
 * may start at a junction on the main chain but end at a point that doesn't
 * connect back. This function finds such dangling endpoints and appends the
 * nearest vertex from another segment to close the gap.
 *
 * @param {Array<Array<{lat: number, lng: number}>>} segments - Merged segments
 * @returns {Array<Array<{lat: number, lng: number}>>} Segments with branches reconnected
 */
function connectBranchEndpoints(segments) {
    if (segments.length <= 1) return segments;

    const CONNECT_THRESHOLD = 30; // max gap (meters) that counts as "already connected"

    // Build a set of all segment start/end points for junction detection
    const endpoints = [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.length < 2) continue;
        endpoints.push({ segIdx: i, end: 'start', lat: seg[0].lat, lng: seg[0].lng });
        endpoints.push({ segIdx: i, end: 'end', lat: seg[seg.length - 1].lat, lng: seg[seg.length - 1].lng });
    }

    // For each segment endpoint, check if it's near any OTHER segment's start/end
    // If not, it's dangling — find the nearest vertex on any other segment and connect
    const result = segments.map(s => [...s]);

    for (let i = 0; i < result.length; i++) {
        const seg = result[i];
        if (seg.length < 2) continue;

        // Check both start and end of this segment
        for (const checkEnd of ['start', 'end']) {
            const pt = checkEnd === 'start' ? seg[0] : seg[seg.length - 1];

            // Is this endpoint near any other segment's start or end?
            let nearestEndpointDist = Infinity;
            for (const ep of endpoints) {
                if (ep.segIdx === i) continue;
                const d = haversineDistance(pt.lat, pt.lng, ep.lat, ep.lng);
                if (d < nearestEndpointDist) nearestEndpointDist = d;
            }

            if (nearestEndpointDist <= CONNECT_THRESHOLD) continue; // already connected

            // Dangling! Find nearest vertex on any other segment
            let bestDist = Infinity;
            let bestVtx = null;
            for (let j = 0; j < result.length; j++) {
                if (j === i) continue;
                for (const v of result[j]) {
                    const d = haversineDistance(pt.lat, pt.lng, v.lat, v.lng);
                    if (d < bestDist) {
                        bestDist = d;
                        bestVtx = v;
                    }
                }
            }

            if (bestVtx && bestDist < 200) { // only connect if reasonably close
                if (checkEnd === 'start') {
                    result[i] = [{ lat: bestVtx.lat, lng: bestVtx.lng }, ...result[i]];
                } else {
                    result[i] = [...result[i], { lat: bestVtx.lat, lng: bestVtx.lng }];
                }
            }
        }
    }

    return result;
}

/**
 * Process rail polylines: (1) deduplicate inbound/outbound copies, then
 * (2) segment-merge remaining distinct polylines to combine shared corridors
 * while preserving branches and terminus loops.
 *
 * Dedup criterion: same start+end AND max sampled nearest-vertex < 20m.
 * After dedup, if 2+ polylines remain (e.g., Red Line Ashmont + Braintree),
 * segment-merge them: average where close (shared corridor, 15-25m apart),
 * keep separate where they diverge (actual branches, >40m).
 * Terminus loops (Green-E, 47m max) are preserved as separate segments.
 */
function processRailPolylines(polylines) {
    if (polylines.length <= 1) return polylines;

    // Orient all polylines to match the first one's direction
    const oriented = [polylines[0]];
    for (let i = 1; i < polylines.length; i++) {
        const p = polylines[i];
        const dSame = haversineDistance(oriented[0][0].lat, oriented[0][0].lng, p[0].lat, p[0].lng);
        const dFlip = haversineDistance(oriented[0][0].lat, oriented[0][0].lng, p[p.length - 1].lat, p[p.length - 1].lng);
        oriented.push(dFlip < dSame ? [...p].reverse() : p);
    }

    // Deduplicate: drop polylines that overlap with an existing one.
    // For same-start-same-end pairs (e.g., Green-E inbound/outbound),
    // extract the divergent terminus tail from the dropped polyline and
    // keep it as a separate short segment (preserves turnaround loops).
    const DIVERGE_THRESHOLD = 15; // meters — distance at which tracks are "divergent"
    const unique = [oriented[0]];
    for (let i = 1; i < oriented.length; i++) {
        // Check this polyline against ALL previously accepted unique entries,
        // not just oriented[0]. This catches inbound/outbound duplicates of
        // branches (e.g., Red has 2 Ashmont + 2 Braintree polylines).
        let matchedIdx = -1;
        for (let u = 0; u < unique.length; u++) {
            const ref = unique[u];
            const dStart = haversineDistance(oriented[i][0].lat, oriented[i][0].lng, ref[0].lat, ref[0].lng);
            const dEnd = haversineDistance(
                oriented[i][oriented[i].length - 1].lat, oriented[i][oriented[i].length - 1].lng,
                ref[ref.length - 1].lat, ref[ref.length - 1].lng
            );
            // Same start AND same end → inbound/outbound pair candidate
            if (dStart <= 100 && dEnd <= 100 && shouldMergePolylines(oriented[i], ref)) {
                matchedIdx = u;
                break;
            }
        }

        if (matchedIdx === -1) {
            // No match — this is a distinct branch. Keep it.
            unique.push(oriented[i]);
            continue;
        }

        // This is a duplicate — drop it, but extract divergent terminus loops.
        const kept = unique[matchedIdx];
        const dropped = oriented[i];

        // Compute per-vertex distance to nearest point on kept polyline
        const dists = dropped.map(v => {
            let minDist = Infinity;
            for (let k = 0; k < kept.length; k++) {
                const d = haversineDistance(v.lat, v.lng, kept[k].lat, kept[k].lng);
                if (d < minDist) minDist = d;
            }
            return minDist;
        });

        // Find divergent runs near the terminus that form LOOPS — tracks that
        // diverge from the main line and then reconverge. This preserves turnaround
        // loops (e.g., Heath St) while ignoring parallel-track junction divergences.
        // A loop run must: (a) be in the tail zone (last/first 10%), (b) have both
        // endpoints close to the kept polyline (< DIVERGE_THRESHOLD), meaning the
        // tracks diverge and come back — not just shift to a parallel track.
        const tailZone = Math.max(10, Math.floor(dropped.length * 0.1));

        function extractLoopRuns(startIdx, endIdx) {
            let runStart = -1;
            for (let j = startIdx; j <= endIdx; j++) {
                const isDivergent = j < dropped.length && dists[j] > DIVERGE_THRESHOLD;
                if (isDivergent && runStart === -1) {
                    runStart = j;
                } else if (!isDivergent && runStart !== -1) {
                    // Run ended — check if it's a loop (both endpoints close to kept)
                    const preIdx = Math.max(0, runStart - 1);
                    const postIdx = Math.min(dropped.length - 1, j);
                    const preClose = dists[preIdx] <= DIVERGE_THRESHOLD;
                    const postClose = dists[postIdx] <= DIVERGE_THRESHOLD;
                    if (preClose && postClose) {
                        const maxDiv = Math.max(...dists.slice(runStart, j));
                        // Only keep small turnaround loops (< 50m divergence).
                        // Larger divergences are route alignment differences, not loops.
                        if (maxDiv < 50) {
                            const tail = dropped.slice(preIdx, postIdx + 1);
                            if (tail.length >= 4) {
                                unique.push(tail);
                            }
                        }
                    }
                    runStart = -1;
                }
            }
        }

        // Check end tail zone
        extractLoopRuns(dropped.length - tailZone, dropped.length);
        // Check start tail zone
        extractLoopRuns(0, tailZone);
    }

    if (unique.length <= 1) return unique;

    // Merge remaining distinct polylines (branches) pairwise to combine shared corridor.
    // Then concatenate all junction fragments into their neighboring segments so
    // no short orphan segments remain.
    let merged = [unique[0]];
    for (let i = 1; i < unique.length; i++) {
        const c2 = unique[i];
        if (c2.length === 0) continue;

        // Short segments (< 20 vertices) are terminus tails — keep as-is
        if (c2.length < 20) {
            merged.push(c2);
            continue;
        }

        const segments = mergePolylineSegments(merged[0], c2, RAIL_MERGE_THRESHOLD);
        merged.splice(0, 1, ...segments);
    }

    // Absorb short junction fragments into adjacent longer segments.
    // mergePolylineSegments creates tiny segments at branch points (e.g., JFK/UMass)
    // that render as orphan line fragments. Find each short segment and append it
    // to whichever neighboring long segment it connects to.
    const MIN_SEG = 15;
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < merged.length; i++) {
            if (merged[i].length >= MIN_SEG) continue;
            const short = merged[i];
            const shortStart = short[0];
            const shortEnd = short[short.length - 1];

            // Try to attach to a neighboring long segment
            for (let j = 0; j < merged.length; j++) {
                if (j === i || merged[j].length < MIN_SEG) continue;
                const long = merged[j];
                const longStart = long[0];
                const longEnd = long[long.length - 1];

                // Short's start matches long's end → append short to end of long
                if (haversineDistance(shortStart.lat, shortStart.lng, longEnd.lat, longEnd.lng) < 50) {
                    merged[j] = long.concat(short.slice(1));
                    merged.splice(i, 1);
                    changed = true;
                    break;
                }
                // Short's end matches long's start → prepend short to start of long
                if (haversineDistance(shortEnd.lat, shortEnd.lng, longStart.lat, longStart.lng) < 50) {
                    merged[j] = short.concat(long.slice(1));
                    merged.splice(i, 1);
                    changed = true;
                    break;
                }
            }
            if (changed) break;
        }
    }

    return merged;
}

async function main() {
    // ── Fetch routes with route_patterns and shapes ──────────────────────────
    console.log('Fetching routes and shapes...');
    const routesUrl = `${BASE_URL}/routes?filter[type]=0,1,2,3,4` +
        `&include=route_patterns.representative_trip.shape&api_key=${API_KEY}`;
    const routesData = await fetchJSON(routesUrl);

    // Index included resources by type
    const shapeMap  = new Map(); // shapeId → encoded polyline string
    const patternMap = new Map(); // patternId → pattern resource
    const tripMap   = new Map(); // tripId → trip resource

    for (const item of routesData.included || []) {
        if (item.type === 'shape')         shapeMap.set(item.id, item.attributes.polyline);
        else if (item.type === 'route_pattern') patternMap.set(item.id, item);
        else if (item.type === 'trip')     tripMap.set(item.id, item);
    }

    const routes = [];

    for (const route of routesData.data) {
        const attr = route.attributes;
        const routeId = route.id;

        // Collect unique decoded polylines from typicality=1 patterns
        const polylines = [];
        const polylineDirections = []; // direction_id for each polyline (0 or 1)
        const seenShapeIds = new Set();

        for (const patRel of route.relationships?.route_patterns?.data || []) {
            const pattern = patternMap.get(patRel.id);
            if (!pattern || pattern.attributes.typicality !== 1) continue;

            const tripRel = pattern.relationships?.representative_trip?.data;
            if (!tripRel) continue;
            const trip = tripMap.get(tripRel.id);
            if (!trip) continue;

            const shapeRel = trip.relationships?.shape?.data;
            if (!shapeRel) continue;

            const shapeId = shapeRel.id;
            if (seenShapeIds.has(shapeId)) continue;
            seenShapeIds.add(shapeId);

            const encoded = shapeMap.get(shapeId);
            if (!encoded) continue;

            // decodePolyline returns [[lat, lng], ...]; convert to {lat, lng}
            const coords = decodePolyline(encoded).map(([lat, lng]) => ({ lat, lng }));
            polylines.push(coords);
            polylineDirections.push(pattern.attributes.direction_id);
        }

        // Rail (types 0, 1): deduplicate inbound/outbound (same physical track), then split
        // branching routes at their divergence point. This gives one trunk polyline plus separate
        // branch tails (e.g., Red Line → trunk + Ashmont + Braintree). Terminus loops (Green-E
        // Heath St) are preserved because both directions trace the same loop.
        //
        // Bus/CR/Ferry (types 2, 3, 4): segment-by-segment merge. Bus inbound/outbound can be
        // 10-15m apart on the same street (visibly doubled at zoom 17+), so we average where
        // paths share the same street and keep separate where they diverge to different streets.
        const isRail = (attr.type === 0 || attr.type === 1);
        let mergedPolylines;

        if (isRail) {
            mergedPolylines = processRailPolylines(polylines);
        } else {
            // Non-rail: segment-by-segment merge for polylines on the same physical path.
            // Averages where paths share the same street, keeps separate where they diverge.
            mergedPolylines = polylines.length > 0 ? [polylines[0]] : [];
            for (let i = 1; i < polylines.length; i++) {
                const c2raw = polylines[i];
                if (c2raw.length === 0) continue;

                let didMerge = false;
                for (let j = 0; j < mergedPolylines.length; j++) {
                    const existing = mergedPolylines[j];
                    if (existing.length === 0) continue;

                    // Orient c2 in same direction as existing
                    const dSame = haversineDistance(existing[0].lat, existing[0].lng, c2raw[0].lat, c2raw[0].lng);
                    const dFlip = haversineDistance(existing[0].lat, existing[0].lng, c2raw[c2raw.length - 1].lat, c2raw[c2raw.length - 1].lng);
                    const c2 = dFlip < dSame ? [...c2raw].reverse() : c2raw;

                    if (shouldMergePolylines(existing, c2, MERGE_THRESHOLD)) {
                        let segments = mergePolylineSegments(existing, c2, SEGMENT_MERGE_THRESHOLD);
                        // Fix dangling branch endpoints: connect branch segment ends
                        // back to the nearest point on the main chain so loops don't
                        // dead-end visually.
                        segments = connectBranchEndpoints(segments);
                        mergedPolylines.splice(j, 1, ...segments);
                        didMerge = true;
                        break;
                    }
                }
                if (!didMerge) {
                    mergedPolylines.push(c2raw);
                }
            }

        }

        // Store as array of [[lat, lng], ...] arrays — one per branch
        const polylinesArr = mergedPolylines.map(pl => pl.map(p => [p.lat, p.lng]));

        // Track which directions have typicality=1 patterns (for direction classification)
        const hasDir0 = polylineDirections.includes(0);
        const hasDir1 = polylineDirections.includes(1);

        routes.push({
            id: routeId,
            color: `#${attr.color || '000000'}`,
            shortName: attr.short_name || '',
            longName: attr.long_name || '',
            type: attr.type,
            directionNames: attr.direction_names || [],
            directionDestinations: attr.direction_destinations || [],
            polylines: polylinesArr,
            _hasBothDirections: hasDir0 && hasDir1,
        });
    }

    console.log(`  ${routes.length} routes processed`);

    // ── Fetch all stops ───────────────────────────────────────────────────────
    console.log('Fetching all stops...');
    const stopsUrl = `${BASE_URL}/stops?filter[route_type]=0,1,2,3,4&api_key=${API_KEY}`;
    const stopsData = await fetchJSON(stopsUrl);

    const stops = {};
    for (const stop of stopsData.data) {
        const parentRel = stop.relationships?.parent_station?.data;
        stops[stop.id] = {
            id: stop.id,
            name: stop.attributes.name,
            lat: stop.attributes.latitude,
            lng: stop.attributes.longitude,
            parentStopId: parentRel ? parentRel.id : null,
        };
    }
    console.log(`  ${Object.keys(stops).length} stops`);

    // ── Fetch per-route stop lists with 150m proximity filter ─────────────────
    console.log(`Fetching route-stop associations (${routes.length} routes)...`);
    const routeStops = {};

    for (const route of routes) {
        process.stdout.write(`  ${route.id}... `);
        const url = `${BASE_URL}/stops?filter[route]=${route.id}&api_key=${API_KEY}`;
        const data = await fetchJSON(url);

        // Flatten all branch polylines into one list of vertices for proximity check
        const polylineCoords = route.polylines.flatMap(pl => pl.map(([lat, lng]) => ({ lat, lng })));
        const filteredIds = [];

        for (const stop of data.data) {
            const stopLat = stop.attributes.latitude;
            const stopLng = stop.attributes.longitude;

            // Stops for routes with no polyline are included unconditionally
            if (polylineCoords.length === 0) {
                filteredIds.push(stop.id);
                continue;
            }

            // Find nearest polyline vertex (across all branches)
            let minDist = Infinity;
            for (const v of polylineCoords) {
                const d = haversineDistance(stopLat, stopLng, v.lat, v.lng);
                if (d < minDist) minDist = d;
            }

            if (minDist <= STOP_PROXIMITY_THRESHOLD) {
                filteredIds.push(stop.id);
                // Add to global stops map if not already present
                if (!stops[stop.id]) {
                    const parentRel = stop.relationships?.parent_station?.data;
                    stops[stop.id] = {
                        id: stop.id,
                        name: stop.attributes.name,
                        lat: stopLat,
                        lng: stopLng,
                        parentStopId: parentRel ? parentRel.id : null,
                    };
                }
            }
        }

        routeStops[route.id] = filteredIds;
        console.log(`${filteredIds.length} stops`);
    }

    // ── Classify stop direction availability via per-direction stop lists ─────
    // For routes with both directions, fetch the stop list for each direction from
    // the MBTA API and compare. If a stop (by parent station) appears in both
    // directions, it's shared → show both direction buttons. If it only appears
    // in one direction, it's direction-specific → show only that button.
    console.log('Classifying stop direction availability...');
    const routeStopDirections = {};

    for (const route of routes) {
        if (!route._hasBothDirections) continue;

        process.stdout.write(`  ${route.id}... `);

        // Fetch stops served in each direction
        const [dir0Data, dir1Data] = await Promise.all([
            fetchJSON(`${BASE_URL}/stops?filter[route]=${route.id}&filter[direction_id]=0&api_key=${API_KEY}`),
            fetchJSON(`${BASE_URL}/stops?filter[route]=${route.id}&filter[direction_id]=1&api_key=${API_KEY}`),
        ]);

        // Build sets of stop IDs per direction, normalized to parent station ID
        const normalize = (stopId) => stops[stopId]?.parentStopId || stopId;

        const dir0Stops = new Set(dir0Data.data.map(s => s.id));
        const dir1Stops = new Set(dir1Data.data.map(s => s.id));

        // Also build parent-station-level sets for comparison
        const dir0Parents = new Set(dir0Data.data.map(s => normalize(s.id)));
        const dir1Parents = new Set(dir1Data.data.map(s => normalize(s.id)));

        const dirMap = {};
        let hasDirectionOnly = false;

        // Classify each stop on this route
        for (const stopId of (routeStops[route.id] || [])) {
            const parentId = normalize(stopId);

            // Check if this stop's parent station appears in both directions
            const inDir0 = dir0Parents.has(parentId) || dir0Stops.has(stopId);
            const inDir1 = dir1Parents.has(parentId) || dir1Stops.has(stopId);

            if (inDir0 && !inDir1) {
                dirMap[stopId] = 0;
                hasDirectionOnly = true;
            } else if (inDir1 && !inDir0) {
                dirMap[stopId] = 1;
                hasDirectionOnly = true;
            }
            // In both directions (or neither — shouldn't happen) → no entry → both buttons
        }

        if (hasDirectionOnly) {
            routeStopDirections[route.id] = dirMap;
            console.log(`${Object.keys(dirMap).length} direction-specific`);
        } else {
            console.log('all shared');
        }
    }
    console.log(`  ${Object.keys(routeStopDirections).length} routes with direction-specific stops`);

    // Clean up temporary fields (not needed in output)
    for (const route of routes) {
        delete route._hasBothDirections;
    }

    // ── Write output ──────────────────────────────────────────────────────────
    const output = {
        generatedAt: Math.floor(Date.now() / 1000),
        routes,
        stops,
        routeStops,
        routeStopDirections,
    };

    const dataDir = join(__dirname, '..', 'data');
    mkdirSync(dataDir, { recursive: true });
    const outputPath = join(dataDir, 'mbta-static.json');
    writeFileSync(outputPath, JSON.stringify(output)); // compact — machine-consumed, not human-read

    console.log(`\nWrote ${outputPath}`);
    console.log(`  Routes:      ${routes.length}`);
    console.log(`  Stops:       ${Object.keys(stops).length}`);
    console.log(`  Route-stops: ${Object.keys(routeStops).length}`);
}

main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
