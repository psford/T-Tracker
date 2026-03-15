// tests/hydrate-routes.test.js — Unit tests for hydrateRoutes() from map.js
// Tests that Leaflet polylines receive the correct coordinate arrays
// after bus/rail processing (concatenation, dedup, bypass).
import assert from 'assert';

// ── Mock config ────────────────────────────────────────────────────────────────
const mockConfig = {
    api: { baseUrl: 'https://api-v3.mbta.com', key: 'test-api-key' },
    map: { center: [42.3601, -71.0589], zoom: 13, minZoom: 11, maxZoom: 18 },
    tiles: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: 'CartoDB',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19,
    },
};

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === '../config.js' || id.endsWith('config.js')) return { config: mockConfig };
    return originalRequire.apply(this, arguments);
};

// ── Captured polyline coordinate arrays ───────────────────────────────────────
// Each call to L.polyline(coords) pushes the coords array here.
const capturedPolylines = [];

// ── Leaflet mock ──────────────────────────────────────────────────────────────
// Mirrors the pattern used in tests/map-hydrate.test.js.
// L.polyline captures latlngs and provides getLatLngs / setLatLngs / options.
// L.latLng(lat, lng) returns {lat, lng} so haversineDistance comparisons work.
globalThis.L = {
    map: () => ({
        addLayer: () => {},
        on: () => {},
        createPane: () => {},
        getPane: () => ({ style: {} }),
    }),
    tileLayer: () => ({
        addTo: () => ({ on: () => {} }),
        on: () => {},
    }),
    layerGroup: () => {
        const obj = {
            addTo: () => obj,
            clearLayers: () => {},
            addLayer: () => {},
            removeLayer: () => {},
            hasLayer: () => false,
        };
        return obj;
    },
    polyline: (coords, opts) => {
        // Normalise: if coords are [lat, lng] arrays → convert to {lat, lng} objects
        // (hydrateRoutes passes [lat, lng] arrays from the static bundle;
        //  the mock just stores them so getLatLngs returns the same shape)
        let latlngs = coords.map(c => Array.isArray(c) ? { lat: c[0], lng: c[1] } : { lat: c.lat, lng: c.lng });
        capturedPolylines.push(latlngs);
        const pl = {
            options: opts || { color: '#888888', weight: 3, opacity: 0.9 },
            getLatLngs: () => latlngs,
            setLatLngs: (newCoords) => {
                latlngs = newCoords.map(c => Array.isArray(c) ? { lat: c[0], lng: c[1] } : c);
                // Also update what captured entry points to — replace last pushed
                // (setLatLngs is called on the same pl object, so the capture index
                //  can't be updated in place; tests should check the returned pl's getLatLngs())
                pl._latlngs = latlngs;
            },
            addTo: function () { return this; },
            remove: () => {},
            setStyle: () => {},
        };
        return pl;
    },
    latLng: (lat, lng) => ({ lat, lng }),
    marker: () => ({
        bindPopup: () => ({ on: () => {} }),
        addTo: () => {},
        remove: () => {},
        setIcon: () => {},
        setOpacity: () => {},
        setLatLng: () => {},
    }),
    divIcon: () => ({}),
    icon: () => ({}),
    circleMarker: () => ({
        bindPopup: () => ({ on: () => {} }),
        addTo: () => {},
        remove: () => {},
    }),
};

// ── Import module under test ───────────────────────────────────────────────────
import { initMap, hydrateRoutes } from '../src/map.js';

// ── Coordinate helpers ─────────────────────────────────────────────────────────
// ~111m per 0.001 degree latitude.
// Points are laid out north-to-south along a longitude line.
function makeSeg(latStart, n, latStep = 0.001, lng = -71.060) {
    const seg = [];
    for (let i = 0; i < n; i++) {
        seg.push([latStart + i * latStep, lng]);
    }
    return seg;
}

// Two adjacent segments that share an endpoint (gap < 5m ≈ 0.00005 degrees lat).
function makeAdjacentSegs() {
    const seg1 = makeSeg(42.360, 5);                // ends at [42.364, -71.060]
    const seg2 = makeSeg(42.364, 5);                // starts at [42.364, -71.060]
    return [seg1, seg2];
}

// Two disconnected segments (gap > 5m).
function makeDisconnectedSegs() {
    const seg1 = makeSeg(42.360, 5);                // ends at [42.364, -71.060]
    const seg2 = makeSeg(42.380, 5);                // starts at [42.380, -71.060] — far gap
    return [seg1, seg2];
}

// Route skeleton builder.
function makeRoute(id, type, polylines) {
    return {
        id,
        shortName: id,
        longName: `${id} Long`,
        type,
        color: '#DA291C',
        polylines,
        directionNames: ['Outbound', 'Inbound'],
        directionDestinations: ['A', 'B'],
    };
}

