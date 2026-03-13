// scripts/fetch-mbta-data.mjs
// Prebake script: fetches MBTA static data and writes data/mbta-static.json.
// Usage: MBTA_API_KEY=<key> node scripts/fetch-mbta-data.mjs
// Requires Node 18+ (native fetch).

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { decodePolyline } from '../src/polyline.js';
import { shouldMergePolylines } from '../src/polyline-merge.js';
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

// Parametric interpolation: returns {lat, lng} at parameter t ∈ [0,1] along coords ({lat,lng}[]).
function sampleAtT(coords, t) {
    if (coords.length === 1) return coords[0];
    const idx = t * (coords.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, coords.length - 1);
    const frac = idx - lo;
    return {
        lat: coords[lo].lat + frac * (coords[hi].lat - coords[lo].lat),
        lng: coords[lo].lng + frac * (coords[hi].lng - coords[lo].lng),
    };
}

// Average two {lat,lng} polylines by sampling at equal parametric intervals.
function averagePolylines(c1, c2, numSamples = 100) {
    const result = [];
    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        const p1 = sampleAtT(c1, t);
        const p2 = sampleAtT(c2, t);
        result.push({ lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 });
    }
    return result;
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
        }

        // Merge polylines sequentially using shouldMergePolylines (extracted in Phase 1).
        // This is intentionally more general than map.js's browser path, which only handles
        // exactly 2 polylines (the two directions of a route). The prebake handles N polylines
        // iteratively, producing a better single merged line for routes with 3+ typicality=1 shapes.
        // Rail types (0, 1) always merge (same physical track). Others merge only when
        // arc-length nearest-vertex check passes. Orient c2 in the same direction as merged
        // before averaging — parametric averaging of opposite-direction lines produces zigzag.
        //
        // Note: The AC2.4 fallback path uses map.js's loadRoutes() which applies the original
        // 2-polyline browser behavior. This is acceptable: the fallback is a degraded mode.
        let merged = polylines[0] || [];
        for (let i = 1; i < polylines.length; i++) {
            const c2raw = polylines[i];
            if (merged.length === 0 || c2raw.length === 0) continue;

            // Orient c2 in same direction as merged (compare start-to-start vs start-to-end)
            const dSame = haversineDistance(merged[0].lat, merged[0].lng, c2raw[0].lat, c2raw[0].lng);
            const dFlip = haversineDistance(merged[0].lat, merged[0].lng, c2raw[c2raw.length - 1].lat, c2raw[c2raw.length - 1].lng);
            const c2 = dFlip < dSame ? [...c2raw].reverse() : c2raw;

            // Rail (type 0/1) always merges; others use threshold check
            const doMerge = (attr.type === 0 || attr.type === 1)
                || shouldMergePolylines(merged, c2, MERGE_THRESHOLD);

            if (doMerge) {
                merged = averagePolylines(merged, c2);
            }
            // Non-merging shapes are skipped — store one representative line per route
        }

        // Store as [[lat, lng], ...] per design schema
        const polylineArr = merged.map(p => [p.lat, p.lng]);

        routes.push({
            id: routeId,
            color: `#${attr.color || '000000'}`,
            shortName: attr.short_name || '',
            longName: attr.long_name || '',
            type: attr.type,
            directionNames: attr.direction_names || [],
            directionDestinations: attr.direction_destinations || [],
            polyline: polylineArr,
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

        const polylineCoords = route.polyline.map(([lat, lng]) => ({ lat, lng }));
        const filteredIds = [];

        for (const stop of data.data) {
            const stopLat = stop.attributes.latitude;
            const stopLng = stop.attributes.longitude;

            // Stops for routes with no polyline are included unconditionally
            if (polylineCoords.length === 0) {
                filteredIds.push(stop.id);
                continue;
            }

            // Find nearest polyline vertex
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

    // ── Write output ──────────────────────────────────────────────────────────
    const output = {
        generatedAt: Math.floor(Date.now() / 1000),
        routes,
        stops,
        routeStops,
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