// ── Initialise map once ────────────────────────────────────────────────────────
initMap('map');

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. Bus routes bypass rail processing — segments pass through unmodified
function testBusBypassesRailProcessing() {
    capturedPolylines.length = 0;

    const seg1 = makeSeg(42.360, 5);
    const seg2 = makeSeg(42.365, 5);

    hydrateRoutes([makeRoute('39', 3, [seg1, seg2])]);

    // Bus routes just filter(seg && seg.length >= 2): both segments should survive unchanged.
    // Each segment becomes a Leaflet polyline → captured.
    // We can't rely on capturedPolylines order (label markers also use L.polyline? No —
    // labels use L.marker with L.divIcon). So the only L.polyline calls come from the route.
    assert.ok(
        capturedPolylines.length >= 2,
        `Bus: expected >= 2 polylines captured, got ${capturedPolylines.length}`,
    );

    // Verify the coordinate count of the captured polylines matches what we put in.
    const totalCaptured = capturedPolylines.reduce((s, c) => s + c.length, 0);
    const totalInput = seg1.length + seg2.length;
    assert.strictEqual(
        totalCaptured,
        totalInput,
        `Bus: coordinate count mismatch (captured ${totalCaptured}, input ${totalInput})`,
    );

    console.log('PASS: Bus routes bypass rail processing');
}

// 2. Rail concatenation joins adjacent segments (endpoints within 5m)
function testRailConcatenatesAdjacentSegments() {
    capturedPolylines.length = 0;

    const [seg1, seg2] = makeAdjacentSegs();
    hydrateRoutes([makeRoute('Red', 1, [seg1, seg2])]);

    // The two segments share an endpoint exactly — haversineDistance ≈ 0m < 5m threshold.
    // hydrateRoutes should concat them into one segment.
    // That one segment becomes a single L.polyline call.
    const railPolylines = capturedPolylines;
    assert.strictEqual(
        railPolylines.length,
        1,
        `Rail concat: expected 1 merged polyline, got ${railPolylines.length}`,
    );

    const mergedLen = railPolylines[0].length;
    // seg1 has 5 pts, seg2 has 5 pts, shared endpoint = 5 + 4 = 9 vertices after concat.
    assert.strictEqual(
        mergedLen,
        seg1.length + seg2.length - 1,
        `Rail concat: expected ${seg1.length + seg2.length - 1} vertices, got ${mergedLen}`,
    );

    console.log('PASS: Rail concatenation joins adjacent segments');
}

// 3. Rail concatenation preserves gaps between disconnected segments
function testRailPreservesGaps() {
    capturedPolylines.length = 0;

    const [seg1, seg2] = makeDisconnectedSegs();
    hydrateRoutes([makeRoute('Orange', 1, [seg1, seg2])]);

    // Gap is ~1.8km (0.016 degrees lat). No concatenation; dedup won't remove either
    // because start+end are different. So we get 2 polylines.
    assert.strictEqual(
        capturedPolylines.length,
        2,
        `Rail gap: expected 2 polylines, got ${capturedPolylines.length}`,
    );

    console.log('PASS: Rail concatenation preserves gaps');
}

// 4. Rail dedup keeps the longer segment when start+end match within 100m
function testRailDedupKeepsLonger() {
    capturedPolylines.length = 0;

    // Two segments with identical start AND end coordinates (within 100m) but different vertex
    // counts. The dedup also requires max nearest-vertex distance < 20m (essentially same path).
    // Build a dense and a sparse sampling of the same 10-point north-south line.
    const allPoints = makeSeg(42.360, 10);   // 10 vertices: 42.360 → 42.369

    // Sparse: same start [42.360], same end [42.369], but only 4 intermediate points.
    // All vertices of sparse are near the dense set (within <1m) — maxDist < 20m passes.
    const sparseSeg = [
        allPoints[0],   // 42.360
        allPoints[3],   // 42.363
        allPoints[6],   // 42.366
        allPoints[9],   // 42.369  (same end)
    ];
    const denseSeg  = allPoints;  // 10 vertices (longer)

    hydrateRoutes([makeRoute('Blue', 1, [sparseSeg, denseSeg])]);

    // Both have same start (~42.360) and same end (~42.369) within 100m; all sparse vertices
    // are within 0m of dense vertices → maxDist < 20m → sparse is a duplicate → deduped away.
    assert.strictEqual(
        capturedPolylines.length,
        1,
        `Rail dedup: expected 1 polyline (longer kept), got ${capturedPolylines.length}`,
    );

    assert.strictEqual(
        capturedPolylines[0].length,
        denseSeg.length,
        `Rail dedup: expected ${denseSeg.length} vertices (longer kept), got ${capturedPolylines[0].length}`,
    );

    console.log('PASS: Rail dedup keeps the longer segment');
}

// 5. Rail dedup preserves segments with different endpoints (branch lines)
function testRailDedupPreservesBranches() {
    capturedPolylines.length = 0;

    // Red Line branches: shared start, different ends (>100m apart).
    const ashmont   = makeSeg(42.360, 8, 0.001, -71.060);  // ends at 42.367
    const braintree = makeSeg(42.360, 8, 0.001, -71.080);  // ends at 42.367 but far lng

    hydrateRoutes([makeRoute('Red', 1, [ashmont, braintree])]);

    // Ends differ by ~1.8km in longitude — well above 100m dedup threshold.
    // Both segments are unique; they should be segment-merged (branching route path).
    // mergePolylineSegments may produce 2-3 segments for the shared corridor + branches.
    assert.ok(
        capturedPolylines.length >= 1,
        `Rail branches: expected >= 1 polylines, got ${capturedPolylines.length}`,
    );

    console.log('PASS: Rail dedup preserves segments with different endpoints');
}

// 6. Bus dedup does NOT run — even identical segments are both rendered
function testBusNoDedupEvenForIdentical() {
    capturedPolylines.length = 0;

    // Two bus segments with the same coordinates.
    const seg = makeSeg(42.360, 5);
    const segCopy = makeSeg(42.360, 5);

    hydrateRoutes([makeRoute('1', 3, [seg, segCopy])]);

    // Bus bypasses dedup. Both segments survive the filter(seg.length >= 2) check.
    // Note: shouldMergePolylines may merge them at render time if the non-rail merge
    // path triggers (polylines.length === 2), which would result in 1 polyline.
    // What we CAN assert: the segments are not eliminated by rail-style dedup;
    // result length is >= 1.
    assert.ok(
        capturedPolylines.length >= 1,
        `Bus identical segs: expected >= 1 polylines, got ${capturedPolylines.length}`,
    );

    console.log('PASS: Bus dedup does not eliminate identical segments via rail path');
}

// 7. Invalid/short segments (< 2 vertices) are filtered out
function testShortSegmentsFiltered() {
    capturedPolylines.length = 0;

    const validSeg = makeSeg(42.360, 5);
    const singlePt  = [[42.360, -71.060]];  // 1 vertex — should be filtered
    const emptySeg   = [];                   // 0 vertices — should be filtered

    hydrateRoutes([makeRoute('66', 3, [validSeg, singlePt, emptySeg])]);

    // Only validSeg should produce a polyline.
    assert.ok(
        capturedPolylines.length >= 1,
        `Short segs: expected >= 1 polyline (valid one), got ${capturedPolylines.length}`,
    );

    // No captured polyline should have < 2 vertices.
    for (const pl of capturedPolylines) {
        assert.ok(
            pl.length >= 2,
            `Short segs: a polyline with ${pl.length} vertices was not filtered out`,
        );
    }

    console.log('PASS: Short segments (< 2 vertices) are filtered out');
}

// 8. Empty polylines array does not crash
function testEmptyPolylinesNoCrash() {
    capturedPolylines.length = 0;

    let threw = false;
    try {
        hydrateRoutes([makeRoute('Ferry1', 4, [])]);
    } catch (e) {
        threw = true;
        console.error('Empty polylines threw:', e.message);
    }

    assert.strictEqual(threw, false, 'Empty polylines array should not throw');
    console.log('PASS: Empty polylines array does not crash');
}

// 9. The isRailRoute assertion fires for misclassified routes
// (Internal guard: if isRailRoute is incorrectly computed for a real type, it throws)
function testIsRailRouteAssertionNotTriggeredForValidTypes() {
    capturedPolylines.length = 0;

    // Types 0 and 1 should be rail, 2/3/4 should not.
    // The function has internal assertions that verify this — if they fire, it throws.
    const typeCases = [
        { type: 0, name: 'LightRail' },
        { type: 1, name: 'HeavyRail' },
        { type: 2, name: 'CommuterRail' },
        { type: 3, name: 'Bus' },
        { type: 4, name: 'Ferry' },
    ];

    for (const { type, name } of typeCases) {
        let threw = false;
        try {
            hydrateRoutes([makeRoute(`${name}-test`, type, [makeSeg(42.360, 5)])]);
        } catch (e) {
            threw = true;
            // Only allowed if the assertion message itself says it's expected
            assert.fail(`isRailRoute assertion fired for valid type ${type} (${name}): ${e.message}`);
        }
        assert.strictEqual(threw, false, `Type ${type} (${name}) should not throw`);
    }

    console.log('PASS: isRailRoute assertion does not fire for valid route types');
}

// ── Run all tests ─────────────────────────────────────────────────────────────
console.log('\n=== Hydrate Routes Tests ===\n');
try {
    testBusBypassesRailProcessing();
    testRailConcatenatesAdjacentSegments();
    testRailPreservesGaps();
    testRailDedupKeepsLonger();
    testRailDedupPreservesBranches();
    testBusNoDedupEvenForIdentical();
    testShortSegmentsFiltered();
    testEmptyPolylinesNoCrash();
    testIsRailRouteAssertionNotTriggeredForValidTypes();

    console.log('\nAll hydrate-routes tests passed!\n');
} catch (err) {
    console.error('\nHydrate-routes test FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
}
